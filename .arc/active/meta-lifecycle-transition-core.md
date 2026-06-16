# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Task 5.R.6 — Re-point `draft-design`'s stub leg, completing Phase 5.R (5.R.4 `abandon`
  command + destructive-cascade gate, 5.R.5 `reopen` command + the foundational `withdraw-pr` executor binding,
  5.R.6 stub-leg re-point)
- **Next Task:** `Task 6.1 — archive sweep + dated-path computation in the executor (line ~491)`
- **Blockers:** [none]

- **Next Action:** Start Task 6.1 — compute + execute the `archive` relocation in the executor: the dated
  `completed/{YYYY-qN}/{NN}_{name}/` destination from an injected clock + `completed-index.ts`'s quarter scan, the
  `relocate-artifacts` move, and the context-defaulting `arc archive` command bound alongside. Then 6.2 (cohort-doc
  archival sweep), 6.3 (slug→state read surface), 6.4 (re-point existing workflows) before Phase 7.

---
