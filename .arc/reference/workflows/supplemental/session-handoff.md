# AI Session Handoff

This document provides protocols for AI assistants to handle context management, session handoffs, and workflow state recovery.

## Session Initialization Protocol

### Starting Fresh or Resuming

1. **Acknowledge rules**: "Ready. Using DEVELOPMENT-RULES v{{SYSTEM_VERSION}}"
2. **Read essential context**: DEVELOPMENT-RULES.md, AI-SHARED.md, current PRD and task list docs
3. **Check session state**: Read _docs/CURRENT-SESSION.md if resuming
4. **Verify git state**: Confirm branch and working directory status
5. **Ask for direction**: "What should I work on?"

## Session Handoff Protocol

### Comprehensive Handoff Format

Update **_docs/CURRENT-SESSION.md** before ending session using the full template structure:

```markdown
## Session Information
**Branch**: [current branch name, e.g., {{FEATURE_BRANCH_PREFIX}}/{{FEATURE_NAME}}]
**Feature Documents**:
  - PRD: [path to PRD, e.g., _docs/prds/prd-{{FEATURE_NAME}}.md]
  - Tasks: [path to task list, e.g., _docs/tasks/tasks-{{FEATURE_NAME}}.md]
  - Notes: [path to notes file if applicable, e.g., _docs/notes/notes-{{FEATURE_NAME}}.md]
**Work Type**: [structured | incidental: brief description]
**Last Completed**: [specific task reference, e.g., "Task 3.2: Add validation logic"]
**Next Action**: [what should happen next, e.g., "Task 3.3: Write unit tests"]

## Session Context & Status
**Blockers**: [none | describe any blockers or pending decisions]
**Key Decisions** *(only if relevant to incomplete work)*: [decisions affecting ongoing tasks]
**Outstanding Questions**: [anything awaiting user clarification]
**Notes for Next Session**: [context that would be lost otherwise]
```

### Starting New Session from Handoff

1. User says: "Resume from CURRENT-SESSION.md"
2. AI reads the document and confirms understanding
3. AI verifies git state matches documented state
4. AI asks: "Confirmed. Continue with [next action]?"
5. Only proceed after explicit user approval

## Context Recovery

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
