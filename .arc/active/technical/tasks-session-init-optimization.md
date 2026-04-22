# Task List: Session-Init Optimization

- **PRD:** `.arc/active/technical/prd-session-init-optimization.md`
- **Branch(es):** `technical/session-init-optimization`
- **Base Branch:** `main`

## Overview

**Purpose:** Reduce session-init token cost from ~75–80k to ≤60k at orientation completion by retiring the aggregate
`arc-methods.md` / `arc-extensions.md` files in favor of per-file directories with YAML frontmatter, auditing
always-loaded content for operational relevance, narrowing partial-reads, and introducing session-type conditional
loading — without regressing orientation correctness or compliance reliability.

Notes file: `notes-session-init-optimization.md` (alternatives, compliance-reliability grounding, phase sequencing
rationale, risks, research references).

## Scope

### Will Do

- Retire `arc-methods.md` and `arc-extensions.md`; migrate to per-file `system/methods/` and `system/extensions/`
  directories with YAML frontmatter (both copies — package source + `.arc/`)
- Add "Method and extension loading" constitutional rule to DEV-RULES.ARC § Verification and Discovery; absolute,
  hedge-free framing
- Draft ADR-013 Tier 2 amendment; sanity-check against the implemented model at Phase 3 close
- Reliable-trigger CI audit enumerating methods × workflow/DEV-RULES/strategy references
- Pre-commit hooks: frontmatter schema validation, D7a link-resolution, D7b extension-point match
- Operational-context audit across Tier 1 (always-loaded docs), Tier 2 (high-frequency workflows), Tier 3 (remaining
  workflows); extractions staged in `notes-docs-content-sweep.md`
- Task-list-formatting restructure: extract `template-tasks.md`, relocate Quick Format Checklist into
  `2_generate-tasks.md` Step 4, trim `strategy-task-list-formatting.md`
- Partial-read narrowing: QUICK-REFERENCE, task-list current-section, reliability-gated DEV-RULES sections
- Session-init.md Step 2/4/7 restructure to match audit outcomes
- Session-type conditional loading: `Working On:` type prefix formalized, auto-inference rules, per-type load sets, CLI
  template updates
- Test coverage for new infrastructure (frontmatter parser, hooks, inference logic)
- Release-notes entry documenting breaking changes

### Won't Do

- Automatic migration code for `arc update` (zero adopters; dev repo maintains two-copy sync manually; external beta
  installers reinstall fresh)
- Docs-site-side integration of extracted content (handled by `plan-docs-content-sweep.md`)
- Starlight migration / docs-site build work (handled by `prd-arcd-docs-site.md`)
- Adopter-facing methods/extensions extensibility (framework-fixed by design)
- Document classification system (T1/T2/T3) structural changes (out of scope; revisit later)
- `arc-config.yml` structural changes (comments stay; content-trim only where individual comments cross into rationale)

---

## Tasks

### **Phase 1:** Workflow Trigger Contract + Per-File Restructure + CI Enforcement

**Purpose:** Establish the workflow→method/extension trigger contract end-to-end: define a structural YAML frontmatter
schema, codify the author-side declaration rule, migrate all in-scope workflows, pull forward the per-file
methods/extensions restructure (so the audit script lands on final structure with no legacy-aggregate fallback), rename
the `pre-merge-review` method to `diff-review` (fixing the method/extension name collision), and enforce coverage in CI.
Replaces brittle prose-grep enforcement with a structural one. Aggregate files (`arc-methods.md`, `arc-extensions.md`)
remain in place until Phase 3 retires them — per-file becomes authoritative from Task 1.4 forward.

