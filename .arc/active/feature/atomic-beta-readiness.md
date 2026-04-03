# Atomic Tasks — Beta Readiness

**Purpose:** Tracking of indivisible one-off tasks you elect to do in parallel to the
planned work — discovered during execution, not required for the work unit's success
criteria. Flat checkbox list, no numbering hierarchy.

**Ordering:** Incomplete tasks (`[ ]`) stay at the top. Completed tasks (`[x]`) sink
below them in completion order (oldest completed first). See process-task-loop §
Atomic Task Completion for the full protocol.

> Multi-step work required for the WU belongs in the task list as a new phase.
> For multi-step work outside the WU's concern, see `manage-incidental-work.md`.

---

- [x] **`arc init` UX polish — full prompt overhaul** — Researched CLI scaffolder norms,
  evaluated clack vs Inquirer vs prompts (terkelg), discovered clack v1.1.0 added
  `autocompleteMultiselect` and `limitOptions` which solved most friction points without
  switching libraries. Bumped `@clack/prompts` from `^0.10.0` to `^1.1.0`. Restructured
  from `p.group()` to sequential prompts with `p.note()` preambles. Changes:
    - **Intro**: Branded header with version (`ARC Framework v{version} │ Initialization`)
      and subtitle (`Setting up ARC for your project...`)
    - **Project name**: Added explanatory `p.note()` (display name, not slug), title-cased
      default from directory basename
    - **Tools**: Switched from `groupMultiselect` to `autocompleteMultiselect` (type-to-filter,
      `maxItems: 8` for scrolling). Flat alphabetical list, standalone tool hints
      (`uses .claude/skills/`). Added `p.note()` preamble explaining Skill installation and
      tool-native directory respect. Added post-selection confirmation log.
    - **PM mode**: Replaced long inline hints with `p.note()` preamble describing all three
      options (including `arc-in-git` config name), followed by clean `p.select()`. Revised
      descriptions: "configurable codified standards", "planning pipeline", "work intake".
    - **Team mode**: Rewording from "Will other developers work in this repository?" to
      "Enable multi-developer coordination? (ARC Team Mode: task ownership, team handoffs,
      team branching)" — accurate to actual behavioral changes, doesn't conflate OSS
      contribution with concurrent ARC co-development.

- [x] **Remove `.gitkeep` scaffolding, create directories on demand** — Audited all workflows that
    create files in `active/{category}/` and `reference/archive/{category}/`. Archive workflow
    already used `mkdir -p`; activation workflow relied on pre-existing dirs from `.gitkeep`.
    Added `mkdir -p` to activate-work-unit.md (before `git mv`) and to PRD/task-generation
    workflows (for `none`/`external` PM modes where files write directly to `active/`). Removed
    6 `.gitkeep` files from init-recipe.json, classification.ts, manifest.json, template source,
    and strategy-file-classification.md inventory. Research confirmed modern tooling (Next.js,
    Vite, SvelteKit) favors on-demand creation over scaffolding. 365 tests pass.

- [x] **Standardize `npx arc` as canonical CLI invocation pattern** — Researched npm ecosystem
    patterns (husky, eslint, prettier, turbo, etc.) and cross-language distribution (lefthook,
    mise, just, gh). Key insight: frequent session commands (`arc user save`, `arc sync`) are
    agent-executed via workflows — agents don't care about `npx` prefix friction. Human-initiated
    commands (`arc init`, `arc join`, `arc update`) are infrequent one-offs where `npx` is the
    standard npm idiom. Decision: `npx arc` is the canonical invocation, no npm scripts/global
    install/shell aliases needed. Updated all executable CLI references in workflow docs,
    QUICK-REFERENCE, strategy docs, and READMEs (both `.arc/` and package counterparts).
    Standalone binary distribution (brew, curl) deferred to BACKLOG-TECHNICAL for post-beta.

- [x] **Design post-init agent onboarding experience** — Created dual-audience supplemental
    workflow `add-agent.md` for adding an agent that wasn't selected at init time. Covers:
    orient via AGENT-BRIEFING.ARC.md, check/create agent-specific file, generate skill files
    from canonical sources in `.arc/system/skills/`, handle tool-native vs universal skill
    directories, restart harness, then `/arc-resume` for normal operation. Added one-line
    reference from AGENT-BRIEFING.ARC.md footer. Added to init-recipe.json so it ships with
    new installs. No CLI command needed — workflow is agent-agnostic and accommodates future
    tools with unknown directory conventions.

