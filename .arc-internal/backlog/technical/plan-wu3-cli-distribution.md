# Plan: CLI & Distribution Tooling (WU3)

**Purpose:** Design and build the `arc-framework` npm package — the CLI that makes ARC installable,
updatable, and configurable for adopters. This is the technical distribution layer, targeting a
beta release for internal dogfooding before public release (WU4).

**Status:** Draft
**Created:** 2026-02-22
**Amended:** 2026-03-03 (ADR-008 PM layer dimension), 2026-03-05 (ADR-011 SKILL.md trigger mechanism,
ADR-011 amendment — directory and invocation corrections), 2026-03-10 (freshness pass + concreteness
pass — all upstream complete, ADR-009 terminology, resolved caveats, technology decisions locked,
beta framing)

---

## Scope

Build the `arc-framework` npm package with an interactive init experience, a three-way merge update
system, and agent tooling generation. WU3 turns the methodology that WU1 and WU2 produce into
something an adopter can run with a single `npx` command.

**This work unit is implementation-focused.** WU1 produces the ADRs and config schema WU3
implements. WU2 produces the clean file structure WU3 packages and installs. WU3 builds the tooling
that wraps both.

**Release target: beta (`0.x`).** WU3 produces a functional CLI for internal dogfooding — installing
ARC in a real project and battle-testing the workflow before public release. The beta must be
complete enough to exercise the full init → work → update cycle. Public release (1.0) happens in
WU4 after dogfooding feedback is incorporated.

**Beta scope:** `init`, `update`, `status`, `diff`, team mode, skill generation, configurable
install directory. Deferred to post-beta: `reconfigure`, `reset`, team-integrated skills.

## Inputs

> **All upstream work is complete.** WU1, WU1.5, WU2, and Structural Validation are done and
> archived. The inputs below are resolved — WU3 can proceed without waiting on anything.

**From WU1 (Core Philosophy & Configurability Architecture) — ✅ Complete:**

- `arc-config.yml` schema — 13 settings across 6 groups, fully defined with valid values and defaults
- Configurability architecture (ADR-003, ADR-004, ADR-010) — file classifications settled,
  principle/method distinction mapped, strong defaults replace named profiles
- Progressive adoption — ADR-010 replaced ADR-004's named profiles with strong defaults.
  No structural tiers; all adopters get the same files, enforcement relaxed via config
- **ADR-008/009 (PM mode decomposition)** — Framework decomposes into Core + optional PM via
  `pm.mode` setting (`none`, `arc-in-git`, `external`). Team mode is an orthogonal axis.
  WU3 implements mode-aware init, manifest, update, and reconfigure.

**From WU2 (Methodology Completion) + Structural Validation — ✅ Complete:**

- File inventory and classification — 86 files validated with per-file classification
  (Framework/Configurable/Scaffolded) and layer assignment (Core/arc-in-git). Authoritative
  inventory in `strategy-file-classification.md`
- Directory layout — settled and stable. Structural Validation confirmed no further changes needed.
  WU3 can hardcode paths with confidence
- Merge boundaries — all 15 Configurable files confirmed with section-level separation
- Session model tracking — ADR-007 split into WORK-STATUS.md (tracked) and SESSION-NOTES.md
  (gitignored). `arc init` must set up:
    - **`.gitignore` entries**: `.arc/active/SESSION-NOTES.md` (solo),
      `.arc/team/*/SESSION-NOTES.md` (team)
    - **`.gitattributes` entry**: `.arc/active/WORK-STATUS.md merge=ours` — auto-resolves merge
      conflicts by keeping the target branch version
    - **Merge driver config**: `git config merge.ours.driver true` (local, one-time setup)
    - Convention rationale documented in `strategy-work-organization.md` § Task Lists and Branches

## Technology Stack

**Runtime:** Node.js 18+ (LTS baseline). ESM-only (`"type": "module"` in package.json).

