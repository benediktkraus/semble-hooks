import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve as resolvePath } from "node:path";

const DEFAULT_CONFIG_PATH = join(homedir(), ".semble-hooks", "config.json");

function num(val, fallback) {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim()) {
    const n = Number(val);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function str(val, fallback) {
  if (typeof val === "string" && val.trim()) return val.trim();
  return fallback;
}

function bool(val, fallback = false) {
  return typeof val === "boolean" ? val : fallback;
}

function list(val, fallback = []) {
  if (Array.isArray(val)) return val.filter(v => typeof v === "string" && v.trim()).map(v => v.trim());
  if (typeof val === "string" && val.trim()) {
    const trimmed = val.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return list(parsed, fallback);
      } catch { /* fall through to comma split */ }
    }
    return trimmed.split(",").map(v => v.trim()).filter(Boolean);
  }
  return fallback;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, Math.floor(val)));
}

const DEFAULT_BLOCKED_PATHS = [
  "/",
  "~",
  "/home",
  "/root",
  "/mnt",
  "/mnt/onedrive",
  "/mnt/onedrive/Workspace",
  "/mnt/onedrive/Workspace/projects",
  "/opt",
];

function readJsonOptional(path) {
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch { /* missing or invalid — use defaults */ }
  return {};
}

export function loadConfig() {
  const configPath = resolvePath(
    str(process.env.SEMBLE_HOOKS_CONFIG, DEFAULT_CONFIG_PATH).replace(/^~/, homedir()),
  );
  const file = readJsonOptional(configPath);
  const debug = bool(file.debug) || process.env.SEMBLE_HOOKS_DEBUG === "1";
  const defaultLogPath = join(homedir(), ".semble-hooks", "logs", "hooks.log");

  return {
    configPath,
    enabled: process.env.SEMBLE_HOOKS_DISABLED === "1" ? false : bool(file.enabled, true),
    semblePath: str(file.semblePath, process.env.SEMBLE_PATH || "semble"),
    topK: clamp(num(file.topK, 5), 1, 20),
    timeout: clamp(num(file.timeout, 8000), 1000, 30000),
    bootstrapTimeout: clamp(num(file.bootstrapTimeout, 120000), 5000, 300000),
    bootstrapEnabled: bool(file.bootstrapEnabled, false),
    minQueryLength: clamp(num(file.minQueryLength, 3), 1, 50),
    maxQueryChars: clamp(num(file.maxQueryChars, 600), 80, 4000),
    includeTextFiles: bool(file.includeTextFiles),
    excludePatterns: Array.isArray(file.excludePatterns) ? file.excludePatterns : [],
    searchPaths: list(process.env.SEMBLE_HOOKS_SEARCH_PATHS ?? file.searchPaths),
    maxTargets: clamp(num(file.maxTargets, 4), 1, 12),
    lockTtlMs: clamp(num(file.lockTtlMs, 60000), 5000, 600000),
    cooldownMs: clamp(num(file.cooldownMs, 2000), 0, 60000),
    blockedPaths: list(file.blockedPaths, DEFAULT_BLOCKED_PATHS),
    debug,
    debugLogPath: str(
      process.env.SEMBLE_HOOKS_DEBUG_LOG ?? file.debugLogPath,
      defaultLogPath,
    ),
  };
}
