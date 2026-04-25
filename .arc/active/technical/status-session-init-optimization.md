# Status: Session-Init Optimization

## Active Work

- **State:** In Progress
- **Branch:** technical/session-init-optimization
- **Task List:** `.arc/active/technical/tasks-session-init-optimization.md`
- **Next Task:** 5.0.d — CLI status reporting surfaces — worktree
  qualifier (line ~3592)
- **Last Completed:** Task 5.0.c — composite probe envelope adds a
  peer `worktree` slot wrapped in `Probe<WorktreeSyncStatusResult>`
  and an optional `qualifier: "clean-at-current-head"` on
  `user.value` when worktree is `remote-ahead` and user notes are
  `clean`. Cross-channel qualifier computed in the composite
  (`runSessionInitStatus` post-processes resolved slots) so the user
  probe stays independently reusable. New
  `UserSessionInitQualifier` union narrows the value space; future
  qualifiers can extend without changing the carrier shape. Worktree
  slot positioned between User and Extensions in both type ordering
  and the Clack formatter (one-line phrase per `WorktreeSyncState`,
  `remote-unavailable` carries `failureReason` in parens). Handler
  reuses the same `remoteSyncEnabled` flag for both probes — one
  config read, two consistent gates. Test-first batched in a single
  round (7 behaviors). Tier 1 gates clean (lint:ts, typecheck
  src+test, 859/859 unit, full `npm test` 46/46, `npm run build`,
  live `npx arc status --session-init --json` smoke test
  confirmed envelope shape).
- **Blockers:** none
- **Next Action:** Begin Task 5.0.d — extend the human-facing
  notes-status surfaces (`arc user status`, direction reporting in
  `arc sync`) with a concise qualifier line when the worktree is
  `remote-ahead` or `diverged`. Conditional detail line (not a new
  headline), single line where possible (≤80 chars). `--offline`
  flag skips the worktree probe symmetrically with the notes
  remote probe; `remote-unavailable` worktree state surfaces a
  softer "remote comparison unavailable" qualifier. Scope is
  reporting only — action commands (`arc user save`, `arc user
  push`) are out of scope. Extends `runUserStatus` (5.0.c covered
  the session-init surface). Test-first per task spec at line ~3592.
