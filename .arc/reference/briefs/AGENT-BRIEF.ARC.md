# AGENT-BRIEF.ARC.md — ARC Orientation for Agents

ARC is a development methodology for human-AI collaboration, implemented as markdown documents,
git hooks, and a CLI package — all agent-platform agnostic.

## How ARC Works

**Session lifecycle:** Sessions are bounded — init via the `arc-resume` skill, handoff via
`arc-handoff`. State files: active work unit's `meta-{name}.md` (tracked, `active/`)
and `SESSION-NOTES.md` (gitignored, `user/{identity}/`).

**Work pipeline:** PRD → task generation → task execution loop. One task = one review
increment; see DEV-RULES.ARC § Task Execution.

**Methods and extensions:** Behavior modules under `system/methods/` and `system/extensions/`,
loaded when workflow YAML frontmatter declares them.

**Quality gates:** Per-project — defined in DEV-RULES.PROJECT, referenced via the
`quality-gate-commands` method.

**Release wrappers:** `arc release commit` / `arc release push` are the canonical commit/push
invocation shape when active (`arc.releaseOptedIn: true` plus harness allowlist) — see
DEV-RULES.ARC § Commit Discipline.

## Vocabulary

Precise meanings — assume the technical sense.

- **Work unit (WU):** Wrapper noun — a bounded chunk of work with one branch, a meta file, and
  one PR. Tier-invariant (atomic / quick / standard). Artifact group: `meta-{name}.md` plus any
  present `plan-*`, `tasks-*`, `atomic-*` companions. Not "any chunk of work".
- **Atomic:** Work _character_ — single-bounded, indivisible, no internal stages. Applies at all
  scales: items (inbox entries), tasks (`atomic-{name}.md` companions), WUs (atomic-tier). Inboxes
  route by character, not wrapper presence. Not "atomic" in the concurrency sense.
- **Interlock:** Configurable control point gating an action — fires automatically, on user approval, or
  only on explicit invocation, per type and config. Always-stop: `task-`, `workflow-`, `integration-`.
  Configurable: `commit-`, `push-`.
- **Review increment:** One bounded chunk of work; closes with a structured approval gate that
  precedes any commit invocation, wrapped or raw. Default boundary: one leaf task. Applies
  universally — task list work, off-task / incidental, workflow stages.
  **Deferred review** = user-scoped batch ("proceed to 3.4", "do 3.4.a-c") that suspends per-leaf
  stops within scope; commit-interlock auto-fire also suspends when `on-task-approval`.

## Key Documents

| Document                    | Purpose                                       | Location                  |
|-----------------------------|-----------------------------------------------|---------------------------|
| AGENT-BRIEF.PROJECT.md      | Project overview, tech stack, friction points | `reference/briefs/`       |
| DEV-RULES.ARC.md            | ARC methodology rules                         | `system/rules/`           |
| DEV-RULES.PROJECT.md        | Project quality standards                     | `system/rules/`           |
| QUICK-REFERENCE.md          | Commands and environment context              | `reference/`              |
| arc-config.yml              | Project settings                              | `system/`                 |
| meta-{name}.md              | Current task, blockers, next action           | `active/`                 |

## Directory Structure

```text
├── active/      — Current work (meta files, task lists)
├── backlog/     — Future work pipeline (arc-in-git PM only)
├── reference/   — Constitution, strategies, ADRs
├── system/      — Agent config, workflows, settings
└── user/        — Per-developer session state
```

---

_Shared ARC framework entry point for all AI agents. Project-specific context lives in
[AGENT-BRIEF.PROJECT.md](AGENT-BRIEF.PROJECT.md); agent-specific guidance lives in harness-level
files (e.g., `CLAUDE.md`, `AGENTS.md`) outside ARC._
