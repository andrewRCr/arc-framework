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
- `--reconfigure` flag for `arc init` and `arc join` (post-init config changes)

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

### **Phase 5:** Beta Readiness Audit

**Purpose:** Systematic audit of the CLI implementation and ARC methodology documents before
public-facing work begins. Phases 1–4 completed all planned methodology and CLI changes — this
phase validates the result with fresh eyes before building docs and publishing.

**Output:** `analysis-beta-readiness-audit.md` — dense findings document, categorized by severity,
used as input for scoping any remediation work.

- [x] **5.1 CLI & codebase audit**

    **Goal:** Exercise all CLI commands across meaningful config permutations and review code
    quality. Parallel subagent workstreams, findings collected into a single section of the
    analysis doc.

    Produced 81 findings (14 high, 42 medium, 25 low) across hooks, init/join, update/status,
    user portability, log, error handling, cross-platform, and config parsing. Top issues: hook
    `set -e` crash on single-line commits, hooks reading working tree instead of staging area,
    no git repo guard in init/join, user load overwrites without backup.

    - [x] **5.1.a Command path walkthroughs**

        Subagent per workstream — each walks the command(s) through their config space, flags
        friction, edge cases, error handling gaps, and incorrect/missing output:

        - **Install & Join**: `arc init`, `arc join` — each `pm.mode` (none/arc-in-git/external),
          team mode, contributor/maintainer role, `--yes` vs interactive, tool selection combos
        - **Update & Status**: `arc update`, `arc status`, `arc diff` — clean install, customized
          files, three-way merge conflicts, missing files, version mismatch scenarios
        - **User Portability**: `arc user save/load/push/pull/add`, `arc sync` — round-trip
          integrity, ancestor commit walking, multi-user team scenarios
        - **Log**: `arc log atomic` — filters, edge cases (no matches, malformed commits)
        - **Hooks**: pre-commit and commit-msg across `branch.protection` × `commit.format` ×
          `commit.context_footer` × `arc.role` — focus on cross-product corners, not every cell

    - [x] **5.1.b Code quality review**

        Single subagent reviewing implementation code for:

        - Error handling gaps (git unavailable, disk full, permissions, malformed input)
        - Edge cases the test suite doesn't cover (classification, config, setup modules lack
          dedicated unit tests)
        - Robustness of the three-way merge / conflict resolution path
        - Hardcoded assumptions that break cross-platform (path separators, shell commands)
        - Any security concerns (path traversal, injection via user input)

    - [x] **5.1.c Synthesize CLI findings**

        Merge subagent results, deduplicate, categorize by severity (high/medium/low) and type
        (bug, gap, friction, robustness). Write the CLI section of `analysis-beta-readiness-audit.md`.

- [x] **5.2 Methodology walkthrough audit**

    **Goal:** Walk through ARC workflows as an adopter/team and their agent(s) would experience
    them, with fresh eyes. Flag dead ends, contradictions, stale references, assumed knowledge,
    and friction points.

    Based on the structural validation scenario approach (WU `06_structural-validation`) but
    expanded to cover CLI paths, contributor role, and content quality — not just routing.

    - [x] **5.2.a Define and execute scenario walkthroughs**

        Subagent per scenario — each reads the relevant workflows/docs cold and walks the path
        step-by-step, flagging issues:

        - **Scenario 1 — New solo adopter, OOBE**: `pm.mode: none`, `branch.protection: partial`.
          `arc init` → `01_verify-and-configure` → `02_define-project` → first PRD → task
          generation → activate → execute → integrate → archive. The "what does someone see day
          one?" path.
        - **Scenario 2 — Arc-in-git power user**: `pm.mode: arc-in-git`,
          `branch.protection: full`. Planning branch → PRD → tasks → integrate-planning → activate
          → execute → verify → integrate → archive. Full ceremony path.
        - **Scenario 3 — Contributor onboarding**: `arc join --contributor` → session-init
          (reduced doc set) → work → commit (`Context: contribution (...)`) → handoff. Boundary
          enforcement, what contributors see vs don't see.
        - **Scenario 4 — Session lifecycle round-trip**: Init → work → handoff → *new session* →
          resume. State recovery, freshness checks, SESSION-NOTES portability via git notes,
          mismatch handling.
        - **Scenario 5 — Incidental work discovery**: Mid-task issue discovery → triage (severity
          assessment) → atomic vs task list routing → companion file / ATOMIC-INBOX. The reactive
          path through `manage-incidental-work.md`.
        - **Scenario 6 — Framework update experience**: Adopter has customized configurable files
          → `arc update` → customizations preserved, conflicts surfaced clearly, post-update state
          coherent. The "will I lose my work?" question.

        Each subagent evaluates both **routing** (do links connect, are prerequisites met, does
        the path complete?) and **content quality** (is guidance clear, would an agent following
        it produce the right result, is assumed knowledge flagged?).

    - [x] **5.2.b Synthesize methodology findings**

        Produced 52+ findings (4 high, 18 medium, 30+ low) across 6 scenarios. Two systemic
        issues: `pm.mode: none` (default config) has 3 dead ends in workflow docs, and the
        update experience is entirely undocumented. Also found atomic companion file lifecycle
        gap (no workflow creates it), contributor role under-documented in shared docs, and
        SESSION-NOTES single-path dependency on git notes.

- [x] **5.3 Produce final analysis document**

    `analysis-beta-readiness-audit.md` in `.arc/active/feature/`. Combined 133+ findings
    (18 high, 60 medium, 55+ low) across CLI and methodology. Executive summary, categorized
    findings, and three-tier recommended action tables (fix before beta / should fix / defer).

### **Phase 6:** Audit Remediation

**Purpose:** Fix findings from the Phase 5 beta readiness audit (158+ findings across CLI,
methodology, and team coordination). Design decisions resolved during scoping: template
conditionals for team-mode workflows, WORK-STATUS unchanged structurally (one-dev-per-branch
primary path), `(@name)` markers advisory, full update documentation.

**Findings reference:** `analysis-beta-readiness-audit.md` — IDs (CM-H01, MW-M09, TC-H04,
etc.) trace each task to specific findings.

**Pre-implementation audit notes (2026-03-25):** Task audit + external research informed
several refinements below. Key decisions: (1) pristine store keeps JSON blob format with
atomic writes — per-file split dropped after research showed the pattern has no ecosystem
precedent and corruption risk is mitigated by atomic writes + existing recovery path;
(2) changelog mechanism (MW-M06) promoted from backlog as Task 6.13; (3) CI/TTY
auto-detection promoted from backlog into Task 6.3.b.

