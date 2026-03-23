# Task List: CLI Implementation

**PRD:** `.arc-internal/active/technical/prd-cli-implementation.md`
**Created:** 2026-03-10
**Branch(es):** `technical/cli-implementation`
**Base Branch:** `main`
**Status:** Complete
**Completed:** 2026-03-20

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

- [x] **3.8 Implement post-init messaging (bridge UX)**

    `buildPostInitMessage(result: InitResult): string` in `src/commands/init.ts`.
    Pure function — takes init result, returns formatted message. Two paths:

    - **With tools**: restart note (skills need discovery), `/arc-setup` as primary,
      fallback prompt for tools without skill support
    - **Without tools**: direct to fallback prompt (paste into agent conversation)
    - Fallback always points to `AGENT-BRIEFING.ARC.md` + `01_verify-and-configure.md`
    - Dropped agent-specific tailoring (no value — multiple tools possible, message
      is universal) and stale file references (PROJECT briefing, agent-specific files
      are unpopulated templates post-init)
    - 7 new unit tests

- [x] **3.9 Wire init CLI action handler**

    `src/cli.ts` — replaced init stub with full action handler wiring:

    - `p.intro("arc init")` opener
    - `runInitPrompts()` → interactive input (cancellation exits cleanly)
    - `resolveIdentity()` with clack `p.text()` adapter for interactive prompt
    - Recipe loaded from bundled `init-recipe.json`
    - `p.spinner()` wrapping `runInit()` — "Installing ARC framework..."
    - `p.note()` displaying `buildPostInitMessage()` under "What's next" header
    - `p.outro("Done.")` closer
    - Real `IOContext` using `node:fs/promises` and `child_process.execFile`

- [x] **3.10 Write integration tests for init flow**

    23 integration tests in `__tests__/integration/init.test.ts`. Runs `runInit`
    against real temp git repos with the real recipe and template files. Two
    describe blocks: `pm.mode=none` (21 tests) and `pm.mode=arc-in-git` (1 test).

    - Directory structure: expected subdirectories created
    - Token rendering: `{{PROJECT_NAME}}` resolved in AGENT-BRIEFING.PROJECT.md
    - No init-time token residuals (`{{PROJECT_NAME}}`, `{{REPO_ROOT}}`)
    - No unresolved conditional markers (line-start `arc:if`/`arc:endif`, excluding
      backtick documentation references)
    - Git integration: `.gitignore`, `.gitattributes`, `core.hooksPath`, `arc.identity`
    - Manifest: structure, file inventory matches disk, pristine hashes match content
    - Agent briefing split: ARC + PROJECT files present
    - WORK-STATUS.md Next Action points to setup workflow
    - Script files installed (`validate-config.sh`, `verify-integrity.sh`)
    - Pristine copies: present for Framework/Configurable, absent for Scaffolded,
      content matches `.arc/` copies
    - arc-config.yml: pm.mode written correctly
    - Conditional exclusion: no arc-in-git files when `pm.mode=none`, no unselected
      tool agent files
    - Post-init message: file count, `/arc-setup`, fallback prompt references
    - arc-in-git mode: ROADMAP.md present, config reflects `pm.mode: arc-in-git`
    - _(Join-mode integration test deferred to 7.1.d)_

- [x] **3.11 Run quality gates**
    - Type checking: zero errors
    - Tests: 164 passed (141 unit + 23 integration)
    - Markdown linting: zero errors in tracked files (pre-existing issues in
      gitignored SESSION-NOTES.md only)
    - Build: succeeds

### **Phase 4:** Update Command

**Purpose:** Build the three-way merge update system — the core value proposition of the CLI.
Establish shared infrastructure (error handling, version resolution) before command work.

**Design decisions resolved during Phase 4 audit (2026-03-18):**

- `framework_version`: read from CLI package's own `package.json` at runtime (same
  `import.meta.url` pattern as `paths.ts`). Replaces hardcoded `"0.0.0"`.
- Error handling: shared `errors.ts` with structured error types, built first so all
  commands use consistent patterns from the start.
- Merge wrapper: `gitMergeFile()` already exists in `git.ts` (implemented in Phase 3,
  3 unit tests). This phase builds a higher-level content-based wrapper over it.
- Removed files on update: auto-remove Framework files; warn for Configurable (may
  have adopter content); leave Scaffolded untouched (adopter-owned).
- Recipe evolution: diff old manifest file list vs new recipe file list to detect
  added/removed files across framework versions.

- [x] **4.1 Shared error handling utilities (`src/lib/errors.ts`)**

    Implemented `src/lib/errors.ts` with `ArcError` (base + code), `UserFacingError`
    (whatHappened/why/whatToDo), `formatError()`, and `ArcErrorCode` union type.
    Test-first: 8 unit tests covering all three behaviors.

- [x] **4.2 Package version resolution (`src/lib/version.ts`)**

    Implemented `getFrameworkVersion()` and testable `findVersionFromDir()` with
    walk-up-to-package.json pattern. Wired into both call sites: `cli.ts` (Commander
    `.version()`) and `init.ts` (manifest `framework_version`). 3 unit tests.

