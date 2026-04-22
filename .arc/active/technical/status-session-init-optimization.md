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
- **Next Task:** Task 3.R.b — `arc user status` command (line ~1212)
- **Last Completed:** Task 3.R.a — CLI vocabulary aligned with git fetch/pull semantics.
  Added `arc user fetch` for ref-only transport, rewired `arc user pull` to fetch + load,
  and replaced `arc sync --load` with direction-aware sync that inspects local-vs-remote
  note refs plus disk-vs-local snapshot state before pushing, pulling, or prompting on
  divergence. Updated command wiring and handler/unit-test coverage in `cli.ts`,
  `commands/user.ts`, `handlers/user.ts`, `handlers/sync.ts`,
  `__tests__/unit/sync.test.ts`, `__tests__/unit/user-handlers.test.ts`, and the affected
  `push-recovery.test.ts` mock surface. Tier 1 verification: targeted unit suites for
  `sync.test.ts`, `user-handlers.test.ts`, and `push-recovery.test.ts` pass; `typecheck`,
  `lint:ts`, and task-list markdown lint all clean.
- **Blockers:** [none]
- **Next Action:** Begin Task 3.R.b — add `arc user status` with actionable three-way state
  reporting across local notes ref, remote notes ref, and on-disk user state. Reuse the
  sync-state inspection surface introduced in 3.R.a, define clear output shapes for clean /
  remote-ahead / disk-ahead / conflict / remote-unavailable states, and add unit +
  integration coverage before moving deeper into backup hardening and session-init remote-sync.
