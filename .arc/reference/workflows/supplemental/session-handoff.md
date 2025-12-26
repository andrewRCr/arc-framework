# AI Session Handoff

This document provides protocols for AI assistants to handle context management, session handoffs, and workflow state recovery.

## Session Initialization Protocol

### Starting Fresh or Resuming

1. **Acknowledge rules**: "Ready. Using DEVELOPMENT-RULES v{{SYSTEM_VERSION}}"
2. **Read essential context**: DEVELOPMENT-RULES.md, AGENTS.md, current PRD and task list docs
3. **Check session state**: Read `.arc/active/CURRENT-SESSION.md` if resuming
4. **Verify git state**: Confirm branch and working directory status
5. **Ask for direction**: "What should I work on?"

## Session Handoff Protocol

### ⚠️ CRITICAL: Working Directory Context Check

**BEFORE updating CURRENT-SESSION.md, always check if working directory context has changed:**

```bash
# Check current working directory
pwd
```

**If you are switching work contexts** (e.g., moving between subdirectories or back to repo root), you **MUST**
update the "Session Startup Protocol" section in CURRENT-SESSION.md:

- ✅ **Update step 1** (pwd expected output)
- ✅ **Update step 3** (tool path adjustments based on working directory)
- ✅ **Update step 4** (path context table with correct relative paths)
- ✅ **Update step 5** (acknowledgment statement with correct paths)

**Examples of when to update:**

- Switching between different subdirectories in the codebase → Update to show new context
- Moving from subdirectory to repo root → Update to reflect root-level paths
- Starting new feature in different part of codebase → Update working directory

**This is NOT optional** - stale path information causes immediate command failures and session friction.

---

### Pre-Update Verification (IMPORTANT)

**Before updating CURRENT-SESSION.md, verify actual state:**

1. **Git status:** `git status` (clean vs uncommitted changes)
2. **Recent commits:** `git log --oneline -10` (capture committed work)
3. **Task completion:** Read task list file for marked checkboxes
4. **File references:** Verify "uncommitted files" are actually uncommitted
5. **Stale references:** Clear old file lists from previous sessions

### Stable vs. Dynamic Sections in CURRENT-SESSION.md

**Stable (rarely change)**:

- Session Startup Protocol **structure** (the checklist itself)
- Runtime environment expectations (container/service counts if applicable)
- Reference version checks (DEVELOPMENT-RULES, QUICK-REFERENCE)

**Protected (special handling - marked with warnings)**:

- Sections marked "DO NOT REMOVE UNTIL..." or similar warnings
- Transition period notes explaining temporary non-conformance
- Example: Transition period note in CURRENT-SESSION (technical/service-layer-modernization branch)
- **Never remove during routine handoffs** - only when condition specified in warning is met

**Dynamic (update when context changes - see CRITICAL warning above)**:

- **"Session Startup Protocol" working directory paths** - update EVERY TIME you switch between:
    - Subdirectory work (e.g., src/, lib/, apps/)
    - Repo root work
    - Different working contexts
- Step 1: Expected pwd output
- Step 3: Tool paths (adjust based on working directory)
- Step 4: Path context table (all relative paths)
- Step 5: Acknowledgment statement

**Temporal (update every handoff)**:

- "Session Information" section and below (work status, tasks, commits, etc.)

### Comprehensive Handoff Format

Update `.arc/active/CURRENT-SESSION.md` before ending session:

1. **First**: Check for protected sections (marked "DO NOT REMOVE UNTIL...") and preserve them
2. **Second**: Check if working directory context changed (see CRITICAL warning above) and update Session Startup
   Protocol paths if needed
3. **Then**: Update "Session Information" section and below with work progress:

