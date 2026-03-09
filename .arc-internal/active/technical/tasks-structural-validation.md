# Task List: Structural Validation

**PRD:** `.arc-internal/active/technical/prd-structural-validation.md`
**Created:** 2026-03-06
**Branch(es):** `technical/structural-validation`
**Base Branch:** `main`
**Status:** In Progress

## Overview

**Purpose:** Validate and stabilize the `.arc/` file tree before WU3 locks it into CLI tooling.

## Scope

### Will Do

- Workflow navigability baseline and validation (bookend: before and after structural changes)
- Validate file inventory (classification + layer) against actual file tree
- Evaluate and resolve workflow and strategy directory organization
- Audit Configurable files for clean merge boundaries
- Establish forward-compatible optional content pattern
- De-duplication check across high-traffic document areas
- Cross-cutting dependency map for WU3-relevant concepts

### Won't Do

- CLI implementation (WU3 scope)
- Methodology content changes (incidental only if discovered)
- New strategy documents (may recommend future splits)
- Template system design (WU3 scope)

---

## Tasks

### **Phase 0:** Workflow Navigability Baseline

- [x] **0.1 Define lifecycle scenarios**

    Established 5 scenarios covering all 3 protection modes and both lifecycle patterns (batch
    transition, standalone). Documented in `notes-structural-validation.md` § Scenario Definitions.

    - [x] **0.1.a Identify common lifecycle paths**

        Verified seeded paths against actual workflow documents. Key correction: Scenario 2
        (standalone archival) uses a housekeeping branch, not activate-planning-branch — per
        archive-work-unit guidance. One open question flagged: activate-work-unit Step 2
        unconditionally creates a branch even in unprotected mode.

    - [x] **0.1.b Document scenario definitions for reuse in Phase 8**

        Full definitions in `notes-structural-validation.md` with per-scenario: protection mode,
        context, workflow path, key characteristics, config values. Coverage notes document what's
        included and what edge cases were intentionally excluded.

- [x] **0.2 Walk each scenario through the workflow chain**

    Walked all 5 active scenarios via parallel subagent walkthroughs (fresh-eyes approach).
    7 findings documented in `notes-structural-validation.md` § Navigability Findings.

    - [x] **0.2.a Walk each scenario step-by-step**

        Each scenario walked by an independent Explore agent reading workflows as-written.
        Metrics captured per scenario (docs loaded, conditionals parsed, cross-ref hops).
        Scenario 5 (out-of-box) had highest cross-reference cost (18 hops); Scenario 2
        (standalone archival) had most ambiguous routing despite fewest docs.

    - [x] **0.2.b Flag issues**

        7 findings (F-01 through F-07): 1 high severity (dead-end after task loop — affects
        all scenarios), 6 medium severity (routing ambiguity, missing conditionals, scattered
        guidance). No conditional overload findings — conditionals are present but incomplete
        rather than excessive.

    - [x] **0.2.c Capture findings as input to later phases**

        All findings tagged: Phase 2 (F-03, F-05 — routing spanning files, missing procedural
        steps), Phase 6.1 (F-01, F-04 — missing forward links, scattered branch context),
        Phase 6.2 (F-02, F-06, F-07 — cross-cutting mode conditionals at convergence points).

- [x] **0.3 Fix structure-independent navigability issues**

    Fixed F-01 and F-07. Remaining findings (F-02–F-06) deferred to Phases 2, 6.1, and 6.2
    with explicit resolution tasks.

    - [x] **0.3.a Add forward link from `3_process-task-loop` to `integrate-work-unit` (F-01)**

        Added "Next Step" section after Verification Phase, linking to integrate-work-unit
        with brief description. Resolves the only high-severity finding.

    - [x] **0.3.b Add `pm.mode: none` discovery guidance to `session-init` (F-07)**

        Restructured Step 5 "Next work unit discovery" from arc-in-git-only to mode-aware:
        added `pm.mode: none/external` section with artifact check and forward link to
        1_create-prd. Added `create-prd` and `arc-config` link references.

    - [x] **0.3.c Run Tier 1 quality gate on modified files**

        Both `3_process-task-loop.md` and `session-init.md` pass with 0 errors.

