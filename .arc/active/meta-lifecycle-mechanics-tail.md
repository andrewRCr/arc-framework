# Metadata: lifecycle-mechanics-tail

| **State**  | **Owner** | **Branch**                      | **Class** | **Priority** |
| ---------- | --------- | ------------------------------- | --------- | ------------ |
| `Planning` | `andrew`  | `plan/lifecycle-mechanics-tail` | `Heavy`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-transition-core`

- **Origin:** [internal]
- **Design:** `draft-lifecycle-mechanics-tail.md`
- **Task List:** [none]

- **Current Workflow:** `draft-design`
- **Last Completed:** Audit first pass — scope boundary settled
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Settle the remaining open questions — teardown timing (with `concurrent-work-conventions`), the
  post-side-effect-write distinct-status fork (Inbound #2), and the archive-finalize inference locus — then
  confirm the one-`Heavy`-WU (no-decompose) read; the draft is otherwise spec-ready.

---