```markdown
## Session Information

**Branch**: [current branch name, e.g., feature/user-authentication]
**Task List**: [path to task list, e.g., .arc/active/feature/tasks-user-authentication.md]
  [OR: [none associated] for planning/boundary work between task lists]
**Following Task List**: Yes
  [OR: No - [brief context, e.g., "debugging TypeError in UserProfile (will return to Task 4.5)"]]
**Current Task**: Task 3.3 (line 247) - Write unit tests
  [REQUIRED when following task list - enables direct jump to task during session init]
  [Omit only if no task list or transitioning between task lists]
**Last Completed**: Task 3.2 - Add validation logic
  [OR for off-task-list: brief description, e.g., "Fixed TypeError in UserProfile component"]
  [OR if work complete: "Backend Type Safety (Tasks 1-14, archived)"]
**Next Action**: Start Task 3.3 - Write unit tests for validation logic
  [OR for off-task-list/preparatory: specific action description]
  [Can be preparatory work (strategy doc review, planning) even when Current Task shows task number]

_Note: Current Task shows WHICH task you're on (stable). Next Action shows WHAT to do next (can be preparatory work before starting task, or specific subtask if already in progress)._

---

## Session Context & Status

### Completed This Session

**CRITICAL: When documenting UNCOMMITTED work, use commit-level granularity.**

Next session needs enough detail to recreate proper atomic commits from `git diff`:
- Map accomplishments to logical commits (what changed, which files/components)
- Include task numbers/references for `Context:` footer
- Note any incidental work separate from task list work
- Provide specificity: component names, file paths, what was changed

**Good examples (uncommitted work):**
- ✅ Task 3.2.1: Added email validation to User model (models.py, validators.py) - regex pattern for RFC 5322
- ✅ Task 3.2.2: Updated UserProfile component email display (UserProfile.tsx:45-67) - added null safety check
- ✅ Incidental: Fixed button contrast in ThemeDebug (ThemeDebugSection.tsx) - changed primary-foreground → on-primary

**Bad examples (too vague for commit reconstruction):**
- ❌ "Worked on user authentication" (no file mapping, no commit grouping)
- ❌ "Updated several components" (which? for what commits?)
- ❌ "Fixed bugs" (what bugs? which files? separate commits?)

**For committed work:** Simple list with commit hashes is sufficient (atomic-commit workflow already documented details).

### Remaining Work Before Returning to Task List

_(Only for off-task-list work, only if path is known. Otherwise state "Path unclear - will return to Task X.Y when resolved.")_

1. [Step 1]
2. [Step 2]
3. Return to Task X.Y (line ~XXX in tasks-file.md)

### Blockers

[none]
[OR: Describe blockers, pending decisions, waiting on user clarification]

### Additional Context for Next Session

[Supplemental information not in task list: debugging insights, decisions made, things tried/ruled out, constraints discovered]

[OR: [none] if task list has all needed context]
```

**What to include:**

- **Current Task** - REQUIRED when following task list
    - Format: "Task X.Y (line NNN) - Brief title"
    - Line number from Read tool output (enables direct jump during session init)
    - Remains stable even when Next Action is preparatory work
    - Only update when moving to a different task
    - Omit only if no task list or transitioning between task lists
- **Next Action** - ALWAYS document, even if it's "proceed to next task in task list"
    - Can be preparatory work (strategy review, planning) even when Current Task shows task number
    - On-task-list: Task number + specific subtask description (Current Task has line number)
    - Off-task-list: Specific action description
    - Examples: "Review strategy docs before starting Task 5.5", "Continue Task 3.3 subtask 2"
- **Remaining Work** - Only for off-task-list work when path back is known
    - List ALL steps if known, not just immediate next
    - Critical: Captures full path back to task list (INCLUDING task number + line number - essential)
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

**Example 1: Clean on-task-list handoff**

```markdown
## Session Information

**Branch**: feature/user-authentication
**Task List**: .arc/active/feature/tasks-user-authentication.md
**Following Task List**: Yes
**Current Task**: Task 3.3 (line 247) - Write unit tests
**Last Completed**: Task 3.2 - Add validation logic
**Next Action**: Start Task 3.3 - Write unit tests for validation logic

---

## Session Context & Status

### Completed This Session

- ✅ Task 3.2: Added email validation logic with regex pattern
- ✅ Quality gates: TypeScript passed, linting passed

### Blockers

[none]

### Additional Context for Next Session

[none]
```

**Example 2: Off-task-list with known path back**

