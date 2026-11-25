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

### `[ ]` **Satisfy a restart requirement by enumerating the move's states from source**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-24).

- _Shapes:_ its direction to treat a stated inventory as an exhaustive checklist whose identity matters, not a count to
  reach.

- _Observation:_ `storage-ref-backend`'s "each move interrupted after each step" was built as one matrix per move, in
  one direction and setup, and read as satisfied. Deriving the recovery states from source found whole configurations
  never interrupted (a remote move between two backing repositories or back to the code remote; follows other than
  `push` from the code remote) and two likely defects in them, which that work unit owns.

- _Approach:_ a restart requirement is met by an enumeration of the move's states from source, recorded beside the
  tests, not by hooking every step of one fixture. How a spec states such a requirement may belong to
  `planning-iteration-mechanics` (success-criteria authoring); settle that split at integration.

- _Captured during:_ `storage-ref-backend` verification (process lessons), 2026-10-22.

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

---

### `[ ]` **State what each step of a multi-step operation must preserve, and test it by perturbing between steps**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-11-10).

- _Shapes:_ § Direction — the verification half: perturbation tests between steps.

- _Observation:_ `cohort-identity-verbs`' pre-publication review ran six complete standard passes with majors of 1, 2,
  2, 1, 1 and 2 while the fix checks between them went clean. Its advisor's process diagnosis (2026-11-07) traced them
  to meaning not preserved across steps. A rename's retry re-resolved its slug after a history pull and renamed an
  arriving namesake (selection to retry). Close and remove checked conflicts at preparation but admitted on primary
  versions alone, so a conflict arriving in between was accepted (preparation to admission). The holdings planner's
  result depended on enumeration order (discovery to planning). Review established that the source was read, not that
  these transitions were exercised, and the example-based tests never changed anything between steps. It is the same
  class as `storage-ref-backend`'s restart matrix (the pending entry) and as `cutover-flip`'s draft review, whose
  later passes found their majors in how records and checkouts carry through the window.

- _Approach:_ for an operation whose steps run over state that can change between them, the spec states each
  transition invariant with its enforcement point and its regression assertion: the selected identity held across
  automatic retries; the evidence that justified preparation still holding at atomic admission, or refusal and fresh
  preparation; equivalent inputs giving equivalent plans whatever their order. Verification proves each by controlled
  perturbation, introducing the change between steps or reversing the order, and asserts the refusal, the legitimate
  repair and the continuation, not only the normal path. Settle the split with `planning-iteration-mechanics`
  (success-criteria authoring) at integration, as the pending entry already notes.

- _Evidence:_ `advisor-process-question.md`, `advisor-process-result.md` and the three probe results
  (`history-reselection-probe-result.json`, `conflict-arrival-probe-result.json`, `planner-order-probe-result.json`),
  from `cohort-identity-verbs`' sixth standard pass. They were personal and gitignored, and went with that unit's
  checkout at teardown unless copied out.

- _Captured during:_ `project-manager.ARC`, reading `cohort-identity-verbs`' advisor process diagnosis, 2026-11-07
  (Owner-approved; the target has no checkout, so no session to message).

