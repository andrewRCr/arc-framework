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
**Last Completed**: Finding #13 (Integrate × non-complete WU states) resolved and migrated
into `plan-arc-modes.md` as a new `### Integration Interaction with Shift States` subsection
under `## Shift Lifecycle`, placed between `### Skill Shape` and `### Why This Lives in Its
Own Cross-Cutting Section`. **Key reframe from a code read of `integrate-work-unit.md`:**
the handoff lean that the workflow "presumably validates `Status: Complete`" was wrong.
Step 1's checks are all about subtask/success-criteria state; the Status header line is an
imperative ("updated to Complete") not a gate, and the transition itself is a silent side
effect of Step 2's `clean-work-unit.md` Mode 2 run. There is no existing validation layer
to extend. That collapsed Finding #13 from "add a validation layer" to "surface the state
transition explicitly so it can accept the shift-lifecycle vocabulary." **Adopted entry
contract:** accept `In Progress`, `Complete`, and all `Waiting-For {category}` values;
`Paused` triggers a warn-and-confirm inline prompt (default no, not hard refuse with
`--force`). **Load-bearing semantics:** (1) invocation is the assertion — running integrate
on a `Waiting-For` WU is the user's assertion that the wait is over, workflow does not
validate what was waited for; (2) `Paused` ≠ `Waiting-For` per Finding B's vocabulary split,
so Paused gets a confirmation prompt while Waiting-For states don't; (3) integrate owns the
terminal `→ Complete` transition, `/arc-shift` owns mid-flight transitions
(pause/resume/rotate) only. Implementation-phase edit to `integrate-work-unit.md` is a
small block of workflow prose at the top of Step 1 — deferred to PRD task generation.
5 new Resolved Decisions rows (entry contract, invocation-as-assertion, Paused ergonomic,
terminal transition ownership, ADR deferral — composes with shift-lifecycle ADR). No
cascading sweeps — grep confirmed no existing integrate-state references in the plan doc.
Working doc Finding #13 removed (~35 lines), Sequencing § Tier 2 updated, R5 ("walk missing
shift scenarios") updated to reflect Finding #13 half resolved (Finding #14 half still
tracked). Third consecutive direct-to-plan-doc migration; third handoff lean in a row
partially overturned by a targeted code read.
**Blockers**: [none]
**Next Action**: Tier 2 smalls remaining. **#7** (Guardrail firing mechanism) is ⚪ parked
and can resume in parallel or later. **#16** (Full → Lite downgrade) is mostly 🟢 and just
needs a confirmation pass; Framing C from Finding #9 provides the reusable helper spine and
Finding #10's rename + composition pattern composes cleanly with a downgrade re-render.
Either is a reasonable next target. After Tier 2 drains (likely 1-2 more sessions), Tier 3
(#2, #4, #5, #6, #12/R6) becomes the focus. Rough estimate from here: 4-5 more sessions to
produce a PRD-ready `plan-arc-modes.md`.

---

**Last Updated**: 2026-04-10
