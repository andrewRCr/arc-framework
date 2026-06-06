# ADR-023: Adopt the Class Model for Scaled Ceremony with Invariant Discipline

## Status

Proposed.

The Class model is decided here — a three-value weight (`light` / `heavy` / `novel`) — and its constitutional core
ships with Class Model Foundation — the DEV-RULES.ARC rule, the AGENT-BRIEF vocabulary, the `classify-work-unit`
triage method, the meta `Class` schema, and the model's elaboration in `strategy-work-organization`. The remaining
realization — the three spec forms' templates and the per-stage planning-depth grammar — is owned downstream by
`scalable-authoring-pipeline`, and the cohort / `Cohort`-record semantics by `decomposition-machinery`.
Promote to Accepted when those ratify the spec-form and cohort pieces.

## Context

[ADR-020][adr-020] committed ARC to a *principle-anchored scalable core*: a fixed floor of non-negotiable
discipline with a scalable convention layer above it, resolved-then-loaded per work unit. [ADR-021][adr-021]
set the lower bound of that scale — the **Errand**, work fully consumed in one review increment, below the
work-unit wrapper. What neither pinned down was the *gradation within the work-unit band itself*: how much
design a WU demands, how that maps to artifact shape, and how an author or agent decides — repeatably — where
a given WU sits. The placeholder was an informal tier vocabulary (`atomic / quick / standard`) that ADR-020 §3
and `template-meta.md` referenced but never defined as a model; "atomic-tier" in particular re-tangled the
*character* (single concern) with a *weight rung* — the exact conflation [ADR-019][adr-019] separated.

Leaving this fuzzy has concrete costs:

- **No repeatable triage.** "Is this a big WU or a small one?" was answered by feel, so artifact weight drifted
  with author mood rather than the work's actual demand.
- **No recorded signal.** Nothing on the meta carried a WU's weight, so the start / balance decision (which
  ready WU to pick up, what is already in flight) had nothing objective to read.
- **A latent risk of the wrong fix.** The intuitive reading of "scale the ceremony" is "make discipline
  optional for small work" — precisely the *Required-vs-Available* framing ARC has already rejected. Any weight
  model must foreclose that reading explicitly.

Underneath, two distinct *floors* were being conflated, and separating them is what makes the model tractable:

- **Discipline floor** ([ADR-001][adr-001] P2 / P4) — universal, sits *below* the wrapper, never scales. Every
  increment of change — a WU task, an Errand commit, a loose commit — closes with a review-increment gate and
  passes its quality gates. The floor of discipline is the smallest *commit*, not the smallest WU.
- **Wrapper floor** — the smallest thing that is a WU at all. Over a bare disciplined commit, a WU adds exactly
  two things: an *authored spec* (P1) and a *tracked lifecycle* (P7). The defining trait is **spec-worthiness**
  — work that is more than a single logical concern; tracking is a *consequence* of that, never an independent
  cause.

### Alternatives considered

- **Keep the informal tier vocabulary (`atomic / quick / standard`).** Rejected — never defined as a model,
  gives no triage, and "atomic-tier" re-couples character to a weight rung.
- **A single "complexity" scalar.** Rejected — collapses two genuinely independent demands (design-authoring
  vs. codebase-grounding) that load *different* authoring stages and decorrelate; a determinate-but-large
  refactor and a small-but-novel design are both heavy for opposite reasons.
- **An open continuum of ceremony.** Rejected for agent-loadability — resolve-then-load needs *discrete,
  loadable* resolutions; you cannot load a fragment against a continuum.
- **A `Class` driven by two intrinsic axes, with a `novel` top tier (chosen).** A recorded `light` / `heavy` /
  `novel` weight, each value felt-distinct in rigor, speed, *or sequencing*, with a per-stage planning-depth
  ordinal and three discrete spec forms. The third tier was added pre-close after the model's first dogfood
  exposed a flat, signal-poor top of the `heavy` band (see § Decision — the top tier); a `heavy` sub-marker and a
  view-only gauge were the considered-and-rejected alternatives to a third recorded value.

## Decision

We will adopt the **Class model** as ARC's account of work-unit weight, and state its one non-negotiable —
*ceremony scales, discipline does not* — as a constitutional rule, parallel in scope to [ADR-016][adr-016]'s
interlock downgrade.

**`Class`.** Every work unit carries a recorded `Class` — `light`, `heavy`, or `novel` (`[TBD]` until resolved).
`Class` is the work's *weight*: how much design must be authored, and the review / integration ceremony that
weight warrants. It is *driven* by two intrinsic axes alone and *indicates* demand across every phase — never raw
output volume or author preference.

**The two axes.** `Class` is `heavy` iff *either* axis runs high:

