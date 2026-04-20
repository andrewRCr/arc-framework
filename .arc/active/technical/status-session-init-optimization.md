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
- **Next Task:** Task 1.4 — Per-file restructure + method rename (structural prep for CI audit) (line ~206)
- **Last Completed:** Task 1.3 — Migrated all 25 workflow files under `system/workflows/` to YAML
  frontmatter per `strategy-workflow-authoring.md`. Mid-task refinements: audience enum expanded
  from binary (`agent | dual`) to three values (`agent | collaborative (human and agent) | human`);
  `prepare-commits.md` H1 renamed (`# Commit Guide` → `# Workflow: Prepare Commits`) to conform to
  body-conventions rule, display-text refs updated accordingly. Unused `[arc-methods]` /
  `[session-init]` ref defs removed where only the retired method-dep block used them.
- **Blockers:** [none]
- **Next Action:** Begin Task 1.4 — structural prep for the CI audit. Subtasks in order:
  (a) rename `pre-merge-review` method → `diff-review` with broadened generic-activity framing
  (extension stays `pre-merge-review`); (b) document per-file frontmatter schema in
  `strategy-session-operations.md`; (c) create `system/methods/` + `system/extensions/` directories
  (both copies); (d) migrate 8 methods to per-file; (e) migrate 8 extensions to per-file;
  (f) Tier 2 gate. Aggregate files stay in place until Phase 3.8 retires them. Task 1.5 (audit
  script) then runs against the per-file structure with no legacy-aggregate fallback branch.
