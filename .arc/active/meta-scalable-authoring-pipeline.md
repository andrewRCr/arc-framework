# Metadata: Scalable Authoring Pipeline

| **State**  | **Owner** | **Branch**                         | **Class** | **Priority** |
| ---------- | --------- | ---------------------------------- | --------- | ------------ |
| `Active`   | `andrew`  | `feat/scalable-authoring-pipeline` | `Heavy`   | `P1`         |

- **Cohort:** `principle-anchored-core/agile-wu-lifecycle`
- **Depends On:** `class-model-foundation`

- **Origin:** [internal]
- **Design:** `spec-scalable-authoring-pipeline.md`
- **Task List:** `tasks-scalable-authoring-pipeline.md`

- **Last Completed:** Task 1.4 — `Design` multi-value plumbing, completing **Phase 1**: a shared
  `parseIdentifierList` helper (consolidating the three `parseDependsOn` copies), a new `identifier-list`
  valueClass rendering `Depends On` / `Design` per-element backticked (`` `a`, `b` ``, not the compound
  `` `a, b` ``), and `validate-meta-spec` accepting one _or_ two `Design` refs. Record-level parse stays
  render-form-blind via the global `stripInlineCode`.
- **Next Task:** Task 2.1 — Extract the `draft-design` workflow (Phase 2, line ~125)
- **Blockers:** [none]

- **Next Action:** Begin Phase 2, Task 2.1 — author the `draft-design` workflow (peer to create-spec /
  generate-tasks): one whole-block file with `low` / `medium` / `high` depth lanes, declaring
  `resolve-planning-depth` + `classify-work-unit` (the methods themselves are authored later in 2.3). Mode shift
  to workflow authoring — consult strategy-workflow-authoring; two-copy edit, mirror to the package source.

---
