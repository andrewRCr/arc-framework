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
| `unrelated`   | no common ancestor                    | recoverable by hand merge only (A13)   |
| `unavailable` | the read failed operationally         | recoverable — retry or repair the repo |

`unrelated` and `unavailable` ship under these names in `base-overlap.ts`'s `RevisionOverlapResult`, and that type
collapses `ambiguous` **into** `unavailable`: its multiple-merge-base branch and its non-exit-1 `catch` both reach
`merge-base-failed`, so an ambiguous history and an unanswerable read arrive as one word.

**Where it lands.** The resolver is exported from `base-overlap.ts` beside `analyzeRevisionOverlap` — that module
already performs the `--all` read inside a private helper, so the resolver is an extraction of existing machinery
rather than a new module. It takes the exec handle and the two revisions and returns the four arms above. The
analyzer adopts it rather than keeping a second copy of the read.

**The split is four layers deep, not one.** Editing `RevisionOverlapResult` alone changes nothing the pins in
D11 observe, because three downstream unions re-flatten before those readers see a result:

- `RevisionOverlapResult` — splits `ambiguous` out of `merge-base-failed`.
- `OverlapEvidence` (`base-drift-types.ts`) — its unavailable reason set is `merge-base-failed |
  branch-diff-failed | base-diff-failed | classification-failed`, with no ambiguous and no unrelated arm, and
  `analyzeBaseOverlap` folds `unrelated` **and** `merge-base-failed` together into `merge-base-failed`. So at this
  layer the collapse is three conditions into one, and `unrelated` has to be **lifted out** rather than being
  already separate.
- `EvidenceOverlapObservation` (`evidence-applicability/schema.ts`) — re-collapses the same pair again on the
  review-status path.
- `EvidenceOverlap` (`evidence-applicability/schema.ts`) — the normalized verdict space the applicability reducer
  consumes, reduced from the observation by `normalizeOverlap`. It is the layer where a distinction that survived
  the three above is spent, and it takes a different shape from them (below).

The first three carry the distinction as peer status arms, which is what lets the drift-overlap and review-status
readers report it. The fourth answers a narrower question and carries it as a discriminant instead.

**Each distinction lands as a peer `status` arm, never as another reason inside `unavailable`.** Recoverability is
a status-level property and every consumer branches on status: the act that clears `unrelated` is not the act that
clears `unavailable` (A13), so a condition parked under the wrong status is answered forever by a command that
cannot reach it — the defect class this work unit removes, reintroduced one layer down. `RevisionOverlapResult`
already models `unrelated` as a peer status, so the first layer is consistency rather than novelty; the two
downstream layers, which today express everything non-available as `unavailable` with a reason enum, gain the
structure.

**The normalized verdict space is the exception, and it is one by construction.** `EvidenceOverlap` is not a
reporting layer — it is the reduced input to a reducer that answers one question, "does prior evidence still
carry?", with three verdicts. `ambiguous` and `unrelated` are not new answers to it: both mean disjointness was
not established, and both reduce to `fresh`. A peer arm there would add a branch every consumer must handle and
every consumer resolves identically, while changing a projection that is not about base resolution at all —
`review-gate/status.ts` assigns `delta.overlap.kind` straight into the review-status `movement` field, so a new
arm silently widens a published projection's value set.

So the arm set stays at four, and **`unknown` carries the cause as a discriminant** — `read-failed`, `ambiguous`,
or `unrelated`. `unknown` means _disjointness not established_, never _nothing is known_; the discriminant says
which of the three established it. The reducer maps the discriminant onto its own reason (`overlap-unknown`
splits into per-cause reasons), so the verdict space stays three-valued while the cause survives to the surface.

This is not the reason-inside-`unavailable` shape the rule above forbids. That rule binds where consumers branch
on status to decide recoverability and emit a remedy; here no consumer branches on recoverability and the layer
emits no remedy, because the remedy is emitted upstream, at the three reporting layers. Should a consumer later
need to branch on terminal-versus-recoverable here, the discriminant is already the branch, and promoting it to a
status arm is mechanical.

**The forcing lever is the normalizer, not the arm set.** `normalizeOverlap` is the only place a layer-3
observation is _converted_ into a layer-4 value, and today it returns through an `as EvidenceOverlap` cast — so
the one place where every layer-3 arm crosses the boundary is exactly the place the compiler cannot see. The cast
goes, and the function becomes an exhaustive `switch` over the observation's `status` with an `assertNever`
default. That single choke point makes every arm added to layer 3 compiler-forced at the crossing, which is a
stronger guarantee than peer arms would buy: a conversion site is one lever, while consumers are many and two of
them are branchless.

It is the only _conversion_, not the only constructor — the distinction matters to anyone implementing this. The
`not-applicable` arm has a second origin entirely: a constant in the same module, assigned on the three delta
causes that ask no base question at all (`member-rewrite`, `approved-fix`, `unexplained`). `normalizeOverlap`
cannot produce that arm, and those three causes cannot reach a base-resolution arm, so the two origins partition
cleanly and the lever still covers everything a base read can produce.

