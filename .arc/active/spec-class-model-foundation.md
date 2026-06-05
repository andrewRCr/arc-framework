# PRD: Class Model Foundation

- **Origin:** [internal]
- **Cohort:** principle-anchored-core/agile-wu-lifecycle

- **Purpose:** Establish the `Class` model — a two-value planning-weight classification (`light` / `heavy`),
  the per-stage `planning depth` concept, and the three spec forms it names — as the constitutional and
  schema foundation the rest of the cohort builds on: scale how much design must be *authored*, never the
  discipline that validates it.

> *Form note (interim): a `detailed` technical spec authored on the PRD template. The dedicated RFC template
> for `detailed`·technical work is a `scalable-authoring-pipeline` deliverable and does not exist yet; this
> spec uses `template-prd.md` with technical emphasis until it lands. The spec form lives here in the H1 and
> template, not in the filename (filename stays stable across forms per the `Design`-field semantics below).*

---

## Introduction

ARC's work-unit ceremony is uniform regardless of work size. A 30-minute fix and a 6-week feature traverse the
same activate / integrate / archive pipeline. For small bounded work, that ceremony costs more than the work
itself — and the pre-existing "lighter" paths did not close the gap: the `incidental/` category ran the same
workflows (its lightening was about scope, not ceremony); the lightweight completion-doc template saved time at
integration only; atomic work bypasses the WU lifecycle entirely, but under `branch.protection: full` (the
default for most teams) most reviewable work needs a branch and therefore a WU. The experienced-dev pattern
"spin up a branch for a small bug, work, PR, merge" had no lightweight home under `full`: every branch became a
WU, every WU got full ceremony.

The resolution is a model where **ceremony scales with the work's actual design-authoring demand while
execution discipline stays invariant**. This is the execution arm of the `principle-anchored-core` thesis —
**scale grammar, never scale discipline** (ADR-020). This work unit establishes that model: it defines the
`Class` classification and the two intrinsic axes that drive it, the per-stage planning-depth ordinal, and the
three spec forms; it amends DEV-RULES.ARC with the definitions, the boundary tests, and a constitutional
sharpening of the no-design-deferral rule; it adds the `Class` / `Design` / path-valued `Cohort` meta-schema
fields; it states the artifact-relocatability invariant and closes a source-side gap in the reference rule; and
it migrates existing work units' `Cohort` fields into the new schema.

**Why now:** this WU is the base of the `agile-wu-lifecycle` cohort — `scalable-authoring-pipeline` and
`decomposition-machinery` both consume the contracts it exposes, and `doc-cascade-sweep` retires the superseded
vocabulary. It ships standalone (the authoring workflows default to `heavy` behavior until
`scalable-authoring-pipeline` adds per-stage depth resolution), so the foundation can land and stabilize before
the consumers build on it.

## Goals

- Define a **recorded, objective planning-weight classification** (`Class`: `light` / `heavy`) that downstream
  roadmap / parallelism planning can read, driven by two intrinsic, stage-decorrelating axes of the work.
- Make the **classification boundaries crisp** — three recognizable-in-retrospect tests (Errand-vs-WU,
  derivation trigger, scale trigger) that place work without author guesswork.
- Preserve ARC's identity: **execution discipline is invariant** at every model position; only design-authoring
  ceremony scales.
- Express the model in the **meta schema** with `Class`-conditional validity, and make WU artifacts carry
  position-independent references so lifecycle moves stay pure `git mv`.
- Land as a **stable contract surface** for three cohort siblings — precise, normative definitions of the
  `Class` model, the path-valued `Cohort` schema, and the relocatability invariant.

## Use Cases / System Scenarios

Technical work — scenarios that illustrate the model and the migration impact.

1. **Small fix under `full` protection.** A developer cuts a branch for a one-concern bug. The work is a single
   logical concern (one review increment) → it is an **Errand**, not a WU: `chore/<slug>` + PR, no meta file,
   no `Class`. Discipline (review-increment stop, quality gates, commit format) still applies at the commit
   boundary. *Before:* the branch forced a full-ceremony WU.

