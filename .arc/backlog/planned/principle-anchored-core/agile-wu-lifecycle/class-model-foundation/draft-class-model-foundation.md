# Draft: Class Model Foundation

- **Origin:** [internal]
- **Cohort:** principle-anchored-core/agile-wu-lifecycle

- **Purpose:** Establish the `Class` model — the constitutional and schema foundation on which the rest of the
  cohort builds. A two-value `**Class:**` (`light` / `heavy`) recording planning weight — `heavy` iff either of
  two intrinsic, stage-decorrelating axes is high (**derivation** of an open design, or **scale** of the
  codebase-grounding a correct plan needs) — plus the per-stage **planning depth** concept and the three spec
  forms it names. This WU amends DEV-RULES.ARC with the `Class` definitions and the two boundary tests, adds
  the `**Class:**` / `**Design:**` / path-valued `**Cohort:**` meta-fields, states the artifact-relocatability
  invariant, and runs a one-time backlog-wide cohort-compliance baseline. It is the execution arm of the
  scalable-core thesis stated at its root: **scale grammar, never scale discipline** (ADR-020). Ships
  standalone — the authoring workflows default to `heavy` behavior until `scalable-authoring-pipeline` adds
  per-stage depth resolution.

---

## Problem / Motivation

ARC's WU ceremony is uniform regardless of WU size. A 30-minute fix and a 6-week feature go through the same
activate / integrate / archive pipeline. For small bounded work, that ceremony costs more than the work itself.

The pre-existing "lighter" options fell short: the `incidental/` category's workflows were identical to
feature / technical (its "lightening" was about scope, not ceremony); the lightweight completion-doc template
saved doc time at integration only; atomic work bypasses the WU lifecycle entirely, but under
`branch.protection: full` (the default for most teams) most reviewable work needs a branch and therefore a WU.
For an experienced dev's "spin up a branch for a small bug, work, PR, merge" pattern under `full` protection
there was no lightweight path: every branch became a WU; every WU got full ceremony.

This WU introduces a model where ceremony scales with the work's actual design-authoring demand, while
execution discipline (mandatory stops, quality gates, commit format) stays invariant. The *realization* of
that scaling across the authoring stages is `scalable-authoring-pipeline`'s; this WU establishes the model the
pipeline consumes.

## Working thesis — scaled ceremony, invariant discipline

ARC's value is the **structural enforcement of execution discipline**: mandatory stops at each review
increment, quality gates, atomic commits with format + context-footer enforcement, PR review for shared
branches. That discipline drives quality and is invariant across all WU sizes. What scales is **artifact
ceremony**: how much design must be *authored* to reach a settled state, how specs are shaped, how tasks are
organized, how work is archived.

This explicitly answers the historical "Required vs Available" rejection — which was about making *execution
discipline* optional (interlocks removed, gates skipped). This model does none of that: discipline is enforced
at every position. What varies is design-authoring labor.

## The floor model

The model rests on two distinct "floors" whose conflation is what made the whole question feel fuzzy. Anchors:
ADR-001 principles P1 / P2 / P4 / P7; ADR-020 (scalable core); ADR-021 (Errand threshold). The reasoning — not
only the conclusions — is recorded so the constitutional amendment can rebuild it.

### Two floors, not one

- **Discipline floor (P2 / P4) — universal, sits *below* the wrapper, never scales.** Every increment of
  change — a WU task, an Errand commit, a loose off-WU commit — closes with a review-increment gate and passes
  its quality gates. The floor of *discipline* is the smallest **commit**, not the smallest WU. This is ARC's
  identity; it does not move.
- **Wrapper floor — the smallest thing that is a WU at all.** This is the question with real design content.

### The wrapper exists for spec-worthiness; tracking is downstream

