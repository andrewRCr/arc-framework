# Spec (`detailed` · `RFC`): delivery-post-landing-conflict-recovery

- **Origin:** [internal]

- **Purpose:** Give post-landing movement a typed recovery route. Fifteen call sites derive a base by hand and
  seven pick silently; this work unit converts the ones whose defect is traced (D4) behind one shared resolver,
  and introduces the ancestry relation as extraction rather than invention — four sites elsewhere already derive
  it by hand, none of which this work unit converts. It also completes the conflict protocol the provider path
  already implements, so a landed member under a reservation can be settled rather than wedged.

---

## Introduction / Context

Ordinary movement after a delivery member lands can leave that member under a reservation with no typed conflict
continuation. The exact-head comparisons protecting delivery are correct; what is missing is any route back when
independent evidence already proves the contribution landed and only the coordinate disagrees.

The originating instance is closed — `evidence-applicability` landed, its closeout refused `terminal-unsettled`
against a retained terminal member binding a superseded head, and an execute-bound Errand retired the residue
operationally. Only the instance was fixed. The next stacked landing reaches the same wall.

Three independent defects produce that wall, recorded as observations rather than claims.

**A reader compares a bound head with no ancestry term.** Public review readiness against a member whose branch
advanced past the head its record binds returns `invalid` / `delivery-member-unbound` with no remedy — the same
result the same handler returns over a repository carrying no delivery state at all. A stale binding and an
absent binding are indistinguishable. Closeout is cause-blind as well as ancestry-blind: `terminal-unsettled` is
reachable three ways — a five-condition pre-guard before the conjunction is built, an unobserved host request,
and an eight-term conjunction — so **fourteen conditions reach one word**. Its remedy can therefore only name a
rerun over inputs that never reach the term that failed. The singleton path already gets this right, comparing by
ancestry against the pinned base; delivery re-implemented the same question worse.

**Merge-base cardinality is not one, and four readers disagree.** Three refuse in three vocabularies; the fourth
does not refuse. Whole-WU verification picks one ancestor silently, names the base's own change as the
contribution, and omits the branch's commit entirely — no refusal, no reason, nothing recording that a choice was
made. Because the subject digest is what currentness compares, identical branch work then reads as a changed
Candidate and the ordinary fallback demands a fresh root. That is the mechanism behind the field's removed paths
and its demand for a full new root over a branch that already contained the landed predecessor.

**Post-land suffix settlement composes before it reads the resolution.** Replaying a pinned pre-landing
contribution onto a landed predecessor returns `contribution-conflicted` naming a path — and returns the
byte-identical refusal once the operator resolves that path. The conflict is composed from three coordinates, the
resolved member head is consulted only after composition succeeds, and so no act of the operator is an input to
the composition that refuses them. The refusal itself is correct and fail-closed; the defect is one layer up,
where the settlement wraps it in guidance naming a remedy that cannot clear it.

## Goals

- **Ancestry-aware comparison.** A reader asking whether a bound head is still the observed one distinguishes an
  unmoved record, an append-only advance, a rewound record, genuine divergence, an absent binding, and an
  unreadable ancestry — rather than collapsing them into equality-or-not.
- **One vocabulary for one question.** Where this work unit converts a reader, the base comparison resolves
  through one shared mechanism whose refusal is typed once. The goal is bounded by D4's conversion set: readers
  left in place keep their existing typed reasons, so surviving spellings are a recorded exclusion rather than a
  goal unmet.
- **Cardinality refused, never picked.** At every reader this work unit converts, no base is silently selected
  from two equally good candidates and no subject, digest, or overlap is derived from an arbitrary choice. Like
  the goal above, this is bounded by D4's conversion set — five silent picks outside this work unit's concerns
  are a recorded exclusion, enumerated in `notes-delivery-post-landing-conflict-recovery.md`.
- **A completing input for post-landing conflict.** An operator whose resolution cannot reach a composition has a
  disclosed, resubmittable decision that settles the landing, and a way to decline that releases the reservation.
- **Every refusal recoverable or terminal, and typed as one.** Each variant carries a typed remedy action the
  caller dispatches, not prose a later reader re-authors.
- **Adoption by reader, not by shape.** Singleton and delivery readers adopt the same mechanism, so the two
  implementations cannot diverge again.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **Adopting a merge queue.** A recorded non-goal, retired at the characterization's design as not the remedy for
  ARC-only re-ceremony. Compatibility with a project that runs one is carried as a constraint, not a feature.
- **Weakening any existing protection.** Repository-wide contribution proof, exact-head host merge protection,
  terminal absorption checks, and fail-closed treatment of unresolved substantive overlap all stand unchanged. A
  new commit id is never treated as a fresh review obligation, and a conflict-free virtual merge never
  establishes evidence carry.
- **Inventing an acceptance primitive.** Three instances of one acceptance shape exist in the tree. Whether they
  should share an abstraction belongs to `review-source-authority`, which owns a live defect in the terminus
  binding; an abstraction authored here would be built against a shape about to change.
- **Minting a second resume path.** Typing the integration resume point belongs to `draft-composable-workflows`
  and the durable resume directive to `draft-operational-state-docs`. This design adds no encumbrance term.
- **Reversing a landing.** Decline releases the wedge and restores refs ARC itself moved. It does not undo a
  merge the host performed.
- **Prepublication authoring and review-fix convergence.** Out of scope, and `delivery-rebuild-continuity` owns
  the private-chain and base-movement side.

## Proposed Design

### D1 — The shared base resolver

A single resolver replaces the repeated hand-rolled base derivation. It reads the base with `--all`, refuses when
the count is not one, and returns four arms, split on what the caller can do next. It never throws.

| Arm           | Holds when                            | Caller disposition                     |
| ------------- | ------------------------------------- | -------------------------------------- |
| `resolved`    | exactly one merge base                | diff or record from that single base   |
| `ambiguous`   | more than one equally good merge base | recoverable — remedy per pair (below)  |
| `unrelated`   | no common ancestor                    | terminal                               |
| `unavailable` | the read failed operationally         | recoverable — retry or repair the repo |

