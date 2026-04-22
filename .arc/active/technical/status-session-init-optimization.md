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
- **Next Task:** Task 3.R.f.1 — Two-copy doc sync for remaining CLI references (line ~1350)
- **Last Completed:** Tasks 3.R.e.1-3.R.e.2 — added a helper-style
  `arc user status --session-init` probe for agent-driven remote-state checks, documented
  session-init Step 1.5 in both workflow copies, removed the default 20-commit
  ancestor-walk cap, and surfaced loaded-note ancestor distance in user load summaries.
- **Blockers:** none
- **Next Action:** Begin Task 3.R.f.1 to sync remaining two-copy CLI references and
  bootstrap semantics docs.
