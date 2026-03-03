# Work Status

> **About this file:** Tracked project pointer — committed alongside task list updates in the
> same atomic operation. Lightweight factual state so anyone on this branch can see where work
> stands at a glance.
>
> **Companion:** [SESSION-NOTES.md](SESSION-NOTES.md) (gitignored) carries personal session context — what
> was tried, decisions made, debugging insights. Together they implement P5 (Context
> Preservation). See `session-handoff.md` for the full update protocol.
>
> **Customization:** The session state mechanism is overridable — see `arc-methods.md` §
> session-state. **Team mode:** Each developer-agent pair uses `team/{name}/WORK-STATUS.md`
> instead. See `strategy-team-coordination.md` for team session structure.

## Active Work

**Branch**: `{{branch-prefix}}/{{work-name}}`
**Task List**: `.arc/active/{{category}}/tasks-{{work-name}}.md`
<!-- OR: [none associated] — for planning, boundary work, or sessions between task lists -->
**Following Task List**: Yes
<!-- OR: No - [brief context, e.g., "fixing connection timeout (will return to Task 4.5)"] -->
**Current Task**: Task X.Y (line NNN) - Brief description
<!-- REQUIRED when following task list — enables direct jump during session init -->
<!-- Omit only if no task list or transitioning between task lists -->
**Last Completed**: Task X.Z - Brief description
<!-- OR for off-task-list: brief description of what was completed -->
<!-- OR if work complete: "{{Work Name}} (Tasks 1-N, archived)" -->
**Blockers**: [none]
<!-- OR: describe blockers, pending decisions, waiting on user clarification -->
**Next Action**: Start Task X.Y - Brief description
<!-- Can be preparatory work (strategy review, source reading) even when Current Task shows task number -->

---

**Last Updated**: {{YYYY-MM-DD}} (brief update description)
