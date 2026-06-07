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
category-agnostic shapes (bounding proliferation to four templates, not six). **Deferred to the dedicated
RFC / PRD session (rides item 4):** separate `-prd` / `-rfc` templates vs. one detailed template that flexes by
category. This cannot resolve until the RFC shape is derived — whether RFC and PRD share a template structure is
downstream of knowing the RFC form — so it rides the same pass that derives RFC and realigns PRD.

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
*cadence* scale and are configurable.

**Scaling model — the method inherits the form, never re-resolves.** spec-review fires *at* create-spec, which is
derivation-keyed, so its depth is simply the **just-crystallized spec form** — a fourth instance of the
"depth *is* the form" collapse (§ create-spec), not an independent resolution. `brief` → quick, `outline` →
moderate, `detailed` → full. The *gate* is the invariant floor: a review increment always fires, collapsing at
`brief` to a single minimal check (coherence + falsifiable success signal + named-things-exist), the same way the
per-phase audit interlock collapses to one gate at `low`. Non-empty floor, never zero. Keep its grounding slice
**distinct from task-gen's audit**: spec-review's is the light coherence-grounding pass at spec-finalization
(form-keyed); `arc-task-audit` is the deep per-phase audit at task-gen (scale-keyed) — different checks, stages,
and axes.

- **`spec-review` method** — always loaded by create-spec; ships a **lightweight default self-review**
  (coherence + grounding pass, form-scaled per above), overridable. **SAP owns it outright** — it is intrinsically
  coupled to the spec-form family this WU builds (the scaling keys to the form), so it cannot cleanly home
  elsewhere yet. Written as a clean standalone method; a future review-method-family, if it ever materializes,
  *absorbs* it (extend identity, don't fork — the `arc-plan` → conductor move), not a hard dep now.
- **`spec-review`-ceremony extension** — fires at the spec-finalization fire-point, **inactive / empty by
  default**; opt-in to point at a team's procedure (async-PR / comment-window / committee cadences). The
  strategy doc carries those as informative precedent + a mapping, not ARC-enforced.

## Mechanism — per-stage entry-assessment, flag-free by construction

**Self-resolution over a conductor through-line — confirmed by the code.** The authoring workflows are already
self-contained stage-entries that resolve their own context at entry; per-stage depth resolution is the natural
extension.

**Each stage performs one entry-assessment: a read of its keyed axis against the best available evidence.** The
upstream artifact, when present, is the *richest input* to that read — never a separate "feed-forward" mechanism
that a fallback substitutes for. This is forced, not a convenience: CMF makes `planning depth` **transient,
per-stage, never recorded** (only the spec stage's depth names a durable artifact — the form), so there is no
recorded depth to thread and each stage *must* re-derive from evidence every time. "Flag-free feed-forward" is
therefore just this — no threaded depth value, because the entry-assessment re-derives, so nothing needs
threading. Feed-forward and the axis-read are **one act**, the read consuming a high-quality input. No orchestrator
state; the resolve-then-load posture.

The three stages share that one shape and differ only in **which axis** they read and **what evidence is present**:

- **draft-design (derivation, stage 1):** no upstream. Evidence = the problem framing / origin + a quick
  compose-vs-invent scan over existing ARC patterns — the opening move of the elicitation itself, not a new
  detector. Doubles as the first `classify-work-unit` touchpoint (Class is born here).
- **create-spec (derivation):** evidence = the `draft-*` *when present* (rich — its shape indicates the form
  directly), else `Class` + a direct read of the problem. Absence is not "nothing to read": draft-design omits the
  draft at `low` **or** at `medium`-without-draft, so absence narrows the read to a **brief-vs-outline
  disambiguation**, cheap precisely because the entry-read is forced anyway.
- **generate-tasks (scale):** the irreducible case — **no upstream artifact ever carries scale** (spec and draft
  both track derivation). So task-gen's scale read is *necessarily* a direct read of the work surface (the
  grounding breadth Step 1.1 already surfaces), cross-checked against `Class`. Not a patch over a hole: the scale
  axis is **structurally feed-forward-immune**, so the direct read is load-bearing by design.

Each read is **measurement vs. the standing `Class` estimate**: the direct read resolves, `Class` is the prior
bound, and a read that exceeds the estimate is the ratchet trigger — so the entry-read *being* each stage's
`classify-work-unit` touchpoint falls straight out of estimate-then-ratchet, identically on both axes (no
circularity — the same evidence drives both the depth and the `Class` update). The **structural** design is
settled here (each stage has one entry-assessment, its evidence profile, scale's feed-forward-immunity, the
read=touchpoint collapse); only the **thresholds** (what breadth reads `high`, how many open decisions read
`medium`) calibrate via dogfooding.

**The ratchet is decision-live, persistence-deferred.** A touchpoint may ratchet mid-stage (task-gen's entry
scale-read can ratchet before the task list exists). The decision is *live* at the interlock — surfaced at once,
driving that stage's depth immediately — but the `**Class:**` *write* defers to the stage's planning-ceremony
commit (spec-generation / task-list generation / draft-capture), never a mid-stage meta edit. The value is never
lost (it is surfaced and drives behavior the moment it resolves); it simply persists at the ceremony boundary,
honoring meta-timing's no-mid-session-churn rule. Per-stage commit homes: § Derivation pending item 3.

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

- **`Novel` planning-shape realization.** Owned and now derived (§ Novel realization): the advisory discovery /
  research phase + ADR expectation, realized as an **overlay on the `high`-draft + `detailed` lanes** (Novel ⟹
  both), holding CMF's "suggest, do not enforce" — no hard `Class` ↔ spec-form hook. Residual: the PRD-vs-RFC
  ADR-affordance nuance, which rides the RFC session.

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
  breadth at the current Step 1.1), cross-checked against `Class`. The scale axis is **structurally
  feed-forward-immune** — no upstream artifact encodes it — so this direct read is load-bearing by design, not a
  patch over a hole.
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
  `medium` = bounded single-pass shaping, *optionally* a `draft-*`; `high` = an **iterative shaping loop**, a rich
  `draft-*`. The draft stays optional at `medium` **by design** — CMF names only the *spec* stage's depth as
  producing a durable artifact and treats `draft-*` as a generic optional pointer, so the draft is never a
  depth-mandated artifact. Absence therefore spans `{low, medium-no-draft}`; create-spec's forced entry-read
  (§ create-spec; § Mechanism) disambiguates brief-vs-outline at no extra cost, so nothing is lost by leaving the
  medium draft optional.
