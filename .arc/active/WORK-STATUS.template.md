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

**Branch**: `{{branch-prefix}}/{{work-name}}`
**Task List**: `.arc/active/{{category}}/tasks-{{work-name}}.md`
<!-- OR: [none associated] — for planning, boundary work, or sessions between task lists -->
**Following Task List**: Yes
<!-- OR: No - [brief context, e.g., "fixing connection timeout (will return to Task 4.5)"] -->
**Next Task**: Task X.Y — Brief description (line ~NNN)
<!-- REQUIRED when following task list — triple-anchor format enables graduated lookup at session init -->
<!-- Always points to the next task to work on (or continue if mid-task). Never [none] when incomplete tasks remain. -->
<!-- Omit only when no task list exists or all tasks are complete. -->
**Last Completed**: Task X.Z - Brief description
<!-- OR for off-task-list: brief description of what was completed -->
<!-- OR if work complete: "{{Work Name}} (Tasks 1-N, archived)" -->
**Blockers**: [none]
<!-- OR: describe blockers, pending decisions, waiting on user clarification -->
**Next Action**: Start Task X.Y - Brief description
<!-- Freeform — can be preparatory work, off-task-list activity, or simply "start Next Task" -->

---

**Last Updated**: {{YYYY-MM-DD}}
