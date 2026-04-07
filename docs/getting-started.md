# Getting Started

ARC installs methodology reference, workflows, git hooks, and agent skills in your repository
that structure how you and your AI agent work together. This guide walks through installation,
initial setup, and your first session.

## Prerequisites

- A git repository (ARC uses git for version control, hooks, and session state portability)
- An AI coding agent. ARC works with any conversational agent. During beta, it's been primarily
  developed and tested with Claude Code and Codex CLI, with additional validation against Warp,
  Gemini CLI, and Copilot CLI. IDE-embedded agents (Cursor, Windsurf, Cline) are architecturally
  supported but not yet validated. If you're using one, your feedback helps close that gap
  ([file an issue](https://github.com/andrewRCr/arc-framework/issues)). See
  [agent compatibility](philosophy/index.md#agent-compatibility) for the full compatibility spectrum.

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
- **Project management mode** — `arc-in-git` (ARC Core + Planning Module) for most projects:
  in-repo planning infrastructure the agent can read and reason about directly. `external`
  (ARC Core + External Tracker) if your team already uses Jira/Linear/etc. `none` (ARC Core)
  for core methodology only. See [The Planning Module](work-planning.md#the-planning-module)
  for guidance on choosing.

This creates the `.arc/` directory, installs git hooks, generates agent skill files, and writes
a manifest for future updates.

!!! tip "Don't want to install globally?"
    You can run any command without installing: `npx @arc-framework/cli init`. Note that the
    short form `arc` only works after a global or local install — the npm package name is
    `@arc-framework/cli`, not `arc`.

### Joining an existing project

If someone else already initialized ARC in the repository:

```bash
arc join
```

This sets up your personal workspace (role, identity, and agent skills) without modifying the
shared project structure. For teams, see
[Team Coordination](reference/team-coordination.md) for the full multi-developer setup.

## Initial Setup

After `arc init`, run the `arc-setup` skill in your agent — skills are user-invoked entry
points into ARC workflows (e.g., `/arc-setup` in Claude Code, `$arc-setup` in Codex CLI; see
[Skills Reference](reference/skills.md) for details). This is a one-time collaborative
walkthrough that:

1. **Verifies and configures** — confirms the installation, walks through ARC's customization
   surfaces ([config values, methods, extensions](reference/customizing/configuration.md)), and orients you
   to the directory structure.
2. **Defines your project** — guides you through the documents that shape every session: project
   briefing (technology stack, friction points), development rules (quality gates, testing
   requirements), and quick reference (commands, environment context).

Three of the documents you produce (your project briefing, development rules, and quick
reference) are loaded by the agent at the start of every session.

## Your First Session

Start a fresh conversation and invoke `arc-resume`, the skill that starts every ARC session.
The agent loads a defined set of documents in order (project identity, development rules, active
work state, personal notes), then reports an orientation summary: current branch, work state,
blockers, and the suggested next action.

![First session initialization — agent loads context and enters discovery mode](img/first-session-init.gif)

Since this is your first session, the agent detects there's no active work and enters discovery
mode — checking your roadmap for the next item and helping you create a PRD and task list for
your first [work unit](reference/glossary.md#work-unit). From there, the normal session rhythm
takes over: working through tasks one at a time, each as a bounded
[review increment](reference/glossary.md#review-increment) with a mandatory stop for your
review between tasks.

For the full operational model (sessions, skills, task execution), see
[How ARC Works](how-arc-works.md).

### Committing changes

When work is ready to commit, invoke `arc-commit`. The skill handles atomic boundary analysis,
commit format guidance (conventional commits with `Context:` footers linking each commit to its
task, [customizable](reference/customizing/configuration.md#commit-discipline)), and stages WORK-STATUS.md
alongside task list changes so project state stays in sync.

### Ending a session

When you reach a natural boundary (task completion, phase transition, or when you sense context
quality dropping), invoke `arc-handoff`. This captures:

- **WORK-STATUS.md** — where the project stands (tracked, committed)
- **SESSION-NOTES.md** — what you were thinking (personal, gitignored)

The next session rebuilds context fresh and picks up where you left off. See
[Philosophy § Why Bounded Sessions](philosophy/index.md#why-bounded-sessions) for the evidence behind
shorter, focused sessions.

## Next Steps

- [How ARC Works](how-arc-works.md) — the session lifecycle, skills, and task execution model
- [Philosophy](philosophy/index.md) — the 11 principles and the evidence behind them
- [Work Planning](work-planning.md) — the planning pipeline and work organization
