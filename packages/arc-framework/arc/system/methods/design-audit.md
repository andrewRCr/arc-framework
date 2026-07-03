---
name: design-audit
description: Rubric method validating a design — efficacy (solves the goal) and fit (optimal + forward-compatible).
override-active: false
---

# Method: design-audit

> - **Workflow:** [draft-design.md][draft-design], [create-spec.md][create-spec]
> - **When:** A planning boundary validates a settled design — draft readiness or spec finalization, where the
>   `adversarial-review` mechanism runs this rubric — or an ad-hoc standalone re-check re-validates a design whose
>   world may have moved, via the [`arc-design-audit` door][arc-design-audit-skill].
>
> - **Signature:** `design-audit(design, goal-referents?) → findings`
> - **Contract:** Given a design at or above the finished-draft floor, validate the design itself against two
>   lenses — **efficacy** (does it solve the goal) and **fit** (optimal and forward-compatible, not merely
>   non-conflicting). Read-only, standalone + optional: findings are advisory recommendations and never a gate by
>   themselves.

## design-audit.override

[No override configured]

## design-audit.default

`design-audit` validates the **design** — the settled decisions themselves — not the artifact that records them.
On the derivation chain intent → design → tasks → code, it audits the first link the way `task-audit` audits the
last: each checks a derived thing against the referent it was derived from.

**Named inputs:**

| Input            | Kind     | Contents                                                                                                                                                                     |
|------------------|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `design`         | required | The artifact carrying the design under audit — a finished draft, or a spec plus its upstream draft when one exists.                                                          |
| `goal-referents` | optional | Where the goal lives when the artifact doesn't fully carry it — a PRD section, an origin issue, a stated objective. Defaults to the artifact's own problem / goal statement. |

**Floor and audit points.** The rubric is floored at a **finished draft**: an unfinished draft has no settled
design to validate — sharpening one is the drafting loop's job, not an audit's. Above the floor it is
point-agnostic; what changes per point is the question the same two lenses answer:

- **draft** — before formalization: is the settled design worth formalizing?
- **spec** — at or after finalization: does the formalized design still hold as written?
- **post-task-gen** — after decomposition: did task generation surface anything that undermines the design?
- **mid-impl** — the escalation point: implementation evidence suggests the *design*, not the task, is wrong.
  Task-level drift belongs to `task-audit`; reach for this rubric when a confirmed finding reopens design.

**Efficacy — does the design solve the goal?**

- **Goal coverage.** Every stated goal is achieved by some mechanism the design actually contains; nothing
  load-bearing is left as "figure out later."
- **Mechanism validity.** Walk the causal chain: the designed mechanism, as specified, produces the claimed
  outcome — not merely a plausible-sounding gesture at it.
- **Load-bearing assumptions.** The assumptions the design stands on are stated and plausible; identify what
  breaks if each is wrong.
- **Failure modes.** Known failure and edge conditions are addressed or consciously accepted — silence is a
  finding, a recorded acceptance is not.

**Fit — optimal and forward-compatible, not merely non-conflicting?**

A design that merely avoids conflict with its surroundings has not yet demonstrated fit. The bar is higher:

- **Optimality.** Among the reasonable alternatives, is this the right design — would two competent engineers,
  given the same constraints, build materially the same thing? Complexity should be proportional to the problem.
- **System coherence.** The design composes with the existing architecture, conventions, and adjacent designs
  rather than sitting beside them.
- **Forward compatibility.** The design survives known upcoming directions — it does not bake in an assumption
  that an already-visible change will break.

### Relationship to `spec-review`

The two methods divide labor along the artifact/design line and compose rather than overlap:

- [`spec-review`][spec-review] verifies the **artifact** — the just-written spec is coherent, complete, and its
  concrete references are real. It deliberately disclaims re-litigating the design.
- `design-audit` validates the **design** — the thing self-review disclaims. When a `spec-review` pass surfaces a
  finding that *reopens design* (a masked decision, an unsettled fundamental), this rubric is that route's
  destination: the reopened question is re-validated here, never papered over in the artifact.

Run `spec-review` to certify the record; run `design-audit` to certify the decisions it records. Neither subsumes
the other.

### Severity interpretation

Through the `adversarial-review` mechanism, findings map into the fixed `blocker` / `major` / `minor` enum the
[severity model][adversarial-review] owns — the rubric maps *into* the enum and never extends it. What each level
looks like for a design:

- **`blocker`** — an efficacy break: the design as settled does not achieve a stated goal (a missing mechanism, a
  causal chain that doesn't produce the outcome, a false load-bearing assumption), or an unsettled fundamental
  presented as settled — a masked decision the downstream stage would inherit.
- **`major`** — a substantive fit or partial-efficacy problem that should resolve: a materially better
  composition at comparable cost, a known forward direction the design breaks, an unhandled failure mode short of
  goal-breaking, a load-bearing assumption stated but unverifiable from the material given.
- **`minor`** — optimality residue: a defensible-but-unargued choice, rationale wording and coherence, an
  alternative worth recording without materiality.

Severity is the reviewer's materiality claim; disposition stays the primary's, assigned at verification. In a
standalone door run there is no exit gate reading the enum — findings land at the same three levels as
recommendations, and the user decides what resolves before the design is relied on.

**Posture.** Read-only: the audit never edits the artifact. Standalone + optional: running it is always a
recommendation, never a required stage. A confirmed efficacy or fit break routes back into the design loop —
draft or spec grooming — not around it via downstream patches.

---

[draft-design]: ../workflows/arc/draft-design.md
[create-spec]: ../workflows/arc/create-spec.md
[spec-review]: spec-review.md
[adversarial-review]: adversarial-review.md
[arc-design-audit-skill]: ../.internal/skills/arc-design-audit/SKILL.md
