# Spec (`detailed` · `RFC`): Scalable Authoring Pipeline

- **Origin:** [internal]
- **Cohort:** principle-anchored-core/agile-wu-lifecycle

- **Purpose:** Realize the `Class` model across the three pre-implementation authoring stages — drafting, spec
  creation, task generation — and make lifecycle integration tolerate the lighter artifacts they produce. Scale
  the *grammar* (template weight, phase count, audit depth) per stage to the work's pre-impl demand; never scale
  the discipline (the review-increment gate is invariant at every depth).

> *Form note (interim): a `detailed` · `RFC` (technical-design) spec authored on the PRD template with technical
> emphasis. The dedicated `detailed` · `RFC` template is this work unit's own deliverable and does not exist yet, so
> this spec uses `template-prd.md` until SAP ships it — the last spec that needs the interim treatment. The spec
> form lives here in the H1 and template, not in the filename (filename stays stable across forms per the
> `Design`-field semantics).*

---

## Introduction

`class-model-foundation` (CMF, shipped) established that ceremony should scale to a work unit's pre-implementation
demand and records a `**Class:**` per WU — but a recorded classification changes nothing until the authoring
workflows *act* on it. Today the universal planning entrypoint and `create-spec` / `generate-tasks` are
depth-blind: a determinate, `brief`-form WU still gets the only mode that exists — full facilitation, a full PRD
template, a three-pass task generation — defeating the lightness the model promises. The model's "wide band for
determinate work" is a classification on paper, not real authoring savings.

This work unit makes each authoring stage **resolve and apply the appropriate depth**, turning the recorded
`Class` from a label into scaled ceremony. It builds the scalable `create-spec` / `generate-tasks` pipeline: a
spec template family (`brief` / `outline` / `detailed`-PRD/RFC), per-stage **planning depth** self-resolution
with flag-free feed-forward, the task-list one-grammar, grounding-audit depth parameterization, `arc-plan`
depth-relativity (via a new `draft-design` workflow), the `spec-review` method + extension, and a single
artifact-presence-tolerance requirement on lifecycle integration.

The hard design constraint throughout: **parameterize the one invariant procedure by depth; never fork it into a
second skill or grammar.** A "flat" grammar or a `light`-variant skill is a parser fork and a maintenance trap.
Depth is a per-context default, never a lock.

**Why now:** SAP is one of two consumers that build directly on CMF's contracts (the other,
`decomposition-machinery`, runs in parallel). CMF shipped standalone with the authoring workflows defaulting to
`heavy` behavior precisely so this WU can land the per-stage depth resolution on a stable foundation.

## Upstream contract — consumed from `class-model-foundation` (shipped)

CMF is SAP's `Depends On` and the recurring design source. It **settled** (amending DEV-RULES.ARC, the meta
schema, and a companion ADR) the contracts SAP *consumes* and must never re-derive or diverge from. The SAP spec
references CMF's spec as the source of record rather than restate these:

- **The `Class` model** `{light, heavy, novel}` + `[TBD]`, the two intrinsic axes (derivation, scale), the
  boundary tests, and the estimate-then-ratchet — homed in `classify-work-unit` + `strategy-work-organization`.
- **The `planning depth` ordinal** `low` / `medium` / `high` — transient, per-stage, never recorded. CMF defined
  *the ordinal and that it resolves per stage*; **how each stage realizes it is SAP's** (an explicit CMF
  Non-Goal).
- **The three spec forms** `brief` / `outline` / `detailed`, the depth→form map (`low→brief`, `medium→outline`,
  `high→detailed`), the `Class`↔form constraints (`brief`→always `light`; `detailed`→`heavy`/`novel`; `outline`
  straddles), and that **only `detailed` splits** (PRD / RFC). SAP builds the form *templates*, not the form
  *definitions*.
- **The front-loading-duty sharpening** (constitutional, all forms): settle all settle-able design upfront;
  `outline` is faster than `detailed` because the design was *more determinate coming in*, not because it
  tolerates more open design.

CMF also **routed forward to SAP by name** (its Non-Goals): per-stage depth *realization*; the
`classify-work-unit` touchpoint wiring in `arc-plan` / `create-spec` / `generate-tasks` (CMF wired only `init` /
`activate`); and the **`Class`↔spec-form validation hook** as a *candidate to evaluate, not a committed
requirement* (SAP evaluates and declines it — see § Non-Goals).

## Use Cases / System Scenarios

Technical scenarios that illustrate per-stage depth resolution across the pipeline.

1. **Determinate moderate feature.** Design reads off a clear issue and existing patterns. draft-design resolves
   `low`/`medium` — a quick determinacy-confirm (no draft) at `low`, a bounded draft at `medium` → create-spec
   emits an `outline` spec (records the design) → generate-tasks reads a modest scale surface, resolves a light
   pass. The author never touches a
   full PRD template or a three-pass generation. *Before:* the only mode produced all three at full weight.

2. **Determinate large refactor (the `outline` straddle).** Design is determinate (rename/move a widely-used
   symbol), but a correct plan requires a substantial codebase-grounding pass. create-spec emits an `outline`
   spec (derivation is low); generate-tasks' entry scale-read resolves **`high`** anyway — full grounding audit,
   phased — keyed to the *scale* axis the spec form cannot carry. A `heavy`/`outline` WU, felt-distinct from a
   `light`/`outline` WU at task-gen.

3. **Tricky small algorithm.** A real design must be authored over a small surface. draft-design resolves `high`
   (iterative shaping); create-spec emits a `detailed` spec; generate-tasks reads a small scale surface and
   resolves a light pass. `detailed` spec, low task-gen depth — the inverse of scenario 2.

