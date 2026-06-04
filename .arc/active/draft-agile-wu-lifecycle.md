# Draft: Agile WU Lifecycle

**Purpose:** Scale work-unit ceremony to the work's actual pre-impl demand while holding ARC's execution
discipline invariant. A two-value **`Class`** (`light` / `heavy`) recording planning weight — `heavy` iff
either of two intrinsic, stage-decorrelating axes is high (**derivation** of an open design, or **scale** of
the codebase-grounding a correct plan needs) — a per-stage **planning depth** (`low` / `medium` /
`high`), three spec forms (`brief` / `outline` / `detailed` → PRD/RFC), and an actionable decomposition
procedure together close the agility gap where ARC's uniform ceremony costs more than the work for small
bounded WUs — without making any discipline optional. This is the execution arm of the scalable-core
thesis: **scale grammar, never scale discipline** (ADR-020).

**State:** Consolidated planning draft (2026-06-04). The five planning threads (atomic-tier retirement,
spec-shape scaling, task-list scaling, the AWL ↔ conductor seam, decomposition) plus the spec-shape
deep-research pass and the integration-ceremony (former scope items 7 / 7a) evaluation are all resolved and
folded into one coherent body. The **two-axis refinement** (2026-06-04) supersedes the earlier "one axis,
two markers" framing: `Class` aggregates two intrinsic, stage-decorrelating axes (derivation, scale), is
decoupled from spec form (the `outline` straddle), and planning depth resolves per stage (`sketch` →
`brief`, `Complexity Tier` → `Class` `light`/`heavy`). The cohort-structure / graduation thread is resolved
(the nested-cohort grouping taxonomy + the
graduate-a-decomposing-WU-into-a-cohort model). **Decision: this WU decomposes and graduates** into a cohort
`agile-wu-lifecycle` (four member WUs D1–D4) under the `principle-anchored-core` cohort — it is its own
decomposition procedure's second acceptance test and first graduation customer (§ Scope Estimate). Each
member spec is authored from this draft via `1_create-spec`. External-artifact reconciliation
(`strategy-work-organization`, DEV-RULES.ARC) is execution-time scope, not resolved here.

**Created:** 2026-04-28 (terminology refresh 2026-05-19; consolidated 2026-06-04).

**Classification:** Cohort `principle-anchored-core`; Priority **P1**; `Depends On: worktree-foundation`
(shipped). Sequenced **next-up** to unblock `concurrent-work-conventions` (see § Dependencies). Originally
filed under `agile-parallelism` by its origin story; reassigned to `principle-anchored-core` once the
"agile / small-bounded-work-spun-up-fast" motivation was substantially delivered by the Errand class
(`errand-enablement` + `work-routing-discipline`, both shipped). What remains is spec-shape scaling +
scalable `create-spec` / `generate-tasks` + the decomposition procedure + `Class` reconciliation — the
scalable-core thesis, not parallelism.

---

## Problem / Motivation

ARC's WU ceremony is uniform regardless of WU size. A 30-minute fix and a 6-week feature go through the
same activate / integrate / archive pipeline. For small bounded work, that ceremony costs more than the
work itself.

The pre-existing "lighter" options fell short:

- **`incidental/` category** — documented as the lighter tier, but its workflows were identical to
  feature / technical. The "lightening" was about scope (no PRD / plan needed), not ceremony.
- **Lightweight completion-doc template** — saved doc time at integration only; didn't reduce activation or
  task-list overhead.
- **Atomic work** — bypasses WU lifecycle entirely, but the boundary is "smaller than warrants a branch."
  Under `branch.protection: full` (the default for most teams), most reviewable work needs a branch and
  therefore a WU.
- **`branch.protection: partial`** — allows direct-to-main commits for atomic work, but that's not what
  teams using PR review do.

For an experienced dev's "spin up a branch for a small bug, work, PR, merge" pattern under `full`
protection there was no lightweight path: every branch became a WU; every WU got full ceremony.

This WU introduces a model where ceremony scales with the work's actual design-authoring demand, while
execution discipline (mandatory stops, quality gates, commit format) stays invariant.

## Working Thesis: Scaled Ceremony, Invariant Discipline

ARC's value is the **structural enforcement of execution discipline**: mandatory stops at each review
increment, quality gates, atomic commits with format + context-footer enforcement, PR review for shared
branches. That discipline drives quality and is invariant across all WU sizes.

What scales is **artifact ceremony**: how much design must be *authored* to reach a settled state, how
specs are shaped, how tasks are organized, and how work is archived.

This framing explicitly answers the historical `draft-arc-modes.md` § Mode 1 rejection of a "Required vs
Available" model. That rejection was about making *execution discipline* optional (task interlocks removed,
gates skipped, "trust the dev"). This WU does none of that: discipline is enforced at every tier. What
varies is design-authoring labor — where the spec lives, how heavy it is, how tasks are organized, how work
is archived. Those are scaling-dependent ceremony, not discipline.

---

## The Floor Model

The model rests on two distinct "floors" whose conflation is what made the whole question feel fuzzy.
Anchors: ADR-001 principles P1 / P2 / P4 / P7; ADR-020 (scalable core); ADR-021 (Errand threshold). The
reasoning — not only the conclusions — is recorded so the constitutional pass can rebuild it.

### Two floors, not one

- **Discipline floor (P2 / P4) — universal, sits *below* the wrapper, never scales.** Every increment of
  change — a WU task, an Errand commit, a loose off-WU commit — closes with a review-increment gate and
  passes its quality gates. The floor of *discipline* is the smallest **commit**, not the smallest WU. This
  is ARC's identity; it does not move.
- **Wrapper floor — the smallest thing that is a WU at all.** This is the question with real design content.

### The wrapper exists for spec-worthiness; tracking is downstream

