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
        - `src/templates/` (CLI-internal resources; `.arc/` templates bundled at build time)
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

- [x] **3.1 Implement git utility functions (`src/lib/git.ts`)**

    All 9 behaviors implemented test-first (10 unit tests). Injectable `GitExec` dependency for
    testability. Functions: `checkGitAvailable`, `isGitRepo`, `gitConfigGet`, `gitConfigSet`,
    `gitMergeFile`. Merge-file handles clean merges, conflict detection (via error `stdout`),
    and missing-file errors.

- [x] **3.2 Implement file operations (`src/lib/files.ts`)**

    All 9 behaviors implemented test-first (10 unit tests). Injectable fs dependencies for
    testability. Functions: `ensureDir`, `copyWithRendering` (composes existing `renderTokens`
    - `renderConditionals`), `appendToGitignore`, `appendToGitattributes` (shared
    `appendLineIfMissing` helper).

- [x] **3.3 Prepare framework template source and init recipe**

    **Goal:** `.arc/` is the single source of truth for framework templates — no maintained
    copy in the CLI package. Add inline conditional markers to `.arc/` source files, set up
    build-time bundling, and create the init recipe. CLI-internal resources (user templates)
    live in `src/templates/`.

    - [x] **3.3.a Audit `.arc/` files for token and conditional needs**

        Full mapping produced in `notes-cli-implementation.md` § Template File Audit. Key findings:
        3 prompt-driven tokens (PROJECT_NAME, PROJECT_DESCRIPTION, REPO_ROOT), 5 file-level
        conditions (pm.mode, agent selection), 2 files needing inline `<!-- arc:if -->` markers
        (session-init.md, process-task-loop.md). arc-config.yml handled programmatically via
        config_key mappings, not token substitution. Team mode needs no conditionals — references
        are informational parentheticals.

    - [x] **3.3.b Add conditional markers and relocate CLI-internal templates**
        - Added `<!-- arc:if pm.mode == arc-in-git -->` / `<!-- arc:endif -->` markers to
          session-init.md (discovery sections) and process-task-loop.md (ATOMIC-INBOX routing)
        - Markers indented to match list nesting to avoid MD046 lint violations
        - Moved `framework/user/` → `src/templates/user/` (CLI-internal resources);
          removed `framework/` directory entirely (`.arc/` is canonical source, bundled at
          build time)
        - Updated PRD, notes, and task list references to reflect new structure

    - [x] **3.3.c Set up build-time template bundling**
        - Build script: `tsup && node -e` cpSync copies `.arc/` → `arc/` post-build
        - `arc/` added to `.gitignore`; `package.json` `files` updated (`arc`, `templates`)
        - `src/lib/paths.ts`: `getArcTemplatePath()` / `getInternalTemplatePath()` resolve
          package root via `import.meta.url` + walk-up to `package.json` (works in both
          source and bundled contexts)
        - Unit tests in `paths.test.ts` (5 tests, all passing)

    - [x] **3.3.d Create `init-recipe.json`**
        - 9 prompts: project_name, project_description (tokens), base_branch, branch_protection,
          pm_mode, team_mode, merge_strategy, platform (config keys), agents (multiselect)
        - REPO_ROOT auto-detected by init command, not a recipe prompt
        - Guide-text placeholders (PROJECT_TYPE, COMPONENT, etc.) left untouched by render engine;
          safety net via `getInitTokenNames()` / `findResidualInitTokens()` allowlist functions
        - Extended `evaluateCondition` to support `includes` operator for multiselect conditions
          (e.g., `agents includes claude` checks comma-separated config value)
        - 6 condition blocks: pm.mode → backlog/PM files; 5 agent → agent template files
        - Added `**/arc/**` to markdownlint ignores (bundled build artifact was picked up by glob)
        - 30 recipe tests (includes `includes` operator, allowlist utilities, real recipe validation)

