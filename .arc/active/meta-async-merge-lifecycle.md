# Metadata: async-merge-lifecycle

| **State**  | **Owner** | **Branch**                   | **Class** | **Priority** |
| ---------- | --------- | ---------------------------- | --------- | ------------ |
| `Active`   | `andrew`  | `feat/async-merge-lifecycle` | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Depends On:** `concurrent-work-doctrine`, `merge-safety-mechanism`, `notes-merge-coherence`

- **Origin:** [internal]
- **Design:** `spec-async-merge-lifecycle.md`
- **Task List:** `tasks-async-merge-lifecycle.md`

- **Last Completed:** Task 2.1 — two-tier WU completion-sweep composer (`runWorkUnitState`) wired onto the
  session-init envelope as the `workUnitState` slot (Phase 1 + Phase 2 Task 2.1 complete).
- **Next Task:** Task 2.2 — Staleness threshold + event-driven triggers (line ~90)
- **Blockers:** [none]

- **Next Action:** Begin Task 2.2 — add the `integration.stale_after_days` config key (mirror
  `inbox.remind_after_days`, both copies), gate the `stale` tier behind it + the once-per-day marker, and
  event-bypass `mergeable` / `merged-needs-archival`; replaces the interim `WORK_UNIT_STALE_THRESHOLD_DAYS`
  constant in `handlers/status.ts`. Run via `process-task-loop.md`.

---
