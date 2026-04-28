# Session Notes

> **About this file:** Personal session context — gitignored. Companion to the active work
> unit's `status-{name}.md` in `active/{category}/` which carries the factual project
> pointer (branch, task, blockers). Together they implement P5 (Context Preservation).
>
> **Lifecycle:** Created during session handoff, consumed during session init. Delete between
> work units — this is session-scoped context, not project documentation.
>
> **Portability:** Local by default. For cross-machine or team handoff, ARC uses git notes to
> attach the entire `user/{identity}/` directory to commits without creating merge conflicts.
> See `session-handoff.md` for operations, `arc-config.yml` for `user.sync_push` behavior
> (always / prompt / manual).
>
> **Writing guide:** See `session-handoff.md` for detailed content guidance, examples, and
> what to include vs. omit.

## Handoff Metadata

**Working On:** [none]
<!--
Markers:
  [none]                        — no active work
  [planning: {category}/{name}] — planning cycle, no WU yet
  [between work units]          — between activation and archive of adjacent WUs
  status-{name}.md              — normal case, file reference
-->

**Commit at Handoff:** `{{short-hash}}`
<!-- Record via: git rev-parse --short HEAD. Session-init uses this to detect staleness. -->
<!--
  **Session Type:** {planning | execution | integration}
  Optional override; absent → inferred from tracked state. Set only when the next session's
  intent diverges from what the active status file implies. Case-insensitive. Invalid value →
  ignored + warning at session-init.
-->

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

## Persistent Context

<!-- Entries that survive across handoffs — not rewritten each session. -->
<!-- Each entry has an explicit removal trigger. Review at each handoff: -->
<!-- remove entries whose triggers have been met. -->
<!-- Delete this section entirely if no persistent context is needed. -->

**Post-install setup:**
_Remove when: initial-setup sequence complete._

- First session after `arc init`. Work through the initial-setup sequence,
  starting at `.arc/system/workflows/arc/initial-setup/01_verify-and-configure.md`.
  The workflow guides onward steps.
