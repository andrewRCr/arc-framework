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
- **Next Task:** 4.1 — Staging infrastructure
- **Last Completed:** 3.R.o — user-internal metadata layout cleanup. Moved local-only user
  portability metadata into `user/{identity}/.internal/`, kept legacy-root reads for backward
  compatibility, and extended coverage for the new storage layout.
- **Blockers:** none
- **Next Action:** Begin 4.1 — create `notes-docs-content-sweep.md` and document the
  `[TODO-docs-site]` staging convention for the Phase 4 audit.
