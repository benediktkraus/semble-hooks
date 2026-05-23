# ADR-004: Output-Tag <relevant-code> statt <relevant-memories>

## Context
Die Hooks injizieren Context in den Agent-Prompt. DREVIHO nutzt `<relevant-memories>`. Semble-Hooks brauchen einen eigenen Tag damit der Agent unterscheiden kann was Code-Kontext und was Memory-Kontext ist.

## Decision
Code-Chunks werden als `<relevant-code>` Block injiziert.

## Alternatives Considered
- **`<relevant-memories>`:** Abgelehnt — Verwechslung mit DREVIHO. Agent könnte Code als Erinnerung interpretieren.
- **`<context>`:** Abgelehnt — zu generisch, kollidiert mit System-Context.
- **`<code-context>`:** Abgelehnt — `<relevant-code>` ist kürzer und parallel zu `<relevant-memories>`.

## Consequences
- Klare Trennung: Agent sieht `<relevant-code>` = Code aus dem Projekt, `<relevant-memories>` = Wissen aus OpenViking
- Beide können gleichzeitig im selben Prompt erscheinen ohne Verwechslung
- Konvention ist gesetzt und sollte nicht geändert werden
