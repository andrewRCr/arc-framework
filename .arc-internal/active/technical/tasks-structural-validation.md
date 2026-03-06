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

- [ ] **0.1 Define lifecycle scenarios**

    **Goal:** Establish the scenario set used for both baseline and final validation passes.

    - [ ] **0.1.a Identify common lifecycle paths**
        - Fully protected batch: integrate-work-unit → activate-planning-branch →
          archive-work-unit → create-prd → generate-tasks → integrate-planning-branch →
          activate-work-unit
        - Fully protected standalone archival: integrate-work-unit → activate-planning-branch →
          archive-work-unit (no next WU)
        - Partially protected: integrate-work-unit → archive-work-unit → create-prd →
          generate-tasks → activate-work-unit
        - Standalone planning (new session): session-init discovery → activate-planning-branch →
          create-prd → generate-tasks → integrate-planning-branch → activate-work-unit
        - Unprotected: integrate-work-unit → archive-work-unit → create-prd → generate-tasks →
          activate-work-unit (all on main)

    - [ ] **0.1.b Document scenario definitions for reuse in Phase 8**

- [ ] **0.2 Walk each scenario through the workflow chain**

    **Goal:** Establish a navigability baseline before structural changes. Feed findings into
    Phases 2, 6.1, and 6.2.

    - [ ] **0.2.a Walk each scenario step-by-step**
        - Follow forward links from each workflow to the next
        - At each transition: is the next step explicitly linked? Is the routing clear?
        - At each conditional: is the agent's path obvious given its config?
        - Track: number of documents loaded, conditional branches parsed, cross-reference hops

    - [ ] **0.2.b Flag issues**
        - Dead-ends (workflow ends without forward link to next step)
        - Ambiguous routing (multiple plausible next steps, unclear which applies)
        - Conditional overload (too many mode/protection variants in one section)
        - Excessive cross-reference hops (agent must load 3+ docs to complete one operation)
        - Document each finding with: scenario, workflow, specific location, severity

    - [ ] **0.2.c Capture findings as input to later phases**
        - Tag findings relevant to Phase 2 (directory evaluation): navigability issues caused
          by file organization
        - Tag findings relevant to Phase 6.1 (de-duplication): confusion from duplicated or
          scattered guidance
        - Tag findings relevant to Phase 6.2 (dependency map): cross-cutting concepts that
          create conditional density

### **Phase 1:** Inventory Validation

**Strategies:** `strategy-file-classification.md`, `strategy-configurability-architecture.md`

- [ ] **1.1 Walk `.arc/` file tree and compare against inventory**

    **Goal:** Identify every gap between on-disk reality and the inventory in
    `strategy-file-classification.md`.

    - [ ] **1.1.a List all files in `.arc/` and compare against inventory table**
        - Use `find .arc/ -type f` to get actual file list
        - Compare each file against the inventory section-by-section
        - Flag: files on disk but missing from inventory, files in inventory but not on disk

    - [ ] **1.1.b Verify classification accuracy for each file**
        - Framework: methodology files rarely customized by adopters
        - Configurable: framework structure + project-specific content
        - Scaffolded: created once at init, project-owned after
        - Pay attention to files that changed role during WU2

    - [ ] **1.1.c Verify layer assignments (Core vs arc-in-git)**
        - Core: always installed regardless of `pm.mode`
        - arc-in-git: installed only when `pm.mode: arc-in-git`
        - Check that conditional files are correctly assigned (e.g., backlog strategies,
          ROADMAP template, ATOMIC-TASKS)
        - Misassignment causes WU3 to install wrong file sets

    - [ ] **1.1.d Verify summary counts**
        - Total file count, per-classification counts, per-layer counts
        - Update summary table if counts drifted

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

    - [ ] **2.2.d Run Tier 1 quality gate on all modified files**

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
        - Run Tier 1 quality gate on modified files

- [ ] **6.2 Cross-cutting dependency map**

    **Goal:** Produce a reference table of concepts that span multiple files, focused on what
    WU3 needs.

    - [ ] **6.2.a Identify cross-cutting concepts**
        - File classifications → which docs reference classification decisions?
        - Config settings → which workflows read `arc-config.yml`?
        - Method references → which workflows invoke arc-methods.md methods?
        - Session state model → which workflows touch WORK-STATUS / SESSION-NOTES?
        - pm.mode conditionals → which workflows branch on PM mode?

    - [ ] **6.2.b Produce dependency reference table**
        - Format: concept, authoritative source, files that reference it, blast radius
        - Save in a location accessible to WU3 (notes file or strategy doc update)

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