`unrelated` and `unavailable` ship under these names in `base-overlap.ts`'s `RevisionOverlapResult`, and that type
collapses `ambiguous` **into** `unavailable`: its multiple-merge-base branch and its non-exit-1 `catch` both reach
`merge-base-failed`, so an ambiguous history and an unanswerable read arrive as one word.

**The split is three layers deep, not one.** Editing `RevisionOverlapResult` alone changes nothing the pins in
D11 observe, because two downstream unions re-flatten before those readers see a result:

- `RevisionOverlapResult` — splits `ambiguous` out of `merge-base-failed`.
- `OverlapEvidence` (`base-drift-types.ts`) — its unavailable reason set is `merge-base-failed |
  branch-diff-failed | base-diff-failed | classification-failed`, with no ambiguous and no unrelated arm, and
  `analyzeBaseOverlap` folds `unrelated` **and** `merge-base-failed` together into `merge-base-failed`. So at this
  layer the collapse is three conditions into one, and `unrelated` has to be **lifted out** rather than being
  already separate.
- `EvidenceOverlapObservation` (`evidence-applicability/schema.ts`) — re-collapses the same pair again on the
  review-status path.

All three must carry the distinction for the drift-overlap and review-status readers to report it.

**Caller policy is per reader, and three decisions are settled rather than left to the implementer:**

- **`collectGitCandidateTarget`'s widened result propagates to every consuming call site**, and two of those are
  injected dependency lambdas rather than direct calls — `handlers/lifecycle.ts` passes `currentTarget` into
  `runAttest`. **Attestation therefore gains a refusal it does not have today.** That is new behavior in a
  load-bearing ceremony, not a pass-through, and the task plan treats it as such.
- **`resolveGitCandidateTargetBase` is a second, separate propagation** with its own callers, not covered by the
  collector's. Both are enumerated in `notes-delivery-post-landing-conflict-recovery.md`.
- **`repository-target.ts` maps into `LocalTargetDerivationError`'s existing closed reason set**, beside the
  `no-merge-base` reason it already carries — no new error family.

The terminal record advance proof converts its arm to no-proof; carrying the reason onward is deliberately not
required there. Each caller otherwise applies its own failure policy — the resolver returns only what it
establishes.

**The `ambiguous` remedy is per coordinate pair, not per reader** — one reader can serve pairs of different
topology, so the remedy attaches to the pair being compared:

- **`(head, base)` pairs — recoverable by merging the base in.** Merging one side into the other makes it an
  ancestor, which collapses cardinality above one to exactly one. A criss-cross is a property of the revisions'
  current shape, not a permanent property, and an append-only merge changes that shape. This reaches the sole-base
  resolver and the overlap analyzer's delivery and review call sites.
- **Pinned-durable-baseline pairs — not reached by that remedy; the route is re-baselining.** The overlap
  analyzer's integration-checkpoint call site compares the pinned Candidate durable baseline against the base, so
  the merge moves neither element and the refusal stands. Its residue is smaller, since the resolved base lands
  only in drift evidence rather than being consumed as a ref: what fails there is recoverability alone, not the
  coordinate obligation.
- **Where an append-only merge is not permitted at all**, the refusal stands and the restart route satisfies
  recoverability instead.

Emitting "merge the base in" at a pinned-baseline pair would name a remedy that provably cannot clear the
refusal — precisely the recoverable-looking dead end this design's own refusal rule forbids. Since D10 makes the
remedy a dispatched action rather than prose, the pair distinction is part of the type, not a caveat beside it.

### D2 — The predecessor relation

A pure classifier over an ordered pair, wrapped in a thin reader result per executor. It reports topology and
nothing else — no content term, no Git access in the classifier.

| Variant     | Holds when                                    | Consumer consequence                        |
| ----------- | --------------------------------------------- | ------------------------------------------- |
| `unchanged` | observed head equals the bound head           | proceed — today's equality check, preserved |
| `advanced`  | the bound head is an ancestor of the observed | the append-only movement to admit           |
| `rewound`   | the observed head is an ancestor of the bound | the record is ahead of reality              |
| `diverged`  | neither is an ancestor of the other           | fail-closed by default; carries cardinality |
| `absent`    | no record binds this subject at all           | today's answer for a stale binding          |
| `unknown`   | the ancestry read established none            | stop; never collapses into a verdict        |

- **`advanced` is ancestry-only.** What keeps an unreviewed change from riding an `advanced` verdict is the gate
  below it, which still requires the observed head to equal the target head and the routed obligation discharged
  at that exact vehicle. Do not add a subject term to close a hole the downstream gate already holds.
- **Cardinality is a field on `diverged`, not a variant.** Cardinality above one is reachable only when neither
  revision is an ancestor of the other, so a variant would place it beside the case it lives inside. Applicability
  is its only _deciding_ consumer — the migrated eligibility reader carries the field through
  `samePredecessorRelation`'s field-by-field payload comparison without reading it — and **its typed remedy is
  re-baselining, not merging the base in.** Candidate applicability compares the _pinned_ baseline target against
  the current base, and that baseline is reduced from the
  Candidate's durable managed record — merging the base into the branch advances the Candidate head and changes
  neither element of the pair, so the topology between them is untouched and the ambiguous refusal stands. Its
  real route is a fresh authority transition that re-pins the baseline. State the distinction rather than a
  remedy: a criss-cross **manufactured by the silent pick** is redundant ceremony whose cause D5 removes, while a
  **genuine criss-cross under a pinned baseline** is the cost of the history's shape, and re-baselining is the
  price of clearing it.
- **`unknown` never collapses.** An ancestry read that failed operationally is a third thing, distinct from
  missing and from unexpected. Several hand-rolled helpers return `false` for a failed read, which is how an
  operational failure becomes a verdict.

### D3 — Vocabulary unification

`predecessor-relation.ts` currently types the same ordered-pair question as `exact | disjoint-ahead |
overlapping-ahead | unrelated`. Its `exact` arm collapses `unchanged` and `advanced` — the same defect class this
work unit exists to repair. Migrate it onto D2's vocabulary:

