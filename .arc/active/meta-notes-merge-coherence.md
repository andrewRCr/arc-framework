# Metadata: notes-merge-coherence

| **State**  | **Owner** | **Branch**                   | **Class** | **Priority** |
| ---------- | --------- | ---------------------------- | --------- | ------------ |
| `Planning` | `andrew`  | `plan/notes-merge-coherence` | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `draft-notes-merge-coherence.md`
- **Task List:** [none]

- **Last Completed:** [none]
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Run `create-spec.md` from `draft-notes-merge-coherence.md` (assess draft readiness at entry —
  the draft carries the engine-correctness design extracted from `async-merge-lifecycle`, RFC-shaped). Scope:
  single-machine notes-merge engine correctness — idempotent removal-tombstone resolution + a canonical
  materialized-manifest builder (built **general** for `cross-machine-sync-coherence` to extend) +
  `ancestor`-freshness recognition. Upstream of `async-merge-lifecycle`'s finalize notes-sync leg and unblocks
  CMSC; fixes two live defects WORKING-MEMORY currently carries a workaround for. Bridge — retires when
  `operational-state-docs` lands the record/projection model. Code is single-copy under
  `packages/arc-framework/src` (no two-copy mirror).

---
