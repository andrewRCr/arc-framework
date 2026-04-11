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
**Last Completed**: Finding #16 (Full → Lite downgrade) resolved and migrated into
`plan-arc-modes.md` § Graduation / Downgrade Paths. Shape γ adopted — new `arc mode switch
--to lite` / `--to full` CLI symmetric for both directions, with advisory workflow
`supplemental/switch-mode.md` for non-deterministic Category C2 review pass. Three-category
orphan taxonomy: (A) manifest-tracked files handled free by existing `resolveRemovalsInteractive`
pipeline in reconfigure.ts; (B) runtime user artifacts (archived WUs, backlog content,
surviving plan-* docs) via filesystem walk, per-top-level-directory prompt; (C) semantic
decay split into C1 (grep sweep for stale path refs — deterministic) and C2 (workflow review
pass for conceptual decay — non-deterministic). Entry-state gate refuses on >1 active WU,
generalizing Finding #13's invocation-as-assertion semantic. **Cross-cutting naming concern
absorbed into Rebrand WU:** word-collision surfaced during command-naming discussion — "mode"
collides across semantic levels once plan-arc-modes promotes install.type (Lite/Full) to
top-level term. Absorbed into ARCd Rebrand WU scope: `pm.mode` → `pm.layer` and `team.mode`
→ `team.enabled` key renames free the top-level namespace of ARCd-config.yml. Rebrand is
scheduled before Modes WU, so Modes inherits the clean namespace. Both plan docs updated:
plan-arc-modes.md scope boundary paragraph + 8 new Resolved Decisions rows; plan-arcd-rebrand.md
Scope expansion item 4 + Implementation Scope item 6 rewrite. **Finding #10 drift fixed in
same pass:** Lite → Full mechanics previously said `arc init --reconfigure`, contradicting
Finding #10's Reconfigure boundary row. Updated to `arc mode switch --to full` symmetric with
downgrade path. **Workflow landing:** `supplemental/switch-mode.md` (no new subdirectory —
supplemental/ already houses a framework-level contingent). **Code-read verification:**
reconfigure.ts / update.ts / removal-prompts.ts confirmed the exact orphan-handling UX the
user's framing assumed; `install.type` does not yet exist in code, so Finding #16 is a
planning decision for future consumption. **Fourth consecutive handoff lean partially
overturned by targeted code read** — pattern now structurally baked into session discipline.
Tier 2 drained. Atomic inbox entry added for potential `supplemental/` cleanup follow-on
(explicitly decoupled from Modes WU scope).
**Blockers**: [none]
**Next Action**: **Tier 2 drained** — only #7 (Guardrail firing mechanism) remains and is
currently ⚪ parked. **User direction for next session: re-examine #7 and decide whether
to bring it into scope rather than defer.** That decision gates how Tier 3 begins. If #7
comes into scope, it runs alongside or ahead of Tier 3. If it stays parked, Tier 3 begins
immediately with **Finding #6** (strategy applicability mapping for Lite) as the
highest-leverage target — scopes what "Lite" means at the strategy level and unblocks
#2/#4/#5 (Lite workflow shape findings). After Tier 3, Tier 4 (#11, A1, A4, R4) is
validation + cleanup. Rough estimate from here: 4-5 more sessions to produce a PRD-ready
`plan-arc-modes.md`, depending on the #7 scope decision.

---

**Last Updated**: 2026-04-11
