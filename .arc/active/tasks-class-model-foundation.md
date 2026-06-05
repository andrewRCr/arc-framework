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

### `[ ]` **1.3 State the relocatability invariant and generalize the source-side reference rule**

- _Goal:_ DEV-RULES.ARC states the relocatability invariant and the generalized source-side reference rule, so
  lifecycle moves stay pure `git mv` and movable artifacts never carry refs that break when the source relocates.
- _Note:_ this WU states the rules only; _enforcement_ (the forbidden-pattern hook + the path-style link-def
  sweep) routes to `quality-gate-hooks`. Edit the package source, then sync the `.arc/` mirror.

    - `[ ]` **1.3.a State the relocatability invariant**
        - WU artifacts (`meta-*`, `draft-*`, `spec-*`, `tasks-*`, companions) relocate between lifecycle states
          (`active/` ↔ `backlog/` ↔ `completed/`) as a function of State via a pure `git mv` with no content
          edit — which holds only if artifacts carry position-independent refs.

    - `[ ]` **1.3.b Generalize the `.arc/` artifact-reference rule (source-side)**
        - A movable artifact carries no relative-path links at all — filename-only, even to stable docs — with
          relative paths legal only in non-moving docs. Closes the gap where today's rule mandates filename-only
          refs _to_ movable artifacts but permits relative paths _to_ stable docs (which break when the source
          is itself movable).

### `[ ]` **1.4 Add the `Class` vocabulary entry to AGENT-BRIEF.ARC**

- _Goal:_ AGENT-BRIEF.ARC introduces `Class` as orientation vocabulary — what it is, the two intrinsic axes
  (either alone raises the floor), that it indicates weight across planning, execution, and review while
  execution discipline stays invariant — so an agent knows the concept exists and what it means without loading
  the method or strategy.
