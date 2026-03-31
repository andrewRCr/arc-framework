# ADR-010: Replace Adoption Profiles with Strong Defaults

## Status

Accepted

## Context

ADR-004 established three adoption profiles (Essentials, Recommended, Custom) as CLI init presets that pre-configure
`arc-config.yml` enforcement settings. The profiles addressed a real concern: new adopters facing ~55 files and full
enforcement on first contact.

Two subsequent decisions changed the landscape:

**ADR-008/009 reduced the overwhelm problem.** The Core + optional PM mode decomposition (ADR-008, refined by ADR-009)
means adopters start with lean Core methodology by default. PM artifacts are opt-in via `pm.mode`. The "wall of files"
that motivated profiles is substantially smaller.

**Profiles' remaining value is thin.** With Core lean by default, profiles' differentiating settings reduce to 3-4 hook
and enforcement toggles (`commit.format`, `commit.context_footer`, `hooks.commit_msg`, `branch.protection`). This is too
thin to warrant named tiers that add conceptual overhead:

- **Naming confusion:** "Essentials" vs. "Core" invites misreading — are they the same thing? (They're not; Essentials
  was an enforcement posture, Core is a functionality scope.)
- **Pre-experience decisions:** Asking "Essentials or Recommended?" at init forces adopters to make enforcement choices
  before they've experienced the framework. They can't make informed decisions about whether conventional commit hooks
  will create friction until they've worked with the system.
- **Three-axis init flow:** With PM mode and team mode already in the init flow (ADR-009), adding a three-profile
  enforcement question creates a combinatorial decision space that's hard to reason about upfront.

**The good part of ADR-004 is independent of profiles.** The "config = enforcement, prose = guidance" philosophy (Part 3)
is sound design regardless of whether profiles exist. The same-files approach (Part 1) is preserved by the Core/PM
architecture. These survive; the profile packaging does not.

## Decision

### Part 1: Drop Named Profiles

We will remove Essentials, Recommended, and Custom as named adoption concepts. The Recommended profile's values become
simply "the defaults" — which they already are. There are no named tiers, no profile selection at init, and no
profile-aware onboarding differentiation.

**What `arc init` asks:** Team mode (solo/team) and PM mode (`none`/`arc-in-git`/`external`). No enforcement questions.
The framework ships with all enforcement active (the former "Recommended" values). Adopters who want to relax enforcement
edit `arc-config.yml` after init — the file includes inline comments explaining each setting and its alternatives.

**Self-serve discovery:** `arc-config.yml` with descriptive inline comments is the mechanism for adopters to discover and
adjust enforcement settings. Each setting documents its purpose, default, and alternatives. This replaces the
profile-selection ceremony with a lower-ceremony, higher-context mechanism — adopters adjust settings when they
encounter friction, not before.

### Part 2: Preserve Config-as-Enforcement Philosophy

The "same guidance, less enforcement" philosophy from ADR-004 Part 3 is preserved and reframed without profile
references:

- **Config** = enforcement boundary (will you be blocked?)
- **Prose** = quality guidance (what is the recommended approach?)
- **Relaxing config** = same guidance, less enforcement

This is good design independent of profiles. An adopter who sets `commit.format: any` still gets an agent that produces
well-formatted conventional commits — because the agent follows the methodology's prose guidance. The difference: the
hook will not reject non-conventional commits. The philosophy stands; the profile packaging around it does not.

### Part 3: Simplify Adoption Flexibility Model

The adoption flexibility model simplifies from three axes to two:

| Axis                 | What varies                   | Mechanism                      |
| -------------------- | ----------------------------- | ------------------------------ |
| Method customization | ARC defaults vs. team methods | Overrides (arc-methods.md)     |
| Functionality scope  | What features are installed   | PM mode selection (pm.mode)    |

Enforcement depth is no longer a named axis — it is simply "edit `arc-config.yml`." The settings exist, the inline
comments explain them, and adopters adjust what creates friction. This does not reduce capability; it removes a layer of
abstraction (named profiles, three-way init choice) that adds conceptual overhead without proportional value.

### Part 4: WU3 Conditional

A binary "relaxed start?" toggle in `arc init` may be reconsidered if CLI testing during WU3 reveals a cold-start
friction problem that self-serve config editing does not adequately address. This is scoped to CLI UX only — it would not
reintroduce named profiles or a multi-tier model. The decision is deferred to WU3's PRD phase, where it can be informed
by actual init-flow testing rather than pre-experience speculation.

## ADR-004 Dispositions

| ADR-004 Section                     | Disposition                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| Part 1: Same files, profile-based   | **Preserved.** Same files, config-driven — the approach stands.              |
| Part 2: Profile definitions         | **Superseded.** Named profiles removed; defaults are the defaults.           |
| Part 3: Same guidance, less enforce | **Philosophy preserved.** Reframed without profile references.               |
| Part 4: Two-axis adoption model     | **Simplified.** Enforcement depth drops as a named axis; two axes remain.    |
| Part 5: Scaling up and down         | **Preserved.** Scaling is a config edit — simplified framing, same mechanic. |
| Part 6: Onboarding differentiation  | **Superseded.** No profile-differentiated onboarding paths.                  |

## Consequences

### Positive

- **Fewer pre-experience decisions.** Adopters start with sensible defaults and adjust after encountering the framework,
  not before. This aligns with how most tools are actually adopted.
- **No naming confusion.** "Essentials" vs. "Core" ambiguity is eliminated. There is Core (the methodology), PM modes
  (the functionality scope), and config settings (the enforcement knobs).
- **Simpler init flow.** Two questions (team mode, PM mode) instead of three-plus. The init ceremony is lighter.
- **Self-documenting config.** Inline comments in `arc-config.yml` provide contextual discovery — adopters learn about
  settings when they open the file, with full context about purpose and alternatives.
- **Philosophy preserved.** The "config = enforcement, prose = guidance" design survives intact and is stronger for being
  decoupled from profile packaging.

### Negative

- **No guided relaxation path.** Adopters who would have chosen Essentials must now discover and edit individual settings
  themselves. The `arc-config.yml` inline comments mitigate this, but it's less guided than a named profile.
- **WU3 init may need a friction escape.** If testing reveals that full-enforcement defaults create a cold-start problem,
  the WU3 conditional (Part 4) provides a path — but it's not designed yet. There's a gap between "defaults are fine" and
  "defaults are blocking" that will only be visible during CLI testing.

### Risks

- **Cold-start friction underestimated.** If the 3-4 enforcement settings genuinely block first-run adoption for a
  significant segment, removing profiles removes the designed mitigation. The WU3 conditional provides a safety valve,
  but it's speculative until tested. Mitigation: WU3 PRD phase explicitly includes init-flow testing with enforcement
  defaults active.

---

Context: tasks-methodology-completion.md (Task 6.7 — replace profiles with strong defaults)
