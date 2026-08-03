# Draft: locus-generation-binding

- **Origin:** [internal] — consolidates the exact-generation scope carved from `session-locus-model` during its
  chunked-review triage with the reconcile-apply reachability capture routed from `USER-INBOX § Work Unit` during
  delivery decomposition. Both concerns ask what authority a locus mutation must carry and revalidate under lock;
  the shared slug therefore has one authoritative home rather than two competing stubs.
- **Purpose:** Settle the exact-generation capability every locus mutator carries and where it is redeemed, then
  adopt or deliberately retire `applyLocusReconciliationAction` behind an owning CLI verb. The contract spans
  attach, provisioning, promotion, marker authority, stale-record reap, and dead-lock recovery.
- **State:** Draft — provisional mainline commitment retained. The source findings and built-ahead driver are
  recoverable evidence, not a prescribed implementation shape.
- **Created:** 2026-07-27

---

## Problem / Motivation

The locus mutation sites shipped by `session-locus-model` select authority before acquiring the lock that permits
their write, then re-prove inconsistent subsets of that authority under lock. The carried defect set identifies five
generation gaps:

- attach may replace a newly live lease using stale pre-lock liveness evidence;
- spawned provisioning does not revalidate the selected checkout head;
- transient provisioning drops the selected parent role and lease generation;
- promotion can accept a replacement same-process lease while reporting the stale lease ID; and
- marker replacement/removal compares one generation before a later rename or unlink can affect another.

The sixth carried item is the missing proof substrate: no failure-injection and replay matrix drives destructive
lifecycle mutations across every externally visible post-image.

The later decomposition pass exposed the adjacent reachability gap. `applyLocusReconciliationAction` revalidates a
selected reconciliation action under an owned record lock and covers `adopt-work-unit`, `adopt-transient`,
`reap-stale-record`, and dead-lock breaking, but no production caller implements its IO boundary. `arc locus attach`
already owns the two adopt actions through separate composition, while reap and dead-lock recovery still lack an
owning verb. Landing a second mutation path without one authority contract would deepen the inconsistency this work
exists to remove.

## Approach (provisional)

- Verify every carried locus against the integrated source before retaining it; the archived donor proves the
  observation point, not present-day applicability.
- Decide whether the capability is an opaque selection token, exact observed bytes, or a uniform re-read/compare
  discipline, and whether redemption belongs inside each mutator or one shared lock boundary.
- Reconcile the driver with `arc locus attach` before choosing an owning verb for reap and dead-lock recovery;
  duplicate adopt implementations are not an acceptable reachability fix.
- Settle parent/child cross-record lock ordering and marker atomicity as parts of the same capability contract.
- Build the failure-injection matrix at the lowest boundary that can replay every destructive post-image without
  fabricating producer state.

## Recoverable evidence

Implementation and unit coverage at tag `archive/session-locus-model-donor-fa3c10f0e`:

- `lib/locus/reconcile-driver.ts` and `__tests__/unit/locus/reconcile-driver.test.ts` (~559 lines combined);
- the attach, provisioning, promotion, and marker loci named above; and
- the groom/housekeep destructive boundaries needed by the failure-injection matrix.

The driver and original six-item finding record are also preserved with the completed `session-locus-model`
artifacts after closeout.

## Non-goals (provisional)

- Re-implementing adopt arms that `arc locus attach` already owns without reconciling ownership.
- Treating the archived driver or any reported finding as automatically correct against current `main`.
- Expanding into cross-machine arbitration or a new storage/locking substrate.
