# Metadata: In-Flight Awareness

- **State:** Active
- **Owner:** andrew
- **Branch:** feat/in-flight-awareness

- **Origin:** [internal]
- **Design:** `spec-in-flight-awareness.md`

- **Depends On:** worktree-foundation
- **Cohort:** agile-parallelism

- **Task List:** `tasks-in-flight-awareness.md`
- **Last Completed:** Task 3.3 — `arc status --user` explicit-view command (line ~178). Phase 3 complete: the
  render standard, the `STATUS.USER` view, and the explicit-view command (render core + oracle wiring + offline
  path) all shipped.
- **Next Task:** Task 4.1 — Materializable-WU candidate detection from the oracle (line ~229)
- **Blockers:** [none]

- **Next Action:** Begin Task 4.1 — filter oracle output by remote-only + owned to surface the operator's
  materialize candidates (test-first), paralleling `materializable-errands.ts`'s candidate shape.

---