4. **Mid-stream underestimate (the re-entry valve).** A WU enters create-spec at `outline`, but formalization
   surfaces an unresolved design direction. The stage's existing interlock offers "capture, ratchet, re-enter":
   route back to `draft-design` (the direction is unshaped) rather than patch-and-limp an `outline` over an
   under-derived design. `Class` ratchets to `heavy`; the value is surfaced live, persisted at the next ceremony
   commit.

5. **Novel work.** The invent-vs-compose read at draft-design lands `novel` → the `high` lane recommends an
   orient-then-research sub-phase (advisory). create-spec emits a `detailed`·RFC and surfaces an ADR-companion
   recommendation (strong at RFC). No hard gate fires anywhere; every nudge is accept-or-decline.

6. **Layered authoring (opt-in, future-adopter).** A team with a real PM/eng role split authors a complementary
   PRD + RFC for one WU: `spec-{name}-prd.md` + `spec-{name}-rfc.md`, both referenced by the meta `**Design:**`
   field, the RFC going referential (spine dropped, pointing at the PRD). Supported as a documented pattern + a
   committed multi-value `Design` affordance — no config knob, no workflow fork.

## Requirements

### P0 — must-have

1. **Per-stage depth self-resolution mechanism (flag-free by construction).** Each authoring stage performs **one
   entry-assessment**: a read of its keyed axis against the best available evidence, with the upstream artifact
   (when present) as the richest input — not a separate "feed-forward" mechanism. This is *forced*: CMF makes
   `planning depth` transient, per-stage, never recorded, so no depth value can be threaded and each stage
   re-derives from evidence. The three stages share one shape, differing only in **which axis** they read and
   **what evidence is present**:
    - **draft-design** (derivation) — no upstream; evidence is the problem framing/origin + a quick
      compose-vs-invent scan. The first `classify-work-unit` touchpoint (`Class` is born here).
    - **create-spec** (derivation) — evidence is the `draft-*` when present (rich; its shape indicates the form),
      else `Class` + a direct problem read, narrowing to a **brief-vs-outline disambiguation**.
    - **generate-tasks** (scale) — **structurally feed-forward-immune**: no upstream artifact carries scale
      (spec and draft both track derivation), so task-gen reads the work surface directly at entry
      (codebase-grounding breadth), cross-checked against `Class`. Load-bearing by design, not a patch.
    Each read is **measurement vs. the standing `Class` estimate** — the read *being* each stage's
    `classify-work-unit` touchpoint falls out of estimate-then-ratchet (no circularity: one evidence read drives
    both depth and the `Class` update). The **structural** design is settled here; only **thresholds** (what
    breadth reads `high`, how many open decisions read `medium`) calibrate via dogfooding.
    The shared shape is **realized as a SAP-owned `resolve-planning-depth` method** (the keyed-axis read → depth
    ordinal), declared by all three planning workflows and **paired with — not merged into — `classify-work-unit`**
    (CMF's, which owns the recorded `Class`): one evidence read per stage, applied to both methods. A method now,
    a composable-workflow fragment once composition lands — the same trajectory as `classify-work-unit`. This is
    the DRY home that keeps the one mechanism from being copied verbatim into three workflows.

2. **Spec template family (four templates, separate not flexing).** Ship `template-spec-brief.md` /
   `template-spec-outline.md` / `template-spec-detailed-prd.md` / `template-spec-detailed-rfc.md` — four, holding
   the "four not six" bound (subtypes apply at `detailed` only). The divergent middles (PRD: User Stories +
   prioritized Requirements + Design Considerations; RFC: Proposed Design + Alternatives + Cross-cutting) are
   ~3 near-disjoint sections each, so the forms get **separate** templates, never one flexing by conditionals
   (which would re-import the merge anti-pattern). The H1 leads with the codified form — backticked — then the
   WU's natural name in plain prose, e.g. Spec (`brief`): Payment Retry or Spec (`outline`): Payment Retry. The
   `detailed` form additionally carries its subtype, joined by a middot and likewise backticked:
   Spec (`detailed` · `PRD`): Payment Retry / Spec (`detailed` · `RFC`): Payment Retry. Form and subtype are
   codified taxonomy (backticked); the name is the WU's display name (plain prose, matching the `# Metadata:` /
   `# Task List:` H1s), while the kebab slug stays in the filename and every cross-reference. One genre noun —
   **Spec** — keeps ARC's `spec-*` vocabulary and avoids a `Design Doc` ↔ `**Design:**`-field clash. Template
   *bodies* are authored at spec time (§ Open Questions).

3. **The three spec shapes (research-grounded designs).** The brief/outline/detailed shapes are settled design
   (bodies authored at spec time):
    - **`brief` (floor):** ~1 evolving paragraph — intent + scope boundary + one falsifiable success signal.
      Checkable, not an Errand.
    - **`outline` (middle, *records*):** ~1–2 pages (ADR length norm). Section set: Problem/Context · settled
      Decision(s) · Scope boundary (No-gos) · Consequences/risks · **Success Criteria** (concise, checkable —
      the form-invariant validation anchor of R6, not a P0/P1/P2 matrix) · Open items (worked out, not
      deferred). **No requirement IDs,
      no success-criteria matrix** (anti-up-drift) while fixing the decision + scope sections (anti-down-drift).
      Structurally different from a PRD, not "PRD minus sections"; a *spec* (feeds a task list, validates
      completion), distinct from an ARC ADR (a posterity record that feeds nothing) — do not conflate.
    - **`detailed` (ceiling, *derives*):** the current full spec, subtyped PRD / RFC by derivation-kind (R4) +
      concrete Success Criteria.

