# Task List: Content Refinement Pass

**PRD:** `.arc-internal/active/technical/prd-content-refinement-pass.md`
**Created:** 2026-02-17
**Branch:** `technical/content-refinement-pass`
**Base Branch:** `main`
**Status:** In Progress

## Overview

**Purpose:** Systematic content quality improvement across all `.arc/` template files — eliminating project-type bias,
removing agent-specific content from generic docs, standardizing templates, streamlining heavyweight documentation, and
fixing known content issues.

## Scope

### Will Do

- Agnosticism corrections across all `.arc/reference/` workflows and strategies (project-type, agent, audience)
- Template standardization for all `.example.md` constitution files (structure + guidance + tokens approach)
- Template alignment fixes (CURRENT-SESSION vs handoff, completion sample, phantom references)
- Within-document streamlining of heavyweight docs (atomic-commit, maintain-task-notes, task-list-formatting)
- Content fixes: co-development documentation, auto-compact prohibition, all identified specific fixes
- Capture structural observations for the B.3 structural analysis pass

### Won't Do

- Structural restructuring (splitting files, moving sections to new docs, reorganizing file tree) — noted for B.3
- Distribution tooling, CLI work, manifest design
- Adoption experience materials (getting-started guide, quick-start path) — deferred to post-A-D effort
- New workflows or strategy documents
- `.arc-internal/` content changes (internal framework docs maintained separately)

---

## Tasks

### **Phase 1:** Core Workflow Agnosticism

**Goal:** Remove project-type and agent-specific assumptions from the 4 core workflows — the most-read, most-impactful
framework documents.

- [x] **1.1 Audit and fix `0_define-constitution.md`**
    - Significant restructure: 205 → 93 lines. Removed all filler, kept only value-carrying content.
    - Cut: Process numbered lists (redundant with templates), Integration with Feature Development
      section (restated what docs are), Constitutional Evolution Process (generic change management),
      Success Criteria section, section intro lines that restated headings
    - Restructured steps: Objective/Process/Key Questions → one-line description + template link +
      "Think through" questions. "Create" → "Define" in step headers (matches workflow title)
    - Condensed Quarterly Review (16 generic bullets) → Periodic Review (4 diagnostic questions)
    - Absorbed Templates section into workflow steps; setup note at end of Step 4
    - Agnosticism: team language generalized, project-type assumptions softened, "Market changes" →
      "Direction changes", template mechanism made distribution-agnostic
    - Template paths converted from backticks to markdown links for human navigability
    - **Audience indicator deferred**: convention is structural (B.3 / task 3.7)
    - **B.3 structural observations**:
        - Workflow/strategy docs lack header metadata convention
        - ROADMAP.md not covered here; needs broader "project bootstrap" workflow
        - ROADMAP vs PROJECT-STATUS: valid separation, needs sharper purpose framing
    - **Cross-cutting note**: Process docs can be leaner given planned onboarding materials will
      provide conceptual grounding upstream — docs needn't justify their own concepts inline

- [x] **1.2 Audit and fix `1_create-prd.md`**
    - Significant restructure: 228 → 109 lines. Removed feature/web-app bias throughout.
    - Step 1 (Review Context) → one-line note before steps (DEV-RULES already loaded at session init)
    - Step 1.5 → Step 1 "Check for Existing Planning Artifacts"; updated from notes-first to
      plan-first pattern (`plan-*.md` as primary pre-PRD artifact, `notes-*.md` as supplemental)
    - Purpose/Goal merged; Output Specifications merged into Step 4; Target Audience cut
    - Workflow Completion → "Stop here" guardrail folded into Step 4
    - Clarifying Questions: replaced web-app-specific examples with work-type-neutral categories
    - Header metadata: Created/Updated → single Updated date; Status only for dependency variant
    - Content Sections reframed for both work types: "User Stories" → "User Stories or Use Cases",
      "Functional Requirements" → "Requirements", "Success Metrics" → "Success Criteria",
      Technical Considerations noted as "often the core of technical PRDs; supplementary for features"
    - PRD structure kept inline (not extracted to template) — compact and needed at point of use

- [x] **1.3 Audit and fix `2_generate-tasks.md`**
    - Significant restructure: 275 → 137 lines. 8 steps → 4 steps.
    - Cut: Purpose/Goal/Output redundancy, Target Audience (enterprise framing), Task Completion
      Tracking (one-line ref to process-task-loop), Steps 5-8 collapsed into Step 4
    - Step 1 (Review Context) → pre-step note; Step 1.5 (PRD header cleanup) → folded into same note
    - Web-app-biased phase example → project-type-neutral template with `[component]` placeholders
    - `strategy-testing-methodology.md` reframed as project-level: "If your project has a testing
      methodology strategy" (PRD req 31)
    - PRD Reference path fixed: `.arc/active/` → `.arc/backlog/` (lifecycle consistency)
    - Task list Status: "In Progress" → "Not Started" (accurate for pre-activation state)
    - Step 1 expanded: added explicit STRATEGY-INDEX check for project-level strategies that should
      inform task structure (more actionable than "read META-PRD")
    - Body structure template removed — single source of truth via strategy-task-list-formatting.md
      reference; only task list header kept inline (workflow-specific metadata)