- [x] **1.1 Method and extension trigger coverage audit**

    **Goal:** Every method and extension has ≥1 qualifying reference in a reachable workflow.

    **Outcome:** All 16 methods/extensions pass. 1.1.a catalog + 1.1.b classification recorded in
    `notes-session-init-optimization.md`. 1.1.c no-op. See § Phase 1 Classification (Task 1.1.b) § Overall verdict.
    - [x] **1.1.a Enumerate methods and extensions**
        - Catalog appended to `notes-session-init-optimization.md` § Phase 1 Trigger Coverage Audit — one subsection per
          method (8) and per extension (8), each with self-definition line refs and a full list of external references
          (file:line + surface-kind annotation)
        - Scope applied: `system/workflows/**/*.md`, `reference/constitution/*.md`, `reference/strategies/**/*.md`,
          `system/agent/*.md`. Excluded `reference/adr/`, `reference/archive/`, and out-of-scope trees (`active/`,
          `backlog/`, `reference/analysis/`, `reference/TECHNICAL-OVERVIEW.md`, `system/skills/`)
        - Observations block flags pre-classification signals for 1.1.b: three extensions (post-unit-quality,
          post-context-load, pre-stage-review) have no strategy/constitution references — workflow trigger +
          self-definition only; one false-match flagged (`strategy-session-operations.md:22` on session-state); strategy
          classification tables and DEV-RULES § When-to-Load bullets marked as informational candidates

    - [x] **1.1.b Classify each reference against the reliable-trigger bar**
        - Classification appended to `notes-session-init-optimization.md` § Phase 1 Classification (Task 1.1.b) — rubric
          block + summary tables for methods and extensions + reliable-trigger location list + judgment-call record
        - **Outcome — no flags.** All 8 methods and 8 extensions have ≥1 reliable trigger. Reliable counts: methods 2–7
          (avg ~3.25); extensions exactly 1 each (the structural `If [X extensions] are configured, execute them`
          wrapper at the firing workflow)
        - Hedged count: 0 across all 16 entries. Unreachable count: 0
        - Method-dependencies blocks (e.g., `3_process-task-loop.md:16–18`, `prepare-commits.md:14–15`,
          `integrate-work-unit.md:33–34`, `session-handoff.md:19`) classified reliable alongside in-step links — each
          bullet is a targeted markdown-link under an imperative preamble ("load on first reference"). Documented in
          judgment-calls
        - `strategy-session-operations.md:22` dropped from catalog (false regex match on `#session-state-portability`
          anchor — not a reference to the `session-state` method)
        - Non-link prose pointers (`integrate-work-unit.md:148` plain-text "see `arc-methods.md` §
          commit-context-format") classified informational — deferred to Phase 3.6 cross-reference sweep for relinking
          to `system/methods/` paths
        - CI-audit (Task 1.4) implication recorded: enumerator must treat method-dependencies bullets and in-step links
          equivalently, and disambiguate substring matches on anchors (e.g., `#session-state` vs
          `#session-state-portability`)

    - [~] **1.1.c Fix coverage gaps surfaced by the audit** — No-op: 1.1.b returned zero gaps across all 16
        methods/extensions. See `notes-session-init-optimization.md` § Phase 1 Classification (Task 1.1.b) § Overall
        verdict.

- [x] **1.2 Define workflow frontmatter schema + author-side declaration rule**

    **Goal:** Structural contract for declaring method/extension triggers in workflow files, replacing prose
    "Method dependencies" preambles with a machine-readable frontmatter block.

    **Outcome:** New dedicated `strategy-workflow-authoring.md` houses the schema, author-side declaration
    rule, and body conventions (rules-only catalogue, ~70 lines — same shape Task 4.5 will leave
    `strategy-task-list-formatting.md` in, applied here from creation). New `template-workflow.md` in
    `reference/templates/` gives framework + adopter workflow authors a canonical skeleton. STRATEGY-INDEX
    entry added. `configurability-architecture.md` carries a short pointer in its content-customization
    section ("Authoring project workflows"); no inline schema. `DEV-RULES.ARC.md § When to Load Additional
    Guidance` gets one bullet pointing at the strategy (load on-demand — workflow authoring is a rare
    event and doesn't belong in T1 every-session load). `session-operations.md § Method and Extension
    Loading` picked up a short declaration-mechanism pointer. Schema shape: `purpose` first, `audience:
    agent` with inline `# agent | collaborative (human and agent) | human` comment, `arc.methods` /
    `arc.extensions` arrays under protected
    namespace; angle-bracket placeholder convention for template fields that need author input.

    Placement discussion summary: original spec placed schema in `strategy-session-operations.md`; moved
    to a dedicated strategy after discussion — (a) session-operations is about loading mechanics, not
    file-structure spec; (b) `configurability-architecture.md` owns customization mechanisms but adding
    workflow authoring broadens its scope; (c) a dedicated strategy mirrors `strategy-task-list-formatting`
    exactly and gives adopter-authored project workflows a clean discovery surface.

    Two-copy sync applied across both `.arc/` and `packages/arc-framework/arc/`. Tier 1 markdown lint
    clean (182 files, 0 violations).

- [x] **1.3 Migrate all workflows to frontmatter**

    **Outcome:** All 25 workflow files under `system/workflows/` now carry schema-conformant YAML
    frontmatter per `template-workflow.md`. Body-level `**Audience:**`/`**Purpose:**` callouts and
    `**Method dependencies**` prose preambles removed; in-step markdown links to methods/extensions
    preserved for reader navigation. Unused `[arc-methods]`/`[session-init]` ref defs cleaned up
    where their only usage was the retired method-dep block. Two-copy sync applied where applicable;
    `workflows/project/` single-copy. Tier 2 gate clean after each subtask; full-project lint clean
    at task close (182 files, 0 errors).

    **Ground truth applied:** `arc.methods`/`arc.extensions` arrays populated per
    `notes-session-init-optimization.md` § Phase 1 Classification § Reliable-trigger locations.
    Workflows with no reliable triggers omit the `arc:` block per author-side rule
    (`strategy-workflow-authoring.md` § Author-side Declaration Rule).

    **Audience mapping:** Schema expanded mid-task from binary (`agent | dual`) to three values
    (`agent | collaborative (human and agent) | human`) after discussion surfaced that `dual` was
    opaque in isolation and conflated two distinct cases. Final mapping: `agent` for agent-executed
    workflows (bulk of the corpus); `collaborative (human and agent)` for `1_create-prd`,
    `2_generate-tasks`, `activate-work-unit`, `deactivate-work-unit`, supplemental setup,
    initial-setup workflows; `human` for `session-loop.md` (describes the user's loop; not loaded
    by agents during session lifecycle). Template + strategy doc updated to match; pre-commit
    schema validation lands in a later Phase 1 task so enum enforcement was deferred and the swap
    was editorial only.

    **Follow-ons absorbed mid-task (post-initial-sweep):**

    - `prepare-commits.md` H1 brought inline with body-conventions rule: `# Commit Guide` →
      `# Workflow: Prepare Commits`. Display-text references updated: `[commit guide]` →
      `[prepare-commits workflow]` across `DEV-RULES.ARC.md` (× 2) and `3_process-task-loop.md`
      inline-link display text. Reference-definition anchors (`[prepare-commits]`) unchanged.
    - `prepare-commits.md` declares `pre-stage-review` extension in frontmatter per the
      reliable-trigger audit (in-step link at former body line 34).

    - [x] **1.3.a `arc/` top-level (3 files)** — `1_create-prd.md` (no arc block),
          `2_generate-tasks.md` (methods: test-first),
          `3_process-task-loop.md` (methods: issue-triage, quality-gate-commands, test-first;
          extensions: post-task-quality, post-unit-quality, post-task-completion)

    - [x] **1.3.b `arc/session-lifecycle/` (3 files)** — `session-init.md`
          (methods: session-state; extensions: post-context-load),
          `session-handoff.md` (methods: session-state),
          `session-loop.md` (no arc block; audience: human)

    - [x] **1.3.c `arc/work-unit-lifecycle/` (7 files)** —
          `activate-work-unit.md` (extensions: post-work-unit-activate),
          `archive-work-unit.md` (extensions: post-work-unit-archive),
          `integrate-work-unit.md` (methods: pre-merge-review, review-triage; extensions:
          pre-merge-review). `clean-work-unit.md`, `deactivate-work-unit.md`, `rotate-branch.md`,
          `verify-work-unit.md` carry no arc block.

    - [x] **1.3.d `arc/work-unit-lifecycle/planning/` (2 files)** —
          `activate-planning-branch.md`, `integrate-planning-branch.md` — both no arc block.
          Prose mention of `post-work-unit-archive` at `integrate-planning-branch.md:42` was
          classified informational in Task 1.1.b; does not declare a trigger.

    - [x] **1.3.e `arc/supplemental/` (6 files)** —
          `prepare-commits.md` (methods: commit-format, commit-context-format; extensions:
          pre-stage-review). `add-agent.md`, `integrate-external-content.md`,
          `maintain-project-docs.md`, `manage-incidental-work.md`, `verify-arc-integrity.md` carry
          no arc block.

    - [x] **1.3.f `arc/initial-setup/` (3 files)** —
          `01_verify-and-configure.md`, `02_define-project.md` (enumerated in spec). Also migrated
          `03_configure-external-integration.md` (package source only; `pm.mode: external`
          conditional install) for goal coverage — not enumerated in the original subtask list but
          a framework workflow under the same scope. All three: no arc block, audience:
          collaborative (human and agent).

    - [x] **1.3.g `project/` (1 file)** —
          `agent-pre-merge-review.md` (methods: review-triage; single-copy). Overview-prose
          references to `pre-merge-review` extension and `review-triage` method at lines 6–8 were
          classified informational in Task 1.1.b; reliable triggers for `review-triage` are the
          in-step directives at lines 36, 78, 92.

- [x] **1.4 Per-file restructure + method rename (structural prep for CI audit)**

    **Goal:** Establish the per-file `system/methods/` and `system/extensions/` layout the audit script enumerates from,
    and fix the `pre-merge-review` method/extension name collision by renaming the method to `diff-review`. Pulls
    forward what was Phase 3.1 + 3.3 + 3.4 + 3.5 so Task 1.5's audit lands on final structure with no legacy-aggregate
    fallback branch.

    **Aggregate handling:** `arc-methods.md` and `arc-extensions.md` stay in place until Phase 3 retires them —
    session-init Step 2 still scans them for override presence through Phase 2 close. Per-file becomes authoritative
    from this task forward; aggregates are frozen snapshots pending retirement.

    - [x] **1.4.a Rename `pre-merge-review` method → `diff-review`; broaden framing to generic activity contract**

        **Outcome:** Method renamed to `diff-review` across both copies; framing broadened to generic activity contract
        with primary-caller annotation on `integrate-work-unit.md`. Extension keeps name `pre-merge-review`. Ref-def
        anchor renamed `[arc-methods-pmr]` → `[arc-methods-diff-review]` everywhere it appeared
        (`arc-extensions.md`, `integrate-work-unit.md`).

        **Files touched (two-copy sync applied to framework files; single-copy to project files):**
        - `arc-methods.md` — heading, anchor, Contents entry, Method Dependencies table row, Workflow/When/Contract
          framing, `.override`/`.default` subsection names, (integration)-context-footer instruction generalized
        - `arc-extensions.md` — contract cross-references in `pre-merge-review` extension (text + ref-def anchor)
        - `integrate-work-unit.md` — frontmatter `arc.methods` entry, in-step markdown-link + display text, ref-def
        - `arc-config.yml` — inline comment under `review.pre_merge`
        - `integrate-external-content.md` — method example list
        - `strategy-session-operations.md` — Method Classification by Trigger table row
        - `adr-013-adopt-on-demand-method-loading.md` — method table row (single-copy)
        - `analysis-cross-cutting-dependencies.md` — Methods & Dependencies table + override-coupling bullet
          (single-copy)
        - `docs/customization/methods.md` — Methods table + Method Dependencies table (single-copy)
        - `verify-integrity.sh` — both method-list for-loop entries (extension for-loop preserved)

        **Preserved references (extension / moment-name / project-specific):**
        - `project/agent-pre-merge-review.md` — entirely about the extension; no changes
        - `arc-task-review/SKILL.md` — prose reference to "the integration workflow's pre-merge-review" as
          moment-language (not a link), preserved
        - `integrate-work-unit.md:184` step heading `#pre-merge-review` anchor — moment-name for the step, preserved
        - `strategy-session-operations.md:61, 176` — both refer to the extension, preserved
        - Step-heading anchors, frontmatter `arc.extensions` entries, and ref-defs named after the extension

        **Out-of-spec-scope residuals (method references that still say `pre-merge-review`):**
        - Backlog: `tasks-arcd-rebrand.md` (line 447 "method: pre-merge-review") and `plan-arc-modes.md` (lines 2654,
          4895, 5440 strategy-audit meta-notes referencing the method name). Spec scope for 1.4.a is
          `system/workflows/**`, `reference/strategies/**`, `reference/constitution/**`, `system/agent/**`;
          backlog/ is out of scope. Flagged via SESSION-NOTES persistent-context for reconciliation at each
          backlog WU's activation.
        - Archive: `reference/archive/**` references left intact per ARC's "document what is, not what was"
          convention — historical docs describe the method by the name that was current at the time.

        **Tier 1 gate:** markdownlint clean across 13 edited `.md` files (both copies); shellcheck clean on
        `verify-integrity.sh` (both copies).

    - [x] **1.4.b Document per-file frontmatter schema (was Phase 3.1)**

        **Outcome:** New `### Per-file Frontmatter Schema` subsection added to
        `strategy-session-operations.md § Method and Extension Loading`, placed between the "Declaration
        mechanism" paragraph and the aggregate `### arc-methods.md` subsection — stable content (workflow-side
        trigger contract + per-file schema) leads; transitional aggregate subsections follow until Phase 3
        retires them.

        **Schema landed (revised from 1.4.b spec):**
        - Methods: `name`, `description`, `related`, `has-override`
        - Extensions: `name`, `description`, `related`, `active` (was `has-steps` in the original spec —
          renamed during 1.4.c–f execution for clarity; `active: true/false` directly answers the runtime
          question the workflow asks at the fire point)
        - Spec's `workflow` field dropped — the workflow→method/extension trigger contract is already mechanical
          via workflow frontmatter (Task 1.5 audit); the reverse index (method→workflows) stays centralized in
          this strategy's "Method classification by trigger" table, which handles fan-out better than a
          per-file "primary caller" field. `workflow` would have duplicated info with no mechanical consumer
          and drifted silently. Rationale captured as a "Why no `workflow` field" paragraph in the section so a
          future author doesn't re-propose it.
        - `related` kept to preserve the override-coupling signal when Phase 3 retires arc-methods.md's
          Method Dependencies table — lands at the natural point of use (the method file being overridden).

        **Body conventions codified** in a new `### Per-file Body Conventions` subsection alongside the schema:
        H1 format (`# Method:` / `# Extension:`), preamble as a bulleted blockquote (`> - **Workflow:** ... >
        - **When:**/**Fires:** ... > - **Contract:** ... > - **Related:** ...`), structural content sections
        (`.override` / `.default` for methods, `.actions` for extensions), and ref-def convention. Bulleted form
        is mandated to prevent prettier (and similar reflow tools) from merging adjacent bold-lead metadata
        lines — same rationale as commit `0870274`.

        **Files touched (two-copy sync):**
        - `reference/strategies/arc/strategy-session-operations.md` (both copies, byte-identical via `diff -q`)

        **Tier 1 gate:** markdownlint clean on the `.arc/` copy; package copy is byte-identical and excluded
        from root lint by design (`!packages/arc-framework/arc/**` in `.markdownlint-cli2.jsonc`).

        **Downstream implications:**
        - Task 1.4.d (method migration): populate 4 fields per file, not 5; `related` populated from current
          Method Dependencies table (3 methods have coupling: commit-format ↔ commit-context-format,
          diff-review → review-triage)
        - Task 1.4.e (extension migration): populate 4 fields per file, not 5; `related` likely empty for all
          8 extensions (no coupling table currently exists for extensions — confirm at migration time)
        - Task 2.3 (ADR-013 Tier 2 amendment): scope already flagged via persistent context; add the
          `workflow`-field omission decision to the amendment's scope when drafting.

    - [x] **1.4.c Create per-file directory structure (both copies) (was Phase 3.3)**

        **Outcome:** Four directories created (methods + extensions × 2 copies). Each got a thin README with
        orientation framing (how overrides / `has-steps` work, loading-model note, classification note) plus
        an index listing the 8 entries with a terse one-liner each. General content reused verbatim from the
        header sections of `arc-methods.md` / `arc-extensions.md` — no per-method/extension detail in the
        READMEs; that lives in the per-file entries.

    - [x] **1.4.d Migrate 8 methods to per-file (was Phase 3.4)**

        **Outcome:** 8 method files created in `system/methods/` (both copies, byte-identical). Content
        preserved verbatim from `arc-methods.md` per-method sections; header levels shifted one (H2→H1,
        H3→H2); `#section-anchor` cross-references rewritten to sibling `<name>.md` links; ref-defs recomputed
        for the per-file location (`../workflows/...`, `../../reference/...`, `../arc-config.yml`, etc.).

        **Frontmatter populated per 1.4.b-revised schema (4 fields):**
        - `commit-format` · related: `[commit-context-format]`
        - `commit-context-format` · related: `[commit-format]`
        - `issue-triage` · no related
        - `test-first` · no related
        - `session-state` · no related
        - `diff-review` · related: `[review-triage]`
        - `review-triage` · no related (coupling is one-directional: diff-review depends on it, not vice versa)
        - `quality-gate-commands` · no related
        - `has-override: false` across all 8

        **Files touched (two-copy sync):** 16 new files (`.arc/system/methods/*.md` + package-copy mirror).

    - [x] **1.4.e Migrate 8 extensions to per-file (was Phase 3.5)**

        **Outcome:** 8 extension files created in `system/extensions/` (both copies, byte-identical). Same
        transformation pattern as methods: verbatim content, header bump, per-file ref-defs.

        **Frontmatter populated per 1.4.b-revised schema (4 fields):**
        - All 8 extensions — `related` omitted (confirmed: `arc-extensions.md` has no coupling table;
          the `pre-merge-review` extension references the `diff-review` method but cross-kind coupling is
          not what `related` captures)
        - `active: false` for 7 placeholder extensions (post-task-quality, post-unit-quality,
          post-task-completion, post-context-load, pre-stage-review, post-work-unit-activate,
          post-work-unit-archive) — section: `## <name>.actions` with `[No extension configured]`
        - `active: true` for `pre-merge-review` (the one extension with configured actions — CodeRabbit
          review ceremony) — section: `## pre-merge-review.actions`

        **Naming decisions during migration:** The original 1.4.b spec used `has-steps` / `.steps`; both
        renamed during execution to `active` / `.actions` to better reflect semantics (runtime state +
        generalized "actions to perform at this fire point"). Methods unchanged (`has-override` / `.override`
        — the existing terminology is crisp and there's no parallel concern).

        **Files touched (two-copy sync):** 16 new files (`.arc/system/extensions/*.md` + package-copy mirror).

    - [x] **1.4.f Tier 2 gate after structural prep**

        **Outcome:** Full markdown lint clean (`npm run -s lint:md`, 200 files in the `.arc/` tree, 0 errors).
        Package copy excluded from root lint config by design (`!packages/arc-framework/arc/**`) but is
        byte-identical to the `.arc/` copy for methods/ and extensions/ via `diff -rq`, so equally clean by
        construction. Ref-def scan across all 16 new per-file entries + 2 READMEs — every relative path
        resolves to an existing file (`../workflows/...`, `../extensions/...`, `../../reference/...`,
        `../arc-config.yml`, sibling `<name>.md`). Directory structure: 9 files each in
        `.arc/system/methods/`, `.arc/system/extensions/`, `packages/arc-framework/arc/system/methods/`,
        `packages/arc-framework/arc/system/extensions/` (8 entries + README). Total new files this phase:
        36 (16 methods + 16 extensions + 4 READMEs).

- [x] **1.5 Reliable-trigger CI audit script (test-first)**

    **Outcome:** Structural CI audit that fails when any method/extension lacks a workflow `arc.methods` /
    `arc.extensions` frontmatter declaration — no prose-grepping, no legacy-aggregate fallback.
    - **Script:** `packages/arc-framework/src/scripts/audit-method-triggers.ts`. Pure exports
      (`enumerateMethods`, `enumerateExtensions`, `parseWorkflowFrontmatter`, `buildCoverageMap`,
      `walkMarkdownFiles`, `formatMethodDiagnostic`, `formatExtensionDiagnostic`, `audit`) + guarded CLI
      entry (`fileURLToPath(import.meta.url) === process.argv[1]`). Corpus root resolved from script
      location, not `cwd`. Corpus is package-source only (`packages/arc-framework/arc/system/...`); `.arc/`
      drift is the framework-sync test's concern.
    - **Tests:** `packages/arc-framework/__tests__/unit/scripts/audit-method-triggers.test.ts` (14 tests
      covering all 9 spec behaviors). Test-first executed as a single batch — tightly coupled glue over
      `readdir` / `yaml.load` / array ops with no independent discovery value per-behavior.
    - **Key invariants:** separate coverage maps per kind (method+extension same-name collision cannot
      silently collapse); malformed YAML reported as diagnostic without crashing; diagnostics name the
      correct frontmatter field for the failing kind.
    - **Root wiring:** `lint:arc:triggers` script + `tsx ^4.19.2` devDependency added to root `package.json`.
      Package-level `packages/arc-framework/package.json` deliberately unchanged — framework-CI-only per
      `strategy-workflow-authoring.md § Enforcement`; shipping a CI-only script entry via the published CLI
      would be user-hostile.
    - **Verification:** audit passes against real corpus (all 8 methods + 8 extensions covered). Tier 1 gates
      clean (`typecheck`, `typecheck:test`, `lint:ts`, `test:unit` 484 tests, `lint:md` 200 files, `build`).

- [x] **1.6 Wire audit into CI**

    **Outcome:** Added `- run: npm run lint:arc:triggers` to `.github/workflows/ci.yml` `quality` job between
    `npm run build` and `npm run -s lint:md`. Runs on all branches (fail-fast signal before PR). CI-green
    acceptance verified on push.

- [x] **1.7 Phase 1 close — Tier 2 quality gates**

    **Outcome:** All Tier 2 gates green locally. `lint:md` (200 files, 0 errors), `lint:ts`, `lint:sh`,
    `typecheck`, `typecheck:test`, `npm test` (unit + e2e, all passing), `build`, and `lint:arc:triggers`
    (all 8 methods + 8 extensions covered). Phase 1 complete.

---

### **Phase 2:** Constitutional Rule + ADR-013 Amendment Draft

**Purpose:** Anchor compliance behavior before Phase 3 removes the always-loaded bodies. Constitutional framing is
absolute — no hedges — per compliance-reliability research.

- [x] **2.1 Add agent-side compliance rule to DEV-RULES.ARC**

    **Outcome:** New subsection § Verification and Discovery § Method and extension loading landed in DEV-RULES.ARC —
    two sentences, purely behavioral. Rule narrowed from PRD P0.3 wording to match the structural load contract:
    trigger is specifically a workflow's YAML frontmatter `arc.methods` / `arc.extensions` declarations, not any
    in-step reference (in-step links are reader navigation per `strategy-workflow-authoring.md`). Paired author-side
    rule intentionally not referenced in DEV-RULES — that rule is T3 on-demand for a rare activity, doesn't warrant
    every-session documentation bloat in a constitutional behavioral rule. Contents-list entry for § Verification
    and Discovery updated to include "load methods/extensions". Two-copy sync applied — both DEV-RULES.ARC copies
    identical. Tier 1 markdown lint clean.

    **Follow-on:** PRD P0.3 wording ("references a method, extension, strategy, or workflow") predates the landed
    frontmatter trigger contract and reads broader than the implemented rule. Consider a PRD refresh to align; not
    blocking — PRDs are "spirit, not verbatim" in ARC convention, and the implemented rule is the more accurate
    behavioral specification.

- [x] **2.2 AGENT-BRIEFING.ARC cross-reference**

    **Outcome:** Decision — no cross-reference. Recorded in `notes-session-init-optimization.md § Phase 2 Decisions §
    Task 2.2`. Rationale: AGENT-BRIEFING.ARC holds framework orientation not behavioral rules; DEV-RULES is the
    single source of truth for rules; both docs are in session-init Batch 1 so earlier position gains are marginal
    and don't change execution-time compliance; two T1 homes carry drift risk. No file edit; no two-copy sync
    needed.

- [x] **2.3 Draft ADR-013 Tier 2 amendment**

    **Outcome:** Amendment dated 2026-04-20 appended to ADR-013's existing `### Amendments` section. Captures five
    consolidated bullets: per-file restructure (including frontmatter schema, terminology renames, `workflow` field
    omission, body conventions); workflow frontmatter as trigger contract; T1/T3 constitutional pair placement;
    `pre-merge-review` → `diff-review` rename and contract broadening; CI-enforced reliable-trigger invariant.
    Closing paragraph ties back to the original decision — direction holds, implementation is concretized.
    Left as draft; Phase 3 close (Task 3.10) will sanity-check against the implemented model. Tier 1 markdown
    lint clean. Single-copy per `strategy-package-project-sync.md` (ADRs project-scoped).

- [x] **2.4 Phase 2 close — Tier 2 quality gates**

    **Outcome:** All Tier 2 gates green locally. `lint:md` (200 files, 0 errors), `lint:ts`, `lint:sh`, `typecheck`,
    `typecheck:test`, `npm test` (43 tests across 8 files, all passing), `build`, and `lint:arc:triggers` (all 8
    methods + 8 extensions covered). Phase 2 complete.

---

### **Phase 3:** Validation, Integration, and Finalization

**Purpose:** Landing phase for the per-file structure established in Phase 1. Build the frontmatter parser utility;
write schema + link-resolution validation hooks; restructure session-init to the post-aggregate mechanism (methods:
no init read; extensions: `^active: true` grep enumeration); sweep cross-references from legacy aggregate anchors to
per-file paths; register per-file entries across the install pipeline (recipe, classification, manifest); retire
legacy aggregate files via scoped reference sweep (hooks, scripts, always-loaded docs, strategy narratives) before
delete; add CLI test coverage; harden the link validator (template-skip + archive-skip) and clear the live-ref and
template false-positive broken-link categories; close with ADR-013 sanity check.

**Note:** Tier 2 gates run at sub-phase boundaries (3.6 cross-reference sweep close), not only at phase end. Two-copy
discipline applies throughout — every file change touches `packages/arc-framework/arc/` and `.arc/`.

- [x] **3.1 Frontmatter schema finalization + parsing utility**

    Parent task. 3.1.a locked in the final field name (`override-active`), then 3.1.b built the parser against
    it with no intermediate-name detour. Schema-name + validator + audit-script refactor landed as a coherent
    unit; all downstream Phase 3 tasks (3.3 schema validation hook, 3.5 aggregated-index generation) now have
    the shared scaffold to build on.

    - [x] **3.1.a Rename method schema field `has-override` → `override-active`**

        **Outcome:** Field renamed across 25 occurrences in 21 files — all 16 method files (8 × 2 copies),
        both README copies, both `strategy-session-operations.md` copies (3 occurrences each: schema spec,
        field-semantics bullet, code-block example), and ADR-013 § Amendments. Status-file, task-list, and
        PRD occurrences intentionally deferred (status/task list refresh on commit; PRD P0.5 bundled with
        Task 3.10 ADR-013 sanity check). Tier 1 `lint:md` clean.

        **Rationale carried forward:** Parallelizes semantics with extensions' `active` field and drops the
        `has-`-prefix plural awkwardness. Self-documenting: the field answers "is the override turned on?" —
        method-side counterpart to the extension-side "is the extension turned on?".

    - [x] **3.1.b Frontmatter parsing utility (test-first)**

        **Outcome:** New `src/lib/frontmatter/` module with generic extractor + method and extension schema
        parsers; barrel re-exports everything. Refactored `src/scripts/audit-method-triggers.ts` to consume
        the shared generic parser (removes the inline triple-dash + `yaml.load` boilerplate, eliminates the
        drift risk between parsers). All 9 task-listed behaviors covered by 21 new unit tests
        (`__tests__/unit/frontmatter/`: 3 generic, 10 method, 8 extension). Full unit suite green (538 tests);
        `lint:ts`, `typecheck`, `typecheck:test`, and the audit script (`npx tsx …/audit-method-triggers.ts`)
        all clean.

        **Implementation notes:**
        - Generic: `parseFrontmatter(content)` → `{ data: unknown, parseError?: string }`. Absent block →
          `data: null, no error`. Malformed YAML → `data: null, parseError: <message>`.
        - Schema parsers return `{ frontmatter, errors: string[] }`; `frontmatter` is populated only when
          `errors` is empty. Diagnostics name the offending field (e.g., `` missing or invalid `override-active`
          (expected boolean) ``). Basename mismatch on `name` fires a separate diagnostic including both
          declared and expected values.
        - Package-source only — no `.arc/` mirror. Two-copy discipline applies to doc content, not TS source.

        **Batching judgment (per test-first method):** The 8 method-schema tests and 8 extension-schema tests
        were batched after the first RED-GREEN cycle rather than sliced one-at-a-time. Rationale: all cover
        field validation on a single function over a shared struct — strict slicing would mean rewriting the
        parser 5+ times with no discovery value. One test per field category kept the diagnostic failure modes
        distinct; generic-layer cycles 1–3 were sliced normally.

- [x] **3.2 Enhance directory READMEs with derived tables**

    **Outcome:** Both READMEs gained their derived tables; two-copy sync preserved.
    - `system/methods/README.md` — added **Method Dependencies** section after Index: 3-row
      Method / Related Methods / Coupling table (commit-format ↔ commit-context-format shown
      both directions + diff-review → review-triage) with note that unlisted methods are
      independent. Mirrors the original aggregate table's coupled-only rows.
    - `system/extensions/README.md` — added **Extension Points** section after Index:
      8-row lifecycle-ordered table with columns Extension / Workflow / Fires / Purpose.
      Order: post-context-load → post-task-quality → post-task-completion →
      post-unit-quality → pre-stage-review → pre-merge-review → post-work-unit-activate →
      post-work-unit-archive. Table alignment run through `markdown-table-prettify`; Tier 1
      `lint:md` clean.
    - Two-copy sync verified (diff -q) after prettifier pass.
    - Spec reconciliation: "Only 3 coupling pairs" in the task description — 2 unique
      semantic pairs, but 3 rows when the bidirectional pair is shown both directions (as
      the original aggregate did). Kept 3 rows for readability parity with the retired
      aggregate.

- [x] **3.3 Frontmatter schema validation hook (test-first)**

    **Outcome:** CHECK 12 wired into both pre-commit copies; TypeScript dispatcher
    validates staged methods/extensions/agent files against their schemas; 19 new unit tests
    (7 agent + 12 dispatcher). Current agent files lack frontmatter — hook blocks agent-file
    commits until 5.5.b deploys the schema (expected per spec sequencing).
    - **Agent schema parser** — `packages/arc-framework/src/lib/frontmatter/agent.ts` plus
      exports via `index.ts`. Minimal schema (`active: boolean` only); delegates to the
      generic layer for triple-dash extraction and malformed-YAML surfacing.
    - **CLI dispatcher** — `packages/arc-framework/src/scripts/validate-frontmatter.ts`.
      `classifyPath(path)` returns `method | extension | agent | other` using regexes that
      require the `system/<dir>/` prefix in either `.arc/` or package-source tree; agent
      files match `^[A-Z][A-Z0-9]*\.ARC\.md$` (CLAUDE/CODEX/GEMINI) — hyphenated briefings
      and READMEs route to `other`. `validateFiles(paths, readFile)` is the pure
      entry point for tests; `main()` is the `fileURLToPath`-guarded CLI. Passes full
      staged file list to avoid double-filtering between shell and TS.
    - **CHECK 12 in pre-commit** — shell-filters staged files under
      `^(\.arc|packages/arc-framework/arc)/system/(methods|extensions|agent)/` and invokes
      `npx tsx packages/arc-framework/src/scripts/validate-frontmatter.ts <paths>`. Short-
      circuits on success; captures stderr and surfaces with 3-space indent on failure.
      Two-copy sync verified.
    - **Test coverage (test-first, sliced then batched where tightly coupled):**
      agent schema — 7 tests sliced one-per-behavior (active:true pass, active:false pass,
      missing active, non-boolean active, ignores extra fields, missing block, malformed
      YAML). CLI dispatcher — 12 tests batched after first RED-GREEN since behaviors are
      tightly coupled around one small dispatcher function; `validateFiles` uses
      dependency-injected `readFile` so tests use an in-memory map without tmp dirs.
    - **Sequencing note with Phase 5.5.b:** 3.3 enforces agent-file schema now; existing
      `{AGENT}.ARC.md` files ship without frontmatter and would be blocked if staged.
      Acceptable per spec — 5.5.b adds frontmatter to templates + existing files before
      this branch merges, and this WU does not otherwise touch agent files.
    - Tier 2 green: lint:md (197 files, 0 err), lint:ts, lint:sh, typecheck,
      typecheck:test, 703 tests (19 new), lint:arc:triggers, build.

    Build `test-first` (one behavior at a time):
    - [x] Valid frontmatter passes (method, extension, and agent schemas)
    - [x] Missing `name` field fails with diagnostic naming the file and field (method/extension)
    - [x] Missing `description` fails (method/extension)
    - [x] Missing `override-active` on a method file fails
    - [x] Missing `active` on an extension file fails
    - [x] Missing `active` on an agent file fails
    - [x] `active` not boolean on an agent file fails
    - [x] `related` not an array fails (method/extension)
    - [x] `name` not matching file basename fails (method/extension)
    - [x] Non-method/extension/agent files staged do not trigger the check

- [x] **3.4 D7a link-resolution pre-commit hook (test-first)**

    **Outcome:** CHECK 13 wired into both pre-commit copies; shell-based validator
    (`system/scripts/validate-links.sh`) checks inline links, reference-style usages, and
    reference definitions in staged markdown; 11 new integration tests covering the spec's
    behavior list plus multi-diagnostic aggregation.
    - **Script** — `system/scripts/validate-links.sh` (both copies). Sanitizes markdown
      (awk state machine drops fenced code blocks, masks inline code spans with a
      placeholder that does not re-match the backtick regex). Validates: inline `[text](t)`
      targets, reference definitions `[ref]: t`, and reference usages `[text][ref]` (must
      have a matching definition). Skips: external URLs (http/https/mailto/ftp/ssh/git),
      anchor-only links, anchor fragments on non-anchor-only links. Relative paths resolve
      from the source file's `dirname`; bash's `test -e` normalizes `..` segments natively
      so no explicit `realpath` call is needed.
    - **CHECK 13 in pre-commit** — shell-filters staged `*.md` files; invokes the script
      via `"$(dirname "$0")/../scripts/validate-links.sh"` (symlink-agnostic — works whether
      `core.hooksPath` points at `.arc/system/githooks/` directly or via copy). Diagnostics
      surface with 3-space indent matching CHECK 12's output style. Two-copy sync verified.
    - **Test coverage (test-first, then fixed one bug)** — 11 integration tests using a
      tmp-dir fixture pattern: valid inline / valid ref-style / broken inline / relative
      path resolution from source dir / anchor fragment passthrough / external skip / code
      span ignored / fenced block ignored / undefined ref / broken ref definition target /
      multiple diagnostics in one run. Bug caught by the code-span test: initial awk
      placeholder `` `CODESPAN` `` re-matched the `` `[^`]*` `` regex on each iteration —
      infinite loop. Fix: placeholder without backticks (`CODESPAN`). Tests green after fix.
    - Tier 2 green: lint:md (197 files, 0 err), lint:ts, lint:sh (includes new script),
      typecheck, typecheck:test, 714 tests (11 new, from 703), lint:arc:triggers, build.

    Build `test-first` (one behavior at a time):
    - [x] Valid inline link to existing `system/methods/` file passes
    - [x] Valid reference-style link resolving to existing file passes
    - [x] Link to nonexistent file fails with diagnostic naming source file and target
    - [x] Relative path resolves from source file's directory (not `cwd`)
    - [x] Anchor fragments: file existence verified, anchor fragment ignored (`file.md#anchor` passes if `file.md` exists)
    - [x] External links (`https://...`) are ignored
    - [x] Inline code-span backticks containing link-like strings are ignored
    - [x] Broken reference-style link (undefined `[ref]`) fails with diagnostic

- [x] **3.5 Session-init mechanism: method scan retired, active-extensions list introduced**

    **Goal:** Eliminate session-init method/extension bulk scan. Methods load entirely at workflow trigger (body reads
    contain both `.override` and `.default` sections — init-time override-presence surfacing serves no agent decision).
    Extensions gain a minimal init-time enumeration via single `grep` for `^active: true`, producing a named
    **active-extensions list** carried in session context and consulted at fire points (avoids re-reading placeholder
    extension files mid-session in default installs).

    **Rationale:** Previous work established reliable workflow-frontmatter-declared triggers (Tasks 1.1, 1.3, 1.5) and
    the agent-side compliance rule (Task 2.1). With those in place, methods need no init-time awareness — body always
    loads at trigger. Extensions need minimal init-time awareness so fire-point checks short-circuit without re-reading
    placeholders; one grep at init is cheaper than 10–15 fire-point reads per session in a default install. See
    `notes-session-init-optimization.md` companion entry at Task 3.10 for the full architecture discussion.

    - [x] **3.5.a Define "active-extensions list" vocabulary in strategy doc**
        - `strategy-session-operations.md § Method and Extension Loading` updated:
            - Per-file Frontmatter Schema intro paragraph rewritten — schema now described as having two
              consumers (session-init grep for extensions; CI audit for both), with methods explicitly no-init-read
            - `override-active` field semantic updated — consumed by CI/docs/authoring tooling; not by session-init
            - `active` field semantic updated — session-init enumerates via `grep -l`; fire points consult the
              active-extensions list by name
            - Stale `### arc-methods.md` and `### arc-extensions.md` subsections replaced with
              `### Session-Init Consumption` (methods: no init read; extensions: grep enumeration; related
              agent-file active-gate pattern noted) plus preserved `### Method Classification by Trigger` table
        - `[dev-rules-arc]` ref-def added to support the agent-side-compliance cross-reference
        - Two-copy sync applied to both `.arc/` and `packages/arc-framework/arc/` copies

    - [x] **3.5.b Session-init.md Step 2/4/6 updates**
        - **Step 2:** Execution-strategy paragraph updated to name the active-extensions grep as Batch-1-eligible
          alongside identity/role and config reads. New "Enumerate active extensions" block inserted after
          "Resolve role" (before the Contributor blockquote so it runs universally). Block specifies the
          `grep -l "^active: true" .arc/system/extensions/*.md` invocation, basename-mapping convention, the
          named session-context artifact, and the empty-list short-circuit semantics. Methods-at-init removal
          was no-op (methods were never in Step 2's document set)
        - **Step 4:** Intro paragraph rewritten — `arc-methods.md` scan removed from the "reads in this step"
          list and from the "read and scan" instruction; replaced with a one-sentence pointer to the strategy
          doc's Session-Init Consumption section. Item 2 (Method overrides) removed; items renumbered (config
          values / platform awareness / custom commit patterns). Closing "Do not mention defaults" paragraph
          trimmed to drop "active method overrides" clause
        - **Step 6 (orientation):** Include/exclude bullets updated — "method overrides" replaced with
          "active-extensions list (only when non-empty)" in the include list; "that no overrides were found"
          and "that extensions had no steps" replaced with "that the active-extensions list is empty" in the
          exclude list
        - Two-copy sync applied to both `.arc/` and package-source `.template.md`
        - **Imperative-citation safety pass (post-3.5.d review):** the trailing
          "See [Session Operations Strategy] § Session-Init Consumption for the loading model" line in
          the Step 2 enumerate-extensions block, and the "per [Session Operations Strategy] § Session-Init
          Consumption" citation in Step 4's intro, were both removed. Inside Step 2's load-the-context flow
          a "See X for Y" sentence reads as an imperative load directive to over-literal agents and could
          trigger an unintended strategy-doc read at init; Step 4's citation served only as an
          appeal-to-authority for a self-evident rule. Workflow stays self-sufficient; rationale remains
          discoverable via STRATEGY-INDEX. Orphaned `[session-ops-extensions]` ref-def removed from both
          copies as a result

    - [x] **3.5.c Fire-point directive updates (6 workflows, two-copy)**
        - All 7 sites rewritten to consult the active-extensions list by name rather than re-reading the
          extension file at fire time. Literal template applied: "If `<extension-name>` appears in the
          active-extensions list (established at session init), load and execute its `.actions`.
          Otherwise, skip."
        - `3_process-task-loop.md` — 3 sites: `#post-task-quality`, `#post-task-completion` (external-tracker
          context sentence preserved post-directive), `#post-unit-quality`
        - `prepare-commits.md` — 1 site: `#pre-stage-review` in Quick Commit Reference step 5
        - `integrate-work-unit.md` — 1 site: `#pre-merge-review` sub-step 2 under Section 6, with the
          "Otherwise, skip this sub-step" variant (preserving the surrounding numbered-list structure)
        - `activate-work-unit.md` — 1 site: `#post-work-unit-activate` Step 6
        - `archive-work-unit.md` — 1 site: `#post-work-unit-archive` Section 6
        - `session-init.md` — 1 site: `#post-context-load` Step 3 with the "(established at Step 2)"
          variant (self-referential within the same workflow)
        - Two-copy sync applied: project copies + package-source counterparts (`.template.md` for
          3_process-task-loop and session-init; plain `.md` for the other four)
        - Duplicate "See `arc-extensions.md` § ..." pointer lines dropped everywhere — the directive's
          inline link is the single reference path now

    - [x] **3.5.d READMEs update (methods + extensions)**
        - `system/methods/README.md` — Loading-model paragraph rewritten: methods always load at workflow
          trigger; `override-active` is consumed by CI audit, docs generation, and authoring tooling, not by
          session-init. Sentence "Session-init scans the `override-active` frontmatter field for override
          *presence*" retired
        - `system/extensions/README.md` — both "How extensions work" and "Loading model" paragraphs
          rewritten. "How extensions work" replaces the old "workflow reads `active` at the fire point"
          mechanism with session-init enumeration + fire-point list-consultation. "Loading model" describes
          the single `grep -l "^active: true"` invocation producing the active-extensions list and
          fire-point behavior
        - Two-copy sync applied to both `.arc/` and package-source README copies

- [x] **3.6 Cross-reference sweep**

    **Outcome:** All anchor-form `arc-methods.md#anchor` / `arc-extensions.md#anchor` ref definitions rewritten
    to per-file paths across 21 files (11 under `.arc/` + 10 package-source mirrors; `agent-pre-merge-review.md`
    is project-only). Total: 44 anchor-form ref-def lines updated. Link resolver passes on all modified files;
    full-tree scan shows zero net change in broken-link count (36 pre-existing broken links in out-of-scope
    areas — `reference/archive/`, `backlog/`, `reference/research/`, `reference/analysis/`, template
    placeholders — none caused by this sweep).

    **Additional cleanup (flagged in notes-session-init-optimization.md § Judgment calls #4):** Rewrote the
    `integrate-work-unit.md` L150 plain-prose pointer ("see arc-methods.md § commit-context-format") into a
    reference-style link pointing at the new `methods/commit-context-format.md` file, adding a matching
    `arc-methods-ccf` ref definition to the file's link block (both copies).

    **Path depth adjustments applied:**
    - `../../workflows/arc-methods.md` → `../../methods/[name].md` (from `arc/` depth)
    - `../arc-{methods,extensions}.md` → `../../{methods,extensions}/[name].md` (from `arc/` depth, one level in)
    - `../../arc-{methods,extensions}.md` → `../../../{methods,extensions}/[name].md` (from `arc/subdir/` depth)
    - `../../../arc-extensions.md` → `../../../../extensions/[name].md` (from `arc/wul/planning/` depth)
    - `../../../system/workflows/arc-methods.md` → `../../../system/methods/[name].md` (from `reference/strategies/arc/`)
    - `../../../../.arc/system/workflows/arc-methods.md` → `../../methods/[name].md` (simplified the
      convoluted 4-up-back-through-`.arc/` path in `agent-pre-merge-review.md`)

    **Deferred to Task 3.8 (explicit gap — not a regression):** Two non-anchor link-def pairs
    (`[arc-methods]: ../../arc-methods.md` / `[arc-extensions]: ../../arc-extensions.md`) remain in
    `supplemental/integrate-external-content.md` (both trees) and `initial-setup/03_configure-external-integration.md`
    (package-only). These require prose rewrites at their usages (L74, L80, L87 / L77, L96, L132 respectively)
    because the prose frames `arc-methods.md` and `arc-extensions.md` as conceptual single-file catalogs —
    after Phase 3.8 deletes the aggregates, both the link targets and the semantic framing break. Task 3.8's
    "Verify no remaining references" step picks up the resolution (either per-file README redirect with matching
    prose update, or larger prose restructure in those setup workflows). Out of strict 3.6 scope (anchor-form only).

- [x] **3.7 Framework-sync + install pipeline: register per-file entries**

    **Outcome:** 18 new per-file paths (8 methods + 8 extensions + 2 READMEs) registered in both
    `.arc/system/.internal/manifest.json` and `packages/arc-framework/init-recipe.json`. Per-file
    method/extension bodies (16 paths — not READMEs) classified as `Configurable`; READMEs remain
    `Framework`. Pristine hashes computed from package-source content via `sha256sum` on UTF-8
    bytes (matches `hashContent` byte-for-byte).

    **Design correction mid-task:** Initial implementation classified all 18 entries as Framework,
    following the as-written task description. Surfaced during cross-check that
    `packages/arc-framework/arc/system/extensions/pre-merge-review.md` shipped with `active: true`
    and a CodeRabbit `.actions` body (local-repo leak from commit `43e7749` Task 1.4.b–f
    migration — see § Phase 3.7 addendum below). The leak forced a semantic choice: Configurable is the
    correct classification for method/extension bodies because the adopter-toggleable frontmatter
    (`active`, `override-active`) and fillable sections (`.override`, `.actions`) are exactly what
    three-way merge handles. Keeping them Framework would either trip the drift test the moment
    any adopter (including us) toggled a switch, or force package source to carry local opinion
    (as happened here). Fix:
    - 16 per-file paths added to `CONFIGURABLE_FILES` in
      `packages/arc-framework/src/lib/classification.ts`
    - 16 manifest entries flipped to `"Configurable"`
    - `packages/arc-framework/arc/system/extensions/pre-merge-review.md` corrected:
      `active: false`, `.actions` body replaced with `[No extension configured]` placeholder
      (matching 7 other extensions)
    - Pristine_hash recomputed from corrected package source:
      `3dd9dbc...` → `7540f37...`

    **Manifest ordering:** Inserted extensions/ block after `system/README.md` and methods/ block
    after `system/githooks/README.md`, mirroring the recipe's directory-grouped convention
    (subdirectory blocks alphabetical, README last within each block). Placement reached by
    alphabetical subdirectory order: `agent/ < arc-config.yml < README.md < extensions/ < githooks/
    < methods/ < scripts/ < skills/ < workflows/`.

    **Aggregate entries untouched:** `system/workflows/arc-methods.md` and
    `system/workflows/arc-extensions.md` remain in recipe L55–56, `CONFIGURABLE_FILES`
    (classification.ts L87–88), and manifest L270/L275 — 3.8.d removes atomically.

    **Phase 3.7 addendum — leak forensics (feeds Task 3.13):**
    - Origin: commit `43e7749` (2026-04-20), Tasks 1.4.b–f, single migration commit creating 36
      per-file files across two copies
    - Blast radius: 1 file. Other 7 extensions and all 8 methods in package source are clean
      (`active: false`, `override-active: false`, neutral `[No ... configured]` bodies). No other
      `CodeRabbit`/`WSL`/`/home/andrew` occurrences in `packages/arc-framework/arc/`
    - Why undetected: framework-sync test skips Configurable — and classification was Framework
      but both copies were identical, so no drift. Pre-commit hooks have no pattern check for
      package-source `active: true` or non-placeholder bodies
    - Guardrails captured in Task 3.13 — pre-commit hook checks targeting the exact leak pattern

    **Verification:**
    - JSON parse: both files load cleanly; all 18 new paths present in `manifest.files` and
      `recipe.include_files`
    - `framework-sync.test.ts` passes in isolation (41ms post-reclassification)
    - Full test suite: 48 files / 673 tests pass (unit + integration) and 8 files / 43 tests pass
      (e2e) — 716 total. Init integration, update integration, status-diff, reconfigure,
      classification assertions all green with new Configurable entries
    - Typecheck clean

- [x] **3.8 Retire legacy aggregate files**

    Parent task. Scoped sweep of all remaining references to the aggregates (hooks, scripts, always-loaded docs,
    strategy narratives), then delete + grep-verify. Reference scope is materially larger than the anchor-form
    ref-defs Task 3.6 swept — ~74 non-archive files still mention `arc-methods.md` or `arc-extensions.md`, with
    live-operational references in install pipeline, hooks, integrity scripts, Tier 1 always-loaded docs, and
    strategy narratives. Subtasks carve the sweep by concern; 3.8.a through 3.8.c must land before 3.8.d so
    the delete commit ships atomically with no residual live references.

    - [x] **3.8.a Active hooks and integrity scripts**

        **Goal:** `arc-verify` and the `commit-msg` hook continue to work post-aggregate-deletion.

        **Outcome:** Hook and diagnostic script aggregate references removed; `verify-integrity.sh` §6
        (Session State) deleted outright; `commit-msg` CHECK 7 loosened to be format-agnostic. Scope
        expanded beyond the original three bullets in two passes: (1) §2 and §5 aggregate references
        folded in to honor the post-deletion-survival goal literal; (2) §6 investigation uncovered a
        silently-non-functional check whose parser tightly coupled to status-file line format — value
        proved marginal (redundant with session-init runtime validation), so the check was deleted
        rather than repaired. CHECK 7 in `commit-msg` retained but loosened to prevent the same
        format-coupling trap for adopters.

        - `system/scripts/verify-integrity.sh` (both copies):
            - §2: removed the two aggregate `check_file` calls (Methods/Extensions file entries).
            - §5: removed the two aggregate entries from the `ref_file` iteration list.
            - §6 (Session State) **deleted entirely**. Duplicated session-init's runtime validation of
              Task List / Next Task references; parser-format coupling was not worth maintaining for
              preemptive detection that the next session itself catches.
            - §7 (now §6 after renumber): replaced section/subsection grep on aggregates with per-file
              enumeration. For each `.md` in `system/methods/` and `system/extensions/` (excluding
              `README.md`): verify first line is `---`, closing `---` within first 20 lines, and
              required keys present (`name`, `description`, plus `override-active` for methods /
              `active` for extensions). Deep schema validation remains pre-commit CHECK 12's
              responsibility. Inline shell — no `npx tsx` dependency — keeps the diagnostic
              self-contained for adopter contexts where `packages/arc-framework/` doesn't exist.
            - §8 renumbered to §7.
        - `system/workflows/arc/supplemental/verify-arc-integrity.md` (both copies): L16
          post-modification-gate bullet retargeted at `system/methods/` / `system/extensions/`;
          "Methods and Extensions" section rewrote structural-check description + severity table;
          "Session State" section deleted.
        - `system/githooks/commit-msg` (both copies):
            - L313 contributor advisory retargeted at `.arc/system/methods/commit-context-format.md`.
            - CHECK 7 Next Task grep loosened from `^- \*\*Next Task:\*\*` to `\*\*Next Task:\*\*`
              (match-anywhere). Tolerates list markers, indentation, backticks, path-prefixed values
              — extracts `Task X.Y` from whatever shape the adopter's status file uses. Trade-off:
              silently no-ops on non-ARC labels (`Current Task:` etc.) rather than false-firing on
              format variance.
        - `packages/arc-framework/__tests__/unit/scripts/commit-msg-status-pattern.test.ts` (new):
          regression + documentation coverage for CHECK 7's pattern. Asserts (a) the hook source
          still carries the lenient form, and (b) the pattern matches five representative status-file
          shapes (list-item, naked bold, indented, backticked-full-path, missing). Protects against
          accidental re-tightening.
        - Quality gates: `lint:sh` clean (both copies); `lint:md` clean on modified markdown;
          unit suite 584/584 passing (including the new 7-test file); functional smoke test of
          `verify-integrity.sh` confirms all 16 per-file frontmatter checks PASS and renumbered §6/§7
          run cleanly.
        - Two-copy sync applied throughout.

    - [x] **3.8.b Tier 1 always-loaded doc references**

        **Goal:** Session-init's always-loaded document set has zero broken references to the aggregates.
        - `reference/constitution/DEV-RULES.ARC.md` (both copies): single `[arc-methods]` ref-def replaced with
          four per-file ref-defs (`-cf`, `-ccf`, `-it`, `-tf`) plus one directory-level ref-def
          (`[arc-methods-dir]` → `system/methods/README.md`). `-qg` dropped from the suggested set — no
          `quality-gate-commands` link usage exists in the file. Body usages rewritten at all six sites:
          L13 (conceptual intro → `system/methods/` directory), L65 (split into two per-method links), L140
          (issue-triage), L175 + L180 (test-first, two sites), L361 (relevant `system/methods/` files).
        - `system/agent/AGENT-BRIEFING.ARC.md` L21–24 (both copies): `**Methods and extensions:**` paragraph
          rewritten — methods now override via `.override` section under `system/methods/`; extensions live
          under `system/extensions/`.
        - `system/skills/arc-commit/SKILL.md` L22 (both copies): commit format guidance now points at
          `system/methods/commit-format.md` and `system/methods/commit-context-format.md`.
        - `system/arc-config.yml` L120 comment (both copies): diff-review pointer updated to
          `system/methods/diff-review.md`.
        - Quality gates: `lint:md` clean on the three modified markdown files in `.arc/` (package-source
          mirrors are excluded from lint by config but are byte-identical to the `.arc/` copies).
        - Full-file grep across all eight modified files confirms zero remaining `arc-methods.md` /
          `arc-extensions.md` references.
        - Two-copy sync applied throughout.

    - [x] **3.8.c Strategy narrative rewrites**

        **Goal:** Strategy docs accurately describe the current per-file customization model. These are content
        rewrites, not link swaps — the old narratives frame customization as writing into the aggregates.
        - `strategy-configurability-architecture.md` (both copies) — 8 rewrite sites landed: (a) mechanisms
          table rows for Extension/Method override → `system/extensions/` / `system/methods/`; (b) `§
          Configurability path definitions` Method override bullet (now describes `.override` section in a
          file under `system/methods/`) + Extension bullet (files under `system/extensions/`); (c) `§ Agent
          discovery` substantively rewritten — dropped the obsolete "scan `arc-methods.md` for override
          presence" mechanism, replaced with current state (grep `active: true` on `system/extensions/*.md`
          → active-extensions list; methods not enumerated at init); (d) `§ Extension Points § Mechanism`
          rewritten to describe per-file structure with frontmatter + `.actions` section, and `References in
          workflows` code sample updated to the active-extensions-list fire-point pattern; (e) `§ Preset vs.
          custom` "corresponding files in `system/extensions/`"; (f) `§ Method Overrides § Mechanism`
          rewritten to describe per-file co-location with `system/extensions/`; (g) `§ Platform commands`
          behavioral-methods bullet → `system/methods/`.
        - `strategy-team-coordination.md` (both copies) § Integration Mechanism: body rewritten — now names
          `.actions` section populated in the relevant per-file extension; single `[arc-extensions]` ref-def
          replaced with 4 per-file refs (`-dir`, `-task-completion`, `-wu-activate`, `-wu-archive`) linking
          the three named extensions + the directory.
        - `strategy-file-classification.md` (both copies) § Template suffix convention: aggregate example
          replaced with `system/methods/commit-format.md` — preserves the "ships as functional content,
          customized in place" framing with a current live example.
        - `strategy-workflow-authoring.md` (both copies) `arc:` namespace § final bullet rewritten — drops the
          "when methods and extensions migrate" forward-looking framing (migration is complete); names match
          file basename in `system/methods/` / `system/extensions/` stated directly.
        - `strategy-package-project-sync.md` (.arc/ only — project-specific strategy, not mirrored):
          Configurable files list expanded — the two aggregate entries replaced with 16 per-file entries
          (8 methods + 8 extensions) in alphabetical order. Directory-glob alternative rejected for
          consistency with the rest of the list, which enumerates specific files.
        - `strategy-project/README.md` (both copies) § Drop zone routing bullets: Method override bullet now
          reads "populate `.override` in the method's file under `system/methods/`"; Extension bullet reads
          "populate `.actions` in the extension's file under `system/extensions/`". Note: corrected `.steps`
          → `.actions` (the current extension field name).
        - `TECHNICAL-OVERVIEW.md` (.arc/ only — template counterpart is generic placeholder content without
          these references) — 3 sites rewritten: Key characteristics bullet, Workflows component description,
          and Customization Layer section (per-file methods listed with the full post-restructure catalogue:
          commit-format, commit-context-format, issue-triage, test-first, session-state, diff-review,
          review-triage, quality-gate-commands).
        - Quality gates: `lint:md` clean on all 7 `.arc/` files; package-source mirrors byte-identical for
          the 5 mirrored docs.
        - Full-file grep across all 12 modified files confirms zero remaining `arc-methods.md` /
          `arc-extensions.md` references.
        - Line-number drift from task description noted: actual target in `strategy-package-project-sync.md`
          was L202–203 (not L52). `TECHNICAL-OVERVIEW.md` template counterpart had no aggregate references
          to mirror — the project's rendered copy is the only place they existed.

    - [x] **3.8.d Delete aggregates + install-pipeline cleanup + grep-verify**

        **Goal:** Aggregate files are gone; install pipeline, manifest, and tests are clean; full-tree grep
        confirms zero operational references remain.
        - Deleted the 4 aggregate files: `.arc/system/workflows/arc-methods.md`,
          `.arc/system/workflows/arc-extensions.md`, and both `packages/arc-framework/arc/system/workflows/`
          counterparts.
        - `packages/arc-framework/init-recipe.json` — removed both aggregate entries (actual L73–74, not L55–56
          as stated in planning; entries had drifted during the per-file additions).
        - `packages/arc-framework/src/lib/classification.ts` — removed both entries from `CONFIGURABLE_FILES`
          (L87–88, matches planning).
        - `.arc/system/.internal/manifest.json` — removed both entries (actual L360, L365, not L270, L275;
          drift similar to init-recipe). Per-file methods/extensions manifest entries ship unchanged.
        - Also cleaned `.arc/system/.internal/pristine.json` (gitignored, two-copy snapshot store): removed
          the two aggregate keys to keep manifest/pristine pairing consistent locally.
        - Unit tests updated (line numbers in planning were stale — resolved from actual references):
            - `__tests__/unit/init.test.ts:282` — replaced `"system/workflows/arc-methods.md"` with
              `"system/methods/commit-format.md"` in the `classifyFile` "Configurable" assertion (per-file
              methods remain Configurable; aggregate path now falls through to Framework).
            - `__tests__/unit/manifest/apply.test.ts:158,168` — replaced `"system/arc-methods.md"` (stand-in
              path for Configurable-class removal fixture) with `"system/methods/commit-format.md"`.
            - `__tests__/unit/removal-prompts.test.ts:40` — same replacement, fixture role only.
            - `__tests__/unit/scripts/validate-package-neutrality.test.ts` — deleted the `it("does NOT
              classify legacy aggregate files — out of scope (retired in 3.8.d)")` case outright; the
              in-file comment explicitly scheduled this test for removal at 3.8.d, now that the source
              files no longer exist in the package tree.
        - Deferred-from-3.6 link-def pair rewrites:
            - `system/workflows/arc/supplemental/integrate-external-content.md` (both trees) — Steps 3a/3b
              rewritten to reference `system/methods/` and `system/extensions/` directories; section-name
              references updated to current field names (`.actions` not `.steps`); added `override-active`
              / `active` frontmatter toggle guidance. Ref-defs `[arc-methods]` / `[arc-extensions]` now
              point at `../../methods/README.md` / `../../extensions/README.md`.
            - `system/workflows/arc/initial-setup/03_configure-external-integration.md` (package-only) —
              L77/L96/L132 + Step 4 Summary bullets rewritten to reference the directories and specific
              per-file paths where a single target is named (`post-task-completion.md`). Ref-defs updated;
              added `[arc-ext-post-task-completion]` for the direct per-file link.
        - **Scope expansion from grep-verification (not enumerated in planning):** the initial grep after
          the above changes surfaced 9 additional live operational references in 5 files — all pre-existing
          narrative hits that were not caught by Tasks 3.6/3.8.a–c. Rewrote each:
            - `system/workflows/arc/session-lifecycle/session-init.md` + `.template.md` (both trees, 4
              files) — "The session state mechanism is overridable via `` [`arc-methods.md` §
              session-state][…] ``" → "… via the `[session-state method][…]`" (ref-defs already pointed
              at per-file method path).
            - `system/workflows/arc/session-lifecycle/session-handoff.md` + `.template.md` (both trees,
              4 files) — same pattern, same rewrite.
            - `system/workflows/arc/initial-setup/01_verify-and-configure.md` (both trees, 2 files) —
              § Customization Beyond Config: rewrote the "two additional customization files" narrative
              to describe `system/methods/` and `system/extensions/` directories with concrete per-file
              examples (`commit-context-format.md` Jira override, `post-task-quality.md` security scan,
              `post-task-completion.md` tracker sync).
            - `system/workflows/project/agent-pre-merge-review.md` — body rewrite: "populates the
              `pre-merge-review` extension point in [arc-extensions.md]…" → "populates the `.actions`
              section in the [pre-merge-review extension]…" (ref-def already correct).
        - Full-tree grep post-cleanup: `grep -rn 'arc-methods\.md\|arc-extensions\.md' .arc/
          packages/arc-framework/arc/ packages/arc-framework/src/ packages/arc-framework/__tests__/`
          filtered against the allowed-zones list (WU artifacts, ADRs, archives, analysis, backlog,
          `.internal/`) returns **zero hits**. Live docs / code / scripts / tests are clean.
        - Quality gates: Tier 1 + Tier 2 full suite passed on modified files (5 `.arc/` workflow files
          lint clean; full `lint:md` across 195 files 0 errors; `lint:ts` / `typecheck` / `typecheck:test`
          clean; 583 unit tests + 43 e2e/integration tests passing; `build` succeeds).
        - **Docs and backlog:** Out of scope this WU. `docs/` handling is covered by the separate
          docs-content-sweep WU. Backlog plan-doc references (ROADMAP, `plan-arc-modes.md`, etc.) refresh at
          activation of their respective WUs.

