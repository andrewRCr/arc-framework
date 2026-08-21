# Draft: decomposition-doctrine — govern when a concern decomposes

- **Origin:** [internal] — minted on the decomposition-program grooming branch (2026-07-21); captured from the
  `review-architecture` integration postmortem discussion at session-init.
- **Purpose:** Make decomposition reliable and early enough to be the frontline defense against unreviewable work
  units, without over-correcting into churn: rebalance the size-vs-orthogonality discriminator, own the decompose
  arm the shipped boundary chassis dispatches to, codify the stack-vs-coupling test and its inputs, and gate
  adoption on stated intent rather than domain adjacency.

- **State:** Draft — re-grounded 2026-08-21 against the merged base: the boundary chassis re-charter
  (`assess-cohort-fit` → `assess-boundary-fit`), a machinery-readiness re-derivation, and nine held captures
  drained in. Maturing; the boundary-read axes are structured but deliberately unsettled (§ Boundary-read axes).

---

## Problem / Motivation

### The two conditions

Aggressive decomposition is the right default **only if two things hold**: the cut happens at the right
design-reasoning moment, and the cut is cheap. Both conditions are load-bearing.

- **Cut too early** and you split before the concern's shape has settled — the remaining pieces get harder to
  reason about, and the cut itself is naive. This is the real reason decomposition gets resisted, and the
  resistance is well-founded.
- **Cut expensively** and authors avoid it regardless of doctrine. Guidance that prescribes a painful operation
  does not change behavior; it just adds a rule people work around.

When first written (2026-07-26) the current state failed both. Since then the shipped boundary chassis forces the
read at three fire-points and records its outcome (§ What is already codified), and the machinery rework closed
most of the cost defects (§ Machinery readiness). What remains unowned is the substance of the read itself — the
discriminator's bound and the decompose-arm rules the chassis dispatches to.

### What is already codified — and does not need inventing

The boundary-read chassis shipped while this draft was paused: `assess-cohort-fit` re-chartered as
`assess-boundary-fit` (via `delivery-stack-topology`), and the shipped method already carries:

- **Three outcomes** — "stays one WU", a cut-map, or "stays one WU + delivery-plan candidate" — so the
  delivery-cut resolution shape this draft once proposed as new machinery now exists as a first-class outcome.
- **Fire-points at `draft-design`, `create-spec`, and `generate-tasks` Pass 1** — the forced re-read failure
  point 3 below records as missing. The method header states the correction outright: the depth valve owns only
  scale and derivation; concern multiplicity is a third axis it does not route.
- **Recorded-outcome semantics** — the caller records the outcome and evidence basis in draft or spec decision
  prose; outcomes are sticky and re-raise only on a material new-evidence delta. Failure point 4's missing
  verdict artifact is substantially addressed.
