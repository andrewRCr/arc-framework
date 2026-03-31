# Work Planning

ARC structures work through a pipeline that takes ideas from initial exploration through to
structured execution. Each stage has a purpose and an appropriate level of formality — earlier stages
are deliberately lighter than later ones.

## The Planning Pipeline

```text
Idea                →  plan-*.md         →  PRD              →  Task list
(problem identified)   (exploration)        (requirements)      (execution)

Fidelity:  Low         Working draft        Structured          Detailed
Structure: Informal    Freeform             Template-based      Workflow-governed
```

Not every piece of work needs every stage. Small, well-understood work can skip exploration and go
directly to a PRD. The plan stage exists for work that benefits from exploration before requirements
crystallize.

### Plan documents

Plan documents (`plan-*.md`) are freeform exploration artifacts — working documents where ideas,
research, alternatives, and evolving understanding are captured. They're temporal scratchpads, not
permanent records. Expect messiness, dead ends, and revisions.

A plan is ready to become a PRD when the problem is clear, alternatives have been considered, key
unknowns are identified, and scope is bounded enough to write requirements against. Plans are
deleted after the PRD is written — they've served their purpose.

### PRDs

Product Requirements Documents define *what* and *why*; task lists define *how*. One PRD maps to one
work unit — a branch and task list. PRDs are living documents updated as understanding evolves during
implementation, but changes are intentional, not scope creep.

A PRD for a todo app feature might start like this:

```markdown
# PRD: Todo App — Recurring Tasks

**Branch:** `feature/recurring-tasks`
**Created:** 2026-04-01
**Status:** Active

## Problem Statement

Users create the same tasks repeatedly (weekly reports, daily standups).
There's no way to automate recurring task creation.

## Will Do

- Recurrence rules (daily, weekly, monthly, custom cron)
- Auto-creation of next instance when current is completed
- Recurrence editing and cancellation

## Won't Do

- Calendar integration (future work unit)
- Recurring task templates (YAGNI until usage patterns emerge)
```

### Task lists

Task lists are the execution layer. Each task is a bounded *review increment* — a single chunk of
work the agent executes autonomously before stopping for the developer's review. One task, one
review — this is the mechanism that implements co-development at execution time. Here's what task
entries look like during and after execution:

```markdown
### **Phase 1:** Data Model and API

- [x] **1.1 Add recurrence fields to the task schema**
    - Added `recurrence_rule` (nullable string, cron format) and
      `recurrence_parent_id` (self-referential FK) to the tasks table
    - Migration tested against existing data (0 conflicts)

- [x] **1.2 Create recurrence service**
    - `RecurrenceService.createNext(task)` — clones task with next due date
    - Cron parsing via `cron-parser` (already in deps)

- [ ] **1.3 Wire recurrence into task completion endpoint**

- [ ] **1.4 Add API endpoints for recurrence management**
```

Completed tasks (`[x]`) are updated to reflect what was actually done — outcomes, not the original
plan. Incomplete tasks (`[ ]`) retain their original specification.

## How Tasks Execute

ARC's task execution model implements [co-development](philosophy.md#core-commitments): the developer
and agent collaborate through tight, iterative loops during work, not in a review-after-the-fact
model.

**The cycle for each task:**

1. The agent implements the task
2. Quality gates run on modified files (incremental, Tier 1)
3. The task is marked complete in the task list with updated description
4. The agent reports what was done
5. **Mandatory stop** — the agent waits for the developer's review

The developer reviews, contributes context, and approves before the next task begins. This isn't a
formality — the developer is present during execution, steering direction and catching issues while
the work is happening. When the developer approves, the agent proceeds to the next task.

**Deferred review** is available when the developer explicitly specifies a range of tasks for
continuation (e.g., "work through tasks 5.2–5.4 while I'm away"). Quality gates still run after
each task, but the agent continues without waiting. The developer defines the scope — the agent never
self-invokes deferred review.

### Test-first assessment

Before implementing any task, the agent assesses whether tests should be written first. ARC ships a
decision tree: test-first for new models, endpoints, business logic, and complex transformations;
test-after acceptable for simple CRUD, configuration changes, and trivial refactoring. When
test-first applies, execution follows vertical slices — one test, make it pass, then the next.

## Quality Gates

Quality gates are automated verification that runs at defined checkpoints. The
[principle](philosophy.md#operational-discipline) is that quality is verified, not assumed. The
specific gates, tools, and strictness levels are project-defined conventions.

**Tiered approach:**

- **Tier 1 (per-task)** — incremental checks on modified files. Runs after every task completion.
  Fast feedback on the work just done.
- **Tier 2 (coherent unit)** — full-project Tier 1 plus targeted integration and build checks. Runs
  when a logical group of tasks completes (e.g., all subtasks under a parent).
- **Tier 3 (phase/pre-PR)** — all checks, all configurations, full test suite, build verification.
  Runs at phase completion and before pull requests.

Quality gate commands are defined per-project in your development rules. ARC provides the checkpoint
structure; you provide the commands.

## Work Organization

Work categorizes into three types, each with a branch:

- **Feature** (`feature/*`) — new capabilities or significant enhancements
- **Technical** (`technical/*`) — refactoring, infrastructure, debt reduction
- **Incidental** (`incidental/*`) — discovered work that doesn't fit the current task list

### The Planning Module

ARC's core methodology — PRDs, task lists, execution workflows, session management, commit
discipline — works in any project regardless of how you manage planning. An optional Planning Module
adds in-repo planning infrastructure:

- **Backlogs** — bucket files (`BACKLOG-FEATURE.md`, `BACKLOG-TECHNICAL.md`) that capture and triage
  ideas before they enter the pipeline
- **Roadmap** — high-level sequencing of planned work
- **Project status** — current state summary

This is activated by selecting `ARC Core + Planning Module` during `arc init` (or switching later
with `arc init --reconfigure`).

**When to use it:** The Planning Module works well for solo developers and small teams — everything
lives in git alongside your code, no external tooling to maintain, and the agent can read and reason
about your backlog and roadmap directly. For larger teams, in-git backlog files become a concurrency
bottleneck (multiple developers editing the same markdown files), and you'll likely want an external
tracker instead.

**With external trackers:** Teams using Jira, Linear, GitHub Issues, or similar select
`ARC Core + External Tracker` during init. ARC still expects local, in-repo task lists for
execution — these are the review increments the developer-agent pair works through. The external
tracker handles assignment, status, and sprint-level coordination; ARC task lists handle the
execution-level decomposition. Extension points (`post-task-completion`, `post-work-unit-activate`,
`post-work-unit-archive`) provide hooks for syncing status between the two.

**Without either:** `ARC Core` alone provides the complete methodology engine. You manage planning
however you like — PRDs and task lists are still created as part of ARC's execution workflow, but
there's no backlog, roadmap, or project status tracking in-repo.

## Atomic Tasks

Not all work needs the full pipeline. Atomic tasks are indivisible, one-off items — a fix discovered
during other work, a small improvement, a documentation correction. They're captured rather than
planned:

- **Work-unit-scoped** — tracked in a companion file (`atomic-*.md`) alongside the task list, for
  items to address during the current work unit
- **Personal inbox** — tracked in `ATOMIC-INBOX.md` in the developer's user directory, for items to
  address later. Gitignored and branch-agnostic. Available with the Planning Module
  (`pm.mode: arc-in-git`).

The key principle: when you discover something that needs fixing, capture it — don't ignore it and
don't let it derail the current task. Small enough to fix inline? Fix it. Too large or out of scope?
Route it to the appropriate capture surface so it doesn't get lost.