- [x] **3.9 CLI test coverage — per-file restructure**

    **Outcome:** Per-file methods/extensions layout verified across unit, integration, and E2E tiers. Classification
    matches the landed three-way-merge model (adopter-customizable per-file; READMEs fall through to Framework) — the
    planning-phase "all 18 Framework" framing was rejected after review because Framework classification wholesale-
    replaces on update, which would obliterate adopter `.override` / `.actions` content. Corrected model locked in as
    the single source of truth across the new tests.
    - **Unit — classification** (`__tests__/unit/init.test.ts`): added `classifyFile("system/extensions/post-task-quality.md")`
      → `Configurable` (representative extension; representative method path `system/methods/commit-format.md` → `Configurable`
      was already asserted at :282). Added `classifyFile("system/methods/README.md")` and
      `classifyFile("system/extensions/README.md")` → `Framework` to pin the README fall-through behavior.
    - **Integration — fresh install** (`__tests__/integration/init.test.ts`): three new cases under the
      `pm.mode=none, tools=[claude]` describe — (a) all 8 method files + README present on disk, (b) all 8 extension
      files + README present on disk, (c) all 18 registered in manifest with 16 `Configurable` (methods + extensions)
      and 2 `Framework` (READMEs).
    - **Integration — legacy no-op** (`__tests__/integration/update.test.ts`): new case seeds
      `system/methods/arc-methods.md` and `system/extensions/arc-extensions.md` onto a post-restructure `.arc/`,
      runs `arc update`, and asserts the legacy files are untouched on disk, absent from
      `added`/`removed`/`keptForReview`, and not registered in the post-update manifest. No migration code path
      assumed — zero-adopter state per PRD § Won't Do.
    - **Integration — idempotent re-update** (`__tests__/integration/update.test.ts`): new case runs update twice on a
      fresh post-restructure `.arc/`; second run produces zero `added`/`removed`/`updated`/`reclassified`/`conflicts`
      entries touching any of the 18 per-file paths, and `manifest.json` is byte-identical between runs.
    - **E2E — init layout** (`__tests__/e2e/init.e2e.test.ts`): new case runs `arc init --yes`, asserts all 18 per-file
      paths exist on disk, asserts legacy `arc-methods.md` / `arc-extensions.md` do NOT ship, and validates manifest
      classification split (16 Configurable, 2 Framework).
    - **E2E — reconfigure regression** (`__tests__/e2e/reconfigure.e2e.test.ts`): new case snapshots per-file content
      pre-reconfigure, reconfigures `pm.mode: none → arc-in-git`, asserts all 18 files remain byte-identical on disk and
      retain their manifest classification.
    - **Hook cross-flow coverage — decision: DROP as duplicate.** Rationale: CHECK 12 logic covered by
      `__tests__/unit/scripts/validate-frontmatter.test.ts` (in-memory fixtures, schema logic thoroughly exercised);
      CHECK 13 logic covered by `__tests__/integration/validate-links.test.ts` (subprocess against fixture files);
      CHECK 14 logic covered by `__tests__/unit/scripts/validate-package-neutrality.test.ts`. Hook→validator routing
      positive path is exercised daily by real dev commits touching methods/extensions frontmatter; routing negative
      path (short-circuit on non-matching staged files) is covered by the Task 3.12 planned hook false-positive surface
      check. A synthetic "fresh init → stage bad frontmatter → confirm block" test reproduces validator logic already
      under test with additional infrastructure cost (git setup + hook install + stage + commit attempt) and no new
      coverage dimension.
    - Quality gates: `lint:ts` + `typecheck:test` clean; targeted vitest runs pass — 52 unit / 63 integration (init+update)
      / 22 E2E (init+reconfigure).