- [x] **4.3 Higher-level merge function (`src/lib/merge.ts`)**

    Implemented `mergeFileContents()` with injectable `FileMergeFn` (accepts bound
    `gitMergeFile` in production, mocks in tests). Three fast paths for unchanged
    sides, delegates to merge function for general case. Returns `{content, status}`
    where status is `'clean' | 'conflict' | 'unchanged'`. Temp file lifecycle deferred
    to the update command's wiring layer (4.5) — keeps merge logic pure. 7 unit tests.

- [x] **4.4 Update command — file list resolution**

    Implemented `diffFileLists()` in `src/lib/update-files.ts` — pure set-diff
    returning `{keep, added, removed}`. Condition evaluation is the caller's
    responsibility via existing `resolveFileList()` + `toOutputPath()`. 6 unit tests.

- [x] **4.5 Update command (`src/commands/update.ts`)**

    Implemented `runUpdate()` orchestrator with `createContentMergeFn()` (temp file
    lifecycle for `git merge-file`), `renderTemplate()` (shared renderer for arc-config.yml
    programmatic override and standard token/conditional rendering), and `buildUpdateSummary()`
    for user-facing output. Reconstructs config/token maps from stored `install_config`
    without re-prompting. Wired into `cli.ts` with spinner, error handling (`UserFacingError`
    catch), and conflict warnings.

    - [x] **4.5.a Core merge loop**
        - Reads manifest with `UserFacingError` for missing (`MANIFEST_MISSING`) and
          invalid (`MANIFEST_INVALID`) cases
        - Rebuilds config/token maps from `manifest.install_config` (mirrors init's
          `buildConfigMap`/`buildTokenMap` without coupling to `InitPromptResult`)
        - Re-renders all templates using same `renderTokens()` + `renderConditionals()`
          pipeline; arc-config.yml uses programmatic line-by-line override
        - Diffs file lists via `diffFileLists()` to get keep/added/removed
        - For each `keep` file: reads pristine and current, calls `mergeFileContents()`
        - Classifies results: clean, conflict, unchanged, skipped (Scaffolded)
        - Edge cases: missing current file (treats as no adopter changes), missing
          pristine (treats as fresh install — can't three-way merge without base)

    - [x] **4.5.b New and removed file handling**
        - Added files: rendered from templates, installed to `.arc/`, pristine copies
          written for Framework and Configurable (not Scaffolded)
        - Removed Framework: auto-deleted from `.arc/` and `.pristine/` via `safeUnlink()`
        - Removed Configurable: pristine deleted, file kept on disk for review
        - Removed Scaffolded: left untouched (adopter-owned)

    - [x] **4.5.c Pristine and manifest update**
        - Clean merges and unchanged: pristine updated to new framework content,
          `pristine_hash` set to `hashContent(updated)`
        - Conflicts: pristine left unchanged, old manifest entry preserved
        - Scaffolded files: existing manifest entry carried forward unchanged
        - New manifest written with updated `framework_version`, preserved
          `installed_at` and `install_config`, rebuilt `files` record
        - Uses `io.writeFile` (consistent with init's pattern, not `writeManifest()`)

    - [x] **4.5.d Result reporting**
        - `buildUpdateSummary()`: counts line (updated, conflicts, new, removed,
          unchanged, skipped), conflict file list with resolution guidance, kept-for-review
          list for removed Configurable files
        - Wired into `cli.ts`: recipe loading, spinner, `p.note` summary, `p.log.warn`
          for conflicts, `UserFacingError` catch with `formatError()` display

- [x] **4.6 Integration tests for update flow**

    11 integration tests in `__tests__/integration/update.test.ts`. Synthetic test harness
    (`setupInitialState`, `createTemplateDir`) gives full control over initial state and
    template modifications without depending on `runInit` for most tests. Baseline test uses
    real recipe + `runInit` to validate the full pipeline.

    Also fixed `mergeFileContents` fast-path ordering in `merge.ts` — moved `current === updated`
    check before `base === current` so the all-three-equal case (init → immediate update, no
    changes anywhere) correctly returns "unchanged" instead of "clean". Existing unit tests
    unaffected (they never hit the all-three-equal case).

    - Baseline: init → immediate update → all unchanged/skipped, no conflicts/added/removed
    - No adopter changes → files updated, pristine = v2, manifest hashes match new content
    - Non-overlapping adopter changes → auto-merge preserves both (real `git merge-file`)
    - Conflicting changes → conflict markers in file, in `result.conflicts`, pristine unchanged
    - Scaffolded files skipped → adopter content preserved regardless of template changes
    - New Framework file added → installed in `.arc/` and `.pristine/`, tracked in manifest
    - Framework file removed → deleted from `.arc/` and `.pristine/`, removed from manifest
    - Configurable file removed → file kept on disk, pristine deleted, in `keptForReview`
    - Manifest missing → `UserFacingError` with code `MANIFEST_MISSING`
    - Manifest invalid JSON → `UserFacingError` with code `MANIFEST_INVALID`
    - Manifest invalid schema → `UserFacingError` with code `MANIFEST_INVALID`

- [x] **4.7 Run quality gates**
    - Type checking: zero errors
    - Tests: 199/199 passing (165 unit + 34 integration)
    - Markdown linting: zero violations
    - Build: success (31.45 KB)

### **Phase 5:** Status, Diff, and CLI Polish

**Purpose:** Build the inspection commands, add non-interactive mode for scripted/CI
usage and E2E testability, and finalize cross-cutting CLI concerns.

**Design decisions resolved during Phase 5 audit (2026-03-18):**

- Diff: `git diff --no-index` via existing `GitExec` pattern (consistent with
  git-for-heavy-lifting approach; no JS diff dependency).
- Version availability: native `fetch()` to npm registry (Node 18+ built-in; no
  dependency). Non-fatal — graceful skip when offline.
- Non-interactive mode: `--yes` flag + optional value flags. User-facing feature that
  enables CI pipelines and scripted installs. Also required for E2E testing (Phase 8).

- [x] **5.1 Status command (`src/commands/status.ts`)**

    `StatusIOContext` with injectable `readFile`, `readManifest`, and `readdir` for testability.
    `runStatus()` orchestrator: reads manifest (hard fail `MANIFEST_MISSING`), hashes each tracked
    file against `pristine_hash`, scans `.arc/` for untracked files (excluding `.pristine/`),
    compares `framework_version` vs CLI version. `buildStatusSummary()` formats output with version
    info, file counts, and M/!/? indicators for modified/missing/new files. Wired into `cli.ts`
    with `listArcFiles()` recursive walker. 6 unit tests (test-first): manifest missing, fresh init
    all unmodified, modified detection, missing detection, version mismatch, new file detection.

- [x] **5.2 Version availability check (`src/lib/version.ts` extension)**

    `checkLatestVersion(packageName, fetchImpl)` with injectable `FetchFn` for testability.
    Scoped package URL encoding (`/@arc-framework%2fcli/latest`). Returns `string | null` —
    network errors and non-ok responses return null (non-fatal). Integrated into status command:
    `latestVersion` field on `StatusResult`, "Latest: vX.Y.Z" line in summary when available,
    omitted when null. Registry check runs in parallel with status computation in `cli.ts`.
    8 new tests: 4 for `checkLatestVersion` (success, network error, non-ok response, URL
    encoding), 4 for status integration (latestVersion passthrough, null default, summary
    with/without latest). Batched — tightly coupled behaviors per function, single-pass
    implementation.

- [x] **5.3 Diff command (`src/commands/diff.ts`)**

    `DiffIOContext` with injectable `readFile`, `readManifest`, and `gitDiff`. `runDiff()`
    orchestrator: reads manifest (hard fail `MANIFEST_MISSING`), iterates Framework and
    Configurable files, skips Scaffolded (count tracked), skips unmodified via hash comparison,
    verifies pristine exists before calling gitDiff (missing pristine → per-file error, non-fatal).
    `buildDiffOutput()` formats with file headers and error section. Wired into `cli.ts` with
    inline `gitDiff` using `execFileAsync` (handles exit code 1 = differences found). 5 unit
    tests: manifest missing, unmodified, modified with diff output, scaffolded exclusion, missing
    pristine error. Batched — single orchestrator with varying mock file states.

- [x] **5.4 Non-interactive mode for init**

    `buildNonInteractivePrompts()` in `src/prompts/non-interactive.ts` — pure function that
    builds `InitPromptResult` from CLI flags + defaults. Defaults: `basename(cwd)` for name,
    `[]` for tools, `"none"` for pm_mode. Each flag (`--name`, `--pm-mode`, `--tools`) overrides
    one default. CSV parsing for `--tools` with trim and empty-filter. Commander options wired
    on init command (`-y/--yes`, `--name`, `--pm-mode`, `--tools`). When `--yes` without
    `--tools`, logs info note. Without `--yes`, existing interactive flow unchanged. 5 unit
    tests: defaults only, name override, pm-mode override, tools override, all combined.
    Batched — pure function exercised with different input combinations.

- [x] **5.5 Integration tests for status and diff**

    7 integration tests in `__tests__/integration/status-diff.test.ts` exercising real
    filesystem I/O against a temp repo created by `arc init`. Extracted shared test
    infrastructure into `__tests__/helpers/integration.ts` (`createTempRepo`,
    `initInTempRepo`, `makeGitExec`, `makeIOContext`, `listFiles`, `loadRecipe`, etc.)
    to DRY the duplicated setup across init, update, and status-diff integration tests.
    Existing tests not migrated (opportunistic later).

    - Status: fresh init all unmodified, modified file detected, new untracked file detected
    - Diff: unmodified install → no diffs, modified file → unified diff with content
    - Missing manifest: both status and diff throw UserFacingError

- [x] **5.6 Run quality gates**
    - Markdown linting: 158 files, 0 errors
    - TypeScript type checking: clean (strict mode)
    - Full test suite: 19 files, 230 tests (189 unit + 41 integration), all pass
    - Also migrated init and update integration tests to shared `__tests__/helpers/integration.ts`

### **Phase 6:** Skill Generation

**Purpose:** Build the system that copies canonical skill definitions to per-tool
directories, add pre-commit protection for framework-owned files, and integrate skill
generation with init and update commands.

**Strategies:** `strategy-file-classification.md` (skill file inventory)

**Design decisions resolved during Phase 6 audit (2026-03-18):**

- Skill generation is a straight copy from canonical to tool-specific directories.
  Content is unchanged — skills reference `.arc/` paths which are fixed.
- Codex supplement: `openai.yaml` with `interface.display_name`, `short_description`,
  `default_prompt` derived from SKILL.md YAML frontmatter (see `.codex/skills/` for
  format reference).
- No manifest tracking for generated skills. Skills are cheap deterministic copies —
  regenerate on every update. Modification detection by comparing existing file against
  canonical source before overwriting.
- Framework-owned file protection via pre-commit hook CHECK 10. Covers both `.arc/`
  Framework-classified files (via manifest lookup) and generated skill files (via path
  pattern matching). Warning, not error.

- [x] **6.1 Skill generation implementation (`src/lib/skills.ts`)**

    Replaced `generateSkills()` stub with full implementation. New signature adds
    `cwd` and `SkillGenerationIO` params; returns `SkillGenerationResult` with
    `outputs` (skill files to write) and `warnings` (modification detection).

    - `parseSkillFrontmatter()`: regex-based YAML frontmatter extraction (name, description)
    - `buildCodexYaml()`: generates `openai.yaml` from frontmatter (display_name uses "ARC"
      uppercase, not title-case)
    - `generateSkills()`: reads canonicals, resolves targets, produces outputs per
      skill × target, generates codex-yaml supplements, detects modified existing files
    - Updated `init.ts` call site to pass new args (output handling deferred to 6.2)
    - Updated `init.test.ts`: `mockIO` auto-includes canonical skill stubs via
      `canonicalSkillFiles()` helper
    - 11 unit tests (6 generateSkills behaviors + 3 frontmatter + 1 codexYaml + 1 edge case)

- [x] **6.2 Integrate with init and update**

    - Init: `generateSkills()` result now written to disk via `writeSkillOutputs()`.
      Gitignore entries added per resolved target directory (`{dir}/arc-*/`).
    - Update: added `generateSkills()` call after file merge loop. Uses
      `detectExistingSkillDirs()` to honor existing tool directories. Always
      regenerates (no manifest tracking). Gitignore entries ensured.
    - Shared helpers in `skills.ts`: `writeSkillOutputs()`, `skillGitignoreEntries()`,
      `detectExistingSkillDirs()`
    - Updated init unit test to assert skill file writes (10 files for claude+cursor)
      and gitignore entries

- [x] **6.3 Pre-commit hook: framework-owned file protection (CHECK 10)**

    Added CHECK 10 to public hook, CHECK 11 to internal hook (internal already
    has CHECK 10 for boundary enforcement). Two detection categories:

    - **Manifest-based**: staged `.arc/` files looked up in `.arc-manifest.json`;
      `Framework` classification triggers warning. Skipped when no manifest exists.
    - **Pattern-based**: staged files matching `skills/arc-*/SKILL.md` or
      `skills/arc-*/agents/*.yaml` trigger separate warning.
    - Warning tone: factual ("Changes will be overwritten by arc update.") with
      pointer to `strategy-configurability-architecture.md` for Framework files
      (no pointer for generated skills — no customization path exists).
    - Added "If you need to customize" paragraph to `strategy-file-classification.md`
      § Framework with link to configurability architecture § Which mechanism do I use?
      Creates the complete breadcrumb: hook → classification → customization path.

- [x] **6.4 Integration tests for skill generation**

    6 integration tests in `__tests__/integration/skills.test.ts`:
    - init with claude → `.claude/skills/` has all 5 SKILL.md files
    - init with codex → `.agents/skills/` has SKILL.md + `agents/openai.yaml` per skill
    - init with claude+cursor → both `.claude/skills/` and `.agents/skills/` populated
    - generated skill content matches canonical source byte-for-byte
    - init adds skill directory patterns (`.claude/skills/arc-*/` etc.) to `.gitignore`
    - init → modify skill → update → canonical content restored

- [x] **6.5 Run quality gates**
    - TypeScript type checking: clean (strict mode)
    - Full test suite: 21 files, 247 tests (200 unit + 47 integration), all pass
    - Markdown linting: 158 files, 0 errors
    - Build: ESM + DTS success
    - Phase 6 complete

### **Phase 7:** User Directory, PM Mode, and Portability

**Purpose:** Implement the unified user directory model (ADR-012), PM mode conditional handling,
user directory portability via git notes, `arc log --atomic`, framework template/doc updates,
and `.arc-internal/` self-hosting migration.

**Strategies:** `strategy-file-classification.md` (file inventory), `strategy-team-coordination.md`,
`strategy-backlog-organization.md`, `strategy-configurability-architecture.md`

**Phase 7 audit notes (2026-03-18):** Tasks 7.1.a, 7.5, 7.6, 7.7, 7.8 are already complete
(done during prior sessions). Remaining work: 7.1.b–d, 7.2, 7.3, 7.4, 7.9, 7.10. Task 7.1.c
and 7.1.d have new prerequisite subtasks added to avoid the Phase 3 pattern of discovering
missing prereqs mid-implementation. Task 7.2.a is largely complete — init already handles PM
mode via recipe conditions. Task 7.2.b is verified by Phase 4's file list resolution. Task
7.3.d's open design question is resolved.

- [x] **7.1 Implement unified user directory and identity resolution**

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

    - [x] **7.1.b Init: user directory creation**

        After identity storage, `runInit()` creates `user/{identity}/` via `ensureDir()`
        and installs templates from `templates/user/` (CLI-internal, accessed via
        `getInternalTemplatePath()`). SESSION-NOTES.md installed for all modes;
        ATOMIC-INBOX.md gated by `prompts.pm_mode === "arc-in-git"`. Templates moved
        from `src/templates/user/` to `templates/user/` to align with the existing
        `getInternalTemplatePath()` resolver. Added `internalTemplateDir` to
        `InitOptions` for testability. Also excluded `user/{identity}/` paths from
        `listArcFiles` and `listFiles` (status command was reporting gitignored
        personal files as "new"). 4 integration tests added (SESSION-NOTES presence,
        content match, ATOMIC-INBOX exclusion for pm.mode=none, both files for
        arc-in-git). All existing tests updated with the new parameter — 251 passing.

    - [x] **7.1.c Init: team mode behavioral config**

        - [x] **7.1.c.i Update templates and recipe**

            `team.mode` already existed in arc-config.yml template. Added
            `user.sync_push` key (always/prompt/manual, default always) to the
            template. Added `team_mode` confirm prompt to `init-recipe.json`.
            Synced template to bundled `packages/arc-framework/arc/`. Also added
            both keys to the internal arc-config.yml.

        - [x] **7.1.c.ii Update init prompts**

            Added `team_mode: boolean` to `InitPromptResult`. Interactive prompt
            via `p.confirm()` after PM mode. Non-interactive via `--team` CLI
            flag (defaults to `false`). Added `team` option to
            `NonInteractiveOptions` and `--team` flag to CLI.

        - [x] **7.1.c.iii Behavioral wiring**

            `CONFIG_KEY_MAP` writes `team.mode` (stringified boolean) and
            `user.sync_push` (solo: `always`, team: `prompt`) to arc-config.yml.
            `team_mode` added to `buildConfigMap` for condition evaluation,
            `InstallConfig` for manifest storage, and `InitResult` for post-init
            messaging. Post-init message includes team coordination guidance when
            team mode enabled. 5 new tests (unit + integration): config map
            mapping, post-init message with/without team mode, integration test
            for team config values. 256 tests passing.

    - [x] **7.1.d Init: join-mode orchestrator narrowing**

        - [x] **7.1.d.i Join-mode prompt flow**

            `runInitPrompts()` accepts `mode` parameter (`'fresh' | 'join'`,
            defaults to `'fresh'`). Join mode shows only tools multiselect.
            `cli.ts` detects mode via `detectInitMode()` before prompts, reads
            existing `arc-config.yml` via `parseArcConfig()` to populate
            `pm_mode` and `team_mode` from the installed config. Non-interactive
            mode also reads existing config for join mode.

        - [x] **7.1.d.ii Orchestrator branching**

            `runInit()` accepts optional `mode` in `InitOptions`. Join mode
            branch runs: hooks path config, skill generation + gitignore
            entries, identity storage + user directory creation. Skips: file
            rendering, pristine copies, manifest, gitignore/gitattributes
            setup. Returns `filesWritten: []`. Integration test verifies:
            manifest unchanged, second dev's user dir created, first dev's
            intact, identity stored, hooks configured. 257 tests passing.

- [x] **7.2 Implement PM mode conditional file handling**

    - [x] **7.2.a Init: mode-aware file installation**

        Init gates arc-in-git files via recipe conditions (`pm.mode == arc-in-git` in
        `init-recipe.json`) and tracks `layer` in manifest (`fileLayer()` +
        `buildManifestFiles()` in `init.ts`). ATOMIC-INBOX conditional installation
        in user directory completed in 7.1.b. No `completed-atomic` files installed
        (ADR-012: commit record is the archive). Integration tests verify conditional
        installation in both fresh and join modes.

    - [x] **7.2.b Update: mode-aware file management**

        Verified — no new code required. `resolveFileList()` evaluates recipe conditions
        using stored `install_config.pm_mode`, so arc-in-git files are excluded from the
        merge loop for `pm.mode: none` installs. Conditional sections within shared files
        handled by `renderConditionals()` during re-rendering. PM mode changes between
        updates handled by existing `diff.added`/`diff.removed` logic. Existing
        integration tests cover the conditional file resolution.

- [x] **7.3 Implement user directory portability**

    **Goal:** The entire `user/{identity}/` directory travels across machines via git notes
    (ADR-012 Part 3). Replaces the session-notes-only portability design from ADR-007.

    - [x] **7.3.a Portability setup in init**
        - `user.sync_push` already written to `arc-config.yml` by 7.1.c
        - Added `configureNotesRefspec()` in `git.ts` — idempotent, checks for
          `remote.origin` existence and existing refspec before adding. Called from
          both fresh and join init paths.
        - 4 unit tests: add when absent, skip when present, skip when no remote,
          add when no fetch entries exist

    - [x] **7.3.b Implement user directory serialization (`src/lib/user-sync.ts`)**

        Core library with injectable I/O for testability. Three-layer filtering:
        explicit exclusions (`.env`, `.ipynb`, `.svg`) → text-file allowlist (~40
        extensions across 8 categories + compound `.env.example` + extensionless
        known files like `Makefile`) → 256KB size cap. README.md excluded by name.
        `serialize()` returns `SerializeResult` with manifest + structured
        `SkipWarning[]` for caller reporting. `deserialize()` restores files from
        manifest. 17 unit tests via red-green-refactor: allowlist coverage, binary
        rejection, explicit exclusions, size cap, extensionless files, case
        sensitivity, README exclusion, round-trip, empty directory.

    - [x] **7.3.c Implement `arc user` subcommand (`src/commands/user.ts`)**

        Orchestrator module with injectable `UserIOContext` (exec, readFile,
        writeFile, mkdir, readDir, writeNote, readNote). Five subcommands:
        `add` (create user dir + templates + gitignore), `save` (serialize →
        git note via `-F -` stdin piping), `load` (git note → deserialize,
        with ancestor walking up to 20 commits), `push`/`pull` (notes ref
        to/from remote). `UserSaveError` for empty directory. Summary
        formatters for save/load results. CLI wiring in `cli.ts` with real
        I/O adapters (spawn for stdin piping, execFile for reads). Identity
        resolution via `resolveIdentity()`. 7 integration tests: save/load
        round-trip, ancestor walking, null when no note, empty dir error,
        add with/without arc-in-git, gitignore entry.

    - [x] **7.3.d Implement `arc sync` sugar**

        Wired in `cli.ts` alongside user subcommand. `arc sync` = save +
        push. `arc sync --load` = pull + load. Reuses `runUserSave`,
        `runUserLoad`, `runUserPush`, `runUserPull` orchestrators. Push/pull
        integration tests deferred — require remote repo setup; covered by
        direct git notes verification in 7.3.c tests. Push/pull covered
        by end-to-end test: save → push → clone → pull → load → verify.

- [x] **7.4 Implement `arc log --atomic` subcommand**

    `src/commands/log.ts` — orchestrator (`runLogAtomic`) + formatter (`buildLogAtomicOutput`).
    Uses `git log --grep` with OR matching for two context footer patterns (companion file
    `atomic-{name}.md` and standalone `(atomic / no associated task list)`). Parses conventional
    commit subjects into type/scope/description. Wired as `arc log atomic` in `cli.ts`.

    - Filters: `--since`, `--author`, `--limit` passed to git; `--work-unit` post-filters
    - 9 unit tests (TDD, behaviors batched — tightly coupled parse+filter pipeline)

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

- [x] **7.9 Write integration tests for remaining Phase 7 gaps**

    Most unified-model integration coverage was written during Tasks 7.1–7.3 (init.test.ts,
    user.test.ts). This task covers the remaining gaps.

    - `log.test.ts` (6 tests): `arc log atomic` against real git repos — companion file
      footers, standalone footers, non-atomic exclusion, `--work-unit` filter, `--limit`,
      empty repo. Exercises end-to-end git log parsing with real commits.
    - `init.test.ts` (+2 tests): `completed-atomic` file absence in both pm.mode=none
      and pm.mode=arc-in-git. Join mode + arc-in-git ATOMIC-INBOX was already covered
      (line 558).

- [x] **7.10 Run quality gates**
    - Tier 3: markdown lint 0 errors (158 files), typecheck 0 errors, 303 tests pass
      (25 files), build succeeds

### **Phase 7.5:** Package Internal Organization

**Purpose:** Restructure `src/lib/` and `__tests__/` to maintain navigability as the module
count grows. Phase 7 adds the final batch of new modules — reorganize before Phase 8's E2E
suite adds more test files to a flat structure.

**Approach:** Domain-based subdirectories in `src/lib/`, mirrored in `__tests__/unit/`. Pure
refactor — no behavioral changes, no new features. All imports updated, all tests pass.

- [x] **7.5.a Reorganize `src/lib/` into domain subdirectories**

    Moved 11 modules into 3 domain subdirectories via `git mv`:
    `lib/git/` (git.ts, identity.ts, user-sync.ts), `lib/template/` (render.ts,
    recipe.ts, files.ts), `lib/manifest/` (manifest.ts, hash.ts, update-files.ts,
    merge.ts). Top-level: types.ts, errors.ts, paths.ts, version.ts, skills.ts.
    Updated all import paths across commands, cli.ts, and intra-lib references.

- [x] **7.5.b Mirror `src/lib/` structure in `__tests__/unit/`**

    Moved 11 test files into matching `unit/git/`, `unit/template/`, `unit/manifest/`
    subdirectories. Updated all import paths in moved tests, top-level tests,
    integration tests, and helpers. Fixed two relative path issues (recipe.test.ts
    `__dirname` for init-recipe.json, manifest.test.ts helpers import).
    303 tests pass, same count.

- [x] **7.5.c Clean up `__tests__/fixtures/` and `__tests__/helpers/`**

    Removed empty `fixtures/` directory (.gitkeep only). helpers/integration.ts
    import paths verified and updated for source moves.

- [x] **7.5.d Run Tier 2 quality gates**
    - Typecheck: zero errors. Tests: 303 pass (25 files). Lint: zero violations.
      Build: succeeds.

- [x] **7.5.e DRY/SOLID pass and barrel exports**

    Consolidated imports via barrel exports, fixed naming, extracted duplicated logic,
    and improved module responsibilities. Pure refactor — no behavioral changes.

    **Part 1 — Barrel exports, naming, and mechanical DRY fixes** (8be2ba3):

    - Renamed `git/git.ts` → `git/exec.ts`, `manifest/manifest.ts` → `manifest/store.ts`
    - Added `index.ts` barrel exports for `git/`, `template/`, `manifest/`
    - Consolidated imports across commands and cli.ts to use barrels
    - Extracted duplicate test helpers to `factories.ts` and `integration.ts`
    - Extracted `renderConfigOverrides()`, shared `buildConfigMap`/`buildTokenMap`,
      and `manifestMissingError()` factory

    **Part 2 — Structural improvements:**

    - Created `lib/constants.ts` — centralizes config paths, pm.mode key/values,
      and the `pm.mode == arc-in-git` condition string (was duplicated in init.ts
      and update.ts)
    - Added `ReadIO` and `CoreIO` base interfaces in `lib/types.ts` — command-specific
      IOContext interfaces now extend these (`IOContext extends CoreIO`,
      `StatusIOContext extends ReadIO`, `DiffIOContext extends ReadIO`,
      `UserIOContext extends CoreIO`, `SkillGenerationIO extends ReadIO`)
    - Extracted `runPostInitSetup()` in init.ts — deduplicates the identity storage,
      user directory creation, and notes refspec configuration shared by fresh/join modes
    - Split `skills.ts` (459 LOC) → `skills/resolution.ts` + `skills/generation.ts`
      with barrel `skills/index.ts`. Moved test to `__tests__/unit/skills/`
    - Extracted `listArcFiles()` from cli.ts into `lib/fs.ts` as shared utility

### **Phase 8:** E2E Tests, CI, and Verification

**Purpose:** Validate the complete CLI through end-to-end tests against the built `dist/cli.js`
artifact in real git repos, update CI for the hybrid project, then verify all success criteria.
Depends on non-interactive mode (5.4) for prompt-free CLI invocation.

**What E2E adds over integration tests:** Integration tests exercise `runInit()` etc. directly.
E2E tests invoke the built binary as a subprocess — verifying the build output works (shebang,
ESM resolution, bundled templates), Commander flag parsing maps to behavior, exit codes are
correct, and the full binary → command → library pipeline is wired end-to-end.

**What to skip:** Interactive prompt rendering (clack's concern), exhaustive flag permutations
(cover meaningful behavioral switches, not the cartesian product), dependencies' behavior
(Commander parsing, git merge-file algorithm).

**Workflow:** [`verify-work-unit.md`][verify-work-unit] — load and follow for tasks 8.4–8.5.

- [x] **8.1 E2E test infrastructure and CI**

    - [x] **8.1.a E2E test infrastructure**

        Separate vitest config approach: `vitest.e2e.config.ts` with `globalSetup` that
        builds via `npm run build`, keeping unit/integration runs build-free. Standalone
        E2E helpers (`helpers.ts`) with no source imports — `runArc()` invokes the built
        `dist/cli.js` artifact, `createTempRepo()` pre-sets `arc.identity` to avoid
        interactive prompt in `--yes` mode.

        - `__tests__/e2e/global-setup.ts` — builds CLI package once before E2E suite
        - `__tests__/e2e/helpers.ts` — `runArc(args, cwd)`, `createTempRepo()`,
          `cleanupTempDir()` (standalone, no source dependencies)
        - `vitest.e2e.config.ts` — 30s timeout, globalSetup, `passWithNoTests`
        - `vitest.config.ts` — added `exclude: ["__tests__/e2e/**"]`
        - Package scripts: `test` runs both configs sequentially, `test:e2e` added
        - Root `package.json`: `test:e2e` convenience script added

    - [x] **8.1.b Update CI workflow**

        Replaced stale `Documentation Quality CI` (markdown-only, referenced nonexistent
        `templates/` and `profiles/` directories) with two-job pipeline.

        - **quality** (all branches): `npm ci` → build → lint:md → typecheck → test:unit
        - **full-suite** (PRs to main only): `npm ci` → `npm test` (full suite with E2E)
        - Incidental: added `"arc/**"` to `.markdownlint-cli2.jsonc` ignores — root-level
          `arc/` build artifact was unexcluded (pre-existing gap)

- [x] **8.2 E2E test suite — core commands**

    - [x] **8.2.a Smoke tests** (`smoke.e2e.test.ts`)
        - `arc --version` → exits 0, outputs version matching package.json
        - `arc --help` → exits 0, lists available commands
        - `arc nonexistent` → exits non-zero

    - [x] **8.2.b Init E2E tests** (`init.e2e.test.ts`)
        - Fresh init with defaults, PM mode, tools, team mode, join mode, error paths
        - Installed markdown passes linting (markdownlint-cli2 against rendered `.arc/`)
        - Incidental fixes discovered during E2E testing:
            - **Recipe path resolution**: `cli.ts` used `new URL("../../init-recipe.json",
              import.meta.url)` which resolved incorrectly from bundled `dist/cli.js` — replaced
              with `getRecipePath()` using the existing `findPackageRoot()` approach from `paths.ts`
            - **Exit code on error**: `UserFacingError` catch blocks logged the error but returned
              without setting `process.exitCode = 1` — `update`/`status`/`diff`/`log` exited 0 on
              failure
            - **Conditional whitespace collapsing**: `renderConditionals()` left double blank lines
              when stripping false conditional blocks — added post-processing `\n{3,}` → `\n\n`
              collapse so template authors don't need to contort formatting around conditionals
            - **Template suffix alignment**: Three workflow files with `<!-- arc:if -->` conditionals
              lacked `.template` suffix — renamed `session-init.md`, `3_process-task-loop.md`,
              `02_define-project.md` to `.template.md`. Added `needsRendering()` gate so only
              `.template` files go through the render pipeline (aligns with strategy doc intent).
              Wrapped conditional link definitions in `02_define-project.template.md` to avoid
              MD053 unused-reference violations when conditions are false

    - [x] **8.2.c Update E2E tests** (`update.e2e.test.ts`)
        - Clean update: init → update → exits 0, reports "unchanged"
        - Customization preserved: modify DEV-RULES.PROJECT.md → update → custom section survives
        - Conflict handling: modify installed file + pristine (simulates old template) → update
          detects conflict, file contains `<<<<<<<`/`>>>>>>>` markers

    - [x] **8.2.d Status and diff E2E tests** (`status-diff.e2e.test.ts`)
        - Status after clean init: all unmodified, no modified/missing counts
        - Status after modification: reports modified file count
        - Diff with no changes: "No changes detected"
        - Diff after modification: shows file path and changed content

- [x] **8.3 E2E test suite — user and log commands**

    - [x] **8.3.a User command E2E tests** (`user.e2e.test.ts`)
        - `arc user add`: creates user directory with SESSION-NOTES.md; arc-in-git mode
          also creates ATOMIC-INBOX.md
        - Save/load round-trip: init → commit → save → delete user dir → load → files restored
        - Error: save without identity (isolated git config via HOME/GIT_CONFIG_NOSYSTEM
          override to prevent global user.name fallback) → exits non-zero
        - Full portability contract: init → commit → save → bare remote → push → clone →
          pull → load → SESSION-NOTES.md present in clone
        - Extended `runArc` helper with optional `env` parameter for git config isolation

    - [x] **8.3.b Log command E2E tests** (`log.e2e.test.ts`)
        - `arc log atomic` shows commits with `Context: atomic-*` and `(atomic / no associated
          task list)` footers; excludes non-atomic task commits
        - `--limit` restricts result count; `--work-unit` filters by companion file name
        - `--author` filters by committer; non-matching author returns empty result
        - `--since` with future date returns empty; past date includes commits
        - Empty result: no atomic commits → "No atomic task commits found"

    - [x] **8.3.c Lifecycle E2E test** (`lifecycle.e2e.test.ts`)
        - Golden path: init → verify key files → status clean → modify DEV-RULES.PROJECT.md →
          status shows modified → diff shows file and change content → update → customization
          preserved → status still shows modified (customized file correctly differs from pristine)
        - Corrected spec: "status clean after update" → "status still modified" — customized
          files remain different from pristine after update, which is correct behavior

- [x] **8.4 Run full quality gate suite (Tier 3)**
    - TypeScript strict mode: clean (`npm run typecheck`)
    - Full test suite: 307 unit/integration + 31 E2E = 338 tests, all pass
    - Build: clean (`npm run build`)
    - Markdown linting: 158 files, 0 errors (`npm run -s lint:md`)

- [x] **8.5 Validate success criteria against PRD**
    - All 8 success criteria verified — each maps to specific test coverage:
      init+linting (E2E), update preservation+conflicts (E2E), file inventory match
      (integration), lifecycle golden path (E2E), user portability contract (E2E),
      log atomic (E2E), quality gates (Tier 3), internal docs (Phase 1)
    - Atomic companion file (`atomic-cli-implementation.md`): all 6 items marked `[x]`
    - No gaps or deviations identified

---

## Success Criteria

- [x] `npx @arc-framework/cli init` produces a complete, working ARC installation that passes the
  framework's own markdown linting
- [x] `npx @arc-framework/cli@latest update` correctly preserves adopter customizations through
  three-way merge — auto-resolving non-overlapping changes, flagging real conflicts
- [x] Installed file set matches the authoritative inventory in `strategy-file-classification.md`
  for the selected PM mode and options
- [x] Beta is functional enough to install ARC in a real project and exercise the full
  init → work sessions → update cycle
- [x] `arc user save/load/push/pull` and `arc sync` complete the ADR-012/ADR-007 portability
  contract — the user directory (session notes, inbox, personal files) travels across machines
  and between developers via git notes
- [x] `arc log --atomic` provides browsable completion history for atomic/inbox work from commit
  records
- [x] All quality gates pass: TypeScript strict mode, vitest test suite, markdown linting on
  generated output
- [x] Internal project docs (DEV-RULES.PROJECT, QUICK-REFERENCE, TECHNICAL-OVERVIEW) reflect
  the hybrid code + documentation project reality

---

[verify-work-unit]: ../../../.arc/system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