- [x] **6.1 Git hooks: critical bug fixes**

    **Goal:** Fix the highest-severity hook bugs — every adopter hits these on every commit.

    Findings: CM-H01, PC-H01, PC-H03, PC-H04, CM-M07, XC-M01

    - [x] **6.1.a Fix `commit-msg` `set -e` failures**
        - Added `|| true` to `grep -vc '^$'` body-line count (CM-H01)
        - Added `is_valid_ere()` helper; traps invalid regex in `commit.custom_pattern`
          and `commit.context_pattern` with clear error messages (CM-M07)
        - Audited both hooks for remaining `set -e` hazards — all other greps are in `if`
          contexts or already have `|| true` guards (XC-M01)

    - [x] **6.1.b Refactor `pre-commit` to validate staged content, not working tree**
        - Check 2 (large file): `git show ":$file" | wc -c` for staged size (PC-H01).
          Decision: staged size is the correct measure — the hook guards what enters the
          repo, not what's on disk (gitattributes filters may alter size).
        - Check 4 (conflict markers): `git show ":$file" | grep` for staged content (PC-H01)
        - Check 5 (debug statements): `git diff --cached -U0` added-lines-only scan —
          pre-existing debug statements no longer trigger false positives (PC-H03)
        - Check 9 (meta-references): same added-lines-only pattern (PC-H04)

- [x] **6.2 Git hooks: template alignment, contributor enforcement, and polish**

    **Goal:** Fix template/dev config drift, add contributor enforcement and team-mode
    awareness, address remaining medium/low hook findings.

    Findings: XC-M05, XC-M02, MW-M13, MW-M14, TC-M04, CM-M04, CM-M05, CM-M08, CM-L01,
    PC-L03, PC-M01, PC-M03, XC-L01, XC-L02

    - [x] **6.2.a Template config and role enforcement**
        - Removed `\.arc/` from `hooks.meta_ref_patterns` in template config (XC-M05)
        - Added contributor mode notice in pre-commit output (XC-M02)
        - Contributor context footer warning (soft) in `required`/`recommended` modes only —
          respects configurability architecture: `disabled`/`custom` modes are not
          cross-validated (MW-M14)
        - Team mode `(@name)` ownership marker warning in Check 11 (TC-M04)
        - Rewrote `githooks/README.md` — added role-aware behavior, team mode, full config
          table, environment section, and corrected all thresholds (MW-M13)

    - [x] **6.2.b Remaining hook fixes**
        - Allow uppercase in task filename pattern: `tasks-[a-zA-Z0-9-]+\.md` (CM-M04)
        - Dynamic `active/*/` subdirectory search for task list and atomic file lookup (CM-M05)
        - Explicit error for unknown `commit.context_footer` values — separated `*` catch-all
          from `required|recommended` case (CM-M08)
        - Subject length check skipped when `commit.format: any` (CM-L01)
        - Added `hooks.subject_max_length` (72) and `hooks.subject_warn_length` (60) config
          settings — aligns with GitHub truncation; prefix-aware defaults (new)
        - Debug check (Check 5) now uses configurable `hooks.test_patterns` and excludes
          `.arc/` and `packages/.*/arc/` — eliminates self-referential false positive from
          extensionless hook files containing pattern definitions (PC-L03, PC-M01)
        - `numfmt` gated with `command -v` — macOS fallback uses integer MiB (PC-M02)
        - Detached HEAD state now emits explicit warning (PC-M03)
        - ANSI colors conditional on TTY + `NO_COLOR` + `TERM!=dumb` in `arc-lib.sh` (XC-L01)
        - README subject-length threshold corrected to 60 (was 50) (XC-L02)

- [x] **6.3 Init/join hardening**

    **Goal:** Guard against bad input, improve error messages, harden the config parser.
    Note: `arc init` now sets `arc.role = maintainer` (implemented pre-phase, included in
    first commit).

    Findings: I-H01, EH-H01-H03, I-M01-M07, X-M01, CS-H01, CP-M02, I-L01, I-L04

    - [x] **6.3.a Error handling overhaul**
        - Extended `ArcErrorCode` with `ALREADY_INSTALLED`, `NO_ARC_INSTALLATION`, `RECIPE_INVALID`
        - Refactored init.ts and join.ts to throw `UserFacingError` with structured fields;
          cli.ts catch blocks now use `isHandledError()` instead of ad-hoc code matching
        - Global error boundary: `program.parseAsync().catch()` with `formatUnexpectedError()`
        - Recipe loading: extracted `loadRecipeFile()` in recipe.ts with `RECIPE_INVALID` errors
        - Git repo guard on init/join (early exit with `GIT_MISSING` UserFacingError)
        - `--yes` mode identity check: early exit with `IDENTITY_MISSING` when no git config
        - Wrapped all `resolveUserIdentity()` calls in user commands with try/catch + isHandledError
        - Test-first: 4 behaviors (7 new unit tests, 3 updated, 1 new E2E test)

    - [x] **6.3.b Input validation and CI auto-detection**
        - `validateTools()` in resolution.ts — validates against `VALID_TOOL_IDS` set; wired into
          `buildNonInteractivePrompts` and join `--yes` path (I-M01)
        - Empty `--name` rejection in `buildNonInteractivePrompts` (I-M02)
        - `--contributor` flag passthrough: `runJoinPrompts({ contributor })` skips role prompt
          when flag is set, works in both interactive and `--yes` modes (I-M05)
        - CI auto-detection: `isNonInteractiveEnvironment()` checks `process.env.CI === 'true'`
          or `!process.stdin.isTTY` at init/join command entry, implies `--yes` with log message
        - 9 new tests (5 validateTools, 4 non-interactive validation)

    - [x] **6.3.c Config parser hardening**
        - Strip surrounding quotes (double and single) matching shell-side `sed` patterns (CS-H01, I-L04)
        - Normalize CRLF to LF before parsing (CP-M02)
        - Inline comments: decided to skip — matches shell-side `arc_config_get` which does NOT strip
          inline comments. Avoids regex breakage in values like `hooks.meta_ref_patterns` containing `#`.
          If inline comments are needed later, add to both parsers simultaneously.
        - Empty values: kept existing behavior (skip = absent, matches shell default-fallthrough)
        - 13 new unit tests covering quotes, CRLF, mixed line endings, colons in values, edge cases

    - [x] **6.3.d Join-specific fixes**
        - `arc join` now calls `detectExistingSkillDirs()` before `generateSkills()` — universal
          tools resolve to native dirs when present, matching init and update behavior (I-M04)
        - Fixed `skipPristine` → `skipInternal` typo in 2 integration test calls (I-L01)
        - Added `pm.mode=external` test permutation for join (I-M07)
        - Added join idempotency test — second run succeeds without error (I-M06)

