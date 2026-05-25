# semble-hooks

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org)

Code-intelligence hooks for AI coding CLIs. Every prompt gets the 5 most relevant code chunks from your project — automatically, locally, zero config.

Powered by [Semble](https://github.com/MinishLab/semble) semantic code search (98% token savings vs grep+read).

## How it works

```
You type a prompt
    ↓
Hook calls `semble search` with your prompt
    ↓
Semble finds relevant functions/classes (CPU-only, no API key)
    ↓
Top-k code chunks injected as <relevant-code> into agent context
    ↓
Agent understands your codebase without grep/read cycles
```

## Supported CLIs

| CLI | Recall Hook | Bootstrap Hook |
|-----|-------------|----------------|
| [Claude Code](https://claude.ai/code) | UserPromptSubmit | SessionStart |
| [Codex CLI](https://github.com/openai/codex) | UserPromptSubmit | — |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | BeforeAgent | — |
| [OpenClaw](https://github.com/benediktkraus/openclaw) | before_prompt_build | — |

## Prerequisites

- **Node.js** >= 18
- **Semble** CLI: `pip install semble`

## Install

```bash
git clone https://github.com/benediktkraus/semble-hooks.git
cd semble-hooks
./install.sh all        # Install for all CLIs
# or
./install.sh claude-code  # Install for Claude Code only
./install.sh codex        # Install for Codex CLI only
./install.sh gemini       # Install for Gemini CLI only
./install.sh openclaw     # Install for OpenClaw only
```

The installer copies hooks to `~/.semble-hooks/` and registers them with your CLI.

## Configuration

Config file: `~/.semble-hooks/config.json` (created on first run with defaults if missing).

```json
{
  "topK": 5,
  "semblePath": "semble",
  "timeout": 8000,
  "debug": false,
  "includeTextFiles": false,
  "excludePatterns": []
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

## How it looks

When you type a prompt, the agent sees:

```xml
<relevant-code>
The following code chunks from the current project may be relevant:
### src/auth/login.ts:15-42 (score: 0.034)
​```
export async function handleLogin(req: Request) {
  const { email, password } = req.body;
  // ... relevant implementation
}
​```

### src/middleware/auth.ts:8-25 (score: 0.028)
​```
export function requireAuth(req, res, next) {
  // ... relevant implementation
}
​```
</relevant-code>
```

## Debug

Enable logging to see what semble finds:

```bash
export SEMBLE_HOOKS_DEBUG=1
# Logs go to ~/.semble-hooks/logs/hooks.log
```

Log format (JSON Lines):
```json
{"ts":"2026-05-22T19:25:23","hook":"code-recall","stage":"parsed","data":{"chunkCount":5,"files":["src/auth.ts","src/db.ts"]}}
```

## Architecture

```
scripts/
  config.mjs           # Config loader (defaults + JSON + ENV)
  debug-log.mjs        # Structured JSON Lines logger
  code-recall.mjs      # UserPromptSubmit hook (the main one)
  code-bootstrap.mjs   # SessionStart warmup hook
hooks/
  claude-code.json     # Hook definitions for Claude Code
  codex-cli.json       # Hook definitions for Codex CLI
  gemini-cli.json      # Hook definitions for Gemini CLI
openclaw-plugin/
  dist/index.js        # OpenClaw plugin (before_prompt_build hook)
  openclaw.plugin.json # Plugin manifest
install.sh             # Multi-CLI installer (claude-code, codex, gemini, openclaw)
```

**Zero dependencies.** No `node_modules`, no build step, no npm install. Just Node.js built-ins + semble CLI.

## Graceful degradation

If semble is not installed or unavailable:
- Hooks silently approve without injecting code context
- No errors, no broken CLI sessions
- Debug log shows "semble not found, skipping"

## Complementary to memory hooks

semble-hooks provides **code context** (`<relevant-code>`).
[DREVIHO](https://github.com/benediktkraus/dreviho) provides **memory context** (`<relevant-memories>`).

Both can run simultaneously — they inject different context tags and don't interfere with each other.

## License

[Apache-2.0](LICENSE)