Over a bare disciplined commit, a WU adds exactly two things: an **authored spec** (P1) and a **tracked
lifecycle** (P7). The defining trait is **spec-worthiness** — work that is *more than a single logical
concern* (more than one review increment), even if multi-step / multi-file. Tracking is a *consequence* of
that, never an independent cause: graduation (an Errand that reveals unforeseen complexity mid-impl → WU)
trips on discovered *complexity*; tracking comes along for the ride. There is no "needs tracking but the
work doesn't warrant it" case — it does not occur. Anchors: P1's own test ("Does this need up-front
planning? Quick fixes with clear scope can rely on well-crafted git commits") and ADR-021 threshold #1.

### The scaling axes: derivation and scale (design is always settled)

**Invariant (P1; DEV-RULES.ARC § Design before implementation):** all settle-able design is settled
*before* implementation — best reasonable effort, never a conscious deferral. What varies is **not whether
design is settled** but **how much pre-impl work settling it demands**, along **two axes** (§ Class and
Planning Depth): **derivation** — how much design must be *authored* versus read off existing inputs — and
**scale** — how much codebase-grounding a correct impl plan demands. Along derivation:

- **Errand** — zero authoring. The intent *is* the design. ("Intent *to* design" disqualifies it.)
- **determinate work** — design is determinate from existing inputs (issue / pattern / clear intent); the
  spec *records* it lightly, it does not *derive* it. `light` `Class` unless scale pushes it `heavy`.
- **derived work** — settling *requires authoring* a real design (a PRD's worth): many concerns,
  alternatives, and tradeoffs that do not exist until someone works them out. Always `heavy`.

The scale axis is co-equal: a determinate-but-large WU (a mechanical refactor) is `heavy` by grounding
demand alone. `Class` is `heavy` iff *either* axis is high (§ Class and Planning Depth).

> **Candidate constitutional sharpening (flagged, not decided):** today's spec-directed rule handles
> *emergent* design questions ("route them back to the spec"). Add the stronger *front-loading* duty —
> settle all settle-able design up front; never consciously defer it to impl. AWL touches DEV-RULES.ARC
> anyway. (See § No design-deferral stays universal for how this lands.)

### Topology: fixed floor → scalable middle → fixed ceiling (derived, not chosen)

Preference operates in the band between the demand-set floor and a fixed ceiling (max ceremony ARC offers).
**Band width shrinks as pre-impl demand rises** (along *either* axis — derivation or scale), because the
floor climbs toward the fixed ceiling:

- **Errand:** floor = ceiling = one disciplined commit. Band width **zero**.
- **Low demand (determinate, modest scale):** floor low, ceiling high. Band **wide** — preference has real
  room (`brief` ↔ `outline`).
- **High demand (a PRD-worth of derivation, or a large grounding surface):** floor near the ceiling — a
  paragraph can't hold a large design space; many concerns force phasing; a large surface forces a full
  grounding pass. Band **≈ zero**.

So **both endpoints are fixed for the same reason — degenerate bands — and only the middle scales.** Among
**spec forms**, the ceiling (`detailed`) sits strictly above the middle (`outline`): reaching `detailed`
*requires* derivation. `Class` is the separate `heavy`-iff-either-axis aggregate, so a determinate-but-large
WU is `heavy` with an `outline` spec (the straddle) — `Class` and spec form are deliberately decoupled. The
derivation line and the scale trigger are the two `heavy`-promotions; both are load-bearing for § Class and
Planning Depth.

### Atomic retires as a *tier*

Atomic-character work executes as an **Errand** below the wrapper, or graduates; ADR-020 §3's spec-in-commit
"floor exception" migrates *out of the tier model into the Errand class*, which reconciles the
ADR-020 ↔ ADR-021 tension. "Atomic" reverts to a pure character adjective (see § Atomic-the-character vs
atomic-the-shape). The `Class` set is **{`light`, `heavy`}**.

### The ceremony stack: three lower-bound layers; `Class` tracks work-demand, not preference

1. **Work-demand → forced floor** (per-WU, objective, enforced via drift-promotion; *either* axis —
   derivation or scale). *The work demands ≥ this.*
2. **Project preference → team floor** (set at init, trivially changeable, no reinstall). The consistency
   knob; likely a project-config setting per ADR-020 §8's guided-init walkthrough.
3. **User preference → personal investment *above* the team floor** (working style); never below it.

Actual ceremony = the user's pick within `[max(demand_floor, project_floor), ceiling]`. **`Class` tracks
layer 1 only** (work-demand) — neither preference layer inflates classification. A determinate WU specced
heavily by preference is still **`light`**, correctly: the *work* was light; the author simply likes rigor.
This keeps `Class` objective and useful for parallelism planning ("how much genuinely-heavy work is in
flight"). (Intrinsic scale is not preference — a large refactor is `heavy` by demand, not taste.)

**Machinery available is identical at every depth** — the same full-strength workflows, grounding
audit, review, and gates, **parameterized by depth rather than forked** (§ Grounding audit). What
differs is how much there is to apply it to (artifact surface) and whether the depth is *mandated*
(`detailed` is forced when design derives; a full grounding pass is forced at large scale — band collapsed)
or *chosen* within the band (`outline` is chosen insurance over `brief`). The determinate middle's ceiling
(`outline`) is **real rigor applied to a determinate design** — never a diet `detailed`. This is the
"appropriately rigorous, not forced" property.

### Invariant vs. convention (this is the "always feels like ARC")

The floor is **identical at every model position** — that invariance *is* the ARC feel; the model only
moves the convention layer on top.

- **Floor (principle-forced):** a spec in some form (P1); a task list when multi-increment (P2 + P7);
  intent-verification of completed work against the spec (P1's intent-vs-outcome loop); the discipline
  floor (P2 / P4). Always present, every tier above Errand.
- **Convention (opinionated, scalable, configurable):** spec *template weight*; phase count beyond one;
  pre-execution task-list audit (`arc-task-audit` is a strong default, **not** a floor — front-loading
  audit is a method under P1, not an invariant); iteration passes.
- **Task list scales by phase *count*, not *shape*:** one parsed grammar from 1..N phases (minimum one
  substantive phase + always-present verification — gate-check at the low end, dedicated phase at `heavy`).
  A "flat" shape is a *second grammar* = a parser fork = an internal-dev maintenance trap; rejected.
- **Spec scales by template family:** three variants, heaviest = the current PRD; exact shapes informed by
  external research (§ Spec shapes).

### User-above preference: config knob vs. in-process steer (OPEN)

Deferred until the mechanical design is known (how tier / preference affects each workflow, skill, hook,
CLI surface). **Decision criterion:** a config knob is warranted *iff* "ceremony preference" resolves to a
single coherent ordinal workflows can consume; if it is a scattered bag of per-surface toggles, one knob is
a leaky abstraction and steer-per-process is better until consolidated.

**Forward-compat (binds now, even while deferring):**

- Design the scaling mechanism to consume a **resolved** preference value independent of its source
  (resolve-then-load, ADR-020 §9): the probe resolves active ceremony preference; workflows load the
  matching fragment. This makes knob-vs-steer a **late-binding input decision, not an architectural fork** —
  decidable after the implications are known, without reshaping any workflow.
- If it becomes a knob, its home is the `configuration` cohort's per-developer substrate
  (`draft-config-storage-architecture.md` — `.arc/user/{identity}/config.user.yml`, user-notes-synced),
  not a bespoke surface. Soft coordination, not a hard dependency.

---

## Class and Planning Depth: Two Axes, Resolved Per Stage

The model is governed by **two intrinsic axes** of the work, a recorded coarse **`Class`**, and a per-stage
**planning depth**. The earlier "one axis, two markers" framing was wrong in one consequential way: the
two axes **load different stages**, so they **decorrelate** — and any model that collapses them into a
single per-WU bucket gives the wrong answer for the work where they pull apart.

### The two axes (intrinsic work properties)

- **Derivation** — how much design must be *authored* (derived) versus *recorded* (read off existing
  inputs). The durable framing of pre-impl ambiguity: a shipped WU still "required derivation." Loads
  **drafting + spec creation**. (Formerly miscalled the "design-doc line" — a misnomer, since in ARC
  *every* non-Errand WU has a spec; the line separates *record from derive*, not *doc from no-doc*.)
- **Scale** — how much codebase-grounding and mechanical mapping a *correct implementation plan* requires
  (symbols, relationships, breakdown accuracy), **independent of whether the design was derived**. Loads
  **task-gen** (the `arc-task-audit` grounding pass).

The two collapse at the heavy end (deriving an open design is inherently complex) and spread apart on the
determinate side — which is where the two single-axis-heavy archetypes live:

| WU archetype              | derivation | scale    | spec form      | **Class** | drafting | spec | task-gen |
| ------------------------- | ---------- | -------- | -------------- | --------- | -------- | ---- | -------- |
| small fix                 | low        | low      | `brief`        | light     | low      | low  | low      |
| moderate feature          | low        | med      | `outline`      | light     | low      | low  | med      |
| large mechanical refactor | low        | **high** | `outline`      | **heavy** | low      | med  | **high** |
| tricky algorithm          | **high**   | low      | `detailed`·RFC | **heavy** | **high** | high | low      |
| large greenfield feature  | high       | high     | `detailed`·PRD | heavy     | high     | high | high     |

### `Class` — the recorded coarse classification (`light` / `heavy`)

`Class` is the WU's **planning weight**: recorded on the meta, consumed by roadmap / parallelism planning
("how much genuinely-heavy work is in flight; how many to run concurrently"). It is **`heavy` iff *either*
axis is high** — real design derivation **or** a substantial grounding/mapping pass to plan correctly. A
one-way ratchet (§ Mechanism): rises when a stage reveals demand, never demotes (demotion discards work).

`Class` tracks **work-demand, not preference** (§ The Floor Model, ceremony stack): a determinate WU specced
heavily by an author's taste is still `light` — the *work* was light. Intrinsic scale is not preference,
though — a large refactor is `heavy` by its grounding demand even with an obvious design.

`Class` almost reads off the spec form, with one honest straddle:

- `brief` spec → always `light` (determinate + low scale).
- `detailed` spec → always `heavy` (derivation forces it).
- `outline` spec → **either** — `light` at moderate scale, `heavy` when the impl needs a substantial
  grounding/mapping pass. Disambiguate by the `Class` field or task-list scale.

(`heavy`/`brief` is empty: low scale can only reach `heavy` via derivation, and derivation forces
`detailed`, never `brief`.)

### `planning depth` — the per-stage resolution (`low` / `medium` / `high`)

Each authoring stage resolves a **planning depth** *independently*, from the axis that loads it.
Depth is **transient, per-stage, never recorded**, and **able to vary across stages** — by work-need
*and*, to a bounded degree, user preference. That per-stage variability is the principle-anchored-core
thesis in miniature (scale the grammar per stage; never the discipline), and treating depth as one
WU-level bucket was the bug the two-axis view corrects. The archetype table's three rightmost columns are
per-stage depths; their *non-flat* profiles — refactor (low drafting, high task-gen), algorithm (the reverse) —
are the point.

Only the spec stage's depth names a durable artifact — the **spec form** (`low → brief`,
`medium → outline`, `high → detailed`). Drafting and task-gen realize their depth in their own units
(facilitation rounds; pass-structure + grounding depth), producing no separately-named artifact. The
arc-plan conductor's selectable planning depth is the planning-stage instance of this ordinal.

### Boundary tests must be crisp (a D1 priority)

Three recognizable-in-retrospect tests place work. Making the two `heavy`-triggers crisp is a first-class
deliverable — the model's correctness rests on the thresholds far more than on any naming:

- **Errand vs. WU (the wrapper floor — ADR-021):** *"Does this need more than a single logical concern —
  more than one review increment — to do well?"* No → Errand (single disciplined commit). Yes → WU.
- **Derivation trigger (→ `heavy`):** *"Must a real design be authored — concerns, alternatives, tradeoffs
  that don't exist until someone works them out — before a competent engineer can start?"* Yes → `heavy`
  (the spec *derives*). Well-trodden industry ground (Stripe RFC criteria, Google design-doc guidance,
  Shape Up shaping, GitLab MR-driven workflow).
- **Scale trigger (→ `heavy`):** *"Does producing a correct implementation plan require a substantial
  codebase-grounding / mapping pass — many symbols and relationships to verify — beyond the routine
  floor?"* Yes → `heavy`. **Guard the bar at *substantial*** — most WUs carry some grounding, and a soft
  bar makes everything `heavy`.

`light` iff **both** `heavy`-triggers are no. The triggers are recognizable in retrospect: determinate work
that starts needing alternatives or a success-criteria matrix is the derivation trigger firing; determinate
work whose task breakdown can't be made correct without a deep grounding pass is the scale trigger firing.
Both are the `light → heavy` ratchet (§ Depth-shifting). Early adopters will mis-call a stage occasionally;
the depth-shift ratchet and the conductor's depth-aware navigation (§ AWL touches the *existing* `arc-plan`)
are the corrections, with user preference steering within the band — but the thresholds carry the load, so
keep them crisp.

### The felt-difference test (model guardrail)

**Every position the model exposes must be distinguishable to the *user* in rigor and/or speed; a
distinction visible only to the author is arbitrary and must collapse.** This is a first-class acceptance
criterion, and applying it honestly is what keeps the axes / `Class` / depth split honest.

The spec forms differ in both speed and rigor — `brief` (fast) / `outline` (moderate) / `detailed`
(thorough) — so the form ordinal passes cleanly. The two `Class` values pass too, including the straddle:
a `heavy`/`outline` WU (large refactor) is felt-distinct from a `light`/`outline` WU by its task-gen
depth — a long grounding grind versus a quick one. And **there is still no `light`/`detailed`
position**: `detailed` *derives*, which forces `heavy`. What the test *rejects* is a knob that would make
`light/detailed` and `heavy/detailed` produce identical artifacts distinguished only modally (chosen vs.
forced) — the **arbitrary-lever trap**. `Class` avoids it because it is not a second lever over a single
depth: it is the *aggregate weight* of two genuinely independent axes, each of which is felt (derivation as
cognitive load up front; scale as a grounding grind at task-gen).

- **Follow-up-WU criterion** — scaling ceremony *within* this structure (making positions more distinct) is
  a legitimate future WU **iff** its candidates pass the felt-difference test. Only-arbitrary candidates ⇒
  the split is wrong; real-but-not-yet-built candidates ⇒ an opportunity. The test is the discriminator.

### Spec forms confirmed at three; the middle is structural

The spec stage clinches the count: the gap between a single-paragraph `brief` and a full PRD is
*enormous*, so a single middle is not optional — without `outline` the broad determinate-design middle of
real work has only two unusable extremes. The spec stage's hard requirement for a middle **pins the form
ordinal at three**, and stage-coherence carries the three-position depth to drafting and task-gen
(where the middle is present but less dramatic).

**Why three, when industry runs two?** Mature processes use a binary design-doc-or-not gate plus an
implicit floor (even Oxide, RFC-derived, collapses to a *single* artifact with author-judged depth). Our
three-form ordinal is a deliberate adaptation with its own justification: (a) ARC's mechanism
(resolve-then-load, per-stage self-resolution, composable fragments) needs **discrete, loadable**
resolutions — you cannot load a fragment against a continuum; the discreteness is the agent-native
adaptation; (b) the spec-gap argument (paragraph → full is too large to leave the determinate middle
unserved); (c) the felt-difference test validates each form. The Oxide continuum is the
**considered-and-declined** alternative (declined for agent-loadability). Each of the three *shapes* is
individually attested in the idiom (§ Spec shapes); what is adapted is assembling them into one graduated,
agent-resolvable ordinal.

### Naming

Settled after a focused external-vocabulary research pass (RFC lightweight / standard idiom, Shape Up
appetite, incident-severity tiers, t-shirt / magnitude legibility) and a subsequent model-refinement pass.
Research informed the names; the calls are the project's.

| Slot | Name | Recorded? |
| ---- | ---- | --------- |
| Recorded WU classification (planning weight) | **`Class`** (meta field) | Yes — render deferred (lean off) |
| `Class` values | **`light`** / **`heavy`** | Yes |
| Per-stage planning resolution | **`planning depth`** | No — transient, per-stage, varies by stage |
| Planning-depth level | **`low`** / **`medium`** / **`high`** | No |
| Spec artifact form | **`brief`** / **`outline`** / **`detailed`** (→ PRD / RFC) | the spec itself |
| Underlying axes (explanation, never labels) | **derivation** + **scale** | No |

Rationale:

- **`Class`, not `Complexity Tier` or bare `Tier`.** The field is a binary *kind* of work (two characters,
  not rungs on a graduated ladder), so `Class` fits better than `Tier` — and it sidesteps the quality-gate
  `Tier 1/2/3` collision. `Complexity Tier` actively misleads now: the classification aggregates **two**
  axes (derivation *and* scale), with derivation the larger factor, so naming it for "complexity" alone
  under-describes it.
- **`light` / `heavy`, not `light` / `full` or `light` / `standard`.** `light` / `heavy` are natural
  antonyms; `full`'s antonym is "empty," an awkward pairing. `heavy` reads as exactly the roadmap intuition
  ("that one needs a lot of judgment / research / mapping") and — because **scale is now a legitimate
  component of `Class`** — the "heavy = lots of total work" reading is *accurate*, not the misread it would
  have been under a derivation-only model. (`standard` was rejected for implying *default* while naming the
  *marked* case.) Definitional guardrail: `heavy` is about **design-derivation or grounding scale**, **not
  raw code volume** — a large but determinate mechanical change is `heavy` by its grounding demand, which
  the scale axis captures honestly.
- **`planning depth` (low / medium / high), not `process intensity` or `formulation depth`.** The axis is
  resolved **per stage** and the stages decorrelate, so it needs a *magnitude* vocabulary distinct from the
  *spec-form* vocabulary (`brief` / `outline` / `detailed`) — forcing `outline` to double as a planning-stage
  depth was the old "outline depth" awkwardness. `depth` is the noun (it captures both the *process* and the
  depth of its *product*); `planning` is the qualifier — anchoring the axis to the `State: Planning` stages it
  spans, and matching the WU State value. `low` / `medium` / `high` are its **levels**, reading cleanly as
  tagged scale positions and compound modifiers ("high task-gen depth", "a low-depth planning pass"); the
  bare-noun "high depth" never has to appear, so the only knock on `depth` is cosmetic and avoidable.
  Rejected: `rigor` (clean at the top but mis-frames the *bottom* — "low rigor" reads as permission to be
  sloppy, which the axis never means; less elaboration ≠ less care); `process intensity` (accurate but adds a
  second "process" term and loses the State anchor); `formulation depth` (its result-noun precision is already
  covered by the concrete spec-form names, so the extra vocabulary doesn't pay). It is a concept, not a field
  — never recorded.
- **`brief` / `outline` / `detailed`, not `sketch` / …** `sketch` carried the wrong connotation — rough /
  preliminary / will-be-redone — the opposite of a floor spec, which is concise *and* authoritative *and*
  complete at its scope. `brief` reads as deliberately-concise-and-complete (a design brief), as both an
  artifact ("a brief spec") and a magnitude ("brief work"); the form ordinal names its levels by their *output*,
  not by a process verb. (`detailed` splits by feature / technical nature into PRD / RFC — § Detailed-spec
  subtypes; only `detailed` branches, because only `detailed` derives.)
- **`derivation` + `scale` stay explanation, never labels.** The axes are inverse-correlated with "weight"
  and load different stages; surfacing them as labels would invert awkwardly and break the single-magnitude
  reading of `Class`. They live in the strategy doc's definition and diagram (the boundary tests *are* the
  axes), not on the field.

### Record but don't necessarily render

`Class` records on the meta — the `**Tier:**` field is renamed `**Class:**`; it groups with the
classification fields (`Depends On` / `Cohort` / `Priority`), not with provenance (`Origin` / `Design`).
**Rendering is a separate call:** the parallelism-planning rationale points at `STATUS.USER` (In-Flight) if
anywhere, not ROADMAP, and with both tables near max width the lean is **off in renders** until that view's
value is demonstrated. Recording is cheap and stable; render-inclusion stays open.

---

## Per-Stage Realization

### The three authoring stages

Each of the three pre-implementation **authoring** stages realizes the depth ordinal in its own units and
**self-resolves** (§ Mechanism). These shapes are **starting points** — explicitly open to
post-integration dogfooding refinement (scale a position up or down within reason if real use shows the
tuning is off):

1. **Drafting** (pre-spec drafting; the existing `arc-plan`): `low` = quick determinacy-confirm (a couple of
   targeted questions); `medium` = bounded single-pass elicitation (surface the few real decisions +
   scope, no iteration); `high` = full iterative facilitation (today's `arc-plan`, later the
   conductor's refine-loop). Driven by **derivation**.
2. **Spec creation** (`1_create-spec`): a template family (§ Spec shapes) — the depth level names the form.
   `low` → `brief` = intent + scope boundary + one falsifiable success signal; `medium` → `outline` =
   decision-centric record; `high` → `detailed` = the current full PRD, subtyped PRD / RFC.
3. **Task generation** (`2_generate-tasks`): pass-structure + phase count, **driven by scale**. `low` = single
   combined pass with inline light grounding, one substantive phase + verification gate-check; `medium` =
   merged structure+content pass with the grounding audit retained, few phases; `high` = full 3-pass
   (structure → content → per-phase grounding audit) + 3–7 phases + dedicated verification phase — forced
   at large scale regardless of spec form (the `heavy`/`outline` refactor).

### Spec shapes (research-grounded)

Refined with the 2026-06-03 deep-research pass on industry idiom for lightweight specs. Research posture:
**inform and adapt, never adopt.** (Full source URLs live in the deep-research transcript — run
`wf_191136b1-518`; pull them when authoring the spec's External Research. Sources nameable even if the
transcript is gone: Shape Up pitch, ADR / Nygard, GitLab handbook, Go proposal, Oxide RFD-0001, Microsoft
eng playbook, Squarespace, Rust RFC.)

What the idiom confirmed (and didn't):

- **Decision-centric middle: confirmed** (high confidence, 3-0). The stable middle-tier artifacts — Shape
  Up's pitch (Problem / Appetite / Solution / Rabbit Holes / No-gos), the ADR (Context / Decision /
  Consequences), GitLab's lightweight-ADR — all *record* settled design + an explicit scope boundary + the
  one-or-two open items, while deliberately *excluding* requirement-ID enumeration and success-criteria
  matrices. The exclusion is the anti-up-drift mechanism (Shape Up: "we don't want to over-specify… they'll
  box in the designers"); the fixed decision+scope sections are the anti-down-drift. **A full spec
  *derives* a design that didn't exist; the middle *records* one that was mostly determinate.**
- **Floor: convergent** — GitLab "start with one paragraph and evolve… not a complete upfront blueprint";
  Go "brief issue… no design document at this point." Intent-first, accretes through learning. (Our floor
  adds *one falsifiable success signal* on top — ARC's P1-driven addition, not industry-converged.)
- **Procedure: async-first and scales with tier** — author-owned PR + bounded comment window (Oxide
  3–5 days), escalate to sync after ~2 round-trips (Microsoft), committee only for high-blast-radius
  (Squarespace). Direct support for the felt-difference test on the *procedure* axis (levels differ in speed
  *and* rigor).
- **Caveats:** several procedure findings are single-company existence-proofs (adapt-from, not norms); ADR's
  "fixed 5 fields" holds only for canonical Nygard (the family spans one sentence to 15 sections); Amazon
  PR/FAQ went unexamined (the heavy boundary).

The three shapes (concrete, starting points — dogfooding-refinable):

- **`brief` (floor):** ~1 evolving paragraph — intent + scope boundary + one falsifiable success signal.
  Industry-attested core (one-paragraph / brief-issue); the success-signal is ARC's P1 addition. Not
  trivial, not an Errand (ADR-020 keeps intent-verification at every level, so a brief is still checkable).
- **`outline` (middle, records):** ~1–2 pages (ADR length norm). Section set adapted from pitch + ADR +
  GitLab-lightweight-ADR: **Problem / Context · settled Decision(s) · Scope boundary (No-gos) · Open items
  (worked out, not deferred) · Consequences / risks** — optionally a bounded **Appetite / effort** line
  (Shape Up; maps onto `Class`). No requirement IDs, no success-criteria matrix. Borrows the ADR's
  decision-centric *form*, but is a *spec* (feeds a task list, validates completion) — distinct from an ARC
  ADR (a posterity decision record that feeds nothing); do not conflate. The stabilizing principle:
  structurally different, not "PRD minus sections" (drifts up) or "brief plus a bit" (drifts down).
- **`detailed` (ceiling, derives):** the current full spec, subtyped PRD (feature) / RFC (technical) — full
  requirement enumeration + success criteria; derives an open design.

### Spec naming & variants

The on-disk filename stays `spec-{name}.md` (WOR-locked, relocatable) at every form. What varies is the
template and the H1 label:

- **Templates:** `template-spec-brief.md` / `template-spec-outline.md` / `template-spec-detailed-*.md`.
  One genre noun — **Spec** (keeps ARC's `spec-*` / create-spec vocabulary; avoids a `Design Doc` ↔
  `**Design:**`-meta-field clash).
- **H1 leads with the artifact type:** `Spec ({form}): {name}` — e.g. `Spec (outline): payment-retry`.
  Restores at-a-glance type legibility (an external reader sees *why* two specs are structured differently)
  and keeps symmetry; prose uses the natural compound ("the outline spec", "brief-spec work").
  Punctuation is a template detail.
- **`PRD` retires as the catch-all term** — replace generic "PRD = any spec" usage with "detailed spec"
  across surfaces (a documentation-cascade item; lands in the create-spec form-agnostic reframe).
  `PROJECT-PRD` is a different artifact (project constitution) and is preserved.

### Detailed-spec subtypes (PRD / RFC) — adopted as direction

The `detailed` spec — the one tier that *derives* — splits by the existing feature / technical work-category
axis (already classified at create-spec Step 2), which makes the `PRD` misnomer correct itself rather than
vanish:

- **feature → `PRD`** (`Spec (detailed · PRD): {name}`) — product requirements; now true to the name.
- **technical → `RFC`** (`Spec (detailed · RFC): {name}`) — technical design; idiomatic, and its
  comment-process heritage dovetails with the review-ceremony extension below. (Exact technical-subtype
  label — `RFC` vs `design-doc` vs `technical-spec` — is a minor spec-time naming call.)

Subtypes apply **at `detailed` only** — where derivation makes the feature / technical shape genuinely
diverge (user stories / adoption metrics vs. alternatives / architecture / migration). `brief` and
`outline` *record* rather than derive, so category-divergence is minimal there; they stay single,
category-agnostic shapes (bounding proliferation to four templates, not six). **Open (spec-time):** separate
detailed templates (`-prd` / `-rfc`) vs. one detailed template that flexes by category — today's single
template already flexes via optional sections, so the bar is "do the two diverge *enough* to warrant
distinct templates?" Felt-difference test + dogfooding decide.

### Floors that sit *below* the depth axis (do not scale)

- **Discipline floor** (P2 / P4) — per-commit review-increment + quality gates. Invariant.
- **Spec alignment checks** (`1_create-spec` Steps 4–5: PROJECT-PRD principle / Out-of-Scope;
  TECHNICAL-OVERVIEW drift) — **binary on/off, always-on**, cost naturally proportional to spec surface.
  You cannot "lightly" check principle alignment; it is a yes/no gate regardless of spec weight. Grounded
  against CWC's D1 (a thin-spec, determinate strategy-doc WU): the checks still run, near-instant because
  the surface is tiny. **This cost-scales-but-never-forks pattern is the template for integration ceremony
  too** (§ Lifecycle Integration).
- **Inline grounding** — even `brief` / task-gen keeps a *minimal* grounding check (named files / symbols
  exist); it is the generation-time slice of P1 intent-verification, hence floor, never "no grounding."

### Grounding audit: scale by depth, not scope, and keep the per-phase interlock

`arc-task-audit` is **already** per-task / per-phase-scoped at maximum — never "audit the whole task list in
one go" — so *scope* is not a meaningful scaling parameter. What scales is **depth**: a light
grounding-only pass (files / symbols exist) at `low` vs the full eight-category audit at `high`. Critically,
this is the **task-gen stage's depth, keyed to the *scale* axis** — *not* inherited from the spec form.
A determinate-but-large refactor carries an `outline` spec yet demands a `high`-depth audit (its
correctness lives in the mechanical mapping); a tricky-but-small algorithm carries a `detailed` spec yet
needs little grounding. This is exactly why depth resolves per stage (§ Class and Planning Depth).

The audit's *interlock cadence* — audit one phase → interlock (surface findings + recommendations) → take
feedback / confirmation / iteration → revise that phase → proceed to the next phase's audit → interlock — is
**leaning invariant** (not 100%). The candidate scaling (run all phases without the between-phase interlock,
surface everything at the end) risks denying the user the chance to absorb findings, ask questions, and
iterate; per-phase interlock feels load-bearing even for a two-phase list. Treat per-phase interlock as
invariant pending a spec-time confirmation.

So: **parameterize the one invariant procedure by depth — do not fork it into a second skill.** task-gen
invokes it at the stage's scale-resolved depth; **mid-impl always offers the full variant regardless of
the WU's `Class`** (a `light` WU can still hit a tricky task), so depth is the per-context *default*,
never a lock — preserving the at-will, human-and-agent use the skill already serves. Parameterizing (rather
than forking)
is also the forward-compat-as-fragment shape (§ composable-workflows).

### Depth-shifting: asymmetric and input-gated

The user's pick within the band is made **per-stage, not once at entry, and is re-selectable at each stage
transition**. Entry sets a *default cascade* (derived from `Class`); each authoring stage re-resolves its
depth within the band. Two guardrails keep this safe rather than chaotic:

1. **Down-switching is bounded by the demand floor.** You may choose lighter going *into* a stage, never
   below the forced floor (derivation or scale) — the floor protects genuine design and grounding work.
2. **No-demotion, correctly scoped.** You are free to choose *how much to produce* going into a
   not-yet-started stage; you may **not tear down** a heavier artifact already produced.
   Demotion-of-produced-artifacts discards work; lighter-choice-going-in does not. The `Class` ratchet is
   one-way; the per-stage depth floats within the band.

Concretely, asymmetric and input-gated:

- **Lighter going *into* an unstarted stage** (within floor): always fine — a rich input over-supports a
  lighter output (e.g. a detailed spec but a lighter task list for mechanical impl).
- **Heavier going in:** valid only if the upstream artifact *supports* it. When it doesn't, that *is* a
  **`heavy`-promotion signal** — but read *which axis* fired: a need for design notes / alternatives over a
  thin spec is the **derivation** trigger (re-enter the spec and deepen it toward `detailed`); a need for a
  heavy phased, deeply-grounded task list over a *determinate* `outline` spec is the **scale** trigger (the
  spec stays `outline`; `Class` goes `heavy` and task-gen resolves `high`). Re-enter the stage that owns the
  gap and deepen it additively (the no-tear-down rule holds), cascading back only as far as the
  insufficiency reaches. You never proceed on under-determined input — the no-deferral invariant forbids it.

This is **self-diagnosing**, on both axes: reaching for a `detailed` spec *is* the derivation-promotion;
finding a determinate WU's task breakdown needs a full grounding pass *is* the scale-promotion. Both ratchet
`Class` to `heavy` one-way, and both generalize the grounding audit's "route corrections back to the owning
stage."

### Spec-ready & finalized thresholds — one form-invariant bar; the spec form sets the distance

There is **one spec-ready bar, form-invariant:** *is all settle-able design settled, and can I state how
I'll know it worked?* What varies is the **distance** to it (authoring cost), not the **height**: `brief`
reached fast (design obvious), `outline` at moderate cost (the few real calls settled / recorded),
`detailed` at full cost (today's formalization-ready). No per-form threshold proliferation. Same for the
spec → task-gen ("finalized") bar — one invariant (spec coherent + design settled), even less
form-variation, with the grounding audit as the residual-catcher routing any straggler design decision
back to the spec (still pre-impl). The threshold is where no-deferral is enforced *uniformly* — no form
leaves the spec stage with an open design decision.

This makes `arc-plan`'s readiness states depth-relative (§ AWL touches the existing `arc-plan`): the
synthesis progression `fresh → rough → maturing → formalization-ready` stays, but "formalization-ready"
comes to mean *ready at the chosen depth*.

### No design-deferral stays universal (and the PRD line gets crisp)

The derivation axis is authoring-labor-to-*settle*, not amount-*left-open*: `outline` is faster than
`detailed` because the design was *more determinate coming in* (less to author), **never because it tolerates
more open design**. Both reach a fully settled design before impl. The line ARC already runs — **design
decisions settled upfront (invariant, all forms); implementation detail resolved during work (always, all
forms)** —
is what the current PRD's "Open Questions → resolve during work" must mean (impl-detail, never design). This
WU **sharpens that wording** to say so explicitly across all variants (landing the floor model's flagged
front-loading-duty constitutional sharpening). The industry "don't over-specify" idiom (Shape Up / GitLab)
is exactly the impl-detail latitude ARC already grants — no new deferral mechanism. The only
legitimately-scalable thing nearby is *which pre-impl stage settles a decision* (planning / spec / task-gen
grounding audit) — all upstream of the first impl commit.

### Spec-review procedure — a method (default) + an extension (optional ceremony)

The review *gate* is invariant (a spec-finalization review increment always fires); its *content* and
*cadence* scale and are configurable, via two ARC mechanisms:

- **`spec-review` method** — always loaded by create-spec; ships a **lightweight default self-review**
  (coherence + grounding pass, depth-scaled: quick at `brief`, fuller at `detailed`), overridable. The
  gate's default content. (May co-home with a broader review-method-family rather than AWL owning it
  outright — settle at spec.)
- **`spec-review`-ceremony extension** — fires at the spec-finalization fire-point, **inactive / empty by
  default** (like all extensions); opt-in to point at a team's procedure (the async-PR / comment-window /
  committee cadences). The strategy doc carries those as **informative industry precedent + a mapping, not
  ARC-enforced.**

So: gate invariant; method = shippable depth-scaled default; extension = optional external cadence.

---

## Mechanism

### Per-stage self-resolution, flag-free feed-forward

**Self-resolution over a conductor through-line — confirmed by the code.** The authoring workflows are
already self-contained stage-entries that resolve their own context at entry; per-stage depth resolution
is the natural extension, and a conductor threading depth across stages would be a retrofit (and cannot
be a hard requirement — see verb fate). **Feed-forward is flag-free: the upstream artifact's shape *is* the
depth signal** — `generate-tasks` reads the spec's realized template variant; `create-spec` reads the
draft's shape; each then self-resolves within the ratcheting `Class` floor. No threaded value, no
orchestrator state —
the resolve-then-load posture. (The conductor draft already uses "`plan-*` visibly uses expanded structure"
as a detection signal; this generalizes it.) The conductor, when it lands, is **depth-*direction*** (triage
trees, ergonomics, overridable / discussable) — entry + optional re-engagement, **not** a mandatory
cross-stage driver (a mandatory driver would re-bloat the conductor).

### `arc start` verb fate + no `--tier` flag

Shipped reality: `arc start --here` is **Planning-only cold-start** (scaffolds a Planning meta +
SESSION-NOTES into an existing worktree); the create-new *worktree-spawning* wiring is **CWC's** (it folds
the loose plumbing over Worktree Foundation's shipped `spawnWorktree` primitive — mechanism, not grammar);
**no `--tier` flag exists.** The resolution:

**Scaffolding (`init-work-unit` / `arc start`) is `Class`-agnostic** — it produces a uniform minimal Planning
container (branch + meta + Planning state) and carries no `Class` opinion. **`Class` is born in the planning
stage and lives in the content**, not in the scaffolding act. The `Class` field is mutable and ratcheting,
set / updated by whichever stage holds the information. Both pipeline orderings stay coherent flag-free:

- **Plan-first** (`arc-session → arc-plan → init`): explore, `Class` emerges, then init records the
  discovered `Class` at creation.
- **Container-first** (`arc-session → init → arc-plan`): init scaffolds with the `Class` field at its default
  (the only mildly awkward seam — harmless because the field is designed to ratchet), then `arc-plan`
  refines it.

Three clean roles, no flag: **`arc start` = stub-scaffolding; `arc-plan` = `Class`-determination; the
conductor = depth-direction.** **AWL ships the `Class` *model* (floor + ratchet + classification) and the
depth resolution inside the authoring workflows — not a CLI flag. `--class` is dropped.** Any eventual
create-new `Class` override would live on CWC's create-new command, consuming AWL's model.

### AWL touches the *existing* `arc-plan`, not the future conductor

The universal planning entrypoint must scale across all three depths *today* — leaving it
depth-blind means a `brief`-form WU still gets the only mode that exists (full facilitation), defeating
the lightness. AWL's minimal, light-touch addition: **make `arc-plan`'s readiness bar depth-relative** —
its synthesis states (`fresh → rough → maturing → formalization-ready`) stay, but "formalization-ready" comes
to mean *ready at the chosen depth* (a `low` pass hits it after minimal elicitation; a `high` pass needs
full maturity) — plus define the three planning shapes and the artifact-shape feed-forward. The rich triage /
decision-trees stay the conductor's job; AWL is the light-touch enabler.

### `composable-workflows`: forward-compat constraint, no hard dep

composable's extraction rule ("extract *whole conditional steps / blocks*; keep fine-grained intra-step
branches inline") dictates *how* AWL writes the depth differentiation in `create-spec` /
`generate-tasks`: as **whole-block depth variants** (a `low` task-pass structure vs a `high` one), not
fine-grained "if light, skip this sentence" — so they extract cleanly to fragments when composable lands. The grounding-audit
parameterization is the same shape. composable is a bare stub whose only `Depends On` (WOR) has shipped, and
it does not block — so this is a **soft coordination note, not a `Depends On`**. (Per-stage level
re-resolution *is* resolve-then-load applied per stage; composable's draft already calls the conductor's
depth-selection "the tier-axis instance of resolve-then-load", and depth-shifting generalizes that to every
pre-impl stage.)

### Ownership: AWL defines, the conductor elicits

One ceremony axis, owned by AWL; facilitation, owned by the conductor.

- **AWL owns the engine and the definitions.** The two axes; the `Class` classification + floor enforcement +
  promotion ratchet; the per-stage depths and their grammar (the spec template family, the task-list
  phase grammar, the planning-stage depth set); the depth-shift triggers / connections; and the
  `Class` → default-cascade mapping. This is a structure / workflow / template concern — AWL's charter.
  Everything here is built and workable from AWL, conductor or not.
- **The conductor owns ergonomics only, downstream.** It elicits, guides, and *assesses fit for* a level —
  recommends, and may flag a misfit ("this reads heavier than the level you picked") — but **never dictates,
  never defines the levels, never owns their triggers / connections / codification.** It applies AWL's
  codified `Class` → cascade mapping at the planning entry; it is the planning-stage facilitation instance,
  not a cross-stage driver.

This narrows the conductor and de-risks it (the conductor is P2, blocked on `loadset-composition`; AWL
depends only on shipped `worktree-foundation`), pulling the headline scalable-WU value into AWL.
**Write-back debt (`draft-arc-plan-conductor.md`):** its § 4 still says quick-tier generates a `## Scope`
task-list-header section, and it speaks of `atomic` / `quick` / `standard` tiers — both stale against this
model (spec is always a separate doc; the `Class` set is `light` / `heavy`). Rewrite to "invoke AWL's
`brief`-form spec template", realign its tier-awareness to `Class`, and map the conductor's `depth` modes
(`minimum` / `standard` / `expanded`) onto the planning-stage instance of `planning depth`
(`low` / `medium` / `high`). **Captured to `USER-INBOX` for routing to `arc-plan-conductor`.**

---

## Decomposition Model

The actionable decomposition procedure is AWL's chartered deliverable; `arc-plan-conductor` only routes to /
invokes it (and is far downstream, so the procedure cannot live there). Derived from the floor model plus a
focused external-research pass (stacked-diffs / RFC-impl / epic-story / review-sizing). CWC's parked four-WU
decomposition is the **worked requirements example and the procedure's acceptance test**.

### The WU upper boundary (mirror of ADR-021)

ADR-021's threshold answers "is this big enough to warrant a WU?" (Errand vs. WU — the *lower* bound).
Decomposition answers "is this too big to be **one** WU?" (WU vs. cohort — the *upper* bound). Same test,
other end; the symmetry is the spine of the procedure.

### Model B only — decompose into a cohort of self-contained WUs; Model A retired

When a concern exceeds one WU it becomes a **cohort of self-contained, single-owner WUs** (each its own
`meta-* + spec-* + tasks-*`, one branch, one PR) — **not** one WU sliced into stacked PRs (Model A). Three
grounds, weakest to strongest:

1. **One-branch-per-WU (ADR-019) makes Model A inexpressible.** "One WU across many branches" has no ARC
   form; it can only collapse into a stack of *WUs* — which is just Model B's delivery mode.
2. **ARC's review grain is already sub-PR** (per-task review increment, P2) — so Model A's "split PRs to get
   small reviewable units" benefit is largely served at a finer grain already. (This does **not** replace
   PR-level review — different eyes, different altitude; it just means A buys ARC less than it buys PR-grain
   shops.)
3. **Decisive — Model A forces shared mutable planning artifacts across branches.** One spec + one task list
   edited from N worktrees is exactly the cross-branch shared-mutable state that worktree isolation and the
   relocatability invariant exist to prevent: it either gravitates up to the cohort / backlog tier
   (detaching the design from any single task list — the spec stops being the live co-located upstream) or
   stays on one branch referenced cross-branch (clunky, conflict-prone, a relocatability breach). **Model B
   keeps each WU's meta + spec + tasks a self-contained, co-located, relocatable bundle** — the
   agent-native in-repo model working *because* the unit is self-contained. The external pass reached this
   independently: co-location / shared-mutable-artifact was "the strongest evidence for Model B" (Google's
   one-RFC-to-many-PRs "works at enterprise scale only because they accept spec drift").

"Stacked PRs" survives in ARC **only** as Model B's *dependency-ordered delivery mode* — a stack of WUs,
each its own branch, merged in order (idiomatic at WU-grain; cf. Graphite at commit-grain). The merge /
rebase *discipline* for executing such a stack is CWC's (`draft-concurrent-work-conventions.md`); AWL owns
the *decision* to decompose, CWC owns delivering the stack safely — they compose.

### The discriminator — orthogonality, not size

Decompose on **design / subsystem orthogonality + independent deliverability / ownership** — *not* raw
size. Size is a secondary symptom, and only when it spans *unrelated* subsystems (review-sizing research:
defect detection craters past ~200–400 LOC per review increment; ~800–1000 LOC across *orthogonal* systems
is a decompose signal). Tightly-coupled work designed as a whole stays **one WU even when large** — the
per-task review grain carries quality — and splits later only if it destabilizes. Concern multiplicity is
the trigger; LOC is a heads-up.

### Folded-in sizing requirements (the concrete protocol AWL owns)

- **Decouple planning-grouping from delivery-grouping.** One concern plans as a single coherent draft / spec
  but *delivers* as a stack of PR-sized WUs along natural deliverable / phase boundaries — no forced choice
  between "one concern" and "small PRs."
- **Sizing heuristics (sense oversize ahead).** Count distinct deliverables / independently-reviewable
  surfaces; estimate LOC + file count; test "reviewable in one sitting." Review effectiveness craters past
  ~200–400 changed LOC (Google / SmartBear studies); >~few-hundred LOC / >~8–10 files / multiple independent
  review surfaces → stack-or-cohort, not one WU.
- **Stack vs. cohort.** Sequentially-dependent → stack (ordered PRs); independent-ish → cohort (parallel
  WUs). ARC already has the levels — **cohort ≈ epic**, **WU ≈ story / one reviewable PR**; the gap is the
  codified concern → WU-count mapping.
- **When to split.** At PRD / decomposition time, not mid-execution (a mid-execution split is a costly
  escape hatch).
- **Sizing-norm co-home.** The sizing standard itself co-homes in `strategy-work-organization` (a WU-sizing
  standard the procedure consumes), not authored here.

### Two guard rails

- **Lower rail — don't split below WU-warrant.** Decompose only until each piece independently warrants a WU
  (ADR-021 threshold). A piece too small is a **phase of a sibling** or an **Errand**, never a peer WU.
  ("Making a 3-task piece its own WU feels silly" is this rail firing.)
- **Upper rail — don't split coupled one-design work for size alone.** Over-decomposition is a real failure
  mode (the microservices premature-split trap: chatty coordination, onboarding cost). A personal
  under-decomposition bias will feel the lower rail most; the framework needs both for general correctness.

### Timing — gated on design maturity

Decompose when the design is **stable enough that the cuts are real**, not before. Speculative design → hold
as one unit and iterate; settled design → decompose. Mechanically: a **provisional cut at draft-settle**
(name the pieces) **confirmed / re-cut at spec / task time** (size them — merge a piece that came out too
small, split one too big). Iterative, not a single blind upfront gate. CWC parked at *terminal planning*
(= design settled) is the proof case: that maturity is exactly what makes it decomposable now.

### The bounded grouping taxonomy: nested cohorts, WU leaf

Decomposition does **not** produce an arbitrary cohort tree, but it does need **one bounded level of
nesting** — because the common case is decomposing a WU that is *already* a cohort member (AWL itself, a
`principle-anchored-core` member). There is **one grouping kind — the cohort** — and coordination is a
*property it carries by degree*, not a separate category:

- **Cohort** — any deliberate grouping of sibling WUs. It **always carries a `cohort-{name}.md`** (no
  exceptions — § The cohort doc), whose required floor is a one-paragraph **Purpose** and whose body
  *accretes* coordination content (shared contracts, closeout criteria) as the siblings tighten. A grouping
  that only *organizes* (loosely-coupled thesis siblings, e.g. `principle-anchored-core`) carries a
  Purpose-only doc; one that actively *coordinates* (e.g. `agile-parallelism`) carries the fuller body. The
  difference is **how much the doc says, not what kind of thing the grouping is.**
- **WU** — the leaf deliverable (one branch, one PR, its own `meta-* / spec-* / tasks-*`).

"**Theme**" survives only as **informal prose** for a top-level, mostly-organizing cohort — never a distinct
schema kind, never a doc-less exception. (Earlier drafts made theme a categorical doc-less tier; it broke at
the single-segment `Cohort` value, where `principle-anchored-core` and a genuine top-level cohort are
syntactically identical and disambiguated *only* by doc-presence. Collapsing to one kind with a Purpose-floor
doc dissolves the wrinkle: every grouping has a doc, so doc-presence stops discriminating anything.)

**The cap is one level of nesting:** at most `<cohort>/<subcohort>/<wu>` — never three grouping segments.
This is a plain structural bound (anti-sprawl), **not** a limit on coordination: *both* levels may coordinate
(an outer cohort with its own shared contracts above an inner one is allowed — indeed `principle-anchored-core`
is already accreting toward it). Each level above the WU is optional (`agile-parallelism` is a top-level
cohort with nothing above it; a standalone WU has neither). The required one-paragraph Purpose doubles as a
**reality check on the grouping** — if you can't expand the slug into a sentence that distinguishes this
cohort from "a pile of loosely-related WUs," it shouldn't exist (anti-sprawl from the content side,
complementing the nesting cap from the structure side).

Nesting lives in a **path-valued `Cohort` field** (`principle-anchored-core/agile-wu-lifecycle`), not a
distinct artifact type: one `cohort-{name}.md` shape and one `template-cohort.md` at every level — an inner
cohort differs from a top-level one *only* by path depth (capped at two segments) and by how much its doc
says. "Sub-cohort" is prose framing, never a `subcohort-*` prefix or a second type — a level change is a
path-value edit, not a rename + retype. The on-disk dir mirrors the path
(`backlog/planned/<cohort>/<subcohort>/<wu>/`); the relocatability invariant (pure `git mv` on state
transitions) is unaffected (just more dir levels), and the cohort-consistency invariant generalizes from
"field matches parent dir" to "field-path matches dir-path."

### A decomposing WU graduates to a cohort

When a WU decomposes it **graduates into a cohort** carrying the original name: AWL → cohort
`agile-wu-lifecycle` (members D1–D4), `cohort-agile-wu-lifecycle.md` repurposed from this draft's
coordination content, nested under the `principle-anchored-core` cohort. This is the recursive shape — a
*standalone* WU that decomposes *becomes* a cohort; a WU *already* in a cohort graduates to a **sub-cohort**
under its existing parent. It **preserves the name** — and so the browsing / narrative / mental-model
references — at the right altitude (the pieces directly serve `agile-wu-lifecycle`, which serves
`principle-anchored-core`).

The "name loss breaks references" worry splits cleanly and dissolves:

- **Dependency edges (`Depends On`) are always WU→WU**, never group-level. CWC depends on the scalable
  pipeline + the decomposition procedure = specifically the pieces that deliver them (D1 / D2 / D3, not the
  D4 sweep), so it re-points to those WUs regardless of the name. Dependencies bind deliverables, not
  groups — name preservation never had to carry them.
- **Narrative / browsing references** (WORKING-MEMORY, sibling drafts, the cohort docs) are what the
  preserved cohort name saves — a WU→cohort *rename*, not a deletion, swept at graduation.

`ROADMAP` / `STATUS.USER` render from metas, so regen handles the WU→cohort shift automatically (no
`agile-wu-lifecycle` WU node; a cohort grouping of the in-flight pieces) — no manual roster anywhere.

### The cohort doc — every grouping's identity record (ADR-022 family)

`cohort-{name}.md` joins the structured-record family alongside the meta record (ADR-022), and is
**constitutive of every cohort** — its presence is what marks a dir as a deliberate grouping rather than an
incidental parent. Its content scales from pure orientation to full coordination:

- **H1 + uniform preamble** (from `template-cohort.md`).
- **Required floor — a one-paragraph `Purpose`:** an expansion of the slug — *what this group of WUs is
  about*, the shared goal they serve. The minimum that makes the file non-vacuous; also the grouping's
  reality check (§ taxonomy). A purely-organizing cohort stops here. The Purpose line may **sharpen** into a
  thesis as the grouping tightens.
- **Optional H2 — coordination content (accretes above the floor):** shared contracts (cross-member design no
  single WU owns), closeout criteria, and a parent-cohort pointer (derivable from the `Cohort` path —
  rendered / templated, not hand-maintained). There is **no `Coordinated` flag**: coordination is a continuum
  of how much the doc says, with no discrete line to mark.
- **H3-per-WU, keyed by slug — a *partitioned coordination surface*, not a membership roster.** Each member
  edits only its own H3 section, so parallel writers line-merge cleanly — the git-tree analog of the
  notes-ref entry-union (no tombstones needed: a tracked file handles deletions natively, and the partition
  gives convergence).

**Membership stays derived** from each WU's `Cohort` field (the meta record is the source of truth; the
meta template already declares "sibling list derived"). The H3 set is therefore a *subset* of members — a WU
gets a section only when it has cross-cutting coordination to record; a missing section just means "nothing
to coordinate," with no sync obligation and no drift. The doc never carries a roster or a status table (those
render). Orphan H3 sections (a renamed / removed WU) are caught by the cohort-consistency invariant, which
doubles as this doc's schema validator (Purpose present; H3 slugs ⊆ derived members). The cohort
doc carries **coordination only — never design that drives a task list** (specs feed task lists and validate
completion; coordination docs do neither). Exact field / section set is a prototype-iterate artifact, like
the spec templates.

### Decomposition (decide) vs. graduation (execute) — a method and a lifecycle workflow

The two are **semantically distinct**, split across the method/workflow line ARC already uses (decision
*methods* like test-first / issue-triage vs. lifecycle *workflows* like init / integrate):

- **Decomposition is a planning-time *method*** — the discriminator + rails + timing that *decide* the cut
  (pieces + dependency edges + the cut map). It runs inside planning (an `arc-plan` phase, or a `create-spec`
  phase); it produces a decision, not a structural change.
- **Graduation is a lifecycle *workflow*** — it *executes* a confirmed cut by transforming a live WU into a
  cohort. It is a genuine lifecycle transition (a WU changing *what it is*), not mere decomposition cleanup —
  which is why it earns its own workflow + PR story rather than being a tail of the method. "Graduate" is
  ARC's established word for a lifecycle promotion (`init-work-unit` *graduates* a backlog stub → active); a
  WU graduating to a cohort extends that sense.

The relationship is **not 1:1**. Graduation always follows a decomposition decision (you only reach a cohort
by splitting), but decomposition does **not** always trigger graduation: decomposing a concern that is *not*
a live WU (a backlog draft never activated, or planning that concludes "cohort from the start") just creates
the cohort + members directly — no origin WU to park / retire. Graduation is the variant *with a live
origin*, and that origin is what adds the park-shaped exit below.

### Graduation delivery lifecycle — a park-shaped exit

Graduation reuses the **park** path's mechanics (`active/ → backlog/`, PR to `main`, branch + worktree
teardown) with cohort-specific choreography. It is **not** an `integrate-work-unit` (no code deliverable, no
`completed/` archive):

