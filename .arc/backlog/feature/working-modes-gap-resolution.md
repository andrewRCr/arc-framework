# Working: Modes Gap Resolution

**Purpose:** Working doc supporting `plan-arc-modes.md`. Tracks gaps surfaced in the pre-PRD
audit (2026-04-10), captures analysis as it lands, and migrates resolved findings into the plan
doc. Not a plan doc itself — supports one. Each finding is numbered to match the original audit
synthesis for traceability.

**Origin session:** 2026-04-10. Initial population drawn from that session's `/arc-plan`
synthesis and the user's first-pass responses.

**Lifecycle:** Tracked (committed to git) for traceability, unlike `temp-*` working files which
are gitignored. When all findings are drained — resolved and migrated into `plan-arc-modes.md`
— this doc can be deleted (its reasoning lives in commit history and the plan doc itself) or
retained as a working record at the user's discretion. Do not treat this file as a durable
long-term reference while findings are still in flight; its content graduates into
`plan-arc-modes.md` as decisions land.

---

## Status legend

- 🔴 **Open** — no position yet
- 🟡 **In-discussion** — user thoughts captured, analysis pending
- 🟢 **Resolved** — decision landed, awaiting migration into plan doc
- ✅ **Absorbed** — migrated into `plan-arc-modes.md`, line reference below
- ⚪ **Parked** — out of scope for pre-PRD, revisit later (not blocking formalization)

---

## Sequencing

Findings are ordered by number for traceability, but should be worked in the tier order below.
Tier determines what unblocks what.

**Tier 1 — gates most downstream:**

- **#1** — Lite PRD functional requirements. Gates #2, #4, #5, #6 plus the content audit.
- **#8** — Recipe architecture. Gates the entire CLI implementation plus #9, #10, #11, #12, #17.

**Tier 2 — independent, manageable:**

- **#13** — Integrate × non-complete states. State-machine sketch, small scope.
- **#7** — Guardrails. Orthogonal, can run in parallel.
- **#16** — Full → Lite downgrade. Small, user's framing already mostly resolves it.
- **#3** — Ship step. Small, once #1 lands.

**Tier 3 — detail once Tier 1 lands:**

- **#2, #4, #5, #6** — All gate on #1.
- **#9** — Conditional prompts orchestration. Surfaced during #8 evaluation; depends on #8 mechanism.
- **#10** — Lite `arc-config.yml` reduction mechanism. Surfaced during #8 evaluation; depends on #8 mechanism.
- **#12, R6** (OQ15 initial-setup workflows) — gate on #8.

**Tier 4 — validation + inventory:**

- **#11** — install_config precision. Quick once #8 is decided.
- **A1–A4** — Unvalidated assumptions. Correct directly in the plan doc.
- **R4** — Consolidated deliverable inventory. Once Tier 1–3 decisions have landed.

**Parking lot (revisit when touched, not blocking formalization):** Lite + external PM (plan
OQ10), guardrail threshold numbers (OQ8), waiting-for taxonomy finalization (OQ12), long-pause
staleness threshold (OQ13), `/arc-status` drift detection threshold (OQ14), multi-paused
limit policy (OQ11).

---

## Masked Design Decisions

### Finding 1 — Lite PRD functional requirements · 🟢

**Original:** Lite's scope artifact has no concrete shape; required as a deliverable but zero
format specified.

**User reframe (2026-04-10):** Keep calling it a PRD (no separate artifact name). Vary the
template and `create-prd` workflow by mode. `plan-*` docs are the same across modes (subsumed by
PRD at impl time, with notes extracted to `notes-*`). General lean: "mirror Full where possible
but scaled back" — preserves framework coherence, good UX, keeps the concept recognizable.
Functional requirements gate the format.

**Analysis conducted (2026-04-10):** First-pass purpose enumeration + section-by-section walk of
`template-prd.md` + step-by-step walk of `1_create-prd.md`. Identified ten purposes the Full PRD
serves (alignment check, work classification, scope definition upstream of tasks, verification
anchor, historical record, scope guardrail during execution, collaboration handshake, dependency
tracking, plan retirement trigger, open questions parking). Tested each against Lite's single-
bounded-effort context. **Eight of ten purposes survive in Lite; two drop** (P2 work
classification, P8 dependency tracking). Template cuts: `Type:` field, `Status/Related Work`
header block, and `Document History` section entirely. All other sections stay identical or
with small guidance softening. Workflow: ~90% mode-neutral; changes concentrated at workflow
edges (branch context, META-PRD review, category classification, save-location plumbing).

**Resolution:**

**Lite PRD template section set.** Keeps identically or with minor softening: Introduction,
Goals, User Stories or Use Cases (guidance simplified — no Feature/Technical split), Requirements
(prioritization softened — "use if it helps; Lite projects often have a flat list"), Non-Goals
(elevated framing — explicit one-line note that it's the scope guardrail), Technical
Considerations (optional), Design Considerations (optional), Success Criteria (unchanged —
critical), Open Questions (unchanged). Drops vs Full: `Type:` header field, `Status/Related
Work` header block, `Document History` section.

**Lite `create-prd` workflow shape.** Single unified workflow with mode conditionals at these
edges — **not** a separate Lite variant (inverse of Finding #5's task-loop decision). Rationale:
mode differences are small and localized, mode-neutral content is the bulk, cross-mode
consistency preserves collaborative-elicitation guidance as it evolves.

Mode-conditional edges:

- **Pre-Step 0 branch context** — simplified or dropped in Lite (no full/partial branch
  protection in Lite).
- **Pre-Step 0 META-PRD review** — dropped in Lite (no META-PRD installed; see SQ1).
- **Step 2 category classification** — dropped entirely in Lite.
- **Step 4 template reference + save location** — swaps template reference (or selects Lite
  variant via template `arc:if`) and uses `active/prd.md` singular save location.

Mode-neutral (apply identically across Lite and Full):

- **Step 1** — existing plan-\*.md lookup and PRD-readiness assessment.
- **Step 3** — discovery (discovery checklist from `strategy-work-planning.md`).
- **Step 5** — plan retirement + notes-\* creation + commit atomicity.
- **Stop-for-review** conclusion.

**Sub-questions resolved:**

- **SQ1 META-PRD in Lite:** Not installed. Project vision captured in the Lite PRD itself; a
  separate META-PRD adds ceremony without commensurate value at Lite's scale.
- **SQ2 `plan-*` doc location:** `.arc/active/plan-{name}.md` — sibling to `prd.md` and
  `tasks.md`. Matches Lite's flat structure, allows multiple exploration threads, retires
  normally on PRD creation.
- **SQ3 PRD filename:** Singular `prd.md`. One PRD per Lite project. If user needs multiple,
  that's a graduation signal.
- **SQ4 Document History:** **Cut entirely in Lite** (user decision 2026-04-10). No value at
  project level for Lite's bounded-effort context.
- **SQ5 Non-Goals framing:** Elevated. Template carries a one-line note — "In Lite, this
  section is your scope guardrail — drift from Non-Goals is a signal to reconsider scope or
  graduate to Full." Workflow Step 3 discovery guidance spends deliberate time on Non-Goals
  elicitation.

**Template delivery mechanism:** Template-render `arc:if` mechanism is viable for
`template-prd.md` Lite variant (since cuts are minimal and localized — a few conditional blocks
in one file). Confirms A4 as a legitimate tool, not theoretical. Final decision between
single-file-with-arc:if vs two-file-variant depends on Finding #8 recipe architecture
resolution — either approach works for this specific template.

**Cascades into other findings** (informational — see those entries for status):

- **Finding #2:** Lite task list keeps Success Criteria section (chain confirmed:
  PRD success criteria → task list Success Criteria → ship step).
- **Finding #3:** Ship step substrate confirmed — upgraded to 🟢.
- **Finding #4:** Lite session-init document set: `.arc/active/prd.md` +
  `.arc/active/tasks.md` + `.arc/active/WORK-STATUS.md`. No backlog scan, no category-path
  lookup.
- **Finding #6:** `strategy-work-planning.md` partially applies in Lite (discovery checklist
  used by create-prd Step 3).
- **Finding #8:** Datapoint — template `arc:if` earns its keep on `template-prd.md`. Factor
  into recipe architecture decision.