```markdown
## Session Information

**Branch**: feature/user-authentication
**Task List**: .arc/active/feature/tasks-user-authentication.md
**Following Task List**: No - debugging TypeError in UserProfile (will return to Task 3.3)
**Current Task**: Task 3.3 (line 247) - Write unit tests
**Last Completed**: Task 3.2 - Add validation logic
**Next Action**: Fix TypeError in UserProfile component (src/pages/user/UserProfile.tsx:45)

---

## Session Context & Status

### Completed This Session

- ✅ Task 3.2: Added validation logic
- ⚠️ Discovered TypeError during integration testing

### Remaining Work Before Returning to Task List

1. Fix TypeError in UserProfile (null email edge case)
2. Add integration test for OAuth users with null email
3. Run full test suite to verify no regressions
4. Return to Task 3.3 - Write unit tests (line 247 in tasks-user-authentication.md)

### Blockers

[none]

### Additional Context for Next Session

- TypeError happens when user.email is null (valid for OAuth users)
- Tried null check at line 45, but cascades to profile display logic (line 89)
- User wants to keep nullable email for OAuth flow
- Best fix: handle at component mount, show "No email" placeholder
```

**Example 3: Preparatory work before starting task**

```markdown
## Session Information

**Branch**: technical/service-layer-modernization
**Task List**: .arc/active/incidental/tasks-theme-system-modernization.md
**Following Task List**: Yes
**Current Task**: Task 5.5 (line 1903) - Enhance Section 5: Surfaces & Containers
**Last Completed**: Tasks 5.3-5.4 (Navigation Patterns, Feedback & Status sections)
**Next Action**: Review strategy docs for updates before Task 5.5 - check if link underline
standardization and alert text color patterns need documentation

---

## Session Context & Status

### Completed This Session

- ✅ Task 5.3: Navigation Patterns Section (committed 7c96a1a)
- ✅ Task 5.4: Feedback & Status Section (committed 7c96a1a)
- ✅ Standardized link underline: 2px → 1px browser default
- ✅ Standardized alert text colors: Title uses semantic, description uses foreground

### Blockers

[none]

### Additional Context for Next Session

**Standardizations requiring strategy doc review:**
1. Link underlines: Changed to browser default 1px (removed 2px thickness, kept 2px offset)
2. Alert text colors: Title uses semantic color, description uses foreground (not on-* for 10% opacity)
```

**Example 4: Off-task-list with unclear path**

```markdown
## Session Information

**Branch**: feature/user-authentication
**Task List**: .arc/active/feature/tasks-user-authentication.md
**Following Task List**: No - debugging intermittent theme flash (will return to Task 3.3)
**Current Task**: Task 3.3 (line 247) - Write unit tests
**Last Completed**: Task 3.2 - Add validation logic
**Next Action**: Continue debugging intermittent theme flash on page load

---

## Session Context & Status

### Completed This Session

- ✅ Task 3.2: Added validation logic
- ⚠️ Investigating theme flash issue (intermittent, ~20% occurrence rate)

### Remaining Work Before Returning to Task List

Path unclear - exploratory debugging. Will return to Task 3.3 (line 247) when resolved.

### Blockers

[none]

### Additional Context for Next Session

- Flash occurs ~20% of time on fresh browser load
- Ruled out: SSR mismatch (client-only SPA), localStorage timing, CSS-in-JS hydration
- Suspect: Race condition between theme provider init and first render
- Next: Add useLayoutEffect to force synchronous theme application
```

### Task List Completion & Transition Format

**When work is complete and/or task list has been archived**, use this expanded format:

```markdown
## Session Information

**Last Completed**: [Task list name] (Tasks X-Y, archived)
**Next Action**: Begin [new-task-list.md] starting with Task 1

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

**After updating CURRENT-SESSION.md:**

1. **Run markdown linting with auto-fix**:

   ```bash
   npx markdownlint-cli2 --fix --no-globs ".arc/active/CURRENT-SESSION.md"
   ```

2. **Verify the file is readable** - CURRENT-SESSION.md is gitignored but should stay clean

---

**Remember**: This system maintains consistency across AI sessions while preserving human control.
CURRENT-SESSION.md is a living document that gets cleared per session to avoid parallel tracking systems.
