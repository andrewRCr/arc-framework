# Metadata: Work-Routing Discipline

- **State:** Active
- **Owner:** andrew
- **Branch:** `feat/work-routing-discipline`

- **Origin:** [internal]
- **Design:** `spec-work-routing-discipline.md`

- **Depends On:** [none]
- **Cohort:** [none]

- **Task List:** `tasks-work-routing-discipline.md`
- **Last Completed:** Phase 3 Tasks 3.1–3.2 — `drain-inbox.md` drain/route workflow (base-branch write-context
  precondition + four-route logical-model routing + move-not-copy) and the thin `arc-housekeep` skill that
  dispatches it.
- **Next Task:** Task 3.3 — Machine-checked write-context guard (test-first) (line ~482)
- **Blockers:** [none]

- **Next Action:** Start Task 3.3 — author `arc housekeep check` test-first: a new `arc housekeep` command group +
  `src/handlers/housekeep.ts`, mirroring `arc errand check`'s context resolution (`resolvePrimaryWorktreePath`,
  current branch, `branch.base`). Factor the write-context classifier into a shared lib — `run-errand` Launch
  (3.4) reuses it. First TypeScript of the phase.

---
