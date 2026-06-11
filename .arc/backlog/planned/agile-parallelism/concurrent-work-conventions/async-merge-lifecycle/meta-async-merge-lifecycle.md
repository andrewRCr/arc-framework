# Metadata: async-merge-lifecycle

| **State**  | **Owner** | **Branch** | **Class** | **Priority** |
| ---------- | --------- | ---------- | --------- | ------------ |
| `Planning` | `andrew`  | [none]     | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** `concurrent-work-doctrine`, `merge-safety-mechanism`

- **Origin:** [internal]
- **Design:** `draft-async-merge-lifecycle.md`
- **Task List:** [none]

- **Last Completed:** [none]
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Activate via `init-work-unit` Path A after `merge-safety-mechanism` lands (reuses its behind-base
  primitive in the completion sweep), then `create-spec` from `draft-async-merge-lifecycle.md`. Ships the
  suspend/resume seam, the in-flight completion sweep, merge-gate-awareness (option B on `integrate-work-unit`), the
  `arc start` create-new wiring, the subdir-removal primitive, and cohort-doc discovery. Watch: may itself recurse
  into a lateral split if too large for one PR.

---
