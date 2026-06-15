# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Task 5.R.3 — Register the non-destructive verb commands (`stub` / `promote` / `demote` /
  `park` / `resume` / `activate` / `deactivate` as top-level CLI commands over the shared dispatch scaffold), plus
  5.R.3.a's `runActivate` verb + `discharge-dep-edges` binding and 5.R.2's dispatch scaffold / 5.R.1's handler rename
- **Next Task:** `Task 5.R.4 — abandon command — destructive-cascade gate (line ~428)`
- **Blockers:** [none]

- **Next Action:** Start Task 5.R.4 — `arc abandon <slug>` prints the cascade/impact plan (branch local+remote,
  worktree, artifacts, user-workspace, ROADMAP row) and refuses without `--yes`; the `confirmation` guard (built in
  4.6) reads `--yes` as its `inputs` value, the executor stays pure mechanics. Then 5.R.5 (`reopen` merge-fact read),
  5.R.6 (re-point `draft-design` stub leg) close Phase 5.R before Phase 6.

---
