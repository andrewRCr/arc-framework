# Draft: candidate-reroot-recovery-frame

- **Origin:** [internal]
- **Purpose:** Keep an Active prepublication checkout deterministically resumable while an approved Candidate-changing
  correction awaits full verification and a new root, without recognizing the changed Candidate prematurely.
- **Amended purpose, 2026-09-11:** Generalize the frame from the single `establish-new-root` transition to every
  actionable non-`current` Candidate target state, after live evidence showed the narrow reading leaves the same
  checkouts unresumable.

---

## Problem / Motivation

An approved prepublication review fix can change the Candidate subject legitimately. `arc attest` then requires
`establish-new-root`, but the locus reader has historically treated the same checkout as unresolved. If compaction
lands in that interval, recovery cannot derive a frame or load set and the mandatory recovery marker prevents the
owning session from reaching the verification and re-root action that would resolve it.

The immediate diagnostic repair landed in PR #591. It aligns the refusal with the actual Candidate transition and
returns an exact guarded continuation, but a diagnostic is not a recovery frame: the checkout still needs durable,
non-recognizing authority to resume the owning workflow across compaction.

### The typed code does not reach the frame

`derived-reader.ts:265` collapses **every** unresolved subject projection — PR #591's `candidate-re-root-required`
included — to `kind: "unresolved-checkout"` with `context: null`. The typed code survives only as a diagnostic
string. `session-guidance.ts:50` then maps any `unresolved-checkout` entering row to `kind: "unavailable"`, so
session-init stops in the owning checkout, and `session-guidance.ts:116` renders every such row as
`Inspect checkout <path> before cleanup.` in every sibling session.

Two consumers already reconstruct by hand the distinction the row type discarded: `derived-reader.ts:314` and
`candidate-mutation-owner.ts:46` both pattern-match `diagnostics.every(code === "subject-unresolved")` to recover
"this is in fact an owned work-unit checkout". That duplication is the structural tell — richer diagnostic codes
cannot fix it, because no consumer dispatches on the code.

### The actionable state set is wider than one transition

`subject-meta.ts` returns the typed projection only for `effective.state === "changed"`. Every other non-`current`
state reaches a bare `throw` and lands as generic `subject-unresolved`:

- `staged-change` — uncommitted reviewable edits; its `nextAction` is `establish-new-root`, the same action PR #591
  typed, missed only because the guard tests `changed` alone.
- `decision-required` — `request-authority`; the operator must select `covered | targeted-check | changed`.
- `rerun-checkpoint` — a repeatable checkpoint read.
- `classification-failed` / `classification-unsupported` / `classification-unavailable` — genuine stops.

### Live evidence

Two Active prepublication work units reproduce this today. `evidence-applicability` and `review-signal-convergence`
each committed an approved review fix after attestation (HEAD post-dates `attestedAt` by 53 and 19 minutes), each
projects `decision-required` / `request-authority`, and each returns `locusGuidance.kind: "unavailable"` from its own
checkout — neither can initialize a session. `evidence-applicability` additionally seeds the concrete recovery
contract: its seed names the prior ceremony-only path set while the current tree also contains the approved fix paths.

Read from a sibling checkout, `evidence-applicability` reports `Candidate metadata does not match the managed Candidate
record`, which is a false diagnosis: its record carries subject-entry treatments (`evidence-neutral`, `regenerable`)
that the reading build's enum rejects, so `parseCandidateManagedRecord` returns `null` and the guard reports an id
mismatch that does not exist. Splitting that conflated guard is routed out as an errand; the skew itself stays out of
scope (below).

## Design Direction

- Define a durable-baseline frame for an Active prepublication Candidate whose effective target is not `current` and
  whose pending review-fix authority is `none`. The frame authorizes recovery and workflow continuation only; it does
  not recognize the changed Candidate or satisfy applicability.
