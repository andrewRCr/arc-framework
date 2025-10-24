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

- Switching from backend subdirectory to frontend subdirectory → Update to show new context
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

**Dynamic (update when context changes - see CRITICAL warning above)**:

- **"Session Startup Protocol" working directory paths** - update EVERY TIME you switch between:
    - Subdirectory work (e.g., backend/, frontend/)
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

1. **First**: Check if working directory context changed (see CRITICAL warning above) and update Session Startup
   Protocol paths if needed
2. **Then**: Update "Session Information" section and below with work progress:

```markdown
## Session Information

**Branch**: [current branch name, e.g., {{FEATURE_BRANCH_PREFIX}}/{{FEATURE_NAME}}]
**Feature Documents**:

- PRD: [path to PRD, e.g., .arc/active/feature/prd-{{FEATURE_NAME}}.md]
- Tasks: [path to task list, e.g., .arc/active/feature/tasks-{{FEATURE_NAME}}.md]
- Notes: [path to notes file if applicable, e.g., .arc/active/feature/notes-{{FEATURE_NAME}}.md]
  **Work Type**: [structured | incidental: brief description]
  **Last Completed**: [specific task reference, e.g., "Task 3.2: Add validation logic"]
  [OR if work complete: "Backend Type Safety (Tasks 1-14, archived)"]
  **Next Action**: [what should happen next, e.g., "Task 3.3: Write unit tests"]
  [OR if transitioning: "Begin tasks-next-work-work.md Task 1"]

## Session Context & Status

**Blockers**: [none | describe any blockers or pending decisions]
**Key Decisions** _(only if relevant to incomplete work)_: [decisions affecting ongoing tasks]
**Outstanding Questions**: [anything awaiting user clarification]
**Notes for Next Session**: [context that would be lost otherwise]
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
   npx markdownlint-cli2 --fix ".arc/active/CURRENT-SESSION.md"
   ```

2. **Verify the file is readable** - CURRENT-SESSION.md is gitignored but should stay clean

### Starting New Session from Handoff

1. User says: "Resume from CURRENT-SESSION.md"
2. AI reads the document and confirms understanding
3. AI verifies git state matches documented state
4. AI asks: "Confirmed. Continue with [next action]?"
5. Only proceed after explicit user approval

## Context Recovery

### Detecting Stale Session State

**Warning signs CURRENT-SESSION.md is out of date:**

- Documents uncommitted files, but `git status` shows clean working tree
- References "Next Action: Task X" but that task is already marked `[x]` complete
- Describes work as "in progress" but commits show it's complete
- Contains mixed state (some work complete, some pending, unclear which is current)
- File references from previous work sessions still listed
- Git commit hashes don't match recent `git log` output

**When stale state is detected:**

1. **Stop immediately** - don't trust the documented state
2. **Gather ground truth**:
   - Run `git status` for working tree state
   - Run `git log --oneline -10` for recent commits
   - Read actual task list file for completion checkboxes
3. **Reconstruct accurate state** from git history and task files
4. **Update CURRENT-SESSION.md** to match reality using verification protocol above
5. **Run mdlint auto-fix**: `npx markdownlint-cli2 --fix ".arc/active/CURRENT-SESSION.md"`

### If Context Seems Lost

1. **Stop immediately** - don't continue current action
2. **Acknowledge**: "I may have lost context"
3. **Re-read**: DEVELOPMENT-RULES.md and current task list
4. **Ask user**: Confirm current state and expectations
5. **Resume only after** explicit user approval

### Signs You Need Recovery

- Forgetting incremental quality checks
- Bundling multiple sub-tasks together
- Initiating commits without approval
- Skipping task documentation updates

## User Instructions

### How to Use for Session Handoffs

**Approaching context limits:**

1. Ask AI to update CURRENT-SESSION.md with current state
2. Review and save the updated file
3. Start new conversation with: "Resume from CURRENT-SESSION.md"

**Between work sessions:**

1. Clear CURRENT-SESSION.md or let AI fill fresh template
2. For high-level tracking, check PROJECT-STATUS.md
3. For objective state, rely on git status and branch

**Emergency compact handoff:**
If tokens are critically low, request: "Create emergency handoff"
AI will generate minimal state summary using single-line format:

```
Branch: [name] | PRD: [prd-file] | Tasks: [task-file] | Work: [structured/incidental] | Last: [task] | Next: [task] | Blockers: [none/description]
```

---

**Remember**: This system maintains consistency across AI sessions while preserving human control.
CURRENT-SESSION.md is a living document that gets cleared per session to avoid parallel tracking systems.
