# .arc — ARC Framework

This directory contains the ARC framework for your project — development methodology, shared
context, and active work tracking, implemented as portable markdown documents.

<!-- TODO: When getting-started content exists, point to it here alongside the repo README. -->

**New to ARC?** See the [repository README](../README.md) for an overview of the framework.

## Directory Structure

Template files ship as `.example.md` — rename by removing `.example` during setup.

```text
.arc/
├── active/                    # Current work in progress
│   ├── CURRENT-SESSION.md     # Agent orientation: what's active, what's next
│   ├── ATOMIC-TASKS.md        # Small one-off tasks (no full task list needed)
│   ├── feature/               # Active feature development
│   ├── technical/             # Active technical/infrastructure work
│   └── incidental/            # Active maintenance and discovered work
├── backlog/                   # Future work pipeline
│   ├── ROADMAP.md             # Sequencing strategy for upcoming work
│   ├── TASK-INBOX.md          # Zero-friction idea capture
│   ├── feature/               # Feature backlog
│   └── technical/             # Technical backlog
└── reference/                 # Stable, long-lived documentation
    ├── QUICK-REFERENCE.md     # Environment context and command patterns
    ├── constitution/          # Foundational documents (META-PRD, rules, architecture)
    ├── workflows/             # Core development processes (define, plan, generate, execute)
    │   └── supplemental/      # Supporting workflows (handoff, commits, incidental work)
    ├── strategies/            # Codified implementation patterns
    │   ├── arc/               # Framework methodology (ships with ARC)
    │   └── project/           # Your project-specific patterns
    ├── adr/                   # Architecture Decision Records
    ├── agent/                 # AI agent configuration (AGENTS.md + tool-specific files)
    ├── research/              # Technical research documents
    └── archive/               # Completed work (by work type, quarterly as volume grows)
```

## Document Audiences

ARC documents serve different audiences — knowing this helps you understand what to read
and what to leave for your agent:

| Audience           | Documents                                                     | Who reads them                                                                                |
|--------------------|---------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| **Agent-executed** | Session init/handoff, CURRENT-SESSION, process-task-loop      | Your AI agent follows these as operational procedures. Read them when customizing, not daily. |
| **Shared context** | Constitution, strategies, ADRs, roadmap, backlogs, task lists | Both you and your agent. Establishes the common project baseline.                             |
| **Human-facing**   | Repository README, getting-started materials                  | You, when evaluating or setting up the framework.                                             |

When your agent initializes each session, it reads several documents in full — constitution,
development rules, quick reference, current session state. This is by design: agents start
with zero memory and need complete context every time. The reading list looks heavy, but
it's what ensures consistent, well-informed agent behavior session after session.