**The delta boundary below it is a runtime check, not a compile-time one**, and that is the second reason the arm
set stays closed. `reduceEvidenceApplicability` revalidates whatever it is handed against the delta schema rather
than trusting where it came from, and both the schema and the delta type are exported — so any in-repo caller can
hand-build a structurally valid delta and reduce it. Three of the five reduction call sites already bypass
`normalizeOverlap` legitimately, on the causes that use the constant. With the arm set closed at four there is
nothing to smuggle through that boundary; a peer `ambiguous` or `unrelated` arm would be constructible there by
any caller, with no conversion site in the path to force the branch.

**The reason must reach a remedy, not just a word.** A cause that survives to the reducer and stops there would
be a better label on the same dead end. Each reduction consumer maps the per-cause reason onto its own typed
action rather than prose, per D10. Exactly two consumers can receive a base-resolution cause, because only the
two `base-movement` reductions reach the conversion at all:

- **Review status** — the cause reaches the reported surface beside `movement` rather than inside it, keeping
  the projection's value set unchanged. Its own `state` and `nextAction` follow the cause rather than routing
  every non-carrying result to a rerun, so a terminal cause stops inviting one.
- **Errand merge composition** — the second `base-movement` reduction. It parses its drift evidence straight
  into the observation schema by shape coincidence across the two layers, so it carries the cause to its own
  surface and constrains the arms' field sets (below).

**Candidate applicability is not one of them**, and saying so is load-bearing, because the relation does carry an
ambiguous case there under D2. That path never reaches this reducer: an ambiguous base is refused at the
`merge-base --all` read itself, ahead of any reduction, and applicability's one reduction composes a
member-rewrite cause whose overlap is the constant. D2's re-baselining remedy therefore lands on that refusal's
own result, where `nextAction` is a closed literal today — a disclosed contract change on the applicability
result schema, not a ride on a channel that already exists.

`FinalReasonSchema` gains the per-cause members, and it is embedded in `CandidateApplicabilityDecisionResult`, so
this is a request-contract change rather than a local rename — permitted in place under the pre-public-release
posture, and stated here rather than discovered during implementation.

**One module principle, independent of the above.** Within the reducer, a branch whose default resolves to the
strongest accept is the recorded failure class of this region: `reduceOtherMovement` ends in a two-way test whose
else-arm returns `carries`. It is exhaustive-switched with the rest, not because the discriminant reaches it —
`unknown` is caught before it — but because leaving a default-accept in a module this change is already opening
is how the next arm gets swallowed.

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

**Converted readers keep whichever failure channel they already use.** Two of them fail by throwing rather than
returning today, and the conversion does not unify that: `repository-target.ts` raises its new reason through the
typed error it already raises, while the subject collector returns the widened result its call sites handle and
leaves its unrelated throws alone. Adopting the resolver is a propagation, not a rewrite of how each reader
reports failure.

**The `ambiguous` remedy is per coordinate pair, not per reader** — one reader can serve pairs of different
topology, so the remedy attaches to the pair being compared:

- **`(head, base)` pairs — recoverable by merging the base in.** Merging one side into the other makes it an
  ancestor, which collapses cardinality above one to exactly one. A criss-cross is a property of the revisions'
  current shape, not a permanent property, and an append-only merge changes that shape. This reaches the sole-base
  resolver and the overlap analyzer's delivery and review call sites.
- **Pinned-durable-baseline pairs — not reached by that remedy; the route is re-baselining.** The overlap
  analyzer's integration-checkpoint call site compares the pinned Candidate durable baseline against the base, so
  the merge moves neither element and the refusal stands. That call site is `checkpoint-composition.ts`, and it is
  the one conversion the compiler will **not** force: it branches on `status !== "available"` and forwards
  `detail`, so a peer `ambiguous` arm compiles unchanged there and keeps folding the distinction back into one
  drift. It is converted explicitly, by name. Its residue is smaller, since the resolved base lands
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

**Where it lands, and what it takes.** The classifier is a new pure function in `predecessor-relation.ts`,
distinct from the existing async `predecessorRelation` — which keeps its injected `readAncestry` / `readOverlap`
dependencies and becomes one of its callers. Purity is possible only because the facts arrive pre-computed: the
classifier takes the bound head, the observed head, the ancestry answers relating them, and the merge-base
cardinality, and returns one variant. Every Git read stays in the reader wrapper around it.

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
  **refuses** `overlapping-ahead` as `wrong-predecessor` — in one branch that refuses `unrelated` on the same
  reason. Because `unrelated` leaves the relation for the resolver's arm, that branch sheds a condition and the
  terminal case is settled before the classifier runs rather than inside this refusal.
  No single variant name can carry that split: merging an
  accept and a refuse is the defect class this work unit removes, and it would recur under `advanced` exactly as
  it would under `diverged`. The migrated reader decides on the overlap, not on the variant — which is why D2's
  `diverged` is fail-closed _by default_ rather than by definition.
