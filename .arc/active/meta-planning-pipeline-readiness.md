# Metadata: Planning-Pipeline Readiness

| **State** | **Owner** | **Branch**                         | **Class** | **Priority** |
| --------- | --------- | ---------------------------------- | --------- | ------------ |
| `Active`  | `andrew`  | `feat/planning-pipeline-readiness` | `Heavy`   | `P2`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-planning-pipeline-readiness.md`
- **Task List:** `tasks-planning-pipeline-readiness.md`

- **Last Completed:** Spec created — `detailed` · RFC at `spec-planning-pipeline-readiness.md`, crystallizing the
  three-section spine: the shared `assess-draft-readiness` method (one formalization-ready bar, two fire points,
  checks-only on the buffer), the `create-spec` review/proceed interlock split + an overlay-recommendation norm in
  `DEV-RULES.ARC`, and the planning-stage-pointer mechanics (`Current Workflow` as a bare-basename encoding field,
  event-driven `Design`, `init-work-unit` folded in, six-event set pinned). Settled the encoding format
  (bare basename over a state token) and recorded leans on all three remaining implementation opens. Draft retired.
- **Next Task:** Begin Task 1.1 — Author the assess-draft-readiness method (+ package mirror)
- **Blockers:** [none]

- **Next Action:** Run process-task-loop.md — begin Task 1.1 (assess-draft-readiness method)

---
