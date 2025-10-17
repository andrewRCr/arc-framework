# Workflow: Archive Completed Work

Move completed feature and incidental documentation to structured archive to keep the active workspace clean
while preserving history and context.

## Preconditions

**MANDATORY: Run [maintain-task-notes.md](maintain-task-notes.md) workflow first** - Ensures docs are
archive-ready (lean task list, organized notes file, TOC, no temporal markers).

**Then verify:**

- All subtasks in the task list are marked [x]; parent tasks are [x]
- PROJECT-STATUS reflects completion (features only)
- All related code is merged and quality gates are passing
- Implementation functions as expected in development environment

## Feature Archiving

For major features with PRDs, full implementation, and significant scope.

### 1) Verify Feature Completion

- Confirm task list status (all subtasks and parent task [x])
- Confirm PROJECT-STATUS includes the feature under "Completed Work"
- Confirm tests/lint/type checks are green
- Confirm `maintain-task-notes.md` workflow was executed

### 2) Move PRD to Archive

```bash
mv .arc/active/feature/prd-{feature-name}.md .arc/reference/archive/prds/
```

### 3) Move Task List to Archive

```bash
mv .arc/active/feature/tasks-{feature-name}.md .arc/reference/archive/tasks/feature/
```

### 4) Move Notes File to Archive (if exists)

```bash
mv .arc/active/feature/notes-{feature-name}.md .arc/reference/archive/notes/feature/
```

### 5) Create Completion Metadata

Create `.arc/reference/archive/completion-metadata/completion-{feature-name}.md`:

```markdown
# Completion: {Feature Name}

**Completed**: YYYY-MM-DD
**Final Commit**: {commit-hash}
**Branch**: {branch-name}

## Summary

{2-3 sentence overview of what was accomplished}

## Key Implementation Details

- {Major technical decision or pattern}
- {Significant challenge overcome}
- {Notable outcome or capability}

## Metrics

- **Tests Added**: X tests
- **Coverage**: X% (if applicable)
- **Commits**: X commits
- **Duration**: X days/weeks

## Related Documentation

- PRD: `.arc/reference/archive/prds/prd-{feature-name}.md`
- Tasks: `.arc/reference/archive/tasks/feature/tasks-{feature-name}.md`
- Notes: `.arc/reference/archive/notes/feature/notes-{feature-name}.md`
- Key Commits: {links to 2-3 most significant commits}

## Next Steps / Future Work

{Any deferred work or follow-up features}
```

### 6) Update PROJECT-STATUS

- Ensure feature is in "Completed Work" section
- Remove from "Work in Progress"
- Add archive reference if appropriate

### 7) Commit Archive Changes

```bash
git add .arc/reference/archive/ .arc/active/feature/ .arc/reference/constitution/PROJECT-STATUS.md

git commit -m "docs(archive): archive {feature-name} documentation

- Move PRD, tasks, and notes to structured archive
- Add completion metadata with metrics and summary
- Update PROJECT-STATUS references
- Maintain clean active workspace"
```

---

## Incidental Archiving

For incidental work (no PRD, focused improvements, tech debt, refactoring).

### 1) Verify Incidental Completion

- Confirm task list status (all subtasks and parent task [x])
- Confirm all related code is merged and quality gates passing
- Confirm `maintain-task-notes.md` workflow was executed

### 2) Move Task List to Archive

```bash
mv .arc/active/incidental/tasks-incidental-{work-name}.md .arc/reference/archive/tasks/incidental/
```

### 3) Move Notes File to Archive

```bash
mv .arc/active/incidental/notes-incidental-{work-name}.md .arc/reference/archive/notes/incidental/
```

### 4) Commit Archive Changes

```bash
git add .arc/reference/archive/ .arc/active/incidental/

git commit -m "docs(archive): archive incidental-{work-name} documentation

- Move tasks and notes to structured archive
- {Brief 1-line summary of what was accomplished}
- Maintain clean active workspace"
```

**Note**: Incidental work does not require:

- PRD archival (no PRD exists)
- Completion metadata (task list completion summary is sufficient)
- PROJECT-STATUS updates (unless work significantly changed project structure)

---

## Archive Structure

```
.arc/reference/archive/
├── README.md                               # Archive overview and navigation
├── prds/                                   # Archived feature PRDs
│   ├── prd-logging-system.md
│   ├── prd-user-authentication.md
│   └── prd-{feature}.md
├── tasks/
│   ├── feature/                            # Archived feature task lists
│   │   ├── tasks-logging-system.md
│   │   ├── tasks-user-authentication.md
│   │   └── tasks-{feature}.md
│   └── incidental/                         # Archived incidental task lists
│       ├── tasks-incidental-type-safety.md
│       ├── tasks-incidental-pytest-migration.md
│       └── tasks-incidental-{work}.md
├── notes/
│   ├── feature/                            # Archived feature notes
│   │   ├── notes-logging-system.md
│   │   ├── notes-user-authentication.md
│   │   └── notes-{feature}.md
│   └── incidental/                         # Archived incidental notes
│       ├── notes-incidental-type-safety.md
│       ├── notes-incidental-pytest-migration.md
│       └── notes-incidental-{work}.md
└── completion-metadata/                    # Feature completion summaries
    ├── completion-logging-system.md
    ├── completion-user-authentication.md
    └── completion-{feature}.md
```

## Quick Decision: Feature vs Incidental?

**Feature** → Archive with PRD + completion metadata:

- Has PRD document
- Significant scope (multiple weeks)
- Listed in PROJECT-STATUS
- Major capability or system change

**Incidental** → Archive without PRD/completion metadata:

- No PRD (reactive work)
- Focused scope (days to 2 weeks)
- Tech debt, refactoring, tooling improvements
- Quality improvements, bug fixes, infrastructure updates

## Archive Organization Principles

- **Preserve development history**: Keep all planning, implementation notes, and outcomes
- **Keep active workspace focused**: Only in-progress work stays in `.arc/active/`
- **Maintain discoverability**: Clear structure + README navigation
- **Professional documentation**: Demonstrates systematic approach to development
- **Future reference**: Easy to find technical decisions and implementation details months later

## Benefits of Systematic Archival

- Demonstrates professional development practices
- Provides valuable reference for similar future work
- Maintains project history while keeping active workspace organized
- Creates searchable knowledge base of completed work
- Shows evolution from planning → implementation → completion
- Makes it easy to onboard new contributors or review past decisions

## Common Pitfalls

❌ **Archiving without doc hygiene**: Task list still has verbose blocks, notes file lacks TOC
   (run [maintain-task-notes.md](maintain-task-notes.md) first)
❌ **Forgetting to update PROJECT-STATUS**: Feature completed but still shows "In Progress"
❌ **Skipping completion metadata**: Lost context on why/how decisions were made
❌ **Inconsistent naming**: Different conventions for different archives
❌ **Committing before linting**: Markdown violations in archived docs

✅ **Run [maintain-task-notes.md](maintain-task-notes.md) first**: Ensures archive-ready documentation
✅ **Consistent naming**: `{type}-{name}.md` format everywhere
✅ **Complete metadata**: Future-you will thank you for the context
✅ **Clean commits**: Lint before committing, atomic archive commits
