# ADR-005: SessionStart Warmup statt Index-Befehl

## Context
Semble v0.2.0 hat keinen separaten `index`-Befehl. Indexing passiert on-the-fly beim ersten `search`. Der erste Search in einem neuen Projekt ist daher langsamer. Die Frage war ob der SessionStart-Hook einen Pre-Warmup machen soll.

## Decision
code-bootstrap.mjs führt beim SessionStart einen Warmup-Search aus (`semble search "main" . -k 1`) um den Index zu cachen.

## Alternatives Considered
- **Kein SessionStart-Hook:** Abgelehnt — erster Prompt hätte spürbare Latenz.
- **Nur Health Check:** Abgelehnt — prüft ob semble da ist, cached aber den Index nicht.
- **Eigenen Index-Befehl bauen:** Abgelehnt — Semble cached intern, eigener Index wäre Duplikation.

## Consequences
- Erster Prompt nach SessionStart hat sofort schnelle Code-Suche
- Warmup-Search ist ein Dummy-Query ("main") der den Index baut ohne nützlichen Output
- SessionStart dauert etwas länger (typ. 2-10s je nach Repo-Größe), aber das ist akzeptabel
- Wenn Semble einen Index-Befehl zurückbringt, kann der Warmup durch den Index-Befehl ersetzt werden
