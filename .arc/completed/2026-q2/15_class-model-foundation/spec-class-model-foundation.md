# PRD: Class Model Foundation

- **Origin:** [internal]
- **Cohort:** principle-anchored-core/agile-wu-lifecycle

- **Purpose:** Establish the `Class` model — a three-value weight classification (`light` / `heavy` / `novel`,
  the top reachable through the derivation axis alone), the per-stage `planning depth` concept, and the three
  spec forms it names — as the constitutional and schema foundation the rest of the cohort builds on: scale how
  much design must be *authored*, never the discipline that validates it.

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
fields; it states the artifact-relocatability invariant and closes a source-side gap in the reference rule; it
makes the classification a *present* signal — a `classify-work-unit` method forced at entry into `planned/` via
a `graduate-work-unit` workflow, re-tuned at lifecycle touchpoints; and it migrates existing work units'
`Cohort` fields into the new schema.

**Why now:** this WU is the base of the `agile-wu-lifecycle` cohort — `scalable-authoring-pipeline` and
`decomposition-machinery` both consume the contracts it exposes, and `doc-cascade-sweep` retires the superseded
vocabulary. It ships standalone (the authoring workflows default to `heavy` behavior until
`scalable-authoring-pipeline` adds per-stage depth resolution), so the foundation can land and stabilize before
the consumers build on it.

## Goals

- Define a **recorded, objective weight classification** (`Class`: `light` / `heavy` / `novel`, `[TBD]` until
  resolved) that downstream roadmap / parallelism planning can read, driven by two intrinsic, stage-decorrelating
  axes of the work — `novel` a distinct *kind* (invention vs. composition) reachable through the derivation axis
  alone, recorded primarily as the parallelism / sequencing balance signal — and **present when the balance
  decision needs it** (forced at entry into `planned/`, the readiness rung the start decision reads, not deferred
  to activation).
- Make the **classification boundaries crisp** — recognizable-in-retrospect tests (Errand-vs-WU, then the
  derivation and scale triggers that promote to `heavy`, then the invent-vs-compose threshold that promotes
  `heavy → novel`) that place work without author guesswork, each floored against the design-vs-implementation
  line so trivial in-flight decisions never count as derivation.
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

