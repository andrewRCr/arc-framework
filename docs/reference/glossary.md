# Glossary

Definitions of terms that have specific meaning within ARC. General software engineering terms
are not included unless ARC uses them in a distinctive way.

---

## _Atomic task_

An indivisible, one-off work item that doesn't need the full planning pipeline
(PRD → task list). Captured in a companion file (`atomic-*.md`) for work-unit-scoped items, or
in `ATOMIC-INBOX.md` for items to address later (requires the Planning Module —
`pm.mode: arc-in-git`). See [Work Planning § Atomic Tasks](../work-planning.md#atomic-tasks).

## _Co-development_

ARC's collaboration model: the developer and agent work together through
tight, iterative loops during implementation, not in a review-after-the-fact pattern. The
developer directs, the agent executes within bounded scope, and both contribute throughout. This
is ARC's most distinctive characteristic: the human directs, not merely reviews.
See [Philosophy § Core Commitments](../methodology/rationale.md#core-commitments) (P2).

## _Context preservation_

The principle that work context must be recoverable across session
boundaries. Implemented through WORK-STATUS.md (tracked project state) and SESSION-NOTES.md
(personal working context), with git notes providing portability. See
[Sessions § Handoff](../the-framework.md#ending-a-session) (P5).

## _Convention_

A configurable practice with a sensible default (tier 2 in ARC's flexibility
model). Changing a convention keeps ARC intact. Examples: commit format, quality gate commands,
merge strategy. Contrast with _principle_. See
[Philosophy § Principles vs. Conventions](../methodology/rationale.md#principles-vs-conventions).

## _Escape hatch_

A practice ARC doesn't formally support but doesn't block (tier 3).
Acknowledged in documentation with the tradeoff stated. Example: squash merging, which ARC
accommodates by shifting traceability to PR descriptions. See
[Philosophy § Principles vs. Conventions](../methodology/rationale.md#principles-vs-conventions).

## _Extension point_

A preset location in an ARC workflow where teams can inject additional
steps via `arc-extensions.md`. Extensions add behavior without replacing existing steps.
Example: running a security scan after each task's quality checks. See
[Methods & Extensions § Extension Points](../customization/methods.md#extension-points).

## _Handoff_

The structured end of a session. Captures WORK-STATUS.md and SESSION-NOTES.md so
the next session can recover context. See [Sessions § Handoff](../the-framework.md#ending-a-session).

## _Leave-it-cleaner_

The principle that when you encounter an issue in a file you're
modifying, you take responsibility for it. Fix it inline if small enough, or route it to a
capture surface if it would derail the current task. Issues are never silently ignored. See
[How ARC Works § Working Through Tasks](../the-framework.md#working-through-tasks) (P4).

## _Method override_

A structured replacement in `arc-methods.md` that substitutes ARC's
default implementation for a convention with the team's alternative. The override must satisfy
the same contract as the default. Example: replacing ARC's commit format with a Jira-prefixed
format. See [Methods & Extensions § Method Overrides](../customization/methods.md#method-overrides).

## _Planning Module_

ARC's optional in-repo project management layer, activated with
`pm.mode: arc-in-git`. Adds backlogs, roadmap, and project status tracking. See
[Work Planning § The Planning Module](../work-planning.md#the-planning-module).

## _PRD (Product Requirements Document)_

Defines _what_ and _why_ for a work unit. One PRD
maps to one task list. PRDs are living documents updated as understanding evolves. See
[Work Planning § PRDs](../work-planning.md#prds).

## _Principle_

A non-negotiable aspect of ARC's identity (tier 1). Removing or violating a
principle means you're not meaningfully using ARC. ARC has 11 principles (P1–P11). Contrast
with _convention_. See [Philosophy § Principles](../methodology/rationale.md#principles).

## _Process task loop_

The workflow that governs task execution in ARC. The structured protocol
the agent follows when working through a task list. Defines the completion protocol (implement,
quality gates, mark complete, report, mandatory stop), test-first assessment, quality gate tier
escalation, deferred review, coherent unit completion, and incidental work routing. This is the
mechanical core of ARC's [co-development](#co-development) model, not guidelines the agent
interprets, but a loop with checkpoints, escalation paths, and enforced stops. See
[How ARC Works § Working Through Tasks](../the-framework.md#working-through-tasks).

## _Quality gate_

An automated verification checkpoint that runs at defined moments during
development. ARC uses a three-tier system: per-task (Tier 1), coherent unit (Tier 2), and
per-phase/pre-PR (Tier 3). Gate commands are project-defined; ARC provides the checkpoint
structure. See [Quality Gates](quality-gates.md).

## _Review increment_

A single task (checkbox) in a task list — the unit of work between human
review points. The agent implements one review increment, runs quality gates, reports the result,
and stops for the developer's review before proceeding. This is the mechanism that implements
co-development at execution time: small enough for meaningful review, large
enough for productive autonomy. See
[How ARC Works § Working Through Tasks](../the-framework.md#working-through-tasks).

## _Session_

A bounded, intentional period of work. Starts with structured initialization
(context loading), proceeds through focused work, and ends with handoff (state preservation).
Sessions are designed to be shorter and more focused than the context window allows; quality
degrades with length. See [Sessions](../the-framework.md).

## _Skill_

An [open standard format](https://agentskills.io) for giving agents new capabilities.
ARC packages its user-facing workflows as Skills — each is a user-invoked entry point for a key
operational workflow. The agent's other workflows load automatically as part of the ARC
instruction chain. See [Skills Reference](skills.md).

## _Task list_

The execution layer of a work unit. Contains phased tasks, each representing
one review increment. Task entries are updated with outcomes as work completes. See
[Work Planning § Task Lists](../work-planning.md#task-lists).

## _Stacked branch_

A branch created on top of another feature branch rather than from the base branch. Used for
incremental delivery within a work unit (each branch becomes a reviewable PR) or for incidental
work units that must resolve before the parent work can continue. See
[Work Organization § Branching Model](work-organization.md#branching-model) and
[Team Coordination § Branching Patterns](team-coordination.md#branching-patterns).

## _Work unit_

A bounded piece of planned work: a branch, a PRD, and a task list. Work units
categorize as feature, technical, or incidental. They move through a managed lifecycle —
planning, activation, execution, verification, integration, and archival (with the Planning
Module, work units also have a backlog stage before activation). See
[Work Planning § Work Organization](../work-planning.md#work-organization).