- [x] **1.4 Audit and fix `3_process-task-loop.md`**
    - Surgical edits (227 → 152 lines) — structure preserved, forcing functions intact
    - TodoWrite → "Session-Scoped Tracking vs Task List Files": tool-agnostic with Claude Code as
      one example, JSON removed, forcing function concept preserved (42 → 15 lines) (PRD req 5)
    - Completion protocol tightened: removed redundant stop rules (MANDATORY STOP sufficient on its
      own), "Streamline verbose planning details" condensed (6 → 3 lines)
    - PROJECT-STATUS check removed from parent task completion (excessive per-parent-task ceremony)
    - PROJECT-STATUS link fixed (wrong relative path)
    - Atomic Task Completion Protocol → brief pointer to ATOMIC-TASKS.md header (single source of
      truth); kept "When Atomic Tasks Grow" escalation with collaborative framing
    - Incidental work decision tree: "Create" → "Suggest" (agent assesses and flags, doesn't
      unilaterally act); "When Atomic Tasks Grow" similarly reframed with "Flag to user" + "If approved"
    - Test coverage broadened, CineXplorer example genericized, redundant bullets trimmed

- [x] **1.5 Run quality gate on Phase 1 files**
    - All 4 core workflow files pass with zero violations

### **Phase 2:** Supplemental Workflow Agnosticism & Quality

**Goal:** Extend agnosticism corrections to supplemental workflows, with a general quality pass (fresh-adopter
read-through, agent-perspective review, streamlining redundant/stale content). Heavyweight docs that need
dedicated streamlining (atomic-commit, maintain-task-notes) defer that work to Phase 5. Includes the
potentially substantial agent-pre-merge-review rework.

- [x] **2.1 Audit and fix `session-init.md`**
    - 148 → 121 lines (-18%). Project-type bias removed, reading list tightened, acknowledgment reworked.
    - Step 1: Docker/venv/services examples replaced with project-type-neutral categories
    - Step 2: "Why full read needed" blocks removed from 6 of 8 items (kept only for task list partial-read
      rationale). CURRENT-SESSION description de-biased, content bullets collapsed. Leaked project-specific
      example path genericized.
    - Steps 3+4 merged into "Confirm Orientation": two-section structure — quick environment confirmation,
      then active work understanding with explicit scannable fields (branch/task, last completed, next action,
      blockers). Proves comprehension rather than parroting a checklist.
    - Redundant closing Rationale paragraph removed (restated CRITICAL PRINCIPLE)
    - Session lifecycle assumption added (PRD req 36): auto-compact prohibition framed as session model note
    - "When to use" clarified as user-triggered (not agent-initiated)
    - **B.3 structural observation**: Workflow docs use footer-style versioning vs header metadata in
      PRDs/task lists — inconsistency to resolve when versioning is removed entirely

- [x] **2.2 Audit and fix `session-handoff.md`**
    - 381 → 268 lines (-30%). Stale content removed, project-type bias eliminated, examples diversified,
      redundant guidance trimmed.
    - Removed redundant Session Initialization Protocol section (lines 5-13) — competing source of truth
      with session-init.md. Replaced with proper Purpose/When-to-use header matching framework pattern.
    - Working Directory Context Check (23 lines with CRITICAL warning + step number references) and
      Pre-Update Verification merged into single condensed "Pre-Update Verification" (4 items).
    - Stable vs Dynamic section (25 lines with CineXplorer example, stale step number references,
      version check references) replaced with 6-line "What to Update" section.
    - Handoff examples: cut Example 1 (clean on-task — just the template filled in simply, zero marginal
      value). Kept 3 examples covering non-obvious patterns (off-task known, preparatory, off-task unclear),
      diversified to data pipeline, API documentation, and CI pipeline projects.
    - "What to include": removed Current Task and Next Action guidance (already covered by thorough
      template inline comments); kept Remaining Work and Additional Context (unique value).
    - Post-Update Cleanup: replaced specific markdownlint command with tool-agnostic guidance noting
      that gitignored CURRENT-SESSION.md may need explicit path or IDE linter.
    - Completed This Session good/bad examples and format template inline comments de-instanced.
    - Stale cross-reference ("see CRITICAL warning above") fixed. Closing footer removed.
    - **B.3 structural observation**: Working directory context management (stable vs dynamic paths)
      may belong in CURRENT-SESSION template guidance rather than in the handoff workflow

- [x] **2.3 Audit and fix `atomic-commit.md`** (agnosticism only — streamlining in Phase 5)
    - 432 → 430 lines (minimal — agnosticism pass only, streamlining deferred to Phase 5).
    - All 8 project-specific Complete Examples replaced: movie/pagination/theme/Chakra/TMDB references
      → auth system, API modernization, data pipeline, API documentation examples. Two already-generic
      examples (repo maintenance, quick doc update) kept as-is.
    - Scope list: removed "movie" (CineXplorer leak).
    - Commit Message Guidelines: de-instanced "duplicate movies" and theme-system/api-layer filename
      examples.
    - Mandatory Rules prohibited examples: de-instanced "tasks-pagination.md" and "theme system".
    - Documentation Overlap Scenario: genericized task numbers (6.1.d-g → 3.1-3.3).
    - Search command: replaced `find` with tool-agnostic "search `.arc/` for keywords".
    - Dependencies category: "package.json, requirements" → "package manifests, lock files".
    - Context footer format examples were already generic (use placeholders) — no changes needed.

