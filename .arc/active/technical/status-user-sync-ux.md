# Status: User Sync UX Polish

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/user-sync-ux

- **Spec:** `prd-user-sync-ux.md`
- **Task List:** `tasks-user-sync-ux.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Task 2.2.b — `arc user push` idempotent no-op
- **Next Task:** Task 2.2.c.i — Command-surface restructure (line ~169)
- **Blockers:** [none]

- **Next Action:** Begin Task 2.2.c.i — rename today's `arc sync` (notes-only) →
  `arc user sync`; register new top-level `arc sync` against an orchestrator handler stub;
  add `session.sync_interlock: manual | on-handoff` to config schema (default `on-handoff`);
  migrate `session.push_interlock: on-handoff` → `on-sync` value rename. Tests after schema
  and reader changes.

---
