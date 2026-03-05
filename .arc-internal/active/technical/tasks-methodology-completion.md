# Task List: Methodology Completion

**PRD:** `.arc-internal/active/technical/prd-methodology-completion.md`
**Created:** 2026-02-26
**Branch(es):** `technical/methodology-completion`
**Base Branch:** `main`
**Status:** In Progress

## Overview

**Purpose:** Implement all WU1/WU1.5 design decisions across ARC methodology documentation —
creating new infrastructure files, restructuring core documents, and updating existing docs to
reflect resolved architectural decisions.

## Scope

### Will Do

- Apply cosmetic fixes and coupling language corrections from audits
- Restructure core documents per context loading architecture (DEV-RULES split)
- Overhaul session workflows (bootstrap, task references, mismatch recovery, staleness)
- Build hook configurability and customization infrastructure (config, extensions, methods)
- Apply ADR-008 Core/PM decomposition — extract PM steps to extension points, remove
  TASK-INBOX and weekly-review from framework, fix team template errors
- Add team mode awareness across workflow documentation
- Close all convention and workflow gaps from methodology audit
- Create guidance discovery infrastructure (WORKFLOW-INDEX, STRATEGY-INDEX enrichment)
- Document naming conventions and audit strategy configurability

### Won't Do

- Structural validation pass (WU2b — runs after this work lands)
- CLI tooling (WU3)
- Public documentation site content (WU4)
- Self-testing for configuration combinations

---

## Tasks

### **Phase 1:** Quick Fixes and Language Corrections

**Purpose:** Clear noise from subsequent reviews with targeted edits to existing files.

- [x] **1.1 Apply cosmetic template fixes**

    Resolved three audit findings in template files.

    - [x] **1.1.a Update `strategy-task-list-formatting.md` incidental Branch field**
        - Changed `**Branch:**` to `**Branch(es):**` in incidental header template and example
        - Updated rules to add "additional branches comma-separated" note matching feature/technical

    - [x] **1.1.b Add team mode comment to `CURRENT-SESSION.template.md`**
        - Added HTML comment before Session Startup Protocol referencing team mode path and
          `strategy-team-coordination.md`

    - [x] **1.1.c Add per-pair qualification to `AGENTS.template.md`**
        - Appended "(per developer-agent pair in team mode)" to one-task-at-a-time principle

- [x] **1.2 Adjust convention scope**

    - [x] **1.2.a Clarify reference-style link convention scope**
        - Softened from requirement to recommendation in `strategy-development-methodology.md`:
          "Use" → "Prefer". Aligns with ADR-003 file-customizable classification.

    - [x] **1.2.b Relax emoji prohibition in task planning**
        - Changed from "Never" to "Discouraged" in `strategy-task-list-formatting.md`;
          policy line updated to match

- [x] **1.3 Fix multi-branch coupling language**

    Replaced 1:1 branch-to-task-list language with many-to-one model across four files.

    - [x] **1.3.a Fix `process-task-loop.md` coupling language**
        - Replaced "branch exists ↔ task list active" with many-to-one model (stacked PRs,
          team sub-branches, phased delivery). Archive trigger: all tasks complete.

    - [x] **1.3.b Fix `atomic-commit.md` blanket incidental statement**
        - Replaced blanket "no separate branches" with nuanced guidance: minor fixes on
          current branch, larger work may use `incidental/<name>`. Added link to
          `manage-incidental-work.md`.

    - [x] **1.3.c Fix `manage-incidental-work.md` coupling language**
        - Fixed both instances: conventions section and archival reference. Both now say
          "archive when all tasks complete" with link to `archive-completed.md`.

    - [x] **1.3.d Fix `work-organization.md` lifecycle inconsistency**
        - Clarified lifecycle step 12 trigger ("all tasks complete") and added parenthetical
          noting 1:1 coincidence with branch deletion for typical incidental work.

- [x] **1.4 Run Tier 1 quality gates on Phase 1 changes**
    - Full suite: 122 files, 0 errors

### **Phase 2:** Multi-Branch Workflows

**Purpose:** Create the rotate-branch workflow and complete multi-branch documentation.

- [x] **2.1 Create `rotate-branch.md` supplemental workflow**

    Created `.arc/system/workflows/arc/supplemental/rotate-branch.md` (139 lines) defining the
    Rotate operation in the three-operation model (Rotate → Complete → Archive).

    - Merge-focused scope: covers intermediate merges only (non-merge branch switching
      handled by session-handoff → session-init composition)
    - Sections: scenarios (stacked PRs, phased delivery, team sub-branches), 5-step
      procedure (verify → prepare → merge → next branch → update tracking)
    - Config-aware squash guidance: documents operational risk, recommends regular merge for
      intermediate PRs, references strategy-configurability-architecture for full rationale
    - Pre-PR quality gate: Tier 3 per quality gates strategy
    - All references to public `.arc/` docs only (no internal doc references)

- [x] **2.2 Add multi-branch archive guidance to `archive-completed.md`**

    Added two sections to `archive-completed.md`:

    - **Archive Timing area**: Three-operation model (Rotate → Complete → Archive) with
      one-line descriptions distinguishing each operation. Cross-references rotate-branch
      workflow.
    - **Phase 2→3 boundary**: Multi-branch verification gate — confirm all branches merged
      before proceeding with archival. Blockquote callout consistent with existing style.

- [x] **2.3 Port atomicity check to canonical `process-task-loop.md`**

    Already present. Atomicity check was added directly to the canonical
    `.arc/system/workflows/arc/3_process-task-loop.md` in `cfa0556` (WU1). No internal
    version ever existed. Language verified aligned with Commit Standards in
    `strategy-development-methodology.md` ("one logical concern" ↔ "one logical change").

- [x] **2.4 Add `Branch(es)` field update guidance**

    - `rotate-branch.md`: Already included in step 2 pre-merge checklist and step 5
      tracking update (done as part of 2.1)
    - `process-task-loop.md`: Added Branch(es) field update note and rotate-branch
      cross-reference to the branch/task list coupling bullet

- [x] **2.5 Run Tier 1 quality gates on Phase 2 changes**
    - Full suite: 123 files, 0 errors
    - Cross-references verified: all reference-style links in rotate-branch.md,
      archive-completed.md, and process-task-loop.md resolve to real files

### **Phase 3:** Core Document Restructure

**Purpose:** Split DEVELOPMENT-RULES, evaluate strategy-dev-methodology, and redesign
session-init — the structural heart of WU2.

**Strategies:** `strategy-file-classification.md`, `strategy-configurability-architecture.md`

- [x] **3.1 Create `DEV-RULES.ARC.md`**

    **Goal:** Extract always-applicable behavioral rules into a new framework-owned document.

    - [x] **3.1.a Extract rules from `strategy-development-methodology.md`**

        Created `.arc/reference/constitution/DEV-RULES.ARC.md` (253 lines, Framework
        classification). 15 distinct instructions across 5 domain sections + 1 trigger section.
        Key design decisions made during implementation:

        - Grouped by domain (Commit Discipline, Task Execution, Session Management, Verification
          and Discovery, Documentation Boundaries), not by flexibility level
        - `[configurable]` tag in headings for conventions with config/method override mechanisms;
          all other rules stated without tag
        - Configurable sections contain the **rule** and **pointer** only — not the default
          implementation. Defaults live in `arc-methods.md` where the override mechanism can
          replace them, preventing staleness when overrides are active
        - Documentation style conventions (collaborative voice, reference-style links) moved to
          DEV-RULES.PROJECT scope — they're project-level, overridden by editing the file
        - "No meta-project references in code" and "task references in .arc/ docs" stay in ARC
          as methodology boundary rules (P9), not style
        - strategy-development-methodology.md will be removed (decision: redistribute, not keep)
        - `arc-methods.md` must be scaffolded with `#commit-format`, `#commit-context-format`,
          `#leave-it-cleaner`, `#test-first` sections containing the full defaults that were
          extracted from this doc

    - [x] **3.1.b Add Tier 2a triggers**
        - Verified "When to Load Additional Guidance" section: 4 triggers cover on-demand loading
          (process-task-loop, atomic-commit, STRATEGY-INDEX, quality-gates). Session-handoff,
          rotate-branch, and blanket arc-methods.md considered and excluded (lifecycle workflow,
          discoverable via process-task-loop, and inline pointers more precise, respectively)
        - Flagged for 3.2: "Re-check core documents" subsection says "DEV-RULES" generically —
          needs post-split refinement to distinguish ARC vs PROJECT re-check triggers

