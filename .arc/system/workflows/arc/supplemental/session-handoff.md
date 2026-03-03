# Workflow: Session Handoff

**Audience:** Agent-executed — your agent follows this to capture session state.

**Purpose**: Capture session state so the next session can resume with full context. This is the counterpart to
[session initialization][session-init] — together they implement P5 (Context Preservation) at session boundaries.

**When to use**: User-triggered at the end of a session, or when transitioning between work contexts.

**Design context**: This workflow is optimized for agents with ephemeral context — capturing state that would
otherwise be lost when the session ends. Agents with persistent memory may need lighter handoff ceremonies; the
principle (state must be recoverable by a new session) still applies. The session state mechanism is overridable
via [`arc-methods.md` § session-state][arc-methods-session].

## Handoff Protocol

### Pre-Update Verification

**Before writing the handoff, verify actual state:**

1. `git status` — clean vs uncommitted changes
2. `git log --oneline -10` — capture committed work
3. Task list file — verify marked checkboxes reflect actual completion
4. **Working directory** — if it changed during the session, update paths in WORK-STATUS.md

### What to Update

Session state is split across two files:

- **WORK-STATUS.md** (tracked) — project state: branch, task list, current task, blockers, next action
- **SESSION-NOTES.md** (gitignored) — personal context: completed work, decisions, debugging insights,
  things tried. Replaced each handoff (not appended). Created only when there's context worth
  preserving; delete between work units.

**Every handoff** — WORK-STATUS.md (state fields) and SESSION-NOTES.md (session context, if any)

**When context changes** — Working directory paths or environment expectations in WORK-STATUS.md

**Preserve protected sections** — Content marked "DO NOT REMOVE UNTIL..." or similar warnings stays until
its stated condition is met

### Comprehensive Handoff Format

Update session state files before ending session:

1. **First**: Check for protected sections (marked "DO NOT REMOVE UNTIL...") and preserve them
2. **Second**: Check if working directory context changed and update paths in WORK-STATUS.md if needed
3. **Then**: Update both files with work progress:

**Update `.arc/active/WORK-STATUS.md`** (tracked project state):

```markdown
## Active Work

**Branch**: [current branch name, e.g., feature/config-parser]
**Task List**: [path to task list, e.g., .arc/active/feature/tasks-config-parser.md]
  [OR: [none associated] for planning/boundary work between task lists]
**Following Task List**: Yes
  [OR: No - [brief context, e.g., "fixing connection timeout in batch processor (will return to Task 4.5)"]]
**Current Task**: Task 3.3 — Write unit tests (line ~247)
  [REQUIRED when following task list - triple-anchor format enables graduated lookup at session init]
  [Omit only if no task list or transitioning between task lists]
**Last Completed**: Task 3.2 — Add validation logic
  [OR for off-task-list: brief description, e.g., "Fixed connection timeout in batch processor"]
  [OR if work complete: "Backend Type Safety (Tasks 1-14, archived)"]
**Blockers**: [none]
  [OR: describe blockers, pending decisions, waiting on user clarification]
**Next Action**: Start Task 3.3 — Write unit tests for validation logic
  [OR for off-task-list/preparatory: specific action description]
  [Can be preparatory work (strategy doc review, planning) even when Current Task shows task number]

_Note: Current Task shows WHICH task you're on (stable). Next Action shows WHAT to do next
(can be preparatory work before starting task, or specific subtask if already in progress)._
```

**Update `.arc/active/SESSION-NOTES.md`** (personal session context — gitignored):

```markdown
### Completed Work

**CRITICAL: When documenting UNCOMMITTED work, use commit-level granularity.**

Next session needs enough detail to recreate proper atomic commits from `git diff`:
- Map accomplishments to logical commits (what changed, which files/components)
- Include task numbers/references for `Context:` footer
- Note any incidental work separate from task list work
- Provide specificity: component names, file paths, what was changed

**Good examples (uncommitted work):**

- ✅ Task 3.2.1: Added input validation to config parser (src/config.py, src/validators.py) - rejects malformed YAML
- ✅ Task 3.2.2: Updated API response schema (api/v2/schemas.py:45-67) - added nullable fields for partial updates
- ✅ Incidental: Fixed broken cross-reference in workflow doc (session-init.md) - corrected template path

**Bad examples (too vague for commit reconstruction):**

- ❌ "Worked on the parser" (no file mapping, no commit grouping)
- ❌ "Updated several files" (which? for what commits?)
- ❌ "Fixed bugs" (what bugs? which files? separate commits?)

**For committed work:** Simple list with commit hashes is sufficient (commit messages already documented details).

### Remaining Work Before Returning to Task List

_(Only for off-task-list work, only if path is known. Otherwise state "Path unclear - will return to Task X.Y when resolved.")_

1. [Step 1]
2. [Step 2]
3. Return to Task X.Y — Title (line ~XXX in tasks-file.md)

### Additional Context

[Supplemental information not in task list: debugging insights, decisions made, things tried/ruled out, constraints discovered]

[OR: [none] if task list has all needed context]
```

**What to include:**

- **Remaining Work** - Only for off-task-list work when path back is known
    - List ALL steps if known, not just immediate next
    - Critical: Captures full path back to task list (use triple-anchor format: task number + title + line hint)
- **Additional Context** - Supplemental info not in task list
    - Debugging: What tried, what ruled out, what suspected
    - Decisions: Choices made that inform approach
    - Constraints: User preferences, technical limitations
    - Goal: Don't repeat work, don't lose insights

**What NOT to include:**

