# Task List: Structural Readiness Pass

**PRD:** `.arc-internal/active/technical/prd-structural-readiness-pass.md`
**Created:** 2026-02-20
**Branch:** `technical/structural-readiness-pass`
**Base Branch:** `main`
**Status:** In Progress

## Overview

**Purpose:** Restructure the `.arc/` template system and parallel `.arc-internal/` workspace for distribution
readiness and team viability — clean directory roles, reduced merge conflict surface, decoupled branch-task list
model, configurable branching model with planning branches, and first-pass team coordination content.

**Reference data:** `notes-structural-readiness-pass.md` (same directory) contains lookup tables needed during
implementation: file classification inventory (46 files), DEVELOPMENT-RULES content map (line-by-line), and
cross-cutting dependency map with blast radius per concept.

## Scope

### Will Do

- Directory restructuring: `reference/` → `reference/` + `system/` split (`.arc/` and `.arc-internal/`),
  with `system/workflows/` organized into `arc/` + `project/` subdirectories
- File renaming: `.example.md` → `.template.md` (16 files in `.arc/`)
- Content splits: DEVELOPMENT-RULES methodology extraction, quality gate dedup, backlog org extraction
- Cross-cutting concept updates: file classification strategy, branch-task list decoupling,
  configurable branching model (planning branches, base branch concept, branch protection modes,
  config file, githook updates), workflow updates
- First-pass content: `getting-started.md`, team coordination docs, audience indicators
- Team mode structure: `team/` directory with templates and documentation
- All cross-reference updates across both `.arc/` and `.arc-internal/`

### Won't Do

- CLI implementation (Phase C work)
- Content rewriting (B.2 handled content quality)
- Slash command dedup (needs CLI generation script — Cluster E, deferred)
- Polished onboarding (CLI flow will reshape `getting-started.md`)
- New workflow creation (changes to existing workflows only)
- Full branching strategy documentation (adaptation points documented, not full alternative workflows)

---

## Tasks

### **Phase 1:** Directory Restructuring (B1, B2)

**Purpose:** Establish the `reference/` + `system/` directory split, organize `system/workflows/` into
`arc/` + `project/` subdirectories, and update all cross-references. Moves committed before content
changes to preserve git history tracking.

- [x] **1.1 Execute directory moves and workflow reorganization**

    All `git mv` operations and new directory scaffolding completed. Structure verified:

    - `.arc/reference/` retains: adr/, archive/, constitution/, research/, strategies/, QUICK-REFERENCE
    - `.arc/system/` contains: agent/, commands/, githooks/, workflows/ (arc/ + project/), README.md
    - `.arc-internal/reference/` retains: adr/, archive/, constitution/, research/, strategies/, QUICK-REFERENCE
    - `.arc-internal/system/` contains: agent/, workflows/ (arc/supplemental/ + project/)
    - `0_define-constitution.md` renamed to `define-constitution.md` in `arc/setup/`
    - New files: system/README.md, workflows/project/README.md, commands/README.md, commands/.gitkeep

- [x] **1.2 Update cross-references in agent files**

    Updated 11 files (6 `.arc/` templates + 5 `.arc-internal/` live files):

    - `../constitution/` → `../../reference/constitution/`, `../QUICK-REFERENCE` → `../../reference/QUICK-REFERENCE`
    - `../workflows/3_process-task-loop.md` → `../workflows/arc/3_process-task-loop.md` (`.arc/` templates)
    - `../../.arc/reference/workflows/` → `../../../.arc/system/workflows/arc/` (`.arc-internal/` cross-tree refs)
    - README.md: `.arc/reference/agent/` → `.arc/system/agent/` (absolute-style path refs)
    - AGENTS.md: updated source-of-truth and template-vs-internal descriptions for new structure

