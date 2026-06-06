# Task List: Class Model Foundation

- **Design:** `spec-class-model-foundation.md`

---

## **Phase 1:** Constitutional foundation

_Purpose:_ Establish the normative contract the rest of the cohort consumes. Amend DEV-RULES.ARC with the
minimum-viable `Class` non-negotiable — the discipline-invariance guard plus a pointer to the on-demand triage
and model homes — the front-loading-duty sharpening, and the relocatability + source-side reference rules;
reconcile atomic as a work character (retiring the redundant infra smell-flag); add the `Class` vocabulary entry
to AGENT-BRIEF.ARC; and author the companion ADR. This phase leads because it sets the contract.

_Design decisions:_ Document-tier discipline drives the split. Always-loaded DEV-RULES.ARC carries only
operational non-negotiables not already owned by an explicitly-triggered method/workflow; the boundary-test
triage lives in the `classify-work-unit` method (Phase 3), the model elaboration + worked examples in
`strategy-work-organization` (Phase 4), and the architectural reasoning (two floors, spec-worthiness, topology,
the planning-depth ordinal, the three spec forms) in the companion ADR — internal-only, single-copy.
AGENT-BRIEF.ARC introduces the `Class` vocabulary. DEV-RULES.ARC and AGENT-BRIEF.ARC ship (two-copy: package
source + `.arc/` mirror); edit the package source, then sync the mirror.

_Requirements:_ R1, R3–R8, R13–R14.

### `[x]` **1.1 Amend DEV-RULES.ARC with the minimum-viable `Class` rule and reconcile atomic as a character**

- _Goal:_ DEV-RULES.ARC carries the always-loaded `Class` non-negotiable — the discipline-invariance guard
  (`Class` scales design-authoring ceremony, never execution discipline; the review-increment gate and quality
  gates apply identically at every `Class`) — plus a pointer to the `classify-work-unit` method (the triage) and
  `strategy-work-organization` (the model + worked examples). The axis definitions, boundary tests, and reasoning
  live in those on-demand homes, not in always-loaded DEV-RULES.

    - `[x]` **1.1.a State the discipline-invariance guard and the pointer**
        - New `## Scaled Process, Invariant Discipline` section (Contents entry + body, after § Review-Increment
          Invariant): frames the full Errand→heavy-WU range — process (planning depth + review/integration
          ceremony) scales with weight; execution discipline (the review-increment invariant, the interlocks
          gating review/merge, quality gates) does not. `Class` named as the WU-level weight record; pointer to
          the `classify-work-unit` method (plain backtick — see Outcome re: deferred link) and Work Organization
          Strategy (`[work-org]`, live link). Held to the minimum-viable operational guard: no axis defs, no
          boundary tests, no design rationale.

    - `[x]` **1.1.b Reconcile atomic as a work character, not a tier**
        - Reconciliation in DEV-RULES is the smell-flag removal plus naming `Class` a WU property: deleted
          § Atomic-tier infra-edit smell flag from § Task Execution (its review-the-infra intent relocates to the
          Auto-Merge Lane threshold, Phase 4), leaving no work-tier language in the file (remaining `tier` refs
          are quality-gate Tier 1/2/3; remaining `atomic` refs are character/inbox routing). No structural dangle.
        - The positive atomic-as-character definition is **not** restated here — AGENT-BRIEF.ARC § Vocabulary
          already owns it (de-staled in Task 1.4); the ADR-020 ↔ ADR-021 reasoning rides the companion ADR (1.5).

- _Outcome:_ Scope held to the minimum-viable amendment — the scaling guard + pointer. Both copies (package
  source + `.arc/` mirror) byte-identical; lint clean. The pre-commit link-resolution hook rejects links to
  not-yet-existing targets, so the `classify-work-unit` pointer is a plain backtick reference for now —
  **linkify when the method file lands (Phase 3).** Conceptual citations of the removed smell flag survive in
  `arc-inbox` SKILL.md (both copies) and `draft-naming-conventions.md` — they name a now-absent rule and want a
  downstream cascade pass (candidate: `doc-cascade-sweep`); surfaced, not fixed here (distinct docs / own review
  surfaces).

### `[x]` **1.2 Sharpen the front-loading-duty rule across all spec forms**

- _Goal:_ DEV-RULES.ARC § Design-before-implementation states explicitly that all settle-able design is settled
  upfront across every spec form (best reasonable effort, never a conscious deferral), with genuinely-emergent
  design routed back to the spec — introducing no new deferral mechanism.
- _Outcome:_ Sharpened § Design before implementation in both copies: added the explicit "settle all settle-able
  design up front — never a conscious deferral; route emergent design back to the spec, don't accumulate design
  debt" rule plus the no-new-deferral guard. Expressed the derivation-axis point via `Class` (a lighter `Class`
  means the design was more determinate coming in, not license to defer) rather than spec-form names — keeps it
  coherent with § Scaled Process and avoids importing downstream form vocabulary into always-loaded rules.

### `[x]` **1.3 State the relocatability invariant and generalize the source-side reference rule**