- **`disjoint-ahead` also covers the member-behind-tip case**, where the merge base equals the member head and
  the overlap is necessarily empty. In D2's vocabulary that is `rewound`, not `diverged`, so the migration splits
  this arm on ancestry direction rather than renaming it wholesale. `overlapping-ahead` has no matching case: a
  member behind the tip diffs empty against the merge base, so its overlap can never be the non-empty one.
- **The payloads need destinations.** `exact` carries `chainBase`; `disjoint-ahead` carries `chainBase`,
  `mergeBase` and `overlap`; `overlapping-ahead` carries `mergeBase` and `overlap` but no `chainBase`.
  `eligibility.ts` consumes `chainBase` as the coordinate it observes the chain against — at two readers, not one
  — so the migrated shape must keep it reachable for every arm that carries it today, and
  `samePredecessorRelation` — which compares each variant's payload field by field — must be migrated with the
  variants rather than after them, its `unrelated` branch removed rather than migrated.

  **`diverged` therefore carries `chainBase` unconditionally**, because the two source arms merging into it
  disagree about carrying it and an optional field would push a null check into the accept path. This costs
  nothing: on the `not-ancestor` branch the classifier already sets `chainBase` and `mergeBase` to the same merge
  base, so the arm that omits the field today can carry it by assigning the value it already holds. The two fields
  stay distinct rather than collapsing, since on the `ancestor` branch `chainBase` is the observed tip.
- `unrelated` maps onto the **resolver's** `unrelated` arm (D1) rather than becoming a seventh relation variant.
  The reader wrapper still needs somewhere to deliver it, and so does the ambiguous pair D1 splits out: it
  carries a resolved and an unavailable arm today, and folding either outcome into the recoverable-by-retry one
  is exactly what D1 forbids. So the wrapper **mirrors the resolver's four arms** — resolved, `ambiguous`,
  `unrelated`, `unavailable`. The terminal arm carries the observed tip and the resolver's detail; the ambiguous
  arm carries the pair and its per-pair remedy, and carries no merge base or overlap, because the multi-base
  branch returns before either is computed. Both refuse at both eligibility readers under their own reasons —
  an ambiguous pair reaching the accept path on an absent overlap would turn a refusal into an acceptance. The
  variant set stays at six; the arms sit on the read. The eligibility readers refuse the terminal arm under its
  **own terminal reason** carrying the observed tip but no relation
  payload — the migrated relation schema has no arm for one, and keeping `wrong-predecessor` would re-merge the
  terminal cause with the recoverable one this decision separates.
  "No common ancestor" is a fact the base resolver establishes before the classifier runs, and the classifier
  reads no Git — so the relation's six variants stand unchanged, and the terminal outcome stays separated from
  the recoverable ones rather than folding into `diverged`, which is recoverable and, on an empty overlap, even
  admissible.

**The `resolved` arm carries the chain-base-bearing variants only** — `unchanged`, `advanced`, `rewound`,
`diverged`. The other two never reach it, on their own grounds rather than by exclusion:

- `unknown` _is_ the `unavailable` arm. An ancestry read that established nothing is an unavailable read, not a
  classified relation; the wrapper owns the Git access, so it reports the failure as its own arm rather than
  handing a consumer a verdict-shaped value that means "no verdict".
- `absent` is not a topological answer at all. This read takes two revisions and asks how they relate; "no record
  binds this subject" is a prior fact about whether there is a subject to compare, and the read consults no record
  that could establish it. Every reader settles it before the call — the delivery readers by resolving their
  member coordinates, applicability and closeout by holding the binding itself.

This is what makes `chainBase` **total** on the resolved arm, and totality is the point: the close-time reader's
null-chain-base branch is then removed because the value cannot be absent, not because a comment asserts it
cannot. A narrowed arm is the executable form of that guarantee; an unreachable-by-assertion variant is not.

**Both eligibility readers decide on the overlap, and both decisions are stated here** — the migration retires
the only overlap protection the close-time reader has, so designing one without the other leaves it accepting.

- **Prepare-time** accepts an empty overlap and refuses a non-empty one, which is today's `disjoint-ahead` /
  `overlapping-ahead` split re-expressed on the field.
- **Close-time reads the same field and refuses on the same condition.** Today it has no overlap test at all: it
  derives a chain base for the variants that carry one and `null` for those that do not, then refuses the null —
  so the refusal is a side effect of `overlapping-ahead` lacking a field. Giving `diverged` a `chainBase`
  unconditionally makes that branch dead, and the reader keeps accepting unless the test it stood in for is
  written out.
