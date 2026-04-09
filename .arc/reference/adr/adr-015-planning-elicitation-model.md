# ADR-015: Separate Planning Elicitation from Formalization

## Status

Accepted

## Context

ARC's planning surface spans three artifacts: the `arc-plan` skill (collaborative exploration),
`strategy-work-planning.md` (planning doctrine), and `1_create-prd.md` (formalization to a PRD).
The surface had a directionally correct separation of responsibilities, but several operational
gaps surfaced during self-hosted use.

**Operational gaps:**

1. **arc-plan's elicitation loop was thin.** The skill gathered context and posed framing
   questions, then stepped back. It did not explicitly model iterative elicitation — the recursive
   pattern of ambiguity surfacing, assumption testing, alternative exploration, and refinement
   that effective requirements work actually uses.

2. **Continuity model was implicit.** Planning often spans multiple sessions. The existing skill
   did not say how the agent should behave when a `plan-*.md` file already existed, risking broad
   rediscovery every session (context bloat) or silent drift (if the agent assumed the plan was
   current without checking).

3. **create-prd framing conflated exploration with formalization.** The workflow was the venue
   for both unresolved exploration and finalized requirements, blurring when the user was
   refining ideas versus transitioning to a PRD artifact.

4. **Four operational states, not two.** In practice, planning has at least four states: fresh
   idea (no artifact), active rough plan (artifact exists but unresolved), maturing plan (scope
   known, refinements happening), formalization-ready (exploration stable, ready for PRD). The
   current model only distinguished "plan exists" vs. "plan doesn't exist."

**Collaborative elicitation literature** reinforces several patterns relevant here:

- Shared understanding is the core output, not raw requirement collection
- Tacit knowledge appears as ambiguity, hesitation, and gaps — effective elicitation follows
  those signals
- Elicitation is iterative, not one-pass
- Technique choice is contextual — adapt the conversation shape to the work and artifact state

These findings support evolving arc-plan toward a stronger facilitation role without turning it
into a heavy workflow or a plan-producing mode.

**Context-loading sensitivity.** Planning work is unusually sensitive to context bloat because it
starts broad, touches many sources, and may not end in the same session. Broad rediscovery on
every session wastes both time and context budget when an artifact already captures the last
session's discovery output.

**Alternatives considered:**

- **Option A — Minimal change.** Keep the current surfaces, add inline guidance in arc-plan about
  artifact-first resume. Rejected: the gaps are structural (role ambiguity, state model), not
  addressable by guidance alone.

- **Option B — Unify into create-prd.** Fold arc-plan's exploration responsibilities into
  create-prd as an "exploration phase." Rejected: collapses elicitation and formalization back
  together, losing the value of separate venues for unresolved and finalized work. Also overloads
  create-prd with open-ended conversation that doesn't fit its current gating role.

- **Option C (chosen) — Layered responsibility model with explicit elicitation core.** Preserve
  the three-surface separation but sharpen each surface's contract. arc-plan owns collaborative
  elicitation with explicit non-goals; the strategy owns planning doctrine and operational states;
  create-prd owns formalization and readiness gating, treating upstream plans as authoritative
  exploration state.

## Decision

We will adopt a layered planning model with clear elicitation/formalization separation:

```text
elicitation/facilitation  →  formalization/gating  →  execution planning
(arc-plan)                   (create-prd)             (task generation)

exploration artifact      →  requirements artifact  →  task list
(plan-*.md)                  (PRD / Lite equivalent)
```

**arc-plan becomes collaborative elicitation.** The skill is repositioned from "exploration
setup" to "collaborative facilitation." Its core loop:

1. Determine artifact state: no plan, rough plan, or mature plan
2. If a plan exists, read it first and treat it as the continuity anchor
3. Choose discovery tier based on artifact state and staleness signals (artifact-only by default
   on resume; targeted refresh when signals justify it; broad discovery mainly for fresh planning
   or explicit user request)