- **Runs on the originating planning branch**, as that WU's terminal act — planning concluded "this is a
  cohort," so materializing the cohort *is* the deliverable. No fresh branch; no `Active` step.
- **Steps:** mint the cohort (dir + `cohort-{name}.md` from the origin draft's coordination content) →
  **backfill the parent cohort's doc if absent** (a nested graduation under an existing parent that lacks one
  — e.g. `cohort-principle-anchored-core.md`, Purpose-only — since every grouping carries a doc) →
  scaffold the N member stubs in `backlog/planned/<cohort>/<subcohort>/` (`meta-* + draft-*` each, `Cohort`
  path-set, `Depends On` edges encoding order) → distribute the origin draft's design into each member draft
  (plan-grouping → delivery-grouping) → re-point *incoming* `Depends On` per the cut map → **retire the
  origin `meta-*` + `draft-*`** (deleted; fully redistributed) → regen `ROADMAP` → park-shaped PR to `main`
  → branch / worktree teardown.
- **No new State value:** the origin meta is deleted — the WU *ceases to be a WU* because it became a cohort.
  The State machine governs existing WUs; the git PR + a one-line origin note in the cohort doc are the
  record. **No `completed/` entry** for the origin (its outputs are *future* work in `backlog/`); the
  **cohort** carries the eventual `completed/` archive when its last member ships.
