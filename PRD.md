# PRD — semble-hooks

## Vision
Jeder AI Coding Agent (Claude Code, Codex, Gemini) bekommt bei jedem Prompt automatisch die 5 relevantesten Code-Chunks aus dem aktuellen Projekt injiziert — ohne dass der Agent grep/read/glob Calls machen muss. 98% weniger Tokens, bessere Antworten, null Konfiguration.

## Target Users / Personas

### DER POWER-USER
- Rolle: Entwickler der täglich mit AI Coding CLIs arbeitet (Claude Code, Codex, Gemini)
- Pain: Agent liest ständig Files die er nicht braucht, verschwendet Tokens und Zeit mit grep+read Zyklen
- Goal: Agent versteht sofort den relevanten Code-Kontext ohne manuelles Zeigen
- Tech Comfort: Hoch — CLI-affin, installiert Tools via pip/npm

### DER OPEN-SOURCE-CONTRIBUTOR
- Rolle: Entwickler der OSS-Projekte mit AI Agents bearbeitet
- Pain: Bei fremden Codebases dauert es 5-10 Agent-Turns bis der relevante Code gefunden ist
- Goal: Sofortiger Code-Kontext auch in unbekannten Repos
- Tech Comfort: Hoch — kennt Git, Package Manager, CLI Tools

### DER MULTI-CLI-USER
- Rolle: Nutzer der zwischen Claude Code, Codex und Gemini wechselt
- Pain: Jede CLI hat ein anderes Hook-System, Code-Context manuell konfigurieren ist pro CLI Arbeit
- Goal: Ein Install-Script, alle CLIs haben Code-Intelligence
- Tech Comfort: Mittel bis hoch — will es einmal einrichten und vergessen

## Features (MoSCoW)

| Feature | Priority | One-Liner |
|---------|----------|-----------|
| Code Recall Hook | Must | Bei jedem Prompt die Top-k relevantesten Code-Chunks injizieren |
| Session Bootstrap | Must | Beim Session-Start Semble-Index warmlaufen lassen |
| Multi-CLI Support | Must | Claude Code, Codex CLI, Gemini CLI mit einem Installer |
| Config System | Must | JSON Config mit sinnvollen Defaults und ENV-Overrides |
| Debug Logging | Must | Strukturiertes JSON-Lines Logging für Troubleshooting |
| Graceful Degradation | Must | Kein Error wenn Semble nicht installiert ist |
| Reranking | Should | Definition Boost, Noise Penalty, File Coherence |
| install.sh | Must | Ein Script installiert Hooks für alle CLIs |
| README mit Badges | Should | GitHub-taugliche Dokumentation |
| CONTRIBUTING.md | Could | Contributor Guide |

### Must-Have Features (EXPANDED)

#### F-001: Code Recall Hook (code-recall.mjs)
**User Story:** "As a developer using an AI CLI, I want relevant code chunks automatically injected into every prompt, so that the agent understands my codebase without manual file reads."
**Acceptance Criteria:**
- [ ] Liest stdin JSON `{prompt}` vom Hook-System
- [ ] Ruft `semble search` via execFileSync mit dem User-Prompt als Query auf
- [ ] Parsed Semble-Output (Markdown-formatierte Chunks mit Datei, Zeilen, Score)
- [ ] Injiziert Top-k Chunks als `<relevant-code>` Block in additionalContext
- [ ] Gibt `{decision: "approve", hookSpecificOutput: {additionalContext}}` auf stdout
- [ ] Timeout: max 8 Sekunden, danach approve ohne Context
- [ ] Leerer/kurzer Prompt (<3 Zeichen) → approve ohne Search
**Dependencies:** config.mjs, debug-log.mjs
**Effort:** M (3-5d)

#### F-002: Session Bootstrap (code-bootstrap.mjs)
**User Story:** "As a developer starting a new AI session, I want the code index pre-warmed, so that my first prompt gets instant code context."
**Acceptance Criteria:**
- [ ] Prüft ob `semble` Binary im PATH oder unter konfiguriertem Pfad existiert
- [ ] Führt einen Warmup-Search (`semble search "main entry point" . -k 1`) aus um den Index zu cachen
- [ ] Loggt Semble-Version und Index-Status
- [ ] Gibt `{decision: "approve"}` auf stdout (kein additionalContext nötig)
- [ ] Timeout: max 120 Sekunden (Index-Build kann bei großen Repos dauern)
- [ ] Graceful: wenn semble nicht gefunden → approve ohne Warmup
**Dependencies:** config.mjs, debug-log.mjs
**Effort:** S (1-2d)

