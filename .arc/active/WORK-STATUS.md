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
**Last Completed**: **OQ 9 resolved + Audit A first pass on `plan-arc-modes.md` — completed
2026-04-13.** Two pre-PRD decisions landed in the plan doc this session.

**OQ 9 (default mode for `arc init`) — resolved.** `arc init` presents install type as a
concise education-first prompt with both modes as equal peers — **ARC** (canonical, listed
first) and **ARC Lite** (variant) — no pre-selection. Primer (~10–15 lines) carries
work-shape discriminator hints (concurrent concerns / PM / team → ARC; single focused effort
/ trial → ARC Lite) and points at the docs mode-overview page. Non-interactive
`arc init --yes` without `--install-type` / `--lite` / `--full` errors out rather than
silently picking. New Resolved Decisions row "Default mode for `arc init` (OQ 9)"; OQ 9
struck through; § Mode Fit Communication § Communication surfaces `arc init` bullet and
§ Init Flow Implications § Flags both updated; existing "install.type prompt default"
Resolved Decisions row rewritten to drop the stale `"full"` default claim.

**Audit A first pass — design-completeness audit for Local mode.** User flagged that Local
mode hasn't been stress-tested at Lite's depth. Audit surfaced 12 findings (1 meta, 3 HIGH,
5 MEDIUM, 4 LOW) confirming the gap. All findings captured in new **§ Audit A:
Local-Axis Design Completeness (Working)** temp workspace section in the plan doc (placed
between § Open Questions and § Research Findings). Section self-describes as working and
drains as findings migrate to permanent locations.

**H1 (Configuration Identity for Local axis) — resolved.** New § Configuration Identity —
Local Axis subsection under § Design Investigations, parallel in depth to the existing
§ Configuration Identity for Lite/Full. Manifest field `install_config.backing_type`,
flattened key `backing.type`, legacy migration to `"tracked"`, single schema bump covering
both axes, recipe bucket architecture (single-key buckets, no combinatorial pair-specific
buckets, no grammar extension), CLI flags (`--backing-type`, `--local` / `--tracked`
shorthand), **asymmetric non-interactive default** (backing.type → `tracked` for
back-compat, install.type errors without flag per OQ 9), interactive equal-peers prompt
shape, gated prompts (new `shared-gitignore` on `backing.type == local`; `team.mode` stays
single-gated on install.type with Local-layer render-time forcing), reconfigure boundary,
`BACKING_TYPE` token, drift mitigation. Three new Resolved Decisions rows: umbrella "Local
axis configuration identity (Audit A H1)", "`backing.type` prompt default (asymmetric with
`install.type`)", "Hooks read downstream keys in Local mode (Audit A H1 + M1)". **Finding
M1 (context footer enforcement mechanism) resolved as a side effect** — Local layer sets
`commit.context_footer: custom` with a preset pattern at install time, hooks stay
mode-agnostic.

**Still open from Audit A:** H2 (portability redirect semantics), H3 (Local scenario
battery), M2-M5 (project-ID stickiness edge case, `arc project-id migrate` shape, single-
active enforcement mechanism, Research Findings Local entries), L1-L4 (agent/editor UX
framing, pause+stash interaction, backing store privacy model, `arc update` sync point).
Captured in the Audit A workspace section with status and sequencing plan.

**Blockers**: [none]

**Next Action**: **Audit A resolution sequence — H2 next.** Portability layer redirect
semantics (§ Portability Layer Redirect at L3939). Need a scope-mapping decision for the
5-command `arc user save/load/push/pull` + `arc sync` redirect to backing store operations —
tracked mode is user/{identity}/-scoped, backing store is whole-.arc/-scoped. After H2:
H3 (Local infrastructure scenario battery, dedicated session), then M2-M5 consolidation
pass, then L1-L4 polish pass. Estimated 3–5 sessions total before PRD-ready. Audit B
(content drift sweep) runs after Audit A closes, as the final pre-PRD pass. **Do not skip
to Audit B early** — H3 in particular may surface new findings that change what Audit B
looks for.

Plan doc current size: 5156 lines. Markdown lint clean across 168 files.

---

**Last Updated**: 2026-04-13 (OQ 9 resolution + Audit A first pass; H1 and M1 resolved,
H2/H3/M2-M5/L1-L4 captured in temp workspace section for next-session work)
