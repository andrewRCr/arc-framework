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
**Last Completed**: **`plan-arcd-rebrand.md` iteration on the rebrand planning branch.**
Expanded the plan doc with three-tier naming rationale (ARC methodology / ARCd implementation
/ ARCd Framework project-as-a-whole) anchoring the repo-name decision
(`andrewRCr/ARCd-framework`); full npm deprecation sequence with pre-public zero-adoption
framing; repo rename with private-repo blast-radius and session-boundary execution protocol;
self-hosted `.arc/` migration approach bypassing `arc update`'s three-way merge; and a
docs-site dimension placeholder covering custom-domain migration, landing page, SSG evaluation,
and feature enhancements. Open Questions section replaced with Resolved Decisions (license
Apache 2.0 already in-repo, repo name settled, relationship explanation reframed as PRD-phase
content deliverable). Scope estimate bumped from small-to-medium to medium at minimum pending
docs-site SSG evaluation outcome.

Earlier on this branch: mkdocs strict-mode CI fix (`0d6551a`, atomic) + planning branch
activation from `main`.

Driven by the planning-branch iteration objective: iterate until watertight before invoking
`1_create-prd.md`. One residual pre-PRD item queued — docs-site SSG evaluation on this branch.

**Blockers**: [none]

**Next Action**: **Execute docs-site SSG evaluation** as the final pre-PRD activity on this
planning branch. Evaluate alternatives to mkdocs-material — candidates include mintlify,
astro/starlight, docusaurus, and other well-maintained options. Output: decision on whether
to migrate away from mkdocs-material or stay, with concrete rationale. The evaluation outcome
gates the WU-split decision (stay on mkdocs-material → single WU, migrate to another SSG →
planned two-WU split per `strategy-work-planning.md`'s one-plan-to-multiple-PRDs pattern).
After evaluation completes: invoke `1_create-prd.md` (possibly twice, depending on split
decision).

---

**Last Updated**: 2026-04-14 (plan doc iteration landed on rebrand branch; SSG evaluation next)
