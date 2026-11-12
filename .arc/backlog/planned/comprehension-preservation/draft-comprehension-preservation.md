# Draft: Comprehension Preservation (the ride-along posture)

**Purpose:** Make the human operator's mental model of the codebase a first-class, _user-declared_ concern under
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

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Co-locate light code maps of each codebase area's modules and seams, kept true by the lifecycle**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-11-10).

- _Shapes:_ § Proposed Shape, the orientation layer.

- _Observation:_ Owner interest (2026-11-08) as a potential ARC product feature, possibly soon, and backfilled in this
  repository and CineXplorer as work goes, if it can be made principled and researched. A short Markdown map
  co-located with an area of code (its domains, how its modules interact, its seams and invariants) serves people
  refreshing their understanding and agents orienting without as much read-only scouting. The risks: a brittle
  maintenance trap, sprawl no one reads, and a stale map misleading an agent worse than none. The deciding design
  question is altitude.

- _Approach:_ research first. Prior art: matklad's `ARCHITECTURE.md` (a bird's-eye view and a codemap that names
  modules and symbols without linking them, invariants often stated as what is deliberately absent, only what is
  unlikely to change, kept short); the C4 model's levels as an altitude scale (a map at component level, never code
  level); arc42's building-block view; nested `AGENTS.md` and `CLAUDE.md` files that harnesses load by directory, a
  transport ARC could compose with; generated repository maps (Aider's symbol map) as the deterministic alternative;
  any studies of whether repository context files help agents. Owner's starting constraints: co-located, light (under
  about 500 lines, one read), maintained when anything in the area changes. Candidate shape: one map per area or
  domain rather than per directory; a per-fact altitude test (it survives a typical refactor inside the area and is
  not learned from one file read: seams, invariants, ownership, where a thing lives, what is deliberately absent);
  lifecycle backstops like the ADRs' (planning names the maps a change affects, verification or review confirms each
  still holds or updates it); a deterministic check that every name a map gives still resolves; agents treat a map as
  a starting point and still verify against source. Value for people is the surer case; value for agents needs evals,
  counting scouting calls, tokens and task outcomes with and without maps. Pilot one area in each repository before
  committing to a backfill.

- _Captured during:_ `project-manager.ARC`, at the Owner's request to track it for when there is time, 2026-11-08
  (Owner-requested capture).

- _Follow-up:_ the Owner's priority (2026-11-08): the value to the developer is the main case, and agent orientation
  is secondary. Building CineXplorer's first half by hand left a strong mental map of its architecture; since agents
  took over most of the writing, in both repositories, that map has faded faster than the developer could keep up. The
  cost is not that agents are wrong but that the developer often cannot tell whether they are, and so cedes judgment.
  Prior art to read: Peter Naur, "Programming as Theory Building" (1985), on a program's substance as the theory its
  programmers hold, which documents cannot fully carry, so a map is a scaffold for rebuilding that theory rather than
  a substitute. Design consequences: write for a developer returning after weeks; surface a change's map diff in
  review as a structural changelog, so keeping up does not mean reading every code diff; let a decision prompt cite
  the map section it touches, so the developer can check the claim; treat agent evals as optional, not gating. Pilot
  in CineXplorer first, in an area the developer once knew, to judge whether the map rebuilds the understanding.

---

## Problem / Motivation

Per-leaf involvement kept the human's model of the codebase fresh as a _side effect_ — watching implementation
land, increment by increment, taught cumulative code familiarity even when each stop carried no decision. As
delegation and widened review increments remove that incidental teaching, design-level involvement (planning
stages, terminal gates, PR review) preserves design understanding but not code familiarity. The erosion runs on a
long time constant and is invisible until it matters — debugging under pressure, evaluating a proposal months
later, onboarding someone else.

The insight: **audit artifacts and orientation artifacts are different genres.** The deviation ledger answers
"what was decided, where was latitude exercised" — the _gate_ needs that. The human's model needs "how does this
work now, what pattern should I carry forward" — a guided tour, not an audit trail. Conflating them serves
neither.

## Proposed Shape

- **A declared involvement posture (`ride-along`, name provisional).** When declared, delegated/batched work
  additionally produces an **orientation layer**: phase summaries structured as guided tours (what changed, why,
  which patterns to know), and an optional interactive walkthrough at the terminal gate — the agent presents the
  design of what landed; the human drills in where they choose. Costs nothing when off.
- **Non-paternalism as a hard floor.** The posture is _declared, never inferred_. ARC cannot know the human's
  internal familiarity and must never model it — no "suggest you stay close to this one for your own benefit."
  The lever exists in the docs; the human invokes it. Opt-in by construction. (A user-initiated standing request
  — "nudge me when I haven't touched X in a while" — would be opt-in and thus legitimate, but is deferred, not
  v1.)
- **User-level, not project-level.** The posture is inherently personal (my model, my familiarity) — the opposite
  pole from `unit-scoped-review`'s project-level governance knob. First user-level involvement preference in ARC;
  the config surface consumes whatever the `configuration` cohort lands for user-scoped settings.
- **Teaching-aware artifact guidance.** Even outside the posture, ledger entries and phase summaries written as
  _teaching artifacts, not just audit trails_ is cheap when stated as a goal — candidate guidance for the
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
