# Spec (`detailed` · `PRD`): {wu-name}

- **Origin:** {`[internal]` default; external tracker URL when applicable.}

- **Purpose:** {One- to three-line north-star summary of the WU's intent. Single sentence preferred; keep it
  bounded so the core thesis stays visible at a glance. Distilled "what + why," not framing prose — body
  sections carry the full context.}

---

{The ceiling form for **product / requirements** derivation — where the open question is _what should this do_.
(When the open question is instead _what's the right technical design_, use the `RFC` subtype.) The
full-derivation spec: numbered requirements and concrete, validated success criteria.}

<!--
  Paired-spec mode — when this PRD is authored alongside a technical design spec (`spec-{name}-rfc.md`), the
  PRD stays upstream: it keeps the shared spine (Introduction / Goals / Non-Goals) and the product
  requirements, and the companion RFC references it for the technical design. Sections flagged
  `omit-when-paired` below move entirely to the RFC. create-spec sets paired vs. standalone and strips these
  scaffolding markers (the heading flags and these comments do not belong in a finalized spec).
-->

## Introduction

What this work is and why it matters. State the problem or opportunity — frame as a need, not a solution.
Include "why now": what makes this worth doing at this point?

## Goals

Specific objectives this work aims to achieve. Focus on outcomes, not implementation.

## User Stories or Use Cases

User narratives ("As a… I want… so that…") grounded in actual user needs or research — not hypothetical
personas.

## Requirements

Numbered list of what the solution must do. Be specific and unambiguous — this is the enumerable substrate the
task list is built from and validated against.

For larger scope, prioritize:

- **P0 (must-have):** Required for the work to be considered complete
- **P1 (should-have):** Important but can be deferred if needed
- **P2 (nice-to-have):** Valuable if achievable within scope

## Non-Goals

What this work explicitly won't include. Critical for scope management — be specific about what's out and why.

## Technical Considerations · `optional | omit-when-paired`

<!-- Optional when standalone; omit section when spec is paired: the companion RFC carries the technical design. -->

Constraints, dependencies, and integration points that **bound** the downstream design — not the design itself.
When the technical design _is_ the hard part (the open question is _how_, not _what_), that's an `RFC`, not a
subsection here.

## Design Considerations · `optional`

UI/UX requirements, mockups, component patterns, or design-system constraints when applicable.

## Success Criteria

How will you know this succeeded? Define measurable outcomes — concrete checks validated explicitly at work-unit
completion, not aspirations.

## Open Questions

Unresolved questions or areas needing further investigation. Distinguish:

- **Resolve before starting:** Blockers that affect scope or approach
- **Resolve during work:** Questions answered through implementation
