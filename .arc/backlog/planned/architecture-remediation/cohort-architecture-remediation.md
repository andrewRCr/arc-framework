# Cohort: `architecture-remediation`

> Cohort-level record for the architecture-remediation theme — a backlog grouping of independent structural /
> code-quality tech-debt work units. Unlike a coordinating cohort, these members share a _theme_ (remediating
> ARC's CLI and codebase structure), not a single design, shared contracts, or cross-member sequencing.
> Internal-dev-facing; not shipped. Each member's design lives in its own draft; this record exists to satisfy
> the grouping-dir cohort-doc convention and to state, plainly, that the members are independent.

**Parent:** [none]

**Purpose:** Group ARC's structural and code-quality remediation work units for backlog legibility. The shared
concern is _theme_, not coordination: each member remediates a distinct tech-debt surface (CLI test hardening,
lib-layer type extraction, sync-handler decomposition, user-sync module split, schema-introspection layering,
pre-commit check-ID stabilization) and plans, builds, and ships independently.

---

## Coordination

Minimal by design — this is a browsing-bucket grouping, not a parts-of-a-whole cohort. Members carry no shared
contracts, no cross-member sequencing, and no joint closeout: each activates, ships, and archives on its own.
Membership is **derived** from each member's `**Cohort:** architecture-remediation` field, never a roster here.

If a genuine cross-member contract or sequencing constraint later emerges, record it here; until then, treat the
members as independent.

---
