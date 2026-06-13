# Metadata: async-merge-lifecycle

| **State**  | **Owner** | **Branch**                   | **Class** | **Priority** |
| ---------- | --------- | ---------------------------- | --------- | ------------ |
| `Planning` | `andrew`  | `plan/async-merge-lifecycle` | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** `concurrent-work-doctrine`, `merge-safety-mechanism`, `notes-merge-coherence`

- **Origin:** [internal]
- **Design:** `spec-async-merge-lifecycle.md`
- **Task List:** [none]

- **Last Completed:** Created `spec-async-merge-lifecycle.md` (`detailed`·RFC); discovery settled both gating
  decisions; draft retired, grounding migrated to `notes-async-merge-lifecycle.md`
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Run `generate-tasks.md` — consumes `spec-async-merge-lifecycle.md`. **Resolved this session:**
  `Class: Heavy`, form **`detailed`·RFC**; both design-gating decisions settled — (1) **eager** post-merge
  teardown owned by the ceremony, authored inline (close `integrate-work-unit.md` Step 13 primary-arm gap;
  `archive` stays teardown-free; DRY-hoist to `decompose`'s park-exit block deferred to `composable-workflows`);
  (2) **facet split** with `coord-probe` — this WU owns the post-merge `feat/` teardown, `coord-probe` retains the
  cross-machine `plan/`-orphan sweep (its buffer item updated). PROJECT-PRD (Operational-friction principle) +
  TECHNICAL-OVERVIEW (§ 2 / § 3) alignment checks passed.

---
