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

**Strategies:** `strategy-file-classification.md` (file inventory and classification data)

- [ ] **2.1 Write tests for template rendering**

    - [ ] **2.1.a Token substitution tests**
        - Test: single token replacement (`{{PROJECT_NAME}}` → `"My App"`)
        - Test: multiple tokens in one file
        - Test: token appears multiple times
        - Test: no tokens (passthrough)
        - Test: unknown token left as-is (or error — decide during implementation)
        - Expect tests to FAIL initially

    - [ ] **2.1.b Conditional content processing tests**
        - Test: `<!-- arc:if -->` / `<!-- arc:endif -->` section included when condition true
        - Test: section excluded when condition false
        - Test: nested conditionals (if needed)
        - Test: multiple conditions in one file
        - Test: file with no conditionals (passthrough)
        - Expect tests to FAIL initially

- [ ] **2.2 Implement template rendering (`src/lib/render.ts`)**
    - Token substitution engine
    - Conditional content processor
    - Combined render function (tokens + conditionals in one pass)
    - Tests should now PASS

- [ ] **2.3 Write tests for hash computation**
    - Test: SHA-256 of known content produces expected hash
    - Test: different content produces different hash
    - Test: same content produces same hash (deterministic)
    - Expect tests to FAIL initially

- [ ] **2.4 Implement hash computation (`src/lib/hash.ts`)**
    - SHA-256 of file contents using Node `crypto`
    - Tests should now PASS

- [ ] **2.5 Write tests for manifest I/O**

    - [ ] **2.5.a Schema validation tests**
        - Test: valid manifest passes validation
        - Test: missing required fields rejected
        - Test: invalid `classification` or `layer` values rejected
        - Expect tests to FAIL initially

    - [ ] **2.5.b Read/write tests**
        - Test: write manifest to disk, read back, compare
        - Test: read non-existent manifest returns appropriate error/null
        - Test: read malformed JSON reports clear error
        - Expect tests to FAIL initially

- [ ] **2.6 Implement manifest I/O (`src/lib/manifest.ts`)**
    - `Manifest`, `FileEntry`, `InstallConfig` types (in `types.ts`)
    - Read, write, validate functions
    - Tests should now PASS

- [ ] **2.7 Write tests for init recipe parsing**
    - Test: valid recipe parses correctly (prompts, conditions, file mappings)
    - Test: prompt types handled (text, select, multiselect)
    - Test: condition evaluation (equality check against config values)
    - Test: malformed recipe reports clear error
    - Expect tests to FAIL initially

- [ ] **2.8 Implement init recipe parsing (`src/lib/recipe.ts`)**
    - Recipe schema type, parser, condition evaluator
    - Tests should now PASS

- [ ] **2.9 Run quality gates**
    - Type checking passes
    - All unit tests pass
    - Markdown linting passes (if any docs were touched)

### **Phase 3:** Init Command

**Purpose:** Build the interactive init flow — from prompts through file rendering to a complete,
working ARC installation.

- [ ] **3.1 Implement git utility functions (`src/lib/git.ts`)**
    - Git availability check (exit with clear error if missing)
    - `git merge-file` wrapper (used by update, built now for shared access)
    - `git config` read/write (for merge driver setup, identity)
    - Status detection (is this a git repo?)

- [ ] **3.2 Implement file operations (`src/lib/files.ts`)**
    - Directory creation (recursive)
    - File copy with rendering (template → rendered output)
    - `.gitignore` entry management (append without duplicating)
    - `.gitattributes` entry management

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
        - Run prompts, collect config
        - Evaluate recipe conditions against config
        - Render template files (tokens + conditionals)
        - Write rendered files to install directory
        - Write `arc-config.yml` with collected settings

    - [ ] **3.5.b Pristine and manifest creation**
        - Copy rendered Framework and Configurable files to `.pristine/`
        - Compute `pristine_hash` for each file
        - Write `.arc-manifest.json` with version, config, file inventory

    - [ ] **3.5.c Git integration setup**
        - Add `.pristine/` and `SESSION-NOTES.md` paths to `.gitignore`
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

