# Draft: Reconcile Heavy-CI Deferral from Effective Review State

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit`, housekeep drain (2026-07-30); captured during
  `decompose-transform-integrity` delivery 02.
- **Purpose:** Release deferred heavy CI when the pull request's effective decisive hosted review permits it,
  while keeping uncertainty fail-safe and the aggregate merge gate red.

---

## Problem / Motivation

A delivery PR retained `ci-defer-heavy` after the hosted provider submitted an approving review at the exact head.
Observed `CI Defer On Review` runs received only `commented` event state, so none removed the label. `ci-ok`
correctly stayed red because heavy jobs were skipped, but manual label removal was required to start them.

The merge-safety backstop worked; the cost-control transition failed because it trusted only the current webhook
payload rather than effective review history.

## Approach

- On submitted-review activity, treat `commented` as non-decisive and derive the latest relevant approval or
  changes-requested transition from pull-request history.
- Reconcile missed provider events when a later comment-only event arrives.
- Investigate GitHub App review-event delivery before choosing polling, event replay, or explicit recovery.
- Keep the label present and `ci-ok` red whenever effective state or exact-head binding is uncertain.
- Cover approval-followed-by-comment, changes-requested supersession, new pushes, and duplicate delivery.

## Unknowns and Assumptions

- Which provider-authored review event is authoritative when GitHub surfaces both review and comment activity?
- Must reconciliation be provider-neutral, or can adapters normalize decisive state?
- How does the ongoing review-architecture repair change the durable owner of this transition?

## Scope Estimate

Medium — workflow event model, effective-state query, exact-head reconciliation, and fail-safe coverage.