1. **The `Class` model.** Define `Class` as a three-value recorded classification — `light` / `heavy` / `novel`
   — that is the WU's *weight*: the work it demands across planning, execution, and review. **`heavy` iff
   *either* of two intrinsic axes is high; `novel` iff the derivation axis is high at a second, higher
   threshold:**
    - **Derivation** — how much design must be *authored* versus read off determinate inputs. `derived work`
      (settling requires authoring a real design) is always `heavy`; `determinate work` (design determinate
      from existing inputs; the spec *records* it) is `light` unless scale/complexity promotes it. Derivation
      also tracks how novel vs. routine the execution is, and the validation rigor at review. **Floor:**
      derivation counts only *spec-worthy* design — decisions a competent engineer must settle *before starting*
      — never in-flight implementation choices (naming, local structure); this is the design-vs-implementation
      line (R7) viewed from the classification side, and it keeps trivial "we had to decide something" from
      tripping `heavy`.
    - **Scale / complexity** — how large or intricate an existing-code surface a correct plan *and execution*
      must navigate (the codebase-grounding demand). Co-equal: a determinate-but-large refactor is `heavy` by
      grounding demand alone, and that largeness carries into careful execution and heavier review.

   **`novel` is a distinct *kind*, not merely more weight** — work whose design requires *inventing* concepts /
   models that do not yet exist in the problem domain (synthesis, external research, discovery), versus
   *composing* a real design from existing ARC patterns and primitives. It is reached **through derivation
   alone**: the axes are asymmetric — scale is *endurance* (chunkable, parallelizable, and self-limiting because
   runaway breadth trips decomposition into a cohort), while derivation is *depth* (serial, context-saturating,
   plate-dominating and unbounded). So `novel` sits at the top of the saturating axis only; scale never reaches
   it. Its **primary** purpose is the parallelism / sequencing balance signal (the strongest "this fills the
   plate by itself — don't double up" marker); its **secondary** purpose is to open a distinct *available*
   planning shape (a research / discovery phase + ADR expectation), advisory rather than forced.

   `Class` is *driven* by these two intrinsic axes alone — not by raw output volume, and not by preference — and
   *indicates* weight across every phase, not planning alone. What stays invariant at every `Class` is execution
   *discipline* (the review-increment gate, quality gates), never the depth, novelty, or care the work demands.
   The axes **load different authoring stages** (derivation → drafting + spec creation; scale/complexity →
   task-gen) and therefore **decorrelate** — the model must not collapse them into a single bucket. The single
   `heavy` bit deliberately drops *where* the weight sits (planning vs. execution); per-stage planning depth
   recovers it, so the field is not split by axis-of-origin.

2. **The boundary tests** (crisp, recognizable-in-retrospect; a first-class deliverable). Apply in order — the
   first sorts work below the wrapper out of the model; the next two each independently promote to `heavy`; the
   last promotes `heavy → novel` on the derivation axis only:
    - **Errand vs. WU (wrapper floor, ADR-021):** *"Does this need more than a single logical concern — more
      than one review increment — to do well?"* No → Errand. Yes → WU.
    - **Derivation trigger (→ `heavy`):** *"Must a real design be authored — concerns, alternatives, tradeoffs
      that don't exist until someone works them out — before a competent engineer can start?"* Apply the floor:
      a decision a competent engineer resolves *during* implementation (naming, local structure) is not
      derivation, even though it is "deciding something."
    - **Scale / complexity trigger (→ `heavy`):** *"Does producing a correct implementation plan require a
      **substantial** codebase-grounding / mapping pass — a large or intricate surface of symbols and
      relationships to verify — beyond the routine floor?"* Guard the bar at *substantial*: most WUs carry some
      grounding; a soft bar makes everything `heavy`.
    - **Invent-vs-compose trigger (`heavy → novel`):** *"Does settling the design require **inventing** concepts
      / models that do not yet exist in the problem domain (synthesis, external research, discovery) — versus
      **composing** a real design from existing ARC patterns and primitives?"* Invent → `novel`; compose →
      `heavy`. This is a *magnitude cut within* "derivation fired," so it reads fuzzier than the fired-or-not
      lines above — tolerable because the consequence is advisory (a misread nudges a suggestion; the ratchet
      corrects it). Scale never reaches `novel`.

   `light` iff **both** `heavy`-triggers are no.

3. **`planning depth` — the per-stage resolution.** Define a `low` / `medium` / `high` ordinal that each
   authoring stage resolves *independently* from the axis that loads it. Depth is **transient, per-stage, never
   recorded**, and may vary across stages. Only the spec stage's depth names a durable artifact (the spec
   form). *(How each stage realizes its depth is `scalable-authoring-pipeline`'s; this WU defines the ordinal
   and that it resolves per stage.)*

4. **The three spec forms.** Define `brief` / `outline` / `detailed`, mapped from spec-stage depth
   (`low → brief`, `medium → outline`, `high → detailed`). `brief` → always `light`; `detailed` → always `heavy`
   *or* `novel` (derivation forces it; the invent-vs-compose threshold separates the two, which share the
   `detailed` form — `novel`'s distinct shape is the advisory discovery phase + ADR expectation, not a fourth
   form); `outline` → **either** `light` or `heavy` (`light` at moderate scale, `heavy` when impl needs a
   substantial grounding pass — disambiguated by the `Class` field / task-list scale). `detailed` splits by
   work category into PRD (feature) / RFC (technical); the other two forms do not split. *(The `heavy`/`brief`
   cell is empty: low scale reaches `heavy` only via derivation, which forces `detailed`.)*

5. **`Class` set is `{light, heavy, novel}` (plus the `[TBD]` pre-classification sentinel); atomic retires as a
   tier.** The three resolved values are `light` / `heavy` / `novel`; `[TBD]` is the not-yet-classified state a
   WU carries before its weight is known — distinct from `[none]` (every WU *has* a `Class`; it is merely
   unresolved; see R17). Atomic-character work executes as an Errand below the wrapper, or graduates to a WU.
   ADR-020 §3's spec-in-commit floor exception migrates *out of the tier model into the Errand class*
   (reconciling the ADR-020 ↔ ADR-021 tension). "Atomic" reverts to a pure character adjective. This WU owns
   only the *tier-side* reconciliation; the Errand operational path itself has shipped.

   **One sizing spectrum, two questions — atomic stays *character*, not a `Class` value.** `Class` and the
   Errand-vs-WU character line are the two questions of a single work-sizing pipeline — ceremony scales from one
   disciplined commit (Errand, the floor) to a from-scratch synthesis (`novel`, the ceiling). But they measure
   *different* dimensions and must not flatten into a four-value scale: the character line is *cardinality* (one
   logical concern → Errand; spec-worthy → WU), `Class` is *weight* within a WU. Atomic is not "below `light`":
   a tricky one-liner and a trivial one-liner are *both* atomic, so atomic measures concern-count, not weight —
   and an Errand has no meta to record a `Class` on. So `Class` stays WU-scoped (it begins at the `light` floor),
   atomic stays a character of work below the wrapper, and the spectrum is surfaced as framing, not as a merged
   taxonomy.

