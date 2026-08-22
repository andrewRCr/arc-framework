# Draft: Verification Falsification Contract

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-08-20).
- **Purpose:** Make verification search for missing and broken behavior rather than confirm only what is present.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration._

### `[ ]` **Lint success criteria for reachability over the tree that verifies them**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: verification-falsification-contract`), housekeep drain
  (2026-08-22); captured during `delivery-native-stack-composition` create-spec review.
- _Concern:_ a criterion can be assigned to a partial-tree boundary whose validator cannot see the evidence needed
  to prove it. Delivery member verification exposed the missing structural check, but the failure generalizes to
  every criterion scoped below a whole-tree boundary.
- _Fold-in:_ decide whether the falsification instrument should mechanically prove criterion-evidence reachability
  or delegate a focused lint. Consume delivery's scope-parameterized invocation topology without re-deriving its
  member boundaries, records, or cadence.

---

## Problem / Motivation

On `integration-boundary-accuracy`, two self-verification passes marked every success criterion met; two adversarial
passes then found distinct blocker-class strata. The existing instruction to compare criteria against outcomes
licenses a confirmation pass: find code resembling the criterion, then mark it met. That instrument is structurally
weak at absent paths, incomplete inventories, missing producers, and human-facing behavior traced only to its writer.

## Direction

- For every criterion, construct the case that would break it before searching for satisfying implementation.
- Treat a stated inventory as an exhaustive checklist whose identity matters, not merely a count to reach.
- Trace criteria naming a human-facing surface through to the human-visible consumer.
- Preserve explicit not-met and partial evidence rather than resolving bundled assertions optimistically.
- Keep success-criteria authoring shape with `planning-iteration-mechanics` and review-pass calibration with
  `review-activity-contracts`; this work owns the `verify-work-unit` instrument's falsification quality.

`delivery-native-stack-composition` owns the scope-parameterized invocation topology: member-completion verification,
member-scoped criteria slices, and one whole-WU closeout over cross-member seams. This WU may strengthen the
instrument that topology invokes, but must not re-derive its boundaries, records, or firing cadence.

---
