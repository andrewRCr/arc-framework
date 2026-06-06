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

## Upstream contract — consumed from `class-model-foundation` (shipped)

`class-model-foundation` shipped as the authoritative upstream for this WU — its spec is SAP's `Depends On` and
the recurring design source. It **settled** (amending DEV-RULES.ARC, the meta schema, and a companion ADR to
lock them in) the contracts SAP *consumes*, never re-derives or diverges from:

- **The `Class` model** `{light, heavy, novel}` + `[TBD]`, the two intrinsic axes, the boundary tests, and the
  estimate-then-ratchet — homed in `classify-work-unit` + `strategy-work-organization`.
- **The `planning depth` ordinal** `low / medium / high` — transient, per-stage, never recorded. CMF defined
  *the ordinal and that it resolves per stage*; **how each stage realizes it is SAP's** (an explicit CMF
  Non-Goal).
- **The three spec forms** `brief / outline / detailed`, the depth→form map (`low→brief`, `medium→outline`,
  `high→detailed`), the `Class`↔form constraints (`brief`→always `light`; `detailed`→`heavy`/`novel`; `outline`
  straddles), and that **only `detailed` splits** (PRD / RFC). SAP builds the form *templates*, not the form
  *definitions*.
- **The front-loading-duty sharpening** (now constitutional, all forms): settle all settle-able design upfront;
  `outline` is faster than `detailed` because the design was *more determinate coming in*, not because it
  tolerates more open design. SAP's templates must embody this, never relax it.

CMF also **routed forward to SAP by name** (its Non-Goals): per-stage depth *realization* (the template family
incl. the `detailed`·RFC template, the `create-spec` / `generate-tasks` depth-resolution wiring, the task-list
one-grammar); the **`classify-work-unit` touchpoint wiring** in `arc-plan` / `create-spec` / `generate-tasks`
(CMF wired only `init` / `activate`); and the **`Class`↔spec-form validation hook** as a *candidate to evaluate,
not a committed requirement*.

> The sections below that restate any of the above (§ Spec shapes, the form mapping in § three authoring stages,
> § detailed-spec subtypes) are now **consumed context** — retained as working detail for spec authoring, but
> the SAP spec will reference CMF's spec as the source of record rather than re-derive them.

## The three authoring stages

Each pre-implementation **authoring** stage realizes the depth ordinal in its own units and **self-resolves**
(§ Mechanism). The shapes below are **sketch-level starting points** — their *structural* design is the
pre-spec derivation work (§ Derivation pending); only calibration (exact counts, felt cadence) tunes later via
dogfooding:

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

The universal planning entrypoint must scale across all three depths *today*. **Scope correction:** this is *not*
the "minimal, light-touch addition" originally assumed here — because skills can't compose, it entails extracting
the drafting stage into the **`draft-design`** workflow and thinning `arc-plan` to a dispatcher (§ Pipeline
structure & naming; § Per-stage manifestation → draft-design). The depth-relative piece within that: **make the
drafting stage's readiness bar depth-relative** — its synthesis states
(`fresh → rough → maturing → formalization-ready`) stay, but "formalization-ready" comes to mean *ready at the
chosen depth* (a `low` pass hits it after minimal elicitation; a `high` pass needs full maturity) — plus define
the three planning shapes and the artifact-shape feed-forward. The rich triage / decision-trees stay the
`arc-plan-conductor`'s job (soft coordination, see cohort doc); this WU delivers the lanes and self-resolution,
the conductor adds rich selection and orchestration on top (§ Pipeline structure & naming).

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

- **`Novel` planning-shape realization.** `class-model-foundation` defines `Novel` as primarily a plate-balance
  / sequencing signal and secondarily an advisory planning-shape signal: a discovery / research phase and ADR
  expectation should be available when a WU is inventing concepts or models, not merely composing from existing
  ARC patterns. This WU owns making that available shape concrete in the authoring pipeline (template guidance,
  per-stage depth defaults, and spec-review posture), while preserving the model's "suggest, do not enforce"
  stance — no hard `Class` ↔ spec-form hook. **The least-derived deliverable in the draft today** — the concrete
  shape is pending (§ Derivation pending, item 2).

