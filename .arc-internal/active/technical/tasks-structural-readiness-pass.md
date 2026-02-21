# Task List: Structural Readiness Pass

**PRD:** `.arc-internal/active/technical/prd-structural-readiness-pass.md`
**Created:** 2026-02-20
**Branch:** `technical/structural-readiness-pass`
**Base Branch:** `main`
**Completed:** 2026-02-20
**Status:** Complete

## Overview

**Purpose:** Restructure the `.arc/` template system and parallel `.arc-internal/` workspace for distribution
readiness and team viability — clean directory roles, reduced merge conflict surface, decoupled branch-task list
model, configurable branching model with planning branches, and first-pass team coordination content.

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
    - cross-reference to `strategy-quality-gates.md`. Added methodology strategy cross-reference
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

    - `2_generate-tasks.md`: template header `**Base Branch:**` `main` → config-aware format
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

- [x] **5.2 Update workflows and conventions (D2, D3, D4)**

    - [x] 5.2.a Split setup workflows and expand project definition (D2, C13) — replaced
      single `define-constitution.md` with two ordered workflows:
      `setup/01_initialize-arc.md` (ARC-level: verify init, arc-config context, agent setup)
      and `setup/02_define-project.md` (project-level: META-PRD → TECHNICAL-OVERVIEW →
      DEVELOPMENT-RULES → ROADMAP → PROJECT-STATUS, plus maintenance guidance). Updated all
      cross-references (9 files). Establishes forward-compatible structure for CLI onboarding.

    - [x] 5.2.b Formalize audience indicator convention in `.arc/README.md` (D3) — expanded
      table from 3 to 5 audience types (added Collaborative, Human-driven), added note about
      `**Audience:**` headers in workflow files, removed stale getting-started TODO, verified
      all 14 workflow files already carry consistent audience headers

    - [x] 5.2.c Add working directory note to CURRENT-SESSION template (D4) — added HTML
      comment guidance in "Additional Context" section for projects with non-standard working
      directories (monorepo subdirectories, workspace root differs from repo root)

### **Phase 6:** Team Adaptation (B6, F1–F3)

**Purpose:** Establish team mode structure and document coordination conventions. Lightweight conventions
only — no automation or assignment tooling.

- [x] **6.1 Create `team/` directory structure (B6)**

    Created `.arc/team/` with three files:

    - `README.md` — directory purpose, solo-vs-team model, what-lives-where table
      (communal `active/` vs personal `team/{name}/`), agent lookup paths, template
      explanation. Describes `team/{name}/` as default without precluding nested groupings.
    - `CURRENT-SESSION.template.md` — identical to `active/` template (same content,
      consistent experience per member)
    - `ATOMIC-TASKS.template.md` — identical to `active/` template

    Design decisions: skipped `.gitkeep` (directory has content), templates use
    `.template.md` naming convention (consistent with framework). Solo-to-team migration
    mechanics deferred to CLI work (noted in `plan-distribution-and-update-system.md`).
    Added `team/` entry to `.arc/README.md` directory tree.

- [x] **6.2 Add team coordination guidance (F1, F2)**

    Created `strategy-team-coordination.md` as a dedicated strategy (separate from work-org
    to keep solo developers unburdened by team content). Covers:

    - F1: `(@name)` task ownership convention (narrow scope — task list checkboxes and phase
      headers only, identifies human developer not agent), four team branching patterns
      (shared integration, personal sub-branches, stacked PRs per developer, direct shared),
      merge conflict expectations (task lists: trivially resolvable; session state: no conflicts
      by design via `team/` separation)
    - F2: External tracker integration model — external tool as assignment/status layer, ARC
      task lists as execution layer, `(@name)` markers optional when external tracker owns
      assignment

    Cross-references: added Team Coordination section + ToC entry + Related Documentation
    link in `strategy-work-organization.md`. Added entry to `STRATEGY-INDEX.md`.

- [x] **6.3 Document communal `active/` + personal `team/` model (F3)**

    Most content was established in 6.1 (`team/README.md` already covered what-lives-where
    table, why-the-separation, solo-vs-team transition, agent lookup). Added remaining gap:

    - TASK-INBOX as communal capture subsection in `team/README.md` — triage flow from
      shared inbox to either member's ATOMIC-TASKS (small items) or backlog promotion
      (larger items)
    - `.arc/README.md` already has adequate `team/` directory tree entry from 6.1

### **Phase 7:** Final Verification and Quality Gates

**Purpose:** Comprehensive Tier 3 validation of all structural changes, cross-references, and success
criteria.

- [x] **7.1 Run full markdown linting**

    97 files linted, 0 errors. Zero violations confirmed.

- [x] **7.2 Cross-reference verification**

    Grepped for all four stale path patterns across `**/*.md`:

    - `reference/agent/` — zero live hits (only historical notes in task list/PRD)
    - `reference/workflows/` — two stale path mentions in `CHANGELOG.md` (lines 12, 17);
      all other hits are archive or task list historical notes. CHANGELOG paths are
      historical descriptions — noted, not fixed
    - `reference/githooks/` — zero live hits (only archive/notes)
    - `.example.md` — zero actual files remain (`glob **/*.example.md` = 0); all text
      hits are historical descriptions (PRD, roadmap, resolved backlog items)

    Spot-checked 10 key documents for broken reference-style links: session-init, CLAUDE.md,
    DEVELOPMENT-RULES, process-task-loop, strategy-work-organization, strategy-development-methodology,
    strategy-quality-gates, strategy-task-list-formatting, strategy-file-classification, README.
    All link targets resolve correctly. Links in `.arc/` strategy docs to `DEVELOPMENT-RULES.md`
    (not `.template.md`) are correct-by-design — they target post-adoption file names.

    Hooks path: `git config core.hooksPath` = `.arc/system/githooks` (correct), all documentation
    references consistent.

