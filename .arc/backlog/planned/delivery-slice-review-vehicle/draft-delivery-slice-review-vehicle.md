# Draft: Give Delivery Slices an Exact-Head Review Vehicle

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit`, housekeep drain (2026-07-30); captured during
  `decompose-transform-integrity` delivery 01 integration.
- **Purpose:** Represent a delivery slice as a typed, parent-bound review vehicle so an independently landable
  member can earn exact-head clearance without pretending to be a work unit or Errand.

---

## Problem / Motivation

A manually cut delivery slice passed local and hosted CI, hosted review, and thread settlement at one exact head,
yet clearance refused with `vehicle-branch-mismatch`. The slice branch intentionally carried neither the canonical
work-unit slug nor independent lifecycle metadata, while the review vehicle schema admitted only work units and
Errands.

Branch protection correctly prevented an administrative shortcut. Without a typed slice vehicle, reviewed
delivery members cannot reach the status the repository requires, and every stack must choose between weakened
protection and forged identity.

## Approach

Add a delivery-slice vehicle, or an equivalent projection bound to an authoritative parent delivery plan. It must
authenticate:

- delivery-plan and member identity
- parent work unit and exact PR head
- predecessor and base relationship
- independently landable state
- slice-specific review evidence that cannot authorize a later head or member

Cover push relocking, predecessor advancement, stalled or abandoned stacks, sequential slice landing, and terminal
parent archival. Preserve the stricter work-unit and Errand readiness contracts rather than widening them to fit
an identity they do not model.

## Unknowns and Assumptions

- Which delivery-plan artifact is authoritative enough to mint the vehicle?
- Does the vehicle belong in the general review schema or behind the chunked-delivery substrate?
- What closes or invalidates slice evidence when a predecessor advances?

## Scope Estimate

Large — trust-boundary schema, exact-head evidence, host-status publication, stack transitions, and lifecycle
coverage.
