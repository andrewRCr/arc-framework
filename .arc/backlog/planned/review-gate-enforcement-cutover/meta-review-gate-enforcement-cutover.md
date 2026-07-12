# Metadata: Review Gate Enforcement Cutover

| **State**  | **Owner** | **Branch** | **Class** | **Priority** |
| ---------- | --------- | ---------- | --------- | ------------ |
| `Planning` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** `review-gate-reconcile-composition`

- **Origin:** [internal]
- **Design:** `draft-review-gate-enforcement-cutover.md`
- **Task List:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Setup baseline captured before the composition gap was discovered (2026-07-11).
- **Next Task:** [none]
- **Blockers:** `review-gate-reconcile-composition` must merge so default-branch dispatch executes composed entries.

- **Next Action:** After the dependency ships, start with the runbook authentication probes: re-enable
  `review-gate.yml`, prove the App source/repository scope and default-branch boundary, then execute the shadow
  provider/evidence matrix under checkpoint discipline. Do not promote a context or activate project hooks before
  its preceding exact-head proof passes.

- **PR URL:** [none]
- **Completed:** [none]

---
