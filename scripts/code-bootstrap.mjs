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
  resolveSearchTargets,
} from "./safety.mjs";

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
      execFileSync(cfg.semblePath, ["--help"], { stdio: "pipe", timeout: 5000, env: limitedEnv() });
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
      env: limitedEnv(),
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

  if (!cfg.enabled) {
    log("skip", { reason: "disabled" });
    approve();
    return;
  }

  if (!cfg.bootstrapEnabled) {
    log("skip", { reason: "bootstrap disabled" });
    approve();
    return;
  }

  if (!findSemble()) {
    log("skip", { reason: "semble not found", path: cfg.semblePath });
    approve();
    return;
  }

  const resolved = resolveSearchTargets(cfg);
  log("targets", describeTargets(resolved));

  for (const target of resolved.targets) {
    const cooldown = cooldownActive("bootstrap", target.path, cfg.cooldownMs);
    if (cooldown.active) {
      log("skip_target", { reason: "cooldown", path: target.path, remainingMs: Math.ceil(cooldown.remainingMs) });
      continue;
    }

    const lock = acquireLock("bootstrap", target.path, cfg.lockTtlMs);
    if (!lock.acquired) {
      log("skip_target", { reason: lock.reason, path: target.path });
      continue;
    }

    const version = getSembleVersion();
    log("found", { semblePath: cfg.semblePath, version, path: target.path });

    const start = Date.now();
    try {
      markCooldown("bootstrap", target.path);
      execFileSync(cfg.semblePath, ["search", "main entry point", target.path, "-k", "1"], {
        encoding: "utf-8",
        timeout: cfg.bootstrapTimeout,
        cwd: target.cwd,
        env: limitedEnv(),
        stdio: ["pipe", "pipe", "pipe"],
      });
      const elapsed = Date.now() - start;
      log("warmup_done", { elapsed, path: target.path });
    } catch (err) {
      const elapsed = Date.now() - start;
      if (err.killed || err.signal) {
        logError("warmup_timeout", { path: target.path, elapsed, timeout: cfg.bootstrapTimeout });
      } else {
        logError("warmup_error", err);
      }
    } finally {
      lock.release();
    }
  }

  approve();
}

main().catch((err) => { logError("uncaught", err); approve(); });
