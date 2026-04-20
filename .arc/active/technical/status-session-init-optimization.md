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
- **Next Task:** Task 1.4 — Reliable-trigger CI audit script (test-first) (line ~206)
- **Last Completed:** Task 1.3 — Migrated all 25 workflow files under `system/workflows/` to YAML
  frontmatter per `strategy-workflow-authoring.md`. Mid-task refinements: audience enum expanded
  from binary (`agent | dual`) to three values (`agent | collaborative (human and agent) | human`);
  `prepare-commits.md` H1 renamed (`# Commit Guide` → `# Workflow: Prepare Commits`) to conform to
  body-conventions rule, display-text refs updated accordingly. Unused `[arc-methods]` /
  `[session-init]` ref defs removed where only the retired method-dep block used them.
- **Blockers:** [none]
- **Next Action:** Begin Task 1.4 — write the CI audit script at
  `packages/arc-framework/scripts/audit-method-triggers.ts` with unit tests at
  `packages/arc-framework/__tests__/unit/scripts/audit-method-triggers.test.ts` (test-first per the
  behavior list in the task spec). Add `"lint:arc"` npm script to root + package `package.json`;
  add `tsx` dev dep if missing; verify `scripts/` excluded from published npm package. CI wiring
  is Task 1.5.
