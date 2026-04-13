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
**Last Completed**: **Tier 4 validation batch 1 — Findings #11 / A1 / A4 resolved.** Full
githooks + `arc-lib.sh` read (pre-commit 343 lines, commit-msg 401 lines, arc-lib.sh 78 lines)
verified zero tracked-mode assumptions in hook logic — degradation mode for `.arc/active/*`
staged-file scans under Local mode (`.git/info/exclude` applied) is graceful silent no-op via
`git diff --cached` returning empty for untracked paths. Plan doc cross-reference verified that
the template render layer (`needsRendering()` / `renderConditionals()` / `toOutputPath()`) is
exercised across Findings #4/#5/#10/#12/R6 with 13+ citation sites and direct reads of
`lib/template/render.ts` at L1039-1060. **Finding #11 closes subsumed with one plan-doc prose
insertion:** new "Consumer read paths" block added between § Configuration Identity's resolved
bullets and the "Still open" subsection, explicitly walking through CLI / hooks / workflows /
recipe consumer read paths. Manifest-only storage sufficient because hooks branch on other config
keys with `arc_config_get` fallback handling missing Lite sections cleanly, and workflows/agents
see install.type effects via pre-rendered content rather than a direct read surface. **A1 closes
confirmed with no plan-doc edit** — plan L2753-2756 already states Local Mode hook behavior
accurately. **A4 closes fully subsumed with no plan-doc edit** — plan doc centers the template
render layer as the primary mechanism for content-level mode differentiation (Mechanism B),
complementary to Mechanism A's recipe-bucket approach for structurally-distinct files. **Co-
verification pattern:** the same full-read pass resolved both #11 and A1, which is why the two
close together — they both hinge on `arc_config_get`'s fallback semantics for Lite's stripped
config. Three Tier 4 items resolved in a single atomic commit; two remain (R4, formal strategy
audit pass) plus the pending second commit for R4 migration and ADR grouping commitments.
**Blockers**: [none]
**Next Action**: **Commit B of this session's Tier 4 batch** — migrate R4 consolidated
deliverables inventory (~58 items grouped by CLI/workflows/templates/config/strategies/skills/
shift/cross-cutting/ADRs/content-sweep) as new plan-doc § Consolidated Deliverables Inventory
between § Content Audit and § Resolved Decisions; commit ADR grouping decisions (two ADRs, not four:
**ADR 1** "Recipe as Authoritative Install-Time Specification" umbrella covering the three
mechanism-sibling findings (#8, #9, #10) plus applied examples from #12/R6, #4, and #5; **ADR 2**
"Shift Lifecycle" covering state model, vocabulary, metadata-in-place with integrate × shift states
as behavioral
extension); update Resolved Decisions table (remove L4122 Framing C ADR row and L4132 Lite config
template ADR row as superseded, add two committed rows for the grouping decision + R4 migration,
update L4079 drift fix on shift-lifecycle ADR cross-reference); close working doc B4. Then the
remaining Tier 4 item is the **formal strategy audit pass** (single comprehensive sweep of all 10
framework strategies), deferred to next session per user direction. Estimate unchanged: one more
session after Commit B to reach PRD-ready `plan-arc-modes.md` depending on audit surface size.

---

**Last Updated**: 2026-04-13 (Tier 4 batch 1: Findings #11 / A1 / A4 resolved, prose insertion at
§ Configuration Identity Consumer read paths)
