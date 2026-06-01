# Draft: Skill Infrastructure Cleanup

- **Origin:** [internal] — two skill-inventory / infrastructure concerns routed from `USER-INBOX` at the
  work-routing-discipline housekeep drain (2026-06-01).
- **Purpose:** Two related skill-infrastructure cleanups — standardize SKILL.md frontmatter to the
  agentskills.io spec, and re-evaluate whether once-per-install operations (`arc-setup`, possibly `arc-verify`)
  should hold skill inventory at all (skill-vs-workflow placement).

---

## Scope (routed captures — iterate into a plan)

### Standardize ARC skill frontmatter to the agentskills.io spec

ARC's SKILL.md frontmatter (`name` / `description` / `disable-model-invocation`) largely matches the
agentskills.io spec (<https://agentskills.io>) already; confirm two points and trim accordingly:

- Is `disable-model-invocation` actually part of the universal spec, or a Claude-only extension?
- Does it earn its place — it is `false` on every skill except `arc-setup` (`true`), and if `false` is the
  harness default, those redundant `false` declarations are just noise to drop (keep `arc-setup: true`, which is
  load-bearing).

Touches every skill's SKILL.md under `.arc/system/.internal/skills/` + the package mirror + the harness-regen
path.

### Re-evaluate skill-vs-workflow placement of `arc-setup` (and possibly `arc-verify`)

Surfaced by the `arc-resume` → `arc-session` rename: `arc-session` (used every session) now collides on
tab-completion in the skill picker with `arc-setup` (used once when first installing ARC), and the rarely-used
name keeps stealing autocomplete from the every-session one. The collision is the prompt; the deeper question is
whether a once-per-install operation should hold skill inventory at all. Evaluate per skill — `arc-setup` is the
clear case for "should be a workflow, invoked when needed, not a skill"; `arc-verify` is a weaker case
(occasionally invoked for diagnostics) but probably the same call.

**Scope of move (per skill that migrates):** retire the SKILL.md source under `.arc/system/.internal/skills/<name>/`
plus the package mirror; update the harness-regen path so the gitignored harness copies (`.claude/skills/`,
`.codex/skills/`, …) stop being produced for it; route invocations through workflow loading or a CLI command as
appropriate; sweep adopter-facing references ("run the `arc-setup` skill" → "follow the setup workflow").
Side-benefit: frees the skill-picker autocomplete namespace for the every-session skill.

---

## Scope Estimate

Small–medium; touches every SKILL.md under `.arc/system/.internal/skills/` + the package mirror + the
harness-regen path, plus adopter-facing skill references. Carries a design question (which once-per-install
skills migrate, and to workflow vs. CLI).
