# Draft: Traceability Identifiers

- **Origin:** `USER-INBOX § Work Unit`, routed at the 2026-08-03 housekeep drain from
  `delivery-plan-record` planning. Delivery consumes the convention and owns only the deliverable layer; the spec
  forms own substrate naming.
- **Purpose:** Codify a coherent identifier family from requirements and design elements through tasks and
  delivery, preserving distinct identities where paired specification forms express different roles.

---

## Problem / Motivation

ARC codifies an enumerable substrate from which task lists are built and against which they are validated, but it
does not prescribe identifiers for that substrate. Practice has started filling the gap: 8 of 73 completed specs
carry element IDs, nearly all `D<n>`, concentrated in recent heavier work. The convention is real and spreading,
but remains ungoverned across specification forms and downstream delivery records.

Both detailed forms name the same enumerable role, yet a paired specification carries two genuinely different
things: a requirement states what must be true, while a design element states what will be built to make it true.
A single prefix would erase that distinction and weaken the traceability chain.

## Candidate Direction

- Use `R<n>` for PRD requirements and `D<n>` for RFC design elements: one identifier family, distinct role-specific
  prefixes.
- Let a task retain its existing `X.Y` identity and cite both sides where applicable, such as `— R3, D7`.
- Add a human delivery-series label shaped as `n/N`, with `v<k>` for rerolls, while preserving a digest as the
  durable rewrite-surviving identity beneath that label.
- Decide whether `## Success Criteria` gains `SC<n>` identifiers as the third enumerable specification surface
  validated by the verification task.

These are directional inputs, not settled design. Record the final convention in an ADR because it is
cross-cutting, durable, and informed by established requirements-traceability, patch-series, and rewrite-stable
identity idioms.

## Scope and Boundaries

Apply the settled family coherently across all four specification templates, `strategy-work-planning.md`, and
`strategy-task-list-formatting.md`. Define paired-spec mapping, task citation, verification, and delivery
consumption without turning this work into a corpus-wide historical rename. Coordinate the deliverable label with
`delivery-plan-record`; that work unit consumes the naming contract but does not own the upstream substrate.

This member belongs to the `doc-conventions` cohort as an independently shippable convention surface; it carries
no shared contract or sequencing dependency with the cohort's other members.

---
