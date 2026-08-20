# Draft: Verification Falsification Contract

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-08-20).
- **Purpose:** Make verification search for missing and broken behavior rather than confirm only what is present.

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