- _Note:_ two-copy; edit the package source, then sync the `.arc/` mirror.

    - `[ ]` **1.4.a Add the `Class` entry to the Vocabulary section**
        - `Light` / `Heavy` (`[TBD]` until resolved); `Heavy` when _either_ axis runs high — `derivation`
          (a real design must be authored) or `scale` / `complexity` (a large or intricate existing-code surface
          a correct plan and execution must navigate). Indicates weight across planning, execution, and review;
          tracks intrinsic demand, not output volume or preference; discipline never scales. Capitalized enum
          tokens in prose-as-values, lowercase as adjectives ("a heavy WU"); match the existing entries' density.

    - `[ ]` **1.4.b De-stale the `Work unit` and `Atomic` entries**
        - Drop the retired tier vocabulary: remove `Tier-invariant (atomic / quick / standard)` from `Work unit`
          (the weight role is now `Class`'s); reframe `Atomic` as a work character — a single logical concern
          that fits one review increment (typically one commit, even if multi-file), executed inline in a
          same-domain WU or as an Errand — dropping the `atomic-tier` reference.

### `[ ]` **1.5 Author companion ADR-023**

- _Goal:_ An internal-only companion ADR (`adr-023-class-model-scaled-ceremony.md`) records the architectural
  shift — scaled ceremony / invariant discipline, the `Class` model, the boundary tests — parallel in scope to
  adr-016, carrying the narrative and risks the enforceable rule omits.
- _Context:_ ADRs are internal-only (`.arc/reference/adr/`, single-copy, do not ship); next number is 023.
  Anchors to cite: ADR-001 (P1/P2/P4/P7), ADR-020 (scalable core), ADR-021 (Errand floor), ADR-022 (schema-owned
  meta).
- **Strategies:** `strategy-adr-methodology.md`.

    - `[ ]` **1.5.a Draft adr-023 (context / decision / consequences)**
        - The two-floors model, spec-worthiness, the fixed-floor → scalable-middle → fixed-ceiling topology, the
          `Class` model + boundary tests, and the planning-depth ordinal + the three spec forms — the
          architectural reasoning behind the enforceable surfaces. This internal record is its sole home;
          DEV-RULES carries only the rule + pointer.

    - `[ ]` **1.5.b Record the risks and mitigations**
        - `Class` drift via under-specification and its mitigations (the estimate-vs-realized ratchet removing
          the lowball incentive; the self-diagnosing depth-shift signal; reviewer scrutiny; strategy-doc
          examples). Draw from `notes-class-model-foundation.md` § Pressure points and risks.

    - `[ ]` **1.5.c Wire ADR cross-references**
        - Add adr-023 to the adr `README` index; confirm the cohort doc's ADR-anchors list resolves. Keep ADR
          references off adopter-facing surfaces (ADRs do not ship).

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

### `[ ]` **2.1 Establish the meta value-format + IA convention in `renderMetaFile` / `parseMetaRecord`**

- _Goal:_ The meta record renders to a uniform, human-legible convention and round-trips through a single parser
  — the three-way value formatting, the hoisted core-block table, the field order, and one consolidated reader —
  so every later field task rides a stable render / parse foundation and no consumer breaks on backticked values.
- _Context:_ `META_FIELDS` in `packages/arc-framework/src/lib/active/meta-reader.ts` drives both `renderMetaFile`
  and `parseMetaRecord` (inverses); render already blank-line-groups by `group`, and `extractField` +
  `stripInlineCode` strip backticks on read. A second, drifted `extractField` in `git/worktree-roster.ts` does
  **not** strip — retire it for the shared reader.
- _Note:_ `renderMetaFile` emits the table pre-aligned, so generated metas need no hand-alignment
  (`MD013 tables:false` exempts table width). `template-meta.md` reflection is 2.5; migrating existing instances
  is Phase 5.
- **Strategies:** `strategy-testing-methodology.md`.

    - `[ ]` **2.1.a Render the three-way value format + core-block table**
        - Extend `META_FIELDS` with a per-field render mode (core-table cell vs. bullet) and value class (enum
          token → Capitalized + backticked; identifier → backticked as-is; sentinel → bracketed, unbackticked;
          narrative → prose). Render the **core block** as a single-row, pre-aligned table
          (`State | Owner | Branch | Class | Priority`); render the rest as ordered bullet groups —
          (`Cohort`, `Depends On`), (`Origin`, `Design`, `Task List`), (`Last Completed`, `Next Task`,
          `Blockers`), (`Next Action`).
        - Build `test-first` (one behavior at a time):
            - the core block renders as a well-formed, column-aligned table with the five fields in order.
            - enum tokens render Capitalized + backticked; identifiers backticked; sentinels bracketed; narrative
              fields plain prose.
            - bullet groups render in the defined order, blank-line-separated.

    - `[ ]` **2.1.b Parse table + bullets in one guarded `parseMetaRecord`**
        - Read tolerates both layouts on the core block (table-first, else the legacy flat-bullet scan), so the
          parser ingests pre-migration metas — the active meta and the whole backlog stay readable in the window
          between this render/parse change and the Phase 5 file migration, and the migration script can ingest the
          old shape. Render always emits the new table.
        - Build `test-first` (one behavior at a time):
            - `parseMetaRecord` recovers core-block fields from the table (header-label-keyed, column-order
              tolerant) and the rest from bullets; values strip backticks / brackets to bare form.
            - a legacy meta with a flat-bullet core block (no table) recovers its core fields from bullets.
            - a `renderMetaFile` → `parseMetaRecord` round-trip preserves every field across the new format.
            - a core table that is _present but malformed_ (column-count mismatch / missing separator) fails
              **loud**, not silent-null — the bullet fallback covers only the no-table-at-all case.

    - `[ ]` **2.1.c Consolidate every meta read through the shared reader**
        - Retire the duplicated `extractField` in `git/worktree-roster.ts` (and any peer) for `parseMetaRecord` /
          a shared field-reader that strips inline code, so backticked + table-rendered values round-trip through
          the roster, in-flight derivation, and `validate-meta-spec` without regression.
        - Build `test-first` (one behavior at a time):
            - the roster / in-flight / validation readers recover backticked, table-rendered field values without
              regression.

### `[ ]` **2.2 Add the `Class` field (`Light` / `Heavy` / `[TBD]`) to the meta schema with ratchet semantics**

- _Goal:_ The meta schema carries `**Class:**` as a core-block field (`Light` / `Heavy` / `[TBD]`, default
  `[TBD]`) that round-trips through render and parse, making the work's weight a first-class structured field.
- _Context:_ `Class` slots into the core block alongside `State` / `Owner` / `Branch` / `Priority` (2.1),
  rendered as a Capitalized backticked enum token.
- _Note:_ this task adds the field + its value set; the form ↔ `Class` relationship is documented as guidance
  (4.2.c), not enforced by a hook.

    - Build `test-first` (one behavior at a time):
        - `META_FIELDS` includes `Class` (core block, default `[TBD]`); `renderMetaFile` emits it in the core
          table as a Capitalized backticked token.
        - `parseMetaRecord` recovers `Class`; a render → parse round-trip preserves `Light` / `Heavy` / `[TBD]`.
        - an absent `Class` parses to `null`; a fresh render with no override emits the `[TBD]` default.

### `[ ]` **2.3 Define `Class`-aware `Design` field value semantics**

- _Goal:_ The `**Design:**` field's value semantics are documented as `Class`-aware and `Origin`-orthogonal:
  `draft-{name}.md` during Planning, `spec-{name}.md` from Active onward (all forms — filename stable, the form
  lives in the H1 / template); `Design` always points at an ARC-owned planning artifact, external trackers go in
  `Origin`.
- _Context:_ `Design` already exists in `META_FIELDS` and `validate-meta-spec.ts` already validates its _shape_;
  this task defines the _value semantics_ (which artifact in which State), a documentation change, not new
  validation.

### `[ ]` **2.4 Make the `Cohort` field path-valued (two-segment cap)**

- _Goal:_ `**Cohort:**` carries a path value — a single segment, `<cohort>/<subcohort>`, or `[none]`, capped at
  two segments — mirroring the on-disk dir-path, with the field remaining the membership source of truth (the
  sibling list is derived, never stored).
- _Context:_ `Cohort` exists in `META_FIELDS` (default `[none]`) and is read by `status/render.ts`,
  `status/in-flight-mine.ts`, `git/worktree-roster.ts`, `git/in-flight-derivation.ts` — now all routed through
  the shared reader (2.1.c). The path-valued change must hold across them; render uses the leaf segment for
  nested cohorts (matching the current ROADMAP interim).
- _Note:_ dual-placement (meta + spec header) is the schema rule (stated in 2.5's template guidance);
  backfilling existing `draft-*` / `spec-*` headers rides downstream template passes, not this WU.

    - `[ ]` **2.4.a Parse and validate the path-valued `Cohort`**
        - Build `test-first` (one behavior at a time):
            - a single segment, a two-segment path, and `[none]` all validate.
            - a three-segment path is flagged (two-segment cap).
            - the leaf segment is derivable for render.

    - `[ ]` **2.4.b Confirm the `Cohort` consumers tolerate path values**
        - Build `test-first` (one behavior at a time):
            - the in-flight / roster / render readers (via the shared reader) accept a path-valued `Cohort`
              without regression.
            - render shows the leaf segment for a nested cohort; the full path for membership.

### `[ ]` **2.5 Update `template-meta.md` to the new format: core-block table, `Class`, retire the `Tier` comment**

- _Goal:_ `template-meta.md` reflects the modernized schema — the core-block table with `**Class:** [TBD]`, the
  new field order and bullet groups, the backtick / casing / sentinel convention, the stale `Tier:` reservation
  comment removed, and refreshed `Design` (Class-aware) and `Cohort` (path-valued, dual-placement) guidance — so
  `init-work-unit` scaffolds a schema- and convention-correct meta.
- _Context:_ two-copy (package source + `.arc/` mirror, currently byte-identical); edit package source, sync the
  mirror. `init-work-unit` scaffolds `Class: [TBD]` from the `renderMetaFile` default (2.1 / 2.2) — no `--class`
  flag, the scaffolding act stays `Class`-agnostic.
- **Strategies:** `strategy-package-project-sync.md`.

    - Reshape the field block to the new IA: the core-block table (`State | Owner | Branch | Class | Priority`)
      then the bullet groups in order; apply the backtick / casing / sentinel convention throughout.
    - Add the `**Class:**` comment entry: values `Light` / `Heavy` / `[TBD]`, the ratchet, forced at
      planned-entry.
    - Delete the `Tier:` entry from the "Deliberately not added" comment block.
    - Refresh the `Design` comment (Class-aware: `draft-*` in Planning, `spec-*` from Active) and the `Cohort`
      comment (path-valued, two-segment cap, dual-placement).

## **Phase 3:** Classification mechanism — method, graduation, touchpoints

_Purpose:_ Make the `Class` signal present and forced — the DRY `classify-work-unit` triage method, the
`graduate-work-unit` (`provisional → planned`) forcing workflow, and the `init` / `activate` touchpoint wiring.

_Design decisions:_ the method uses the existing loadable-method mechanism (no `composable-workflows` dependency),
authored as a self-contained extractable block for later fragmentation. `graduate-work-unit` mirrors
`init-work-unit`'s `git mv` + ROADMAP/STATUS.USER-regen shape (a flat backlog-internal move) and reserves
"graduation" for the readiness ladder. The three planning-stage touchpoints route downstream to
`scalable-authoring-pipeline` — see `spec-class-model-foundation.md` § Non-Goals.

_Requirements:_ R17, R18, R20, R21.

### `[ ]` **3.1 Author the `classify-work-unit` method (boundary-test triage + ratchet)**

- _Goal:_ A loadable `classify-work-unit` method states the boundary-test triage and the estimate-vs-realized
  ratchet once, as the single DRY home every touchpoint declares — so classification logic is not re-stated per
  surface.
- _Context:_ methods live in `system/methods/` (two-copy; loaded via a workflow's `arc.methods` frontmatter).
  Mirror the existing method shape (contract block + default). Author the decision content as a self-contained
  extractable block (`composable-workflows` forward-compat).
- **Strategies:** `strategy-configurability-architecture.md`.

    - `[ ]` **3.1.a Author `system/methods/classify-work-unit.md`**
        - Contract + default: the boundary-test triage (Errand-vs-WU, derivation, scale), the `[TBD]` →
          best-estimate guidance, and the estimate-vs-realized ratchet. Two-copy.

    - `[ ]` **3.1.b Register the method**
        - Add it to the methods `README` index. The `audit-method-triggers` check requires every method to have at
          least one declaring workflow (`arc.methods` frontmatter), so land `classify-work-unit.md` together with
          its first declaration (`graduate-work-unit`, 3.2) — a method committed before any workflow declares it
          fails the audit and the framework-sync check.

### `[ ]` **3.2 Add the `graduate-work-unit` workflow (`provisional → planned`)**

- _Goal:_ A `graduate-work-unit` lifecycle workflow promotes a WU up the readiness ladder — `git mv`
  `provisional/ → planned/`, run `classify-work-unit` to force the estimate, regen ROADMAP + STATUS.USER —
  giving the forcing function an execution home.
- _Context:_ mirrors `init-work-unit`'s `git mv` (Step 3) + ROADMAP-regen (Step 5) shape; a flat backlog-internal
  move, none of the cohort-transform / PR-park mechanics. Lives in
  `system/workflows/arc/work-unit-lifecycle/` (two-copy); declares the `classify-work-unit` method (3.1).
- _Note:_ ROADMAP / STATUS.USER regen is hand-rendered until `roadmap-tooling` automates it. The `STATUS.USER`
  regen targets the in-flight-+-ready content model — a graduated WU enters the ready slice — which 4.1 establishes;
  both ship in this WU, so the regen step is coherent at integration.
- **Strategies:** `strategy-work-organization.md`, `strategy-workflow-authoring.md`.

    - `[ ]` **3.2.a Author the workflow**
        - The three steps (`git mv` → `classify-work-unit` → ROADMAP/STATUS.USER regen), with frontmatter
          declaring the method and passing the workflow-authoring validators. Two-copy.

    - `[ ]` **3.2.b State the readiness rule, place the ladder, and reserve the terminology**
        - State the readiness rule the workflow enforces: a `backlog/planned/` (startable) WU carries a resolved
          `Class`; `[TBD]` is legal only in `backlog/provisional/`. Planned-entry is the forcing point because the
          start decision — read off `STATUS.USER`'s ready list — precedes activation. The workflow names and loads
          `classify-work-unit` to resolve the value: it states the lifecycle constraint, not the triage (the method
          is the DRY home for that).
        - State `provisional → planned → active` as the graduation ladder; cross-reference from
          `strategy-work-organization` § Work Unit State, and add a pointer from `init-work-unit` (graduate-work-unit
          precedes it on the ladder). "Graduation" names the ladder only — the `decomposition-machinery` rename is
          routed (its inbound buffer; the cohort doc).

### `[ ]` **3.3 Wire `classify-work-unit` into `init-work-unit` and `activate-work-unit`**

- _Goal:_ `init-work-unit` and `activate-work-unit` each invoke `classify-work-unit` as a lightweight
  confirm-or-ratchet step, so `Class` is re-tuned at the two lifecycle surfaces this WU owns.
- _Context:_ both workflows are two-copy; declare the method in `arc.methods` frontmatter and add the step at the
  existing meta-edit points (init Step 3/4 graduation; activate Step 4 state-flip).

    - `[ ]` **3.3.a Wire into `init-work-unit`**
        - Declare the method; add the confirm-or-ratchet step as the WU enters active planning. Two entry states:
          a WU graduated from `planned/` (Path A) arrives with `Class` already resolved (confirm-or-ratchet); a
          fresh WU (Path B) is born `[TBD]` from the template default and the step resolves it.

    - `[ ]` **3.3.b Wire into `activate-work-unit`**
        - Declare the method; add the settle step at the pre-implementation state-flip.

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

### `[ ]` **4.1 Expand STATUS.USER to in-flight + ready, sized by `Class`**

- _Goal:_ `STATUS.USER` renders both in-flight and ready (owned by the identity, unblocked, `planned/`) WUs, each
  sized by `Class`, so the view supports the balance decision — what's on my plate, and what fits alongside it.
- _Context:_ today the view is built entirely from the in-flight oracle (`status/user-view.ts` →
  `git/in-flight-derivation.ts` → `status/in-flight-mine.ts` → `status/render.ts`), columns
  `Work unit · State · Depends on · Cohort`. The `Class` field reaches the view only after Phase 2 adds it to the
  meta schema + shared reader. Auto-render stays gated on `roadmap-tooling`; this defines the content model and
  refreshes the live instance.

    - `[ ]` **4.1.a Add the `Class` column to the existing in-flight render**
        - Thread `Class` through the render path: `InFlightWorkUnit` + the field read in `classifyBranch`
          (`in-flight-derivation.ts`), the slice map (`in-flight-mine.ts`), and `StatusViewRow` /
          `STATUS_USER_COLUMNS` / `COLUMN_HEADERS` / `cellOf` (`render.ts`). `[TBD]` renders as a value, not a
          dropped cell.
        - Build `test-first` (one behavior at a time):
            - the in-flight-mine rows carry a `Class` column, including `[TBD]`.

    - `[ ]` **4.1.b Add the ready slice (owned, unblocked, `planned/`)**
        - A second data source: the ready slice reads `backlog/planned/` metas (the readiness data ROADMAP renders
          from), filters to owned-by-identity + unblocked (dependencies satisfied), sizes each by `Class`, and
          merges with the git-derived in-flight slice in the user view. Reconcile the offline path — the in-flight
          slice degrades to cache when the remote is unreachable, but the ready slice is local and always
          available.
        - Build `test-first` (one behavior at a time):
            - ready WUs owned by the identity and unblocked appear in the view.
            - blocked and not-mine WUs are excluded from the ready slice.
            - `[TBD]` rows are excluded from any heavy/light composition count.

    - `[ ]` **4.1.c Refresh the live instance and document the shape (one-off)**
        - Update `STATUS.USER.md` to the in-flight-+-ready shape with the `Class` column, and document that shape
          in the STATUS.USER render standard (`strategy-work-organization`) — the single source of truth until
          `roadmap-tooling` lands the writer + template. No auto-render wiring (that is `roadmap-tooling`'s).

### `[ ]` **4.2 Add the `Class` model, spec forms, and boundary-test guidance to `strategy-work-organization`**

- _Goal:_ `strategy-work-organization` becomes the shippable home for the `Class` model — the boundary tests with
  worked examples, the `planning depth` ordinal, the three spec forms, the ratchet, and the readiness rule — with
  its stale tier vocabulary reconciled so the strategy describes one classification system, not two.
- _Context:_ two-copy; the constitution (Phase 1) states the rules, this elaborates with examples. The ADR (1.5)
  narrates `planning depth` + the spec forms but is internal-only and does not ship, so this strategy is their
  only shippable canonical home. Pull example source URLs from the lightweight-spec deep-research transcript
  (`wf_191136b1-518`, per `spec-class-model-foundation.md` § External Research).

    - `[ ]` **4.2.a Reconcile the stale tier vocabulary**
        - Replace the retired `atomic` / `quick` / `standard` tier model where this strategy carries it — § Work
          Character (the WU-scale "atomic tier" line), § Spec-Flow Invariants ("invariant across tiers"),
          § Scaling axes (the `Tier` axis + deferred contract), § Escape-hatch guardrails (tier-one-way /
          atomic-tier), and § Archival (tier accommodations) — so the strategy describes only the `Class` model.
          The broad cross-workflow / template sweep stays `doc-cascade-sweep`'s.

    - `[ ]` **4.2.b Add the `Class` model + boundary tests with worked examples**
        - The two axes, the three boundary tests, the estimate-vs-realized ratchet, and the readiness rule, with
          worked examples on each side of the derivation line and the scale trigger (records-vs-derives;
          routine-vs-substantial grounding).

    - `[ ]` **4.2.c Define the `planning depth` ordinal and the three spec forms**
        - State the `planning depth` ordinal (`low` / `medium` / `high`; per-stage, transient, never recorded) and
          the three spec forms (`brief` / `outline` / `detailed`) with the depth → form mapping, the form ↔ `Class`
          relationship (`heavy` ⇒ `detailed`), and the `outline` straddle — the canonical shippable definitions
          (the ADR narrates the same, internal-only). Documented as guidance, not a hook-enforced constraint.

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
already-classified `agile-wu-lifecycle` siblings keep their real values. The whole phase lands as **one migration
commit** (re-render + `Cohort` + `Class` + regen), so the backlog never commits with a `planned/` WU at `[TBD]`.
Watch ROADMAP-regen / hook side effects on the sweep commit — see `spec-class-model-foundation.md`
§ Migration & sequencing.

_Requirements:_ R15, R16, R24.

### `[ ]` **5.1 Re-render every `backlog/` meta to the new format and repair `Cohort`**

- _Goal:_ Every `backlog/` meta (planned + provisional) is re-rendered to the new format / IA and has a
  path-valued `**Cohort:**` matching its on-disk dir (or `[none]`), so the whole backlog enters the modernized
  schema in one consistent shape.
- _Context:_ 45 planned + 10 provisional metas; most `Cohort` values already path-match (single segment = parent
  dir; the three nested `agile-wu-lifecycle` members already carry the two-segment path). The re-render is
  mechanical — a one-off script, not hand-editing — and depends on Phase 2's render / parse landing first.
- _Note:_ provisional metas re-render with `**Class:** [TBD]` from the `renderMetaFile` default — no estimate is
  forced there (5.2 forces only `planned/`).

    - `[ ]` **5.1.a Re-render via a one-off migration script**
        - A throwaway (non-shipped) script globs `backlog/planned/` + `backlog/provisional/` metas and, per file,
          parses the legacy record (Phase 2's tolerant read, 2.1.b) and writes it back through `renderMetaFile`
          so the core-block table, field order, and backtick / casing convention apply uniformly. Verify each by
          re-parse stability (`parseMetaRecord` of the re-rendered file equals the parsed legacy record), not
          byte-identity — the bytes change by design. Durable re-render / migration tooling is `roadmap-tooling` /
          `config-migration-registry`'s, not this script.

    - `[ ]` **5.1.b Audit and repair `Cohort` path-match**
        - Across `backlog/`: confirm each `**Cohort:**` path-matches its `<cohort>[/<subcohort>]/` parent dir, or
          is `[none]` for a standalone WU; repair mismatches. Mostly confirmation — the surface already
          path-matches.

### `[ ]` **5.2 Best-estimate `Class` across `backlog/planned/`**

- _Goal:_ Every `backlog/planned/` member without a `Class` carries a best-estimate `**Class:**` against the
  boundary tests, so every startable WU satisfies the readiness rule (a resolved `Class`) in an honest,
  non-fabricated shape.
- _Context:_ 42 of 45 planned metas lack `Class` (the three `agile-wu-lifecycle` siblings carry it; the active WU
  is in `active/`). Estimates are best-effort and revisable (the ratchet), so a grounded read now is safe.
- _Approach:_ batched — group the WUs by cohort (~3-5 per batch) and apply the `classify-work-unit` triage per WU
  (dogfooding the method via parallel reads). **Surface all estimates with their rationale for review before
  stamping** — the estimation produces a reviewable proposal; the stamp lands only on approval, so the review
  stop is preserved. Leave the three already-classified siblings and the active WU; `provisional/` stays `[TBD]`.

### `[ ]` **5.3 Regen and verify the sweep**

- _Goal:_ The migrated backlog renders consistently and passes the existing gates, committed as one pass.
- Regen ROADMAP **only if a render field changed** (`Cohort` repairs; `Class` is not a ROADMAP column per R22);
  refresh STATUS.USER; confirm the existing `validate-meta-spec` hook passes on the migrated metas (`Design`
  shape + `State` enum); confirm the regen-trigger rule is satisfied. Stage the whole migration as one commit.

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
