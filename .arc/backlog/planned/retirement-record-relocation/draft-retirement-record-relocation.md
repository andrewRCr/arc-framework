# Draft: retirement-record-relocation — relocate the retirement-record store out of the repo-root `.internal/`

- **Origin:** [internal] — noticed 2026-07-19 while inspecting the `.arc/.internal/retirement-receipts/` directory
  that first appeared on `main` and several worktrees after the `cli-substrate-adoption` decomposition. A follow-up
  to the completed `husk-lifecycle-drivers` WU, which introduced the store.
- **Purpose:** Move the retirement-record (husk-teardown authorization receipt) store off the **repo-root
  `.arc/.internal/` namespace** — a location with no precedent in the tree (only `.arc/user/.internal/` and
  `.arc/system/.internal/` exist) — to a precedented tracked home, and guard against a root-level `.internal/`
  recurring. Cross-transition: the store backs `decompose`, `abandon`, and `park-planning` receipts alike.

- **State:** Draft — pre-spec capture (2026-07-19). Iterate before spec promotion.

---

## Problem / Motivation

The in-repo retirement-authority adapter writes teardown-authorization receipts to
`.arc/.internal/retirement-receipts/sha256-<digest>.json` (`RETIREMENT_RECORD_NAMESPACE` in
`retirement-record-store.ts`). `husk-lifecycle-drivers` specified this namespace and named it part of the adapter's
stable contract, but the **repo-root `.internal/` placement** was never scrutinized against the tree convention:
ARC has `.internal/` under `.arc/user/` and `.arc/system/`, never at `.arc/` root. The directory clutters the root
and reads as an unaudited namespace.

The receipts are **load-bearing, not debris.** For non-ship retirements (`decompose` / `abandon` / `park-planning`)
there is no completed-artifact projection to authorize teardown against, so the transition commits a canonical
receipt that a later `arc teardown` revalidates against the git projections before authorizing destructive cleanup
(remote branch delete, worktree removal). They are read from committed refs (`git show <ref>:<path>`), so they must
stay **tracked** — gitignoring is not an option. The fix is relocation, not removal.

The surface first appeared under `decompose` only because decomposition is the first non-ship retirement to write a
physical receipt; the husk/teardown system had previously been exercised only under ship conditions, where the
evidence is the completed projection and no receipt file is written.

## Design considerations (open)

- **Destination.** Leading candidate: `.arc/system/.internal/retirement-receipts/` — a precedented, tracked home
  (`.arc/system/.internal/` already holds githooks, harness-hooks, and canonical skill sources). Settle at spec
  whether the store belongs under `system/.internal/` (framework machinery) or another tracked locus.
- **Migration / back-compat.** `husk-lifecycle-drivers` has **not shipped to adopters** (package at v0.1.0, no
  release tags), so there is **no adopter-generated receipt in the wild** — migration is limited to this repo's
  committed receipt(s) and any in-flight husks. Still, teardown authorization reads the receipt path from a
  committed ref, so the namespace change must keep already-written receipts resolvable (or migrate them) rather than
  silently orphaning them. Treat the move as a revision to a contract `husk-lifecycle-drivers` recorded as stable,
  not a blind path swap.
- **Guard.** Add a mechanism preventing a future root-level `.arc/.internal/` from being introduced unnoticed (a
  pre-commit assertion or a namespace allowlist), so the convention is enforced, not merely documented.

## Coordination / forward-compat

- **Storage-evolution north star.** The deeper question — whether retirement receipts stay tracked working-tree
  files (like ROADMAP) or migrate to the materialized git backing store / event-log substrate — is a
  `strategy-storage-evolution` / `arc-backend` decision. The husk adapter already anticipates local/backend adapters
  beyond the in-repo one. Sanity-check the destination against that target so the near-term relocation composes with
  it rather than baking in a location the backend model would move again.
- **`wu-lifecycle-state-model`** owns placement-as-record (directory location as a projection of lifecycle state).
  The receipt store's location is an instance of the same storage-projection reasoning; coordinate so the two settle
  consistently. This WU owns the concrete store; WLSM owns the state vocabulary.
- **`cohortless-decomposition`** (decompose-transform hardening) — its "lifecycle-complete terminal and successor
  bridge" item touches receipt/teardown choreography and reads this store, so coordinate on the store path.

## Scope Estimate

Small–moderate. Mechanically a namespace-constant change plus receipt relocation and a guard, but it revises a
recorded adapter contract and carries a forward-compat destination call — spec-worthy, not an errand.
