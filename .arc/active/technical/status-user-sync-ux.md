# Status: User Sync UX Polish

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/user-sync-ux

- **Spec:** `prd-user-sync-ux.md`
- **Task List:** `tasks-user-sync-ux.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Task 4.3.a — Config schema for `session.init_load.notes` (default `prompt`, enum
  `manual | prompt | always`); Task 4.6.a — Session-init Step 2 `recommendedAction` envelope earlier in session
- **Next Task:** Task 4.3.b — Probe-side `loadNeeded` signal (line ~962)
- **Blockers:** [none]

- **Next Action:** Begin Task 4.3.b per Phase 4 implementation order (4.3.b → 4.3.c → 4.4 → 4.5.a → 4.5.b →
  4.5.c → 4.6.b). Extends `runUserSessionInitStatus` to compute the load-needed condition and surface
  `loadNeeded?: boolean` on the `clean` arm of `UserSessionInitStatusResult` (only when `refState === "same"`).
  Reuses the call-site primitives 4.2.d already assembles (`sourceCommit`, `headReachable`, ancestry calls)
  plus a `diskState === "current"` check from `inspectDiskVsLocalSnapshot`. `inferUserSyncCause` is not
  invoked — short-circuits on `same` ref state by 4.2.c focused-taxonomy invariant.

---
