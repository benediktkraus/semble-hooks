# semble-hooks

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org)
[![Semble](https://img.shields.io/badge/powered%20by-Semble-purple.svg)](https://github.com/MinishLab/semble)
[![CLIs](https://img.shields.io/badge/CLIs-Claude%20Code%20%7C%20Codex%20%7C%20Gemini%20%7C%20OpenClaw-orange.svg)](#supported-clis)

Code-intelligence hooks for AI coding CLIs. Coding sessions get relevant code chunks automatically, locally, with bounded scope and CPU guards.

Powered by [Semble](https://github.com/MinishLab/semble) semantic code search (98% token savings vs grep+read, CPU-only, no API key).

## How it works

```
You type a prompt in a coding session
    ↓
Hook resolves a safe code scope
    ↓
Hook calls `semble search` with your prompt and that scope
    ↓
Semble finds relevant functions/classes (16MB static model, CPU-only)
    ↓
Top-k code chunks injected as <relevant-code> into agent context
    ↓
Agent understands your codebase without grep/read cycles
```

**Before semble-hooks:** Agent spends 5-10 turns doing `grep` → `read` → `grep` → `read` to find relevant code. Burns tokens and time.

**After semble-hooks:** Agent gets the most relevant code chunks in the first turn, without depending on the model to remember an MCP tool call.

## Supported CLIs

| CLI | Recall Hook | Bootstrap Hook |
|-----|-------------|----------------|
| [Claude Code](https://claude.ai/code) | UserPromptSubmit | SessionStart |
| [Codex CLI](https://github.com/openai/codex) | UserPromptSubmit | SessionStart |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | BeforeAgent | SessionStart |
| [OpenClaw](https://github.com/benediktkraus/openclaw) | before_prompt_build (plugin) | — |

**Recall Hook** — runs on every prompt, injects relevant code chunks.
**Bootstrap Hook** — optional session-start warmup, disabled by default for CPU safety.

## Prerequisites

- **Node.js** >= 18
- **Semble** CLI: `pip install semble` ([GitHub](https://github.com/MinishLab/semble))

## Install

```bash
git clone https://github.com/benediktkraus/semble-hooks.git
cd semble-hooks
./install.sh all          # All CLIs at once
# or pick one:
./install.sh claude-code  # Claude Code
./install.sh codex        # Codex CLI
./install.sh gemini       # Gemini CLI
./install.sh openclaw     # OpenClaw
```

The installer copies hooks to `~/.semble-hooks/` and registers them with your CLI.

## What the agent sees

When you type a prompt, the agent receives a `<relevant-code>` block with the most relevant code chunks from your project:

```xml
<relevant-code>
The following code chunks from the current project may be relevant:
### src/auth/login.ts:15-42 (score: 0.034)
```typescript
export async function handleLogin(req: Request) {
  const { email, password } = req.body;
  const user = await db.users.findByEmail(email);
  if (!user || !await bcrypt.compare(password, user.hash)) {
    throw new AuthError("Invalid credentials");
  }
  return createSession(user);
}
```

### src/middleware/auth.ts:8-25 (score: 0.028)
```typescript
export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });
  req.user = verifyJWT(token);
  next();
}
```
</relevant-code>
```

The agent sees exactly the code it needs — no grep, no read, no guessing.

## Configuration

Config file: `~/.semble-hooks/config.json` (works without config — sensible defaults built in).

```json
{
  "enabled": true,
  "topK": 5,
  "semblePath": "semble",
  "timeout": 8000,
  "bootstrapEnabled": false,
  "debug": false,
  "includeTextFiles": false,
  "searchPaths": [],
  "maxTargets": 4,
  "lockTtlMs": 60000,
  "cooldownMs": 2000,
  "maxQueryChars": 600,
  "blockedPaths": [
    "/",
    "~",
    "/home",
    "/root",
    "/mnt",
    "/mnt/onedrive",
    "/mnt/onedrive/Workspace",
    "/mnt/onedrive/Workspace/projects",
    "/opt"
  ]
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Enable automatic recall hooks |
| `topK` | `5` | Number of code chunks to inject (1-20) |
| `semblePath` | `"semble"` | Path to semble binary |
| `timeout` | `8000` | Search timeout in ms (1000-30000) |
| `bootstrapTimeout` | `120000` | Warmup timeout in ms |
| `bootstrapEnabled` | `false` | Enable SessionStart warmup search |
| `debug` | `false` | Enable JSON Lines logging |
| `includeTextFiles` | `false` | Also index .md, .yaml, .json files |
| `minQueryLength` | `3` | Minimum prompt length to trigger search |
| `maxQueryChars` | `600` | Query text sent to Semble is normalized and truncated to this size |
| `searchPaths` | `[]` | Explicit paths or git URLs to search; empty means current working directory |
| `maxTargets` | `4` | Maximum explicit search targets per hook invocation |
| `lockTtlMs` | `60000` | Per-repo lock TTL to avoid concurrent indexing |
| `cooldownMs` | `2000` | Per-repo cooldown to avoid repeated back-to-back searches |
| `blockedPaths` | see config | Broad parent paths hooks must not search unless removed from config |

### CPU safety

Hooks do not blindly search the shell working directory. With empty `searchPaths`, the hook resolves the Git root for the current coding session and searches that. If there is no Git root, it searches the current directory only when it is not one of the configured broad parent paths.

For broad, multi-repo, or GitHub work, set `searchPaths` explicitly, for example `["/path/repo-a", "/path/repo-b"]` or `["https://github.com/org/repo"]`. Explicit paths are still capped by `maxTargets`.

Each hook invocation uses native thread limits, a per-target lock, a per-target cooldown, a timeout, and a truncated query. That keeps the hook semi-live without letting parallel sessions stampede one large workspace parent.

Bootstrap is disabled by default because the currently installed Semble CLI builds an in-process index for the hook process. Enable `bootstrapEnabled` only when that extra startup CPU is intentional.

### Environment variables

| Variable | Description |
|----------|-------------|
| `SEMBLE_HOOKS_CONFIG` | Custom config file path |
| `SEMBLE_PATH` | Override semble binary path |
| `SEMBLE_HOOKS_DISABLED` | Set to `1` to disable automatic hooks |
| `SEMBLE_HOOKS_SEARCH_PATHS` | JSON array or comma-separated search paths |
| `SEMBLE_HOOKS_DEBUG` | Set to `1` to enable debug logging |
| `SEMBLE_HOOKS_DEBUG_LOG` | Custom log file path |

## Graceful degradation

If semble is not installed or unavailable:
- Hooks silently approve without injecting code context
- No errors, no broken CLI sessions
- Debug log shows `semble not found, skipping`

Install the hooks first, install semble later — everything still works.

## Architecture

```
scripts/
  config.mjs           # Config loader (defaults + JSON + ENV)
  debug-log.mjs        # Structured JSON Lines logger
  code-recall.mjs      # Recall hook — the core: prompt → semble search → inject
  code-bootstrap.mjs   # Optional bootstrap hook — disabled by default for CPU safety
hooks/
  claude-code.json     # Hook definitions for Claude Code
  codex-cli.json       # Hook definitions for Codex CLI
  gemini-cli.json      # Hook definitions for Gemini CLI
openclaw-plugin/
  dist/index.js        # OpenClaw plugin (before_prompt_build hook)
  openclaw.plugin.json # Plugin manifest
install.sh             # Multi-CLI installer
```

**Zero dependencies.** No `node_modules`, no build step, no `npm install`. Just Node.js built-ins + semble CLI.

## Debug

```bash
export SEMBLE_HOOKS_DEBUG=1
# Logs go to ~/.semble-hooks/logs/hooks.log
```

Log format (JSON Lines):
```json
{"ts":"2026-05-22T19:25:23","hook":"code-recall","stage":"parsed","data":{"chunkCount":5,"files":["src/auth.ts","src/db.ts"]}}
```

## Complementary to memory hooks

semble-hooks provides **code context** (`<relevant-code>`) — what's in the codebase right now.
[DREVIHO](https://github.com/benediktkraus/dreviho) provides **memory context** (`<relevant-memories>`) — decisions, learnings, project knowledge.

Both run simultaneously. Different tags, different purpose, no interference.

## Why hooks and MCP?

Semble has an MCP mode (`uvx --from "semble[mcp]" semble`). That should be exposed centrally through your MCP proxy so every agent uses one managed MCP surface.

Hooks are still useful for coding sessions because they do not depend on the model deciding to call MCP. The hook is the semi-live trigger; MCP is the shared on-demand tool surface.

## License

[Apache-2.0](LICENSE)
