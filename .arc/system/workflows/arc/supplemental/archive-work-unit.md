# Workflow: Archive Work Unit

**Audience:** Agent-executed — your agent follows this to archive a merged work unit.

After a work unit is merged to the parent branch, this workflow moves completed documentation to
structured archive, updates tracking state, and cleans up branches. This is post-merge bookkeeping —
the substantive work (doc prep, review, merge) happens in [integrate-work-unit][integrate-work-unit].

**When to use:** The work unit's PR is merged and you're on the parent branch.

**Prerequisite:** [integrate-work-unit][integrate-work-unit] completed — docs are clean, completion
metadata exists, code review is done, PR is merged.

> **Multi-branch verification:** If this work unit spanned multiple branches (stacked PRs, phased
> delivery), confirm that **all** branches have been merged before proceeding. Archival is a one-time
> operation on the fully completed work unit — intermediate merges are handled by the
> [rotate-branch][rotate-branch] workflow and do not trigger archival.

---

## Steps

### 1) Delete Child Branch

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

### 3) Route Research Files (If Applicable)

Before archiving, assess whether any work artifacts have reference value beyond this work unit —
investigation notes, benchmark data, design explorations, research summaries. These files lose
discoverability once buried in the archive directory.

**Decision:** "Do any files have lasting reference value outside this work unit's context?"

- **Yes** → Copy (not move) to `.arc/reference/research/` with a descriptive name. The original
  stays with the archive for completeness. Note the routing in the completion doc's Related
  Documentation section.
- **No** → Proceed directly to archival. Most work units won't have research files — this step
  is a quick assessment, not a gate.

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
**Next Action**: Create a PRD when ready to start planned work → `1_create-prd.md`
```

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

**Example:**

```bash
git commit -m "docs(arc): archive fix-auth-edge-cases

Archival of completed incidental work:
- Fixed token refresh race condition and session expiry handling
- Added retry logic for intermittent auth failures
- All quality gates passed

Context: tasks-fix-auth-edge-cases.md (archival)"
```

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
[arc-ext-post-archive]: ../../arc-extensions.md#post-work-unit-archive
