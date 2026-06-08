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

### `[x]` **3.4 `pre-spec-finalization-review` extension (inactive default) + strategy precedent**

- _Goal:_ A `pre-spec-finalization-review` ceremony extension ships inactive/empty by default, firing co-located
  with the spec-finalization review gate (create-spec Step 7) as the opt-in seam for a team's procedure (async-PR
  / comment-window / committee cadences), with strategy-doc precedent + mapping.
- _Rationale:_ Named by its lifecycle gate (the `pre-*-review` family — parallel to `pre-merge-review` ↔
  `diff-review`), distinct from the `spec-review` method it augments; family membership is the additive signal.

    - `[x]` **3.4.a Author + register the extension**
        - Authored `pre-spec-finalization-review.md` (both copies, `active: false`, `[No extension configured]`)
          modeled on `pre-merge-review`. Declared it in create-spec's `arc.extensions` with a
          `· #pre-spec-finalization-review` fire-point at Step 6 (after `spec-review`, before the finalization
          interlock) + link def; registered in `extensions/README.md` (Index + Extension Points table, at the
          planning stage of the lifecycle order).

    - `[x]` **3.4.b Strategy-doc precedent + mapping**
        - Registered in `strategy-configurability-architecture` § Extension Points — added to the Fire-point family
          table (now six) and the Reserved-names list (now three); the latter carries the team-cadence precedents
          (async-PR review / comment window / committee sign-off) mapped to the extension as informative-only,
          ARC-enforced by none.

## **Phase 4:** `generate-tasks` one-grammar rework

_Purpose:_ Parameterize the single task-list grammar by a direct **scale** entry-read — pass structure, phase
count, and grounding-audit depth scaling together — with the per-phase audit interlock retained (collapsing to a
single gate at `low`, never forking) and the task-list validation substrate keyed to the spec form.

_Design decisions:_ The scale axis is feed-forward-immune — no upstream artifact carries it (spec and draft both
track derivation) — so the direct entry read is load-bearing by design, cross-checked against `Class`. One
grammar only; never a second "flat" variant.

### `[x]` **4.1 Invoke `resolve-planning-depth` (scale) + `classify-work-unit` touchpoint**

- _Goal:_ generate-tasks invokes the shared `resolve-planning-depth` method on the **scale** axis — reading the
  work surface directly at entry (codebase-grounding breadth, feed-forward-immune) — and the same read is its
  `classify-work-unit` touchpoint, cross-checked against `Class`.
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

    - `[x]` **4.1.a Declare + invoke the shared methods (scale axis)**
        - `2_generate-tasks` now declares `resolve-planning-depth` + `classify-work-unit` alongside `test-first`;
          its entry read resolves `low`/`medium`/`high` from grounding breadth directly (no upstream depth to
          thread).

    - `[x]` **4.1.b Confirm-or-ratchet + deferred write**
        - The same read confirms, ratchets, or corrects `Class`, with any `**Class:**` write deferred to Step 4's
          ceremony commit; both methods' `> Workflow:` headers now include `2_generate-tasks`.

- _Outcome:_ The `generate-tasks` entrypoint now has the shared scale-axis depth read wired as the
  first discrete step and `classify-work-unit` touchpoint in both framework copies, while keeping `Class`
  persistence deferred to the generation ceremony.

### `[x]` **4.2 One-grammar depth variants — pass structure + phase count**

- _Goal:_ generate-tasks runs one task-list grammar parameterized by depth — pass structure (`low` one combined
  pass → `medium` passes 1+2 merged → `high` full 3-pass) and phase count (1 substantive + always-present
  verification → few → 3–7 + dedicated verification) scaling together — never a second "flat" grammar.
- _Approach:_ Whole-block depth variants (a `low` pass-structure vs a `high` one), composable-ready; never
  fine-grained "if light, skip this sentence."
