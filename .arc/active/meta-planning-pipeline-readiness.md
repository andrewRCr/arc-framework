# Metadata: Planning-Pipeline Readiness

| **State**  | **Owner** | **Branch**                         | **Class** | **Priority** |
| ---------- | --------- | ---------------------------------- | --------- | ------------ |
| `Planning` | `andrew`  | `plan/planning-pipeline-readiness` | `Heavy`   | `P2`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-transition-core`

- **Origin:** [internal]
- **Design:** `spec-planning-pipeline-readiness.md`
- **Task List:** [none]

- **Last Completed:** Spec created — `detailed` · RFC at `spec-planning-pipeline-readiness.md`, crystallizing the
  three-section spine: the shared `assess-draft-readiness` method (one formalization-ready bar, two fire points,
  checks-only on the buffer), the `create-spec` review/proceed interlock split + an overlay-recommendation norm in
  `DEV-RULES.ARC`, and the planning-stage-pointer mechanics (`Current Workflow` as a bare-basename encoding field,
  event-driven `Design`, `init-work-unit` folded in, six-event set pinned). Settled the encoding format
  (bare basename over a state token) and recorded leans on all three remaining implementation opens. Draft retired.
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Run `generate-tasks.md` — consume `spec-planning-pipeline-readiness.md`. Cohort gate: § C's
  CLI/executor tasks build on `lifecycle-transition-core`'s executor + `lifecycle-state-resolver`, discharged at
  transition-core's activation; sections A and B carry no such dependency and can land independently.

---
