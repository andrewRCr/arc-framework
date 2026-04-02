# Glossary

Definitions of terms that have specific meaning within ARC. General software engineering terms
are not included unless ARC uses them in a distinctive way.

---

## *Atomic task*

An indivisible, one-off work item that doesn't need the full planning pipeline
(PRD → task list). Captured in a companion file (`atomic-*.md`) for work-unit-scoped items, or
in `ATOMIC-INBOX.md` for items to address later (requires the Planning Module —
`pm.mode: arc-in-git`). See [Work Planning § Atomic Tasks](../work-planning.md#atomic-tasks).

## *Co-development*

ARC's collaboration model: the developer and agent work together through
tight, iterative loops during implementation, not in a review-after-the-fact pattern. The
developer directs, the agent executes within bounded scope, and both contribute throughout. This
is ARC's most distinctive characteristic: the human directs, not merely reviews.
See [Philosophy § Core Commitments](../philosophy.md#core-commitments) (P2).

## *Context preservation*

The principle that work context must be recoverable across session
boundaries. Implemented through WORK-STATUS.md (tracked project state) and SESSION-NOTES.md
(personal working context), with git notes providing portability. See
[Sessions § Handoff](../how-arc-works.md#ending-a-session) (P5).

## *Convention*

A configurable practice with a sensible default (tier 2 in ARC's flexibility
model). Changing a convention keeps ARC intact. Examples: commit format, quality gate commands,
merge strategy. Contrast with *principle*. See
[Philosophy § Principles vs. Conventions](../philosophy.md#principles-vs-conventions).

## *Escape hatch*

A practice ARC doesn't formally support but doesn't block (tier 3).
Acknowledged in documentation with the tradeoff stated. Example: squash merging, which ARC
accommodates by shifting traceability to PR descriptions. See
[Philosophy § Principles vs. Conventions](../philosophy.md#principles-vs-conventions).

## *Extension point*

A preset location in an ARC workflow where teams can inject additional
steps via `arc-extensions.md`. Extensions add behavior without replacing existing steps.
Example: running a security scan after each task's quality checks. See
[Configuration § Extension Points](configuration.md#extension-points).

## *Handoff*

The structured end of a session. Captures WORK-STATUS.md and SESSION-NOTES.md so
the next session can recover context. See [Sessions § Handoff](../how-arc-works.md#ending-a-session).

## *Leave-it-cleaner*

The principle that when you encounter an issue in a file you're
modifying, you take responsibility for it. Fix it inline if small enough, or route it to a
capture surface if it would derail the current task. Issues are never silently ignored.

## *Method override*

A structured replacement in `arc-methods.md` that substitutes ARC's
default implementation for a convention with the team's alternative. The override must satisfy
the same contract as the default. Example: replacing ARC's commit format with a Jira-prefixed
format. See [Configuration § Method Overrides](configuration.md#method-overrides).

## *Planning Module*

ARC's optional in-repo project management layer, activated with
`pm.mode: arc-in-git`. Adds backlogs, roadmap, and project status tracking. See
[Work Planning § The Planning Module](../work-planning.md#the-planning-module).

## *PRD (Product Requirements Document)*

Defines *what* and *why* for a work unit. One PRD
maps to one task list. PRDs are living documents updated as understanding evolves. See
[Work Planning § PRDs](../work-planning.md#prds).

## *Principle*

A non-negotiable aspect of ARC's identity (tier 1). Removing or violating a
principle means you're not meaningfully using ARC. ARC has 11 principles (P1–P11). Contrast
with *convention*. See [Philosophy § Principles](../philosophy.md#principles).

## *Process task loop*

The workflow that governs task execution in ARC. The structured protocol
the agent follows when working through a task list. Defines the completion protocol (implement,
quality gates, mark complete, report, mandatory stop), test-first assessment, quality gate tier
escalation, deferred review, coherent unit completion, and incidental work routing. This is the
mechanical core of ARC's [co-development](#co-development) model, not guidelines the agent
interprets, but a loop with checkpoints, escalation paths, and enforced stops. See
[How ARC Works § Working Through Tasks](../how-arc-works.md#working-through-tasks).

## *Quality gate*

An automated verification checkpoint that runs at defined moments during
development. ARC uses a three-tier system: per-task (Tier 1), coherent unit (Tier 2), and
per-phase/pre-PR (Tier 3). Gate commands are project-defined; ARC provides the checkpoint
structure. See [Quality Gates](quality-gates.md).

## *Review increment*

A single task (checkbox) in a task list — the unit of work between human
review points. The agent implements one review increment, runs quality gates, reports the result,
and stops for the developer's review before proceeding. This is the mechanism that implements
co-development at execution time: small enough for meaningful review, large
enough for productive autonomy. See
[How ARC Works § Working Through Tasks](../how-arc-works.md#working-through-tasks).

## *Session*

A bounded, intentional period of work. Starts with structured initialization
(context loading), proceeds through focused work, and ends with handoff (state preservation).
Sessions are designed to be shorter and more focused than the context window allows; quality
degrades with length. See [Sessions](../how-arc-works.md).

## *Skill*

An [open standard format](https://agentskills.io) for giving agents new capabilities.
ARC packages its user-facing workflows as Skills — each is a user-invoked entry point for a key
operational workflow. The agent's other workflows load automatically as part of the ARC
instruction chain. See [Skills Reference](skills.md).

## *Task list*

The execution layer of a work unit. Contains phased tasks, each representing
one review increment. Task entries are updated with outcomes as work completes. See
[Work Planning § Task Lists](../work-planning.md#task-lists).

## *Work unit*

A bounded piece of planned work: a branch, a PRD, and a task list. Work units
categorize as feature, technical, or incidental. They move through a lifecycle: active →
archive (with the Planning Module — `pm.mode: arc-in-git` — work units also have a backlog
stage before activation). See
[Work Planning § Work Organization](../work-planning.md#work-organization).