- [x] **3.2 Rename and slim `DEVELOPMENT-RULES.md` to `DEV-RULES.PROJECT.md`**

    - [x] **3.2.a Rename and restructure**
        - Created `.arc/reference/constitution/DEV-RULES.PROJECT.md` (131 lines, zero lint errors)
        - Removed: commit standards, methodology content (now in DEV-RULES.ARC)
        - Retained: quality gates, testing requirements, code quality principles, file organization,
          architecture documentation / ADRs
        - Added Documentation Standards section: markdown quality (line length, linting) and
          documentation style (collaborative voice, reference-style links) as ARC defaults
        - Quality gate entries use generic examples with HTML comment guidance for customization
        - Header references DEV-RULES.ARC for methodology rules
        - Old `DEVELOPMENT-RULES.template.md` and `.arc-internal/` instance become obsolete (3.2.b)

    - [x] **3.2.b Update all references to `DEVELOPMENT-RULES.md`**
        - Deleted `.arc/reference/constitution/DEVELOPMENT-RULES.template.md` (replaced by DEV-RULES.PROJECT.md)
        - Kept `.arc-internal/reference/constitution/DEVELOPMENT-RULES.md` alive (internal split deferred
          until Phase 3 core restructure completes)
        - Updated 28 files across public `.arc/`, internal `.arc-internal/`, and root-level docs:
            - **Public agent templates**: CLAUDE, GEMINI, WARP, copilot-instructions, README — split
            reference into DEV-RULES.ARC + DEV-RULES.PROJECT
            - **Public workflows**: session-init (renumbered 3→10 for new split), 02_define-project,
            maintain-docs, maintain-task-notes
            - **Public strategies**: file-classification (inventory + counts updated), quality-gates,
            work-organization
            - **Public reference**: QUICK-REFERENCE.template.md
            - **Internal agent files** (transitional): added DEV-RULES.ARC reference, relabeled
            DEVELOPMENT-RULES as "Project quality standards" — CLAUDE, GEMINI, CODEX, WARP, copilot
            - **Internal docs**: session-init, QUICK-REFERENCE, README, TECHNICAL-OVERVIEW (directory
            trees), META-PRD
            - **Root**: README.md, README-ASPIRATIONAL.md, ADOPTION.md
            - **Other**: research-context-loading.md, documentation-reviewer agent, WU3/WU4 plan docs
        - Skipped: archive files (historical), strategy-development-methodology.md (3.3.b scope),
          PROJECT-STATUS.md milestone entries (historical), ADR-002 (immutable), task list/PRD
          (self-referential)
        - Zero lint errors after all changes

- [x] **3.3 Remove `strategy-development-methodology.md`**

    **Decision (made during 3.1.a):** Redistribute, not keep. After DEV-RULES.ARC extraction,
    the only substantive residual is configurable default content (commit format spec, footer
    patterns, leave-it-cleaner triage tree, test-first decision tree). These defaults belong
    in `arc-methods.md` where the override mechanism can replace them — not in a standalone
    strategy doc. A strategy with ~60 lines of reference content doesn't justify its Tier 1/2a
    loading cost.

    - [x] **3.3.a Scaffold `arc-methods.md` with extracted defaults**
        - Created `.arc/system/workflows/arc-methods.md` (190 lines, zero lint errors)
        - 7 methods using ADR-005 structure (Workflow/When/Contract/Default/Project Override):
          `#commit-format`, `#commit-context-format`, `#leave-it-cleaner`, `#test-first`,
          `#task-completion`, `#session-state`, `#quality-gate-commands`
        - Defaults extracted from strategy-development-methodology.md (commit format spec,
          footer patterns, severity triage tree, test-first decision tree)
        - `#session-state` uses current CURRENT-SESSION.md naming — updates with 3.4
        - `#quality-gate-commands` default points to DEV-RULES.PROJECT § Quality Gates
          (inherently project-specific, no universal ARC default command set)
        - No `.arc-internal/` references (public doc boundary respected)

    - [x] **3.3.b Remove `strategy-development-methodology.md`**
        - Deleted `.arc/reference/strategies/arc/strategy-development-methodology.md`
        - Removed entry from STRATEGY-INDEX.md and strategy-file-classification.md inventory
          (counts: Framework 38, total 60 — net zero after 3.2.b added DEV-RULES.ARC)
        - Updated 22 cross-references across the codebase, redirecting to appropriate targets:
            - **Commit format** refs → `DEV-RULES.ARC.md` § Commit format (atomic-commit.md,
              archive-completed.md, githooks/README.md, agent command files)
            - **Commit standards** refs → `DEV-RULES.ARC.md` § Commit Discipline
              (process-task-loop.md, manage-incidental-work.md)
            - **Test-first** refs → `DEV-RULES.ARC.md` § Test-first assessment
              (2_generate-tasks.md, strategy-task-list-formatting.md, copilot-instructions.template.md)
            - **Session context** refs → `DEV-RULES.ARC.md` § Session Management
              (CLAUDE.template.md, internal CLAUDE.md)
            - **Verification** refs → `DEV-RULES.ARC.md` § Verification and Discovery
              (AGENTS.template.md)
            - **Quality gate failure** refs → `DEV-RULES.ARC.md` (strategy-quality-gates.md)
            - **Documentation boundaries** refs → `DEV-RULES.ARC.md` (githooks/pre-commit)
            - **Link defs** updated: strategy-configurability-architecture, strategy-core-philosophy,
              strategy-team-coordination, internal DEVELOPMENT-RULES.md
        - Session-init loading sequences renumbered (items 5→9 in both public and internal)
        - Skipped: archive files (historical), task list/PRD (self-referential)
        - Zero lint errors (124 files)

- [x] **3.4 Reframe session model documentation**

    Added "Design context" paragraph to three session workflow files distinguishing
    P5 principle (context recoverability) from mechanism (structured document loading).

    - session-init.md (public + internal): Added principle/mechanism framing, positioned
      as optimized for ephemeral-context agents (CLI/IDE), referenced arc-methods.md
      § session-state override path
    - session-handoff.md: Updated Purpose to reference P5, added Design context paragraph
      with same ephemeral-context framing and override reference
    - All three files: added reference-style link definitions for arc-methods-session

- [x] **3.5 Redesign session-init loading sequence**

    Rewrote Step 2 loading sequence in both public and internal session-init files.

    - [x] **3.5.a Rewrite Step 2 (Load AI Context)**
        - New sequence (9 items): AGENTS.md → agent file → DEV-RULES.ARC → DEV-RULES.PROJECT →
          STRATEGY-INDEX → QUICK-REFERENCE → WORK-STATUS.md → SESSION.md → active task list
        - Removed process-task-loop from Tier 1 (already covered by DEV-RULES.ARC
          § When to Load Additional Guidance — no note needed in session-init)
        - CURRENT-SESSION.md → WORK-STATUS.md (item 7, tracked project state) + SESSION.md
          (item 8, gitignored personal context, READ IF EXISTS)
        - Updated all CURRENT-SESSION references in Steps 3 and 4 to WORK-STATUS
        - Changed orientation ending: "Awaiting direction." → "Awaiting direction —
          proceed to Next Action?" (reduces friction for common case)

    - [x] **3.5.b Add agent-switching awareness note**
        - Added to SESSION.md loading item (item 8): extract factual content, disregard
          agent-specific references when SESSION.md was written by a different agent

- [x] **3.6 Formalize Tier 2a trigger pattern across Tier 1 documents**

    Audited all 6 Tier 1 docs for ad-hoc Tier 2 cross-references (~17 found, 3 already
    well-formed). Changes:

    - STRATEGY-INDEX.md: Added "Consult when:" sub-item to all 10 strategy entries with
      explicit trigger conditions; updated maintenance note
    - DEV-RULES.ARC.md: Added `arc-methods.md` to "When to Load Additional Guidance"
      section (was referenced 4x inline but missing from the trigger index)
    - CLAUDE.md: Moved `process-task-loop` out of Tier 1 "defer to" list into a standalone
      trigger line ("Before starting task execution, load...")
    - No changes needed: AGENTS.md (no Tier 2 refs), DEVELOPMENT-RULES.md (reference list
      clearly framed as informational), QUICK-REFERENCE.md (directory listings only)

