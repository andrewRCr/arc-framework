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
**Next Task**: Task 1.1 — ADR-007 Tier 2 Amendment (line ~69)
**Last Completed**: Planning arc for Work-Status Restructure WU — PRD,
notes, task list, atomic companion, and 2 incidental methodology fixes
merged via PR #18 (`0d23b23`).

**Blockers**: [none]

**Next Action**: Execute Phase 1 of the restructure WU, starting with
Task 1.1 (ADR-007 Tier 2 Amendment). Source material for the amendment
lives in `notes-work-status-restructure.md` § Historical context +
§ Amendment framing — do not re-derive the conflation analysis.

Before Phase 1 begins, two incidental items need handling on this branch:

1. **Pre-commit hook exit-code bug** — direct commits to main under
   `branch.protection: full` print a failure message but exit 0, so
   protection is currently advisory only. Fix to be captured in
   `atomic-work-status-restructure.md` as the first atomic task. Source
   of truth: `packages/arc-framework/arc/system/githooks/pre-commit`.
2. **ATOMIC-INBOX audit** — 7 open items; 3 known subsumed by this WU
   (R14, Phase 7). Walk the remaining 4 against the task list and remove
   any that the restructure scope covers; keep residual in the inbox.

---

**Last Updated**: 2026-04-15 (work unit activated; first task is 1.1,
ADR-007 amendment)
