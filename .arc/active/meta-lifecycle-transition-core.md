# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Phase 2 — the 1↔1 mutator bundle & transition side-effects (Tasks 2.1–2.5): the four
  phase-aware mutators (`relocate-artifacts`, `reconcile-branch`, `reconcile-worktree` incl. execution-locus
  relocation, `set-phase`) and the location-move side-effects (`reconcile-status-user` + `reconcile-roadmap`,
  `user-workspace`), all under `lib/work-unit/{mutators,side-effects}/` with injected fs/git seams and unit tests
- **Next Task:** `Task 3.1 — executeTransition dispatch (line ~152)`
- **Blockers:** [none]

- **Next Action:** Begin Task 3.1 — the thin executor `executeTransition(verb, slug, inputs)`: resolve state via the
  resolver, look up the legal edge, validate guards, fire the Phase 2 mutator bundle, then fire side-effects; Phase 3
  also adds the name-collision + worktree-occupancy foot-gun guards, per `tasks-lifecycle-transition-core.md`.

---
