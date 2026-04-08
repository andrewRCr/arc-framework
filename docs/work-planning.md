# Work Planning

ARC structures work through a pipeline that takes ideas from initial exploration through to
structured execution. Each stage has a purpose and an appropriate level of formality. Earlier
stages are deliberately lighter than later ones.

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

Plan documents (`plan-*.md`, in `.arc/backlog/` with the Planning Module or `.arc/active/`
otherwise) are freeform exploration artifacts: working documents where ideas,
research, alternatives, and evolving understanding are captured. They're temporal scratchpads, not
permanent records. Expect messiness, dead ends, and revisions.

A plan is ready to become a PRD when the problem is clear, alternatives have been considered, key
unknowns are identified, and scope is bounded enough to write requirements against. Plans are
deleted after the PRD is written — they've served their purpose.

### PRDs

Product Requirements Documents define _what_ and _why_; task lists define _how_. One PRD maps to one
work unit (a branch and task list). PRDs are living documents, updated as understanding evolves during
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

Task lists are the execution layer. Each task is a bounded
_[review increment](reference/glossary.md#review-increment)_ — a single chunk of work the agent
executes autonomously before stopping for the developer's review. One task, one review — this is the
mechanism that implements [co-development](reference/glossary.md#co-development) at execution time.
Here's what task entries look like during and after execution:

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

For the full task execution model — how the agent works through tasks, quality gates, and review
stops — see [How ARC Works](the-framework.md#working-through-tasks). Before starting tasks where
you want extra confidence — tasks written in a prior session, tasks touching unfamiliar code, or
tasks with complex dependencies — the [arc-task-audit](reference/skills.md#arc-task-audit) skill
runs a pre-implementation analysis to surface drift, hidden assumptions, and scope ambiguity.

## Work Organization

ARC categorizes work by **type and planning status**, not size, eliminating subjective sizing
debates and applying the right workflow to each kind of work.

**Planned work** gets the full pipeline (PRD, task list, dedicated branch):

- **Feature** (`feature/*`): user-visible capabilities from the product vision. New functionality,
  significant enhancements, anything that changes what users can do.
- **Technical** (`technical/*`): infrastructure improvements. Refactoring, performance, testing
  infrastructure, CI/CD, developer tooling. Work that makes the codebase better without changing
  user-facing behavior.

**Incidental work units** (`incidental/*`) are the exception you hope you don't need. Sometimes,
mid-implementation, you discover a multi-phase blocker that wasn't on the roadmap: a dependency you
didn't know existed, a foundational issue that must be resolved before the current work can continue.
When that happens, the current work unit parks, an incidental task list and stacked branch are
created, and the incidental work goes through the same lifecycle (execution, verification,
integration) before the original work resumes. Incidental work units get task lists but not PRDs;
they're reactive, not planned from a product vision. Ideally they're rare; the workflow exists for
when they're unavoidable.

This is distinct from small discovered issues (a type error, a missing test, a documentation
gap), which are handled as inline fixes or [atomic tasks](#atomic-tasks), not work units. For the
decision guide (how to categorize edge cases) and common pitfalls, see the
[Work Organization reference](reference/work-organization.md).

Branch naming, directory structure, and archive paths all align:
`feature/user-authentication` → `.arc/active/feature/` → `.arc/reference/archive/`.

### Work unit lifecycle

Each work unit moves through a managed lifecycle:

1. **Planning** — explore the problem, write a PRD, generate a task list
2. **Activation** — move artifacts from backlog to active, create the implementation branch
3. **Execution** — work through tasks via the
   [task execution model](the-framework.md#working-through-tasks)
4. **Verification** — final quality gates, success criteria validation
5. **Integration** — pre-merge review, PR, merge
6. **Archival** — completed artifacts move to the archive for historical reference

ARC provides workflows for each transition. The level of ceremony scales with your
[branch protection mode](customization/configuration.md#branch-model). `partial` (default) keeps it
lightweight for solo developers and small teams; `full` requires branches and PR review for all
changes.

### The Planning Module

ARC's core methodology (PRDs, task lists, execution workflows, session management, commit
discipline) works in any project regardless of how you manage planning. An optional Planning Module
adds in-repo planning infrastructure:

- **Backlogs**: bucket files (`BACKLOG-FEATURE.md`, `BACKLOG-TECHNICAL.md`) that capture and triage
  ideas before they enter the pipeline
- **Roadmap**: high-level sequencing of planned work
- **Project status**: current state summary

This is activated by selecting `arc-in-git` (ARC Core + Planning Module) during `arc init` (or
switching later with `arc init --reconfigure`).

#### When it fits

The Planning Module is designed for solo developers and small teams where keeping everything in
git is a simplicity win — no external tools to maintain, no context-switching, and the agent can
read and reason about your backlog and roadmap directly.

**Ideal for:**

- **Solo development** — no concurrency concerns, backlog always current, zero tool overhead
- **Small teams (2-3)** integrating regularly — occasional merge conflicts in backlog files are
  trivial, backlog stays roughly current across branches

**Works with awareness:**

- **Medium teams (4-6)** with short-lived branches. Backlog files may lag behind in-flight work
  between integrations. The personal inbox (`ATOMIC-INBOX.md`) absorbs captures during branch
  work; items promote to backlog at integration boundaries. Expect occasional merge conflicts in
  bucket files — manageable if branches integrate often.

**The scaling boundary** is a function of team size, branch lifetime, and integration frequency —
not a hard headcount threshold. The backlog surface (bucket files, roadmap, project status) is
tracked in git on the base branch. When multiple developers capture work from concurrent feature
branches, those edits only converge at merge time. Teams that integrate often stay current; teams
with long-lived branches experience growing staleness and merge friction.

When the global backlog needs to be live, shared, and branch-independent — typically larger teams
or teams with longer branch lifetimes — an external tracker is the right tool. ARC's
`pm.mode: external` provides a structured integration path for exactly this (see below).

#### With external trackers (`external`)

Teams using Jira, Linear, GitHub Issues, or similar select `external` (ARC Core + External
Tracker) during init. ARC still expects local, in-repo task lists for execution; these are the
review increments the developer-agent pair works through. The external tracker handles assignment,
status, and sprint-level coordination; ARC task lists handle the execution-level decomposition.
Extension points (`post-task-completion`, `post-work-unit-activate`, `post-work-unit-archive`)
provide hooks for syncing status between the two.

#### Without either (`none`)

`none` (ARC Core) alone provides the complete methodology engine. You manage planning however you
like — PRDs and task lists are still created as part of ARC's execution workflow, but there's no
backlog, roadmap, or project status tracking in-repo.

## Atomic Tasks

Not all work needs the full pipeline. Atomic tasks are indivisible, one-off items: a fix discovered
during other work, a small improvement, a documentation correction. They're captured rather than
planned:

- **Work-unit-scoped**: tracked in a companion file (`atomic-*.md`) alongside the task list, for
  items to address during the current work unit
- **Personal inbox**: tracked in `ATOMIC-INBOX.md` in the developer's user directory, for items to
  address later. Gitignored and branch-agnostic. Available with the Planning Module
  (`pm.mode: arc-in-git`).

The key principle: when you discover something that needs fixing, capture it. Don't ignore it and
don't let it derail the current task. Small enough to fix inline? Fix it. Too large or out of scope?
Route it to the appropriate capture surface so it doesn't get lost.

??? info "Why two capture surfaces? (Planning Module)"

    With the Planning Module (`pm.mode: arc-in-git`), the distinguishing question between the
    companion file and ATOMIC-INBOX is **lifecycle intent**, not domain. "Will I do this during
    the current work unit?" → companion file (branch-scoped, archives with the work unit). "Is
    this for later?" → ATOMIC-INBOX (personal, gitignored, branch-agnostic — persists across
    branch switches and work unit boundaries).

    The inbox is especially valuable in team contexts, where you can't edit tracked backlog files
    from a feature branch. Items that grow beyond atomic scope promote from the inbox to the
    appropriate backlog file.
