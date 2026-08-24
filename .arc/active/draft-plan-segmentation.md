# Draft: plan-segmentation — order the task plan for early end-to-end feedback

- **Origin:** [internal] — minted 2026-07-28 from a session-init design discussion on whether ARC's planning
  stages should support a vertical-slicing / tracer-bullet posture, and where such a posture would live.
- **Purpose:** Close the feedback gap between "the design was settled at spec time" and "the assembled work was
  validated at verification": give `generate-tasks` a principled way to shape the task plan so implementation
  yields exercisable end-to-end capability _as it lands_, and a discriminator for when that shaping is the wrong
  choice.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration._

### `[ ]` **Make task generation assign complete lifecycle transitions to executable segments**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: plan-segmentation`), grooming errand (2026-08-24).
- _Concern:_ `delivery-native-stack-composition` Phase 6 was decomposed horizontally across refresh planning,
  suffix proof, top absorption, native routing, recovery, handlers, and workflow prose. Each primitive and local
  contract tested green, yet no task owned the complete external-refresh adoption or typed native-fallback
  transition. The resulting gaps survived repeated adversarial passes: top absorption had no refresh-adoption
  caller, native selection admitted caller-authored coordinates before state binding, and `native-stack-required`
  stranded a sequential reservation behind an inapplicable refresh command. Member-level acceptance criteria also
  omitted an explicit D5 lifecycle, while workflow integration tests mainly asserted strings and ordering rather
  than executing the state transition.
- _Approach:_ strengthen `generate-tasks` for composition-risk plans: inventory each supported lifecycle row from
  initial durable state through caller and fresh authority, mutation boundary, reservation/CAS and crash-retry
  behavior, and typed next action; then assign every row to one vertical segment or parent task that wires its
  production callsite and proves it with an executable scenario. A primitive, schema arm, or workflow paragraph
  cannot close the obligation by itself. Require member/phase exit criteria to cover every mandatory spec
  lifecycle, not merely representative outcomes. Draft/spec authoring should name invariants, capabilities, and
  transitions; task generation owns turning those into vertically closed implementation and verification slices.
- _Coordination:_ this WU owns the planning discriminator and executable segment exit criterion. Coordinate with
  `runtime-composition-seams`' named-seam and zero-caller guard so deterministic reachability analysis
  complements, rather than substitutes for, lifecycle scenario ownership.

### `[ ]` **Regrounding: recurrence evidence, stacked-delivery reader, and external prior art (2026-08-24)**

- _Routed from:_ session discussion + `medium-research` pass, grooming errand (2026-08-24).
- _Concern:_ the capture above is not isolated — the same failure shape (spec solid, verification finds
  implementation gaps sourced to task-list coverage) recurred at pattern level across the recent execution era
  (`integration-boundary-accuracy`, `decompose-extraction`, and/or `delivery-stack-topology`; not individually
  re-cited). Two recurring shapes: **unwired production callers** (modules built but unreachable), and
  **surface-level statement without the next-layer-deep realization** a detailed spec normally supplies. This
  converts the WU from capability-motivated to evidence-motivated and supplies the re-grounding the draft says it
  owes.