2. **Moderate determinate feature.** Design reads off a clear issue and existing patterns; the impl plan needs
   a modest grounding pass. → `Class: light`, `outline` spec. The spec *records* the design; it does not
   *derive* it.

3. **Large mechanical refactor.** Design is determinate (rename / move a widely-used symbol), but a correct
   plan requires a substantial codebase-grounding pass — many symbols and call-sites to verify. → `Class:
   heavy` by the **scale** axis alone, `outline` spec, high task-gen depth. This is the `outline` straddle: a
   `heavy`/`outline` WU, felt-distinct from a `light`/`outline` WU at task-gen.

4. **Tricky algorithm / novel design.** A real design must be authored — alternatives and tradeoffs that don't
   exist until someone works them out — over a small surface. → `Class: heavy` by the **derivation** axis,
   `detailed` spec, low task-gen depth.

5. **Migration of an in-flight WU.** An existing meta with no `Class` field acquires `Class: heavy` (matching
   its current full-ceremony level) and a path-valued `Cohort` matching its on-disk dir, via a one-time manual
   pass. No runtime backfill on the session-init hot path.

## Requirements

### P0 — must-have

1. **The `Class` model.** Define `Class` as a two-value recorded classification — `light` / `heavy` — that is
   the WU's *planning weight*. **`heavy` iff *either* of two intrinsic axes is high:**
    - **Derivation** — how much design must be *authored* versus read off existing inputs. `derived work`
      (settling requires authoring a real design) is always `heavy`; `determinate work` (design determinate
      from existing inputs; the spec *records* it) is `light` unless scale promotes it.
    - **Scale** — how much codebase-grounding a correct implementation plan demands. Co-equal: a
      determinate-but-large WU is `heavy` by grounding demand alone.

   The axes **load different authoring stages** (derivation → drafting + spec creation; scale → task-gen) and
   therefore **decorrelate** — the model must not collapse them into a single per-WU bucket.

2. **The three boundary tests** (crisp, recognizable-in-retrospect; a first-class deliverable):
    - **Errand vs. WU (wrapper floor, ADR-021):** *"Does this need more than a single logical concern — more
      than one review increment — to do well?"* No → Errand. Yes → WU.
    - **Derivation trigger (→ `heavy`):** *"Must a real design be authored — concerns, alternatives, tradeoffs
      that don't exist until someone works them out — before a competent engineer can start?"*
    - **Scale trigger (→ `heavy`):** *"Does producing a correct implementation plan require a **substantial**
      codebase-grounding / mapping pass — many symbols and relationships to verify — beyond the routine
      floor?"* Guard the bar at *substantial*: most WUs carry some grounding; a soft bar makes everything
      `heavy`.

   `light` iff **both** `heavy`-triggers are no.

3. **`planning depth` — the per-stage resolution.** Define a `low` / `medium` / `high` ordinal that each
   authoring stage resolves *independently* from the axis that loads it. Depth is **transient, per-stage, never
   recorded**, and may vary across stages. Only the spec stage's depth names a durable artifact (the spec
   form). *(How each stage realizes its depth is `scalable-authoring-pipeline`'s; this WU defines the ordinal
   and that it resolves per stage.)*

4. **The three spec forms.** Define `brief` / `outline` / `detailed`, mapped from spec-stage depth
   (`low → brief`, `medium → outline`, `high → detailed`). `brief` → always `light`; `detailed` → always
   `heavy` (derivation forces it); `outline` → **either** (`light` at moderate scale, `heavy` when impl needs a
   substantial grounding pass — disambiguated by the `Class` field / task-list scale). `detailed` splits by
   work category into PRD (feature) / RFC (technical); the other two forms do not split. *(The `heavy`/`brief`
   cell is empty: low scale reaches `heavy` only via derivation, which forces `detailed`.)*

5. **`Class` set is `{light, heavy}`; atomic retires as a tier.** Atomic-character work executes as an Errand
   below the wrapper, or graduates to a WU. ADR-020 §3's spec-in-commit floor exception migrates *out of the
   tier model into the Errand class* (reconciling the ADR-020 ↔ ADR-021 tension). "Atomic" reverts to a pure
   character adjective. This WU owns only the *tier-side* reconciliation; the Errand operational path itself
   has shipped.

