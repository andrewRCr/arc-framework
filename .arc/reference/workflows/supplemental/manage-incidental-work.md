# Manage Incidental Work Workflow

**Purpose**: Systematic workflow for creating, executing, and archiving incidental task lists discovered during feature development.

**Related**: [3-process-task-loop.md](../3-process-task-loop.md), [DEVELOPMENT-RULES.md](../../constitution/DEVELOPMENT-RULES.md)

---

## Overview

**Incidental work** is quality improvements, refactoring, or tech debt discovered during feature
development that should be fixed immediately rather than deferred. This workflow provides a complete
lifecycle management system.

**Key Principle**: Incidental work is **reactive** (discovered during implementation) vs **proactive**
(planned feature work with PRDs).

---

## Decision Tree: When to Create Incidental Task Lists

### Create Incidental Task List When

- ✅ **Multiple subtasks needed** (>1 subtask)
- ✅ **Non-trivial effort** (>30 minutes estimated)
- ✅ **Cross-cutting concern** (affects multiple domains/files)
- ✅ **Quality improvement** discovered during feature work
- ✅ **Worth documenting** for future reference and handoffs
- ✅ **Blocks or significantly impacts current feature work**

### Do NOT Create Incidental Task List When

- ❌ **Simple fixes** (<30 min, 1 subtask) - just fix inline
- ❌ **Typos, formatting, trivial refactors** - fix without ceremony
- ❌ **Work already in main task list** - add subtasks there instead
- ❌ **Exploratory work** - use notes files instead
- ❌ **Can be deferred** - create issue/PRD for future sprint

### Examples

**Create incidental task list:**

- Type safety tooling incompatibility discovered (affects entire backend)
- Security vulnerability in authentication flow (critical, multi-step fix)
- Broken test infrastructure affecting reliability (cross-cutting, urgent)

**Fix inline (no task list):**

- Missing type annotation on single function
- Outdated comment in one file
- Linting violation in modified file

---

## Phase 1: Creation

### Step 1: Verify Need for Incidental Work

Before creating incidental task list:

1. **Confirm urgency**: Why fix now vs defer to future PRD?
2. **Estimate effort**: Is this >30 minutes with multiple subtasks?
3. **Assess impact**: Does this block or significantly impact current work?
4. **Check scope**: Is this truly incidental or should it be a planned feature?

**If uncertain**: Ask user for guidance on whether to address now or defer.

### Step 2: Create Incidental Task File

**File location**: `.arc/active/incidental/tasks-incidental-{brief-slug}.md`

**Naming convention**: `tasks-incidental-{brief-descriptive-slug}.md`

- Example: `tasks-incidental-backend-type-safety.md`
- Example: `tasks-incidental-security-updates.md`
- Example: `tasks-incidental-oauth-headless-migration.md`

**Create file**:

```bash
touch .arc/active/incidental/tasks-incidental-{brief-slug}.md
```

**Use template** (see "Template" section below)

### Step 3: Track Incidental Task List Creation

**Immediately track for context visibility**:

```bash
git add .arc/active/incidental/tasks-incidental-{brief-slug}.md
git commit -m "docs({current-branch}): Create {brief-slug} incidental task list

Triggered by {discovery context}.
Pausing {current work} to address {critical issue}.

Related to: .arc/active/feature/tasks-{main-feature}.md"
```

**Rationale for tracking creation**:

- ✅ Git log shows when/why work was paused
- ✅ Session handoffs have full context
- ✅ Audit trail of priority shifts
- ✅ Team visibility into active work

### Step 4: Update CURRENT-SESSION.md

**Update session tracking** (after committing task list):

```markdown
**Last Completed**: Task X.Y from tasks-{main-feature}.md (paused for incidental work)
**Next Action**: Incidental work - {brief description}

### Paused/Deferred Work

**Paused Task Lists:**
- `.arc/active/feature/tasks-{main-feature}.md` - Task X.Y complete, paused at Task X.Y+1

**Resume Order After Incidental Work:**
1. Complete incidental work ({brief description})
2. Resume tasks-{main-feature}.md Task X.Y+1
```

**Note**: CURRENT-SESSION.md is gitignored (untracked) - this update is for local context only.