- [x] **2.4 Audit and fix `activate-work-unit.md`**
    - 144 → 150 lines. Replaced `git add -A` with explicit file staging listing all typical
      activation files (PRD req 28), with note to adjust based on which optional steps applied.
    - No other project-type assumptions found — doc already uses generic placeholders throughout.

- [x] **2.5 Audit and fix `manage-incidental-work.md`**
    - 320 → 147 lines (-54%). Significant streamlining — removed all content restating other workflows.
    - Fixed double horizontal rule (PRD req 29).
    - De-instanced: commit example, branch naming example.
    - Cut redundant "Verify Need" section (restated criteria from 10 lines above as questions).
    - Formatting standards: collapsed triple strategy-task-list-formatting.md reference to single paragraph.
    - Cut "Executing Incidental Work" (restated process-task-loop), "Completing Incidental Work" (restated
      branch lifecycle + stale completion notes template), "Archive and Resume" (restated archive-completed.md).
      Replaced with 5-line pointer section.
    - Git branch section: collapsed 45-line section (redundant criteria + 11-step generic lifecycle) to
      10 lines preserving only the unique conventions (naming, PR against parent, archive timing).
    - Cut "Common Patterns" (nested work is self-described as rare; scope management is generic wisdom).
    - Removed version/changelog footer, linting explanation, "Purpose" bullets.
    - Fixed missing `--yes` in npx command.

- [x] **2.6 Audit and fix `weekly-review.md`**
    - Reworked for dual audience (human-solo + agent-assisted): 168 → 110 lines (-35%)
    - Added agent-assisted framing: agent reads files, surfaces findings, user decides
    - Restructured: "Review Steps" → "Process" with "Step N:" headers (matches create-prd pattern)
    - Cut: "When to use" / "Duration" / "Red flag" prescriptive metadata, "Overview" section
      (restated step goals), verbose troubleshooting thresholds, "Celebrate wins"
    - Cut: Optional Extended Review section — step 6 (CURRENT-SESSION audit) was a scope mismatch;
      step 5 (work unit files) folded into step 3 as natural part of backlog directory review
    - Step 4: added ROADMAP.md alongside PROJECT-STATUS.md with brief purpose distinction
    - Strategy reference moved from dedicated Reference section to header for context
    - Tightened: step prose leaner, "Check for bloat" → "Prune", Post-Review simplified
    - Fixed: "notes/PRD" → "plan/PRD" consistency
    - Agnosticism: already clean — no project-type or agent bias found

- [x] **2.7 Audit and fix `maintain-task-notes.md`** (agnosticism only — streamlining in Phase 5)
    - Surgical agnosticism pass on 867-line doc (867 → 861 lines, minimal delta as intended)
    - Removed project-instance data from Lessons Learned: "From Authentication Security Updates
      (2025-10-14) and Test-First Protocol Updates (2025-10-15)" framing and inline date from item 7
    - Removed version footer
    - Code examples (auth, CSRF, tokens) assessed as illustrative, not assuming — left as-is
    - Workflow steps are inherently project-agnostic — no changes needed
    - Full streamlining deferred to Phase 5

- [x] **2.8 Audit and fix `archive-completed.md`**
    - Agnosticism + quality pass: 524 → 376 lines (-28%)
    - Agnosticism: replaced all CineXplorer-instance examples (`chakra-recipe-system`,
      `discover-endpoint-consolidation`, `service-layer-modernization`, archive tree) with generic
      alternatives. Conditionally framed "Implementation verified" for non-code projects. Generated
      Code Sync Check already well-framed with template tokens — no changes needed.
    - Quality/condensing: cut redundant notes restating checklist items (Step 1), collapsed Step 2
      from 24 lines to 4 (maintain-task-notes details belong there, not here), removed "Why commit
      on child branch" (restated overview), removed "Purpose of completion doc" section (folded
      one-liner into Step 3 intro), deduplicated Step 10 planned/incidental blocks into single
      block, condensed sequence numbering to single paragraph, cut best-practices list (mirrored
      critical-errors), tightened Steps 5-7 and commit format guidance throughout
    - Preserved: all procedural content, completion doc template + verification checklist,
      archive structure reference, superseded work appendix

- [x] **2.9 Rework `agent-pre-merge-review.md` for tool-agnosticism**
    - Major rework: 621 → 226 lines (-64%). Restructured from CodeRabbit-centric to tool-agnostic core.
    - **Structural changes**: Decision framework defined once (was duplicated in Local + PR modes).
      Tool-specific details (CodeRabbit CLI, classification terms, temp file workflow, platform quirks)
      extracted to dedicated "Tool-Specific Notes" section with subsections per tool. Core workflow
      now uses generic language ("Run your review tool's local analysis command").
    - **Condensing**: Collapsed 5 Common Patterns → 3 (cut redundant fix examples, kept one per
      disposition type). Merged Tips + Anti-Patterns into single lean Anti-Patterns list (was two
      mirrored lists + verbose tips restating main workflow). Cut Example Sessions (55 lines — useful
      but duplicated the workflow steps). Cut "Two-Pass Strategy Benefits" (restated overview).
      Cut reply format templates (covered by Tool-Specific Notes + brief guidelines).
    - **PRD req 33**: Metrics table reframed as "Illustrative Metrics" with explicit disclaimer
      ("illustrative estimates, not measured benchmarks"). Table simplified to show the pattern.
    - Removed version/changelog footer.
    - Lint: zero violations.