- **Finding #12:** Prediction — initial-setup workflows likely take the same shape (unified
  with mode conditionals at the edges). Strong lean, not yet decided.
- **A4:** Template `arc:if` confirmed as a legitimate tool.

**Migrated to plan doc:** *pending migration*

---

### Finding 2 — Lite task list template · 🟡

**Original:** "Single task list, likely simpler default structure" — no concrete spec.

**User lean (2026-04-10):** Likely identical barring ceremonial-assumption stripping. Task lists
are generated and maintained by agents; Lite is lighter for the user, not the agent. Candidates
for removal: mandatory verification phase at end (doesn't fit single evolving task list),
pause-related header fields (single task list never pauses). Thoughts only, not certainties.

**Outstanding analysis:**

- Clarify verification: (a) verification as a task list phase, vs (b) verification as a
  lifecycle workflow (`verify-work-unit.md`). (b) doesn't exist in Lite. (a) is just a phase;
  should the template *suggest* a verification phase by default, or leave it to the user?
- Which Status header values apply in Lite? If single task list never rotates, `Paused` and
  `Waiting-For` are Full-only. `In Progress` and `Complete` stay.
- Does Lite allow multi-phase task lists, or force single-phase default? (Plan OQ4 open.)
- Gates on Finding #1 — PRD functional requirements drive what Success Criteria look like,
  which drives the task list bottom section.

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### Finding 3 — Lite ship step · 🟢

**Original:** "Run Tier 3 gates and merge/push" is all the plan says; no workflow home, no
structural anchor.

**User position (2026-04-10):** Questioned whether ship step even makes sense as formal protocol
in Lite — "done is whatever the user thinks it is." Prompted reuse of Full's existing Success
Criteria convention.

**Resolution (2026-04-10):** Lite ship step reuses Full ARC's `Success Criteria` section
convention directly (see `strategy-task-list-formatting.md` § Success Criteria Section). Ship
step protocol:

1. All Success Criteria items must be marked `[x]` (met) or `[~]` (superseded, with annotation).
   Any remaining `[ ]` items represent genuine gaps requiring resolution before ship.
2. Run Tier 3 quality gates (full lint, type check, test suite, build).
3. Review aggregate diff before push/merge.

No new template section, no new workflow concept. Reuses Full's convention verbatim. Chain
confirmed by Finding #1 analysis: Lite PRD carries Success Criteria (the section survives all
cuts), Lite task list operationalizes them (identical to Full convention), ship step checks
them.

**Remaining detail decisions (detail-design, not pre-PRD blocking):**

- **Protocol location.** Dedicated `lite-ship.md` supplemental workflow vs inline section at
  the end of the Lite process-task-loop variant. Lean: **dedicated file** for discoverability
  and to parallel Full's three-phase ship convention (verify/integrate/archive), just collapsed
  into one file.
- **Aggregate-diff review formalization.** Link to `prepare-commits.md` for review conventions,
  or leave as informal "review your changes" directive? Lean: **link to `prepare-commits.md`**
  if it applies mode-neutrally; inline minimum review guidance otherwise. Decide during
  implementation.

**Migrated to plan doc:** *pending*

---

### Finding 4 — Lite session-init + session-handoff · 🟡

**Original:** Plan hedges "simplified Lite variants... likely separate template files" — no
commitment.

**User position (2026-04-10):** Depends on what's cut elsewhere — "anything cut from full that's
normally loaded at init or a step in handoff." Parking until Finding #1 resolves.

**Outstanding analysis (deferred until #1 lands):**

- Session-init document load order: which items in the current session-init workflow don't
  apply in Lite? (Candidates: WORK-STATUS fields that don't exist in Lite, work-unit discovery
  step, task list loading from WORK-STATUS path.)
- Session-handoff ceremony: does the full handoff protocol apply, or does Lite use a lighter
  version?
- Variant vs conditional — the density threshold from the conditional content analysis (5+
  in-prose conditionals on the same axis) suggests variant for session-init.

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### Finding 5 — Lite process-task-loop · 🟢

**Original:** Variant-vs-conditional hedged in plan.

**User decision (2026-04-10):** **Variant over conditional, committed.** Process-task-loop is a
core agent operating doc referenced constantly during task execution — noise in that document is
expensive. Cuts should be minimal to zero: only remove "wrong info" (references to ARC docs or
processes that don't exist in Lite — e.g., atomic companion files, incidental work routing to
backlog, coherent unit protocol referencing lifecycle). Underlying loop is identical.

**Outstanding analysis:**

- Exact list of "wrong info" references in current `3_process-task-loop.md` — produces the diff
  for the Lite variant. Runs after Finding #1 lands (since some cuts depend on Lite scope
  around atomic companion files, incidental work routing, etc.).

**Resolution:** Variant over conditional. Minimal cuts. Underlying loop identical across modes.

**Migrated to plan doc:** *pending*

---

### Finding 6 — Strategy applicability mapping for Lite · 🟡

**Original:** OQ7 — no concrete per-strategy inclusion/exclusion list. Needed as input to content
audit.

**User position (2026-04-10):** Static-docs consistency work, should be later in sequencing (not
deferred). Similar priority to the docs site pass — mechanical elements (workflows, hooks, CLI
innards) matter more for getting things watertight first.

**Outstanding analysis:**

- Walk `strategy-index.md` — per strategy, classify: **applies** / **partially applies**
  (which sections) / **does not apply** / **needs mode-aware rewrite**.
- Likely applies in Lite: core-philosophy, configurability-architecture, file-classification,
  session-operations, task-list-formatting, quality-gates.
- Likely does NOT apply in Lite: work-organization (branching model depends on lifecycle),
  planning-module (arc-in-git only anyway).
- Uncertain: work-planning (planning pipeline concept doesn't apply, but PRD conventions do —
  partial), team-coordination (if Lite always forces solo, does not apply), adr-methodology
  (applies universally? or Full-only?).
- Feeds content audit scope sizing.

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### Finding 7 — Guardrail firing mechanism · ⚪

**Original:** Plan says guardrails live "in session-init" and "in process-task-loop" but doesn't
specify how they read thresholds, where thresholds are stored, or what triggers the nudge prose.

**User position (2026-04-10):** Wary of nagging. "Go light." Value exists but needs focused
analysis, orthogonal to most other concerns. Park but don't dismiss — "if they're hitting walls
that Full ARC would solve, they should know."

**Outstanding analysis (deferred to dedicated session):**

- Dedicated guardrail evaluation pass — thresholds, firing cadence, nudge vocabulary, signal
  specificity, false-positive management.
- Storage: config-file keys vs hardcoded defaults vs per-project override.
- Firing point: session-init orientation, process-task-loop, or both.
- Relationship to `/arc-status` skill — could guardrails live inside `/arc-status` and only fire
  on explicit invocation?

**Parking note:** Orthogonal to mode architecture decisions. Can resolve in parallel or even
post-PRD without blocking the rest of the plan. Review before PRD lock-in to confirm it doesn't
impose new architectural requirements.

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### Finding 8 — Recipe architecture for mode-conditional installation · 🟢

**Original:** Verified against `packages/arc-framework/init-recipe.json` and `src/lib/types.ts`:
`RecipeCondition` only supports `include_files` (additive). The current recipe lists all
work-unit-lifecycle workflows unconditionally. Lite needs to exclude ~15 files + possibly swap
2-3 templates. Plan's claim that "CLI recipe already supports mode-conditional file installation"
is false in the direction Lite needs. Four candidate approaches:

1. **Invert the baseline** — make Lite the unconditional include list, add Full files via
   `install_type == full` condition. Invasive refactor, tests touch this.
2. **Extend the recipe schema** — add `exclude_files` to `RecipeCondition`. Smaller code change
   but affects merge/update/diff logic throughout the manifest module.
3. **Ship two recipes** — `init-recipe-lite.json` + `init-recipe-full.json`, pick after first
   prompt. Simplest schema but introduces recipe duplication risk on future feature adds.
4. **Bucket + gate** — split current `include_files` into baseline + `lifecycle_files`, expose
   `lifecycle_files` under a new condition form.

**User position (2026-04-10):** Whatever's cleanest long term, regardless of effort. Composition
and inverting the baseline sound right, but needs deeper analysis.

**Current state (read 2026-04-10 — bridge into next session):**