- **The snapshot comparison is not that test.** The snapshot arrives through the request contract
  (`EligibilitySnapshotSchema` inside `CloseSchema`), and the close-time read is taken over the member head and
  protected-base head that snapshot carries — both pinned object ids. A snapshot whose relation already holds a
  non-empty overlap therefore reproduces identically and compares equal. The comparison proves the snapshot is
  _consistent_; it never proves it is _admissible_.
- **The close entry point is the only one that admits such a snapshot**, which bounds where the new test goes. The
  mutation path re-prepares through the prepare-time reader and inherits its refusal, so close is the single
  reader that accepts a submitted relation without one.
- The chain-base identity comparison survives as what it is — a coordinate check that the snapshot's chain base is
  the one the fresh read reaches.

**The emitted surface, per arm, at both readers.** Each arm names its own reason and carries a remedy that can
actually clear it:

| Arm                           | Reason                  | Remedy                                               |
| ----------------------------- | ----------------------- | ---------------------------------------------------- |
| `diverged`, overlap non-empty | `wrong-predecessor`     | rebuild the delivery chain — no automated command    |
| resolver `unrelated`          | its own terminal reason | rebuild from a common lineage — no automated command |
| resolver `ambiguous`          | its own reason          | merge the base in                                    |

The ambiguous row is where D1's per-pair rule is spent: this read compares a member head against an observed
protected-base tip, which is a `(head, base)` pair, so the merge collapses cardinality to one and the remedy
clears the refusal. It is not applicability's pinned-baseline pair and does not take that pair's re-baselining
route. The terminal and ambiguous arms carry the observed tip themselves, since neither carries a relation.

**The refusal's `remedy` slot becomes a union, and the projection converts with it.** The slot holds one kind
today (`delivery-authoring-rebuild-required`), so a second kind is a widening at the library. The locus that must
widen with it is the owned-authority failure projection in `handlers/delivery-execution.ts`, and it is named here
because the compiler will not name it: the projection `safeParse`s each preserved field and spreads it only on
success, so an unrecognized remedy kind is **dropped silently** and the refusal ships with no remedy at all. The
same projection reads its `observedHead` off the relation's `observedTip`, which the terminal and ambiguous arms
do not have — it takes the tip from the arm that carries it instead.

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
   `contribution-conflicted`, each with its paths. Any other refusal stays hard. Composing the provider collector
   takes an adapter rather than a direct call: it proves per `DeliveryProviderRefreshMovement` — `deliverableId`
   plus before/after snapshot members, with predecessors resolved by the caller — while the native loop proves per
   `DeliveryContributionEndpoints`, before/after pairs of predecessor and member coordinates it has already
   observed. The native side supplies a closure mapping its endpoints into the movement shape; the collector is
   unchanged.
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
   third kind through provider branches written as a binary. That object is
   `DependentRefreshExecutionScopeSchema`, **shared by reference** with the union rather than inlined at `scope`,
   so the native kind lands as a new discriminated union at `scope` itself; adding the kind to the shared object
   would widen the union by the back door and produce the exact re-route above. The native arm also cannot copy
   the dependent-suffix shape: that scope keys on `selectedDeliverableId`, while the native path reconciles the
   complete remaining registered suffix and `NativeMergeRequestSchema` carries no member identity at all — so the
   native scope identifies the suffix under reservation, not a selected member.
   `RefreshConflictResolutionSchema` is also shared with the live `arc delivery refresh adopt` request, so any
   change there is a provider-contract change and must be disclosed as one. **Two library loci break with it, and
   they are where the contract actually changes:** `DeliveryProviderConflictResolutionInput` in
   `suffix-reconciliation.ts` mirrors the scope shape and hard-codes `kind: "dependent-suffix"`, and
   `adoptExternalDeliverySuffixRefresh` dereferences `conflictResolution.scope.selectedDeliverableId` directly,
   which stops typechecking the moment `scope` is a union. That dereference is also where a native-scoped
   resolution is refused on the provider path: the adopt request accepts the shared resolution schema wholesale,
   so the refusal is a typed guard at that call site rather than a schema narrowing that would fork the type. And
   the resubmission in step 3 has nowhere to arrive: `NativeStatusSchema` is `{ planId, request, remote }`, so it
   needs the field that carries the resubmitted resolution.
3. With a resolution supplied, refuse `conflict-resolution-mismatch` unless that blob canonicalizes identically
   to a freshly derived one, then settle under the held reservation.

   **What the native path digests.** `observedSuffixDigest` is the comparison's whole content, and the native path
   has no `DeliveryOperationSnapshotV1` to hash — the provider derives it from one, while the native settle builds
   a local observed-member array and calls `canonicalDigest` nowhere today. The native digest covers **the freshly
   observed member coordinates**, the same values the conflict set was derived from, so a concurrent unrelated
   push that moves any observed member changes the digest and re-discloses rather than settling silently.
   Digesting the projected state or the conflict set alone would each answer that differently, so the choice is
   part of the contract rather than an implementation detail.

