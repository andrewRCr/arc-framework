# Status: Interlock Foundation

## Active Work

- **State:** In Progress
- **Branch:** technical/interlock-foundation
- **Task List:** `.arc/active/technical/tasks-interlock-foundation.md`
- **Next Task:** Task 2.3.a — CLI flag plumbing for `arc status --session-handoff` (line ~227)
- **Last Completed:** Task 2.2 — Session-init probe surfaces resolved autonomy (Task 2.2.a)
- **Blockers:** [none]
- **Next Action:** Begin Task 2.3.a — add `--session-handoff` flag to `arc status` (`cli.ts` +
  `handlers/status.ts` branch). JSON-only initially. Mutually exclusive with `--session-init` (both
  passed → non-zero exit, conflict message). Then 2.3.b (composite probe wiring) and 2.3.c (doc).