- `exact` splits into `unchanged` and `advanced`.
- `disjoint-ahead` and `overlapping-ahead` are both reached only on `not-ancestor`, so **neither can be
  `advanced`** — that verdict is the `ancestor` branch, which is `exact`. `overlapping-ahead` becomes `diverged`.
  `disjoint-ahead` becomes `diverged` too, except for the member-behind-tip case below. The overlap distinction
  moves downstream as a field on the reader result rather than staying a variant — that is what keeps the
  classifier pure, and it is also what carries `eligibility.ts`'s split, which **accepts** `disjoint-ahead` and
  **refuses** `overlapping-ahead` as `wrong-predecessor`. No single variant name can carry that split: merging an
  accept and a refuse is the defect class this work unit removes, and it would recur under `advanced` exactly as
  it would under `diverged`. The migrated reader decides on the overlap, not on the variant — which is why D2's
  `diverged` is fail-closed _by default_ rather than by definition.
- **`disjoint-ahead` also covers the member-behind-tip case**, where the merge base equals the member head and
  the overlap is necessarily empty. In D2's vocabulary that is `rewound`, not `diverged`, so the migration splits
  this arm on ancestry direction rather than renaming it wholesale. `overlapping-ahead` has no matching case: a
  member behind the tip diffs empty against the merge base, so its overlap can never be the non-empty one.
- **The payloads need destinations.** `exact` carries `chainBase`; `disjoint-ahead` carries `chainBase`,
  `mergeBase` and `overlap`; `overlapping-ahead` carries `mergeBase` and `overlap` but no `chainBase`.
  `eligibility.ts` consumes `chainBase` as the coordinate it observes the chain against, so the migrated shape
  must keep it reachable for every arm that carries it today, and `samePredecessorRelation` — which compares each
  variant's payload field by field — must be migrated with the variants rather than after them.
- `unrelated` maps onto the **resolver's** `unrelated` arm (D1) rather than becoming a seventh relation variant.
  "No common ancestor" is a fact the base resolver establishes before the classifier runs, and the classifier
  reads no Git — so the relation's six variants stand unchanged, and the terminal outcome stays separated from
  the recoverable ones rather than folding into `diverged`, which is recoverable and, on an empty overlap, even
  admissible.

`PredecessorRelationSchema` sits inside `EligibilitySnapshotSchema` inside `CloseSchema`, so its literals are
written by one verb and read back by another — a request-contract change, not a local rename. The
pre-public-release posture settles the cost: unpublished project-owned contracts may change in place and no
compatibility alias is owed.

The variant names are controlled vocabulary. They appear in refusal reasons and remedies, so each is defined once
and derived from the type rather than restated beside it.

### D4 — Reader adoption, by reader rather than by shape

Fifteen distinct call sites derive a base today; seven pick silently. Adoption is per reader, so singleton and
delivery paths converge rather than diverging again.

**Five readers take the shared base resolver (D1):**

| Reader                              | Question it asks                            |
| ----------------------------------- | ------------------------------------------- |
| `git-candidate-subject.ts`          | what content did I contribute               |
| `base-overlap.ts`                   | do both sides change the same content       |
| `git-candidate-effective-target.ts` | which single base coordinate do I record    |
| `git-contribution-proof.ts`         | which single predecessor do I prove against |
| `repository-target.ts`              | which single base defines the change set    |

**Four take the relation (D2):** `git-candidate-applicability.ts` and
`git-review-contribution-applicability.ts` (base movement under a baseline and under a pinned prior), review
readiness (lookup, then relation), and closeout.

`repository-target.ts` is the strongest trace in the set: its silently picked base becomes `diffBaseSha` and
`diffBaseTree`, the local review host's diff base, asserted in the gate's identity module and used to compute the
reviewed change set as `base..head`. A silent pick there means the review examined the wrong change set.

**The tables above are the complete allocation, not the conversion set.** The discriminator is a traced defect:
these two readers are listed so the allocation is complete, and are **not converted by this work unit** because
neither has one.

- `git-contribution-proof.ts` keeps its existing `null` / endpoints-unverified policy. It already returns a typed
  reason, and collapsing three causes into it is real but out of scope here.
- `git-review-contribution-applicability.ts` already refuses under a typed `merge-base-ambiguous` and distinguishes
  `merge-base-missing` from it — but so does `git-candidate-applicability.ts`, which the relation's set **does**
  convert, so that property is not what separates them. The absence of a traced defect is.

`repository-target.ts` **is** converted, on the traced need above: a silent pick there selects the change set the
local review host examines, which is why it is in scope where the other two are not.

The two decomposition call sites stay outside on different grounds — they reached the same read-all-then-refuse
shape independently under a third spelling, with no observed failure behind either.

### D5 — The subject's path set

The subject is the base-relative diff from the single resolved base: a tree-to-tree comparison, with fragility
discharged by refusal rather than by an arbitrary pick. No merge-diff mode selection, no union, no special
handling of merge commits.

A commit-derived set was considered and falsified twice — it cannot see a branch retaining its own side of a
base-changed path across a base merge, and because the digest is taken over path, content digest, and mode, a
path changed and reverted within the branch leaves a permanent no-op entry so currentness never clears. The
base-relative set drops that path and the digest returns to its attested value.

### D6 — Post-landing conflict recovery, the member suffix arm

Adopt the disclose-and-resubmit protocol ARC already runs on the provider path, request-side:

1. Collect the **complete** conflict set rather than returning on the first — every member whose movement proves
   `contribution-conflicted`, each with its paths. Any other refusal stays hard.