Factual landscape pass over the recipe + manifest pipeline. No evaluation of the four
approaches yet — that's the next session's synthesis work. Purpose here is to give the
evaluation a concrete foundation so it doesn't spend its first half re-deriving how the code
works.

**The single file-resolution site.** `resolveFileList()` in `lib/classification.ts` (lines
~160–175) is the only place where the final file list is constructed. It's a pure function:

```text
files = Set(recipe.include_files ?? [])
for each (condition, entry) in recipe.conditions:
    if evaluateCondition(condition, config):
        files.add(entry.include_files...)
return [...files]
```

Strictly additive: baseline ∪ matching conditions. No subtraction, no precedence rules, no
override semantics. Any of the four approaches has to either modify this function, add a
post-processing step, or change the recipe schema so this function's logic shifts.

**Recipe schema (TypeScript, `lib/types.ts`):**

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

`validateRecipe()` in `template/recipe.ts` enforces exactly this shape. Any new field
(e.g., `exclude_files`, `lifecycle_files`) requires matching changes in `types.ts` AND
`validateRecipe()`.

**Condition evaluator (`evaluateCondition()` in `template/recipe.ts`, lines ~188–209):**
Supports two operators — `==` (exact string equality) and `includes` (comma-separated list
membership, for multiselect prompt values like `tools`). Returns false if the key is
undefined in the config map. The operator set is fixed and easy to extend (single regex +
branch), but extensions would cascade into `validateRecipe()`'s condition-key check.

**Template-render `arc:if` mechanism (`template/render.ts`):** Separate from recipe
conditions. Operators are `==` and `!=` (no `includes`). Uses HTML comment directives
(`<!-- arc:if KEY == VALUE -->` ... `<!-- arc:endif -->`). Processes at install time for
`.template.md` files and at update time for reconstructing pristine baselines. Collapses
blank lines after stripping; nested `arc:if` inside an excluded outer block stays excluded.
The two mechanisms (recipe conditions and template conditionals) are intentionally distinct —
recipe works at install time on whole files, template conditionals work at render time on
content blocks within files.

**Three consumers of condition-included files** (code-duplication risk for schema changes):

- `commands/init.ts` — calls `resolveFileList(recipe, config)` directly (line ~135), then
  special-cases `ARC_IN_GIT_CONDITION` to build `arcInGitFiles` Set for layer classification
  (lines ~141–146).
- `commands/update.ts` — iterates over `recipe.conditions[condName].include_files` directly
  for its own file-list reconstruction (line ~177).
- `commands/reconfigure.ts` — similar direct iteration (line ~160).

**`ARC_IN_GIT_CONDITION` is already special-cased.** The code already treats one condition
differently from others for layer classification. Precedent — any new install-type condition
would likely need similar special treatment, since install mode affects layer/classification
semantics just like `pm.mode == arc-in-git` does.

**Manifest schema (`InstallConfig` in `lib/types.ts`):**

```ts
interface InstallConfig {
  project_name: string;
  pm_mode: string;
  tools: string[];
  team_mode?: boolean;
}
```

Four fields. Adding `install_type` (or equivalent) is a schema-version bump and cascades
into: this interface, `validateManifest()` in `manifest/store.ts`, the manifest construction
in `init.ts` (line ~197), the manifest re-build in `reconfigure.ts`, the manifest
carry-forward in `update.ts`, and possibly migration logic for existing manifests at the old
schema version.

**Change plan pipeline** (`manifest/plan.ts` + `manifest/update-files.ts` + `manifest/apply.ts`):

- `buildChangePlan()` is pure — diffs old manifest files against new file list from
  `resolveFileList()`, produces `additions`, `removals`, `merges`, `skipped`.
- `diffFileLists()` in `update-files.ts` is a simple set difference (`keep` / `added` /
  `removed`).
- `apply.ts` consumes the plan:
    - **Additions:** render + write + update manifest.
    - **Removals:** `safeUnlink` for Framework-class files; Configurable files go to
      `keptForReview` (adopter-edited, needs human review before deletion); Scaffolded files
      are left untouched (adopter-owned).
    - **Merges:** three-way merge via `mergeFileContents()` in `manifest/merge.ts`.

**Removals work today.** Infrastructure exists. This is critical for Finding #16 (Full → Lite
downgrade) — the reconfigure path can already remove files when the new file list is smaller
than the old one. What changes is *how* files get on the removal list (via recipe or
conditional), not *whether* they can be removed.

**Pristine store dependency.** The update pipeline reconstructs pristine baselines for
three-way merges by re-rendering templates against the stored `install_config`. If `InstallConfig`
gains an `install_type` field, pristine reconstruction during update needs to feed it through to
`resolveFileList()` and `renderConditionals()` to reproduce the original rendered content. This
couples install-type through the full update lifecycle, not just init.

**Constraint summary for the four approaches:**

