# ADR-001: Eigenes Repo statt DREVIHO-Integration

## Context
Semble-Hooks (Code-Intelligence) und DREVIHO (Memory-Hooks) adressieren verschiedene Probleme: Code-Kontext vs. Entscheidungs-/Wissens-Kontext. Die Frage war ob beide im selben Repo leben oder getrennt werden.

## Decision
Separates GitHub Repo (benediktkraus/semble-hooks).

## Alternatives Considered
- **Integration in DREVIHO:** Abgelehnt — verschiedene Concerns, verschiedene Release-Zyklen, verschiedene Zielgruppen. DREVIHO braucht OpenViking-Server, Semble-Hooks sind standalone.
- **Monorepo mit Workspaces:** Abgelehnt — Overhead für 2 kleine Projekte.

## Consequences
- Semble-Hooks können unabhängig released und installiert werden
- Kein Scope-Resolver-Sharing via Import, muss als eigenständiges Modul existieren oder kopiert werden
- User muss beide Repos separat installieren wenn er beides will
- Migration: wenn sich zeigt dass die Projekte stark konvergieren, können sie später zusammengeführt werden