**Nothing is persisted on the input side of this arm** (A6), so nothing here can go stale; what survives the
wait is the reservation already durable in `activeOperation`. Arrival needs no new operation, and the only
state-schema addition is the one D9 owns for the decline's lease, not one this protocol requires — the native
path consumes the resubmitted disclosure in the same `land-status` call that settles, at the same revision,
because every suffix conflict refusal returns before any state write. **D7's terminal arm does persist first**
(A6): its phase publish advances the state revision before the wedge returns, so a resolution pinned to the
pre-publish revision cannot match on resubmission. The resubmitted resolution therefore binds the conflict set
it answers, not the revision that carried it. Adoption is the conflict collection, the
disclosure, and a scope discriminant on the `native-land-status` request.

The approval fires on genuine collisions only: identical trees take the `tree-equality` fast path and clean
reapplies take `mechanical-reapply`, both silent. Movement alone never asks anyone anything.

**The disclosure is not gated on a `reviewable` path; every conflict set discloses.** Gating it was sound in
shape — a collision confined to lifecycle projections carries no judgment to spend, and `classifyPathTreatment`
makes only three things non-`reviewable`: the ROADMAP (`regenerable`), Candidate projections, and the work unit's
own artifacts and companions (both `evidence-neutral`). What it never acquired is a measurement over the
population the gate would actually read. Adopting it on the approximation available instead is the symmetry
Proportionality rules out, so the gate is dropped rather than carried. Dropping it costs one avoidable prompt in a
rare case and stays forward-compatible: a later measurement over real conflict sets can add the gate without
disturbing the protocol around it.

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
  union and would fail validation at runtime rather than at the compile boundary. Two further arms carry
  `conflictPreparation` already and neither fits: `RetainedOperationBlockSchema` requires `operationId` and
  `nextAction`, which this refusal has not, and a **separate** arm pinned to the `content-conflict` reason literal
  carries it as **required** beside `paths` but admits no `guidance`. So the library result type and
  `BlockedContributionRefusalSchema` are what gain the optional field — three arms exist, and the two that already
  carry it are named so a later reader does not mistake either for the slot.

  **Emitting the pinned `content-conflict` arm instead, rejected.** It is the obvious shortcut — that arm needs no
  schema change at all — but the native path translates the absorber's `content-conflict` into
  `contribution-conflicted` at two deliberate sites, and reversing that is a second user-facing surface change no
  goal here asks for. The arm also admits no `guidance`, so routing through it would delete the prose D10 exists to
  correct rather than correcting it.

  **`BlockedContributionRefusal` is not a third locus** — recorded because the name invites the assumption. It is
  a file-local conditional type over `DeliveryContributionRefusal`, not the schema's inferred type: its arms carry
  no `guidance`, one carries no `paths`, and its only consumer is `ProviderAdoptionBlockedResult`, whose sibling
  arm already carries `conflictPreparation` under a `reason: string` that subsumes the literals. Nothing on the
  native path routes through it, so widening it buys nothing — and doing so through the contribution-proof schema
  rather than the local alias would drag `evidence-applicability`'s base-merge observation into this change.
- **The restorations need a slot before they can be carried.** `BlockedContributionRefusalSchema` is a
  `z.strictObject` of exactly `{ status, reason, paths, guidance }`, and the only `externalRefRestorations` in the
  handler belongs to the unrelated `conflict-resolution-required` arm. Emitting restorations without adding the
  field produces an invalid service result — the same runtime failure `conflictPreparation` is added to avoid, so
  both fields land in the same edit to the library result type and that schema.
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
alongside the four `land-*` verbs — `land-select` / `land-prepare` / `land-submit` / `land-status` — and the
group's three non-landing commands, `observe` / `link` / `unlink`.

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
what it restored and what it deliberately left standing.

**It admits only a settled effect.** A held native land reservation is not a sufficient precondition: a `prepared`
reservation and an in-flight `submitting` one present the same way, and clearing either while a host merge is in
flight releases the wedge with nothing left to reconcile against — a protection the Non-Goals freeze. The decline
observes the effect first and refuses on pending, partial, or ambiguous facts exactly as the reconcile path does;
an effect that never applied routes to `land-status`, which owns that reconciliation. Both disclosure points this
verb exists for sit after an applied effect, so the precondition excludes neither.

The two disclosure points need different amounts of restoration: the suffix arm has nothing to restore, while the
absorption arm must put back refs ARC moved itself.

Both shapes already exist. The restoration is `rewriteLocalRef`'s existing `{ ref, beforeHead, requestedHead }`
call with its arguments swapped, lease-checked, refusing rather than forcing when the lease fails — no force-push
on either arm, which keeps this clear of the rebase-and-force prohibition. The transition takes the template of
the `not-applied` clear (a typed clear carrying a named resume action and an exact subject selector) but **not its
code path**, which reconciles against observed host facts on the premise that the effect did not apply; here the
effect did apply and the operator is declining to adopt it.