2. With conflicts present and no resolution supplied, return `conflict-resolution-required` carrying the
   conflicts and a resubmittable `resolutionInput`. **This arm carries no ref restorations**: it returns before
   the local member-ref rewrite runs, so ARC has moved nothing local at this point, and the refs that did move
   are the remote ones the host retargeted — which the Non-Goals place out of reach. The provider original emits
   `externalRefRestorations` here because the _provider_ moved external refs, a fact that does not transfer to
   the native suffix arm. The restorations belong to D7's arm, which returns after the rewrite.

   **That shape does not fit the existing arm.** The result union's
   only `conflict-resolution-required` arm is a `z.strictObject` requiring `externalRefRestorations` with
   `.min(1)`, and `RefreshConflictResolutionSchema.scope` admits only `{ kind: "dependent-suffix" }`. A native
   disclosure carrying no restorations matches **no** arm and is emitted as an invalid service result — the
   operator would receive no conflicts, no `resolutionInput`, and no route forward. Author a **distinct native
   arm** rather than relaxing the shared one: weakening a constraint the provider surface asserts, to accommodate a
   different caller, is the protection erosion the Non-Goals forbid. (The `.min(1)` is enforced at the schema, not
   maintained at the producer — `externalRefRestorations` is a `flatMap` that can yield `[]` — so the ground is
   the Non-Goal, not a producer invariant.)

   **The places to edit, named rather than counted.** `RefreshConflictResolutionSchema.scope` is a single
   `z.strictObject` pinned to `{ kind: "dependent-suffix" }`, **not** a union — the only scope union,
   `RefreshExecutionScopeSchema`, is one `resolutionInput` does not use, and widening it would silently re-route a
   third kind through provider branches written as a binary. `RefreshConflictResolutionSchema` is also shared with
   the live `arc delivery refresh adopt` request, so any change there is a provider-contract change and must be
   disclosed as one. And the resubmission in step 3 has nowhere to arrive: `NativeStatusSchema` is
   `{ planId, request, remote }`, so it needs the field that carries the resubmitted resolution.
3. With a resolution supplied, refuse `conflict-resolution-mismatch` unless that blob canonicalizes identically
   to a freshly derived one, then settle under the held reservation.

**Nothing is persisted on the input side**, so nothing can go stale; what survives the wait is the reservation
already durable in `activeOperation`. Arrival needs no new operation and no state-schema change — the native path
consumes the resubmitted disclosure in the same `land-status` call that settles, at the same revision, because
every conflict refusal returns before the single state write. Adoption is the conflict collection, the
disclosure, and a scope discriminant on the `native-land-status` request.

The approval fires on genuine collisions only: identical trees take the `tree-equality` fast path and clean
reapplies take `mechanical-reapply`, both silent. Movement alone never asks anyone anything.

**Whether the disclosure is gated on at least one `reviewable` path is carried as an Open Question**, not settled
here. The proposal is sound in shape — a collision confined to lifecycle projections carries no judgment to
spend, and `classifyPathTreatment` makes only three things non-`reviewable`: the ROADMAP (`regenerable`),
Candidate projections, and the work unit's own artifacts and companions (both `evidence-neutral`). What it lacks
is a measurement over the right population. See Open Questions for the bar it must clear before adoption.

**No obligation field is written.** `pendingReviewFixVerification` is the review-fix flow's own state machine —
an acknowledgement identity key, a field terminal integration renews from its candidate, and a bar on native
stack link and unlink — not a generic slot for what is owed. For non-terminal members nothing needs one: the
settle writes resolved heads into state coordinates and the next landing cycle refuses any member that cannot
pass `reviewReadiness` on its exact head.

### D7 — Post-landing conflict recovery, the terminal absorption arm

`absorbTop`'s `content-conflict` is a structurally separate refusal from the member suffix, so a member-only
protocol would leave the terminal collision emitting a remedy nothing can clear. The separate terminal top is
durable surface — native stack composition without one depends on designs that have not landed, and it stays a
supported configuration afterward for projects that keep no separate backing repository — so its recovery is
designed as a permanent path.

Two of its three composition inputs are recorded rather than observed — the merge base is the recorded
before-state and `top` is recorded state never re-observed — while the third, `highestMember`, is live but
follows the host's landing rather than the operator. No act of the operator is an input either way, so
resolve-and-rerun returns the byte-identical refusal. **A complete recovery route nevertheless exists one
layer above the composition:** `observeExactAbsorption` accepts a commit on its parent pair alone, with any tree,
whenever `rev-list --parents -n 1 HEAD` is exactly `<head> <top.head> <highestMember.head>` and the worktree is
clean. An operator who merges the refreshed predecessor by hand and commits produces precisely that shape.

The design types that route rather than inventing one:

- **Reuse the disclosure type that already exists; the native arm's contract gains the field.**
  `DeliveryTerminalConflictPreparation` carries `topRef`, `logicalMergeBase`,
  `parents: { top, refreshedPredecessor }`, and the exact `merge-tree` argv.
  `settleReservedDeliverySuffixRefresh` already builds it on this same `content-conflict` refusal, and a
  provider-path consumer already prepares a resolution workspace from it — so `refreshedPredecessor`
  (`highestMember.head`), the merge parent the operator actually needs, is a shape the subsystem carries. Do not
  author a second disclosure.

  **But the native path does not have a slot for it.** This edits the library result type and the schema arm — it
  is not the population of an existing optional field. `ReconcileLinkedNativeDeliverySuffixResult`'s conflicted arm
  is `{ status, reason, paths, guidance }` with no `conflictPreparation` (the provider's
  `ProviderAdoptionBlockedResult` is the type that has it). `BlockedContributionRefusalSchema` is a
  `z.strictObject` of the same four fields, so the populated object matches **no** arm of the handler's result
  union and would fail validation at runtime rather than at the compile boundary: `RetainedOperationBlockSchema`
  carries the field but additionally requires `operationId` and `nextAction`, which this refusal has not, and the
  arm that carries it beside `paths` is pinned to the `content-conflict` reason literal and admits no `guidance`.
  Both gain the optional field.

  **`BlockedContributionRefusal` is not a third locus** — recorded because the name invites the assumption. It is
  a file-local conditional type over `DeliveryContributionRefusal`, not the schema's inferred type: its arms carry
  no `guidance`, one carries no `paths`, and its only consumer is `ProviderAdoptionBlockedResult`, whose sibling
  arm already carries `conflictPreparation` under a `reason: string` that subsumes the literals. Nothing on the
  native path routes through it, so widening it buys nothing — and doing so through the contribution-proof schema
  rather than the local alias would drag `evidence-applicability`'s base-merge observation into this change.
