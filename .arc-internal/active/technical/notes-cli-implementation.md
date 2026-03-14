# Implementation Reference: CLI Implementation (WU3)

Reference content migrated from `plan-wu3-cli-distribution.md` during PRD creation. Contains
implementation-level detail that the PRD captures as requirements but doesn't repeat as design
specification. Consult during task generation and implementation.

---

## Repository Structure

### Monorepo workspace layout

The CLI package lives in `packages/arc-framework/` as an npm workspace. The root `package.json`
stays `private: true`, keeps markdown linting for framework docs, and configures the workspace.
This structure maps to the WU4 publish mirror — `packages/arc-framework/` is the extraction
boundary for the public `arc-framework` repo.

```text
arc-agentic-dev-framework/          <- Private dev repo (renamed to arc-framework-dev in WU4)
  package.json                      <- Private, workspaces: ["packages/arc-framework"],
                                       lint:md scripts, convenience build/test delegates
  .arc/                             <- Deployable template system (framework methodology)
  .arc-internal/                    <- Framework development workspace (never published)
  packages/
    arc-framework/                  <- The publishable npm package
      package.json                  <- name: "@arc-framework/cli", type: module, bin → dist/cli.js
      tsup.config.ts                <- Build config (ESM, shebang, declarations)
      vitest.config.ts              <- Test config
      src/
        cli.ts                      <- Entry point: Commander setup, subcommand routing
        commands/
          init.ts                   <- Interactive init flow
          update.ts                 <- Three-way merge update
          status.ts                 <- File modification status, version check
          diff.ts                   <- Customization diff (adopter vs. pristine)
        lib/
          merge.ts                  <- Three-way merge wrapper (git merge-file)
          manifest.ts               <- Manifest read/write, schema, file inventory
          render.ts                 <- Token substitution, conditional processing
          hash.ts                   <- Content hash computation (SHA-256)
          git.ts                    <- Git operations (merge-file, config, status)
          files.ts                  <- File copy, directory creation, gitignore/gitattributes
          skills.ts                 <- Skill generation (canonical → per-tool copies)
        templates/
          user/                     <- CLI-internal user templates (SESSION-NOTES, ATOMIC-INBOX)
        prompts/
          init-prompts.ts           <- @clack/prompts flow definitions
        types.ts                    <- Shared types (Manifest, FileEntry, InstallConfig, etc.)
      init-recipe.json              <- Maps prompts → tokens, conditions → file sets
      __tests__/
        unit/                       <- Pure function tests (render, merge, manifest, hash)
        integration/                <- Filesystem tests (init flow, update flow, skill gen)
        e2e/                        <- Full CLI invocation in temp git repos
        fixtures/                   <- Test templates, sample manifests, mock framework dirs
```

### Published package (what `npm publish` ships)

```text
arc-framework/
  package.json
  dist/
    cli.js              <- Compiled entry point (with shebang, ESM)
    commands/            <- Compiled command modules
    lib/                 <- Compiled library modules
    types.d.ts           <- Type declarations (for programmatic use if ever needed)
  arc/                  <- ARC template files (build-time copy of .arc/)
  templates/
    user/               <- CLI-internal user templates (SESSION-NOTES, ATOMIC-INBOX)
  init-recipe.json      <- Prompt/token/condition mappings
```

`.arc/` is the single source of truth for framework template files. The build step copies
`.arc/` → `arc/` in the package. No maintained copy in git — the bundled `arc/` is a build
artifact. `templates/user/` holds CLI-internal resources that don't exist in `.arc/`.
Skill canonical sources live in `.arc/system/skills/`.

### Public repo sync (WU4)

The public `arc-framework` repo is a read-only mirror of the publishable subset. A GitHub Action
on release tags extracts `packages/arc-framework/`, `.arc/` (framework templates), and community
files, then pushes to the public repo. npm publish happens directly from this private repo via
CI (trusted publishing or npm token). See the WU4 plan for the full publish mirror pattern.

## Init Prompt UX Specification

Finalized prompt sequence for `arc init` (4 prompts). The recipe (`init-recipe.json`) stores
config values and condition identifiers; the @clack/prompts implementation (Task 3.4.e) maps
these to the user-facing rendering below.

### Prompt 1: Project Name

```text
◆ Project name?
│ my-project              ← default inferred from path.basename(cwd)
```

Type: text. Token: `PROJECT_NAME`.

### Prompt 2: Tool Selection

```text
◆ Which AI development tools do you use?
│ ◻ Claude Code
│ ◻ Codex
│ ◻ Cursor
│ ◻ GitHub Copilot
│ ◻ Windsurf
│ ◻ Gemini
│ ◻ Warp
```

