# Task List: CLI Implementation

**PRD:** `.arc-internal/active/technical/prd-cli-implementation.md`
**Created:** 2026-03-10
**Branch(es):** `technical/cli-implementation`
**Base Branch:** `main`
**Status:** In Progress

## Overview

**Purpose:** Build the `@arc-framework/cli` npm package — a TypeScript CLI that installs, updates, and
manages ARC framework files for adopters, targeting a beta release (`0.x`) for internal dogfooding.

## Scope

### Will Do

- npm package scaffolding (TypeScript, tsup, vitest, Commander, ESM)
- Internal project infrastructure update (quality gates, commands, technical overview)
- Template engine (token substitution, conditional content, init recipe)
- Core libraries (manifest, hash, git operations, file utilities)
- Init command with interactive prompts, file rendering, git integration
- Update command with three-way merge via `git merge-file`
- Status and diff commands
- Skill generation (canonical → per-agent-tool copies)
- PM mode, team mode, and configurable install directory support
- Session state portability (git notes setup, `arc session` subcommand, methodology docs)
- Framework template files (`.arc/` content with `{{TOKEN}}` placeholders)
- E2E test suite

### Won't Do

- `reconfigure` command (post-beta)
- `reset` command (post-beta)
- Team-integrated skill generation (post-beta)
- Docs site, README updates (WU4)
- Agent-driven consistency audit implementation (methodology, not CLI)

---

## Tasks

### **Phase 1:** Project Scaffolding and Internal Infrastructure

**Purpose:** Stand up the npm package skeleton and update internal project docs to reflect the
transition from documentation-only to a hybrid code + documentation project.

- [x] **1.1 Set up monorepo workspace structure**

    **Goal:** The CLI package lives in `packages/arc-framework/` as an npm workspace. Root
    `package.json` stays private, keeps markdown linting, and gains workspace configuration.
    This structure maps cleanly to the WU4 publish mirror — the workspace package is the
    extraction boundary for the public repo.

    - [x] **1.1.a Configure npm workspaces in root `package.json`**
        - Added `workspaces` array pointing to `packages/arc-framework`
        - Kept existing `lint:md` scripts and `markdownlint-cli2` dev dependency
        - Added `build`, `test`, `test:unit`, `typecheck` convenience scripts delegating to workspace

    - [x] **1.1.b Create `packages/arc-framework/package.json` and claim npm name**
        - `name: "@arc-framework/cli"` (scoped — `arc-framework` unscoped was blocked by npm
          name similarity to `arcframework`). Created `arc-framework` npm org. Binary remains `arc`.
        - `type: "module"`, `bin` entry pointing to `dist/cli.js`, Node 18+ engine requirement
        - Runtime deps: `commander`, `@clack/prompts`; dev deps: `typescript`, `tsup`, `vitest`, `@types/node`
        - Published `0.0.0` placeholder to npm to reserve the package name

    - [x] **1.1.c Create TypeScript and build configuration**
        - `tsconfig.json` — strict mode, ES2022 target, Node16 module resolution, `noUncheckedIndexedAccess`
        - `tsup.config.ts` — ESM output, node18 target, shebang injection, dts generation
        - `vitest.config.ts` — test root at package level, `__tests__/**/*.test.ts` pattern

    - [x] **1.1.d Create CLI entry point skeleton**
        - `src/cli.ts` — Commander program with `init`, `update`, `status`, `diff` stubs
        - Build produces `dist/cli.js` with shebang, typecheck passes, `--help` works

    - [x] **1.1.e Create directory structure**
        - `src/commands/`, `src/lib/`, `src/prompts/` with `.gitkeep` placeholders
        - `__tests__/unit/`, `__tests__/integration/`, `__tests__/e2e/`, `__tests__/fixtures/`
        - `framework/` (template files, populated in Phase 3)
        - Added `.gitignore` for `dist/` and `node_modules/`

