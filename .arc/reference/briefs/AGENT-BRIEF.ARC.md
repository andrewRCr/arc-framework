# AGENT-BRIEF.ARC.md — ARC Orientation for Agents

ARC is a development methodology for human-AI collaboration, implemented as markdown documents,
git hooks, and a CLI package — all agent-platform agnostic.

## How ARC Works

**Session lifecycle:** Sessions are bounded — init via the `arc-session` skill, handoff via
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
  one PR. Artifact group: `meta-{name}.md` plus any present `spec-*`, `draft-*`, `tasks-*`, `notes-*`
  companions. Not "any chunk of work".
- **Class:** A work unit's recorded _weight_ — `Light` / `Heavy` / `Novel` (`[TBD]` until resolved). `Heavy`
  when _either_ intrinsic axis runs high: derivation (a real design must be authored before work can start) or
  scale / complexity (a large or intricate existing-code surface a correct plan and execution must navigate);
  `Novel` when derivation runs high at a second threshold — the design must be _invented_ (concepts / models
  not yet in the problem domain), not _composed_ from existing patterns. Indicates weight across planning,
  execution, and review — intrinsic demand, not output volume — and is the signal roadmap and parallelism
  planning read to balance a worklist. Ceremony scales with `Class`; execution discipline does not. Distinct
  from the quality-gate `Tier 1/2/3`.
- **Cohort:** A deliberate grouping of sibling work units, recorded by a `cohort-{name}.md` that holds the
  group's shared coordination. The work unit is the leaf deliverable. Nesting is path-valued via the `Cohort`
  field, capped at one level — `<cohort>/<subcohort>/<wu>`.
- **Atomic:** Work _character_ — a single logical concern that fits one review increment (typically one
  commit, even if multi-file). Executed inline within a same-domain WU, or on its own as an Errand. Inboxes
  route by character, not wrapper presence. Not "atomic" in the concurrency sense.
- **Interlock:** Configurable control point gating an action — fires automatically, on user approval, or
  only on explicit invocation, per type and config. Always-stop: `task-`, `workflow-`, `integration-`.
  Configurable: `commit-`, `push-`.
- **Review increment:** One bounded chunk of work; closes with a structured approval gate that
  precedes any commit invocation, wrapped or raw. Default boundary: one leaf task. Applies
  universally — task list work, off-task / incidental, workflow stages.
  **Deferred review** = a batch suspending per-leaf stops within scope — user-scoped ("proceed to 3.4")
  or agent-proposed at a coupled parent (proposes, user approves; never self-invoked); commit-interlock
  auto-fire also suspends when `on-task-approval`.

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
