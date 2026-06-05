# Draft: Scalable Authoring Pipeline

- **Origin:** [internal]
- **Cohort:** principle-anchored-core/agile-wu-lifecycle

- **Purpose:** Realize the `Class` model across the three pre-implementation authoring stages — drafting, spec
  creation, task generation — and make lifecycle integration tolerate the lighter artifacts they produce. This
  WU builds the scalable `create-spec` / `generate-tasks` pipeline: a spec template family
  (`brief` / `outline` / `detailed`-PRD/RFC), per-stage **planning depth** self-resolution with flag-free
  feed-forward, the task-list one-grammar, grounding-audit depth parameterization, `arc-plan` depth-relativity,
  and the `spec-review` method + extension. It consumes the `Class` model from `class-model-foundation` and
  turns it from a recorded classification into actual scaled ceremony. The defining constraint: scale the
  *grammar* (template weight, phase count, audit depth) per stage, never the discipline (the gate at every
  increment is invariant).

---

## Problem / Motivation

`class-model-foundation` establishes that ceremony should scale to the work's pre-impl demand and records a
`**Class:**` per WU — but a recorded classification changes nothing until the authoring workflows *act* on it.
Today the universal planning entrypoint and `create-spec` / `generate-tasks` are depth-blind: a `brief`-form WU
still gets the only mode that exists (full facilitation, a full PRD template, a 3-pass task generation),
defeating the lightness the model promises. This WU makes each authoring stage resolve and apply the
appropriate depth, so the model's "wide band for determinate work" becomes real authoring savings rather than a
classification on paper.

The hard design constraint throughout: **parameterize the one invariant procedure by depth; never fork it into
a second skill.** A second "flat" grammar or a `light`-variant skill is a parser fork and an internal-dev
maintenance trap. Depth is a per-context default, never a lock.

## The three authoring stages

Each pre-implementation **authoring** stage realizes the depth ordinal in its own units and **self-resolves**
(§ Mechanism). These shapes are starting points — explicitly open to post-integration dogfooding refinement:

1. **Drafting** (the existing `arc-plan`): `low` = quick determinacy-confirm (a couple of targeted questions);
   `medium` = bounded single-pass elicitation (surface the few real decisions + scope, no iteration); `high` =
   full iterative facilitation (today's `arc-plan`). Driven by **derivation**.
2. **Spec creation** (`1_create-spec`): a template family — the depth level names the form. `low` → `brief` =
   intent + scope boundary + one falsifiable success signal; `medium` → `outline` = decision-centric record;
   `high` → `detailed` = the current full PRD, subtyped PRD / RFC. Driven by **derivation**.
3. **Task generation** (`2_generate-tasks`): pass-structure + phase count, driven by **scale**. `low` = single
   combined pass with inline light grounding, one substantive phase + verification gate-check; `medium` =
   merged structure+content pass with the grounding audit retained, few phases; `high` = full 3-pass
   (structure → content → per-phase grounding audit) + 3–7 phases + dedicated verification phase — forced at
   large scale regardless of spec form (the `heavy`/`outline` refactor).

## Spec shapes (research-grounded)

Refined with the 2026-06-03 deep-research pass on industry idiom for lightweight specs. Research posture:
**inform and adapt, never adopt.** (Full source URLs live in the deep-research transcript — run
`wf_191136b1-518`; pull them when authoring the spec's External Research. Sources nameable even if the
transcript is gone: Shape Up pitch, ADR / Nygard, GitLab handbook, Go proposal, Oxide RFD-0001, Microsoft eng
playbook, Squarespace, Rust RFC.)

What the idiom confirmed:

- **Decision-centric middle: confirmed** (high confidence, 3-0). Shape Up's pitch, the ADR, GitLab's
  lightweight-ADR all *record* settled design + an explicit scope boundary + the one-or-two open items, while
  deliberately *excluding* requirement-ID enumeration and success-criteria matrices. The exclusion is the
  anti-up-drift mechanism; the fixed decision+scope sections are the anti-down-drift. **A full spec *derives* a
  design that didn't exist; the middle *records* one that was mostly determinate.**
- **Floor: convergent** — GitLab "start with one paragraph and evolve"; Go "brief issue… no design document at
  this point." Intent-first, accretes through learning. (Our floor adds *one falsifiable success signal* — a
  P1-driven addition, not industry-converged.)