6. **Constitutional amendment to DEV-RULES.ARC.** Keep the always-loaded surface minimum-viable: add only the
   `Class` discipline-invariance guard (ceremony scales with the work's weight; execution discipline — the
   review-increment gate, quality gates — is identical at every model position, and that invariance *is* the ARC
   feel) and a pointer to the `classify-work-unit` method (the triage) and `strategy-work-organization` (the
   model); plus the **front-loading-duty sharpening** (R7). The axis definitions, the boundary tests, and the
   reasoning (two floors, spec-worthiness, topology) live on-demand in the method, the strategy, and the
   companion ADR (R8) — not in always-loaded DEV-RULES. AGENT-BRIEF.ARC introduces the `Class` vocabulary.

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

9. **Meta schema — `Class` field.** Add a new `**Class:**` field (`Light` / `Heavy` / `Novel` / `[TBD]`) as a
   schema-owned field in the meta's core block (`State` / `Owner` / `Branch` / `Class` / `Priority`; see R24),
   not provenance. Source of truth for the work's weight; declared / ratcheted through the authoring stages,
   default `[TBD]` until resolved. *(There is no `**Tier:**` field today — only a stale reservation comment in
   `template-meta.md`'s "Deliberately not added" block. R12 retires that comment; `Class` is added fresh, not a
   rename of an existing slot.)* **Estimate-then-ratchet,
   not strict one-way:** the ratchet protects *realized* design-authoring work — once a stage has authored
   design at some depth, `Class` never drops below that floor. An *estimate* (a value set before that work
   exists) is freely revisable in both directions until planning substantiates a floor; correcting a too-high
   estimate down is not a demotion (no work is discarded). This removes the lowball incentive — estimating
   `heavy` costs nothing if planning later reveals `light`. **Crucial distinction:** "execution turned out
   light" is *not* "the design was determinate" — if a real design *was* authored, realized authoring floors
   `Class` at `heavy` even when the surface is small and execution is trivial; only an over-high *estimate*
   (no authoring yet realized) corrects down. `Class`-conditional validity per ADR-022 (a cross-field
   constraint a flat template cannot express).

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

12. **`template-meta.md` additions.** Reflect R9–R11 and the R24 presentation convention in the meta template:
    add `**Class:**` to the core block (default `[TBD]`) **and retire the stale `Tier:` reservation comment** in
    the "Deliberately not added" block; `Design` field with `Class`-aware guidance; `Cohort` path-valued with the
    dual-placement note; apply the new field order, the core-block table, and the backtick / casing rules.
    `init-work-unit` scaffolds `Class: [TBD]` (no `--class` flag — the scaffolding act stays `Class`-agnostic;
    the value is born at planning, not creation). *(Updating the `template-draft` / spec-template family for the
    `Cohort` header rides `decomposition-machinery` / `scalable-authoring-pipeline` / the `doc-cascade-sweep`
    template pass, not this WU.)*

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

15. **Cohort-compliance baseline — field-side only (one-time).** A one-time pass over `backlog/` (planned +
    provisional) bringing every existing member's `**Cohort:**` field into the new schema and making it path-match
    its on-disk dir (standalone WUs → `[none]`); the same pass re-renders every `backlog/` meta to the R24 format
    (provisional included, so the backlog is one uniform shape — `Class` forcing stays `planned/`-only per R16).
    **Creating `cohort-{name}.md` records is *not* in this baseline**
    — that moves to `decomposition-machinery`, co-located with the record format, the Purpose floor,
    `template-cohort.md`, and the cohort-consistency enforcement it owns. *(Existing cohort docs —
    `agile-parallelism`, `principle-anchored-core`, `agile-wu-lifecycle` — already exist with rich shapes;
    minting minimal Purpose-only stubs now would be inconsistent with the format the sibling will formalize.)*

