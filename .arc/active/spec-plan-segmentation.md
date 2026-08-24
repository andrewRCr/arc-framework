# Spec (`detailed` · `RFC`): plan-segmentation

- **Origin:** [internal]

- **Purpose:** Give task planning a decidable way to order a work unit's plan so implementation yields exercisable
  end-to-end capability as it lands, and a discriminator for when that ordering is the wrong choice — closing the
  feedback gap between spec-time design settlement and terminal verification.

---

## Introduction / Context

ARC is spec-directed: design is settled up front and implementation realizes it. That holds, and this design does
not weaken it. It leaves one class of error uncaught for the entire length of a work unit.

Four things can be wrong, and three of them already have a catcher. The **world** not matching assumptions is caught
by a pre-spec spike. The **implementation** not matching the design is caught by the per-leaf task interlock. The
**assembled whole** not satisfying intent is caught by work-unit verification, terminally. But a **design that is
internally wrong, or whose parts do not compose**, is caught by nothing. Every input can validate and every leaf can
be faithfully implemented, and the assembled result can still be the wrong thing — surfacing at verification, at
review, or after integration, when re-steering costs the most. Composition cannot be tested before there are parts to
compose, so no amount of planning rigor closes it.

Task generation already gestures at the remedy without directing it. Its phase-design guidance carries _"Order phases
to minimize dependencies and enable incremental delivery"_ and _"Each phase should produce testable, verifiable
progress"_ — but with no discriminator, no named alternative, and no exit criterion, so the guidance is aspirational
rather than decidable. The adjacent rule in the same procedure, _"group test and implementation together by module or
concern"_, is a horizontal instinct with mechanical teeth. In practice the layered plan wins.

The failure is on the record at pattern level, not as an isolated case. `review-architecture` planned as 8 phases and
~111 leaf tasks, reached integration at 307 files, and surfaced its design problems at review. The same shape —
solid spec, verification finding implementation gaps sourced to task-list coverage — recurred across the recent
execution era. Its sharpest instance decomposed a phase horizontally across refresh planning, suffix proof, top
absorption, native routing, recovery, handlers, and workflow prose: every primitive and local contract tested green,
yet no task owned the complete external-refresh adoption or the typed native-fallback transition, and those gaps
survived repeated adversarial passes. Two shapes recur — **unwired production callers** (modules built but
unreachable) and **surface-level statement without the next-layer-deep realization** a detailed spec normally
supplies.

This work unit is therefore evidence-motivated rather than capability-motivated. `decomposition-doctrine` owns the
sizing half of that postmortem — whether the work should have been several work units. This design owns the
orthogonal half: given the work unit it is, in what order should its plan land so that being wrong is discovered
early and cheaply.

## Goals

- A plan boundary can close on **demonstrable end-to-end capability** rather than a completed layer, and states which
  it closes on.
- The choice between vertical and layered ordering is **decidable from stated evidence**, not left to instinct — and
  the doctrine reads as a genuine three-way choice, never a bias toward vertical.
- A composition-risk plan's coverage of the spec's mandatory lifecycle behavior is **checkable at authoring time**,
  so a plan that builds modules without wiring their production callsites is rejected before execution starts.
- The exit criterion is **read by the task-list machinery that already exists** — the interlock that gates a closing
  task, the checklist that gates a plan — not carried as prose beside prose.
- The task-generation procedure's live rules stop **contradicting** the doctrine — specifically test grouping.
- The typed delivery model **expresses** the verification family the doctrine mints, rather than admitting it by
  accident.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **The concern → work-unit cut.** `decomposition-doctrine` owns whether a concern should be several work units; the
  residual-risk axis is offered to it as input, claiming no authority over that test.
- **The chunk → base landability boundary.** `chunked-delivery` and `delivery-native-stack-composition` own review
  and merge topology. This design contributes segment boundaries as an input to delivery authoring.
- **The segment ↔ chunk refinement invariant.** Whether chunk boundaries must refine segment boundaries touches the
  delivery record and is that work unit's call, not this one's.