- [x] **1.3 Update cross-references in workflow and githook files**

    Updated 15 files across workflows and githooks:

    - Core workflows (3): `../strategies/` → `../../../reference/strategies/`, define-constitution
      link updated to `setup/`, manage-incidental-work link to `supplemental/`
    - Setup workflow (1): `../constitution/` → `../../../../reference/constitution/` (4 refs)
    - Supplemental workflows (6): `../../strategies/` and `../../constitution/` →
      `../../../../reference/...` pattern
    - Session-init (2, both `.arc/` and `.arc-internal/`): agent paths and process-task-loop path
    - Githooks (3): `.arc/reference/githooks` → `.arc/system/githooks` in README, commit-msg,
      pre-commit; updated `core.hooksPath` config
    - Internal workflows README: rewrote directory structure and cross-tree links
    - Also fixed pre-existing broken link: maintain-task-notes `../constitution/` (was wrong depth)

- [x] **1.4 Update cross-references in non-moved files**

    Updated 7 files with corrected paths for moved directories:

    - `.arc/README.md`: directory tree restructured to show `reference/` + `system/` split
    - `.arc/reference/constitution/DEVELOPMENT-RULES.example.md`: 7 refs updated (workflows, agent,
      githooks, session-init)
    - `.arc/reference/QUICK-REFERENCE.example.md`: no changes needed (no refs to moved dirs)
    - `.arc/reference/strategies/arc/strategy-work-organization.md`: 9 refs updated (workflows,
      constitution depth fix)
    - `.arc/reference/strategies/arc/strategy-task-list-formatting.md`: 5 refs updated (workflows)
    - `.arc/reference/strategies/arc/strategy-adr-methodology.md`: 2 refs fixed (pre-existing
      `../adr/` → `../../adr/` depth bug)
    - `.arc-internal/reference/constitution/DEVELOPMENT-RULES.md`: 10 refs updated (cross-tree
      workflow links, agent, githook path, strategy depth fix)
    - `.arc-internal/reference/QUICK-REFERENCE.md`: key documentation listing updated with
      `reference/` and `system/` prefixes
    - Githook README hooks path already updated in Task 1.3
    - **Note:** Stale refs remain in root README.md, CHANGELOG, `.claude/commands/`,
      `.codex/prompts/`, `.arc-internal/README.md`, `.arc/active/CURRENT-SESSION.example.md` —
      these are outside Task 1.4 scope and will be caught by Task 1.5 verification sweep

- [x] **1.5 Verify no stale directory references remain**

    Grep-based sweep found and fixed 12 additional files beyond Task 1.4 scope:

    - `.claude/commands/` (3 files): resume-current, atomic-commit, handoff — updated paths
    - `.claude/agents/documentation-reviewer.md`: 2 refs to optimize-doc workflow
    - `.codex/prompts/` (3 files): resume-current, atomic-commit, handoff — parallel updates
    - `README.md`: 12 workflow refs updated (paths + fixed pre-existing filename mismatches:
      `1-create-prd.md` → `1_create-prd.md`, `agent-pr-review.md` → `agent-pre-merge-review.md`)
    - `.arc-internal/README.md`: directory tree + 3 text references updated
    - `.arc-internal/reference/constitution/TECHNICAL-OVERVIEW.md`: directory tree restructured
    - `.arc/active/CURRENT-SESSION.example.md`: session-init path
    - `.arc-internal/system/workflows/project/sync-with-arc-framework.md`: 6 example paths
    - Remaining hits: all in excluded categories (archive/, CHANGELOG, active work context,
      notes/PRD/task-list meta-references, backlog plans)
    - Full project lint: 0 violations across 90 files

### **Phase 2:** Naming and Convention Cleanup (B3, B4, B5)

**Purpose:** Rename `.example.md` files to `.template.md` to reflect actual function, and clean up version
conventions. Renames committed before content changes.