- **Carry the ref restorations here**, not on D6's arm: this refusal returns after the local member-ref rewrite,
  so these are refs ARC moved itself and D9 can put them back by lease.
- Derive the evidence that the commit was a resolution rather than writing it: the resolved top's parent line is
  exactly `<head> <priorTop> <refreshedMember>`, and `priorTop` is data applicability already holds.
- Report the residual as the operator's own resolution rather than the whole absorbed predecessor.

### D8 — The acceptance record

The terminal member is gated by the Candidate at the integration checkpoint, not by delivery — the per-head
readiness gate never runs for it (`deriveNativeDeliveryRegisteredRemainder` slices it off), and
`rebindDeliveryTerminalCoordinates` has one production call site — inside `arc delivery reconcile` — so it never
runs on a native
landing. Two checkpoint mechanisms hold it: the terminal coordinate advance proof withholds a proof because the
absorbed commit is not an ancestor of the Candidate's recognized target, and the Candidate applicability dispatch
demands a resolution selector on `decision-required`.

**That selection is the acceptance.** An `applicability-selection` transition already carries the disclosure, the
accepting identity, and a binding that dies when the content is rewritten. This design mints no waiver record and
adds no vocabulary.

Reusing the `review-terminus/v1` family was considered and rejected on source: its discharge reader matches on
the vehicle without inspecting `kind`, so a second `kind` there would discharge hosted review for an unreviewed
head.

**`covered` remains the Owner's escape hatch.** The decision surface carries ARC's own evidence reduction —
`fresh`, with `judgmentRequired: false` — beside the choice, so the Owner overrides a stated machine read rather
than selecting from an undifferentiated menu, with `targeted-check` offered as the bounded-evidence alternative
without being the forced path.

### D9 — The decline route: `delivery native land-release`

Decline releases the wedge; it does not reverse the landing. It takes its own verb under `delivery native`,
alongside `land-select` / `land-prepare` / `land-submit` / `land-status`.

**The warrant is intent separation, not a read/mutate split** — the group has no such split to preserve. Of the
four verbs only `land-select` is read-only: `land-prepare` publishes a reservation, and `land-submit` and
`land-status` both reach `reconcileLinkedNativeDeliverySuffix`, which performs the lease-checked local member-ref
rewrites, the lease-checked remote top publication, and the single revision-checked state write. `land-status`
already performs every mutation this verb would reverse. What earns the separate verb is that a decline is a
distinct operator intent against a held reservation: folding it into `land-status` would put two meanings on one
request — poll-and-settle versus abandon-and-release — dispatched on payload rather than on the verb, and
`land-status` is re-run routinely while a decline must be deliberate.

The verb takes the **exact reservation selector**, restores any local member refs ARC rewrote by lease (a no-op on
the suffix arm), publishes `activeOperation: null` at the exact revision, and returns a **typed result** naming
what it restored and what it deliberately left standing. The two disclosure points need different amounts of
restoration: the suffix arm has nothing to restore, while the absorption arm must put back refs ARC moved itself.

Both shapes already exist. The restoration is `rewriteLocalRef`'s existing `{ ref, beforeHead, requestedHead }`
call with its arguments swapped, lease-checked, refusing rather than forcing when the lease fails — no force-push
on either arm, which keeps this clear of the rebase-and-force prohibition. The transition takes the template of
the `not-applied` clear (a typed clear carrying a named resume action and an exact subject selector) but **not its
code path**, which reconciles against observed host facts on the premise that the effect did not apply; here the
effect did apply and the operator is declining to adopt it.

**Its refusal follows the same rule as everything else here: a failed lease reports the observed head and leaves
the reservation held rather than half-releasing it.** Publishing `activeOperation: null` before every ref
restoration succeeds would leave the wedge released with refs still where ARC moved them — a state neither the
landing path nor the decline path can reason about afterwards, and one no refusal describes.

### D10 — Typed remedies, not prose

Each variant and each refusal carries a **typed remedy action the caller dispatches**, not a sentence a later
reader re-authors. This is the constraint that makes variant separation pay off rather than merely describe, and
it is the general statement of the terminal arm's defect — a correct published result reduced to prose saying
something else.

Correct the guidance at `native-landing.ts` on both arms that share the shape: the suffix-proof arm and the
terminal-absorption arm. Four of that function's refusal arms omit "Keep the reservation"; two share the shape,
so a fix applied to one leaves its twin.

### D11 — Pinned-probe retirement

Eight probes hold this boundary's behavior and pass today; each names its replacement, and each but the Candidate
applicability hold fails when the behavior changes. Retiring them is in scope — a fix here cannot merge while one
is red, and each is a single `expectPinnedObservation` call to replace. They retire independently, one per
boundary.

Most were authored under the resolve branch, before the design chose refuse, so their declared targets state the
expectation the design rejects. What that means for a given hold's retirement depends on how it goes red — or
whether it does.

**Every pin ends as a plain assertion, and the helper forces it.** `expectPinnedObservation` returns cleanly while
the actual result still matches `observed`; it **throws the moment the result matches `target`** — "the hold is
spent: replace this call with a plain assertion" — and it throws again when the result matches neither shape. A pin
is therefore green only while the defect stands, and red the moment the behavior changes, by one route or the
other. Re-pointing a hold at an outcome this work unit itself delivers is not a disposition: the reshaped hold
fires immediately and still has to be replaced. So there is one terminal action, applied eight times, exactly as
the draft recorded it — each is a single `expectPinnedObservation` call to replace.

**How a hold goes red decides what replaces it** — and one hold never does:

- **Target reached** — the declared `target` is what the design produces, so the helper reports the hold spent and
  the replacement asserts that target. The staged arm awaits D5's refusal; the terminal head movement awaits
  `closed-out`, which is what D13's corrected comparison lets closeout return; the review-readiness binding awaits
  the admission this design's first goal exists to restore.
