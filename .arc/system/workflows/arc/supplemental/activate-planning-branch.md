# Workflow: Activate Planning Branch

**Audience:** Agent-executed — your agent follows this to set up a planning branch.

Creates a planning branch for delivering planning artifacts (and optionally archival of a prior work unit)
to the base branch. This is the planning-side counterpart to [activate-work-unit][activate-work-unit] —
lighter, because planning branches carry artifacts rather than implementation.

**When to use:** You need a branch for planning work — either after completing a work unit
(batch: archival and planning on one branch) or when starting a new planning cycle from the
base branch.

**Protection mode context:** Under fully protected mode (`branch.protection: full`), all changes require
branches — planning branches are mandatory. Under partially protected mode, planning branches are the
default for planned work but solo developers may commit planning artifacts directly to the base branch
(documented exception). Under unprotected mode, planning branches are optional. See
[Branch Protection Modes][work-org-protection] for the full model.

**What comes after:**

+ **Batch** (prior WU just merged): [archive-work-unit][archive-work-unit] → [1_create-prd][create-prd]
  → [2_generate-tasks][generate-tasks] → [integrate-planning-branch][integrate-planning-branch]
+ **Standalone** (no prior WU to archive): Plan-\* exploration or create-prd directly →
  generate-tasks → integrate-planning-branch

---

## Steps

### 1) Ensure Clean Base Branch

If coming from a just-merged implementation PR, you may still be on the old branch locally.

```bash
git switch {base-branch}
git pull origin {base-branch}
```

Verify the working tree is clean (`git status`). If there are uncommitted changes from the
prior session, resolve them before proceeding.

### 2) Clean Up Prior Implementation Branch

If the prior work unit's implementation branch still exists locally:

```bash
git branch -d {old-implementation-branch}
```

Remote deletion typically happens automatically when the PR merges (GitHub auto-delete setting).
If not:

```bash
git push origin --delete {old-implementation-branch}
```

Skip this step if there is no prior implementation branch to clean up (e.g., first work unit,
or branch was already deleted).

### 3) Create Planning Branch

```bash
git checkout -b {category}/plan-{name}
```

**Naming conventions:**

+ **Batch branches** typically use the new work unit's category and name:
  `technical/plan-{new-work-name}`, `feature/plan-{new-work-name}`
+ **Standalone planning** follows the same pattern, or use `planning/{working-name}` when the
  final category or name isn't known yet
+ Name mismatch between planning branch and final work unit is normal — scope may shift
  during planning review

### 4) Proceed to Next Step

**Batch** (archival + planning on one branch):

1. Run [archive-work-unit][archive-work-unit] to archive the completed work unit
2. Continue to [1_create-prd][create-prd] for the next work unit
3. Continue to [2_generate-tasks][generate-tasks]
4. When artifacts are ready: [integrate-planning-branch][integrate-planning-branch]

**Standalone** (new planning cycle, nothing to archive):

+ If the work needs exploration first: create `plan-*.md` documents
  (see [Work Planning Strategy][work-planning] for conventions)
+ If ready for requirements: proceed to [1_create-prd][create-prd]

---

## Common Pitfalls

+ **Forgetting to pull before branching** — The planning branch should fork from the latest base
  branch, especially after a PR merge. Stale base means the planning branch diverges unnecessarily.
+ **Skipping implementation branch cleanup** — Stale local branches accumulate and create confusion
  during future session-init (agent sees branches that no longer exist on remote).
+ **Creating a planning branch when not needed** — Under unprotected or partially protected mode
  (solo), planning artifacts can go directly to the base branch. Don't add process overhead that
  your protection mode doesn't require.

---

[activate-work-unit]: activate-work-unit.md
[archive-work-unit]: archive-work-unit.md
[integrate-planning-branch]: integrate-planning-branch.md
[create-prd]: ../1_create-prd.md
[generate-tasks]: ../2_generate-tasks.md
[work-org-protection]: ../../../../reference/strategies/arc/strategy-work-organization.md#branch-protection-modes
[work-planning]: ../../../../reference/strategies/arc/strategy-work-planning.md
