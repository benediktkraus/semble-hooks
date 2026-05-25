# semble-hooks

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org)
[![Semble](https://img.shields.io/badge/powered%20by-Semble-purple.svg)](https://github.com/MinishLab/semble)
[![CLIs](https://img.shields.io/badge/CLIs-Claude%20Code%20%7C%20Codex%20%7C%20Gemini%20%7C%20OpenClaw-orange.svg)](#supported-clis)

Code-intelligence hooks for AI coding CLIs. Every prompt gets the most relevant code chunks from your project — automatically, locally, zero config.

Powered by [Semble](https://github.com/MinishLab/semble) semantic code search (98% token savings vs grep+read, CPU-only, no API key).

## How it works

```
You type a prompt
    ↓
Hook calls `semble search` with your prompt
    ↓
Semble finds relevant functions/classes (16MB static model, CPU-only)
    ↓
Top-k code chunks injected as <relevant-code> into agent context
    ↓
Agent understands your codebase without grep/read cycles
```

**Before semble-hooks:** Agent spends 5-10 turns doing `grep` → `read` → `grep` → `read` to find relevant code. Burns tokens and time.

**After semble-hooks:** Agent gets the 5 most relevant code chunks in the first turn. Answers are better and faster.

## Supported CLIs

| CLI | Recall Hook | Bootstrap Hook |
|-----|-------------|----------------|
| [Claude Code](https://claude.ai/code) | UserPromptSubmit | SessionStart |
| [Codex CLI](https://github.com/openai/codex) | UserPromptSubmit | SessionStart |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | BeforeAgent | SessionStart |
| [OpenClaw](https://github.com/benediktkraus/openclaw) | before_prompt_build (plugin) | — |

**Recall Hook** — runs on every prompt, injects relevant code chunks.
**Bootstrap Hook** — runs on session start, warms up the Semble index for faster first search.

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
  "topK": 5,
  "semblePath": "semble",
  "timeout": 8000,
  "debug": false,
  "includeTextFiles": false
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `topK` | `5` | Number of code chunks to inject (1-20) |
| `semblePath` | `"semble"` | Path to semble binary |
| `timeout` | `8000` | Search timeout in ms (1000-30000) |
| `bootstrapTimeout` | `120000` | Warmup timeout in ms |
| `debug` | `false` | Enable JSON Lines logging |
| `includeTextFiles` | `false` | Also index .md, .yaml, .json files |
| `minQueryLength` | `3` | Minimum prompt length to trigger search |

### Environment variables

| Variable | Description |
|----------|-------------|
| `SEMBLE_HOOKS_CONFIG` | Custom config file path |
| `SEMBLE_PATH` | Override semble binary path |
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
  code-bootstrap.mjs   # Bootstrap hook — warms up semble index on session start
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

## Why not just use semble as MCP server?

Semble has an MCP mode (`uvx --from "semble[mcp]" semble`). That works too — but it requires the agent to **decide** to call the search tool. With hooks, every prompt gets code context automatically. No agent decision needed, no tool call overhead, no missed context.

## License

[Apache-2.0](LICENSE)
