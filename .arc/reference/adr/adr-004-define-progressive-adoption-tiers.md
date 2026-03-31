# ADR-004: Define Progressive Adoption Tiers

## Status

Accepted (Parts 2, 3, 6 superseded by ADR-010)

## Context

ADR-001 established 11 principles and 19 conventions, drawing a sharp boundary between what defines ARC (principles)
and what's configurable (conventions). ADR-003 designed the configuration and extension point system that makes
conventions adjustable. But a question remains: how do new adopters *start* with ARC?

The framework currently presents as all-or-nothing. ~55 files, 8 strategies, 12+ workflows, session ceremonies,
commit hooks, archive processes. An adopter evaluating ARC must decide: commit to the full system, or walk away.
There's no guided middle ground.

**The tension:** ARC's value comes from its internal consistency — cross-referenced documents that reinforce each
other. Removing pieces breaks references and loses coherence. But requiring the entire system upfront creates an
adoption barrier that excludes teams who would benefit from ARC's principles but aren't ready for every convention.

**The goal:** Enable progressive adoption that preserves system coherence. Don't dilute the system to offer
"take what you need." Don't require "take it or leave it" either.

**What "minimum viable ARC" means:** The 11 principles are the philosophical floor — honor all of them or you're
not meaningfully using ARC. But the adoption question isn't "which principles?" — it's "how much of ARC's provided
machinery do you use to satisfy those principles?" An adopter could honor P7 (task tracking) with Jira, P6
(traceability) with informal but consistent commits, P5 (context preservation) with a lighter session mechanism.
The principles are always the same. What varies is how much of ARC's convention set you adopt as-is vs.
bring-your-own or configure away.

**PRD requirement 6:** "Specify what's in basic vs. full ARC and how the distinction is implemented. Resolve
whether this is a structural difference (different files), a documentation/framing difference (same files, guided
onboarding), or config-driven."

**Evidence base:** Five implementation approaches were evaluated against practical adopter scenarios, tracing
through the full workflow lifecycle (create-prd → generate-tasks → activate → process-task-loop → archive) for
each approach. The evaluation included analysis of cross-reference integrity, scaling behavior, and the
prose-vs-config conflict that arises when agent-loaded guidance describes conventions that config has relaxed.

## Decision

### Part 1: Same Files, Profile-Based Adoption

We will implement adoption tiers as **config-driven profiles** applied to an **identical file set**. Every ARC
installation receives the same ~55 files regardless of adoption profile. The tier distinction is expressed
through `arc-config.yml` values and onboarding guidance, not through file presence or absence.

**Why not structural tiers (different files):** ARC's documents are heavily cross-referenced. Removing files
creates broken references — STRATEGY-INDEX entries pointing to missing strategies, workflows linking to absent
docs. Maintaining parallel reference sets (one for basic, one for full) is a significant maintenance burden.
And scaling up from basic to full would require adding files after the fact — a reinstallation event rather than
a settings change.

**Why not documentation-only tiers (same experience, different guides):** Necessary but insufficient. Without
config-level changes, an essentials adopter still hits the same hook enforcement on first commit. The audit
identified 3 adoption-blocking dealbreakers (conventional commit format, context footer, squash merge) — all
require config-level resolution, not just documentation framing.

**Why profiles work:** The system stays coherent (all cross-references intact). Config settings have mechanical
teeth (hooks respect them). Scaling is a settings change. The CLI creates differentiated first-run experiences.
The docs site provides progressive learning paths. Same files, different enforcement, guided depth.

### Part 2: Profile Definitions

CLI init offers three profile options that pre-configure `arc-config.yml`:

**Essentials** — Principles committed, enforcement relaxed, progressive path to deeper engagement.

```yaml
# Essentials profile — arc-config.yml values
commit.format: any
commit.context_footer: optional
hooks.commit_msg: disabled
hooks.pre_commit: enabled
merge.strategy: merge
branch.protection: unprotected
```

Post-init guidance emphasizes four workflows as the starting path: `create-prd`, `generate-tasks`,
`process-task-loop`, and `session-init`. Remaining workflows and strategies are present and available but not
foregrounded in initial onboarding.

**Recommended** (default) — Full convention set with sensible defaults. All enforcement active.