- [x] **3.10 ADR-013 sanity check, PRD refresh, and finalize**

    **Outcome:** ADR-013 amendment and PRD brought into alignment with the landed split mechanism. Notes-file
    § Compliance-Reliability Grounding middle paragraph rewritten to reflect the landed state (Persistent Context
    trigger met). No strategy edits — strategy-session-operations.md § Per-file Frontmatter Schema and
    § Session-Init Consumption already match landed state (verified during evaluation). No literal "draft marker"
    existed in the ADR text; the Phase 2.3 "draft" status was conceptual, so no text removal needed.

    **5-point amendment checklist — verification results:**
    - (a) Per-file structure: ✓ 8 methods + 8 extensions + 2 READMEs on disk; aggregate files retired.
    - (b) Schema field names: ✓ `name`, `description`, `related`, `override-active` (methods) / `active`
      (extensions) verified against `commit-format.md`, `diff-review.md`, `post-task-quality.md` and
      strategy-session-operations.md § Per-file Frontmatter Schema.
    - (c) Session-init Step 2 split mechanism: stale amendment text at L164–167 rewrote — "the override scan
      became an aggregated frontmatter-only read across ~16 per-file entries" → asymmetric split (methods no init
      read, bodies load at workflow trigger; extensions enumerated via `grep -l "^active: true"` producing the
      active-extensions list consumed by fire-point directives). Preamble at L165 "performing an override-presence
      scan only" also replaced with "doing minimal init-time work."
    - (d) `pre-merge-review` method → `diff-review` rename: ✓ verified on disk (file exists, contract
      broadened, related link to `review-triage`).
    - (e) CI-enforced reliable-trigger invariant: ✓ `audit-method-triggers.ts` exists at
      `packages/arc-framework/src/scripts/`, `lint:arc:triggers` npm script at `package.json:24`, runs in
      `.github/workflows/ci.yml:21`.

    **PRD refresh — applied:**
    - P0.2: dropped "(or legacy aggregate sections during interim)" parenthetical — historical interim now gone.
    - P0.5: dropped `workflow` field; renamed `has-override` → `override-active`; added one-clause rationale for
      the omitted `workflow` field (duplicates, lossy on fan-out; reverse index lives in strategy).
    - P0.6: renamed `has-steps` → `active`; noted `.steps` → `.actions` section rename.
    - P0.8: retitled "Session-init consumption — asymmetric split"; rewrote body to describe methods-no-init-read
      vs. extensions-grep-enumerate mechanism explicitly.
    - P1.13: tightened to match shipped Step 2 — Batch 1/2 structure, active-extensions grep location, Step 4
      simplification (non-defaults only, no method-override survey), imperative-citation safety pass
      (strategy-doc "See X for Y" citations removed from Step 2 and Step 4).
    - § Architectural Shape (Technical Considerations): updated from "thin awareness index" framing to the
      asymmetric-split description.
    - § Session-Init Consumption Model: retired thin-index framing for methods; narrowed to extensions-only
      enumeration with fire-point-directive rationale retained.
    - § Constitutional Rule Framing: verified against shipped Step 2 and Step 4 — no "See X for Y" strategy
      citations present; content unchanged.
    - Other P0.x bullets audited: P0.1 / P0.3 / P0.7 / P0.9 / P0.10–P0.13 all accurate as written.

    **Notes-file § Compliance-Reliability Grounding:** middle paragraph ("The thin front-loaded index serves
    awareness and compliance reassurance, NOT dispatch") rewritten to reflect landed mechanism. First paragraph
    (intent-matching vs. named-reference distinction), third paragraph (absolute-framing rationale), and fourth
    paragraph (baseline scope of reliability claim) retained as still-valid planning-phase grounding.

    **Sync notes:** ADR-013 is single-copy in `.arc/` (`packages/arc-framework/arc/reference/adr/` contains only
    `README.md`) — single-write confirmed; PRD and notes-file are single-copy per WU convention; no strategy
    edits this task, so no two-copy sync work.

    **Quality gates:** Tier 1 markdown lint clean on all three edited files (ADR-013, PRD, notes).

- [x] **3.11 Link-validator hardening + stale-ref cleanups**

    **Outcome:** Full-tree broken-link scan now yields only the expected backlog cross-WU bucket (6 hits across
    `plan-arc-modes.md`, `plan-expanded-planning-path.md`, `plan-post-release-methodology.md`,
    `plan-work-unit-mobility.md` — all tracked to specific future WU activations). Template and archive
    false-positives cleared structurally in the validator; two surviving live stale refs resolved inline.

    - **`validate-links.sh` extended** (both copies, byte-identical): `validate_file()` now short-circuits
      before target validation for (a) basename matching `*.template.md` or `template-*.md` and (b) any path
      under `reference/archive/`. Case-based early-exit pattern matches the existing `.md` extension guard.
      Comments cite the post-install-relative rationale and DEV-RULES.ARC § Documentation Boundaries
      "document what *is*, not what *was*".
    - **Test coverage**: 3 new cases in `packages/arc-framework/__tests__/integration/validate-links.test.ts` —
      (a) `agent.template.md` with broken link exits 0; (b) `template-agent.md` with broken link exits 0;
      (c) `reference/archive/old-plan.md` with broken link exits 0. Full suite: 16 / 16 tests pass.
    - **ATOMIC-INBOX cleanup**: removed the "Teach `validate-links.sh` to skip template source files" entry
      from `.arc/user/andrew/ATOMIC-INBOX.md` (delivered by this task).
    - **BACKLOG-FEATURE.md `plan-arc-lite.md` → `plan-arc-modes.md`**: Lite concept now lives as Mode 1 of the
      broader ARC Operating Modes plan (PRD-ready draft per `plan-arc-modes.md` L7). Replaced the "ARC Lite —
      Lightweight Project Mode" entry with an "ARC Operating Modes" entry covering Lite, Local, shift
      lifecycle, and mode-aware config template scaffolding.
    - **analysis-workflow-clarity-audit.md undefined `[arc-ext-post-context-load]`**: added ref-def at end
      of file (after existing `---` separator per DEV-RULES.PROJECT § Documentation style) pointing at
      `../../system/extensions/post-context-load.md`. Preserves the historical Fix-proposal prose as-is;
      only the reference target is made current.
    - **Full-tree verification**:
      `find .arc packages/arc-framework/arc -name '*.md' -type f | xargs .arc/system/scripts/validate-links.sh`
      returns exactly 6 `.arc/backlog/feature/**` cross-WU hits — zero live-ref, zero template false-positive,
      zero archive hits. All 6 hits fall inside the expected allow-list.
    - **Quality gates**: Tier 1 clean — markdown lint on 3 edited content files + updated task list;
      shellcheck on both script copies; `lint:ts` on the test file; targeted vitest (validate-links
      integration: 16/16 pass).

- [x] **3.12 Phase 3 close — Tier 3 quality gates**

    **Outcome:** Phase 3 closes clean. All Tier 3 gates green, all hooks short-circuit correctly on
    non-matching paths, full-tree link scan at the expected `backlog/feature/**` steady state. No
    regressions; ready to gate Phase 4.

    - **Tier 3 gates — all green:**
        - `npm run -s lint:md` — 195 files, 0 errors.
        - `npm run lint:ts` — clean (no output = no ESLint violations).
        - `npm run lint:sh` — clean (shellcheck on both hook scripts + `arc/system/scripts/*.sh`).
        - `npm run typecheck` — clean (source `tsc --noEmit`).
        - `npm run typecheck:test` — clean (test `tsc --noEmit --project tsconfig.test.json`).
        - `npm test` — 752 tests pass (50 unit+integration files / 707 tests + 8 E2E files / 45 tests).
        - `npm run build` — tsup success (cli.js 129.30 KB, declarations emitted).
        - Framework-sync: `__tests__/integration/framework-sync.test.ts` passes standalone (1/1) —
          part of the full `npm test` run, re-verified individually.
    - **Hook false-positive surface check:** Path-gating patterns for CHECK 12, CHECK 13, CHECK 14
      verified against a synthetic "non-methods/non-extensions/non-markdown" staged set
      (`tsconfig.json`, `.gitignore`, `packages/arc-framework/src/cli.ts`,
      `packages/arc-framework/src/lib/classification.ts`, `package.json`,
      `packages/arc-framework/package.json`). All three `grep -E` gates produce empty candidate
      lists, so their `if [ -n "$candidates" ]` guards short-circuit without invoking any
      validator. Positive-path mirror (`commit-format.md` + `post-task-quality.md` + README.md +
      QUICK-REFERENCE.md + tsconfig.json) confirms correct targeting: CHECK 12 fires on all three
      methods/extensions/agent paths, CHECK 13 fires on all four `.md` files, CHECK 14 fires only
      on the package-source non-README extension. Path gating is correct in both directions.
    - **Full-tree link-scan invariant:**
      `find .arc packages/arc-framework/arc -name '*.md' -type f | xargs .arc/system/scripts/validate-links.sh`
      yields exactly 6 `.arc/backlog/feature/**` cross-WU hits across `plan-arc-modes.md`,
      `plan-expanded-planning-path.md`, `plan-post-release-methodology.md`, and
      `plan-work-unit-mobility.md`. Zero live-ref hits, zero template false-positives, zero
      archive hits (post-3.11 validator hardening). All 6 hits fall inside the allowed allow-list
      bucket — expected steady-state.
    - **Regression check:** Working tree clean, last 2 commits aggregate the Phase 3 close diff
      (10 files changed, 245 insertions / 127 deletions) — no unstaged drift.

- [x] **3.13 Package-source neutrality guard (follow-on from 3.7 leak discovery)**

    **Outcome:** Pre-commit CHECK 14 now blocks the exact leak pattern that reached main in `43e7749`.
    Package-source per-file methods/extensions must ship `override-active: false` / `active: false`
    frontmatter AND `[No override configured]` / `[No extension configured]` placeholder bodies; any
    deviation fails the commit with a file-path-and-field-specific diagnostic. `.arc/` copies are
    silently skipped (local customization allowed); READMEs and legacy aggregates are out of scope.

    **Implementation:**
    - `packages/arc-framework/src/scripts/validate-package-neutrality.ts` — new validator. Classifies
      staged paths (`package-method` / `package-extension` / `other`), reuses
      `parseMethodFrontmatter` / `parseExtensionFrontmatter` from `lib/frontmatter/` for the toggle
      check, and `extractSectionBody` (new helper) for the placeholder body check. Frontmatter parse
      failures suppress neutrality diagnostics — CHECK 12 owns schema errors; this check declines to
      pile on.
    - `packages/arc-framework/arc/system/githooks/pre-commit` + `.arc/system/githooks/pre-commit`
      (two-copy sync) — CHECK 14 appended after CHECK 13. Grep-filters staged files to the target
      path pattern before invoking the validator, so commits touching no per-file extensions/methods
      skip the `npx tsx` call entirely (no false-positive overhead).

    **Test coverage:**
    `packages/arc-framework/__tests__/unit/scripts/validate-package-neutrality.test.ts` — 20 tests
    covering: path classification (package-method, package-extension, .arc/-skip, README-skip,
    legacy-aggregate-skip, unrelated-skip), section-body extraction (H2-to-H2 boundary, H2-to-`---`
    boundary, blank-line stripping, missing-header), neutral-file pass, each failure mode (active:true,
    override-active:true, custom `.actions` body, custom `.override` body, combined toggle+body on
    same file), `.arc/` local-customization pass, README + unrelated-path pass, frontmatter-parse
    failure suppression, missing section header.

    **Acceptance verification** (all 8 criteria from the original task body):
    - (a)–(d) blocking behaviors: unit tests `flags ... active: true`, `flags ... override-active: true`,
      `flags ... .actions body`, `flags ... .override body` — each asserts `result.pass === false` and
      diagnostic mentions the path + specific field
    - (e) `.arc/` customization pass: `silently skips .arc/ copies even when they carry the exact leak
      pattern` — stages an `.arc/` file with active:true + custom body, asserts pass + empty
      diagnostics
    - (f) READMEs + unrelated paths pass: `silently skips package-source READMEs and unrelated paths`
    - (g) Fast short-circuit: hook-level `grep -E '...' || true` produces empty candidates → `if [
      -n "$neutrality_candidates" ]` skips the validator invocation entirely. Structurally identical
      to CHECK 12's pattern
    - (h) Full suite + typecheck: 49 files / 693 tests pass (unit+integration, +1 file / +20 tests
      from this work) + 8 files / 43 tests pass (e2e); `typecheck` + `typecheck:test` + `lint:ts` +
      `lint:sh` + `lint:md` + `build` all clean

    **Execution order note (superseded):** Originally queued with flexible position within Phase 3.
    Pulled forward to immediately follow 3.7 — guardrails now protect the remaining Phase 3 sweep
    (though 3.8's work doesn't author new per-file files, so no real race condition).

---

### **Phase 3.R:** CLI Vocabulary Alignment + Session-Init Remote-Sync

**Purpose:** Align `arc user` / `arc sync` command vocabulary with developer muscle memory (git fetch/pull semantics),
add an `arc user status` inspection surface, and land session-init's remote-sync awareness — absorbing Phase 5.0. The
rename and workflow integration land together so Phase 4 and Phase 5 are authored once against the final surface.

**Origin:** Follow-on to Phase 3 close, surfaced while debugging multi-machine git-notes staleness. `arc user pull`
semantically only fetched (ref updated, disk untouched); the true `git pull`-equivalent lived behind `arc sync --load`.
No status/inspection surface existed. Session-init had no remote-sync check. A full audit of `arc user` commands vs
dev muscle-memory produced the rename plan and demonstrated Phase 5.0 couldn't be cleanly expressed until vocabulary
stabilized.

**Convention note:** Uses phase-level `X.R` as an extension of the documented task-level `X.Y.R` revision scheme; the
extension is documented in 3.R.h.

- [x] **3.R.a CLI rename + test coverage**

    **Goal:** Primitives align with git muscle memory; `arc sync` becomes bidirectional smart porcelain.

    **Outcome:** Added `arc user fetch` for the existing fetch-only semantic and rewired `arc user pull` to fetch +
    load in one step, preserving `runUserLoad`'s backup behavior. Reworked `arc sync` into a direction-aware
    porcelain that inspects local-vs-remote note refs plus disk-vs-local snapshot state, prints an explicit push/pull
    banner before acting, and prompts on divergence instead of guessing. Removed `arc sync --load`. Updated command
    exports/CLI wiring and refreshed unit coverage in `sync.test.ts`, `user-handlers.test.ts`, and the affected
    `push-recovery.test.ts` mock surface.

- [x] **3.R.b `arc user status` command**

    **Goal:** Three-way comparison (local-ref × remote-ref × disk) with actionable output; online-by-default since
    the primary question is "am I in sync with the other machine?"

    **Design decisions (resolved pre-implementation):**
    - Informational command — exit code stays zero for all state shapes, including degraded remote checks
    - Headline states: `in sync`, `remote ahead`, `disk ahead`, `conflict`; remote probe failure renders as
      `remote unavailable`, not a conflict
    - Output shape: one short summary line always; add detail lines only when there is an actionable next step
    - Default mode performs the remote check; `--offline` skips it; `--all` lists all remote identities for maintainer
      inspection
    - Build on a richer inspection result than 3.R.a's coarse sync matrix so `status` and later session-init work can
      share the same underlying contract

    Build `test-first` (one behavior at a time):
    - Clean state reports `in sync` with no action hint
    - Remote-ahead state reports actionable guidance toward `arc user pull`
    - Disk-ahead state reports actionable guidance toward `arc user save`
    - Conflict state reports both sides diverged and names `arc user fetch` as the non-destructive inspection option
    - Remote-unavailable state reports degraded status without presenting a false conflict
    - `--offline` skips the remote probe and still reports local-vs-disk state coherently
    - Backup presence from 3.R.c is surfaced in the status detail area without overwhelming the summary line
    - Freshness gap between HEAD and the saved-on commit is surfaced in the status detail area

    **Outcome:** Added `arc user status` to the CLI plus a command-layer inspection/formatting surface shared across
    the handler and future session-init work. Default mode probes remote notes and reports `in sync`, `remote ahead`,
    `disk ahead`, `conflict`, or `remote unavailable` with action hints toward `arc user pull`, `arc user save`, or
    non-destructive `arc user fetch` inspection as appropriate. `--offline` skips the remote probe while preserving
    coherent local-vs-disk reporting, `--all` enumerates remote identities for maintainer inspection, and detail lines
    now surface saved-snapshot freshness gaps plus legacy/current pre-load backup presence without bloating the summary
    line. Coverage added in new unit tests for result shaping, handler tests for flag/summary wiring, and integration
    tests for remote-ahead, offline disk-ahead, and `--all` output paths.

- [x] **3.R.c Multi-snapshot backup hardening**

    **Goal:** `.pre-load-backup.json` is no longer single-shot; successive pulls preserve the last N pre-load
    snapshots so a second pull-before-review doesn't lose the first pre-load state.

    **Design decisions (resolved pre-implementation):**
    - Timestamped snapshot files replace new writes to the single-shot backup file
    - Retention is hardcoded at 3 for this phase — no new config key
    - Legacy `.pre-load-backup.json` remains readable/surfaceable during transition, but new pulls write only the
      timestamped form
    - Pruning happens immediately after a new snapshot is created

    Build `test-first` (one behavior at a time):
    - Pull/load creates a timestamped pre-load snapshot before overwriting local state
    - Fourth snapshot prunes the oldest retained snapshot, leaving the latest three
    - Legacy `.pre-load-backup.json` coexists without breaking retention or discovery
    - Dotfile serialization rules continue to exclude both legacy and timestamped backup files
    - Backup metadata surfaces correctly in `arc user status`

    **Outcome:** `runUserLoad` now writes timestamped pre-load snapshots instead of overwriting the single-shot
    legacy backup file, retains only the latest three timestamped snapshots immediately after each new write, and
    leaves any existing legacy `.pre-load-backup.json` in place for explicit transition visibility. Backup discovery
    used by `arc user status` now reports timestamped snapshots newest-first with legacy files still surfaced, and
    backup-related stale-file warnings point at the specific snapshot created during the load. Integration coverage now
    verifies timestamped snapshot creation, retention pruning on the fourth snapshot, legacy coexistence, dotfile
    exclusion, and status-surface backup reporting.

- [x] **3.R.d `session.remote_sync` config addition**

    **Goal:** New config key exists in both `arc-config.yml` copies with inline documentation; no behavior yet
    (consumed by 3.R.e).

    **Design decisions (resolved pre-implementation):**
    - Flat dotted-key config, matching the rest of `arc-config.yml`
    - Governs session-init remote probing only; does not change handoff behavior or manual CLI command behavior

    **Outcome:** Added `session.remote_sync: enabled` to both `arc-config.yml` copies under a new Session
    Initialization section, with inline comments clarifying that session-init may fetch/probe remote notes
    automatically while restoring user-directory content to disk remains explicitly user-confirmed. Updated init
    integration coverage to assert the new default key is rendered for both solo and team-mode installs. No runtime
    behavior consumes the setting yet; 3.R.e remains the first behavioral task.

- [x] **3.R.e Session-init remote-sync integration**

    **Goal:** Land the session-init/runtime pieces needed for remote-sync awareness without bundling them into one
    oversized review increment.

    - [x] **3.R.e.1 Session-init remote fetch + divergence orientation**

        **Goal:** Session-init probes remote state early, surfaces actionable divergence in the orientation, and asks
        about remote resolution before the standard proceed prompt.

        **Design decisions (resolved pre-implementation):**
        - Session-init uses direct git fetch/probe steps, not a subprocess call to `arc user fetch`
        - Remote notes inspection fetches into a temp ref for comparison rather than mutating the live local notes ref
          before user confirmation
        - Orientation reports coarse actionable states, not precise ahead/behind counts for notes
        - Divergence resolution prompt is separate from the standard `Proceed to Next Action?` prompt

        Build `test-first` (one behavior at a time):
        - `session.remote_sync: disabled` skips the remote probe path cleanly
        - Clean remote state produces no divergence block and leaves the normal proceed prompt unchanged
        - Remote-unavailable probe failure degrades gracefully with a single actionable note
        - Notes/code divergence produces the orientation block and the remote-resolution prompt before the normal
          proceed prompt
        - Accepting the resolution path runs the intended pull actions and reports the result clearly

        **Outcome:** Added a non-interactive helper surface, `arc user status --session-init`, that respects
        `session.remote_sync`, performs the existing temp-ref remote probe without mutating live refs or disk, and
        reports coarse session-init states (`disabled`, `clean`, `remote-ahead`, `conflict`, `remote-unavailable`)
        plus whether the agent should prompt the user to pull before continuing. Updated the user-status handler/CLI
        wiring and summary formatting for the new mode, and documented Step 1.5 in both session-init workflow copies
        so the agent runs the probe, incorporates the result into orientation, and keeps the pull prompt in the
        harness layer rather than inside the CLI. Verification: targeted unit tests (`user-status`, `user-handlers`,
        `sync`, framework-sync), targeted `user.test.ts` integration coverage, `lint:ts`, `typecheck`, and task-file
        markdown lint all clean.

    - [x] **3.R.e.2 Ancestor-walk hardening for `arc user load` / `arc user pull`**

        **Goal:** Remove the fragile default-walk failure mode that motivated this phase so "no saved user directory
        found" only appears when there truly is no reachable noted ancestor.

        **Design decisions (resolved pre-implementation):**
        - Fix the core loader behavior rather than exposing a new `--max-ancestors` CLI flag in this phase
        - Use true reachable-ancestor detection internally and surface actionable guidance when the nearest note is far
          back in history

        Build `test-first` (one behavior at a time):
        - Reachable noted ancestor beyond the old 20-commit window is still found and loaded
        - No-note state still reports cleanly when no noted ancestor exists anywhere on reachable history
        - Guidance message distinguishes "note exists but is far back" from "no saved note exists"
        - `arc user pull` inherits the same hardened lookup behavior as `arc user load`

        **Outcome:** Removed the default `maxAncestorWalk: 20` false negative by making nearest-note lookup scan all
        reachable ancestors unless an explicit cap is passed for a targeted test. `runUserLoad` now records how far
        back the loaded note was found, and load summaries surface that distance so a far-back reachable note is
        distinguished from the true no-note case. Updated load/pull/sync handler copy from "recent ancestors" to
        "any reachable ancestor" so the null path only claims what the search actually checked. Verification: targeted
        unit coverage for user status/handlers/sync, targeted `user.test.ts` integration coverage including a
        >20-commit ancestor case, plus `lint:ts` and `typecheck` all clean.

- [ ] **3.R.f Documentation + ADR sync (runs after 3.R.m and 3.R.g)**

    **Goal:** Framework two-copy surfaces first, then single-copy docs and ADR history. Scope expanded by the
    second pass to cover new probe commands, vocabulary rename, merge-recovery behavior, and `--yes` /
    `--max-walk` flags. Runs after second pass so doc churn happens once against the final surface.

    - [ ] **3.R.f.1 Two-copy doc sync for remaining CLI references**

        **Goal:** Template + installed copies reflect the finalized command vocabulary, bootstrap semantics,
        and second-pass additions.

        - Update both-copy references in:
          `session-handoff.md`, `strategy-session-operations.md`, `strategy-team-coordination.md`,
          `QUICK-REFERENCE.md`, and `user/README.md`
        - Replace stale `arc sync --load` references with the new command model
        - Where person-to-person bootstrap is ref-only, switch guidance from `arc user pull --identity {outgoing}`
          to `arc user fetch --identity {outgoing}` rather than implicitly overwriting local disk state
        - Second-pass additions to sweep in:
            - New probe commands (`arc extensions status`, `arc methods status`, `arc active status`, each with
              `--session-init` mode) — primarily in QUICK-REFERENCE and session-init.md
            - Vocabulary: `disk ahead` → `local unsaved`; canonicalize `conflict` over `divergence` in user-facing
              phrasing
            - Merge-recovery label (`"Merge: rebase my save onto remote, then push"`) wherever push recovery is
              discussed
            - `--yes` flag on `arc sync`, `arc user pull`, `arc user fetch`, `arc user load`
            - `--max-walk` flag on `arc user load`, `arc user pull`, `arc sync` pull direction
        - Grep-verify no remaining stale command references in `.arc/**` and `packages/arc-framework/arc/**`,
          excluding `reference/archive/**` and `reference/analysis/**`

    - [ ] **3.R.f.2 Single-copy docs + ADR-012 amendment + Phase 5.0 retirement pointer**

        **Goal:** Single-copy docs reflect the final command surface; ADR-012 captures the full Phase 3.R
        vocabulary realignment (both passes); the old Phase 5.0 pointer retires formally.

        - Single-copy docs to update:
          `plan-arc-modes.md`, `plan-work-unit-mobility.md`, `docs/the-framework.md`,
          `docs/reference/team-coordination.md`, `docs/index.md`, `docs/faq.md`
        - ADR-012 amendment — append a dated amendment section; preserve the original decision body unchanged.
          Content covers both passes:
            - First pass: `pull → fetch`, `pull = fetch + load`, `sync` as direction-aware porcelain, durable
              2×2 sync-state matrix
            - Second pass: three new probes (extensions/methods/active status), vocabulary rename
              (`local unsaved`, canonical `conflict`), merge-recovery semantics, bounded ancestor walk with
              `--max-walk` override, confirmation-by-default + `--yes` policy
        - QUICK-REFERENCE should point to the amendment for durable semantics context
        - Verify the old Phase 5.0 pointer now resolves entirely through 3.R.e / 3.R.f (confirm no second-pass
          addition introduced a 5.0-adjacent reference)
        - Leave `reference/archive/**` and `reference/analysis/**` untouched as historical record

- [ ] **3.R.g Hook invocation fix for non-executable shell scripts**

    **Goal:** Fresh clones do not require manual chmod to execute hook-invoked shell scripts.

    **Design decisions (resolved pre-implementation):**
    - Use bash-prefix invocation in hooks; do not add install-time chmod logic and do not change tracked file mode

    Build `test-first` (one behavior at a time):
    - Hook path executes `validate-links.sh` successfully without relying on the exec bit
    - No remaining hook directly invokes `.sh` files that may be non-executable in a fresh clone

    **Implementation notes:**
    - Update hook invocations to `bash .../script.sh`
    - Two-copy sync any hook changes
    - Acceptance is explicit fresh-clone safety, not a doc-note-only fallback

**Second Pass — Post-Review Remediation**

**Purpose:** Address findings from the post-implementation review of 3.R.a–h. Four groupings: safety behaviors
(user-visible correctness on destructive paths), vocabulary + reporting (CLI output matches mental models),
probe-pattern extension (consistent coverage across extensions / methods / active-status, not a one-off), and
structural cleanup + test coverage (the integration gap that let silent-discard slip past unit tests).

**Origin:** `/arc-task-review` on 3.R.a–h surfaced three warrants-discussion items (non-TTY conflict exits silently,
push-recovery "pull first" discards just-saved note, sync pull path skips overwrite confirm) and a set of smaller
quality concerns. External research (shallow-clone conventions, Gerrit prior art) fed the ancestor-walk strategy.
Probe-pattern extension was added to this pass rather than deferred because the first-pass 3.R.e.1 surface proved
clean enough that inconsistency across the three remaining session-init discovery points is the bigger risk.

- [x] **3.R.i Safety behaviors**

    **Goal:** Every user-visible destructive path confirms by default, degrades gracefully in non-TTY environments,
    never silently discards saved state, and surfaces actionable diagnostics when bounded operations hit their cap.

    - [x] **3.R.i.a Non-TTY conflict + failure hardening**
        - `handleConflict` (`sync.ts`) non-TTY branch now calls `degradeConflictToSaveOnly` — saves the user
          directory, emits two warn-level banners ("conflict", "degrading to save-only"), then outros clean
          without exit code 1. Matches the `prompt` policy degradation shape.
        - `pushWithInteractiveRecovery` non-TTY divergence branch now returns
          `{ kind: "failed-nontty-conflict" }` instead of the generic `{ kind: "failed", error }`. Added to
          the `PushResult` discriminated union.
        - Both `handlePushDirection` (sync.ts) and `handleUserPush` (user.ts) grew a `case "failed-nontty-conflict"`
          arm that renders the "local save preserved; push skipped" banner plus a context-appropriate
          re-run hint and sets exitCode 1 (push attempted and rejected).
        - Tests: `push-recovery.test.ts` divergence-non-TTY case updated + second case added; `sync.test.ts`
          gained the `failed-nontty-conflict` caller test plus a new non-TTY conflict-degradation describe
          block (diverged, remote-ahead+disk-different, save-failure paths); `user-handlers.test.ts`
          converted `isNonInteractiveEnvironment` to a mockable toggle and added the discriminant test.
        - Implementation batched rather than strict test-first: the `PushResult` discriminant change is a
          single coordinated edit across type + impl + two callers, and the non-TTY `handleConflict` path
          mirrors an existing save-only shape verbatim. No independent discovery value from slicing.

    - [x] **3.R.i.b Push-recovery merge redesign**

        **Outcome:** Replaced the silent-discard "Pull first (overwrite local with remote)" recovery option
        with a merge flow (`pushWithInteractiveRecovery`): force-fetch aligns the local notes ref with
        remote, `runUserSave` writes the current disk state on top of the new base, then the aligned
        state is pushed. Select label now reads `"Merge: rebase my save onto remote, then push"`.

        **Surface changes:**
        - `PushResult` discriminant: `via: "merge"` replaces `via: "pull-then-push"` entirely.
        - `pushWithInteractiveRecovery` now requires `cwd: string` as a third arg so the re-save can
          locate the user directory. Both callers (`handlePushDirection` in sync.ts,
          `handleUserPush` in user.ts) updated.
        - Recovery errors (including `UserSaveError` during re-save) flow through the existing outer
          try/catch → `{ kind: "failed", error }`. No partial push on save failure — the final push
          only runs if save succeeded.

        **Test-first execution:**
        - Added failing tests first for both the happy path (fetch→save→push ordering, returns
          `via: "merge"`) and the save-failure path (no second push call, `UserSaveError` surfaces
          as `{ kind: "failed", error }`). Verified they failed against the current code.
        - Implementation change made both green; replaced the parallel `pulls-then-pushes` test in
          `user-handlers.test.ts` with the new merge expectation (adding `mockRunUserSave` tracking).
          Updated `sync.test.ts` push-recovery mock to a 3-arg signature.

    - [x] **3.R.i.c Confirmation defaults + `--yes` flag**
        - `handlePullDirection` (sync.ts) now runs the overwrite confirm when `hasLocalNotes` is true,
          matching `arc user pull` behaviour. The conflict-select pull path passes `yes: true` through a
          shared `DirectionParams` type so the user isn't double-confirmed.
        - Added `-y, --yes` to `arc sync`, `arc user pull`, `arc user fetch`, `arc user load` in cli.ts.
          Handler option types extended: `SyncOptions`, `UserPullOptions`, `UserFetchOptions`,
          `UserLoadOptions`. `handleUserLoad` accepts `yes` preemptively (no confirm exists there yet —
          `runUserLoad` creates a timestamped backup; the flag is wired for future consistency).
        - Standard prompt copy: `"Local notes will be overwritten by remote. Continue?"` — hoisted to a
          module-level `OVERWRITE_CONFIRM_MESSAGE` constant in both sync.ts and user.ts.
        - Non-TTY implicitly skips the overwrite confirm via a shared `shouldSkipOverwriteConfirm` helper
          in user.ts and an inline guard in sync.ts's `handlePullDirection`. Loud failures from 3.R.i.a
          (push-recovery non-TTY, conflict non-TTY) are unaffected — those run before this confirm.
        - Tests added: confirm-present, confirm-declined (cancel), `--yes` bypass, non-TTY bypass — for
          `handleSync` pull direction, `handleUserFetch`, `handleUserPull`. Also: "skips overwrite
          confirm after conflict pull resolution (already acknowledged)" regression case.

    - [x] **3.R.i.d Ancestor-walk cap + diagnostic**

        **Outcome:** Replaced the uncapped rev-list walk with a bounded default (`DEFAULT_MAX_ANCESTOR_WALK = 1000`,
        exported from `save-load.ts`) and an explicit `--max-walk <n>` override on `arc user load`,
        `arc user pull`, and `arc sync`. Cap-hit without finding a note surfaces via the new
        `onWalkExhausted(walked, maxWalk)` callback and renders the spec message verbatim.

        **Surface changes:**
        - `findNearestUserNote` now returns a structured `NearestNoteSearch`
          (`{ note, walked, maxWalk, capped }`) instead of `NearestUserNote | null`. Internal callers in
          `sync-status.ts` (`runUserStatus`, `inspectDiskVsLocalSnapshot`) updated to destructure `.note`.
        - `UserLoadOptions` / `UserPullOptions` gained optional `onWalkExhausted` callback. `runUserLoad`
          fires it when `capped && note === null`. `runUserPull` forwards it through to `runUserLoad`.
        - `buildLoadSummary` replaces the prior
          `"Note: loaded from a reachable ancestor N commit(s) behind HEAD."` line with
          `"Loaded from N commit(s) back."` — emitted only when `ancestorDistance > 0`.
        - Handlers (`handleUserLoad`, `handleUserPull`, `handlePullDirection` in sync.ts) render the
          canonical diagnostic
          `"walked N ancestors without finding a note; use --max-walk to search deeper or confirm remote
          state with arc user status"` when the callback fires and result is null. `handleUserPull` and
          `handlePullDirection` set `process.exitCode = 1`; `handleUserLoad` warns without exit code (its
          existing "no note" path already didn't set one).
        - CLI flags added with `parseInt` coercion on `arc user load`, `arc user pull`, `arc sync`.

        **Test-first execution:**
        - New `__tests__/unit/save-load.test.ts` (8 tests) covers `findNearestUserNote` cap application,
          overrides smaller/larger than default, capped-true accounting, and `runUserLoad`'s
          `onWalkExhausted` callback firing. All failed before implementation, pass after.
        - New `__tests__/unit/user-format.test.ts` (3 tests) covers the `"Loaded from N commits back"`
          phrasing + absence-when-zero + removal of the legacy "reachable ancestor" phrasing.
        - `__tests__/unit/user-status.test.ts` buildLoadSummary assertion updated to the new phrasing.
        - `__tests__/unit/user-handlers.test.ts` / `sync.test.ts` extended with `--max-walk` threading and
          walk-exhausted diagnostic tests (handler-level).
        - `mockHasLocalNotes` persistence across tests fixed by adding
          `mockHasLocalNotes.mockResolvedValue(false)` to the sync `handleSync direction handling` beforeEach —
          `vi.clearAllMocks()` clears history but not `.mockResolvedValue` implementations.
        - Implementation note: `let walkExhausted` pattern triggered
          `@typescript-eslint/no-unnecessary-condition` because TS doesn't see callback-side mutation.
          Refactored to `const walkState: { capture: … | null } = { capture: null }` in all three handler
          sites — the object wrapper keeps narrowing intact while allowing the callback to mutate.

        **Follow-up (post-review):**
        - `handleUserLoad` now sets `process.exitCode = 1` on walk-exhausted to match `handleUserPull` and
          `handlePullDirection`. Rationale: walk-exhausted is ambiguous ("we can't confirm there's no note
          deeper than the cap") and deserves the same failure signal across all three commands. Plain
          "no note found" stays at exit 0 — unambiguous state, nothing to load. One-line change + test
          update. Identified during post-implementation design review.

- [ ] **3.R.j Vocabulary + reporting**

    **Goal:** CLI output matches user mental models without requiring code-level translation. Single canonical
    terms across layers. Reporting surfaces enough context that a cold-open user doesn't have to guess.

    - [x] **3.R.j.a Status vocabulary rename + detail enrichment**

        **Outcome:** `disk ahead` renamed to `local unsaved` across `UserStatusHeadline` union, the
        `determineUserStatusHeadline` / `determineUserStatusAction` branches, and all consuming
        tests. Cold-open audit of the other headlines (`in sync`, `remote ahead`, `conflict`,
        `remote unavailable`) — all pass; no further renames. Canonical vocabulary documented as a
        JSDoc block on `UserStatusHeadline` in `types.ts`.

        **Surface changes:**
        - `UserStatusResult` gained `ancestorDistance: number`, `savedAtRelative: string | null`,
          and `unsavedDirection: UserUnsavedDirection | null`. New `UserUnsavedDirection` union
          (`"edits" | "missing" | "mixed"`) added to `types.ts` with JSDoc distinguishing each case.
        - `BuildUserStatusInput` accepts the three new fields as optional; callers keep working
          unchanged. `runUserStatus` populates all three.
        - `buildUserStatusResult` renders three new detail lines when data is present:
            - Direction hint (only when headline is `local unsaved`):
              `"Disk has unsaved edits not yet in the saved note."` /
              `"Disk is missing updates from the saved note."` /
              `"Disk has unsaved edits and is missing updates from the saved note."`
            - Save timestamp: `"Saved 11 hours ago."`
            - Ancestor distance (distance > 0): replaces the prior
              `"Saved snapshot is from abc1234, not current HEAD."` with
              `"Saved snapshot is from abc1234, N commit(s) back."`
        - New `commands/user/relative-time.ts` exporting `formatRelativeTime(past, now?)` — buckets
          seconds → minutes → hours → days with singular/plural handling and future-date clamping.
          `runUserStatus` calls `git show -s --format=%at <commit>` via `io.exec` when a note exists
          and passes the formatted relative string through to `buildUserStatusResult`.
        - `inspectDiskVsLocalSnapshot` refactored from returning `UserSyncDiskState` to a
          `DiskVsSnapshotInspection { state, direction }`. `inspectUserSyncState` destructures
          `.state` to preserve its public contract. New `computeUnsavedDirection` helper
          (exported via `user.ts` barrel for testability) compares manifest file-key sets plus
          content diffs to pick the direction.

        **Test coverage added:**
        - `__tests__/unit/user-status.test.ts`: 4 new `buildUserStatusResult` tests (direction hint
          rendering for each case + suppression when headline is not `local unsaved`), 2 save-timestamp
          tests (present/absent), 1 ancestor-distance-at-HEAD suppression test, 4 `computeUnsavedDirection`
          tests (edits / edits via modified content / missing / mixed). Updated the pre-existing
          3.R.b "disk-ahead" assertions to the new `local unsaved` + `"N commit(s) back"` phrasing.
        - `__tests__/unit/relative-time.test.ts` (new, 5 tests): bucket boundaries, singular/plural,
          future-date clamping.
        - `__tests__/integration/user.test.ts`: existing local-unsaved test extended to assert
          `unsavedDirection === "edits"` + direction-hint line + regex-matched `savedAtRelative`
          (shape, not literal). Integration summary tests updated for the renamed headline.

        **Quality gates:** 772 unit+integration tests green; 45 E2E green; `typecheck`,
        `typecheck:test`, `lint:ts`, and `lint:sh` all pass. Live `npx arc user status`
        confirms rendering end-to-end.

    - [x] **3.R.j.b `conflict` vs `divergence` canonical language**

        **Outcome:** Canonicalized `conflict` as the user-facing term for "refs both moved from common
        ancestor." Added presentation-mapping JSDoc to `UserSyncRefState` in
        `commands/user/types.ts` flagging the `diverged` variant as code-level-only and pointing at
        `UserStatusHeadline` for canonical vocabulary. Swept user-facing strings:
        `pushWithInteractiveRecovery`'s "Push rejected — remote has diverged from local notes."
        → "Push rejected — local and remote notes conflict (both moved since common ancestor)."; same
        phrasing adopted in `handleConflict` (`sync.ts:115`) and in the session-init conflict detail
        (`sync-status.ts:236`). `cli.ts --force` help text and the two JSDoc siblings on
        `UserPushOptions.force` / `UserFetchOptions.force` updated to "conflict" wording. Module-level
        and function-level JSDoc in `push-recovery.ts` and `sync.ts` updated ("divergence" →
        "conflict", "Non-divergence" → "Non-conflict"). Internal helper `isDivergentPushError` retained
        — names the git-level topology, matches `UserSyncRefState.diverged` kept-for-code-clarity
        principle. Disk-vs-note vocabulary in `UserUnsavedDirection` JSDoc moved off the overloaded
        "divergence" term to "mismatch" (different semantic domain from ref-conflict). Tests updated:
        `sync.test.ts` literal string assertion + `user-handlers.test.ts` substring from
        "remote has diverged" → "notes conflict". Doc touch: `session-handoff.md § Save to Git Notes`
        error-handling bullet rewritten with conflict vocabulary, and folded in the stale
        "pull-first" option reference (no such option exists in current `pushWithInteractiveRecovery`
        — replaced with "merge (fetch remote, re-save local state on top, then push)"). Two-copy
        sync applied (`.arc/` + `packages/arc-framework/arc/` template).

        **Quality gates:** lint:ts, typecheck, `lint:md:file` on both session-handoff copies,
        targeted unit tests (`sync`, `user-handlers`, `user-status`, `push-recovery`) all green —
        77 tests pass.

    - [ ] **3.R.j.c Label + spinner + summary consistency**
        - `handlePullDirection` spinner "Pulling" / result-box label "Loaded" — pick one verb, apply file-wide.
        - Audit verb tense across all `p.log.info` / `p.spinner` / `p.note` calls in sync / user command layer.
          Document the chosen convention in a short comment near the first use.
        - Doc touch: `session-handoff.md § Save to Git Notes` gains one paragraph telling agents to surface
          `arc sync` exit code in the end-of-session summary so success/failure is visible (addresses the
          "work didn't land but user thought it did" class of confusion from the review).
        - Two-copy sync on `session-handoff.md`.
        - **`local unsaved` action-hint split (semantic accuracy):** `determineUserStatusAction` currently
          returns `"run \`arc user save\`"` for the entire `local unsaved` headline, but the headline covers
          two cases with different remediations: (a) `diskState === "different"` → save is correct, and
          (b) `refState === "local-ahead"` with `diskState === "same"` → work IS saved to a local note,
          just not pushed, so the correct hint is `"run \`arc user push\`"` (or `arc sync`). Split the
          switch to pick the hint based on the underlying state, not the headline alone. Update the
          `buildUserStatusResult` unit tests in `user-status.test.ts` to cover both sub-cases. Pre-existing
          bug surfaced during 3.R.j.a; scoped here because it's a naming-semantics fix rather than new
          behavior. Flagged by review of 3.R.j.a.

- [ ] **3.R.k Probe-pattern extension — extensions, methods, active status**

    **Goal:** Non-destructive CLI probes returning structured state for session-init's harness layer to consume.
    Pattern established by 3.R.e.1's `arc user status --session-init` extended consistently across the three
    remaining session-init discovery points. Probes stay stateless and fast; no state mutation.

    **Scope note:** `arc hooks status` is out of scope for this work unit (session-init doesn't discover hook
    state at init time). Worth a future work unit if hook health surfaces as a need.

    - [ ] **3.R.k.a `arc extensions status` probe**
        - Enumerate active extensions (replaces the `grep -l "^active: true" .arc/system/extensions/*.md` in
          session-init Step 2's identity/role/extensions batch).
        - Return: active basenames, inactive basenames, orphaned extension-point references (workflow anchor
          suffixes pointing at non-existent extension files — surfaced only for `--all` mode; `--session-init`
          mode returns only the active list).
        - Unit tests on formatter; integration test against a fixture tree.

    - [ ] **3.R.k.b `arc methods status` probe**
        - Enumerate methods with `override-active: true` (project has overridden the ARC default).
        - Return: override-active methods, defaults-active methods. `--session-init` mode returns only the
          override-active list since defaults don't affect loading behavior.
        - Same test shape as `.k.a`.

    - [ ] **3.R.k.c `arc active status` probe**
        - Full mode: enumerate `.arc/active/**/status-*.md`, parse Branch / State / Next Task / Task List fields,
          return candidates for disambiguation.
        - Lite mode: single fixed-path check against `.arc/active/status.md`.
        - Zero-file / one-file / many-file cases map to existing session-init disambiguation logic from
          session-init.md Step 2, Item 8.
        - `--session-init` mode returns either the resolved path (one-file case), `null` (zero-file), or a
          structured candidate list (many-file case for agent-side disambiguation).
        - Integration test against a fixture with multiple status files covering all three cases.

    - [ ] **3.R.k.d Session-init workflow integration**
        - Replace `grep -l "^active: true"` in session-init Step 2 with `arc extensions status --session-init`.
        - Replace any init-time method-inspection language with `arc methods status --session-init`.
        - Replace the Full-mode many-file status disambiguation logic in Step 2 Item 8 with
          `arc active status --session-init`, retaining the user-prompt fallback for many-file cases.
        - Add a short section to `strategy-session-operations.md § Context Loading Model` describing the probe
          pattern — non-destructive, harness-consumes, when to reach for it in future extensions.
        - Two-copy sync on `session-init.md`.

- [ ] **3.R.l Structural cleanup + test coverage**

    **Goal:** Close review-surfaced code quality items; close the integration coverage gap that let
    push-recovery's silent-discard slip past unit tests.

    - [ ] **3.R.l.a `findNearestUserNote` cleanup**
        - Remove unreachable `break` after `return` in the walk loop (`save-load.ts` ~line 190).
        - Collapse `if (!noteContent || !foundCommit) return null; return null;` to a single `return null`.
        - Extract the rev-list walk into a named helper (`walkAncestorsForNote`) so 3.R.i.d's cap + diagnostic
          has a clean injection point.
        - Pure cleanup; no behavior change from this subtask alone.

    - [ ] **3.R.l.b Module relocation**
        - `runUserPush`, `hasRemoteNotes`, `hasLocalNotes`, `runUserFetch`, `runUserPull` move from
          `commands/user/sync-status.ts` to a new `commands/user/push-fetch.ts` (push/fetch primitives, not
          status). `inspectUserSyncState`, `runUserSessionInitStatus`, `runUserStatus`, `buildUserStatusResult`
          stay in `sync-status.ts`.
        - `readPmMode` + `readSessionRemoteSyncEnabled` move from `handlers/shared.ts` to a new
          `lib/config-readers.ts` (config helpers, not handler shared utilities).
        - `commands/user.ts` facade updated; no public API surface change.
        - Tests move with their target modules; no content change.

    - [ ] **3.R.l.c Integration test for `arc sync` → conflict → merge recovery**
        - New integration test exercising the full flow end-to-end against real git notes: local save → remote
          force-reset to diverge → `arc sync` → conflict detected → merge recovery (3.R.i.b) runs → verify final
          state: local disk reflects user's work, local ref contains new save on top of remote's base, remote ref
          equals local ref post-push.
        - Closes the coverage gap the review flagged — unit tests mocked git-note I/O so the silent-discard
          behavior couldn't be observed.
        - Lives in `__tests__/integration/user.test.ts` alongside existing pull-flow tests.

    - [ ] **3.R.l.d Refactor `runUserLoad` walk-exhausted surface from callback to discriminated union**

        **Origin:** 3.R.i.d chose an `onWalkExhausted(walked, maxWalk)` callback on `UserLoadOptions` /
        `UserPullOptions` rather than a discriminated return. The pragmatic reason was avoiding ~30
        integration-test assertions on `UserLoadResult | null`. With 3.R.l already opening up this code,
        the clean API becomes feasible in the same pass.

        **Current surface (to remove):**
        - `UserLoadOptions.onWalkExhausted?: (walked, maxWalk) => void`
        - `UserPullOptions.onWalkExhausted?: (walked, maxWalk) => void`
        - Handler-side capture boilerplate:
          `const walkState: { capture: WalkExhaustedCapture | null } = { capture: null }` — 3 copies in
          `handleUserLoad`, `handleUserPull`, and `handlePullDirection` (sync.ts). The wrapper exists solely
          to sidestep TS narrowing across callback mutation; the union refactor retires it.

        **Target surface:**
        - `export type UserLoadOutcome = UserLoadResult | UserLoadWalkExhausted;`
          where `UserLoadResult` gains `kind: "loaded"` and `UserLoadWalkExhausted = { kind: "walk-exhausted";
          walked: number; maxWalk: number }`. `runUserLoad` returns `Promise<UserLoadOutcome | null>` (null
          reserved for "no notes exist at all"). `runUserPull` mirrors.
        - `buildLoadSummary` signature stays `(UserLoadResult) => string`; callers narrow via
          `if (result.kind === "loaded")` before calling.
        - Pairs cleanly with 3.R.l.a's `walkAncestorsForNote` extraction — both touch the same walk internals.

        **Call sites to update:**
        - `handleUserLoad` (user.ts): replace `walkState` wrapper + `onWalkExhausted` callback with a
          `switch (result.kind)` on the outcome. Walk-exhausted branch keeps exit 1 (set in 3.R.i.d follow-up).
        - `handleUserPull` (user.ts): same pattern.
        - `handlePullDirection` (sync.ts): same pattern.

        **Test migration:**
        - `__tests__/unit/save-load.test.ts`: replace `onWalkExhausted` spy assertions with outcome-shape
          assertions. 2 tests affected (the `runUserLoad — onWalkExhausted callback` describe block).
        - `__tests__/unit/user-handlers.test.ts`: mockRunUserLoad / mockRunUserPull return discriminated
          outcomes directly instead of invoking callbacks. Roughly 4 tests across `handleUserLoad` and
          `handleUserPull` walk-exhausted describes.
        - `__tests__/unit/sync.test.ts`: one test using `mockRunUserPull.mockImplementation` with callback
          invocation → return outcome directly.
        - `__tests__/integration/user.test.ts`: ~10 assertions on `loadResult!.fileCount` /
          `loadResult!.fromAncestor` / `loadResult!.ancestorDistance` require narrowing via
          `if (loadResult?.kind === "loaded")`. Also the existing `expect(loadResult).toBeNull()` at
          line ~330 (shallow-clone cap-hit case) becomes `expect(loadResult?.kind).toBe("walk-exhausted")`.
        - No production behavior change; this is a type-surface refactor with tests following.

    - [ ] **3.R.l.e `resolveArcRoot` — cwd walk-up for CLI commands touching `.arc/`**

        **Origin:** Surfaced during 3.R.j.a manual verification. `arc user status` invoked from a
        subdirectory (e.g., `packages/arc-framework/`) silently treats `.arc/user/{identity}/` as
        absent, which flows through `inspectDiskVsLocalSnapshot` to `state: "different"`,
        `direction: "missing"`, headline `"local unsaved"`, action hint `"run arc user save"`.
        All three are wrong — the user hasn't actually lost content, and `arc user save` would
        fail in that state with `"No eligible files found in user directory to save."` (pre-existing,
        highlighted more by the new direction-hint phrasing but not caused by 3.R.j.a). Git, npm,
        cargo all walk up from cwd to find their project marker; ARC should match.

        **Change:**
        - Add `resolveArcRoot(startDir?: string): string | null` in `lib/paths.ts` (or equivalent
          existing location). Walks upward from `startDir` (defaults to `process.cwd()`) looking
          for a directory containing `.arc/`. Returns the absolute path on success, `null` when
          the walk reaches filesystem root without finding one.
        - Wire it into every CLI handler that currently takes `cwd: process.cwd()` and uses it
          to resolve `.arc/` paths. Initial audit targets (from `commands/user.ts` + sync: the
          known set touched by this WU):
          `handleUserAdd`, `handleUserSave`, `handleUserLoad`, `handleUserFetch`, `handleUserPull`,
          `handleUserPush`, `handleUserStatus`, `handleSync`. Broader sweep in the same pass
          for other commands that take `cwd` (init/update/join/status/diff/log/reconfigure etc.) —
          full list surfaced by grepping `process.cwd()` in `src/commands/` and `src/handlers/`.
        - On `null` return, handlers emit a single canonical error via `p.log.error` (or the
          project's error primitive) and `process.exit(1)`:
          `"Not inside an ARC project (no .arc/ directory found walking up from cwd)."`
        - Do NOT walk up for commands that operate on the current directory by design (e.g.,
          `arc init` — creates `.arc/` at cwd). Those remain explicit.

        **Tests:**
        - Unit tests on `resolveArcRoot`: finds at cwd, finds one level up, finds two levels
          up, returns null when absent, handles filesystem root boundary cleanly, respects
          `startDir` when provided.
        - Integration: one new e2e test exercising `arc user status` from a subdir of an
          initialized repo — confirms the status result matches a root-cwd invocation of the
          same command. Guards against regression.

        **Risk flags:**
        - Symlinks: if the cwd is through a symlink (e.g., `~/dev -> /mnt/data/dev`), realpath
          resolution may or may not be desired. Recommend: walk the given path as-is without
          `fs.realpathSync`, matching git's default behavior. Document the choice.
        - Monorepos with nested `.arc/` (unlikely but possible): the first `.arc/` found wins.
          Acceptable since nested ARC projects are out of scope for now.

- [ ] **3.R.m Second-pass close — quality gates + Phase 3.R-wide content**

    **Goal:** Second-pass remediation lands cleanly. Phase 3.R quality gates (final, covering both passes) run
    here; the strategy-doc addendum from retired 3.R.h lands here. First-pass residual items (3.R.g, 3.R.f) run
    after, not before — second pass would have churned 3.R.f's target files and 3.R.g's hook fix would have been
    redone against a moving surface.

    - Full quality gate pass: `typecheck`, `typecheck:test`, `lint:ts`, `lint:sh`, `lint:md`, `build`,
      `test` (unit + integration), `test:e2e`
    - Required local smoke on the full Phase 3.R command surface (both passes):
      `arc user add`, `save`, `load`, `fetch`, `pull`, `push`, `status`, `sync`,
      `arc extensions status`, `arc methods status`, `arc active status`
    - Required local smoke on second-pass behavior additions: `arc sync` merge-recovery path,
      `arc user load --max-walk` flag + cap-hit diagnostic, status output carrying `local unsaved` headline,
      ancestor-distance, and save-timestamp detail lines
    - Optional manual dogfooding: reproduce the original multi-machine divergence scenario on the secondary
      laptop once both passes are in place
    - Strategy addendum (moved from retired 3.R.h): update `strategy-task-list-formatting.md` § Revision
      Numbering to document the phase-level `X.R` form for cross-cutting follow-on work; tighten the old
      `3.1.R.1/3.1.R.2` example to `3.1.R.a/3.1.R.b` to align with current numbering rules
    - Confirm `atomic-session-init-optimization.md` has no remaining items deferred from either pass
    - Update `status-session-init-optimization.md`: Last Completed = 3.R.m; Next Task = 3.R.g; Next Action =
      begin 3.R.g

    **Next action (after close):** 3.R.g → 3.R.f → Phase 3.R archive + begin Phase 4.1.

---

### **Phase 4:** Operational-Context Audit + Task-List-Formatting Restructure + D7b

**Purpose:** Apply the "operational context only" lens across always-loaded docs and workflows; stage extractions for
the future docs-content-sweep WU; land the D7b extension-point match hook against the existing anchor-suffix
convention. Ordering is Tier 1 → Tier 2 → Tier 3 so the highest-leverage content is audited first.

**Heuristic reminder (apply throughout 4.2–4.5):** keep content that helps conceptual flow, is counterintuitive, or
would confuse if absent. Target ~80–90% extraction on rationale/background/overflow-example content with case-by-case
retention. Hedges with undefined state (`unless already loaded`, `if applicable`, `when relevant`) are eliminated.
Operational rationale clauses (`because ...`) are single-clause, ≤12 words, inline — anything longer extracts.

- [ ] **4.1 Staging infrastructure**

    **Goal:** `notes-docs-content-sweep.md` is ready to receive extractions; placeholder convention documented in-repo.
    - Create `.arc/backlog/technical/notes-docs-content-sweep.md` if not present
    - Schema per extraction (mirrors `plan-docs-content-sweep.md` § Content Contributions wording): source-file +
      section anchor, extracted content, suggested destination in docs/ IA, stylistic integration notes
    - Document the `[TODO-docs-site]` reference-style placeholder convention in-repo (one section in the staging file or
      the strategy doc)

- [ ] **4.2 Tier 1 audit — always-loaded docs**

    **Goal:** Operational-context audit applied to every file session-init loads unconditionally.
    - Files:
        - `.arc/system/agent/AGENT-BRIEFING.ARC.md`
        - `.arc/system/agent/AGENT-BRIEFING.PROJECT.md`
        - `.arc/system/agent/AGENT-BRIEFING.CONTRIBUTOR.md` (role-conditional load — Tier 1 on contributor sessions)
        - `.arc/system/agent/CLAUDE.ARC.md` (and any other agent-specific files present)
        - `.arc/reference/constitution/DEV-RULES.ARC.md`
        - `.arc/reference/constitution/DEV-RULES.PROJECT.md`
        - `.arc/reference/QUICK-REFERENCE.md`
        - `.arc/system/workflows/arc/session-lifecycle/session-init.md`
        - `.arc/reference/templates/template-status.md` (shapes every active status file; instantiated file is read at
          every session-init, so template-level bloat propagates)
        - `.arc/system/arc-config.yml` (comment-level audit only; structural changes out of scope)
    - For each: extract rationale/background/overflow examples to `notes-docs-content-sweep.md`; leave
      `[TODO-docs-site]` reference-style link placeholders at extraction sites
    - Two-copy sync per file

- [ ] **4.3 Tier 2 audit — high-frequency workflows**
    - Files:
        - `.arc/system/workflows/arc/3_process-task-loop.md`
        - `.arc/system/workflows/arc/supplemental/prepare-commits.md`
        - `.arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md`
        - `.arc/system/workflows/arc/session-lifecycle/session-handoff.md`
    - Same extraction + placeholder protocol as Tier 1

- [ ] **4.4 Tier 3 audit — remaining workflows**
    - Files:
        - `.arc/system/workflows/arc/1_create-prd.md`
        - `.arc/system/workflows/arc/2_generate-tasks.md`
        - All `work-unit-lifecycle/*.md` — `activate-work-unit.md`, `archive-work-unit.md`, `clean-work-unit.md`,
          `deactivate-work-unit.md`, `integrate-work-unit.md`, `rotate-branch.md`, `verify-work-unit.md`, plus
          `planning/activate-planning-branch.md` and `planning/integrate-planning-branch.md`
        - Remaining `supplemental/*.md` — `manage-incidental-work.md`, `maintain-project-docs.md`, `add-agent.md`,
          `verify-arc-integrity.md`, `integrate-external-content.md`
    - **Out of Tier 3 scope (excluded explicitly for visibility):** `initial-setup/*.md` (one-off install workflows,
      not loaded per-session), `session-lifecycle/session-loop.md` (`audience: human`, not agent-loaded)
    - Same protocol

- [ ] **4.5 Task-list-formatting restructure (P1.4 — three moves)**

    **Goal:** `strategy-task-list-formatting.md` trimmed to rules-only catalogue; templates extracted; Quick Format
    Checklist relocated to point of use.
    - [ ] **4.5.a Extract templates to `template-tasks.md` + apply resolved `**Strategies:**` convention change**
        - New file: `.arc/reference/templates/template-tasks.md`
        - Move: feature/technical header template, incidental header template, verification phase block, atomic
          companion file template, success criteria block
        - Two-copy sync (`packages/arc-framework/arc/reference/templates/template-tasks.md`)
        - **Resolved (pre-Phase-4): `**Strategies:**` convention is task-level-only.** Phase-header variant dropped
          — in practice across many work units it read as noise (STRATEGY-INDEX already provides session-init
          awareness, and agents consult strategies on demand by domain). Task-level annotation retained for cases
          where a specific task's domain relevance isn't obvious from its title. Apply this resolution here:
            - `template-tasks.md` phase-header template ships without a `**Strategies:**` field
            - Update `.arc/system/workflows/arc/2_generate-tasks.md` Step 3 (lines ~65–69): remove the "under the
              phase header" option from the `**Strategies:**` wording; keep the task-level option, framed as "use
              when the connection isn't obvious from the task title"
            - Sweep `.arc/backlog/technical/tasks-arcd-rebrand.md` to remove phase-header `**Strategies:**` lines.
              `tasks-session-init-optimization.md` was swept during the Phase 4 prep edit; archived task lists left
              alone (historical record)
            - Two-copy sync on `2_generate-tasks.md`

    - [ ] **4.5.b Relocate Quick Format Checklist into `2_generate-tasks.md` Step 4**
        - Move checklist from `strategy-task-list-formatting.md` § Quick Format Checklist into the appropriate point in
          Step 4 ("Write and Save Task List")
        - Cross-reference updates in callers

    - [ ] **4.5.c Trim `strategy-task-list-formatting.md` to rules-only**
        - Remove moved content
        - Apply operational-context audit on the trimmed result (rationale text → staging)
        - Target shape: rules-only catalogue aligned with `strategy-workflow-authoring.md` (~70 lines) — rough
          guide, not hard ceiling; current file is 709 lines
        - Update cross-references (from DEV-RULES.ARC, 2_generate-tasks.md, etc.) if links broke

- [ ] **4.6 D7b extension-point match pre-commit hook (test-first)**

    **Goal:** Hook validates every extension-point reference in a workflow file has a matching extension file in
    `system/extensions/`. No new tag syntax — the check greps the existing anchor-suffix convention that Phase 3
    already ships.

    **Convention recap (unchanged from Phase 3 landed state):** workflows mark extension points with a trailing
    `` · `#<name>` `` on a section heading (e.g., `` ### 3. Post-Context-Load Extensions · `#post-context-load` ``)
    or as an inline bold prefix (e.g., `` **Extensions** · `#post-task-quality`: ``). Both forms carry the extension's
    basename between backticks after `#`. Extension files in `system/extensions/` use `active: true|false` (not
    `has-steps:`) per Task 3.5; placeholder bodies use `[No extension configured]` per Task 3.13's CHECK 14.

    **Tag-convention decision (resolved pre-Phase-4):** earlier draft proposed wrapping extension regions with
    `<extension-point name="X">...</extension-point>` tags. Rejected: GitHub strips unknown HTML tags on render
    (delimiter invisible to readers), inline sites can't accommodate block tags without restructuring, and the D7b
    check's grep target works equally well against the existing anchor-suffix convention. The visible
    human-readable suffix stays; no new syntax introduced.

    **Implementation:**
    - Placement: CHECK 15 in `.arc/system/githooks/pre-commit` (CHECK 14 is Task 3.13's package-source neutrality
      guard)
    - Target: staged workflow files under `.arc/system/workflows/**` and
      `packages/arc-framework/arc/system/workflows/**` (dual-copy, matches CHECK 12/13's scope; distinct from
      CHECK 14 which is package-source-only by design)
    - Per staged workflow: grep `` ·\s*`#([a-z][a-z0-9-]*)` `` to extract extension-point names → for each, verify
      the corresponding `system/extensions/<name>.md` exists in the same copy (`.arc/` workflow → `.arc/` extension;
      package-source workflow → package-source extension). File existence is the pass criterion; `active:` value is
      not checked (placeholder state must remain valid, per the existing CHECK 14 neutrality contract)
    - Interaction with CHECK 14: CHECK 15 asserts *reference has a target*; CHECK 14 asserts *package-source target
      is placeholder-neutral*. No overlap — CHECK 14 does not inspect workflow references; CHECK 15 does not inspect
      extension body/frontmatter. Both can fire independently on the same commit without redundant diagnostics
    - Fast short-circuit: hook-level `grep -E '...' || true` against staged paths produces empty candidate list →
      `if [ -n "$candidates" ]` skips validator invocation entirely. Structurally identical to CHECK 12/13/14
    - Two-copy sync on `pre-commit`

    Build `test-first` (one behavior at a time):
    - Header-suffix reference (`` ### Foo · `#foo` ``) with matching extension file passes
    - Inline-prefix reference (`` **Extensions** · `#foo` ``) with matching extension file passes
    - Reference to nonexistent extension fails with diagnostic naming workflow path + extension name
    - Reference to extension with `active: false` + placeholder body (neutral package-source state) passes
      (existence-only check)
    - Reference to extension with `active: true` + populated body (adopter-customized `.arc/` state) passes
    - Multiple references in one file all checked (all must resolve)
    - Empty backtick reference (`` · `#` ``) or malformed reference produces no false positive (pattern requires
      `[a-z]` start)
    - Reference in a non-workflow `.md` file (strategy, README) is not checked — only staged workflow paths
    - Fast short-circuit when no workflow files staged (mirror CHECK 12/13/14 behavior)
    - `.arc/` workflow reference resolves against `.arc/` extension; package-source workflow resolves against
      package-source extension (same-copy lookup)

- [ ] **4.7 Phase 4 close — Tier 3 quality gates**
    - Full quality gate pass; verify extractions staged correctly (spot-check 3–5 entries); verify link placeholders
      are greppable by a fixed pattern
    - **Hook false-positive surface check for CHECK 15** (mirrors 3.12 discipline): synthetic negative-path staged
      set (non-workflow `.md` files, `.ts`, `.yml`) produces empty candidate list so CHECK 15 short-circuits without
      invoking validator; positive mirror set (workflow file with resolvable reference + workflow file with
      unresolvable reference) fires correctly in both directions

---

### **Phase 5:** Partial-Read Narrowing + Session-Init Workflow Restructure

**Purpose:** Shrink remaining upfront-read surface and restructure session-init Step 2/4/7 to reflect Phase 4
audit outcomes. Remote-sync awareness pulled forward to Phase 3.R.e (dogfooded during multi-machine work). Per-rule
reliability gate for DEV-RULES is the cautious path — default to up-front load; shift to conditional only where
trigger is clear.

- [ ] **5.0 Remote sync check at session-init — superseded by Phase 3.R.e**

    **Status:** Pulled forward into Phase 3.R for dogfooding during the multi-machine work that surfaced the
    git-notes staleness failure mode. Active spec lives at 3.R.e (session-init Step 1.5 + Step 6 rewrite, plus
    unbounded-ancestor-check and actionable depth-guidance additions introduced during scope review). Retained
    here as a cross-reference anchor only — to be checked `[x]` in lockstep with 3.R.e completion.

- [ ] **5.1 QUICK-REFERENCE partial-read at session-init**

    **Goal:** Session-init reads only `## Environment & Path Context` and `## Runtime   Environment`;
    `Command Patterns`, `Quality Gate Commands`, `ARC CLI Commands`, `npm Publishing`, and `Anti-Patterns` load
    on-demand via workflow references.
    - Update `session-init.md` Step 2 item 7 — specify section-level partial read
    - Verify callers (workflows that reference quality gate commands, CLI commands) load the relevant sections on demand

- [ ] **5.2 Task list partial-read narrowing**

    **Goal:** Session-init Item 10 reads Header + Overview + Scope + current phase preamble + current task section only.
    Skip completed phases' preambles.
    - Update `session-init.md` Item 10 with the narrower read specification
    - Graduated triple-anchor lookup (line hint → task number → title fragment) continues to resolve correctly under the
      narrower read (verify in test)

- [ ] **5.3 Status file partial-read narrowing**

    **Goal:** Session-init reads only the `## Active Work` block of the active status file — the 7 load-bearing fields
    (State, Branch, Task List, Next Task, Last Completed, Blockers, Next Action) plus any optional fields present
    (Interrupts, Paused At, Paused To, Superseded By). Non-load-bearing content (the "About this file" blockquote, any
    future documentation) is not read at init.
    - Update `session-init.md` Step 2 item 8 — replace "MUST RESOLVE, THEN READ IN FULL" with partial-read specification
      (from `## Active Work` heading through the last `**Field:**` line in that section)
    - Document the `## Active Work` section as a contract boundary: any content an agent needs at session-init must live
      inside this block
    - Related: Phase 4.2 audits `template-status.md` to eliminate authoring-guidance comment blocks that historically
      shipped from the template; this partial-read narrowing is the durable guard regardless of future template content
    - Two-copy sync

- [ ] **5.4 DEV-RULES section-level partial-read evaluation (per-rule)**

    **Goal:** Each candidate section independently evaluated against a strict reliability bar; dispositions recorded.
    - [ ] **5.4.a Evaluate candidate sections**
        - Candidates: DEV-RULES.ARC § Task Execution; DEV-RULES.ARC § Capture Routing; DEV-RULES.PROJECT § Quality
          Gates; DEV-RULES.PROJECT § Package-Project Sync
        - For each, assess: is there a clear, reliable trigger (session type, config value, workflow activity detectable
          at session-init)?
        - Disposition values: `conditional-load` (with named trigger) / `up-front-load` (with reason) /
          `retired-as-rationale` (if content moves to docs-site staging)

    - [ ] **5.4.b Record dispositions in notes file**
        - Append a "DEV-RULES partial-read dispositions" section to `notes-session-init-optimization.md`
        - One entry per evaluated section: candidate / disposition / named trigger or reason

    - [ ] **5.4.c Apply dispositions**
        - For `conditional-load` sections: update `session-init.md` Step 2 items 4/5 to include trigger-based load logic
        - For `up-front-load` sections: no structural change (safety floor)
        - For `retired-as-rationale` sections: move content to staging, leave placeholder

    **Note:** Default remains up-front load; shifting is opportunistic. "Up-front load remains correct" is always a
    valid disposition.

- [ ] **5.5 Agent file conditional load via `active` frontmatter**

    **Goal:** Session-init skips the body of `{AGENT}.ARC.md` when frontmatter declares `active: false`.
    Template-only agent files (installed but never populated) stop costing tokens every session.

    **Rationale:** `arc init` / `arc join` create `{AGENT}.ARC.md` when the adopter selects that agent, but the
    file ships as a template — adopter populates later, or never. Always-loading it costs tokens on every
    session for content that may be purely placeholder. An `active` flag gated by reliable frontmatter-only
    read recovers those tokens.

    - [ ] **5.5.a Codify the frontmatter-only read pattern (agent files)**
        - **Scope clarification (post-3.5):** the "conditional-load via frontmatter flag" pattern applies specifically
          to agent files — session-init unconditionally loads them, and the `active` flag gates whether the body is
          read. Methods (always load at trigger, no init read) and extensions (grep-based init enumeration producing
          active-extensions list; per Task 3.5) use different mechanisms and are not covered by this pattern
        - Add instruction to `session-init.md` for agent file loading: use `grep -m 1 "^active:" <file>` (or
          equivalent precise field read) to retrieve the `active` value without reading the body. Order-independent
          and schema-growth-safe vs a fixed line-limit read. If `active: false`, do not read further; if `active:
          true`, read the full file
        - Empirically validate before finalizing — one session with `active: false`, one with `active: true`. Confirm
          the body is actually skipped (measure via tool-call observation, not self-report)
        - Record the pattern in `strategy-session-operations.md` as the canonical "conditional-load via frontmatter
          flag at session init" mechanism, scoped explicitly to agent-file-style unconditional init-loads.
          Cross-reference the active-extensions list mechanism (Task 3.5.a) as the distinct extension-point pattern

    - [ ] **5.5.b Apply to `{AGENT}.ARC.md`**
        - Add `active: boolean` to frontmatter schema for agent files; ships as `active: false` when `arc init` /
          `arc join` creates the file — templates are unpopulated at install time, so `false` is the honest default.
          Adopter flips to `true` when they actually populate the file; self-evident from the frontmatter field, no
          CLI automation needed at init time
        - Update `session-init.md` Item 3 (agent-specific file) to use the precise grep-for-field read
          (`grep -m 1 "^active:" <file>`) — order-independent and schema-growth-safe vs a fixed line-limit read
        - Phase 3.3 schema-validation hook already covers agent files (scope added there); verify coverage holds
          after template update
        - Two-copy sync on `session-init.md`; agent file templates live in `packages/arc-framework/templates/`

    - [ ] **5.5.c Scan for other `active`-gate candidates**
        - Audit always-loaded docs for files that ship as templates or have highly conditional content —
          candidates for the same `active`-gated pattern
        - Record dispositions in notes file: candidate / eligible / reason not eligible
        - Apply inline to any eligible candidates, or spin out as follow-on tasks if substantial
        - If audit returns nothing, collapse to a single notes-file entry ("no additional candidates") —
          don't force the pattern where it doesn't fit

- [ ] **5.6 Session-init workflow Step 2/4/7 restructure**

    **Goal:** Batching structure, configuration check, and mismatch-handling prose all match Phase 4 audit outcomes and
    Phase 5.0–5.5 changes (remote sync step, partial-reads, agent file conditional load).
    - [ ] **5.6.a Step 2 batching**
        - Re-express Batch 1 / Batch 2 ordering given slimmed loadset
        - Update embedded examples (e.g., many-file disambiguation prompt) if they reference content that moved
        - Evaluate promoting SESSION-NOTES into Batch 1 (or a pre-batch slot after identity resolves).
          SESSION-NOTES carries persistent context and ad-hoc session guidance that can influence subsequent
          reads — loading it in Batch 2 may be structurally late. Identity-resolution prerequisite is already
          satisfied in Batch 1. Decision criteria: does any later load realistically change based on
          SESSION-NOTES content (persistent context, session-type prefix, one-off instructions)? If yes,
          promote; if no, current Batch 2 placement is fine.

    - [ ] **5.6.b Step 4 simplification (reduced scope after Task 3.5)**
        - Task 3.5.b already retired item 4.2 (method overrides). Remaining Step 4 scope: config values, platform
          awareness, custom commit patterns
        - Evaluate whether any further simplification is warranted post-Phase 4 audit (e.g., inline rationale that
          can move to staging). If none, collapse this task to a notes-file entry confirming Step 4 is at minimal
          scope

    - [ ] **5.6.c Step 7 tightening**
        - Mismatch-handling prose tightened; trust hierarchy preserved; no semantic change to auto-recover vs.
          stop-and-ask tiers

    **Note:** Audit session-init.md for speed considerations alongside the structural restructure. Baseline:
    ~2 minutes from `/arc-resume` invocation to orientation summary (pre-optimization). Phase 1–4 reductions
    shrink wall-clock time naturally (less content to read and process); 5.6 is the moment to also evaluate
    structural speed wins independent of load-set size — unexploited batching opportunities, redundant checks,
    steps whose cost is dominated by serial tool calls rather than content. Apply low-risk wins inline during
    5.6.a–c; record larger opportunities as follow-ons.

    - Two-copy sync

- [ ] **5.7 Phase 5 close — Tier 2 quality gates**
    - Markdown lint, framework-sync, targeted re-run of session-init against a representative active task list (if
      available) to spot-check regressions

---

### **Phase 6:** Session-Type Conditional Loading

**Purpose:** Planning, execution, and integration sessions have different needs. The `Working On:` type prefix +
auto-inference delivers a per-type load set without forcing user ceremony. Empirical validation during the phase's own
task work confirms the minimal set suffices.

**Note:** Empirical validation (P2.6) is a running observation during Phase 6, not a distinct task — each Phase 6
subtask operates a specific session type, and observed insufficiency surfaces as an adjustment to the load-set
definition plus a notes-file entry.

- [ ] **6.1 `Working On:` type prefix formalized in SESSION-NOTES template**

    **Goal:** Template documents prefix pattern explicitly; agents writing handoff know the convention.
    - File: `packages/arc-framework/templates/user/SESSION-NOTES.md` (plus `.arc/user/` instances — note: gitignored, so
      only the package template ships)
    - Document prefix pattern: `[planning: name]`, `[execution: name]`, `[integration: name]`
    - Include one-line rationale inline (session-type awareness drives conditional load)

- [ ] **6.2 session-handoff writes the prefix explicitly**
    - Update `.arc/system/workflows/arc/session-lifecycle/session-handoff.md` to instruct the agent to compute current
      session type and write the prefix
    - Type-resolution rules parallel Phase 6.3 inference (so handoff and init use the same logic, just in opposite
      directions)
    - Two-copy sync

- [ ] **6.3 Session-init inference logic (test-first)**

    **Goal:** When SESSION-NOTES is absent or prefix is missing, infer from active status file signals and branch state.
    - Placement: documented in `session-init.md` Step 2; if logic is non-trivial, extract to a CLI helper
      (`packages/arc-framework/src/lib/session-type/`) that agent can invoke

    Build `test-first` (one behavior at a time):
    - Explicit prefix in SESSION-NOTES → honored without inference
    - Active status file `**Task List:** [none]` + backlog/planning context → `planning`
    - Active status file with incomplete task list → `execution`
    - Active status file signals integration-ready → `integration`
    - Branch in integration phase (e.g., branch name matches integration convention) → `integration`
    - Between WUs with no active status file → `planning`
    - Genuinely ambiguous signals → prompt user (surface in session-init Step 6 orientation)

- [ ] **6.4 Per-type load set implementation**

    **Goal:** session-init Step 2 branches on resolved session type; loadset matches updated load model.
    - Update `session-init.md` Step 2 to key load decisions off the resolved session type
    - Loadset specification (updated post-3.5 — PRD P2.3 table refresh folded into Task 3.10):
        - All types: Items 1–7, active-extensions list (single grep per 3.5.b), SESSION-NOTES, active status file
          if present. Methods not loaded at init for any session type — they load at workflow trigger only
        - Execution + Integration only: Item 10 (task list partial read)
        - Core workflow: execution → `3_process-task-loop.md`; integration → `integrate-work-unit.md`; planning → none
          today, forward-compatible with `refine-plan-loop.md` if Expanded Planning Path WU lands
    - Two-copy sync

- [ ] **6.5 CLI template updates**

    **Goal:** `arc init` and `arc join` deliver updated SESSION-NOTES template to adopters and contributors.
    - `arc init` sources SESSION-NOTES from `packages/arc-framework/templates/user/SESSION-NOTES.md` (already done in
      6.1); verify initialization writes the template correctly
    - `arc join` uses same template; verify no structural divergence
    - Update any related CLI test fixtures if template content is asserted in tests

- [ ] **6.6 Session-type test coverage**
    - Unit: inference logic test cases from 6.3 (expand if new cases surface)
    - Integration: session-init with explicit prefix, with inferred prefix, with ambiguous signals (expected: user
      prompt)
    - E2E: fresh session-init across each type variant produces the correct load set (assert loaded files / skipped
      files per PRD P2.3)

- [ ] **6.7 Phase 6 close — Tier 3 quality gates + empirical observation note**
    - Full quality gate pass
    - Record empirical observation: did the minimal load set suffice for each session type operated during 6.1–6.6 work?
      Append to notes file. Any adjustments applied as revisions (R-scheme) to Phase 6 tasks

---

### **Phase 7:** Verification

- [ ] **7.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

    **Note:** The verification workflow conducts Tier 3 quality gates, success criteria validation, atomic task
    resolution, measurement (V.1 — tokens at orientation completion vs ~75–80k baseline; target ≥25% drop to ≤60k),
    audit quality spot-check (V.2 — 3–5 random extracted passages verified as operational vs non-operational), and
    late-session verification observation noted for the next task-executing WU (V.3 — organic, not synthetic).

---

## Success Criteria

- [ ] `arc-methods.md` and `arc-extensions.md` retired; replaced by per-file directories in `system/methods/` and
      `system/extensions/` (both copies)
- [ ] Session-init Step 2: methods not loaded at init (trigger-time only); extensions enumerated via single `grep`
      for `^active: true` producing the active-extensions list carried in session context; fire-point directives
      consult the list by name; method and extension bodies load on-demand at workflow trigger / fire point
- [ ] Reliable-trigger CI check (`npm run lint:arc`) active and passing on `main`; reads workflow frontmatter only
- [ ] All workflows under `system/workflows/**/*.md` carry schema-conformant YAML frontmatter (`audience`, `purpose`,
      `arc.methods`, `arc.extensions`); body-level "Method dependencies" prose preambles retired
- [ ] "Method and extension loading" subsection present in DEV-RULES.ARC § Verification and Discovery (both copies)
      with agent-side compliance rule (load frontmatter-declared methods/extensions before executing the workflow);
      paired author-side declaration rule lives in `strategy-workflow-authoring.md § Author-side Declaration Rule`
      (T3 on-demand, not every-session)
- [ ] ADR-013 Tier 2 amendment reflects the implemented per-file model and constitutional rule
- [ ] Observed tokens-at-orientation-completion drops ≥25% from baseline (~75–80k → ≤60k) in a clean maintainer session
      with active task list
- [ ] Orientation summary correctness verified (active work state, blockers, non-default config, freshness, next action
      remain accurate across sampled session types)
- [ ] Operational-context audit Tier 1–3 complete; extractions staged in `notes-docs-content-sweep.md`;
      `[TODO-docs-site]` placeholders greppable across touched files
- [ ] `template-tasks.md` extracted to `.arc/reference/templates/`; `2_generate-tasks.md` hosts Quick Format Checklist;
      `strategy-task-list-formatting.md` trimmed to rules-only
- [ ] Frontmatter schema + D7a link-resolution + D7b extension-point match pre-commit hooks active and tested
- [ ] Session-type conditional loading active; `Working On:` type prefix formalized; auto- inference handles the common
      cases without user prompts
- [ ] `arc init` and `arc join` deliver updated SESSION-NOTES template with type prefix convention
- [ ] Release-notes entry drafted documenting breaking changes (methods/extensions layout, constitutional rule,
      SESSION-NOTES prefix)
- [ ] Framework-sync integration test passing; two-copy sync clean across methods, extensions, and touched
      workflow/rules files
- [ ] All quality gates pass (markdown lint, TypeScript lint, shellcheck, typecheck, tests, build — zero violations)
- [ ] Ready for archival

---

[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
