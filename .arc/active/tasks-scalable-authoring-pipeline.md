# Task List: Scalable Authoring Pipeline

- **Design:** `spec-scalable-authoring-pipeline.md`

---

## **Phase 1:** Spec form foundations — template family + `Design` plumbing

_Purpose:_ Ship the substrate the pipeline selects among and produces — the four spec templates (with
research-grounded bodies) — plus the isolated `Design` multi-value CLI plumbing the layered pattern and
create-spec's write depend on. Independent of the workflow rework; lands first so the stage workflows have
real templates and a real parser to wire against.

_Design decisions:_ Four separate templates, never one flexing by conditionals (R2's "four not six" bound;
subtypes apply at `detailed` only). Templates and plumbing are co-housed as the pre-rework foundation —
different character (markdown authoring vs. test-first TS), but both prerequisites the later phases assume.
Every template edit is a two-copy edit (`.arc/reference/templates/**` and the `packages/arc-framework/arc/**`
mirror); the plumbing is single-source CLI code under `packages/arc-framework/src/`.

### `[x]` **1.1 `template-spec-brief.md` + `template-spec-outline.md`**

- _Goal:_ The two lighter spec forms exist as separate templates with research-grounded bodies, each leading
  with the `Spec ({form}): {name}` H1, so create-spec can select and emit a `brief` or an `outline` spec.

    - `[x]` **1.1.a `template-spec-brief.md` — the floor**
        - H1 Spec (`brief`): {wu-name}, an `Origin` field, one evolving paragraph (intent + scope boundary + one
          falsifiable signal), a one-line brief→outline sizing pointer, and a `**Success Criteria:**` anchor line.
          No requirement IDs, no matrix.

    - `[x]` **1.1.b `template-spec-outline.md` — the recording middle**
        - Sections: Problem/Context · Decision(s) · Scope boundary (No-gos) · Consequences & Risks · Success
          Criteria · Open items; `Appetite` as an optional top field. Decisions framed as the substrate the task
          list is built from and validated against; no requirement IDs / matrix.

- _Outcome:_ Settled the spec-form H1 convention across the whole family: form (and the `detailed` subtype) as
  backticked codified tokens joined by a ` · ` middot, the WU's natural name as plain prose (matching the
  `# Metadata:` / `# Task List:` H1s), kebab slug confined to filenames/cross-refs — e.g. Spec (`outline`): Name
  and Spec (`detailed` · `PRD`): Name. Made `Success Criteria` the form-invariant validation anchor (R6),
  present in every form and scaling from a one-line field (`brief`) to a short non-matrix list (`outline`);
  dropped author-facing taxonomy meta from the template bodies (rationale stays in the spec). Spec R2 (H1
  convention) + R3 (outline section set) reconciled to match; two-copy edit (`.arc/` + package mirror).

### `[x]` **1.2 `template-spec-detailed-prd.md` — de-straddle + complementary-use note**

- _Goal:_ The detailed PRD form exists as a cleanly product/feature template — evolved from the current full
  spec shape — with the technical-design straddle stripped out and a complementary-use note for layered mode.

    - `[x]` **1.2.a Author the detailed-PRD template**
        - New `template-spec-detailed-prd.md` evolved from `template-prd.md` (left in place — retires in Phase 3):
          H1 Spec (`detailed` · `PRD`): {wu-name}, P0/P1/P2 Requirements framed as the validation substrate,
          Success Criteria → Open Questions tail; placeholder aligned to `{wu-name}`.

    - `[x]` **1.2.b De-straddle the PRD**
        - User Stories now features-only; Technical Considerations reframed to constraints / dependencies /
          integration points that _bound_ the downstream design (technical design lives in the RFC).

    - `[x]` **1.2.c Complementary-use note**
        - Realized structurally rather than as prose: an `omit-when-paired` heading flag + a non-rendering
          scaffolding comment on the droppable section (PRD keeps the spine; Technical Considerations moves to
          the RFC when paired). The when/why-to-pair advisory moves to create-spec.

### `[x]` **1.3 `template-spec-detailed-rfc.md` — RFC section set + complementary-use note**