- **A typed segmentation record.** No new artifact, schema, plan record, or persisted segment identity. Segments are
  recorded in task-list prose and identified by the phases they span.
- **A CLI checker for lifecycle-row coverage.** The coverage obligation is a Finalize checklist entry evaluated by
  the authoring session. A mechanical checker is premature without a typed plan record and is the first place the
  ergonomics constraint would bite.
- **Growth of the delivery-model migration beyond task-role classification.** The migration in D6 replaces a
  singular verification field with a scope-typed one. It does not add segment identity to the delivery schema, make
  delivery plans segment-aware, introduce a coverage checker, or alter member partitioning semantics.
- **Enforcing earliness mechanically.** Ordering to retire dominant residual risk earliest is the discriminator's
  stated doctrine and an eval concern; the Finalize gate checks coverage and criteria, never earliness.
- **The `docs/` task-list reference.** Single-copy and frozen pending its own overhaul.

## Proposed Design

### D1 — Segment as the unit; mode attaches to the segment

A task plan is an **ordered sequence of segments**. A segment is a contiguous run of the plan — one phase or several
— that closes on one stated kind of progress. A **mode** names which kind.

Modes attach to segments, never to work units. A plan that builds substrate and then slices over it is expressible
directly instead of being forced into a whole-work-unit label, so **mixed plans are the general case and single-mode
plans the degenerate one**. The doctrine therefore never reads as binary.

Segments carry **no identifiers**. Phases identify them: a multi-phase segment declares its span in its opening
phase, the criterion lands on its closing phase, and a stub's retiring owner names a phase. This adds zero
enumeration beside the phases, task numbers, and delivery members a task list already carries.

### D2 — The discriminator: locus of residual risk after planning closes

| Residual risk lies in                                           | Mode              | The segment closes on                              |
| --------------------------------------------------------------- | ----------------- | -------------------------------------------------- |
| **Composition** — do the parts assemble into intended behavior? | **`slice`**       | a thin end-to-end capability that can be exercised |
| **Substrate contract** — is the shared thing underneath right?  | **`layer`**       | a complete, settled layer                          |
| **Mechanics at scale** — does this transformation work N times? | **`replication`** | the enumerated surface exhausted, batch-verified   |

Modes are named by **what the boundary closes on**. `vertical` and `horizontal` remain descriptive adjectives in
prose — a `slice` segment is the vertical mode — and are not the recorded vocabulary. Stack-adjacent names are
excluded: three distinct "stack" senses already live in the corpus.

**`pilot-then-replicate` is a composition, not a fourth mode.** The mechanics-at-scale row is answered by a thin
pilot segment — mode `slice`, closing on one proven instance, where the slice definition still holds and only the
risk being retired differs — followed by a `replication` segment. Risk loci and modes both number three but are not
forced 1:1. This preserves one-boundary-one-criterion rather than admitting a mode with an interior checkpoint.

**The axis is deliberately not design determinacy.** A fully determinate design can carry high mechanical risk — a
settled migration applied across a large surface — and determinacy would push exactly that case toward layered
ordering when a pilot is plainly correct. Residual-risk locus resolves all three loci without special-casing.

### D3 — `resolve-plan-segmentation`, a method fired at the existing entry read

The discriminator lands as a **method fired from the task-generation workflow**, sibling to `resolve-planning-depth`
and `classify-work-unit` at that stage's existing scale-axis read. That read already drives two outputs; segmentation
asks a different question of the same evidence, making it a **third output of one read**. No second entry read is
introduced, and the stage keeps re-deriving rather than inheriting — the same feed-forward immunity that governs
planning depth.

Its trigger is anchored to the **operation** (authoring phase structure and exit criteria) rather than to the
workflow, so no new always-loaded surface appears.

**The read is universal, not `Class`-scaled.** As a third output of an existing read, a `Class` gate would save
nothing, and a `Light` work unit's read degenerately returns one segment with an evident mode.

**Ordering doctrine, carried by the method:** order segments to retire the dominant residual risk earliest — the
first `slice` lands as early as the substrate allows. D9's Finalize gate does not enforce this; it is doctrine plus
eval coverage.

