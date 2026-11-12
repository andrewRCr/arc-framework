# Draft: Query Cache

- **Origin:** [internal] — minted provisional at `storage-contract`'s draft close (2026-09-30), deferred behind a
  tripwire (C2 and C14 in `draft-storage-contract.md`).
- **Purpose:** A local index of record fields built from the store, for queries across fields and live views — never
  the authority.
- **Planning posture:** `P3`, deferred; promote when the tripwire fires. Depends on `storage-cutover`.

---

## Tripwire

A read path exceeds its latency budget, or a live view needs queries across fields.

## Why deferred

Raw reads need no cache: every work unit's meta at its tip, 601 of them, reads in one 17 ms batch. The cache's case is
queries across fields and live views, including typed reads for `arc view` and `status-hud`.

## Settled inputs (from `storage-contract`)

- A local SQLite index of record fields, keyed by ref tips and checked on read, so it cannot serve stale state
  (git-bug #235).
- Derived, never stored, and never the authority: a binary store does not diff or merge in Git and makes conflicts
  opaque. It is not a storage family.
- It indexes the fields each family's parser exposes — the record-aware seam `storage-seam` builds — so it reads
  through the contract, never by path.

## Open

- Node's built-in `node:sqlite` may avoid a native dependency; verify it against the supported Node range.
- Where the index lives and how finely it invalidates.

## Reading inputs

- `draft-storage-contract.md` — C2 and C14.

---
