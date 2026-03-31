# PRD: Structural Readiness Pass

**Type:** Technical
**Status:** Complete
**Updated:** 2026-02-20

---

## Introduction

The ARC template system (`.arc/`) was built iteratively in a solo-dev context. Content is clean
(B.2 refinement pass complete), but the structure has accumulated friction: `reference/` is an
overstuffed catch-all, branches are rigidly coupled 1:1 to task lists, session state and shared work
artifacts are conflated in `active/`, and several files interleave framework methodology with
project-specific configuration at a level that creates merge conflicts during framework updates.
Additionally, the branching model hardcodes `main` as the base branch with no configuration point,
implicitly commits planning artifacts to the base branch without documenting why, and offers no
adaptation path for teams with protected base branches or different branching strategies.

This work restructures the `.arc/` template system for distribution readiness and team viability.
The goal is a clean, intuitive structure where every directory has a distinct role, the work model
supports both solo and team use, and framework updates via three-way merge have minimal conflict
surface against project customizations.

**Reference data:** `notes-structural-readiness-pass.md` contains detailed lookup tables for task
execution (file classification inventory, DEVELOPMENT-RULES content map, cross-cutting dependency
map with blast radius per concept).

## Goals

1. **Reduce merge conflict surface** — Separate framework-stable methodology from project-configurable
   content in high-impact files, so framework updates don't conflict with project customizations.
2. **Clarify directory roles** — Every `.arc/` top-level and second-level directory should have a
   single, clear purpose that a new adopter can understand from the directory name and README.
3. **Support team use** — Structural patterns that enable multiple developer-agent pairs working
   concurrently without file-level conflicts or coupling between personal state and shared work.
4. **Decouple branches from task lists** — Task lists are the unit of work; branches are the unit of
   delivery. The current 1:1 rule prevents common patterns (stacked PRs, team sub-branches).
5. **Establish missing canonical homes** — File classification taxonomy, development methodology, and
   backlog organization each need a dedicated strategy document rather than being embedded or uncodified.
6. **Naming accuracy** — `.example.md` files are templates, not examples. Rename to reflect actual
   function.
7. **Establish configurable branching model** — Define ARC's default branching workflow (planning
   branches, base branch role, branch protection levels) with named adaptation points, replacing
   hardcoded `main` assumptions with a configurable base branch concept.

## Use Cases

**UC1: Framework update via three-way merge.** An ARC user runs `arc update`. The CLI performs
three-way merge on configurable files. Because framework methodology is in `system/` strategy docs
(framework-owned) and project rules are in `reference/constitution/DEVELOPMENT-RULES.md`
(project-owned), the merge has no conflict surface between them.