```yaml
# Recommended profile — arc-config.yml values (ARC defaults)
commit.format: conventional
commit.context_footer: required
hooks.commit_msg: enabled
hooks.pre_commit: enabled
merge.strategy: merge
branch.protection: partial
```

Post-init guidance covers the full system with appropriate progressive depth.

**Custom** — Interactive selection of individual settings. The convention-à-la-carte approach with CLI guidance.
Each setting is presented with its purpose, default, and alternatives. The adopter builds their own profile
by choosing values for each configurable convention.

Profiles are a CLI init convenience — they pre-fill `arc-config.yml`. After init, the file is directly editable.
There is no persistent "profile" concept in the framework; the config values are what matter.

### Part 3: Same Guidance, Less Enforcement

The profile distinction is about **enforcement depth**, not **guidance depth**. ARC's workflow and strategy
documents are static prose — they describe conventions as the recommended approach regardless of profile.
The agent loads these documents during session-init and follows the guidance they contain.

This means an essentials adopter whose config says `commit.format: any` will still have an agent that produces
well-formatted conventional commits — because the agent read the development methodology strategy, which
describes conventional commits as the recommended format. The difference: the hook won't *reject*
non-conventional commits.

**This is intentional, not a conflict.** The separation is:

- **Config** = enforcement boundary (will you be blocked?)
- **Prose** = quality guidance (what's the recommended approach?)
- **Essentials** = same guidance, less enforcement

Adopters choosing essentials typically want to avoid *friction* (hook rejection, ceremony blocking), not *quality*
(well-formatted commits, thorough documentation). The agent producing quality output even when not enforced is a
feature — it demonstrates the convention's value and may motivate the adopter to turn enforcement on later.

### Part 4: Two-Axis Adoption Model

Profiles address one axis of adoption flexibility: **enforcement depth**. A second axis is necessary for
complete adoption flexibility: **method customization**.

**The gap profiles don't cover:** An adopter who wants `[JIRA-XXX] description` as their commit format doesn't
want ARC's conventional commits *or* no enforcement — they want *their* format. A team using Jira for task
tracking doesn't want to skip task completion tracking — they want to track completion *in Jira*. These are
active alternative practices, not absence of preference.

Three adopter postures exist:

1. "I don't care about format" → `commit.format: any`, agent produces quality output. **Profiles handle this.**
2. "I want ARC's convention enforced" → `commit.format: conventional`, hooks enforce. **Profiles handle this.**
3. "I want something different enforced" → No mechanism in profiles alone. **Method overrides needed.**

**The two axes are independent:**

| Profile         | No method overrides   | Selective overrides            | Heavy overrides                     |
|-----------------|-----------------------|--------------------------------|-------------------------------------|
| **Essentials**  | Solo dev learning ARC | —                              | Evaluating team, existing practices |
| **Recommended** | Full ARC adoption     | Team with Jira + custom format | Heavily customized team             |
| **Custom**      | Selective enforcement | Mixed adoption                 | Full customization                  |

**Method override mechanism:** A structured way for teams to replace specific ARC default methods with their own
implementations, following the same cross-reference pattern as extension points. The mechanism is designed in
ADR-005 (external tool and platform compatibility). This ADR establishes the requirement: the full adoption
flexibility story requires both enforcement profiles (this ADR) and method-level customization (ADR-005).

The three customization mechanisms together cover the full space:

- **Config** toggles enforcement (mechanical behavior)
- **Extensions** add behavior at workflow points (additional steps)
- **Method overrides** replace default convention implementations (alternative practices)

### Part 5: Scaling Up and Down

The same-files, config-driven approach enables smooth scaling in both directions:

**Scaling up (essentials → recommended):** Tighten config settings. Change `commit.format: any` to
`commit.format: conventional`, enable `hooks.commit_msg`. No file additions, no reinstallation. The agent
already knows the conventions from loaded docs — enforcement simply catches up to guidance. This is the
expected happy path: an essentials adopter grows comfortable with ARC's conventions (which the agent has been
demonstrating) and decides to enforce them.

**Scaling down:** Loosen config settings. Additionally, ceremony weight scales by work complexity (WU2 Cluster J
designs simplified archive paths for small work), orthogonal to adoption profile.

