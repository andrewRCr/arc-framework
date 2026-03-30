# Getting Started

ARC is a methodology, not a library — you won't call its functions or import its modules. Instead,
it creates a set of documents and workflows in your repository that structure how you and your AI
agent work together. This guide walks through installation, initial setup, your first session, and
what the resulting structure looks like.

## Prerequisites

- A git repository (ARC uses git for version control, hooks, and session state portability)
- An AI coding agent — ARC works with any conversational agent (Claude Code, Codex CLI, Cursor,
  Windsurf, etc.). See [agent compatibility](philosophy.md#agent-compatibility) for details.

## Installation

Install the CLI globally:

```bash
npm install -g @arc-framework/cli
```

Then initialize ARC in your project:

```bash
arc init
```

The interactive setup asks for:

- **Project name** — used in generated documents
- **AI tools** — which agents you use (generates agent-specific skill files)
- **Project management mode** — `none` (core methodology only), `arc-in-git` (in-repo planning
  infrastructure), or `external` (external tracker integration)

This creates the `.arc/` directory, installs git hooks, generates agent skill files, and writes a
manifest for future updates.

!!! tip "Don't want to install globally?"
    You can run any command without installing: `npx @arc-framework/cli init`. Note that the
    short form `arc` only works after a global or local install — the npm package name is
    `@arc-framework/cli`, not `arc`.

### Joining an existing project

If someone else already initialized ARC in the repository:

```bash
arc join
```

This sets up your personal workspace — role, identity, and agent skills — without modifying the
shared project structure.

## Initial Setup

After `arc init` completes, it prints guidance to run the `arc-setup` skill in your agent. This is
one of ARC's *skills* — commands you invoke manually in your agent that trigger specific workflows.
The invocation syntax varies by tool (slash commands in Claude Code, `$` prefix in Codex CLI, etc.)
but the concept is the same: you trigger the skill, the agent executes the workflow.

`/arc-setup` walks you and the agent through two workflows:

1. **Verify and configure** — confirms the installation succeeded, walks through ARC's
   customization surfaces (config values, methods, extensions), and orients you to the directory
   structure.
2. **Define project** — guides you through the documents that shape every session: your project
   briefing (technology stack, friction points), development rules (quality gates, testing
   requirements), and quick reference (commands, environment context).

This is a one-time collaborative walkthrough. Three of the documents you produce — your project
briefing, development rules, and quick reference — are loaded by the agent at the start of every
session. The rest (META-PRD, technical overview, roadmap, project status) are reference material
consulted during planning and architecture decisions.

When setup is complete, start a fresh conversation in your agent and invoke the `arc-resume` skill.
The agent detects there's no active work yet and enters discovery mode — checking your roadmap for
the next item and helping you create a PRD and task list for your first work unit. From there, the
normal session rhythm takes over.

## Skills: ARC's Command Interface

ARC uses your agent's skill system as a command interface — a near-universal, manually invocable
mechanism across agent platforms. Skills are user-invoked triggers that you run explicitly when a
specific workflow is needed. Three skills form the operational rhythm of every session:

- **`arc-resume`** — start a session. Loads project context, active work state, and personal
  notes from your last handoff.
- **`arc-commit`** — commit changes. Analyzes pending work, enforces atomic boundaries, loads
  commit format guidance, and stages WORK-STATUS.md alongside task list updates.
- **`arc-handoff`** — end a session. Captures working state for the next session.

Additional skills handle specific situations: `arc-setup` (initial configuration), `arc-verify`
(installation health checks), `arc-task-audit` (pre-implementation review of task lists).

## Your First Session

### Start a session

Invoke `arc-resume` in your agent. The agent loads the project's context documents in a defined
order: agent briefings, development rules, strategy index, quick reference, current work status,
and any personal session notes from your last handoff.

When initialization completes, the agent reports an orientation summary: the current branch, whether
the working tree is clean, active work state, any blockers, and the suggested next action. If
there's an active task, the agent asks whether to proceed to it. If there's no active work, the
agent surfaces the next roadmap item and proposes next steps. Either way, you respond and direct
the session from there.

### Work through tasks

If a next task is defined in WORK-STATUS.md, the agent automatically loads the task execution
workflow (the process-task-loop) during initialization — this is the bread and butter of most
sessions. You and the agent work through tasks together at your direction, one review increment at
a time: the agent implements a task, runs quality gates, reports the result, and stops for your
review before proceeding. If you're starting fresh, the agent can help you create a PRD and
generate a task list. If a session pivots to task execution after starting without one, the agent
loads the workflow then.

This is co-development, not delegation. You're present during execution — steering direction,
contributing context, catching issues, and/or writing code alongside the agent.

### Commit changes

When work is ready to commit, invoke `arc-commit`. The skill handles atomic boundary analysis,
commit format guidance (conventional commits with context footers linking each commit to its task),
and stages WORK-STATUS.md alongside the task list changes so project state stays in sync.

### End a session

ARC sessions are designed to be shorter and more frequent than you might expect. Agent output
quality [degrades measurably](sessions.md#why-bounded-sessions) as context accumulates, and human
attention follows the same pattern. Frequent handoffs at natural boundaries — task completion, phase
transitions, mode changes — maintain higher quality work than marathon sessions that technically fit
in the context window.

When a boundary arrives, invoke `arc-handoff`. This captures:

- **WORK-STATUS.md** — where the project stands (tracked, committed)
- **SESSION-NOTES.md** — what you were thinking (personal, gitignored)

The next session rebuilds context fresh and picks up where you left off. The handoff cost is low by
design — the value is in the reset.

## What You Get

After initialization, your repository has an `.arc/` directory with this structure:

```text
.arc/
├── active/             Work in progress (WORK-STATUS, task lists, PRDs)
│   ├── feature/        Feature work units
│   ├── technical/      Technical/infrastructure work units
│   └── incidental/     Discovered work units
├── archive/            Completed work (moved from active/ after merge)
├── backlog/            Future work pipeline (arc-in-git PM mode only)
├── reference/          Stable reference material
│   ├── adr/            Architecture Decision Records
│   ├── constitution/   Development rules (ARC methodology + project standards)
│   ├── strategies/     Codified guidance (session management, planning, etc.)
│   └── templates/      Copy-ready starting points for PRDs, plans, etc.
├── system/             Framework internals
│   ├── agent/          Agent briefings and configuration
│   ├── githooks/       Git hooks for commit validation
│   └── workflows/      Session lifecycle, task execution, work unit management
└── user/{identity}/    Per-developer workspace (gitignored, portable via git notes)
```

Key files to know:

| File                        | Purpose                                                          |
| --------------------------- | ---------------------------------------------------------------- |
| `AGENT-BRIEFING.PROJECT.md` | Your project overview — technology stack, friction points        |
| `DEV-RULES.PROJECT.md`      | Your quality standards — gates, testing, code quality            |
| `QUICK-REFERENCE.md`        | Commands and environment context for your project                |
| `arc-config.yml`            | Configuration values (commit format, hooks, protection mode)     |
| `arc-methods.md`            | Overridable method implementations (commit format, triage, etc.) |
| `arc-extensions.md`         | Extension points for injecting custom workflow steps             |
| `WORK-STATUS.md`            | Current task, blockers, next action                              |

## Updating ARC

When a new version of the framework is released:

```bash
arc update
```

This updates framework files via three-way merge — your customizations to Configurable files are
preserved. See [Updating ARC](updating.md) for details on how the update system works and what's
safe to edit.

## Next Steps

- [Philosophy](philosophy.md) — understand the principles behind the methodology
- [Sessions](sessions.md) — learn why bounded sessions matter and how they work
- [Work Planning](work-planning.md) — understand the planning pipeline and task execution
