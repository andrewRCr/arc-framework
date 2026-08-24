# Draft: plan-segmentation — order the task plan for early end-to-end feedback

- **Origin:** [internal] — minted 2026-07-28 from a session-init design discussion on whether ARC's planning
  stages should support a vertical-slicing / tracer-bullet posture, and where such a posture would live.
- **Purpose:** Close the feedback gap between "the design was settled at spec time" and "the assembled work was
  validated at verification": give `generate-tasks` a principled way to shape the task plan so implementation
  yields exercisable end-to-end capability _as it lands_, and a discriminator for when that shaping is the wrong
  choice.
- **Success signal:** a composition-risk work unit planned after this ships carries `_Mode:_` /
  `_Exit criterion:_` phase preambles, every mandatory lifecycle row assigned to a `slice` and proven by a
  `Verification:` task — and `generate-tasks`' Finalize checklist rejects a plan missing any of it.

---

## Grooming status (continuity)

> _Updated each `--plan plan-segmentation` pass — see `draft-design` § Re-synthesize. This is the resume anchor._

- **Readiness:** `maturing` — the discriminating axis, the neighbouring-WU boundaries, the exit-criterion
  reader, and the surfacing question are settled; the 2026-08-24 inbound buffer (lifecycle-coverage capture,
  regrounding evidence, test-first batching) is folded into the body below. Scope is now bounded: recorded but
  task-list-native, no new typed artifact (second-pass Resolved below), the mode taxonomy and names are settled
  (`slice` / `layer` / `replication`, with `pilot-then-replicate` as a named composition), and scaffolding
  disposition is owned as the retiring-owner clause; placement (method fired from `generate-tasks`) and the
  test-first fire-point split are confirmed. The worked prototype is produced and reviewed, and the
  consolidation pass ran 2026-08-24 (body sections are authoritative; the Resolved blocks below are the compact
  decision ledger). No in-WU design decision remains open — `Class` settled at the third pass, and adversarial
  pass 2's three majors and four minors are folded (pass cap reached). The segment ↔ chunk refinement invariant
  waits on `delivery-native-stack-composition`; parser compatibility is verified at spec time.
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
      § Proposed direction). The axis itself held up under attack. Whether all three loci are _segment modes_
      was open here until the second pass settled it (two are; the third maps to a composition). Grounding is
      one corpus case with a real task plan (`review-architecture`) plus two constructed cases;
      `chunked-delivery` carries `Task List: [none]`, so classifying it read its design sequencing rather
      than a task plan, which is a different object.
    - **No new entry read at `generate-tasks`.** The stage already makes one scale-axis read driving two outputs
      (level + `Class`). Segmentation reads the same evidence for a different question: one read, three outputs.
      The feed-forward-immunity precedent holds — the stage re-derives rather than inherits. Settled for the
      _read_; the recording question settled at the second pass (recorded, task-list-native).
    - **Segmentation feeds delivery; it does not compete with it.** `chunked-delivery`'s `DeliveryPlan` requires
      every implementation leaf to occur in exactly one member _in task-inventory order_, with `members` as the
      only topology-order carrier. Chunk membership is therefore induced by task order, so segmenting the plan
      changes which contiguous ranges are available to promote. Task order carries the segment _boundaries_ but
      not the _mode_, and an unrecorded mode is readable by neither delivery authoring nor any later gate —
      which is why the second pass records the mode in the phase preamble.
    - **`spike` and `slice` are different attestations and must not share vocabulary.** A spike runs against a
      design that does not exist yet and therefore cannot falsify a spec; a slice runs against one that does. A
      spike de-risks _inputs_; a slice de-risks _composition_. Adjacent on one risk timeline, not coupled.
    - **Spike code must not be built for reuse by implementation.** `synthesis-modality`'s disposition contract
      (throwaway default, explicit stabilization contract to evolve) exists to prevent exactly that drift.
      Designing spike scaffolding for downstream reuse _is_ the calcification pathway, not an efficiency.
    - **`Class = Heavy`; draft depth = `medium`.** Derivation is real — a discriminator and a cross-work-unit
      contract seam must be authored — while the implementation surface is small. Composed from existing prior
      art rather than invented, so not `Novel`.