- _Goal:_ The detailed RFC form exists realizing the RFC section set, carrying its enumerable substance in a
  structured Proposed Design (replacing the PRD's User Stories + Requirements), with the complementary-use note.

    - `[x]` **1.3.a RFC spine + divergent middle**
        - New `template-spec-detailed-rfc.md`: H1 Spec (`detailed` · `RFC`): {wu-name}, Introduction/Context ·
          Goals · Non-Goals · Proposed Design (the substrate) · Alternatives & Rationale · Cross-cutting
          Considerations (user-facing impact folded in) · Success Criteria · Open Questions. No P0/P1/P2 enum.

    - `[x]` **1.3.b Complementary-use note**
        - Realized structurally: the three context-spine sections each carry an `omit-when-paired` heading flag,
          plus a top scaffolding comment (referential mode — the PRD owns the spine, the RFC drops it when
          paired). When/why-to-pair advisory moves to create-spec.

### `[x]` **1.4 `Design` multi-value plumbing — shared parse helper + validation**

- _Goal:_ The meta `**Design:**` field is accepted as one _or_ two references end-to-end (parse, validation,
  consuming sites, create-spec's write), following the `Depends On` convention — one bullet, comma-separated,
  each element individually backticked (`` `a`, `b` `` — two discrete tokens, not the compound `` `a, b` ``) — so
  the layered pattern and create-spec's two-reference write are real rather than fiction.

    - `[x]` **1.4.a Shared `parseIdentifierList` helper + `identifier-list` per-element render + consolidate**
        - Exported `parseIdentifierList` from `meta-reader.ts` and refactored the three byte-identical private
          `parseDependsOn` copies (`ready-mine-source.ts`, `in-flight-derivation.ts`, `worktree-roster.ts`) onto it
          (behavior-preserving — the three sites' suites stay green). Added a new `identifier-list` `valueClass`,
          moved `Depends On` + `Design` to it, and taught `formatValue` to render each comma-separated element
          individually backticked (`` `a`, `b` ``) — reusing the shared helper for the split, so render and parse
          can't disagree on element boundaries. Record-level parse unchanged (global `stripInlineCode` recovers the
          comma-joined value). Migrated the two existing two-value `Depends On` metas
          (`concurrent-work-conventions`, `doc-cascade-sweep`) to the per-element form.

    - `[x]` **1.4.b Accept one _or_ two `Design` refs in `validate-meta-spec.ts`**
        - `validateSpec` strips code spans globally then splits, so one _or_ two comma-separated `Design` refs pass
          (per-element `` `a`, `b` `` and the legacy compound `` `a, b` `` both), each element shape-checked; a
          third ref and multiple `**Design:**` _lines_ still fail. `collectFieldValues` now returns raw values
          (Cohort normalizes at its call site; State only counts lines).

    - `[x]` **1.4.c Consuming-site tolerance + create-spec write**
        - Confirmed: the single-string `Design` readers (`in-flight-derivation.ts`) carry a two-value comma string
          unchanged (parse strips per-element backticks globally → comma-joined value); the write path
          (`worktree-scaffold` → `renderMetaFile`) renders per-element via the `identifier-list` `formatValue`, no
          per-site render code. No standalone `create-spec` CLI write exists yet (workflow-driven).

- _Outcome:_ `Design` accepts one _or_ two references end-to-end. One shared `parseIdentifierList` split drives
  both the per-element render (new `identifier-list` valueClass) and every consumer's parse; the validator accepts
  one or two refs; single-string readers carry the comma-joined value unchanged. Because the record-level parse is
  render-form-blind (the global `stripInlineCode`), the convention was upgraded mid-execution from the planned
  compound `` `a, b` `` to per-element `` `a`, `b` `` at zero consumer cost — the two existing two-value
  `Depends On` metas migrated to match.

## **Phase 2:** The `draft-design` stage + `arc-plan` dispatcher

_Purpose:_ Establish the shared depth-resolution entry-read shape and realize the first of the three stages —
extract drafting into the `draft-design` workflow (peer to create-spec / generate-tasks), reduce the `arc-plan`
skill to a thin dispatcher into it, wire the first `classify-work-unit` touchpoint, and make the readiness bar
depth-relative.

_Design decisions:_ SAP ships single whole-block-structured files, not the dir-per-workflow package structure
(that pulls composition forward). The `high` lane is a _simple_ loop, not the conductor's enriched
`refine-plan-loop`; the skill is written as the conductor's clean seed (promoting it later extends its identity
rather than introducing a new mechanism).

### `[x]` **2.1 Extract the `draft-design` workflow (depth-lane whole-blocks)**

- _Goal:_ A new `draft-design` workflow exists as a peer to create-spec / generate-tasks — a single
  whole-block-structured file carrying the drafting-stage procedure that today lives implicitly in the
  `arc-plan` skill.
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

    - `[x]` **2.1.a Workflow scaffold + frontmatter**
        - Authored `draft-design.md` (`audience: collaborative`; `arc.methods` declares both
          `resolve-planning-depth` and `classify-work-unit`), shipped **unnumbered** beside `1_`/`2_`/`3_` and
          byte-identical across the
          `.arc/` instance and the package source. Plain `.md` (no `.template.md`): no init-time conditional
          blocks, matching `1_create-spec.md`.

    - `[x]` **2.1.b Whole-block depth lanes**
        - Three planning-depth levels, each selecting a path through the stage — `low` (determinacy-confirm, no
          draft) / `medium` (bounded draft — composed from existing patterns) / `high` (evolving-draft iterative
          loop with cross-session continuity: Resolved / Open / Next) — rebuilt on the `arc-plan` body (starting
          point, context gathering, facilitation, synthesis). The `medium`↔`high` boundary is bounded-composition
          vs open-ended-invention, not pass count; each level carries a step-up escape.

    - `[x]` **2.1.c Artifact-shape feed-forward**
        - The hand-forward is the draft's _produced shape_ (rich → `detailed`; thin / determinacy-confirm →
          `brief`/`outline`), not a recorded depth — create-spec re-reads the derivation axis at its own entry
          with the draft as evidence.

    - `[x]` **2.1.d Draft-capture commit fire-point**
        - A `workflow-interlock` stop + `workflowCommit` draft-capture fire-site persisting `Class` to the meta;
          the `Class` decision is live from the Step 1 read but its write defers to this ceremony commit. Staging
          sets the shape (bundled draft + meta for `medium`/`high`; dedicated meta-only `chore(arc):` for `low`).

- _Outcome:_ Both methods are declared in frontmatter though `resolve-planning-depth` is authored downstream —
  the forward declaration is intentional and commit-safe: pre-commit validates only method/extension files' own
  frontmatter, and the reverse coverage audit (CI-only) ignores a not-yet-existent method. Step 1 is a thin
  initiate-and-consume — the depth→evidence mapping stays the method's (the DRY home), not restated here
  (reconciled + directly linked at 2.3.c). The workflow stands whole; `arc-plan` still holds the live procedure
  until its dispatcher reduction.

### `[x]` **2.2 Reduce the `arc-plan` skill to a thin dispatcher into `draft-design`**

- _Goal:_ The `arc-plan` skill is a thin trigger that resolves depth and dispatches into `draft-design` — the
  established arc-`*` skill shape (`arc-session` → `session-init`) — with the depth-resolution left as a clean
  seam the conductor later wraps.

    - `[x]` **2.2.a Rewrite `SKILL.md` to dispatch**
        - Rewrote `arc-plan/SKILL.md` to the thin-dispatcher shape (modeled on `arc-session` → `session-init`):
          it dispatches into `draft-design` and describes what that workflow does — resolve the planning-depth
          level on the derivation axis (paired with `Class`), then draft at depth — with a positional arg for the
          starting point. The elicitation/synthesis procedure already moved to `draft-design` in 2.1, so this
          strips it from the skill; the not-during-execution and not-a-spec-gate guards are kept.

    - `[x]` **2.2.b Sync canonical → package mirror**
        - Both committed copies updated byte-identical (`.arc/system/.internal/skills/arc-plan/` + package
          mirror); the gitignored `.claude/` harness copy was refreshed for live correctness (not committed, per
          the self-hosting drift convention).

