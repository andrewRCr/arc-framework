# Atomic Tasks — Beta Readiness

**Purpose:** Tracking of indivisible one-off tasks you elect to do in parallel to the
planned work — discovered during execution, not required for the work unit's success
criteria. Flat checkbox list, no numbering hierarchy.

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

---
