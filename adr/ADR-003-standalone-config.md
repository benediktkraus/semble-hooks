# ADR-003: Standalone Config statt DREVIHO Scope-Resolver

## Context
DREVIHO nutzt einen scope-resolver.mjs der CWD → OpenViking-Scopes mappt (project, system, infra, knowledge, personal). Die ursprüngliche Entscheidung war, diesen als Symlink zu reuse. Für ein Public Repo muss semble-hooks aber standalone funktionieren.

## Decision
Eigene minimale Config unter ~/.semble-hooks/config.json. Kein scope-resolver, kein OV-Dependency.

## Alternatives Considered
- **Symlink zu DREVIHO scope-resolver.mjs:** Abgelehnt — macht semble-hooks abhängig von DREVIHO-Installation. Public Repo muss standalone sein.
- **Kopie des scope-resolvers:** Abgelehnt — OV-spezifischer Code (viking:// URIs, OV-API-Calls) ist für semble-hooks irrelevant. Semble braucht nur CWD als Suchpfad.

## Consequences
- semble-hooks ist vollständig standalone installierbar
- Kein OpenViking-Server nötig
- Einfachere Config: nur topK, semblePath, timeout, debug, excludePatterns
- Kein Scoping über Projekte hinweg — jeder Search ist CWD-basiert
- Wenn später Scoping gewünscht: kann als eigenes Feature gebaut werden
