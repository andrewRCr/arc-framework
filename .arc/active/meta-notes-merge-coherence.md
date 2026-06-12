# Metadata: notes-merge-coherence

| **State**  | **Owner** | **Branch**                   | **Class** | **Priority** |
| ---------- | --------- | ---------------------------- | --------- | ------------ |
| `Active`   | `andrew`  | `fix/notes-merge-coherence`  | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-notes-merge-coherence.md`
- **Task List:** `tasks-notes-merge-coherence.md`

- **Last Completed:** [none]
- **Next Task:** Task 1.1 — Extract `resolveCrossWuState` and route `mergeCrossWuFile` through it (line ~14)
- **Blockers:** [none]

- **Next Action:** Begin Task 1.1 — the behavior-preserving extraction of `resolveCrossWuState` in
  `lib/user-sync/merge.ts` (`tasks-notes-merge-coherence.md`, line ~14), via `process-task-loop.md`. The task
  list decomposes the spec's four independently-reviewable units into four test-first phases plus verification:
  shared tombstone-aware resolution (extraction), idempotent removal-tombstone synthesis, the exported
  tombstone-free `projectManifest` as the single save/load/status comparison basis, and HEAD-ancestor-freshness
  recognition in `decideSyncAction`. Single subsystem (`lib/user-sync/` + the two user commands), single-copy
  code under `packages/arc-framework/src` (no two-copy mirror). Upstream of `async-merge-lifecycle`'s finalize
  notes-sync leg and unblocks `cross-machine-sync-coherence` (which extends `projectManifest`); fixes two live
  defects WORKING-MEMORY carries a workaround for. Bridge — retires when `operational-state-docs` lands the
  record/projection model.

---
