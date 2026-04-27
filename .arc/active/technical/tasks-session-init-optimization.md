# Task List: Session-Init Optimization

- **PRD:** `.arc/active/technical/prd-session-init-optimization.md`
- **Branch(es):** `technical/session-init-optimization`
- **Base Branch:** `main`
- **Purpose:** Cut session-init token cost from ~75–80k to ≤60k at orientation via per-file
  methods/extensions, narrower partial-reads, and session-type conditional loading — without
  regressing orientation correctness or compliance reliability.

---

## **Phase 1:** Workflow Trigger Contract + Per-File Restructure + CI Enforcement

_Purpose:_ Establish the workflow→method/extension trigger contract end-to-end — structural YAML frontmatter schema,
author-side declaration rule, all in-scope workflows migrated, per-file methods/extensions restructure pulled forward
(so the audit lands on final structure with no legacy-aggregate fallback), `pre-merge-review` method renamed to
`diff-review` (fixing the method/extension name collision), CI enforcement. Replaces brittle prose-grep enforcement
with a structural one. Aggregate files (`arc-methods.md`, `arc-extensions.md`) stay in place until Phase 3 retires
them; per-file is authoritative from Task 1.4 forward.

### `[x]` **1.1 Method and extension trigger coverage audit**

- _Outcome:_ All 16 methods/extensions pass. Catalog (1.1.a) + classification (1.1.b) recorded in
  `notes-session-init-optimization.md` § Phase 1 Trigger Coverage Audit / § Phase 1 Classification.
  1.1.c no-op (zero gaps surfaced).

    - `[x]` **1.1.a Enumerate methods and extensions**
        - Catalog: 8 methods + 8 extensions, each with self-definition refs and external references
          (file:line + surface-kind annotation). Scope: `system/workflows/**`, `reference/constitution/`,
          `reference/strategies/**`, `system/agent/`. False-match flagged at
          `strategy-session-operations.md:22` (regex hit on `#session-state-portability` anchor, not the method).

    - `[x]` **1.1.b Classify each reference against the reliable-trigger bar**
        - All 16 entries have ≥1 reliable trigger; zero hedged; zero unreachable. Methods: 2-7 reliable refs
          each (avg ~3.25). Extensions: exactly 1 each (the structural `If [X extensions] are configured,
          execute them` wrapper at the firing workflow). Method-dependencies blocks classified reliable
          alongside in-step links — each bullet is a targeted markdown-link under an imperative preamble.
          Non-link prose pointers classified informational; deferred to Phase 3.6 cross-reference sweep.

    - `[~]` **1.1.c Fix coverage gaps surfaced by the audit** — No-op: 1.1.b returned zero gaps. See
        `notes-session-init-optimization.md` § Phase 1 Classification § Overall verdict.

### `[x]` **1.2 Define workflow frontmatter schema + author-side declaration rule**

- _Outcome:_ New `strategy-workflow-authoring.md` houses schema + author-side declaration rule + body
  conventions; new `template-workflow.md` provides the canonical skeleton. STRATEGY-INDEX entry +
  pointer in `configurability-architecture.md`; `DEV-RULES.ARC § When to Load Additional Guidance`
  picks up an on-demand bullet (workflow authoring is rare; not T1 every-session). Schema: `purpose`
  first, `audience: agent | collaborative (human and agent) | human` with inline comment,
  `arc.methods` / `arc.extensions` arrays under protected namespace; angle-bracket placeholders for
  author-fillable fields. Two-copy synced.

  Placement decision (dedicated strategy vs. session-operations or configurability-architecture)
  recorded in commit body and `notes-session-init-optimization.md`.

### `[x]` **1.3 Migrate all workflows to frontmatter**

- _Outcome:_ All 25 workflow files under `system/workflows/` carry schema-conformant YAML frontmatter
  per `template-workflow.md`. Body-level `**Audience:**`/`**Purpose:**` callouts and
  `**Method dependencies**` prose preambles removed; in-step markdown links preserved for
  navigation. Unused ref-defs cleaned up. `arc.methods`/`arc.extensions` populated from the
  reliable-trigger ground truth in `notes-session-init-optimization.md` § Phase 1 Classification.
  Audience enum expanded mid-task from binary to three values (`agent | collaborative (human and
  agent) | human`). Two-copy synced; `workflows/project/` single-copy.

  Mid-task absorbed: `prepare-commits.md` H1 normalized (`# Commit Guide` → `# Workflow: Prepare
  Commits`); display-text references updated; `pre-stage-review` extension declared in
  `prepare-commits.md` frontmatter per the audit.

    - `[x]` **1.3.a `arc/` top-level (3 files)** — `1_create-prd.md` (no arc block),
          `2_generate-tasks.md` (methods: test-first), `3_process-task-loop.md` (methods:
          issue-triage, quality-gate-commands, test-first; extensions: post-task-quality,
          post-unit-quality, post-task-completion).

    - `[x]` **1.3.b `arc/session-lifecycle/` (3 files)** — `session-init.md` (methods: session-state;
          extensions: post-context-load), `session-handoff.md` (methods: session-state),
          `session-loop.md` (no arc block; audience: human).

    - `[x]` **1.3.c `arc/work-unit-lifecycle/` (7 files)** — `activate-work-unit.md` (extensions:
          post-work-unit-activate), `archive-work-unit.md` (extensions: post-work-unit-archive),
          `integrate-work-unit.md` (methods: pre-merge-review, review-triage; extensions:
          pre-merge-review). Four others (clean/deactivate/rotate/verify) carry no arc block.

    - `[x]` **1.3.d `arc/work-unit-lifecycle/planning/` (2 files)** — `activate-planning-branch.md`,
          `integrate-planning-branch.md` — both no arc block. Prose mention of
          `post-work-unit-archive` at `integrate-planning-branch.md:42` classified informational
          in 1.1.b.

    - `[x]` **1.3.e `arc/supplemental/` (6 files)** — `prepare-commits.md` (methods: commit-format,
          commit-context-format; extensions: pre-stage-review). Five others carry no arc block.

    - `[x]` **1.3.f `arc/initial-setup/` (3 files)** — `01_verify-and-configure.md`,
          `02_define-project.md`, `03_configure-external-integration.md` (package source only;
          `pm.mode: external` conditional install). All three: no arc block, audience:
          collaborative (human and agent).

    - `[x]` **1.3.g `project/` (1 file)** — `agent-pre-merge-review.md` (methods: review-triage;
          single-copy). Overview-prose references at lines 6-8 classified informational; reliable
          triggers are the in-step directives at lines 36, 78, 92.

### `[x]` **1.4 Per-file restructure + method rename (structural prep for CI audit)**

- _Outcome:_ Per-file `system/methods/` and `system/extensions/` layout established (audit script
  enumerates from this); `pre-merge-review` method renamed to `diff-review` (fixes name collision
  with the same-named extension). Aggregates retained as frozen snapshots through Phase 2;
  per-file authoritative from this task forward. Pulls forward original Phase 3.1 + 3.3 + 3.4 + 3.5
  so 1.5 lands on final structure with no legacy-aggregate fallback branch.

    - `[x]` **1.4.a Rename `pre-merge-review` method → `diff-review`; broaden framing to generic activity contract**
        - Method renamed across both copies; framing broadened to generic activity contract with
          primary-caller annotation on `integrate-work-unit.md`. Extension keeps name
          `pre-merge-review`; extension-named refs and step-heading anchors preserved (the rename is
          method-only). Ref-def anchor `[arc-methods-pmr]` → `[arc-methods-diff-review]` everywhere
          it appeared. Files touched: framework (`arc-methods.md`, `arc-extensions.md`,
          `integrate-work-unit.md`, `arc-config.yml`, `integrate-external-content.md`,
          `strategy-session-operations.md`); single-copy (ADR-013, cross-cutting analysis,
          `docs/customization/methods.md`, `verify-integrity.sh`). Backlog references
          (`tasks-arcd-rebrand:447`, `plan-arc-modes:2654/4895/5440`) flagged via persistent-context
          for activation-time reconciliation; archive untouched per "document what is, not what was."

    - `[x]` **1.4.b Document per-file frontmatter schema (was Phase 3.1)**
        - New `### Per-file Frontmatter Schema` + `### Per-file Body Conventions` subsections in
          `strategy-session-operations.md § Method and Extension Loading`. Schema (revised from spec):
          methods carry `name`, `description`, `related`, `has-override`; extensions carry `name`,
          `description`, `related`, `active` (renamed from `has-steps` during 1.4.c-f for clarity —
          `active: true/false` directly answers the runtime question). Spec's `workflow` field dropped;
          reverse index stays centralized in the strategy's Method Classification table (handles
          fan-out better; `workflow` would have duplicated info with no mechanical consumer and
          drifted silently — captured as a "Why no `workflow` field" paragraph in the section so a
          future author doesn't re-propose it). Body conventions: H1 (`# Method:` / `# Extension:`),
          bulleted-blockquote preamble (mandated to prevent prettier-merge of adjacent bold-lead
          metadata), `.override`/`.default` for methods, `.actions` for extensions.

    - `[x]` **1.4.c Create per-file directory structure (both copies) (was Phase 3.3)**
        - Four directories created (methods + extensions × 2 copies) with thin READMEs (orientation
          framing + 8-entry index with one-liner each). Detail lives in per-file entries.

    - `[x]` **1.4.d Migrate 8 methods to per-file (was Phase 3.4)**
        - 8 method files in `system/methods/` (both copies, byte-identical). Content verbatim from
          aggregate; H2→H1, H3→H2; cross-references rewritten to sibling links; ref-defs recomputed.
          Frontmatter (4 fields per 1.4.b-revised schema): `commit-format` ↔ `commit-context-format`
          related; `diff-review` → `[review-triage]` related (one-directional — review-triage has
          no `related` back). All 8 `has-override: false`.

    - `[x]` **1.4.e Migrate 8 extensions to per-file (was Phase 3.5)**
        - 8 extension files in `system/extensions/` (both copies, byte-identical). Same transformation
          as methods. `related` omitted for all 8 (no coupling table for extensions). `active: false`
          for 7 placeholder extensions (placeholder `.actions` content `[No extension configured]`);
          `active: true` for `pre-merge-review` (CodeRabbit review ceremony). Naming swap during
          execution: `has-steps`/`.steps` → `active`/`.actions` (better reflects runtime state +
          generalized "actions to perform at this fire point"). Methods unchanged
          (`has-override`/`.override` was already crisp).

    - `[x]` **1.4.f Tier 2 gate after structural prep**
        - Ref-def scan: every relative path across all 16 new entries + 2 READMEs resolves. Final
          shape: 9 files each in methods/ and extensions/ (8 entries + README), both copies. 36 total
          new files this task.

### `[x]` **1.5 Reliable-trigger CI audit script (test-first)**

