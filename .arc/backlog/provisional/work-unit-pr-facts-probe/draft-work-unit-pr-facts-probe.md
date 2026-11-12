# Draft: Separate Work-Unit PR Fact Probes by Consumer

- **Origin:** [internal] — routed from `USER-INBOX § Errand` after scope re-triage, housekeep drain
  (2026-07-30); captured during `judgment-authority-model` integration.
- **Purpose:** Keep lifecycle guards and session orientation supplied with accurate pull-request facts when a
  repository reaches the PR-list cap, without hiding timeout degradation behind an unrelated remote-error message.

---

## Problem / Motivation

`createGhWorkUnitPrSource` requests 100 pull requests plus `statusCheckRollup` under a five-second timeout. The
query takes roughly 9.7 seconds in this repository. The timeout degrades to an empty result for two different
consumers:

- `arc reopen` needs one branch's merged state and then refuses because the missing fact is not a positive
  unmerged result.
- session-init needs multi-branch facts and silently loses completion-tail advisories.

The diagnostic blames remote or `gh` availability even though the actual cause is query shape and budget.

## Alternatives

- Use a targeted PR view for single-branch lifecycle guards and retain a batch query for session orientation.
- Reduce the batch field set, split expensive status-rollup hydration, or increase its measured timeout budget.
- Introduce a shared cache only if freshness and exact-consumer failure policy remain explicit.

## Unknowns and Assumptions

- Which session-init advisories truly require full status rollups?
- Can branch-scoped lifecycle guards bypass the list path without duplicating PR-selection policy?
- Which degraded causes should become typed so diagnostics remain truthful?

## Scope Estimate

Medium — two consumer policies, GitHub query adapters, timeout/error modeling, and regression coverage.
