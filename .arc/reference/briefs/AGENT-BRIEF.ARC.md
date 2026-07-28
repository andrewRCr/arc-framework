# AGENT-BRIEF.ARC.md — ARC Orientation for Agents

ARC is a development methodology for human-AI collaboration, implemented as markdown documents,
git hooks, and a CLI package — all agent-platform agnostic.

## How ARC Works

**Session lifecycle:** Sessions are bounded — init via `arc-session`; recover after compaction through
`session-recover` (hook-injected when installed; `arc-recover` skill as manual fallback); handoff via
`arc-handoff`. State files: active work unit's
`meta-{name}.md` (tracked, `active/`) and `SESSION-NOTES.md` (gitignored, `user/{identity}/{work-unit}/`).

**Work pipeline:** PRD → task generation → task execution loop. One task = one review
increment; see DEV-RULES.ARC § Task Execution.

**Methods and extensions:** Behavior modules under `system/methods/` and `system/extensions/`,
loaded when workflow YAML frontmatter declares them.

**Review authority:** Agent-side review methods and extensions are best-effort ergonomics. They improve a change
and may produce evidence eligible for a review obligation, but an agent workflow can be bypassed by a host-UI merge.
Only a configured required host-side check structurally enforces merge safety; never infer that guarantee from
`self-review`, `frontline-review`, a clean report, or passing local checks.

**Quality gates:** Per-project — defined in DEV-RULES.PROJECT, referenced via the
`quality-gate-commands` method.

**Release wrappers:** `arc release commit` / `arc release push` are the canonical commit/push
invocation shape when active (`arc.releaseOptedIn: true` plus harness allowlist). After the interlock-validation
cascade, `arc release commit` accepts the same message/flags as `git commit`; `arc release push` supplies
`origin <current-branch>` itself, takes no target argument, and refuses destructive flags. See DEV-RULES.ARC
§ Commit Discipline.

## Vocabulary

Precise meanings — assume the technical sense.

- **Work unit (WU):** Wrapper noun — a bounded, _spec-worthy_ concern with one branch, a meta file, and one PR.
  Artifact group: `meta-{name}.md` plus any present `spec-*`, `draft-*`, `tasks-*`, `notes-*` companions. Not
  "any piece of work".
- **Class:** A work unit's recorded _weight_ — `Light` / `Heavy` / `Novel` (`[TBD]` until resolved). `Heavy`
  when _either_ intrinsic axis runs high: derivation (a real design must be authored before work can start) or
  scale / complexity (a large or intricate existing-code surface a correct plan and execution must navigate);
  `Novel` when derivation runs high at a second threshold — the design must be _invented_ (concepts / models
  not yet in the problem domain), not _composed_ from existing patterns. Indicates weight across planning,
  execution, and review — intrinsic demand, not output volume — and is the signal roadmap and parallelism
  planning read to balance a worklist. Ceremony scales with `Class`; execution discipline does not. Distinct
  from the quality-gate `Tier 1/2/3`.
- **Cohort:** A deliberate grouping of sibling work units, recorded by a `cohort-{name}.md` that holds the
  group's shared coordination. The work unit is the leaf. Nesting is path-valued via the `Cohort` field, capped at
  one level — `<cohort>/<subcohort>/<wu>`. When an active WU names a `Cohort`, session-init
  resolves and reads that `cohort-{name}.md`, so the group's shared coordination loads as session context.
- **Chunk:** A bounded, contract-cohesive slice of one exact change set reviewed in one pass. It is a review
  boundary, not a Work Unit, review increment, task-plan phase, branch, PR, or merge unit; closure, complete union
  coverage, and a seam review preserve local and cross-chunk review. Delivery vocabulary is reserved compatibly:
  a **deliverable** is a chunk given an independent merge boundary (`deliverable ⊂ chunk`), and a **stack** is a
  dependency ordering over a set of deliverables. Projects that never separate merge topology need only `chunk`.
- **Errand:** Off-WU wrapper for a single _self-evident_ concern — below the spec-worthiness floor (no design
  worth recording, no durable plan a correct execution must navigate). Always **atomic** (below); no meta or
  lifecycle — state derives from its branch + PR.
- **atomic:** Work _character_ — one _indivisible_ concern in a single session, no stage needing _durable_
  (cross-session) decomposition. _Typically_ one review increment, but pass- and commit-count are incidental:
  a _determinate_ concern may run a bounded few _in-session_ passes (an _extended errand_) and stay atomic. A
  descriptor, not a wrapper; inboxes route by _fate_ (Errand vs WU), not character. Not the concurrency sense.
- **Default:** A rule the agent may set aside in the moment by naming the fact that discharges it and disclosing
  that fact where the developer is already reading. Every rule ARC states is one unless marked `[invariant]`; see
  DEV-RULES.ARC § Rule Authority for the reading that classifies an unmarked rule and the discharge protocol. Not
  "optional" — silent divergence is a violation, not a discharge.
- **Invariant:** A rule the agent may not set aside on its own authority, marked `[invariant]` where the rule's own
  text does not settle it. It withholds the authority to _decide_, never the capability to act: every invariant has
  a **holder**, and that holder making the reserved decision is the rule working rather than a waiver. Orthogonal
  to `[configurable]`, which governs whether the _project_ may set a rule's shape — the two axes compose.
- **Dischargeable:** Said of an ignorance-guard — whether the fact that would settle the rule's concern is the
  agent's own to establish (dischargeable, so a default) or lives with someone else and has not been said
  (undischargeable, so an invariant — obtain the missing input rather than proceed with a note).
- **Interlock:** Configurable control point gating an action — fires automatically, on user approval, or
  only on explicit invocation, per type and config. Always-stop: `task-`, `workflow-`, `integration-`.
  Configurable: `commit-`, `push-`.
- **Review increment:** One bounded unit of execution; closes with a structured approval gate that precedes any
  commit invocation, wrapped or raw. Default boundary: one leaf task. Applies
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

`backlog/planned/` may nest work units one directory deeper under cohort directories; resolve work units by slug
rather than assuming the planned backlog is flat.

---

_Shared ARC framework entry point for all AI agents. Project-specific context lives in
[AGENT-BRIEF.PROJECT.md](AGENT-BRIEF.PROJECT.md); agent-specific guidance lives in harness-level
files (e.g., `CLAUDE.md`, `AGENTS.md`) outside ARC._