### Step 5: Create Notes File (Optional)

**For complex incidental work**, create companion notes file:

**File location**: `.arc/active/incidental/notes-incidental-{same-slug}.md`

**Notes are gitignored** - use for:

- Research findings
- Error diagnostics
- Exploratory work
- Scratch calculations

---

## Phase 2: Execution

### Follow Standard Task Loop Workflow

Incidental work follows **same rules** as feature work:

1. **One sub-task at a time** - never bundle multiple deliverables
2. **Mandatory stop** after each sub-task completion
3. **Wait for explicit user approval** before starting next sub-task
4. **Run incremental quality checks** after each sub-task
5. **Update task list immediately** - mark `[x]` after completion
6. **Update "Relevant Files" section** when files created/modified

See [3-process-task-loop.md](../3-process-task-loop.md) for detailed workflow.

### Commit Standards for Incidental Work

**Commit format**:

```bash
git commit -m "{type}({branch}): {description}" \
           -m "{details}" \
           -m "Complete incidental task {X.Y}" \
           -m "Related to: .arc/active/incidental/tasks-incidental-{slug}.md"
```

**Types for incidental work**:

- `refactor({branch})`: Code restructuring, tech debt reduction
- `fix({branch})`: Bug fixes, security patches
- `config({branch})`: Tooling, CI/CD, configuration updates
- `test({branch})`: Test infrastructure improvements
- `feat({branch})`: New capabilities (rare for incidental work)

**Examples**:

```bash
# Type safety tooling fix
git commit -m "config(api-layer-p2): Replace django-stubs with django-types" \
           -m "- Install django-types 0.22.0 (Pyright-compatible)" \
           -m "- Remove django-stubs (requires MyPy plugin)" \
           -m "- Update pyrightconfig.json for django-types" \
           -m "Complete incidental task 2.2" \
           -m "Related to: .arc/active/incidental/tasks-incidental-backend-type-safety.md"

# Security update
git commit -m "fix(api-layer-p2): Add rate limiting to authentication endpoints" \
           -m "- Configure throttle classes on login/register" \
           -m "- Add tests for rate limit enforcement" \
           -m "Complete incidental task 3.1" \
           -m "Related to: .arc/active/incidental/tasks-incidental-security-updates.md"
```

### Update Task List During Execution

**Commit task list updates** alongside code changes:

```bash
# After completing subtask and code changes
git add .arc/active/incidental/tasks-incidental-{slug}.md
git add {modified-code-files}
git commit -m "{type}({branch}): {description}" \
           -m "- Mark task {X.Y} complete" \
           -m "- Update relevant files section"
```

**Why commit task list with code**:

- ✅ Git history shows task progress with implementation
- ✅ Rollback captures both code and documentation state
- ✅ Session handoffs show exact progress point

---

## Phase 3: Completion

### Step 1: Verify Full Completion

Before archiving, ensure:

- ✅ All subtasks marked `[x]` in task list
- ✅ All quality gates passing (tests, linting, type checking, markdown)
- ✅ All related code committed and merged to current branch
- ✅ Follow-up work documented (if any) in new task lists

### Step 2: Update Completion Notes in Task List

**Add to bottom of task list** (before archiving):

```markdown
## Completion Notes

**Completion Date**: {YYYY-MM-DD}

**Summary**:
- {1-2 sentence summary of what was accomplished}
- {Key outcomes or improvements}
- {Metrics if applicable: error counts, test coverage, performance}

**Tooling/Architecture Changes** (if applicable):
- {Major changes to build tools, dependencies, CI/CD}
- {New patterns or standards introduced}

**Files Changed**:
- {Count of files modified/created/deleted}
- {Key files and their purpose}

**Follow-Up Work Created** (if any):
- `.arc/active/incidental/tasks-incidental-{follow-up-slug}.md` ({brief description})
- {Estimated effort for follow-up}

**References**:
- {Links to key commits}
- {Links to external research or documentation}
- {Links to related PRDs or task lists}

**Next Steps**:
1. {What to do after this incidental work completes}
2. {Which paused work to resume}
```

### Step 3: Update Documentation (Before Archiving)