- **Resolved (2026-08-24, buffer integration):**
    - **The work unit is evidence-motivated, not capability-motivated.** The composition gap recurred at pattern
      level across the recent execution era (§ Problem / Motivation carries the evidence); the re-grounding debt
      the first pass recorded is paid at pattern level, with mode-classification practice still thin (§ Proposed
      direction → grounding).
    - **External prior art validates the frame.** Walking skeleton is the anchor citation (not "steel thread",
      whose notability is contested); GOOS's acceptance-test-per-slice discipline is the strongest sourced form
      of the executable exit criterion; SPIDR's discriminator and the recognized substrate/migration idioms
      validate the three-mode taxonomy, including `pilot-then-replicate` as a real, distinct rollout idiom.
      Slice-scaffolding disposition is a gap in the published literature — ARC would be authoring, not adapting.
    - **The vertical exit criterion has concrete content for composition-risk plans** — lifecycle-row inventory
      and per-segment assignment (§ Proposed direction → What actually changes, item 1). The core deliverable is
      no longer only a form ("state what the boundary closes on") but a coverage discipline.
- **Resolved (2026-08-24, second pass)** — compact ledger; the authoritative detail lives in the body sections
  each entry points at:
    - **Reader composed; task list is the recorded surface** — Finalize checklist + `Verification:` closing
      task + verify-time re-read; layer-frame per `strategy-procedure-evolution` (read = judgment, record =
      structure, reader = mechanical). § Proposed direction → The reader and the verification family.
    - **Surfacing: recorded, task-list-native** — the middle answer between artifact-less and typed record;
      no new typed artifact; typed promotion deferred (compose by reference). Same section.
    - **Coverage check is a checklist obligation, not a CLI checker.** § Proposed direction → Surface shape.
    - **Obligations:** parser compatibility (the `taskCursor` probe, compaction recovery, and session-init's
      partial read anchor on the phase-heading and checkbox grammar) verified against the actual parsers at
      spec time; the worked prototype is produced and reviewed. § Worked example.
    - **`pilot-then-replicate` is a composition; the third mode is `replication`** — `slice` pilot +
      `replication`, no fourth mode; name and criterion coined into a documented terminological gap (even
      Google's LSC leaves "done" case-per-change). § Proposed direction, discriminator table and grounding.
    - **Scaffolding disposition = the retiring-owner clause** — owned here; parallel in shape to
      `synthesis-modality`'s spike contract, no coupling. § Proposed direction item 1; § Coordination.
    - **Modes named by closing object: `slice` / `layer` / `replication`** — `vertical` / `horizontal` demoted
      to prose adjectives; no stack-adjacent names (three "stack" senses live in the corpus). Citations anchor
      on walking skeleton, never Rule of Three / Spike-and-Stabilize. § Proposed direction → grounding.
    - **Placement: a method fired from `generate-tasks`** — same entry read as `resolve-planning-depth` /
      `classify-work-unit`, operation-anchored trigger, no new always-loaded surface; per
      `strategy-knowledge-evolution` Principles 5 / 10 and `knowledge-architecture`'s fire-site verdict.
      § Proposed direction → Where the read happens.
    - **Test-first split by fire-point** — planning half to `generate-tasks` + `test-first`, execution half to
      `testing-standards` (corrected at adversarial pass 2); cross-reference, never restate. § Proposed
      direction item 3.
    - **Surface shape and the verification-family marker** — no segment IDs; `_Mode:_` + `_Exit criterion:_`
      preamble lines; family marker `Verification: {boundary} — {detail}` with the member form proposed via the
      routed fold, not authored here. § Proposed direction → The reader and the verification family / Surface
      shape.
- **Resolved (2026-08-24, third pass):**
    - **The read is universal, not `Class`-scaled.** A third output of an existing read costs nothing to make,
      so a `Class` gate saves nothing; a `Light` work unit's read degenerately returns one segment with an
      evident mode. § Proposed direction → Where the read happens.
- **Resolved (2026-08-24, adversarial pass 2 — three majors and four minors folded):**
    - **Finalize obligations are per-segment and mode-scoped.** Mode on the opening phase, criterion on the
      closing phase; `Verification:` tasks required for `slice` / `replication` only; lifecycle-row coverage
      conditioned on composition risk; the terminal Verification phase carries no mode and subsumes the segment
      verify on a single-segment plan. § The reader and the verification family.
    - **The ordering doctrine is stated and carried.** The discriminator method orders segments to retire the
      dominant residual risk earliest; deliverable 1 rewrites the workflow's ordering line; the gate
      deliberately does not enforce earliness. § What actually changes item 2.
    - **Execution-time test edits land in `testing-standards`** — the declared execution-time owner of the
      fail-first invariants; `test-first`'s copy of the grouping rule takes the mode input too. § item 3.
    - **Minors:** readiness-line staleness fixed; the `chunked-delivery` Coordination entry re-anchored on the
      cohort and the shipped `review-chunking` record; the lifecycle-row list marked a worked exemplar;
      `_Purpose:_` remains mandatory beside the new preamble lines (prototype corrected).
- **Open (developer calls):**
    - **Segment ↔ chunk refinement invariant.** Should chunk boundaries be required to _refine_ segment
      boundaries (every chunk within one segment, so no chunk straddles a slice seam)? That is the clean
      invariant and it is what lets segmentation feed delivery for free — but a chunk may legitimately want to
      span a substrate segment plus the first slice for contract cohesion. Routed to `chunked-delivery`; it
      touches that work unit's record, so the call is theirs — now effectively
      `delivery-native-stack-composition`'s (in verification); fold the answer when it lands. Extended
      2026-08-24: the same fold covers member ↔ segment boundary alignment and the exact composition of the
      member close-out with the segment's exit-criterion verify (adjacent vs subtasks of one parent).
- **Next:** adversarial pass 2 ran and its findings are folded (pass cap reached) — the post-settle coherence
  re-read, then the capture interlock; verify parser compatibility at spec time. At planning close, route
  the `synthesis-modality`, `knowledge-architecture`, and `task-list-conventions` captures (§ Coordination). Fold
  `delivery-native-stack-composition`'s answer on the refinement invariant when it lands, and re-read the whole
  draft against whatever neighbouring work units have shipped by then.

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

And the case is no longer isolated (recurrence read 2026-08-24). The same failure shape — spec solid,
verification finds implementation gaps sourced to task-list coverage — recurred at pattern level across the
recent execution era (`integration-boundary-accuracy`, `decompose-extraction`, and/or `delivery-stack-topology`;
not individually re-cited). The sharpest instance: `delivery-native-stack-composition`'s Phase 6 decomposed
horizontally across refresh planning, suffix proof, top absorption, native routing, recovery, handlers, and
workflow prose. Every primitive and local contract tested green, yet no task owned the complete external-refresh
adoption or typed native-fallback transition, and the gaps survived repeated adversarial passes: top absorption
had no refresh-adoption caller, native selection admitted caller-authored coordinates before state binding, and
`native-stack-required` stranded a sequential reservation behind an inapplicable refresh command. Member-level
acceptance criteria omitted an explicit lifecycle for one deliverable, while workflow integration tests mainly
asserted strings and ordering rather than executing the state transition. Two shapes recur across the era:
**unwired production callers** (modules built but unreachable), and **surface-level statement without the
next-layer-deep realization** a detailed spec normally supplies. This work unit is therefore evidence-motivated,
not capability-motivated.

## Proposed direction

**A task plan is an ordered sequence of segments; each segment carries a mode.** A segment is a contiguous run of
the plan (one phase or several) that closes on a stated kind of progress. The mode names which kind — **`slice`**
/ **`layer`** / **`replication`**, each named by what its boundary closes on (settled 2026-08-24); `vertical` and
`horizontal` remain descriptive adjectives in prose (a `slice` segment is the vertical mode).

Modes attach to segments rather than to work units, so a plan that builds substrate and then slices over it is
expressible directly instead of being forced into a whole-work-unit label. Mixed plans are the expected case.

**The discriminator: where does residual risk sit once planning closes?**

| Residual risk lies in                                           | Mode                     | The segment closes on                              |
| --------------------------------------------------------------- | ------------------------ | -------------------------------------------------- |
| **Composition** — do the parts assemble into intended behavior? | **slice** (vertical)     | a thin end-to-end capability that can be exercised |
| **Substrate contract** — is the shared thing underneath right?  | **layer** (horizontal)   | a complete, settled layer                          |
| **Mechanics at scale** — does this transformation work N times? | **replication**          | the enumerated surface exhausted, batch-verified   |

**`pilot-then-replicate` is the composition, not a mode** (settled 2026-08-24). The mechanics-at-scale row is
answered by a thin pilot segment — mode `slice`, closing on one proven instance (the slice definition passes;
what differs is the risk being retired, mechanics rather than composition) — followed by a `replication`
segment.
Risk loci and modes both number three but are not forced 1:1: the third locus maps to a composition the
discriminator recommends by name. This dissolves the boundary objection (a segment closes on one stated kind of
progress; the old third mode named two) instead of patching it.

The axis is deliberately _not_ design determinacy. A fully determinate design can carry high mechanical risk (a
settled migration applied across a large surface), and determinacy would push that case toward horizontal ordering
when pilot-then-replicate is plainly correct. Residual-risk locus resolves all three without special-casing.

Grounding, with its limits stated:

- `review-architecture` — the one case with a real task plan whose ordering can be read. Residual risk was
  composition; its problems were discovered at review. → **slice**, matching its own postmortem.
- A two-mirror documentation verb-rename sweep — a constructed case, not a specific work unit. The design is
  trivial, the mechanics are the risk. → **pilot-then-replicate**.
- `chunked-delivery` — its residual risk is the substrate contract (`DeliveryPlan` and its identity model), but it
  carries `Task List: [none]`, so this reads its _design_ sequencing rather than a task plan. Suggestive of
  **layer**, not a validation.
- External prior art (research pass, 2026-08-24) — walking skeleton (Cockburn/GOOS), tracer bullet (Hunt &
  Thomas), and steel thread are one idiom under three names — thin, real, kept, end-to-end first — targeting
  exactly this composition risk. GOOS's acceptance-test-per-slice discipline (an executable end-to-end test
  reads each increment's done-ness, not structural assertions) is the strongest sourced form of the executable
  exit criterion. SPIDR's published discriminator ("if no cut produces a shippable slice, it's a scope problem,
  not a splitting problem") and the recognized substrate/migration alternatives (enabler work, layer-first,
  canary / expand–contract) externally validate the three-mode residual-risk taxonomy — including
  `pilot-then-replicate` as a real, distinct rollout idiom.
