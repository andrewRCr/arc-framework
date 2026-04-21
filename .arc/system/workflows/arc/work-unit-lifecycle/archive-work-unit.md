---
purpose: Archive a merged work unit — move docs to archive, update tracking, clean up branches.
audience: agent
arc:
  extensions:
    - post-work-unit-archive
---

# Workflow: Archive Work Unit

After a work unit is merged to the parent branch, this workflow moves completed documentation to
structured archive, updates tracking state, and cleans up branches. This is post-merge bookkeeping —
the substantive work (doc prep, review, merge) happens in [integrate-work-unit][integrate-work-unit].

**When to use:** The work unit's PR is merged and you're on the parent branch.

**Prerequisite:** [integrate-work-unit][integrate-work-unit] completed — docs are clean, completion
metadata exists (`completion-{name}.md` created, status file `**State:** Complete`), code review is
done, PR is merged.

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

Under full protection, archival commits require a branch. Check your current branch to determine
what to do:

```bash
git branch --show-current
```

- **On a non-base branch** (e.g., `technical/plan-{name}`, `planning/{name}`): You're on the
  planning branch from [activate-planning-branch][activate-planning-branch] — skip to Step 1.
- **On the base branch**: Create a housekeeping branch for standalone archival:

  ```bash
  git checkout -b chore/archive-{name}
  ```

  This branch carries only the archival commit. After Step 7, push and create a PR to merge it
  to the base branch.

### 1) Delete Child Branch

Skip if the implementation branch was already cleaned up (e.g., by
[activate-planning-branch][activate-planning-branch] in the batch path).

```bash
git branch -d {child-branch-name}
git push origin --delete {child-branch-name}  # if pushed
```

### 2) Route Reference Files (If Applicable)

Before archiving, assess whether any work artifacts have reference value beyond this work unit —
investigation notes, benchmark data, design explorations, dependency maps. These files lose
discoverability once buried in the archive directory.

**Decision:** "Do any files have lasting reference value outside this work unit's context?"

**Files with lasting value** (move to reference — never duplicate):

- `research-*` files — standalone reference docs by convention. Always route to
  `.arc/reference/research/`. Research content embedded in `notes-*` files is different — it's
  tightly coupled to the work unit and archives normally.
- Reusable procedures (rollback plans, migration guides)
- Architecture diagrams, benchmark data, dependency maps, audits

**Files without lasting value** (archive only):

- Task-specific working notes, debugging logs
- Intermediate drafts superseded by final deliverables
- Scratchpad files used only during implementation

**Routing:**

- **Yes** → Move (not copy) to the appropriate reference directory. Never duplicate files across
  archive and reference — a file lives in one place. Note the routing in the completion doc's
  Related Documentation section.
    - `.arc/reference/research/` — externally-sourced investigation and synthesis (`research-*`)
    - `.arc/reference/analysis/` — internally-produced maps, audits, assessments
- **No** → Proceed directly to archival. Most work units won't produce standalone reference
  files — this step is a quick assessment, not a gate.

### 3) Archive Files

**Create archive directory and move all files using git mv** (preserves history).

Determine the next sequence number:

```bash
# Count existing work unit dirs across ALL categories in the quarter
find .arc/reference/archive/{quarter} -mindepth 2 -maxdepth 2 -type d | wc -l
```

**Verify**: List the archive directory (`ls .arc/reference/archive/{quarter}/*/`) and confirm the
computed number doesn't conflict with existing entries. If it does (from non-sequential archival
or manual edits), increment to the next available number.

**Move files** (`{quarter}` = e.g. `2025-q4`, `{NN}` = next sequence number, zero-padded):

```bash
# Create work unit directory
mkdir -p .arc/reference/archive/{quarter}/{category}/{NN}_{name}

# Move all files (adjust list based on what exists for this work)
git mv .arc/active/{category}/prd-{name}.md .arc/reference/archive/{quarter}/{category}/{NN}_{name}/
git mv .arc/active/{category}/tasks-{name}.md .arc/reference/archive/{quarter}/{category}/{NN}_{name}/
git mv .arc/active/{category}/atomic-{name}.md .arc/reference/archive/{quarter}/{category}/{NN}_{name}/
git mv .arc/active/{category}/notes-{name}.md .arc/reference/archive/{quarter}/{category}/{NN}_{name}/
git mv .arc/active/{category}/completion-{name}.md .arc/reference/archive/{quarter}/{category}/{NN}_{name}/
```

