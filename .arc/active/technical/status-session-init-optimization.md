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
- **Next Task:** Task 3.R.k.c — `arc active status` probe (line ~1780)
- **Last Completed:** 3.R.k.b — `arc extensions status` probe + shared lib + `arc user status
  --json` retrofit. Shared lib at `src/lib/extensions/{point-scanner,orphan-detector}.ts`
  recognizes the single extension-point anchor (middle-dot + backtick-hashtag) across
  header-suffix and inline-bullet forms, classifies refs into resolved/orphan buckets at
  reference-level granularity. Command module at `src/commands/extensions/` (types/status/
  format) with handler + CLI wiring: default Clack (counts + lists + orphan count), `--all`
  (orphan details), `--session-init` (active-list only, skips workflow walk), `--json`
  (typed discriminated union on `mode`). `arc user status --json` retrofit suppresses Clack
  ceremony and writes JSON to stdout across all three scopes. Tier 1 green: typecheck /
  typecheck:test / lint:ts / test:unit (674, +31 new) / build; 10 new integration tests.
  End-to-end sanity surfaced one real-content orphan (`pre-merge-inbox-review` at
  `integrate-work-unit.md:166`) — fixed atomically alongside the task commit by dropping
  the spurious marker suffix from step 5's heading (not an extension fire point).
- **Blockers:** none
- **Next Action:** Begin 3.R.k.c — `arc active status` probe. Shared status-file reader in
  `src/lib/active/`, command module in `src/commands/active/`, handler + CLI wiring.
  Full-mode (per-WU state enumeration), `--session-init` (resolved path / null /
  disambiguation candidate list), `--json` (typed discriminated union on `mode`).