**The execution shape has its own precedent, on a different axis from that transition template.**
`reapCompletedDeliveryResidue` already runs exactly this order: lease-checked undo per item under an expected
head, a typed refusal returning the still-held reservation on any failure, then one `stateStore.publish` of the
reservation's value with `activeOperation: null` at its exact revision. Compose that shape rather than deriving
it — including its refuse-before-publish ordering, which is the no-half-release rule already proven. What
transfers is the undo → refuse → publish **tail** alone: the precedent mints its own teardown reservation before
undoing, which the decline must not do, since it acts against a reservation already held. What else differs is the
inventory undone: candidate refs and gates there, local member refs **and the absorbed terminal top** here
(A1) — every ref the settle moved under a lease, which is the inventory Success Criterion 7 names.

**The restoration target is durable; the lease is not, so the settle records it.** The single state write lands
after the member-ref rewrite, so while the reservation is held the persisted state still carries pre-rewrite
member coordinates — which is where the decline reads its restoration **target**. The lease is the other value:
after the argument swap, `beforeHead` is the head ARC rewrote the ref **to**, and nothing persists it. The
reservation is minted with `before` and `requested` from the same pre-landing snapshot, the rewrite's
`requestedHead` is derived from a fresh observation inside the settle, and the settle's only publish is its last
statement — which a refusal never reaches.

So the settle **phase-publishes the observed suffix coordinates into the held reservation immediately before the
rewrite loop**, composing the phase-publish precedent already in the same file: `beginNativeDeliverySubmission`
publishes a phase state before the irreversible host effect for the same reason — so recovery has something to
read. Placement is exact. Every conflict refusal returns before the rewrite loop, so the disclosure and
resubmission paths still return before any state write; only a settle that proceeds to move refs publishes at
all. **The absorbed top takes a phase publish of its own (A1)**, between the absorb that moves it and the
publication that can fail with it moved: its observed head does not exist until the absorb returns, and the
two-ended lease a decline restores it under needs that head exactly. The placement above is unchanged — the
member record still lands immediately before the rewrite loop — so a settle that moves members and absorbs a
top publishes three times, and one that only moves members still publishes twice.

**Three moves, not one.** The precedent works because it makes all of them, and a phase publish that makes only
the first corrupts the reservation rather than recording it:

- **The coordinates land in a dedicated field on the `land` arm's `native` object**, beside `arm` and `phase`.
  They do not overwrite `requested`. That field is the record of what ARC was **authorized to produce**; the
  observed suffix is what ARC **saw**, and collapsing the two is the conflation this work unit removes — even
  though the land arm's authorization comparison would tolerate it, since `matchesHostAssignedResult` substitutes
  `requested`'s coordinates into the observation before comparing. Reuse would also change what the reconcile
  path emits as its applied snapshot.
- **`stateRevision` advances to the published revision**, and `native.phase` gains the value naming this phase.
  A reservation whose `stateRevision` is not one behind current state is `operation-stale`, which would wedge
  `land-status`, `land-release`, and reconcile permanently.
- **The settle rebinds its landing record to the phase-published value**, so its terminal publish uses the new
  revision. The terminal publish is revision-checked; leaving it on the pre-phase revision makes every successful
  settle that rewrites a ref return `state-conflict`.

The cost is one additional state write on a settle that moves refs, plus the field and the phase value. What it
buys is a lease precise enough to refuse the case that matters. **The rejected alternative is re-observing the
host** and leasing on local-equals-host: that comparison cannot distinguish a ref ARC moved from one the operator
took over by pushing to the member branch and pulling — both leave local equal to host, so the lease passes and
the decline restores a pointer the operator now owns. Leasing against what ARC recorded refuses there.

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

**Where each half lands.** The settlement result types its blocked reason as the single literal
`"terminal-unsettled"`, so fourteen reasons **widen that union** — a type change, and one with a second consumer:
`retireCompletedDeliveryRecords` spreads the blocked settlement result straight into its own retirement result,
whose reason is a free string. The reasons also owe a **distinguishing shape**, because closeout passes the
terminal reason through bare while prefixing its own, and the two sets otherwise share one namespace.
`terminal-unsettled` already carries that shape. The **typed remedy** is the half that is a contract addition: the
emitted closeout refusal carries a prose remedy today, which is precisely the prose that directs a rerun over
inputs the failing term never reaches. It gains a dispatchable remedy derived from the reason, leaving the library
result untouched.

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