- [ ] **4.1 Write tests for three-way merge wrapper**
    - Test: non-overlapping changes auto-merge cleanly
    - Test: overlapping changes produce conflict markers
    - Test: unchanged file (pristine == current) takes new version cleanly
    - Test: file unchanged by framework (pristine == new) keeps adopter's version
    - Expect tests to FAIL initially

- [ ] **4.2 Implement merge wrapper (`src/lib/merge.ts`)**
    - Shell out to `git merge-file` via `child_process.execFile`
    - Parse exit code (0 = clean, 1 = conflicts, >1 = error)
    - Return merge result with conflict flag and content
    - Tests should now PASS

- [ ] **4.3 Implement update command (`src/commands/update.ts`)**

    - [ ] **4.3.a Core update flow**
        - Read manifest and `install_config`
        - Read new framework files from CLI's own `framework/` directory
        - Re-render templates with adopter's `install_config` (same tokens, fresh content)
        - For each managed file: three-way merge (pristine × new rendered × adopter's current)
        - Classify results: auto-merged, conflicted, skipped, new

    - [ ] **4.3.b Conflict reporting and pristine update**
        - Leave git conflict markers in conflicted files
        - Report which files need attention
        - Update pristine copies for cleanly merged files
        - Update manifest with new `framework_version`

    - [ ] **4.3.c New file handling**
        - Framework files: auto-add without prompting
        - Conditional files (depend on config choices): prompt adopter

- [ ] **4.4 Write integration tests for update flow**
    - Test: update with no adopter changes → all files take new version
    - Test: update with non-overlapping changes → auto-merge preserves both
    - Test: update with conflicting changes → conflict markers in file, reported
    - Test: Scaffolded files skipped entirely
    - Test: new framework file added during update
    - Test: manifest and pristine updated correctly post-merge

- [ ] **4.5 Run quality gates**
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

- [ ] **6.1 Write tests for skill generation**
    - Test: canonical skill → Claude Code output (correct path, `disable-model-invocation` frontmatter)
    - Test: canonical skill → Codex output (`.agents/skills/` path, `openai.yaml` supplemental)
    - Test: canonical skill → Windsurf output (`.windsurf/skills/` path, no `.agents/`)
    - Test: multiple agents selected → correct output set for each
    - Test: `{{ARC_DIR}}` in skill instructions rendered with configured path
    - Expect tests to FAIL initially

- [ ] **6.2 Implement skill generation (`src/lib/skills.ts`)**
    - Read canonical skills from `framework/system/skills/`
    - Generate per-tool output with correct paths, frontmatter, supplemental files
    - Handle all 6 agent tools (Claude, Codex, Gemini, Copilot, Cursor, Windsurf)
    - Tests should now PASS

- [ ] **6.3 Integrate with init and update**
    - Init: generate skill files based on agent selection
    - Update: regenerate when canonical skill definitions change (compare hashes)
    - Track generated skill files in manifest

- [ ] **6.4 Write integration tests for skill generation**
    - Test: init with Claude selected → `.claude/skills/` populated correctly
    - Test: init with multiple agents → all agent directories populated
    - Test: update with changed skill → regenerated files reflect changes

- [ ] **6.5 Run quality gates**
    - Type checking passes
    - All tests pass
    - Markdown linting passes

### **Phase 7:** PM Mode, Team Mode, and Configurable Install Directory

**Purpose:** Layer in mode-dependent behavior (PM mode, team mode, install directory) and session
state portability (git notes setup, `arc session` subcommand, methodology doc integration).

- [ ] **7.1 Implement PM mode conditional file handling**

    - [ ] **7.1.a Init: mode-aware file installation**
        - `pm.mode: none` / `external` → install Core files only
        - `pm.mode: arc-in-git` → install Core + arc-in-git files (backlog templates, ROADMAP,
          PROJECT-STATUS, ATOMIC-TASKS, strategy-backlog-organization)
        - Manifest tracks per-file `layer` membership

    - [ ] **7.1.b Update: mode-aware file management**
        - Skip files from uninstalled modes (check manifest `layer` vs. `install_config.pm_mode`)
        - Handle mode-conditional content within shared files (conditional sections)

- [ ] **7.2 Implement team mode support**

    - [ ] **7.2.a Init: team directory and config**
        - Install `team/` directory structure when team mode selected
        - Set `team.mode: team` in `arc-config.yml`
        - Configure per-developer session paths in `.gitignore`
        - Prompt for initial developer name, run `git config arc.session.identity`

    - [ ] **7.2.b Identity resolution utility**
        - Lookup sequence: `arc.session.identity` → `user.name` → prompt
        - Used by init (team setup) and available for session workflows

- [ ] **7.3 Implement session state portability setup in init**
    - Add `session.notes_push` setting to `arc-config.yml` output (`always` for solo, `prompt`
      for team)
    - Configure notes fetch refspec on init:
      `git config --add remote.origin.fetch "+refs/notes/arc/session/*:refs/notes/arc/session/*"`
    - Uses identity resolution from 7.2.b for the per-developer namespace key

- [ ] **7.4 Implement `arc session` subcommand**

    - [ ] **7.4.a Session save and load**
        - `arc session save` — write SESSION-NOTES.md content to git note on HEAD
          (`git notes --ref=arc/session/{identity} add -f -F {path} HEAD`)
        - `arc session load` — restore SESSION-NOTES.md from git note on HEAD; if no note on
          HEAD, walk recent ancestors (ADR-007 § Part 4)
        - Identity resolved via identity resolution utility (7.2.b)
        - Clear messaging: what was saved/loaded, which commit, which identity namespace

    - [ ] **7.4.b Session push and pull**
        - `arc session push` — push notes ref to remote
          (`git push origin refs/notes/arc/session/{identity}`)
        - `arc session pull` — fetch notes ref from remote
          (`git fetch origin refs/notes/arc/session/{identity}:refs/notes/arc/session/{identity}`)
        - Error handling: remote not configured, push rejected, auth failure

    - [ ] **7.4.c Write tests for session subcommand**
        - Test: save writes note to HEAD, load restores it
        - Test: load walks ancestors when HEAD has no note
        - Test: identity resolution fallback chain
        - Test: push/pull interact with remote refs correctly (integration-level)
        - Test: clear error when no SESSION-NOTES.md exists (save) or no note found (load)

- [ ] **7.5 Integrate session portability into ARC methodology docs**

    - [ ] **7.5.a Update session lifecycle workflows**
        - `session-init.md`: add notes loading step — when SESSION-NOTES.md is missing or stale,
          check git notes on HEAD (then walk ancestors); populate and announce provenance
        - `session-handoff.md`: add notes save step — after writing SESSION-NOTES.md, save to
          git notes; push per `session.notes_push` config

    - [ ] **7.5.b Update session management strategy**
        - `strategy-session-management.md`: add portability section — why session context needs
          to travel, the git notes mechanism, multi-machine and team handoff scenarios
        - Reference ADR-007 for design rationale without duplicating it

    - [ ] **7.5.c Update QUICK-REFERENCE template and arc-methods**
        - QUICK-REFERENCE template (`.arc/reference/QUICK-REFERENCE.template.md`): add
          `arc session` command patterns (save, load, push, pull)
        - `arc-methods.md` § session-state: reference notes operations as part of the
          session-state method

- [ ] **7.6 Implement configurable install directory**
    - `{{ARC_DIR}}` token processing throughout template rendering
    - Init prompt with `.arc/` default
    - All cross-references in rendered files use configured path
    - Skill instructions render with correct base path
    - Manifest and pristine paths use configured directory

- [ ] **7.7 Write integration tests for mode variations**
    - Test: init with `pm.mode: none` → no backlog files installed
    - Test: init with `pm.mode: arc-in-git` → backlog files present
    - Test: init with team mode → `team/` directory created, config set
    - Test: init with custom install dir → all files under custom path, cross-references correct
    - Test: update respects PM mode (skips arc-in-git files when mode is none)

- [ ] **7.8 Run quality gates**
    - Type checking passes
    - All tests pass
    - Markdown linting passes

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
- [ ] `arc session save/load/push/pull` complete the ADR-007 session portability contract —
  session context travels across machines and between developers via git notes
- [ ] All quality gates pass: TypeScript strict mode, vitest test suite, markdown linting on
  generated output
- [ ] Internal project docs (DEV-RULES.PROJECT, QUICK-REFERENCE, TECHNICAL-OVERVIEW) reflect
  the hybrid code + documentation project reality

---

[verify-work-unit]: ../../../.arc/system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
