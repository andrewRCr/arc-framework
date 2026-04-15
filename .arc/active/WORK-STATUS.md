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

**Branch**: `technical/work-status-restructure`
**Task List**: `.arc/active/technical/tasks-work-status-restructure.md`
**Next Task**: Task 2.3 — SESSION-NOTES add `**Working On:**` field across both surfaces (line ~361)
**Last Completed**: Task 2.2 — per-WU status template landed at
`packages/arc-framework/arc/reference/templates/template-status.md` (+ sync
to `.arc/`). Retired `WORK-STATUS.template.md` and its scaffolding footprint
(init-recipe, SCAFFOLDED_FILES, setup.ts merge=ours + merge-driver writes —
matching Task 1.7's hook/doc retirement). Deleted unused
`writeArcGitattributesBlock` utility. Updated 10 test files. `active/` now
created lazily at activation (dropped from init expected-dirs + positive-
absence test added). SESSION-NOTES scaffolding: fixed stale WORK-STATUS
link in About callout, dropped Customization line, pre-populated Persistent
Context entry pointing at `initial-setup/01_verify-and-configure.md` so
first-session-after-init still surfaces the setup bridge (mode-agnostic
phrasing; Task 2.3 folds `**Working On:**` on top).

**Blockers**: [none]

**Next Action**: Execute Phase 2 Task 2.3 per its updated description. The
pre-execution note on Task 2.3 documents what Task 2.2 already landed on
Surface 1 (`packages/arc-framework/templates/user/SESSION-NOTES.md`): About
callout link fix, Customization line drop, pre-populated Persistent Context
bootstrap entry. Task 2.3 adds `**Working On:**` field near the top alongside
`**Commit at Handoff:**`, documents the marker vocabulary (`[none]`,
`[planning: {category}/{name}]`, `[between work units]`, `status-{name}.md`),
and drops `**Last Updated**`. Also update Surface 2 (the embedded template
skeleton in `session-handoff.template.md`) and sync Surface 2 to `.arc/`.
Live `.arc/active/WORK-STATUS.md` remains untouched until Phase 3 per Task
2.1's interim guard.

---

**Last Updated**: 2026-04-15 (Task 2.2 complete — per-WU status template
landed, scaffolding footprint retired, init→first-session bridge preserved
via SESSION-NOTES Persistent Context)
