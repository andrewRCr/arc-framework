# Metadata: Work Organization Reform

- **State:** Active
- **Owner:** andrew
- **Branch:** technical/work-organization-reform

- **Origin:** [internal]
- **Spec:** `prd-work-organization-reform.md`

- **Depends On:** [none]
- **Cohort:** [none]

- **Task List:** `tasks-work-organization-reform.md`
- **Last Completed:** Task 6.10 (`6fb60134`) — Supplemental collapse: `reference/{research,analysis}/` →
  `reference/supplemental/{research,analysis}/` (R62, both copies, 33 renames, content preserved). Closes 6.10
  parent (a-d, f; 6.10.e parent-README deferred — no parent-README precedent in sibling `supplemental/` dirs).
  Pre-execution audit (arc-task-audit) caught the completed/ exclusion + both-copies discipline upfront. Two
  cascades surfaced during execution that the audit's `*.ts`-only CLI grep missed: a moved analysis doc's
  outbound relative link broke on +1 depth (fixed in 6.10.c), and `init-recipe.json` seed paths went stale —
  reddening the test suite (107 ENOENT) until the sweep repointed recipe + `manifest.json`. Folded in a
  6.9-leftover manifest fix per direction (stale `reference/archive/README.md` → `completed/README.md`).
- **Blockers:** [none]

- **Next Task:** Task 6.11.a — Codify split criterion in `strategy-file-classification.md` (line ~3867).

- **Next Action:** Start Task 6.11 — System/reference re-tier (`constitution/` → `system/rules/`, `briefs/` →
  `reference/briefs/`). Sequencing: 6.11.a (split criterion) → 6.11.b (constitution move) → 6.11.c (briefs
  move) → 6.11.d (inbound + CLI-seed-surface sweep) → 6.11.e (verify). See WORKING-MEMORY: 6.11.d must sweep
  `init-recipe.json` + `manifest.json` + `classification.ts`, not just docs (both dirs are in all three).

---
