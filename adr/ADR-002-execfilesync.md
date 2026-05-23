# ADR-002: CLI-Aufruf via execFileSync statt MCP/Daemon

## Context
Semble CLI muss aus Node.js Hook-Scripts aufgerufen werden. Drei Optionen: execFileSync (synchroner Prozess-Aufruf), MCP Server (permanenter Hintergrundprozess), oder direkter Python-Import.

## Decision
child_process.execFileSync mit Array-Args.

## Alternatives Considered
- **execSync:** Abgelehnt — Shell-Injection-Risiko weil der User-Prompt als Shell-String interpretiert werden könnte.
- **MCP Server:** Abgelehnt — Semble hat keinen stabilen MCP-Modus für Hook-Integration. MCP-Server-Start dauert zu lange für Hook-Timeouts.
- **Python-Import (spawn):** Abgelehnt — zusätzliche Komplexität, Python-Pfad-Management.
- **Daemon/Background-Prozess:** Abgelehnt — unnötige Komplexität für einen Aufruf der <2s dauert.

## Consequences
- Sicherer Aufruf: User-Prompt wird als einzelnes Array-Element übergeben, nie Shell-interpoliert
- Synchron: Hook wartet auf Ergebnis, einfaches Error-Handling
- Kein persistenter Prozess: jeder Search startet frisch (Semble cached Index on-disk)
- Performance: ~200ms Overhead für Python-Startup pro Aufruf (akzeptabel bei 8s Timeout)
