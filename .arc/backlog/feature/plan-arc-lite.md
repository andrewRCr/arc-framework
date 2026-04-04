# Plan: ARC Lite — Lightweight Project Mode

**Purpose:** Define a lightweight ARC variant for small, bounded projects that preserves execution
discipline (task lists, commit standards, hooks, session management) while eliminating lifecycle
ceremony (PRDs, work unit activation/archival, backlog pipeline, formal integration).

**Status:** Draft (exploring)
**Created:** 2026-04-01
**Origin:** Developer experience gap — small projects (hours to days) benefit from ARC's execution
discipline but not its planning pipeline. Current modes offer no way to use task execution without the work unit lifecycle
workflows that assume multi-phase, long-running efforts.

---

## Problem Statement

ARC's value splits into two separable layers:

1. **Execution discipline** — task-driven work (process-task-loop), commit format and traceability,
   quality gates, hooks, session continuity, dev rules, methods. Valuable at any project scale.
2. **Lifecycle ceremony** — PRD requirement, formal task generation from PRD, work unit activation,
   verification phase, integration review, archival, backlog pipeline, roadmap tracking. Valuable
   for multi-week, multi-phase efforts with discovery and evolving scope.

For small projects (theme ports, CLI tools, config libraries, weekend prototypes), layer 2 creates
friction disproportionate to its value. Developers skip ARC entirely, then miss layer 1.

**Current `pm.mode` options don't address this gap.** `pm.mode: none` (Core) already includes task
execution as part of the methodology engine — task lists, process-task-loop, session management,
commit discipline are all Core. What it strips is the PM _suite_ (backlogs, roadmap,
PROJECT-STATUS). But the friction isn't in PM artifacts — it's in the _workflow layer_: the
planning pipeline (PRD → task generation), work unit lifecycle (activation, archival), and the
ceremony that assumes multi-phase, multi-week efforts. These workflow assumptions are embedded in
Core, not gated by `pm.mode`.

The goal is not "less ARC" but a structurally different mode of working that shares ARC's execution
core — one that strips the lifecycle workflow assumptions, not just the PM artifacts.

## Core Boundary Hypothesis

**The differentiator is work unit lifecycle presence/absence.**

Full ARC models projects as a stream of work units flowing through a lifecycle pipeline. Each work
unit is born (planning), activated, executed, verified, integrated, and archived. The project
persists across many work units.

Lightweight ARC models the project as a single evolving task list. There is no lifecycle pipeline —
tasks are added, completed, and the list grows organically. The project _is_ the work unit.

All other structural differences flow from this boundary:

| Aspect              | Full ARC                                                       | Lightweight ARC             |
| ------------------- | -------------------------------------------------------------- | --------------------------- |
| Work model          | Stream of work units                                           | Single evolving task list   |
| Task list location  | `.arc/active/{category}/tasks-{name}.md`                       | `.arc/active/tasks.md`      |
| PRD                 | Required before task generation                                | Available, not required     |
| Plan docs           | Pipeline stage                                                 | Available, not required     |
| Branching model     | Strategy-driven (full/partial protection)                      | Simplified (on/off)         |
| Active directory    | Category subdirs (feature/, technical/)                        | Flat                        |
| Backlog             | Pipeline with roadmap                                          | Not installed               |
| Work unit lifecycle | Activation → execution → verification → integration → archival | None                        |
| Verification        | Formal phase in task list                                      | Run Tier 3 gates when ready |
| Integration         | Pre-merge review, formal PR workflow                           | Push/merge when ready       |
| Session lifecycle   | Same                                                           | Same                        |
| Process-task-loop   | Same                                                           | Same                        |
| Hooks               | Same                                                           | Same                        |
| Methods             | Same                                                           | Same                        |
| Dev rules           | Same                                                           | Same                        |

## What Stays Identical

These layers are project-scale-independent and work the same in both modes:

- **Constitutional layer**: DEV-RULES.ARC, DEV-RULES.PROJECT, strategies
- **Methods**: Commit format, issue triage, test-first, quality gates, all overrides
- **Hooks**: Pre-commit, commit-msg validation, format enforcement
- **Session lifecycle**: Session init and handoff, WORK-STATUS, SESSION-NOTES
- **Process-task-loop**: One task at a time, quality gates, mandatory stops, completion protocol
- **Task list format**: Same markdown structure, same formatting conventions
- **Agent briefings**: Same documents, same behavioral guidance

## What Changes

### Task list creation

Without a PRD requirement, task lists are created conversationally. The developer describes what
they're building; the agent drafts a task list. The task list formatting strategy still applies —
same structure, likely fewer phases (possibly single-phase for very small work).