### D4 — The recorded surface: two phase-preamble lines

Segmentation is recorded on the task-list surface the stage already authors, never carried as stage state.

- The segment's **opening phase** carries `_Mode:_`, with its span when the segment is multi-phase.
- The segment's **closing phase** carries `_Exit criterion:_`.
- A single-phase segment carries both.
- `_Mode:_` carries a standard gloss — its closes-on kind from D2's table. `_Exit criterion:_` carries the specific
  criterion.

Both are preamble prose inside the existing task-list grammar, joining the required `_Purpose:_` and optional
`_Design decisions:_` lines. `_Purpose:_` remains mandatory beside them.

### D5 — The verification family and its marker

Verification is already distributed across two boundaries; segmentation adds a third and names the set. The family
marker is `Verification: {boundary} — {detail}`. Only the **segment** row is new here — the other two exist and are
brought under one marker so the family reads as one thing:

| Boundary      | Form                                        | Fired by                                         |
| ------------- | ------------------------------------------- | ------------------------------------------------ |
| **segment**   | `Verification: exit criterion — {scenario}` | an ordinary closing task, gated by the interlock |
| **member**    | delivery-member close-out                   | `validate-criteria` at member scope              |
| **work unit** | `Verification: work unit — {detail}`        | the terminal verification workflow               |

A segment's exit criterion is proven at **execution time** by an ordinary closing task titled with the segment form,
lexically bound to the phase's `_Exit criterion:_` label. The existing task interlock gates it with no new machinery.

**`slice` and `replication` segments close with a `Verification:` task; `layer` segments do not** — a `layer`
criterion closes on settledness its own test tasks already prove, so a separate scenario task would be ceremony.

The **terminal verification phase is the family's work-unit-boundary member.** It carries no mode and no criterion of
its own, and on a degenerate single-segment plan its work-unit-form task subsumes a separate segment verify. Its
task title is retitled into the family here; its **phase heading is not touched** (D12).

**Exit criteria do not project into Success Criteria rows.** Success Criteria are already partitioned by delivery
member, bound by exact heading-path locus; a second partition over the same section would compete with it, or would
presume the refinement invariant this design explicitly does not own. Exit criteria rest on closing-task evidence —
precisely what member-scope criteria validation consumes. What _does_ project into Success Criteria is the lifecycle
coverage of D7, which is outcome-level and belongs there.

Where a member boundary coincides with a segment boundary, the **exit-criterion verify runs first and the member
close-out consumes its evidence.**

### D6 — Typed verification-family classification in the delivery model

The delivery task inventory models verification as **singular and terminal**: one `verificationTaskId`, excluded
from the implementation partition, blocked from member assignment. That model predates the family. Under D5 a plan
carries several verification tasks at distinct scopes, and today the non-terminal ones are silently classified as
`implementation` — nothing refuses, nothing misroutes, but the model misdescribes the artifact. The neighbouring
delivery work unit encountered this first: its member close-out is verification work typed as implementation, and it
recorded that constraint as forced rather than chosen, explicitly leaving the terminal contract untouched.

**Why the model lands here.** The redesign was offered to that work unit and declined, on two grounds that hold: a
scope-typed model is a new model rather than a repair, and taking one at its verification boundary would invalidate
verification evidence it has already produced; and it can see only one of the two scopes the taxonomy must serve.
That second ground is what settles the owner. Member scope exists only where a delivery plan does; **segment scope
exists on task lists carrying no delivery plan at all**, so a taxonomy derived from the delivery side alone would
bake in a delivery-plan assumption that segment scope then has to fight. This spec is the first place both scopes
are visible, so the taxonomy is designed once, here — and segment verification tasks are correctly typed from the
moment they exist rather than landing mistyped and being retyped later.

Replace the singular field with **scope-typed task-role classification**:

- A parent task is `implementation` or `verification`; a `verification` task carries a scope of `segment`,
  `member`, or `work-unit`.
- **Exactly one `work-unit`-scope verification task**, terminal, unassigned to any member — the existing guarantee,
  preserved under the new vocabulary. The refusal reason becomes scope-aware rather than count-only.
