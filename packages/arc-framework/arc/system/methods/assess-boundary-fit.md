---
name: assess-boundary-fit
description: WU boundary test — keep one concern whole, decompose orthogonal concerns, or plan separate delivery
override-active: false
---

# Method: assess-boundary-fit

> - **Workflow:** [draft-design.md][draft-design], [create-spec.md][create-spec]
> - **When:** A work unit's design is the live artifact at each planning evidence read — `draft-design` (the
>   _predicted_ arm), `create-spec` (the _emergent_ arm), and `generate-tasks` Pass 1 (the first concrete task-scale
>   evidence). This is a cheap confirm at every fire-point and is **not** planning-depth-gated. The depth/re-entry
>   valve routes scale and derivation gaps only; concern multiplicity is a third axis, so task-generation discovery
>   must be assessed here rather than treated as free upstream coverage. From implementation onward, delivery entry
>   is operator-invoked rather than another automatic planning pass.
>
> - **Contract:** Given the latest planning authority and its current boundary evidence, return exactly one outcome:
>   **"stays one WU"**, a **cut-map**, or **"stays one WU + delivery-plan candidate"**. Orthogonality decides
>   concern count; sizing and deliverable multiplicity prompt the read and distinguish delivery topology, but raw
>   size never decides a cut. `decompose-work-unit` consumes the cut-map; slice-aware authoring consumes the delivery
>   candidate. This method _decides_ only — it neither restructures nor publishes or binds delivery state. The full
>   model lives in [strategy-work-organization][work-org] § Cohorts; this is the single boundary-decision home paired
>   with [classify-work-unit][classify-work-unit] (the lower-bound Errand-vs-WU test).

## assess-boundary-fit.override

[No override configured]

## assess-boundary-fit.default

The upper-bound boundary test — the mirror of `classify-work-unit`'s lower-bound Errand-vs-WU test. Where that
method asks "is this big enough to warrant a WU?", this one asks whether the concern remains one WU and, if it
does, whether its delivery surfaces deserve an authored plan. Apply the discriminator against the two guard rails,
gated on design maturity, and return one of the three outcomes below.

### Outcomes

1. **stays one WU** — one cohesive concern with no material separable-delivery signal. This is the default and is
   advisory-silent on borderline evidence.
2. **cut-map** — orthogonal concerns whose pieces are independently deliverable, ownable, and WU-worthy. Return the
   complete author-owned cut-map below; `decompose-work-unit` owns the transform.
3. **stays one WU + delivery-plan candidate** — one cohesive concern whose distinct deliverables or independently
   reviewable surfaces warrant slice-aware authoring without changing the concern boundary.

Treat a selected outcome as decided planning judgment. The caller records the outcome and evidence basis in the
existing draft or spec decision prose. At later fire-points, compare evidence semantically and re-raise only for a
material new-evidence delta — never for mere invocation, elapsed time, or restatement. A recorded hold-whole decision
suppresses repeat advice, and a bound delivery plan suppresses redundant downstream advice. The prose record is not a
CLI input, fingerprint, schema, or new authority record.

### The discriminator — orthogonality, not size

Decompose on **design/subsystem orthogonality + independent deliverability/ownership** — _concern multiplicity_,
not raw size. A concern spanning several orthogonal subsystems, each independently deliverable and ownable, is a
cohort; one coherent concern designed as a whole is one WU, however large.

**Size is a heads-up, never the trigger.** Review defect-detection craters past a few hundred LOC per increment,
but ARC already reviews per task at that grain, so the PR-size argument is largely absorbed. Large size matters
only when it spans _unrelated_ subsystems (≈800–1000 LOC across orthogonal systems is a decompose signal);
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
  review surfaces in one WU says _look closer_.
- **LOC and file count are secondary heads-up signals, not thresholds:** roughly `>~few-hundred LOC`,
  `>~8–10 files`, or work that fails the "reviewable in one sitting" test says _look closer_, never _cut here_.
- **Stack vs. cohort:** a **stack** orders deliverables by dependency; a **cohort** groups sibling WUs. A cohort may
  order its members, and one WU's delivery plan may order several deliverables — delivery topology does not decide
  the concern boundary.

The mental model is **cohort ≈ epic, WU ≈ story** — this method fills the codified
concern → WU-count mapping.

### When it fires affirmative — self-contained WUs

When a concern exceeds one WU it becomes multiple self-contained, single-owner WUs — each its own
`meta-* + spec-* + tasks-*` and one branch — not one large WU sliced into smaller pieces. The placement decision
determines whether those WUs share a cohort node or remain flat siblings.

**Plan-grouping ≠ delivery-grouping.** One concern **plans** as a single coherent draft but **delivers** as a
stack of WUs along natural deliverable/phase boundaries. At decomposition the one draft becomes **N
self-contained WU specs + cross-WU coordination** in `cohort-{name}.md`.

### Member-slug naming

When the cut produces members, **their slugs must read legibly out of context.** Dependency edges
(`**Depends On:**`) carry bare WU-names with no cohort path, so a downstream WU reads `Depends On: <slug>` cold:
`model-foundation` is opaque, `class-model-foundation` self-describes. Naming is part of the cut, not an
afterthought. **Never encode order in the slug** — no `-pt1` / `-pt2` ordinals (they fabricate sequencing and
aren't self-describing); inter-member order, when it exists, lives in `Depends On`.

### Output

The method produces exactly one of **"stays one WU"**, the author-owned half of the v3 cut-map, or
**"stays one WU + delivery-plan candidate"**. For a cut-map, the CLI supplies the immutable source units and
dependency edges; complete only these authoring decisions:

- **shape** — `symmetric`, `heterogeneous`, or `extraction`;
- **placement** — `direct-member`, `cohort`, `subcohort`, or `at-cap`;
- **destinations** — each exact `new-member`, `existing-home`, or `cohort-coordination` target;
- **source allocations** — one destination and locator, one `retained-origin` disposition, or one reasoned drop,
  for every reported source unit;
- **dependency dispositions** — one replacement, target set, or reasoned drop for every reported edge;
- **internal dependency edges** — authored from the cut's delivery order.

When the concern stays cohesive but the sizing read finds material distinct deliverables or independently reviewable
surfaces, return **"stays one WU + delivery-plan candidate"**. This is a first-class planning outcome, not an advisory
nested under "stays one WU". It is never a gate and authorizes no publication, binding, or external mutation.

`direct-member` is the placement for exactly one newly minted member. Every decomposition with more than one new
member must select `cohort`, `subcohort`, or `at-cap`, regardless of content ownership. Existing or atomic homes
remain `existing-home` destinations, not members. Ownerless shared coordination independently requires a
cohort-backed placement and a `cohort-coordination` destination.

Extraction is the supported surviving-origin arm for a started `Planning` or `Active` source. It is entered through
its own command mode, and the core retirement transform remains unchanged. A retirement cut-map transfers every
source unit into declared destinations or reasoned drops and retires the origin. An extraction cut-map may instead
keep units under `retained-origin`; the surviving origin is their owner and logical anchor, not another destination.

Producing the cut-map ends this method's job — it _decides_, it never executes the cut. `decompose-work-unit`
consumes the cut-map and runs the transform.

---

[classify-work-unit]: classify-work-unit.md
[draft-design]: ../workflows/arc/draft-design.md
[create-spec]: ../workflows/arc/create-spec.md
[work-org]: ../../reference/strategies/arc/strategy-work-organization.md