- _Outcome:_ The skill _describes_ the depth resolution rather than performing it — `draft-design`'s Step 1 owns
  the read, so there is no duplication; the goal's "resolve depth → dispatch" is realized as "dispatch into the
  workflow that resolves depth," exactly as `arc-session` dispatches into `session-init`. The conductor seam is
  preserved structurally — the skill stays the orchestration entry point — with no forward-reference to the
  conductor in the body.

### `[x]` **2.3 Author the `resolve-planning-depth` method + wire draft-design (first touchpoint)**

- _Goal:_ A new SAP-owned `resolve-planning-depth` method defines the shared one-entry-assessment shape (read the
  stage's keyed axis against best-available evidence → resolve the transient `planning depth` ordinal), and
  draft-design is its first consumer — invoking it on the **derivation** axis (no upstream; problem framing +
  compose-vs-invent scan), paired with `classify-work-unit` on the same single read so `Class` is born here.
- _Context:_ The method is the DRY home for R1's "one mechanism, three asymmetric axes" — create-spec (3.1) and
  generate-tasks (4.1) declare + invoke the same method with their own axis rather than re-deriving the shape.
  Forward-compatible with composable-workflows (a method now, a workflow fragment later — the trajectory
  `classify-work-unit` itself follows).
- _Note:_ Structural design settled; only thresholds (what evidence reads `high`) calibrate via dogfooding.
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

    - `[x]` **2.3.a Author the `resolve-planning-depth` method**
        - Authored `resolve-planning-depth.md` (both copies, byte-identical): the shared one-read shape (keyed
          axis vs. best evidence → `low`/`medium`/`high`), the level semantics (authoring distance, not the bar's
          height; a measurement against the standing `Class`), the three per-axis rows (draft-design / create-spec
          = derivation, generate-tasks = scale and feed-forward-immune), and the paired-not-merged relationship
          with `classify-work-unit`. CI coverage is satisfied by draft-design's existing declaration; create-spec
          and generate-tasks declare it at their stages. On-demand / re-entry firing is left to the cross-stage
          phase.

    - `[x]` **2.3.b Wire draft-design's invocation, paired with `classify-work-unit`**
        - Linked `resolve-planning-depth` in draft-design's Step 1 (the single derivation read drives both the
          level and the `Class` confirm-or-ratchet; `**Class:**` write still defers to the draft-capture ceremony
          commit, with the persistence rule landing in 5.2) and added `draft-design` to `classify-work-unit`'s
          `> Workflow:` header (both method copies).

    - `[x]` **2.3.c Re-examine `draft-design` against the landed method**
        - Verified against the now-authored method: Step 1 carries the direct link and explicitly defers the
          evidence→level mapping to the method ("the method's to define"); Step 2 is procedure only. The thin
          initiate-and-consume seam holds — no drift, no restatement. The workflow's compose-vs-invent step-up cue
          is consistent with (not a duplicate of) the method's level semantics.

- _Outcome:_ `resolve-planning-depth` lands as the shared DRY home with `draft-design` as its first wired
  consumer. Following the `classify-work-unit` precedent, the method's `> Workflow:` header tracks actual
  declarers incrementally — so 3.1.d / 4.1.b now carry explicit reminders to add create-spec / generate-tasks to
  both method headers when they wire it.

### `[x]` **2.4 Depth-relative readiness bar + `high`-only coherence-consolidation criterion**

- _Goal:_ draft-design's synthesis states (`fresh → rough → maturing → formalization-ready`) become
  depth-relative — "formalization-ready" means ready _at the chosen depth_ — and `high`-only
  coherence-consolidation criteria (a consolidation rewrite at the gate, an interim accretion softcap, and a
  no-detail-loss check) reconcile accreted draft layers into one clean input without dropping substance.

    - `[x]` **2.4.a Depth-relative readiness states**
        - Recovered the `fresh → rough → maturing → formalization-ready` states (stripped from `arc-plan`
          SKILL.md at 2.2) and wove them into the `high` lane's existing per-pass continuity synthesis — the
          state is now a field recorded alongside Resolved / Open / Next (step 4), not a parallel tracker. Added a
          "one bar, depth-relative distance" block: the formalization-ready bar's _height_ is invariant (the same
          gate `low`/`medium` clear faster), only the _distance_ scales.

    - `[x]` **2.4.b `high`-only coherence-consolidation criteria**
        - Added a `high`-only, suggest-not-enforce coherence-consolidation block to the `high` lane: the three
          leans (consolidate-before-formalization-ready, interim accretion softcap, no-detail-loss self-check)
          under the _amend-then-integrate_ / _leave-it-cleaner_ framing. Criteria only — kept as judgment leans,
          no mechanical accretion-detection or survival-verification machinery.

- _Outcome:_ Both lands target only the `high` lane (by construction `low`/`medium` don't accrete and clear the
  states instantly), realized as two scannable reference blocks below the unchanged 5-step loop rather than inline
  prose. No forward-reference to the deferred machinery: the workflow is adopter-facing, so the criteria-vs-machinery
  split is conveyed purely as _suggest-not-enforce_ (no internal-roadmap pointer per § Audience Boundaries).

## **Phase 3:** `create-spec` rework — depth variants, subtype gate, `spec-review`

_Purpose:_ Rework create-spec into whole-block depth variants that resolve form from a derivation entry-read,
select the matching template, apply the `detailed`-only PRD/RFC subtype gate, and fire the invariant
spec-finalization review gate via the new `spec-review` method + ceremony extension.

