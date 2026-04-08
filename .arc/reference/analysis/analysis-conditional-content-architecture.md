# Analysis: Conditional Content Architecture

**Date:** 2026-04-08
**Purpose:** Inventory all conditional mechanisms in ARC, assess scaling for proposed modes (Lite, local),
and establish pattern guidance for new conditionals. Feed-forward deliverable for the Operating Modes work unit.
**Work Unit:** `tasks-methodology-maturation.md` (Phase 6)

---

## Contents

- [Mechanism Types](#mechanism-types) — taxonomy and rendering pipeline
- [Inventory: In-Prose Conditionals](#inventory-in-prose-conditionals)
- [Inventory: Template `arc:if` Blocks](#inventory-template-arcif-blocks)
- [Inventory: Recipe File Inclusion](#inventory-recipe-file-inclusion)
- [Inventory: Runtime Code Gates](#inventory-runtime-code-gates)
- [Config Key Summary](#config-key-summary) — cross-mechanism view per key
- [Scaling Assessment](#scaling-assessment) — Lite and local mode projections
- [Pattern Guidance](#pattern-guidance) — how to add new conditionals

---

## Mechanism Types

ARC uses four distinct conditional mechanisms. Each operates at a different point in the content lifecycle
and serves a different purpose.

| Mechanism                 | When it runs              | Operator set     | Where defined                 | Output                                      |
| ------------------------- | ------------------------- | ---------------- | ----------------------------- | ------------------------------------------- |
| **In-prose**              | Agent reads at runtime    | Natural language | `.arc/` workflow/doc files    | Agent skips/modifies steps                  |
| **Template `arc:if`**     | `arc init` / `arc update` | `==`, `!=`       | `.template.md` source files   | Blocks stripped or kept in rendered output  |
| **Recipe file inclusion** | `arc init` / `arc update` | `==`, `includes` | `init-recipe.json`            | Files added to or excluded from install set |
| **Runtime code gates**    | CLI command execution     | TypeScript `if`  | `packages/arc-framework/src/` | Behavior branches in handlers/lib           |

**Key distinction:** Template `arc:if` and recipe conditions resolve once at install/update time — the
rendered `.arc/` files contain no trace of the conditional. In-prose conditionals persist in installed files
and resolve every time an agent reads the document. Runtime code gates execute in the CLI process.

**Githook shell conditionals** are a subtype of runtime code gates — shell `if` statements in `pre-commit`
and `commit-msg` that branch on config values read from `arc-config.yml` and `git config`. Inventoried
alongside the TypeScript gates.

---

## Inventory: In-Prose Conditionals

Conditionals embedded in natural language that change agent behavior based on configuration state.
Organized by file, with the config key and behavioral effect for each.

### Workflows — Session Lifecycle

**`session-init.md`** (7 conditionals)

| Line | Config key          | Condition                                               | Effect                                                       |
| ---- | ------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| ~51  | WORK-STATUS state   | Task execution workflow conditional on active task list | Skip item 11 load if no task list                            |
| ~115 | `arc.role`          | `= contributor`                                         | Load reduced document set (skip items 8, 10-11, Step 5)      |
| ~181 | WORK-STATUS state   | Task list shows `[none]`                                | Skip task list loading (item 10)                             |
| ~207 | WORK-STATUS state   | Task list shows `[none]`                                | Skip task execution workflow (item 11)                       |
| ~252 | `arc.role`          | `= contributor`                                         | Skip Step 5 entirely (freshness checks, work unit discovery) |
| ~260 | SESSION-NOTES state | Handoff hash matches HEAD                               | Skip freshness check                                         |
| ~291 | WORK-STATUS state   | Active task list exists                                 | Skip next work unit discovery                                |

**`session-handoff.md`** (3 conditionals)

| Line | Config key        | Condition                                 | Effect                                      |
| ---- | ----------------- | ----------------------------------------- | ------------------------------------------- |
| ~34  | `arc.role`        | `= contributor`                           | Write SESSION-NOTES only, skip full handoff |
| ~327 | `arc.role`        | `= contributor`                           | Skip WORK-STATUS.md commit section          |
| ~348 | WORK-STATUS state | WORK-STATUS will ride with pending commit | Skip standalone commit                      |

### Workflows — Work Unit Lifecycle

**`activate-work-unit.md`** (6 conditionals)

| Line | Config key          | Condition            | Effect                                                     |
| ---- | ------------------- | -------------------- | ---------------------------------------------------------- |
| ~40  | `branch.protection` | `full` vs `partial`  | Artifacts reach base branch via PR vs direct commit        |
| ~52  | `pm.mode`           | `none` or `external` | Skip Step 1 (verify planning artifacts on base branch)     |
| ~79  | `pm.mode`           | `none` or `external` | Skip Step 3 (move docs from backlog to active)             |
| ~96  | `pm.mode`           | `!= arc-in-git`      | Skip PRD path reference update                             |
| ~129 | `pm.mode`           | `none` or `external` | Skip Step 5 (update PM artifacts: ROADMAP, PROJECT-STATUS) |
| ~150 | `pm.mode`           | `arc-in-git`         | Add PROJECT-STATUS.md and ROADMAP.md to commit file set    |

**`archive-work-unit.md`** (4 conditionals)

| Line | Config key          | Condition                          | Effect                                       |
| ---- | ------------------- | ---------------------------------- | -------------------------------------------- |
| ~15  | `branch.protection` | `full`                             | Archival commits require PR, not direct push |
| ~39  | `branch.protection` | `partial`                          | Archive directly on base branch              |
| ~61  | Branch state        | Prior implementation branch exists | Skip branch creation sub-step                |
| ~179 | `pm.mode`           | `none` or `external`               | Skip PM artifact updates (Step 6)            |

**`integrate-work-unit.md`** (4 conditionals)

| Line | Config key          | Condition             | Effect                                                    |
| ---- | ------------------- | --------------------- | --------------------------------------------------------- |
| ~147 | `pm.mode`           | `arc-in-git` only     | Process ATOMIC-INBOX (skip if `none`/`external` or empty) |
| ~165 | `review.pre_merge`  | `enabled`             | Run pre-merge review (skip if disabled)                   |
| ~176 | Commit state        | No commits in Phase 2 | Skip Tier 3 quality gates                                 |
| ~238 | `branch.protection` | `full`                | Archival commits route through PR                         |

**`clean-work-unit.md`** (2 conditionals)

| Line | Config key      | Condition                   | Effect                                |
| ---- | --------------- | --------------------------- | ------------------------------------- |
| ~84  | Classification  | Delete classification       | Skip archive step, delete in Step 6   |
| ~251 | Task list state | Mode 2 (all tasks complete) | Verification step only runs in Mode 2 |

**`verify-arc-integrity.md`** (1 conditional)

| Line | Config key | Condition    | Effect                                                    |
| ---- | ---------- | ------------ | --------------------------------------------------------- |
| ~48  | `pm.mode`  | `arc-in-git` | ROADMAP.md expected in file set (config-conditional file) |

### Workflows — Supplemental

**`manage-incidental-work.md`** (1 conditional)

| Line | Config key          | Condition | Effect                                                |
| ---- | ------------------- | --------- | ----------------------------------------------------- |
| ~133 | `branch.protection` | `full`    | All changes require branches — no direct base commits |

**`activate-planning-branch.md`** (1 conditional)

| Line | Config key          | Condition | Effect                                                  |
| ---- | ------------------- | --------- | ------------------------------------------------------- |
| ~13  | `branch.protection` | `full`    | Planning work requires branches (partial allows direct) |

**`integrate-planning-branch.md`** (1 conditional)

| Line | Config key | Condition       | Effect                                                       |
| ---- | ---------- | --------------- | ------------------------------------------------------------ |
| ~23  | `pm.mode`  | Multiple values | Determines where planning artifacts live (backlog vs active) |

### Workflows — Task Execution

**`3_process-task-loop.md`** (1 conditional)

| Line | Config key  | Condition                      | Effect                 |
| ---- | ----------- | ------------------------------ | ---------------------- |
| ~18  | Task marker | `Build \`test-first\`` present | Load test-first method |

### Methods and Configuration

**`arc-methods.md`** (2 conditionals)

| Line | Config key         | Condition       | Effect                                    |
| ---- | ------------------ | --------------- | ----------------------------------------- |
| ~140 | `arc.role`         | `= contributor` | Use `contribution` context footer pattern |
| ~261 | `review.pre_merge` | `disabled`      | Skip pre-merge review method entirely     |

### Constitution and Agent Briefings

**`DEV-RULES.ARC.md`** (3 conditionals)

| Line | Config key        | Condition               | Effect                                                 |
| ---- | ----------------- | ----------------------- | ------------------------------------------------------ |
| ~49  | `arc.role`        | `= contributor`         | Don't update project-level WORK-STATUS.md              |
| ~87  | `arc.role`        | `= contributor`         | Task execution rules apply through project conventions |
| ~327 | WORK-STATUS state | Active task work exists | Load process-task-loop at init                         |

**`AGENT-BRIEFING.CONTRIBUTOR.md`** (whole-file conditional)

| Line | Config key | Condition       | Effect                                             |
| ---- | ---------- | --------------- | -------------------------------------------------- |
| ~3   | `arc.role` | `= contributor` | Entire briefing replaces standard ARC session path |

### Githook Shell Conditionals

**`pre-commit`** (6 conditionals)

| Line | Config key          | Condition          | Effect                                                             |
| ---- | ------------------- | ------------------ | ------------------------------------------------------------------ |
| ~55  | `branch.protection` | `full` / `partial` | Block vs warn on direct base branch commits                        |
| ~35  | `arc.role`          | `= contributor`    | Skip maintainer-only checks (task staging, numbering, WORK-STATUS) |
| ~172 | `arc.role`          | `= contributor`    | Warn on staging maintainer-managed directories                     |
| ~194 | `arc.role`          | `!= contributor`   | Run task list co-staging check                                     |
| ~215 | `arc.role`          | `!= contributor`   | Run task numbering validation                                      |
| ~289 | `arc.role`          | `!= contributor`   | Run WORK-STATUS co-staging check                                   |
| ~313 | `team.mode`         | `= true`           | Check for `(@name)` ownership markers in task lists                |

**`commit-msg`** (3 conditionals)

| Line | Config key | Condition              | Effect                                                    |
| ---- | ---------- | ---------------------- | --------------------------------------------------------- |
| ~283 | —          | `contribution` pattern | Accept `Context: contribution (...)` footer from any role |
| ~308 | `arc.role` | `= contributor`        | Warn if non-contribution context pattern used             |
| ~365 | `arc.role` | `= contributor`        | Skip WORK-STATUS co-commit advisory                       |

---

## Inventory: Template `arc:if` Blocks

Conditional blocks in `.template.md` source files (`packages/arc-framework/arc/`) that are resolved at
install/update time. Agents never see these — they see the rendered output.

### `session-init.template.md` (6 blocks)

| Line | Condition               | Content summary                                                     |
| ---- | ----------------------- | ------------------------------------------------------------------- |
| 100  | `team.mode == true`     | Personal next task resolution via `(@name)` ownership markers       |
| 287  | `team.mode == true`     | Freshness gap may indicate concurrent developer activity            |
| 294  | `pm.mode == arc-in-git` | ATOMIC-INBOX check at session start                                 |
| 309  | `pm.mode == arc-in-git` | Next work unit discovery (arc-in-git path: ROADMAP, backlog, inbox) |
| 323  | `pm.mode != arc-in-git` | Next work unit discovery (non-arc-in-git path: check active/)       |
| 424  | `pm.mode == arc-in-git` | Reference link to integrate-work-unit.md                            |

### `3_process-task-loop.template.md` (6 blocks)

| Line | Condition               | Content summary                                                            |
| ---- | ----------------------- | -------------------------------------------------------------------------- |
| 23   | `team.mode == true`     | One-task-at-a-time applies per pair; `(@name)` ownership instructions      |
| 177  | `team.mode == true`     | Shared branch concurrency: pull before commit, conflict resolution         |
| 236  | `pm.mode == arc-in-git` | "For later" atomic tasks → ATOMIC-INBOX.md (nested in list)                |
| 240  | `pm.mode == external`   | "For later" atomic tasks → external tracker per DEV-RULES.PROJECT (nested) |
| 244  | `pm.mode == none`       | "For later" atomic tasks → ask user (nested)                               |
| 284  | `pm.mode == external`   | Reference link to DEV-RULES.PROJECT                                        |

### `02_define-project.template.md` (5 blocks)

| Line | Condition               | Content summary                                      |
| ---- | ----------------------- | ---------------------------------------------------- |
| 110  | `pm.mode == arc-in-git` | Steps 6-7: create ROADMAP.md and PROJECT-STATUS.md   |
| 142  | `pm.mode == external`   | Callout to configure-external-integration workflow   |
| 171  | `pm.mode == arc-in-git` | Maintenance reminders for ROADMAP and PROJECT-STATUS |
| 183  | `pm.mode == external`   | Reference link to configure-external-integration     |
| 192  | `pm.mode == arc-in-git` | Reference links to roadmap and project-status        |

### `session-handoff.template.md` (1 block)

| Line | Condition           | Content summary                                                         |
| ---- | ------------------- | ----------------------------------------------------------------------- |
| 77   | `team.mode == true` | WORK-STATUS.md is branch-level state; check git diff before overwriting |

### `2_generate-tasks.template.md` (2 blocks)

| Line | Condition           | Content summary                                          |
| ---- | ------------------- | -------------------------------------------------------- |
| 67   | `team.mode == true` | Task ownership instructions: `(@name)` markers, examples |
| 168  | `team.mode == true` | Reference link to team-coordination strategy             |

**Total: 20 blocks across 5 files.**

---

## Inventory: Recipe File Inclusion

Conditions in `init-recipe.json` that control which files are installed. Evaluated by
`evaluateCondition()` in `recipe.ts`.

| Condition                 | Operator   | Files included                                                                                 | Purpose                    |
| ------------------------- | ---------- | ---------------------------------------------------------------------------------------------- | -------------------------- |
| `pm.mode == arc-in-git`   | `==`       | 5 files: ROADMAP, BACKLOG-FEATURE, BACKLOG-TECHNICAL, PROJECT-STATUS, strategy-planning-module | Planning Module artifacts  |
| `pm.mode == external`     | `==`       | 1 file: 03_configure-external-integration.md                                                   | External tracker setup     |
| `team.mode == true`       | `==`       | 1 file: strategy-team-coordination.md                                                          | Team coordination guidance |
| `tools includes claude`   | `includes` | 1 file: CLAUDE.ARC.md                                                                          | Agent-specific config      |
| `tools includes codex`    | `includes` | 1 file: CODEX.ARC.md                                                                           | Agent-specific config      |
| `tools includes gemini`   | `includes` | 1 file: GEMINI.ARC.md                                                                          | Agent-specific config      |
| `tools includes copilot`  | `includes` | 1 file: COPILOT.ARC.md                                                                         | Agent-specific config      |
| `tools includes cursor`   | `includes` | 1 file: CURSOR.ARC.md                                                                          | Agent-specific config      |
| `tools includes windsurf` | `includes` | 1 file: WINDSURF.ARC.md                                                                        | Agent-specific config      |
| `tools includes warp`     | `includes` | 1 file: WARP.ARC.md                                                                            | Agent-specific config      |

**Unconditional base:** 78 files always installed regardless of configuration.

**Total: 10 conditions, 15 conditional files, 78 unconditional files.**

---

## Inventory: Runtime Code Gates

TypeScript and shell conditionals in the CLI that branch on configuration values at execution time.

### TypeScript (CLI handlers and libraries)

| Location                | Config key  | Condition               | Effect                                                |
| ----------------------- | ----------- | ----------------------- | ----------------------------------------------------- |
| `setup.ts:91`           | `pm.mode`   | `== arc-in-git`         | Write ATOMIC-INBOX.md to user directory during setup  |
| `user.ts:292`           | `pm.mode`   | `== arc-in-git`         | Write ATOMIC-INBOX.md during `arc user add`           |
| `config.ts:29`          | `team.mode` | `== true`               | Set `user.sync_push` to `prompt` (otherwise `always`) |
| `init.ts:243`           | —           | Always                  | Write `arc.role = maintainer` to git config           |
| `join.ts:91`            | User input  | Prompt result           | Write `arc.role` (user-selected) to git config        |
| `init.ts:142`           | `pm.mode`   | `== arc-in-git`         | Build `arcInGitFiles` set for layer classification    |
| `reconfigure.ts:158`    | `pm.mode`   | `== arc-in-git`         | Build `arcInGitFiles` set for layer classification    |
| `update.ts:175`         | `pm.mode`   | `== arc-in-git`         | Build `arcInGitFiles` set for layer classification    |
| `classification.ts:115` | Layer       | `arc-in-git` membership | Assign file layer for manifest entries                |
| `apply.ts:170`          | Layer       | `== arc-in-git`         | Layer-aware behavior during manifest apply            |

### Template Rendering Engine

| Location          | Mechanism              | Effect                                                   |
| ----------------- | ---------------------- | -------------------------------------------------------- |
| `render.ts:38-70` | `arc:if` / `arc:endif` | Strip or keep template blocks based on config map        |
| `recipe.ts:66`    | `==`, `includes`       | Evaluate recipe conditions for file inclusion            |
| `config.ts:45-53` | Config map assembly    | Build `pm.mode`, `team.mode`, `tools` map for evaluation |
| `files.ts:46`     | Rendering pipeline     | Route `.template.*` files through render engine          |

### Shell (Githooks)

See [Githook Shell Conditionals](#githook-shell-conditionals) in the in-prose section above. The githooks
read config values via `arc_config_get` (from `arc-lib.sh`) and `git config`, then branch in shell `if`
statements. They are runtime code gates executed during `git commit`.

---

## Config Key Summary

Cross-mechanism view showing where each config key drives conditional behavior.

| Config key             | In-prose | Template `arc:if` | Recipe                 | Runtime TS | Githook shell | Total locations |
| ---------------------- | -------- | ----------------- | ---------------------- | ---------- | ------------- | --------------- |
| `pm.mode`              | 8        | 13 blocks         | 2 conditions (6 files) | 5          | 0             | 28              |
| `arc.role`             | 10       | 0                 | 0                      | 2          | 7             | 19              |
| `team.mode`            | 0        | 7 blocks          | 1 condition (1 file)   | 1          | 1             | 10              |
| `branch.protection`    | 6        | 0                 | 0                      | 0          | 1             | 7               |
| `review.pre_merge`     | 2        | 0                 | 0                      | 0          | 0             | 2               |
| `tools`                | 0        | 0                 | 7 conditions (7 files) | 0          | 0             | 7               |
| WORK-STATUS/task state | 7        | 0                 | 0                      | 0          | 0             | 7               |

**Observations:**

- `pm.mode` is the most pervasive conditional axis — touches all four mechanism types
- `arc.role` is the second most pervasive but concentrated in prose and githooks (not templates or recipes)
- `team.mode` is relatively contained — 7 template blocks + 1 recipe + 2 runtime
- `tools` is recipe-only and purely additive (agent file inclusion)
- `branch.protection` is prose-only (workflow behavior) + 1 githook
- WORK-STATUS state conditionals are a distinct category — runtime document state, not configuration

---

## Scaling Assessment

### Current Conditional Load

| Mechanism                  | Count                   | Complexity                             |
| -------------------------- | ----------------------- | -------------------------------------- |
| In-prose conditionals      | ~37 across 16 documents | Low — binary skip/include per step     |
| Template `arc:if` blocks   | 20 across 5 files       | Low-medium — some nesting, mostly flat |
| Recipe conditions          | 10 conditions, 15 files | Low — flat additive model              |
| Runtime code gates (TS)    | ~10 locations           | Low — simple `if` branches             |
| Runtime code gates (shell) | ~10 checks              | Low — simple `if` branches             |

### Projected Impact: ARC Lite Mode

ARC Lite removes the work unit lifecycle pipeline. Based on `plan-arc-modes.md`, the core differentiator
is: "Full ARC models projects as a stream of work units; Lightweight ARC models the project as a single
evolving task list."

**What changes:**

- **Work unit lifecycle workflows** (`activate-work-unit`, `archive-work-unit`, `integrate-work-unit`,
  `clean-work-unit`, `verify-work-unit`, planning workflows) — these don't exist in Lite. Not a
  conditional question — they simply aren't installed.
- **Session init/handoff** — Lite skips work unit discovery, task list loading from WORK-STATUS, and
  structured handoff sections that reference work unit state. Estimated 3-5 new in-prose conditionals
  per file, or template blocks if lifecycle guidance is mode-conditional.
- **Process-task-loop** — Lite uses a simpler version (no phases, no coherent unit protocol, no
  verification phase). This could be a separate Lite template or 4-6 new template blocks.
- **DEV-RULES.ARC** — Task execution rules simplify. 2-3 new in-prose conditionals or a conditional
  section.
- **Recipe** — 1 new condition to exclude work unit lifecycle workflows from Lite installs.
- **Githooks** — Minimal impact. Task numbering check might differ; WORK-STATUS co-staging logic may
  simplify. 1-2 new shell conditionals.

**Estimated new conditionals for Lite: 15-25 across all mechanisms.**

### Projected Impact: Local Mode

Local mode changes where ARC state lives (local-only, no git tracking of `.arc/`). This is orthogonal to
Lite vs Full — it's a deployment model, not a methodology variant.

**What changes:**

- **Session state** — git notes portability doesn't apply; SESSION-NOTES.md doesn't need gitignore
  management. 2-3 new in-prose conditionals in session workflows.
- **Commit hooks** — May be absent or drastically simplified (no task list co-staging if `.arc/` isn't
  tracked). 3-5 shell conditionals or a mode-aware hook installation.
- **Recipe** — Potentially a separate recipe or a condition controlling whether `.arc/` is gitignored.
  1 recipe condition.
- **CLI commands** — `arc user save/load/push/pull` behave differently or are no-ops. 2-3 TS gates.

**Estimated new conditionals for local: 10-15 across all mechanisms.**

### Combined Scaling Projection

| Mechanism         | Current | +Lite  | +Local | Projected total |
| ----------------- | ------- | ------ | ------ | --------------- |
| In-prose          | ~37     | +10-15 | +5-8   | ~52-60          |
| Template `arc:if` | 21      | +4-8   | +2-3   | ~27-32          |
| Recipe            | 10      | +1-2   | +1     | ~12-13          |
| Runtime TS        | ~10     | +2-3   | +2-3   | ~14-16          |
| Githook shell     | ~10     | +1-2   | +3-5   | ~14-17          |

**Assessment: Current mechanisms scale.** The projected growth is linear and moderate. The conditional
model doesn't need architectural change for two additional modes. Key reasons:

1. **File exclusion absorbs the largest Lite impact** — work unit lifecycle workflows simply aren't
   installed, avoiding dozens of potential in-prose conditionals.
2. **Template `arc:if` handles the workflow variants** — the existing nesting support and operator set
   (`==`, `!=`) are sufficient for mode-conditional content blocks.
3. **Recipe conditions are additive** — new modes add conditions without complicating existing ones.
4. **No combinatorial explosion** — modes are largely orthogonal (Lite/Full × local/tracked), not
   multiplicative. A workflow step gated on `pm.mode` doesn't also need to branch on local mode.

**Risk areas:**

- **In-prose conditionals in session init/handoff** could become dense if Lite adds many "skip if"
  clauses to already-conditional documents. Consider converting the heaviest sections to template
  blocks (resolved at install time) rather than accumulating in-prose conditionals.
- **Process-task-loop** may warrant a Lite-specific template variant rather than layering conditionals
  into the Full version.

---

## Pattern Guidance

Rules for adding new conditionals to ARC. These patterns should be followed by the Operating Modes work
unit and any subsequent work that introduces mode-conditional behavior.

### Choose the Right Mechanism

| Question                                                      | Answer | Mechanism            |
| ------------------------------------------------------------- | ------ | -------------------- |
| Does the content vary by mode and never change after install? | Yes    | Template `arc:if`    |
| Should an entire file be absent in some modes?                | Yes    | Recipe condition     |
| Does behavior vary at runtime based on current config?        | Yes    | Runtime code gate    |
| Must an agent read the same file but follow different steps?  | Yes    | In-prose conditional |
| Does a githook need mode-aware validation?                    | Yes    | Shell conditional    |

**Prefer install-time resolution over runtime conditionals.** If content can be decided at `arc init` /
`arc update` time, use template blocks or recipe conditions. This keeps rendered documents clean and
reduces agent cognitive load. In-prose conditionals should be reserved for cases where the same
document genuinely needs to serve multiple modes at runtime (uncommon — most workflow documents are
read by one mode's agent).

### In-Prose Conditional Patterns

Use explicit, grep-searchable phrasing:

```markdown
> **Skip this step** if `pm.mode` is `none` or `external`.

**arc-in-git mode only** (`pm.mode: arc-in-git`). Skip if inbox is empty or PM mode is `none`/`external`.

**Full protection (`branch.protection: full`):** Archival commits require PR, not direct push.
```

- Lead with the skip/gate instruction, not the positive case
- Include the config key and value in backticks for searchability
- Use blockquote (`>`) callouts for step-level skips within numbered sequences
- Use bold lead-in for section-level conditionals

### Template `arc:if` Patterns

```markdown
<!-- arc:if pm.mode == arc-in-git -->

Content only for arc-in-git installations.

<!-- arc:endif -->

<!-- arc:if pm.mode != arc-in-git -->

Alternative content for other modes.

<!-- arc:endif -->
```

- One blank line before `arc:if` and after `arc:endif` (prevents merged paragraphs)
- Nesting is supported but keep depth ≤ 2 for readability
- Reference-link definitions can be conditional (only include links used by conditional content)
- Indented conditionals (inside list items) work — the regex allows leading whitespace

### Recipe Condition Patterns

```json
"pm.mode == lite": {
  "include_files": ["path/to/lite-only-file.md"]
}
```

- Use `==` for exact match, `includes` only for multiselect values (currently just `tools`)
- File paths are template-relative (no `.arc/` prefix)
- New modes should use their config value as the condition (e.g., `pm.mode == lite`)

### Runtime Code Gate Patterns

```typescript
if (pmMode === PM_MODE_LITE) {
    // Lite-specific behavior
}
```

- Use constants from `constants.ts` — never hardcode config values
- Keep gates minimal — prefer recipe/template resolution over runtime branching
- Document the gate's purpose in a comment when non-obvious

### Density Thresholds

When a single document accumulates **5+ in-prose conditionals on the same axis**, consider whether the
conditional sections should be template blocks instead (resolved at install time). This is not a hard
rule — some documents (session-init) legitimately serve multiple modes — but high conditional density
signals that the document may be doing too much in prose that could be decided once at install time.

When a template file accumulates **8+ `arc:if` blocks**, consider whether it should be split into
mode-specific variants (separate template files per mode) rather than a single template with many
conditionals.

---