16. **Existing-WU `Class` migration (one-time, manual).** Every `backlog/planned/` member acquires a
    **best-estimate `Class`** against the boundary tests (R2) via a **one-time manual pass**, bundled with R15's
    field migration — *not* a blanket `heavy` stamp (that would fabricate the very signal `Class` exists to
    carry, and the ratchet would pin the error). `provisional/` members may stay `[TBD]`. The active WU and the
    already-classified `agile-wu-lifecycle` siblings keep their real values. Estimates are revisable (R9), so a
    best-effort read now is safe. **No auto-backfill on the session-init hot path.** *(Surface is small:
    `class-model-foundation` is effectively the only active WU until `agile-parallelism` fully lands —
    Concurrent Work Conventions is downstream of this cohort.)*

17. **`Class` forcing convention + lifecycle touchpoints.** State where `Class` is set and re-tuned, and the
    readiness rule that gives the signal meaning — homed in the `graduate-work-unit` workflow (R20) and
    `strategy-work-organization` (R23), packaged in the `classify-work-unit` method (R18); not in always-loaded
    DEV-RULES (an explicitly-triggered workflow owns the forcing, so it earns no global behavioral line):
    - **Readiness rule:** a `backlog/planned/` (startable) WU carries a resolved `Class` estimate; `[TBD]` is
      legal only in `backlog/provisional/`. The estimate is the balance signal `STATUS.USER` reads (R22) — it
      must exist *before* a WU is a start candidate, which is why the forcing point is **entry into `planned/`**,
      not activation (too late — the start decision precedes it).
    - **Touchpoint duty:** the `Class` value is lightly re-tuned at each lifecycle surface it passes through —
      planned-entry (the `graduate-work-unit` forcing point, R20), `init-work-unit` and `activate-work-unit`
      (wired here, R21), and the three planning stages (`arc-plan` / `create-spec` / `generate-tasks`, wired
      downstream by `scalable-authoring-pipeline`). Each is a cheap confirm-or-ratchet, not a re-derivation.
    - The estimate-vs-realized ratchet (R9) governs every touchpoint.