- `segment`- and `member`-scope verification tasks are **member-assignable** and participate in the contiguous
  exactly-once partition, as they already do in practice.
- Refusal vocabulary and coverage rules read the role rather than the position.

Surfaces the field threads through: `task-inventory.ts`, `coverage.ts`, `schema.ts`, `authoring-schema.ts`,
`plan.ts`, `compose.ts`, `from-tasks.ts`, `from-branch.ts`, and the delivery command handler. The canonical plan
digest changes shape; the pre-public-release posture governs — regenerate development state rather than adding a
migration reader.

This element is **hard-sequenced behind the neighbouring delivery work unit's merge** (Cross-cutting).

### D7 — Lifecycle-row coverage for composition-risk plans

The vertical exit criterion has concrete content, not merely a form. On a **composition-risk plan** — one carrying
at least one `slice` segment — inventory each **mandatory lifecycle row the spec states**, and assign every row to
one `slice` segment or parent task that **wires its production callsite** and **proves it with an executable
scenario**.

The rows derive from the spec's own lifecycle statements. The motivating case's inventory — initial durable state
through caller and fresh authority, mutation boundary, reservation and crash-retry behavior, typed next action — is
a **worked exemplar, not a normative taxonomy**; a documentation or interface work unit derives different rows.

A primitive, schema arm, or workflow paragraph **cannot close the obligation by itself**. Exit criteria cover every
mandatory spec lifecycle, not merely representative outcomes.

**Division of labor:** draft and spec authoring name the invariants, capabilities, and transitions; task generation
owns turning them into vertically closed implementation-and-verification slices.

**Lifecycle rows project into Success Criteria.** Unlike a segment's exit criterion (D5), a lifecycle row is an
outcome-level claim about the work unit, so it belongs in the Success Criteria section where the verify-time walk
binds it by heading-path locus. This is what gives the composed reader its verify-time leg: the criterion the walk
binds is the lifecycle row, and the `Verification:` task's executed scenario is the source-grounded evidence its
report carries.

### D8 — Scaffolding disposition: the retiring-owner clause

A slice front-loads integration work and usually requires scaffolding for layers it does not yet fully build. Every
**stub a slice creates names its retiring phase** — the phase whose exit criterion includes replacing or removing it
— recorded as a detail bullet on the stub. A plan is not Finalize-complete while a stub names no retiring phase.

This is parallel in shape to the spike-disposition contract owned elsewhere (a default plus an explicit contract to
deviate), and deliberately not coupled to it: spike code is throwaway unless stabilized; slice scaffolding is kept
until its named retiring segment.

### D9 — Finalize obligations, per-segment and mode-scoped

The task-generation Finalize checklist gains these entries. Each is a cheap scan; the family marker is greppable by
design.

1. Every phase belongs to a declared segment.
2. Each segment's opening phase carries `_Mode:_` (with span when multi-phase); its closing phase carries
   `_Exit criterion:_`; a single-phase segment carries both.
3. Every `slice` or `replication` segment closes with a `Verification:` task. `layer` segments are exempt.
4. On a composition-risk plan, every mandatory lifecycle row is assigned to a `slice` per D7.
5. Every stub names a retiring phase.
6. The terminal verification phase carries no mode and no exit criterion.

### D10 — Mode-sensitive test grouping

The live rule _"group test and implementation together by module or concern"_ is correct within a `layer` segment
and fights a `slice`, where the natural grouping is by behavior path. **The rule takes the mode as an input** rather
than standing as a blanket instruction.

A coupled refinement: **batching as the fail-first-preserving form.** One minimal implementation often satisfies
several coupled behavior tests, making later red steps unreachable; where behaviors share one indivisible
implementation, batching can be the sequence in which every test genuinely fails first.

**Split by fire-point, cross-referenced and never restated:**

- **Planning-time half** — mode-sensitive grouping and cycle-boundary declaration — lands in the task-generation
  workflow **and** in the test-first method, whose own copy of the grouping rule takes the same mode input so the
  two cannot diverge.
