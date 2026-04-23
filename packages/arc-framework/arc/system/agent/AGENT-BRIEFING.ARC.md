# AGENT-BRIEFING.ARC.md — ARC Orientation for Agents

ARC is a development methodology for human-AI collaboration, implemented as markdown documents,
git hooks, and a CLI package — all agent-platform agnostic.

## How ARC Works

**Session lifecycle:** Sessions are bounded — init via the `arc-resume` skill, handoff via
`arc-handoff`. State files: active work unit's `status-{name}.md` (tracked, `active/{category}/`)
and `SESSION-NOTES.md` (gitignored, `user/{identity}/`).

**Work pipeline:** PRD → task generation → task execution loop. One task = one review
increment; see DEV-RULES.ARC § Task Execution.

**Methods and extensions:** Behavior modules under `system/methods/` and `system/extensions/`,
loaded when workflow YAML frontmatter declares them.

**Quality gates:** Per-project — defined in DEV-RULES.PROJECT, referenced via the
`quality-gate-commands` method.

## Key Documents

| Document                    | Purpose                                       | Location                  |
|-----------------------------|-----------------------------------------------|---------------------------|
| AGENT-BRIEFING.PROJECT.md   | Project overview, tech stack, friction points | `system/agent/`           |
| {AGENT}.ARC.md              | Agent-specific configuration                  | `system/agent/`           |
| DEV-RULES.ARC.md            | ARC methodology rules                         | `reference/constitution/` |
| DEV-RULES.PROJECT.md        | Project quality standards                     | `reference/constitution/` |
| QUICK-REFERENCE.md          | Commands and environment context              | `reference/`              |
| arc-config.yml              | Project settings                              | `system/`                 |
| status-{name}.md            | Current task, blockers, next action           | `active/{category}/`      |

## Directory Structure

```text
├── active/      — Current work (status files, task lists)
├── backlog/     — Future work pipeline (arc-in-git PM only)
├── reference/   — Constitution, strategies, ADRs
├── system/      — Agent config, workflows, settings
└── user/        — Per-developer session state
```

---

_Shared ARC framework entry point for all AI agents. Project-specific context lives in
[AGENT-BRIEFING.PROJECT.md](AGENT-BRIEFING.PROJECT.md); agent-specific guidance in dedicated
files (e.g., CLAUDE.ARC.md)._
