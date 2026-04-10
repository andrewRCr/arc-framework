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
**Following Task List**: No
**Next Task**: —
**Last Completed**: Tier 1 batch migration into `plan-arc-modes.md`. Migrated Findings #1
(Lite PRD functional requirements), #3 (Lite ship step), and #8 (recipe architecture for
mode-conditional installation) plus unvalidated assumptions A2 (fabricated 85-90% statistic)
and A3 (false recipe claim — same correction as #8's premise). Per user direction, the plan
doc now subsumes the working doc at full detail: full evaluation trails, factual landscapes,
rejected alternatives, stress-test trace-throughs, feedforward, and ADR deferral all landed
in the plan doc. Resolved findings were removed from the working doc entirely (not marked
absorbed). Plan doc grew by ~500 lines; working doc shrank by ~450 lines. New plan-doc
sections: `### The Lite PRD` under Mode 1: ARC Lite, and `### Installation Type Recipe
Mechanism` under Design Investigations. 13 new rows added to Resolved Decisions table; OQ2
and OQ3 marked resolved. Cascading `scope brief` → `Lite PRD` sweep across Guardrails,
Graduation Paths, Quick-Start, Lite+Local walkthrough, and Role Is a Tracked Concept.
Full markdown lint clean across 168 files.
**Blockers**: [none]
**Next Action**: Continue draining findings into the plan doc. Immediate next candidates are
Findings #9 (conditional prompts orchestration) and #10 (Lite `arc-config.yml` reduction
mechanism) — both were surfaced during Finding #8's evaluation and depend on its now-
migrated mechanism, so both are unblocked. SESSION-NOTES carries per-finding discovery
guidance and resolution leans (Finding #9: Approach 1 `show_when` on RecipePrompt entries;
Finding #10: Approach 2 rename to `arc-config.template.yml` + extend render pipeline).
After #9 and #10 land (ideally same session if both stay tight), Tier 1 + the Finding #8
adjacent-concerns story are fully closed and attention moves to Tier 2 smalls (#13, #7, #16).

---

**Last Updated**: 2026-04-10