- [x] **7.3 Validate success criteria against PRD**

    Walked through all PRD success criteria (lines 326-376). Verified each against actual
    repo state using grep, glob, file reads, and link target resolution. Results annotated
    in the Success Criteria section below using three-state model (`[x]`/`[~]`/`[ ]`).

---

## Success Criteria

**Structural:**

- [x] Every `.arc/` top-level directory has a single clear purpose expressible in one sentence
  — active (current work), backlog (future work), reference (project knowledge), system (ARC
  operational components), team (team member state)
- [x] `reference/` contains only project knowledge (no operational machinery)
  — confirmed: constitution/, strategies/, adr/, archive/, research/, QUICK-REFERENCE.template.md
- [x] `system/` contains only ARC operational components (no project knowledge)
  — confirmed: agent/, commands/, githooks/, workflows/, arc-config.yml, README.md
- [x] No `.example.md` files remain (all renamed to `.template.md` or appropriate alternative)
  — `glob **/*.example.md` returns zero results
- [x] Zero markdown linting violations across all files
  — 97 files linted, 0 errors (Task 7.1)

**Work model:**

- [x] The 1:1 branch-to-task-list rule is removed from all documents
  — now described as "natural default but not a rule" in strategy-work-organization.md
- [x] `activate-work-unit.md` and `archive-completed.md` support the many-to-one model
  — activate: "Additional branches may be created during work"; archive: triggers on
  "all tasks marked complete", not branch deletion
- [x] Task list templates support multiple branches
  — `Branch(es):` field in planned work template, comma-separated per conventions
- [x] Solo mode structure unchanged from current (no regression)
- [x] Team mode structure established with clear documentation
  — `team/` directory with README.md, CURRENT-SESSION.template.md, ATOMIC-TASKS.template.md;
  strategy-team-coordination.md covers ownership, branching patterns, external trackers

**Branching model:**

- [x] No hardcoded `main` references in any workflow, strategy, or template file
  — remaining `main` instances are config defaults (arc-config.yml value, pre-commit fallback)
  and one semantic use in agent-pre-merge-review ("not main" as general guidance). All workflow
  and strategy references use base branch concept with arc-config.yml pointer.
- [x] `.arc/system/arc-config.yml` exists with `base_branch` and `branch_protection` settings
  — PRD originally specified `.arc/config.yml` + `.arc/config.template.yml`; implementation
  placed at `system/arc-config.yml` with inline comments (single file, classified as
  Configurable in file taxonomy)
- [x] Planning branch workflow documented in `strategy-work-organization.md` with clear lifecycle
  — dedicated section with full lifecycle (create → artifacts → PR → merge → delete → activate)
- [x] Three branch protection modes documented with decision guidance
  — unprotected/partial/full with comparison table and "start with partially protected" guidance
- [x] Pre-commit githook reads config and adjusts behavior per mode
  — `arc_config_get` function reads config, case statement handles all three modes
  (silent/warning/error), graceful fallback when no config exists
- [~] `define-constitution` includes branch model setup-time decisions
  — Superseded: setup was split into `01_initialize-arc.md` (ARC-level) +
  `02_define-project.md` (project-level). Branch model decisions are in `01_initialize-arc.md`,
  not the define-constitution equivalent. Functionally equivalent — branch config is covered
  during setup.

**Merge conflict surface:**

- [x] DEVELOPMENT-RULES template contains only project-configurable content (~170 lines)
  — 130 lines (tighter than ~170 estimate; content was further refined during implementation)
- [x] Framework methodology in strategy doc that adopters don't customize
  — `strategy-development-methodology.md` (ships as-is, not a template)
- [x] Quality Gate Tiers table not duplicated between DEVELOPMENT-RULES and strategy doc
  — DEVELOPMENT-RULES has summary paragraph + cross-reference; full table only in
  strategy-quality-gates.md

**First-pass content:**

- [~] `getting-started.md` exists with adoption story and "what to customize" guidance
  — Superseded: Task 5.1 replaced in-repo getting-started with external docs site decision
  (MkDocs Material + GitHub Pages). Adoption story and onboarding content deferred to
  Phase D public release planning.
- [x] Team coordination conventions documented and findable
  — `strategy-team-coordination.md` + `team/README.md`, both indexed in STRATEGY-INDEX
- [x] All new strategy docs exist, have complete content, and are indexed in STRATEGY-INDEX.md
  — development-methodology, file-classification, backlog-organization, team-coordination
  all present and indexed

**Cross-references:**

- [x] Zero broken internal references (grep verification)
  — Task 7.2: grepped four stale patterns, spot-checked 10 key documents, all clean.
  Note: CHANGELOG.md deleted during archival prep (file was stale)
- [x] All paths in session-init, agent files, and workflows reflect new structure
- [x] Ready for activation and implementation
