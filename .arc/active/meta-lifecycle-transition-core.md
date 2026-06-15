# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Phase 4 (partial) — the first verb handlers (Tasks 4.1–4.2): `runStub` (the create
  chokepoint enforcing commitment + priority, scaffolding the backlog-tier meta) and `runPromote` / `runDemote`
  (the backlog-tier inverse pair with the Class ratchet), under `lib/work-unit/verbs/`
- **Next Task:** `Task 4.3 — park / resume & the pointer-record (line ~228)`
- **Blockers:** [none]

- **Next Action:** Begin Task 4.3 — `park` / `resume` & the pointer-record: `park@Active` preserves the pushed
  branch and lands a render-pointer on `main` (meta `State: Active`, `parked` derived from location), `resume`
  re-attaches; adds the `--reason` input and the park-from-`Integrating` guard, per
  `tasks-lifecycle-transition-core.md`.

---
