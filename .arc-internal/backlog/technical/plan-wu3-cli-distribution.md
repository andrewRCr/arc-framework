# Plan: CLI & Distribution Tooling (WU3)

**Purpose:** Design and build the `arc-framework` npm package — the CLI that makes ARC installable,
updatable, and configurable for adopters. This is the technical distribution layer for the 1.0
release.

**Status:** Draft
**Created:** 2026-02-22
**Amended:** 2026-03-03 (ADR-008 PM layer dimension)

---

## Scope

Build the `arc-framework` npm package with an interactive init experience, a three-way merge update
system, and agent tooling generation. WU3 turns the methodology that WU1 and WU2 produce into
something an adopter can run with a single `npx` command.

**This work unit is implementation-focused.** WU1 produces the ADRs and config schema WU3
implements. WU2 produces the clean file structure WU3 packages and installs. WU3 builds the tooling
that wraps both.

The exact 1.0 CLI scope is TBD — this plan captures the full vision, with scope decisions to be made
during PRD creation. Some features described here may be post-1.0.

## Inputs

**From WU1 (Core Philosophy & Configurability Architecture):**

- `arc-config.yml` schema — WU3's interactive init populates this file; WU1 defines what settings
  exist, their valid values, and which are relevant at init time vs. set manually
- Configurability architecture decisions — WU1's ADRs determine which files are framework-owned,
  which are configurable, and how the principle/method distinction maps to CLI behavior
- Progressive adoption tiers — if WU1 defines structural differences between tiers (different files
  installed), WU3 must implement selective install; if tiers are documentation-only, WU3 is unaffected
- Preset/profile definitions — WU3's init UX may offer preset options; WU1 defines what presets mean
- **ADR-008 (Core/PM decomposition)** — Framework decomposes into Core + optional PM layers
  (Solo PM, Team PM). WU3 must implement layer-aware init, manifest, update, and reconfigure.
  Adoption profiles (ADR-004) apply within installed layers — the two axes are orthogonal.

**From WU2 (Methodology Completion):**

- Structural validation output — WU2 ends with a validation pass confirming that files are cleanly
  classified and that mixed-concern content is resolved. WU3 depends on this: mixed-concern files
  cause unnecessary merge conflicts in the update system
- File inventory and classification — every file in `.arc/` needs a classification (Framework,
  Configurable, Scaffolded, Project-Owned) before WU3 can build the manifest and update system
- Final directory layout — WU2 may shift files during methodology work; WU3 needs the settled layout
  before packaging
- Session model file tracking infrastructure — ADR-007 split `CURRENT-SESSION-NOTES.md` into
  `WORK-STATUS.md` (tracked) and `SESSION-NOTES.md` (gitignored). `arc-init` must set up:
    - **`.gitignore` entries**: `.arc/active/SESSION-NOTES.md` (solo), `.arc/team/*/SESSION-NOTES.md` (team)
    - **`.gitattributes` entry**: `.arc/active/WORK-STATUS.md merge=ours` — auto-resolves merge
      conflicts by keeping the target branch version. Post-merge workflows (rotate-branch,
      archive-completed) always update WORK-STATUS.md immediately, making the auto-resolved
      content transient. Primarily a team-mode concern but harmless in solo.
    - **Merge driver config**: `git config merge.ours.driver true` (local git config, one-time
      setup). The `true` command returns success, keeping "ours" unchanged.
    - Convention rationale documented in `strategy-work-organization.md` § Task Lists and Branches

**Source design material (absorbed into this plan):**

The distribution and update system design from the feature backlog is the primary input. Key
concepts are detailed in the sections below — the original doc is not required reading.

## File System Layout

Post-init, an adopter's project looks like this:

```
.arc/
  reference/          <- Project knowledge (constitution, strategies, ADRs, research)
  active/             <- Project-owned scaffolding (active task lists, WORK-STATUS)
  backlog/            <- Solo PM only: backlog documents (ROADMAP, backlogs)
  system/             <- ARC operational components (workflows, githooks, agent files, config)
  team/               <- Team mode scaffolding (optional, installed on request)
  .pristine/          <- Hidden: exact copy of framework files as installed
  .arc-manifest.json  <- Version, file inventory, classification, install config
```