- **Neither shape** — the declared `target` states the resolve-branch expectation the design rejects, so the
  awaited value never arrives and the helper reports that neither shape describes the result. The replacement
  asserts **what the design produces**, never what the hold awaited. The committed-arm subject, the digest sibling,
  the drift overlap, and the review status are here.
- **Neither** — the Candidate applicability hold. Its `observed` is the refusal the design keeps, so it stays
  green and nothing forces its replacement; it is retired deliberately, on the reading below.

Per hold:

| Hold                     | Replaced with a plain assertion on…            |
| ------------------------ | ---------------------------------------------- |
| review-readiness binding | the relation's stale-versus-absent distinction |
| terminal head movement   | the relation's ancestry verdict                |
| committed-arm subject    | D5's typed refusal                             |
| digest sibling           | D5's typed refusal                             |
| staged arm               | D5's typed refusal                             |
| drift overlap            | D1's split ambiguous reason                    |
| review status            | D1's split ambiguous reason                    |
| Candidate applicability  | the typed refusal the design keeps unchanged   |

The applicability hold is the one to look at twice, and the only one whose behavior the design does **not**
change: it declares `target: { state: "applicable" }` against an observed
`classification-unavailable / merge-base-ambiguous`, and the design deliberately keeps that refusal — including
its `detail`, which the hold names verbatim, so the replacement has a stable shape to assert. It can never fire, so
it sits permanently green while asserting nothing about the behavior it names — the decay this instrument exists to
catch, appearing inside the instrument itself.

Two repair routes for the committed-arm hold were considered and both are **rejected on evidence**, recorded so a
later sweep has a string to find. Dropping it as redundant against the digest hold fails because the digest hold
does not stably report the same defect — its own target is unreachable under the settled design. Making the
arrangement deterministic so the ancestor pick is stable fails on different ground: Git does not contract which of
two equally good bases `merge-base` returns, and the flip was observed once and never reproduced on demand, so
that route owes a reproduction it cannot supply.

Outside the neither-shape retirements this design plans for, a probe reporting that the held result no longer
describes what happens and the awaited one has not arrived either has found behavior neither shape names. That is
a finding, not a retirement.

### D12 — Review readiness resolves by deliverable identity, behind a fifth interface

**A moved head does not mismatch at this reader — it misses.** `readiness.ts` resolves its member with
`resolveMemberByHead(request.pullRequest.headSha)`, and every production member lookup is keyed the same way:
`DeliveryMemberSelector` has a `head` arm and a `ref` arm, and `stateMemberMatches` requires
`member.coordinates.head` to equal the observed head on **both**. No member is found, so there is no bound
coordinate to compare and the relation cannot be computed at this reader at all. **Adding an ancestry term to a
comparison that never runs would change nothing** — which is why D2 alone does not satisfy SC5.

The fix is an inversion the reader already has the inputs for. Its vehicle carries `planId`, `deliverableId`, and
`workUnitSlug`, and the code resolves by head and then _validates_ those three against the result. Resolve by the
identity it already holds, then compare the recorded head against the observed one with the relation — the same
two facts, in the order that can tell a stale binding from an absent one. That order is the review gate's own:
`sameDeliveryReviewMemberVehicle` is `sameDeliveryReviewMemberIdentity(…) && expected.head === actual.head`, and
`status.ts` and `hosted-reservation-admission.ts` both resolve identity-first across head movement. Readiness is
the outlier, so the inversion conforms it rather than introducing a pattern.

**It is not free — the inversion needs a lookup route that does not exist today**, since `DeliveryMemberLookup`
exposes exactly one head-keyed method and neither `DeliveryMemberSelector` arm keys on the deliverable. Of three
available routes, one is eliminated and two converge:

- **Eliminated — `resolveDischargeTargets`, because it relocates the defect.** Its loop refuses `unavailable` for
  the whole enumeration when any member carries a null `changeRequest` or null `coordinates` — not only the member
  asked about. On a stack whose third member is not yet hosted, a question about the first fails, and fails as
  _could not establish_ rather than _not bound_. That is the Axis A conflation moved one reader over.
- **Adopted — a named method with a typed result, as a fifth interface** beside the four already in
  `core/delivery-member-lookup.ts`. `resolveTerminalRecords` already performs the plan read, state read, and
  coherence check a deliverable-keyed method's body needs, so the route is that body behind the named method.
  Routing through `resolveTerminalRecords` itself would widen a method named for terminal integration by use
  rather than by design, and `DeliveryMemberLookup` stays single-method — the structure that file already uses.

**The result's arms are derived from that method's own plan read, state read, and coherence check** rather than
from any store predicate — and the arm set must be able to express every outcome readiness reports today, or the
inversion recreates the conflation it exists to remove:

| Arm               | Holds when                                        | What readiness reports        |
| ----------------- | ------------------------------------------------- | ----------------------------- |
| `bound`           | the member resolves and carries a coordinate      | compare via the relation      |
| `in-plan-unbound` | the member is in the plan with no binding         | the relation's `absent`       |
| `not-in-plan`     | the plan resolves, the deliverable is not in it   | identity error, own remedy    |
| `no-plan`         | no plan carries this work unit                    | a miss, not an unavailability |
| `plan-mismatch`   | the resolved plan is not the asserted `planId`    | the surviving renamed fact    |
| `unavailable`     | a read refused, or the work unit resolves to many | could not establish           |

The designated body does not supply every arm as written. `resolveTerminalRecords` returns `unbound` at two
distinct points — no plan carries the work unit, and a plan resolves but carries no state record — so `no-plan`
arrives under the same status as a plan-resolved miss, which is `in-plan-unbound` or `not-in-plan` depending on
the deliverable. It returns `unavailable` when several plans match, and it never asserts a caller-supplied plan
id at all, so `plan-mismatch` has to be asserted explicitly inside the new method. Folding any of these into
`unavailable` would repeat exactly the defect that eliminated `resolveDischargeTargets` — answering _could not
establish_ where the truthful answer is _not bound_ — at the reader this item is fixing.