### 4) Delete Status File

`git rm` the per-WU status file — archive deletes, does not reset. The status file lived alongside the task list in
`active/{category}/` and travels with the work unit; once the task list is archived, the status file has no active
purpose and is removed from the working tree.

```bash
git rm .arc/active/{category}/status-{name}.md
```

> **Archiving an incidental that interrupted active work:** `git rm`-ing `status-{incidental}.md` alone does not
> handle the parent WU's state flip (State: `Paused` → `In Progress`, remove `Paused At:` / `Paused To:`). Route
> archival through [`manage-incidental-work.md`][incidental] § Coordinated Pause/Resume — that workflow orchestrates
> both status files in the same commit so the paired flip lands atomically.

### 5) Update PM Artifacts · `arc-in-git` only

> **Skip this step** if `pm.mode` is `none` or `external`.

Update project management documents to reflect the completed and archived work unit:

**PROJECT-STATUS.md** (`.arc/reference/PROJECT-STATUS.md`):

- Move the work unit from **Currently Active** to **Last Completed** (name, category, archive path)
- Add an entry to **Completed Major Work** with a summary of key deliverables (if the work
  qualifies as "major" — see the template guidance in PROJECT-STATUS.md)
- Update **Currently Active** to the next work unit if known, or clear it
- Update **Next Priority** from ROADMAP.md

**ROADMAP.md** (`.arc/backlog/ROADMAP.md`):

- Update the work unit's status to complete (e.g., add "✅ Complete" marker with month/year)

### 6) Post-Archival Extensions · `#post-work-unit-archive`

If `post-work-unit-archive` appears in the active-extensions list (established at session init), load
and execute its [`.actions`][arc-ext-post-archive]. Otherwise, skip.

### 7) Commit Archive Changes

```bash
git add .arc/reference/archive/{quarter}/{category}/{NN}_{name}/
git add .arc/active/{category}/  # captures file deletions (including the status file git-rm'd in Step 4)
```

**Note:** With `arc-in-git`, also stage PROJECT-STATUS.md and ROADMAP.md if updated in Step 5.
If [post-work-unit-archive extensions][arc-ext-post-archive] produced additional changes, stage
those as well.

**Commit message format:** Follow DEV-RULES.ARC.md § Commit format.
Archival commits use type/scope `docs(arc)` or `docs(archive)` with Context footer
`tasks-{name}.md (archival)`.

> **Batch branch note:** When archiving on a batch branch (full protection), the commit lands on
> that branch instead of the base branch. The steps are identical — only the branch context differs.

**Example:**

```bash
git commit -m "docs(arc): archive auth-edge-cases

Archival of completed incidental work:
- Fixed token refresh race condition and session expiry handling
- Added retry logic for intermittent auth failures
- All quality gates passed

Context: tasks-auth-edge-cases.md (archival)"
```

### 8) Next Step

**Partial protection:** Archival is complete. **→ [1_create-prd.md][create-prd]** — Plan the next
work unit.

**Full protection (batch branch):** Continue on the same branch — proceed to
[1_create-prd.md][create-prd] for the next work unit. After task generation
([2_generate-tasks][generate-tasks]), the batch branch is complete — proceed to
[integrate-planning-branch][integrate-planning-branch] to PR the batch to the base branch.
Activation ([activate-work-unit][activate-work-unit]) happens from the base branch after
that PR merges.

**Full protection (standalone archival):** If no next work unit is planned, the housekeeping
branch carries only archival. Push, create a PR, and merge directly — no planning workflows
needed.

---

## Archive Structure

**Path pattern:** `.arc/reference/archive/{quarter}/{category}/{NN}_{name}/`

- `{quarter}`: `2025-q4`, `2025-q3`, etc.
- `{category}`: `feature/`, `technical/`, or `incidental/`
- `{NN}`: Global sequence number (01-99), assigned by completion order across ALL categories
- `{name}`: Work unit name (matching task list name)

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
- Skip status file deletion → dangling state file in `active/` confuses next session-init

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
[incidental]: ../supplemental/manage-incidental-work.md
