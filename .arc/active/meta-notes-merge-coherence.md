# Metadata: notes-merge-coherence

| **State**  | **Owner** | **Branch**                   | **Class** | **Priority** |
| ---------- | --------- | ---------------------------- | --------- | ------------ |
| `Planning` | `andrew`  | `plan/notes-merge-coherence` | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-notes-merge-coherence.md`
- **Task List:** `tasks-notes-merge-coherence.md`

- **Last Completed:** [none]
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Run `activate-work-unit.md` to flip `**State:**` to `Active` and rename the branch from
  `plan/` to `technical/`; implementation then begins on Phase 1 (`resolveCrossWuState` extraction in
  `lib/user-sync/merge.ts`). The task list decomposes the spec's four independently-reviewable units into four
  test-first phases plus verification: shared tombstone-aware resolution (extraction), idempotent
  removal-tombstone synthesis, the exported tombstone-free `projectManifest` as the single save/load/status
  comparison basis, and HEAD-ancestor-freshness recognition in `decideSyncAction`. Single subsystem
  (`lib/user-sync/` + the two user commands), single-copy code under `packages/arc-framework/src` (no two-copy
  mirror). Upstream of `async-merge-lifecycle`'s finalize notes-sync leg and unblocks `cross-machine-sync-coherence`
  (which extends `projectManifest`); fixes two live defects WORKING-MEMORY carries a workaround for. Bridge —
  retires when `operational-state-docs` lands the record/projection model.

---
