# RAW_USER_INPUT — semble-hooks

## Turn 1 (User, 2026-05-22)
Lies die Datei .internal/SHAPE-PROMPT.md und starte /shape basierend auf dem Kontext. Baue semble-hooks als Open Source Projekt: code-recall.mjs, code-bootstrap.mjs, config.mjs, install.sh. Referenz: /mnt/onedrive/Workspace/projects/dreviho. Semble CLI ist installiert.

## Turn 2 (User, 2026-05-22)
ja und wo stehen wir hier? wie sehen die hooks aus? sind sie alle isntalliert in allen CLI und sauber getestet? nutzen wir die jetzt sauber unsw?

## Turn 3 (User, 2026-05-22)
Okay, ganz cool story, Bro. Wo stehen wir hier?

## Referenced: .internal/SHAPE-PROMPT.md (verbatim)

### Projekt
semble-hooks — Code-Intelligence Hooks für AI Coding CLIs.

### Was es tut
Bei jedem UserPromptSubmit wird Semble CLI aufgerufen (`semble search`), die Top-5 relevantesten Code-Chunks werden als `<relevant-code>` Block in den Agent-Context injiziert. Parallel zu DREVIHO Memory Hooks (anderes Repo: benediktkraus/dreviho).

### Semble CLI
Bereits installiert auf dem VPS. Getestet und funktioniert:
- `semble search "query" ./path --top-k 5` → findet relevante Funktionen/Klassen
- `semble index .` → baut Index unter `.semble/` (<1s, CPU-only)
- 98% Token Savings vs grep+read (Benchmark: 1250 Queries, 63 Repos, 19 Sprachen)
- Model: potion-code-16M (16MB, statisch, kein API Key, kein GPU)

### Architektur-Referenz
DREVIHO Repo: /mnt/onedrive/Workspace/projects/dreviho
- `scripts/auto-recall.mjs` — Hook-Pattern: liest stdin JSON `{prompt}`, gibt `{decision, hookSpecificOutput: {additionalContext}}` zurück
- `scripts/config.mjs` — Config-Loader
- `shared/scope-resolver.mjs` — CWD → Project Slug + Scopes (SSoT)
- `install.sh` — Multi-CLI Installer
- `hooks/*.json` — Hook-Definitionen pro CLI

### Zu bauende Scripts
1. `scripts/code-recall.mjs` (UserPromptSubmit) — semble search, rerank, inject als `<relevant-code>`
2. `scripts/code-bootstrap.mjs` (SessionStart) — `.semble/` Index prüfen, bauen wenn nötig
3. `scripts/config.mjs` — Semble-spezifisch (top_k, excludes, semble_path)
4. `scripts/debug-log.mjs` — Logging (Reuse-Pattern)

### Hook-Events pro CLI
| CLI | Recall | Bootstrap |
|-----|--------|-----------|
| Claude Code | UserPromptSubmit | SessionStart |
| Codex CLI | UserPromptSubmit | — |
| Gemini CLI | BeforeAgent | — |

### Reranking-Features
- Definition Boost: Funktions-/Klassen-Definitionen höher ranken als Referenzen
- Noise Penalty: Tests, .d.ts, generated Files, node_modules runterranken
- File Coherence: Chunks aus derselben Datei gruppieren
- Identifier Stems: Query-Keywords mit Code-Identifiern matchen

### Ziel
GitHub-taugliches Open Source Projekt. Apache-2.0. README mit Badges, CONTRIBUTING.md, Tests.

### Research
Vollständige Landscape-Analyse: /mnt/onedrive/Workspace/projects/dreviho/.internal/CODE-INTELLIGENCE-LANDSCAPE.md