- **Members land uniformly in `backlog/planned/`;** activation is a separate, deliberate act per member
  (`init-work-unit` Path A: backlog → active → fresh `plan/<member>` branch), in dependency order. The cut
  stays provisional — re-cut at each member's spec time.
- **Relationship to `integrate-work-unit`:** graduation is a *separate* workflow (keeps integrate
  code-shipping-focused) that **shares the PR-merge-branch-cleanup primitive** (DRY), plus a **lightweight
  graduation-PR description variant** (story: "decompose X → cohort + members, each ready to init").
- **Draft-retirement (judgment flag):** lean *retire* the origin draft (content fully redistributed; git
  history archives the holistic form) over keeping a cohort-level design appendix (stale-duplicate risk).
- **Bootstrapping:** the graduation workflow is itself a D3 deliverable, so AWL's own graduation runs the
  **manual** park-shaped path above (mirroring the interim manual park / resume paths), codified in D3 after.

### Concurrency — the cohort doc is the one shared-mutable planning artifact (CWC seam)

`cohort-{name}.md` is the deliberate exception to per-worktree isolation (every other planning artifact is
per-WU-on-its-branch). It rides plain git line-merge — *not* the notes-ref convergence machinery — so the
H3 partition above is what keeps concurrent edits safe. Two notes flow to CWC, which owns runtime
concurrency safety:

