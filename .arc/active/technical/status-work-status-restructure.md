# Status: Work-Status Restructure

> **About this file:** Per-WU state pointer — committed alongside task list updates
> in the same atomic operation. Lightweight factual state so anyone on this branch
> can see where work stands at a glance.
>
> **Companion:** `user/{identity}/SESSION-NOTES.md` (gitignored) carries personal
> session context. Together they implement P5 (Context Preservation). See
> `session-handoff.md` for the update protocol.

## Active Work

**State:** In Progress
**Branch:** technical/work-status-restructure
**Task List:** tasks-work-status-restructure.md
**Next Task:** Task 4.1 — Draft `deactivate-work-unit.md` — Case A primary procedure (line ~1035)
**Last Completed:** Task 3.5 — Phase 2 sweep gap closed. Updated `arc-handoff`
SKILL, `01_verify-and-configure` workflow (both package source + `.arc/`
mirror), `plan-arc-modes.md` Lite cascade line, and 5 demo scripts (scope
expanded from 3 — the broader `WORK-STATUS` sweep surfaced textual references
in `arc-handoff.sh` and `arc-commit.sh`). § Verify Session State in
`01_verify-and-configure.md` rewritten to confirm the SESSION-NOTES bootstrap
Persistent Context entry instead of a non-existent status file. Tier 1 lint
clean; framework-sync integration test passes (573 tests green). Phase 3
closed out.
**Blockers:** [none]
**Next Action:** Begin Phase 4 — author `deactivate-work-unit.md` from
scratch. Task 4.1 ships the Case A primary procedure (no work, not merged).