- **Derivation** — how much design must be *authored* versus read off determinate inputs. `derived work`
  (settling requires authoring a real design — concerns, alternatives, tradeoffs that do not exist until worked
  out) is always `heavy`; `determinate work` (design determinate from existing inputs; the spec *records* it)
  is `light` unless scale promotes it. Derivation also tracks execution novelty and review rigor. Only
  *spec-worthy* design counts (the floor): a choice resolved during implementation is not derivation.
- **Scale / complexity** — how large or intricate an existing-code surface a correct plan *and execution* must
  navigate. Co-equal: a determinate-but-large refactor is `heavy` by grounding demand alone.

The axes load *different* authoring stages (derivation → drafting + spec; scale → task generation) and
therefore decorrelate — the model must not collapse them into one bucket.

**The top tier — `novel`.** A second threshold on the derivation axis *alone* promotes `heavy → novel`: when
settling the design requires *inventing* concepts or models that do not yet exist in the problem domain
(synthesis, research, discovery), versus *composing* a real design from existing patterns. It is derivation-only
because the axes are asymmetric — **scale is endurance** (chunkable, parallelizable, self-limiting via
decomposition, so it caps at `heavy`); **derivation is depth** (serial, context-saturating, unbounded, so only it
reaches the top). `novel` is a distinct *kind*, not just more weight: its recorded purpose is **primarily** the
parallelism / sequencing balance signal (one holds ~one genuinely-novel stream — the strongest "don't double up"),
**secondarily** an advisory distinct planning shape (a discovery / research phase + an ADR), never forced. The
tier was added pre-close after the model's first dogfood — best-estimate `Class` across 42 backlog WUs — exposed a
flat, signal-poor top of the `heavy` band (an order-of-magnitude span, from compose-a-scheme to invent-a-model,
both reading a flat `heavy`). It is **additive**: it reclassifies a subset of heavies upward, disturbing no
`light` value and not the `light`/`heavy` boundary. A re-triage of the derivation-bearing heavies confirmed a
recognizable minority — the bar is recognizability, not crispness, the fuzzy invent-vs-compose border being cheap
because the consequence is advisory.

**The boundary tests** (crisp, recognizable in retrospect):

1. **Errand vs. WU** (ADR-021): *does this need more than a single logical concern — more than one review
   increment — to do well?* No → Errand; yes → WU.
2. **Derivation trigger** (→ `heavy`): *must a real design be authored before a competent engineer can start?*
   Count only spec-worthy design (the floor).
3. **Scale trigger** (→ `heavy`): *does a correct plan require a substantial codebase-grounding pass beyond the
   routine floor?* Guard the bar at *substantial* — most WUs carry some grounding; a soft bar makes everything
   `heavy`.
4. **Invent-vs-compose trigger** (`heavy → novel`): *does settling the design require inventing concepts / models
   the domain does not yet have, versus composing from existing patterns?* Invent → `novel`; compose → `heavy`.
   Derivation only.

`light` iff both `heavy`-triggers are no; `novel` iff derivation fires at the invent threshold.

**Planning depth and spec forms.** Each authoring stage resolves a transient, per-stage `planning depth`
(`low` / `medium` / `high`) from the axis that loads it — never recorded, may vary across stages. Only the spec
stage's depth names a durable artifact: the three **spec forms** `brief` / `outline` / `detailed`
(`low` → `brief`, `medium` → `outline`, `high` → `detailed`). `brief` is always `light`; `detailed` always
`heavy` or `novel` (derivation forces it; the invent threshold separates the two, which share the form);
`outline` is either `light` or `heavy`. `detailed` splits by work category into PRD (feature) / RFC (technical);
the lighter forms do not split. The grammar that realizes the forms is
`scalable-authoring-pipeline`'s; this decision fixes the ordinal and the form set.

**Topology — fixed floor → scalable middle → fixed ceiling.** Preference operates only in the band between the
demand-set floor and a fixed ceiling. Band width *shrinks as pre-impl demand rises* along either axis: an
Errand's floor = ceiling (band zero); low-demand work has a wide band (`brief` ↔ `outline`); a PRD-worth of
derivation or a large grounding surface pushes the floor to the ceiling (band ≈ zero). Both endpoints are fixed
for the same reason — degenerate bands — and only the middle scales.

**The invariant.** What is *identical at every position* is execution **discipline** — the review-increment
gate, the always-stop interlocks, and the quality gates — and the principle floor (a spec in some form; a task
list when multi-increment; intent-verification against the spec). `Class` moves only the *convention* layer
(spec template weight, phase count, audit / iteration passes). The same full-strength workflows, grounding
audit, review, and gates apply at every depth — *parameterized by depth, never forked*. This forecloses the
rejected Required-vs-Available framing: scaled ceremony is **not** license to make discipline optional.

