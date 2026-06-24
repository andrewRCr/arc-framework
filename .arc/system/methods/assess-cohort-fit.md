---
name: assess-cohort-fit
description: Upper-bound WU-vs-cohort boundary test — decompose a concern into a cohort, or keep it one work unit
override-active: false
---

# Method: assess-cohort-fit

> - **Workflow:** [draft-design.md][draft-design], [create-spec.md][create-spec]
> - **When:** A work unit's design is the live artifact at a derivation stage — `draft-design` (the *predicted*
>   arm, design still forming) and `create-spec` (the *emergent* arm, a matured draft). A cheap confirm at every
>   design-stage read, **not** depth-gated: decompose-candidacy keys on orthogonality/breadth, a different axis
>   than derivation depth, so gating behind `high` depth would miss low-derivation-but-wide cohorts.
>   `generate-tasks` coverage is free — a "this should be multiple WUs" discovery there is a derivation-class
>   signal `resolve-planning-depth`'s re-entry valve already routes upstream to these design stages.
>
> - **Contract:** Given a work unit whose design is maturing, return either **"stays one WU"** or a **cut-map** —
>   the members (with slugs), their internal dependency edges, and deliverable boundaries — by testing
>   design/subsystem orthogonality (not raw size) against the two guard rails and the design-maturity gate.
>   `decompose-work-unit` consumes the cut-map to execute the transform; this method *decides*, it never
>   restructures. The full model and reasoning live in [strategy-work-organization][work-org] § Cohorts; this
>   method is the
>   single decide home every design stage declares, paired sibling of [classify-work-unit][classify-work-unit]
>   (the lower-bound Errand-vs-WU test).

## assess-cohort-fit.override

[No override configured]

## assess-cohort-fit.default

The upper-bound boundary test — the mirror of `classify-work-unit`'s lower-bound Errand-vs-WU test. Where that
method asks "is this big enough to warrant a WU?", this one asks "is this too big to be **one** WU?" Apply the
discriminator against the two guard rails, gated on design maturity; when it fires affirmative, produce the
cut-map.

### The discriminator — orthogonality, not size

Decompose on **design/subsystem orthogonality + independent deliverability/ownership** — *concern multiplicity*,
not raw size. A concern spanning several orthogonal subsystems, each independently deliverable and ownable, is a
cohort; one coherent concern designed as a whole is one WU, however large.

**Size is a heads-up, never the trigger.** Review defect-detection craters past a few hundred LOC per increment,
but ARC already reviews per task at that grain, so the PR-size argument is largely absorbed. Large size matters
only when it spans *unrelated* subsystems (≈800–1000 LOC across orthogonal systems is a decompose signal);
tightly-coupled work designed as a whole stays one WU even when large — the per-task review grain carries the
quality — and splits later only if it destabilizes. **Concern multiplicity is the trigger; LOC is a heads-up.**

### Two guard rails

Both rails ship because a given author's bias presses on only one of them:

- **Lower rail — don't split below WU-warrant.** Decompose only until each piece independently warrants a WU (the
  Errand-vs-WU threshold `classify-work-unit` guards). A piece too small to stand alone is a **phase of a
  sibling** or an **Errand**, never a peer WU. ("Making a 3-task piece its own WU feels silly" is this rail
  firing.)
- **Upper rail — don't split coupled one-design work for size alone.** Over-decomposition is a real failure mode
  (the premature-microservices trap: chatty cross-WU coordination, multiplied onboarding cost). Coupled work
  designed as a whole stays one WU.

### Timing — gated on design maturity

Decompose when the design is **stable enough that the cuts are real**, not before. Speculative design → hold as
one unit and iterate; settled design → decompose. **The cut is firm at the maturity gate:** once decomposed at
maturity, the cut itself — members, dependency edges, deliverables, slugs — is settled. If it isn't, you
decomposed too early, which the gate prevents. What stays open is **not the cut** but each member's ordinary
spec-time openness — internal sizing/phase shape, and the universal possibility a member later recurses into a
sub-cohort — identical to any backlog stub's openness, not a special provisionality of decomposition output.

### Sizing heuristics — sensing oversize ahead

Size doesn't trigger the cut, but it is the symptom that prompts the question. Apply the WU-sizing standard this
method consumes ([strategy-work-organization][work-org] § WU sizing standard) — not re-authored here:

- **Count distinct deliverables and independently-reviewable surfaces** — the primary signal. Several unrelated
  review surfaces in one WU says *look closer*.
- **LOC and file count are secondary heads-up signals, not thresholds:** roughly `>~few-hundred LOC`,
  `>~8–10 files`, or work that fails the "reviewable in one sitting" test says *look closer*, never *cut here*.
- **Stack vs. cohort:** sequentially-dependent pieces deliver as a **stack** (dependency-ordered WUs, each its
  own branch, merged in order); independent-ish pieces form a **cohort** of parallel WUs. A stack is a cohort's
  dependency-ordered delivery mode, not one WU spread across many branches.

The mental model is **cohort ≈ epic, WU ≈ story** — this method fills the codified
concern → WU-count mapping.

### When it fires affirmative — a cohort of self-contained WUs

When a concern exceeds one WU it becomes a **cohort of self-contained, single-owner WUs** — each its own
`meta-* + spec-* + tasks-*` and one branch — not one large WU sliced into smaller pieces.

**Plan-grouping ≠ delivery-grouping.** One concern **plans** as a single coherent draft but **delivers** as a
stack of WUs along natural deliverable/phase boundaries. At decomposition the one draft becomes **N
self-contained WU specs + cross-WU coordination** in `cohort-{name}.md`.

### Member-slug naming

When the cut produces members, **their slugs must read legibly out of context.** Dependency edges
(`**Depends On:**`) carry bare WU-names with no cohort path, so a downstream WU reads `Depends On: <slug>` cold:
`model-foundation` is opaque, `class-model-foundation` self-describes. Naming is part of the cut, not an
afterthought. **Never encode order in the slug** — no `-pt1` / `-pt2` ordinals (they fabricate sequencing and
aren't self-describing); inter-member order, when it exists, lives in `Depends On`.

### Output — the cut-map

The method produces either **"stays one WU"** or the **cut-map**:

- **members** — each with its legible slug;
- **internal dependency edges** — `m_i → m_j`, authored from the cut's delivery order;
- **deliverable boundaries** — what each member independently ships.

**Entry kinds.** A cut-map entry defaults to a **new member** (a freshly-minted WU, above). Two further kinds
cover the non-symmetric transform shapes — a data-shape the cut-map carries, while *when* to use them stays this
method's judgment:

- **surviving-origin** — names the *retained* origin as an entry (the extraction shape), carrying its disposition
  (`keep-active` / `park`); the origin survives the cut rather than retiring.
- **existing/atomic-home** — names an *existing or atomic destination* (the heterogeneous shape): a sibling stub, a
  `draft-design` block, or an in-place atomic edit to a standing doc, rather than a new member.

Producing the cut-map ends this method's job — it *decides*, it never executes the cut. `decompose-work-unit`
consumes the cut-map and runs the transform.

---

[classify-work-unit]: classify-work-unit.md
[draft-design]: ../workflows/arc/draft-design.md
[create-spec]: ../workflows/arc/create-spec.md
[work-org]: ../../reference/strategies/arc/strategy-work-organization.md