### **Phase 1:** Inventory Validation

**Strategies:** `strategy-file-classification.md`, `strategy-configurability-architecture.md`

- [x] **1.1 Walk `.arc/` file tree and compare against inventory**

    80 files on disk vs 70 in inventory. 10 files missing from inventory (4 strategies,
    6 workflows added during WU2). No files in inventory absent from disk. Existing
    classifications and layer assignments verified correct. Summary counts stale.

    - [x] **1.1.a List all files in `.arc/` and compare against inventory table**

        **10 files on disk missing from inventory** (all Core layer):

        Strategies (4, all Framework):
        `strategy-configurability-architecture`, `strategy-core-philosophy`,
        `strategy-team-coordination`, `strategy-work-planning`

        Workflow-level (2, both Configurable):
        `arc-methods.md`, `arc-extensions.md`

        Supplemental workflows (4, all Framework):
        `activate-planning-branch`, `integrate-planning-branch`,
        `rotate-branch`, `verify-completion`

        **Scaffolding gap:** `reference/archive/technical/.gitkeep` missing from both disk
        and inventory — archive-work-unit creates `technical/` dirs but only `feature/` and
        `incidental/` are scaffolded.

        **Files in inventory but not on disk:** None.

    - [x] **1.1.b Verify classification accuracy for each file**

        All existing classifications verified correct. Key checks: `arc-methods.md` and
        `arc-extensions.md` are Configurable (override/extension sections adopters populate).
        All 8 other missing files are Framework (pure ARC methodology). No reclassifications
        needed for existing entries.

    - [x] **1.1.c Verify layer assignments (Core vs arc-in-git)**

        Existing layer assignments verified correct. arc-in-git files: ATOMIC-TASKS templates
        (active + team), ROADMAP, BACKLOG-\* templates, PROJECT-STATUS, strategy-backlog-org.
        All other files correctly Core. All 10 missing files are Core layer.

    - [x] **1.1.d Verify summary counts**

        Summary table is stale. Current inventory says 41 Framework / 12 Configurable /
        11 Scaffolded / 64 total. Actual on-disk count is 80 files. Discrepancy comes from
        10 missing entries plus existing count errors (wildcard rows like
        `{feature,technical,incidental}/.gitkeep` counted inconsistently as 1 vs 3 files).
        Will be corrected in Task 1.2.

- [x] **1.2 Update inventory with corrections**

    Added 11 missing file entries (Task 1.1 found 10; `reference/constitution/README.md`
    was an 11th miss discovered during implementation). No files removed — `DEV-RULES.{DOMAIN}.md`
    is a naming convention row, kept but excluded from totals with a note. No misclassifications
    found. Alphabetized supplemental workflows. Summary updated: Framework 53, Configurable 15,
    Scaffolded 12, Total 80. Added counting methodology note (wildcard expansion,
    pattern exclusion). Tier 1 passed (52 MD060 fixes via markdown-table-prettify, 1 MD047 fix).

    Scaffolding gap noted: `reference/archive/technical/.gitkeep` missing from disk — not an
    inventory issue but a scaffolding fix needed elsewhere.

### **Phase 2:** Workflow Directory Evaluation

**Strategies:** `strategy-work-organization.md`, `strategy-file-classification.md`

