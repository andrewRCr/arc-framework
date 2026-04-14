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

**Branch**: `technical/plan-arcd-rebrand`
**Task List**: [none]
**Next Task**: —
**Last Completed**: **Both PRDs drafted, notes file extracted, plan doc retired.**
Single atomic planning commit: `prd-arcd-rebrand.md` (critical-path rename — package/CLI,
config seam, pm.mode/team.mode schema renames, CLI command cleanup, unified content
sweep, npm deprecation, repo rename, self-hosted migration) + `prd-arcd-docs-site.md`
(follow-up — `apps/` monorepo scaffold, Starlight docs site, bare-Astro landing page,
Remedy theme ported from `arc-portfolio`, CF Pages with Wrangler fallback, DNS cutover,
lightbox, old mkdocs toolchain retirement) + `notes-arcd-rebrand.md` (secured namespaces,
deprecation sequence walk, self-migration rationale, repo name variant rationale) +
`git rm plan-arcd-rebrand.md`. PRD 1 Success Criteria excepts `docs/**` from sweep
(handled inline in PRD 2 content port, avoiding double-work on files scheduled for
deletion). Both PRDs lint-clean.

Discovery pass surfaced concrete decisions beyond the plan: package dir →
`packages/arcd/`; deprecation release = `@arc-framework/cli@0.1.1`; four mandatory
session-boundary stops (repo rename, `@arcd/cli` publish, deprecation publish,
self-migration); manifest schema version bump with no migration function (zero-adoption
YAGNI); six sweep discipline guardrails A–F (common-noun framework vs brand; ARC
session/workspace/project stay ARC; ARCd install vs ARC install context-sensitive; CLI
chrome ARCd vs methodology-teaching ARC; AGENT-BRIEFING content drift; hook messages
tier-split). For the docs-site follow-up: `docs/` artifact disposition mapped file-by-file
(README banners → `/assets/`, demos → `/demos/`, frame-screenshot → `/scripts/`, logos
duplicated into both `apps/*/src/assets/`); Remedy palette adaptation strategy mapping to
Starlight `--sl-color-*` surface; SSL-before-records DNS cutover; no-zero-downtime
keep-alive guarantee; CF Web Analytics enabled.

**Blockers**: [none]

**Next Action**: **Generate tasks for `prd-arcd-rebrand` (this planning branch),
integrate, then activate in a new session from base.** Both PRDs were reviewed and
approved in this session. Under `branch.protection: full` the correct sequence is:

1. **This planning branch:** invoke `2_generate-tasks.md` for `prd-arcd-rebrand` only
   — docs-site PRD is pending-dependencies and its task list waits until post-rebrand
   reality is knowable (separate later planning cycle). Task list saves to
   `.arc/backlog/technical/tasks-arcd-rebrand.md` alongside the existing PRD and notes;
   create empty `atomic-arcd-rebrand.md` companion at the same time.
2. **This planning branch:** invoke `integrate-planning-branch.md` — push, create PR,
   merge to main (planning PR includes both PRDs, notes file, rebrand task list).
3. **Session boundary** after integration per `integrate-planning-branch.md` § Step 5
   (WORK-STATUS on base will be stale after merge; SESSION-NOTES carries forward state).
4. **New session from base:** invoke `activate-work-unit.md` for `prd-arcd-rebrand` —
   creates feature branch, moves PRD + tasks + notes from `backlog/` to `active/`,
   updates tracking.
5. **Execute rebrand WU** via `3_process-task-loop.md` on the feature branch.

The `prd-arcd-docs-site` PRD stays in backlog throughout rebrand execution. After the
rebrand integrates to main, a separate planning cycle generates its task list against
post-rebrand reality.

Planning phase of the rebrand WU is complete. Next session proceeds directly to task
generation for the rebrand PRD — no further PRD work or review gate before that step.

---

**Last Updated**: 2026-04-14 (both PRDs drafted and approved, plan retired; next action
is task generation for rebrand PRD on this planning branch)
