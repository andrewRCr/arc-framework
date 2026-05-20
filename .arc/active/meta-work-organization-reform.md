# Metadata: Work Organization Reform

- **State:** Active
- **Owner:** andrew
- **Branch:** technical/work-organization-reform

- **Origin:** [internal]
- **Spec:** `prd-work-organization-reform.md`

- **Depends On:** [none]
- **Cohort:** [none]

- **Task List:** `tasks-work-organization-reform.md`
- **Last Completed:** Tasks 6.6.a-d + parent 6.6 (`c3a0e715..98a74872`) — subphase 6.6 closure:
  4 deprecated docs retired across 2 commits. 6.6.a retired PROJECT-STATUS.md (project instance
  and package source template) with coupled CLI scaffold trim (classification.ts SCAFFOLDED_FILES
  and init-recipe.json arc-in-git include) and lockstep test churn across 4 files; content-not-
  carried-forward (3 early WUs without archived metas plus Project Health Indicators rollup)
  logged in commit body per R40. 6.6.b/6.6.c verification-only (deletions already landed at
  6.4.d/e commit `37fe1b08`). 6.6.d retired template-completion-doc.md (both copies) plus
  init-recipe.json entry; manifest hygiene cleanup folded in (drift check caught stale
  manifest.json entries for both 6.6.a and 6.6.d deletions). Adopter-facing workflow-text refs
  deferred to Task 6.7 sweep.
- **Next Task:** Task 6.7.a — Branch-prefix patterns (`feature/`, `technical/`) (line ~3099).
- **Blockers:** [none]

- **Next Action:** Start Task 6.7.a — cross-reference sweep for branch-prefix patterns
  (`feature/`, `technical/`). Phase 6.7 is the heavy sweep phase: WORKING-MEMORY § "WOR 6.4
  unswept ripples" + "WOR Phase 7 unlanded rename" + 6.6 retired-doc refs (PROJECT-STATUS.md,
  template-completion-doc.md, plan-roadmap-evolution.md, plan-completion-status-consolidation.md)
  all flow through this phase. Operational tip in SESSION-NOTES § Additional Context: invoke
  `validate-links.sh` per-file (not on staged-only) to flush pre-existing broken refs
  comprehensively before the sweep gets noisy.

---
