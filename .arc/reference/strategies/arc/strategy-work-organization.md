# Strategy: Work Organization

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
13. [Team Coordination](#team-coordination) *(→ dedicated strategy)*
14. [Backlog Organization](#backlog-organization) *(→ dedicated strategy)*
15. [Related Documentation](#related-documentation)

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
  WORK-STATUS.md  # Project state (tracked)
  feature/        # Planned user-facing work (implements product features)
  technical/      # Planned infrastructure work (improves "how we build")
  incidental/     # Unplanned quality work (discovered during development)
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

**Branch scope:** One planned work unit per branch. Switching work units implies switching branches.
Incidental task lists may live alongside the primary work when they stay on the same branch by design.
`WORK-STATUS.md` reflects whichever work unit is currently active.

**WORK-STATUS.md merge behavior:** WORK-STATUS.md on the base branch stays in its "no active work"
default state — work branches diverge with active state, and merges restore the default.
`.gitattributes` with `merge=ours` auto-resolves local merges by keeping
the target branch version. For PR merges (server-side, where local merge drivers don't apply),
the resolution is always "take base" — deterministic and trivial. Post-merge workflows
([rotate-branch][rotate-branch], [archive-work-unit][archive-work-unit]) update WORK-STATUS.md
immediately, so the auto-resolved content is transient.

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
- Non-critical (cosmetic, low-impact) → Capture in backlog for triage; may become planned
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
5. Clean task list (clean-work-unit.md Mode 2)
6. Create completion-{name}.md (summary + PR description draft)
7. Commit documentation changes

Code Review & Merge:
8. Run code review (local analysis, then PR-based if warranted)
9. Create PR against parent branch
10. Address review findings, merge PR

On Parent Branch (After Merge):
11. Delete merged branch (branch cleanup)
12. Archive task list (all tasks complete):
    git mv to .arc/reference/archive/{quarter}/incidental/{NN}_{name}/
13. Commit archive changes, resume parent work
```

**Archive trigger:** A task list in `.arc/active/` is archived when all tasks are marked complete
(`[x]`), not when a branch is deleted. Branch cleanup happens independently as PRs merge. In
typical incidental work (1:1 branch-to-task-list), deletion and archival coincide — but the
trigger is task completion, not branch deletion. For the full relationship model, see
[Task Lists and Branches](#5-task-lists-and-branches).

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

**Merge method:** Set via `merge.strategy` in arc-config.yml (default: `merge`). Merge commits preserve
branch topology and granular commit history. With `rebase`, commits are replayed for linear history.
With `squash`, individual commits collapse into one per branch — traceability shifts from commit messages
to PR descriptions. See [Configurability Architecture][config-arch] § Merge Strategy for behavioral
implications of each choice.

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

ARC defines two branch protection modes that determine what work requires branches and PRs.
The active mode is configured in `.arc/system/arc-config.yml` (`branch.protection` setting).

### Mode Summary

| Mode                              | Planned Work      | Atomic Tasks / Backlog | Direct Base Branch Commits |
|-----------------------------------|-------------------|------------------------|----------------------------|
| **Partially protected** (default) | Branches required | Commit directly        | Documented exceptions only |
| **Fully protected**               | Branches required | Micro-branches         | Not allowed                |

### Partially Protected (Default)

Planned work units (feature, technical) require branches — both planning branches for delivering
artifacts and implementation branches for execution. Routine maintenance may commit directly to the
base branch as a documented exception.

**Best for:** Solo developers and small teams wanting lightweight process with review gates on
substantive work.

**Planning branches:** Required for planned work.

**Documented exceptions** (direct base branch commits allowed):

- Framework maintenance: Documentation updates, linting fixes

### Fully Protected

All changes require branches and PR review. No direct base branch commits.

**Best for:** Teams with branch protection rules, CI/CD pipelines, and compliance requirements.

**Planning branches:** Required for all planned work.

**Trade-off:** Maximum traceability and review coverage. Higher overhead for small changes.

**Lifecycle transitions:** Archival, planning, and activation all produce commits that can't go
directly to the base branch. The natural pattern is **batching**: a single branch carries archival
of the completed work unit alongside planning artifacts for the next one, merged via one PR. This
avoids a standalone housekeeping PR for archival alone. See
[Planning Branch Workflow](#planning-branch-workflow) for the batch lifecycle.

**Branches without work units:** Under full protection, even small atomic fixes need branches. These
branches may not have task lists, PRDs, or other ARC artifacts — they're just branches with commits
and a PR. This is expected. The [integrate-work-unit][integrate-work-unit] workflow only applies to work
units with task lists; branches without artifacts follow standard git lifecycle (merge, delete).
See [manage-incidental-work][manage-incidental] for escalation guidance on when discovered work
warrants a task list vs. a simple branch.

### Choosing Your Mode

| Factor             | Partially Protected       | Fully Protected        |
|--------------------|---------------------------|------------------------|
| Team size          | Solo or small team        | Any team size          |
| Risk tolerance     | Moderate                  | Low                    |
| CI/CD maturity     | Basic to moderate         | Mature pipeline        |
| Review culture     | Selective PR review       | All changes reviewed   |
| Overhead tolerance | Moderate                  | Accepts higher process |

**Start with partially protected** (the default) unless you have a specific reason for full
protection. Move to fully protected when branch protection rules are enabled or team size grows.

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

- **Delivery, not activation.** Planning branches deliver artifacts to the base branch. They
  don't start the next work unit — moving files to `active/`, updating WORK-STATUS, and
  activation-triggered PM updates all happen post-merge during
  [activate-work-unit][activate-work-unit]. For the PR and merge step, see
  [integrate-planning-branch][integrate-planning-branch].

- **Mode-specific behavior:**
    - **Partially protected:** Planning branches are the default for planned work. Solo
      developers who find the planning branch → PR → merge → activate cycle too heavy for
      self-authored plans can commit planning artifacts directly to base — this falls under
      the documented exception for documentation updates. The value of planning branches
      scales with team size: solo review of your own PRD adds less than team review does.
    - **Fully protected:** Planning branches are required — all changes need branches and
      PR review.

- **Batch transitions (fully protected):** Under full protection, planning branches commonly
  carry prior work unit archival alongside new planning artifacts — one branch and PR covers
  both lifecycle transitions. The sequence:
    1. Create planning branch ([activate-planning-branch][activate-planning-branch])
    2. Archive completed work unit ([archive-work-unit][archive-work-unit])
    3. Create PRD ([1_create-prd][create-prd])
    4. Generate tasks ([2_generate-tasks][generate-tasks])
    5. PR to base branch, merge ([integrate-planning-branch][integrate-planning-branch])
    6. Activate new work unit from base branch ([activate-work-unit][activate-work-unit])

  Each workflow's steps are unchanged — the batch branch is just the commit target instead of the
  base branch. Activation happens after the batch PR merges (implementation branch is created from
  the base branch, not the batch branch). The scope boundary is the PR merge: archival-triggered
  PM updates (ROADMAP marking the completed WU) belong on the batch branch; activation-triggered
  updates (ROADMAP marking the new WU, WORK-STATUS, file moves) belong in step 6. See
  [integrate-planning-branch][integrate-planning-branch] for operational detail.

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

See [integrate-work-unit.md][integrate-work-unit] and [archive-work-unit.md][archive-work-unit] for full
integration and archival workflows.

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
2. Document decision rules in DEV-RULES.PROJECT.md (reference this strategy)
3. Start using immediately — adopt conventions from first commit

### For Existing Projects

1. **Complete current work** — Don't rename mid-flight
2. **Create new structure** — Add `technical/` directory alongside `feature/`
3. **Adopt going forward** — New work uses three-way split
4. **Update documentation** — Reference this strategy from DEV-RULES.PROJECT.md and workflow guides
5. **Migrate gradually** — Archive old work as-is, new work uses new structure

---

## Team Coordination

See [Team Coordination Strategy][team-coordination] — task ownership markers, team branching
patterns, merge conflict expectations, and external tracker integration.

---

## Backlog Organization

See [Backlog Organization Strategy](strategy-backlog-organization.md) — backlog directory structure,
processing flow (capture → triage → graduation), atomic task conventions, and commit context.

---

## Related Documentation

- [DEV-RULES.PROJECT][dev-rules] — Project quality standards and development rules
- [2_generate-tasks.md][generate-tasks] — Task breakdown workflow
- [3_process-task-loop.md][process-task-loop] — Task execution workflow
- [prepare-commits.md][prepare-commits] — Commit guide: atomicity, complex scenarios, quick reference
- [manage-incidental-work.md][manage-incidental] — Incidental work workflow
- [strategy-team-coordination.md][team-coordination] — Task ownership, team branching, external trackers

---

[dev-rules]: ../../constitution/DEV-RULES.PROJECT.md
[team-coordination]: strategy-team-coordination.md
[generate-tasks]: ../../../system/workflows/arc/2_generate-tasks.md
[process-task-loop]: ../../../system/workflows/arc/3_process-task-loop.md
[activate-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/activate-work-unit.md
[integrate-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[archive-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/archive-work-unit.md
[create-prd]: ../../../system/workflows/arc/1_create-prd.md
[prepare-commits]: ../../../system/workflows/arc/supplemental/prepare-commits.md
[manage-incidental]: ../../../system/workflows/arc/supplemental/manage-incidental-work.md
[config-arch]: strategy-configurability-architecture.md
[rotate-branch]: ../../../system/workflows/arc/work-unit-lifecycle/rotate-branch.md
[activate-planning-branch]: ../../../system/workflows/arc/work-unit-lifecycle/planning/activate-planning-branch.md
[integrate-planning-branch]: ../../../system/workflows/arc/work-unit-lifecycle/planning/integrate-planning-branch.md