- Targeted follow-up (light research pass, 2026-08-24) — grounding for `replication`: Google's Large-Scale-Change
  discipline (_Software Engineering at Google_ ch. 22 — change creation, shard management, cleanup; "done" is
  explicitly case-per-change) is the institutional precedent for prove-once-then-mass-apply; Fowler's Parallel
  Change (Expand → Migrate → Contract) is the staged-composition precedent; canary / progressive delivery is
  the deployment-side analogue. No surveyed source names the segment-level mode or its completion criterion —
  `replication` and "enumerated surface exhausted, batch-verified" are coined into a real terminological gap.
  Citation caution: Rule of Three and Spike-and-Stabilize are commonly mis-cited analogues of the wrong shape —
  do not cite them as prior art here.

The first pass closed on one real datum — the case the model was derived from — and recorded a re-grounding
debt. That debt is now substantially paid at pattern level: the recurrence evidence in § Problem / Motivation
(execution-era work units with real task plans showing the same coverage failure) plus the external prior art
above. What remains thin is mode-classification practice — no second corpus task plan has been _classified_
against the three modes, only the failure they answer.

**Where the read happens.** `generate-tasks` § Resolve depth & Class already makes one scale-axis read that drives
two outputs. Segmentation asks a different question of the same evidence, so it becomes a third output of that one
read — no second entry read, and the stage keeps re-deriving rather than inheriting (the same reason planning
depth is never carried forward). What the read produces is recorded on the task-list surface the stage authors
(below), never carried as stage state. The discriminator itself lands as a **method fired from `generate-tasks`**,
sibling to `resolve-planning-depth` / `classify-work-unit` at that same read, its trigger anchored to the
operation (authoring phase structure and exit criteria) rather than the workflow — no new always-loaded surface.
The read is universal, not `Class`-scaled (settled 2026-08-24): as a third output of an existing read a gate
would save nothing, and a `Light` work unit's read degenerately returns one segment with an evident mode.

