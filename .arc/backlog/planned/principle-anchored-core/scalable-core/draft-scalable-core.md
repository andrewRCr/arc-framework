# Draft: Scalable Core

- **Origin:** [internal] — surfaced during WOR scope discussion (R64, the "arc-in-git as default; modes
  scale around it" thesis), then widened from the PM-mode question to ARC's whole mode/config surface.
- **Purpose:** Make ARC's implementation match the philosophy it already commits to — a small
  principle-anchored core that scales by depth/footprint, with the project layer expressed as orthogonal
  toggles rather than siloed modes. The ratified decisions live in **ADR-020**; this plan carries the
  thesis framing, the owned implementation slice, the validated seam inventory, and the cross-WU
  coordination map.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Remove the dead Lite-layout (`status.md` / `ActiveLayout`) active-meta residue**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: scalable-core`), housekeep drain (2026-06-17); captured
  during `release-ceremony-commits` design audit — surfaced as the source of the audit null-collision (2026-06-17).
- *Concern:* the active-meta reader still carries a two-layout model — `lite` (`.arc/active/status.md`, a single
  nameless WU) vs `full` (`.arc/active/meta-{name}.md`). Lite is **dead code**: a remnant of the ditched "Lite
  mode" design (superseded by ADR-020's principle-anchored scalable core, which scales by depth/footprint). No
  `status-*` file exists anymore (it became `meta-*`); nothing produces the lite layout, so the branch is
  unreachable.
- *Blast radius:* ~29 references across 8 source files (`lib/active/meta-reader.ts`,
  `lib/work-unit/lifecycle-guards.ts`, `lib/release/audit-log.ts`, `lib/release/wu-resolution.ts`,
  `lib/release/types.ts`, `commands/active/types.ts`, `commands/active.ts`, `commands/active/status.ts`) + ~6 test
  files; `ActiveLayout` threads through the active-meta subsystem (session-init, `arc active status`, release
  wrappers). A careful removal with full test re-run, not a one-liner.
- *Approach:* drop `LITE_FILENAME` / lite detection in `meta-reader.ts`, collapse `ActiveLayout` to the single
  full layout (or remove the type), simplify `parseNameFromPath` (every candidate is `meta-{name}.md`), and let
  `toAuditWorkUnit` return null only for the genuine zero-candidate case. Confirm against this WU's validated seam
  inventory — may already be enumerated there; if so, this capture just confirms it.
- *Downstream:* resolves `release-ceremony-commits`'s audit null-collision (zero-candidate accept currently shares
  `wu: null` with a nameless lite WU) — once lite is gone, null unambiguously means "no active WU."

### `[ ]` **Configuration-transition machinery from the dissolved Lite↔Full switch design**

- *Routed from:* `local-mode` re-scope groom (2026-07-03); full detail in `draft-arc-modes.md` prior to that
  re-scope (git history) § Graduation / Downgrade Paths.
- *Concern:* this WU's owned `arc reconfigure` slice currently designs one edge (toggle-pipeline-off with staged
  content). The dissolved Lite↔Full switch already worked the general problem and its machinery transfers intact:
  **(1) orphan taxonomy** — Category A manifest-tracked files the new configuration excludes (change-plan +
  existing removal UX handles free), Category B off-manifest runtime user artifacts (filesystem walk, reported
  per-top-level-directory, never per-file), Category C semantic decay split into C1 grep-able stale references
  and C2 conceptual decay (agent-led review pass); **(2) entry-state gate** — refuse a destructive transition
  unless the operator has put the system in a valid state first (invocation-as-assertion with a verified
  precondition); **(3) CLI-mechanical / advisory-workflow split** — CLI self-sufficient for the deterministic
  parts, a supplemental workflow as the documented entrypoint adding the judgment pass; **(4) descope guard** —
  ship the up-direction only if the down-direction proves costly. Toggling the Planning Module off produces
  exactly the A/B/C1/C2 categories.

### `[ ]` **Recipe / prompt / config-template mechanism bundle (designed for Lite, needed by the reform)**

- *Routed from:* `local-mode` re-scope groom (2026-07-03); full detail in `draft-arc-modes.md` pre-re-scope
  (git history) §§ Installation Type Recipe Mechanism, Prompt Orchestration and Recipe Authority, Lite Config
  Template Mechanism, Configuration Identity.
- *Concern:* three fully-specified, axis-agnostic mechanisms with code-verified landscapes back this WU's owned
  recipe/config/validation slice; none are recorded in ADR-020 or this draft: **(1) symmetric-additive recipe
  bucketing** — per-axis additive buckets, no subtraction/precedence/two-recipes (rejections documented), whole-file
  gating only for files with no cross-axis content, within-file gating otherwise, no combinatorial pair buckets;
  **(2) prompt gating** — a recipe `show_when` field reusing the existing condition grammar, a pure
  `shouldShowPrompt()` helper, skipped-prompt defaults from the recipe `default` field, and the drift-test pattern
  (recipe prompt IDs vs exported constants). Includes the finding that `recipe.prompts` is validated but never
  consumed — seven hand-coded sites duplicate prompt knowledge (vestigial-metadata cleanup has no owner);
  **(3) templated config** — `.template.yml` rename (render pipeline is already extension-agnostic; manifest keys
  by output path, so zero migration), composition order tokens → conditionals → overrides (overrides last so keys
  inside stripped blocks can't be overridden back in). Plus the consumer read-path doctrine (axis fields live in
  the manifest only; hooks branch on already-resolved downstream keys; workflows/agents never see an axis at
  runtime) and the manifest-vs-config placement reasoning for install-shape axes.
- *Caveat:* landscapes read 2026-04; re-verify against the current CLI before reuse. One undesigned seam: ADR-020
  §8's walkthrough is agent-led while this machinery is CLI prompts — non-interactive (`--yes` / CI) paths need
  the CLI mechanism regardless; the interactive split between walkthrough and CLI prompting is nobody's design yet.

### `[ ]` **Guided-init inputs from the dissolved Lite design (floor, patterns, evidence)**

- *Routed from:* `local-mode` re-scope groom (2026-07-03); full detail in `draft-arc-modes.md` pre-re-scope
  (git history) §§ Lite Initial Setup, Mode Fit Communication, Research Findings, Quick-Start / On-Ramp Angle.
- *Concern:* inputs for this WU's owned init-workflow reshape: **(1) the minimum-viable-init floor** — the
  load-bearing set the opt-down endpoint must still guarantee (agent config, identity, the session-loaded project
  docs) plus the deliberately-absent list; **(2) agent-led in-workflow opt-in** as the mechanism for optional
  artifacts (install-time prompt and CLI flag both rejected on discoverability/ceremony grounds); **(3) the
  equal-peers prompt doctrine** — peers listed without pre-selection, work-shape (not duration) discriminators,
  transition path named, `--yes` errors when an axis has no back-compat default; **(4) the no-detect-and-advise
  principle** — the framework never counts-and-advises on WIP/complexity/fit; upfront clarity + easy transitions
  instead (a framework-wide commitment recorded only in the dissolved design); **(5) research evidence** — PSP
  discipline-is-scale-independent (the unrecorded empirical underwriting of ADR-020's invariant floor), the
  15–20% ceremony-proportionality threshold, ~2wk/2–8wk/>8wk duration banding, signal-based outgrowth triggers
  (unplanned work emerging, scope clarification >10% of time, task count past working memory, concurrent streams),
  and the solo keep/abandon adoption split; **(6) an unweighed argument** — ADR-020 §8's default-on stance was
  argued from informed consent and never weighed the adoption-funnel case for presenting the minimal region as
  the recommended start for solo/trial adopters. Surface it deliberately at the walkthrough design (intersects
  `cold-start-init-polish`).
- *Also:* the dissolved design committed to a strategy-content audit sweep (config-coupled in-doc surfaces —
  tables, example blocks — across all framework strategies; 3-of-4 drift hit rate when last run) and a
  settings-applicability inventory (which keys exist/force/shift per toggle state). Both exceed this draft's
  two-doc prose sweep; adopt or consciously reject at integration.

---

## Problem / Motivation

ARC accumulated a mode/config surface — `pm.mode` (none / arc-in-git / external), Lite/Full, Local,
`team.mode` — that presents *the same underlying work* as discrete, mutually exclusive shapes. The 11
principles already define the right architecture: a non-negotiable principle core plus replaceable
conventions, with scaling carve-outs written into the principles themselves. The modes reified continuous
convention-scaling into siloed shapes. The cost lands on both audiences: adopters face a confusing
matrix and a Lite mode that is a *different* mental model rather than a smaller one; maintainers carry
duplicated conditional logic and a config surface that resists change.

The thesis: **one coherent core that scales up and down, over siloed modes plus a config matrix.** See
ADR-020 for the principle/convention framing, the invariant floor, "scale grammar, never scale
discipline," the mode→toggle decomposition, and the concurrency boundary.

## What this work unit owns vs. steers

This WU is both a coordinating north star (ADR-020) and a bounded implementation slice. The slice it
**owns** — work no sibling WU covers:

- **Config-schema reform** — replace the `pm.mode` enum with the Planning Module boolean + a project-level
  tracker pointer + `archive.preserve`; retire `external` as a value. (No adopter migration needed — the
  project is pre-release; clean break.)
- **Scaffolding/validation** — `init-recipe.json` conditions, `classification.ts` layer vocabulary, and
  `validate-config.sh` enums/known-keys move off the single mutually-exclusive enum.
- **`arc reconfigure`** — materialize/dematerialize pipeline surfaces on toggle; handle the
  toggle-pipeline-off-with-staged-content edge.
- **Init-workflow reshape** — `01_verify-and-configure` gains the guided, team-size-aware walkthrough;
  `03_configure-external-integration.md` is de-gated from `external`-only to an optional tracker-config
  step usable in any pipeline state; the scattered external-setup surface is consolidated.
- **Prose sweep** — the DEV-RULES capture-routing table and `strategy-planning-module.md`'s backlog-vs-
  tracker either/or framing.
- **Archive de-bundling** — `completed/` and its scaffolding decouple from the Planning Module.
- **USER-INBOX `## Backlog` drain conditional** — routes to internal backlog (module on), external ticket
  (module off + tracker, surfaced for manual creation in the interim — no write-adapter yet), or a personal
  list (module off, no tracker). Resolves the long-standing universality gap.

What it **steers** (via ADR-020 cross-refs, executed elsewhere): the spec-template family and intent-
verification scaling (agile-wu-lifecycle), single-entry workflow scaling (arc-plan-conductor), Lite/Local
(the Lite steer is executed — dissolved at arc-modes' 2026-07-03 re-scope to `local-mode`; Local rides
`local-mode` as the storage axis), the tracker `coord.adapter` surface (coord-probe), shared-file concurrency conventions
(concurrent-work-conventions), and the mutable-shared-state backend (arc-backend).

## Validated seam inventory

Five scenario traces against current code/workflows/hooks/scaffolding (solo/module-off,
distributed-team/multi-tracker, module-on+tracker, small-team/module-on, multi-WU growth) established that
the modes are a thin config/recipe/prose veneer over machinery that is already substantially
mode-orthogonal. Concrete seams:

- **Config/scaffolding (structural core):** `pm.mode` 3-enum baked into `classification.ts` binary layer
  (`core | arc-in-git`), `ARC_IN_GIT_CONDITION` in `constants.ts`, `init-recipe.json:130-144` conditions,
  `validate-config.sh` enum + known-keys, the single 3-way init prompt; no `pm.tracker` / `archive.preserve`
  keys. `init-recipe.json` installs backlog **xor** the tracker-setup workflow on the one enum (the
  module-on+tracker blocker).
- **Workflow:** `session-init.md` Step 5 (next-work discovery) reads `backlog/ROADMAP.md` *unconditionally*
  — the one lifecycle step missing the guard every sibling has; `archive-work-unit.md` Step 3 sweeps to
  `completed/` *unconditionally* (no `archive.preserve` delete-path; sweep is hardcoded, and `completed/`
  isn't even scaffolded under `none` yet archive `mkdir -p`s into it); `03_configure-external-integration.md`
  body is mode-agnostic but gated to `external`; `deactivate-work-unit.md` external arm says "the external
  tracker" (singular).
- **Prose:** DEV-RULES.ARC capture-routing table frames arc-in-git vs. "other modes" as exhaustive (no row
  routes deferred work to a tracker *while* a backlog exists); `strategy-planning-module.md` explicit "PM
  without external tools" XOR; `arc-config.yml` "where PM lives" singular framing.
- **Already-clean (inherited base):** lifecycle workflows already gate backlog behavior with explicit
  none/external skip-arms; the `arc status --session-init` composite probe and `arc active status` never
  touch the backlog; `post-task-completion` / `post-work-unit-activate` extensions fire on active-set
  membership (not `pm.mode`) and the activate ordering already contemplates backlog+tracker together; the
  `Origin` field is mode-agnostic; the multi-WU `single | multiple | none` resolution path is fully
  multi-WU-aware end-to-end.
- **Team is config-orthogonal but conceptually load-bearing:** `team.mode` gates nothing at runtime today
  (its sole effect is flipping the `notes_push` default at init); team coordination is pure out-of-band
  prose convention — which *confirms* the thesis's central assumption is current reality, and confirms it is
  unenforced (the concurrency boundary in ADR-020 §7).

## Open questions

- **Tracker-shape ownership** — ADR-020 fixes the invariants (orthogonality; per-WU `Origin` + project-level
  pointer; multi-tracker foreclosed) but explicitly does not bless the inherited `Origin` + `coord.adapter`
  decomposition as optimal. If scalable-core sequences ahead of coord-probe, the refined shape should land
  here; otherwise there (arc-modes left this fork at its 2026-07-03 re-scope — `local-mode` is storage-axis
  only, no tracker deliverable). Resolve at sequencing.
- **Resolve-then-load boundary** — where the core/extension cut falls for the inline-gated backlog steps,
  and how `system/workflows/` stays navigable. Owned by `draft-composable-workflows.md`; this WU is a
  consumer (its § Relationship to other work registers this WU's session-init Step 5 and archive-sweep
  seams as config-static gate cases under its binding-time rule).
- **Config-key naming** — exact tokens (`pm.enabled`? `planning.enabled`?). The `pm.mode → pm.layer`
  enum-rename once planned under arc-modes is superseded — this thesis makes the key a boolean, and that
  scope dissolved at arc-modes' 2026-07-03 re-scope.
- **Reconfigure transition** — what happens to staged `backlog/` content when the Planning Module is toggled
  off (push external / archive / error).

## Scope Estimate

Medium–Large. The artifact surface barely moves; the payload is config-model + recipe + scaffolding +
prose + a handful of workflow seams, plus the consolidation of the scattered external-setup surface.
**Builds on** work-organization-reform's shipped floor (always-present `meta-*`, tier-invariant
disciplines). Sequencing relative to coord-probe is undecided and determines tracker-shape ownership; the
other originally-steered WUs have since shipped (agile-wu-lifecycle), decomposed (arc-plan-conductor), or
re-scoped (arc-modes → `local-mode`).

---
