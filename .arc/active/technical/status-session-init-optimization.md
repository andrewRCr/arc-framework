# Status: Session-Init Optimization

> **About this file:** Per-WU state pointer — committed alongside task list updates
> in the same atomic operation. Lightweight factual state so anyone on this branch
> can see where work stands at a glance.
>
> **Companion:** `user/{identity}/SESSION-NOTES.md` (gitignored) carries personal
> session context. Together they implement P5 (Context Preservation). See
> `session-handoff.md` for the update protocol.

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** Task 3.9 — CLI test coverage — per-file restructure (line ~981)
- **Last Completed:** Task 3.8.d — Delete aggregates + install-pipeline cleanup + grep-verify.
  Parent Task 3.8 now complete. Deleted 4 aggregate files across both trees; removed entries
  from `init-recipe.json`, `classification.ts`, `manifest.json`, and (gitignored) `pristine.json`;
  updated 4 unit test files (including defensive `validate-package-neutrality` "retired in 3.8.d"
  case removal); rewrote deferred link-def pairs in `integrate-external-content.md` (both trees)
  and `03_configure-external-integration.md` (package-only). Scope-expansion from grep-verify:
  9 additional residual body references across 5 files (session-init/handoff + templates,
  01_verify-and-configure both trees, agent-pre-merge-review) rewritten — not enumerated in
  planning but mandated by the zero-operational-references grep requirement. Full Tier 2 quality
  gates pass (lint:md 195 files clean, lint:ts clean, typecheck clean, 626 tests pass, build
  succeeds). Previous: `6de83dc` Task 3.8.c — Strategy narrative rewrites across 7 docs.
- **Blockers:** [none]
- **Next Action:** Begin Task 3.9 — CLI test coverage for per-file restructure. Adds
  classification assertions for representative per-file method and extension paths; integration
  test verifying fresh `arc init` produces `system/methods/` + `system/extensions/` with all 18
  files (8 methods + 8 extensions + 2 READMEs) registered as Framework in the resulting
  `manifest.json`; integration test asserting `arc update` on a repo with legacy aggregate
  layout is an explicit no-op on the legacy files (PRD § Won't Do excludes migration code);
  idempotent re-update test; E2E `arc init --yes` layout check; E2E `arc init --reconfigure`
  regression check. Hook cross-flow coverage decision (call at implementation — specify or
  drop as duplicate).
