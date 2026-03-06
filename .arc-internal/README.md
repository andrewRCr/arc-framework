# .arc-internal - ARC Internal Working Directory

This directory contains the actual working documentation for this project's development, organized
following the ARC (Agentic, Recursive, Coordination) framework methodology. Unlike `.arc/` which contains
templates and examples, this directory houses the live project documentation.

## Directory Structure

```
.arc-internal/
├── active/           # Current session work - live PRDs, tasks, notes, and session context
│   ├── feature/      # Active feature development work and research
│   ├── incidental/   # Active maintenance and small task work
│   ├── ATOMIC-TASKS.md  # Small one-off tasks (GTD "Next Actions")
│   ├── WORK-STATUS.md   # Project state: current task, blockers, next action
│   └── SESSION-NOTES.md       # Personal session context (gitignored)
├── backlog/          # Future work pipeline
│   ├── ROADMAP.md    # Sequencing strategy for framework development
│   ├── feature/      # Feature backlog and plans
│   └── technical/    # Technical backlog and plans
├── reference/        # Stable, long-term project documentation
│   ├── constitution/ # Live foundational documents (META-PRD, rules, architecture)
│   ├── strategies/   # Evolved implementation approaches and stable patterns
│   ├── adr/          # Architecture decision records
│   ├── research/     # Technical research documents
│   └── archive/      # Completed feature documentation and decisions
└── system/           # Agent-facing operational files
    ├── agent/        # Agent configuration and context
    └── workflows/    # Development process guidance
```

## Usage Patterns

### Active Development

- **Primary workspace**: All current development work happens in `active/`
- **Current session**: `WORK-STATUS.md` tracks project state; `SESSION-NOTES.md` captures session context
- **Feature work**: `active/feature/` contains PRDs, tasks, and notes for current feature development
- **Incidental work**: `active/incidental/` houses maintenance tasks and smaller improvements
- **Atomic tasks**: `ATOMIC-TASKS.md` for small one-off tasks that don't need full task lists
- **Live context**: Files here represent actual work in progress, not templates

### Planning & Pipeline

- **Roadmap**: `backlog/ROADMAP.md` documents sequencing strategy for framework development
- **Feature backlog**: `backlog/feature/BACKLOG-FEATURE.md` organizes future feature ideas
- **Technical backlog**: `backlog/technical/BACKLOG-TECHNICAL.md` organizes technical improvements

### Reference & Knowledge Base

- **Project constitution**: `reference/constitution/` houses the live META-PRD, DEV-RULES.PROJECT
  (pending migration to DEV-RULES.PROJECT), PROJECT-STATUS, and TECHNICAL-OVERVIEW
- **AI configuration**: `system/agent/` contains agent-specific context and instructions
- **Process workflows**: `system/workflows/` provides development process guidance
- **Historical context**: `reference/archive/` preserves completed feature documentation
- **Evolved patterns**: `reference/strategies/` captures learned approaches and stable patterns

## Key Differences from .arc/

- **Live vs Template**: This directory contains actual project work, not examples
- **Version controlled**: Most files are tracked (except SESSION-NOTES.md and notes/)
- **Project-specific**: Content is tailored to this specific project's needs and context
- **Working memory**: Serves as the project's persistent knowledge base across sessions

## Framework Integration

This internal structure implements the ARC framework's core principles for actual project work:

- **Agentic**: Provides clear context boundaries for AI agent collaboration with live project state
- **Recursive**: Knowledge flows from active work → backlog pipeline → reference knowledge base
- **Coordination**: Maintains systematic handoffs and shared understanding across development cycles

The three-tier organization (active, backlog, reference) ensures work progresses naturally from
immediate tasks to long-term project knowledge, with clear visibility into current state, planned work,
and accumulated wisdom.

## Working with this Structure

1. **Start sessions** by reviewing `active/WORK-STATUS.md` and current work in `active/`
2. **Track progress** on features through their PRDs and task lists in `active/feature/`
3. **Plan future work** by organizing in `backlog/` (ROADMAP.md, backlogs)
4. **Reference project knowledge** from `reference/constitution/` and other stable documentation
5. **Follow development processes** using workflows in `system/workflows/`
6. **Archive completed work** by moving finished features to `reference/archive/`

This structure maintains project continuity across sessions while providing clear organization for both
human developers and AI agents collaborating on the codebase.