- _Bearing on open questions:_ stacked delivery now gives each deliverable phase its own verification step
  (`validate-criteria`, extracted in `delivery-native-stack-composition`) — a concrete, already-built candidate
  for the **exit-criterion reader** (the draft's efficacy hinge), pulling the surfacing question toward
  _recorded_. Each deliverable must land independently by definition, making member boundaries de facto vertical
  exit criteria; re-check where the segment ↔ chunk refinement-invariant question now lives (routed to
  `chunked-delivery`, effectively DNSC).
- _External prior art (research pass, 2026-08-24):_ walking skeleton (Cockburn/GOOS), tracer bullet (Hunt &
  Thomas), and steel thread are one idiom under three names — thin, real, kept, end-to-end first — targeting
  exactly this composition risk; GOOS's acceptance-test-per-slice discipline (an executable end-to-end test reads
  each increment's done-ness, not structural assertions) is the strongest sourced form of the executable exit
  criterion. SPIDR's published discriminator ("if no cut produces a shippable slice, it's a scope problem, not a
  splitting problem") and the recognized substrate/migration alternatives (enabler work, layer-first,
  canary/expand–contract) externally validate the three-mode residual-risk taxonomy — including
  `pilot-then-replicate` as a real, distinct rollout idiom. Slice-scaffolding disposition is a **gap in the
  published literature** (closest convention: stub retirement tied to a later planned slice's done-ness), so ARC
  would be authoring, not adapting. Naming caution: "steel thread" has contested notability — cite walking
  skeleton as the anchor prior art.
- _Coordination:_ task-list conventions this WU would edit are partly in DNSC's unlanded worktree; spec
  finalization for anything touching task-list/member conventions should follow DNSC's ship. `plan-amendment`
  (minted alongside this adoption) owns the mid-implementation corrective procedure for the residue this WU
  cannot prevent; the two are complementary, not overlapping.

### `[ ]` **Make batching the fail-first-preserving form for coupled test-first behaviors**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: TBD`), housekeep drain (2026-08-10).
- _Concern:_ one minimal implementation often satisfies several coupled behavior tests, making later RED steps
  unreachable. Connect the existing batching judgment to fail-first integrity: when behaviors share one indivisible
  implementation, batching can be the sequence in which every test genuinely fails first.
- _Approach:_ widen the manufactured-RED rule to incidentally satisfied behaviors, record reconstruct/revert
  evidence at completion, and weigh declaring the cycle boundary during task generation when coupling is visible.

---

## Grooming status (continuity)

> _Updated each `--plan plan-segmentation` pass — see `draft-design` § Re-synthesize. This is the resume anchor._

- **Readiness:** `rough` — the discriminating axis and the boundaries against neighbouring work units are settled
  and survived an adversarial pass. Scope is **not** yet known: whether segmentation produces a recorded artifact
  changes both the deliverable set and the estimate, and it co-determines where the doctrine lives. Two further
  items are open in the model itself — what reads a segment's exit criterion, and whether `pilot-then-replicate`
  is a segment mode at all.
- **Resolved (2026-07-28, first pass):**
    - **The gap is composition, not derivation.** Every existing feedback mechanism is diff-shaped (task
      interlock), mechanical (quality gates), or terminal (`verify-work-unit`). Nothing exercises the work
      unit's assembled behavior until verification, so a design that is internally wrong or does not compose
      survives the entire implementation.
    - **The deliverable is phase _exit criteria_, not phase decomposition.** Vertical slicing is the means; the
      end is that a plan boundary can close on demonstrable end-to-end capability rather than a completed layer.
      Scoping to exit criteria keeps this work unit out of decomposition rules other work units own.
    - **Segment is the unit; modes attach to segments, not to work units.** A task plan is an ordered sequence of
      **segments**, each carrying a **mode**. A vertical segment is a _slice_. Mixed plans are therefore the
      general case and single-mode plans the degenerate one — the doctrine never reads as binary.
    - **The discriminating axis is the locus of residual risk after planning closes** — not design determinacy.
      Determinacy was the intuitive read and it mis-advises the determinate-but-mechanically-unproven case (a
      settled migration applied N times).
    - **The residual-risk axis has three loci** — composition, substrate contract, and mechanics at scale (see
      § Proposed direction). The axis itself held up under attack. Whether all three loci are _segment modes_ is
      open below. Grounding is one corpus case with a real task plan (`review-architecture`) plus two constructed
      cases; `chunked-delivery` carries `Task List: [none]`, so classifying it read its design sequencing rather
      than a task plan, which is a different object.
    - **No new entry read at `generate-tasks`.** The stage already makes one scale-axis read driving two outputs
      (level + `Class`). Segmentation reads the same evidence for a different question: one read, three outputs.
      The feed-forward-immunity precedent holds — the stage re-derives rather than inherits. Settled for the
      _read_; whether its result is then recorded is the surfacing question below.
    - **Segmentation feeds delivery; it does not compete with it.** `chunked-delivery`'s `DeliveryPlan` requires
      every implementation leaf to occur in exactly one member _in task-inventory order_, with `members` as the
      only topology-order carrier. Chunk membership is therefore induced by task order, so segmenting the plan
      changes which contiguous ranges are available to promote. Whether that means segmentation needs no
      task-list annotation of its own depends on the surfacing question below — task order carries the segment
      _boundaries_ but not the _mode_, and an unrecorded mode is readable by neither delivery authoring nor any
      later gate.
    - **`spike` and `slice` are different attestations and must not share vocabulary.** A spike runs against a
      design that does not exist yet and therefore cannot falsify a spec; a slice runs against one that does. A
      spike de-risks _inputs_; a slice de-risks _composition_. Adjacent on one risk timeline, not coupled.
    - **Spike code must not be built for reuse by implementation.** `synthesis-modality`'s disposition contract
      (throwaway default, explicit stabilization contract to evolve) exists to prevent exactly that drift.
      Designing spike scaffolding for downstream reuse _is_ the calcification pathway, not an efficiency.
    - **`Class = Heavy`; draft depth = `medium`.** Derivation is real — a discriminator and a cross-work-unit
      contract seam must be authored — while the implementation surface is small. Composed from existing prior
      art rather than invented, so not `Novel`.
- **Open (developer calls):**
    - **What reads a segment's exit criterion, and when — the efficacy hinge.** § Problem diagnoses the existing
      guidance as losing because the rule with mechanical teeth (test-first grouping) beats the prose beside it,
      and three of the four deliverables below are prose added beside that same prose. Nothing currently reads an
      exit criterion: `generate-tasks`' Finalize checklist has no entry for one, and the per-phase gate in
      § Grounding audit is a task-audit grounding pass, not a capability-exercised check. Candidate readers are
      that per-phase confirm gate, the Finalize checklist, or a `verify`-side check. This is the item that most
      determines whether the work unit is four prose edits or a recorded surface, and it pulls the surfacing
      question toward _recorded_.
    - **Is `pilot-then-replicate` a segment mode at all?** A segment is defined as closing on _one_ stated kind of
      progress, and this mode names two in sequence ("one proven instance, then repetition"), so its boundary is
      undefined. The settled "mixed plans are the general case" already composes it as two segments — but that
      leaves the replication segment's own mode unnamed, so recomposing may collapse the taxonomy rather than
      repair it. Settle whether the three risk loci map to three modes, or to two modes plus a composition.
    - **Slice scaffolding disposition.** Vertical segments generally need scaffolding for layers they do not yet
      fully build; that code is not kept, which is why the spike/slice boundary cannot rest on "slice code is kept
      by construction." Two credible owners: a fifth deliverable here (raising the estimate), or an extension of
      `synthesis-modality`'s disposition lifecycle to a second code kind. Neither is chosen.
    - **Segment ↔ chunk refinement invariant.** Should chunk boundaries be required to _refine_ segment
      boundaries (every chunk within one segment, so no chunk straddles a slice seam)? That is the clean
      invariant and it is what lets segmentation feed delivery for free — but a chunk may legitimately want to
      span a substrate segment plus the first slice for contract cohesion. Routed to `chunked-delivery`; it
      touches that work unit's record, so the call is theirs.
    - **Doctrine placement.** Whether the discriminator lands as a method (fired from `generate-tasks`), a
      section in `strategy-work-planning`, or inline workflow prose. Weigh against `knowledge-architecture` and
      `strategy-knowledge-evolution` before minting a new always-loaded surface.
    - **Mode naming.** `vertical` / `horizontal` / `pilot-then-replicate` are working names. `horizontal`
      collides loosely with `chunked-delivery`'s "stack" and `assess-cohort-fit`'s stack-vs-cohort usage; settle
      so the three read together rather than reusing a loaded term.
    - **Test-first reconciliation shape.** The rule change is identified (below); whether it is a `test-first`
      method edit, a `generate-tasks` edit, or both is unsettled.
    - **Does a segment need to surface at all?** If segmentation is purely an authoring-time shaping read with
      no artifact, the work unit shrinks considerably. The counter-argument is that an unrecorded segmentation
      cannot be audited, re-read at a tripwire, or consumed by delivery authoring.
- **Next:** settle the exit-criterion reader first — it is the efficacy hinge and it largely decides the surfacing
  question, which in turn decides placement. Then the `pilot-then-replicate` mode question, then scaffolding
  disposition and mode naming. Fold `chunked-delivery`'s answer on the refinement invariant when it lands, and
  re-read the whole draft against whatever neighbouring work units have shipped by then.

---

## Problem / Motivation

ARC is spec-directed: design is settled up front and implementation realizes it. That works, and this work unit
does not weaken it. But it leaves one class of error uncaught for the entire length of a work unit.

Consider what can be wrong, and what currently catches it:

- The **world** is not as assumed → a pre-spec spike catches it, when `synthesis-modality` ships.
- The **implementation** does not match the design → the per-leaf task interlock catches it.
- The **assembled whole** does not satisfy intent → `verify-work-unit` catches it, terminally.
- The **design is internally wrong, or the parts do not compose** → _nothing catches it._

The third and fourth rows are not the same. Every input can validate and every leaf can be faithfully implemented,
and the assembled result can still be the wrong thing — and today that surfaces at verification, at code review,
or after integration, when re-steering is most expensive. Composition cannot be tested before there are parts to
compose, so no amount of planning rigor closes this row.

`generate-tasks` already gestures at the remedy without directing it. § Design phases and parent-task skeletons
carries _"Order phases to minimize dependencies and enable incremental delivery"_ and _"Each phase should produce
testable, verifiable progress"_ — but with no discriminator, no named alternative, and no exit criterion, so the
guidance is aspirational rather than decidable. The adjacent rule in the same procedure (_"group test and
implementation together by module or concern"_) is a **horizontal** instinct, and it is the one with mechanical
teeth. In practice the layered plan wins.

The evidence is on the record. `review-architecture` planned as 8 phases / ~111 leaf tasks and reached integration
at 307 files, with its design problems surfacing at review rather than during implementation. `decomposition-doctrine`
owns the _sizing_ half of that postmortem — whether it should have been several work units. This work unit owns the
orthogonal half: given the work unit it is, in what order should its plan land so that being wrong is discovered
early and cheaply.

## Proposed direction

**A task plan is an ordered sequence of segments; each segment carries a mode.** A segment is a contiguous run of
the plan (one phase or several) that closes on a stated kind of progress. The mode names which kind. A **vertical**
segment is a _slice_.

Modes attach to segments rather than to work units, so a plan that builds substrate and then slices over it is
expressible directly instead of being forced into a whole-work-unit label. Mixed plans are the expected case.

**The discriminator: where does residual risk sit once planning closes?**

| Residual risk lies in                                           | Mode                     | The segment closes on                              |
| --------------------------------------------------------------- | ------------------------ | -------------------------------------------------- |
| **Composition** — do the parts assemble into intended behavior? | **vertical** (slice)     | a thin end-to-end capability that can be exercised |
| **Substrate contract** — is the shared thing underneath right?  | **horizontal**           | a complete, settled layer                          |
| **Mechanics at scale** — does this transformation work N times? | **pilot-then-replicate** | one proven instance, then repetition               |

The axis is deliberately _not_ design determinacy. A fully determinate design can carry high mechanical risk (a
settled migration applied across a large surface), and determinacy would push that case toward horizontal ordering
when pilot-then-replicate is plainly correct. Residual-risk locus resolves all three without special-casing.

Grounding, with its limits stated:

- `review-architecture` — the one case with a real task plan whose ordering can be read. Residual risk was
  composition; its problems were discovered at review. → **vertical**, matching its own postmortem.
- A two-mirror documentation verb-rename sweep — a constructed case, not a specific work unit. The design is
  trivial, the mechanics are the risk. → **pilot-then-replicate**.
- `chunked-delivery` — its residual risk is the substrate contract (`DeliveryPlan` and its identity model), but it
  carries `Task List: [none]`, so this reads its _design_ sequencing rather than a task plan. Suggestive of
  **horizontal**, not a validation.

One real datum, and it is the case the model was derived from. Re-grounding against work units with real task
lists is owed before the mode set is treated as settled.

**Where the read happens.** `generate-tasks` § Resolve depth & Class already makes one scale-axis read that drives
two outputs. Segmentation asks a different question of the same evidence, so it becomes a third output of that one
read — no second entry read, no new recorded value, and the stage keeps re-deriving rather than inheriting (the
same reason planning depth is never carried forward).

**What actually changes:**

1. **Phase exit criteria** in `generate-tasks` § Design phases and parent-task skeletons — a segment's mode states
   what its boundary must close on. This is the core deliverable.
2. **The discriminator** — the residual-risk read and the three modes, placed per the open question above.
3. **Test-first grouping becomes mode-sensitive.** Today's _"group test and implementation together by module or
   concern"_ is correct within a horizontal segment and fights a vertical one, where the natural grouping is by
   behavior path. The rule needs the mode as an input rather than a blanket instruction.
4. **Vocabulary** — `segment`, `slice`, and their explicit boundaries against `spike` (planning-time, throwaway,
   de-risks inputs), `chunk` (review unit), and `deliverable` (chunk with a merge boundary).

**Cost honesty.** Vertical segmentation is not free and the doctrine must price it, or it will read as a
free win and be over-applied. A slice front-loads integration work, and it usually requires scaffolding for the
layers it does not yet fully build — which then needs a disposition rule of its own, currently unowned (see
§ Grooming status → Open). Naming the modes side by side is partly there to make the _cost_ of choosing vertical
visible next to the alternatives.

## Alternatives

- **Bias `generate-tasks` toward vertical phases outright.** Rejected. The corpus already carries an undirected
  version of this ("enable incremental delivery") and it demonstrably does not fire. A bias without a
  discriminator is either ignored or misapplied, and substrate-first work is genuinely better horizontal.
- **Key the discriminator on design determinacy.** Rejected — mis-advises determinate-but-mechanically-unproven
  work, which is exactly where a pilot is cheapest and most valuable. Residual-risk locus supersedes it.
- **Name the concept "tracer bullets."** Rejected as a headline term. `synthesis-modality` had used
  "tracer-bullet syndrome" as the name of a _pathology_ (spike code calcifying into production), inverting the
  source meaning — tracer code is explicitly lean-but-complete and kept, which is what distinguishes it from a
  prototype. Adopting the term positively would have left ARC carrying it with opposite valence in two surfaces.
  That naming is now **spike calcification**; the term stays available as descriptive prose but is not this work
  unit's anchor vocabulary.
- **Call slice work "impl spikes."** Rejected on attestation grounds — a spike runs before a design exists and
  cannot falsify a spec, while a slice runs against a settled one and can, so the two should not share a term.
  The boundary is deliberately _not_ "slice code is kept while spike code is thrown away": slice scaffolding is
  slice-side code that is not kept, which is why its disposition is an open item rather than a settled
  consequence of the vocabulary split.
- **Have pre-spec spikes build reusable scaffolding that implementation inherits.** Rejected, and it is the
  inverse of an efficiency: a spike built for reuse has already stopped being throwaway, which is the precise
  drift `synthesis-modality`'s disposition lifecycle exists to prevent. The real relationship between the two
  work units is informational — spike _findings_ tell task generation where composition risk lives.
- **Own the work-unit-level vertical/horizontal read too.** Rejected as scope. `decomposition-doctrine` owns
  concern → work-unit cuts and `chunked-delivery` owns chunk → `main` landability; that boundary is settled
  between them. This work unit contributes the axis as input and claims neither record.

## Coordination

- **`chunked-delivery`** (in flight) — the primary seam, and a favourable one. Its § Proposed direction now names
  four orthogonal levels and states that _"Phase = the task-plan grouping … not itself a review or delivery
  unit"_, so the task-plan layer is unclaimed. Because `DeliveryPlan` members partition implementation leaves in
  task-inventory order, segmentation determines which contiguous ranges can be promoted to chunks — segmentation
  is an _input_ to delivery authoring, not a competing annotation. The refinement-invariant question is routed to
  it via `arc-inbox`; do not author an answer here.
- **`decomposition-doctrine`** (in flight) — owns the concern → work-unit decomposition test, including
  stack-vs-coupling. The residual-risk axis is offered as input to that test, explicitly claiming no authority.
  Routed via `arc-inbox`.
- **`synthesis-modality`** — adjacent on one risk timeline. Its spikes de-risk inputs before a design exists;
  this de-risks composition after one does. Its "tracer-bullet syndrome" naming is corrected on this branch, and
  a cross-reference recording the boundary lands in both drafts. No dependency edge.
- **`unit-scoped-review`** — orthogonal but mutually informative, not two ends of one read. Its eligibility
  predicate keys on determinacy (derivation-`Class`, spec determinacy, task-list shape, context budget), none of
  which detects composition risk: `review-architecture` had a settled spec and no spike tasks, so it reads
  batch-eligible on that predicate while being the canonical composition-risk case here. Segmentation is
  therefore not evidence against batch eligibility. What it offers a batch reviewer is _where to look_ — a
  vertical segment's boundary is a natural site for a deviation-ledger checkpoint. `chunked-delivery` already
  records the two as orthogonal boundaries.
- **`review-chunking`** (shipped) — owns the `chunk` vocabulary this must not re-author or collide with.
- **`composable-workflows` / `strategy-procedure-evolution`** — if the mode becomes a parameter of the
  task-generation procedure rather than prose, it wants to compose with that work's parameterization model rather
  than minting a private one.
- **`planning-iteration-mechanics`** — owns the planning-closeout gate shape; if segmentation produces a recorded
  verdict, that checklist may be its natural home rather than a freestanding rule.

## Unknowns and Assumptions

- **Does segmentation need an artifact at all?** The largest open scope question — see § Grooming status. An
  unrecorded read cannot be audited or consumed downstream; a recorded one adds surface.
- **Whether the modes survive contact.** The taxonomy rests on one corpus case with a real task plan; the other
  two checks were a constructed example and a category slip (design sequencing read as task-plan ordering). It is
  also untested against work units where residual risk is genuinely split within one segment. Re-ground it
  against work units that have real task lists before treating the mode set as settled.
- **Interaction with `Class`.** A `Light` work unit plausibly needs no segmentation read at all. Whether the read
  is `Class`-scaled (like the adversarial fire-points) or universal-but-cheap is unsettled.
- **Whether "phase" survives as the substrate.** Segments are defined over phases here. If `chunked-delivery`'s
  four-level model displaces phase as a structural unit, segmentation would need re-anchoring.
- **Assumption:** the cost of authoring a vertical plan is lower than the expected cost of late discovery on the
  work units where the discriminator says vertical. Unvalidated, and hard to validate other than by use.

## Scope Estimate

**Small–Medium at the floor, and not yet bounded above.** The floor is one workflow procedure edit
(`generate-tasks` phase design and exit criteria), one doctrine placement (method or strategy section), one
`test-first` refinement, and vocabulary — package-synced across both copies, rules text rather than machinery.
The surfacing and exit-criterion-reader questions govern the ceiling: resolving either toward a recorded surface
that a gate reads and delivery authoring consumes adds an artifact, an authoring step, and a consumer contract.
Re-estimate once those two settle; treating the floor as the estimate is what the first pass got wrong.

Dependencies: none hard. Sequencing preference is _after_ `chunked-delivery` settles its plan record, so the
segment → chunk relationship can be authored against a stable contract rather than a moving one.