- [x] **2.1 Assess current `workflows/arc/supplemental/` structure**

    Promoted 8 lifecycle workflows out of `supplemental/` into a peer `work-unit-lifecycle/` directory. Renamed
    3 files for verb-noun consistency. `supplemental/` retains 5 truly supplemental files. Phase 0 findings
    (F-03, F-05) confirmed as content issues, not structural — will need explicit fixes in 2.2.d regardless.

    - [x] **2.1.a Catalog current supplemental files by functional group**

        13 files cataloged into 3 functional groups via cross-reference analysis (parallel subagent mapped ~60
        inbound/outbound references across all workflow files):

        **Work unit lifecycle (8):** activate-work-unit, activate-planning-branch, integrate-work-unit,
        integrate-planning-branch, archive-work-unit, clean-work-unit-files, rotate-branch, verify-completion.
        High internal cross-referencing — these form a state machine for work unit transitions.

        **Session boundary (2):** session-init, session-handoff. Triggered by skills at session boundaries.
        Primarily reference configuration docs.

        **Cross-cutting guides (3):** commit-guide, manage-incidental-work, maintain-project-docs. Procedural
        guidance invoked at various points during work.

        **`arc-methods.md` and `arc-extensions.md` placement confirmed correct.** They're Configurable (adopters
        customize); everything in `arc/` is Framework. Different update behavior (three-way merge with expected
        conflicts). Current placement at `workflows/` root correctly reflects their nature as configuration docs
        referenced by workflows, not workflows themselves.

    - [x] **2.1.b Evaluate reorganization options**

        Evaluated 6 options against: agent navigability, human browsing, cross-reference cost, WU3 CLI impact,
        and Phase 0 finding resolution.

        **Key finding:** Agents navigate entirely by cross-reference links — directory structure has zero impact
        on agent navigation. All reorganization value is for human conceptual clarity.

        **Phase 0 findings (F-03, F-05):** Confirmed as content issues (missing decision points, missing
        procedural steps), not structural. No reorganization option resolves them — explicit content fixes
        needed in 2.2.d regardless.

        Options evaluated:
        - **A (full subdirs: lifecycle/, session/, guides/):** lifecycle/ still 8 files; session/ and guides/
          too thin (2, 3 files); "guides" is a weak grouping; ~60-70 cross-ref changes
        - **B (rename supplemental/):** Current name is accurate; alternatives not better
        - **C (status quo):** Defensible but doesn't address the conceptual mixing problem
        - **D (status quo + README):** Zero cross-ref cost, good GitHub orientation, but doesn't reduce visual
          density or fix the categorization issue
        - **E (lifecycle/ subdir only):** "Just enough" but subdividing within supplemental treats the
          symptom — lifecycle files were miscategorized, not under-organized
        - **F (collapse supplemental/ into arc/):** 16+ files in one dir, loses the supplemental signal —
          worse than status quo

        **Breakthrough framing:** The lifecycle files were never truly "supplemental" — they're state machine
        infrastructure the numbered pipeline depends on. The right move is to promote them to a peer directory,
        not subdivide within supplemental.

    - [x] **2.1.c Document decision with rationale**

        **Decision: Promote lifecycle workflows to `work-unit-lifecycle/` peer directory, rename 3 files for
        verb-noun consistency.**

        Target structure under `workflows/arc/`:

        ```text
        arc/
        ├── 1_create-prd.md
        ├── 2_generate-tasks.md
        ├── 3_process-task-loop.md
        ├── setup/                      (2 files — one-time initialization)
        ├── supplemental/               (5 files — procedural guides, session bookends)
        │   ├── commit-guide.md → prepare-commits.md
        │   ├── maintain-project-docs.md
        │   ├── manage-incidental-work.md
        │   ├── session-handoff.md
        │   └── session-init.md
        └── work-unit-lifecycle/        (8 files — work unit state transitions)
            ├── activate-planning-branch.md
            ├── activate-work-unit.md
            ├── archive-work-unit.md
            ├── clean-work-unit-files.md → clean-work-unit.md
            ├── integrate-planning-branch.md
            ├── integrate-work-unit.md
            ├── rotate-branch.md
            └── verify-completion.md → verify-work-unit.md
        ```

        **Rationale:**

        - **Promotion over subdivision:** Lifecycle files were miscategorized as supplemental. Promoting to a
          peer directory makes the conceptual distinction visible in the file tree without fragmenting small
          groups.
        - **`work-unit-lifecycle/`:** Uses the full ARC term "work unit" for precision. Sorts after
          `supplemental/` alphabetically, giving a natural explorer order: setup → supplemental →
          work-unit-lifecycle.
        - **3 file renames:** `commit-guide` → `prepare-commits` (verb-noun, not a "guide"),
          `clean-work-unit-files` → `clean-work-unit` (matches verb-work-unit pattern),
          `verify-completion` → `verify-work-unit` (same pattern consistency).
        - **`supplemental/` retained:** Now genuinely supplemental — session bookends and procedural guides
          invoked at various points. Clear membership test: "is this a work unit state transition?" →
          lifecycle; otherwise → supplemental.
        - **Numbered pipeline stays at `arc/` root:** The numbering IS the core loop signal. Wrapping in a
          directory would be redundant with the convention.
        - **`arc-methods.md` and `arc-extensions.md` stay at `workflows/` root:** Confirmed correct —
          Configurable classification, not workflows themselves.

        **Explored and rejected:** core-loop/ wrapper for numbered files (redundant with numbering), verb-based
        directory naming (phases encoded in pipeline numbering, workflows cross-cut phases), mirrored
        supplemental/ subdirs (overloads the concept).

        **Cross-reference impact:** ~40-50 external link updates for the 8 moved lifecycle files. Internal
        lifecycle cross-references (peer links) stay correct since all files move together. The 5 supplemental
        files don't move — their ~22 inbound references are unaffected. 3 renamed files need link updates in
        all referencing documents.