- _Outcome:_ Structural CI audit at `packages/arc-framework/src/scripts/audit-method-triggers.ts`
  fails when any method/extension lacks a workflow `arc.methods`/`arc.extensions` frontmatter
  declaration. No prose-grepping, no legacy-aggregate fallback. Pure exports + guarded CLI entry
  (`fileURLToPath(import.meta.url) === process.argv[1]`); corpus root resolved from script location;
  corpus is package-source only (`.arc/` drift is the framework-sync test's concern). Tests at
  `packages/arc-framework/__tests__/unit/scripts/audit-method-triggers.test.ts` cover all 9 spec
  behaviors (single batch — tightly coupled glue with no per-behavior discovery value).

  Key invariant: separate coverage maps per kind (method+extension same-name collisions can't
  silently collapse). Root wiring: `lint:arc:triggers` script + `tsx` devDependency in root
  `package.json`; package-level `package.json` unchanged (framework-CI-only per
  `strategy-workflow-authoring.md § Enforcement`).

### `[x]` **1.6 Wire audit into CI**

- _Outcome:_ `lint:arc:triggers` step added to `.github/workflows/ci.yml` `quality` job between
  `npm run build` and `npm run -s lint:md`.

### `[x]` **1.7 Phase 1 close — Tier 2 quality gates**

---

## **Phase 2:** Constitutional Rule + ADR-013 Amendment Draft

_Purpose:_ Anchor compliance behavior before Phase 3 removes the always-loaded bodies. Constitutional framing is
absolute — no hedges — per compliance-reliability research.

### `[x]` **2.1 Add agent-side compliance rule to DEV-RULES.ARC**

- _Outcome:_ New § Verification and Discovery § Method and extension loading subsection — two behavioral
  sentences. Trigger narrowed from PRD P0.3's broad wording to workflow YAML frontmatter `arc.methods` /
  `arc.extensions` declarations specifically (in-step links are reader navigation per
  `strategy-workflow-authoring.md`). Author-side rule excluded — T3 on-demand, no constitutional home.

  _Follow-on:_ PRD P0.3 wording predates the landed trigger contract and reads broader. Consider PRD
  refresh (non-blocking; implemented rule is the more accurate spec).

### `[x]` **2.2 AGENT-BRIEFING.ARC cross-reference**

- _Outcome:_ No cross-reference added. DEV-RULES is the single source of truth for behavioral rules; both
  docs already in session-init Batch 1, so earlier position gains are marginal. Rationale in
  `notes-session-init-optimization.md § Phase 2 Decisions § Task 2.2`.

### `[x]` **2.3 Draft ADR-013 Tier 2 amendment**

- _Outcome:_ Amendment dated 2026-04-20 appended to ADR-013's `### Amendments` section. Five bullets cover
  per-file restructure, frontmatter trigger contract, T1/T3 constitutional pair placement,
  `pre-merge-review` → `diff-review` rename, and CI-enforced reliable-trigger invariant. Left as draft;
  Phase 3 close (Task 3.10) sanity-checks against the implemented model. Single-copy (ADRs project-scoped).

### `[x]` **2.4 Phase 2 close — Tier 2 quality gates**

---

## **Phase 3:** Validation, Integration, and Finalization

_Purpose:_ Landing phase for the per-file structure established in Phase 1. Build the frontmatter parser
utility; write schema + link-resolution validation hooks; restructure session-init to the post-aggregate
mechanism (methods: no init read; extensions: `^active: true` grep enumeration); sweep cross-references
from legacy aggregate anchors to per-file paths; register per-file entries across the install pipeline;
retire legacy aggregates via scoped reference sweep before delete; add CLI test coverage; harden the link
validator (template-skip + archive-skip); close with ADR-013 sanity check.

_Note:_ Tier 2 gates run at sub-phase boundaries (3.6 cross-reference sweep close), not only at phase
end. Two-copy discipline applies throughout — every file change touches `packages/arc-framework/arc/`
and `.arc/`.

### `[x]` **3.1 Frontmatter schema finalization + parsing utility**

- _Outcome:_ Schema-name + validator + audit-script refactor landed as a coherent unit; downstream Phase 3
  tasks (3.3 schema validation hook, 3.5 active-extensions enumeration) build on the shared scaffold.

    - `[x]` **3.1.a Rename method schema field `has-override` → `override-active`**
        - 25 occurrences across 21 files renamed (16 method files, both READMEs,
          `strategy-session-operations.md`, ADR-013 § Amendments). Status-file / task-list / PRD
          occurrences deferred (refresh on commit; PRD P0.5 bundled with Task 3.10).

    - `[x]` **3.1.b Frontmatter parsing utility (test-first)**
        - New `src/lib/frontmatter/` module: generic extractor + method/extension schema parsers, barrel
          re-exports. Refactored `audit-method-triggers.ts` to consume the shared generic parser. 21 unit
          tests in `__tests__/unit/frontmatter/` (3 generic, 10 method, 8 extension). Package-source only
          — two-copy discipline applies to doc content, not TS source.

### `[x]` **3.2 Enhance directory READMEs with derived tables**

- _Outcome:_ Both READMEs gained derived tables.
    - `system/methods/README.md` — Method Dependencies section: 3-row Method / Related / Coupling table
      (commit-format ↔ commit-context-format both directions; diff-review → review-triage).
    - `system/extensions/README.md` — Extension Points section: 8-row lifecycle-ordered table
      (Extension / Workflow / Fires / Purpose).

### `[x]` **3.3 Frontmatter schema validation hook (test-first)**

- _Outcome:_ CHECK 12 wired into both pre-commit copies; TS dispatcher
  (`packages/arc-framework/src/scripts/validate-frontmatter.ts`) validates staged
  methods/extensions/agent files against their schemas. Agent schema parser at `lib/frontmatter/agent.ts`
  (minimal `active: boolean`). Hook shell-filters under
  `^(\.arc|packages/arc-framework/arc)/system/(methods|extensions|agent)/`. 19 unit tests across schema
  parser + dispatcher.

  _Sequencing:_ Hook blocks agent-file commits until 5.7.b deploys the schema (expected; this WU does
  not stage agent files until then).

### `[x]` **3.4 D7a link-resolution pre-commit hook (test-first)**

- _Outcome:_ CHECK 13 wired into both pre-commit copies; shell validator
  `system/scripts/validate-links.sh` checks inline links, ref-style usages, and ref definitions in staged
  markdown. Awk state machine masks fenced code blocks and inline code spans (placeholder without
  backticks — earlier infinite-loop bug fixed). Skips: external URLs, anchor-only links, anchor fragments
  on file links. 11 integration tests cover the spec's behavior list.

### `[x]` **3.5 Session-init mechanism: method scan retired, active-extensions list introduced**

- _Outcome:_ Methods load entirely at workflow trigger (no init read). Extensions get init-time
  enumeration via single `grep -l "^active: true" .arc/system/extensions/*.md` producing the named
  active-extensions list, consulted at fire points. Architectural rationale and downstream consumer
  pattern in `notes-session-init-optimization.md § Task 3.10`.

    - `[x]` **3.5.a Define "active-extensions list" vocabulary in strategy doc**
        - `strategy-session-operations.md § Method and Extension Loading` updated: schema intro names
          two consumers (init grep for extensions; CI audit for both); methods explicitly no-init-read.
          Stale `### arc-methods.md` / `### arc-extensions.md` subsections replaced with
          `### Session-Init Consumption`.

    - `[x]` **3.5.b Session-init.md Step 2/4/6 updates**
        - Step 2: enumerate-extensions block inserted after "Resolve role" specifying the grep
          invocation, basename mapping, and empty-list short-circuit. Step 4: methods-scan removed
          (item 2 dropped, items renumbered). Step 6: include/exclude bullets reworded to the
          active-extensions list vocabulary.
        - _Imperative-citation safety pass (post-3.5.d):_ "See [Strategy] § Session-Init Consumption"
          citations removed from Step 2's enumerate block and Step 4's intro — over-literal agents
          could read them as imperative load directives. Orphaned ref-def removed.

    - `[x]` **3.5.c Fire-point directive updates (6 workflows, two-copy)**
        - 7 sites rewritten to consult the active-extensions list by name. Literal template:
          `If <extension-name> appears in the active-extensions list (established at session init),
          load and execute its .actions. Otherwise, skip.` Sites: `3_process-task-loop.md` (3),
          `prepare-commits.md` (1), `integrate-work-unit.md` (1, "Otherwise, skip this sub-step"
          variant for numbered list), `activate-work-unit.md` (1), `archive-work-unit.md` (1),
          `session-init.md` (1, "established at Step 2" self-reference). Duplicate
          "See arc-extensions.md § ..." pointer lines dropped — the directive's inline link is the
          single reference.

    - `[x]` **3.5.d READMEs update (methods + extensions)**
        - `system/methods/README.md`: Loading-model paragraph rewritten — methods always load at
          workflow trigger; `override-active` consumed by CI / docs / authoring tooling, not session-init.
          `system/extensions/README.md`: "How extensions work" + "Loading model" paragraphs rewritten to
          describe init enumeration + fire-point list-consultation.

### `[x]` **3.6 Cross-reference sweep**

- _Outcome:_ All anchor-form `arc-methods.md#anchor` / `arc-extensions.md#anchor` ref definitions
  rewritten to per-file paths across 21 files (44 ref-def lines). Path depth adjustments applied per
  file location. Additional cleanup: rewrote `integrate-work-unit.md` L150 plain-prose pointer into a
  reference-style link.

  _Deferred to 3.8 (explicit, not regression):_ Two non-anchor link-def pairs in
  `supplemental/integrate-external-content.md` and `initial-setup/03_configure-external-integration.md`
  require prose rewrites at usages — pickup at 3.8's "Verify no remaining references" step.

### `[x]` **3.7 Framework-sync + install pipeline: register per-file entries**

- _Outcome:_ 18 new per-file paths (8 methods + 8 extensions + 2 READMEs) registered in
  `manifest.json` and `init-recipe.json`. Method/extension bodies (16 paths) classified `Configurable`;
  READMEs `Framework`.

  _Design correction mid-task:_ Initially classified all 18 as Framework per as-written task wording.
  Cross-check surfaced that `packages/arc-framework/arc/system/extensions/pre-merge-review.md` shipped
  with `active: true` and a CodeRabbit `.actions` body (leak from `43e7749`'s 1.4.b–f migration).
  Configurable is the correct classification — adopter-toggleable frontmatter (`active`,
  `override-active`) and fillable sections (`.override`, `.actions`) are exactly what three-way merge
  handles. Fix: 16 paths added to `CONFIGURABLE_FILES`, 16 manifest entries flipped, leaked file
  corrected (`active: false`, placeholder body), pristine hash recomputed.

  _Leak forensics (feeds 3.13):_ Origin commit `43e7749`. Blast radius: 1 file (other 7 extensions +
  all 8 methods clean). Undetected because framework-sync skips Configurable, and Framework
  classification with byte-identical copies showed no drift. Pre-commit hooks lacked package-source
  toggle/body checks — Task 3.13 closes that gap.

### `[x]` **3.8 Retire legacy aggregate files**

- _Outcome:_ Aggregates removed atomically with no residual live references. Subtasks carved by
  concern; 3.8.a–c landed reference rewrites before 3.8.d's delete commit.

    - `[x]` **3.8.a Active hooks and integrity scripts**
        - `verify-integrity.sh` (both copies): §2 + §5 aggregate references removed; §6 (Session State)
          deleted outright (parser tightly coupled to status-file line format; redundant with
          session-init runtime validation; not worth maintaining); §7 replaced section-grep with
          per-file frontmatter enumeration (inline shell, no `npx tsx` dep — keeps the diagnostic
          self-contained for adopter contexts where the package doesn't exist). `commit-msg` CHECK 7
          loosened from `^- \*\*Next Task:\*\*` to match-anywhere `\*\*Next Task:\*\*` — tolerates list
          markers, indentation, backticks, path-prefixed values; trade-off: silently no-ops on non-ARC
          labels. New regression test `commit-msg-status-pattern.test.ts` pins the lenient form across
          five representative status-file shapes.
        - `verify-arc-integrity.md` workflow: post-modification-gate retargeted; "Methods and
          Extensions" rewrote structural-check description; "Session State" section deleted.

    - `[x]` **3.8.b Tier 1 always-loaded doc references**
        - `DEV-RULES.ARC.md` (both copies): single `[arc-methods]` ref-def replaced with 4 per-file refs
          (`-cf`, `-ccf`, `-it`, `-tf`) + `[arc-methods-dir]` for the directory link. `-qg` dropped
          (no usage in file). Six body-usage rewrites.
        - `AGENT-BRIEFING.ARC.md`, `system/skills/arc-commit/SKILL.md`, `system/arc-config.yml`:
          pointers updated to per-file paths (both copies each).

    - `[x]` **3.8.c Strategy narrative rewrites**
        - Content rewrites (not link swaps) across 7 strategy docs: `configurability-architecture` (8
          sites — mechanisms table, configurability-path bullets, agent-discovery rewrite,
          extension-points mechanism + workflow code sample, preset-vs-custom, method-overrides
          mechanism, platform-commands), `team-coordination` (integration mechanism + 4 per-file
          ref-defs), `file-classification` (template-suffix example), `workflow-authoring`
          (forward-looking framing dropped), `package-project-sync` (Configurable list — 16 per-file
          entries replace 2 aggregates; project-only), `strategy-project/README.md` (drop-zone routing;
          corrected `.steps` → `.actions`), `TECHNICAL-OVERVIEW.md` (3 sites; `.arc/`-only — template
          counterpart had no aggregate refs).

    - `[x]` **3.8.d Delete aggregates + install-pipeline cleanup + grep-verify**
        - 4 aggregate files deleted (both copies). `init-recipe.json` (L73–74), `classification.ts`
          (L87–88), `manifest.json` (L360 / L365), `pristine.json` cleanups. Unit tests updated:
          `init.test.ts:282`, `manifest/apply.test.ts:158,168`, `removal-prompts.test.ts:40` —
          replaced aggregate path fixtures with `system/methods/commit-format.md`. Deleted the
          `validate-package-neutrality` legacy-aggregate test case (in-file comment scheduled it for
          removal here).
        - Deferred-from-3.6 link-def pairs rewritten in `integrate-external-content.md` (both trees)
          and `03_configure-external-integration.md` (package-only): Steps 3a/3b now reference the
          directories with current field names (`.actions` not `.steps`); `override-active` /
          `active` toggle guidance added.
        - _Scope expansion from grep-verification (not enumerated in planning):_ 9 additional live
          operational references in 5 files surfaced post-rewrite. All rewritten — `session-init.md`
          and `session-handoff.md` (both trees, both `.template.md` and `.md`):
          `` "via [`arc-methods.md` § session-state]…" → "via the [session-state method]…" ``.
          `01_verify-and-configure.md` § Customization Beyond Config: rewrote "two additional
          customization files" narrative to per-file directories with concrete examples.
          `agent-pre-merge-review.md`: "populates the `pre-merge-review` extension point in
          [arc-extensions.md]…" → "populates the `.actions` section in the [pre-merge-review
          extension]…".
        - Full-tree grep post-cleanup returns zero hits across `.arc/`, `packages/arc-framework/arc/`,
          `src/`, `__tests__/` (with allowed-zones filter for WU artifacts, ADRs, archives, analysis,
          backlog, `.internal/`).
        - _Out of scope this WU:_ `docs/` (covered by separate docs-content-sweep WU); backlog
          plan-doc references (refresh at activation of their respective WUs).

### `[x]` **3.9 CLI test coverage — per-file restructure**

- _Outcome:_ Per-file methods/extensions layout verified across unit, integration, and E2E tiers.
  Classification matches landed three-way-merge model (per-file Configurable, READMEs Framework) — the
  planning-phase "all 18 Framework" framing was rejected on review (Framework classification
  wholesale-replaces, would obliterate adopter `.override` / `.actions`).
    - Unit (`init.test.ts`): per-file extension Configurable; READMEs Framework.
    - Integration fresh-install (`init.test.ts`, `pm.mode=none, tools=[claude]`): all 8 methods + 8
      extensions + READMEs present; manifest 16/2 split.
    - Integration legacy-no-op (`update.test.ts`): seeded legacy aggregate files left untouched and
      unregistered after `arc update` — zero-adopter state per PRD § Won't Do, no migration code.
    - Integration idempotent re-update: second run produces zero diff entries; manifest byte-identical.
    - E2E (`init.e2e.test.ts`, `reconfigure.e2e.test.ts`): init layout assertions; reconfigure
      regression — all 18 files byte-identical post-`pm.mode: none → arc-in-git`.

  _Hook cross-flow coverage — DROP as duplicate:_ CHECK 12/13/14 logic each covered by direct unit or
  integration tests; routing positive-path exercised daily by real commits; routing negative-path
  covered by 3.12's hook false-positive surface check. A synthetic stage-and-commit test would
  duplicate validator logic with infrastructure cost and no new coverage dimension.

### `[x]` **3.10 ADR-013 sanity check, PRD refresh, and finalize**

- _Outcome:_ ADR-013 amendment and PRD aligned with the landed split mechanism. Notes-file
  § Compliance-Reliability Grounding middle paragraph rewritten (Persistent Context trigger met). No
  strategy edits — `strategy-session-operations.md § Per-file Frontmatter Schema` and
  `§ Session-Init Consumption` already match landed state.

  _ADR-013 amendment 5-point check:_ (a) per-file structure verified on disk; (b) schema field names
  verified against `commit-format.md` / `diff-review.md` / `post-task-quality.md` and strategy doc;
  (c) session-init Step 2 split mechanism — stale text at L164–167 rewrote ("override scan became an
  aggregated frontmatter-only read" → asymmetric split: methods no init read; extensions enumerated
  via grep); (d) `pre-merge-review` → `diff-review` rename verified on disk; (e) CI-enforced
  reliable-trigger invariant verified (`audit-method-triggers.ts`, `lint:arc:triggers` script,
  CI workflow).

  _PRD refresh applied:_ P0.2 (legacy parenthetical dropped); P0.5 (`workflow` field dropped,
  `has-override` → `override-active`, omission rationale added); P0.6 (`has-steps` → `active`,
  `.steps` → `.actions`); P0.8 (retitled "Session-init consumption — asymmetric split", body
  rewritten); P1.13 (Step 2 / Step 4 detail tightened, imperative-citation safety pass noted);
  § Architectural Shape and § Session-Init Consumption Model bullets aligned. P0.1, P0.3, P0.7, P0.9,
  P0.10–P0.13 audited accurate as written.

### `[x]` **3.11 Link-validator hardening + stale-ref cleanups**

- _Outcome:_ Full-tree broken-link scan now yields only the expected 6 backlog cross-WU hits
  (`plan-arc-modes.md`, `plan-expanded-planning-path.md`, `plan-post-release-methodology.md`,
  `plan-work-unit-mobility.md`). Template and archive false-positives cleared structurally.
    - `validate-links.sh` (both copies): `validate_file()` early-exits for `*.template.md`,
      `template-*.md`, and any path under `reference/archive/`. 3 new integration tests.
    - ATOMIC-INBOX cleanup: removed the validator-template-skip entry (delivered).
    - BACKLOG-FEATURE.md: `plan-arc-lite.md` entry replaced with broader `plan-arc-modes.md` entry
      (Lite is now Mode 1).
    - `analysis-workflow-clarity-audit.md`: added missing `[arc-ext-post-context-load]` ref-def at
      file end (preserves historical Fix-proposal prose).

### `[x]` **3.12 Phase 3 close — Tier 3 quality gates**

- _Outcome:_ All Tier 3 gates green. Hook false-positive surface check passed: CHECK 12/13/14 path
  gates short-circuit cleanly on non-matching staged sets and fire correctly on positive mirrors.
  Full-tree link scan at expected 6-hit `backlog/feature/**` steady state.

### `[x]` **3.13 Package-source neutrality guard (follow-on from 3.7 leak discovery)**

- _Outcome:_ Pre-commit CHECK 14 blocks the exact leak pattern that reached main in `43e7749`.
  Package-source per-file methods/extensions must ship `override-active: false` / `active: false`
  frontmatter AND `[No override configured]` / `[No extension configured]` placeholder bodies; any
  deviation fails the commit with a path-and-field-specific diagnostic. `.arc/` copies silently
  skipped (local customization allowed); READMEs and legacy aggregates out of scope.
    - `validate-package-neutrality.ts`: classifies staged paths
      (`package-method` / `package-extension` / `other`), reuses `parseMethodFrontmatter` /
      `parseExtensionFrontmatter` from `lib/frontmatter/`, plus new `extractSectionBody` helper.
      Frontmatter parse failures suppress neutrality diagnostics — CHECK 12 owns schema errors.
    - Pre-commit (both copies): CHECK 14 appended after CHECK 13 with grep-filter short-circuit
      identical to CHECK 12's pattern.
    - 20 unit tests covering path classification, section-body extraction (H2-to-H2, H2-to-`---`,
      blank-line stripping, missing-header), each failure mode, `.arc/` customization pass, README +
      unrelated-path pass, frontmatter-parse-failure suppression.

  _Execution-order note:_ Pulled forward from flexible position to immediately follow 3.7 — guardrails
  protect the remaining Phase 3 sweep.

---

## **Phase 3.R:** CLI Vocabulary Alignment + Session-Init Remote-Sync

_Purpose:_ Align `arc user` / `arc sync` command vocabulary with developer muscle memory (git fetch/pull
semantics), add an `arc user status` inspection surface, and land session-init's remote-sync awareness —
absorbing Phase 5.0. The rename and workflow integration land together so Phase 4 and Phase 5 are
authored once against the final surface.

_Origin:_ Follow-on to Phase 3 close, surfaced while debugging multi-machine git-notes staleness.
`arc user pull` semantically only fetched (ref updated, disk untouched); the true `git pull`-equivalent
lived behind `arc sync --load`. No status/inspection surface existed. Session-init had no remote-sync
check. A full audit of `arc user` commands vs dev muscle-memory produced the rename plan and
demonstrated Phase 5.0 couldn't be cleanly expressed until vocabulary stabilized.

_Convention note:_ Uses phase-level `X.R` as an extension of the documented task-level `X.Y.R` revision
scheme; both documented in `strategy-task-list-formatting.md` (per 3.R.m's strategy-addendum landing).

### `[x]` **3.R.a CLI rename + test coverage**

- _Outcome:_ Added `arc user fetch` for the existing fetch-only semantic; rewired `arc user pull` to
  fetch + load (preserving `runUserLoad`'s backup behavior). Reworked `arc sync` into a direction-aware
  porcelain that inspects local-vs-remote refs + disk-vs-snapshot state, prints push/pull banner before
  acting, prompts on divergence. Removed `arc sync --load`. Coverage refreshed in `sync.test.ts`,
  `user-handlers.test.ts`, `push-recovery.test.ts`.

### `[x]` **3.R.b `arc user status` command**

- _Outcome:_ Added `arc user status` plus a command-layer inspection/formatting surface shared with
  later session-init work. Default mode probes remote notes; reports `in sync`, `remote ahead`,
  `disk ahead`, `conflict`, or `remote unavailable` with action hints (`arc user pull`, `arc user save`,
  or non-destructive `arc user fetch` inspection). `--offline` skips the remote probe; `--all`
  enumerates remote identities for maintainer inspection. Detail lines surface saved-snapshot freshness
  gaps and legacy/current pre-load backup presence without bloating the summary line. Coverage:
  result-shaping unit tests, handler wiring, integration tests for remote-ahead / offline disk-ahead /
  `--all`.

  _Design decisions:_ Informational command (exit 0 across all states, including degraded). Output
  shape: one summary line always, detail lines only when actionable. Built on a richer inspection
  contract than 3.R.a's coarse sync matrix so `status` and session-init share the underlying primitive.

### `[x]` **3.R.c Multi-snapshot backup hardening**

- _Outcome:_ `runUserLoad` writes timestamped pre-load snapshots (replacing single-shot
  `.pre-load-backup.json` writes), retains the latest 3 immediately after each new write, leaves any
  existing legacy backup file in place for transition visibility. `arc user status` discovery surfaces
  timestamped snapshots newest-first; stale-file warnings point at the specific snapshot created during
  the load. Integration coverage: timestamped creation, retention pruning on the fourth snapshot,
  legacy coexistence, dotfile exclusion, status-surface backup reporting.

  _Design decisions:_ Retention hardcoded at 3 (no new config key this phase). Pruning runs immediately
  after each new snapshot. Legacy file remains readable during transition; new pulls write only the
  timestamped form.

### `[x]` **3.R.d `session.remote_sync` config addition**

- _Outcome:_ Added `session.remote_sync: enabled` to both `arc-config.yml` copies under a new Session
  Initialization section with inline comments — session-init may probe remote notes automatically while
  restoring user-directory content to disk remains user-confirmed. Init integration coverage asserts
  the default key renders for both solo and team-mode installs. No runtime consumer yet — 3.R.e is the
  first behavioral task.

### `[x]` **3.R.e Session-init remote-sync integration**

- _Outcome:_ Session-init/runtime pieces for remote-sync awareness landed across two subtasks: probe
  and orientation surface (3.R.e.1), then ancestor-walk hardening to remove the fragile default-walk
  failure mode (3.R.e.2).

    - `[x]` **3.R.e.1 Session-init remote fetch + divergence orientation**
        - Added `arc user status --session-init`: respects `session.remote_sync`, performs the existing
          temp-ref remote probe without mutating live refs or disk, reports coarse session-init states
          (`disabled`, `clean`, `remote-ahead`, `conflict`, `remote-unavailable`) plus an
          agent-should-prompt-to-pull flag. Step 1.5 documented in both session-init workflow copies —
          probe runs, agent incorporates result into orientation, prompt stays in the harness layer
          (not inside the CLI).
        - _Design decisions:_ Direct git fetch/probe steps, not a subprocess to `arc user fetch`.
          Remote inspection fetches into a temp ref for comparison rather than mutating the live local
          ref before confirmation. Orientation reports coarse states, not precise ahead/behind counts.
          Resolution prompt separate from the standard `Proceed?` prompt.

    - `[x]` **3.R.e.2 Ancestor-walk hardening for `arc user load` / `arc user pull`**
        - Removed the default `maxAncestorWalk: 20` false negative — nearest-note lookup now scans all
          reachable ancestors unless an explicit cap is passed. `runUserLoad` records how far back the
          loaded note was found; load summaries surface that distance so a far-back reachable note is
          distinguished from the true no-note case. Load/pull/sync handler copy updated from "recent
          ancestors" to "any reachable ancestor" — null path only claims what was actually checked.

### `[x]` **3.R.f Hook invocation fix for non-executable shell scripts**

- _Outcome:_ CHECK 13 in both pre-commit hook copies invokes `validate-links.sh` through `bash`,
  removing the nested-script executable-bit dependency that fails on fresh clones (tracked `.sh` files
  land without `+x`). Unit regression coverage locks in the bash-prefixed invocation and asserts no
  remaining hook directly executes nested `.sh` files. Top-level hook executability remains the
  existing install-time / hook-manager contract.

### `[x]` **3.R.g Documentation + ADR sync (runs after 3.R.m and 3.R.f)**

- _Outcome:_ Synced shipped doc surfaces to the finalized portability model. Session-handoff names the
  merge-recovery label and `arc sync --yes`. Session-operations documents the fetch/pull split plus
  direction-aware `arc sync`. Team-coordination bootstrap fetches another developer's notes before
  loading. QUICK-REFERENCE adds `arc user fetch`, `--yes`, `--max-walk`. `user/README.md` reflects the
  same surface. Single-copy: ADR-012 amendment added; public docs drift routed through
  `plan-docs-content-sweep.md`; `plan-arc-modes.md` updated to shipped tracked-mode semantics; old
  Phase 5.0 pointer retired as superseded.

    - `[x]` **3.R.g.1 Two-copy doc sync for remaining CLI references**
        - Updated both-copy references in `session-handoff.md` (+ `.template.md`),
          `strategy-session-operations.md`, `strategy-team-coordination.md`, `QUICK-REFERENCE.md` (+
          `.template.md`), `user/README.md`. Replaced stale `arc sync --load`. Person-to-person
          bootstrap switched from `arc user pull --identity` to `arc user fetch --identity` (avoids
          implicit overwrite). Second-pass additions swept in: probe commands (`extensions status`,
          `active status`, composite `status --session-init --json`); vocabulary (`disk ahead` →
          `local unsaved`; canonical `conflict` over `divergence`); merge-recovery label; `--yes` /
          `--max-walk` flags. Grep-verified zero stale command references in `.arc/**` and
          `packages/arc-framework/arc/**` (excluding `reference/archive/**` and `reference/analysis/**`).

    - `[x]` **3.R.g.2 Single-copy backlog/docs-sweep routing + ADR-012 amendment + Phase 5.0 retirement**
        - Single-copy artifacts updated: `plan-arc-modes.md`, `plan-docs-content-sweep.md`, ADR-012.
          Public `docs/**` drift captured in `plan-docs-content-sweep.md` rather than edited directly
          (touch points: `docs/the-framework.md`, `docs/reference/team-coordination.md`,
          `docs/index.md`, `docs/faq.md`).
        - ADR-012 amendment appended (preserving original decision body): first-pass summary
          (`pull → fetch`, `pull = fetch + load`, direction-aware `sync`, durable 2×2 sync-state
          matrix); second-pass additions (composite/status probes shipped, vocabulary rename,
          merge-recovery, bounded ancestor walk + `--max-walk`, confirmation-by-default + `--yes`).
          QUICK-REFERENCE points at the amendment for durable semantics context.
          `reference/archive/**` and `reference/analysis/**` left untouched as historical record.

**Second Pass — Post-Review Remediation**

_Purpose:_ Address findings from the post-implementation review of 3.R.a–h. Four groupings: safety
behaviors (user-visible correctness on destructive paths), vocabulary + reporting (CLI output matches
mental models), probe-pattern extension (consistent coverage across extensions / methods /
active-status, not a one-off), and structural cleanup + test coverage (the integration gap that let
silent-discard slip past unit tests).

_Origin:_ `/arc-task-review` on 3.R.a–h surfaced three warrants-discussion items (non-TTY conflict
exits silently, push-recovery "pull first" discards just-saved note, sync pull path skips overwrite
confirm) plus smaller quality concerns. External research (shallow-clone conventions, Gerrit prior art)
fed the ancestor-walk strategy. Probe-pattern extension added to this pass — first-pass 3.R.e.1 surface
proved clean enough that inconsistency across the three remaining session-init discovery points is the
bigger risk.

### `[x]` **3.R.i Safety behaviors**

- _Goal:_ Every user-visible destructive path confirms by default, degrades gracefully in non-TTY,
  never silently discards saved state, and surfaces actionable diagnostics when bounded operations hit
  their cap.

    - `[x]` **3.R.i.a Non-TTY conflict + failure hardening**
        - `handleConflict` (`sync.ts`) non-TTY branch calls `degradeConflictToSaveOnly` — saves the
          user directory, emits two warn-level banners ("conflict", "degrading to save-only"), outros
          clean without exit 1. Matches the `prompt` policy degradation shape.
        - `pushWithInteractiveRecovery` non-TTY divergence branch returns
          `{ kind: "failed-nontty-conflict" }` (added to `PushResult` discriminated union). Both
          `handlePushDirection` and `handleUserPush` grew matching arms rendering the "local save
          preserved; push skipped" banner with re-run hint and `exitCode = 1`.
        - Tests: `push-recovery.test.ts`, `sync.test.ts` (new non-TTY conflict-degradation describe
          block), `user-handlers.test.ts` (`isNonInteractiveEnvironment` converted to mockable toggle).

    - `[x]` **3.R.i.b Push-recovery merge redesign**
        - Replaced silent-discard "Pull first (overwrite local with remote)" with a merge flow:
          force-fetch aligns the local notes ref with remote, `runUserSave` writes current disk state
          on top of the new base, aligned state is pushed. Select label now reads `"Merge: rebase my
          save onto remote, then push"`.
        - `PushResult` discriminant: `via: "merge"` replaces `via: "pull-then-push"` entirely.
          `pushWithInteractiveRecovery` now requires `cwd: string` as a third arg. Both callers
          updated. Recovery errors (including `UserSaveError` during re-save) flow through the
          existing outer try/catch — no partial push on save failure.

    - `[x]` **3.R.i.c Confirmation defaults + `--yes` flag**
        - `handlePullDirection` (sync.ts) runs the overwrite confirm when `hasLocalNotes` is true,
          matching `arc user pull`. The conflict-select pull path passes `yes: true` through a shared
          `DirectionParams` type so the user isn't double-confirmed.
        - Added `-y, --yes` to `arc sync`, `arc user pull`, `arc user fetch`, `arc user load`. Handler
          option types extended. `handleUserLoad` accepts `yes` preemptively (no confirm exists there
          yet — wired for future consistency).
        - Standard prompt copy hoisted to `OVERWRITE_CONFIRM_MESSAGE` constant (sync.ts + user.ts).
          Non-TTY skips overwrite confirm via shared `shouldSkipOverwriteConfirm` helper. Loud
          failures from 3.R.i.a unaffected — those run before this confirm.

    - `[x]` **3.R.i.d Ancestor-walk cap + diagnostic**
        - Replaced uncapped rev-list walk with a bounded default
          (`DEFAULT_MAX_ANCESTOR_WALK = 1000`) plus explicit `--max-walk <n>` override on
          `arc user load`, `arc user pull`, `arc sync`. Cap-hit-without-finding-a-note surfaces via
          new `onWalkExhausted(walked, maxWalk)` callback, rendering the canonical diagnostic
          (`"walked N ancestors without finding a note; use --max-walk to search deeper or confirm
          remote state with arc user status"`).
        - `findNearestUserNote` returns structured `NearestNoteSearch`
          (`{ note, walked, maxWalk, capped }`) instead of `NearestUserNote | null`.
          `buildLoadSummary` replaces `"Note: loaded from a reachable ancestor N commit(s) behind
          HEAD."` with `"Loaded from N commit(s) back."` (emitted only when `ancestorDistance > 0`).
        - `handleUserLoad` sets `process.exitCode = 1` on walk-exhausted (post-review follow-on) to
          match `handleUserPull` and `handlePullDirection`. Walk-exhausted is ambiguous and deserves
          the failure signal across all three commands; plain "no note found" stays exit 0.
        - _Implementation note:_ `let walkExhausted` triggered `no-unnecessary-condition` (TS doesn't
          see callback-side mutation). Refactored to
          `const walkState: { capture: … | null } = { capture: null }` in all three handler sites —
          object wrapper keeps narrowing intact.

### `[x]` **3.R.j Vocabulary + reporting**

- _Goal:_ CLI output matches user mental models without code-level translation. Single canonical terms
  across layers. Reporting surfaces enough context for cold-open reading.

    - `[x]` **3.R.j.a Status vocabulary rename + detail enrichment**
        - `disk ahead` → `local unsaved` across `UserStatusHeadline` union,
          `determineUserStatusHeadline` / `determineUserStatusAction` branches, all consuming tests.
          Cold-open audit of other headlines (`in sync`, `remote ahead`, `conflict`,
          `remote unavailable`) — all pass; no further renames. Canonical vocabulary documented in
          JSDoc on `UserStatusHeadline`.
        - `UserStatusResult` gained `ancestorDistance`, `savedAtRelative`, `unsavedDirection` (with
          `UserUnsavedDirection = "edits" | "missing" | "mixed"`). `buildUserStatusResult` renders
          three new detail lines when present: direction hint (only when headline is `local unsaved`);
          save timestamp (`"Saved 11 hours ago."`); ancestor distance (`"Saved snapshot is from
          abc1234, N commit(s) back."`).
        - New `commands/user/relative-time.ts` exporting `formatRelativeTime` (seconds → minutes →
          hours → days, singular/plural, future-date clamping). `inspectDiskVsLocalSnapshot`
          refactored to return `DiskVsSnapshotInspection { state, direction }`; `computeUnsavedDirection`
          helper exported via `user.ts` barrel.

    - `[x]` **3.R.j.b `conflict` vs `divergence` canonical language**
        - Canonicalized `conflict` as the user-facing term for "refs both moved from common ancestor."
          Presentation-mapping JSDoc on `UserSyncRefState` flags the `diverged` variant as
          code-level-only, pointing at `UserStatusHeadline` for canonical vocabulary.
        - Swept user-facing strings: `pushWithInteractiveRecovery` "Push rejected — remote has
          diverged" → "Push rejected — local and remote notes conflict (both moved since common
          ancestor)"; same phrasing in `handleConflict` and the session-init conflict detail.
          `cli.ts --force` help text and `UserPushOptions.force` / `UserFetchOptions.force` JSDoc
          updated.
        - Internal helper `isDivergentPushError` retained — names the git-level topology, matches
          `UserSyncRefState.diverged` kept-for-code-clarity principle. `UserUnsavedDirection` JSDoc
          moved off "divergence" to "mismatch" (different semantic domain). Doc touch:
          `session-handoff.md § Save to Git Notes` rewrote with conflict vocabulary and folded in the
          stale "pull-first" reference (no such option exists; replaced with merge description).

    - `[x]` **3.R.j.c Label + spinner + summary consistency**
        - Unified pull-direction result-box label "Loaded" → "Pulled" so spinner ("Pulling") → stop
          ("Pull complete.") → note ("Pulled") read as one verb. `arc user load` keeps "Loaded"
          (matches its outer command). Verb-tense audit found all other labels already consistent.
          Convention documented in `runWithSpinner` JSDoc: present-continuous in-progress,
          completed-adjective for done, past-tense for `p.note` matching the outer command verb.
        - Split `determineUserStatusAction` to branch on `diskState` for the `local unsaved` headline:
          `diskState === "different"` → "run `arc user save`"; `diskState === "same"` (implies
          `refState === "local-ahead"`) → "run `arc user push` (or `arc sync`)". `refState`
          deliberately kept out of signature — diskState alone is sufficient given headline derivation.
        - Doc touch in `session-handoff.md`: new paragraph directs the agent to check `arc sync` exit
          code and report the outcome in end-of-session summary, closing the "work didn't land but
          user thought it did" gap flagged in review.

### `[x]` **3.R.k Command surface cleanup + probe-pattern extension**

- _Outcome:_ Three individual probes (extensions, active, config) plus composite `arc status` that
  orchestrates them alongside retrofitted `arc user status`. Session-init calls the composite once
  instead of four separate probes; individuals remain available standalone.

  _Design decisions:_
    - Wire format hybrid: `--session-init` is scope (filtered state); `--json` is format
      (machine-parseable). Orthogonal and composable. Default = human-readable Clack. `arc user
      status --session-init` retrofit accepts `--json` in the same pass — no asymmetric first-mover.
    - Composite at `arc status`: rename `arc status` → `arc health` (3.R.k.a) frees the name; freed
      slot hosts a composite that fans out via `Promise.all` over the four probes and emits a unified
      result.
    - No methods probe — methods load at workflow trigger, not init. Dropped from original 3.R.k
      scope.
    - Shared lib `lib/extensions/{point-scanner,orphan-detector}.ts` serves both the extensions
      probe's `--all` mode and Task 4.6 (D7b pre-commit hook).
    - `arc-config` probe added mid-WU: `arc-config.yml` is ~85% inline comments; agent consumes
      key-value pairs only. Probe (`arc config status`, 3.R.k.c) emits typed settings as JSON; full
      scope returns all agent-consumable settings, `--session-init` narrows to init-gating fields.
      `hooks.*` excluded entirely (shell-consumed by hooks, never read by agent).
    - Session-init ordering review (3.R.k.g) runs last — current Step 1.5 ("Sync Remote State")
      precedes Step 2 but references "After Batch 1 resolves `{identity}`" (Batch 1 fires inside
      Step 2). Reorder restructures against final command surface.
    - `arc active` naming holds: `.arc/active/` houses WUs as bundles of co-named files; `arc active
      status` parallels `arc user status` (sync state of the user bundle). Directory and command
      agree.
    - `arc status` rename hosted here, not in ARCd Rebrand — motivation is `/arc-status` skill
      collision + status-command-means-work-state hygiene; both belong with session-init orientation
      work, not binary rebrand. Transplanted from ARCd Rebrand Task 1.5.
    - `arc version` subcommand stays in ARCd Rebrand (rebrand-era idiomatic alignment with
      `arcd version`).

  _Scope note:_ `arc hooks status` out of scope — session-init doesn't discover hook state at init.
  Worth a future WU if needed; landing site is the composite.

    - `[x]` **3.R.k.a `arc status` → `arc health` rename (command surface cleanup)**
        - Pure rename freeing `arc status` for the composite probe. Source + tests renamed via
          `git mv` (status.ts → health.ts; status.test.ts → health.test.ts; status-diff.test.ts →
          health-diff.test.ts; status-diff.e2e.test.ts → health-diff.e2e.test.ts). Identifier
          renames: `runStatus` → `runHealth`, `buildStatusSummary` → `buildHealthSummary`,
          `StatusResult` → `HealthResult`, `StatusIOContext` → `HealthIOContext`, `StatusOptions` →
          `HealthOptions`, `handleStatus` → `handleHealth`, `makeStatusIO` → `makeHealthIO`.
          `FileState` / `FileStatus` preserved per task spec (per-file state, not command identity).
        - CLI binding `.command("status")` → `.command("health")`; description updated.
          `manifestMissingError("status")` → `manifestMissingError("health")` (user-facing
          `The health command requires...` error text). Doc sweep touched only test-side files +
          `errors.ts` JSDoc + `strategy-testing-methodology.md`. QUICK-REFERENCE never referenced
          `arc status`.
        - Cross-WU refs in `.arc/active/` notes/tasks and `.arc/backlog/` files intentionally left
          intact (they describe the rename itself or ARCd Rebrand WU coordination).
        - _Transplanted from:_ ARCd Rebrand Task 1.5 (subtasks .a, .b, .c, .e, .f); .d
          (`arcd version`) stays in rebrand WU.

    - `[x]` **3.R.k.b `arc extensions status` probe + shared lib + `arc user status --json` retrofit**
        - Shared lib at `src/lib/extensions/{point-scanner,orphan-detector}.ts`. Scanner recognizes
          the single anchor form (middle-dot + backtick-delimited hashtag marker) — no separate
          patterns needed since the anchor uniquely disambiguates extension-point markers from other
          inline-code mentions. Detector returns resolved + orphan buckets at reference-level
          granularity.
        - Command at `src/commands/extensions/`; handler at `src/handlers/extensions.ts`; CLI in
          `src/cli.ts`. Flag matrix: default Clack renders counts + active/inactive lists + orphan
          count; `--all` adds orphan detail entries; `--session-init` narrows to active-list (skips
          workflow walk); `--json` emits typed results via `mode` discriminated union.
          `--session-init --json` and `--all --json` combinations both valid.
        - User-status retrofit: `--json` flag suppresses Clack intro/outro/note and writes JSON to
          stdout; works across all three existing scopes (default, `--offline`, `--session-init`).
        - Probe uses `fs/promises` directly — no IO injection, since scanners/formatter are pure and
          unit-tested and the fs side is covered by integration. Malformed extension frontmatter
          surfaces a warning and still resolves refs by basename so parse errors don't cascade into
          orphan noise.
        - End-to-end sanity: session-init probe emits `{"active":["pre-merge-review"]}` (matches
          current grep output); `--all` probe surfaces one pre-existing orphan
          (`pre-merge-inbox-review` at `integrate-work-unit.md:166`) — content issue for Phase 3
          sweep, not this task.

    - `[x]` **3.R.k.c `arc config status` probe**
        - Probe at `src/commands/config/`; shared reader at `src/lib/config/status-reader.ts`. CLI
          wired as `arc config status [--session-init] [--json]`. Full mode: 13 agent-consumable
          settings (everything except `hooks.*`, shell-only). `--session-init` narrows to 5-key
          init-gating subset (`session.remote_sync`, `branch.protection`, `pm.mode`, `commit.format`,
          `commit.context_footer`). Both expose `defaultsApplied` (keys where on-disk value was
          absent and a default was substituted) and `errors` (file-access diagnostics).
        - `readConfigSettings(cwd)` generalizes the narrow readers in `handlers/shared.ts` into a
          single settings-map read with defaults applied. `AGENT_CONSUMABLE_KEYS` exported list of 13
          keys excluding `hooks.*`. Layout migration: `src/lib/config.ts` → `src/lib/config/index.ts`
          (8 import-path updates).
        - _Deferred to 3.R.l.b:_ `readPmMode` / `readSessionRemoteSyncEnabled` stay in
          `handlers/shared.ts` for now — still consumed by `handlers/user.ts` (×2) and
          `handlers/join.ts`. 3.R.l.b updated mid-implementation to retire both readers in favor of
          `readConfigSettings` (supersedes the earlier "relocate to `lib/config-readers.ts`" plan;
          relocation is moot once the generalized reader already lives in `lib/config/`).

    - `[x]` **3.R.k.d `arc active status` probe**
        - Reader `readActiveStatusCandidates(cwd)` at `src/lib/active/status-reader.ts` scans
          `.arc/active/`, detects layout (Lite when `.arc/active/status.md` exists; Full otherwise,
          enumerating `.arc/active/*/status-*.md`), parses Branch / State / Next Task / Task List
          per candidate. Exported `parseStatusFile(content)` returns
          `{ branch, state, nextTask, taskList }` nullable — tolerant of list-bullet and bare
          `**Field:** value` forms, blockquote prefixes, inline backticks; first match on repeats;
          `null` for absent or empty values.
        - Probe runners `runActiveStatus` (full enumeration) and `runActiveSessionInitStatus`
          (session-init resolution shaping). Session-init applies a thin none/single/multiple
          discriminant — zero-file → `resolution: "none"`; one-file → `resolution: "single"`;
          many-file → `resolution: "multiple"` with candidate list. Probe does not apply Step 2
          Item 8's SESSION-NOTES/branch/state precedence — SESSION-NOTES lives in identity-scoped
          user workspace and remains an agent-side concern.
        - Types: `ActiveStatusResult` and `ActiveSessionInitResult` form a `mode`-discriminated
          union; `ActiveSessionInitResolution` is `"none" | "single" | "multiple"`.
          `StatusFileCandidate` carries `{ path, filename, branch, state, nextTask, taskList }` with
          paths normalized forward-slash relative to cwd.

    - `[x]` **3.R.k.e Composite `arc status` command**
        - Orchestrator `runStatus` / `runSessionInitStatus` at `src/commands/status/run.ts` fans out
          via `Promise.all` over four injected probe slots (`user`, `extensions`, `config`,
          `active`), wrapping each probe's resolution or rejection into a typed `Probe<T>` union
          (`{ ok: true; value } | { ok: false; error: { kind: "identity-missing" | "runtime";
          message } }`). Rejections never bubble — composite always resolves with a typed envelope;
          `process.exit` stays untouched.
        - User-slot short-circuit: when `identity === null`, the slot resolves synchronously to
          `identity-missing` without invoking the user probe (user notes are identity-scoped per
          session-init.md Step 1.5).
        - `StatusProbes` / `SessionInitProbes` interfaces bind cwd and I/O at construction so
          orchestrator sees simple `() => Promise<T>` functions — enables trivial test mocking
          without `vi.mock`. Identity resolution: two parallel `git config --get` reads through
          `gitConfigGet`; empty/whitespace normalize to `null` via exported `normalizeGitConfigValue`.
        - Format `buildStatusSummary` / `buildSessionInitStatusSummary` renders five stably-ordered
          sections (Identity, User, Extensions, Config, Active). Each slot delegates to the probe's
          own `build*Summary` formatter on ok; errored slots render `(unavailable) <message>` so one
          probe's failure doesn't obscure others.
        - End-to-end sanity: `npx arc status --session-init --json` returns the five-slot envelope
          with `identity: { identity, role }` and per-slot `ok:true` results.

    - `[x]` **3.R.k.f Session-init workflow integration + strategy pointer**
        - _Completed in tandem with 3.R.k.g:_ `.f` content change without `.g`'s ordering pass
          leaves Step 1.5's "After Batch 1" prose more broken, not less.
        - Session-init calls one composite (`arc status --session-init --json`) instead of
          orchestrating four probes. Probe table in Step 2 documents the five-slot envelope. Item 8
          many-file disambiguation now sources candidates from `active.value.candidates`. Direct
          `arc-config.yml` read retired — `config.value.settings` exposes the session-relevant
          whitelist; `platform.type` and custom commit patterns drop out of init.
        - Probe-failure fallback added (not in original scope) — keeps session-init survivable on a
          fresh clone pre-build. `strategy-session-operations.md § Context Loading Model` picks up a
          new **Probe pattern** subsection (non-destructive, harness-first, composite-first,
          `Promise.all` fan-out, future-composite extension slot); § Session-Init Consumption aligned
          to "session-init consumes from the composite" framing.

    - `[x]` **3.R.k.g Session-init ordering review + workflow reorder**
        - _Completed in tandem with 3.R.k.f._
        - _Linear 8-step ordering delivered:_ 1. Verify Environment · 2. Probe ARC Domain · 3.
          Conditional Sync Pull · 4. Load Context Documents · 5. Post-Context-Load Extensions · 6.
          Assess Readiness · 7. Confirm Orientation · 8. If Context Seems Mismatched. Dependencies
          explicit; no "Step 1.5 actually fires after Batch 1" derived ordering.
        - Stale-SESSION-NOTES race closed: Step 3 (Conditional Sync Pull) fires between probe and
          context-doc loading — any pull happens before SESSION-NOTES reads.
        - _Design adjustments during implementation:_ Standalone "Check Active Configuration" step
          retired (was pre-restructure Step 4); config consumption folded into Step 2 as "carry
          config forward as behavioral awareness"; platform / custom-commit paragraphs removed
          (consumed at the workflow that needs them). "Batch 1 / Batch 2" naming dropped — artifact
          of four-probe orchestration no longer useful; Step 4's "Parallelism" paragraph names the
          parallel-load group + status-file serialization explicitly.
        - _Post-implementation review follow-ons (same commit):_ Step 1 trimmed to `pwd` only —
          runtime comment block was template scaffolding never customized. Step 2 self-hosting-prefix
          comment retired — template shows plain `arc ...`; rendered `.arc/` copy shows literal
          `npx arc ...`. Broader init-time content audit (Contributor Session Path, Trust Hierarchy,
          Load Errors, probe fallback) captured as Task 5.8.d.
        - Downstream step-number references scanned: ADR-013 + `analysis/`, `archive/`,
          non-activated `backlog/plan-arc-modes.md` only hits. ADRs stable once accepted;
          archive/analysis historical; plan-arc-modes staleness already flagged in SESSION-NOTES
          persistent context. No live workflow references needed updating.

### `[x]` **3.R.l Structural cleanup + test coverage**

- _Goal:_ Close review-surfaced code quality items; close the integration coverage gap that let
  push-recovery's silent-discard slip past unit tests.

    - `[x]` **3.R.l.a `findNearestUserNote` cleanup**
        - Extracted the rev-list ancestor scan into `walkAncestorsForNote`, leaving
          `findNearestUserNote` responsible for note-discovery orchestration and cap/result shaping.
          Removed the dead branch in the walk loop while preserving walk-count semantics. Pure
          cleanup; targeted unit suite stays green.

    - `[x]` **3.R.l.b Module relocation + narrow-reader retirement**
        - Moved `runUserPush`, `hasRemoteNotes`, `hasLocalNotes`, `runUserFetch`, `runUserPull` into
          new `commands/user/push-fetch.ts`; `sync-status.ts` keeps only sync inspection/status
          shaping. `commands/user.ts` facade re-exports the moved primitives so the public command
          surface stays unchanged.
        - Retired `readPmMode` and `readSessionRemoteSyncEnabled` from `handlers/shared.ts`.
          `handlers/user.ts`, `handlers/join.ts`, and the still-live session-init path in
          `handlers/status.ts` now read `readConfigSettings()` and derive `pm.mode` /
          `session.remote_sync` from the returned settings map.

    - `[x]` **3.R.l.c Integration test for `arc sync` → conflict → merge recovery**
        - Real git-notes integration case in `__tests__/integration/user.test.ts` drives the merge
          recovery path end-to-end via `pushWithInteractiveRecovery(..., "merge")`: local save/push
          → clone force-push diverged remote notes → local save diverges → ordinary push rejects →
          merge recovery force-fetches remote, re-saves local disk state on top, pushes combined
          ref. Assertions cover the bug's failure mode directly: local disk still contains the
          user's latest notes; recovered local ref is descendant of pre-recovery remote base; remote
          ref equals recovered local ref after push.
        - _Surfaced regression:_ `sync-status.ts` still referenced `notesRef` in detailed ref
          inspection after the 3.R.l.b module split. Restored the import.

    - `[x]` **3.R.l.d Refactor `runUserLoad` walk-exhausted surface from callback to discriminated union**
        - `UserLoadOptions` / `UserPullOptions` no longer expose `onWalkExhausted`. Command layer
          exports `UserLoadOutcome = UserLoadResult | UserLoadWalkExhausted`
          (`UserLoadResult.kind = "loaded"` and
          `{ kind: "walk-exhausted", walked, maxWalk }`). `runUserLoad`, `runUserPull`,
          `handleUserLoad`, `handleUserPull`, `handlePullDirection` branch directly on the
          discriminated outcome instead of callback-mutation side state. `null` reserved for the
          unambiguous "no notes exist" case. Tests narrow on `kind`; shallow-clone cap-hit path now
          asserts the explicit `walk-exhausted` outcome.

    - `[x]` **3.R.l.e `resolveArcRoot` — cwd walk-up for CLI commands touching `.arc/`**
        - Added `resolveArcRoot(startDir = process.cwd())` to `lib/paths.ts` plus handler-level
          `requireArcProjectRoot` guard emitting the canonical
          `"Not inside an ARC project (no .arc/ directory found walking up from cwd)."` error when
          no `.arc/` directory is reachable. Wired the resolved root through every current handler
          that reads or writes project `.arc/` state. Fresh `arc init` still uses literal cwd by
          design. Coverage: unit (cwd hit, one/two-level walk-up, null, root boundary, explicit
          `startDir`) + e2e regression (`arc user status --offline --json` from nested subdirectory
          matches repo-root result).
        - _Risk flags:_ Symlinks — walk path as-is without `fs.realpathSync`, matching git's default
          behavior. Monorepos with nested `.arc/` (unlikely): first found wins; nested ARC projects
          out of scope.

    - `[x]` **3.R.l.f Sandbox-aware remote-probe degradation + session-init recovery path**
        - `inspectUserSyncRefsDetailed` now starts with `git ls-remote` and only falls back to
          temp-ref fetch + ancestry checks when both local and remote refs exist with different
          hashes. Easy cases (remote missing, remote present with same hash, remote-only ref) no
          longer need fetch/write access. Ancestry-fallback-blocked-after-remote-visibility-succeeds
          keeps the existing `remote-unavailable` state to avoid widening the type surface;
          session-init messaging distinguishes "remote unreachable" from "comparison blocked in this
          environment" and offers local-continuation vs retry path.

            - `[x]` **3.R.l.f.1 Probe path split: read-only remote visibility before fetch fallback**
                - `inspectUserSyncRefsDetailed` probes `git ls-remote origin refs/notes/...` before
                  any fetch, resolving easy cases without temp-ref bookkeeping or
                  `.git/FETCH_HEAD` writes. Temp-ref fetch + `merge-base --is-ancestor` remain only
                  for the ambiguous both-sides-exist / hashes-differ case. Fetch failure after
                  successful read-only visibility stays in the pragmatic `remote-unavailable` bucket.

            - `[x]` **3.R.l.f.2 Session-init workflow recovery branch for sandbox-limited environments**
                - Both session-init workflow copies branch on probe wording: retry once remote is
                  reachable, or continue locally / retry in a remote-capable environment when
                  fetch/write is blocked. Status copy distinguishes unreachable-remote wording from
                  limited-comparison wording so it doesn't read like actual note divergence.

            - `[x]` **3.R.l.f.3 Tests and documentation**
                - Unit coverage for read-only remote-probe path and fetch-blocked
                  "continue-locally-or-retry-elsewhere" session-init shaping. Sandbox-specific exec
                  denial case unit-only — current integration harness exercises real git note flows
                  but cannot reliably simulate network-policy / `.git/FETCH_HEAD` write denial.

### `[x]` **3.R.m Second-pass close — quality gates + Phase 3.R-wide content**

- _Outcome:_ Phase 3.R close green. Three stale pre-init E2E expectations updated to match the current
  root-walk guard copy (`Not inside an ARC project ...`) used by update/health/join before any
  command-specific install check. Retired 3.R.h addendum landed in both
  `strategy-task-list-formatting.md` copies: revision numbering now documents both subtask-level
  `X.Y.R` and phase-level `X.R` follow-ons; old `3.1.R.1` / `3.1.R.2` examples tightened to
  `3.1.R.a` / `3.1.R.b`.

  _Local smoke (throwaway repos via `npx --prefix /home/andrew/dev/arc-framework arc ...`):_
  `user add/save/load/fetch/pull/push/status/sync`, `extensions status`, `active status`, composite
  `status --session-init --json` all exercised; `user status --offline` surfaces expected `local
  unsaved` headline + save-timestamp + ancestor-distance lines; `user load --max-walk 1` emits the
  cap-hit diagnostic; `--max-walk 5` loads from two commits back. `arc methods status` not a live CLI
  surface (task bullet stale; verified absent rather than smoked). For merge recovery, deterministic
  interactive divergent-notes scenario drove `pushWithInteractiveRecovery` through the `merge` choice
  end-to-end (fetch remote, re-save local disk on top, push combined ref) — same path `arc sync` uses
  once it reaches the push branch. Sync-specific race from inspection-to-push not stable enough for
  manual smoke.

  _Next action (after close):_ 3.R.f → 3.R.g → Phase 3.R archive + begin Phase 4.1.

### `[x]` **3.R.n Post-close portability semantics refinement**

- _Origin:_ Real cross-machine resume validation post-Phase-3.R-close surfaced that `arc user status`
  still collapsed remote-note sync state and on-disk hydration state into a single `local unsaved`
  bucket, potentially pointing users toward `arc user save` when the correct recovery was `arc user
  load`.

- _Outcome:_ `arc user status` and `arc sync` now share an explicit two-axis model: remote saved-note
  relation (`in sync`, `local ahead`, `remote ahead`, `conflict`, `remote unavailable`) and disk
  relation (`current`, `stale`, `local unsaved`, `mixed`). User-facing headlines surface the dominant
  actionable state (`up to date`, `disk stale`, `local ahead`) with explicit `Remote:` and `Disk:`
  detail lines. `arc sync` consumes the same model to choose among push / pull / load / push-load /
  conflict paths.

    - `[x]` **3.R.n.1 Shared domain model + status vocabulary split**
        - Added shared `UserRemoteStatus` / `UserDiskStatus` state in user-sync types so status and
          sync derive behavior from the same model. Replaced overloaded `local unsaved` top-line in
          stale-disk case with dominant-state headline model + explicit `Remote:` / `Disk:` detail
          lines.

    - `[x]` **3.R.n.2 `arc sync` porcelain alignment**
        - Reworked `arc sync` to consume the shared remote/disk model. Stale-disk cases restore the
          saved note locally via `load`; local-note-ahead + stale-disk takes a `push-load` path;
          only true unsaved local content defaults to save/push. Rebuilt and smoke-tested the real
          CLI to confirm shipped output matches new semantics.

    - `[x]` **3.R.n.3 Coverage updates**
        - Expanded unit + integration coverage across `user-status`, `sync`, composite status
          formatting to pin new vocabulary, detail lines, action matrix.

### `[x]` **3.R.o User-internal metadata layout cleanup**

- _Origin:_ Follow-on from 3.R.n. New local-only sync provenance file solved stale-vs-unsaved
  ambiguity, but together with rotating pre-load backups it increased root-level clutter under
  `user/{identity}/`. Usability issue is signaling, not behavior — user-authored working files should
  be visually distinct from ARC-managed local bookkeeping.

- _Outcome:_ Local-only user metadata writes to `user/{identity}/.internal/`, matching the framework's
  existing `system/.internal/` convention. New writes land in `.internal/`; reads remain
  backward-compatible with legacy root-level files so existing clones upgrade in place without a
  migration step. Status output continues to show backup basenames rather than leaking storage
  layout details.

    - `[x]` **3.R.o.1 Move local-only portability metadata into `.internal/`**
        - Moved local sync provenance file and new pre-load backup writes under
          `user/{identity}/.internal/`. User-dir portability contract preserved — dot-directories
          already excluded from serialization, so local-only files remain unsynced without
          additional manifest rules.

    - `[x]` **3.R.o.2 Backward-compatible reads + retention**
        - `readLocalSyncState` checks `.internal/` first and falls back to legacy root-level path.
          Backup listing reads both `.internal/` and legacy root-level files; timestamped retention
          prunes only the new `.internal/` location so older root files remain readable without
          forcing a migration.

    - `[x]` **3.R.o.3 Coverage + task-state updates**
        - Updated integration coverage for `.internal/` backup/provenance paths; kept existing
          legacy-root backup case as compatibility coverage.

### `[x]` **3.R.p Git-note terminology pass for status/sync UX**

- _Origin:_ After 3.R.n, the split between remote-note state and working-file state was clearer, but
  the new phrasing still mixed abstractions (`saved snapshot`, `disk stale`) that read awkwardly for a
  dev-facing tool. Real usage showed next-step hints were correct, but explanatory copy still fought
  the user's mental model.

- _Outcome:_ `arc user status` and `arc sync` use explicit git-note terminology in user-facing copy
  while keeping the stronger working-file phrasing from 3.R.n. Headlines: `git note up to date`,
  `git note out of date`, `local note ahead`, `remote note ahead`, `notes conflict`. Detail lines
  explicitly describe working files vs. the latest local git note. Sync porcelain messages aligned to
  the same language. Coverage updated to pin new copy end-to-end.

    - `[x]` **3.R.p.1 Status wording alignment**
        - Replaced snapshot/disk vocabulary in `arc user status` with git-note-specific headlines and
          detail lines (`Working files have changed since the latest local git note.`, `Latest local
          git note is from <hash>, N commit(s) back.`). Kept remote status subordinate via
          `Remote notes: ...` so actionable headline reflects dominant local state without implying
          ordinary git working-tree semantics.

    - `[x]` **3.R.p.2 Porcelain wording alignment**
        - Updated `arc sync` progress/error copy to refer to local/remote git notes and working
          files instead of older saved-note/disk phrasing. Same action matrix from 3.R.n preserved
          — language changes, not sync direction semantics.

    - `[x]` **3.R.p.3 Coverage + live validation**
        - Updated status-format, status-run, user-status, user-handlers, sync, integration suites to
          pin the new git-note wording. Re-ran focused Vitest surface and checked live `npx arc user
          status` output against current repo.

### `[x]` **3.R.q User sync provenance hardening**

- _Origin:_ Pressure-testing the new status vocabulary against the live repo surfaced a remaining
  dead-end: legacy hash-only local provenance could still misclassify a newer local-only user state
  as stale and point the user to `arc user load` when the safe/correct next step was `arc user save`.
  Same pass surfaced one last duplicated detail-line branch in the `git note out of date` renderer.

- _Outcome:_ Local sync provenance now records the source commit and whether the current materialized
  state came from `save` or `load`. Status uses the richer provenance for precise load/save guidance
  and degrades legacy hash-only provenance to inspect-first fallback instead of making a wrong
  destructive recommendation. `git note out of date` summary renderer normalized so stale, mixed, and
  local-unsaved branches no longer repeat the same sentence twice.

    - `[x]` **3.R.q.1 Provenance schema upgrade**
        - Upgraded `.sync-state.json` from hash-only provenance to include `sourceCommit` and
          `sourceOperation` (`save` / `load`) so status can distinguish newer local-only state from
          older materialized state. `arc user save` and `arc user load` both write the richer
          provenance format.

    - `[x]` **3.R.q.2 Safe fallback for legacy provenance**
        - Legacy v1 provenance now degrades ambiguous cases to `mixed` / inspect-first guidance
          instead of confidently recommending `load`. Prevents status from sending users into a
          dead-end when the tool cannot prove direction.

    - `[x]` **3.R.q.3 Coverage + renderer cleanup**
        - Added scenario coverage: legacy ambiguous provenance, v2 save provenance, v2 load
          provenance. Removed remaining duplicated `git note out of date` detail-line branch
          exposed by the local-unsaved path during live validation.

---

## **Phase 4:** Operational-Context Audit + Task-List-Formatting Restructure + D7b

_Purpose:_ Apply the "operational context only" lens across always-loaded docs and workflows; stage extractions
for the future docs-content-sweep WU; land the D7b extension-point match hook against the existing anchor-suffix
convention. Ordering is Tier 1 → Tier 2 → Task-list-formatting restructure → Tier 3, so Tier 3 audits the
post-restructure state of `2_generate-tasks.md` and `strategy-task-list-formatting.md`.

_Heuristic (4.2–4.5):_ Keep content that helps conceptual flow, is counterintuitive, or would confuse if absent.
Target ~80–90% extraction on rationale/background/overflow-example content with case-by-case retention. Hedges
with undefined state eliminated. Operational rationale clauses (`because ...`) ≤12 words inline — anything longer
extracts. Stopping signal: re-read the file — remaining content reads as imperative operational guidance with no
rationale digressions.

_Strategy-docs exclusion:_ Strategies (`reference/strategies/**/*.md`) are excluded from tiered audit — T3
on-demand, not session-init-loaded. `strategy-task-list-formatting.md` is trimmed in 4.4.c as part of the formatting
restructure.

### `[x]` **4.1 Staging infrastructure**

- _Outcome:_ `notes-docs-content-sweep.md` created at `.arc/backlog/technical/` with the locked entry
  template (Source / Content / Suggested destination / Stylistic integration notes) and the source-side
  `[TODO-docs-site]` placeholder convention documented in the header. Convention: descriptive link text +
  literal `TODO-docs-site` label (no per-entry suffixes — sweep resolves globally); no source-side
  definition initially (revised in 4.2.a — see below). Header captures lifecycle (populate → source-side
  placeholder → sweep) and rationale for splitting the convention between this file and
  `plan-docs-content-sweep.md § Content Contributions`.

### `[x]` **4.2 Tier 1 audit — always-loaded docs**

- _Outcome:_ Six clusters audited (4.2.a–f) covering agent briefings, both DEV-RULES, QUICK-REFERENCE,
  session-init.md, and the template + reference + config triplet, then 4.2.g landed DEV-RULES domain
  enumeration via composite probe (a feature spun off from 4.2.e's audit findings). Staging Entries
  1–13 in `notes-docs-content-sweep.md`. Per-file trim variance reflects baseline (template-status
  80%, AGENT-BRIEFING.CONTRIBUTOR 52%, others 5–36%).

  _Lens calibrations established (carried into 4.3–4.5):_ (a) Agent-audience lens (4.2.a) — files
  strictly agent-loaded skip `[TODO-docs-site]` placeholders; sweep WU finds extractions via staging
  Source ranges. Dual-audience files retain placeholders. (b) Project-level lens (4.2.c) — three
  outcomes: drop / tighten-in-place / relocate to a project-level strategy; `[TODO-docs-site]`
  staging N/A. (c) Configurable two-pass lens (4.2.d, refined from 4.2.c) — `.arc/` trim for
  project-specific content **plus** package-template edits for framework-template quality issues.
  The 4.2.c "configurable → `.arc/` only" precedent applies to project-specific content but NOT to
  framework-template quality improvements affecting every adopter.

    - `[x]` **4.2.a Agent briefings cluster**
        - Four files: 306 → 203 (34%). `AGENT-BRIEFING.ARC.md` 57→47 (added "Sessions are bounded"
          lead). `AGENT-BRIEFING.PROJECT.md` 47→40 (dropped Zero-tolerance + Commands-in-QUICK-REFERENCE
          friction-item duplicates). `AGENT-BRIEFING.CONTRIBUTOR.md` 163→79 (largest win — Personal
          Workspace and Running Pipeline subsections moved to docs site; operational core retained).
          `CLAUDE.ARC.md` 39→37. Staging Entries 1–6.
        - _Convention amendment surfaced during execution:_ Task 4.1's "no source-side definition" for
          `[TODO-docs-site]` failed MD052 zero-tolerance lint on first use. Revised to require a
          file-bottom stub (`[TODO-docs-site]: # "Placeholder pending docs-content-sweep — see
          notes-docs-content-sweep.md"`) — one stub per file, sweep WU rewrites to resolve all
          references. User approved before execution proceeded.
        - _Follow-on deletion (pre-4.2.b):_ `CLAUDE.ARC.md` and `CODEX.ARC.md` deleted from
          `.arc/system/agent/` after pressure-test found no valid ARC-exclusive use case for
          `{AGENT}.ARC.md` — harness-level files dominate on load order with no ARC-specific
          capability lost. Surgical scope; full mechanism removal absorbed into revised Task 5.7.
          Drift Item #4 in `plan-docs-content-sweep.md`.

    - `[x]` **4.2.b `DEV-RULES.ARC.md`**
        - 385 → 327 (15%). Surgical trim — scattered rationale paragraphs + overflow examples +
          consolidation sites, reflecting an already-tight operational baseline. Staging Entries 7–10.
          P-annotation removal: 17 `· PN` annotations stripped from rule headings; rule → principle
          mapping preserved in Entry 10 staging table for docs-site absorption. `· [configurable]`
          retained (operationally meaningful). Test-first major compression (14 → 5 lines) — decision-
          tree defaults dropped to avoid contradicting adopter method overrides; method is
          authoritative and loaded at trigger time.

    - `[x]` **4.2.c `DEV-RULES.PROJECT.md`**
        - 214 → 137 (36%). Structural trim — whole-section drops driven by existing project-level
          strategies. Vitest mock hygiene block relocated to `strategy-testing-methodology.md` as new
          `### Vitest mock mechanics` subsection. Drops: Domain-scoped rules callout, File
          Organization, Capture Routing duplicates, CI Validation item, Testing tier descriptions, ADR
          decision criteria, trailing composition sentence. Compressions: Tiered approach 4→1,
          shellcheck install 3→1, Line-length rule 4→1. Retained: DRY/SOLID/KISS/YAGNI list, ❌/✅
          examples, Quality Gates items 1–5 (operational teeth of zero-tolerance).

    - `[x]` **4.2.d `QUICK-REFERENCE.md` (project copy + template)**
        - Project copy 330 → 296 (10%); template 242 → 225 (7% net — T3+T4 drops partly offset by new
          Platform Commands scaffold). Drops both copies: Anti-Patterns section, bottom summary line.
          Project-only: Working Directory Note compressed; Quality Tools 5-bullet → tool-names +
          pointer. Template-only: Working Directory Note dropped (was overtuned guidance); new
          conditional § Platform Commands wrapped in `<!-- arc:if platform.type != github -->`,
          resolving 6 inbound dead pointers (rotate-branch, integrate-planning-branch,
          deactivate-work-unit, configurability-architecture ×3). Shared: ADR-012 trailing
          explanation replaced with pointer to `strategy-session-operations.md § Session State
          Portability`.
        - _Two-copy sync model refined:_ Project copy edited independently for project-specific
          content; template edited independently for framework-template quality; shared changes
          applied to both. Template file is `.template.md` (rendered-at-init), lint-excluded by
          default; force-linted via temp-copy workaround.

    - `[x]` **4.2.e `session-init.md` (both copies)**
        - Project 344 → 308 (10.5%); template 373 → 336 (9.9%). Below the ~80–90% extraction
          heuristic by design — 4.2.g spun off (DEV-RULES domain scan held for full structural
          replacement); one heavy-extraction candidate relocated rather than staged. Heavy changes:
          SESSION-NOTES load errors relocated to `strategy-session-operations.md § SESSION-NOTES Load
          Error Recovery`; multi-file disambiguation prompt trimmed 11 → 4 lines; planning-readiness
          enumeration dropped (Entry 12); context-mismatch examples trimmed Tier 1 4→2 and Tier 2
          3→2 (Entry 13). Step 1 "Adopters: add project-specific runtime checks" prose dropped —
          rendered copies churn on `arc update`; correct surface for non-ARC pre-session guidance is
          harness-level files. `pwd` retained (lightweight cwd orientation). Staging Entries 11–13.
          ~10 inline tightenings across §§ 2–7.

    - `[x]` **4.2.f Template + reference + config cluster**
        - `template-status.md` 56 → 11 (80% — highest-leverage; skeleton propagates into every WU's
          status file). `STRATEGY-INDEX.md` `.arc/` 79 → 38 (52%); package 79 → 56 (29%).
          `arc-config.yml` audited, no material change (per-section comments are interface
          documentation, not rationale bloat). Heavy changes — `template-status.md`: "About this
          file" callout dropped (pure duplication); Optional fields HTML comment relocated to new
          `strategy-work-organization.md § Work Unit State § Optional Pointer Fields`; State enum
          HTML comment relocated to `§ State Enum`. Final shape: H1 + `## Active Work` + 7-field
          scaffold.
        - _Cross-reference updates:_ `integrate-work-unit.md` redirected `[template-status]` →
          `[work-org-state]`. `STRATEGY-INDEX.md`: Usage Protocol dropped (duplicates DEV-RULES.ARC
          § Verification and Discovery); Location + Naming preamble dropped (per-entry prefixes
          self-documenting); `.arc/` § Project Strategies replaced with this project's actual
          strategies.

    - `[x]` **4.2.g DEV-RULES domain enumeration via composite probe**
        - Replaces session-init.md Step 4 item 5's `constitution/` scan with probe-delivered
          domain-rules awareness. Surfaced during 4.2.e: every session scans for `DEV-RULES.*.md`
          domain files with near-always-empty result. Zero domain files exist in this repo; no
          migration. Six implementation subtasks (4.2.g.a–f). Implementation order: a → b → c →
          (d, e parallel) → f.
        - _Design decisions:_ Frontmatter schema flat (top-level `domain:` + `purpose:` strings;
          mirrors method/extension precedent rather than workflow `arc:` namespace). Filename must
          match `DEV-RULES.{DOMAIN}.md` where `{DOMAIN}` matches `domain:` value. Discriminator:
          frontmatter presence (DEV-RULES.ARC and DEV-RULES.PROJECT carry no frontmatter, silently
          skipped — no reserved-list maintenance). Malformed frontmatter surfaces in
          `warnings: string[]`. Probe shape: top-level `domainRules` slot on `SessionInitProbeResult`,
          inner `{ mode, rules: Array<{path, domain, purpose}>, warnings }`. Session-init-only at
          launch (no full-mode rendering — no current consumer). `template-dev-rules.md` ships as
          Framework classification (default — adopters copy-and-rename).

        - `[x]` **4.2.g.a `parseDevRulesFrontmatter`**
            - `src/lib/frontmatter/dev-rules.ts` with flat `{domain, purpose}` schema:
              case-insensitive filename-fragment match against `DEV-RULES.{DOMAIN}` basename,
              non-empty `purpose` enforced, extra unknown keys accepted. (Case contract tightened
              later in 4.2.g.e.)

        - `[x]` **4.2.g.b Probe module — `runDomainRulesSessionInitStatus`**
            - `src/commands/constitution/` module: discriminator is frontmatter-presence;
              missing-directory throws (composite wraps as per-slot runtime error).
            - _Incidental discovered:_ renderer left `\n\n` at EOF when an `arc:if` block stripped
              near EOF, tripping MD012 in the e2e init-suite lint. Fixed in
              `src/lib/template/render.ts` by normalizing trailing newlines (commit `b4454c3`).
              Unblocks full `npm test` suite.

        - `[x]` **4.2.g.c Composite wiring + handler integration**
            - Threaded `domainRules` through the session-init composite. `Promise.all` extended to 5
              elements; `buildSessionInitStatusSummary` renders `Domain Rules:` after `Active:`.
              Handler binding session-init branch only — full-mode `StatusResult` unchanged per
              session-init-only design.

        - `[x]` **4.2.g.d Pre-commit hook — DEV-RULES frontmatter validation**
            - New CHECK 13 in `pre-commit` (both copies). Existing CHECK 13 → 14, CHECK 14 → 15.
              Hook greps staged paths
              `^(\.arc|packages/arc-framework/arc)/reference/constitution/DEV-RULES\.[^/]+\.md$`
              and delegates to `validate-frontmatter.ts` extended with `"domain-rules"`
              classification. Reserved filenames (ARC, PROJECT) filtered at classifier level —
              short-circuit to `"other"` before parsing.

        - `[x]` **4.2.g.e CI audit — sibling `audit-domain-rules.ts` + parser case contract**
            - Sibling script — `audit-method-triggers.ts` is strictly method/extension-scoped by
              filename contract, module doc, and corpus. Force-fitting would require rename +
              module rewrite + widened CLI for no structural payoff; the two share only
              `lib/frontmatter/` primitives.
            - _Parser case contract (design tightening):_ Original case-insensitive matching
              created a cross-file duplicate-`domain` corner case only reachable on case-sensitive
              filesystems. Parser now enforces an asymmetric case contract: filename fragment
              uppercase (signals "broad/overarching" per ARC convention), `domain:` value
              lowercase (programmatic identifier), `fragment.toLowerCase() === domain` exactly.
              Cross-file uniqueness becomes structurally guaranteed. Duplicate check removed from
              audit as dead code. Template-side comment documenting this as a **mechanical
              requirement** (probe + hook enforced) threaded into 4.2.g.f.
            - Wiring: `package.json` adds `lint:arc:domain-rules` alongside `lint:arc:triggers`;
              `.github/workflows/ci.yml` adds parallel step.

        - `[x]` **4.2.g.f Markdown surface — session-init rewrite, template, drift capture**
            - Single atomic commit covering markdown/config: session-init.md Step 4 item 5
              rewritten (two-copy) — replaced static `constitution/` scan with nested bullet
              pointing at the probe's `domainRules` field; Step 2 probe table gained `domainRules`
              row (Field column widened by 1 char so `domainRules` fits without MD060 alignment
              drift). New `reference/templates/template-dev-rules.md` (two-copy) with frontmatter
              scaffold, case-contract framing as **mechanical requirement** with worked example,
              body skeleton mirroring DEV-RULES.ARC/PROJECT shape. `init-recipe.json` adds the
              template path. `plan-docs-content-sweep.md` Drift Item #6.

### `[x]` **4.3 Tier 2 audit — core lifecycle workflows**

- _Outcome:_ Three workflows trimmed under per-file load-frequency lens — commit/task flow (4.3.a)
  fires repeatedly per session; integrate-work-unit (4.3.b) per-WU; session-handoff (4.3.c)
  per-session. Cluster yields 6%/2%/5% — softer than 4.2 because all three were already
  operational-heavy with limited rationale overhead. Staging Entries 14–22.

    - `[x]` **4.3.a Commit/task flow cluster (`3_process-task-loop.md` + `prepare-commits.md`)**
        - `3_process-task-loop.md` 269 → 241 (10%); `prepare-commits.md` 171 → 161 (6%). Trims:
          co-development rationale why-clause, inline Tier 1/2/3 definitions recap, Implied
          permission duplicate, atomicity-check common-splits enumeration, Quick Decision Guide
          ✅/❌ criteria, Where to Capture lifecycle-intent routing (replaced with pointer to
          DEV-RULES.ARC § Leave it cleaner routing table), TodoWrite rationale paragraph.
          `prepare-commits.md`: Shared-Docs Commit Pattern preamble, Granularity bullet expansions,
          reversibility category-naming tail, tracking-docs rationale tail. Staging Entries 14–19.
          Pure duplicates dropped without staging (Tier definitions, Implied permission,
          outcome-shaped restatement, Where to Capture routing).

    - `[x]` **4.3.b `integrate-work-unit.md`**
        - 360 → 353 (2%) — smallest reduction in Phase 4. Lighter posture: file loads per-WU (once
          per branch), so amortized cost is low and clarity wins over brevity. Most of the file
          resists trimming — checklist-heavy phases with bash blocks, edge-case handling, and `why`
          clauses each preventing a specific non-obvious error. Four targeted redundancy removals:
          multi-branch ops rationale tail (duplicates Work Organization Strategy), completion-doc
          freshness rationale tail, `[~]` marker distinct-from enumeration, Appendix "Key
          principle" closer (restates elements #4/#5). Entry 20 staged.

    - `[x]` **4.3.c `session-handoff.md`**
        - 473 → 450 (5%). Bounded by ADR-016 preservation constraint — gate model expands
          handoff-interior responsibilities (rotation-field migration commit→handoff; configurable
          toggles for worktree push, notes push, quality-gate finalization), so structural
          scaffolding (rotation template, step-by-step format, Save-to-Git-Notes section, Confirm
          Handoff orientation) stayed intact. Trims targeted principle-grounding framing and verbose
          error-handling prose: Design context compressed to two-line override pointer; "Preserve
          persistent context" paragraph compressed to dedup pointer; "Long-session bias" paragraph
          dropped (rhetorical nudge); § Save to Git Notes error-handling 15 → 3 lines. Staging
          Entries 21–22.

### `[x]` **4.4 Task-list-formatting restructure (P1.4 — three moves)**

- _Outcome:_ Three moves landed. `template-tasks.md` created (both copies) absorbing skeleton
  blocks; Quick Format Checklist relocated to `2_generate-tasks.md` Step 4 as the pre-save gate;
  `strategy-task-list-formatting.md` rewritten to rules-only (701 → 285 lines, ~59%; 7
  contract-carrying sections preserved with cross-references to extracted surfaces). Tier 3 audit
  (4.5) inherits a tighter `2_generate-tasks.md` and `strategy-task-list-formatting.md`. Staging
  Entries 23–27. 4.4.d added mid-phase as templates-directory outlier cleanup discovered during
  4.5.a.

    - `[x]` **4.4.a Extract templates to `template-tasks.md` + apply resolved `**Strategies:**` convention change**
        - New `.arc/reference/templates/template-tasks.md` (217 lines) following
          `template-completion-doc.md` convention: feature/technical header, incidental header,
          verification phase block, atomic companion file, success criteria — each with "Use when"
          framing and reference back to the strategy doc. Phase-header template ships without
          `**Strategies:**` field per resolved convention.
        - `2_generate-tasks.md` Step 3: dropped "under the phase header or" option from
          `**Strategies:**` wording; reframed closer to "use when the connection isn't obvious from
          the task title".
        - `tasks-arcd-rebrand.md` sweep: removed document-level `**Strategies:**` block + three
          orphaned reference-link defs (`[package-sync]`, `[file-classification]`,
          `[config-arch]`); `[work-org]` retained.

    - `[x]` **4.4.b Relocate Quick Format Checklist into `2_generate-tasks.md` Step 4**
        - Checklist moved verbatim; caller prose tightened. Strategy doc TOC shrunk by one entry;
          new location surfaced via pointer line under TOC. Placement: between "Combine phases…"
          intro and "Save to" paths, as a pre-save verification gate.

    - `[x]` **4.4.c Trim `strategy-task-list-formatting.md` to rules-only**
        - 701 → 285 lines (59%). Above the aspirational ~70-line target but in line with "rough
          guide, not hard ceiling" given surface area (headers, 10 format elements, ownership,
          test-first, verification, atomic companion, success criteria). Preserved 7
          contract-carrying sections; each format-element subsection collapsed to 2-4 line rule
          summaries with single-line examples only where rule text alone would be ambiguous.
          Templates delegated to `template-tasks.md` via cross-reference. Three-state
          success-criteria marker table retained (operationally essential). Staging Entries 23–27.

    - `[x]` **4.4.d Templates directory outlier cleanup**
        - `template-tasks.md` 215 → 169 (~21%); `template-completion-doc.md` 161 → 126 (~22%);
          `integrate-work-unit.md` 353 → 380 (+27, from 4.4.d.b relocation). 4.4.d.a dropped
          redundant meta-sections now owned by `strategy-task-list-formatting.md`; 4.4.d.b
          relocated pre-drafting gather list + post-drafting verification checklist to
          `integrate-work-unit.md § 3) Create Completion Metadata` (mirrors 4.4.b's operational-
          machinery-to-use-site pattern). Both outlier templates now carry only scaffold-pattern
          content; scaffold skeletons retained as on-disk content of target files.

        - `[x]` **4.4.d.a Reshape `template-tasks.md`** — 215 → 169 (~21%). Dropped § Verification
          Phase + § Success Criteria Section (both already inline in `strategy-task-list-formatting.md`
          and embedded in variant scaffolds). Trimmed § Atomic Companion File to lead-in + skeleton;
          Purpose/Ordering paragraphs inside the skeleton retained (verified as on-disk content of
          every real atomic file across active + archive). Reduction below ~40% target driven by
          skeleton blocks being on-disk content, not trim-eligible. Cross-reference cleanup:
          dropped `strategy-task-list-formatting.md § Verification Phase` dangling "See
          `template-tasks.md` for the skeleton" pointer (redundant with inline skeleton directly
          above).

        - `[x]` **4.4.d.b Reshape `template-completion-doc.md`** — 161 → 126 (~22%);
          `integrate-work-unit.md` 353 → 380 (+27). Relocated "Required Reading Before Drafting"
          (5-item gather) and "Standard Template Verification Checklist" (7-item post-drafting
          verify) from template into `integrate-work-unit.md § 3) Create Completion Metadata` as
          pre/post drafting gates. "Evidence format: note where verified" folded into "Quantitative
          claims" checklist item inline. Template retains intro + variant-selection + both scaffold
          blocks. Reduction below ~50% target same structural driver as 4.4.d.a (scaffold blocks
          on-disk). Mirrors 4.4.b precedent — relocating structured operational gates is not a
          reversal of 4.3.b's prose/rationale trim.

### `[x]` **4.5 Tier 3 audit — remaining workflows**

- _Outcome:_ Operational-context audit across 15 agent-loaded workflows in four clusters
  (4.5.a planning, 4.5.b work-unit-lifecycle core, 4.5.c branch/verify/planning, 4.5.d
  supplemental). Aggregate 2722 → 2372 (-350 lines, ~13%). Staging Entries 28–68 (41 entries).
  Two strict no-ops (verify-work-unit.md in 4.5.c, verify-arc-integrity.md in 4.5.d) plus one
  constrained-yield case (2_generate-tasks.md in 4.5.a, ~6%, protected Quick Format Checklist).
  **Use-site relocation pattern** (4.4.b / 4.4.d.b) did not recur — cluster gates were inline at
  workflow level across all 15 files. **Partial-extract pattern** deployed five times (4.5.c: 3;
  4.5.d: 2) — paired "full pre-trim" / "retained in trimmed workflow" blocks document the new
  structural variant in staging entries.

  _Out of Tier 3 scope:_ `initial-setup/*.md` (one-off install workflows, not per-session),
  `session-lifecycle/session-loop.md` (`audience: human`),
  `reference/strategies/**/*.md` (T3 on-demand; `strategy-task-list-formatting.md` handled in 4.4.c).

    - `[x]` **4.5.a Planning workflows**
        - `1_create-prd.md` 138 → 115 (~17%): preamble feature/technical taxonomy collapsed to
          one-line strategy pointer + consolidated rule in Step 2; Step 3 "Without a plan"
          discovery bullets collapsed to discovery-checklist pointer; Step 5 "Framing the notes
          file" extracted with operational constraint retained; Step 2 emphasis-rationale tail
          trimmed.
        - `2_generate-tasks.md` 177 → 166 (~6%; constrained by protected Quick Format Checklist):
          `## Task List Format` collapsed from Header/Body subsection structure to two-pointer
          flat layout — `template-tasks.md` for skeleton (removes previous two-hop lookup),
          `strategy-task-list-formatting.md` for rules. Staging Entries 28–31.
        - _Discovered during execution:_ `template-tasks.md` and `template-completion-doc.md`
          identified as structural outliers (meta-title + embedded scaffolds vs. direct-use
          pattern of other 8 templates). Captured as new Task 4.4.d.

    - `[x]` **4.5.b Work-unit lifecycle core**
        - `activate-work-unit.md` 234→222 (~5%); `archive-work-unit.md` 275→229 (~17%);
          `clean-work-unit.md` 374→291 (~22%); `deactivate-work-unit.md` 278→260 (~6%). Cluster
          total 1161→1002 (~14%). Staging Entries 32–48 (17 entries) covering blockquote
          extractions, rationale paragraphs, example enumerations, reference blocks, Common
          Pitfalls sections, ✅/❌ mode enumerations, conceptual recaps, BEFORE/AFTER worked
          examples. Yield driver: clean carried 52% of cluster trim (83/159 lines), largest yield
          from § Common Pitfalls + § Output wholesale deletions + three BEFORE/AFTER code fences +
          two ✅/❌ mode enumerations.

    - `[x]` **4.5.c Work-unit lifecycle (branch/verify/planning)**
        - `rotate-branch.md` 155→117 (~25%); `verify-work-unit.md` 80→80 (no-op, already
          operational-dense); `planning/activate-planning-branch.md` 115→99 (~14%);
          `planning/integrate-planning-branch.md` 152→135 (~11%). Cluster total 502→431 (~14%,
          71 lines extracted). Staging Entries 49–59 (11 entries).
        - _verify-work-unit.md no-op confirmed_ — pre-implementation assessment held, no
          rationale/example warranted extraction (mirrors Task 1.1.c no-op).
        - _Partial-extract pattern deployed three times_ (Entries 51, 55, 58) where a consequence
          signal or operational mechanic needed retention while rationale/examples were staged —
          new structural variant documented in each entry.

    - `[x]` **4.5.d Supplemental**
        - `manage-incidental-work.md` 226→189 (~16%); `maintain-project-docs.md` 150→123 (~18%);
          `add-agent.md` 87→72 (~17%, retirement cleanup — not extraction);
          `verify-arc-integrity.md` 151→151 (strict no-op, reference material);
          `integrate-external-content.md` 130→123 (~5%). Cluster total 744→658 (-86, ~12%).
          Extraction-only yield ~9.5% (lowest in 4.5 series — three of five files already
          operational-dense). Staging Entries 60–68.
        - _`add-agent.md` retirement cleanup:_ Step 2 "Check for Agent-Specific Configuration"
          removed wholesale per separately confirmed framework change ({AGENT}.ARC.md retirement).
          Steps 3→2 and 4→3 renumbered. No staging entry — content retired, not absorbed. All 15
          lines of file's reduction came from this cleanup.
        - _`verify-arc-integrity.md` strict no-op:_ reference material by nature; six Check
          Categories each carry description/severity/remediation triples the agent needs when
          interpreting script output. Trimming reduces reference value.
        - _Entry 66 deviation:_ `maintain-project-docs.md § Document Hierarchy` duplicates
          session-init.md's canonical loading model. Staged as known-stale rather than
          docs-absorption-ready; entry flags for discard when docs-sweep WU resolves the loading
          model.

### `[x]` **4.6 D7b extension-point match pre-commit hook (test-first)**

- _Outcome:_ CHECK 16 landed in both hook copies; new validator
  `packages/arc-framework/src/scripts/validate-extension-points.ts` delegates scanning to the
  shared `point-scanner` + `orphan-detector` helpers from Task 3.R.k.b. Tests cover path
  classification, header- and inline-form resolution, orphan diagnostics with line numbers,
  metadata-agnostic existence criterion, multi-reference files, malformed-marker rejection,
  non-workflow skips, empty-input short-circuit, and same-copy lookup in both directions.

  _Validator shape:_ Follows CHECK 12/13/15's pattern — `validateFiles(paths, readFile,
  listExtensions)` is pure and injectable; CLI entry reads working tree and lists extension
  basenames via `readdirSync`. Diagnostics shape
  `` path:line: extension-point reference `#<name>` has no matching `<copy>/system/extensions/<name>.md` ``
  so editors can jump to the offending line.

  _Same-copy listing:_ Minimal local `listExtensionBasenames(dir)` helper inside the validator
  rather than exporting `extensions/status.ts`'s `readExtensionsDirectory`. Stated criterion is
  file existence, not frontmatter-declared name (CHECK 12 already enforces name ↔ basename).

  _CHECK 14 dual-fire:_ Workflows pairing an anchor-suffix marker with a reference-style link to
  the extension file (e.g., `3_process-task-loop.md`) surface both CHECK 14 (link resolution) and
  CHECK 16 (reference resolution) when an extension is deleted. Expected — different surfaces,
  different diagnostics — tolerable since both point at the same root cause.

  _Scope boundary:_ Hook checks only staged workflow paths; deletes leaving references in
  unstaged workflows are out of scope (full-repo orphan detection lives in `arc extensions status`).

### `[x]` **4.7 Phase 4 close — Tier 3 quality gates**

- _Outcome:_ Tier 3 suite clean — markdown lint (223 files), TS lint, shell lint, typecheck
  (sources and tests), full test suite (1051 tests across the monorepo), build success.
  Spot-check on 4 staging entries (1, 30, 55, 68) across 68-entry corpus: all follow the locked
  template; partial-extract variant introduced in 4.5.c (paired "Retained in trimmed workflow"
  with "Extracted" subsections) is cleanly structured. `[TODO-docs-site]` greppable across all
  trimmed source files that preserved in-prose continuity (DEV-RULES.ARC,
  AGENT-BRIEFING.CONTRIBUTOR — 11 occurrences total). Phase 4.5 workflow trims were dominated by
  wholesale-section removals with no residual anchor — placeholders only apply where trimming
  preserves surrounding prose; sweep WU enumerates wholesale removals via entry metadata in
  `notes-docs-content-sweep.md`.

  _CHECK 16 surface check (3.12 discipline mirror):_
    - SET A (negative-path staging): `README.md`, strategy `.md`, `src/cli.ts`,
      `.github/workflows/ci.yml`, `docs/release-notes.md` — hook's grep filter produces empty
      candidate list; validator not invoked.
    - SET B (positive resolvable): synthetic `.arc/system/workflows/arc/_surface-valid.md` with a
      `` ### X · `#post-context-load` `` reference → validator exit 0.
    - SET C (positive unresolvable): synthetic `.arc/system/workflows/arc/_surface-invalid.md`
      with a `` ### X · `#does-not-exist-anywhere` `` reference → validator exit 1 with diagnostic:

      ```text
      extension-point reference `#does-not-exist-anywhere` has no matching
      `.arc/system/extensions/does-not-exist-anywhere.md`
      ```

---

## **Phase 5:** Worktree-Sync Completion + Partial-Read Narrowing + Session-Init Workflow Restructure

_Purpose:_ With Phase 3.R.e + Task 5.0 closing the remote-sync detection half, this phase tightens
the always-loaded surface — task-list authoring shape (5.2), per-document partial-reads (5.1, 5.3–5.5),
companion-file paths via composite probe (5.6), `{AGENT}.ARC.md` retirement and `system/agent/` →
`system/briefs/` rename (5.7) — then restructures `session-init.md` Step 2/4/7 against Phase 4 audit
outcomes (5.8).

_Design decisions:_ Per-rule reliability gate for DEV-RULES section partial-reads — default up-front
load; shift to conditional only where trigger is clear. Two-copy sync standard for markdown edits;
Task 5.6 is TS-only (no markdown sync concern).

### `[x]` **5.0 Worktree-sync detection at session-init — completes 3.R.e scope**

- _Outcome:_ Worktree drift detection lands across the full session-init pipeline.
  `runWorktreeSyncStatus` classifies local-vs-`origin/<branch>` drift into a 9-state enum with
  bounded fetch; flat-dotted `session.init_pull.{worktree,notes}` config governs per-channel pull
  policy with parser-level `always`-on-worktree rejection. Composite probe carries a peer `worktree`
  slot and attaches a `clean-at-current-head` qualifier on `user` when worktree=remote-ahead and
  user=clean. `arc user status` and `arc sync` share `formatWorktreeQualifierLine` for parity across
  notes-status surfaces. `session-init.md` (both copies) consumes the envelope end-to-end — Step 2
  envelope table, Step 3 dual-channel pull surface with dirty-tree precheck and combined-prompt,
  Step 7 conditional `Reconcile required:` / `Local-ahead:` inserts, Step 8 Tier 1 diverged example.
  ADR-012 amendment (2026-04-25) frames worktree as peer channel; `arc-config.yml` and CLI help text
  close out the doc surface.

    - `[x]` **5.0.a Worktree sync state inspection (probe)**
        - `runWorktreeSyncStatus` at `lib/git/worktree-sync.ts`. State enum: `skipped | clean |
          remote-ahead | local-ahead | diverged | no-upstream | detached-head | no-remote |
          remote-unavailable`. Bounded fetch via `boundedFetch` helper
          (`DEFAULT_FETCH_TIMEOUT_MS = 3000`, AbortController). `GitExec` extended with optional
          `signal: AbortSignal` via new `GitExecOptions`; backward-compatible (TS function-type
          variance). `failureReason: "timeout" | "error"` optional field distinguishes the two
          `remote-unavailable` causes for downstream consumers.

    - `[x]` **5.0.b Config schema + types for init_pull channels**
        - Flat-dotted `session.init_pull.{worktree,notes}` parse, validate, default to `prompt`. New
          `ENUM_VALIDATORS` table in `lib/config/status-reader.ts` carries per-key allowed sets;
          worktree rejects `always` via separate enum (no special-casing). Validation lives in the
          reader, not `parseArcConfig`. Invalid values fall back to default in `settings`, push to
          `errors`, but don't enter `defaultsApplied`. Shell-side `validate-config.sh` extended;
          missing `session.remote_sync` enum backfilled opportunistically.

    - `[x]` **5.0.c Composite probe envelope — worktree field + notes qualifier**
        - `arc status --session-init --json` carries peer `worktree` slot wrapped in
          `Probe<WorktreeSyncStatusResult>`; `user.value.qualifier: "clean-at-current-head"` set
          when worktree=remote-ahead and user=clean. Cross-channel qualifier computed in the
          composite (post-processing the resolved slots), keeping the user probe independently
          reusable for `runStatus` and `arc user status`. Worktree slot positioned between User and
          Extensions in both type ordering and Clack formatter.

    - `[x]` **5.0.d CLI status reporting surfaces — worktree qualifier**
        - `runUserStatus` orchestrates the worktree probe in parallel with notes/disk probes when
          `session.remote_sync` is enabled and `--offline` is not set. Shared
          `formatWorktreeQualifierLine` helper (exported from `commands/user/sync-status.ts`) drives
          both `arc user status` and `arc sync` qualifier emission — single source of truth for the
          qualifier vocabulary. Healthy non-drift states emit no qualifier; only `remote-ahead` /
          `diverged` / `remote-unavailable` carry actionable signal.

    - `[x]` **5.0.e Session-init workflow rewrite — Step 2/3/7/8**
        - `session-init.md` (both copies) consumes the envelope end-to-end: Step 2 envelope table
          gains the `worktree` row + cross-channel qualifier note; Step 3 renamed to "Conditional
          Sync Pulls" with channel-keyed bullet lists, dirty-tree porcelain precheck, combined-prompt
          (worktree pulls first, notes re-evaluated after); Step 7 grew `Reconcile required:` and
          `Local-ahead:` inserts above `Active work state:`; Step 8 Tier 1 diverged example added.
          No auto-stash; combined prompt offers per-channel choices. Streamlining pass cut ~50-line
          initial draft to ~39 net lines.

    - `[x]` **5.0.f Integration test coverage**
        - Six scenarios — four extending `__tests__/integration/status.test.ts` (composite envelope
          with real `runWorktreeSyncStatus` replacing the prior stub), two extending
          `__tests__/integration/user.test.ts` (`runUserStatus` real-exec drift). Drift produced via
          `commit → addBareRemote → reset --hard HEAD~1` rather than `update-ref` against the bare
          dir. Fetch-fault scenarios kept unit-only (cannot be reliably reproduced at integration
          tier without partial exec mocking).

    - `[x]` **5.0.g Documentation + ADR + config comment sync**
        - ADR-012 amendment (2026-04-25) frames worktree as peer channel without superseding the
          notes-channel decision. `arc-config.yml` (both copies) gains one-line cross-reference to
          `session-init.md § Conditional Sync Pulls` on each `session.init_pull.*` block. `arc user
          status` description appends a parenthetical naming the worktree-drift qualifier. Release-
          notes writeup redirected to `plan-docs-content-sweep.md § Content Contributions #7` —
          this project doesn't ship release notes in-repo.

### `[x]` **5.1 QUICK-REFERENCE partial-read at session-init + template structural alignment**

- _Outcome:_ Session-init reads only `## Environment & Path Context` (subsumes nested `### Runtime
  Environment`); other sections — `Command Patterns`, `Quality Gate Commands`, `ARC CLI Commands`,
  `npm Publishing` — load on demand via existing prose pointers. Hybrid favoring strategy-index-style
  awareness — no structural Phase-1-style triggers (overkill for ad-hoc reference material). Bare
  pointers across `deactivate-work-unit.md`, `integrate-planning-branch.md`, and three sites in
  `strategy-configurability-architecture.md` promoted to `§ Platform Commands`. Template structurally
  aligned (T1+T2+T3 symmetric); awareness note added inside `## Environment & Path Context` listing
  on-demand sections.

    - `[x]` **5.1.a Session-init.md narrowing**
        - Step 4 item 7 reshaped to section-level partial read; reading-rule preamble updated to
          enumerate both partial reads (item 7 + item 10). Two-copy synced.

    - `[x]` **5.1.b QUICK-REFERENCE template structural alignment**
        - Tier 2 slot inserted in `Quality Gate Commands` between T1 and T3 in the template;
          placeholder commands (`[md_lint_command_all]`, `[lint_command_all]`,
          `[type_check_command_all]`, `[test_command_all]`) match the existing T1/T3 convention.
          `.arc/` already had T2 populated. Template stays bare-bones (no Prettier section, no MD060
          tooling, no `npm Publishing`).

    - `[x]` **5.1.c Verify callers**
        - ~30 grep matches triaged into load-on-demand pointers, file-level/meta-descriptive
          references, and initial-setup workflows. Five bare-pointer sites promoted to
          `§ Platform Commands`; remaining matches descriptive or capture-routing — left untouched.
          Platform Commands conditional-rendering gap captured to `user/andrew/ATOMIC-INBOX.md` as
          orthogonal framework-level decision.

### `[x]` **5.2 Task list preamble shape codification + one-time cleanup**

- _Outcome:_ PRD becomes canonical for Scope; task-list `## Overview` and `## Scope` blocks collapse
  into a one-line `**Purpose:**` field in the Header. Phase-preamble shape codified — required
  `**Purpose:**`, optional `**Design decisions:**` linking to `notes-{name}.md`, ~12-line soft cap —
  slotted into `strategy-task-list-formatting.md § Phase Preamble`. Active + backlog swept (archive
  deferred — `2025-q4` historical, `2026-q1`/`q2` declined for shape consistency since they don't
  pay session-init cost).

    - `[x]` **5.2.a Authoring shape edits**
        - `template-tasks.md` (both copies): Feature/Technical skeleton drops `## Overview` /
          `## Scope`, gains Header `**Purpose:**`. Incidental variant retains `## Scope` and uses
          `## Context` instead of Purpose. `strategy-task-list-formatting.md` § Task List Headers
          updated; new `### Phase Preamble` sub-section under Format Elements Reference.
          `2_generate-tasks.md` Step 4 checklist gains two new items (Header Purpose + phase-preamble
          shape).

    - `[x]` **5.2.b One-time cleanup**
        - This task list: Overview + Scope collapsed into Header Purpose; companion-file pointer
          dropped (codified in template); Phase 5 preamble compressed 15 → 9 lines.
          `tasks-arcd-rebrand.md` (backlog): Overview + Scope collapsed; Multi-branch paragraph
          dropped (duplicates Branch(es) header). Orphan `[work-org]` ref-link removed. Phases 1, 2,
          3, 6, 7 already under cap; Phase 4 carries audit-heuristic guidance applied per-subtask
          (justified soft-cap overrun, left as-is).

### `[x]` **5.3 Task list partial-read narrowing**

- _Outcome:_ `session-init.md` Step 4 item 10 reshaped to a three-section boundary contract
  (Header + current phase preamble + current task) replacing the prior "first ~100 lines" heuristic.
  Phase preamble located via task-identifier-derived lookup — strip leaf segment (`5.3` → `5`,
  `3.R.e` → `3.R`), grep `^### \*\*Phase {id}:\*\*`. **Preamble boundary contract** documented inline
  at bullet 2: heading line through the line immediately before the first `- [ ]` / `- [x]` bullet;
  multi-paragraph framing (Purpose, Design decisions, Rationale) included, task entries excluded.
  Phase identifier derived from task identifier rather than probe-computed (probe-computed line
  numbers couple the CLI to markdown structure; net cost is two ops at session-init — micro-
  optimization not worth the structural coupling). Two-copy synced.

### `[x]` **5.4 Status file partial-read narrowing**

- _Outcome:_ `session-init.md` Step 4 item 8 lead paragraph rewritten to partial-read the
  `## Active Work` section (heading line through the last `**Field:**` line). Two sub-bullets added:
  **Read scope** (load-bearing + optional fields enumerated) and **Contract boundary** (any
  session-init-relevant content lives inside `## Active Work`). Combined with Phase 4.2's
  `template-status.md` cleanup, the partial-read is the durable guard against future authoring
  drift — template content outside the section can't leak into session-init load. Two-copy synced.

### `[x]` **5.5 DEV-RULES section-level partial-read evaluation (per-rule)**

- _Outcome:_ All four candidate sections evaluated against the strict reliability bar (clear trigger,
  detectable at session-init, agent doesn't need pre-awareness to consult). Dispositions: all
  `up-front-load`. Default holds; no structural change to `session-init.md` Step 4. Per-section:
  universal triggers (any session may surface routable issues, hit a quality gate, or edit framework
  files), no detect-at-init signal, agent unawareness causes silent under-routing or missed gate
  awareness. 5.5.b ("Record dispositions in notes file") deferred — rationale captured in commit
  message instead; notes-file step would have been write-once-read-never given immediate execution
  by 5.5.c. Adjacent finding (DEV-RULES.ARC § Task Execution duplicates process-task-loop content)
  captured to `atomic-session-init-optimization.md` as content-tightening, outside 5.5 scope.

    - `[x]` **5.5.a Evaluate candidate sections** — all four → up-front-load.
    - `[~]` **5.5.b Record dispositions in notes file** — Deferred; rationale captured in commit message.
    - `[x]` **5.5.c Apply dispositions** — No-op. All up-front-load → no structural change.

### `[x]` **5.6 Companion-file paths in composite probe**

- _Outcome:_ `ActiveSessionInitResult` carries optional
  `companions?: { notes: string | null; atomic: string | null }`. Population gated to the `single`
  branch with Full-pattern task-list filename — no extra I/O on `multiple` / `none` paths or
  non-matching filenames (Lite `tasks.md`, `[none]`). Replaces the agent-side `ls` of the task-list
  directory at orientation; same pattern as 5.0 (let probe carry orientation-relevant state). Lite-
  mode handling (likely a separate path entirely under ARC Operating Modes WU) deferred — callback
  note added to `plan-arc-modes.md` header.

    - `[x]` **5.6.a Companion resolution + envelope shape (test-first)**
        - Derivation in `resolveSessionInit` (`commands/active/status.ts`) reads `**Task List:**`
          verbatim, regex-matches `^tasks-(.+)\.md$`, stats `notes-{stem}.md` / `atomic-{stem}.md`
          in the same directory, emits paths relative to cwd (forward-slash normalized) or `null`
          per file. Nine behaviors covered across integration + formatter tests (resolution ×
          companion-presence permutations + composite carry-through + rendering shapes).

    - `[x]` **5.6.b Session-init.md item 10 simplification**
        - "Companion file awareness" sub-bullet rewritten to reference `active.value.companions`
          instead of directing the agent to scan the task-list directory. Two-copy synced.

### `[x]` **5.7 Agent file surface removal + `system/briefs/` rename**

- _Outcome:_ Retired the `{AGENT}.ARC.md` surface entirely (seven package per-agent templates,
  session-init load, init/add-agent scaffolding, schema hook coverage) and renamed the containing
  directory `system/agent/` → `system/briefs/` with file-level rename `AGENT-BRIEFING.*.md` →
  `AGENT-BRIEF.*.md` to match the retained briefings. Pressure-test concluded the surface had no
  valid ARC-exclusive use case — harness-level files (`CLAUDE.md`, `AGENTS.md`, etc.) dominate on
  load order, always-in-context, and agent-specific design. Pre-revision scope ("conditional-load
  via `active` frontmatter") retired; no other session-init-loaded files ship as unpopulated
  templates. Post-removal `system/briefs/` contains only the three session-init briefings; rename
  aligns directory name with actual category (orientation documents). Pre-implementation audit
  (2026-04-25) folded into subtask scope; execution order
  5.7.b → 5.7.f → 5.7.a → 5.7.c → 5.7.d → 5.7.e → 5.7.g → 5.7.h → 5.7.i — docs-only first, then
  recipe cleanup, then file deletes/renames, preserving test-suite green across each task boundary.

    - `[x]` **5.7.a Package per-agent source removal + agent classification retire**
        - Single commit retiring the source surface and classification path. Deleted seven per-tool
          templates from `packages/arc-framework/arc/system/agent/` plus both `template-agent.md`
          copies. Removed `frontmatter/agent.ts` + sibling tests; pruned `parseAgentFrontmatter`
          from `frontmatter/index.ts`; in `validate-frontmatter.ts` dropped the `agent`
          PathClassification, `AGENT_PATH`/`AGENT_NAME` regexes, and dispatch case.
        - _`includes` operator retirement (in-flight scope expansion):_ With per-tool agent files
          retired, the only consumer of the recipe `includes` operator was gone — both
          `init-recipe.json` and template `<!-- arc:if -->` blocks gate exclusively on `==` (and
          templates also `!=`). Pulled into this commit. `template/recipe.ts` regex narrowed to
          `==`; `evaluateCondition` doc + body collapsed to equality.

    - `[x]` **5.7.b Session-init integration removal**
        - Removed Step 4 item 3 (agent-specific file conditional load); renumbered items 4–11 → 3–10
          throughout. Updated every renumber-impacted reference (Step 2 contributor cue, reading
          rule, parallelism guidance, item 7 inner cross-refs, Contributor Session Path). Dropped
          `{AGENT}.ARC.md` row from `AGENT-BRIEFING.ARC.md` Key Documents table.
          `DEV-RULES.ARC.md § When to Load Additional Guidance` "session-init item 11" → "item 10"
          stale-by-renumber cross-reference fixed.

    - `[x]` **5.7.c Directory and file renames**
        - 8 `git mv` rename ops (all staged as `R` preserving history). Updated `CONFIGURABLE_FILES`
          in `classification.ts:74` and `init-recipe.json` unconditional `include_files` (briefs-
          path migration absorbed from 5.7.f). Path-existence-coupled tests updated across
          `recipe.test.ts`, `__tests__/integration/init.test.ts`, `__tests__/unit/init.test.ts`,
          plus the two files 5.7.a deferred (`validate-package-neutrality.test.ts`,
          `validate-links.test.ts`). Manifest rename-only; pristine hashes preserved.

    - `[x]` **5.7.d Cross-reference + content updates**
        - Swept all live framework docs, source, hooks, and scripts for `system/agent/` /
          `AGENT-BRIEFING` patterns. Brief files self-references (titles + Key Documents table +
          closing pointers) updated; "agent-specific guidance" trailers reframed at harness-level
          files. Workflows: `session-init.md`, `add-agent.md`, `02_define-project.md`,
          `maintain-project-docs.md`, `01_verify-and-configure.md` content section deletions per
          spec. Constitution + strategies: `DEV-RULES.ARC.md`, `strategy-session-operations.md`,
          `strategy-file-classification.md`, `strategy-package-project-sync.md` (Init-selected
          agent files subsection removed). Reference + READMEs: `META-PRD.md`, `PROJECT-STATUS.md`,
          `TECHNICAL-OVERVIEW.md`, etc. Skills + hooks + scripts + source. Manifest pristine_hash
          recomputed for the 3 briefs entries (content changed in this commit).

    - `[x]` **5.7.e Subdir README rewrite**
        - `system/briefs/README.md` rewritten wholesale in both trees (154 → 41 lines, ~73%).
          Retired dual-hub + tool-files architecture framing, "Why Two Hub Files", "What Belongs in
          Tool-Specific Files", and per-tool template descriptions. New scope: How briefs work +
          Loading model, per-file Files table, customize-PROJECT adoption guidance, "Agent-Specific
          Guidance Lives Outside ARC" section pointing at harness-level files. Initial draft framed
          CONTRIBUTOR as reading _instead of_ PROJECT brief; corrected — Contributor Session Path
          is additive, not substitutive.

    - `[x]` **5.7.f `arc init` recipe cleanup**
        - Removed `template-agent.md` from unconditional `include_files`; removed seven per-tool
          conditions for `system/agent/{TOOL}.ARC.md`. Recipe now produces a clean install with no
          per-agent file scaffolding regardless of `--tools` selection; `tools` prompt drives skill
          placement only. Briefs-path entries left for 5.7.c. Two obsolete tests deleted —
          `installs CLAUDE.ARC.md (tool-conditional file)` and `init with --tools claude,codex
          installs agent-specific files` (recipe-driven assertions belonging with this change).

    - `[~]` **5.7.g `add-agent.md` verification (no-op confirmed)**
        - Workflow already in post-pivot shape (orient → skills → restart) per commit `27174b8`
          (Task 4.5.d). Path/filename updates landed in 5.7.d. Two-copy sync verified via
          `diff -q`. No file changes.

    - `[x]` **5.7.h CHECK 12 hook revision**
        - CHECK 12 in both `pre-commit` copies: comment header trimmed to "Frontmatter schema
          validation (methods / extensions)"; regex narrowed to drop the `|agent` alternation. Hook
          now skips invocation on briefs-only staged sets.
        - _In-flight scope expansion (5.7.d misses caught by 5.7.i grep verification):_ Three
          live-surface references the 5.7.d sweep missed, folded into this commit:
          `strategy-session-operations.md:315-316` (CLAUDE.ARC.md context-monitoring example
          reframed at harness-level files); `strategy-configurability-architecture.md` "Agent-
          specific files" rows removed from both content-channel inventory and design-commitment
          conventions tables.

    - `[x]` **5.7.i Sync verification + phase acceptance**
        - All verification bullets green: two-copy sync via `diff -q`; grep across `.arc/system/`,
          `.arc/reference/{constitution,strategies,templates}/`,
          `packages/arc-framework/{src,scripts,arc}/` for
          `AGENT-BRIEFING|system/agent|{AGENT}.ARC.md|{TOOL}.ARC.md` returns zero matches
          (remaining matches confined to `reference/adr/`, `reference/analysis/`,
          `reference/research/`, and active-WU artifacts — explicitly excluded per spec); CHECK 12
          hook regex no longer matches briefs-only staged sets.
        - _Release-notes bullet retired:_ Original spec called for a `versions.json` entry
          documenting breaking changes for adopters. Superseded by `plan-arcd-rebrand` PRD
          (backlog), which explicitly opts out of release-notes for the package transition — first
          published `@arcd/cli` re-publishes fresh under the new name with all session-init-
          optimization breaking changes absorbed pre-publication. Matching WU-wide success
          criterion at the bottom of this task list also retired.

### `[x]` **5.8 Init + handoff workflow audit — surface tightening, externalization, output discipline**

- _Lens:_ Treat `session-init.md` and `session-handoff.md` as paired endpoints. Apply three
  lenses: (1) structural externalization of role-conditional content; (2) inline prose tightening
  of Steps 7+8 + Trust Hierarchy; (3) operational efficiency (speed audit, output discipline,
  structured-summary field bounds). All edits two-copy synced.

- _Scope refresh note:_ Original 5.8.a/b/c premises stale — 3.R.k.f+g restructured the 8-step
  shape; 4.2.e + 4.2.g + 5.7.b incrementally tightened Step 4; Step 7 was rewritten in 5.0.e.
  Folded into a fresh scope rather than executed as written. Pre-implementation audit
  (2026-04-27) folded into subtask scope.

    - `[x]` **5.8.a Preamble + wrapper retirement + step header phrasing pass**
        - _Outcome:_ Both copies of `session-init.md` and `session-handoff.md` drop preamble
          (When-to-use / Session-lifecycle-assumption / Design-context) and wrapper headings
          (`## Steps` / `## Handoff Protocol`) — H1 → H2 directly. Step headings lifted to H2
          (intra-step H4 → H3). Step 8 renamed "If Context Seems Mismatched" → "Handle Context
          Mismatches" (imperative, parallel with action-verb steps). No content semantics
          changed; cross-references checked clean.

    - `[x]` **5.8.b Contributor path offload to `session-init.contributor.md`**
        - _Outcome:_ New `session-init.contributor.md` (both copies, ~37 lines) carries the
          divergent surface — Step 4 item 7+, Step 6 skip, Step 7 contributor orientation. Step 2
          contributor cue rewritten to point at the offload doc; Contributor Session Path
          blockquote retired; Step 6's redundant "skip when contributor" sentence retired.
          `init-recipe.json` and `manifest.json` updated for the new file.

    - `[x]` **5.8.c Step 7+8 + Trust Hierarchy tightening**
        - _Outcome:_ Tier 2 three-numbered-step list collapsed to a single sentence; SESSION-NOTES-
          vs-git Tier 1 example dropped (implied by trust order); Step 7 opener tightened from
          three sentences to bare imperative ("Produce the orientation summary."). Step 7 field
          descriptions left for 5.8.d. Net ~9 lines tightened, no semantic change.

    - `[x]` **5.8.d Structured-summary field bounds**
        - _Outcome:_ Step 7 field placeholders rewritten as bounds — Last Completed / Current Task
          one line each; Blockers `none` or freeform unbounded; Next action one line on-task-list,
          unbounded off-task-list. Anti-pattern note added: "Restating the Next Task's full
          description from the task list." Confirm Handoff mirrors: Session summary bullets `<hash> —
          <outcome>` one line; Next session one line on-task-list; Uncommitted work omitted entirely
          when nothing uncommitted. Cross-references SESSION-NOTES "commit-by-commit narration"
          anti-pattern.

    - `[x]` **5.8.e Output discipline guardrail**
        - _Outcome:_ Five-line "Output discipline" callout added at the top of both `session-init.md`
          and `session-handoff.md` (both copies), placed between H1 and the first step heading.
          Three permitted-text categories: problems/blockers, judgment calls not inferable from
          tool stream, flow-control pivots. Scope-limited override of harness-default narration
          cadence noted explicitly.

    - `[x]` **5.8.f Speed audit + tool-call discipline**
        - _Outcome:_ Five round-trip eliminations codified in `session-init.md` (both copies):
          combined-pull single Bash on combined-accept; drop post-pull re-probe on success; Step 4
          Parallelism made prescriptive (items 1–6 + SESSION-NOTES + active-status-file in a single
          tool-message); SESSION-NOTES `test -f` precheck retired (Read handles missing files);
          structural-mapping grep consolidated to one call returning all phase positions. Baseline
          breakdown (~24 → ~9 round-trips) documented in `notes-session-init-optimization.md` §
          Phase 5.8 Session-Init Speed Baseline. Wall-clock not measured — round-trip count is the
          load-bearing proxy.

    - `[x]` **5.8.g Externalization candidates — per-candidate dispositions**
        - _Outcome:_ Per-candidate dispositions for the original 5.8.d candidate list:
            - Lifecycle/Design-context paragraphs → **drop** (5.8.a — preamble retired).
            - Contributor Session Path blockquote → **extract** (5.8.b — offloaded to
              `session-init.contributor.md`).
            - Step 8 Trust Hierarchy → **keep + tighten** (5.8.c — ~9 lines compressed, examples
              and substance preserved per user direction).
            - Item 9 SESSION-NOTES load errors → **already extracted** (4.2.e — single-line pointer
              to `strategy-session-operations.md § SESSION-NOTES Load Error Recovery`).
            - Step 2 probe-failure fallback → **keep inline** (4 lines; in-context-during-failure
              reliability value outweighs the marginal externalization gain — agents hitting this
              branch are already in a degraded state and benefit from inline recovery prose).
        - Manifest `pristine_hash` recomputed for `session-init.md`, `session-handoff.md`, and the
          new `session-init.contributor.md` to reflect post-5.8 stable content.

### `[x]` **5.9 Step 1+2 merge + contributor freshness/orientation**

- _Lens:_ Pre-implementation audit (2026-04-27) during 5.8.b surfaced two improvements that
  weren't in the original 5.8 scope: (1) Steps 1 (`pwd`) and 2 (composite probe) are independent
  read-only operations that can chain in a single Bash call, saving one round-trip; (2)
  `session-init.contributor.md` skipped Step 6 entirely and defaulted Step 7 orientation to a
  generic "Ready for work", missing the contributor's freshness check (SESSION-NOTES handoff
  hash applies universally) and status-contributor.md state surfacing. All edits two-copy synced.

    - `[x]` **5.9.a Step 1+2 merge — "Resolve Session Context"**
        - _Outcome:_ Steps 1+2 merged into a single Step 1 "Resolve Session Context" — body chains
          `pwd && arc status --session-init --json` as one Bash call. Steps 3–8 renumbered to 2–7
          across `session-init.md` (both copies). Cross-references swept in `session-init.md` and
          `session-init.contributor.md` (both copies). Manifest pristine_hashes recomputed for the
          two affected rendered files.

    - `[x]` **5.9.b Contributor freshness + orientation improvements**
        - _Outcome:_ Contributor § Step 5 recast from "Skip" to "Contributor freshness check" —
          SESSION-NOTES handoff-hash check kept universal; status-contributor.md surfacing added;
          maintainer next-work-discovery dropped. § Step 6 orientation gained conditional field-
          bound surfacing when status-contributor.md provides state (mirrors maintainer field
          bounds from session-init.md § 6); minimal "Ready for work" form retained when absent or
          empty. Manifest pristine_hash recomputed for `session-init.contributor.md`.

### `[x]` **5.10 Contributor active resolution — mirror maintainer under `user/{identity}/`**

- _Lens:_ Pre-implementation audit (2026-04-27) surfaced an architectural inconsistency in the
  original 5.10 scope: contributor active state used a singleton `status-contributor.md` at user
  root while task lists lived in a flat `user/{identity}/active/` tree, forcing the probe to
  role-branch on file-shape and forcing 5.10.c to disposition special-case companions. Cleaner
  shape: contributor flow is "maintainer flow rooted at `.arc/user/{identity}/`" — canonical
  pattern is `user/{identity}/active/status-{name}.md` (flat full-layout, no category subdir;
  lite at `user/{identity}/active/status.md`) with optional `tasks-{name}.md` /
  `notes-{name}.md` / `atomic-{name}.md` companions per 5.6. Single resolution algorithm
  parameterized by root; naturally scales 0/1/N WUs; no special-case file shape. ADR-014
  amendment retires the singleton; downstream consumers (probe, session-init, session-handoff,
  AGENT-BRIEF) update in lockstep.

    - `[x]` **5.10.a ADR-014 amendment + contributor canon docs**
        - _Outcome:_ ADR-014 amended (2026-04-27): singleton `status-contributor.md` retired in
          favor of `user/{identity}/active/status-{name}.md` (flat full-layout). Forward-pointer
          added to § Contributor planning. `AGENT-BRIEF.CONTRIBUTOR.md` + `user/README.md` (two-
          copy synced), `notes-docs-content-sweep.md`, and `analysis-modes-contributor-lifecycle-
          stress-test.md` realigned to the new convention. Markdown lint clean.

    - `[x]` **5.10.b Probe role-aware active resolution (test-first)**
        - _Outcome:_ `ActiveSessionInitOptions` carries optional `identity` + `role`;
          `readActiveStatusCandidates` accepts `{ rootSegments, scanShape }` (default
          `[".arc","active"]` + `subdir`; contributor flow passes
          `[".arc","user",identity,"active"]` + `flat`). `runActiveSessionInitStatus` dispatches
          on `role === "contributor"`: identity-null short-circuits to `resolution: "none"`
          with a warning naming the role/identity mismatch; identity-set scans the contributor
          root flat. Companion derivation unchanged — `**Task List:**` filename pattern still
          drives `notes-{stem}.md` / `atomic-{stem}.md` resolution under whichever root
          resolved. `SessionInitProbes.active` signature now accepts
          `(identity, role) => Promise<...>`; the orchestrator and handler thread the pointers
          through. Tests cover all seven behaviors (i)–(vii) — unit at
          `__tests__/unit/active/status-reader.test.ts` (parameterized scan + warning text);
          integration at `__tests__/integration/active.test.ts` (8-test contributor describe
          block); composite at `__tests__/integration/status.test.ts` (one contributor-role
          scenario including companion carry-through).

    - `[x]` **5.10.c Composite + workflow + handoff consumption**
        - _Outcome:_ TS-side wiring landed alongside 5.10.b — `handlers/status.ts` threads
          `identity` + `role` into the active probe, `SessionInitProbes.active` signature
          updated to `(identity, role) => Promise<...>`, orchestrator forwards the pointers.
          `session-init.contributor.md` (both copies) Step 3 (item 7+) rewritten to mirror
          maintainer item 7 — items 7/9/10 consume the envelope's role-resolved active slot
          (no singleton lookup), AGENT-BRIEF.CONTRIBUTOR.md folds into item 8 alongside
          SESSION-NOTES under the parallelism rule, items 9–10 gate on `**Task List:**` ≠
          `[none]`. § Step 5 dropped the Status-contributor bullet; freshness is the universal
          handoff-hash check (gitignored personal active path has no git-history-based
          freshness signal). § Step 6 orientation pulls fields from `active.value` using
          maintainer's field bounds; `resolution === "multiple"` runs the disambiguation
          algorithm before producing orientation; `resolution === "none"` retains the minimal
          "Ready for work" form. `session-init.md` (both copies) Step 1 probe-failure
          fallback names the role-resolved scan path. `session-handoff.md` (both copies)
          contributor blockquote and Step 5 safety-check note refined — contributors update
          their personal `.arc/user/{identity}/active/status-{name}.md` at handoff step 4
          (gitignored, no commit-time staging) but skip the project-level safety-check commit.
          `DEV-RULES.ARC.md` (both copies) § Work status accuracy Contributor override
          clarifies the project-level vs personal split and the handoff update trigger.
          Manifest `pristine_hash` recomputed for `session-init.contributor.md`,
          `session-init.md`, `session-handoff.md`, and `DEV-RULES.ARC.md` — `arc health` clean.

### `[x]` **5.11 Phase 5 close — Tier 2 quality gates**

- _Outcome:_ Tier 2 gates clean — `lint:md` (223 files, 0 errors), `lint:ts`, `lint:sh`,
  `typecheck`, `typecheck:test`, `npm test` (1066 unit+integration, 45 e2e). Framework-sync
  verified for the four edited file pairs (`session-init.contributor.md`, `session-init.md`,
  `session-handoff.md`, `DEV-RULES.ARC.md`) — `arc health` reports no drift on these. Targeted
  session-init re-run skipped — not viable as a synthetic spot-check; will be validated
  through actual use.

---

## **Phase 6:** Session-Type Conditional Loading

_Purpose:_ Planning, execution, and integration sessions have different needs. The `Working On:`
type prefix + auto-inference delivers a per-type load set without forcing user ceremony. Empirical
validation during the phase's own task work confirms the minimal set suffices.

_Note:_ Empirical validation (P2.6) is a running observation during Phase 6, not a distinct task —
each Phase 6 subtask operates a specific session type, and observed insufficiency surfaces as an
adjustment to the load-set definition plus a notes-file entry.

### `[ ]` **6.1 `Working On:` type prefix formalized in SESSION-NOTES template**

- _Goal:_ Template documents prefix pattern explicitly; agents writing handoff know the convention.
    - File: `packages/arc-framework/templates/user/SESSION-NOTES.md` (plus `.arc/user/` instances —
      note: gitignored, so only the package template ships)
    - Document prefix pattern: `[planning: name]`, `[execution: name]`, `[integration: name]`
    - Include one-line rationale inline (session-type awareness drives conditional load)

### `[ ]` **6.2 session-handoff writes the prefix explicitly**

- Update `.arc/system/workflows/arc/session-lifecycle/session-handoff.md` to instruct the agent to
  compute current session type and write the prefix
- Type-resolution rules parallel Phase 6.3 inference (so handoff and init use the same logic, just
  in opposite directions)
- Two-copy sync

### `[ ]` **6.3 Session-init inference logic (test-first)**

- _Goal:_ When SESSION-NOTES is absent or prefix is missing, infer from active status file signals
  and branch state.
    - Placement: documented in `session-init.md` Step 2; if logic is non-trivial, extract to a CLI
      helper (`packages/arc-framework/src/lib/session-type/`) that agent can invoke

    Build `test-first` (one behavior at a time):
    - Explicit prefix in SESSION-NOTES → honored without inference
    - Active status file `**Task List:** [none]` + backlog/planning context → `planning`
    - Active status file with incomplete task list → `execution`
    - Active status file signals integration-ready → `integration`
    - Branch in integration phase (e.g., branch name matches integration convention) → `integration`
    - Between WUs with no active status file → `planning`
    - Genuinely ambiguous signals → prompt user (surface in session-init Step 6 orientation)

### `[ ]` **6.4 Per-type load set implementation**

- _Goal:_ session-init Step 2 branches on resolved session type; loadset matches updated load model.
    - Update `session-init.md` Step 2 to key load decisions off the resolved session type
    - Loadset specification (updated post-3.5 — PRD P2.3 table refresh folded into Task 3.10):
        - All types: Items 1–7, active-extensions list (single grep per 3.5.b), SESSION-NOTES,
          active status file if present. Methods not loaded at init for any session type — they
          load at workflow trigger only
        - Execution + Integration only: Item 10 (task list partial read)
        - Core workflow: execution → `3_process-task-loop.md`; integration → `integrate-work-unit.md`;
          planning → none today, forward-compatible with `refine-plan-loop.md` if Expanded Planning
          Path WU lands
    - Two-copy sync

### `[ ]` **6.5 CLI template updates**

- _Goal:_ `arc init` and `arc join` deliver updated SESSION-NOTES template to adopters and
  contributors.
    - `arc init` sources SESSION-NOTES from `packages/arc-framework/templates/user/SESSION-NOTES.md`
      (already done in 6.1); verify initialization writes the template correctly
    - `arc join` uses same template; verify no structural divergence
    - Update any related CLI test fixtures if template content is asserted in tests

### `[ ]` **6.6 Session-type test coverage**

- Unit: inference logic test cases from 6.3 (expand if new cases surface)
- Integration: session-init with explicit prefix, with inferred prefix, with ambiguous signals
  (expected: user prompt)
- E2E: fresh session-init across each type variant produces the correct load set (assert loaded
  files / skipped files per PRD P2.3)

### `[ ]` **6.7 Phase 6 close — Tier 3 quality gates + empirical observation note**

- Full quality gate pass
- Record empirical observation: did the minimal load set suffice for each session type operated
  during 6.1–6.6 work? Append to notes file. Any adjustments applied as revisions (R-scheme) to
  Phase 6 tasks

---

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

- _Note:_ The verification workflow conducts Tier 3 quality gates, success criteria validation,
  atomic task resolution, measurement (V.1 — tokens at orientation completion vs ~75–80k baseline;
  target ≥25% drop to ≤60k), audit quality spot-check (V.2 — 3–5 random extracted passages verified
  as operational vs non-operational), and late-session verification observation noted for the next
  task-executing WU (V.3 — organic, not synthetic).

---

## Success Criteria

- `[ ]` `arc-methods.md` and `arc-extensions.md` retired; replaced by per-file directories in `system/methods/` and
      `system/extensions/` (both copies)
- `[ ]` Session-init Step 2: methods not loaded at init (trigger-time only); extensions enumerated via single `grep`
      for `^active: true` producing the active-extensions list carried in session context; fire-point directives
      consult the list by name; method and extension bodies load on-demand at workflow trigger / fire point
- `[ ]` Reliable-trigger CI check (`npm run lint:arc`) active and passing on `main`; reads workflow frontmatter only
- `[ ]` All workflows under `system/workflows/**/*.md` carry schema-conformant YAML frontmatter (`audience`, `purpose`,
      `arc.methods`, `arc.extensions`); body-level "Method dependencies" prose preambles retired
- `[ ]` "Method and extension loading" subsection present in DEV-RULES.ARC § Verification and Discovery (both copies)
      with agent-side compliance rule (load frontmatter-declared methods/extensions before executing the workflow);
      paired author-side declaration rule lives in `strategy-workflow-authoring.md § Author-side Declaration Rule`
      (T3 on-demand, not every-session)
- `[ ]` ADR-013 Tier 2 amendment reflects the implemented per-file model and constitutional rule
- `[ ]` Observed tokens-at-orientation-completion drops ≥25% from baseline (~75–80k → ≤60k) in a clean maintainer session
      with active task list
- `[ ]` Orientation summary correctness verified (active work state, blockers, non-default config, freshness, next action
      remain accurate across sampled session types)
- `[ ]` Operational-context audit Tier 1–3 complete; extractions staged in `notes-docs-content-sweep.md`;
      `[TODO-docs-site]` placeholders greppable across touched files
- `[ ]` `template-tasks.md` extracted to `.arc/reference/templates/`; `2_generate-tasks.md` hosts Quick Format Checklist;
      `strategy-task-list-formatting.md` trimmed to rules-only
- `[ ]` Frontmatter schema + D7a link-resolution + D7b extension-point match pre-commit hooks active and tested
- `[ ]` Session-type conditional loading active; `Working On:` type prefix formalized; auto- inference handles the common
      cases without user prompts
- `[ ]` `arc init` and `arc join` deliver updated SESSION-NOTES template with type prefix convention
- `[ ]` Framework-sync integration test passing; two-copy sync clean across methods, extensions, and touched
      workflow/rules files
- `[ ]` All quality gates pass (markdown lint, TypeScript lint, shellcheck, typecheck, tests, build — zero violations)
- `[ ]` Ready for integration

---

[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