- [x] **3.7 Update cross-references from restructure**

    Audited all three reference patterns. `DEVELOPMENT-RULES` refs already updated by
    3.2.b (internal file intentionally kept alive). `strategy-development-methodology`
    refs only remain in archive and working docs as historical context (file removed in
    3.3.b). `CURRENT-SESSION` migration (30+ files) extracted to new Task 3.8.

- [x] **3.8 Migrate CURRENT-SESSION references to WORK-STATUS.md / SESSION.md**

    **Goal:** Complete the ADR-007 naming migration across all live documents so Phase 4
    builds on clean naming. Each reference needs semantic judgment: tracked project state
    → WORK-STATUS.md, personal session context → SESSION.md.

    **Scope:** ~30 live files. Archive, ADR, and research files are historical — skip.

    - [x] **3.8.a Split template and update team infrastructure**
        - Created `.arc/active/WORK-STATUS.template.md` and `.arc/team/WORK-STATUS.template.md`
          — tracked state fields only (branch, task list, current task, blockers, next action);
          renamed "Session Information" → "Active Work"; moved Blockers from session context
          into main state fields
        - Removed both `CURRENT-SESSION.template.md` files (active/ and team/)
        - Updated `.arc/team/README.md` — all CURRENT-SESSION refs → WORK-STATUS + SESSION,
          tree diagram updated, solo/team paths, agent lookup, template note about SESSION.md

    - [x] **3.8.b Update workflows**
        - `session-handoff.md` — restructured format section into two target files
          (WORK-STATUS.md for state fields, SESSION.md for context); split all 3
          examples into separate code blocks per file; removed Blockers from SESSION
          format; updated post-update and confirm sections
        - `activate-work-unit.md` — Step 7 title/content, commit message, git add
          path, checklist item (6 refs)
        - `arc-methods.md` — session-state default method
        - `atomic-commit.md` — "Read SESSION.md for uncommitted work"
        - `maintain-task-notes.md` — context check note → SESSION.md
        - `maintain-docs.md` — split into WORK-STATUS + SESSION entries
        - `01_initialize-arc.md` — scaffolding directory listing

    - [x] **3.8.c Update agent files (internal + templates)**
        - Internal (4 files): CLAUDE.md (session startup ref → session-init, handoff →
          generic "session state files"), GEMINI.md (cross-tool handoff → SESSION.md),
          CODEX.md (session docs discipline → WORK-STATUS.md + SESSION.md split),
          WARP.md (hand-offs → WORK-STATUS.md + SESSION.md)
        - Templates (5 files): AGENTS.template.md (context check → WORK-STATUS.md),
          CLAUDE.template.md (handoff → generic), WARP.template.md (hand-offs → split),
          GEMINI.template.md (cross-tool handoff → SESSION.md)
        - Created CODEX.template.md (missing template, modeled after internal CODEX.md
          adapted to template conventions: inline links, DEV-RULES.PROJECT refs, new
          session state naming)

    - [x] **3.8.d Update strategies and reference docs**
        - Strategies (5 files, 8 refs): backlog-organization (directory tree →
          WORK-STATUS.md + SESSION.md), file-classification (2 refs: scaffolded
          examples → WORK-STATUS, inventory row → WORK-STATUS.template.md),
          core-philosophy (P5 conventions → WORK-STATUS.md + SESSION.md),
          configurability-architecture (convention inventory row → two-file model),
          team-coordination (2 refs: personal files → team/{name}/SESSION.md with
          shared WORK-STATUS.md note, tracker table → SESSION.md)
        - Reference (4 files, 6 refs): QUICK-REFERENCE.md (read list → WORK-STATUS.md),
          META-PRD (handoff docs → WORK-STATUS.md + SESSION.md),
          TECHNICAL-OVERVIEW (directory tree → WORK-STATUS.template.md),
          QUICK-REFERENCE.template.md (3 refs: all → WORK-STATUS.md)

    - [x] **3.8.e Update READMEs, tool integrations, and backlog docs**
        - READMEs (4 files, 10 refs): README.md (2 refs: session continuity →
          WORK-STATUS + SESSION, session context → WORK-STATUS),
          README-ASPIRATIONAL.md (3 refs: active work listing → two separate
          entries, agent-executed table → WORK-STATUS + SESSION, bridge →
          both files), .arc/README.md (directory tree → WORK-STATUS.md),
          .arc-internal/README.md (4 refs: tree → WORK-STATUS + SESSION,
          tracks → split description, version controlled → SESSION.md,
          start sessions → WORK-STATUS.md)
        - Tool integrations (2 files): .claude/commands/handoff.md and
          .codex/skills/handoff/SKILL.md — both updated to target
          WORK-STATUS.md + SESSION.md
        - Backlog (2 files, 7 refs): ROADMAP.md (active work → WORK-STATUS),
          plan-wu3-cli-distribution.md (6 refs: dependency description → past
          tense, directory tree → WORK-STATUS, classification table →
          WORK-STATUS, init workflow option → ADR-007 model, team mode
          migration → SESSION.md moves to team/{name}/). One intentional
          remaining ref (line 46) describes the ADR-007 split historically

- [x] **3.9 Align internal constitution docs with public template structure**

    Renamed and restructured internal documents to mirror public templates — as if
    the ARC framework were its own adopter starting from the template.

    - **DEV-RULES.PROJECT.md** (renamed from DEVELOPMENT-RULES.md, 153 → 113 lines):
      Aligned section structure with public template (added Contents TOC, matched
      heading names, removed redundant preamble). Removed Commit Standards (duplicated
      DEV-RULES.ARC) and Reference Documentation (informational links). Added
      Documentation Style subsection (was in public template, missing internally).
    - **QUICK-REFERENCE.md** (163 → 137 lines): Removed "About This Reference
      Directory" section (redundant with session-init loading sequence), version
      header, and footer version note. Restructured Quality Gate Commands to match
      template's tiered format (Tier 1 / Tier 3). Added reference-style link for
      quality-gates strategy.
    - **Interior version tags removed**: Dropped `v0.3.0-dev` and hash tags from
      DEV-RULES.PROJECT.md and all 5 internal agent files (CLAUDE.md, GEMINI.md,
      CODEX.md, WARP.md, copilot-instructions.md) — interior versioning doesn't
      serve agents and creates maintenance burden.
    - **Updated references** (11 files): agent files (5 — display text, link defs,
      version tags), session-init.md (item 4), QUICK-REFERENCE.md (3 refs),
      TECHNICAL-OVERVIEW.md (directory tree), .arc-internal/README.md, task list
      (future task 5.3 ref)

- [x] **3.10 Run Tier 2 quality gates**
    - Full-project lint: 125 files, 0 errors
    - Cross-references verified: no stale DEVELOPMENT-RULES.md links in live files
      (remaining refs only in task list, PRD, CURRENT-SESSION — all self-referential)
    - Coherent unit boundary — Phase 3 complete

### **Phase 4:** Session Workflow Overhaul

**Purpose:** Implement operational session improvements — bootstrap, task references, mismatch
recovery, staleness detection.

**Note:** All changes use ADR-007 model (WORK-STATUS.md + SESSION.md).

- [x] **4.0 Rename internal CURRENT-SESSION.md to WORK-STATUS.md + SESSION.md**

    Completed ADR-007 two-file split for `.arc-internal/active/`.

    - Created `WORK-STATUS.md` (tracked) with project state fields matching public template
    - Created `SESSION.md` (gitignored) with persistent context, session context, and
      design notes carried forward from CURRENT-SESSION.md
    - Updated `.gitignore`: replaced CURRENT-SESSION.md entry with SESSION.md + team
      pattern (`.arc-internal/team/*/SESSION.md`)
    - Updated Gemini handoff (`.gemini/commands/handoff.toml`): fixed stale file path and
      workflow path reference
    - Updated Codex handoff (`.codex/skills/handoff/agents/openai.yaml`): updated prompt
      to reference both files
    - Claude handoff (`.claude/commands/handoff.md`) and Codex SKILL.md already updated
      in Phase 3
    - Deleted CURRENT-SESSION.md
    - Incidental: fixed strategy-configurability-architecture.md staleness — corrected
      leave-it-cleaner configurability path, added missing test-first row (count 19→20),
      updated method format example to dot-suffix pattern

