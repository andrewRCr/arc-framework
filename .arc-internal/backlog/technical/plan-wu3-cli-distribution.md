# Plan: CLI & Distribution Tooling (WU3)

**Purpose:** Design and build the `arc-framework` npm package — the CLI that makes ARC installable,
updatable, and configurable for adopters. This is the technical distribution layer for the 1.0
release.

**Status:** Draft
**Created:** 2026-02-22
**Amended:** 2026-03-03 (ADR-008 PM layer dimension), 2026-03-05 (ADR-011 SKILL.md trigger mechanism,
ADR-011 amendment — directory and invocation corrections)

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
      archive-work-unit) always update WORK-STATUS.md immediately, making the auto-resolved
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
| **Framework**    | Workflows, ARC strategies, githooks, generated skills | Auto-merge; conflicts if user customized |
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
- **Adoption defaults (cross-cutting):** The framework ships with all enforcement
  active (the former "Recommended" values). No named profiles or profile selection at
  init. Adopters who want to relax enforcement edit `arc-config.yml` after init — the
  file includes inline comments explaining each setting and its alternatives.

  > **ADR-010 rework needed:** ADR-010 superseded ADR-004's named profiles
  > (Essentials/Recommended/Custom). This section's profile definitions and
  > post-init messaging differentiation are obsolete. WU3 PRD should redesign
  > this section around strong defaults with self-serve config discovery. A binary
  > "relaxed start?" toggle may be reconsidered if CLI testing reveals cold-start
  > friction (see ADR-010 Part 4).

  Default init config (all enforcement active):

  ```yaml
  commit.format: conventional
  commit.context_footer: required
  hooks.commit_msg: enabled
  hooks.pre_commit: enabled
  merge.strategy: merge
  branch.protection: partial
  ```

- **Post-init messaging:** Covers the full system with appropriate progressive depth.
  No profile-differentiated messaging — all adopters receive the same guidance.

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
  skills/               <- Canonical SKILL.md definitions (source of truth for generation)
  init-recipe.json      <- Describes interactive setup options, tokens, conditionals
