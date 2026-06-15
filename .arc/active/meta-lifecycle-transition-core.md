# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Phase 4 complete (Tasks 4.1–4.7) — the full inverse-paired verb set under
  `lib/work-unit/verbs/` + `side-effects/`: `stub`, `promote`/`demote`, `park`/`resume` (+ the pointer-record),
  `reopen` (+ the `withdraw-pr` gh side-effect), the narrow `deactivate`, `abandon`, and the `activate` dep-edge
  discharge write — each an executor-dispatched transition; lib contracts only (CLI surface deferred to Phase 6)
- **Next Task:** `Task 5.1 — start full lifecycle-state dispatch (line ~309)`
- **Blockers:** [none]

- **Next Action:** Begin Task 5.1 — extend `handlers/start.ts` to full-lifecycle dispatch routing on the
  resolver's resolved state (recomposing the create-new / cold-start arms on the bundle legs, not the coarse
  `spawnWorktree`) and wire the name-collision + worktree-occupancy guards, per
  `tasks-lifecycle-transition-core.md`.

---