- Give `SubjectMetaProjection` a **distinct third kind**, not a further unresolved code and not an annotation on
  the resolved kind. A projection that resolves to `unresolved` cannot carry a frame past `derived-reader.ts:265`,
  so a code-only change is unobservable by construction. An annotation on the resolved kind is worse than
  unobservable: it makes "treated as recognized" the behavior any consumer gets by forgetting to read the
  annotation, which is the precise failure the first scope boundary forbids, arrived at silently. A distinct kind
  makes every consumer state its handling, and the compiler enumerates them.
- Carry the exact prior Candidate identity, current target, transition reason, verification obligation, and allowed
  continuation through subject projection, derived locus state, compaction seeding, and recovery audit.
- Carry each state's own continuation rather than one continuation for all of them: the states differ in what they
  ask for (`establish-new-root`, an operator applicability selection, a checkpoint rerun), and the live cases show
  both an offer and a re-root remedy presented for one state.
- Route every continuation through the existing review-spend taxonomy instead of minting a parallel authority model.
  `classifyDeliveryReviewFixReviewStatusStop` already sorts `resolve-review-applicability` and
  `obtain-ceiling-override` into `review-spend` and `rerun-checkpoint` into `external-wait`, and
  `resolveConfiguredLanePolicy` already reads the configured `review.frontline_max_passes` /
  `review.standard_max_passes` ceilings. The frame restores the context those continuations need; it decides no
  spend of its own and introduces no stop ARC does not already classify.
- Let recovery distinguish the approved correction delta from unrelated worktree drift and retain the pending marker
  until the owning workflow has verified the changed target and established the new root.
- Make sibling-session guidance describe the checkout as a resumable Candidate transition rather than cleanup residue.
- Converge after re-root: the durable-baseline frame disappears, ordinary Candidate projection resumes, and a repeated
  audit observes the newly established root without a parallel recovery authority.

## Required Scenarios

1. An approved review fix changes an Active prepublication Candidate and the effective target leaves `current` —
   whether as `changed`, `staged-change`, `decision-required`, or `rerun-checkpoint`.
2. Compaction occurs before full verification; recovery derives the non-recognizing frame, current load set, and exact
   continuation from durable evidence.
3. The owning session completes the required verification and new-root attestation; recovery then projects the
   ordinary current Candidate.
4. Missing, stale, rewritten, or mismatched transition evidence remains a typed stop, as do the three
   `classification-*` states.
5. An unrelated session inspecting the same checkout receives actionable transition guidance without being invited
   to clean it up or mutate its Candidate.
6. A session that worked in the checkout hands off successfully from the frame, writing its session notes, without
   the Candidate transition being recognized or resolved first.

## Scope Boundaries

- Do not weaken full-verification or new-root authority, infer state from branch shape, or treat the changed target as
  recognized before the owning attestation succeeds.
- Do not auto-select an applicability outcome from a machine verdict, and do not demote an attended stop. Once
  `evidence-applicability` lands, the `decision-required` projection carries a reduced `applicability` result; the
  frame may relay that verdict as a recommendation and must still record only the operator's explicit choice.
  Whether a `judgmentRequired: false` verdict should let `resolve-review-applicability` advance unattended is a
  review-gate question owned where that taxonomy lives, not a frame question.
- Do not spend past a configured ceiling on the frame's authority. Work the frame unblocks stays bounded by the
  lane's configured pass ceiling; exhausting it surfaces the existing `obtain-ceiling-override` stop, carrying a
  recommendation, rather than continuing.
- Do not absorb the general recovery forcing function, marker-delivery reliability, intentional unmerged-index
  recovery, or broad drift calibration from `draft-recovery-hardening.md`.
- Do not introduce generic cross-version Candidate compatibility. Cross-worktree vocabulary skew remains a separate
  recovery-hardening concern; this work may expose the typed local continuation it should point to.
- Do not redesign review-fix disposition authority or Candidate lineage outside the recovery interval.
- Do not restructure advisory cadence, register classification, or operator-facing vocabulary across session-init;
  that surface belongs to `draft-operational-advisory-registers.md`. Removing these rows from the cleanup rendering
  is a consequence of the projection change, not a narration redesign.

