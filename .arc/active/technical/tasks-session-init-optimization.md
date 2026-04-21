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

**Strategies:** `strategy-session-operations.md`, `strategy-configurability-architecture.md`,
`strategy-package-project-sync.md`

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

**Strategies:** `strategy-session-operations.md`, `strategy-adr-methodology.md`

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

**Strategies:** `strategy-package-project-sync.md`, `strategy-session-operations.md`,
`strategy-configurability-architecture.md`, `strategy-quality-gates.md`, `strategy-testing-methodology.md`

**Purpose:** Landing phase for the per-file structure established in Phase 1. Build the frontmatter parser utility;
write schema + link-resolution validation hooks; adapt session-init Step 2 to read aggregated frontmatter only; sweep
cross-references from legacy aggregate anchors to per-file paths; update the framework-sync test to enumerate per-file
directories; retire legacy aggregate files; add CLI test coverage; close with ADR-013 sanity check.

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

- [ ] **3.5 Session-init Step 2 — aggregated frontmatter scan**

    **Goal:** Session-init reads only frontmatter across all method/extension files (~1k tokens for ~16 files), not full
    bodies.
    - Update `system/workflows/arc/session-lifecycle/session-init.md` Step 2 — replace current "Scan `arc-methods.md`
      for active overrides" with "Aggregate frontmatter from `system/methods/*.md` and `system/extensions/*.md`"
    - **Step 4 semantic replacement (not just a reference update):** Current Step 4.2 reads "Scan
      `.arc/system/workflows/arc-methods.md`. For each method, check if the `.override` section is populated."
      Replace with: "Read the `override-active` field from each `system/methods/*.md` frontmatter (parsed during
      Step 2 aggregation); surface active overrides in the orientation." Same for extensions: read `active` field
      from `system/extensions/*.md` frontmatter. This is a mechanism change, not wording polish.
    - Two-copy sync