- **The advisory cross-cutting gate has a blind spot here.** The Errand matrix's "advisory gate when the
  owning WU is in flight" keys on a single owning WU; the cohort doc is owned by the *cohort*, so the gate is
  ill-defined for it — the most-shared artifact is the least-covered. CWC's behind-base detector is the net
  that does apply (advisory, at resume).
- **Escape hatch if partition proves insufficient:** route `cohort-{name}.md` edits as errands through the
  primary worktree (serialized via `main`) rather than riding WU-branch PRs — trading small errand overhead
  for eliminating cross-branch contention. Lean: partition-first (cheap); serialize-via-main as the fallback.

### Plan-grouping ≠ delivery-grouping

One concern **plans** as one draft (a single design exploration); at decomposition it becomes **N
self-contained WU specs + cross-WU coordination** in `cohort-{name}.md`. The cohort doc carries coordination
only — never design that drives a task list (specs feed task lists and validate completion; they are not
coordination docs).

### Deliberate divergence from Shape Up

Adopt Shape Up's *self-contained vertical-slice unit* shape; **reject its design-co-evolves-during-build
timing.** ARC stays spec-directed (P1) — but as a best-effort *goal*, not an absolute: settle everything
*settle-able* up front and never *consciously* defer it, while accepting that genuine unforeseeable unknowns
surface during impl (no plan survives first contact) and are handled by routing them back to the spec. The
divergence is *deliberate under-specification as a design method* (Shape Up) vs. *best-effort settle +
disciplined emergence-handling* (ARC) — not "100% upfront vs. co-evolve."

