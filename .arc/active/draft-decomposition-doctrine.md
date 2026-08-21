# Draft: decomposition-doctrine — govern when a concern decomposes

- **Origin:** [internal] — minted on the decomposition-program grooming branch (2026-07-21); captured from the
  `review-architecture` integration postmortem discussion at session-init.
- **Purpose:** Make decomposition reliable and early enough to be the frontline defense against unreviewable work
  units, without over-correcting into churn: rebalance the size-vs-orthogonality discriminator, record the verdict,
  add a split reading beside the shipped shrink reading, codify the stack-vs-coupling test, and gate adoption on
  stated intent rather than domain adjacency.

- **State:** Draft — reworked 2026-07-26 against shipped `review-chunking`, `solution-proportionality`,
  `decomposition-machinery`, and `decomposition-hardening`. Maturing.

---

## Problem / Motivation

### The two conditions

Aggressive decomposition is the right default **only if two things hold**: the cut happens at the right
design-reasoning moment, and the cut is cheap. Both conditions are load-bearing, and neither is currently owned.

- **Cut too early** and you split before the concern's shape has settled — the remaining pieces get harder to
  reason about, and the cut itself is naive. This is the real reason decomposition gets resisted, and the
  resistance is well-founded.
- **Cut expensively** and authors avoid it regardless of doctrine. Guidance that prescribes a painful operation
  does not change behavior; it just adds a rule people work around.

The current state fails both. The maturity gate names the right moment but nothing forces a read at it, and the
machinery's cost is unmeasured — measured now, and high (§ Machinery readiness).

### What is already codified — and does not need inventing

`assess-cohort-fit` already carries the model this work unit was assumed to need:

- **Plan-grouping is not delivery-grouping.** "One concern **plans** as a single coherent draft but **delivers** as
  a stack of WUs along natural deliverable/phase boundaries. At decomposition the one draft becomes N
  self-contained WU specs + cross-WU coordination."
- **Timing is gated on design maturity.** "Decompose when the design is stable enough that the cuts are real, not
  before. Speculative design → hold as one unit and iterate; settled design → decompose."
- **Two arms.** `draft-design` is the _predicted_ arm (design still forming); `create-spec` is the _emergent_ arm
  (a matured draft).

The problem is therefore **not that the model is wrong — it is that the model does not bite.** That reframing
matters: it is a much smaller and better-posed problem than redesigning the decomposition lifecycle, and it points
the deliverables at enforcement and evidence rather than at new concepts.

There is one exception, and it is the keystone below.

### The keystone — a design cut is not a delivery cut

Deferring **design** with substantial overlap is genuinely bad: it splits a concern before its shape is known,
leaves each piece harder to reason about, and produces a naive cut. Deferring **implementation** is ordinary good
engineering. Collapsing the two is what makes decomposition feel like a loss.

So separate them:

- A **design cut** re-opens what the thing _is_. Expensive, correctly resisted, and only legitimate while the
  design is still forming.
- A **delivery cut** keeps the settled design whole and splits only _how it lands_. Cheap, healthy, and the same
  deferral authors already accept everywhere else.

Everything downstream of a settled design should be a delivery cut. This is the concept the current doctrine
lacks, and it is what converts decomposition from something a scope-averse author resists into something they
reach for.

### The four original failure points

`review-architecture` reached integration as one work unit at 307 files / ~24.7k insertions — a surface its own
notes record as exceeding what any single review invocation can navigate, requiring an ad-hoc eight-pass chunked
review. Four gaps, each doctrine or pipeline rather than execution error:

1. **The doctrine licenses unbounded single-WU size.** `assess-cohort-fit` and `strategy-work-organization` § WU
   sizing standard say one coherent concern "stays one WU, however large," justified by the per-task review grain —
   which covers _execution_ review only. The integration-time review surface has no owner in the sizing standard.
