# .arc — ARC Framework

This directory contains the ARC framework for your project — development methodology, shared
context, and active work tracking, implemented as portable markdown documents.

**New to ARC?** See the [repository README](../README.md) for an overview of the framework.

## Directory Structure

Template files ship as `.template.md` — rename by removing `.template` during setup.

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
├── reference/                 # Stable, long-lived documentation
│   ├── QUICK-REFERENCE.md     # Environment context and command patterns
│   ├── constitution/          # Foundational documents (META-PRD, rules, architecture)
│   ├── strategies/            # Codified implementation patterns
│   │   ├── arc/               # Framework methodology (ships with ARC)
│   │   └── project/           # Your project-specific patterns
│   ├── adr/                   # Architecture Decision Records
│   ├── research/              # Technical research documents
│   └── archive/               # Completed work (by work type, quarterly as volume grows)
└── system/                    # Agent-facing operational files
    ├── arc-config.yml         # Project settings (base branch, protection mode)
    ├── agent/                 # AI agent configuration (AGENTS.md + tool-specific files)
    ├── commands/              # Slash commands
    ├── githooks/              # Git hook scripts
    └── workflows/             # Development process workflows
        ├── arc/               # ARC framework workflows (setup/ + supplemental/)
        └── project/           # Project-specific workflows
```

## Document Audiences

ARC documents serve different audiences — knowing this helps you understand what to read
and what to leave for your agent:

| Audience            | Documents                                                     | Who reads them                                                          |
|---------------------|---------------------------------------------------------------|-------------------------------------------------------------------------|
| **Agent-executed**  | Session init/handoff, process-task-loop, commit workflow      | Your agent follows these as procedures. Read when customizing.          |
| **Collaborative**   | Setup workflows, create-prd, generate-tasks                   | You and your agent work through these together.                         |
| **Shared context**  | Constitution, strategies, ADRs, roadmap, backlogs, task lists | Both you and your agent. The common project baseline.                   |
| **Human-driven**    | Weekly review                                                 | You conduct this, optionally with agent assistance.                     |
| **Human-facing**    | Repository README, external documentation site                | You, when evaluating or onboarding to the framework.                    |

**Audience headers in workflows:** All workflow files include an `**Audience:**` line at the
top indicating who drives the process. This makes it clear at a glance whether a workflow is
something your agent runs autonomously, something you work through together, or something
you drive yourself.

When your agent initializes each session, it reads several documents in full — constitution,
development rules, quick reference, current session state. This is by design: agents start
with zero memory and need complete context every time. The reading list looks heavy, but
it's what ensures consistent, well-informed agent behavior session after session.
