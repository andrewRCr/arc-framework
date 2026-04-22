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
- **Last Completed:** 3.R.i (Safety behaviors — 4 subtasks): non-TTY conflict degradation,
  push-recovery merge redesign, `--yes` flag + confirmation defaults, and ancestor-walk
  cap with `--max-walk` + diagnostic. 3.R.l.d added to Structural cleanup to fold in the
  callback → discriminated-union refactor for `runUserLoad`'s walk-exhausted surface.
- **Blockers:** none
- **Next Action:** Before 3.R.j.a, address the test-mock hygiene footgun flagged in
  SESSION-NOTES (`vi.clearAllMocks` preserves `.mockResolvedValue` — state leaked once
  during 3.R.i). Then begin 3.R.j.a: rename `disk ahead` → `local unsaved` across
  `UserStatusHeadline`, add ancestor distance + save timestamp + direction hint to
  status detail output, update `user-status.test.ts` assertions.
