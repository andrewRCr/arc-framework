# Strategy: Work Organization

> **Decision guide and rationale:** [Work Organization](https://andrewrcr.github.io/arc-framework/reference/work-organization/)
> on the docs site covers categorization guidance, edge cases, incidental work rationale, branch
> protection trade-offs, and common pitfalls.

Operational specification for organizing development work in ARC-based projects. Defines work
categorization, git branch workflow, directory structure, and archive organization. Referenced by
workflows at specific trigger points — this is the agent's lookup reference, not narrative
documentation.

---

## Contents

- [Work Categories](#work-categories)
- [Decision Rules](#decision-rules)
- [Task Lists and Branches](#task-lists-and-branches)
- [Incidental Work Model](#incidental-work-model)
- [Branch Protection Modes](#branch-protection-modes)
- [Planning Branch Workflow](#planning-branch-workflow)
- [Directory Structure](#directory-structure)
- [Team Coordination](#team-coordination) *(→ dedicated strategy)*
- [Planning Module](#planning-module) *(→ dedicated strategy)*

---

## Work Categories

### Feature Work (User-Facing Capabilities)

Planned work that adds user-visible capabilities from product vision.

**Documentation:**

- PRD: `.arc/active/feature/prd-<name>.md`
- Tasks: `.arc/active/feature/tasks-<name>.md`
- Notes: `.arc/active/feature/notes-<name>.md` (optional)
- Atomic: `.arc/active/feature/atomic-<name>.md` (companion)
- Git branch: `feature/<name>`

### Technical Work (Infrastructure Improvements)

Planned work that improves codebase quality, architecture, or developer experience.

**Documentation:**

- PRD: `.arc/active/technical/prd-<name>.md`
- Tasks: `.arc/active/technical/tasks-<name>.md`
- Notes: `.arc/active/technical/notes-<name>.md` (optional)
- Atomic: `.arc/active/technical/atomic-<name>.md` (companion)
- Git branch: `technical/<name>`

### Incidental Work (Reactive Quality Improvements)

Unplanned work discovered during feature/technical development. Gets task lists but not PRDs.
See [Incidental Work Model](#incidental-work-model) for branching and lifecycle.

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
- Atomic: `.arc/active/incidental/atomic-<type>-<name>.md` (companion)
- Git branch: `incidental/<name>` (stacked on parent; see [Incidental Work Model](#incidental-work-model))

---

## Decision Rules

**Step 1: "Was this planned in advance?"**

- **No** (discovered during work) → `incidental/` (see [Incidental Work Model](#incidental-work-model))
- **Yes** (has PRD or formal planning) → Continue to Step 2

**Step 2: "Does this add user-visible capability from product vision?"**

- **Yes** → `feature/`
- **No** → `technical/`

| Scenario                              | Planned? | User-visible? | Category                                         |
| ------------------------------------- | -------- | ------------- | ------------------------------------------------ |
| User authentication                   | Yes      | Yes           | `feature/user-authentication`                    |
| CI pipeline improvements              | Yes      | No            | `technical/ci-pipeline-improvements`             |
| Type errors found during feature work | No       | —             | `incidental/tasks-chore-type-safety.md`          |
| Bug found while testing               | No       | —             | `incidental/tasks-fix-auth-token-expiration.md`  |

**Edge cases:**

- UX/polish: planned + substantial → `technical/`; reactive + small → `incidental/`
- Refactoring: large + planned → `technical/`; discovered during feature work → `incidental/`
- Documentation: planned project → `technical/` or `feature/`; quick updates → `incidental/`
- Production issues: critical → `incidental/` with dedicated branch regardless of size;
  non-critical → capture in backlog for triage

---

## Task Lists and Branches

Task lists are the unit of work planning; branches are the unit of code delivery. The
relationship is many-to-one: a single task list may span multiple branches for reviewability
or team collaboration. The solo 1:1 pattern — one task list, one branch — is the natural
default but not a rule.

Common multi-branch patterns:

- **Stacked PRs:** Breaking a large task list into 2-3 branches for smaller, reviewable PRs
- **Team sub-branches:** Multiple developers each working a branch against a shared integration
  branch
- **Phased delivery:** Sequential branches delivering different phases of the same task list

**Branch scope:** One planned work unit per branch. Switching work units implies switching
branches. Incidental task lists may live alongside the primary work when they stay on the same
branch by design. `WORK-STATUS.md` reflects whichever work unit is currently active.

**WORK-STATUS.md merge behavior:** WORK-STATUS.md on the base branch stays in its "no active
work" default state — work branches diverge with active state, and merges restore the default.
`.gitattributes` with `merge=ours` auto-resolves local merges by keeping the target branch
version. For PR merges (server-side, where local merge drivers don't apply), the resolution is
always "take base" — deterministic and trivial. Post-merge workflows
([rotate-branch][rotate-branch], [archive-work-unit][archive-work-unit]) update WORK-STATUS.md
immediately, so the auto-resolved content is transient.

Archive triggers when all tasks in the task list are complete, not when any individual branch
is merged or deleted. Branch cleanup happens independently as PRs merge.

---

## Incidental Work Model

Small discovered issues (type errors, missing tests, documentation gaps) are handled as inline
fixes or atomic tasks — not incidental work units. Incidental work units are multi-phase
blockers that need their own task list, branch, and review cycle.

### Branching

Every incidental work unit gets a stacked branch off the current branch (not the base branch):

```text
<base-branch>
└── technical/service-layer-modernization
    └── incidental/filter-integration-testing
        └── incidental/pagination-buffer-tracking
```

Branch naming: `incidental/<name>` matching task list name (minus `tasks-` prefix).

### Branch Lifecycle

```text
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

**Merge method:** Set via `merge.strategy` in arc-config.yml (default: `merge`). Merge commits
preserve branch topology and granular commit history. With `rebase`, commits are replayed for
linear history. With `squash`, individual commits collapse into one per branch — traceability
shifts from commit messages to PR descriptions. See
[Configurability Architecture][config-arch] § Merge Strategy for behavioral implications.

### Handling Branch Updates

If the parent branch updates while working on a child:

- **Rebase** for clean history: `git rebase parent-branch`
- **Merge** to preserve history: `git merge parent-branch`

---

## Branch Protection Modes

ARC defines two branch protection modes configured in `.arc/system/arc-config.yml`
(`branch.protection` setting).

### Mode Summary

| Mode                              | Planned Work      | Atomic Tasks / Backlog | Direct Base Branch Commits |
| --------------------------------- | ----------------- | ---------------------- | -------------------------- |
| **Partially protected** (default) | Branches required | Commit directly        | Documented exceptions only |
| **Fully protected**               | Branches required | Micro-branches         | Not allowed                |

### Partially Protected (Default)

Planned work units (feature, technical) require branches — both planning branches for delivering
artifacts and implementation branches for execution. Routine maintenance may commit directly to
the base branch as a documented exception.

**Planning branches:** Required for planned work.

**Documented exceptions** (direct base branch commits allowed):

- Framework maintenance: Documentation updates, linting fixes

### Fully Protected

All changes require branches and PR review. No direct base branch commits.

**Planning branches:** Required for all planned work.

**Lifecycle transitions:** Archival, planning, and activation all produce commits that can't go
directly to the base branch. The natural pattern is **batching**: a single branch carries
archival of the completed work unit alongside planning artifacts for the next one, merged via
one PR. This avoids a standalone housekeeping PR for archival alone. See
[Planning Branch Workflow](#planning-branch-workflow) for the batch lifecycle.

**Branches without work units:** Under full protection, even small atomic fixes need branches.
These branches may not have task lists, PRDs, or other ARC artifacts — they're just branches
with commits and a PR. This is expected. The [integrate-work-unit][integrate-work-unit] workflow
only applies to work units with task lists; branches without artifacts follow standard git
lifecycle (merge, delete). See [manage-incidental-work][manage-incidental] for escalation
guidance on when discovered work warrants a task list vs. a simple branch.

---

## Planning Branch Workflow

Planning branches (`planning/*`) deliver planning artifacts — PRDs, task lists, and notes —
via PR for review before implementation begins. This separates "decide what to build" from
"build it."

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
      the documented exception for documentation updates.
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

  Each workflow's steps are unchanged — the batch branch is just the commit target instead of
  the base branch. Activation happens after the batch PR merges (implementation branch is
  created from the base branch, not the batch branch). The scope boundary is the PR merge:
  archival-triggered PM updates (ROADMAP marking the completed WU) belong on the batch branch;
  activation-triggered updates (ROADMAP marking the new WU, WORK-STATUS, file moves) belong in
  step 6. See [integrate-planning-branch][integrate-planning-branch] for operational detail.

---

## Directory Structure

### Active Work

```text
.arc/active/
  WORK-STATUS.md
  feature/
    prd-<name>.md, tasks-<name>.md, notes-<name>.md, atomic-<name>.md
  technical/
    prd-<name>.md, tasks-<name>.md, notes-<name>.md, atomic-<name>.md
  incidental/
    tasks-<type>-<name>.md, notes-<type>-<name>.md (optional),
    atomic-<type>-<name>.md, completion-<type>-<name>.md (created before PR)
```

### Archive

Archive preserves structure with global sequence numbering:

```text
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

`{NN}_` prefix indicates completion order (global across all categories). Gaps within a
category show where other categories' work completed. Reset to 01 each quarter.

See [integrate-work-unit.md][integrate-work-unit] and
[archive-work-unit.md][archive-work-unit] for full integration and archival workflows.

### Alignment

Branch, directory, and file naming align consistently:

- **Planned:** Branch `technical/api-modernization` → `.arc/active/technical/` →
  `.arc/reference/archive/{quarter}/technical/{NN}_api-modernization/`
- **Incidental:** Branch `incidental/chore-type-safety` →
  `.arc/active/incidental/` →
  `.arc/reference/archive/{quarter}/incidental/{NN}_chore-type-safety/`

---

## Team Coordination

See [Team Coordination Strategy][team-coordination] — task ownership markers, team branching
patterns, merge conflict expectations, and external tracker integration.

---

## Planning Module

See [Planning Module Strategy](strategy-planning-module.md) **(arc-in-git)** — what arc-in-git
installs, routing and graduation flow, inbox vs. companion file routing, and scaling guidance.

---

[team-coordination]: strategy-team-coordination.md
[generate-tasks]: ../../../system/workflows/arc/2_generate-tasks.md
[activate-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/activate-work-unit.md
[integrate-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[archive-work-unit]: ../../../system/workflows/arc/work-unit-lifecycle/archive-work-unit.md
[create-prd]: ../../../system/workflows/arc/1_create-prd.md
[manage-incidental]: ../../../system/workflows/arc/supplemental/manage-incidental-work.md
[config-arch]: strategy-configurability-architecture.md
[rotate-branch]: ../../../system/workflows/arc/work-unit-lifecycle/rotate-branch.md
[activate-planning-branch]: ../../../system/workflows/arc/work-unit-lifecycle/planning/activate-planning-branch.md
[integrate-planning-branch]: ../../../system/workflows/arc/work-unit-lifecycle/planning/integrate-planning-branch.md