- **Strategies:** strategy-task-list-formatting.md, strategy-workflow-authoring.md

    - `[x]` **4.2.a Pass-structure variants**
        - `2_generate-tasks` now documents one depth-selected grammar: `low` folds structural decomposition,
          content fill, and grounding revision into one combined pass; `medium` merges Passes 1+2 before audit;
          `high` keeps the full three-pass form.

    - `[x]` **4.2.b Phase-count scaling**
        - Phase-count guidance now scales from one substantive phase + always-present verification (`low`), to a
          few substantive phases + verification (`medium`), to 3-7 substantive phases + dedicated verification
          (`high`); the verification phase is never dropped.

    - `[x]` **4.2.c Form-agnostic prose reframe**
        - Reframed `generate-tasks` from "PRD = any spec" to form-agnostic spec language, including frontmatter
          purpose, `When to use`, spec pre-read, source anchors, suite coherence, and task-list naming prose.
          Content-only — the file rename/renumber stays `doc-cascade-sweep`'s.

- _Outcome:_ The task-generation workflow now expresses one grammar parameterized by the resolved scale depth:
  pass separation and phase count scale together, while form-agnostic spec language removes the stale PRD-shaped
  description without renaming the workflow.

### `[x]` **4.R Phase 4 remedial — terminology, scope-back, entry-flow correction**

- _Goal:_ Correct accuracy/consistency defects in the just-landed 4.1/4.2 work before 4.3 grafts onto it — align
  to the canonical **planning depth** model, drop a premature term coinage, and fix the entry-flow inversion so
  the workflow reads as a clean base. Surfaced in review, not originally planned.
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

    - `[x]` **4.R.a Planning-depth terminology**
        - `task-generation depth` → `planning depth` (the canonical model — the **scale** axis is the input
          signal, not a new depth name) in the frontmatter `purpose` and the entry-step heading, both copies.

    - `[x]` **4.R.b Scope-back the unit reframe (hand to 4.4)**
        - Drop the unscoped `spec unit` coinage introduced in 4.2.c; restate the four anchor/coverage references
          form-agnostically ("part of the spec") without inventing a noun. The considered enumerable-unit
          vocabulary is 4.4's to define.

    - `[x]` **4.R.c Entry-flow correction**
        - Resolve planning depth (the entry-step read) _before_ the depth-selected pass-structure overview — the
          prior order described all three levels before resolving one. Heading-level/label unification across the
          three stage workflows is `5.R`'s, not here.

- _Outcome:_ generate-tasks uses canonical depth language, carries no premature unit coinage, and resolves depth
  before describing the depth-scaled structure — a clean base for 4.3/4.4.

### `[x]` **4.3 Grounding-audit depth parameterization (per-phase interlock retained)**

- _Goal:_ The grounding audit scales by _depth_ (a light files/symbols-exist pass at `low` vs the full
  eight-category `arc-task-audit` at `high`, keyed to the scale axis) while the per-phase interlock cadence is
  retained — collapsing to a single gate at `low` without forking, with the full variant always available
  mid-impl regardless of `Class`.

    - `[x]` **4.3.a Depth-parameterize the audit invocation**
        - Step 3.1 now selects the audit depth by the resolved level — `grounding-only` at `low`, `full` at
          `medium` / `high` — with the depth semantics owned by the skill (4.3.c), not restated in the workflow.
          The selection is a generation-time default, not a ceiling: the full audit stays available mid-impl
          regardless of level or `Class`.

    - `[x]` **4.3.b Retain the per-phase interlock cadence**
        - Confirmed invariant: the per-phase audit → confirm → revise gate is kept at every level; `low` collapses
          to a single gate by phase count, not by relaxing the interlock. Resolves the spec's § Open Questions lean
          on per-phase-interlock invariance — confirmed, not relaxed.

    - `[x]` **4.3.c Formalize `depth` in the `arc-task-audit` skill**
        - The skill gains an explicit `depth` input alongside `scope`: `full` (default — grounding + the
          eight-category analysis) and `grounding-only` (the grounding floor; skip the eight-category analysis).
          Default `full` leaves standalone / mid-impl invocation unchanged; the workflow selects the depth. Both
          canonical copies (`.arc/system/.internal/skills/` + package source).

    - `[x]` **4.3.d Carry-as-context durability (multi-session)** — adjacent audit-skill coherence fix surfaced
      during 4.3.
        - The skill now requires carry-as-context findings to be recorded durably — the implementer may be a
          later / downstream session: absorb into the task description, or document in `notes-{name}.md` with an
          **explicit task-level** cross-ref (create the notes file if significant and absent). Sole exception: a
          single-task audit the auditing agent implements directly. Both canonical copies.

