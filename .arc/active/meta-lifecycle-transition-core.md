# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Task 6.5 — executor owns the meta `Branch`-field encoding end-to-end (6.5.a write · 6.5.b
  soft-field disposition audit · 6.5.c branch-field consistency walk)
- **Next Task:** `Task 6.6.a — init-work-unit Path A → call the start transition (line ~607)`
- **Blockers:** [none]

- **Next Action:** Begin Phase 6.6 (re-point existing workflows to the executor) at Task 6.6.a — `init-work-unit`
  Path A calls the `start` transition for both the spawn (`arc start`) and in-place (`--here`) paths, dropping the
  inline `git mv` _and_ the inline `Branch`-field reconciliation (the executor owns the `Branch` write as of 6.5.a).
  Phase 6.6 is markdown + wiring (not test-first) — existing integration/E2E exercises the re-pointed paths.

---
