---
name: arc-design-audit
description: "Ad-hoc design re-validation: efficacy (does the design solve the goal) and fit (optimal + forward-compatible) on a finished draft or spec."
disable-model-invocation: false
---

# ARC Design Audit

Standalone door to the [`design-audit` method][design-audit-method] — re-validate a **design** (not the artifact
that records it) outside the planning ceremonies that run the rubric automatically. Read-only — no edits. The
user decides when an audit is worth its cost; never invoke this proactively.

**When this door earns its use** — the between-ceremony moments no workflow fire-point covers:

- **A design whose world may have moved.** A parked or backlog design authored a while ago — sibling work has
  shipped, dependencies have shifted, and the question is whether its efficacy and fit still hold.
- **A groomed draft before promotion.** An ad-hoc "is this design actually right?" check during grooming, ahead
  of any formalization gate.
- **A reopened design question.** A self-review or spec pass surfaced a finding that *reopens design* — this
  rubric is that route's destination for re-validating the reopened decision.
- **Mid-impl escalation (rare).** Implementation evidence suggests the *design* — not the task — is wrong.
  Task-level drift and re-grounding belong to the `arc-task-audit` door; reach here only when a confirmed finding
  implicates the design itself.

This door is **not** a pre-task ritual: pausing to re-ground a task-as-written before implementation is
`arc-task-audit`'s role, not this one.

**Two caller inputs:**

- **design** — the artifact carrying the design under audit: a finished draft, or a spec (plus its upstream
  draft when one exists). The rubric is floored at a finished draft.
- **goal-referents** (optional) — where the goal lives when the artifact doesn't fully carry it. Defaults to the
  artifact's own problem / goal statement.

**Dispatch.** Load and run `.arc/system/methods/design-audit.md` with the inputs above. Report findings at the
method's three severity levels as recommendations — a standalone run has no exit gate; the user decides what
resolves before the design is relied on.

[design-audit-method]: ../../../methods/design-audit.md
