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
- **Next Task:** Task 3.1.b — Frontmatter parsing utility, test-first
  (line ~485)
- **Last Completed:** Task 3.1.a — renamed method schema field
  `has-override` → `override-active` across 25 occurrences in 21 files
  (16 method files × 2 copies, 2 READMEs, `strategy-session-operations.md`
  × 2 copies with 3 occurrences each, ADR-013 § Amendments). Status file,
  task list, and PRD P0.5 occurrences intentionally deferred — PRD bundles
  with Task 3.10 ADR-013 sanity check.
- **Blockers:** [none]
- **Next Action:** Begin Task 3.1.b — build shared `lib/frontmatter/`
  parsing module (Option A: extract the triple-dash + `yaml.load` scaffold
  from `src/scripts/audit-method-triggers.ts` into a generic parser, then
  layer method/extension schema parsers on top). Test-first: valid
  frontmatter, missing/malformed handling, schema field presence and types,
  `name` matches basename, audit-script regression.
