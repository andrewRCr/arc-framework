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
**Last Completed**: **Pre-PRD cleanup pass on `plan-arc-modes.md` — completed 2026-04-13.**
Three-pass cleanup session after user flagged plan doc focus concerns and SESSION-NOTES bloat.

**Pass 1 — working doc drained and deleted.** `working-modes-gap-resolution.md` (813 lines)
removed after migrating the three remaining design findings into the plan doc: Finding #14
(shift-with-activation coordination — prompt-after-pause with sequential walk, pause is clean
failure boundary), Finding #17 (backing store mechanism — non-bare git clone at
`~/.arc-state/{project-id}/`, handoff-time sync, best-effort durability), Finding #18 (project
ID fallback chain — git remote → first-commit hash → UUID at
`.arc/system/.internal/project-id`, sticky once adopted). Four new captured-deliverables
added to the plan doc: pause-pointer field formalization (item 49a), Local-axis content sweep
(item 57), docs/ site mode-awareness pass (item 58), and content-audit-produces-its-own-sizing
(item 56 reframed).

**Pass 2 — plan doc focus audit.** Four Open Questions resolved and migrated: OQ 10 (Lite
forces `pm.layer: none`, both `arc-pm` and `external` forbidden), OQ 12 (five Waiting-For
categories committed final), OQ 13 (1-week staleness threshold, not configurable), OQ 14 (no
second-order drift check on `/arc-status`). Stale ADR-deferral language swept in three spots
(§ Installation Type Recipe Mechanism, § Prompt Orchestration, § Lite Config Template
Mechanism) — all updated to reflect the committed Tier 4 ADR 1 umbrella grouping. Seven stale
working-doc references swept across the plan doc. Item count corrected ~56 → ~59, typo
"working doc working doc" fixed.

**Pass 2.5 — inventory orphan audit.** Three items fixed: item 14 (bare repo → non-bare
clone mechanism reflecting Finding #17), item 20 (shift-work-unit.md surfaces the coordination
shape lock from Finding #14), item 37 (trimmed redundancy with § Strategy Applicability
Mapping rationale cells to prevent silent drift).

**Pass 3 — SESSION-NOTES reset.** Stripped `user/andrew/SESSION-NOTES.md` from 522 → 85 lines
by removing agent-accumulated meta-pattern commentary (planning session discipline lists,
observed-once pattern parks, reinforcement counters, session-arc retrospectives). Retained
only the operationally load-bearing ARCd rebrand forward-looking terminology entry. Two
feedback memories saved to `.claude/projects/.../memory/` to prevent re-accumulation in
future sessions: "SESSION-NOTES content discipline" and "No parking design decisions to
post-PRD."

**Post-hoc fix:** user caught that the pre-PRD Local-axis audit pass (planning-phase
discovery work, parallel to the 2026-04-13 Tier 4 install.type audit) had been conflated with
the impl-phase Local content sweep when captured as inventory item 57. Three fixes applied:
SESSION-NOTES updated with the Local-axis audit as a second pending pre-PRD item; inventory
item 57 updated to clarify it's impl-phase and a pre-PRD audit precedes it; Tier 4 Resolved
Decisions row updated to distinguish pre-PRD audit (pending) from impl-phase sweep (item 57).

**OQ 9 (default mode for `arc init`) stays open** per user direction — defaulting to Lite,
or even presenting it as recommended, undervalues the framework. Needs a third option or
reframing of the question. Captured inline at the OQ entry with user's 2026-04-13 concern.

**Blockers**: [none]

**Next Action**: **Two pre-PRD items pending before PRD authoring** — (1) OQ 9 resolution
(default mode question; small decision pass), (2) Pre-PRD Local-axis audit pass (parallel to
Tier 4 install.type audit; likely one comprehensive session). See
`user/andrew/SESSION-NOTES.md` § Context for Next Session for method, scope, and known starting
drift surfaces. Sequencing: OQ 9 first likely, then Local-axis audit. Both fit one session if
audit findings are narrow; two sessions if broader. **After both close, plan doc is
unconditionally PRD-ready.**

Plan doc current size: 4753 lines. Markdown lint clean across 168 files.

---

**Last Updated**: 2026-04-13 (pre-PRD cleanup pass — working doc drained, findings/OQs
closed, drift swept, SESSION-NOTES reset, Local-axis audit surfaced as pending)
