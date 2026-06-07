# Metadata: Scalable Authoring Pipeline

| **State**  | **Owner** | **Branch**                         | **Class** | **Priority** |
| ---------- | --------- | ---------------------------------- | --------- | ------------ |
| `Active`   | `andrew`  | `feat/scalable-authoring-pipeline` | `Heavy`   | `P1`         |

- **Cohort:** `principle-anchored-core/agile-wu-lifecycle`
- **Depends On:** `class-model-foundation`

- **Origin:** [internal]
- **Design:** `spec-scalable-authoring-pipeline.md`
- **Task List:** `tasks-scalable-authoring-pipeline.md`

- **Last Completed:** Tasks 1.1–1.3 — the four-form spec template family (`template-spec-brief` / `-outline` /
  `-detailed-prd` / `-detailed-rfc`), two-copy, carrying the H1 grammar (backticked form/subtype + ` · ` middot,
  natural WU name) and `Success Criteria` as the form-invariant validation anchor; layered mode handled by
  structural `omit-when-paired` markers. Spec R2/R3/R5/R16 + SC #1 reconciled to parity.
- **Next Task:** Task 1.4 — `Design` multi-value plumbing (Phase 1, line ~77)
- **Blockers:** [none]

- **Next Action:** Begin Task 1.4 — the isolated `Design` multi-value CLI plumbing: extract a shared
  `parseIdentifierList` helper (consolidating the three `parseDependsOn` copies), teach `validate-meta-spec` to
  accept one _or_ two comma-separated `Design` refs (keep the multiple-_lines_ rejection), confirm consumer-site
  tolerance + create-spec's write. Test-first; single-source CLI under `packages/arc-framework/src/` (no `.arc/`
  mirror).

---