Type: multiselect. Display labels map to condition values: `claude`, `codex`, `cursor`,
`copilot`, `windsurf`, `gemini`, `warp`. Joined as comma-separated string for condition
evaluation (e.g., `tools includes claude`).

### Prompt 3: Project Management Approach

```text
◆ Project management approach?
│
│ ● ARC Core — Methodology and workflows only
│     Sessions, task execution, quality gates, context preservation.
│     Use your own tools for planning and tracking.
│
│ ○ ARC Core + Planning — Built-in project management (recommended for solo/small teams)
│     Everything in Core, plus roadmaps, backlogs, and status tracking
│     managed alongside your code in git. (arc-in-git)
│
│ ○ External tools — Core methodology + external tracker integration
│     Use ARC with Jira, Linear, GitHub Issues, or similar.
```

Type: select. Config key: `pm.mode`. Display labels map to config values: `none`,
`arc-in-git`, `external`. Default: `none` (ARC Core).

### Prompt 4: Install Directory

```text
◆ Install directory?
│ .arc                    ← default
```

Type: text. Token: `ARC_DIR`. Default: `.arc`. Prompted because changing post-install is
essentially a re-install — all paths, cross-references, and agent instructions depend on it.

## Template Rendering Syntax

### Token substitution

Simple `{{TOKEN}}` string replacement:

```markdown
# {{PROJECT_NAME}} — Development Rules
...
Base branch: `{{BASE_BRANCH}}`
```

Known tokens (complete inventory finalized during implementation):

| Token                   | Source      | Example value      |
|-------------------------|-------------|--------------------|
| `{{PROJECT_NAME}}`      | Init prompt | "My App"           |
| `{{BASE_BRANCH}}`       | Init prompt | "main"             |
| `{{BACKEND_TEST_CMD}}`  | Init prompt | "npm test"         |
| `{{FRONTEND_TEST_CMD}}` | Init prompt | "npm run test:e2e" |
| `{{LINT_CMD}}`          | Init prompt | "npm run lint"     |
| `{{ARC_DIR}}`           | Init prompt | ".arc"             |

### Conditional sections

HTML comment markers, invisible in rendered markdown:

```markdown
<!-- arc:if pm.mode == arc-in-git -->
### Backlog Organization

Use the backlog to capture work before it's ready for active development...
<!-- arc:endif -->
```

Adopters never see these markers. The CLI evaluates conditions against `install_config` and
emits only the matching content. Supported conditions: `pm.mode`, `team.mode`, agent selection,
feature flags (ADR workflow, etc.). Simple equality checks only.

## Skill Generation: Per-Tool Output

`arc-framework init` generates per-tool copies based on agent selection:

- **Claude Code**: `.claude/skills/<name>/SKILL.md` (with `disable-model-invocation: true` for
  arc-\* skills)
- **Codex CLI**: `.agents/skills/<name>/SKILL.md` + `agents/openai.yaml` (UI metadata).
  Codex also scans `.codex/skills/` but `.agents/` is the preferred cross-tool location.
- **Gemini CLI**: `.agents/skills/<name>/SKILL.md` + `.gemini/commands/<name>.toml`
  (for explicit `/command` invocation)
- **GitHub Copilot**: `.github/skills/<name>/SKILL.md` (also scans `.agents/skills/`)
- **Cursor**: `.cursor/skills/<name>/SKILL.md` (also scans `.agents/skills/`)
- **Windsurf**: `.windsurf/skills/<name>/SKILL.md` (does NOT scan `.agents/skills/`)

### What the generator handles beyond file copying

