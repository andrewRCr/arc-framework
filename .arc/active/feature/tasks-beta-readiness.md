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

- [x] **2.6 Migrate hooks**

    **Goal:** Replace dual-path internal hooks with clean single-directory hooks based on the
    template versions.

    - [x] **2.6.a Review framework-specific hook checks**
        - CHECK 10 (public/internal boundary enforcement): **dissolve** — boundary disappears
          when `.arc-internal/` is deleted; the rule it enforces becomes moot
        - CHECK 11 (framework-owned file protection): **dissolve** — noise for framework authors;
          Phase 4 already plans contributor-aware file protection (Task 4 hooks line)
        - CHECK 8 (`packages/arc-framework/` exclusion): **no action** — active template hooks
          already exclude this path correctly (line 212 in pre-commit)

    - [x] **2.6.b Install template hooks as the active hooks**
        - Verified: `core.hooksPath` already points to `.arc/system/githooks/`
        - Active hooks are init-generated template versions — no dual-path patterns present
        - commit-msg: identical to template, no changes needed
        - pre-commit: one legitimate project-specific addition — CHECK 8 excludes
          `packages/arc-framework/` (framework source legitimately contains `.arc/` refs;
          adopters don't have this directory so the template omits it)

- [x] **2.7 Update all `.arc-internal/` references**

    **Goal:** Eliminate every reference to the deleted directory across the repo.

    Audit found: `.claude/` and `.github/` already clean. Actual references are in
    config files, `.gemini/`, `.arc/` docs, and README.

    - [x] **2.7.a Config and tooling files**
        - `.gitignore`: removed `.arc-internal/user/*/` line (`.arc/user/` already covered)
        - `.markdownlint-cli2.jsonc`: removed `.arc-internal/reference/archive/**` exclusion
        - Deleted `.gemini/` directory entirely (unused)

    - [x] **2.7.b Project docs and README**
        - `README.md`: replaced `.arc-internal/` with `packages/arc-framework/` in repo structure
        - `DEV-RULES.PROJECT.md`: removed "No internal references in public docs" rule
          (boundary no longer exists)

    - [x] **2.7.c Backlog references**
        - `plan-wu5-public-release.md`: updated `.arc-internal/reference/research/` → `.arc/`
        - `BACKLOG-TECHNICAL.md`: updated two `.arc-internal/reference/archive/` → `.arc/`

    Remaining `.arc-internal` mentions are historical context only (PRD rationale,
    task list descriptions, WORK-STATUS last-completed) — no live path references.

- [x] **2.8 Delete `.arc-internal/` and verify end-to-end**

    - [x] **2.8.a Delete `.arc-internal/`**
        - `git rm -r .arc-internal/` — 87 files removed
        - Confirmed: no remaining actionable references (3 historical mentions in
          PRD, task list, WORK-STATUS are narrative context only)

    - [x] **2.8.b Post-migration verification**
        - Markdown lint: 0 errors across 105 files
        - TypeScript: clean
        - Tests: 360 pass (329 unit/integration + 31 E2E)
        - Build: succeeds
        - Hooks verified via commit (2.8.a gates on pre-commit + commit-msg)

### **Phase 3:** `arc join` Command

**Purpose:** Create a dedicated CLI command for developers joining an existing ARC project, with
role selection (maintainer vs. contributor).

**Strategies:** `strategy-testing-methodology.md`

- [x] **3.1 Extract shared setup logic from `init.ts`**

    **Goal:** The git integration sequence and post-init user setup are needed by both `init`
    and the new `join` command — extract into shared modules so `join.ts` can reuse them.

    **Note:** `resolveIdentity()` (in `lib/git/identity.ts`) and skill generation (in
    `lib/skills/`) are already shared modules — no extraction needed for those.

    - [x] **3.1.a Generalize `writeArcGitignoreBlock` → `writeArcManagedBlock`**
        - Extracted generic `writeArcManagedBlock()` in `src/lib/template/files.ts`
        - `writeArcGitignoreBlock` and `writeArcGitattributesBlock` delegate to it
        - Deleted `appendToGitattributes`, `appendToGitignore`, `appendLineIfMissing`,
          and pre-release legacy migration logic (no adopters to migrate)
        - Updated exports in `src/lib/template/index.ts`
        - 6 unit tests for `writeArcManagedBlock` + 1 delegation test for
          `writeArcGitattributesBlock`; removed 4 obsolete tests for deleted functions

    - [x] **3.1.b Extract git integration setup into `src/lib/setup.ts`**
        - Created `src/lib/setup.ts` with `configureGitIntegration()` (gitattributes block,
          merge driver, hooks path) and `runPostInitSetup()` (identity, user dir, refspec)
        - Both fresh and join paths in `init.ts` now call shared functions
        - Fixed latent bug: join mode was missing gitattributes + merge driver setup
        - Removed unused `PM_MODE_ARC_IN_GIT` import from `init.ts`

    - [x] **3.1.c Quality gates**
        - typecheck: clean, lint:ts: clean, unit tests: 259 pass (19 suites)

- [x] **3.2 Create `arc join` command**

    - [x] **3.2.a Create `src/commands/join.ts`**
        - `runJoin()` orchestrator with all planned behaviors: installation check with
          `NO_ARC_INSTALLATION` error code, role + identity in git config, git integration
          via shared `configureGitIntegration()`, skill generation, gitignore/gitattributes
          blocks, user directory via shared `runPostInitSetup()`
        - 9 unit tests covering all behaviors including null identity edge case
        - Created `src/prompts/join-prompts.ts` with role selection + shared tool prompt
          (exported `promptTools` from `init-prompts.ts` — no duplication)

    - [x] **3.2.b Register `join` in `cli.ts`**
        - `arc join` with `--contributor`, `--yes`, `--tools <csv>` flags
        - Interactive: role prompt → tool prompt → identity prompt → run
        - Non-interactive: flags build `JoinPromptResult` directly
        - Error handling for `NO_ARC_INSTALLATION` with user-facing message

- [x] **3.3 Update `arc init` to detect existing installations**
    - `runInit` throws `ALREADY_INSTALLED` error with guidance to `arc join` or `arc update`
    - Renamed `detectInitMode` → `isArcInstalled` (returns boolean, no mode concept)
    - Removed join mode path from `init.ts`, `InitMode` type, and `mode` from `InitOptions`/`InitResult`
    - Removed join mode logic from `cli.ts` init action (config reading, mode branching)
    - Removed join mode parameter from `runInitPrompts`
    - Updated `buildPostInitMessage()` team mode text: "arc init" → "arc join"
    - Updated unit tests (`isArcInstalled`, removed `result.mode` assertions, updated team text test)
    - Updated integration test (join mode test → `ALREADY_INSTALLED` error test + `runJoin` test)
    - Updated E2E test (second init now errors instead of joining)

- [x] **3.4 Non-interactive `arc join` mode**
    - Already implemented in 3.2.b — `--contributor`, `--yes`, and `--tools` flags build
      `JoinPromptResult` directly from CLI flags
    - 4 E2E tests: `--contributor --yes`, `--yes --tools claude,cursor`,
      `--contributor --yes --tools claude`, and error on missing installation

### **Phase 4:** Contributor Role Support

**Purpose:** Implement role-aware behavior across hooks, session workflows, and framework
documents so contributors get a streamlined experience.

**Audit notes (pre-implementation):**

- Execution order: 4.1 → 4.3 → 4.2 → 4.4 (documents must exist before workflows reference them)
- `Context: contribution (...)` is universally accepted (not role-gated in hook validation) —
  contributors are expected to use it, but the hook doesn't reject it from maintainers
- Dual-copy sync: edit package source (`packages/arc-framework/arc/`), sync to `.arc/` — same
  pattern as Phase 3
- If contributor role complexity grows (multiple roles, permission tiers), extract a strategy
  document at that point

- [x] **4.1 Role-aware hooks**

    - [x] **4.1.a Update pre-commit hook**
        - Added `arc_role=$(git config arc.role 2>/dev/null || echo "maintainer")` at top
        - Added `hooks.contributor_protected_paths` config key to `arc-config.yml` with default
          `active/|backlog/`. Added to `validate-config.sh` known keys.
        - When role=contributor: skip CHECK 7 (task list staging), CHECK 8 (task numbering),
          CHECK 10 (WORK-STATUS co-staging). Added new CHECK 6: contributor protected file
          warning using configurable `hooks.contributor_protected_paths`.
        - Renumbered checks: 6→contributor protected files, 7→task list staging (maintainer),
          8→task numbering (maintainer), 9→meta-project refs (universal), 10→WORK-STATUS
          co-staging (maintainer)

    - [x] **4.1.b Update commit-msg hook**
        - Added `arc_role` read. Added `Context: contribution (.+)` as universally accepted
          pattern in context footer cascade (freeform parenthetical). Added contribution
          example to missing-context help text and invalid-format help text. Skipped RULE 7
          (WORK-STATUS freshness) when role=contributor.

    All changes in package source, synced to `.arc/`. Shellcheck clean.

- [x] **4.3 Create framework documents**

    - [x] **4.3.a Create `AGENT-BRIEFING.CONTRIBUTOR.md`**
        - Framework-owned in `packages/arc-framework/arc/system/agent/`. Covers boundaries
          (do not modify active/backlog), commit convention (`Context: contribution (...)`),
          session workflow differences, optional local planning in `user/{identity}/`.
        - Added to `init-recipe.json` unconditional includes and file classification inventory.

    - [x] **4.3.b Create `template-contributing.md`**
        - Copy-ready reference template in `reference/templates/` (Framework-classified,
          `template-` prefix convention). Covers `arc join`, quality gates, commit convention,
          maintainer-managed file boundaries, PR guidelines.
        - Added to `init-recipe.json` and file classification inventory.

- [x] **4.2 Session workflow branching**

    - [x] **4.2.a Update `session-init.template.md`**
        - Added "Resolve role" section after identity resolution. Contributor Session Path:
          loads items 1–7 + AGENT-BRIEFING.CONTRIBUTOR.md + optional SESSION-NOTES.md,
          checks optional local `user/{identity}/WORK-STATUS.md`, skips items 8–11 and Step 5.
          Contributor orientation format with `· contributor ·` marker.
        - Synced rendered copy to `.arc/system/workflows/arc/session-lifecycle/session-init.md`.

    - [x] **4.2.b Update `session-handoff.md`**
        - Added contributor role callout in Pre-Update Verification: skip task list verification,
          project-level WORK-STATUS.md update, and conditional WORK-STATUS commit. SESSION-NOTES.md
          and git notes save remain role-agnostic.

- [x] **4.4 Update methods and rules**

    - [x] **4.4.a Update `arc-methods.md` → `commit-context-format`**
        - Added "With contributor role" subsection with three examples and explanation that
          the format is accepted from any role but expected convention for contributors.

    - [x] **4.4.b Update `DEV-RULES.ARC.md` § Commit Discipline**
        - Added "Contributor override" note to work status accuracy bullet with link to
          AGENT-BRIEFING.CONTRIBUTOR.md.

    - [x] **4.4.c Run quality gates**
        - Markdown linting: 0 errors (fixed MD060 table alignment in file classification)
        - TypeScript linting: clean. Type checking: clean. Shellcheck: clean.
        - Tests: 268 unit + 35 integration/E2E = 303 total, all passing

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
