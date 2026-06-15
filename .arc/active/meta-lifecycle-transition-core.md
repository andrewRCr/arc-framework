# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Phase 3 — the thin executor & foot-gun guards (Tasks 3.1–3.2): `executeTransition` (a
  verb-agnostic, table-driven engine over injected mutator / side-effect / guard seams, with an in-place soft-field
  meta writer) plus the `name-collision` / `worktree-occupancy` guard predicates, under `lib/work-unit/`
- **Next Task:** `Task 4.1 — stub creation contract (line ~201)`
- **Blockers:** [none]

- **Next Action:** Begin Task 4.1 — the `stub` creation contract: route every create path through one chokepoint
  that refuses creation without explicit commitment + priority (no silent `provisional` / `P3` default), per
  `tasks-lifecycle-transition-core.md`.

---
