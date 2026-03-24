# Task List: Beta Readiness

**PRD:** `.arc/active/feature/prd-beta-readiness.md`
**Created:** 2026-03-23
**Branch(es):** `feature/beta-readiness`
**Base Branch:** `main`
**Status:** In Progress

## Overview

**Purpose:** Migrate the dev repo to a real ARC installation, implement contributor support with
`arc join`, ship a docs site with foundation content, and publish an npm beta — preparing the
framework for real-world beta testing.

## Scope

### Will Do

- Promote `packages/arc-framework/arc/` to authoritative content source
- Migrate dev repo from dual-directory (`.arc/` + `.arc-internal/`) to single `.arc/`
- Create `arc join` CLI command with role selection
- Implement contributor role across hooks, session workflows, and documents
- Ship docs site with 5 foundation pages and stub infrastructure
- Repo rename, README update, npm beta publish
- Hook manager detection and integration (P1)

### Won't Do

- Docs site deep content (tutorials, examples, comparison pages, config reference)
- Full README rewrite (adoption-focused positioning)
- Community infrastructure beyond CONTRIBUTING.md
- Release automation
- npm 1.0.0

---

## Tasks

### **Phase 1:** Content Source Promotion

**Purpose:** Make `packages/arc-framework/arc/` the authoritative source for framework content,
eliminating the fragile cpSync build step.

- [x] **1.1 Sync `.arc/` content into `packages/arc-framework/arc/`**

    **Goal:** Resolve known drift so the package directory matches the current `.arc/` state.

    - [x] **1.1.a Diff `.arc/` against `packages/arc-framework/arc/` and catalog divergences**
        - 1 content divergence: `integrate-work-unit.md` missing section 6b (Completion Metadata Freshness Check)
        - 3 stale rendered artifacts (non-template duplicates alongside `.template.md` counterparts):
          `3_process-task-loop.md`, `02_define-project.md`, `session-init.md`
        - 1 orphaned package-only file: `ARC-AGENTS.template.md` (not in init recipe, unreferenced — preserved)
        - 0 files only in `.arc/`

    - [x] **1.1.b Copy `.arc/` content into `packages/arc-framework/arc/`**
        - Overwrote `integrate-work-unit.md` with canonical `.arc/` version
        - Removed 3 stale rendered artifacts
        - Deleted deprecated `ARC-AGENTS.template.md` (predecessor to AGENT-BRIEFING split, unreferenced)
        - Post-sync diff confirms full parity between `.arc/` and `packages/arc-framework/arc/`

- [x] **1.2 Remove cpSync from build script**
    - Simplified `build` script to `"tsup"` — removed inline cpSync one-liner
    - Build verified: tsup succeeds, output unchanged

- [x] **1.3 Verify CLI works with promoted source**
    - Full test suite passes (327 unit/integration + 31 E2E = 358 tests)
    - `arc init --yes` verified in temp directory — scaffolds correctly with `.gitkeep` structure
    - `paths.ts` and `package.json` `files` field need no changes
    - `init-recipe.json` updated: added 6 `.gitkeep` files for `active/` and `archive/` subdirectories
      (feature, technical, incidental) — scaffolds directory structure for adopters
    - `classification.ts` updated: `.gitkeep` files classified as Scaffolded (adopter-owned, no pristine)
    - Incidental fix: `--yes` mode wasn't fully non-interactive — identity resolution always prompted
      via clack regardless of flag. Fixed in `cli.ts` to omit prompt adapter in `--yes` mode, falling
      back to `user.name` slugification. CI/TTY auto-detection deferred to backlog.

### **Phase 2:** Self-Hosting Migration

**Purpose:** Convert the dev repo from the dual-directory workaround to a real ARC installation.
This is the highest-risk phase — take it step by step with verification between major moves.

**Strategies:** `strategy-file-classification.md` (merge strategies for migrated files)

