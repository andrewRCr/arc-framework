# Archive

This archive contains documentation for completed work, preserving the development history while keeping active
working directories clean and focused.

## Archive Organization

The archive uses **work-categorized subdirectories** where all documents for a piece of work live together:

- **`feature/`** - User-facing planned work (each feature has its own subdirectory)
- **`technical/`** - Infrastructure planned work (each technical work has its own subdirectory)
- **`incidental/`** - Unplanned reactive work (subdirectories for multi-doc work, root for simple task lists)

### Work Package Structure

Each completed planned work (feature/technical) gets its own subdirectory containing:

- `prd-{name}.md` - Product Requirements Document
- `tasks-{name}.md` - Task implementation documentation
- `notes-{name}.md` - Development notes (optional)
- `completion-{name}.md` - Completion metadata and summary

**Example:**

```
archive/technical/api-modernization/
├── prd-api-modernization.md
├── tasks-api-modernization.md
├── notes-api-modernization.md
└── completion-api-modernization.md
```

### Incidental Work Organization

Incidental work (unplanned reactive fixes/improvements):

- **With multiple docs**: Gets subdirectory (e.g., `incidental/security-fixes/`)
- **Single task list**: Stays in `incidental/` root (e.g., `incidental/tasks-quick-fix.md`)

## Completed Work

_This section will be populated as work is completed and archived._

---

## Navigation

### Active Documentation

- **Current Work**: [`.arc/active/`](../../active/) (feature/, technical/, incidental/)
- **Upcoming Work**: [`.arc/upcoming/`](../../upcoming/) (feature/, technical/)
- **Project Status**: [`constitution/{{PROJECT_STATUS_FILE}}`](../constitution/)
- **Workflows**: [`workflows/`](../workflows/)

### Archive Workflow

- **Archival Process**: [`workflows/supplemental/archive-completed.md`](../workflows/supplemental/archive-completed.md)
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

When work is completed, follow the [Archive Workflow](../workflows/supplemental/archive-completed.md):

1. Verify completion (all tasks marked [x], quality gates passing)
2. **Run maintain-task-notes workflow** (Mode 2: Archival Preparation) - MANDATORY
3. Create work package directory (if multiple docs) and move all files together
4. Create completion metadata with summary and metrics
5. Update PROJECT-STATUS references
6. Commit archive changes with descriptive message
7. Update this README with new entry (optional but recommended)

---

_Archive maintained as part of the ARC (Agentic, Recursive, Coordination) development framework_
