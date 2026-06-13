# Metadata: async-merge-lifecycle

| **State**  | **Owner** | **Branch**                   | **Class** | **Priority** |
| ---------- | --------- | ---------------------------- | --------- | ------------ |
| `Active`   | `andrew`  | `feat/async-merge-lifecycle` | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** `concurrent-work-doctrine`, `merge-safety-mechanism`, `notes-merge-coherence`

- **Origin:** [internal]
- **Design:** `spec-async-merge-lifecycle.md`
- **Task List:** `tasks-async-merge-lifecycle.md`

- **Last Completed:** Generated `tasks-async-merge-lifecycle.md` (`high` depth — 6 phases + verification, 13
  parents). Grounding audit settled the finalize-pass home (`session-handoff` + integrate prompt-catch, inline
  single-authored for `composable-workflows` forward-compat) and pinned `integration.stale_after_days`; decision
  recorded in `notes-async-merge-lifecycle.md` § Finalize pass.
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Begin Task 1.1 — `classifyInFlightWorkUnits` completion-tail state classifier (Phase 1,
  `tasks-async-merge-lifecycle.md`). Test-first pure module mirroring `classifyInFlightErrands`.

---
