---
name: arc-plan
description: Pre-PRD planning elicitation. Iterative facilitation, not plan generation. Not for use during task execution.
disable-model-invocation: false
---

# ARC Plan

Works for two common scenarios:

- starting from a vague idea with no planning artifact yet
- resuming or refining an existing `draft-*` document that is still rough

The agent should help surface ambiguity, assumptions, alternatives, risks,
trade-offs, and scope boundaries while the human works through the problem.

Not a "plan mode" where the agent produces a finished plan for approval. The
human formulates and explores _with_ the agent.

**Non-goals:** This skill is not a PRD gate, not a task generator, and not a
dispatcher into downstream workflows by default. Not for use during active
work unit execution — task-execution questions belong in the task loop, not
in a planning facilitation pass.

**Scope guard:** Context gathering should be targeted, not exhaustive. Read
document titles and summaries to assess relevance before reading full
content. If the user's idea is well-defined, most sources will be
irrelevant — skip them. Aim for a concise landscape summary, not a
comprehensive research report.

1. Determine starting point.

   - **If a draft document exists** (`draft-*.md` referenced by the user or
     found in the expected directory): Read it first. This is the primary
     continuity artifact. Do **not** perform broad rediscovery by default.
   - **If no draft document exists**: The user has an idea or direction.
     Proceed to broader context gathering with whatever the user has
     described.

2. Choose discovery depth.

   Use the lightest tier that will move the conversation forward:

   - **Artifact-only** — default when an existing plan is present. Work
     directly from the artifact and continue the planning conversation
     without re-scanning the broader project.
   - **Targeted refresh** — use when the existing plan appears stale,
     assumption-heavy, or clearly incomplete. Check only the specific
     files, prior work, or strategy docs needed to test those assumptions.
   - **Broad discovery** — use for a fresh idea with no planning artifact,
     or when the user explicitly wants a landscape-mapping pass.

   If additional discovery beyond the artifact looks useful, surface that
   choice explicitly rather than silently spending time and tokens.

3. Gather project context.

   When the chosen discovery tier calls for additional context, read only
   the sources needed to understand the landscape around the work.
   Summarize what's relevant — don't dump raw content. Skip any source
   that doesn't exist or isn't relevant.

   - **Project direction** — check for a roadmap, project status, or
     similar planning artifacts in `.arc/`. What's queued, in progress,
     or recently completed? Where does this work fit?
   - **Related prior work** — scan active and archive directories for
     work units (PRDs, completion docs, task lists) that touch the same
     area. What decisions were made? What was deferred?
   - **Captured ideas** — look for backlog entries, other draft documents,
     or inbox items related to the work. Has prior thinking been captured
     that should inform this exploration?
   - **Design context** — check for ADRs in `reference/adr/` and
     project-level strategies in `reference/strategies/project/` that
     bear on the work. Architectural decisions and established patterns
     may constrain or inform the approach.
   - **Codebase state** — if the work touches code, read the relevant
     modules to understand current architecture, patterns, and
     constraints. Focus on what would influence the approach, not
     exhaustive inventory.

4. Facilitate elicitation.

   Share the minimum context needed to orient the conversation. Then help
   the human refine their thinking through iterative elicitation. Treat
   the following as prompt material, not a rigid questionnaire.

   Revisit these areas as needed:

   - **Problem and motivation** — what problem are we solving, and why now?
   - **Success and boundaries** — what does success look like, and what is
     explicitly out of scope?
   - **Alternatives** — what approaches were considered, and why lean
     toward or away from them?
   - **Assumptions and unknowns** — what are we assuming, and what could
     still change the approach materially?
   - **Risks and dependencies** — what could cause this to fail, block, or
     grow unexpectedly?
   - **Minimum viable version** — what is the smallest useful increment?

   Follow ambiguity rather than forcing sequence. If the user says
   something underspecified, contradictory, or assumption-heavy, pause
   there and work it through before moving on.

5. Synthesize the current state.

   At natural stopping points, produce a structured synthesis so the plan's
   progression toward PRD readiness is visible.

   - **State** — where the plan sits on the progression:
       - **fresh** — no `draft-*` document yet, shaping the idea
       - **rough** — `draft-*` exists but has significant gaps or
         unresolved direction
       - **maturing** — scope known, open items are detail-design rather
         than fundamentals
       - **formalization-ready** — exploration stable, suitable input for
         create-prd
   - **Resolved** — what now seems settled
   - **Open — masked design decisions** — choices implementation will
     force that the plan does not yet acknowledge
   - **Open — unvalidated assumptions** — claims the plan leans on that
     have not been tested against code, prior work, or external sources
   - **Open — scope boundaries** — where in-scope / out-of-scope is still
     soft and could shift under pressure
   - **Next** — continue exploring, update the `draft-*` document, or
     propose moving to create-prd

   Empty categories are fine — say so explicitly rather than manufacturing
   findings. If the state reads formalization-ready, suggest create-prd as
   the next step; create-prd remains the authoritative readiness gate. If
   earlier, name what would need to land for the plan to advance to the
   next state.