The `.pristine/` directory and `.arc-manifest.json` are created by `arc-framework init` and
maintained by `arc-framework update`. They are not present in the framework source repo — they are
generated artifacts on the adopter's machine.

**Note on layout stability:** The structural readiness pass (B.3) significantly restructured `.arc/`
— introducing `system/` as a separate top-level directory for ARC operational components, splitting
workflows into `arc/` and `project/` subdirectories, and separating framework methodology from
project-configurable content. WU2 may make further structural changes. The CLI sections that
reference specific paths should be refreshed against WU2's final layout before the WU3 PRD is
written.

## File Classification

Classification drives update UX, not merge mechanics. The three-way merge runs the same way
regardless of classification — classification determines what the CLI communicates to the adopter
about expected conflicts.

| Classification   | Examples                                              | Update behavior                          |
|------------------|-------------------------------------------------------|------------------------------------------|
| **Framework**    | Workflows, ARC strategies, githooks, slash commands   | Auto-merge; conflicts if user customized |
| **Configurable** | DEV-RULES.PROJECT, AGENTS file, QUICK-REFERENCE       | Auto-merge; conflicts expected and normal|
| **Scaffolded**   | WORK-STATUS, task lists, PRDs                         | Never touched by updates                 |
| **Project-Owned**| Project strategies, notes, completion docs            | Never touched; user-created content      |

**Layer-conditional files (ADR-008):** Some files exist only when a PM layer is installed.
ATOMIC-TASKS.md (Scaffolded) is Solo PM or Team PM only. BACKLOG-\*.md, ROADMAP.md,
PROJECT-STATUS.md (Scaffolded) are Solo PM only. strategy-backlog-organization.md (Framework)
is Solo PM only. The manifest tracks each file's layer membership alongside its classification.

The manifest stores per-file classification. `arc-config.yml` is Framework-adjacent — it receives
new settings on update but existing user values are always preserved.

## The Update System: Three-Way Merge

### Core Concept

The update system maintains a hidden `.pristine/` directory: an exact copy of framework files as
they were installed (post-rendered, post-conditional — what actually landed on disk, not the raw
templates). On `arc-framework update`:

1. Fetch the new framework version
2. For each managed file: run `git merge-file` with three inputs:
   - Base: `.pristine/<file>` (what was installed)
   - Theirs: new framework version of the file
   - Ours: adopter's current file (potentially customized)
3. Auto-resolve when changes are in different regions of the file
4. Flag conflicts when both framework and adopter changed the same lines
5. Update `.pristine/` to reflect the new version

This is the same merge strategy git uses for branch merges — proven, well-understood, and handles
the common case (framework adds content, adopter customized something else) automatically.

### Pristine Copy Contents

`.pristine/` stores only Framework and Configurable files — the files the update system manages.
Scaffolded and Project-Owned files are excluded. The pristine copy is post-rendered: if the adopter
chose `base_branch: develop` during init, the pristine copy reflects `develop`, not the template
token `{{BASE_BRANCH}}`.

This means the pristine base is always comparable to the adopter's actual file state — no token
substitution needed during merge.

### Open Questions: Merge Edge Cases

These need resolution during PRD or implementation:

- **Heavily restructured files** — If WU2 reorganizes a file significantly between releases,
  the three-way merge may produce excessive conflicts even when the adopter's changes are small.
  Mitigation: WU2's structural cleanup reduces this risk; long-term, large restructurings may
  need migration notes or a CLI warning.
- **New files in updates** — When a framework update introduces a new file: auto-add to
  the appropriate directory? Prompt the adopter? Current lean: auto-add Framework files to
  `reference/` without prompting; prompt for optional files.
