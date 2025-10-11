# .arc - ARC Documentation System

This directory contains the complete documentation system for projects using the ARC
(Agentic, Recursive, Coordination) framework methodology.

## Directory Structure

```
.arc/
├── active/           # Current session work - PRDs, tasks, notes, and session context
│   ├── feature/      # Active feature development work
│   └── incidental/   # Active maintenance and small tasks
├── upcoming/         # Future work pipeline organized by work type
│   ├── prds/         # Feature specifications ready for development
│   ├── notes/        # Research and decision logs for upcoming features
│   └── tasks/        # Generated task lists from approved PRDs
└── reference/        # Stable, long-term documentation
    ├── constitution/ # Foundational project documents (META-PRD, rules, architecture)
    ├── workflows/    # Development process guidance
    ├── strategies/   # Evolved implementation approaches and stable patterns
    ├── archive/      # Completed feature documentation and decisions
    └── ai-instructions/ # Agent-specific configuration and context
```

## Getting Started

### Core Workflow

1. **Establish Foundation** - Create constitutional documents in `reference/constitution/`:
   - META-PRD, PROJECT-STATUS, TECHNICAL-ARCHITECTURE, and DEVELOPMENT-RULES
2. **Plan Features** - Use `reference/workflows/1-create-prd.md` to create structured PRDs
3. **Generate Tasks** - Apply `reference/workflows/2-generate-tasks.md` to break PRDs into actionable work
4. **Execute with Oversight** - Follow `reference/workflows/3-process-task-loop.md` for controlled development
5. **Handle Incidental Work** - Use `reference/workflows/manage-incidental-work.md` for maintenance tasks
6. **Maintain Context** - Leverage session handoff and atomic commit workflows for coordination

### File Operations

1. Copy template files from their respective directories as needed
2. Begin active development work in `active/feature/` or `active/incidental/`
3. Use `upcoming/` directories to plan and queue future work
4. Reference stable documentation in `reference/` as your project knowledge base
5. Keep CURRENT-SESSION.md and notes files untracked in adopting projects if desired

## Usage Patterns

### Active Development

- Work primarily in `active/` during feature development
- Contains current session context, active PRDs, tasks, and research notes
- Files here represent your immediate work scope
- Separate `feature/` and `incidental/` work for better organization

### Planning & Pipeline

- Use `upcoming/` to organize future work by type
- PRDs ready for development, research notes, and generated tasks
- Maintains development pipeline visibility

### Reference & History

- Consult `reference/` for stable documentation and completed work
- `reference/constitution/` documents define project principles and architecture
- `reference/strategies/` capture evolved patterns and approaches in-depth
- `reference/archive/` preserves completed feature context with full historical records
- `reference/ai-instructions/` provide agent configuration and context
- `reference/workflows/` guide development processes

## Framework Integration

This structure implements the ARC framework's core principles:

- **Agentic**: Optimized for AI agent collaboration with clear context boundaries
- **Recursive**: Knowledge evolves from temporal notes → stable patterns → archived decisions
- **Coordination**: Shared language and systematic handoffs across development cycles

The three-tier organization (active, upcoming, reference) provides natural progression paths for work
and knowledge as they mature from immediate tasks to long-term project assets.

For more information about the ARC framework, see the
[arc-agentic-dev-framework](https://github.com/andrewRCr/arc-agentic-dev-framework) repository.
