# Atomic Tasks — Beta Readiness

**Purpose:** Tracking of indivisible one-off tasks you elect to do in parallel to the
planned work — discovered during execution, not required for the work unit's success
criteria. Flat checkbox list, no numbering hierarchy. Incomplete tasks stay at the top;
move completed tasks below them (completion order) to keep pending work visible.

> Multi-step work required for the WU belongs in the task list as a new phase.
> For multi-step work outside the WU's concern, see `manage-incidental-work.md`.

---

- [ ] **Design idiomatic CLI invocation pattern for adopters**
    - Problem: `arc` CLI is a local devDependency, so bare `arc` commands fail — adopters
      must use `npx arc` for session lifecycle commands (`arc user save`, `arc sync`).
      These are frequent, session-boundary operations where `npx` friction compounds.
    - Research needed: Survey how comparable cross-project dev tools handle this (husky,
      commitlint, lint-staged, turbo, etc.). Evaluate global install recommendation,
      npm script convenience wrappers, postinstall bin linking, or hybrid approaches.
    - Approach: External research first, then decide on a recommendation and whether
      `arc init` should automate any setup (e.g., suggest global install, add npm scripts).
    - Files: docs (QUICK-REFERENCE, README), possibly `arc init` post-setup messaging

- [ ] **Evaluate `.gitkeep` scaffolding in `active/` and `archive/` subdirectories**
    - Problem: `arc init` creates `active/{feature,incidental,technical}/` and matching
      `archive/` dirs with `.gitkeep` files. Post-init these are empty clutter — adopters
      only ever have one active category at a time, and `.gitkeep` files linger after dirs
      are populated.
    - Evaluation: Audit work-unit-lifecycle workflows (`activate-work-unit.md`,
      `archive-work-unit.md`) to confirm they create category subdirs on demand. If
      workflows handle dir creation reliably, remove `.gitkeep` scaffolding from init —
      dirs appear only when needed, disappear when empty. Cleaner workspace, same
      structural correctness.
    - Considerations: `.gitkeep` files currently communicate structure to new adopters.
      Weigh that signal value against workspace noise. If removing, ensure `init-recipe.json`
      and `classification.ts` are updated, and README or workflow docs communicate the
      expected structure instead.
    - Files: `packages/arc-framework/src/commands/init.ts`, `init-recipe.json`,
      `classification.ts`, work-unit-lifecycle workflows

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

---