- _Goal:_ DEV-RULES.ARC states the relocatability invariant and the generalized source-side reference rule, so
  lifecycle moves stay pure `git mv` and movable artifacts never carry refs that break when the source relocates.

    - `[x]` **1.3.a State the relocatability invariant**
        - Added § Artifact relocatability to § Documentation Boundaries (both copies): WU artifacts
          (`meta`/`draft`/`spec`/`tasks`/companions) relocate `active`↔`backlog`↔`completed` by State via a pure
          `git mv` with no content edit — which holds only if artifacts carry position-independent refs.

    - `[x]` **1.3.b Generalize the `.arc/` artifact-reference rule (source-side)**
        - Reworked § `.arc/` artifact references into two directional rules: _to_ a movable artifact
          (filename-only, from anywhere) and _from_ a movable artifact (no relative-path links at all, even to
          stable docs — the source's own path moves on relocation). Relative paths legal only in non-moving docs.

- _Outcome:_ Set kept WU-scoped — `cohort-*` deliberately excluded (different, non-single-WU-`State` relocation
  model; this WU owns the `Cohort` field schema only). Forward integration captured to USER-INBOX § Backlog
  (WU_Target: `decomposition-machinery`). Rules only per spec; enforcement (forbidden-pattern hook + path-style
  link-def sweep) routes to `quality-gate-hooks`. Both copies byte-identical; lint clean.

### `[x]` **1.4 Add the `Class` vocabulary entry to AGENT-BRIEF.ARC**

- _Goal:_ AGENT-BRIEF.ARC introduces `Class` as orientation vocabulary — what it is, the two intrinsic axes
  (either alone raises the floor), that it indicates weight across planning, execution, and review while
  execution discipline stays invariant — so an agent knows the concept exists and what it means without loading
  the method or strategy.

    - `[x]` **1.4.a Add the `Class` entry to the Vocabulary section**
        - Added the `Class` entry (both copies), placed between `Work unit` and `Atomic`: `Light`/`Heavy`/`[TBD]`,
          `Heavy` when _either_ axis runs high (derivation / scale-complexity), indicates weight across planning,
          execution, and review (intrinsic demand, not output volume), ceremony scales / discipline does not,
          distinct from the quality-gate `Tier 1/2/3`. Matched the existing entries' density.

    - `[x]` **1.4.b De-stale the `Work unit` and `Atomic` entries**
        - `Work unit`: dropped `Tier-invariant (atomic / quick / standard)` (the weight role is now `Class`'s).
          `Atomic`: reframed as a work character — a single logical concern that fits one review increment
          (typically one commit, even if multi-file), executed inline in a same-domain WU or as an Errand —
          dropping the `atomic-tier` reference.

- _Outcome:_ Seam reconciliation across the two always-loaded surfaces. With AGENT-BRIEF now owning the `Class`
  definition, trimmed DEV-RULES § Scaled Process (Task 1.1's deliverable) to pure-behavioral: dropped its
  value-enumeration / floor-definition sentence, keeping the scaling rule + the Errand→heavy-WU range + the
  method/strategy pointer. AGENT-BRIEF = "what `Class` is"; DEV-RULES = "what to do" — no cross-file duplication.
  All copies byte-identical; lint clean.

### `[x]` **1.5 Author companion ADR-023**

- _Goal:_ An internal-only companion ADR (`adr-023-class-model-scaled-ceremony.md`) records the architectural
  shift — scaled ceremony / invariant discipline, the `Class` model, the boundary tests — parallel in scope to
  adr-016, carrying the narrative and risks the enforceable rule omits.

    - `[x]` **1.5.a Draft adr-023 (context / decision / consequences)**
        - Authored `adr-023-class-model-scaled-ceremony.md` (Status: Proposed, mirroring adr-021's
          decided-here / ratifies-downstream pattern). Rebuilds the reasoning: the two-floors model,
          spec-worthiness, the fixed-floor → scalable-middle → fixed-ceiling topology, the two-axis `Class` +
          three boundary tests, the per-stage planning-depth ordinal + three spec forms, estimate-then-ratchet,
          and atomic reconciliation. Cites ADR-001/016/019/020/021/022.

    - `[x]` **1.5.b Record the risks and mitigations**
        - Consequences § Risks covers `Class` drift via under-specification (ratchet removes the lowball
          incentive; self-diagnosing depth-shift signal; explicit-field reviewer scrutiny; strategy examples),
          light-WU discoverability (STATUS.USER render + auto-cleanup), and premature ratification.

    - `[x]` **1.5.c Wire ADR cross-references**
        - Confirmed `cohort-agile-wu-lifecycle.md`'s ADR-anchors list resolves (all 6 files exist). README
          index: none to update — the adr `README` is index-free by design ("no separate index is maintained"),
          so the task's "add to index" is moot (drift surfaced). adr-023 kept off adopter-facing surfaces
          (internal-only, single-copy, not mirrored).

- _Outcome:_ Phase 1 (Constitutional foundation) complete. adr-023 is the sole home for the architectural
  reasoning; the always-loaded surfaces carry only rule + vocabulary. Two judgment calls left for review: Status
  set to Proposed (not Accepted); and adr-023 deliberately not added to the cohort's ADR-anchors list (it is this
  WU's _output_, not an input precedent — addable as a now-foundational sibling reference if preferred).

## **Phase 2:** Meta-record modernization — convention, `Class`, `Design`, `Cohort`

_Purpose:_ Modernize the ADR-022 structured-record meta into a record that serves both machine parsing and
durable human reading: establish the value-formatting + information-architecture convention (backtick / casing
rules, the hoisted core-block table, field order) in `renderMetaFile` / `parseMetaRecord`; add the `Class` field
(with the estimate-vs-realized ratchet), `Class`-aware `Design` value semantics, and a path-valued `Cohort`; and
reflect all of it in `template-meta.md`. Foundation the mechanism, validation, render, and migration phases build
on.

_Design decisions:_ The presentation convention (2.1) lands first — render / parse change underneath every field
task. Value formatting is three-way: Capitalized backticked enum tokens (`State`, `Class`), backticked identifier
values (slugs / filenames), bracket sentinels, prose for narrative fields. The **core block** renders as a
single-row table (`State | Owner | Branch | Class | Priority`); the rest as ordered bullet groups. Every read
routes through one `parseMetaRecord`; the duplicated `extractField` (e.g. `git/worktree-roster.ts`, which never
strips inline code) is retired so backticked values can't break a consumer. `Class` is a new `META_FIELDS` entry
in the core block, default `[TBD]`; the form ↔ `Class` relationship is documented guidance in
`strategy-work-organization` (4.2.c), not a schema-enforced constraint.

_Requirements:_ R9–R12, R24.

### `[x]` **2.1 Establish the meta value-format + IA convention in `renderMetaFile` / `parseMetaRecord`**

- _Goal:_ The meta record renders to a uniform, human-legible convention and round-trips through a single parser
  — the three-way value formatting, the hoisted core-block table, the field order, and one consolidated reader —
  so every later field task rides a stable render / parse foundation and no consumer breaks on backticked values.

    - `[x]` **2.1.a Render the three-way value format + core-block table**
        - _Outcome:_ `MetaFieldDescriptor` gains declared `render` (`core-table` / `bullet`) + `valueClass`
          (`enum` / `identifier` / `narrative`) axes; `renderMetaFile` emits the pre-aligned core-block table
          (`State | Owner | Branch | Class | Priority`, the `Class` slot rendering its `[TBD]` default) plus the
          ordered bullet groups, under the value-format convention (enum → Capitalized + backticked, identifier →
          backticked, bracket sentinel → bare, narrative → prose). `META_FIELDS` reordered into the new IA
          (core / cohort / reference / progress / directive).

    - `[x]` **2.1.b Parse table + bullets in one guarded `parseMetaRecord`**
        - _Outcome:_ `parseMetaRecord` recovers core fields from the table (header-label-keyed, column-order
          tolerant; legacy flat-bullet fallback when no table) and the rest from bullets — backticks stripped,
          bracket sentinels preserved verbatim, marker-absent → `null`; a present-but-malformed core table
          (column-count mismatch / orphan separator) throws **loud**. `parseMetaFile` now delegates here (gaining
          table-tolerance for the session-init read); `parseCandidate` downgrades the throw to a per-file warning.

    - `[x]` **2.1.c Consolidate every meta read through the shared reader**
        - _Outcome:_ Retired `worktree-roster`'s drifted no-strip `extractField`; the roster, in-flight derivation,
          and `validate-meta-spec`'s State check now route through the shared `parseMetaRecord`, so backticked +
          table-rendered values read in bare form without regression. Each guards the new malformed-table throw per
          its context — roster degrades to a bare entry + warning, the in-flight oracle to absent fields, the
          validator to a loud diagnostic.

- _Outcome:_ The render/parse foundation is in place: one descriptor set (`META_FIELDS` with declared `render` +
  `valueClass` axes) drives both directions, and every meta consumer routes through the single `parseMetaRecord`
  reader — the proto-record surface `cli-substrate-adoption` (zod) / `schema-introspection-layer` (publish) /
  `operational-state-docs` (generic engine) inherit per ADR-022. Sentinels stay a typed closed vocabulary
  (`[none]` / `[internal]` / `[TBD]`); form↔`Class` validity stays advisory (§ Non-Goals), not a schema
  refinement. Verified across the full suite — the global render-shape change broke no consumer.

### `[x]` **2.2 Add the `Class` field (`Light` / `Heavy` / `[TBD]`) to the meta schema with ratchet semantics**

- _Goal:_ The meta schema carries `**Class:**` as a core-block field (`Light` / `Heavy` / `[TBD]`, default
  `[TBD]`) that round-trips through render and parse, making the work's weight a first-class structured field.
- _Outcome:_ The `Class` core-block slot was already added generically in 2.1.a (`META_FIELDS` enum entry, default
  `[TBD]`, casing-normalized on render), so this task locked the value-set semantics with tests rather than new
  production code: a `Class field — value-set semantics` block in `meta-reader.test.ts` covers the `Light` /
  `Heavy` round-trip, lower-case → Capitalized normalization, the `[TBD]` sentinel + default, and absent-`Class` →
  `null` (table-omitted column and legacy flat-bullet). Ratchet and form↔`Class` validity stay advisory per spec
  § Non-Goals, not a schema hook.

### `[x]` **2.3 Define `Class`-aware `Design` field value semantics**

- _Goal:_ The `**Design:**` field's value semantics are documented as `Class`-aware and `Origin`-orthogonal:
  `draft-{name}.md` during Planning, `spec-{name}.md` from Active onward (all forms — filename stable, the form
  lives in the H1 / template); `Design` always points at an ARC-owned planning artifact, external trackers go in
  `Origin`.
- _Outcome:_ Added a `Design` field value semantics subsection to `strategy-work-organization` § WU Artifact
  Headers (both copies): value-by-State (`draft-{name}.md` in Planning → `spec-{name}.md` from Active, transitioning
  once at activation), the form-stable `spec-{name}.md` filename (a spec's weight lives in its H1 / template, not
  the filename), and `Origin`-orthogonality (`Design` names an ARC-owned artifact only; external trackers → `Origin`).
  Documentation only — `validate-meta-spec.ts` shape validation is unchanged.

### `[x]` **2.4 Make the `Cohort` field path-valued (two-segment cap)**

- _Goal:_ `**Cohort:**` carries a path value — a single segment, `<cohort>/<subcohort>`, or `[none]`, capped at
  two segments — mirroring the on-disk dir-path, with the field remaining the membership source of truth (the
  sibling list is derived, never stored).

    - `[x]` **2.4.a Parse and validate the path-valued `Cohort`**
        - _Outcome:_ New `cohort-path.ts` module — `validateCohortPath` (single / two-segment / `[none]` pass;
          empty-segment and over-`COHORT_SEGMENT_CAP` paths flagged) and `cohortLeaf` (leaf-segment derivation for
          render). `validate-meta-spec.ts` gains `validateCohort`, wiring the cap into the pre-commit gate as an
          optional field (absent passes; present validated). Confirmed no existing active/backlog meta exceeds the
          cap, so the gate is safe against current data.

    - `[x]` **2.4.b Confirm the `Cohort` consumers tolerate path values**
        - _Outcome:_ `render.ts` `cellOf` now displays `cohortLeaf(row.cohort)` for the Cohort column — the leaf
          segment for a nested cohort — while the stored value and the `(priority, cohort, wu-name)` sort key keep
          the full path for membership (a test orders two WUs whose leaves and paths disagree to prove the split).
          Consumer passthrough confirmed without regression: in-flight derivation already carried `core/sub`, and a
          path-valued roster case was added; in-flight-mine spreads the value verbatim, so it cannot truncate.

### `[x]` **2.5 Update `template-meta.md` to the new format: core-block table, `Class`, retire the `Tier` comment**

- _Goal:_ `template-meta.md` reflects the modernized schema — the core-block table with `**Class:** [TBD]`, the
  new field order and bullet groups, the backtick / casing / sentinel convention, the stale `Tier:` reservation
  comment removed, and refreshed `Design` (Class-aware) and `Cohort` (path-valued, dual-placement) guidance — so
  `init-work-unit` scaffolds a schema- and convention-correct meta.
- **Strategies:** `strategy-package-project-sync.md`.
- _Outcome:_ Rewrote `template-meta.md` (both copies, synced byte-identical) to the new IA — the
  `State | Owner | Branch | Class | Priority` core-block table over the ordered bullet groups (cohort / reference /
  progress / directive), matching `renderMetaFile`. Field-semantics comment regrouped to Core / Cohort / Reference /
  Progress / Directive: new `Class` entry (`Light` / `Heavy` / `[TBD]`, estimate-then-ratchet, best-estimate when
  startable); the three-way value-format convention; `Design` refreshed Class-aware + Origin-orthogonal;
  `Cohort` refreshed path-valued (two-segment cap, dual-placement); stale `Tier:` reservation comment deleted.
  Incidental same-file cleanups: `WU` → `work unit` throughout (adopter-facing terminology), and the `Depends On`
  comment's "ROADMAP tier grouping" → neutral "project readiness view's dependency grouping" (tier vocab being
  retired by this WU). The "Retired from prior `template-status.md`" block's transitional framing was left in place
  and captured to `USER-INBOX § Backlog` as a broad doc-conventions sweep (a distinct concern, not this commit's).

### `[x]` **2.6 Bold the core-block table headers to match the bullet-field labels**

- _Goal:_ `renderMetaFile` emits the core-block table's column headers bold (`**State**` / `**Owner**` / … ) so
  the table's keys read as labels in raw markdown, matching the `**Field:**` bullet labels; `parseMetaRecord`
  strips the bold when keying by header, tolerating both bold (new render) and plain (legacy / hand-edit) headers.
  `template-meta.md` reflects the bold headers.
- _Outcome:_ `renderCoreTable` now bolds each core header (`**State**` … ), pre-aligned to the wider cells;
  `parseCoreTable` strips the bold via a `stripHeaderLabel` helper when keying, so it reads both the new
  bold-headered render and legacy / hand-edited plain-headered tables. `template-meta.md` (both copies) shows the
  bold headers. Render-side only — values, parse tolerance, and the flat-bullet fallback are unchanged. Updated the
  header-order render assertion and added a bold-headered parse test; the plain-header parse fixtures stay green,
  confirming the tolerance.

## **Phase 3:** Classification mechanism — method, graduation, touchpoints

_Purpose:_ Make the `Class` signal present and forced — the DRY `classify-work-unit` triage method, the
`graduate-work-unit` (`provisional → planned`) forcing workflow, and the `init` / `activate` touchpoint wiring.

_Design decisions:_ the method uses the existing loadable-method mechanism (no `composable-workflows` dependency),
authored as a self-contained extractable block for later fragmentation. `graduate-work-unit` mirrors
`init-work-unit`'s `git mv` + ROADMAP/STATUS.USER-regen shape (a flat backlog-internal move) and reserves
"graduation" for the readiness ladder. The three planning-stage touchpoints route downstream to
`scalable-authoring-pipeline` — see `spec-class-model-foundation.md` § Non-Goals.

_Requirements:_ R17, R18, R20, R21.

### `[x]` **3.1 Author the `classify-work-unit` method (boundary-test triage + ratchet)**

- _Goal:_ A loadable `classify-work-unit` method states the boundary-test triage and the estimate-vs-realized
  ratchet once, as the single DRY home every touchpoint declares — so classification logic is not re-stated per
  surface.
- **Strategies:** `strategy-configurability-architecture.md`.

    - `[x]` **3.1.a Author `system/methods/classify-work-unit.md`**
        - Two-copy method (contract block + `.default`): the three boundary tests (Errand-vs-WU wrapper floor,
          derivation trigger, scale/complexity trigger), `[TBD]` / best-estimate resolution, and the
          estimate-vs-realized ratchet — authored as a self-contained extractable block.

    - `[x]` **3.1.b Register the method**
        - Added to the methods `README` index (both copies). The `audit-method-triggers` check (CI-only, not the
          local pre-commit) requires a declaring workflow, so the file's introducing commit bundles with
          `graduate-work-unit` (3.2), its first declarer — committing it alone fails the audit and framework-sync.

- _Outcome:_ The `Class` triage now has a single DRY home; touchpoints (3.2 / 3.3 and the downstream planning
  stages) declare the method rather than restating the tests. The contract block links `init` / `activate` only
  — `graduate-work-unit` is named in prose so the file's links resolve ahead of 3.2.

### `[x]` **3.2 Add the `graduate-work-unit` workflow (`provisional → planned`)**

- _Goal:_ A `graduate-work-unit` lifecycle workflow promotes a WU up the readiness ladder — `git mv`
  `provisional/ → planned/`, run `classify-work-unit` to force the estimate, regen ROADMAP + STATUS.USER —
  giving the forcing function an execution home.
- **Strategies:** `strategy-work-organization.md`, `strategy-workflow-authoring.md`.

    - `[x]` **3.2.a Author the workflow**
        - Authored `graduate-work-unit.md` (two-copy): pre-condition gate → `git mv` provisional → planned
          (cohort-wrapper aware) → `classify-work-unit` confirm-or-ratchet → ROADMAP / STATUS.USER regen, with
          two `workflowCommit` fire-sites. Frontmatter declares the `classify-work-unit` method — which closes the
          trigger audit for 3.1's method.

    - `[x]` **3.2.b State the readiness rule, place the ladder, and reserve the terminology**
        - Readiness rule (`backlog/planned/` carries a resolved `Class`; `[TBD]` legal only in `provisional/`)
          stated in the workflow as a lifecycle constraint that names + loads `classify-work-unit` for the triage.
        - Added a § Readiness ladder subsection to `strategy-work-organization` § Work Unit State stating
          `provisional → planned → active`, and a pointer from `init-work-unit` Step 3 (graduate-work-unit precedes
          it). "Graduation" reserved positively (the readiness-ladder climb); the WU→cohort rename coordination is
          kept out of the adopter-facing docs (it lives in internal buffers per the planning routing).

- _Outcome:_ The `Class` forcing function now has an execution home — `graduate-work-unit` resolves `Class` at
  the planned-entry rung — and its method declaration closes the `classify-work-unit` trigger-audit gap, so 3.1
  and 3.2 commit cleanly together. Also documented the `(graduation)` `Context:` qualifier in `commit-footer`
  (both copies) so the ceremony's commit examples are canonical.

### `[x]` **3.3 Wire `classify-work-unit` into `init-work-unit` and `activate-work-unit`**

- _Goal:_ `init-work-unit` and `activate-work-unit` each invoke `classify-work-unit` as a lightweight
  confirm-or-ratchet step, so `Class` is re-tuned at the two lifecycle surfaces this WU owns.

    - `[x]` **3.3.a Wire into `init-work-unit`**
        - Declared `classify-work-unit` in frontmatter; added a `**Class:**` confirm-or-ratchet to Step 4 — Path A
          (backlog graduate: confirm/ratchet a `planned/` value, resolve a `provisional/` `[TBD]`) and Path B (fresh
          WU: resolve the template `[TBD]` default to a best estimate). Two-copy.

    - `[x]` **3.3.b Wire into `activate-work-unit`**
        - Declared the method; added a `**Class:**` settle to the Step 4 state-flip meta edits (the last
          pre-implementation confirm-or-ratchet) plus a `Settle Class` line in the activation commit example.
          Two-copy.

- _Outcome:_ `classify-work-unit` is now wired at every lifecycle touchpoint this WU owns — planned-entry
  (graduation), init, and activate — so `Class` is forced once and re-tuned cheaply across the planning → active
  surfaces; the method carries three declarers. The planning-stage touchpoints remain downstream scope.

## **Phase 4:** Render and strategy guidance

_Purpose:_ The render and doc-elaboration surfaces — the `Class` render over an expanded in-flight-+-ready
STATUS.USER, and the model's strategy-doc home with worked boundary-test examples, the `planning depth` ordinal,
and the three spec forms (which need a shippable home). The P1 cluster; each item depends on Phase 1 (definitions)
and/or Phase 2 (the `Class` field).

_Design decisions:_ STATUS.USER's content model expands from in-flight-only to in-flight + ready: the in-flight
slice stays the git-derived oracle, the ready slice is a new read over `backlog/planned/` metas (owned,
unblocked), and the two merge in the user view. Auto-render stays gated on `roadmap-tooling`; this updates the live
instance and documents the shape in the STATUS.USER render standard — no template file exists, and the writer +
template are `roadmap-tooling`'s. `strategy-work-organization` is the model's home: it gains the `Class` model +
worked examples, the `planning depth` ordinal, and the three spec forms, and reconciles its own stale tier
sections (the broad cross-surface vocabulary sweep stays `doc-cascade-sweep`'s). A `Class` ↔ spec-form validation
hook is deliberately out of scope — see `spec-class-model-foundation.md` § Non-Goals. ROADMAP render-inclusion
stays out (R22).

_Requirements:_ R3, R4, R22, R23.

### `[x]` **4.1 Expand STATUS.USER to in-flight + ready, sized by `Class`**

- _Goal:_ `STATUS.USER` renders both in-flight and ready (owned by the identity, unblocked, `planned/`) WUs, each
  sized by `Class`, so the view supports the balance decision — what's on my plate, and what fits alongside it.

    - `[x]` **4.1.a Add the `Class` column to the existing in-flight render**
        - Threaded `Class` through the render path: a `WorkClass` type + case-insensitive `validateClass`
          (`active/types.ts`), the raw field on `InFlightWorkUnit` read in `buildWorkUnit`
          (`in-flight-derivation.ts`), normalization to display form in the slice map (`in-flight-mine.ts`), and
          the `class` column / `StatusViewRow` / `STATUS_USER_COLUMNS` / `COLUMN_HEADERS` / `cellOf`
          (`render.ts`). `Class` renders always-on between `State` and `Priority`: `[TBD]` is a value, a
          field-absent WU shows an em-dash. The live `STATUS.USER.md` + render-standard doc are deferred to
          4.1.c per the subtask split; the golden render-test fixture carries the new shape.

    - `[x]` **4.1.b Add the ready slice (owned, unblocked, `planned/`)**
        - Built the ready slice as a local second source: `buildReadyMineSlice` (pure — owned/unattributed +
          unblocked-by-absence filters, sized by `Class`) over a `ready-mine-source` FS reader that scans
          `backlog/planned/**` and resolves dependency satisfaction against the active + planned + provisional
          pipeline (the readiness model's present-set). `classComposition` tallies `Heavy`/`Light`, excluding
          `[TBD]`/absent. The user view merges the local ready slice (always available) with the git-derived
          in-flight slice into `## In Flight` + `## Ready` sections (`STATUS_USER_READY_COLUMNS` omits the
          constant State / Depends-on), wired through the `arc status --user` handler. The unreachable path still
          degrades the in-flight half to cache — the structured merge of the fresh ready slice into the cached
          document is left to the deferred file-writer.

    - `[x]` **4.1.c Refresh the live instance and document the shape (one-off)**
        - Regenerated the gitignored `.arc/user/andrew/STATUS.USER.md` to the in-flight + ready shape (via
          `arc status --user`) with the `Class` column. Documented the shape in the render standard
          (`strategy-work-organization` § Render standard + § STATUS.USER view, package + `.arc/` copies): the
          two `STATUS.USER` column sets (In Flight + Ready), `Class` always-on (`[TBD]` is a value), and the ready
          slice as a purely-local always-available input. No auto-render wiring — that stays `roadmap-tooling`'s.

- _Outcome:_ STATUS.USER renders in-flight + ready end to end, each row sized by `Class`. The `Class` column
  threads the in-flight render path; the ready slice is a local, always-available second source (owned +
  unblocked-by-absence over `backlog/planned/**`), merged into `## In Flight` + `## Ready` sections and wired
  through `arc status --user`. The render standard documents the two-table shape; the live instance is refreshed.
  The offline cached-in-flight + fresh-ready merge is deferred to `roadmap-tooling`'s writer (routed to its
  inbound buffer).

### `[x]` **4.2 Add the `Class` model, spec forms, and boundary-test guidance to `strategy-work-organization`**

- _Goal:_ `strategy-work-organization` becomes the shippable home for the `Class` model — the boundary tests with
  worked examples, the `planning depth` ordinal, the three spec forms, the ratchet, and the readiness rule — with
  its stale tier vocabulary reconciled so the strategy describes one classification system, not two.

    - `[x]` **4.2.a Reconcile the stale tier vocabulary**
        - Replaced the retired `atomic` / `quick` / `standard` tier model with `Class` / Errand / spec-form terms
          across the five sites: § Work Character (atomic at the WU scale runs below the wrapper as an Errand, not
          a thin tier), § Spec-Flow Invariants (invariants 2–3 + the `Tier` scaling axis → `Class`; deferred
          contract reframed to per-_stage_ depth realization), § Escape-hatch guardrails (one-way-tier → the
          estimate-then-ratchet floor + the wrapper-floor boundary test + `Class`-invariant discipline), and
          § Archival accommodations (`Class`-uniform). The legitimate ROADMAP render tiers (In Flight / Ready /
          Blocked) are untouched, and the broad cross-workflow / template sweep stays `doc-cascade-sweep`'s. Both
          copies in sync.

    - `[x]` **4.2.b Add the `Class` model + boundary tests with worked examples**
        - Added the `## Class Model` section (both copies, + Contents): the two decorrelating axes (derivation /
          scale), the three boundary tests, a 2×2 of worked examples (one per derivation×scale cell —
          records-vs-derives, routine-vs-substantial grounding), the estimate-then-ratchet, and the readiness
          rule (resolved `Class` at `planned/` entry). Cross-links the `classify-work-unit` method (triage) and
          `graduate-work-unit` (forcing point). Source URLs from the deep-research transcript were not embedded
          (transcript not in-repo); the idiom is attributed to design-doc practice generically — flagged for
          backfill.

    - `[x]` **4.2.c Define the `planning depth` ordinal and the three spec forms**
        - Added the `### Planning depth and spec forms` subsection (both copies): the `low` / `medium` / `high`
          per-stage transient ordinal, the three spec forms with a depth → form mapping table, and the form ↔
          `Class` relationships — `brief` ⇒ `light`, `detailed` ⇒ `heavy` (with the PRD/RFC category split), the
          `outline` straddle (light at moderate scale, heavy via scale), and the empty `heavy`/`brief` cell.
          Documented as guidance, not a hook-enforced constraint. (Stated `detailed` ⇒ `heavy` precisely rather
          than a flat `heavy` ⇒ `detailed`, since heavy-by-scale takes `outline`.)

- _Outcome:_ `strategy-work-organization` is now the shippable canonical home for the `Class` model: a `## Class
  Model` section (two axes, three boundary tests, a 2×2 of worked examples, the ratchet, the readiness rule) plus
  the `planning depth` ordinal and the three spec forms, with the stale `atomic` / `quick` / `standard` tier
  vocabulary reconciled so the strategy describes one classification system. The deep-research source URLs were
  not embedded (transcript not in-repo); the idiom is attributed to design-doc practice generically and flagged
  for backfill.

## **Phase 5:** Meta migration — format, `Cohort`, and `Class`

_Purpose:_ One-time pass bringing every `backlog/` meta (planned + provisional) into the modernized schema —
re-rendered to the new format / IA (core-block table, field order, backtick / casing convention; R24), with
`**Cohort:**` normalized into the path schema (path-matching its on-disk dir, or `[none]`); `planned/` members
additionally get a best-estimate `**Class:**`, while `provisional/` members carry the `[TBD]` default.

_Design decisions:_ format normalization rides the new `renderMetaFile` via a one-off (non-shipped) migration
script — for each meta, tolerant-parse → `renderMetaFile` → write — so the format / IA / casing apply uniformly,
rather than hand-editing. The re-render relies on Phase 2's `parseMetaRecord` tolerating the legacy flat-bullet
core block on read (2.1.b); `renderMetaFile`'s enum-casing normalization re-cases the lowercase `heavy` / `light`
siblings to `Heavy` / `Light` automatically. `Class` estimates are best-effort against the boundary tests — _not_
a blanket `Heavy` (which would fabricate the signal and pin it under the ratchet); `provisional/` members stay
`[TBD]` (the render default — `[TBD]` is legal only there per the readiness rule). The active WU and the three
already-classified `agile-wu-lifecycle` siblings keep their real values. The doc migration (5.1–5.3) lands as
**one migration commit** (re-render + `Cohort` + `Class` + regen), so the backlog never commits with a `planned/`
WU at `[TBD]`; Task 5.0's reader/render fidelity fix (TS + tests) is a distinct concern and lands as its own
commit just before it. Watch ROADMAP-regen / hook side effects on the sweep commit — see
`spec-class-model-foundation.md` § Migration & sequencing.

_Requirements:_ R15, R16, R24.

### `[x]` **5.0 Make the meta projection faithfully round-trip narrative field values**

- _Goal:_ `renderMetaFile` / `parseMetaRecord` round-trip narrative field values (`Last Completed`, `Next Task`,
  `Blockers`, `Next Action`) without loss — preserving both their inline code spans and their multi-line
  continuations — so the 5.1 re-render keeps every meta's content verbatim instead of flattening it.

    - `[x]` **5.0.a Make `parseMetaRecord` faithful — `valueClass`-aware strip + multi-line capture**
        - `extractField` (`lib/active/meta-reader.ts`) is now line-based: it gathers indented continuation lines
          after the label line (stopping at a blank line, the next `**Label:**` marker, a heading, `---`, or EOF)
          and returns the raw value — no longer stripping inline code. `parseMetaRecord` moved the backtick strip
          into its field loop, gated on `valueClass`: `enum` / `identifier` strip to bare tokens, `narrative` is
          preserved verbatim. Core-table reads and the legacy flat-bullet fallback are unaffected (all
          non-narrative). `stripInlineCode` is now exported.
        - Hardened `inferSessionType` (`status.ts`): its `^`-anchored `integrate-work-unit` / `archive-work-unit`
          prefix match now runs against a `stripInlineCode`-normalized `Next Action`, so a preserved leading
          backtick can't break integration inference. No current meta hits this — future-proofing the faithful
          contract.

    - `[x]` **5.0.b Emit indented continuations in `renderMetaFile`**
        - `renderBullets` (same file) splits the formatted narrative value on `\n`, emits the first line after the
          label, and indents each continuation two spaces under the bullet — list-continuation-valid, lint-clean
          markdown that `parseMetaRecord` recovers unchanged.

- _Outcome:_ The projection is now a faithful inverse for narrative (code spans + line breaks survive) while
  token fields stay bare — the incidental blanket-strip is corrected to a `valueClass`-gated one. Verified by
  round-tripping a real multi-line, backticked backlog meta (`adr-accept-timing`): every present value recovers
  verbatim, with only the intended `Class: null → [TBD]` default-fill differing. That fill is the one caveat 5.1.a
  must honor — its re-parse-stability check compares _present_ values and treats `null → default` (Class) as an
  intended migration change, not drift.

### `[x]` **5.1 Re-render every `backlog/` meta to the new format and repair `Cohort`**

- _Goal:_ Every `backlog/` meta (planned + provisional) is re-rendered to the new format / IA and has a
  path-valued `**Cohort:**` matching its on-disk dir (or `[none]`), so the whole backlog enters the modernized
  schema in one consistent shape.

    - `[x]` **5.1.a Re-render via a one-off migration script**
        - A throwaway `node` script (native TS, importing `renderMetaFile` / `parseMetaRecord` from source)
          re-rendered all 55 `backlog/` metas — tolerant-parse → `renderMetaFile` → write — applying the
          core-block table, field order, and backtick / casing convention uniformly. Verified per file by
          present-value preservation (every non-null legacy value survives, modulo the intended `null → default`
          fills and `heavy` / `light` → `Heavy` / `Light` enum recase) **and** fixpoint idempotency (a second
          render is byte-identical); the re-run over applied files reports zero further change.

    - `[x]` **5.1.b Audit and repair `Cohort` path-match**
        - Cohort audited against on-disk path across all 55. One drift repaired: `cli-readme` claimed
          `release-readiness` but sits standalone under `provisional/`, so it was blanked to `[none]` (disk is
          authoritative). All others already path-matched.

- _Outcome:_ The whole backlog now renders in the modernized schema. Value-stamps beyond pure format: `Class:
  [TBD]` filled on 52 metas that lacked it (the 3 `agile-wu-lifecycle` siblings keep real, recased values);
  `Priority: P3` (the render default) on the 10 `provisional/` metas that carried none — the core table always
  renders Priority, and provisional WUs never got the earlier `planned/` priority back-fill; and the one
  `cli-readme` Cohort blanking. `planned/` `Class` estimates remain 5.2's. Tier 1 markdown clean.

### `[x]` **5.2 Best-estimate `Class` across `backlog/planned/`**

- _Goal:_ Every `backlog/planned/` member without a `Class` carries a best-estimate `**Class:**` against the
  boundary tests, so every startable WU satisfies the readiness rule (a resolved `Class`) in an honest,
  non-fabricated shape.

- _Outcome:_ Stamped 42 best-estimate `Class` values — **6 `Light`, 36 `Heavy`, no Errands** — via per-cohort
  subagent triage dogfooding `classify-work-unit` (read-only parallel analysis; the stamp stayed in the primary
  context, so the review stop and sub-agent-scope rule both held). Calibrated on two batches first — verifying the
  subagents' scale claims against real line/file counts — then fanned the remainder out; the full estimate set +
  rationale was surfaced and approved before any stamp. The 3 already-classified `agile-wu-lifecycle` siblings and
  all `provisional/` (`[TBD]`) were left untouched, leaving every `planned/` member resolved (38 `Heavy` / 7
  `Light` overall). The dogfood raised a model-resolution question — the `heavy` band is wide for Class's
  parallelism-load purpose — recorded in `notes-class-model-foundation.md` for pre-close calibration; non-blocking.

### `[x]` **5.3 Regen and verify the sweep**

- _Goal:_ The migrated backlog renders consistently and passes the existing gates, committed as one pass.

- _Outcome:_ ROADMAP regen **not** triggered — no `active/` / `planned/` render-field changed: the lone `Cohort`
  repair was on a `provisional/` meta (which ROADMAP doesn't render), and `Class` is not a ROADMAP column (R22).
  `validate-meta-spec` passes on every migrated meta (`Design` shape + `State` enum); STATUS.USER is user-scoped
  (gitignored) and re-renders on demand. Phase 5 (5.1 re-render + 5.2 `Class` + 5.3 verify) lands as one
  migration commit.

## **Phase 5.R:** Model revision — the `Novel` tier (within-`heavy` calibration)

_Purpose:_ Resolve the pre-close within-`heavy` calibration (the meta `Blockers` pointer) by extending `Class`
from two values to three — `Light` / `Heavy` / `Novel` — where `Novel` is reachable through the **derivation
axis only**, at a second (higher) threshold above the `Heavy` promotion. `Novel` is a distinct _kind_ (invention
/ discovery vs. composition of existing patterns), recorded **primarily** as a parallelism / sequencing balance
signal (you can hold roughly one genuinely-novel stream) and **secondarily** for an advisory distinct planning
shape (a research phase + ADR expectation). The change is **additive** to the data — it reclassifies a subset of
existing `Heavy` WUs upward and disturbs no `Light` value or the `Light` / `Heavy` boundary, so no Phase-5 stamp
is throwaway — but it is **not** additive to the model surfaces: it amends the shipped two-value normative text
everywhere it appears, sharpens three under-specified points the Phase-5 dogfood exposed, and adds the
one-spectrum framing (Errand floor → `Novel` ceiling) connecting work character to `Class`.

_Design decisions:_ `Novel` is a **kind, not a magnitude** — which is what licenses a third _value_ rather than a
`Heavy` sub-marker, and what makes its register break (`novel` names the cause; `Light` / `Heavy` name weight)
honest signal rather than a wart. It is reached **only via derivation** because the axes are asymmetric: scale is
_endurance_ (chunkable, parallelizable, decomposes when it runs away), while derivation is _depth_ (serial,
context-saturating, plate-dominating) — so the top tier is the saturating axis alone, and the `heavy → novel`
test is **invent (concepts/models not yet in the problem domain) vs. compose (a real design from existing ARC
patterns)**. Three sharpenings ride along: (1) the **derivation floor** is the design-vs-implementation-detail
line (R7) — derivation counts only spec-worthy design a competent engineer must settle _before starting_, never
in-flight implementation choices (naming, local structure); (2) the **no-ratchet-back** distinction — "execution
turned out light" ≠ "the design was determinate"; realized authoring floors `Class` at `Heavy`, only an
over-high _estimate_ corrects down; (3) `Heavy` stays **demand-not-volume**, and the single `Heavy` bit's loss of
_where_ the weight sits (planning vs. execution) is recovered by per-stage planning depth, not by splitting the
field. Depth stays **advisory throughout** — ARC forces _presence and the weight-signal_ (a spec must exist; the
`Class` value is forced at planned-entry), and _suggests_ shape and depth; no spec-vs-`Class` enforcement hook
(that was already ditched, correctly). The spectrum framing **keeps `Class` WU-scoped and atomic as character** —
no flattening to a 4-value scale (atomic measures cardinality not weight, and has no meta to record on); it
surfaces the shared ceremony-scaling thesis as _two questions in one sizing pipeline_, without a new hypernym.
The **felt-difference test must widen** — as written it is rigor/speed-only, which a literal read would use to
reject `Novel` (whose felt difference is sequencing + a distinct _available_ planning path); admit the behavioral
/ sequencing consequence as qualifying. Framework surfaces (DEV-RULES.ARC, AGENT-BRIEF.ARC,
strategy-work-organization, `template-meta.md`, the `classify-work-unit` method) edit in **both** copies
(`packages/arc-framework/arc/**` source + `.arc/**` instance) per package-sync; internal-only surfaces (notes,
spec, ADR-023, this task list) edit once. The validation gate (5.R.1) bars on **recognizability**, not crispness
— the invent/compose border is inherently fuzzy, and that is cheap _because depth is advisory_ (a
misclassification nudges a suggestion, the ratchet corrects it); if the re-run yields no stable set, fall back to
binary `Class` + a richer STATUS.USER view rather than ship a vague tier.

_Requirements:_ revises R1, R2, R5, R9, R23, R24; extends the cohort contract (the `Class` model the siblings
consume). No new requirement IDs — the model shape changes, the requirement set does not.

### `[x]` **5.R.1 Settle the model in the durable design artifacts (notes + spec)**

- _Goal:_ Update the internal-only design sources so everything downstream derives from a settled record:
  `notes-class-model-foundation.md` § Open calibration is rewritten from "leading candidate / representation not
  committed" to the **decided** three-value model (kind-not-magnitude, derivation-only top, primary-balance
  purpose, the three sharpenings, the spectrum framing); `spec-class-model-foundation.md` amends R1 / R2 / R5 / R9
  / R23 / R24, the spec-form mapping, the felt-difference-test section, the exposed-contract surfaces, and the
  Success Criteria to the three-value shape.

- _Outcome:_ Notes § Open calibration → § Resolved: the `novel` tier — the "leading candidate / not committed"
  framing replaced with the decided three-value model, the kind-vs-magnitude resolution, a `Refinements settled
  in discussion` block (the derivation floor, no-ratchet-back, demand-not-volume, advisory-depth, one-spectrum
  framing), and the validation gate; the superseded `{light, heavy}` and "binary kind" mentions recased to three
  values, atomic explicitly held as character-not-`Class`. Spec amended across Purpose, Goals, R1 / R2 (the
  invent-vs-compose test + the derivation floor) / R4 / R5 (`{light, heavy, novel}` + the no-flatten spectrum) /
  R9 (`Novel` enum + the execution-light≠design-determinate clause) / R23, the widened felt-difference test, the
  naming rationale, and Success Criteria (SC4 / SC7 + a new SC11 for the tier + validation). No two-value
  assertion left live in either (grep-verified). These three (this task list, notes, spec) are single-copy
  internal artifacts — no package-sync; that begins at 5.R.3's Framework surfaces.

### `[x]` **5.R.2 Validation gate — re-run the derivation-bearing heavies against invent-vs-compose**

- _Goal:_ Confirm the `Novel` tier holds empirically before the Framework surfaces are rewritten: re-triage the
  derivation-bearing `Heavy` WUs against the invent-vs-compose test, and confirm a **stable, recognizable** `Novel`
  set (a meaningful minority, not 1, not 30). Go/no-go: a recognizable set proceeds; a smeary, reader-dependent
  result reopens the representation (binary `Class` + richer STATUS.USER view).
    - Read-only parallel analysis (6 batches over the 38 `planned/` heavies) dogfooding the `heavy → novel` test;
      the decision stayed in the primary context (sub-agent-scope rule), as in Task 5.2.

- _Outcome:_ **Gate passed.** Confirmed `Novel` set (7): backlog — `decomposition-machinery`, `arc-plan-conductor`,
  `cross-machine-sync-coherence`, `release-lifecycle`, `commit-increments`, `coord-probe`; active —
  `class-model-foundation`. Recognizable minority, stable core + fuzzy band; `coord-probe` held as a
  high-uncertainty estimate (may ratchet down). The eyeballed guess was substantially off both ways (5 of 7
  eyeballed → `heavy`; 5 confirmed novels missed) — the systematic gate earning its keep; full result in
  `notes-class-model-foundation.md` § The validation gate — result. The re-stamp list feeds 5.R.6. A
  **completeness pass over Phases 1–5's delivered surfaces** rode this gate and found two coverage gaps now folded
  in: (a) the code enum is single-source in `commands/active/types.ts` (`WorkClass` + `validateClass`, whose
  `default` silently sentinels `Novel`) and the balance-signal tally `lib/status/class-composition.ts` — 5.R.5
  retargeted off the mis-named `parseMetaRecord`/`renderMetaFile`; (b) `graduate-work-unit.md` enumerates the value
  set at the forcing point — added to 5.R.4. `init`/`activate` delegate to the method (no edit).

### `[x]` **5.R.3 Always-loaded doctrine — DEV-RULES.ARC + AGENT-BRIEF.ARC (lean)**

- _Goal:_ Update the two every-session surfaces to accommodate `Novel` and the spectrum framing at
  **operational-context altitude only** — the `Class` value set and the minimum-viable guard in DEV-RULES.ARC,
  the `Class` vocabulary entry in AGENT-BRIEF.ARC — with **no** added rationale (the why lives in the strategy /
  method / ADR, referenced on demand). Both are Framework files: edit the package source and the `.arc/` copy.

- _Outcome:_ AGENT-BRIEF.ARC `Class` vocabulary entry gains `Novel` (invent-vs-compose, one clause) **and** the
  long-omitted parallelism/worklist-balance purpose (the notes-flagged gap, fixed here since the entry was open
  anyway). DEV-RULES.ARC carries no value-set enumeration (it defers to the method / strategy / brief), so its
  only touch is the § Scaled Process range ceiling — "Errand to a _heavy_ work unit" → "_novel_ work unit" — for
  accuracy under the new top. No rationale added; the always-loaded surfaces stay lean. Both Framework copies
  (package source + `.arc/`) byte-identical; lint clean.

### `[x]` **5.R.4 Deep authoritative surfaces — strategy, method, ADR**

- _Goal:_ Carry the full model and reasoning on the on-demand surfaces: `strategy-work-organization` § Class Model
  gains `Novel` + the second derivation threshold, the **derivation floor**, worked examples on each side of the
  invent/compose line, the no-ratchet-back distinction, the **widened felt-difference test**, the spec-form-table
  `Novel` mapping, and the **spectrum framing** linking § Work Character ↔ § Class Model; the `classify-work-unit`
  method gains the `heavy → novel` boundary test (the gate-validated invent-vs-compose wording) and the derivation
  floor; the `graduate-work-unit` workflow admits `Novel` where it enumerates `Light` / `Heavy` at the
  planned-entry forcing point (audit-found gap); ADR-023 records the two-→three-value shift (amendment or
  supersession note). Strategy + method + `graduate-work-unit` are Framework files (two copies); ADR is internal.
  (`init` / `activate-work-unit` need no edit — they delegate to the `classify-work-unit` method, not the value set.)

- _Outcome:_ All four surfaces carry the three-value model. `classify-work-unit`: 4th boundary test
  (invent-vs-compose, gate-validated wording), the derivation floor, the "execution-light ≠ design-determinate"
  ratchet clause. `strategy-work-organization` § Class Model: `novel` in the value set, the derivation-axis-top
  paragraph (asymmetry — scale-endurance / derivation-depth), the floor, the invent-vs-compose boundary test, the
  invent/compose worked examples, the no-ratchet-back clause, the spec-form table + relationships (`detailed` ⇒
  `heavy` or `novel`), and the one-spectrum framing bridging § Work Character ↔ § Class Model. `graduate-work-unit`:
  `Novel` admitted at both value-set enumerations. ADR-023: Status + Alternatives (chosen = three-value;
  sub-marker / view-only noted as rejected) + a "top tier — `novel`" Decision subsection (dogfood motivation,
  asymmetry, additive, recognizability gate) + boundary tests + spec forms + two Consequences bullets. **Scoping
  note:** the widened felt-difference test lives in the spec (5.R.2) and ADR — not duplicated into the strategy
  (which has no felt-difference section); the strategy's worked examples carry the felt-distinctness instead. Five
  Framework copies byte-identical; ADR single-copy; lint clean.

### `[x]` **5.R.5 Schema, render, parse, status**

- _Goal:_ Admit `Novel` through the machine surfaces.

- _Outcome:_ `commands/active/types.ts` admits `Novel` in `WorkClass` and `validateClass()` while preserving the
  `[TBD]` fallback for unknown tokens; ready/in-flight status slices pass `Novel` through the existing
  parser/render path; `classComposition()` reports `{ novel, heavy, light }`; and `template-meta.md` lists the
  three resolved values in both Framework copies. No `Class`-ordered sort was added — status ordering remains
  priority / cohort / work-unit name. Tests lock `Novel` normalization, ready/in-flight slice display, render
  output, and composition counting.

### `[ ]` **5.R.6 Re-stamp the confirmed `Novel` backlog WUs**

- _Goal:_ Apply `Class: Novel` to the six 5.R.1-confirmed `backlog/planned/` novels (`decomposition-machinery`,
  `arc-plan-conductor`, `cross-machine-sync-coherence`, `release-lifecycle`, `commit-increments`, `coord-probe`)
  via the established re-render path (tolerant-parse → `renderMetaFile` → write), not hand-edits; regen ROADMAP /
  STATUS.USER if any render field changed. A pure upward reclassification of existing `Heavy` estimates — `Light`
  values and the `Light` / `Heavy` boundary untouched. (The active `class-model-foundation` meta is the seventh
  `Novel`; it is stamped separately in 5.R.8, where it also gets the format migration it never received.)

### `[ ]` **5.R.7 Contract exposure + downstream routing**

- _Goal:_ Expose `Novel` in the cohort's `Class` contract (the exposes/consumes partition the siblings read), and
  route the realization this WU defines-but-does-not-build: the advisory planning-shape consequences (research /
  ADR path, per-stage depth suggestion) to `scalable-authoring-pipeline`; the plate-balancing / sequencing stance
  to `concurrent-work-conventions` (agile-parallelism). Route the broader Work-Character ↔ `Class` vocabulary
  reconciliation to `doc-cascade-sweep` if it exceeds this WU's framing pass.

### `[ ]` **5.R.8 Reformat + stamp this WU's own active meta**

- _Goal:_ Bring `meta-class-model-foundation.md` into the modernized schema and the three-value model before the
  phase closes — it is the **lone format outlier** (Phase 5 migrated only `backlog/` metas; this WU's own active
  meta was edited in place and never re-rendered, so it still carries the legacy flat-bullet block — no core-block
  table, lowercase `Class: heavy`). Tolerant-parse → `renderMetaFile` → write (core-block table, field order,
  backtick / casing convention), recase and **stamp `Novel`** (this WU is the canonical `Novel`), and reconcile
  the now-resolved `Blockers` pointer (the within-`heavy` calibration is settled). Depends on 5.R.5 (the render /
  `validateClass` must admit `Novel` first). Meta-file edit standing alone → a dedicated `chore(arc):` commit per
  meta-file-commit-shape — a deliberate ceremony touch, not a task-completion code edit. Lands last, immediately
  before Phase 6 verification.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` DEV-RULES.ARC carries the minimum-viable `Class` rule (the discipline-invariance guard + a pointer to
  the `classify-work-unit` method and `strategy-work-organization`) and the front-loading-duty sharpening; the
  § Atomic-tier infra-edit smell flag is removed; AGENT-BRIEF.ARC introduces the `Class` vocabulary and de-stales
  the retired tier references. The boundary tests, axis definitions, and reasoning (two floors, spec-worthiness,
  topology, ratchet) live in the method, strategy, and companion ADR — not in always-loaded DEV-RULES
- `[ ]` A companion ADR (adr-023) exists, parallel in scope to adr-016, recording the architectural shift
- `[ ]` `template-meta.md` reflects the modernized schema — `**Class:**` in the core block (default `[TBD]`), the
  new field order / core-block table / backtick-casing convention, the stale `Tier:` reservation comment retired,
  `**Design:**` Class-aware, `**Cohort:**` path-valued with the dual-placement note; `Class`-conditional validity
  is specified
- `[ ]` The meta record renders to the value-format + IA convention — core-block table
  (`State` / `Owner` / `Branch` / `Class` / `Priority`), three-way value formatting (Capitalized backticked enum
  tokens, backticked identifiers, bracket sentinels, prose narrative fields), and the field order — round-tripped
  through one guarded `parseMetaRecord` that every consumer routes through (the duplicated `extractField`
  retired); existing `backlog/planned/` metas are migrated to it
- `[ ]` Every spec-named position passes the felt-difference test (no `light`/`detailed`; the `outline` straddle
  resolved by `Class` / task-gen scale)
- `[ ]` Every WU artifact in `active/` and `backlog/` uses position-independent (filename-only) references; the
  relocatability invariant and the generalized source-side rule are stated in DEV-RULES.ARC
- `[ ]` The `classify-work-unit` method exists as the DRY triage home and is wired into `init-work-unit` /
  `activate-work-unit`; the `graduate-work-unit` (`provisional → planned`) workflow forces the estimate at
  planned-entry
- `[ ]` `Class` renders in STATUS.USER over an in-flight + ready content model (mine, unblocked);
  `strategy-work-organization` carries the `Class` model, the `planning depth` ordinal, the three spec forms, and
  worked boundary-test examples on each side of both `heavy` triggers, plus the ratchet + readiness rule
- `[ ]` Every `backlog/` meta (planned + provisional) is re-rendered to the new format with a path-valued
  `**Cohort:**` that path-matches its on-disk dir (or `[none]`); every `backlog/planned/` member additionally
  carries a best-estimate `**Class:**` (not a blanket `Heavy`), the active WU and already-classified siblings
  retain their values, and `provisional/` members are `[TBD]`
- `[ ]` The contract surfaces consumed by siblings (the `Class` model, the path-valued `Cohort` schema, the
  relocatability invariant) are defined normatively in the spec and the constitution
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
