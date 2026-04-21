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
- **Next Task:** Task 3.8.a — Active hooks and integrity scripts (line ~781)
- **Last Completed:** Task 3.7 — Framework-sync + install pipeline registration (uncommitted).
  18 per-file paths registered in manifest + recipe. 16 per-file method/extension bodies
  classified Configurable (not Framework as originally specified); READMEs stay Framework.
  Design correction surfaced mid-task: `packages/arc-framework/arc/system/extensions/pre-merge-review.md`
  had been shipping with `active: true` + CodeRabbit `.actions` body (leak from commit `43e7749`,
  Task 1.4.b–f). Fixed: package-source file neutralized (`active: false`, `[No extension configured]`
  placeholder); 16 entries reclassified Configurable in both `classification.ts` and manifest;
  `pre-merge-review.md` pristine_hash updated (`3dd9dbc...` → `7540f37...`). Full suite green
  (716 tests: 673 unit/integration + 43 e2e), typecheck clean, framework-sync test passes
  post-reclassification. New Task 3.13 added for pre-commit hooks that block this leak pattern
  at the source (frontmatter `active: true` / `override-active: true` check + body placeholder
  check on `packages/arc-framework/arc/system/{extensions,methods}/*.md`).
- **Blockers:** [none]
- **Next Action:** Begin Task 3.8.a — rewrite `verify-integrity.sh` §7 (both copies) to enumerate
  per-file methods/extensions and validate YAML frontmatter instead of grepping aggregate sections;
  update `verify-arc-integrity.md` prose; retarget `commit-msg` L313 error at
  `system/methods/commit-context-format.md`. Two-copy sync applied throughout. Task 3.13 (leak
  guardrails) has flexible position within Phase 3 but must land before 3.12 closes.
