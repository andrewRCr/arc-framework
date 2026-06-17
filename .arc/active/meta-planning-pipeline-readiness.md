# Metadata: Planning-Pipeline Readiness

| **State** | **Owner** | **Branch**                         | **Class** | **Priority** |
| --------- | --------- | ---------------------------------- | --------- | ------------ |
| `Active`  | `andrew`  | `feat/planning-pipeline-readiness` | `Heavy`   | `P2`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-planning-pipeline-readiness.md`
- **Task List:** `tasks-planning-pipeline-readiness.md`

- **Last Completed:** Phase 3 (§ C foundation) + Phase 4 Tasks 4.1–4.2 — `Current Workflow` field model +
  encoding-consistency validator; stage-pointer write primitive + `writeCurrentWorkflowField` executor seam;
  `arc set-stage` command + planning-workflow wiring (both copies); activate-exit `Current Workflow → [none]` clear.
- **Next Task:** Task 4.3 — `Design` event-driven repoints (draft-create + create-spec finalize)
- **Blockers:** [none]

- **Next Action:** Run process-task-loop.md — begin Task 4.3 (Phase 4 / § C write-side, test-first)

---
