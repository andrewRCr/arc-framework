# Draft: Stacked PR Base CI Freshness

- **Origin:** [internal] — minted at the 2026-09-30 housekeep drain from a `USER-INBOX` capture made during the
  abandoned `stacked-delivery-ci-coverage` Errand (PR #701, 2026-09-24).
- **Purpose:** Establish whether a base-only change can reach merge for a stacked pull request without fresh
  required CI, and if it can, bind that verification to the merge candidate.
- **State:** provisional stub. Concern recorded, design not started; the first step is an investigation.

---

## Problem / Motivation

The final heads of stacked PRs #605–610 each had green `ci-ok` and `merge-ok` before merge; no missed merge gate was
observed. The active `main-protection` ruleset requires `merge-ok`, and ARC's delivery landing checks exact member
heads. A base-only change may still alter a PR's merge candidate without updating its head. PR #701 attempted to cover
retargets, but its event-only heavy-CI signal could be lost to a later label run; that PR closed unmerged.

## Approach

First establish whether a base-only change can reach merge under the supported ARC delivery flow without a new head
or fresh required check. If so, design base-bound verification and a trigger for affected PR merge candidates. A push
check on the delivery branch alone does not test its child PRs.

## Sequencing

Delivery is paused behind the storage program, and no delivery or review work unit is pulled forward
(`cohort-state-storage.md`, pull-forward filter). The investigation may run whenever delivery resumes.
