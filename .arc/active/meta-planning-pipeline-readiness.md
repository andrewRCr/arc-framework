# Metadata: Planning-Pipeline Readiness

| **State**  | **Owner** | **Branch**                         | **Class** | **Priority** |
| ---------- | --------- | ---------------------------------- | --------- | ------------ |
| `Planning` | `andrew`  | `plan/planning-pipeline-readiness` | `Heavy`   | `P2`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-transition-core`

- **Origin:** [internal]
- **Design:** `draft-planning-pipeline-readiness.md`
- **Task List:** [none]

- **Last Completed:** Scope-split settled — spun the iteration-content concerns into `planning-iteration-mechanics`
  and the cold-start-init cleanup into `cold-start-init-polish` (both `planned`, on errand PR #110), and trimmed the
  draft to its four-concern readiness / stage-pointer spine.
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Continue `draft-design` iteration — integrate the four spine concerns into a coherent draft body
  toward formalization-ready, and settle the buffer-drain seam contract with `planning-iteration-mechanics` (PPR
  owns the readiness criterion; that WU owns the drain ceremony). Gate discharged: `lifecycle-transition-core`
  shipped — its executor encoding pattern backs the stage-pointer fields.

---
