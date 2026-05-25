import { closeSync, mkdirSync, openSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";

function isRemoteSource(path) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(path) || /^git@[^:]+:.+/.test(path);
}

function expandLocalPath(path, cwd) {
  const expanded = path.replace(/^~(?=$|\/)/, homedir());
  return resolvePath(cwd, expanded);
}

function defaultBlockedPaths() {
  return [
    "/",
    homedir(),
    "/home",
    "/root",
    "/mnt",
    "/mnt/onedrive",
    "/mnt/onedrive/Workspace",
    "/mnt/onedrive/Workspace/projects",
    "/opt",
  ];
}

function gitRootFor(cwd) {
  try {
    const root = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return root || null;
  } catch {
    return null;
  }
}

function blockedPaths(cfg) {
  const configured = Array.isArray(cfg.blockedPaths) ? cfg.blockedPaths : [];
  const paths = configured.length > 0 ? configured : defaultBlockedPaths();
  return paths
    .filter(p => typeof p === "string" && p.trim())
    .map(p => expandLocalPath(p.trim(), process.cwd()));
}

function isBlockedLocalPath(path, cfg) {
  const resolved = expandLocalPath(path, process.cwd());
  return blockedPaths(cfg).includes(resolved);
}

function targetFor(path, cwd, explicit, cfg) {
  if (isRemoteSource(path)) {
    return { path, cwd, remote: true, explicit };
  }
  const local = expandLocalPath(path, cwd);
  return {
    path: local,
    cwd: local,
    remote: false,
    explicit,
    blocked: isBlockedLocalPath(local, cfg),
  };
}

export function resolveSearchTargets(cfg, cwd = process.cwd()) {
  const configured = Array.isArray(cfg.searchPaths) ? cfg.searchPaths : [];
  const seen = new Set();
  const targets = [];
  const skipped = [];
  const maxTargets = Number.isFinite(cfg.maxTargets) ? cfg.maxTargets : 4;

  const rawTargets = configured.length > 0
    ? configured.map(rawPath => targetFor(rawPath, cwd, true, cfg))
    : [targetFor(gitRootFor(cwd) || cwd, cwd, false, cfg)];

  for (const target of rawTargets) {
    if (target.blocked) {
      skipped.push({ path: target.path, reason: target.explicit ? "blocked explicit path" : "blocked broad default path" });
      continue;
    }
    if (seen.has(target.path)) continue;
    if (targets.length >= maxTargets) {
      skipped.push({ path: target.path, reason: "max targets reached" });
      continue;
    }
    seen.add(target.path);
    targets.push(target);
  }

  return { targets, skipped };
}

export function normalizeQuery(query, maxChars) {
  const normalized = String(query || "").replace(/\s+/g, " ").trim();
  if (!Number.isFinite(maxChars) || maxChars <= 0) return normalized;
  return normalized.slice(0, maxChars);
}

function statePath(kind, name, key) {
  const digest = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return join(homedir(), ".semble-hooks", kind, `${name}-${digest}`);
}

function lockPath(name, key) {
  return statePath("locks", name, key) + ".lock";
}

function cooldownPath(name, key) {
  return statePath("cooldowns", name, key) + ".cooldown";
}

export function cooldownActive(name, key, cooldownMs) {
  if (!Number.isFinite(cooldownMs) || cooldownMs <= 0) return { active: false };
  const path = cooldownPath(name, key);
  try {
    const age = Date.now() - statSync(path).mtimeMs;
    if (age < cooldownMs) {
      return { active: true, path, remainingMs: cooldownMs - age };
    }
  } catch { /* ignore */ }
  return { active: false, path };
}

export function markCooldown(name, key) {
  const path = cooldownPath(name, key);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ key, ts: new Date().toISOString() }));
}

export function limitedEnv() {
  return {
    ...process.env,
    OMP_NUM_THREADS: process.env.OMP_NUM_THREADS || "1",
    OPENBLAS_NUM_THREADS: process.env.OPENBLAS_NUM_THREADS || "1",
    MKL_NUM_THREADS: process.env.MKL_NUM_THREADS || "1",
    NUMEXPR_NUM_THREADS: process.env.NUMEXPR_NUM_THREADS || "1",
    VECLIB_MAXIMUM_THREADS: process.env.VECLIB_MAXIMUM_THREADS || "1",
  };
}

export function acquireLock(name, key, ttlMs) {
  const path = lockPath(name, key);
  mkdirSync(dirname(path), { recursive: true });
  try {
    const fd = openSync(path, "wx");
    writeFileSync(fd, JSON.stringify({ pid: process.pid, key, ts: new Date().toISOString() }));
    return {
      acquired: true,
      path,
      release() {
        try { closeSync(fd); } catch { /* ignore */ }
        try { unlinkSync(path); } catch { /* ignore */ }
      },
    };
  } catch (err) {
    if (err?.code !== "EEXIST") return { acquired: false, path, reason: "lock error" };
    try {
      const age = Date.now() - statSync(path).mtimeMs;
      if (age > ttlMs) {
        unlinkSync(path);
        return acquireLock(name, key, ttlMs);
      }
    } catch { /* ignore */ }
    return { acquired: false, path, reason: "lock busy" };
  }
}

export function describeTargets(result) {
  return {
    targets: result.targets.map(t => ({ path: t.path, explicit: t.explicit, remote: t.remote })),
    skipped: result.skipped,
  };
}

/*
 * The rest of this file intentionally contains only scope and resource guards.
 * Semble decides what code is relevant; hooks decide when a search is safe.
 */
