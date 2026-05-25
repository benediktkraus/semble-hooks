#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { loadConfig } from "./config.mjs";
import { createLogger } from "./debug-log.mjs";
import {
  acquireLock,
  cooldownActive,
  describeTargets,
  limitedEnv,
  markCooldown,
  normalizeQuery,
  resolveSearchTargets,
} from "./safety.mjs";

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
      execFileSync(cfg.semblePath, ["--help"], { stdio: "pipe", timeout: 5000, env: limitedEnv() });
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
    const prefix = c.source ? `${c.source} :: ` : "";
    return `### ${prefix}${loc} (score: ${c.score.toFixed(3)})\n\`\`\`\n${c.code}\n\`\`\``;
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

  const rawPrompt = (input.prompt || "").trim();
  const userPrompt = normalizeQuery(rawPrompt, cfg.maxQueryChars);
  log("start", {
    query: userPrompt.slice(0, 200),
    queryLength: userPrompt.length,
    rawQueryLength: rawPrompt.length,
  });

  if (!cfg.enabled) {
    log("skip", { reason: "disabled" });
    approve();
    return;
  }

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

  const cwd = input.cwd || input.projectRoot || input.workspacePath || process.cwd();
  const resolved = resolveSearchTargets(cfg, cwd);
  log("targets", describeTargets(resolved));
  if (resolved.targets.length === 0) {
    log("skip", { reason: "no safe search targets", skipped: resolved.skipped });
    approve();
    return;
  }

  const allChunks = [];
  const perTargetK = Math.max(1, Math.ceil(cfg.topK / resolved.targets.length));
  for (const target of resolved.targets) {
    const cooldown = cooldownActive("recall", target.path, cfg.cooldownMs);
    if (cooldown.active) {
      log("skip_target", { reason: "cooldown", path: target.path, remainingMs: Math.ceil(cooldown.remainingMs) });
      continue;
    }

    const lock = acquireLock("recall", target.path, cfg.lockTtlMs);
    if (!lock.acquired) {
      log("skip_target", { reason: lock.reason, path: target.path });
      continue;
    }

    const args = ["search", userPrompt, target.path, "-k", String(perTargetK)];
    if (cfg.includeTextFiles) args.push("--include-text-files");

    let raw;
    try {
      log("exec", { path: target.path, timeout: cfg.timeout });
      markCooldown("recall", target.path);
      raw = execFileSync(cfg.semblePath, args, {
        encoding: "utf-8",
        timeout: cfg.timeout,
        cwd: target.cwd,
        env: limitedEnv(),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      if (err.killed || err.signal) {
        logError("timeout", { path: target.path, timeout: cfg.timeout, signal: err.signal });
      } else {
        logError("exec", err);
      }
      continue;
    } finally {
      lock.release();
    }

    if (!raw || !raw.trim()) {
      log("skip_target", { reason: "empty semble output", path: target.path });
      continue;
    }

    const chunks = parseSembleOutput(raw);
    log("parsed", { path: target.path, chunkCount: chunks.length, files: chunks.map(c => c.file) });
    for (const chunk of chunks) {
      chunk.source = resolved.targets.length > 1 ? target.path : "";
      allChunks.push(chunk);
    }
  }

  if (allChunks.length === 0) {
    log("skip", { reason: "no chunks parsed" });
    approve();
    return;
  }

  const block = formatChunks(allChunks.slice(0, cfg.topK));
  approve(block);
}

main().catch((err) => { logError("uncaught", err); approve(); });