**Adding method overrides:** Independent of profile changes. A recommended-profile team that adopts Jira can add
a task-completion-tracking method override without changing their enforcement profile.

### Part 6: Onboarding Guidance Differentiation

Profiles influence not just config values but also the onboarding experience:

- **Post-init messaging** differs by profile: essentials highlights the core workflow quartet (create-prd,
  generate-tasks, process-task-loop, session-init); recommended covers the full system.
- **Docs site progressive guide** (WU4) creates profile-aware learning paths: "If you chose essentials,
  start here. When you're ready for more, see these sections."
- **Session-init loads all docs regardless of profile** — the agent benefits from complete context. The
  differentiation is in human-facing onboarding, not agent context.

This is a WU3 (CLI post-init messaging) and WU4 (docs site content) concern. The ADR establishes the
requirement; implementation details are downstream.

## Consequences

### Positive

- **Zero cross-reference breakage.** Every installation has the same files. STRATEGY-INDEX is always complete.
  Workflows always find their referenced strategies. The system's internal consistency — its core value — is
  preserved at every adoption level.
- **Smooth scaling path.** Essentials → recommended is a config change, not a migration. This removes the
  "commitment cliff" where adopters must decide everything upfront. They can grow into the framework.
- **Audit dealbreakers resolved at the right layer.** The three adoption-blocking issues (conventional commits,
  context footer, squash merge) are config settings that profiles pre-configure. Essentials adopters never hit
  these walls.
- **Agent behavior is consistently high-quality.** The agent reads the same docs regardless of profile and
  produces quality output. Essentials doesn't mean lower quality — it means lower friction. This is a strong
  selling point: "even at the lightest adoption level, your agent follows best practices."
- **Forward-compatible with method overrides.** The two-axis model cleanly separates enforcement (profiles) from
  customization (methods). Neither mechanism needs to know about the other. Profiles can be finalized before the
  method mechanism is fully designed.
- **CLI implementation is straightforward.** Profiles are config presets + post-init message variants. No
  conditional file installation, no template variants, no parallel maintenance.

### Negative

- **"Essentials" may underwhelm.** If the only tangible difference is relaxed hooks and different post-init
  messaging, adopters may wonder what they gained. The value is in what they *don't* encounter (friction), which
  is harder to perceive than what they *do* get. Documentation must make the progressive path feel intentional,
  not like "we just turned some stuff off."
- **Agent over-delivery may confuse.** An essentials adopter who chose `commit.format: any` may be surprised
  when the agent still produces conventional commits. The behavior is correct (guidance without enforcement) but
  the expectation may be "I turned that off." Session-init config awareness (reading `arc-config.yml` and noting
  deviations) would help the agent adapt, but is a WU2 addition, not guaranteed at launch.
- **Two-axis model adds conceptual complexity.** "Profiles control enforcement, methods control customization"
  is clean once understood but is more complex than a simple "basic vs. full" binary. Documentation must make
  this intuitive without requiring adopters to understand the model abstractly.
- **Method override dependency.** Profiles alone are insufficient for teams with active alternative practices.
  ADR-005 designs the method override mechanism that completes the adoption story; implementation is WU2 scope.
  Until WU2 ships the mechanism, those teams have a designed but not yet operational customization path.

### Risks

- **Profile names may not land.** "Essentials" and "Recommended" are working labels. If adopters interpret
  "essentials" as "missing features" rather than "focused starting point," the framing fails. WU4 naming and
  positioning work is important.
- **Gentle over-delivery becomes gentle annoyance.** For adopters with active alternative preferences (Case 3),
  the agent following ARC defaults despite config relaxation is friction, not a feature. This is mitigated by
  method overrides (ADR-005) but exists as a real gap until that mechanism ships.
- **Profile proliferation.** Three profiles (essentials, recommended, custom) is manageable. If pressure
  emerges for additional profiles (e.g., "team essentials," "solo advanced"), resist — custom mode already
  covers edge cases. Profiles should remain a small set of well-tested presets.
- **Session-init context loading may be heavy for essentials.** Loading 8+ docs is the same regardless of
  profile. For IDE agents with limited context windows, this is a real cost. ADR-002 already acknowledges
  ceremony adaptation by agent type — this intersects with but is distinct from adoption profiles.

---

Context: tasks-philosophy-configurability.md (Task 5.1)
