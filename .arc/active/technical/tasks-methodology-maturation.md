# Task List: Methodology Maturation

**PRD:** `.arc/active/technical/prd-methodology-maturation.md`
**Created:** 2026-04-06
**Branch(es):** `technical/methodology-maturation`
**Base Branch:** `main`
**Status:** In Progress

## Overview

**Purpose:** Settle ARC's foundational clarity — methodology/implementation boundary, content
architecture, update behavior, human co-development posture, and skill infrastructure — gating the
downstream Operating Modes work unit.

**Strategies:** `strategy-file-classification.md`, `strategy-configurability-architecture.md`,
`strategy-testing-methodology.md`

## Scope

### Will Do

- Reconcile package and project copies; establish dev safeguard against future desync
- Define the methodology boundary (summary artifact, 10 grey area resolutions)
- Articulate the human co-development posture as methodology-level content
- Fix CLI `arc update` to wholesale-replace Framework files
- Evaluate and implement content placement across three axes (install vs docs site, arc/ vs project/,
  operational content relocation)
- Remove `.arc/README.md` from installs; extract Document Audiences to docs site
- Clean up methodology/implementation language across docs; integrate harness engineering positioning
- Inventory conditional content architecture with scaling assessment
- Design and implement ARC skills (arc-review minimum; arc-plan, arc-plan-audit evaluated)
- Connect existing and new skills to methodology docs

### Won't Do

- Implement ARC Lite or local mode (downstream — Operating Modes WU)
- Change principle definitions (P1-P11 stable; this clarifies expression, not content)
- Redesign team mode operations (language cleanup only)
- Full docs site rebuild (add methodology content with structural changes as needed; site remains
  functional throughout)

---

## Tasks

### **Phase 1:** Package-Project Sync Audit and Dev Safeguard

_Goal: Establish a clean baseline across both copies and prevent future desync._

- [x] **1.1 Audit package-project content drift**
    - Compared all 56 Framework + 13 Configurable files using file-classification inventory as checklist
    - **Framework drift (2 files):**
        - `strategy-core-philosophy.md` line 243: .arc/ has "reciprocal" (correct, d003463), package
          has stale "recursive" — propagate .arc/ → package
        - `system/agent/README.md` line 84: .arc/ has `.template.md` heading, package has `.md` —
          package is correct (adopter-facing), .arc/ should match
    - **Framework missing from .arc/ (1 file):**
        - `system/workflows/arc/initial-setup/03_configure-external-integration.md` — added to
          package after last sync cycle
    - **Configurable drift (5 files):** DEV-RULES.PROJECT, STRATEGY-INDEX, arc-config.yml,
      CLAUDE.ARC, CODEX.ARC, arc-extensions — all expected project customizations, no framework
      section drift. arc-methods.md identical.
    - **Template counterparts (14 files):** All rendered correctly. 6 contain `<!-- arc:if -->`
      conditionals on team.mode and pm.mode. No unexpected drift in non-conditional content.
    - **Legitimately asymmetric:** 5 agent files package-only (init-selected), project-owned files
      .arc/-only (testing strategy, pre-merge-review workflow, analysis/research docs)

- [x] **1.2 Reconcile identified deviations**
    - Only 2 Framework file drifts found (audit was clean); no stale paths or link issues

    - [x] **1.2.a Fix content drift in package source**
        - `strategy-core-philosophy.md`: propagated "reciprocal" from .arc/ → package (d003463
          terminology fix not previously synced)
        - `system/agent/README.md`: propagated `.md` heading from package → .arc/ (corrected
          erroneous `.template.md` reference)

    - [x] **1.2.b Resolve stale path references and template placeholders**
        - No stale paths or placeholder strings found in either copy during audit

    - [x] **1.2.c Verify cross-file link consistency**
        - Both copies now agree on all non-Configurable content; verified via diff
        - Remaining deviations are project-specific Configurable customizations (5 files) and
          legitimately asymmetric files (init-selected agents, project-owned content)

- [x] **1.3 Build dependency map**
    - Folded into 1.4 as a section in the strategy doc (not a standalone deliverable)

