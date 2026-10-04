# Draft: Merge Queue Landing

- **Origin:** [internal] — routed from the personal inbox at the 2026-10-03 housekeep drain.
- **Purpose:** Let ARC land an approved work-unit or Errand head through a repository's configured merge queue,
  with the authorization, observation, and later merge or ejection states stated explicitly.
- **Commitment:** Planned; P3. This repository uses no merge queue, so the capability is not urgent.

---

## Planning Seed

### `[ ]` **Land through a configured merge queue**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-03).

- `WU_Target: merge-queue-landing (planned)`

- _Observation:_ ARC's work-unit and Errand merges call GitHub's direct merge, which cannot add a pull request to a
  merge queue, so a repository whose base branch requires one cannot land through `arc integrate merge` or
  `arc errand merge`. GitHub's async merge API (generally available 2026-10-01) can enqueue — `merge_action:
  merge_queue`, or `default` when the target branch has a queue configured.

- _Design questions:_ an `enqueued` answer is not `merged`. The queue merges later, on a combined base ARC never
  observed, which changes what integration-interlock approval authorizes (an exact head admitted to a queue rather
  than an exact merge), how the interlock discloses base currency (today's "in-call merge window" residual race), how
  ARC observes and reports a later queue ejection or merge, and how a queue composes with stacked delivery — native
  stack landing already notes that a merge queue may split the remaining prefix.

- _Priority:_ planned, not urgent. This repository uses no merge queue; it matters to team projects that do.

- _Depends on:_ the held `§ Errand` capture "Move ARC's remaining GitHub merges onto the async merge API".

- _Captured during:_ review of GitHub's async merge API announcement, 2026-10-01.

- _Sequencing:_ first land the async-merge API Errand identified above. That capture remains held in `USER-INBOX`;
  it is a scheduling prerequisite, not a `Depends On` edge to a work unit. Do not start queue implementation before
  the async merge contract is available. Settle the design questions here rather than pulling them into that Errand.

---