- [x] **2.2 Implement workflow directory changes**

    Per 2.1.c decision: created `work-unit-lifecycle/`, moved 8 files, renamed 3 files, updated all
    cross-references across 22 files. Resolved F-03 and F-05 content issues. Full lint pass clean.

    - [x] **2.2.a Create `work-unit-lifecycle/` and move lifecycle files with `git mv`**

        Created directory, moved 8 files. Renamed during move: `clean-work-unit-files` →
        `clean-work-unit`, `verify-completion` → `verify-work-unit`.

    - [x] **2.2.b Rename `commit-guide.md` → `prepare-commits.md` in `supplemental/`**

    - [x] **2.2.c Update all cross-references to moved/renamed files**

        Updated references across 22 files: lifecycle files (peer refs now same-directory, cross-directory
        refs to supplemental updated to `../supplemental/`), supplemental files (refs to lifecycle files
        updated to `../work-unit-lifecycle/`), numbered pipeline files, strategy docs, agent files
        (CLAUDE.md, 3 skill directories), DEV-RULES.ARC.md, arc-methods.md, arc-extensions.md, setup
        workflows, templates, READMEs. Subagent handled bulk updates; manual fixup caught 6 cross-directory
        refs the subagent missed (session-init/session-handoff refs from lifecycle files, lifecycle refs
        from supplemental files).

    - [x] **2.2.d Resolve Phase 0 findings F-03, F-05**

        F-03: integrate-work-unit Step 8 full-protection note now surfaces the batch vs standalone decision
        point — "next work unit planned → activate-planning-branch" vs "no next work unit →
        housekeeping branch for standalone archival".

        F-05: archive-work-unit now has Step 0 (Set Up Branch) with explicit `git checkout -b
        chore/archive-{name}` for standalone archival under full protection. Skip conditions documented
        for batch path and non-full protection.

    - [x] **2.2.e Update file inventory in `strategy-file-classification.md`**

        Updated paths for all 13 files (8 moved to `work-unit-lifecycle/`, 3 renamed, 5 remain in
        `supplemental/`). Notes column updated: "Lifecycle workflow" vs "Supplemental workflow".
        Table realigned via markdown-table-prettify. Counts unchanged (81 total, same classification
        split — same number of files, just moved/renamed).

    - [x] **2.2.f Run Tier 1 quality gate on all modified files**

        Full lint pass: 0 errors. Fixed 5 violations during pass (3 MD060 table alignment, 2 MD013
        line-length from longer paths, 1 MD047 trailing newline from prettifier).

