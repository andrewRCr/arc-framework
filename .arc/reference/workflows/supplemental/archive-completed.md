# Workflow: Archive Completed Work

Move completed work documentation to structured archive to keep the active workspace clean while preserving
history and context.

**Archive Timing:**

Task lists are archived **immediately when their corresponding git branch is deleted** (which occurs after merge
completion). This creates conceptual coherence:

- Branch exists ↔ Task list in `.arc/active/`
- Branch deleted → Task list archived to `.arc/reference/archive/`

See [Work Organization Strategy](../../strategies/arc/strategy-work-organization.md) for complete rationale.

## Workflow Overview

**All work follows the same archival workflow**, regardless of category (feature/technical/incidental):

1. **Phase 1: On Child Branch** - Complete work, clean docs, create completion metadata
2. **Phase 2: Code Review & Merge** - Review, PR, merge to parent
3. **Phase 3: On Parent Branch** - Delete child branch, archive files, commit

**Key principle:** Documentation cleanup and completion metadata are part of the child branch deliverable,
not a post-merge activity. This ensures PR reviewers see clean, well-organized docs.

---

## Phase 1: On Child Branch (Before PR)

**Context:** You're on the child branch where work was completed (e.g., `incidental/chakra-recipe-system`).

### 1) Verify Work Completion

- [ ] All task list subtasks and parent tasks marked `[x]`
- [ ] Task list header `**Status:**` updated to `Complete`
- [ ] Task list Success Criteria aligned with completed Phase tasks (all checked if work complete)
- [ ] PRD alignment (if PRD exists - planned work only):
    - [ ] PRD header `**Status:**` updated to `Complete`
    - [ ] PRD Open Questions resolved with brief notes on decisions made
- [ ] All quality gates passed (documented as completed subtasks in task list)
- [ ] Implementation functions as expected in development environment
- [ ] PROJECT-STATUS reflects completion (if applicable - major features/technical work)

**Note:** Quality gates (tests, linting, type checking) are always documented as subtasks in the task list.
If all tasks are marked complete, quality gates have passed. No separate verification step needed.

**Note:** Not all work has PRDs. Incidental work typically has only task lists. Skip PRD alignment items if no PRD.

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

**Why this step:** CI typically regenerates from source and compares against committed files. Local checks
may pass with stale generated files, but CI catches the drift.

### 2) Clean Up Documentation (MANDATORY)

**Run [maintain-task-notes.md](maintain-task-notes.md) workflow in Mode 2 (Archival Preparation):**

This step prepares task file and evaluates notes file for archival:

- **Task file cleanup**: Remove temporal junk, excessive repetition, forward pointers while preserving detailed
  sub-task record
- **Notes file evaluation**: Determine if notes are archival-worthy or disposable scratchpad work
- **Notes file preparation** (if keeping): Add table of contents, clean section headers, remove temporal markers, consolidate
- **Cross-reference updates**: Update status metadata, add completion dates, clean pointers
- **Quality checks**: Run markdown linting, verify no accidental task edits

**Expected outcome:** Task file is clean detailed record (temporal markers removed, repetition eliminated, detailed
granularity preserved). Notes file is evaluated for archival worthiness (may be deleted if just scratchpad work).
Completion doc will contain executive summary.

**Note on notes files:** Not all work has archival-worthy notes. The maintain-task-notes workflow (Step 1d) includes
evaluation criteria. If notes are just implementation scratchpad work with no future reference value, delete the
notes file entirely rather than archiving it.

**Time estimate:** 20-40 minutes

**Do not skip this step** - Archives without this cleanup are difficult to use 6 months later.

### 3) Create Completion Metadata

**All work gets a completion document** (feature, technical, AND incidental).

Create `completion-{name}.md` in the same directory as the task list:

**For planned work (feature/technical):**

```bash
# Create in active directory alongside PRD and tasks
# Example: .arc/active/feature/completion-user-authentication.md
```

**For incidental work:**

```bash
# Create in active incidental directory alongside tasks
# Example: .arc/active/incidental/completion-chakra-recipe-system.md
```

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

**Required Reading Before Drafting**

The completion doc must be accurate because it's used for PRs. Before writing:

1. **Task list overview** (first ~100 lines) - Scope, context, what was planned
2. **Final phase(s)** of task list - Actual completion state, follow-up work status
3. **CLEANUP-PROGRESS data** (for large files) - Metrics collected during cleanup
4. **Git log** for final commit hash - `git log -1 --oneline`

---

**Verification Checklist (MANDATORY)**

Before considering the completion doc done, verify EVERY claim:

- [ ] **Completed date**: Verified (matches task list header)
- [ ] **Phase count**: Matches actual phases in task file - `grep -c "^###.*Phase" tasks-*.md`
- [ ] **Quantitative claims**: Each number verified in task file
      - Where does "7 themes" come from? → Phase X, line Y
      - Where does "50+ components" come from? → Phase X, line Y
