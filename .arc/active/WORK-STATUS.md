# Work Status

> **About this file:** Tracked project pointer — committed alongside task list updates in the
> same atomic operation. Lightweight factual state so anyone on this branch can see where work
> stands at a glance.
>
> **Companion:** `user/{identity}/SESSION-NOTES.md` (gitignored) carries personal session
> context — what was tried, decisions made, debugging insights. Together they implement P5
> (Context Preservation). See `session-handoff.md` for the full update protocol.
>
> **Customization:** The session state mechanism is overridable — see `arc-methods.md` §
> session-state.

## Active Work

**Branch**: `technical/work-status-restructure`
**Task List**: `.arc/active/technical/tasks-work-status-restructure.md`
**Next Task**: Task 2.4 — Task list template remove WU-lifecycle state across all 7 surfaces (line ~421)
**Last Completed**: Task 2.3 — `**Working On:**` field installed across both
SESSION-NOTES surfaces (scaffolding template + embedded skeleton in
`session-handoff.template.md`). Paired top metadata block with
`**Commit at Handoff:**`; marker vocabulary (`[none]`, `[planning: …]`,
`[between work units]`, `status-{name}.md`) documented as identical HTML
comment block on both surfaces (three-surface contract with Tasks 2.5/2.6).
`**Last Updated**` and trailing `---` dropped. Surface 2 synced to `.arc/`.
Surface 1's Task 2.2 Persistent Context bootstrap entry preserved as-is.

**Blockers**: [none]

**Next Action**: Execute Phase 2 Task 2.4 — remove `**Status:**` header and
related WU-lifecycle state from task list templates across 7 surfaces inside
`strategy-task-list-formatting.md` (lifecycle moves to status file `**State:**`
per Task 2.2; pause/resume coordination moves to Task 2.13). `tasks-arcd-rebrand.md`
and archived task lists are explicitly out of scope. Sync to `.arc/` counterpart.
Live `.arc/active/WORK-STATUS.md` remains untouched until Phase 3 per Task
2.1's interim guard.

---

**Last Updated**: 2026-04-15 (Task 2.3 complete — `**Working On:**` field
installed across both SESSION-NOTES surfaces, marker vocabulary documented,
`**Last Updated**` dropped, Surface 2 synced to `.arc/`)
