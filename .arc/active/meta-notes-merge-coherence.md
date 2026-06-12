# Metadata: notes-merge-coherence

| **State**  | **Owner** | **Branch** | **Class** | **Priority** |
| ---------- | --------- | ---------- | --------- | ------------ |
| `Planning` | `andrew`  | [none]     | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `draft-notes-merge-coherence.md`
- **Task List:** [none]

- **Last Completed:** [none]
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Activate via `init-work-unit` Path A, then `create-spec` from `draft-notes-merge-coherence.md`.
  Single-machine notes-merge engine correctness: idempotent removal-tombstone resolution + a canonical
  materialized-manifest builder (built general for `cross-machine-sync-coherence` to extend) + `ancestor`-freshness
  recognition. Upstream of `async-merge-lifecycle`'s finalize notes-sync leg and unblocks CMSC; fixes two live
  defects WORKING-MEMORY currently carries a workaround for. Bridge — retires when `operational-state-docs` lands
  the record/projection model.

---