- [ ] **Follow-up work**: Reflects FINAL phase state
      - Check: Did any "deferred" items get completed in later phases?
      - Only list what's ACTUALLY still deferred at task end
- [ ] **No stale references**: No mentions of deleted notes file (if deleted), etc
- [ ] **All major phases represented**: Check CLEANUP-PROGRESS data includes all phases

**Evidence format:** For each claim, note where verified. This catches stale data from early phases.

---

**Purpose of completion doc:**

1. **Executive summary** - "What was achieved?" in 2-3 minutes of reading
2. **PR description template** - Copy/adapt sections for PR body
3. **Future reference** - One place to look for work outcomes

**Dual-purpose with PR:** The completion doc serves as your PR description draft. You'll write this content
anyway for the PR - creating it as a persistent document ensures it's searchable and greppable beyond GitHub.

### 4) Commit Documentation Changes

Commit all documentation updates to the child branch.

**Stage changes:**

```bash
git add .arc/active/{category}/tasks-{name}.md
git add .arc/active/{category}/notes-{name}.md  # if exists
git add .arc/active/{category}/completion-{name}.md
git add .arc/active/{category}/prd-{name}.md  # if planned work with PRD updates
```

**Commit message format:** Follow [atomic-commit.md](atomic-commit.md) for full commit message standards.

Documentation prep commits use:

- **Type/scope:** `docs(arc)` or `docs({category})`
- **Context footer:** Reference the task list being archived

**Why commit on child branch:**

- Documentation cleanup is part of the work deliverable
- PR reviewers see clean, organized docs
- Completion metadata informs PR description
- Natural forcing function: "Is completion doc accurate?"

**⛔ CHECKPOINT:** Phase 1 complete. Do NOT push yet. Proceed to Phase 2 for code review before PR.

---

## Phase 2: Code Review & Merge

**Context:** Still on child branch, docs are clean and committed. **Branch is NOT pushed yet.**

### 5) Local Code Review (Before Push)

**Run local review before pushing to remote.** This catches issues before they hit PR review,
creating a cleaner review experience.

```bash
# Run local review (AI tool, linting, manual checklist)
{{LOCAL_REVIEW_COMMAND}}

# Fix any findings
# Commit fixes if needed
```

**Why before push:** Fixes made here are part of the clean branch history. Fixes after PR creation
require additional commits and re-review cycles.

### 6) Push and Create PR

**After local review passes:**

```bash
# Push branch to remote
git push -u origin {branch-name}

# Create PR using completion doc as description template
gh pr create --base {parent-branch} --head {branch-name}
```

**Use completion doc as PR description template:** Copy/adapt sections from `completion-{name}.md`
for the PR body. This ensures consistency and avoids duplicate writing.

### 7) Address PR Review Findings

**If code review results in significant changes:**

- Update code as requested
- **Update completion metadata if work outcomes changed**
- Commit fixes with references to review findings
- Re-run quality checks if necessary (add as task list subtasks)

**Important:** If review causes substantial changes to what was delivered, the completion doc should reflect
final state, not initial intent. This is a natural forcing function for accuracy.

### 8) Merge Pull Request

```bash
# Merge PR through GitHub interface or CLI
gh pr merge {pr-number} --merge  # preserve commit history (no squash)

# Or if merging locally:
git checkout parent-branch
git merge child-branch --no-ff  # preserve merge commit
git push
```

---

## Phase 3: On Parent Branch (After Merge)

**Context:** PR is merged, you're now on the parent branch (e.g., `technical/service-layer-modernization`
or `main`).

### 9) Delete Child Branch

```bash
# Delete locally
git branch -d {child-branch-name}

# Delete remotely (if pushed)
git push origin --delete {child-branch-name}
```

**Branch deletion is the trigger for archival.** Once the branch is deleted, the task list should immediately
move from `.arc/active/` to `.arc/reference/archive/`.

### 10) Archive Files

**Create archive directory and move all files using git mv** (preserves history):

**First, determine the sequence number:**

```bash
# Count existing work unit dirs across ALL categories in the quarter
# Example: if there are 24 dirs total, next number is 25
find .arc/reference/archive/{quarter} -mindepth 2 -maxdepth 2 -type d | wc -l
```

**For planned work (feature/technical):**

```bash
# Create work package directory with sequence prefix
# {quarter} = current quarter, e.g., 2025-q4
# {NN} = next sequence number (zero-padded, e.g., 25)
mkdir -p .arc/reference/archive/{quarter}/{category}/{NN}_{name}

# Move all files with git mv (preserves history)
git mv .arc/active/{category}/prd-{name}.md .arc/reference/archive/{quarter}/{category}/{NN}_{name}/
git mv .arc/active/{category}/tasks-{name}.md .arc/reference/archive/{quarter}/{category}/{NN}_{name}/
git mv .arc/active/{category}/notes-{name}.md .arc/reference/archive/{quarter}/{category}/{NN}_{name}/  # if exists
git mv .arc/active/{category}/completion-{name}.md .arc/reference/archive/{quarter}/{category}/{NN}_{name}/
```

