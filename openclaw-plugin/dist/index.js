import { definePluginEntry } from "openclaw/plugin-sdk/core";
import { execFileSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";

const DEFAULT_CFG = {
  enabled: true,
  topK: 5,
  semblePath: "semble",
  timeout: 8000,
  minQueryLength: 3,
  maxQueryChars: 600,
  searchPaths: [],
  maxTargets: 4,
  lockTtlMs: 60000,
  cooldownMs: 2000,
  blockedPaths: [
    "/",
    "~",
    "/home",
    "/root",
    "/mnt",
    "/mnt/onedrive",
    "/mnt/onedrive/Workspace",
    "/mnt/onedrive/Workspace/projects",
    "/opt",
  ],
};

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
    if (i < lines.length && lines[i].startsWith("```")) i++;
    const codeLines = [];
    while (i < lines.length && !lines[i].startsWith("```")) {
      codeLines.push(lines[i]);
      i++;
    }
    if (i < lines.length && lines[i].startsWith("```")) i++;
    chunks.push({ file, startLine, endLine, score, code: codeLines.join("\n") });
  }
  return chunks;
}

function formatChunks(chunks) {
  const parts = chunks.map(c => {
    const loc = c.startLine ? `${c.file}:${c.startLine}-${c.endLine}` : c.file;
    const prefix = c.source ? `${c.source} :: ` : "";
    return `### ${prefix}${loc} (score: ${c.score.toFixed(3)})\n\`\`\`\n${c.code}\n\`\`\``;
  });
  return "<relevant-code>\nThe following code chunks from the current project may be relevant:\n" +
    parts.join("\n\n") + "\n</relevant-code>";
}

function findSemble(path) {
  try {
    if (path.startsWith("/")) {
      execFileSync(path, ["--help"], { stdio: "pipe", timeout: 5000, env: limitedEnv() });
    } else {
      execFileSync("which", [path], { stdio: "pipe", timeout: 3000 });
    }
    return true;
  } catch { return false; }
}

function isRemoteSource(path) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(path) || /^git@[^:]+:.+/.test(path);
}

function expandLocalPath(path, cwd) {
  const expanded = path.replace(/^~(?=$|\/)/, homedir());
  return resolvePath(cwd, expanded);
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
  const configured = Array.isArray(cfg.blockedPaths) ? cfg.blockedPaths : DEFAULT_CFG.blockedPaths;
  return configured
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

function resolveSearchTargets(cfg, cwd = process.cwd()) {
  const configured = Array.isArray(cfg.searchPaths) ? cfg.searchPaths : [];
  const seen = new Set();
  const targets = [];
  const maxTargets = Number.isFinite(cfg.maxTargets) ? cfg.maxTargets : DEFAULT_CFG.maxTargets;
  const rawTargets = configured.length > 0
    ? configured.map(rawPath => targetFor(rawPath, cwd, true, cfg))
    : [targetFor(gitRootFor(cwd) || cwd, cwd, false, cfg)];

  for (const target of rawTargets) {
    if (target.blocked) continue;
    if (seen.has(target.path)) continue;
    if (targets.length >= maxTargets) continue;
    seen.add(target.path);
    targets.push(target);
  }
  return targets;
}

function normalizeQuery(query, maxChars) {
  const normalized = String(query || "").replace(/\s+/g, " ").trim();
  if (!Number.isFinite(maxChars) || maxChars <= 0) return normalized;
  return normalized.slice(0, maxChars);
}

function limitedEnv() {
  return {
    ...process.env,
    OMP_NUM_THREADS: process.env.OMP_NUM_THREADS || "1",
    OPENBLAS_NUM_THREADS: process.env.OPENBLAS_NUM_THREADS || "1",
    MKL_NUM_THREADS: process.env.MKL_NUM_THREADS || "1",
    NUMEXPR_NUM_THREADS: process.env.NUMEXPR_NUM_THREADS || "1",
    VECLIB_MAXIMUM_THREADS: process.env.VECLIB_MAXIMUM_THREADS || "1",
  };
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

function cooldownActive(name, key, cooldownMs) {
  if (!Number.isFinite(cooldownMs) || cooldownMs <= 0) return false;
  try {
    return Date.now() - statSync(cooldownPath(name, key)).mtimeMs < cooldownMs;
  } catch {
    return false;
  }
}

function markCooldown(name, key) {
  const path = cooldownPath(name, key);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ key, ts: new Date().toISOString() }));
}

function acquireLock(name, key, ttlMs) {
  const path = lockPath(name, key);
  mkdirSync(dirname(path), { recursive: true });
  try {
    const fd = openSync(path, "wx");
    writeFileSync(fd, JSON.stringify({ pid: process.pid, key, ts: new Date().toISOString() }));
    return {
      acquired: true,
      release() {
        try { closeSync(fd); } catch { /* ignore */ }
        try { unlinkSync(path); } catch { /* ignore */ }
      },
    };
  } catch (err) {
    if (err?.code !== "EEXIST") return { acquired: false };
    try {
      const age = Date.now() - statSync(path).mtimeMs;
      if (age > ttlMs) {
        unlinkSync(path);
        return acquireLock(name, key, ttlMs);
      }
    } catch { /* ignore */ }
    return { acquired: false };
  }
}

function sembleSearch(query, cfg, cwd = process.cwd()) {
  if (!cfg.enabled) return null;
  const normalizedQuery = normalizeQuery(query, cfg.maxQueryChars);
  if (!normalizedQuery || normalizedQuery.length < cfg.minQueryLength) return null;
  if (!findSemble(cfg.semblePath)) return null;
  const targets = resolveSearchTargets(cfg, cwd);
  if (targets.length === 0) return null;
  const allChunks = [];
  const perTargetK = Math.max(1, Math.ceil(cfg.topK / targets.length));

  for (const target of targets) {
    if (cooldownActive("openclaw", target.path, cfg.cooldownMs)) continue;
    const lock = acquireLock("openclaw", target.path, cfg.lockTtlMs);
    if (!lock.acquired) continue;
    try {
      markCooldown("openclaw", target.path);
      const raw = execFileSync(cfg.semblePath, ["search", normalizedQuery, target.path, "-k", String(perTargetK)], {
        encoding: "utf-8",
        timeout: cfg.timeout,
        cwd: target.cwd,
        env: limitedEnv(),
        stdio: ["pipe", "pipe", "pipe"],
      });
      if (!raw || !raw.trim()) continue;
      const chunks = parseSembleOutput(raw);
      for (const chunk of chunks) {
        chunk.source = targets.length > 1 ? target.path : "";
        allChunks.push(chunk);
      }
    } catch {
      continue;
    } finally {
      lock.release();
    }
  }
  if (allChunks.length === 0) return null;
  return formatChunks(allChunks.slice(0, cfg.topK));
}

export default definePluginEntry({
  id: "semble-hooks",
  name: "Semble Code Intelligence",
  description: "Injects relevant code chunks via Semble semantic search",
  register(api) {
    const pluginCfg = api.config || {};
    const cfg = { ...DEFAULT_CFG, ...pluginCfg };

    api.hooks.on("before_prompt_build", async (event) => {
      const query = normalizeQuery(event.prompt || "", cfg.maxQueryChars);
      const cwd = event.cwd || event.projectRoot || event.workspacePath || process.cwd();
      const block = sembleSearch(query, cfg, cwd);
      if (block) {
        api.logger.debug(`semble: injected ${block.length} chars for "${query.slice(0, 50)}..."`);
        return { appendSystemContext: block };
      }
      return {};
    });

    api.logger.info("semble-hooks: before_prompt_build hook registered");
  },
});
