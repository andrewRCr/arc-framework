# Draft: Session-Init Performance

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-08-10); surfaced while restoring session-init from a
  50-second regression during `decompose-transition-record` recovery.
- **Purpose:** Bound session-init Git work around one invocation-scoped snapshot rather than repeating repository
  discovery across projections.

---

## Problem / Motivation

Session-init independently composes several Git-backed projections: selected base and refs, registered checkouts,
object and ref reads, deletion-history scans, and lifecycle/identity views. Repeating those reads across handlers
scales poorly with several worktrees and deep history, and can observe different repository moments inside one
logical probe.

## Direction

- Pin one bounded repository snapshot for an invocation and derive compatible session-init projections from it.
- Share object, ref, and checkout reads without collapsing the distinct authority or failure policies of consumers.
- Preserve typed degradation when a projection cannot be established; performance work must not turn unknown state
  into an empty or clean result.
- Add benchmarks and stress coverage spanning several worktrees and deep deletion history, with process counts and
  wall-clock cost recorded as evidence.

## Scope

The primary locus is session-init probe composition around `packages/arc-framework/src/handlers/status.ts` and the
shared Git object/ref and checkout readers it invokes. This does not redesign the durable storage substrate.

---
