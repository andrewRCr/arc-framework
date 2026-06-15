# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** `generate-tasks` — `tasks-lifecycle-transition-core.md` (high depth, 3-pass) + grounding
  audit; spec §§1/6/7/13–14 propagated, `notes-lifecycle-transition-core.md` authored
- **Next Task:** `Task 1.1 — Transition-record & verb-set types (line ~13)`
- **Blockers:** [none]

- **Next Action:** Begin Task 1.1 — define the transition-record & verb-set types (`Verb` / `GuardId` /
  `SideEffectId` / `MutatorSpec` / `TransitionRecord` with `softFields`, plus the `markedIllegal` list) in a new
  `lib/work-unit/lifecycle-transitions.ts`, per `tasks-lifecycle-transition-core.md`.

---
