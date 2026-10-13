# Draft: errand-promotion-concurrency

- **Origin:** [internal]
- **Purpose:** Make Errand-to-Work-Unit promotion preserve the physical primary checkout as the concurrent-work
  launchpad while retaining the existing in-place conversion for an already isolated Errand.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's next planning iteration._

### `[ ]` **Re-plan promotion's meta creation and commit as a store write**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: errand-promotion-concurrency`), housekeep drain (2026-09-30);
  captured during `storage-contract` draft close, 2026-09-30.
- _Observation:_ The plan's concurrency concern is meta creation and its commit during Errand promotion. After the
  cutover, promotion writes a work-unit record through the storage contract — no tracked meta and no commit — and the
  contract's concurrency mechanism for that family (C4) governs the race.
- _Approach:_ Re-derive the concern against the contract's write semantics at next planning; much of it may dissolve.

### `[ ]` **Raise errand-promotion-concurrency to P2, and start it after the storage flip**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-09).

- _Shapes:_ its meta's priority and `Depends On`, and its Design Direction's primary-transfer transaction.

- _Applied at the drain (2026-10-09):_ the meta now carries `P2` and `Depends On: storage-cutover`, as the Owner
  confirmed; the Design Direction's primary-transfer transaction stays for planning.

- _Observation:_ `inbound-routing-method` D12 makes promotion the designed exit for an unclear Errand: run it as an
  Errand and promote the moment a record-test answer flips. In-place promotion of a primary-hosted Errand, which
  leaves its work unit occupying the primary checkout, grows more frequent. At P3 the horizon advisory fires
  (`spec-inbound-routing-method.md` D2). The Owner leans to P2 but waiting on the storage cohort (2026-10-07):
  register row "Errand promotion waits for its new meta to be committed" rewrites promotion at the flip as a
  type-field write on the Errand's own record and says to re-scope this work unit; its buffer entry "Re-plan
  promotion's meta creation and commit as a store write" says the same; and `cohort-state-storage.md` § Cross-cohort
  keeps work that edits the lifecycle write path off the seam.

- _Captured during:_ `inbound-routing-method` draft close, 2026-10-07.

---

## Problem / Motivation

`arc errand promote` converts the current Errand checkout in place. That is coherent when the Errand already occupies
a spawned worktree, but a primary-hosted Errand is the common path. Promoting it in place leaves the physical primary
carrying a long-lived Work Unit, contrary to the current concurrency doctrine that reserves a clean primary checkout
as the launchpad for independent worktrees and transient work.

The promotion path also predates the current fresh-session handoff used by spawned Work Unit starts. Even when the
state conversion succeeds, it provides no first-class way to move the new Work Unit into its own checkout, restore
the primary, and let a fresh session resume from a seeded WU-owned locus.

## Design Direction

- Branch on the Errand's actual allocation rather than applying one topology transition to every promotion.
- Preserve in-place conversion for a spawned Errand: that checkout is already isolated and should become the WU-owned
  locus without needless movement.
- For a primary-hosted Errand, provision a dedicated WU worktree, transfer the exact branch history and receipt-backed
  ownership, establish the WU marker and planning state there, restore the physical primary to a clean current base,
  and emit the normal seeded fresh-session handoff for the new locus.
- Express the primary transfer as a typed, recoverable transaction. Retries after a lost response must converge on
  the same branch, claim generation, WU identity, checkout, and capture disposition rather than duplicating or
  partially adopting them.
- Keep failure atomic across worktree allocation, marker/identity conversion, meta creation and commit, primary
  restoration, remote refs, and originating-capture settlement.

## Required Scenarios

1. A primary-hosted full-protection Errand promotes into a dedicated WU checkout and leaves the primary clean on the
   configured base.
2. A spawned full-protection Errand promotes in place and keeps the same isolated checkout.
3. A lost response at each durable boundary resumes idempotently without two WU owners or an orphaned Errand claim.
4. Dirty, moved, foreign, or ambiguous branch/worktree evidence refuses before destructive movement.
5. The new WU's first fresh session derives its exact frame and load set from the seeded checkout without relying on
   the promoting conversation.
6. Origin-capture settlement and obsolete Errand-ref cleanup occur once, after the replacement WU authority is
   durably established.

## Scope Boundaries

- Do not change the Errand-versus-WU floor, the operator decision to promote, or ordinary new-WU start semantics.
- Do not turn the primary into a general WU host or redesign the shared worktree allocator.
- Do not relocate an already isolated Errand merely for topological uniformity.
- Do not replace exact-generation, preservation, lost-response, or cleanup safeguards with prose sequencing.

## Likely Surface

Errand promotion workflow and runtime/result contracts; locus allocation and occupancy markers; WU initialization
and meta commit composition; start-style mini-handoff seeding; primary-hosted and spawned integration tests plus
real-CLI transition coverage.

---