| Constraint                        | Approach 1 (invert)      | Approach 2 (exclude_files)   | Approach 3 (two recipes)           | Approach 4 (bucket + gate)              |
|-----------------------------------|--------------------------|------------------------------|------------------------------------|-----------------------------------------|
| Recipe schema change              | No                       | Yes (`exclude_files` field)  | No                                 | Yes (e.g., `lifecycle_files` field)     |
| `resolveFileList()` change        | No                       | Yes (set subtraction)        | No                                 | Yes (conditional append)                |
| `validateRecipe()` change         | No                       | Yes                          | No                                 | Yes                                     |
| New recipe-level operators        | No                       | No                           | No                                 | No                                      |
| `InstallConfig` change            | Yes (`install_type`)     | Yes (`install_type`)         | Yes (`install_type`)               | Yes (`install_type`)                    |
| Manifest schema version bump      | Yes                      | Yes                          | Yes                                | Yes                                     |
| init.ts/update.ts/reconfigure.ts  | Light (3 call sites)     | Medium (set semantics)       | Medium (recipe selection step)     | Medium (new field handling)             |
| Recipe file count                 | 1 (same file)            | 1 (same file)                | 2 (duplicated baselines)           | 1 (same file)                           |
| Operator precedence question      | N/A                      | Yes (exclude vs include)     | N/A                                | N/A                                     |
| Future mode extensibility         | Additive conditions      | Additive + subtractive       | Per-recipe fragmentation           | One bucket per axis (doesn't scale)     |

All four require `install_type` in `InstallConfig` and a schema version bump — that part is
common and unavoidable. The differentiation lives in the recipe-schema + `resolveFileList()`
layer.

**Not yet established (will need a quick scan during next session if relevant):**

- Test file inventory and which specific tests exercise `resolveFileList()`, `validateRecipe()`,
  and the three command paths. Affects change-size estimate.
- Exact shape of `fileLayer()` classification function — only read the caller context, not
  the function body. Relevant to Approach 1's "invert baseline" cleanliness, since lifecycle
  files currently classify into a specific layer.
- Whether `reconfigure.ts` has any pattern for "install_config field changed" vs "install_config
  field same, just re-render" — matters for the Lite ↔ Full reconfigure path and Finding #16
  orphan handling.

**Resolution (2026-04-10):** Mechanism decided. Detail items feed forward into plan doc + PRD.

**Evaluation of the four approaches:**

**Approach 3 (two recipes) — rejected.** Baseline duplication across two files creates a silent
divergence risk on every feature add. Orthogonal axes (future content subsets, team variants,
etc.) are multiplicative in file count. Violates DRY at the authoring surface. Fails the user's
"cleanest long-term" criterion.

**Approach 4 (bucket + gate) — rejected.** The `lifecycle_files` bucket handles the one mode
axis cleanly but accretes a new field per orthogonal axis. The constraint table already flagged
"doesn't scale to orthogonal mode axes without accretion" — that alone kills it under the user's
criterion.

**Approach 2 (`exclude_files` schema extension) — rejected.** Introduces subtractive semantics
into a model that is currently pure union. Consequences:

- `resolveFileList()` becomes `baseline ∪ included − excluded`, forcing an ordering decision
  (exclude-before-include? include-before-exclude? what if two conditions overlap?). There is no
  single defensible answer — it depends on intent per call site.
- Every future recipe reviewer has to mentally simulate both set operations on every read.
- The new operator would be used for a single axis (install type). That's schema weight added
  to the recipe language for one use case that doesn't earn its keep.
- Every consumer of the recipe-conditions pipeline (`init.ts`, `update.ts`, `reconfigure.ts`)
  would need to handle both operations.

**Approach 1 (invert baseline) — adopted with refinement as Approach 1b (symmetric additive).**

The original framing ("make Lite the unconditional baseline, add Full via condition") privileges
one mode as the baseline. Refinement: partition into three buckets symmetrically, so Full and
Lite are peer extensions on a shared foundation rather than one being primary:

- **Unconditional baseline** — files universal to both modes (constitution, most strategies,
  core workflows, templates, system infrastructure, initial-setup, session-lifecycle,
  supplemental).
- **`install.type == full`** condition — Full-only files (work-unit-lifecycle/\*, META-PRD
  template, Full process-task-loop variant contents once Finding #1/#5 land).
- **`install.type == lite`** condition — Lite-only files (Lite ship protocol deliverable per
  Finding #3, Lite process-task-loop variant contents once Finding #1/#5 land).

**Why Approach 1b wins on every criterion:**

| Criterion                   | Approach 1b                              | Approach 2                     |
|-----------------------------|------------------------------------------|--------------------------------|
| Additive-model fit          | Unchanged                                | Introduces subtraction         |
| `resolveFileList()` change  | Zero                                     | Set arithmetic + ordering      |
| Schema change               | Zero                                     | New field + validator          |
| Operator precedence         | N/A                                      | Exclude-vs-include ambiguity   |
| Scaling to new axes         | Additive conditions                      | Additive + subtractive         |
| Recipe readability          | Conditions self-document modes           | "Plus these, minus those"      |
| Test surface                | Existing `resolveFileList()` tests hold  | New semantics need new tests   |
| Precedent                   | Matches `pm.mode == arc-in-git` pattern  | New pattern                    |

**Stress-test trace-throughs** (run 2026-04-10):

- **Multi-axis composition** with `pm.mode`, `tools`, `team.mode` all resolved cleanly. The one
  interaction that looked like it might surface an open question — Lite × `pm.mode: arc-in-git`
  — is already forbidden in the plan doc (see `plan-arc-modes.md` lines 99-101, 405-412,
  1346-1347); Lite skips the `pm.mode` prompt entirely, so the condition never fires.
- **Update pipeline** (Full → Full on framework version bump): standard additions path,
  unchanged.
- **Pristine reconstruction during update**: `install_type` needs to flow through
  `buildConfigMap()` alongside `pm_mode`. Pattern already established; one-line addition.
- **Reconfigure Full → Lite downgrade**: existing removal infrastructure (`safeUnlink` for
  Framework class, `keptForReview` for Configurable) handles it. Finding #16 owns the
  orphan-handling details; Finding #8's mechanism doesn't make the problem worse.
- **Reconfigure Lite → Full upgrade**: inverse, additions path, no surprises.
- **Legacy manifest migration**: existing Full manifests pre-`install_type` get default
  `install_type: "full"` during manifest version bump. Standard pattern.

**Decided (feedforward into plan doc and downstream implementation):**

- **Mechanism:** Symmetric additive via `install.type` condition. No recipe schema change. No
  `resolveFileList()` change. Three buckets (universal baseline / `install.type == lite` /
  `install.type == full`).
- **Config key:** `install.type` (dotted form, consistent with `pm.mode`, `team.mode`,
  `branch.protection`).
- **`InstallConfig` schema:** Adds `install_type: string`. Manifest schema version bumps.
  Legacy manifests migrate with `install_type: "full"` default.
- **`buildConfigMap()` plumbing:** Flattens `install_type → install.type`, making it available
  to both `evaluateCondition()` (recipe conditions) and `renderConditionals()` (template
  `arc:if` directives). Pattern parallels existing `pm_mode → pm.mode` handling.
- **Anchor file assignments (safe now, nothing else contradicts):**
    - `work-unit-lifecycle/*` (8 files) → `install.type == full`.
    - Other bucket assignments pending resolution of dependent findings — see Feedforward
      below.

**Adjacent concerns surfaced during this evaluation** — captured as separate findings rather
than bundled here: new Finding #9 (conditional prompts orchestration) and new Finding #10 (Lite
`arc-config.yml` reduction mechanism). Both depend on this mechanism decision but have distinct
solution spaces and deserve independent resolution before PRD formalization.

**Feedforward — file bucket assignments pending other findings:**

These files have preliminary bucket assignments that depend on resolution of other findings.
Resolved here only as far as current understanding allows; final bucket confirmation happens as
each dependent finding lands.

- `reference/META-PRD.template.md` — Lean: `install.type == full`. Finding #1 resolved "no
  META-PRD in Lite." Confirm on Finding #1 migration.
- **Process-task-loop variant contents** — Finding #5 resolved "variant over conditional."
  Two files will land under `install.type == full` and `install.type == lite` conditions
  respectively. Exact filenames and contents pending Finding #1 landing (which determines
  which references need cutting in the Lite variant).
- **Lite ship step deliverable** — Finding #3 resolved the three-step protocol. File-vs-inline
  location is a detail decision (Finding #3 "Remaining detail decisions"); if a separate
  supplemental workflow, lands under `install.type == lite`.
- **`manage-incidental-work.md`, `maintain-project-docs.md`** — unclear bucket assignment.
  Incidental work routing depends on the WU pipeline concept (Full territory); project docs
  maintenance is arguably universal. Finding #6 (strategy applicability mapping) territory.
- **Strategy files** (most of `reference/strategies/arc/*`) — most likely stay in the baseline.
  `strategy-work-organization.md` and `strategy-work-planning.md` may be Full-only or partial.
  Finding #6 territory.
- **Session-lifecycle workflow variants** (`session-init.template.md`,
  `session-handoff.template.md`) — if Finding #4 lands on "variant needed," two files go under
  respective `install.type` conditions. If "unified with minor cuts," stays in baseline with
  template `arc:if` directives. Finding #4 territory.
- **`arc-config.yml` treatment** — depends on resolution of new Finding #10 (Lite config
  template reduction mechanism). Bucket assignment deferred until that finding lands.

**Not yet established** (verify during implementation, not gating this decision):

- Test file inventory exercising `resolveFileList()`, `validateRecipe()`, and the three command
  paths — affects change-size estimate for the PRD's task generation phase.
- Exact migration step wiring in manifest version bump logic.
- Final `install_type` naming: `install_type` vs alternatives (`install_mode`, `arc_mode`,
  `mode`). Coordinate with rebrand WU's config naming work — see Finding #11 (`install_config`
  precision).

**Decision formalization — ADR as PRD deliverable.** This mechanism decision will be formalized
as an Architecture Decision Record during implementation, not authored now. The ADR belongs
alongside the code change it documents, not as a pre-PRD artifact. The PRD derived from
`plan-arc-modes.md` will include "author ADR for `install.type` mechanism" as an explicit
deliverable; the ADR itself is written during that task's execution. ADR number assigned at
write time.

**Migrated to plan doc:** *pending* (batch-migrate with Findings #1 and #3)

---

### Finding 9 — Conditional prompts orchestration · 🟡

**Origin (2026-04-10):** Surfaced during Finding #8 evaluation. `plan-arc-modes.md` states that
Lite skips the `pm.mode` prompt entirely (lines 99-101, 405-412) and the `team.mode` prompt is
"likely also skipped." The current recipe's `prompts` array is a flat list — every prompt is
shown unconditionally, with no conditionality mechanism. Finding #8's Approach 1b resolves file
inclusion cleanly but does not give the recipe a way to gate prompts on prior answers. This is
a separate mechanism decision from file inclusion and deserves its own resolution path.

**Question:** How does the recipe (or the CLI) express "show this prompt only when
`install.type == full`"?

**Candidate approaches:**

1. **Recipe schema extension for conditional prompts.** Add a `show_when` (or `skip_when`) field
   to each `RecipePrompt` entry — e.g., `"show_when": "install.type == full"`. Uses the same
   condition string grammar as `recipe.conditions`. Symmetric with the file inclusion pattern.
   Scales to any number of gated prompts on any axis. Requires: `RecipePrompt` type update,
   `validateRecipe()` update, CLI prompt loop update to evaluate `show_when` against
   already-collected answers.
2. **CLI-side hard-coding.** Keep the recipe flat; in `init.ts` / `reconfigure.ts`, check
   `install_type` after the earlier prompts and skip `pm_mode` / `team_mode` directly with
   defaulted values. No schema change, but the recipe stops being authoritative for the prompt
   flow in Lite — authoring a new mode-gated prompt requires touching CLI code instead of the
   recipe.
3. **Post-prompt validation + rejection.** Ask all prompts regardless, validate the combination,
   reject invalid ones (Lite + `pm.mode: arc-pm`). Works but degrades UX with dead-end prompts
   and error messages for a state that could have been prevented.

**Lean:** Approach 1 (recipe schema extension). Parallels the file inclusion pattern and keeps
the recipe as the single source of truth for init-time behavior. `show_when` uses the same
condition grammar as existing recipe conditions, so no new operator work.

**Outstanding analysis:**

- Enumerate all prompts that need gating. Confirmed from plan doc: `pm_mode`, `team_mode`.
  Possibly others once Finding #1 and Finding #6 land (e.g., a Lite-specific prompt may need
  gating on `install.type == lite`).
