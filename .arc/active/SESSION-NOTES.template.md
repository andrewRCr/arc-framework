# Session Notes

> **About this file:** Personal session context — gitignored. Companion to the tracked
> [WORK-STATUS.md](WORK-STATUS.md) which carries the factual project pointer (branch, task,
> blockers). Together they implement P5 (Context Preservation).
>
> **Lifecycle:** Created during session handoff, consumed during session init. Delete between
> work units — this is session-scoped context, not project documentation.
>
> **Portability:** Local by default. For cross-machine or team handoff, ARC uses git notes to
> attach session context to commits without adding commits or creating merge conflicts. See
> `session-handoff.md` for operations, `arc-config.yml` for `session.notes_push` behavior
> (always / prompt / manual).
>
> **Customization:** The session state mechanism is overridable — see `arc-methods.md` §
> session-state. **Team mode:** This file lives at `.arc/team/{name}/SESSION-NOTES.md` instead.
>
> **Writing guide:** See `session-handoff.md` for detailed content guidance, examples, and
> what to include vs. omit.

## Completed Work

**For uncommitted work**, use commit-level granularity — the next session needs enough detail
to recreate proper atomic commits. Map accomplishments to logical commits with task numbers,
file paths, and what changed. For committed work, a simple list with commit hashes suffices.

## Remaining Work Before Returning to Task List

<!-- Only for off-task-list work when the path back is known. -->
<!-- Otherwise: "Path unclear — will return to Task X.Y when resolved." -->

## Additional Context

<!-- Debugging insights, decisions made, things tried and ruled out, constraints discovered. -->
<!-- Use [none] if task list has all needed context. -->

---

**Last Updated**: {{YYYY-MM-DD}} (brief update description)
