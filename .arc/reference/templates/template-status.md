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

- **Completed:** YYYY-MM-DD — set when `**State:**` transitions to `Complete`
  (written by clean-work-unit.md Mode 2 during integration prep). Records the
  date the work unit finished pre-merge; the file is deleted at archive.
- **Interrupts:** {category}/{name} — on incidental WU status files; names the
  parent WU paused by this incidental. See manage-incidental-work.md for the
  pause/resume coordination protocol.
- **Paused At:** <task-id> — on parent WU status files when interrupted by an
  incidental; records the task at which work paused.
- **Paused To:** {category}/{name} — on parent WU status files; names the
  incidental that caused the pause.
-->

<!--
State enum values:

- Planning    — PRD/plan in progress, no task list yet
- In Progress — Active task execution (the common case)
- Paused      — Interrupted by an incidental (see Paused At / Paused To pointers)
- Verifying   — All tasks complete, verify-work-unit.md in progress
- Complete    — Integration prep done, awaiting merge (brief window before
                file retirement at archive)
-->
