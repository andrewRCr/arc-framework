# Status: Work-Status Restructure

> **About this file:** Per-WU state pointer — committed alongside task list updates
> in the same atomic operation. Lightweight factual state so anyone on this branch
> can see where work stands at a glance.
>
> **Companion:** `user/{identity}/SESSION-NOTES.md` (gitignored) carries personal
> session context. Together they implement P5 (Context Preservation). See
> `session-handoff.md` for the update protocol.

## Active Work

**State:** In Progress
**Branch:** technical/work-status-restructure
**Task List:** tasks-work-status-restructure.md
**Next Task:** Task 5.1 — `plan-arc-modes.md` Finding #4 carve-out update (line ~1281)
**Last Completed:** Phase 4 (Tasks 4.1–4.4) — shipped
`deactivate-work-unit.md` workflow. Task 4.1 created the file with Case A
end-to-end (PR close → base checkout → branch delete → mode-specific
cleanup: arc-in-git auto-reverts via branch deletion, external flips
tracker + deletes local scaffold, none deletes with optional preserve-
outside-`.arc/` note). Task 4.2 added the "When NOT to Deactivate" section
routing Cases B/C/D (pause via future arc-shift / reversal-PR recipe /
integrate-or-clean) with per-case "Why this isn't deactivation" rationales.
Task 4.3 registered the file in `manifest.json` (alphabetical, Framework
classification) and added a `## Related Workflows` section to
`activate-work-unit.md` for bidirectional discoverability; pristine.json
deliberately not updated (see 4.3 completion notes for rationale). Task 4.4
Tier 2 gates green: lint:md 179 files 0 errors, outbound + inbound link
checks clean (manage-incidental-work.md's anticipatory links now resolve),
framework-sync.test.ts 103/103. Dual-copy sync preserved.
**Blockers:** [none]
**Next Action:** Begin Phase 5 — plan-\* doc updates. Task 5.1 updates
`plan-arc-modes.md` Finding #4 carve-out to reference this WU as the
Following-Task-List-field-removal resolution (per PRD R17).
