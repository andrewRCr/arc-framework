# Draft: Storage Seam

- **Origin:** [internal] — the `state-storage` re-cut (2026-09-28); stage 2 of the storage program.
- **Purpose:** Route every ARC reader and writer of operational and planning state through the storage contract,
  running on its first implementation over today's tracked layout, so the ref backend can later replace that
  implementation with nothing above the contract changing.
- **Planning posture:** `P1`; `Class` settles at planning. Its design comes from `storage-contract`'s consumer map, so
  this work unit carries little of its own. When `storage-contract`'s planning closes, it decomposes against that map,
  and its members inherit the map rather than redesigning their subsystem.

---

## Scope

By subsystem, as the storage analysis partitions it (`analysis-storage-substrate-direction.md` § 10.2) and the
consumer map will settle it:

- **Lifecycle and in-flight:** the lifecycle executor's write path, `arc start` placement, in-flight derivation,
  and the archive index.
- **Delivery:** delivery's plan and state records and its reads of lifecycle state.
- **Review and evidence:** Candidate and transition records, review evidence, and the readers that take either out
  of Git history.
- **Locus and session-init:** locus derivation from the checkout marker plus the store, and the notes-related
  session-init probes. Kept narrow: reads through the contract, without reshaping the prose conditionals the
  session-init agenda will replace.
- **Status and roadmap:** ROADMAP rendering and the status surfaces, as derived projections that are never stored.

Readers outside ARC's code — workflows, extensions, method overrides, scripts, and ARC's own lint and contract
checks — move off Git-history and pull-request-diff reads of state as well (§ 6.10, Readers outside ARC).

## Constraints

- `cli-substrate-complete-migration` lands before this work unit starts, and nothing else that edits the lifecycle
  write path runs alongside it (`cohort-state-storage.md` § Cross-cohort).
- When it decomposes, `storage-cutover`'s edge on it re-points to its members.

---