### Acceptance test

The procedure must cleanly **re-derive CWC's D1–D4 from CWC's one settled draft.** CWC is both the worked
requirements example and the first customer (parked pending this support). If the orthogonality
discriminator and the two rails produce that decomposition, the procedure works; if it strains, the rule is
wrong.

### Open / deferred (decomposition)

- **Pipeline fire-point** for the procedure — a new decomposition workflow vs. a phase inside `create-spec`.
  Couples with the graduation workflow above (decide-the-cut vs. execute-the-cut).
- **Cohort-as-first-class — resolved** (see § The bounded grouping taxonomy / § The cohort doc): the
  path-valued `Cohort` field + the constitutive `cohort-{name}.md` managed record, membership derived. The
  earlier "wait for shared lifecycle events" punt is overtaken — decomposition *is* the recurring event that
  makes the structure earn its keep. Remaining sub-question: whether a cohort needs a coordinator / DRI for
  its doc (lean no — over-structure; `Owner` stays WU-level).
- **`template-cohort.md` body** — the exact H2 field set + H3 section shape are prototype-iterate (like the
  spec templates).
- **Reconciliation debt.** `strategy-work-organization` § Task Lists and Branches (stacked-PRs / phased /
  team-sub-branch — pre-ADR-019 leftovers that contradict one-branch-per-WU) needs rewriting to the B-only
  model; § Work Character / § Spec-Flow Invariants § Scaling axes / § Escape-hatch still name the retired
  atomic tier. Compounds with the tier reconciliation — one DEV-RULES / strategy sweep at activation.

---

## Lifecycle Integration (activate / integrate / archive)

Resolves the former scope items 7 / 7a (tier-aware ceremony scaling), evaluated 2026-06-04 against the
consolidated model. The headline: integration ceremony is **not tier-forked** — it is one invariant
procedure whose cost scales naturally with what was produced.

### Integration is not a selectable depth

Unlike the three pre-impl authoring stages, integration ceremony is **not a user-selectable per-stage
depth** — it *consumes* what was produced rather than *choosing* how much to produce. So the
planning-depth / spec-form axis (`brief` / `outline` / `detailed`) does **not** reach it. It stays
consistent, lightweight-by-default, and configurable independently of that axis.

### Not tier-forked: one invariant procedure, cost-scales

The flagged question — "does integration nonetheless derive *some* weight from the realized tier?" —
resolves with a distinction:

- **Weight as *cost*: yes, derivatively.** Integration costs what the produced artifacts cost, and tier
  shaped those artifacts upstream. A `light` WU has fewer phases / a lighter spec / a shorter completion
  record, so the same steps cost less. The correlation is real.