- **Procedure: async-first and scales with tier** — author-owned PR + bounded comment window (Oxide 3–5 days),
  escalate to sync after ~2 round-trips (Microsoft), committee only for high-blast-radius (Squarespace).
- **Caveats:** several procedure findings are single-company existence-proofs (adapt-from, not norms); ADR's
  "fixed 5 fields" holds only for canonical Nygard; Amazon PR/FAQ went unexamined (the heavy boundary).

The three shapes (concrete, starting points — dogfooding-refinable):

- **`brief` (floor):** ~1 evolving paragraph — intent + scope boundary + one falsifiable success signal. Not
  trivial, not an Errand (intent-verification stays at every level, so a brief is still checkable).
- **`outline` (middle, records):** ~1–2 pages (ADR length norm). Section set adapted from pitch + ADR +
  GitLab-lightweight-ADR: **Problem / Context · settled Decision(s) · Scope boundary (No-gos) · Open items
  (worked out, not deferred) · Consequences / risks** — optionally a bounded **Appetite / effort** line
  (maps onto `Class`). No requirement IDs, no success-criteria matrix. Borrows the ADR's decision-centric
  *form*, but is a *spec* (feeds a task list, validates completion) — distinct from an ARC ADR (a posterity
  record that feeds nothing); do not conflate. Stabilizing principle: structurally different, not "PRD minus
  sections" (drifts up) or "brief plus a bit" (drifts down).
- **`detailed` (ceiling, derives):** the current full spec, subtyped PRD (feature) / RFC (technical) — full
  requirement enumeration + success criteria; derives an open design.

## Spec naming & variants

The on-disk filename stays `spec-{name}.md` (relocatable) at every form. What varies is the template and the
H1 label:

- **Templates:** `template-spec-brief.md` / `template-spec-outline.md` / `template-spec-detailed-*.md`. One
  genre noun — **Spec** (keeps ARC's `spec-*` / create-spec vocabulary; avoids a `Design Doc` ↔
  `**Design:**`-meta-field clash).
- **H1 leads with the artifact type:** `Spec ({form}): {name}` — e.g. `Spec (outline): payment-retry`. Restores
  at-a-glance type legibility; prose uses the natural compound ("the outline spec"). Punctuation is a template
  detail.
- **`PRD` retires as the catch-all term** — replace generic "PRD = any spec" usage with "detailed spec" across
  surfaces (the create-spec form-agnostic reframe). `PROJECT-PRD` is a different artifact (project constitution)
  and is preserved.

## Detailed-spec subtypes (PRD / RFC) — adopted as direction

The `detailed` spec — the one form that *derives* — splits by the existing feature / technical work-category
axis (already classified at create-spec Step 2):

- **feature → `PRD`** (`Spec (detailed · PRD): {name}`) — product requirements; now true to the name.
- **technical → `RFC`** (`Spec (detailed · RFC): {name}`) — technical design; its comment-process heritage
  dovetails with the review-ceremony extension. (Exact label — `RFC` vs `design-doc` vs `technical-spec` — is a
  minor spec-time call.)

Subtypes apply **at `detailed` only** — where derivation makes feature / technical genuinely diverge. `brief`
and `outline` *record* rather than derive, so category-divergence is minimal; they stay single,
category-agnostic shapes (bounding proliferation to four templates, not six). **Open (spec-time):** separate
`-prd` / `-rfc` templates vs. one detailed template that flexes by category — felt-difference test + dogfooding
decide.

## Floors that sit *below* the depth axis (do not scale)

- **Discipline floor** (P2 / P4) — per-commit review-increment + quality gates. Invariant.
- **Spec alignment checks** (`1_create-spec`: PROJECT-PRD principle / Out-of-Scope; TECHNICAL-OVERVIEW drift) —
  **binary on/off, always-on**, cost naturally proportional to spec surface. You cannot "lightly" check
  principle alignment; it is a yes/no gate regardless of spec weight. This cost-scales-but-never-forks pattern
  is the template for integration ceremony too (§ Lifecycle integration).
- **Inline grounding** — even `brief` / task-gen keeps a *minimal* grounding check (named files / symbols
  exist); the generation-time slice of P1 intent-verification, hence floor, never "no grounding."