- Evaluate the condition-grammar reuse question — current `evaluateCondition()` expects
  `config: Record<string, string>` with flat keys. The prompt loop would need to evaluate
  `show_when` against a partial config (the answers collected so far). Does the existing
  evaluator handle partial maps correctly? Likely yes (missing keys return false), but verify.
- Determine prompt ordering constraint. If `show_when` references `install.type`, the
  `install.type` prompt must come before any prompt that references it. Recipe `prompts` order
  is already significant; this constrains it further. Document the constraint.
- Consider whether `show_when` applies only to prompts or also to condition evaluation in
  general. Lean: only prompts; conditions already have their own evaluation path.

**Relationship to Finding #8:** Depends on Finding #8's `install.type` mechanism being in place.
The prompt gating pattern re-uses the same condition grammar. Not a flaw in Finding #8 — an
adjacent concern surfaced during its evaluation.

**Relationship to plan doc:** Plan doc already states Lite skips these prompts — this finding
is about the mechanism for *how* that skip is expressed in the recipe schema. Resolution feeds
into plan doc's "CLI config surface" content.

**Tier:** 3 (detail once Tier 1 lands). Gates on Finding #8 mechanism decision (now resolved).

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### Finding 10 — Lite `arc-config.yml` reduction mechanism · 🟡

**Origin (2026-04-10):** Surfaced during Finding #8 evaluation. `plan-arc-modes.md` lines
410-412 state: "Lite ships a reduced `arc-config.yml` that omits irrelevant settings (`pm.mode`,
`team.mode`, and possibly others). This keeps the config honest about what Lite actually
configures rather than showing options that don't apply." The current recipe includes
`system/arc-config.yml` unconditionally in the baseline as a plain `.yml` file — not a
`.template.md`, so template render-time `arc:if` directives don't apply to it. Finding #8's
mechanism (Approach 1b) resolves file inclusion but doesn't specify how a single config file
produces different content per install type.

**Question:** How does Lite get its reduced `arc-config.yml` template?

**Candidate approaches:**

1. **Two separate files in the recipe.** Move current `arc-config.yml` out of baseline. Put
   Full version under `install.type == full` and Lite version under `install.type == lite`.
   Two files, some duplication of universal settings. Simplest — uses Finding #8's mechanism
   unchanged.
2. **Rename to `arc-config.template.yml` and use `arc:if` directives.** Allow the template
   render pipeline to process non-`.md` templates, then annotate the current file with
   `arc:if install.type == full` blocks around `pm.mode` / `team.mode` sections. Single file,
   DRY, but requires either extending `.template.md` matching to include `.template.yml`, or
   adding a new `.template.*` generalization.
3. **CLI-generated config content.** `init.ts` writes `arc-config.yml` programmatically based
   on `install_config`. Splits config source of truth between a template and code. Worst option.
4. **Hybrid: template fragments + stitching.** Break `arc-config.yml` into sections (universal,
   Full-only, Lite-only) and stitch them at init. Over-engineered for the problem scale.

**Lean:** Approach 2 (`arc-config.template.yml` with `arc:if`). The template render pipeline's
`arc:if` mechanism already supports exactly this pattern; the blocker is the `.md`-only file
matching. That's a small, localized extension to the render pipeline. Single source of truth
for arc-config content, cleaner than two-file duplication.

**Outstanding analysis:**

- Read `template/render.ts` `.template.md` matching — confirm the file extension gate and
  estimate the scope of generalizing it to `.template.*`.
- Walk current `arc-config.yml` section-by-section — which sections are universal, which are
  `install.type`-gated? Expected gated sections: `pm.mode`, `team.mode` settings blocks.
  Verify nothing else is mode-specific.
- Check whether `arc-config.yml` participates in any hash-based pristine tracking today — if
  renaming to `arc-config.template.yml` affects manifest file paths, that's a migration
  concern.
- Evaluate the two-file approach as fallback: if render pipeline extension proves fraught,
  Approach 1 is a mechanical fallback that uses Finding #8's mechanism unchanged.

**Relationship to Finding #8:** Sibling concern. Finding #8 decided the mechanism for *file
inclusion*; this finding decides the mechanism for *content reduction within a single installed
file*. Both touch the recipe/template layer but resolve different axes.

**Relationship to Finding #1:** Finding #1 already noted that `template-prd.md` uses template
`arc:if` for Lite cuts (Document History, `Type:` field, Status/Related Work) — same pattern
applies here if the render pipeline extension lands. Consistency bonus if Approach 2 wins.

**Tier:** 3 (detail once Tier 1 lands). Gates on Finding #8 mechanism decision (now resolved).

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### Finding 11 — `install_config` precision · 🟡

**Original:** Plan's "stored in the manifest's `install_config` (like `pm.mode` is now)" is
imprecise. `InstallConfig` exists in `types.ts` with `project_name`, `pm_mode`, `tools`,
`team_mode` — but `pm_mode` is *also* a config key in `arc-config.yml`, and the two are kept in
sync. Lite's install_type: does it live only in the manifest, only in `arc-config.yml`, or both?
If only manifest, how do tools not invoking the CLI (hooks, session-init workflow) read it?

**User position (2026-04-10):** Not sure. Needs deeper analysis and pro/con weighing.