- **Template token evolution** — If a token is removed between versions (e.g., `{{BACKEND_TEST_CMD}}`
  becomes unnecessary), and the adopter's pristine copy has the rendered value while the new
  framework has removed the token entirely, the merge may produce unexpected results. Needs
  explicit handling.
- **Conditional content on update** — If the adopter chose "no backend" at init, some content was
  excluded. A framework update may add content to the excluded sections. Options: respect initial
  choices silently, surface choices for reconsideration (`arc init --reconfigure`), or prompt
  when conditional sections differ significantly.
- **Markdown line length** — The framework standardizes on 120 characters (research confirmed this
  as the GitHub diff viewport ceiling and practical IDE width; 80/100 are code-inherited defaults,
  not documentation conventions). `arc-framework init` should install a markdownlint config with
  the framework's rule set (120-char MD013, disabled code_blocks/tables, etc.) so adopter linting
  matches the framework source. This eliminates spurious merge conflicts on update — the adopter's
  formatting matches the pristine base without rewrapping.

### Merge Granularity and WU2 Dependency

The quality of three-way merges is directly proportional to how cleanly files are structured.
Mixed-concern files — where framework content and project-configurable content coexist at the
paragraph level — produce merge conflicts even when changes are conceptually separate. This is
why WU2's structural validation is a hard dependency: WU3 should not begin implementation until
WU2 confirms that file separation is complete.

## CLI Commands

### `npx arc-framework init`

Interactive setup. Copies and renders framework files, populates `arc-config.yml`, creates
`.pristine/`, writes `.arc-manifest.json`.

Interactive prompts (exact set TBD in PRD, informed by WU1 configurability decisions):

- **Project identity:** Project name, description (populates template tokens)
- **Development environment:** Backend test command, frontend test command, linting commands
  (populates `{{BACKEND_TEST_CMD}}`, `{{FRONTEND_TEST_CMD}}`, etc.)
- **Testing framework:** jest / vitest / pytest / other (populates workflow command references)
- **Workflow options:**
    - `arc-config.yml` settings: base branch, branch protection mode
    - Session state model: WORK-STATUS.md (tracked) + SESSION-NOTES.md (gitignored) per ADR-007
    - Work organization style (solo vs. team — controls whether `team/` directory is installed)
    - **PM layer selection (ADR-008):** "Include in-git project management?" Controls which
      PM layer is installed:
        - Solo + yes → Core + Solo PM (backlogs, roadmap, atomic tasks, project status)
        - Team + yes → Core + Team PM (per-developer atomic tasks, branch inbox, tracker
          integration)
        - Either + no → Core only (bring your own planning tools)
    - Merge strategy (informed by WU1 ADR 8)
- **Content selection:**
    - "Include ADR workflow?" — optional files based on team practices
    - "Which AI agents?" — installs only selected agent directories (`.claude/`, `.codex/`,
      `.gemini/`)
- **Adoption profiles (cross-cutting):** Three profiles pre-configure `arc-config.yml`
  during init (per ADR-004). Profiles are an init convenience — after init, the config
  file is directly editable. No persistent "profile" concept in the framework.

  **Essentials** — Principles committed, enforcement relaxed:

  ```yaml
  commit.format: any
  commit.context_footer: optional
  hooks.commit_msg: disabled
  hooks.pre_commit: enabled
  merge.strategy: merge
  branch.protection: unprotected
  ```

  **Recommended** (default) — Full convention set, all enforcement active:

  ```yaml
  commit.format: conventional
  commit.context_footer: required
  hooks.commit_msg: enabled
  hooks.pre_commit: enabled
  merge.strategy: merge
  branch.protection: partial
  ```

  **Custom** — Interactive selection of individual settings with per-setting
  guidance (purpose, default, alternatives).

  **Note (ADR-008):** Adoption profiles apply within whatever layers are installed. An
  Essentials user can be Core-only or Core + Solo PM. The profile controls enforcement
  depth; PM layer selection controls functionality scope. Both choices are independent.

- **Post-init messaging differentiation:** Each profile produces different post-init
  guidance. Essentials highlights the core workflow quartet (create-prd,
  generate-tasks, process-task-loop, session-init). Recommended covers the full
  system. Custom mirrors whichever profile the resulting config most resembles, with
  notes on any non-default choices.

