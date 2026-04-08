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

- [x] **2.1 Create methodology summary artifact**
    - Created `docs/methodology.md` as standalone docs site page (not in philosophy strategy)
    - Structured as practices (core practice, what it asks of the developer, where methodology
      ends), not as P1-P11 list; principles woven in without numbering
    - Deliberately avoids "spec-driven development" terminology (see Task 5.5)
    - Added to mkdocs.yml navigation between Home/Getting Started and Philosophy
    - Cross-references philosophy page evidence base for the single-threaded attention claim
    - External research validated positioning: co-development as primary mode with bounded review
      increments is novel relative to published methodologies (Harness Engineering, SDD)

- [x] **2.2 Resolve grey areas (batch 1: 1-5)**
    - Classifications with rationale (all 5 resolved as convention):
        1. Review increment granularity → convention under P2 (already listed in P2 conventions;
           methodology requires bounded increments, specific per-task granularity is configurable)
        2. Tiered quality gates → convention under P4 (P4 requires verification, not the specific
           tier structure; sharpened P4 conventions text to note tier system and verification phase)
        3. Work categories → convention under P7 (organizational taxonomy; teams using different
           categories or external trackers satisfy P7; added to P7 conventions text)
        4. Issue triage routing → convention under P4 (configurable method in arc-methods.md;
           capture requirement has methodology weight, routing mechanism is convention)
        5. Context loading tiers → implementation under P5 (T1/T2/T3 is how the framework manages
           agent context constraints; added to P5 conventions text)
    - Updated philosophy strategy conventions lines for P4, P5, P7 (both copies synced)

- [x] **2.3 Resolve grey areas (batch 2: 6-10)**
    - Classifications with rationale (all 5 resolved as convention, two with methodology kernels):
        6. Trust hierarchy → convention with methodology kernel under P5 (having a defined priority
           ordering is methodology — without it, conflicting state is unresolvable; the specific
           four-level ordering is convention; added to P5 conventions text with methodology note)
        7. Strategy document pattern → convention under P10 (codified improvement is methodology;
           the specific mechanism — strategy docs, directory structure, consult protocol — is
           convention; no text update needed, P10 conventions already general enough)
        8. Deferred review scope → convention under P2 (already listed in P2 conventions;
           configurable relaxation of default review cadence)
        9. Verification phase → convention under P4 (methodology requires thorough pre-merge
           verification; the formal phase structure is convention; added to P4 conventions text)
        10. Context footer requirement → convention under P6 (already listed in P6 conventions;
            traceability is methodology, specific footer format is convention)
    - Two methodology kernels identified: trust priority ordering (P5), work capture requirement (P4)

- [x] **2.4 Articulate human co-development posture**
    - Substantially addressed by the methodology summary (Task 2.1, `docs/methodology.md`)
    - "Co-development, not delegation" section: what the human contributes (lived experience,
      judgment, cross-cutting connections, "this feels wrong" moments), practical cost of
      delegation (maintenance knowledge), counter-position to industry delegation trend
    - "Interaction frequency matters" section: review increment practice, developer proximity,
      reviewer disengagement pattern
    - Descriptive framing throughout, treating reader as a responsible engineer
    - Moment-by-moment review checkpoint guidance deferred to arc-review skill (Phase 7) as
      operational tooling rather than methodology articulation

### **Phase 3:** CLI Update Behavior Fix

_Goal: Framework-classified files wholesale replaced on `arc update` instead of three-way merged._

**Strategies:** `strategy-testing-methodology.md`

- [x] **3.1 Implement wholesale replacement for Framework files**
    - Added classification branch in merge loop (`apply.ts`): Framework files skip three-way
      merge, write rendered content directly. Configurable files continue through merge path.
    - Apply-side approach chosen over plan-side reclassification — plan layer stays pure
      ("what changed"), apply layer decides "how" (wholesale vs merge)
    - Content comparison avoids unnecessary writes when Framework file is already current
    - Updated existing "pristine rebuild" test to use Configurable classification (Framework
      files no longer hit that path)

