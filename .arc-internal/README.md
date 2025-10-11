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
│   └── CURRENT-SESSION.md  # Live session context (gitignored)
├── upcoming/         # Future work pipeline organized by work type
│   ├── sub-prds/     # Feature specifications ready for development
│   ├── notes/        # Research and decision logs for upcoming features  
│   └── tasks/        # Generated task lists from approved PRDs
└── reference/        # Stable, long-term project documentation
    ├── constitution/ # Live foundational documents (META-PRD, rules, architecture)
    ├── strategies/   # Evolved implementation approaches and stable patterns
    ├── ai-instructions/ # Agent configuration and context
    ├── archive/      # Completed feature documentation and decisions
    └── workflows/    # Development process guidance
```

## Usage Patterns

### Active Development

- **Primary workspace**: All current development work happens in `active/`
- **Current session**: `CURRENT-SESSION.md` tracks immediate context and handoff instructions
- **Feature work**: `active/feature/` contains PRDs, tasks, and notes for current feature development
- **Incidental work**: `active/incidental/` houses maintenance tasks and smaller improvements
- **Live context**: Files here represent actual work in progress, not templates

### Planning & Pipeline  

- **Future features**: `upcoming/sub-prds/` holds approved specifications awaiting development
- **Task queues**: `upcoming/tasks/` contains generated task lists ready for processing
- **Research pipeline**: `upcoming/notes/` captures investigation and decision logs for future work

### Reference & Knowledge Base

- **Project constitution**: `reference/constitution/` houses the live META-PRD, DEVELOPMENT-RULES, PROJECT-STATUS, and TECHNICAL-ARCHITECTURE
- **AI configuration**: `reference/ai-instructions/` contains agent-specific context and instructions
- **Process workflows**: `reference/workflows/` provides development process guidance
- **Historical context**: `reference/archive/` preserves completed feature documentation
- **Evolved patterns**: `reference/strategies/` captures learned approaches and stable patterns

## Key Differences from .arc/

- **Live vs Template**: This directory contains actual project work, not examples
- **Version controlled**: Most files are tracked (except CURRENT-SESSION.md and notes/)
- **Project-specific**: Content is tailored to this specific project's needs and context
- **Working memory**: Serves as the project's persistent knowledge base across sessions

## Framework Integration

This internal structure implements the ARC framework's core principles for actual project work:

- **Agentic**: Provides clear context boundaries for AI agent collaboration with live project state
- **Recursive**: Knowledge flows from active work → upcoming pipeline → reference knowledge base
- **Coordination**: Maintains systematic handoffs and shared understanding across development cycles

The three-tier organization (active, upcoming, reference) ensures work progresses naturally from
immediate tasks to long-term project knowledge, with clear visibility into current state, planned work,
and accumulated wisdom.

## Working with this Structure

1. **Start sessions** by reviewing `active/CURRENT-SESSION.md` and current work in `active/`
2. **Track progress** on features through their PRDs and task lists in `active/feature/`
3. **Plan future work** by organizing upcoming features in `upcoming/`
4. **Reference project knowledge** from `reference/constitution/` and other stable documentation
5. **Follow development processes** using workflows in `reference/workflows/`
6. **Archive completed work** by moving finished features to `reference/archive/`

This structure maintains project continuity across sessions while providing clear organization for both
human developers and AI agents collaborating on the codebase.