- [x] **1.4 Write dev safeguard strategy**
    - Created `strategies/project/strategy-package-project-sync.md` with:
        - Two-copy architecture explanation and edit flow rules by classification
        - Template counterpart catalog (14 files, 6 with `arc:if` conditionals)
        - Safeguards section: pre-commit hook, DEV-RULES.PROJECT guard, husky separation pattern
        - Full dependency map: Framework (34 files), Configurable (7), package-only (6),
          template counterparts (14)
    - Added Package-Project Sync section to DEV-RULES.PROJECT (session-loaded lightweight guard)
    - Added entry to STRATEGY-INDEX

- [x] **1.5 Evaluate and implement hook enforcement**
    - Viable and implemented. Executed before 1.3/1.4 (reordered — hook design informed strategy scope)

    - [x] **1.5.a Assess viability of pre-commit check**
        - Viable using manifest.json classification — distinguishes Framework (warn) from
          Configurable/Scaffolded (expected edits, no warning)
        - Edge case: one-time drift fixes edit .arc/ to match package — hook still warns, but
          correctly (a Framework file was edited in .arc/). Acceptable false positive for rare
          sync operations.
        - Configurable files produce no false positives — manifest classification excludes them

    - [x] **1.5.b Implement or document decision**
        - Implemented as project-specific script (`scripts/check-package-sync.sh`) called from
          `.husky/pre-commit` after the ARC hook — NOT in the ARC hook itself (Framework files
          ship to adopters; this check is dev-only for this repo)
        - Prior art: `.arc-internal/` dual-hook approach from WU2 solved same problem; superseded
          by current two-copy architecture but the separation concern was never re-addressed
        - Warns when `.arc/reference/` or `.arc/system/` Framework files are staged without their
          `packages/arc-framework/arc/` counterpart also staged
        - Suppresses when both copies staged (deliberate sync)
        - Shellcheck clean, tested full husky chain (ARC hook → project check)

### **Phase 2:** Methodology Boundary Definition

_Goal: Define what ARC-the-methodology requires, independent of any specific implementation._

**Strategies:** `strategy-core-philosophy.md`

- [ ] **2.1 Create methodology summary artifact**
    - Write a focused section (in the philosophy strategy doc, or as a lightweight companion) that
      states "this is ARC without any implementation"
    - Targeted at someone who says "I like the ideas but I'm not going to use your framework"
    - Should be readable in five minutes
    - Leave the reader knowing what ARC-the-methodology asks of them

- [ ] **2.2 Resolve grey areas (batch 1: 1-5)**
    - For each, classify as methodology or implementation with documented rationale:
        1. Review increment granularity (per-task boundary)
        2. Tiered quality gates (Tier 1/2/3 system)
        3. Work categories (feature/technical/incidental)
        4. Issue triage routing (fix-vs-defer decision tree)
        5. Context loading tiers (T1/T2/T3 loading model)

- [ ] **2.3 Resolve grey areas (batch 2: 6-10)**
    - For each, classify as methodology or implementation with documented rationale: 6. Trust hierarchy (git > task list > WORK-STATUS > SESSION-NOTES) 7. Strategy document pattern (codified domain guidance) 8. Deferred review scope (user-defined continuation ranges) 9. Verification phase (formal end-of-work-unit validation) 10. Context footer requirement (commit traceability linking)

- [ ] **2.4 Articulate human co-development posture**
    - Write methodology-level articulation of what effective co-development looks like during task
      execution
    - Framing: descriptive ("this is what doing ARC looks like"), not prescriptive or
      self-monitoring ("check yourself against this list")
    - Placement: P2 section of the philosophy strategy, or the methodology summary artifact
    - Not in the process-task-loop (agent-facing)
    - Design constraint: treat the reader as a responsible engineer who wants to understand the
      practice

### **Phase 3:** CLI Update Behavior Fix

_Goal: Framework-classified files wholesale replaced on `arc update` instead of three-way merged._

**Strategies:** `strategy-testing-methodology.md`