**IMPORTANT**: Update all tracked documentation **BEFORE** suggesting commit.

**Check and update if needed**:

1. **PROJECT-STATUS.md** (if significant capability added):
   - Update "Technical Capabilities" section
   - Note completed improvements
   - Update quality metrics if applicable

2. **Related strategy documents** (if patterns changed):
   - Update `strategy-*.md` files for new patterns
   - Document new best practices
   - Add examples

3. **Constitution documents** (if rules changed):
   - Update `DEVELOPMENT-RULES.md`
   - Update `TECHNICAL-ARCHITECTURE.md`
   - Update quality gate standards

4. **Related task lists** (if dependencies resolved):
   - Update blocked tasks now unblocked
   - Update references to old patterns/tools
   - Cross-reference completion

### Step 4: Move to Archive

**Archive path**: `.arc/reference/archive/tasks/incidental/tasks-incidental-{slug}.md`

**Use git mv** (file is tracked):

```bash
git mv .arc/active/incidental/tasks-incidental-{slug}.md \
       .arc/reference/archive/tasks/incidental/tasks-incidental-{slug}.md
```

### Step 5: Suggest Atomic Commit of All Changes

**IMPORTANT**: AI suggests commit, **NEVER initiates** without user approval.

**Commit includes**:

- Archived task list (moved to archive)
- Updated PROJECT-STATUS.md (if modified)
- Updated strategy documents (if modified)
- Updated constitution documents (if modified)
- Updated related task lists (if modified)

**Commit format**:

```bash
git add .arc/reference/archive/tasks/incidental/tasks-incidental-{slug}.md
git add .arc/reference/constitution/PROJECT-STATUS.md  # if modified
git add .arc/reference/strategies/*.md  # if modified
git add .arc/active/feature/tasks-*.md  # if modified

git commit -m "docs({branch}): Archive incidental work - {brief description}

Completed all subtasks for {incidental work description}.
Resuming {main work description}.

Summary: {1-2 sentence outcome}

Changes:
- Archive tasks-incidental-{slug}.md with completion notes
- Update PROJECT-STATUS.md with {improvements}
- Update {strategy/constitution docs} to reflect {changes}

Related to: .arc/active/feature/tasks-{main-feature}.md"
```

**AI workflow**:

1. Show git status of all changes
2. Show proposed commit message
3. **Wait for user approval** before executing commit
4. Execute commit only after explicit approval

### Step 6: Update CURRENT-SESSION.md (After Commit)

**IMPORTANT**: Update CURRENT-SESSION.md **AFTER** commit, not before.

**Why this order**:

- ✅ All tracked documentation changes included in commit
- ✅ CURRENT-SESSION.md doesn't contain stale commit references
- ✅ Session state reflects post-commit reality

**Update session tracking**:

```markdown
**Last Completed**: Incidental work - {brief description} (archived)
**Next Action**: Resume Task X.Y from tasks-{main-feature}.md

### Paused/Deferred Work

**Paused Task Lists:**
- `.arc/active/feature/tasks-{main-feature}.md` - Resume at Task X.Y
```

### Step 7: Resume Main Work

Return to paused feature work and continue normal workflow.

---

## Incidental Task List Template

```markdown
# Incidental Work: {Title}

**Created**: {YYYY-MM-DD}
**Triggered By**: Task {X.Y} in tasks-{feature-name}.md
**Status**: In Progress / Complete
**Estimated Effort**: {X minutes / Y hours}

## Context

**Why Now**: {Why fix immediately instead of deferring to future PRD}

**Discovery**: {How this issue was discovered during main task work}

**Impact**: {What improves if we fix this - quality, consistency, tech debt reduction}

## Scope

**Will Do**:
- {Specific changes that will be made}
- {Expected outcomes}
- {Target metrics or completion criteria}

**Won't Do** (deferred to {future-work-reference}):
- {Out of scope items}
- {Future improvements}
- {Why these are deferred}

## Tasks

- [ ] 1. {Task 1 with clear deliverable}
  - [ ] 1.1 {Sub-subtask if needed}
  - [ ] 1.2 {Sub-subtask if needed}
- [ ] 2. {Task 2 with quality gate}
  - [ ] 2.1 {Sub-subtask}
- [ ] 3. {Task 3 with verification step}
  - [ ] 3.1 {Sub-subtask}

## Relevant Files

**{Category}:**
- `{file-path}`: {What changed and why}
- `{file-path}`: {What changed and why}

**{Category}:**
- `{file-path}`: {What changed and why}

## Implementation Notes

### {Decision/Pattern Name}

**{Context}:**
- {Key technical decisions made}
- {Rationale for approach chosen}
- {Alternatives considered and rejected}

## Completion Notes

{Added at completion - see Phase 3, Step 2 above}
```