### File structure

```text
.arc/
  active/
    tasks.md              # The task list (singular)
    WORK-STATUS.md        # Current task pointer
    prd.md                # Optional — only if developer wants one
    notes.md              # Optional — thinking/planning notes
  reference/              # Constitutional docs, strategies
  system/                 # Agent config, workflows, settings
  user/{identity}/        # Session state (same as full ARC)
```

No `feature/`, `technical/`, `incidental/` subdirs. No backlog directory. No archive directory
(completed task lists can be deleted or kept in place — no archival ceremony).

### WORK-STATUS simplification

Lightweight WORK-STATUS tracks less — no task list path (there's only one), no "Following Task
List" field. Possibly just: current task, last completed, blockers, next action.

### Branch model

Full ARC's branch protection modes (full/partial) and category-based branching don't apply.
Lightweight mode could offer a simpler choice: work on main directly, or create a single branch
per effort. No strategy-work-organization dependency.

## Graduation Path (Lightweight → Full)

When a project outgrows lightweight mode — scope expands, multiple work streams emerge, the single
task list becomes unwieldy — graduation should be supported:

1. Introduce category subdirs in `active/` (move `tasks.md` → `active/feature/tasks-{name}.md`)
2. Install backlog infrastructure (ROADMAP, backlog files)
3. Switch configuration to full `arc-in-git` (or whatever the mode identifier becomes)
4. Existing task list continues as-is — same format, new location
5. Future work follows the full pipeline (PRD → task generation → lifecycle)

**Key constraint:** The task list format must be identical in both modes. Graduation = relocation
and infrastructure addition, not content rewrite.

CLI support: `arc graduate` or expansion of `arc init --reconfigure` to handle the mode transition.
The CLI scaffolds the new directories, moves the task list, and updates configuration.

## Downgrade Path (Full → Lightweight)

For developers who find full ARC too heavy for their context:

1. Only possible when a single work unit is active (or between work units)
2. Collapse directory structure — move active task list to `active/tasks.md`
3. Remove backlog infrastructure
4. Switch configuration

This also serves as an adoption on-ramp: try full ARC, find it heavy, dial back to what you
actually use rather than abandoning the framework entirely.

## Quick-Start / On-Ramp Angle

Lightweight mode could be the default first experience with ARC:

- `arc init` → lightweight mode. Hooks work, dev rules load, you can create a task list immediately
- Developer experiences the execution discipline without upfront ceremony
- When the project (or a new project) outgrows it, graduate to full

This reverses the current adoption model where you choose your PM mode before experiencing ARC.
Instead: start working, discover value, add structure when you need it.

## Configuration Identity

### Is this `pm.mode`?

`pm.mode` currently means "where does project management live" — the axis is PM artifact location.
What we're describing changes more than PM artifacts:

- Workflow layer (no work unit lifecycle)
- File structure (flat active/)
- Branch model (simplified)
- Session init behavior (no work unit discovery)

**Options to evaluate:**

1. **New `pm.mode` value** (e.g., `pm.mode: lite`) — simplest, but might stretch the semantics
   of `pm.mode` beyond its original axis
2. **Top-level mode** (e.g., `arc.mode: lite | standard`) — separate from PM, affects multiple
   layers. `pm.mode` still exists within standard mode for arc-in-git vs external
3. **Profile concept** — a named collection of settings that configure multiple axes at once.
   "Lightweight" profile sets pm.mode, branch model, file structure, workflow selection
4. **Single task list flag** — rather than a "mode," the structural difference is just whether
   work units exist. Something like `pm.work_units: false` that disables the lifecycle layer

**Mutual exclusivity:** Regardless of mechanism, lightweight mode and `pm.mode: arc-in-git` are
mutually exclusive — it doesn't make sense to have both a single-evolving-task-list model and a
full planning pipeline with backlogs and roadmaps simultaneously. The CLI must guard against
incompatible combinations (e.g., error if a user tries to enable arc-in-git while in lightweight
mode, or vice versa). Graduation/downgrade paths are the supported transitions between them.

Decision deferred pending deeper analysis of what exactly needs to change at the workflow and
CLI level.

## Content Audit (Deferred)

Once the boundary is more clearly defined, a careful audit of all framework domains is needed to
classify each file and concept into one of three categories:

- **Unchanged**: Works identically in lightweight mode (e.g., hooks, commit format methods,
  most dev rules)
- **Modified**: Present but adapted for lightweight context (e.g., session-init with simpler
  discovery, process-task-loop without work unit lifecycle references, WORK-STATUS with fewer
  fields)
- **Excluded**: Not installed or loaded in lightweight mode (e.g., strategy-work-organization,
  strategy-backlog-organization, activation/archival workflows, work unit lifecycle workflows)

This audit should cover at minimum:

- **Strategy documents**: Which apply, which don't, which need conditional sections
- **Workflow documents**: Which are used, which are skipped, which need lightweight variants
- **Constitutional documents**: DEV-RULES sections that reference work unit concepts
- **Session-init document set**: Which items in the load sequence change or drop
- **Templates**: Which are installed by `arc init` in lightweight mode
- **CLI commands**: Which are available, which are hidden or guarded

The audit is downstream of the boundary decision — premature to conduct before the structural
model is settled.

## Open Questions

1. **Naming**: "ARC Lite" is a working name. Does it accurately convey what this is? Other options:
   "ARC Solo," "ARC Quick," "ARC Core+" (core + task lists). The name should suggest "same
   discipline, less ceremony" rather than "lesser version."

2. **Atomic tasks**: In full ARC, atomic companion files and ATOMIC-INBOX handle small deferred
   work. Does lightweight mode need these? Probably not the companion file (no work unit boundary),
   but ATOMIC-INBOX could still be useful for "I'll get to this later" capture.

3. **Session management weight**: Is the full session init/handoff ceremony appropriate for a
   2-hour project? The document loading is the same, but SESSION-NOTES might be overkill for
   single-session work. Maybe session handoff is only triggered if the developer is actually
   leaving and coming back?

4. **Process-task-loop adjustments**: The loop references work unit concepts (atomic companion
   files, incidental work routing to backlog). These references need conditional handling or
   lightweight alternatives.

5. **Strategy documents**: Which strategies apply in lightweight mode? Core philosophy,
   context loading, session management, quality gates — yes. Work organization, backlog
   organization, work planning — no. Task list formatting — yes. Need a clear applicability
   mapping.

6. **Where does this live architecturally?** Is it a workflow variant? A configuration layer?
   Does it need its own strategy document? Does it affect the CLI's `arc init` flow?

7. **The "feels lighter" test**: Beyond structural differences, the day-to-day experience
   must feel measurably lighter. What does session init look like? (Fewer documents to load?
   Simpler orientation?) What does "start working" look like? (Describe what you're building →
   task list → go?) What does "I'm done for now" look like? (Commit and leave? Lighter handoff?)

## Research Findings

External research conducted 2026-04-01. Key findings organized by relevance to design decisions.

### Execution discipline is scale-independent (PSP evidence)

Humphrey's Personal Software Process research demonstrates that structured execution practices —
task-level discipline, commit standards, code review at ~200 LOC/hour — reduce defect density with
statistical significance, independent of project size. TSP implementations showed 94% on-time
delivery at Microsoft India. The discipline itself drives quality, not the planning ceremony around
it. This validates the core hypothesis: execution discipline (what lightweight mode keeps) is the
high-value layer.

### Duration boundary: ~2 weeks

Research points to a natural breakpoint around project duration:

- **< 2 weeks with clear scope**: Planning pipeline overhead exceeds its value. Execution
  discipline alone is sufficient.
- **2-8 weeks**: Lightweight planning has value (optional PRD, some scope documentation).
- **> 8 weeks or high integration complexity**: Full planning pipeline justified.

### Ceremony proportionality: 15-20% threshold

Process overhead becomes counterproductive when ceremony time exceeds 15-20% of total project
time. For a 2-hour project, even 20 minutes of setup is ~17% — right at the threshold. For a
2-week project, 30 minutes of ceremony is trivial (~0.6%). This suggests lightweight mode should
target near-zero setup time.

### Graduation triggers should be signal-based

Rather than time-based thresholds, introduce planning ceremony when:

- Unplanned work emerges mid-project (scope wasn't as clear as assumed)
- Scope clarification starts consuming > 10% of available time
- Task count exceeds working memory (~3-5 concurrent concerns) without external tracking
- Multiple concurrent work streams emerge

These are more actionable than arbitrary duration cutoffs and could inform the graduation
CLI experience.

### Solo developer adoption patterns

Practitioners consistently adopt: frequent commits (traceability + recovery), feature branches
even for solo work, automated testing, structured commit messages. Practitioners consistently
abandon: planning documents, formal review ceremonies, lifecycle phases. This directly matches
the split between what lightweight mode keeps and what it drops.

### Sources

- PSP empirical studies (Humphrey; IEEE TSE)
- Crystal agile methodology variants (Cockburn — methodology scaling by team/project size)
- Lean software development (waste identification in process overhead)
- PMI project complexity research (37 complexity indicators, 23 attributes)
- Solo developer workflow practitioner surveys (2024-2025)

---
