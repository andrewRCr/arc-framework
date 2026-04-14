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
**Last Completed**: **Second `plan-arcd-rebrand.md` iteration — docs-site dimension
resolved.** § 11 moves from "evaluation pending pre-PRD" to decided state with full
architectural capture: Astro Starlight as SSG (over heavily-customized mkdocs-material);
Cloudflare Pages hosting with direct Git integration (monorepo support, Wrangler fallback);
`arcd.dev` / `docs.arcd.dev` subdomain split (cleaner than path-based routing);
`apps/landing/` and `apps/docs/` monorepo structure as npm workspaces alongside the existing
`packages/arc-framework/`; minimal-polish landing page scope with time-boxed visual spike;
Starlight theming estimate (50–150 lines CSS); content migration audit (5 admonitions across
5 files, no mermaid/content tabs/snippets/Jinja — clean surface, `docs/` confirmed as single
source of truth); glightbox drop-by-default at impl time. Timing section resolves to the
planned two-WU split with concrete scope for each WU.

Earlier on this branch: first plan-arcd-rebrand iteration (`1a0d3d9` — three-tier naming,
Resolved Decisions, npm deprecation, self-migration, docs-site dimension placeholder); mkdocs
strict-mode CI fix (`0d6551a`, atomic); planning branch activation from `main`.

All pre-PRD decisions now resolved. Plan doc is watertight and ready to drive PRD creation.

**Blockers**: [none]

**Next Action**: **Invoke `1_create-prd.md` for both PRDs in parallel.** Per
`strategy-work-planning.md`'s one-plan-to-multiple-PRDs pattern: `plan-arcd-rebrand.md`
feeds two PRDs. First PRD: `prd-arcd-rebrand` (critical-path core rename). Second PRD:
`prd-arcd-docs-site` (sequenced immediately after WU 1; Starlight migration, landing page,
CF Pages deploy). Both authored in parallel on this planning branch. Plan-doc retirement
(§ Step 5 of create-prd) distributes reference content across `notes-arcd-rebrand.md` and/or
`notes-arcd-docs-site.md` as appropriate, then deletes the plan doc as part of the PRD
commits.

Session boundary deferred to next session per mode-transition rationale (planning discussion
→ structured PRD writing is a natural context-quality boundary). Next session: session-init
loads plan doc in decided state, then proceed directly to PRD creation without further
pre-PRD activity.

---

**Last Updated**: 2026-04-14 (docs-site decisions resolved; next session starts PRD creation)
