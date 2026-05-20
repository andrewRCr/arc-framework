# Plan: Customization Architecture Realignment

**Purpose:** Realign ARC's customization mechanisms (config, methods, extensions) around principled
roles, eliminate the config-as-method-toggle smell that has accumulated across `review.pre_merge`
and the now-deferred `review.planning_checkpoint`, and codify a clear decision tree for "which
mechanism for which concern" in `strategy-configurability-architecture.md`.

- **State:** Draft — pre-PRD exploration captured 2026-05-15 from a mid-execution architectural
  review during WOR Phase 3 (Task 3.3, `activate-work-unit.md` restructure).
- **Created:** 2026-05-15
- **Origin:** Surfaced 2026-05-15 while restructuring `activate-work-unit.md`. The originally
  proposed `review.planning_checkpoint` config key (WOR R46) is a bare halt-toggle with no
  associated activity — it cites `review.pre_merge` as precedent but doesn't actually follow it
  (`pre_merge` gates invocation of the `diff-review` method; `planning_checkpoint` gates nothing).
  Following the thread surfaced a broader concern: methods have an override axis but no clean
  enable/disable axis, so ARC accumulates config keys to handle the "default-on activity teams
  might opt out of" case. The current customization architecture is workable but not principled.

---

## Problem / Motivation

ARC's customization model documents three mechanisms (config, extensions, method overrides) with a
"which mechanism do I use?" decision tree in `strategy-configurability-architecture.md`. Empirical
review of the current state shows the boundaries are not clean:

- **`review.pre_merge` config gates invocation of the `diff-review` method.** The config exists
  because the method has no enable/disable axis of its own. Workable but not principled — the
  method's content lives in `methods/diff-review.md` while its on/off lives in `arc-config.yml`.
- **`review.planning_checkpoint` config (proposed in WOR R46, since deferred) was a bare halt
  with no method behind it.** Functionally equivalent to authoring a `pre-activation` extension
  whose `.actions` is a halt prompt. The config added no expressive power; it added a config knob.
- **The decision tree has no row for "**disables** how ARC does something."** Config covers
  "changes a value"; extensions cover "adds new steps"; method overrides cover "replaces how ARC
  does something." Disabling falls in the gap — and that's exactly where `review.pre_merge` and
  `review.planning_checkpoint` landed.
- **Method loading is "load everything declared in frontmatter" today.** Disabled extensions still
  trigger a directory scan; method defaults load even when an override is populated. The
  override-aware partial-read pattern is in theory handled but should be verified.
- **No user-scope channel for method/extension activation.** A developer wanting to skip a
  default-on method locally (e.g., "I don't want diff-review on this machine because CI handles
  it") has no codified path. Project config + git-config interlocks exist, but they don't extend
  to method/extension `active` flags.

The customization surface has accumulated over time without a holistic pass; absent that pass,
each new opt-out-able activity adds a config knob with slightly different semantics from the
others. The smell will continue to propagate unless the boundaries are clarified.

---

## Current State Inventory

### Methods (10)

Every method ships with concrete default content + `override-active: false` frontmatter:

| Method                  | Default activity                                            | Override surface       |
|-------------------------|-------------------------------------------------------------|------------------------|
| `branch-format`         | CB-style type prefix + `plan/` planning prefix              | Type list override     |
| `commit-format`         | Conventional commit format                                  | Custom pattern         |
| `commit-footer`         | Context footer naming deepest spec-shaped artifact          | Custom pattern         |
| `diff-review`           | Aggregate-diff review activity                              | Replace activity       |
| `issue-triage`          | Severity-based triage decision tree                         | Replace tree           |
| `quality-gate-commands` | Project-defined Tier 1/2/3 commands                         | Replace commands       |
| `review-triage`         | Four-way classification (fix-now / defer / reject / silent) | Replace classification |
| `session-state`         | Tracked + gitignored session-state read/write               | Replace mechanism      |
| `test-first`            | TDD decision tree by change type                            | Replace tree           |

Methods have **one customization axis** (`override-active`). No `active` axis for enable/disable.

### Extensions (8, with one self-hosting exception)

All extensions ship empty (`[No extension configured]` placeholder) with `active: false` default —
except `pre-merge-review.md` which carries CodeRabbit invocation logic in this self-hosting repo.
Extensions have **one customization axis** (`active`). No defaults to override.

### Config keys by functional category

| Category                         | Examples                                                  |
|----------------------------------|-----------------------------------------------------------|
| Hook enable/disable              | `hooks.pre_commit`, `hooks.commit_msg`                    |
| Method selector + custom pattern | `commit.format`, `commit.context_footer`                  |
| Hook validator value             | `hooks.subject_max_length`, `hooks.meta_ref_patterns`     |
| Structural / setup               | `pm.mode`, `team.mode`                                    |
| Workflow path selector           | `branch.protection`, `archive.cadence`, `merge.strategy`  |
| Informational                    | `platform.type`                                           |
| Session/sync behavior            | `session.*`, `user.notes_push`                            |
| **Method invocation toggle**     | `review.pre_merge`                                        |
| **Bare halt toggle (deferred)**  | _(was `review.planning_checkpoint`; deferred from WOR)_   |

The bottom two rows are the architectural smell. Their existence is a symptom of methods lacking
an `active` axis.

---

## Proposed Principle

**Config = values consumed by hooks, CLI, structural decisions, or workflow path selection.**
**Methods = named activities ARC has an opinion about; carry `active: bool` and `override-active: bool`.**
**Extensions = hook slots with no ARC opinion; carry `active: bool` (already there).**

Concretely:

- **Config is reserved for:**
    1. Values that hooks (shell scripts) must read at runtime — must be flat, grep-parseable.
    2. Values the CLI consumes for structural decisions (scaffold-time, mode-driven file installation).
    3. Workflow path selectors where the choice changes the workflow's shape (`archive.cadence`,
       `branch.protection`), not just whether to invoke a single activity.
    4. Personal preferences scoped to a developer (interlocks, release opt-in) — via git-config
       today, future user-scope channel per `plan-config-storage-architecture`.
