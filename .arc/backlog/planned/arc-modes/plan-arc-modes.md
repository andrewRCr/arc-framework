# Plan: ARC Operating Modes

**Purpose:** Establish ARC's mode architecture — alternative operating modes that expand where and how ARC
can be used. Two modes: a lightweight mode that preserves execution discipline without lifecycle ceremony,
and a local mode that enables ARC in repositories the developer doesn't control.

- **State:** Draft (design phase complete — Lite, Local, and shift lifecycle resolved; Audits A + B drained; PRD-ready)
- **Created:** 2026-04-01
- **Last Updated:** 2026-04-28
- **Origin:** Developer experience gaps at both ends of the adoption spectrum — small projects need less ceremony, and
  constrained environments need ARC without repo footprint.

**Planning approach:** This work unit has a broadly known intent but largely unknown shape. Spend time here
in the plan stage doing research, evaluation, and design decisions so the PRD can be specific about
deliverables rather than deferring design to implementation. The plan doc is the primary working artifact
until design decisions are resolved.

> **Activation-time reconciliation:** Strategy-audit meta-notes at lines ~2654, ~4895, ~5440 reference the
> framework method as `pre-merge-review` in the context of the Method Classification by Trigger table row
> analysis. That method was renamed to `diff-review` during Session-Init Optimization WU (Task 1.4.a) —
> update these references when this WU activates.

<!-- -->

> **Forward-compat callbacks from Session-Init Optimization WU (Task 5.6):** Two design points to revisit
> when this WU activates.
>
> - **Lite companion-file naming asymmetry.** Current plan specifies `atomic-tasks.md` paralleling
>   `tasks.md` (§ The Lite Task List, Atomic companion file subsection). The notes companion is more likely
>   `notes.md` (asymmetric to atomic, but cleaner — Lite has no work-unit name to parallel). Settle the
>   asymmetry during PRD/impl. Task 5.6 ships companion-path resolution for Full layout only and omits the
>   `companions` field entirely for Lite-shape task lists, so no premature naming gets baked into the
>   probe.
> - **Composite status command Lite path.** The composite session-init probe
>   (`arc status --session-init --json`) and `arc active status` commands didn't exist when this plan was
>   first written. With Lite's single-work-unit model, the multi-resolution machinery
>   (`single` / `multiple` / `none`) is largely moot — Lite likely needs its own composite-probe shape
>   rather than reusing Full's. Treat as a new design surface during PRD scoping; don't assume Full's
>   probe shape extends.

<!-- -->

> **Scalable-core reframe — Lite dissolves (ADR-020):** The scalable-core thesis collapses Lite into the
> scaling axes — Lite is _not_ a distinct mode but a region of (Planning Module off/minimal + atomic/quick
> tier + minimum depth), reached by guided-init defaults. Its "no work units, one flat task list" shape is
> eliminated by the invariant floor (work units, a separate spec, and a task list are non-negotiable above
> atomic). The name does not survive (per ADR-010's anti-profile stance). **Consequence:** Lite is no
> longer a deliverable of this WU — it becomes a consequence of ADR-020. **Local is unaffected** and
> remains this WU's live, orthogonal deliverable (storage/visibility axis), as do shift lifecycle and
> mode-aware scaffolding (which reshape, not dissolve). This plan predates the reframe and is due a broader
> refresh; comprehensive reconciliation defers to WU activation (Activation Audit pattern).

**Upstream dependency:** Methodology Maturation (`prd-methodology-maturation.md`) — settles the
methodology/implementation boundary, language consistency, and content architecture that this work unit
builds on. **Completed** (2026-04-08, archived). The conditional content architecture analysis
(`analysis-conditional-content-architecture.md`) is a direct feed-forward deliverable from that work unit.

**Deliverable structure:**

- **ARC Lite** — lightweight mode for small, bounded projects.
- **Local mode** — untracked ARC for constrained environments (repos the developer can't modify).
  Orthogonal to Lite/Full — any combination is valid.
- **Shift lifecycle** — cross-cutting mechanism for paused work units. Fills a team-mode gap in Full ARC
  while enabling Local Full viability.
- **Mode-aware config template scaffolding** — per-mode `ARCd-config.yml` template variants and
  forbidden-combinations enforcement.
- **Pre-PRD design investigations** — solo-dev blind spot audit must complete before PRD creation.

**Scope boundary (2026-04-09, expanded 2026-04-11):** Configurability cleanup items that are mechanical
and rebrand-adjacent have been extracted into the ARCd Rebrand work unit. Original
extraction: the `pm.mode: arc-in-git` → `pm.layer: arc-pm` value rename and the associated doc sweep.
Added 2026-04-11 during Finding #16 resolution: the `pm.mode` → `pm.layer` and `team.mode` →
`team.enabled` key renames. Motivation for the key renames: this plan doc promotes "mode" to a
load-bearing top-level term (`install_config.install_type` = Lite/Full; Local/Tracked axis to come),
and the pre-existing `pm.mode` / `team.mode` keys sit at different semantic levels but share the word.
Renaming `pm.mode` → `pm.layer` (matches "Planning Module" vocabulary, layer-within-ARC framing) and
`team.mode` → `team.enabled` (natural noun for a boolean config key) frees the namespace at the top
level of `ARCd-config.yml`. Both WUs benefit: the rebrand bundles related config-file churn into one
editorial pass and picks up the schema renames alongside its value rename; the modes WU stays focused
on modes-specific design rather than acquiring a cross-cutting namespace sweep as prerequisite. Modes
WU depends on the rebrand landing first (clean, renamed foundation to build on). Revisit this boundary
after the pre-PRD audit runs — if findings push scope beyond what's manageable in a single modes WU,
a further split along the dependency line (foundation → Lite+Local) is available.

**Lite and Local are intertwined, not sequential.** Shared machinery — mode-aware config templates,
mode-aware `arc init` flow, mode-aware session-init, content audit, workflow adaptations, forbidden
combinations enforcement — dominates the unique per-mode work. Building them together avoids
retroactive refactoring and the risk of mode-specific decisions that turn out to conflict across
modes. This is not just "coherent to keep together" but "separating would be actively wasteful."

---

## Contents

- [Problem Statement](#problem-statement)
- [Design Decisions](#design-decisions)
    - [Configuration Identity](#configuration-identity)
    - [Installation Type Recipe Mechanism](#installation-type-recipe-mechanism)
    - [Prompt Orchestration and Recipe Authority](#prompt-orchestration-and-recipe-authority)
    - [Lite Config Template Mechanism](#lite-config-template-mechanism)
    - [Solo-Dev Blind Spot Audit (Gating Pre-PRD) — **Complete**](#solo-dev-blind-spot-audit-gating-pre-prd--complete)
    - [Conditional Content Architecture](#conditional-content-architecture)
    - [Configuration Identity — Local Axis](#configuration-identity--local-axis)
- [Shared Infrastructure](#shared-infrastructure)
    - [Mode-Aware Config Template Mechanism](#mode-aware-config-template-mechanism)
    - [Role Is a Tracked Concept](#role-is-a-tracked-concept)
    - [Context Footer Format (Local Mode)](#context-footer-format-local-mode)
    - [Durability-Layer Commands](#durability-layer-commands)
    - [Forbidden Combinations](#forbidden-combinations)
    - [Audit as Part of Modes Work](#audit-as-part-of-modes-work)
- [Mode 1: ARC Lite (Primary Deliverable)](#mode-1-arc-lite-primary-deliverable)
    - [Design Philosophy](#design-philosophy)
    - [Core Boundary Hypothesis (Confirmed)](#core-boundary-hypothesis-confirmed)
    - [Enforced Sequence](#enforced-sequence)
    - [What Stays Identical](#what-stays-identical)
    - [What Changes](#what-changes)
    - [The Lite PRD](#the-lite-prd)
    - [The Lite Task List](#the-lite-task-list)
    - [Lite Session Management](#lite-session-management)
    - [Lite Process-Task-Loop](#lite-process-task-loop)
    - [Lite Initial Setup](#lite-initial-setup)
    - [Graduation / Downgrade Paths](#graduation--downgrade-paths)
    - [Configuration and Installation](#configuration-and-installation)
    - [Quick-Start / On-Ramp Angle](#quick-start--on-ramp-angle)
- [Mode 2: Local Mode](#mode-2-local-mode)
    - [Purpose](#purpose)
    - [Design Philosophy](#design-philosophy-1)
    - [Technical Approach](#technical-approach)
    - [Exclusion Mechanism](#exclusion-mechanism)
    - [Re-Clone UX](#re-clone-ux)
    - [Backing Store](#backing-store)
    - [Single-Active-Unit Invariant](#single-active-unit-invariant)
    - [Shift Lifecycle Makes Local Full Viable](#shift-lifecycle-makes-local-full-viable)
    - [Scenario Walk-Through](#scenario-walk-through)
    - [Local Infrastructure Scenario Battery](#local-infrastructure-scenario-battery)
    - [What Changes vs. Tracked Full](#what-changes-vs-tracked-full)
    - [Upgrade Path (Local → Tracked)](#upgrade-path-local--tracked)
    - [Agent and Editor Discoverability](#agent-and-editor-discoverability)
- [Shift Lifecycle](#shift-lifecycle)
    - [The Gap This Fills](#the-gap-this-fills)
    - [Design Philosophy](#design-philosophy-2)
    - [State Model](#state-model)
    - [State Lives in Task List Headers (Pure Option C)](#state-lives-in-task-list-headers-pure-option-c)
    - [Document Status Headers](#document-status-headers)
    - [Workflow Shape](#workflow-shape)
    - [Session-Init Integration](#session-init-integration)
    - [Skill Shape](#skill-shape)
    - [Integration Interaction with Shift States](#integration-interaction-with-shift-states)
    - [Why This Lives in Its Own Cross-Cutting Section](#why-this-lives-in-its-own-cross-cutting-section)
    - [Out of Scope (For This Plan Doc Iteration)](#out-of-scope-for-this-plan-doc-iteration)
- [Mid-Session Orientation](#mid-session-orientation)
- [Mode Fit Communication](#mode-fit-communication)
    - [Principle: upfront clarity, not runtime detection](#principle-upfront-clarity-not-runtime-detection)
    - [Communication surfaces](#communication-surfaces)
    - [Consistency across surfaces](#consistency-across-surfaces)
    - [Scope boundary: architecture here, content in implementation](#scope-boundary-architecture-here-content-in-implementation)
- [Mode Combinations](#mode-combinations)
    - [Collision-Free Composition](#collision-free-composition)
    - [Local Mode and Contributor Mode Are Alternatives, Not Compositions](#local-mode-and-contributor-mode-are-alternatives-not-compositions)
    - [Walk-Through: Lite+Local](#walk-through-litelocal)
    - [Graduation Grid](#graduation-grid)
    - [Init Flow Implications](#init-flow-implications)
- [Reference Material](#reference-material)
    - [Content Audit](#content-audit)
    - [Consolidated Deliverables Inventory](#consolidated-deliverables-inventory)
    - [Resolved Decisions](#resolved-decisions)
    - [Research Findings](#research-findings)
- [Activation Audit](#activation-audit)

---

## Problem Statement

ARC's value splits into two separable layers:

1. **Execution discipline** — task-driven work (process-task-loop), commit format and traceability,
   quality gates, hooks, session continuity, dev rules, methods. Valuable at any project scale.
2. **Lifecycle ceremony** — PRD requirement, formal task generation from PRD, work unit activation,
   verification phase, integration review, archival, backlog pipeline, roadmap tracking. Valuable
   for multi-week, multi-phase efforts with discovery and evolving scope.

Two gaps prevent ARC from reaching developers who would benefit from it:

**Gap 1 — Ceremony disproportionate to project scale.** For small projects (theme ports, CLI tools,
config libraries, weekend prototypes), layer 2 creates friction disproportionate to its value. Developers
skip ARC entirely, then miss layer 1. Current `pm.layer` options don't address this — `pm.layer: none`
strips PM _artifacts_ (backlogs, roadmap) but the workflow layer still assumes multi-phase, multi-week
efforts. The friction is in the workflows, not the artifacts.

**Gap 2 — ARC requires repo ownership.** ARC lives in `.arc/`, committed to the repository. This
assumes the developer controls the repo's tracked space. Common scenarios where that's false:

- Team policy prohibits tool-specific directories (organizational constraints, repo governance)
- Team members aren't interested in ARC or use their own workflows
- Contributing to an open source project where `.arc/` would be inappropriate
- Wanting to try ARC on an existing project without committing to it in the repo

Both gaps share a root cause: ARC's current architecture assumes a single operating context (long-running,
repo-owned project) and provides no way to adapt to others.

---

## Design Decisions

These are upstream of both modes — decisions here inform the PRD's deliverable specifications. The
methodology/implementation boundary and content architecture are resolved in the upstream Methodology
Maturation work unit (`prd-methodology-maturation.md`). The investigations below are specific to
operating mode design.

### Configuration Identity

How modes are expressed in ARC's configuration system. This affects both modes.

**Resolved.** ARC Lite is too foundational to be a config value — it determines what config options
even exist. The decisions:

- **Lite vs Full is the first fork in `arc init`** — a top-level installation type, not a `pm.layer`
  value or a config setting in `ARCd-config.yml`. It's stored in the manifest's
  `install_config.install_type` field and read by the CLI for reconfigure/update operations. The
  installation-type mechanism (how it drives file installation, manifest schema, and plumbing
  through `buildConfigMap`) is specified in [Installation Type Recipe
  Mechanism](#installation-type-recipe-mechanism) below.
- **Lite gates downstream prompts** — Lite skips the `pm.layer` prompt (implicitly `none`; `arc-pm`
  is contradictory since Lite has no work unit stream for the planning module to manage).
  `team.enabled` is also skipped — Lite is inherently solo from a methodology perspective. The gating
  mechanism (new `show_when` field on recipe prompts, with `install.type == full` as the condition)
  is specified in [Prompt Orchestration and Recipe
  Authority](#prompt-orchestration-and-recipe-authority) below.
- **Lite ships a reduced `ARCd-config.yml`** — containing only settings relevant to Lite, rather than
  conditionalizing the Full config in place. The recipe-side mechanism for whole-file installation
  is specified in [Installation Type Recipe Mechanism](#installation-type-recipe-mechanism) below;
  the mechanism for **within-file** content gating — how a single installed template produces
  different content per install type via `arc:if` directives — is specified in [Lite Config Template
  Mechanism](#lite-config-template-mechanism) below.

**Consumer read paths.** The `install_type` value has one authoritative storage location (the manifest)
but consumers learn about it through different paths based on what they actually need:

- **CLI (`init`, `update`, `reconfigure`)** reads the manifest directly. `buildConfigMap()` flattens
  `install_type → install.type` for in-memory recipe condition evaluation and template rendering.
- **Hooks (`pre-commit`, `commit-msg`)** do not read `install.type` directly. Hook behavior branches on
  other config keys (`branch.protection`, `team.enabled`, `pm.layer`, `hooks.*`) already present in
  `ARCd-config.yml`. In Lite, the rendered config strips the PM and team sections — missing keys default
  to Lite-appropriate values (`"none"`, `"false"`) via `arc_config_get`'s fallback argument in
  `arc-lib.sh`. No hook logic change required.
- **Workflows and agents** do not read `install.type` at runtime. The template render pass resolves
  mode-specific content at install time (Mechanism B for session-lifecycle and process-task-loop per
  [Lite Session Management](#lite-session-management) and [Lite
  Process-Task-Loop](#lite-process-task-loop); Mechanism A purpose-built files for initial-setup per
  [Lite Initial Setup](#lite-initial-setup)). The agent never sees `arc:if` markers in installed content.
- **Recipe condition evaluation** happens in-memory at CLI time through `buildConfigMap()`. Not a
  runtime consumer.

Manifest-only storage is sufficient because hooks, workflows, and agents do not need a read surface for
`install.type` — they see its effects via already-resolved config keys and pre-rendered file content.

**Resolution direction (pending PRD ratification per WOR's Origin/Spec orthogonality framing):**
the `pm.layer` value-set collapses to `arc-pm | none` and the `external` value retires. WOR's
Design Decisions section (`plan-work-organization-reform.md` § Origin ⊥ Spec orthogonality)
codifies the underlying principle: external trackers are intake (captured per-WU in the meta
file's `**Origin:**` field), never substitution for ARC's planning pipeline. Tracker-integration
behavior splits across two existing axes — per-WU `**Origin:**` and project-level
`coord.adapter` (per `plan-coord-probe.md`) — rather than being conflated into a `pm.layer`
value. Lite + external collapses cleanly: Lite uses `pm.layer: none` regardless of whether an
external tracker is present; tracker presence (if any) is captured via `Origin:` on the
session's commit-context footer or equivalent surface. Evaluate the concrete shape during this
plan's detail design once WOR ships its framing.

**Original options considered** (preserved for context):

1. New `pm.mode` value (e.g., `pm.mode: lite`) — rejected, stretches `pm.mode` semantics beyond PM
2. Top-level mode (e.g., `arc.mode: lite | standard`) — closest to the resolution, but expressed via
   CLI init flow rather than a config key
3. Profile concept — explored and rejected during earlier work (WU1); too many moving parts
4. Orthogonal flags — interesting but risks confusing combinations; the bounded Lite mode is better
   served by a single installation-type choice than emergent flag combinations

### Installation Type Recipe Mechanism

**How the install-type choice (Lite vs Full) drives which files get installed by `arc init`.**
[Configuration Identity](#configuration-identity) above establishes that install type is stored in
the manifest and gates downstream prompts. This section specifies the recipe-level mechanism that
turns that stored value into concrete file installation: which files land on disk for each mode,
and how the existing CLI infrastructure is extended to support it.

#### The gap

The CLI recipe (`packages/arc-framework/init-recipe.json`) currently supports additive
`include_files` conditions — a recipe-level condition like `pm.layer == arc-pm` adds files on top of
the baseline when matched. But the current baseline lists work-unit-lifecycle workflows
unconditionally, and Lite needs to exclude ~15 of those files plus possibly swap 2-3 templates. The
existing mechanism is additive only, so Lite's exclusion needs either a refactor of the baseline, a
new recipe operator, or a different mechanism entirely.

**Correction to prior plan text:** Earlier drafts of this plan doc asserted "the CLI recipe already
supports mode-conditional file installation." That claim was accurate only in the weak sense
(additive conditions exist); it was misleading in the direction Lite actually needs. This section
resolves the mechanism gap.

#### Current state — factual landscape

Pre-synthesis read of the recipe + manifest pipeline (2026-04-10). The code-path walk informs the
mechanism decision below and remains useful as implementation reference.

**The single file-resolution site.** `resolveFileList()` in `lib/classification.ts` (lines ~160–175)
is the only place where the final file list is constructed. It's a pure function:

```text
files = Set(recipe.include_files ?? [])
for each (condition, entry) in recipe.conditions:
    if evaluateCondition(condition, config):
        files.add(entry.include_files...)
return [...files]
```

Strictly additive: baseline ∪ matching conditions. No subtraction, no precedence rules, no override
semantics. Any mechanism change has to either modify this function, add a post-processing step, or
change the recipe schema so this function's logic shifts.

**Recipe schema** (TypeScript, `lib/types.ts`):

```ts
interface RecipeCondition {
  include_files: string[];   // only field
}

interface Recipe {
  include_files?: string[];                       // unconditional baseline
  computed_tokens?: Record<string, string>;
  prompts: RecipePrompt[];
  conditions: Record<string, RecipeCondition>;    // keyed by "key == value" strings
}
```

`validateRecipe()` in `template/recipe.ts` enforces exactly this shape. Any new field (e.g.,
`exclude_files`, `lifecycle_files`) requires matching changes in `types.ts` AND `validateRecipe()`.

**Condition evaluator** (`evaluateCondition()` in `template/recipe.ts`, lines ~188–209) supports two
operators — `==` (exact string equality) and `includes` (comma-separated list membership, for
multiselect prompt values like `tools`). Returns false if the key is undefined in the config map.
The operator set is fixed and easy to extend (single regex + branch), but extensions would cascade
into `validateRecipe()`'s condition-key check.

**Template-render `arc:if` mechanism** (`template/render.ts`) is separate from recipe conditions.
Operators are `==` and `!=` (no `includes`). Uses HTML comment directives
(`<!-- arc:if KEY == VALUE -->` ... `<!-- arc:endif -->`). Processes at install time for
`.template.md` files and at update time for reconstructing pristine baselines. Collapses blank
lines after stripping; nested `arc:if` inside an excluded outer block stays excluded. The two
mechanisms — recipe conditions and template conditionals — are intentionally distinct: recipe works
at install time on whole files, template conditionals work at render time on content blocks within
files.

**Three consumers of condition-included files** (code-duplication risk for schema changes):

- `commands/init.ts` — calls `resolveFileList(recipe, config)` directly (line ~135), then
  special-cases `ARC_IN_GIT_CONDITION` to build `arcInGitFiles` Set for layer classification
  (lines ~141–146).
- `commands/update.ts` — iterates over `recipe.conditions[condName].include_files` directly for
  its own file-list reconstruction (line ~177).
- `commands/reconfigure.ts` — similar direct iteration (line ~160).

**`ARC_IN_GIT_CONDITION` is already special-cased.** The code already treats one condition
differently from others for layer classification. Precedent — any new install-type condition would
likely need similar special treatment, since install mode affects layer/classification semantics
just like `pm.layer == arc-pm` does.

**Manifest schema** (`InstallConfig` in `lib/types.ts`):

```ts
interface InstallConfig {
  project_name: string;
  pm_mode: string;
  tools: string[];
  team_mode?: boolean;
}
```

Four fields. Adding `install_type` (or equivalent) is a schema-version bump and cascades into: this
interface, `validateManifest()` in `manifest/store.ts`, the manifest construction in `init.ts`
(line ~197), the manifest re-build in `reconfigure.ts`, the manifest carry-forward in `update.ts`,
and possibly migration logic for existing manifests at the old schema version.

**Change plan pipeline** (`manifest/plan.ts` + `manifest/update-files.ts` + `manifest/apply.ts`):

- `buildChangePlan()` is pure — diffs old manifest files against new file list from
  `resolveFileList()`, produces `additions`, `removals`, `merges`, `skipped`.
- `diffFileLists()` in `update-files.ts` is a simple set difference (`keep` / `added` / `removed`).
- `apply.ts` consumes the plan: Additions render + write + update manifest; Removals use
  `safeUnlink` for Framework-class files and route Configurable files to `keptForReview`
  (adopter-edited, needs human review before deletion); Scaffolded files are left untouched
  (adopter-owned).
- **Merges** use three-way merge via `mergeFileContents()` in `manifest/merge.ts`.

**Removals work today.** The infrastructure exists. This is critical for the Full → Lite downgrade
case — the reconfigure path can already remove files when the new file list is smaller than the
old one. What changes is _how_ files get on the removal list (via recipe or conditional), not
_whether_ they can be removed.

**Pristine store dependency.** The update pipeline reconstructs pristine baselines for three-way
merges by re-rendering templates against the stored `install_config`. If `InstallConfig` gains an
`install_type` field, pristine reconstruction during update needs to feed it through to
`resolveFileList()` and `renderConditionals()` to reproduce the original rendered content. This
couples install-type through the full update lifecycle, not just init.

#### Candidate approaches

Four approaches were evaluated against the "cleanest long-term" criterion:

1. **Invert the baseline** — make Lite the unconditional include list, add Full files via
   `install_type == full` condition. Zero schema change.
2. **Extend the recipe schema with `exclude_files`** — add a subtractive field to `RecipeCondition`.
   Smaller surface change but introduces set arithmetic into `resolveFileList()`.
3. **Ship two recipes** — `init-recipe-lite.json` + `init-recipe-full.json`, pick after first
   prompt. Simplest schema but duplicates the baseline across files.
4. **Bucket + gate** — split current `include_files` into baseline + `lifecycle_files`, expose
   `lifecycle_files` under a new condition form.

**Constraint summary across all four:**

| Constraint                       | Approach 1 (invert)  | Approach 2 (exclude_files)  | Approach 3 (two recipes)       | Approach 4 (bucket + gate)          |
|----------------------------------|----------------------|-----------------------------|--------------------------------|-------------------------------------|
| Recipe schema change             | No                   | Yes (`exclude_files` field) | No                             | Yes (e.g., `lifecycle_files` field) |
| `resolveFileList()` change       | No                   | Yes (set subtraction)       | No                             | Yes (conditional append)            |
| `validateRecipe()` change        | No                   | Yes                         | No                             | Yes                                 |
| New recipe-level operators       | No                   | No                          | No                             | No                                  |
| `InstallConfig` change           | Yes (`install_type`) | Yes (`install_type`)        | Yes (`install_type`)           | Yes (`install_type`)                |
| Manifest schema version bump     | Yes                  | Yes                         | Yes                            | Yes                                 |
| init.ts/update.ts/reconfigure.ts | Light (3 call sites) | Medium (set semantics)      | Medium (recipe selection step) | Medium (new field handling)         |
| Recipe file count                | 1 (same file)        | 1 (same file)               | 2 (duplicated baselines)       | 1 (same file)                       |
| Operator precedence question     | N/A                  | Yes (exclude vs include)    | N/A                            | N/A                                 |
| Future mode extensibility        | Additive conditions  | Additive + subtractive      | Per-recipe fragmentation       | One bucket per axis (doesn't scale) |

All four require `install_type` in `InstallConfig` and a schema version bump — that's common and
unavoidable. The differentiation lives in the recipe-schema + `resolveFileList()` layer.

#### Rejections

**Approach 3 (two recipes) — rejected.** Baseline duplication across two files creates a silent
divergence risk on every feature add. Orthogonal axes (future content subsets, team variants, etc.)
are multiplicative in file count. Violates DRY at the authoring surface. Fails the "cleanest
long-term" criterion immediately.

**Approach 4 (bucket + gate) — rejected.** The `lifecycle_files` bucket handles the one mode axis
cleanly but accretes a new field per orthogonal axis. The constraint table above already flagged
"doesn't scale to orthogonal mode axes without accretion" — that alone kills it under the
criterion. Future axes (Local mode, team mode variants, etc.) would each add a new bucket field,
producing a schema that grows linearly with axis count instead of compositionally.

**Approach 2 (`exclude_files` schema extension) — rejected.** Introduces subtractive semantics
into a model that is currently pure union. Consequences:

- `resolveFileList()` becomes `baseline ∪ included − excluded`, forcing an ordering decision
  (exclude-before-include? include-before-exclude? what if two conditions overlap with opposing
  semantics?). There is no single defensible answer — it depends on intent per call site, which
  is exactly the kind of implicit-context dependence that clean schemas avoid.
- Every future recipe reviewer has to mentally simulate both set operations on every read.
- The new operator would be used for a single axis (install type) and doesn't earn its schema
  weight. ARC's additive conditions successfully handle `pm.layer`, `tools`, and other axes
  without needing subtraction.
- Every consumer of the recipe-conditions pipeline (`init.ts`, `update.ts`, `reconfigure.ts`)
  would need to handle both operations, multiplying the change surface.

The additive-model-fit argument is the decisive one: when a proposed mechanism change would
introduce new operators (subtraction, precedence rules, conflict resolution) for a single use
case, the additive alternative is preferred even if the refactor is larger. Approach #2 was
mechanically correct but introduced operator precedence ambiguity with no single defensible
answer.

#### Adopted: Approach 1b — symmetric additive

**Approach 1 (invert baseline) adopted with refinement as Approach 1b (symmetric additive).**

The original Approach 1 framing ("make Lite the unconditional baseline, add Full via condition")
privileges one mode as the baseline. Refinement 1b partitions into three buckets symmetrically, so
Full and Lite are peer extensions on a shared foundation rather than one being primary and one
derivative:

- **Unconditional baseline** — files universal to both modes (constitution, most strategies, core
  workflows, templates, system infrastructure, initial-setup workflows, session-lifecycle
  workflows, supplemental workflows).
- **`install.type == full`** condition — Full-only files (`work-unit-lifecycle/*`, META-PRD template).
- **`install.type == lite`** condition — Lite-only files (`verify-work.md` Lite-only workflow per
  Finding #2; any Lite-specific whole-file deliverables).

Process-task-loop (Finding #5) and session-init / session-handoff (Finding #4) do **not** land in the
gated buckets — they stay in the unconditional baseline as `.template.md` files with `install.type`
`arc:if` blocks rendered at install time. Whole-file gating in the recipe is reserved for files with
no cross-mode content to preserve; mixed-content files use inline template gating instead.

The mechanical work is identical to vanilla Approach 1, but the conceptual framing matches how
this plan doc talks about Lite and Full (peer modes with different ceremony, not "Full minus
things"). Aligning the mechanism with the conceptual framing is free — no additional code, just a
symmetric layout of the recipe file.

**Why Approach 1b wins on every criterion versus the strongest alternative (Approach 2):**

| Criterion                  | Approach 1b                             | Approach 2                   |
|----------------------------|-----------------------------------------|------------------------------|
| Additive-model fit         | Unchanged                               | Introduces subtraction       |
| `resolveFileList()` change | Zero                                    | Set arithmetic + ordering    |
| Schema change              | Zero                                    | New field + validator        |
| Operator precedence        | N/A                                     | Exclude-vs-include ambiguity |
| Scaling to new axes        | Additive conditions                     | Additive + subtractive       |
| Recipe readability         | Conditions self-document modes          | "Plus these, minus those"    |
| Test surface               | Existing `resolveFileList()` tests hold | New semantics need new tests |
| Precedent                  | Matches `pm.layer == arc-pm` pattern    | New pattern                  |

#### Stress-test trace-throughs

Run 2026-04-10 before committing to the mechanism. Each trace exercised the adopted approach
against a realistic usage scenario; no trace surfaced an unhandled case.

- **Multi-axis composition** with `pm.layer`, `tools`, `team.enabled` all resolved cleanly. The one
  interaction that looked like it might surface an open question — Lite × `pm.layer: arc-pm` — is
  already forbidden elsewhere in this plan doc (see [Configuration
  Identity](#configuration-identity) above and [Forbidden Combinations](#forbidden-combinations)
  below); Lite skips the `pm.layer` prompt entirely, so the condition never fires.
- **Update pipeline** (Full → Full on framework version bump): standard additions path, unchanged
  from current behavior.
- **Pristine reconstruction during update**: `install_type` needs to flow through
  `buildConfigMap()` alongside `pm_mode`. The pattern is already established; one-line addition.
- **Reconfigure Full → Lite downgrade**: existing removal infrastructure (`safeUnlink` for
  Framework-class files, `keptForReview` for Configurable files) handles it. The orphan-handling
  details are owned by the Full → Lite downgrade work (see [Graduation / Downgrade
  Paths](#graduation--downgrade-paths)); this mechanism doesn't make that problem worse.
- **Reconfigure Lite → Full upgrade**: inverse case, additions path, no surprises.
- **Legacy manifest migration**: existing Full manifests pre-`install_type` get default
  `install_type: "full"` during manifest version bump. Standard pattern.

#### Decided mechanism

- **Approach:** Symmetric additive via `install.type` condition. Three buckets: unconditional
  universal baseline, `install.type == full` condition, `install.type == lite` condition. Full and
  Lite are peer extensions on a shared foundation.
- **No recipe schema change.** `Recipe` and `RecipeCondition` interfaces stay as-is.
- **No `resolveFileList()` change.** The existing pure-additive logic covers the new conditions
  without modification.
- **Config key:** `install.type` (dotted form, consistent with `pm.layer`, `team.enabled`,
  `branch.protection`). Authoritative storage is the manifest's `install_config.install_type`
  field; the dotted form is what appears in recipe condition keys and template `arc:if`
  directives.
- **`InstallConfig` schema:** Adds a new required field `install_type: string`. Manifest schema
  version bumps. Legacy manifests (pre-`install_type`) migrate with `install_type: "full"`
  default as part of the version-bump migration.
- **`buildConfigMap()` plumbing:** Flattens `install_type → install.type`, making the value
  available to both `evaluateCondition()` (for recipe conditions) and `renderConditionals()` (for
  template `arc:if` directives). This pattern parallels the existing `pm_mode → pm.mode` handling
  and is a one-line addition.

**Anchor file bucket assignments confirmed now** (nothing else contradicts):

- `work-unit-lifecycle/*` (8 files) → `install.type == full`.
- META-PRD template (`reference/META-PRD.template.md`) → `install.type == full`. Default Lite
  install has no META-PRD; Finding #12/R6 adds an opt-in Lite variant
  (`reference/META-PRD.lite.template.md`) combining product direction and technical overview
  content, installed agent-led during `01_setup-lite.md` (not via recipe). See [The Lite
  PRD](#the-lite-prd) § SQ1 and [Lite Initial Setup](#lite-initial-setup) § Optional Lite
  META-PRD for the opt-in mechanism and graduation content migration.
- Initial-setup workflows (`system/workflows/arc/initial-setup/01_verify-and-configure.md`,
  `02_define-project.md`) → `install.type == full`. Resolved 2026-04-13 (Finding #12/R6);
  reassigned from Finding #8's implicit unconditional baseline after strip analysis surfaced
  ~35-40% Lite-Full overlap across the two files. Purpose-built Lite replacement
  (`01_setup-lite.md`) lands under `install.type == lite`. See [Lite Initial
  Setup](#lite-initial-setup).

Other bucket assignments are pending resolution of dependent design decisions — see Feedforward
below.

#### Feedforward — file bucket assignments pending other decisions

These files have preliminary bucket assignments that depend on resolution of other design
decisions. Final bucket confirmation happens as each dependent decision lands.

- **Process-task-loop variant contents** — Resolved 2026-04-13 (Finding #5). Reversed from two-file
  variant (Mechanism A) to single-file-with-`arc:if` (Mechanism B), consistent with Finding #4's
  session management resolution. `3_process-task-loop.template.md` in the package source stays in the
  unconditional baseline (the file is already a template via pre-existing `team.enabled` / `pm.layer`
  gates); Finding #5 adds `install.type` axis gates layered onto the existing mechanism. Four gated
  surfaces enumerated in [Lite Process-Task-Loop](#lite-process-task-loop).
- **Lite ship step deliverable** — Resolved 2026-04-11 (Finding #2). Delivered as a dedicated
  `verify-work.md` workflow file (parallel-named to Full's `verify-work-unit.md`), landing at
  `system/workflows/arc/verify-work.md` under the `install.type == lite` bucket in the recipe.
  The Lite task list verification phase task points to `verify-work.md` in place of Full's
  `verify-work-unit.md`. See [The Lite Task List](#the-lite-task-list) § Verification Phase for
  the two-files-not-one rationale and naming parallelism.
- **`manage-incidental-work.md`, `maintain-project-docs.md`** — unclear bucket assignment.
  Incidental work routing depends on the WU pipeline concept (Full territory); project docs
  maintenance is arguably universal. Pending the Lite workflow shape findings (Findings #2/#4/#5)
  which will determine what a Lite process-task-loop looks like.
- **Strategy files** (`reference/strategies/arc/*`) — classified per
  [Strategy Applicability Mapping](#strategy-applicability-mapping). Six strategies are
  applies-as-is and stay in the unconditional baseline. Two are needs-variant
  (`strategy-work-organization`, `strategy-work-planning`) — also baseline, with inline
  `<!-- arc:if install.type == full -->` blocks carving out Full-only sections and a
  `.template.md` rename so the render pipeline picks them up. Two are Full-only:
  `strategy-team-coordination.md` (excluded; Lite forces solo) and `strategy-planning-module.md`
  (excluded by composition via the `pm.layer` gate).
- **Session-lifecycle workflow variants** (`session-init.template.md`,
  `session-handoff.template.md`) — stay in the unconditional baseline with inline `arc:if`
  directives for install.type gating per [Lite Session Management](#lite-session-management).
  Single-file-with-`arc:if` (Mechanism B) resolved 2026-04-11 via Finding #4.
- **`ARCd-config.yml` treatment** — resolved by [Lite Config Template
  Mechanism](#lite-config-template-mechanism) below. The file stays in the unconditional baseline
  and is renamed to `system/ARCd-config.template.yml` with `<!-- arc:if install.type == full -->`
  blocks gating the `pm.layer` and `team.enabled` sections. No new bucket assignment needed.

#### Not yet established (verify during implementation)

These items don't gate the mechanism decision but will need confirmation during implementation
task generation or execution. They're recorded here so the PRD's task generation phase can scope
them.

- **Test file inventory** exercising `resolveFileList()`, `validateRecipe()`, and the three
  command paths. Affects the change-size estimate for implementation tasks.
- **Exact migration step wiring** in manifest version bump logic — confirm the migration function
  signature and where legacy-manifest detection fires.
- **Final `install_type` naming** — `install_type` vs. alternatives (`install_mode`, `arc_mode`,
  `mode`). Coordinate with the ARCd Rebrand WU's config naming work if any
  overlaps surface.

#### ADR authoring — implementation-phase

The mechanism decision recorded here is a **committed sibling of ADR 1 "Recipe as Authoritative
Install-Time Specification"** per the Tier 4 ADR grouping decision (see § Resolved Decisions →
"ADR grouping for modes WU deliverables (Tier 4)" and § Consolidated Deliverables Inventory
§ ADRs item 53). ADR 1 is an umbrella covering three mechanism siblings: whole-file installation
(this section, Finding #8), prompt orchestration (§ Prompt Orchestration, Finding #9), and
within-file content rendering (§ Lite Config Template Mechanism, Finding #10).

**Authored during implementation, not pre-PRD.** The ADR belongs alongside the code change it
documents — not as a pre-PRD artifact — and is authored as a task in the modes-WU task list.
ADR number is assigned at write time. The general sequencing discipline for ARC planning
(plan doc → PRD → task list → ADR during execution) means ADRs are implementation-phase
deliverables; the commitment here is only to the grouping structure, not to the ADR content.

### Prompt Orchestration and Recipe Authority

**How `arc init` asks the Lite-vs-Full question, gates downstream prompts on the answer, and where
the authority for prompt declarations actually lives.** [Configuration Identity](#configuration-identity)
above establishes that Lite skips `pm.layer` and `team.enabled`; [Installation Type Recipe
Mechanism](#installation-type-recipe-mechanism) resolves how the stored `install.type` value drives
file installation. This section resolves the parallel question for prompts: what mechanism expresses
"show this prompt only when `install.type == full`" — and, as the deeper question that surfaced
during evaluation, who owns the declaration of prompts in the first place.

#### The gap

The plan doc (§ Configuration Identity and § Configuration and Installation) states that Lite skips
the `pm.layer` and `team.enabled` prompts. The recipe (`packages/arc-framework/init-recipe.json`) defines
these prompts as entries in a flat `prompts` array with no conditionality field, so there is no
in-schema way to express "skip this under Lite." Finding #8's Approach 1b resolves file inclusion via
the `install.type` condition but does not give the recipe or the CLI a mechanism for prompt gating —
a distinct concern with its own solution space.

**The deeper gap surfaced during evaluation.** The initial framing was "add a `show_when` field to
`RecipePrompt` entries and have the prompt loop consult it." A pre-migration code read revealed a
load-bearing fact the handoff's resolution lean did not fully account for: **`recipe.prompts` is
validated but never consumed.** No code in the CLI iterates the recipe's `prompts` array to drive
prompting. The hand-rolled `runInitPrompts()` in `src/prompts/init-prompts.ts` hardcodes the same
four prompts as explicit `@clack/prompts` calls, and the same pattern repeats across six other sites
(enumerated below). Finding #9 is therefore not a simple "add `show_when`" addition — it is a
question about what authority the recipe schema holds today and what authority it should hold going
forward. The gating decision falls out of that authority decision.

#### Current state — factual landscape

The [Installation Type Recipe Mechanism](#installation-type-recipe-mechanism) § above already walks
the recipe and manifest pipeline. This section refers back to that factual landscape rather than
re-describing it, and zooms in on the prompt-specific pieces.

**`recipe.prompts` is metadata-only.** Verified via `grep` for `recipe\.prompts|Recipe\.prompts|
\.prompts\b` across `packages/arc-framework/src/`:

- **`validateRecipe()`** in `lib/template/recipe.ts` reads `recipe.prompts` to validate the array
  shape (each prompt has an `id`, a `type` in `text|select|multiselect|confirm`, a `message`, option
  arrays where required).
- **Nothing else** reads `recipe.prompts`. Not `runInitPrompts()`, not `runReconfigurePrompts()`, not
  `runJoinPrompts()`, not `buildConfigMap()`, not `buildConfigKeyOverrides()`, not `buildTokenMap()`,
  not the non-interactive builders. The `id`, `message`, `options`, `default`, `token`, and
  `config_key` fields declared in `init-recipe.json` are inert metadata.

**Seven hand-coded duplication sites** encode the same four-prompt knowledge the recipe already
declares:

1. **`runInitPrompts()`** (`src/prompts/init-prompts.ts`) — four explicit
   `p.text` / `p.autocompleteMultiselect` / `p.select` / `p.confirm` calls for `project_name`,
   `tools`, `pm_mode`, `team_mode`. Owns the rich UX: note preambles, autocomplete with labels and
   hints, defaults derived from `basename(cwd)`, title-case transformation, clack cancellation
   sentinel handling.
2. **`runReconfigurePrompts()`** (`src/prompts/reconfigure-prompts.ts`) — three explicit prompt calls
   for `project_name`, `pm_mode`, `team_mode` (tools are excluded — they route through the add-agent
   workflow). Owns a different UX: current-value-as-default, team-mode-enable warning logic,
   `isNoChange()` comparator, separate `ReconfigurePromptResult` type.
3. **`runJoinPrompts()`** (`src/prompts/join-prompts.ts`) — two prompt calls for `role` and `tools`.
   Shares the `promptTools()` helper with init (one small, genuine piece of DRY).
4. **`buildNonInteractivePrompts()`** (`src/prompts/non-interactive.ts`) — CLI flag mapping for
   `--name` / `--pm-mode` / `--tools` / `--team`. Hardcodes defaults
   (`project_name: basename(cwd)`, `tools: []`, `pm_mode: "none"`, `team_mode: false`). Hardcodes the
   valid `pm_mode` set as `VALID_PM_MODES = ["none", "arc-in-git", "external"]` — a third copy of
   knowledge already in `init-recipe.json`.
5. **`buildNonInteractiveReconfigurePrompts()`** (`src/prompts/reconfigure-prompts.ts`) — parallel
   flag mapping for reconfigure; hardcodes the same fields.
6. **`buildConfigMap()`** (`src/lib/config.ts`) — maps prompt result to condition-evaluation config
   map. Hardcodes `pm.mode`, `team.mode`, `tools` via constants (`CONFIG_KEY_PM_MODE`,
   `CONFIG_KEY_TEAM_MODE`) and a literal `"tools"` string. Ignores `recipe.prompts[i].config_key`.
7. **`buildConfigKeyOverrides()`** (`src/lib/config.ts`) — parallel mapping for `ARCd-config.yml`
   rendering. Hardcodes the same keys plus a `user.sync_push` derivation from `team_mode`.

And `buildTokenMap()` (`src/lib/config.ts`) hardcodes `PROJECT_NAME` and `REPO_ROOT` despite
`recipe.prompts[0].token = "PROJECT_NAME"` being right there in the recipe declaration.

**What hand-rolled code has that the recipe schema can't express today.** Significant — any
"make the recipe authoritative for everything" reframe has to solve these or accept UX regression:

- **Multi-line note preambles** before select prompts (the tools preamble; the PM mode preamble with
  four paragraphs of per-option descriptions).
- **Autocomplete multiselect** with per-option `label` + `hint` fields (the tools list).
- **Computed defaults** like `basename(cwd) → titleCase()` for `project_name`. Recipe has a
  `computed_tokens` field for init-time token computation but no parallel for prompt defaults.
- **Current-value-as-default** for reconfigure (each prompt's default is read from the existing
  manifest).
- **Conditional warnings** — "team mode changes affect all developers" warning fires only when the
  user enables team mode from a previously-disabled state.
- **Non-interactive flag mapping** with per-field validation (e.g., `--name` cannot be empty,
  `VALID_PM_MODES` check).
- **Sentinel-based cancellation** across nested `await` points.

**`evaluateCondition()` is partial-config-safe.** The condition evaluator in `lib/template/recipe.ts`
returns `false` when the referenced key is undefined in the config map
(`if (configValue === undefined) return false`). This matters for prompt gating: a `show_when`
evaluated mid-loop against the partial config built so far will correctly return `false` for keys
not yet answered — which is the right behavior as long as the `install.type` prompt comes before
any prompt that references it.

**Recipe `prompts` ordering is already significant.** The recipe declares prompts as an ordered
array; the hand-rolled loops walk that order implicitly by writing four sequential awaits. Adding
`show_when` constrains the order further: gated prompts must come after the prompt that defines
their gating condition. This is a documented convention rather than a structural check (see drift
mitigation below).

#### Three framings

The gating question collapses into a broader question: what authority does `recipe.prompts` hold?
Three defensible answers, in order of ambition.

**Framing A — hand-coded gating; recipe stays metadata.** Accept that `recipe.prompts` is
vestigial. Do not touch the schema. Hand-code the gating directly in `runInitPrompts()` (and the
reconfigure and non-interactive parallel spots): collect `install.type` first, then
`if (install_type === "full") { prompt for pm_mode ... } else { pm_mode = "none" }`. Add
`install.type` as a new hand-rolled prompt, new constant, new CLI flag. Lowest cost; honest about
the current state; leaves the duplication unresolved.

- **Pros:** Smallest change. No schema touch. No drift risk (there is only one source). Ships today
  with a local modification to `runInitPrompts()` + `runReconfigurePrompts()` + non-interactive
  builders. Code does not pretend the recipe is authoritative when it is not.
- **Cons:** Every new mode-axis prompt in the future requires touching the same seven sites. The
  next time "add a conditional prompt" comes up, the same analysis happens. `recipe.prompts` stays
  inert metadata indefinitely — a latent smell in the codebase that invites the next reader to
  repeat this investigation. No progress on the duplication.
- **Rejection reasoning:** Framing A is the honest fallback if scope must be minimized, but it
  accepts a known problem instead of reducing it. Finding #8 already moved the recipe toward
  authoritative status for file inclusion; Finding #9 is the natural moment to move it forward for
  prompts too. Choosing A here makes the next session's Finding #10 work harder (more duplicated
  surfaces to keep in sync), and the session after that harder still. The marginal cost of Framing
  C over Framing A is small; the compounding cost of repeatedly choosing A is not.

**Framing B — full data-driven prompt loop.** Convert `runInitPrompts()` (and the reconfigure and
non-interactive parallels) to iterate `recipe.prompts` and dispatch to `@clack/prompts` based on
`prompt.type`. Grow the schema to express everything hand-rolled code currently owns: multi-line
note preambles, option labels and hints, computed defaults, current-value-as-default, conditional
warnings, non-interactive flag conventions, validation rules. The recipe becomes the true single
source of truth for init-time behavior across all surfaces.

- **Pros:** Single source of truth, in the strongest sense. Adding a new prompt is a pure recipe
  edit. Maximum DRY. The recipe as a declarative contract is then actually honored by execution.
  Aligns with the "recipe is authoritative" direction Finding #8 started.
- **Cons:** The schema bloat required to express all current UX affordances is significant. Note
  preambles are multi-line strings with interior formatting; option hints are per-option metadata
  that changes the select widget shape; defaults need a computation language (how do you express
  `basename(cwd) → titleCase()` in JSON?); current-value-as-default needs a different source of
  default per command; conditional warnings need a predicate grammar plus a warning-text field.
  Each of these is an open design problem on its own. And the growth is speculative: we do not yet
  know which affordances future mode-axis prompts will need. Growing the schema to accommodate
  hypothetical needs is the kind of premature abstraction ARC's own YAGNI stance pushes back on.
- **Rejection reasoning:** Framing B is the right target state eventually, but attempting it in
  this finding would couple Finding #9's resolution to a cascade of schema design decisions that
  are not actually blocking prompt gating. The gating question has a cheaper answer (Framing C)
  that composes toward Framing B's target state without requiring it today. If a future finding
  surfaces a new affordance the schema cannot express, the same schema-growth debate happens
  then — but grounded in a concrete need, not a preemptive refactor.

**Framing C — narrow recipe authority.** Recipe owns three things: **identity** (which prompts
exist, keyed by stable IDs), **config-surface mapping** (each prompt's `config_key` and `token`
fields become the authoritative source for `buildConfigMap` / `buildConfigKeyOverrides` /
`buildTokenMap`), and **gating** (a new optional `show_when` field on `RecipePrompt` entries, using
the same condition grammar as `recipe.conditions`). Hand-rolled code keeps ownership of the UX
layer — note preambles, autocomplete, defaults, warnings, flag mapping. Hand-rolled loops consult
the recipe for gating and iterate it for config and token map assembly.

- **Mechanism summary:** Schema delta is one optional field (`show_when?: string`) plus a validator
  extension (check it matches `CONDITION_PATTERN` when present). A new helper
  `shouldShowPrompt(prompt, partialConfig): boolean` lives alongside `evaluateCondition()` in
  `lib/template/recipe.ts`. Each hand-rolled loop calls it before each gated prompt.
  `buildConfigMap` / `buildConfigKeyOverrides` / `buildTokenMap` refactor to iterate
  `recipe.prompts` for their mapping source. The `install.type` prompt is added as a new recipe
  entry near the front of the array (position detailed below).
- **Pros:** Resolves Finding #9's gating question cleanly. Gives `recipe.prompts` real authority
  for the first time (gating + config mapping + identity), which justifies its continued existence.
  No schema bloat for UX affordances. Composes toward Framing B's target state — a future session
  can convert UX to data-driven without rewriting the gating layer. Reduces duplication by removing
  hardcoded-constant mappings from `config.ts`. Adding a new gated prompt is a recipe edit plus a
  drift-test update, not a seven-site tour.
- **Cons:** Dual-source-of-truth persists (recipe declares prompt identity; hand-rolled code
  executes the prompts). If a developer adds a prompt to `runInitPrompts()` without updating the
  recipe, the prompt has no `config_key` mapping, no gating, no token mapping — silent partial rot.
  This is the real cost of Framing C and the drift mitigation below directly addresses it.

**Adopted: Framing C — narrow recipe authority.** Reasoning: it advances the "recipe is
authoritative" story from Finding #8 without committing to the speculative schema growth Framing B
requires; it resolves prompt gating along the way; the drift risk is real but tractable at low
cost (see drift mitigation below).

#### Schema delta

Single optional field added to `RecipePrompt` in `lib/types.ts`:

```ts
interface RecipePrompt {
  id: string;
  type: PromptType;
  message: string;
  default?: string | boolean | string[];
  options?: string[];
  token?: string;
  config_key?: string;
  show_when?: string;  // NEW — optional condition; prompt is shown when it evaluates true
}
```

**Grammar.** `show_when` values use the same `CONDITION_PATTERN` grammar as existing
`recipe.conditions` keys — `"key == value"` or `"key includes value"`. Reusing the grammar means no
new operator work, no new regex, and the same `evaluateCondition()` implementation handles both.
`show_when` values reference config keys from **earlier** prompts in the same recipe (by ordering
constraint, below).

**Semantics.** When `show_when` is absent (the common case), the prompt is always shown. When
`show_when` is present, the condition is evaluated against the partial config map built from prior
prompts' answers. If the condition returns `true`, the prompt is shown and its answer is collected;
if `false`, the prompt is skipped and its value is taken from `default` (see "Skipped-prompt
defaults" below).

**Validator extension.** `validateRecipe()` gets a new check: if `show_when` is present on any
prompt, verify its value matches `CONDITION_PATTERN`. Error message matches the existing condition-key
validation: `"Prompt ${i} ('${id}'): invalid 'show_when' (expected 'key == value' or 'key includes
value' format)"`.

#### Helper contract

A new exported function lives in `lib/template/recipe.ts` alongside `evaluateCondition()`:

```ts
/**
 * Decide whether a prompt should be shown given the partial config
 * collected from prior prompts. Returns true when show_when is absent
 * or when the show_when condition evaluates true against partialConfig.
 */
export function shouldShowPrompt(
  prompt: RecipePrompt,
  partialConfig: Record<string, string>,
): boolean {
  if (!prompt.show_when) return true;
  return evaluateCondition(prompt.show_when, partialConfig);
}
```

Pure function; single dependency on `evaluateCondition`; testable in isolation. No change to
`evaluateCondition` itself — it already handles partial maps via the `configValue === undefined`
check.

#### Wire points

**`runInitPrompts()`** (`src/prompts/init-prompts.ts`):

1. Accept the recipe as a parameter (the existing call site in `commands/init.ts` already has it in
   scope).
2. Maintain a `partialConfig: Record<string, string>` that accumulates as answers come in. After
   each prompt, write the answer's config key into the map using the prompt's `config_key` field
   from the recipe (looked up by `id`).
3. Before each existing prompt call, consult
   `shouldShowPrompt(recipe.prompts.find(p => p.id === "pm_mode"), partialConfig)`. If `true`, run
   the existing `p.select` / `p.confirm` call unchanged. If `false`, skip the prompt and use the
   recipe's `default` value.
4. The `tools` and `project_name` prompts are unconditional — `show_when` is absent on their recipe
   entries, `shouldShowPrompt` returns `true`, and they run unchanged. No existing UX regression.

**`runReconfigurePrompts()`** (`src/prompts/reconfigure-prompts.ts`):

Same pattern. `install.type` is NOT prompted here — reconfigure keeps the existing manifest value
(see "Reconfigure boundary" below). But `pm_mode` and `team_mode` gating still applies: if the
existing manifest has `install_type: "lite"`, reconfigure respects it by skipping both prompts.
`partialConfig` is seeded with `install.type` from the manifest's `install_config.install_type`
before the first prompt so `shouldShowPrompt` evaluates correctly from the first gated prompt
onward.

**Non-interactive builders** (`src/prompts/non-interactive.ts`,
`src/prompts/reconfigure-prompts.ts`):

Same gating logic applied to flag-derived config. `buildNonInteractivePrompts()` computes each
field's value; for gated fields (`pm_mode`, `team_mode`), it consults `shouldShowPrompt()` against
the partial config built so far and uses the recipe default when gated out. This ensures
`arc init --yes --install-type lite` produces the same config shape as the interactive Lite path.

**`buildConfigMap()` and `buildConfigKeyOverrides()` refactor** (`src/lib/config.ts`):

Replace hardcoded key constants with recipe iteration. For each prompt in `recipe.prompts` that has
a `config_key`, map the answer value into the config map using that key. Multiselect values
(`string[]`) flatten via `join(",")` to match the existing `tools` semantics. Booleans stringify via
`String(value)` to match the existing `team_mode` semantics. The `user.sync_push` derivation from
`team_mode` stays in code — that is a computed override, not a recipe-declared mapping.

```ts
export function buildConfigMap(
  prompts: InitPromptResult,
  recipe: Recipe,
): Record<string, string> {
  const config: Record<string, string> = {};
  for (const prompt of recipe.prompts) {
    if (!prompt.config_key) continue;
    const value = (prompts as unknown as Record<string, unknown>)[prompt.id];
    if (Array.isArray(value)) {
      config[prompt.config_key] = value.join(",");
    } else if (value !== undefined) {
      config[prompt.config_key] = String(value);
    }
  }
  return config;
}
```

This removes `CONFIG_KEY_PM_MODE` / `CONFIG_KEY_TEAM_MODE` as load-bearing constants in `config.ts`
(they may remain elsewhere if the shell-side hooks reference them). The recipe becomes the
authoritative source for the config-key-to-prompt-field mapping.

**`buildTokenMap()` refactor** (`src/lib/config.ts`):

Similar iteration for `prompt.token`. `PROJECT_NAME` (from the `project_name` prompt) is sourced
from the recipe; `REPO_ROOT` stays as a computed token (not from a prompt). Future prompts that
declare a `token` field will flow through automatically.

**`promptTools()` stays shared.** The one small piece of existing DRY between `runInitPrompts()` and
`runJoinPrompts()` is preserved unchanged.

#### `install.type` prompt addition

The Lite-vs-Full choice needs to be collected at init time. It is added as a new recipe prompt at
position 1 (after `project_name`, before `tools`) and as a new clack `p.select` call at the
corresponding position in `runInitPrompts()`.

**Recipe entry:**

```json
{
  "id": "install_type",
  "type": "select",
  "message": "Installation type?",
  "options": ["full", "lite"],
  "default": "full",
  "config_key": "install.type"
}
```

**Default: `full`.** Matches the back-compat default established in Finding #8's manifest migration
path (legacy manifests migrate with `install_type: "full"`). Matches the common case: Full ARC is
the current shape of the framework; Lite is the minority path. Non-interactive `arc init --yes`
without `--install-type` produces a Full install, matching today's behavior pre-Finding #9.

**Canonical flag: `--install-type <lite|full>`.** Consistent with other dotted-key flags (`--pm-mode`,
`--name`, `--team`). Shorthand aliases `--lite` and `--full` are also supported — already committed
to in plan-doc § Init Flow Implications. `--lite` and `--full` are mutually exclusive; passing both
is a flag-validation error. Both the canonical and shorthand flags route through
`buildNonInteractivePrompts()` and produce the same effect.

**Prompt position — ordering constraint.** The `install.type` prompt must come before any prompt
gated on it. In the recipe's `prompts` array the order becomes:

1. `project_name` — unconditional
2. `install_type` — unconditional (NEW)
3. `tools` — unconditional
4. `pm_mode` — `show_when: "install.type == full"`
5. `team_mode` — `show_when: "install.type == full"`

In `runInitPrompts()` the same order is preserved in the hand-rolled sequence. The `install_type`
select gets its own clack `p.select` call with a short note preamble describing the choice and
pointing to documentation.

**Ordering as documented convention, not structural check.** `validateRecipe()` does not enforce
that `show_when` references come from earlier prompts in the array. Adding a structural check is
possible (walk the prompts array, maintain a running set of seen config keys, verify each
`show_when`'s referenced key is in the set) but this is more infrastructure than the constraint
warrants today. The drift unit test (below) catches the practical failure mode.

**Skipped-prompt defaults.** When a prompt is gated out, its value comes from `default` in the
recipe entry. For `pm_mode` the current default is `"none"` (correct for Lite — `pm.layer: arc-pm`
is contradictory per § Configuration Identity). For `team_mode` the default is `false` (correct for
Lite — Lite is inherently solo per § Configuration Identity). Both defaults match the existing Lite
semantics already stated in the plan doc; no new design decisions required.

#### Gating declarations

The explicit set of `show_when` declarations in the recipe after this finding lands:

| Prompt         | `show_when`            | Skipped value (default) |
|----------------|------------------------|-------------------------|
| `project_name` | — (always shown)       | —                       |
| `install_type` | — (always shown)       | —                       |
| `tools`        | — (always shown)       | —                       |
| `pm_mode`      | `install.type == full` | `"none"`                |
| `team_mode`    | `install.type == full` | `false`                 |

**No other prompts need gating.** Verified against Finding #1's Lite PRD landing — the Lite PRD's
workflow shape uses mode-conditional edges at the workflow-step level (inside `.template.md` files
rendered via `arc:if`), not at init-time prompt level. No new Lite-conditional prompts emerged from
Finding #1.

#### Drift mitigation — validation via unit test

Framing C's dual-source split (recipe declares identity, hand-rolled code executes) has one real
failure mode: a prompt added to `runInitPrompts()` without a matching recipe entry, or vice versa.
The failure is silent — the new prompt has no `config_key` mapping, no gating support, no flow
through the refactored `buildConfigMap`. The symptoms (missing config key, unmapped condition,
broken install for certain combinations) are hard to trace to the root cause.

**Mitigation: a unit test in `__tests__/unit/prompts/` that compares the recipe's prompt IDs against
the hand-rolled loops' known sets.** The test enumerates the prompt IDs actually awaited in
`runInitPrompts()` and `runReconfigurePrompts()` (via exported constants `INIT_PROMPT_IDS` and
`RECONFIGURE_PROMPT_IDS` maintained alongside the hand-rolled loops) and asserts they match the
corresponding recipe prompt IDs for that surface.

**Why a unit test and not a `validateRecipe()`-level runtime check.** `validateRecipe()` runs at
install time and validates the recipe shape in isolation — it has no visibility into what the
hand-rolled prompt loops actually await. Wiring `validateRecipe()` to know about the hand-rolled
loops either imports prompt-loop code into the recipe validator (layering violation) or duplicates
the prompt IDs into a list the validator checks against (re-introduces the same duplication the
finding is trying to reduce). A CI-time unit test catches the drift at the right latency without
either problem.

**Test shape** (conceptual):

```ts
test("runInitPrompts prompt set matches recipe.prompts", () => {
  const recipe = loadRecipe();
  const recipePromptIds = recipe.prompts.map(p => p.id);
  expect(INIT_PROMPT_IDS).toEqual(recipePromptIds);
});

test("runReconfigurePrompts prompt set matches recipe.prompts (minus tools)", () => {
  const recipe = loadRecipe();
  const expected = recipe.prompts.filter(p => p.id !== "tools").map(p => p.id);
  expect(RECONFIGURE_PROMPT_IDS).toEqual(expected);
});
```

The `INIT_PROMPT_IDS` and `RECONFIGURE_PROMPT_IDS` constants are maintained in the same files as
the hand-rolled loops — touching the prompt sequence without updating the constant produces an
immediately visible diff in review, and touching only the constant without updating the sequence
produces a test failure on the next CI run.

This is small infrastructure cost (two tests, two exported constants) for the right weight of
mitigation: cheap enough to include, effective enough to catch the realistic failure mode.

#### Reconfigure boundary

`arc init --reconfigure` does not mutate `install.type`. The interactive reconfigure flow
(`runReconfigurePrompts`) does not prompt for it; the non-interactive flow
(`buildNonInteractiveReconfigurePrompts`) does not accept `--install-type` as a flag. The existing
manifest's `install_config.install_type` is read and seeded into `partialConfig` for gating
evaluation, then written back unchanged.

**Rationale.** Reconfigure is for structural settings — project name, PM mode, team mode.
Lite↔Full transition is a materially different operation: it adds or removes files, rewrites the
manifest schema, potentially re-prompts for mode-specific settings, and involves methodology-level
decisions (is this project ready for Full? Is this project right-sized for Lite?) that do not fit
the "change a value, re-render" reconfigure model.

**The upgrade and downgrade paths need their own CLI surfaces.** Finding #16 (Full → Lite
downgrade) resolved the concrete case — see § Resolved Decisions → "Full → Lite downgrade"
and § Graduation / Downgrade Paths. The Lite → Full upgrade path is covered in the same section. Whatever shape those
workflows ultimately take — dedicated `arc graduate` / `arc downgrade` commands, an interactive
migration wizard, or workflow-driven manual steps with CLI helpers — they will re-touch prompt
orchestration: the user needs to answer mode-specific questions (PM mode, team mode on upgrade;
file reconciliation on downgrade). Framing C's `shouldShowPrompt` helper and the
recipe-as-config-mapping refactor are reusable in that future work. Finding #9 does not solve
graduation/downgrade; it specifies the shape so graduation/downgrade can build on it.

#### Feedforward

- **Finding #10 (Lite `ARCd-config.yml` reduction mechanism)** — If #10 adopts the "extend render
  pipeline to match `.template.*` files" approach, recipe and render-pipeline become symmetric
  authorities: recipe drives install-time behavior (which files, which prompts, which gating),
  render pipeline drives per-file content substitution (which blocks, which tokens). Framing C's
  "narrow recipe authority" direction composes with #10's render-pipeline extension. If #10 adopts
  the two-file fallback instead, recipe authority stays narrower but the `install.type` mechanism
  from #8 already supports it.
- **Finding #16 (Full → Lite downgrade)** — Will need a CLI surface for file removal, manifest
  rewrite, and possibly re-prompting for values that were defaulted in Lite. The `shouldShowPrompt`
  helper and the partial-config-threaded prompt loop are reusable. Whatever `arc downgrade` (or
  equivalent) looks like, prompt orchestration for it lives on the same authority spine Finding #9
  establishes.
- **Graduation Paths (Lite → Full)** — Symmetric concern to #16. Needs to prompt the user for
  `pm_mode` and `team_mode` (which were gated out in Lite) and add the Full-only files. Same
  reusability story.
- **Future mode-axis prompts** — If a new mode axis emerges (e.g., a hypothetical `install.tier`
  for `minimal` / `standard` / `complete`), it lands as a new recipe prompt with `show_when` on
  its own gating condition. The seven-site tour is reduced to: update `init-recipe.json` (add
  entry), update `runInitPrompts()` (add clack call at correct position), update
  `INIT_PROMPT_IDS` constant. The drift test catches any of the three being missed.
- **`buildConfigMap` recipe iteration composes with Finding #8.** Finding #8 specified that
  `install.type` flows through `buildConfigMap` for condition evaluation. Framing C's
  `buildConfigMap` refactor makes that flow automatic: the new `install_type` prompt declares
  `config_key: "install.type"`, and the refactored function picks it up without a new hardcoded
  constant. Findings #8 and #9 compose cleanly at the `buildConfigMap` boundary.

#### Not yet established

- **Whether `install_type` needs a `computed_tokens` entry or a `token` field for display in
  templates.** Templates currently use `{{PROJECT_NAME}}` as the only prompt-derived token. If any
  template needs to reference the installation type for display (e.g., a welcome message noting
  "Lite installation"), an `INSTALL_TYPE` token would be added via `prompt.token = "INSTALL_TYPE"`.
  No current template uses such a token; decision deferred to template-content work.
- **Whether the `install.type` select offers richer option labels and hints** like PM mode does
  today. A UX-layer decision — e.g., `{ value: "lite", label: "ARC Lite", hint: "Execution
  discipline only" }` vs `{ value: "full", label: "Full ARC", hint: "Complete lifecycle" }`. Not a
  mechanism decision; detailed in the PRD implementation task.
- **Whether a `validateRecipe()` structural check for prompt ordering** (show_when references must
  come from earlier prompts) is worth adding eventually. Current decision: no, not worth the cost
  today. Revisit if a future prompt addition produces a silent-ordering-bug incident.

**ADR authoring:** Committed as a sibling inside **ADR 1 "Recipe as Authoritative Install-Time
Specification"** per the Tier 4 grouping decision (see § Resolved Decisions → "ADR grouping for
modes WU deliverables (Tier 4)"). Finding #9 joins Findings #8 and #10 under the umbrella;
authored at implementation time per the general sequencing discipline in
[Installation Type Recipe Mechanism](#installation-type-recipe-mechanism) § ADR authoring.

### Lite Config Template Mechanism

**How `ARCd-config.yml` ships a reduced surface in Lite without duplicating the file.** [Configuration
and Installation](#configuration-and-installation) establishes that Lite ships a reduced config
omitting `pm.layer` and `team.enabled`. [Installation Type Recipe Mechanism](#installation-type-recipe-mechanism)
specifies how `install.type` gates whole-file installation; this section specifies the mechanism for
gating **content within a single file** that is installed unconditionally — the
`ARCd-config.yml` template. The two mechanisms are siblings: recipe conditions gate which files land
on disk, template conditionals gate which lines inside a given file survive rendering.

#### The gap

The current recipe installs `system/ARCd-config.yml` unconditionally as a plain `.yml` file. It is
not a `.template.md` file, so the template-render `arc:if` mechanism does not apply to it today. Two
existing render passes touch it: `renderConfigOverrides()` rewrites specific key-value lines from
the install-time prompt answers (for example `pm.layer: arc-pm` if the user selected arc-pm
during `arc init`), but no other rendering occurs — the file skips `renderTokens()` and
`renderConditionals()` entirely.

Finding #8's mechanism (symmetric additive recipe conditions) resolves **which** files get
installed. It does not specify **how** a single installed file produces different content per
install type. Lite's reduced config needs within-file gating, not whole-file gating — the file
itself still lands on disk in both modes, but its contents differ.

#### Current state — factual landscape

Pre-resolution code-read pass (2026-04-10). This section foregrounds the reframe that dropped out
of the read: the render pipeline is already capable of what Approach 2 needs. The question is no
longer "can the render pipeline process a non-markdown template?" but "what composition order and
which call sites are affected?"

**Render pipeline is extension-agnostic today.** `needsRendering()` in `lib/classification.ts`
matches `/\.template\.[^/]+$/` — any `.template.*` file passes the gate, not just `.template.md`.
`toOutputPath()` strips `.template` before any extension, so `ARCd-config.template.yml` resolves to
`ARCd-config.yml` for free. **No render pipeline extension is required.** The "`.template.md`-only
gate" that prior analysis treated as the blocker for Approach 2 does not exist.

**`renderConditionals()` has zero markdown assumptions.** Reading `lib/template/render.ts`:
conditional processing splits on newlines, matches an HTML-comment directive regex
(`<!--\s*arc:if\s+...\s*-->`), maintains a stack for nested blocks, and collapses triple-blank runs
to double-blank at the end. Nothing in the implementation references markdown structure — no
heading detection, no list handling, no code-fence awareness. YAML content runs through it cleanly.
The blank-line collapse is YAML-safe because YAML's whitespace sensitivity is about **indentation**,
not inter-section blank-line count; `ARCd-config.yml` is flat top-level keys with `# --- Section ---`
comment headers separated by blanks, and collapsing `\n\n\n` → `\n\n` only tightens the appearance
of stripped-block boundaries.

**The existing arc-config special-case.** `commands/init.ts` (lines ~168–174) and the shared
`renderTemplate()` helper in `lib/manifest/apply.ts` (lines ~79–98) both branch on
`templateFile === ARC_CONFIG_TEMPLATE_PATH`. Today's branch runs `renderConfigOverrides(raw,
overrides)` and nothing else — `renderTokens()` and `renderConditionals()` are explicitly skipped.
The constant `ARC_CONFIG_TEMPLATE_PATH` in `lib/constants.ts:11` is currently `"system/ARCd-config.yml"`.

**Rendering passes that compose for Approach 2:**

1. `renderTokens(raw, tokens)` — substitutes `{{TOKEN}}` placeholders. `ARCd-config.yml` contains
   no such placeholders today (verified by grep — zero `{{...}}` matches in the package source
   file). Introducing this pass is a no-op against current content.
2. `renderConditionals(content, config)` — strips `<!-- arc:if KEY == VALUE --> ... <!-- arc:endif -->`
   blocks that don't match. `ARCd-config.yml` contains zero `<!-- ... -->` strings today (verified by
   grep). Introducing this pass is a no-op against current content **until** directives are added
   to the template source.
3. `renderConfigOverrides(content, overrides)` — the existing arc-config-specific pass that
   substitutes flat key-value lines from install-time prompts. Stays as-is.

**Manifest and pristine lifecycle for `ARCd-config.yml`.** The file is classified as
`Configurable` in `CONFIGURABLE_FILES` (`lib/classification.ts:74`). Manifest entries are keyed by
**output path**, not template path — `buildManifestFiles()` uses `outputPath` as the key. Renaming
the template source from `system/ARCd-config.yml` to `system/ARCd-config.template.yml` does not
change the manifest key (`system/ARCd-config.yml` remains the output key). No manifest schema bump,
no migration function, no legacy-manifest handling. Existing installs rebuild their pristine
baseline via the standard three-way merge in `applyChangePlan()` on next `arc update`, against the
newly-rendered content. This is the same Configurable-file lifecycle path that any Framework update
to `ARCd-config.yml` exercises today.

#### Candidate approaches

Four approaches were identified during the pre-PRD work (Finding #10). The four are the same
as those enumerated before the code-read pass; the read changes the cost calculus for
Approach 2, not the shape of the alternatives.

1. **Two separate files in the recipe** — move `ARCd-config.yml` out of the unconditional baseline,
   ship `arc-config.full.yml` under `install.type == full` and `arc-config.lite.yml` under
   `install.type == lite`. Uses Finding #8's mechanism unchanged.
2. **Rename to `ARCd-config.template.yml` and use `arc:if` directives** — single source template
   with inline `<!-- arc:if install.type == full -->` blocks around the Full-only sections.
   Processed through the existing render pipeline.
3. **CLI-generated config content** — `init.ts` writes `ARCd-config.yml` programmatically from the
   `install_config` struct. Splits config source of truth between a template and code.
4. **Template fragments + stitching** — decompose `ARCd-config.yml` into universal / Full-only /
   Lite-only fragment files, concatenate them at install time.

#### Rejections

**Approach 1 (two separate files) — rejected.** Duplicates universal config content (branch,
commit, merge, hooks, review, platform, user sections — the vast majority of the file) across two
files. Every future addition of a universal setting touches both files, and silent divergence
between the two is the same failure mode Approach 3 of Finding #8's evaluation was rejected for
(baseline duplication risk on every feature add). The case for Approach 1 was entirely "Approach 2
requires render pipeline extension, which is fraught." That premise is false — the render pipeline
is already extension-agnostic — so Approach 1 loses its only advantage over Approach 2.

**Approach 3 (CLI-generated content) — rejected.** Splits the config source of truth across a
template file and imperative code. Every future addition of a setting requires coordinating two
places: the template (for universal settings) and the code (for install-type-dependent sections).
Loses the "template is the single source" property that both adopters and the framework's own
update path rely on. The pristine-store three-way merge is built around a single rendered template
as the authoritative baseline; programmatic generation would either bypass that merge (losing
update-time customization preservation) or require reconstructing the same programmatic output
during update (doubling the code surface).

**Approach 4 (fragment + stitching) — rejected.** Over-engineered for the problem scale. The
gated content amounts to two contiguous blocks (`pm.layer` section, `team.enabled` section) in a ~165-
line file. Fragment decomposition adds a new file-composition layer, a new ordering rule (which
fragments go in which order), and a new failure mode (fragment order drift producing syntactically
valid but semantically wrong output). None of this complexity earns its weight when the alternative
(Approach 2) reuses existing render pipeline machinery unchanged.

#### Adopted: Approach 2 — single template with `arc:if`

**Rename `system/ARCd-config.yml` → `system/ARCd-config.template.yml`** in the package source.
Annotate the `pm.layer` and `team.enabled` sections with `<!-- arc:if install.type == full -->` /
`<!-- arc:endif -->` blocks. Update the arc-config rendering branch in `init.ts` and
`apply.ts` to compose the three passes instead of skipping two of them. Everything else
(classification, manifest lifecycle, update path) follows the existing Configurable-file rules
with no further changes.

**Composition order:** `renderConfigOverrides(renderConditionals(renderTokens(raw, tokens), config), overrides)`.
Tokens substitute first (no-op against current content but correctly ordered for future tokens),
conditionals strip Full-only blocks when `install.type == lite`, overrides rewrite the surviving
key-value lines. The composition order matters: overrides must apply after conditionals so that
keys inside a stripped block are never "overridden" into a file where the key no longer exists.

**Call-site restructuring shape.** The cleanest pattern is to fall through to the normal
`.template.*` branch in `renderTemplate()` and apply `renderConfigOverrides()` as a **post-pass**
rather than keeping the arc-config branch as an alternative that skips the normal pipeline:

```ts
let rendered = needsRendering(templateFile)
  ? renderConditionals(renderTokens(raw, tokens), config)
  : raw;
if (templateFile === ARC_CONFIG_TEMPLATE_PATH) {
  rendered = renderConfigOverrides(rendered, configKeyOverrides);
}
return rendered;
```

One conditional gets restructured, no new code paths, no new helpers. The same shape applies to
`commands/init.ts`'s inline rendering block (which mirrors `renderTemplate()` today).

**Constant update.** `ARC_CONFIG_TEMPLATE_PATH` in `lib/constants.ts:11` flips from
`"system/ARCd-config.yml"` to `"system/ARCd-config.template.yml"`. The `CONFIGURABLE_FILES` set in
`lib/classification.ts:74` flips its entry from `"system/ARCd-config.yml"` to
`"system/ARCd-config.template.yml"` to match.

#### Gated section enumeration

Walked the current `ARCd-config.yml` end-to-end. The install-type-gated content is tight:

| Section                                       | Lines   | Gating                 | Rationale                                                                          |
|-----------------------------------------------|---------|------------------------|------------------------------------------------------------------------------------|
| `# --- Branch Model ---` / `branch.*`         | 12–23   | Universal              | Branch model applies in both modes                                                 |
| `# --- Commit Discipline ---` / `commit.*`    | 25–50   | Universal              | Commit format and context footer apply regardless of install type                  |
| `# --- Merge Strategy ---` / `merge.strategy` | 52–59   | Universal              | Merge strategy is a git-integration concern, not a lifecycle concern               |
| `# --- Hooks ---` / `hooks.*`                 | 61–114  | Universal              | Hook infrastructure runs in both modes; Lite still commits and still validates     |
| `# --- Review ---` / `review.pre_merge`       | 116–124 | Universal              | Pre-merge review applies to both modes (method definition, not lifecycle coupling) |
| `# --- Platform ---` / `platform.type`        | 126–133 | Universal              | Platform is informational; applies regardless of mode                              |
| `# --- Project Management ---` / `pm.layer`   | 135–142 | `install.type == full` | Lite has no work unit stream; PM mode is meaningless                               |
| `# --- Team Mode ---` / `team.enabled`        | 144–154 | `install.type == full` | Lite is inherently solo per methodology; team mode is meaningless                  |
| `# --- User Directory ---` / `user.sync_push` | 156–164 | Universal              | Git-notes portability applies to Lite's `user/{identity}/` directory               |

**Two contiguous gated blocks.** `pm.layer` and `team.enabled`. The `arc:if` annotation wraps each
section header comment through the settings block, so the stripped output in Lite has no orphan
section header and no comment-block-without-setting.

**Edge case resolved:** `hooks.contributor_protected_paths` defaults to `active/|backlog/`. Lite
has `active/` but may not have `backlog/` depending on `pm.layer`. The regex default harmlessly
no-ops against absent paths, so the setting stays universal — no gating needed, no Lite-specific
override.

#### Composition with Finding #1 (template-prd.md)

Finding #1's [The Lite PRD](#the-lite-prd) § Template delivery mechanism left the single-file-with-
`arc:if`-vs-two-file-variant choice as an implementation-phase detail. Finding #10's adoption of
Approach 2 resolves that detail by force of consistency: the same render pipeline, the same
`.template.*` gate, and the same `arc:if` mechanism handle both files. **`template-prd.md` stays
in the unconditional baseline and carries both variants via `arc:if`** — matching
`ARCd-config.template.yml`'s approach. Shipping `template-prd.md` as a two-file variant would split
the "how template content is mode-gated" story across two mechanisms for no gain.

This closes Finding #1's open sub-decision without a separate migration pass. The § Template
delivery mechanism paragraph in this plan doc is updated to reflect the landed choice rather than
the pending one.

#### Stress-test trace-throughs

Each trace exercised the adopted mechanism against a realistic scenario. No trace surfaced an
unhandled case.

- **Fresh Lite install.** `arc init --install-type lite` answers the `install.type` prompt with
  `"lite"`, populates `buildConfigMap()` with `install.type → "lite"`, renders
  `ARCd-config.template.yml` through the three-pass composition. Tokens no-op, conditionals strip
  both gated blocks, overrides apply surviving key-value lines (nothing lands in the stripped
  blocks because those keys are not in the override map for Lite). Output is clean YAML with
  `pm.layer` and `team.enabled` absent.
- **Fresh Full install.** Same path with `install.type → "full"`. Conditionals include both gated
  blocks. Overrides apply to `pm.layer: arc-pm` and `team.enabled: false` (or user-selected values).
  Output is equivalent to today's Full install.
- **Adopter upgrading an existing Full install.** Pristine baseline for `system/ARCd-config.yml` in
  the existing manifest is the pre-rename rendered content (no `arc:if` directives — adopters
  never see them). New framework version ships `ARCd-config.template.yml` with directives in the
  template source. `applyChangePlan()` renders the new template against the adopter's stored
  `install_config` (install type defaults to `"full"` via legacy migration from Finding #8's
  manifest bump), producing rendered content that still includes both sections. Three-way merge
  against the adopter's current file: if they customized `pm.layer` or `team.enabled` values, those
  customizations survive via the merge's diff-preservation semantics. Clean path.
- **Reconfigure Full → Lite downgrade** (when that CLI surface exists — see Finding #16). Flipping
  `install_config.install_type` to `"lite"` and re-rendering produces an ARCd-config.yml with the
  gated sections stripped. The Configurable-file merge path routes the now-removed lines through
  the standard three-way merge. Whether the merge surfaces this as a conflict (user had customized
  the removed lines) or a clean strip depends on the adopter's edits, which is the correct
  behavior — Finding #16 handles downgrade semantics for orphaned settings, not this mechanism.
- **Pristine reconstruction during update** with no `install_type` change. Standard path —
  re-render from stored `install_config` produces the same content as the existing pristine, merge
  reports "unchanged," no work. Matches the existing `.template.md` lifecycle.
- **Adopter who manually edited `{{` or `<!-- arc:if` into their `ARCd-config.yml`.** Near-zero
  likelihood — no documented reason an adopter would type those sequences into a config file —
  but worth naming. The new rendering passes would process those sequences on next update.
  `renderTokens()` with an unknown token leaves it as-is (per its implementation), so stray `{{FOO}}`
  survives untouched. `renderConditionals()` with a stray `<!-- arc:if ... -->` line would strip
  it and surrounding content if the condition doesn't match the adopter's `install.type`. This is
  the only behavioral change on the update path; the mitigation is to document in the framework
  changelog that adding the rendering passes to `ARCd-config.yml` is a known incompatible change
  with manually-inserted directive-like content, which any plausible adopter edit would not
  contain.

#### Feedforward — composes with other findings

- **Finding #8 (Installation Type Recipe Mechanism).** Finding #10 sits on top of Finding #8's
  mechanism: `install.type` flows through `buildConfigMap()` into both recipe condition evaluation
  (Finding #8's job) and template conditional evaluation (Finding #10's job). The same config map,
  the same value, two consumers. The "recipe as authoritative install-time specification" umbrella
  from Finding #8's and Finding #9's ADR discussion extends cleanly to cover arc-config template
  rendering — no new umbrella concept.
- **Finding #9 (Prompt Orchestration and Recipe Authority).** Framing C's `install.type` prompt at
  position 1 of the recipe prompts array is what populates the config map key that Finding #10's
  `arc:if` directives test. The prompt defines the value; the template reads it. Decoupled, clean
  composition.
- **Finding #1 (The Lite PRD).** Resolves Finding #1's pending single-file-vs-variant decision by
  consistency (see § Composition with Finding #1 above).
- **Finding #16 (Full → Lite downgrade).** The downgrade CLI surface will re-render
  `ARCd-config.template.yml` with the flipped `install.type`, producing a stripped config. The
  existing three-way merge handles the "lines that existed in the Full install but not in the
  new Lite install" case via the Configurable-file merge path. Finding #16 does not need a
  special case for arc-config; the generic path works.
- **[Mode-Aware Config Template Mechanism](#mode-aware-config-template-mechanism)** (lower in this
  plan doc) describes the **conceptual** layer composition (Lite layer + Local layer, orthogonal
  axes, each contributing independent changes). Finding #10 specifies the **mechanical** delivery:
  all layer composition happens via flat `arc:if` directives testing each axis independently,
  with no code-level "layer" construct. The conceptual framing is for humans reasoning about which
  settings apply in which modes; the mechanism is flat per-axis gating.

#### Not yet established (verify during implementation)

These items don't gate the mechanism decision but will need confirmation during implementation task
generation or execution.

- **Editor ergonomics.** YAML editors will flag `<!-- arc:if ... -->` lines as invalid YAML
  (HTML comments are not a YAML construct). This is a paper cut affecting maintainers editing the
  template source, not adopters viewing their installed file (the directive lines are stripped by
  rendering). Mitigation options at implementation time: accept the paper cut (lean — affects a
  small number of template edits per release), or add a framework-level convention of wrapping
  directives in YAML line comments (e.g., `# <!-- arc:if install.type == full -->`) and updating
  the directive regex to tolerate a leading `#`. The second option is cheap but couples the
  directive parser to YAML conventions, slightly eroding the "one directive syntax across all
  template types" property.
- **Framework changelog entry** flagging the new rendering passes on `ARCd-config.yml` as an
  incompatible change for the (near-zero-likelihood) adopter who manually inserted directive-like
  sequences. Standard changelog hygiene, not gating.
- **Test coverage.** Unit tests exercising `renderTemplate()` against
  `ARCd-config.template.yml` for each install type, plus an integration test that `arc init
  --install-type lite` produces a config with the gated blocks absent. Specified during PRD task
  generation.
- **`ARCd-config.template.yml` vs `ARCd-config.yml.template`** naming. The former matches the
  existing `.template.<ext>` convention in `needsRendering()`. The latter reads more naturally in
  English but requires either extending the regex or renaming it from `.template.<ext>` to
  something that matches both. Not worth the cost — adopt `.template.yml` for consistency.

**ADR authoring:** Committed as a sibling inside **ADR 1 "Recipe as Authoritative Install-Time
Specification"** per the Tier 4 grouping decision (see § Resolved Decisions → "ADR grouping for
modes WU deliverables (Tier 4)"). Finding #10 joins Findings #8 and #9 under the umbrella as
the third mechanism sibling — whole-file installation, prompt orchestration, and within-file
content rendering — authored at implementation time per the general sequencing discipline in
[Installation Type Recipe Mechanism](#installation-type-recipe-mechanism) § ADR authoring.

### Solo-Dev Blind Spot Audit (Gating Pre-PRD) — **Complete**

**Status:** Complete as of 2026-04-09. Audit ran in three phases: initial scenario battery,
contributor-lifecycle stress test, and B-vs-C registry walk. All three produced permanent
reference documents; findings are absorbed into this plan doc as resolved decisions.

**Motivation** (for historical context): The framework has been developed under a solo-sequential
lens (one WU at a time, integrate fully before starting the next). The shift lifecycle emerged
from realizing Full ARC lacks a formal "paused awaiting external progress" state — a gap
invisible in solo-sequential flow but everyday reality in team and multi-stream work. If one such
gap existed, others likely did. The audit surfaced them before PRD lock-in.

**Outputs (permanent reference documents):**

- [`analysis-modes-solo-dev-blind-spot-audit.md`][solo-audit] — ~60 scenarios across 14 categories,
  findings A–J, and the initial Open Design Space enumeration (Options A/B/C). The audit's
  Clarifications That Frame This Audit section carries the six reframing decisions that narrowed
  the problem space.
- [`analysis-modes-contributor-lifecycle-stress-test.md`][contrib-stress-test] — contributor-role
  stress test that rediscovered `ADR-014`'s latent full-lifecycle capability, ruled out Option A,
  and formalized the mirror-structure principle as an amendment to `ADR-012`.
- B-vs-C registry walk (2026-04-09 session) — scenario-by-scenario walk against the remaining
  options, resolving to pure Option C with the session-init reframe. Findings are baked into
  this plan doc's [Shift Lifecycle](#shift-lifecycle) section and Resolved Decisions table
  rather than held as a separate document.

**Key resolutions absorbed into this plan doc:**

- **Registry shape:** Pure Option C (task list headers as single source of truth). See
  [State Lives in Task List Headers](#state-lives-in-task-list-headers-pure-option-c).
- **Finding B vocabulary split:** `Paused` (dev next mover) vs `Waiting-For {category}` (external
  next mover). See [Document Status Headers](#document-status-headers).
- **Finding C pause-pointer reconciliation:** No rename needed; formalizing the four existing
  pointer fields (`Interrupts:` / `Paused:` / `Paused To:` / `Spawned:`) is an independent doc
  sweep, not shift-blocking.
- **Contributor lifecycle gap closure:** G2, G3, G5, G7, G11, G13, G14 absorbed into Operating
  Modes WU scope (see stress test doc § Consolidated Gap Table).
- **Mirror-structure principle:** Formalized in `ADR-012` amendment, cross-referenced in
  contributor briefing, user/README, and plan-arc-modes § Mode Combinations.
- **Operating Modes WU scope updates:** Adds `/arc-status` skill and `mid-session-status.md`
  workflow to the deliverables; finishes `ADR-014`'s latent contributor full-lifecycle capability.

**Out-of-scope findings** (captured in the audit's § Out-of-Scope Findings for future WU
candidates): PRD revision mid-flight, incidental-to-feature promotion, WU merge/split, WU
abandonment, integration revert/restart, task-reopen-after-review state, cross-developer
ATOMIC-INBOX visibility, cadence/sprint overlay, global-freeze operation, PROJECT-STATUS/ROADMAP
auto-sync.

**Gating unblocked:** With the audit resolved, the Operating Modes WU is cleared to proceed to
PRD creation.

### Conditional Content Architecture

The upstream Methodology Maturation work unit produced `analysis-conditional-content-architecture.md` —
a complete inventory of all conditional mechanisms in ARC with scaling projections for Lite and local mode.

Key findings relevant to Lite mode design:

- **Current mechanisms scale.** The projected growth for Lite is 15-25 new conditionals across all
  mechanism types. No architectural change needed.
- **File exclusion absorbs the largest impact** — work unit lifecycle workflows simply aren't installed,
  avoiding dozens of potential in-prose conditionals.
- **Density thresholds** — the analysis recommended Lite-specific template _variants_ for session-init and
  process-task-loop at 5+ conditionals on the same axis, on the assumption that conditionals live at runtime
  in installed content. Findings #4 and #5 overturned this for both files by landing on install-time
  stripping via `arc:if` directives in `.template.md` files (Mechanism B) — the conditionals never reach
  the installed content, so the runtime cognitive-load premise doesn't apply. The variant-vs-conditional
  framing collapses into install-time-vs-runtime gating; template-time stripping is preferred whenever a
  file is read frequently at runtime. See [Lite Session Management](#lite-session-management) and
  [Lite Process-Task-Loop](#lite-process-task-loop) for the two applications.
- **Install-time resolution preferred** — where content can be decided at `arc init` time, use template
  blocks or recipe conditions rather than in-prose conditionals. Keeps rendered documents clean.

### Configuration Identity — Local Axis

How the Local/Tracked axis is expressed in ARC's configuration system. Parallel to § Configuration Identity
above, which covers the Lite/Full axis. The two axes share mechanism (manifest fields read by CLI, recipe
condition evaluation, template rendering) but cut on different concerns and resolve independently.

**Resolved 2026-04-13 (Audit A H1).** The Local/Tracked axis gets a new required manifest field
`install_config.backing_type`, parallel in shape and consumer treatment to `install_config.install_type`.
Decisions:

- **`backing_type` is a manifest field, not a runtime config setting.** Same rationale as `install_type`:
  it determines what config options even exist for a given install (whether `arc.role` is meaningful, which
  context footer pattern the hook enforces, whether backing store infrastructure is installed). Storage is
  at `install_config.backing_type` alongside `install_config.install_type`; the manifest schema version
  bumps once for both axes together rather than accumulating a second bump.
- **Legacy manifest migration.** Existing pre-`backing_type` manifests migrate with
  `backing_type: "tracked"` default. This is the back-compat case — all existing installs are tracked, so
  the default matches reality. Symmetric with `install_type`'s legacy migration (also `"full"` default):
  both fields default to the pre-axis case during migration.
- **Flattened config key: `backing.type`.** `buildConfigMap()` flattens `backing_type → backing.type`,
  parallel to `install_type → install.type`. The flattened key appears in the in-memory config map used
  for recipe condition evaluation and template rendering. No change to the flattening helper beyond adding
  the second field.

**Consumer read paths.** The `backing.type` value has one authoritative storage location (the manifest)
but consumers learn about it through different paths based on what they actually need — mirroring the
`install.type` treatment to keep the axes symmetric:

- **CLI (`init`, `update`, `reconfigure`)** reads the manifest directly. `buildConfigMap()` flattens
  `backing_type → backing.type` for in-memory recipe condition evaluation and template rendering.
- **Hooks (`pre-commit`, `commit-msg`)** do not read `backing.type` directly. Hook behavior branches on
  already-present `ARCd-config.yml` keys — specifically `commit.context_footer` and `commit.context_pattern`
  for the Local-mode descriptive-freeform footer. In Local mode, the rendered `ARCd-config.yml` sets
  `commit.context_footer: custom` with `commit.context_pattern: "^Context: .+$"` (or similar freeform
  pattern) at install time via the Local layer of the config template. Hooks stay mode-agnostic at runtime,
  reading these keys with the values the Local layer baked in. **This resolves Audit A finding M1 as a
  side effect of H1** — the mechanism for Local's context footer enforcement is the same
  downstream-key-set-at-install-time pattern that Lite uses for `pm.layer` / `team.enabled`, no new hook
  branches and no new enum values on `commit.context_footer`.
- **Consumer-read-paths claim preserved.** The existing [Configuration Identity](#configuration-identity)
  § Consumer read paths section states hooks do not read `install.type`; the same claim holds for
  `backing.type`. Hooks continue to branch only
  on already-resolved downstream keys (`commit.*`, `branch.*`, `team.enabled`, etc.), never on the axis fields
  directly. The Local layer's contribution is to set downstream keys to Local-appropriate values at install
  time, identical in shape to how the Lite layer contributes different `pm.layer` and `team.enabled` defaults.
- **Workflows and agents** do not read `backing.type` at runtime. The template render pass resolves
  backing-type-specific content at install time (inline `<!-- arc:if backing.type == local -->` blocks
  where content-level adaptation is needed, e.g., session-lifecycle portability sections). The agent never
  sees `arc:if` markers in installed content.
- **Recipe condition evaluation** happens in-memory at CLI time through `buildConfigMap()`. The existing
  condition grammar already supports `key == value` expressions and needs no extension to handle
  `backing.type == local` alongside `install.type == full`.

Manifest-only storage is sufficient for the same reasons it's sufficient for `install.type`: hooks,
workflows, and agents see effects via already-resolved config keys and pre-rendered file content, not via
a runtime `backing.type` read surface.

**Recipe bucket architecture.** Local-axis uses the same file-bucketing-plus-within-file-gating pattern as
install.type, extended to a second condition dimension. The recipe gains two buckets and the within-file
render pipeline gains a second condition term:

- **Unconditional bucket:** baseline files present in all installs.
- **`install.type == full` bucket:** Full-only files (existing).
- **`install.type == lite` bucket:** Lite-only files (existing).
- **`backing.type == local` bucket:** Local-only files. Probably very few in practice — the core Local
  insight is `.arc/` stays in the working tree, so most behavior is adaptation of existing files, not new
  file installation. Candidate files if any: `backing-store-recovery.md` workflow, Local-specific docs
  pages. Implementation-phase decision whether any actually land here or whether all Local-specific
  content is within-file.
- **`backing.type == tracked` bucket:** Tracked-only files. Probably empty in practice — Tracked is the
  existing baseline, so anything Tracked-specific is already in the unconditional bucket.

For files that exist in multiple axis combinations and need content-level variation, within-file
`<!-- arc:if backing.type == local -->` blocks handle the adaptation, same mechanism as the existing
install.type content gating. **No combinatorial pair-specific buckets** (`full && local`, `lite && local`,
etc.) are introduced. The recipe's condition evaluation stays on independent single-key expressions; any
cross-axis conditional logic is handled at the within-file render step instead, which already supports the
same `key == value` expressions and composes naturally when multiple `arc:if` blocks nest or sequence in a
single file. **No recipe grammar extension needed.**

**Manifest schema extension.** `InstallConfig` adds `backing_type: string` as a second required field,
joining `install_type: string` added for the Lite/Full axis. The manifest schema version bumps once for
both fields (the modes WU lands a single schema bump covering both axes, not two sequential bumps). Pristine
reconstruction during `arc update` feeds `backing_type` through the same path as `install_type` per
[Installation Type Recipe Mechanism](#installation-type-recipe-mechanism) § Current state (pristine
store dependency). Legacy manifest migration fills in `backing_type: "tracked"`
alongside `install_type: "full"`.

**CLI flags and init behavior.** Two axes, two flag pairs, one init flow:

- **Canonical flags:** `--install-type <lite|full>` (existing), `--backing-type <local|tracked>` (new).
- **Shorthand aliases:** `--lite` / `--full` (existing), `--local` / `--tracked` (new). Both pairs
  mutually exclusive within their axis.
- **Prompt position in recipe array:** `backing_type` enters at position 3 (after `install_type` at
  position 2, before `tools`). Install type comes first because it establishes the bigger structural
  decision (lifecycle or not); tracking is the overlay applied on top per
  [Init Flow Implications](#init-flow-implications).
- **Non-interactive default — `backing.type` defaults to `tracked`.** **Asymmetric with `install.type`,
  which errors without an explicit flag (OQ 9 resolution).** Justification: `install.type` has no
  back-compat default because Lite is newly introduced, and the failure mode to guard is
  mispredict-from-unclear-framing. `backing.type` has a clear back-compat default — Tracked is the existing
  behavior and the overwhelming majority case, and "no implicit default" would force every CI pipeline,
  automation script, and `arc init --yes` caller to add `--tracked` just to preserve existing behavior.
  The asymmetry is principled: presentation neutrality in interactive mode, back-compat safety in
  non-interactive mode. `arc init --yes` without `--backing-type` → `tracked`; `arc init --yes --local`
  → `local`.
- **Interactive prompt shape.** The tracking prompt follows the same OQ 9 equal-peers shape as the
  install-type prompt — both modes listed as peers, no pre-selection, concise primer (~5-10 lines) with
  work-shape discriminator hints (I control the repo and `.arc/` belongs in it → Tracked; work project
  with strict tooling policies / OSS contribution / trying ARC on a repo I don't own → Local). Exact copy
  is implementation-phase work.
- **Forbidden combination enforcement at init time:** `arc init --local --role=contributor` refused with
  explanatory error; `arc init --local` with `team.enabled: true` prevented via the `team.enabled` render-time
  forcing described below. Full enumeration at [Forbidden Combinations](#forbidden-combinations).

**Gated prompts.** The `backing.type` value interacts with other prompts:

- **`shared-gitignore` prompt:** New prompt with `show_when: backing.type == local`. Asks whether to use
  the tracked `.gitignore` line (opt-in, `--shared-gitignore` flag) versus the default `.git/info/exclude`
  path. Skipped entirely in tracked mode. Mechanism is the existing single-key `show_when` condition from
  [Prompt Orchestration and Recipe Authority](#prompt-orchestration-and-recipe-authority); no grammar
  extension.
- **`team.enabled` prompt:** Currently gated on `install.type == full`. Local mode also forces
  `team.enabled: false` per § Forbidden Combinations. **Decision: keep the single-gate `show_when:
  install.type == full` on the prompt, and force `team.enabled: false` at render time via the Local layer of
  the config template regardless of the prompt answer.** The alternative — extending the condition grammar
  to support `install.type == full AND backing.type == tracked` — is rejected as premature complexity.
  The render-time forcing approach preserves grammar simplicity and composes cleanly with the existing Lite
  layer's forcing behavior. If other prompts surface the AND-gating need later, revisit.
- **`arc.role` is not an init prompt.** Role is set via `arc join` (personal workspace setup) using
  `git config arc.role`, not in `arc init`. In Local mode, role is structurally absent per
  [Role Is a Tracked Concept](#role-is-a-tracked-concept) — `arc join` in a Local install skips the role
  step entirely. No recipe-level gating needed since the prompt doesn't exist at init.

**Reconfigure boundary.** `arc init --reconfigure` does NOT mutate `backing.type`, same rule as
`install.type` (see [Prompt Orchestration and Recipe Authority](#prompt-orchestration-and-recipe-authority)
§ Reconfigure boundary). Tracked↔Local transitions are lateral shifts, not settings tweaks. Two directions:

- **Local → Tracked** transition is specified at [Upgrade Path (Local → Tracked)](#upgrade-path-local--tracked)
  as a manual
  4-step git operation (remove exclusion, `git add .arc/`, switch context footer format, commit). No CLI
  mode-switch command ships for this direction in the modes WU.
- **Tracked → Local** transition is not specified as a CLI surface. The use case (existing tracked project
  adopting Local) is rare, and the operation is destructive (removing `.arc/` from tracked history is
  non-trivial). Users who need this do it manually with standard git tools; ARC does not claim support.

**Future `arc mode switch --backing <target>`.** Not shipped in the modes WU. The `arc mode switch`
command namespace (established for Lite↔Full transitions at
[Graduation / Downgrade Paths](#graduation--downgrade-paths)) is extensible to a second axis but the
Tracked↔Local shift command is deferred as unscheduled future work. The namespace is reserved so that if
a switch command lands later, it fits cleanly.

**`buildTokenMap` token.** Adds `BACKING_TYPE` token (value: `tracked` or `local`) for template rendering.
Parallel to the `INSTALL_TYPE` token added for the Lite/Full axis. Used by within-file
`<!-- arc:if backing.type == local -->` blocks at render time. Mechanism-level detail.

**Drift mitigation.** Unit tests compare recipe prompt IDs to exported `INIT_PROMPT_IDS` /
`RECONFIGURE_PROMPT_IDS` constants, same pattern as the install.type drift mitigation established in
[Prompt Orchestration and Recipe Authority](#prompt-orchestration-and-recipe-authority) § Drift mitigation.
The test set expands by two prompt IDs (`backing_type`, `shared_gitignore`); no new test infrastructure.
The
`RECONFIGURE_PROMPT_IDS` constant excludes both `backing_type` and `shared_gitignore` since reconfigure
does not mutate `backing.type` or its downstream gated prompts.

**Open sub-questions (none blocking H1):** None. The H1 resolution is complete as specified above.
Mechanism details (exact regex for the Local-mode context footer pattern, exact primer copy, which files
if any land in the `backing.type == local` recipe bucket) are implementation-phase work, not pre-PRD gaps.

---

## Shared Infrastructure

**In-scope for modes WU.** Covers the mode-specific config surface and orthogonal-axis enforcement.
The mechanical `pm.mode: arc-in-git` → `pm.layer: arc-pm` rename and its associated doc sweep have
been extracted into the ARCd Rebrand work unit — they compose naturally with the
rebrand's own config file rename (`arc-config.yml` → `ARCd-config.yml`) and content sweep, and
modes WU depends on landing the renamed foundation first. This section covers what remains in
modes WU.

### Mode-Aware Config Template Mechanism

**Delivery mechanism:** [Lite Config Template Mechanism](#lite-config-template-mechanism) in the
Design Decisions section above specifies the install-time delivery mechanism — a single
`ARCd-config.template.yml` file processed through the existing render pipeline, with `<!-- arc:if
... -->` directives gating mode-specific sections. This section describes the **conceptual** layer
composition (what each axis contributes); the mechanism is flat per-axis `arc:if` directives
testing each axis independently, not a code-level "layer" construct.

Each mode axis (Lite/Full, Tracked/Local) contributes its own deletions and overrides to the
`ARCd-config.yml` template. The two axes compose orthogonally: each layer applies independently,
and when combined, both layers' changes are applied.

**Lite layer (contributes when install type is Lite):**

- Omits `pm.layer: arc-pm` option (Lite has no work unit stream for the planning module)
- Forces `team.enabled: false` (Lite is solo-bounded methodology)
- Does not touch `arc.role` (neutral on the tracked/local axis)
- Omits lifecycle-related settings if any exist

**Local layer (contributes when install type is Local):**

- Omits `arc.role` (role is a Tracked concept — see below)
- Forces `team.enabled: false` (Local is solo-ARC by definition)
- Redirects `user.sync_push` semantics (controls backing store push behavior instead of git notes push)
- Customizes `commit.context_footer` to enforce descriptive freeform pattern (see below)
- Does not touch lifecycle settings (neutral on the lite/full axis)

**Combining layers:** When a developer picks Lite+local, both layers apply. Each layer's concerns
are independent, so the combination is just the union of their changes. No special-case logic for
the combination itself — the mode-template machinery supports N mode axes without needing to
enumerate every combination.

### Role Is a Tracked Concept

The role values (`maintainer` / `contributor` from ADR-014) exist to differentiate ARC artifact
ownership from code contribution on projects where `.arc/` is visible in the tracked repo. Whenever
ARC is tracked, teammates or external contributors can see the planning artifacts, and the
maintainer/contributor distinction has meaning — the maintainer owns them, contributors avoid
touching them and use a different commit footer.

**Role applies in:**

- **Full+tracked** — original case. Maintainer owns backlog, PRDs, task lists; contributors submit
  code without touching ARC planning artifacts.
- **Lite+tracked** — OSS solo-developed scenario. The solo maintainer owns the Lite PRD and
  single task list; external contributors submit patches without touching them. Every
  contributor-role concern applies unchanged: reduced session-init document set, `contribution`
  commit footer, contributor-protected-paths warning for `active/`.

**Role is dropped in:**

- **Full+local** — ARC isn't visible in the tracked repo, so there's no visible artifact ownership
  to differentiate around.
- **Lite+local** — same reason.

**The rule:** role is meaningful when `.arc/` is tracked in the repo, regardless of Lite vs Full.
When tracked, others can see ARC content, so the maintainer/contributor distinction matters. When
untracked (Local mode), nobody else sees ARC at all, and the distinction is moot.

**Implementation:** The Local layer of the config template omits `arc.role`. The Lite layer does
not touch it — Lite keeps role intact when the install is tracked. In Local mode, session-init
skips role resolution and workflows that branch on role default to the non-contributor path.

### Context Footer Format (Local Mode)

Local mode enforces a descriptive freeform footer via the commit-msg hook, with pattern distinct
from tracked mode's task-reference format. This preserves the discipline (every commit explains
its context) in a form that leaves zero ARC fingerprint in the commit history visible to teammates.

Examples of valid Local mode footers:

- `Context: auth middleware refactor`
- `Context: token validation cleanup`
- `Context: investigating CORS handling`

The hook runs locally in the developer's clone, so ARC can enforce this format without teammates
seeing any ARC-specific content. The form is not configurable by the user within Local mode — it's
a mode-level enforcement.

### Durability-Layer Commands

**Resolved 2026-04-13 (Audit A H2).** Local mode does not redirect `arc user save/load/push/pull`
or `arc sync` — and there is no "transparent redirect" layer at all. Local installs install a
separate, purpose-built command family, `arcd backing *`, for durability-layer operations against
the backing store. The two command families coexist across install modes; each install mode
installs one. Commands are not aliased, cross-mapped, or silently redirected.

**Why not transparent redirect.** The tracked-mode `arc user *` family and the Local-mode
durability concern solve different problems:

- `arc user *` is a transport layer for a gitignored subtree (`user/{identity}/`) anchored on
  HEAD via git notes. It exists because tracked mode has a private personal layer that does not
  travel with `git push`.
- The backing store is a whole-`.arc/` shadow-copy durability substrate keyed on project ID,
  with no HEAD anchoring. It exists because Local mode has no durability at all without it —
  `.arc/` is untracked and one `rm -rf` from gone.

Different scopes, different anchors, different failure modes, different audiences. The only
thing the two share is the firing point (session handoff), and that commonality belongs one
level up — at the workflow layer, not at the CLI verb layer. Forcing one vocabulary to mean
both obscures the boundary and produced the unspecifiable 5-command mapping that surfaced H2
in the first place.

**Tracked-mode surface (unchanged in install boundary, updated in semantics).** Installed under
`backing.type == tracked`:

- `arc user save` — serialize `user/{identity}/` to `refs/notes/arc/user/{identity}` on HEAD
- `arc user load` — restore `user/{identity}/` from the note (walks reachable ancestors if
  needed; `--max-walk` bounds the search)
- `arc user fetch` / `arc user push` — transport the notes ref to/from the configured remote
- `arc user pull` — fetch remote notes, then load them into the local user directory
- `arc sync` — direction-aware porcelain (`save + push` when local state is ahead, `fetch + pull`
  when remote state is ahead), gated by `user.sync_push`

**Local-mode surface (new).** Installed under `backing.type == local`, in the `arcd` namespace
introduced by the ARCd Rebrand WU:

- `arcd backing sync` — stage `.arc/` into `~/.arc-state/{project-id}/`, commit with an
  auto-generated message tying the snapshot to the source commit hash (or timestamp in
  zero-commit repos), push per `user.sync_push`. This is what session-handoff's persist step
  invokes automatically; also available for manual invocation when the user wants to force a
  sync outside handoff.
- `arcd backing restore` — replay backing store HEAD contents into `.arc/`. Manual recovery
  path after data loss (e.g., `rm -rf .arc/`) or after pulling a newer snapshot from a shared
  remote. **Divergence guard**: refuses to run when `.arc/` has changes not yet captured by
  `arcd backing sync`, without `--force`. Prevents silent overwrite of unsynced local work.
- `arcd backing push` / `arcd backing pull` — transport the backing store git repo to/from its
  configured remote. `pull` is ref-only (non-destructive fetch into remote-tracking refs);
  `restore` is the separate replay step, kept distinct so fetching and overwriting are two
  deliberate actions.
- `arcd backing status` — **canonical source of backing store degraded-state information.**
  Reports existence and git-repo validity of the backing store directory, HEAD resolution and a
  cheap integrity check (`git fsck --connectivity-only` or equivalent), last sync time,
  dirty/clean state relative to `.arc/`, staleness (sessions since last successful sync), sync
  class if the last sync was a failure (see § Backing Store § Failure handling), and remote
  configuration. Reports one of `healthy`, `degraded`, `missing`, or `corrupt` as a summary
  verdict. Includes a permission sanity check on Linux/macOS (warns if directory mode is more
  permissive than 700 — see § Backing Store § Privacy model). Load-bearing for session-init
  Local-axis pre-check — see § Session-init Local-axis pre-check below. Full spec deferred to
  implementation; the enumerated surfaces above are the minimum required contract. Resolves
  Audit A sub-finding H3-N2 (health and corruption surface).
- `arcd backing sync --rebuild` — re-initializes the backing store from current `.arc/`
  content when the store is destroyed, corrupted, or missing but source is intact. Creates a
  fresh store at the project ID key with current `.arc/` as its first commit, printing a loud
  warning that prior backing store history is lost. Command shape (flag vs. dedicated
  subcommand) is implementation-phase work; the operation itself is required. Asymmetric
  recovery rule: `.arc/` intact + store broken → rebuild from `.arc/`; store intact + `.arc/`
  broken → `arcd backing restore`; both broken → remote only, else data loss. Resolves Audit A
  sub-finding H3-N2 (rebuild path).

**What is not installed in Local mode.** `arc user save/load/fetch/push/pull` and `arc sync` are
not installed at all in Local mode. Typing one errors with "this command is not available in
Local mode; see `arcd backing --help`." No aliasing, no silent redirect. The asymmetry is named,
not hidden.

**The unifier lives at the workflow layer.** Session-handoff's persist step branches on
`backing.type` and invokes the mode-appropriate family. The workflow reads one way in both
modes ("persist session state to the durability layer"); the CLI verbs underneath are honest
about what they actually do. This reshapes `session-handoff.md` § Save to Git Notes — the
section is renamed § Save to Durability Layer and gains an `arc:if backing.type == tracked` /
`arc:if backing.type == local` block pair for the two command families. The package-source
template at `session-handoff.template.md` picks up the same gate. (This updates Consolidated
Deliverables Inventory item #24: the handoff template now _does_ need block-level mode gates,
contrary to the earlier pre-H2 claim.)

**Config key consumers.** `user.sync_push` keeps its three-value semantics
(`always` / `prompt` / `manual`) in both modes. In tracked mode, `arc sync` / `arc user save` /
`arc user push` read it. In Local mode, `arcd backing sync` / `arcd backing push` read it. The
key is mode-agnostic; only its consumers change per install mode.

**Cross-machine conflict story.** When two machines push divergent backing store snapshots to
a shared remote:

1. `arcd backing push` with non-fast-forward remote → errors, prompts the user to
   `arcd backing pull` first.
2. `arcd backing pull` fetches the remote into remote-tracking refs (non-destructive — no
   working-tree files change yet).
3. `arcd backing sync` in a divergent state (local HEAD does not descend from remote HEAD) →
   refuses, surfaces the divergence, and directs the user at the power-user manual resolution
   path below.

**Divergence resolution is power-user manual, deliberately.** File-level three-way merge of
WORK-STATUS.md, task lists, or SESSION-NOTES is not attempted — the contents are not typically
mergeable without human review. The backing store remains a standard git repo, so conflict
resolution uses standard git tooling directly, operating on `~/.arc-state/{project-id}/`:

- **Prefer the remote version:** `cd ~/.arc-state/{project-id}/` and
  `git reset --hard origin/{branch}` (replace `{branch}` with the appropriate remote-tracking
  ref). Then run `arcd backing restore` to replay the remote version into `.arc/`, overwriting
  local state.
- **Prefer the local version:** `cd ~/.arc-state/{project-id}/` and `git push --force`. Use
  with care — overwrites the remote version for other machines on the next
  `arcd backing pull`.
- **Manual merge:** `cd ~/.arc-state/{project-id}/`, resolve conflicts using standard git
  tooling (merge commits, cherry-pick, reflog recovery, whatever the situation calls for),
  then `arcd backing restore` to replay the resolved content into `.arc/`.

The CLI surface deliberately does not expose a dedicated divergence-resolution verb. The
backing store's git-repo nature makes standard git tooling directly applicable, and building
ARC-specific resolution commands would duplicate git's semantics without adding value — the
user who hits cross-machine divergence is by definition a multi-machine user comfortable with
standard git workflows, and a dedicated verb would cover strictly fewer cases than `git` does
in the same directory. Users who hit divergence frequently should consider whether their
multi-machine workflow would benefit from more frequent `arcd backing push` invocations (via
`user.sync_push: always`) to reduce the divergence window. Resolves Audit A tightening H3-N3.

**Graduation banner.** `arc mode switch --to tracked` prints a one-time message at the end of
the switch: "The `arcd backing *` commands go away with your backing store. `arc user *` and
`arc sync` become available — these operate on `user/{identity}/` via git notes." One-time
cost at graduation; no lookup burden during normal use.

**Coordination with ARCd Rebrand WU.** The `arcd` namespace (and the `arcd backing *` commands
specifically) lands in the rebrand WU's CLI-surface work. The Modes WU commits to the
namespace decision and to the verb set that session-handoff, recovery, and orientation
require (`sync`, `restore`, `push`, `pull`, `status`, and a rebuild path whose exact shape —
`sync --rebuild` flag vs. dedicated subcommand — is implementation-phase work). Full spec
(help text, exit codes, flag surfaces, error message copy) is implementation-phase work
coordinated with the rebrand WU.

**Session-init Local-axis pre-check.** Session-init's counterpart to
`session-handoff.template.md`'s mode-gated persist step (Consolidated Deliverables Inventory
item #24). Where handoff writes to the durability layer, init reads from it — both branch on
`backing.type` and invoke the mode-appropriate surface.

The pre-check runs before standard document loading in `session-init.md`, gated on
`arc:if backing.type == local`:

1. **Check `.arc/` presence.** If absent or empty, halt with "Local-mode install detected but
   `.arc/` is missing. Run `arc init --local` to restore from backing store before resuming."
   Exits cleanly without attempting to load any ARC document set — the docs do not exist yet.
   Pairs with the idempotent `arc init --local` recovery command path specified in § Re-Clone
   UX § Recovery command.
2. **Query `arcd backing status`.** Captures the backing store's current state (`healthy`,
   `degraded`, `missing`, `corrupt`) plus staleness (sessions since last successful sync).
   Non-fatal: a degraded status does not halt session-init.
3. **Surface degraded state in the orientation summary.** If status is anything other than
   `healthy` with zero staleness, the orientation includes a line naming the condition and the
   recommended recovery command. Examples:
    - "Backing store status: degraded — last sync failed (class C, non-FF push). Run
      `arcd backing pull` then resolve divergence before next handoff."
    - "Backing store status: stale by 3 sessions — run `arcd backing sync` to catch up."
    - "Backing store status: corrupt — run `arcd backing sync --rebuild` to re-initialize
      from current `.arc/` state."
4. **Continue with normal session-init** (document set loading, work state reporting, next
   action) unless step 1 halted.

The split between step 1 (halts) and step 3 (warns) is deliberate: missing `.arc/` means
session context cannot be loaded at all, so proceeding is impossible; degraded backing store
means session context exists but durability is compromised, which the user should know about
but should not block continued work. `arcd backing status` is the single query point — no
duplicate state markers in SESSION-NOTES or elsewhere.

Resolves Audit A sub-finding H3-N1 (session-init pre-check companion path) and consumes
tightening H3-N5's three-class failure model from § Backing Store § Failure handling as the
content this pre-check surfaces in step 3.

### Forbidden Combinations

- **Local + `team.enabled: true`** — forbidden. Local is solo-ARC by definition; team mode requires
  shared state that Local's exclusion mechanism prevents.
- **Local + `arc.role` set to any value** — forbidden. Role is a tracked concept; Local installs
  omit the setting entirely. CLI refuses `arc init --local --role=contributor` with an
  explanatory error.
- **Lite + `pm.layer: arc-pm`** — forbidden. Lite has no work unit stream for the planning
  module to manage.
- **Lite + `pm.layer: external`** — forbidden (resolved pre-PRD, OQ 10). External PM integration
  adds machinery that conflicts with Lite's "less ceremony" design philosophy. Developers who
  need external PM integration graduate to Full with `pm.layer: external` via
  `arc mode switch --to full` — graduation is the escape hatch, not config-space sprawl.
- **Lite** therefore forces `pm.layer: none` unconditionally. Both `arc-pm` and `external` are
  excluded at init time with explanatory errors.

The CLI refuses these combinations at `arc init` time with explanatory error messages pointing to
the correct path.

### Audit as Part of Modes Work

The mode-aware configurability audit is part of this work unit's scope. The content audit (see
[Content Audit](#content-audit) below) is expanded to include configurability architecture as a
domain — not just docs and workflows. The goal is a complete inventory of which settings apply in
which modes, which are forced, which are omitted, and which semantics shift per mode. This inventory
feeds the Lite and Local config templates and the CLI's init-time validation logic.

Note: the `pm.mode` rename's doc sweep is handled in the ARCd rebrand WU as part of its unified
content audit pass. The modes WU's configurability audit picks up where the rebrand leaves off —
classifying the (already-renamed) settings by mode applicability.

---
---

## Mode 1: ARC Lite (Primary Deliverable)

### Design Philosophy

**"Does less, just as reliably."**

ARC's strength is that you can trust it. The system has opinions, enforces them, and protects you from
common failure modes. Lite mode preserves this property — it does less than Full ARC, but everything it
does, it does with the same reliability and enforcement.

Lite is not "Full ARC with optional steps." Making features optional means the system has no opinions,
which means the system can't protect you. A toolkit that hopes you'll use it well is not ARC.

Lite is not for developers who want Full ARC's lifecycle management with less ceremony. If you need work
unit lifecycle (multiple concurrent work streams, formal verification, integration review, archival),
you need Full ARC. Lite doesn't try to serve that audience with a watered-down version.

**The target audience is projects you can hold in a single task list and Lite PRD.** When the project
outgrows that — and the system will tell you when it does — you graduate to Full.

### Core Boundary Hypothesis (Confirmed)

**The differentiator is work unit lifecycle presence/absence.**

Full ARC models projects as a stream of work units flowing through a lifecycle pipeline. Each work unit is
born (planning), activated, executed, verified, integrated, and archived. The project persists across many
work units.

ARC Lite models the project as a single bounded effort. There is no lifecycle pipeline — you plan scope,
create tasks, execute them, and ship. The project _is_ the work unit.

**Why this boundary, and not others:**

This decision was reached after exploring two alternatives that were ultimately rejected:

1. **"Required vs. available" model** — same capabilities as Full, but pipeline gates removed. Everything
   above a minimum floor is optional. Rejected because: making features optional means the system can't
   enforce quality. ARC's value comes from structural enforcement, not developer discipline. "Trust the
   dev, hope for the best" is not ARC. This model would serve a wider audience but guarantee nothing.

2. **"Simplified-but-complete workflow suite"** — Lite variants of every Full workflow (lite-activate,
   lite-integrate, lite-archive). Rejected because: every process needs its own Lite boundary definition,
   which is arbitrary and unmaintainable. You're defining "how much simpler?" for each workflow with no
   principled answer. The complexity shifts from the user to the framework maintainer.

The work unit lifecycle is the right structural cut because:

- It's a natural boundary — the conditional content architecture analysis confirms work unit
  lifecycle workflows can be excluded entirely via file exclusion, avoiding dozens of potential
  in-prose conditionals. Projected impact: 15-25 new conditionals across all mechanism types,
  4-8 template `arc:if` blocks, 1-2 recipe conditions. Current mechanisms scale without
  architectural change.
- It aligns with the value decomposition — execution discipline (scale-independent) vs. lifecycle
  ceremony (scale-dependent). Research confirms execution discipline drives quality independent of
  project size.
- It's clean — workflows are either installed or not. No parallel variants, no "simpler how?" questions.
- It matches the research boundary — ~2 weeks is where planning pipeline overhead begins to earn its
  keep. Below that, execution discipline alone is sufficient.

### Enforced Sequence

Lite has a defined, enforced sequence — not a pipeline with gates like Full, but a progression that the
system expects and the agent follows:

**Scope --> Tasks --> Execute --> Ship**

| Step        | Lite                                                                | Full ARC equivalent                                |
|-------------|---------------------------------------------------------------------|----------------------------------------------------|
| **Scope**   | Required Lite PRD — reduced template, same spec-directed discipline | Plan doc --> formal PRD (multi-section, detailed)  |
| **Tasks**   | Single task list generated from the Lite PRD                        | Task list generated from PRD, multi-phase common   |
| **Execute** | Same process-task-loop (identical)                                  | Same process-task-loop (identical)                 |
| **Ship**    | Success Criteria check --> Tier 3 gates --> aggregate diff review   | Verify --> Integrate --> Archive (3 formal phases) |

**Scope artifact:** ARC is spec-directed development — having zero planning artifacts means you're not
doing ARC. Lite requires a PRD before task creation, same as Full. The artifact is still called a PRD —
keeping the name preserves framework coherence, makes the concept recognizable across modes, and makes
graduation a content migration rather than a conceptual shift. What changes is the template (reduced
sections, softened guidance) and the workflow shape (mode-conditional edges on a shared spine); the
substance — intent, goals, non-goals, success criteria — is structurally the same. You can write a
Lite PRD in 5-10 minutes for a simple project, and the system won't let you skip it. See
[The Lite PRD](#the-lite-prd) below for the full template cuts, workflow shape, and sub-decisions.

**Ship step:** Lite's ship step reuses Full ARC's `Success Criteria` section convention directly (see
[`strategy-task-list-formatting.md`][task-list-formatting] § Success Criteria Section) — no new template
section, no new workflow concept. Three-step protocol:

1. **Success Criteria check.** All Success Criteria items in the task list must be marked `[x]` (met) or
   `[~]` (superseded, with annotation). Any remaining `[ ]` items represent genuine gaps requiring
   resolution before ship.
2. **Tier 3 quality gates.** Full lint, type check, test suite, build.
3. **Aggregate diff review.** Review the aggregate diff before push/merge.

Replaces Full ARC's three-phase ending (verification, integration, archival) with this lightweight but
structured checklist. Not ceremony, but not nothing either — the Success Criteria chain links the Lite
PRD's functional contract to the task list's operationalization to the ship gate, so "done" is
observable and recoverable rather than "whatever the developer thinks it is."

**Chain:** Lite PRD carries a Success Criteria section (the section survives all Lite template cuts —
see [The Lite PRD](#the-lite-prd) below) → Lite task list operationalizes those criteria in its
Success Criteria section (identical to Full convention) → ship step checks them. The same convention
crosses all three artifacts without mode-specific variants.

**Protocol location:** Dedicated `verify-work.md` workflow file, parallel-named to Full's
`verify-work-unit.md`. Lands at `system/workflows/arc/verify-work.md` under the `install.type == lite`
bucket in the recipe (see [Installation Type Recipe Mechanism](#installation-type-recipe-mechanism)).
The Lite task list's verification phase task points to `verify-work.md`; Full's points to
`verify-work-unit.md`. See [The Lite Task List](#the-lite-task-list) § Verification Phase for the
two-files-not-one rationale, naming parallelism, and activity-content differences.

**Detail-design decisions deferred to implementation** (not pre-PRD blocking):

- **Aggregate-diff review formalization.** Link to [`prepare-commits.md`][prepare-commits] for review
  conventions if it applies mode-neutrally, or carry inline minimum review guidance otherwise. Decide
  during implementation based on the state of `prepare-commits.md`'s mode assumptions.

### What Stays Identical

These layers are project-scale-independent and work the same in both modes:

- **Constitutional layer**: DEV-RULES.ARC, DEV-RULES.PROJECT, strategies
- **Methods**: Commit format, issue triage, test-first, quality gates, all overrides
- **Hooks**: Pre-commit, commit-msg validation, format enforcement
- **Session lifecycle concepts**: T1/T2 loading model, trust hierarchy, freshness check,
  git-notes portability, handoff ceremony structure. Shape differs in narrow surfaces (WORK-STATUS
  field set, discovery scope, contributor role branch) — see [Lite Session Management](#lite-session-management)
- **Process-task-loop core protocol**: One task at a time, Tier 1/2 quality gates, completion protocol,
  mandatory stops, test-first execution, issue triage, WORK-STATUS update at commit time. Shape differs in
  four narrow surfaces (branch/task-list coupling, verification phase pointer, Next Step section, Incidental
  Work Management) — see [Lite Process-Task-Loop](#lite-process-task-loop)
- **Task list format**: Same markdown structure, same formatting conventions
- **Agent briefings**: Same documents, same behavioral guidance

### What Changes

**Lite PRD (reduced template):** Lite's planning requirement is still a PRD — same artifact name as Full,
with a reduced template and an adapted `create-prd` workflow. The template drops three elements outright
(`Type:` header field, `Status/Related Work` header block, `Document History` section) and softens
guidance in a few others; the rest of the section set is unchanged. Eight of Full's ten PRD purposes
survive in Lite; the two that drop (work classification, dependency tracking) are structurally
unavailable in Lite's single-effort model. See [The Lite PRD](#the-lite-prd) for the full section-by-
section breakdown, workflow shape, and sub-decisions (META-PRD absence, plan-\* location, filename,
Non-Goals elevation, template delivery mechanism).

**Task list structure:** Single task list at `.arc/active/tasks.md` — same markdown format as Full, not a
simpler variant. Four surgical trims: header `Status:` value set (`Integrated` and `Paused` drop),
`PRD:` path (singular), verification-phase workflow pointer (`verify-work.md` instead of
`verify-work-unit.md`), and atomic companion filename (`atomic-tasks.md` paralleling `tasks.md`).
Phases required, minimum two (work + verification), multi-phase normal. See
[The Lite Task List](#the-lite-task-list) for the full spec, including the `strategy-task-list-formatting`
reclassification (applies-as-is → needs-variant) that this resolution triggers.

**File structure:**

```text
.arc/
  active/
    prd.md                # The Lite PRD (singular; see "The Lite PRD" below)
    tasks.md              # The task list (singular)
    WORK-STATUS.md        # Current task pointer
    plan-{name}.md        # Optional pre-PRD exploration doc (sibling, retires into PRD)
  reference/              # Constitutional docs, strategies
  system/                 # Agent config, workflows, settings
  user/{identity}/        # Session state (same as full ARC)
```

No `feature/`, `technical/`, `incidental/` subdirs. No backlog directory. No archive directory (completed
task lists can be deleted or kept in place — no archival ceremony).

**WORK-STATUS simplification:** Lite tracks five fields — `Branch`, `Next Task`, `Last Completed`,
`Blockers`, `Next Action`. Drops `Task List` (fixed at `.arc/active/tasks.md`, no path to track).
`Following Task List` drops from both Lite AND Full as a uniform simplification — the Yes/No flag
is redundant with the Next Task + Next Action pair. See
[Lite Session Management](#lite-session-management) for the full field-set rationale and the
cross-mode FTL removal.

**Branch model:** Full ARC's branch protection modes (full/partial) and category-based branching don't
apply. Simplified choice: work on main directly, or create a single branch per effort. No
strategy-work-organization dependency.

**Absent workflows:** Work unit lifecycle workflows are not installed — activate-work-unit,
archive-work-unit, integrate-work-unit, clean-work-unit, verify-arc-integrity. Planning pipeline
workflows (activate-planning-branch, integrate-planning-branch) are also absent. These are excluded
via recipe conditions, not conditionals.

**Session init/handoff:** Single-file-with-`arc:if` mechanism —
`session-init.template.md` and `session-handoff.template.md` carry both modes' content gated by
`install.type` directives, rendered at install time to clean `session-init.md` / `session-handoff.md`
files. Four gated surfaces in session-init (WORK-STATUS field enumeration, task list path
resolution, Step 5 work-unit-discovery subsection, contributor role + team-mode trust hierarchy);
session-handoff is mechanically identical across modes except for the field set. See
[Lite Session Management](#lite-session-management) for mechanism rationale and gated surface
enumeration.

### The Lite PRD

**Lite has a PRD, not a "scope brief."** Framework coherence is easier to preserve when the same
artifact name is used across modes — the concept is recognizable, graduation is a content migration
rather than a conceptual shift, and the PRD's methodological role (spec-directed development, scope
guardrail, success contract) is identical in both modes. Lite's PRD is simpler in template and in
workflow, but not in kind. "Mirror Full where possible but scaled back" is the operating principle:
preserves coherence, produces good UX, and keeps the concept recognizable across mode transitions.

#### Functional requirements — what survives, what drops

Ten purposes the Full PRD serves were enumerated and tested against Lite's single-bounded-effort
context. Eight survive; two drop.

**Survive in Lite:**

1. **Alignment check** — human and agent agree on what the work is before tasks are generated.
2. **Scope definition upstream of tasks** — the task list implements the PRD, not the other way around.
3. **Verification anchor** — Success Criteria give "done" an observable definition.
4. **Historical record** — future-you (or a collaborator) can read what the project was trying to do.
5. **Scope guardrail during execution** — detect drift via Non-Goals and Requirements.
6. **Collaboration handshake** — when another human enters the project, the PRD is the onboarding doc.
7. **Plan retirement trigger** — creating the PRD retires pre-PRD exploration docs.
8. **Open questions parking** — live questions tracked in-artifact rather than lost.

**Drop in Lite:**

- **Work classification.** Lite has no feature/technical/incidental category system — no category
  subdirectories, no planning branch taxonomy. The `Type:` field is meaningless.
- **Dependency tracking.** Lite has no work unit stream, so there are no upstream/downstream work
  units to reference. The `Status/Related Work` header block is vestigial.

The two dropped purposes directly justify two of the three template cuts below. The third cut
(Document History) drops for a separate reason — see SQ4.

#### Template cuts — section-by-section

Template source: [`template-prd.md`][template-prd].

**Cut outright in Lite:**

- **`Type:` header field** — no work classification in Lite.
- **`Status/Related Work` header block** — no dependency tracking in Lite.
- **`Document History` section** — no value at project level for Lite's bounded-effort context. PRD
  revision history is a multi-stakeholder concern; single-developer Lite projects track evolution
  via git log and don't benefit from in-document history.

**Retained with softened guidance:**

- **Introduction / Overview** — unchanged.
- **Goals** — unchanged. Still the "why" statement.
- **User Stories or Use Cases** — simplified. The Full template splits guidance into Feature and
  Technical user story flavors; Lite drops that split and offers one combined guidance block. Use
  whichever framing fits the project.
- **Functional Requirements** — prioritization softened. Full's "use MoSCoW or similar" becomes "use
  prioritization if it helps; Lite projects often have a flat list where everything is needed." At
  Lite scale, the cognitive overhead of explicit prioritization often isn't earned.
- **Non-Goals** — **elevated framing.** The template carries a one-line explicit note: "In Lite,
  this section is your scope guardrail — drift from Non-Goals is a signal to reconsider scope or
  graduate to Full." The `create-prd` workflow's discovery step spends deliberate time on Non-Goals
  elicitation. Non-Goals does more work in Lite than in Full (where the WU lifecycle absorbs some
  of the guardrail function via verification, integration review, and archival gates).
- **Technical Considerations** — unchanged; remains optional.
- **Design Considerations** — unchanged; remains optional.
- **Success Criteria** — **unchanged and critical.** This section is the anchor for the ship step
  (see [Enforced Sequence](#enforced-sequence) above). All of Lite's PRD survival purposes route
  through Success Criteria at some point. The ship step protocol — Success Criteria all `[x]` or
  `[~]`, then Tier 3 gates, then aggregate diff review — depends on this section surviving intact.
- **Open Questions** — unchanged.

#### Workflow shape

**Unified `create-prd` workflow with mode-conditional edges** — not a separate Lite variant. The
conditionals live in the installed workflow file and the agent resolves them at workflow-execution time
(runtime gating, Mechanism C). This differs from session-init (Finding #4) and process-task-loop
(Finding #5), which both use install-time stripping via `.template.md` rename plus `arc:if` blocks
(Mechanism B); the distinction is acceptable because `create-prd` is invoked once per PRD, whereas
session-init and process-task-loop are read every session or every task. Rationale: mode differences in
`create-prd` are small and localized to workflow edges, the mode-neutral content is the bulk, and
cross-mode consistency preserves collaborative-elicitation guidance as it evolves. Roughly 90% of
`create-prd` is mode-neutral; the conditional content is concentrated at workflow edges, which is the
pattern most amenable to a unified workflow with targeted conditionals.

**Mode-conditional edges** (apply in Lite only or Full only):

- **Pre-Step 0 branch context** — simplified or dropped in Lite. Lite has no branch protection modes
  and no category-based branching; "which branch am I on" is a trivial check rather than a
  structured pre-flight.
- **Pre-Step 0 META-PRD review** — dropped in Lite (no META-PRD installed; see SQ1 below).
- **Step 2 category classification** — dropped entirely in Lite. No feature/technical/incidental
  taxonomy to classify into.
- **Step 4 template reference + save location** — swaps template reference (or selects Lite variant
  via template `arc:if` directives) and uses the singular `.arc/active/prd.md` save location instead
  of Full's `.arc/backlog/{category}/prd-{name}.md`.

**Mode-neutral steps** (apply identically in Lite and Full):

- **Step 1** — existing `plan-*.md` lookup and PRD-readiness assessment.
- **Step 3** — discovery phase, using the discovery checklist from
  [`strategy-work-planning.md`][work-planning].
- **Step 5** — plan retirement, `notes-*` creation (if needed), and commit atomicity.
- **Stop-for-review conclusion** — the review cadence at the end of the workflow is identical across
  modes.

See [`1_create-prd.md`][create-prd] for the current workflow; mode-conditionals land at the edges
enumerated above.

#### Sub-decisions

**SQ1 — META-PRD in Lite: not installed by default; opt-in available.** Project vision in Lite is
captured in the Lite PRD itself. A separate Full META-PRD exists to coordinate multi-PRD efforts
and track long-running project vision across many work units; Lite has one PRD by construction, so
Full's multi-PRD coordination role has nothing to coordinate. Installing the Full META-PRD template
in Lite would violate the "does less, just as reliably" philosophy by adding an artifact that
serves no Lite-relevant purpose. The Full META-PRD template (`reference/META-PRD.template.md`) is
assigned to the `install.type == full` bucket in the recipe (see [Installation Type Recipe
Mechanism](#installation-type-recipe-mechanism)).

**Finding #12/R6 refinement (2026-04-13):** Lite gains an **opt-in** combined template
(`META-PRD.lite.template.md`) that covers both product direction and technical overview content
in a single Lite-scoped ~80-120 line document. The opt-in lightly reopens the "not installed in
Lite" commitment — default Lite install still has no META-PRD, but users who want an ARC-native
place for structured high-level project context can opt in during `01_setup-lite.md`'s Step 3
(agent-led, not CLI prompt). Motivation: solo developers who want a big-picture doc otherwise
create ad-hoc notes files outside ARC's scaffolding; offering an ARC-native opt-in surface that
graduation recognizes prevents that pattern without forcing the ceremony on users who don't want
it. See [Lite Initial Setup § Optional Lite META-PRD](#lite-initial-setup) for the full opt-in
mechanism, template shape, and graduation content migration.

**SQ2 — `plan-*` doc location in Lite: `.arc/active/plan-{name}.md`.** Sibling to `prd.md` and
`tasks.md` in the flat `active/` directory. Matches Lite's overall flat structure (no category
subdirectories, no backlog directory). Multiple `plan-*` docs are allowed — exploration threads can
coexist before a PRD consolidates them. Normal retirement: when the PRD is created, all contributing
plan docs retire via the existing `create-prd` Step 5 logic, mode-neutral.

**SQ3 — PRD filename in Lite: singular `prd.md`.** One PRD per Lite project. If the developer needs
multiple concurrent PRDs, that's a structural signal that the project has outgrown Lite — graduate
to Full, which supports multiple work units each with their own PRD. The filename itself acts as a
soft graduation trigger: the collision ("I need a second PRD") surfaces the mode-fit question
without the framework having to detect it via guardrail signals.

**SQ4 — Document History section: cut entirely in Lite.** Decided 2026-04-10. Single-developer
bounded projects track evolution via git log; in-document history duplicates git information and
ages poorly. Full projects retain Document History because multi-stakeholder coordination over long
time horizons benefits from in-artifact revision notes; Lite projects don't.

**SQ5 — Non-Goals framing: elevated to scope guardrail.** The template carries a one-line explicit
note (see template cuts above), and the `create-prd` workflow's discovery step (Step 3) spends
deliberate time on Non-Goals elicitation. This compensates for Lite's missing WU-lifecycle scope
guardrails (verification phase, integration review, archival gates), loading more scope discipline
onto the Non-Goals section than Full needs to.

#### Template delivery mechanism

Template-render `arc:if` directives are viable for delivering `template-prd.md` Lite variant content
within a single template file — the cuts are minimal and localized, fitting within ~3-5 conditional
blocks in one file. This is below the [conditional content
analysis][conditional-content-analysis]'s density threshold for warranting a separate variant file,
which confirms `arc:if` as a legitimate delivery tool (not theoretical) for this template.

**Decision (landed via Finding #10):** `template-prd.md` stays in the unconditional baseline and
carries both variants via `arc:if` directives. The two-file variant (`template-prd.lite.md` under
`install.type == lite`) was evaluated and rejected by force of consistency: [Lite Config Template
Mechanism](#lite-config-template-mechanism) adopts single-file-with-`arc:if` for
`ARCd-config.template.yml`, and shipping `template-prd.md` through a different mechanism would split
"how template content is mode-gated" across two mechanisms for no gain. The render pipeline
processes both files through the same `.template.*` matching gate, the same
`renderConditionals()` pass, and the same `install.type` config map value. One mechanism, two
templates.

#### Cascades into other Lite surfaces

The Lite PRD's functional contract feeds forward into several other Lite design decisions still in
flight:

- **Lite task list template** (resolved 2026-04-11 — see [The Lite Task List](#the-lite-task-list)):
  keeps a Success Criteria section. Chain confirmed — PRD Success Criteria → task list Success
  Criteria → ship step (see [Enforced Sequence](#enforced-sequence)). Phases required, atomic
  companion retained as `atomic-tasks.md`, verification phase points to `verify-work.md`.
- **Lite session management** (resolved 2026-04-11 — see [Lite Session Management](#lite-session-management)):
  session-init and session-handoff use single-file-with-`arc:if` gating via `.template.md`
  extension. WORK-STATUS tracks five fields (`Branch`, `Next Task`, `Last Completed`,
  `Blockers`, `Next Action`); `Following Task List` drops from both Lite and Full. Step 5
  discovery (when it fires) checks `prd.md` / `plan-*.md` in `.arc/active/` — no backlog scan,
  no category-path lookup, no PRD-file discovery. `strategy-session-operations` reclassified
  applies-as-is → needs-variant (two in-doc tables, mode-aware prose edits).
- **Strategy applicability mapping for Lite**: `strategy-work-planning.md` partially applies in
  Lite (the discovery checklist is used by Lite `create-prd` Step 3; the work-unit-lifecycle
  sections do not apply). See [Strategy Applicability Mapping](#strategy-applicability-mapping).
- **Initial-setup workflows**: resolved via Finding #12/R6 — purpose-built `01_setup-lite.md` for
  Lite; Full's existing two-file pipeline reassigned to the `install.type == full` bucket. See
  [Lite Initial Setup](#lite-initial-setup).

### The Lite Task List

**Lite has a task list with the same format as Full, not a simpler variant.** Framework coherence is
easier to preserve when the same artifact format carries across modes — the concept is recognizable,
graduation is a relocation rather than a content rewrite, and the format's methodological role (phased
task grouping, verification phase, Success Criteria anchor, atomic companion file) is identical in both
modes. Lite's task list is the same shape as Full's, with four surgical trims: `Status:` value set,
`PRD:` path, verification-phase workflow pointer, and atomic companion filename. "Same format where
possible, vary only where Full-only concepts force it" is the operating principle — preserves
coherence, keeps graduation trivial, and avoids splitting `strategy-task-list-formatting` into two
maintenance surfaces.

#### Functional requirements — what the task list carries

Same responsibilities as Full's task list (see [`strategy-task-list-formatting.md`][task-list-formatting]):
phase structure for task grouping, verification phase for the ship ritual, Success Criteria section as
the outcome anchor, atomic companion file for off-plan work. No Lite-specific functional additions or
removals — the trims are surgical, not structural.

#### Phase structure — phases required, minimum two

**Phases are required in Lite task lists**, same as Full. Minimum two phases: one or more work phases
(grouped by concern, however the developer organizes them) plus a final verification phase. Multi-phase
work is normal, not unusual — Lite users benefit from the same organizational grouping Full users do.

The "single-phase for trivial projects" simplification considered during evaluation was rejected for
format-identity reasons: if Lite task lists could be single-phase but Full task lists cannot,
graduation would require adding a phase retroactively, violating the "graduation is relocation, not
content rewrite" principle ([Graduation / Downgrade Paths](#graduation--downgrade-paths)). Users with
truly minimal work generate one work phase plus the verification phase and the structure essentially
disappears; the constraint costs nothing and preserves graduation.

#### Header field trims

**Retained unchanged:** `Created:`, `Branch(es):`, `Base Branch:`. Same semantics as Full.

**Retained with surgical adjustments:**

- **`PRD:`** — path value is `.arc/active/prd.md` (singular, per [SQ3](#sub-decisions) in § The Lite
  PRD) instead of Full's `.arc/active/{category}/prd-{name}.md`. Field itself unchanged.
- **`Status:`** — value set trims from `{Pending | In Progress | Complete | Integrated}` to
  `{Pending | In Progress | Complete}`. `Integrated` drops because Lite has no archive directory and
  no integration workflow. `Paused` and `Waiting-For {category}` (from the shift lifecycle) also
  don't fire in Lite because the shift lifecycle itself is Full-only (see [Shift Lifecycle](#shift-lifecycle)).

**Title:** Same `# Task List: [Name]` convention. The `[Name]` is whatever the developer calls the
bounded effort — Lite has no `{category}` prefix to encode.

#### Verification phase — `verify-work.md` workflow target

The Verification Phase convention from `strategy-task-list-formatting.md` § Verification Phase applies
in Lite with one pointer change: Lite's phase task points to a dedicated `verify-work.md` workflow
(Lite-only) rather than Full's `verify-work-unit.md`.

**Full (unchanged):**

```markdown
## **Phase N:** Verification

- [ ] **N.1 Complete verification** — load and follow `verify-work-unit.md`
```

**Lite:**

```markdown
## **Phase N:** Verification

- [ ] **N.1 Complete verification** — load and follow `verify-work.md`
```

**Why two files, not one unified workflow with inline mode gates (E3 over E2):**

The Full and Lite verification activities are similar but not identical — Full hands off to
`integrate-work-unit.md` for integration and archival as separate pipeline steps, while Lite absorbs
aggregate diff review into the verification workflow (no subsequent integrate phase). A unified
`verify-work.md` with inline `arc:if` gates would mix distinct workflow responsibilities in one file
and require readers to mentally filter out mode-irrelevant sections on every load. Two dedicated files
is cleaner: each workflow is a focused read for its mode, and the task list's verification phase task
points at the right target without any in-file mode conditional to evaluate at run time.

**Naming parallelism:** Full's workflow keeps the `-unit` suffix because it operates within the
work-unit lifecycle (handoff to `integrate-work-unit`, atomic task resolution, archival preparation).
Lite's workflow drops `-unit` because Lite has no work unit concept — "the work" in Lite is the
project's bounded effort. Both share the `verify-work-` prefix; the suffix differs where Full has
WU-lifecycle scaffolding to coordinate.

**File location:** `verify-work.md` lives at `system/workflows/arc/verify-work.md` (top-level
alongside `3_process-task-loop.md`), under the `install.type == lite` bucket in the recipe (see
[Installation Type Recipe Mechanism](#installation-type-recipe-mechanism)). Full's
`work-unit-lifecycle/verify-work-unit.md` stays where it is — the `work-unit-lifecycle/` directory is
Full-only per [What Changes](#what-changes).

**Activity content:** Lite's `verify-work.md` performs the three-step ship protocol from
[Enforced Sequence](#enforced-sequence) § Ship step — Success Criteria check → Tier 3 quality gates →
aggregate diff review. Full's `verify-work-unit.md` stays unchanged and continues to hand off to
`integrate-work-unit.md` afterward.

**Graduation:** Lite → Full flips the verification phase task pointer from `verify-work.md` →
`verify-work-unit.md`. Mechanical, deterministic, handled by the CLI during
`arc mode switch --to full` as part of the file relocation pass. Zero structural task-list change.

#### Atomic companion file — `atomic-tasks.md`

Lite retains the atomic companion file concept from `strategy-task-list-formatting.md` § Atomic
Companion File, with one naming adjustment: the file is named `atomic-tasks.md` (paralleling Lite's
`tasks.md`) instead of `atomic-{wu-name}.md` (paralleling Full's `tasks-{wu-name}.md`).

**Naming rule (mode-aware, in-place prose update to the strategy doc):**

- **Full:** `atomic-{wu-name}.md` where `{wu-name}` matches the task list's `tasks-{wu-name}.md`.
- **Lite:** `atomic-tasks.md` as the explicit companion to `tasks.md`. The word "tasks" fills the
  `{wu-name}` slot since Lite has no work unit identifier.

Both preserve the "atomic-prefixed name adjacent to the task list" bookending pattern in directory
listings. The rule is mode-neutral prose in the strategy doc — no `arc:if` gate needed for naming
itself, only for the "archival" and "all work unit types" sub-rules that depend on Full-only
concepts (see § Template delivery mechanism below).

**Archival:** Lite has no archive directory, so the Full archival rule ("archives alongside the task
list if it contains items, deleted if empty at integration time") doesn't apply. Lite's atomic
companion file is deleted or kept in place per developer preference, matching Lite's overall
no-archive model.

**Finding #5 interaction:** Finding #5's 2026-04-10 cut list included atomic companion files among
"wrong info references" to cut from the Lite process-task-loop variant, premised on atomic companion
being Full-only. With `atomic-tasks.md` retained in Lite, those references stay. Finding #5's final
resolution (2026-04-13) keeps the Atomic Task Completion protocol universal in
`3_process-task-loop.template.md` and gates four narrower surfaces on the `install.type` axis instead:
branch/task-list coupling, verification phase pointer, Next Step → `integrate-work-unit` section, and
the Incidental Work Management section (where the `ATOMIC-INBOX`-based "for later" bucket falls away
in Lite because `pm.layer: none` excludes `strategy-planning-module`). See
[Lite Process-Task-Loop](#lite-process-task-loop) for the full gated surface enumeration.

#### Success Criteria section

Unchanged from Full. Same format, same three-state marker system (`[x]` met, `[~]` superseded,
`[ ]` not met), same immutable-criterion rule, same "All quality gates pass" / "Ready for X"
standard items. This section is the anchor for Lite's ship step (see [Enforced Sequence](#enforced-sequence)
§ Ship step): Success Criteria all `[x]` or `[~]` is precondition step one of the three-step ship
protocol, evaluated inside `verify-work.md`.

#### Template delivery mechanism

`strategy-task-list-formatting.md` reclassifies applies-as-is → **needs-variant** per this
resolution. The strategy doc is renamed `strategy-task-list-formatting.template.md` and gated with
inline `<!-- arc:if install.type == full -->` blocks around four Full-coupled surfaces:

1. **Verification Phase example block pointer** — the example currently showing
   `verify-work-unit.md` needs mode-aware variants so the rendered strategy documents the correct
   pointer for each mode.
2. **Atomic Companion File § Archival sub-rule** — "archives alongside the task list if it contains
   items, deleted if empty at integration time" references archival as a workflow concept, which is
   Full-only.
3. **Atomic Companion File § "All work unit types"** — "feature, technical, and incidental task
   lists all get companion files" is meaningless in Lite (no work unit type taxonomy).
4. **Status Field Values § `Paused`** — documented as a rider on the shift lifecycle; since shift
   lifecycle is Full-only, the status value doesn't fire in Lite.
5. **Feature/Technical Task List Rules § `Integrated` status value** — rides on archival, Full-only.

The naming convention subsection (see § Atomic companion file above) uses mode-aware prose instead
of `arc:if` gates — cleaner for a two-case rule than a block gate.

Template rendering uses the same pipeline as `ARCd-config.template.yml` and `template-prd.md` (see
[Lite Config Template Mechanism](#lite-config-template-mechanism)) — no new code paths, reuses
`needsRendering()` and `renderConditionals()` as they exist.

**This is a Finding #6 classification correction.** Finding #6's migration (2026-04-11) classified
`strategy-task-list-formatting` as applies-as-is based on "core format is universal" reasoning,
without catching the Full-coupled example blocks and Status value riders enumerated above. This
resolution corrects the classification and is the intended mechanism moving forward. The earlier
row in § Strategy Applicability Mapping has been updated in place.

### Lite Session Management

**Lite has the same session lifecycle as Full, with surgical cuts to document loading, field
tracking, and discovery scope.** Framework coherence is preserved when the same session-init /
session-handoff operations carry across modes — the skill invocations (`/arc-resume`,
`/arc-handoff`), the load model (T1 constitutional + T2 state), the trust hierarchy, the
freshness check, the git-notes portability, and the handoff ceremony structure all run
identically. Lite's changes cluster into four narrow surfaces, naturally expressed via inline
`arc:if` gating within a single source template rather than duplicated into separate variant
files.

#### Functional requirements — what session management carries

Same responsibilities as Full: orient the agent at session start, capture state at session end,
preserve context across session boundaries, recover gracefully from interruption, and provide
portability across machines. No Lite-specific functional additions or removals — the cuts are
surgical, targeting fields and concepts that don't exist in Lite rather than operations that
don't apply.

#### Mechanism — single-file-with-`arc:if`

`session-init.md` and `session-handoff.md` rename to `session-init.template.md` and
`session-handoff.template.md` in the package source. Inline `<!-- arc:if install.type == full -->`
blocks gate Full-only content. The CLI renders at install time via the same pipeline as
`ARCd-config.template.yml` and `template-prd.md` (see
[Lite Config Template Mechanism](#lite-config-template-mechanism)); adopters see clean installed
files (`session-init.md` / `session-handoff.md`) with only their mode's content. No runtime
conditional evaluation, no filename suffixes, no semantic rename.

**Why single-file over two-file variant:** Session-init and session-handoff represent the same
operation scaled differently, not two distinct activities. There is no natural semantic rename
analogous to `verify-work.md` / `verify-work-unit.md`, where Lite's ship step and Full's
integration handoff are genuinely different activities with parallel names reflecting that
divergence. Source duplication across two files would run ~40-60% for content that behaves
identically; every framework-level edit to the universal parts (trust hierarchy, freshness
check, extension mechanism, identity resolution) would need to propagate to two files with
silent-divergence risk — the same failure mode that led Approach 1 to be rejected for
`ARCd-config.yml` (see [Resolved Decisions](#resolved-decisions) → "Approach 1 (two separate
arc-config files) rejected").

**Why single-file over runtime in-prose conditionals:** `arc:if` blocks are stripped at install
time, not evaluated at runtime. The agent reading `session-init.md` on a Lite install sees only
Lite content — no "skip if Lite" prose, no per-session gate evaluation cost. This differentiates
from `create-prd`'s unified-with-conditional-edges shape (see [Resolved Decisions](#resolved-decisions)
→ "Lite `create-prd` workflow shape"), where conditionals live in the installed workflow and the
agent resolves them at workflow-execution time. Session-init is read at every session boundary;
runtime gate evaluation would compound over every session lifetime. Template-time gating pays the
complexity in source once.

#### Gated surfaces in `session-init.template.md`

Four discrete regions require Full-only gating:

1. **Step 2 Item 8 (WORK-STATUS field enumeration).** Full's Item 8 enumerates `Task List`,
   `Following Task List`, `Next Task`, `Last Completed`, `Blockers`, `Next Action`. Lite drops
   `Task List` (path fixed at `.arc/active/tasks.md`); `Following Task List` drops from both
   modes uniformly (see field-set decision below). Gated region: the field enumeration paragraph
   and the "Task reference format" sub-paragraph describing task list path resolution via
   WORK-STATUS.

2. **Step 2 Item 10 (task list loading path resolution).** Full resolves the task list path
   from WORK-STATUS.md's `Task List` field; Lite uses the fixed path `.arc/active/tasks.md`.
   The triple-anchor lookup (line hint / task number / title fragment) still applies within the
   file in both modes. Gated region: the sentence describing path resolution from WORK-STATUS.

3. **Step 5 "Next work unit discovery" subsection.** Full's discovery checks ROADMAP.md, the
   backlog directory, and existing `plan-*` or PRD artifacts; none of these structures exist in
   Lite. Lite's equivalent is narrower: when state is unclear, check for existing `prd.md` or
   `plan-*.md` in `.arc/active/` and propose the appropriate next step (task generation from
   PRD, PRD creation from `plan-*`, or `plan-*` / PRD creation from scratch). Gate condition
   parallels Full's: discovery runs only when state is genuinely unclear (see discovery-gate
   decision below). Gated region: the full work-unit-discovery subsection in the Full path,
   replaced with the narrower Lite equivalent in the `install.type == lite` path.

4. **Contributor role branch and team-mode trust hierarchy example.** Lite is single-developer by
   construction (per [Role concept applicability](#resolved-decisions) — role is Tracked-only,
   and Lite inherits single-dev semantics regardless of tracking). The contributor session path
   and the team-mode Tier 1 trust hierarchy example both drop entirely in Lite. Gated regions:
   the `arc.role = contributor` detection branch and Contributor Session Path subsection, and
   the team-mode example in the trust hierarchy mismatch guidance.

Within `session-handoff.template.md`, the gated surfaces are narrower. The handoff operation
itself is mechanically identical across modes — only the WORK-STATUS field set differs, and the
`Following Task List` removal applies uniformly (not mode-gated). The handoff examples
(`Example 1: Off-task-list with known path back`, `Example 2: Preparatory work before starting
task`) are Full-scoped enough that they may require Lite-specific replacements or rewrites; the
concrete gating and example content is implementation-phase detail.

#### WORK-STATUS field set

**Lite field set (5 fields):**

- `Branch` — current branch name. Lightweight inclusion; Lite users may still branch per effort
  even without ARC's branch-protection model enforcing it. ARC does not police git usage in
  Lite — the field is informational.
- `Next Task` — triple-anchor format (`Task N.M — Title (line ~X)`) when a task list is active.
  `—` or omitted when all tasks complete or no task list exists.
- `Last Completed` — task reference or freeform description of recent work.
- `Blockers` — `[none]` or description.
- `Next Action` — freeform specific action; drives the "skip discovery" gate at session-init.

**Full field set (6 fields):** Same as Lite plus `Task List` (path to the active task list,
required because Full may have multiple task lists across work units in the pipeline).

**`Following Task List` field removal — carved out to the Work-Status Restructure WU
(R17).** This decision's resolution has moved out of plan-arc-modes; see
`prd-work-status-restructure.md` for the current source of truth. The
FTL Yes/No flag was found redundant with the Next Task + Next Action pair, and removal
applied symmetrically across both modes — the full reasoning, scope analysis, and
live-migration plan are carried by the restructure WU.

> **Forward-looking prohibition (carried from the carve-out).** The `Following Task List`
> field is removed as part of the Work-Status Restructure WU's R17 — the new status file
> template does NOT carry this field. Future edits to status file templates or field sets
> must not re-introduce it.

#### Discovery gate parity with Full

Full's session-init Step 5 work-unit-discovery block gates on "skip if WORK-STATUS.md shows an
active task list" — discovery only runs between work units. Lite's equivalent gates on the same
structural signal: discovery fires only when state is genuinely unclear. Concretely, Lite's gate
is "skip if WORK-STATUS.md Next Action is concrete AND `.arc/active/tasks.md` exists with
incomplete tasks." Sessions with a clear resume target (like an ongoing planning session with
Next Action `Continue Finding #4 — Lite session management`) skip discovery in both modes.

**Implication for the cascade at [The Lite PRD § Cascades](#cascades-into-other-lite-surfaces):**
The forward-pointer stating "Lite session-init document set includes `.arc/active/prd.md`,
`.arc/active/tasks.md`, and `.arc/active/status.md`. No backlog scan, no category-path
lookup, no PRD-file discovery" stays consistent with this resolution. The cascade describes the
discovery branch Lite runs _when_ discovery fires; most sessions never reach it because Next
Action is concrete and the gate short-circuits.

#### Session-handoff ceremony weight

**Lite session-handoff is mechanically identical to Full.** The pre-update verification (git
status / log / HEAD / task list check / working directory), the SESSION-NOTES.md content
structure (Completed Work, Remaining Work, Additional Context, Persistent Context), the
persistent-context criterion, the post-update markdown lint pass, the git notes save, the
conditional WORK-STATUS commit, and the confirm-handoff summary all apply in Lite exactly as
they apply in Full. The only delta is the WORK-STATUS field set — already handled by the
mode-gated field enumeration that carries through the field-set decision above.

No lighter ceremony, no trimmed handoff protocol. Lite users benefit from the same commit-level
granularity guidance for uncommitted work, the same persistent-context discipline, and the same
portability via git notes as Full users. The handoff operation is not where mode divergence
earns its keep; the complexity is in session-init's discovery and field-loading surfaces, not
in session end-of-life.

#### `strategy-session-operations` reclassification

**Reclassifies applies-as-is → needs-variant.** The strategy's core concepts (T1/T2/T3 loading
model, classification criteria, monitoring model, auto-compaction guidance, portability via git
notes) are universal. Two in-doc tables embed Full-only surface references that require
mode-aware edits:

1. **State-Conditional Promotion table** (§ Context Loading Model). The trigger for promoting
   process-task-loop from T3 to session-init is currently `Following Task List: Yes + Next
   Task populated`. With `Following Task List` removed from both modes uniformly, this row's
   trigger becomes `Next Task populated + task list file exists` — naturally universal after the
   FTL removal. No mode gating needed on this row once FTL removal lands; the row becomes
   mode-neutral by composition.
2. **Method Classification by Trigger table** (§ Method and Extension Loading). `pre-merge-review`
   and `review-triage` are listed with trigger workflow `integrate-work-unit` — a Full-only
   workflow. In Lite, the aggregate diff review happens inside `verify-work.md`'s ship step, not
   at integration (there is no integration workflow in Lite). This row needs a dual-value entry:
   Full points to `integrate-work-unit`, Lite points to `verify-work.md`.

**Mechanism:** Mode-aware prose edits within the single strategy file, **not** a `.template.md`
rename. The strategy is on-demand reference content — consulted when the agent reaches a
relevant workflow, not loaded per-session — so per-consultation clarity is acceptable and
templating scope doesn't need to expand to reference content. The method classification table
row uses dual-value formatting (e.g., `integrate-work-unit (Full) / verify-work.md ship step
(Lite)`). This is the minimal-invasive edit pattern, consistent with Finding #2's mode-aware
prose for the `strategy-task-list-formatting` atomic companion filename rule — not every
Full-coupled surface needs an `arc:if` gate.

**Strategy count correction.** Finding #2's migration updated Finding #6's count from
6 applies-as-is / 2 needs-variant / 2 excluded → 5 / 3 / 2. Finding #4's resolution updates
again to **4 applies-as-is / 4 needs-variant / 2 excluded**. The Finding #6 follow-on bullet
for Finding #4 (in § Strategy Applicability Mapping) updates in place to reflect the
reclassification.

**This is a Finding #6 classification correction, second instance.** Same pattern as
Finding #2's correction of `strategy-task-list-formatting`: classification-by-concept-not-by-content.
Finding #6 classified `strategy-session-operations` applies-as-is based on universal core
concepts, without auditing the in-doc tables for Full-only surface references. The drift-check
pass that Finding #2's resolution committed to as ongoing practice surfaced the issue during
Finding #4's code-read phase. The reclassification direction and mechanism mirror Finding #2's
corrections — mode-aware prose/dual-value rows where narrow, `arc:if` gating where block-scale.

#### Template delivery mechanism

`session-init.template.md` and `session-handoff.template.md` ship through the same render
pipeline as `ARCd-config.template.yml` and `template-prd.md`. `needsRendering()` picks them up
via the `.template.*` extension match; `renderConditionals()` strips `install.type == full`
blocks when rendering for Lite installs; `toOutputPath()` strips `.template` and the files land
as `session-init.md` / `session-handoff.md`. No new code paths, no constant additions — the
files are Framework classification, not Configurable, so no manifest pristine-store complexity
applies.

`strategy-session-operations.md` is **not** templatized — the two-table mode awareness is
handled via mode-aware prose and dual-value row entries, not `arc:if` gates. Templating scope
stays bounded to content that genuinely needs block-level gating; two-row table edits within a
~254-line strategy doc don't cross that threshold.

### Lite Process-Task-Loop

**Lite runs the same task processing loop as Full, with narrow cuts to branch coupling, verification phase
pointers, the Next Step integration link, and incidental work routing.** The loop's core — one task at a time,
Tier 1 / Tier 2 quality gates, completion protocol, pre-report checklists, mandatory stops, test-first
execution, issue triage, WORK-STATUS update at commit time — runs identically across modes. Lite's differences
cluster into four discrete surfaces, all of which reference Full-only concepts (work unit lifecycle, incidental
task list creation, `ATOMIC-INBOX` capture). Same single-file-with-`arc:if` mechanism as
[Lite Session Management](#lite-session-management), layered onto a file that is **already a template** in the
package source.

#### Functional requirements — what the task loop carries

Same responsibilities as Full: execute tasks one review increment at a time, enforce Tier 1 quality gates
before completion, escalate to Tier 2 at coherent-unit boundaries, run the completion protocol and pre-report
checklists, stop for user approval, capture incidental work encountered during tasks, and coordinate
commit-time updates to WORK-STATUS.md. Lite removes no responsibilities and adds none — the cuts target
specific references (integration workflow pointer, incidental task list creation decision tree,
`ATOMIC-INBOX` capture path) that don't exist in Lite's structure, not the operations themselves.

#### Mechanism — single-file-with-`arc:if`

Same pattern as Finding #4's session management resolution. `3_process-task-loop.template.md` already exists
in the package source at `packages/arc-framework/arc/system/workflows/arc/` — it carries pre-existing
`arc:if` gates on the `team.enabled` and `pm.layer` axes — so Finding #5's implementation layers an additional
axis (`install.type`) onto a file that is already on the template pipeline. No rename, no new render code,
no mechanism change. The existing gates on team/pm axes continue to function; `install.type` gates compose
orthogonally.

**Why single-file over two-file variant (the 2026-04-10 decision reversed):** The original argument for a
variant — "process-task-loop is a core agent operating doc referenced constantly during task execution;
noise in that document is expensive" — applied to [Mechanism C](#conditional-content-architecture) (runtime
in-prose conditionals preserved in installed content). Under Mechanism B (install-time stripping via
`renderConditionals()`), the adopter's installed `3_process-task-loop.md` contains zero `arc:if` markers
regardless of mode. The runtime cognitive-load concern does not apply. Two-file variants, on the other hand,
would duplicate ~85-90% of the 295-line file for ~30 lines of Full-specific content — every framework-level
edit to completion protocol, Tier 1/2 definitions, test-first execution, issue triage, pre-report checklists,
or WORK-STATUS update protocol would need mirroring across both files with silent-divergence risk. Same
rejection reasoning as Approach 1 for `ARCd-config.yml` (see
[Resolved Decisions](#resolved-decisions) → "Approach 1 (two separate arc-config files) rejected") and
Finding #4 for session-init / session-handoff. Process-task-loop's overlap ratio (~85-90%) is higher than
Finding #4's session-init (~60%), so the duplication cost is _more_ severe here, not less.

**Why single-file over runtime in-prose conditionals:** Same reasoning as Finding #4. `arc:if` blocks are
stripped at install time, not evaluated at runtime. The agent reading `3_process-task-loop.md` on a Lite
install sees only Lite content — no per-read gate evaluation cost. This differs from `create-prd`'s
unified-with-conditional-edges shape (see [Resolved Decisions](#resolved-decisions) →
"Lite `create-prd` workflow shape"), where runtime conditionals are acceptable because workflow invocation
is infrequent (once per PRD). Process-task-loop is read at every task; runtime gates would compound
indefinitely. Template-time gating pays the complexity in source once.

#### Gated surfaces in `3_process-task-loop.template.md`

Four discrete regions require `install.type` gating. Line references are to the current package source
(295 lines).

1. **Branch/task list coupling bullet** (L36-41). Full's text references stacked PRs, team sub-branches,
   phased delivery, archival on task-list completion, and the `rotate-branch` workflow for intermediate
   merges — all Full-scale coupling patterns. Lite's coupling is structurally simpler: one task list
   (`.arc/active/tasks.md`) lives on the project branch (or main directly) until ship. Two-way gate. Full
   retains current text; Lite replacement is roughly one sentence — single task list on the project branch,
   no rotation, no intermediate merges, no archival.

2. **Verification Phase pointer** (L198). Full loads `work-unit-lifecycle/verify-work-unit.md`; Lite loads
   `verify-work.md` (the dedicated Lite workflow established in Finding #2). Single-line swap via two
   one-line `arc:if` blocks. Content otherwise identical; only the link target changes. This is a
   downstream consequence of Finding #2's two-workflow-file decision landing inside `process-task-loop`'s
   Verification Phase section.

3. **Next Step section** (L200-205). Full's `## Next Step` section points at `integrate-work-unit.md` for
   post-verification integration. Lite has no integration or archival phase — the ship step happens
   _inside_ `verify-work.md` (Success Criteria check → Tier 3 gates → aggregate diff review, per
   [Enforced Sequence](#enforced-sequence) § Ship step). In Lite, the verification phase is terminal. Gate:
   entire `## Next Step` section wrapped in `install.type == full`; no Lite replacement — removing the
   section leaves the flow terminating at Verification Phase, which is correct for Lite.

4. **Incidental Work Management section** (L207-264). Largest gated region. The section has four sub-parts
   with different treatments under `install.type` gating:

    - **Quick Decision Guide sub-section** (L209-226). Full's decision tree chooses between "suggest
      incidental task list" and "suggest keeping as atomic task (or fixing inline)." Lite has no
      incidental task list concept — there is one task list (`tasks.md`), and multi-step incidental work
      routes into it as a new phase or insertion into an existing incomplete phase. Two-way gate. Lite
      replacement is a simpler routing rule: atomic work goes to `atomic-tasks.md`; multi-step work folds
      into `tasks.md` via new phase or insertion at the logical point, with user approval before adding.
    - **Where to Capture Atomic Tasks sub-section** (L228-246). Full's two-destination routing
      (`atomic-{name}.md` for "will do during this WU" / PM-mode-gated destinations for "for later"
      including `ATOMIC-INBOX.md` under `pm.layer == arc-pm`) collapses in Lite. Lite forces
      `pm.layer: none` via the `install.type == full` init prompt gate, so
      [`strategy-planning-module`](#strategy-applicability-mapping) is excluded and `ATOMIC-INBOX.md` is
      not installed. Lite has exactly one atomic capture destination: `atomic-tasks.md`. No "for later"
      bucket exists — Lite's bounded-effort model means there are no work-unit boundaries to capture
      across. Gate: Full-only. Lite's single-destination routing is embedded in the Quick Decision Guide
      replacement.
    - **Atomic Task Completion sub-section** (L248-259). The three-step protocol (mark, reorder, verify)
      is **universal** — applies to `atomic-{name}.md` in Full and `atomic-tasks.md` in Lite. Not gated;
      stays in the unconditional baseline of the section.
    - **Complete Workflow pointer sub-section** (L261-264). Full points at
      `supplemental/manage-incidental-work.md` for full incidental lifecycle (creation, execution,
      archival). Lite has no such workflow — the minimal Lite guidance is already inline in the Quick
      Decision Guide replacement. Gate: Full-only.

Four top-level surfaces. Surface 4 has three sub-gates internally but they cluster within one coherent
section (and the Atomic Task Completion sub-section is pulled out as universal to avoid drift risk between
the Full and Lite variants of the section). Well within Mechanism B's scaling comfort zone — Finding #4's
session management has four gated surfaces in `session-init.template.md` at comparable complexity.

#### Retained universally (explicit)

To make cut boundaries precise, the following sections stay in the unconditional baseline (identical
across modes):

- Purpose, method dependencies, one-task-at-a-time principle
- Test-first execution (RED/GREEN/REFACTOR, batching judgment)
- Issue triage
- Completion protocol for single tasks (Tier 1 quality gates, task marking, completion notes, pre-report
  checklist, mandatory stop, implied permission, deferred review)
- Coherent unit completion protocol (Tier 2 gates, parent task marking, pre-report checklist for coherent
  unit)
- Commit guide integration, WORK-STATUS update at commit time, atomicity check
- Verification Phase section heading and intro paragraph (only the pointer line is gated — see Surface 2)
- Atomic Task Completion protocol (L248-259) within Incidental Work Management
- Task List Maintenance section (session-scoped tracking vs task list files, updating task lists)
- Existing `team.enabled` and `pm.layer` `arc:if` blocks — orthogonal axes; compose independently with
  `install.type` gates

The retained surface is approximately 85-90% of the file by line count. Finding #5's cuts are narrow in
footprint but broad in structural signal — they're the workflow's coupling points to Full's WU lifecycle
and planning module.

#### `strategy-quality-gates` stays applies-as-is (drift-check clean)

Per the Finding #2 / Finding #4 drift-check pattern established in prior resolutions,
`strategy-quality-gates.md` was re-audited during Finding #5's code-read phase for in-doc tables and
example blocks that might reference Full-only workflows or fields (the surface class that triggered
`strategy-task-list-formatting` and `strategy-session-operations` reclassifications). **Result: clean.** No
classification tables, no Full-coupled example blocks, no references to `verify-work-unit`,
`integrate-work-unit`, archival, shift lifecycle, team coordination, or backlog. The `### Phase 3` /
`### Phase N: Testing & Quality Gates` example blocks are generic task-list skeletons — both modes have
phases per Finding #2. "Coherent unit completion" mentions are about parent-task completion within a task
list, which is structurally valid in Lite (Lite has phases and parent tasks). Cross-references to
`process-task-loop`, `2_generate-tasks`, `DEV-RULES.PROJECT`, and `QUICK-REFERENCE` all resolve correctly
in both modes.

Classification holds at **applies-as-is**. Strategy count stays at **4 applies-as-is / 4 needs-variant /
2 excluded** (unchanged from Finding #4's correction). The concept-not-content drift pattern did not hit
a third consecutive session — two-of-three, not three-of-three. Both prior hits had in-doc tables or
example blocks embedding Full-only surface references; `strategy-quality-gates` has neither. Per the
threshold criterion from Finding #4's resolution, this is **not** evidence that the Finding #6
classification sweep needs a formal audit pass before Tier 4.

#### Template delivery mechanism

`3_process-task-loop.template.md` already flows through the standard render pipeline — `needsRendering()`
matches the `.template.*` extension, `renderConditionals()` strips blocks whose gate condition is false
for the current install's configuration, `toOutputPath()` strips the `.template` segment and the file lands
as `3_process-task-loop.md`. Finding #5 adds new `arc:if` blocks on the `install.type` axis; no new code
paths, no constant additions, no classification changes. The file is Framework classification (not
Configurable), so no manifest pristine-store complexity applies.

**Composition with existing gates:** The file already carries `team.enabled == true` and
`pm.layer == arc-pm | external | none` gates. `install.type == full | lite` gates compose orthogonally
with these — Lite installs force `team.enabled: false` and `pm.layer: none` (via `install.type == full` prompt
gating in the recipe per [Prompt Orchestration and Recipe Authority](#prompt-orchestration-and-recipe-authority)),
so the rendered Lite file will have all `team.enabled` and `pm.layer == arc-pm | external` blocks also
stripped. The final installed Lite file is substantially shorter than the Full + arc-pm variant, while
the source file stays single.

### Lite Initial Setup

Full ARC's initial-setup pipeline is two workflow files: `01_verify-and-configure.md` (verify
install, walk through config, introduce customization surfaces) and `02_define-project.md`
(seven-step document-creation walkthrough covering META-PRD, TECHNICAL-OVERVIEW, AGENT-BRIEFING.PROJECT,
QUICK-REFERENCE, DEV-RULES.PROJECT, ROADMAP, PROJECT-STATUS). The pipeline is designed around the
Full ARC ceremony budget — verify everything, review every config section, fill in seven documents
before starting work.

Lite's design philosophy is "near-zero setup time" (see [Research Findings](#research-findings) —
PSP ceremony threshold, solo-dev adoption patterns). Porting the Full pipeline to Lite via inline
`arc:if` gating would preserve the ceremony structure at the cost of Lite's value proposition.
Section-by-section strip analysis surfaced that Lite retains only ~20-25% of `01_verify-and-configure.md`
and ~45-55% of `02_define-project.md` — combined ~35-40% overlap. Most of the Full pipeline is
ceremony that Lite actively wants to shed: directory-structure verification, WORK-STATUS example
blocks, 8-section config walkthroughs, customization-surface orientations, 7-step document
walkthroughs with META-PRD / TECHNICAL-OVERVIEW / ROADMAP / PROJECT-STATUS.

At ~35-40% overlap, Mechanism B (single template with inline `arc:if`) produces brittle files —
60-75% of content wrapped in whole-section `arc:if` blocks is hard to read, hard to maintain, and
prone to gate-boundary errors. The overlap-ratio heuristic established during Finding #5 (higher
overlap favors B more strongly) inverts at this level: low overlap favors **Mechanism A** —
purpose-built distinct files for each mode. Finding #2's precedent applies (`verify-work.md` /
`verify-work-unit.md` — two files under different recipe buckets when the Lite variant is
structurally distinct from Full, not a trimmed-down Full).

**Mechanism A at both the workflow layer and the template layer:**

- **Workflow layer:** Full's two-file pipeline (`01_verify-and-configure.md`,
  `02_define-project.md`) moves out of the Finding #8 unconditional baseline into the
  `install.type == full` recipe bucket. Lite adds one new purpose-built file `01_setup-lite.md`
  under the `install.type == lite` recipe bucket, collapsing 01's and 02's Lite-relevant scopes
  into one shorter document. The `01_` prefix preserves the initial-setup ordering convention
  relative to the core workflows `1_create-prd.md` / `2_generate-tasks.md` / `3_process-task-loop.md`.
- **Template layer:** Full's `META-PRD.template.md` stays in `install.type == full` bucket
  (Finding #8 commitment holds for Full). Lite adds a new `META-PRD.lite.template.md`
  combining product direction and technical overview content in a single Lite-scoped template.
  The Lite variant is **opt-in, not default** — agent-led during `01_setup-lite.md` rather
  than installed automatically. This lightly reopens Finding #8's "META-PRD not installed in
  Lite" commitment: the default Lite install still has no META-PRD, but an opt-in path now
  exists.

#### Functional requirements — what Lite setup carries

Strictly what's load-bearing for a working Lite install:

1. **Agent configuration check** — confirm `system/agent/{AGENT}.ARC.md` exists. Without an
   agent-specific file, session-init has no agent-specific guidance. Create from
   `template-agent.md` if missing.
2. **Identity resolution** — confirm `git config arc.identity` returns a value. Session state path
   resolution (`user/{identity}/` subtree) breaks without this.
3. **Session-loaded doc population** — AGENT-BRIEFING.PROJECT, QUICK-REFERENCE, DEV-RULES.PROJECT.
   These three are loaded at the start of every session; the agent operates on whatever they say.
   Without them sessions cannot orient reliably — this is non-negotiable for ARC's core value prop.
4. **Optional high-level project doc** — agent-led opt-in step introducing the combined Lite
   META-PRD (see below). User can accept, decline, or defer.
5. **Light customization awareness** — one-paragraph pointer to `arc-methods.md`,
   `arc-extensions.md`, project strategies, and DEV-RULES splitting. Not a walkthrough — just
   enough to signal the surfaces exist for when the user wants to customize.
6. **Optional health check** — `/arc-verify` pointer.
7. **Next action** — start the first session with `/arc-resume`.

Deliberately absent from Lite setup:

- Directory structure verification (post-init, if `arc init` succeeded, dirs exist)
- WORK-STATUS initial-state example block (same reason)
- 8-section Configuration Walkthrough (defaults work; Lite's config template is already
  pre-trimmed via `ARCd-config.template.yml` `install.type` gates — see [Lite Config Template
  Mechanism](#lite-config-template-mechanism))
- Customization Beyond Config walkthrough section (becomes one-line pointer)
- META-PRD creation walkthrough (replaced by optional combined Lite variant)
- TECHNICAL-OVERVIEW creation walkthrough (absorbed into optional combined Lite META-PRD;
  absent entirely if user declines opt-in)
- ROADMAP creation walkthrough (excluded by composition — `pm.layer: arc-pm` only)
- PROJECT-STATUS creation walkthrough (same — `pm.layer: arc-pm` only)
- Path 2: Join Existing (narrow scenario; new maintainer in Lite+tracked can read existing docs
  and run `/arc-verify` without a dedicated join flow)

Target file size: ~100-130 lines for `01_setup-lite.md`, versus Full's ~172 + ~192 = ~364
combined lines across `01_verify-and-configure.md` and `02_define-project.md`.

#### `01_setup-lite.md` content structure

Single workflow file, four steps plus optional META-PRD offer:

1. **Step 1: Verify Your Install** — agent configuration check, identity check, optional
   `/arc-verify` pointer. One short step folding three small checks, not three separate verify
   subsections.
2. **Step 2: Populate Session-Loaded Docs** — three short subsections (AGENT-BRIEFING.PROJECT,
   QUICK-REFERENCE, DEV-RULES.PROJECT) each introducing what the doc is for with Lite-scoped
   "think through" prompts. Replaces Full's 7-step Define Project walkthrough.
3. **Step 3: Optional — High-Level Project Doc** — agent-led opt-in introducing the combined
   Lite META-PRD. Agent explains what it is, when it's useful, when to skip. User decides
   during the setup session. If accepted, agent runs the install command (exact CLI surface
   decided at implementation). Decline or defer is fine; user can opt in later.
4. **Step 4: Light Customization Awareness** — one-paragraph pointer to the customization
   surfaces (`arc-methods.md`, `arc-extensions.md`, project strategies, DEV-RULES splitting)
   with a link to `strategy-configurability-architecture.md` for users who want the full model.
5. **Next Step:** `/arc-resume` to start the first session.

Location: `system/workflows/arc/initial-setup/01_setup-lite.md`. Package source:
`system/workflows/arc/initial-setup/01_setup-lite.template.md` (preemptively a template to
absorb the optional-META-PRD gating and the future Local/Tracked axis gating without rename
churn).

#### Optional Lite META-PRD — `META-PRD.lite.template.md`

**Shape:** Single combined template covering product direction and technical overview content in
~80-120 lines (inline guidance included). Deliberate omissions from Full META-PRD (user personas,
metrics tables, detailed roadmap sections) and from Full TECHNICAL-OVERVIEW (subsystem decomposition,
deployment topology, integration surface detail). Deliberately retained: project overview, goals
and success criteria, non-goals / explicit scope limits, technology stack, key architectural
decisions, critical infrastructure constraints, freeform notes section.

**Same value proposition as Full's two separate docs**, Lite-scoped and scaled. Users who want an
ARC-native, workflow-recognized place for structured high-level project context get one. Users
who prefer to start working immediately without the ceremony can skip it entirely. Prevents the
"solo dev creates an ad-hoc notes file outside ARC's scaffolding" pattern by offering an ARC-native
surface that graduation recognizes.

**Opt-in mechanism:** Agent-led step inside `01_setup-lite.md`'s Step 3. The setup workflow
introduces the option with enough context for the user to decide (what the doc is for, when it's
useful, when to skip). If the user accepts, the agent runs the install command; if declined,
setup proceeds without installing the template. Three mechanism options were considered:

- **Install-time prompt** (`arc init --lite` asks interactively) — rejected on "user doesn't
  yet know whether they want it before seeing what it is" grounds, and adding a prompt erodes
  "near-zero setup time."
- **CLI flag** (`arc init --lite --with-meta-prd`) — rejected on discoverability (users who
  don't read `--help` never find it).
- **Agent-led in-workflow step** — adopted. Discoverable at the right moment (during setup, with
  the agent in-loop to explain), zero CLI prompt erosion, zero ceremony for users who decline.

The exact CLI surface the agent invokes to install the opt-in template (`arc add meta-prd`,
`arc init --add meta-prd`, or similar) is a detail-design question deferred to implementation.
The plan-doc-level decision is the mechanism (agent-led) and the template shape (combined
product + technical).

**Recipe bucket assignment:** `META-PRD.lite.template.md` is **not** in any recipe bucket by
default. Opt-in installation is a separate code path from the recipe mechanism — it appends to
the installed-files manifest without re-running `resolveFileList()`. The recipe-layer
infrastructure from Finding #8 is not extended to cover opt-in templates; a new "add template"
operation is introduced in the CLI alongside existing recipe-driven operations.

**Graduation content migration:** CLI + agent-led workflow split mirroring the Lite↔Full mode
switch pattern established in [Graduation / Downgrade Paths](#graduation--downgrade-paths)
(§ CLI + workflow split, Shape γ). The CLI handles deterministic parts — installing/removing
Full's separate META-PRD and TECHNICAL-OVERVIEW templates vs. Lite's combined one, updating the
manifest, re-rendering from the recipe. The agent-led `switch-mode.md` workflow handles judgment
calls — reconciling Lite's combined shape to Full's two-file shape (Lite → Full) or merging
Full's two files into Lite's combined shape (Full → Lite). Content-mapping edge cases (freeform
Notes sections that don't fit either target, subsystem detail that Lite can't absorb, user
personas that have no Lite home) get resolved interactively during the workflow pass, not by CLI
heuristic.

Lite → Full content extraction sketch:

- Lite META-PRD's product-direction sections (Project Overview, Goals, Non-Goals, Success
  Criteria) → stay in a new Full `META-PRD.md` created from Full's template during the migration.
- Lite META-PRD's technology sections (Technology Stack, Key Architectural Decisions, Critical
  Infrastructure Constraints) → extract to a new `TECHNICAL-OVERVIEW.md` created from Full's
  template.
- Lite META-PRD's Notes section → agent-led triage (may map to either target or neither).
- Full META-PRD stub sections that have no Lite content to seed them (user personas, metrics
  tables, roadmap cross-refs) → left empty with a "fill in post-graduation" marker for the
  user to populate.

Full → Lite content merge sketch:

- Full META-PRD sections that map to the Lite shape → merged into a new Lite `META-PRD.md`
  created from `META-PRD.lite.template.md`.
- Full TECHNICAL-OVERVIEW sections that map to the Lite shape → merged alongside the product
  content in the new Lite META-PRD.
- Full content that doesn't fit Lite's compact shape (detailed user personas, subsystem
  decomposition, deployment topology) → landed in a `--- merged from Full, review and trim ---`
  section for the user to reconcile.

The workflow pass surfaces the decisions; the user makes the final call on what stays, what
trims, and what moves to a supplementary location. Same "CLI does mechanical, agent does
judgment" division as Lite↔Full mode switching itself.

#### `strategy-configurability-architecture` drift fix — L87 convention inventory row

Targeted drift-check during Finding #12/R6 resolution surfaced two drift points in
`strategy-configurability-architecture.md`:

1. **L87 (in-scope for Finding #12/R6)** — Convention inventory row: "Document hierarchy
   (META-PRD → PRD → tasks)" asserts Full's hierarchy as universal. Lite has no META-PRD by
   default (optional combined variant only); hierarchy is PRD → tasks. **Row reframed to
   dual-value entry:** "Full: META-PRD → PRD → tasks. Lite: PRD → tasks (optional combined
   META-PRD)." Single row, no `arc:if` gating — the strategy is on-demand reference content,
   not per-session load, so mode-aware prose handles it inline. Mirrors Finding #4's
   `strategy-session-operations` Method Classification by Trigger row reclassification pattern
   (dual-value, no gate).
2. **L104 (out of scope for Finding #12/R6)** — Context footer row: "Context: tasks-*.md
   (Task X.Y)" references the tracked-mode context footer pattern. Local mode uses freeform
   `Context: <description>`. **Real drift on the Local/Tracked axis**, deferred to the future
   Local-axis work alongside other Local-mode content sweeps.

Classification holds at **applies-as-is** for `strategy-configurability-architecture`. The L87
drift is a single-row mode-aware rewording, not a structural reclassification. Strategy count
stays **4 applies-as-is / 4 needs-variant / 2 excluded**.

**Drift-check pattern update:** Finding #12/R6 is the **third** drift hit on an applies-as-is
strategy across four targeted drift-checks (Finding #2 on `strategy-task-list-formatting`,
Finding #4 on `strategy-session-operations`, Finding #5 on `strategy-quality-gates` clean,
Finding #12 on `strategy-configurability-architecture`). Hit rate: 3-of-4, ~75%. Above the 2-of-3
threshold from Finding #4's resolution criterion. Promoted to **formal strategy audit pass in
Tier 4** — single comprehensive sweep of all 10 framework strategies for Full-coupled in-doc
surfaces before closing the pre-PRD phase. Rationale: targeted-per-finding checks have caught
most drift but the pattern is frequent enough that one sweep is cheap insurance against missed
surfaces that no single finding's drift-check covers.

#### Recipe bucket reassignments

Finding #12/R6 reassigns two initial-setup workflow files from Finding #8's implicit unconditional
baseline to the `install.type == full` bucket, and adds one new file to the `install.type == lite`
bucket. Updates to [Installation Type Recipe
Mechanism](#installation-type-recipe-mechanism) § Anchor file bucket assignments:

- `system/workflows/arc/initial-setup/01_verify-and-configure.md` → `install.type == full`
- `system/workflows/arc/initial-setup/02_define-project.md` → `install.type == full`
- `system/workflows/arc/initial-setup/01_setup-lite.md` → `install.type == lite`

Template layer (separate from workflow layer, but related):

- `reference/META-PRD.template.md` → `install.type == full` (unchanged from Finding #8)
- `reference/META-PRD.lite.template.md` → **no recipe bucket** (opt-in installation via
  agent-led step in `01_setup-lite.md`, not via recipe at install time)

#### Full `01_verify-and-configure.md` drift fix — fold-in

Finding #4 uniformly removed `Following Task List: No` from the WORK-STATUS field set across
both modes. `01_verify-and-configure.md` L38's "Verify Session State" example block still shows
the removed field — residual drift missed by the Finding #4 sweep. **Fold-in**: remove the
`**Following Task List**: No` line from the example block as part of Finding #12/R6's Full-side
cleanup. The same block is cut entirely from Lite's `01_setup-lite.md` (no example-block
ceremony), so the drift fix applies only to Full's retained file.

#### Template delivery mechanism

`01_setup-lite.template.md` and `META-PRD.lite.template.md` flow through the standard render
pipeline: `needsRendering()` matches the `.template.*` extension, `renderConditionals()` strips
blocks whose gate condition is false for the current install, `toOutputPath()` strips the
`.template` segment. Package source files are templates; installed files have no `.template.`
infix.

`01_verify-and-configure.md` and `02_define-project.md` stay mechanically unchanged. Full's
existing files remain plain `.md` (and `.template.md` for 02, already a template for the
`pm.layer` axis via Finding #8 precedent). The only change to Full's files is the drift-fix line
removal in `01_verify-and-configure.md`. `02_define-project.md` stays untouched because the
file is entirely Full-only now via its recipe bucket assignment — no new `install.type` gates
needed inside the file.

### Graduation / Downgrade Paths

**Lite --> Full:** When a project outgrows Lite — scope expands, multiple work streams emerge, the single
task list becomes unwieldy. Graduation should be feasible and relatively seamless from a user perspective.

Mechanically: `arc mode switch --to full`. This is a distinct CLI surface, not `arc init --reconfigure`,
per the Reconfigure boundary row in [Resolved Decisions](#resolved-decisions) — reconfigure does not
mutate `install.type`, and Lite↔Full transitions are lateral shifts rather than settings tweaks.
Internally the command reuses the `buildChangePlan` / `applyChangePlan` pipeline from reconfigure by
flipping `install_config.install_type` in the manifest and re-rendering from the recipe per
[Installation Type Recipe Mechanism](#installation-type-recipe-mechanism). Graduation would:

1. Switch installation type from Lite to Full
2. Install Full-specific workflows, config, and directory structure
3. Relocate the existing task list (e.g., `active/tasks.md` --> `active/feature/tasks-{name}.md`)
4. The Lite PRD becomes the Full PRD. Mechanically: the file is relocated (e.g.,
   `active/prd.md` --> `active/feature/prd-{name}.md`) and the cut template sections
   (`Type:`, `Status/Related Work`, `Document History`) are added with empty content for the
   developer to fill in. No structural rewrite — the retained sections carry over verbatim.
5. Install backlog infrastructure if `pm.layer` is set to `arc-pm`
6. Future work follows the full pipeline

**Key constraint:** Task list format must be identical in both modes. Graduation is relocation and
infrastructure addition, not content rewrite.

**Full --> Lite:** For developers who find Full ARC too heavy. Also serves as an escape hatch: try Full,
dial back to what you actually use rather than abandoning the framework entirely.

Mechanically: `arc mode switch --to lite`, symmetric with the upgrade direction and reusing the same
pipeline. Full → Lite has deterministic parts (manifest rewrite, file removal, config re-render) and
non-deterministic parts (semantic decay in surviving user content); the CLI handles the deterministic
parts and an advisory workflow handles the rest.

**CLI + workflow split.** CLI is self-sufficient for users without an agent in loop; the workflow adds
agent-guided judgment where the CLI cannot reach (reading surviving content in context, proposing
edits). Workflow is the documented suggested entrypoint, not the only path.

- **CLI command:** `arc mode switch --to lite`. Reuses `buildChangePlan` / `applyChangePlan` /
  `resolveRemovalsInteractive` from `arc init --reconfigure`. Does NOT inherit reconfigure's prompt
  loop — this is a lateral shift, not a settings tweak. Own command module under the `mode`
  namespace (extensible for the Local/Tracked axis later).
- **Advisory workflow:** `supplemental/switch-mode.md`. Pre-flight discussion → dry-run inventory →
  agent-guided review of Category C hits → apply → post-transition validation. Lands alongside the
  other framework-level one-offs already in `supplemental/` (`add-agent.md`,
  `integrate-external-content.md`, `verify-arc-integrity.md`).

**Entry-state gate.** Only possible with a single active work unit or between work units. If more
than one work unit is active, the CLI refuses with an instruction to shift the extras (see
[Shift Lifecycle](#shift-lifecycle)) to `Paused` or archive them first. Destructive state change —
the user must put the system in a valid state explicitly rather than having the CLI auto-handle
disposition of other work. Generalization of the invocation-as-assertion semantic from
[Integration Interaction with Shift States](#integration-interaction-with-shift-states): invocation
carries assertion, but here the assertion has a pre-condition that the CLI verifies.

**Orphan taxonomy.** Three distinct categories with different remediation fits:

- **Category A — manifest-tracked, recipe-excluded.** Files the Lite recipe doesn't include
  (backlog templates, `PROJECT-STATUS.md`, `ROADMAP.md`, work-unit-lifecycle workflows, full PRD
  template, etc.). Handled automatically by flipping `install_type` in the manifest and
  re-resolving the file list: `buildChangePlan` produces these as planned removals, and the
  existing `resolveRemovalsInteractive` UX (two-stage: summary → bulk-or-per-file choice;
  classification-driven defaults; bulk "Keep all, remove from ARC tracking only" option that
  matches "framework ignores these files, they stay on disk" semantics) handles them with no new
  code. This is the biggest orphan category and existing infrastructure covers it for free.
- **Category B — runtime user artifacts not in the manifest.** Active work units beyond the
  single-WU constraint (addressed by the entry-state gate above), archived work units created
  post-init under `.arc/completed/`, user-authored content in `.arc/backlog/`, surviving `plan-*`
  docs in `backlog/` or elsewhere. Not visible to `buildChangePlan`. Requires a filesystem walk
  over top-level directories that become Full-only, reported per-directory (not per-file):
  _"`.arc/completed/` contains 3 archived WUs — keep / delete?"_. Coarser granularity is
  appropriate — finer re-implements per-file UX for off-manifest content.
- **Category C — semantic decay.** Decomposes into two subsurfaces:
    - **C1 — stale path/filename references.** The transition renames
      `active/feature/{name}/tasks-{name}.md` → `active/tasks.md` and the PRD analogously. Any
      surviving user content referencing the old paths goes stale — ADRs, project strategy docs,
      surviving `plan-*` docs. Deterministic and grep-catchable. The CLI performs a sweep
      (patterns: `tasks-\w+\.md`, `prd-\w+\.md`, `active/feature/`, surviving `plan-\w+\.md`),
      reports hits by file and line. Workflow can walk hits interactively.
    - **C2 — conceptual decay.** Surviving user strategy docs describing work-unit-lifecycle
      patterns, multi-WU branching, or `arc-pm` conventions that no longer apply. Not
      grep-catchable — requires reading content in context and judging whether the concept still
      applies under Lite. Handled by the advisory workflow's review pass: an agent reads surviving
      content alongside the user and proposes edits. CLI-only fallback: static warning enumerating
      surviving user-authored directories for manual review.

**Pipeline reuse and descope guard.** The CLI's mechanical work is almost entirely handled by the
existing reconfigure pipeline once `install.type` is a consumable field — symmetric additive per
[Installation Type Recipe Mechanism](#installation-type-recipe-mechanism). New code is bounded to
the filesystem walk (Category B), the grep sweep (C1), and the new command-module shell with its
prompts. Descope guard stays in force from Finding #16's resolution: if implementation complexity proves
material, descope to "Lite → Full only" with a clear error on the reverse path. Current analysis
does not suggest it will — Cat A is free, Cat B is one filesystem walk, C1 is one grep, C2 is a
warning string plus the workflow's review pass.

**META-PRD content migration across the boundary (Finding #12/R6 follow-on).** When Lite has
opted in to `META-PRD.lite.template.md` (the combined product + technical content variant from
[Lite Initial Setup](#lite-initial-setup) § Optional Lite META-PRD), graduation and downgrade
both need to reshape the high-level project doc:

- **Lite → Full:** The CLI installs Full's separate `META-PRD.template.md` and
  `TECHNICAL-OVERVIEW.template.md` (both rendered from the recipe under `install.type == full`).
  The `switch-mode.md` workflow then walks the user through extracting technology content from
  the existing Lite META-PRD into the new TECHNICAL-OVERVIEW and reshaping the product content
  into Full's META-PRD structure. Stub sections in Full's META-PRD that have no Lite content to
  seed them (user personas, metrics tables, roadmap cross-references) are left empty with a
  "fill in post-graduation" marker.
- **Full → Lite:** The CLI removes Full's `META-PRD.md` and `TECHNICAL-OVERVIEW.md` from the
  manifest and installs `META-PRD.lite.template.md` (opt-in is implicit during downgrade since
  the user already has the Full docs). The `switch-mode.md` workflow walks the user through
  merging both Full files into the new Lite combined shape, landing content that doesn't fit
  Lite's compact form in a `--- merged from Full, review and trim ---` section for the user to
  reconcile.

Both directions follow the same "CLI does mechanical, agent does judgment" division as the rest
of mode switching — the migration logic is not a new pipeline, just new content-mapping rules
surfaced through the existing advisory workflow pass.

### Configuration and Installation

**Installation type, not config value.** Lite vs Full is the first fork in `arc init`:

```text
? Project mode
  > ARC Lite  - Execution discipline for focused projects
    Full ARC  - Complete lifecycle management
```

The choice is stored in the manifest (`install_config`), not in `ARCd-config.yml`. It determines what
files are installed, what config options are available, and what prompts appear during init.

**PM mode gating:** Lite + `arc-pm` is contradictory (no work unit stream for the planning module to
manage). The `pm.layer` prompt is skipped in Lite; the effective mode is `none`. Lite + `external` is an
open question — there may be value (external ticket references in context footers) but no integration
workflow to hook into. Evaluate during detail design. The prompt-gating mechanism itself (recipe
`show_when` field, partial-config evaluation, drift mitigation) is specified in [Prompt
Orchestration and Recipe Authority](#prompt-orchestration-and-recipe-authority).

**Lite config template:** Lite ships a reduced `ARCd-config.yml` that omits the `pm.layer` and
`team.enabled` sections. This keeps the config honest about what Lite actually configures rather than
showing options that don't apply. The delivery mechanism — rename to `ARCd-config.template.yml` and
gate the two sections with `<!-- arc:if install.type == full -->` directives — is specified in
[Lite Config Template Mechanism](#lite-config-template-mechanism).

**Recipe-side mechanism:** The installation-type choice drives which files land on disk via a
symmetric-additive recipe condition — see [Installation Type Recipe
Mechanism](#installation-type-recipe-mechanism) for the full specification.

### Quick-Start / On-Ramp Angle

Lite mode could be the default first experience with ARC:

- `arc init` --> Lite mode. Hooks work, dev rules load, you can create a Lite PRD and task list
  immediately
- Developer experiences the execution discipline without upfront ceremony
- When the project (or a new project) outgrows it, graduate to Full

This reverses the current adoption model where you choose your complexity level before experiencing ARC.
Instead: start working, discover value, add structure when you need it.

**Open question:** Should Lite be the default, or should `arc init` always ask? The on-ramp argument
favors defaulting to Lite. The "informed choice" argument favors asking. The CLI's `--lite` and `--full`
flags provide explicit paths regardless.

---

## Mode 2: Local Mode

**Equal-weight deliverable — scoped in alongside ARC Lite.**

> **Forward-compat note (added 2026-05-02):** A backend storage tier captured in
> `plan-arc-backend.md` shares substantial structural concerns with Local mode — materialization,
> sync state machine, project-ID resolution, re-clone recovery, failure handling. Local was
> designed before the backend tier was recognized as a target; specific decisions (per-developer
> backing store as non-bare git repo, `arcd backing` command shape, sync firing points,
> failure-class taxonomy) may or may not generalize cleanly to multi-user. **At Local's
> PRD-promotion time, scope a storage-abstraction sketch as part of that work** to validate
> Local's implementation choices against backend-tier composability. See `plan-arc-backend.md`
> § Local Mode Composition for the discipline statement and `strategy-storage-evolution.md`
> § Holistic Design Touchpoints for the joint-attention surface.

### Purpose

Local mode enables ARC in repositories where the developer doesn't control the tracked space — work
projects with strict tooling policies, OSS contributions where personal tooling doesn't belong, trial
runs on repos the developer hasn't committed to adopting ARC in yet. The developer gets ARC's execution
discipline without the repo footprint.

Local mode is orthogonal to Lite/Full: any combination of (Lite, Full) × (tracked, local) is valid.
Each combination serves a different adoption context.

### Design Philosophy

**"Does less only where it has to, just as reliably."** Same framing as Lite. Local mode sacrifices only
what the constraint (no repo footprint) literally forces. Everything else — execution discipline, quality
gates, lifecycle workflows, hooks, session management — works the same way, by the same rules, with the
same reliability. Where Local mode appears to "degrade" something, we interrogate that degradation and
either find a mechanism that preserves reliability or honestly name it as an unavoidable cost.

### Technical Approach

**The core insight: `.arc/` stays in the working tree.** Rather than relocating files outside the repo,
keep them exactly where agents, hooks, and workflows expect them — but exclude them from git tracking.
Agents can read gitignored files by explicit path, hooks live in `.git/hooks/` already, and workflows
load files by hardcoded paths, so nothing in ARC's core machinery needs to change.

### Exclusion Mechanism

Standard git guidance distinguishes shared team patterns (project `.gitignore`) from user-specific
tooling, which belongs in global gitignore or repo-local `.git/info/exclude`. Methodology tools fit
the latter category — personal entries in project `.gitignore` are not the norm. Global gitignore is
unusable as a default (machine-wide blast radius — adding `.arc/` there would break tracked ARC on
every other repo on the same machine). That leaves `.git/info/exclude` as the primary path, with the
tracked `.gitignore` line as an opt-in for teams that explicitly welcome tool-specific entries.

**Primary: `.git/info/exclude` (automated via CLI)**

- Repo-local, untracked gitignore. Zero footprint in the tracked repo.
- Aligns with the industry norm for per-user tooling (personal, not shared).
- Survives the lifetime of the clone, lost on re-clone (see below).
- CLI automates setup and re-clone recovery.

**Secondary: tracked `.gitignore` line (opt-in)**

- A single line — `.arc/` with a comment — added to the project's tracked `.gitignore`.
- For teams where per-developer tool entries are explicitly welcome.
- Survives re-clones naturally (tracked content).
- Selected via `arc init --local --shared-gitignore` (or equivalent flag); not the default.

**Dropped: global gitignore (`~/.gitignore_global` / `core.excludesFile`)**

- Machine-wide blast radius — would force every `.arc/` on the machine into untracked state.
- Breaks coexistence with tracked ARC installs on other projects.
- Not offered as an option.

**Init flow:** By default, `arc init --local` sets up `.git/info/exclude`. If the developer passes
`--shared-gitignore`, the CLI prompts to add the tracked line (with preview) and proceeds with the
`.gitignore` path. The developer doesn't pick between invisible and durable on taste — they pick based
on environmental constraint, and the CLI guides them.

### Re-Clone UX

`.git/info/exclude` is reset on re-clone (no native git mechanism preserves per-repo excludes across
clones — see § Research Findings § `.git/info/exclude` behavior on re-clone). Without automation this
would be friction enough to undermine Local mode. **The backing store (see next subsection) doubles
as the re-clone detection signal**, making recovery a one-prompt operation.

**Project identity** — stable within a keying epoch. The CLI resolves the project ID via
**pinned-ID-file-first precedence**, with a fallback chain as a secondary step.

1. **Pinned project ID file** (primary, sticky). If `.arc/system/.internal/project-id` exists, its
   contents ARE the project ID, full stop. Fallback chain is skipped. The file contents are a single
   ID string (UUID, first-commit-hash, or remote-URL-hash — format-agnostic beyond "one ID string").
   File presence is the stickiness mechanism — a project with a pinned ID stays on that ID
   permanently, regardless of later git state changes (remote added, first commit, etc.).
2. **Fallback chain** (runs only when the pinned-ID file is absent), walked top-down, first match
   wins:
    - **Git remote URL** — if `origin` is set, hash it.
    - **First-commit hash** — if no remote but the repo has commit history.
    - **Generated UUID** — no remote, no commits. Written to the pinned-ID file at creation so
      subsequent resolutions short-circuit at step 1. Covers the Lite+Local "try ARC in five minutes"
      scenario where the developer has nothing to key off of yet.

The pinned-ID file lives at `.arc/system/.internal/project-id` as an untracked file under the
untracked `.arc/` tree; it survives directory moves as long as `.arc/` moves with it.

**UUID-case stickiness is automatic.** The generated-UUID path writes the pinned-ID file at init time,
so the project is sticky on the UUID from the first resolution onward. Adding a remote or making the
first commit later does not re-key the project — file-first precedence short-circuits the fallback
chain.

**First-commit-case stickiness uses auto-detect.** When a repo keyed on first-commit-hash later
acquires a remote, fallback-chain walking would silently return the remote-URL hash instead of the
first-commit hash (the pinned-ID file is NOT written in this case by design — the absence is what
enables auto-detection to fire). Left unhandled, the silent re-keying would orphan the existing
backing store and next sync would create an empty store at the new key, losing prior history. Handled
via auto-detect: on every project ID computation, the resolver ALSO checks whether a backing store
exists at any key the fallback chain _would_ have resolved to under a prior repo state. If such a
store is found, the CLI offers a three-way migration prompt before proceeding:

```text
Project identity changed: this repo now has a remote, and the backing store
key would move from first-commit-hash ({old-key}) to remote-URL-hash
({new-key}). An existing backing store is present at {old-key}.

  [M]igrate — copy backing store content to new key (old becomes orphan)
  [S]tay    — pin the old key permanently (writes pinned-ID file)
  [L]ater   — use old key for this session; ask again next session
```

The **[S]tay** option writes the current old key to `.arc/system/.internal/project-id`, converting an
auto-detected transition into a permanent stickiness pin. File-first precedence then makes the old key
permanent — no re-prompting on future resolutions. This is how the secondary case acquires stickiness:
not automatically, but as a one-time user-confirmed operation.

**`arc project-id migrate` command** — the explicit verb for user-initiated migration outside the
auto-detect path. Useful when the user wants to migrate proactively (e.g., adopting a remote URL as the
new key for cross-machine sync) rather than waiting for the next resolution to fire the prompt.
Behavior:

1. Compute old key (resolver with current state) and new key (resolver under the intended new state;
   the command accepts a `--to <key-source>` flag or walks the chain with overrides to determine the
   new key).
2. Refuse if a backing store already exists at the new key (concurrent migration from another
   machine). Message: "backing store already exists at new key; use `arcd backing pull` to adopt it
   or specify a different key."
3. Copy old store content to the new-key location. Does NOT move — orphan warning is louder than
   silent loss.
4. Rewrite or clear the pinned-ID file as appropriate: clear it (letting fallback chain re-resolve
   to the new key naturally at next invocation) or write the new key explicitly (pin on the new
   key).
5. Report: "migrated. Old store at `~/.arc-state/{old-key}/` is orphaned; remove when confident.
   Configure remote on new store with standard git if you want cross-machine sync."
6. Does NOT touch remote backing store configuration — user sets that up separately with standard
   git commands in the new store.

Resolves Audit A sub-finding H3-N4 (fallback-chain precedence and stickiness contradiction) and
dependent findings M2 (stickiness mechanism, now file-first precedence) and M3 (migrate command
shape, now specified above).

**Re-clone detection flow:**

When any `arc` or `arcd` command runs in a repo where:

1. The computed project ID matches an existing backing store location, AND
2. The `.arc/` directory is absent or empty, AND
3. `.git/info/exclude` lacks the expected `.arc/` entry

...ARC concludes this is a fresh clone of a previously-initialized Local mode repo. Commands other
than `arc init --local` exit immediately with the message "Re-clone of a Local-mode repo detected.
Run `arc init --local` to restore from backing store before continuing." `arc init --local` itself
performs detection and then offers single-confirmation restoration via the recovery command path
below.

This deliberate split — detection on any command, restoration only on `arc init --local` — keeps
substantial filesystem operations out of read-only-feeling commands (`arcd health`, `arcd backing
status`) while ensuring no invocation proceeds against incomplete state.

**Recovery command.** `arc init --local` is idempotent and is the command that performs recovery.
When the computed project ID matches an existing backing store and `.arc/` is absent, `arc init
--local` detects re-clone state and prompts for a single confirmation before performing the four
recovery steps as a sequence:

1. Re-populate `.git/info/exclude` with the `.arc/` entry (or restore the tracked `.gitignore` line
   if that was the original setup).
2. Replay backing store contents into `.arc/` via `arcd backing restore`.
3. Re-install hooks in `.git/hooks/` (local by nature; re-applied from the package source).
4. Report restoration complete; developer resumes work.

**Idempotent re-entry** means re-running `arc init --local` is always safe — on a fresh install it
sets up everything, on re-clone it restores, and on an already-initialized install it is a no-op.
Re-clone recovery is therefore a re-run of the original command rather than a separate named verb,
matching the "init is the setup entry" intuition. Resolves Audit A sub-finding H3-N1 (idempotent
re-entry path); the companion session-init Local-axis pre-check that surfaces this state before
document loading is specified in § Durability-Layer Commands § Session-Init Integration.

### Backing Store

**Required, not opt-in.** Losing local ARC state is catastrophic — tracking spans weeks of work, and
opt-in backup would mean any developer who doesn't read carefully loses everything on disk failure.
Reliability requires this to be on by default with zero configuration friction.

**Baseline — auto-created local git repo:**

- Location: `~/.arc-state/{project-id}/` — a standard (non-bare) git repo with its own working
  directory. Platform-equivalent home paths are handled at implementation time.
- Created automatically during `arc init --local`
- Full git history of ARC state, independent of the project repo
- Developer does nothing — zero configuration, zero maintenance

**Sync mechanism and firing point:** At session handoff (the canonical firing point), the CLI
copies the contents of `.arc/` into `~/.arc-state/{project-id}/`, stages them with `git add -A`,
and commits with an auto-generated message tying the snapshot to the source commit hash (or
timestamp in zero-commit repos — see [Project identity](#re-clone-ux)). Non-bare is required
because the sync is implemented as a working-directory commit — `rsync`-based alternatives were
rejected because they drop git-history semantics, and bare-repo alternatives were rejected
because `git add -A` needs a working directory to scan. The non-bare clone gives full git
history, supports the opt-in remote push path below with no additional tooling, and matches the
plan's stated durability and portability properties exactly.

**More frequent sync** (beyond handoff) is acceptable only if it remains fast, seamless, and
invisible. Additional firing points beyond session handoff:

- **Shift transitions** — parking a WU to durable storage before rotating focus is load-bearing
  for Local Full viability. Implementation-phase decision whether to fire on every shift or only
  on "long pause" transitions.
- **`arc update`** — successful framework updates (including three-way-merged Configurable
  files) sync the backing store before the update command returns, ensuring the store captures
  the new framework state. Prevents a home-dir-loss window from losing the user's merge
  decisions. Resolves finding L4.

All firing points are subject to the same "fast, seamless, invisible" constraint.

**Failure handling.** Handoff proceeds even if the backing store sync fails — the user is
notified, the next session's session-init pre-check queries `arcd backing status` and surfaces
degraded state in the orientation summary, and recovery happens automatically or manually
depending on failure class. Refusing handoff on sync failure would leave the user unable to
close a session over a durability system they didn't ask to opt into; the guarantee is
"best-effort durability, visible when degraded," not "atomic two-phase commit."

Three failure classes with distinct recovery characteristics:

- **Class A — fail before local commit** (disk full, permission errors, git metadata lock
  contention). The local store stays clean. The next `arcd backing sync` picks up current
  `.arc/` state and rolls forward. Recovery is automatic.
- **Class B — local commit succeeded, push failed** (transient network, auth refresh needed,
  remote temporarily unreachable). The local store is one commit ahead of the remote. The next
  successful push catches up. Recovery is automatic.
- **Class C — non-fast-forward push failure** (another machine pushed divergent commits to the
  same remote). The local store has a commit the remote does not AND the remote has commits
  local does not. The next `arcd backing sync` also fails with non-FF until manually resolved
  via the cross-machine conflict flow — see [Durability-Layer
  Commands](#durability-layer-commands) § Cross-machine conflict story. Recovery is **not**
  automatic.

`arcd backing status` is the canonical source of degraded-state information; session-init
queries it at orientation time and surfaces class or staleness in the summary. Resolves Audit A
tightening H3-N5.

**Durability:** Survives project repo re-clone, accidental `rm -rf .arc/`, branch switching. Lost
only if the developer loses their home directory (at which point much else is also gone).

**Optional — remote backing store (opt-in, for cross-machine portability):**

- Developer configures a git remote on the backing store (private GitHub repo, GitLab project,
  self-hosted server)
- `arcd backing push` (or handoff, per `user.sync_push`) pushes local backing store → remote.
  See [Durability-Layer Commands](#durability-layer-commands) for the full command family
- `arc init --local` on another machine detects the backing store via project ID, offers to bootstrap
  from the remote
- Cross-machine use is a one-time setup task, not automatic
- For developers who don't need cross-machine sync, zero extra steps

**What the backing store contains:** Full snapshot of `.arc/` — including `active/`, `user/{identity}/`,
`backlog/` (if `pm.layer` is `arc-pm`), archived work, and configuration. Backup is comprehensive;
restoration is exact.

**Privacy model.** The backing store contains the full `.arc/` snapshot — PRDs, design docs, session
notes, and potentially in-progress work that has not been committed to the project repo. ARC's
privacy posture follows idiomatic CLI-tool practice rather than inventing new mechanisms. Three
surfaces:

- **Local filesystem permissions.** `arc init --local` creates `~/.arc-state/{project-id}/` with
  mode 700 on Linux and macOS at creation time, matching OpenSSH, GnuPG, and AWS CLI (the last after
  [Issue #7369][aws-7369]). `arcd backing status` includes a permission check — if the directory
  is more permissive than 700 (Linux/macOS only), status reports a warning but does not refuse to
  run. Hard-refuse on permissive perms is reserved for security-critical tools (SSH, GnuPG) where
  the state is key material; for a methodology tool, warn-but-run is proportionate — GnuPG's
  pattern for non-critical operations. Windows inherits user-only ACLs from the home directory;
  ARC does not set ACLs explicitly, which is not the idiomatic pattern on Windows.
- **Remote backing store privacy.** A configured git remote on the backing store **MUST be a
  private repository**. ARC does not verify this programmatically — no comparable CLI tool does. A
  2026-04-13 survey of [restic], [borg], [git-crypt], [chezmoi-encryption], [pass], and yadm found
  zero tools that programmatically check remote repo visibility; all defer to user responsibility
  with documentation-only guidance. Programmatic verification would require host-specific API
  calls (GitHub/GitLab only, auth tokens, network dependency, no self-hosted support) and has no
  ecosystem precedent. `arcd backing push` prints a loud one-line reminder on first invocation
  against a new remote, then trusts the user thereafter.
- **At-rest encryption.** Not provided by ARC. Methodology documentation is not a secret in the
  [pass] / [restic] / [borg] sense — those tools encrypt because they handle credentials or backup
  data destined for untrusted storage. ARC's content model is closer to [Obsidian][obsidian-enc],
  Logseq, and git itself, all of which store plaintext on disk and delegate encryption to the disk
  layer (FileVault, LUKS, BitLocker, dm-crypt). This is the boundary every mainstream note-taking
  and documentation tool draws; encrypt-by-default is overreach for ARC's threat model.

**Power-user option: `git-crypt` on the backing store.** Because `~/.arc-state/{project-id}/` is a
standard git repository, users with elevated threat models (e.g., remote backing store on shared or
semi-trusted infrastructure) can wire [`git-crypt`][git-crypt] manually for per-file encryption of
sensitive content. ARC does not ship this integration — setup is standard `git-crypt` procedure
inside the backing store repo, unaffected by ARC's operations. [chezmoi's optional encryption
model][chezmoi-encryption] is the closest reference for how ARC could later integrate opt-in
encryption as a follow-on feature; this is out of scope for the modes WU.

Resolves finding L3 (privacy model unspecified).

### Single-Active-Unit Invariant

Local Full (and Local Lite, trivially) is constrained to a single in-progress work unit at a time. The
invariant reflects a structural fact: without git tracking, untracked files don't switch with branches,
so tracked Full's "work units live with their branches" model can't carry over. Having multiple parallel
in-progress WUs in Local mode would produce permanent state/branch mismatch confusion.

**But ARC tracks work units, not branches.** This distinction is essential. Single-active is about ARC's
formal attention, not about what the developer can do in git. The developer can freely:

- Branch, merge, switch, rebase, stack — any git pattern works
- Visit other branches for reviews, hotfixes, drive-by fixes without ARC caring
- Spin up side branches for small fixes that don't warrant ARC ceremony
- Use worktrees, cherry-picks, any advanced git pattern

What the developer cannot do under single-active alone: have two work units both formally tracked by
ARC (task lists, lifecycle, scope) simultaneously in in-progress state.

**Enforcement.** The activation workflow (`activate-work-unit.md`) scans `active/` for any task list
whose header reads `Status: In Progress` before proceeding with a new activation. If another
in-progress work unit is found, activation halts with an error of the shape:

> Cannot activate `{target}`: work unit `{active-name}` is already in progress
> (`active/{active-path}`). Use `/arc-shift` to pause it and activate `{target}` in one coordinated
> step — the shift workflow dispatches to `shift-with-activation` when the target is new or in
> backlog (see [Workflow Shape](#workflow-shape)). Alternatively, complete or archive the current
> work unit first.

Enforcement lives at the workflow layer, not a specific CLI command, so every invocation surface
that reaches activation — CLI, skill, direct workflow execution — inherits the check uniformly.
Task list `Status` headers are the single source of truth for the scan, per [State Lives in Task
List Headers](#state-lives-in-task-list-headers-pure-option-c); no registry file, no cache.
**The same check applies to tracked Full:** single-active is mode-universal; shift lifecycle is the
mechanism that makes it livable, and both modes share the enforcement locus. Users who prefer
explicit sequencing can pause via `/arc-shift` first and invoke activation afterwards — the
shift-with-activation dispatch is a convenience wrapper, not the only supported recovery.

### Shift Lifecycle Makes Local Full Viable

The single-active invariant on its own would be too restrictive for the motivating Local mode use case
(long-running work project where you can't install ARC to the repo). It would force developers into
"archive prematurely to switch contexts" or "handle side work without ARC tracking" in situations where
those are genuinely wrong answers.

The [shift lifecycle](#shift-lifecycle) resolves this. With shift, single-active becomes "one
_in-progress_ WU at a time, plus any number of _paused_ WUs." The developer can pause feature-X when
it hits review, activate the auth refactor incidental WU, complete it, shift back to feature-X.
Real-world multi-stream work flows naturally.

Shift is not a Local-mode-specific feature — it fills a parallel gap in Full ARC that was previously
masked by implicit branch-switching. But Local mode is where the gap is unmistakable. Both modes get
shift from the same implementation.

### Scenario Walk-Through

Real scenarios tested against the Local Full + shift model:

**Scenario 1 — Mid-WU, unrelated bug in another file.**

Local Full: fix in passing (commit to current WU branch), or defer via existing issue-triage pathways.
No shift needed. Identical to tracked Full.

**Scenario 2 — CI breaks, need hotfix while mid-WU.**

Local Full: switch to hotfix branch, fix, merge, return. ARC state stays on feature-X. Orientation
reports "on hotfix branch, active focus feature-X" — visibly mismatched but correct. No ARC
intervention needed. Identical to tracked Full.

**Scenario 3 — Stacked development (feature-B built on feature-A).**

Local Full: a stack is typically one work unit with multiple task list phases/branches. Works
identically in both modes.

**Scenario 4 — Mid-WU discovery of substantial unplanned work that blocks progress.**

Example: "feature-X can't reach Phase 4 until we refactor auth middleware, which is itself a multi-phase
effort."

Local Full: `arc-shift` feature-X (pause, reason "blocked on auth refactor"). Activate the auth refactor
as an incidental work unit. Complete it. Archive it. `arc-shift` back to feature-X. Phase 4 can now
proceed. This is the "incidental work unit" pattern from tracked Full, preserved intact in Local Full
via shift.

**Scenario 5 — Feature-X is waiting on code review (days to a week). Developer wants to start feature-Y.**

Local Full: `arc-shift` feature-X (pause, reason "awaiting review from Alice, expected ~Thursday").
Activate feature-Y. When review lands, `arc-shift` back. Feature-Y resumes later. This is the scenario
that single-active alone couldn't handle. Shift resolves it cleanly.

### Local Infrastructure Scenario Battery

Real scenarios tested against Local mode's infrastructure surface (durability, recovery, multi-machine
coordination, and mode-specific edge cases). Parallels § Scenario Walk-Through above but covers a
different concern: § Scenario Walk-Through exercises shift lifecycle over Local Full, this battery
exercises the storage / identity / durability machinery. Each scenario lists the situation and the
designed response, with forward references to the plan-doc section where the resolution lives.

**Scenario 1 — Re-clone recovery.**

_Situation._ Fresh clone of a previously Local-initialized repo on the same machine. `.arc/` is absent,
`.git/info/exclude` is empty (reset on clone), hooks are gone from `.git/hooks/`, and the backing store
at `~/.arc-state/{project-id}/` is intact.

_Designed response._ Run `arc init --local` — it is idempotent and owns the full four-step recovery
sequence (restore `.git/info/exclude`, replay backing store content via `arcd backing restore`,
re-install hooks, report). Session-init's Local-axis pre-check detects missing `.arc/` on session start
and surfaces this recovery path in the orientation summary before attempting to load any ARC document
set. See § Re-Clone UX § Recovery command and § Durability-Layer Commands § Session-init Local-axis
pre-check.

**Scenario 2 — Backing store corruption.**

_Situation._ `~/.arc-state/{project-id}/` exists but is damaged. Variants: git metadata broken
(index/HEAD/objects partial), working-dir snapshot partial, whole directory missing, crashed lock file.

_Designed response._ `arcd backing status` includes a health check that reports one of `healthy`,
`degraded`, `missing`, or `corrupt` as a summary verdict, plus specific integrity surfaces (existence,
HEAD resolution, `git fsck --connectivity-only`). When `.arc/` is intact but the backing store is
broken, `arcd backing sync --rebuild` re-initializes the store from current `.arc/` content, losing
prior history. Asymmetric recovery rule: `.arc/` intact + store broken → rebuild from `.arc/`; store
intact + `.arc/` broken → `arcd backing restore`; both broken → remote only, else data loss. See
§ Durability-Layer Commands § Local-mode surface.

**Scenario 3 — Remote backing store conflict.**

_Situation._ Machines A and B share a remote backing store; both push divergent local snapshots.

_Designed response._ `arcd backing push` non-FF → prompts `arcd backing pull` → ref-only fetch →
`arcd backing sync` refuses in the divergent state. Divergence resolution is deliberately power-user
manual: `cd ~/.arc-state/{project-id}/` and use standard git tooling directly (`git reset --hard
origin/{branch}` to prefer remote, `git push --force` to prefer local, or manual merge via standard
git workflows). The backing store's git-repo nature makes dedicated ARC-specific resolution verbs
redundant — they would cover strictly fewer cases than `git` does in the same directory. See
§ Durability-Layer Commands § Cross-machine conflict story.

**Scenario 4 — Project ID migration (UUID-keyed project acquires a remote).**

_Situation._ Zero-commit repo with tertiary UUID project ID at `~/.arc-state/{uuid}/`. Repo later
acquires a remote; developer wants migration to a remote-URL-keyed store for cross-machine sync.

_Designed response._ UUID-case stickiness is automatic — the pinned-ID file at
`.arc/system/.internal/project-id` was written at init time, so file-first precedence keeps the project
on the UUID even after a remote is added. No silent re-keying, no data loss. To migrate proactively,
run `arc project-id migrate`: computes old and new keys, refuses if a store already exists at the new
key, copies old store content to the new-key location (does not move — orphan warning is louder than
silent loss), rewrites or clears the pinned-ID file, reports the orphan for manual cleanup. See
§ Re-Clone UX § Project identity.

**Scenario 5 — Backing store sync failure → next-session recovery.**

_Situation._ Session handoff fires `arcd backing sync`; the sync fails somewhere in the pipeline
(before commit, after commit but before push, or with a non-fast-forward push conflict).

_Designed response._ Three failure classes with distinct recovery characteristics. **Class A** (fail
before local commit — disk full, permissions, lock contention): store stays clean, next sync rolls
forward automatically. **Class B** (local commit succeeded, push failed transiently): next successful
push catches up automatically. **Class C** (non-fast-forward push failure): requires manual resolution
via the cross-machine conflict flow; does NOT recover automatically. `arcd backing status` is the
canonical source of degraded-state information; session-init's Local-axis pre-check surfaces the class
or staleness in the orientation summary. See § Backing Store § Failure handling and § Durability-Layer
Commands § Session-init Local-axis pre-check.

**Scenario 6 — `arc update` in Local mode.**

_Situation._ Developer runs `arc update`. Framework files pull from the package, three-way-merge onto
Configurable files. Writes land in the working-tree `.arc/`, untracked in Local mode.

_Designed response._ `arc update` is a backing store sync firing point — successful updates (including
three-way-merged Configurable files) sync the store before the command returns, ensuring the store
captures the new framework state before the next session-handoff window. Prevents a home-dir-loss
window from losing the user's merge decisions. See § Backing Store § More frequent sync.

**Scenario 7 — Editor UX under agent use.**

_Situation._ Developer working in an agent-enabled editor, wanting to reference `.arc/` files in agent
chat via `@`-mention pickers or navigate `.arc/` via editor UI.

_Designed response._ Agent file-reading machinery (Read/Grep/Glob) bypasses editor indexing entirely —
core ARC operations work unchanged. Editor explorer views show untracked files by default in every
mainstream editor (Zed, VS Code, JetBrains, Cursor). Session-init scaffolding gives the agent full path
discoverability from STRATEGY-INDEX + filename conventions, so natural-language references ("check the
plan doc for X") resolve to Glob/Grep without touching any editor picker. The only affected surface is
quick-open / `@`-picker in editors that respect gitignore (notably VS Code); per-editor mitigations
exist for users who want to eliminate the residual friction. See § Agent and Editor Discoverability.

**Scenario 8 — CI pipeline cloning a Local-mode repo.**

_Situation._ CI clones the project repo and runs build / test / lint. `.arc/` is absent (untracked);
the backing store does not exist on CI runners.

_Designed response._ By design, CI sees zero ARC content — the Local mode invariant. Commit-msg hook
enforcement is local-only (same as tracked mode, not a Local regression), `git add -A` does not stage
gitignored files, and CI does not install ARC in normal usage. One subtle asymmetry: project tooling
that globs files may see `.arc/` on dev machines but not on CI, creating a lint / test surface
asymmetry that confuses developers. Configure project linters / tests to explicitly exclude untracked
ARC paths if symmetric behavior matters. Do not install Local mode in repos where CI depends on ARC
operations. See § Agent and Editor Discoverability § Tooling asymmetry note.

**Scenario 9 — Non-git repository handling.**

_Situation._ Developer runs `arc init --local` (or `arc init` in tracked mode) in a directory with no
`.git/` at all.

_Designed response._ `arc init` (both modes) detects missing `.git/` and prompts: "This directory is
not a git repository. ARC requires git for hooks and related setup. Initialize git now? [Y/n]" —
default yes. On yes, runs `git init` and proceeds with the normal init flow (tertiary UUID fires
because no commits exist yet in Local mode). On no, exits cleanly with a remediation message. See
§ Init Flow Implications § Init preconditions.

**Scenario 10 — Multi-user machine privacy.**

_Situation._ Backing store at `~/.arc-state/{project-id}/` contains sensitive `.arc/` snapshots —
PRDs, design docs, session notes, and in-progress uncommitted work. Visibility to other users on
shared machines and to public / private remote git hosting are both in scope.

_Designed response._ `arc init --local` creates the backing store with mode 700 on Linux / macOS
(matching OpenSSH, GnuPG, AWS CLI). `arcd backing status` warns if perms drift above 700 but does not
refuse to run — that discipline is reserved for security-critical tools. Remote backing store MUST be
a private repository; ARC does not verify programmatically, matching industry norms across `restic`,
`borg`, `git-crypt`, `chezmoi`, and `pass` (none of which verify remote visibility either). At-rest
encryption is not provided — methodology documentation delegates to disk-layer encryption (FileVault,
LUKS, BitLocker), matching Obsidian, Logseq, and git itself. Power users with elevated threat models
can wire `git-crypt` manually inside the backing store repo. See § Backing Store § Privacy model.

**Scenario 11 — Zero-commit → first-commit → remote transition.**

_Situation._ Repo keyed on first-commit-hash (secondary fallback case — `arc init --local` ran when
the repo had commits but no remote, so the pinned-ID file was not auto-written). Developer later runs
`git remote add origin ...`.

_Designed response._ The resolver auto-detects the transition on every project ID computation: it
checks whether a backing store exists at any prior-resolvable key. If an old store is found at the
first-commit-hash key but the current fallback chain would return the remote-URL hash, a three-way
migration prompt fires before proceeding: **[M]igrate** (copy old content to new key), **[S]tay** (pin
the old key permanently by writing it to the pinned-ID file), or **[L]ater** (use old key for this
session, ask again next session). The [S]tay option converts an auto-detected transition into a
permanent stickiness pin via file-first precedence — the secondary case acquires stickiness as a
one-time user-confirmed operation rather than automatically at init time. See § Re-Clone UX § Project
identity.

### What Changes vs. Tracked Full

**Changed:**

- Exclusion mechanism (`.git/info/exclude` or `.gitignore` line) and init flow
- Backing store required for durability
- Context footer format — hook enforces descriptive freeform pattern (`Context: <description>`) instead
  of task-list references, leaving zero ARC fingerprint in commit history
- Durability-layer commands — Local installs `arcd backing sync/restore/push/pull/status`
  instead of `arc user save/load/push/pull` + `arc sync`. Separate purpose-built command
  family, not transparent redirect. See
  [Durability-Layer Commands](#durability-layer-commands).
- Role concept dropped (Local drops role regardless of Lite/Full — see
  [Shared Infrastructure](#shared-infrastructure))
- `team.enabled` forced to `false` (solo-ARC by definition)
- `pm.layer` either `arc-pm` (ARC's built-in PM, artifacts untracked like everything else) or
  `external` / `none`

**Unchanged:**

- All constitutional docs, strategies, methods, workflows
- Hooks (already local in nature)
- Skills (already local in nature)
- Task lists, session state files, work unit directory structure
- Process-task-loop, quality gates, mandatory stops
- Shift lifecycle (same workflow, mode-aware only at the persist step)
- Upgrade path to tracked — remove exclusion, `git add .arc/`, switch context footer format, done

### Upgrade Path (Local → Tracked)

Frictionless because files already live in `.arc/` in the working tree:

1. Remove the exclusion (`.git/info/exclude` entry or `.gitignore` line)
2. `git add .arc/`
3. Switch context footer format in `ARCd-config.yml` (or remove the local-mode override)
4. Commit — standard tracked content from this point forward

No migration, no content rewrite, no file moves. Git history starts from the tracking commit; content
is continuous. The composition chain remains intact: local Lite → tracked Lite → tracked Full, each
step adds structure without rewriting what exists.

### Agent and Editor Discoverability

Local mode makes `.arc/` invisible to editor surfaces that respect gitignore. In practice this is a
**minor disruption, not a primary ergonomic cost** — the effective impact is much narrower than the
"gitignored by default" framing suggests.

**Three surfaces behave differently:**

- **Agent file-reading machinery is unaffected.** Read/Grep/Glob tools take absolute paths and bypass
  editor indexing entirely. Core ARC operations — session-init, process-task-loop, workflow execution —
  work unchanged.
- **Session-init scaffolding gives the agent full path discoverability.** The agent already knows
  STRATEGY-INDEX, directory conventions, and filename patterns (`plan-*`, `tasks-*`, `prd-*`) from its
  loaded context. Natural-language references ("check the plan doc for H3," "pull up the modes task
  list") resolve to Glob/Grep without ever touching an editor picker. Explicit `@`-tagging is rarely the
  load-bearing path in ARC workflows.
- **Editor explorer/file-browser views show untracked files by default** in every mainstream editor
  (Zed, VS Code, JetBrains, Cursor). `.arc/` is visible in the sidebar — not a hidden surface.

**The residual affected surface** is quick-open and `@`-mention pickers in editors that respect
gitignore — notably VS Code's `Ctrl+P` and the agent chat `@`-picker that inherits its index. A developer
typing `@tasks-feature-x.md` in a chat turn may not get autocomplete and has to type the path manually.
When session-init scaffolding covers the reference implicitly (most of the time), this is invisible;
when explicit `@`-tagging is genuinely needed (rare), it costs a few extra keystrokes.

**External survey confirms this as an intrinsic tradeoff, not an ARC-specific gap.** A 2026-04-13
research pass over adjacent tools (Cursor rules files, SpecStory `.specstory/`, Aider `.aider.*`,
Continue `.continue/`, JetBrains AI Assistant, Dendron/Obsidian in-repo vaults) found no clean universal
solution — every surveyed tool accepts the gitignored-picker cost as a consequence of the category. VS
Code issues [#103570][vscode-103570] (support opening ignored files) and [#43505][vscode-43505] (allow
extensions to contribute to quick-open) both closed without resolution. Zed's `file_scan_inclusions` is
the sole clean path-scoped mitigation.

**Per-editor mitigation guidance** (for users who want to eliminate even the residual friction):

| Editor           | Mitigation                                                                                          | Friction |
|------------------|-----------------------------------------------------------------------------------------------------|----------|
| **Zed**          | `"file_scan_inclusions": [".arc/**"]` in `settings.json`. Path-scoped, clean. Solves it completely. | Low      |
| **Cursor**       | `.cursorignore` with `!.arc/**` negation. Affects codebase indexing scope.                          | Medium   |
| **Continue.dev** | Custom context provider pointing at `.arc/` (documented pattern).                                   | Medium   |
| **VS Code**      | `search.useIgnoreFiles: false` in workspace `.vscode/settings.json` (repo-scoped, not global).      | Medium   |
| **JetBrains**    | Scopes feature including `.arc/` explicitly in search and navigation.                               | Medium   |

**Users choosing Local mode accept this narrow tradeoff in exchange for repo-footprint-zero operation.**
The practical daily impact is minimal because ARC's agent scaffolding does most of the discoverability
work the `@`-picker would otherwise handle. Local mode is best suited to developers whose agent workflow
relies on natural-language file references and CLI-driven operations more than explicit editor-hosted
`@`-tagging. Resolves finding L1.

**Tooling asymmetry note.** Project tooling that globs files (markdown linters, test runners, quality
gate commands) may see `.arc/` content on developer machines but not on CI or fresh clones, because the
files do not exist there. Running `npm run lint:md` locally may hit violations in untracked `.arc/`
content that CI sees zero of. This is a consequence of the "no repo footprint" guarantee, not a defect.
Configure project linters and test runners to explicitly exclude untracked ARC paths if symmetric
behavior matters across dev machines and CI. Do not install Local mode in repos where CI depends on
ARC operations. Resolves Audit A sub-finding H3-N6.

---

## Shift Lifecycle

**Cross-cutting deliverable — applies to all ARC modes.**

> **Scheduled for extraction to the Mobility WU.** This section and the § Mid-Session
> Orientation section below are slated to move into `plan-work-unit-mobility.md` as part of
> that WU's first implementation phase. Mobility sequences before modes; when mobility
> activates, this content moves, and modes plan updates to reference the extracted content
> via cross-WU links. No edits here in the meantime — the mobility plan carries the
> extraction shape, rationale, and open questions (notably the pause-pointer reconciliation).
> See `plan-work-unit-mobility.md` § Extraction Scope.

### The Gap This Fills

Work units don't always move from activation through completion without interruption. Real team
workflows regularly park a WU mid-stream while waiting on code review, stakeholder feedback, blocking
work from another team, or an external dependency. Meanwhile the developer is often ready to start the
next thing.

Full ARC today has no formal model for this state. The implicit workaround — leaving the WU "active"
on its branch while starting a new feature branch for the next WU — works mechanically in tracked mode
(git swaps files per branch) but creates a stale-state problem: WORK-STATUS on branch A says "finish
integration, Next Action X" when you've actually moved on. Session-init reports misleading state.
Nothing formally captures why the WU is paused or when it's expected to resume.

This gap is largely invisible in solo-sequential workflows (complete one WU, archive, start next) but
is everyday reality in team contexts and multi-stream work. Local mode surfaces it hard — without the
branch-swap implicit mechanism to hide the problem, Local Full can't support "waiting on review"
at all without a formal pause.

### Design Philosophy

**Metadata-in-place, not file relocation.** A paused WU stays where it is. Its files don't move.
WORK-STATUS tracks the state change, the WU's own status header reflects the new state, and session-init
reads both. Rolling back a pause is a metadata flip, not a filesystem operation.

**One user-facing skill, unified workflow.** The skill is `arc-shift`, the workflow is
`shift-work-unit.md`. "Shift" reads naturally for all three transitions:

- "Let's shift away from this while we wait on review" — pure pause
- "Let's shift to feature-Y" — rotate (pause current, resume target)
- "Let's shift back to feature-X" — resume (when no in-progress WU, or suspend current first)

The workflow reads current WORK-STATUS state and the target argument (if any), determines which
transition this is, and executes accordingly.

**Works identically in Full and Local, with only the persist step differing.** The metadata updates,
document status headers, and WORK-STATUS changes are mode-agnostic. The final "persist" step commits
in tracked Full and syncs the backing store in Local. Developers reading the workflow see one
description, not two.

### State Model

A work unit in the pipeline can be in one of these states:

| State         | Location   | Meaning                             |
|---------------|------------|-------------------------------------|
| `planned`     | `backlog/` | Scoped but not yet activated        |
| `in-progress` | `active/`  | Currently being worked on           |
| `paused`      | `active/`  | In flight but temporarily set aside |
| `archived`    | archive    | Completed (or abandoned), terminal  |

The critical observation: `active/` holds both `in-progress` and `paused` WUs. Directory membership
means "in flight, between backlog and archive." Per-WU state is metadata, not location.

### State Lives in Task List Headers (Pure Option C)

**Decided 2026-04-09** after walking the audit's scenario battery against Options B and C
(Option A was previously ruled out by the contributor-lifecycle stress test —
see [`analysis-modes-contributor-lifecycle-stress-test.md`][contrib-stress-test] § S5). The walk
established that task list headers as the sole source of truth — with no registry file and no
per-dev cache — is the cleanest shape under the reframe described below. The full walk and
failure-mode analysis is preserved in the follow-up session's record; this section captures the
resolved shape.

**Key reframe that shaped the decision:** session-init does not need to know about inactive or
paused WUs. Multi-WU awareness is an on-demand concern, not a session-init concern — the
developer already knows what they paused, and if they need a reminder they can ask. Baking
multi-WU reporting into every session-init orientation is noise for both human and agent. This
reframe collapsed a complex registry-vs-cache-vs-file-vs-skill design space into something much
simpler.

**The shape:**

Each WU's status file carries its own state in the `**State:**` field. A paused WU's status
file has, for example:

```markdown
**State:** Paused (2026-04-09) — awaiting code review from Alice
```

Or for external-blocking states (see [Finding B resolution](#finding-b-paused-vs-waiting-for-vocabulary-split) below):

```markdown
**State:** Waiting-For Review (2026-04-09) — Alice, PR #42
```

Valid `State:` values: `In Progress` / `Paused` / `Waiting-For {category}` / `Complete`. Inline
date in parentheses is the pause timestamp (ceremony-free, auto-observed per Clarification #4 in
the audit). Freeform reason follows the dash.

**Branch-local WU pointer is per-WU, single-slot.** No In Flight registry, no Active Focus
section. Under the Work-Status Restructure WU (see
[§ Alignment with Work-Status Restructure WU](#alignment-with-work-status-restructure-wu) below),
the pointer is the per-WU `status-{name}.md` file in `active/{category}/` — one status file per
WU, with a flat field set (State / Branch / Task List / Next Task / Last Completed / Blockers /
Next Action). The file is single-slot by construction (one WU, one file); it is not a multi-WU
registry. Pre-restructure, this role was served by a singular `active/WORK-STATUS.md`; the per-WU
file preserves Clarification #2's semantic distinction (branch-local WU pointer) while
eliminating the parallel-WU concurrency flaw.

**No index file.** No `user/{identity}/IN-FLIGHT.md`, no per-dev cache, no registry file in any
form. The walk's honest-failure-mode analysis demonstrated that any cache introduces drift risk
that erodes the "trust the system" value prop, and that the self-healing discipline needed to
keep a cache trustworthy exceeds the UX benefit it provides. Task list headers are the only
state.

**Mid-session multi-WU awareness is on-demand via `/arc-status` skill.** See
[Mid-Session Orientation](#mid-session-orientation) below. The skill reads headers and composes
a current-state view only when invoked. This keeps multi-WU reporting out of session-init
orientation entirely, aligned with the reframe above.

**How this resolves the scenario battery's findings:**

- **Scenario 1 (solo tracked Full, 2 WUs on 2 branches):** Current-branch scan sees only the
  current branch's task lists. That is the expected behavior under the reframe — the developer
  knows about the other branch, and if they need an explicit reminder they invoke `/arc-status`
  (which can offer an on-demand cross-branch git query as an opt-in for the rare case).
- **Scenario 2 (solo Local Full, 2 WUs):** `.arc/` is shared across branches in Local mode, so
  any scan naturally finds all in-flight task lists. Clean.
- **Scenario 3 (team merges to main):** Tracked task lists travel with their branches. After
  merges, main's `active/` naturally carries the aggregate view. Clean.
- **Scenario 4 (person-to-person handoff):** The paused task list is in tracked `active/` and
  moves with the branch on pull. Personal context still moves via SESSION-NOTES git notes as
  today. No additional state to coordinate.
- **Scenario 5 (activate new while one is paused):** `activate-work-unit` writes the new WU's
  status file with `State: In Progress`. The paused WU's status file is untouched. No
  cross-workflow coordination.
- **Scenario 7 (rotate between two paused WUs):** Shift updates two status file `**State:**`
  fields (the pausing WU's flips to `Paused (date) — reason`; the resuming WU's flips to
  `In Progress`). Atomicity is local to two file writes; under the restructure there is no
  separate per-branch registry pointer to update.
- **Scenario 8 (resume after long pause):** Pause timestamp lives inline in the `State:` field.
  Shift reads the field on resume and surfaces a staleness warning if the interval exceeds one
  week (fixed, not configurable — see [Resolved Decisions](#resolved-decisions) → "Staleness
  threshold").
- **Scenario 9 (waiting-for-review distinction):** Encoded as a specific `State:` value. See
  Finding B resolution.

**What this decision removes from scope (vs. the earlier "In Flight registry" sketch):**

- Registry file design (none needed)
- Per-dev cache file and its rebuild/self-healing logic (none needed)
- Multi-WU registry template (none needed — the per-WU status file is single-slot by
  construction)
- Session-init integration work for multi-WU reporting (unchanged — session-init stays lean)
- Cross-file atomicity discipline between registry and per-WU state (single source of truth
  means no sync concern)

The cascade of simplification from the reframe is intentional and the primary value of walking
the scenario battery carefully — the design gets smaller, not bigger.

### Document Status Headers

PRDs and task lists carry status headers today (e.g., `Status: In Progress`). Shift lifecycle
extends the vocabulary with two new values — `Paused` and `Waiting-For` — and adds an inline
date and freeform reason format. Per the
[State Lives in Task List Headers](#state-lives-in-task-list-headers-pure-option-c) resolution,
these headers are the sole source of truth for WU state; there is no cache or registry to keep
in sync.

**Field format:**

```markdown
**State:** In Progress
**State:** Paused (2026-04-09) — blocked on session token decision
**State:** Waiting-For Review (2026-04-09) — Alice, PR #42
**State:** Waiting-For Approval (2026-04-09) — ARB signoff expected Thursday
**State:** Complete
```

PRDs retain `**Status:**` headers and follow the same value format on shift transitions.

**Valid Status values:**

- `In Progress` — active work. Default state for an activated WU.
- `Paused` — developer is the next mover; they set it aside and will return to do more work.
  Counts against the growth nudge (WIP pressure).
- `Waiting-For {category}` — external actor is the next mover; the developer cannot unblock it
  from their side. Does **not** count against the growth nudge — waiting on three PRs is a
  normal pipeline, not WIP pressure.
- `Complete` — terminal state, prelude to archival.

**`Waiting-For` categories** (committed pre-PRD — these five are the final set):

- `Review` — awaiting code review
- `Approval` — awaiting stakeholder / ARB / compliance signoff
- `Delivery` — awaiting downstream deployment or external artifact
- `Decision` — awaiting a decision from someone else (not a self-decision — that's `Paused`)
- `Other` — freeform, with the reason string carrying the detail

The five are locked because each implies a distinct follow-up action (reviewer vs.
decision-maker vs. external party vs. architect vs. freeform), which is what the category is
for. Freeform `Other` + the reason string handle anything the five don't cover directly.

#### Finding B: Paused vs Waiting-For vocabulary split

The `Paused` / `Waiting-For` distinction came from the solo-dev audit's Finding B and is backed
by Kanban literature, GTD's "Waiting For" list, and empirical research on PR review latency
(see [`analysis-modes-solo-dev-blind-spot-audit.md`][solo-audit] § B for evidence). The
distinction matters because:

- **Orientation reporting can triage differently.** "Waiting for review (3d)" suggests nudging
  the reviewer; "paused on incidental (2d)" is self-state with no external action available.
- **WIP nudges should only apply to developer-paused WUs.** Three items in `Waiting-For Review`
  is a normal PR pipeline; three developer-paused WUs is WIP pressure.
- **Pause reason taxonomy becomes simpler** — the state itself carries the "what kind of
  waiting" category, so the freeform reason only needs to carry the detail (who/what/when).

**Cost:** Trivial. One extra Status enum value plus a category modifier for `Waiting-For`. No
mechanism change beyond the existing Status header. Documentation sweep in
`strategy-task-list-formatting.md` to catalog the valid values.

**Scope:**

- **PRD `**Status:**` header** — updated on shift transitions (value + date + reason)
- **Status file `**State:**` field** — updated on shift transitions (same format)
- **Supplementary docs** (`atomic-*.md`, `notes-*.md`) — deferred to implementation. Gut-level:
  skip them, they're supplementary and the churn isn't worth it. Revisit if implementation
  surfaces a reason.

### Workflow Shape

`shift-work-unit.md` encodes the three transitions via state-driven branching.

**Inputs:** Current WORK-STATUS state, optional target WU name, optional reason string.

**Transition detection:**

- Active Focus exists, no target → **pure pause** (pause current)
- Active Focus exists, target is in In Flight as paused → **rotate** (pause current, resume target)
- Active Focus exists, target is new or in backlog → **shift-with-activation** (pause current, hand off
  to activate-work-unit workflow for the target)
- No Active Focus, target exists as paused → **pure resume** (resume target)
- No Active Focus, no target → invalid, report and exit

**Uncommitted work handling:**

Before any pause, the workflow detects uncommitted changes in the working tree. When found, it surfaces
the state to the user with a recommended default of **commit first** (clean pause is the reliable
default), but allows override:

1. **Commit first (recommended)** — workflow prompts for commit message or invokes arc-commit
2. **Stash** — `git stash push` with a descriptive message tied to the WU
3. **Leave as-is** — pause proceeds, dirty state remains in working tree, noted in WORK-STATUS entry

The workflow presents commit as the default; the user is in charge of the final choice. This preserves
reliability bias without being dogmatic.

**Local-mode scope.** The three options apply to tracked project-repo files; `.arc/` content is
untracked in Local mode and outside `git stash`'s reach, so uncommitted `.arc/` edits structurally
follow **leave as-is** regardless of which option is chosen for tracked code. They remain in the
working tree and are captured by the next `arcd backing sync` at session handoff. A Local-mode user
pausing with both project-code changes and `.arc/` edits can commit or stash the former via the
normal options while the latter takes leave-as-is automatically.

**State-update steps (common to all transitions):**

1. Gather reason and context (ask if not supplied and transition needs one)
2. Optionally snapshot SESSION-NOTES to the WU's directory as preserved context
3. Update the affected WU(s) status file `**State:**` field — e.g., feature-x's State flips
   from `In Progress` to `Paused (YYYY-MM-DD) — reason`, and for rotations feature-y's State
   flips from `Paused` (with its own old timestamp) to `In Progress`
4. Update PRD Status header(s) to match (same format as task list)
5. Update `WORK-STATUS.md` to reflect the new current-branch WU (single-slot, branch-local)
6. Persist — commit in tracked Full (via arc-commit invocation or inline commit step), backing
   store sync in Local

Step 3 is the canonical state write. Everything else derives from it or is a surface for local
discoverability. There is no registry file or cache to keep in sync — task list headers are the
single source of truth per the
[State Lives in Task List Headers](#state-lives-in-task-list-headers-pure-option-c) decision.

**`shift-with-activation` coordination:**

When the transition is `shift-with-activation` (Active Focus exists, target is new or in
backlog), the workflow pauses the current WU, reports pause success, and then proceeds into
`activate-work-unit` for the target in the same invocation — **one user confirmation at the
top, one workflow walk across both steps**. Not a two-step conversation where the user must
re-invoke after the pause, and not a silent auto-handoff that hides the second step.

The pause half is the clean failure boundary: if the pause write succeeds but activation fails
partway, the user is left in a clean paused-current state with a clear "activate {target}?"
resumption point, not in half-state where the current WU is paused _and_ the target is
partially activated. This matches ARC's general "mandatory stops between operations" idiom
while avoiding the unnecessary friction of forcing the user to type two commands for what is
semantically one transition.

The protocol is specified in `shift-work-unit.md` at implementation time; the coordination
shape (one confirmation, sequential walk, pause is the failure boundary) is the load-bearing
decision and is locked in pre-PRD.

**Resume-side additions:**

On resume transitions, the workflow additionally:

1. Surfaces the preserved SESSION-NOTES snapshot (if any) as recovery context
2. Checks branch alignment in tracked Full, suggests the switch if needed
3. Reads the pause timestamp from the status file `**State:**` field and reports pause age (e.g.,
   "paused 2d ago", "paused 9d ago — assumptions may be stale"). If the pause exceeds **1 week**
   (fixed, not configurable), surfaces an advisory prompt to re-read the PRD and task list
   before proceeding. The prompt is dismissible — it nudges, it doesn't gate. 1 week fits
   common-case memory loss for detailed project context; configurability is explicitly
   rejected as premature flexibility (most users wouldn't touch it, and the wrong-default
   tolerance is high because the prompt is advisory). Revisit only if evidence shows the
   threshold is actively wrong in practice.

### Session-Init Integration

**Session-init stays unchanged from today.** Multi-WU awareness is an on-demand concern, not a
session-init concern. Per the reframe that drove the
[State Lives in Task List Headers](#state-lives-in-task-list-headers-pure-option-c) decision,
paused and waiting-for WU information is not load-bearing for every session orientation — the
developer already knows what they paused, and if they need a reminder they can invoke
`/arc-status` (see [Mid-Session Orientation](#mid-session-orientation)).

Session-init continues to read `WORK-STATUS.md` as the branch-local WU pointer and reports that
single WU's state (branch, current task, next action, blockers). It does not scan `active/` for
paused task list headers. It does not summarize cross-WU state. This keeps the orientation
summary focused on "what am I doing right now?" — which is all session-init needs to answer
for the common single-WU case, and all it _should_ answer for the multi-WU case where extra
information would be noise.

The only session-init touchpoint the shift lifecycle adds is **drift detection** — if the
status file `**State:**` field reads `Paused` or `Waiting-For` while the PRD `**Status:**`
header still says `In Progress` (or vice versa), the orientation surfaces the mismatch ("PRD
says active, but the status file is paused — did you interrupt a shift without completing all
updates?"). This is a safety check, not a multi-WU report.

### Skill Shape

`/arc-shift` ships with the shift lifecycle, following the established thin-skill pattern
(skill file is a short pointer; the workflow carries the logic). The complementary `/arc-status`
skill lives in its own [Mid-Session Orientation](#mid-session-orientation) section — it is
mode-universal rather than Full-only, and the structural placement reflects that.

Backed by `shift-work-unit.md`. Handles the state transitions described in
[Workflow Shape](#workflow-shape) above.

User invocations that naturally route through `/arc-shift`:

- "Let's shift this aside while we wait on review"
- "Shift to feature-y"
- "Let's shift back to feature-x now that review landed"
- "Shift this and start the auth refactor incidental WU"

### Integration Interaction with Shift States

The shift lifecycle introduces `Paused` and `Waiting-For {category}` as valid mid-flight states for
an in-progress work unit. `integrate-work-unit.md` is the terminal transition point — it takes a
completed WU and prepares it for merge. Without explicit handling, the expanded state vocabulary
leaves an ambiguity: what should integrate do when invoked on a WU whose status file
`**State:**` field reads something other than `In Progress`?

#### Current workflow does not validate the State field

A reading of `integrate-work-unit.md` clarifies the pre-shift-lifecycle behavior. Step 1 ("Verify
Work Completion") is agent-enforced prose. Its validation checks are: all subtasks and parent
tasks marked `[x]`, Success Criteria all checked, quality gates passed.

The state line in Step 1 — `[ ] Status file **State:** updated to Complete` — is
phrased as an **imperative**, not a gate. It instructs the agent to ensure the State field reads
`Complete` before proceeding, and the transition itself is a silent side effect of Step 2's
`clean-work-unit.md` Mode 2 run (which sets `State: Complete` unconditionally during doc cleanup).
There is no validation today that refuses integration if the current State value is something
else — the workflow effectively assumes `In Progress` and rewrites the State field during prep.

This reframes Finding #13 from "add a validation layer" to **"surface the state transition
explicitly so it can accept the shift-lifecycle vocabulary."** The resolution is primarily a
widening of the entry contract, not a new mechanism.

#### Acceptance matrix

| Entry state            | Behavior                                                         |
|------------------------|------------------------------------------------------------------|
| `In Progress`          | Accept. Standard happy path.                                     |
| `Complete`             | Accept. Idempotent (e.g., re-running after a crash).             |
| `Waiting-For Review`   | Accept. Transition to `Complete`.                                |
| `Waiting-For Approval` | Accept. Transition to `Complete`.                                |
| `Waiting-For Delivery` | Accept. Transition to `Complete`.                                |
| `Waiting-For Decision` | Accept. Transition to `Complete`.                                |
| `Waiting-For Other`    | Accept. Transition to `Complete`.                                |
| `Paused`               | Warn, prompt for confirmation, proceed or abort per user choice. |

The transition to `Complete` continues to happen in `clean-work-unit.md` Mode 2 (no change to that
workflow). Step 1 of `integrate-work-unit.md` gains an explicit state-vocabulary read upstream of
the existing checks — reporting the current state, applying the acceptance matrix, and
short-circuiting with a prompt in the `Paused` case.

#### Invocation is the assertion

The semantic that makes the acceptance matrix work: **invoking integrate on a `Waiting-For` WU is
the user's assertion that the wait is over.** When the developer runs integrate on a WU in
`Waiting-For Review`, they are stating "the review landed." The workflow does not need to validate
what was waited for — the invocation itself carries the signal. This is why `Waiting-For Review`
→ integrate is the natural transition path rather than an error condition requiring
resume-then-integrate churn, which was the user-identified anti-pattern driving Finding #13.

The semantic holds symmetrically across the `Waiting-For` categories (including `Other`, where the
freeform reason carries whatever the user knew at pause time). The workflow's job is to transition
state and proceed with integration; judging whether the wait is actually over is the user's
responsibility, discharged by the invocation.

#### Paused is warn-and-confirm, not hard refuse

Per the [Finding B vocabulary split](#finding-b-paused-vs-waiting-for-vocabulary-split), `Paused`
specifically means "the developer is the next mover." A `Paused` WU at integrate time is
semantically suspicious — either the state is stale (the developer forgot to shift-resume after
finishing) or the work isn't actually done. Neither case is a hard "refuse and abort," but neither
is a silent "just integrate."

The resolution is an inline prompt along the lines of:

```text
This work unit is Paused (2026-04-09 — reason) — dev-next-mover state.
Proceed with integration anyway? [y/N]
```

Default is no. If the user confirms, the workflow proceeds through the standard path,
transitioning `Paused` → `Complete` via `clean-work-unit.md` Mode 2 like any other accepted state.
No `--force` flag; the prompt surfaces the decision inline where the user already is, matching
ARC's established warn-and-confirm idiom (see [Workflow Shape](#workflow-shape) above for the
parallel pattern in uncommitted-work handling at pause time).

#### Integrate owns the terminal transition

A related question raised during the pre-PRD audit: **does `integrate-work-unit` or `/arc-shift`
own the final `→ Complete` state transition?** The resolution: **integrate owns it.**

- `/arc-shift` owns _mid-flight_ transitions: pause, resume, rotate. These are reversible and
  expose personal developer state changes while a WU is in flight.
- `integrate-work-unit` owns the terminal `→ Complete` transition. It is coupled to the merge
  operation and is not a "shift" — it is the close-out.

This is already implicitly true today (`clean-work-unit.md` Mode 2 performs the transition during
integrate's Step 2). The resolution does not move the transition; it preserves locality — the
workflow that finalizes the WU owns the final state write — while making the entry-state check
explicit upstream. `/arc-shift` never writes `State: Complete`.

#### Feedforward to implementation

The `integrate-work-unit.md` workflow needs a small, targeted edit during the modes WU
implementation phase: insert an explicit state-vocabulary read and acceptance-matrix check at the
top of Step 1, before the existing subtask/success-criteria validations. The existing Step 1
Status-header checkbox line becomes a natural landing for the matrix evaluation. No changes to
`clean-work-unit.md`. No changes to `/arc-shift`. The change is a small block of workflow prose
plus an updated checklist item in Step 1.

This is implementation-phase content; the task list will carry it as a concrete task when the PRD
generates it. No standalone ADR is expected — the decision is a behavioral extension of the
shift-lifecycle vocabulary already captured in the § Shift Lifecycle content above, and composes
with the shift-lifecycle ADR that Findings #8, #9, and #10 defer to PRD implementation.

### Why This Lives in Its Own Cross-Cutting Section

Shift was initially scoped as a Local-mode necessity — needed because Local Full's single-active
invariant would be too restrictive without it. But the gap it fills exists in tracked Full too, where
it's currently masked by implicit branch-switching. Making it explicit gives tracked Full something
it was missing: a formal model for "paused awaiting external progress" that the framework can reason
about, report on, and help manage.

This is why shift lives in its own cross-cutting section rather than inside the Local mode treatment.
It's universal.

### Out of Scope (For This Plan Doc Iteration)

- **Pause-reason taxonomy** — should reasons be freeform, or structured with categories (`awaiting-review`
  / `blocked-external` / `deferred` / `other`)? Freeform is simpler; structured enables better
  reporting. Revisit during detail design.
- **Cross-branch paused visibility in tracked Full** — is branch-local paused state sufficient, or
  should there be a way to see "all paused WUs across all branches" from one location? Lean
  branch-local for simplicity, revisit if team mode dogfooding says otherwise.
- **Expected-resume-date field** — useful context ("expected back Thursday") but potentially stale.
  Consider during detail design.

### Alignment with Work-Status Restructure WU

The Work-Status Restructure WU (see `prd-work-status-restructure.md` and
`notes-work-status-restructure.md`) changes the substrate this section
was originally designed against. Pre-restructure, state lived in task list `**Status:**`
headers (Pure Option C, 2026-04-09) because no per-WU `WORK-STATUS`-equivalent file
existed. Post-restructure, `**State:**` lives in a per-WU `status-{name}.md` file in
`active/{category}/`. The shift-lifecycle design survives the substrate change — only the
host field moves. The full re-validation record lives in
`notes-work-status-restructure.md` § Harmony with shift lifecycle;
this subsection captures the load-bearing points.

**Per-WU file harmonizes with metadata-in-place.** A paused WU's `status-{name}.md` stays
where it is; its files don't move; the `**State:**` field flips in place. Rolling back a
pause is still a metadata flip. Metadata-in-place is strengthened — status file and task
list live next to each other in `active/{category}/` and travel together under full
protection.

**Source-of-truth simplifies.** Pure Option C chose task list headers because no per-WU
status file existed. The restructure introduced `status-{name}.md` as the explicit per-WU
surface, so `**State:**` joins its existing field set (Branch / Task List / Next Task /
Last Completed / Blockers / Next Action) without new machinery. Task list `**Status:**`
header removal (R16) retires a redundant surface. Pure Option C's concerns remain fully
satisfied — the status file is per-WU and single-slot, not a cross-WU registry; no cache;
no session-init multi-WU noise; session-init still reads one file per WU.

**Ownership of terminal transition unchanged.** `integrate-work-unit.md` via
`clean-work-unit.md` Mode 2 still owns the `→ Complete` write — it now writes the status
file `**State:**` field instead of the task list `**Status:**` header. `/arc-shift` still
never writes `Complete`.

**Vocabulary unchanged.** The value set (`In Progress` / `Paused (date) — reason` /
`Waiting-For {category} (date) — reason` / `Complete`) is preserved verbatim. Only the
host field name changes (task list `**Status:**` → status file `**State:**`). Task 5.2 of
the restructure WU applied the mechanical swap throughout this section.

**Scenario battery re-validation.** The nine-scenario battery evaluated under
task-list-header-as-home carries forward under status-file-as-home — each scenario's
answer stays identical or simplifies:

- **Scenarios 1–4** (solo tracked, Local, team merge, person-to-person handoff): status
  files travel with branches just like task list headers did; same branch-local semantics
  and portability.
- **Scenario 5** (activate new while paused): new WU's status file is created with
  `State: In Progress`; paused WU's status file is untouched.
- **Scenario 7** (rotate): two status file `**State:**` writes, no separate per-branch
  pointer. _Simplifies_ — three writes pre-restructure become two.
- **Scenario 8** (resume after long pause): pause timestamp reads natively from the
  `State:` field.
- **Scenario 9** (waiting-for distinction): encoded as a specific `State:` value.

No scenario breaks under the substrate change.

**Mid-Session Orientation scope caveat.** The `## Mid-Session Orientation` section below
(and the `/arc-status` skill described there) retains its original pre-restructure
WORK-STATUS references. The `/arc-status` skill will be re-designed in its own PRD at
activation time; those references describe skill design thinking at the time of writing.
Read them as "the WU's status file" under the restructure premise — the underlying logic
(on-demand multi-WU awareness via a skill, session-init stays lean) is unchanged.

---

## Mid-Session Orientation

> **Scheduled for extraction to the Mobility WU** alongside the § Shift Lifecycle section
> above. `/arc-status` travels with shift because its Full-only "In flight" block is
> tightly coupled to shift vocabulary; the mode-universal core doesn't justify splitting
> the skill. See `plan-work-unit-mobility.md` § Extraction Scope.

Cross-cutting section for `/arc-status`, the mid-session "warm orient" skill. Mode-universal
(ships in both Lite and Full), complementary to the existing session-lifecycle skills
`/arc-resume` (cold orient at session start) and `/arc-handoff` (close session at end).

`/arc-status` is backed by `mid-session-status.md` (new workflow in `session-lifecycle/`). It
provides on-demand warm orientation — a concise snapshot of current work state composed from a
small targeted set of reads, distinct from the cold orientation session-init performs.

**Why this skill exists:** The most common use is a mid-session refresher when the developer
has stepped away, switched contexts, or wants a quick "where am I?" bookmark without restarting
the session — post-lunch, post-meeting, post-interruption. This is mode-universal; every ARC
project benefits from it. As a complementary use, the skill also hosts multi-WU visibility for
Full-mode projects running the [Shift Lifecycle](#shift-lifecycle) — surfacing paused and
`Waiting-For` WUs on demand. Multi-WU visibility was the original driver that justified creating
the skill, but is no longer its primary value proposition; it is scoped to Full specifically,
where the shift lifecycle applies at all.

**Slot in the session lifecycle:**

```text
/arc-resume    — cold orient at session start  (workflow: session-init.md)
/arc-status    — warm orient mid-session       (workflow: mid-session-status.md)
/arc-handoff   — close session at end          (workflow: session-handoff.md)
```

Three skills, three workflows, three lifecycle points. Symmetric and cleanly namespaced.

**Naming note:** The CLI-side rename that resolves the naming ambiguity happens across two WUs.
Session-Init Optimization renames the existing `arc status` CLI command (framework installation
health) to `arc health` (see `tasks-session-init-optimization.md` Task 3.R.k.a). The ARCd
Rebrand WU then sweeps `arc health` → `arcd health` as part of its global `arc` → `arcd` binary
rename. The skill is a slash-command invocation (`/arc-status`) and occupies a different
namespace from CLI binaries anyway, but the rename resolves the ambiguity at its root. See
`plan-arcd-rebrand.md` § Scope Sketch — Layer 2 (CLI command surface cleanup) for the reframed
rebrand-era scope.

**Output shape:**

The output has a mode-universal core and a Full-only supplemental block. Lite sessions
structurally never see the supplemental block; Full sessions see it only when paused or
`Waiting-For` state exists on the current branch.

```markdown
**Current focus** · `branch-name` · clean|dirty

- **Working on**: feature-x, Task 4.2 — Implement token validation
- **Since session start**: 3 tasks completed (Tasks 3.5, 4.0, 4.1), 2 commits landed
- **Uncommitted**: [files, if any] | none

**In flight** · [Full mode only; appears only when paused/Waiting-For state is present]

- **Paused**: incidental-auth-refactor (paused 2d ago — blocked on session token decision)
- **Waiting for**: feature-y (review from Alice, 1d ago)

**Next action**: Resume token validation in Task 4.2.b — schema check for malformed tokens

**Flags**: [blockers, quality gate state, stale assumptions, etc. — or omitted]
```

**Composition rules:**

- **Mode-conditional "In flight" block.** In Lite, the block is structurally absent — Lite has
  no concept of multi-WU state, so there is nothing to surface. In Full, the block appears only
  when paused or `Waiting-For` state is actually present on the current branch; single-WU Full
  sessions see the mode-universal core output without the supplemental block.
- **No blockers means no "Flags" block.** Only show what is load-bearing right now. The output
  is length-variable by design — a clean single-WU Lite session might be three lines; a multi-WU
  Full session with blockers might be ten. Either way, no noise.
- **Do not duplicate session-init.** If a line would repeat what `/arc-resume` already told
  the user, omit it. The skill's value is **what has changed or emerged since session-init** —
  completed tasks, new commits, shifts, drift, uncommitted mid-implementation state. If
  nothing has changed, say so tersely and suggest the next action without re-recapping.
- **Suggest, do not re-quote.** "Next action" in session-init comes from `WORK-STATUS.md`
  verbatim. "Next action" in `/arc-status` is composed from mid-session state — reflects what
  was just done, what is uncommitted, what the task list checkbox state implies next. Often
  the same as `WORK-STATUS.md`'s Next Action, often not.
- **Cheap enough to invoke freely.** Tens of milliseconds of reads, no heavy workflow
  machinery. Should feel lightweight enough that "let me just check" is reflexive.

**Input sources** (all targeted, none expensive):

Mode-universal:

1. `git status` + `git log HEAD@{session-start}..HEAD` — working-tree state, commits since
   session start
2. `WORK-STATUS.md` — current WU pointer (with drift detection against the task list header
   per the [Session-Init Integration](#session-init-integration) note)
3. **Current task list** (path from `WORK-STATUS.md`) — checkbox state of current phase, used
   to compute "what has been completed this session" by cross-referencing the checkbox
   transitions with the git log since session start
4. `SESSION-NOTES.md` Persistent Context section — for active constraints worth restating if
   relevant to the current state

Full mode only (feeds the supplemental "In flight" block):

5. **Scan of current-branch `active/`** for task list Status headers — surfaces `Paused` and
   `Waiting-For {category}` state for WUs other than the current focus. Lite does not scan;
   there is no concept of multiple task lists in a single Lite project.

**Use cases:**

- "I stepped out for lunch — what was I doing?" (post-context-switch bookmark, mode-universal)
- "I've been working for a while, quick check on where I am" (mid-session refresh, mode-universal)
- "What's next after this?" (looking ahead when the current unit lands, mode-universal)
- "I suspect my WORK-STATUS.md is stale — what does the world actually look like?" (drift
  detection, mode-universal)
- "What else do I have in flight?" (Full-mode multi-WU visibility on demand — the original
  driver, still supported)

**Out of scope for this skill:**

- Installation/framework health (that is `arcd health` post-rebrand)
- Team-aggregate view across developers (requires cross-identity git notes aggregation,
  deferred to external tooling or a future WU)
- Cross-branch paused-WU enumeration in tracked Full — by default the skill only sees
  current-branch state. A `--all-branches` opt-in flag (or equivalent agent behavior) can
  perform an on-demand git query for task lists with paused Status headers across all
  branches when the user explicitly asks. Pay-for-what-you-request.
- **Mode-fit detection or graduation prompting.** The skill reports current work state; it
  does not assess whether the project is "outgrowing" its current mode. Mode-fit communication
  lives in [Mode Fit Communication](#mode-fit-communication) below and is handled entirely
  through upfront framing, not runtime detection.

---

## Mode Fit Communication

ARC ships two installation types (Lite and Full) and two orthogonal infrastructure axes
(Tracked/Local). Users need to land in the right mode for their work — and, when work evolves,
find the transition path to a different mode without friction. This section specifies how mode
fit is communicated.

### Principle: upfront clarity, not runtime detection

**The framework does not detect mode mismatch and does not prompt users to switch modes.** No
guardrails, no growth nudges, no assessment steps baked into session-init or process-task-loop
or any workflow. Users choose their mode; if the choice turns out to be wrong, the transition
path is easy and well-documented. Paternalism is explicitly rejected.

The framework's responsibility is to make mode fit cases, boundaries, and transition paths
**highly discoverable** at the moments users naturally encounter the question — at install time,
at docs-reading time, and in conversation with an AI agent that has basic mode awareness.
Everything else is the user's call.

This principle applies symmetrically to related design space. Specifically, it rules out the
earlier-sketched WIP growth nudge for Full-mode paused-WU count (originally specified inside
`shift-work-unit.md`): framework does not count-and-advise on WIP. If WIP pressure becomes a
real observed problem in practice, an appropriately scaled response can be designed against
actual evidence rather than sight unseen.

### Communication surfaces

Mode fit communication is distributed across a small set of coordinated touchpoints, each
serving a different moment in the user's journey:

- **`arc init` mode-selection prompt.** First contact. Presents install type as a concise
  education-first prompt with both modes as equal peers — **ARC** (canonical, listed first)
  and **ARC Lite** (variant). **No pre-selected option.** Primer (~10–15 lines) gives each
  mode one-sentence framing plus 2–3 work-shape discriminator hints (concurrent concerns / PM
  needs / team coordination / multi-WU lifecycle → ARC; single focused effort / trial or
  evaluation → ARC Lite) and mentions the mode-switch escape hatch to reduce commitment
  anxiety. Points at the docs mode-overview page (below) for deeper reading. Non-interactive
  `arc init --yes` without an explicit `--install-type` / `--lite` / `--full` flag **errors
  out**; the CLI does not silently pick in automation contexts where no human is reading the
  primer. See [Resolved Decisions](#resolved-decisions) → "Default mode for `arc init` (OQ 9)"
  for full shape and rationale.
- **Lite `AGENT-BRIEFING.ARC.md` — light-touch mode awareness.** Short paragraph giving the
  agent passive knowledge that Lite exists as a variant, what its boundaries are, and that
  `arc mode switch --to full` is the transition path. **Passive knowledge, not active
  detection.** The agent can answer "should I consider switching to Full?" _when the user
  asks_, but does not proactively volunteer the suggestion or surface it in orientation.
  Full's `AGENT-BRIEFING.ARC.md` carries a symmetric paragraph for the reverse direction.
- **Lite PRD template Introduction guidance.** One-line note at the top of the template:
  "Lite is designed for bounded efforts you can hold in a single PRD and task list. For
  larger work, use Full (`arc mode switch --to full`)." Frames expectations at plan-writing
  time, the moment when over-scoping is most likely to manifest.
- **Lite task list template header / overview block.** A brief reinforcing note in the
  template scaffolding, parallel to the PRD template note. Reinforces the boundary at the
  moment the user is adding tasks.
- **Lite `README.md`** (if a Lite-specific README ships). User-facing first impression of
  what Lite is and isn't. Otherwise absorbed into the main README.
- **Documentation site — mode overview page.** Long-form explanation of the two installation
  types, their fit cases, how they differ structurally, and the transition paths in both
  directions. The authoritative source the other surfaces link to.
- **Documentation site — troubleshooting section.** Addresses the specific moments when users
  most commonly ask "am I in the wrong mode?" — "my Lite project feels cramped", "I have too
  many paused WUs in Full", "I keep wanting to separate concerns onto branches in Lite". Each
  entry describes the symptom, names the relevant mode-fit question, and points at the
  transition path. This is the concrete discovery surface users reach for when they suspect
  something is wrong.

### Consistency across surfaces

All surfaces convey the same core message, tuned for the context: **Lite is for bounded
efforts, Full is for larger work, transition in either direction is a single command away
(`arc mode switch --to lite` / `--to full`, specified in [Graduation / Downgrade
Paths](#graduation--downgrade-paths)), and the framework trusts you to judge the fit.** Wording
variations across surfaces are expected and desirable — copy gets tuned to the surface's
tone — but the substantive claims should not diverge.

### Scope boundary: architecture here, content in implementation

This section specifies the touchpoint list and the consistency principle. Actual copywriting
— exact prompt wording, briefing paragraph text, docs page content, troubleshooting entries —
is implementation-phase work. The PRD carries a single cross-cutting "Mode fit communication
surfaces" Requirement that unpacks into tasks for each touchpoint during task generation.

---

## Mode Combinations

**The four valid combinations form a 2×2 grid.** Lite/Full and Tracked/Local are orthogonal axes —
any combination is valid and each serves a distinct adoption context.

|          | Tracked                        | Local      |
|----------|--------------------------------|------------|
| **Full** | Full+tracked (current default) | Full+local |
| **Lite** | Lite+tracked                   | Lite+local |

### Collision-Free Composition

The two axes cut on orthogonal concerns:

- **Lite/Full axis** governs lifecycle ceremony. Lite removes the work unit lifecycle pipeline;
  Full keeps it. This axis does not touch git visibility or role.
- **Tracked/Local axis** governs git visibility and the team-collaboration surface. Tracked keeps
  role and commits ARC state to the repo; Local drops role and keeps `.arc/` untracked. This axis
  does not touch lifecycle ceremony.

Because the axes cut on different concerns, the four combinations compose without conflict. Each
mode layer contributes its own deletions and overrides independently; when combined, both layers
apply. Worked examples:

- **Full+tracked** → baseline, nothing removed
- **Full+local** → Local layer drops role, sets up exclusion + backing store; lifecycle intact
- **Lite+tracked** → Lite layer removes lifecycle, keeps role (OSS solo-dev scenario); tracked intact
- **Lite+local** → both layers apply: no lifecycle, no role, `.arc/` untracked, backing store required

### Local Mode and Contributor Mode Are Alternatives, Not Compositions

Local mode and contributor mode (per `ADR-014`) both answer the question "I want ARC in a
repository whose tracked state I don't own." They achieve this through different mechanisms —
Local mode excludes `.arc/` from git tracking via `.git/info/exclude`; contributor mode
piggybacks on upstream's already-gitignored `user/{identity}/` subtree and runs a personal
planning pipeline there (see `AGENT-BRIEFING.CONTRIBUTOR.md`).

**The two are selected by upstream context, not stacked:**

- **Upstream is NOT an ARC project** → Local mode is the answer. There is no upstream `.arc/`
  to collide with; the Local mode exclusion mechanism works as designed.
- **Upstream IS an ARC project** → contributor mode is the answer. Upstream's `.arc/` is
  already present and the contributor's personal workspace at `user/{identity}/` is already
  gitignored by upstream's tracked `.gitignore`. Contributor mode subsumes Local mode's value
  proposition in this context, with zero directory collision and no need for a separate
  backing store (git notes portability covers the user directory).

The "nested Local mode inside an ARC upstream" scenario is explicitly not supported — it would
require either colliding `.arc/` installs or a novel nested-install pattern that is not
idiomatic in the wider tooling ecosystem. The `arc.role = contributor` path handles the
motivating use case (OSS contribution to an ARC-using project) without the collision.

See `analysis-modes-contributor-lifecycle-stress-test.md` § S6 for the full derivation.

### Walk-Through: Lite+Local

This combination wasn't explicitly designed — it falls out of the orthogonal axes. Walking through
what it actually looks like:

- `.arc/` exists in working tree, untracked via `.git/info/exclude`
- Contains: `active/prd.md`, `active/tasks.md`, `active/status.md`,
  `user/{identity}/SESSION-NOTES.md`, plus reference/system/constitutional content
- No `backlog/`, no `suspended/`, no `feature/` subdirs, no lifecycle workflows (Lite's contribution)
- No `arc.role` in config, Local-mode context footer pattern, role resolution skipped (Local's
  contribution)
- Backing store at `~/.arc-state/{project-id}.git` captures all of the above
- Hooks enforce the standard quality gates and the Local-mode context footer pattern
- Session-init loads the Lite document set, skips lifecycle discovery, reports on the single effort
- Single-active-unit invariant is trivially satisfied — Lite is already single-effort by design
- Shift lifecycle is not present — there are no parallel work units to shift between

This is arguably the **smallest, most focused ARC install possible:** execution discipline,
spec-directed development (via the Lite PRD), session continuity, quality gates, everything backed
up reliably, zero footprint in the project repo. It's potentially the best "try ARC in five minutes
on a work project" story — and maybe the most-recommended first install for a large audience.

### Graduation Grid

Graduation happens along either axis:

```text
Lite+tracked ──────▶ Full+tracked
     ▲                    ▲
     │                    │
Lite+local  ──────▶ Full+local
```

**Four axis movements** (see [Graduation / Downgrade Paths](#graduation--downgrade-paths) for the
full specification of Lite↔Full transitions):

1. **Lite → Full (tracked):** `arc mode switch --to full`. Adds work unit lifecycle, relocates
   task list and Lite PRD into `active/feature/`, backlog infrastructure installed if
   `pm.layer: arc-pm` selected
2. **Local → tracked (Lite variant):** remove exclusion entry, `git add .arc/`, standard commit;
   role concept becomes available (reconfigure may prompt for it)
3. **Local → tracked (Full variant):** same as above, plus lifecycle artifacts already present
4. **Lite → Full (local variant):** `arc mode switch --to full` while keeping exclusion and
   backing store

Diagonal graduations (e.g., Lite+local → Full+tracked) are compositions of two axis moves, done
sequentially, not as a single composite operation. The CLI does not ship a diagonal-graduation
shortcut; each axis movement is its own `reconfigure` invocation with its own confirmation step.

**Lite+local as a starting point:** Because graduation is reversible along each axis independently,
starting in Lite+local commits the developer to nothing. If the project grows, graduate along
whichever axis is relevant (tracking first if the team accepts it, lifecycle first if scope grows).
If the project stays small and local-only, no graduation needed.

### Init Flow Implications

`arc init` asks two independent questions in sequence:

1. **Install type:** Lite or Full? (structural choice — lifecycle or not)
2. **Tracking:** Tracked or Local? (visibility choice — in-repo or personal)

Order matters only modestly — install type first establishes the bigger structural decision; tracking
is then applied as an overlay. The questions are independent: no combination is invalid, no earlier
answer closes off a later choice.

The install-type question enters the init prompt sequence as a new recipe prompt at position 2
(after `project_name`, before `tools`), and gates `pm.layer` / `team.enabled` on
`install.type == full`. See [Prompt Orchestration and Recipe
Authority](#prompt-orchestration-and-recipe-authority) for the mechanism — schema delta, helper
contract, wire points, and drift mitigation.

Flags for non-interactive use:

- `--install-type <lite|full>` (canonical; **no implicit default** — `arc init --yes` without
  this flag or a shorthand alias errors out with an instruction to specify. See [Resolved
  Decisions](#resolved-decisions) → "Default mode for `arc init` (OQ 9)")
- `--lite` / `--full` (shorthand aliases for `--install-type`; mutually exclusive)
- `--local` / `--tracked` (default: tracked, the common case)
- `--shared-gitignore` (Local only, opt-in for teams that welcome tool-specific tracked entries)

**Init preconditions (both modes).** `arc init` requires a git repository to operate. The CLI installs
hooks in `.git/hooks/` and (in Local mode) writes `.git/info/exclude`; both paths assume `.git/` exists.
When `arc init` runs in a directory with no `.git/`, the CLI prompts "This directory is not a git
repository. ARC requires git for hooks and related setup. Initialize git now? [Y/n]" — default yes. On
yes, the CLI runs `git init` and proceeds with the normal init flow (in Local mode, tertiary UUID fires
because no commits exist yet). On no, the CLI exits cleanly with "ARC requires a git repository. Run
`git init` first." Auto-init-without-prompt is rejected as too aggressive (modifies the user's directory
beyond their stated intent); hard-refuse is rejected as user-hostile on quick-start paths. Prompt-to-init
respects agency and matches ARC's "asks before acting" ethos. Resolves Audit A sub-finding H3-N7.

---

## Reference Material

Planning reference material — content audit, deliverables inventory, resolved decisions,
and research findings. Loaded on demand during PRD authoring and implementation planning
rather than read front-to-back.

---

### Content Audit

Once detail design begins, audit all framework domains to classify each file, concept, and setting
by mode applicability. Uses the methodology/implementation classification from the Methodology
Maturation work unit and the conditional content analysis
(`analysis-conditional-content-architecture.md`) as its foundation.

**Categories:**

- **Unchanged**: Works identically across all modes (e.g., hooks, commit format methods, most dev rules)
- **Modified**: Present but adapted (e.g., session-init with simpler discovery in Lite, context footer
  behavior in local mode, process-task-loop without work unit lifecycle references)
- **Excluded**: Not installed or loaded (e.g., strategy-team-coordination in Lite, backlog files
  in Lite, activation/archival workflows in Lite)
- **Relocated**: Same content, different tracking (e.g., WORK-STATUS in local mode — same file, untracked)

**Audit domains:**

- **Strategy documents** — applicability per mode, which sections load on-demand
- **Workflow documents** — same content or mode-aware variants; shift lifecycle additions
- **Constitutional documents** — DEV-RULES sections referencing work unit concepts and role
- **Session-init document set** — what loads in each mode, in what order
- **Templates installed by `arc init`** — per-mode file inclusion/exclusion
- **CLI commands** — available, hidden, or guarded by install mode; separate purpose-built
  command families per install mode (tracked: `arc user *` + `arc sync`; Local: `arcd backing *`).
  No cross-mode redirects — see [Durability-Layer Commands](#durability-layer-commands)
- **Configurability architecture** — `ARCd-config.yml` settings per mode, forced values, omitted
  options, repurposed semantics, forbidden combinations. Feeds the Lite and Local mode config
  templates and CLI init-time validation. (Note: the `pm.mode` rename's mechanical sweep is handled
  in the ARCd Rebrand WU.)
- **Lifecycle transitions** — shift workflow, status header updates across PRDs and task lists,
  WORK-STATUS In Flight registry, session-init reporting changes

#### Strategy Applicability Mapping

Each of the 10 framework strategies in `.arc/reference/strategies/arc/` is classified by
applicability in Lite. Full mode is the baseline — every strategy applies in Full unless
explicitly noted.

Three categories:

- **applies-as-is** — works in Lite unchanged. Phrasing sweep may touch sentence-level references;
  no content variants.
- **needs-variant** — applies in part. Inline `<!-- arc:if install.type == full -->` blocks carve
  out Full-only sections, same mechanism as
  [`ARCd-config.template.yml`](#lite-config-template-mechanism).
- **excluded** — not installed in Lite. Lands in the `install.type == full` bucket per
  [Installation Type Recipe Mechanism](#installation-type-recipe-mechanism), or excluded by
  composition (gated on another mode axis).

| Strategy                                | Category               | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
|-----------------------------------------|------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `strategy-adr-methodology`              | applies-as-is          | ADRs are methodology-level and work at any project size. `reference/adr/` ships in both modes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `strategy-configurability-architecture` | applies-as-is          | Config + methods + extensions model is universal. Both modes ship an `ARCd-config.yml` (Lite via `arc:if`-gated template). Single-row drift fix landed via Finding #12/R6 (2026-04-13): Convention inventory Document hierarchy row reframed to dual-value entry (Full: META-PRD → PRD → tasks; Lite: PRD → tasks, optional combined META-PRD). Mode-aware prose, no `arc:if` gate — strategy is on-demand reference content, not per-session load. L104 Context footer row drift on the Local/Tracked axis is deferred to the future Local-axis work. Tier 4 audit (2026-04-13) surfaced additional drift at L229-231 § Structural vs. runtime settings: the list enumerates `pm.layer`, `team.enabled`, `project_name` as structural settings triggering `arc init --reconfigure` but misses `install.type` and `backing.type` — both are structural per Modes WU design. Minor list additions; mechanism deferred to implementation time. Classification holds at applies-as-is.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `strategy-file-classification`          | applies-as-is          | Taxonomy (Framework / Configurable / Scaffolded / Project-Owned) and naming conventions are universal. Tier 4 audit (2026-04-13) surfaced minor drift in two example lists and one section: L47 Scaffolded examples (`META-PRD, PROJECT-STATUS, WORK-STATUS, ROADMAP, backlog files`) and L73 ALL-CAPS examples mix universal and Full/arc-pm-only entries; L168-173 § Directory naming section describes Full-only category structure (`feature/` / `technical/` / `incidental/` across `active/`, `backlog/`, `archive/` with `{NN}_` global completion numbering). Mode-aware prose tweaks to accommodate all modes; mechanism deferred to implementation time. Classification holds at applies-as-is.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `strategy-planning-module`              | excluded (composition) | Installs only under `pm.layer: arc-pm`. Lite forces `pm.layer: none` via the `install.type == full` prompt gate. Structurally absent in Lite regardless of recipe bucket.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `strategy-quality-gates`                | applies-as-is          | Tier 1/2/3 model is universal. Coherent-unit checkpoints may degrade toward Tier 1 in single-phase Lite lists; strategy still applies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `strategy-session-operations`           | needs-variant          | Core loading model (T1/T2/T3), classification criteria, monitoring, auto-compaction, portability are universal. Two in-doc tables require mode-aware edits: (1) State-Conditional Promotion trigger currently says `Following Task List: Yes + Next Task populated` — becomes `Next Task populated + task list file exists` (universally phrased) after Finding #4's uniform FTL removal, no further gating needed on this row; (2) Method Classification by Trigger row for `pre-merge-review` / `review-triage` uses dual-value entry (Full: `integrate-work-unit`; Lite: `verify-work.md` ship step). Mode-aware prose + dual-value table row, no `arc:if` gating (strategy is on-demand reference content, not per-session load). Reclassified from applies-as-is 2026-04-11 during Finding #4 resolution — see [Lite Session Management](#lite-session-management). Tier 4 audit (2026-04-13) surfaced additional install.type and Local-axis drift: (install.type) L59 T3 example bullet `(prepare-commits, integrate-work-unit)` and L170 illustrative sentence "the integrate-work-unit workflow checks pre-merge-review before merging" name Full-only `integrate-work-unit` in otherwise-universal prose — same mechanism-of-drift as the Method Classification row; (Local) § Session State Portability (L211-246, ~35 lines) describes the git notes mechanism and `arc user save/load/push/pull` / `arc sync` commands — entirely tracked-mode content under the Audit A H2 resolution (purpose-built `arcd backing *` family, not redirected — see Resolved Decision "Durability-layer commands (Audit A H2)"). Mechanism change from the pre-H2 "section-intro callout or inline dual-value explanation" plan: the section hard-gates out under `arc:if backing.type == tracked`, and a new § Backing Store Durability Layer section gates in under `arc:if backing.type == local` covering the `arcd backing *` command family. Dual-gated section swap, not inline dual-value prose. Mechanism decision captured here; exact section wording deferred to implementation time. Classification holds at needs-variant. |
| `strategy-task-list-formatting`         | needs-variant          | Core formatting universal; Finding #2's surgical enumeration identified four Full-coupled surfaces requiring `arc:if` gating: (1) Verification Phase example block (pointer is `verify-work-unit.md` in Full, `verify-work.md` in Lite); (2) Atomic Companion File archival sub-rule and "all work unit types" phrasing; (3) Status value `Paused` (rides on Full-only shift lifecycle); (4) Status value `Integrated` (rides on Full-only archival). Atomic companion filename (`atomic-{wu-name}.md` Full, `atomic-tasks.md` Lite) handled via mode-aware naming-rule prose, no gate. Reclassified from applies-as-is 2026-04-11 during Finding #2 resolution — see [The Lite Task List](#the-lite-task-list). Tier 4 audit (2026-04-13) surfaced additional scope not captured by Finding #2's surgical enumeration: (a) **Incidental Task Lists subsection (L107-197, ~90 lines) entirely Full-only** — `Incidental:` title prefix, Context section with Discovered/Interrupts/Problem/Why Now, Paused At/Paused To pointers, and example with `incidental/cli-output-encoding` branch all reference Full-only concepts (Lite has no incidental task list concept per Finding #5 — multi-step incidental folds into the main `tasks.md`); (b) **Feature/Technical Task Lists subsection (L55-105, partial)** has Full-only content in title format (`# Task List: [Feature/Technical Name]` with category prefix), branch format (`{feature\|technical}/[branch-name]`), PRD path (`{feature\|technical}/prd-[name].md`), and Branch(es) rule at L95-97 referencing stacked PRs and team sub-branches — all Full-only per Finding #2's own Lite header-field spec at § The Lite Task List. Task Ownership Markers section (L461-493) stays universal — prose-gated by `team.enabled: true`, and Lite forces `team.enabled: false`, so prose gating is sufficient per strategy audit policy (no redundant `arc:if` gates on strategies when an orthogonal axis already self-disables the section). Classification holds at needs-variant; mechanism decisions deferred to implementation time.                                     |
| `strategy-team-coordination`            | excluded               | Entirely multi-dev. Lite forces `team.enabled: false`, so the content has zero operational relevance. Lands in the `install.type == full` bucket; graduation via `arc mode switch --to full` installs it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `strategy-work-organization`            | needs-variant          | **Strategy is ~72% Full-coupled by line count.** Tier 4 audit (2026-04-13) expanded scope from Finding #6's narrow "Branch Protection Modes is universal" framing to the full set of affected sections: Work Categories (L28-65, ~38 lines — feature/technical/incidental taxonomy with category-based directory paths and branch prefixes), Decision Rules (L68-94, ~27 lines — two-step classification tree feeding category outputs), Task Lists and Branches (L97-125, partial ~29 lines — multi-branch patterns including stacked PRs, team sub-branches, phased delivery; WORK-STATUS merge behavior referencing `rotate-branch` and `archive-work-unit`), Incidental Work Model (L128-202, ~75 lines — entire section Full-only; Lite has no incidental WU concept per Finding #5), Planning Branch Workflow (L252-311, ~60 lines — Lite has no planning branches, `backlog/` directory, or `activate-work-unit` workflow), Directory Structure (L314-362, ~49 lines — Full-only category subdirectories in `active/` / `archive/`, `{NN}_` global completion numbering). Branch Protection Modes (L205-248, ~44 lines) retained as universal git convention per Finding #6's earlier scope refinement. Classification holds at needs-variant — but with much broader drift than originally scoped. Local-axis impact minimal: work organization shape applies regardless of storage backend. Mechanism decisions deferred to implementation time.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `strategy-work-planning`                | needs-variant          | **Most sections universal.** Planning Pipeline (fidelity-progression concept and principle), Plan Documents lifecycle and purpose, Discovery Checklist, PRD Readiness, PRD Conventions, Anti-Patterns all apply in both modes. Tier 4 audit (2026-04-13) narrowed drift from Finding #6's broader framing to ~6-10% of the file: (a) Plan Documents § Convention (L73-80, L132) uses `{category}` directory paths that don't apply in Lite — per Resolved Decision "Lite `plan-*` doc location", Lite uses flat `.arc/active/plan-{name}.md`; (b) PRD Conventions references to "work unit" terminology (L194, L204) don't fit Lite's bounded-effort framing per Finding #2. Supplemental Files section is universal — same convention applies in Lite with different directory location. Classification holds at needs-variant — drift is narrow but real (path/terminology-level). Mechanism decisions deferred to implementation time.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

**Mechanism for needs-variant strategies:** Inline `<!-- arc:if install.type == full -->` blocks
around Full-only sections. No file duplication; same render pipeline that handles
`ARCd-config.template.yml` (see [Lite Config Template Mechanism](#lite-config-template-mechanism)
and the Resolved Decision "Render pipeline already extension-agnostic"). The needs-variant
strategy files are renamed with a `.template.md` suffix so `needsRendering()` picks them up at
install and update time.

**Mechanism for excluded strategies:** Listed in the recipe under the `install.type == full`
condition bucket alongside other Full-only files. `resolveFileList()` handles the exclusion per
the existing implementation — no code changes beyond recipe content.

**Composition with the Lite PRD:** The Lite `create-prd` workflow (Step 3) references
`strategy-work-planning.md` § Discovery Checklist. In Lite, the reference resolves to the
rendered template where the Full-only sections are absent. Both modes consult the same canonical
source — no divergent Lite strategy variant to maintain.

**Follow-on implications for Findings #2, #4, #5:**

- **Finding #2 (Lite task list shape):** Resolved 2026-04-11. `strategy-task-list-formatting`
  reclassified applies-as-is → needs-variant (four Full-coupled surfaces surfaced during spec
  design — see rationale cell above). Lite task list design: phases required (min 2),
  verification phase points to `verify-work.md` (new Lite-only workflow, parallel to Full's
  `verify-work-unit.md`), atomic companion named `atomic-tasks.md`, header `Status:` values
  restricted to `{Pending | In Progress | Complete}`. See [The Lite Task List](#the-lite-task-list)
  for the full template spec.
- **Finding #4 (Lite session management):** Resolved 2026-04-11. `strategy-session-operations`
  reclassified applies-as-is → needs-variant (two in-doc tables require mode-aware edits — see
  rationale cell above). Session-init and session-handoff use single-file-with-`arc:if`
  mechanism via `.template.md` rename; `Following Task List` field drops from both Lite and
  Full uniformly; Lite WORK-STATUS tracks five fields. See
  [Lite Session Management](#lite-session-management) for the full spec.
- **Finding #5 (Lite process-task-loop):** Resolved 2026-04-13. Mechanism reversed from two-file variant
  (Mechanism A) to single-file-with-`arc:if` (Mechanism B), paralleling Finding #4's session management
  resolution. The 2026-04-10 "noise in core operating doc" argument against conditionals applied to
  Mechanism C (runtime in-prose) but not to B (install-time stripping). Four gated surfaces on the
  `install.type` axis in `3_process-task-loop.template.md` (already a template via pre-existing
  `team.enabled` / `pm.layer` gates): branch/task-list coupling, verification phase pointer, Next Step →
  `integrate-work-unit` section, and the Incidental Work Management section (multi-gate within).
  `strategy-quality-gates` confirmed applies-as-is after targeted drift-check — no in-doc tables or
  example blocks referencing Full-only workflows. The concept-not-content drift pattern did not hit
  three-of-three. Strategy count stays **4 / 4 / 2**. See
  [Lite Process-Task-Loop](#lite-process-task-loop).
- **Finding #12/R6 (Lite initial-setup workflows):** Resolved 2026-04-13. Mechanism A (purpose-built
  distinct files per mode) adopted over Mechanism B after strip analysis surfaced ~35-40% Lite-Full
  overlap — inverse of Finding #5's ~85-90% and Finding #4's ~60%. Low overlap flips the overlap-ratio
  heuristic: at this level, B produces brittle files with 60-75% content in whole-section `arc:if`
  blocks, and A is structurally honest about the different intent. Full's `01_verify-and-configure.md`
  and `02_define-project.md` move out of Finding #8's implicit unconditional baseline into the
  `install.type == full` recipe bucket; new purpose-built `01_setup-lite.md` lands under
  `install.type == lite`. Template layer also applies Mechanism A: Full's `META-PRD.template.md`
  unchanged; new `META-PRD.lite.template.md` combines product direction and technical overview content
  as an **opt-in** template (agent-led during setup, not in any recipe bucket). Lightly reopens
  Finding #8 META-PRD commitment — default Lite install still has no META-PRD; opt-in path
  available. `strategy-configurability-architecture` classification holds at applies-as-is with a
  single-row drift fix (L87 Convention inventory Document hierarchy reframed to dual-value). L104
  Context footer row drift belongs to the future Local/Tracked axis work. Strategy count stays
  **4 / 4 / 2**. **Drift-check pattern update:** 3-of-4 hit rate (~75%) across targeted drift-checks
  promotes a formal strategy audit pass to Tier 4 — single comprehensive sweep before closing pre-PRD.
  Folded-in drift fix on Full's `01_verify-and-configure.md` L38: remove residual `Following Task List: No`
  line from the Verify Session State example block (missed by Finding #4's FTL removal sweep). See
  [Lite Initial Setup](#lite-initial-setup).

#### Phrasing Sweep (Mode-Aware Content Updates)

Classification is one activity; phrasing sweep is a distinct activity. Classification answers
"does this apply to Lite?" — phrasing sweep answers "does this sentence need rewording even where
it applies?"

A substantial amount of pre-existing content assumes Full+tracked implicitly through its phrasing.
Once mode design decisions are finalized, a sweep pass updates the wording to be mode-aware (or
mode-neutral where the content applies universally).

**Categories of content needing phrasing updates:**

- **Strategy docs** that say "work units flow through the lifecycle pipeline" or similar —
  acknowledge Lite has no lifecycle
- **Constitutional docs** (DEV-RULES.ARC, DEV-RULES.PROJECT) referencing backlog, activation,
  integration as universal — add mode qualifiers or reframe as Full-only
- **Workflow docs** (process-task-loop, session-init, session-handoff) referencing concepts that
  don't exist in Lite or behave differently in Local
- **QUICK-REFERENCE** needs mode-branched command-family documentation — tracked mode
  documents `arc user *` and `arc sync`; Local mode documents `arcd backing *`. No command is
  shared across modes; each family is an `arc:if`-gated block in the template
- **Agent briefings** describing the session state mechanism as tracked-plus-gitignored — Local
  mode changes this
- **Config schema comments** in `ARCd-config.yml` describing settings that don't apply in all modes
- **Role-related content** acknowledging role is Tracked-only (Full+tracked and Lite+tracked),
  dropped in Local
- **Session state portability** content (git notes layer) acknowledging Local mode uses backing
  store instead

**What this sweep is NOT:**

- Not the mechanical ARCd/ARC language sweep — that lives in the rebrand WU
- Not the mechanical `pm.mode: arc-in-git` → `arc-pm` references sweep — also in the rebrand WU
- Not a classification exercise (that's the audit above)

**Timing:** This sweep cannot begin until mode design decisions are locked in. It's implementation
work, scheduled near the end of the modes WU so it benefits from settled decisions. The audit
classification runs earlier and feeds into this sweep by identifying which files are in scope and
what changes each needs.

---

### Consolidated Deliverables Inventory

Rolled-up reference surface for what the PRD derived from this plan doc will deliver. Grouped by
domain for PRD structuring convenience, not by Finding number. Each group names the deliverables
and cross-references the plan-doc section that specifies the mechanism or design.

**This section is a reference surface**, not a source-of-truth for decisions. Authoritative design
lives in the sections referenced; authoritative decision history lives in § Resolved Decisions. When
this inventory drifts from those sources, trust the sources. Maintenance protocol: update this
inventory when a new finding lands that adds or removes a deliverable; no other triggers.

**Item count:** ~59 discrete deliverables across 10 domains. Sizing is out of scope for this
inventory — the content audit classification (§ Content sweep item 56) produces sizing as its
in-flight output at implementation time, not as a pre-PRD estimate. Scope boundary B4 (the
earlier "no consolidated deliverable inventory" gap) is resolved by this section.

#### CLI and schema

1. **Manifest schema bump** — add required `install_type: string` field on `InstallConfig`. Legacy
   migration: pre-`install_type` manifests default to `"full"`. See [Installation Type Recipe
   Mechanism](#installation-type-recipe-mechanism) § Decided mechanism.
2. **`buildConfigMap()` plumbing** — flatten `install_type → install.type` (one-line addition,
   parallels existing `pm_mode → pm.mode`). See [Installation Type Recipe
   Mechanism](#installation-type-recipe-mechanism) § Decided mechanism.
3. **Recipe `show_when` field** — new optional field on `RecipePrompt`, reusing `evaluateCondition()`
   and `CONDITION_PATTERN` grammar. Validator extension: single regex check. See [Prompt
   Orchestration and Recipe Authority](#prompt-orchestration-and-recipe-authority).
4. **`shouldShowPrompt()` helper** — new pure function in `lib/template/recipe.ts`, partial-config
   safe via existing undefined-key handling.
5. **`buildConfigMap` / `buildConfigKeyOverrides` / `buildTokenMap` refactor** — iterate
   `recipe.prompts` for config-key and token mapping instead of hardcoded constants. `user.sync_push`
   derivation and `REPO_ROOT` computed token stay in code.
6. **Drift-mitigation unit tests** — compare recipe prompt IDs to exported `INIT_PROMPT_IDS` /
   `RECONFIGURE_PROMPT_IDS` constants maintained alongside hand-rolled loops.
7. **`install.type` prompt** — added to recipe at position 2 (after `project_name`, before `tools`).
   Default `"full"`. `pm_mode` and `team_mode` gated on `install.type == full`.
8. **CLI flag** — `--install-type <lite|full>` canonical; `--lite` / `--full` shorthand aliases,
   mutually exclusive.
9. **New CLI command: `arc mode switch --to <lite|full>`** — distinct command module under new
   `mode` namespace, extensible for the Local/Tracked axis later. Symmetric for both directions.
   Shape γ: deterministic parts in CLI (manifest rewrite, file removal, config re-render, Cat A/B
   orphans, C1 grep sweep). Reuses `buildChangePlan` / `applyChangePlan` / `resolveRemovalsInteractive`
   internally. Does NOT share reconfigure's prompt loop. See [Graduation / Downgrade
   Paths](#graduation--downgrade-paths).
10. **Full → Lite entry-state gate** — refuse when `>1` active work unit. User must shift extras to
    `Paused` or archive them first.
11. **Full → Lite orphan taxonomy handling** — Cat A (manifest-tracked excluded files) via existing
    `buildChangePlan` + `resolveRemovalsInteractive`; Cat B (runtime user artifacts not in manifest)
    via filesystem walk reported per-top-level directory; C1 (stale path refs) via grep sweep; C2
    (conceptual decay) via advisory workflow review pass.
12. **Constants rename** — `ARC_CONFIG_TEMPLATE_PATH` flips from `"system/ARCd-config.yml"` to
    `"system/ARCd-config.template.yml"` in `lib/constants.ts`; `CONFIGURABLE_FILES` set entry in
    `lib/classification.ts` matches.
13. **Local mode setup** — `.git/info/exclude` automation (primary), opt-in tracked `.gitignore` via
    `--shared-gitignore` flag. See [Exclusion Mechanism](#exclusion-mechanism).
14. **Backing store** — auto-created non-bare git clone at `~/.arc-state/{project-id}/`; sync at
    session handoff via `git add -A` + commit inside the clone's working directory (not bare).
    Durability + re-clone detection signal; opt-in remote for cross-machine portability; failure
    at sync reports but does not block handoff. Project ID via three-step fallback chain: git
    remote URL (primary), first-commit hash (secondary), generated UUID at
    `.arc/system/.internal/project-id` (tertiary, for zero-commit no-remote repos, sticky once
    adopted). Explicit `arc project-id migrate` escape hatch available at impl time for
    developers who want to rekey after graduation. See [Backing Store](#backing-store) and
    [Re-Clone UX](#re-clone-ux) § Project identity.
15. **Re-clone recovery flow** — one-prompt restoration triggered when backing-store exists but
    `.arc/` and the exclude entry are absent. See [Re-Clone UX](#re-clone-ux).
16. **Forbidden-combinations validation** — CLI-enforced at init and mode switch. See [Forbidden
    Combinations](#forbidden-combinations).

#### Workflows (new files)

17. **`system/workflows/arc/initial-setup/01_setup-lite.md`** — purpose-built Lite initial setup
    (~100-130 lines). Four-step structure: Verify Install, Populate Session-Loaded Docs, Optional
    META-PRD, Light Customization Awareness. Under `install.type == lite` recipe bucket. See [Lite
    Initial Setup](#lite-initial-setup).
18. **`system/workflows/arc/verify-work.md`** — Lite verification workflow, parallel to Full's
    `verify-work-unit.md`. Under `install.type == lite` bucket. Three-step ship protocol: Success
    Criteria check → Tier 3 gates → aggregate diff review. See [The Lite Task
    List](#the-lite-task-list) § Verification phase.
19. **`system/workflows/arc/supplemental/switch-mode.md`** — advisory workflow for mode-switch CLI
    companion (Shape γ). Handles C2 conceptual-decay review pass in surviving user content. Landing
    alongside other framework-level supplemental workflows. See [Graduation / Downgrade
    Paths](#graduation--downgrade-paths).
20. **`system/workflows/arc/shift-work-unit.md`** — new workflow for `/arc-shift` skill. State
    transitions (Paused, Waiting-For, resume, rotate), uncommitted-work handling, and
    shift-with-activation coordination protocol (Finding #14). Coordination shape locked
    pre-PRD: one confirmation at invocation, sequential walk across pause + activate, pause is
    the clean failure boundary — **not** a two-step conversation, not a silent auto-handoff.
    Also includes the **1-week staleness advisory** (OQ 13) on the resume side. See [Shift
    Lifecycle](#shift-lifecycle) § Workflow Shape.

#### Workflows (modified files, all via `.template.*` rename + inline `arc:if` gates)

21. **`system/workflows/arc/initial-setup/01_verify-and-configure.md`** → `install.type == full`
    recipe bucket (reassigned from implicit baseline). Fold-in: remove residual
    `**Following Task List**: No` line at L38 from Finding #4 FTL removal sweep miss.
22. **`system/workflows/arc/initial-setup/02_define-project.md`** → `install.type == full` recipe
    bucket. Already had `pm.layer` gates from prior work.
23. **`system/workflows/arc/session-lifecycle/session-init.template.md`** — rename + 4 inline
    `arc:if install.type == full` blocks (Step 2 Item 8 WORK-STATUS field enumeration, Step 2 Item 10
    task list path resolution, Step 5 work-unit-discovery subsection, contributor-role + team-mode
    trust hierarchy example). See [Lite Session Management](#lite-session-management).
24. **`system/workflows/arc/session-lifecycle/session-handoff.template.md`** — rename + inline
    `arc:if backing.type == tracked` / `arc:if backing.type == local` block pair on the persist
    step. § Save to Git Notes renamed § Save to Durability Layer; tracked branch invokes
    `arc sync` / `arc user save` / `arc user push` per `user.sync_push`; Local branch invokes
    `arcd backing sync` (which handles push internally per the same config). Gate scope is the
    persist subsection only; surrounding workflow content (WORK-STATUS update, commit protocol,
    handoff summary) is mode-universal. See [Durability-Layer Commands](#durability-layer-commands).
25. **`system/workflows/arc/3_process-task-loop.template.md`** — layered `install.type` gates on 4
    regions (branch/task-list coupling bullet, Verification Phase pointer, Next Step section,
    Incidental Work Management multi-gate). Composes orthogonally with existing `pm.layer` /
    `team.enabled` gates. ~85-90% of file remains universal. See [Lite
    Process-Task-Loop](#lite-process-task-loop).
26. **`system/workflows/arc/work-unit-lifecycle/*`** (8 files) — entire directory assigned to
    `install.type == full` recipe bucket. No per-file template gates needed.
27. **`system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md`** — entry-contract extension
    for shift states (accepts `In Progress`, `Complete`, and all `Waiting-For {category}` values;
    warn-and-confirm inline for `Paused`). Terminal `→ Complete` transition owned here via
    `clean-work-unit.md` Mode 2. See [Integration Interaction with Shift
    States](#integration-interaction-with-shift-states).

#### Templates

28. **`reference/META-PRD.template.md`** → `install.type == full` recipe bucket (default Lite
    install has no META-PRD).
29. **`reference/META-PRD.lite.template.md`** (NEW, opt-in) — Lite variant combining product
    direction + technical overview content (~80-120 lines). **Not in any recipe bucket** — opt-in
    installation is a separate CLI operation appending to the manifest. Installed agent-led during
    `01_setup-lite.md` Step 3. See [Lite Initial Setup](#lite-initial-setup) § Optional Lite
    META-PRD.
30. **`system/ARCd-config.template.yml`** (renamed from `system/ARCd-config.yml`) — inline
    `arc:if install.type == full` around `# --- Project Management ---` / `pm.layer` and
    `# --- Team Mode ---` / `team.enabled` sections. Composition order:
    `renderConfigOverrides(renderConditionals(renderTokens(...)))`. See [Lite Config Template
    Mechanism](#lite-config-template-mechanism).
31. **`reference/template-prd.md`** — stays in unconditional baseline, gains inline `arc:if` for
    Lite-vs-Full variant. Finding #1 resolution via consistency with arc-config approach. See [The
    Lite PRD](#the-lite-prd).
32. **Lite PRD template cuts** — drops `Type:` header field, `Status/Related Work` header block,
    `Document History` section. Retains User Stories, Functional Requirements, Non-Goals with
    softened guidance. Non-Goals elevated as explicit scope guardrail with template note.

#### Config

33. **`ARCd-config.yml` gated section set** — `pm.layer` and `team.enabled` sections gated on
    `install.type == full`. All other sections (branch, commit, merge, hooks, review, platform,
    user) universal across install types.
34. **Local mode config** — `team.enabled` forced `false`; `user.sync_push` consumer changes to
    `arcd backing sync` / `arcd backing push` (key semantics unchanged, mode-agnostic — see
    Resolved Decisions row "`user.sync_push` in Local mode"); context footer enforced
    descriptive freeform pattern via commit-msg hook; role concept dropped (role is
    Tracked-only). See [Shared Infrastructure](#shared-infrastructure).
35. **Durability-layer command family (Local)** — separate purpose-built `arcd backing *`
    command family (`sync`, `restore`, `push`, `pull`, `status`) installed under
    `backing.type == local`, in the `arcd` namespace from the ARCd Rebrand WU.
    Tracked `arc user *` / `arc sync` commands not installed in Local mode (error with pointer
    to `arcd backing --help`). No transparent redirect. Minimum committed verbs: `sync`
    (handoff + manual), `restore` (manual recovery, with divergence guard), `push` / `pull`
    (remote transport), `status` (orientation). Full spec coordinated with rebrand WU at
    implementation time. See [Durability-Layer Commands](#durability-layer-commands).

#### Strategies

Classification: **4 applies-as-is / 4 needs-variant / 2 excluded** per Finding #2 and Finding #4
corrections. See [Strategy Applicability Mapping](#strategy-applicability-mapping).

36. **Applies-as-is (4):** `strategy-adr-methodology`, `strategy-configurability-architecture`,
    `strategy-file-classification`, `strategy-quality-gates`.
    - **`strategy-configurability-architecture` L87 drift fix** — dual-value prose on Document
      hierarchy row (Full: META-PRD → PRD → tasks / Lite: PRD → tasks, optional combined META-PRD).
      See Finding #12/R6 resolution.
    - **`strategy-configurability-architecture` L229-231 drift fix (Tier 4 audit)** — § Structural
      vs. runtime settings enumerates `pm.layer`, `team.enabled`, `project_name` as structural settings
      triggering `arc init --reconfigure` but misses `install.type` and `backing.type` — both are
      structural per Modes WU design. Minor list additions.
    - **`strategy-file-classification` example list + Directory naming drift (Tier 4 audit)** —
      L47 Scaffolded examples and L73 ALL-CAPS examples mix universal + Full/arc-pm-only
      entries; L168-173 § Directory naming section describes Full-only category structure. Mode-
      aware prose tweaks to accommodate all modes.
    - **`strategy-adr-methodology`, `strategy-quality-gates`** — clean per Tier 4 audit; no drift
      in either axis.
37. **Needs-variant (4):** `strategy-work-organization`, `strategy-work-planning`,
    `strategy-task-list-formatting`, `strategy-session-operations`. Per-strategy scope, drift
    surfaces, and rationale live in [Strategy Applicability Mapping](#strategy-applicability-mapping)
    rationale cells — that's the authoritative source after the Tier 4 audit (2026-04-13).
    Mechanism decisions (inline callouts, dual-value rows, mode-aware prose, block gates,
    `.template.md` rename) are deferred to implementation time per the audit-captures-shape-not-
    mechanism discipline, except Finding #2's pre-committed `.template.md` rename for
    `strategy-task-list-formatting` which stands. **Strategies as docs/ site source content**
    influences mechanism choice at impl time: conditional-callout / mode-aware-prose approaches
    are generally favored over `.template.md` rename to avoid multi-variant drift risk in the
    docs/ rendering pipeline.
38. **Excluded (2):** `strategy-team-coordination` (`install.type == full` bucket — Lite forces
    solo), `strategy-planning-module` (excluded by composition via `pm.layer` gate).
39. **Formal strategy audit pass (Tier 4 close-out)** — **Completed 2026-04-13.** Single
    comprehensive sweep of 8 in-scope strategies (2 excluded from audit: `strategy-team-coordination`,
    `strategy-planning-module`). Results: 2 clean (`strategy-adr-methodology`, `strategy-quality-gates`),
    6 with drift. **No reclassifications** — Finding #2/#4/#6/#12 classifications all stand.
    Additional audit-surfaced scope folded into items 36/37 above and § [Strategy Applicability
    Mapping](#strategy-applicability-mapping) rationale cells. Mechanism decisions deferred to
    implementation time per audit-captures-shape-not-mechanism discipline. See [Resolved
    Decisions](#resolved-decisions) row "Formal strategy audit pass completed (Tier 4)".

#### Skills

40. **`/arc-resume`** — cold orientation. Mode-universal. Existing; contributor path already
    shipped.
41. **`/arc-status`** (NEW) — warm mid-session re-orientation. Mode-universal. Lives in own §
    [Mid-Session Orientation](#mid-session-orientation). Output is mode-conditional: Lite has no "In
    flight" block (no concept of multi-WU state); Full shows supplemental block only when
    paused/Waiting-For state is actually present.
42. **`/arc-handoff`** — close. Mode-universal. Existing.
43. **`/arc-shift`** (NEW) — Full-only. Transitions (pause/resume/rotate) in the shift lifecycle;
    never writes `Status: Complete`. See [Shift Lifecycle](#shift-lifecycle) § Skill Shape.

#### Shift lifecycle (Full-only unless noted)

44. **Task list Status headers** — state lives in `Status: {value} (date — reason)` inline header
    format. Pure Option C: no registry file, no per-dev cache, no file moves. See [State Lives in
    Task List Headers (Pure Option C)](#state-lives-in-task-list-headers-pure-option-c).
45. **Vocabulary** — two-state split: `Paused` (dev is next mover) vs `Waiting-For {category}`
    (external is next mover). WIP growth nudge rejected per Finding #7 — framework does not
    count-and-advise. See [Resolved Decisions](#resolved-decisions) rows for shift vocabulary.
46. **Document Status headers** — PRDs and task lists updated in sync via Status header. Supplementary
    docs deferred to implementation.
47. **Invocation-as-assertion semantic** — running `integrate-work-unit` on a `Waiting-For` WU is the
    user's assertion that the wait is over. Workflow does not validate what was waited for.
48. **Paused handling at integrate** — warn-and-confirm inline (default no), not hard refuse with
    `--force`. Matches ARC's warn-and-confirm idiom elsewhere.
49. **`PROJECT-STATUS.md`** — stays project-focus oriented. Updated at activate/archive only, not
    personal shift operations. Paused WUs still appear as project focus until archived.
49a. **Pause-pointer field formalization** — canonical spec for the four existing pointer fields
    (`Interrupts:` / `Paused:` / `Paused To:` / `Spawned:`) currently used informally across
    `clean-work-unit.md` and adjacent workflows. Deliverable: documented canonical form for each
    (syntax, when set, when cleared, where referenced), plus a pass updating any workflow or
    strategy doc that references them informally. In scope for this WU per 2026-04-10 decision
    (not shift-blocking, but not deferred either — tech debt otherwise). Concrete field-locator
    inventory and exact edits happen at implementation time; this item fixes only that the sweep
    is owned by the modes WU.

#### Cross-cutting

50. **Mode Fit Communication** — distributed across coordinated surfaces: `arc init` mode prompt,
    `AGENT-BRIEFING.ARC.md` light-touch passive awareness, Lite PRD + task list template intros,
    Lite README, docs-site mode overview page, docs-site troubleshooting section. All link to
    `arc mode switch --to <target>`. Copywriting is implementation-phase; architecture is pre-PRD.
    See [Mode Fit Communication](#mode-fit-communication).
51. **Agent mode awareness** — passive, not active. Basic knowledge that multiple modes exist and
    can answer "should I consider switching?" when asked. Does not proactively volunteer or detect.
52. **Forbidden combinations enumeration** — Lite forces `pm.layer: none` (both `arc-pm` and
    `external` are excluded). Rationale: Lite's design philosophy is less ceremony, and external
    PM integration adds machinery that conflicts with that. Developers who need external PM
    integration graduate to Full with `pm.layer: external` via `arc mode switch --to full`.
    Skipped in init prompts in Lite mode. See [Forbidden Combinations](#forbidden-combinations).

#### ADRs (deferred to PRD implementation; committed to two, not four)

53. **ADR 1: Recipe as Authoritative Install-Time Specification** — umbrella ADR covering three
    mechanism siblings. Decision sections document:
    - **Whole-file installation** (Finding #8) — symmetric-additive `install.type` recipe
      conditions, three buckets (baseline / `install.type == full` / `install.type == lite`), zero
      recipe schema change, zero `resolveFileList()` change.
    - **Prompt orchestration** (Finding #9) — Framing C, recipe `show_when` field, hand-rolled UX
      with recipe-driven gating, `shouldShowPrompt()` helper.
    - **Within-file content rendering** (Finding #10) — `.template.md` rename + inline `arc:if`
      directives, existing render pipeline (`needsRendering()` / `renderConditionals()` /
      `toOutputPath()`) unchanged.
    - **Applied examples** (not separate ADRs): Finding #12/R6 (initial-setup Mechanism A as an
      application of recipe-bucket mechanism), Finding #4 (session-lifecycle Mechanism B),
      Finding #5 (process-task-loop Mechanism B layered onto existing template). Documented
      inline in the umbrella's Decision section so the coupling is visible and cross-ADR references
      are unnecessary.
    - **Rationale for umbrella:** the three mechanisms are operationally distinct but semantically
      coupled under "the recipe is the authoritative install-time specification." They share a
      Context section, build on each other sequentially (#8 establishes buckets → #9 uses
      `install.type` value → #10 reuses same condition for content), and share code paths. They
      supersede together or not at all.
54. **ADR 2: Shift Lifecycle** — separate from ADR 1. Decision sections document:
    - **State model** — Pure Option C, task list Status headers as single source of truth,
      metadata-in-place (no file moves, no registry).
    - **Vocabulary** — `Paused` vs `Waiting-For {category}` two-state split.
    - **Integrate × shift states** as a behavioral extension in the Decision section (not standalone
      ADR) — entry contract, invocation-as-assertion semantic, Paused warn-and-confirm, terminal
      transition ownership.
    - **Rationale for separation:** semantically distinct from ADR 1 (work-unit state transitions,
      not installation mechanics). No shared Context, no shared code paths.

#### Content sweep (implementation-phase, scheduled late)

The four items below are all late-WU implementation activities. Sizing and concrete per-file
scope are intentionally deferred to implementation time — the content audit classification (56)
is the activity that produces those numbers in-flight, and attempting to pre-compute them during
planning would duplicate the audit itself. They are all captured here as committed deliverables,
not parked.

55. **Phrasing sweep** — mode-aware wording updates across strategy docs, constitutional docs
    (DEV-RULES.ARC, DEV-RULES.PROJECT), workflow docs, QUICK-REFERENCE, agent briefings, config
    schema comments, role content, session state portability content. Categories enumerated in
    [Phrasing Sweep](#phrasing-sweep-mode-aware-content-updates). Sized by the audit (item 56).
56. **Content audit classification** — precedes phrasing sweep; identifies scope by file and
    produces a per-file change inventory that feeds the phrasing sweep. Sizing (file count,
    per-file effort estimate, total time budget) is the output of this activity, not an input —
    runs at the start of the late-WU content phase. Scheduled as a distinct phase so the
    audit's output can size the phrasing sweep before it starts.
57. **Local-axis content sweep (implementation-phase execution)** — the actual editing of
    strategies, workflows, and constitutional docs for Local/Tracked axis drift. **Preceded by
    a pre-PRD Local-axis audit pass** (parallel to the Tier 4 install.type audit of 2026-04-13)
    which surfaces the drift surfaces and feeds them into § Strategy Applicability Mapping
    rationale cells; that pre-PRD audit is pending at the close of 2026-04-13 and is not itself
    captured as an inventory deliverable because it's a planning activity, not an implementation
    deliverable. Known starting drift surfaces that will be in the audit's scope:
    `strategy-session-operations` § Session State Portability (~35 lines, git notes mechanism
    needs Local-mode redirect callout); `strategy-configurability-architecture` L104 Context
    footer row; OQ 15 resolution left the Local/Tracked axis content impact for initial-setup
    workflows (exclusion mechanism verification, backing store setup, Path 2 inapplicability,
    portability redirect) to this sweep. Composes with the content audit (item 56) — the audit's
    per-file inventory includes both `install.type` and Local-axis drift once the pre-PRD
    Local-axis audit lands. Concrete impl-phase edits decided in-context at implementation time.
58. **docs/ site mode-awareness pass** — full pass on `docs/` site content to update for the new
    modes, and add new pages where needed (expected: explainer pages for Lite, Local, Shift
    Lifecycle; mode-choice guidance for adopters). Docs/ pages are generally built from the
    strategies but adapted, so they need their own pass distinct from the strategy-level phrasing
    sweep. **Sequencing:** runs after the strategy-level phrasing sweep lands (item 55) and
    towards the end of the WU, so the docs/ pass works against stable strategy content. Concrete
    scope (which pages edit, which pages add) is produced during the pass itself — attempting to
    pre-enumerate without the stable strategies as input would duplicate work.

---

### Resolved Decisions

Decisions settled during the 2026-04-09 and 2026-04-10 design iterations. Each entry names the
decision and a brief rationale; the full reasoning is in the relevant section above.

| Decision                                                                | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
|-------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Local mode exclusion — primary                                          | `.git/info/exclude` (research-verified industry norm for per-user tooling)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Local mode exclusion — opt-in                                           | Tracked `.gitignore` line via `--shared-gitignore` flag                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Local mode exclusion — dropped                                          | Global gitignore (machine-wide blast radius breaks coexistence with tracked ARC)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Backing store                                                           | Required, auto-created git-based local bare repo; durability + re-clone detection signal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Project ID                                                              | Git remote URL primary, first-commit hash fallback                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Re-clone UX                                                             | Backing-store + absent-`.arc/` + missing-exclude → restoration flow, one-prompt recovery                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Cross-machine portability                                               | Opt-in remote on backing store, not automatic                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Local + Full combination                                                | Supported via single-active invariant + shift lifecycle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Single-active invariant framing                                         | ARC tracks work units not branches; git usage unconstrained                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Shift lifecycle — inclusion                                             | In-scope for this work unit (not deferred); universal, applies to all ARC modes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Shift lifecycle — approach                                              | Metadata-in-place (no file moves); task list Status headers as single source of truth; no registry file, no per-dev cache                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Shift lifecycle — state location                                        | Pure Option C (2026-04-09 decision after B-vs-C scenario walk). Task list headers carry Status, date, reason. `WORK-STATUS.md` stays single-slot                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Shift lifecycle — multi-WU awareness                                    | On-demand via `/arc-status` skill (Full-mode supplemental output block), not baked into session-init. Session-init orientation remains single-WU focused                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Shift lifecycle — skill                                                 | Ships `/arc-shift` (transitions, workflow `shift-work-unit.md`). The `/arc-status` skill is not part of the shift lifecycle — it is mode-universal and lives in its own [Mid-Session Orientation](#mid-session-orientation) section (see row below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Shift lifecycle — uncommitted work                                      | Workflow surfaces state, recommends commit, allows stash or leave-as-is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Shift lifecycle — document status headers                               | PRDs and task lists updated in sync via the Status header (inline date + reason format); supplementary docs deferred to implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Shift lifecycle — vocabulary (Finding B)                                | Two-state split: `Paused` (dev is next mover, counts toward WIP nudge) vs `Waiting-For {category}` (external is next mover, excluded from nudge)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Shift lifecycle — growth nudge (WIP pressure)                           | **Rejected** (2026-04-11, Finding #7 resolution). No WIP growth nudge. Framework does not count paused WUs and surface unsolicited advice. Same "no detect-and-advise" principle that kills Lite graduation guardrails applies symmetrically here. YAGNI + paternalism risk; if WIP pressure becomes a real observed problem in practice, design a scaled response against evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Shift lifecycle — Finding C (pause pointers)                            | No rename needed. The `Paused:` pointer field in `clean-work-unit.md` and the new Status header vocabulary do not collide (different field shapes, different semantics). Formalizing the four pointer fields (`Interrupts:` / `Paused:` / `Paused To:` / `Spawned:`) is in scope for this WU per 2026-04-10 decision — see [Consolidated Deliverables Inventory § Shift lifecycle](#shift-lifecycle-full-only-unless-noted) item 49a                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Shift lifecycle — `PROJECT-STATUS.md`                                   | Stays project-focus oriented. Updated at activate/archive only, not at personal shift operations. Paused WUs still appear as project focus until archived (ownership-of-tracked-state framing)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Shift lifecycle — CLI naming coordination                               | `arc status` (framework health CLI) rename to `arc health` pulled forward into Session-Init Optimization WU (Task 3.R.k.a); ARCd Rebrand WU sweeps `arc health` → `arcd health` as part of its global `arc` → `arcd` binary rename. Both steps free `/arc-status` for the mid-session skill                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Lite graduation guardrails                                              | **Rejected** (2026-04-11, Finding #7 resolution). Framework does not detect-and-advise on mode fit. No runtime signals, no session-init assessment step, no process-task-loop awareness nudge, no persistent orientation flags. Users choose their mode; paternalism is explicitly rejected. Mode-fit concern instead handled via [Mode Fit Communication](#mode-fit-communication) (upfront clarity) and [Graduation / Downgrade Paths](#graduation--downgrade-paths) (easy transition)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `/arc-status` primary rationale                                         | Mid-session warm re-orientation after interruption (post-lunch, post-meeting, post-context-switch). Mode-universal; every ARC project benefits. Multi-WU visibility in Full mode is a complementary secondary use — the original driver that justified creating the skill, but no longer its primary value proposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/arc-status` structural placement                                      | Lives in its own top-level [Mid-Session Orientation](#mid-session-orientation) section, not nested under [Shift Lifecycle](#shift-lifecycle). Reflects mode-universal scope vs. shift lifecycle's Full-only scope. Skill trio `/arc-resume` (cold), `/arc-status` (warm), `/arc-handoff` (close) is mode-universal; `/arc-shift` stays nested under Shift Lifecycle and is Full-only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/arc-status` output and input sources                                  | Mode-conditional, not count-conditional. In Lite, the "In flight" block and the `active/` scan for paused/Waiting-For task list headers are structurally absent (Lite has no concept of multi-WU state). In Full, the supplemental block appears only when such state is actually present; single-WU Full sessions see the universal core output                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Mode-fit detection or nagging (framework-wide principle)                | **Rejected** (2026-04-11, Finding #7 resolution). Framework does not count-and-advise on WIP, complexity, duration, or any other signal. Applies symmetrically across Lite (graduation guardrails) and Full (WIP growth nudge). YAGNI + paternalism risk; evidence-based scaled response is the fallback path if real problems emerge                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Mode-fit communication mechanism                                        | Upfront clarity, not runtime detection. Distributed across coordinated surfaces: `arc init` mode prompt, `AGENT-BRIEFING.ARC.md` light-touch passive awareness, Lite PRD and task list template intros, Lite README, docs-site mode overview page, docs-site troubleshooting section. All link to `arc mode switch --to <target>` as the transition path. See [Mode Fit Communication](#mode-fit-communication)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Agent mode awareness                                                    | **Passive**, not active. Agent has basic knowledge that multiple modes exist, their fit cases, and the transition command. Can answer "should I consider switching modes?" when the user asks. Does not proactively volunteer the suggestion, flag it in orientation, or detect signals that might indicate mode mismatch. Consistent with "no detect-and-advise" principle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Finding #19 scope                                                       | Upgraded from "coordinate with Finding #7 guardrails" to "sole mechanism for mode-fit communication." Architectural scoping (touchpoint enumeration, consistency principle, agent-awareness shape) lifted pre-PRD and captured in [Mode Fit Communication](#mode-fit-communication). Actual copywriting remains implementation-phase (one cross-cutting PRD requirement unpacking into per-touchpoint tasks)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Integrate × shift states — entry contract                               | `integrate-work-unit` accepts `In Progress`, `Complete`, and all `Waiting-For {category}` values. `Paused` triggers an inline warn-and-confirm prompt. Entry check inserted at top of Step 1; transition to `Complete` remains in `clean-work-unit.md` Mode 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Invocation-as-assertion semantic for `Waiting-For`                      | Running integrate on a `Waiting-For` WU is the user's assertion that the wait is over. Workflow does not validate what was waited for; the invocation itself carries the signal, and the transition proceeds through the standard path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `Paused` handling at integrate                                          | Warn-and-confirm inline (default no), not hard refuse with a `--force` flag. Matches ARC's warn-and-confirm idiom elsewhere. User confirmation proceeds through standard path; transition to `Complete` happens in `clean-work-unit.md` Mode 2 like any other accepted state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Terminal `→ Complete` transition ownership                              | `integrate-work-unit` owns the terminal state write (via `clean-work-unit.md` Mode 2). `/arc-shift` owns mid-flight transitions (pause/resume/rotate) only and never writes `Status: Complete`. Locality: the workflow that finalizes the WU owns the final state write                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ADR authoring for integrate × shift states                              | Not a standalone ADR. Behavioral extension of the shift-lifecycle vocabulary — composes with **ADR 2 (Shift Lifecycle)** per the committed grouping; see [Consolidated Deliverables Inventory § ADRs](#adrs-deferred-to-prd-implementation-committed-to-two-not-four)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Context footer in Local mode                                            | Enforced descriptive freeform pattern via commit-msg hook                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Role concept applicability                                              | Tracked concept. Applies in Full+tracked AND Lite+tracked (OSS solo-dev scenario). Dropped in Local regardless of Lite/Full.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `team.enabled` in Local mode                                            | Forced `false`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `user.sync_push` in Local mode                                          | Key keeps its three-value semantics (`always` / `prompt` / `manual`). Consumer changes per install mode: tracked installs read it via `arc sync` / `arc user save` / `arc user push`; Local installs read it via `arcd backing sync` / `arcd backing push`. Key is mode-agnostic — only the consumer family differs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Durability-layer commands (Audit A H2)                                  | **Resolved 2026-04-13; tracked-mode semantics amended 2026-04-22 by Session-Init Optimization 3.R.** Purpose-built separate command family, not transparent redirect. Tracked installs get `arc user save/load/fetch/push/pull` + `arc sync` (git notes over `refs/notes/arc/user/{identity}`, user-subtree scope). In tracked mode, `pull = fetch + load`, `fetch` is the transport-only verb, `load` walks reachable ancestors with `--max-walk`, and `sync` is direction-aware porcelain rather than a save+push-only alias. Local installs get `arcd backing sync/restore/push/pull/status` in the new `arcd` namespace from the ARCd Rebrand WU (whole-`.arc/` scope against `~/.arc-state/{project-id}/`). The two families coexist across install modes; each install mode installs one. In Local mode, `arc user *` and `arc sync` error with a pointer to `arcd backing --help` — no aliasing, no silent redirect. Unifier lives at the workflow layer: session-handoff's persist step branches on `backing.type` and invokes the mode-appropriate family. Includes divergence guard on `arcd backing restore`, cross-machine conflict story, graduation banner. See [Durability-Layer Commands](#durability-layer-commands).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `pm.mode: arc-in-git` → `arc-pm` rename                                 | Scope migrated to ARCd Rebrand WU (composes with `arc-config.yml` → `ARCd-config.yml` rename and content sweep)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `pm.mode` → `pm.layer`, `team.mode` → `team.enabled` key renames        | Absorbed into ARCd Rebrand WU (2026-04-11, during Finding #16 resolution). Motivation: this plan doc promotes "mode" to a load-bearing top-level term (`install_config.install_type`), and the pre-existing `pm.mode` / `team.mode` keys collide semantically. `pm.layer` matches "Planning Module" vocabulary; `team.enabled` is the natural noun for a bool. Rebrand is scheduled before Modes WU, so Modes inherits the clean namespace. Three-way merge handles existing installs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Mode axes composition                                                   | Lite/Full and Tracked/Local are orthogonal; four combinations all valid; each axis contributes independent changes to the config template                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Lite + Local development                                                | Intertwined, not sequential — shared machinery (config templates, init flow, session-init, audit, phrasing sweep) dominates unique per-mode work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| WU scope split                                                          | pm.mode rename + mechanical content sweep → rebrand WU; pre-PRD audit + shift lifecycle + Lite + Local (intertwined) → modes WU                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Content audit scope                                                     | Expanded to include configurability architecture and lifecycle transitions; mode-aware phrasing sweep added as implementation activity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Branch / Active Focus mismatch UX                                       | Orientation reports facts without editorializing; escalation only on work-affecting actions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Solo-dev blind spot audit                                               | Gating pre-PRD deliverable of this work unit (not atomic, not deferred)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Lite PRD artifact name                                                  | Still called a PRD (not "scope brief"). Keeps framework coherence across modes, makes graduation a content migration. See [The Lite PRD](#the-lite-prd)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Lite PRD template cuts                                                  | Drops `Type:` header field, `Status/Related Work` header block, `Document History` section. Retains all other sections with softened guidance in User Stories, Functional Requirements, Non-Goals                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Lite `create-prd` workflow shape                                        | Unified `create-prd` workflow with mode-conditional edges (Pre-Step 0 branch context, META-PRD review, Step 2 category classification, Step 4 template + save location). ~90% mode-neutral                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| META-PRD in Lite                                                        | Not installed. Project vision captured in the Lite PRD itself. META-PRD template assigned to `install.type == full` bucket                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Lite `plan-*` doc location                                              | `.arc/active/plan-{name}.md` — sibling to `prd.md` and `tasks.md` in the flat `active/` directory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Lite PRD filename                                                       | Singular `prd.md`. One PRD per Lite project; need for multiple is a soft graduation signal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Lite Non-Goals framing                                                  | Elevated as explicit scope guardrail. Template carries a guardrail note; `create-prd` Step 3 spends deliberate time on Non-Goals elicitation to compensate for absent WU-lifecycle guardrails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Lite ship step protocol                                                 | Three-step protocol reusing Full's Success Criteria section convention: (1) Success Criteria all `[x]` or `[~]`, (2) Tier 3 quality gates, (3) aggregate diff review. No new template section or workflow concept                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Installation type mechanism                                             | Symmetric additive via `install.type` condition in the recipe. Three buckets: unconditional baseline, `install.type == full`, `install.type == lite`. Zero recipe schema change, zero `resolveFileList()` change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Installation type config key                                            | `install.type` (dotted form, consistent with existing `pm.layer`, `team.enabled`, `branch.protection`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Manifest `install_config` schema extension                              | Gains `install_type: string` required field. Manifest schema version bumps. Legacy manifests migrate with `install_type: "full"` default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ADR authoring sequencing                                                | ADRs are implementation-phase deliverables, not pre-PRD artifacts. Flow: pre-PRD scratch (working doc or plan doc directly) → plan doc → PRD → task list → ADR during execution. Two ADRs committed: **ADR 1 (Recipe as Authoritative Install-Time Specification)** umbrella + **ADR 2 (Shift Lifecycle)** — see [Consolidated Deliverables Inventory § ADRs](#adrs-deferred-to-prd-implementation-committed-to-two-not-four). Both land as explicit task deliverables in the PRD                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Recipe authority scope (prompts)                                        | Framing C — recipe owns prompt identity, `config_key` / `token` mapping, and gating (`show_when`). Hand-rolled code keeps UX. Framing A (hand-coded gating) rejected as no DRY progress; Framing B (full data-driven loop) rejected as speculative schema bloat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Recipe `show_when` field                                                | New optional field on `RecipePrompt`. Same `CONDITION_PATTERN` grammar as existing `recipe.conditions` keys — reuses `evaluateCondition()` as-is. Validator extension is a single regex check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `shouldShowPrompt()` helper                                             | Pure function in `lib/template/recipe.ts` alongside `evaluateCondition()`. Partial-config-safe via existing undefined-key handling (returns false for not-yet-answered references)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `install.type` prompt position                                          | Position 2 in the recipe prompts array (after `project_name`, before `tools`). Ordering constraint: must precede any prompt that references `install.type` in `show_when`. Documented convention, not structural check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `install.type` prompt default                                           | **No default pre-selected** — the prompt presents ARC and ARC Lite as equal peers with a concise decision primer (see "Default mode for `arc init` (OQ 9)" row below for full shape). Non-interactive `arc init --yes` without `--install-type` (or `--lite` / `--full` shorthand) **errors out**, instructing the user to specify a mode explicitly. Legacy manifest migration (existing installs acquiring `install_type` retroactively) still uses `install_type: "full"` — that's a back-compat concern for existing installs, orthogonal to new-install default behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `install.type` canonical flag                                           | `--install-type <lite\|full>`. Shorthand aliases `--lite` / `--full` supported, mutually exclusive. Matches plan-doc § Init Flow Implications                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Gated prompts (initial set)                                             | `pm_mode` and `team_mode` both gated on `install.type == full`. No other prompts need gating (verified against Finding #1's Lite PRD landing — workflow-level conditionals happen at template render time, not init prompt time)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Skipped-prompt default semantics                                        | Gated-out prompts take their value from the recipe `default` field. `pm_mode` → `"none"`, `team_mode` → `false`. Matches existing Lite semantics already in § Configuration Identity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `buildConfigMap` / `buildConfigKeyOverrides` / `buildTokenMap` refactor | Iterate `recipe.prompts` for `config_key` and `token` mapping instead of hardcoded constants. `user.sync_push` derivation from `team_mode` and `REPO_ROOT` computed token stay in code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Drift mitigation                                                        | Unit tests comparing recipe prompt IDs to exported `INIT_PROMPT_IDS` / `RECONFIGURE_PROMPT_IDS` constants maintained alongside the hand-rolled loops. Rejected `validateRecipe()` runtime check (layering violation or re-introduces duplication)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Reconfigure boundary for `install.type`                                 | `arc init --reconfigure` does NOT mutate `install.type`. Lite↔Full transitions are a distinct CLI surface — `arc mode switch --to lite` / `--to full`, specified in [Graduation / Downgrade Paths](#graduation--downgrade-paths). Internally reuses Framing C's helper and the reconfigure pipeline without inheriting its prompt loop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Lite↔Full CLI surface                                                   | `arc mode switch --to <target>` (symmetric for both directions). Distinct command module under a new `mode` namespace — extensible for the Local/Tracked axis later. Does NOT share reconfigure's prompt loop (lateral shift, not settings tweak). Reuses `buildChangePlan` / `applyChangePlan` / `resolveRemovalsInteractive` internally                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Lite↔Full CLI + workflow split                                          | Shape γ — CLI handles deterministic parts (manifest rewrite, file removal, config re-render, Cat A/B orphans, C1 grep sweep). Advisory workflow `supplemental/switch-mode.md` handles non-deterministic parts (C2 review pass in surviving user content). Workflow is the documented suggested entrypoint; CLI self-sufficient for users without an in-loop agent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Full → Lite entry-state gate                                            | Refuse on `>1` active work unit. User must shift extras to `Paused` / archive them first. Destructive state change — CLI does not auto-handle disposition of other work. Generalizes the invocation-as-assertion semantic: invocation carries assertion, but here the assertion has a pre-condition the CLI verifies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Full → Lite orphan taxonomy                                             | Three categories: **(A)** manifest-tracked files the Lite recipe excludes — handled free by `buildChangePlan` + existing `resolveRemovalsInteractive` UX. **(B)** runtime user artifacts not in the manifest (archived WUs, backlog user content, surviving `plan-*` docs) — filesystem walk reported per-top-level-directory. **(C)** semantic decay — split into C1 stale path refs (grep sweep) and C2 conceptual decay (workflow review pass)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Full → Lite workflow landing                                            | `.arc/system/workflows/arc/supplemental/switch-mode.md`. Lands alongside `add-agent.md` / `integrate-external-content.md` / `verify-arc-integrity.md` — `supplemental/` already houses a framework-level contingent mixed with session-adjacent helpers. No new subdirectory (avoids "subdir for one file" prematurity and the wrong "lifecycle" label for a one-off tool utility)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Full → Lite descope guard                                               | If implementation complexity proves material, descope to "Lite → Full only" with clear error on the reverse path. Current analysis does not suggest this will be needed (Cat A free, Cat B one walk, C1 one grep, C2 warning + workflow)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ADR authoring for Framing C                                             | Absorbed into **ADR 1 (Recipe as Authoritative Install-Time Specification)** umbrella per the committed grouping. Documented as the "Prompt orchestration" mechanism sibling in ADR 1's Decision section alongside whole-file installation (#8) and within-file content rendering (#10). See [Consolidated Deliverables Inventory § ADRs](#adrs-deferred-to-prd-implementation-committed-to-two-not-four)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Lite config template mechanism                                          | Approach 2 — rename `system/ARCd-config.yml` → `system/ARCd-config.template.yml` and gate Full-only sections with `<!-- arc:if install.type == full -->` directives. Processed through the existing render pipeline. Single source of truth, no file duplication                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Render pipeline already extension-agnostic                              | `needsRendering()` in `lib/classification.ts` matches `/\.template\.[^/]+$/` today. `renderConditionals()` has zero markdown assumptions (line-based, HTML-comment directives, YAML-safe blank collapse). No render pipeline extension is required for Approach 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| arc-config render composition order                                     | `renderConfigOverrides(renderConditionals(renderTokens(raw, tokens), config), overrides)`. Tokens → conditionals → overrides. Overrides must apply after conditionals so keys inside stripped blocks are never "overridden" into a file where the key is absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| arc-config call-site restructuring                                      | `renderTemplate()` in `apply.ts` and its inline mirror in `commands/init.ts` fall through to the normal `needsRendering()` branch, then apply `renderConfigOverrides()` as a post-pass when `templateFile === ARC_CONFIG_TEMPLATE_PATH`. One conditional restructured, no new code paths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| arc-config gated section set                                            | Two contiguous blocks: `# --- Project Management ---` / `pm.layer` section and `# --- Team Mode ---` / `team.enabled` section. Everything else (branch, commit, merge, hooks, review, platform, user) is universal across install types                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ARC_CONFIG_TEMPLATE_PATH` constant rename                              | Flips from `"system/ARCd-config.yml"` to `"system/ARCd-config.template.yml"` in `lib/constants.ts`. `CONFIGURABLE_FILES` set entry in `lib/classification.ts` flips to match                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| arc-config manifest lifecycle during rename                             | Zero migration cost. Manifest entries are keyed by output path (`system/ARCd-config.yml`), which is stable across the template rename. Existing installs rebuild pristine via the standard Configurable-file three-way merge on next `arc update`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Approach 1 (two separate arc-config files) rejected                     | Duplicates universal config content (branch, commit, merge, hooks, review, platform, user sections) across two files. Silent divergence risk on every feature add. Only justification was "Approach 2 requires render pipeline extension"; that premise is false                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Finding #1 template delivery closed via consistency                     | `template-prd.md` stays in the unconditional baseline and carries both variants via `arc:if`, matching `ARCd-config.template.yml`. Shipping it as a two-file variant would split "how template content is mode-gated" across two mechanisms for no gain                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ADR authoring for Lite config template mechanism                        | Absorbed into **ADR 1 (Recipe as Authoritative Install-Time Specification)** umbrella per the committed grouping. Documented as the "Within-file content rendering" mechanism sibling in ADR 1's Decision section alongside whole-file installation (#8) and prompt orchestration (#9). See [Consolidated Deliverables Inventory § ADRs](#adrs-deferred-to-prd-implementation-committed-to-two-not-four)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Strategy applicability mapping (Finding #6)                             | Resolved (2026-04-11). All 10 framework strategies classified: 6 applies-as-is (adr-methodology, configurability-architecture, file-classification, quality-gates, session-operations, task-list-formatting), 2 needs-variant via inline `arc:if` (work-organization retains Branch Protection Modes as universal; work-planning retains Discovery Checklist + PRD sections), 2 excluded (team-coordination forced solo in Lite; planning-module gated by `pm.layer`). See [Strategy Applicability Mapping](#strategy-applicability-mapping)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| work-organization scope refinement                                      | Upgraded from "pure Excluded in Lite" to needs-variant. Branch Protection Modes section is a universal git convention (not WU-coupled) — retained in Lite via `arc:if` inside the same file. Prevents pure-excluding a generally-useful section on a WU-lifecycle technicality                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| team-coordination Lite treatment                                        | Excluded from Lite (`install.type == full` bucket) rather than shipped in baseline. Rationale: Lite forces `team.enabled: false`, so the content has zero operational relevance. Breaks slightly with current Full+solo precedent (file ships to solo projects today) but composes with the "Lite doesn't install what it doesn't use" principle. Graduation via `arc mode switch --to full` installs it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Lite task list phases (Finding #2)                                      | Phases required in Lite task lists. Minimum two: one or more work phases plus a final verification phase. Multi-phase is normal, not unusual. Same format as Full — no single-phase simplification. Reason: graduation is relocation, not content rewrite ([Graduation / Downgrade Paths](#graduation--downgrade-paths)); allowing single-phase Lite would require retroactive phase addition on graduation. See [The Lite Task List](#the-lite-task-list) § Phase structure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Lite verification workflow `verify-work.md` (Finding #2)                | Two dedicated workflow files (E3 over E2 — mixing mode responsibilities in one file rejected). Full retains `work-unit-lifecycle/verify-work-unit.md`; Lite ships `verify-work.md` at `system/workflows/arc/verify-work.md` under the `install.type == lite` recipe bucket. Lite task list verification phase task points to `verify-work.md`; Full's points to `verify-work-unit.md`. Naming parallelism: Full keeps `-unit` (WU-lifecycle scaffolding), Lite drops it (no WU concept). Graduation flips the task pointer via CLI — zero structural task-list change. Activity content: Lite performs the three-step ship protocol (Success Criteria check → Tier 3 gates → aggregate diff review); Full performs verification then hands off to integrate. See [The Lite Task List](#the-lite-task-list) § Verification phase                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Lite atomic companion file `atomic-tasks.md` (Finding #2)               | Atomic companion file concept retained in Lite (not Full-only). Named `atomic-tasks.md` as the explicit companion to `tasks.md` — "tasks" fills the `{wu-name}` slot of Full's `atomic-{wu-name}.md` convention. Mode-aware prose update to `strategy-task-list-formatting.md` naming rule, no `arc:if` gate for naming itself. Revises Finding #5's 2026-04-10 cut list: atomic companion references stay in Lite's process-task-loop variant; only incidental routing to backlog and coherent-unit protocol's WU-lifecycle framing get cut. See [The Lite Task List](#the-lite-task-list) § Atomic companion file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `strategy-task-list-formatting` classification correction (Finding #2)  | Reclassified applies-as-is → **needs-variant**, correcting Finding #6's migration (2026-04-11). Four Full-coupled surfaces surfaced during Lite task list spec design: Verification Phase example block pointer, Atomic Companion File archival sub-rule and "all work unit types" phrasing, Status value `Paused`, Status value `Integrated`. Same `arc:if` gating mechanism as `strategy-work-organization` / `strategy-work-planning`: file renames to `strategy-task-list-formatting.template.md`, inline blocks carve out Full-only content, render pipeline unchanged. Atomic companion filename (`atomic-tasks.md` Lite vs `atomic-{wu-name}.md` Full) handled via mode-aware prose, no gate. Strategy count corrects to 5 applies-as-is / 3 needs-variant / 2 excluded. Finding #6 row (above) reflects the earlier state and is superseded for `strategy-task-list-formatting` only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Lite session management mechanism (Finding #4)                          | Single-file-with-`arc:if`. `session-init.md` and `session-handoff.md` rename to `session-init.template.md` and `session-handoff.template.md` in the package source; inline `<!-- arc:if install.type == full -->` blocks gate four surfaces in session-init (Step 2 Item 8 WORK-STATUS field enumeration, Step 2 Item 10 task list path resolution, Step 5 work-unit-discovery subsection, contributor role branch + team-mode trust hierarchy example). session-handoff has no block-level mode gates — mechanically identical across modes except for the WORK-STATUS field set. Render pipeline unchanged (reuses `needsRendering()` / `renderConditionals()` / `toOutputPath()` as they exist). **Rejected:** two-file variant (silent-divergence risk on ~40-60% universal content); runtime in-prose conditionals (compounds per-session-read cost forever). See [Lite Session Management](#lite-session-management)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Lite WORK-STATUS field set (Finding #4)                                 | Five fields: `Branch`, `Next Task`, `Last Completed`, `Blockers`, `Next Action`. Drops `Task List` (path fixed at `.arc/active/tasks.md`, nothing to track). `Branch` retained as lightweight informational — Lite users may still branch per effort without ARC's branch-protection model enforcing it, and ARC does not police git usage in Lite. Full retains `Task List` (multi-WU pipeline) — field set otherwise identical                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `Following Task List` field removal (Finding #4)                        | Removed from **both** Lite and Full WORK-STATUS uniformly. The Yes/No meta-flag is redundant with the Next Task + Next Action pair — off-task-list detour, on-task-list preparation, and mid-task resume are all readable from the relationship between those two fields' content. Removing simplifies handoff (one less field to write), session-init orientation (one less field to parse), and eliminates a decision point at handoff time. Scope expansion from Lite-only to cross-mode folded into Finding #4 after the redundancy surfaced during Lite WORK-STATUS design and applied symmetrically on the same reasoning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Lite session-init Step 5 discovery gate (Finding #4)                    | Gates on "skip if WORK-STATUS Next Action is concrete AND `tasks.md` exists with incomplete tasks," parallel to Full's "skip if task list is active." Sessions with a clear resume target skip discovery in both modes regardless of mode. When discovery fires in Lite, it checks for `prd.md` / `plan-*.md` in `.arc/active/` — no backlog, no ROADMAP, no category-path lookup. Consistent with the cascade forward-pointer from [The Lite PRD](#the-lite-prd) § Cascades into other Lite surfaces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `strategy-session-operations` classification correction (Finding #4)    | Reclassified applies-as-is → **needs-variant**, correcting Finding #6's migration (2026-04-11). Two in-doc tables embed Full-only surface references: **State-Conditional Promotion** trigger (`Following Task List: Yes` — becomes universally-phrased after Finding #4's uniform FTL removal, no per-row gating) and **Method Classification by Trigger** row for pre-merge-review / review-triage (Full: `integrate-work-unit`; Lite: `verify-work.md` ship step — dual-value table entry). Mechanism: mode-aware prose + dual-value rows, **not** `.template.md` rename (strategy is on-demand reference content; templating scope doesn't expand to reference tier for two-row edits). Strategy count corrects 5/3/2 → **4 applies-as-is / 4 needs-variant / 2 excluded**. Second instance of Finding #6's classification-by-concept-not-by-content drift pattern — first instance was Finding #2's `strategy-task-list-formatting` correction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Lite initial-setup workflow mechanism (Finding #12/R6)                  | Mechanism A — purpose-built distinct files per mode. Full's `01_verify-and-configure.md` and `02_define-project.md` reassigned from Finding #8's implicit unconditional baseline to `install.type == full` recipe bucket. New `01_setup-lite.md` under `install.type == lite` bucket, collapsing 01's and 02's Lite-relevant scopes into one ~100-130 line purpose-built file (Step 1 Verify Install, Step 2 Populate Session-Loaded Docs, Step 3 Optional META-PRD, Step 4 Light Customization Awareness). The `01_` prefix preserves initial-setup ordering convention. **Rejected:** Mechanism B (single template with inline `arc:if`) — strip analysis surfaced ~20-25% retained for 01 / ~45-55% for 02 / ~35-40% combined, inverting Finding #5's overlap-ratio heuristic: low overlap favors A, not B. Finding #2's `verify-work.md` / `verify-work-unit.md` precedent applies. See [Lite Initial Setup](#lite-initial-setup)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Opt-in Lite META-PRD template (Finding #12/R6)                          | New `META-PRD.lite.template.md` combines product direction and technical overview content in a single Lite-scoped ~80-120 line template. **Opt-in, not default** — lightly reopens Finding #8 "META-PRD not installed in Lite" commitment without reversing it: default Lite install still has no META-PRD; users who want an ARC-native place for structured high-level project context can opt in during `01_setup-lite.md`'s Step 3 (agent-led during setup, not CLI prompt, not CLI flag). **Recipe bucket:** none — opt-in installation is a separate CLI operation from the recipe mechanism, appending to the installed-files manifest without re-running `resolveFileList()`. Graduation content migration via CLI + `switch-mode.md` workflow split (Shape γ); agent handles judgment calls on content reshape between Lite's combined shape and Full's two-file shape. Motivation: solo devs who want a big-picture doc otherwise create ad-hoc notes files outside ARC's scaffolding — offering an ARC-native opt-in surface that graduation recognizes prevents that pattern without forcing the ceremony on users who don't want it. See [Lite Initial Setup § Optional Lite META-PRD](#lite-initial-setup)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `strategy-configurability-architecture` drift fix (Finding #12/R6)      | Single-row drift fix on L87 Convention inventory Document hierarchy row: "META-PRD → PRD → tasks" reframed to dual-value entry "Full: META-PRD → PRD → tasks. Lite: PRD → tasks (optional combined META-PRD)." Mode-aware prose, no `arc:if` gate — strategy is on-demand reference content, not per-session load. Mirrors Finding #4's `strategy-session-operations` Method Classification by Trigger dual-value row pattern. Classification holds at applies-as-is — not a reclassification. L104 Context footer row drift on the Local/Tracked axis deferred to future Local-axis work. Strategy count stays **4 / 4 / 2**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Formal strategy audit pass promoted to Tier 4 (Finding #12/R6)          | Drift-check hit rate across four targeted per-finding checks: Finding #2 `strategy-task-list-formatting` (hit), Finding #4 `strategy-session-operations` (hit), Finding #5 `strategy-quality-gates` (clean), Finding #12 `strategy-configurability-architecture` (hit). 3-of-4 = ~75% hit rate, above the 2-of-3 threshold established during Finding #4's resolution. Promoted to **formal strategy audit pass in Tier 4** — single comprehensive sweep of all 10 framework strategies for Full-coupled in-doc surfaces before closing pre-PRD. Rationale: targeted checks catch most drift but the pattern is frequent enough that one sweep is cheap insurance against missed surfaces that no single finding's drift-check covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `01_verify-and-configure.md` FTL drift fold-in (Finding #12/R6)         | Residual drift from Finding #4's uniform `Following Task List` field removal: Full's `01_verify-and-configure.md` L38 Verify Session State example block still shows `**Following Task List**: No`. Fold-in: remove the line as part of Finding #12/R6's Full-side cleanup. The same block is cut entirely from Lite's `01_setup-lite.md`, so the drift fix applies only to Full's retained file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Lite process-task-loop mechanism (Finding #5)                           | Single-file-with-`arc:if` (Mechanism B), layered onto the existing `3_process-task-loop.template.md` in the package source. The file is **already** a template via pre-existing `team.enabled` / `pm.layer` gates; Finding #5 adds `install.type` axis gates orthogonally. No rename, no mechanism change, no new render code. **Reverses 2026-04-10 "variant over conditional" decision** — the original "noise in core operating doc" argument applied to Mechanism C (runtime gates preserved in installed content), not B (install-time stripping via `renderConditionals()`). Process-task-loop overlap is ~85-90% universal across 295 lines; two-file variant duplication cost is _higher_ than Finding #4's session-init (~60% overlap). Same rejection reasoning as Approach 1 for `ARCd-config.yml`. See [Lite Process-Task-Loop](#lite-process-task-loop)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Lite process-task-loop gated surfaces (Finding #5)                      | Four `install.type` gated regions: **(1)** Branch/task list coupling bullet — Full references stacked PRs, team sub-branches, archival, `rotate-branch`; Lite replaces with one-sentence "single task list on project branch until ship." **(2)** Verification Phase pointer — Full loads `work-unit-lifecycle/verify-work-unit.md`; Lite loads `verify-work.md` (downstream from Finding #2). **(3)** Next Step section — Full-only; Lite's verification phase is terminal (ship step happens inside `verify-work.md`). **(4)** Incidental Work Management section — multi-gate within: Quick Decision Guide two-way gate (Full's incidental-task-list-vs-atomic tree / Lite's atomic-or-phase-insertion routing), Where to Capture Atomic Tasks Full-only (Lite collapses to single destination `atomic-tasks.md` because `pm.layer: none` excludes `ATOMIC-INBOX`), Atomic Task Completion protocol **universal** (not gated), Complete Workflow pointer Full-only (`manage-incidental-work.md` doesn't exist in Lite). Retained universally: ~85-90% of the file by line count (completion protocol, Tier 1/2 gates, test-first, issue triage, pre-report checklists, WORK-STATUS update, Verification Phase heading/intro, Task List Maintenance)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `strategy-quality-gates` drift-check (Finding #5)                       | Classification stays **applies-as-is**. Targeted drift-check during Finding #5's code-read surfaced no in-doc classification tables, no Full-coupled example blocks, no references to `verify-work-unit` / `integrate-work-unit` / archival / shift lifecycle / team coordination / backlog. `### Phase 3` / `### Phase N: Testing & Quality Gates` example blocks are generic task-list skeletons (both modes have phases per Finding #2). "Coherent unit completion" mentions are about parent-task completion within a task list (valid in Lite). Cross-references to `process-task-loop` / `2_generate-tasks` / `DEV-RULES.PROJECT` / `QUICK-REFERENCE` resolve in both modes. **Concept-not-content drift pattern did NOT hit three-of-three** — two consecutive hits (Finding #2, Finding #4) but not this one. Per Finding #4's threshold criterion, no formal Finding #6 audit pass needed before Tier 4. Strategy count stays **4 / 4 / 2**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ADR grouping for modes WU deliverables (Tier 4)                         | **Two ADRs committed**, not four (replaces prior "likely combined … PRD decides" hedging). **ADR 1 "Recipe as Authoritative Install-Time Specification"** covers three mechanism siblings: whole-file installation (Finding #8), prompt orchestration (Finding #9), and within-file content rendering (Finding #10). Finding #12/R6 (initial-setup Mechanism A as applied example of recipe-bucket mechanism), Finding #4 (session-lifecycle Mechanism B), and Finding #5 (process-task-loop Mechanism B) are documented inline in ADR 1's Decision section as applied examples, not separate ADRs. **ADR 2 "Shift Lifecycle"** separate from ADR 1 — covers state model (Pure Option C), vocabulary (`Paused` / `Waiting-For {category}`), metadata-in-place approach, with integrate × shift states as a behavioral extension in the Decision section (not standalone). **Rationale for umbrella (ADR 1):** three mechanisms are operationally distinct but semantically coupled under "recipe is authoritative install-time specification," share a Context section, build on each other sequentially (#8 buckets → #9 uses `install.type` value → #10 reuses same condition), share code paths, and supersede together or not at all. **Rationale for separation (ADR 2):** semantically distinct from ADR 1, no shared Context or code paths. Supersedes prior rows "ADR authoring for Framing C" and "ADR authoring for Lite config template mechanism" (content updated to point here). See [Consolidated Deliverables Inventory § ADRs](#adrs-deferred-to-prd-implementation-committed-to-two-not-four)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Consolidated deliverables inventory migrated (R4)                       | Migrated from pre-PRD audit Finding B4 2026-04-13 as new plan-doc § [Consolidated Deliverables Inventory](#consolidated-deliverables-inventory) between § Content Audit and § Resolved Decisions. ~59 discrete deliverables organized into 10 domains (CLI and schema, workflows (new), workflows (modified), templates, config, strategies, skills, shift lifecycle, cross-cutting, ADRs, content sweep). Inventory is a **rolled-up reference surface**, not a source-of-truth for decisions — authoritative design lives in the sections it cross-references; authoritative decision history lives in this Resolved Decisions table. Sizing is out of scope at planning time — the content audit classification (§ Content sweep item 56) produces sizing in-flight at implementation time. Maintenance: update inventory when a new finding adds or removes a deliverable; no other triggers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Lite + external PM (OQ 10)                                              | **Resolved 2026-04-13.** Lite forces `pm.layer: none` unconditionally. Both `pm.layer: arc-pm` and `pm.layer: external` are forbidden combinations with Lite. Rationale: Lite's design philosophy is less ceremony; external PM integration adds machinery that conflicts with that, and YAGNI until real demand surfaces. Developers needing external PM integration graduate to Full with `pm.layer: external` via `arc mode switch --to full` — graduation is the escape hatch, not config-space sprawl. CLI refuses the combination at `arc init` time with explanatory error. See [Forbidden Combinations](#forbidden-combinations).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Waiting-For categories finalized (OQ 12)                                | **Resolved 2026-04-13.** The five initial categories (`Review` / `Approval` / `Delivery` / `Decision` / `Other`) are committed as the final set pre-PRD. Each implies a distinct follow-up action (reviewer vs. decision-maker vs. external party vs. architect vs. freeform), which is what the category is for; freeform reason string handles detail beyond the category. Common waiting scenarios all map cleanly (code review → Review, stakeholder signoff → Approval, vendor/dependency → Delivery or Other, technical decision → Decision). No additions needed; revisit only if real observed cases show the five are insufficient. See [State Lives in Task List Headers](#state-lives-in-task-list-headers-pure-option-c) § Waiting-For categories.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Staleness threshold (OQ 13)                                             | **Resolved 2026-04-13.** Fixed at **1 week**, not configurable. The resume-side advisory prompt ("your mental model may be stale, re-read the PRD") fires when a WU's pause exceeds 1 week. 1 week fits common-case memory loss for detailed project context — 2 weeks is already "stale for sure," 3 days is too aggressive. Configurability explicitly rejected as premature flexibility: most users wouldn't touch it, the wrong-default tolerance is high (prompt is advisory, not gating), and YAGNI applies. Revisit only if evidence shows 1 week is actively wrong in practice. See [Workflow Shape](#workflow-shape) § Resume-side additions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/arc-status` second-order drift check (OQ 14)                          | **Resolved 2026-04-13.** No second-order check added. The skill checks `WORK-STATUS.md` vs task list header drift (the primary case, already specified). Paused-at vs last-commit date drift is explicitly not added — that drift is only relevant if someone edits Status headers manually without `/arc-shift`, which is a contract violation the user owns. Every added check increases output complexity and reduces signal-to-noise; YAGNI until a real case surfaces. See [Mid-Session Orientation](#mid-session-orientation) for the current drift-detection surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Shift-with-activation coordination (Finding #14)                        | **Prompt-after-pause with sequential walk.** When transition is `shift-with-activation`, the workflow pauses current, reports pause success, then proceeds into `activate-work-unit` against the target — one user confirmation at invocation, one workflow walk across both steps. Not a two-step conversation where the user re-invokes, not a silent auto-handoff that hides the second step. **Pause is the clean failure boundary:** if activation fails partway, the user is left in a clean paused-current state with a clear "activate {target}?" resumption point, not in half-state. Matches ARC's "mandatory stops between operations" idiom while avoiding the friction of forcing two commands for one semantic transition. Protocol spec lives in `shift-work-unit.md`; coordination shape is locked pre-PRD. See [Workflow Shape](#workflow-shape) § `shift-with-activation` coordination.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Backing store sync mechanism (Finding #17)                              | **Non-bare git clone at `~/.arc-state/{project-id}/`** (corrected from prior `.git` suffix notation which implied bare). Sync at session handoff (canonical firing point): CLI copies `.arc/` contents into the clone, `git add -A`, commits with auto-generated message tying snapshot to source commit hash (or timestamp for zero-commit repos). **Rejected alternatives:** bare repo + `git add -A` (needs working directory, awkward), `rsync --delete` (drops git history semantics), `git bundle` (not live-updated). Non-bare clone gives full git history, supports the opt-in remote push path with no additional tooling, matches plan's stated durability properties exactly. Additional firing points beyond handoff (e.g., shift transitions) are implementation-phase decisions — acceptable if fast and invisible. **Failure handling:** handoff proceeds on sync failure with user notification; next successful sync recovers lag. Refusing handoff on sync failure would block session close over a durability system the user didn't opt into; guarantee is best-effort-visible, not atomic two-phase. See [Backing Store](#backing-store).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Project ID for zero-commit repos (Finding #18)                          | **Three-step fallback chain:** (1) git remote URL if `origin` set (primary); (2) first-commit hash if any history (secondary); (3) generated UUID at `.arc/system/.internal/project-id` created on first `arc init --local` in a zero-commit no-remote repo (tertiary). Covers the Lite+Local "try ARC in five minutes" scenario. **Stickiness at graduation:** once a project adopts the UUID, it stays on the UUID even after the repo later acquires a remote or first commit — auto-migration on git-state change would invalidate the existing backing store and force manual recovery, and the zero-commit → real-repo transition is infrequent enough that the one-time friction isn't worth the complexity. Explicit `arc project-id migrate` command available as an impl-phase escape hatch for developers who want to rekey. **Rejected alternatives:** directory path hash alone (fragile under `mv`); composite directory-hash + UUID (unnecessary complexity). See [Re-Clone UX](#re-clone-ux) § Project identity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Formal strategy audit pass completed (Tier 4)                           | Completed 2026-04-13. Single comprehensive sweep of 8 in-scope strategies (`strategy-team-coordination` and `strategy-planning-module` excluded from audit per Finding #6 classification). Results: 2 clean (`strategy-adr-methodology`, `strategy-quality-gates`), 6 with drift across install.type and Local axes. **No reclassifications** — existing Finding #2/#4/#6/#12 classifications stand. **Additional surfaces captured** in § [Strategy Applicability Mapping](#strategy-applicability-mapping) rationale cells and § [Consolidated Deliverables Inventory](#consolidated-deliverables-inventory) items 36/37/39: biggest surface is `strategy-work-organization` at ~72% Full-coupled (expanded from Finding #6's narrow "Branch Protection Modes" framing to 6 affected sections); secondary is `strategy-task-list-formatting` additional ~90 lines in Incidental Task Lists subsection plus partial Feature/Technical subsection (beyond Finding #2's 4 surgical surfaces); minor additions in `strategy-configurability-architecture` (L229-231 structural settings list missing `install.type`/`backing.type`), `strategy-file-classification` (example lists + § Directory naming), `strategy-session-operations` (2 supporting `integrate-work-unit` example references at L59/L170 plus Local-axis § Session State Portability). **Mechanism decisions deferred to implementation time** per audit-captures-shape-not-mechanism discipline — audit captures shape and rough scale only; exact treatment (inline callouts, dual-value rows, mode-aware prose, block gates, `.template.md` rename) decided in-context during PRD task list execution. **Strategies as docs/ source content** added as a mechanism consideration: strategies feed the docs/ site content pipeline, and maintaining multi-variant strategy files creates drift risk both locally and in docs/ site rendering, so conditional-callout / mode-aware-prose approaches are generally favored over `.template.md` rename for strategies unless bulk scope requires template-time stripping. Finding #2's existing `.template.md` rename commitment for `strategy-task-list-formatting` stands. **Local-axis gap confirmed:** Lite-axis drift has been captured more thoroughly than Local-axis drift across the plan doc. Only one strategy surfaced Local-axis drift during this pass (`strategy-session-operations` § Session State Portability), as a side observation rather than a thorough Local sweep. **A dedicated pre-PRD Local-axis audit pass is pending** — parallel to this Tier 4 install.type audit, same 8-strategy scope, same method, targeting Local/Tracked axis drift; findings feed § Strategy Applicability Mapping rationale cells. Under the "no parking to post-PRD" rule (2026-04-13), this audit is pre-PRD work and must close before PRD authoring. The separate [Consolidated Deliverables Inventory item 57](#content-sweep-implementation-phase-scheduled-late) is the **impl-phase** content sweep that executes the audit's findings, not the audit itself. Docs/ site audit (item 58) is analogously an impl-phase activity that depends on stable strategy content. **Pre-PRD status post-Tier-4:** `plan-arc-modes.md` is **PRD-ready pending OQ 9 resolution and the Local-axis audit pass**; Tier 4 (install.type audit) is closed; next WU phase remains formal PRD authoring once both items close.                                                                                                                                                                                                                                                                                                |
| Default mode for `arc init` (OQ 9)                                      | **Resolved 2026-04-13.** `arc init` presents install type as a concise education-first prompt (Approach C — equal-peers presentation with inline primer). Both installation types appear as equal peers with no pre-selection — ARC listed first above ARC Lite. **Naming:** the canonical mode is **ARC** (not "Full"); the variant is **ARC Lite**. Removing "Full" from user-facing UI language eliminates the Lite-vs-Full framing that carries an implicit lesser-alternative signal on either side — ARC is the thing, ARC Lite is the pared-down variant. **Primer shape:** ~10–15 lines above the prompt, giving each mode one-sentence framing plus 2–3 work-shape discriminator hints (concurrent concerns / PM needs / team coordination / multi-WU lifecycle → ARC; single focused effort / trial or evaluation → ARC Lite). Primer also mentions the mode-switch escape hatch (`arc mode switch --to lite` / `--to full`) to reduce commitment anxiety. Decision criteria are phrased around **work shape, not project duration** — a 6-month solo linear effort can fit Lite; a 2-week project with four parallel concerns probably can't. Primer includes an explicit link to the authoritative mode-overview docs page (the "Documentation site — mode overview page" surface already scoped in § [Mode Fit Communication](#mode-fit-communication)). **Non-interactive behavior:** `arc init --yes` without `--install-type` (or `--lite` / `--full` shorthand) **errors out** with a message instructing the user to specify a mode explicitly. The CLI does not silently pick in automation contexts where no human is reading the primer — forcing explicit choice prevents silent mispredict in exactly the context the primer can't help. `arc init --yes --install-type full` (or `--lite`) is the canonical non-interactive path. **Legacy manifest migration** (existing installs acquiring the `install_type` field retroactively) remains `install_type: "full"` — that's a back-compat concern for existing installs, orthogonal to new-install default. **Failure modes guarded:** (a) new adopters installing Lite when their work will immediately outgrow it — work-shape hints steer them to ARC via discriminators (concurrent concerns / PM / team) regardless of adoption status; (b) any user installing ARC for work that won't need it — the "single focused effort / trial" hint steers them to ARC Lite. Organic growth (Lite → ARC) or organic simplification (ARC → Lite) via `arc mode switch` are always acceptable outcomes; only silent-mispredict-from-unclear-framing is a framework failure. **Rationale for rejecting earlier options:** "Default to Lite" and "Always ask with Lite highlighted as recommended" both carry an undervaluation signal about the framework's center of gravity — they conflate "recommended for new adopters" (a transient onboarding concern) with "recommended as the permanent CLI default" (a permanent property). You're only a new adopter once; permanent defaults shouldn't carry transient adoption framing. Equal-peers presentation with a concise primer is the neutral shape that serves both decisions without undervaluing either mode. **Exact primer copy, docs page text, error message wording, and per-surface phrasing are implementation-phase work.** Integration with § [Mode Fit Communication](#mode-fit-communication): this resolution is the primary install-time touchpoint in that section's surface list, and supersedes the "Default is `full`" language previously present in the "`arc init` mode-selection prompt" bullet and in § Init Flow Implications § Flags — both bullets updated in the same resolution pass. |
| Local axis configuration identity (Audit A H1)                          | **Resolved 2026-04-13.** The Local/Tracked axis gets a new required manifest field `install_config.backing_type`, parallel in shape and consumer treatment to `install_config.install_type`. Flattened config key is `backing.type`; values are `tracked` / `local`; legacy manifests migrate with `backing_type: "tracked"` default. Manifest schema version bumps once for both axes together (single modes-WU schema delta, not two sequential bumps). `buildConfigMap()` extends to flatten `backing_type → backing.type` alongside existing `install_type → install.type` flattening. Recipe bucket architecture adds `backing.type == local` and `backing.type == tracked` single-key buckets (no combinatorial pair-specific buckets with install.type); cross-axis conditional logic handled at the within-file render step via `<!-- arc:if backing.type == local -->` blocks, same mechanism as existing install.type content gating. No recipe grammar extension — existing single-key `key == value` expressions handle both axes independently. New CLI flags `--backing-type <local\|tracked>` canonical with `--local` / `--tracked` shorthand aliases. New `shared-gitignore` prompt gated on `show_when: backing.type == local`. `team.enabled` prompt keeps single-gate `show_when: install.type == full` (not extended to `install.type == full AND backing.type == tracked`); Local layer of config template forces `team.enabled: false` at render time regardless. New `BACKING_TYPE` token in `buildTokenMap`. Drift mitigation extends unit tests comparing recipe prompt IDs to `INIT_PROMPT_IDS` / `RECONFIGURE_PROMPT_IDS` constants (adds two new IDs: `backing_type`, `shared_gitignore`; `RECONFIGURE_PROMPT_IDS` excludes both since reconfigure does not mutate `backing.type` or its downstream gated prompts). `arc init --reconfigure` does NOT mutate `backing.type` (parallel to `install.type` reconfigure boundary). Tracked→Local lateral shift is manual-git-operations-only per § [Upgrade Path (Local → Tracked)](#upgrade-path-local--tracked); no CLI mode-switch ships for this direction in the modes WU. Local→Tracked via existing manual upgrade path. Future `arc mode switch --backing <target>` namespace is reserved but not shipped. See § [Configuration Identity — Local Axis](#configuration-identity--local-axis) for full design resolution and rationale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `backing.type` prompt default (asymmetric with `install.type`)          | **Resolved 2026-04-13 (Audit A H1).** `backing.type` **defaults to `tracked`** in non-interactive mode (`arc init --yes` without `--backing-type` / `--local` / `--tracked` produces a tracked install). **Asymmetric with `install.type`**, which errors without an explicit flag per OQ 9 resolution. Justification: `install.type` has no back-compat default because Lite is newly introduced and the failure mode to guard is mispredict-from-unclear-framing. `backing.type` has a clear back-compat default — Tracked is the existing behavior and the overwhelming-majority case, and "no implicit default" would force every CI pipeline, automation script, and `arc init --yes` caller to add `--tracked` just to preserve existing behavior. The asymmetry is principled: presentation neutrality in interactive mode (both axes use equal-peers prompts with no pre-selection per OQ 9 shape), back-compat safety in non-interactive mode (install.type errors without flag; backing.type defaults to tracked). **Interactive prompt** follows the OQ 9 equal-peers shape — tracking prompt lists both modes as peers, no pre-selection, concise primer (~5-10 lines) with work-shape discriminator hints (I control the repo and `.arc/` belongs in it → Tracked; work project with strict tooling policies / OSS contribution / trying ARC on a repo I don't own → Local). Exact primer copy is implementation-phase work. See § [Configuration Identity — Local Axis](#configuration-identity--local-axis) § CLI flags and init behavior for full rationale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Hooks read downstream keys in Local mode (Audit A H1 + M1)              | **Resolved 2026-04-13.** Hooks (`pre-commit`, `commit-msg`) do not read `backing.type` directly, preserving the existing L127-131 consumer-read-paths claim that hooks do not read axis-level manifest fields. Local-mode context footer enforcement uses the **downstream-keys-set-at-install-time pattern**: the Local layer of the `ARCd-config.yml` template sets `commit.context_footer: custom` with `commit.context_pattern: "^Context: .+$"` (or similar freeform pattern) at install time, and hooks read these already-resolved keys at runtime exactly as they would for any user-authored `custom` context footer. No new enum value on `commit.context_footer` (such as a hypothetical `local` / `freeform` value), no new hook branch, no new config key. The mechanism is identical in shape to how the Lite layer sets `pm.layer: "none"` and `team.enabled: false` at install time without introducing Lite-specific hook logic. **This row simultaneously resolves Audit A finding M1** (context footer format enforcement mechanism). Exact regex for the Local-mode context footer pattern is implementation-phase work. See § [Configuration Identity — Local Axis](#configuration-identity--local-axis) § Consumer read paths for full rationale.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

---

### Research Findings

External research organized by relevance to design decisions. Lite-mode subsections capture
foundational research from 2026-04-01; Local-mode subsections capture 2026-04-13 research
conducted during the H3 scenario walk.

#### Execution discipline is scale-independent (PSP evidence)

Humphrey's Personal Software Process research demonstrates that structured execution practices — task-level
discipline, commit standards, code review at ~200 LOC/hour — reduce defect density with statistical
significance, independent of project size. TSP implementations showed 94% on-time delivery at Microsoft
India. The discipline itself drives quality, not the planning ceremony around it. This validates the core
hypothesis: execution discipline (what Lite keeps) is the high-value layer.

#### Duration boundary: ~2 weeks

Research points to a natural breakpoint around project duration:

- **< 2 weeks with clear scope**: Planning pipeline overhead exceeds its value. Execution discipline
  alone is sufficient.
- **2-8 weeks**: Lightweight planning has value (optional PRD, some scope documentation).
- **> 8 weeks or high integration complexity**: Full planning pipeline justified.

#### Ceremony proportionality: 15-20% threshold

Process overhead becomes counterproductive when ceremony time exceeds 15-20% of total project time. For a
2-hour project, even 20 minutes of setup is ~17% — right at the threshold. For a 2-week project, 30
minutes of ceremony is trivial (~0.6%). This suggests Lite should target near-zero setup time.

#### Graduation triggers should be signal-based

Rather than time-based thresholds, introduce planning ceremony when:

- Unplanned work emerges mid-project (scope wasn't as clear as assumed)
- Scope clarification starts consuming > 10% of available time
- Task count exceeds working memory (~3-5 concurrent concerns) without external tracking
- Multiple concurrent work streams emerge

These are more actionable than arbitrary duration cutoffs and could inform the graduation CLI experience.

#### Solo developer adoption patterns

Practitioners consistently adopt: frequent commits (traceability + recovery), feature branches even for
solo work, automated testing, structured commit messages. Practitioners consistently abandon: planning
documents, formal review ceremonies, lifecycle phases. This directly matches the split between what
Lite keeps and what it drops.

#### Editor `@`-mention precedent for gitignored personal tooling

Local mode gitignores `.arc/`, making it invisible to editor `@`-mention and quick-open pickers that
respect gitignore. A 2026-04-13 survey of adjacent tools (Cursor, SpecStory, Aider, Continue, Zed,
VS Code, JetBrains AI Assistant, Dendron, Obsidian in-repo vaults) confirmed this as an intrinsic
tradeoff of the "gitignored personal tooling" category — every surveyed tool accepts the picker
cost, and no universal mitigation exists at the editor layer. **Zed's `file_scan_inclusions`** is
the sole clean path-scoped option, a settings array that explicitly adds gitignored paths back into
the file scanner scope. VS Code issues [#103570][vscode-103570] ("support opening ignored files")
and [#43505][vscode-43505] ("allow extensions to contribute to quick-open") were both **closed
without resolution**, confirming the absence of a VS Code path. Per-editor mitigation guidance and
the three-surface decomposition live in § Agent and Editor Discoverability. Grounds the "minor
disruption, not primary ergonomic cost" framing for finding L1.

#### CLI state-directory idiomatic practice

`~/.arc-state/{project-id}/` is a per-user state directory containing methodology content (PRDs,
design docs, session notes). A 2026-04-13 survey of 14 CLI tools (OpenSSH, GnuPG, AWS CLI, kubectl,
`gh`, Docker, npm, rclone, [restic], [borg], [pass], [git-crypt], chezmoi, Obsidian) validated three
Local-mode privacy design decisions:

- **`chmod 700` on creation is idiomatic** for per-user state with any sensitivity. OpenSSH and
  GnuPG have enforced this for decades; AWS CLI adopted the pattern after [Issue #7369][aws-7369].
  Warn-but-run at read time is proportionate for methodology-tool sensitivity — GnuPG's pattern for
  non-critical operations. Hard-refuse on permissive perms is reserved for key-material tools (SSH,
  GnuPG) where state is credential material.
- **Remote repo privacy is documentation-only across the ecosystem.** Zero tools surveyed
  programmatically verify remote repository visibility. restic, borg, chezmoi, pass, and yadm all
  defer to user responsibility via documentation-only guidance. Programmatic verification would
  require host-specific API calls (GitHub/GitLab-only, auth tokens, network dependency, no
  self-hosted support) with no ecosystem precedent.
- **At-rest encryption is tool-category dependent.** Credential-handling and backup-data tools
  (pass, restic, borg, git-crypt) encrypt by default because they store material destined for
  untrusted storage. Note-taking and documentation tools ([Obsidian][obsidian-enc], Logseq, git
  itself) store plaintext and delegate to disk-layer encryption (FileVault, LUKS, BitLocker,
  dm-crypt). ARC's content model fits the latter category; encrypt-by-default is overreach for the
  threat model.

**Bonus finding.** [chezmoi's optional encryption model][chezmoi-encryption] — per-file encryption
via age or GPG, user-configurable — is the closest reference for how ARC could later integrate
opt-in encryption as a follow-on feature if demand emerges. [`git-crypt`][git-crypt] remains
available as a power-user option wired manually inside the backing store repo. Grounds § Backing
Store § Privacy model and resolves finding L3.

#### `.git/info/exclude` behavior on re-clone

Local mode's primary exclusion mechanism (`.git/info/exclude`) lives inside `.git/info/`, which is
not part of the repository's tracked content. `git clone` initializes `.git/` fresh from the remote
pack data, and `.git/info/exclude` starts empty (a stub comment block). **No native git mechanism
preserves per-repo excludes across clones.** Re-clone is therefore a routine recovery event for
Local mode, not a degraded state — the backing store doubles as durability substrate and re-clone
detection signal, and `arc init --local` is idempotent, handling the four-step recovery sequence
(restore `.git/info/exclude`, replay backing store content via `arcd backing restore`, re-install
hooks, report). See § Re-Clone UX § Recovery command and § Durability-Layer Commands §
Session-init Local-axis pre-check.

#### Sources

**Lite-mode foundations (2026-04-01):**

- PSP empirical studies (Humphrey; IEEE TSE)
- Crystal agile methodology variants (Cockburn — methodology scaling by team/project size)
- Lean software development (waste identification in process overhead)
- PMI project complexity research (37 complexity indicators, 23 attributes)
- Solo developer workflow practitioner surveys (2024-2025)

**Local-mode foundations (2026-04-13):**

- Editor gitignore-handling survey across Cursor, SpecStory, Aider, Continue, Zed, VS Code,
  JetBrains AI Assistant, Dendron, Obsidian (editor `@`-mention precedent)
- CLI state-directory idiomatic practice survey across OpenSSH, GnuPG, AWS CLI, kubectl, `gh`,
  Docker, npm, rclone, restic, borg, pass, git-crypt, chezmoi, Obsidian (filesystem permissions,
  remote privacy, at-rest encryption)
- git-scm.com gitignore(5) documentation (`.git/info/exclude` clone behavior)

---

## Open Questions Surfaced During Upstream Plan Iteration

### Lite mode value proposition under the tier model (PRD-time refinement)

Surfaced 2026-04-28 during the agile/mobility design discussion that produced Worktree Foundation,
Agile WU Lifecycle, and Concurrent Work Conventions.
Agile WU Lifecycle introduces a three-tier WU model (atomic / quick / standard) with structurally
differentiated artifact requirements — quick tier in particular has reduced ceremony comparable to
some of what makes Lite mode distinct.

**The question:** does Lite mode's value proposition need refinement now that quick tier exists in
Full mode?

**Where Lite mode's distinctness still holds:**

- File-level workflow exclusion (Lite installs fewer workflow files; Full installs all even if some
  go unused for one-WU projects)
- Reduced PRD template (Lite's compact template targets 5-10 minute writeable; Full's PRD is heavier)
- "The project IS the WU" pedagogical framing (clean entry point for small-project adopters)
- Phased task list at project scope (quick tier is flat; standard tier is phased but adds full
  ceremony)

**Where the tier model narrows the gap:**

- Quick tier's reduced ceremony approximates some of what Lite's stripped lifecycle delivers (per-WU,
  not per-project)
- Standard tier with single-WU-as-project approximates Lite's "project IS the WU" shape with heavier
  ceremony
- The "graduation event" still has real cost (workflow installation, vocabulary expansion) so
  remains a meaningful inflection — but the conceptual jump is smaller

**What the PRD owes:**

- Reaffirm or refine Lite's value proposition statement against the tier model
- Decide whether Lite's PRD template should align with quick tier's spec artifact (cross-mode
  parallelism — see Agile WU Lifecycle's open question on quick-tier spec shape)
- Decide whether Lite's "Ship" sequence step gains explicit bridge to quick / standard tier
  vocabulary on graduation
- Confirm that file-level workflow exclusion remains the load-bearing structural difference (vs
  vocabulary, template, or pedagogy alone)

**What this question does NOT propose:** subsuming Lite into Full. Per agile/mobility design
discussion, keeping Lite as distinct mode (Path 1) was selected over absorption paths (2 and 3).
This question refines Lite's framing within the kept-distinct model.

---

## Activation Audit

When this WU activates, audit plan content against current framework state for drift accumulated
during dormancy. Known drift items as of 2026-04-28:

- **Stale Step 1 Status-header reference** (~L4369-4370): the plan references "the existing
  Step 1 Status-header checkbox line" in `session-init.md` as a landing spot for future matrix
  evaluation. That checkbox was removed in commit `eff2918` during the Work-Status Restructure
  WU. Refresh against current `session-init.md` structure or drop if no longer applicable.
- **Phase 3.R session-init.md restructure drift** (post-commit `91a42be`, Session-Init
  Optimization WU): Task 3.R.k.f+g restructured `session-init.md` into an 8-step linear workflow.
  Any references here to older step numbers, Batch 1 / Batch 2 naming, or the standalone "Check
  Active Configuration" step are now stale.
- **Shift lifecycle extraction and three-WU split** (2026-04-24, refined 2026-04-28): shift
  lifecycle was extracted from Operating Modes scope; original Work-Unit Mobility WU was further
  split into Worktree Foundation (mechanism, including shift), Agile WU Lifecycle (tier model),
  and Concurrent Work Conventions (focus-role and async-merge).
  Internal references to shift lifecycle as Modes-bundled scope redirect to
  `plan-worktree-foundation.md`; references to mobility's conventions layer redirect to
  `plan-concurrent-work-conventions.md`.
- **Redirected `BACKLOG-FEATURE.md` reference** (Task 3.11 of Session-Init Optimization): the
  backlog entry was redirected from `plan-arc-lite.md` → `plan-arc-modes.md`, but this plan's
  internal stale refs were not touched — activation reconciliation completes the redirect.
- **WOR R66-R68 terminology rename** (2026-05-19): WOR renames `plan-*` → `draft-*`,
  `prd-*` → `spec-*`, meta-file fields `**Spec:**` → `**Design:**` and `**Task List:**` →
  `**Blueprint:**`, spec workflow `1_create-prd.md` → `1_create-spec.md`, and `template-plan.md` →
  `template-draft.md` (heaviest variant `template-prd.md` preserved). This plan's body references
  the pre-rename vocabulary extensively — particularly normative statements about Lite-mode
  discovery checking `plan-*.md` / `prd.md` in `.arc/active/`, and SQ2's `plan-*` location decision
  for Lite. Activation audit sweeps internal references to current vocabulary. Substantive
  interactions: Lite-mode's "reduced PRD template" concept (§ The Lite PRD) becomes one of several
  spec template variants under the unified `spec-*` filename — name choice (`template-brief.md`,
  re-introduced `template-plan.md` as middle-weight variant, or other) defers to
  `plan-arc-plan-conductor.md` scope and downstream Lite-PRD ratification.

---

[contrib-stress-test]: ../../../reference/supplemental/analysis/analysis-modes-contributor-lifecycle-stress-test.md
[solo-audit]: ../../../reference/supplemental/analysis/analysis-modes-solo-dev-blind-spot-audit.md
[task-list-formatting]: ../../../reference/strategies/arc/strategy-task-list-formatting.md
[prepare-commits]: ../../../system/workflows/arc/supplemental/prepare-commits.md
[template-prd]: ../../../reference/templates/template-prd.md
[create-prd]: ../../../system/workflows/arc/1_create-prd.md
[work-planning]: ../../../reference/strategies/arc/strategy-work-planning.md
[conditional-content-analysis]: ../../../reference/supplemental/analysis/analysis-conditional-content-architecture.md
[vscode-103570]: https://github.com/microsoft/vscode/issues/103570
[vscode-43505]: https://github.com/microsoft/vscode/issues/43505
[aws-7369]: https://github.com/aws/aws-cli/issues/7369
[pass]: https://www.passwordstore.org/
[restic]: https://restic.net/
[borg]: https://www.borgbackup.org/
[obsidian-enc]: https://forum.obsidian.md/t/can-i-encrypt-a-vault/33645
[git-crypt]: https://github.com/AGWA/git-crypt
[chezmoi-encryption]: https://www.chezmoi.io/user-guide/encryption/