- The plan-grouping ≠ delivery-grouping model, the maturity gate ("decompose when the design is stable enough
  that the cuts are real, not before"), and the two guard rails carry over unchanged.

The problem is therefore narrower than first framed: **the chassis bites, but its substance is inherited, not
settled.** The discriminator still reads "tightly-coupled work designed as a whole stays one WU even when large;
the per-task review grain carries the quality" — the exact license failure point 1 records — and the decompose
arm the chassis dispatches to has no owner for its rules: when lateral decomposition applies, what a complete cut
must absorb, and how coupling claims are tested. That content is this work unit's.

### The keystone — a design cut is not a delivery cut

Deferring **design** with substantial overlap is genuinely bad: it splits a concern before its shape is known,
leaves each piece harder to reason about, and produces a naive cut. Deferring **implementation** is ordinary good
engineering. Collapsing the two is what makes decomposition feel like a loss.

So separate them:

- A **design cut** re-opens what the thing _is_. Expensive, correctly resisted, and only legitimate while the
  design is still forming.
- A **delivery cut** keeps the settled design whole and splits only _how it lands_. Cheap, healthy, and the same
  deferral authors already accept everywhere else.

Everything downstream of a settled design should be a delivery cut. This is the concept the doctrine previously
lacked, and it is what converts decomposition from something a scope-averse author resists into something they
reach for.

### The four original failure points

`review-architecture` reached integration as one work unit at 307 files / ~24.7k insertions — a surface its own
notes record as exceeding what any single review invocation can navigate, requiring an ad-hoc eight-pass chunked
review. Four gaps, each doctrine or pipeline rather than execution error:

1. **The doctrine licenses unbounded single-WU size.** The boundary method and `strategy-work-organization` § WU
   sizing standard say one coherent concern stays one WU, however large — justified by the per-task review grain,
   which covers _execution_ review only. The integration-time review surface has no owner in the sizing standard.
2. **Coupling was never tested against the stack shape.** The recorded keep-whole rationale ("one forward-contract
   cutover; splitting would create an unusable intermediate contract") describes _sequential dependency_ — which
   the sizing standard itself delivers as a stack of dependency-ordered WUs. Sequential coupling read as design
   coupling, and the alternative was never weighed on the record. Verification proved the seams were real.
3. **The primary signal fired with no forced re-read.** Deliverable count is the standard's stated primary signal;
   at generate-tasks it materialized as 8 phases / ~111 leaf tasks / 5 new methods / two review channels. The
   sizing review that ran trimmed edge scope but never re-opened the WU-count question.
4. **No verdict artifact exists.** The boundary read produced no recorded output when it answered "stays one WU,"
   so there was nothing to audit, nothing a later gate could challenge, and no way to tell whether the method ran
   at all. `Class`, by contrast, is a recorded, ratcheted field.

Status at re-grounding: points 3 and 4 are substantially addressed by the shipped chassis (fire-points and
recorded-outcome semantics); points 1 and 2 — the unbounded license and the untested coupling claim — remain open
and are deliverables 1 and 4.

### The fifth failure point — adoption by adjacency

The four above explain why an oversized WU is not _cut_. They do not explain why it got oversized.
`session-locus-model` reached 195 commits and +48,254 lines because two further work units were built inside it
and never received their own spec, review boundary, or scoping decision: `lib/locus` (6,893) is the specced
intent, while `lib/errand` grew 1,389 → 7,789 and `lib/housekeep` + `lib/groom` (1,889, nine new CLI verbs) trace
to none of the six motivating failures.

The absorption path is capture → "same domain" → adopt → "then we should also cover this case, and this one."
Domain adjacency is the trigger at both ends: at drain, a capture routes into an active WU because it touches the
same subsystem; inside planning, each adopted concern recruits its own adjacent cases. Neither step asks whether
the concern serves the WU's **stated intent** — only whether it is in its _neighbourhood_. The two floors gate
whether something is WU-shaped; nothing gates whether it belongs to _this_ WU.

Every absorbed concern was individually legitimate, which is exactly why nothing stopped them. The failure is
only visible cumulatively.

This is the cheapest lever in the whole problem: **a work unit that never accretes foreign concerns needs cutting
far less often.** It also directly answers the over-correction risk — the way to avoid splitting everything is to
stop concerns arriving where they do not belong, not to split more aggressively downstream.

### Where stacked delivery ends and decomposition begins

`review-chunking` shipped, and stacked delivery is now real (v1 via `delivery-stack-topology`;
`delivery-native-stack-composition` carries the v2 topology). The stack-first re-groom of the delivery cohort
(2026-08-05) settled the complementary reading this section previously framed as backstop-versus-frontline:
**decomposition answers size known at planning; stacked delivery answers size discovered during execution.** A
work unit's size cannot always be known at planning time, so the stack projection is a first-class relief valve
rather than a fallback — both recorded field deliveries were stacks. The boundary is crisp: this doctrine owns
whether a concern splits into several work units before execution; the delivery surface owns delivery topology
for a concern that stays one work unit. Neither subordinates the other.

What survives from the original framing is the reviewability bound itself. Chunked review of ~24k lines is still
a week-scale cost the plan should have priced, and review capacity is not the only cost of a large unit: it is
also unbisectable, unrevertable, and un-cherry-pickable, and it blocks its own base for as long as it takes.
Those costs are independent of who or what does the reviewing, so evidence that a reviewer copes with 5k lines
does not license 25k — the shipped mechanisms raise the bound without removing it. The target is not "smallest
possible PR" — it is **each unit independently landable and revertable**, which has a natural floor and does not
push toward churn-splitting.

### Machinery readiness — re-derived 2026-08-21

The blanket claim this section previously carried — five open defects, "must not ship ahead of that readiness" —
went stale exactly the way prose gates do. Re-derived against the merged base after
`decompose-transform-integrity` and `decompose-transition-record` shipped:

- **Closed.** Heading-scan granularity (disjoint, exhaustive scanner). Finalization fragility (the receipt spine
  is gone; refusals are typed with precomposed remedies; base advancement is idempotent and re-runnable).
  Auto-clear (the lean transition record is admitted by the planning classifier, pinned by tests).
- **Half-closed.** Run-context disagreement: the symmetric arm now resolves branch-private snapshots with a typed
  `source-unpublished` refusal; the extraction arm simply does not exist yet — `decompose-extraction` owns it
  (Ready, settled spec).
- **Open.** Conservation still covers only the origin design-artifact group while retirement deletes every origin
  path, so a branch-private `notes-*` companion can strand silently — `decompose-conservation-coverage` owns it
  (Planning).

Consequence: the symmetric full cut at planning time — what deliverables 1, 3, and 4 actually prescribe — is now
cheap and typed-safe, modulo the conservation edge for origins carrying branch-private companions. The extraction
arm matters to the adjacency-remediation path (pulling a foreign concern out of a live unit) and to any
mid-implementation remedy, not to the mainline. The residuals are recorded as hard `Depends On` edges on the meta
(`decompose-extraction`, `decompose-conservation-coverage`) rather than as prose: `arc wu reconcile` tracks edge
discharge mechanically, which is precisely what the prose version failed at. Under today's single-meaning edge
semantics the edges read as blocks-start; that is honest here because this work unit deliberately pauses until
they land (§ Sequencing). A routed capture proposes degree-qualified edges (`wu-lifecycle-state-model`); until
that lands, the coarse reading stands.

## Proposed direction

Reshaped at re-grounding: the shipped chassis absorbed the structural halves of two deliverables, so the set now
reads —

1. **Discriminator rebalance** — `assess-boundary-fit` + `strategy-work-organization` § WU sizing standard.
   Orthogonality stays the trigger, but "coupled work designed as a whole stays one WU, however large" gains an
   integration-reviewability bound: past a stated scale, coherence alone no longer settles the question and the
   decision must be made and recorded rather than defaulted. Shipped chunking and stacked delivery _raise_ that
   bound; they do not remove it. State the bound as independent landability and revertability rather than a raw
   line count, so it does not drift with tooling maturity; the boundary-read axes below are its candidate inputs.

2. **Recorded verdict — verify, not build.** The chassis shipped the mechanism: outcome plus evidence basis
   recorded in draft/spec decision prose, sticky, re-raised only on a material new-evidence delta. Remaining
   delta only: confirm the shipped semantics give a later gate something to challenge (auditability), and
   coordinate with `planning-iteration-mechanics` on whether the record folds into a planning-closeout checklist.
   If the shipped shape suffices, this deliverable closes as a no-op.

3. **Decompose-arm content at the split reading.** The generate-tasks fire-point and the delivery-cut outcome
   shipped with the chassis; what the chassis dispatches to is unowned. This work unit owns that content: the
   decomposition entry rules below (maturity-preserving arms, eligibility, fallbacks), the cut-completeness rail,
   and the shrink-before-split ordering against `assess-design-proportionality` — shrink first, since decomposing
   an overdesigned plan institutionalizes the excess across N members. The delivery-cut expression question is
   answered by shipped surface: a "stays one WU + delivery-plan candidate" outcome resolves through the delivery
   plan (`arc delivery`), not through a new cut-map disposition.

4. **Stack-vs-coupling test** — codify that a sequential forward-contract chain is a _stack signal_, not a
   keep-whole signal: an "unusable intermediate contract" claim must be tested against dependency-ordered
   delivery (each member shipping a usable contract to the next) before it justifies one WU. Lands beside the
   stack-vs-cohort bullet the standard already carries. Two recorded inputs sharpen the test (§ Boundary-read
   axes): the residual-risk reading and verifiable surface area.

5. **Intent over adjacency at adoption** — a routing-time and planning-time check keyed to intent rather than
   domain. For a candidate adoption, name which of the target WU's recorded goals or motivating failures it
   serves, and refuse when the answer is "none, but it is nearby." Cheapest form is a drain-side prompt on
   route-into-active plus a planning-side pass when a spec's design sections outgrow its Goals list. Pairs
   naturally with deliverable 1's size signal, since the failure is only visible cumulatively — no single
   adoption looks wrong.

   The same adjacency pressure applies to remediation: review findings against an oversized branch route back
   into that branch by default, compounding the original scoping error rather than surfacing it.

### Cut completeness — the additive-vs-consistency rail

Absorbed from `cohort-cut-coherence`, which operated at the same altitude on the same surfaces. An affirmative
cut is complete only when it absorbs the work whose deferral would leave the model and substrate inconsistent;
merely additive enhancements remain separate. That rail is the missing cut-completeness discriminator for the
affirmative arm: it decides what a cut-map _must_ carry versus what it must _not_ recruit — the same
intent-over-adjacency logic as deliverable 5, applied inside the cut instead of at adoption. Boundary preserved:
this doctrine decides semantic completeness; `decompose-transform-integrity`'s machinery conserves and publishes
the authored cut. Apply the rail to the decompose cohort itself as an acceptance read; retire
`cohort-cut-coherence` only once this work unit owns the concern and that cohort still reads coherently.

### Decomposition entry rules — maturity-preserving arms

Decomposition entry is defined by the latest **completed planning authority**, never by an in-progress workflow
stage. Two arms:

- **No finalized, reviewed spec** → decompose to member drafts; each enters `draft-design`.
- **Finalized spec** → distribute complete self-contained child specs (plus any useful provisional task
  skeleton); each mature child reruns `generate-tasks` from the top against its extracted spec, and does not
  repeat `draft-design`, `create-spec`, or their completed reviews.

No `create-spec` entry exists: when a cut surfaces there, finish and review the holistic spec first; if the cut
makes that impossible without reopening design, fall back to draft-level decomposition. A fuller or finalized
parent task list remains a seed for `generate-tasks`, not authority for a ready-to-activate entry. Mixed-maturity
children are ineligible for one mature cut; multi-member built-code splitting remains the existing full-split
escape hatch. This is what makes a task-scale discovery resolvable without re-opening settled design: the
size-only discovery at generate-tasks routes to a delivery cut or a lateral cut at current authority, never back
through completed stages. Coordinate the result with `decompose-transform-integrity`, which owns artifact
projection, scaffold/meta initialization, launch-stage preservation, provisional-task handling, and conservation
mechanics.

### Member baseline — dependency re-validation at a decomposed member's first session

A member minted post-spec inherits a spec authored against dependencies that had not yet landed; its first
session may open after they ship, with drifted contracts and nothing in procedure checking — the existing
dependency check at `generate-tasks` is a **liveness** check ("is this blocker still open?"), not a
**conformance** check ("did it ship what my spec assumed?"). Hit live on `decompose-base-mobility`: liveness
passed while the spec named a recovery action that does not exist. The general cross-WU conformance rule is
`cross-wu-coordination`'s; this doctrine strengthens it for decomposition-minted members: the cut should mint a
usable readiness baseline per member (the transition record already pins the result base), and the member's first
session re-validates consumed contracts against it. Placement is deliberately open — constrained by the load-set
scoping analysis and the install-recipe check before any rule lands on an on-demand surface.

## Boundary-read axes — structured, deliberately unsettled

Four held captures converged on one question — what inputs the boundary read weighs — and are recorded here as
one axis model to settle at resume, not four rules to ship:

- **Three sizes, three owners.** _Changeset scale_ is delivery's — stack topology bounds what lands.
  _Implementation-surface scale_ is phasing's, plus the overrun guard below. _Planning-suite scale_ — the
  attention cost of whole-artifact passes (spec review, final suite coherence, adversarial passes over a
  1,500-line suite) — degrades planning quality even when the concern is cohesive and delivery bounds the
  changeset; it currently has no owner. Scale is never the mechanism of a cut, only a reason to search for a
  seam; at extremes it shifts the burden so cohesion must be demonstrated, not presumed. When the seam search
  fails, the remedy is attention partition (partitioned or serial adversarial passes, layered specs), not
  decomposition — splitting a cohesive design just distributes the load into cross-referencing sibling specs.
  A separable method change — widening `adversarial-review`'s partitioned pass mode from Novel-gated to
  surface-width-triggered at `Heavy` — is named here without being owned.
- **Residual-risk reading** (offered by `plan-segmentation`; adopt, adapt, or reject — no coordination debt):
  read an "unusable intermediate contract" claim by where residual risk sits once planning closes —
  _substrate-contract_ risk (keep-whole is plausible) versus _composition_ risk (a stack of dependency-ordered
  members each shipping a usable contract is the better answer).
- **Verifiable surface area** (evidence: `integration-boundary-accuracy`): coupling proved necessary but not
  sufficient — chunking relocates the _review_ boundary and leaves verification, the task list, and the
  implementation arc at whole-unit scale, and verification is what failed there, twice. The defensible claim:
  **decomposition moves every boundary; chunking moves one** — so when the binding constraint is verification
  attention rather than review attention, chunking does not address the problem at hand. Honest counterweight,
  recorded with it: it is not established that decomposing would have gone better — five members means five
  verification ceremonies, and cross-member seams get harder to verify, which is where those defects landed. The
  claim is that chunking did nothing for the boundary that failed, not that the unit was cut too broad.
- **Overrun guard** (evidence: the `decompose-transform-integrity` core's own history — pre-split estimate
  5k–8.5k lines for the core, ~37k–44k projected at completion, never recalibrated after 51 leaves were
  planned): test the doctrine against that exact case and state which gate would have caught it — whether
  planning closeout must invalidate and recompute a low-confidence size estimate after spec generation and again
  after task generation, and whether leaf count, proof-matrix breadth, or runtime:test parity should trigger a
  mandatory re-cut or a pre-authored review-chunk plan. Fallback question, presumption kept: if no
  pre-implementation control would have guarded it, weigh a narrowly bounded mid-implementation decomposition
  path against unavoidable estimate uncertainty — prevention and chunking first; a mid-implementation mechanism
  only if the failure mode cannot otherwise be made meaningfully rarer. (The extraction arm is the machinery
  such a path would need — a second reason it is a recorded dependency.)

## Recorded boundary-fit verdict

Practicing deliverable 2 on this work unit. **Verdict re-confirmed at re-grounding: stays one WU, with a
predicted cut.** The deliverables share two surfaces (`assess-boundary-fit`, `strategy-work-organization` § WU
sizing standard) and one altitude — the same concern read at different fire-points, not orthogonal subsystems.

The predicted-cut line moved with the chassis: with deliverable 3's mechanism shipped, the
doctrine-text-versus-mechanism seam is gone; the live line is the gating one — prevention (deliverables 5 and 2,
ungated) versus prescription (1, 4, and 3, behind the recorded edges). Neither cut is real under this work unit's
own maturity gate; if one becomes real, cut on the gating line.

Deliberately _not_ absorbed, per deliverable 5 applied to this work unit: decomposition machinery and mechanics
(`decompose-transform-integrity` and its residual members), and mint-time properties of cut members such as
commitment inheritance and close-with-launch (`stub-mint-to-launch`). Both are adjacent; neither serves this work
unit's stated intent.

## Coordination

Re-resolved by slug 2026-08-21 — do not trust cached state.

- **`decompose-extraction`** (Ready; recorded edge) — owns the extraction arm. Settled spec plus retained task
  skeleton; schedulable on its own merits and listed as the parallel execution-lane candidate.
- **`decompose-conservation-coverage`** (Planning; recorded edge) — owns the conservation gap; its widened spine
  also absorbed the finalization-diagnostics and authoring-expressiveness residuals. The longer pole to this work
  unit's ship.
- **`delivery-native-stack-composition`** (Planning) — owns the boundary chassis's delivery arm and the delivery
  plan surface; shares the `assess-boundary-fit` touchpoint. This work unit leads on the discriminator
  (§ Sequencing); read the method's current tip and extend it rather than re-deriving.
- **`stub-mint-to-launch`** (paused) — owns entry-point-agnostic mint semantics for cut members; its draft
  targets a retired contract and re-plans around ordinary lifecycle status before implementation. Should still
  land before this doctrine's prescriptions take effect, since every cut this doctrine prescribes mints members
  through it.
- **`planning-iteration-mechanics`** (planned) — owns the planning-closeout gate shape; deliverable 2's residual
  delta may fold into its closeout checklist rather than landing freestanding.
- **`cross-wu-coordination`** (planned) — owns the general dependency-conformance rule the member baseline
  strengthens.
- **`cohort-cut-coherence`** (planned) — absorbed here (§ Cut completeness); retire only after this work unit
  owns the concern and the decompose cohort still reads coherently.
- **`wu-lifecycle-state-model`** (planned) — a routed capture proposes degree-qualified dependency edges
  (required-to-plan / -implement / -integrate); until it lands, this work unit's edges carry today's coarse
  blocks-start semantics.
- **Shipped, consumed:** `decompose-transform-integrity`, `decompose-transition-record`,
  `delivery-stack-topology`, `review-chunking`, `solution-proportionality`, and `integration-boundary-accuracy`
  (evidence source for the verifiable-surface axis). `decomposition-machinery` and `decomposition-hardening`
  gaps were dispositioned inside the decompose cohort.

## Sequencing

Re-settled 2026-08-21. The 2026-07-26 critical path completed: `decompose-transform-integrity` and
`decompose-transition-record` shipped, and the residual dispositions consolidated the remaining members to three.
The program's remaining order:

**Groom now, settle at resume.** This work unit's planning proceeded through this grooming pass and now
deliberately pauses: the boundary-read axes and the bound formulation settle at resume, once
`decompose-extraction`'s execution and `decompose-conservation-coverage`'s planning stop emitting doctrine
evidence — every decompose work unit so far has emitted captures back at this draft, and settling against an
incomplete evidence base re-opens a "settled" draft later, the exact churn the maturity gate exists to prevent.
Both residuals are recorded as hard `Depends On` edges; `arc wu reconcile` flags their discharge, which is the
resume signal.

**Deliverable-level gating.** The deliverables do not share one dependency:

| Deliverable                    | Effect on cut volume | Gated on residuals                        |
| ------------------------------ | -------------------- | ----------------------------------------- |
| 5 — intent over adjacency      | Prevents growth      | No — causes zero cuts                     |
| 2 — recorded verdict (delta)   | Records a decision   | No — likely closes as a no-op             |
| 1 — discriminator rebalance    | Increases cuts       | Conservation edge                         |
| 4 — stack-vs-coupling + inputs | Increases cuts       | Conservation edge                         |
| 3 — decompose-arm content      | Increases cuts       | Both (extraction for the remediation arm) |

Deliverables 5 and 2 could land early and would _reduce_ pressure on the machinery rather than add to it — the
prevention-versus-prescription line the verdict above records as the live candidate cut.

**Shared-surface ordering.** `assess-boundary-fit` has three pending editors: this work unit,
`cohort-cut-coherence` (absorbed here), and `delivery-native-stack-composition`. **This one leads** —
deliverable 1 changes the discriminator itself, while the delivery-framing pass should land on a settled
discriminator rather than the reverse. Read the method's current tip and extend it; do not re-derive from an
older mental model.

**One fork, not an order.** `planning-iteration-mechanics` owns the planning-closeout gate shape. Either it leads
and deliverable 2's residual delta slots into its closeout checklist, or the delta lands freestanding and that
work unit absorbs it later.

## Unknowns and Assumptions

- **Settled at re-grounding:** where the verdict lives (shipped: draft/spec decision prose, sticky, re-raise on
  delta); how the delivery cut is expressed (shipped: the delivery-plan candidate outcome resolves through
  `arc delivery` — no new cut-map disposition); `cohort-cut-coherence` absorption (absorbed — § Cut
  completeness).
- **Bound formulation** — still the hard one: whether independent landability and revertability can be stated
  crisply enough to act on, or degrades into a line-count threshold in practice. The axis model is its candidate
  input set; settle the two together at resume.
- **Axis-model settlement** — recorded and structured, deliberately unsettled (§ Boundary-read axes); the resume
  session's centerpiece.
- **Deliverable 5's placement** — the drain-side prompt and the planning-side pass may belong to different owners
  (housekeep routing versus planning closeout) even though they enforce one rule.
- **Member-baseline placement** — constrained by the load-set scoping analysis and the install-recipe check
  before any rule lands on an on-demand surface.
- **Class:** `Heavy`, re-affirmed at re-grounding — the chassis absorbed structure, not derivation; the axis
  model and the bound are authored design. `Novel` remains arguable and unchosen.
- **Knowledge-placement check** (per `strategy-knowledge-evolution`): all deliverables declare at existing
  fire-sites (method body, strategy section, generate-tasks step); no new always-loaded surface, no new doc
  family. Re-verify each destination against the install recipe at spec time.

## Scope Estimate

**Medium — revised down in mechanism, up in doctrine.** The one genuinely new mechanism the draft previously
carried (the delivery-cut resolution) shipped with the chassis; what remains is rules text across two methods,
one strategy section, and one workflow step — package-synced across both copies — plus the axis model, which is
where the authored-design weight now sits. The tripwire's CLI compilation, if any, remains deferred to the
procedure-evolution owners.

---
