# Metadata: In-Flight Awareness

- **State:** Active
- **Owner:** andrew
- **Branch:** feat/in-flight-awareness

- **Origin:** [internal]
- **Design:** `spec-in-flight-awareness.md`

- **Depends On:** worktree-foundation
- **Cohort:** agile-parallelism

- **Task List:** `tasks-in-flight-awareness.md`
- **Last Completed:** Task 4.3 — Session-init Materialize arm, the WU path (line ~248). Phase 4 complete: the
  Materialize quadrant shipped — oracle candidate detection (`materializable-work-units.ts`), the gated probe
  slot (fires only on `active.resolution === "none"`), and the `session-init.md` Materialize-arm wiring.
- **Next Task:** Task 5.1 — Swap the concurrency check data source to the oracle (line ~279)
- **Blockers:** [none]

- **Next Action:** Begin Task 5.1 — repoint `in-flight-scope-check.md`'s data source from the local-only
  `arc active roster` to the oracle (identity-filtered refs + PRs), carrying `Design` in the oracle output;
  absorbs the interim errand-state probe + in-flight errand sweep. Still advisory, never a gate.

---
