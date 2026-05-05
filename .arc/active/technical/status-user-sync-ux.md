# Status: User Sync UX Polish

## Work Unit Metadata

- **State:** In Progress
- **Branch:** technical/user-sync-ux

- **Spec:** `prd-user-sync-ux.md`
- **Task List:** `tasks-user-sync-ux.md`
- **Sibling Work Unit(s):** [none]

- **Last Completed:** Task 2.R.4.b — Action-oriented `arc user status` default with `--verbose`
  three-tier (parent 2.R.4 cascade-closed; `verbose: boolean` flag added to
  `buildUserStatusResult` defaulting to `true` for backward compat with composite `arc status`)
- **Next Task:** Task 2.R.5.a — Implement dev-mode stale-build check (line ~544)
- **Blockers:** [none]

- **Next Action:** Begin Task 2.R.5.a — implement an in-CLI `__DEV__`-gated check that compares
  `packages/arc-framework/dist/cli.js` mtime against the newest `src/**/*.ts` mtime; warn or
  fail fast when dist is stale, suggesting `npm run build`. Self-hosting only — published
  adopters skip the check.

---
