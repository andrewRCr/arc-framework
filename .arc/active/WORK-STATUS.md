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
**Last Completed**: **Finding #6 resolved — strategy applicability mapping for Lite.**
10 framework strategies in `.arc/reference/strategies/arc/` classified into applies-as-is
(6: adr-methodology, configurability-architecture, file-classification, quality-gates,
session-operations, task-list-formatting) / needs-variant (2: work-organization,
work-planning) / excluded (2: team-coordination, planning-module). New
§ Strategy Applicability Mapping subsection added to plan doc under § Content Audit (line
~3014), carrying the triage table, mechanism notes, and follow-on implications for
Findings #2/#4/#5. Mechanism: needs-variant strategies use inline
`<!-- arc:if install.type == full -->` blocks with a `.template.md` rename, reusing the
`arc-config.template.yml` render pipeline — no new code paths. Excluded strategies land in
the `install.type == full` recipe bucket. **Two plan doc refinements surfaced during
evaluation:** (1) `work-organization` upgraded from the prior "pure Excluded" label (line
2991) to needs-variant — Branch Protection Modes section is a universal git convention
worth retaining in Lite; (2) `team-coordination` excluded from Lite bucket, breaking slightly
with current Full+solo precedent (file ships to this project today) in favor of the "Lite
doesn't install what it doesn't use" principle. **Drift-check caught a STRATEGY-INDEX
overstatement** — description of `strategy-file-classification` referenced a "complete
inventory" section that does not exist; trimmed to "File taxonomy and naming conventions"
in both `.arc/` and `packages/arc-framework/arc/` copies. Committed as a separate atomic
drift fix. OQ7 marked resolved; upstream recipe-bucket pending references (plan doc § 4xx)
re-pointed at new subsection; workflow bullets (manage-incidental-work, maintain-project-docs)
re-parented from OQ7 to Findings #2/#4/#5 since those are workflows not strategies. Three
new Resolved Decisions rows (strategy applicability mapping, work-organization scope
refinement, team-coordination Lite treatment). Working doc Finding #6 marked ✅. Markdown
lint clean across all four files. **Session arc**: drift-check → verify-with-reads →
triage → discussion → migrate. Code-read-first and drift-check-before-rewrite patterns
held — caught the STRATEGY-INDEX drift and the line-2991/line-1684 partial-resolution state
before drafting. Direct-to-plan-doc pattern held despite earlier concern that Finding #6's
scale might force a scratch file — 10 rows of triage proved manageable inline.
**Blockers**: [none]
**Next Action**: **Tier 3 continues.** Finding #6 unblocks the three Lite workflow shape
findings, which are now actionable and tightly coupled:

- **Finding #2 (Lite task list shape)** — single-phase default vs. multi-phase
  available-but-unusual. Composes with `strategy-task-list-formatting` applies-as-is.
- **Finding #4 (Lite session management)** — reduced session-init document set, handoff
  ceremony weight. Composes with `strategy-session-operations` applies-as-is.
- **Finding #5 (Lite process-task-loop)** — loop adjustments for WU concepts (atomic
  companion files, incidental routing, coherent unit protocol). Composes with
  `strategy-quality-gates` + `strategy-task-list-formatting` applies-as-is.

The three are coupled enough (loop ↔ list shape ↔ session behavior) that bundling them
across 1–2 sessions is likely more efficient than serial resolution. Starting move:
**Finding #2** as the most self-contained, then let #4 and #5 follow naturally. **Scratch
space consideration:** given the coupling, a `temp-scratch-lite-workflow-shape.md`
capturing the cross-finding interactions may earn its keep — unlike Finding #6 where the
triage converged quickly, these three findings feed each other and a joint exploration
surface may be warranted. Decide early based on how tangled the first Finding #2 read
gets. Post-#2/#4/#5: #12/R6 (OQ15 initial-setup) closes Tier 3. Tier 4 (#11, A1, A4, R4)
is validation + cleanup. Rough estimate: 2-3 more sessions to PRD-ready.

---

**Last Updated**: 2026-04-11 (Finding #6 resolved — strategy applicability mapping for Lite)