_Design decisions:_ The PROJECT-PRD / TECHNICAL-OVERVIEW alignment checks stay always-on floors (do not scale as
lanes — cost is naturally proportional to spec surface). The stale always-on "feature vs technical" step is
_reworked_ into the `detailed`-only subtype gate, not merely removed. `spec-review` is SAP-owned outright,
written as a standalone method a future review-method-family absorbs rather than forks.

### `[x]` **3.1 Depth resolution + template selection + form-agnostic reframe**

- _Goal:_ create-spec resolves spec form from a derivation entry-read, selects the matching template from the
  four-template family, and the form-agnostic reframe replaces generic "PRD = any spec" usage with "detailed
  spec" across the touched surfaces — `PROJECT-PRD` preserved as a distinct artifact.
- _Approach:_ Whole-block depth variants — discovery depth scales (intent+scope+one signal → decision-centric →
  full checklist); the template selected scales with it.
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

    - `[x]` **3.1.a Whole-block discovery depth variants**
        - Reworked create-spec's discovery into `low`/`medium`/`high` whole blocks as **spec-crystallization**
          content (completeness against the form's enumerable substrate + Success Criteria), distinct from
          draft-design's design-shaping — the two stages no longer overlap. Added a stage-boundary note (unsettled
          _design_ surfacing here is a derivation signal → step back, don't re-shape) and an open-questions guard
          separating settle-able design (must settle pre-impl) from genuine impl-detail latitude (may stay open).
          The `detailed`-only subtype folds into the `detailed` lane, not a discrete skippable step (composability).
          Recorded the framing in spec § R7 (spec-crystallization vs shaping; procedure relocates to the workflows).

    - `[~]` **3.1.b Template selection + retire `template-prd.md`**
        - Template **selection** landed in Chunk A (create-spec's Step 5 points at the four-template family with
          link defs). **Retirement** of `template-prd.md` re-homed to 6.4.d — its live references sit in the
          `strategy-work-planning` sections 6.4.d deletes/reframes, so retiring it there (not here) keeps each
          referrer single-touch and avoids fixing-then-deleting the same links.

    - `[x]` **3.1.c Form-agnostic reframe**
        - Reframed PRD→spec across create-spec — title `# Workflow: Create Spec`, the `purpose` line, and the body;
          kept `PROJECT-PRD` a distinct named artifact (the "Not the PROJECT-PRD" note). File name unchanged
          (`1_create-spec.md`) — the `1_` prefix drop is `doc-cascade-sweep`'s.

    - `[x]` **3.1.d Declare + invoke `resolve-planning-depth` + `classify-work-unit`**
        - Added create-spec's `arc:` frontmatter block (`resolve-planning-depth`, `classify-work-unit`) — none
          existed. Step 1 is the single derivation read driving both depth (→ form: `low`→`brief` /
          `medium`→`outline` / `high`→`detailed`) and the `Class` confirm-or-ratchet; `**Class:**` write defers to
          the Step 6 spec-generation ceremony commit (persistence rule lands in 5.2). Added create-spec to both
          `resolve-planning-depth`'s and `classify-work-unit`'s `> Workflow:` headers + link defs (both copies).
          `spec-review` / `pre-spec-finalization-review` join the `arc:` block at 3.3.b / 3.4.a.

    - `[x]` **3.1.e Keep alignment checks always-on**
        - PROJECT-PRD (Step 3) and TECHNICAL-OVERVIEW (Step 4) checks kept as binary always-on floors, labeled as
          such — cost-proportional to spec surface, never depth-laned.

    - `[x]` **3.1.f Strip template scaffolding markers on emit**
        - create-spec's Step 5 strips the detailed templates' scaffolding on emit — the top paired-mode comment
          block, the `omit-when-paired` / `optional | omit-when-paired` heading flags (heading text kept), and the
          inline non-rendering comments — so a finalized spec carries none. Standalone strips markers only; the
          paired path additionally drops the flagged sections (PRD Technical Considerations; RFC context spine).

- _Outcome:_ create-spec is the depth-variant, stage-discrete spec stage — form resolved from one derivation read
  (`low`→`brief` / `medium`→`outline` / `high`→`detailed`), discovery re-scoped to spec-crystallization (distinct
  from draft-design's shaping), the `detailed` subtype folded into its lane, scaffolding stripped on emit, and the
  alignment checks preserved as always-on floors. `template-prd.md` retirement re-homed to 6.4.d (entangled with
  the strategy reframe), so the remaining Phase-3 work is the 3.2 subtype-gate enrichment + 3.3/3.4 review seam.

### `[x]` **3.2 `detailed`-only subtype gate — PRD vs RFC by dominant derivation-kind**

- _Goal:_ When the resolved form is `detailed`, create-spec selects PRD vs RFC by _which kind of derivation
  dominates_ (product/requirements → PRD; technical-design → RFC), reworking today's always-on
  "feature vs technical" step into this detailed-only gate; `brief` / `outline` stay single category-agnostic
  forms.
- _Note:_ 3.1 (Chunk A) already removed the stale feature/technical step and seeded the minimal derivation-kind
  gate at the head of create-spec's `detailed` discovery lane (folded into the lane, not a discrete step). 3.2 now
  **enriches** that seam — chiefly 3.2.b's want-both decomposition signal — rather than building the gate from
  scratch; 3.2.a collapses to confirming the seed reads cleanly and any phrasing polish.

    - `[x]` **3.2.a Rework the feature-vs-technical step into the subtype gate**
        - Done across Chunk A — the stale feature/technical step was removed and the `detailed`-only gate seeded at
          the head of create-spec's `detailed` discovery lane (subtype by dominant derivation-kind, secondary
          dimension as a subsection); confirmed it reads cleanly.

    - `[x]` **3.2.b "Both PRD and RFC" → decomposition signal**
        - Added the want-both → **decomposition-signal** sentence to the detailed-lane Subtype bullet (split the WU,
          one spec per resulting WU by derivation-kind; not two specs in one WU). Phrased neutrally — no
          forward-pointer to the WU that will own decomposition machinery (§ Audience Boundaries).

### `[x]` **3.3 `spec-review` method — form-scaled lightweight default self-review**

- _Goal:_ A new `spec-review` method ships, always loaded by create-spec, providing a lightweight default
  self-review (coherence + grounding) scaled to the just-crystallized form (`brief`→quick, `outline`→moderate,
  `detailed`→full), with its grounding slice kept distinct from task-gen's scale-keyed audit.
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

    - `[x]` **3.3.a Author the `spec-review` method**
        - Authored `spec-review.md` (both copies) on the `.override` / `.default` method convention: two slices —
          **coherence** (decisions ↔ scope ↔ success criteria ↔ substrate agree; no orphan sections; substrate
          complete) and **grounding** (concrete refs real) — scaled to form (`brief`→quick / `outline`→moderate /
          `detailed`→full). Grounding kept **light** and explicitly distinct from task-gen's scale-keyed per-phase
          audit; posture fix-inline-or-surface; a design-reopening finding routes back as a derivation signal.
          Standalone/clean so a future review-method-family absorbs (not forks) it.

    - `[x]` **3.3.b Wire create-spec to load + invoke it**
        - Added `spec-review` to create-spec's `arc.methods` + link def, and named create-spec in the method's
          `> Workflow:` header. The method runs at the head of create-spec's **Step 6** (Finalize), feeding the
          **existing** finalization `workflow-interlock` — no new stop; fires at every form, collapsing to a single
          minimal check at `brief`. (The gate is Step 6, not the plan's "Step 7" — the Chunk A rework dropped the
          old work-category step.)

### `[ ]` **3.4 `pre-spec-finalization-review` extension (inactive default) + strategy precedent**

- _Goal:_ A `pre-spec-finalization-review` ceremony extension ships inactive/empty by default, firing co-located
  with the spec-finalization review gate (create-spec Step 7) as the opt-in seam for a team's procedure (async-PR
  / comment-window / committee cadences), with strategy-doc precedent + mapping.
