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

- [ ] **Design post-init agent onboarding experience**
    - Scenario: project initialized with Claude, developer later wants to add Gemini (or
      vice versa). The new agent can generate its own skill files, but gitignore entries,
      skill registration, and ARC-specific setup may be missed.
    - Options to evaluate: dedicated `arc add-agent` command, lightweight workflow doc the
      agent follows, extension to `arc join`, or just documentation. Consider: how does the
      agent discover ARC is present? How does it know to look at `.arc/system/skills/` for
      canonical definitions?
    - Related: skill generation already supports multiple tools — the machinery exists in
      `generateSkills()`, but there's no standalone entry point for adding a tool post-init.

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

---