- ❌ Summaries of entire task list (that's in the task list file)
- ❌ Future work beyond path back to task list
- ❌ Project status updates (that's in git commits)
- ❌ Task descriptions already in task list (redundant)

### Handoff Examples

**Example 1: Off-task-list with known path back**

WORK-STATUS.md:

```markdown
## Active Work

**Branch**: feature/data-pipeline
**Task List**: .arc/active/feature/tasks-data-pipeline.md
**Following Task List**: No - fixing connection timeout in batch processor (will return to Task 4.1)
**Current Task**: Task 4.1 — Add retry logic to ingestion step (line ~312)
**Last Completed**: Task 3.5 — Schema validation for input records
**Blockers**: [none]
**Next Action**: Fix connection timeout in batch processor (src/pipeline/batch.py:89)
```

SESSION-NOTES.md:

```markdown
### Completed Work

- ✅ Task 3.5: Added schema validation for input records
- ⚠️ Discovered connection timeout during integration testing

### Remaining Work Before Returning to Task List

1. Fix connection timeout in batch processor (pool exhaustion under load)
2. Add integration test for concurrent batch processing
3. Run full test suite to verify no regressions
4. Return to Task 4.1 — Add retry logic (line ~312 in tasks-data-pipeline.md)

### Additional Context

- Timeout occurs when batch size exceeds 1000 records (connection pool default is 10)
- Tried increasing pool size to 50, but underlying issue is sequential processing blocking connections
- Best fix: switch to async batch processing with connection pool recycling
```

**Example 2: Preparatory work before starting task**

WORK-STATUS.md:

```markdown
## Active Work

**Branch**: technical/api-documentation
**Task List**: .arc/active/technical/tasks-api-documentation.md
**Following Task List**: Yes
**Current Task**: Task 3.1 — Document authentication endpoints (line ~203)
**Last Completed**: Tasks 2.3-2.4 — Query parameter and response format sections
**Blockers**: [none]
**Next Action**: Review auth middleware source before documenting Task 3.1 endpoints
```

SESSION-NOTES.md:

```markdown
### Completed Work

- ✅ Task 2.3: Query parameter documentation (committed a1b2c3d)
- ✅ Task 2.4: Response format documentation (committed a1b2c3d)

### Additional Context

**Pre-task review needed:**

1. Auth middleware has undocumented rate limiting behavior — need to read source before documenting
2. Token refresh flow has edge case when refresh token expires mid-request
```

**Example 3: Off-task-list with unclear path**

WORK-STATUS.md:

```markdown
## Active Work

**Branch**: technical/ci-pipeline
**Task List**: .arc/active/technical/tasks-ci-pipeline.md
**Following Task List**: No - debugging intermittent test failures in CI (will return to Task 5.2)
**Current Task**: Task 5.2 — Add caching to build step (line ~287)
**Last Completed**: Task 5.1 — Parallelize test stages
**Blockers**: [none]
**Next Action**: Continue debugging intermittent CI test failures
```

SESSION-NOTES.md:

```markdown
### Completed Work

- ✅ Task 5.1: Parallelized test stages
- ⚠️ Investigating intermittent test failures after parallelization (~30% failure rate)

### Remaining Work Before Returning to Task List

Path unclear - exploratory debugging. Will return to Task 5.2 — Add caching to build step (line ~287) when resolved.

### Additional Context

- Failures are non-deterministic, only appear in parallel execution
- Ruled out: shared database state (tests use isolated transactions), file locking
- Suspect: Race condition in shared temp directory between parallel workers
- Next: Add per-worker temp directories and re-run failure suite
```

### Task List Completion & Transition Format

**When work is complete and/or task list has been archived**, use this expanded format:

WORK-STATUS.md:

```markdown
## Active Work

**Last Completed**: [Task list name] (Tasks X-Y, archived)
**Blockers**: [none]
**Next Action**: Begin [new-task-list.md] starting with Task 1
```

SESSION-NOTES.md:

```markdown
### [Task List Name] - COMPLETE & ARCHIVED ✅

**Status**: All tasks complete, task list archived
**Completion Date**: [date]
**Archived To**: [path to archived task list]

**What Was Accomplished:**

1. [Brief bullet points of major accomplishments]
2. [...]

**All Changes Committed:**

- [commit hash] - [commit message]
- [commit hash] - [commit message]
  [OR if uncommitted work exists: list specific files and why]

**Git Status:** Clean working tree, all changes committed
[OR: "X files uncommitted: [list files and reason]"]
```

**Key principle**: Document the **actual state** as verified by git, not assumptions.

### Post-Update Cleanup

After updating session state files, verify clean markdown. If SESSION-NOTES.md is gitignored, your linter
may skip it by default — pass the path explicitly or use an IDE-integrated linter.

### Confirm Handoff

After updating WORK-STATUS.md and SESSION-NOTES.md, deliver a verbal summary to the user. This is a quick
confirmation for the human — the session state files are the durable artifacts.

**ARC session handoff complete** · `{branch-name}` · {clean | uncommitted changes}

**Session summary:**

- [What was accomplished — bullet per logical unit of work]
- [Include commit hashes for committed work]

**Uncommitted work:**

- [Files/changes with logical commit grouping]

**Next session:** [What comes next per WORK-STATUS.md]

**Formatting guidance:**

- Mirrors the session-init orientation summary — bookend pattern
- **Session summary** is accomplishments, not a task list replay — focus on outcomes
- **Uncommitted work** maps to commits: enough detail for the next session to
  reconstruct proper atomic commits without re-reading diffs. Omit this section
  entirely when all work is committed — less noise when there's nothing to report
- **Next session** is standalone and prominent — same scanning target as init's
  "Next action"

[session-init]: session-init.md
[arc-methods-session]: ../../arc-methods.md#session-state
