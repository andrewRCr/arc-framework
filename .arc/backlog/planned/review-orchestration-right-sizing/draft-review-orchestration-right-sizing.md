# Draft: review-orchestration-right-sizing

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit` at the housekeep drain (2026-07-27);
  captured during `review-protocol-alignment` create-spec.
- **Purpose:** Right-size the review gate's **orchestration layer** against its merge-safety core — cut
  ceremony that does not earn its cost while preserving exact-head identity, structural provenance, and
  the "reviewed head A, merged head B" failure prevention.
- **State:** Draft — pre-groom capture (2026-07-27). Ready to ground independently; do not start concurrent with
  the live review-protocol stack (`review-protocol-alignment`, `review-checkout-lifecycle`).
- **Created:** 2026-07-27

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration._

### `[ ]` **Define terminal ownership and collection for review evidence**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-08-22); captured during `decompose-extraction`
  integration checkpoint recovery.
- _Concern:_ repository-common disposition records and their operation, outcome, and source evidence have no
  terminal ownership boundary. Already-landed residue survived a development schema change and blocked an unrelated
  Candidate because integration parsed the entire evidence directory before lineage scoping.
- _Immediate extraction:_ an Errand isolates unrelated malformed residue while preserving strict failure for
  evidence named by the current Candidate or Errand.
- _Fold-in:_ decide which review records remain live through settlement and replay, when terminal paths collect
  them, and how development-only schema changes reset the repository-common state without compatibility readers.
  Keep the records storage-agnostic per `strategy-storage-evolution.md`; do not widen the managed-document WU into
  a second review-orchestration owner.

### `[ ]` **Give review-lane doctrine a strategy home**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-orchestration-right-sizing`), housekeep drain
  (2026-08-22).
- _Concern:_ no adopter-facing strategy owns review architecture, so obligation, applicability, findings,
  clearance, lane precedence, and carrier ranking land wherever a Work Unit happens to need them. The recurring
  principle that review applicability follows covered semantic content rather than head movement likewise has no
  durable strategy home.
- _Fold-in:_ decide whether the review cohort should mint a review-architecture strategy and charter it against the
  integration strategy. Own placement and charter here; preserve the cohort members as the doctrine's substantive
  sources rather than re-authoring them in this WU.

### `[ ]` **Prune the interlock, status, discharge, and Candidate surfaces against their live readers**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-orchestration-right-sizing`), housekeep drain
  (2026-08-20).
- _Concern:_ the checkpoint carries hard-coded-clean signals and a permanently-null extension slot while omitting
  review facts prose must remember; status duplicates host reads; hosted discharge is checkout-local despite host
  evidence; Candidate stores a large per-path manifest over facts Git already carries; three wait policies diverge.
- _Fold-in:_ compose only variable signals and required review facts, collapse host reads, prefer host-observed
  discharge, re-encode Candidate subject identity proportionately, and state one bounded-wait policy. Consume
  `host-policy-evidence`'s truthful host-read shape rather than pruning correctness work into this WU.

### `[ ]` **Drive heavy-CI deferral from effective lane state**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-orchestration-right-sizing`), housekeep drain
  (2026-08-10); captured during `remote-access-contract` delivery review closeout.
- _Concern:_ `ci-defer-review.yml` can lose an approving review's toggle because it trusts the triggering event,
  while a first changes-requested review can start expensive heavy CI even when the final routed lane would not
  require it.
- _Approach:_ first fix reconciliation against current review state and exact head. Then decide whether the durable
  trigger is the lane verdict, draft state, or effective review state, preserving `ci-ok` as the fail-safe aggregate
  gate and avoiding label thrash across review bursts.

### `[ ]` **Rename the review-gate module for the architecture that remains**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: TBD`), housekeep drain (2026-08-10).
- _Concern:_ `src/scripts/review-gate/` now contains review architecture after the required-status gate was retired;
  its name collides with ARC's technical use of “gate” and deepens with every new module.
- _Approach:_ settle directory-only versus vocabulary-wide rename scope, then sequence the mechanical move after
  `review-protocol-alignment` so in-flight branches do not all conflict on imports and paths.

### `[ ]` **Make the review-exempt route reachable from caller-held facts**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-orchestration-right-sizing`), housekeep drain
  (2026-09-07); captured during `delivery-native-stack-composition` dogfooding.
- _Concern:_ the review-exempt fast path exists behind internal schemas and projections that ordinary workflow
  callers cannot compose without source archaeology.
- _Fold-in:_ preserve strict exemption authority while reducing the route to discoverable caller-held facts and a
  typed refusal when the exemption does not apply.

### `[ ]` **Treat stacked review correction as one resumable control loop**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-orchestration-right-sizing`), housekeep drain
  (2026-09-07); captured during `delivery-native-stack-composition` dogfooding.
- _Concern:_ review correction across a delivery stack repeatedly re-enters member selection, reviewability,
  response, verification, and progression as separate ceremonies, losing the active correction position and
  multiplying manual reconstruction.
- _Fold-in:_ compose one resumable correction loop with an explicit member-reviewability checkpoint and typed
  continuation. The `tier1Reuse` vocabulary cleanup is extracted as an Errand; local-coverage truthfulness remains
  with `review-signal-convergence`.

### `[ ]` **Retire a retained attempt when a later clean pass proves complete residual coverage**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-orchestration-right-sizing`), housekeep drain
  (2026-09-07); captured during `delivery-native-stack-composition` dogfooding.
- _Concern:_ retained attempts remain live even when a later clean pass can prove it covered their complete
  residual, leaving redundant review state to settle manually.
- _Fold-in:_ define the proof and terminal collection boundary for safe supersession without converting temporal
  sequence into an ungrounded assumption of coverage.

---

## Problem / Motivation

The review gate's machinery divides along a legible seam, and only one side earns its cost:

- **Merge-safety core** — request a review at an exact head, lock until that exact head clears, record what
  the human approved. Genuinely needs exact-head identity and structural provenance separation.
- **Orchestration layer** — requirement records carrying policy-version digests, admission construction,
  attestation ceremony, pass/ceiling bookkeeping — where ambition outran substrate.

**Evidence:** every defect `review-protocol-alignment` found sits on the orchestration side (e.g. `kind`
baked into a requirement record's canonical digest; derivability failures in requirement/projection
composition; unbacked-capability defects in the policy layer's self-description). Terminal action for a
hosted review is one PR comment; hosted adapters inject no guidance.

**Prior art:** `review-gate-right-sizing` already cut a resident controller, GitHub App path, provider
qualification, and admission machinery. These findings are a second wave — a signal about the layer rather
than any single decision.

**Scale note:** plausibly program-scale rather than WU-scale. Resolve that boundary during planning rather than
gating this concern on the provisional `retrospective-right-sizing` wrapper.

**Coordination:** `review-protocol-alignment` sequenced its `D4` (schema registrations, `--schema` flag,
routing-facts input path) last as a hedge — the unit most exposed if request contracts collapse under a
reduction. If this WU starts before that unit executes, that is the seam to talk about first.

---

## Scope (provisional)

- Audit orchestration ceremony against the merge-safety core criterion.
- Propose a reduction that preserves exact-head lock and provenance separation.
- Leave this change available as a concrete future input if `retrospective-right-sizing` activates; it is not a
  prerequisite for grounding or executing the reduction.

## Non-goals (provisional)

- Replacing the merge-safety core.
- Concurrent open-ended drafting while the live review-protocol stack is still in flight.
