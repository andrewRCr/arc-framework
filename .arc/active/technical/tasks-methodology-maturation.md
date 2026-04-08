# Task List: Methodology Maturation

**PRD:** `.arc/active/technical/prd-methodology-maturation.md`
**Created:** 2026-04-06
**Branch(es):** `technical/methodology-maturation`
**Base Branch:** `main`
**Status:** Complete
**Completed:** 2026-04-08

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
    - Deliberately avoids "spec-driven development" terminology (renamed to "spec-directed"
      in Task 5.5)
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
    - 6. Trust hierarchy → convention with methodology kernel under P5 (having a defined priority
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

- [x] **4.8 Existing page enrichments**
    - Descoped from 5 pages to 3 — methodology/index.md, the-framework.md, and
      work-planning.md pipeline content already placed in prior tasks (4.4, 4.6).
    - `work-planning.md`: ATOMIC-INBOX rationale collapsible (~12 lines), qualified as
      arc-in-git with Planning Module note.
    - `contributing.md`: ADR summary section (~25 lines, reworked for contributor audience)
        - file naming conventions section (~20 lines, reworked "Why prefixes matter").
    - `glossary.md`: Added 2 missing terms — "Framework file" and "Incidental work unit".
      Key Concepts from core-philosophy already covered by existing 20 terms (verified).
    - **No source strategy edits:** Content was reworked for the target audience rather than
      extracted verbatim — source strategies keep their operational content unchanged.
      Header blockquote pointers deferred to Task 4.10 consolidation pass.

- [x] **4.9 Framework-dev content extraction to project/**
    - Merged file inventory into package-project-sync as unified "File Inventory and
      Dependency Map" — kept classification grouping, added Layer annotations (arc-in-git
      files marked explicitly), added Summary table. Single authoritative listing.
    - Moved "Relationship to Strategy Documents" from adr-methodology into
      package-project-sync as "Documentation Architecture" section with comparison table.
    - Stripped file-classification: removed File Inventory (177 lines), "Why prefixes
      matter" (24 lines), Summary table. 381→157 lines. Updated Scope line to point to
      package-project-sync for inventory.
    - Stripped adr-methodology: removed section + stale TOC entry. 356→323 lines.
    - Added adopter-facing "File Naming" section to docs/reference/work-organization.md
      (~17 lines) — prefix rationale for adopters wondering about naming conventions.
    - Added brief cross-reference in docs/the-framework.md where `.arc/` is introduced.
    - 8 files, -438 net lines.

- [x] **4.10 Local strategy consolidation and coherence pass**
    - **Consolidation 1:** session-management (100 lines) + context-loading (174 lines) →
      `strategy-session-operations.md` (213 lines). Structure: context loading model →
      mechanisms → method/extension loading → monitoring → compaction → portability.
    - **Consolidation 2 (revised):** Replaced `strategy-backlog-organization.md` with
      `strategy-planning-module.md` (120 lines) — arc-in-git overview doc. Pre-audit
      analysis found backlog-org content ~60% redundant with process-task-loop,
      task-list-formatting, and arc-methods. New doc covers: what arc-in-git installs,
      routing/graduation, inbox vs companion, scaling boundaries ("When to Use"), and
      relationship to Core ARC.
    - **Rationale stripping:** team-coordination (Identity explanation trimmed),
      task-list-formatting (Key distinction paragraph + Anti-Patterns subsection removed),
      adr-methodology (Industry Context subsection removed), quality-gates (residual
      rationale lines trimmed).
    - **Header blockquote pointers:** All strategies with docs-site counterparts already
      had pointers (added in 4.6/4.7). Added pointer to new planning-module doc.
    - **Infrastructure:** Updated init-recipe.json, manifest.json, reconfigure unit tests
      (15 refs) and E2E tests (3 refs) for file renames.
    - **Cross-references:** Updated all live navigational references across both copies
      (~50 sites). ADRs, archive, and analysis files left untouched (historical records).
    - **Coherence check:** All 8 post-extraction strategy docs read end-to-end. Clean —
      one pre-existing issue noted (configurability-architecture has 3 undefined link refs,
      not caused by this task).
    - 40 files changed, +400/-1200 net. Two-copy work through package source.

- [x] **4.11 Cross-reference verification**
    - Substantially completed during 4.10 — reference updates were done inline with
      each consolidation/rename rather than deferred.
    - Confirmation pass verified: zero old filenames in live navigational docs (package
      source, docs site, strategies, workflows, DEV-RULES). Old names remain only in
      historical docs (ADRs, analysis, archive, session notes) — correct per immutability.
    - All new filename references resolve to existing files.
    - `mkdocs build --strict`: passed (0 warnings). `npm run -s lint:md`: 0 errors.

- [x] **4.12 `.arc/README.md` — evaluate, extract, and thin**
    - [x] **4.12.a Extract Document Audiences content to docs site**
        - Added "Document Audiences" section to `docs/the-framework.md` before the Session
          Lifecycle section — four-audience taxonomy table plus workflow audience header
          explanation and session-init context
        - Verified other README content blocks covered elsewhere: Getting Started
          (→ `docs/getting-started.md`), Directory Structure (→ `AGENT-BRIEFING.ARC.md`),
          Updating ARC (→ `docs/reference/updating.md`)

    - [~] **4.12.b Remove README from both copies**
        - Superseded: analysis concluded README should stay. `.arc/` is a transparent,
          documentation-heavy directory where a README serves genuine orientation value
          (GitHub rendering, new team members, pattern consistency with 15 subdirectory
          READMEs). Clutter cost (1 file among 5 dirs) is negligible. Content restructuring
          addresses duplication without removing the file. Additionally, the upcoming ARCd
          rebrand makes the README a natural surface for explaining the ARC/ARCd naming
          distinction in-context.

    - [x] **4.12.c Thin README content to reduce duplication**
        - Removed Document Audiences section (extracted to docs site in 4.12.a)
        - Converted Getting Started from step-by-step to brief pointer to docs site
        - Replaced Updating ARC section (detailed file classification tables) with a "Learn
          More" link list pointing to docs site pages
        - Kept Directory Structure and intro paragraph (core in-context orientation value)
        - README reduced from 102 lines to 55 lines. Applied to both copies (package source
          first, synced to project instance)

- [x] **4.13 Evaluate and decide `user/` directory placement**
    - Decision: keep at `.arc/` root. External conventions (Terraform, VS Code, JetBrains)
      consistently place per-user state inside the tool directory. Gitignored subdirectories
      inside tracked directories is a standard pattern. In-repo placement provides team-mode
      discoverability. The "semantic mismatch" with structural sibling directories is not a
      real UX concern — the distinction is clarifying, not confusing.
    - Blast radius confirmed prohibitive (~74 files, ~150 reference sites, ADR-012
      supersession, git notes namespace migration) — but the decision is based on conventions
      favoring current placement, not just migration cost.
    - ADR-012 remains valid; no new ADR needed.

### **Phase 5:** Language and Positioning Cleanup

_Goal: Docs consistently distinguish methodology from framework implementation. Harness engineering
framing integrated._

- [x] **5.1 Language cleanup: docs site**
    - Reviewed all docs/ pages. Phase 4 IA restructuring (Methodology/Framework nav split)
      already resolved the structural distinction. `the-framework.md` lines 3-5 set the
      exemplary pattern: "ARC's methodology... is tool-independent. The ARC Framework is the
      specific implementation." Only residual item: `docs/index.md` line 19 uses "ARC" where
      "the framework" would be more precise, but reads naturally in context — left as-is.

- [x] **5.2 Language cleanup: methodology section and agent briefings**
    - Methodology pages (`rationale.md`, `principles.md`, `index.md`): already clean from
      Phase 4 restructuring. P1 section in principles.md strengthened with spec-directed
      positioning (done in 5.5). Harness engineering section added to rationale.md (done in
      5.4).
    - Agent briefings: tightened opening in both `AGENT-BRIEFING.ARC.md` and
      `AGENT-BRIEFING.PROJECT.md` — changed "The methodology is expressed as..." to "The ARC
      Framework implements this methodology as..." Package source updated, project instance
      synced.
    - README: already clean — "ARC is a structured methodology" (line 14) and "The framework
      unifies..." (line 22) make the distinction naturally.

- [x] **5.3 Language cleanup: remaining priority docs**
    - Reviewed strategy docs touched by this WU (session-operations, configurability-
      architecture, planning-module). Clean — "ARC" used as shorthand in operational context
      is natural and unambiguous. No instances actively misleading about methodology vs
      implementation.

- [x] **5.4 Integrate harness engineering positioning and terminology**
    - Added "ARC as a Process Harness" section in `docs/methodology/rationale.md` before
      "Where ARC Fits." Maps ARC to Böckeler's harness engineering model: feedforward controls
      (specs, constitutional docs, task decomposition) and feedback controls (quality gates,
      review stops, commit hooks). Positions ARC's human involvement as closer than "on the
      loop" — present during execution, not just maintaining the harness.
    - Referenced Böckeler article (martinfowler.com) with link.
    - Existing language in `principles.md` P4 ("feedback mechanism," "complete feedback
      system") already aligns naturally with the harness terminology.
    - Broader terminology adoption across docs and `.arc/` packaged docs continues in the
      5.1–5.3 language cleanup pass — feedforward/feedback language woven in where it
      strengthens clarity during that review.

- [x] **5.5 Rename P1 from "spec-driven" to "spec-directed development"**
    - Renamed across 11 live documents: docs site (index, faq, rationale, principles), repo
      README, META-PRD, and 4 ADRs (001, 002, 005, 006). ~20 individual edit sites.
    - Strengthened P1 in `docs/methodology/principles.md` with full positioning: "Directed,
      not driven" framing, contrast with SDD discourse, reference to Böckeler taxonomy
      (martinfowler.com), and co-authorship distinction.
    - Added positioning line to `docs/methodology/rationale.md` principle summary.
    - Left as-is: archive (historical), research docs (reference external SDD concept),
      session notes (historical context). These correctly reference the external "spec-driven
      development" discourse, not ARC's principle name.
    - Where appropriate, reference SDD discourse as counterexample: similar starting point
      (specifications), different execution model (delegation vs co-development).

- [x] **5.6 Connect skills to methodology docs**
    - Added arc-task-audit reference to `docs/work-planning.md` in the task lists section —
      natural discovery point where someone reading about task execution finds the pre-
      implementation analysis tool.
    - Phase 7 skills (arc-review, others) don't exist yet — will be connected when created.
    - Other skills (arc-resume, arc-commit, arc-handoff) already well-integrated in
      `the-framework.md` and `getting-started.md`.

### **Phase 6:** Conditional Content Architecture

_Goal: Document current conditional mechanisms and assess scaling for proposed modes._

- [x] **6.1 Inventory all current conditionals**
    - [x] **6.1.a Scan workflow and doc conditionals**
        - **In-prose conditionals** found in 13 `.arc/` documents across workflows, constitution,
          methods, agent briefings, and githook README. 6 config keys drive behavior:
          `pm.mode`, `team.mode`, `arc.role`, `branch.protection`, `review.pre_merge`,
          and WORK-STATUS state (task list presence). Heaviest: `session-init.md` (7),
          `activate-work-unit.md` (6), `archive-work-unit.md` (4), `session-handoff.md` (3),
          `integrate-work-unit.md` (4), `DEV-RULES.ARC.md` (3)
        - **Template `arc:if` blocks**: 6 of 14 `.template.md` files contain conditionals (21
          blocks total). Keys: `team.mode` (7 blocks across 4 files), `pm.mode` (13 blocks
          across 3 files, using `==`/`!=` with `arc-in-git`, `external`, `none`). One file has
          nested blocks (process-task-loop: pm.mode variants inside a bullet list)
        - **Githook shell conditionals**: `pre-commit` branches on `branch.protection` (1),
          `arc.role` (4 checks), `team.mode` (1); `commit-msg` branches on `arc.role` (3 checks)

    - [x] **6.1.b Scan CLI conditionals**
        - **Recipe conditions** (`init-recipe.json`): 10 conditions across 3 config keys.
          `pm.mode == arc-in-git` (5 files), `pm.mode == external` (1 file),
          `team.mode == true` (1 file), `tools includes <agent>` (7 agent files).
          Evaluated by `evaluateCondition()` in `recipe.ts` using `==` and `includes` operators
        - **Runtime code gates**: 5 TS locations branch on config values.
          `setup.ts:91` + `user.ts:292` (ATOMIC-INBOX gated on pm.mode),
          `config.ts:29` (user.sync_push derived from team.mode),
          `init.ts:243` + `join.ts:91` (arc.role written to git config).
          3 commands (init, reconfigure, update) extract `arcInGitFiles` set for layer assignment
        - **Layer-dependent behavior**: `classification.ts:111` assigns `arc-in-git`/`core` layer.
          `apply.ts:170` uses layer during manifest apply. `manifest/plan.ts:69` propagates
          layer into update plans. Layer affects whether files are added/removed on mode change
        - **Template rendering engine**: `render.ts:38-70` processes `arc:if` blocks using
          `==`/`!=` operators with boolean stack for nesting. Config map built from `pm.mode`,
          `team.mode`, `tools` in `config.ts:45-53`. Called by `files.ts:46` for every
          `.template.*` file during init/update

    - [x] **6.1.c Produce structured inventory**
        - Created `reference/analysis/analysis-conditional-content-architecture.md` as standalone
          feed-forward deliverable for the Operating Modes work unit
        - Four mechanism types: in-prose (37 across 16 docs), template `arc:if` (21 blocks in 6
          files), recipe (10 conditions, 15 files), runtime code gates (TS ~10, shell ~10)
        - Cross-mechanism config key summary table for per-key filtering
        - `pm.mode` most pervasive (28 locations), `arc.role` second (19), `team.mode` contained (10)

- [x] **6.2 Assess scaling and document pattern guidance**
    - **Scaling assessment**: Current mechanisms scale for Lite + local. Estimated +15-25
      conditionals for Lite (file exclusion absorbs largest impact), +10-15 for local.
      No architectural change needed — linear, moderate growth.
    - **Risk areas**: session-init/handoff in-prose density; process-task-loop may warrant
      Lite-specific template variant
    - **Pattern guidance**: mechanism selection decision table, in-prose formatting conventions,
      template `arc:if` patterns, density thresholds (5+ prose → consider template blocks,
      8+ template blocks → consider file split)
    - Output in same analysis document: inventory + assessment + guidance consolidated

### **Phase 7:** Skill Exploration and Development

_Goal: Evaluate the ARC workflow surface for skill opportunities, then design and implement skills
that pass the bar._

- [x] **7.1 Systematic skill evaluation**
    - Walked full pipeline: planning → PRD → task generation → execution → integration → archival.
      Mapped current coverage (workflows + skills) at each stage, identified gaps.
    - **arc-task-review — passes.** Fills the mandatory stop information gap: surfaces spec
      deviations, unexpected file changes, ambiguity interpretations, and judgment calls for
      independent human judgment. No overlap with existing workflows (process-task-loop defines
      the stop but not structured review information; pre-merge-review operates at work-unit
      level). Self-contained skill pattern (like arc-task-audit), not a workflow delegator.
    - **arc-plan — passes (with scope caution).** Fills the unstructured idea → plan doc gap.
      Value is in systematic context gathering (roadmap, backlog, prior work, codebase state)
      and framing questions — the tedious assembly a human would otherwise do manually or skip.
      Must stay light: context gathering + framing questions + get out of the way. If it feels
      like a Procedure, it failed. Skill + short workflow pattern (like arc-commit).
    - **arc-plan-audit — does not pass.** `1_create-prd.md` Step 1 already performs plan
      readiness assessment ("check for unresolved design decisions, open unknowns... If the
      plan isn't ready, surface the gaps"). Plan docs are freeform prose without the structured
      analysis surface that makes arc-task-audit effective (numbered tasks × codebase state).
      Low transition frequency (once per work unit) doesn't justify skill packaging. Simpler
      alternative: ask the agent "is this plan ready for a PRD?" — no ceremony needed.
    - **No additional candidates identified.** Integration, verification, archival, and
      activation stages are well-covered by existing workflows, methods, and extensions.
      No gap warrants a new skill.

- [x] **7.2 Design and implement arc-task-review**
    - [x] **7.2.a Design skill scope and workflow**
        - **Self-contained** (no supporting workflow needed) — bounded information surface,
          no multi-step decision process, no method dependencies, structurally parallel to
          arc-task-audit
        - Five analysis dimensions: spec deviations, unexpected file changes, ambiguity
          interpretations, judgment calls, unaddressed observations (leave-it-cleaner failsafe)
        - Two analysis modes: mechanical (git-based file/spec comparison for dimensions 1-2)
          and reflective (agent self-analysis for dimensions 3-5, leveraging same-session context)
        - Does NOT present the diff, evaluate code quality, or recommend approval/rejection
        - Uses "review increment" terminology (ARC concept) in instructions; retains "mandatory
          stop" in frontmatter description for discoverability
        - Naming rationale: `arc-task-review` parallels `arc-task-audit` (bookend pattern around
          task execution: audit before, review after). `arc-review` rejected — overlaps
          semantically with integration-level review (pre-merge-review method/extension,
          review-triage method) and could mislead users into skipping work-unit-level review
        - Full SKILL.md draft reviewed and approved — ready for implementation in 7.2.b

    - [x] **7.2.b Implement skill file and supporting docs**
        - Created canonical `system/skills/arc-task-review/SKILL.md` (self-contained, no
          supporting workflow needed per 7.2.a design)
        - Mirrored to package source (`packages/arc-framework/arc/system/skills/arc-task-review/`)
        - Generated local agent-specific variants: `.claude/skills/arc-task-review/`,
          `.codex/skills/arc-task-review/` — all 4 copies verified identical
        - Updated skills README in both `.arc/system/skills/` and package source

- [x] **7.3 Design and implement arc-plan (if evaluation passes)**
    - Self-contained skill (no supporting workflow) — context gathering, framing questions,
      then step back. Lighter than arc-commit; the skill IS the workflow.
    - Four steps: (1) determine starting point (fresh idea vs existing plan doc),
      (2) gather project context (direction, prior work, captured ideas, ADRs,
      project strategies, codebase), (3) present findings + framing questions adapted
      to starting point, (4) step back for freeform.
    - Dual-mode: works both for starting from a vague idea (no plan doc) and for
      revisiting a rough `plan-*.md` to refine toward PRD readiness. Framing questions
      adapt per mode (fresh: problem/scope/approach; refining: gaps/staleness/alternatives).
    - Mode-agnostic: context gathering describes _what_ to look for rather than
      arc-in-git-specific locations. Works across all PM modes without conditionals.
    - Scope guard: explicit instruction to keep context gathering targeted — read titles
      and summaries before full content, skip irrelevant sources, aim for concise
      orientation not comprehensive research.
    - Canonical + package source + local variants (`.claude/`, `.codex/`) created.
      Skills READMEs updated.

- [~] **7.4 Design and implement arc-plan-audit (if evaluation passes)**
    - Skipped — evaluation (7.1) determined insufficient value. `1_create-prd.md` Step 1 already
      performs plan readiness assessment; plan docs lack the structured analysis surface that
      makes task auditing effective; low frequency (once per WU) doesn't justify skill packaging

- [x] **7.5 Update file classification and package source**
    - [x] **7.5.a Add skills to package source and generate local variants**
        - Package source mirrored for arc-task-review and arc-plan (done during 7.2/7.3)
        - Added `arc-plan` and `arc-task-review` to `CANONICAL_SKILLS` in `resolution.ts`
        - No supporting workflow files needed (both skills are self-contained)
        - All local variants verified: `.claude/` (8 arc skills + 2 project), `.codex/`
          (8 arc skills), canonical (8), package source (8) — all in sync
        - Also regenerated missing codex `arc-task-audit` copy (pre-existing gap)

    - [x] **7.5.b Update file inventory and docs**
        - Added arc-plan and arc-task-review to `strategy-package-project-sync.md` inventory
        - Classification: Framework, layer: core (consistent with existing skills)
        - Added arc-task-review and arc-plan entries to `docs/reference/skills.md` under
          Supplemental Skills (with arc-task-audit — on-demand tools, not session rhythm)
        - Skills READMEs already updated during 7.2/7.3

### **Phase 8:** Verification

_Goal: Confirm all deliverables meet PRD success criteria._

- [x] **8.1 Tier 3 quality gates**
    - Full suite passed: markdown lint (168 files, 0 errors), TS lint (0 errors), shell lint
      (0 errors), typecheck src+test (0 errors), 617 tests (574 unit/integration + 43 E2E),
      build success

- [x] **8.2 Validate success criteria against PRD**
    - All 12 PRD success criteria validated against completed work. Two wording adjustments
      in the task list criteria to match actual outcomes:
        - Criterion 8: "arc-review" → "arc-task-review" (renamed per Task 7.2.a rationale)
        - Criterion 9: README kept and thinned (102→55 lines) rather than removed —
          Task 4.12.b superseded with documented rationale; Document Audiences extracted
          to docs site (4.12.a), intent satisfied differently

- [x] **8.3 Verify all atomic tasks resolved**
    - `atomic-methodology-maturation.md` is empty — no atomic tasks were captured during
      this work unit. All incidental work was handled inline per issue-triage thresholds.

---

## Success Criteria

- [x] Package and project copies in sync with zero undocumented deviations
- [x] Dev safeguard strategy operational — loaded or referenced when methodology edits are in scope
- [x] A reader can distinguish what ARC-the-methodology requires from what ARC Framework implements
- [x] Human co-development posture described in methodology docs — descriptive, not prescriptive
- [x] `arc update` wholesale-replaces Framework files without merge conflicts
- [x] Strategy docs cleanly separate operational reference from explanation
- [x] Content placement decisions documented with rationale on all three axes
- [x] At least one new skill (arc-review) designed, implemented, and connected to methodology docs
    - **Deviation:** Skill named `arc-task-review` (not `arc-review`) — bookend pattern with
      `arc-task-audit`; `arc-review` rejected to avoid overlap with integration-level review
- [~] `.arc/` root README removed; Document Audiences content preserved on docs site
    - **Superseded:** README kept and thinned (102→55 lines) rather than removed. Analysis
      concluded README serves genuine orientation value (GitHub rendering, new team members,
      pattern consistency). Document Audiences extracted to docs site (Task 4.12.a)
- [x] Conditional content inventory documented with scaling assessment for proposed modes
- [x] Docs site remains fully functional — content additions include required structural changes
- [x] All workflow and doc references remain coherent — no broken cross-references or stale paths
- [x] All quality gates pass (tests, linting, type checking — 0 violations)
- [x] Ready for integration

---