## Grounding audit: scale by depth, not scope, and keep the per-phase interlock

`arc-task-audit` is **already** per-task / per-phase-scoped at maximum, so *scope* is not a meaningful scaling
parameter. What scales is **depth**: a light grounding-only pass (files / symbols exist) at `low` vs the full
eight-category audit at `high`. Critically, this is the **task-gen stage's depth, keyed to the *scale* axis** —
not inherited from the spec form. A determinate-but-large refactor carries an `outline` spec yet demands a
`high`-depth audit; a tricky-but-small algorithm carries a `detailed` spec yet needs little grounding.

The audit's *interlock cadence* — audit one phase → interlock → take feedback → revise → proceed to the next
phase's audit → interlock — is **leaning invariant** (not 100%; confirm at spec). The candidate scaling (run
all phases, surface everything at the end) risks denying the user the chance to absorb findings and iterate.
So: **parameterize the one invariant procedure by depth — do not fork it.** task-gen invokes it at the stage's
scale-resolved depth; **mid-impl always offers the full variant regardless of `Class`** (a `light` WU can still
hit a tricky task), so depth is the per-context default, never a lock.

## Depth-shifting: asymmetric and input-gated

The user's pick within the band is made **per-stage, re-selectable at each stage transition**. Entry sets a
*default cascade* (derived from `Class`); each authoring stage re-resolves its depth within the band. Two
guardrails:

1. **Down-switching is bounded by the demand floor.** You may choose lighter going *into* a stage, never below
   the forced floor (derivation or scale).
2. **No-demotion, correctly scoped.** Free to choose how much to produce going into a not-yet-started stage;
   may **not tear down** a heavier artifact already produced. The `Class` ratchet is one-way; per-stage depth
   floats within the band.

Concretely:

- **Lighter going *into* an unstarted stage** (within floor): always fine — a rich input over-supports a
  lighter output (a detailed spec but a lighter task list for mechanical impl).
- **Heavier going in:** valid only if the upstream artifact *supports* it. When it doesn't, that *is* a
  **`heavy`-promotion signal** — read *which axis* fired: a need for design notes / alternatives over a thin
  spec is the **derivation** trigger (re-enter the spec, deepen toward `detailed`); a need for a heavy phased,
  deeply-grounded task list over a *determinate* `outline` spec is the **scale** trigger (spec stays `outline`;
  `Class` goes `heavy`; task-gen resolves `high`). Re-enter the stage that owns the gap and deepen it
  additively. You never proceed on under-determined input.

