# Status: User Sync UX Polish

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/user-sync-ux

- **Spec:** `prd-user-sync-ux.md`
- **Task List:** `tasks-user-sync-ux.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Task 3.2.a — Yaml schema, value enum, and surface rename
- **Next Task:** Task 3.2.b — `arc update` migration logic (line ~745)
- **Blockers:** [none]

- **Next Action:** Begin Task 3.2.b — implement inline `migrateUserSyncPush(...)` in
  `packages/arc-framework/src/commands/update.ts` before three-way merge; cover legacy
  key/value translation, old-key removal, idempotency, and conflict behavior test-first.

---