- **`high` is a *simple* loop.** The conductor's `refine-plan-loop` *enriches* the high lane (bounded batches,
  plan-splitting detection, resume-aware refinement) — it is not a fourth level. SAP ships the simple loop and
  must not build those enrichments.
- **Re-entry valve: re-enter-higher only.** Drafting is stage one, so a floor-raising signal has no upstream to
  route to — the valve runs `low → medium → high`; the ceiling (`high`) hands off to the conductor's expanded
  machinery rather than escalating further within SAP.
- **Novel's primary home.** Drafting is where `novel`'s advisory discovery / research phase primarily lands
  (derivation axis) — an **advisory overlay** on the `high` lane (Novel ⟹ `high`), not a depth default; free-form
  and self-sequencing (orient-then-research, never preemptive). See § Novel realization.

### create-spec

- **Depth *is* the form** — `low→brief`, `medium→outline`, `high→detailed` — and this is the **one** stage whose
  depth names a *durable* artifact (the form, in the spec H1). So create-spec is the **crystallization point**: it
  reads a (maybe-absent) `draft-*` and emits the durable form-signal that generate-tasks and the lifecycle read.
- **Derivation-keyed resolution = the touchpoint** (mirror of draft-design). Resolving the form is the
  `classify-work-unit` confirm-or-ratchet. Its entry-read consumes the `draft-*` when present (rich); when absent
  it consumes `Class` + a direct read of the problem, narrowing to a **brief-vs-outline disambiguation** (absence
  spans `{low, medium-no-draft}`). Not a fallback over a feed-forward hole — the entry-read is forced regardless
  (depth is never recorded — § Mechanism), so the disambiguation is already paid for.