- [x] **3.3.R Recipe, template, and render engine fixes**

    **Goal:** Address findings from init flow sanity audit and mechanical consistency audit
    before implementing prompts and init command.

    - [x] **3.3.R.a Recipe structure updates**
        - Added `include_files` top-level array with 35 unconditional files (all framework
          docs, workflows, strategies, skills, githooks, and the 5 previously orphaned templates)
        - Added `computed_tokens` section with `REPO_ROOT`
        - Added `arc_dir` text prompt with `ARC_DIR` token (default `.arc`)
        - Added `cursor` and `windsurf` conditions (template files created in 3.3.R.d)
        - Updated `Recipe` type with optional `include_files` and `computed_tokens` fields
        - Updated `validateRecipe()` to validate new optional fields
        - Updated `getInitTokenNames()` to merge computed token names into allowlist
        - 80 tests passing (5 new: optional fields validation, computed tokens in allowlist)

    - [x] **3.3.R.b Template content fixes**
        - Fixed `WORK-STATUS.template.md`: correct initial-state defaults (branch `main`,
          task list `[none associated]`, next action → `1_create-prd.md`)
        - Fixed `02_define-project.md`: link definitions now reference stripped names
          (`META-PRD.md`, not `META-PRD.template.md`) — adopter workspace paths
        - Added `team.mode: false` to `.arc/system/arc-config.yml` template with inline
          documentation (behavioral not structural, affects sync defaults and coordination)
        - Added `{{ARC_DIR}}` token to 5 templates: AGENTS, QUICK-REFERENCE, WORK-STATUS,
          PROJECT-STATUS, BACKLOG-FEATURE, BACKLOG-TECHNICAL

    - [x] **3.3.R.c Guide-text placeholder syntax migration**
        - Migrated all guide-text placeholders from `{{PLACEHOLDER}}` to `[PLACEHOLDER]`
          across 9 template files using marker-based bulk replacement (protect init tokens,
          replace remaining `{{}}` → `[]`, restore init tokens)
        - Init tokens (`PROJECT_NAME`, `PROJECT_DESCRIPTION`, `REPO_ROOT`, `ARC_DIR`)
          remain as `{{TOKEN}}` — now the only `{{}}` patterns in templates
        - Fixed MD053 violations (italic wrapping `_[label]_:` breaks link-def parsing)
        - Updated `system/agent/README.md` to document the two-syntax convention
        - Updated `01_initialize-arc.md` expected state to match WORK-STATUS template
        - Updated `02_define-project.md` link display text to stripped filenames
        - `findResidualInitTokens()` unchanged — `{{}}` regex now exclusively matches
          init tokens by design

    - [x] **3.3.R.d Agent template audit and redesign**
        - Evaluated all agent templates against ADR-002 design intent (hub-spoke pattern,
          agent-specific files hold only what's unique to that agent)
        - Identified systemic issues: templates shipped generic methodology content that
          duplicates DEV-RULES.ARC (one-task-at-a-time, commit control, verify-before-assuming,
          strategy consultation), context window management protocols that don't work in
          practice, deferred review duplication of process-task-loop, staging verification
          that belongs in prepare-commits workflow
        - Redesigned all templates to consistent minimal structure: ARC header note (loading
          chain context, no conflict with tool-native config), reference links, agent-specific
          notes (placeholder with commented examples), MCP and sub-agent placeholder sections
        - All agent-specific content moved to comments as examples — no shipped behavioral
          content that would create merge conflicts during framework updates (Configurable
          files with three-way merge)
        - Created `CURSOR.ARC.template.md` and `WINDSURF.ARC.template.md` (new)
        - Slimmed `ARC-AGENTS.template.md` — removed AI Collaboration Principles section (4 of 8
          items duplicated DEV-RULES.ARC, 2 were generic agent behavior, 2 had marginal value);
          replaced with Project-Specific Principles placeholder with commented examples
        - Updated `README.md` — rewrote to match slimmed templates, added "What Belongs in
          Agent-Specific Files" guidance, removed per-file content descriptions (all templates
          now structurally identical)
        - Added staging verification step to `prepare-commits.md` Quick Commit Reference
          (relocated from agent templates to canonical workflow location)
        - Added `system/agent/README.md` to init recipe `include_files`
        - Updated all `.arc-internal/` agent files to match new structure (ARC-AGENTS.md,
          CLAUDE.ARC.md, CODEX.ARC.md, GEMINI.ARC.md, WARP.ARC.md, COPILOT.ARC.md)

    - [x] **3.3.R.e Render engine `!=` operator support**
        - Extended `renderConditionals` regex to match `!=` alongside `==`
        - Ternary evaluation: `==` checks equality, `!=` checks inequality
        - 4 new tests: basic include/exclude, nested with `==`, mixed `==`/`!=`
        - 84 tests passing (all existing `==` tests unchanged)

    - [x] **3.3.R.f File naming consistency**

        - [x] **3.3.R.f.i Clarify `.template` suffix boundaries in file classification strategy**
            - Original task assumed `.template` suffix was required for all Configurable files.
              Audit found the suffix actually correlates with render-engine processing (tokens,
              conditionals), not classification. Configurable files without rendering
              (`DEV-RULES.PROJECT.md`, `STRATEGY-INDEX.md`, `arc-methods.md`, etc.) are
              correctly named without the suffix — they're copied as-is and edited in place
            - Updated `strategy-file-classification.md` § Template suffix: clarified the suffix
              marks render-engine input, not classification; added rationale for why in-place
              Configurable files don't use it
            - Updated `notes-cli-implementation.md`: split Configurable file table into
              "rendered" and "copied as-is" sections with distinct headers
            - No file renames needed — current naming was correct

        - [x] **3.3.R.f.ii Evaluate agent file naming convention**
            - Decision: **rename all agent files** (hub and spokes) to ARC-specific names.
              Current tool-native names (`CLAUDE.md`, `AGENTS.md`) implied auto-discovery
              functionality that doesn't exist — ARC loads these via session-init, not tool-native
              mechanisms. The disclaimer header in every template file is evidence the names
              mislead. Renaming eliminates the confusion and makes the file tree self-documenting
            - Naming convention uses dot-namespace (matching `DEV-RULES.ARC.md` pattern) with
              hub/spoke asymmetry: hub is `ARC-` prefixed (sorts first, signals entrypoint),
              spokes use `.ARC` suffix (agent name leads for scanning)
            - `copilot-instructions.md` normalizes to `COPILOT.ARC.md` (ALL-CAPS consistent
              with other spokes within ARC's directory)
            - Implementation deferred to 3.3.R.f.iii (separate subtask — ~50 files, ~150 changes)

        - [x] **3.3.R.f.iii Rename agent files to ARC-specific convention**
            - Renamed 20 files across 3 locations (`.arc/`, `.arc-internal/`, `packages/`)
              using `git mv` for history tracking
            - Hub: `AGENTS` → `ARC-AGENTS` (prefix sorts first, signals entrypoint)
            - Spokes: `{AGENT}` → `{AGENT}.ARC` (dot-namespace, agent name leads for scanning)
            - `copilot-instructions` normalized to `COPILOT.ARC` (ALL-CAPS consistent)
            - Removed blockquote disclaimer from all spoke templates — ARC-specific naming
              makes the relationship self-evident without defensive explanation
            - Updated ~40 files: init-recipe, recipe tests, session-init workflows, agent
              READMEs (tree diagrams), file classification strategy + inventory, other
              strategies, notes, internal reference docs, `.claude/agents/`
            - Archive files and ADRs left unchanged (historical reference)
            - All quality gates pass: 0 lint errors, typecheck clean, 84 tests passing

- [x] **3.4 Init UX redesign — prompts, templates, and setup bridge**

    **Goal:** Reduce init prompts from 10 to 3 (project name, tools, PM mode), split agent
    hub file for clean ARC/project separation, revise post-init workflow for agent-guided
    configuration, and establish a smooth bridge from CLI init to agent-led setup.

    **Design context:** Init should collect only decisions with structural impact (which files
    exist). Config-only values (base branch, protection mode, merge strategy, platform, team
    mode) ship as documented defaults in `arc-config.yml` — editable anytime with no post-init
    structural impact. Project description moves to `02_define-project` workflow where it
    naturally belongs (META-PRD creation). The multiselect is reframed as tool selection (not
    model selection) — each option represents a development tool ecosystem, determining which
    agent config files and skill directories are created. Install directory is fixed to `.arc/`
    at repo root — no prompt needed (decision 2026-03-15: industry standard, simplifies
    join-mode detection, no naming collisions found).

    - [x] **3.4.a Recipe and template redesign**

        Recipe reduced from 10 prompts to 4. Renamed `agents` → `tools` throughout.

        - Removed 6 prompts (`project_description`, `base_branch`, `branch_protection`,
          `team_mode`, `merge_strategy`, `platform`) — these ship as `arc-config.yml` defaults
        - Renamed `agents` → `tools`: recipe key, `InstallConfig` field (removed `base_branch`
          and `team_mode` fields), condition keys, JSDoc, all test fixtures
        - Kept 4 prompts: `project_name` (text, token), `tools` (multiselect), `pm_mode`
          (select, config_key), `arc_dir` (text, token)
        - PM mode prompt message updated to "Project management approach?" (value-oriented
          labels deferred to 3.4.e @clack/prompts implementation — recipe stores config values)
        - Replaced `{{PROJECT_DESCRIPTION}}` token with placeholder text in
          `META-PRD.template.md` and `ARC-AGENTS.template.md`
        - Updated `WORK-STATUS.template.md` initial Next Action to point to
          `initial-setup/01_verify-and-configure.md`
        - All quality gates pass: typecheck clean, 84 tests passing, 0 lint errors

    - [x] **3.4.b Agent file split: ARC-AGENTS → AGENT-BRIEFING.ARC + AGENT-BRIEFING.PROJECT**

        Split agent hub into two files with distinct classifications, paralleling
        `DEV-RULES.ARC` / `DEV-RULES.PROJECT`.

        - Created `AGENT-BRIEFING.ARC.md` (Framework): ARC methodology brief — how ARC works,
          key documents table, directory structure. 47 lines, concise for every-session loading.
          `{{ARC_DIR}}` stays in AGENT-BRIEFING.PROJECT (project repo layout context, not ARC-structural)
        - Renamed `ARC-AGENTS.template.md` → `AGENT-BRIEFING.PROJECT.template.md` (Configurable):
          header updated, footer updated with sibling references
        - Created `.arc-internal/` versions (AGENT-BRIEFING.ARC.md + AGENT-BRIEFING.PROJECT.md)
        - Updated init recipe: added AGENT-BRIEFING.ARC.md to `include_files`, renamed template ref
        - Updated file classification strategy: replaced ARC-AGENTS entry with two entries
          (AGENT-BRIEFING.ARC Framework + AGENT-BRIEFING.PROJECT Configurable)
        - Updated session-init loading order in both `.arc/` and `.arc-internal/`: items 1-2
          now AGENT-BRIEFING.ARC + AGENT-BRIEFING.PROJECT, renumbered 3→4 through 9→10
        - Updated 12 agent spoke files (7 template + 5 internal): link now references both hubs
        - Updated agent/ README.md: rewrote architecture from hub-spoke to dual-hub pattern
        - Updated cross-references in: strategy-file-classification (4 refs),
          strategy-context-loading (2), strategy-core-philosophy (1), maintain-project-docs (3),
          .arc/README (1), README-ASPIRATIONAL (1), internal META-PRD (1), PROJECT-STATUS (1),
          analysis-workflow-clarity-audit (2), research-context-loading (4),
          notes-cli-implementation (4), recipe.test.ts (1), .codex skill (1), .gemini command (1),
          .claude agent (1)
        - All quality gates pass: typecheck clean, 84 tests passing, 0 lint errors

    - [x] **3.4.c Workflow and session-init updates**

        Renamed and rewrote post-init workflow. The original `01_initialize-arc.md` served
        dual duty as post-init check and at-will health check — those responsibilities now
        split: this workflow handles post-init setup, Task 3.5 (arc-verify) handles at-will
        health checking.

        **Design decisions (from analysis session 2026-03-15):**

        - **Two-path workflow**: Fresh install (first ARC in repo) vs. join existing
          (ARC already committed by another team member). Detection: CLI checks for
          `.arc/system/arc-config.yml` at repo root (see 3.7.a for mechanism).
        - **Fixed `.arc/` directory**: Name locked to `.arc/`, location locked to repo
          root. No renaming, no relocation. Eliminates `arc_dir` prompt and `ARC_DIR`
          token (see 3.4.e for removal). Rationale: industry standard (no tool supports
          dir renaming), simplifies detection, no naming collision found.
        - **Neutral config walkthrough**: Dual-audience framing — "review each section
          and consider alternatives." Works for developer solo or agent presenting
          conversationally. No hierarchy assumptions.
        - **Config ownership model**: All `arc-config.yml` keys are team-wide policy.
          Per-developer overrides use `git config arc.*` (existing pattern from
          `user.sync_push`). No gap in current keys.

        **Completed:**

        - Renamed `01_initialize-arc.md` → `01_verify-and-configure.md` (`.arc/` via
          `git mv`, `packages/arc-framework/arc/` via `mv` — untracked)
        - Rewrote content with two paths: fresh install (verify structure + session
          state + agent config, then config walkthrough) and join existing (verify
          local setup, then informational config review)
        - Removed at-will health check use cases (now 3.5/arc-verify territory)
        - Added forward reference to `/arc-verify` as optional post-setup verification
        - Updated cross-references in 7 active files: 02_define-project (both copies),
          workflows README, file classification strategy, README-ASPIRATIONAL, PRD,
          ADR-008
        - Session-init loading order already done in 3.4.b — no changes needed

        **Additional work in this session (methodology improvements):**

        - Renamed `leave-it-cleaner` method → `issue-triage` in arc-methods.md (separates
          behavioral principle from overridable triage thresholds)
        - Rewrote leave-it-cleaner rule in DEV-RULES.ARC: broadened to general principle
          with two operational paths (fix now via issue-triage method, or route to capture
          surface via pm.mode-aware routing table)
        - Added capture routing table and anti-pattern (completion notes aren't capture)
        - Updated cross-references for method rename across 10 files
        - Fixed markdownlint config: `!**/arc/**` → `!packages/arc-framework/arc/**`
          (was over-excluding `.arc/system/workflows/arc/` and strategies)
        - Fixed 11 pre-existing lint errors exposed by the config fix (table alignment,
          line length in 4 strategy files)
        - All quality gates pass: 0 lint errors (150 files), typecheck clean, 84 tests

    - [x] **3.4.d Setup bridge: arc-setup skill and README**

        Created `arc-setup` canonical skill and refreshed `.arc/README.md`.

        - `arc-setup` skill: simplified to 2-step sequence (read AGENT-BRIEFING.ARC.md →
          follow 01_verify-and-configure.md). AGENT-BRIEFING.PROJECT.md and agent-specific
          files are unpopulated templates post-init — the setup workflow handles them.
          `disable-model-invocation: true` (user-initiated, not auto-triggered).
        - `.arc/README.md`: added "Getting Started" section with `/arc-setup` and
          copy-paste fallback, `/arc-verify` pointer, updated directory tree (added
          skills/), refreshed lead description and table alignment
        - Updated skills README with arc-setup in default skill set
        - Updated notes-cli-implementation.md post-init bridge message spec
        - Skill generation targets: reassigned to Task 3.6 (already includes arc-setup)

        **Additional work in this session (methodology improvements):**

        - AGENT-BRIEFING.ARC.md (both copies): updated "portable markdown documents" phrasing
          to "markdown documents that work with any agent platform"
        - Session-init (both copies): added item 11 — conditional process-task-loop
          load when WORK-STATUS shows active task work. Eliminates self-triggering
          failure mode where agents skip loading the task execution workflow.
        - Context loading strategy: added "State-Conditional Promotion" subsection
          documenting T3→init promotion based on session state signals
        - DEV-RULES.ARC: updated "When to Load Additional Guidance" to reflect
          conditional init loading as primary, on-demand as fallback
        - CLAUDE.ARC.md (internal): updated process-task-loop loading instruction

    - [x] **3.4.e Implement prompts and remove `arc_dir` (`src/prompts/init-prompts.ts`)**

        Created `src/prompts/init-prompts.ts` with @clack/prompts 3-prompt sequence
        (`project_name` text, `tools` multiselect, `pm_mode` select). Prompt wording
        iterated through audit of actual pm.mode behavioral differences — labels
        refined to ARC Core / ARC Core + Planning Module / ARC Core + External Tracker
        with hints grounded in what each mode concretely provides.

        `arc_dir` / `ARC_DIR` removal across the codebase:

        - Removed `arc_dir` prompt from `init-recipe.json` (4→3 prompts)
        - Removed `arc_dir` from `InstallConfig` in `src/lib/types.ts`
        - Replaced `{{ARC_DIR}}` with `.arc` in 6 template files (AGENT-BRIEFING.PROJECT,
          QUICK-REFERENCE, PROJECT-STATUS, BACKLOG-FEATURE, BACKLOG-TECHNICAL,
          agent README)
        - Updated test fixtures in `recipe.test.ts` and `manifest.test.ts`
        - Updated notes (removed Prompt 4, removed `{{ARC_DIR}}` from token table,
          updated prompt spec to match finalized wording)
        - Updated PRD (revised UC7 and requirement 13 for fixed directory)
        - Added Capture Routing placeholder section to `DEV-RULES.PROJECT.md` template
        - Marked Task 7.5 (configurable install directory) as superseded `[~]`
        - Added Task 3.4.f (external tracker integration setup workflow) to give
          `pm.mode: external` a concrete post-init deliverable

- [x] **3.4.f Create external tracker integration setup workflow**

      Created `03_configure-external-integration.md` and overhauled the full
      initial-setup workflow sequence (`01_`, `02_`, `03_`).

      **`03_configure-external-integration.md`** (new):

        - 4-step workflow giving `pm.mode: external` a concrete post-init deliverable
        - Steps: identify tracker → set up capture routing in DEV-RULES.PROJECT →
          configure workflow extensions (post-task-completion, post-work-unit-activate,
          post-work-unit-archive) → review method overrides (commit-context-format,
          issue-triage). Tool-agnostic, lightweight guidance
        - `init-recipe.json`: added `pm.mode == external` condition block
        - `strategy-file-classification.md`: added inventory entry and naming list

      **`01_verify-and-configure.md`** (overhauled):

        - Added User Workspace section: identity verification, `user/{identity}/`
          orientation, `user.sync_push` behavior and `git config arc.sync_push` override
        - Added Customization Beyond Config section: dual-audience summary of
          arc-methods/arc-extensions surfaces plus content-level customization
          pointer (project strategies, project workflows, DEV-RULES.PROJECT)
        - Join Existing path: added user workspace bullet, updated Next Step to list
          all five project documents (added AGENT-BRIEFING.PROJECT and QUICK-REFERENCE)

      **`02_define-project.md`** (overhauled):

        - Resequenced steps: META-PRD → TECHNICAL-OVERVIEW → AGENT-BRIEFING.PROJECT →
          QUICK-REFERENCE → DEV-RULES.PROJECT (→ ROADMAP/PROJECT-STATUS for
          arc-in-git). Session-loaded docs identified explicitly; reference docs
          distinguished from session-critical docs
        - Added missing AGENT-BRIEFING.PROJECT (Step 3) and QUICK-REFERENCE (Step 4)
        - arc-in-git content (Steps 6-7, maintenance items) wrapped in
          `<!-- arc:if pm.mode == arc-in-git -->` conditional rendering —
          stripped for non-arc-in-git installs
        - Conditional pointers (external tracker) use blockquote style for
          deemphasized visibility as discovery seams
        - Rewrote Maintaining Project Documents: grounded in session-loaded vs
          reference distinction, no prescriptive timing or obvious mappings
        - Bundled copies synced to `packages/arc-framework/arc/`

- [x] **3.5 ARC integrity verification — scripts, workflow, and skill**

    **Goal:** Create a deterministic health-check capability for ARC installations.

    **Placement:** Scripts in `.arc/system/scripts/`, workflow in
    `.arc/system/workflows/arc/supplemental/`, skill in `.arc/system/skills/`.

    - [x] **3.5.a Create scripts directory and `validate-config.sh`**

        Created `.arc/system/scripts/` with three files:
        - `arc-lib.sh` — shared shell library extracted from hooks (config reader
          `arc_config_get`, `arc_config_keys`, color definitions). DRY refactor: both
          hooks now source this instead of duplicating the config parser.
        - `validate-config.sh` — config validation: enum checking for all 14 keys,
          cross-field dependency enforcement, unknown key detection (typo protection).
          Structured PASS/WARN/ERROR output, exit codes 0/1/2.
        - `README.md` — directory purpose, script inventory, usage, output format.

        Refactored `pre-commit` and `commit-msg` hooks to source `arc-lib.sh` —
        removed ~40 duplicated lines from each hook. Hooks verified working post-refactor.

        All mirrored to `.arc-internal/`, `packages/arc-framework/arc/`, and added to
        `init-recipe.json`.

    - [x] **3.5.b Write `verify-integrity.sh` and workflow document**

        **Script** (`verify-integrity.sh`) — 8-category orchestrator:
        1. Config validation (delegates to `validate-config.sh`)
        2. File structure (core files + config-conditional: ROADMAP for arc-in-git)
        3. Hook status (existence, executable, `core.hooksPath` alignment)
        4. Strategy index consistency (bidirectional: entries ↔ files)
        5. Reference integrity (reference-style markdown links in key documents)
        6. Session state (WORK-STATUS task list path, next task resolution)
        7. Methods/extensions structure (sections and subsections present)
        8. Manifest awareness (forward-compatible `.arc-manifest.json` check)

        Config-aware via `ARC_CONFIG_FILE`, directory-aware via `ARC_DIR` env var.
        Tested against both `.arc/` (template) and `.arc-internal/` (live installation).

        **Workflow** (`supplemental/verify-arc-integrity.md`) — check category
        definitions, severity guidance, remediation hints, agent role, integration points.

        Both added to `init-recipe.json` and mirrored.

    - [x] **3.5.c Create `arc-verify` canonical skill**

        Thin wrapper skill in `.arc/system/skills/arc-verify/SKILL.md` — runs
        `verify-integrity.sh`, interprets results per workflow guidance, offers targeted
        fixes on errors. Added to skills README default skill set and `init-recipe.json`.
        `disable-model-invocation: true` (requires no AI generation, only script execution
        and interpretation).

- [x] **3.6 Define skill generation interface (`src/lib/skills.ts`)**

    **Goal:** Establish the skill generation contract that the init command (3.7) calls,
    including the universal-first directory model per ADR-011 amendment.

    - [x] **3.6.a Initial interface**

        Created `src/lib/skills.ts` with types, constants (`CANONICAL_SKILLS` — all 5
        including `arc-setup` and `arc-verify`), and `generateSkills()` no-op. Initial
        implementation used per-tool directory model from original ADR-011.

    - [x] **3.6.b Universal-first generation model**

        Ecosystem research (March 2026) found `.agents/skills/` is now the universal
        standard supported by 20+ tools. Only Claude Code, Augment, and Antigravity
        require standalone directories. Codex `openai.yaml` is optional UX sugar.
        Gemini TOML files are for custom commands, not skills.

        - Amended ADR-011 Part 2: universal-first two-tier model (universal +
          standalone) replaces per-tool directories. Updated tool landscape, generation
          target table, consequences, and risks
        - Updated `skills.ts`: 13 tool IDs across two tiers, `resolveSkillTargets()`
          with detection-aware resolution (honors existing tool-specific dirs, falls
          back to `.agents/skills/`), `NATIVE_SKILL_DIRS` map, dropped `gemini-toml`
        - Updated `init-prompts.ts`: `groupMultiselect` with universal and standalone
          tiers (10 universal + 3 standalone tools)
        - Updated `init-recipe.json`: expanded tool options list
        - Updated `notes-cli-implementation.md` skill generation section
        - Captured follow-up: agent config file decoupling from init (setup workflow
          handles `{AGENT}.ARC.md`), broader agent file support

- [x] **3.7 Implement init command (`src/commands/init.ts`)**

    - [x] **3.7.a Core init flow**

        Implemented `src/commands/init.ts` with IOContext dependency injection pattern
        (per session notes guidance for 4+ injectable dependencies). Decomposed into
        tested pure functions + orchestrator:

        - `detectInitMode()` — checks `.arc/system/arc-config.yml` existence
        - `buildConfigMap()` — prompt results → condition evaluation config
        - `buildTokenMap()` — prompt results + cwd → token substitution map
        - `resolveFileList()` — recipe + config → deduplicated file list
        - `toOutputPath()` — `.template` suffix stripping
        - `writeArcConfig()` — programmatic config write preserving comments
        - `runInit()` — orchestrator: mode detection → file rendering → skill
          generation → identity storage. All I/O via IOContext.
        - 26 unit tests covering all behaviors including cancellation

    - [x] **3.7.b Pristine and manifest creation**

        Integrated into `runInit()` orchestrator:

        - `classifyFile()` — Scaffolded (7), Configurable (14), Framework (default)
          as code constants from notes § File-by-File Classification
        - `fileLayer()` — derives layer from `pm.mode == arc-in-git` condition membership
        - `buildManifestFiles()` — assembles file entries with classification, layer,
          and SHA-256 pristine_hash via `hashContent()`
        - Orchestrator writes `.pristine/` copies for Framework + Configurable only
          (Scaffolded excluded — user-owned from day one)
        - Writes `.arc-manifest.json` with version, install_config, file inventory
        - 9 new tests (classifyFile, fileLayer, buildManifestFiles, orchestrator
          manifest + pristine assertions)

    - [x] **3.7.c Git integration setup**

        Integrated into `runInit()` orchestrator:

        - `.gitignore`: appends `.arc/.pristine/` and `.arc/user/*/`
        - `.gitattributes`: appends `.arc/active/WORK-STATUS.md merge=ours`
        - `git config merge.ours.driver true` — merge driver for WORK-STATUS
        - `git config core.hooksPath .arc/system/githooks` — hook discovery
        - Fixed `appendLineIfMissing` to handle ENOENT (creates file if missing)
        - 1 new orchestrator test verifying all git integration steps

- [ ] **3.8 Implement post-init messaging (bridge UX)**

    The post-init message is the only bridge between CLI init and agent-led setup. See
    `notes-cli-implementation.md` § Post-Init Bridge Message for finalized wording.

    - Print concise summary: files installed, install directory, key choices made
    - Primary path: "Restart your AI agent to load ARC configuration, then run `/arc-setup`"
    - Fallback path: copy-pasteable prompt for agents without skill support (read
      `AGENT-BRIEFING.ARC.md`, `AGENT-BRIEFING.PROJECT.md`, agent-specific file, then run setup workflow)
    - Agent-specific tailoring: if possible, customize the message based on selected
      tools (e.g., "For Claude Code, say: ...")
    - Orient without overwhelming — this is the adopter's first impression after init

- [ ] **3.9 Write integration tests for init flow**
    - Test: init in empty git repo → verify directory structure, file contents, manifest, pristine
    - Test: rendered files contain no template tokens or conditional markers
    - Test: `.gitignore` and `.gitattributes` contain expected entries
    - Test: manifest file inventory matches files on disk
    - Test: pristine hashes match rendered file content
    - Test: agent file split present in output (`AGENT-BRIEFING.ARC.md` + `AGENT-BRIEFING.PROJECT.md`)
    - Test: `WORK-STATUS.md` initial Next Action points to setup workflow
    - Test: verify script files installed (`scripts/validate-config.sh`,
      `scripts/verify-integrity.sh`)
    - Test: join mode — init in repo with existing `.arc/` → detects existing ARC,
      skips structural setup, sets up agent dirs and hooks only
    - Test: rendered files use hardcoded `.arc/` paths (no `{{ARC_DIR}}` residuals)

- [ ] **3.10 Run quality gates**
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
        - Read new framework files from bundled `arc/` directory
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
    - Read canonical skills from bundled `arc/system/skills/`
    - Generate per-tool output with correct paths, frontmatter, supplemental files
    - Handle all 6 agent tools (Claude, Codex, Gemini, Copilot, Cursor, Windsurf)

    Build `test-first` (one behavior at a time):
    - Canonical skill → Claude Code output (correct path, `disable-model-invocation` frontmatter)
    - Canonical skill → Codex output (`.agents/skills/` path, `openai.yaml` supplemental)
    - Canonical skill → Windsurf output (`.windsurf/skills/` path, no `.agents/`)
    - Multiple agents selected → correct output set for each
    - Skill instructions use fixed `.arc/` path

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

### **Phase 7:** User Directory, PM Mode, and Portability

**Purpose:** Implement the unified user directory model (ADR-012), PM mode conditional handling,
user directory portability via git notes, `arc log --atomic`, framework template/doc updates,
and `.arc-internal/` self-hosting migration.

**Strategies:** `strategy-file-classification.md` (file inventory), `strategy-team-coordination.md`,
`strategy-backlog-organization.md`, `strategy-configurability-architecture.md`

- [ ] **7.1 Implement unified user directory and identity resolution**

    **Goal:** Every `arc init` creates a `user/{identity}/` directory with personal workspace files.
    Same structure for solo and team (ADR-012 Part 1).

    - [x] **7.1.a Identity resolution utility (`src/lib/identity.ts`)**

        Pulled forward as prerequisite for Task 3.7 (init command needs identity
        resolution for both fresh and join modes).

        - `slugifyIdentity()`: lowercase, spaces/dots → hyphens, strip non-alphanumeric,
          collapse consecutive hyphens, trim
        - `resolveIdentity()`: lookup sequence with injectable `GitExec` and optional
          prompt function. Returns resolved identity or null on cancellation.
        - Caller stores result via `gitConfigSet()` (side effect not in utility)
        - 14 unit tests (7 slugify + 7 resolve) — all passing

    - [ ] **7.1.b Init: user directory creation**
        - Create `user/{identity}/` directory
        - Install `SESSION-NOTES.md` template (Core — all modes)
        - Install `ATOMIC-INBOX.md` template (arc-in-git only — gated by PM mode, task 7.2)
        - `user/README.md` tracked (explains personal workspace concept)
        - `user/{identity}/` contents gitignored (added in 3.7.c pattern)

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
    - Search commit history for two patterns:
        - `git log --grep="Context: atomic-"` — work-unit-scoped atomic tasks (companion file)
        - `git log --grep="(atomic / no associated task list)"` — standalone atomic tasks
    - Formatted output (date, type, scope, description)
    - Optional filters: `--since`, `--author`, `--limit`, `--work-unit` (filter by WU name
      via `atomic-{name}` filename pattern)
    - Clear output when no matching commits found

    Build `test-first` (one behavior at a time):
    - Commits with companion file context footer appear in output
    - Commits with standalone atomic context footer appear in output
    - `--work-unit` filter narrows to specific WU
    - Non-atomic commits excluded
    - Filter flags work correctly

- [~] **7.5 ~~Implement configurable install directory~~**

    Superseded by fixed `.arc/` directory decision (2026-03-15, implemented in Task 3.4.e).
    Install directory locked to `.arc/` at repo root — no renaming, no relocation. `{{ARC_DIR}}`
    token and `arc_dir` prompt eliminated. Cross-references use `.arc/` directly.

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
        - Created CLI-internal user templates (now at `src/templates/user/`):
          `SESSION-NOTES.md` with unified portability note, `user.sync_push` config key;
          `ATOMIC-INBOX.md` — inbox-model
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

- [x] **7.8 Migrate `.arc-internal/` to unified model (self-hosting)**

    **Goal:** The framework's own workspace reflects the unified user directory model it
    prescribes to adopters.

    - [x] **7.8.a Create `.arc-internal/user/{identity}/` structure**
        - Created `user/andrew/` with `git config --local arc.identity andrew`
        - Moved SESSION-NOTES.md from `active/` to `user/andrew/`
        - Moved and renamed ATOMIC-TASKS.md → `user/andrew/ATOMIC-INBOX.md` with updated
          content (inbox semantics, removed completed-atomic protocol, `arc log --atomic`)
        - Created `user/README.md` (tracked) explaining personal workspace concept

    - [x] **7.8.b Update `.arc-internal/` gitignore and references**
        - `.gitignore`: replaced `active/SESSION-NOTES.md` + `team/*/SESSION-NOTES.md`
          with `user/*/` pattern
        - Internal `session-init.md`: updated path to `user/{identity}/SESSION-NOTES.md`
          with identity resolution chain
        - No internal `session-handoff.md` exists (uses `.arc/` template)

    - [x] **7.8.c Handle completed-atomic archive**
        - `completed-atomic-2026-q1.md` left as historical record in archive
        - No active methodology docs reference the protocol (cleaned in 7.7)

- [ ] **7.9 Write integration tests for unified model and mode variations**
    - Test: init creates `user/{identity}/` with SESSION-NOTES.md
    - Test: init with `pm.mode: arc-in-git` → ATOMIC-INBOX.md in user dir
    - Test: init with `pm.mode: none` → no ATOMIC-INBOX, no backlog files
    - Test: init with team mode → same `user/` structure, `team.mode: true` in config,
      `user.sync_push: prompt`
    - Test: init with solo mode → `user.sync_push: always`
    - Test: update respects PM mode (skips arc-in-git files when mode is none)
    - Test: no `completed-atomic` files in any mode
    - Test: `arc log --atomic` returns commits matching both companion file and standalone patterns
    - Test: `arc log --atomic --work-unit {name}` filters to specific WU
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