**Widening `DeliveryMemberSelector` with an identity arm is the recorded rejected alternative** — it edits a
predicate both live lookups share in order to reach the same result.

The vehicle already holds the key, so the call is a conversion rather than a new lookup: readiness spells the
third field `workUnitSlug` where `DeliveryReviewMemberVehicle` spells it `workUnitId`, so the hand-off needs a
rename.

**The inversion changes an emitted result contract, and only one of three facts is actually tautological.**
Readiness today emits three distinct `delivery-member-mismatch` facts, keyed `vehicle.planId`,
`vehicle.deliverableId`, and `vehicle.workUnitSlug`, each reporting a field that failed validation _after_ a
head-keyed resolution. The draft recorded two as becoming tautological on the reasoning that the member is found
"by plan and work unit"; **source does not support the plan half.** `resolveTerminalRecords` filters on
`plan.workUnitId` alone and _derives_ `plan.planId` from that filter — it never asserts a caller-supplied plan id.
So under the new method:

- **Work unit** becomes tautological — it is the lookup key.
- **Deliverable** survives as a real outcome: a deliverable absent from the resolved plan is the `not-in-plan`
  arm, a miss rather than a tautology.
- **Plan** must be asserted **explicitly inside the new method**, because the designated body derives it. Leaving
  it implicit would drop a live validation, and folding it into `not-in-plan` beside the deliverable miss would
  reintroduce the cause-conflation this work unit exists to remove, at the very reader it is fixing.

Readiness emits one code, `delivery-member-mismatch`, three times over, discriminated only by `path`. Under the
new method the `vehicle.workUnitSlug` emission stops as tautological, the `vehicle.deliverableId` emission becomes
the `not-in-plan` arm under its own remedy, and the `vehicle.planId` emission survives as an explicit assertion
under a renamed identity — so the code itself stops being emitted at all. Treat that as a user-facing surface
change, not an internal rename.

### D13 — Closeout reports a reason per term

Replacing the equality term with the relation makes closeout's comparison correct while leaving the refusal
unable to **report the observed condition**, because the other terms reach the same word. A caller told
`terminal-unsettled` still cannot tell a moved head from a wrong base ref, and the remedy still cannot name the
failing term — which is exactly why the recorded remedy directs a rerun over inputs that never reach it. So the
conjunction owes a reason per term.

**The sizing is fourteen conditions, not eight.** That one reason is reachable three ways in
`verifyDeliveryTerminalSettlement`: a five-condition pre-guard before the conjunction is built, an unobserved host
request, and the eight-term conjunction itself. All three sit in the same function, and the direction is
unchanged — the relation supplies the vocabulary for the one term that was ancestry-blind, and the other terms
need only stop sharing a word — but the work is sized against fourteen.

The narrower arm, giving only the relation's term a distinct reason and leaving the rest collapsed, is the
**recorded rejected alternative**: it fixes the ancestry row while leaving the refusal-recoverability rule's
report-the-observed-condition clause unsatisfiable everywhere else in the same function.

## Alternatives & Rationale

**Commit-derived subject paths, rejected on measurement.** Attractive because paths derived from a branch's own
commits are cardinality-independent. Falsified twice: a branch that merges the base in and keeps its own side of
a path the base changed contributes that retention, and no branch-side commit records it — the condensed merge
mode suppresses it, and the mode that catches it admits every base change as the branch's own. Separately, the
movement-sensitivity claim inverted at the metric that matters, because the digest is taken over content rather
than path names. The base-relative diff plus refusal removes machinery rather than adding it.

**A new waiver record for the terminal member, rejected on source.** The question was never how to invent a
waiver but how to type the acceptance that already happens. The existing `applicability-selection` transition
carries the disclosure, the identity, and a content-bound binding. Minting a sibling record would add vocabulary
that `review-source-authority` would then have to reconcile.

**Reusing `review-terminus/v1`, rejected on source.** Its discharge reader matches on the vehicle without
inspecting `kind`, so any second `kind` added there would discharge hosted review on a vehicle match. A
discriminant has to land before a kind does, and that work is not this work unit's.

**A stored pending-obligation record, retracted.** Storing nothing on the input side means nothing can go stale.
The reservation already durable in `activeOperation` is what survives the wait, which also satisfies the
storage-agnostic "derive continuation from live state" criterion more completely than a record would.

**Narrowing the resubmission predicate to the disclosed paths, rejected as symmetry.** It would buy immunity to
an operator's concurrent unrelated push at the cost of departing from the built protocol and storing per-path
content. The residual is accepted and named instead: that operator is re-disclosed, costing one `land-status` run
and one resubmission, with no new judgment — and the re-disclosure is correct, since the snapshot they were shown
is no longer the one they would be accepting.

**A delivery-scoped rollout, rejected.** It would leave singleton readers on whichever comparison they happen to
carry, which is how the two implementations diverged in the first place. Four of the seven recorded rows are
against a singleton, and the most severe is a singleton row.

**Widening `DeliveryMemberSelector` with an identity arm, rejected (D12).** It is the obvious route to a
deliverable-keyed lookup and it edits a predicate both live lookups share in order to reach the same result. The
fifth interface leaves `DeliveryMemberLookup` single-method, which is the structure that file already uses.
`resolveDischargeTargets` was eliminated on a stronger ground: it refuses `unavailable` for a whole enumeration
when any member carries a null `changeRequest` or `coordinates`, so a question about the first member of a stack
fails because the third is not yet hosted — the Axis A conflation moved one reader over.

**Giving only the relation's term a distinct closeout reason, rejected (D13).** It fixes the ancestry row and
leaves the refusal-recoverability rule's report-the-observed-condition clause unsatisfiable for the other
thirteen conditions in the same function — a caller told `terminal-unsettled` still could not tell a moved head
from a wrong base ref.