**The reader and the verification family** (settled 2026-08-24). Nothing reads an exit criterion today, and
prose beside prose loses — so the criterion becomes structure the existing machinery already reads, at three
composed sites. _Authoring time:_ the `generate-tasks` Finalize checklist gains entries — every phase belongs
to a declared segment, whose opening phase carries `_Mode:_` (with its span when multi-phase) and whose closing
phase carries `_Exit criterion:_` (single-phase segments carry both); on a composition-risk plan (one or more
`slice` segments) every mandatory lifecycle row is assigned to a `slice`; every stub names a retiring phase;
and every `slice` or `replication` segment closes with a `Verification:` task (a cheap title scan — the marker
is greppable by design). A `layer` criterion closes on settledness its own test tasks already prove, so it
requires no separate scenario task; the terminal Verification phase is the family's work-unit-boundary member —
it carries no mode or criterion of its own, and on a degenerate single-segment plan its `Verification: work
unit` task subsumes a separate segment verify. _Execution time:_ the criterion is proven by an ordinary closing task titled
with the family marker `Verification: {boundary} — {detail}` — segment form `Verification: exit criterion —
{scenario}`, lexically bound to the preamble label — so the existing task interlock gates it with no new
machinery. _Verify time:_ the shipped `validate-criteria` method re-reads criteria at member and work-unit
scope (grounded 2026-08-24 against its delivered contract in the `delivery-native-stack-composition` worktree):
it binds each criterion by exact Success-Criteria heading-path locus and consumes member reports as
closing-task evidence — the `Verification:` task's executed scenario is precisely the source-grounded evidence
its reports want. Whether a segment's exit criterion also projects into a Success Criteria row (giving the
verify-time walk a locus to bind) or rests on closing-task evidence alone is settled at spec time with the
landed conventions.

