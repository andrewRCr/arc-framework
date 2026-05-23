# Draft: Composable Workflows

- **Origin:** [internal] — surfaced during scalable-core deliberation while examining how workflows scale
  across modes and tiers.
- **Purpose:** Capture the idea of scaling workflows by **resolve-then-load composition** — loading only the
  fragments that apply to the resolved configuration — rather than carrying every branch inline and telling
  the agent to skip the inapplicable ones. This is the mechanism `adr-020` §9 names as a requirement and
  defers here for design.

---

## Problem / Motivation

ARC's lifecycle workflows scale across modes and tiers today via **carry-and-skip**: inline conditionals
(`arc-in-git only`, `skip under none/external`) that every reader parses even when inapplicable. This works
and is DRY, but it imposes a **judgment tax** — simple cases carry the instruction load of complex ones,
and they cannot be fully isolated without duplicating documents.

That framing is a false dilemma. A third option — **composition** — lets a fragment live once and load only
when its condition holds: as DRY as an inline block, but with real isolation (the simple case never *sees*
the complex-case instructions). ARC already runs this pattern: extensions/methods are declared in workflow
frontmatter and the session-init probe resolves the active set, loading fragment actions at named
fire-points only when active. The scalable-core traces confirmed the surfaces that already use this
(extensions, fired by active-set membership) are the clean, orthogonal ones; the inline-gated backlog steps
are the seam-y ones.

## Design Sketch

- **Resolve-then-load over carry-and-skip.** The probe resolves the active configuration (tier, Planning
  Module on/off, tracker present); workflows load only the applicable fragments.
- **Hub/spoke, within bounds.** A lean core (invariant, tier/mode-agnostic spine) plus conditionally-loaded
  spokes for mode/tier-specific steps. Anchor the spoke mechanism on the existing extension/active-set
  surface rather than inventing new machinery.
- **Extraction rule.** Extract *whole conditional steps/blocks* to fragments; keep fine-grained
  *intra-step* branches inline (they don't extract without ugly seams).
- **The conductor's depth-selection is the tier-axis instance** of the same principle (minimum / standard /
  expanded as selectable depth) — unify, don't duplicate.

## Open Design Questions

- **`system/workflows/` navigability.** Decomposing into core + fragments risks death-by-a-thousand-includes
  and harms locality for maintainers (inline shows the whole behavior in one place). The directory likely
  needs a structural reshape — this is the central design problem, not a detail.
- **Core/fragment boundary.** Where the cut falls determines whether the core re-bloats (judgment tax
  remains) or over-fragments (composition overhead). Get it wrong in either direction and the win evaporates.
- **Maintainer locality vs. agent execution-load.** The trade is real; the priority here is execution-time
  load, but the maintainer cost must stay bounded.

## Relationship to other work

- **`adr-020` §9** establishes the requirement and direction; this WU owns the mechanism design.
- **`plan-workflow-template-loads.md`** is adjacent (an `arc.templates` frontmatter-load category) — same
  declared-load family, narrower scope. Coordinate so the two don't design overlapping load machinery.
- **agent-context-optimization cohort** (`plan-loadset-composition.md`, `plan-instruction-optimization.md`,
  `plan-documentation-surface-routing.md`) shares the north star of reducing agent context/instruction load.
  Considerable goal-overlap — coordinate to avoid designing the same thing twice; this may belong in or
  beside that cohort once sequenced.
- **`plan-arc-plan-conductor.md`** already implements the depth-selection instance of resolve-then-load for
  the planning entry; the lifecycle-workflow extension of that model (per ADR-020's conductor steer) is the
  natural integration point.

## Scope Estimate

Medium–Large, and design-heavy — the navigability/reshape question needs resolution before implementation.
Graduation trigger: when scalable-core's workflow reform (or a conductor lifecycle pass) forces the
inline-gated steps to be touched at scale, this mechanism should land first so they move to fragments rather
than accreting more inline branches.

---
