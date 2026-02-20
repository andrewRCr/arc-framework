# Work Organization Strategy

## Purpose

Authoritative guidance for organizing development work in ARC-based projects. Defines work categorization
(feature/technical/incidental), git branch workflow including stacked branches and configurable base branch,
directory structure, commit patterns, and archive organization.

Use this strategy when:

- Starting a new feature or technical improvement
- Discovering reactive work during development
- Deciding whether to create a git branch
- Organizing task documentation

## Table of Contents

1. [The Challenge](#the-challenge)
2. [Our Solution](#our-solution)
3. [Core Principles](#core-principles)
4. [Work Categories](#work-categories)
5. [Decision Rules](#decision-rules)
6. [Incidental Work Model](#incidental-work-model)
7. [Git Workflow](#git-workflow)
8. [Branch Protection Modes](#branch-protection-modes)
9. [Planning Branch Workflow](#planning-branch-workflow)
10. [Directory Structure](#directory-structure)
11. [Anti-Patterns](#anti-patterns)
12. [Migration Guide](#migration-guide)
13. [Backlog Organization](#backlog-organization) *(→ dedicated strategy)*
14. [Related Documentation](#related-documentation)

---

## The Challenge

**Semantic Confusion**: Work categories that describe size ("epic") rather than type create ambiguity.

**Examples of confusion:**

- "feature/backend-modernization" → Sounds like user features, but it's infrastructure work
- "feature/type-safety-improvements" → Sounds like features, but it's technical debt reduction
- "incidental" vs "small" → Conflates planning status with work size

**The real distinctions that matter:**

1. **PLANNED vs UNPLANNED** — Different workflows, documentation requirements, git strategies
2. **USER-FACING vs TECHNICAL** — Different stakeholders, different value propositions

---

## Our Solution

### Three-Way Split with Hybrid Incidental Model

**Primary Distinction: PLANNED vs UNPLANNED**

- **Planned work** (feature/ + technical/) → Gets PRDs, formal task lists, git branches
- **Unplanned work** (incidental/) → Gets task lists, NO PRDs, gets branches if substantial
  (>30min, multiple subtasks)

**Secondary Distinction: USER-FACING vs TECHNICAL** (for planned work)

- **feature/** → User capabilities from product vision
- **technical/** → Infrastructure improvements

### Directory Structure

```
.arc/active/
  feature/      # Planned user-facing work (implements product features)
  technical/    # Planned infrastructure work (improves "how we build")
  incidental/   # Unplanned quality work (discovered during development)
```

### Git Branch Naming

```
# Planned work (gets branches)
feature/user-authentication
feature/data-export

technical/api-modernization
technical/ci-pipeline-improvements

# Incidental work (gets branches if substantial)
incidental/fix-auth-token-expiration
incidental/refactor-test-helpers
```

### Key Insight

**Work is categorized by TYPE and PLANNING STATUS, not SIZE.** All three categories can contain
large or small work. Incidental work can take 30 minutes or 15 hours.

### Industry Context

This approach draws on established patterns rather than inventing new ones:

- **Planned/unplanned as primary axis** — The Phoenix Project identifies this as the fundamental
  organizational distinction (Business Projects and Internal IT Projects vs Unplanned Work)
- **Technical work as first-class category** — SAFe's "Enabler Story" concept recognizes that
  infrastructure work deserves the same intentional planning as user-facing features, not just
  backlog afterthought status
- **Stacked branches for discovered work** — Follows the stacked development pattern used at
  Meta, Google, and supported by tools like Graphite and gh-stack
- **Conventional Commits at the commit level** — Commit types (`feat`, `fix`, `refactor`, `chore`)
  describe *what changed*; our branch categories describe *why it was planned and when it was
  discovered*. These are complementary, not competing

---

## Core Principles

### 1. Work Type Over Work Size

Categorize by what kind of work (user-facing, infrastructure, reactive) and planning status (planned
vs discovered) — never by duration or complexity. This eliminates subjective sizing debates and scales
to any project.

### 2. Industry Alignment

The three-way split builds on recognized patterns (see [Industry Context](#industry-context)).
Git branch naming follows conventions (`feature/`, `technical/`, `chore/`, `fix/`, `test/`)
compatible with Conventional Commits and automated tooling.

### 3. Semantic Clarity

Names immediately communicate work type:

- `feature/` = "What can users DO now that they couldn't before?"
- `technical/` = "How does the codebase work better internally?"
- `incidental/` = "What did we discover and fix along the way?"

Directory names match git branches, branch names match commit prefixes — no cognitive dissonance.

### 4. Pragmatic Workflow

Planned vs unplanned work demands different processes:

- Planned work: Formal PRD, task breakdown, dedicated branch, structured commits
- Unplanned work: Task list for tracking, commits to current branch, conventional prefixes

Incidental work often cascades (fixing A reveals B reveals C). Task lists provide traceability
without branch management overhead.

### 5. Task Lists and Branches

Task lists are the unit of work planning; branches are the unit of code delivery. The relationship
is many-to-one: a single task list may span multiple branches for reviewability or team collaboration.
The solo 1:1 pattern — one task list, one branch — is the natural default but not a rule.

Common multi-branch patterns:

- **Stacked PRs:** Breaking a large task list into 2-3 branches for smaller, reviewable PRs
- **Team sub-branches:** Multiple developers each working a branch against a shared integration branch
- **Phased delivery:** Sequential branches delivering different phases of the same task list

Archive triggers when all tasks in the task list are complete, not when any individual branch
is merged or deleted. Branch cleanup happens independently as PRs merge.

---

## Work Categories

### Category 1: Feature Work (User-Facing Capabilities)

**Definition:** Planned work that adds user-visible capabilities from product vision.

**Characteristics:**

- Referenced in product roadmap or META-PRD
- Adds new user capabilities or changes what users can do

**Examples:**

- User authentication system
- Data export or reporting functionality
- Search and filtering capabilities
- Public API or SDK
- Collaborative editing features

**Documentation:**

- PRD: `.arc/active/feature/prd-<name>.md`
- Tasks: `.arc/active/feature/tasks-<name>.md`
- Notes: `.arc/active/feature/notes-<name>.md` (optional)
- Git branch: `feature/<name>`

### Category 2: Technical Work (Infrastructure Improvements)

**Definition:** Planned work that improves codebase quality, architecture, or developer experience.

**Characteristics:**

- Infrastructure, tooling, and architecture improvements
- Refactoring, performance, and code quality
- Testing infrastructure and CI/CD enhancements

**Examples:**

- CI/CD pipeline improvements (build optimization, deployment automation)
- Testing infrastructure (framework migration, shared test utilities)
- Architecture migration (monolith decomposition, state management rework)
- Performance optimization (query tuning, caching layer, build speed)
- Developer tooling (linting configuration, code generation, local dev environment)

**Documentation:**

- PRD: `.arc/active/technical/prd-<name>.md`
- Tasks: `.arc/active/technical/tasks-<name>.md`
- Notes: `.arc/active/technical/notes-<name>.md` (optional)
- Git branch: `technical/<name>`

### Category 3: Incidental Work (Reactive Quality Improvements)

**Definition:** Unplanned work discovered during feature/technical development.

**Characteristics:**

- Discovered during development (not planned)
- Often cascades (fixing A reveals B)
- Requires pause/resume (interleaved with primary work)
- Can be large or small (quick config fix = 30 min, type safety overhaul = 15 hours)

**File naming uses conventional commit prefixes:** `tasks-<type>-<name>.md`

- `tasks-chore-*` — Maintenance, tooling, config, dependencies
- `tasks-refactor-*` — Code restructuring, pattern extraction
- `tasks-fix-*` — Bug fixes discovered during development
- `tasks-test-*` — Test infrastructure, coverage improvements
- `tasks-perf-*` — Performance optimizations
- `tasks-docs-*` — Documentation updates

**Documentation:**

- Tasks: `.arc/active/incidental/tasks-<type>-<name>.md`
- Notes: `.arc/active/incidental/notes-<type>-<name>.md` (optional)
- Git branch: **None** by default (commits to feature/technical branch); see
  [Incidental Work Model](#incidental-work-model) for when branches are warranted

---

## Decision Rules

### Decision Tree

**Step 1: "Was this planned in advance?"**

- **No** (discovered during work) → `incidental/` (see [Incidental Work Model](#incidental-work-model))
- **Yes** (has PRD or formal planning) → Continue to Step 2

**Step 2: "Does this add user-visible capability from product vision?"**

- **Yes** → `feature/`
- **No** → `technical/`

**Why planned/unplanned is Step 1:** Different workflows apply — incidental work doesn't get PRDs
or separate branches.

### Decision Examples

| Scenario | Planned? | User-visible? | Category |
| --- | --- | --- | --- |
| User authentication | Yes (roadmap) | Yes | `feature/user-authentication` |
| CI pipeline improvements | Yes (PRD) | No | `technical/ci-pipeline-improvements` |
| Type errors found during feature work | No | — | `incidental/tasks-chore-type-safety.md` |
| Bug found while testing | No | — | `incidental/tasks-fix-auth-token-expiration.md` |

### Edge Cases

**UX and polish improvements:**

- Planned and substantial → `technical/ux-enhancements`
- Reactive and small → `incidental/tasks-refactor-loading-states.md`

**Refactoring:**

- Large, planned refactoring → `technical/service-layer-extraction`
- Discovered during feature work → `incidental/tasks-refactor-auth-service.md`

**Documentation:**

- Planned documentation project → `technical/api-documentation` or `feature/user-guide`
- Quick doc updates → `incidental/tasks-docs-update-readme.md`

**Production issues:**

- Critical (user-impacting, service disruption) → `incidental/` with dedicated branch regardless
  of size; may warrant interrupting current work
- Non-critical (cosmetic, low-impact) → Capture in TASK-INBOX for triage; may become planned
  `technical/` or `feature/` work

Note: "incidental" in this strategy means work *discovered during development*. Production incidents
follow the same categorization (unplanned → incidental) but urgency — not category — determines
whether they interrupt current work and get dedicated branches.

---

## Incidental Work Model

### Why Incidental Work is Different

1. **Discovery-driven** — Can't plan what you haven't discovered yet
2. **Cascading nature** — Fixing type errors reveals stub issues → reveals test helper duplication
3. **Interleaved execution** — Must pause/resume primary work
4. **Variable size** — 30-minute config fix or 15-hour type safety overhaul

### When to Create a Branch

Incidental work that meets task list criteria gets separate git branches stacked on the current branch.

**Create a branch when:**

- ✅ Requires dedicated task list (>30min effort, multiple subtasks)
- ✅ Semantically distinct from current branch's work
- ✅ Desire independent merge/review capability

**Stay on current branch when:**

- ❌ Trivial fixes (<30min, single action)
- ❌ Work directly continues current branch's theme
- ❌ No separate task list justified

Branch naming: `incidental/<name>` matching task list name (minus `tasks-` prefix).

### Stacked Branch Model

Child branches created off parent branches (not always from the base branch). This follows the
stacked development pattern (used at Meta, Google, and supported by tools like Graphite) adapted
for discovered work rather than planned decomposition:

> **Base branch** refers to the project's primary integration branch (typically `main`),
> configurable via `.arc/system/arc-config.yml`.

```
<base-branch>
└── technical/service-layer-modernization
    └── incidental/filter-integration-testing
        └── incidental/pagination-buffer-tracking
```

Work discovered DURING parent work naturally depends on parent context. Stacking preserves causality
and enables independent review/merge of each logical unit.

Note: Stacking also applies to planned work — a task list may use multiple stacked branches for
reviewable PRs (see [Task Lists and Branches](#5-task-lists-and-branches)).

### Branch Lifecycle

```
On Child Branch:
1. Create branch off current: git checkout -b incidental/<name>
2. Create task list: .arc/active/incidental/tasks-<name>.md
3. Work on branch, commit with task references
4. Complete work (all tasks done, quality gates pass)
5. Clean task list (maintain-task-notes.md Mode 2)
6. Create completion-{name}.md (summary + PR description draft)
7. Commit documentation changes

Code Review & Merge:
8. Run code review (local analysis, then PR-based if warranted)
9. Create PR against parent branch
10. Address review findings, merge PR

On Parent Branch (After Merge):
11. Delete merged branch
12. Archive: git mv to .arc/reference/archive/{quarter}/incidental/{NN}_{name}/
13. Commit archive changes, resume parent work
```

**Archive trigger:** A task list in `.arc/active/` is archived when all tasks are marked complete
(`[x]`), not when a branch is deleted. Branch cleanup happens independently as PRs merge. For the
full relationship model, see [Task Lists and Branches](#5-task-lists-and-branches).

### Merge Strategy

**Depth-first merging:** Complete deepest child first, merge up to parent.

```bash
# Example stack:
<base-branch>
└── technical/service-layer
    └── incidental/filter-testing
        └── incidental/pagination-fixes

# Merge order:
# 1. pagination-fixes → filter-testing (PR, merge, archive)
# 2. filter-testing → service-layer (PR, merge, archive)
# 3. service-layer → <base-branch> (PR, merge, archive)
```

Child work must be integrated into parent before parent can be considered complete.

### Handling Branch Updates

If the parent branch updates while working on a child:

- **Rebase** for clean history: `git rebase parent-branch`
- **Merge** to preserve history: `git merge parent-branch`

---

## Git Workflow

### Commit Message Patterns

**Feature/Technical work:**

```bash
feat(auth): add JWT token refresh endpoint
refactor(api): extract user service layer
test: add integration tests for authentication flow
docs: update API authentication guide
```

**Incidental work (with task reference):**

```bash
chore: enable strict mode checking (tasks-chore-type-safety.md Task 1.1)
refactor: extract test helper utilities (tasks-refactor-test-helpers.md Task 2.3)
fix: correct auth token validation (tasks-fix-auth-tokens.md Task 1.2)
test: add coverage for edge cases (tasks-test-coverage.md Task 3.1)
```

### Branch Workflow Example

```bash
# Start planned technical work
git checkout -b technical/service-layer-modernization
git commit -m "refactor: extract service base class"

# Discover testing gaps — substantial, needs task list + branch
git checkout -b incidental/filter-integration-testing
# Create: .arc/active/incidental/tasks-filter-integration-testing.md
git commit -m "test: add filter integration tests (tasks-filter-integration-testing.md Task 1.1)"

# Complete filter testing → review, PR against parent, merge
git checkout technical/service-layer-modernization
git branch -d incidental/filter-integration-testing
# Archive task list to .arc/reference/archive/{quarter}/incidental/{NN}_{name}/

# Resume service layer work
git commit -m "refactor: complete service extraction"
# When complete → review, PR against base branch, merge, archive
```

---

## Branch Protection Modes

ARC defines three branch protection modes that determine what work requires branches and PRs.
The active mode is configured in `.arc/system/arc-config.yml` (`branch_protection` setting).

### Mode Summary

| Mode                              | Planned Work       | Atomic Tasks / Backlog | Direct Base Branch Commits |
|-----------------------------------|--------------------|------------------------|----------------------------|
| **Unprotected**                   | Branches optional  | Commit directly        | Allowed                    |
| **Partially protected** (default) | Branches required  | Commit directly        | Documented exceptions only |
| **Fully protected**               | Branches required  | Micro-branches         | Not allowed                |

### Unprotected

Branches are optional for all work. No restrictions on base branch commits.

**Best for:** Solo developers prioritizing speed. Prototyping phases where process overhead
isn't justified.

**Planning branches:** Optional. Planning artifacts can be committed directly to the base branch.

**Trade-off:** Maximum speed, minimum traceability. No PR review gate — all review is local.

### Partially Protected (Default)

Planned work units (feature, technical) require branches — both planning branches for delivering
artifacts and implementation branches for execution. Backlog capture, atomic tasks, and routine
maintenance may commit directly to the base branch as documented exceptions.

**Best for:** Solo developers and small teams wanting lightweight process with review gates on
substantive work.

**Planning branches:** Required for planned work.

**Documented exceptions** (direct base branch commits allowed):

- Backlog capture: `TASK-INBOX.md` additions, `ROADMAP.md` updates
- Atomic tasks: Small one-off fixes tracked in `ATOMIC-TASKS.md`
- Framework maintenance: Documentation updates, linting fixes

### Fully Protected

All changes require branches and PR review. No direct base branch commits. Atomic tasks and
backlog capture use short-lived micro-branches.

**Best for:** Teams with branch protection rules, CI/CD pipelines, and compliance requirements.

**Planning branches:** Required for all planned work. Micro-branches for atomic tasks and
backlog capture.

**Trade-off:** Maximum traceability and review coverage. Higher overhead for small changes.

### Choosing Your Mode

| Factor              | Unprotected     | Partially Protected | Fully Protected        |
|---------------------|-----------------|---------------------|------------------------|
| Team size           | Solo            | Solo or small team  | Any team size          |
| Risk tolerance      | High            | Moderate            | Low                    |
| CI/CD maturity      | None / basic    | Basic to moderate   | Mature pipeline        |
| Review culture      | Self-review     | Selective PR review | All changes reviewed   |
| Overhead tolerance  | Minimal         | Moderate            | Accepts higher process |

**Start with partially protected** (the default) unless you have a specific reason for another
mode. Move to fully protected when branch protection rules are enabled or team size grows.
Move to unprotected only for solo prototyping or experiments where traceability isn't needed.

---

## Planning Branch Workflow

Planning branches (`planning/*`) deliver planning artifacts — PRDs, task lists, and notes —
via PR for review before implementation begins. This is ARC's default mechanism for separating
the "decide what to build" phase from the "build it" phase, replacing the undocumented pattern
of committing planning artifacts directly to the base branch.

### Lifecycle

1. **Create planning branch** from base branch: `git checkout -b planning/<working-name>`
2. **Create artifacts** in `backlog/{category}/`:
   - `prd-<name>.md` (required for planned work)
   - `tasks-<name>.md` (required)
   - `notes-<name>.md` (optional)
3. **Commit, push, and create PR** against base branch
4. **Review** — team reviews plan, catches scoping issues before implementation starts
5. **Merge and delete** planning branch (artifacts now on base branch)
6. **Create implementation branch** via [activate-work-unit][activate-work-unit]
   workflow (moves artifacts from `backlog/` to `active/`)

### Key Points

- **Name mismatch is normal.** The planning branch name need not match the final work unit
  name. `planning/auth-exploration` might produce `feature/jwt-authentication` once scope
  crystallizes during planning review.

- **Review before implementation.** The PR review gate catches scoping issues, missing
  requirements, and architectural concerns before hours of implementation are invested.

- **Artifacts live in backlog until activation.** Planning creates artifacts in
  `backlog/{category}/`. The activate-work-unit workflow moves them to `active/{category}/`
  when implementation begins.

- **Mode-specific behavior:**
    - **Unprotected:** Planning branches are optional — artifacts can be committed directly
      to the base branch.
    - **Partially / fully protected:** Planning branches are required for planned work units.

---

## Directory Structure

### Active Work

```
.arc/active/
  feature/
    prd-<name>.md, tasks-<name>.md, notes-<name>.md
  technical/
    prd-<name>.md, tasks-<name>.md, notes-<name>.md
  incidental/
    tasks-<type>-<name>.md, notes-<type>-<name>.md (optional),
    completion-<type>-<name>.md (created before PR)
```

### Archive

Archive preserves structure with global sequence numbering:

```
.arc/reference/archive/{quarter}/
  feature/
    01_user-authentication/
      prd-*, tasks-*, notes-*, completion-*
  technical/
    02_api-modernization/
      prd-*, tasks-*, notes-*, completion-*
  incidental/
    03_chore-type-safety/
      tasks-*, notes-*, completion-*
```

`{NN}_` prefix indicates completion order (global across all categories). Gaps within a category
show where other categories' work completed. Reset to 01 each quarter.

See [archive-completed.md][archive-completed] for full archival workflow.

### Alignment

Branch, directory, and file naming align consistently:

- **Planned:** Branch `technical/api-modernization` → `.arc/active/technical/` →
  `.arc/reference/archive/{quarter}/technical/{NN}_api-modernization/`
- **Incidental:** Branch `incidental/chore-type-safety` (if substantial) →
  `.arc/active/incidental/` →
  `.arc/reference/archive/{quarter}/incidental/{NN}_chore-type-safety/`

---

## Anti-Patterns

### Don't: Use Size-Based Categories

```
.arc/active/
  epic/              # ❌ Describes size, not type
  small-features/    # ❌ Describes size, not type
```

Use `feature/`, `technical/`, `incidental/` — categorize by type and planning status, not size.

### Don't: Create Branches for All Incidental Work

```bash
# ❌ Branch per discovered issue = overhead
git checkout -b fix/csrf-token-validation
git commit -m "fix: correct CSRF validation"
git checkout feature/user-authentication
git merge fix/csrf-token-validation
# Repeat for every discovery...
```

Stay on the current branch for small incidental work. Create a task list for traceability, use
conventional commits with task references. Only create a separate branch when the work meets
[stacked branch criteria](#when-to-create-a-branch).

### Don't: Skip Task References in Commits

```bash
git commit -m "fix: CSRF validation"             # ❌ No context
git commit -m "fix: CSRF validation (tasks-fix-csrf.md Task 1.1)"  # ✅ Traceable
```

### Don't: Over-Process Incidental Work

```
.arc/active/incidental/prd-fix-csrf-token.md     # ❌ PRDs are for planned work
.arc/active/incidental/notes-fix-typo.md          # ❌ 200-line doc for a typo
```

Incidental work gets task lists only. Notes files are optional, reserved for complex incidental work.

---

## Migration Guide

### For New Projects

1. Create directory structure: `mkdir -p .arc/active/{feature,technical,incidental} .arc/backlog`
2. Document decision rules in DEVELOPMENT-RULES.md (reference this strategy)
3. Start using immediately — adopt conventions from first commit

### For Existing Projects

1. **Complete current work** — Don't rename mid-flight
2. **Create new structure** — Add `technical/` directory alongside `feature/`
3. **Adopt going forward** — New work uses three-way split
4. **Update documentation** — Reference this strategy from DEVELOPMENT-RULES.md and workflow guides
5. **Migrate gradually** — Archive old work as-is, new work uses new structure

---

## Backlog Organization

See [Backlog Organization Strategy](strategy-backlog-organization.md) — backlog directory structure,
processing flow (capture → triage → graduation), atomic task conventions, and commit context.

---

## Related Documentation

- [DEVELOPMENT-RULES][dev-rules] — Development standards and git workflow
- [2_generate-tasks.md][generate-tasks] — Task breakdown workflow
- [3_process-task-loop.md][process-task-loop] — Task execution workflow
- [atomic-commit.md][atomic-commit] — Complex commit scenarios and atomicity
- [manage-incidental-work.md][manage-incidental] — Incidental work workflow
- [agent-pre-merge-review.md][pre-merge-review] — Code review workflow
- [weekly-review.md][weekly-review] — Weekly backlog review process

---

[dev-rules]: ../../constitution/DEVELOPMENT-RULES.md
[generate-tasks]: ../../../system/workflows/arc/2_generate-tasks.md
[process-task-loop]: ../../../system/workflows/arc/3_process-task-loop.md
[activate-work-unit]: ../../../system/workflows/arc/supplemental/activate-work-unit.md
[archive-completed]: ../../../system/workflows/arc/supplemental/archive-completed.md
[atomic-commit]: ../../../system/workflows/arc/supplemental/atomic-commit.md
[manage-incidental]: ../../../system/workflows/arc/supplemental/manage-incidental-work.md
[pre-merge-review]: ../../../system/workflows/arc/supplemental/agent-pre-merge-review.md
[weekly-review]: ../../../system/workflows/arc/supplemental/weekly-review.md
