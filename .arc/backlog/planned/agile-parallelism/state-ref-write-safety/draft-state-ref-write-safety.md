# Draft: state-ref-write-safety

**Purpose:** Guard ARC's local state-ref writes (the user-notes ref and the errand state-ref) against
same-machine inter-process races, so two concurrent ARC processes for one identity can't silently clobber each
other's record. Compare-and-swap + retry around the read-modify-write, on both refs.

- **State:** Draft — extracted from `cross-machine-sync-coherence` at its 2026-06-25 re-grounding (the shed
  single-machine-concurrency concern; that WU is cross-machine, this is not).

- **Created:** 2026-06-25

- **Origin:** Surfaced as a CodeRabbit finding on `errand/ref-tree.ts:107` during errand-lattice integration
  (PR #116, triaged defer-to-follow-up 2026-06-21), then parked in `cross-machine-sync-coherence`'s inbound
  buffer because that WU already held the notes-ref twin as an open question. Re-homed here at decomposition —
  it is single-machine, distinct from that WU's cross-machine framing.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Extend the CAS to the new `sync-state` ref (+ the machineId-file write race)**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-06-25); captured during `partial-push-marker`
  draft-design (fork-3 multi-machine reconciliation), ref path + machineId race corrected at integration review
  (CodeRabbit finding 4).
- _Concern:_ `partial-push-marker` shipped a third identity-scoped state-ref
  (`refs/arc/user/{identity}/sync-state`) alongside the user-notes and errand refs this WU already scopes. Its
  write path (`sync-state-ref.ts` `writeEntry` → `writeTreeCommit`, now the shared `lib/git/ref-tree.ts`
  mechanism) ends in the same unconditional `update-ref`, so its single-machine inter-process safety should ride
  this WU's CAS primitive, not reinvent it.
- _Second, distinct hazard:_ `getOrCreateMachineId` (`lib/user-sync/sync-state.ts`) does read-miss → generate
  `randomUUID` → `atomicWriteJson` on `.sync-state.json`: two concurrent first-pushes on one machine mint
  different machine-ids, last writer wins, so the processes disagree on machine identity. A JSON-file write race,
  NOT an `update-ref` CAS — needs atomic create-if-absent / a lock; a separate Scope bullet.
- _Approach:_ widen CAS + retry from two refs to three; confirm the union-merge-by-machine-id write path
  composes with the compare-and-swap; add the machineId-file atomic-create guard.

### `[ ]` **Distinguish genuine git failure from absent-ref on the reconcile read (shared ref-tree fail-open)**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-06-25); captured during `partial-push-marker`
  integration review (CodeRabbit findings 1/3, rejected-with-note). Home chosen at drain: the read-path
  complement to the CAS write-path above (same `lib/git/ref-tree.ts` substrate); `arc-backend`'s version-checked
  substrate is the longer-horizon alternative.
- _Concern:_ `lib/git/ref-tree.ts` `readRefTip` / `readTreeEntries` collapse every git error to absent-ref
  (null / empty Map) — the deliberate fail-open stance for advisory orphan state-refs. One real edge: in
  `sync-state-merge.ts` `reconcileTrees`, an _errored_ (not empty) `readTreeEntries(incoming)` after a successful
  fetch makes the union write a tree with only this machine's key, transiently dropping siblings' marker entries
  from origin. Self-healing (each sibling re-writes its own key next push — lag, not loss) and advisory-only, so
  rejected for `partial-push-marker`; recorded as forward-compat.
- _Approach:_ the read path should distinguish genuine git failure from absent-ref on the reconcile read so a
  transient error never silently narrows the merged tree.

---

## Problem / Motivation

The errand orphan state-ref write (`writeTreeCommit`, `errand/ref-tree.ts:107`) ends with an **unconditional**
`git update-ref <ref> <sha>` over a read-modify-write (read tip → read tree → mutate → commit → update-ref).
Two same-machine, same-identity processes can both read tip `T`, build on `T`, then `update-ref` — last writer
wins, silently dropping the other's record. The branch survives; the identity record is lost.

The **user-notes ref** has the identical unconditional-write shape, so the same race exists there (the
sibling-sessions notes-ref hazard `cross-machine-sync-coherence` parked as an open question — landing this
discharges it).

The **cross-machine** path is already safe (`reconcileErrandPush` + `mergeErrandTrees` union/reject +
non-fast-forward retry). This is the **single-machine** gap: inter-process, not inter-machine.

## Scope

Owns CAS + retry for **both** state-refs (errand ref + user-notes ref):

- **Compare-and-swap:** `git update-ref <ref> <new> <old>` — the write rejects if canonical moved since the
  read (git's native optimistic-concurrency primitive).
- **Retry loop** wrapping the read-modify-write: on a rejected CAS, re-read the changed tree, rebuild on the
  fresh tip, retry.
- Threaded through the **direct writes** (`errand/ref-tree.ts`, the notes-ref write path) and the reconcile's
  **local commit** leg.
- Concurrency tests asserting two racing writers both land (no silent drop).

**Size:** ~50 LOC + concurrency tests in the errand module, plus the notes-ref analog. Class lean: `Light`
(bounded mechanism, well-scoped), though correctness-critical.

## Why it gates `finalize-parallelism`

The user-notes and errand refs are **identity-scoped** (shared across worktrees), so two in-flight sessions on
one machine — exactly the multi-in-flight scenario the parallelism GA blesses — can race on the same ref and
silently lose a record. A "prove-watertight" GA can't bless concurrent worktrees with a known silent-data-loss
race in the shared refs, so this is a `finalize-parallelism` dependency despite its narrow trigger window.

## Forward-compat

This is the git-native interim of what `arc-backend` eventually owns — its **version-checked-writes /
optimistic-concurrency substrate** (`draft-arc-backend.md` § Concurrency & Version History). CAS-on-`update-ref`
is the same shape (read version, write-if-unchanged, reconcile-on-reject), so the fix lifts into that substrate
with zero reshape. Its cross-machine twin — `cross-machine-sync-coherence`'s partial-push marker — lifts into
the same target; together they are the two halves of "don't clobber shared state" (single-machine CAS +
cross-machine marker).

---
