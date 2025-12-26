# .arc - ARC Documentation System

This directory contains the complete documentation system for projects using the ARC
(Agentic, Recursive, Coordination) framework methodology.

## Directory Structure

```
.arc/
├── active/           # Current session work - PRDs, tasks, notes, and session context
│   ├── feature/      # Active feature development work
│   ├── technical/    # Active technical infrastructure work
│   ├── incidental/   # Active maintenance and small tasks
│   └── ATOMIC-TASKS.md  # Small one-off tasks (GTD "Next Actions")
├── backlog/          # Future work pipeline
│   ├── ROADMAP.md    # Sequencing strategy for remaining work
│   ├── TASK-INBOX.md # Zero-friction capture for ideas
│   ├── feature/      # Feature backlog and plans
│   └── technical/    # Technical backlog and plans
└── reference/        # Stable, long-term documentation
    ├── constitution/ # Foundational project documents (META-PRD, rules, architecture)
    ├── workflows/    # Development process guidance
    ├── strategies/   # Evolved implementation approaches and stable patterns
    ├── adr/          # Architecture decision records
    ├── research/     # Technical research documents
    ├── archive/      # Completed work documentation (quarterly, by work type)
    │   └── {{QUARTER}}/  # e.g., 2025-q4
    │       ├── feature/     # Completed feature work
    │       ├── technical/   # Completed technical work
    │       └── incidental/  # Completed incidental work
    └── agent/        # Agent-specific configuration and context
```

## Getting Started

### Core Workflow

1. **Establish Foundation** - Create constitutional documents in `reference/constitution/`:
   - META-PRD, PROJECT-STATUS, TECHNICAL-OVERVIEW, and DEVELOPMENT-RULES
2. **Plan Features** - Use `reference/workflows/1_create-prd.md` to create structured PRDs
3. **Generate Tasks** - Apply `reference/workflows/2_generate-tasks.md` to break PRDs into actionable work
4. **Execute with Oversight** - Follow `reference/workflows/3_process-task-loop.md` for controlled development
5. **Handle Incidental Work** - Use `reference/workflows/supplemental/manage-incidental-work.md` for maintenance
6. **Maintain Context** - Leverage session handoff and atomic commit workflows for coordination

### File Operations

1. Copy template files from their respective directories as needed
2. Begin active development work in `active/feature/` or `active/incidental/`
3. Use `backlog/` to plan and prioritize future work (ROADMAP.md, TASK-INBOX.md)
4. Reference stable documentation in `reference/` as your project knowledge base
5. Keep CURRENT-SESSION.md and notes files untracked in adopting projects if desired

## Usage Patterns

### Active Development

- Work primarily in `active/` during development
- Contains current session context, active PRDs, tasks, and research notes
- Files here represent your immediate work scope
- Organized by work type: `feature/` (user-facing), `technical/` (infrastructure), `incidental/` (maintenance)
- Use `ATOMIC-TASKS.md` for small, one-off tasks that don't need full task lists

### Planning & Pipeline

- Use `backlog/ROADMAP.md` for sequencing strategy
- Use `backlog/TASK-INBOX.md` for zero-friction idea capture
- Organize planned work in `backlog/feature/` and `backlog/technical/`
- Process inbox items during weekly review

### Reference & History

- Consult `reference/` for stable documentation and completed work
- `reference/constitution/` documents define project principles and architecture
- `reference/strategies/` capture evolved patterns and approaches in-depth
- `reference/archive/` preserves completed work in quarterly directories by work type
- `reference/agent/` provide agent configuration and context
- `reference/workflows/` guide development processes

## Framework Integration

This structure implements the ARC framework's core principles:

- **Agentic**: Optimized for AI agent collaboration with clear context boundaries
- **Recursive**: Knowledge evolves from temporal notes → stable patterns → archived decisions
- **Coordination**: Shared language and systematic handoffs across development cycles

The three-tier organization (active, backlog, reference) provides natural progression paths for work
and knowledge as they mature from immediate tasks to long-term project assets.

For more information about the ARC framework, see the
[arc-agentic-dev-framework](https://github.com/andrewRCr/arc-agentic-dev-framework) repository.
