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
- **Next Task:** Task 1.3 — Migrate all workflows to frontmatter (line ~146)
- **Last Completed:** Task 1.2 — schema + author-side rule landed in new `strategy-workflow-authoring.md`;
  `template-workflow.md` created; `strategy-configurability-architecture.md` slimmed to a pointer;
  `DEV-RULES.ARC.md § When to Load Additional Guidance` gets one bullet instead of an inline subsection.
- **Blockers:** [none]
- **Next Action:** Begin Task 1.3 — migrate all 15 workflows under `system/workflows/` to YAML frontmatter
  per the reliable-trigger ground truth in `notes-session-init-optimization.md § Phase 1 Classification §
  Reliable-trigger locations`. Sub-steps 1.3.a–1.3.d break this down by subdirectory (arc/ top-level,
  session-lifecycle, work-unit-lifecycle, planning, supplemental). Two-copy sync per file.