**A two-member delivery plan, rejected on the landing constraint.** The cut is structurally real: the conflict
protocol and its decline verb (D6–D10) share no file, no type, and no pinned probe with the comparison substrate
and its readers (D1–D5, D11–D13), so either half would typecheck, test, and read coherently on its own. What
declines it is not that evidence but the constraint this work unit sits under — a stacked landing whose successor
is unresolved waits on a shipped post-landing recovery path, and that path is what this work unit builds, so
stacking it would make it wait on itself. The halves stay one delivery member behind one merge boundary, and
their independently reviewable surfaces route through ordinary review chunking, which is a review boundary rather
than a merge one.

## Cross-cutting Considerations

**Trust boundaries.** The design adds reachability above the write boundary and relaxes nothing at it. The
approval fires only on genuine collisions; mechanical proof continues for every other movement. Semantic approval
is required only for disclosed conflicted contributions. Lease-checked publication and revision-checked state
writes are preserved, and interrupted retries converge without resubmitting a landed member.

**Refusal recoverability.** Every refusal this design touches must distinguish terminal failure from a
recoverable stop, preserve a safe retry route, report the observed condition, name an actionable typed remedy,
and keep the success path reachable after repair. Of D1's arms, `unavailable` is recoverable and `unrelated` is
recoverable by hand merge only, since no `arc` verb joins unrelated histories (A13); `ambiguous` is recoverable
**per coordinate pair** — by merging the base in at a `(head, base)` pair, by re-baselining at a
pinned-durable-baseline pair, and by the restart route where an append-only merge is not permitted. D13's
per-term reasons are what let closeout satisfy the report-the-observed-condition clause at all.
Verification covers both the refusal and successful continuation after repair.

**Merge-queue compatibility, carried as a constraint.** A queue is a head-mover, and a rebase-style submit
strategy moves the request head. Whatever replaces the equality comparison must not assume the landed head is the
head ARC bound. That property belongs to the classifier rather than to any queue, so it is asserted there — an
externally rewritten head classifies as `diverged` or `rewound`. End-to-end compatibility stays **unverified** by
deliberate choice: every enumerated row moves the head from inside ARC, adopting a queue is a Non-Goal, and no
observed failure asks for a probe that simulates one.

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
refusal. The emitted closeout refusal gains a dispatchable remedy beside its per-term reason, replacing the prose
one it carries today. Readiness stops emitting `delivery-member-mismatch` altogether: of its three `path`
discriminations one becomes tautological, one becomes the `not-in-plan` arm, and one survives under a renamed
identity (D12); its separate terminal-member fact is unaffected and must survive the inversion. The shipped
`deliver-stack.md` workflow documents this protocol and changes with it: its statement that a suffix
reconciliation refusal is settled by rerunning `land-status` "without resubmitting" is exactly what D6 replaces,
and the native landing lifecycle it drives by verb gains the decline. That edit goes through the package source
and syncs to the project copy, never a copy between them.

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
10. The shipped `deliver-stack.md` describes the protocol as changed: no instruction to settle a suffix
    reconciliation refusal by rerunning `land-status` without resubmitting, and the decline verb present in the
    native landing lifecycle it drives.
11. An ambiguous or unrelated base reaches the operator with a remedy that can clear it, or with a terminal
    statement that stops inviting one — at both readers that refuse the pair (D3) and at both reductions that can
    receive the normalized cause (D1). No such refusal reports a recoverable-looking retry it cannot satisfy, and
    none ships with its remedy dropped in projection.
12. On a work unit with no bound delivery terminal, an ambiguous or unrelated base reaches the integration
    checkpoint with a remedy that can clear it, rather than a rerun of the checkpoint that reported it. (A4)
13. Every refusal arm this work unit newly routes an operator into names a remedy that can clear its own
    condition, and review readiness states only the relation its own read established. (A5)

## Open Questions

Both resolved at task generation; each decision and the evidence behind it is recorded here so a later reader
does not reopen it on the same inputs.

- **Whether an all-neutral conflict set settles without asking (D6) — resolved: the gate is dropped.** It needed a
  measurement over the population the gate actually reads: the member-suffix conflict set `merge-tree` reports,
  which `base-overlap.ts` classifies as the shared-path intersection. The only measurement available ran over
  landings instead — over `git log --merges -80 main`, ~4% of landings (3/76) touched only neutral or regenerable
  paths, and 1 of 26 consecutive overlapping landing pairs had an all-neutral overlap, two lifecycle operations
  touching the same work unit's meta. Right order of magnitude, wrong population, with consecutive landings only a
  rough proxy for concurrency. Adopting on that is the symmetry Proportionality rules out, so every conflict set
  discloses. The cost is one avoidable prompt in a rare case; the gate remains addable later without disturbing
  the protocol.
- **Merge-queue compatibility under an external head-mover — resolved: asserted at the relation, not probed.**
  The constraint is that the replacement comparison must not assume the landed head is the head ARC bound, and
  that is a property of the classifier rather than of any queue. It is asserted there: an externally rewritten
  head classifies as `diverged` or `rewound`. No probe simulates a rebase-style submit strategy — adopting a merge
  queue is a Non-Goal, every enumerated row moves the head from inside ARC, and no observed failure asks for one.
  The absence of end-to-end external-mover coverage is therefore deliberate and recorded, not an oversight.