- [x] **2.1 Pre-migration artifact cleanup**

    **Goal:** Tidy `.arc-internal/` before migration so we don't carry dead weight into `.arc/`.

    - [x] **2.1.a Audit `.arc-internal/backlog/` and `.arc-internal/active/`**
        - Backlog clean: 5 files, all current (ROADMAP, both backlogs, 2 plan docs)
        - Active clean: 3 WU4 files + WORK-STATUS, all current
        - No superseded plans or dead notes found — nothing to delete

    - [x] **2.1.b Audit `.arc-internal/reference/research/`**
        - 12 research files audited: 6 fully absorbed into strategies, 2 broad reference,
          4 still informing active work
        - Decision: keep all for now — extract before going public (WU5)
        - Documented extraction candidates in `plan-wu5-public-release.md` §
          Pre-Public Extraction Candidates

- [x] **2.2 Remove old `.arc/` directory**

    **Goal:** Clear the old template-source `.arc/` so `arc init` can create a fresh installation.

    - Verified full parity with `packages/arc-framework/arc/` (Task 1.1)
    - Removed via `git rm -r .arc/` — staged, not yet committed (will commit with init)

- [x] **2.3 Relocate manifest and pristine storage to `.arc/system/.internal/`**

    **Goal:** Move framework bookkeeping out of repo root and eliminate the `.pristine/` directory
    that clutters the adopter's `.arc/` workspace. Both files move to `.arc/system/.internal/` —
    a clearly-named subdirectory within the infrastructure area, invisible to daily workspace use.

    - [x] **2.3.a Refactor init to write `.arc/system/.internal/`**
        - `manifest.json` replaces `.arc-manifest.json` at repo root
        - `pristine.json` replaces `.arc/.pristine/` directory tree — single JSON file
          keyed by output-relative path
        - `.gitignore` entry: `.arc/system/.internal/pristine.json`
        - Added path constants to `constants.ts` (DRY across all commands)

    - [x] **2.3.b Refactor update to read from `.arc/system/.internal/`**
        - Pristine loaded as JSON object, entries accessed by key instead of file reads
        - Updated pristine written back as JSON at end (single write vs. per-file writes)
        - Removed files excluded from new store by not carrying forward (no delete needed)

    - [x] **2.3.c Refactor status and diff commands**
        - Status reads manifest from new `.internal/` location
        - Diff reads pristine from JSON store, writes temp files for `git diff --no-index`
        - `fs.ts` skip pattern updated from `.pristine` to `system/.internal`

    - [x] **2.3.d Update tests and verify full suite**
        - Added DRY helpers to integration test helper: `manifestPath()`, `pristineStorePath()`,
          `readManifestFile()`, `readPristineStore()`, `writePristineStore()`
        - Updated all 11 test files with path references
        - All 358 tests pass (327 unit/integration + 31 E2E)

- [x] **2.4 Run `arc init` on the dev repo**

    **Goal:** Create a real `.arc/` installation from the authoritative `packages/arc-framework/arc/`
    source, using the new `.internal/` storage layout.

    - Init run manually with project settings (`branch.protection: full`, `pm.mode: arc-in-git`)
    - Verified: `.arc/` created with full structure, manifest + pristine in `.internal/`,
      hooks configured via `core.hooksPath`
    - `/arc-verify` run post-init — exposed three bugs, all fixed:
        - Init didn't set executable permissions on hooks/scripts (`fs.writeFile` ignores source
          perms). Added `chmod` to `IOContext`, init now sets 755 on `githooks/*` and `*.sh`
        - `verify-integrity.sh` checked old `.arc-manifest.json` path instead of
          `.arc/system/.internal/manifest.json` — updated authoritative + local copies
        - Test scaffolding commits rejected by now-functional hooks — test helpers bypass via
          `git -c core.hooksPath=/dev/null`
    - New integration test verifies executable permissions on all 5 hook/script files
    - All 359 tests pass (328 unit/integration + 31 E2E)