- **Config is NOT for** "should ARC run this activity?" That's the method's own `active` flag.
- **Methods gain a second axis.** Frontmatter grows `active: true` (default) alongside the
  existing `override-active: false`. Workflows invoking the method check `active` before loading.
- **Extensions stay as-is.**

### Decision tree update

The existing "which mechanism do I use?" tree gets a new row:

| Customization shape                                  | Mechanism                                            |
|------------------------------------------------------|------------------------------------------------------|
| Changes a value hooks/CLI/structural code reads      | Config                                               |
| Adds new steps at a workflow point                   | Extension (`active: true` + populate `.actions`)     |
| Replaces how ARC does an activity                    | Method (`override-active: true` + populate override) |
| **Disables how ARC does an activity**                | Method (`active: false` in frontmatter)              |

---

## Implications

### Concrete migration scope

- **`review.pre_merge` config deletes.** Moves to `diff-review` method frontmatter `active: true`
  (preserves current default). Workflow references update to check the method's `active` flag.
- **`review.planning_checkpoint` already removed** by WOR's mid-execution deferral. No further
  action under this plan unless a `planning-review` method is proposed (open question below).
- **Convention inventory rows update** in `strategy-configurability-architecture.md`:
    - "Pre-merge aggregate review" row drops the "Config setting" portion.
    - "Planning checkpoint review" row already updated by WOR to "Extension only — `pre-activation`."
- **Decision tree row added** as above.

### Method-loading architecture

Today workflows declare methods in YAML frontmatter and the agent loads them all at workflow
execution time. With method `active` flags landing, loading should respect activation:

- **Inactive methods short-circuit at the workflow's invocation point** — no load. (Today,
  inactive extensions still trigger a directory scan via the active-extensions probe at
  session-init; the analogous probe for methods would be similar but unused-method content
  loading wastes context.)
- **Active methods load on-demand** — current behavior. Continue.
- **Override-aware loading:** when `override-active: true`, load the override content, not the
  default. Today this is implicit via the method file's structure (override section comes first
  conceptually); verify in practice with partial-read instructions.

Coordinate with `plan-instruction-optimization` (skill-load caching) and
`plan-workflow-template-loads` (the `arc.templates` frontmatter category for templates) — all
three touch the workflow-frontmatter-driven load surface.

---

## Open Questions

### (a) Load-bearing methods

Some methods are clearly invariant — disabling them would break ARC's core operation:

- `session-state` — read/write session state. Without it, no handoff.
- `quality-gate-commands` — Tier 1/2/3 commands. Without it, no quality gates.

Others are tolerably opt-out-able:

- `test-first` — TDD decision tree. Skipping = "don't assess test-first." Workable.
- `issue-triage` — severity assessment. Skipping = "always fix-now" or "always ask." Workable.
- `branch-format`, `commit-format`, `commit-footer` — disabling these is roughly today's
  `commit.format: any` / `commit.context_footer: disabled` semantics.
- `diff-review`, `review-triage` — toggled by current config; would migrate cleanly.

**Question:** Do we add a `core: true` invariant flag for non-disable-able methods, or just
document the boundaries? `core: true` is mechanically enforced (the frontmatter parser rejects
`active: false`); documentation-only is convention. Probably `core: true` for the methods that
would break ARC, prose for the rest.

### (b) Loading efficiency

- Today, agents load all extensions declared in workflow frontmatter at session-init via the
  active-extensions probe. The probe filters by `active: true` (good — inactive extensions
  short-circuit). Verify this is actually working as documented.
- Method content is loaded on-demand at workflow-step boundaries. Override-aware loading should
  use partial-read for the override section when `override-active: true`. Verify with a spot
  check on a method that has an override (none today in this repo, but the contract should
  hold).
- Caching across workflow invocations — see `plan-instruction-optimization` for the broader
  context. Worth coordinating to avoid duplicating effort.

### (c) User-scope activation

Project-level method/extension activation is set in the file's frontmatter (everyone using this
project sees the same activation state). Per-developer activation has no current channel —
e.g., "I want diff-review off on this machine because my CI runs it."