2. **Coupling was never tested against the stack shape.** The recorded keep-whole rationale ("one forward-contract
   cutover; splitting would create an unusable intermediate contract") describes _sequential dependency_ — which the
   sizing standard itself delivers as a stack of dependency-ordered WUs. Sequential coupling read as design
   coupling, and the alternative was never weighed on the record. Verification proved the seams were real.
3. **The primary signal fired with no forced re-read.** Deliverable count is the standard's stated primary signal;
   at generate-tasks it materialized as 8 phases / ~111 leaf tasks / 5 new methods / two review channels. The sizing
   review that ran trimmed edge scope but never re-opened the WU-count question.
4. **No verdict artifact exists.** Cohort-fit produces no recorded output when it answers "stays one WU," so there
   is nothing to audit, nothing a later gate can challenge, and no way to tell whether the method ran at all.
   `Class`, by contrast, is a recorded, ratcheted field.

### The fifth failure point — adoption by adjacency

The four above explain why an oversized WU is not _cut_. They do not explain why it got oversized. `session-locus-model`
reached 195 commits and +48,254 lines because two further work units were built inside it and never received their own
spec, review boundary, or scoping decision: `lib/locus` (6,893) is the specced intent, while `lib/errand` grew
1,389 → 7,789 and `lib/housekeep` + `lib/groom` (1,889, nine new CLI verbs) trace to none of the six motivating
failures.

The absorption path is capture → "same domain" → adopt → "then we should also cover this case, and this one." Domain
adjacency is the trigger at both ends: at drain, a capture routes into an active WU because it touches the same
subsystem; inside planning, each adopted concern recruits its own adjacent cases. Neither step asks whether the
concern serves the WU's **stated intent** — only whether it is in its _neighbourhood_. The two floors gate whether
something is WU-shaped; nothing gates whether it belongs to _this_ WU.

Every absorbed concern was individually legitimate, which is exactly why nothing stopped them. The failure is only
visible cumulatively.

This is the cheapest lever in the whole problem: **a work unit that never accretes foreign concerns needs cutting far
less often.** It also directly answers the over-correction risk — the way to avoid splitting everything is to stop
concerns arriving where they do not belong, not to split more aggressively downstream.

### Why chunked review is not the answer

`review-chunking` has shipped, and this project runs it at a 5,000-line / 150-file threshold. That genuinely helps,
and stacked delivery will help further (v1 shipped via `delivery-stack-topology`;
`delivery-native-stack-composition` carries the v2 topology). But chunked review and stacked PRs
are a **backstop — a tool to reach for
when warranted or when something has gone wrong — not the frontline defense.** The frontline defense is not letting
an unreviewable surface reach integration at all.

Two reasons the bound survives a shipped chunking mechanism. First, chunked review of ~24k lines is still a
week-scale cost the plan should have priced. Second, review capacity is not the only cost of a large PR: it is also
unbisectable, unrevertable, and un-cherry-pickable, and it blocks its own base for as long as it takes. Those costs
are independent of who or what does the reviewing, so evidence that a reviewer copes with 5k lines does not license
25k.

That also bounds the aggressiveness sensibly. The target is not "smallest possible PR" — it is **each unit
independently landable and revertable**, which has a natural floor and does not push toward churn-splitting.

### Machinery readiness — the second condition, currently unmet

Decomposition is operationally critical, and the two shipped machinery work units (`decomposition-machinery`,
`decomposition-hardening`) left the operation expensive. Evidence from the first live decompositions after them,
all 2026-07-26 and recorded against `decompose-transform-integrity`:

- Both cut arms disagree with their own run context — the symmetric arm refuses outright against branch-private
  planning artifacts, the extraction arm stages members where the ship leg cannot reach them.
- Conservation covers only the origin artifact group, so branch-private planning outputs are silently strandable.
- Heading-scan granularity fails in both directions, requiring manual document surgery before a cut map can be
  authored.
- Finalization is not idempotent and reports only `evidence-mismatch`; recovering from an ordinary post-finalization
  content refinement required searching Git's object database to reproduce a receipt's patch digest.
- A decomposition PR can never auto-clear: the workflow promises the auto-merge lane, but every retirement
  decomposition emits a JSON receipt outside the planning classifier's grammar.

**This work unit must not ship ahead of that readiness.** Prescribing more cutting while cutting is expensive
produces exactly the avoidance this doctrine exists to correct. Stated as a sequencing precondition, not a
`Depends On` edge, so the doctrine text can progress in parallel — but the ordering claim is now evidence-backed
rather than a hunch.

## Proposed direction

Five deliverables, all edits to existing surfaces — no new machinery, no new always-loaded context.

1. **Discriminator rebalance** — `assess-cohort-fit` + `strategy-work-organization` § WU sizing standard.
   Orthogonality stays the trigger, but "one coherent concern stays one WU, however large" gains an
   integration-reviewability bound: past a stated scale, coherence alone no longer settles the question and the
   decision must be made and recorded rather than defaulted. Shipped chunked review _raises_ that bound; it does not
   remove it. State the bound as independent landability and revertability rather than a raw line count, so it does
   not drift with tooling maturity.

2. **Recorded verdict** — cohort-fit's answer becomes a written artifact at the design-stage reads that already
   invoke it (`draft-design`, `create-spec`): "stays one WU because X" or the cut-map, landing in the draft or spec
   alongside `Class`. Auditable, challengeable, and proof the method ran. Coordinate placement with
   `planning-iteration-mechanics`, which owns the planning-closeout gate shape.

3. **Split reading at generate-tasks — as a delivery cut.** `solution-proportionality` shipped
   `assess-design-proportionality` with a fire-point at generate-tasks, reading the provisional skeleton's phase
   count, parent-task titles, and subtask-count signals. That is the _shrink_ reading ("should this be smaller?").
   Add the _split_ reading ("should this be several?") beside it, honoring the stated order — shrink first, since
   decomposing an overdesigned plan institutionalizes the excess across N members.

   **The remedy must differ from the shrink remedy.** Proportionality's `revise` arm amends the spec and restarts at
   Resolve depth & Class — it routes upstream into re-design, which is correct for a shrink but wrong for a split:
   at generate-tasks the design is settled and only the grounded estimate of the resulting diff has changed.
   Re-opening the design there is precisely the design-deferral authors are right to resist. So the split reading
   resolves as a **delivery cut** — the settled design is preserved whole and only its delivery is partitioned.
   This is the one genuinely new mechanism, and it is what `assess-cohort-fit` currently refuses: its contract sends
   a generate-tasks discovery upstream to the design stages.

4. **Stack-vs-coupling test** — codify that a sequential forward-contract chain is a _stack signal_, not a
   keep-whole signal: an "unusable intermediate contract" claim must be tested against dependency-ordered delivery
   (each member shipping a usable contract to the next) before it justifies one WU. Lands beside the
   stack-vs-cohort bullet the standard already carries.

5. **Intent over adjacency at adoption** — a routing-time and planning-time check keyed to intent rather than
   domain. For a candidate adoption, name which of the target WU's recorded goals or motivating failures it serves,
   and refuse when the answer is "none, but it is nearby." Cheapest form is a drain-side prompt on route-into-active
   plus a planning-side pass when a spec's design sections outgrow its Goals list. Pairs naturally with deliverable
   1's size signal, since the failure is only visible cumulatively — no single adoption looks wrong.

   The same adjacency pressure applies to remediation: review findings against an oversized branch route back into
   that branch by default, compounding the original scoping error rather than surfacing it.

## Recorded cohort-fit verdict

Practicing deliverable 2 on this work unit.

**Verdict: stays one WU, with a predicted cut.** The five deliverables share two surfaces (`assess-cohort-fit`,
`strategy-work-organization` § WU sizing standard) and one altitude — they are the same concern read at different
fire-points, not orthogonal subsystems.

The predicted cut, if one becomes real: deliverables 1, 4, and 5 are **doctrine text** on settled surfaces, while
deliverable 3 is a **pipeline mechanism** with a fire-point, a remedy shape, and a new cut kind. If deliverable 3's
delivery-cut mechanism proves to need its own design, that is the seam — and by this work unit's own maturity gate,
the cut is not yet real, so it holds as one and re-confirms as the draft matures.

Deliberately _not_ absorbed, per deliverable 5 applied to this work unit: all decomposition machinery and mechanics
(`decompose-transform-integrity`), and mint-time properties of cut members such as commitment inheritance and
close-with-launch (`stub-mint-to-launch`). Both are adjacent; neither serves this work unit's stated intent.

## Coordination

Resolved by slug 2026-07-26 — do not trust cached state.

- **`decompose-transform-integrity`** (planned) — the machinery owner, minted from the 2026-07-26 decomposition
  failures. This work unit increases decomposition frequency; that one makes decomposition cheap. Sequencing
  precondition (§ Machinery readiness), not a `Depends On` edge.
- **`stub-mint-to-launch`** (planned) — owns entry-point-agnostic mint semantics for cut members. Should land ahead
  of this doctrine, since every cut this doctrine prescribes mints members through it.
- **`review-chunking`** (shipped) — the chunking mechanism now exists, so doctrine text may reference chunked review
  as real rather than prospective. It raises the reviewability bound without removing it.
- **`solution-proportionality`** (shipped) — delivered `assess-design-proportionality` and the generate-tasks
  fire-point deliverable 3 extends. The shrink-before-split order is now an ordering against shipped behavior.
- **`delivery-native-stack-composition`** (planning) — shares the
  `assess-cohort-fit` touchpoint through its amended-invariant coherency pass, and owns delivery-framing plus
  cut-map versus chunk vocabulary. Coordinate that edit; read the method's current tip and extend it rather than
  re-deriving.
- **`cohort-cut-coherence`** (planned) — adjacent rail on the same two surfaces. Open question below: absorb or keep
  separate.
- **`planning-iteration-mechanics`** (planned) — owns the planning-closeout gate shape; deliverable 2's recorded
  verdict may land as part of its closeout checklist rather than as a freestanding rule.
- **Shipped, no longer pending:** `decomposition-machinery` and `decomposition-hardening`. Their gaps are
  `decompose-transform-integrity`'s, not this work unit's.

## Sequencing

Settled 2026-07-26. Decomposition is operationally critical, so the whole program shipping complete matters more
than any single member shipping early.

**Critical path.** `decompose-transform-integrity` leads — it is the precondition, the longest pole, and the work
currently blocking real cuts. It entered planning 2026-07-26, running parallel to this work unit. Inside it,
**test topology goes first**: nothing else there is verifiable by the tests that missed the original defects, so
every other member depends on it; the rest then parallelize.

**Parallel.** `stub-mint-to-launch` runs alongside the machinery work — different surfaces, one seam to coordinate
(close-with-launch touches the decompose close path). It should still land ahead of this doctrine, since every cut
this doctrine prescribes mints members through it. This work unit's own planning parallelizes with all of the
above; only its **integration** is gated on machinery readiness.

**Deliverable-level gating.** The five deliverables do not share one dependency:

| Deliverable                 | Effect on cut volume | Gated on machinery               |
|-----------------------------|----------------------|----------------------------------|
| 5 — intent over adjacency   | Prevents growth      | No — causes zero cuts            |
| 2 — recorded verdict        | Records a decision   | Essentially no                   |
| 1 — discriminator rebalance | Increases cuts       | Yes                              |
| 4 — stack-vs-coupling test  | Increases cuts       | Yes                              |
| 3 — split reading           | Increases cuts       | Yes, and needs the new mechanism |

Deliverables 5 and 2 could land early and would _reduce_ pressure on the machinery rather than add to it.

**A second candidate cut line.** That gating table cuts prevention (5, 2) from prescription (1, 4, 3), crossing the
doctrine-text-versus-mechanism line recorded in § Recorded cohort-fit verdict. Neither cut is real yet under this
work unit's own maturity gate, so the verdict stands unchanged — but if a cut does become real, the gating line is
the more useful one. Recorded so a later pass does not rediscover it.

**Shared-surface ordering.** `assess-cohort-fit` has three pending editors: this work unit, `cohort-cut-coherence`,
and `delivery-native-stack-composition`. **This one leads** — deliverable 1 changes the discriminator itself, while
the others are an adjacent rail and a delivery-framing/vocabulary pass respectively, and both should land on a
settled discriminator
rather than the reverse. `cohort-cut-coherence` may be absorbed here in any case. Read the method's current tip and
extend it; do not re-derive from an older mental model.

**One fork, not an order.** `planning-iteration-mechanics` owns the planning-closeout gate shape. Either it leads
and deliverable 2's verdict slots into its closeout checklist, or deliverable 2 lands freestanding and that work
unit absorbs it later.

## Unknowns and Assumptions

- **Where the verdict lives** — a draft/spec section versus a meta field; whichever is chosen must survive artifact
  relocation and read naturally at the next grooming pass.
- **How the delivery cut is expressed** — whether it reuses the existing cut-map with a delivery-only disposition, or
  needs its own shape. This is deliverable 3's real open question and the likeliest source of a genuine cut.
- **Bound formulation** — whether independent landability and revertability can be stated crisply enough to act on,
  or whether it degrades into a line-count threshold in practice.
- **Deliverable 5's placement** — the drain-side prompt and the planning-side pass may belong to different owners
  (housekeep routing versus planning closeout) even though they enforce one rule.
- **`cohort-cut-coherence` absorption** — same surfaces, same altitude, both small; folding it in may beat two passes
  over one method.
- **Class:** ratcheted `Light → Heavy` at this rework. The original `Light` assumed composition from settled
  analysis; the design-cut versus delivery-cut distinction and deliverable 3's remedy shape are authored design.
  `Novel` is arguable — one concept is invented while the rest composes.
- **Knowledge-placement check** (per `strategy-knowledge-evolution`): all five deliverables declare at existing
  fire-sites (method body, strategy section, generate-tasks step); no new always-loaded surface, no new doc family.

## Scope Estimate

**Medium.** Two methods, one strategy section, one workflow step, and a routing prompt — package-synced across both
copies. Rules text plus one new mechanism (deliverable 3's delivery cut), which is where the weight sits. The
tripwire's CLI compilation, if any, remains deferred to the procedure-evolution owners.

---