- [x] **4.1 Handle first-session bootstrap and "no active work" state**

    **Goal:** Session-init works cleanly from first init through between-work-unit gaps.

    - [x] **4.1.a Update `01_initialize-arc.md`**
        - Added "Verify Session State" section with "no active work" defaults
        - All fields present: Branch `main`, Task List `[none]`, Current Task `—`,
          Blockers `[none]`, Next Action → create-prd workflow
        - Links to activate-work-unit and archive-completed for lifecycle context
        - Notes SESSION-NOTES.md doesn't exist at init time

    - [x] **4.1.b Update `session-init.md` for "no active work" detection**
        - Added detection in step 7: `Task List: [none]` triggers skip of step 9
        - Added "Skip if" guard at top of step 9 (task list loading)
        - Added "no active work" variant guidance in Confirm Orientation section
        - Updated both `.arc/` and `.arc-internal/` copies

    - [x] **4.1.c Update `activate-work-unit.md`**
        - Step 7: added context that activation transitions from "no active work" defaults
        - Added Last Completed to the field update list (item 5)

    - [x] **4.1.d Update `archive-completed.md` WORK-STATUS.md handling**
        - Added step 11b: reset WORK-STATUS.md post-archival
        - Base branch case: reset to "no active work" defaults with Last Completed
        - Parent branch case: restore parent work unit context
        - Added WORK-STATUS.md to step 12 commit staging

- [x] **4.2 Stabilize task references with triple-anchor format**

    Replaced fragile line-number anchors with triple-anchor format across all session workflows.

    - [x] **4.2.a Define format and update `session-init.md`**
        - Triple-anchor format: `Task 5.5 — Implement validation (line ~1903)`
        - Step 7: replaced hard line-number requirement with format definition and
          "any two anchors sufficient" guidance
        - Step 9: replaced "Direct jump / No scanning needed" with graduated lookup
          protocol (line hint → task number search → title search → mismatch report)
        - Updated both `.arc/` and `.arc-internal/` copies

    - [x] **4.2.b Update `session-handoff.md`**
        - Updated Current Task format in WORK-STATUS template and all three examples
        - `Task 3.3 (line 247) - Write unit tests` → `Task 3.3 — Write unit tests (line ~247)`
        - Updated Last Completed fields to use em dash consistently
        - Updated SESSION-NOTES "Return to" references with triple-anchor format
        - Updated "Remaining Work" guidance to reference triple-anchor format

    - [x] **4.2.c Update `activate-work-unit.md` and WORK-STATUS.md templates**
        - Step 7 item 4: triple-anchor format in Current Task example
        - Updated both `.arc/active/WORK-STATUS.template.md` and `.arc/team/WORK-STATUS.template.md`
        - Template comment updated: "enables graduated lookup" replacing "enables direct jump"

- [x] **4.3 Add mismatch recovery protocol to `session-init.md`**

    Restructured Step 4 into two-tier model with explicit trust hierarchy.

    - Trust hierarchy: git state > task list > WORK-STATUS.md > SESSION-NOTES.md
    - Tier 1 (auto-recover): higher-trust sources agree, lower-trust is outlier —
      proceed with ground truth, report in orientation summary
    - Tier 2 (stop and ask): ambiguous intent, same-tier disagreement
    - Three examples per tier showing concrete scenarios
    - Updated both `.arc/` and `.arc-internal/` copies

- [x] **4.4 Add staleness detection to `session-init.md`**

    - [x] **4.4.a Add commit hash anchor to `session-handoff.md`**
        - Added `Commit at Handoff` field to SESSION-NOTES template in session-handoff.md
        - Added `git rev-parse --short HEAD` as step 3 of Pre-Update Verification
        - Updated both SESSION-NOTES.template.md files (active/ and team/) with field + comment

    - [x] **4.4.b Add freshness check to `session-init.md`**
        - Added freshness check as first part of Step 3 (Confirm Orientation)
        - SESSION-NOTES.md: compare `Commit at Handoff` hash against HEAD, report gap count
        - WORK-STATUS.md: compare last commit touching it against HEAD
        - Informational, not blocking — feeds confidence into mismatch recovery (Step 4)
        - Updated both `.arc/` and `.arc-internal/` copies

- [x] **4.4.x Formalize persistent context convention in `session-handoff.md`**

    Promoted informal "DO NOT REMOVE" pattern to first-class `## Persistent Context` section.

    - session-handoff.md: updated "Preserve protected sections" → "Preserve persistent
      context", updated step 1, added section to SESSION-NOTES template, added to
      "What to include" guidance
    - SESSION-NOTES.template.md: added `## Persistent Context` section with HTML
      comment guidance (both active/ and team/ copies)
    - session-init.md: added persistent context note to Step 2 item 8 (both copies)
    - Each entry has explicit removal trigger, reviewed at each handoff

- [x] **4.4.y Add conditional WORK-STATUS.md commit to `session-handoff.md`**

    Added "Conditional WORK-STATUS.md Commit" section between Post-Update Cleanup
    and Confirm Handoff. Trigger: WORK-STATUS.md dirty with no pending task commit.
    Action: propose standalone maintenance commit (permission-gated). Skip when
    WORK-STATUS.md will ride with a task commit per DEV-RULES.ARC § Work status accuracy.

- [x] **4.5 Run Tier 1 quality gates on Phase 4 changes**
    - Full suite (Tier 3): 129 files, 0 errors

### **Phase 5:** Configuration and Customization Infrastructure

**Purpose:** Build the complete customization system — config, hooks, extensions, methods —
and apply ADR-008 Core/PM decomposition to workflows using the extension point infrastructure.

**Strategies:** `strategy-configurability-architecture.md`

- [x] **5.0 Update `strategy-configurability-architecture.md` for ADR-008 layer model**

    Updated strategy doc with three-axis adoption flexibility model (enforcement depth,
    method customization, functionality scope), Core/PM layer descriptions, `pm.mode` in
    config example, PM layer scaling paragraph, Scenario A layer note. Also cleaned all
    internal references (ADR numbers, `.arc-internal/` paths) — strategy is adopter-facing
    and must stand on its own without internal provenance.

- [x] **5.1 Expand `arc-config.yml` settings**

    Expanded from 2 settings to 11. Migrated key format from underscores (`base_branch`)
    to dotted grouping (`branch.base`) per strategy doc design. All settings have inline
    comments with description, valid values, and default. Created internal copy at
    `.arc-internal/system/arc-config.yml`. Updated pre-commit hook key references to
    match new dotted format.