Over a bare disciplined commit, a WU adds exactly two things: an **authored spec** (P1) and a **tracked
lifecycle** (P7). The defining trait is **spec-worthiness** — work that is *more than a single logical
concern* (more than one review increment), even if multi-step / multi-file. Tracking is a *consequence* of
that, never an independent cause: graduation (an Errand that reveals unforeseen complexity mid-impl → WU) trips
on discovered *complexity*; tracking comes along for the ride. There is no "needs tracking but the work
doesn't warrant it" case. Anchors: P1's own test ("Quick fixes with clear scope can rely on well-crafted git
commits") and ADR-021 threshold #1.

### The scaling axes — derivation and scale (design is always settled)

**Invariant (P1; DEV-RULES.ARC § Design before implementation):** all settle-able design is settled *before*
implementation — best reasonable effort, never a conscious deferral. What varies is **not whether design is
settled** but **how much pre-impl work settling it demands**, along **two axes**:

- **Derivation** — how much design must be *authored* versus read off existing inputs.
    - **Errand** — zero authoring. The intent *is* the design. ("Intent *to* design" disqualifies it.)
    - **determinate work** — design is determinate from existing inputs (issue / pattern / clear intent); the
      spec *records* it lightly, it does not *derive* it. `light` unless scale pushes it `heavy`.
    - **derived work** — settling *requires authoring* a real design (a PRD's worth): many concerns,
      alternatives, and tradeoffs that do not exist until someone works them out. Always `heavy`.
- **Scale** — how much codebase-grounding a correct impl plan demands. Co-equal: a determinate-but-large WU (a
  mechanical refactor) is `heavy` by grounding demand alone.

`Class` is `heavy` iff *either* axis is high.

### Topology — fixed floor → scalable middle → fixed ceiling (derived, not chosen)

Preference operates in the band between the demand-set floor and a fixed ceiling (max ceremony ARC offers).
**Band width shrinks as pre-impl demand rises** (along either axis), because the floor climbs toward the
ceiling:

- **Errand:** floor = ceiling = one disciplined commit. Band width **zero**.
- **Low demand (determinate, modest scale):** floor low, ceiling high. Band **wide** — preference has real room
  (`brief` ↔ `outline`).
- **High demand (a PRD-worth of derivation, or a large grounding surface):** floor near the ceiling. Band
  **≈ zero**.

Both endpoints are fixed for the same reason — degenerate bands — and only the middle scales. The derivation
line and the scale trigger are the two `heavy`-promotions.

### Atomic retires as a *tier*

Atomic-character work executes as an **Errand** below the wrapper, or graduates; ADR-020 §3's spec-in-commit
"floor exception" migrates *out of the tier model into the Errand class*, which reconciles the
ADR-020 ↔ ADR-021 tension. "Atomic" reverts to a pure character adjective (§ Design decisions). The `Class` set
is **{`light`, `heavy`}**.

### The ceremony stack — three lower-bound layers; `Class` tracks work-demand, not preference

1. **Work-demand → forced floor** (per-WU, objective, enforced via drift-promotion; either axis). *The work
   demands ≥ this.*
2. **Project preference → team floor** (set at init, trivially changeable). The consistency knob; likely a
   project-config setting per ADR-020 §8's guided-init walkthrough.
3. **User preference → personal investment *above* the team floor**; never below it.

Actual ceremony = the user's pick within `[max(demand_floor, project_floor), ceiling]`. **`Class` tracks layer
1 only** (work-demand) — neither preference layer inflates classification. A determinate WU specced heavily by
preference is still **`light`**: the *work* was light; the author simply likes rigor. This keeps `Class`
objective and useful for parallelism planning. (Intrinsic scale is not preference — a large refactor is `heavy`
by demand, not taste.)

### Invariant vs. convention (this is the "always feels like ARC")

The floor is **identical at every model position** — that invariance *is* the ARC feel; the model only moves
the convention layer on top.

- **Floor (principle-forced):** a spec in some form (P1); a task list when multi-increment (P2 + P7);
  intent-verification of completed work against the spec (P1); the discipline floor (P2 / P4). Always present,
  every tier above Errand.
- **Convention (opinionated, scalable, configurable):** spec *template weight*; phase count beyond one;
  pre-execution task-list audit (a strong default, not a floor); iteration passes.

The *machinery available is identical at every depth* — the same full-strength workflows, grounding audit,
review, and gates, **parameterized by depth rather than forked**. What differs is how much there is to apply it
to. (The grammar that realizes this — the spec template family and the task-list phase grammar — is
`scalable-authoring-pipeline`'s; this WU defines the model that says it must be parameterize-not-fork.)

## Class and planning depth — two axes, resolved per stage

The model is governed by **two intrinsic axes** of the work, a recorded coarse **`Class`**, and a per-stage
**planning depth**. The two axes **load different stages**, so they **decorrelate** — any model that collapses
them into a single per-WU bucket gives the wrong answer for the work where they pull apart.

- **Derivation** loads **drafting + spec creation**. The durable framing of pre-impl ambiguity: a shipped WU
  still "required derivation." (The line separates *record from derive*, not *doc from no-doc* — in ARC every
  non-Errand WU has a spec.)
- **Scale** loads **task-gen** (the grounding pass). Independent of whether the design was derived.

| WU archetype              | derivation | scale    | spec form      | **Class** | drafting | spec | task-gen |
| ------------------------- | ---------- | -------- | -------------- | --------- | -------- | ---- | -------- |
| small fix                 | low        | low      | `brief`        | light     | low      | low  | low      |
| moderate feature          | low        | med      | `outline`      | light     | low      | low  | med      |
| large mechanical refactor | low        | **high** | `outline`      | **heavy** | low      | med  | **high** |
| tricky algorithm          | **high**   | low      | `detailed`·RFC | **heavy** | **high** | high | low      |
| large greenfield feature  | high       | high     | `detailed`·PRD | heavy     | high     | high | high     |

### `Class` — the recorded coarse classification (`light` / `heavy`)

`Class` is the WU's **planning weight**: recorded on the meta, consumed by roadmap / parallelism planning ("how
much genuinely-heavy work is in flight"). **`heavy` iff *either* axis is high.** A one-way ratchet (§ Mechanism
note below): rises when a stage reveals demand, never demotes (demotion discards work). It almost reads off the
spec form, with one honest straddle:

- `brief` spec → always `light`. `detailed` spec → always `heavy` (derivation forces it).
- `outline` spec → **either** — `light` at moderate scale, `heavy` when the impl needs a substantial
  grounding/mapping pass. Disambiguate by the `**Class:**` field or task-list scale.

(`heavy`/`brief` is empty: low scale can only reach `heavy` via derivation, and derivation forces `detailed`.)

### `planning depth` — the per-stage resolution (`low` / `medium` / `high`)

Each authoring stage resolves a **planning depth** *independently*, from the axis that loads it. Depth is
**transient, per-stage, never recorded**, and able to vary across stages. Only the spec stage's depth names a
durable artifact — the **spec form** (`low → brief`, `medium → outline`, `high → detailed`). Drafting and
task-gen realize their depth in their own units, producing no separately-named artifact. (How each stage
realizes its depth is `scalable-authoring-pipeline`'s scope; this WU defines the ordinal and that it resolves
per stage.)

### Boundary tests must be crisp (a first-class deliverable)

The model's correctness rests on the thresholds far more than on any naming. Three recognizable-in-retrospect
tests place work:

- **Errand vs. WU (the wrapper floor — ADR-021):** *"Does this need more than a single logical concern — more
  than one review increment — to do well?"* No → Errand. Yes → WU.
- **Derivation trigger (→ `heavy`):** *"Must a real design be authored — concerns, alternatives, tradeoffs that
  don't exist until someone works them out — before a competent engineer can start?"* Yes → `heavy`. (Stripe
  RFC criteria, Google design-doc guidance, Shape Up shaping, GitLab MR-driven workflow.)
- **Scale trigger (→ `heavy`):** *"Does producing a correct implementation plan require a substantial
  codebase-grounding / mapping pass — many symbols and relationships to verify — beyond the routine floor?"*
  Yes → `heavy`. **Guard the bar at *substantial*** — most WUs carry some grounding; a soft bar makes
  everything `heavy`.

`light` iff **both** `heavy`-triggers are no. Concrete strategy-doc examples on each side of the derivation
line and the scale trigger are a deliverable here (see § External research).

### The felt-difference test (model guardrail)

**Every position the model exposes must be distinguishable to the *user* in rigor and/or speed; a distinction
visible only to the author is arbitrary and must collapse.** A first-class acceptance criterion. The spec forms
differ in speed and rigor (`brief` / `outline` / `detailed`), so the form ordinal passes. The two `Class`
values pass too, including the straddle: a `heavy`/`outline` WU (large refactor) is felt-distinct from a
`light`/`outline` WU by its task-gen depth. There is no `light`/`detailed` position (`detailed` *derives*,
forcing `heavy`). What the test *rejects* is a knob that makes two positions produce identical artifacts
distinguished only modally — the **arbitrary-lever trap**. `Class` avoids it: it is the *aggregate weight* of
two genuinely independent axes, each felt (derivation as cognitive load up front; scale as a grounding grind at
task-gen). A future "scale ceremony within this structure" WU is legitimate iff its candidates pass this test.

### Spec forms confirmed at three; the middle is structural

The gap between a single-paragraph `brief` and a full PRD is *enormous*, so a single middle is not optional —
without `outline` the broad determinate-design middle has only two unusable extremes. **Why three when industry
runs two?** (a) ARC's mechanism (resolve-then-load, per-stage self-resolution, composable fragments) needs
**discrete, loadable** resolutions — you cannot load a fragment against a continuum; (b) the spec-gap argument;
(c) the felt-difference test validates each form. The Oxide continuum is the considered-and-declined
alternative (declined for agent-loadability). Each of the three *shapes* is individually attested in the idiom;
what is adapted is assembling them into one graduated, agent-resolvable ordinal. (The template bodies that
realize the three forms are `scalable-authoring-pipeline`'s.)

### Naming

Settled after a focused external-vocabulary research pass and a model-refinement pass. Research informed the
names; the calls are the project's.

| Slot | Name | Recorded? |
| ---- | ---- | --------- |
| Recorded WU classification (planning weight) | **`Class`** (meta field) | Yes — render deferred (lean off) |
| `Class` values | **`light`** / **`heavy`** | Yes |
| Per-stage planning resolution | **`planning depth`** | No — transient, per-stage |
| Planning-depth level | **`low`** / **`medium`** / **`high`** | No |
| Spec artifact form | **`brief`** / **`outline`** / **`detailed`** (→ PRD / RFC) | the spec itself |
| Underlying axes (explanation, never labels) | **derivation** + **scale** | No |

- **`Class`, not `Complexity Tier` or bare `Tier`** — a binary *kind* of work (two characters, not rungs);
  sidesteps the quality-gate `Tier 1/2/3` collision; `Complexity Tier` under-describes a two-axis aggregate.
- **`light` / `heavy`, not `light` / `full`** — natural antonyms; `heavy` reads as the roadmap intuition and,
  since scale is now a legitimate component, "heavy = lots of total work" is *accurate*. Guardrail: `heavy` is
  about design-derivation or grounding scale, **not raw code volume**.
- **`planning depth` (low / medium / high), not `process intensity`** — resolved per stage; needs a *magnitude*
  vocabulary distinct from the spec-form names. `depth` is the noun; `planning` anchors it to the `State:
  Planning` stages it spans. Rejected: `rigor` (mis-frames the bottom — "low rigor" reads as permission to be
  sloppy), `process intensity`, `formulation depth`.
- **`brief` / `outline` / `detailed`, not `sketch`** — `sketch` connotes rough / will-be-redone, the opposite
  of a floor spec (concise *and* authoritative *and* complete at its scope). Only `detailed` splits by
  feature / technical into PRD / RFC, because only `detailed` derives.
- **`derivation` + `scale` stay explanation, never labels** — inverse-correlated with "weight" and loading
  different stages; surfacing them as labels would invert awkwardly. They live in the strategy doc's definition
  and the boundary tests.

### Record but don't necessarily render

`Class` records on the meta — the `**Tier:**` slot reserved in `template-meta.md` becomes `**Class:**`,
grouping with the classification fields (`Depends On` / `Cohort` / `Priority`), not provenance. **Rendering is a
separate call:** the parallelism-planning rationale points at `STATUS.USER` (the in-flight view) if anywhere,
not ROADMAP; with both tables near max width the lean is **off in renders** until that view's value is
demonstrated. Recording is cheap and stable; render-inclusion stays open.

## No design-deferral stays universal (the constitutional sharpening)

The derivation axis is authoring-labor-to-*settle*, not amount-*left-open*: `outline` is faster than `detailed`
because the design was *more determinate coming in*, **never because it tolerates more open design**. Both
reach a fully settled design before impl. The line ARC already runs — **design decisions settled upfront
(invariant, all forms); implementation detail resolved during work (always, all forms)** — is what the current
PRD's "Open Questions → resolve during work" must mean (impl-detail, never design). This WU **sharpens that
wording** explicitly across all variants — the front-loading duty: settle all settle-able design up front;
never consciously defer it to impl; route genuinely-emergent questions back to the spec. The industry "don't
over-specify" idiom is exactly the impl-detail latitude ARC already grants — no new deferral mechanism. This is
the constitutional addition flagged at the floor model.

## Meta schema changes

`**Class:**` and `**Design:**` are schema-owned meta fields with **`Class`-conditional validity** (a
cross-field constraint a flat template cannot express), per ADR-022's structured-record meta model. State
transitions are schema events, not free-text edits.

- **`Class` field** — source of truth for planning weight, declared / ratcheted through the authoring stages.
  Values `light` / `heavy` (`heavy` iff either axis is high). Groups with the classification fields. Recorded
  always; rendered — open (lean off). Existing in-flight WUs migrate to `heavy` (matches their current ceremony
  level). **Migration mechanism — open:** auto-migrate at session-init vs. manual (spec decision).
- **`Design` field** — pointer to where the spec lives. Introduced upstream as a generic optional pointer; this
  WU adds `Class`-specific value semantics + `Class`-aware validation. Values: `draft-{name}.md` (Planning),
  `spec-{name}.md` (Active+, all forms — filename stable, form lives in template + H1). **Orthogonality with
  `Origin`:** `Design` always points at an ARC-owned planning artifact; external trackers go in `Origin`,
  never `Design`. **`Class`-aware validation — open:** should hooks validate `Design` matches `Class`
  expectations (`heavy` → `detailed`; `light` → `brief` / `outline`, modulo the `outline` straddle)? Probably
  warn-not-block; spec decision.
- **`Cohort` field — path-valued** — becomes path-valued to carry the grouping taxonomy: a single segment for a
  top-level cohort, `<cohort>/<subcohort>` for a nested one, or `[none]` for a standalone WU; capped at two
  segments. Stays the source of truth for membership (sibling list derived, never a stored roster). The path
  mirrors the on-disk dir-path, enforced by the cohort-consistency invariant. **This WU owns the field
  *schema*; `decomposition-machinery` owns the taxonomy *semantics* it expresses** (the grouping model, the
  constitutive `cohort-{name}.md`, the nesting cap).
    - **Header placement (new convention).** `Cohort` is carried in the **header of the meta *and* the
      draft / spec** (full path, matching at creation), the same dual-placement `Origin` gets — because once a
      WU activates the `active/` layout is flat and placement no longer encodes membership, so the standalone
      spec must self-describe its grouping. It is a third **above-the-spec identity anchor, orthogonal to
      `Origin`** (as `Origin` is to `Design`): an external issue may spawn a whole cohort (Origin inherited
      across members) or a single issue-spawned WU may be filed into a pre-existing cohort for coordination —
      independent information. Chain framing: `{Origin, Cohort} → Design/spec → tasks → PR`. (Open for this
      WU's spec: whether the *meta's* Cohort also moves from its Coordination group into the Reference group;
      lean leave it function-grouped in the meta while the header plays the anchor role. Applying the field to
      the spec template family is `scalable-authoring-pipeline`'s; updating `template-draft` rides the
      `doc-cascade-sweep` template pass.)

## The relocatability invariant

WU artifacts (`meta-*`, `draft-*`, `spec-*`, `tasks-*`, companions) relocate between lifecycle states
(`active/` ↔ `backlog/` ↔ `completed/`) as a function of State — a graduate / park / archive move must be a
pure `git mv` with **no content edit**. That holds only if artifacts carry **position-independent refs**
(filename-only, per DEV-RULES.ARC § `.arc/` artifact references); relative-path links break on move. This WU
owns the *invariant* and the *rule generalization* (close the source-side gap — the rule today permits relative
paths to stable docs, which still break when the source itself moves) in DEV-RULES.ARC. *Enforcement*
(forbidden-pattern hook extended to source-side link-defs + a sweep of the path-style link-defs in active /
backlog movable artifacts) routes downstream to `quality-gate-hooks`. (Surfaced live 2026-06-03 — both the CWC
park and this cohort's graduation hit relative-link breakage on move, fixed by converting both drafts to
filename-only.)

## Companion ADR

The `Class` definitions, the derivation-line and scale-trigger boundary tests, and the
scaled-ceremony / invariant-discipline framing are constitutional-level additions to DEV-RULES.ARC, comparable
in scope to ADR-016's commit-control downgrade. A companion ADR documents the architectural shift (parallel
scale to ADR-016).

## Cohort-compliance baseline (one-time)

A backlog-wide pass establishing the cohort-consistency floor: every existing grouping dir under
`backlog/planned/` gets a `cohort-{name}.md` carrying at least a `Purpose`, and every member's `**Cohort:**`
field path-matches its dir. (As of graduation, only `agile-parallelism` and `principle-anchored-core` carry
cohort docs — ~8 other grouping dirs are doc-less.) This is distinct from the *invariant* (owned by
`decomposition-machinery`) and its *enforcement* (also `decomposition-machinery`); this is the one-time data
migration that brings the existing backlog into compliance before enforcement turns on.

## Design decisions

- **`Class` as structural differentiation, not opt-in optionality.** Each spec form has a distinct artifact
  shape (`brief` paragraph-spec vs `detailed` phased PRD/RFC); reviewers / agents / tooling read the explicit
  `**Class:**` field and the artifact shapes, not which optional steps were skipped. `Class` is not perfectly
  inferable from spec form (the `outline` straddle), which is exactly why it is recorded explicitly.
- **Scaffolding is `Class`-agnostic.** `arc start` / `init-work-unit` produce a uniform minimal Planning
  container; `Class` is born in the planning stage and lives in the content, not the scaffolding act. (No
  `--class` flag; no quick tier; the field ratchets from its default. Supersedes the original "default tier at
  `arc start` is `quick`.")
- **The internal spec is always a separate doc.** The lightest spec is a separate `spec-{name}.md` at `brief`
  form — never a `## Scope` header section in the task list (ADR-020's invariant floor). "Spec lives in a doc,
  regardless of `Class`."
- **Discipline preserved below the wrapper.** The mandatory review-increment stop applies to Errand work too,
  at commit boundaries instead of task-checkbox boundaries. This *is* the discipline floor — it belongs to no
  tier.
- **Atomic-the-character vs atomic-the-shape.** "Atomic" describes the work's *character* (single bounded
  concern), not a tier. Under `partial`, atomic work goes direct-to-main; under `full`, the same intent becomes
  an **Errand** (`chore/<slug>` + PR), promoting to a WU only when the threshold trips. The word's meaning is
  consistent across modes; the framework's shape adapts. This WU owns only the *tier-side* reconciliation
  (atomic-character defaults to an Errand, promoted via `run-errand → init-work-unit`); the Errand operational
  path itself shipped (`errand-enablement` + `work-routing-discipline`).

## Pressure points and risks

- **`Class` drift via under-specification.** Adopters may default to `light` to avoid `detailed`-spec ceremony.
  Mitigations: the self-diagnosing depth-shift signal (a heavy downstream artifact over a minimal spec *is* the
  floor-was-too-low signal); the explicit `**Class:**` field invites reviewer scrutiny ("Class: light" on a
  complex change has the signal to push back); strategy-doc guidance with concrete examples on each side of the
  derivation line and scale trigger.
- **Constitutional change scope.** The `Class` definitions, boundary tests, and scaled-ceremony framing are
  constitutional-level additions to DEV-RULES.ARC, comparable to ADR-016. Companion ADR required (above).
- **Light WU discoverability.** Short-lived `light` WUs could make session-init's active-WU enumeration noisy.
  Mitigation: `Class`-aware orientation ("3 active WUs: 1 heavy, 2 light"); auto-cleanup of
  completed-but-not-swept WUs. (Less acute than the original atomic-tier version, since atomic-character work
  is now an Errand, not a WU.)

## Scope

**In scope:**

1. The `Class` / planning-depth **model** — `Class` (`light` / `heavy`), the `planning depth` ordinal
   (`low` / `medium` / `high`), and the three spec forms it names. Constitutional amendment to DEV-RULES.ARC:
   the `Class` definitions, the two boundary tests, the scaled-ceremony / invariant-discipline framing, the
   front-loading-duty sharpening. Companion ADR.
2. Meta schema — `**Class:**` and `**Design:**` `Class`-specific value semantics + `Class`-aware validation;
   path-valued `**Cohort:**` field schema; `template-meta` additions; migration handling for existing WUs.
3. The **relocatability invariant** statement + the DEV-RULES.ARC source-side rule generalization.
4. The one-time **cohort-compliance baseline** pass over `backlog/planned/`.

**Out of scope:**

- The per-stage *realization* of depth (spec template family, create-spec / generate-tasks depth resolution,
  task-list grammar) — `scalable-authoring-pipeline`.
- The grouping taxonomy *semantics*, the `cohort-{name}.md` record + `template-cohort.md`, the decomposition
  procedure, and cohort-consistency *enforcement* — `decomposition-machinery`.
- Relocatability *enforcement* (hook + link-def sweep) — `quality-gate-hooks`.
- Per-`Class` quality-gate scaling beyond establishing that `Class` exists — Quality Gate Tiers.
- Auto-promotion / demotion of `Class` — the ratchet is one-way; manual + structural-detection nudges only.

## Open questions

- **`Class` render-inclusion** — recorded always; rendered only if the parallelism-planning view demonstrates
  value.
- **`Class`-aware `Design`-field validation** — warn-not-block, probably; spec decision.
- **Existing-WU migration mechanism** — auto-migrate at session-init vs. manual, for the `Class` / `Design`
  field additions.

## External research

- **Boundary-test idiom (records-vs-derives + scale)** — Shape Up shaping tier, Stripe / Google / GitLab
  design-doc thresholds. Substantially covered by the 2026-06-03 lightweight-spec deep-research pass (run
  `wf_191136b1-518`); remaining work: concrete strategy-doc examples on each side of the derivation line and
  the scale trigger. (Pull full source URLs from that transcript when authoring the spec's External Research.)

## Scope estimate

**Medium–Large.** A constitutional amendment + a companion ADR + meta-schema additions + a one-time backlog
compliance pass. Conceptually self-contained (the base everyone else builds on), but constitutional edits are
high-blast-radius and the migration touches every existing meta. *Depends on: `worktree-foundation` (shipped).*

---