**Language:** TypeScript with strict mode. Compiled via tsup — handles shebang injection,
ESM output, declaration files, and clean builds in one tool. No bundler complexity beyond tsup.

**Dependencies (runtime):**

| Package          | Purpose                           | Why this one                                                                            |
|------------------|-----------------------------------|-----------------------------------------------------------------------------------------|
| `commander`      | CLI framework, subcommand routing | 182M weekly downloads, zero deps, 8kB. Subcommand model matches our 5 commands exactly. |
| `@clack/prompts` | Interactive init prompts          | Modern, minimal, clean visual design. Lightweight alternative to inquirer.              |

**Dependencies (dev):**

| Package       | Purpose                                |
|---------------|----------------------------------------|
| `typescript`  | Type checking                          |
| `tsup`        | Build (TS → JS, shebang, declarations) |
| `vitest`      | Test runner (unit + integration)       |
| `@types/node` | Node.js type definitions               |

**Design philosophy:** Lean dependencies, own implementations where simple. The CLI wraps `git`
for merges (via `child_process.execFile`) and does file I/O with Node built-ins (`fs`, `path`).
No need for libraries beyond CLI framework and prompts.

**Package name:** `arc-framework` (confirmed available on npm).

## Testing Methodology

**Approach:** Pragmatic TDD — write tests first for core logic (merge, render, manifest), test-after
for glue code and CLI wiring. Comprehensive coverage across three levels:

**Unit tests** — pure functions, isolated logic:

- Template token substitution (input template + values → rendered output)
- Conditional content processing (markers + config → clean output)
- Manifest read/write/schema validation
- File classification logic (path → classification + layer)
- Content hash computation and comparison
- Init-recipe parsing and validation

**Integration tests** — multi-component interactions with real filesystem:

- Init flow: recipe + prompts → rendered files + pristine + manifest (verify file contents,
  directory structure, gitignore entries, git config setup)
- Update flow: pristine + new version + modified files → merged output (verify three-way merge
  results, conflict markers, pristine update)
- Status/diff: modified files vs. pristine → correct reporting
- Skill generation: canonical skill + agent selection → correct per-tool output
- Conditional content: pm.mode and team.mode variations produce correct file sets

**End-to-end tests** — full CLI invocation in temporary git repos:

- `npx arc-framework init` in a fresh repo → verify complete installed state
- `arc-framework update` after modifying files → verify merge behavior
- `arc-framework status` → verify output accuracy
- Round-trip: init → customize → update → verify customizations preserved

**Test infrastructure:** Vitest for all levels. Integration and e2e tests use temporary directories
(created per test, cleaned up after). Git operations in e2e tests use real git repos initialized
in temp dirs. Snapshot testing for rendered template output where appropriate.

**What NOT to test:** Don't test commander's argument parsing, clack's prompt rendering, or git's
merge algorithm. Test our logic, not our dependencies.

## File System Layout

Post-init, an adopter's project looks like this:

```
.arc/
  reference/          <- Project knowledge (constitution, strategies, ADRs, research)
  active/             <- Project-owned scaffolding (active task lists, WORK-STATUS)
  backlog/            <- arc-in-git PM only: backlog documents (ROADMAP, backlogs)
  system/             <- ARC operational components (workflows, githooks, agent files, config)
  team/               <- Team mode scaffolding (optional, installed on request)
  .pristine/          <- Gitignored: exact copy of framework files as installed
  .arc-manifest.json  <- Committed: version, file inventory, classification, install config
```

Both are created by `arc-framework init` and maintained by `arc-framework update`.

**`.pristine/`** is gitignored — it's a local merge base, not project state. Committing it would
add ~73 duplicated markdown files to every adopter's repo. On fresh clone (no pristine),
`arc-framework update` detects the missing pristine and offers recovery: reset pristine from
the current file state (treating current files as the new baseline for future merges) or
reconstruct from the installed npm package version. The adopter loses nothing — they just can't
three-way merge for that first post-clone update.