- [x] **2.3 Refine workflow directory structure**

    Post-2.2 refinements addressing conceptual grouping consistency:

    **`work-unit-lifecycle/planning/`**: Moved activate-planning-branch and integrate-planning-branch
    to `planning/` subdirectory. These are full-protection-only branch ceremony — distinct from the
    6 universal lifecycle operations at the root.

    **`session-lifecycle/`**: Promoted session-init and session-handoff from `supplemental/` to a peer
    `session-lifecycle/` directory at the `arc/` level. Mirrors `work-unit-lifecycle/` as a lifecycle
    grouping. Filenames kept as `session-init.md` and `session-handoff.md` — the `session-` prefix
    reads naturally in prose and provides useful grouping signal. `supplemental/` now contains only
    3 genuinely supplemental guides.

    **`initial-setup/`**: Renamed from `setup/` to sort before `session-lifecycle/` alphabetically,
    giving the natural exploration order: initial-setup → session-lifecycle → supplemental →
    work-unit-lifecycle. Also clarifies the one-time nature of these workflows.

    Updated cross-references across skills (6 files), workflow link definitions, strategy docs,
    and file inventory. Full lint pass clean.

### **Phase 3:** Strategy Directory Evaluation

**Strategies:** `strategy-file-classification.md`

- [x] **3.1 Assess `strategies/arc/` organization**

    **Decision: Keep flat.** 10 files is comfortable; no miscategorization to fix (unlike Phase 2
    workflows). Possible groupings (foundational/work-management/process/system) produce small
    arbitrary groups (1–4 files each). STRATEGY-INDEX.md already provides conceptual grouping with
    "Consult when:" triggers. Reconsider at ~15–18 files, which would only happen if framework
    strategies grow significantly (project strategies have their own `project/` directory).

    Broadened scope beyond directory structure to evaluate naming conventions:

    - [x] **3.1.a Evaluate grouping options**

        Evaluated 4 possible subdirectory groupings. All produce small, arbitrary groups — the
        largest (work management) has 4 files, the smallest (system) has 1. Phase 2 insight applies:
        that restructure was driven by *miscategorization*, not raw file count. Here, all 10 files
        are correctly categorized as strategies. Subdirectories would add navigation friction without
        meaningful conceptual clarity beyond what STRATEGY-INDEX.md already provides.

    - [x] **3.1.b Evaluate `strategy-*` prefix convention**

        **Decision: Keep prefix.** The `strategy-` prefix is redundant with the directory name but
        valuable for two reasons: (1) fuzzy-find grouping — `@strategy` in editor/prompt file
        pickers surfaces all strategies together, the most common manual access pattern; (2)
        context-independent type marking — filenames communicate their type in git log, search
        results, and link definitions without needing the full path.

        Documented the workflow exception: workflows don't use a prefix because they're activated
        mechanically via embedded cross-references with full paths, not via fuzzy-find. Core pipeline
        workflows use number prefixes (`1_`, `2_`, `3_`) for grouping signal instead.

        Added rationale documentation in three locations: detailed `### Why prefixes matter` section
        in `strategy-file-classification.md`, concise note in `strategies/README.md`, and brief
        reference in `STRATEGY-INDEX.md`.

    - [x] **3.1.c Evaluate individual strategy names**

        All 10 names are well-chosen — each communicates the primary consultation trigger.
        No renames warranted.

    - [x] **3.1.d Standardize strategy title format (incidental)**

        Three outlier titles standardized to the majority `# Strategy: [Name]` pattern:
        `strategy-work-organization.md` (`# Work Organization Strategy` →
        `# Strategy: Work Organization`), `strategy-task-list-formatting.md`
        (`# Task List Formatting Strategy` → `# Strategy: Task List Formatting`),
        `strategy-adr-methodology.md` (`# Architecture Decision Records (ADR) Methodology` →
        `# Strategy: ADR Methodology`). All 6 modified files pass Tier 1 linting.

- [x] **3.2 Implement strategy directory changes (if warranted)**

    **Skipped** — 3.1 decision is status quo for directory structure. Naming convention rationale
    documentation and title standardization were implemented as part of 3.1 subtasks.

### **Phase 4:** Mixed-Concern Audit

**Strategies:** `strategy-file-classification.md`, `strategy-configurability-architecture.md`