Possible shapes:

- **Escape hatch (tier 3):** Document that developers may toggle method/extension `active` flags
  locally via a gitignored override mechanism (not yet codified). Light surface, light promise.
- **User-scope config channel:** When `plan-config-storage-architecture` ships, add method-/
  extension-active overrides to the user-scope store. Heavier surface, fuller promise.
- **Don't address:** Personal opt-outs are out of scope for ARC's customization model. Teams
  align on activation; individuals don't.

The right answer depends on the user-scope substrate landing first. This plan defers the user-
scope activation question until then.

### (d) Migration sequencing

- This plan depends on `plan-review-method-family` for the `review.pre_merge → diff-review.active`
  migration (avoid double-touching `diff-review` method content). Either the review-family WU
  ships first and lands the migration as part of its scope, or this plan ships first and the
  review-family WU coordinates.
- This plan can ship the method `active` flag (frontmatter + loading) independently of either
  user-scope or review-method-family.
- Decision-tree update is no-dependencies; could ship at any time.

### (e) Commit/push interlock enum granularity

Current `commitInterlock` carries three values (`manual` / `on-task-approval` / `on-workflow`) and
`pushInterlock` carries three (`manual` / `on-handoff` / `on-workflow`). The middle value adds
branching to every rule statement, but the operational distinction is fuzzy: `on-task-approval`
exists for users who want task-level commit release but explicit workflow-ceremony approval to _not_
release. No artifact today articulates a real consumer of that preference.

Two simplification axes worth evaluating:

- **Collapse to binary** (`manual` / `cascade` or `manual` / `auto`). Cleaner mental model. Risk:
  loses precision about _what_ cascades — under "cascade," does workflow-ceremony approval release
  commits the same way task approval does? Without sub-enum granularity, the user can't say "release
  on task approval but not workflow approval" or vice versa. Probably no one wants the inverse, but
  the config shape should make the authorization scope legible.
- **Keep three values but rename for clarity.** `manual` / `task-and-workflow` / `workflow-only`
  (with `task-and-workflow` being the broader release). Same expressive power; clearer about scope.

Open design question for PRD-time. Constraint from the user: "it has to be clear what the user is
and isn't authorizing when changing config." A two-value enum that hides scope inside "cascade" may
fail this test even if it's mechanically simpler. Origin: 2026-05-16 mid-WOR session, surfaced
during interlock-prompt-shape audit; explicitly not finalized.

---

## Cross-Plan Coordination

- **`plan-review-method-family`** — owns the `diff-review`/`review-triage` reshape; the
  `review.pre_merge → diff-review.active` migration should ride that WU (avoid double-touching
  the `diff-review` method file). Add a § Coordination note to that plan referencing this one.
- **`plan-config-storage-architecture`** — owns the user-scope substrate; the user-scope
  activation question (above) depends on the storage shape landing there. Add a § Coordination
  note to that plan referencing this one.
- **`plan-instruction-optimization`** — overlaps on the loading-efficiency angle. Whichever
  ships first should not foreclose the other's design space. Worth a cross-reference.
- **`plan-workflow-template-loads`** — adjacent frontmatter-category pattern (`arc.templates`
  alongside `arc.methods` / `arc.extensions`). The loading architecture decisions should be
  compatible. Worth a cross-reference.
- **`plan-arc-plan-conductor`** — defers the question of whether ARC needs a `planning-review`
  method (the only path under which `review.planning_checkpoint`-shaped behavior re-emerges).
  If a planning-review activity gets codified there, this plan provides the customization
  shape it slots into.
- **`plan-interlock-release-refinement`** — consumes whichever enum-granularity decision lands
  here. Open Question (e) (commitInterlock / pushInterlock enum simplification) lives in this
  plan because the enum design affects all of ARC's interlock-shaped configs; the routing
  evolution in `plan-interlock-release-refinement` works under any candidate enum shape. If
  either lands first, the other absorbs the resulting decision; ship-order doesn't matter.

---

## Sequencing

No firm dependencies; soft dependencies on `plan-config-storage-architecture` (for the
user-scope activation question) and `plan-review-method-family` (for the diff-review migration).
Could ship in parallel with either; should not ship before the others without coordinating.

---

## Status / Next Action

**Status:** Draft. Pre-PRD exploration.

**Next action:** Iterate this plan when picked up. Coordinate with `plan-review-method-family`,
`plan-config-storage-architecture`, `plan-instruction-optimization`, and
`plan-workflow-template-loads` authors before promoting to PRD.

---

## Origin

Surfaced 2026-05-15 during WOR Phase 3 execution (Task 3.3 — `activate-work-unit.md` restructure).
Mid-task review of the originally proposed `review.planning_checkpoint` config key (WOR R46)
revealed the bare-halt-toggle smell, which then opened into the broader customization-architecture
review captured here. WOR R46 deferred and reverted to keep WOR's scope clean (forward-compat with
this plan); see `notes-work-organization-reform.md` § Customization-architecture smell surfaced
mid-execution (planning-checkpoint deferred) for the mid-execution decision record.
