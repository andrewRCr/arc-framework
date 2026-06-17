# Metadata: Planning-Pipeline Readiness

| **State**  | **Owner** | **Branch**                         | **Class** | **Priority** |
| ---------- | --------- | ---------------------------------- | --------- | ------------ |
| `Planning` | `andrew`  | `plan/planning-pipeline-readiness` | `Heavy`   | `P2`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-transition-core`

- **Origin:** [internal]
- **Design:** `draft-planning-pipeline-readiness.md`
- **Task List:** [none]

- **Last Completed:** Initialized into active planning — graduated from `backlog/planned/`, `Class` resolved to
  `Heavy`, `plan/` branch cut and pushed. Draft iteration not yet begun.
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Iterate the draft toward spec readiness via `arc-plan` → `draft-design` — integrate-or-reject
  the draft's eight `## Inbound Buffer` concerns into a coherent cut. First planning move: settle the scope split —
  whether the planning-*content* concerns (#3 inbound-buffer ceremony, #5 depth-aware navigation) split to a
  separate planning-content WU so this member stays spine-focused (the `assess-draft-readiness` method, the
  `create-spec` review/proceed interlock split, the planning-stage-pointer mechanics) — alongside the
  `create-spec` / `draft-design` readiness-ownership seam, before committing scope. Gate discharged:
  `lifecycle-transition-core` shipped, so its executor encoding pattern is available for the stage-pointer fields.

---