- [x] **3.2 Update tests for new update behavior**
    - Restructured merges test section into "Framework wholesale replacement" (5 tests) and
      "Configurable three-way merge" (3 tests) — clear behavioral separation
    - New Framework tests: overwrites adopter modifications, skips write when current, reinstalls
      missing from disk, replaces regardless of missing pristine baseline, never produces conflicts
      (merge function not called)
    - Configurable tests: three-way merge with pristine advance, pristine rebuild tracking,
      reinstall missing from disk
    - Scaffolded skip and Framework removal already covered by existing tests (unchanged)
    - 471 total tests (5 net new), all passing

- [x] **3.3 Update strategy-file-classification documentation**
    - Updated Framework taxonomy description, update behavior line, and summary table in both
      `.arc/` and `packages/arc-framework/arc/` copies
    - Updated all user-facing docs: `README.md`, `docs/index.md`, `docs/updating.md`,
      `docs/faq.md`, `.arc/README.md` (+ package copy) — removed "three-way merge" language
      where it described Framework files or the update system generically
    - High-level docs (README, index CLI list, FAQ) now describe outcomes ("preserving your
      customizations") rather than mechanisms; detailed docs (updating.md, strategy) are accurate
      about the Framework/Configurable split

### **Phase 4:** Content Placement and Install Structure

_Goal: Evaluate and implement content placement using hybrid approach — operational reference
with brief rationale context stays local, full explanatory content moves to docs site.
Remove .arc/README from installs._

- [x] **4.1 Per-doc content placement evaluation**
    - Evaluated all 13 strategy docs against the hybrid model using dependency mapping from
      notes file (§ Strategy Doc Operational Dependency Mapping) and section-by-section content
      analysis. Full deliverable in notes file (§ Task 4.1 Deliverable).
    - **Two full doc moves:** core-philosophy (466 lines, 100% explanatory) and agent-hooks
      (216 lines, supplementary, doesn't split cleanly) → entirely to docs site
    - **Nine partial extractions:** 22-48% per doc, totaling ~1,700 lines extractable.
      Operational reference + brief rationale stays local; full explanatory content → docs site.
    - **Two docs unchanged:** file-classification (17%, mostly tables) and backlog-organization
      (26%, small file) have minimal extractable content.
    - **Net:** 5,351 lines current → ~2,970 local / ~2,380 to docs site
    - Designed docs site target mapping: Philosophy splits into 2-page section, Customizing ARC
      becomes 3-page section (Configuration, Methods & Extensions, Agent Hooks), 3 new reference
      pages (Work Organization, Sessions & Context, Task Lists), 3 existing reference pages
      enriched. Interleaved narrative + collapsible rationale pattern (MkDocs Material native).
    - Designed local consolidation: 13 → 9 files. core-philosophy and agent-hooks removed.
      session-management + context-loading combined. backlog-organization folded into work-planning.
    - Phase 5 forward-compatibility guidelines documented: methodology/implementation language
      distinction, P1 rename avoidance, harness engineering insertion point.

- [x] **4.2 Evaluate arc/ vs project/ extraction**
    - Audited all `strategies/arc/` content for framework-dev-only material. Full deliverable
      in notes file (§ Task 4.2 Deliverable).
    - **File inventory** in strategy-file-classification (~177 lines) → move to
      `strategies/project/strategy-package-project-sync.md`, consolidating with existing
      dependency map
    - **"Relationship to Strategy Documents"** in strategy-adr-methodology (~30 lines) →
      move to `strategies/project/` — ARC documentation architecture reasoning, not
      adopter guidance
    - **Maintainer-vs-adopter split is narrow** (~207 lines total). All other rationale
      content in arc/ strategies is adopter-facing. Three "both" items (context-loading
      model, atomic companion rationale, quality-gates philosophy) handled via collapsible
      sections on docs site — no project/ split needed.

- [x] **4.3 Docs site structural preparation**
    - Moved `docs/philosophy.md` → `docs/philosophy/index.md`, created `docs/philosophy/`
      section with stub `principles.md`
    - Moved `docs/reference/configuration.md` → `docs/reference/customizing/configuration.md`,
      created `docs/reference/customizing/` with stubs for `methods.md` and `hooks.md`
    - Created stubs for 3 new reference pages: `work-organization.md`, `sessions.md`,
      `task-lists.md`
    - Updated `mkdocs.yml` nav: Philosophy section (2 pages), Customizing ARC section (3
      pages), expanded Reference section (3 new pages)
    - Fixed all cross-references across 12 docs files (philosophy path updates, configuration
      path updates, table realignment for MD060 compliance)
    - `mkdocs build --strict` passes, all modified files lint clean

- [x] **4.4 Philosophy section extraction + docs site IA restructuring**
    - **Source:** strategy-core-philosophy (474 lines) → docs site, then removed from both copies
    - **methodology/principles.md** (new, ~250 lines): Full P1-P11 with per-principle
      collapsible `??? info` rationale sections and conventions lists. P1 referenced by
      description ("Development from written specifications") per Phase 5 forward-compat.
    - **methodology/rationale.md** (enriched, renamed from philosophy): Added collapsible
      evidence sections (supertasker nuance, maintenance debt tip, developer disengagement),
      enriched Operating Premise, added Principles vs Conventions examples, added "What ARC
      Is Not" section, expanded "Where ARC Fits." Session-management context degradation
      already present from Phase 2.
    - **Docs site information architecture restructuring** (emerged from extraction work):
        - Removed `navigation.sections` → collapsible sidebar sections
        - Methodology/Framework nav split: "Methodology" section (index + Rationale +
          Principles), "The Framework" standalone page with framing intro
        - "Customization" section (was "Customizing ARC" under reference/) with new index page
        - "Updating" moved to Reference section
        - "Overview" replaces "Home" nav label
        - philosophy/ → methodology/rationale.md + methodology/principles.md
        - how-arc-works.md → the-framework.md (title + framing intro updated)
        - reference/customizing/ → customization/ (independent section)
        - updating.md → reference/updating.md
        - Cross-references updated across 15 docs files, notes file extraction target mapping
          updated, task descriptions updated for 4.5, 4.8, 5.1, 5.2, 5.4
    - **Two-copy removal (core-philosophy):** Deleted from both copies. Removed from
      init-recipe.json, manifest.json, STRATEGY-INDEX (both copies).
    - **Reference updates:** DEV-RULES.ARC, session-management, configurability-architecture
      links updated (both copies). Cosmetic references deferred to Task 4.11.

- [x] **4.5 Customizing ARC section extraction**
    - **Docs site pages (4 files):** Restructured customization section with improved IA:
        - index.md: landing page with project-level files as frontline customization, then
          mechanism links
        - configuration.md: rewritten for arc-config.yml focus only — design philosophy,
          enforcement vs guidance, adoption flexibility, settings reference, validation
          scenarios as collapsible walk-throughs
        - methods.md: method overrides + extension points mechanics, template structural
          contract note, decision guide
        - hooks.md: agent-hooks content with platform landscape and value assessment in
          collapsible sections
    - **configurability-architecture rewrite:** 708 → ~435 lines. Removed adoption defaults
      philosophy, validation scenarios, command landscape. Added header blockquote pointer
      (first partial extraction — pattern established). Rewrote "Relationship to Other
      Documentation" for removed refs. Corrected convention inventory: templates reclassified
      from "File-customizable" to "Structural contract" (they're Framework files, workflows
      depend on structure). Added "Structural contract" to configurability path definitions.
    - **Two-copy removal (agent-hooks):** Deleted from both copies. Removed from
      STRATEGY-INDEX, init-recipe.json, manifest.json, file-classification inventory, and
      package-project-sync dependency map.
    - **Incidental:** Removed stale core-philosophy entries from file-classification inventory
      (both copies) and package-project-sync dependency map (missed in Task 4.4).
    - **New:** `docs/.markdownlint-cli2.jsonc` disabling MD046 for docs/ (MkDocs admonition
      syntax conflicts with code block style consistency check).

- [x] **4.6 Reference pages: work organization and sessions**
    - Two-layer extraction model: docs site pages carry rationale/guidance, installed
      strategies retain pure operational specs with header blockquote pointers
    - `docs/reference/work-organization.md` (147 lines): decision guide, edge cases,
      incidental work unit branching model, branch protection choosing, anti-patterns.
      Industry citations (Phoenix Project, SAFe, stacked-dev) in collapsible.
    - `docs/reference/sessions.md` (139 lines): context degradation evidence with research
      citations in collapsible, three-tier loading model, instruction density concept,
      duration guidance, monitoring responsibility, auto-compaction reasoning.
    - **Strategy rewrites (both copies):** work-organization 757→397 (48%), session-management
      210→100 (52%), context-loading 268→174 (35%). Stripped all narrative/rationale,
      added header blockquote pointers.
    - Renamed anchor `#5-task-lists-and-branches` → `#task-lists-and-branches`, updated
      6 workflow/strategy references (both copies).
    - Updated cross-references: reference/index.md, work-planning.md, the-framework.md,
      glossary.md, STRATEGY-INDEX (both copies).
    - 20 files, -842 net lines.

- [x] **4.7 Reference pages: task lists, team coordination, quality gates**
    - `docs/reference/task-lists.md` (206 lines, new): structural vs style distinction,
      condensed annotated example, test-first grouping, atomic companion rationale, common
      mistakes, decision guidelines. Audience-filtered — lighter touch than strategy internals.
    - `docs/reference/team-coordination.md` (166 lines, enriched): added branching pattern
      decision guide, merge conflict expectations section, tracker complementarity collapsible.
    - `docs/reference/quality-gates.md` (129 lines, enriched): added common mistakes section,
      updated intro to reverse pointer direction.
    - **Strategy rewrites (both copies):** task-list-formatting 1,020→758, team-coordination
      396→353, quality-gates 244→209. Stripped rationale/pedagogical content, added header
      blockquote pointers. Reductions lighter than estimated — much of original content is
      genuinely operational spec that the agent needs.
    - Updated STRATEGY-INDEX descriptions (both copies), reference/index.md (added Task Lists
      row, updated descriptions).
    - 12 files, -411 net lines.

- [ ] **4.8 Existing page enrichments**
    - Lighter-touch additions across 5 existing docs site pages — smaller content placements,
      not full page restructures
    - methodology/index.md: focused sessions philosophy from session-management (~24 lines)
    - the-framework.md: auto-compaction rationale from session-management (~26 lines,
      collapsible)
    - work-planning.md: pipeline concept and plan doc philosophy from work-planning (~105
      lines), ATOMIC-INBOX rationale from backlog-organization (~25 lines, collapsible)
    - contributing.md: light ADR summary from adr-methodology (~50 lines, reworked), "Why
      prefixes matter" from file-classification (~40 lines, reworked for contributor audience)
    - glossary.md: Key Concepts vocabulary from core-philosophy (~16 lines)
    - **Local source edits:** adr-methodology, file-classification, work-planning,
      backlog-organization, session-management — all through package source.

- [ ] **4.9 Framework-dev content extraction to project/**
    - Independent of docs site work — can execute in any order relative to 4.4-4.8
    - **File inventory** (~177 lines from strategy-file-classification, lines 178-355) → fold
      into `strategies/project/strategy-package-project-sync.md`, consolidating with existing
      dependency map
    - **"Relationship to Strategy Documents"** (~30 lines from strategy-adr-methodology, lines
      325-356) → move to `strategies/project/`. Exact placement decided during implementation.
    - Update file-classification summary table after inventory removal
    - **Two-copy edits:** Both source files are Framework files — edit through package source.

- [ ] **4.10 Local strategy consolidation and coherence pass**
    - **After all extractions complete.** Separate pass to consolidate and verify.
    - **Consolidation 1:** session-management + context-loading → combined
      `strategy-session-operations.md` (~270 lines). Both session-related operational
      reference, thematically unified.
    - **Consolidation 2:** backlog-organization → fold into work-planning as conditional
      section (arc-in-git specifics). Combined ~205 lines.
    - **Coherence check:** Read each post-extraction strategy doc end-to-end. Each must stand
      alone as operational reference usable by an agent during workflow execution — all rules,
      thresholds, and format specs present without requiring the docs site version. Only deep
      "why" rationale should require the docs site link.
    - Update STRATEGY-INDEX for renames, removals, and consolidations.
    - **Two-copy work:** Consolidations create/rename Framework files — edit through package
      source.

- [ ] **4.11 Cross-reference verification**
    - Full link check in both directions after all extraction and consolidation complete
    - Local → docs site: every strategy doc with a docs-site counterpart has header pointer
      blockquote; inline contextual links resolve
    - Docs site → local: references to strategy docs use post-consolidation filenames
    - Internal local: strategy cross-references and workflow references resolve
      post-consolidation
    - Internal docs site: all nav entries resolve, cross-page links work
    - Run `mkdocs build --strict` for docs site link validation
    - Run markdown linting on all modified files (`npm run -s lint:md`)

- [ ] **4.12 Remove `.arc/README.md` from installs**
    - [ ] **4.12.a Extract Document Audiences content to docs site**
        - Four-audience taxonomy (agent-executed, collaborative, shared context, human-facing)
          plus explanation of audience headers in workflows
        - Likely destination: getting-started.md or a dedicated section
        - Verify other README content blocks are adequately covered elsewhere: Getting Started
          (→ docs/getting-started.md), Directory Structure (→ AGENT-BRIEFING.ARC.md),
          Updating ARC (→ docs/updating.md)

    - [ ] **4.12.b Remove README from both copies**
        - Remove from package source (`packages/arc-framework/arc/README.md`)
        - Remove from project instance (`.arc/README.md`)
        - Update file classification inventory
        - Update any docs or workflows that reference `.arc/README.md`

- [ ] **4.13 Evaluate and decide `user/` directory placement**
    - The semantic mismatch: `user/` is a personal workspace (session notes, scratch files,
      atomic inbox) sitting at .arc/ root alongside structural directories. Moving into
      `system/` would be wrong — system/ is "agent-facing operational files," not personal
      workspace. The question is whether any alternative improves on root placement.
    - Weigh root clutter cost against blast radius (~30 files, ADR-012 supersession, git
      notes namespace migration) and team-mode discoverability value
    - If rename warranted: propose as a separate work item given scope
    - If not: document decision to keep at root with rationale

### **Phase 5:** Language and Positioning Cleanup

_Goal: Docs consistently distinguish methodology from framework implementation. Harness engineering
framing integrated._

- [ ] **5.1 Language cleanup: docs site**
    - Review `docs/` pages for methodology/implementation conflation
    - "The Framework" page and similar sections: ensure framing distinguishes principles from
      specific implementation mechanisms (partially addressed by 4.4 IA restructuring —
      Methodology/Framework nav split already establishes the distinction structurally)
    - Contextually considered — preserve prose flow, don't mechanically insert "framework"

- [ ] **5.2 Language cleanup: methodology section and agent briefings**
    - Review docs site `methodology/` pages (rationale.md and principles.md, formerly
      strategy-core-philosophy, moved and restructured in 4.4) — principle statements clearly
      methodology-level, convention descriptions clearly implementation-level
    - Review agent briefings (`AGENT-BRIEFING.ARC.md`, `AGENT-BRIEFING.PROJECT.md`) and main
      repository `README.md`
    - Apply same methodology/implementation distinction

- [ ] **5.3 Language cleanup: remaining priority docs**
    - Review other strategy docs touched or referenced by this WU
    - Clean up only where they actively mislead about methodology vs implementation
    - Operational strategy docs (task-list-formatting, work-organization): light touch

- [ ] **5.4 Integrate harness engineering positioning**
    - Add positioning section in docs site `methodology/rationale.md` (formerly philosophy
      strategy, moved and restructured in 4.4; insertion point left during extraction): ARC as
      a "process-level harness"
    - Adopt terminology where it strengthens clarity: feedforward controls, feedback controls
    - Reference Fowler article in philosophy strategy and docs site "What is ARC" content
    - Frame as "ARC's approach maps to the harness engineering model" — not derivative

- [ ] **5.5 Rename P1 away from "spec-driven development"**
    - "Spec-driven development" has been claimed in 2025-2026 AI discourse (ThoughtWorks, Fowler/SDD
      tools, GitHub spec-kit) to mean specifications as executable blueprints for autonomous agent
      implementation — adjacent to but different from ARC's meaning ("written specifications before
      implementation"). Risk: readers assume ARC endorses the SDD paradigm (human writes spec, agent
      implements autonomously, human reviews), which is close to the opposite of co-development.
    - Rename P1 across all occurrences (~35 files). Avoid "spec-first" (too close). Find language
      that conveys "plan before you build" without triggering the SDD association.
    - Where appropriate, reference SDD as a counterexample: similar starting point (specifications),
      different execution model (delegation vs co-development).
    - Discovered during Phase 2 methodology landscape research (2026-04-06).

- [ ] **5.6 Connect skills to methodology docs**
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
