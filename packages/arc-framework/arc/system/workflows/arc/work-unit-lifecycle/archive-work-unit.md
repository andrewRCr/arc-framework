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

### 0) Verify Archive Eligibility and Cadence

Read the active status file before moving files:

```bash
grep -E '^\- \*\*(State|Integration):\*\*' .arc/active/{category}/status-{name}.md
```

Archive only after the status file shows:

```text
- **State:** Complete
- **Integration:** Merged
```

If either field is missing or has a different value, stop and surface the mismatch. The work unit is not
eligible for archival until integration has completed.

If `**State:** Complete` is present and the PR is merged but `**Integration:** Merged` is absent, add the
Integration line below `**Branch:**` as part of the archival ceremony before moving files.

Then check `archive.cadence` in `.arc/system/arc-config.yml`:

- **`with-integration`** (default): proceed. Archival lands as its own commit in the integration PR / batch
  branch after the implementation PR merges.
- **`manual`**: if this workflow was reached automatically from integration, log the eligibility result and
  stop. Continue only when the user explicitly invokes archive.

### 0b) Set Up Branch (Full Protection Only)

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

### 1) Record Pull Request URL

Before deleting the child branch, resolve the merged PR URL and update `completion-{name}.md`:

```bash
pr_url=$(gh pr list --state merged --head {child-branch-name} --base {parent-branch} --json url --jq '.[0].url')
if [ -z "$pr_url" ] || [ "$pr_url" = "null" ]; then
  echo "No merged PR found for {child-branch-name} into {parent-branch}; resolve completion-doc PR field explicitly."
  exit 1
fi
```

Replace the completion doc's `**Pull Request:** {pending until archival}` value with the URL. This lands the
durable review link in the archival commit instead of creating a metadata-only commit during PR review.

### 1b) Delete Child Branch

Skip if the implementation branch was already cleaned up (e.g., by
[activate-planning-branch][activate-planning-branch] in the batch path).

```bash
git branch -d {child-branch-name}
git push origin --delete {child-branch-name}  # if pushed
```

### 2) Route Reference Files (If Applicable)

Before archiving, assess whether any work artifacts have reference value beyond this work unit.

**Decision:** "Do any files have lasting reference value outside this work unit's context?"

**`research-*` convention:** `research-*` files are standalone reference docs by convention —
always route to `.arc/reference/research/`. Research content embedded in `notes-*` files is
different: tightly coupled to the work unit, archives normally.

**Routing:**

- **Yes** → Move (not copy) to the appropriate reference directory. Never duplicate files across
  archive and reference — a file lives in one place. Note the routing in the completion doc's
  Routed Reference Files section (add the section if not present — see
  [template-completion-doc][template-completion-doc] § Optional Sections).
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

> [!IMPORTANT]
> `workflow-interlock`: Stop before leaving archival for PRD creation. Surface archived work,
> active planning state, and await direction before proceeding to the next workflow.

**Full protection (standalone archival):** If no next work unit is planned, the housekeeping
branch carries only archival. Push, create a PR, and merge directly — no planning workflows
needed.

---

## Archive Structure

**Path pattern:** `.arc/reference/archive/{quarter}/{category}/{NN}_{name}/` — `{quarter}` in
`YYYY-qN` form; `{category}` is `feature/`, `technical/`, or `incidental/`; `{NN}` is a global
zero-padded sequence number (01-99) assigned by completion order across ALL categories, reset
each quarter. See [Work Organization Strategy][work-org] for categorization rules.

---

[work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md
[rotate-branch]: rotate-branch.md
[integrate-work-unit]: integrate-work-unit.md
[activate-work-unit]: activate-work-unit.md
[create-prd]: ../1_create-prd.md
[generate-tasks]: ../2_generate-tasks.md
[activate-planning-branch]: planning/activate-planning-branch.md
[integrate-planning-branch]: planning/integrate-planning-branch.md
[arc-ext-post-archive]: ../../../extensions/post-work-unit-archive.md
[incidental]: ../supplemental/manage-incidental-work.md
[template-completion-doc]: ../../../../reference/templates/template-completion-doc.md