- [x] **2.5 Migrate `.arc-internal/` content into `.arc/`**

    **Goal:** Move all project-specific content from the internal directory to the real installation.

    - [x] **2.5.a Migrate reference content (constitutional + session-loaded docs)**
        - Ran `/arc-setup` → `02_define-project.md` workflow, adapting internal content into
          canonical skeleton structure (skeleton wins, content adapts)
        - All 7 project definition docs migrated: META-PRD, TECHNICAL-OVERVIEW,
          AGENT-BRIEFING.PROJECT, QUICK-REFERENCE, DEV-RULES.PROJECT, ROADMAP, PROJECT-STATUS
        - Template suffix sweep: 4 stale `.template` references removed from user-facing docs
          (`02_define-project`, `README.md`, `DEV-RULES.PROJECT`, `agent/README.md`)
        - Remaining reference content (strategies, ADRs, archive, research) still to migrate

    - [x] **2.5.b Migrate active work and backlog**
        - Active: task list, PRD, and atomic companion copied to `.arc/active/feature/`
        - Backlog: BACKLOG-FEATURE and BACKLOG-TECHNICAL adapted to canonical skeleton
          structure (priority-based sections); plan docs copied as-is
        - WORK-STATUS replaced with real project state (task list path updated to `.arc/`)
        - Task list PRD reference updated from `.arc-internal/` to `.arc/`
        - ROADMAP already migrated in 2.5.a

    - [x] **2.5.c Migrate agent and user content**
        - CLAUDE.ARC.md and CODEX.ARC.md merged into skeleton structure (inline links,
          project-specific notes replacing placeholder comments)
        - AGENT-BRIEFING docs already migrated in 2.5.a
        - `user/` already populated by init with skeleton templates; internal versions
          had no project-specific content to migrate

    - [x] **2.5.d Evaluate `system/workflows/project/`**
        - One file: `agent-pre-merge-review.md` (CodeRabbit workflow) — copied as-is
        - Project-specific workflow, not ARC adopter content

- [ ] **2.6 Migrate hooks**

    **Goal:** Replace dual-path internal hooks with clean single-directory hooks based on the
    template versions.

    - [ ] **2.6.a Review framework-specific hook checks**
        - CHECK 10 (public/internal boundary enforcement) → confirm it dissolves post-migration
        - CHECK 11 (framework-owned file protection) → decide: dissolve or transform into
          contributor-aware protection (Phase 4 may subsume this)
        - CHECK 8 (`packages/arc-framework/` exclusion) → evaluate whether still needed
        - Document decisions for each check

    - [ ] **2.6.b Install template hooks as the active hooks**
        - The init-generated `.arc/system/githooks/` should have the template hooks
        - Verify `core.hooksPath` points to `.arc/system/githooks/`
        - Simplify any remaining dual-path regex patterns to single `.arc/` paths

- [ ] **2.7 Update all `.arc-internal/` references**

    **Goal:** Eliminate every reference to the deleted directory across the repo.

    - [ ] **2.7.a Update session-init workflow paths**
        - `.arc-internal/` paths in session-init template → `.arc/` paths
        - Update any hardcoded paths in workflow documents

    - [ ] **2.7.b Update CLAUDE.md and skill files**
        - `.claude/` directory skill definitions reference `.arc-internal/` paths
        - Update to `.arc/` equivalents

    - [ ] **2.7.c Update `.gitignore`, CI config, README**
        - `.gitignore`: `.arc-internal/user/` → `.arc/user/`
        - `.github/workflows/ci.yml`: any `.arc-internal/` lint paths or references
        - `README.md`: repo structure description

- [ ] **2.8 Delete `.arc-internal/` and verify end-to-end**

    - [ ] **2.8.a Delete `.arc-internal/`**
        - `git rm -r .arc-internal/`
        - Confirm no remaining references via grep

    - [ ] **2.8.b Post-migration verification**
        - Session init: loads correctly from `.arc/` paths
        - Quality gates: `npm run -s lint:md`, `npm run typecheck`, `npm test`, `npm run build`
        - Hooks: test a commit — pre-commit and commit-msg both fire correctly
        - `arc update` dry run: no errors against the new `.arc/` installation

### **Phase 3:** `arc join` Command

**Purpose:** Create a dedicated CLI command for developers joining an existing ARC project, with
role selection (maintainer vs. contributor).

**Strategies:** `strategy-testing-methodology.md`

