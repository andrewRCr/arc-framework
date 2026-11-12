# Draft: Locus Claim Revalidation

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-08-20).
- **Purpose:** Prevent a stale free-primary session frame from mutating a checkout after another session claims it.

## Problem / Motivation

Under full protection an Errand may claim the clean, marker-free primary in place. New sessions observe that marker,
but an already-running session retains its earlier free-primary frame and does not revalidate before mutating tracked
state. A live collision left unrelated grooming changes in an Errand-owned checkout and blocked close on the dirty
tree.

The exposure grows with concurrent agent sessions over one clone, independent of team size.

## Direction

Evaluate the smallest complete contract among three potentially composable remedies:

- always spawn Errands under full protection, keeping the primary as a pure launchpad;
- surface a mint-time notification when the free primary is claimed; or
- revalidate the primary marker before the first tracked-state mutation, and after any justified idle boundary.

The threat is accidental single-operator concurrency, not hostile actors. Preserve cheap in-place use if the
revalidation contract can close the stale-frame window reliably.

---
