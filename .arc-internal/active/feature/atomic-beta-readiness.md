# Atomic Tasks — Beta Readiness

**Purpose:** Tracking of indivisible one-off tasks you elect to do in parallel to the
planned work — discovered during execution, not required for the work unit's success
criteria. Flat checkbox list, no numbering hierarchy.

> Multi-step work required for the WU belongs in the task list as a new phase.
> For multi-step work outside the WU's concern, see `manage-incidental-work.md`.

---

- [ ] **`arc init` UX polish: startup messaging and prompt guidance** — Research CLI scaffolder
  norms (npm init, create-next-app, Yeoman, Vite) for intro/welcome patterns. Add brief
  orientation before first prompt. Add placeholder text or hint to project name prompt
  clarifying it's a display name for docs (not a slug or directory name), with casing guidance.
  Also: multiselect tool prompt needs control hint (space to toggle, enter to confirm) — clack
  doesn't surface this clearly and users press enter expecting it to select, which submits instead.
  Group headers (Universal, Standalone) are selectable as "select all" — wrong default for this
  use case (most users pick 1-2 tools, not all). Evaluate switching to flat `multiselect` or
  disabling group selection. Additionally, the tool list is long enough to overflow shorter
  terminal windows (common in IDE-embedded terminals) — research viewport-aware patterns and
  consider whether grouping is worth the vertical cost.

- [ ] **`arc init` UX polish: PM mode prompt rendering** — clack `select` renders hint text in
  parentheses after each option label, which is ugly for longer descriptions and produces a
  double-parenthetical on the first option (hint text contains its own parenthetical). Research
  alternatives: clack `note` before a simpler select, custom renderer, or restructured hint text
  that avoids nesting. All three PM options need hint text review for how they actually render
  in-terminal, not just how they read in source.

- [ ] **`arc init` UX polish: team mode prompt wording** — "Will other developers work in this
  repository?" conflates open-source contribution with concurrent co-development. A solo
  maintainer of an open-source project would answer "yes" but doesn't want team mode. Team mode
  gates multi-developer session sync — the prompt needs to communicate that distinction. Consider
  rewording to something like "Will multiple developers use ARC simultaneously?" or adding a hint
  that clarifies what team mode actually controls.

---
