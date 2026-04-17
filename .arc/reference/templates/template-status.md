# Status: [Work Name]

> **About this file:** Per-WU state pointer — committed alongside task list updates
> in the same atomic operation. Lightweight factual state so anyone on this branch
> can see where work stands at a glance.
>
> **Companion:** `user/{identity}/SESSION-NOTES.md` (gitignored) carries personal
> session context. Together they implement P5 (Context Preservation). See
> `session-handoff.md` for the update protocol.

## Active Work

**State:** —
**Branch:** —
**Task List:** —
**Next Task:** —
**Last Completed:** —
**Blockers:** [none]
**Next Action:** —

<!--
Optional fields (add when applicable):

- **Interrupts:** {category}/{name} — on incidental WU status files; names the
  parent WU paused by this incidental. See manage-incidental-work.md for the
  pause/resume coordination protocol.
- **Paused At:** <task-id> — on parent WU status files when interrupted by an
  incidental; records the task at which work paused.
- **Paused To:** {category}/{name} — on parent WU status files; names the
  incidental that caused the pause.
- **Superseded By:** tasks-{new-approach}.md (YYYY-MM-DD) — when State is
  Superseded (partial); points to the successor WU absorbing the remaining
  phases. See integrate-work-unit.md Appendix § Handling Partially Superseded
  Work for the full protocol.
-->

<!--
State enum values (authoritative — this is the single source of truth):

- In Progress        — Active task execution (the common case; set at
                       activate-work-unit.md Step 4 and on resume from pause)
- Paused (YYYY-MM-DD) — reason
                     — Interrupted by an incidental or future arc-shift pause
                       (see Interrupts / Paused At / Paused To pointers)
- Waiting-For {category} (YYYY-MM-DD) — reason
                     — Blocked awaiting external action (future arc-shift
                       lifecycle value; not yet written by any current workflow)
- Complete           — Work done, opened for integration. Covers the full
                       integration + pre-merge review + merge window; file is
                       stable through review (cycle-level context lives in
                       SESSION-NOTES / PR / git log, not here) and is deleted
                       at archive. Written by clean-work-unit.md Mode 2.
- Superseded (partial) — Partial work being integrated; remaining phases
                       absorbed into a successor WU (see Superseded By pointer
                       and integrate-work-unit.md Appendix)
-->
