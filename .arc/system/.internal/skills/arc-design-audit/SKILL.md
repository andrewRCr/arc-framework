---
name: arc-design-audit
description: "Re-validate a finished draft or spec for efficacy, fit, and material proportionality when the user requests an ad-hoc design audit; do not use on unfinished drafts or mutate the design."
disable-model-invocation: false
---

# ARC Design Audit

Standalone door to the [`design-audit`][design-audit-method] and
[`assess-design-proportionality`][proportionality-method] methods — re-validate a **design** (not the artifact that
records it) outside the planning ceremonies that run the rubrics automatically. Read-only — no edits. The user
decides when an audit is worth its cost; never invoke this proactively.

**When this door earns its use** — the between-ceremony moments no workflow fire-point covers:

- **A design whose world may have moved.** A parked or backlog design authored a while ago — sibling work has
  shipped, dependencies have shifted, and the question is whether its efficacy and fit still hold.
- **A groomed draft before promotion.** An ad-hoc "is this design actually right?" check during grooming, ahead
  of any formalization gate.
- **A reopened design question.** A self-review or spec pass surfaced a finding that _reopens design_ — this
  rubric is that route's destination for re-validating the reopened decision.
- **Mid-impl escalation (rare).** Implementation evidence suggests the _design_ — not the task — is wrong.
  Task-level drift and re-grounding belong to the `arc-task-audit` door; reach here only when a confirmed finding
  implicates the design itself. Specificity picks the door, never confidence: a finding you can already point at
  skips this rubric and enters [`amend-design`][amend-design] directly, and a finding this audit verifies routes
  onward to that same gate.

This door is **not** a pre-task ritual: pausing to re-ground a task-as-written before implementation is
`arc-task-audit`'s role, not this one.

**Caller inputs:**

- **design** — the artifact carrying the design under audit: a finished draft, or a spec (plus its upstream
  draft when one exists). Pass it as `design` to `design-audit` and `candidate` to
  `assess-design-proportionality`. The door is floored at a finished draft.
- **goal-referents** (optional) — where the goal lives when the artifact doesn't fully carry it. Defaults to the
  artifact's own problem / goal statement; use it as the proportionality `problem`.
- **substrate-referents** (optional) — key existing surfaces relevant to material composition. Otherwise let the
  proportionality method discover them narrowly from the problem and candidate.

**Dispatch.** Load and run both public methods with the mapped inputs above. Report their combined recommendations
through `design-audit`'s three severity levels — a standalone run has no exit gate; the user decides what resolves
before the design is relied on.

[design-audit-method]: ../../../methods/design-audit.md
[proportionality-method]: ../../../methods/assess-design-proportionality.md
[amend-design]: ../../../workflows/arc/supplemental/amend-design.md