- **What scales across the workflow's steps:** discovery depth (intent + scope + one success signal →
  decision-centric → full checklist) and the template selected (brief / outline / `detailed-prd|rfc`). The
  **PROJECT-PRD / TECHNICAL-OVERVIEW alignment checks do *not* scale as lanes** — always-on, cost-proportional
  floors (§ Floors that sit below the depth axis).
- **Work-category determination becomes `detailed`-only.** Today's always-on "feature vs technical" step (a stale
  remnant — it feeds nothing now) is **reworked**, not retired: it gates the PRD/RFC subtype split, which applies
  at `detailed` only; `brief` / `outline` are single, category-agnostic forms.
- **Re-entry valve: two routes (the middle derivation node).** A floor-raising signal splits on whether the design
  *direction* is settled: **deepen in-stage** (`outline → detailed`) when the direction is clear but needs more
  formal derivation; **route back to `draft-design`** when the direction itself is unsettled (you cannot formalize
  an unshaped design). Contrast: draft-design re-enters-higher only; generate-tasks re-enters for scale /
  routes-to-spec for derivation.
- **Novel's secondary home.** At `detailed` (Novel ⟹ `detailed`), `novel` surfaces the advisory **ADR-companion**
  recommendation — suggest, not enforce (no hard `Class`↔form hook). See § Novel realization.

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

**Numbering — decided: drop the prefixes entirely.** Stages are named bare (`draft-design` / `create-spec` /
`generate-tasks`), and `process-task-loop` likewise loses its number. The two candidates were (a) drop entirely
vs. (b) renumber the planning trio only (`1_draft-design` / `2_create-spec` / `3_generate-tasks`). Chosen **(a)**,
for two reasons: the names already self-sequence (*draft the design → create the spec → generate the tasks*), so a
prefix is redundant for ordering; and stamping `1_2_3_` reasserts a rigid linearity against exactly the
depth-relative, re-entrant pipeline this WU establishes (draft-design may emit nothing; stages re-enter on
axis-keyed valves; depth floats per stage). The differential cost over (b) was negligible — the sweep renumbers
`process-task-loop` either way, and (b)'s only extra cost was a transient duplicate-`1_` window — so the call is
pure signal value, and the bare names carry it. Reversible if the planning-order signal is ever missed. The
original 1-2-3 defect was scope (extending it to `3_process-task-loop` conflated planning order with
whole-process order); dropping resolves that cleanly.

**Cascade routing.** The existing-file rename cascade — dropping the prefixes on `1_create-spec` /
`2_generate-tasks` / `3_process-task-loop` plus every cross-reference across workflows / strategies / methods /
templates / session-init — routes to **`doc-cascade-sweep`** (the cohort's terminal reference-sweep member,
downstream of this WU), coordinated with `naming-conventions`. SAP names the new drafting workflow `draft-design`
and does not rewrite the existing files itself; half-renaming breaks references, and reconciling the interim
mixed state is the terminal sweep's job.

## Novel realization (derived)

