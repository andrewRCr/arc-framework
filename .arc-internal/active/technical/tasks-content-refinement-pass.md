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

### **Phase 2:** Supplemental Workflow Agnosticism

**Goal:** Extend agnosticism corrections to supplemental workflows. Includes the potentially substantial
agent-pre-merge-review rework.

- [ ] **2.1 Audit and fix `session-init.md`**
    - Check for project-type assumptions (Docker checks, venv, service verification)
    - Ensure environment verification examples span project types, not just containerized web apps
    - Add note about auto-compact prohibition assumption (PRD req 36): sessions end with handoff, not compaction

- [ ] **2.2 Audit and fix `session-handoff.md`**
    - Check for project-type assumptions in examples
    - Verify handoff examples are generalizable (current examples are CineXplorer-flavored per evaluation)
    - Ensure field descriptions work for any project type

- [ ] **2.3 Audit and fix `atomic-commit.md`** (agnosticism only — streamlining in Phase 5)
    - Check for project-type assumptions in commit examples and analysis steps
    - Verify Context footer examples span project types
    - Note: full streamlining deferred to Phase 5; this pass focuses only on agnosticism

- [ ] **2.4 Audit and fix `activate-work-unit.md`**
    - Replace `git add -A` with specific file staging (PRD req 28)
    - Check for other project-type assumptions

- [ ] **2.5 Audit and fix `manage-incidental-work.md`**
    - Fix double horizontal rule at line ~306-307 (PRD req 29)
    - Check for project-type assumptions in examples and decision criteria

- [ ] **2.6 Audit and fix `weekly-review.md`**
    - Check for project-type assumptions
    - This doc is already well-scoped (~170 lines) — likely minimal changes needed

- [ ] **2.7 Audit and fix `maintain-task-notes.md`** (agnosticism only — streamlining in Phase 5)
    - Check for project-type assumptions
    - Note: full streamlining deferred to Phase 5

- [ ] **2.8 Audit and fix `archive-completed.md`**
    - Check for project-type assumptions
    - Verify "Generated Code Sync Check" section is generalizable or conditionally framed

- [ ] **2.9 Rework `agent-pre-merge-review.md` for tool-agnosticism**
    - Rework from CodeRabbit-specific to tool-agnostic core (PRD req 6)
    - Separate agent-specific details (CodeRabbit CLI commands, reply formats, classification terms) from the
      generalizable two-pass review strategy
    - Add "illustrative, not measured" clarification to metrics table (PRD req 33)
    - Note: this may be substantial. If scope exceeds a single subtask, split into sub-steps and report.

- [ ] **2.10 Run quality gate on Phase 2 files**
    - `npx --yes markdownlint-cli2 --no-globs` on all modified supplemental workflow files
    - Verify zero violations

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
