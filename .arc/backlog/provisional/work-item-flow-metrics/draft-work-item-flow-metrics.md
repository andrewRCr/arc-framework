# Draft: work-item-flow-metrics

**Purpose:** Measure working, blocked, and paused time from store transitions and define an honest flow-efficiency
signal.

- **Origin:** [internal] — inbox routing, 2026-10-19; original capture provenance is retained below.
- **Planning posture:** provisional; `P2`; `Heavy`. This capture draft carries unresolved design input; no approved
  design is implied.

---

## Concerns

### Measure where a work item's time goes: waiting versus working

- _Observation:_ nothing measures flow. Sequencing the storage program on 2026-10-15 found work units activated but idle
  on a dependency, a projection start rule that serializes behind the longest member, and no way to see how much time
  waiting costs; only review-to-merge time is measured (`review-orchestration-right-sizing`, its measurement entry). The
  `throughput` target in the Owner's steering map has no done-signal without such a measure.
- _Approach:_ derive per-work-item time in each state, and time blocked or paused versus progressing, from the store's
  transition history after the cutover, with flow efficiency (working time over elapsed time) as the summary. Candidate
  homes: `goal-aware-direction` (a recommender input), `status-hud`, `operational-advisory-registers`.
- _Captured during:_ the 2026-10-15 housekeep session, the dependency-model and throughput discussion.

---