- _Outcome:_ The grounding audit lightens to a grounding-only floor at `low` and runs the full eight-category
  audit at `medium` / `high` — the two depths formalized in the `arc-task-audit` skill and selected by the
  workflow — while the per-phase gate cadence holds invariant across levels and the full audit stays available
  mid-implementation. The skill also now mandates durable, impl-time-visible capture of carry-as-context findings.

### `[x]` **4.4 Validation substrate — audit against the form's enumerable units**

- _Goal:_ The grounding audit validates the task list against the form's enumerable substrate — generalizing
  beyond requirement-numbering to whatever units the form carries: numbered Requirements (PRD), structured
  Proposed Design elements (RFC), settled Decisions (`outline`), the one falsifiable signal (`brief`) — via
  identical `arc-task-audit` coverage.

    - Success Criteria stays the form-invariant anchor implementation is validated against (even the `brief`
      floor's one falsifiable signal); the enumerable substrate is what the _task list_ is validated against.
    - The audit mechanism is identical across forms; only the unit set it enumerates differs by form.
    - _Owns the unit vocabulary._ This task settles and defines how the per-form enumerable units are named —
      whether one umbrella term or per-form names — and applies it across the generate-tasks prose that `4.R.b`
      left as form-agnostic placeholders ("part of the spec"). No undefined unit-noun ships unresolved.

- _Outcome:_ Adopted the spec's existing vocabulary — "the spec's **enumerable units**" (the form's traceable
  elements: Requirements / Proposed Design elements / Decisions / the `brief`'s one signal), no new coinage —
  glossed at first use in generate-tasks and applied across the Pass 1 anchors, the Coverage lens, and the
  suite-coherence read (replacing `4.R.b`'s "part of the spec" placeholders). The task list validates against the
  enumerable substrate; Success Criteria stays the separate implementation-validation anchor. Mechanism
  unchanged — `arc-task-audit` coverage is identical across forms; no skill edit needed.

## **Phase 5:** Cross-stage dynamics — re-entry valve, ratchet, Novel overlay

_Purpose:_ Add the behaviors that span all three stages now that they exist: the axis-keyed re-entry valve at
each existing interlock, the decision-live / persistence-deferred ratchet with its DEV-RULES.ARC meta-timing
amendment, and the Novel advisory overlay decorating the `high`-draft + `detailed` lanes.

_Design decisions:_ Designed once, cross-stage, so the axis-keyed routing and the Novel overlay stay coherent
rather than diverging per stage. Every Novel item and every re-entry offer is accept-or-decline — no hard
`Class`↔form hook.

### `[x]` **5.1 Re-entry valve — fold the mid-stage trigger into `resolve-planning-depth`**

- _Goal:_ The re-entry valve (capture durably → ratchet → re-enter) is realized as the mid-stage firing of
  `resolve-planning-depth`'s axis measurement, axis-keyed: a **scale** signal re-resolves the _same_ stage higher
  (nowhere-up from `high`); a **derivation** signal routes to the stage that owns the design (a masked design
  decision routes to the _spec_, not a deeper task pass); draft-design re-enters-higher only.

    - `[x]` **5.1.a Extend the method contract with the mid-stage re-entry trigger**
        - Added `§ Mid-stage re-entry` to `resolve-planning-depth` holding the routing once — "route to the stage
          that owns the signal's axis, re-entered one level higher" (scale → same stage, nowhere-up from `high`;
          derivation → upstream owner; draft-design headwater re-enters itself), plus the re-entry-vs-in-place cut.
          Each stage's interlock fires it by reference; create-spec's two ad-hoc mentions consolidated, and
          generate-tasks' spec-propagation marked the in-place sibling.

    - `[x]` **5.1.b Down-switch floor + no-demotion guardrails**
        - Added `§ Depth band & guardrails` to `resolve-planning-depth`: depth is a re-selectable choice within a
          `Class`-derived band; down-switching is floored at the realized demand floor (one-way, deferring to
          `classify-work-unit`'s ratchet rather than restating it) and a heavier already-produced artifact is
          never torn down to match a lighter later pick.

- _Outcome:_ The depth band is now bounded in one place — upper edge by the valve (nowhere-up from `high`), lower
  edge by the demand floor + no-demotion — with the axis-keyed re-entry routing single-sourced in the method and
  referenced (not copied) by all three stage interlocks.

### `[x]` **5.2 Decision-live / persistence-deferred ratchet + DEV-RULES.ARC meta-timing amendment**

- _Goal:_ The `Class` ratchet is decision-live at the interlock (surfaced at once, driving that stage's depth
  immediately) but its `**Class:**` _write_ defers to each stage's planning-ceremony commit, and DEV-RULES.ARC's
  meta-timing rule reads as a principle (the meta is written only where a ceremony workflow explicitly instructs
  it) so the deferred writes don't read as meta-timing violations to a future author.
- **Strategies:** strategy-package-project-sync.md

    - `[x]` **5.2.a Decision-live / persistence-deferred at each touchpoint**
        - The entry-read touchpoints already deferred the `**Class:**` write to each stage's ceremony commit (in
          the stage workflows from earlier phases). Extended the same rule to the mid-stage re-entry ratchet in
          `resolve-planning-depth` § Mid-stage re-entry: the ratchet drives the (re-)entered stage's depth at once
          but its write defers to that stage's planning-ceremony commit, never a mid-stage meta edit.

    - `[x]` **5.2.b Reframe the DEV-RULES.ARC meta-timing rule to a principle**
        - The enumerated ceremony list (`activate / integrate / sweep / deactivate / spec generation /
          planning-lifecycle ops`) was a maintenance treadmill — duplicated across DEV-RULES.ARC and
          `strategy-session-operations` with mutually inconsistent, non-canonical names (`spec generation` vs
          `PRD generation`; drafts "captured" not designed). Replaced it with the principle: the meta is written
          only where a ceremony workflow explicitly instructs the write. Reframed both DEV-RULES.ARC sites + the
          strategy duplicate; dropped the parenthetical from the method (5.2.a). Mirrored to package source.

- _Outcome:_ Pivoted from "name the three planning-stage sites in the list" to a principle-based rule — the
  enumeration added nothing the principle didn't, and was already three divergent copies. Propagated the reframe
  back to the spec (R10, SC14) and struck the now-resolved Open Question on amendment wording.

### `[x]` **5.3 Novel advisory overlay across `draft-design` / `create-spec` / `spec-review`**

- _Goal:_ Novel is realized as an advisory overlay on the `high`-draft + `detailed` lanes only (Novel ⟹ both) —
  every item accept-or-decline, no hard `Class`↔form hook — decorating draft-design, create-spec, and
  spec-review; task-gen adds nothing.

    - `[x]` **5.3.a draft-design (`high`, primary)**
        - Added a `Class == Novel` advisory overlay opening the `high` lane: a free-form, self-sequencing
          orient-then-research sub-phase (orient first; research emerges from that), populating the rich draft's
          discovery / research / alternatives sections — no separate artifact, accept-or-decline.

    - `[x]` **5.3.b create-spec (`detailed`, secondary)**
        - Added a `Class == Novel` overlay at the `detailed` lane: a subtype-keyed ADR-companion recommendation
          (strong at `detailed`·RFC, weak/omitted at `detailed`·PRD), the companion ADR a non-moving
          `reference/adr/` artifact with no Novel branch at integration.

    - `[x]` **5.3.c spec-review posture**
        - Added a `Class == Novel` (`detailed`-only) overlay to the `spec-review` method: extra coherence/grounding
          care + an advisory "was the rationale captured / ADR-companion considered?" nudge at the finalization
          stop.

    - `[x]` **5.3.d task-gen — explicitly nothing**
        - Added an explicit "No Novel overlay" note at generate-tasks' entry (Novel is derivation-axis; task-gen
          is scale-driven) so no phantom lane is introduced.

