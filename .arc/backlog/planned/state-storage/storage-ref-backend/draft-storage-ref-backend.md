# Draft: Storage Ref Backend

- **Origin:** [internal] — the `state-storage` re-cut (2026-09-28); stage 2 of the storage program.
- **Purpose:** Build the default backend: operational and planning state in same-repository `refs/arc/*` behind the
  storage contract, with user sync moved onto it as its first consumer, the one-time import of today's tracked state
  and Git notes, and fetch-refspec installation.
- **Planning posture:** `P1`; `Class` settles at planning. Design may run alongside `storage-contract`'s once that
  draft settles ref layout and each shared surface's concurrency mechanism; implementation may start once its spec
  is approved (`cohort-state-storage.md` § Coordination).

---

## Scope

- **The store.** The ref layout and per-surface concurrency mechanisms `storage-contract` settles, built on the
  mechanisms the concurrency spike proved (`analysis-storage-substrate-direction.md` § 6.9): compare-and-swap with
  rebase-and-retry, a machine-local write lock, per-machine push batching at firing points, and a push loop that
  retries lost races and ends on any other refusal with the server's message. Generalized from user sync's and the
  Errand identity refs' existing ref machinery.
- **Requirements the spikes set** (§ 6.10): batched or long-lived Git calls, Windows included; unique stored paths
  across refs; `git maintenance run --auto` at a firing point; rotation to a new ref name; completed work units' refs
  leaving the fetched namespace. Open: a wider delta window where ARC repacks its own store.
- **User sync onto the store,** retiring its Git-notes transport while keeping its verbs, sync state machine, and
  failure taxonomy.
- **The import** of current state, not history (§ 10.3): tracked planning and completed artifacts, Candidate and
  transition records, and notes collapsed to one snapshot with the old ref kept as an archive tag. Under the
  pre-public-release posture it may be a one-off tool for this repository and CineXplorer rather than a shipped
  `arc migrate`; decide here. `storage-cutover` runs it.
- **Fetch-refspec installation** in `arc init` and `arc update`, with one designated state host per repository.

---
