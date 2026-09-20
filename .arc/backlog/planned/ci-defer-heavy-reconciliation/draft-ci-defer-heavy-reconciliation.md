# Draft: Reconcile Heavy-CI Deferral from Effective Review State

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit`, housekeep drain (2026-07-30); captured during
  `decompose-transform-integrity` delivery 02.
- **Purpose:** Release deferred heavy CI when the pull request's effective decisive hosted review permits it,
  while keeping uncertainty fail-safe and the aggregate merge gate red.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration._

### `[ ]` **Distinguish intentionally deferred CI from failed review diagnostics**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: ci-defer-heavy-reconciliation`

- _Observation:_ during PR #583 review, `ci-defer-heavy` correctly skipped the heavy jobs and kept `ci-ok` and
  `merge-ok` red as the merge-safety backstop. The required-check diagnostic projected that intentional deferral as
  ordinary `failed / stop`, forcing the hosted-review workflow to stop even though CodeRabbit was still pending and
  no executed CI job had failed. An agent must inspect labels and job skips manually to distinguish the expected
  review-time state from a real correct-fast failure.

- _Approach:_ expose the effective exact-head deferral state through required-check observation and return a typed
  intentionally-deferred review diagnostic while the governing review activity remains pending. Preserve red
  `ci-ok` / `merge-ok`, the draft lock, and final fail-closed merge behavior; the distinction changes operational
  guidance and review continuation only, never treats deferred checks as green or complete. Once review settles,
  ordinary reconciliation must remove deferral, schedule the required heavy jobs, and return to normal pending,
  green, or failed check semantics.

- _Boundary:_ `review-signal-convergence` may consume the typed state when coordinating review continuation, but it
  should not own CI deferral policy or aggregate-gate semantics. Keep those authoritative in
  `ci-defer-heavy-reconciliation` and avoid a second review-side deferral model.

- _Captured during:_ `resume-scoped-review-fix-verification-before-candidate-reroot` full-final review, PR #583,
  2026-09-09.

### `[ ]` **Reduce hosted CI consumption without weakening the aggregate gate**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: TBD`), housekeep drain (2026-08-10).
- _Concern:_ hosted Actions consumption is dominated by repeated pull-request activity and review-driven label
  churn. Content-aware job depth already skips heavy legs for planning changes, while `ci-defer-heavy` can be lost
  or replayed across review bursts and draft-lock transitions.
- _Fold-in:_ separate the already-settled “what runs” lane classification from the “when heavy CI starts” policy.
  Reconcile deferral from effective state and exact head, assess draft state versus review state as the trigger, and
  keep `ci-ok` red whenever required heavy work is deferred or uncertain.

### `[ ]` **Schedule required CI for every exact stacked-member head**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: ci-defer-heavy-reconciliation`), housekeep drain
  (2026-09-07); captured during `delivery-native-stack-composition` dogfooding.
- _Concern:_ a delivery stack can settle review member by member while CI remains oriented around pull-request
  events, leaving no authoritative scheduler that proves each exact member head received its required jobs.
- _Fold-in:_ compose exact-head member readiness with the effective-lane deferral policy, preserve `ci-ok` as the
  fail-safe aggregate gate, and avoid replaying heavy jobs when the same exact head is already qualified. A
  read-only exact-head readiness projection is extracted as an immediate Errand.

---

### `[ ]` **Clear deferred heavy CI when review ends without a provider verdict**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-19).

- `WU_Target: ci-defer-heavy-reconciliation`

- _Observation:_ the existing entries there both assume review settles with a provider verdict — the label is
  removed by an approving review, and the gap recorded from PR #583 is that a `commented` event fails to remove
  it. An Owner-directed review stop has no verdict at all: no further pass is requested, so no approving review
  can ever arrive and the label can never auto-clear. The deferral outlives the review cycle it was scoped to.

- _Observation:_ the agent-facing half compounds it. `arc review checks await` reported `failed / stop` for
  `ci-ok` and `merge-ok`, which under the workflow's own dispatch is a stop. Distinguishing designed deferral
  from a real failure took reading the rollup job log, the PR labels, the `ci-defer-review` workflow source, and
  the native review state — four manual reads to conclude that nothing was wrong. That is a turn stop spent on
  expected behavior.

- _Approach:_ fold the no-verdict termination into the effective-state reconciliation the stub already plans, so
  a review cycle that ends by Owner direction reconciles deferral the same way an approving verdict does. The
  typed intentionally-deferred diagnostic that entry already proposes is what makes this automatable: with it,
  the agent continues on a typed state instead of stopping on an indistinguishable `failed`.

- _Boundary:_ this is the same mechanism and the same owner — not a second deferral model, and per the steering
  map not something to fold into the review protocol chain or the delivery recovery ladder.

- _Captured during:_ the `function-size-ratchet` errand, PR #647, 2026-09-18.

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
