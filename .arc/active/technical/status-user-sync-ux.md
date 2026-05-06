# Status: User Sync UX Polish

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/user-sync-ux

- **Spec:** `prd-user-sync-ux.md`
- **Task List:** `tasks-user-sync-ux.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Task 4.2 — Shared-ref sync-state inference (Tasks 4.2.a–e complete)
- **Next Task:** Task 4.6.a — Session-init Step 2 `recommendedAction` (line ~1191)
- **Blockers:** [none]

- **Next Action:** Begin Task 4.6.a per Phase 4 implementation order (4.6.a → 4.3.a → 4.3.b → 4.3.c → 4.4 →
  4.5.a → 4.5.b → 4.5.c → 4.6.b, set during this session's audit). Adds `recommendedAction` /
  `recommendedPromptText` to the `worktree` and `user` slots of `arc status --session-init --json`, plus a
  top-level `recommendedCombinedPrompt` when both channels prompt. Lets `session-init.md` Step 2 prose collapse
  to "execute the slot's `recommendedAction`." Establishes the envelope pattern that 4.3.c later extends with
  a third (notes-load) channel — reverse order would have 4.3 author Step 2 prose 4.6.a immediately rewrites.

---
