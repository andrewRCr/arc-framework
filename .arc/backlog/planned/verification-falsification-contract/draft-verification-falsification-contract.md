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

### `[ ]` **Share the native delivery stack fixture across the end-to-end delivery suites**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-09-19).

- _Observation:_ `delivery-plan.e2e.test.ts` is 1,914 lines over 15 tests, and one test of it is 667 lines on its
  own — it holds the only inline native stack fixture, built from scratch against an `origin` aliased back to the
  checkout. `delivery-native-suffix-e2e.ts` now arranges the same stack against a genuinely separate origin. The
  two are near-duplicates that have already diverged on the property that decides whether a retarget can be
  represented at all, so a reader cannot tell which arrangement is the intended one.

- _Approach:_ Extract the shared arrangement into the existing helper and have the plan suite consume it. Note
  that this is a behavioral change to the origin topology, not a mechanical extraction — the plan suite's cases
  have to be re-proven against a separate origin rather than moved.

- _Observation:_ Infra smell — it reaches a 1,900-line shared test surface and several independent cases, so it
  likely wants the reviewed lane.

- _Captured during:_ `delivery-post-landing-conflict-recovery` Task 3.6, 2026-09-17.

### `[ ]` **Verify the e2e host fakes against the API they claim to reproduce**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-19).

- _WU_Target:_ `verification-falsification-contract`

- _Observation:_ Delivery e2e coverage drives the real CLI against hand-written `gh` shell stubs that encode what
  we believe GitHub returns — stack responses, per-request payloads, merge-async status, ref and commit reads.
  Nothing verifies those beliefs, and several independent fakes exist across `delivery-plan.e2e.test.ts`,
  `delivery-terminal-recovery.e2e.test.ts`, and their siblings, each an assumption record with no shared owner.

- _Why it matters:_ the failure is silent and inverted. If the provider changes, or a belief was wrong when it was
  written, every test stays green and only production breaks — the suite confirms what it already assumes instead
  of searching for what is broken. Not testing the provider is correct; the green suite quietly implying the
  provider seam is covered is not.

- _Approach:_ Likely some combination of recording real `gh` output into fixtures rather than hand-authoring
  responses, consolidating the several fakes into one owned surface, and an out-of-band check against a real
  repository on a cadence rather than in CI. Settle which of those the falsification contract actually demands — a
  fake that cannot fail is the same class of instrument as a criterion whose validator cannot see its evidence,
  which this work unit's inbound buffer already carries.

- _Captured during:_ `delivery-post-landing-conflict-recovery` Task 3.6, 2026-09-17.

### `[ ]` **Decide what a pinned hold may assert before the fix it awaits is designed**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-19).

- `WU_Target: TBD`

- _Observation:_ Three of the eight holds in `delivery-post-landing-conflict-recovery` had their predicted
  retirement corrected during execution: two on the route they would take, one on the task that fires them, and
  one whose awaited value the design rejected outright — leaving it green while its stated behavior asserts a
  defect the design decided is not one. Every `observed` half held up. Every error was in `target`.

- _Approach:_ The common cause is that `target` is authored before the design settles, so it records a predicted
  fix rather than an observed defect, and a probe whose prediction is wrong reports nothing. Worth settling
  whether a hold may be authored with no target at all (fire on any change), whether the helper needs a
  disposition for a target the design later rejects, and what a retirement note should say when neither of its
  two red routes can fire. A hold that cannot fire is the same class of instrument as a fake that cannot fail —
  the neighbouring capture from Task 3.6 raises that comparison for the end-to-end host stubs.

- _Files:_ `packages/arc-framework/__tests__/helpers/pinned-observation.ts`, and wherever hold-authoring guidance
  ends up living.

- _Captured during:_ `delivery-post-landing-conflict-recovery` Phase 4, 2026-09-17.

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