- **Execution-time half** — the manufactured-red rule widened to incidentally satisfied behaviors, plus
  reconstruct-and-revert evidence at completion — lands in the testing-standards method, the declared
  execution-time owner of the fail-first invariants.

### D11 — Vocabulary

`segment`, `slice`, `layer`, and `replication` are new load-bearing terms and earn brief-vocabulary definitions
before use, as `chunk` and `deliverable` did. Each definition states its boundary against the adjacent terms:

- **`spike`** — planning-time, throwaway, de-risks _inputs_. Runs before a design exists and therefore cannot
  falsify a spec. A slice runs against a settled design and can.
- **`chunk`** — a review boundary.
- **`deliverable`** — a chunk with an independent merge boundary.

### D12 — Compatibility contract with the shipped parsers

Verified against the parsers rather than assumed. These are constraints the design preserves, not aspirations:

- **The terminal phase title is exactly `Verification`.** The delivery task inventory refuses otherwise. D5's
  retitle changes the terminal **task** title only. Nothing in code matches that task's title; it appears only in
  the formatting strategy and the task-list template, both package-mirrored.
- **Exactly one parent task follows the terminal phase heading.** A segment `Verification:` task must never land in
  the terminal phase.
- **Preamble labels stay in the preamble.** The root peer-descriptor label set is closed in code
  (`Goal`, `Context`, `Rationale`, `Approach`, `Shape`, `Note`). `_Mode:_` and `_Exit criterion:_` are preamble
  labels, which the descriptor scanner never reaches, so no code change is required — and they cannot migrate to
  root-descriptor position without one.
- **Every implementation parent carries exactly one non-empty `_Goal:_`**, segment `Verification:` tasks included.
- Phase headings, parent-task headings, and subtask bullets are untouched. `_Mode:_`, `_Exit criterion:_`, and a
  stub's `_Retired by:_` bullet scan as inert content; the cursor, tallies, and compaction seed all derive from the
  same structural scanner and gain no new exposure.

### D13 — Ship surface

Each edit lands in the package source and the project copy together:

- the task-generation workflow — phase design and exit criteria, the ordering line rewritten to take the mode read
  as input, the Finalize checklist entries, and the test-grouping rule;
- `resolve-plan-segmentation` as a new method, plus its `init-recipe.json` `include_files` entry — without it the
  method ships nowhere — and the methods README dependency row;
- the test-first and testing-standards methods, per D10's split;
- the task-list formatting strategy — phase preamble admitting `_Mode:_` and `_Exit criterion:_`, the verification
  phase's task title, and the stub `_Retired by:_` bullet;
- the task-list template — the same preamble and terminal-task shapes;
- the brief vocabulary — D11's terms;
- the delivery model surfaces enumerated in D6.

## Alternatives & Rationale

- **Bias task generation toward vertical phases outright.** Rejected. The corpus already carries an undirected
  version of this and it demonstrably does not fire. A bias without a discriminator is either ignored or misapplied,
  and substrate-first work is genuinely better layered.
- **Key the discriminator on design determinacy.** Rejected. It mis-advises determinate-but-mechanically-unproven
  work, which is exactly where a pilot is cheapest and most valuable. Residual-risk locus supersedes it.
- **Name the concept "tracer bullets."** Rejected as the headline term. The corpus already used
  "tracer-bullet syndrome" as the name of a _pathology_ — spike code calcifying into production — inverting the
  source meaning, since tracer code is explicitly lean-but-complete and kept. Adopting it positively would leave the
  term carrying opposite valence in two surfaces. That naming is corrected to **spike calcification**; the term
  stays available as descriptive prose but anchors nothing here.
- **Call slice work "impl spikes."** Rejected on attestation grounds. A spike runs before a design exists and cannot
  falsify a spec; a slice runs against a settled one and can. The boundary is deliberately _not_ "slice code is kept
  while spike code is thrown away" — slice scaffolding is slice-side code that is not kept, and its disposition is
  D8, settled separately from the vocabulary split.
