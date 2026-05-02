# AGENT-BRIEF.ARC.md — ARC Orientation for Agents

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

## Vocabulary

Precise meanings — assume the technical sense.

- **Work unit (WU):** Bounded work plus its artifact group — `status-{name}.md` plus any present
  `plan-*`, `tasks-*`, `atomic-*` companions. Typically branch-scoped (1 WU : 1 branch by default);
  multi-branch patterns exist (stacked PRs, team mode). Not "any chunk of work".
- **Interlock:** Configurable control point gating an action — fires automatically, on user approval, or
  only on explicit invocation, per type and config. Always-stop: `task-`, `workflow-`, `integration-`.
  Configurable: `commit-`, `push-`.
- **Review increment:** One leaf task = one autonomous chunk. Default stop after each leaf.
  **Deferred review** = user-scoped batch ("proceed to 3.4", "do 3.4.a-c") that suspends per-leaf stops
  within scope; commit-interlock auto-fire also suspends when `on-task-approval`.
- **Atomic:** Small, indivisible-by-design work — atomic tasks (`atomic-{name}.md` companions),
  `ATOMIC-INBOX.md`, future atomic work units. Not "atomic" in the concurrency sense.

## Key Documents

| Document                    | Purpose                                       | Location                  |
|-----------------------------|-----------------------------------------------|---------------------------|
| AGENT-BRIEF.PROJECT.md      | Project overview, tech stack, friction points | `system/briefs/`          |
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
[AGENT-BRIEF.PROJECT.md](AGENT-BRIEF.PROJECT.md); agent-specific guidance lives in harness-level
files (e.g., `CLAUDE.md`, `AGENTS.md`) outside ARC._