18. **`classify-work-unit` method.** Package the boundary-test triage (R2) plus the estimate-vs-realized ratchet
    (R9) as a loadable `classify-work-unit` method — the single DRY home every touchpoint (R17) declares in its
    workflow frontmatter, rather than re-stating the triage per surface. Authored as a self-contained extractable
    block (forward-compatible with `composable-workflows`'s whole-block fragmentation). This WU wires it into
    `init-work-unit` / `activate-work-unit` (R21); `scalable-authoring-pipeline` declares it in the
    planning-stage workflows it owns.

### P1 — should-have

20. **`graduate-work-unit` workflow (provisional → planned).** A lightweight lifecycle workflow — the execution
    home for R17's readiness rule — that promotes a WU up the readiness ladder: `git mv` `provisional/ →
    planned/`, run the `classify-work-unit` method (R18) to force the estimate, then regen ROADMAP + STATUS.USER.
    Mirrors `init-work-unit`'s existing `git mv` + ROADMAP-regen shape (a flat backlog-internal move; none of the
    cohort-transform / PR-park mechanics). **Reserves "graduation" for the readiness ladder** (`provisional →
    planned → active`); `decomposition-machinery`'s `WU → cohort` workflow is a *split*, not a promotion, and
    renames off "graduation" (routed to its inbound buffer; coordinated in the cohort doc).

21. **`init-work-unit` / `activate-work-unit` touchpoint wiring.** Wire the `classify-work-unit` method (R18)
    into both workflows as a lightweight confirm-or-ratchet step — `init` as the WU enters active planning,
    `activate` as the pre-implementation settle point. (The planning-stage touchpoints are wired downstream by
    `scalable-authoring-pipeline`.)

22. **`Class` render in STATUS.USER — in-flight *and* ready.** Render `Class` in `STATUS.USER`, and expand its
    content model from in-flight-only to **in-flight + ready** WUs (owned by the identity, unblocked,
    `planned/`) so the view supports the balance decision it exists for — "what's on my plate, and what could I
    add that fits." Exclude blocked / not-mine. Rendering the data is exposure (the *suggestion* engine over it
    is downstream — Concurrent Work Conventions); the ready list is what makes the exposed signal usable.
    Defining the content model + the `Class` column is this WU's; the **auto-render is gated on `roadmap-tooling`**
    (STATUS.USER auto-refresh isn't wired). Update the live instance + template shape to match as a one-off for
    consistency. *(ROADMAP render-inclusion stays out — both ROADMAP tables are near max width.)*

23. **Strategy-doc guidance with concrete examples.** Add boundary-test guidance to `strategy-work-organization`
    — the model's home — with concrete examples on each side of the derivation line, the scale trigger, and the
    invent-vs-compose (`heavy → novel`) line (records-vs-derives; routine-vs-substantial grounding;
    compose-vs-invent), plus the derivation floor (design-vs-implementation), the estimate-vs-realized ratchet
    with the "execution-light ≠ design-determinate" distinction, the readiness rule (R17), and the widened
    felt-difference test (rigor / speed / *sequencing*). State the **one-spectrum framing** here — connect
    § Work Character (the Errand-vs-WU cardinality line) to § Class Model (the weight line) as two questions of
    one work-sizing pipeline, while keeping `Class` WU-scoped and atomic a character (no four-value flattening).
    The `classify-work-unit` method states the tests; the strategy elaborates with worked examples.

24. **Meta-record presentation convention + reader consolidation.** Establish a uniform value-formatting and
    information-architecture convention for the meta record, enforced by `renderMetaFile` and recovered by a
    single `parseMetaRecord` — the meta is both a machine-parsed record and a durable human-read document (most
    acute in `completed/`, where it accrues completion + release-notes content), and the convention serves both:
    - **Value formatting (three-way).** Closed-set enum values are Capitalized backticked tokens (`State`,
      `Class`); identifier / reference values (slugs, filenames, paths) are backticked as-is (`Owner`, `Branch`,
      `Cohort`, `Depends On`, `Design`, `Task List`, `Priority`); bracket sentinels (`[none]` / `[TBD]` /
      `[internal]`) are unbackticked; narrative fields (`Last Completed`, `Next Task`, `Next Action`, `Blockers`)
      stay prose. The backtick marks a literal token (Markdown code-span semantics); the live distinction is
      token-fields vs. narrative-fields, not uniform backticking.
    - **Information architecture.** A hoisted **core block** rendered as a single-row table —
      `State | Owner | Branch | Class | Priority` (fixed short scalars) — then bullet groups in order:
      (`Cohort`, `Depends On`), the chain-of-authority artifacts (`Origin`, `Design`, `Task List`), the progress
      pointers (`Last Completed`, `Next Task`, `Blockers`), and the `Next Action` directive. The core table is
      line-length-exempt (`MD013 tables:false`) and `renderMetaFile` emits it pre-aligned (no hand-alignment).
    - **Reader consolidation (correctness).** Route every meta-field read through the single `parseMetaRecord`
      and retire the duplicated `extractField` (e.g. `git/worktree-roster.ts`, which does not strip inline code)
      so backticked values never break a consumer. The table parse is header-label-keyed with a column-count
      guard that fails loud, never silent. The core-block read is **migration-tolerant** — table-first, else the
      legacy flat-bullet scan — so the parser ingests pre-migration metas in the window before the one-time
      re-render (R15–R16, R24); the loud-fail applies only to a table that is present but malformed, not to its
      absence. Render always emits the new table.
    - Repo-wide alignment of *hand-edited* tables (a `prettier` / format-step concern) is separate dev tooling,
      not this WU; `renderMetaFile`'s self-aligned output means generated metas never depend on it.

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
- **Planning-stage `Class` touchpoint *wiring*** — declaring the `classify-work-unit` method in `arc-plan` /
  `create-spec` / `generate-tasks` → **`scalable-authoring-pipeline`** (it owns those workflows' per-stage depth
  resolution). This WU defines the method + the touchpoint duty (R17–R18) and wires only `init` / `activate`.
- **`Class` ↔ spec-form validation hook** — a warn-not-block consistency check between `Class` and the spec form
  → routed to **`scalable-authoring-pipeline`** (which makes the spec form a *structured* signal, where the check
  becomes cheap; today the form is freeform H1 prose and detection is brittle). Routed as a **candidate to
  evaluate, not a committed requirement**: the `classify-work-unit` lifecycle touchpoints already keep `Class`
  honest, `Class` / depth are advisory signals (a misclassification is not a structural problem), and a
  commit-time warning risks reading as a nag — so the sibling decides whether it is a value-add at all, even once
  it is easy.
- **The `WU → cohort` graduation-terminology rename** — freeing "graduation" for the readiness ladder by
  renaming `decomposition-machinery`'s split workflow off the term → **`decomposition-machinery`** (routed to its
  inbound buffer; coordinated in the cohort doc). This WU claims the term for `provisional → planned` (R20).
- **Stub-creation `Class` forcing** in `drain-inbox` / new-stub paths (vs. the `graduate-work-unit` forcing
  point) → the inbox / housekeep owners (`shared-inbox-housekeep` / `inbound-routing-method`), or a
  `quality-gate-hooks` readiness check. This WU states the readiness rule (R17); enforcement at *those* surfaces
  routes out.
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
- **A `Worktree` meta field** — worktree paths are machine-local and derived from the branch
  (`worktree.location_template`), and one WU = one branch = one worktree, so a stored path is both redundant with
  `Branch` and *wrong* in a tracked, cross-machine-portable record. Paths resolve live from `git worktree list`,
  never stored. (Recorded as a Non-Goal so the question isn't re-litigated mid-schema-change.)

## Technical Considerations

The core of this technical spec — the surfaces touched and the contracts exposed.

### Constitutional surface (DEV-RULES.ARC + companion ADR)

The `Class` model is a constitutional-level change comparable in blast radius to ADR-016, but document-tier
discipline keeps the always-loaded surface lean. **DEV-RULES.ARC carries only the minimum-viable
non-negotiable** — the discipline-invariance guard plus a pointer; the front-loading-duty sharpening rides the
existing § Design-before-implementation. **The companion ADR carries the reasoning**, so the model can be
rebuilt: the two-floors distinction (discipline floor below the wrapper, never scales; wrapper floor = the
smallest thing that is a WU), the spec-worthiness defining trait (a WU adds an authored spec + a tracked
lifecycle over a bare disciplined commit; tracking is a *consequence* of spec-worthiness, never an independent
cause), the fixed-floor → scalable-middle → fixed-ceiling topology (band width shrinks as pre-impl demand rises
along either axis), and the planning-depth ordinal + the three spec forms. **The `classify-work-unit` method
carries the boundary-test triage**, **`strategy-work-organization` the model elaboration + worked examples**, and
AGENT-BRIEF.ARC the vocabulary — none of these on-demand surfaces is always-loaded.

Anchors to cite: ADR-001 (P1 spec-directed, P2 review increment, P4 quality gates, P7 tracked lifecycle),
ADR-020 (scalable core; resolve-then-load), ADR-021 (Errand wrapper-floor), ADR-022 (schema-owned meta with
conditional validity).

### Meta-schema surface (ADR-022 structured-record model)

`Class` / `Design` are schema-owned fields with `Class`-conditional validity — a cross-field constraint a flat
template cannot express; state transitions are schema events, not free-text edits. `Class` sits in the meta's
core block; `Design` is a typed pointer orthogonal to `Origin`. The path-valued `Cohort` field is the
membership source of truth (sibling lists derived). Header dual-placement (meta + spec) makes the flat `active/`
layout self-describing for grouping. Form-vs-`Class` consistency is left advisory — maintained by the
`classify-work-unit` lifecycle touchpoints rather than a schema hook (see § Non-Goals).

The record's value-formatting and information architecture are themselves schema-managed (R24): `renderMetaFile`
emits a hoisted core-block table plus ordered bullet groups under the three-way backtick / casing / sentinel
convention, and a single guarded `parseMetaRecord` — the one reader every consumer routes through — recovers it.
This makes the meta legible as a human document (it accrues completion + release-notes content in `completed/`)
without sacrificing parse robustness; it also retires the drifted duplicate field-extractor.

### Forcing model & lifecycle touchpoints

`Class`'s value is only useful if it is *present* at the moment the balance decision is made — choosing which
ready WU to start, by eye, off `STATUS.USER`'s ready list. That decision precedes `init-work-unit`, so the
forcing point is **entry into `planned/`** (the `graduate-work-unit` workflow, R20), not activation. The
estimate-vs-realized ratchet (R9) is what makes an early estimate safe: it protects realized authoring, so a
best-effort read at planned-entry can be corrected as planning reveals the truth — removing the incentive to
lowball. The triage that resolves the estimate is the boundary tests (R2), packaged once as the
`classify-work-unit` method (R18) and re-applied — cheaply — at every lifecycle touchpoint (planned-entry, init,
activate, and the downstream planning stages). "Graduation" is reserved for the readiness ladder (`provisional →
planned → active`); the `WU → cohort` split is decomposition, not promotion.

### The felt-difference test (model guardrail / acceptance lens)

**Every position the model exposes must be distinguishable to the *user* in rigor, speed, *or how the work is
sequenced against other work*; a distinction visible only to the author is arbitrary and must collapse.** The
test admits a *behavioral / sequencing* consequence, not rigor and speed alone — otherwise it would reject
`novel`, whose felt difference is precisely a sequencing one (you can hold ~one genuinely-novel stream) plus a
distinct *available* planning path, even when its spec artifact equals a `detailed`/`heavy` one. The three spec
forms pass (they differ in speed and rigor). The `Class` values pass: `heavy`/`outline` (large refactor) is
felt-distinct from `light`/`outline` by task-gen depth; `novel` is felt-distinct from `heavy` by the plate it
fills and the discovery/ADR path it opens. There is no `light`/`detailed` position (`detailed` *derives*,
forcing `heavy` or `novel`). The test *rejects* the arbitrary-lever trap — a knob producing identical artifacts
distinguished only modally — and `novel` clears it on the sequencing axis, not by pretending to a different
artifact. `Class` is the aggregate weight of two genuinely independent, each-felt axes (derivation as up-front
cognitive load; scale as a task-gen grounding grind), with `novel` marking the saturating top of the first.

### Why three spec forms (not two)

The gap between a single-paragraph `brief` and a full `detailed` PRD/RFC is enormous; a single middle is
structural, not optional. Three (vs. the industry's typical two) because: (a) ARC's mechanism
(resolve-then-load, per-stage self-resolution, composable fragments) needs **discrete, loadable** resolutions —
you cannot load a fragment against a continuum; (b) the spec-gap argument; (c) the felt-difference test
validates each. The Oxide continuum is the considered-and-declined alternative (declined for agent-loadability).

### Naming (settled; research-informed, project's call)

`Class` (not `Complexity Tier` / bare `Tier`) — a *kind* of work, not a rung; sidesteps the quality-gate
`Tier 1/2/3` collision. `light` / `heavy` (not `light` / `full`) — natural antonyms; `heavy` accurately reads as
"lots of total work" now that scale/complexity is a legitimate component (guardrail: `Class` is *driven* by
design-derivation or grounding scale/complexity, **not raw code volume** — though a `heavy` WU does *indicate*
heavier execution and review). `novel` (not `heavy+` / a `light`-`moderate`-`heavy` ordinal) — it names the
*cause* (invention) where `light` / `heavy` name *weight*; the register break is accepted *because* the top is a
distinct kind, not just more weight, so the word carries that signal and retroactively sharpens what `heavy`
covers. An ordinal was rejected (it implies uniform single-axis spacing, false here — the `light↔heavy` and
`heavy↔novel` seams are two different tests — and `moderate`/`heavy` would collide with the `planning depth`
ordinal); `heavy+` was rejected as telling the reader nothing about what the top *is*. `planning depth` (`low` /
`medium` / `high`) — magnitude vocabulary distinct from the spec-form and `Class` names; rejected `rigor`
(mis-frames the bottom), `process intensity`. `brief` / `outline` / `detailed` (not `sketch` — which connotes
rough/will-be-redone, the opposite of a concise-yet-authoritative floor spec). `derivation` +
`scale / complexity` stay *explanation, never labels* (they inverse-correlate with weight and load different
stages).

### Migration & sequencing

The `Class` backfill (best-estimate against the boundary tests, not a blanket `heavy`) and the `Cohort` field
migration (R15–R16) are one manual pass with a small surface; no hot-path logic. This WU ships standalone —
`scalable-authoring-pipeline` and `decomposition-machinery` build on the contracts it exposes, so those
contracts (the `Class` model, the path-valued `Cohort` schema, the
relocatability invariant) must be precise, normative, and stable, not internal. The cohort doc records the
exposes/consumes partition; this spec is the authoritative definition for the surfaces it owns.

## Success Criteria

Validated explicitly at work-unit completion — concrete checks, not aspirations.

1. DEV-RULES.ARC carries the minimum-viable `Class` rule (the discipline-invariance guard + a pointer to the
   `classify-work-unit` method and `strategy-work-organization`) and the front-loading-duty sharpening; the
   § Atomic-tier infra-edit smell flag is removed and AGENT-BRIEF.ARC introduces the `Class` vocabulary. The
   boundary tests (with the *substantial* guard on the scale/complexity trigger) and the reasoning (two floors,
   spec-worthiness, topology) live in the `classify-work-unit` method, `strategy-work-organization`, and the
   companion ADR — not in always-loaded DEV-RULES.
2. A companion ADR exists, parallel in scope to ADR-016, recording the architectural shift.
3. `template-meta.md` adds `**Class:**` to the core block (default `[TBD]`) and retires the stale
   `Tier:` reservation comment; `**Design:**` carries `Class`-aware semantics; `**Cohort:**` is path-valued with
   the dual-placement note; `Class`-conditional validity is specified.
4. Every spec-named position passes the (sequencing-widened) felt-difference test (no `light`/`detailed`; the
   `outline` straddle resolved by `Class` / task-gen scale; `novel` felt-distinct from `heavy` on the
   sequencing axis + the discovery/ADR path it opens, not by a different artifact).
5. Every WU artifact in `active/` and `backlog/` uses position-independent (filename-only) references; the
   relocatability invariant and the generalized source-side rule are stated in DEV-RULES.ARC.
6. Every `backlog/` meta (planned + provisional) is re-rendered to the new format with a path-valued
   `**Cohort:**` field that path-matches its on-disk dir (or `[none]`); every `backlog/planned/` member
   additionally carries a **best-estimate `Class`** (not a blanket `heavy`), the active WU and already-classified
   siblings retain their values, and `provisional/` members are `[TBD]`.
7. `Class` renders in STATUS.USER over an **in-flight + ready** content model (mine, unblocked);
   `strategy-work-organization` carries the `Class` model (incl. `novel` and the invent-vs-compose line + the
   derivation floor), the `planning depth` ordinal, the three spec forms, the one-spectrum framing, and worked
   boundary-test examples on each side of both `heavy` triggers and the `heavy → novel` line, plus the ratchet +
   readiness rule.
8. The `classify-work-unit` method exists as the DRY triage home and is wired into `init-work-unit` /
   `activate-work-unit`; a `graduate-work-unit` (provisional → planned) workflow forces the estimate at
   planned-entry.
9. The contract surfaces consumed by siblings (the `Class` model, the path-valued `Cohort` schema, the
   relocatability invariant) are defined normatively in this spec and the constitution — not left implicit.
10. The meta record renders to the R24 presentation convention — the core-block table
    (`State` / `Owner` / `Branch` / `Class` / `Priority`), the three-way value formatting (Capitalized backticked
    enum tokens, backticked identifiers, bracket sentinels, prose narrative fields), and the field order —
    recovered by one guarded `parseMetaRecord` that every consumer routes through; the duplicated `extractField`
    is retired.
11. The `Class` set is `{light, heavy, novel}` — `novel` reachable through the derivation axis alone
    (invent-vs-compose), validated against a re-triage of the derivation-bearing heavies that yields a stable,
    recognizable minority (≈ 6–10 of 36); the confirmed subset of prior `heavy` estimates is reclassified
    upward with no `light` value and no `light`/`heavy` boundary disturbed; the schema, render, parse,
    `template-meta`, and STATUS.USER surfaces admit the third value.

## Open Questions

All pre-authoring spec decisions are **resolved** (render → STATUS.USER; migration → manual one-time pass), as is
the cohort-baseline split (field-side only) and the meta-`Cohort`
grouping (stays function-grouped; the header anchor plays the membership role). Resolved during task-generation
planning: the `[TBD]` sentinel + estimate-vs-realized ratchet (R9); the forcing model (planned-entry, not
activation) + the `classify-work-unit` method + the `graduate-work-unit` workflow (R17–R21); the STATUS.USER
in-flight-+-ready expansion with auto-render gated on `roadmap-tooling` (R22). Remaining items — **resolve during
work**, not blockers:

- **Exact rule wording for the front-loading-duty sharpening** — the constitutional phrasing that adds no new
  deferral mechanism while making the settle-upfront duty explicit across all forms. Settle at task-execution
  against DEV-RULES.ARC's existing § Design-before-implementation language.
- **RFC-template interim** — this spec uses the PRD template; the `detailed`·RFC template is
  `scalable-authoring-pipeline`'s. No action here beyond the form note in the H1.

## External Research

- **Boundary-test idiom (records-vs-derives + scale).** Shape Up shaping tier; Stripe / Google / GitLab
  design-doc thresholds; the records-vs-derives line and the substantial-grounding bar. Substantially covered by
  the 2026-06-03 lightweight-spec deep-research pass (run `wf_191136b1-518`). Remaining authoring work: the
  concrete strategy-doc examples on each side of the derivation line and the scale trigger (R23) — pull full
  source URLs from that transcript when authoring § Strategy guidance.
- **Spec-form count.** The three-form decision adapts individually-attested shapes (`brief` / `outline` /
  `detailed`) into one graduated, agent-resolvable ordinal; the Oxide RFD continuum is the
  considered-and-declined continuum alternative.
