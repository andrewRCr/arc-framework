# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 4.2.g.d — Pre-commit hook — DEV-RULES frontmatter validation (line ~2817)
- **Last Completed:** Task 4.2.g.c — Composite wiring + handler integration. `domainRules` slot
  added to `SessionInitProbeResult` / `SessionInitProbes`; `runSessionInitStatus` extended to a
  5-slot `Promise.all`; `buildSessionInitStatusSummary` renders a `Domain Rules:` section after
  `Active:`; handler binds the new probe in the session-init branch. Full-mode `StatusResult`
  unchanged per the resolved session-init-only design. 7 behavior tests added (3 orchestrator,
  4 formatter), existing "invokes every probe" and JSON round-trip tests extended; integration
  fixture creates empty `constitution/` and binds the probe.
- **Blockers:** none
- **Next Action:** Begin 4.2.g.d — new CHECK in `.arc/system/githooks/pre-commit` validating
  staged `DEV-RULES.*.md` files (excluding ARC/PROJECT by path) parse against the domain-rules
  frontmatter schema. Mirrors the method/extension frontmatter hook pattern from Phase 3. Two-copy
  sync on `pre-commit`. 7 test behaviors enumerated in the task list. **Note:** 4.2.g.d and .e run
  in parallel per the dependency graph — .e (CI audit extension) is an alternative starting point.