6. **Constitutional amendment to DEV-RULES.ARC.** Add: the `Class` definitions and the two `heavy`-axis
   triggers; the three boundary tests; the scaled-ceremony / invariant-discipline framing (discipline floor vs.
   wrapper floor; the floor is identical at every model position — that invariance *is* the ARC feel); and the
   **front-loading-duty sharpening** (R7).

7. **Front-loading-duty sharpening (constitutional).** Sharpen, across all spec forms, the existing line —
   *design decisions settled upfront (invariant, all forms); implementation detail resolved during work (all
   forms)*. State explicitly: settle all settle-able design up front (best reasonable effort, never a conscious
   deferral); route genuinely-emergent design questions back to the spec, never accumulate design debt in code
   or notes. The derivation axis is authoring-labor-*to-settle*, never amount-*left-open*: `outline` is faster
   than `detailed` because the design was *more determinate coming in*, not because it tolerates more open
   design. This introduces **no new deferral mechanism** — the impl-detail latitude ARC already grants is
   unchanged.

8. **Companion ADR.** Author an ADR documenting the architectural shift (scaled ceremony / invariant
   discipline, the `Class` model, the boundary tests), parallel in scope to ADR-016's commit-control downgrade.

9. **Meta schema — `Class` field.** Add `**Class:**` (`light` / `heavy`) as a schema-owned field grouped with
   the classification fields (`Depends On` / `Cohort` / `Priority`), not provenance. Source of truth for
   planning weight; declared / ratcheted through the authoring stages. The reserved `**Tier:**` slot in
   `template-meta.md` becomes `**Class:**`. **One-way ratchet:** rises when a stage reveals demand, never
   demotes (demotion would discard work). `Class`-conditional validity per ADR-022 (a cross-field constraint a
   flat template cannot express).

10. **Meta schema — `Design` field.** Define `Class`-aware value semantics for `**Design:**` (introduced
    upstream as a generic optional pointer): `draft-{name}.md` during Planning, `spec-{name}.md` from Active
    onward (all forms — filename stable, form lives in the template + H1). **Orthogonality with `Origin`:**
    `Design` always points at an ARC-owned planning artifact; external trackers go in `Origin`, never `Design`.