- [x] **5.2 Make commit-msg hooks configurable**

    - [x] **5.2.a Update `.arc/system/githooks/commit-msg`**

        Made hook fully config-aware using `arc_config_get` (same pattern as pre-commit).
        `commit.format` supports conventional/custom/any; `commit.context_footer` supports
        required/recommended/custom/disabled. `context_issue()` helper switches severity
        (error vs warning) for required/recommended. Fixed search paths to `.arc/` only
        (public hook — adopters won't have `.arc-internal/`). RULE 7 (WORK-STATUS freshness)
        skipped when context footer is disabled/custom. Added `custom` to
        `commit.context_footer` valid values in arc-config.yml (aligns with existing
        `commit.context_pattern` comment).

    - [x] **5.2.b Create `.arc-internal/system/githooks/commit-msg`**

        Created internal copy mirroring 5.2.a with framework-specific paths: reads
        config from `.arc-internal/system/arc-config.yml`, searches both `.arc/` and
        `.arc-internal/` active directories for task list files and WORK-STATUS.md.

    - [x] **5.2.c Update merge strategy references**

        Replaced blanket "no squash merge" with config-aware guidance across three files.
        `atomic-commit.md`: bullet now references `merge.strategy` setting with link to
        configurability architecture § Merge Strategy for squash implications.
        `archive-completed.md`: merge command comment references arc-config.yml setting.
        `strategy-work-organization.md`: added "Merge method" paragraph to Merge Strategy
        section covering all three strategies and traceability implications.

- [x] **5.3 Make pre-commit hook patterns extensible**

    Updated public hook: added `hooks.pre_commit` early exit, "Adopter:" comments on
    `debug_patterns` array and `code_extensions` variable (extracted from inline grep),
    fixed all search paths to `.arc/` only (CHECKs 6, 7, 9). Created internal copy at
    `.arc-internal/system/githooks/pre-commit` with `.arc-internal/` config path, dual
    `.arc/` + `.arc-internal/` search paths, and new CHECK 10 (public/internal boundary
    enforcement — blocks `.arc-internal/` references in staged `.arc/` files).

- [x] **5.4 Scaffold `arc-extensions.md`**

    Created `.arc/system/workflows/arc-extensions.md` with six preset extension points:
    four general-purpose (`post-task-quality`, `post-unit-quality`, `post-context-load`,
    `pre-stage-review`) and two Core→PM interface points (`post-work-unit-activate`,
    `post-work-unit-archive` per ADR-008). Each section has workflow reference, fires
    trigger, contract, and `[No extension configured]` placeholder. Structure mirrors
    `arc-methods.md` (intro, classification, contents, `---`-separated sections,
    reference-style links). All within 0–3 per workflow target (2/1/1/1/1).

- [x] **5.5 Add method dependencies to `arc-methods.md`**

    Added coupled-method awareness to the existing method infrastructure. Three
    coupled methods get `**Related:**` fields with links and coupling rationale:
    commit-format ↔ commit-context-format ↔ task-completion. Added "Method
    Dependencies" section with table showing all 7 methods' relationships
    (3 coupled, 4 independent). Contents updated to include the new section.

- [x] **5.6 Integrate extension and method references into workflows**

    Hybrid integration approach: extension points as conditional steps with backtick
    `#anchor` tags, method references inline replacing hardcoded defaults, task-completion
    reclassified from method to extension. See subtask completion notes for details.

    1. **Extension points become conditional numbered steps** with backtick tag for
       grep-ability. No `---` blocks. Step heading format:
       `### Step N: Post-Activation Extensions · #post-work-unit-activate` followed
       by conditional execution prose and `See:` link to arc-extensions.md section.
    2. **Methods are referenced inline in workflow prose** — replace hardcoded defaults
       with method references. The workflow says WHAT to do, the method says HOW.
       Example: "Format the commit per the [commit-format method](...)" instead
       of hardcoding the conventional commit structure inline.
    3. **`task-completion` reclassified from method to extension** — see 5.6.c below.

    - [x] **5.6.a Insert extension points as conditional workflow steps**

        Inserted 6 extension points as conditional steps in 5 workflow files (+ internal
        session-init.md). Format: heading/label with backtick `#anchor` tag for grep-ability,
        conditional "if configured" prose, See link to arc-extensions.md section. Step
        renumbering applied where needed (session-init 3→4→5, activate-work-unit 8→9→10,
        archive-completed 12→13). Internal step references updated.

    - [x] **5.6.b Integrate method references into workflow prose**

        Replaced hardcoded defaults with inline method references in 4 workflow files
        (+ internal session-init.md). process-task-loop.md: added test-first and
        leave-it-cleaner bullets, updated Tier 1/2 steps to reference quality-gate-commands
        method. atomic-commit.md: updated purpose, Quick Commit Reference, and Complex
        Analysis Path to reference commit-format and commit-context-format methods.
        session-init.md + session-handoff.md: added session-state method override notes
        to document loading and state writing sections.

    - [x] **5.6.c Reclassify `task-completion` from method to extension**

        Removed `task-completion` section from arc-methods.md (Contents, Method
        Dependencies table row, commit-context-format Related field updated). Added
        `post-task-completion` extension point to arc-extensions.md with contract
        emphasizing additive behavior (core `[x]` marking is non-negotiable). Integrated
        as conditional step in process-task-loop.md after **Second** (mark [x]).

        **Stale references noted:** `strategy-configurability-architecture.md` uses
        task-completion as an illustrative example (§ Methods, § Markers in workflows)
        and shows the old `---`-bounded marker format. Both examples need updating
        as follow-up work.

- [x] **5.7 Add session-init config awareness step**

    Added Step 4 (Check Active Configuration) to both session-init files. Reads
    arc-config.yml for non-default values and scans arc-methods.md for populated
    overrides. Four sub-checks: config values, method overrides, platform awareness,
    custom commit patterns. Described as read-and-note (not ceremony) — aligns with
    strategy-configurability-architecture.md § Agent discovery. Steps renumbered
    (4→5→6) in both template and internal copies.

- [x] **5.8 Apply ADR-008 Core/PM decomposition to workflows**

    Extracted all PM-specific steps from Core workflows using extension point
    infrastructure. Core workflows now contain zero direct PM artifact references —
    PM behavior flows through extension points and conditional sections.

    - [x] **5.8.a Extract PM steps from `activate-work-unit.md`**

        Removed Steps 5 (PROJECT-STATUS) and 6 (ROADMAP). Renumbered 7→5
        through 10→8. Cleaned PM files from commit staging example and checklist
        summary. Updated staging note to reference extensions.

    - [x] **5.8.b Extract PM step from `archive-completed.md`**

        Removed Step 11 (PROJECT-STATUS/ROADMAP update), promoted 11b→11.
        Cleaned PM files from commit staging step (Step 13), added extension
        note for additional artifacts.

    - [x] **5.8.c Extract PM steps from `setup/02_define-project.md`**

        Steps 4–5 (ROADMAP, PROJECT-STATUS) moved under conditional "With
        Solo PM (`pm.mode: solo`)" section. Core setup is Steps 1–3 only.
        Maintaining section partitioned: Core docs primary, PM docs under
        "With Solo PM" subsection. Added arc-config.yml link reference.

    - [x] **5.8.d Remove ATOMIC-TASKS.md section from `process-task-loop.md`**

        Removed entire `## Atomic Tasks` section (lines 175–193) including
        "When Atomic Tasks Grow" subsection. PM artifact reference in Core
        workflow — function replaced by task list atomic section (Core).

    - [x] **5.8.e Remove PM artifact references from supplemental workflows**

        `atomic-commit.md`: removed ATOMIC-TASKS.md archival bullet.
        `strategy-work-organization.md`: removed both PM exception bullets
        (TASK-INBOX + ROADMAP, ATOMIC-TASKS) from partially protected mode,
        updated summary sentence. Cleaned fully protected mode's PM-specific
        micro-branch references. Left line 296 TASK-INBOX for 5.9.b scope.

    - [x] **5.8.f Update `STRATEGY-INDEX.md` for layer awareness**

        Added layer annotation convention with explanatory note. Marked
        `strategy-backlog-organization.md` as **(Solo PM)**.

    - [x] **5.8.g Add layer annotations to `strategy-file-classification.md`**

        Added Layer column (Core / Solo PM / Team PM) to all 16 inventory
        tables. Added explanatory paragraph in File Inventory section intro.
        Also added `· Solo PM` title marker and `**Layer:**` metadata to
        `strategy-backlog-organization.md` itself.

- [x] **5.8R Apply ADR-009 naming changes (Solo PM/Team PM → pm.mode values)**

    Applied ADR-009 naming across 8 files: arc-config.yml (public + internal),
    strategy-file-classification.md, STRATEGY-INDEX.md, strategy-backlog-organization.md,
    02_define-project.md, and strategy-configurability-architecture.md. All Solo PM/Team PM
    references replaced with `pm.mode` values (`none`, `arc-in-git`, `external`).

    - [x] **5.8R.a Update `arc-config.yml` pm.mode values and comments**

        Updated both public and internal configs. Rewrote PM section comments:
        "PM layer selection" → "Project Management (PM) mode. Controls where
        project management lives." Values: `none` (default), `arc-in-git`,
        `external` with ADR-009 descriptions. Public template defaults to `none`;
        internal (self-hosting) set to `arc-in-git`.

    - [x] **5.8R.b Update `strategy-file-classification.md` layer annotations**

        Updated intro paragraph: removed "Team PM" from layer description, changed
        `pm.mode: solo` → `pm.mode: arc-in-git`. Updated all 16 inventory tables:
        "Solo PM" → "arc-in-git" (8 entries), "Team PM" → "arc-in-git" for
        team/ATOMIC-TASKS (1 entry, per ADR-009 Part 2). Fixed table alignment
        for all 6 tables containing arc-in-git entries.

    - [x] **5.8R.c Update layer references in STRATEGY-INDEX, backlog-org, define-project**

        `STRATEGY-INDEX.md`: "(Solo PM)" → "(arc-in-git)", explanatory note updated
        to reference "arc-in-git Project Management mode" with `pm.mode: arc-in-git`.
        `strategy-backlog-organization.md`: title "· Solo PM" → "· arc-in-git",
        Layer metadata updated. `02_define-project.md`: both "With Solo PM" headers
        → "With arc-in-git PM", prose updated to "arc-in-git PM mode".

    - [x] **5.8R.d Update `strategy-configurability-architecture.md` layer descriptions**

        Rewrote Functionality scope paragraph: Solo PM/Team PM layer descriptions →
        `pm.mode` three-value framing (`none`, `arc-in-git`, `external`). Updated
        adoption flexibility table ("Layer selection" → "PM mode selection"),
        composability examples, scaling paragraph ("Adding or removing PM layers" →
        "Changing PM mode"), config example (`pm.mode: solo` → `none`), and
        Scenario A layer reference ("Core + Team PM" → `pm.mode: external`).

- [x] **5.9 Remove TASK-INBOX.md and weekly-review.md from framework**

    Per ADR-008, both artifacts cut from framework entirely. Deleted weekly-review.md,
    removed all TASK-INBOX and weekly-review references across 9 files (strategies,
    workflows, templates, team README). Also cleaned up backlog-organization.md
    processing flow (leave-it-cleaner) and updated file-classification summary counts.

    - [x] **5.9.a Remove `weekly-review.md` and its references**

        Deleted `weekly-review.md`. Removed references from `strategy-work-organization.md`
        (Related Documentation list + link def) and `strategy-backlog-organization.md`
        (Related Documentation + link def). Also cleaned up TASK-INBOX references in
        backlog-org (leave-it-cleaner): removed from purpose, structure diagram, and
        rewrote processing flow to direct capture without inbox intermediary.

    - [x] **5.9.b Remove TASK-INBOX references from Core files**

        `01_initialize-arc.md`: removed "TASK-INBOX" from backlog description.
        `strategy-file-classification.md`: removed TASK-INBOX row from backlog/
        table, removed weekly-review.md row from workflows/ table, updated summary
        counts (Framework 41→40, Configurable 13→12, Total 66→64).
        `strategy-work-organization.md`: "Capture in TASK-INBOX" → "Capture in
        backlog". Root `README.md`: no TASK-INBOX reference found (already clean).

    - [x] **5.9.c Clean up TASK-INBOX references in arc-in-git PM files**

        `BACKLOG-FEATURE.template.md` and `BACKLOG-TECHNICAL.template.md`: removed
        "from TASK-INBOX.md during weekly review" from Processing lines.
        `team/README.md`: removed TASK-INBOX from What Lives Where table, removed
        entire "TASK-INBOX as Communal Capture" subsection (12 lines).

- [x] **5.10 Run Tier 2 quality gates**
    - Full-project lint: 130 files, 0 errors
    - Coherent unit boundary — complete customization system + ADR-008 decomposition

### **Phase 6:** Team, External, and Adoption

**Purpose:** Add team mode awareness, external tool guidance, adoption tier behavior.

**Strategies:** `strategy-team-coordination.md`, `strategy-configurability-architecture.md`

- [x] **6.1 Add Workflow Adaptations section to `strategy-team-coordination.md`**

    Added Workflow Adaptations section as first substantive section with 6-row
    reference table mapping solo → team mode changes: session notes path, work
    status (shared), atomic tasks path (with pm.mode: arc-in-git footnote),
    per-pair task scoping, ownership markers, branching patterns. Added key
    distinction paragraph clarifying shared vs. personal file split.

- [x] **6.2 Add team mode callouts to session workflows**

    Added `> **Team mode:**` blockquote callouts to three workflow files, following the
    existing `> **Mode-specific:**` pattern in activate-work-unit.md:

    - `session-init.md` Step 2: note after item 8 — SESSION-NOTES.md moves to
      `team/{name}/`, WORK-STATUS.md stays shared in `active/`
    - `session-handoff.md` § What to Update: note after two-file description —
      same path distinction, notes that templates show solo (default) layout
    - `activate-work-unit.md` after Step 5: shared WORK-STATUS.md activation,
      other developers join via session-init with personal SESSION-NOTES.md

    All three link to strategy-team-coordination.md § Workflow Adaptations via
    reference-style links.

- [x] **6.2.x Document WORK-STATUS.md merge convention in `strategy-work-organization.md`**

    Added bold-led paragraph "WORK-STATUS.md merge behavior" to § Task Lists and
    Branches, adjacent to "Branch scope." Covers base branch baseline convention
    (protected vs. unprotected), `.gitattributes` `merge=ours` auto-resolution,
    PR merge rule ("take base"), and post-merge transience (rotate-branch and
    archive-completed update immediately). Added `[rotate-branch]` link reference.

    Updated `strategy-team-coordination.md` § "Session State Has No Conflicts" →
    renamed to "Session State Merge Behavior." Distinguishes personal files
    (no conflicts by design) from shared WORK-STATUS.md (trivial, auto-resolved).
    Cross-references work-organization strategy for the full merge convention.

- [x] **6.2.y Fix `team/` templates and README per ADR-008**

    Per ADR-008 §7c: WORK-STATUS.md is shared in `active/`, not per-developer.

    - [x] **6.2.y.a Update `team/README.md`**

        Fixed directory tree (removed WORK-STATUS.md from per-developer dirs, added
        `arc-in-git only` annotations), file table (WORK-STATUS row moved to shared
        `active/`, personal row shows only SESSION-NOTES and ATOMIC-TASKS), Solo vs.
        Team section (WORK-STATUS stays in `active/`, pm.mode qualifiers added),
        Agent Lookup section (team mode shows shared WORK-STATUS + personal
        SESSION-NOTES), and Templates section (lists each template with layer note).

    - [x] **6.2.y.b Update team template set**

        Removed `WORK-STATUS.template.md` from `team/` (git rm — shared in `active/`).
        Added `pm.mode: arc-in-git` requirement blockquote to ATOMIC-TASKS.template.md.
        Fixed SESSION-NOTES.template.md companion link to point to
        `../../active/WORK-STATUS.md` instead of same-directory reference.

- [x] **6.3 Add person-to-person task handoff protocol**

    Added "Person-to-Person Task Handoff" section to `strategy-team-coordination.md` (between
    Task Ownership and Team Branching Patterns) covering outgoing responsibilities (task
    reassignment, writing for a different reader, pushing git notes), incoming bootstrap (fetch
    outgoing notes, agent-switching filter, verify ownership), and async conventions. Added
    lightweight cross-reference callouts in `session-handoff.md` and `session-init.md` team
    mode blockquotes pointing to the new section. Hybrid approach: full protocol in strategy
    doc, discoverable from workflows.

- [x] **6.4 Add per-pair qualifications**

    Added team mode per-pair qualifications to three documents:
    DEV-RULES.ARC.md § One task at a time (concurrent pairs may work different tasks),
    DEV-RULES.ARC.md § Session state control (SESSION-NOTES.md moves to `team/{name}/`),
    process-task-loop.md § Task Implementation (same per-pair note).
    AGENTS.template.md and strategy-team-coordination.md already had coverage from
    Tasks 1.1.c and Phase 5.

- [x] **6.5 Add team mode to `activate-work-unit.md`**

    Added `pm.mode` awareness blockquote to Step 6 (post-activation extensions) explaining
    how extension behavior varies by PM mode (arc-in-git, external, none). Team branching
    and session state already covered by existing Step 2 and Step 5 callouts.
    weekly-review.md already removed per ADR-008 in earlier phases.

- [x] **6.6 Streamline dual-tracker workflow guidance**

    Added "Integration Mechanism" subsection to strategy-team-coordination.md § External
    Tracker Integration listing the three extension points (`post-task-completion`,
    `post-work-unit-activate`, `post-work-unit-archive`) as the integration mechanism.
    Enhanced process-task-loop.md post-task-completion extension reference to surface the
    dual-tracker pattern and link to team coordination strategy. Extension points already
    existed — work was cross-referencing, not creating new infrastructure.

- [x] **6.7 Replace adoption profiles with strong defaults**

    Wrote ADR-010 replacing Essentials/Recommended/Custom with strong defaults.
    Updated ADR-004 status (Parts 2, 3, 6 superseded). Rewrote
    strategy-configurability-architecture.md § Adoption Profiles → § Adoption Defaults
    with two-axis model (enforcement depth dropped as named axis), updated Validation
    Scenarios A/B/C. Updated cross-references in STRATEGY-INDEX and
    strategy-core-philosophy (3 occurrences). Flagged WU3 plan profile section with
    ADR-010 rework callout. All files lint clean.
    - Document deferred review escape hatch more prominently

- [x] **6.8 Run Tier 1 quality gates on Phase 6 changes**

    All 7 files (6 modified + 1 new ADR-010) pass markdownlint with 0 errors.

### **Phase 7:** Convention Gaps and Methodology Polish

**Purpose:** Close all remaining convention and workflow completeness gaps.

- [x] **7.1 Update archive workflow documentation**

    Three improvements to `archive-completed.md`. Step numbers renumbered (9→14, was 9→13).

    - [x] **7.1.a Add verification section to completion doc template**
        - Added `## Verification` section between Implementation Highlights and Related
          Documentation — captures Tier 3 QG status and success criteria summary

    - [x] **7.1.b Close post-review quality gate gap**
        - Changed step 7 from optional "Re-run quality checks if necessary" to mandatory
          "Re-run Tier 1 quality gates" after review-driven commits

    - [x] **7.1.c Add research file routing**
        - Added step 10 "Route Research Files (If Applicable)" — decision point for copying
          files with lasting reference value to `.arc/reference/research/` before archival

- [x] **7.2 Research and establish document evolution guidance**

    Defined three-tier ADR amendment model (corrections, amendments, supersession) and PRD
    document history convention. Research: external-research-analyst surveyed Nygard, AWS,
    MADR, Henderson's ADR repo, Thoughtworks, Reforge — found universal consensus on typo
    corrections, split field on strict immutability vs. living-document amendments.

    - `strategy-adr-methodology.md`: Added "Amending Accepted ADRs" section with three tiers,
      annotation format, and choosing-the-right-tier table. Softened absolute "never edited"
      language in Key Characteristics, Status note, and Accepted lifecycle to reference new section.
    - `template-adr.md`: Added "Amending This Document" section with inline guidance comment
    - `template-prd.md`: Added "Document History" section with version table and guidance comment
    - `DEV-RULES.PROJECT.md`: Updated ADR immutability statement to reference three-tier model

- [x] **7.3 Add intermediate work-unit status**

    Added `Integrated` as post-merge terminal status. Lifecycle: `Pending` → `In Progress` →
    `Complete` (all tasks done, pre-merge) → `Integrated` (merged to base branch).

    - `strategy-task-list-formatting.md`: Added `Integrated` to status values in both planned
      and incidental task list formats (4 locations), with descriptions
    - `archive-completed.md`: Added step 10 "Update Task List Status to Integrated" in Phase 3
      (after merge, before archival). Steps renumbered 9→15 (was 9→14). PRD status stays
      `Complete` (tracks plan fulfillment, not merge state)
    - `agent-pre-merge-review.md`: No changes needed (no status value references)
    - PROJECT-STATUS/ROADMAP templates: No changes needed (no work-unit status fields; PM
      layer updates via post-archival extension point)

- [x] **7.4 Address version reference drift**

    Evaluated: neither behavioral norm nor hook validation needed. ARC-owned docs will be
    updated by CLI (WU3), eliminating cross-repo drift. Team branch drift is handled by
    existing mechanisms (PR review, merge conflicts, task ownership). Version stamps add
    maintenance burden without solving either problem. Removed vestigial `**Version:**` line
    from internal AGENTS.md and aligned internal copy with template (missing principles,
    section name, team mode qualifier, footer).

- [x] **7.5 Expand incidental context patterns in commit-msg hook**

    Pulled forward as incidental (pre-Phase 5) — blocking commits with freeform
    discovery contexts. Generalized regex to `(incidental - discovered during .+)`.
    Updated commit-msg hook (regex + error messages) and arc-methods.md format spec.

- [x] **7.6 Reorganize `reference/constitution/` and resolve PROJECT-STATUS**

    Reorganized `reference/constitution/`: orientation docs (META-PRD, PROJECT-STATUS,
    TECHNICAL-OVERVIEW) promoted to `reference/` root for visibility. `constitution/`
    now contains only rules docs (DEV-RULES.*) with opt-in domain-scoped rule file
    support. PROJECT-STATUS tightened — removed overlap with ROADMAP, aligned with
    template structure.

    - [x] **7.6.a Move orientation docs to `reference/` root**
        - Moved 3 templates + 3 internal copies from `constitution/` to `reference/`
        - Removed vestigial `*Last updated*` from internal PROJECT-STATUS

    - [x] **7.6.b Tighten PROJECT-STATUS / ROADMAP overlap**
        - Template already clean (no overlap). Restructured internal PROJECT-STATUS:
          aligned with template structure (Status Snapshot + Completed Major Work),
          removed "Upcoming Priorities" and "Key Deliverables" sections, added
          ROADMAP forward pointer, consolidated early history into single entry

    - [x] **7.6.c Add domain-scoped rule file support**
        - Added domain-scoped guidance to DEV-RULES.PROJECT template
        - Added scan-and-note instruction to session-init step 4
        - Updated `strategy-file-classification.md` with `DEV-RULES.{DOMAIN}.md` pattern
        - Created `constitution/README.md` documenting the directory and pattern
        - Also fixed stale ADR immutability statement in DEV-RULES.PROJECT template
          (leave-it-cleaner: aligned with Task 7.2 three-tier amendment model)

    - [x] **7.6.d Update all path references and strategies**
        - Updated `02_define-project.md` (3 link defs + 2 location guidance lines)
        - Updated `ROADMAP.md` and `archive/README.md` path references
        - Verified: `backlog-organization`, `arc-extensions`, `maintain-docs`,
          `activate-work-unit`, `archive-completed` use filename-only refs (no change)
        - Archive references left as historical

    - [x] **7.6.e Run Tier 1 quality gates on all changed files**
        - Full suite: 126 files, 0 errors

- [x] **7.7 Update `1_create-prd.md` workflow**

    - [x] **7.7.a Extract PRD format to template reference**
        - Replaced 45-line inline PRD format with reference to `template-prd.md`
        - Template is richer (priority levels, document history, inline guidance)
        - Fixed save path: `backlog/` → `active/` (PRDs are created when work activates)

    - [x] **7.7.b Strengthen discovery step**
        - Added discovery checklist reference to Step 3

    - [x] **7.7.c Reference planning lifecycle**
        - Added `strategy-work-planning.md` reference to Step 1 for plan-\* conventions

- [x] **7.7R Audit and fix Core/arc-in-git boundary in workflows**

    Discovered during 7.7: Core workflows unconditionally reference arc-in-git artifacts
    (backlog/ paths, plan-\* conventions). Audit confirmed this is pervasive — affects 3
    workflows, 1 strategy doc, and 2 reference docs.

    **Approach decided:** Inline pm.mode conditionals in existing workflows (single source
    of truth). Long-term, WU3 CLI may extract save-path logic to arc-methods.md for cleaner
    architecture — noted in plan-wu3-cli-distribution.md for strong consideration.

    **Key boundary decisions:**

    - plan-\* documents are Core (exploration artifacts, valuable in any mode); location
      varies by mode (backlog/ in arc-in-git, active/ in none/external)
    - template-plan.md ships with Core installs
    - Workflows use inline conditionals, not separate variants per mode
    - activate-work-unit.md simplifies in pm.mode: none (no backlog steps) but still
      provides value (branch creation, WORK-STATUS update, status change)

    - [x] **7.7R.a Audit Core workflows and strategies for arc-in-git boundary violations**

        Comprehensive audit of all Core workflows, strategies, templates, and reference
        docs. Produced violation inventory with severity ratings and fix recommendations.

        **Violations found (HIGH):** `1_create-prd.md` (hardcoded backlog/ path for plan-\*
        check), `2_generate-tasks.md` (save paths and header template assume backlog/),
        `activate-work-unit.md` (purpose, prerequisites, Steps 1/3 all assume backlog/).
        **MEDIUM-HIGH:** `strategy-work-planning.md` (pipeline diagram, plan-\* lifecycle
        tied to backlog/). **MEDIUM:** `session-init.md` ("review backlog" guidance),
        `.arc/README.md` (directory tree shows arc-in-git dirs as standard, weekly review
        audience row).

        **Already correct patterns:** `02_define-project.md` (explicit pm.mode gate),
        `strategy-backlog-organization.md` (marked arc-in-git in title), extension points
        in activate/archive workflows (pm.mode awareness), `strategy-file-classification.md`
        (two-axis inventory), `STRATEGY-INDEX.md` (flags arc-in-git strategies).

        **Approach evaluated:** Inline conditionals preferred over separate workflow variants
        (less maintenance, consistent with WU3 CLI installing mode-aware files rather than
        mode-specific files). Extension points already handle PM-layer hooks correctly.
        Long-term extraction to arc-methods.md noted for WU3 consideration.

    - [x] **7.7R.b Make `1_create-prd.md` mode-aware**

        Step 1 now directs agent to check pm.mode for plan-\* file location (backlog/ for
        arc-in-git, active/ for none/external). Removed hardcoded backlog/ path. Kept
        specific plan-\*.md artifact reference — the concept is Core, only location varies.
        Removed "speculative PRD" paragraph (better suited to strategy doc).

    - [x] **7.7R.c Make `2_generate-tasks.md` mode-aware**

        Save paths now branch by pm.mode (backlog/ for arc-in-git, active/ for
        none/external). Header template PRD path changed to active/ (where it lives during
        execution) with note explaining arc-in-git activation update.

    - [x] **7.7R.d Make `activate-work-unit.md` mode-aware**

        Added Mode Detection section at top. Prerequisites split into all-modes and
        arc-in-git-additional. Steps 1 and 3 marked "arc-in-git only" with skip
        instructions. Step 4 PRD path update marked arc-in-git only. Commit step shows
        both staging variants. Checklist simplified. Also fixed "Status: Pending" →
        "Status: Not Started" to match task list template convention.

    - [x] **7.7R.e Add layer awareness to `strategy-work-planning.md`**

        Added Layer header: "Core with arc-in-git extensions." Pipeline diagram changed
        from "Backlog item" to "Idea" with blockquote explaining arc-in-git adds structured
        backlog stage. Plan Documents convention now mode-aware for location. Lifecycle no
        longer assumes backlog item as trigger. Backlog-org references flagged
        **(arc-in-git)**.

    - [x] **7.7R.f Fix `.arc/README.md` and `session-init.md` references**

        README: ATOMIC-TASKS.md and backlog/ annotated "arc-in-git pm.mode only" in
        directory tree. Removed "Weekly review" audience row. Updated "Shared context"
        examples. session-init.md (both template and internal): "review backlog" → "plan
        new work."

    - [x] **7.7R.g Add arc-methods save-path extraction consideration to WU3 plan**

        Added "For Strong Consideration" section to plan-wu3-cli-distribution.md covering:
        current state (inline conditionals in 3 workflows), proposed work-unit-paths and
        activation-steps methods, benefits (single source of truth, reconfigure simplicity),
        migration path from inline conditionals, and relationship to
        `arc init --reconfigure`.

    - [x] **7.7R.h Run Tier 1 quality gates on all modified files**

        Full suite: 126 files, 0 errors.

- [x] **7.8 Enumerate deferred review stop conditions**

    Added two-tier stop condition guidance to deferred review section in
    `3_process-task-loop.md`. "Must stop" (QG failure, blocking dependency, design
    decisions needing input, scope excess) vs. "Continue with note" (auto-fixable lint,
    slower than expected, minor plan deviation). Replaced vague "anything unexpected"
    with actionable criteria.

- [ ] **7.9 Scale archive ceremony to work size**

    - In `archive-completed.md`: simplified path for incidental work below threshold
    - Simplified: move file to archive, update listing — no completion doc
    - Reserve full ceremony for planned and substantial incidental work

- [ ] **7.10 Evaluate planning branch independence**

    - Assess whether `planning_branches` setting independent of protection mode adds value
    - If needed: add config setting. If adequate: document reasoning

- [ ] **7.11 Separate parseable minimum from full task list format**

    - In `strategy-task-list-formatting.md`: document "parseable minimum" vs. recommended full
    - Make task numbering check configurable: error (default) / warning / off
    - Add setting to `arc-config.yml`

- [ ] **7.12 Audit strategy configurability and opt-out paths**

    **Goal:** Ensure configurability architecture covers all guidance channels.

    - Audit ARC-shipped strategies for prescriptive content without override mechanism
    - Extract to overridable mechanism or reframe as recommendation
    - Verify ADR-003 architecture covers strategies, not just hooks and workflows

- [ ] **7.13 Document ARC naming conventions**

    - Document reasoning: ALL-CAPS core docs, `prd-*/tasks-*/strategy-*/template-*/plan-*`
      prefixes, workflow numbering exception
    - Natural home: section in existing document (file-classification strategy,
      DEV-RULES.ARC, or conventions section)
    - Include adopter guidance for naming their own artifacts

- [ ] **7.11.x Add "Atomic Tasks — {name}" section to task list infrastructure**

    Per ADR-008 subordinate decision 7a: task lists gain a dedicated section for
    WU off-plan work (discoveries, small fixes). This is a Core artifact — replaces
    the need for ATOMIC-TASKS.md during WU execution.

    - [ ] **7.11.x.a Update `strategy-task-list-formatting.md`**
        - Define "Atomic Tasks — {wu-name}" section convention
        - Placement: after main tasks, before Success Criteria
        - Format: flat checkbox list (simpler than numbered tasks)
        - Purpose: captures WU-scoped off-plan work, archives with the task list

    - [ ] **7.11.x.b Update task list template**
        - Add empty "Atomic Tasks" section with inline guidance
        - Present by default (empty), populated as needed during execution

- [ ] **7.14 Run Tier 1 quality gates on Phase 7 changes**

### **Phase 8:** Guidance Discovery and Skills

**Purpose:** Improve guidance discoverability and formalize skill integration.

- [ ] **8.1 Enrich STRATEGY-INDEX with trigger hints**

    - Add "Consult when:" annotation to each entry
    - Dual-audience: agents match task context, humans scan quickly

- [ ] **8.2 Create WORKFLOW-INDEX**

    - New file: `.arc/system/workflows/WORKFLOW-INDEX.md`
    - Catalog of workflows by category (core lifecycle, supplemental)
    - Include project workflows section (initially empty)
    - Add to session-init load sequence

- [ ] **8.3 Add strategy declaration guidance to `2_generate-tasks.md`**

    - Note relevant strategies when writing task entries
    - Example: `**Strategies:** strategy-adr-methodology.md`
    - Lightweight convention, not mandatory

- [ ] **8.4 Formalize trigger/content separation convention**

    **Goal:** Document how ARC content relates to agent-specific trigger files.

    - Pattern: ARC content in `.arc/`, triggers as thin dispatchers
    - Skills (SKILL.md with frontmatter) as standardizing format
    - Slash commands as legacy/back-compat variant
    - Research current CLI behavior before finalizing
    - Feeds WU3 generation script design

- [ ] **8.5 Create `integrate-skill.md` supplemental workflow**

    - New file: `.arc/system/workflows/arc/supplemental/integrate-skill.md`
    - Agent reads skill → classifies → assesses integration → proposes placement → executes
    - Single interaction target: "integrate this skill"

- [ ] **8.6 Clarify `project/` directories as skills landing zone**

    - Update READMEs in `.arc/reference/strategies/project/` and
      `.arc/system/workflows/project/`
    - Connect to integrate-skill workflow (8.5)

- [ ] **8.7 Run Tier 1 quality gates on Phase 8 changes**

### **Phase 9:** Verification

- [ ] **9.1 Run Tier 3 quality gates**
    - Full-project lint: `npm run -s lint:md` (zero violations)
    - Template structure validation
    - Internal link checking
    - Cross-reference integrity across all modified and new files

- [ ] **9.2 Validate success criteria against PRD**
    - Check each criterion against completed work
    - Follow verify-completion protocol
    - Document results below

---

## Success Criteria

- [ ] All WU1/WU1.5 design decisions have corresponding concrete changes in `.arc/` files
- [ ] DEV-RULES.ARC and DEV-RULES.PROJECT exist with correct content split
- [ ] `strategy-development-methodology.md` evaluated with documented rationale for outcome
- [ ] Session-init uses new Tier 1 loading sequence (reduced instruction density)
- [ ] Hooks read from `arc-config.yml` — commit format, context footer, merge strategy
      configurable
- [ ] `arc-extensions.md` and `arc-methods.md` scaffolded with preset points; markers in
      workflows
- [ ] Session workflows handle bootstrap, staleness, mismatch recovery, stable task references
- [ ] Multi-branch model consistent — no coupling contradictions; `rotate-branch.md` exists
- [ ] Team mode awareness present in all relevant workflow docs
- [ ] All audit findings addressed (adopter experience, multi-branch, methodology gaps)
- [ ] ARC naming conventions documented
- [ ] Strategy configurability audited — no prescriptive guidance without opt-out path
- [ ] WORKFLOW-INDEX created; STRATEGY-INDEX enriched with trigger hints
- [ ] Markdown linting passes with zero violations
- [ ] No contradictions between modified documents; cross-references accurate
