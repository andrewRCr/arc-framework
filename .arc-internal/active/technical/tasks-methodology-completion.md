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

- [ ] **3.1 Create `DEV-RULES.ARC.md`**

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

- [ ] **3.4 Reframe session model documentation**

    - Per ADR-002: distinguish principle (context recoverability) from mechanism
      (WORK-STATUS.md + SESSION.md)
    - Session workflow docs: position as "best approach for ephemeral-context agents"
    - Add config-driven opt-out/extensibility references
    - Touchpoints: session-init, session-handoff (strategy-dev-methodology removed in 3.3)

- [ ] **3.5 Redesign session-init loading sequence**

    **Goal:** Implement new Tier 1 per WU1.5 Gap 2 specification.

    - [ ] **3.5.a Rewrite Step 2 (Load AI Context)**
        - New sequence: AGENTS.md → agent file → DEV-RULES.ARC → DEV-RULES.PROJECT →
          STRATEGY-INDEX → QUICK-REFERENCE → WORK-STATUS.md → active task list
        - process-task-loop → Tier 2a (triggered from DEV-RULES.ARC)
        - CURRENT-SESSION.md → WORK-STATUS.md per ADR-007

    - [ ] **3.5.b Add agent-switching awareness note**
        - Per WU1.5 Req 11: if SESSION.md was written by different agent, extract factual
          content and disregard agent-specific references

- [ ] **3.6 Formalize Tier 2a trigger pattern across Tier 1 documents**

    - Audit all Tier 1 docs for ad-hoc Tier 2 cross-references
    - Convert to consistent format: "Before X, load Y"
    - Strengthen STRATEGY-INDEX entries with "Consult when:" phrasing

- [ ] **3.7 Update cross-references from restructure**

    **Goal:** No broken or stale references after document restructure.

    - Search for all references to `DEVELOPMENT-RULES`, `strategy-development-methodology`,
      `CURRENT-SESSION`
    - Update to new names: `DEV-RULES.ARC`, `DEV-RULES.PROJECT`, `WORK-STATUS.md`,
      `SESSION.md`
    - Verify link definitions at bottom of each modified file

- [ ] **3.8 Run Tier 2 quality gates**
    - Full-project lint: `npm run -s lint:md`
    - Verify all cross-references resolve
    - Coherent unit boundary — structural foundation for subsequent phases

### **Phase 4:** Session Workflow Overhaul

**Purpose:** Implement operational session improvements — bootstrap, task references, mismatch
recovery, staleness detection.

**Note:** All changes use ADR-007 model (WORK-STATUS.md + SESSION.md).

- [ ] **4.1 Handle first-session bootstrap and "no active work" state**

    **Goal:** Session-init works cleanly from first init through between-work-unit gaps.

    - [ ] **4.1.a Update `01_initialize-arc.md`**
        - Scaffold WORK-STATUS.md during init with "no active work" defaults
        - All fields present: Work Unit `[none]`, Branch `main`, Task List `[none]`,
          Current Task `—`, Blockers `[none]`, Next Action → create-prd workflow

    - [ ] **4.1.b Update `session-init.md` for "no active work" detection**
        - When WORK-STATUS.md has `Work Unit: [none]`: skip task list loading, report
          state, point to appropriate next workflow

    - [ ] **4.1.c Update `activate-work-unit.md`**
        - Step 7: reference WORK-STATUS.md; activation populates placeholder with real values

    - [ ] **4.1.d Update `archive-completed.md` WORK-STATUS.md handling**
        - Archival to base branch: reset WORK-STATUS.md to "no active work" state
        - Archival to parent work branch (stacked incidental → parent): restore
          WORK-STATUS.md to parent's work unit (resume, not reset)

- [ ] **4.2 Stabilize task references with triple-anchor format**

    **Goal:** Replace fragile line-number anchors with graduated lookup.

    - [ ] **4.2.a Define format and update `session-init.md`**
        - Format: `Task 4.1 — Design bootstrap (line ~228)`
        - Lookup protocol: line hint → verify number → search number → search title → report
        - Replace hard requirement for line numbers with triple-anchor lookup

    - [ ] **4.2.b Update `session-handoff.md`**
        - Update Current Task format in template and examples
        - `Task 3.3 (line 247)` → `Task 3.3 — Write unit tests (line ~247)`

    - [ ] **4.2.c Update `activate-work-unit.md` and WORK-STATUS.md template**
        - Step 7: use triple-anchor format in field documentation