11. **Meta schema — path-valued `Cohort` field (schema only).** Make `**Cohort:**` path-valued to carry
    grouping membership: a single segment for a top-level cohort, `<cohort>/<subcohort>` for a nested one, or
    `[none]` for a standalone WU; **capped at two segments**. The path mirrors the on-disk dir-path. The field
    stays the source of truth for membership (the sibling list is *derived*, never a stored roster).
    **Dual placement:** `Cohort` is carried in the **header of the meta *and* the draft / spec** (full path,
    matching at creation) — the same dual-placement `Origin` gets — because once a WU activates, the `active/`
    layout is flat and placement no longer encodes membership, so the standalone spec must self-describe its
    grouping. It is a third above-the-spec identity anchor, orthogonal to `Origin` and `Design`.
    **This WU owns the field *schema* only; `decomposition-machinery` owns the taxonomy *semantics* it
    expresses** (grouping model, the `cohort-{name}.md` record, the nesting cap's rationale).

12. **`template-meta.md` additions.** Reflect R9–R11 in the meta template: `Tier` slot → `Class`; `Design`
    field with `Class`-aware guidance; `Cohort` path-valued with the dual-placement note. *(Updating the
    `template-draft` / spec-template family for the `Cohort` header rides `decomposition-machinery` /
    `scalable-authoring-pipeline` / the `doc-cascade-sweep` template pass, not this WU.)*

13. **The relocatability invariant (statement).** State in DEV-RULES.ARC: WU artifacts (`meta-*`, `draft-*`,
    `spec-*`, `tasks-*`, companions) relocate between lifecycle states (`active/` ↔ `backlog/` ↔ `completed/`)
    as a function of State — a graduate / park / archive move must be a pure `git mv` with **no content edit**.
    That holds only if artifacts carry **position-independent refs**.

14. **Source-side reference-rule generalization (constitutional).** Generalize DEV-RULES.ARC § `.arc/`
    artifact references to close the source-side gap: **a movable artifact carries no relative-path links at
    all** — filename-only, *even to stable docs* — with relative paths legal only in non-moving docs. (Today the
    rule mandates filename-only refs *to* movable artifacts but permits relative paths *to stable docs*, which
    still break when the *source* is itself a movable artifact.) This is the **rule half**; *enforcement*
    (forbidden-pattern hook extended to source-side link-defs + a sweep of path-style link-defs in active /
    backlog movable artifacts) routes to `quality-gate-hooks`.

15. **Cohort-compliance baseline — field-side only (one-time).** A one-time pass over `backlog/planned/`
    bringing every existing member's `**Cohort:**` field into the new schema and making it path-match its
    on-disk dir (standalone WUs → `[none]`). **Creating `cohort-{name}.md` records is *not* in this baseline**
    — that moves to `decomposition-machinery`, co-located with the record format, the Purpose floor,
    `template-cohort.md`, and the cohort-consistency enforcement it owns. *(Existing cohort docs —
    `agile-parallelism`, `principle-anchored-core`, `agile-wu-lifecycle` — already exist with rich shapes;
    minting minimal Purpose-only stubs now would be inconsistent with the format the sibling will formalize.)*

16. **Existing-WU `Class` migration (one-time, manual).** Existing in-flight / backlog WUs acquire `Class:
    heavy` (matching their current full-ceremony level) via a **one-time manual pass**, bundled with R15's
    field migration. **No auto-backfill on the session-init hot path.** *(Migration surface is tiny:
    `class-model-foundation` is effectively the only active WU, and is expected to remain so until
    `agile-parallelism` fully lands — Concurrent Work Conventions is downstream of this cohort.)*

### P1 — should-have

17. **`Class`-aware `Design` validation — warn-not-block.** A hook warns (never blocks) on a `Class` / spec-form
    mismatch (`heavy` → expect `detailed`; `light` → expect `brief` / `outline`, modulo the `outline`
    straddle). Preserves the self-diagnosing depth-shift signal without gating planning iteration.

18. **`Class` render in STATUS.USER.** Render `Class` in the in-flight (`STATUS.USER`) view to support
    parallelism planning ("how much genuinely-heavy work is in flight"). *(Recording is always-on regardless;
    this is the render-inclusion call. ROADMAP render-inclusion stays out — both ROADMAP tables are near max
    width.)*

19. **Strategy-doc guidance with concrete examples.** Add boundary-test guidance to `strategy-work-organization`
    with concrete strategy-doc examples on each side of the derivation line and the scale trigger
    (records-vs-derives; routine-vs-substantial grounding). The constitutional rule states the tests; the
    strategy elaborates with worked examples.

## Non-Goals

Explicitly out of scope (with the owning member):

- **Per-stage *realization* of depth** — the spec template family (including the `detailed`·RFC template), the
  `create-spec` / `generate-tasks` depth-resolution wiring, and the task-list one-grammar →
  **`scalable-authoring-pipeline`**.
- **Grouping taxonomy *semantics*** — the grouping model, the constitutive `cohort-{name}.md` record + its
  required Purpose floor, `template-cohort.md`, the decomposition procedure, and the cohort-consistency
  *invariant and enforcement* → **`decomposition-machinery`**. (This WU owns the `Cohort` *field schema* only.)
- **Cohort-doc creation in the baseline** — minting `cohort-{name}.md` for existing grouping dirs →
  **`decomposition-machinery`** (co-located with the record format + enforcement). This WU's baseline is
  field-side only (R15).
- **Relocatability *enforcement*** — the forbidden-pattern hook + the path-style link-def sweep →
  **`quality-gate-hooks`**. This WU states the invariant and generalizes the rule (R13–R14) only.
- **Per-`Class` quality-gate scaling** beyond establishing that `Class` exists → **Quality Gate Tiers**.
- **Auto-promotion / demotion of `Class`** — the ratchet is one-way; manual + structural-detection nudges
  only.
- **Vocabulary retirement sweep** — purging superseded tier / incidental references across workflows,
  strategies, templates → **`doc-cascade-sweep`**.
- **`Class`-aware next-work intelligence** — feeding `Class` through the session-init probe so the discovery
  arm can suggest *what to start given what is in flight* (parallelism-aware suggestions over in-flight `Class`
  composition). This is *consumption* of the `Class` contract, not its definition → **agile-parallelism /
  Concurrent Work Conventions** (with fit-assessment in the `arc-plan-conductor`). This WU exposes `Class`
  (recorded on the meta, rendered in STATUS.USER); reasoning over it is downstream.

## Technical Considerations

The core of this technical spec — the surfaces touched and the contracts exposed.

### Constitutional surface (DEV-RULES.ARC + companion ADR)

The `Class` definitions, the boundary tests, and the scaled-ceremony framing are constitutional-level additions
to DEV-RULES.ARC, comparable in blast radius to ADR-016. The amendment must **record the reasoning, not only the
conclusions**, so the model can be rebuilt: the two-floors distinction (discipline floor below the wrapper,
never scales; wrapper floor = the smallest thing that is a WU), the spec-worthiness defining trait (a WU adds an
authored spec + a tracked lifecycle over a bare disciplined commit; tracking is a *consequence* of
spec-worthiness, never an independent cause), and the fixed-floor → scalable-middle → fixed-ceiling topology
(band width shrinks as pre-impl demand rises along either axis). The companion ADR carries the architectural
narrative; DEV-RULES.ARC carries the enforceable rule.

Anchors to cite: ADR-001 (P1 spec-directed, P2 review increment, P4 quality gates, P7 tracked lifecycle),
ADR-020 (scalable core; resolve-then-load), ADR-021 (Errand wrapper-floor), ADR-022 (schema-owned meta with
conditional validity).

### Meta-schema surface (ADR-022 structured-record model)

`Class` / `Design` are schema-owned fields with `Class`-conditional validity — a cross-field constraint a flat
template cannot express; state transitions are schema events, not free-text edits. `Class` groups with the
classification fields; `Design` is a typed pointer orthogonal to `Origin`. The path-valued `Cohort` field is the
membership source of truth (sibling lists derived). Header dual-placement (meta + spec) makes the flat `active/`
layout self-describing for grouping. The validation in R17 is a warn-not-block hook on `Class` ↔ spec-form
consistency — implemented against the existing githook surface, no new tooling.

### The felt-difference test (model guardrail / acceptance lens)

**Every position the model exposes must be distinguishable to the *user* in rigor and/or speed; a distinction
visible only to the author is arbitrary and must collapse.** The three spec forms pass (they differ in speed and
rigor). The two `Class` values pass, including the straddle: a `heavy`/`outline` WU (large refactor) is
felt-distinct from a `light`/`outline` WU by its task-gen depth. There is no `light`/`detailed` position
(`detailed` *derives*, forcing `heavy`). The test *rejects* the arbitrary-lever trap — a knob producing
identical artifacts distinguished only modally. `Class` avoids it: it is the aggregate weight of two genuinely
independent, each-felt axes (derivation as up-front cognitive load; scale as a task-gen grounding grind).

### Why three spec forms (not two)

The gap between a single-paragraph `brief` and a full `detailed` PRD/RFC is enormous; a single middle is
structural, not optional. Three (vs. the industry's typical two) because: (a) ARC's mechanism
(resolve-then-load, per-stage self-resolution, composable fragments) needs **discrete, loadable** resolutions —
you cannot load a fragment against a continuum; (b) the spec-gap argument; (c) the felt-difference test
validates each. The Oxide continuum is the considered-and-declined alternative (declined for agent-loadability).

### Naming (settled; research-informed, project's call)

`Class` (not `Complexity Tier` / bare `Tier`) — a binary *kind* of work; sidesteps the quality-gate `Tier 1/2/3`
collision. `light` / `heavy` (not `light` / `full`) — natural antonyms; `heavy` accurately reads as "lots of
total work" now that scale is a legitimate component (guardrail: design-derivation or grounding scale, **not raw
code volume**). `planning depth` (`low` / `medium` / `high`) — magnitude vocabulary distinct from the spec-form
names; rejected `rigor` (mis-frames the bottom), `process intensity`. `brief` / `outline` / `detailed` (not
`sketch` — which connotes rough/will-be-redone, the opposite of a concise-yet-authoritative floor spec).
`derivation` + `scale` stay *explanation, never labels* (they inverse-correlate with weight and load different
stages).

### Migration & sequencing

The `Class` backfill and the `Cohort` field migration (R15–R16) are one manual pass with a tiny surface; no
hot-path logic. This WU ships standalone — `scalable-authoring-pipeline` and `decomposition-machinery` build on
the contracts it exposes, so those contracts (the `Class` model, the path-valued `Cohort` schema, the
relocatability invariant) must be precise, normative, and stable, not internal. The cohort doc records the
exposes/consumes partition; this spec is the authoritative definition for the surfaces it owns.

## Success Criteria

Validated explicitly at work-unit completion — concrete checks, not aspirations.

1. DEV-RULES.ARC carries the `Class` definitions, the two `heavy`-axis triggers, all three boundary tests (with
   the *substantial* guard on the scale trigger), the scaled-ceremony / invariant-discipline framing, and the
   front-loading-duty sharpening — and the reasoning (two floors, spec-worthiness, topology) is reconstructable
   from the text.
2. A companion ADR exists, parallel in scope to ADR-016, recording the architectural shift.
3. `template-meta.md` has `**Class:**` (replacing the `Tier` slot), `**Design:**` with `Class`-aware semantics,
   and a path-valued `**Cohort:**` with the dual-placement note; `Class`-conditional validity is specified.
4. Every spec-named position passes the felt-difference test (no `light`/`detailed`; the `outline` straddle is
   resolved by `Class` / task-gen scale).
5. Every WU artifact in `active/` and `backlog/` uses position-independent (filename-only) references; the
   relocatability invariant and the generalized source-side rule are stated in DEV-RULES.ARC.
6. Every member under `backlog/planned/` has a path-valued `**Cohort:**` field that path-matches its on-disk dir
   (or `[none]`); existing WUs carry `Class: heavy`.
7. A warn-not-block `Class` ↔ spec-form validation fires on mismatch; `Class` renders in STATUS.USER;
   `strategy-work-organization` carries worked boundary-test examples on each side of both `heavy` triggers.
8. The contract surfaces consumed by siblings (the `Class` model, the path-valued `Cohort` schema, the
   relocatability invariant) are defined normatively in this spec and the constitution — not left implicit.

## Open Questions

All three pre-authoring spec decisions are **resolved** (render → STATUS.USER; `Design` validation →
warn-not-block; migration → manual one-time pass), as is the cohort-baseline split (field-side only) and the
meta-`Cohort` grouping (stays function-grouped; the header anchor plays the membership role). Remaining items —
**resolve during work**, not blockers:

- **Exact rule wording for the front-loading-duty sharpening** — the constitutional phrasing that adds no new
  deferral mechanism while making the settle-upfront duty explicit across all forms. Settle at task-execution
  against DEV-RULES.ARC's existing § Design-before-implementation language.
- **`Class`-conditional validity mechanics** — the precise cross-field constraints the schema expresses
  (`heavy` ⇒ `detailed`; the `outline` straddle's two-sided validity) and their warn-not-block surfacing.
  Resolve when authoring the meta-schema + hook task.
- **RFC-template interim** — this spec uses the PRD template; the `detailed`·RFC template is
  `scalable-authoring-pipeline`'s. No action here beyond the form note in the H1.

## External Research

- **Boundary-test idiom (records-vs-derives + scale).** Shape Up shaping tier; Stripe / Google / GitLab
  design-doc thresholds; the records-vs-derives line and the substantial-grounding bar. Substantially covered by
  the 2026-06-03 lightweight-spec deep-research pass (run `wf_191136b1-518`). Remaining authoring work: the
  concrete strategy-doc examples on each side of the derivation line and the scale trigger (R19) — pull full
  source URLs from that transcript when authoring § Strategy guidance.
- **Spec-form count.** The three-form decision adapts individually-attested shapes (`brief` / `outline` /
  `detailed`) into one graduated, agent-resolvable ordinal; the Oxide RFD continuum is the
  considered-and-declined continuum alternative.
