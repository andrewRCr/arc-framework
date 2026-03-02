# Work Status

## Session Startup Protocol (AI: Execute First)

**IMPORTANT**: Execute the complete session initialization workflow before reading work context below.

See: `.arc/system/workflows/arc/supplemental/session-init.md`

---

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
