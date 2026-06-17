# Metadata: Planning-Pipeline Readiness

| **State**  | **Owner** | **Branch**                         | **Class** | **Priority** |
| ---------- | --------- | ---------------------------------- | --------- | ------------ |
| `Planning` | `andrew`  | `plan/planning-pipeline-readiness` | `Heavy`   | `P2`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** `lifecycle-transition-core`

- **Origin:** [internal]
- **Design:** `spec-planning-pipeline-readiness.md`
- **Task List:** `tasks-planning-pipeline-readiness.md`

- **Last Completed:** Spec created — `detailed` · RFC at `spec-planning-pipeline-readiness.md`, crystallizing the
  three-section spine: the shared `assess-draft-readiness` method (one formalization-ready bar, two fire points,
  checks-only on the buffer), the `create-spec` review/proceed interlock split + an overlay-recommendation norm in
  `DEV-RULES.ARC`, and the planning-stage-pointer mechanics (`Current Workflow` as a bare-basename encoding field,
  event-driven `Design`, `init-work-unit` folded in, six-event set pinned). Settled the encoding format
  (bare basename over a state token) and recorded leans on all three remaining implementation opens. Draft retired.
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Run `activate-work-unit.md` — flip `State` to `Active` and rename the branch when implementation
  is about to begin. Cohort dependencies (`lifecycle-transition-core`, `lifecycle-state-resolver`) are shipped, so
  § C carries no remaining phasing block — all three sections can land.

---
