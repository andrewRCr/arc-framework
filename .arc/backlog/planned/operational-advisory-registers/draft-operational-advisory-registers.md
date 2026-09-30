# Draft: Operational Advisory Registers

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-07-23); captured during the
  `session-locus-model` right-sizing audit.
- **Purpose:** Make routine operational narration preserve signal under normal parallel work by assigning each
  advisory to an explicit urgency register.

---

## Inbound Buffer — Pending Integration

> _Routed-in concern pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`)._

### `[ ]` **Give the session-init delivery observation a typed refusal reason**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-16).

- `WU_Target: operational-advisory-registers`

- _Observation:_ `DeliveryPositionObservation`'s refused arm is `{ status: "refused" }` with no reason field, so
  every internal refusal inside `observeMember` and `observeFacts` reaches `readDeliveryPositionView` as the one
  reason `observation-unavailable`. A proven terminal rewrite, an ancestry read git could not answer, an
  unreachable host, and a benign append-only advance are indistinguishable at that boundary, and session-init
  raises all of them as `Delivery position is unavailable: observation-unavailable.`

- _Approach:_ widen the observation's refused arm to a closed reason union and thread a reason through the
  `return { exact: false, requestState: null }` and `return null` paths that produce it. The outer
  `ReadDeliveryPositionViewResult` already carries typed reasons and needs only the finer input to pass along.

- _Files:_ `lib/session-init/delivery-position-facts.ts`, `lib/session-init/delivery-position.ts`,
  `handlers/status.ts`.

- _Boundary:_ diagnostics only — no change to what the observation admits or refuses. Passing the append-only
  terminal allowance at the session-init call site is a separate captured errand, and this is the reason the
  operator sees whether or not that one lands.

- _Shape:_ this is the same collapse the ancestry-primitive capture describes one layer down, where a failed read
  becomes a verdict. Here it is a dozen distinct conditions becoming one word at an observation boundary, which is
  why the remedy is a reason union rather than a better predicate.

- _Captured during:_ `delivery-post-landing-conflict-recovery` draft-design, 2026-09-16, from a source-verified
  read of the observation boundary.

### `[ ]` **Remove internal vocabulary from user-facing session-init advisories**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: operational-advisory-registers`), housekeep drain
  (2026-08-20).
- _Concern:_ routine session-init output leaks implementation terms such as `projection-mismatch`, locus diagnostics,
  and topology-mismatch without conveying an operator action. Reconcile notices are paragraphs instead of routine
  register clauses; expected notes drift is rendered as a wall; orientation prints a full absolute worktree path.
- _Fold-in:_ make vocabulary accuracy its own deliverable beside cadence/register classification, with calm
  one-line or silent expected-state rendering and operator-facing language for actionable faults.

### `[ ]` **Explain residual delivery position after append-only terminal movement**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: operational-advisory-registers`), housekeep drain
  (2026-09-07); captured during `delivery-native-stack-composition` dogfooding.
- _Concern:_ making the routine session-init slot tolerate append-only terminal movement is an immediate Errand,
  but unresolved `pendingReviewFixVerification`, active-operation, and bound terminal coordinates still need calm,
  actionable diagnostics rather than raw delivery internals.
- _Fold-in:_ place those residual conditions in the register model and give each surfaced state one operator-facing
  remedy without changing delivery authority.

---

### `[ ]` **Single-source the unrelated-base remedy, or stop claiming the copies are identical**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-09-19).

- _Observation:_ the unrelated-base remedy exists in three independently worded copies
  (`checkpoint.ts:714`, `review-gate/status.ts:1203`, `errand-merge.ts:283`) beneath a docstring asserting
  they are kept identical. Nothing pins them, so the assertion is unenforced and already only approximately
  true.

- _Approach:_ either have `status.ts` and `errand-merge.ts` call one exported constructor — both already
  import from `spine-refusal.ts`, and `checkpoint.ts` already exports `checkpointUnrelatedBaseRemedy` —
  parameterizing only the trailing verb; or delete the identity claim and state that each surface words its
  own. If the copies stay, pin them against each other in one test.

- _Interim rationale:_ which way this resolves is a design choice about where the remedy's ownership sits,
  not a correction the review increment can make on its own authority.

- _Captured during:_ an approved deferral from the `delivery-post-landing-conflict-recovery`
  pre-publication standard review, disposition set `sha256:deb4baeb…`, 2026-09-18. The finding was
  verified against source before it was deferred; nothing here is an unconfirmed report.

### `[ ]` **Name the remedy when `inbox-mark-execute-bound` rejects a non-Errand entry**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-09-19).

- _Observation:_ promoting a capture to the execute-bound queue failed with
  `USER-INBOX entry '<title>' is not in the Errand section.` The entry was real and correctly formed; it was
  simply filed under `## Work Unit`, and the fix was to relocate it to `## Errand` first — which the message
  never says. It is a bare `throw new Error` in `lib/user-sync/inbox-writer.ts` rather than a typed refusal
  carrying a remedy, unlike the checkpoint refusals next door that compose
  `spineRemedy(cause, instruction, argv)`.

- _Family:_ fifth in the "diagnostics that report a state without naming the fix" family tracked under "Make the
  in-flight artifact advisory name its remedy". That entry's standing clause — "If a fifth appears, state the
  obligation once in the spine rather than patching another site" — fires here. Treat this as the evidence that
  the count has been reached, not as another single site to patch.

- _Secondary observation:_ the verb takes the complete ordered queue, so promoting one capture to the front means
  restating all thirty titles exactly. The atomicity is deliberate and worth keeping; what is missing is a
  positional affordance that derives the untouched remainder from current state.

