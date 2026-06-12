# Metadata: notes-merge-coherence

| **State**  | **Owner** | **Branch**                   | **Class** | **Priority** |
| ---------- | --------- | ---------------------------- | --------- | ------------ |
| `Active`   | `andrew`  | `fix/notes-merge-coherence`  | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-notes-merge-coherence.md`
- **Task List:** `tasks-notes-merge-coherence.md`

- **Last Completed:** Task 4.1 — Recognize a HEAD-ancestor note as actionable
- **Next Task:** Task 5.1 — Complete verification (line ~127)
- **Blockers:** [none]

- **Next Action:** Begin Task 5.1 — verification: load and follow `verify-work-unit.md`
  (`tasks-notes-merge-coherence.md`, line ~127), via `process-task-loop.md`'s verification phase. Phases 1–4 are
  implemented and committed: shared `resolveCrossWuState` extraction, idempotent removal-tombstone synthesis, the
  exported tombstone-free `projectManifest` as the single save/load/status comparison basis, and
  HEAD-ancestor-freshness recognition in `decideSyncAction`. Both live defects are closed (duplicate tombstones;
  false `local unsaved`); all quality gates green throughout. After verification, integrate — upstream of
  `async-merge-lifecycle`'s finalize notes-sync leg, and unblocks `cross-machine-sync-coherence` (which extends
  `projectManifest`). On merge, the benign-posture entry in WORKING-MEMORY retires (its trigger fires when this
  WU ships).

---
