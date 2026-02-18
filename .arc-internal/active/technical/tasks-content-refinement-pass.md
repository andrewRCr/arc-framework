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

### **Phase 3:** Strategy & Reference Agnosticism

**Goal:** Complete agnosticism corrections across strategy documents, STRATEGY-INDEX, agent README, and .arc/README.
Includes document audience clarity work (A3).

- [ ] **3.1 Audit and fix `strategy-work-organization.md`**
    - Check for project-type assumptions (feature branches with PRs, Docker, etc.)
    - Verify decision tree and examples work for non-web-app projects
    - Note any structural observations (evaluation flagged backlog section as potentially separate concern)

- [ ] **3.2 Audit and fix `strategy-adr-methodology.md`**
    - Check for project-type assumptions
    - Resolve minor redundancy between template section and `adr-template.md` (PRD req 34)

- [ ] **3.3 Audit and fix `strategy-task-list-formatting.md`** (agnosticism only — streamlining in Phase 5)
    - Check for project-type assumptions in examples
    - Verify examples span project types
    - Note: full streamlining deferred to Phase 5

- [ ] **3.4 Audit and fix `strategy-quality-gates.md`**
    - Check for project-type assumptions in tier examples
    - Ensure quality gate examples aren't exclusively web-app-focused (lint/type-check/E2E pattern)
    - Add conditional framing where tiers reference project-type-specific tooling

- [ ] **3.5 Fix `STRATEGY-INDEX.md` phantom references**
    - Reframe project strategy section to clearly indicate these are examples of strategies adopters might create,
      not files that should exist (PRD req 17)
    - Verify ARC strategies section is accurate

- [ ] **3.6 Evaluate and fix `agent/README.md`**
    - Evaluate migration-from-AI-SHARED section — remove or minimize if stale for new adopters (PRD req 32)
    - Check for project-type or agent-specific assumptions in adoption guidance

- [ ] **3.7 Update `.arc/README.md` with audience clarity**
    - Add document audience table (agent-executed / shared context / human-facing) using aspirational README as
      model (PRD req 9)
    - Ensure the README clearly communicates which docs are for whom
    - Add brief audience indicators to individual documents where helpful (PRD req 8) — light touch, one-line notes

- [ ] **3.8 Audit remaining `.arc/reference/` files for agent-specific content**
    - Sweep across any files not yet checked for agent-specific content leakage (PRD req 7)
    - This is a verification pass — confirm that Phases 1-3 caught everything

- [ ] **3.9 Run quality gate on Phase 3 files**
    - `npx --yes markdownlint-cli2 --no-globs` on all modified strategy and reference files
    - Verify zero violations

### **Phase 4:** Template Standardization

**Goal:** Standardize all `.example.md` constitution templates to the structure + guidance + tokens approach. Fix template
alignment issues.

- [ ] **4.1 Rework `META-PRD.example.md`**
    - Replace CineXplorer-specific body content with structure + inline guidance + tokens
    - Each section should explain what goes there and why it matters, with `{{TOKENS}}` for user-owned content
    - Preserve section structure (it's good) while replacing project-specific content with guidance
    - Keep merge-friendliness in mind: framework-owned guidance and user-owned content on separate lines

- [ ] **4.2 Rework `TECHNICAL-OVERVIEW.example.md`**
    - Same approach as 4.1 — remove hardcoded "CineXplorer" and all project-specific content
    - Replace with structure + guidance + tokens showing what level of detail is expected
    - The structure IS good; the content examples just need to be guidance rather than one project's specifics

- [ ] **4.3 Rework `PROJECT-STATUS.example.md`**
    - Same approach — replace 130+ lines of CineXplorer completion history with representative structure
    - Show what a mature status doc looks like using tokens and guidance, not one project's history
    - Keep the section structure (table of contents, roadmap, completed work) as guidance

- [ ] **4.4 Verify and fix `DEVELOPMENT-RULES.example.md`**
    - Already well-templated — verify token approach is consistent
    - Add conditional framing for frontend-specific sections (Component Styling Standards, Import Standards) so
      non-frontend projects know these are optional (PRD req 13)
    - Add concrete example to "collaborative voice" rule (PRD req 27)
    - Check for phantom strategy references and add clarifying framing (PRD req 18)

- [ ] **4.5 Align `CURRENT-SESSION.example.md` with handoff workflow**
    - Update fields to match `session-handoff.md` expectations (PRD req 15):
      "Following Task List", "Current Task" (with line number), structured completion tracking,
      "Additional Context for Next Session"
    - Ensure template is immediately usable with the handoff workflow without translation

- [ ] **4.6 Fix `completion-sample.example.md`**
    - Replace with a proper sample matching the template described in `archive-completed.md` workflow (PRD req 16)
    - Remove non-standard YAML frontmatter (role/do_not_copy pattern used nowhere else)
    - Include Summary, Key Deliverables, Implementation Highlights, Related Documentation, Follow-Up Work sections

- [ ] **4.7 Verify remaining `.example.md` files**
    - Check AGENTS.example.md, CLAUDE.example.md, GEMINI.example.md, WARP.example.md,
      copilot-instructions.example.md — verify they follow consistent template approach (PRD req 14)
    - Check ATOMIC-TASKS.example.md, ROADMAP.example.md, TASK-INBOX.example.md,
      BACKLOG-FEATURE.example.md, BACKLOG-TECHNICAL.example.md
    - Check QUICK-REFERENCE.example.md
    - Fix any inconsistencies found; report if all are already consistent

- [ ] **4.8 Run quality gate on Phase 4 files**
    - `npx --yes markdownlint-cli2 --no-globs` on all modified template files
    - Verify zero violations

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
