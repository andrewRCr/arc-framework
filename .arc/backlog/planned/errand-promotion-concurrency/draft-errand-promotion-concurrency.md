# Draft: errand-promotion-concurrency

- **Origin:** [internal]
- **Purpose:** Make Errand-to-Work-Unit promotion preserve the physical primary checkout as the concurrent-work
  launchpad while retaining the existing in-place conversion for an already isolated Errand.

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