- _Rationale:_ Named by its lifecycle gate (the `pre-*-review` family — parallel to `pre-merge-review` ↔
  `diff-review`), distinct from the `spec-review` method it augments; family membership is the additive signal.

    - `[ ]` **3.4.a Author + register the extension**
        - `pre-spec-finalization-review.md` with default-inactive `.actions`; declare it in create-spec's
          `arc.extensions` (structural no-op when absent); register it in `extensions/README.md` (the Index + the
          Extension Points table).

    - `[ ]` **3.4.b Strategy-doc precedent + mapping**
        - Document the team-cadence precedents as informative (not ARC-enforced) with a mapping to the extension.

## **Phase 4:** `generate-tasks` one-grammar rework

_Purpose:_ Parameterize the single task-list grammar by a direct **scale** entry-read — pass structure, phase
count, and grounding-audit depth scaling together — with the per-phase audit interlock retained (collapsing to a
single gate at `low`, never forking) and the task-list validation substrate keyed to the spec form.

_Design decisions:_ The scale axis is feed-forward-immune — no upstream artifact carries it (spec and draft both
track derivation) — so the direct entry read is load-bearing by design, cross-checked against `Class`. One
grammar only; never a second "flat" variant.

### `[ ]` **4.1 Invoke `resolve-planning-depth` (scale) + `classify-work-unit` touchpoint**

- _Goal:_ generate-tasks invokes the shared `resolve-planning-depth` method on the **scale** axis — reading the
  work surface directly at entry (codebase-grounding breadth, feed-forward-immune) — and the same read is its
  `classify-work-unit` touchpoint, cross-checked against `Class`.
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

    - `[ ]` **4.1.a Declare + invoke the shared methods (scale axis)**
        - Add `resolve-planning-depth` + `classify-work-unit` to generate-tasks' `arc.methods` (alongside the
          existing `test-first`); the scale read resolves `low`/`medium`/`high` from grounding breadth directly
          (no upstream depth to thread).

    - `[ ]` **4.1.b Confirm-or-ratchet + deferred write**
        - The same read confirms or ratchets `Class`; `**Class:**` write defers to the task-list generation
          ceremony commit (5.2). Add generate-tasks to both `resolve-planning-depth`'s and
          `classify-work-unit`'s `> Workflow:` headers.

### `[ ]` **4.2 One-grammar depth variants — pass structure + phase count**

- _Goal:_ generate-tasks runs one task-list grammar parameterized by depth — pass structure (`low` one combined
  pass → `medium` passes 1+2 merged → `high` full 3-pass) and phase count (1 substantive + always-present
  verification → few → 3–7 + dedicated verification) scaling together — never a second "flat" grammar.
- _Approach:_ Whole-block depth variants (a `low` pass-structure vs a `high` one), composable-ready; never
  fine-grained "if light, skip this sentence."
- **Strategies:** strategy-task-list-formatting.md, strategy-workflow-authoring.md

    - `[ ]` **4.2.a Pass-structure variants**
        - `low` one combined pass / `medium` passes 1+2 merged / `high` the full three-pass form.

    - `[ ]` **4.2.b Phase-count scaling**
        - 1 substantive phase + always-present verification → few → 3–7 + dedicated verification; the verification
          phase is never dropped.

    - `[ ]` **4.2.c Form-agnostic prose reframe**
        - Reframe generate-tasks' "PRD = any spec" language to form-agnostic "spec" (8 references today),
          mirroring 3.1.c for create-spec. Content-only — the file rename/renumber stays `doc-cascade-sweep`'s.

### `[ ]` **4.3 Grounding-audit depth parameterization (per-phase interlock retained)**

