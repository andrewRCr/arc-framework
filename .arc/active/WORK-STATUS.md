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

**Branch**: `technical/plan-work-status-restructure`
**Task List**: [none]
**Next Task**: —
**Last Completed**: **Formalized `prd-work-status-restructure.md` from the plan doc.**
PRD captures 18 requirements (16 P0 + 2 P1 fold-ins), success criteria as
design-flaws-eliminated checklist plus post-migration invariants, and 5
implementation-deferred questions with direction. Detailed rationale
(historical ADR-007 conflation analysis, 6 considered alternatives, 8-scenario
stress-test battery, harmony-with-shift-lifecycle walk, deactivation case
matrix) carved into companion `notes-work-status-restructure.md`. Plan doc
retired in the same commit.

**Blockers**: [none]

**Next Action**: **Invoke `2_generate-tasks.md`** on
`prd-work-status-restructure.md` to produce the task list. Under
`branch.protection: full`:

1. **This planning branch:** run `2_generate-tasks.md` — 7 phases sketched in
   PRD § Technical Considerations (Foundation docs → Core workflow edits →
   Live migration → deactivate-work-unit → Plan-\* doc updates → Supporting
   cleanup → Integration and archival). Task generation should fold in an
   interim-state concern: Phase 2 first task writes a SESSION-NOTES
   Persistent Context entry flagging mid-restructure state (workflow files
   describe new model ahead of live state); Phase 3 cutover task removes it.
2. **This planning branch:** invoke `integrate-planning-branch.md` after task
   list approval — push, PR, merge to main. Planning PR carries the plan
   doc retirement (already in place), PRD, notes, and task list.
3. **Session boundary** after merge per `integrate-planning-branch.md` § Step 5.
4. **New session from base:** invoke `activate-work-unit.md` for
   `prd-work-status-restructure` — creates `technical/work-status-restructure`
   implementation branch, moves artifacts from `backlog/` to `active/`.
5. **Execute restructure WU** via `3_process-task-loop.md` starting with Phase 1
   (ADR-007 amendment + strategy updates). Phase 3 (live migration) dogfoods
   the WU's own output at the cutover point.

Post-restructure merge: reactivate rebrand WU as first real exercise of the
per-WU status file model across rotating branches.

---

**Last Updated**: 2026-04-15 (PRD + notes formalized from plan doc; next
action is task generation via 2_generate-tasks.md)
