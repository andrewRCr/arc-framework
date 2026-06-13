# Metadata: async-merge-lifecycle

| **State**  | **Owner** | **Branch**                   | **Class** | **Priority** |
| ---------- | --------- | ---------------------------- | --------- | ------------ |
| `Active`   | `andrew`  | `feat/async-merge-lifecycle` | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** `concurrent-work-doctrine`, `merge-safety-mechanism`, `notes-merge-coherence`

- **Origin:** [internal]
- **Design:** `spec-async-merge-lifecycle.md`
- **Task List:** `tasks-async-merge-lifecycle.md`

- **Last Completed:** Task 4.2 — post-merge notes-sync leg in `session-handoff.md`; closes Phase 4. Both Phase 4
  completion primitives are now in place — the standalone `integration` commit-footer anchor and the reusable
  notes-sync leg — for Phase 5 to consume. Phase 3 also shipped this session: `integrate-work-unit.md` is
  idempotent from `Integrating` onward (re-entry guard + re-runnable tail) with symmetric primary/linked-arm
  teardown.
- **Next Task:** Task 5.1 — Same-session finalize pass (line ~239)
- **Blockers:** [none]

- **Next Action:** Begin Task 5.1 — author the bounded same-session finalize pass as a named procedure in
  `session-handoff.md` (poll this session's PRs once with a hard ceiling; merged-clean → eager teardown + the
  notes-sync leg, failed/blocked → loud surface for both lanes, still-pending → hand to the sweep), then wire its
  prompt-catch invocation from `integrate-work-unit.md`'s primary-arm continuation. Phase 5 shifts toward code —
  5.2.c carries a test-first marker for the idempotent slug-line backstops. Both copies; run via
  `process-task-loop.md`.

---