**Designing a second terminal disclosure, rejected on source (D7).** `DeliveryTerminalConflictPreparation`
already exists, is already built on this exact refusal on the provider path, is already schema-exposed in the
handler's result union, and already has a workspace-preparing consumer. The native arm simply does not populate
it. Authoring a new disclosure would have re-derived a shape the subsystem carries — the missed composition D6's
own premise (adopt the protocol ARC already runs) exists to prevent.

## Cross-cutting Considerations

**Trust boundaries.** The design adds reachability above the write boundary and relaxes nothing at it. The
approval fires only on genuine collisions; mechanical proof continues for every other movement. Semantic approval
is required only for disclosed conflicted contributions. Lease-checked publication and revision-checked state
writes are preserved, and interrupted retries converge without resubmitting a landed member.

**Refusal recoverability.** Every refusal this design touches must distinguish terminal failure from a
recoverable stop, preserve a safe retry route, report the observed condition, name an actionable typed remedy,
and keep the success path reachable after repair. Of D1's arms, `unavailable` is recoverable and `unrelated` is
terminal; `ambiguous` is recoverable **per coordinate pair** — by merging the base in at a `(head, base)` pair,
by re-baselining at a pinned-durable-baseline pair, and by the restart route where an append-only merge is not
permitted. D13's per-term reasons are what let closeout satisfy the report-the-observed-condition clause at all.
Verification covers both the refusal and successful continuation after repair.

**Merge-queue compatibility, carried as a constraint.** A queue is a head-mover, and a rebase-style submit
strategy moves the request head. Whatever replaces the equality comparison must not assume the landed head is the
head ARC bound. Current compatibility is **unverified** — every enumerated row moves the head from inside ARC,
and no probe covers an external mover.

**Native restacking shortens the disclosure window, accepted.** The adopted predicate is head-sensitive. The
bound is the reservation: a disclosure exists only between the run that composes it and the resubmission that
consumes it, and that window sits entirely under a held native land reservation refusing any second delivery
operation. The days-long wait sits before the disclosure, where nothing is held.

**Testing.** Cover conflicting and clean suffixes, terminal-top conflict, and interruption/retry with Git-backed
and handler-level tests, including no duplicate merge submission. Every hold D11 replaces becomes a plain
assertion on the settled outcome, and each of those assertions verifies both the refusal and the continuation
after repair. The two planning probes already written stay as regression coverage; convert the
adoption assertions in the terminal-waiver probe to a pin when the admission route lands.

**User-facing surface.** One new verb (`delivery native land-release`), corrected guidance on two
`native-landing.ts` refusal arms, typed remedies replacing prose, and per-term closeout reasons where one word
stood. The native terminal refusal begins returning a `conflictPreparation` block — a contract addition across
the places D7 names — so the operator sees the required merge parent instead of a remedy that cannot clear the
refusal. Readiness stops emitting `delivery-member-mismatch` altogether: of its three `path` discriminations one
becomes tautological, one becomes the `not-in-plan` arm, and one survives under a renamed identity (D12).

## Success Criteria

1. After a real overlapping base change prevents the host's rebase of a successor, the CLI returns an exact
   actionable resolution offer; approved successor **and top** resolutions can settle the retained operation and
   continue the delivery.
2. New member heads receive fresh applicability, review, and checks before landing.
3. Stale decisions, undisclosed divergence, ref collisions, incomplete suffix observations, and ambiguous host
   results still refuse without claiming clearance.
4. A two-merge-base history produces a typed refusal at every reader this work unit converts — no silent pick,
   and no subject, digest, or overlap derived from an arbitrary ancestor. The two readers D4 lists for allocation
   completeness but does not convert are outside this criterion.
5. A stale binding and an absent binding are distinguishable at review readiness — the lookup resolves by
   deliverable identity and returns `in-plan-unbound` where it previously found nothing (D12) — and closeout
   reports a distinct reason for each of the fourteen conditions that currently reach `terminal-unsettled` (D13).
6. Resolving a disclosed terminal collision by hand merge settles the landing, and the native arm's refusal
   returns a populated `conflictPreparation` whose `parents.refreshedPredecessor` names the required merge parent.
7. `delivery native land-release` takes the exact reservation selector, restores every ref ARC moved by lease,
   publishes `activeOperation: null` at the exact revision, and returns a typed result naming what it restored and
   what it left standing. On a failed lease it reports the observed head and leaves the reservation **held** — a
   test asserts no half-release.
8. No `expectPinnedObservation` hold remains in the four probe files this boundary owns: all eight are replaced
   with plain assertions on the settled outcome, and the suite is green with none of them asserting nothing.
9. `predecessor-relation.ts` no longer exports a second ordered-pair spelling and no caller reads its `exact`
   arm. The criterion is bounded to D3's conversion set: `observeTarget` keeps its own partial derivation and its
   own `"exact"` spelling, as a recorded exclusion rather than an unmet goal.

## Open Questions

- **Whether an all-neutral conflict set settles without asking (D6).** Adopting the gate on reasoning alone is
  the symmetry Proportionality rules out, so it needs a measurement over the population the gate actually reads —
  the member-suffix conflict set `merge-tree` reports, which `base-overlap.ts` classifies as the shared-path
  intersection. A first approximation over landings rather than conflict sets ran during spec authoring and is
  recorded here as method, not as discharge: over `git log --merges -80 main`, ~4% of landings (3/76) touched only
  neutral or regenerable paths, and 1 of 26 consecutive overlapping landing pairs had an all-neutral overlap — two
  lifecycle operations touching the same work unit's meta. That is the right order of magnitude and the wrong
  population, and consecutive landings are a rough proxy for concurrency. Measure against the conflict set before
  adopting; if the subset proves unreachable there, drop the gate rather than keeping it on the approximation.
- **Merge-queue compatibility under an external head-mover.** Every enumerated row moves the head from inside
  ARC, and no probe covers a queue whose rebase-style submit strategy rewrites the request head. The constraint
  is stated in the design (the replacement comparison must not assume the landed head is the head ARC bound);
  what is open is whether this work verifies it with a probe or records it as deliberately uncovered. Resolve at
  task generation, when the test surface is enumerated — it bounds test scope, not the design.

---
