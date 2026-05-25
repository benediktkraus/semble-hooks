# Semble Hooks — CLAUDE.md

## Was ist das
Code-Intelligence Hooks für AI Coding CLIs. Bei jedem Prompt wird Semble CLI aufgerufen, relevante Code-Chunks werden als `<relevant-code>` Block in den Agent-Context injiziert. Parallel zu DREVIHO (Memory Hooks), eigenes Repo.

## Projekt-Typ
open-source

## Tech-Stack
- Node.js >= 18 (ESM, .mjs, keine npm Dependencies)
- Semble CLI v0.2.0 (`semble search "query" [path] -k N`) — Python, CPU-only, potion-code-16M
- Native child_process (execFileSync mit Array-Args)
- Hook-Systeme: Claude Code UserPromptSubmit/SessionStart, Codex hooks.json, Gemini hooks.json, OpenClaw Plugin (before_prompt_build)

## Architektur-Referenz
DREVIHO Repo (ehemals openviking-hooks): https://github.com/benediktkraus/dreviho
- `scripts/auto-recall.mjs` — Hook-Pattern (stdin JSON → stdout decision + additionalContext)
- `scripts/config.mjs` — Multi-Agent Config Loader
- `scripts/debug-log.mjs` — JSON Lines Logger
- `install.sh` — Multi-CLI Installer

## Entscheidungen
- [2026-05-21]: Eigenes Repo statt in DREVIHO integriert — saubere Trennung Code vs Memory
- [2026-05-21]: Semble CLI Call via execFileSync, kein MCP Server, kein Daemon — Security + Einfachheit
- [2026-05-22]: Standalone Config statt DREVIHO Scope-Resolver — Public Repo muss ohne OV funktionieren
- [2026-05-22]: Output-Tag `<relevant-code>` — klare Unterscheidung zu DREVIHOs `<relevant-memories>`
- [2026-05-22]: SessionStart = Warmup Search — Semble v0.2.0 hat keinen Index-Befehl, cached on-the-fly
- [2026-05-22]: Config unter ~/.semble-hooks/config.json — eigener Namespace, kein OV-Dependency
- [2026-05-22]: Lizenz Apache-2.0 — permissive, Patent Grant
- [2026-05-22]: Node.js ESM (.mjs), kein TypeScript, kein Build-Step — minimale Dependencies
- [2026-05-25]: OpenClaw Plugin via before_prompt_build Hook — gleiche Tiefe wie OpenViking-Enhanced

## Regeln
- Kein execSync — nur execFileSync mit Array-Args
- Keine hardcoded Pfade — Config oder Defaults
- Keine npm Dependencies — nur Node.js built-ins
- Code-Chunks als `<relevant-code>` Tag (nicht `<relevant-memories>`)
- Graceful degradation: wenn semble nicht installiert → leerer Output, kein Error

## File-Map
| Datei | Zweck |
|-------|-------|
| CLAUDE.md | Index, Entscheidungen, File-Map |
| PRD.md | Features, Personas, Constraints, Risks |
| TASK-GUIDE.md | 7 Tasks, Dependencies, Spawn-Prompts |
| specs/temporal-flow.md | User Flows, State Transitions, Timing |
| concept/RAW_USER_INPUT.md | Verbatim User Input + SHAPE-PROMPT |
| adr/ADR-001-eigenes-repo.md | Eigenes Repo vs DREVIHO-Integration |
| adr/ADR-002-execfilesync.md | execFileSync vs MCP/Daemon |
| adr/ADR-003-standalone-config.md | Standalone Config vs Scope-Resolver |
| adr/ADR-004-relevant-code-tag.md | Output-Tag Konvention |
| adr/ADR-005-warmup-bootstrap.md | SessionStart Warmup Strategy |
| scripts/config.mjs | Config-Loader |
| scripts/debug-log.mjs | JSON Lines Logger |
| scripts/code-recall.mjs | UserPromptSubmit Hook (Kern) |
| scripts/code-bootstrap.mjs | SessionStart Warmup Hook |
| hooks/claude-code.json | Hook-Definitionen Claude Code |
| hooks/codex-cli.json | Hook-Definitionen Codex CLI |
| hooks/gemini-cli.json | Hook-Definitionen Gemini CLI |
| openclaw-plugin/ | OpenClaw Plugin (before_prompt_build) |
| openclaw-plugin/dist/index.js | OC Plugin Entry Point |
| openclaw-plugin/openclaw.plugin.json | OC Plugin Manifest |
| install.sh | Multi-CLI Installer (claude-code, codex, gemini, openclaw) |