The marker names a family: segmentation distributes verification to the boundaries it creates — segment,
deliverable (`validate-criteria` close-out), work unit (`verify-work-unit`) — and the terminal Verification
phase thins toward composed whole-unit checks. The work-unit form's retitle rides this work unit's template
edit; the delivery-member form is proposed to `delivery-native-stack-composition`'s conventions, not authored
here. When a member boundary coincides with a segment boundary, the exit-criterion verify runs first and the
member close-out consumes its evidence; adjacency vs subtasks-of-one-parent is settled at spec time against
those landed conventions.

**Surface shape.** Segments carry no IDs — phases identify them (a multi-phase segment declares its span in its
opening phase; the criterion lands on the closing phase; a stub's retiring owner names the phase). `_Mode:_`
carries a standard gloss (its closes-on kind from the discriminator table), `_Exit criterion:_` the specific
criterion — both preamble prose inside the existing parser grammar, adding zero enumeration beside phases, task
numbers, and delivery members. No new typed artifact, and the lifecycle-coverage check stays a checklist
obligation rather than a CLI checker (premature without a typed plan record, and the first place the ergonomics
constraint would bite); typed promotion stays open for `planning-iteration-mechanics`' closeout gate /
`composable-workflows`' arms when they land — compose by reference, consume later.

**What actually changes:**

1. **Phase exit criteria** in `generate-tasks` § Design phases and parent-task skeletons — a segment's mode states
   what its boundary must close on. This is the core deliverable, and the lifecycle-coverage capture (2026-08-24)
   supplies its concrete content for composition-risk plans: inventory each supported lifecycle row and assign
   every row to one `slice` segment or parent task that wires its production callsite and proves it with an
   executable scenario. The rows derive from the spec's own lifecycle statements — the motivating case's
   inventory (initial durable state through caller and fresh authority, mutation boundary, reservation/CAS and
   crash-retry behavior, typed next action) is a worked exemplar, not a normative taxonomy; a UI or
   documentation work unit derives different rows. A primitive, schema arm, or workflow paragraph cannot
   close the obligation by itself; exit criteria cover every mandatory spec lifecycle, not merely representative
   outcomes. Division of labor: draft/spec authoring names the invariants, capabilities, and transitions; task
   generation owns turning them into vertically closed implementation-and-verification slices. How the
   criterion is recorded and read lives in § The reader and the verification family above. The clause also owns
   scaffolding disposition: every stub a slice creates
   names its **retiring phase** — the phase whose exit criterion includes replacing or removing it — and
   Finalize checks that no stub lacks one.
2. **The discriminator** — the residual-risk read and the three modes, landing as a method fired from
   `generate-tasks` at the existing entry read (settled 2026-08-24). The method's output includes the
   **sequencing doctrine** (folded from adversarial pass 2): order segments to retire the dominant residual
   risk earliest — the first `slice` lands as early as the substrate allows. Deliverable 1's workflow edit
   rewrites the existing _"Order phases to minimize dependencies and enable incremental delivery"_ line to take
   the mode read as input. The Finalize gate enforces coverage and criteria, **not** earliness — earliness is
   the method's stated doctrine plus eval coverage; a mechanical earliness gate would be exactly the machinery
   the ergonomics constraint forbids.
3. **Test-first grouping becomes mode-sensitive.** Today's _"group test and implementation together by module or
   concern"_ is correct within a `layer` segment and fights a `slice`, where the natural grouping is by
   behavior path. The rule needs the mode as an input rather than a blanket instruction. A coupled refinement
   (housekeep capture, 2026-08-10): **batching as the fail-first-preserving form**. One minimal implementation
   often satisfies several coupled behavior tests, making later RED steps unreachable — when behaviors share one
   indivisible implementation, batching can be the sequence in which every test genuinely fails first. Widen the
   manufactured-RED rule to incidentally satisfied behaviors, record reconstruct/revert evidence at completion,
   and weigh declaring the cycle boundary during task generation when the coupling is visible there. Split by
   fire-point (settled 2026-08-24; corrected at adversarial pass 2): the planning-time half (mode-sensitive
   grouping, cycle-boundary declaration) lands in `generate-tasks` **and** `test-first` — the latter's own copy
   of the grouping rule takes the same mode input so the two never diverge; the execution-time half
   (manufactured-RED widened to incidentally satisfied behaviors, reconstruct/revert evidence) lands in
   `testing-standards`, the declared execution-time owner of the fail-first invariants. Cross-referenced, never
   restated.
4. **Vocabulary** — `segment`, `slice`, `layer`, `replication`, and their explicit boundaries against `spike`
   (planning-time, throwaway, de-risks inputs), `chunk` (review unit), and `deliverable` (chunk with a merge
   boundary). As new load-bearing
   terms they earn brief-vocabulary definitions before use (`strategy-procedure-evolution` Principle 7), as
   `chunk` and `deliverable` did.

Verification consideration, not a fifth deliverable: edits to `generate-tasks`' judgment prose want eval
coverage (`strategy-procedure-evolution` Principle 5; owner `workflow-eval-harness`) — carry it as a spec-time
line item.

**Ergonomics constraint** (2026-08-24). Any mechanization this work unit adds — reader sites, checklist
entries, a future typed promotion — keeps routine-session ergonomics, primarily the agent's, first-class:
surfaces present themselves at point of use (precomposed verdicts and remedies), never require code-diving or
schema archaeology to discover how to proceed, and never tax `generate-tasks` wall clock. Mechanization earns
its place by _improving_ routine operations; the review architecture's in-progress right-sizing is the
cautionary precedent.

**Cost honesty.** Vertical segmentation is not free and the doctrine must price it, or it will read as a
free win and be over-applied. A slice front-loads integration work, and it usually requires scaffolding for the
layers it does not yet fully build — owned by the retiring-owner clause in item 1 (settled 2026-08-24). Naming
the modes side by side is partly there to make the _cost_ of choosing vertical
visible next to the alternatives.

## Worked example — segmented task-list shape (prototype)

Illustrative excerpt over a constructed work unit — not template text; the real template and formatting-strategy
edits land at implementation. Everything below stays inside the existing task-list grammar: phase headings and
checkbox tasks are untouched, `_Mode:_` and `_Exit criterion:_` are preamble prose (the preamble boundary
contract already spans heading → first task), the exit-criterion verify is an ordinary closing task, and a
stub's retiring owner is a detail bullet. The `taskCursor` probe, compaction recovery, and session-init's
partial read see a normal task list. Segments carry no surface IDs — phases identify them — so segmentation
adds no enumeration beside phases, task numbers, and delivery members. Note Phase 1 below: a `layer` phase
carries no scenario task — its own test tasks prove its criterion; `Verification:` tasks close `slice` and
`replication` segments.

```markdown
# Task List: import-profiles

- **Design:** `spec-import-profiles.md`

---

## **Phase 1:** Profile record substrate

_Purpose:_ the shared record both slices build on.
_Mode:_ `layer` — closes on a complete, settled layer.
_Exit criterion:_ `ProfileRecord` schema and storage round-trip settled and tested; no consumer yet — Phase 2
wires the first production caller.

### `[ ]` **1.1 Define `ProfileRecord` schema and storage round-trip**

- _Goal:_ typed record with load/save; validation errors surfaced as typed results.

## **Phase 2:** Happy-path import, end to end

_Purpose:_ the thinnest real import a user can run.
_Mode:_ `slice` — closes on exercisable end-to-end capability.
_Exit criterion:_ `arc profiles import <file>` exercised against a real fixture — lifecycle row "valid file →
stored profile → typed success" wired to its production callsite and proven by task 2.3.

### `[ ]` **2.1 Wire the `import` command to `ProfileRecord` (production callsite)**

- _Goal:_ the CLI path exists — no orphaned module.

    - `[ ]` **2.1.a Stub conflict resolution as pass-through**
        - _Retired by:_ Phase 3's exit criterion. (A plan is not Finalize-complete while a stub names no
          retiring phase.)

### `[ ]` **2.2 Surface import results in command output**

- _Goal:_ success and failure paths render typed results.

### `[ ]` **2.3 Verification: exit criterion — import a fixture through the real CLI path**

- _Goal:_ the executable scenario for the phase's `_Exit criterion:_`; Phase 2 is not done until it passes.

## **Phase 3:** Conflict handling

_Purpose:_ conflict resolution becomes real behavior.
_Mode:_ `slice` — closes on exercisable end-to-end capability.
_Exit criterion:_ duplicate-profile import exercised end to end; retires stub 2.1.a.
```

And the `pilot-then-replicate` composition, over the constructed two-mirror verb-rename sweep:

```markdown
## **Phase 2:** Rename pilot — one verb, both mirrors

_Purpose:_ prove the rename transform on one real instance.
_Mode:_ `slice` — closes on exercisable end-to-end capability (pilot: the transform proven before mass
application).
_Exit criterion:_ one verb renamed across both mirrors with gates green.

## **Phase 3:** Replicate across the remaining verbs

_Purpose:_ apply the proven transform across the corpus.
_Mode:_ `replication` — closes on the enumerated surface exhausted, batch-verified.
_Exit criterion:_ all remaining verbs renamed; the `Verification:` task runs the full-corpus check — zero
stragglers.
```

When a delivery plan is present, member close-out tasks and exit-criterion verifies share one boundary shape:
the verify runs first and the close-out consumes its evidence (composition detail settled at spec time — see
§ Grooming status → Open).

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
  slice-side code that is not kept — its disposition is the retiring-owner clause (item 1), settled separately
  from the vocabulary split.
- **Have pre-spec spikes build reusable scaffolding that implementation inherits.** Rejected, and it is the
  inverse of an efficiency: a spike built for reuse has already stopped being throwaway, which is the precise
  drift `synthesis-modality`'s disposition lifecycle exists to prevent. The real relationship between the two
  work units is informational — spike _findings_ tell task generation where composition risk lives.
- **Keep `pilot-then-replicate` a primitive mode with a staged criterion.** Rejected — it would be the only mode
  with an interior checkpoint, breaking the one-boundary-one-criterion shape the criterion-as-task reader
  depends on.
- **Collapse replication into `layer`.** Rejected — a `layer` segment closes on a settled layer; a
  replication segment closes on an exhausted enumeration. Conflating them re-blurs exactly the boundary an exit
  criterion exists to state.
- **Own the work-unit-level vertical/horizontal read too.** Rejected as scope. `decomposition-doctrine` owns
  concern → work-unit cuts and `chunked-delivery` owns chunk → `main` landability; that boundary is settled
  between them. This work unit contributes the axis as input and claims neither record.

## Coordination

- **`chunked-delivery` (cohort)** — the primary seam, and a favourable one. The original work unit was
  decomposed into the `chunked-delivery` cohort; its plan record ships through
  `delivery-native-stack-composition` (below), and the shipped `review-chunking` record settles that a phase is
  task-plan grouping, not itself a review scope — so the task-plan layer is unclaimed. Because `DeliveryPlan`
  members partition implementation leaves in task-inventory order (enforced by the composer's contiguous
  exactly-once partition check), segmentation determines which contiguous ranges can be promoted —
  segmentation is an _input_ to delivery authoring, not a competing annotation. The refinement-invariant
  question is routed there; do not author an answer here.
- **`delivery-native-stack-composition`** (in verification) — carries `chunked-delivery`'s delivery machinery
  into the corpus, so the routed refinement-invariant answer effectively lives with it now. Two further bearings:
  its extracted `validate-criteria` method is the verify-time leg of the composed reader, grounded against its
  delivered contract (§ The reader and the verification family), and the task-list/member conventions this work
  unit would edit are partly in its unlanded
  worktree — drafting is unblocked, but spec finalization for anything touching those conventions follows its
  ship; consult its worktree directly when an overlap question arises.
- **`runtime-composition-seams`** — its named-seam / wiring-obligation capture is deterministic reachability
  analysis (exported symbols with no non-test importer, enum members no production path emits). It complements,
  rather than substitutes for, lifecycle scenario ownership: a wired callsite proves reachability, not that the
  transition's executable scenario exercises intended behavior. Keep the two obligations distinct when authoring
  the exit-criterion content; its task-generation-convention coordination routes through
  `planning-iteration-mechanics`, the same convergence point named below.
- **`plan-amendment`** (minted 2026-08-24, alongside the buffer adoption) — owns the mid-implementation
  corrective procedure for the residue this work unit cannot prevent; complementary, not overlapping.
- **`decomposition-doctrine`** (in flight) — owns the concern → work-unit decomposition test, including
  stack-vs-coupling. The residual-risk axis is offered as input to that test, explicitly claiming no authority.
  Routed via `arc-inbox`.
- **`synthesis-modality`** — adjacent on one risk timeline. Its spikes de-risk inputs before a design exists;
  this de-risks composition after one does. Its "tracer-bullet syndrome" naming is corrected on this branch, and
  a cross-reference recording the boundary lands in both drafts. No dependency edge. Disposition doctrine
  (settled 2026-08-24): slice-scaffolding disposition is owned here as the retiring-owner exit-criterion clause,
  deliberately parallel in shape to its spike disposition contract (a default plus an explicit contract to
  deviate — spike code throwaway unless stabilized; slice scaffolding kept until its named retiring segment).
  It is unoccupied backlog (`planned`, unsequenced), so this work unit ships first and anchors the shared
  vocabulary; route a capture to its stub at planning close recording the boundary and the parallel-shape
  expectation. Light coordination only — no co-design, no sequencing change.
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
  than minting a private one. Its D2 already cites `generate-tasks`' depth-axis worked example as the
  arm/fragment precedent, so a mode arm is the anticipated shape — but nothing is shipped: compose by reference
  now, consume the mechanism later. (It reserves `lane` as an open naming item; check against `segment` / `slice`
  only if revived.)
- **`planning-iteration-mechanics`** — owns the planning-closeout gate shape; if segmentation produces a recorded
  verdict, that checklist may be its natural home rather than a freestanding rule. Backlog read (2026-08-24): its
  inbound buffer already anticipates a closeout gate at the `generate-tasks` finalization boundary,
  `runtime-composition-seams` routes its task-generation convention there, and `decomposition-doctrine` names it
  as candidate home for its recorded cohort-fit verdict — the convergence point for generate-tasks-boundary
  conventions. Still an unsettled stub: a candidate home, not a mechanism to depend on.
- **`task-list-conventions`** (backlog, `doc-conventions` cohort) — owns `strategy-task-list-formatting.md`,
  `template-tasks.md`, and the `generate-tasks` formatting surfaces: the exact surfaces the phase-exit-criteria
  deliverable edits. Its inbound buffer carries an adjacent "verification-as-spine vs terminal verification
  phase" item. Both work units are pre-spec and it is not near-term scheduled — no sequencing pressure; confirm
  edit ownership when it activates. Its "verification-as-spine" item is the same territory this doctrine
  mechanizes (verification distributed to segment boundaries; the terminal phase thinned toward composed
  whole-unit checks) — include it in the planning-close capture set.
- **`knowledge-architecture`** (backlog) — ratifies the placement principle behind the settled method placement
  (four-kind verdict, fire-site method tier; § Proposed direction → Where the read happens). It does not yet
  list this work unit among its coordination siblings — route the heads-up capture at planning close.

## Unknowns and Assumptions

- **Whether the modes survive contact.** Materially improved since the first pass: pattern-level recurrence
  evidence and external prior art both back the taxonomy (§ Proposed direction → grounding). Still untested:
  classifying a second corpus task plan against the three modes, and work units where residual risk is genuinely
  split within one segment.
- **Whether "phase" survives as the substrate.** Segments are defined over phases here. If `chunked-delivery`'s
  four-level model displaces phase as a structural unit, segmentation would need re-anchoring.
- **Assumption:** the cost of authoring a vertical plan is lower than the expected cost of late discovery on the
  work units where the discriminator says vertical. Unvalidated, and hard to validate other than by use.

## Scope Estimate

**Small–Medium, now bounded above.** The floor is one workflow procedure edit (`generate-tasks` phase design and
exit criteria, plus a Finalize checklist entry), one doctrine placement (strong method lean), one `test-first`
refinement, and vocabulary — package-synced across both copies, rules text rather than machinery. The 2026-08-24
reader/surfacing resolution set the ceiling: recorded task-list-native with no new typed artifact and no CLI
checker, so the recorded-surface expansion the first pass feared is off the table. Residual sizing swing: the
task-list prototype and parser-compatibility verification, and the eval line item (scaffolding disposition
resolved as a clause of deliverable 1 — no fifth deliverable).

Dependencies: none hard. Sequencing preference is _after_ `delivery-native-stack-composition` (carrying
`chunked-delivery`'s plan record) ships — it is in verification, and the task-list/member conventions this work
unit would edit are partly in its unlanded worktree. Drafting proceeds now; spec finalization for anything
touching those conventions follows its merge, so the segment → chunk relationship is authored against a stable
contract rather than a moving one.