- [x] **1.2 Update internal project infrastructure**

    **Goal:** Bring `.arc-internal/` docs in line with the project's new hybrid nature — code
    quality gates alongside existing markdown linting.

    - [x] **1.2.a Update `DEV-RULES.PROJECT.md` (internal)**
        - Quality Gates: added typecheck, test, and build gates alongside existing markdown linting
        - Testing Requirements: replaced N/A with vitest strategy (unit/integration/e2e tiers)
        - Code Quality: added TypeScript standards (strict, no `any`, ESM, explicit return types)
        - CI Validation: added TypeScript/test/build checks

    - [x] **1.2.b Update `QUICK-REFERENCE.md` (internal)**
        - Added TypeScript/Build/Test command section
        - Quality Gate Commands: expanded to all three tiers (Tier 1: lint + unit tests,
          Tier 2: full lint + typecheck + test, Tier 3: all + build + git review)
        - Updated environment context from "documentation-only" to hybrid project
        - Revised anti-patterns for monorepo workspace context

    - [x] **1.2.c Update `TECHNICAL-OVERVIEW.md` (internal)**
        - Overview: updated from "pure documentation" to hybrid project with CLI description
        - Architecture: added CLI Package section (entry point, build, tests, templates)
        - Infrastructure: added TypeScript, tsup, vitest, npm workspaces
        - Testing: replaced "no unit tests" with three-tier test strategy and full quality gates

    - [x] **1.2.d Assess pre-commit hook extension needs**
        - Decision: **CI-only** for typecheck/test/build. Pre-commit hooks stay lightweight
          (bash-based, <1s). TypeScript compilation + test suite would add 5-10s+ per commit
          and require Node.js execution in the hook. CI catches these before merge.
        - No hook changes needed — existing checks (markdown lint, commit message format,
          sensitive files, task numbering, boundary enforcement) remain appropriate.

- [x] **1.3 Verify scaffolding**
    - All checks pass: build, typecheck, test (passWithNoTests), markdown lint (142 files, 0 errors),
      CLI `--help`, root convenience scripts (`npm run build/test/test:unit/typecheck`)
    - Added `passWithNoTests: true` to vitest config so empty test suite exits cleanly

### **Phase 2:** Template Engine and Core Libraries

**Purpose:** Build and test the pure-function core that all commands depend on — template rendering,
hashing, manifest I/O, and init recipe parsing.

**Strategies:** `strategy-file-classification.md` (file inventory and classification data),
`strategy-testing-methodology.md`

- [x] **2.1 Template rendering (`src/lib/render.ts`)**

    - [x] **2.1.a Token substitution — `renderTokens()`**
        - `{{TOKEN}}` regex replacement with `/g` flag; unknown tokens left as-is
        - 5 tests: single, multiple, repeated, passthrough, unknown token
        - Built test-first (RED→GREEN per behavior, all pass)

    - [x] **2.1.b Conditional content processing — `renderConditionals()`**
        - `<!-- arc:if KEY == VALUE -->` / `<!-- arc:endif -->` with depth-tracked nesting
        - Single-pass line processor; directive lines stripped from output
        - 5 tests: include, exclude, nested (3 variants), multiple independent, passthrough
        - Built test-first (RED→GREEN per behavior, all pass)

- [x] **2.2 Hash computation (`src/lib/hash.ts`) — `hashContent()`**
    - SHA-256 hex digest via Node `crypto`; single-function module
    - 3 tests: known hash, different content diverges, deterministic
    - Built test-first

- [x] **2.3 Manifest I/O (`src/lib/manifest.ts`)**

    - [x] **2.3.a Schema validation — `validateManifest()`**
        - Validates top-level fields, file entry `classification` (Framework/Configurable/Scaffolded),
          and `layer` (core/arc-in-git) with collected error reporting
        - 4 tests: valid accepts, missing fields rejects, invalid classification, invalid layer

    - [x] **2.3.b Read/write operations + types**
        - `Manifest`, `FileEntry`, `InstallConfig`, `Classification`, `Layer` types in `types.ts`
        - `readManifest()`: returns null for missing file, throws on malformed JSON, validates on read
        - `writeManifest()`: formatted JSON output with trailing newline
        - 3 tests: round-trip write/read, non-existent returns null, malformed JSON throws

- [x] **2.4 Init recipe parsing (`src/lib/recipe.ts`)**
    - `Recipe`, `RecipePrompt`, `RecipeCondition`, `PromptType` types in `types.ts`
    - `validateRecipe()`: collected error reporting for prompts (id/type/message/options,
      duplicate ids) and conditions (key format, include_files array)
    - `evaluateCondition()`: simple `config.key == value` equality against config map
    - 15 unit tests, test-first (4 behaviors × vertical slices)

