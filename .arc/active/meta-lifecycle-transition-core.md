# Metadata: lifecycle-transition-core

| **State** | **Owner** | **Branch**                       | **Class** | **Priority** |
|-----------|-----------|----------------------------------|-----------|--------------|
| `Active`  | `andrew`  | `feat/lifecycle-transition-core` | `Novel`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-state-resolver`

- **Origin:** [internal]
- **Design:** `spec-lifecycle-transition-core.md`
- **Task List:** `tasks-lifecycle-transition-core.md`

- **Last Completed:** Task 6.3 — slug→state read surface: the read is now `arc status <slug>` (the `--lifecycle
  <slug>` option became a positional; JSON shape preserved, `resolveSlugQuery` unchanged)
- **Next Task:** `Task 6.4.a — reconcile-branch in-place create (line ~543)`
- **Blockers:** [none]

- **Next Action:** Start Task 6.4.a — give `reconcile-branch.create` a real current-worktree `git checkout -b`
  realization (test-first), opening Task 6.4 (the new in-place `--here` opt-out). See SESSION-NOTES for the design
  context behind why 6.4 was inserted ahead of the 6.5 re-point.

---