---

## Best Practices

### Scope Management

- **Start small**: Resist scope creep - defer non-critical improvements
- **Document deferrals**: Create follow-up task lists for discovered work outside scope
- **Time-box**: If effort exceeds 2x estimate, stop and reassess with user

### Communication

- **Keep user informed**: Report progress after each subtask
- **Flag blockers**: Immediately report unexpected complexity or blockers
- **Suggest pivots**: If better approach discovered, propose and get approval

### Quality

- **No shortcuts**: Incidental work follows same quality standards as feature work
- **Test thoroughly**: Incidental fixes must not break existing functionality
- **Document decisions**: Capture "why" not just "what" in implementation notes

### Nested Incidental Work

**If incidental work spawns MORE incidental work**:

1. **Assess criticality**: Is new issue blocking current incidental work?
2. **Get user approval**: Don't auto-create nested incidental work
3. **Document relationship**: Link nested task list to parent incidental work
4. **Track in CURRENT-SESSION**: Show full dependency chain

**Example**:

- Main feature: API Layer Modernization
  - Incidental: Security Updates (discovered during feature work)
    - Nested Incidental: Type Safety Tooling Fix (discovered during security updates)

---

## Directory Structure

### Active Work

```
.arc/active/
├── CURRENT-SESSION.md           # Session tracking (gitignored)
├── feature/
│   ├── prd-{feature}.md         # Feature PRD
│   ├── tasks-{feature}.md       # Feature task list
│   └── notes-{feature}.md       # Feature notes (gitignored)
└── incidental/
    ├── tasks-incidental-{slug}.md     # Incidental task list
    └── notes-incidental-{slug}.md     # Incidental notes (gitignored)
```

### Archived Work

```
.arc/reference/archive/tasks/
├── feature/
│   └── tasks-{feature}.md       # Archived feature task lists
└── incidental/
    └── tasks-incidental-{slug}.md     # Archived incidental task lists
```

**Key Points**:

- ✅ Only `CURRENT-SESSION.md` remains in `.arc/active/` root
- ✅ Task lists tracked by git (context visibility)
- ✅ Notes files gitignored (scratch paper)
- ✅ Archive preserves same structure as active

---

## Common Pitfalls

### ❌ Creating incidental work for planned features

**Problem**: Using incidental workflow for work that should be a PRD.

**Solution**: If work is strategic (new capability, major refactor), create PRD instead.

### ❌ Forgetting to update paused work references

**Problem**: Resuming wrong task after incidental work completes.

**Solution**: Always update CURRENT-SESSION.md and paused task list cross-references.

### ❌ Archiving before all documentation updated

**Problem**: PROJECT-STATUS.md out of date, strategy docs stale.

**Solution**: Update all tracked docs **before** archive commit, CURRENT-SESSION.md **after**.

### ❌ Not documenting completion notes

**Problem**: Archived task list lacks context on what was achieved.

**Solution**: Always add comprehensive completion notes before archiving.

---

## Related Workflows

- [3-process-task-loop.md](3-process-task-loop.md) - Main task execution workflow
- [atomic-commit.md](atomic-commit.md) - Commit message standards
- [archive-completed-features.md](archive-completed-features.md) - Feature archival process
- [DEVELOPMENT-RULES.md](../constitution/DEVELOPMENT-RULES.md) - Core development standards

---

## Changelog

- **2025-10-09**: Initial creation - extracted from process-task-loop.md
  - Added comprehensive lifecycle: creation → execution → archival
  - Defined commit order: docs update → commit → CURRENT-SESSION update
  - Documented new directory structure with `feature/` and `incidental/` subdirs
