---
purpose: Create a planning branch for delivering planning artifacts (PRDs, task lists) to the base branch.
audience: agent
---

# Workflow: Activate Planning Branch

Creates a planning branch for delivering planning artifacts (and optionally archival of a prior work unit)
to the base branch. This is the planning-side counterpart to [activate-work-unit][activate-work-unit].

**When to use:** You need a branch for planning work — either after completing a work unit
(batch: archival and planning on one branch) or when starting a new planning cycle from the
base branch.

**Protection mode context:** Under fully protected mode (`branch.protection: full`), all changes require
branches — planning branches are mandatory. Under partially protected mode (the default), planning
branches are the default for planned work but solo developers may commit planning artifacts directly to
the base branch (documented exception). See [Branch Protection Modes][work-org-protection] for the full
model.

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
+ **If scope shifts significantly during planning:** rename locally with `git branch -m {old} {new}`,
  push the renamed branch with `git push --set-upstream origin {new}`, then remove the old remote branch
  with `git push --delete origin {old}`

### 4) Move Plan-Doc to Active · `arc-in-git` only

> **Skip this step** if `pm.mode` is `none` or `external` — plan-docs already live in
> `.arc/active/{category}/`. Skip also if no plan-doc exists in `.arc/backlog/{category}/` (you
> may be creating the plan-doc fresh during this session, or going directly to PRD).

If resuming from a plan-doc in the backlog, move it into the active workspace:

```bash
mkdir -p .arc/active/{category}/
git mv .arc/backlog/{category}/plan-{name}.md .arc/active/{category}/
```

Plan-docs have an active lifespan during planning under `arc-in-git`: they're disposed at
planning-branch integration (graduated → `git rm`; shelved → moved back to backlog). New
plan-docs created during this session land in `.arc/active/{category}/` directly. See
[Work Planning Strategy][work-planning] for the plan-doc lifecycle.

### 5) Create Planning Status File

Create `.arc/active/{category}/status-{name}.md` from [`template-status.md`][template-status]. This is
the per-WU project pointer for the planning session — tracked, persists across the WU lifecycle,
transitions to execution at activation.

**Idempotent create + reconcile.** If a status file already exists on this branch (e.g., resuming
a prior planning session), do not recreate it — but reconcile the planning fields below so
`**Branch:**` and `**Spec:**` reflect the current branch name (renames possible) and the current
plan-doc filename (a `plan-*` doc may have been created after the first activation). Other field
values are preserved as-is; only the create vs. reconcile path differs.

Replace the template's title (`# Status: [Work Name]`) with the actual work unit name. Strip the
HTML comment block at the top of `## Active Work` — that's template scaffolding, not an instance
carry-over (mirrors `template-prd.md` precedent). Then populate the planning field set:

1. **State** — `Planning`
2. **Branch** — current planning branch (e.g., `{category}/plan-{name}`)
3. **Spec** — plan-doc filename in a backticked code span (e.g., `` `plan-{name}.md` ``)
   when one exists; otherwise `[none]`
4. **Task List** — `[none]` (task list generated downstream by `2_generate-tasks.md`; populated at
   activation)
5. **Sibling Work Unit(s)** — `plan-{name}.md` or `prd-{name}.md` references when this WU is part of
   a larger logical whole split for sizing or sequencing; otherwise `[none]`
6. **Last Completed** — `[none]`
7. **Next Task** — `[none]`
8. **Blockers** — `[none]`
9. **Next Action** — freeform planning-session prompt (e.g., "Run `1_create-prd.md`" or
   "Continue `plan-*` exploration")

> **Commit shape.** Stage Step 4's plan-doc move (arc-in-git, when present) with the new
> status file for a bundled `docs(arc):` activate-planning commit. Under none/external (no
> plan-doc move), the status file is the entire staged change → dedicated `chore(status):`.
> Archival in batch flows lands in its own prior commits via [archive-work-unit][archive-work-unit]
> — it doesn't co-stage here. See [DEV-RULES.ARC][dev-rules-arc] § Status-file commit shape.

### 6) Proceed to Next Step

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

[activate-work-unit]: ../activate-work-unit.md
[archive-work-unit]: ../archive-work-unit.md
[integrate-planning-branch]: integrate-planning-branch.md
[create-prd]: ../../1_create-prd.md
[generate-tasks]: ../../2_generate-tasks.md
[template-status]: ../../../../../reference/templates/template-status.md
[dev-rules-arc]: ../../../../../reference/constitution/DEV-RULES.ARC.md
[work-org-protection]: ../../../../../reference/strategies/arc/strategy-work-organization.md#branch-protection-modes
[work-planning]: ../../../../../reference/strategies/arc/strategy-work-planning.md
