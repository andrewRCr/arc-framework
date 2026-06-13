# Metadata: async-merge-lifecycle

| **State**  | **Owner** | **Branch**                   | **Class** | **Priority** |
| ---------- | --------- | ---------------------------- | --------- | ------------ |
| `Planning` | `andrew`  | `plan/async-merge-lifecycle` | `Heavy`   | `P2`         |

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

- **Next Action:** Run `activate-work-unit.md` — flip `State: Planning → Active`, rename
  `plan/async-merge-lifecycle → feat/async-merge-lifecycle`. Implementation begins on the renamed branch at Task
  1.1 (`classifyInFlightWorkUnits`). `Class: Heavy` confirmed by the scale read.

---
