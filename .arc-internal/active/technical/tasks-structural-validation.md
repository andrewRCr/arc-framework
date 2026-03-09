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

- [ ] **1.2 Update inventory with corrections**
    - Add missing files with correct classification and layer
    - Remove files no longer present
    - Fix any misclassifications or layer errors
    - Update counts in summary table
    - Run Tier 1 quality gate on `strategy-file-classification.md`

### **Phase 2:** Workflow Directory Evaluation

**Strategies:** `strategy-work-organization.md`, `strategy-file-classification.md`

- [ ] **2.1 Assess current `workflows/arc/supplemental/` structure**

    **Goal:** Determine whether the current flat structure under `supplemental/` serves adopters
    well, or whether reorganization improves navigability.

    **Phase 0 findings to address:** F-03 (integrate-work-unit routing spans files without
    clear entry point), F-05 (standalone archival housekeeping branch has no procedural step).
    These are routing issues caused by file organization — evaluate whether structural changes
    resolve them or whether explicit fixes are needed during 2.2.

    - [ ] **2.1.a Catalog current supplemental files by functional group**
        - Work unit lifecycle: activate, integrate, archive, rotate-branch
        - Session boundary: session-init, session-handoff
        - Guides/utilities: commit-guide, clean-work-unit-files, manage-incidental-work,
          verify-completion, maintain-project-docs
        - Note: `arc-methods.md` and `arc-extensions.md` sit at `workflows/` level, not in
          `supplemental/` — evaluate whether that placement is right

    - [ ] **2.1.b Evaluate reorganization options**
        - Option A: Subdirectories (e.g., `lifecycle/`, `session/`, rename remainder)
        - Option B: Rename `supplemental/` only (better name, keep flat)
        - Option C: Status quo with improved discoverability (README/index)
        - Assess each against: adopter navigability, cross-reference impact, path depth,
          cognitive load
        - Consider how WU3's CLI references these paths (init scaffolding, skill instructions)

    - [ ] **2.1.c Document decision with rationale**

- [ ] **2.2 Implement workflow directory changes (if warranted)**

    **Note:** Skip if 2.1 decision is status quo.

    - [ ] **2.2.a Execute file moves with `git mv`**
        - Preserve git history
        - Create any new directories

    - [ ] **2.2.b Update all cross-references to moved files**
        - Link definitions in all `.arc/` documents that reference moved workflows
        - CLAUDE.md and other agent files that reference workflow paths
        - Strategy documents that link to workflows
        - Other workflows that cross-reference each other

    - [ ] **2.2.c Update file inventory in `strategy-file-classification.md`**
        - Update paths for moved files
        - Add any new directory entries
        - Verify counts still accurate

    - [ ] **2.2.d Resolve Phase 0 findings F-03, F-05 if not addressed by structural changes**
        - F-03: integrate-work-unit Step 8 needs explicit batch vs standalone routing
        - F-05: standalone archival needs a procedural step for housekeeping branch creation
        - If structural changes (file moves, reorganization) resolved these, mark resolved
          with rationale. Otherwise fix here.

    - [ ] **2.2.e Run Tier 1 quality gate on all modified files**

### **Phase 3:** Strategy Directory Evaluation

**Strategies:** `strategy-file-classification.md`

- [ ] **3.1 Assess `strategies/arc/` organization**

    **Goal:** Determine whether 10 files in a flat directory is manageable or warrants
    subdirectories.

    - [ ] **3.1.a Evaluate grouping options**
        - Possible groups: foundational, work management, process, system
        - Assess: does grouping improve discoverability or add friction?
        - Consider STRATEGY-INDEX.md already provides conceptual grouping
        - Note current count (10) vs threshold where subdirs become worthwhile

    - [ ] **3.1.b Document decision with rationale and future threshold**
        - If keeping flat: note the file count at which to reconsider
        - If splitting: define groups and implement (same pattern as Phase 2)

- [ ] **3.2 Implement strategy directory changes (if warranted)**

    **Note:** Skip if 3.1 decision is status quo.

    - [ ] **3.2.a Execute file moves, update cross-references, update inventory**
    - [ ] **3.2.b Run Tier 1 quality gate on all modified files**

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
