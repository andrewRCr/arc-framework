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
**Last Completed**: Finding #9 (Conditional prompts orchestration) resolved and migrated into
`plan-arc-modes.md`. Pre-migration code read revealed the handoff's resolution lean needed
reframing: `recipe.prompts` is validated but never consumed — `validateRecipe()` is the only
code that reads it, and the hand-rolled `runInitPrompts()` duplicates the same four prompts
with richer UX across seven sites total (`runInitPrompts`, `runReconfigurePrompts`,
`runJoinPrompts`, `buildNonInteractivePrompts`, `buildNonInteractiveReconfigurePrompts`,
`buildConfigMap`, `buildConfigKeyOverrides`, plus `buildTokenMap`). Finding collapsed into a
broader question about recipe authority; three framings evaluated (A: hand-coded gating; B:
full data-driven loop; C: narrow recipe authority). **Adopted Framing C** — recipe owns
prompt identity + `config_key`/`token` mapping + gating via new `show_when` field; hand-rolled
code keeps UX. `install.type` added as a new recipe prompt at position 1 with default `"full"`.
`buildConfigMap`/`buildConfigKeyOverrides`/`buildTokenMap` refactor iterates `recipe.prompts`
for mapping. Drift mitigation via unit tests comparing recipe IDs to exported
`INIT_PROMPT_IDS` / `RECONFIGURE_PROMPT_IDS` constants. Reconfigure boundary: `arc init
--reconfigure` does NOT mutate `install.type`; Lite↔Full transition is a distinct CLI surface
(Finding #16 for downgrade, § Graduation Paths for upgrade). ADR deferred to PRD
implementation, likely combined with Finding #8's mechanism ADR. New plan-doc subsection:
`### Prompt Orchestration and Recipe Authority` under Design Investigations. 12 new Resolved
Decisions rows. Cascading sweeps across Configuration Identity, Configuration and
Installation, and Init Flow Implications (including new `--install-type` canonical flag
entry). Working doc Finding #9 removed (~62 lines); Sequencing § Tier 3 updated. Migration
committed as a single atomic commit mirroring the Tier 1 batch pattern.
**Blockers**: [none]
**Next Action**: Finding #10 (Lite `arc-config.yml` reduction mechanism). Entry point: read
`src/lib/template/render.ts` to assess the `.template.md` → `.template.*` gate extension
complexity, walk current `arc-config.yml` section-by-section to identify `install.type`-gated
blocks, then decide between Approach 2 (rename to `arc-config.template.yml` + extend render
pipeline) and Approach 1 (two-file fallback via Finding #8's mechanism). Framing C from
Finding #9 composes with Approach 2. After #10 lands, Tier 1 + the Finding #8 adjacent-
concerns story is fully closed and attention moves to Tier 2 smalls (#13, #7, #16).

---

**Last Updated**: 2026-04-10