- [x] **2.10 Run quality gate on Phase 2 files**
    - Ran `markdownlint-cli2 --no-globs` on all 5 modified supplemental workflow files + internal
      session-init: zero violations across all files
    - Task list excluded by config ignore pattern (`.arc-internal/active/**`) — by design,
      active task lists are working documents exempt from linting

### **Phase 3:** Strategy & Reference Agnosticism & Quality

**Goal:** Extend agnosticism corrections to strategy documents and reference files, with a general quality pass
(fresh-adopter read-through, streamlining redundant/stale content, tightening prose). Heavyweight
strategy-task-list-formatting defers streamlining to Phase 5. Includes document audience clarity work (A3).

- [x] **3.1 Audit and fix `strategy-work-organization.md`**
    - Agnosticism + quality pass: 1257 → 585 lines (-53%)
    - **Agnosticism**: Technical work examples diversified from web-app-specific (Redux→Zustand, Vite,
      bundle analysis) to project-neutral (CI/CD, test framework migration, monolith decomposition).
      Edge cases de-fronted (toast notifications → generic). CodeRabbit commands removed from Code
      Review section (tool-agnostic with pointer to agent-pre-merge-review.md). "MovieService"
      CineXplorer leak fixed in branch workflow example. Branch naming examples diversified. "Solo
      developer" → "Pragmatic Workflow" in Core Principles.
    - **Quality/condensing**: Removed version history + footer. Cut Implementation Examples section
      (118 lines duplicating Decision Examples + Git Workflow). Cut Historical Note (27 lines of
      framework-instance content irrelevant to adopters). Removed duplicated Branch Naming Conventions
      in Git Workflow (already in Our Solution). Core Principles condensed from verbose justification
      blocks to lean single-paragraph principles. Incidental sub-category formatted lists merged into
      Work Categories inline. Migration Guide "Updating Documentation" literal markdown removed
      (prescriptive, will go stale). Anti-Patterns condensed (5 → 4, removed redundant file naming
      pattern already covered by naming convention). Decision Examples converted to table format.
      Backlog Organization trimmed (File Purposes, Discovery Mechanism, Weekly Review subsections
      replaced with concise Key Design Points + pointer to weekly-review.md and ADR-014).
    - **B.3 structural observations**: Backlog Organization (still ~55 lines after trim) is
      essentially a separate strategy embedded here — confirmed for potential extraction. Incidental
      Work Model (~85 lines) straddles strategy and workflow. Document covers 5 distinct concerns
      (categorization, git workflow, directory structure, incidental model, backlog organization).

- [x] **3.2 Audit and fix `strategy-adr-methodology.md`**
    - Agnosticism + quality pass: 333 → 273 lines (-18%)
    - **Agnosticism**: De-instanced all CineXplorer/TMDB examples (~8 occurrences) — title examples,
      constraint examples, naming examples, deprecated example, relationship pattern example all
      replaced with project-neutral alternatives (REST/GraphQL, rate limiting, event-driven
      notifications). Strategy path fixed (was `strategy-*.md`, now `.arc/reference/strategies/`).
    - **Quality/dedup**: Replaced 60-line inline template (verbatim copy of `adr-template.md`) with
      2-line pointer to the template file (PRD req 34 — single source of truth). Version header
      removed per pattern. "Example ADR" reference to CineXplorer-specific ADR file replaced with
      pointer to `adr-template.md`.
    - Structure and guidance preserved — doc was already well-scoped and well-structured per notes
      evaluation. No prose tightening needed beyond the template deduplication.

