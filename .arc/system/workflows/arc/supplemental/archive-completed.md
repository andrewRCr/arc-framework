# Workflow: Archive Completed Work

**Audience:** Agent-executed — your agent follows this to archive completed work.

Move completed work documentation to structured archive to keep the active workspace clean while preserving
history and context.

**Archive Timing:**

Task lists are archived **when all tasks are marked complete** (`[x]`). Task completion is the
trigger — branch cleanup happens independently as PRs merge.

- All tasks `[x]` → Archive task list to `.arc/reference/archive/`
- Branches merged and deleted → Independent cleanup (may happen before or after archival)

For multi-branch work units (stacked PRs, team sub-branches), archive once when all tasks
complete, even if individual branches are merged incrementally.

**Multi-branch work units** follow three distinct operations:

1. **Rotate** — Intermediate merge. A branch's scope is done but the task list has remaining work.
   Merge the branch, set up the next one, continue working. No archival, no completion doc.
   See [rotate-branch][rotate-branch] workflow.
2. **Complete** — All tasks in the task list are marked `[x]`. The work unit is done.
3. **Archive** — This workflow. Runs once after the final merge, when all tasks are complete.
   Creates the completion doc, moves files to archive, updates tracking.

Rotation may happen multiple times during a work unit; archival happens exactly once at the end.

See [Work Organization Strategy][work-org] for the complete task list and branch relationship model.

## Workflow Overview

**All work follows the same archival workflow**, regardless of category (feature/technical/incidental):

1. **Phase 1: On Child Branch** - Complete work, clean docs, create completion metadata
2. **Phase 2: Code Review & Merge** - Review, PR, merge to parent
3. **Phase 3: After Merge** - Archive files, update tracking, clean up branches

**Key principle:** Documentation cleanup and completion metadata are part of the child branch deliverable,
not a post-merge activity. This ensures PR reviewers see clean, well-organized docs.

---

## Phase 1: On Child Branch (Before PR)

**Context:** You're on the child branch where work was completed (e.g., `incidental/fix-auth-edge-cases`).

### 1) Verify Work Completion

- [ ] All task list subtasks and parent tasks marked `[x]`
- [ ] Task list header `**Status:**` updated to `Complete`
- [ ] Task list Success Criteria all checked (expected — verification phase should have validated these)
- [ ] PRD alignment (if PRD exists — planned work only):
    - [ ] Confirm success criteria against PRD — second pass after verification phase. Note any
      deviations or criteria met differently than originally planned
    - [ ] PRD header `**Status:**` updated to `Complete`
    - [ ] PRD Open Questions resolved with brief notes on decisions made
- [ ] All quality gates passed (documented as completed subtasks in task list)
- [ ] Implementation verified in development environment (if applicable — documentation-only work may not need this)

### 1b) Generated Code Sync Check (If Applicable)

**If your project has generated code** (API types, schema files, etc.), verify they're in sync before archiving:

```bash
# Check if source files changed that would require regeneration
git diff {{BASE_BRANCH}} --name-only | grep -E "{{GENERATED_CODE_SOURCE_PATTERN}}"

# If any matches, regenerate (project-specific command)
{{TYPE_GENERATION_COMMAND}}

# Check for uncommitted changes
git diff --exit-code {{GENERATED_FILES_PATTERN}}
```

**If diff shows changes:** Commit them before proceeding. CI may fail if generated files drift from source.

### 2) Clean Up Documentation (MANDATORY)

**Run [maintain-task-notes.md](maintain-task-notes.md) workflow in Mode 2 (Archival Preparation).**

This produces: clean task file (temporal markers removed, detailed granularity preserved), notes file
evaluated for archival worthiness (kept and cleaned, or deleted if scratchpad), cross-references updated.

### 3) Create Completion Metadata

**All work gets a completion document** (feature, technical, AND incidental). Create
`completion-{name}.md` in the same directory as the task list. The completion doc doubles as your
PR description draft — creating it as a persistent document ensures it's searchable beyond GitHub.

**Required Reading Before Drafting**

The completion doc must be accurate because it's used for PRs. Before writing:

1. **Task list overview** (first ~100 lines) — Scope, context, what was planned
2. **Final phase(s)** of task list — Actual completion state, follow-up work status
3. **CLEANUP-PROGRESS data** (for large files) — Metrics collected during cleanup
4. **Git log** for final commit hash — `git log -1 --oneline`

**Template (identical for all work categories):**