**UC2: New adopter explores `.arc/`.** A developer runs `arc init` and opens the `.arc/` directory.
They see `active/` (my current work), `backlog/` (my future work), `reference/` (my project
knowledge), `system/` (ARC's machinery). Each directory's purpose is self-evident. READMEs confirm
the mental model.

**UC3: Team collaboration on shared feature.** Alice and Bob both work on `tasks-auth.md` in
`active/feature/`. Alice works Task 3.1 on her sub-branch, Bob works Task 3.2 on his. Each has
their own session state in `team/{name}/CURRENT-SESSION.md`. The task list tracks ownership via
`(@name)` markers. Neither developer's session state conflicts with the other's.

**UC4: Solo developer, large feature.** A solo dev breaks a 20-task feature into 3 stacked PRs for
reviewability. The task list header lists multiple branches. Archive triggers when all tasks are
complete, not when any single branch is deleted.

**UC5: Team member picks up abandoned work.** Alice leaves mid-feature. Bob reads
`team/alice/CURRENT-SESSION.md` for context, creates his own session pointing to the same communal
task list in `active/`. No structural coupling to untangle.

**UC6: Team with protected base branch.** A team with branch protection rules uses ARC in
fully-protected mode. All changes — including planning artifacts and atomic tasks — go through
branches and PRs. The githook blocks direct base branch commits. Planning artifacts are delivered
via `planning/*` branches, reviewed as PRs, and merged before implementation branches are created.

**UC7: Planning review before implementation.** A developer creates a `planning/auth-system`
branch with the PRD and task list. The team reviews the plan via PR — catching a scoping issue
before hours of implementation are invested. After the planning PR merges, the developer creates
`feature/auth-system` with the correct name and scope. The planning branch name need not match
the final implementation branch because planning branches are disposable.

## Requirements

### Cluster A: File-Level Restructuring

**A1.** Extract ~230 lines of framework methodology from DEVELOPMENT-RULES.template.md into
`strategies/arc/strategy-development-methodology.md`. Content to extract: commit standards (control,
format, atomicity), quality gate failure protocol, leave-it-cleaner protocol, session documentation
control, verification protocol, strategy document protocol, session context management, core
document reference protocol, task management protocol, test-first protocol, code documentation
standards. See notes doc (Deliverable 2) for the line-by-line content map.

**A2.** The remaining DEVELOPMENT-RULES.template.md (~170 lines) must be self-contained as a
project-constitutional document: quality gates with project-specific commands, testing requirements,
code quality principles, architecture documentation section, and a cross-reference to the methodology
strategy for framework rules.

**A3.** Replace the Quality Gate Tiers table in DEVELOPMENT-RULES.template.md with a summary and
cross-reference to `strategy-quality-gates.md`. Eliminates the duplication identified in the
cross-cutting dependency map (notes doc, Deliverable 4).

**A4.** Extract backlog organization (~55 lines) from strategy-work-organization.md into
`strategies/arc/strategy-backlog-organization.md`. Content: structure, processing flow, key design
points, commit context for atomic tasks.

### Cluster B: Directory and Naming

**B1.** Move `reference/agent/` → `system/agent/`, `reference/workflows/` → `system/workflows/`,
`reference/githooks/` → `system/githooks/`. Organize `system/workflows/` into `arc/` (ARC
methodology) and `project/` (user-created) subdirectories, mirroring the `strategies/` pattern.
Core loop workflows go to `arc/` root, supplemental workflows to `arc/supplemental/`, and one-time
setup workflows to `arc/setup/` — specifically, `0_define-constitution.md` →
`arc/setup/define-constitution.md` (drop `0_` prefix; it's a one-time project bootstrap, not part
of the iterative loop). Create `system/commands/` with .gitkeep and README (future CLI command
source).

**B2.** Update all cross-references affected by the `reference/` → `system/` move and workflow
internal reorganization. This includes: session-init reading list paths, agent file references to
workflows and DEVELOPMENT-RULES, `.arc/README.md` directory tree, `git config core.hooksPath` path,
DEVELOPMENT-RULES references to hook setup, workflow cross-references to agent files or other moved
documents, and all workflow path references gaining the `arc/` segment (e.g.,
`system/workflows/3_process-task-loop.md` → `system/workflows/arc/3_process-task-loop.md`).

**B3.** Rename all 16 `.example.md` files to `.template.md`. Special case:
`completion-sample.example.md` → `completion-sample.md` (it's a sample, not a template).

**B4.** Update all documentation that references `.example.md` naming: `.arc/README.md`,
`agent/README.md`, `define-constitution.md`, and any other files that mention the convention.

**B5.** Remove the version footer from `workflows/supplemental/maintain-docs.md`. Keep the
DEVELOPMENT-RULES version header, reframing its maintain-docs.md guidance from "framework
versioning" to "project rule evolution tracking."

**B6.** Add `team/` directory structure to the template with README explaining its purpose and the
solo-vs-team model. Include `.gitkeep` and template CURRENT-SESSION.md and ATOMIC-TASKS.md for
team member directories. Team mode is a CLI init option — the template establishes the structure;
the CLI activates it.

### Cluster C: Cross-Cutting Concepts

**C1.** Create `strategies/arc/strategy-file-classification.md` defining the file classification
taxonomy (framework / configurable / scaffolded / project-owned) with the complete file inventory
(notes doc, Deliverable 1 has all 46 files classified). This becomes the canonical reference that
the CLI update system uses to determine merge strategy per file.

**C2.** Remove the 1:1 branch-to-task-list "Key rule" from strategy-work-organization.md (currently
line 349). Replace with guidance establishing that task lists are the unit of work planning, branches
are the unit of code delivery, and the relationship is many-to-one. The solo 1:1 pattern remains the
default but is not enforced as a rule.

**C3.** Update activate-work-unit.md to create a primary/integration branch while acknowledging
that additional branches may be created during work. Task list header supports multiple branches.
Additional scope: planning branch must be merged before activation (new prerequisite), replace
hardcoded `main` with base branch reference throughout, add mode-specific note that in
unprotected mode the planning branch step is optional.

**C4.** Update archive-completed.md to trigger on task completion (all tasks marked `[x]`), not
branch deletion. Branch cleanup happens independently as PRs merge.

**C5.** Update task list template header to support a `Branch(es):` field (or equivalent). The
`Base Branch:` field should reference the configured base branch concept rather than hardcoding
`main`.

**C6.** Update PROJECT-STATUS.template.md to track active work by work unit name with branch(es)
as metadata, not by branch as primary key.

**C7.** Update STRATEGY-INDEX.md to include all new strategy documents (development-methodology,
file-classification, backlog-organization).

**C8.** Introduce configurable "base branch" concept. Replace all hardcoded `main` references in
strategy docs, workflows, task list templates, and githooks with a base branch concept that
defaults to `main`. Affected files include: strategy-work-organization.md (Git Workflow section,
stacked branch diagrams), activate-work-unit.md (prerequisites, Step 1 push command),
strategy-task-list-formatting.md (Base Branch field), manage-incidental-work.md (PR target
guidance), generate-tasks.md (task list header template), and the pre-commit hook (branch name
check). The base branch value is read from `.arc/config.yml`.

**C9.** Create `.arc/config.yml` as ARC's project-level configuration file with a corresponding
`.arc/config.template.yml` containing defaults and explanatory comments. Initial settings:
`base_branch` (default: `main`) and `branch_protection` (default: `partial`; options:
`unprotected`, `partial`, `full`). The config file is classified as "configurable" in the file
classification taxonomy (C1). The template file is classified as "framework" (ships with ARC,
not user-modified).

**C10.** Add planning branch workflow to strategy-work-organization.md as ARC's default mechanism
for delivering planning artifacts. Planning branches (`planning/*`) contain PRDs, task lists, and
optional notes, delivered via PR for review before implementation begins. Document the lifecycle:
create `planning/*` branch from base → create artifacts in `backlog/{category}/` → PR to base
branch → review → merge → delete planning branch → create implementation branch via
activate-work-unit. The planning branch name need not match the final work unit name (scope
often crystallizes during planning). This replaces the undocumented pattern of committing
planning artifacts directly to the base branch.

**C11.** Define three branch protection modes in strategy-work-organization.md with decision
guidance for choosing a mode (team size, risk tolerance, CI/CD maturity). Modes determine what
requires a branch:

- **Unprotected**: Branches optional for all work. No restrictions on base branch commits.
  Suited for solo developers and small teams prioritizing speed over process.
- **Partially protected** (default): Planned work units require branches — both planning
  branches for artifacts and implementation branches for execution. Backlog idea capture,
  atomic tasks, and maintenance may commit directly to the base branch as documented
  exceptions.
- **Fully protected**: All changes require branches and PR review. No direct base branch
  commits. Atomic tasks and backlog capture use micro-branches. Suited for teams with
  CI/CD pipelines and branch protection rules.

Mode-specific workflow variations should be documented as compact notes within affected
workflows, not as separate workflow variants.

**C12.** Update pre-commit githook to read `branch_protection` from `.arc/config.yml` and adjust
base-branch-commit behavior: silent (unprotected), warning with improved messaging (partial), or
error (full). If no config file exists or the setting is absent, default to `partial` for
backward compatibility. The hook should also read `base_branch` from config rather than
hardcoding `main`.

**C13.** Update `define-constitution.md` (post-restructure path: `system/workflows/arc/setup/`)
to include base branch name and branch protection level as setup-time decisions. These are
written to `.arc/config.yml` during project bootstrap. Include brief guidance for each mode
choice with cross-reference to strategy-work-organization.md for full details.

### Cluster D: Workflow and Coverage Gaps (First Pass)

**D1.** Create `reference/getting-started.md` with first-pass content: adoption story (README →
`.arc/README.md` → setup), file placement rationale (why ARC manages agent config loading via
session-init), the session-init loading chain, and "what to customize first" guidance. Known
constraint: the CLI onboarding flow will reshape this, so structure for replaceability — clear
sections that can be rewritten independently.

**D2.** Add ROADMAP as a step in `define-constitution.md` (post-restructure path:
`system/workflows/arc/setup/`). It's a foundational planning artifact that belongs alongside the
other constitutional documents in the project bootstrap workflow.

**D3.** Formalize the document audience indicator convention: expand the existing "Document
Audiences" table in `.arc/README.md`, add a note that documents may include `**Audience:**` headers.
Apply consistently to files that already partially use it (several workflows have `**Audience:**`
headers already).

**D4.** Add a note in the CURRENT-SESSION template's "Additional Context" section that working
directory changes should be captured in session information if relevant to the project. No template
structural change needed — the existing "Additional Context" section already serves this purpose.

### Cluster F: Team Adaptation Guidance (First Pass)

**F1.** Add team coordination section to strategy-work-organization.md (or a linked supplement)
covering: task ownership markers (`(@name)` convention), team branching patterns (shared integration
branch, personal sub-branches, stacked PRs per developer, direct shared branch), and task list merge
conflict expectations (trivially resolvable, document to set expectations).

**F2.** Add integration point acknowledgment: brief guidance that teams using external trackers
(Jira, Linear, GitHub Issues) can use those for assignment and high-level status while ARC task
lists handle implementation detail. These coexist — external tool is the assignment layer, ARC is
the execution layer.

**F3.** Document the communal active/ + personal team/ model in a user-facing location (likely
`.arc/README.md` directory overview or the `team/README.md`): what lives where, why the separation
exists, how solo-to-team transition works, and how TASK-INBOX serves as the communal capture point
for quick tasks (triaged during weekly review → assigned to a team member's ATOMIC-TASKS or
promoted to a backlog bucket).

## Non-Goals

- **CLI implementation** — This work restructures templates. The CLI that processes them
  (arc init, arc update) is Phase C work.
- **Team features** — No per-developer automation, no task assignment system, no conflict resolution
  tooling. Lightweight conventions and forward-compatible structure only.
- **Content rewriting** — B.2 already handled content quality. This pass restructures and moves
  content; it doesn't rewrite prose except where splits require new introductions or cross-references.
- **Slash command dedup** — Cluster E, deferred to Phase C (needs CLI generation script).
- **Polished onboarding** — First-pass onboarding content (getting-started.md, audience indicators)
  will be refined after CLI work clarifies the actual onboarding flow.
- **New workflow creation** — No new core workflows. Changes are to existing workflows (activate,
  archive, define-constitution) and strategy documents.
- **Full branching strategy documentation** — ARC documents its default branching model (planning
  branches, base branch protection) and named adaptation points. It does not provide comprehensive
  guides for Git Flow, trunk-based development, or other strategies. Adaptation points are
  documented; full alternative workflows are not.

## Technical Considerations

**Ordering constraints:** The directory move and workflow reorganization (B1) should happen early —
it's mechanical but wide-reaching, and all subsequent cross-reference work (B2) depends on it. The
workflow internal reorganization (`arc/`, `project/`, `setup/` subdirs) is part of B1 — done
alongside the `reference/` → `system/` move. The .template.md rename (B3-B4) is independent and can
happen in parallel. File-level splits (A1-A4) can happen before or after the directory move but
create cleaner diffs if done after (so moves and content changes are in separate commits).
Cross-cutting concept updates (C1-C7) depend on splits being complete.

**Commit atomicity:** Each cluster phase should produce atomic commits. Directory moves (git mv)
should be committed before content changes to preserve git history tracking. Renames similarly.
The DEVELOPMENT-RULES split (A1-A2) should be one commit for the extraction and one for the
cross-reference updates, or combined if the diff is clear.

**Markdown linting:** All changes must pass zero-tolerance linting. The .template.md rename will
require updating `.markdownlint-cli2.jsonc` if it contains `.example.md` references.

**Session-init impact:** The session-init workflow reads files from specific paths. After the
`system/` move, session-init (which itself moves to `system/workflows/arc/supplemental/`) must
reference the new paths. This is a self-referential change — verify carefully.

**Cross-reference blast radius:** The notes doc (Deliverable 4) has the full dependency map with
blast radius per concept. Key numbers: Work Organization touches 15+ files (very high), Commit
Format touches 8 files (medium-high), Session Lifecycle touches 7 files (medium). Use the map to
ensure no references are missed during structural moves. A systematic grep-based verification pass
after each cluster is recommended.

**Config file introduction:** `.arc/config.yml` is ARC's first configuration file. Keep the
initial scope minimal (two settings). The config template (`.arc/config.template.yml`) ships with
the framework; the actual config file is project-owned and `.gitignore`-able if desired. The
githook must degrade gracefully when no config file exists (default to `partial` protection,
`main` as base branch).

**Githook shell parsing:** The hook reads config values via simple shell parsing (grep + cut or
similar), not a YAML library. This keeps the hook dependency-free. Config format should be
simple enough that line-based parsing is reliable (no nested structures needed for the initial
two settings).

**Planning branch interaction with activation:** The activate-work-unit workflow gains a new
prerequisite (planning PR merged) but otherwise follows its existing structure. The planning
branch and implementation branch are independent git lifecycles — no stacking relationship.

**C8-C13 ordering:** C8-C13 depend on the directory moves (B1-B2) being complete, since file
paths change. They can be sequenced alongside or after existing C1-C7 work. C10-C11 (strategy
content) should precede C12-C13 (hook and workflow updates that reference the strategy).

## Success Criteria

**Structural:**

- Every `.arc/` top-level directory has a single clear purpose expressible in one sentence
- `reference/` contains only project knowledge (no operational machinery)
- `system/` contains only ARC operational components (no project knowledge)
- `system/workflows/` organized into `arc/` (methodology) and `project/` (user-created), mirroring
  the `strategies/` pattern
- No `.example.md` files remain (all renamed to `.template.md` or appropriate alternative)
- Zero markdown linting violations across all modified files

**Work model:**

- The 1:1 branch-to-task-list rule is removed from all documents
- activate-work-unit and archive-completed workflows support the many-to-one model
- Task list templates support multiple branches
- Solo mode structure is unchanged from current (no regression)
- Team mode structure is established with clear documentation

**Merge conflict surface:**

- DEVELOPMENT-RULES.template.md contains only project-configurable content (~170 lines)
- Framework methodology is in a strategy doc that adopters don't customize
- Quality Gate Tiers table is not duplicated between DEVELOPMENT-RULES and strategy doc

**First-pass content (D+F):**

- getting-started.md exists with adoption story, file placement rationale, and "what to customize"
  guidance. Content is structured in independent sections for easy future replacement.
- Team coordination conventions are documented and findable
- Audience indicator convention is formalized and consistently applied to existing partial adopters
- All new strategy docs (development-methodology, file-classification, backlog-organization) exist
  with complete content and are indexed in STRATEGY-INDEX.md

**Branching model:**

- No hardcoded `main` references remain in any workflow, strategy, or template file
- `.arc/config.yml` and `.arc/config.template.yml` exist with `base_branch` and
  `branch_protection` settings
- Planning branch workflow is documented in strategy-work-organization.md with clear lifecycle
- Three branch protection modes are documented with decision guidance
- Pre-commit githook reads config and adjusts behavior per mode
- `define-constitution` includes branch model setup-time decisions
- All three modes produce correct githook behavior when tested

**Cross-references:**

- Zero broken internal references (grep verification)
- All paths in session-init, agent files, and workflows reflect new structure
- git hooks path updated

## Open Questions

None — all design decisions resolved during post-audit analysis (2026-02-19), workflow
reorganization decision (2026-02-20), and branching model analysis (2026-02-20).
