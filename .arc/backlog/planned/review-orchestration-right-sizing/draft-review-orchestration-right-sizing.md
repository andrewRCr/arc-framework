# Draft: review-orchestration-right-sizing

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit` at the housekeep drain (2026-07-27);
  captured during `review-protocol-alignment` create-spec.
- **Purpose:** Right-size the review gate's **orchestration layer** against its merge-safety core — cut
  ceremony that does not earn its cost while preserving exact-head identity, structural provenance, and
  the "reviewed head A, merged head B" failure prevention.
- **State:** Draft — pre-groom capture (2026-07-27). Sequence **behind** `retrospective-right-sizing`
  (that WU owns the remediation wrapper; this is its first real target). Do not start concurrent with the
  live review-protocol stack (`review-protocol-alignment`, `review-checkout-lifecycle`,
  `integration-boundary-accuracy`).
- **Created:** 2026-07-27

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration._

### `[ ]` **Rename the review-gate module for the architecture that remains**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: TBD`), housekeep drain (2026-08-10).
- _Concern:_ `src/scripts/review-gate/` now contains review architecture after the required-status gate was retired;
  its name collides with ARC's technical use of “gate” and deepens with every new module.
- _Approach:_ settle directory-only versus vocabulary-wide rename scope, then sequence the mechanical move after
  `review-protocol-alignment` so in-flight branches do not all conflict on imports and paths.

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

**Scale note:** plausibly program-scale rather than WU-scale. Sequence behind `retrospective-right-sizing`
and let this be its first real target.

**Coordination:** `review-protocol-alignment` sequenced its `D4` (schema registrations, `--schema` flag,
routing-facts input path) last as a hedge — the unit most exposed if request contracts collapse under a
reduction. If this WU starts before that unit executes, that is the seam to talk about first.

---

## Scope (provisional)

- Audit orchestration ceremony against the merge-safety core criterion.
- Propose a reduction that preserves exact-head lock and provenance separation.
- Coordinate with `retrospective-right-sizing` for the remediation-wrapper path.

## Non-goals (provisional)

- Replacing the merge-safety core.
- Concurrent open-ended drafting while the live review-protocol stack is still in flight.
