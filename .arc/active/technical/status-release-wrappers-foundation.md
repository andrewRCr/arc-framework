# Status: Interlock Release Wrappers — Foundation

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/release-wrappers-foundation

- **Spec:** `prd-release-wrappers-foundation.md`
- **Task List:** `tasks-release-wrappers-foundation.md`
- **Sibling Work Unit(s):** `plan-release-wrappers-ergonomics.md`

- **Last Completed:** Task 5.1 — `arc sync` audit-log integration. Audit-log
  surface now spans commit + push + sync; full reachable-cell coverage plus
  removal of the unreachable `worktree-push+notes-blocked` cell name.
- **Next Task:** Task 5.2 — Migrate session-init config envelope to three-tier
  resolution (line ~396)
- **Blockers:** [none]

- **Next Action:** Start Task 5.2 — switch `runConfigSessionInitStatus` from
  yaml-only `readConfigSettings` to three-tier `resolveAllSettings` for the full
  release-mode key surface. Subtasks 5.2.a (verify 1.2 resolver-additions) →
  5.2.b (migrate handler, test-first) → 5.2.c (regression coverage for existing
  envelope consumers).

---