## Coordination

`evidence-applicability` is a real composition partner and `review-signal-convergence` is not.

- **`evidence-applicability` — compose.** It leaves the dispatch surface intact: the applicability state set and the
  effective-target projection states are unchanged. It enriches the payload this frame carries — `decision-required`
  gains a reduced `applicability` result under the `review-clearance` evidence kind, whose own
  `judgmentRequired: true` arm already marks the cases an operator must settle, so the frame relays rather than
  re-derives. It also replaces the flat `convergenceVerification` flag with a `CandidateConvergenceProjection`
  composite that the frame's verification-obligation field reads.
- **`review-signal-convergence` — no design relation.** It already carries PR #591 and its Candidate and locus
  sources are byte-identical to the base. It is a second witness to the symptom, not an input to the design.

**Sequencing constraint.** `evidence-applicability` predates PR #591 and lacks `candidate-re-root-required` and
`projectCandidateReRootContinuation` entirely, so its base merge conflicts on `subject-meta.ts` and
`candidate-effective-target.ts` — both files this work owns. Whoever resolves that merge decides how the typed re-root
code and the convergence composite coexist, and this work inherits that resolution as substrate. Do not finalize the
spec before that merge is on the base, and re-read both files from the merged result rather than from either side.

## Likely Surface

Candidate effective-target and subject-meta projection; the `SubjectMetaProjection` outcome set and its nine
consuming files; derived locus and session guidance; compaction-seed and recovery-audit projection; prepublication
verification workflow continuations; focused integration and real-CLI coverage over the complete compaction-to-re-root
transition.

## Continuity

- **Readiness:** `maturing`. Scope, entry condition, and the projection shape are settled; what remains is
  detail-design plus one payload binding deliberately deferred past `evidence-applicability`.
- **Resolved:**
    - the generalized entry condition, and that a diagnostic code cannot carry the frame;
    - that each state keeps its own continuation;
    - that spend, in either direction, is bounded by the configured lane ceiling and routed through the existing
      stop taxonomy rather than a frame-local authority model;
    - that handoff must succeed from the frame, since it grants nothing and is the only site that writes session
      notes;
    - the `evidence-applicability` composition and its sequencing constraint;
    - the non-recognition boundary over a machine applicability verdict;
    - `Class: Heavy` confirmed on both triggers, `compose` rather than `invent`;
    - boundary fit stays one work unit with a delivery-plan candidate — the live-session projection surface and
      the durable compaction-survival surface are distinct reviewable surfaces in a natural order;
    - `rerun-checkpoint` is in scope: the existing taxonomy already classifies it `external-wait`, so it strands a
      session today for a continuation that needs no operator at all;
    - the third outcome is a distinct projection kind, not an annotation on the resolved kind. The annotation
      shape would let any consumer that skips the check treat an unrecognized Candidate as recognized, silently
      and by default; a distinct kind forces all twelve resolved-context sites across nine files to state their
      handling. The two largest consumers need genuinely new behavior rather than ceremony — handoff must now
      succeed where it refuses, and recovery must derive a frame where it derives nothing.
- **Open:**
    - the frame's payload shape, which binds at create-spec once `evidence-applicability` has landed;
    - which of the twelve resolved-context sites carry new behavior and which mirror existing handling — a
      spec-time enumeration, not a design question.
- **Raised, owned elsewhere:** whether a machine-determinate `judgmentRequired: false` verdict should let
  `resolve-review-applicability` advance unattended. That stop's attendedness belongs to the review-gate
  taxonomy; loosening it from a recovery frame would reach across the boundary.
- **Next:** hold at `maturing` until `evidence-applicability` merges, then re-read the merged `subject-meta.ts`
  and `candidate-effective-target.ts`, bind the payload shape against them, and run the formalization-readiness
  assessment.

---
