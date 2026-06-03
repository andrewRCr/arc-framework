# Session Notes

> _Personal context for this work unit — written at handoff, read at next session-init.
> See `strategy-session-operations.md` § SESSION-NOTES._

## Handoff Metadata

**Working On:** [none]
<!--
Markers:
  [none]                        — no active work
  [planning: {category}/{name}] — planning cycle, no WU yet
  [between work units]          — between activation and archive of adjacent WUs
  meta-{name}.md                — normal case, file reference
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

---