**`.arc-manifest.json`** is committed — it's small (single JSON file), tracks project state
(installed version, config choices, file inventory), and must be shared across clones for
`arc-framework status` and `update` to function.

**Layout status:** Directory structure is settled. Structural Validation (completed 2026-03-10)
confirmed the layout after WU2. Paths in this plan are current.

## File Classification

Classification drives update UX, not merge mechanics. The three-way merge runs the same way
regardless of classification — classification determines what the CLI communicates to the adopter
about expected conflicts.

| Classification    | Examples                                              | Update behavior                           |
|-------------------|-------------------------------------------------------|-------------------------------------------|
| **Framework**     | Workflows, ARC strategies, githooks, generated skills | Auto-merge; conflicts if user customized  |
| **Configurable**  | DEV-RULES.PROJECT, AGENTS file, QUICK-REFERENCE       | Auto-merge; conflicts expected and normal |
| **Scaffolded**    | WORK-STATUS, task lists, PRDs                         | Never touched by updates                  |
| **Project-Owned** | Project strategies, notes, completion docs            | Never touched; user-created content       |

**Layer-conditional files (ADR-008, ADR-009):** Some files exist only when `pm.mode: arc-in-git`.
ATOMIC-TASKS.md (Configurable), BACKLOG-\*.md, ROADMAP.md, PROJECT-STATUS.md (all Scaffolded),
and strategy-backlog-organization.md (Framework) are arc-in-git only. In team mode,
ATOMIC-TASKS.md uses per-developer paths (`team/{name}/`). The manifest tracks each file's
layer membership alongside its classification.

The manifest stores per-file classification. `arc-config.yml` is Framework-adjacent — it receives
new settings on update but existing user values are always preserved.

## The Update System: Three-Way Merge

### Core Concept

The update system maintains a gitignored `.pristine/` directory: an exact copy of framework files
as they were installed (post-rendered, post-conditional — what actually landed on disk, not the
raw templates).

**Version fetch is self-contained.** The npm package includes the framework source files in its
`framework/` directory. When the adopter runs `npx arc-framework@latest update`, npx fetches the
latest CLI package — which contains the latest framework files. No separate fetch step, no
registry API calls from our code. The act of running `npx ... @latest` IS the fetch.

For global installs: `npm update -g arc-framework` then `arc-framework update`. Two steps, but
standard for global packages.

On `arc-framework update`:

1. Read new framework files from the CLI's own `framework/` directory (already latest via npx)
2. Read the adopter's init config from `.arc-manifest.json` (to re-evaluate conditionals and tokens)
3. For each managed file: run `git merge-file` with three inputs:
   - Base: `.pristine/<file>` (what was installed last time)
   - Theirs: new framework version (rendered with adopter's config — same tokens, fresh content)
   - Ours: adopter's current file (potentially customized)
4. Auto-resolve when changes are in different regions of the file
5. Flag conflicts when both framework and adopter changed the same lines
6. Update `.pristine/` to reflect the new rendered version
7. Update `.arc-manifest.json` with new `framework_version`

This is the same merge strategy git uses for branch merges — proven, well-understood, and handles
the common case (framework adds content, adopter customized something else) automatically.

**Git dependency:** The CLI shells out to `git merge-file` via `child_process.execFile`. Git must
be installed on the adopter's machine. This is a safe assumption — they're developers using git
for version control. The CLI checks for git availability at startup and reports a clear error
if missing.

### Pristine Copy Contents

`.pristine/` stores only Framework and Configurable files — the files the update system manages.
Scaffolded and Project-Owned files are excluded. The pristine copy is post-rendered: if the adopter
chose `base_branch: develop` during init, the pristine copy reflects `develop`, not the template
token `{{BASE_BRANCH}}`.

This means the pristine base is always comparable to the adopter's actual file state — no token
substitution needed during merge.

### Open Questions: Merge Edge Cases

These need resolution during PRD or implementation:

- **Heavily restructured files** — If a framework release significantly restructures a file,
  the three-way merge may produce excessive conflicts even when the adopter's changes are small.
  Mitigation: Structural Validation established clean baselines; long-term, large restructurings
  may need migration notes or a CLI warning.
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

### Merge Granularity

The quality of three-way merges is directly proportional to how cleanly files are structured.
Mixed-concern files — where framework content and project-configurable content coexist at the
paragraph level — produce merge conflicts even when changes are conceptually separate. Structural
Validation confirmed that all 15 Configurable files have clean section-level separation — this
risk is mitigated.

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
    - **PM mode selection (ADR-008, ADR-009):** "Where does your project management live?"
      Sets `pm.mode` in `arc-config.yml`:
        - `none` → Core only (bring your own planning tools)
        - `arc-in-git` → Core + in-git PM artifacts (backlogs, roadmap, atomic tasks,
          project status). Works for solo and small teams.
        - `external` → Core only + agent awareness of external tool integration
    - Merge strategy
- **Content selection:**
    - "Include ADR workflow?" — optional files based on team practices
    - "Which AI agents?" — installs only selected agent directories (`.claude/`, `.codex/`,
      `.gemini/`)
- **Adoption defaults (cross-cutting, ADR-010):** The framework ships with all enforcement
  active — strong defaults, no named profiles or profile selection. Adopters who want to
  relax enforcement edit `arc-config.yml` after init — the file includes inline comments
  explaining each setting and its alternatives.

  Default init config (all enforcement active):

  ```yaml
  commit.format: conventional
  commit.context_footer: required
  hooks.commit_msg: enabled
  hooks.pre_commit: enabled
  hooks.task_numbering: error
  merge.strategy: merge
  branch.protection: partial
  review.pre_merge: enabled
  pm.mode: none
  platform.type: github
  ```

- **Post-init messaging:** Covers the full system with appropriate progressive depth.
  No profile-differentiated messaging — all adopters receive the same guidance.

### Template Rendering

Template files live in the npm package's `framework/` directory. They contain token placeholders
and conditional markers that the CLI processes during `init`. The adopter's installed files are
clean markdown — no template syntax visible.

**Token substitution** — simple `{{TOKEN}}` string replacement:

```markdown
# {{PROJECT_NAME}} — Development Rules
...
Base branch: `{{BASE_BRANCH}}`
```

Known tokens (PRD will produce the complete inventory):

| Token                   | Source      | Example value      |
|-------------------------|-------------|--------------------|
| `{{PROJECT_NAME}}`      | Init prompt | "My App"           |
| `{{BASE_BRANCH}}`       | Init prompt | "main"             |
| `{{BACKEND_TEST_CMD}}`  | Init prompt | "npm test"         |
| `{{FRONTEND_TEST_CMD}}` | Init prompt | "npm run test:e2e" |
| `{{LINT_CMD}}`          | Init prompt | "npm run lint"     |
| `{{ARC_DIR}}`           | Init prompt | ".arc"             |

**Conditional sections** — HTML comment markers, invisible in rendered markdown:

```markdown
<!-- arc:if pm.mode == arc-in-git -->
### Backlog Organization

Use the backlog to capture work before it's ready for active development...
<!-- arc:endif -->
```

Adopters never see these markers. The CLI evaluates conditions against `install_config` and
emits only the matching content. Supported conditions: `pm.mode`, `team.mode`, agent selection,
feature flags (ADR workflow, etc.). Simple equality checks only — no expression language.

**Markdownlint config:** `init` installs a `.markdownlint-cli2.jsonc` with the framework's rule
set (120-char MD013, disabled code\_blocks/tables, etc.). Classification: Framework (auto-updated
via three-way merge). Ensures adopter linting matches framework conventions.

Post-init, `.pristine/` stores the post-rendered, post-conditional result — what actually landed
on disk.

### Init Recipe (`init-recipe.json`)

The recipe is the bridge between prompts and file operations. It declares what questions to ask,
what tokens they produce, and what conditions gate file inclusion. Sketch of the format (PRD
will produce the complete version):

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

The recipe is declarative — the render engine reads it to determine which files to process and
which tokens/conditions to evaluate. Adding a new prompt or conditional file is a recipe edit,
not a code change.

### `npx arc-framework update`

Runs the three-way merge update. Fetches the latest framework version (or a specified version),
merges each managed file, reports results.

Output categories:

- **Auto-merged:** Framework changes applied cleanly
- **Conflicts:** Adopter and framework both changed the same region — requires manual resolution
- **Skipped:** Scaffolded and Project-Owned files (not managed by update)
- **Mode-absent:** Files belonging to an uninstalled PM mode (not in manifest, never touched)
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

**Source layout (TypeScript):**

```
arc-framework/
  package.json            <- type: module, bin: arc-framework → dist/cli.js
  tsup.config.ts          <- Build config (ESM, shebang, declarations)
  vitest.config.ts        <- Test config
  src/
    cli.ts                <- Entry point: shebang, Commander setup, subcommand routing
    commands/
      init.ts             <- Interactive init flow (prompts, render, write, pristine, manifest)
      update.ts           <- Three-way merge update (read manifest, merge, report)
      status.ts           <- File modification status, version check
      diff.ts             <- Customization diff (adopter vs. pristine)
    lib/
      merge.ts            <- Three-way merge wrapper (shells out to git merge-file)
      manifest.ts         <- Manifest read/write, schema, file inventory
      render.ts           <- Token substitution, conditional processing
      hash.ts             <- Content hash computation (SHA-256 of file contents)
      git.ts              <- Git operations (merge-file, config, status detection)
      files.ts            <- File copy, directory creation, gitignore/gitattributes setup
      skills.ts           <- Skill generation (canonical → per-tool copies)
    prompts/
      init-prompts.ts     <- @clack/prompts flow definitions for arc init
    types.ts              <- Shared types (Manifest, FileEntry, InstallConfig, etc.)
  framework/              <- ARC framework template files (the methodology content)
  init-recipe.json        <- Maps prompts → tokens, conditions → file sets
  __tests__/
    unit/                 <- Pure function tests (render, merge, manifest, hash)
    integration/          <- Filesystem tests (init flow, update flow, skill generation)
    e2e/                  <- Full CLI invocation in temp git repos
    fixtures/             <- Test templates, sample manifests, mock framework dirs
```

**Published package** (what `npm publish` ships):

```
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
`system/skills/` — same location as in the deployed `.arc/`.

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

**Naming standardization:** Current `.codex/skills/` uses non-canonical names (`atomic-commit`
instead of `arc-commit`, `resume-current` instead of `arc-resume`). The CLI's skill generator
uses canonical names from `.arc/system/skills/` — all tools get consistent `arc-*` naming.
Old non-standard directories are not cleaned up automatically (the CLI doesn't delete files it
didn't create).

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

**Deferred to post-beta.** Framework skill generation ships in beta; team-integrated skill
generation is an extension of the same system, added when the pattern is proven.

## The Manifest: `.arc-manifest.json`

Tracks everything needed for the update system to function:

```json
{
  "framework_version": "0.1.0",
  "installed_at": "2026-03-15T00:00:00Z",
  "install_config": {
    "base_branch": "main",
    "branch_protection": "partial",
    "agents": ["claude"],
    "team_mode": "solo",
    "pm_mode": "arc-in-git",
    "arc_dir": ".arc"
  },
  "files": {
    ".arc/system/workflows/arc/activate-work-unit.md": {
      "classification": "Framework",
      "layer": "core",
      "pristine_hash": "a1b2c3d4..."
    },
    ".arc/system/arc-config.yml": {
      "classification": "Configurable",
      "layer": "core",
      "pristine_hash": "e5f6a7b8..."
    },
    ".arc/reference/strategies/arc/strategy-backlog-organization.md": {
      "classification": "Framework",
      "layer": "arc-in-git",
      "pristine_hash": "c9d0e1f2..."
    }
  }
}
```

**Key design decisions:**

- **`pristine_hash`** replaces the previous `modified` + `version` fields. Modification is a
  computed property: compare the adopter's current file hash against `pristine_hash`. No need
  to track it in the manifest — `arc status` computes it on demand. SHA-256 of file contents.
- **`install_config`** records the adopter's init choices. Used by `update` to re-evaluate
  conditional content (same tokens and conditions, fresh framework content). Future
  `reconfigure` command would modify this section and re-render.
- **`team_mode`** uses string values (`"solo"` / `"team"`) rather than boolean for clarity and
  extensibility.
- **`pm_mode`** (`"none"`, `"arc-in-git"`, `"external"`) controls which PM files are in scope.
  The per-file `layer` field enables mode-aware operations: `update` skips files from
  uninstalled modes.

Per-file version stamps embedded in markdown files are unnecessary — the manifest's
`framework_version` is the authoritative version reference.

## Reconfiguration and Migration

Team mode and PM mode are orthogonal axes (ADR-009). `arc init --reconfigure` handles changes
to either axis independently or together.

**Team mode changes (solo → team):**

- Installs `team/` directory with per-developer scaffolding
- SESSION-NOTES.md moves from `.arc/active/` to `.arc/team/{name}/` (WORK-STATUS.md stays shared)
- Migration must handle this move without data loss

**PM mode changes:**

- **Adding `arc-in-git`:** Installs backlog templates (BACKLOG-FEATURE, BACKLOG-TECHNICAL,
  ROADMAP, PROJECT-STATUS, ATOMIC-TASKS), strategy-backlog-organization.md. Updates manifest
  and pristine.
- **Removing `arc-in-git`:** Deletes PM files (with confirmation prompt). Updates manifest.
- **`none` ↔ `external`:** No file changes — only the config value and agent awareness differ.

**Team + PM interaction:** In team mode with `arc-in-git`, ATOMIC-TASKS.md uses per-developer
paths (`team/{name}/ATOMIC-TASKS.md`).

**Deferred to post-beta.** Reconfiguration is not in beta scope. Mode changes during dogfooding
can be handled manually (edit config, add/remove files). The manifest's `install_config` section
is designed to support future `reconfigure` — the data structure is ready even if the command
isn't.

## Team Mode Detection and Agent Identity

**Decision: Add `team.mode` to `arc-config.yml`.** Values: `solo` (default) or `team`.
Informational key, same pattern as `platform.type` — agents already read `arc-config.yml`
during session init, and one config key is simpler than teaching agents to read the manifest
or probe directory structure.

`arc-framework init` sets `team.mode` based on the team mode prompt. The manifest also stores
`team_mode` for the CLI's own use, but the agent-facing signal is `arc-config.yml`.

**Agent identity resolution** — concrete lookup sequence for team mode:

1. Check `git config arc.session.identity` (set during team member onboarding)
2. Fall back to `git config user.name` (available in any git repo)
3. If neither resolves, ask the developer (don't fail silently)

`arc-framework init` in team mode prompts for the initial developer name and runs
`git config arc.session.identity <name>` as part of setup.

**Session-init updates needed** (methodology changes, not CLI code):

- Read `team.mode` from `arc-config.yml` during Step 4
- If `team`: resolve identity via the lookup sequence above, then read SESSION-NOTES.md from
  `team/{identity}/` instead of `active/`
- Graceful fallback when identity is not configured

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

Resolved by Structural Validation. The `reference/` layout is settled: `constitution/`,
`strategies/`, `adr/`, `analysis/`, `research/`, `archive/`, `templates/`. The `system/`
directory handles operational components (workflows, githooks, agent files, config, skills).
No CLI-specific layout decisions needed — WU3 packages the current structure as-is.

## Versioning

Single semver for framework releases. The manifest tracks `framework_version` (installed version).

**Release progression:**

- **`0.1.0`** — WU3 beta. Functional CLI for internal dogfooding.
- **`0.x.y`** — Iteration during dogfooding. Breaking changes allowed (pre-1.0 semver convention).
- **`1.0.0`** — Public release (WU4). Stable CLI, stable manifest schema, stable template format.

`arc-framework status` compares the installed version against the latest published version and
reports whether an update is available.

Post-1.0, breaking changes in the update system (manifest schema, pristine format) would be
handled in major version bumps with migration logic in the CLI.

## Approach

The plan covers design, implementation, and packaging. Execution will be broken into phases when
the PRD is written. Rough phase sketch (PRD refines boundaries):

**Beta scope (WU3 deliverable):**

1. **Scaffolding** — npm package setup (TypeScript, tsup, ESM), CLI entry point with Commander,
   subcommand routing, test infrastructure (vitest)
2. **Template system** — token substitution, conditional content processing, init-recipe.json,
   `.template.md` → rendered output pipeline
3. **Init command** — interactive prompts (@clack/prompts), file rendering, directory creation,
   gitignore/gitattributes/git-config setup, pristine creation, manifest write
4. **Pristine and manifest** — `.pristine/` write (gitignored), `.arc-manifest.json` schema and
   write (committed), content hash computation
5. **Update command** — self-contained version fetch, three-way merge (git merge-file), conflict
   reporting, pristine update, manifest version bump
6. **Status and diff commands** — hash-based modification detection, unified diff output
7. **Skill generation** — canonical skill → per-tool copies, agent selection, naming standardization
8. **Team mode** — team.mode config key, team/ directory setup, identity resolution via git config
9. **Configurable install directory** — `{{ARC_DIR}}` token in template system, init prompt with
   `.arc/` default, path rendering in skills and cross-references

**Deferred (post-beta, potentially WU4 or post-1.0):**

- `reconfigure` command (PM mode switching, team mode migration)
- `reset` command (restore file to framework default)
- Team-integrated skill generation

## Dependencies

**Upstream — all resolved:**

- ✅ **WU1** (ADRs 001-006, 010): Config schema, configurability architecture, strong defaults
- ✅ **WU1.5** (ADR-007): Session state model
- ✅ **WU2** (ADRs 008-009, 011): PM mode decomposition, methodology completion
- ✅ **Structural Validation**: File inventory (86 files), directory layout, merge boundaries

**Downstream:**

- **Dogfooding phase:** Install beta CLI in a real project, exercise the full workflow, identify
  friction and bugs. Feedback drives iteration on the beta before WU4.
- **WU4 (Public Release):** Docs site installation guide references CLI commands; README
  installation instructions depend on the published package name and commands. WU4 publishes
  `1.0.0` to npm after dogfooding stabilizes the CLI.

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

**Disposition:** Defer to post-beta. This is methodology work (editing arc-methods.md and workflow
docs), not CLI code. The inline conditionals work correctly today. The extraction becomes more
valuable if/when `reconfigure` is implemented — at that point, having path logic in one place
makes mode switching cleaner. For beta, the current inline approach is sufficient.

## Configurable Install Directory

**Status:** In beta scope. Low marginal cost — one token (`{{ARC_DIR}}`), one init prompt, same
render pipeline as all other tokens. Better to discover path-reference issues during dogfooding
than after 1.0.

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

**When implemented:** Include as an init prompt with `.arc/` as the strong default. The template
rendering infrastructure handles this naturally — one more token (`{{ARC_DIR}}`), not a new system.

## Exclusions

- No docs site implementation (WU4 scope)
- No README updates (WU4 scope, though CLI commands must be stable before README is final)
- The agent-driven consistency audit workflow implementation (belongs in methodology, not CLI)

---