- _Goal:_ The grounding audit scales by _depth_ (a light files/symbols-exist pass at `low` vs the full
  eight-category `arc-task-audit` at `high`, keyed to the scale axis) while the per-phase interlock cadence is
  retained — collapsing to a single gate at `low` without forking, with the full variant always available
  mid-impl regardless of `Class`.

    - `[ ]` **4.3.a Depth-parameterize the audit invocation**
        - Light grounding (named files/symbols exist) ↔ full eight-category audit, selected by the scale read.
          Workflow-side only — `arc-task-audit` already takes caller-specified scope, so depth is an invocation
          directive from generate-tasks, **not** a skill edit.

    - `[ ]` **4.3.b Retain the per-phase interlock cadence**
        - Single-gate degeneration at `low` (the review-increment invariant is "a gate," not "N gates"); mid-impl
          always offers the full variant. _Confirm the per-phase-interlock invariance at authoring_ — the spec
          flags it a lean, not a settled 100% (§ Open Questions).

### `[ ]` **4.4 Validation substrate — audit against the form's enumerable units**

- _Goal:_ The grounding audit validates the task list against the form's enumerable substrate — generalizing
  beyond requirement-numbering to whatever units the form carries: numbered Requirements (PRD), structured
  Proposed Design elements (RFC), settled Decisions (`outline`), the one falsifiable signal (`brief`) — via
  identical `arc-task-audit` coverage.

    - Success Criteria stays the form-invariant anchor implementation is validated against (even the `brief`
      floor's one falsifiable signal); the enumerable substrate is what the _task list_ is validated against.
    - The audit mechanism is identical across forms; only the unit set it enumerates differs by form.

## **Phase 5:** Cross-stage dynamics — re-entry valve, ratchet, Novel overlay

_Purpose:_ Add the behaviors that span all three stages now that they exist: the axis-keyed re-entry valve at
each existing interlock, the decision-live / persistence-deferred ratchet with its DEV-RULES.ARC meta-timing
amendment, and the Novel advisory overlay decorating the `high`-draft + `detailed` lanes.

_Design decisions:_ Designed once, cross-stage, so the axis-keyed routing and the Novel overlay stay coherent
rather than diverging per stage. Every Novel item and every re-entry offer is accept-or-decline — no hard
`Class`↔form hook.

### `[ ]` **5.1 Re-entry valve — fold the mid-stage trigger into `resolve-planning-depth`**

- _Goal:_ The re-entry valve (capture durably → ratchet → re-enter) is realized as the mid-stage firing of
  `resolve-planning-depth`'s axis measurement, axis-keyed: a **scale** signal re-resolves the _same_ stage higher
  (nowhere-up from `high`); a **derivation** signal routes to the stage that owns the design (a masked design
  decision routes to the _spec_, not a deeper task pass); draft-design re-enters-higher only.
- _Approach:_ The routing logic lives once in the method contract; each stage's existing interlock _fires_ it,
  offered with a recommendation — never a new automatic detector, never three divergent copies. Coordinates with
  `classify-work-unit` for the `Class` ratchet (the derivation signal).

    - `[ ]` **5.1.a Extend the method contract with the mid-stage re-entry trigger**
        - Add the axis-keyed re-entry routing to `resolve-planning-depth` (the same measurement fired mid-stage,
          not at entry); wire each stage's interlock (draft-design / create-spec / generate-tasks) to fire it.

    - `[ ]` **5.1.b Down-switch floor + no-demotion guardrails**
        - Down-switching bounded by the demand floor; the `Class` ratchet is one-way; per-stage depth floats
          within the band; no produced heavier artifact is torn down.

### `[ ]` **5.2 Decision-live / persistence-deferred ratchet + DEV-RULES.ARC meta-timing amendment**

- _Goal:_ The `Class` ratchet is decision-live at the interlock (surfaced at once, driving that stage's depth
  immediately) but its `**Class:**` _write_ defers to each stage's planning-ceremony commit, and DEV-RULES.ARC's
  meta-timing ceremony list names the three planning-stage write sites so the deferred writes don't read as
  meta-timing violations to a future author.
- **Strategies:** strategy-package-project-sync.md
- _Note:_ Exact amendment wording is settled at implementation against the existing ceremony-list language
  (spec § Open Questions).

    - `[ ]` **5.2.a Decision-live / persistence-deferred at each touchpoint**
        - Drive depth immediately at the interlock; defer the meta write to the stage's ceremony commit
          (draft-capture / spec-generation / task-list generation), honoring the no-mid-session-churn rule.

    - `[ ]` **5.2.b Amend DEV-RULES.ARC § Commit Discipline meta-timing list**
        - The list `(activate / integrate / sweep / deactivate / spec generation / planning-lifecycle ops)`
          already names `spec generation`; add `draft-capture` and `task-list generation` explicitly (today
          implicit under `planning-lifecycle ops`) as the planning-stage `Class`-write sites. Mirror to the
          package source.

### `[ ]` **5.3 Novel advisory overlay across `draft-design` / `create-spec` / `spec-review`**

- _Goal:_ Novel is realized as an advisory overlay on the `high`-draft + `detailed` lanes only (Novel ⟹ both) —
  every item accept-or-decline, no hard `Class`↔form hook — decorating draft-design, create-spec, and
  spec-review; task-gen adds nothing.
- _Note:_ Unlike depth-resolution and the re-entry valve, Novel stays **per-stage whole-block conditionals**, not
  a shared method (R15): its content genuinely differs per stage (research sub-phase at draft-design; ADR-
  companion at create-spec; posture shift at spec-review) — there is no shared shape to extract. The asymmetry is
  intentional.

    - `[ ]` **5.3.a draft-design (`high`, primary)**
        - On an invent-vs-compose read of `novel`, recommend a free-form, self-sequencing orient-then-research
          sub-phase (orient first; research emerges from that). Output populates the rich draft's discovery /
          research / alternatives sections — no separate artifact.

    - `[ ]` **5.3.b create-spec (`detailed`, secondary)**
        - Surface a subtype-keyed ADR-companion recommendation — strong at `detailed`·RFC, weak/omitted at
          `detailed`·PRD. The companion ADR is authored under `reference/adr/` as a non-moving artifact (no Novel
          branch in integration).

    - `[ ]` **5.3.c spec-review posture**
        - Extra coherence/grounding care + an advisory "was the rationale captured / ADR considered?" nudge.

    - `[ ]` **5.3.d task-gen — explicitly nothing**
        - Kept explicit so no phantom lane is added (Novel is derivation-axis; task-gen is scale-driven).

## **Phase 6:** Lifecycle tolerance, conformance & strategy codification

_Purpose:_ Make integrate / archive artifact-presence-tolerant, run the workflow-authoring conformance pass over
the new and reworked workflows, route the workflow rename/renumber cascade to its executing sibling, and codify
the scaled-pipeline conventions (form taxonomy, depth model, validation contract) across the strategy docs.

_Design decisions:_ Integration is **not** tier-forked — one invariant procedure whose cost scales with what was
produced; the surviving gate is the invariant spec-presence / spec-alignment gate. SAP names only `draft-design`;
the existing-file rename/renumber cascade routes to `doc-cascade-sweep`.

### `[ ]` **6.1 Integrate / archive artifact-presence-tolerance + self-sizing completion record**

- _Goal:_ The integrate / archive workflows consume whatever the resolved depth produced — a `brief` spec, a
  one-phase task list, an absent separate completion doc — without requiring full-shape artifacts; the completion
  record is meta-appended and self-sizing; the invariant spec-presence / alignment gate survives and cost-scales.
  No `Class`-keyed tier fork anywhere in integration.
- _Context:_ `archive-work-unit.md` Step 3 still sweeps `prd-{name}.md` (a stale "PRD = any spec" assumption) and
  `integrate-work-unit.md` composes fixed-shape Release Notes + Completion Notes — both are
  artifact-presence-_assuming_ today.
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

    - `[ ]` **6.1.a Form-agnostic, presence-tolerant sweep (archive)**
        - Fix the `prd-{name}.md` sweep reference to `spec-{name}.md` — a **pre-existing staleness** (specs are
          already named `spec-`, so the line is wrong today), corrected as part of the form-agnostic reframe.
          Tolerate an absent task list / notes (the sweep already adjusts "to what exists").

    - `[ ]` **6.1.b Self-sizing completion record (integrate + `template-meta.md`)**
        - Compose a meta-appended completion record sized to what there is to say — a `light` mechanical change
          writes two sentences and may omit Release Notes when nothing is user-facing; a `heavy` WU writes
          paragraphs. Touches **both** `integrate-work-unit.md` (Steps 8–9 composition) and `template-meta.md`
          (mark the Release Notes Entry / Completion Notes archive-phase sections omittable in the schema).

    - `[ ]` **6.1.c Preserve the invariant spec-presence / alignment gate**
        - Keep the spec-alignment checks (cost-scales, near-instant for a `brief`) and add the explicit
          spec-**presence** assertion ("a spec exists at the resolved form") that integration currently only
          assumes; no "bypass planning" branch, no tier fork.

### `[ ]` **6.2 Workflow-authoring conformance pass over the new + reworked workflows**

- _Goal:_ draft-design + the reworked create-spec / generate-tasks pass `strategy-workflow-authoring`
  conformance — frontmatter method/extension declarations, body conventions, and correct interlock/release
  fire-point placement.
- **Strategies:** strategy-workflow-authoring.md

    - `[ ]` **6.2.a Frontmatter + body-convention conformance**
        - Verify method/extension declarations and body conventions across the three workflows.

    - `[ ]` **6.2.b Interlock / release fire-point placement**
        - Confirm the `classify-work-unit` touchpoints, the per-phase grounding-audit interlock, the
          spec-finalization review gate, and any commit/push fire-sites carry the right stops and class tags.

### `[ ]` **6.3 Route the workflow rename/renumber cascade to `doc-cascade-sweep`'s stub**

- _Goal:_ The workflow-file rename/renumber cascade (drop `1_`/`2_`/`3_` prefixes; depth-agnostic verb-object
  naming; the settled triad `draft-design` / `create-spec` / `generate-tasks`) is captured in
  `doc-cascade-sweep`'s stub so the sibling that executes the renames has it. The convention's decision-record
  stays this WU's spec (R18) — no adopter-facing strategy edit, no ADR (none is being drafted).
- _Context:_ `doc-cascade-sweep`'s draft currently scopes incidental/tier-concept retirement + graduation
  reconciliation — it does **not** yet carry this cascade. Per DEV-RULES.ARC § Discovered Work Routing, the
  cross-WU concern must land in the sibling's stub, not rest only in SAP's spec.

    - Add the cascade scope + naming convention to `doc-cascade-sweep`'s draft inbound buffer (coordinated with
      `naming-conventions`). SAP itself names only `draft-design` (Phase 2); it renames nothing.

