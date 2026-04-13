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
**Last Completed**: **Audit A H2 resolved — completed 2026-04-13.** Purpose-built
`arcd backing sync/restore/push/pull/status` command family (in the new `arcd` namespace from
the ARCd Rebrand WU) replaces the earlier "transparent redirect" framing, which was itself
hand-waving over a real concern-boundary (git-notes transport for a gitignored subtree vs.
whole-`.arc/` shadow-copy durability substrate — different scopes, anchors, failure modes,
and audiences). The two command families coexist; each install mode installs one; the
asymmetry is named, not hidden.

**Design shape landed:** Tracked installs keep `arc user save/load/push/pull` + `arc sync`
unchanged. Local installs get `arcd backing *` in a separate family; `arc user *` / `arc sync`
error with a pointer to `arcd backing --help`. Unifier lives at the workflow layer —
session-handoff's persist step branches on `backing.type` and invokes the mode-appropriate
family. `arcd backing restore` carries a divergence guard (refuses without `--force` when
`.arc/` has unsynced changes). Cross-machine conflict story (non-fast-forward push → pull →
refuse sync until resolved) folded into § Durability-Layer Commands rather than spun out as
H2.1 — git's conflict semantics at the backing-store-repo layer are sufficient.

**Sweep of 9 plan-doc surfaces:** new § Durability-Layer Commands replaces old § Portability
Layer Redirect (Transparent); Resolved Decisions rows rewritten (umbrella "Durability-layer
commands (Audit A H2)" + `user.sync_push` consumer-changes-not-semantics-changes refinement);
Deliverables items #24 (`session-handoff.template.md` now needs persist-step mode gates, was
pre-H2 "rename only"), #34 (Local mode config wording), #35 (durability-layer command family
deliverable) all rewritten; § Backing Store `arc sync` bullet, § What Changes vs. Tracked
Full bullet, § Content Audit CLI bullet, § Phrasing Sweep QUICK-REFERENCE bullet, and
`strategy-session-operations` Strategy Applicability cell all updated; H2 finding itself
carries a full Resolution block; Sequencing Plan shows H2 resolved with 2–4 remaining
sessions estimated.

**Course correction mid-flight.** Initial pass started editing `session-handoff.md`
directly to add `arc:if backing.type == *` gates — caught and reverted: that file is
Framework-layer (should go through the package source per Package-Project Sync), and
`backing.type` is a config key the modes WU introduces so adding a gate on it now is
premature implementation. Design intent captured in deliverable #24 and § Durability-Layer
Commands; actual workflow edit deferred to modes WU implementation.

**Still open from Audit A:** H3 (portability scenario battery), M2-M5 (project-ID stickiness
edge case, `arc project-id migrate` shape, single-active enforcement mechanism, Research
Findings Local entries), L1-L4 (agent/editor UX framing, pause+stash interaction, backing
store privacy model, `arc update` sync point). Captured in the Audit A workspace section
with status and sequencing plan.

**Blockers**: [none]

**Next Action**: **Audit A H3 — Local infrastructure scenario battery.** Dedicated session.
Scenario list in § Audit A / H3: re-clone recovery walk, backing store corruption, remote
conflict, project ID migration, `arc update` in Local, editor UX under agent use, CI cloning
a Local-mode repo, non-git repo, multi-user machine, zero-commit → first-commit transition.
Expect some to dissolve on contact ("same as tracked, no issue"); expect others to surface
real OQs. Some will exercise L1 (editor UX) and M2 (stickiness edge case) in practice and
may resolve them as side effects. After H3: M2-M5 consolidation pass, then L1-L4 polish
pass, then Audit B (content drift sweep) as the closing pre-PRD pass. Estimated 2–4 total
remaining sessions depending on H3 scenario depth. **Do not skip to Audit B early** — H3 may
surface new findings that change what Audit B looks for.

Plan doc current size: 5314 lines (+158 net this session). Markdown lint clean.

---

**Last Updated**: 2026-04-13 (Audit A H2 resolved — purpose-built backing command family,
9 surfaces swept, no sub-findings spawned)