- [ ] **3.6 Cross-reference sweep**

    **Goal:** All anchor-form references to `arc-methods.md#anchor` / `arc-extensions.md#anchor` updated to new
    per-file paths using D7a link convention.
    - **Actual match count (audit-verified):** 80 anchor-form matches across both copies, 28 in `.arc/` active
      surface alone. PRD's original "53+" estimate was low.
    - **Scope:** `.arc/` + `packages/arc-framework/arc/` — workflows, constitution, strategies, AGENT-BRIEFING
      files, CLAUDE.ARC.md. Exclude `reference/adr/` (history), `reference/archive/` (per "document what is" —
      historical docs describe the name that was current at the time), `active/technical/` session-init-opt WU
      docs (refresh naturally via Phase 3 edits), and `backlog/` (per Task 1.4.a precedent — backlog
      reconciliation happens at each backlog WU's activation via persistent context).
    - Grep-and-replace pass (automatable but each match manually verified — ensures anchor points map to the
      right per-file destination)
    - Run the Phase 3.4 link-resolution hook against the full repo to catch residual broken links

- [ ] **3.7 Framework-sync: register per-file entries in the manifest**

    **Goal:** Drift between package source and `.arc/` on methods/extensions is caught by CI — via the existing
    manifest-driven framework-sync test, not custom enumeration.

    **Context:** The framework-sync test (`packages/arc-framework/__tests__/integration/framework-sync.test.ts`)
    iterates `manifest.files` for entries with `classification: "Framework"`. Audit confirmed the 18 new per-file
    paths (8 methods + 8 extensions + 2 READMEs) are missing from `.arc/system/.internal/manifest.json` —
    1.4.c–e added the files but never registered them. This is the 1.4 oversight to fix.

    - Add 18 entries to `.arc/system/.internal/manifest.json` under `files`, each with `classification:
      "Framework"` and whatever hash/metadata fields existing Framework entries carry
    - Verify `loadPackageSource` (test:42) resolves each new path — the test already handles non-template files
      via the `readFile(plain, ...)` fallback, but confirm against the new directories
    - Existing test then provides drift coverage automatically — no enumeration changes needed
    - Two-copy discipline does not apply to `.arc/system/.internal/manifest.json` — that file is project-local
      install state, not framework content

- [ ] **3.8 Retire legacy aggregate files**
    - Delete `.arc/system/workflows/arc-methods.md`
    - Delete `.arc/system/workflows/arc-extensions.md`
    - Delete `packages/arc-framework/arc/system/workflows/arc-methods.md`
    - Delete `packages/arc-framework/arc/system/workflows/arc-extensions.md`
    - **Remove legacy manifest entries:** Delete `system/workflows/arc-methods.md` and
      `system/workflows/arc-extensions.md` entries from `.arc/system/.internal/manifest.json` (currently at
      lines 270, 275 as of audit — verify). Without this, the framework-sync test fails because the manifest
      references files that no longer exist.
    - Verify no remaining references (run grep for filename matches across both trees)

- [ ] **3.9 CLI test coverage — per-file restructure**

    **Goal:** Fresh install, update, reconfigure, and hook behavior all verified against new structure.
    - Integration: fresh `arc init` produces `system/methods/` and `system/extensions/` with all 8 files each
      **plus 2 READMEs, and all 18 files are registered in the resulting `manifest.json` with
      `classification: "Framework"`** (closes the 1.4.c–e oversight surfaced in Task 3.7)
    - Integration: `arc update` on a repo with legacy `arc-methods.md` / `arc-extensions.md` layout is an **explicit
      no-op on the legacy files** — does not delete, rewrite, or migrate them. PRD § Won't Do excludes migration
      code; zero-adopter state means no adopter reaches this code path. Test asserts the no-op, not a migration
      path that doesn't exist.
    - Integration: `arc update` idempotent re-update on a post-restructure `.arc/` produces no diff
    - E2E: `arc init --yes` layout matches expected structure (includes per-file directories and manifest entries)
    - E2E: `arc init --reconfigure` unaffected by per-file restructure
    - Hook behavior tests: Phase 3.3 and 3.4 hooks verified against sample repos

- [ ] **3.10 ADR-013 sanity check, PRD refresh, and finalize**

    **Goal:** Amendment drafted in Phase 2.3 matches the concrete implemented model; tweak wording if needed; mark
    the amendment as accepted. Co-located PRD refresh since the schema reconciliation visits the same ground.

    **Amendment checklist (each must match implemented state):**
    - (a) Per-file structure matches amendment description — `system/methods/` and `system/extensions/` with 8
      files each plus README
    - (b) Schema field names match implemented form post-3.1.a: `name`, `description`, `related`,
      `override-active` (methods) / `active` (extensions). No `workflow` field; no `has-override`; no `has-steps`
    - (c) Session-init Step 2 behavior matches post-3.5 state (aggregated frontmatter scan, not full-body reads)
    - (d) `pre-merge-review` method → `diff-review` rename complete (per Task 1.4.a)
    - (e) CI-enforced reliable-trigger invariant is wired (per Task 1.6)

    **PRD refresh (bundled):**
    - P0.5: update field list to drop `workflow`, rename `has-override` → `override-active`
    - P0.6: rename `has-steps` → `active`
    - Other P0.x bullets audited for stale schema-field references

    **Close:**
    - Apply any minor wording adjustments to the amendment
    - Remove draft marker; two-copy sync on ADR and strategy files (PRD single-copy per work-unit convention)

- [ ] **3.11 Phase 3 close — Tier 3 quality gates**
    - Full markdown lint, code lint (TS + sh), typecheck, test suite, build, framework-sync
    - **Hook false-positive surface check:** Confirm CHECK 12 (3.3 schema validation) and CHECK 13 (3.4
      link-resolution) don't fire on unrelated staged files — stage a handful of non-method/non-extension /
      non-markdown files (e.g., `tsconfig.json`, `.gitignore`, a random `src/*.ts` file) and verify hooks
      short-circuit cleanly. The hooks must gate on path pattern before running validation.
    - Verify zero regressions before Phase 4

---

### **Phase 4:** Operational-Context Audit + Task-List-Formatting Restructure + D7b

**Strategies:** `strategy-session-operations.md` (content-tiering lens), `strategy-task-list-formatting.md` (for P1.4
restructure target), `strategy-package-project-sync.md`

**Purpose:** Apply the "operational context only" lens across always-loaded docs and workflows; stage extractions for
the future docs-content-sweep WU; formalize D7b shape-boundary wrappers opportunistically. Ordering is Tier 1 → Tier 2 →
Tier 3 so the highest-leverage content is audited first.

**Heuristic reminder (apply throughout 4.2–4.5):** keep content that helps conceptual flow, is counterintuitive, or
would confuse if absent. Target ~80–90% extraction on rationale/background/overflow-example content with case-by-case
retention. Hedges with undefined state (`unless already loaded`, `if applicable`, `when relevant`) are eliminated.
Operational rationale clauses (`because ...`) are single-clause, ≤12 words, inline — anything longer extracts.

- [ ] **4.1 Staging infrastructure**

    **Goal:** `notes-docs-content-sweep.md` is ready to receive extractions; cross-references from
    `plan-docs-content-sweep.md` are current.
    - Create `.arc/backlog/technical/notes-docs-content-sweep.md` if not present
    - Schema per extraction: source file anchor, content block (verbatim), suggested destination in docs IA
      (Starlight-bound), stylistic notes
    - Verify `plan-docs-content-sweep.md` references this staging file; update if needed
    - Document the `[TODO-docs-site]` reference-style placeholder convention in-repo (one section in the staging file or
      the strategy doc)

- [ ] **4.2 Tier 1 audit — always-loaded docs**

    **Goal:** Operational-context audit applied to every file session-init loads unconditionally.
    - Files:
        - `.arc/system/agent/AGENT-BRIEFING.ARC.md`
        - `.arc/system/agent/AGENT-BRIEFING.PROJECT.md`
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
        - All `work-unit-lifecycle/*.md` (activate, integrate, archive, verify, planning/\*)
        - Remaining `supplemental/*.md` (manage-incidental-work, maintain-project-docs, add-agent, verify-arc-integrity,
          integrate-external-content)
    - Same protocol

- [ ] **4.5 Task-list-formatting restructure (P1.4 — three moves)**

    **Goal:** `strategy-task-list-formatting.md` trimmed to rules-only catalogue; templates extracted; Quick Format
    Checklist relocated to point of use.
    - [ ] **4.5.a Extract templates to `template-tasks.md`**
        - New file: `.arc/reference/templates/template-tasks.md`
        - Move: feature/technical header template, incidental header template, verification phase block, atomic
          companion file template, success criteria block
        - Two-copy sync (`packages/arc-framework/arc/reference/templates/template-tasks.md`)
        - **Evaluate per-phase `**Strategies:**` convention** — phase headers in recent task lists carry a
          `**Strategies:** ...` line listing potentially relevant strategy docs. Original intent was per-phase
          awareness, but in practice across many work units it reads as noise — STRATEGY-INDEX already provides
          session-init awareness, and executing agents consult strategies on demand by domain, not by phase header.
          Decide keep / trim / replace before finalizing the phase-header template shape here; if removed, consider
          a sweep of existing active and backlog task lists as part of this task or a follow-up.

    - [ ] **4.5.b Relocate Quick Format Checklist into `2_generate-tasks.md` Step 4**
        - Move checklist from `strategy-task-list-formatting.md` § Quick Format Checklist into the appropriate point in
          Step 4 ("Write and Save Task List")
        - Cross-reference updates in callers

    - [ ] **4.5.c Trim `strategy-task-list-formatting.md` to rules-only**
        - Remove moved content
        - Apply operational-context audit on the trimmed result (rationale text → staging)
        - Update cross-references (from DEV-RULES.ARC, 2_generate-tasks.md, etc.) if links broke

- [ ] **4.6 D7b extension-point wrappers — opportunistic application**

    **Goal:** Formalize existing anchor-ID convention in workflows using
    `<extension-point name="...">...</extension-point>` tags. No sweeping retrofit — applied only where files are
    touched in 4.2–4.5.
    - Produce a running list of files touched in 4.2–4.5 that contain extension-point anchors
    - For each: wrap the existing anchor region with the D7b tag
    - Also opportunistically wrap `<template>...</template>` and `<output-format>...</output-format>` where relevant

- [ ] **4.7 D7b extension-point match pre-commit hook (test-first)**

    **Goal:** Hook validates every `<extension-point name="X">` tag in workflows has a matching populated definition in
    `system/extensions/`.
    - Placement: CHECK 14 in `.arc/system/githooks/pre-commit`
    - Per-staged-workflow-file; grep for `<extension-point name="X">` → verify `system/extensions/X.md` exists and has
      populated `has-steps: true` OR matches the existing placeholder convention
    - Two-copy sync

    Build `test-first` (one behavior at a time):
    - Tag with matching populated extension passes
    - Tag referencing nonexistent extension fails with diagnostic
    - Tag referencing extension with `has-steps: false` is allowed (placeholder state)
    - Multiple tags in one file all checked

- [ ] **4.8 Phase 4 close — Tier 3 quality gates**
    - Full quality gate pass; verify extractions staged correctly (spot-check 3–5 entries); verify link placeholders are
      greppable by a fixed pattern

---

### **Phase 5:** Partial-Read Narrowing + Session-Init Workflow Restructure

**Strategies:** `strategy-session-operations.md`

**Purpose:** Shrink remaining upfront-read surface, add remote-sync awareness at session start, and restructure
session-init Step 2/4/7 to reflect Phase 4 audit outcomes and Phase 5 changes. Per-rule reliability gate for
DEV-RULES is the cautious path — default to up-front load; shift to conditional only where trigger is clear.

- [ ] **5.0 Remote sync check at session-init**

    **Goal:** Session-init fetches origin (code + git notes) and surfaces divergence in the orientation; pulling is
    always user-confirmed via a prompt separate from the standard "proceed" prompt — no auto-pull.

    **Rationale:** No current ARC mechanism detects remote changes at session start. Developers moving between
    machines, or pulling teammates' work, must remember `git fetch && git pull` and `arc user pull` manually.
    Surfacing divergence early prevents stale-branch work and stale SESSION-NOTES; separating the pull prompt
    from the proceed prompt avoids "yes" ambiguity when both are presented.

    - Add `session.remote_sync: enabled | disabled` (default `enabled`) to `arc-config.yml`; comment clarifies
      fetching is automatic, pulling is always user-confirmed — never auto-pull
    - Add Step 1.5 "Sync Remote State" to `session-init.md`:
        - Skip when `session.remote_sync: disabled`
        - `git fetch origin` + `git fetch origin 'refs/notes/arc/user/*'`, bounded timeout ~10s, parallel with
          Batch 1 where platform allows
        - Graceful degradation on failure (offline, no remote, auth error) — single-line note, continue
        - Results feed Step 5 freshness check and Step 6 orientation
    - Update Step 6 — when divergence exists, prepend a labeled block to the orientation (above active work
      state) listing `{branch}: N commits behind origin/{branch}` and `git notes ({identity}): N notes ahead
      on origin`; suppress entirely when clean
    - Update Step 6 prompt sequence — on divergence:
        1. `Pull from origin? (y/n)` — combined when both code + notes divergent; individual otherwise
        2. On "y": run `git pull --ff-only` (code), `arc user pull` (notes); report results
        3. Standard `Proceed to Next Action?` prompt follows
      Common case (no divergence): only the standard proceed prompt, unchanged
    - Two-copy sync on `session-init.md` and `arc-config.yml`

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

    - [ ] **5.5.a Codify the frontmatter-only read pattern**
        - Add instruction to `session-init.md` for agent file loading: "Read only the first N lines (frontmatter
          block); if `active: false`, do not read further." N sized to cover frontmatter plus small buffer
          (e.g., 10).
        - Empirically validate before finalizing — one session with `active: false`, one with `active: true`.
          Confirm the body is actually skipped (measure via tool-call observation, not self-report).
        - Record the pattern in `strategy-session-operations.md` as the canonical "conditional-load via
          frontmatter flag" mechanism, available for reuse.

    - [ ] **5.5.b Apply to `{AGENT}.ARC.md`**
        - Add `active: boolean` to frontmatter schema for agent files; ships as `active: false` when `arc init`
          / `arc join` creates the file — templates are unpopulated at install time, so `false` is the honest
          default. Adopter flips to `true` when they actually populate the file; self-evident from the
          frontmatter field, no CLI automation needed at init time.
        - Update `session-init.md` Item 3 (agent-specific file) to use the conditional-load pattern
        - Phase 3.3 schema-validation hook already covers agent files (scope added there); verify coverage
          holds after template update
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

    - [ ] **5.6.b Step 4 simplification**
        - Configuration check simplifies post-audit (fewer defaults to scan, overrides surface the same way but against
          the slimmer content set)

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

**Strategies:** `strategy-testing-methodology.md`, `strategy-session-operations.md`

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

    **Goal:** session-init Step 2 branches on resolved session type; loadset matches PRD table.
    - Update `session-init.md` Step 2 to key load decisions off the resolved session type
    - Loadset specification (per PRD P2.3):
        - All types: Items 1–7, methods/extensions frontmatter index, SESSION-NOTES, active status file if present
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
- [ ] Session-init Step 2 loads aggregated frontmatter index only; full method and extension bodies load on-demand at
      workflow references
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