## Amendments

- **A1** — 2026-09-18 — design: the decline's restoration inventory includes the absorbed terminal top, not
  member refs alone. _Supersedes:_ § D9 — the inventory-undone sentence. _Trigger:_ 8.1 terminal. _Work:_ 3.R.
  _Revalidated:_ verify-work-unit.
- **A2** — 2026-09-18 — task: the normalized base-resolution cause reaches the operator at both reductions.
  _Supersedes:_ none. _Trigger:_ 8.1 terminal. _Work:_ 4.R. _Revalidated:_ verify-work-unit.
- **A3** — 2026-09-18 — task: the retired review-status hold's replacement asserts the remedy it names.
  _Supersedes:_ none. _Trigger:_ 8.1 terminal. _Work:_ 4.R2. _Revalidated:_ verify-work-unit.
- **A4** — 2026-09-18 — design: the integration checkpoint receives the base-resolution cause, so a work unit
  with no bound terminal reaches the route D1 carries. _Supersedes:_ `notes-delivery-post-landing-conflict-recovery.md`
  § Propagation surfaces — the two-reduction enumeration. _Trigger:_ 8.1 terminal. _Work:_ 4.R3.
  _Revalidated:_ verify-work-unit.
- **A5** — 2026-09-18 — spec-depth: each refusal this work unit newly makes reachable names a clearing remedy
  and states only what it read. _Supersedes:_ `notes-delivery-post-landing-conflict-recovery.md`
  § Recorded exclusions — the readers-agree argument under the unresolvable-ancestry exclusion.
  _Trigger:_ 8.1 terminal. _Work:_ 1.R, 7.R. _Revalidated:_ verify-work-unit.
- **A6** — 2026-09-18 — design: the terminal arm persists before its wedge returns, so a resubmitted resolution
  binds the conflict set rather than the revision. _Supersedes:_ § D6 — the input-side staleness sentence.
  _Trigger:_ 8.1 terminal. _Work:_ 2.R. _Revalidated:_ verify-work-unit.
- **A7** — 2026-09-18 — task: a check drives a post-settle member back through the landing readiness gate.
  _Supersedes:_ none. _Trigger:_ 8.1 terminal. _Work:_ 2.R2. _Revalidated:_ verify-work-unit.
- **A8** — 2026-09-18 — task: the unbound work unit reaches the movement plan's route, and `unrelated` keeps the
  terminal disposition D1 gives it. _Supersedes:_ none. _Trigger:_ 8.1 adversarial pass 3. _Work:_ 4.R4.
  _Revalidated:_ verify-work-unit. _Amended in:_ A13 — the disposition half is retracted; the row's own
  supersession carries what replaced it.
- **A9** — 2026-09-18 — task: the second reduction's invalidation carries a typed action beside the cause.
  _Supersedes:_ none. _Trigger:_ 8.1 adversarial pass 3. _Work:_ 4.R5. _Revalidated:_ verify-work-unit.
- **A10** — 2026-09-18 — task: the widened results' remaining consumers refuse typed rather than throwing.
  _Supersedes:_ none. _Trigger:_ 8.1 adversarial pass 3. _Work:_ 6.R. _Revalidated:_ verify-work-unit.
- **A11** — 2026-09-18 — task: the decline names the remote terminal top it leaves standing.
  _Supersedes:_ none. _Trigger:_ 8.1 adversarial pass 3. _Work:_ 3.R2. _Revalidated:_ verify-work-unit.
- **A12** — 2026-09-18 — task: each settlement-phase refusal names the act its own cause needs.
  _Supersedes:_ none. _Trigger:_ 8.1 adversarial pass 3. _Work:_ 1.R2. _Revalidated:_ verify-work-unit.
- **A13** — 2026-09-18 — design: `unrelated` is cleared by the hand merge review status already names, never
  by `arc base merge`, so the readers name that remedy instead of a disposition. _Supersedes:_ § D1 — the
  `unrelated` row's terminal disposition. _Trigger:_ 4.R4 must-stop. _Work:_ 4.R4.
  _Revalidated:_ verify-work-unit.
- **A14** — 2026-09-18 — task: an ambiguous base reaches the movement plan's reconcile route through the
  production reader, over the evidence bar every other reconciliation meets. _Supersedes:_ none.
  _Trigger:_ 8.1 adversarial pass 4. _Work:_ 4.R6. _Revalidated:_ verify-work-unit.
- **A15** — 2026-09-18 — task: the delivery classifier's remaining actions reach the operator as the act each
  names, rather than as a token under a rerun. _Supersedes:_ none. _Trigger:_ 8.1 adversarial pass 4.
  _Work:_ 4.R7. _Revalidated:_ verify-work-unit.

---
