# Draft: locus-generation-binding

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit` at the housekeep drain (2026-07-27);
  captured during `session-locus-model` delivery decomposition (task `7.P.e.i`).
- **Purpose:** Adopt (or deliberately retire) the cut **reconcile-apply** capability —
  `applyLocusReconciliationAction` and its dead-lock / reap arms — behind an owning CLI verb, rather than
  leaving a built-ahead capability with no caller.
- **State:** Draft — provisional capture (2026-07-27). Design-forward; code at the archive tag is evidence,
  not necessarily the land shape.
- **Created:** 2026-07-27

---

## Problem / Motivation

`applyLocusReconciliationAction` applies one previously-selected reconciliation action under an owned
record lock, revalidating the action against a fresh plan before acting. It covers `adopt-work-unit`,
`adopt-transient`, `reap-stale-record`, and dead-lock breaking.

It is **unreachable**: no source file calls it, its `LocusReconcileDriverIO` interface has no implementor
outside its own test, and `breakDeadLock` has no implementation at all. `arc locus attach` implements the
two adopt actions through its own composition, and `session-init.md` defers the remaining actions "until
its owning CLI verb is selected" — so nothing documented fails; this is a capability built ahead of its
verb rather than a shipping defect.

## Approach (provisional)

- The reap and dead-lock arms are the part with no other home; the adopt arms would need reconciling
  against `attach`'s existing composition rather than landing beside it.
- Decide the owning verb first — the capability is only worth adopting once something can reach it.
- Adjacent seams already named by this unit's carried defect set: `locus/command-runtime`,
  `locus/mutation`, generation and lock concerns.

## Recoverable evidence

Implementation and unit coverage at tag `archive/session-locus-model-donor-fa3c10f0e`:

- `lib/locus/reconcile-driver.ts` (~218 lines)
- `__tests__/unit/locus/reconcile-driver.test.ts` (~341 lines)

~559 lines as built; the design carries forward, not necessarily the code.

## Non-goals (provisional)

- Re-implementing adopt arms that `arc locus attach` already owns, without reconciling ownership.
- Expanding scope beyond reconcile-apply reachability and dead-lock/reap homes.
