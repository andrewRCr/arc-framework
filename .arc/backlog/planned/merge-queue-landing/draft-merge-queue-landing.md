# Draft: Merge Queue Landing

- **Origin:** [internal] — routed from the personal inbox at the 2026-10-03 housekeep drain.
- **Purpose:** Let ARC land an approved work-unit or Errand head through a repository's configured merge queue,
  with the authorization, observation, and later merge or ejection states stated explicitly.
- **Commitment:** Planned; P3. This repository uses no merge queue, so the capability is not urgent.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's next planning iteration._

### `[ ]` **Fold Owner direction and the cost of repeated CI runs into merge-queue landing's design**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-09). Re-grounded there: the capture's fixed-capacity
  premise went with the self-hosted runners.

- _Shapes:_ its Planning Seed entry "Land through a configured merge queue": which checks run on the merge group and
  which on the head, and whether a green result carries across heads.

- _Owner direction (2026-10-05):_ ARC should align with merge queues and compose with them without friction, as the
  industry's answer to integration churn. The work comes after the storage cutover. The draft's "not urgent" reads
  as timing only, not as doubt about whether the capability matters.

- _Observation:_ PR #812 ran the full CI suite three times — its implementation, a warranted reconcile with
  `storage-contract` (#810/#811: 266 files, one overlapping path), and a forced reconcile on #813 + #814, which shared
  no path with it. The execute-bound Errand "Proceed on disjoint base movement while GitHub's test merge lags, instead
  of forcing a reconcile" removes the forced case. A queue answers the overlapping case: it tests the projected base
  once per change instead of having every branch chase `main`.

- _Design questions to add:_
    - Cost. GitHub's queue runs required checks on a `merge_group` event in addition to the pull-request head, so
      without batching, or replacing the full head run (for example light checks on the head and the full suite on
      the merge group), it adds a full run per change. CI now runs on GitHub-hosted runners in a public repository,
      so the cost is wall time and landing latency rather than a fixed runner pool. Decide which checks run where,
      and whether a green result on an identical code tree carries across heads; `scripts/classify-change.sh`'s
      verified-tree lookback reuses results only within one pull request.
    - `.github/workflows/ci.yml` has no `merge_group` trigger, and its required `ci-ok` roll-up (with `merge-ok` as a
      thin compatibility alias) runs only on `pull_request` and pushes to `main`, so a queue here would wait on a
      check that never reports.

- _Retired at the drain:_ the capture's runner-capacity figures (about 26 runner-minutes per full run on two
  self-hosted runners) and its settled-first priority question, both specific to that fixed pool.

- _Captured during:_ the 2026-10-05 discussion of CI reruns after base movement and of contention between
  concurrent landings.

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