- [ ] **2.1 Rename `.example.md` files to `.template.md`**

    **Goal:** Mechanical `git mv` renames across `.arc/`.

    - Rename all 16 `.example.md` files to `.template.md` (use post-Phase 1 paths under `system/`
      and `reference/`)
    - Special case: `reference/archive/technical/completion-sample.example.md` →
      `completion-sample.md` (it's a sample, not a template)
    - Check `.markdownlint-cli2.jsonc` for `.example.md` references and update if found
    - No `.arc-internal/` renames needed (live files don't use `.example.md` suffix)

- [ ] **2.2 Update documentation referencing `.example.md` naming convention**

    - `.arc/README.md`: update any mentions of `.example.md` convention to `.template.md`
    - `.arc/system/agent/README.md`: update naming convention references
    - `.arc/system/workflows/arc/setup/define-constitution.md`: update references to template files
    - Grep for remaining `.example.md` mentions in non-archive files; update to `.template.md`

- [ ] **2.3 Update version and maintenance conventions (B5)**

    - Remove version footer from `system/workflows/arc/supplemental/maintain-docs.md`
    - Reframe DEVELOPMENT-RULES version header guidance: from "framework versioning" to "project
      rule evolution tracking"
    - Update in both `.arc/` template and `.arc-internal/` live version

### **Phase 3:** Content Splits (A1–A4)

**Purpose:** Separate framework methodology from project-configurable content in high-impact files. Reduces
merge conflict surface for framework updates.

- [ ] **3.1 Create `strategy-development-methodology.md` (A1)**

    **Goal:** New strategy doc containing ~230 lines of framework-universal operational rules extracted from
    DEVELOPMENT-RULES.

    - Create `.arc/reference/strategies/arc/strategy-development-methodology.md`
    - Content to extract (see notes doc Deliverable 2 for line-by-line content map):
        - Commit Standards (control, format, atomicity, enforcement)
        - Quality Gate Failure Protocol
        - Leave It Cleaner Protocol
        - Session Documentation Control
        - Verification Protocol
        - Strategy Document Protocol
        - Session Context Management
        - Core Document Reference Protocol
        - Task Management Protocol (one task at a time, granularity, implied permission)
        - Test-First Protocol
        - Code Documentation Standards
    - Add introduction, table of contents, and cross-references to related docs
    - Use existing strategy docs (e.g., `strategy-quality-gates.md`) as format reference

- [ ] **3.2 Slim DEVELOPMENT-RULES template and live versions (A2, A3)**

    **Goal:** Remove extracted methodology from both files. Replace quality gate table with cross-reference.
    Verify each is self-contained.

    - `.arc/reference/constitution/DEVELOPMENT-RULES.template.md`: remove methodology sections, add
      cross-reference to `strategy-development-methodology.md`
    - `.arc-internal/reference/constitution/DEVELOPMENT-RULES.md`: parallel removal and cross-reference
    - A3: Replace Quality Gate Tiers table in both files with summary + cross-reference to
      `strategy-quality-gates.md` (eliminates duplication from notes doc Deliverable 4)
    - Verify remaining content is self-contained: header, quality gates with project commands, testing
      requirements, code quality principles, architecture documentation, reference links

- [ ] **3.3 Create `strategy-backlog-organization.md` (A4)**

    **Goal:** Extract backlog organization as independent strategy doc.

    - Create `.arc/reference/strategies/arc/strategy-backlog-organization.md`
    - Extract from `strategy-work-organization.md` section 11 (Backlog Organization, ~55 lines):
      Structure, Processing Flow, Key Design Points, Commit Context for Atomic Tasks
    - Update `strategy-work-organization.md`: replace extracted section with cross-reference
    - Update cross-references from `weekly-review.md` and `ATOMIC-TASKS.template.md`

- [ ] **3.4 Update cross-references for content splits**

    **Goal:** Route "see DEVELOPMENT-RULES" references to the correct file based on content.

    - Agent files: add `strategy-development-methodology.md` reference where methodology is discussed
    - Session-init reading list: add `strategy-development-methodology.md` to loading order
    - `commit-msg` hook: update help text referencing DEVELOPMENT-RULES format details → point to
      methodology strategy
    - Workflow and strategy docs: audit references to DEVELOPMENT-RULES sections that moved
    - Grep verification: search for `DEVELOPMENT-RULES` mentions, verify each points to correct file

### **Phase 4:** Cross-Cutting Concept Updates (C1–C13)

**Purpose:** Codify file classification, decouple branches from task lists, establish configurable branching
model (planning branches, base branch concept, branch protection modes), and update all affected workflows,
templates, and tooling.

- [ ] **4.1 Create `strategy-file-classification.md` (C1)**

    **Goal:** Canonical reference for file classification taxonomy, used by CLI update system for merge
    strategy per file.

    - Create `.arc/reference/strategies/arc/strategy-file-classification.md`
    - Define taxonomy: Framework / Configurable / Scaffolded / Project-owned
    - Include complete file inventory (notes doc Deliverable 1, all 46 files) plus new files
      introduced in this work unit (`.arc/config.yml`, `.arc/config.template.yml`)
    - Use post-restructure paths and names (after Phases 1–3: `system/` paths, `.template.md` names)
    - Document merge strategy implications per classification

- [ ] **4.2 Decouple branch-task list model and introduce base branch concept (C2, C8)**

    **Goal:** Replace 1:1 enforcement with many-to-one guidance. Replace hardcoded `main` with
    configurable "base branch" concept throughout `strategy-work-organization.md`.

    - Remove the 1:1 "Key rule" (currently line ~349)
    - Replace with guidance: task lists = unit of work planning, branches = unit of code delivery,
      relationship is many-to-one
    - Solo 1:1 pattern remains the default but is not enforced as a rule
    - Add guidance for stacked PRs, team sub-branches, multi-branch scenarios
    - Update Branch Lifecycle section and any other "Key rule" references
    - Replace all hardcoded `main` references with "base branch" language (Git Workflow section,
      stacked branch diagrams, merge examples)
    - Note: base branch defaults to `main`, configured in `.arc/config.yml` (created in task 4.3)

- [ ] **4.3 Create `.arc/config.yml` and config template (C9)**

    **Goal:** Introduce ARC's project-level configuration file.

    - Create `.arc/config.template.yml` with defaults and explanatory comments:
        - `base_branch: main` — configurable base branch name
        - `branch_protection: partial` — options: `unprotected`, `partial`, `full`
    - Create `.arc/config.yml` for framework project (`.arc-internal/` uses same)
    - Keep format simple enough for line-based shell parsing (no nested structures)
    - Document in `.arc/README.md` directory overview

- [ ] **4.4 Add planning branch workflow and branch protection modes (C10, C11)**

    **Goal:** Document ARC's default planning branch workflow and three configurable branch protection
    modes in `strategy-work-organization.md`.

    - **Planning branch workflow (C10):** New section documenting the `planning/*` branch lifecycle:
      create from base → create PRD, task list, notes in `backlog/{category}/` → PR to base branch
      → review → merge → delete planning branch → create implementation branch via
      activate-work-unit. Note: planning branch name need not match final work unit name (scope
      crystallizes during planning)
    - **Branch protection modes (C11):** New section defining three modes with decision guidance
      (team size, risk tolerance, CI/CD maturity):
        - **Unprotected**: Branches optional. No base branch commit restrictions. Suited for solo
          devs prioritizing speed
        - **Partially protected** (default): Planned work units require planning + implementation
          branches. Backlog capture, atomic tasks, maintenance may commit directly to base branch
        - **Fully protected**: All changes require branches + PRs. No direct base branch commits.
          Suited for teams with branch protection rules
    - Include a summary table and a "choosing your mode" decision guide

- [ ] **4.5 Update activation and archive workflows (C3, C4)**

    **Goal:** Align workflows with decoupled model, planning branch prerequisite, and base branch
    concept.

    - `activate-work-unit.md` (C3): add planning branch merge as prerequisite, create
      primary/integration branch, acknowledge additional branches may be created during work.
      Replace hardcoded `main` with base branch references. Add mode-specific note: in unprotected
      mode, planning branch step is optional
    - `archive-completed.md` (C4): trigger on task completion (all tasks `[x]`), not branch deletion.
      Branch cleanup happens independently as PRs merge
    - Both files at `.arc/system/workflows/arc/supplemental/` (post-Phase 1 path)

- [ ] **4.6 Update templates and strategy index (C5, C6, C7)**

    - Task list template header (C5): update `strategy-task-list-formatting.md` to support
      `Branch(es):` field (or equivalent multi-branch syntax). `Base Branch:` field references
      configured base branch concept rather than hardcoding `main`
    - `PROJECT-STATUS.template.md` (C6): track active work by work unit name with branch(es) as
      metadata, not branch as primary key
    - `STRATEGY-INDEX.md` (C7): add entries for all new strategy docs —
      `strategy-development-methodology.md`, `strategy-file-classification.md`,
      `strategy-backlog-organization.md`

- [ ] **4.7 Update pre-commit githook for config-aware branch protection (C12)**

    **Goal:** Make githook read configuration and adjust base-branch-commit behavior per mode.

    - Add config reading function: parse `base_branch` and `branch_protection` from
      `.arc/config.yml` using shell-native parsing (grep + cut or similar, no YAML library)
    - Graceful degradation: if no config file or missing settings, default to `partial` protection
      and `main` as base branch (backward-compatible)
    - Adjust base-branch-commit check behavior:
        - `unprotected`: skip check entirely (no warning, no error)
        - `partial`: warning with improved messaging (current behavior, better text)
        - `full`: error that blocks the commit
    - Replace hardcoded `main` branch name with configured base branch value
    - Update githook README to document new config-aware behavior
    - Test all three modes manually

- [ ] **4.8 Verify no hardcoded base branch references remain (C8 verification)**

    **Goal:** Grep-based sweep for stale `main` branch references.

    - Grep for patterns indicating hardcoded base branch: `"main"` in branch context,
      `Base Branch.*main`, `--base main`, `origin main`, `checkout.*main` across all `.md` files
      and hook scripts
    - Exclude: archive directories, notes doc, prose usage of "main" (not branch references)
    - Also grep for remaining hardcoded `main` in config-reading code (should use variable)
    - Fix any missed references
    - Run markdown lint on all modified files

### **Phase 5:** Workflow and Coverage Gaps (D1–D4)

**Purpose:** Fill documentation gaps identified during structural analysis. First-pass content structured for
future refinement.

- [ ] **5.1 Create `getting-started.md` (D1)**

    **Goal:** First-pass onboarding content, structured in independent sections for easy replacement when CLI
    work clarifies the actual onboarding flow.

    - Create `.arc/reference/getting-started.md`
    - Content: adoption story (README → `.arc/README.md` → setup), file placement rationale (why ARC
      manages agent config loading via session-init), session-init loading chain, "what to customize
      first" guidance
    - Structure for replaceability: clear sections that can be rewritten independently
    - Cross-reference from `.arc/README.md`

- [ ] **5.2 Update workflows and conventions (D2, D3, D4)**

    - [ ] 5.2.a Update `define-constitution.md` (D2, C13) — add ROADMAP as a step (foundational
      planning artifact alongside other constitutional documents). Add base branch name and branch
      protection level as setup-time decisions, written to `.arc/config.yml` during project
      bootstrap. Include brief guidance for each mode choice with cross-reference to
      strategy-work-organization.md. Post-restructure path: `system/workflows/arc/setup/`
    - [ ] 5.2.b Formalize audience indicator convention in `.arc/README.md` (D3) — expand "Document
      Audiences" table, add note about `**Audience:**` headers, verify consistent application in
      existing files that partially use it
    - [ ] 5.2.c Add working directory note to CURRENT-SESSION template (D4) — note in "Additional
      Context" section that working directory changes should be captured if relevant to the project

### **Phase 6:** Team Adaptation (B6, F1–F3)

**Purpose:** Establish team mode structure and document coordination conventions. Lightweight conventions
only — no automation or assignment tooling.

- [ ] **6.1 Create `team/` directory structure (B6)**

    **Goal:** Template scaffolding for team mode, activated by CLI init option.

    - Create `.arc/team/` with README explaining purpose and solo-vs-team model
    - Include `.gitkeep` for empty state
    - Create template `CURRENT-SESSION.md` and `ATOMIC-TASKS.md` for team member directories
    - README content: directory purpose, per-member subdirectory convention (`team/{name}/`), how CLI
      init creates the structure
    - Note: describe `team/{name}/` as default without precluding nested groupings
      (e.g., `team/frontend/alice/`). Avoid language that implies flat-only structure

- [ ] **6.2 Add team coordination guidance (F1, F2)**

    **Goal:** Lightweight conventions for multi-developer-agent collaboration.

    - F1: Add team coordination section to `strategy-work-organization.md` (or linked supplement):
        - Task ownership markers: `(@name)` convention
        - Team branching patterns: shared integration branch, personal sub-branches, stacked PRs per
          developer, direct shared branch
        - Task list merge conflict expectations: trivially resolvable, set expectations
    - F2: Integration point acknowledgment: teams using external trackers (Jira, Linear, GitHub
      Issues) use those for assignment/status while ARC task lists handle implementation detail.
      External tool = assignment layer, ARC = execution layer

- [ ] **6.3 Document communal `active/` + personal `team/` model (F3)**

    - Document in `.arc/README.md` directory overview and/or `team/README.md`:
        - What lives where: communal work artifacts in `active/`, personal session state in
          `team/{name}/`
        - Why the separation exists: no file-level conflicts between team members' session state
        - Solo-to-team transition: how existing solo `active/CURRENT-SESSION.md` relates to team
          `team/{name}/CURRENT-SESSION.md`
        - TASK-INBOX as communal capture point: quick tasks captured, triaged during weekly review,
          assigned to team member's ATOMIC-TASKS or promoted to backlog

### **Phase 7:** Final Verification and Quality Gates

**Purpose:** Comprehensive Tier 3 validation of all structural changes, cross-references, and success
criteria.

- [ ] **7.1 Run full markdown linting**

    - `npx --yes markdownlint-cli2 "**/*.md"` — zero violations required
    - Fix any issues found

- [ ] **7.2 Cross-reference verification**

    - Grep for stale path patterns: `reference/agent/`, `reference/workflows/`, `reference/githooks/`,
      `.example.md`
    - Verify no broken internal links (spot-check key documents: session-init, CLAUDE agent file,
      DEVELOPMENT-RULES, README, getting-started)
    - Verify hooks path references correct `system/githooks/` location

- [ ] **7.3 Validate success criteria against PRD**

    - Walk through each PRD success criterion and verify
    - Structural: directory purposes clear, no `.example.md` files, zero lint violations
    - Work model: 1:1 rule removed, workflows support many-to-one, templates support multi-branch
    - Branching model: no hardcoded `main` references, config file exists with both settings,
      planning branch workflow documented, three protection modes documented with decision
      guidance, githook reads config and adjusts per mode, define-constitution includes branch
      model setup decisions
    - Merge conflict surface: DEVELOPMENT-RULES slimmed, methodology in strategy doc
    - First-pass content: `getting-started.md`, team docs, audience indicators, new strategy docs
      exist and indexed
    - Cross-references: zero broken references confirmed

---

## Implementation Notes

**Commit strategy per PRD Technical Considerations:**

- Phase 1: `git mv` operations as one commit, cross-reference updates as subsequent commit(s)
- Phase 2: `git mv` renames as one commit, reference updates as subsequent commit
- Phase 3: strategy doc creation + DEVELOPMENT-RULES slimming can be one commit per split
  (A1+A2+A3 together, A4 separate). Cross-reference routing as follow-up
- Phase 4: natural commit boundaries align with parent tasks. Config file (4.3) and strategy
  content (4.4) should be committed before githook update (4.7) which depends on both.
  Verification (4.8) is last in the phase
- Phases 5–6: natural commit boundaries align with parent tasks

**Notes doc reference:** `notes-structural-readiness-pass.md` (same directory) contains:

- Deliverable 1: File classification inventory (46 files + new config files) — needed for task 4.1
- Deliverable 2: DEVELOPMENT-RULES content map (line-by-line) — needed for tasks 3.1/3.2
- Deliverable 4: Cross-cutting dependency map with blast radius — needed for tasks 1.2–1.5, 3.4

**Self-referential change:** Session-init moves to `system/workflows/arc/supplemental/` AND its content
references paths that change. Verify by reading the file and tracing each path after updates.

**Workflow reorganization:** The `arc/` + `project/` split within `system/workflows/` mirrors the
`strategies/` pattern (`arc/` for ARC methodology, `project/` for user-created). `.arc-internal/`
benefits: `sync-*.md` workflows move to `project/` (framework-project-specific), cleanly separated
from ARC methodology workflows in `arc/`.

**`.arc-internal/` parallel scope by phase:**

- Phase 1: directory moves + workflow reorg + all cross-references (agent files, workflows, constitution,
  QUICK-REFERENCE)
- Phase 2: no renames needed (live files don't use `.example.md` suffix)
- Phase 3: DEVELOPMENT-RULES.md split parallels template version
- Phase 4: `.arc-internal/` needs config file (4.3), githook updates apply to shared hooks,
  strategy-work-organization.md is `.arc/` template only (`.arc-internal/` references it).
  Other Phase 4 work is mostly `.arc/` template work
- Phases 5–6: `.arc-internal/` impact minimal (mostly `.arc/` template work)
- Phase 7: verification covers both directories

---

## Success Criteria

- [ ] Every `.arc/` top-level directory has a single clear purpose expressible in one sentence
- [ ] `reference/` contains only project knowledge (no operational machinery)
- [ ] `system/` contains only ARC operational components (no project knowledge)
- [ ] No `.example.md` files remain (all renamed to `.template.md` or appropriate alternative)
- [ ] Zero markdown linting violations across all files
- [ ] The 1:1 branch-to-task-list rule is removed from all documents
- [ ] `activate-work-unit.md` and `archive-completed.md` support the many-to-one model
- [ ] Task list templates support multiple branches
- [ ] No hardcoded `main` references in any workflow, strategy, or template file
- [ ] `.arc/config.yml` and `.arc/config.template.yml` exist with `base_branch` and
  `branch_protection` settings
- [ ] Planning branch workflow documented in `strategy-work-organization.md` with clear lifecycle
- [ ] Three branch protection modes documented with decision guidance
- [ ] Pre-commit githook reads config and adjusts behavior per mode
- [ ] `define-constitution` includes branch model setup-time decisions
- [ ] Solo mode structure unchanged from current (no regression)
- [ ] Team mode structure established with clear documentation
- [ ] DEVELOPMENT-RULES template contains only project-configurable content (~170 lines)
- [ ] Framework methodology in strategy doc that adopters don't customize
- [ ] Quality Gate Tiers table not duplicated between DEVELOPMENT-RULES and strategy doc
- [ ] `getting-started.md` exists with adoption story and "what to customize" guidance
- [ ] Team coordination conventions documented and findable
- [ ] All new strategy docs exist, have complete content, and are indexed in STRATEGY-INDEX.md
- [ ] Zero broken internal references (grep verification)
- [ ] All paths in session-init, agent files, and workflows reflect new structure
- [ ] Ready for activation and implementation