**Outstanding analysis (gates on #8):**

- Enumerate consumers of install mode: CLI (init, reconfigure, update), hooks (pre-commit,
  commit-msg), workflows (session-init, process-task-loop, etc.), agents (document loading),
  recipe (condition evaluation).
- For each consumer, identify read path: can it read the manifest, or does it need
  `arc-config.yml`?
- Precedent: `pm.mode` is in both because hooks read `arc-config.yml` and the CLI reads the
  manifest. If install mode has the same consumers, same pattern; if it only affects CLI, manifest
  alone.
- Naming: `install_type`, `install_mode`, `mode`, `arc_mode`? Coordinate with rebrand WU's
  config naming work.

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### Finding 12 — Initial-setup workflows (OQ15) · 🟡

**Original:** `01_verify-and-configure.md` and `02_define-project.md` assume Full ARC tracked.
Lite and Local each need different setup paths. Separate workflows per mode, or unified with
mode-conditional sections?

**User position (2026-04-10):** Depends on where Lite/Full boundaries are drawn. Park until #1
and #8 land.

**Outstanding analysis (gates on #1, #8):**

- Read current `01_verify-and-configure.md` and `02_define-project.md` — identify mode-specific
  vs mode-neutral content.
- If recipe architecture (#8) lands on "two recipes" or "invert baseline," initial-setup workflows
  likely fork per mode. If "extend schema" or "bucket + gate," unified with conditionals may be
  viable.
- Density threshold from conditional content analysis applies (5+ conditionals on same axis →
  variant).

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### Finding 13 — Integrate × non-complete WU states · 🟡

**Original:** `integrate-work-unit.md` presumably validates `Status: Complete` before merging.
New states (`Paused`, `Waiting-For`) create cases: refuse integrate? Force resume first?
Auto-transition? Not walked in the plan. `integrate-work-unit.md` needs at least a paragraph of
update that's not in the deliverable list.

**User position (2026-04-10):** Wants explicit handling, wants to avoid churn. "Reactivating a
work unit that was parked pending code review prior to merge/integration is silly and would
waste everyone's time." Needs focused analysis.

**Outstanding analysis:**

- Walk state × integrate matrix:
    - `In Progress` → integrate: standard path.
    - `Paused` → integrate: probably refuse? "Resume first, then integrate" — but what if user
      knows it's done?
    - `Waiting-For Review` → integrate: this is exactly the natural transition (review lands,
      integrate). Should probably allow directly without requiring resume-then-integrate churn.
    - `Waiting-For Approval` / `Delivery` / `Decision` / `Other` → integrate: depends on what's
      waiting. If the waiting-for item is the last blocker, integrate is the correct next step.
    - `Complete` → integrate: standard path.
- Proposal shape: integrate allows `In Progress`, `Waiting-For {any}`, `Complete`. Refuses
  `Paused` with a "resume first" error. Or: allows all non-`Paused` with a prompt confirming
  the integrator understands the state.
- Does `/arc-shift` or `integrate-work-unit` own the state transition on merge? (Integrate
  probably sets Status → Complete as a side effect.)
- Does the Waiting-For category itself imply the integration readiness? E.g., `Waiting-For
  Review` → when review lands, integrator knows to proceed; `Waiting-For Approval` → approval
  gates integrate explicitly; etc.

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### Finding 14 — Shift-with-activation coordination · 🟢

**Original:** Workflow Shape says shift "hands off to activate-work-unit" — in-process invocation
or user-triggered? Atomicity? Half-state on failure?

**Insight (2026-04-10):** Shift has nowhere to go in Lite (single task list, no second WU). So
**shift lifecycle is Full-only**. The mode-awareness of the shift workflow is a trivial "skip
entirely in Lite" gate, not a mode-conditional workflow body. Simpler than initially framed.

**User position (2026-04-10):** Agreed shift doesn't apply in Lite. On the activate coordination
question specifically: leans toward workflow prompting the user after pause rather than
auto-handing-off to activate. "Hard to say without seeing how the skill/workflow ends up
finalizing."

**Outstanding analysis:**

- In-process invocation vs user-triggered for shift-with-activation:
    - **Auto-handoff:** shift executes pause, then internally invokes `activate-work-unit`
      against the target. Single atomic operation from user's POV. Failure mid-activation leaves
      half-state (paused but not activated).
    - **Prompt-after-pause:** shift executes pause, reports success, then prompts user "Next:
      activate {target}? (Y/n)". Two explicit steps. Clean failure boundary. Slightly chattier
      UX but avoids half-state.
    - User's lean is toward prompt-after-pause. Matches ARC's general "mandatory stops between
      operations" principle.
- If prompt-after-pause: does `/arc-shift feature-y` become a two-step conversation, or does it
  run both steps in sequence with an implicit stop between? Prefer the latter — user says "shift
  to feature-y" and the workflow walks both steps with one confirmation.
- Document in `shift-work-unit.md` as the authoritative transition protocol.

**Resolution (partial):** Shift lifecycle is Full-only; Lite skips it entirely. Remaining
question is coordination mechanism (auto-handoff vs prompt-after-pause) — user leans
prompt-after-pause; needs final commitment.

**Migrated to plan doc:** *pending*

---

### Finding 15 — Finding C (pause pointer fields) formalization · 🟢

**Original:** Plan says "independent doc sweep, not shift-blocking" — ambiguous whether in-scope
for modes WU.

**User decision (2026-04-10):** **In scope for modes WU.** "Not sure why this would be deferred,
that's just tech debt otherwise."

**Outstanding analysis:**

- Identify the four pointer fields: `Interrupts:` / `Paused:` / `Paused To:` / `Spawned:` — locate
  them in the current workflows/templates and confirm scope of the formalization sweep.
- Document the canonical form of each pointer field (syntax, when set, when cleared, where used).
- Update any workflow/strategy docs that reference them informally.

**Resolution:** In scope for modes WU. Proceed with formalization sweep as part of modes
implementation. Not shift-blocking but not deferred.

**Migrated to plan doc:** *pending*

---

### Finding 16 — Full → Lite downgrade with history · 🟢

**Original:** Plan says "only possible when a single WU is active" but doesn't address archived
WUs, backlog directory, PROJECT-STATUS, ROADMAP when collapsing to Lite. Delete? Preserve
orphaned? Migrate?

**User position (2026-04-10):** Full → Lite is nice-to-have, not a hard requirement. Lite → Full
*has* to be supported. Full → Lite preferred out-of-the-gate if reasonable; drop if too tricky.
On the history question: lean toward "framework now ignores these files, user is advised via
clear CLI prompt, and it's their call." Precedent: existing CLI orphan-file handling during
update flow.

**Proposed shape (pending confirmation):** On Full → Lite reconfigure, CLI:

1. Detects orphaned files (backlog/, archived WUs, PROJECT-STATUS, ROADMAP, etc.).
2. Reports them clearly: "These files exist but Lite mode does not manage them: {list}."
3. Prompts: keep in place (ignored), delete, or cancel reconfigure.
4. Proceeds based on user choice. No automatic cleanup without confirmation.

**Outstanding analysis:**

- Read existing `commands/reconfigure.ts` + `update.ts` orphan-handling to confirm precedent
  shape.
- Enumerate orphan categories (directories, tracked files, templates) that differ Full → Lite.
- Define the "reasonable" boundary — if implementation complexity on Full → Lite turns out
  material, descope to "Lite → Full only" with a clear error on the reverse path.

**Resolution:** Full → Lite supported if reasonable; shape is "detect orphans, inform user,
defer to user's choice." Descope only if implementation proves material.

**Migrated to plan doc:** *pending*

---

### Finding 17 — Backing store sync protocol · 🟢

**Original:** "Auto-populated from `.arc/` on each handoff" stated; mechanism and firing policy
unspecified.

**User position (2026-04-10):** Once per session (handoff) is likely right. Can be more frequent
only if it's very fast, seamless, invisible to user. Lean: handoff only unless a concrete edge
case demands otherwise.

**Proposed shape (pending confirmation):** Backing store sync fires at session-handoff as the
canonical firing point. Mechanism needs selection.

**Outstanding analysis:**

- Mechanism candidates:
    - **`git add -A` + commit inside bare repo** — needs a working directory; awkward for a bare
      repo. Would need a non-bare `~/.arc-state/{project-id}/` working clone.
    - **`rsync --delete`** — fast, portable, but loses git history semantics (backing store
      becomes snapshots not commits).
    - **`git bundle`** — periodic bundle file generation; portable across machines for the
      opt-in remote sync but not a live-updated store.
    - **Non-bare clone + commit on each handoff** — `~/.arc-state/{project-id}/` is a normal git
      repo; on handoff, CLI copies `.arc/` contents, commits with an auto-generated message.
      Keeps full git history, supports remote push. Likely cleanest.
- Sync scope: does it copy the entire `.arc/`, or selective (exclude `reference/`, `system/`
  templates since they're framework-shipped)? Likely entire `.arc/` for simplicity — storage is
  cheap, partial sync is fragile.
- Failure handling: if backing store write fails, does handoff proceed or refuse?
- Additional firing points beyond handoff: should shift transitions also sync? Probably yes if
  sync is fast; parks a WU to durable storage before rotating focus.
- Resolving edge cases: crash between handoffs loses work; do we care?

**Resolution (partial):** Handoff is the primary firing point. Mechanism selection and edge-case
handling still open. Revisit during detail design.

**Migrated to plan doc:** *pending*

---

### Finding 18 — Project ID for zero-commit repos · 🟡

**Original:** Plan: "remote URL primary, first-commit hash fallback." Doesn't cover zero-commit
repos with no remote — exactly the Lite+Local "try ARC in five minutes" scenario.

**User position (2026-04-10):** Whatever's most seamless. No user prompting — "shouldn't be
something they have to think about."

**Outstanding analysis:**

- Third fallback candidates (all must be seamless):
    - **Directory path hash** — hash absolute path of the working tree. Stable across `arc`
      invocations in the same directory, but changes if the user `mv`s the directory.
    - **Generated UUID stored in `.arc/system/.internal/project-id`** — created on first
      `arc init --local`, read on subsequent runs. Survives moves. Lost on re-clone (but that's
      expected, and for zero-commit repos there's no clone to speak of).
    - **Composite** — try directory-path hash first; if `.arc/` doesn't exist at that hash's
      location when re-accessed, fall back to UUID. Complex.
- Graduation handling: what happens when the repo later gets a remote or a first commit? Does
  the project ID transition to the new primary mechanism, or stay on the fallback?
- Precedent: does any existing ARC CLI code store similar project-local identifiers?

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### Finding 19 — Lite framing and graduation expectations · 🟡

**Origin (2026-04-10):** Raised during Finding #1 step-through. User concern: users may try to
fit longer projects into Lite and then blame ARC for not working well when the actual issue is
they're using the wrong mode. Framing needs to make Lite's bounded-effort-only nature
unmistakable at first contact, and needs to make the graduation signal visible *before* the
project gets painful, not after.

**User position (2026-04-10):** "This means one evolving task list, and if it gets long, that's
a signal to graduate to full ARC." Noted as a broader concern for the WU (presentation/docs)
than the immediate pre-PRD design focus, but crucial — captured to avoid losing it.

**Touchpoints that need coordinated framing:**

- `arc init` Lite mode selection prompt — wording sets expectations up front
- Lite `AGENT-BRIEFING.ARC.md` (if a Lite variant exists) — agent's first-session framing
- Lite `README.md` if Lite ships one — user-facing first impression
- Lite PRD template Introduction guidance — reinforces "bounded effort" framing at plan time
- Lite task list template header/overview — reinforces at task time
- Documentation / docs site page for Lite — long-form explanation of bounded nature and
  graduation path
- Graduation nudges from Finding #7 guardrails — enforcement mechanism for the framing promise

**Relationship to Finding #7 (guardrails):** Framing is upstream communication; guardrails are
the downstream enforcement mechanism. Clear framing → guardrails fire less often and feel like
confirmation rather than nagging. Weak framing → guardrails do the heavy lifting and feel naggy.

**Outstanding analysis:**

- Enumerate all user-facing surfaces where Lite first presents (CLI prompts, docs, templates,
  agent briefings).
- Define the consistent framing message: "Lite is for projects you can hold in one task list
  and one scope brief. If your project outgrows that, ARC will tell you — graduate to Full."
- Audit existing Full-ARC framing language in the same surfaces to identify coordination needs.
- Coordinate with Finding #7 guardrail analysis so framing expectations and guardrail firing
  are consistent.

**Scope note:** This is implementation-phase work (content + UX), not pre-PRD architecture.
Should be captured in the PRD's Requirements section as a cross-cutting deliverable. Does not
gate formalization readiness.

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

## Unvalidated Assumptions

### A1 — "Hooks (already local in nature)" in Local Unchanged list · 🔴

**Finding:** Plan's Local mode Unchanged list says "Hooks (already local in nature)." Directly
contradicted by `analysis-conditional-content-architecture.md` § Local Mode: "Commit hooks — May
be absent or drastically simplified (no task list co-staging if `.arc/` isn't tracked). 3-5
shell conditionals or a mode-aware hook installation."

**Outstanding analysis:**

- Read the current pre-commit hook's task-list co-staging logic — what does it do, does it
  actually break in Local mode?
- Reconcile: either the plan's Unchanged claim is wrong, or the analysis is wrong, or both are
  partially right.
- Fix: update plan's Local mode section to accurately describe which hook behaviors change in
  Local mode and which truly are unchanged.

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### A2 — Unsourced "85-90% no lifecycle dependency" statistic · 🟢

**Finding:** Plan § Core Boundary Hypothesis attributes "85-90% of the framework has zero
dependencies on work unit lifecycle workflows" to `analysis-conditional-content-architecture.md`.
Not in the analysis doc. The analysis gives concrete counts (15-25 new conditionals, 4-8 template
`arc:if` blocks, 1-2 recipe conditions) but no percentage. The figure appears manufactured.

**Resolution:** Drop the 85-90% figure. Replace with the analysis's actual counts, or reframe as
"the analysis confirms work unit lifecycle workflows can be excluded entirely via file exclusion,
avoiding dozens of in-prose conditionals." Accurate, sourced, no fabricated number.

**Migrated to plan doc:** *pending*

---

### A3 — "Recipe already supports mode-conditional file installation" · 🟢

**Finding:** Plan § Configuration Identity: "The CLI recipe already supports mode-conditional
file installation." False in the direction Lite needs — recipe only supports additive
`include_files`. See Finding #8 for the architectural follow-up.

**Resolution:** Correct the plan claim. Replace with: "The recipe will need extension to support
mode-conditional file installation (see [recipe architecture] decision)." Link to Finding #8's
eventual resolution.

**Migrated to plan doc:** *pending*

---

### A4 — Template `arc:if` mechanism not discussed · 🟡

**Finding:** `analysis-conditional-content-architecture.md` projects "+4-8 template `arc:if`
blocks for Lite" but the plan doesn't discuss template-render conditionals at all. Either the
plan implicitly assumes template-variant files only (in which case the analysis's projection is
off), or the plan should acknowledge the template-render layer.

**Outstanding analysis:**

- Read `src/lib/template/render.ts` — understand the `arc:if` template mechanism and its
  operator set (`==`, `!=` per earlier code read).
- Determine: does the plan's "template variant" preference (per Finding #5) subsume the template
  `arc:if` use case, or are they complementary?
- If complementary, enumerate where `arc:if` earns its keep (likely: individual config file
  comment blocks, single-file docs with one or two mode-specific callouts).
- Update plan to acknowledge both tools with guidance on when to use which.

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

## Scope Boundaries

### B1 — Content Audit sizing · 🔴

**Finding:** Plan § Content Audit says "audit all framework domains" — no file count, no
person-day estimate, no done definition. Combined with the separate phrasing sweep (also
unsized), these are two large content-touching passes on the tail of the WU. The plan's own
scope boundary note already anticipates scope escape.

**Outstanding analysis:**

- Rough file-count inventory: walk `.arc/reference/`, `.arc/system/workflows/`,
  `.arc/reference/constitution/` — estimate how many files each pass touches.
- Heuristic sizing per file (minutes of work) — small (trivial update), medium (moderate
  rewrite), large (significant restructure).
- Produce a rough estimate — multiply into a time budget. Frame as "implementation phase X of
  modes WU" with a realistic ceiling.
- Decide: are these two passes one phase or two? Can phrasing sweep follow audit without a
  hard separator?

**Resolution:** *pending*

**Migrated to plan doc:** *pending*

---

### B2 — Finding C pointer formalization boundary · 🟢

**Resolved by Finding 15.** In scope for modes WU.

---

### B3 — Full → Lite downgrade scope · 🟢

**Resolved by Finding 16.** Supported if reasonable; descope only if implementation proves
material.

---

### B4 — Absent consolidated deliverable inventory · 🟡

**Finding:** Scanning the plan I count ~18–20 discrete deliverables (scope template, Lite/Local
config templates, two new workflows, two new skills, Lite session-init variant, Lite
process-task-loop variant, status header updates to lifecycle workflows, status vocab update to
task-list-formatting strategy, manifest schema extension, recipe schema extension, backing store
mechanism, re-clone detection, forbidden-combinations validation, content audit, phrasing sweep,
etc.). No consolidated list exists.

**Resolution:** Build the list once Tier 1–3 decisions have landed. Format: flat list grouped by
Lite / Local / Shift / Cross-cutting / CLI+manifest / Content sweep. Sized roughly per item
where possible. Insert as new section near the end of `plan-arc-modes.md` — gates formalization
readiness.

**Migrated to plan doc:** *pending*

---

## Structural Recommendations

(These are the "Next" recommendations from the original synthesis. They feed directly into
making the plan formalization-ready.)

### R1 — Resolve recipe architecture · 🟡

Same as Finding #8. Tracking there.

### R2 — Fix unvalidated claims · 🟡

Same as A1, A2, A3. Tracking there.

### R3 — Sketch Lite concrete surface · 🟡

Addresses Findings #1, #2, #3, #4, #5, #6. Tracking as those individual findings.

### R4 — Consolidated deliverables inventory · 🟡

Same as B4. Tracking there.

### R5 — Walk missing shift scenarios · 🟡

**Finding:** Two missing scenarios: integrate-work-unit on a paused/waiting-for WU (Finding #13,
tracked), and shift-with-activation end-to-end (Finding #14, tracked).

**Resolution:** Covered by Findings #13 and #14.

### R6 — Resolve OQ15 (initial-setup workflows) · 🟡

Same as Finding #12. Tracking there.

### R7 — Backing store sync protocol paragraph · 🟡

Same as Finding #17. Tracking there.

### R8 — Zero-commit Local init · 🟡

Same as Finding #18. Tracking there.

---

## Work log

*Append dated entries as findings resolve. Each entry lists: finding IDs touched, what was
decided, what migrated into `plan-arc-modes.md`, what's next.*

**2026-04-10 — initial population**

Findings pre-populated from the original `/arc-plan` audit synthesis plus the user's first-pass
responses. Tier sequencing established. No findings migrated yet. Next: deep-dive on Finding #1
(Lite PRD functional requirements).

**2026-04-10 — Finding #1 deep-dive**

Conducted first-pass analysis on Finding #1 (Lite PRD functional requirements). Enumerated ten
purposes the Full PRD serves, tested each against Lite's single-bounded-effort context, walked
`template-prd.md` and `1_create-prd.md` section/step-by-step. Eight of ten purposes survive in
Lite; cuts concentrate at `Type:` field, dependency-tracking header, and (per user decision)
Document History section. Workflow is ~90% mode-neutral with mode-specific content at the
edges — unified create-prd with mode conditionals adopted as the shape. Five sub-questions
resolved per user leans plus one user override (Document History cut entirely, not simplified).

Findings updated:

- **#1** 🟡 → 🟢 Resolved. Full resolution captured; pending migration to plan doc.
- **#3** 🟡 → 🟢 Resolved. Success Criteria linkage confirmed; ship step protocol defined;
  detail-design items remain but don't block formalization.

New findings added:

- **#19** Lite framing and graduation expectations. Raised during step-through as a
  cross-cutting concern that should be captured in the PRD's Requirements but doesn't gate
  formalization. Status 🟡. (Originally numbered #17 at time of writing; renumbered to #19
  on 2026-04-10 when new findings #9 and #10 were inserted after Finding #8.)

Cascades noted (informational, no status change): Findings #2, #4, #6, #8, #12, and A4 —
cross-references added in Finding #1's Cascades section to inform analysis direction when
those findings come up.

**Next:** Decision point — migrate Findings #1 and #3 into `plan-arc-modes.md` now, or
continue to the next Tier 1 finding (#8 recipe architecture) and batch migrations later.

**2026-04-10 — Finding #8 current-state bridge**

Read the recipe + manifest pipeline source to produce a factual landscape for Finding #8
(recipe architecture). Deliberately no evaluation of the four candidate approaches — that's
reserved for the next session's focused synthesis work. Intent: give the evaluation a
concrete foundation so it doesn't spend its first half re-deriving how the code works.

Files read: `lib/template/recipe.ts`, `lib/template/render.ts`, `lib/manifest/plan.ts`,
`lib/manifest/update-files.ts`, `lib/manifest/merge.ts`, relevant portions of
`lib/classification.ts` (`resolveFileList`), `commands/init.ts` (manifest construction),
`lib/manifest/apply.ts` (removals path).

Key facts established and captured in Finding #8's new **Current state** subsection:

- `resolveFileList()` is the single file-resolution site. Strictly additive.
- Recipe schema has no `exclude_files` or similar; only `include_files` per condition.
- `evaluateCondition()` operator set is `==` and `includes`; easy to extend.
- Template `arc:if` is a separate mechanism (`==`, `!=`) for in-content conditionals.
- Three consumers duplicate condition iteration (init, update, reconfigure) — code-dup risk
  for any schema change.
- `ARC_IN_GIT_CONDITION` is already special-cased for layer classification — precedent.
- `InstallConfig` has four fields; adding `install_type` is a schema-version bump common to
  all four approaches.
- Removals work today via `buildChangePlan()` + `apply.ts`; what changes between approaches
  is *how* files end up on the removal list, not *whether* removal is possible.
- Pristine store reconstruction during update depends on stored `install_config` — new
  field needs to flow through the full update lifecycle.

Constraint table produced comparing all four approaches on schema impact, call-site impact,
operator precedence concerns, and future extensibility. Common constraints (InstallConfig
field, schema version bump) factored out — differentiation lives in the recipe-schema +
`resolveFileList()` layer.

**Not yet read** (flagged for next session if relevant): test coverage of recipe/manifest
paths, `fileLayer()` function body, `reconfigure.ts` install_config-change handling.

**Next session entry point:** Four-approach evaluation against the constraint table. Decide
early whether the evaluation deserves an `analysis-*` durable doc or stays in-line in the
working doc.

**2026-04-10 — Finding #8 evaluation + resolution (synthesis session)**

Evaluated the four candidate approaches laid out in Finding #8's "Current state" subsection
against the user's "cleanest long-term" criterion. Approaches #3 (two recipes) and #4 (bucket +
gate) ruled out on scaling grounds. Approach #2 (`exclude_files` schema extension) ruled out on
additive-model-fit grounds — introduces subtractive semantics for a single-axis use case with
no defensible operator precedence answer. Approach #1 adopted with refinement to Approach 1b
(symmetric additive) — Full and Lite as peer extensions on a shared unconditional baseline,
matching the existing `pm.mode == arc-in-git` condition pattern rather than privileging either
mode as "the baseline."

Stress-test trace-throughs run against multi-axis composition, update pipeline, pristine
reconstruction, reconfigure in both directions, and legacy manifest migration. All held. The
one composition that looked like it might surface an open question (Lite × `pm.mode:
arc-in-git`) turned out to already be decided in `plan-arc-modes.md` — Lite skips `pm.mode`
prompting entirely, so the condition never fires. Verification caught stale session
understanding and corrected it in place before the decision was committed.

Two adjacent concerns surfaced during evaluation, captured as new findings rather than bundled
under #8:

- **New #9 — Conditional prompts orchestration.** Lite skips `pm.mode` and `team.mode` prompts
  per plan doc, but the current recipe `prompts` array has no conditionality mechanism.
  Surfaced because Finding #8's Approach 1b resolves file inclusion but not prompt gating.
- **New #10 — Lite `arc-config.yml` reduction mechanism.** Plan doc says Lite ships a reduced
  config template; current `arc-config.yml` is a plain `.yml` file in the unconditional
  baseline, so render-time `arc:if` directives don't apply. Needs its own mechanism decision.

Inserting these two new findings after Finding #8 required renumbering old Findings #9–#17 to
new #11–#19. Cross-references updated throughout the document (Sequencing section, Finding #1
Cascades, Finding #8 body references to old #14 → new #16, B2/B3 resolutions, R5/R6/R7/R8
pointers, and the prior work log entry's cross-references).

Findings updated:

- **#8** 🟡 → 🟢 Resolved on mechanism. Decision captured in full Resolution subsection with
  evaluation, stress-test trace-throughs, decided items, and explicit feedforward file bucket
  assignments tied to other findings. Only the `work-unit-lifecycle/*` anchor set is locked
  now; remaining bucket assignments wait on Findings #1, #3, #4, #5, #6, and new #10
  resolution. Migration to plan doc pending (batch with #1 and #3).

New findings added:

- **#9** Conditional prompts orchestration. Status 🟡. Tier 3, gates on #8 (now resolved).
- **#10** Lite `arc-config.yml` reduction mechanism. Status 🟡. Tier 3, gates on #8 (now
  resolved).

Renumbered (all +2): old 9→new 11, old 10→12, old 11→13, old 12→14, old 13→15, old 14→16, old
15→17, old 16→18, old 17→19.

**ADR not created.** The mechanism decision for `install.type` will be formalized as an
Architecture Decision Record during implementation — authored during task execution of the PRD
derived from `plan-arc-modes.md`, not as a pre-PRD artifact. Correct sequencing is working doc
→ plan doc → PRD → task list → ADR authored as a task deliverable. ADR number assigned at
write time, not reserved now.

**Next:** Batch-migrate Findings #1, #3, and #8 into `plan-arc-modes.md` in a consolidated
commit. New findings #9 and #10 continue tracking in this working doc pending their own
resolution. After the batch migration, Tier 1 work is complete and attention moves to Tier 2
(#13 integrate × non-complete, #7 guardrails, #16 downgrade, #3 ship step detail decision).