- **Have pre-spec spikes build reusable scaffolding that implementation inherits.** Rejected, and it inverts the
  efficiency: a spike built for reuse has already stopped being throwaway, which is the precise drift the spike
  disposition lifecycle exists to prevent. The real relationship is informational — spike _findings_ tell task
  generation where composition risk lives.
- **Keep `pilot-then-replicate` a primitive mode with a staged criterion.** Rejected. It would be the only mode with
  an interior checkpoint, breaking the one-boundary-one-criterion shape the criterion-as-task reader depends on.
- **Collapse `replication` into `layer`.** Rejected. A `layer` segment closes on a settled layer; a `replication`
  segment closes on an exhausted enumeration. Conflating them re-blurs the exact boundary an exit criterion exists
  to state.
- **Own the work-unit-level vertical/horizontal read too.** Rejected as scope; that boundary is already settled
  between the decomposition and delivery work units.
- **Project every exit criterion into a Success Criteria row** (D5). Rejected. It would give the verify-time walk a
  locus to bind, but Success Criteria are already member-partitioned by exact heading path, so it costs either a
  second competing partition or a presumption that segments refine members — the refinement invariant this design
  does not own. Lifecycle-row projection (D7) delivers the verify-time visibility that actually matters.
- **Leave the delivery model's singular verification field alone** (D6). Rejected on the scope owner's call. It is
  defensible — nothing is functionally broken, and the mismatch is inert — but it would leave the doctrine's
  verification family admitted by accident rather than expressed, with non-terminal verification tasks typed as
  implementation.

**External prior art, with its limits stated.** Walking skeleton, tracer bullet, and steel thread are one idiom
under three names — thin, real, kept, end-to-end first — targeting exactly this composition risk; walking skeleton
is the anchor citation, "steel thread" having contested notability. The acceptance-test-per-slice discipline (an
executable end-to-end test reads each increment's done-ness, not structural assertions) is the strongest sourced
form of the executable exit criterion. SPIDR's published discriminator and the recognized substrate and migration
idioms — enabler work, layer-first, canary, expand–contract — externally validate the three-mode taxonomy,
`pilot-then-replicate` included. For `replication`: large-scale-change discipline is the institutional precedent for
prove-once-then-mass-apply, and Parallel Change the staged-composition one, but **no surveyed source names the
segment-level mode or its completion criterion** — `replication` and "enumerated surface exhausted, batch-verified"
are coined into a real terminological gap, as is slice-scaffolding disposition. Rule of Three and
Spike-and-Stabilize are commonly mis-cited analogues of the wrong shape and are not prior art here.

**Grounding limits.** `review-architecture` is the one corpus case with a real task plan whose ordering can be read,
and it classifies as `slice`, matching its own postmortem. The recurrence evidence pays the re-grounding debt at
**pattern level**. What remains thin is **mode-classification practice**: no second corpus task plan has been
classified against the three modes, only the failure they answer.

## Cross-cutting Considerations

**Sequencing and dependency.** D6 edits the delivery model, which the neighbouring delivery work unit is actively
rewriting — 35 files and roughly 4,600 added lines under that directory, unlanded. That work unit's merge is a
**hard dependency** for D6's implementation and is recorded as a `Depends On` edge. The doctrine elements (D1–D5,
D7–D11) touch planning surfaces it does not, and are unblocked once the conventions it edits are stable.

**Delivery-plan candidate.** This work unit stays one concern with two independently reviewable surfaces carrying
different dependency profiles. D6's typed model is the substrate: its residual risk is the **substrate contract** —
is the role/scope taxonomy right — and it closes on a settled, tested model, gated on the delivery work unit's
merge. The doctrine (D1–D5, D7–D11) rides on top: its residual risk is **composition** — does a segmented plan
actually author, and does the gate reject an incomplete one — and it closes on exercisable end-to-end capability.
By this spec's own discriminator that is `layer` → `slice`, which is also the delivery order, since typing the
model first means segment verification tasks are never mistyped in the interim. Recorded as a candidate and
resolved at task generation; nothing is published or bound here.

The redesign is **not** split into its own work unit. It is the typed expression of a concept D5 mints rather than
an orthogonal concern, and once this spec settles the taxonomy a separate unit would carry no derivation of its own
— an execution-only unit whose design lives elsewhere, which is a phase of a sibling rather than a peer.

