# Archive

This archive contains documentation for completed work, preserving the development history while keeping active
working directories clean and focused.

## Archive Organization

The archive uses **quarterly directories** with **work-categorized subdirectories**:

```
archive/
├── {{QUARTER}}/                    # e.g., 2025-q4
│   ├── feature/
│   │   └── {{NN}}_{{name}}/       # e.g., 08_user-authentication/
│   ├── technical/
│   │   └── {{NN}}_{{name}}/       # e.g., 01_logging-system/
│   └── incidental/
│       └── {{NN}}_{{name}}/       # e.g., 04_security-fixes/
└── completed-atomic-{{QUARTER}}.md # Completed atomic tasks
```

**Categories:**

- **`feature/`** - User-facing planned work (each feature has its own subdirectory)
- **`technical/`** - Infrastructure planned work (each technical work has its own subdirectory)
- **`incidental/`** - Unplanned reactive work (each gets its own subdirectory)

**Sequence numbering:**

- `{{NN}}` is a global sequence number (01-99) across ALL categories in the quarter
- Assigned by completion order (when archived, not when started)
- Gaps between numbers in a category show where other categories' work completed
- Reset to 01 at start of each quarter

### Work Package Structure

Each completed work gets its own subdirectory containing:

- `prd-{name}.md` - Product Requirements Document (planned work only)
- `tasks-{name}.md` - Task implementation documentation
- `notes-{name}.md` - Development notes (optional)
- `completion-{name}.md` - Completion metadata and summary

**Example:**

```
archive/2025-q4/technical/01_logging-system/
├── prd-logging-system.md
├── tasks-logging-system.md
├── notes-logging-system.md
└── completion-logging-system.md
```

### Incidental Work Organization

Incidental work (unplanned reactive fixes/improvements) follows the same structure:

- All incidental work gets a subdirectory with sequence prefix
- Contains at minimum: `tasks-{name}.md` and `completion-{name}.md`
- Notes file optional based on work complexity

## Completed Work

_This section will be populated as work is completed and archived._

---

## Navigation

### Active Documentation

- **Current Work**: [`.arc/active/`](../../active/) (feature/, technical/, incidental/)
- **Backlog**: [`.arc/backlog/`](../../backlog/) (ROADMAP, feature/, technical/)
- **Project Status**: [`constitution/{{PROJECT_STATUS_FILE}}`](../constitution/)
- **Workflows**: [`workflows/`](../workflows/)

### Archive Workflow

- **Integration**: [`integrate-work-unit.md`](../../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md)
- **Archival**: [`archive-work-unit.md`](../../system/workflows/arc/work-unit-lifecycle/archive-work-unit.md)
- **Work Categorization**: Refer to workflows for categorization guidance

## Purpose

This archive serves multiple purposes:

1. **Professional Documentation**: Demonstrates systematic development methodology
2. **Reference Material**: Provides context for similar future features
3. **Development History**: Preserves the evolution from planning to completion
4. **Knowledge Base**: Creates searchable resource of completed work organized by work type
5. **Clean Workspace**: Keeps active directories focused on current/planned work

## Benefits of Work-Categorized Organization

- **All related docs in one place**: PRD, tasks, notes, and completion metadata together
- **Easier navigation**: Find everything about a piece of work in one subdirectory
- **Simpler archival**: Move all files together instead of distributing across multiple directories
- **Better git history**: Related documents move together, preserving relationships
- **Consistent structure**: Active, upcoming, and archive all use same work categorization

## File Naming Conventions

- **PRDs**: `prd-{name}.md`
- **Tasks**: `tasks-{name}.md`
- **Notes**: `notes-{name}.md` (optional)
- **Completion**: `completion-{name}.md`

## Adding New Archives

When work is completed, follow the [Integration Workflow](../../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md)
and [Archive Workflow](../../system/workflows/arc/work-unit-lifecycle/archive-work-unit.md):

1. Verify completion (all tasks marked [x], quality gates passing)
2. **Run clean-work-unit workflow** (Mode 2: Archival Preparation) - MANDATORY
3. Create work unit directory (if multiple docs) and move all files together
4. Create completion metadata with summary and metrics
5. Update PROJECT-STATUS references
6. Commit archive changes with descriptive message
7. Update this README with new entry (optional but recommended)

---

_Archive maintained as part of the ARC (Agentic, Recursive, Coordination) development framework_
