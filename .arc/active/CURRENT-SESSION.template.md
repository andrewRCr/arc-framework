# Current Session

<!-- Team mode: each developer-agent pair uses team/{name}/CURRENT-SESSION.md instead. -->
<!-- See strategy-team-coordination.md for team session structure. -->

## Session Startup Protocol (AI: Execute First)

**IMPORTANT**: Execute the complete session initialization workflow before reading work context below.

See: `.arc/system/workflows/arc/supplemental/session-init.md`

---

## Session Information

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
**Next Action**: Start Task X.Y - Brief description
<!-- Can be preparatory work (strategy review, source reading) even when Current Task shows task number -->

---

## Session Context & Status

### Completed This Session

<!-- When documenting UNCOMMITTED work, use commit-level granularity so the next session -->
<!-- can recreate proper atomic commits from git diff: map accomplishments to logical -->
<!-- commits, include task numbers, note incidental work separately. -->

<!-- For committed work: simple list with commit hashes is sufficient. -->

### Blockers

[none]
<!-- OR: describe blockers, pending decisions, waiting on user clarification -->

### Additional Context for Next Session

<!-- Supplemental information not in the task list: debugging insights, -->
<!-- decisions made, things tried and ruled out, constraints discovered. -->
<!-- OR: [none] — if the task list has all needed context. -->

<!-- Working directory: If your project uses a non-standard working directory -->
<!-- (e.g., monorepo subdirectory, workspace root differs from repo root), -->
<!-- note it here so the next session starts in the right place. -->

---

**Last Updated**: {{YYYY-MM-DD}} (brief update description)