```

The `framework/` directory in the package is the source of truth for framework files. This is
what gets copied during `init` and what `update` merges from.

The `skills/` directory contains canonical SKILL.md definitions for ARC's workflow triggers.
During init, skills are generated into tool-specific directories (and optionally `.agents/skills/`)
based on the user's agent selection and skills directory configuration.

## Skill Generation

> **ADR-011** established SKILL.md (agentskills.io standard) as ARC's trigger mechanism. This
> section describes how WU3 implements that decision.

ARC workflow triggers are SKILL.md files — thin dispatchers that point to ARC content in `.arc/`.
The framework ships canonical skill definitions in the npm package. `arc-framework init` generates
tool-specific copies based on the user's agent selection.

### Single Source of Truth

Canonical skill definitions live in `.arc/system/skills/` in the deployed project and in the npm
package source. Each skill is a SKILL.md file with standard agentskills.io frontmatter (`name`,
`description`) and minimal instructions pointing to the relevant `.arc/` workflow. The deployed
canonical files are Framework-classified and updated via three-way merge like other `.arc/`
content.

`arc-framework init` generates per-tool output:

- **Claude Code**: `.claude/skills/<name>/SKILL.md` (with `disable-model-invocation: true` for
  arc-* skills, and other Claude-specific frontmatter where needed)
- **Codex CLI**: `.agents/skills/<name>/SKILL.md` + `agents/openai.yaml` (UI metadata).
  Codex also scans `.codex/skills/` but `.agents/` is the preferred cross-tool location.
- **Gemini CLI**: `.agents/skills/<name>/SKILL.md` (Gemini prefers `.agents/` with precedence
  over `.gemini/skills/`) + `.gemini/commands/<name>.toml` (for explicit `/command` invocation)
- **GitHub Copilot**: `.github/skills/<name>/SKILL.md` (also scans `.agents/skills/`)
- **Cursor**: `.cursor/skills/<name>/SKILL.md` (also scans `.agents/skills/`)
- **Windsurf**: `.windsurf/skills/<name>/SKILL.md` (does NOT scan `.agents/skills/`)

**Skills directory configurability:** The default strategy generates `.agents/skills/` (cross-tool
convention, scanned by Codex, Gemini, Cursor, Copilot) plus tool-specific directories for tools
that don't scan it (Claude Code, Windsurf). Users who prefer tool-specific directories only (no
`.agents/` dir) can configure this — useful when a user has a single tool or an existing
`.codex/skills/` directory they want to keep. This is an `arc-config.yml` setting with the
cross-tool default.

`arc-framework update` regenerates when skill definitions change. Generated files are classified
as Framework (managed, auto-updated).

### What the Generator Handles

The generation step is not purely "copy SKILL.md to N directories." Per-tool differences include:

- **Invocation control frontmatter**: ARC's arc-* skills use `disable-model-invocation: true` to
  prevent auto-loading (these are explicit user actions, not background context). This field is a
  de facto standard across Claude Code, VS Code/Copilot, and Cursor but not part of the
  agentskills.io spec — tools that don't recognize it ignore it harmlessly
- **Supplemental files**: Codex requires `agents/openai.yaml`; Gemini uses `.toml` commands
- **Path rendering**: Skill instructions reference `.arc/` paths — if the install directory is
  customized (see [Configurable Install Directory](#configurable-install-directory)), these paths
  must be rendered with the correct base

### Team-Integrated Skills

The same generation model extends to team-integrated skills. When a team follows a skill
integration workflow to bring an external skill into their ARC project, the manifest tracks the
integrated skill alongside framework skills. Both are thin dispatchers with the same update
mechanics — `arc-framework update` regenerates all managed skills.

The scope question for the WU3 PRD: whether team-integrated skill generation ships at 1.0 or
is deferred. Framework skill generation is required; team skill generation is an extension of the
same system.

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
5. **Agent tooling** — skill generation (SKILL.md per ADR-011), multi-agent install selection
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

## For Strong Consideration: Extract Save-Path Logic to arc-methods

**Context:** WU2 Task 7.7R (Core/arc-in-git boundary audit, `tasks-methodology-completion.md`)
identified that several Core workflows contain inline `pm.mode` conditionals for file save paths
and activation steps. The inline approach works but creates maintenance surface area across
multiple workflow files. This section proposes a cleaner architecture for WU3 to evaluate.

**Current state (WU2 inline conditionals):**

Three workflows have inline pm.mode checks:

- `1_create-prd.md` — where to look for plan-\*.md files
- `2_generate-tasks.md` — where to save task lists (backlog/ vs. active/)
- `activate-work-unit.md` — whether to run backlog → active migration steps

Each workflow checks `arc-config.yml` → `pm.mode` and branches. The logic is small (a few lines
per workflow) but duplicated — every workflow independently implements "if arc-in-git, use backlog/;
otherwise, use active/."

**Proposed: arc-methods extraction:**

Extract the mode-dependent logic into arc-methods.md as one or two new methods:

- **`work-unit-paths`** — Given a work category (feature/technical) and pm.mode, returns the
  correct directory for planning artifacts (plan-\*.md, PRDs, task lists) at each lifecycle stage.
  Default: `active/{category}/` for none/external, `backlog/{category}/` → `active/{category}/`
  graduation for arc-in-git.
- **`activation-steps`** *(optional)* — The set of steps needed to transition a work unit to
  active. Default: branch creation + status updates for none/external; adds backlog verification
  and git mv for arc-in-git.

**Benefits:**

- Single source of truth for path logic (instead of 3 inline copies)
- `arc init --reconfigure` pm.mode changes only need to update arc-methods.md, not patch
  individual workflows
- Teams with non-standard directory structures can override the method
- Consistent with the existing arc-methods pattern (commit-format, leave-it-cleaner, etc.)

**Migration path from inline conditionals:**

1. Add the new method(s) to arc-methods.md with the current inline logic as the default
2. Update workflows to reference the method instead of inline checks
3. Inline conditionals become the method's `.default` section
4. Teams can override via `.override` for custom directory structures

**Relationship to `arc init --reconfigure`:**

When a user switches pm.mode (e.g., none → arc-in-git), the CLI currently needs to handle file
migration. With method extraction, the CLI updates arc-methods.md defaults and the workflows
automatically follow the new paths. This is cleaner than patching workflow files during
reconfigure.

**Recommendation:** Evaluate during WU3 PRD creation. If WU3 is already touching workflow rendering
and conditional processing, extracting this logic to arc-methods is low incremental cost. If WU3
focuses purely on packaging and update mechanics, defer to a post-1.0 methodology refinement.

## Configurable Install Directory

**Status:** For PRD evaluation — not committed as a design decision.

The framework defaults to `.arc/` as the install directory. Some teams may prefer a different name or location:

- **Visible directory**: `arc/` instead of `.arc/` (dotfiles hidden in some editors/OS defaults)
- **Subdirectory placement**: `docs/.arc/` or `docs/arc/` (team already has a `docs/` directory)
- **Custom name**: Any directory name the team prefers

**Viability assessment:** Most cross-references within `.arc/` use relative paths — these work regardless of the
parent directory name or location. The files that reference `.arc/` as an absolute path from repo root (agent files,
DEV-RULES, README, session-init) are a bounded set (~8-12 files). A `{{ARC_DIR}}` token in the template engine
handles these during init and update.

**Considerations:**

- The `.pristine/` copy and manifest would need to track the configured directory name
- Skill generation must render `.arc/` path references with the configured value
- Documentation and onboarding materials reference `.arc/` extensively — the template engine handles rendered files,
  but community resources, blog posts, and external references will always say `.arc/`
- The dotfile prefix (`.arc/`) is a feature for some (clean explorer) and friction for others (hidden from view).
  Making this configurable satisfies both without taking sides.

**Recommendation:** Include as an init prompt with `.arc/` as the strong default. The template rendering
infrastructure needed for other init features (project name, base branch, test commands) handles this naturally —
it's one more token, not a new system.

## Exclusions

- No changes to methodology documents (WU2 scope)
- No docs site implementation (WU4 scope)
- No README updates (WU4 scope, though CLI commands must be stable before README is final)
- No configurability architecture decisions (WU1 scope)
- The agent-driven consistency audit workflow implementation (belongs in methodology, not CLI)

---
