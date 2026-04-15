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
**Next Task**: Task 2.5 — session-init.template.md scan strategy and
disambiguation precedence (line ~475)
**Last Completed**: Task 2.4 — WU-lifecycle state removed from task list
templates across all 7 surfaces in `strategy-task-list-formatting.md`
(Feature/Technical Status header + rules bullet; Incidental Status header +
Interrupts field + rules cluster including pause/resume; Worked Incidental
example Status + Interrupts lines; entire `### Status Field Values` H3
section). Synced to `.arc/` via file copy; post-sync diff empty.
Judgment call: the orphaned Interrupts rules bullet (not explicitly listed
in the 2.4 spec) was removed alongside pause/resume since the field itself
was being removed — keeping a rule describing a non-existent field would
create internal inconsistency. Task 2.13 scope expanded to add a matched
back-pointer from the strategy doc to `manage-incidental-work.md` once the
latter is rewritten — defers the pointer to a task where the target is
accurate rather than pointing at stale content mid-phase.

**Blockers**: [none]

**Next Action**: Execute Phase 2 Task 2.5 — rewrite
`session-init.template.md` for Full mode directory scan
(`.arc/active/**/status-*.md`) with disambiguation precedence (Working On
→ Branch match → State filter → user prompt). Lite mode variant uses fixed
path `.arc/active/status.md`. Preserve the 6 existing conditional blocks
(`arc:if team.mode`, `arc:if pm.mode`) and sync rendered output to
`.arc/` with this project's config (`team.mode: false`, `pm.mode: arc-in-git`).
Live `.arc/active/WORK-STATUS.md` remains untouched until Phase 3 per Task
2.1's interim guard.

---

**Last Updated**: 2026-04-15 (Task 2.4 complete — task list templates
stripped of WU-lifecycle state across 7 surfaces; Task 2.13 scope expanded
to carry a paired strategy-doc back-pointer)