- [ ] **4.3 Add mismatch recovery protocol to `session-init.md`**

    **Goal:** Replace flat "stop and ask" with tiered recovery.

    - Restructure Step 4 into two-tier model
    - Trust hierarchy: git state > task list > WORK-STATUS.md > SESSION.md
    - Auto-recover with notice: git + task list agree, session doc is outlier
    - Stop and ask: ambiguous intent, multiple plausible explanations
    - Report format: "Session doc said X. Git/task list show Y. Proceeding with Y."

- [ ] **4.4 Add staleness detection to `session-init.md`**

    - [ ] **4.4.a Add commit hash anchor to `session-handoff.md`**
        - Write "Commit at Handoff" field into SESSION.md: `git rev-parse HEAD`

    - [ ] **4.4.b Add freshness check to `session-init.md`**
        - Compare SESSION.md anchor against HEAD; report commit gap count
        - WORK-STATUS.md: compare last commit touching it against HEAD
        - Informational, not blocking — feeds confidence into mismatch recovery
        - Runs between context loading and mismatch detection

- [ ] **4.4.x Formalize persistent context convention in `session-handoff.md`**

    The handoff workflow already informally supports protected sections ("DO NOT
    REMOVE UNTIL..."). Formalize as a first-class convention:

    - Standard section name: `### Persistent Context` in SESSION.md
    - Each entry has an explicit removal trigger (e.g., "Until Phase 3 restructure
      completes", "Until auth migration lands on main")
    - Handoff workflow: explicitly preserve persistent context sections — rewrite
      ephemeral sections only
    - SESSION.md template: include as optional block with guidance on when to use
    - Session-init: read persistent context alongside ephemeral session state
    - Scope: not tied to full work unit completion — triggers are per-entry

- [ ] **4.5 Run Tier 1 quality gates on Phase 4 changes**

### **Phase 5:** Configuration and Customization Infrastructure

**Purpose:** Build the complete customization system — config, hooks, extensions, methods.

**Strategies:** `strategy-configurability-architecture.md`

- [ ] **5.1 Expand `arc-config.yml` settings**

    **Goal:** Add all ADR-003 designated settings with inline documentation.

    - Settings: `commit.format`, `commit.context_footer`, `commit.custom_pattern`,
      `commit.context_pattern`, `merge.strategy`, `hooks.pre_commit`, `hooks.commit_msg`,
      `platform.type`
    - Shell-parseable flat/shallow format
    - Inline comments: description, valid values, default
    - Update both `.arc/system/arc-config.yml` and `.arc-internal/system/arc-config.yml`

- [ ] **5.2 Make commit-msg hooks configurable**

    - [ ] **5.2.a Update `.arc/system/githooks/commit-msg`**
        - Read `commit.format`: conventional (default), custom pattern, disabled
        - Read `commit.context_footer`: required (default), recommended (warn), disabled
        - Support custom patterns via regex settings

    - [ ] **5.2.b Update `.arc-internal/system/githooks/commit-msg`**
        - Mirror changes from 5.2.a (paired hook update)

    - [ ] **5.2.c Update merge strategy references**
        - Remove/qualify "no squash merge" in `atomic-commit.md` and
          `strategy-work-organization.md`
        - Update `archive-completed.md` merge command to reference config
        - Add prose: how ARC's value survives squash merging

- [ ] **5.3 Make pre-commit hook patterns extensible**

    - Make debug statement patterns configurable (currently JS/Python only)
    - Make meta-project reference file extensions configurable
    - Add hook comments noting adopter adjustment needs
    - Update both `.arc/` and `.arc-internal/` copies
    - **Internal hook addition**: Add check to `.arc-internal/` pre-commit that blocks
      `.arc-internal/` references in staged `.arc/` files (public/internal boundary
      enforcement — see DEVELOPMENT-RULES § File Organization). Public hook doesn't
      need this check (adopters won't have `.arc-internal/`).

- [ ] **5.4 Scaffold `arc-extensions.md`**

    - New file: `.arc/system/workflows/arc-extensions.md`
    - Section per preset point: workflow reference, trigger, contract, placeholder
    - Presets: `post-task-quality`, `post-unit-quality`, `post-context-load`,
      `pre-stage-review`
    - Evaluate during implementation — target 0-3 per workflow

- [ ] **5.5 Scaffold `arc-methods.md` with method dependencies**

    **Goal:** Method override infrastructure with coupled-method awareness.

    - New file: `.arc/system/workflows/arc-methods.md`
    - Section per preset: workflow reference, trigger, contract, default, project override
      placeholder
    - Presets: task-completion, quality gates, session state, commit context format
    - `Related:` field per WU1.5 Gap 6 (task-completion ↔ commit-context-format)
    - Dependency map table

- [ ] **5.6 Insert extension and method markers into workflows**

    - [ ] **5.6.a Insert extension point markers**
        - Block-style bounded by horizontal rules at preset locations
        - Format: `**Extension Point — [Name]** · #[anchor]`, contract, link

    - [ ] **5.6.b Insert method markers**
        - Same visual pattern
        - Touchpoints: process-task-loop, session-init, session-handoff, atomic-commit

- [ ] **5.7 Add session-init config awareness step**

    - After standard document loading: read `arc-config.yml` and `arc-methods.md`
    - Note non-default values and populated method overrides
    - Verify consistency with DEV-RULES.ARC method-override pointers

- [ ] **5.8 Run Tier 2 quality gates**
    - Full-project lint: `npm run -s lint:md`
    - Coherent unit boundary — complete customization system

### **Phase 6:** Team, External, and Adoption

**Purpose:** Add team mode awareness, external tool guidance, adoption tier behavior.

**Strategies:** `strategy-team-coordination.md`, `strategy-configurability-architecture.md`

- [ ] **6.1 Add Workflow Adaptations section to `strategy-team-coordination.md`**

    - Concise mapping: which files change path, per-pair scoping, branch usage
    - Brief reference table sufficient

- [ ] **6.2 Add team mode callouts to session workflows**

    - `session-handoff.md`: update `team/{name}/` paths in team mode
    - `activate-work-unit.md` Step 7: each developer updates own session file
    - `session-init.md` Step 2: team mode note for session state loading
    - Reference session model config setting per ADR-002

- [ ] **6.2.x Document WORK-STATUS.md merge convention in `strategy-work-organization.md`**

    Document the "base branch baseline" convention and merge resolution behavior
    as a subsection of § Task Lists and Branches (adjacent to the "Branch scope"
    paragraph added during WU2 Phase 3 prep):

    - **Convention**: In protected modes, WORK-STATUS.md on the base branch is always
      in its "no active work" default state. Work branches diverge; merges restore.
      In unprotected mode, the base branch IS the workspace — WORK-STATUS.md
      reflects active work.
    - **Merge resolution rule**: `.gitattributes` `merge=ours` auto-resolves local
      merges (keeps target branch version). For PR merges (server-side, no local
      merge drivers), the resolution is always "take base" — deterministic, trivial.
    - **Why it works**: Post-merge workflows (rotate-branch step 5, archive-completed
      reset) always update WORK-STATUS.md immediately, so the auto-resolved content
      is transient.
    - **Protection mode awareness**: Convention adapts to mode — the merge driver is
      mode-agnostic (`merge=ours` keeps target version regardless of content).
    - Update `strategy-team-coordination.md` § "Session State Has No Conflicts" to
      distinguish SESSION.md (personal, no conflicts) from WORK-STATUS.md (shared,
      trivial conflicts with documented resolution).
    - Rationale: flows from ADR-007 (WORK-STATUS.md tracked); not ADR-worthy itself
      (implementation convention, not architectural decision).

- [ ] **6.3 Add person-to-person task handoff protocol**

    - Outgoing: enhanced handoff with implementation context
    - Incoming: reads and bootstraps from ADR-007 infrastructure (git notes)
    - Add to `strategy-team-coordination.md` or team variant in `session-handoff.md`

- [ ] **6.4 Add per-pair qualifications**

    - Session Documentation Control: personal session file in team mode
    - Task Management: "one task at a time" per developer-agent pair
    - Apply to whichever document hosts this content after Phase 3

- [ ] **6.5 Add team mode to `activate-work-unit.md` and `weekly-review.md`**

    - activate-work-unit: multiple branches for sub-branches, personal session files
    - weekly-review: personal `team/{name}/ATOMIC-TASKS.md`; micro-branch for review
      commits in fully protected mode

- [ ] **6.6 Streamline dual-tracker workflow guidance**

    - Per ADR-005/ADR-006: ARC task lists as "working scratchpad" alongside external trackers
    - Reference practice over tool in workflow prose
    - Add extension points at task completion / status reporting if warranted

- [ ] **6.7 Implement config-driven adoption tier behavior**

    - Per ADR-004: profiles (Essentials/Recommended/Custom) applied to identical files
    - Reduce ceremony for Essentials tier in relevant workflows
    - Document deferred review escape hatch more prominently

- [ ] **6.8 Run Tier 1 quality gates on Phase 6 changes**

### **Phase 7:** Convention Gaps and Methodology Polish

**Purpose:** Close all remaining convention and workflow completeness gaps.

- [ ] **7.1 Update archive workflow documentation**

    **Goal:** Three related improvements to `archive-completed.md`.

    - [ ] **7.1.a Add verification section to completion doc template**
        - Makes verified results visible in archive output

    - [ ] **7.1.b Close post-review quality gate gap**
        - Phase 2: add post-review QG re-run (mandatory Tier 1 after review-driven commits)

    - [ ] **7.1.c Add research file routing**
        - Phase 3: decision point — "Do any files have reference value beyond this work
          unit?" Route to `reference/research/`

- [ ] **7.2 Research and establish document evolution guidance**

    **Goal:** Define ADR/PRD amendment conventions.

    - Research ADR amendment practices before designing
    - ADRs: minor corrections vs. full supersession
    - PRDs: post-implementation updates (amend, annotate, or leave historical)
    - Add "Amending This Document" section convention to templates
    - **Strategies:** `strategy-adr-methodology.md`

- [ ] **7.3 Add intermediate work-unit status**

    - Select label for "done but unmerged" state
    - Standardize across: `archive-completed.md`, `agent-pre-merge-review.md`,
      PROJECT-STATUS template, ROADMAP
    - Set intermediate in Phase 1 (pre-merge), final in Phase 3 (post-merge)

- [ ] **7.4 Address version reference drift**

    - Evaluate: behavioral norm, hook validation, or both
    - Implement selected approach for versioned source-of-truth docs

- [ ] **7.5 Expand incidental context patterns in commit-msg hook**

    - Assess overlap with Phase 5 custom pattern support first
    - If not covered: expand patterns or generalize regex
    - Update both hook copies

- [ ] **7.6 Evaluate and resolve PROJECT-STATUS location**

    - Options: `.arc/` root, `reference/` root, or leave in `constitution/`
    - If moved: update references in `02_define-project.md`, `archive-completed.md`,
      `weekly-review.md`, PROJECT-STATUS template

- [ ] **7.7 Update `1_create-prd.md` workflow**

    - [ ] **7.7.a Extract PRD format to template reference**
        - Step 4: replace inline definition with reference to `template-prd.md`
        - Keep brief orientation summary

    - [ ] **7.7.b Strengthen discovery step**
        - Step 3: reference discovery checklist from `strategy-work-planning.md`

    - [ ] **7.7.c Reference planning lifecycle**
        - Step 1: reference `strategy-work-planning.md` for plan-\* conventions

- [ ] **7.8 Enumerate deferred review stop conditions**

    - In `3_process-task-loop.md` deferred review section (lines 57-63)
    - "Must stop": QG failure, blocking dependency, unanticipated design decisions,
      scope excess
    - "Continue with note": auto-fixed lint, longer than expected, minor deviation
    - Keep concise — guidance, not exhaustive ruleset

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