- _Outcome:_ Realized as four **per-stage whole-block conditionals**, deliberately _not_ a shared method (unlike
  the re-entry valve) — the content genuinely differs per stage (research sub-phase / ADR-companion / review
  posture / nothing), so there is no shared shape to extract. All keyed on `Class == Novel`, advisory and
  accept-or-decline, with no hard `Class`↔form hook anywhere.

## **Phase 5.R:** Cross-stage coherence & polish — the three authoring workflows as one piece

_Purpose:_ With all three stage workflows (`draft-design`, `create-spec`, `generate-tasks`) and their shared
cross-stage content landed (Phases 2–5), audit and refine them as a coherent set: factor out duplication, unify
structure, strip model rationale that doesn't belong in a workflow, polish legacy prose, and reflow. A
remedial/revision phase — surfaced mid-implementation, not in the original plan.

_Design decisions:_ Done late and holistically so the three are tightened against their final shape, not
re-touched piecemeal — tightening `generate-tasks` alone now would only be redone here. Bounded by spec § Success
Criteria 15: **no** file rename/renumber (that cascade is `doc-cascade-sweep`'s) and no new design. Feeds a clean
set into the `6.2` conformance pass.

### `[x]` **5.R.1 Structural coherence + DRY the shared touchpoint**

- _Goal:_ The near-verbatim "one evidence read drives both methods" entry block (and the analogous interlock
  framing) repeats across all three workflows, differing only by axis. Shrink each to minimal inline plus the
  method body as the source of truth — keeping only the stage-specific bits (which axis, what the read inspects,
  what the level drives here) — and unify the entry-step heading/label/structure so the three read as one family.
- **Strategies:** strategy-workflow-authoring.md
- _Outcome:_ Settled a family structural convention (recorded in `notes-scalable-authoring-pipeline.md`): an
  identical spine anchor (`## Resolve depth & Class`) + `## Next Step` across all three, descriptive per-workflow
  body and terminal-ceremony headings, a Resolve→Setup→Iterate→Finalize loop envelope with the re-entry valve as
  its named back-edge, and `path` as the single depth-alternative term (`lane`/`variant` retired; `lane` reserved
  to `composable-workflows` via inbox). Applied across all three: entry blocks DRY'd to method-delegated
  minimal-inline; `generate-tasks`' `## Process` wrapper dropped (Passes promoted to `##`, `Step 4` → `## Finalize
  the task list`); `create-spec` de-numbered to named sections with all internal `Step N` cross-refs reflowed;
  `draft-design`'s `Feed the spec form forward` folded into `Next Step`. Renamed-heading citations cascaded to
  `STRATEGY-INDEX`, `strategy-task-list-formatting`, `template-tasks`, `drain-inbox`, and the `arc-plan-conductor`
  draft. Bounded by spec § SC15 — no file rename/renumber, no new design; markdown lint clean, both copies synced.

### `[x]` **5.R.2 Composable-workflows forward-compatibility**

- _Goal:_ The depth differentiation renders as whole-block, extractable depth lanes — each lane lifts to a
  `composable-workflows` fragment unchanged — not the fine-grained inline `**Depth variant:**` sprinkle 4.2
  currently uses (per spec § Success Criteria 5). Settled, not open: convert the sprinkle to whole blocks across
  all three workflows; single-file whole-block form, never a dir-per-workflow package.

- _Outcome:_ `generate-tasks` converted to **depth-spine (shape D)**: whole-block `### low` / `### medium` /
  `### high` paths under `## Generate in the resolved level` drive execution; the three Passes demote to a shared,
  depth-agnostic, stopless procedure library they invoke. `Pass` de-conflated to the review increment the paths
  own — inter-pass stops live in the paths, the grounding audit's per-phase gate stays intrinsic — hardened with
  paths-as-driver framing + per-procedure pass-boundary reminders. `draft-design` / `create-spec` already
  complied (untouched). Template + rendered `.arc` copy verified in sync; `arc-task-audit` Pass-3 reference
  updated (two-copy); structural finding routed to `composable-workflows`. See
  `notes-scalable-authoring-pipeline.md` § 5.R.2 resolution.

### `[x]` **5.R.3 Strip model/design rationale from the workflows**

- _Goal:_ A workflow carries only the operational grounding an agent needs to run it correctly — not rationale or
  education about the underlying model/design, which lives in the strategies, ADRs, and docs site. Remove the
  why-the-design-exists prose across all three; for each removed rationale, confirm a home exists in a durable
  reference surface and route any gap (coordinate with `6.4`).

- _Outcome:_ B-calibration trim across all three workflows — removed model-education, why-the-design-exists
  prose, alternative-defenses, and cross-principle framing; kept operational kernels (and one-clause whys that
  change how a rule is applied). `draft-design`: the bar height/distance abstraction + consolidation
  cross-principle framing; `create-spec`: open-question justification, two alignment-citation rationales, the
  ADR-subtype justification; `generate-tasks`: the one-shot-pattern rationale, why-on-disk, per-phase
  justification, durable-capture elaboration. No homeless rationale surfaced — each cut is covered by an existing
  surface (DEV-RULES § Design-before-impl / § leave-it-cleaner, the `resolve-planning-depth` method,
  ADR-methodology strategy, the SAP spec) or was pure meta; no extraction or 6.4 routing needed. Both copies of
  each file synced; lint clean.

### `[x]` **5.R.4 Legacy-prose polish**

- _Goal:_ Touch up pre-pipeline prose across the three workflows — content carried from earlier in ARC's
  development and unexamined since — for clarity and concision, behavior unchanged.
- _Outcome:_ `generate-tasks` intro rewritten to the family pattern (third authoring stage + peer links, names
  the **scale** axis), branch-context aligned to the full/partial split its siblings already carried, and the
  dangling "status file" interlock made a real `Update planning-state meta file` substep (sets `**Task List:**`,
  advances `**Next Action:**`, persists `**Class:**`) — fulfilling the Resolve section's deferred-write promise.
  `draft-design`: Gather/Facilitate bullets tightened, `roadmap or status view` → `ROADMAP.md`. `create-spec`:
  stray "numbered options" line dropped. Trimmed the redundant "never a mid-stage meta edit" tails across all
  three (covered by DEV-RULES.ARC § Meta-file timing) and deduped `create-spec`'s double statement. SC15 held
  (no rename/renumber, no new design); both copies synced, lint clean.

### `[x]` **5.R.5 Reflow to the wrap target**

- _Goal:_ Reflow all three workflows — plus the `arc-task-audit` skill (touched in Phase 4; its body still wraps
  narrow at ~75) — to the ~110-char deep-indent target (per DEV-RULES.PROJECT § Documentation Standards); they
  drift narrow in places (mid-phrase breaks at ~60 chars). Mechanical; no content change.
- _Outcome:_ Reflowed the three authoring workflows and `arc-task-audit` across package + `.arc` copies, including
  folded YAML `purpose` scalars where needed to keep frontmatter under the 120-char hard limit. Preserved
  package/project parity and the `2_generate-tasks` template-to-render relationship.

## **Phase 6:** Lifecycle tolerance, conformance & strategy codification

_Purpose:_ Make integrate / archive artifact-presence-tolerant, run the workflow-authoring conformance pass over
the new and reworked workflows, route the workflow rename/renumber cascade to its executing sibling, and codify
the scaled-pipeline conventions (form taxonomy, depth model, validation contract) across the strategy docs.

_Design decisions:_ Integration is **not** tier-forked — one invariant procedure whose cost scales with what was
produced; the surviving gate is the invariant spec-presence / spec-alignment gate. SAP names only `draft-design`;
the existing-file rename/renumber cascade routes to `doc-cascade-sweep`.

### `[x]` **6.1 Integrate / archive artifact-presence-tolerance + self-sizing completion record**

- _Goal:_ The integrate / archive workflows consume whatever the resolved depth produced — a `brief` spec, a
  one-phase task list, an absent separate completion doc — without requiring full-shape artifacts; the completion
  record is meta-appended and self-sizing; the invariant spec-presence / alignment gate survives and cost-scales.
  No `Class`-keyed tier fork anywhere in integration.
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

    - `[x]` **6.1.a Form-agnostic, presence-tolerant sweep (archive)**
        - `archive-work-unit.md` Step 3: swapped the stale `prd-{name}.md` sweep line to `spec-{name}.md`,
          retitled the step "(form-agnostic, presence-tolerant)", and reframed the trailing prose — only `meta-`
          and the resolved spec are guaranteed (spec by the spec-presence gate; a layered design moves as its
          `spec-{name}-prd.md` / `spec-{name}-rfc.md` pair), task list + notes move when present.

    - `[x]` **6.1.b Self-sizing completion record (integrate + `template-meta.md`)**
        - `integrate-work-unit.md` Steps 8–9 now self-size — Release Notes omittable when nothing is user-facing,
          Completion Notes always-present but scaled to what there is to say; Step 10's interlock surface + commit
          body drop the Release Notes bullet on omission. `template-meta.md` marks both archive-phase sections
          omittable / self-sizing in the schema comment and the fill skeleton.

    - `[x]` **6.1.c Preserve the invariant spec-presence / alignment gate**
        - `integrate-work-unit.md` Step 7 renamed "Spec-presence + alignment gate": added an explicit
          spec-presence assertion (Design resolves to a present `spec-{name}.md` or layered pair; a missing spec
          hard-stops) ahead of the existing PROJECT-PRD / TECHNICAL-OVERVIEW alignment checks, framed as one
          form-blind, cost-scaling gate with no tier fork or bypass-planning branch.

- _Outcome:_ Integration is now one presence-tolerant procedure end-to-end — sweep, composition, and gate each
  cost-scale with what the resolved depth produced, with no `Class`-keyed fork anywhere. Touched
  `archive-work-unit.md`, `integrate-work-unit.md`, and `template-meta.md` across both package + `.arc` copies;
  lint clean, copies synced.

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

    - `[ ]` **6.4.e Reconcile branch-from-inception vs. partial-mode spec-then-branch sequencing**
        - `strategy-work-organization` § Branch Protection Modes (Partially Protected) states planned work units
          "require a branch from inception," but the authoring workflows' branch-context (draft-design /
          create-spec / generate-tasks) document a partial-mode path where a spec/draft is authored on the base
          branch with no planning branch or meta yet (spec-then-branch). Reconcile the wording so the two read
          coherently — e.g. clarify that "from inception" governs the tracked WU (post-init/activation) while
          pre-formalization spec exploration on the base branch is sanctioned under partial. Surfaced at 5.R.4.

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
- `[ ]` DEV-RULES.ARC's meta-timing rule is principle-based (the meta is written only where a ceremony workflow
  explicitly instructs it), so the decision-live/persistence-deferred writes do not read as meta-timing violations.
- `[ ]` SAP names only the new `draft-design` workflow; it does not rewrite the existing `create-spec` /
  `generate-tasks` / `process-task-loop` files or their cross-references.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