- [x] **2.5 Run quality gates**
    - Type checking: 0 errors
    - Unit tests: 35/35 passing (4 test files)
    - Markdown linting: 0 errors across 145 files

### **Phase 3:** Init Command

**Purpose:** Build the interactive init flow — from prompts through file rendering to a complete,
working ARC installation.

- [ ] **3.1 Implement git utility functions (`src/lib/git.ts`)**

    Build `test-first` (one behavior at a time):
    - Git availability check returns true when git is on PATH
    - Git availability check throws/exits with clear error when git is missing
    - `isGitRepo()` detects a valid git repository (returns true)
    - `isGitRepo()` returns false when not inside a git repo
    - `gitConfigGet()` retrieves a config value by key
    - `gitConfigSet()` writes a config value
    - `gitMergeFile()` returns clean content when no conflicts
    - `gitMergeFile()` returns conflict markers and non-zero status on conflicts
    - `gitMergeFile()` handles error cases (missing input files)

- [ ] **3.2 Implement file operations (`src/lib/files.ts`)**

    Build `test-first` (one behavior at a time):
    - `ensureDir()` creates nested directories recursively
    - `ensureDir()` is idempotent (no error on existing directory)
    - `copyWithRendering()` substitutes `{{TOKEN}}` placeholders from config map
    - `copyWithRendering()` processes `<!-- arc:if -->` conditional blocks (include/exclude)
    - `copyWithRendering()` passes through files with no tokens or conditionals unchanged
    - `appendToGitignore()` adds entry when not already present
    - `appendToGitignore()` skips duplicate when entry already exists
    - `appendToGitattributes()` adds entry when not already present
    - `appendToGitattributes()` skips duplicate when entry already exists

- [ ] **3.3 Create framework template files**

    **Goal:** Populate the `framework/` directory with template versions of `.arc/` files —
    adding `{{TOKEN}}` placeholders and `<!-- arc:if -->` conditional markers where needed.

    - [ ] **3.3.a Audit `.arc/` files for token and conditional needs**
        - Identify files referencing configurable values (base branch, project name, test commands)
        - Identify files with PM-mode-conditional or team-mode-conditional content
        - Cross-reference against `strategy-file-classification.md` inventory
        - Produce a mapping: file → tokens used, conditions applied

    - [ ] **3.3.b Create template versions of files requiring tokens/conditionals**
        - Add `{{TOKEN}}` placeholders where configurable values appear
        - Add `<!-- arc:if -->` / `<!-- arc:endif -->` markers for conditional sections
        - Files without tokens or conditionals copy as-is (no template processing needed)

    - [ ] **3.3.c Create `init-recipe.json`**
        - Full prompt inventory based on token audit
        - Condition → file set mappings
        - Config key mappings (prompt → `arc-config.yml` setting)

- [ ] **3.4 Implement interactive prompts (`src/prompts/init-prompts.ts`)**
    - @clack/prompts flow driven by init recipe
    - Project identity prompts (name, description)
    - Development environment prompts (test commands, lint commands)
    - Workflow option prompts (base branch, branch protection, PM mode, team mode, merge strategy)
    - Agent selection (multiselect)
    - Install directory prompt (default `.arc/`)

- [ ] **3.5 Implement init command (`src/commands/init.ts`)**

    - [ ] **3.5.a Core init flow**

        Build `test-first` (one behavior at a time):
        - Config assembly: prompt responses are mapped to install config object
        - Condition evaluation: recipe conditions filter file list based on config
        - Token rendering: template files produce output with all placeholders resolved
        - Conditional rendering: `<!-- arc:if -->` blocks included/excluded per config
        - File output: rendered files are written to the correct install directory paths
        - Config output: `arc-config.yml` is written with all collected settings
        - No residual markers: output files contain no `{{TOKEN}}` or `<!-- arc:if -->` artifacts

    - [ ] **3.5.b Pristine and manifest creation**
        - Copy rendered Framework and Configurable files to `.pristine/`
        - Compute `pristine_hash` for each file
        - Write `.arc-manifest.json` with version, config, file inventory

    - [ ] **3.5.c Git integration setup**
        - Add `.pristine/` and `user/*/` contents to `.gitignore` (ADR-012: user dir gitignored)
        - Add `WORK-STATUS.md merge=ours` to `.gitattributes`
        - Run `git config merge.ours.driver true`
        - Install markdownlint config (`.markdownlint-cli2.jsonc`)