**Estimate-then-ratchet.** `Class` is declared as early as planned-entry and re-tuned at each lifecycle
touchpoint. The ratchet protects *realized* design-authoring: once a stage has authored design at some depth,
`Class` never drops below that floor; an *estimate* set before that work exists is freely revisable in both
directions. Correcting a too-high estimate down is not a demotion — no work is discarded — which removes the
incentive to lowball (estimating `heavy` costs nothing if planning reveals `light`). `[TBD]` is the
pre-estimate sentinel, legal in `provisional/` but not `planned/`.

**Atomic reconciliation.** "Atomic" reverts to a pure work *character* (a single logical concern); it is not a
`Class` value and not a tier. Atomic-character work runs as an Errand below the wrapper (ADR-021) or graduates
to a WU. ADR-020 §3's spec-in-commit "floor exception" migrates out of the tier model into the Errand class,
reconciling the ADR-020 ↔ ADR-021 tension.

**Document tiering (where the model lives).** The always-loaded surface carries only the minimum: DEV-RULES.ARC
states the *ceremony-scales-discipline-doesn't* rule plus a pointer; AGENT-BRIEF.ARC introduces the vocabulary.
The boundary-test triage and the ratchet are packaged as the loadable `classify-work-unit` method; the model
elaboration and worked examples live in `strategy-work-organization`; the meta `Class` field is schema-owned
per [ADR-022][adr-022]; and the architectural reasoning — this Context and Decision — is this ADR's, its sole
home.

## Consequences

### Positive

- **Repeatable triage.** Three crisp boundary tests replace feel; the same questions yield the same `Class`
  across authors and sessions.
- **An objective, recorded signal.** The meta `Class` field gives the start / balance decision (and parallelism
  planning) something real to read — weight, not guesswork.
- **Two decorrelated axes captured honestly.** A large determinate refactor and a small novel design are each
  `heavy` for their own reason, instead of being forced through one "complexity" scalar that fits neither.
- **The top of the range carries signal.** `novel` distinguishes from-scratch invention from heavy composition —
  a balance / sequencing signal the flat `heavy` ceiling lost, on the dimension that most saturates parallel
  capacity.
- **The invariant is explicit.** "Ceremony scales, discipline does not" is stated as a rule, closing the door
  on the Required-vs-Available misreading.
- **Lean always-loaded surface.** Document tiering keeps DEV-RULES / AGENT-BRIEF minimal; depth lives on-demand
  in the method and strategy, the reasoning in this ADR.

### Negative

- **A second classification axis to learn.** Actors must distinguish `Class` (WU weight) from the quality-gate
  `Tier` and from the Errand / WU wrapper line; mitigated by the boundary tests and the AGENT-BRIEF vocabulary.
- **`Class` is not perfectly inferable from spec form** (the `outline` straddle), which is *why* it is recorded
  explicitly rather than derived — a small redundancy accepted for a reliable signal.
- **A fuzzy invent-vs-compose border.** The `heavy → novel` cut is a magnitude judgment within "derivation
  fired," so it reads less crisply than the fired-or-not lines. Accepted because the consequence is advisory (a
  misread nudges a suggestion; the ratchet corrects it) and validated against recognizability, not crispness.
- **Partial realization at decision time.** The spec-form templates and per-stage depth grammar are downstream
  (`scalable-authoring-pipeline`); the model is usable here but its authoring surface lands later — hence
  Proposed.

### Risks

- **`Class` drift via under-specification** — defaulting to `light` to dodge `detailed`-spec ceremony.
  Mitigations: the estimate-vs-realized ratchet removes the *incentive* (a too-high estimate is freely
  correctable down, so an honest estimate costs nothing); the self-diagnosing depth-shift signal (a heavy
  downstream artifact over a minimal spec *is* the floor-was-too-low signal); the explicit `**Class:**` field
  invites reviewer push-back; and strategy-doc examples on each side of the derivation line and scale trigger.
- **Light-WU discoverability** — short-lived `light` WUs could make active-WU enumeration noisy. Mitigation:
  the `STATUS.USER` `Class` render carries the in-flight light / heavy composition; completed-but-unswept WUs
  auto-clean. Less acute than the retired atomic-tier version, since atomic-character work is now an Errand, not
  a WU.
- **Premature ratification.** Status stays Proposed until `scalable-authoring-pipeline` validates the spec-form
  grammar and `decomposition-machinery` the cohort semantics; the model can be exercised before that, but the
  downstream pieces are not binding until they land.

## Amending This Document

<!-- Reserved for post-implementation learnings per the three-tier amendment model
     (strategy-adr-methodology.md). Append dated annotations as `**Amendment (YYYY-MM-DD):** …`. -->

---

[adr-001]: adr-001-define-core-identity-and-principle-method-boundary.md
[adr-016]: adr-016-configurable-autonomy-interlocks-for-session-operations.md
[adr-019]: adr-019-work-unit-lifecycle-reform.md
[adr-020]: adr-020-adopt-principle-anchored-scalable-core.md
[adr-021]: adr-021-introduce-errand-work-class.md
[adr-022]: adr-022-managed-operational-state-documents.md