Template rendering:

- **Tokens:** `{{PROJECT_NAME}}`, `{{BASE_BRANCH}}`, `{{BACKEND_TEST_CMD}}` — string replacement
- **Conditionals:** Sections included or excluded based on init choices (e.g., backend section
  excluded if no backend selected)
- **Markdownlint config:** `init` installs a `.markdownlint-cli2.jsonc` (or equivalent) with the
  framework's rule set — 120-char line length, standard rule overrides. Classification: Framework
  (auto-updated). This ensures adopter linting matches framework conventions out of the box, and
  the pristine base stays aligned across updates without rewrapping.

Post-init, `.pristine/` stores the post-rendered, post-conditional result — what actually landed
on disk.

### `npx arc-framework update`

Runs the three-way merge update. Fetches the latest framework version (or a specified version),
merges each managed file, reports results.

Output categories:

- **Auto-merged:** Framework changes applied cleanly
- **Conflicts:** Adopter and framework both changed the same region — requires manual resolution
- **Skipped:** Scaffolded and Project-Owned files (not managed by update)
- **Layer-absent:** Files belonging to an uninstalled PM layer (not in manifest, never touched)
- **New files:** Framework files that didn't exist in the previous version

On conflict, the CLI leaves standard git conflict markers in the file and reports which files need
attention. The adopter resolves conflicts manually, then runs a follow-up command to confirm
resolution and update `.pristine/`.

### `npx arc-framework diff`

Shows customizations: what the adopter has changed relative to the current framework version.
Useful for auditing before an update, or understanding what would conflict.