#### F-003: Multi-CLI Hook Definitions
**User Story:** "As a multi-CLI user, I want hook definitions for Claude Code, Codex, and Gemini, so that all my CLIs get code intelligence."
**Acceptance Criteria:**
- [ ] hooks/claude-code.json: UserPromptSubmit → code-recall.mjs, SessionStart → code-bootstrap.mjs
- [ ] hooks/codex-cli.json: UserPromptSubmit → code-recall.mjs
- [ ] hooks/gemini-cli.json: BeforeAgent → code-recall.mjs
- [ ] Timeouts korrekt pro CLI (ms vs Sekunden)
- [ ] Pfad-Variablen pro CLI korrekt (`${SEMBLE_HOOKS_ROOT}`, `./scripts/`, `${extensionPath}`)
**Dependencies:** code-recall.mjs, code-bootstrap.mjs existieren
**Effort:** S (1-2d)

#### F-004: Config System (config.mjs)
**User Story:** "As a user, I want sensible defaults that work out of the box, with the option to customize search depth, excludes, and semble path."
**Acceptance Criteria:**
- [ ] Liest Config aus `~/.semble-hooks/config.json` (erstellt Defaults wenn nicht vorhanden)
- [ ] ENV-Override: `SEMBLE_HOOKS_CONFIG` für alternativen Config-Pfad
- [ ] Config-Keys: `topK` (default 5), `semblePath` (default "semble"), `timeout` (default 8000), `debug` (default false), `debugLogPath`, `excludePatterns` (default [])
- [ ] Validierung: topK 1-20, timeout 1000-30000
- [ ] Export: `loadConfig()` Funktion
**Dependencies:** Keine
**Effort:** S (1-2d)

#### F-005: Debug Logging (debug-log.mjs)
**User Story:** "As a developer troubleshooting hooks, I want structured logs, so that I can see what semble found and why."
**Acceptance Criteria:**
- [ ] Aktiviert via `SEMBLE_HOOKS_DEBUG=1` ENV oder `debug: true` in Config
- [ ] Log-Pfad: `SEMBLE_HOOKS_DEBUG_LOG` ENV oder `~/.semble-hooks/logs/hooks.log`
- [ ] Format: JSON Lines `{ts, hook, stage, data}` / `{ts, hook, stage, error}`
- [ ] Zero-cost no-ops wenn Debug deaktiviert
- [ ] Export: `createLogger(hookName)` → `{log, logError}`
**Dependencies:** config.mjs
**Effort:** S (1-2d)

#### F-006: install.sh
**User Story:** "As a user, I want one script that installs semble-hooks for all my CLIs."
**Acceptance Criteria:**
- [ ] Usage: `./install.sh [claude-code|codex|gemini|all]`
- [ ] Kopiert Scripts nach `~/.semble-hooks/`
- [ ] Erstellt Default-Config wenn nicht vorhanden
- [ ] Claude Code: Registriert Hooks in `.claude/settings.json` oder gibt Anleitung
- [ ] Codex: Kopiert Hook-Definitionen nach Plugin-Verzeichnis
- [ ] Gemini: Kopiert nach `~/.gemini/extensions/semble-hooks/`
- [ ] Prüft ob `semble` installiert ist, warnt wenn nicht
**Dependencies:** Alle Scripts fertig
**Effort:** M (3-5d)

#### F-007: Graceful Degradation
**User Story:** "As a user without semble installed, I want the hooks to silently do nothing, so that my CLI still works."
**Acceptance Criteria:**
- [ ] `which semble` oder konfigurierter Pfad Check vor jedem Aufruf
- [ ] Nicht installiert → `{decision: "approve"}` ohne additionalContext
- [ ] Kein Error auf stderr, kein non-zero Exit Code
- [ ] Debug-Log zeigt "semble not found, skipping"
**Dependencies:** config.mjs
**Effort:** S (1-2d)

