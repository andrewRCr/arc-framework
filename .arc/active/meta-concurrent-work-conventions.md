# Metadata: Concurrent Work Conventions

| **State**  | **Owner** | **Branch**                         | **Class** | **Priority** |
| ---------- | --------- | ---------------------------------- | --------- | ------------ |
| `Planning` | `andrew`  | `plan/concurrent-work-conventions` | `Heavy`   | `P1`         |

- **Cohort:** `agile-parallelism`
- **Depends On:** `scalable-authoring-pipeline`, `decomposition-machinery`

- **Origin:** [internal]
- **Design:** `draft-concurrent-work-conventions.md`
- **Task List:** [none]

- **Last Completed:** Terminal-state settle — 3 PRD-gating opens resolved, four-WU decomposition (D1–D4)
  recorded, AWL coordination note routed, async audit run (`92ac4c5b`)
- **Next Task:** [none]
- **Blockers:** [none] — both build-order deps (`scalable-authoring-pipeline`, `decomposition-machinery`)
  have shipped; the scalable authoring pipeline and decomposition machinery are available.

- **Next Action:** Active planning (`draft-design`). Consolidate the draft to formalization-ready: cohesion
  pass against what the shipped deps actually delivered, integrate the five Inbound Buffer items against the
  cut, retire the stale parked/AWL framing, and lock the cut-map (four member slugs + edges + boundaries).
  Then run `decompose-work-unit` — its terminal act on this branch — to mint sub-cohort
  `agile-parallelism/concurrent-work-conventions/` and scaffold the four members.

---
