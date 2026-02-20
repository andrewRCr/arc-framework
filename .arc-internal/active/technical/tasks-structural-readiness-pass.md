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

- [x] **2.1 Rename `.example.md` files to `.template.md`**

    Renamed 16 `.example.md` → `.template.md` via `git mv` across `.arc/` (active/, backlog/,
    reference/constitution/, reference/, system/agent/). Deleted `completion-sample.example.md`
    (redundant with inline template in `archive-completed.md` workflow). Verified
    `.markdownlint-cli2.jsonc` — no `.example.md` references (uses `**/*.md` globs). Full
    project lint: 0 violations across 90 files.

- [x] **2.2 Update documentation referencing `.example.md` naming convention**

    Updated 13 files across `.arc/` and `.arc-internal/` with `.example.md` → `.template.md`:

    - `.arc/README.md`: convention description
    - `.arc/system/agent/README.md`: all headings, adoption guide, copy instructions (12 refs)
    - `.arc/system/workflows/arc/setup/define-constitution.md`: 4 template links + suffix text
    - `.github/workflows/ci.yml`: `find` command for naming validation
    - `ADOPTION.md`: adoption step reference
    - `README.md`: fixed stale `.arc/README.example.md` → `.arc/README.md`
    - `.arc-internal/reference/constitution/`: TECHNICAL-OVERVIEW (directory tree, 16 refs),
      META-PRD, PROJECT-STATUS, DEVELOPMENT-RULES
    - `.arc-internal/system/workflows/project/`: sync-cinexplorer-refinements (5 refs),
      sync-with-arc-framework (1 ref)
    - `.arc-internal/backlog/technical/BACKLOG-TECHNICAL.md`: marked naming convention item
      as resolved

    Remaining `.example.md` references (13 files) are all in archive, active task/PRD
    meta-references, or planning docs describing the rename work — appropriate to leave as
    historical records. Full project lint: 0 violations across 90 files.

- [x] **2.3 Update version and maintenance conventions (B5)**

    - Removed version footer from `maintain-docs.md`
    - Reframed "Version Control for Behavioral Rules" → "Version Tracking for Project Rules" in
      `maintain-docs.md`: clarified version tracks project rule evolution not ARC framework version,
      removed semver-specific language ("increment minor version")
    - Added inline HTML comments to both `DEVELOPMENT-RULES.template.md` and live
      `DEVELOPMENT-RULES.md` clarifying what the version header tracks

### **Phase 3:** Content Splits (A1–A4)

**Purpose:** Separate framework methodology from project-configurable content in high-impact files. Reduces
merge conflict surface for framework updates.

- [x] **3.1 Create `strategy-development-methodology.md` (A1)**

    Created `.arc/reference/strategies/arc/strategy-development-methodology.md` (354 lines).
    Extracted all 11 framework-universal methodology sections from DEVELOPMENT-RULES: Commit
    Standards, Quality Gate Failure Protocol, Leave It Cleaner, Session Documentation Control,
    Verification Protocol, Strategy Document Protocol, Session Context Management, Core Document
    Reference Protocol, Task Management Protocol, Test-First Protocol, Code Documentation
    Standards. Added introduction with scope/relationship framing, table of contents, and
    Relationship to Other Documentation section. Cross-references use generic path descriptions
    (not relative links) since the strategy doc is consumed from varying locations. Updated
    STRATEGY-INDEX.md with new entry. Lint clean.

- [x] **3.2 Slim DEVELOPMENT-RULES template and live versions (A2, A3)**

    Removed all 11 extracted methodology sections from both files. Template: 404 → 130 lines
    (-68%). Live: 405 → 136 lines (-66%). Replaced quality gate tiers table with summary text
    + cross-reference to `strategy-quality-gates.md`. Added methodology strategy cross-reference
    to header of both files. Updated cross-references in 8 files:

    - Session-init (both versions): added methodology strategy as item 4 in reading list,
      renumbered items 5-9, updated DEVELOPMENT-RULES description
    - Slash commands (3 files): commit format reference → methodology strategy
    - archive-completed.md, manage-incidental-work.md: commit format/standards references
    - CLAUDE.md: Session Context Management reference
    - maintain-docs.md: "Always Read" list, quality-gates strategy failure protocol reference
    - strategy-quality-gates.md: failure protocol reference

    Remaining content verified self-contained: header, quality gates with project commands,
    testing requirements, code quality principles, architecture documentation, reference links.
    Full project lint: 0 violations across 91 files.

- [x] **3.3 Create `strategy-backlog-organization.md` (A4)**

    Extracted Backlog Organization (§11, ~59 lines) from `strategy-work-organization.md` into
    standalone strategy doc (`strategy-backlog-organization.md`). Replaced source section with
    cross-reference. Updated STRATEGY-INDEX, `weekly-review.md` (backlog reference routing),
    and `ATOMIC-TASKS.template.md` (added strategy cross-reference for commit context).