4. Iteratively elicit: surface ambiguity, assumptions, alternatives, scope boundaries, risks,
   trade-offs
5. Stop with a lightweight synthesis: what is resolved, what remains open, what artifact comes next

**Explicit non-goals for arc-plan:** not a PRD gate, not a task generator, not a dispatcher into
downstream workflows by default. These guardrails prevent drift toward a "plan mode" that produces
plans for approval — the human formulates and explores _with_ the agent, not through it.

**strategy-work-planning.md gains a Planning Continuity section** codifying:

- Planning is iterative and may span multiple sessions
- The `plan-*` artifact is the default continuity mechanism
- On resume, read the artifact first; classify resolved/rough/stale/open; perform only targeted
  additional discovery
- Broad rediscovery is appropriate for fresh efforts or on explicit user request

**1_create-prd.md treats the upstream plan as authoritative exploration state.** The workflow
remains the formalization gate for Full ARC, but its discovery step is narrowed: fill remaining
gaps, validate assumptions, resolve open items that block formalization — not rediscover the
landscape the plan already captured.

**Lite mode inherits the elicitation core with a lighter formalization target.** When Lite mode
lands, it reuses the same elicitation loop (arc-plan applies unchanged) but formalizes into a
lighter requirements artifact (scope brief or equivalent) rather than a full PRD. The elicitation
philosophy is shared across Full and Lite; only the middle artifact's weight differs.

**Local mode does not change the responsibility model.** Local mode changes where artifacts are
stored and tracked, not how elicitation and formalization are divided. The same arc-plan skill
and same layered model apply.

## Consequences

### Positive

- **Clearer separation of venues.** Elicitation (open-ended, iterative) and formalization (gated,
  authoritative) have distinct homes. Users and agents know which venue to be in at which stage.
- **Continuity without new ceremony.** Multi-session planning uses the existing `plan-*` artifact
  as the anchor — no new session-state file, no "resume planning" workflow, no dedicated notes
  file.
- **Context budget protection.** Artifact-first resume behavior prevents broad rediscovery on
  every session. Planning work becomes sustainable across sessions without bloat.
- **Full/Lite unification.** The elicitation core is shared across modes, so Lite mode development
  doesn't fork the planning philosophy. Only the formalization target differs.
- **Clearer arc-plan contract.** Explicit non-goals prevent drift toward plan-generation or
  workflow-dispatch, keeping the skill aligned with collaborative use.

### Negative

- **More nuanced behavioral contract.** The skill now models four operational states and three
  discovery tiers, which is more than the previous "plan exists / plan doesn't exist" split. The
  added nuance is in the skill's operating model; users interact normally.
- **Requires staleness heuristics.** Deciding when to escalate from artifact-only to targeted
  refresh depends on signals (plan age, changed code, user prompts). Heuristics will need
  refinement through use.
- **Cross-reference maintenance.** The strategy, skill, and workflow all reference the same
  model. Changes to the shared model require coordinated updates across all three.

### Risks

- **Discovery-tier choice may confuse users.** Surfacing "I can work from the plan directly, or
  do a targeted refresh if code has changed" might read as indecisive if done too often. Watch
  for friction through self-hosted use; adjust phrasing or default behavior as needed.
- **Detail-design questions deferred.** Several questions were surfaced but not resolved:
    - Whether arc-plan should explicitly present discovery-tier choices on every plan-found
      scenario, or only when staleness signals are present
    - Whether the stopping-point synthesis should use a standard format (`resolved` / `open` /
      `next`)
    - Whether arc-plan should remain broadly invocable or become user-invocable-only to prevent
      surprise activation during unrelated work
    - For Lite, whether the requirements artifact is a reduced PRD, a scope brief, or a new
      named document type
    - Whether readiness signals should be referenced in-session by arc-plan or deferred to
      create-prd
  These are captured as follow-up work for Operating Modes and ongoing planning refinement.

## Amending This Document
