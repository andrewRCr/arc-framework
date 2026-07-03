---
name: arc-task-audit
description: "Pre-implementation audit: surfaces assumptions, design decisions, scope gaps, and codebase drift."
disable-model-invocation: false
---

# ARC Task Audit

Standalone door to the [`task-audit` method][task-audit-method] — audit tasks-as-written against the codebase
they will execute in. Read-only — no edits, no implementation. The task loop may suggest this door when an audit
would earn its cost; run it only after an explicit user request or approval, never as an automatic task-start step.

**When this door earns a suggestion or explicit request:**

- **Pre-implementation pause.** Before a new phase or task, explicitly re-ground the task-as-written before
  implementation — surface assumptions, masked decisions, and scope gaps while they are still cheap to fix.
- **Mid-impl reground.** Work drift has occurred — the codebase moved under the task list (parallel work landed,
  earlier tasks reshaped the surface), and the remaining tasks need re-validation against current reality before
  proceeding.

A finding that implicates the *design* rather than a task routes onward to the `arc-design-audit` door — this
audit checks tasks against code, not the design against its goal.

**Two caller inputs:**

- **scope** — which tasks to audit: a single task, a range, a phase, or the full task list.
- **depth** — `full` (default): grounding plus the eight-category analysis; `grounding-only`: the grounding
  floor alone. Absent an explicit depth, audit at `full`.

**Context resolution.** When the active task list isn't already known in-session, resolve it from the active
work unit's `meta-{name}.md` (its `**Task List:**` field), then read the sections the scope selects — the
method's scope-reading rules cover neighbor and adjacent-phase context.

**Dispatch.** Load and run `.arc/system/methods/task-audit.md` at the resolved scope and depth. Report the
method's structured findings with its native two-tier disposition — **Fix before starting** / **Carry as
context** — and give carry-as-context findings a durable home per the method before closing the audit.

[task-audit-method]: ../../../methods/task-audit.md
