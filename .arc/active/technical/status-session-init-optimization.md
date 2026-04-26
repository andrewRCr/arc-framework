# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 5.7.c — Directory and file renames (next per amended
  execution order: 5.7.c → 5.7.d → 5.7.e → 5.7.g → 5.7.h → 5.7.i)
- **Last Completed:** Task 5.7.a — Per-agent source removal + agent
  classification retire + `includes` operator retirement. Deleted 7
  per-tool agent templates, both `template-agent.md` copies,
  `frontmatter/agent.ts` + companion test. Pruned `CONFIGURABLE_FILES`
  entries and frontmatter/index re-exports. Retired the `agent`
  PathClassification, `AGENT_PATH`/`AGENT_NAME` regexes, and dispatch
  in `validate-frontmatter.ts`. In-flight scope expansion: surfaced
  during fixture review that recipe `includes` operator had no
  remaining consumer post-5.7.f — narrowed `CONDITION_PATTERN` to `==`
  only, collapsed `evaluateCondition` to equality, dropped 6 includes
  tests (1 schema + 5 evaluator). Manifest sync: pruned 3 stale
  entries (`template-agent.md` Framework + 2 stale Configurable agent
  paths). Tier 2 gates clean (1099 tests / 8 files, typecheck, eslint,
  214 markdown files, build).
- **Blockers:** none
- **Next Action:** Begin Task 5.7.c — directory rename `system/agent/`
  → `system/briefs/` plus file renames `AGENT-BRIEFING.*.md` →
  `AGENT-BRIEF.*.md` (both `.arc/` and package trees). Use `git mv` to
  preserve history. Update `CONFIGURABLE_FILES` path in
  `classification.ts:74` and the unconditional briefs paths in
  `packages/arc-framework/init-recipe.json` (briefs-path renames
  migrated from 5.7.f at 5.7.f scope reduction).