- **Invocation control frontmatter**: `disable-model-invocation: true` for arc-\* skills (de facto
  standard across Claude Code, VS Code/Copilot, Cursor — tools that don't recognize it ignore it)
- **Supplemental files**: Codex requires `agents/openai.yaml`; Gemini uses `.toml` commands
- **Path rendering**: skill instructions reference `.arc/` paths — if install directory is
  customized, these paths are rendered with the correct base

### Naming standardization

Current `.codex/skills/` uses non-canonical names (`atomic-commit` instead of `arc-commit`,
`resume-current` instead of `arc-resume`). The CLI's skill generator uses canonical names from
`.arc/system/skills/` — all tools get consistent `arc-*` naming.

## Reconfiguration and Migration (Deferred to Post-Beta)

Design reference for when `reconfigure` is implemented.

**Team mode changes (solo → team):**

- ADR-012 unified model eliminates this migration — `user/{identity}/` exists in all modes
- Adding team members creates new `user/{name}/` directories, no file migration needed

**PM mode changes:**

- **Adding `arc-in-git`:** Install backlog templates, strategy-backlog-organization.md. Update
  manifest and pristine.
- **Removing `arc-in-git`:** Delete PM files (with confirmation prompt). Update manifest.
- **`none` ↔ `external`:** No file changes — only the config value and agent awareness differ.

## Proposal: Extract Save-Path Logic to arc-methods (Deferred to Post-Beta)

Three Core workflows contain inline `pm.mode` conditionals for file save paths:
`1_create-prd.md`, `2_generate-tasks.md`, `activate-work-unit.md`. Each independently implements
"if arc-in-git, use backlog/; otherwise, use active/."

**Proposed method:** `work-unit-paths` in arc-methods.md — given work category and pm.mode,
returns the correct directory at each lifecycle stage. Benefits: single source of truth, cleaner
`reconfigure`, overridable for custom directory structures.

Deferred because the inline conditionals work correctly today. Extraction becomes valuable when
`reconfigure` is implemented — path logic in one place makes mode switching cleaner.

## Identity Resolution

Concrete lookup sequence (ADR-012 consolidated to `arc.identity`):

1. Check `git config arc.identity` (set during init)
2. Fall back to slugified `git config user.name` (available in any git repo)
3. If neither resolves, prompt the developer

`arc init` prompts: "What name should we use for your personal workspace?" → stores in
`git config --local arc.identity`. Used for `user/{identity}/` directory, git notes refs,
and session tracking.

## Template File Audit (Task 3.3.a)

Mapping of `.arc/` files to tokens and conditions for the CLI template engine. All paths
relative to `.arc/`.

### Token Categories

**Prompt-driven tokens** — substituted by `renderTokens` during init from prompt responses:

| Token                 | Source        | Default | Used In                                            |
|-----------------------|---------------|---------|----------------------------------------------------|
| `PROJECT_NAME`        | Init prompt   | —       | AGENTS.PROJECT.template, QUICK-REFERENCE.template, |
|                       |               |         | META-PRD.template, TECHNICAL-OVERVIEW.template,    |
|                       |               |         | PROJECT-STATUS.template                            |
| `PROJECT_DESCRIPTION` | _(removed)_   | —       | _(removed — filled during 02\_define-project)_     |
| `REPO_ROOT`           | Auto-detected | `pwd`   | QUICK-REFERENCE.template, session-init.md          |
| `BASE_BRANCH`         | Init prompt   | `main`  | system/arc-config.yml (via config_key, not token)  |

Note: `BASE_BRANCH` writes to `arc-config.yml` via the `config_key` mapping in init-recipe,
not through `{{TOKEN}}` substitution. The config file is written programmatically, not rendered.

**Guide-text placeholders** — `{{PLACEHOLDER}}` patterns left in scaffolded files for users to
replace during `02_define-project.md`. The render engine leaves unmatched tokens untouched.

Examples: `{{Component}}`, `{{technology, version, notes}}`, `{{lint_command_all}}`,
`{{ARCHITECTURE_OVERVIEW}}`, `{{TEST_COMMAND}}`, `{{MCP server}}`. These are authoring
guidance, not init-time substitution targets.

### Conditional: File-Level (init-recipe conditions → include/exclude)

Entire files installed only when condition is met. Handled by init-recipe `conditions` →
`include_files`, not by inline `<!-- arc:if -->` markers.

| Condition                 | Files Included                                              |
|---------------------------|-------------------------------------------------------------|
| `pm.mode == arc-in-git`   | `backlog/ROADMAP.template.md`                               |
|                           | `backlog/feature/BACKLOG-FEATURE.template.md`               |
|                           | `backlog/technical/BACKLOG-TECHNICAL.template.md`           |
|                           | `reference/PROJECT-STATUS.template.md`                      |
|                           | `reference/strategies/arc/strategy-backlog-organization.md` |
| `agents includes claude`  | `system/agent/CLAUDE.ARC.md`                                |
| `agents includes codex`   | `system/agent/CODEX.ARC.md`                                 |
| `agents includes gemini`  | `system/agent/GEMINI.ARC.md`                                |
| `agents includes copilot` | `system/agent/COPILOT.ARC.md`                               |
| `agents includes warp`    | `system/agent/WARP.ARC.md`                                  |

### Conditional: Inline Sections (`<!-- arc:if -->` markers)

Sections within Framework files that vary by configuration. These need `<!-- arc:if -->` /
`<!-- arc:endif -->` markers added during Task 3.3.b.

**`pm.mode == arc-in-git`:**

| File                                                     | Lines (approx) | Content                                      |
|----------------------------------------------------------|----------------|----------------------------------------------|
| `system/workflows/arc/session-lifecycle/session-init.md` | ~193-205       | arc-in-git discovery (ROADMAP, ATOMIC-INBOX) |
| `system/workflows/arc/3_process-task-loop.md`            | ~203-204       | ATOMIC-INBOX routing                         |

**`pm.mode != arc-in-git`:**

| File                                                     | Lines (approx) | Content                             |
|----------------------------------------------------------|----------------|-------------------------------------|
| `system/workflows/arc/session-lifecycle/session-init.md` | ~207-214       | none/external discovery alternative |

**Note on team mode:** References to "team mode" in DEV-RULES.ARC, AGENTS.PROJECT.template, and
process-task-loop are informational parentheticals, not conditional sections. No inline
markers needed — the content reads correctly regardless of team mode setting.

### File-by-File Classification

**Configurable files — rendered (have tokens, conditionals, or guide-text placeholders):**

| File                                      | Prompt Tokens        | Guide-Text Tokens   | Conditions |
|-------------------------------------------|----------------------|---------------------|------------|
| `system/arc-config.yml`                   | (programmatic write) | —                   | —          |
| `system/agent/AGENTS.PROJECT.template.md` | PROJECT_NAME         | Component, src_dir, | —          |
|                                           |                      | test_dir, etc.      |            |
|                                           | PROJECT_TYPE,        |                     |            |
|                                           | PRIMARY_GOAL         |                     |            |
| `reference/QUICK-REFERENCE.template.md`   | PROJECT_NAME,        | lint_command_*,     | —          |
|                                           | REPO_ROOT            | test_command_*,     |            |
|                                           |                      | type_check_*, etc.  |            |

**Configurable files — copied as-is (no rendering, customized in place by adopters):**

| File                                          | Notes                                             |
|-----------------------------------------------|---------------------------------------------------|
| `system/agent/CLAUDE.ARC.md`                  | Agent-specific config; conditionally included     |
| `system/agent/CODEX.ARC.md`                   | Agent-specific config; conditionally included     |
| `system/agent/GEMINI.ARC.md`                  | Agent-specific config; conditionally included     |
| `system/agent/WARP.ARC.md`                    | Agent-specific config; conditionally included     |
| `system/agent/COPILOT.ARC.md`                 | Agent-specific config; conditionally included     |
| `system/agent/CURSOR.ARC.md`                  | Agent-specific config; conditionally included     |
| `system/agent/WINDSURF.ARC.md`                | Agent-specific config; conditionally included     |
| `reference/constitution/DEV-RULES.PROJECT.md` | Inline examples serve as guidance, not templates  |
| `reference/strategies/STRATEGY-INDEX.md`      | Users add project strategies to existing sections |
| `reference/archive/README.md`                 | Light-configurable, user-populated section        |
| `system/workflows/arc-methods.md`             | Users fill `.override` sections                   |
| `system/workflows/arc-extensions.md`          | Users fill extension point slots                  |

**Scaffolded files — template copies, user replaces all content:**

| File                                              | Prompt Tokens       | Conditions |
|---------------------------------------------------|---------------------|------------|
| `active/WORK-STATUS.template.md`                  | —                   | —          |
| `reference/META-PRD.template.md`                  | PROJECT_NAME,       | —          |
|                                                   | PROJECT_DESCRIPTION |            |
| `reference/TECHNICAL-OVERVIEW.template.md`        | PROJECT_NAME        | —          |
| `reference/PROJECT-STATUS.template.md`            | PROJECT_NAME        | pm.mode    |
| `backlog/ROADMAP.template.md`                     | —                   | pm.mode    |
| `backlog/feature/BACKLOG-FEATURE.template.md`     | —                   | pm.mode    |
| `backlog/technical/BACKLOG-TECHNICAL.template.md` | —                   | pm.mode    |

**Framework files — copy as-is, except those with inline conditionals:**

All 56 Framework files copy without modification. Two need inline `<!-- arc:if -->` markers:

- `system/workflows/arc/session-lifecycle/session-init.md` (pm.mode sections)
- `system/workflows/arc/3_process-task-loop.md` (ATOMIC-INBOX routing)

### arc-config.yml Handling

The config file is NOT rendered through the template engine. The CLI writes it
programmatically from init-recipe `config_key` mappings:

| Prompt         | Config Key          | Default Value |
|----------------|---------------------|---------------|
| base_branch    | `branch.base`       | `main`        |
| protection     | `branch.protection` | `partial`     |
| pm_mode        | `pm.mode`           | `none`        |
| merge_strategy | `merge.strategy`    | `merge`       |
| platform       | `platform.type`     | `github`      |

All other config values keep their documented defaults. The template arc-config.yml ships
with default values; the CLI overwrites only the keys that init prompts collected.

## Versioning and Release Progression

- **`0.1.0`** — WU3 beta. Functional CLI for internal dogfooding.
- **`0.x.y`** — Iteration during dogfooding. Breaking changes allowed (pre-1.0 semver convention).
- **`1.0.0`** — Public release (WU4). Stable CLI, stable manifest schema, stable template format.

Post-1.0, breaking changes in the update system (manifest schema, pristine format) would be
handled in major version bumps with migration logic in the CLI.