- [x] **3.4 Update cross-references for content splits**

    Full audit of ~48 DEVELOPMENT-RULES references across the codebase. Categorized as:
    archive (skip), meta-references (file name mentions — no action), already updated in 3.2,
    and remaining references to extracted content.

    **Updated in this task (8 files, routing extracted content → methodology strategy):**

    - Githooks: `pre-commit` (2 refs: Code Documentation Standards), `README.md` (commit
      message standard)
    - Strategy docs: `strategy-task-list-formatting.md` (2 refs: Test-First Protocol)
    - Workflow docs: `atomic-commit.md` (3 refs: commit format), `2_generate-tasks.md`
      (Test-First Protocol)
    - Agent templates: `copilot-instructions.template.md` (test-first protocol),
      `AGENTS.template.md` (Verification Protocol), `CLAUDE.template.md` (Session Context
      Management)

    **Verified no action needed:** `strategy-work-organization.md` (migration guide —
    generic doc reference), `maintain-task-notes.md` (generic "project rules" link),
    internal agent files (GEMINI.md, copilot-instructions.md, WARP.md — generic doc links),
    `documentation-reviewer.md` (example prompt), all QUICK-REFERENCE, README, backlog,
    and archive files (meta-references or historical)

### **Phase 4:** Cross-Cutting Concept Updates (C1–C13)

**Purpose:** Codify file classification, decouple branches from task lists, establish configurable branching
model (planning branches, base branch concept, branch protection modes), and update all affected workflows,
templates, and tooling.

- [x] **4.1 Create `strategy-file-classification.md` (C1)**

    Created `strategy-file-classification.md` as canonical file classification reference.
    Taxonomy: Framework (37) / Configurable (10) / Scaffolded (11) / Project-owned (0 in
    template). Complete inventory of 58 files organized by directory. Each classification
    documents merge strategy implications for CLI update system. Updated STRATEGY-INDEX.md
    with new entry. Config file (`system/arc-config.yml`) added to inventory in Task 4.3.

- [x] **4.2 Decouple branch-task list model and introduce base branch concept (C2, C8)**

    Updated `strategy-work-organization.md` with many-to-one model and base branch concept:

    - Replaced 1:1 "Key rule" (line 349) with archive-trigger guidance linked to new principle
    - Added Core Principle #5 "Task Lists and Branches" — many-to-one relationship, three
      multi-branch patterns (stacked PRs, team sub-branches, phased delivery), archive trigger
    - Replaced 5 hardcoded `main` references with `<base-branch>` in diagrams and "base branch"
      in prose (Stacked Branch Model, Merge Strategy, Git Workflow Example)
    - Added base branch definition blockquote with config file forward-reference
    - Added stacking cross-reference note for planned work patterns

- [x] **4.3 Create `.arc/system/arc-config.yml` (C9)**

    Created `.arc/system/arc-config.yml` — ARC's first project-level configuration file:

    - Two settings with defaults: `base_branch: main`, `branch_protection: partial`
    - Flat key-value YAML with explanatory comments, shell-parseable (no nesting)
    - Configurable classification, single file (no template variant — no init-time tokens)
    - Documented in `.arc/README.md` directory tree and `system/README.md` contents list
    - Added `system/` section to `strategy-file-classification.md` inventory (also added
      missing `system/README.md`); counts updated: Framework 38, Configurable 11, total 60
    - Fixed 3 stale `system/config/config.yml` references in later tasks (4.7, 5.2.a,
      verification checklist) and Task 4.1 forward-reference
    - Task 4.2 forward-reference in `strategy-work-organization.md` already corrected
      during design discussion

- [x] **4.4 Add planning branch workflow and branch protection modes (C10, C11)**

    Added two new top-level sections to `strategy-work-organization.md` (sections 8-9,
    existing sections renumbered 10-14 in ToC):

    - **Branch Protection Modes (C11):** Three modes (unprotected / partially protected /
      fully protected) with mode summary table, per-mode details including planning branch
      behavior and documented exceptions, and "Choosing Your Mode" decision guide (5-factor
      comparison table). References `arc-config.yml` for configuration.
    - **Planning Branch Workflow (C10):** 6-step lifecycle from branch creation through
      activate-work-unit. Key points: name mismatch is normal (scope crystallizes during
      planning), artifacts live in backlog until activation, mode-specific behavior noted.
      Replaces undocumented pattern of committing planning artifacts directly to base branch.

- [x] **4.5 Update activation and archive workflows (C3, C4)**

    Updated both workflows to align with decoupled model and base branch concept:

    - **activate-work-unit.md (C3):** Added planning branch PR as prerequisite with
      mode-specific blockquote (optional in unprotected mode). Step 1 reframed from "commit
      to main" to "verify artifacts on base branch". Step 2 renamed to "Create Implementation
      Branch" with note about additional branches (stacked PRs, sub-branches). Replaced
      hardcoded `main` with base branch reference pointing to `arc-config.yml`. Removed
      `git push origin main`. Updated checklist terminology.
    - **archive-completed.md (C4):** Archive Timing section rewritten — trigger is now task
      completion (`[x]`), not branch deletion. Added multi-branch guidance (archive once when
      all tasks complete). Phase 3 renamed from "On Parent Branch" to "After Merge". Updated
      common pitfall from "archive before branch deletion" to "archive before tasks complete".
      Removed hardcoded `main` reference.