- [x] **Add `arc-task-audit` canonical skill** — Pre-implementation audit skill for surfacing
    assumptions, masked design decisions, codebase drift, ordering risks, scope ambiguity,
    interface contracts, test strategy gaps, and missing acceptance criteria before task
    execution begins. Registered in `CANONICAL_SKILLS`, `init-recipe.json`, both skills
    READMEs, file classification inventory. Backfilled `arc-setup` and `arc-verify` entries
    missing from classification inventory. Fixed brittle test: hardcoded skill count →
    `CANONICAL_SKILLS.length * 2`.

- [x] **Add code linting (ESLint + shellcheck)** — Added ESLint with `typescript-eslint`
    `recommendedTypeChecked` preset for CLI source (33 TS files) and shellcheck via npm
    wrapper for githooks and system scripts. ESLint found 7 issues (useless assignment,
    `no-base-to-string`, unnecessary type assertions, sentinel throw pattern). Shellcheck
    found shebang correctness issue (`#!/bin/sh` on scripts using `local`), a `grep | wc -l`
    that should be `grep -c`, and style preferences (suppressed where intentional). Added
    `lint:ts` and `lint:sh` npm scripts, CI steps, and updated QUICK-REFERENCE and
    DEV-RULES.PROJECT quality gate documentation across all tiers. No adopter impact — all
    devDependencies, not in package `files` field.

- [x] **Extract hook check parameters to arc-config.yml** — Pre-commit meta-project
    reference check had hardcoded whitelist of code extensions (`ts|tsx|py|js|jsx`) with
    inline "Adopter: adjust" comments — not viable for a language-agnostic framework, and
    edits would be lost on `arc update` (Framework-classified files). Flipped to blacklist
    approach (`hooks.skip_extensions`) listing non-code text extensions; binary files handled
    automatically via `grep -I`. Added `hooks.test_patterns` for test directory exclusion.
    Both settings in `arc-config.yml` with sensible defaults. Updated `validate-config.sh`
    known keys. Removed misleading inline customization comments from hooks.

- [x] **Refactor cli.ts into handler architecture** — Extracted the 1010-line monolithic CLI
    entry point into a handler-per-command architecture. `cli.ts` reduced to 126 lines of
    pure Commander wiring. `src/handlers/` (6 files) owns the CLI adapter layer per command
    area, with `shared.ts` consolidating repeated patterns (`runWithSpinner`, `isHandledError`,
    `resolveUserIdentity`, `requireGitRepo`, `readPmMode`, `isRemoteError`).
    `src/lib/io-context.ts` extracts all I/O factory functions (`createIOContext`,
    `createUserIOContext`, `gitExec`, `writeGitNote`, `readGitNote`, `readUserDir`). Pure
    refactor — zero test changes, all 434 tests pass, lint/typecheck clean.

- [~] **Create methodology update dependency checklist / guide**
    - **Deferred:** Not blocking beta readiness — this is a process improvement for ongoing
      development. Routed to ATOMIC-INBOX for pickup in a future work unit.
    - Problem: No defined guidance for what needs updating when methodology content changes.
      Currently relies on session memory and carry-forward notes (e.g., package sync caution).
      Risk of drift between canonical source (`packages/arc-framework/arc/`), local installation
      (`.arc/`), strategy docs, subdir READMEs, indexes, CLI source, and docs site.

- [x] **Audit for docs orphaned during Phase 2 self-hosting migration** — Diffed `.arc-internal/`
    tree from commit before deletion (`017ece8^`) against current `.arc/`. Found 59 files that
    existed in `.arc-internal/` but were never copied to `.arc/` during migration: 14 ADRs
    (adr-001 through adr-014), 2 analysis docs, 12 research files, and 31 archive files
    (WU1–WU7 PRDs, task lists, completion docs, notes). Restored all to their correct `.arc/`
    locations. 3 agent-specific files (COPILOT, GEMINI, WARP) correctly live only in
    `packages/arc-framework/arc/` (template files for adopters). `strategy-testing-methodology.md`
    was already restored in a prior session.

---
