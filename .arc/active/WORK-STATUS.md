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

**Branch**: `technical/plan-operating-modes`
**Task List**: [none]
**Next Task**: —
**Last Completed**: **Finding #5 resolved — Lite process-task-loop (mechanism flip A→B).**
Reversed 2026-04-10 "variant over conditional" decision. The "noise in core operating doc"
argument applied to Mechanism C (runtime in-prose conditionals preserved in installed content),
not Mechanism B (install-time stripping via `renderConditionals()`). Under B, the adopter's
installed `3_process-task-loop.md` contains zero `arc:if` markers regardless of mode —
runtime cognitive load is zero. Two-file variant rejected: process-task-loop overlap is
~85-90% universal across 295 source lines (higher than Finding #4's session-init at ~60%),
making duplication cost and silent-divergence risk *more* severe, not less. Same rejection
reasoning as arc-config Approach 1 and Finding #4. **Implementation is purely additive gating
on an already-templated file:** `packages/arc-framework/arc/system/workflows/arc/3_process-task-loop.template.md`
already exists as a template with pre-existing `team.mode` (L23-34, L177-184) and `pm.mode`
(L236-246, L284-286) `arc:if` gates. Finding #5 adds an orthogonal `install.type` axis — no
rename, no mechanism change, no new render code. Cleaner than Finding #4 (which required a
`.template.md` rename). **Four gated surfaces:** (1) Branch/task list coupling bullet (L36-41)
— Full retains stacked-PRs / team sub-branches / archival / `rotate-branch` references;
Lite replaces with one-sentence "single task list on project branch until ship." (2)
Verification Phase pointer (L198) — Full `work-unit-lifecycle/verify-work-unit.md` → Lite
`verify-work.md` (downstream from Finding #2). (3) Next Step section (L200-205) — Full-only;
Lite's verification phase is terminal (ship step happens inside `verify-work.md`). (4)
Incidental Work Management section (L207-264) — multi-gate within: Quick Decision Guide
two-way gate (Full's incidental-task-list-vs-atomic tree / Lite's atomic-or-phase-insertion
routing), Where to Capture Atomic Tasks Full-only (Lite collapses to single destination
`atomic-tasks.md` because `pm.layer: none` excludes `strategy-planning-module` → no
`ATOMIC-INBOX`), Atomic Task Completion protocol **universal** (not gated), Complete
Workflow pointer Full-only. **Retained universally (~85-90%):** completion protocol (Tier 1
gates, task marking, pre-report checklist, mandatory stop, implied permission, deferred
review), coherent unit completion (Tier 2), test-first execution, issue triage, commit guide
integration, WORK-STATUS update protocol, atomicity check, Verification Phase section
heading/intro, Atomic Task Completion protocol, Task List Maintenance. Existing `team.mode`
and `pm.mode` gates compose orthogonally with new `install.type` gates.
**Drift-check result: `strategy-quality-gates` stays applies-as-is (clean).** Targeted
re-audit per Finding #2 / Finding #4 pattern surfaced no in-doc classification tables, no
Full-coupled example blocks, no references to `verify-work-unit` / `integrate-work-unit` /
archival / shift / team coordination / backlog. `### Phase 3` / `### Phase N` example blocks
are generic task-list skeletons. "Coherent unit completion" mentions are about parent-task
completion within a task list (valid in Lite). **Concept-not-content drift pattern did NOT
hit three-of-three** — two consecutive hits (#2, #4) but not this one. Per Finding #4's
threshold criterion, **no formal Finding #6 audit pass needed before Tier 4**. Strategy
count stays **4 applies-as-is / 4 needs-variant / 2 excluded**.
**Plan doc migration landed in one atomic commit:** new § Lite Process-Task-Loop subsection
(~195 lines) between § Lite Session Management and § Graduation / Downgrade Paths, parallel
structure to § Lite Session Management. Eight drift fixes: L1477 § What Stays Identical
"Process-task-loop" bullet reframed (overstated identity → narrow-surfaces note); § Conditional
Content Architecture density threshold bullet updated (variant-vs-conditional framing
collapsed into install-time-vs-runtime gating); § The Lite PRD workflow shape inverse
reference reframed (process-task-loop no longer "splits into variants"); § Atomic Companion
Finding #5 interaction paragraph updated with final cut list; § Feedforward recipe bucket
assignments cleaned (process-task-loop drops from install.type buckets) + clarifying sentence
on mixed-content files; § Feedforward Process-task-loop variant contents bullet marked
resolved; § Strategy Applicability Mapping Finding #5 follow-on updated with mechanism flip
and drift-check result. Three new Resolved Decisions rows (mechanism flip, gated surfaces,
`strategy-quality-gates` drift-check). OQ6 marked resolved. Working doc Finding 5 → ✅
Resolved with full summary. **Session arc:** re-read Finding #5 in working doc + plan doc
current framing + `3_process-task-loop.md` source + `strategy-quality-gates.md` (drift-check)
→ user confirmed mechanism flip A→B + cut list scope + no Lite treatment of
`manage-incidental-work.md` + drop pattern-watch → discovered package source was already a
template (cleaner than expected) → drafted subsection + eight drift fixes + three resolved
rows → markdown lint clean → direct-to-plan-doc at ~195-line scale (tenth consecutive
finding).
**Blockers**: [none]
**Next Action**: **Tier 3 — Finding #12/R6 (OQ15 initial-setup workflows).** Closes Tier 3.
`01_verify-and-configure.md` and `02_define-project.md` currently assume Full ARC tracked;
Lite and Local each need different setup paths. Question: separate workflows per mode, or
unified with mode-conditional sections? Gated on #1 and #8 (both landed). Apply the A/B/C
mechanism taxonomy from Findings #4/#5 during analysis — with two consecutive successful
Mechanism B applications, B should be the default lean for content-gating decisions unless
specific factors favor A (whole-file replacement semantics) or C (runtime invocation
frequency low). Likely one session. Post-#12/R6: **Tier 4** (#11 `install_config` precision;
A1 hooks-already-local claim; A4 template `arc:if` mechanism; R4 consolidated deliverables
inventory) is validation + cleanup, likely one final session. **Rough estimate: 2 more
sessions to PRD-ready `plan-arc-modes.md`.** On schedule.

---

**Last Updated**: 2026-04-13 (Finding #5 resolved — Lite process-task-loop mechanism flip
A→B, drift-check on strategy-quality-gates clean)