Novel is a **kind**, not a depth (CMF: invent-vs-compose, reached through *derivation alone*; scale never reaches
it), and **not a fourth spec form** — it shares `detailed`. SAP owns only its *secondary* purpose: opening the
**advisory discovery / research phase + ADR expectation**. (The *primary* purpose — the parallelism / sequencing
balance signal — is roadmap territory, not this WU's.)

**The invariant that bounds it: Novel ⟹ `high` draft-design + `detailed` create-spec.** Derivation-high forces
both, so Novel never co-occurs with brief / outline / low / medium. It is therefore not a lane or a depth
selector but an **advisory overlay decorating exactly those two lanes** — the derivation reduces to saying what
the overlay *adds*. Every item below is a recommendation at the stage interlock (`Class == Novel`-keyed, surfaced,
accepted-or-declined) — never a gate, no hard `Class` ↔ form hook (the same stance behind the declined
consistency check), written as whole-block conditionals per the workflow-authoring conformance requirement.

- **draft-design (`high`, primary):** the invent-vs-compose read that *is* the derivation entry-read = classify
  touchpoint (§ Mechanism) lands `novel` → the workflow **recommends a discovery / research sub-phase** opening
  the high lane. **Free-form, and self-sequencing — never preemptive:** the suggestion to *have* a research
  element fires early (off the invent-vs-compose read), but the concrete research targets are not knowable until
  the problem space is oriented — what is already known, what lives in the codebase vs. what must be derived. So
  the sub-phase **orients first** (establishes known / unknown and the compose-vs-invent boundary), and the actual
  research emerges from that, never dispatched up front. Output populates the rich `draft-*`'s discovery /
  research / alternatives sections (offered as *optional* template scaffolding — use or ignore); no separate
  artifact.
- **create-spec (`detailed`, secondary):** the same `detailed` template, plus a surfaced **ADR-companion
  recommendation** — author an ADR capturing the invented model's rationale (mirroring CMF's own companion ADR).
  Optional, not a required section. *(PRD-vs-RFC nuance — a technical RFC plausibly warrants an ADR more readily
  than a feature PRD — stays a lean, deferred to the RFC session where the subtypes get nailed.)*
- **spec-review posture:** for a novel spec the default self-review shifts — **extra coherence / grounding care**
  (no existing pattern to lean on) + an advisory **"was the rationale captured / ADR considered?"** nudge.
  Absence is a suggestion, never a block.
- **task-gen:** **nothing.** Novel is derivation-axis; task-gen is scale-driven, reaching novelty only indirectly
  (novelty may drive scale, which drives task-gen depth through the normal path). Kept explicit so no phantom lane
  is added.

**The companion ADR is a non-moving artifact** — authored in place under `reference/adr/`, never relocated (unlike
the `draft-*` / `spec-*` WU artifacts). So lifecycle integration does not special-case Novel: it consumes the ADR
if present, like any durable doc — no Novel branch in integration.

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
   **All three stages resolved** (§ Per-stage manifestation; § Pipeline structure & naming).
2. **Novel realization shape** — *resolved* (§ Novel realization): an advisory overlay on the `high`-draft +
   `detailed` lanes (Novel ⟹ both) — a free-form, self-sequencing discovery / research sub-phase at draft-design
   (orient-then-research, never preemptive); an advisory ADR-companion at create-spec; a posture-shift at
   spec-review; nothing at task-gen. Suggest-not-enforce throughout, no hard hook. Residual (rides the RFC
   session): the PRD-vs-RFC ADR-affordance nuance.
