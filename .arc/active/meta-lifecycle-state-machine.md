# Metadata: lifecycle-state-machine

| **State**  | **Owner** | **Branch**                     | **Class** | **Priority** |
|------------|-----------|--------------------------------|-----------|--------------|
| `Planning` | `andrew`  | `plan/lifecycle-state-machine` | `Novel`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `draft-lifecycle-state-machine.md`
- **Task List:** [none]

- **Last Completed:** Rough draft authored — framing, today's-state inventory, four pillars, north star,
  forward-compat threads, and the completeness-audit method; `park-resume-lifecycle` superseded + retired.
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Iterate the draft toward spec readiness (high-path iterative shaping; `Novel`). Start from the
  central open question — CLI-migration depth (which transition *mechanics* move to code vs. stay workflow
  judgment); it gates the other open questions. Then the state-model representation (phase ⊥ location) and the
  verb-naming pass. Coordinate forward-compat with `composable-workflows` (workflow-shell boundary), `arc-backend`
  (state-as-record / pluggable persistence) + `strategy-storage-evolution.md`, and `idiomatic-alignment` (verb
  naming).

---
