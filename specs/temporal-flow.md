# Temporal Flow — semble-hooks

## User Flows

### Flow 1: Code Recall (Every Prompt)
1. User tippt Prompt in CLI (Claude Code / Codex / Gemini)
2. CLI triggert UserPromptSubmit / BeforeAgent Hook
3. Hook-System startet `node code-recall.mjs` mit `{prompt}` auf stdin
4. code-recall.mjs liest Config (config.mjs)
5. code-recall.mjs prüft: semble installiert? Prompt lang genug?
6. code-recall.mjs ruft `semble search "prompt" . -k 5` via execFileSync
7. Semble sucht im CWD (on-the-fly Index wenn nötig), gibt Markdown-Chunks zurück
8. code-recall.mjs parsed Output → extrahiert Datei, Zeilen, Score, Code
9. code-recall.mjs baut `<relevant-code>` Block
10. code-recall.mjs gibt `{decision: "approve", hookSpecificOutput: {additionalContext}}` auf stdout
11. CLI injiziert additionalContext in den Agent-Prompt
12. Agent sieht relevanten Code-Kontext, antwortet besser

**Error States:**
- Semble nicht installiert → Step 5 returns early, approve ohne Context
- Prompt zu kurz (<3 Zeichen) → approve ohne Search
- Semble Search timeout (>8s) → approve ohne Context, Error geloggt
- Semble Search findet nichts → approve ohne Context
- Semble Output unparseable → approve ohne Context, Error geloggt

**Edge Cases:**
- Leeres Projekt (kein Code) → Semble gibt leeres Ergebnis, approve ohne Context
- Riesen-Repo (100k+ Files) → Semble indexiert langsam, aber innerhalb Timeout weil inkrementell
- Binary-Dateien im CWD → Semble ignoriert Binaries (Tree-sitter filtered)

### Flow 2: Session Bootstrap (Session Start, nur Claude Code)
1. User startet Claude Code Session
2. CLI triggert SessionStart Hook
3. Hook-System startet `node code-bootstrap.mjs`
4. code-bootstrap.mjs prüft: semble installiert?
5. code-bootstrap.mjs führt Warmup aus: `semble search "main" . -k 1`
6. Semble baut Index für CWD (on-the-fly), cached für folgende Searches
7. code-bootstrap.mjs loggt: Semble-Version, Index-Status, Dauer
8. code-bootstrap.mjs gibt `{decision: "approve"}` auf stdout

**Error States:**
- Semble nicht installiert → approve, Log "semble not found"
- Warmup timeout (>120s) → approve, Log "warmup timeout"
- CWD hat keinen Code → Semble indexiert nichts, approve

### Flow 3: Installation
1. User clont Repo: `git clone github.com/benediktkraus/semble-hooks`
2. User führt aus: `./install.sh claude-code` (oder codex, gemini, all)
3. install.sh prüft: semble installiert? (warnt wenn nicht)
4. install.sh kopiert Scripts nach ~/.semble-hooks/
5. install.sh erstellt Default-Config ~/.semble-hooks/config.json
6. install.sh registriert Hooks für gewählte CLI
7. User startet nächste Session → Hooks aktiv

## State Transitions

```
[Not Installed] → install.sh → [Installed, Idle]
[Installed, Idle] → Session Start → [Warming Up] → [Ready]
[Ready] → User Prompt → [Searching] → [Injecting] → [Ready]
[Searching] → Timeout → [Ready] (no context)
[Searching] → No Results → [Ready] (no context)
[Searching] → Error → [Ready] (no context, logged)
```

## Timing
- **code-recall.mjs:** Trigger bei jedem Prompt. Timeout 8s. Typisch <2s.
- **code-bootstrap.mjs:** Trigger bei SessionStart. Timeout 120s. Typisch <5s (kleines Repo), <30s (großes Repo).
- **Kein Cron:** Keine scheduled Tasks. Alles event-driven via Hook-System.
- **Kein File Watcher:** Semble indexiert on-the-fly. Kein Background-Prozess.