This is **self-diagnosing** on both axes, and both ratchet `Class` to `heavy` one-way. (The `Class` field and
the ratchet semantics are `class-model-foundation`'s; this WU implements the per-stage shift mechanics.)

## Spec-ready & finalized thresholds — one form-invariant bar; the form sets the distance

There is **one spec-ready bar, form-invariant:** *is all settle-able design settled, and can I state how I'll
know it worked?* What varies is the **distance** to it (authoring cost), not the **height**: `brief` reached
fast, `outline` at moderate cost, `detailed` at full cost. Same for the spec → task-gen ("finalized") bar — one
invariant (spec coherent + design settled), with the grounding audit as the residual-catcher routing any
straggler design decision back to the spec (still pre-impl). No form leaves the spec stage with an open design
decision. This makes `arc-plan`'s readiness states depth-relative (§ arc-plan depth-relativity).

## Spec-review procedure — a method (default) + an extension (optional ceremony)

The review *gate* is invariant (a spec-finalization review increment always fires); its *content* and
*cadence* scale and are configurable:

- **`spec-review` method** — always loaded by create-spec; ships a **lightweight default self-review**
  (coherence + grounding pass, depth-scaled: quick at `brief`, fuller at `detailed`), overridable. (May co-home
  with a broader review-method-family rather than this WU owning it outright — settle at spec.)
- **`spec-review`-ceremony extension** — fires at the spec-finalization fire-point, **inactive / empty by
  default**; opt-in to point at a team's procedure (async-PR / comment-window / committee cadences). The
  strategy doc carries those as informative precedent + a mapping, not ARC-enforced.

## Mechanism — per-stage self-resolution, flag-free feed-forward

**Self-resolution over a conductor through-line — confirmed by the code.** The authoring workflows are already
self-contained stage-entries that resolve their own context at entry; per-stage depth resolution is the natural
extension. **Feed-forward is flag-free: the upstream artifact's shape *is* the depth signal** — `generate-tasks`
reads the spec's realized template variant; `create-spec` reads the draft's shape; each then self-resolves
within the ratcheting `Class` floor. No threaded value, no orchestrator state — the resolve-then-load posture.

### `arc start` verb fate + no `--tier` flag

**Scaffolding (`init-work-unit` / `arc start`) is `Class`-agnostic** — it produces a uniform minimal Planning
container and carries no `Class` opinion (decision owned by `class-model-foundation`; this WU honors it).
`Class` is born in the planning stage and lives in the content. Both pipeline orderings stay coherent flag-free
(plan-first: explore → `Class` emerges → init records it; container-first: init scaffolds at default → arc-plan
refines). Three clean roles, no flag: **`arc start` = stub-scaffolding; `arc-plan` = `Class`-determination; the
conductor = depth-direction.** This WU ships the depth resolution inside the authoring workflows — not a CLI
flag. `--class` is dropped. Any eventual create-new `Class` override lives on CWC's create-new command.

### `arc-plan` depth-relativity (touch the existing `arc-plan`, not the future conductor)

The universal planning entrypoint must scale across all three depths *today*. This WU's minimal, light-touch
addition: **make `arc-plan`'s readiness bar depth-relative** — its synthesis states
(`fresh → rough → maturing → formalization-ready`) stay, but "formalization-ready" comes to mean *ready at the
chosen depth* (a `low` pass hits it after minimal elicitation; a `high` pass needs full maturity) — plus define
the three planning shapes and the artifact-shape feed-forward. The rich triage / decision-trees stay the
`arc-plan-conductor`'s job (soft coordination, see cohort doc); this WU is the light-touch enabler.

### `composable-workflows`: forward-compat constraint, no hard dep

`composable-workflows`'s extraction rule ("extract *whole conditional steps / blocks*; keep fine-grained
intra-step branches inline") dictates *how* this WU writes the depth differentiation in `create-spec` /
`generate-tasks`: as **whole-block depth variants** (a `low` task-pass structure vs a `high` one), not
fine-grained "if light, skip this sentence" — so they extract cleanly to fragments when composition lands. The
grounding-audit parameterization is the same shape. A **soft coordination note, not a `Depends On`**
(`composable-workflows`'s only dep, WOR, has shipped).

### User-above preference: config knob vs. in-process steer (OPEN)

Deferred until the mechanical design is known (how depth affects each workflow / skill / hook / CLI surface).
**Decision criterion:** a config knob is warranted *iff* "ceremony preference" resolves to a single coherent
ordinal workflows can consume; if it is a scattered bag of per-surface toggles, steer-per-process is better
until consolidated. **Forward-compat (binds now):** design the scaling mechanism to consume a **resolved**
preference value independent of its source (resolve-then-load); the probe resolves active ceremony preference,
workflows load the matching fragment — making knob-vs-steer a late-binding input decision, not an architectural
fork. If it becomes a knob, its home is the `configuration` cohort's per-developer substrate (soft
coordination, not a hard dep).

## Lifecycle integration — artifact-presence-tolerant

Integration ceremony is **not tier-forked** — it is one invariant procedure whose cost scales naturally with
what was produced.

- **Integration is not a selectable depth.** Unlike the three authoring stages, integration *consumes* what was
  produced rather than *choosing* how much to produce. The planning-depth / spec-form axis does not reach it.
- **Not tier-forked: one invariant procedure, cost-scales.** Weight as *cost*: yes, derivatively (a `light` WU
  has fewer phases / a lighter spec, so the same steps cost less). Weight as a *selected variant*: no — the
  mechanism is **consume-what's-there, never branch-on-`Class`.** A `trivial/standard/full-sweep` selector keyed
  on `Class` would re-introduce the fork the model rejects everywhere.
- **Completion record: meta-appended, self-sizing.** Release Notes (user-facing) + Completion Notes (internal
  narrative) append to the meta; the record **self-sizes by what there is to say** — a `light` mechanical change
  writes two sentences and may omit Release Notes (nothing user-facing → nothing written, a content outcome,
  not a `Class` rule); a `heavy` WU writes paragraphs. Zero forks; absorbs the former "atomic gets just a PR
  description" case.
- **Activate: the spec-presence gate.** What survives is the invariant **spec-alignment gate** — "a spec exists
  at the resolved form" — which cost-scales (near-instant for a `brief`). Planning happens at all levels, so
  there is no "bypass planning" branch.
- **AWL's residue — the single requirement:** integration is **artifact-presence-tolerant, not
  artifact-presence-assuming** — it consumes whatever the resolved depth produced (a `brief` spec, a one-phase
  task list, no separate completion doc) without requiring full-shape artifacts. WOR shipped integration around
  the full shape; this WU's tiering means it must tolerate lighter shapes. One requirement, not a tier-branched
  rewrite.
- **Upstream-settled (not this WU's):** the 4-state machine, sweep-as-you-go, `archive.cadence`,
  per-worktree isolation (all WOR); atomic-tier integration (Errand-owned, shipped via `errand-enablement` +
  `work-routing-discipline`).

## Pressure points and risks

- **`arc start` command surface.** ARC's activation is workflow-based; the create-new `arc start` surface
  (CWC-owned) is a real shift, and every CLI subcommand adds maintenance / docs / discoverability burden.
  Resolution: `arc start` is the workflow's automation for the bounded case; the workflow document stays
  canonical. This WU adds no flag — only the depth resolution the command's content consumes.

## Scope

**In scope:**

1. The spec template family (`template-spec-brief.md` / `-outline.md` / `-detailed-prd/rfc`); the
   `Spec ({form}): {name}` H1; the form-agnostic `create-spec` reframe ("PRD" → "detailed spec"); the
   depth-relative spec-ready bar.
2. Scalable `create-spec` / `generate-tasks` — per-stage depth self-resolution, flag-free feed-forward,
   whole-block depth variants (composable-ready); task-list one-grammar (1..N phases + always-present
   verification); grounding-audit depth parameterization (per-phase interlock retained).
3. `arc-plan` depth-relativity — depth-relative readiness bar; the three planning shapes; artifact-shape
   feed-forward. (Light-touch; rich triage stays the conductor's.)
4. The lifecycle-integration **artifact-presence-tolerance** requirement on the integrate / archive workflows.
   No tier fork.
5. `spec-review` method + ceremony extension — depth-scaled default self-review; opt-in external-cadence
   extension.

**Out of scope:**

- The `Class` model, boundary tests, meta schema, and ratchet semantics — `class-model-foundation` (consumed
  here).
- The decomposition procedure, grouping taxonomy, and graduation workflow — `decomposition-machinery`.
- The create-new `arc start` wiring and any `--class` override — Concurrent Work Conventions.
- Per-`Class` quality-gate-tier mapping — Quality Gate Tiers.

## Open questions

- **`outline` / `brief` spec template *bodies*** — research-grounded; the bodies themselves are authored at
  spec time.
- **Detailed-subtype template structure** — separate `-prd` / `-rfc` templates vs. one flexing template.
- **Per-phase grounding-audit interlock invariance** — lean invariant, not 100%; confirm at spec.
- **Planning + spec + task shapes** — starting points, open to post-integration dogfooding refinement.
- **User-above preference: config knob vs. in-process steer** — deferred; forward-compat binds now.

## External research

- **Lightweight-spec idiom** — completed 2026-06-03 deep-research pass (run `wf_191136b1-518`): cited inline in
  § Spec shapes by source. Pull full source URLs from that transcript when authoring the spec's External
  Research. Sources: Shape Up pitch, ADR / Nygard, GitLab handbook, Go proposal, Oxide RFD-0001, Microsoft eng
  playbook, Squarespace, Rust RFC.

## Scope estimate

**Large.** The spec template family + the scalable authoring pipeline across two workflows + the grounding-audit
parameterization + `arc-plan` depth-relativity + the integration-tolerance requirement. Internally phased
(templates → wiring); the feed-forward coupling keeps it one WU per the decomposition upper rail.
*Depends on: `class-model-foundation`.* Runs in parallel with `decomposition-machinery`.

---