- [x] **4.6 Update templates and strategy index (C5, C6, C7)**

    - **strategy-task-list-formatting.md (C5):** Feature/Technical header updated —
      `Branch:` → `Branch(es):`, `Base Branch:` now references configured base branch
      with `arc-config.yml` pointer. Added rules for multi-branch listing (comma-separated)
      with cross-reference to Task Lists and Branches principle. Incidental header unchanged
      (single branch, parent branch as base).
    - **PROJECT-STATUS.template.md (C6):** `Branch:` → `Branch(es):` in Currently Active
      section. Template already tracked by work unit name (branch was metadata) — syntax
      now signals multi-branch support.
    - **STRATEGY-INDEX.md (C7):** New strategy docs already indexed (Phase 3). Updated
      work-organization description from "branch coupling" to "branching model (protection
      modes, planning branches)" reflecting Phase 4 additions.

- [x] **4.7 Update pre-commit githook for config-aware branch protection (C12)**

    Added `arc_config_get` shell function to pre-commit hook — reads flat key-value pairs from
    `.arc/system/arc-config.yml` via grep + cut, falls back to defaults (`main`, `partial`) when
    config is missing. CHECK 1 now uses configured `base_branch` and `branch_protection`:
    `unprotected` skips silently, `partial` warns, `full` blocks with error. Updated githook
    README with config-aware check descriptions and configuration section. All three modes plus
    missing-config fallback tested manually.

- [x] **4.8 Verify no hardcoded base branch references remain (C8 verification)**

    Grep sweep across all `.md` files and hook scripts for hardcoded `main` branch references.
    Found 2 stale references and fixed:

    - `2_generate-tasks.md`: template header `**Base Branch:** `main`` → config-aware format
      matching strategy-task-list-formatting.md
    - `agent-pre-merge-review.md`: "main, parent branches" → "base branch, parent branches"

    Verified OK (no fix needed): strategy-work-organization, activate-work-unit,
    strategy-task-list-formatting (already have config refs); githook pre-commit/README (default
    values in code); ADOPTION.md (references ARC repo's own branch, not project base branch);
    archive/PRD/backlog/task-list self-references excluded per task scope.

- [x] **4.9 Convert inline cross-references to reference-style links**

    Documented link style convention in strategy-development-methodology.md (Code Documentation
    Standards — "Link Style" subsection). Converted 56 deep inline links across 16 files to
    reference-style with `---` + link block as EOF pattern. Same-directory and one-level-up links
    left inline per convention. Full-project lint passed (93 files, 0 errors). Link targets
    spot-checked for resolution.

### **Phase 5:** Workflow and Coverage Gaps (D1–D4)

**Purpose:** Fill documentation gaps identified during structural analysis. First-pass content structured for
future refinement.

- [x] **5.1 Capture docs site decision and align plan docs with roadmap (D1)**

    **Goal:** Replace the originally-planned in-repo `getting-started.md` with the decision to use an
    external documentation site. Align backlog plan documents with roadmap phases (Phase C / Phase D)
    and absorb TASK-INBOX items into the appropriate plans.

    - Rewrite `plan-public-release.md` (moved from technical/ to feature/, renamed from
      `plan-public-release.md`, renamed from `plan-public-release-repository-strategy.md`) as
      Phase D planning doc — incorporating dual-repo
      concept, docs site decision (MkDocs Material + GitHub Pages), README refresh, philosophy and
      positioning guidance, community infrastructure
    - Tighten `plan-distribution-and-update-system.md` to Phase C scope — move Phase D content to
      public release plan, add CURRENT-SESSION tracking documentation prerequisite
    - Delete stale `plan-content-refinement-pass.md` (work completed and archived)
    - Absorb TASK-INBOX items into plan docs, update backlogs and roadmap cross-references

- [ ] **5.2 Update workflows and conventions (D2, D3, D4)**

    - [x] 5.2.a Split setup workflows and expand project definition (D2, C13) — replaced
      single `define-constitution.md` with two ordered workflows:
      `setup/01_initialize-arc.md` (ARC-level: verify init, arc-config context, agent setup)
      and `setup/02_define-project.md` (project-level: META-PRD → TECHNICAL-OVERVIEW →
      DEVELOPMENT-RULES → ROADMAP → PROJECT-STATUS, plus maintenance guidance). Updated all
      cross-references (9 files). Establishes forward-compatible structure for CLI onboarding.
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
- [ ] `.arc/system/arc-config.yml` exists with `base_branch` and `branch_protection` settings
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
