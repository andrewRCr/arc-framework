# Metadata: async-merge-lifecycle

| **State**  | **Owner** | **Branch**                   | **Class** | **Priority** |
| ---------- | --------- | ---------------------------- | --------- | ------------ |
| `Active`   | `andrew`  | `feat/async-merge-lifecycle` | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** `concurrent-work-doctrine`, `merge-safety-mechanism`, `notes-merge-coherence`

- **Origin:** [internal]
- **Design:** `spec-async-merge-lifecycle.md`
- **Task List:** `tasks-async-merge-lifecycle.md`

- **Last Completed:** Task 5.2 — unattended-merge errand completion (doc-level reconciliation; downstream
  coordination recorded); closes Phase 5, which also shipped the same-session finalize pass (5.1).
- **Next Task:** Task 6.1 — Touchpoint re-grounding audit — option B (additive) (line ~307)
- **Blockers:** [none]

- **Next Action:** Begin Task 6.1 — re-ground each async-merge touchpoint (`integrate-work-unit` /
  `archive-work-unit` / `session-handoff` / `deactivate-work-unit` / `setup-merge-gate`) against current shipped
  code with additive awaiting-review accommodation only (option B; sync-merge stays primary). Then 6.2 records the
  reaper facet-split and updates `coord-probe`'s inbound buffer. Both copies; run via `process-task-loop.md`.

---