### Should-Have Features
- **Reranking:** Definition Boost (Funktions-/Klassen-Definitionen höher), Noise Penalty (Tests, .d.ts, generated runter), File Coherence (Chunks aus gleicher Datei gruppieren). Semble v0.2.0 hat das teilweise eingebaut — evaluieren was zusätzlich nötig ist.
- **README mit Badges:** GitHub-taugliche README mit Install-Anleitung, Usage, Badges (License, npm version wenn published).

### Could-Have Features
- **CONTRIBUTING.md:** Contributor Guide für OSS. Nicht im MVP.
- **npm Package:** Als npm Package publishen. Nicht im MVP — erstmal als Git-Clone installieren.
- **MCP Server Mode:** Semble als MCP statt CLI. Nicht im MVP — CLI ist einfacher und stabiler.

### Won't-Have (this version)
- **Eigener Code-Index:** Kein eigener Index-Mechanismus. Semble macht das.
- **File Watcher:** Kein Auto-Re-Index bei File-Changes. Semble indexiert on-the-fly.
- **Callgraph/Impact Analysis:** Nicht in v1. Dafür gibt es CodeGraph (separates Tool).
- **OpenViking Integration:** Kein OV-API-Call, keine Memories. Das macht DREVIHO.

## Constraints
- **Budget:** Side project, 0 EUR
- **Timeline:** 1 Session Build, dann iterieren
- **Team:** 1 Person (Benedikt)
- **Tech:** Node.js ESM (.mjs), keine Dependencies außer Node.js built-ins
- **Security:** execFileSync mit Array-Args, kein execSync, keine Shell-Injection
- **Size:** Gesamtes Projekt < 500 LOC (ohne Tests/Docs)
- **Latency:** code-recall.mjs muss < 8 Sekunden laufen (Hook-Timeout)

## Security Requirements
- **Shell Injection Prevention:** Kein execSync, nur execFileSync mit Array-Args. User-Prompt wird als einzelnes Argument übergeben, nie in Shell interpoliert.
- **Path Traversal:** Config-Pfade werden via path.resolve() aufgelöst. Kein direktes Zusammensetzen.
- **Keine Secrets:** Kein API Key, kein Token, kein externer Service. 100% lokal.
- **Graceful Failure:** Kein Error-Leak an den Agent. Fehler werden geloggt, nicht propagiert.
- **Input Validation:** Prompt-Länge wird geprüft (min 3 Zeichen). Config-Werte werden geclamt (topK 1-20).
- **No Network:** Keine HTTP-Calls. Semble ist 100% lokal. Kein DNS, kein Fetch.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Semble CLI-Interface ändert sich (Breaking Change) | Medium | High | Output-Parsing robust bauen, Semble-Version loggen, Tests gegen echte CLI |
| Hook-Timeout bei großen Repos (>10k Files) | Medium | Medium | Timeout konfigurierbar, Warmup im SessionStart, Semble indexiert inkrementell |
| Semble Output-Format undokumentiert | High | Medium | Aktuelles Format reverse-engineered und getestet. Bei Breaking Change: Parser anpassen |
| Multi-CLI Hook-Systeme ändern sich | Low | Medium | Hook-JSONs sind trivial anpassbar. Codex/Gemini Hook-Systeme sind stabil |

## Non-Functional Requirements
- **Latency:** code-recall.mjs < 8s (p95), code-bootstrap.mjs < 120s
- **Startup:** Kein npm install nötig. Node.js built-ins only.
- **Compatibility:** Node.js >= 18 (für ESM + top-level await)
- **Portability:** Linux + macOS. Windows: best-effort.
- **Size:** Kein node_modules. Kein Build-Step. Clone + run.

## Open Questions
1. **Semble Output-Parsing:** Das Output-Format (Markdown mit `## N. file:lines [score=X]` + Code-Block) ist reverse-engineered. Gibt es eine JSON-Output-Option? → Recherchieren beim Bau.
2. **Reranking-Mehrwert:** Semble v0.2.0 hat eingebautes Reranking (Definition Boost, Noise Penalty). Wie viel zusätzliches Reranking brauchen wir in code-recall.mjs? → Erst bauen, dann evaluieren.
3. **npm Publish:** Soll das Projekt als npm Package veröffentlicht werden? → Entscheidung nach v1.