3. **`classify-work-unit` touchpoint wiring** — where the method fires in each of `draft-design` / `create-spec`
   / `generate-tasks`, what it does (confirm-or-ratchet `Class` against the stage's resolved depth), and the
   forward-compat boundary that keeps it light enough not to pre-empt `arc-plan-conductor`. **Commit-timing
   (resolved):** each touchpoint's `Class` write rides its stage's own planning-ceremony commit — `create-spec`
   on spec-generation (already a listed meta-touching ceremony), `generate-tasks` on task-list generation
   (alongside the `**Task List:**` write), `draft-design` on draft-capture (or, at `low`, riding the next
   ceremony rather than a meta-only micro-commit). The ratchet is **decision-live, persistence-deferred**
   (§ Mechanism). Remaining deliverable: amend DEV-RULES.ARC's ceremony list to name the planning-stage ops
   explicitly, so the three new write-sites don't read as meta-timing violations to a future author.
4. **RFC form** — research and decide what RFC shape fits ARC as a proper complement to the PRD (genuine
   derivation; draws on the captured deep-research idiom pass). **Its own dedicated session:** the research must
   hold the current PRD shape in frame — RFC and PRD have to complement *and* each stand alone, so the PRD is
   likely realigned in the same pass; the detailed-subtype template-structure call (§ Detailed-spec subtypes)
   rides along, since it cannot resolve until the RFC shape is known.

Two design subtleties the manifestation work must resolve, not gloss:

- **The three stages resolve depth from different axes** — drafting and spec from **derivation**, task-gen from
  **scale**. "One mechanism" therefore carries three different *input signals*; the parameterization is not
  symmetric across stages.
- **The scale axis is feed-forward-immune** (resolved — § Mechanism). Spec form recovers the derivation lane, but
  scale is *not* recoverable from any upstream artifact (an `outline` may be `light` or `heavy`), so task-gen reads
  it directly at entry (grounding breadth, cross-checked against `Class`). Reframed from "a hole" to a property of
  the axis: the entry-read is load-bearing by design — and since depth is never recorded, every stage re-derives
  regardless, so there is nothing to thread.

**Status:** all three per-stage manifestations are resolved (§ Per-stage manifestation); the **entry-read
mechanism is resolved** — reframed as one *forced* per-stage entry-assessment reading the keyed axis from best
available evidence (the upstream artifact is its richest input, not a separate mechanism), with the scale axis
named **feed-forward-immune by design** and each read doubling as the stage's `classify-work-unit` touchpoint
(§ Mechanism). Settled this session: spec-review scaling (form-inherited, SAP-owned — § Spec-review procedure);
the `Class` ↔ spec-form check declined (§ Open questions); numbering — prefixes dropped (§ Pipeline structure &
naming); the **`Class`-write commit-timing** — each touchpoint's write rides its stage's planning-ceremony commit,
decision-live / persistence-deferred (§ Mechanism; item 3 — leaves a small ceremony-list amendment as the only
residual); and **Novel realization** (§ Novel realization — an advisory overlay on the high-draft + detailed
lanes, free-form self-sequencing discovery, advisory ADR companion). **Remaining pre-spec — one item:** the RFC
form, its own dedicated session (item 4), carrying the PRD realign + the detailed-subtype structure + the Novel
PRD-vs-RFC ADR nuance. With that session done, the draft is spec-ready.

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
   workflow) and the **authoring-workflow naming convention** (settled triad names, prefixes dropped;
   existing-file cascade routed out). See § Pipeline structure & naming.
8. **Workflow-authoring conformance** — the new and restructured authoring workflows (`draft-design` + the
   reworked `create-spec` / `generate-tasks`) follow `strategy-workflow-authoring`: frontmatter schema (method /
   extension declarations), body conventions, and **correct interlock / release fire-point placement** — the
   `classify-work-unit` touchpoints, the per-phase grounding-audit interlock, the spec-finalization review gate,
   and any commit / push fire-sites carry the right stops and class tags. A standing requirement, surfaced here so
   it is not deferred or forgotten at authoring time rather than a separate deliverable.

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
  Deferred to the dedicated RFC / PRD session (coupled to item 4 — resolves once the RFC shape is known).
- **Per-phase grounding-audit interlock invariance** — lean invariant, not 100%; confirm at spec.
- **Planning + spec + task shapes** — the *structural* shape is pre-spec derivation (§ Derivation pending);
  only calibration is dogfooding-refinable, not a blanket deferral.
- **User-above preference: config knob vs. in-process steer** — deferred; forward-compat binds now.
- **`Class` ↔ spec-form consistency check — declined (revisit only on dogfooding evidence).** Once this WU makes
  the spec form a structured signal (the `Spec ({form}): {name}` H1 + the template family), a warn-not-block
  `Class` ↔ form check (`heavy` / `novel` ⇒ `detailed`, etc.) would be cheap to build — but **SAP evaluates and
  declines it** (`class-model-foundation` routed it forward as a candidate, not a requirement). Rationale, in
  order: the `classify-work-unit` touchpoints (init / activate + the three authoring touchpoints SAP adds) already
  keep `Class` honest by *active* confirm-or-ratchet, so a passive warn is redundant; `Class` / form are advisory,
  so a mismatch breaks nothing structural and the gate would prevent no harm; an enforcement-flavored warn
  undercuts CMF's "suggest, not enforce" stance at the very surface meant to embody it; and it is trivially
  addable later if drift ever appears (YAGNI) — the structured form signal will be sitting right there if wanted.

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