- **Weight as a *selected ceremony variant*: no.** The mechanism is **consume-what's-there, never
  branch-on-`Class`.** A `trivial-sweep | standard-sweep | full-sweep` selector keyed on `Class` would
  re-introduce exactly the fork the rest of the model rejects everywhere (task-list one-grammar;
  grounding-audit parameterize-don't-fork; spec-alignment binary-cost-scaling). It is the same answer the
  floor model gives for spec-alignment checks, lifted to the integration boundary.

### Completion record: meta-appended, self-sizing

The shipped model appends **Release Notes** (user-facing; later part of a changelog) + **Completion Notes**
(internal narrative) **to the meta file** by default — there is no standalone `completion-*` doc, and no
"completion doc vs PR-description-as-archive" choice to tier on. The record **self-sizes by what there is to
say**: a `light` WU with a mechanical change writes two sentences and may omit Release Notes (nothing
user-facing → nothing written, a *content* outcome, not a `Class` rule); a `heavy` WU writes several paragraphs.
Same append-to-meta act, zero forks, scaling right down to near-nothing — which absorbs the former
"atomic gets just a PR description" case without any tier logic. No floor-vs-configurable knob needed; "no
record" is just the bottom of the natural size range, and the *verification* it records (P1 intent-vs-outcome)
is itself the floor.

### Activate: the spec-presence gate

The old "skip plan / PRD checks for the lighter tier, require for standard" has no referent: the Errand path
has no activate at all, and `light` / `heavy` both carry a spec (they differ in the spec's form, not its
presence). What survives is the invariant **spec-alignment gate** — "a spec exists at the resolved form" —
which cost-scales (near-instant for a `brief`). WOR's `review.planning_checkpoint` opt-in
(`pre-execution-graduation` extension) stays — orthogonal, applied wherever planning happens, never
`Class`-gated on / off. Planning itself happens at *all* levels (depth-scaled), so there is no "bypass planning"
branch — only Errands (below the wrapper) have no planning workflow.

### AWL's residue: artifact-presence-tolerant integration

After removing the atomic rows (Errand-owned, shipped) and the WOR-absorbed machinery, AWL's contribution to
the integrate / archive workflows shrinks to a **single requirement**:

> Integration is **artifact-presence-tolerant, not artifact-presence-assuming** — it consumes whatever the
> resolved depth produced (a `brief` spec, a one-phase task list, no separate completion doc) without
> requiring full-shape artifacts.

That is the legitimate residue of tier-introduction: WOR shipped integration around the full shape; AWL's
tiering means it must tolerate lighter shapes. One requirement, not a tier-branched workflow rewrite.

### Upstream-settled (WOR) and Errand-owned (shipped)

The following — claimed by the original scope items 7 / 7a — are **not** AWL's:

- **State machine** — WOR settled the strict 4-state machine `Planning | Active | Integrating | Shipped`,
  folding merge-position into `Integrating` (no separate `**Integration:**` field; no `Paused` / `In
  Progress`). Partial supersession is an optional `**Superseded By:**` annotation, not a state variant — a
  partially-superseded WU still ships `Integrating → Shipped` normally (`integrate-work-unit` § Handling
  Partially Superseded Work; framing settled under WF Phase 7.5.a).
- **CodeRabbit-flagged contradictoriness fix** — the `State: Complete` + integration-step `Next Action`
  contradiction is resolved by WOR's `Integrating` state itself.
- **sweep-as-you-go**, **`archive.cadence` config**, **deferred-sweep variant**, **per-worktree isolation
  invariant** (meta on the WU branch only, not on main while in flight) — all WOR. The `archive.cadence`
  default (`with-integration` vs `deferred`) affects whether `archive-work-unit` exists as a separate doc,
  **not** the tier-awareness logic (which is "none" — there is no fork).
- **Atomic-tier integration** — owned by the Errand model (`run-errand`: `chore/<slug>` PR under `full`,
  base commit under `partial`; state derived from branch + PR). Shipped via `errand-enablement` +
  `work-routing-discipline`. The promote-to-WU path is `run-errand → init-work-unit` (mint `meta-*`, rename
  `chore/` → `<type>/`).

---

## Invariants AWL Owns

Two structural invariants surfaced during this planning pass; AWL owns each *invariant*, while the *rule
generalization* and *enforcement* route to their codified homes.

### Artifact relocatability invariant

WU artifacts (`meta-*`, `draft-*`, `spec-*`, `tasks-*`, companions) relocate between lifecycle states
(`active/` ↔ `backlog/` ↔ `completed/`) as a function of State — a graduate / park / archive move must be a
pure `git mv` with **no content edit**. That holds only if artifacts carry **position-independent refs**
(filename-only, per DEV-RULES.ARC § `.arc/` artifact references); relative-path links break on move. AWL
owns the *invariant* (a lifecycle property of the moves its workflows perform); the *rule* generalization
(close the source-side gap — the rule today permits relative paths to stable docs, which still break when
the source itself moves) routes to DEV-RULES.ARC; *enforcement* (forbidden-pattern hook extended to
source-side link-defs + a sweep of the ~38 path-style link-defs currently in active / backlog movable
artifacts) routes to `quality-gate-hooks`. Surfaced live 2026-06-03 — both the CWC park and this WU's
graduation hit relative-link breakage on move, fixed by converting both drafts to filename-only.

### Cohort-consistency invariant

A WU's path-valued `**Cohort:**` field must match its `backlog/planned/<cohort>[/<subcohort>]/` parent
dir-path (generalized from single-segment to path-matching for the grouping taxonomy); **every grouping dir
carries a `cohort-{name}.md`** (constitutive — its presence is what makes the dir a cohort rather than an
incidental parent; no doc-less grouping exists, so doc-presence is invariant, not a theme-vs-cohort
discriminator) carrying at least a **`Purpose`** floor; and a cohort doc's **H3 slugs must be a subset of
derived members** (no orphan sections — membership is derived from `Cohort` fields, never a roster in the
doc). Field-vs-dir drift is a silent failure (a WU assigned to one cohort but filed under another). AWL owns
the *invariant* (cohort semantics — what a cohort is, its boundaries, the one-level nesting cap, derived
membership — is this WU's charter); the check also serves as the cohort doc's schema validator (Purpose
present; H3 slugs ⊆ derived members); *enforcement* (a backlog-scoped structural guard; `active/` is flat and
`completed/` ordinal, so neither applies) routes to `quality-gate-hooks`, same family as its existing
forbidden-pattern / layout-drift checks.

---

## Meta Schema Changes

`**Class:**` and `**Design:**` are schema-owned meta fields with **`Class`-conditional validity** (a
cross-field constraint a flat template cannot express), per ADR-022's structured-record meta model; the State
machine's transitions are schema events, not free-text field edits. See
`adr-022-managed-operational-state-documents.md` § Coordination.

### `Class` field

Source of truth for the work's `Class` (planning weight), declared / ratcheted through the authoring stages
(§ Mechanism). Values `light` / `heavy` — `heavy` iff either axis (derivation or scale) is high. Groups with
the classification fields (`Depends On` / `Cohort` / `Priority`). Recorded always; rendered — open (lean off;
§ Record but don't necessarily render). Existing in-flight WUs migrate to `heavy` (matches their current
ceremony level). **Migration mechanism — open:**
auto-migrate at session-init vs. manual (PRD / spec decision).

### `Design` field

Pointer to where the work's specification lives. Introduced **upstream** as a generic optional pointer in
Session-Operational Flow Phase 1 (value `draft-{name}.md` in Planning); AWL adds `Class`-specific value
semantics + `Class`-aware validation on top. **Orthogonality with `Origin`** (WOR's Origin ⊥ Design): `Design`
always points at an ARC-owned planning artifact; external trackers (GitHub issues, Jira, Linear) go in
`Origin`, never `Design`. The two are independent.

Values:

- `draft-{name}.md` — Planning state (introduced upstream).
- `spec-{name}.md` — Active+, **all forms** (filename stable / relocatable; form lives in template + H1,
  not filename).
- (Errands have no meta and no `Design` field; any external-tracker reference for WU work goes in `Origin`.)

**`Class`-aware validation — open:** should pre-commit hooks validate `Design` matches `Class` expectations
(`heavy` points at a `detailed` spec; `light` at `brief` / `outline` — modulo the `outline` straddle, where
either `Class` is valid)? Probably warn-not-block; tolerates
in-flight transitions. External-tracker URLs are out of scope (they live in `Origin`). PRD / spec decision.

### `Cohort` field — path-valued

The existing `Cohort` field becomes **path-valued** to carry the grouping taxonomy (§ The bounded grouping
taxonomy): a single segment `<cohort>` for a top-level cohort, `<cohort>/<subcohort>` for a nested one (e.g.
`principle-anchored-core/agile-wu-lifecycle`), or `[none]` for a standalone WU. Capped at two segments (one
level of nesting). It stays the source of truth for membership (the sibling list is *derived*, never stored
as a roster). The path mirrors the on-disk dir-path, enforced by the cohort-consistency invariant
(§ Invariants). A sibling **`cohort-{name}.md`** managed record (ADR-022 family) is constitutive of every
cohort — required floor a one-paragraph `Purpose`, coordination content accreting above; `template-cohort.md`
is a new template deliverable.

---

## Design Decisions

### `Class` as structural differentiation, not opt-in optionality

Each spec form has a distinct artifact shape — `brief` (paragraph spec, one phase) vs `detailed` (PRD / RFC,
phased tasks). This is structural, not "skip optional steps." Reviewers, agents, and tooling read the
explicit `**Class:**` field and the artifact shapes; they don't reason about which optional steps were
skipped. (`Class` is not perfectly inferable from spec form — the `outline` straddle means an `outline` spec
may be `light` or `heavy` — which is exactly why `Class` is recorded explicitly, not derived.)

### Scaffolding is `Class`-agnostic

`arc start` / `init-work-unit` produce a uniform minimal Planning container; `Class` is born in the planning
stage and lives in the content, not the scaffolding act. (Supersedes the original "default tier at
`arc start` is `quick`" decision — there is no `--class` flag and no quick tier; the `Class` field ratchets
from its default.)

### The internal spec is always a separate doc

The lightest spec is a separate `spec-{name}.md` at `brief` form — never a `## Scope` header section in the
task list (ADR-020's invariant floor). This honors the spec-directed principle uniformly: "spec lives in a
doc, regardless of `Class`." (Supersedes the original quick-tier "scope section is prose, not frontmatter"
decision, which assumed a task-list-header spec.)

### Discipline preserved below the wrapper

The mandatory review-increment stop applies to Errand work too, at commit boundaries instead of
task-list-checkbox boundaries: each commit is a review increment; quality gates run per commit; the user
reviews and confirms before the next. This *is* the discipline floor — it does not belong to any tier.

### Atomic-the-character vs atomic-the-shape

"Atomic" describes the work's *character* (single bounded concern), not a tier. The shape it takes adapts to
protection mode: under `partial`, atomic work goes direct-to-main with no branch or meta; under `full`, the
same atomic intent becomes an **Errand** (a `chore/<slug>` branch + PR), promoting to an atomic-character
WU only when the WU threshold trips. The word's meaning is consistent across modes; the framework's shape
adapts. (Coordination history: WF ships its spawn primitive tier-agnostic and leaves the life-phase
parameter — `Planning` vs `Active` → branch-prefix follows — as the seam; EE owns the `errand` operational
path; `work-routing-discipline`'s 2026-05-31 re-pivot made the Errand path execution-only via re-enterable
`run-errand`. AWL owns only the *tier-side* reconciliation — atomic-character defaults to an Errand,
promoted to a WU when the threshold trips — realized via `run-errand → init-work-unit`.)

### Incidental retirement, not repurposing

The `incidental/` category was a workaround for ARC lacking mobility infrastructure. With worktree isolation
handling interrupts (an atomic-character interrupt defaults to an Errand) and the tier model handling
lighter ceremony, the category has no remaining function. Renaming or repurposing would create migration
confusion; clean retirement is simpler. WOR already retired the `incidental/` category *prefix* (as part of
Conventional Branch alignment) and the pause-pointer fields; this WU retires the remaining *conceptual*
references in workflows, strategy docs, and templates that frame incidental as a distinct WU shape — a
mechanical sweep.

---

## Dependencies and Sequencing

### Upstream (all shipped)

- **Work Organization Reform** — the consolidated boundary workflows (single activate / integrate pair under
  single-branch-per-WU lifecycle), sweep-as-you-go foundation, per-worktree isolation invariant, the 4-state
  machine, and `archive.cadence` config. This WU's tier-aware adaptations layer on top. Hard upstream
  dependency.
- **Worktree Foundation** — worktree-aware activation substrate, the `spawnWorktree` primitive, and
  `arc start --here` (Planning-only cold-start). The recorded `Depends On: worktree-foundation`.
- **Session-Operational Flow** — the `**State:**` model and meta-file timing split (which fields belong on
  commit vs. handoff); introduced the generic `**Design:**` pointer (Phase 1).

### Downstream

- **Concurrent Work Conventions** — carries `Depends On: agile-wu-lifecycle` (a **formal hard delivery
  dependency**: CWC's four-WU decomposed delivery cannot be built until AWL ships the scalable spec / task
  pipeline + the decomposition procedure). The *runtime* edge is dropped (CWC's merge-safety mechanism needs
  none of AWL's tier model); only the *delivery / build-order* edge is hard. CWC is parked to
  `backlog/planned/agile-parallelism/` so its settled draft is available on `main` as AWL's worked
  requirements input and the decomposition procedure's acceptance test. CWC also owns the create-new
  *worktree-spawning* `arc start` wiring (thin plumbing over WF's `spawnWorktree`); AWL ships only the tier
  *model* that command consumes.
- **Quality Gate Tiers and Hook Integration** — gate-tier mapping per WU tier is that WU's PRD work; this WU
  establishes that tiers exist. Also the enforcement home for both invariants above (relocatability,
  cohort-consistency).
- **ARCd Rebrand** — tier vocabulary absorbed into the rename pass.

### Soft coordination (not dependencies)

- **`composable-workflows`** — forward-compat-as-fragment constraint on how AWL writes depth
  differentiation (§ composable-workflows). Not a `Depends On`.
- **`arc-plan-conductor`** — AWL defines, the conductor elicits (§ Ownership). AWL does not depend on it;
  benefits from its `Class`-aware orchestration if it ships first, degrades gracefully if not (conductor
  defaults to `heavy` behavior until AWL's `**Class:**` field exists). The conductor is P2, blocked on
  `loadset-composition`.
- **`configuration` cohort** — if the user-above preference becomes a config knob, its home is the
  per-developer substrate (`config.user.yml`). Soft.

### Recommended sequencing

Work Organization Reform → Worktree Foundation → **Agile WU Lifecycle** → Concurrent Work Conventions. AWL
is sequenced next-up after the post-WF layer settles.

---

## Pressure Points and Risks

### `Class` drift via under-specification

Adopters may default to `light` for everything to avoid `detailed`-spec ceremony, even when work is
genuinely `heavy`. Mitigations: the self-diagnosing depth-shift signal (a heavy downstream artifact over a
minimal spec *is* the floor-was-set-too-low signal, and reaching for a `detailed` spec *is* the graduation);
the explicit `**Class:**` field invites reviewer scrutiny ("Class: light" on a complex change has the
explicit signal to push back); strategy-doc guidance with concrete examples on each side of the derivation
line (and the scale trigger).

### Constitutional change scope

`Class` definitions, the derivation-line and scale-trigger boundary tests, and the scaled-ceremony /
invariant-discipline framing are
constitutional-level additions to DEV-RULES.ARC, comparable in scope to ADR-016's commit-control downgrade.
Companion ADR required to document the architectural shift (parallel scale to ADR-016). The flagged
front-loading-duty sharpening (§ No design-deferral) lands here too.

### Incidental retirement ripple

Retiring the remaining incidental *concept* references affects workflows, strategies, status template,
examples. Mechanical but broad. Risk: orphaned references lint / CI doesn't catch. Mitigation: thorough grep +
integration-test coverage on activate / integrate / archive flows. (The category *prefix* is already
WOR-retired.)

### `arc start` command surface

ARC's activation is workflow-based; the create-new `arc start` surface (CWC-owned) is a real shift, and every
CLI subcommand adds maintenance / docs / discoverability burden. Resolution: `arc start` is the workflow's
automation for the bounded case; the workflow document stays canonical specification; the command is its
packaged form. (AWL adds no flag — only the `Class` model the command consumes.)

### Light WU discoverability

Short-lived `light` WUs could make session-init's active-WU enumeration noisy. Mitigation: `Class`-aware
orientation summary ("3 active WUs: 1 heavy, 2 light"); auto-cleanup of completed-but-not-swept WUs at
session-init. (Less acute than the original "atomic-tier" version of this risk, since atomic-character work
is now an Errand, not a WU.)

---

## Open Questions / Deferred

Carried into spec / PRD time. Resolved threads are recorded above; these remain genuinely open.

- **`outline` / `brief` spec template *bodies*** — research-grounded (§ Spec shapes); the template bodies
  themselves are authored at spec time.
- **Detailed-subtype template structure** — separate `-prd` / `-rfc` templates vs. one flexing template
  (felt-difference test + dogfooding).
- **Per-phase grounding-audit interlock invariance** — lean invariant, not 100%; confirm at spec.
- **Planning + spec + task shapes** — starting points, explicitly open to post-integration dogfooding
  refinement (scale up / down within reason).
- **User-above preference: config knob vs. in-process steer** — deferred until the mechanical design is
  known; forward-compat binds now (§ User-above preference).
- **Decomposition pipeline fire-point** — new workflow vs. a phase inside `create-spec`.
- **`Class` render-inclusion** — recorded always; rendered only if the parallelism-planning view
  demonstrates value.
- **`Class`-aware `Design`-field validation** — warn-not-block, probably; PRD / spec decision.
- **Existing-WU migration mechanism** — auto-migrate at session-init vs. manual, for the `Class` / `Design`
  field additions.
- **Default `Origin` population** — should `arc start` (when CWC delivers create-new) default-populate
  `Origin` from the current branch's linked PR / issue (via coord-probe) when a `coord.adapter` is
  configured, or always require explicit `--origin`? Auto-population is convenient but risks pointing at the
  wrong ticket. PRD decision.

---

## Scope

### In scope

1. **The `Class` / planning-depth model** — `Class` (`light` / `heavy`, `heavy` iff either axis — derivation or
   scale — is high) + `planning depth` (`low` / `medium` / `high`, per-stage) + three spec forms (`brief`
   / `outline` / `detailed`). Constitutional amendment to DEV-RULES.ARC establishing the `Class` definitions,
   the two boundary tests (derivation line + scale trigger), the scaled-ceremony / invariant-discipline
   framing, and the front-loading-duty sharpening. Companion ADR (parallel scale to ADR-016).
2. **Meta schema** — `**Class:**` and `**Design:**` `Class`-specific value semantics + `Class`-aware
   validation, layered on the upstream-introduced fields; migration handling for existing WUs.
3. **Spec template family** — `template-spec-brief.md` / `-outline.md` / `-detailed-*.md` (PRD / RFC
   subtypes); `Spec ({form}): {name}` H1; the form-agnostic `create-spec` reframe ("PRD" → "detailed
   spec"); the depth-relative spec-ready bar.
4. **Scalable `create-spec` / `generate-tasks`** — per-stage depth self-resolution, flag-free
   feed-forward, whole-block depth variants (composable-ready); task-list one-grammar (1..N phases +
   always-present verification); grounding-audit depth parameterization (per-phase interlock retained).
5. **`arc-plan` depth-relativity** — depth-relative readiness bar; the three planning shapes;
   artifact-shape feed-forward. (Light-touch; rich triage stays the conductor's.)
6. **Decomposition method** (planning-time *decide*) — the orthogonality discriminator, two guard rails,
   design-maturity timing, plan-vs-delivery-grouping, Model-B-only; sizing heuristics consuming the
   `strategy-work-organization` sizing standard. Acceptance test: re-derive CWC's D1–D4.
7. **Grouping taxonomy + the graduation workflow** (lifecycle *execute*) — the bounded nested-cohort grouping
   taxonomy (one kind, ≤2 deep, coordination by degree); the path-valued `Cohort` field; the constitutive
   `cohort-{name}.md` managed record (ADR-022 family; H1 + `Purpose` floor / optional H2 coordination /
   H3-per-slug; membership-derived) + `template-cohort.md`; and the
   **graduation workflow** (park-shaped exit; transforms a live WU → cohort; shares `integrate`'s
   PR-merge-cleanup primitive + a graduation-PR variant). Forward-compat with composable-workflows.
8. **Lifecycle integration adaptation** — the single artifact-presence-tolerance requirement on the
   integrate / archive workflows (§ Lifecycle Integration). No tier fork.
9. **`spec-review` method + ceremony extension** — depth-scaled default self-review; opt-in
   external-cadence extension.
10. **Three structural invariants** — relocatability + cohort-consistency (now incl. the path-matching +
    constitutive-doc + H3-subset checks) (AWL owns the invariants; rule / enforcement route downstream).
11. **Incidental concept retirement** — the remaining conceptual references in workflows, strategy docs,
    templates (the prefix is WOR-retired). Mechanical sweep.
12. **Documentation cascade** — DEV-RULES.ARC `Class` definitions / boundary tests;
    `strategy-task-list-formatting.md` phase-count grammar; `strategy-work-organization.md` `Class` integration +
    § Spec-Flow Invariants + § Escape-hatch updates (name AWL as the `Class`-classification model home,
    replace intent-level phrasing) + the sizing-norm co-home + the grouping-taxonomy / cohort-doc convention
    (shared with CWC + file-classification); `template-meta.md` new fields (incl. path-valued `Cohort`);
    `template-tasks.md` depth variants; `template-cohort.md` (new); quality-gate-commands `Class` awareness;
    `draft-arc-plan-conductor.md` write-back (retire `## Scope`-header + `minimum/standard/expanded` modes).

### Out of scope

- **Worktree mechanism, shift lifecycle, create-new `arc start` wiring** — Worktree Foundation / Concurrent
  Work Conventions.
- **Focus-role model and concurrent-work conventions** — Concurrent Work Conventions.
- **The Errand operational path** (`run-errand`, the decision matrix, the foreign-artifact gate) —
  Errand Enablement / `work-routing-discipline` (shipped). AWL owns only the `Class`-side reconciliation.
- **`Class`-aware quality-gate scaling beyond establishing that `Class` exists** — gate-tier mapping per WU
  `Class` is Quality Gate Tiers and Hook Integration's PRD work; the two invariants' *enforcement* also lands
  there.
- **Auto-promotion of `Class`** (by commit count / duration) — manual + structural-detection nudges only;
  auto-promotion promotes work the user hasn't classified.
- **Demotion paths** — none; the `Class` ratchet is one-way; WUs complete against their artifacts.
- **External-artifact reconciliation** (`strategy-work-organization` § Task Lists and Branches / § Work
  Character / § Spec-Flow Invariants rewrites; DEV-RULES.ARC relocatability rule generalization) — these are
  *execution-time* scope (one sweep at activation), not pre-spec.

---

## Scope Estimate

**Large.** Constitutional change + a broad sweep of workflows, templates, strategy docs, plus the spec
template family and the scalable authoring pipeline. The model is conceptually clean but touches many
surfaces.

**Decision: decompose and graduate** (the graduation-aware decomposition, run 2026-06-04). Applying this
WU's own procedure (§ Decomposition Model): the timing gate passes (design at terminal-planning maturity);
the upper-boundary test fires on **orthogonality, not size** — four distinct subsystems with clean
interfaces, several independently deliverable, well past one-sitting reviewability. So AWL **graduates into a
cohort** `agile-wu-lifecycle` under the `principle-anchored-core` cohort; this draft's design distributes into
four member specs, and its coordination content becomes `cohort-agile-wu-lifecycle.md`. AWL is the procedure's
**second acceptance test** (CWC is the first) and its **first graduation customer** — so the graduation runs
the *manual* path (D4 later codifies the workflow).

Four flat member WUs (Model B), wired by dependency edges:

- **D1 · Model Foundation** — `heavy`. DEV-RULES.ARC `Class` definitions + derivation-line / scale-trigger
  boundary tests + front-loading-duty + scaled-ceremony framing; companion ADR; meta schema (`Class` /
  `Design` / path-valued `Cohort` fields, `template-meta`, migration); the **relocatability invariant**
  statement. The base; ships standalone (workflows default to `heavy` until D2). *Depends on: — (worktree-foundation).*
- **D2 · Scalable Authoring Pipeline** — `heavy`. Spec template family (brief / outline / detailed-prd/rfc +
  prototype-iterate) + create-spec reframe + generate-tasks depth-resolution + grounding-audit depth +
  task-list one-grammar + `template-tasks` depth variants + arc-plan depth-relativity + spec-review
  method / extension + the lifecycle-integration artifact-tolerance requirement. Internally phased (templates →
  wiring; the feed-forward coupling keeps it one WU per the upper rail). *Depends on: D1.*
- **D3 · Decomposition & Cohort Machinery** — `heavy`. The decomposition procedure (discriminator + rails +
  timing + Model-B) + sizing standard; the nested-cohort grouping taxonomy; the `cohort-{name}.md` managed
  record + `template-cohort.md`; the **graduation workflow**; the **cohort-consistency invariant**. (Grew
  with the cohort-graduation fold-in; a possible decompose-at-spec itself, but it is one coherent design —
  lean one WU with phases.) *Depends on: D1.* Runs **∥ D2**.
- **D4 · Incidental Retirement + Doc Cascade Sweep** — `light`. Conceptual-reference sweep + conductor
  write-back + the manual-graduation codification. Terminal. *Depends on: D1, D2, D3.*

**CWC re-points** its `Depends On` from `agile-wu-lifecycle` to the specific deliverers of the scalable
pipeline + decomposition procedure — **{D1, D2, D3}, not D4** — so CWC unblocks before the sweep. The cut
naturally surfaces one `light` WU (D4) under three `heavy` ones — the `Class` model dogfooding itself.

---

## External Research

- **Lightweight-spec idiom** — completed 2026-06-03 deep-research pass (run `wf_191136b1-518`): cited inline
  in § Spec shapes by source; **pull full source URLs from that transcript when authoring the spec's
  External Research.** Sources: Shape Up pitch, ADR / Nygard, GitLab handbook, Go proposal, Oxide RFD-0001,
  Microsoft eng playbook, Squarespace, Rust RFC.
- **Decomposition idiom** — stacked-diffs (Graphite), RFC-to-implementation (Google enterprise spec-drift
  finding), epic / story mapping, review-sizing studies (Google / SmartBear ~200–400 LOC defect-detection
  cliff). Folded into § Decomposition Model.
- **Boundary-test idiom (records-vs-derives + scale)** — Shape Up shaping tier, Stripe / Google / GitLab
  design-doc thresholds. Substantially covered by the lightweight-spec pass; remaining: concrete strategy-doc
  examples on each side of the derivation line and the scale trigger.
- **Worktree-management tool landscape** — completed 2026-05-12 (`research-worktree-tool-convergence.md`,
  11 tools across 3 clusters). Closed the question of whether `arc start` retains a clear role alongside
  parallel-workspace tools — yes, as the spawn-from-existing-session entry point paired with the cold-start
  primitive; both produce the same scaffolded meta. The model survives unchanged.

---

## Coordination — ADRs

- **ADR-001** (principles) — P1 (spec-directed), P2 (review increment), P4 (quality gates), P7 (tracked
  lifecycle) anchor the floor model.
- **ADR-016** (commit-control downgrade) — scope precedent for this WU's constitutional change.
- **ADR-019** (one-branch-per-WU) — makes Model A inexpressible; the spine of Model-B-only decomposition.
- **ADR-020** (principle-anchored scalable core) — ratifies the tiered-artifacts / invariant-execution
  thesis; one `spec-*` filename scaling by template family; spec always a separate doc;
  intent-verification survives at every tier; resolve-then-load (§9); guided-init project floor (§8).
- **ADR-021** (Errand threshold) — the wrapper-floor lower bound (Errand vs. WU); mirrored by the
  decomposition upper bound (WU vs. cohort).
- **ADR-022** (managed operational-state documents) — `**Tier:**` / `**Design:**` are schema-owned with
  tier-conditional validity; State transitions are schema events. See that ADR § Coordination.