### `[ ]` **6.4 Strategy-doc updates — form taxonomy, depth model, validation contract**

- _Goal:_ The strategy docs carry the scaled-pipeline conventions — the spec-form taxonomy
  (brief/outline/detailed-prd/rfc), the depth model and its three asymmetric axes, and the validation contract
  (Success Criteria universal; task list against the form's enumerable substrate) — across work-organization /
  work-planning / file-classification. Also **relocates procedure out of `strategy-work-planning`** into the
  workflows (the discovery-checklist / spec-readiness content): procedure belongs in workflows, the strategy
  keeping conventions only.
- **Strategies:** strategy-package-project-sync.md

    - `[ ]` **6.4.a Form taxonomy + depth model → `strategy-work-planning`**
        - Document the spec-form taxonomy and the depth model (one mechanism, three asymmetric axes;
          feed-forward-immune scale; the `resolve-planning-depth` method) in `strategy-work-planning` — the
          planning-pipeline home.

    - `[ ]` **6.4.b Validation contract → `strategy-work-organization`; layered pattern → `strategy-work-planning`**
        - Validation contract (R6) lands in `strategy-work-organization`, alongside CMF's `Class` model it already
          homes; the layered model (sanctioned pattern, `spec-{name}-prd.md` / `spec-{name}-rfc.md` naming, no
          config knob / workflow fork) lands in `strategy-work-planning`.

    - `[ ]` **6.4.c Spec-form naming → `strategy-file-classification`**
        - Add the spec-form naming + the spec template family to `strategy-file-classification` (the file-taxonomy
          home), cross-referencing the convention from 6.3 if useful.

    - `[ ]` **6.4.d Relocate procedure out of `strategy-work-planning` into the workflows**
        - Delete the now-dead **Discovery Checklist** + **Spec Readiness** sections — procedure belongs in
          workflows, not strategy docs: the design-shaping elicitation already lives inline in draft-design, and
          the readiness signal is draft-design's depth-relative formalization-ready states (2.4). Reframe **Spec
          Conventions** to the four-form family (drop "PRD = default form" / `# PRD:` H1 framing). Fix the dangling
          `discovery checklist` references (`STRATEGY-INDEX`, `strategy-planning-module`). No-loss check: confirm
          draft-design carries everything the deleted checklist held (e.g. an explicit "why now").
        - **Retire `template-prd.md` here (re-homed from 3.1.b).** `git rm` both copies and fix all remaining live
          references as part of this reframe: `strategy-work-planning` (its template-prd refs fold into the
          Spec-Readiness delete + Spec-Conventions reframe above), `strategy-file-classification` (swap the example
          filename — pairs with 6.4.c), the template `README`s, and the `strategy-package-project-sync` dependency
          list. Retiring it here, not at 3.1.b, keeps each referrer single-touch and avoids interim dangling links.

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` Four spec templates ship — `template-spec-brief.md` / `-outline.md` / `-detailed-prd.md` /
  `-detailed-rfc.md` — separate (not one flexing); each carries the `Spec ({form}): {name}` H1; the `detailed`
  pair carries the "Complementary use" note. No fifth/sixth template.
- `[ ]` create-spec resolves spec form by a derivation entry-read, selects the template accordingly, and the
  `detailed`-only subtype gate picks PRD vs RFC by dominant derivation-kind; the stale "feature vs technical"
  step is reworked, not merely removed; `brief` / `outline` stay single category-agnostic forms.
- `[ ]` The PRD template is de-straddled (User Stories technical-scenario clause removed; Technical
  Considerations reframed to constraints/dependencies) and the RFC section set is realized.
- `[ ]` generate-tasks runs one grammar parameterized by depth — pass structure, phase count (1..N + an
  always-present verification phase), and grounding-audit depth scale together from a scale entry-read
  cross-checked against `Class`; no second "flat" grammar; the per-phase audit interlock collapses to a single
  gate at `low` without forking.
- `[ ]` Each authoring stage resolves depth flag-free (no recorded/threaded depth value) via the shared
  `resolve-planning-depth` method: draft-design and create-spec from derivation, generate-tasks from a direct
  scale read; each entry-read doubles as its `classify-work-unit` confirm-or-ratchet (the two methods paired on
  one read, not merged), the `Class` write deferred to the stage's ceremony commit; depth differentiation is
  written as whole-block variants.
- `[ ]` The re-entry valve is a first-class branch at each stage's existing interlock (capture → ratchet →
  re-enter), axis-keyed: scale → same stage higher; derivation → route to the spec; draft-design →
  re-enter-higher only. Down-switching honors the demand floor; no heavier artifact is torn down.
- `[ ]` `arc-plan` is a thin dispatcher and the drafting stage is extracted into the `draft-design` workflow,
  with a depth-relative readiness bar (incl. the `high`-only coherence-consolidation criterion), the three
  planning shapes (`high` = a simple loop), artifact-shape feed-forward, and the first `classify-work-unit`
  touchpoint. SAP ships single files, not the dir-per-workflow package structure.
- `[ ]` The shared `resolve-planning-depth` method ships (SAP-owned) and, with `classify-work-unit`, is declared
    - invoked at all three planning-stage touchpoints; each is a light confirm-or-ratchet on a single shared read.
- `[ ]` The integrate / archive workflows are artifact-presence-tolerant — they consume a `brief` spec, a
  one-phase task list, or an absent separate completion doc without requiring full-shape artifacts; the
  completion record is meta-appended and self-sizing; the invariant spec-presence/alignment gate survives and
  cost-scales. No `Class`-keyed tier fork in integration.
- `[ ]` The `spec-review` method ships (always loaded by create-spec; lightweight default self-review scaled to
  the crystallized form; grounding slice distinct from task-gen's audit) and the `pre-spec-finalization-review`
  extension ships inactive/empty by default with strategy-doc precedent + mapping. The review gate fires at every
  form, collapsing at `brief` to a single minimal check.
- `[ ]` Novel is realized as an advisory overlay on the `high`-draft + `detailed` lanes only: draft-design
  recommends an orient-then-research sub-phase; create-spec surfaces a subtype-keyed ADR-companion recommendation
  (strong RFC, weak/omitted PRD); spec-review shifts to extra-care + ADR-nudge; task-gen adds nothing. Every item
  is accept-or-decline; the companion ADR is a non-moving artifact with no Novel branch in integration.
- `[ ]` The committed `Design` multi-value plumbing tolerates one _or_ two spec references end-to-end (field,
  parse, consuming sites, create-spec write), following the `Depends On` convention; the layered model is
  documented as a sanctioned pattern with the `spec-{name}-prd.md` / `spec-{name}-rfc.md` naming, with no config
  knob or workflow fork added.
- `[ ]` The new and restructured authoring workflows pass `strategy-workflow-authoring` conformance.
- `[ ]` DEV-RULES.ARC's meta-timing ceremony list names the three planning-stage `Class`-write sites, so the
  decision-live/persistence-deferred writes do not read as meta-timing violations.
- `[ ]` SAP names only the new `draft-design` workflow; it does not rewrite the existing `create-spec` /
  `generate-tasks` / `process-task-loop` files or their cross-references.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