- [x] **3.3 Audit and fix `strategy-task-list-formatting.md`** (agnosticism + first-pass streamlining)
    - Agnosticism + streamlining: 1520 → 1176 lines (-23%)
    - **De-instanced**: All CineXplorer/TMDB references (~15 occurrences) — `MovieCard`, `MovieDetail`,
      `MovieGrid`, `useMovieFetchRouter`, `MovieCollectionGrid`, `useMovieCollectionState`,
      `showAdvanced`, `next_tmdb_page_start`, movie-themed task/branch names, filter-integration
      branches, pagination-buffer-tracking, discover-endpoint-consolidation
    - **Diversified examples**: Complete Annotated Example replaced (web frontend → project-neutral
      config validation). Incidental examples replaced (CineXplorer → CLI tool, API versioning).
      Letter numbering examples replaced (React component audit → generic module audit). Decision
      guideline examples replaced (MovieCard/MovieCollectionGrid → SearchHandler/DataGrid)
    - **Streamlined**: Common Mistakes condensed from ~170 lines (8 verbose ✅/❌ examples) to ~14-line
      compact list with cross-reference to Format Elements (which already has the examples). Test-First
      Pattern 3 (65-line full-stack example) replaced with 5-line "apply per layer" guidance. Decision
      Guidelines trimmed — removed examples duplicating Format Elements, kept unique decision criteria
      (subtask granularity, single-subtask anti-pattern, when-to-use rules)
    - **Also fixed**: Removed phantom `strategy-testing-methodology.md` reference (file doesn't exist).
      Version header removed per pattern
    - Phase 5 Task 5.3 can do deeper tightening from 1176-line baseline

- [x] **3.4 Audit and fix `strategy-quality-gates.md`**
    - Light touch as expected: 248 → 245 lines. Structure and philosophy already excellent.
    - **Agnosticism**: E2E checkpoint guidance generalized — React-specific language (context
      providers, hooks, components, browser matrix) replaced with project-neutral framing (request
      handlers, middleware, shared utilities, dependency injection). Example commands diversified
      from npm/Playwright-only to include pytest patterns alongside. Task list integration example
      replaced (TopBar/FooterBar layout → API auth endpoint/rate limiting). "All browsers/viewports"
      generalized to "all configurations" throughout.
    - **Terminology**: Reframed tier triggers from task-structure-based (subtask/parent) to
      scope-based (per-task / coherent unit). Tier 1 "Per-Subtask" → "Per-Task" (any checkbox).
      Tier 2 "Parent Task Completion" → "Coherent Unit Completion" (all subtasks of parent done,
      OR standalone task touching integration-relevant code). Resolves ambiguity where standalone
      tasks (no subtasks) had no clear tier mapping.
    - **Quality**: Version footer removed. Trailing horizontal rule cleaned up. Minor grammar fix.
    - **Note**: `3_process-task-loop.md` lines 50-51 still use parent/sub framing for Tier 2
      trigger — needs alignment with this reframing (minor addition, not blocking).

- [x] **3.5 Fix `STRATEGY-INDEX.md` phantom references**
    - Reframed: 51 → 48 lines. Section order swapped (ARC first, Project second) so adopters see
      what ships before what they create.
    - **Phantom references fixed** (PRD req 17): Project strategy section now explicitly states
      "illustrations — these files don't exist until you create them." Removed the implicit
      suggestion that these files should be present.
    - **ARC strategies verified**: All 4 listed strategies exist. Quality gates description updated
      to "integration checkpoints" (aligning with Tier 2 reframing from Task 3.4).
    - **Fresh-adopter clarity**: Location line now explains the two directories ("ships with ARC"
      vs "you create these"). Pointer to `project/README.md` for creation guidance. Removed
      phantom "semantic-tokens" reference from Usage Protocol. Simplified grep instruction to
      general "search for the specific topic" guidance.
    - Dropped `project/style/strategy-layout-tokens.md` example (3 style examples → 2, reducing
      web-frontend-heavy impression). Dropped "Process:" sub-header from ARC section (unnecessary
      — all ARC strategies are process strategies).

- [x] **3.6 Evaluate and fix `agent/README.md`**
    - 183 → 201 lines. External research confirmed AGENTS.md is now a Linux Foundation standard
      (60k+ projects, co-founded by Google/Cursor/Windsurf). Major architecture section rework:
      "Why AGENTS.md as Hub" explains format choice (industry standard) and ARC-managed loading
      (session-init, not tool auto-discovery from this directory). New "File Placement" subsection
      explains containment rationale (no conflict with existing configs, controlled load order,
      layering possible for outside-ARC config). Explicit answer to "why tool-specific files for
      tools that read AGENTS.md natively?" (model quirks don't belong in shared context).
      Migration-from-AI-SHARED removed (stale — PRD req 32). Fixed stale path reference
      (`ai-instructions/` → `agent/`). "Adding Files for Other Tools" extensibility section added.
      Design Principles rewritten (5 → 6, now reflecting ARC-managed loading model). "tips" →
      "guidance" throughout. Version footer removed.
    - **B.3 observation**: File placement is now documented but onboarding docs should cover it
      too — first-time adopters need to understand that ARC manages loading via session-init
      rather than relying on tool auto-discovery.

- [x] **3.7 Update `.arc/README.md` with audience clarity**
    - Full rework: 93 → 55 lines. Cut Getting Started (belongs in repo README), Usage Patterns
      (restated directory tree), Framework Integration (stale, wrong repo link, unnecessary).
      Kept: directory tree (updated, accurate), document audience table (3 categories:
      agent-executed / shared context / human-facing — PRD req 9), pointer to repo README with
      TODO comment for future getting-started link.
    - Added `**Audience:**` one-liner to all 14 workflow files (PRD req 8): 4 core workflows
      (define-constitution, create-prd, generate-tasks as "collaborative"; process-task-loop as
      "agent-executed") + 10 supplementals (session-init/handoff, atomic-commit, archive,
      maintain-docs, maintain-task-notes, agent-pre-merge-review as "agent-executed";
      manage-incidental-work as "shared context"; activate-work-unit as "collaborative";
      weekly-review as "human-driven"). atomic-commit `**Note:**` replaced with `**Audience:**`
      that preserves the "never without approval" constraint.

- [x] **3.8 Audit remaining `.arc/reference/` files for agent-specific content**
    - Verification pass complete. Grepped all `.arc/reference/` files (excluding `agent/`) for
      agent-specific terms (Claude, Gemini, Copilot, GPT, Cursor, Windsurf, TodoWrite, CLAUDE.md,
      etc.). All hits are appropriate: process-task-loop uses Claude Code as one example with
      "or similar" framing (Phase 1 fix); agent-pre-merge-review has tool-specific notes as a
      clearly separated appendix (correct pattern); DEVELOPMENT-RULES and session-init reference
      agent file paths as navigation (not embedding content). No leakage found — Phases 1-3
      caught everything.

- [x] **3.9 Run quality gate on Phase 3 files**
    - Linted all 16 modified `.arc/` files (1 README, 1 agent/README, 4 core workflows,
      10 supplemental workflows). Zero violations.

### **Phase 4:** Template Standardization

**Goal:** Standardize all `.example.md` constitution templates to the structure + guidance + tokens approach. Fix template
alignment issues.

- [x] **4.1 Rework `META-PRD.example.md`**
    - 78 → 82 lines. All 7 sections preserved, CineXplorer content replaced with structure +
      guidance + tokens. Each section now has: heading (framework-owned), 1-2 line guidance
      explaining what goes there (framework-owned), tokens for user content (user-owned, on
      separate lines for merge-friendliness). Added intro paragraph explaining META-PRD purpose
      and relationship to work-level PRDs. HTML comments for optional context: feature group
      scaling guidance, non-UI project adaptation for User Flow, technical requirement category
      customization, data sources section optionality. Replaced stale italic instruction with
      proper intro.

- [x] **4.2 Rework `TECHNICAL-OVERVIEW.example.md`**
    - 173 → 79 lines. All CineXplorer content replaced. Restructured from web-app-specific
      sections (Backend/Frontend/Shared Code/Service Layer) to project-type-agnostic pattern:
      Overview, Architecture Components (repeatable subsection template with framework/language/
      libraries/style/directory tokens), Infrastructure, Testing Infrastructure. HTML comments
      provide adaptation examples for different project types (web app, CLI, library, monorepo).
      Each component subsection shows the expected level of detail via token structure. Intro
      updated to explain document purpose (AI agents reference this during implementation).

- [x] **4.3 Rework `PROJECT-STATUS.example.md` + enhance `ROADMAP.example.md`**
    - PROJECT-STATUS: 246 → 54 lines. All CineXplorer content replaced with structure + guidance +
      tokens. Removed: Roadmap section (duplicated ROADMAP.md's role), Current Priorities section
      (direction belongs in ROADMAP; Status Snapshot's "Next Priority" sufficient for state),
      Development Approach section (meta-ARC content), Table of Contents. Completed Major Work
      restructured as repeatable token pattern. Two sections remain: Status Snapshot (state) +
      Completed Major Work (record).
    - ROADMAP: 86 → 102 lines. Already well-templated — enhanced with dual-audience intro paragraph,
      HTML comments for adaptation guidance on each section (phase organization, dependency analysis
      optionality, scoping decisions rationale, open questions lifecycle). No structural changes.
    - Role distinction sharpened via mirrored intro framing: PROJECT-STATUS = "state and record"
      (cross-refs ROADMAP for "planning and reasoning"), ROADMAP = "planning and reasoning"
      (cross-refs PROJECT-STATUS for "state and record"). Same vocabulary, reversed.
    - Template structure verified against activate-work-unit.md Steps 5-6 and archive-completed.md.
    - ROADMAP.example.md touched here; Task 4.7 scope for that file reduces to verification-only.
    - **B.3 observation**: `0_define-constitution.md` only covers PROJECT-STATUS setup, not
      ROADMAP — "project bootstrap" workflow should cover both.

- [x] **4.4 Verify and fix `DEVELOPMENT-RULES.example.md`**
    - 374 → 361 lines. Structure preserved, surgical fixes throughout.
    - Frontend/backend-specific sections replaced with token-based architecture rules +
      HTML comment showing project-type examples (web app, CLI, library, monorepo) (PRD req 13)
    - Full Suite quality gates: 6 hardcoded backend/frontend items → generic token-based
      checks with HTML comment for stack adaptation
    - Collaborative voice rule added to Code Documentation Standards with concrete examples:
      ❌ "The user approved" / ✅ "Approved after review" (PRD req 27)
    - Phantom strategy references removed: `strategy-testing-methodology.md`,
      `strategy-type-safety.md`, `strategy-component-styling.md`, `strategy-color-tokens.md`
      replaced with STRATEGY-INDEX pointers and conditional framing (PRD req 18)
    - Agent-tool-specific `commit-format` skill reference → generic atomic-commit workflow link
    - Project-specific items generalized: TypeScript re-check trigger removed from Core
      Document Reference Protocol, "Django models" → "data models or schemas" in Test-First
    - Reference Documentation section: phantom project strategies replaced with STRATEGY-INDEX

- [x] **4.5 Align `CURRENT-SESSION.example.md` with handoff workflow**
    - Rewrote template to match `session-handoff.md` field structure exactly (PRD req 15):
      Branch, Task List, Following Task List, Current Task (with line number), Last Completed,
      Next Action, Completed This Session, Blockers, Additional Context for Next Session
    - Removed non-handoff fields: Feature Documents, Work Type, Current Work Summary, In Progress,
      Outstanding Questions, Notes for Next Session subsections (Key Context, Recent Insights, Next Steps)
    - HTML comments provide guidance for field alternatives (template standardization pattern)
    - "Remaining Work Before Returning to Task List" omitted as permanent section — off-task-list-only
      format provided by the handoff workflow when needed

- [x] **4.6 Fix `completion-sample.example.md`**
    - Replaced stub (9-line YAML-fronted placeholder) with full template matching `archive-completed.md`
      workflow template exactly (PRD req 16): header metadata (Completed, Branch, Category, Context),
      Summary, Key Deliverables, Implementation Highlights, Related Documentation, Incidental Work
      Completed (conditional), Follow-Up Work
    - Removed non-standard YAML frontmatter (role/do_not_copy/template_note)
    - HTML comments provide section guidance; conditional sections noted for planned-work-only use

- [x] **4.7 Audit and fix remaining `.example.md` files**
    - Full content pass on each file: agnosticism, template standardization (structure + guidance +
      tokens), cross-cutting lenses (fresh-adopter read-through, agent-perspective pass for agent
      files, philosophy alignment, distribution awareness, B.3 structural observations, collaborative
      voice, deduplication, version footer removal)
    - ROADMAP.example.md already done in 4.3 — excluded here

    - [x] **4.7.1 `AGENTS.example.md`** — agnosticism rework (67 → 75 lines)
        - Technology Stack: repeatable `{{Component}}` tokens with HTML comments for project-type
          adaptation (web app, CLI, library examples)
        - Repository Layout: generic `{{src_dir}}/`, `{{test_dir}}/` tokens
        - Critical Path: generic friction point tokens with HTML comment examples
        - "Respect layered architecture" moved to HTML comment as project-specific example
        - "Verify before asserting" tool references made agent-agnostic
        - "Source of truth" line removed (artifact, no agent value)
        - Backticks added to all `.md` file references per convention

    - [x] **4.7.2 `CLAUDE.example.md`** — agnosticism fixes (140 → 136 lines)
        - Removed version numbers from doc references (v2.7, v1.1)
        - Session startup: "Docker status, venv availability" → "runtime environment, tool availability";
          corrected reference from CURRENT-SESSION.md → `session-init.md`
        - Removed "Tooling awareness: Docker and venv" bullet (project-specific, belongs in AGENTS.md)
        - MCP section: Playwright example → tokens with HTML comment guidance
        - Sub-Agent section: hardcoded external-research-analyst → tokens with HTML comment guidance
        - Quality gate items in autonomous mode: added "(if applicable)" qualifiers
        - Hyphens standardized to em dashes for consistency with other templates
        - Autonomous work framing untouched (Task 5.4 scope)

    - [x] **4.7.3 `GEMINI.example.md`, `WARP.example.md`, `copilot-instructions.example.md`**
        - GEMINI (16 → 16 lines): removed version refs, "Use Gemini CLI" reframed as capability
          description not tool-specific instruction, "Claude/Copilot" → "other agents"
        - WARP (19 → 16 lines): removed Docker-centric content ("exec into containers",
          PowerShell Docker commands, Docker env checks), replaced with generic tooling guidance,
          removed version refs
        - copilot-instructions (18 → 17 lines): removed Docker-first commands and Backend/Frontend
          framework tokens, replaced with QUICK-REFERENCE/STRATEGY-INDEX pointers, removed version refs

    - [x] **4.7.4 `QUICK-REFERENCE.example.md`** — major agnosticism restructure (259 → 190 lines)
        - Removed Docker Operations section (project-specific, not universal)
        - Removed Network Architecture & Ports section (web-app-specific)
        - Removed backend-specific Python/Pyright and frontend-specific TypeScript/npm sections
        - Command Patterns grouped by concern (Linting, Type Checking, Testing, Markdown Linting)
          not by technology — adaptable to any stack
        - HTML comments provide adaptation guidance and optional section markers
        - Quality Gate Commands aligned with strategy-quality-gates tiered approach: organized
          by Tier 1 (incremental, per-task) and Tier 3 (full suite, per-phase/pre-PR), with
          pointer to strategy doc; removed incorrect "run before any commit" framing
        - Anti-Patterns genericized (removed Docker Assumptions), added HTML comment examples
        - Version header removed

    - [x] **4.7.5 `ATOMIC-TASKS.example.md`, `TASK-INBOX.example.md`** — verified clean
        - ATOMIC-TASKS: no changes needed — tokens used well, no project-type bias, clear instructions
        - TASK-INBOX: one HTML comment example fix ("on {{page}}" → "in {{component}}")

    - [x] **4.7.6 `BACKLOG-FEATURE.example.md`, `BACKLOG-TECHNICAL.example.md`** — verified clean
        - No changes needed — both use clean token/category structure, no project-type bias
        - FEATURE uses token categories (project-dependent); TECHNICAL uses concrete universal
          categories (Infrastructure, Code Quality, Testing & Quality, Developer Experience) —
          distinction is appropriate

- [x] **4.8 Run quality gate on Phase 4 files**
    - Linted all 11 modified/verified `.example.md` files plus completion-sample. Zero violations.
    - Files checked: CURRENT-SESSION, AGENTS, CLAUDE, GEMINI, WARP, copilot-instructions,
      QUICK-REFERENCE, TASK-INBOX, ATOMIC-TASKS, BACKLOG-FEATURE, BACKLOG-TECHNICAL,
      completion-sample (archive-excluded, verified separately)
    - Also linted: agent/README.md, session-init.md (both versions) — zero violations

    **Additional fixes during Phase 4 review:**
    - `agent/README.md`: TECHNICAL-ARCHITECTURE → TECHNICAL-OVERVIEW reference fix
    - `session-init.md` (both `.arc/` and `.arc-internal/`): resequenced reading order from
      general → specific (project identity → agent file → constitutional → process → active work);
      added section headers for the three disclosure layers
    - Quality gate alignment: QUICK-REFERENCE.example.md quality gate section organized by tier
      to match strategy-quality-gates.md

### **Phase 5:** Streamline Heavyweight Documentation

**Goal:** Front-load essential guidance in the three longest process documents. Within-document changes only — tighten
prose, reorder sections, consolidate examples. Note structural opportunities for B.3.

_Principle: A reader who stops at 60% should have everything they need for normal use._

- [ ] **5.1 Streamline `atomic-commit.md` (~430 lines)**
    - Evaluate whether all 6 pre-commit analysis steps are still necessary given session-boundary improvements
    - Consider reducing ceremony for simple cases (e.g., atomic tasks, single-file fixes) while preserving full
      protocol for complex multi-session commits
    - Front-load the essential commit workflow; move accumulated edge cases and safeguards later
    - Consolidate examples where multiple examples serve the same point
    - **Calibration point:** This is the first streamlining task. Get user feedback on the approach and depth of
      trimming before applying the same lens to 5.2 and 5.3.

- [ ] **5.2 Streamline `maintain-task-notes.md` (~860 lines)**
    - Keep the two-mode structure (mid-work vs archival) — it's sound
    - Tighten lessons-learned and common-pitfalls sections: keep the guidance, trim the "how we learned this"
    - Front-load essential guidance for each mode
    - Simplify pointer directionality section if possible without losing correctness
    - Apply calibrated approach from 5.1 feedback

- [ ] **5.3 Streamline `strategy-task-list-formatting.md` (~1520 lines)**
    - Quick Format Checklist is already well-positioned at top — preserve this
    - Tighten extensive edge cases and detailed rule explanations
    - Consolidate or reduce examples where multiple examples illustrate the same point
    - Consider whether Emoji Usage policy section is proportionate for a framework doc
    - Apply calibrated approach from 5.1/5.2 feedback

- [ ] **5.4 Clarify autonomous work mode framing**
    - Update `CLAUDE.example.md` autonomous work mode section to frame as a bounded exception within the
      tight-coupling philosophy, not a separate operating mode (PRD req 23)
    - Check other agent example files (GEMINI, WARP, copilot-instructions) for similar framing needs

- [ ] **5.5 Run quality gate on Phase 5 files**
    - `npx --yes markdownlint-cli2 --no-globs` on all modified files
    - Verify zero violations

### **Phase 6:** Content Fixes & Wrap-Up

**Goal:** Address remaining content fixes (co-development docs, auto-compact prohibition, miscellaneous), capture
structural observations, and verify overall pass completeness.

- [ ] **6.1 Document co-development and parallel work**
    - Add guidance in agent-facing docs (AGENTS.example.md and/or process-task-loop) that the developer may be making
      changes in parallel — unexpected diffs are normal, not anomalies to flag (PRD req 24)
    - Acknowledge co-development in process docs as part of the workflow, not an exception (PRD req 25)
    - Connect to "staying connected to the codebase" philosophy (PRD req 26)

- [ ] **6.2 Document auto-compact prohibition in agent templates**
    - Add auto-compact/context-summarization prohibition to CLAUDE.example.md with rationale (PRD req 35)
    - Check GEMINI.example.md, WARP.example.md, copilot-instructions.example.md for equivalent guidance
    - Rationale: sessions must end with explicit handoff, not context degradation that loses constitutional
      information loaded at session-init

- [ ] **6.3 Sweep remaining D2 specific fixes**
    - Verify all PRD D2 items (reqs 27-34) have been addressed — many will have been caught during Phases 1-5
      when editing the relevant files
    - Fix any items that weren't naturally caught during earlier phases
    - This is a verification/cleanup sweep, not a fresh pass

- [ ] **6.4 Capture structural observations for B.3**
    - Compile structural observations noted during Phases 1-5 into a summary
    - Include: files that should potentially be split, sections that belong elsewhere, mixed-concern findings,
      between-document restructuring opportunities
    - Save as a reference note for the B.3 structural analysis pass
    - Location: `.arc-internal/active/notes-structural-observations-from-refinement.md` or similar

- [ ] **6.5 Final quality gate — full lint pass**
    - Run `npx --yes markdownlint-cli2 "**/*.md"` (full project) to catch any issues across all files
    - Verify zero violations

---

## Success Criteria

- [ ] All `.arc/reference/` workflow and strategy docs free of project-type-specific assumptions (or use conditional
  framing)
- [ ] No agent-specific content in framework-generic documents
- [ ] All `.example.md` constitution templates follow structure + guidance + tokens approach
- [ ] `CURRENT-SESSION.example.md` aligns with `session-handoff.md` expectations
- [ ] All D2 specific content fixes addressed
- [ ] Heavyweight docs have essential guidance front-loaded (60% threshold)
- [ ] Auto-compact prohibition documented in agent template files
- [ ] All modified files pass markdown linting with zero violations
- [ ] Structural observations captured for B.3
