# Draft: Lifecycle Advancement Provenance

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-09-07); consolidated from repeated native-stack
  delivery re-entry and correction-driver dogfooding.
- **Purpose:** Preserve deliberately granted lifecycle direction across safe re-entry, and define when a driven
  operation may perform proof-bounded record and composition effects without manufacturing a new human decision.

---

## Inbound Buffer — Pending Integration

### `[ ]` **Keep sequential landing review current through preparation and no-effect recovery**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-09-16).

- _Observation:_ With Member 2 review discharged and PR #619 checks green, sequential `delivery land prepare`
  reserved operation `0a7928e6-a935-4782-93f4-06cb48338c2f`, but `delivery land apply` refused at
  `readiness-revalidation / before-lock-release / review-readiness-refused / review-unsettled`. The exact-target
  review status said the public delivery continuation was not current: preparation's own reservation had advanced
  Delivery State beyond that continuation. No lock was released and no merge occurred. `delivery reconcile` proved
  no effect and cleared the reservation, but advanced the state again; work-unit review remained settled while
  exact-target status remained blocked. An unchanged `npx arc attest evidence-applicability --json` renewed the
  continuation without repeating verification or review, but the refusal did not offer that typed remedy.

- _Approach:_ Make sequential prepare-to-apply readiness evaluate the exact operation against a bounded
  pre-reservation review projection, as native preparation already does, without relaxing state, PR, head, check,
  or review guards. Cover both a successful sequential prepare-to-apply path and stale or mismatched refusals. On
  no-effect recovery, surface a typed unchanged-Candidate continuation renewal or explicit Owner-directed escape
  hatch, rather than stranding a routine retry or demanding new gates when the subject and members did not change.

- _Scope:_ Genuine unlinked sequential delivery and its no-effect recovery. This is separate from the registered
  native-route guard above; it does not bypass independent verification, review, or merge authority.

- _Files:_ `packages/arc-framework/src/scripts/review-gate/status-composition.ts`,
  `packages/arc-framework/src/handlers/delivery-execution.ts`, `packages/arc-framework/src/lib/delivery/landing.ts`,
  and delivery landing/status integration tests; the typed recovery workflow only if needed.

- _Captured during:_ `evidence-applicability` Member 2 landing dogfooding, 2026-09-14.

### Carry exact-effect landing approval across a proven no-effect retry

_Routed from `USER-INBOX § Errand`, 2026-09-09._

After an approved delivery-member landing returned a generic refusal, reconciliation proved that no host effect
landed, cleared the reservation, and required a fresh operation ID. The new preparation described the same member,
head, change request, strategy, lock release, and consequence, but the earlier approval was lost solely because the
internal operation identity changed.

Settle whether integration approval can bind to a canonical exact-effect digest, or an equivalent authorization
receipt, so a reconcile-proven no-effect retry may reuse approval only while every externally meaningful field is
identical. Any changed member, head, request, strategy, consequence, ambiguous or partial effect, or unproved host
state must require a fresh interlock. Preserve one-shot mutation execution and optimistic operation-state
concurrency; approval continuity must not make an old operation ID executable or broaden authority to another
member or head.

---

## Problem / Motivation

A work unit that reopens for an approved correction currently loses all prior forward direction. Verification,
prepublication, and integration then repeat checkpoints even when no decision changed, while an attended route
selection can disappear at compaction and require the same attribution again. Carrying the furthest historical
stage as unconditional permission would be unsafe: the Candidate, classified paths, review obligation, cost, or
available routes may have changed.

The delivery correction driver exposes the adjacent authority question. Some internal commits, pushes, and
content compositions are uniquely derived effects of an already-approved disposition; others contain a semantic
choice. Today the default is emerging from individual controller implementations instead of one user-facing
approval contract.

## Direction

- Represent lifecycle direction as first-class approval provenance with an explicit work-unit scope, forward
  boundary or ceiling, permitted reversible/idempotent ceremonies, and exact invalidation inputs.
- Retain an attended route selection across re-entry only while its work-unit head, classified path set,
  outstanding delivery member, and offered alternatives remain unchanged.
- Make every repeated checkpoint correspond to a renewed decision: no gate without a decision, and no historical
  stage position treated as authority.
- Define when driver-internal record commits, pushes, or content compositions are uniquely and mechanically
  derived from an approved disposition. Such effects may be machine-owned with an exact effect log; competing
  valid results, uncertain intent, or any semantic choice remain attended.
- Prefer composition with existing approval-provenance and commit/push-interlock axes over another configuration
  axis. Any stop mode must preserve the driver's resumability rather than recreating a deterministic stop chain.
- Never carry review-finding disposition, new material review spend, destructive action, or exact-head
  integration/merge authority unless that boundary's own contract explicitly grants it.

## Design Questions

- What exact record owns a standing grant, and how is it invalidated when the Candidate or route facts move?
- Is driver-effect autonomy a facet of existing interlock modes or a capability named by the lifecycle grant?
- Which predicates prove one exact authorized content composition, and which actor witnesses that proof?
- How do pre-composition direction, ordinary review-increment approval, and final integration authorization
  compose without overlapping authority?

## Scope

Approval provenance, retained lifecycle/route direction, proof-bounded driver effects, invalidation, resumability,
and operator-facing configuration. Delivery topology and provider mutation remain with their existing owners.

---
