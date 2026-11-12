# Draft: Gate Coverage Audit

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-10-09); captured during `quality-gate-hooks` draft close,
  2026-10-07.
- **Purpose:** Flag a project script that no declared check runs.

---

## Problem / Motivation

Gate commands drift as a project adds scripts (a second typecheck, a new test tier). Four recurrences
here (2026-04-23, 2026-05-05, 2026-05-06, 2026-05-08) were all a test typecheck never wired to local enforcement.
`quality-gate-hooks` removed its `arc check-gates` audit at consolidation: one check declaration that hooks, fire
sites, and CI all run removes the local / CI drift those recurrences were. What remains is a script neither runs.

## Direction

Compare detected ecosystem scripts (npm `package.json` scripts; Cargo aliases, Make targets, justfile
recipes) with the declaration's commands, and flag what none runs; re-runnable, and offered by initial setup's
bootstrap. Open: per-ecosystem detection, the false-positive boundary, and whether it surfaces as a command or an
advisory.

## Dependencies

Needs `quality-gate-hooks`' check declaration.

The original text is in `git show 7ea9addfa:.arc/active/draft-quality-gate-hooks.md` § Scope > In scope,
"Gate-coverage drift detection", and § Unknowns and Assumptions.