## Per-stage manifestation (derived)

The general mechanism behind §§ Mechanism and Depth-shifting, made operational. **Per-stage depth is an
*estimate* resolved at stage entry, with an axis-keyed re-entry valve** — the direct mirror of `Class`'s
estimate-then-ratchet. Where a stage's depth keys to the *same* axis that drives `Class` at that stage, **depth
resolution and the `classify-work-unit` touchpoint are one act** (reading the axis to pick depth is also the
confirm-or-ratchet moment).

**The re-entry valve (general, all stages).** A resolved depth is never a one-shot commitment. Any pass may
surface evidence the estimate was too low; the response to a *floor-raising* signal is **capture (durably),
ratchet, re-enter** — never patch-and-limp at an inadequate depth (a wrong-shaped artifact whose surfaced
findings say nothing about the ones a deeper pass would catch). The re-entry target is **axis-keyed**:

- **Scale signal** → re-enter the *same* stage at higher depth (nowhere-up from `high`; there, just resolve).
- **Derivation signal** → route to the stage that owns the design — a masked design decision routes to the
  *spec*, not a deeper task pass (deepening can't fix an under-derived upstream).

The trigger is **not a new detector**: it is a first-class branch at the stage's *existing* interlock stop. When
surfaced volume / severity contradicts the resolved depth, the agent's lean includes "capture, ratchet, re-enter
higher" beside "resolve inline and proceed," with a recommendation — offered, never automatic. The valve fires
only on a genuine underestimate (rare under an honest estimate; the wasted lighter pass was cheap), so it
protects the tail without taxing the common case.

### Task-gen

- **Depth keys to the *scale* axis**, which `Class` alone cannot resolve (it merges the axes — `heavy`/detailed
  small-surface vs. `heavy`/outline large-refactor want opposite task-gen depth) and spec form cannot supply (it
  tracks derivation). So **task-gen self-resolves from a scale read it performs at entry** (the codebase-grounding
  breadth at the current Step 1.1), cross-checked against `Class`. This is the scale-axis resolution of the
  feed-forward hole.
- **Resolution = the touchpoint.** That entry scale read *is* the `classify-work-unit` confirm-or-ratchet for
  task-gen (a decomposition revealing more scale than estimated ratchets `Class` → `heavy`). One step, fired at
  entry, surfaced to the user.
- **Three knobs move with depth:** pass structure (`low` one combined pass → `medium` passes 1+2 merged, audit
  retained-lighter → `high` full 3-pass); grounding-audit depth (inline files/symbols-exist → … → full
  eight-category per-phase); phase count (1 substantive + verification → few → 3–7 + verification).
- **Per-phase audit interlock is invariant *per phase*** — at `low` (one substantive phase) it degenerates to a
  single gate, not a fork. The number of *internal* stops scales (1 at `low`, 3+ at `high`); the
  review-increment invariant is "a gate," not "N gates," so collapse never relaxes discipline.
- **Novel adds no task-gen depth lane** (Novel is derivation-axis; task-gen is scale-driven). Its only reach is
  indirect — novelty may drive scale, which drives depth through the normal path.

### draft-design (drafting stage)

- **Depth keys to the *derivation* axis** (mirror of task-gen's scale-keying). The stage's `classify-work-unit`
  touchpoint is the **first** `Class` determination — `Class` is born here — and resolving the drafting depth
  *is* that touchpoint (reading derivation to pick depth = confirm-or-ratchet `Class`), the same
  resolution=touchpoint collapse as task-gen on the other axis.
- **Never skipped; the `draft-*` file is depth-conditional.** The stage always owns the front of the chain — the
  first `Class` touchpoint and the pre-spec readiness gate ("is the design settled enough to author a spec?") —
  which every WU passes, instantly at `low`. The *artifact* is a medium/high output, not the stage's reason to
  exist. It is the only stage whose artifact is optional (create-spec / generate-tasks always produce theirs),
  which is why this stage alone is named by function, not artifact.
- **Three lanes:** `low` = resolve depth + confirm determinacy → proceed to a `brief` spec, **no draft file**;
  `medium` = bounded single-pass shaping, *maybe* a `draft-*`; `high` = an **iterative shaping loop**, a rich
  `draft-*`.
- **`high` is a *simple* loop.** The conductor's `refine-plan-loop` *enriches* the high lane (bounded batches,
  plan-splitting detection, resume-aware refinement) — it is not a fourth level. SAP ships the simple loop and
  must not build those enrichments.
- **Re-entry valve: re-enter-higher only.** Drafting is stage one, so a floor-raising signal has no upstream to
  route to — the valve runs `low → medium → high`; the ceiling (`high`) hands off to the conductor's expanded
  machinery rather than escalating further within SAP.
- **Novel's home stage.** Unlike task-gen, drafting is where `novel`'s advisory discovery / research phase + ADR
  shape primarily lands (derivation axis), as a depth default — suggest, not enforce.

## Pipeline structure & naming (derived)

**The three stages are peer *workflows*; `arc-plan` is a thin dispatcher.** Skills can't compose — the composable
mechanism (composable-workflows) is workflow-targeted — so depth lanes written into the `arc-plan` *skill* body
would be a composability dead-end and could not deliver this WU's "arc-plan depth-relativity" as composable
whole-blocks. Resolution: extract the drafting stage into the **`draft-design`** workflow (peer to `create-spec` /
`generate-tasks`), and reduce the `arc-plan` skill to a thin trigger that dispatches into it — the established
arc-`*` skill shape (`arc-session` → `session-init`, etc.). This also makes the trio structurally uniform (three
peer workflows), which the "scalable authoring pipeline across all three stages" mandate already implies.

**Two layers, and the `arc-plan` skill is the conductor's seed.**

- *Stage layer:* `draft-design` / `create-spec` / `generate-tasks` — each a workflow with depth-lane whole-blocks
  (root + fragments once composition lands). Durable stage procedures.
- *Orchestration layer:* the `arc-plan` skill. SAP ships it thin (resolve depth → dispatch into `draft-design`).
  `arc-plan-conductor` later **grows the same skill** into the conductor (*"promoting it to conductor extends its
  identity rather than introducing a new mechanism"*), adding rich depth-*selection*, cross-stage orchestration,
  and the enriched loop. So the dispatcher is the conductor's stable base, not throwaway — write its
  depth-resolution as a clean seam the conductor can wrap.

**Economy via composition, not skill-gating.** Pre-composition, each workflow loads whole; its lanes are
whole-blocks. Post-composition, lanes become fragments → resolve-then-load economy, mechanically. The `arc-commit`
pattern (skill gates loading the heavy workflow on the complex path) is the fallback if `low`'s context cost bites
before composition lands, but it is not the design — keep the skill thin and let composition own the economy. SAP
must **not** build the dir-per-workflow package structure (that pulls composition forward); single files,
whole-block-structured, ready to split.

**Naming model + the settled triad.** Stages are named by **function, depth-agnostically**, verb-object, avoiding
derivation-implying verbs (they break at `low` — the `derive-draft` / `design-spec` trap) and sibling-reserved
terms (`decompose` is `decomposition-machinery`'s). Settled triad (the *names*; the number-prefix question is
open — see Numbering below):

- **`draft-design`** — drafting stage. "Draft" (verb) carries the preliminary/not-concrete semantics; "design" is
  the evolving-then-concrete substance the `**Design:**` field tracks (reinforcement, not a clash — that clash was
  only against naming the *spec artifact* a "Design Doc"). Depth-agnostic; artifact-resonant without being literal
  (its `draft-*` file is optional).
- **`create-spec`** — kept. Depth-agnostic (a spec is created at every form), existing vocabulary, anchors the
  form-agnostic reframe.
- **`generate-tasks`** — kept. Depth-agnostic, implies its spec input, avoids the `decompose` collision.

Reads as a coherent maturity progression — *draft the design → create the spec → generate the tasks* — which is
the artifact chain itself.

**Numbering — open, decide before spec.** Two live options for the *planning-stage* prefixes: (a) **drop
entirely** (`draft-design` / `create-spec` / `generate-tasks`); or (b) **renumber the planning trio only**
(`1_draft-design` / `2_create-spec` / `3_generate-tasks`), reading as instructive of the planning-stage order —
the three roots a composed package hangs fragments off, so composition does *not* rule it out (the *root* can
carry the number). The original 1-2-3 defect was scope, not numbering per se: extending it to
`3_process-task-loop` conflated *planning order* with *whole-process order* (execution is far more than one
step). So one thing is settled regardless — **`process-task-loop` loses its number**: it is the execution stage,
a separate concern, not a planning anchor. (a)-vs-(b) stays open until spec.

**Cascade routing.** Whatever the prefix decision, the existing-file rename/renumber cascade — `1_create-spec` /
`2_generate-tasks` / `3_process-task-loop` plus every cross-reference across workflows / strategies / methods /
templates / session-init — routes to **`doc-cascade-sweep`** (the cohort's terminal reference-sweep member,
downstream of this WU), coordinated with `naming-conventions`. SAP names the new drafting workflow `draft-design`
(prefix per the (a)/(b) call) and does not rewrite the existing files itself; half-renaming breaks references,
and reconciling the interim mixed state is the terminal sweep's job.

## Derivation pending (pre-spec-ready)

Re-based on shipped CMF, the draft is **spec-stage-heavy**: the spec stage (form family, naming, PRD / RFC
split) is near-final, but the **drafting (`arc-plan`) and task-gen stages are sketch-level** — their low / med /
high shapes (§ three authoring stages) are a paragraph each. Per the front-loading-duty rule, the *structural*
design of all three stages must be settled here, before spec-ready; only *calibration* (exact question counts,
felt audit cadence) legitimately tunes via post-integration dogfooding. The draft's earlier blanket
"dogfooding-refinable" framing conflates the two — the spec must not smuggle deferred design under it.

Gating items, worked in the planning iteration (sequence: **task-gen → arc-plan → create-spec**):

1. **Per-stage depth manifestation** — concretely, what `low / medium / high` *is* in each stage, written as
   **whole-block variants** (composable-workflows' extract-whole-blocks constraint), not fine-grained inline
   branches. This is the spine: the Novel shape and the wiring placement largely fall out of it.
   **Task-gen + draft-design resolved** (§ Per-stage manifestation; § Pipeline structure & naming);
   `create-spec` pending.
2. **Novel realization shape** — make the advisory discovery / research phase + ADR expectation concrete across
   the three stages' depth defaults, template guidance, and spec-review posture, holding "suggest, not enforce"
   (no hard `Class`↔form hook). The draft's least-derived deliverable today.
3. **`classify-work-unit` touchpoint wiring** — where the method fires in each of `arc-plan` / `create-spec` /
   `generate-tasks`, what it does (confirm-or-ratchet `Class` against the stage's resolved depth), and the
   forward-compat boundary that keeps it light enough not to pre-empt `arc-plan-conductor`.
4. **RFC form** — research and decide what RFC shape fits ARC as a proper complement to the PRD (genuine
   derivation; draws on the captured deep-research idiom pass).

Two design subtleties the manifestation work must resolve, not gloss:

- **The three stages resolve depth from different axes** — drafting and spec from **derivation**, task-gen from
  **scale**. "One mechanism" therefore carries three different *input signals*; the parameterization is not
  symmetric across stages.
- **Flag-free feed-forward has a hole on the scale axis.** Spec form recovers the derivation lane, but scale is
  *not* recoverable from spec form (an `outline` may be `light` or `heavy`), so task-gen must read `Class` (or
  task-list scale) as an explicit input. "The artifact's shape *is* the signal" holds for derivation, not
  cleanly for scale — the seam needs a deliberate design.

## Scope

**In scope:**

1. The spec template family (`template-spec-brief.md` / `-outline.md` / `-detailed-prd/rfc`); the
   `Spec ({form}): {name}` H1; the form-agnostic `create-spec` reframe ("PRD" → "detailed spec"); the
   depth-relative spec-ready bar.
2. Scalable `create-spec` / `generate-tasks` — per-stage depth self-resolution, flag-free feed-forward,
   whole-block depth variants (composable-ready); task-list one-grammar (1..N phases + always-present
   verification); grounding-audit depth parameterization (per-phase interlock retained).
3. **`arc-plan` depth-relativity, via the `draft-design` workflow** — the depth-relative readiness bar, the three
   planning shapes (`high` = simple loop), artifact-shape feed-forward, and the first `classify-work-unit`
   touchpoint. Rich selection / orchestration stays the conductor's (the `arc-plan` skill is its seed).
4. The lifecycle-integration **artifact-presence-tolerance** requirement on the integrate / archive workflows.
   No tier fork.
5. `spec-review` method + ceremony extension — depth-scaled default self-review; opt-in external-cadence
   extension.
6. **`classify-work-unit` touchpoint wiring** — declare + invoke the method at the `draft-design` / `create-spec`
   / `generate-tasks` planning-stage touchpoints (CMF wired only `init` / `activate` and routed these forward).
   Confirm-or-ratchet `Class` against each stage's resolved depth; kept light to stay forward-compatible with
   `arc-plan-conductor`.
7. The **`draft-design` workflow extraction** (`arc-plan` skill → thin dispatcher; drafting becomes a peer
   workflow) and the **authoring-workflow naming convention** (settled triad names; the prefix-numbering decision
   open; existing-file cascade routed out). See § Pipeline structure & naming.

**Out of scope:**

- The `Class` model, boundary tests, meta schema, and ratchet semantics — `class-model-foundation` (consumed
  here).
- The decomposition procedure, grouping taxonomy, and graduation workflow — `decomposition-machinery`.
- The create-new `arc start` wiring and any `--class` override — Concurrent Work Conventions.
- Per-`Class` quality-gate-tier mapping — Quality Gate Tiers.
- The existing-file rename/renumber cascade (`create-spec` / `generate-tasks` / `process-task-loop` plus all
  cross-references) — `doc-cascade-sweep` (coordinated with `naming-conventions`).

## Open questions

> Pre-spec-ready derivation is tracked in § Derivation pending; the items below are finer spec-time calls.

- **`outline` / `brief` spec template *bodies*** — research-grounded; the bodies themselves are authored at
  spec time.
- **Detailed-subtype template structure** — separate `-prd` / `-rfc` templates vs. one flexing template.
- **Per-phase grounding-audit interlock invariance** — lean invariant, not 100%; confirm at spec.
- **Planning + spec + task shapes** — the *structural* shape is pre-spec derivation (§ Derivation pending);
  only calibration is dogfooding-refinable, not a blanket deferral.
- **Planning-stage workflow numbering** — drop prefixes entirely vs. renumber the planning trio
  (`1_draft-design` / `2_create-spec` / `3_generate-tasks`) as instructive anchors; `process-task-loop` loses its
  number either way. Decide before spec. See § Pipeline structure & naming.
- **User-above preference: config knob vs. in-process steer** — deferred; forward-compat binds now.
- **`Class` ↔ spec-form consistency check — worth it at all?** Once this WU makes the spec form a structured
  signal (the `Spec ({form}): {name}` H1 + the template family), a warn-not-block `Class` ↔ form consistency check
  (`heavy` / `novel` ⇒ `detailed`, etc.) becomes cheap to build. `class-model-foundation` deliberately did **not**
  build it (the form was freeform prose there, and the lifecycle `classify-work-unit` touchpoints already keep
  `Class` honest). Open question: does it earn its place *even when easy*? `Class` / depth are advisory signals
  — a misclassification breaks nothing structural, and a commit-time warning may read as a paternalistic nag.
  Decide whether to build it, not just how.

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
