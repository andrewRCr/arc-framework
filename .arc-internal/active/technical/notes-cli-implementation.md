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
        prompts/
          init-prompts.ts           <- @clack/prompts flow definitions
        types.ts                    <- Shared types (Manifest, FileEntry, InstallConfig, etc.)
      framework/                    <- ARC framework template files (the methodology content)
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
  framework/            <- ARC template files (copied to adopter's .arc/ during init)
  init-recipe.json      <- Prompt/token/condition mappings
```

The `framework/` directory in the package is the source of truth. `init` renders templates from
it; `update` merges new versions from it. Skill canonical sources live inside `framework/` at
`system/skills/`.

### Public repo sync (WU4)

The public `arc-framework` repo is a read-only mirror of the publishable subset. A GitHub Action
on release tags extracts `packages/arc-framework/`, `.arc/` (framework templates), and community
files, then pushes to the public repo. npm publish happens directly from this private repo via
CI (trusted publishing or npm token). See the WU4 plan for the full publish mirror pattern.

## Init Recipe Sketch

Declarative mapping — the render engine reads it to determine which files to process and which
tokens/conditions to evaluate. Adding a new prompt or conditional file is a recipe edit, not a
code change.

```json
{
  "prompts": [
    {
      "id": "project_name",
      "type": "text",
      "message": "Project name?",
      "token": "PROJECT_NAME"
    },
    {
      "id": "base_branch",
      "type": "text",
      "message": "Base branch?",
      "default": "main",
      "token": "BASE_BRANCH",
      "config_key": "branch.base"
    },
    {
      "id": "pm_mode",
      "type": "select",
      "message": "Where does your project management live?",
      "options": ["none", "arc-in-git", "external"],
      "default": "none",
      "config_key": "pm.mode"
    },
    {
      "id": "agents",
      "type": "multiselect",
      "message": "Which AI agents?",
      "options": ["claude", "codex", "gemini", "copilot", "cursor", "windsurf"]
    }
  ],
  "conditions": {
    "pm.mode == arc-in-git": {
      "include_files": [
        "backlog/ROADMAP.template.md",
        "backlog/feature/BACKLOG-FEATURE.template.md",
        "backlog/technical/BACKLOG-TECHNICAL.template.md",
        "reference/PROJECT-STATUS.template.md",
        "active/ATOMIC-TASKS.template.md",
        "reference/strategies/arc/strategy-backlog-organization.md"
      ]
    },
    "team.mode == team": {
      "include_files": [
        "team/README.md",
        "team/ATOMIC-TASKS.template.md",
        "team/SESSION-NOTES.template.md"
      ]
    }
  }
}
```

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
| ----------------------- | ----------- | ------------------ |
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

- Install `team/` directory with per-developer scaffolding
- SESSION-NOTES.md moves from `.arc/active/` to `.arc/team/{name}/` (WORK-STATUS.md stays shared)
- Migration must handle this move without data loss

**PM mode changes:**

- **Adding `arc-in-git`:** Install backlog templates, strategy-backlog-organization.md. Update
  manifest and pristine.
- **Removing `arc-in-git`:** Delete PM files (with confirmation prompt). Update manifest.
- **`none` ↔ `external`:** No file changes — only the config value and agent awareness differ.

**Team + PM interaction:** In team mode with `arc-in-git`, ATOMIC-TASKS.md uses per-developer
paths (`team/{name}/ATOMIC-TASKS.md`).

## Proposal: Extract Save-Path Logic to arc-methods (Deferred to Post-Beta)

Three Core workflows contain inline `pm.mode` conditionals for file save paths:
`1_create-prd.md`, `2_generate-tasks.md`, `activate-work-unit.md`. Each independently implements
"if arc-in-git, use backlog/; otherwise, use active/."

**Proposed method:** `work-unit-paths` in arc-methods.md — given work category and pm.mode,
returns the correct directory at each lifecycle stage. Benefits: single source of truth, cleaner
`reconfigure`, overridable for custom directory structures.

Deferred because the inline conditionals work correctly today. Extraction becomes valuable when
`reconfigure` is implemented — path logic in one place makes mode switching cleaner.

## Agent Identity Resolution (Team Mode)

Concrete lookup sequence:

1. Check `git config arc.session.identity` (set during team member onboarding)
2. Fall back to `git config user.name` (available in any git repo)
3. If neither resolves, ask the developer (don't fail silently)

`arc-framework init` in team mode prompts for the initial developer name and runs
`git config arc.session.identity <name>` as part of setup.

## Versioning and Release Progression

- **`0.1.0`** — WU3 beta. Functional CLI for internal dogfooding.
- **`0.x.y`** — Iteration during dogfooding. Breaking changes allowed (pre-1.0 semver convention).
- **`1.0.0`** — Public release (WU4). Stable CLI, stable manifest schema, stable template format.

Post-1.0, breaking changes in the update system (manifest schema, pristine format) would be
handled in major version bumps with migration logic in the CLI.
