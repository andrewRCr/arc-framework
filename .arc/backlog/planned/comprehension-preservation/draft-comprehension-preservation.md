# Draft: Comprehension Preservation (the ride-along posture)

**Purpose:** Make the human operator's mental model of the codebase a first-class, *user-declared* concern under
delegated and batched execution — a `ride-along` involvement posture where work proceeds at full delegation
eligibility but the artifacts are written to **teach**, not just to audit. Comprehension erosion — the DRI losing
the understanding that makes them a real DRI months later — is arguably the biggest standing risk in agentic
development; actively defending against it is a differentiating feature squarely on ARC's identity, not a
concession.

- **State:** Draft — captured 2026-07-02. Pre-PRD.
- **Created:** 2026-07-02
- **Origin:** [internal] — surfaced in the `--plan` grooming session (2026-07-02) that minted
  `execution-delegation-doctrine`; the doctrine names this lever's legitimacy, this WU designs it.

---

## Problem / Motivation

Per-leaf involvement kept the human's model of the codebase fresh as a *side effect* — watching implementation
land, increment by increment, taught cumulative code familiarity even when each stop carried no decision. As
delegation and widened review increments remove that incidental teaching, design-level involvement (planning
stages, terminal gates, PR review) preserves design understanding but not code familiarity. The erosion runs on a
long time constant and is invisible until it matters — debugging under pressure, evaluating a proposal months
later, onboarding someone else.

The insight: **audit artifacts and orientation artifacts are different genres.** The deviation ledger answers
"what was decided, where was latitude exercised" — the *gate* needs that. The human's model needs "how does this
work now, what pattern should I carry forward" — a guided tour, not an audit trail. Conflating them serves
neither.

## Proposed Shape

- **A declared involvement posture (`ride-along`, name provisional).** When declared, delegated/batched work
  additionally produces an **orientation layer**: phase summaries structured as guided tours (what changed, why,
  which patterns to know), and an optional interactive walkthrough at the terminal gate — the agent presents the
  design of what landed; the human drills in where they choose. Costs nothing when off.
- **Non-paternalism as a hard floor.** The posture is *declared, never inferred*. ARC cannot know the human's
  internal familiarity and must never model it — no "suggest you stay close to this one for your own benefit."
  The lever exists in the docs; the human invokes it. Opt-in by construction. (A user-initiated standing request
  — "nudge me when I haven't touched X in a while" — would be opt-in and thus legitimate, but is deferred, not
  v1.)
- **User-level, not project-level.** The posture is inherently personal (my model, my familiarity) — the opposite
  pole from `unit-scoped-review`'s project-level governance knob. First user-level involvement preference in ARC;
  the config surface consumes whatever the `configuration` cohort lands for user-scoped settings.
- **Teaching-aware artifact guidance.** Even outside the posture, ledger entries and phase summaries written as
  *teaching artifacts, not just audit trails* is cheap when stated as a goal — candidate guidance for the
  batch-mode artifact conventions this WU coordinates with `unit-scoped-review`.

## Composition / Dependencies

- **Depends On `execution-delegation-doctrine`** — the doctrine names the concern and the lever's legitimacy;
  this WU builds the mechanism.
- **Coordinate with `unit-scoped-review`** — the orientation layer rides its batch artifacts (ledger, phase
  summaries, terminal validation gate); define the genre boundary (audit vs. orientation) jointly.
- **`configuration` cohort (`config-storage-architecture` / `customization-arch-realign`)** — user-scoped config
  surface; consume, don't invent.

## Unknowns and Assumptions (for PRD)

- Naming (`ride-along` is provisional) and posture granularity (per-WU declaration vs. standing user preference
  vs. both).
- Walkthrough mechanics at the terminal gate — artifact, interactive exchange, or both; what survives to the PR.
- Whether the orientation layer has value in ordinary per-leaf mode too (lighter form), or is batch-only.

## Provenance

Captured 2026-07-02 from the `execution-delegation-doctrine` grooming session, where the "written as teaching
artifacts, not just audit trails" thread and the non-paternalism constraint were settled.

---
