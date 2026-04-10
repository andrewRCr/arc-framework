# Plan: ARC Operating Modes

**Purpose:** Establish ARC's mode architecture — alternative operating modes that expand where and how ARC
can be used. Two modes: a lightweight mode that preserves execution discipline without lifecycle ceremony,
and a local mode that enables ARC in repositories the developer doesn't control.

**Status:** Draft (design phase — Lite, Local, and shift lifecycle resolved; pending pre-PRD audit)
**Created:** 2026-04-01
**Last Updated:** 2026-04-09
**Origin:** Developer experience gaps at both ends of the adoption spectrum — small projects need less
ceremony, and constrained environments need ARC without repo footprint.

**Planning approach:** This work unit has a broadly known intent but largely unknown shape. Spend time here
in the plan stage doing research, evaluation, and design decisions so the PRD can be specific about
deliverables rather than deferring design to implementation. The plan doc is the primary working artifact
until design decisions are resolved.

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

**Scope boundary (2026-04-09):** Configurability cleanup items that are mechanical and rebrand-adjacent
— the `pm.mode: arc-in-git` → `pm.mode: arc-pm` rename and the associated doc sweep — have been
extracted into the [ARCd Rebrand][arcd-rebrand] work unit. Both WUs benefit: the rebrand bundles
related config-file churn into one editorial pass, and the modes WU stays focused on modes-specific
design and implementation. Modes WU depends on the rebrand landing first (clean, renamed foundation
to build on). Revisit this boundary after the pre-PRD audit runs — if findings push scope beyond what's
manageable in a single modes WU, a further split along the dependency line (foundation → Lite+Local)
is available.

**Lite and Local are intertwined, not sequential.** Shared machinery — mode-aware config templates,
mode-aware `arc init` flow, mode-aware session-init, content audit, workflow adaptations, forbidden
combinations enforcement — dominates the unique per-mode work. Building them together avoids
retroactive refactoring and the risk of mode-specific decisions that turn out to conflict across
modes. This is not just "coherent to keep together" but "separating would be actively wasteful."

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
skip ARC entirely, then miss layer 1. Current `pm.mode` options don't address this — `pm.mode: none`
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

## Design Investigations (Pre-PRD)

These are upstream of both modes — decisions here inform the PRD's deliverable specifications. The
methodology/implementation boundary and content architecture are resolved in the upstream Methodology
Maturation work unit (`prd-methodology-maturation.md`). The investigations below are specific to
operating mode design.

### Configuration Identity

How modes are expressed in ARC's configuration system. This affects both modes.

**Resolved.** ARC Lite is too foundational to be a config value — it determines what config options
even exist. The decisions:

- **Lite vs Full is the first fork in `arc init`** — a top-level installation type, not a `pm.mode`
  value or a config setting in `arc-config.yml`. It's stored in the manifest's
  `install_config.install_type` field and read by the CLI for reconfigure/update operations. The
  installation-type mechanism (how it drives file installation, manifest schema, and plumbing
  through `buildConfigMap`) is specified in [Installation Type Recipe
  Mechanism](#installation-type-recipe-mechanism) below.
- **Lite gates downstream prompts** — Lite skips the `pm.mode` prompt (implicitly `none`; `arc-pm`
  is contradictory since Lite has no work unit stream for the planning module to manage).
  `team.mode` is also skipped — Lite is inherently solo from a methodology perspective. The gating
  mechanism (new `show_when` field on recipe prompts, with `install.type == full` as the condition)
  is specified in [Prompt Orchestration and Recipe
  Authority](#prompt-orchestration-and-recipe-authority) below.
- **Lite ships a reduced `arc-config.yml`** — containing only settings relevant to Lite, rather than
  conditionalizing the Full config in place. The recipe-side mechanism for whole-file installation
  is specified in [Installation Type Recipe Mechanism](#installation-type-recipe-mechanism) below;
  the mechanism for **within-file** content gating — how a single installed template produces
  different content per install type via `arc:if` directives — is specified in [Lite Config Template
  Mechanism](#lite-config-template-mechanism) below.

**Still open:** Lite + `pm.mode: external` interaction. There's no reason you couldn't use Lite execution
discipline with an external tracker — but what concrete value does `external` mode provide in Lite, given
there's no integration workflow or lifecycle to hook into? May reduce to "different context footer
pattern" rather than a mode. Evaluate during detail design.

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
`include_files` conditions — a recipe-level condition like `pm.mode == arc-pm` adds files on top of
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
just like `pm.mode == arc-pm` does.

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
  weight. ARC's additive conditions successfully handle `pm.mode`, `tools`, and other axes
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
- **`install.type == full`** condition — Full-only files (`work-unit-lifecycle/*`, META-PRD
  template, Full process-task-loop variant contents once the task-loop variant decision lands).
- **`install.type == lite`** condition — Lite-only files (Lite ship protocol deliverable if
  delivered as a dedicated file per [Enforced Sequence](#enforced-sequence), Lite
  process-task-loop variant contents, any Lite-specific template variants).

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
| Precedent                  | Matches `pm.mode == arc-pm` pattern     | New pattern                  |

#### Stress-test trace-throughs

Run 2026-04-10 before committing to the mechanism. Each trace exercised the adopted approach
against a realistic usage scenario; no trace surfaced an unhandled case.

- **Multi-axis composition** with `pm.mode`, `tools`, `team.mode` all resolved cleanly. The one
  interaction that looked like it might surface an open question — Lite × `pm.mode: arc-pm` — is
  already forbidden elsewhere in this plan doc (see [Configuration
  Identity](#configuration-identity) above and [Forbidden Combinations](#forbidden-combinations)
  below); Lite skips the `pm.mode` prompt entirely, so the condition never fires.
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
- **Config key:** `install.type` (dotted form, consistent with `pm.mode`, `team.mode`,
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
- META-PRD template (`reference/META-PRD.template.md`) → `install.type == full`. Confirmed by
  [The Lite PRD](#the-lite-prd) § SQ1 (META-PRD not installed in Lite).

Other bucket assignments are pending resolution of dependent design decisions — see Feedforward
below.

#### Feedforward — file bucket assignments pending other decisions

These files have preliminary bucket assignments that depend on resolution of other design
decisions. Final bucket confirmation happens as each dependent decision lands.

- **Process-task-loop variant contents** — the variant-over-conditional decision is recorded
  elsewhere; two files will land under `install.type == full` and `install.type == lite`
  conditions respectively. Exact filenames and contents are pending the task-loop variant design
  landing (which determines which Full-oriented references need cutting in the Lite variant).
  See [Open Question 6](#arc-lite) below.
- **Lite ship step deliverable** — [Enforced Sequence](#enforced-sequence) above specifies the
  three-step ship protocol. The file-vs-inline location is a detail decision; if delivered as a
  dedicated `lite-ship.md` supplemental workflow, it lands under `install.type == lite`.
- **`manage-incidental-work.md`, `maintain-project-docs.md`** — unclear bucket assignment.
  Incidental work routing depends on the WU pipeline concept (Full territory); project docs
  maintenance is arguably universal. Pending the strategy applicability mapping for Lite (see
  [Open Question 7](#arc-lite)).
- **Strategy files** (most of `reference/strategies/arc/*`) — most likely stay in the
  unconditional baseline. `strategy-work-organization.md` and `strategy-work-planning.md` may be
  Full-only or partially applicable. Pending the strategy applicability mapping ([Open Question
  7](#arc-lite)).
- **Session-lifecycle workflow variants** (`session-init.template.md`,
  `session-handoff.template.md`) — if the Lite session-lifecycle decision lands on "variant
  needed," two files go under respective `install.type` conditions. If "unified with minor cuts,"
  they stay in the baseline with template `arc:if` directives. Pending [Open Question
  5](#arc-lite).
- **`arc-config.yml` treatment** — resolved by [Lite Config Template
  Mechanism](#lite-config-template-mechanism) below. The file stays in the unconditional baseline
  and is renamed to `system/arc-config.template.yml` with `<!-- arc:if install.type == full -->`
  blocks gating the `pm.mode` and `team.mode` sections. No new bucket assignment needed.

#### Not yet established (verify during implementation)

These items don't gate the mechanism decision but will need confirmation during implementation
task generation or execution. They're recorded here so the PRD's task generation phase can scope
them.

- **Test file inventory** exercising `resolveFileList()`, `validateRecipe()`, and the three
  command paths. Affects the change-size estimate for implementation tasks.
- **Exact migration step wiring** in manifest version bump logic — confirm the migration function
  signature and where legacy-manifest detection fires.
- **Final `install_type` naming** — `install_type` vs. alternatives (`install_mode`, `arc_mode`,
  `mode`). Coordinate with the [ARCd Rebrand][arcd-rebrand] WU's config naming work if any
  overlaps surface.

#### ADR authoring — deferred to PRD implementation

The mechanism decision recorded here will be formalized as an Architecture Decision Record during
implementation of the PRD derived from this plan doc, **not authored now**. The ADR belongs
alongside the code change it documents, not as a pre-PRD artifact. Creating the ADR now would
lock in decisions that haven't been validated through the full planning pipeline (plan doc → PRD
→ task list → task execution → ADR).

The PRD will surface "author ADR for `install.type` mechanism" as an explicit task deliverable;
the ADR itself is written during that task's execution. ADR number is assigned at write time.

This sequencing — working doc → plan doc → PRD → task list → ADR during execution — is a general
discipline for ARC planning work: ADRs are implementation-phase deliverables, not pre-PRD
artifacts.

### Prompt Orchestration and Recipe Authority

**How `arc init` asks the Lite-vs-Full question, gates downstream prompts on the answer, and where
the authority for prompt declarations actually lives.** [Configuration Identity](#configuration-identity)
above establishes that Lite skips `pm.mode` and `team.mode`; [Installation Type Recipe
Mechanism](#installation-type-recipe-mechanism) resolves how the stored `install.type` value drives
file installation. This section resolves the parallel question for prompts: what mechanism expresses
"show this prompt only when `install.type == full`" — and, as the deeper question that surfaced
during evaluation, who owns the declaration of prompts in the first place.

#### The gap

The plan doc (§ Configuration Identity and § Configuration and Installation) states that Lite skips
the `pm.mode` and `team.mode` prompts. The recipe (`packages/arc-framework/init-recipe.json`) defines
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
7. **`buildConfigKeyOverrides()`** (`src/lib/config.ts`) — parallel mapping for `arc-config.yml`
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
recipe entry. For `pm_mode` the current default is `"none"` (correct for Lite — `pm.mode: arc-pm`
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
downgrade) is the concrete case currently tracked in the working doc sequencing. The Lite → Full
upgrade path is covered in plan-doc's existing § Graduation / Downgrade Paths. Whatever shape those
workflows ultimately take — dedicated `arc graduate` / `arc downgrade` commands, an interactive
migration wizard, or workflow-driven manual steps with CLI helpers — they will re-touch prompt
orchestration: the user needs to answer mode-specific questions (PM mode, team mode on upgrade;
file reconciliation on downgrade). Framing C's `shouldShowPrompt` helper and the
recipe-as-config-mapping refactor are reusable in that future work. Finding #9 does not solve
graduation/downgrade; it specifies the shape so graduation/downgrade can build on it.

#### Feedforward

- **Finding #10 (Lite `arc-config.yml` reduction mechanism)** — If #10 adopts the "extend render
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

#### ADR authoring — deferred to PRD implementation

Same rationale as Finding #8. The recipe authority reframe and Framing C's mechanism will be
formalized as an Architecture Decision Record during implementation of the PRD derived from this
plan doc, not authored now. The ADR belongs alongside the code change it documents. Creating it
now would lock in decisions that have not been validated through the full planning pipeline.

The PRD will surface ADR authoring for Framing C as an explicit task deliverable alongside the
Finding #8 mechanism ADR. The two findings likely share a single combined ADR since they are
mechanism siblings under the same "recipe as authoritative install-time specification" umbrella;
the PRD decides single vs combined ADR based on writing economy.

### Lite Config Template Mechanism

**How `arc-config.yml` ships a reduced surface in Lite without duplicating the file.** [Configuration
and Installation](#configuration-and-installation) establishes that Lite ships a reduced config
omitting `pm.mode` and `team.mode`. [Installation Type Recipe Mechanism](#installation-type-recipe-mechanism)
specifies how `install.type` gates whole-file installation; this section specifies the mechanism for
gating **content within a single file** that is installed unconditionally — the
`arc-config.yml` template. The two mechanisms are siblings: recipe conditions gate which files land
on disk, template conditionals gate which lines inside a given file survive rendering.

#### The gap

The current recipe installs `system/arc-config.yml` unconditionally as a plain `.yml` file. It is
not a `.template.md` file, so the template-render `arc:if` mechanism does not apply to it today. Two
existing render passes touch it: `renderConfigOverrides()` rewrites specific key-value lines from
the install-time prompt answers (for example `pm.mode: arc-in-git` if the user selected arc-in-git
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
`toOutputPath()` strips `.template` before any extension, so `arc-config.template.yml` resolves to
`arc-config.yml` for free. **No render pipeline extension is required.** The "`.template.md`-only
gate" that prior analysis treated as the blocker for Approach 2 does not exist.

**`renderConditionals()` has zero markdown assumptions.** Reading `lib/template/render.ts`:
conditional processing splits on newlines, matches an HTML-comment directive regex
(`<!--\s*arc:if\s+...\s*-->`), maintains a stack for nested blocks, and collapses triple-blank runs
to double-blank at the end. Nothing in the implementation references markdown structure — no
heading detection, no list handling, no code-fence awareness. YAML content runs through it cleanly.
The blank-line collapse is YAML-safe because YAML's whitespace sensitivity is about **indentation**,
not inter-section blank-line count; `arc-config.yml` is flat top-level keys with `# --- Section ---`
comment headers separated by blanks, and collapsing `\n\n\n` → `\n\n` only tightens the appearance
of stripped-block boundaries.

**The existing arc-config special-case.** `commands/init.ts` (lines ~168–174) and the shared
`renderTemplate()` helper in `lib/manifest/apply.ts` (lines ~79–98) both branch on
`templateFile === ARC_CONFIG_TEMPLATE_PATH`. Today's branch runs `renderConfigOverrides(raw,
overrides)` and nothing else — `renderTokens()` and `renderConditionals()` are explicitly skipped.
The constant `ARC_CONFIG_TEMPLATE_PATH` in `lib/constants.ts:11` is currently `"system/arc-config.yml"`.

**Rendering passes that compose for Approach 2:**

1. `renderTokens(raw, tokens)` — substitutes `{{TOKEN}}` placeholders. `arc-config.yml` contains
   no such placeholders today (verified by grep — zero `{{...}}` matches in the package source
   file). Introducing this pass is a no-op against current content.
2. `renderConditionals(content, config)` — strips `<!-- arc:if KEY == VALUE --> ... <!-- arc:endif -->`
   blocks that don't match. `arc-config.yml` contains zero `<!-- ... -->` strings today (verified by
   grep). Introducing this pass is a no-op against current content **until** directives are added
   to the template source.
3. `renderConfigOverrides(content, overrides)` — the existing arc-config-specific pass that
   substitutes flat key-value lines from install-time prompts. Stays as-is.

**Manifest and pristine lifecycle for `arc-config.yml`.** The file is classified as
`Configurable` in `CONFIGURABLE_FILES` (`lib/classification.ts:74`). Manifest entries are keyed by
**output path**, not template path — `buildManifestFiles()` uses `outputPath` as the key. Renaming
the template source from `system/arc-config.yml` to `system/arc-config.template.yml` does not
change the manifest key (`system/arc-config.yml` remains the output key). No manifest schema bump,
no migration function, no legacy-manifest handling. Existing installs rebuild their pristine
baseline via the standard three-way merge in `applyChangePlan()` on next `arc update`, against the
newly-rendered content. This is the same Configurable-file lifecycle path that any Framework update
to `arc-config.yml` exercises today.

#### Candidate approaches

Four approaches were identified during the pre-PRD work (Finding #10 in the working doc). The four
are the same as those enumerated before the code-read pass; the read changes the cost calculus for
Approach 2, not the shape of the alternatives.

1. **Two separate files in the recipe** — move `arc-config.yml` out of the unconditional baseline,
   ship `arc-config.full.yml` under `install.type == full` and `arc-config.lite.yml` under
   `install.type == lite`. Uses Finding #8's mechanism unchanged.
2. **Rename to `arc-config.template.yml` and use `arc:if` directives** — single source template
   with inline `<!-- arc:if install.type == full -->` blocks around the Full-only sections.
   Processed through the existing render pipeline.
3. **CLI-generated config content** — `init.ts` writes `arc-config.yml` programmatically from the
   `install_config` struct. Splits config source of truth between a template and code.
4. **Template fragments + stitching** — decompose `arc-config.yml` into universal / Full-only /
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
gated content amounts to two contiguous blocks (`pm.mode` section, `team.mode` section) in a ~165-
line file. Fragment decomposition adds a new file-composition layer, a new ordering rule (which
fragments go in which order), and a new failure mode (fragment order drift producing syntactically
valid but semantically wrong output). None of this complexity earns its weight when the alternative
(Approach 2) reuses existing render pipeline machinery unchanged.

#### Adopted: Approach 2 — single template with `arc:if`

**Rename `system/arc-config.yml` → `system/arc-config.template.yml`** in the package source.
Annotate the `pm.mode` and `team.mode` sections with `<!-- arc:if install.type == full -->` /
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
`"system/arc-config.yml"` to `"system/arc-config.template.yml"`. The `CONFIGURABLE_FILES` set in
`lib/classification.ts:74` flips its entry from `"system/arc-config.yml"` to
`"system/arc-config.template.yml"` to match.

#### Gated section enumeration

Walked the current `arc-config.yml` end-to-end. The install-type-gated content is tight:

| Section                                       | Lines   | Gating                 | Rationale                                                                          |
|-----------------------------------------------|---------|------------------------|------------------------------------------------------------------------------------|
| `# --- Branch Model ---` / `branch.*`         | 12–23   | Universal              | Branch model applies in both modes                                                 |
| `# --- Commit Discipline ---` / `commit.*`    | 25–50   | Universal              | Commit format and context footer apply regardless of install type                  |
| `# --- Merge Strategy ---` / `merge.strategy` | 52–59   | Universal              | Merge strategy is a git-integration concern, not a lifecycle concern               |
| `# --- Hooks ---` / `hooks.*`                 | 61–114  | Universal              | Hook infrastructure runs in both modes; Lite still commits and still validates     |
| `# --- Review ---` / `review.pre_merge`       | 116–124 | Universal              | Pre-merge review applies to both modes (method definition, not lifecycle coupling) |
| `# --- Platform ---` / `platform.type`        | 126–133 | Universal              | Platform is informational; applies regardless of mode                              |
| `# --- Project Management ---` / `pm.mode`    | 135–142 | `install.type == full` | Lite has no work unit stream; PM mode is meaningless                               |
| `# --- Team Mode ---` / `team.mode`           | 144–154 | `install.type == full` | Lite is inherently solo per methodology; team mode is meaningless                  |
| `# --- User Directory ---` / `user.sync_push` | 156–164 | Universal              | Git-notes portability applies to Lite's `user/{identity}/` directory               |

**Two contiguous gated blocks.** `pm.mode` and `team.mode`. The `arc:if` annotation wraps each
section header comment through the settings block, so the stripped output in Lite has no orphan
section header and no comment-block-without-setting.

**Edge case resolved:** `hooks.contributor_protected_paths` defaults to `active/|backlog/`. Lite
has `active/` but may not have `backlog/` depending on `pm.mode`. The regex default harmlessly
no-ops against absent paths, so the setting stays universal — no gating needed, no Lite-specific
override.

#### Composition with Finding #1 (template-prd.md)

Finding #1's [The Lite PRD](#the-lite-prd) § Template delivery mechanism left the single-file-with-
`arc:if`-vs-two-file-variant choice as an implementation-phase detail. Finding #10's adoption of
Approach 2 resolves that detail by force of consistency: the same render pipeline, the same
`.template.*` gate, and the same `arc:if` mechanism handle both files. **`template-prd.md` stays
in the unconditional baseline and carries both variants via `arc:if`** — matching
`arc-config.template.yml`'s approach. Shipping `template-prd.md` as a two-file variant would split
the "how template content is mode-gated" story across two mechanisms for no gain.

This closes Finding #1's open sub-decision without a separate migration pass. The § Template
delivery mechanism paragraph in this plan doc is updated to reflect the landed choice rather than
the pending one.

#### Stress-test trace-throughs

Each trace exercised the adopted mechanism against a realistic scenario. No trace surfaced an
unhandled case.

- **Fresh Lite install.** `arc init --install-type lite` answers the `install.type` prompt with
  `"lite"`, populates `buildConfigMap()` with `install.type → "lite"`, renders
  `arc-config.template.yml` through the three-pass composition. Tokens no-op, conditionals strip
  both gated blocks, overrides apply surviving key-value lines (nothing lands in the stripped
  blocks because those keys are not in the override map for Lite). Output is clean YAML with
  `pm.mode` and `team.mode` absent.
- **Fresh Full install.** Same path with `install.type → "full"`. Conditionals include both gated
  blocks. Overrides apply to `pm.mode: arc-pm` and `team.mode: false` (or user-selected values).
  Output is equivalent to today's Full install.
- **Adopter upgrading an existing Full install.** Pristine baseline for `system/arc-config.yml` in
  the existing manifest is the pre-rename rendered content (no `arc:if` directives — adopters
  never see them). New framework version ships `arc-config.template.yml` with directives in the
  template source. `applyChangePlan()` renders the new template against the adopter's stored
  `install_config` (install type defaults to `"full"` via legacy migration from Finding #8's
  manifest bump), producing rendered content that still includes both sections. Three-way merge
  against the adopter's current file: if they customized `pm.mode` or `team.mode` values, those
  customizations survive via the merge's diff-preservation semantics. Clean path.
- **Reconfigure Full → Lite downgrade** (when that CLI surface exists — see Finding #16). Flipping
  `install_config.install_type` to `"lite"` and re-rendering produces an arc-config.yml with the
  gated sections stripped. The Configurable-file merge path routes the now-removed lines through
  the standard three-way merge. Whether the merge surfaces this as a conflict (user had customized
  the removed lines) or a clean strip depends on the adopter's edits, which is the correct
  behavior — Finding #16 handles downgrade semantics for orphaned settings, not this mechanism.
- **Pristine reconstruction during update** with no `install_type` change. Standard path —
  re-render from stored `install_config` produces the same content as the existing pristine, merge
  reports "unchanged," no work. Matches the existing `.template.md` lifecycle.
- **Adopter who manually edited `{{` or `<!-- arc:if` into their `arc-config.yml`.** Near-zero
  likelihood — no documented reason an adopter would type those sequences into a config file —
  but worth naming. The new rendering passes would process those sequences on next update.
  `renderTokens()` with an unknown token leaves it as-is (per its implementation), so stray `{{FOO}}`
  survives untouched. `renderConditionals()` with a stray `<!-- arc:if ... -->` line would strip
  it and surrounding content if the condition doesn't match the adopter's `install.type`. This is
  the only behavioral change on the update path; the mitigation is to document in the framework
  changelog that adding the rendering passes to `arc-config.yml` is a known incompatible change
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
  `arc-config.template.yml` with the flipped `install.type`, producing a stripped config. The
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
- **Framework changelog entry** flagging the new rendering passes on `arc-config.yml` as an
  incompatible change for the (near-zero-likelihood) adopter who manually inserted directive-like
  sequences. Standard changelog hygiene, not gating.
- **Test coverage.** Unit tests exercising `renderTemplate()` against
  `arc-config.template.yml` for each install type, plus an integration test that `arc init
  --install-type lite` produces a config with the gated blocks absent. Specified during PRD task
  generation.
- **`arc-config.template.yml` vs `arc-config.yml.template`** naming. The former matches the
  existing `.template.<ext>` convention in `needsRendering()`. The latter reads more naturally in
  English but requires either extending the regex or renaming it from `.template.<ext>` to
  something that matches both. Not worth the cost — adopt `.template.yml` for consistency.

#### ADR authoring — deferred to PRD implementation

Same rationale as Findings #8 and #9. The mechanism decision recorded here will be formalized as an
Architecture Decision Record during implementation of the PRD derived from this plan doc, **not
authored now**. The ADR belongs alongside the code change it documents, not as a pre-PRD artifact.

The PRD will surface "author ADR for arc-config template mechanism" as an explicit task deliverable.
The ADR likely combines with Findings #8 and #9's ADR under the "recipe as authoritative install-time
specification" umbrella — three mechanism siblings covering whole-file installation, prompt
orchestration, and within-file content rendering. The PRD decides single vs combined ADR based on
writing economy.

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
- **Density thresholds** — session-init and process-task-loop may warrant Lite-specific template
  variants rather than layering conditionals into the Full versions. The analysis recommends variants
  when a document accumulates 5+ in-prose conditionals on the same axis.
- **Install-time resolution preferred** — where content can be decided at `arc init` time, use template
  blocks or recipe conditions rather than in-prose conditionals. Keeps rendered documents clean.

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

**Detail-design decisions deferred to implementation** (not pre-PRD blocking):

- **Protocol location.** Dedicated `lite-ship.md` supplemental workflow file vs. inline section at the
  end of the Lite process-task-loop variant. Lean: **dedicated file** for discoverability and to
  parallel Full's three-phase ship convention (verify/integrate/archive), just collapsed into one
  file. If dedicated, the file lives under the `install.type == lite` condition in the recipe (see
  [Installation Type Recipe Mechanism](#installation-type-recipe-mechanism)).
- **Aggregate-diff review formalization.** Link to [`prepare-commits.md`][prepare-commits] for review
  conventions if it applies mode-neutrally, or carry inline minimum review guidance otherwise. Decide
  during implementation based on the state of `prepare-commits.md`'s mode assumptions.

### What Stays Identical

These layers are project-scale-independent and work the same in both modes:

- **Constitutional layer**: DEV-RULES.ARC, DEV-RULES.PROJECT, strategies
- **Methods**: Commit format, issue triage, test-first, quality gates, all overrides
- **Hooks**: Pre-commit, commit-msg validation, format enforcement
- **Session lifecycle**: Session init and handoff, WORK-STATUS, SESSION-NOTES
- **Process-task-loop**: One task at a time, quality gates, mandatory stops, completion protocol
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

**Task list structure:** Single task list, likely simpler default structure. Fewer phases (possibly
single-phase default for very small projects). Same formatting conventions. Task list location is
`.arc/active/tasks.md` (singular, no category subdirs).

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

**WORK-STATUS simplification:** Tracks less — no task list path (there's only one), no "Following Task
List" field. Possibly just: current task, last completed, blockers, next action.

**Branch model:** Full ARC's branch protection modes (full/partial) and category-based branching don't
apply. Simplified choice: work on main directly, or create a single branch per effort. No
strategy-work-organization dependency.

**Absent workflows:** Work unit lifecycle workflows are not installed — activate-work-unit,
archive-work-unit, integrate-work-unit, clean-work-unit, verify-arc-integrity. Planning pipeline
workflows (activate-planning-branch, integrate-planning-branch) are also absent. These are excluded
via recipe conditions, not conditionals.

**Session init/handoff:** Simplified Lite variants — different document set, simpler discovery (no work
unit pipeline to assess), no lifecycle state tracking. Likely separate template files rather than
conditionals layered onto the Full versions.

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

**Unified `create-prd` workflow with mode-conditional edges** — not a separate Lite variant. This is
the inverse of the process-task-loop decision (which splits into variants; see Open Question 6).
Rationale: mode differences in `create-prd` are small and localized to workflow edges, the
mode-neutral content is the bulk, and cross-mode consistency preserves collaborative-elicitation
guidance as it evolves. Roughly 90% of `create-prd` is mode-neutral; the conditional content is
concentrated at workflow edges, which is the pattern most amenable to a unified workflow with
targeted conditionals.

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

**SQ1 — META-PRD in Lite: not installed.** Project vision in Lite is captured in the Lite PRD itself.
A separate META-PRD exists to coordinate multi-PRD efforts and track long-running project vision
across many work units. Lite has one PRD by construction, so there is nothing to coordinate.
Installing META-PRD in Lite would violate the "does less, just as reliably" philosophy by adding an
artifact that serves no Lite-relevant purpose. The META-PRD template is assigned to the
`install.type == full` bucket in the recipe (see [Installation Type Recipe
Mechanism](#installation-type-recipe-mechanism)).

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
`arc-config.template.yml`, and shipping `template-prd.md` through a different mechanism would split
"how template content is mode-gated" across two mechanisms for no gain. The render pipeline
processes both files through the same `.template.*` matching gate, the same
`renderConditionals()` pass, and the same `install.type` config map value. One mechanism, two
templates.

#### Cascades into other Lite surfaces

The Lite PRD's functional contract feeds forward into several other Lite design decisions still in
flight:

- **Lite task list template** (Open Question 4): keeps a Success Criteria section. Chain confirmed
  — PRD Success Criteria → task list Success Criteria → ship step (see [Enforced
  Sequence](#enforced-sequence)).
- **Lite session-init document set** (Open Question 5): includes `.arc/active/prd.md`,
  `.arc/active/tasks.md`, and `.arc/active/WORK-STATUS.md`. No backlog scan, no category-path
  lookup, no PRD-file discovery.
- **Strategy applicability mapping for Lite** (Open Question 7): `strategy-work-planning.md`
  partially applies in Lite (the discovery checklist is used by Lite `create-prd` Step 3; the
  work-unit-lifecycle sections do not apply).
- **Initial-setup workflows** (Open Question 15): strong lean toward the same unified-with-mode-
  conditionals shape as `create-prd`. Not yet decided.

### Guardrails and Graduation Triggers

Lite doesn't have lifecycle workflows to manage complexity — so it needs a different mechanism to keep
you honest. The system should detect when a project is outgrowing Lite and surface that clearly, without
hard-blocking the user.

**Observable signals that suggest graduation:**

- **Task list size** — past a threshold, a single evolving task list becomes unwieldy. Research suggests
  working memory is ~3-5 concurrent concerns.
- **Scope drift** — user describing work that doesn't connect back to the Lite PRD. The Lite PRD's
  Non-Goals section exists precisely so this is detectable (see [The Lite PRD](#the-lite-prd) § SQ5).
- **Multiple efforts emerging** — "let's also do X" where X is clearly a separate concern, not a task
  within the current scope.
- **Duration** — the ~2 week boundary from research. Session count is a rough proxy.
- **Branch pressure** — user wanting to separate work onto different branches, which signals multiple
  concurrent concerns that Lite isn't built to manage.

**Response model:** Not "you can't do that" — transparent, honest communication:

> This project is showing signs of outgrowing Lite mode — [specific signal]. Lite is designed for
> projects you can hold in a single task list and Lite PRD. Consider graduating to Full ARC
> (`arc init --reconfigure`) where you can manage separate work units with their own PRDs, task
> lists, and lifecycle. Continuing in Lite is fine, but the framework can't help you manage this
> complexity.

**Where guardrails live:**

- **Session init** — the natural checkpoint. Already reads the task list and WORK-STATUS. A Lite-specific
  assessment step checks for signals and surfaces them in the orientation summary. Persistent — it keeps
  noting the signal until the user graduates or the signal subsides.
- **Process-task-loop** — agent awareness during execution. If the user starts describing a second effort,
  the agent flags it in the moment rather than waiting for the next session.

Exact thresholds and language are detail-design concerns. The architectural decision is: Lite has active
guardrails that detect complexity growth and nudge toward graduation.

### Graduation / Downgrade Paths

**Lite --> Full:** When a project outgrows Lite — scope expands, multiple work streams emerge, the single
task list becomes unwieldy. Graduation should be feasible and relatively seamless from a user perspective.

Mechanically: `arc init --reconfigure`. The CLI already supports reconfigure with file add/remove based
on config deltas. Graduation would:

1. Switch installation type from Lite to Full
2. Install Full-specific workflows, config, and directory structure
3. Relocate the existing task list (e.g., `active/tasks.md` --> `active/feature/tasks-{name}.md`)
4. The Lite PRD becomes the Full PRD. Mechanically: the file is relocated (e.g.,
   `active/prd.md` --> `active/feature/prd-{name}.md`) and the cut template sections
   (`Type:`, `Status/Related Work`, `Document History`) are added with empty content for the
   developer to fill in. No structural rewrite — the retained sections carry over verbatim.
5. Install backlog infrastructure if `pm.mode` is set to `arc-pm`
6. Future work follows the full pipeline

**Key constraint:** Task list format must be identical in both modes. Graduation is relocation and
infrastructure addition, not content rewrite.

**Full --> Lite:** For developers who find Full ARC too heavy:

1. Only possible when a single work unit is active (or between work units)
2. Collapse directory structure — move active task list to `active/tasks.md`
3. Remove lifecycle workflows and backlog infrastructure
4. Switch configuration

Also serves as an escape hatch: try Full ARC, find it heavy, dial back to what you actually use rather
than abandoning the framework entirely.

### Configuration and Installation

**Installation type, not config value.** Lite vs Full is the first fork in `arc init`:

```text
? Project mode
  > ARC Lite  - Execution discipline for focused projects
    Full ARC  - Complete lifecycle management
```

The choice is stored in the manifest (`install_config`), not in `arc-config.yml`. It determines what
files are installed, what config options are available, and what prompts appear during init.

**PM mode gating:** Lite + `arc-pm` is contradictory (no work unit stream for the planning module to
manage). The `pm.mode` prompt is skipped in Lite; the effective mode is `none`. Lite + `external` is an
open question — there may be value (external ticket references in context footers) but no integration
workflow to hook into. Evaluate during detail design. The prompt-gating mechanism itself (recipe
`show_when` field, partial-config evaluation, drift mitigation) is specified in [Prompt
Orchestration and Recipe Authority](#prompt-orchestration-and-recipe-authority).

**Lite config template:** Lite ships a reduced `arc-config.yml` that omits the `pm.mode` and
`team.mode` sections. This keeps the config honest about what Lite actually configures rather than
showing options that don't apply. The delivery mechanism — rename to `arc-config.template.yml` and
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

Research into industry norms (see [Research Findings](#research-findings) below) established that personal
tooling entries in project-level `.gitignore` are **not** the norm for methodology tools — the prevailing
guidance is "shared team patterns go in project `.gitignore`, user-specific tooling goes in
`~/.gitignore_global`." Global gitignore is unusable as a default (machine-wide blast radius — adding
`.arc/` there would break tracked ARC on every other repo on the same machine). That leaves
`.git/info/exclude` as the primary path, with the tracked `.gitignore` line as an opt-in for teams that
explicitly welcome tool-specific entries.

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

`.git/info/exclude` is reset on re-clone (confirmed — no native git mechanism preserves per-repo excludes
across clones; see Research Findings). Without automation this would be friction enough to undermine
Local mode. **The backing store (see next subsection) doubles as the re-clone detection signal**,
making recovery a one-prompt operation.

**Project identity** — stable across clones via git remote URL (primary) or first-commit hash (fallback
for remoteless repos). The CLI computes a project ID from these, which keys the backing store location
and persists across clones of the same repo.

**Re-clone detection flow:**

When any `arc` command runs in a repo where:

1. The computed project ID matches an existing backing store location, AND
2. The `.arc/` directory is absent or empty, AND
3. `.git/info/exclude` lacks the expected `.arc/` entry

...ARC concludes this is a fresh clone of a previously-initialized Local mode repo and offers restoration.
If all three signals align unambiguously, restoration can proceed with a single confirmation — no need
for the developer to remember the setup command exists.

**Recovery steps:**

1. Re-populate `.git/info/exclude` with the `.arc/` entry (or restore the tracked `.gitignore` line if
   that was the original setup)
2. Pull backing store contents into `.arc/`
3. Re-install hooks (local by nature; re-applied)
4. Report restoration complete; developer resumes work

### Backing Store

**Required, not opt-in.** Losing local ARC state is catastrophic — tracking spans weeks of work, and
opt-in backup would mean any developer who doesn't read carefully loses everything on disk failure.
Reliability requires this to be on by default with zero configuration friction.

**Baseline — auto-created local bare repo:**

- Location: `~/.arc-state/{project-id}.git` (or platform-equivalent — details in implementation)
- Created automatically during `arc init --local`
- Populated from `.arc/` on each handoff via the transparent portability redirect (see below)
- Full git history of ARC state, independent of the project repo
- Developer does nothing — zero configuration, zero maintenance

**Durability:** Survives project repo re-clone, accidental `rm -rf .arc/`, branch switching. Lost only
if the developer loses their home directory (at which point much else is also gone).

**Optional — remote backing store (opt-in, for cross-machine portability):**

- Developer configures a git remote on the backing store (private GitHub repo, GitLab project,
  self-hosted server)
- `arc sync` (or handoff) pushes local backing → remote
- `arc init --local` on another machine detects the backing store via project ID, offers to bootstrap
  from the remote
- Cross-machine use is a one-time setup task, not automatic
- For developers who don't need cross-machine sync, zero extra steps

**What the backing store contains:** Full snapshot of `.arc/` — including `active/`, `user/{identity}/`,
`backlog/` (if `pm.mode` is `arc-pm`), archived work, and configuration. Backup is comprehensive;
restoration is exact.

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

### What Changes vs. Tracked Full

**Changed:**

- Exclusion mechanism (`.git/info/exclude` or `.gitignore` line) and init flow
- Backing store required for durability
- Context footer format — hook enforces descriptive freeform pattern (`Context: <description>`) instead
  of task-list references, leaving zero ARC fingerprint in commit history
- Portability layer commands (`arc user save/load/push/pull`, `arc sync`) transparently redirected to
  backing store semantics
- Role concept dropped (Local drops role regardless of Lite/Full — see
  [Configurability Architecture Cleanup](#configurability-architecture-cleanup))
- `team.mode` forced to `false` (solo-ARC by definition)
- `pm.mode` either `arc-pm` (ARC's built-in PM, artifacts untracked like everything else) or
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
3. Switch context footer format in `arc-config.yml` (or remove the local-mode override)
4. Commit — standard tracked content from this point forward

No migration, no content rewrite, no file moves. Git history starts from the tracking commit; content
is continuous. The composition chain remains intact: local Lite → tracked Lite → tracked Full, each
step adds structure without rewriting what exists.

### Agent and Editor Discoverability

Editor UI features that respect gitignore rules (e.g., `@` file mentions, default editor search) will
hide `.arc/` contents from the developer's interactive surface. This affects the human's UX, not ARC's
reliability — agents load files by explicit path and workflows reference hardcoded paths, so core ARC
operations work unchanged.

**Mitigation posture:** document the friction honestly, provide `arc open <path>` CLI helpers for
direct access, and accept that we can't fix editor UI from outside the editor. Some editors expose
configuration to include gitignored files in search (`search.useIgnoreFiles: false` in VS Code, etc.);
Local mode docs mention these as developer-side options without ARC modifying editor settings.

This is a "does less where it has to" concession. The reliability of ARC's operation is not affected,
only the ergonomics of ad-hoc human navigation.

---

## Shift Lifecycle

**Cross-cutting deliverable — applies to all ARC modes.**

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

Each task list's status header carries its own state. A paused WU's task list has, for example:

```markdown
**Status:** Paused (2026-04-09) — awaiting code review from Alice
```

Or for external-blocking states (see [Finding B resolution](#finding-b-paused-vs-waiting-for-vocabulary-split) below):

```markdown
**Status:** Waiting-For Review (2026-04-09) — Alice, PR #42
```

Valid `Status:` values: `In Progress` / `Paused` / `Waiting-For {category}` / `Complete`. Inline
date in parentheses is the pause timestamp (ceremony-free, auto-observed per Clarification #4 in
the audit). Freeform reason follows the dash.

**`WORK-STATUS.md` remains branch status, single-slot.** No In Flight registry, no Active Focus
section, no template redesign. The current shape (flat Branch / Task List / Next Task fields)
stands — this decision _reduces_ scope from the earlier sketch rather than adding to it. The
semantic distinction carried in Clarification #2 of the audit is preserved: `WORK-STATUS.md`
describes the current branch's WU; it is not a multi-WU registry.

**No index file.** No `user/{identity}/IN-FLIGHT.md`, no per-dev cache, no registry file in any
form. The walk's honest-failure-mode analysis demonstrated that any cache introduces drift risk
that erodes the "trust the system" value prop, and that the self-healing discipline needed to
keep a cache trustworthy exceeds the UX benefit it provides. Task list headers are the only
state.

**Mid-session multi-WU awareness is on-demand via `/arc-status` skill.** See
[Skill Shape](#skill-shape) below. The skill reads headers and composes a current-state view
only when invoked. This keeps multi-WU reporting out of session-init orientation entirely,
aligned with the reframe above.

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
- **Scenario 5 (activate new while one is paused):** `activate-work-unit` sets new task list's
  `Status: In Progress`. Paused task list's header is untouched. No cross-workflow coordination.
- **Scenario 7 (rotate between two paused WUs):** Shift updates two task list headers +
  `WORK-STATUS.md` Active Focus (single-slot pointer to current branch's WU). Atomicity is
  local to three file writes.
- **Scenario 8 (resume after long pause):** Pause timestamp lives inline in the Status header.
  Shift reads the header on resume and surfaces a staleness warning if the interval exceeds a
  threshold (threshold TBD in detail design, see Open Questions).
- **Scenario 9 (waiting-for-review distinction):** Encoded as a specific `Status:` value. See
  Finding B resolution.

**What this decision removes from scope (vs. the earlier "In Flight registry" sketch):**

- Registry file design (none needed)
- Per-dev cache file and its rebuild/self-healing logic (none needed)
- Template redesign for `WORK-STATUS.md` (unchanged from today)
- Session-init integration work for multi-WU reporting (unchanged — session-init stays lean)
- Growth-nudge count aggregation across branches (nudge runs at shift-add time on current
  branch only; see Workflow Shape)
- Cross-file atomicity discipline between registry and task list headers (single source of
  truth means no sync concern)

The cascade of simplification from the reframe is intentional and the primary value of walking
the scenario battery carefully — the design gets smaller, not bigger.

### Document Status Headers

PRDs and task lists carry status headers today (e.g., `Status: In Progress`). Shift lifecycle
extends the vocabulary with two new values — `Paused` and `Waiting-For` — and adds an inline
date and freeform reason format. Per the
[State Lives in Task List Headers](#state-lives-in-task-list-headers-pure-option-c) resolution,
these headers are the sole source of truth for WU state; there is no cache or registry to keep
in sync.

**Header format:**

```markdown
**Status:** In Progress
**Status:** Paused (2026-04-09) — blocked on session token decision
**Status:** Waiting-For Review (2026-04-09) — Alice, PR #42
**Status:** Waiting-For Approval (2026-04-09) — ARB signoff expected Thursday
**Status:** Complete
```

**Valid Status values:**

- `In Progress` — active work. Default state for an activated WU.
- `Paused` — developer is the next mover; they set it aside and will return to do more work.
  Counts against the growth nudge (WIP pressure).
- `Waiting-For {category}` — external actor is the next mover; the developer cannot unblock it
  from their side. Does **not** count against the growth nudge — waiting on three PRs is a
  normal pipeline, not WIP pressure.
- `Complete` — terminal state, prelude to archival.

**`Waiting-For` categories** (initial set, may expand during detail design):

- `Review` — awaiting code review
- `Approval` — awaiting stakeholder / ARB / compliance signoff
- `Delivery` — awaiting downstream deployment or external artifact
- `Decision` — awaiting a decision from someone else (not a self-decision — that's `Paused`)
- `Other` — freeform, with the reason string carrying the detail

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

- **PRD status header** — updated on shift transitions (Status value + date + reason)
- **Task list status header** — updated on shift transitions (same format)
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

**State-update steps (common to all transitions):**

1. Gather reason and context (ask if not supplied and transition needs one)
2. Optionally snapshot SESSION-NOTES to the WU's directory as preserved context
3. Update the affected task list(s) Status headers — e.g., feature-x header flips from
   `In Progress` to `Paused (YYYY-MM-DD) — reason`, and for rotations feature-y's header flips
   from `Paused` (with its own old timestamp) to `In Progress`
4. Update PRD Status header(s) to match (same format as task list)
5. Update `WORK-STATUS.md` to reflect the new current-branch WU (single-slot, branch-local)
6. Persist — commit in tracked Full (via arc-commit invocation or inline commit step), backing
   store sync in Local

Step 3 is the canonical state write. Everything else derives from it or is a surface for local
discoverability. There is no registry file or cache to keep in sync — task list headers are the
single source of truth per the
[State Lives in Task List Headers](#state-lives-in-task-list-headers-pure-option-c) decision.

**Growth nudge:** On pause transitions (not resume), after updating the task list header, the
workflow counts current-branch task lists with `Status: Paused` (excluding `Waiting-For`
categories per Finding B). If the count is ≥3, surface a soft nudge: "N paused WUs — consider
`/arc-status` to review whether any should be archived or resumed." Advisory, not blocking.
Current-branch-only count may undercount in multi-branch tracked Full juggling scenarios; the
nudge is intentionally advisory, and the cost of an occasional false-negative is accepted.

**Resume-side additions:**

On resume transitions, the workflow additionally:

1. Surfaces the preserved SESSION-NOTES snapshot (if any) as recovery context
2. Checks branch alignment in tracked Full, suggests the switch if needed
3. Reads the pause timestamp from the task list Status header and reports pause age (e.g.,
   "paused 2d ago", "paused 3w ago — assumptions may be stale"). If the interval exceeds a
   staleness threshold (TBD in detail design — see Open Questions), surfaces a prompt to
   re-read PRD/task list before proceeding

### Session-Init Integration

**Session-init stays unchanged from today.** Multi-WU awareness is an on-demand concern, not a
session-init concern. Per the reframe that drove the
[State Lives in Task List Headers](#state-lives-in-task-list-headers-pure-option-c) decision,
paused and waiting-for WU information is not load-bearing for every session orientation — the
developer already knows what they paused, and if they need a reminder they can invoke
`/arc-status` (see [Skill Shape](#skill-shape)).

Session-init continues to read `WORK-STATUS.md` as the branch-local WU pointer and reports that
single WU's state (branch, current task, next action, blockers). It does not scan `active/` for
paused task list headers. It does not summarize cross-WU state. This keeps the orientation
summary focused on "what am I doing right now?" — which is all session-init needs to answer
for the common single-WU case, and all it _should_ answer for the multi-WU case where extra
information would be noise.

The only session-init touchpoint the shift lifecycle adds is **drift detection** — if
`WORK-STATUS.md` points to a task list whose Status header reads `Paused` or `Waiting-For`,
the orientation surfaces the mismatch ("WORK-STATUS says active, but the task list is paused —
did you shift in another session and forget to commit `WORK-STATUS.md`?"). This is a safety
check, not a multi-WU report.

**Growth nudge is not a session-init concern.** It fires at pause-transition time inside the
shift workflow, not at every session start. See Workflow Shape above.

### Skill Shape

Two skills ship with the shift lifecycle, both following the established thin-skill pattern
(skill file is a short pointer; the workflow carries the logic).

#### `/arc-shift` — pause/resume/rotate transitions

Backed by `shift-work-unit.md`. Handles the state transitions described in
[Workflow Shape](#workflow-shape) above.

User invocations that naturally route through `/arc-shift`:

- "Let's shift this aside while we wait on review"
- "Shift to feature-y"
- "Let's shift back to feature-x now that review landed"
- "Shift this and start the auth refactor incidental WU"

#### `/arc-status` — mid-session work orientation ("toggle HUD")

Backed by `mid-session-status.md` (new workflow in `session-lifecycle/`). Provides on-demand
warm orientation — a concise snapshot of current work state composed from a small targeted set
of reads, distinct from the cold orientation session-init performs.

**Why this skill exists:** It is the answer to the "how do I see paused/in-flight WUs?" question
that the [State Lives in Task List Headers](#state-lives-in-task-list-headers-pure-option-c)
decision deferred out of session-init. But it earns its keep well beyond the multi-WU case —
the most common use is a mid-session refresher when the developer has stepped away, switched
contexts, or simply wants a quick "where am I?" bookmark without restarting the session.

**Slot in the session lifecycle:**

```text
/arc-resume    — cold orient at session start  (workflow: session-init.md)
/arc-status    — warm orient mid-session       (workflow: mid-session-status.md)
/arc-handoff   — close session at end          (workflow: session-handoff.md)
```

Three skills, three workflows, three lifecycle points. Symmetric and cleanly namespaced.

**Naming note:** This name becomes available during the ARCd rebrand WU, which renames the
existing `arc status` CLI command (framework installation health) to `arcd health`, freeing
the `arc-status` name for this skill. The skill is a slash-command invocation (`/arc-status`)
and occupies a different namespace from CLI binaries anyway, but the rename resolves the
naming ambiguity at its root. See
[`plan-arcd-rebrand.md`][arcd-rebrand] § Implementation Scope → CLI command surface cleanup.

**Output shape:**

```markdown
**Current focus** · `branch-name` · clean|dirty

- **Working on**: feature-x, Task 4.2 — Implement token validation
- **Since session start**: 3 tasks completed (Tasks 3.5, 4.0, 4.1), 2 commits landed
- **Uncommitted**: [files, if any] | none

**In flight** · [only shown if >1 WU, otherwise omitted entirely]

- **Paused**: incidental-auth-refactor (paused 2d ago — blocked on session token decision)
- **Waiting for**: feature-y (review from Alice, 1d ago)

**Next action**: Resume token validation in Task 4.2.b — schema check for malformed tokens

**Flags**: [blockers, quality gate state, stale assumptions, etc. — or omitted]
```

**Composition rules:**

- **Conditional sections.** Single-WU sessions do not see the "In flight" block. No blockers
  means no "Flags" block. Only show what is load-bearing right now. The output is
  length-variable by design — a clean single-WU session might be three lines; a multi-WU
  session with blockers might be ten. Either way, no noise.
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

1. `git status` + `git log HEAD@{session-start}..HEAD` — working-tree state, commits since
   session start
2. `WORK-STATUS.md` — current WU pointer (with drift detection against the task list header
   per the Session-Init Integration note)
3. **Current task list** (path from `WORK-STATUS.md`) — checkbox state of current phase, used
   to compute "what has been completed this session" by cross-referencing the checkbox
   transitions with the git log since session start
4. **Scan of current-branch `active/`** for task list Status headers — only included in output
   if any show `Paused` or `Waiting-For`; completely omitted otherwise (the "In flight" block
   does not appear for single-WU sessions)
5. `SESSION-NOTES.md` Persistent Context section — for active constraints worth restating if
   relevant to the current state

**Use cases:**

- "I stepped out for lunch — what was I doing?" (post-context-switch bookmark)
- "I've been working for a while, quick check on where I am" (mid-session refresh)
- "What's next after this?" (looking ahead when the current unit lands)
- "What else do I have in flight?" (multi-WU visibility on demand — the original driver)
- "I suspect my WORK-STATUS.md is stale — what does the world actually look like?" (drift
  detection)

**Out of scope for this skill:**

- Installation/framework health (that is `arcd health` post-rebrand)
- Team-aggregate view across developers (requires cross-identity git notes aggregation,
  deferred to external tooling or a future WU)
- Cross-branch paused-WU enumeration in tracked Full — by default the skill only sees
  current-branch state. A `--all-branches` opt-in flag (or equivalent agent behavior) can
  perform an on-demand git query for task lists with paused Status headers across all
  branches when the user explicitly asks. Pay-for-what-you-request.

### Integration Interaction with Shift States

The shift lifecycle introduces `Paused` and `Waiting-For {category}` as valid mid-flight states for
an in-progress work unit. `integrate-work-unit.md` is the terminal transition point — it takes a
completed WU and prepares it for merge. Without explicit handling, the expanded state vocabulary
leaves an ambiguity: what should integrate do when invoked on a WU whose task list header reads
something other than `In Progress`?

#### Current workflow does not validate the Status header

A reading of `integrate-work-unit.md` clarifies the pre-shift-lifecycle behavior. Step 1 ("Verify
Work Completion") is agent-enforced prose. Its validation checks are: all subtasks and parent
tasks marked `[x]`, Success Criteria all checked, quality gates passed.

The Status header line in Step 1 — `[ ] Task list header **Status:** updated to Complete` — is
phrased as an **imperative**, not a gate. It instructs the agent to ensure the header says
`Complete` before proceeding, and the transition itself is a silent side effect of Step 2's
`clean-work-unit.md` Mode 2 run (which sets `Status: Complete` unconditionally during doc cleanup).
There is no validation today that refuses integration if the current Status value is something
else — the workflow effectively assumes `In Progress` and rewrites the header during prep.

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

A related open question from the working doc: **does `integrate-work-unit` or `/arc-shift` own
the final `→ Complete` state transition?** The resolution: **integrate owns it.**

- `/arc-shift` owns _mid-flight_ transitions: pause, resume, rotate. These are reversible and
  expose personal developer state changes while a WU is in flight.
- `integrate-work-unit` owns the terminal `→ Complete` transition. It is coupled to the merge
  operation and is not a "shift" — it is the close-out.

This is already implicitly true today (`clean-work-unit.md` Mode 2 performs the transition during
integrate's Step 2). The resolution does not move the transition; it preserves locality — the
workflow that finalizes the WU owns the final state write — while making the entry-state check
explicit upstream. `/arc-shift` never writes `Status: Complete`.

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

- **Multi-paused limit policy** — hard cap, soft nudge, or configurable? Leaning toward soft nudge at
  ~3 with no hard cap, but this is detail design.
- **Pause-reason taxonomy** — should reasons be freeform, or structured with categories (`awaiting-review`
  / `blocked-external` / `deferred` / `other`)? Freeform is simpler; structured enables better
  reporting. Revisit during detail design.
- **Cross-branch paused visibility in tracked Full** — is branch-local paused state sufficient, or
  should there be a way to see "all paused WUs across all branches" from one location? Lean
  branch-local for simplicity, revisit if team mode dogfooding says otherwise.
- **Expected-resume-date field** — useful context ("expected back Thursday") but potentially stale.
  Consider during detail design.

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
- Contains: `active/prd.md`, `active/tasks.md`, `active/WORK-STATUS.md`,
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

**Four axis movements:**

1. **Lite → Full (tracked):** `arc init --reconfigure` adds work unit lifecycle, relocates task
   list into `active/feature/`, Lite PRD is relocated and gains the previously-cut template sections
   (see [Graduation / Downgrade Paths](#graduation--downgrade-paths) step 4), backlog infrastructure
   installed if `pm.mode: arc-pm` selected
2. **Local → tracked (Lite variant):** remove exclusion entry, `git add .arc/`, standard commit;
   role concept becomes available (reconfigure may prompt for it)
3. **Local → tracked (Full variant):** same as above, plus lifecycle artifacts already present
4. **Lite → Full (local variant):** reconfigure adds lifecycle workflows while keeping exclusion
   and backing store

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
(after `project_name`, before `tools`), and gates `pm.mode` / `team.mode` on
`install.type == full`. See [Prompt Orchestration and Recipe
Authority](#prompt-orchestration-and-recipe-authority) for the mechanism — schema delta, helper
contract, wire points, and drift mitigation.

Flags for non-interactive use:

- `--install-type <lite|full>` (canonical; default: `full` — matches back-compat behavior)
- `--lite` / `--full` (shorthand aliases for `--install-type`; mutually exclusive)
- `--local` / `--tracked` (default: tracked, the common case)
- `--shared-gitignore` (Local only, opt-in for teams that welcome tool-specific tracked entries)

---

## Configurability Architecture Cleanup

**In-scope for modes WU.** Covers the mode-specific config surface and orthogonal-axis enforcement.
The mechanical `pm.mode: arc-in-git` → `pm.mode: arc-pm` rename and its associated doc sweep have
been extracted into the [ARCd Rebrand][arcd-rebrand] work unit — they compose naturally with the
rebrand's own config file rename (`arc-config.yml` → `ARCd-config.yml`) and content sweep, and
modes WU depends on landing the renamed foundation first. This section covers what remains in
modes WU.

### Mode-Aware Config Template Mechanism

**Delivery mechanism:** [Lite Config Template Mechanism](#lite-config-template-mechanism) in the
Design Investigations section above specifies the install-time delivery mechanism — a single
`arc-config.template.yml` file processed through the existing render pipeline, with `<!-- arc:if
... -->` directives gating mode-specific sections. This section describes the **conceptual** layer
composition (what each axis contributes); the mechanism is flat per-axis `arc:if` directives
testing each axis independently, not a code-level "layer" construct.

Each mode axis (Lite/Full, Tracked/Local) contributes its own deletions and overrides to the
`ARCd-config.yml` template. The two axes compose orthogonally: each layer applies independently,
and when combined, both layers' changes are applied.

**Lite layer (contributes when install type is Lite):**

- Omits `pm.mode: arc-pm` option (Lite has no work unit stream for the planning module)
- Forces `team.mode: false` (Lite is solo-bounded methodology)
- Does not touch `arc.role` (neutral on the tracked/local axis)
- Omits lifecycle-related settings if any exist

**Local layer (contributes when install type is Local):**

- Omits `arc.role` (role is a Tracked concept — see below)
- Forces `team.mode: false` (Local is solo-ARC by definition)
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

### Portability Layer Redirect (Transparent)

The `arc user save/load/push/pull` and `arc sync` commands target `refs/notes/arc/user/{identity}`
in tracked mode and the backing store in Local mode. The developer never writes different commands
— the CLI reads install mode from the manifest and does the right thing. Docs for Local mode include
a brief "under the hood: where your state lives" section for debugging, but daily use is mode-agnostic.

### Forbidden Combinations

- **Local + `team.mode: true`** — forbidden. Local is solo-ARC by definition; team mode requires
  shared state that Local's exclusion mechanism prevents.
- **Local + `arc.role` set to any value** — forbidden. Role is a tracked concept; Local installs
  omit the setting entirely. CLI refuses `arc init --local --role=contributor` with an
  explanatory error.
- **Lite + `pm.mode: arc-pm`** — forbidden. Lite has no work unit stream for the planning module
  to manage. Lite installs force `pm.mode: none` implicitly. (Whether Lite + `pm.mode: external`
  has value remains an open question — see Open Questions.)

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

## Content Audit

Once detail design begins, audit all framework domains to classify each file, concept, and setting
by mode applicability. Uses the methodology/implementation classification from the Methodology
Maturation work unit and the conditional content analysis
(`analysis-conditional-content-architecture.md`) as its foundation.

**Categories:**

- **Unchanged**: Works identically across all modes (e.g., hooks, commit format methods, most dev rules)
- **Modified**: Present but adapted (e.g., session-init with simpler discovery in Lite, context footer
  behavior in local mode, process-task-loop without work unit lifecycle references)
- **Excluded**: Not installed or loaded (e.g., strategy-work-organization in Lite, backlog files in
  Lite, activation/archival workflows in Lite)
- **Relocated**: Same content, different tracking (e.g., WORK-STATUS in local mode — same file, untracked)

**Audit domains:**

- **Strategy documents** — applicability per mode, which sections load on-demand
- **Workflow documents** — same content or mode-aware variants; shift lifecycle additions
- **Constitutional documents** — DEV-RULES sections referencing work unit concepts and role
- **Session-init document set** — what loads in each mode, in what order
- **Templates installed by `arc init`** — per-mode file inclusion/exclusion
- **CLI commands** — available, hidden, or guarded by install mode; transparent portability redirects
- **Configurability architecture** — `ARCd-config.yml` settings per mode, forced values, omitted
  options, repurposed semantics, forbidden combinations. Feeds the Lite and Local mode config
  templates and CLI init-time validation. (Note: the `pm.mode` rename's mechanical sweep is handled
  in the [ARCd Rebrand][arcd-rebrand] WU.)
- **Lifecycle transitions** — shift workflow, status header updates across PRDs and task lists,
  WORK-STATUS In Flight registry, session-init reporting changes

### Phrasing Sweep (Mode-Aware Content Updates)

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
- **QUICK-REFERENCE** sections that assume tracked mode for commands like `arc sync`
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

## Resolved Decisions

Decisions settled during the 2026-04-09 and 2026-04-10 design iterations. Each entry names the
decision and a brief rationale; the full reasoning is in the relevant section above.

| Decision                                                                | Resolution                                                                                                                                                                                                                                                                               |
|-------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Local mode exclusion — primary                                          | `.git/info/exclude` (research-verified industry norm for per-user tooling)                                                                                                                                                                                                               |
| Local mode exclusion — opt-in                                           | Tracked `.gitignore` line via `--shared-gitignore` flag                                                                                                                                                                                                                                  |
| Local mode exclusion — dropped                                          | Global gitignore (machine-wide blast radius breaks coexistence with tracked ARC)                                                                                                                                                                                                         |
| Backing store                                                           | Required, auto-created git-based local bare repo; durability + re-clone detection signal                                                                                                                                                                                                 |
| Project ID                                                              | Git remote URL primary, first-commit hash fallback                                                                                                                                                                                                                                       |
| Re-clone UX                                                             | Backing-store + absent-`.arc/` + missing-exclude → restoration flow, one-prompt recovery                                                                                                                                                                                                 |
| Cross-machine portability                                               | Opt-in remote on backing store, not automatic                                                                                                                                                                                                                                            |
| Local + Full combination                                                | Supported via single-active invariant + shift lifecycle                                                                                                                                                                                                                                  |
| Single-active invariant framing                                         | ARC tracks work units not branches; git usage unconstrained                                                                                                                                                                                                                              |
| Shift lifecycle — inclusion                                             | In-scope for this work unit (not deferred); universal, applies to all ARC modes                                                                                                                                                                                                          |
| Shift lifecycle — approach                                              | Metadata-in-place (no file moves); task list Status headers as single source of truth; no registry file, no per-dev cache                                                                                                                                                                |
| Shift lifecycle — state location                                        | Pure Option C (2026-04-09 decision after B-vs-C scenario walk). Task list headers carry Status, date, reason. `WORK-STATUS.md` stays single-slot                                                                                                                                         |
| Shift lifecycle — multi-WU awareness                                    | On-demand via `/arc-status` skill, not baked into session-init. Session-init orientation remains single-WU focused                                                                                                                                                                       |
| Shift lifecycle — skills                                                | Two skills: `/arc-shift` (transitions, workflow `shift-work-unit.md`) and `/arc-status` (mid-session HUD, workflow `mid-session-status.md`)                                                                                                                                              |
| Shift lifecycle — uncommitted work                                      | Workflow surfaces state, recommends commit, allows stash or leave-as-is                                                                                                                                                                                                                  |
| Shift lifecycle — document status headers                               | PRDs and task lists updated in sync via the Status header (inline date + reason format); supplementary docs deferred to implementation                                                                                                                                                   |
| Shift lifecycle — vocabulary (Finding B)                                | Two-state split: `Paused` (dev is next mover, counts toward WIP nudge) vs `Waiting-For {category}` (external is next mover, excluded from nudge)                                                                                                                                         |
| Shift lifecycle — growth nudge                                          | Fires at pause-transition time inside shift workflow, not at session-init. Current-branch count; ≥3 paused is advisory                                                                                                                                                                   |
| Shift lifecycle — Finding C (pause pointers)                            | No rename needed. The `Paused:` pointer field in `clean-work-unit.md` and the new Status header vocabulary do not collide (different field shapes, different semantics). Formalizing the four pointer fields is an independent doc sweep, not shift-blocking                             |
| Shift lifecycle — `PROJECT-STATUS.md`                                   | Stays project-focus oriented. Updated at activate/archive only, not at personal shift operations. Paused WUs still appear as project focus until archived (ownership-of-tracked-state framing)                                                                                           |
| Shift lifecycle — CLI naming coordination                               | `arc status` (framework health CLI) rename to `arcd health` absorbed into [ARCd Rebrand][arcd-rebrand] WU, freeing `/arc-status` for the mid-session skill                                                                                                                               |
| Integrate × shift states — entry contract                               | `integrate-work-unit` accepts `In Progress`, `Complete`, and all `Waiting-For {category}` values. `Paused` triggers an inline warn-and-confirm prompt. Entry check inserted at top of Step 1; transition to `Complete` remains in `clean-work-unit.md` Mode 2                            |
| Invocation-as-assertion semantic for `Waiting-For`                      | Running integrate on a `Waiting-For` WU is the user's assertion that the wait is over. Workflow does not validate what was waited for; the invocation itself carries the signal, and the transition proceeds through the standard path                                                   |
| `Paused` handling at integrate                                          | Warn-and-confirm inline (default no), not hard refuse with a `--force` flag. Matches ARC's warn-and-confirm idiom elsewhere. User confirmation proceeds through standard path; transition to `Complete` happens in `clean-work-unit.md` Mode 2 like any other accepted state             |
| Terminal `→ Complete` transition ownership                              | `integrate-work-unit` owns the terminal state write (via `clean-work-unit.md` Mode 2). `/arc-shift` owns mid-flight transitions (pause/resume/rotate) only and never writes `Status: Complete`. Locality: the workflow that finalizes the WU owns the final state write                  |
| ADR authoring for integrate × shift states                              | Not a standalone ADR. Behavioral extension of the shift-lifecycle vocabulary — composes with the shift-lifecycle ADR that Findings #8, #9, and #10 defer to PRD implementation                                                                                                           |
| Context footer in Local mode                                            | Enforced descriptive freeform pattern via commit-msg hook                                                                                                                                                                                                                                |
| Role concept applicability                                              | Tracked concept. Applies in Full+tracked AND Lite+tracked (OSS solo-dev scenario). Dropped in Local regardless of Lite/Full.                                                                                                                                                             |
| `team.mode` in Local mode                                               | Forced `false`                                                                                                                                                                                                                                                                           |
| `user.sync_push` in Local mode                                          | Same shape, semantic redirected to backing store                                                                                                                                                                                                                                         |
| Portability commands in Local mode                                      | Transparent redirect by install mode (`arc user save/load/push/pull`, `arc sync`)                                                                                                                                                                                                        |
| `pm.mode: arc-in-git` → `arc-pm` rename                                 | Scope migrated to [ARCd Rebrand][arcd-rebrand] WU (composes with `arc-config.yml` → `ARCd-config.yml` rename and content sweep)                                                                                                                                                          |
| Mode axes composition                                                   | Lite/Full and Tracked/Local are orthogonal; four combinations all valid; each axis contributes independent changes to the config template                                                                                                                                                |
| Lite + Local development                                                | Intertwined, not sequential — shared machinery (config templates, init flow, session-init, audit, phrasing sweep) dominates unique per-mode work                                                                                                                                         |
| WU scope split                                                          | pm.mode rename + mechanical content sweep → rebrand WU; pre-PRD audit + shift lifecycle + Lite + Local (intertwined) → modes WU                                                                                                                                                          |
| Content audit scope                                                     | Expanded to include configurability architecture and lifecycle transitions; mode-aware phrasing sweep added as implementation activity                                                                                                                                                   |
| Branch / Active Focus mismatch UX                                       | Orientation reports facts without editorializing; escalation only on work-affecting actions                                                                                                                                                                                              |
| Solo-dev blind spot audit                                               | Gating pre-PRD deliverable of this work unit (not atomic, not deferred)                                                                                                                                                                                                                  |
| Lite PRD artifact name                                                  | Still called a PRD (not "scope brief"). Keeps framework coherence across modes, makes graduation a content migration. See [The Lite PRD](#the-lite-prd)                                                                                                                                  |
| Lite PRD template cuts                                                  | Drops `Type:` header field, `Status/Related Work` header block, `Document History` section. Retains all other sections with softened guidance in User Stories, Functional Requirements, Non-Goals                                                                                        |
| Lite `create-prd` workflow shape                                        | Unified `create-prd` workflow with mode-conditional edges (Pre-Step 0 branch context, META-PRD review, Step 2 category classification, Step 4 template + save location). ~90% mode-neutral                                                                                               |
| META-PRD in Lite                                                        | Not installed. Project vision captured in the Lite PRD itself. META-PRD template assigned to `install.type == full` bucket                                                                                                                                                               |
| Lite `plan-*` doc location                                              | `.arc/active/plan-{name}.md` — sibling to `prd.md` and `tasks.md` in the flat `active/` directory                                                                                                                                                                                        |
| Lite PRD filename                                                       | Singular `prd.md`. One PRD per Lite project; need for multiple is a soft graduation signal                                                                                                                                                                                               |
| Lite Non-Goals framing                                                  | Elevated as explicit scope guardrail. Template carries a guardrail note; `create-prd` Step 3 spends deliberate time on Non-Goals elicitation to compensate for absent WU-lifecycle guardrails                                                                                            |
| Lite ship step protocol                                                 | Three-step protocol reusing Full's Success Criteria section convention: (1) Success Criteria all `[x]` or `[~]`, (2) Tier 3 quality gates, (3) aggregate diff review. No new template section or workflow concept                                                                        |
| Installation type mechanism                                             | Symmetric additive via `install.type` condition in the recipe. Three buckets: unconditional baseline, `install.type == full`, `install.type == lite`. Zero recipe schema change, zero `resolveFileList()` change                                                                         |
| Installation type config key                                            | `install.type` (dotted form, consistent with existing `pm.mode`, `team.mode`, `branch.protection`)                                                                                                                                                                                       |
| Manifest `install_config` schema extension                              | Gains `install_type: string` required field. Manifest schema version bumps. Legacy manifests migrate with `install_type: "full"` default                                                                                                                                                 |
| ADR authoring sequencing                                                | ADRs are implementation-phase deliverables, not pre-PRD artifacts. Flow: working doc → plan doc → PRD → task list → ADR during execution. `install.type` mechanism ADR lands as an explicit task deliverable in the PRD                                                                  |
| Recipe authority scope (prompts)                                        | Framing C — recipe owns prompt identity, `config_key` / `token` mapping, and gating (`show_when`). Hand-rolled code keeps UX. Framing A (hand-coded gating) rejected as no DRY progress; Framing B (full data-driven loop) rejected as speculative schema bloat                          |
| Recipe `show_when` field                                                | New optional field on `RecipePrompt`. Same `CONDITION_PATTERN` grammar as existing `recipe.conditions` keys — reuses `evaluateCondition()` as-is. Validator extension is a single regex check                                                                                            |
| `shouldShowPrompt()` helper                                             | Pure function in `lib/template/recipe.ts` alongside `evaluateCondition()`. Partial-config-safe via existing undefined-key handling (returns false for not-yet-answered references)                                                                                                       |
| `install.type` prompt position                                          | Position 2 in the recipe prompts array (after `project_name`, before `tools`). Ordering constraint: must precede any prompt that references `install.type` in `show_when`. Documented convention, not structural check                                                                   |
| `install.type` prompt default                                           | `"full"` — matches back-compat (legacy manifests migrate with `install_type: "full"`) and the common case. Non-interactive `arc init --yes` without `--install-type` produces a Full install                                                                                             |
| `install.type` canonical flag                                           | `--install-type <lite\|full>`. Shorthand aliases `--lite` / `--full` supported, mutually exclusive. Matches plan-doc § Init Flow Implications                                                                                                                                            |
| Gated prompts (initial set)                                             | `pm_mode` and `team_mode` both gated on `install.type == full`. No other prompts need gating (verified against Finding #1's Lite PRD landing — workflow-level conditionals happen at template render time, not init prompt time)                                                         |
| Skipped-prompt default semantics                                        | Gated-out prompts take their value from the recipe `default` field. `pm_mode` → `"none"`, `team_mode` → `false`. Matches existing Lite semantics already in § Configuration Identity                                                                                                     |
| `buildConfigMap` / `buildConfigKeyOverrides` / `buildTokenMap` refactor | Iterate `recipe.prompts` for `config_key` and `token` mapping instead of hardcoded constants. `user.sync_push` derivation from `team_mode` and `REPO_ROOT` computed token stay in code                                                                                                   |
| Drift mitigation                                                        | Unit tests comparing recipe prompt IDs to exported `INIT_PROMPT_IDS` / `RECONFIGURE_PROMPT_IDS` constants maintained alongside the hand-rolled loops. Rejected `validateRecipe()` runtime check (layering violation or re-introduces duplication)                                        |
| Reconfigure boundary for `install.type`                                 | `arc init --reconfigure` does NOT mutate `install.type`. Lite↔Full transition is a distinct CLI surface — Finding #16 for downgrade, § Graduation / Downgrade Paths for upgrade. Framing C's helper and refactor are reusable there                                                      |
| ADR authoring for Framing C                                             | Deferred to PRD implementation. Likely combined with Finding #8 mechanism ADR under a shared "recipe as authoritative install-time specification" umbrella; PRD decides single vs combined based on writing economy                                                                      |
| Lite config template mechanism                                          | Approach 2 — rename `system/arc-config.yml` → `system/arc-config.template.yml` and gate Full-only sections with `<!-- arc:if install.type == full -->` directives. Processed through the existing render pipeline. Single source of truth, no file duplication                           |
| Render pipeline already extension-agnostic                              | `needsRendering()` in `lib/classification.ts` matches `/\.template\.[^/]+$/` today. `renderConditionals()` has zero markdown assumptions (line-based, HTML-comment directives, YAML-safe blank collapse). No render pipeline extension is required for Approach 2                        |
| arc-config render composition order                                     | `renderConfigOverrides(renderConditionals(renderTokens(raw, tokens), config), overrides)`. Tokens → conditionals → overrides. Overrides must apply after conditionals so keys inside stripped blocks are never "overridden" into a file where the key is absent                          |
| arc-config call-site restructuring                                      | `renderTemplate()` in `apply.ts` and its inline mirror in `commands/init.ts` fall through to the normal `needsRendering()` branch, then apply `renderConfigOverrides()` as a post-pass when `templateFile === ARC_CONFIG_TEMPLATE_PATH`. One conditional restructured, no new code paths |
| arc-config gated section set                                            | Two contiguous blocks: `# --- Project Management ---` / `pm.mode` section and `# --- Team Mode ---` / `team.mode` section. Everything else (branch, commit, merge, hooks, review, platform, user) is universal across install types                                                      |
| `ARC_CONFIG_TEMPLATE_PATH` constant rename                              | Flips from `"system/arc-config.yml"` to `"system/arc-config.template.yml"` in `lib/constants.ts`. `CONFIGURABLE_FILES` set entry in `lib/classification.ts` flips to match                                                                                                               |
| arc-config manifest lifecycle during rename                             | Zero migration cost. Manifest entries are keyed by output path (`system/arc-config.yml`), which is stable across the template rename. Existing installs rebuild pristine via the standard Configurable-file three-way merge on next `arc update`                                         |
| Approach 1 (two separate arc-config files) rejected                     | Duplicates universal config content (branch, commit, merge, hooks, review, platform, user sections) across two files. Silent divergence risk on every feature add. Only justification was "Approach 2 requires render pipeline extension"; that premise is false                         |
| Finding #1 template delivery closed via consistency                     | `template-prd.md` stays in the unconditional baseline and carries both variants via `arc:if`, matching `arc-config.template.yml`. Shipping it as a two-file variant would split "how template content is mode-gated" across two mechanisms for no gain                                   |
| ADR authoring for Lite config template mechanism                        | Deferred to PRD implementation. Likely combined with Findings #8 and #9 ADR under the "recipe as authoritative install-time specification" umbrella — three mechanism siblings covering whole-file installation, prompt orchestration, and within-file content rendering                 |

## Open Questions

### ARC Lite

1. ~~**Naming**~~: **Resolved** — ARC Lite (will become ARCd Lite after rebrand).

2. ~~**Scope artifact design**~~: **Resolved** (2026-04-10) — it's still a PRD, with a reduced template
   and a unified `create-prd` workflow carrying mode-conditional edges. See [The Lite PRD](#the-lite-prd)
   for template cuts, workflow shape, and sub-decisions.

3. ~~**"Ship" step specifics**~~: **Resolved** (2026-04-10) — three-step protocol reusing Full's
   Success Criteria section convention: Success Criteria all `[x]` or `[~]`, Tier 3 quality gates,
   aggregate diff review. See [Enforced Sequence](#enforced-sequence) § Ship step.

4. **Task list simplifications**: Does Lite default to single-phase task lists? Are multi-phase lists
   available but unusual, or actively discouraged? Does phase structure imply lifecycle complexity that
   Lite shouldn't have?

5. **Session management simplifications**: What does Lite session-init look like? The document loading
   is the same core set, but discovery and lifecycle assessment are absent. Is the full session handoff
   ceremony appropriate, or does Lite need a lighter version?

6. **Process-task-loop adjustments**: The loop references work unit concepts (atomic companion files,
   incidental work routing to backlog, coherent unit protocol). These need conditional handling or
   removal in Lite. Separate template variant or in-prose conditionals?

7. **Strategy applicability mapping**: Which strategies apply in Lite? Core philosophy, session
   operations, quality gates, task list formatting — yes. Work organization, planning module — no.
   Need a clear mapping for the content audit.

8. **Guardrail thresholds**: What are the specific trigger thresholds for graduation nudges? Task list
   size, session count, scope drift detection — these need calibration. Too sensitive is annoying;
   too lax defeats the purpose.

9. **Default mode question**: Should `arc init` default to Lite (on-ramp argument) or always ask
   (informed choice argument)? Affects adoption story.

10. **Lite + external PM**: Is there meaningful value in `pm.mode: external` within Lite? If so, what
    does it concretely provide? If not, Lite is always `pm.mode: none` implicitly.

### Shift lifecycle (detail design)

Most registry / multi-WU / vocabulary questions were resolved on 2026-04-09 (see
Resolved Decisions table). These remaining items are narrower detail-design questions that can
be settled at PRD time or implementation time.

11. **Multi-paused limit policy**: Hard cap, soft nudge only, or configurable? Current direction
    (Resolved Decisions) is soft nudge at ~3 with no hard cap. Still open: is the threshold
    itself configurable, or hardcoded at 3? Research supports 2–3 as the natural range.

12. **Waiting-For category taxonomy finalization**: Initial set is `Review` / `Approval` /
    `Delivery` / `Decision` / `Other`. Is this exhaustive enough? Should any categories be
    added or renamed during detail design? Freeform reason handles detail; the category is
    for triage semantics.

13. **Staleness threshold for long-pause resume prompt**: When shift resumes a WU, at what pause
    interval should the "your mental model may be stale, re-read the PRD" prompt fire?
    1 week? 2 weeks? Configurable per project? Per-WU? (Clarification #4 in the audit sets
    the direction but not the number.)

14. **`/arc-status` drift detection threshold**: The skill checks for `WORK-STATUS.md` vs task
    list header drift. Should it also flag drift between `Paused At` date in the header and the
    actual last-commit date on the task list file? Second-order concern — only relevant if
    headers are edited manually without shift.

### Cross-cutting

15. **Initial setup workflow impact**: The current `01_verify-and-configure.md` and
    `02_define-project.md` assume Full ARC tracked. Lite and Local each need different setup paths.
    Separate workflows per mode, or a unified workflow with mode-conditional sections?

---

## Research Findings

External research conducted 2026-04-01. Key findings organized by relevance to design decisions.

### Execution discipline is scale-independent (PSP evidence)

Humphrey's Personal Software Process research demonstrates that structured execution practices — task-level
discipline, commit standards, code review at ~200 LOC/hour — reduce defect density with statistical
significance, independent of project size. TSP implementations showed 94% on-time delivery at Microsoft
India. The discipline itself drives quality, not the planning ceremony around it. This validates the core
hypothesis: execution discipline (what Lite keeps) is the high-value layer.

### Duration boundary: ~2 weeks

Research points to a natural breakpoint around project duration:

- **< 2 weeks with clear scope**: Planning pipeline overhead exceeds its value. Execution discipline
  alone is sufficient.
- **2-8 weeks**: Lightweight planning has value (optional PRD, some scope documentation).
- **> 8 weeks or high integration complexity**: Full planning pipeline justified.

### Ceremony proportionality: 15-20% threshold

Process overhead becomes counterproductive when ceremony time exceeds 15-20% of total project time. For a
2-hour project, even 20 minutes of setup is ~17% — right at the threshold. For a 2-week project, 30
minutes of ceremony is trivial (~0.6%). This suggests Lite should target near-zero setup time.

### Graduation triggers should be signal-based

Rather than time-based thresholds, introduce planning ceremony when:

- Unplanned work emerges mid-project (scope wasn't as clear as assumed)
- Scope clarification starts consuming > 10% of available time
- Task count exceeds working memory (~3-5 concurrent concerns) without external tracking
- Multiple concurrent work streams emerge

These are more actionable than arbitrary duration cutoffs and could inform the graduation CLI experience.

### Solo developer adoption patterns

Practitioners consistently adopt: frequent commits (traceability + recovery), feature branches even for
solo work, automated testing, structured commit messages. Practitioners consistently abandon: planning
documents, formal review ceremonies, lifecycle phases. This directly matches the split between what
Lite keeps and what it drops.

### Sources

- PSP empirical studies (Humphrey; IEEE TSE)
- Crystal agile methodology variants (Cockburn — methodology scaling by team/project size)
- Lean software development (waste identification in process overhead)
- PMI project complexity research (37 complexity indicators, 23 attributes)
- Solo developer workflow practitioner surveys (2024-2025)

---

[arcd-rebrand]: ../technical/plan-arcd-rebrand.md
[contrib-stress-test]: ../../reference/analysis/analysis-modes-contributor-lifecycle-stress-test.md
[solo-audit]: ../../reference/analysis/analysis-modes-solo-dev-blind-spot-audit.md
[task-list-formatting]: ../../reference/strategies/arc/strategy-task-list-formatting.md
[prepare-commits]: ../../system/workflows/arc/supplemental/prepare-commits.md
[template-prd]: ../../reference/templates/template-prd.md
[create-prd]: ../../system/workflows/arc/1_create-prd.md
[work-planning]: ../../reference/strategies/arc/strategy-work-planning.md
[conditional-content-analysis]: ../../reference/analysis/analysis-conditional-content-architecture.md
