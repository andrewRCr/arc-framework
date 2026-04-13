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
**Last Completed**: **Finding #12/R6 resolved — Lite initial setup (Mechanism A flip from B
first-cut lean).** Strip analysis on `01_verify-and-configure.md` + `02_define-project.md`
surfaced ~20-25% / ~45-55% / combined ~35-40% Lite-Full overlap — below Finding #4's ~60% and
well below Finding #5's ~85-90%. **Overlap-ratio heuristic inverts at this level:** low overlap
favors **Mechanism A** (purpose-built distinct files per mode) because B produces brittle files
with 60-75% content wrapped in whole-section `arc:if` blocks. Finding #2's
`verify-work.md`/`verify-work-unit.md` precedent applies directly. First-cut lean (Mechanism B
via Finding #5 precedent + gate enumeration) flipped after user pushback reframed the question
from "how do we gate differences" to "what does Lite actually NEED from these workflows vs.
don't" — classic mechanism-class reframe pattern plus a content-audit-first-vs-mechanism-first
reframe pattern (new). **Workflow layer:** Full's `01_verify-and-configure.md` and
`02_define-project.md` reassigned from Finding #8's implicit unconditional baseline to
`install.type == full` recipe bucket. New purpose-built `01_setup-lite.md` under
`install.type == lite` bucket — four-step structure (Verify Install, Populate Session-Loaded
Docs, Optional META-PRD, Light Customization Awareness) plus Next Step. ~100-130 lines vs Full's
~364 combined. **Template layer:** Full's `META-PRD.template.md` unchanged; new opt-in
`META-PRD.lite.template.md` combines product direction + technical overview content in one
Lite-scoped ~80-120 line template. **Opt-in, not default** — agent-led Step 3 in
`01_setup-lite.md` introduces the option (rejected: install-time prompt — user doesn't know
yet; CLI flag — zero discoverability). Not in any recipe bucket; opt-in installation is a
separate CLI operation appending to the manifest. **Lightly reopens Finding #8 L411 META-PRD
commitment:** default Lite install still has no META-PRD; opt-in path available. Motivation:
prevent the "solo dev creates ad-hoc notes file outside ARC's scaffolding" pattern by offering
an ARC-native surface that graduation recognizes. **Graduation content migration** handled by
CLI + `switch-mode.md` workflow split (Shape γ) — CLI does mechanical operations, agent handles
judgment calls on content reshape between Lite's combined shape and Full's two-file shape.
**`strategy-configurability-architecture` drift-check result:** L87 Convention inventory
Document hierarchy row reframed dual-value (Full: META-PRD → PRD → tasks; Lite: PRD → tasks,
optional combined META-PRD) — in-scope fold-in. L104 Context footer row drift on Local/Tracked
axis — deferred. Classification holds applies-as-is; strategy count stays **4/4/2**.
**Drift-check hit rate:** 3-of-4 across targeted checks (#2 hit, #4 hit, #5 clean, #12 hit)
= ~75%, above Finding #4's 2-of-3 threshold. **Promoted formal strategy audit pass to Tier 4** —
single comprehensive sweep of all 10 framework strategies before closing pre-PRD. Also
fold-in: remove residual `Following Task List: No` line from Full's `01_verify-and-configure.md`
L38 Verify Session State example block (Finding #4 FTL removal sweep missed it). **Local/Tracked
axis scoped out of #12/R6** — OQ15's original phrasing covers both axes but working doc gate
listed only #8; Local-axis content impact (exclusion mechanism verification, backing store setup,
Path 2 inapplicability, portability redirect) plus axis naming/mechanism itself deferred to future
Local-axis work. **Plan doc migration landed in one atomic commit:** new § Lite Initial Setup
subsection (~240 lines) between § Lite Process-Task-Loop and § Graduation / Downgrade Paths,
parallel structure to § Lite Session Management and § Lite Process-Task-Loop. Six drift/update
fixes: Installation Type Recipe Mechanism § Feedforward entry for initial-setup workflows;
META-PRD bucket assignment reframed with opt-in Lite variant note; The Lite PRD § SQ1 softened
to "not installed by default; opt-in available" with Finding #12/R6 refinement paragraph;
Strategy Applicability Mapping `strategy-configurability-architecture` row rationale updated
with L87 drift fix note; § Follow-on implications expanded with Finding #12/R6 paragraph;
Graduation / Downgrade Paths gains META-PRD content migration paragraph. Six new Resolved
Decisions rows. Open Questions OQ15 marked resolved with scope note. Working doc Finding 12 →
✅ Resolved with full summary. **Tier 3 drained.** Eleventh consecutive pre-PRD finding resolved
direct-to-plan-doc at ~195-240 line scale. **Two new reasoning patterns surfaced worth
tracking:** (1) **content-audit-first-vs-mechanism-first reframe** — initial lean was
"mechanism choice based on overlap-ratio heuristic," user reframed to "what does Lite actually
need first, THEN mechanism follows." Applied once, not yet codified. (2) **Opt-in as a
light-reopening pattern** — Finding #8 commitments can be refined without being reversed via
opt-in paths that keep the default intact. First instance; observe whether it recurs before
promoting to persistent context.
**Blockers**: [none]
**Next Action**: **Tier 4 — close out pre-PRD phase.** Four items remaining: (a) Finding #11
(`install_config` precision — quick, gates settled); (b) A1 (hooks-already-local claim
validation); (c) A4 (template `arc:if` mechanism validation — may be fully subsumed by
Finding #5's and Finding #12's mechanism decisions, verify); (d) R4 (consolidated deliverables
inventory); and (e) the newly-promoted **formal strategy audit pass** — single comprehensive
sweep of all 10 framework strategies for Full-coupled in-doc surfaces before closing pre-PRD.
Likely one to two final sessions depending on how much the strategy audit pass surfaces.
Estimate: **2 more sessions to PRD-ready `plan-arc-modes.md`** (Tier 4 validation + cleanup,
then final consolidation pass). On schedule. **Post-#12/R6 persistent context note:** Two new
reasoning patterns surfaced this session (content-audit-first reframe, opt-in as light-reopening)
— both observed once, not yet promoted to persistent context. Watch for second occurrences during
Tier 4.

---

**Last Updated**: 2026-04-13 (Finding #12/R6 resolved — Lite initial setup Mechanism A flip,
opt-in Lite META-PRD, strategy audit pass promoted to Tier 4, Tier 3 drained)
