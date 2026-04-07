# Skills Reference

ARC packages its user-facing workflows as [Skills](https://agentskills.io), an open standard
format for giving agents new capabilities and context. Each ARC skill is a user-invoked entry
point for a key operational workflow: when to start a session, when to commit, when to hand
off. You invoke them when you're ready; the agent discovers and loads the skill's instructions,
then executes the workflow. The invocation syntax varies by platform (slash commands in Claude Code, `$`
prefix in Codex CLI, etc.).

The agent's other workflows (task execution, quality gates, issue triage, planning) load
automatically as part of the ARC instruction chain once a session is running. You don't need
to trigger those; they're referenced by other workflows and the agent follows the chain.

Skills are generated during `arc init` or `arc join` based on which AI tools you selected. They
live in your agent's skill directory (e.g., `.claude/skills/` for Claude Code) and are not part
of the `.arc/` directory — they're platform-specific entry points into ARC's platform-agnostic
workflows.

## Core Skills

These three skills form the operational rhythm of every ARC session. You'll use them regularly;
they map directly to the [session lifecycle](../the-framework.md#the-session-lifecycle).

### arc-resume

**Start a session.** Loads project context, active work state, and personal notes from the last
handoff. The agent reads a defined set of documents in order, resolves the current task, checks
for freshness gaps, and produces an orientation summary.

If there's active work, the agent asks whether to proceed to the current task. If there's no
active work (between work units), the agent checks the roadmap and proposes next steps.

**When to use:** At the start of every working session. This is the entry point — nothing else
loads ARC's context correctly.

### arc-handoff

**End a session.** Captures working state for the next session: updates WORK-STATUS.md (tracked,
committed) with the current task pointer, and writes SESSION-NOTES.md (personal, gitignored)
with decisions, context, and anything the next session needs to know. Optionally saves state to
git notes for portability across machines.

**When to use:** When you're done working, at a natural boundary (task completion, phase
transition, mode change), or when you sense context quality degrading. The handoff cost is low;
the value is in the fresh start next session.

### arc-commit

**Commit changes.** Analyzes pending work for atomic boundaries, loads commit format guidance,
and stages WORK-STATUS.md alongside task list updates so project state stays in sync. Handles
the common case (one task, clean commit) and the complex case (multi-task accumulated work,
interleaved concerns that need splitting).

**When to use:** When work is ready to commit. The skill handles the ceremony — you don't need
to remember the commit format, context footer syntax, or which files to stage alongside your
changes.

## Supplemental Skills

These skills handle specific situations. They're not part of the regular session rhythm — use
them when the situation calls for it.

### arc-setup

**Initial configuration.** A one-time collaborative walkthrough after running `arc init` or
`arc join`. Verifies the installation, walks through ARC's customization surfaces (config,
methods, extensions), and guides you through defining the project documents that shape every
session: project briefing, development rules, and quick reference.

**When to use:** Once, after initial installation. Not needed for subsequent sessions.

### arc-verify

**Installation health checks.** Validates configuration, file structure, reference integrity,
hook status, and session state. Useful for diagnosing issues. If something isn't working as
expected, this skill checks the installation against ARC's requirements.

**When to use:** When something seems wrong. Hooks not firing, unexpected behavior during
sessions, or after manual changes to ARC files. Also useful after `arc update` to confirm
everything is consistent.

### arc-task-audit

**Pre-implementation review.** Analyzes task list entries before you start working on them —
surfaces unexposed assumptions, masked design decisions, codebase drift since the task was
written, scope ambiguity, and missing acceptance criteria. Read-only: it reports findings, you
decide what to act on.

**When to use:** Before starting a task or group of tasks where you want extra confidence or
suspect drift since the time of writing. This is not part of any workflow and isn't something
you run routinely; it's a tool for when the cost of discovering problems mid-implementation is
high enough to justify an analysis pass. Particularly useful for tasks written in a prior
session, tasks touching unfamiliar code, or tasks with complex dependencies.