```markdown
# Completion: {Work Name}

**Completed**: YYYY-MM-DD
**Branch**: {branch-name}
**Category**: {Feature | Technical | Incidental}
**Context**: {One-liner: "Discovered during X" or "Part of roadmap initiative Y"}

## Summary

{2-3 sentences: What was accomplished and why it matters}

## Key Deliverables

{Concrete outputs - components, capabilities, test coverage areas}
{Focus on the important stuff, not exhaustive inventory}
{Avoid volatile metrics (test counts, version numbers) - they become stale}

- {Component or capability}
- {Another deliverable}

## Implementation Highlights

{Notable technical details worth remembering}

- {Major decision or pattern established}
- {Significant challenge overcome}
- {Anything useful for similar future work}

## Related Documentation

- {For planned work: PRD: `path/to/prd-{name}.md`}
- Tasks: `path/to/tasks-{name}.md`
- Notes: `path/to/notes-{name}.md` (if exists)

## {For planned work only: Incidental Work Completed}

{List any incidental task lists completed during this work}

- `tasks-{name}.md` - {brief description}

## Follow-Up Work

{Any deferred items or future considerations - ONLY items still deferred at task end}
```

---

**Verification Checklist (MANDATORY)**

Before considering the completion doc done, verify EVERY claim:

- [ ] **Completed date**: Verified (matches task list header)
- [ ] **Phase count**: Matches actual phases in task file — `grep -c "^###.*Phase" tasks-*.md`
- [ ] **Quantitative claims**: Each number verified in task file
      - Where does "7 themes" come from? → Phase X, line Y
      - Where does "50+ components" come from? → Phase X, line Y
- [ ] **Follow-up work**: Reflects FINAL phase state
      - Check: Did any "deferred" items get completed in later phases?
      - Only list what's ACTUALLY still deferred at task end
- [ ] **No stale references**: No mentions of deleted notes file (if deleted), etc
- [ ] **All major phases represented**: Check CLEANUP-PROGRESS data includes all phases

**Evidence format:** For each claim, note where verified. This catches stale data from early phases.

### 4) Commit Documentation Changes

Commit all documentation updates to the child branch.

```bash
git add .arc/active/{category}/tasks-{name}.md
git add .arc/active/{category}/notes-{name}.md  # if exists
git add .arc/active/{category}/completion-{name}.md
git add .arc/active/{category}/prd-{name}.md  # if planned work with PRD updates
```

**Commit message format:** Follow DEV-RULES.ARC.md § Commit format.
Documentation prep commits use type/scope `docs(arc)` or `docs({category})` with a Context footer
referencing the task list being archived.

**⛔ CHECKPOINT:** Phase 1 complete. Do NOT push yet. Proceed to Phase 2 for code review before PR.

---

## Phase 2: Code Review & Merge

**Context:** Still on child branch, docs are clean and committed. **Branch is NOT pushed yet.**

### 5) Local Code Review (Before Push)

Run local review before pushing to remote — fixes made here are part of the clean branch history.

```bash
# Run local review (AI tool, linting, manual checklist)
{{LOCAL_REVIEW_COMMAND}}

# Fix any findings, commit fixes if needed
```

### 6) Push and Create PR

```bash
git push -u origin {branch-name}
gh pr create --base {parent-branch} --head {branch-name}
```

Use `completion-{name}.md` as PR description template — copy/adapt sections for the PR body.

### 7) Address PR Review Findings

If code review results in significant changes:

- Update code as requested
- **Update completion metadata if work outcomes changed** (completion doc should reflect final state)
- Commit fixes with references to review findings
- Re-run quality checks if necessary

### 8) Merge Pull Request

```bash
# Via GitHub CLI — use flag matching merge.strategy in arc-config.yml
gh pr merge {pr-number} --merge   # default; use --squash or --rebase per config

# Or locally
git checkout parent-branch
git merge child-branch --no-ff
git push
```

---

## Phase 3: After Merge

**Context:** PR is merged, you're on the parent branch (e.g., the base branch or a parent feature branch).

> **Multi-branch verification:** If this work unit spanned multiple branches (stacked PRs, phased
> delivery), confirm that **all** branches have been merged before proceeding with archival. Archival
> is a one-time operation on the fully completed work unit — intermediate merges are handled by the
> [rotate-branch][rotate-branch] workflow and do not trigger archival.

### 9) Delete Child Branch

```bash
git branch -d {child-branch-name}
git push origin --delete {child-branch-name}  # if pushed
```

### 10) Archive Files

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

### 11) Update WORK-STATUS.md