- [ ] **3.6 Implement post-init messaging**
    - Print concise summary after init: what was installed, configuration choices made
    - Point to verification workflow (`01_initialize-arc.md`)
    - Highlight core workflow quartet: create-prd, generate-tasks, process-task-loop, session-init
    - Orient without overwhelming — adopter's first interaction with ARC's workflow model

- [ ] **3.7 Write integration tests for init flow**
    - Test: init in empty git repo → verify directory structure, file contents, manifest, pristine
    - Test: rendered files contain no template tokens or conditional markers
    - Test: `.gitignore` and `.gitattributes` contain expected entries
    - Test: manifest file inventory matches files on disk
    - Test: pristine hashes match rendered file content

- [ ] **3.8 Run quality gates**
    - Type checking passes
    - All tests pass (unit + integration)
    - Markdown linting passes

### **Phase 4:** Update Command

**Purpose:** Build the three-way merge update system — the core value proposition of the CLI.

- [ ] **4.1 Three-way merge wrapper (`src/lib/merge.ts`)**
    - Shell out to `git merge-file` via `child_process.execFile`
    - Parse exit code (0 = clean, 1 = conflicts, >1 = error)
    - Return merge result with conflict flag and content

    Build `test-first` (one behavior at a time):
    - Non-overlapping changes auto-merge cleanly
    - Overlapping changes produce conflict markers
    - Unchanged file (pristine == current) takes new version cleanly
    - File unchanged by framework (pristine == new) keeps adopter's version