- [ ] **3.1 Extract shared setup logic from `init.ts`**

    **Goal:** Identity resolution, hook configuration, user directory creation, and skill generation
    are needed by both `init` and `join` — extract into a shared module.

    - [ ] **3.1.a Create `src/lib/setup.ts`**
        - Extract `resolveIdentity()`, hook configuration, user directory setup, skill generation
        - Ensure `init.ts` still works by importing from the shared module
        - Run existing tests to confirm no regressions

    - [ ] **3.1.b Run quality gates**
        - `npm run typecheck`, `npm run test:unit`

- [ ] **3.2 Create `arc join` command**

    - [ ] **3.2.a Create `src/commands/join.ts`**

        Build `test-first` (one behavior at a time):
        - Errors when `.arc/` doesn't exist (suggests `arc init`)
        - Prompts for role selection (Team member → maintainer, Contributor → contributor)
        - Prompts for tool selection (reuse existing tool prompt logic)
        - Sets `git config --local arc.role`
        - Sets `git config --local arc.identity`
        - Configures hooks via shared setup
        - Creates `user/{identity}/` directory with templates
        - Generates per-tool skills

    - [ ] **3.2.b Register `join` in `cli.ts`**
        - Add `join` subcommand with `--contributor` and `--yes` flags
        - Add `--tools` flag for non-interactive tool selection

- [ ] **3.3 Update `arc init` to detect existing installations**

    Build `test-first` (one behavior at a time):
    - When `.arc/system/arc-config.yml` exists, suggests `arc join` instead of proceeding
    - `--force` flag bypasses the detection and re-initializes

- [ ] **3.4 Non-interactive `arc join` mode**

    Build `test-first` (one behavior at a time):
    - `arc join --contributor --yes` sets role=contributor with defaults
    - `arc join --yes --tools claude,cursor` sets role=maintainer with specified tools
    - `arc join --contributor --yes --tools claude` combines role and tools

### **Phase 4:** Contributor Role Support

**Purpose:** Implement role-aware behavior across hooks, session workflows, and framework
documents so contributors get a streamlined experience.

- [ ] **4.1 Role-aware hooks**

    - [ ] **4.1.a Update pre-commit hook**
        - Add `arc_role=$(git config arc.role || echo "maintainer")` at top
        - Skip task numbering check (CHECK for `hooks.task_numbering`) when role=contributor
        - Add new check: protected file warning when contributor stages `active/` or `backlog/`
          files — warn with explanation, allow proceed (not hard block)
        - Test both paths: maintainer commit, contributor commit

    - [ ] **4.1.b Update commit-msg hook**
        - Add `arc_role=$(git config arc.role || echo "maintainer")` at top
        - Accept `Context: contribution (...)` format when role=contributor (alongside existing
          task list and categorical patterns)
        - Skip WORK-STATUS freshness check when role=contributor
        - Test both paths: maintainer commit with task context, contributor commit with
          contribution context

- [ ] **4.2 Session workflow branching**

    - [ ] **4.2.a Update `session-init.template.md`**
        - Add role check early in Step 2 (after identity resolution)
        - When `arc.role = contributor`: skip items 8–11 (WORK-STATUS, SESSION-NOTES planning
          sections, task list, task execution workflow)
        - Load `AGENT-BRIEFING.CONTRIBUTOR.md` instead
        - Check `user/{identity}/WORK-STATUS.md` for optional local planning state
        - Skip next work unit discovery (Step 5)
        - Update orientation output format for contributor sessions

    - [ ] **4.2.b Update `session-handoff.md`**
        - When `arc.role = contributor`: skip project-level WORK-STATUS.md update
        - Skip conditional commit sections that reference task completion
        - SESSION-NOTES.md update remains (role-agnostic)

- [ ] **4.3 Create framework documents**

    - [ ] **4.3.a Create `AGENT-BRIEFING.CONTRIBUTOR.md`**
        - Framework-owned, lives in `packages/arc-framework/arc/system/agent/`
        - Content: do not modify `active/` or `backlog/` files, use `Context: contribution (...)`
          footer, local planning in `user/{identity}/` if desired, quality gates apply in full
        - Reference-style links to DEV-RULES and QUICK-REFERENCE
        - Add to `init-recipe.json` include list (always included, loaded conditionally at runtime)

    - [ ] **4.3.b Create `CONTRIBUTING.template.md`**
        - Project-customizable template in `packages/arc-framework/arc/`
        - Content: contributor setup via `arc join`, quality gate commands, maintainer-managed
          file boundaries, PR conventions
        - Add to `init-recipe.json` include list
        - Scaffold into dev repo's `.arc/` as part of this phase