Update `.arc/active/WORK-STATUS.md` to reflect the post-archival state.

**Archiving to base branch** (normal case — work unit complete):

Reset to "no active work" defaults:

```markdown
**Branch**: `main`
**Task List**: [none]
**Following Task List**: No
**Current Task**: —
**Last Completed**: {Work Name} (archived)
**Blockers**: [none]
**Next Action**: Create a PRD when ready to start planned work → `1_create-prd.md`
```

**Archiving to parent work branch** (stacked incidental returning to parent):

Restore WORK-STATUS.md to the parent work unit's context — branch name, task list path,
and current task from where work was interrupted. The parent's state is recoverable from
the parent branch's task list and commit history.

### 12) Post-Archival Extensions · `#post-work-unit-archive`

If [post-work-unit-archive extensions][arc-ext-post-archive] are configured, execute them now. This is the
primary interface for PM layers to update project management artifacts (PROJECT-STATUS, ROADMAP) at archival time.

See: [`arc-extensions.md` § post-work-unit-archive][arc-ext-post-archive]

### 13) Commit Archive Changes

```bash
git add .arc/reference/archive/{quarter}/{category}/{name}/
git add .arc/active/{category}/  # captures file deletions
git add .arc/active/WORK-STATUS.md
```

**Note:** If [post-work-unit-archive extensions][arc-ext-post-archive] produced additional changes
(e.g., PM layer artifacts), stage those as well.

**Commit message format:** Follow DEV-RULES.ARC.md § Commit format.
Archival commits use type/scope `docs(arc)` or `docs(archive)` with Context footer
`tasks-{name}.md (maintenance)`.

**Example:**

```bash
git commit -m "docs(arc): archive fix-auth-edge-cases

Archival of completed incidental work:
- Fixed token refresh race condition and session expiry handling
- Added retry logic for intermittent auth failures
- All quality gates passed

Context: tasks-fix-auth-edge-cases.md (maintenance)"
```

---

## Archive Structure

**Path pattern:** `.arc/reference/archive/{quarter}/{category}/{NN}_{name}/`

- `{quarter}`: `2025-q4`, `2025-q3`, etc.
- `{category}`: `feature/`, `technical/`, or `incidental/`
- `{NN}`: Global sequence number (01-99), assigned by completion order across ALL categories
- `{name}`: Work package name (matching task list name)

**Example structure:**

```
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

- ❌ Skip doc hygiene → Run [maintain-task-notes.md](maintain-task-notes.md) Mode 2 first
- ❌ Use `mv` instead of `git mv` → Loses file history
- ❌ Archive before tasks complete → All tasks must be `[x]` before archiving
- ❌ Skip completion doc → ALL work gets `completion-{name}.md`

---

## Appendix

### Handling Partially Superseded Work

**When to use:** Work where significant progress was made before an architectural decision changed direction.
Earlier phases remain valid (will be used by new approach), but later phases are obsolete.

**Status field:** `**Status:** Superseded (partial)`

**Required elements:**

1. **Header metadata:**

   ```markdown
   **Completed:** YYYY-MM-DD
   **Status:** Superseded (partial)
   **Superseded By:** `tasks-{new-approach}.md` (YYYY-MM-DD)
   ```

2. **Supersession rationale:** Brief explanation of what triggered the change and what remains valid vs obsolete.

3. **Decision point marker:** Insert before first superseded task:

   ```markdown
   ---

   **⚠️ Supersession Point (YYYY-MM-DD):** Tasks X.Y onwards superseded by [reason].
   See `tasks-{new-approach}.md` for continuation. Earlier phases (1-X.Z) remain valid -
   [brief explanation of what's reused].

   ---
   ```

4. **Mark superseded tasks with `[~]`:** Clearly indicates tasks weren't abandoned without thought:

   ```markdown
   - [~] **4.1 Task description** *(superseded by infinite scroll)*
   ```

   The `[~]` marker means "intentionally not done" — distinct from `[ ]` (pending) and `[x]`
   (complete). Same convention used in [success criteria][task-list-formatting] for superseded
   criteria.

5. **Completion doc:** Include `**Status:** Superseded (partial)` and document what was completed vs superseded.

**Key principle:** The `[~]` marker + decision point note creates clear audit trail showing intentional
architectural pivot, not abandoned work.

---

[work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md
[task-list-formatting]: ../../../../reference/strategies/arc/strategy-task-list-formatting.md
[rotate-branch]: rotate-branch.md
[arc-ext-post-archive]: ../../arc-extensions.md#post-work-unit-archive