4. **Detailed-spec subtype selection — `detailed`-only, keyed to derivation-kind.** The `detailed` spec has two
   species, **PRD** and **RFC**, selected by *which kind of derivation dominates the WU*, not by "is it
   technical" (ARC is a SWE methodology — all work is technical):
    - **Product/requirements derivation → PRD** (the open question is *what should this do*).
    - **Technical-design derivation → RFC** (the open question is *what's the right technical design and
      tradeoffs* — refactor, migration, internal architecture, perf rework).
    This is the natural extension of the derivation axis (which already drives `detailed`) into derivation *of
    what*. It is **not** the industry role-driven PRD-plus-RFC split: ARC's developer-agent pair holds both roles
    in one loop, so the organizational reason for two layered docs evaporates — **one spec per WU by
    derivation-kind**, the secondary dimension carried as a subsection (a PRD's Technical Considerations as
    constraints; an RFC's note on user-facing impact). **"I want both a PRD and an RFC" is a decomposition
    signal** (`decomposition-machinery`'s domain), not a two-spec WU. Rework today's always-on "feature vs
    technical" create-spec step (a stale remnant that feeds nothing) into this `detailed`-only gate; `brief` /
    `outline` stay single, category-agnostic forms.

5. **The RFC section set + PRD de-straddle.** Define the RFC's section set, mapping the research-confirmed RFC
   spine onto ARC's spec idiom: H1 + Purpose · Introduction/Context · Goals/Non-Goals · **Proposed Design** (the
   heart — architecture, interfaces, data model, behavior; replaces the PRD's User Stories + Requirements) ·
   **Alternatives & Rationale** (the derivation heart) · **Cross-cutting Considerations** (security/perf/
   testing/migration/rollout) · Success Criteria · Open Questions. The shared spine (Intro/Goals/Non-Goals/
   Success/Open) is the stand-alone backbone; the divergent middles are *why* the forms are separate. Under
   layered use only the **context spine** (Intro/Goals/Non-Goals) drops — the companion PRD owns it; Success
   Criteria and Open items stay form-specific (a design's checks and open questions differ from the product's).
   The RFC
   omits P0/P1/P2 **Requirements** enumeration (un-idiomatic for design docs) and carries its enumerable
   substance in a structured **Proposed Design** instead. Correspondingly, **de-straddle the PRD**: strip "For
   technical work: system scenarios" from User Stories and reframe Technical Considerations from "the core of
   technical PRDs" to *constraints/dependencies/integration points for downstream design* — the PRD becomes
   cleanly product/feature; technical *design* lives in the RFC.

6. **Validation: Success Criteria as the universal contract.** Validation hangs on two form-invariant anchors,
   not requirement-numbering (which was only a PRD-idiom traceability convenience):
    - **Implementation validated against → Success Criteria.** Invariant across every form (even the `brief`
      floor's "one falsifiable success signal"); concrete, falsifiable, validated at completion.
    - **Task list validated against → the form's enumerable substrate, via the grounding audit.** The substrate
      differs by form — numbered **Requirements** (PRD), structured **Proposed Design** elements (RFC), settled
      **Decisions** (`outline`), the one falsifiable **signal** (`brief`) — but the mechanism (`arc-task-audit`
      coverage) is identical. The design *is* the enumerable unit set; it just is not always called
      "requirements."

7. **Scalable `create-spec` / `generate-tasks` — whole-block depth variants.** Per-stage depth self-resolution
   (R1) wired into both workflows, written as **whole-block depth variants** (a `low` task-pass structure vs a
   `high` one), never fine-grained "if light, skip this sentence" — so they extract cleanly to fragments when
   composition lands (forward-compat, `composable-workflows`; soft coordination, no hard dep). Includes:
    - **create-spec:** discovery depth scales (intent+scope+one signal → decision-centric → full completeness
      pass); the template selected scales (brief / outline / detailed-prd|rfc); the `detailed`-only subtype gate
      (R4). create-spec's discovery is **spec-crystallization** — completeness and concreteness against the form's
      enumerable substrate + Success Criteria — distinct from draft-design's design-shaping elicitation; the two
      stages do not overlap. Consequently the legacy discovery-checklist / spec-readiness *procedure* relocates out
      of `strategy-work-planning` into the workflows (draft-design already inlines the design-shaping elicitation;
      create-spec carries its own completeness pass), the strategy keeping conventions only — procedure belongs in
      workflows, not strategy docs. The **PROJECT-PRD / TECHNICAL-OVERVIEW alignment checks do not scale as
      lanes** — always-on, cost-proportional floors (§ Floors below the depth axis).
    - **generate-tasks (one-grammar):** one task-list grammar parameterized by depth — pass structure (`low` one
      combined pass → `medium` passes 1+2 merged → `high` full 3-pass); phase count (1 substantive + always-
      present verification → few → 3–7 + dedicated verification); grounding-audit depth (R8). Never a second
      "flat" grammar.

8. **Grounding-audit depth parameterization (per-phase interlock retained).** `arc-task-audit` is already
   per-phase-scoped at maximum, so *scope* is not a scaling parameter; what scales is **depth** — a light
   files/symbols-exist pass at `low` vs the full eight-category audit at `high`, keyed to the **task-gen scale
   axis** (not inherited from the spec form: a determinate-but-large refactor carries an `outline` spec yet
   demands a `high` audit). The **per-phase interlock cadence** (audit one phase → interlock → feedback → revise →
   proceed) is retained — at `low` (one substantive phase) it degenerates to a single gate, not a fork (the
   review-increment invariant is "a gate," not "N gates"). **Mid-impl always offers the full variant regardless
   of `Class`** (a `light` WU can still hit a tricky task) — depth is the per-context default, never a lock.

9. **Depth-shifting + the re-entry valve.** The author's pick within the band is **per-stage, re-selectable at
   each stage transition**; entry sets a default cascade derived from `Class`. Two guardrails:
    - **Down-switching is bounded by the demand floor** (never below the forced derivation/scale floor).
    - **No-demotion, correctly scoped:** free to choose how much to produce going into a not-yet-started stage;
      may **not tear down** a heavier artifact already produced. The `Class` ratchet is one-way; per-stage depth
      floats within the band.
    A resolved depth is never a one-shot commitment: any pass may surface that the estimate was too low. The
    response to a floor-raising signal is **capture (durably), ratchet, re-enter** — never patch-and-limp. The
    re-entry target is **axis-keyed**: a **scale** signal re-enters the *same* stage higher (nowhere-up from
    `high`); a **derivation** signal routes to the stage that owns the design (a masked design decision routes to
    the *spec*, not a deeper task pass). The trigger is a first-class branch at the stage's **existing** interlock
    stop, not a new detector — offered with a recommendation, never automatic. Mechanically it is the **mid-stage
    firing of `resolve-planning-depth`** (the same axis measurement, on demand rather than at entry), so the
    routing lives once in that method's contract — not copied into three interlocks — coordinating with
    `classify-work-unit` for the `Class` ratchet.

10. **The ratchet is decision-live, persistence-deferred.** A touchpoint may ratchet mid-stage; the decision is
    *live* at the interlock (surfaced at once, driving that stage's depth immediately), but the `**Class:**`
    *write* defers to the stage's planning-ceremony commit, never a mid-stage meta edit — honoring meta-timing's
    no-mid-session-churn rule. DEV-RULES.ARC's meta-timing rule is stated as a **principle** — the meta is written
    only where a ceremony workflow explicitly instructs it — so these planning-stage writes are sanctioned by the
    rule without an enumerated list to amend, and do not read as meta-timing violations to a future author.

11. **`classify-work-unit` touchpoint wiring.** Declare + invoke the `classify-work-unit` method (CMF's) at the
    `draft-design` / `create-spec` / `generate-tasks` planning-stage touchpoints (CMF wired only `init` /
    `activate` and routed these forward). Each is the stage's entry-read doubling as a confirm-or-ratchet of
    `Class` against the resolved depth (R1). Kept light, to stay forward-compatible with `arc-plan-conductor`.

12. **`draft-design` workflow extraction + `arc-plan` thin dispatcher.** Because skills can't compose and the
    composable mechanism is workflow-targeted, extract the drafting stage into the **`draft-design`** workflow
    (peer to `create-spec` / `generate-tasks`) and reduce the `arc-plan` *skill* to a thin trigger that
    dispatches into it — the established arc-`*` skill shape (`arc-session` → `session-init`). The depth-relative
    piece: make the drafting stage's readiness bar depth-relative — its synthesis states
    (`fresh → rough → maturing → formalization-ready`) stay, but "formalization-ready" means *ready at the chosen
    depth*; plus the three planning shapes (`high` = a **simple** loop — *not* the conductor's enriched
    `refine-plan-loop`) and artifact-shape feed-forward. The `arc-plan` skill is the **conductor's seed**: write
    its depth-resolution as a clean seam the conductor later wraps (rich selection/orchestration stays the
    conductor's). SAP ships single files, whole-block-structured, ready to split — **not** the dir-per-workflow
    package structure (that pulls composition forward).

13. **Lifecycle integration — artifact-presence-tolerance (one requirement, no tier fork).** Integration is
    **not tier-forked**: one invariant procedure whose cost scales naturally with what was produced. Make the
    integrate / archive workflows **artifact-presence-tolerant, not artifact-presence-assuming** — consume
    whatever the resolved depth produced (a `brief` spec, a one-phase task list, no separate completion doc)
    without requiring full-shape artifacts (WOR shipped integration around the full shape). The completion record
    is **meta-appended, self-sizing** by what there is to say (a `light` mechanical change writes two sentences
    and may omit Release Notes when nothing is user-facing; a `heavy` WU writes paragraphs). The surviving gate
    is the invariant **spec-presence / spec-alignment gate** ("a spec exists at the resolved form"), which
    cost-scales (near-instant for a `brief`) — no "bypass planning" branch.

14. **`spec-review` method + ceremony extension.** The spec-finalization review *gate* is invariant (a review
    increment always fires); its *content* and *cadence* scale and are configurable:
    - **`spec-review` method** — always loaded by create-spec; ships a **lightweight default self-review**
      (coherence + grounding pass, scaled to the just-crystallized spec form: `brief`→quick, `outline`→moderate,
      `detailed`→full), overridable. **SAP owns it outright** (intrinsically coupled to the spec-form family).
      Written as a clean standalone method a future review-method-family would *absorb* (extend, not fork).
      Its grounding slice is kept **distinct from task-gen's audit** (form-keyed coherence-grounding at
      spec-finalization vs. scale-keyed deep per-phase audit at task-gen).
    - **`pre-spec-finalization-review` ceremony extension** (named by its lifecycle gate, the `pre-*-review`
      family) — fires at the spec-finalization fire-point, **inactive/empty by default**; opt-in to point at a
      team's procedure (async-PR / comment-window / committee cadences). The
      strategy doc carries those as informative precedent + a mapping, not ARC-enforced.

15. **Novel realization — an advisory overlay (no fourth form, no hard hook).** Novel is a *kind* (invent-vs-
    compose, reached through derivation alone), not a depth or a fourth spec form; it shares `detailed`. The
    invariant that bounds it: **Novel ⟹ `high` draft-design + `detailed` create-spec**, so Novel never co-occurs
    with brief/outline/low/medium and is an **advisory overlay decorating exactly those two lanes**. Every item
    is a recommendation at the stage interlock (`Class == Novel`-keyed, accept-or-decline), never a gate, no hard
    `Class`↔form hook, written as whole-block conditionals:
    - **draft-design (`high`, primary):** the invent-vs-compose read lands `novel` → recommend a discovery/
      research sub-phase opening the high lane. **Free-form and self-sequencing — never preemptive:** the
      sub-phase **orients first** (establishes known/unknown, the compose-vs-invent boundary); the actual
      research emerges from that. Output populates the rich `draft-*`'s discovery/research/alternatives sections
      (optional scaffolding); no separate artifact.
    - **create-spec (`detailed`, secondary):** surface an **ADR-companion recommendation** (author an ADR
      capturing the invented model's rationale), **subtype-keyed** — strong at `detailed`·RFC (an invented
      architectural model is a cross-cutting decision, ADR's home turf; the RFC's inline Alternatives & Rationale
      is not ADR-redundant — different scope: this-design rationale vs. durable cross-cutting decision),
      weak/omitted at `detailed`·PRD (product-concept novelty is far less ADR-shaped).
    - **spec-review posture:** extra coherence/grounding care + an advisory "was the rationale captured / ADR
      considered?" nudge.
    - **task-gen:** **nothing** (Novel is derivation-axis; task-gen is scale-driven, reaching novelty only
      indirectly through scale). Kept explicit so no phantom lane is added.
    The companion ADR is a **non-moving artifact** (authored under `reference/adr/`, never relocated), so
    lifecycle integration consumes it like any durable doc — no Novel branch in integration.

### P1 — should-have

16. **Layered-mode (complementary PRD + RFC) support — documented pattern + affordance, not built machinery.**
    The opt-in, non-default path for teams with a real PM/eng role split (a complementary PRD **and** RFC for one
    WU, with **no overlap** — the RFC goes referential, dropping the shared spine and pointing at the upstream
    PRD). ARC is solo today, so support is deliberately light (YAGNI):
    - The strategy documents the layered model as a **sanctioned** path with the two-file naming convention
      `spec-{name}-prd.md` + `spec-{name}-rfc.md`, the meta `**Design:**` referencing both.
    - The detailed templates mark the droppable **context spine** structurally — an `omit-when-paired` heading
      flag plus a non-rendering scaffolding comment on each affected section (the PRD keeps the spine; the RFC
      drops it and goes referential) — rather than a prose note. create-spec carries the when/why-to-pair
      advisory and **strips the scaffolding markers** (heading flags + comments) whenever it emits a finalized
      spec — universally, with the paired case additionally omitting the flagged sections. No separate "pure"
      template file — the templates are already "remove what doesn't apply".
    - **Plumbing (committed — the affordance is fiction without it):** the meta `**Design:**` field, its parser,
      consuming sites, and create-spec's write **tolerate one *or* two** spec references, following the existing
      `**Depends On:**` multi-value convention — one bullet, comma-separated, each element individually backticked
      (`` `a`, `b` `` — two discrete tokens, not one compound `` `a, b` `` span). `Design` and `Depends On` share
      the `render: bullet` descriptor; the work moves both to a new `valueClass: identifier-list` whose
      `formatValue` renders each comma-separated element backticked, and consolidates the comma-split *parse*
      (duplicated across three private `parseDependsOn` copies) into one shared `parseIdentifierList` helper that
      drives both that render and every consumer's parse. The record-level parse is unchanged — the global
      `stripInlineCode` recovers the comma-joined value, so consumers are blind to the render form. The work also
      teaches `validate-meta-spec` to accept one *or* two comma-separated `Design` refs (keeping the
      multiple-*lines* rejection), confirms consumer-site tolerance, and migrates the two existing two-value
      `Depends On` metas to the per-element form. Bounded.
    - **Forward-compat (binds now):** keep the form model + filename convention tolerant of two detailed
      artifacts per WU, so a future config knob (`spec.model: unified | layered`) or a create-spec layered mode
      is a cheap late-binding addition — never an architectural fork. No config knob or workflow fork now.

17. **Workflow-authoring conformance.** The new and restructured authoring workflows (`draft-design` + the
    reworked `create-spec` / `generate-tasks`) follow `strategy-workflow-authoring`: frontmatter schema (method /
    extension declarations), body conventions, and **correct interlock / release fire-point placement** — the
    `classify-work-unit` touchpoints, the per-phase grounding-audit interlock, the spec-finalization review gate,
    and any commit / push fire-sites carry the right stops and class tags. A standing requirement, surfaced so it
    is not deferred at authoring time.

18. **Authoring-workflow naming convention (settled triad; cascade routed out).** Stages are named by function,
    depth-agnostically, verb-object — the settled triad **`draft-design`** / **`create-spec`** / **`generate-
    tasks`** (reads as the artifact chain: *draft the design → create the spec → generate the tasks*), avoiding
    derivation-implying verbs (which break at `low`) and sibling-reserved terms (`decompose` is
    `decomposition-machinery`'s). **Number prefixes are dropped** (the names self-sequence; `1_2_3_` reasserts a
    rigid linearity against this WU's re-entrant, depth-relative pipeline). **SAP names only the new
    `draft-design` workflow**; the existing-file rename/renumber cascade (dropping prefixes on `create-spec` /
    `generate-tasks` / `process-task-loop` + all cross-references) **routes to `doc-cascade-sweep`** (coordinated
    with `naming-conventions`) — half-renaming breaks references, and reconciling the interim mixed state is the
    terminal sweep's job.

## Non-Goals

Explicitly out of scope (with the owning member):

- **The `Class` model, boundary tests, meta schema, and ratchet semantics** — `class-model-foundation`
  (consumed here).
- **The decomposition procedure, grouping taxonomy, and graduation workflow** — `decomposition-machinery`.
  "I want both a PRD and an RFC" routes there as a decomposition signal (R4), not a two-spec WU.
- **The create-new `arc start` wiring and any `--class` override** — Concurrent Work Conventions. SAP adds no CLI
  flag; `--class` is dropped. Scaffolding stays `Class`-agnostic (a uniform minimal Planning container); `Class`
  is born in the planning stage and lives in the content.
- **Per-`Class` quality-gate-tier mapping** — Quality Gate Tiers. SAP establishes that depth scales authoring,
  not the quality-gate tier boundaries.
- **The existing-file rename/renumber cascade** (`create-spec` / `generate-tasks` / `process-task-loop` + all
  cross-references) — `doc-cascade-sweep` (coordinated with `naming-conventions`). SAP names only `draft-design`
  (R18).
- **The rich planning machinery** — rich depth *selection*, cross-stage orchestration, the enriched
  `refine-plan-loop` (bounded batches, plan-splitting detection, resume-aware refinement), and the mechanical
  coherence-accretion-detection / batched reconciliation — `arc-plan-conductor`. SAP ships the thin dispatcher +
  the simple `high` loop + the coherence-consolidation *criterion*; the conductor enriches the same skill (extend
  identity, not a new mechanism).
- **`Class` ↔ spec-form consistency check — evaluated and declined** (revisit only on dogfooding evidence). Once
  SAP makes the spec form a structured signal (the `Spec ({form}): {name}` H1 + the template family), a
  warn-not-block `Class`↔form check would be cheap — but the `classify-work-unit` touchpoints (init/activate +
  the three SAP adds) already keep `Class` honest by *active* confirm-or-ratchet, so a passive warn is redundant;
  `Class`/form are advisory (a mismatch breaks nothing structural); an enforcement-flavored warn undercuts CMF's
  "suggest, not enforce" stance at the very surface meant to embody it; and it is trivially addable later (YAGNI).
- **User-above ceremony preference as a built config knob** — deferred until the mechanical design is known; the
  decision criterion is whether "ceremony preference" resolves to a single coherent ordinal. Forward-compat binds
  now (design the scaling mechanism to consume a *resolved* preference value independent of its source —
  resolve-then-load); if it becomes a knob, its home is the `configuration` cohort's per-developer substrate.
- **The spec template *bodies*** as a pre-spec deliverable — the brief/outline/detailed-prd/rfc template bodies
  are authored at spec time (§ Open Questions), not designed here. The *shapes* and *section sets* are settled
  (R3, R5).

## Technical Considerations

The core of this technical spec — the surfaces touched and the contracts realized.

### One mechanism, three asymmetric axes

"One mechanism" (R1) carries three different *input signals*: drafting and spec resolve depth from
**derivation**; task-gen from **scale**. The parameterization is **not symmetric** across stages, and the spec
must carry this forward, not gloss it. The decisive asymmetry: the **scale axis is feed-forward-immune** — spec
form recovers the derivation lane, but scale is not recoverable from any upstream artifact (an `outline` may be
`light` or `heavy`), so task-gen reads it directly at entry (grounding breadth, cross-checked against `Class`).
Reframed from "a hole" to a property of the axis: because depth is never recorded, every stage re-derives
regardless, so there is nothing to thread, and the direct read is load-bearing by design.

### Floors that sit *below* the depth axis (do not scale)

- **Discipline floor** (P2 / P4) — per-commit review-increment + quality gates. Invariant.
- **Spec alignment checks** (`create-spec`: PROJECT-PRD principle / Out-of-Scope; TECHNICAL-OVERVIEW drift) —
  **binary on/off, always-on**, cost naturally proportional to spec surface. You cannot "lightly" check
  principle alignment; it is a yes/no gate regardless of spec weight. This cost-scales-but-never-forks pattern
  is the template for integration ceremony (R13).
- **Inline grounding** — even `brief` / task-gen keeps a *minimal* grounding check (named files/symbols exist);
  the generation-time slice of P1 intent-verification, hence floor, never "no grounding."

### Spec-ready & finalized thresholds — one form-invariant bar; the form sets the distance

There is **one spec-ready bar, form-invariant** (*is all settle-able design settled, and can I state how I'll
know it worked?*); what varies is the **distance** to it (authoring cost), not the **height** (`brief` reached
fast, `detailed` at full cost). Same for the spec → task-gen ("finalized") bar — one invariant (spec coherent +
design settled), with the grounding audit as the residual-catcher routing any straggler design decision back to
the spec (still pre-impl). No form leaves the spec stage with an open design decision. This makes `arc-plan`'s
readiness states depth-relative (R12). At `high`, the formalization-ready gate additionally carries a
**coherence-consolidation** criterion (below).

### Coherence-consolidation at the formalization-ready gate (`high`-only, iteration-sensitive)

Distinct from the re-entry valve (which catches a depth *underestimate*), this catches artifact *incoherence*: a
`high`-lane draft that iterates across many sessions accretes superseded sketch beside current design, so the
design is settled yet the document is not a single coherent spec-input. The working pattern is
*amend-then-integrate*: each session amends the evolving draft as decisions settle, and a holistic rewrite
reconciles the accreted layers into one clean input — producer-consolidates-before-handoff, the
*leave-it-cleaner* floor applied to the WU's own artifact. Three criteria govern it, all `high`-only and
**suggest-not-enforce** (a lean, never a hard block):

- **Consolidation is a formalization-ready pre-req.** Before a `high`-lane draft is declared formalization-ready
  (the gate into create-spec), its accreted layers reconcile into one coherent input.
- **An interim softcap.** When amendment accretion makes the draft costly to *resume against* mid-loop — each
  session re-parsing a pile of separate amendments to continue iterating — the loop suggests an integrating
  rewrite *before* everything is settled, so derivation continues against a clean artifact rather than a growing
  pile.
- **No-detail-loss on every rewrite.** Each consolidation, interim or final, must preserve every settled decision
  and surviving detail — a coherence rewrite must not silently drop substance. The producer self-checks the
  rewrite against the pre-rewrite layers.

**Friction-bounded:** `low` has no draft and `medium`'s drafting is bounded, so neither accretes materially —
`high`-only, and even there a single-sitting draft is coherent by construction and resolves all three instantly.
SAP ships the *criteria* (the readiness bar, the softcap rule-of-thumb, the no-loss check); the *machinery* —
mechanical accretion-detection, batched/resume-aware reconciliation, and diff-based survival verification — is
`arc-plan-conductor` enrichment of the high lane.

### Pipeline structure: peer workflows + a thin dispatcher (R12, R18)

The three stages are peer *workflows*; `arc-plan` is a thin dispatcher (the conductor's seed). Two layers:

- *Stage layer:* `draft-design` / `create-spec` / `generate-tasks` — each a workflow with depth-lane
  whole-blocks (root + fragments once composition lands). Durable stage procedures.
- *Orchestration layer:* the `arc-plan` skill — shipped thin (resolve depth → dispatch into `draft-design`).
  `arc-plan-conductor` later **grows the same skill** into the conductor (promoting it extends its identity
  rather than introducing a new mechanism).

Economy comes via composition, not skill-gating: pre-composition each workflow loads whole and its lanes are
whole-blocks; post-composition lanes become fragments → resolve-then-load economy, mechanically. The `arc-commit`
skill-gates-the-heavy-workflow pattern is the *fallback* if `low`'s context cost bites before composition lands,
not the design. SAP must build single files (whole-block-structured), never the dir-per-workflow package
structure.

### CLI / schema surface — `Design` multi-value plumbing (R16)

The only code surface: the meta `**Design:**` field accepting one *or* two references, following the existing
`**Depends On:**` multi-value convention — one bullet, comma-separated, each element individually backticked
(`` `a`, `b` ``, not the compound `` `a, b` ``). `Design` and `Depends On` share the `render: bullet` descriptor;
the work moves both to a new `valueClass: identifier-list` whose `formatValue` renders each element backticked.
The render-side change is small and contained to `formatValue`; the record-level parse needs no change, because
the global `stripInlineCode` already recovers the comma-joined value from either render form, so consumers are
blind to which form a meta was written in. What is *not* shared today: the comma-split parse is duplicated across
three byte-identical private `parseDependsOn` helpers (`ready-mine-source`, `in-flight-derivation`,
`worktree-roster`), and `validate-meta-spec` actively rejects more than one `Design` value. The work: consolidate
the split into one shared `parseIdentifierList` helper (home: `meta-reader.ts`) that drives both the per-element
render and every consumer's parse, refactor the three `Depends On` sites onto it and use it for `Design`; teach
`validate-meta-spec` to accept one *or* two comma-separated `Design` refs (retaining the multiple-*lines* guard);
confirm consumer-site tolerance; and migrate the two existing two-value `Depends On` metas to the per-element
form. No new dependency, framework, or infrastructure — an extension within the established three-layer CLI
structure.

### Anchors to cite

ADR-001 (P1 spec-directed, P2 review increment, P4 quality gates), ADR-020 (scalable core; resolve-then-load),
ADR-021 (Errand wrapper-floor, the lower bound this pipeline's depth band sits above), ADR-022 (schema-owned
meta — the `Design` multi-value plumbing rides this).

## Success Criteria

Validated explicitly at work-unit completion — concrete checks, not aspirations.

1. Four spec templates ship — `template-spec-brief.md` / `-outline.md` / `-detailed-prd.md` / `-detailed-rfc.md`
   — separate (not one flexing); each carries the `Spec ({form}): {name}` H1 convention; the `detailed` pair
   marks the droppable context spine structurally (`omit-when-paired`) per R16. No fifth/sixth template (the
   "four not six" bound holds).
2. `create-spec` resolves spec form by a derivation entry-read (R1), selects the template accordingly, and the
   `detailed`-only subtype gate picks PRD vs RFC by **dominant derivation-kind** (not "is it technical"); the
   stale always-on "feature vs technical" step is reworked, not merely removed; `brief` / `outline` stay single
   category-agnostic forms. The form-agnostic reframe replaces generic "PRD = any spec" usage with "detailed
   spec" across the touched surfaces (`PROJECT-PRD` preserved as a distinct artifact).
3. The PRD template is de-straddled (User Stories technical-scenario clause removed; Technical Considerations
   reframed to constraints/dependencies, not design) and the RFC section set is realized per R5.
4. `generate-tasks` runs **one grammar** parameterized by depth — pass structure, phase count (1..N + an
   always-present verification phase), and grounding-audit depth all scale together from a **scale** entry-read,
   cross-checked against `Class`; there is no second "flat" grammar or `light`-variant skill. The per-phase audit
   interlock is retained and collapses to a single gate at `low` without forking.
5. Each authoring stage resolves depth flag-free (no recorded/threaded depth value): draft-design and create-spec
   from derivation, generate-tasks from a direct scale read; each stage's entry-read doubles as its
   `classify-work-unit` confirm-or-ratchet touchpoint, with the `Class` write deferred to the stage's ceremony
   commit. The depth differentiation is written as whole-block variants (composable-ready), not fine-grained
   inline branches.
6. The re-entry valve is the mid-stage firing of `resolve-planning-depth` at each stage's existing interlock
   (capture → ratchet → re-enter), axis-keyed: scale → same stage higher; derivation → route to the spec;
   draft-design → re-enter-higher only. The routing lives once in the method contract, not copied per interlock.
   Down-switching honors the demand floor; no produced heavier artifact is torn down.
7. `arc-plan` is a thin dispatcher and the drafting stage is extracted into the **`draft-design`** workflow (peer
   to `create-spec` / `generate-tasks`), with a depth-relative readiness bar (incl. the `high`-only,
   iteration-sensitive coherence-consolidation criterion), the three planning shapes (`high` = a simple loop, not
   the conductor's enriched loop), artifact-shape feed-forward, and the first `classify-work-unit` touchpoint.
   SAP ships single files (whole-block-structured), not the dir-per-workflow package structure.
8. The `classify-work-unit` method is declared + invoked at all three planning-stage touchpoints (CMF having
   wired only init/activate); each is a light confirm-or-ratchet, forward-compatible with the conductor.
9. The integrate / archive workflows are **artifact-presence-tolerant** — they consume a `brief` spec, a
   one-phase task list, or an absent separate completion doc without requiring full-shape artifacts; the
   completion record is meta-appended and self-sizing (a `light` change may omit Release Notes when nothing is
   user-facing); the invariant spec-presence/alignment gate survives and cost-scales. No `Class`-keyed tier fork
   anywhere in integration.
10. The `spec-review` method ships (always loaded by create-spec; lightweight default self-review scaled to the
    crystallized form; grounding slice distinct from task-gen's audit) and the `pre-spec-finalization-review`
    extension ships inactive/empty by default with strategy-doc precedent + mapping. The review *gate* fires at
    every form,
    collapsing at `brief` to a single minimal check.
11. Novel is realized as an advisory overlay on the `high`-draft + `detailed` lanes only (Novel ⟹ both):
    draft-design recommends an orient-then-research sub-phase; create-spec surfaces a subtype-keyed ADR-companion
    recommendation (strong RFC, weak/omitted PRD); spec-review shifts to extra-care + ADR-nudge; task-gen adds
    nothing. Every item is accept-or-decline — no hard `Class`↔form hook is introduced; the companion ADR is
    treated as a non-moving artifact with no Novel branch in integration.
12. The committed `Design` multi-value plumbing tolerates one *or* two spec references end-to-end (field, parse,
    consuming sites, create-spec write), following the `Depends On` convention; the layered model is documented as
    a sanctioned pattern with the `spec-{name}-prd.md` / `spec-{name}-rfc.md` naming, with no config knob or
    workflow fork added.
13. The new and restructured authoring workflows pass `strategy-workflow-authoring` conformance (frontmatter
    method/extension declarations, body conventions, correct interlock/release fire-point placement).
14. DEV-RULES.ARC's meta-timing rule is principle-based — the meta is written only where a ceremony workflow
    explicitly instructs it — so the decision-live/persistence-deferred planning-stage writes are sanctioned
    without an enumerated list, and do not read as meta-timing violations.
15. SAP names only the new `draft-design` workflow; it does not **rename or renumber** the existing `create-spec`
    / `generate-tasks` / `process-task-loop` files or rewrite their cross-references (that prefix-dropping cascade
    is `doc-cascade-sweep`'s). The R7 *content* rework of create-spec / generate-tasks (depth variants,
    form-agnostic reframe) is in scope — the carve-out is the file rename/renumber, not the content.

## Open Questions

> Pre-spec-ready derivation is resolved (the draft's Derivation record); the structural design of all three
> stages is settled (§ Technical Considerations; R1–R18). The items below are finer spec-/implementation-time
> calls — **resolve during work**, not blockers.

- **`brief` / `outline` / `detailed-prd` / `detailed-rfc` template *bodies*** — research-grounded shapes are
  settled (R3, R5); the bodies themselves are authored at spec time / during template-building task work.
- **Thresholds / calibration** — what grounding breadth reads `high`, how many open decisions read `medium`,
  the felt audit cadence — calibrate via dogfooding, not a design deferral.
- **RFC-template interim** — this spec uses the PRD template; no action beyond the H1 form note. (SAP is the last
  spec that needs the interim, since SAP ships the RFC template.)

## External Research

- **Lightweight-spec idiom** — completed 2026-06-03 deep-research pass (run `wf_191136b1-518`): grounds the
  brief/outline shapes (§ R3). Pull full source URLs from that transcript when authoring the templates' External
  Research. Sources: Shape Up pitch, ADR/Nygard, GitLab handbook, Go proposal, Oxide RFD-0001, Microsoft eng
  playbook, Squarespace, Rust RFC. Posture: *inform and adapt, never adopt.*
- **RFC / technical-design-doc idiom** — completed 2026-06-06 focused research pass (four
  `external-research-analyst` subagents: RFC section sets; design-doc templates vs PRD; PRD + RFC coexistence;
  rationale/alternatives vs ADR). Grounds R4–R5 (the detailed-spec forms). Findings: a stable RFC spine
  (Summary → Motivation → Proposed Design → Rationale & Alternatives → Open questions, plus Goals/Non-Goals +
  Cross-cutting); RFC vs PRD differ in section *set*, not just emphasis; complement-and-stand-alone is the
  documented norm; the industry split is role-driven; RFC inline rationale ≠ ADR-redundant (different scope).
  Sources: Rust RFC template, Go proposal template, IETF RFC 7322, Oxide RFD-0001, "Design Docs at Google"
  (industrialempathy), GitLab / Squarespace / Uber design-doc templates, Pragmatic Engineer (RFCs & design
  docs), Nygard / Fowler on ADRs.
