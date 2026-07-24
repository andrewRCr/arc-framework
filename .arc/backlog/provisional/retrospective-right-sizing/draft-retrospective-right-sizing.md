# Draft: Retrospective Right-Sizing

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-07-23); generalized from the
  `review-surface-binding` create-spec proportionality review.
- **Purpose:** Give disproportionate machinery that has already shipped a repeatable detection, assessment, and
  remediation owner when the blast radius exceeds its originating WU.

---

## Problem / Motivation

Planning-time proportionality now has an owner, but retrospective remediation does not. An originating WU can absorb
a bounded correction when the overdesign remains local, as `session-locus-model` did. That answer fails when the
target state spans a program: no single member can settle a shared reduction, and machinery that ships without an
active consumer generates no signal on its own.

`review-surface-binding` supplied one useful ad hoc pattern while consuming dormant review-gate machinery:
prune-at-consumption classified each inherited module as `consume`, `keep-as-contract`, or `retire`, with retirement
requiring no consumer and no named downstream claim. The pass worked, but it fired only because a successor happened
to inspect the inventory.

## Direction

Settle three connected pieces:

1. A reusable prune-at-consumption assessment with a declared fire site.
2. Triggers for retrospective review, including successor inheritance, elapsed time without a consumer, and a
   proportionality finding raised at another lifecycle stage.
3. A wrapper for program-scale remediation when an in-WU remedial phase cannot own the complete target state.

The concrete `review-gate-right-sizing` WU remains the instance-specific owner for the review-gate program. This
draft owns the generalized mechanism by which similar questions are raised and assigned.

## Boundaries and Composition

Keep retrospective proportionality distinct from delivery integrity. A zero-caller or unwired-port guard catches a
contract defect at delivery time; retrospective right-sizing evaluates whether already-shipped machinery remains
proportionate, even when it has callers. Planning should coordinate shared trigger surfaces with
`quality-gate-hooks` and `planning-iteration-mechanics` without collapsing the two concerns unless one mechanism
proves authoritative for both.

## Open Questions

- Does the generalized concern remain one WU, or split into a reusable assessment method plus lifecycle-trigger and
  program-remediation contributions?
- Which operational surface can detect elapsed non-consumption without adding a new noisy advisory?

---