- _Follow-up:_ `integration.CIV`'s later classification (2026-11-07) narrows the dominant case to arrival: records the
  plan's listing or lookup would have returned, arriving between preparation and the atomic write, which the store's
  read-only fences cannot see. A perturbation test should introduce such an arrival, not only change a record already
  read. The design half is captured separately ("State the concurrency contract of every prepared multi-record
  write").

- _Follow-up:_ `cohort-identity-verbs`' design amendment A7 (approved 2026-11-07) is a worked instance: one
  perturbation harness on both backends, seeded from an audit of each read family preparation uses, each case
  asserting either refusal with a correct fresh retry or admission equal to fresh preparation, plus an unrelated write
  that must admit. The audit found the gaps an eighth complete pass would have been left to find one at a time.

---

### `[ ]` **State the concurrency contract of every prepared multi-record write**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-11-10).

- _Shapes:_ § Direction — the spec-authoring half, paired with "State what each step of a multi-step operation must
  preserve, and test it by perturbing between steps". Partly overtaken: `cohort-identity-verbs` (#1309) and
  `projection-write-back` (#1305) state their fences.

- _Observation:_ `integration.CIV`'s process report (2026-11-07, sent at the Owner's request): after verification at
  `86b29cc076`, seven complete standard passes plus fix checks, twelve disposition rounds, nearly every round finding
  one or two majors. Of 19 findings, 11 (10 major) share one mechanism: a rename or cohort retirement prepares a
  multi-record batch from store reads, a record arrives or changes before the atomic write, and the write check does
  not re-establish that part of the plan. That class appears in 9 of 12 rounds, the last 4 in a row. Six more, on
  cohort Parent and member coupling, stopped after design amendments A5 and A6. Root cause: the store fences only
  records it has already read (per-record version observations in a batch), and nothing detects a record arriving that
  the plan's listing or lookup would have returned. The spec stated no concurrency contract for prepared multi-record
  writes, so admission was completed one participant class per finding, in hand-written checks that partly repeat the
  planning logic (`lib/store/rename-reference-admission.ts` and its siblings). The rule that checks the resulting
  state directly (`checkSlugEdges`) has the same exposure and produced no finding. The exposure is not one unit's:
  every writer that decides from reads taken before it submits is exposed (the lifecycle verbs,
  `projection-write-back`'s write-back, `projection-worktrees`' fan-out and partitioned index commit, the flip's
  import), and the races go live when the flip makes the store the substrate every session writes.

- _Approach:_ every spec with a prepare-then-atomic-batch write states what is fenced and how arriving records are
  handled: re-planning at admission against a locked view (the unit's design amendment A7), a check on the resulting
  state, or a state-version or listing precondition on the batch. Write checks prefer rules over the resulting state,
  or one shared planner, to predicates comparing against what preparation chose, since those drift from the planner.
  A7 is unit-local; the store already serializes publication with a whole-state check (the follow-up below), so each
  prepared writer states its own fence.

- _Evidence:_ commit bodies on `feat/cohort-identity-verbs` (each disposition set lists its findings),
  `notes-cohort-identity-verbs.md`, and its private review ledger, personal and gitignored, which went with that unit's
  checkout at teardown unless copied out.

- _Captured during:_ `project-manager.ARC`, routing `integration.CIV`'s process report, 2026-11-07 (Owner-requested
  capture and routing, relayed by `integration.CIV`).

- _Follow-up:_ `integration.CIV`'s scoping, corrected the same day (2026-11-07) after an independent audit: the store
  has no store-wide window. Every ref-backend publication runs through `commitRefStep`
  (`lib/store/ref/commit-step.ts`) under one store-wide `layout` lock, ordinary batches, sync merges and sync
  withdrawals alike, and inside it `refAdmissionBasisChanged` (`ref/write-admission.ts`) compares every state ref's
  tip with those captured at submission and retries from fresh state on any difference, a new ref included, so write
  checks see the exact, serialized state the commit lands on. The real window is local to each verb: between preparing
  a batch and submitting it. A7 closes it for rename and retirement by re-running preparation inside the admission
  check, which is complete because that view is exact. What carries to the other prepared writers
  (`projection-write-back`'s write-back, `projection-worktrees`' fan-out, the flip's import) is a pattern, not a store
  primitive. A writer that decides from reads taken before it submits either re-derives the decision inside a write
  check or observes everything it read; it cannot rely on the backend's retry, which compares against tips at
  submission, not at preparation. A coarse alternative is a batch carrying its preparation-time `store.version()` (a
  manifest of all ref tips) as a precondition, which the basis check could enforce almost free, but that is a contract
  change and retries on any unrelated write. Both go into A7's text so the writers state their fences the same way.

- _Follow-up:_ A7 approved (Owner, 2026-11-07), the text `integration.CIV` commits to its spec next. The contract: a
  prepared store write lands only if preparing it against the state it lands on would produce the same writes from the
  same evidence. Two arms. Re-plan at admission: preparation is a pure function of a store view and the request, and
  emits as the batch's observations exactly the records and exact-reference absences that feed a write, a report row
  or an advisory (refusals, which the fresh plan re-derives, and records listed but feeding nothing are not evidence);
  the write check re-runs it over `before` and admits only when every fresh write appears in `after` unchanged and the
  fresh evidence names nothing the batch neither observes nor writes at an expected version. Or observe what the
  decision read, where decisions already rest on rules over the resulting state. Verification is by perturbation: one
  harness on both backends injects a store change between preparation and batch, seeded with each read family
  preparation uses; each case asserts refusal with nothing written and a correct fresh retry, or admission equal to
  fresh preparation, and an unrelated write admits. The cost is one extra preparation inside the store-wide lock. The
  other prepared writers (`projection-write-back`'s write-back, `projection-worktrees`' fan-out and index commit, the
  flip's import) state their fences the same way; relayed to `generate-tasks.PWT`, `draft-design.CF` and, through
  `primary.ARC`, `projection-team-scale`'s draft.

- _Follow-up:_ checked with the writers the same day (2026-11-07). `projection-worktrees` prepares no store write of
  its own: its fan-out brings sibling worktrees' working copies and indexes up to the store, re-reading each index
  under its projection lock and skipping a worktree whose state version moved; its index commit is local under that
  lock; and its protection reads feed no store write. The store writes it causes go through write-back's take-in. The
  flip's import lands only on an empty store (`landImportRefs`, `lib/store/ref/import/land.ts`, refuses `occupied`
  under the `layout` lock), so the contract holds trivially, and its inputs outside the store are fenced by the
  quiesce, a lease on each Errand identity ref at the tip read, and the check's recompute after the import. A7's
  pattern governs the flip's other store writes (its archive, the register closures). Of the writers named above,
  write-back's take-in is the one still without a stated fence; the flip's spec names who states it.

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