- [ ] **4.4 Update methods and rules**

    - [ ] **4.4.a Update `arc-methods.md` → `commit-context-format`**
        - Add `Context: contribution (...)` pattern in new "With contributor role" subsection
        - Examples: `Context: contribution (fix typo in README)`,
          `Context: contribution (implement feature per issue #42)`

    - [ ] **4.4.b Update `DEV-RULES.ARC.md` § Commit Discipline**
        - Add note to "Work status accuracy" bullet: contributor role overrides this rule
          (contributors do not update project-level WORK-STATUS.md, per
          `AGENT-BRIEFING.CONTRIBUTOR.md`)

    - [ ] **4.4.c Run quality gates**
        - `npm run -s lint:md` (documentation changes), `npm run typecheck`, `npm test`

### **Phase 5:** Docs Site

**Purpose:** Ship a docs site with foundation content covering what ARC is and how to get started,
plus stub infrastructure for WU5 expansion.

- [ ] **5.1 Refresh `README-ASPIRATIONAL.md`**

    **Goal:** Bring the aspirational README current before using it as source material.

    - Remove `[PLACEHOLDER]` markers
    - Update CLI references to actual commands (`arc init`, `arc join`, `arc-resume`, `arc-handoff`)
    - Verify directory tour matches post-migration structure (single `.arc/`)
    - Tighten narrative based on what ARC actually is now
    - This is a content refresh, not a full rewrite — philosophy, tradeoffs, core loop are stable

- [ ] **5.2 Set up MkDocs infrastructure**

    - [ ] **5.2.a Create `mkdocs.yml`**
        - Material theme, site name ("ARC Framework"), repo URL
        - Full nav tree covering foundation and stub pages
        - Search enabled, color scheme configuration

    - [ ] **5.2.b Create `docs/` directory structure**
        - Subdirectories as needed for nav organization
        - All page files (foundation + stubs) created in this step

    - [ ] **5.2.c Add `site/` to `.gitignore`**

- [ ] **5.3 Write foundation pages**

    - [ ] **5.3.a Landing / Index page**
        - Adapted from refreshed `README-ASPIRATIONAL.md`
        - What ARC is, core development loop, design principles, honest tradeoffs
        - Light editing for docs-site voice (not a copy-paste)

    - [ ] **5.3.b Philosophy page**
        - Adapted from `strategy-core-philosophy.md`
        - P1–P11 with rationale, research citations, positioning
        - Restructure for docs-site readability (the strategy doc is reference-dense)

    - [ ] **5.3.c Getting Started page**
        - Install via `npx @arc-framework/cli init`
        - First session walkthrough (`arc-resume` → work → `arc-handoff`)
        - What happened: directory tour of `.arc/`
        - Depends on migration and CLI changes being complete

    - [ ] **5.3.d Sessions page**
        - Adapted from `strategy-session-management.md`
        - Why focused sessions, context degradation evidence, how sessions work
        - Natural session boundaries

    - [ ] **5.3.e Work Planning page**
        - Adapted from `strategy-work-planning.md`
        - Planning pipeline (idea → plan → PRD → tasks)
        - How tasks work, quality gates concept

- [ ] **5.4 Create stub pages**
    - Configuration Reference, Quality Gates, Team Coordination, Contributing to ARC,
      Comparison/Positioning, Tutorials
    - Each stub: brief description of what the page will cover, "detailed content coming in a
      future release" note

- [ ] **5.5 Set up docs deployment**

    - [ ] **5.5.a Create GitHub Action for docs**
        - Trigger: push to main
        - Steps: setup Python, install mkdocs-material, `mkdocs build`, deploy to GitHub Pages
        - Separate workflow file or new job in existing `ci.yml`

    - [ ] **5.5.b Verify deployment**
        - Push to main triggers build
        - Site accessible at GitHub Pages URL
        - Navigation, search, and all pages render correctly

