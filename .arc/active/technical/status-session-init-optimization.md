# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 5.7.a — Package per-agent source removal + agent
  classification retire (next per amended execution order: 5.7.a → 5.7.c
  → 5.7.d → 5.7.e → 5.7.g → 5.7.h → 5.7.i)
- **Last Completed:** Task 5.7.f — `arc init` recipe cleanup. Dropped
  `template-agent.md` from unconditional `include_files`; removed the
  seven per-tool conditions for `system/agent/{TOOL}.ARC.md`. In-flight
  scope expansion: deleted two obsolete recipe-driven tests
  (`installs CLAUDE.ARC.md` in integration, `--tools claude,codex
  installs agent-specific files` in e2e) to keep the suite green at the
  recipe-cleanup boundary. Tier 2 gates clean (215 markdown files,
  typecheck, eslint, 1117 tests / 8 files).
- **Blockers:** none
- **Next Action:** Begin Task 5.7.a — multi-file package source removal
  plus agent classification retire. Scope: 7 per-agent template deletes,
  template-agent.md deletes (both copies), `classification.ts` entry
  removal, `frontmatter/agent.ts` + `agent.test.ts` deletes,
  `frontmatter/index.ts` re-export removal, `validate-frontmatter.ts`
  agent dispatch retire, agent test cases in
  `validate-frontmatter.test.ts`, fixture path updates in
  `recipe.test.ts` / `validate-package-neutrality.test.ts`. Two of
  5.7.a's post-init layout assertion targets already cleaned in 5.7.f
  (CLAUDE-install in `integration/init.test.ts`, tools-claude-codex in
  `e2e/init.e2e.test.ts`); remaining file-existence-coupled test
  cleanup stays in 5.7.a scope.