Output: unified diff per file (adopter's version vs. pristine), filtered to Framework and
Configurable files.

### `npx arc-framework status`

Shows which managed files are modified vs. up-to-date relative to the installed version, and
whether a newer framework version is available.

### `npx arc-framework reset <file>`

Restores a specific file to the framework default (the current published version, not the pristine
base). Useful when an adopter wants to abandon their customizations and start fresh on a file.
Updates `.pristine/` to match.

## npm Package Structure

```
arc-framework/
  package.json
  bin/
    arc-cli.js          <- Entry point; routes to subcommands
  src/
    commands/           <- init.js, update.js, diff.js, status.js, reset.js
    merge/              <- Three-way merge logic (wraps git merge-file)
    manifest/           <- Manifest read/write, file inventory management
    render/             <- Token substitution, conditional processing
    prompts/            <- Interactive init prompt definitions
  framework/            <- ARC framework source files (the methodology)
  agents/               <- Agent-specific tooling
    .claude/
    .codex/
    .gemini/
  init-recipe.json      <- Describes interactive setup options, tokens, conditionals
```

The `framework/` directory in the package is the source of truth for framework files. This is
what gets copied during `init` and what `update` merges from.

The `agents/` directory contains agent-specific slash command implementations. During init, only
the selected agent directories are installed.

## Slash Command Generation

Slash command content is currently duplicated across `.claude/`, `.codex/`, and `.gemini/` in
different formats. The structural readiness pass flagged slash command deduplication as deferred
to CLI work (Phase C).

WU3 introduces a single-source-of-truth model:

- Slash command definitions live once in the package (likely in `framework/system/commands/` or a
  dedicated `commands-source/` directory)
- `arc-framework init` generates the agent-specific formats from that source during installation
- `arc-framework update` regenerates when slash command definitions change

This eliminates the current maintenance burden where adding a new slash command requires updating
three separate directories in three different formats.

The generation step runs as part of init and update — not as a standalone command. The generated
files are agent-specific and classified as Framework (managed, can be updated).

### Extension: Skill Integration Automation

The same single-source-of-truth generation model extends naturally to skill integration.
WU2 establishes the convention (trigger/content separation: ARC content in `.arc/`, thin
trigger files in agent directories) and creates an `integrate-skill` workflow where the
agent handles classification and adaptation. WU3's generation scripts handle the mechanical
output: given canonical content in `.arc/`, produce the correct trigger file format for each
configured agent tool.

This means `arc-framework init` and `arc-framework update` manage both framework slash
commands AND any team-integrated skills that followed the integrate-skill workflow. The
manifest tracks both — they're the same file type (thin dispatchers) with the same update
mechanics.

The scope question for the WU3 PRD: whether skill trigger generation ships at 1.0 or is
deferred. The slash command generation is required; skill generation is an extension of the
same system but depends on teams actually using the integrate-skill workflow.

## The Manifest: `.arc-manifest.json`

Tracks everything needed for the update system to function:

```json
{
  "framework_version": "1.0.0",
  "installed_at": "2026-02-22T00:00:00Z",
  "install_config": {
    "base_branch": "main",
    "branch_protection": "partial",
    "agents": ["claude"],
    "team_mode": false,
    "pm_layer": "solo",
    "session_tracking": "gitignored"
  },
  "files": {
    ".arc/system/workflows/arc/activate-work-unit.md": {
      "classification": "Framework",
      "layer": "core",
      "version": "1.0.0",
      "modified": false
    },
    ".arc/system/arc-config.yml": {
      "classification": "Configurable",
      "layer": "core",
      "version": "1.0.0",
      "modified": true
    },
    ".arc/reference/strategies/arc/strategy-backlog-organization.md": {
      "classification": "Framework",
      "layer": "solo-pm",
      "version": "1.0.0",
      "modified": false
    }
  }
}
```

The `install_config` section records the adopter's init choices. This is used by `update` to handle
conditional content and by `arc init --reconfigure` to offer re-running init with different choices.
The `pm_layer` field (`"none"`, `"solo"`, or `"team"`) controls which PM layer's files are in scope.
The per-file `layer` field enables layer-aware operations: `update` skips files from uninstalled
layers, and `reconfigure` can add or remove layer files cleanly.

Per-file version stamps embedded in markdown files become unnecessary with the manifest — the
manifest is the authoritative source of per-file version information. WU2 should remove per-file
version stamps from templates if they exist.

## Solo-to-Team Migration and PM Layer Switching

WU2's structural readiness work introduced a `team/` directory and solo-vs-team distinction. The
CLI needs a migration path for projects that start solo and later add team members.

At a minimum:

- `arc-framework init` with `team_mode: true` installs the `team/` directory and configures the
  team workflow scaffolding
- A migration command (or `arc init --reconfigure` with team mode enabled) handles the transition
  for existing solo installs

The concrete change: SESSION-NOTES.md moves from `.arc/active/` to `.arc/team/{name}/` in team mode
(WORK-STATUS.md stays shared in `active/`). The migration must handle this move without data loss.

**PM layer migration (ADR-008):** `arc init --reconfigure` handles PM layer changes:

- **Adding Solo PM:** Installs backlog templates (BACKLOG-FEATURE, BACKLOG-TECHNICAL, ROADMAP,
  PROJECT-STATUS, ATOMIC-TASKS), strategy-backlog-organization.md. Updates manifest and pristine.
- **Adding Team PM:** Installs per-developer ATOMIC-TASKS template, branch inbox method, external
  tracker integration guidance. Updates manifest and pristine.
- **Removing PM:** Deletes PM-layer files (with confirmation prompt). Updates manifest.
- **Switching Solo PM → Team PM:** Removes Solo PM files, installs Team PM files. Data migration:
  ATOMIC-TASKS.md content moves from `active/` to `team/{name}/`; backlog items need manual
  transfer to an external tracker (guidance provided).
- **Core-only → PM:** Straightforward addition (new files only, no conflicts).

PM layer changes are independent of team mode changes — both can happen in the same `--reconfigure`
invocation or separately.

This is a scope question for the PRD — migration may be post-1.0 if solo-to-team and layer
switching can be handled manually with guidance documentation.

## Agent-Driven Consistency Audit (Not CLI Logic)

The cross-cutting concept consistency audit is a workflow, not a CLI feature. When adopters
customize ARC's framework files, related files may drift out of alignment — for example, if
DEV-RULES.PROJECT changes a convention that's also referenced in agent files and workflows.

This is handled by an agent-driven workflow (likely in `system/workflows/`):

1. Agent discovers cross-cutting concepts by reading key framework files
2. Agent checks alignment across files that reference those concepts
3. Agent reports misalignments for human review

Recommended triggers: after `arc update` (changes may introduce inconsistency), after major
customization, periodically during active development, post-init (baseline check).

The CLI surfaces this by recommending the audit workflow after `arc update` completes — it does not
implement the audit logic itself.

## Reference Directory Organization

The current `reference/` directory mixes project knowledge (constitution, ADRs, strategies,
research) with what might eventually be cleaner to separate. This is a question WU2's structural
validation should resolve. The CLI can install to whatever layout WU2 finalizes — no CLI-specific
decisions needed here.

If WU2 determines that infrastructure/tooling concerns need a separate top-level directory, WU3
incorporates that into the package layout and init behavior.

## Versioning

Single semver for framework releases (`1.0.0`, `1.1.0`, etc.). The manifest tracks:

- `framework_version`: installed version (per-manifest)
- Per-file `version`: the framework version when that file was last updated by the CLI

`arc-framework status` compares the installed version against the latest published version and
reports whether an update is available.

Breaking changes in the update system (changes to manifest schema, pristine format) would be
handled in major version bumps with migration logic in the CLI.

## Approach

The plan covers design, implementation, and packaging. Execution will be broken into phases when
the PRD is written:

1. **Scaffolding** — npm package setup, CLI entry point, command routing, basic init (file copy
   without templating)
2. **Template system** — token substitution, conditional processing, init-recipe.json format
3. **Pristine and manifest** — `.pristine/` creation, `.arc-manifest.json` schema and write
4. **Update system** — three-way merge implementation, conflict reporting, pristine update
5. **Agent tooling** — slash command generation, multi-agent install selection
6. **Remaining commands** — diff, status, reset
7. **Interactive init polish** — full prompt set, presets, team mode, PM layer selection,
   reconfigure (including PM layer switching per ADR-008)

The PRD will determine which phases are in 1.0 scope and which are deferred.

## Dependencies

**Upstream (hard dependencies — WU3 cannot begin implementation until these are resolved):**

- **WU1 ADR 4 (Configurability Architecture):** Defines `arc-config.yml` schema. WU3's interactive
  init must know what settings exist before implementing prompts. Init-recipe.json depends on this.
- **WU1 ADR 6 (Progressive Adoption Tiers):** If tiers are structural (different files installed),
  WU3 must implement selective install. If documentation-only, WU3 is unaffected.
- **WU2 structural validation output:** WU3 needs clean file classification before implementing the
  manifest and update system. The merge quality degrades proportionally with mixed-concern content.
- **WU2 final directory layout:** Specific paths in the package and manifest depend on WU2's
  settled layout.

**Upstream (informational — WU3 benefits from but can proceed without):**

- WU1 ADR 8 (Merge Strategy Support): Affects whether `merge_strategy` is an init prompt
- WU1 Presets definition: Affects init UX but can be added after initial CLI scaffold
- **WU2 ADR-008 (Core/PM decomposition):** Defines layer structure, `pm.mode` config, and
  layer-conditional file sets. WU3 must implement layer-aware init, manifest, update, and
  reconfigure. The decomposition is the primary input for PM-related init prompts and
  manifest layer tracking.

**Downstream:**

- **WU4 (Public Release):** Docs site installation guide references CLI commands; README
  installation instructions depend on the published package name and commands

## Exclusions

- No changes to methodology documents (WU2 scope)
- No docs site implementation (WU4 scope)
- No README updates (WU4 scope, though CLI commands must be stable before README is final)
- No configurability architecture decisions (WU1 scope)
- The agent-driven consistency audit workflow implementation (belongs in methodology, not CLI)

---