- _Scope:_ refusal text and remedy shape, plus optionally the positional affordance. No change to queue
  semantics, ordering contract, or atomicity.

- _Captured during:_ `delivery-post-landing-conflict-recovery` integration, 2026-09-19.

### `[ ]` **Stop treating append-only as an invariant in operational-advisory-registers**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: operational-advisory-registers`), housekeep drain (2026-09-30);
  captured during `storage-contract` draft close, 2026-09-30.
- _Observation:_ The plan treats append-only history as an invariant. Once notes retire, `history.policy` defaults to
  `rewrite-with-lease` with `append-only` opt-in (ADR-035 items 9 and 10), built by `history-policy`.
- _Approach:_ Re-derive whatever rests on append-only against the policy at next planning.

## Problem / Motivation

Session-init and adjacent lifecycle surfaces emit an increasing number of conditional advisories. Under ordinary
parallel work, several conditions are nearly permanent: the base moves while sibling WUs integrate, sibling
worktrees exist, mid-WU commits remain unpushed, and personal notes lag temporarily. Rendering expected steady
state with the same cadence as actionable failures makes the whole surface easier to ignore.

The once-per-calendar-day nudge-marker pattern already reduces noise for selected reminders, but each surface
chooses that behavior independently. There is no common register that tells authors which conditions always render,
which batch into periodic awareness, and which remain silent.

## Direction

Classify routine operational output across session init, recovery, handoff, and CLI-composed narration into three
registers:

- **Actionable now:** always render because immediate intervention is required.
- **Awareness:** batch or rate-limit through the existing daily nudge mechanism.
- **Expected:** remain silent because the condition is ordinary steady state.

Codify the classification where advisory authors encounter it, likely across the session-operations strategy and
the probe/narration composition sites. Inventory the complete current surface before changing cadence so failures
cannot be hidden by a category chosen from examples alone.

## Composition

`session-locus-model` owns a locus-scoped noise diet for its own surfaces. This WU generalizes the register
discipline across routine operations after that implementation integrates; it does not reopen the completed locus
model.

## Carried input from `session-locus-operability-hardening`

That work unit reached this territory from its own faults and stopped at the boundary this section records,
keeping the union, the vocabulary, and the cadence mechanism here. Four things it settled or measured travel
forward as input rather than as decisions binding this unit.

**The discriminator is transition, not age.** An advisory should fire when a condition **becomes** true, not for
as long as it **is** true. A state that has held for forty sessions carries no information — the operator has
already decided not to act on it, and repeating it trains the habit of skipping the section. Age is a weaker
proxy: a fresh condition can deserve immediate surfacing, and an old one can be permanent furniture. The worked
example was a shipped work unit's residue, unchanged since it shipped, re-emitted every session until it read as
background rather than signal.

**Two supporting cuts come with it.**

- **Context is not advisory.** Branch, dirty state, ahead/behind counts are the state the next operation acts on.
  They belong in the orientation header and are cheap to render every time. The budget governs the conditional
  sections, which propose that the operator go and _do_ something.
- **An advisory with no available action is not an advisory.** A surfaced condition with no verb the operator can
  currently run is a complaint. Either give it an action or do not raise it. The locus work hit this shape
  directly: an advisory reading "reconcile manually before cleanup" named no mechanism, and the state it reported
  was the correct end of the lifecycle.

**Transition tracking is not free, and the cost is unpriced.** Firing on _becoming_ true requires remembering what
was true last session — new durable per-condition state, plausibly sited near the existing gitignored last-nudge
markers. The existing daily-nudge markers reduce frequency while still reporting steady state, so they are the
right instinct at the wrong altitude; whether they survive alongside transition tracking or are replaced by it is
this unit's call, and it is a storage design rather than a rendering one.

**The surface needs counting mechanically, and the attempts so far are not trustworthy.** Two independent counts
of Step 6's conditional sections returned 31 and 32, and two successive classifications of which sections are
locus-triggered were both wrong — the current-husk advisory reads branch, HEAD, marker, and worktree path with no
locus input, and the linked-worktree cleanup-residue section fires on the same sweep and orphan inputs as sections
already classified as veto-only. Do not inherit any figure from this note or from
`draft-session-locus-operability-hardening.md`; derive the census from the workflow and the composing source
before classifying anything. The 3 rate-limited nudge markers are the one figure that has reproduced.

**A classification trap worth naming, which is what those errors have in common.** A condition's **trigger** and
its **gate** frequently sit in different subsystems: the sweep arms and orphan branches fire on worktree and
lifecycle facts while locus participates only as a veto, and the rename-move arm reads no locus state at all. A
classification keyed to "which subsystem owns this advisory" will mis-sort every such section. Key it to what
makes the section fire, and expect the owning-subsystem intuition to be wrong more often than it is right.

The clearly non-locus majority is this unit's regardless of how the census resolves: worktree sync, base distance,
base-branch sync, the two reconcile surfaces, notes state and drift, compaction, dirty, retired subdirs, in-flight
work units, the two materializable routes, and housekeep. That is why an ordinary session stays noisy after the
locus work ships — the single advisory an observed healthy session rendered was base drift, from this unit's half.

**The vocabulary is already forked in-tree, which sharpens § Direction's three-register proposal into a
reconciliation rather than an introduction.** Two typed register fields already ship with different namings:
`BaseDriftRegister` carries `calm` / `attention` / `degraded` (`lib/git/base-drift-types.ts`), and
session-init's `notesDriftSurface` carries `expected` / `caution`. Each was minted locally for one surface. A
third naming that does not absorb these two leaves three vocabularies where the problem was one too many, so the
inventory owes a mapping for the existing fields, not only a classification of the conditions.

---