- [ ] **5.6 Run quality gates**
    - `npm run -s lint:md` (new markdown files in `docs/`)
    - Verify mkdocs builds without errors locally (`mkdocs build`)

### **Phase 6:** Public Scaffolding + Hook Manager Integration

**Purpose:** Establish public presence and implement hook manager detection (P1).

- [ ] **6.1 Repo rename**
    - Rename `arc-agentic-dev-framework` → `arc-framework` on GitHub
    - Update all references: package.json repository field, GitHub Action URLs, any hardcoded
      repo name references
    - Verify: clone URL works, GitHub redirect from old name works, CI passes

- [ ] **6.2 README update**
    - Replace current development README with minimal public version
    - Content: what ARC is (one paragraph), current status (beta), install command, link to
      docs site, link to CONTRIBUTING.md
    - Not a full adoption-focused rewrite (WU5)

- [ ] **6.3 npm beta publish**

    - [ ] **6.3.a Prepare package for publish**
        - Update version to `0.1.0` (or appropriate beta version) in `package.json`
        - Verify `npm pack` includes correct files (`dist/`, `arc/`, `templates/`,
          `init-recipe.json`)
        - Verify `package.json` metadata (description, keywords, repository, license)

    - [ ] **6.3.b Publish and verify**
        - `npm publish` to registry
        - Verify `npx @arc-framework/cli init` works in a clean environment
        - Verify `npx @arc-framework/cli join` works in a project with `.arc/`

- [ ] **6.4 Hook manager detection and integration (P1)**

    - [ ] **6.4.a Create hook manager detection module**

        Build `test-first` (one behavior at a time):
        - Detects husky (`.husky/` directory)
        - Detects lefthook (`lefthook.yml` or `lefthook.yaml`)
        - Detects pre-commit (`.pre-commit-config.yaml`)
        - Returns `null` when no manager found

    - [ ] **6.4.b Integrate detection into `arc init` and `arc join`**

        Build `test-first` (one behavior at a time):
        - When hook manager detected, adds ARC hook calls to manager config instead of
          `core.hooksPath`
        - When no manager detected, falls back to `core.hooksPath` (current behavior)
        - Husky integration: adds to `.husky/pre-commit` and `.husky/commit-msg`
        - Lefthook integration: adds to `lefthook.yml`

    - [ ] **6.4.c Adopt husky in dev repo (P1)**
        - Install husky as dev dependency
        - Configure `.husky/` hooks to call ARC hook scripts
        - Verify hooks fire correctly through husky
        - This validates the integration path for adopters

- [ ] **6.5 Run quality gates**
    - Full Tier 2: `npm run -s lint:md`, `npm run typecheck`, `npm test`

### **Phase 7:** Verification

**Workflow:** [`verify-work-unit.md`][verify-work-unit] — load and follow for this phase.

- [ ] **7.1 Run Tier 3 quality gates** — begin [`verify-work-unit.md`][verify-work-unit]
- [ ] **7.2 Validate success criteria against PRD**
- [ ] **7.3 Verify all atomic tasks resolved** (`atomic-beta-readiness.md`)

---

## Success Criteria

- [ ] Dev repo uses a single `.arc/` directory — no `.arc-internal/` exists
- [ ] `packages/arc-framework/arc/` is the authoritative content source (no cpSync build step)
- [ ] Session init loads correctly from `.arc/` paths
- [ ] All quality gates pass (lint, typecheck, test, build — zero violations)
- [ ] Hooks validate commits correctly against single `.arc/` structure
- [ ] `arc join` prompts for role and tools, sets `arc.role` and `arc.identity` in git config
- [ ] `arc join --contributor --yes` works non-interactively
- [ ] Contributor session init skips planning state and loads contributor briefing
- [ ] Contributor hooks accept `Context: contribution (...)` and warn on protected files
- [ ] Docs site is live at GitHub Pages URL with 5 foundation pages rendering correctly
- [ ] Stub pages present with placeholder text and full nav structure
- [ ] npm beta package installs cleanly and `arc init` / `arc join` work in clean environment
- [ ] Repo renamed to `arc-framework`
- [ ] Ready for multi-week beta test on external project

---

[verify-work-unit]: ../../../.arc/system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
