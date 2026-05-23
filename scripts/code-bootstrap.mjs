#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { loadConfig } from "./config.mjs";
import { createLogger } from "./debug-log.mjs";

const cfg = loadConfig();
const { log, logError } = createLogger("code-bootstrap");

function output(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function approve() {
  output({ decision: "approve" });
}

function findSemble() {
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

function getSembleVersion() {
  try {
    const out = execFileSync(cfg.semblePath, ["--help"], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return out.includes("semble") ? "detected" : "unknown";
  } catch {
    return "unknown";
  }
}

async function main() {
  // Consume stdin (hook system sends JSON, but we don't need it)
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
  } catch { /* */ }

  if (!findSemble()) {
    log("skip", { reason: "semble not found", path: cfg.semblePath });
    approve();
    return;
  }

  const version = getSembleVersion();
  log("found", { semblePath: cfg.semblePath, version });

  // Warmup: run a minimal search to build/cache the index for CWD
  const start = Date.now();
  try {
    execFileSync(cfg.semblePath, ["search", "main entry point", ".", "-k", "1"], {
      encoding: "utf-8",
      timeout: cfg.bootstrapTimeout,
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const elapsed = Date.now() - start;
    log("warmup_done", { elapsed, cwd: process.cwd() });
  } catch (err) {
    const elapsed = Date.now() - start;
    if (err.killed) {
      logError("warmup_timeout", { elapsed, timeout: cfg.bootstrapTimeout });
    } else {
      logError("warmup_error", err);
    }
  }

  approve();
}

main().catch((err) => { logError("uncaught", err); approve(); });
