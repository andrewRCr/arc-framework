# Metadata: ci-content-aware-depth

| **State** | **Owner** | **Branch**                     | **Class** | **Priority** |
| --------- | --------- | ------------------------------ | --------- | ------------ |
| `Active`  | `andrew`  | `chore/ci-content-aware-depth` | `Heavy`   | `P2`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-ci-content-aware-depth.md`
- **Task List:** `tasks-ci-content-aware-depth.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 2.3 — Retire the per-push delta machinery (Phase 2 complete)
- **Next Task:** Task 3.1 — Add `concurrency` with `cancel-in-progress` (line ~140)
- **Blockers:** [none]

- **Next Action:** Begin Task 3.1 — add a workflow-level `concurrency` group keyed on
  `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`; leave `docs.yml`'s `pages`
  group untouched (tasks-ci-content-aware-depth.md)

- **PR URL:** [none]
- **Completed:** [none]

---
