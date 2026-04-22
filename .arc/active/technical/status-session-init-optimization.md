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
- **Next Task:** Task 3.R.j.a — Status vocabulary rename + detail enrichment (line ~1491)
- **Last Completed:** Pre-3.R.j.a mock hygiene hardening — hoisted factory-inline `vi.fn()`s
  to external consts in `push-recovery.test.ts`, `sync.test.ts`, `user-handlers.test.ts`;
  switched `beforeEach` blocks from `clearAllMocks` to `resetAllMocks` + explicit default
  re-establishment via `resetMockDefaults()` helpers. Codified the rule in
  DEV-RULES.PROJECT § Mock hygiene. 801 tests green.
- **Blockers:** none
- **Next Action:** Begin 3.R.j.a — rename `disk ahead` → `local unsaved` across
  `UserStatusHeadline`, add ancestor distance + save timestamp + direction hint to
  status detail output, update `user-status.test.ts` assertions.
