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
**Last Completed**: Finding #10 (Lite `arc-config.yml` reduction mechanism) resolved and
migrated into `plan-arc-modes.md` as a new `### Lite Config Template Mechanism` subsection
under Design Investigations, sibling to Findings #8 and #9. Pre-migration code reads
(`lib/template/render.ts`, `lib/classification.ts`, `lib/manifest/apply.ts`,
`commands/init.ts`) revealed the session's lean had a stale premise: `needsRendering()`
already matches `/\.template\.[^/]+$/` today (not `.template.md`-only), and
`renderConditionals()` has zero markdown assumptions. **No render pipeline extension
required.** That reframe dropped Approach 2's cost to near-zero and eliminated Approach 1
(two-file fallback) as a serious contender. **Adopted Approach 2** — rename
`system/arc-config.yml` → `system/arc-config.template.yml` and gate the `pm.mode` and
`team.mode` sections with `<!-- arc:if install.type == full -->` directives. Composition
order: `renderConfigOverrides(renderConditionals(renderTokens(raw, tokens), config),
overrides)`. Call-site restructuring: `renderTemplate()` in `apply.ts` and its inline mirror
in `init.ts` fall through to the normal `needsRendering()` branch, then apply
`renderConfigOverrides()` as a post-pass — one conditional restructured, no new code paths.
`ARC_CONFIG_TEMPLATE_PATH` flips in `constants.ts:11`; `CONFIGURABLE_FILES` set entry flips
in `classification.ts:74`. Manifest lifecycle during rename: zero migration cost — entries
are keyed by output path (stable). Gated section walk confirmed tight set: `pm.mode` +
`team.mode` only. Finding #1's pending template-prd single-file-vs-variant decision closed
by consistency: `template-prd.md` stays in the unconditional baseline with `arc:if`
directives, matching `arc-config.template.yml`. 10 new Resolved Decisions rows. Cascading
sweeps across Configuration Identity, Installation Type feedforward, The Lite PRD §
Template delivery mechanism, Configuration and Installation § Lite config template, and
Configurability Architecture Cleanup § Mode-Aware Config Template Mechanism. Working doc
Finding #10 removed (~62 lines); Sequencing § Tier 3 updated (now only #2, #4, #5, #6, and
\#12/R6 pending). Tier 1 fully drained (#1, #3, #8 + adjacent-concern companions #9, #10).
**Blockers**: [none]
**Next Action**: Tier 2 smalls. **#13** (Integrate × non-complete WU states) is a state-
machine sketch with small scope — likely the next candidate. **#7** (Guardrail firing
mechanism) is ⚪ parked and can resume in parallel or later. **#16** (Full → Lite downgrade)
is mostly 🟢 and needs a confirmation pass; Framing C from Finding #9 provides the reusable
helper spine, and Finding #10's rename + composition pattern composes cleanly with a
downgrade re-render. Pick one of #13, #7, #16 to resolve next — #13 is the most self-
contained starting point.

---

**Last Updated**: 2026-04-10