- [ ] **4.2 Update command (`src/commands/update.ts`)**

    - [ ] **4.2.a Core update flow**
        - Read manifest and `install_config`
        - Read new framework files from CLI's own `framework/` directory
        - Re-render templates with adopter's `install_config` (same tokens, fresh content)
        - For each managed file: three-way merge (pristine × new rendered × adopter's current)
        - Classify results: auto-merged, conflicted, skipped, new

    - [ ] **4.2.b Conflict reporting and pristine update**
        - Leave git conflict markers in conflicted files
        - Report which files need attention
        - Update pristine copies for cleanly merged files
        - Update manifest with new `framework_version`

    - [ ] **4.2.c New file handling**
        - Framework files: auto-add without prompting
        - Conditional files (depend on config choices): prompt adopter

- [ ] **4.3 Integration tests for update flow**
    - Test: update with no adopter changes → all files take new version
    - Test: update with non-overlapping changes → auto-merge preserves both
    - Test: update with conflicting changes → conflict markers in file, reported
    - Test: Scaffolded files skipped entirely
    - Test: new framework file added during update
    - Test: manifest and pristine updated correctly post-merge

- [ ] **4.4 Run quality gates**
    - Type checking passes
    - All tests pass
    - Markdown linting passes

### **Phase 5:** Status, Diff, and CLI Polish

**Purpose:** Build the inspection commands and finalize cross-cutting CLI concerns.

- [ ] **5.1 Implement status command (`src/commands/status.ts`)**
    - Read manifest, compute current file hashes, compare against `pristine_hash`
    - Report per-file state: modified, unmodified, missing
    - Check for newer framework version availability
    - Clear output formatting

- [ ] **5.2 Implement diff command (`src/commands/diff.ts`)**
    - For each managed file: unified diff of current content vs. pristine copy
    - Filter to Framework and Configurable files only
    - Skip unmodified files

- [ ] **5.3 Implement error handling patterns**

    **Goal:** Consistent error handling across all commands per PRD error philosophy.

    - Git missing → hard fail with clear message
    - Manifest missing/malformed → hard fail for update/status/diff, init creates new
    - Individual file errors during update → report and continue
    - All errors include what happened, why, and what to do

- [ ] **5.4 Write integration tests for status and diff**
    - Test: status on fresh init → all files unmodified
    - Test: status after modifying a file → reports modified
    - Test: diff on unmodified install → no output
    - Test: diff after modifying a file → shows unified diff
    - Test: status/diff with missing manifest → clear error

- [ ] **5.5 Run quality gates**
    - Type checking passes
    - All tests pass
    - Markdown linting passes

### **Phase 6:** Skill Generation

**Purpose:** Build the system that generates per-agent-tool SKILL.md files from canonical
definitions.

**Strategies:** `strategy-file-classification.md` (skill file inventory)

- [ ] **6.1 Skill generation (`src/lib/skills.ts`)**
    - Read canonical skills from `framework/system/skills/`
    - Generate per-tool output with correct paths, frontmatter, supplemental files
    - Handle all 6 agent tools (Claude, Codex, Gemini, Copilot, Cursor, Windsurf)

    Build `test-first` (one behavior at a time):
    - Canonical skill → Claude Code output (correct path, `disable-model-invocation` frontmatter)
    - Canonical skill → Codex output (`.agents/skills/` path, `openai.yaml` supplemental)
    - Canonical skill → Windsurf output (`.windsurf/skills/` path, no `.agents/`)
    - Multiple agents selected → correct output set for each
    - `{{ARC_DIR}}` in skill instructions rendered with configured path

- [ ] **6.2 Integrate with init and update**
    - Init: generate skill files based on agent selection
    - Update: regenerate when canonical skill definitions change (compare hashes)
    - Track generated skill files in manifest

- [ ] **6.3 Integration tests for skill generation**
    - Test: init with Claude selected → `.claude/skills/` populated correctly
    - Test: init with multiple agents → all agent directories populated
    - Test: update with changed skill → regenerated files reflect changes

- [ ] **6.4 Run quality gates**
    - Type checking passes
    - All tests pass
    - Markdown linting passes

### **Phase 7:** User Directory, PM Mode, Portability, and Install Directory

**Purpose:** Implement the unified user directory model (ADR-012), PM mode conditional handling,
user directory portability via git notes, `arc log --atomic`, configurable install directory,
framework template/doc updates, and `.arc-internal/` self-hosting migration.

**Strategies:** `strategy-file-classification.md` (file inventory), `strategy-team-coordination.md`,
`strategy-backlog-organization.md`, `strategy-configurability-architecture.md`

- [ ] **7.1 Implement unified user directory and identity resolution**

    **Goal:** Every `arc init` creates a `user/{identity}/` directory with personal workspace files.
    Same structure for solo and team (ADR-012 Part 1).

    - [ ] **7.1.a Identity resolution utility (`src/lib/identity.ts`)**
        - Lookup sequence: `git config arc.identity` → slugified `git config user.name` → prompt
        - Slug function: lowercase, spaces/dots → hyphens, filesystem-safe
        - Store result: `git config --local arc.identity {value}`
        - Used by init, `arc user` subcommand, and notes ref resolution

    - [ ] **7.1.b Init: user directory creation**
        - Create `user/{identity}/` directory
        - Install `SESSION-NOTES.md` template (Core — all modes)
        - Install `ATOMIC-INBOX.md` template (arc-in-git only — gated by PM mode, task 7.2)
        - `user/README.md` tracked (explains personal workspace concept)
        - `user/{identity}/` contents gitignored (added in 3.5.c pattern)

    - [ ] **7.1.c Init: team mode behavioral config**
        - `team.mode` config key in `arc-config.yml` (boolean: true/false)
        - Solo: `user.sync_push: always` default
        - Team: `user.sync_push: prompt` default
        - Team mode prompt: "Will other developers work in this repository?"
        - Team coordination guidance in init output (how team members set up their own
          `user/{name}/` directories)

- [ ] **7.2 Implement PM mode conditional file handling**

    - [ ] **7.2.a Init: mode-aware file installation**
        - `pm.mode: none` / `external` → install Core files only
        - `pm.mode: arc-in-git` → install Core + arc-in-git files: backlog templates, ROADMAP,
          PROJECT-STATUS, `user/{identity}/ATOMIC-INBOX.md`,
          strategy-backlog-organization
        - No `completed-atomic` files installed (ADR-012: commit record is the archive)
        - Manifest tracks per-file `layer` membership

    - [ ] **7.2.b Update: mode-aware file management**
        - Skip files from uninstalled modes (check manifest `layer` vs. `install_config.pm_mode`)
        - Handle mode-conditional content within shared files (conditional sections)

- [ ] **7.3 Implement user directory portability**

    **Goal:** The entire `user/{identity}/` directory travels across machines via git notes
    (ADR-012 Part 3). Replaces the session-notes-only portability design from ADR-007.

    - [ ] **7.3.a Portability setup in init**
        - Write `user.sync_push` setting to `arc-config.yml` (7.1.c provides the value)
        - Configure notes fetch refspec on init:
          `git config --add remote.origin.fetch "+refs/notes/arc/user/*:refs/notes/arc/user/*"`
        - Uses identity from 7.1.a for the per-developer namespace key

    - [ ] **7.3.b Implement user directory serialization (`src/lib/user-sync.ts`)**
        - Serialize: read all files in `user/{identity}/` (excluding README.md), produce
          structured format (JSON manifest with file contents) suitable for git note storage
        - Deserialize: restore files from serialized format to `user/{identity}/`
        - Handle missing/empty directory gracefully

    - [ ] **7.3.c Implement `arc user` subcommand (`src/commands/user.ts`)**
        - `arc user add <identity>` — create `user/{identity}/` directory, populate from
          CLI-internal templates (SESSION-NOTES.md, ATOMIC-INBOX.md if arc-in-git), update
          `.gitignore`. Used for adding team members post-init.
        - `arc user save` — serialize user dir to git note on HEAD
          (`git notes --ref=arc/user/{identity} add -f --stdin HEAD`)
        - `arc user load` — restore user dir from git note on HEAD; if no note on HEAD, walk
          recent ancestors (ADR-007 § Part 4 ancestor-walking logic)
        - `arc user push` — push notes ref to remote
          (`git push origin refs/notes/arc/user/{identity}`)
        - `arc user pull` — fetch notes ref from remote
          (`git fetch origin refs/notes/arc/user/{identity}:refs/notes/arc/user/{identity}`)
        - Identity resolved via identity resolution utility (7.1.a)
        - Clear messaging: what was saved/loaded, which commit, which identity namespace

    - [ ] **7.3.d Implement `arc sync` sugar**
        - Context-aware: `arc sync` after work → save + push; `arc sync` at start → pull + load
        - Detection: if local user dir has content and remote note is stale → save + push;
          if local user dir is empty/missing → pull + load
        - Or simpler: `arc sync --save` / `arc sync --load` with bare `arc sync` as
          save+push (the more common post-work use case). Decide during implementation.

    - [ ] **7.3.e Write tests for user portability**

        Build `test-first` (one behavior at a time):
        - Save serializes all user dir files to git note, load restores them
        - Load walks ancestors when HEAD has no note
        - Identity resolution fallback chain works end-to-end
        - Push/pull interact with remote refs correctly (integration-level)
        - Sync sugar triggers correct save/push or pull/load sequence
        - Clear error when user dir is empty (save) or no note found (load)
        - Round-trip: save → modify local → load → verify restored to saved state

- [ ] **7.4 Implement `arc log --atomic` subcommand**
    - Search commit history: `git log --grep="(atomic / no associated task list)"` with
      formatted output (date, type, scope, description)
    - Optional filters: `--since`, `--author`, `--limit`
    - Clear output when no matching commits found

    Build `test-first` (one behavior at a time):
    - Commits with atomic context footer appear in output
    - Non-atomic commits excluded
    - Filter flags work correctly

- [ ] **7.5 Implement configurable install directory**
    - `{{ARC_DIR}}` token processing throughout template rendering
    - Init prompt with `.arc/` default
    - All cross-references in rendered files use configured path
    - Skill instructions render with correct base path
    - Manifest and pristine paths use configured directory

- [x] **7.6 Update framework templates for unified model (ADR-012)**

    **Goal:** `.arc/` template files reflect the unified user directory model. These are the
    files the CLI installs for adopters.

    - [x] **7.6.a Rename `team/` → `user/` directory**
        - `git mv .arc/team/ .arc/user/` — preserves git history
        - Rewrote `user/README.md`: unified personal workspace model (solo and team use same
          structure), identity-based paths, portability section, `arc user add` for team scaling
        - Updated `active/WORK-STATUS.template.md`: companion reference → `user/{identity}/`,
          removed team-mode note
        - Updated `.arc/README.md`: directory tree reflects `user/` rename, removed
          `ATOMIC-TASKS.md` from `active/` listing

    - [x] **7.6.b Create ATOMIC-INBOX and relocate user templates to CLI package**
        - **Design decision:** User templates (SESSION-NOTES, ATOMIC-INBOX) are CLI-internal
          resources, not deployed to `.arc/user/`. The `user/` directory contains only README.md
          and identity subdirectories — no template files cluttering user space. `arc user add`
          CLI subcommand creates new identity dirs from internal templates.
        - Created `packages/arc-framework/framework/user/SESSION-NOTES.md` — CLI-internal
          template with unified portability note, `user.sync_push` config key
        - Created `packages/arc-framework/framework/user/ATOMIC-INBOX.md` — inbox-model
          replacement: personal capture bucket, no completion archive, `arc log --atomic`
          for browsing history, triage-at-integration protocol
        - Removed `.arc/user/SESSION-NOTES.template.md` and `.arc/user/ATOMIC-TASKS.template.md`
          (moved to CLI package)
        - Removed `.arc/active/SESSION-NOTES.template.md` (consolidated into CLI package)
        - Removed `.arc/active/ATOMIC-TASKS.template.md` (replaced by ATOMIC-INBOX in CLI)

    - [x] **7.6.c Update remaining templates**
        - Removed `completed-atomic` reference from `reference/archive/README.md` directory tree
        - Remaining `team/` cross-references are in methodology docs — covered by Task 7.7

- [x] **7.7 Update framework methodology docs (ADR-012 follow-up)**

    **Goal:** ARC methodology documentation reflects the unified user directory model, inbox
    lifecycle, and broadened portability scope. Adopters discover these capabilities through the
    workflows and strategies they already consult.

    - [x] **7.7.a Update strategies**
        - All six strategies updated for ADR-012 unified model:
          `strategy-team-coordination.md` (single path model, backlog routing),
          `strategy-backlog-organization.md` (ATOMIC-INBOX in user/, removed completed-atomic),
          `strategy-session-management.md` (added portability section with git notes),
          `strategy-configurability-architecture.md` (user.sync_push, arc.identity),
          `strategy-work-organization.md` (clean active/ listing),
          `strategy-file-classification.md` (user/ section, updated counts 86→82)

    - [x] **7.7.b Update workflows**
        - `session-init.md`: single `user/{identity}/` path, git notes load fallback, inbox
          count in arc-in-git discovery
        - `session-handoff.md`: single `user/{identity}/` path, git notes save step with
          `user.sync_push` policy
        - `integrate-work-unit.md`: added Step 5 pre-merge inbox review (arc-in-git),
          renumbered 6→7, 7→8, 8→9
        - `process-task-loop.md`: ATOMIC-TASKS → ATOMIC-INBOX in `user/{identity}/`
        - `arc-methods.md` § session-state: broadened to user dir + git notes portability

    - [x] **7.7.c Update constitutional docs and QUICK-REFERENCE**
        - `DEV-RULES.ARC.md` § session state control: updated paths to `user/{identity}/`,
          added portability reference to Session Management Strategy
        - QUICK-REFERENCE template: added ARC CLI Commands section with `arc user save/load/
          push/pull`, `arc sync`, `arc log --atomic`, and `user.sync_push` config note

    - [x] **7.7.d Update ADR status annotations**
        - ADR-007: `Accepted (Parts 1–3 superseded by ADR-012)`
        - ADR-008: appended `; ATOMIC-TASKS.md path references superseded by ADR-012`
        - ADR-009: `Accepted (Part 2 file placement superseded by ADR-012)`

- [ ] **7.8 Migrate `.arc-internal/` to unified model (self-hosting)**

    **Goal:** The framework's own workspace reflects the unified user directory model it
    prescribes to adopters.

    - [ ] **7.8.a Create `.arc-internal/user/{identity}/` structure**
        - Create directory, move SESSION-NOTES.md from `active/` to `user/{identity}/`
        - Move and rename ATOMIC-TASKS.md → `user/{identity}/ATOMIC-INBOX.md`
        - Update ATOMIC-INBOX.md content (remove completed-atomic protocol, update purpose text,
          reference `arc log --atomic`)

    - [ ] **7.8.b Update `.arc-internal/` gitignore and references**
        - Update `.gitignore`: replace `active/SESSION-NOTES.md` pattern with
          `user/*/` contents pattern (matching what CLI generates for adopters)
        - Update internal `session-init.md` path references (`.arc-internal/` copy)
        - Update internal `session-handoff.md` path references
        - Update WORK-STATUS.md if it references old file locations

    - [ ] **7.8.c Handle completed-atomic archive**
        - Existing `completed-atomic-2026-q1.md` in `reference/archive/`: leave as historical
          record (already committed, provides continuity)
        - No new `completed-atomic` files created going forward
        - Update any internal docs referencing the completion archive protocol

- [ ] **7.9 Write integration tests for unified model and mode variations**
    - Test: init creates `user/{identity}/` with SESSION-NOTES.md
    - Test: init with `pm.mode: arc-in-git` → ATOMIC-INBOX.md in user dir
    - Test: init with `pm.mode: none` → no ATOMIC-INBOX, no backlog files
    - Test: init with team mode → same `user/` structure, `team.mode: true` in config,
      `user.sync_push: prompt`
    - Test: init with solo mode → `user.sync_push: always`
    - Test: init with custom install dir → all `user/` paths under custom dir
    - Test: update respects PM mode (skips arc-in-git files when mode is none)
    - Test: no `completed-atomic` files in any mode
    - Test: `arc log --atomic` returns matching commits
    - Test: `arc user save` → `arc user load` round-trip preserves user dir contents

- [ ] **7.10 Run quality gates**
    - Type checking passes
    - All tests pass
    - Markdown linting passes (including all updated methodology docs and templates)

### **Phase 8:** E2E Tests and Verification

**Purpose:** Validate the complete CLI through end-to-end tests in real git repos, then verify
all success criteria.

- [ ] **8.1 Write E2E test suite**

    - [ ] **8.1.a Init E2E tests**
        - `npx @arc-framework/cli init` in a fresh git repo → verify complete installed state
        - Installed files pass the framework's own markdown linting
        - Manifest is valid, pristine matches files on disk

    - [ ] **8.1.b Update E2E tests**
        - Init → modify files → update → verify customizations preserved
        - Init → update with conflicting changes → verify conflict markers and reporting

    - [ ] **8.1.c Round-trip E2E tests**
        - Init → customize → update → verify customizations survive
        - Init → status → shows all unmodified
        - Init → modify → status → shows modified files
        - Init → modify → diff → shows correct unified diff

- [ ] **8.2 Run full quality gate suite (Tier 3)**
    - TypeScript strict mode passes (`npm run typecheck`)
    - Full test suite passes (`npm test` — unit + integration + e2e)
    - Build succeeds (`npm run build`)
    - Markdown linting passes (`npm run -s lint:md`)

- [ ] **8.3 Validate success criteria against PRD**

    **Workflow:** [`verify-work-unit.md`][verify-work-unit] — load and follow for this task.

    - Verify each PRD success criterion is met
    - Resolve any gaps or document deviations
    - Verify all atomic tasks resolved

---

## Atomic Tasks — CLI Implementation

<!-- Off-plan work within this WU's domain, discovered during execution. Flat checkbox list — -->
<!-- no phase structure, no numbering hierarchy. Check off as completed; archives with this -->
<!-- task list. For work too large or outside this WU's domain, see manage-incidental-work.md. -->

---

## Success Criteria

- [ ] `npx @arc-framework/cli init` produces a complete, working ARC installation that passes the
  framework's own markdown linting
- [ ] `npx @arc-framework/cli@latest update` correctly preserves adopter customizations through
  three-way merge — auto-resolving non-overlapping changes, flagging real conflicts
- [ ] Installed file set matches the authoritative inventory in `strategy-file-classification.md`
  for the selected PM mode and options
- [ ] Beta is functional enough to install ARC in a real project and exercise the full
  init → work sessions → update cycle
- [ ] `arc user save/load/push/pull` and `arc sync` complete the ADR-012/ADR-007 portability
  contract — the user directory (session notes, inbox, personal files) travels across machines
  and between developers via git notes
- [ ] `arc log --atomic` provides browsable completion history for atomic/inbox work from commit
  records
- [ ] All quality gates pass: TypeScript strict mode, vitest test suite, markdown linting on
  generated output
- [ ] Internal project docs (DEV-RULES.PROJECT, QUICK-REFERENCE, TECHNICAL-OVERVIEW) reflect
  the hybrid code + documentation project reality

---

[verify-work-unit]: ../../../.arc/system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