- [x] **6.4 User portability: safety, reliability, and workflow integration**

    **Goal:** Make session state sync safe (no silent data loss), reliable (ancestor walking,
    conflict detection), and properly documented in session workflows.

    Findings: UL-H01, UL-H02, CC-H01, UP-M01, UP-M02, UP-M03, UL-M01, UL-M02, SY-M01/M02,
    CC-M03, TC-M09

    - [x] **6.4.a Load safety: backup, stale file detection, and subdirectory support**

        **Changes:**

        - `serialize` (`user-sync.ts`): dotfile skip convention (basename check), version
          bumped to 2, basename-based filtering for subdirectory entries
        - `isSafeFilename` → `isSafePath`: per-segment validation allows `/` for subdirs,
          blocks `..`, `.`, `\`, empty segments, whitespace
        - `deserialize`: optional `mkdirFn` param for subdirectory creation
        - `readUserDir` (`cli.ts`, `integration.ts` helper): recursive with dot-directory skip
        - `runUserLoad` (`user.ts`): backup to `.pre-load-backup.json` before overwrite,
          stale file detection (local files not in manifest), version validation accepts 1|2,
          `UserLoadResult.warnings` field added
        - `writeGitNote` (`cli.ts`): backpressure handling (drain wait on full buffer)
        - 9 new unit tests, 5 new integration tests; existing tests updated for v2 and
          dotfile convention (`.env` now skipped silently, `subfolder/file.md` now accepted)

    - [x] **6.4.b Push/pull conflict detection and `--identity` support**

        **Changes:**

        - `runUserPush` (`user.ts`): added `force?: boolean` option, passes `--force` to git
        - `runUserPull` (`user.ts`): added `force?: boolean` option, uses `+` refspec prefix
        - `hasLocalNotes`, `hasRemoteNotes` helpers exported for CLI-layer detection
        - Push CLI handler: catches non-fast-forward errors, offers interactive select
          (force push / pull first / cancel); catches missing remote with user-friendly error
        - Pull CLI handler: `--identity <name>` option for cross-user pull; `p.confirm` when
          local notes exist; missing remote and missing ref detection with friendly messages
        - `arc sync`: `process.exitCode = 1` on all partial failure paths (pull, load, save, push)
        - 5 new integration tests (force push, cross-identity pull, missing remote,
          hasLocalNotes, hasRemoteNotes)

    - [x] **6.4.c Ancestor walking: merged branch support**

        **Changes:**

        - `runUserLoad` (`user.ts`): replaced `HEAD~N` linear loop (up to 40 git calls) with
          batched approach: `git notes list` (all noted commits) + `git rev-list HEAD`
          (topological ancestor walk, follows merge paths) + intersection. Only 2-3 git calls
          total regardless of history depth.
        - `rev-list` handles merge commits natively (walks all parent paths) and stops
          naturally at shallow clone boundaries.
        - 3 new integration tests: merge ancestor (branch+merge, note found through merge
          parent), shallow clone within boundary (depth 2, note 1 commit back — found),
          shallow clone beyond boundary (depth 1, note 10 commits back — returns null)

    - [x] **6.4.d Session workflow sync error guidance**

        **Changes:**

        - `session-handoff.md` § Save to Git Notes: added error handling block covering push
          rejection (non-fast-forward with interactive recovery), missing remote (local save
          still succeeded), pull warning (backup preserves prior state), and save failure
        - `session-init.md` § item 9 (SESSION-NOTES loading): added load error handling
          covering no note found (normal on first session), corrupt note (overwrite guidance),
          pull failure (identity verification via `ls-remote`), and stale file warnings
          (backup location and recovery)

- [x] **6.5 Pristine store: atomic writes, corruption resilience, and recovery UX**

    **Goal:** Prevent partial-write corruption via atomic writes and improve the developer
    experience when pristine recovery triggers.

    Findings: X-H01, U-H01, U-H02, U-M03, D-M01, S-M01

    **Design decision (2026-03-25):** Per-file pristine split (X-H01) dropped. External
    research found no ecosystem precedent for per-file mirrored pristine storage — tools
    that do three-way merge (Cruft, Helm, kubectl) all store baseline content as single
    artifacts. Real-world JSON state file corruption (Terraform, npm, Claude Code) is
    caused by process interruption mid-write; atomic writes (temp+rename) fully prevent
    this. The existing recovery path (skip merge, rebuild baseline from current content)
    handles remaining edge cases. JSON blob with atomic writes is the right approach.

    **Dependency note:** Task 6.6 modifies the same files (`update.ts`, `status.ts`,
    `diff.ts`). Complete 6.5 before starting 6.6.

    - [x] **6.5.a Atomic writes for manifest and pristine store**

        **Changes:**

        - `src/lib/fs.ts`: Added `atomicWriteJson()` — writes JSON via same-directory temp
          file (`.{name}.tmp`) + `fs.rename()`. Avoids `EXDEV` by using the target's
          directory, not `os.tmpdir()`. 6 new unit tests in `__tests__/unit/fs.test.ts`.
        - `src/commands/init.ts`: Replaced 2 `io.writeFile` calls for manifest/pristine
          with `atomicWriteJson`. Unit tests updated to assert via module mock.
        - `src/commands/update.ts`: Replaced 2 `io.writeFile` calls for manifest/pristine
          with `atomicWriteJson`. One-pass pristine repair: uses `updated` (rendered
          framework content) as effective base instead of `current` (adopter content),
          falls through to merge (base===updated → "unchanged", preserves adopter file).
          Integration tests updated to reflect one-pass behavior.
        - Design: standalone utility (not IOContext change) — targeted to state files,
          explicit about what needs protection, directly unit-testable

    - [x] **6.5.b Recovery UX improvements**

        **Changes:**

        - `src/commands/update.ts`: Renamed `pristineRepaired` → `pristineRebuilt` in
          `UpdateResult` and all references. Added `PristineStoreError` type and
          `pristineStoreError` field to `UpdateResult`. Pristine load block now detects
          cause ("not-found" vs "invalid-json"). `buildUpdateSummary` shows consolidated
          whole-store message (with cause) or per-file list depending on failure mode.
          Summary text changed: "rebuilt" not "repaired", "Your customizations are
          preserved" instead of "Run again to merge".
        - `src/commands/diff.ts`: Added `pristineStoreMissing` to `DiffResult`.
          `buildDiffOutput` shows single consolidated message ("Cannot show diffs — no
          pristine baseline. Run 'arc update' to rebuild.") instead of N per-file errors
          when entire store is missing.
        - `arc status`: confirmed unaffected (uses manifest hash, not pristine store).
        - 8 new tests: 3 `buildDiffOutput` (whole-store, partial, clean), 5
          `buildUpdateSummary` (rebuilt label, not-found cause, invalid-json cause,
          per-file partial, no-rebuild clean)

- [x] **6.6 Update/status/diff: resilience and polish**

    **Goal:** Remaining update system improvements — downgrade guard, path normalization,
    classification handling, and CLI output improvements.

    **Depends on:** Task 6.5 (atomic writes change the write paths in `update.ts`).

    Findings: U-M01, U-M02, U-M04, X-M02, S-M02, D-M02, CP-M01, CP-M03, X-M05, U-L02,
    U-L03, S-L01, D-L01

    - [x] **6.6.a Resilience fixes**

        **Changes:**

        - **X-M02 — Manifest schema versioning:** Added `schema_version: number` to
          `Manifest` interface, `MANIFEST_SCHEMA_VERSION = 1` constant, migration
          infrastructure in `manifest/store.ts` (sequential registry with v0→v1 entry),
          future version rejection with `MANIFEST_VERSION_UNSUPPORTED` UserFacingError.
          Init and update both write `schema_version`. 4 new tests.
        - **S-M02 — Semver version comparison:** Added `semver` dependency + `@types/semver`.
          Replaced string equality in `status.ts` with `semver.neq()`. 2 new tests.
        - **U-M01 — Downgrade prevention:** Early check in `runUpdate()` using `semver.lt()`.
          Throws `UserFacingError` if CLI version < installed version. 2 new integration tests.
        - **U-M02 — Classification change handling:** Detect reclassification in the "keep"
          loop, update manifest entry's classification, report in `reclassified` array on
          `UpdateResult` and in `buildUpdateSummary()`. Added constraint comment at
          `SCAFFOLDED_FILES` definition. 1 new integration test.
        - **U-M04 — Skill warnings:** Added `skillWarnings` field to `UpdateResult`,
          captured from `skillResult.warnings`, rendered in `buildUpdateSummary()`. 2 new
          summary tests.
        - **D-M02 — Missing files in diff:** Changed silent `continue` to error push in
          `diff.ts` catch block — missing files now appear in diff output errors,
          consistent with status `!` reporting. 1 new test.
        - Test helpers updated: `buildManifest` factory and `setupInitialState` include
          `schema_version`; integration helper uses `0.0.0` as default framework version
          to avoid triggering downgrade guard.

    - [x] **6.6.b Path normalization for Windows**

        **Changes:**

        - **X-M05**: Added `toForwardSlash()` helper in `fs.ts`, applied in
          `listArcFiles()` after `relative()` call. Ensures manifest keys use
          forward slashes on all platforms. 4 new tests.
        - **CP-M03**: Verified — `startsWith` and regex patterns in `listArcFiles`
          already use forward slashes, work correctly after X-M05 normalization.
          No additional changes needed.
        - **CP-M01**: Verified — user-sync enforces forward slashes via
          `isSafePath()`, skills use hardcoded forward slashes in template paths,
          file I/O uses `path.join()`. No changes needed.

    - [x] **6.6.c CLI output improvements**

        **Changes:**

        - **MW-M04**: Added `classification` field to `FileStatus` interface,
          populated from manifest for tracked files (null for new/untracked).
          `buildStatusSummary()` shows `M [Configurable] .arc/path` format.
          4 new tests.
        - **U-L02**: Made `pristine_hash` optional on `FileEntry`. `buildEntry()`
          omits it for Scaffolded files. `status.ts` guards hash comparison.
          `validateManifest()` accepts missing `pristine_hash`.
        - **U-L03**: Added `previousVersion`/`currentVersion` to `UpdateResult`.
          `buildUpdateSummary()` shows version line: `v0.1.0 → v0.2.0` or
          `v0.1.0 (no version change)`. 2 new tests.
        - **S-L01**: Legend line (`M=modified  !=missing  ?=new`) appended to
          status output when non-unmodified files exist. 2 new tests.
        - **D-L01**: Summary count line appended to diff output with file count,
          error count, and skipped count. 2 new tests.

- [x] **6.7 Update documentation**

    **Goal:** Add adopter-facing orientation for `arc update` in the README, and route
    deep-dive content to the docs site (Phase 7). Pre-implementation audit determined that
    detailed update documentation is docs-site material, not an in-repo workflow — see
    analysis of MW-H04, MW-M03, MW-M05, MW-M07, MW-M08.

    Findings: MW-H04, MW-M03, MW-M05, MW-M07, MW-M08

    - [x] **6.7.a Add "Updating ARC" section to `.arc/README.md`**

        Added "Updating ARC" section with file classification table (Framework/Configurable/
        Scaffolded), customization warning for Framework files (MW-M07), and post-update
        guidance for conflicts and skill regeneration.

    - [x] **6.7.b Route update deep-dive content to Phase 7 (docs site)**

        Added Task 7.1.b (in-repo vs. docs-site boundary audit) and Task 7.3.f (Updating
        ARC foundation page) to Phase 7. Updated PRD § Docs site: renumbered requirements,
        added boundary audit (Req 25) and 6th foundation page (Req 26). Restructured 7.1
        as parent task with 7.1.a (README refresh) and 7.1.b (boundary audit).

    - [x] **6.7.c Sync README update to package template**

        Copied updated `.arc/README.md` to `packages/arc-framework/arc/README.md`.

- [x] **6.8 Log command fixes**

    Findings: L-H02, L-M01-M05, L-L01, L-L02

    **Changes** (all test-first, 9 new unit tests):

    - `Math.max(1, limit)` clamps zero/negative to 1 (L-H02); NaN detection
      falls back to `DEFAULT_LOG_LIMIT` (L-M05)
    - Basic `--since` heuristic: reject values with no digits before calling git;
      relative dates like `"2 weeks ago"` pass through (L-M01)
    - When `--work-unit` is set, skip git-level `-n` flag; filter client-side
      then truncate to `effectiveLimit` (L-M02/M03)
    - Replaced `--ARC-RECORD--` string separator with `%x00` null byte — cannot
      appear in commit messages, removed `RECORD_SEP` constant (L-M04)
    - `buildLogAtomicOutput` includes context footer line on indented second line
      per entry (L-L01)
    - `parseSubject` regex updated to `!?:` — handles `feat!:` and
      `feat(scope)!:` breaking change markers (L-L02)

- [x] **6.9 Workflow documentation: `pm.mode:none`, companion files, and link fixes**

    **Goal:** Fix the default-config dead ends, close the companion file lifecycle gap, and
    fix broken links.

    Findings: MW-H01-H03, MW-M01-M02, MW-M09-M10, MW-L01-L04, TC-H05, TC-L04

    **Cross-cutting:** Every edit applies to both `.arc/` installed copy and
    `packages/arc-framework/arc/` package source. Three files are template-rendered
    (package has `.template.md`): `session-init`, `3_process-task-loop`, `02_define-project`.
    All others are Framework-classified (identical content in both locations).

    - [x] **6.9.a `pm.mode:none` path fixes**

        Template sources (`packages/arc-framework/arc/`) updated with `arc:if` conditionals;
        installed `.arc/` copies match what the template renders for this repo's config
        (`pm.mode: arc-in-git`).

        - `02_define-project.template.md`: gated Steps 6-7, `configure-external` blockquote,
          ROADMAP/PROJECT-STATUS in Maintaining section, and corresponding link definitions
          with `arc:if` conditionals. Renamed 7 vestigial `-template` reference link names
          in both template and installed copy (MW-H01, MW-L02)
        - `session-init.template.md`: added `none`/`external` discovery path via `arc:if`;
          installed copy shows arc-in-git path only. Replaced hardcoded repo path with
          `<your-repo-root>` placeholder (MW-H02, MW-M02, MW-L04)
        - `3_process-task-loop.template.md`: added `external`/`none` rows to deferred atomic
          task routing via `arc:if`; installed copy shows arc-in-git path only. Gated
          `[dev-rules-project]` link definition inside external conditional (MW-H03)
        - `01_verify-and-configure.md` (Framework file, no template): annotated `backlog/` as
          `arc-in-git` only — prose conditional appropriate here (MW-M01)

    - [x] **6.9.b Companion file lifecycle**

        - `2_generate-tasks.md` Step 4: added companion file creation instruction with header
          template and link to process-task-loop (MW-M09)
        - `archive-work-unit.md` Step 4: added `atomic-{name}.md` to `git mv` list (MW-M10)

    - [x] **6.9.c Link and path fixes**

        - `integrate-planning-branch.md`: fixed inline link `(activate-work-unit.md)` →
          `(../activate-work-unit.md)` (MW-L01)
        - `AGENT-BRIEFING.CONTRIBUTOR.md`: fixed link target `session-init.template.md` →
          `session-init.md` (MW-L03)
        - `activate-work-unit.md`: fixed `team/{name}/` → `user/{identity}/` (TC-H05)
        - `strategy-team-coordination.md`: replaced raw `git notes show` commands with CLI
          `npx arc user pull/load --identity {outgoing}` (TC-L04)

- [x] **6.10 Team mode workflow integration**

    **Goal:** Add template conditionals to operational workflows so team-mode adopters get
    contextually correct guidance. Strategy docs get standardized prose markers instead.

    Findings: TC-H01, TC-H02, TC-H04, TC-M07, TC-M08, TC-L01

    **Audit notes (pre-impl):**
    - `session-handoff.md` and `2_generate-tasks.md` are currently plain files (no
      `.template.md` source). 6.10.a promotes both to templates — rename in package,
      update `init-recipe.json` entry. No classification change (both are Framework).
    - 6.11.b's `session-init.md` changes (MW-M15, MW-M16, MW-M17, TC-L02) must go
      into the `.template.md` source, not the installed copy — 6.10.c rendering would
      overwrite direct edits. Route those through the template during 6.10.a or 6.11.b,
      whichever touches it last.

    - [x] **6.10.a Add `team.mode` recipe condition and template conditionals**

        - Promoted `session-handoff.md` and `2_generate-tasks.md` to `.template.md` in
          package — renamed files, updated `init-recipe.json` entries. Tests pass (rendering
          produces identical output before conditionals added).
        - Added `team.mode == true` condition to `init-recipe.json` (TC-H04) — empty
          `include_files` (no team-only files yet; condition registers team.mode in recipe)
        - `session-init.template.md`: team-mode block after item 8 (WORK-STATUS read) —
          `(@name)` scan to resolve personal next task, overriding branch-level Next Task
          (TC-H01)
        - `3_process-task-loop.template.md`: conditional ownership check block before task
          start — verify `(@name)` ownership or claim unowned tasks (TC-H02). Moved
          unconditional "In team mode..." sentence into conditional block (TC-L01)
        - `session-handoff.template.md`: team-mode blockquote before WORK-STATUS format —
          explains branch-level semantics and last-committer-wins resolution
        - `2_generate-tasks.template.md`: team-mode paragraph in Step 3 on adding `(@name)`
          markers during task generation (TC-M07). Link reference also conditional.

    - [x] **6.10.b Add `(@name)` to task list formatting strategy**

        - Added "Task Ownership Markers" section (between Format Elements Reference and
          Test-First) with `(@name)` placement, format, rules, and cross-reference to
          `strategy-team-coordination.md` (TC-M08)
        - Updated Table of Contents (renumbered items 4–11)
        - Synced to package copy

    - [x] **6.10.c Sync template changes to installed docs**

        - `3_process-task-loop.md`: removed unconditional "In team mode..." sentence (now
          inside conditional, stripped for `team.mode: false`)
        - `session-init.md`, `session-handoff.md`, `2_generate-tasks.md`: no changes needed
          — all new content is inside `team.mode == true` blocks, stripped for this repo
        - Verified: 0 markdown lint errors, all 36 tests pass (including E2E linting of
          rendered output)

- [x] **6.11 Team coordination and session documentation**

    **Goal:** Reframe the team coordination strategy as advisory (not required infrastructure),
    document the WORK-STATUS concurrency model honestly, and add cross-references from shared
    docs.

    Findings: TC-H03, TC-H06, TC-M01-M03, TC-M05-M06, TC-M10-M12, TC-L02-L03, TC-L05-L07,
    MW-M11-M12, MW-M15-M18

    **Audit notes (pre-impl):**
    - 6.11.a reframing is a full read-through with surgical prose rewrites where the
      current tone implies required infrastructure vs. available convention. Most lines
      survive; rewrite where advisory framing is missing. Maintain firm mechanics for
      conventions once adopted — don't soften to the point where 6.10.a's template
      conditionals (which reference strategy conventions) feel orphaned.
    - 6.11.b `session-init.md` changes (MW-M15, MW-M16, MW-M17, TC-L02) go into
      `session-init.template.md` source, not the installed copy (see 6.10 audit note).
      Non-conditional content uses no `arc:if` — it appears in all rendered outputs.
    - MW-M18 (ATOMIC-INBOX secondary triage trigger): add to `session-init` freshness/
      discovery section — "check ATOMIC-INBOX for pending items" as a lightweight
      reminder at session start, complementing the integration-time triage.

    - [x] **6.11.a Reframe team coordination strategy**

        Full read-through with surgical rewrites. Most prose survived; changes focused on
        framing and gap-filling rather than rewriting existing mechanics.

        - Purpose section: reframed as "available conventions" with explicit note on
          structural foundations (always present) vs. coordination patterns (adopt as needed)
        - WORK-STATUS: documented as branch-level state in Workflow Adaptations; personal
          next task resolved via `(@name)` scan at session-init (TC-H03)
        - Person-to-person handoff: reframed intro as "structured approach" with minimum
          viable handoff note (markers + push); mechanics unchanged
        - `merge=ours`: documented as designed for branch-to-base merges; added sub-branch
          caveats (integration owner reconciles), platform note on server-side merge driver
          limitations (TC-H06, TC-L06)
        - "trivially resolvable" → "straightforward to resolve manually" with concrete
          Alice/Bob resolution example and minimize-conflict guidance (TC-M10)
        - Added Concurrent Sessions subsection for active-active scenario — task list,
          WORK-STATUS, and SESSION-NOTES behavior documented (TC-L03)
        - Added Configuration Notes subsection — `user.sync_push` manual update when
          toggling team.mode (TC-M05), enforcement is agent-interpreted prose (TC-M06)
        - `Branch(es)` flat list documented as intentional in Team Branching Patterns
          intro (TC-M12)
        - Synced to package copy

    - [x] **6.11.b Shared document contributor and team markers**

        All changes applied to both installed `.arc/` copies and package sources.

        - `DEV-RULES.ARC.md`: added contributor note blockquote to Task Execution section
          and cross-reference to team coordination strategy (MW-M11, MW-M12, TC-L05)
        - `session-init.template.md` + installed copy: team-mode trust hierarchy Tier 1
          example (TC-L02), freshness check skip instruction for missing handoff hash
          (MW-M16), no-identity handoff impossibility flag (MW-M17), git log fallback
          when notes unavailable (MW-M15), ATOMIC-INBOX check as secondary triage
          trigger in `arc-in-git` conditional (MW-M18)
        - `activate-work-unit.md`: expanded team mode note with branch setup guidance —
          integration branch creation, sub-branch workflow, `Branch(es)` header, initial
          `(@name)` assignment (TC-M11)

    - [x] **6.11.c WORK-STATUS concurrent update guidance**

        All changes in team-mode conditional blocks (stripped for `team.mode: false`).

        - `3_process-task-loop.template.md`: pull-before-commit recommendation for shared
          branches with conflict resolution guidance (TC-M01)
        - `session-handoff.template.md`: freshness check recommendation before WORK-STATUS
          write — diff check and incorporate concurrent changes (TC-M02)
        - `session-init.template.md`: concurrent activity detection note in freshness check
          — different-author WORK-STATUS updates may indicate active teammate (TC-M03)
        - TC-L07 (platform merge driver note): covered in 6.11.a strategy reframing

- [x] **6.12 Changelog mechanism for `arc update`**

    **Goal:** Show adopters what changed when they run `arc update`, so they understand
    framework changes without reading commit history. Promoted from technical backlog
    (MW-M06).

    **Design decision (2026-03-25):** Bundled JSON changelog in the npm package, displayed
    inline during `arc update`. External research confirmed this matches the dominant
    pattern — most tools (Angular, Next.js, Storybook) bundle changelogs with packages
    rather than adding files to the user's project. JSON over Markdown for easy parsing
    and version filtering. No files added to `.arc/` or the project repo.

    - [x] **6.12.a Changelog data and display**
        - Added `changelog/versions.json` at package root (following `init-recipe.json` pattern),
          `"changelog"` added to `package.json` `files` array
        - Added `getChangelogPath()` in `paths.ts`
        - Added `src/lib/changelog.ts` with pure functions: `readChangelog` (fs read with
          graceful ENOENT/invalid-JSON handling), `filterChangelogRange` (semver range
          filtering with ascending sort), `buildChangelogDisplay` (formatted string for
          `p.note()`)
        - Wired into `handleUpdate` in `handlers/lifecycle.ts`: displays `p.note(text, "What's new")`
          after update summary when version changed; `p.log.warn()` for breaking changes
        - Added `-q, --quiet` flag on update command (Commander → handler threading)
        - 19 unit tests covering all behaviors (read/parse, range filtering, display
          formatting, graceful degradation)

    - [x] **6.12.b Seed initial changelog content**
        - No published versions exist yet (0.0.0 development, no npm releases) — seeded
          with 0.0.0 placeholder entry
        - Added `$comment` array at top of `versions.json` documenting the authoring
          convention (fields, formatting guidance, how filtering works)
        - `conventional-changelog-cli` dep dropped per audit — manual authoring preferred

- [x] **6.13 Phase quality gates**
    - Tier 2 passed: 0 markdown lint errors, 0 TS/shell lint errors, 0 type errors,
      504 tests (468 unit/integration + 36 E2E), build clean
    - All 4 hook scenarios verified: single-line commit, contributor commit with protected
      paths warning, team-mode task list `(@name)` check, staged-vs-working-tree divergence
    - Template `hooks.meta_ref_patterns` was missing `|\.arc/` — fixed in package template;
      dev config intentionally keeps the reduced pattern
    - `arc init` verified in both solo (`team.mode: false`) and team (`team.mode: true`,
      `sync_push: prompt`) modes — correct config, structure, and hooks
    - `arc update` changelog: displays "What's new" on version change, suppressed by `--quiet`
    - Atomic write recovery: corrupt pristine detected with clear messaging, rebuilt
      transparently, second update merges cleanly with zero changes

### **Phase 7:** `--reconfigure` Implementation

<!-- NOTE: Phase inserted after --reconfigure scoping session (2026-03-27).
     Phases 7-9 renumbered to 8-10 to accommodate. -->

**Purpose:** Add `--reconfigure` flag to `init` and `join`, enabling post-init changes to
structural settings (`pm_mode`, `team_mode`, `project_name`). Resolves the gap where
`arc update` uses frozen `install_config` from the manifest and post-init config edits
get overwritten.

**Design reference:** `notes-beta-readiness.md` § Phase 6B

**Strategies:** `strategy-testing-methodology.md`

- [x] **7.0 Extract shared file-change pipeline**

    **Goal:** Factor rendering, merging, and manifest I/O out of `commands/update.ts` into a
    shared pipeline that both `update` and `reconfigure` consume.

    - [x] **7.0.a Extract `FileChangePlan` type and `buildChangePlan` function**
        - `lib/manifest/plan.ts`: `FileChangePlan` type with `PlannedAddition`,
          `PlannedRemoval`, `PlannedMerge`, `PlannedSkip` entries
        - Pure `buildChangePlan` function: takes manifest, template file list, pristine
          store, arc-in-git set → returns plan with no side effects
        - 10 unit tests covering additions, removals, merges, skips, reclassification
          detection, purity, and output-to-template mapping

    - [x] **7.0.b Extract `applyChangePlan` and rendering helpers**
        - `lib/manifest/apply.ts`: `applyChangePlan` function with `ApplyIO`,
          `RenderContext`, `ApplyResult` types
        - Extracted `renderTemplate` and `safeUnlink` as shared exports
        - `runUpdate` refactored to `buildChangePlan` → `applyChangePlan` pipeline
        - 9 unit tests covering additions (with pristine skip for scaffolded), removals
          (Framework delete, Configurable keep, Scaffolded untouched), merges (three-way
          with pristine advance, pristine rebuild, missing file reinstall), and skip
          carry-forward
        - Full existing test suite passes: 523 tests (487 unit/integration + 36 E2E)

- [x] **7.1 `init --reconfigure` core flow**

    **Goal:** Enable re-entry into init for existing installations, gated by role.

    **Codebase note:** `handleInit` is in `handlers/init.ts`, dispatching to `runInit` in
    `commands/init.ts`. The `ALREADY_INSTALLED` check is a hard `throw` at `commands/init.ts`
    line ~119. `team_mode` is optional in `InstallConfig` — existing manifests from before
    team mode may have `undefined`; default to `false` when absent.

    - [x] **7.1.a Add `--reconfigure` flag and entry path**
        - `--reconfigure` flag added to init command in `cli.ts`
        - Three-way branch in `handlers/init.ts`: `--reconfigure` dispatches to
          `handleReconfigure` (checks installation, role gate, reads manifest, builds
          new config, delegates to `runReconfigure`); fresh init path unchanged
        - `commands/reconfigure.ts`: new `runReconfigure` orchestrator using the
          `buildChangePlan` → `applyChangePlan` pipeline from 7.0
        - `ALREADY_INSTALLED` error updated to mention `--reconfigure`
        - `NOT_INSTALLED` and `ROLE_FORBIDDEN` error codes added to `ArcErrorCode`
        - No-change detection in handler (compares all config fields)
        - 3 unit tests for `runReconfigure` (manifest missing, config update, result
          shape); entry path validation (role gate, not-installed) tested at handler
          level in integration tests

    - [x] **7.1.b Settings screen prompts**
        - `prompts/reconfigure-prompts.ts`: interactive `runReconfigurePrompts` (project
          name, PM mode, team mode with current values as defaults), team mode warning on
          enable, cancel handling
        - `buildNonInteractiveReconfigurePrompts`: `--yes` mode with CLI flag overrides
        - `buildReconfigureConfig`: merges prompt results with carried-forward tools
        - `isNoChange`: compares prompt result against current config (handles missing
          `team_mode` as `false`)
        - Handler wired: interactive when no `--yes`, non-interactive with flag overrides
          when `--yes`, no-change detection exits early
        - 13 unit tests covering defaults, flag overrides, missing `team_mode`, config
          merging, and no-change detection

- [x] **7.2 File delta resolution**

    **Goal:** Handle the three file change types when `install_config` changes. Uses the
    `buildChangePlan` / `applyChangePlan` pipeline extracted in 7.0 — reconfigure builds a
    plan from old config vs new config, then applies it.

    - [x] **7.2.a Recipe fix and file additions**
        - Moved `strategy-team-coordination.md` from unconditional `include_files` to the
          `team.mode == true` condition block in `init-recipe.json`
        - 2 actual-recipe tests verify solo-mode excludes / team-mode includes the file
        - Reconfigure orchestrator test confirms adding `pm.mode: arc-in-git` produces
          correct file additions via the existing `buildChangePlan`/`applyChangePlan` pipeline

    - [x] **7.2.b File removals (two-stage UX)**
        - New `prompts/removal-prompts.ts`: `RemovalDecision` type, `RemovalResolveFn`
          callback, `resolveRemovalsInteractive` (two-stage: summary → bulk/individual),
          `resolveRemovalsNonInteractive` (`--yes`: Framework→remove, others→keep),
          `applyRemovalDecisions` (splits into toRemove/toKeep for the pipeline)
        - `ReconfigureOptions.resolveRemovals` optional callback — when provided,
          intercepts plan removals before `applyChangePlan`; files to keep are excluded
          from the removal list (stay on disk, leave manifest)
        - `ReconfigureResult.keptByUser` tracks user-kept files
        - Handler wires interactive vs non-interactive resolve, handles cancellation
          via sentinel symbol, displays kept-by-user files in summary
        - 8 unit tests (4 non-interactive defaults, 4 decision application)
        - 2 orchestrator tests (callback controls keep/remove, `--yes` defaults)

    - [x] **7.2.c Content re-rendering**
        - Verified existing pipeline handles all three scenarios correctly:
        - Changed `project_name` → token re-render, clean three-way merge, pristine advanced
        - Changed `team.mode` → conditional block re-render, content updated
        - Unchanged config → `mergeFileContents` fast path returns unchanged
        - 3 orchestrator-level tests confirm behavior end-to-end

- [ ] **7.3 `--dry-run` mode**

    **Goal:** Preview reconfigure impact without applying changes.

    - Add `--dry-run` flag to `init --reconfigure`
    - Resolve file delta (additions, removals, re-renders) and report without disk writes
    - Reuses file delta resolution logic from 7.2

    Build `test-first` (one behavior at a time):
    - Reports files that would be added
    - Reports files that would be removed (with classification labels)
    - Reports files that would be re-rendered
    - No disk writes occur (manifest, pristine, files all unchanged)
    - No-change case reports "nothing would change"

- [ ] **7.4 `join --reconfigure`**

    **Goal:** Enable personal workspace reconfiguration for any developer.

    - Add `--reconfigure` flag to join command (`cli.ts`, `handlers/join.ts`)
    - Re-prompt for role and tools with current values as defaults
    - Update `arc.role` in git config, regenerate skills for new tool selection
    - Handle skill cleanup: `generateSkills` is additive — deselected tools leave orphan
      skill files. Add removal of old skill files before regenerating.
    - No role gate (personal reconfiguration, any role can use)
    - Idempotent on hooks and gitignore (already is for fresh join)

    Build `test-first` (one behavior at a time):
    - Role change updates git config
    - Tool change regenerates skills for new selection
    - Tool change removes skill files for deselected tools
    - Unchanged values produce no side effects
    - Works for both maintainer and contributor roles

- [ ] **7.5 Strategy doc realignment and discoverability**

    **Goal:** Align documentation with the new command surface and ensure clear signposting
    across all paths.

    - [ ] **7.5.a Update `strategy-configurability-architecture.md`**
        - Expand "pm.mode is structural" to document the full structural/runtime distinction
        - Replace single `--reconfigure` mention with proper command documentation
        - Document what reconfigure covers vs. what propagates automatically
        - Clarify that `tools` changes go through add-agent workflow, not reconfigure
        - Add command landscape reference (init / join / update / --reconfigure / add-agent)

    - [ ] **7.5.b Discoverability audit**
        - `--help` text on init, join, update pointing to related commands
        - Error messages as navigation signposts (extend ALREADY_INSTALLED pattern)
        - add-agent workflow: verify it doesn't reference reconfigure for tool changes
        - QUICK-REFERENCE: add reconfigure to ARC CLI Commands section
        - AGENT-BRIEFING files: ensure agent can guide users to the right command

    - [ ] **7.5.c Sync documentation changes to package source**
        - Updated strategy docs and workflow files reflected in
          `packages/arc-framework/arc/` source

- [ ] **7.6 Phase quality gates**

    - Tier 2: full markdown lint, TypeScript lint, shell lint, type check, full test suite,
      build verification
    - E2E: `arc init` → change config → `arc init --reconfigure` → verify file state →
      `arc update` → verify update uses new config
    - E2E: `arc join --reconfigure` role and tool changes
    - Verify `--dry-run` produces accurate preview matching actual reconfigure results
    - Verify role gate: contributor gets clear error on `init --reconfigure`
    - Verify idempotency: reconfigure with same values is a no-op
    - Verify `--yes` mode: non-interactive policy applies correct defaults for removals
    - Verify crash recovery: interrupt reconfigure before manifest write, re-run succeeds

### **Phase 8:** Docs Site

<!-- NOTE: Phase renumbered 6 → 7 → 8 after Phase 6 and Phase 7 insertions.
     Task numbers updated accordingly. -->

**Purpose:** Ship a docs site with foundation content covering what ARC is and how to get started,
plus stub infrastructure for WU5 expansion.

- [ ] **8.1 Pre-site content preparation**

    - [ ] **8.1.a Refresh `README-ASPIRATIONAL.md`**

        **Goal:** Bring the aspirational README current before using it as source material.

        - Remove `[PLACEHOLDER]` markers
        - Update CLI references to actual commands (`arc init`, `arc join`, `arc-resume`,
          `arc-handoff`)
        - Verify directory tour matches post-migration structure (single `.arc/`)
        - Tighten narrative based on what ARC actually is now
        - This is a content refresh, not a full rewrite — philosophy, tradeoffs, core loop
          are stable

    - [ ] **8.1.b Audit in-repo docs against docs-site boundary**

        **Goal:** Establish the principle for what ships in `.arc/` vs. what lives on the
        docs site, and identify extraction candidates.

        - Apply "point-of-use" principle: content agents need at runtime stays in `.arc/`;
          human-facing guides, conceptual deep-dives, and how-tos are docs-site candidates
        - Review supplemental workflows, strategy docs, and README material for boundary fit
        - Consider that agents commonly walk developers through processes (updates, config
          changes) — in-repo pointers to docs-site content may be appropriate even for
          human-facing material
        - Output: list of extraction candidates with rationale, and any content that should
          become foundation pages beyond the current 8.3 set
        - This audit informs Phase 7 page scope — defer final extraction decisions to results

- [ ] **8.2 Set up MkDocs infrastructure**

    - [ ] **8.2.a Create `mkdocs.yml`**
        - Material theme, site name ("ARC Framework"), repo URL
        - Full nav tree covering foundation and stub pages
        - Search enabled, color scheme configuration

    - [ ] **8.2.b Create `docs/` directory structure**
        - Subdirectories as needed for nav organization
        - All page files (foundation + stubs) created in this step

    - [ ] **8.2.c Add `site/` to `.gitignore`**

- [ ] **8.3 Write foundation pages**

    - [ ] **8.3.a Landing / Index page**
        - Adapted from refreshed `README-ASPIRATIONAL.md`
        - What ARC is, core development loop, design principles, honest tradeoffs
        - Light editing for docs-site voice (not a copy-paste)

    - [ ] **8.3.b Philosophy page**
        - Adapted from `strategy-core-philosophy.md`
        - P1–P11 with rationale, research citations, positioning
        - Restructure for docs-site readability (the strategy doc is reference-dense)

    - [ ] **8.3.c Getting Started page**
        - Install via `npx @arc-framework/cli init`
        - First session walkthrough (`arc-resume` → work → `arc-handoff`)
        - What happened: directory tour of `.arc/`
        - Depends on migration and CLI changes being complete

    - [ ] **8.3.d Sessions page**
        - Adapted from `strategy-session-management.md`
        - Why focused sessions, context degradation evidence, how sessions work
        - Natural session boundaries

    - [ ] **8.3.e Work Planning page**
        - Adapted from `strategy-work-planning.md`
        - Planning pipeline (idea → plan → PRD → tasks)
        - How tasks work, quality gates concept

    - [ ] **8.3.f Updating ARC page**
        - What `arc update` does (three-way merge, file classifications, what each means)
        - What's safe to edit (Configurable, Scaffolded) vs. auto-updated (Framework)
        - What to expect (output, conflict markers, counts, post-update state)
        - Pre/post update checklist (MW-M05)
        - Skill regeneration and customization warning (MW-M08)
        - Framework file edit warning (MW-M07)
        - Addresses MW-H04 via README pointer (6.7.a) + docs site deep-dive

- [ ] **8.4 Create stub pages**
    - Configuration Reference, Quality Gates, Team Coordination, Contributing to ARC,
      Comparison/Positioning, Tutorials
    - Each stub: brief description of what the page will cover, "detailed content coming in a
      future release" note

- [ ] **8.5 Set up docs deployment**

    - [ ] **8.5.a Create GitHub Action for docs**
        - Trigger: push to main
        - Steps: setup Python, install mkdocs-material, `mkdocs build`, deploy to GitHub Pages
        - Separate workflow file or new job in existing `ci.yml`

    - [ ] **8.5.b Verify deployment**
        - Push to main triggers build
        - Site accessible at GitHub Pages URL
        - Navigation, search, and all pages render correctly

- [ ] **8.6 Run quality gates**
    - `npm run -s lint:md` (new markdown files in `docs/`)
    - Verify mkdocs builds without errors locally (`mkdocs build`)

### **Phase 9:** Public Scaffolding + Hook Manager Integration

<!-- NOTE: Phase renumbered 7 → 8 → 9 after Phase 6 and Phase 7 insertions.
     Task numbers updated accordingly. -->

**Purpose:** Establish public presence and implement hook manager detection (P1).

- [ ] **9.1 Repo rename**
    - Rename `arc-agentic-dev-framework` → `arc-framework` on GitHub
    - Update all references: package.json repository field, GitHub Action URLs, any hardcoded
      repo name references
    - Verify: clone URL works, GitHub redirect from old name works, CI passes

- [ ] **9.2 README update**
    - Replace current development README with minimal public version
    - Content: what ARC is (one paragraph), current status (beta), install command, link to
      docs site, link to CONTRIBUTING.md
    - Not a full adoption-focused rewrite (WU5)

- [ ] **9.3 npm beta publish**

    - [ ] **9.3.a Prepare package for publish**
        - Update version to `0.1.0` (or appropriate beta version) in `package.json`
        - Verify `npm pack` includes correct files (`dist/`, `arc/`, `templates/`,
          `init-recipe.json`)
        - Verify `package.json` metadata (description, keywords, repository, license)

    - [ ] **9.3.b Publish and verify**
        - `npm publish` to registry
        - Verify `npx @arc-framework/cli init` works in a clean environment
        - Verify `npx @arc-framework/cli join` works in a project with `.arc/`

- [ ] **9.4 Hook manager detection and integration (P1)**

    - [ ] **9.4.a Create hook manager detection module**

        Build `test-first` (one behavior at a time):
        - Detects husky (`.husky/` directory)
        - Detects lefthook (`lefthook.yml` or `lefthook.yaml`)
        - Detects pre-commit (`.pre-commit-config.yaml`)
        - Returns `null` when no manager found

    - [ ] **9.4.b Integrate detection into `arc init` and `arc join`**

        Build `test-first` (one behavior at a time):
        - When hook manager detected, adds ARC hook calls to manager config instead of
          `core.hooksPath`
        - When no manager detected, falls back to `core.hooksPath` (current behavior)
        - Husky integration: adds to `.husky/pre-commit` and `.husky/commit-msg`
        - Lefthook integration: adds to `lefthook.yml`

    - [ ] **9.4.c Adopt husky in dev repo (P1)**
        - Install husky as dev dependency
        - Configure `.husky/` hooks to call ARC hook scripts
        - Verify hooks fire correctly through husky
        - This validates the integration path for adopters

- [ ] **9.5 Run quality gates**
    - Full Tier 2: `npm run -s lint:md`, `npm run typecheck`, `npm test`

### **Phase 10:** Verification

**Workflow:** [`verify-work-unit.md`][verify-work-unit] — load and follow for this phase.

<!-- NOTE: Phase renumbered 8 → 9 → 10 after Phase 6 and Phase 7 insertions.
     Task numbers updated accordingly. -->

- [ ] **10.1 Run Tier 3 quality gates** — begin [`verify-work-unit.md`][verify-work-unit]
- [ ] **10.2 Validate success criteria against PRD**
- [ ] **10.3 Verify all atomic tasks resolved** (`atomic-beta-readiness.md`)

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
- [ ] Git hooks validate staged content, not working tree (no false positives from unstaged changes)
- [ ] Single-line commits succeed (no silent `set -e` abort)
- [ ] `arc init` and `arc join` guard against non-git-repo and produce `UserFacingError` on failure
- [ ] `arc user load` backs up existing files before overwriting
- [ ] `arc user push`/`pull` detect divergence and surface decisions to user
- [ ] Pristine store uses per-file storage (no single-point-of-failure JSON blob)
- [ ] `arc update` writes atomically (crash-safe) and prevents downgrades
- [ ] Update documentation exists (README section + update guide)
- [ ] `pm.mode: none` path has no dead ends in workflow documents
- [ ] Team-mode workflows render team-specific guidance via template conditionals
- [ ] Team coordination strategy reads as advisory, not required infrastructure
- [ ] `arc init --reconfigure` changes `pm_mode`, updates manifest, adds/removes files correctly
- [ ] `arc init --reconfigure --dry-run` previews changes without applying
- [ ] `arc join --reconfigure` changes role and tools, updates personal workspace
- [ ] Reconfigure role-gated to maintainers; contributors get clear error
- [ ] Strategy doc documents full structural/runtime config distinction and command landscape
- [ ] Ready for multi-week beta test on external project

---

[verify-work-unit]: ../../../.arc/system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