- [ ] **3.1 Implement wholesale replacement for Framework files**
    - Modify `applyChangePlan()` in `packages/arc-framework/src/lib/manifest/apply.ts`
    - Check `classifyFile(entry.templateFile)` before merging
    - Framework → write updated content directly (same path as "file missing from disk")
    - Configurable → three-way merge as today (no change)
    - Scaffolded → skip as today (no change)

- [ ] **3.2 Update tests for new update behavior**

    Build `test-first` (one behavior at a time):
    - Framework file is wholesale replaced even when adopter has modified it
    - Configurable file still goes through three-way merge when adopter has modified it
    - Scaffolded file still skipped
    - Framework file with no adopter changes: behavior unchanged (already clean via fast path)
    - Conflict count in `ApplyResult` excludes Framework files (no conflicts possible)
    - Removed Framework files still auto-deleted

- [ ] **3.3 Update strategy-file-classification documentation**
    - Update Framework update behavior description: "Auto-merge. Flag conflicts for review" →
      "Wholesale replaced. Adopter modifications overwritten."
    - Update the summary table: "Three-way merge. Conflicts rare." → "Wholesale replaced.
      No conflicts."
    - Ensure the guidance is clear: if adopters need to customize Framework content, use the
      override mechanisms (methods, extensions, config)

### **Phase 4:** Content Placement and Install Structure

_Goal: Evaluate and implement content placement decisions across three axes, plus install root
streamlining._

- [ ] **4.1 Evaluate Axis 1: Install vs docs site**
    - For each strategy doc (using the dependency mapping from notes file), assess:
      is this Reference (operational, consumed by workflows) or Explanation (rationale, philosophy)?
    - For mixed docs: can the explanatory portions extract while operational portions stay?
    - Where operational content from a docs-site-bound doc needs to stay, can it relocate to a
      method, workflow inline section, or DEV-RULES section?
    - Document decisions with rationale per doc

- [ ] **4.2 Evaluate Axis 2: arc/ vs project/ extraction**
    - Audit `strategies/arc/` for framework-dev-only content that shouldn't ship to adopters
    - Known candidate: file inventory in strategy-file-classification
    - Check for other framework-dev-only content embedded in arc/ strategies
    - Document decisions with rationale