**For incidental work:**

```bash
# Subdirectory ALWAYS created (tasks + completion = 2 files minimum)
# {quarter} = current quarter, e.g., 2025-q4
# {NN} = next sequence number (zero-padded, e.g., 25)
mkdir -p .arc/reference/archive/{quarter}/incidental/{NN}_{name}
git mv .arc/active/incidental/tasks-{name}.md .arc/reference/archive/{quarter}/incidental/{NN}_{name}/
git mv .arc/active/incidental/completion-{name}.md .arc/reference/archive/{quarter}/incidental/{NN}_{name}/
git mv .arc/active/incidental/notes-{name}.md .arc/reference/archive/{quarter}/incidental/{NN}_{name}/  # if exists

# Note: With unified completion docs (mandatory for ALL work), subdirectory is always required
```

**Why git mv:** Preserves file history. Future developers can use `git log --follow` to see the file's
full evolution even after it moved to archive.

### 11) Update PROJECT-STATUS and ROADMAP

Update `.arc/reference/constitution/PROJECT-STATUS.md` if applicable:

- Update "Last Completed" section to add newly completed work with archive link
- Remove from "Currently Active" section
- If significant work, add to "Completed Major Work" section with description
- Update project metrics (tests, coverage, new capabilities) as appropriate

Update `.arc/backlog/ROADMAP.md` if applicable:

- Mark completed work with ✅ and completion date
- Update archive path reference
- Adjust "Last Updated" date

**When to update these docs:**

- ✅ Major features (always document completion)
- ✅ Significant technical work (modernization, infrastructure changes)
- ❌ Small incidental fixes (usually not necessary)

### 12) Commit Archive Changes

**Stage changes:**

```bash
git add .arc/reference/archive/{quarter}/{category}/{name}/
git add .arc/active/{category}/  # captures file deletions
git add .arc/reference/constitution/PROJECT-STATUS.md  # if updated
git add .arc/backlog/ROADMAP.md  # if updated
```

**Commit message format:** Follow [atomic-commit.md](atomic-commit.md) for full commit message standards.

Archival commits use:

- **Type/scope:** `docs(arc)` or `docs(archive)`
- **Context footer:** `Context: tasks-{name}.md (maintenance)`

**Why `(maintenance)`:** Archival IS maintenance of that task list. The commit includes all related
artifacts (cleaned task file, notes file, completion doc, any ADRs discovered during the work) -
all tied to that specific task list.

**Example:**

```bash
git commit -m "docs(arc): archive discover-endpoint-consolidation

Archival of completed incidental work:
- Consolidated endpoints to thin wrapper architecture
- Fixed now-playing/upcoming date ranges and filter support
- 73 tests added, all quality gates passed

Context: tasks-discover-endpoint-consolidation.md (maintenance)"
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
│   ├── 01_logging-system/
│   ├── 02_api-layer-modernization-p1/
│   ├── 03_authentication-modernization/
│   └── 10_api-layer-modernization-p2/
├── incidental/
│   ├── 04_backend-type-safety/
│   ├── 05_fix-backend-type-errors/
│   └── ...
└── feature/
    └── (none in this quarter)
```

**Sequence numbering:**

- Numbers are **global across all categories** (not per-category)
- Assigned in **completion order** (when work was archived, not started)
- Gaps between numbers within a category show where other categories' work completed
- Reset to 01 at start of each quarter
- To find next number: count existing work unit dirs across all categories in the quarter

**Key principles:**

- All work gets `completion-{name}.md` (unified strategy)
- Work packages group by subdirectory (tasks + completion minimum)
- Use `git mv` to preserve file history
- Sequence prefix enables chronological ordering at a glance

**Categorization:** See [Work Organization Strategy](../../strategies/arc/strategy-work-organization.md)
for feature vs technical vs incidental decision rules.

---

## Common Pitfalls

**Critical errors:**

- ❌ Skip doc hygiene → Run [maintain-task-notes.md](maintain-task-notes.md) Mode 2 first
- ❌ Use `mv` instead of `git mv` → Loses file history
- ❌ Archive before branch deletion → Delete branch first, then archive
- ❌ Skip completion doc → ALL work gets `completion-{name}.md`

**Best practices:**

- ✅ Run maintain-task-notes Mode 2 before archiving
- ✅ Create completion doc on child branch (before PR)
- ✅ Use completion doc as PR description template
- ✅ Use `git mv` to preserve history

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

4. **Strikethrough incomplete tasks:** Use `~~` to clearly indicate tasks weren't abandoned without thought:

   ```markdown
   - ~~[ ] **4.1 Task description**~~ *(superseded by infinite scroll)*
   ```

5. **Completion doc:** Include `**Status:** Superseded (partial)` and document what was completed vs superseded.

**Key principle:** The strikethrough + decision point note creates clear audit trail showing intentional
architectural pivot, not abandoned work.

---
