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
(arc-modes), the tracker `coord.adapter` surface (coord-probe), shared-file concurrency conventions
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
  decomposition as optimal. If scalable-core sequences ahead of arc-modes/coord-probe, the refined shape
  should land here; otherwise at whichever leads. Resolve at sequencing.
- **Resolve-then-load boundary** — where the core/extension cut falls for the inline-gated backlog steps,
  and how `system/workflows/` stays navigable. Owned by `plan-composable-workflows.md`; this WU is a
  consumer.
- **Config-key naming** — exact tokens (`pm.enabled`? `planning.enabled`?), and how they reconcile with
  arc-modes' planned `pm.mode → pm.layer` rename (which this thesis turns from an enum-rename into a
  boolean).
- **Reconfigure transition** — what happens to staged `backlog/` content when the Planning Module is toggled
  off (push external / archive / error).

## Scope Estimate

Medium–Large. The artifact surface barely moves; the payload is config-model + recipe + scaffolding +
prose + a handful of workflow seams, plus the consolidation of the scattered external-setup surface.
**Builds on** work-organization-reform's shipped floor (always-present `meta-*`, tier-invariant
disciplines). Sequencing relative to the steered WUs (arc-modes, agile-wu-lifecycle, arc-plan-conductor,
coord-probe) is undecided and partly determines tracker-shape ownership.

---
