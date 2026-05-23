#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { loadConfig } from "./config.mjs";
import { createLogger } from "./debug-log.mjs";

const cfg = loadConfig();
const { log, logError } = createLogger("code-recall");

function output(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function approve(msg) {
  const out = { decision: "approve" };
  if (msg) out.hookSpecificOutput = { hookEventName: "UserPromptSubmit", additionalContext: msg };
  output(out);
}

function findSemble() {
  // Absolute path → check directly via execFileSync test call
  if (cfg.semblePath.startsWith("/")) {
    try {
      execFileSync(cfg.semblePath, ["--help"], { stdio: "pipe", timeout: 5000 });
      return true;
    } catch { return false; }
  }
  try {
    execFileSync("which", [cfg.semblePath], { stdio: "pipe", timeout: 3000 });
    return true;
  } catch { return false; }
}

// Parse semble markdown output into structured chunks
// Format: ## N. file:startline-endline  [score=X.XXX]\n```\n...code...\n```
function parseSembleOutput(raw) {
  const chunks = [];
  const headerRe = /^## \d+\.\s+(\S+?)(?::(\d+)-(\d+))?\s+\[score=([\d.]+)\]/;
  const lines = raw.split("\n");
  let i = 0;
  while (i < lines.length) {
    const match = lines[i].match(headerRe);
    if (!match) { i++; continue; }
    const file = match[1];
    const startLine = match[2] ? parseInt(match[2], 10) : null;
    const endLine = match[3] ? parseInt(match[3], 10) : null;
    const score = parseFloat(match[4]);
    i++;
    // skip opening fence
    if (i < lines.length && lines[i].startsWith("```")) i++;
    const codeLines = [];
    while (i < lines.length && !lines[i].startsWith("```")) {
      codeLines.push(lines[i]);
      i++;
    }
    // skip closing fence
    if (i < lines.length && lines[i].startsWith("```")) i++;
    chunks.push({ file, startLine, endLine, score, code: codeLines.join("\n") });
  }
  return chunks;
}

function formatChunks(chunks) {
  if (chunks.length === 0) return null;
  const parts = chunks.map(c => {
    const loc = c.startLine ? `${c.file}:${c.startLine}-${c.endLine}` : c.file;
    return `### ${loc} (score: ${c.score.toFixed(3)})\n\`\`\`\n${c.code}\n\`\`\``;
  });
  return "<relevant-code>\nThe following code chunks from the current project may be relevant:\n" +
    parts.join("\n\n") +
    "\n</relevant-code>";
}

async function main() {
  let input;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    input = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    log("skip", { reason: "invalid stdin" });
    approve();
    return;
  }

  const userPrompt = (input.prompt || "").trim();
  log("start", { query: userPrompt.slice(0, 200), queryLength: userPrompt.length });

  if (!userPrompt || userPrompt.length < cfg.minQueryLength) {
    log("skip", { reason: "query too short" });
    approve();
    return;
  }

  if (!findSemble()) {
    log("skip", { reason: "semble not found", path: cfg.semblePath });
    approve();
    return;
  }

  const args = ["search", userPrompt, ".", "-k", String(cfg.topK)];
  if (cfg.includeTextFiles) args.push("--include-text-files");

  let raw;
  try {
    raw = execFileSync(cfg.semblePath, args, {
      encoding: "utf-8",
      timeout: cfg.timeout,
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    if (err.killed) {
      logError("timeout", { timeout: cfg.timeout });
    } else {
      logError("exec", err);
    }
    approve();
    return;
  }

  if (!raw || !raw.trim()) {
    log("skip", { reason: "empty semble output" });
    approve();
    return;
  }

  const chunks = parseSembleOutput(raw);
  log("parsed", { chunkCount: chunks.length, files: chunks.map(c => c.file) });

  if (chunks.length === 0) {
    log("skip", { reason: "no chunks parsed" });
    approve();
    return;
  }

  const block = formatChunks(chunks);
  approve(block);
}

main().catch((err) => { logError("uncaught", err); approve(); });
