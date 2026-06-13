# Metadata: async-merge-lifecycle

| **State**  | **Owner** | **Branch**                   | **Class** | **Priority** |
| ---------- | --------- | ---------------------------- | --------- | ------------ |
| `Active`   | `andrew`  | `feat/async-merge-lifecycle` | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** `concurrent-work-doctrine`, `merge-safety-mechanism`, `notes-merge-coherence`

- **Origin:** [internal]
- **Design:** `spec-async-merge-lifecycle.md`
- **Task List:** `tasks-async-merge-lifecycle.md`

- **Last Completed:** Generated + activated `async-merge-lifecycle` — `tasks-async-merge-lifecycle.md` (`high`
  depth, 6 phases + verification, 13 parents); planning complete.
- **Next Task:** Task 1.1 — `classifyInFlightWorkUnits` completion-tail classifier (line ~18)
- **Blockers:** [none]

- **Next Action:** Begin Task 1.1 — author test-first the pure `in-flight-work-unit-sweep.ts` classifier,
  mirroring `classifyInFlightErrands`; run via `process-task-loop.md`.

---
