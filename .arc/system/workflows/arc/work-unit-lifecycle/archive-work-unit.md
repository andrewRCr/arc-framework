# Workflow: Archive Work Unit

**Audience:** Agent-executed — your agent follows this to archive a merged work unit.

After a work unit is merged to the parent branch, this workflow moves completed documentation to
structured archive, updates tracking state, and cleans up branches. This is post-merge bookkeeping —
the substantive work (doc prep, review, merge) happens in [integrate-work-unit][integrate-work-unit].

**When to use:** The work unit's PR is merged and you're on the parent branch.

**Prerequisite:** [integrate-work-unit][integrate-work-unit] completed — docs are clean, completion
metadata exists, code review is done, PR is merged.

> **Full protection mode (`branch.protection: full`):** Archival commits cannot go directly to the
> base branch. Two approaches:
>
> - **Batch with next activation** (preferred): Run
>   [activate-planning-branch][activate-planning-branch] to set up the batch branch, then archive
>   here. One PR covers both lifecycle transitions — archive old, plan new.
> - **Standalone housekeeping branch**: Create a short-lived branch (e.g., `chore/archive-{name}`)
>   for archival alone, when no next work unit is imminent.
>
> Under `partial` protection (the default), archive directly on the base branch as described below.

<!-- -->

> **Multi-branch verification:** If this work unit spanned multiple branches (stacked PRs, phased
> delivery), confirm that **all** branches have been merged before proceeding. Archival is a one-time
> operation on the fully completed work unit — intermediate merges are handled by the
> [rotate-branch][rotate-branch] workflow and do not trigger archival.

---

## Steps

### 0) Set Up Branch (Full Protection Only)

**Skip if** `branch.protection` is `partial` — archive directly on the base branch.

Under full protection, archival commits require a branch. If you ran
[activate-planning-branch][activate-planning-branch] (batch path), you're already on the right branch —
skip this step. For standalone archival with no next work unit planned, create a housekeeping branch:

```bash
git checkout -b chore/archive-{name}
```

This branch carries only the archival commit. After Step 7, push and create a PR to merge it to the base
branch.

### 1) Delete Child Branch

Skip if the implementation branch was already cleaned up (e.g., by
[activate-planning-branch][activate-planning-branch] in the batch path).

```bash
git branch -d {child-branch-name}
git push origin --delete {child-branch-name}  # if pushed
```

### 2) Update Task List Status to Integrated

Update the task list header `**Status:**` from `Complete` to `Integrated`. This marks the transition
from "all tasks done" (pre-merge) to "merged to base branch" (post-merge). The archived task list
will show its final lifecycle state.

If a PRD exists, its status remains `Complete` — the PRD tracks whether the plan was fulfilled, not
the merge state.

### 3) Route Reference Files (If Applicable)

Before archiving, assess whether any work artifacts have reference value beyond this work unit —
investigation notes, benchmark data, design explorations, dependency maps. These files lose
discoverability once buried in the archive directory.

**Decision:** "Do any files have lasting reference value outside this work unit's context?"

- **Yes** → Copy (not move) to the appropriate reference directory. The original stays with the
  archive for completeness. Note the routing in the completion doc's Related Documentation section.
    - `.arc/reference/analysis/` — internally-produced maps, audits, assessments
    - `.arc/reference/research/` — externally-sourced investigation and synthesis
- **No** → Proceed directly to archival. Most work units won't produce standalone reference
  files — this step is a quick assessment, not a gate.

### 4) Archive Files

**Create archive directory and move all files using git mv** (preserves history).

Determine the next sequence number:

```bash
# Count existing work unit dirs across ALL categories in the quarter
find .arc/reference/archive/{quarter} -mindepth 2 -maxdepth 2 -type d | wc -l
```

**Move files** (`{quarter}` = e.g. `2025-q4`, `{NN}` = next sequence number, zero-padded):

```bash
# Create work package directory
mkdir -p .arc/reference/archive/{quarter}/{category}/{NN}_{name}

# Move all files (adjust list based on what exists for this work)
git mv .arc/active/{category}/prd-{name}.md .arc/reference/archive/{quarter}/{category}/{NN}_{name}/
git mv .arc/active/{category}/tasks-{name}.md .arc/reference/archive/{quarter}/{category}/{NN}_{name}/
git mv .arc/active/{category}/notes-{name}.md .arc/reference/archive/{quarter}/{category}/{NN}_{name}/
git mv .arc/active/{category}/completion-{name}.md .arc/reference/archive/{quarter}/{category}/{NN}_{name}/
```

### 5) Update WORK-STATUS.md

Update `.arc/active/WORK-STATUS.md` to reflect the post-archival state.

**Archiving to base branch** (normal case — work unit complete):

Reset to "no active work" defaults:

```markdown
**Branch**: `main`
**Task List**: [none]
**Following Task List**: No
**Next Task**: —
**Last Completed**: {Work Name} (archived)
**Blockers**: [none]
**Next Action**: {see below}
```

**Next Action guidance by PM mode:**

- **arc-in-git**: Identify next work unit — consult ROADMAP.md and backlog for candidates, then
  begin or continue planning
- **none / external**: Create a PRD when ready to start planned work → `1_create-prd.md`

If the next work unit is already known (e.g., batching archival with planning), name it
directly in Next Action.

**Archiving to parent work branch** (stacked incidental returning to parent):

Restore WORK-STATUS.md to the parent work unit's context — branch name, task list path,
and current task from where work was interrupted. The parent's state is recoverable from
the parent branch's task list and commit history.

### 6) Post-Archival Extensions · `#post-work-unit-archive`

If [post-work-unit-archive extensions][arc-ext-post-archive] are configured, execute them now. This is the
primary interface for PM layers to update project management artifacts (PROJECT-STATUS, ROADMAP) at archival time.

See: [`arc-extensions.md` § post-work-unit-archive][arc-ext-post-archive]

### 7) Commit Archive Changes

```bash
git add .arc/reference/archive/{quarter}/{category}/{name}/
git add .arc/active/{category}/  # captures file deletions
git add .arc/active/WORK-STATUS.md
```

**Note:** If [post-work-unit-archive extensions][arc-ext-post-archive] produced additional changes
(e.g., PM layer artifacts), stage those as well.

**Commit message format:** Follow DEV-RULES.ARC.md § Commit format.
Archival commits use type/scope `docs(arc)` or `docs(archive)` with Context footer
`tasks-{name}.md (archival)`.

> **Batch branch note:** When archiving on a batch branch (full protection), the commit lands on
> that branch instead of the base branch. The steps are identical — only the branch context differs.

**Example:**

```bash
git commit -m "docs(arc): archive fix-auth-edge-cases

Archival of completed incidental work:
- Fixed token refresh race condition and session expiry handling
- Added retry logic for intermittent auth failures
- All quality gates passed

Context: tasks-fix-auth-edge-cases.md (archival)"
```

### 8) Next Step

**Partial protection:** Archival is complete. WORK-STATUS.md points to the next action
(typically `1_create-prd.md`).

**Full protection (batch branch):** Continue on the same branch — proceed to
[1_create-prd.md][create-prd] for the next work unit. After task generation
([2_generate-tasks][generate-tasks]), the batch branch is complete — proceed to
[integrate-planning-branch][integrate-planning-branch] to PR the batch to the base branch.
Activation ([activate-work-unit][activate-work-unit]) happens from the base branch after
that PR merges.

**Full protection (standalone archival):** If no next work unit is planned, the housekeeping
branch carries only archival. Push, create a PR, and merge directly — no planning workflows
needed. Update WORK-STATUS.md Next Action to reflect that no next work unit is queued.

---

## Archive Structure

**Path pattern:** `.arc/reference/archive/{quarter}/{category}/{NN}_{name}/`

- `{quarter}`: `2025-q4`, `2025-q3`, etc.
- `{category}`: `feature/`, `technical/`, or `incidental/`
- `{NN}`: Global sequence number (01-99), assigned by completion order across ALL categories
- `{name}`: Work package name (matching task list name)

**Example structure:**

```text
2025-q4/
├── technical/
│   ├── 01_database-migration/
│   ├── 02_ci-pipeline-overhaul/
│   ├── 03_logging-standardization/
│   └── 10_config-refactor/
├── incidental/
│   ├── 04_fix-auth-edge-cases/
│   ├── 05_lint-config-cleanup/
│   └── ...
└── feature/
    └── 06_user-notifications/
```

**Sequence numbering:** Numbers are global across all categories, assigned in completion order (not start
order). Gaps within a category reflect interleaved work in other categories. Reset to 01 each quarter.

**Categorization:** See [Work Organization Strategy][work-org]
for feature vs technical vs incidental decision rules.

---

## Common Pitfalls

- Use `mv` instead of `git mv` → Loses file history
- Archive before merge → Run [integrate-work-unit][integrate-work-unit] first
- Archive before all branches merged → Multi-branch work units archive once after final merge
- Skip WORK-STATUS.md reset → Next session-init starts with stale state

---

[work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md
[rotate-branch]: rotate-branch.md
[integrate-work-unit]: integrate-work-unit.md
[activate-work-unit]: activate-work-unit.md
[create-prd]: ../1_create-prd.md
[generate-tasks]: ../2_generate-tasks.md
[activate-planning-branch]: planning/activate-planning-branch.md
[integrate-planning-branch]: planning/integrate-planning-branch.md
[arc-ext-post-archive]: ../../arc-extensions.md#post-work-unit-archive
