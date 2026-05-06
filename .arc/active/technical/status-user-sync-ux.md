# Status: User Sync UX Polish

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/user-sync-ux

- **Spec:** `prd-user-sync-ux.md`
- **Task List:** `tasks-user-sync-ux.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Task 4.2.b — Bounded-fetch wrapper for notes-ref fetch in full-mode `arc status`
- **Next Task:** Task 4.2.c — Inference helper module `inferUserSyncCause` (line ~921)
- **Blockers:** [none]

- **Next Action:** Begin Task 4.2.c — implement pure `inferUserSyncCause(input)` in a new
  `packages/arc-framework/src/lib/user-sync/` module per the helper contract at the top of 4.2 (line ~882):
  inputs `{ localRefHash, remoteRefHash, sourceCommit, savedAt, latestNoteRefHistoryEntry, headReachable,
  offline }`, output `{ cause: UserSyncCause, confidence: "high" | "low" | "offline" }`. No IO. Test-first
  across the 6 listed behaviors. Implementer's choice (per task): include a "no-divergence" output value
  (uniform call site) or invoke only after divergence is detected — pick at implementation time and document
  in the helper's TSDoc.

---
