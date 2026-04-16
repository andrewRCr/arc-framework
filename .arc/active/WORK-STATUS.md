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
**Next Task**: Task 2.8 — `archive-work-unit.md` — delete per-WU file, do
not reset (line ~706)
**Last Completed**: Task 2.7 — rewrote `activate-work-unit.md` Step 5 from
"Update WORK-STATUS.md" to "Create Status File" (creates
`.arc/active/{category}/status-{name}.md` from `template-status.md` with the
initial field set). Step 8 staging blocks on both `arc-in-git` and
`none`/`external` paths now carry the new per-WU status file instead of the
singular `WORK-STATUS.md`; commit body line and Mode Detection / Checklist
Summary / Team-mode callout updated in parallel. Incidental-activation
routing callout placed after `**When to use:**` in Purpose (activation entry
fork), forward-referencing `manage-incidental-work.md` § Coordinated
Pause/Resume (Task 2.13). Added `[template-status]` and `[incidental]` link
defs. Step 4 and the `Status: Not Started` prerequisite intentionally left
untouched — they retire with Task 2.14. Synced package source → `.arc/`,
post-sync diff empty; markdown lint clean.

**Blockers**: [none]

**Next Action**: Proceed to Task 2.8: rewrite `archive-work-unit.md` so
archive-time behavior `git rm`s the per-WU `status-{name}.md` (instead of
resetting a singular `WORK-STATUS.md`). Preserve archival of the task list
and atomic companion file. Add an incidental-archive routing note pointing
at `manage-incidental-work.md` § Coordinated Pause/Resume for the parent
state flip (State: Paused → In Progress, clear Paused At / Paused To). Edit
package source first, sync to `.arc/`. Live `.arc/active/WORK-STATUS.md`
remains untouched until Phase 3 per Task 2.1's interim guard.

---

**Last Updated**: 2026-04-16 (Task 2.7 complete — `activate-work-unit.md`
rewritten for per-WU status file model; next is Task 2.8 archive-side mirror)
