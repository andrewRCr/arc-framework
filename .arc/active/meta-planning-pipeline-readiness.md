# Metadata: Planning-Pipeline Readiness

| **State** | **Owner** | **Branch**                         | **Class** | **Priority** |
| --------- | --------- | ---------------------------------- | --------- | ------------ |
| `Active`  | `andrew`  | `feat/planning-pipeline-readiness` | `Heavy`   | `P2`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-planning-pipeline-readiness.md`
- **Task List:** `tasks-planning-pipeline-readiness.md`

- **Last Completed:** Phases 1–2 complete (§§ A/B, docs-tier) — shared `assess-draft-readiness` method authored +
  both fire points (`draft-design` loop-exit, `create-spec` entry) routed through it; `create-spec` Finalize split
  into review/iterate + proceed-to-finalize gates; advisory-fork recommendation norm added to `DEV-RULES.ARC`.
- **Next Task:** Task 3.1 — Add the `Current Workflow` field to the meta model (`lib/active/meta-reader.ts`)
- **Blockers:** [none]

- **Next Action:** Run process-task-loop.md — begin Task 3.1 (Phase 3 / § C, code-tier, test-first)

---