**Ergonomics constraint.** Every mechanization — reader sites, checklist entries, the D6 classification — keeps
routine-session ergonomics first-class, primarily the agent's: surfaces present themselves at point of use, never
require code-diving or schema archaeology to discover how to proceed, and never tax task-generation wall clock.
Mechanization earns its place by _improving_ routine operations.

**Cost honesty.** Vertical segmentation is not free and the doctrine must price it, or it reads as a free win and
gets over-applied. A slice front-loads integration work and usually requires scaffolding (D8). Naming the three
modes side by side exists partly to make the cost of choosing vertical visible next to its alternatives.

**Testing.** D6 is typed-model work with existing unit coverage over the inventory, coverage, and plan modules;
its migration is verified there. The doctrine elements are judgment prose in a workflow, and edits to
task-generation judgment prose want **eval coverage** — carried as a line item, owned by the eval-harness work unit.

**Audience boundary.** Every edited surface except the delivery model is adopter-facing and ships. Prose states what
is, carries no transitional framing, and forward-points at no internal roadmap item.

**Migration and rollout.** No adopter-visible migration: existing task lists remain valid, since a plan with no
`_Mode:_` lines is a degenerate single-segment plan and the Finalize entries apply to newly authored plans. D6's
plan-digest shape change affects development-only persisted state, regenerated rather than migrated.

## Success Criteria

- `resolve-plan-segmentation` exists as a method, fires from the task-generation workflow's existing entry read,
  and carries the three modes, the residual-risk discriminator, and the ordering doctrine.
- The task-generation workflow's ordering line takes the mode read as input, and its Finalize checklist carries all
  six D9 entries.
- A composition-risk plan authored after this ships carries `_Mode:_` and `_Exit criterion:_` preamble lines, has
  every mandatory lifecycle row assigned to a `slice`, and closes each `slice` and `replication` segment with a
  `Verification:` task.
- The Finalize checklist rejects a plan that is missing a mode, a criterion, a required `Verification:` task, a
  lifecycle-row assignment, or a stub's retiring phase.
- `layer` segments carry an exit criterion and no `Verification:` task; the terminal verification phase carries
  neither mode nor criterion.
- On a composition-risk plan, each mandatory lifecycle row appears as a Success Criteria entry the verify-time walk
  can bind by locus, while segment exit criteria appear only as phase preamble and closing-task evidence.
- The delivery task inventory classifies parent tasks by role and scope, preserves exactly one `work-unit`-scope
  verification task unassigned to any member, and admits `segment`- and `member`-scope verification tasks into
  member partitions.
- A task list carrying the full segmented shape parses unchanged through the structural scanner, the task cursor,
  the tallies, the compaction seed, and the delivery task inventory.
- The test-grouping rule takes the mode as input in both the task-generation workflow and the test-first method;
  the widened manufactured-red rule and reconstruct-and-revert evidence land in testing-standards; neither restates
  the other.
- `segment`, `slice`, `layer`, and `replication` carry brief-vocabulary definitions stating their boundaries
  against `spike`, `chunk`, and `deliverable`.
- Every edited framework surface is present and identical in the package source and the project copy, and the new
  method carries an `init-recipe.json` disposition.
- All quality gates pass (tests, linting, type checking).
- Ready for integration.

## Open Questions

- **Whether the three modes survive contact.** Pattern-level recurrence evidence and external prior art both back
  the taxonomy, but no second corpus task plan has been classified against it, and work units whose residual risk is
  genuinely split within one segment are untested. Resolved by use, not before starting.
- **Whether "phase" survives as the segment substrate.** Segments are defined over phases. If a future structural
  model displaces phase as the unit, segmentation needs re-anchoring. No such change is in flight.
- **Where the member close-out and the exit-criterion verify sit relative to each other** — adjacent tasks or
  subtasks of one parent. The ordering is settled (verify first, close-out consumes its evidence); only the
  task-shape composition is open, and it resolves against the delivery conventions once they land.

---