- [ ] **4.3 Implement content extraction and placement**
    - [ ] **4.3.a Extract explanatory content to docs site**
        - Move Explanation-type content from strategy docs to docs site pages (per Axis 1 decisions)
        - Rewrite extracted content to work as standalone docs-site pages
        - Skip if Axis 1 decision is in-place separation rather than relocation

    - [ ] **4.3.b Extract framework-dev-only content to project/**
        - Move framework-development-only content to `strategies/project/` (per Axis 2 decisions)

    - [ ] **4.3.c Rewrite remaining strategy doc prose**
        - Remaining operational reference content must stand alone without the "why" context that
          surrounded it
        - Apply even if explanatory content stays in-place (Diátaxis separation improves clarity
          regardless of placement)

    - [ ] **4.3.d Update cross-references**
        - Fix all references in both directions: install docs pointing to docs site, docs site
          pointing to install content
        - Verify no broken links in either location

- [ ] **4.4 Update docs site structure**
    - [ ] **4.4.a Add methodology/philosophy pages**
        - Create new docs-site pages for any extracted content
        - Write or adapt content for the docs-site audience and format

    - [ ] **4.4.b Update navigation and verify**
        - Update `mkdocs.yml` navigation structure for new pages
        - Verify all cross-references resolve (internal links, docs-site links)
        - Docs site must remain fully functional after changes

- [ ] **4.5 Remove `.arc/README.md` from installs**
    - [ ] **4.5.a Extract Document Audiences content to docs site**
        - Four-audience taxonomy (agent-executed, collaborative, shared context, human-facing)
          plus explanation of audience headers in workflows
        - Likely destination: `getting-started.md` or a dedicated section

    - [ ] **4.5.b Remove README from both copies**
        - Remove from package source (`packages/arc-framework/arc/README.md`)
        - Remove from project instance (`.arc/README.md`)
        - Update file classification inventory
        - Update any docs or workflows that reference `.arc/README.md`

- [ ] **4.6 Evaluate and decide `user/` directory placement**
    - Assess whether a `system/` rename resolves the semantic mismatch
    - If a rename works: implement the move (update CLI path construction, all doc references,
      gitignore patterns, file classification inventory)
    - If not: document the decision to keep at root with rationale
    - Update ADR-012 with a note if the decision changes the directory structure

### **Phase 5:** Language and Positioning Cleanup

_Goal: Docs consistently distinguish methodology from framework implementation. Harness engineering
framing integrated._

- [ ] **5.1 Language cleanup: docs site**
    - Review `docs/` pages for methodology/implementation conflation
    - "How ARC Works" and similar sections: ensure framing distinguishes principles from specific
      implementation mechanisms
    - Contextually considered — preserve prose flow, don't mechanically insert "framework"

- [ ] **5.2 Language cleanup: philosophy strategy and agent briefings**
    - Review `strategy-core-philosophy.md` — principle statements clearly methodology-level,
      convention descriptions clearly implementation-level
    - Review agent briefings (`AGENT-BRIEFING.ARC.md`, `AGENT-BRIEFING.PROJECT.md`) and main
      repository `README.md`
    - Apply same methodology/implementation distinction

- [ ] **5.3 Language cleanup: remaining priority docs**
    - Review other strategy docs touched or referenced by this WU
    - Clean up only where they actively mislead about methodology vs implementation
    - Operational strategy docs (task-list-formatting, work-organization): light touch

- [ ] **5.4 Integrate harness engineering positioning**
    - Add positioning section in philosophy strategy: ARC as a "process-level harness"
    - Adopt terminology where it strengthens clarity: feedforward controls, feedback controls
    - Reference Fowler article in philosophy strategy and docs site "What is ARC" content
    - Frame as "ARC's approach maps to the harness engineering model" — not derivative

- [ ] **5.5 Connect skills to methodology docs**
    - Reference arc-task-audit from relevant methodology/workflow docs (currently a documentation
      island)
    - Reference new skills (arc-review, and any others from Phase 7) from the docs they support
    - Ensure a developer reading ARC's methodology docs discovers the skills that support the
      practices described

### **Phase 6:** Conditional Content Architecture

_Goal: Document current conditional mechanisms and assess scaling for proposed modes._

- [ ] **6.1 Inventory all current conditionals**
    - [ ] **6.1.a Scan workflow and doc conditionals**
        - All workflow documents: conditional-in-prose patterns (e.g., "skip this step if
          `pm.mode` is `none`")
        - `.template.md` files: `<!-- arc:if -->` conditional blocks

    - [ ] **6.1.b Scan CLI conditionals**
        - Conditionally included/excluded files in recipe resolution
        - Mode-dependent behavior in commands and handlers

    - [ ] **6.1.c Produce structured inventory**
        - Location, condition expression, what changes per conditional
        - Organized by mechanism type (in-prose, template rendering, file inclusion)

- [ ] **6.2 Assess scaling and document pattern guidance**
    - Estimate how many new conditionals each proposed mode (Lite, local) would add
    - Determine if current mechanisms scale or if a more systematic approach is needed
    - Document the pattern that new conditionals should follow
    - Output: inventory + assessment + guidance for the Operating Modes work unit

### **Phase 7:** Skill Exploration and Development

_Goal: Evaluate the ARC workflow surface for skill opportunities, then design and implement skills
that pass the bar._

- [ ] **7.1 Systematic skill evaluation**
    - Walk the full pipeline (planning → PRD → task generation → execution → integration → archival)
    - For each candidate (arc-plan, arc-plan-audit, arc-review, plus any newly identified):
      does it fill a real gap? Overlap with existing workflows? Support human judgment or replace it?
      Simpler alternative?
    - Document the evaluation: which candidates pass, which don't, rationale for each

- [ ] **7.2 Design and implement arc-review**
    - [ ] **7.2.a Design skill scope and workflow**
        - Define what the skill surfaces: spec deviations, unexpected file changes, ambiguity
          points where agent chose an interpretation, judgment calls
        - Does NOT present the diff (user has the code open)
        - Determine whether a supporting workflow is needed or if the skill is self-contained
        - Draft the skill's step-by-step instructions

    - [ ] **7.2.b Implement skill file and supporting docs**
        - Canonical skill file: `system/skills/arc-review/SKILL.md` (agent-agnostic, shipped in
          package — CLI generates agent-specific versions during `arc init`)
        - Supporting workflow if needed (in `system/workflows/arc/supplemental/`)
        - Generate local agent-specific variants (`.claude/`, `.codex/`) for internal dev use
        - Invoked at user discretion, not every mandatory stop

- [ ] **7.3 Design and implement arc-plan (if evaluation passes)**
    - Skill file + supporting workflow
    - Context gathering: reads roadmap, backlog items, prior upstream work, relevant codebase state
    - Framing questions to help the human articulate what's in their head
    - Then freeform — gets out of the way
    - Must be light enough that planning doesn't feel like a Procedure
    - Skip if evaluation (7.1) determines it doesn't add value over just starting a conversation

- [ ] **7.4 Design and implement arc-plan-audit (if evaluation passes)**
    - Skill file (similar structure to arc-task-audit)
    - Examines: unresolved decisions, untested assumptions, specificity gaps, scope coherence,
      downstream readiness, staleness
    - Different concern surface from arc-task-audit (requirements-grounded, not codebase-grounded)
    - Skip if evaluation (7.1) determines it doesn't add sufficient value

- [ ] **7.5 Update file classification and package source**
    - [ ] **7.5.a Add skills to package source and generate local variants**
        - Canonical skill files already in `system/skills/` — ensure mirrored to
          `packages/arc-framework/arc/system/skills/` for distribution
        - Add any supporting workflow files to package source
        - Ensure `arc init` / `arc update` handles the new skill files correctly
        - Regenerate local agent-specific variants (`.claude/`, `.codex/`) from canonical source

    - [ ] **7.5.b Update file classification inventory**
        - Add new skill and workflow files to `strategy-file-classification.md`
        - Verify classification (Framework) and layer assignment

### **Phase 8:** Verification

_Goal: Confirm all deliverables meet PRD success criteria._

- [ ] **8.1 Tier 3 quality gates**
    - Run full quality gate suite per [verify-work-unit.md][verify-work-unit]:
      `npm run -s lint:md`, `npm run lint:ts`, `npm run lint:sh`, `npm run typecheck`,
      `npm run typecheck:test`, `npm test`, `npm run build`

- [ ] **8.2 Validate success criteria against PRD**
    - Walk through each PRD success criterion and compare against actual outcomes
    - Mark each criterion in the Success Criteria section below

- [ ] **8.3 Verify all atomic tasks resolved**
    - Review `atomic-methodology-maturation.md` — all items `[x]` or `[~]`

---

## Success Criteria

- [ ] Package and project copies in sync with zero undocumented deviations
- [ ] Dev safeguard strategy operational — loaded or referenced when methodology edits are in scope
- [ ] A reader can distinguish what ARC-the-methodology requires from what ARC Framework implements
- [ ] Human co-development posture described in methodology docs — descriptive, not prescriptive
- [ ] `arc update` wholesale-replaces Framework files without merge conflicts
- [ ] Strategy docs cleanly separate operational reference from explanation
- [ ] Content placement decisions documented with rationale on all three axes
- [ ] At least one new skill (arc-review) designed, implemented, and connected to methodology docs
- [ ] `.arc/` root README removed; Document Audiences content preserved on docs site
- [ ] Conditional content inventory documented with scaling assessment for proposed modes
- [ ] Docs site remains fully functional — content additions include required structural changes
- [ ] All workflow and doc references remain coherent — no broken cross-references or stale paths
- [ ] All quality gates pass (tests, linting, type checking — 0 violations)
- [ ] Ready for integration

---

[verify-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