- [ ] **4.1 Audit all Configurable files for merge boundary cleanliness**

    **Goal:** Confirm framework and project content separate at the section level in every
    Configurable file. Paragraph-level interleaving causes false merge conflicts in WU3's
    update system.

    - [ ] **4.1.a Review each Configurable file**
        - Read each file classified as Configurable or Configurable (light)
        - For each: identify which sections are framework-owned vs project-owned
        - Flag any sections where framework and project content interleave at the
          paragraph level (not just the section level)
        - Check that `Configurable (light)` files genuinely have minimal project content

    - [ ] **4.1.b Resolve any interleaving found**
        - For each flagged file: propose separation (split sections, add markers, or accept
          with documented rationale)
        - Implement fixes for any that need structural changes
        - Update classification if a file's concern mix changed

    - [ ] **4.1.c Run Tier 1 quality gate on any modified files**

### **Phase 5:** Optional Content Pattern

**Strategies:** `strategy-configurability-architecture.md`, `strategy-file-classification.md`

- [ ] **5.1 Design the optional content pattern**

    **Goal:** Decide where opt-in framework content lives so WU3 can build selective installation
    without retrofitting.

    - [ ] **5.1.a Evaluate location options**
        - Inside `.arc/` (e.g., `.arc/optional/`, or mixed into natural homes)
        - In npm package only (present in source, installed selectively, no dedicated dir)
        - Hybrid (directory exists for discoverability, content managed by CLI)
        - Consider: adopter discoverability, CLI selective installation model, template
          system fit, STRATEGY-INDEX / workflow index integration

    - [ ] **5.1.b Define the pattern**
        - Where optional content lives in the framework source
        - Where it lands when installed (or if it gets a dedicated directory)
        - How it's referenced in discovery docs (STRATEGY-INDEX, workflow READMEs)
        - How the manifest tracks it (classification, layer, optional flag?)

    - [ ] **5.1.c Document decision**
        - Record in an appropriate location (ADR if significant, strategy doc update if light)

- [ ] **5.2 Establish forward-compatible structure**

    **Note:** Scope is minimal — just enough for WU3 to build against.

    - [ ] **5.2.a Create directory and/or README if the pattern calls for it**
    - [ ] **5.2.b Update file inventory if new files created**
    - [ ] **5.2.c Run Tier 1 quality gate on any new/modified files**

### **Phase 6:** Content Quality Checks

- [ ] **6.1 De-duplication audit**

    **Goal:** Identify content that appears in multiple `.arc/` documents and classify each
    instance.

    **Phase 0 finding to address:** F-04 (branch context guidance scattered across supplemental
    workflows and strategy but absent from main numbered workflows). Classify during 6.1.a and
    resolve during 6.1.b.

    - [ ] **6.1.a Audit high-traffic areas**
        - DEV-RULES.ARC vs. workflow documents (commit rules, task execution, session management)
        - Strategy documents vs. workflows that reference them (do workflows duplicate
          strategy content or properly defer?)
        - arc-methods.md vs. workflows (method contracts vs. inline guidance)
        - DEV-RULES.ARC vs. DEV-RULES.PROJECT (boundary clarity)

    - [ ] **6.1.b Classify and resolve each instance**
        - Intentional reinforcement (summary referencing detail): mark authoritative source
        - Accidental drift (full copy that should be cross-reference): trim to reference
        - Misplacement (content in wrong document): relocate
        - **F-04**: Resolve branch context scattering — determine whether main numbered
          workflows need branch-state guidance or if deferring to supplemental workflows is
          intentional
        - Run Tier 1 quality gate on modified files

- [ ] **6.2 Cross-cutting dependency map**

    **Goal:** Produce a reference table of concepts that span multiple files, focused on what
    WU3 needs.

    **Phase 0 findings to address:** F-02 (branch.protection drives different post-planning
    routing but conditional absent from 2_generate-tasks), F-06 (partial protection semantics
    not integrated into activate-work-unit prerequisites). Map during 6.2.a and resolve
    during 6.2.c.

    - [ ] **6.2.a Identify cross-cutting concepts**
        - File classifications → which docs reference classification decisions?
        - Config settings → which workflows read `arc-config.yml`?
        - Method references → which workflows invoke arc-methods.md methods?
        - Session state model → which workflows touch WORK-STATUS / SESSION-NOTES?
        - pm.mode conditionals → which workflows branch on PM mode?

    - [ ] **6.2.b Produce dependency reference table**
        - Format: concept, authoritative source, files that reference it, blast radius
        - Save in a location accessible to WU3 (notes file or strategy doc update)

    - [ ] **6.2.c Resolve Phase 0 findings F-02, F-06**
        - F-02: Add protection-mode conditional routing to 2_generate-tasks "Next Step"
          (or consolidate routing into a single reference point)
        - F-06: Align activate-work-unit prerequisites with strategy on partial protection
          planning branch optionality
        - Use dependency map from 6.2.b to inform the right fix pattern

