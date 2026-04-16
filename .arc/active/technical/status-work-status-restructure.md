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
**Next Task:** Task 6.1 — `AGENT-BRIEFING.ARC.md` WORK-STATUS reference updates (line ~1351)
**Last Completed:** Phase 5 complete (Tasks 5.1–5.7) — plan-\* doc updates
shipped. 5.1–5.4 landed the `plan-arc-modes.md` editorial pass as a
single batched pass: Finding #4 FTL-removal carve-out callout pointing
to this WU's PRD plus forward-looking prohibition blockquote;
§ Shift Lifecycle vocabulary swap (task-list-host `**Status:**` →
status-file-host `**State:**`, preserving shift values verbatim);
enumerated forward-looking statement rewrites (Pure Option C
supplementary block, Scenario 7, "what this removes" bullets,
L4662 Lite+Local tree); and new `### Alignment with Work-Status
Restructure WU` subsection at tail of § Shift Lifecycle with Pure
Option C re-validation, metadata-in-place harmony, terminal-transition
ownership, vocabulary preservation, scenario battery re-walk, and
§ Mid-Session Orientation scope caveat. 5.5 added blockquote alignment
note to `plan-post-release-methodology.md`. 5.6 added the same-shape
note to `plan-expanded-planning-path.md`. 5.7 Tier 2 gates green:
full-repo `lint:md` clean (179 files, 0 errors); internal links
manually verified (restructure-prd/restructure-notes reference defs,
inline PRD links in both smaller plan docs, intra-file anchor
`#alignment-with-work-status-restructure-wu` resolves to L4400). No
package-project sync required — all three edited plan docs are
project-owned backlog. Pre-batch task-list hygiene also landed per
audit recommendations: 5.3 description expanded with enumerated line
targets (F1), 6.6.f added to grep both trees for `Following Task List`
residuals (F2).
**Blockers:** [none]
**Next Action:** Begin Phase 6 — remaining reference cleanup. Task 6.1
updates `AGENT-BRIEFING.ARC.md` WORK-STATUS references (Framework file
— package-source edit first, then sync to `.arc/`).
