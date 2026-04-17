# PRD: [Work Name]

**Type:** Feature | Technical
**Updated:** YYYY-MM-DD

<!-- Optional: Add pre-activation lifecycle metadata.

**State:** (e.g., Draft, Stub, Capture, Pending Dependencies, Approved — brief description)

**Related Work:** (only when State is Pending Dependencies)

- Depends on: [Dependency] — brief description
- Complete: [Resolved dependency] — brief description

Both fields are pre-activation only — removed at activation (see activate-work-unit.md
Step 4). From then on, the per-WU status file's **State:** field is the sole source of
truth for work unit lifecycle. -->

---

## Introduction

What this work is and why it matters. State the problem or opportunity — frame as a need,
not a solution. Include "why now": what makes this worth doing at this point?

## Goals

Specific objectives this work aims to achieve. Focus on outcomes, not implementation.

## User Stories or Use Cases

For features: user narratives ("As a... I want... so that...") grounded in actual user
needs or research — not hypothetical personas.

For technical work: system scenarios or migration cases that illustrate the change and
its impact.

## Requirements

Numbered list of what the solution must do. Be specific and unambiguous.

For larger scope, prioritize requirements:

- **P0 (must-have):** Required for the work to be considered complete
- **P1 (should-have):** Important but can be deferred if needed
- **P2 (nice-to-have):** Valuable if achievable within scope

## Non-Goals

What this work explicitly won't include. Critical for scope management — be specific
about what's out and why.

## Technical Considerations

*(Optional — often the core of technical PRDs; supplementary for features.)*

Constraints, dependencies, architectural implications, or integration points worth
surfacing before task generation.

## Design Considerations

*(Optional — primarily for features.)*

UI/UX requirements, mockups, component patterns, or design system constraints when
applicable.

## Success Criteria

How will you know this succeeded? Define measurable outcomes.

Features might measure user impact or adoption. Technical work might measure performance,
reliability, or developer experience improvements.

## Open Questions

Unresolved questions or areas needing further investigation. Distinguish between:

- **Resolve before starting:** Blockers that affect scope or approach
- **Resolve during work:** Questions that will be answered through implementation

## Document History

<!-- PRDs are living documents — update them as understanding evolves during planning and
implementation. Use the table below to track significant changes. Typo fixes and minor
formatting don't need entries.

When implementation completes, add a final row marking the PRD as "Implementation complete"
and note any material deviations from the original plan. The PRD then serves as a historical
record of what was planned, how it evolved, and what actually shipped. -->

| Date | Change |
| ---------- | ------ |
| YYYY-MM-DD | Initial draft |