### **Phase 7:** Verification

- [ ] **7.1 Run Tier 3 quality gates**
    - [ ] 7.1.a Run full markdown linting: `npm run -s lint:md`
    - [ ] 7.1.b Review all uncommitted changes: `git diff --stat`

- [ ] **7.2 Validate success criteria against PRD**

### **Phase 8:** Workflow Navigability Validation

- [ ] **8.1 Re-walk lifecycle scenarios against post-structural-validation state**

    **Goal:** Confirm that structural changes (file moves, cross-reference updates,
    de-duplication, directory reorganization) haven't broken workflow navigability, and that
    Phase 0 findings were addressed.

    - [ ] **8.1.a Re-walk each scenario from Phase 0**
        - Use the same scenario definitions from 0.1
        - Follow the same methodology from 0.2.a (forward links, routing, conditionals)
        - Note: file paths may have changed if Phase 2/3 moved workflows or strategies

    - [ ] **8.1.b Verify Phase 0 findings were addressed**
        - For each finding from 0.2.b: resolved, consciously accepted, or still open?
        - Consciously accepted findings need documented rationale (e.g., "conditional density
          is inherent to supporting multiple protection modes — no simplification possible
          without dropping mode support")

    - [ ] **8.1.c Check for new issues introduced by structural changes**
        - File moves: do all cross-references resolve to the new paths?
        - De-duplication: did trimming inline guidance create gaps where an agent now needs
          to load an extra document mid-workflow?
        - Directory changes: does the new structure help or hinder scenario navigation?

    - [ ] **8.1.d Resolve or document remaining issues**
        - Fix any new dead-ends or broken references
        - Document accepted trade-offs in the completion doc
        - Run Tier 1 quality gate on any modified files

---

## Atomic Tasks — Structural Validation

<!-- Off-plan work within this WU's domain, discovered during execution. Flat checkbox list — -->
<!-- no phase structure, no numbering hierarchy. Check off as completed; archives with this -->
<!-- task list. For work too large or outside this WU's domain, see manage-incidental-work.md. -->

- [ ] **Remove `unprotected` branch protection mode** — Discovered during Phase 0 scenario
  definition: workflows (activate-work-unit, integrate-work-unit) assume branches and PRs exist;
  unprotected mode is undocumented in practice and narrow in audience. Kill the mode, make
  `partial` the minimum. Scope:
    - `arc-config.yml` (internal + template): remove `unprotected` option and update inline
      comments
    - `strategy-work-organization.md` § Branch Protection Modes: remove Unprotected section,
      update mode summary table, update choosing-your-mode guidance
    - `activate-planning-branch.md`: remove unprotected references
    - Grep for remaining `unprotected` references across `.arc/` and clean up

---

## Success Criteria

- [ ] Every `.arc/` file appears in the inventory with correct classification and layer assignment
- [ ] Workflow directory organization decided and implemented (if changes warranted)
- [ ] Strategy directory organization decided and documented
- [ ] Every Configurable file has section-level separation confirmed — no paragraph-level interleaving
- [ ] Optional content pattern decided and forward-compatible structure established
- [ ] No unresolved content duplication in high-traffic document areas
- [ ] Cross-cutting dependency map produced for WU3-relevant concepts
- [ ] All quality gates pass (markdown linting — 0 violations)
- [ ] Common lifecycle scenarios navigable without dead-ends, ambiguous routing, or excessive
  conditional parsing
- [ ] File tree is stable and ready for WU3 to hardcode paths
