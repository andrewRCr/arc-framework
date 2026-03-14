# AGENTS.ARC.md — ARC Agent Briefing

ARC is a development methodology for human-AI collaboration. It structures how a developer
and an AI agent work together — planning, executing, verifying, and preserving context across
work sessions. The methodology lives as portable markdown documents in your project.

## How ARC Works

**Session lifecycle:** Sessions are bounded — each starts with initialization and ends with
handoff. The user invokes these as skills (e.g., `/arc-resume`, `/arc-handoff`). Initialization
loads project context from a defined document set; handoff preserves working context for the
next session. Session state splits between WORK-STATUS.md (tracked, committed) and
SESSION-NOTES.md (personal, gitignored in `user/{identity}/`, portable via git notes).

**Work pipeline:** Planned work follows a structured pipeline — PRD, task generation, task
execution loop. Each task is a bounded review increment: the agent completes one, reports, and
waits for approval before proceeding.

**Methods and extensions:** ARC ships strong defaults for key behaviors (commit format,
leave-it-cleaner, test-first, quality gate commands). Teams can override any method via
`arc-methods.md` without modifying framework files. Extension points in `arc-extensions.md`
allow injecting custom steps at defined workflow boundaries.

**Quality gates:** Every task must pass quality checks before completion. Gate commands are
project-specific — defined in DEV-RULES.PROJECT and referenced via the quality-gate-commands
method.

## Key Documents

| Document             | Purpose                                       | Location                  |
|----------------------|-----------------------------------------------|---------------------------|
| AGENTS.PROJECT.md    | Project overview, tech stack, friction points | `system/agent/`           |
| {AGENT}.ARC.md       | Agent-specific configuration                  | `system/agent/`           |
| DEV-RULES.ARC.md     | ARC methodology rules                         | `reference/constitution/` |
| DEV-RULES.PROJECT.md | Project quality standards                     | `reference/constitution/` |
| QUICK-REFERENCE.md   | Commands and environment context              | `reference/`              |
| arc-config.yml       | Project settings                              | `system/`                 |
| WORK-STATUS.md       | Current task, blockers, next action           | `active/`                 |

## Directory Structure

```text
├── active/      — Current work (WORK-STATUS, task lists)
├── backlog/     — Future work pipeline (arc-in-git PM only)
├── reference/   — Constitution, strategies, ADRs
├── system/      — Agent config, workflows, settings
└── user/        — Per-developer session state
```

---

_This is the shared ARC framework entry point for all AI agents. Project-specific context
lives in [AGENTS.PROJECT.md](AGENTS.PROJECT.md). Agent-specific guidance lives in dedicated
files (e.g., CLAUDE.ARC.md, CODEX.ARC.md)._
