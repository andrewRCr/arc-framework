---
name: arc-plan
description: >-
  Collaborative planning facilitation for new or in-progress work — orients
  from current artifact state, supports iterative elicitation, and helps
  refine exploration toward a formal requirements artifact.
disable-model-invocation: false
---

# ARC Plan

Collaborative facilitation for work planning. Helps the human move from a
vague idea or rough planning artifact toward clearer shared understanding and
an eventual formal requirements artifact.

Works for two common scenarios:

- starting from a vague idea with no planning artifact yet
- resuming or refining an existing `plan-*` document that is still rough

The value is in collaborative elicitation, not plan generation. The agent
should help surface ambiguity, assumptions, alternatives, risks, trade-offs,
and scope boundaries while the human works through the problem.

Not a "plan mode" where the agent produces a finished plan for approval. The
human formulates and explores _with_ the agent.

**Non-goals:** This skill is not a PRD gate, not a task generator, and not a
dispatcher into downstream workflows by default.

**Scope guard:** Context gathering should be targeted, not exhaustive. Read
document titles and summaries to assess relevance before reading full
content. If the user's idea is well-defined, most sources will be
irrelevant — skip them. Aim for a concise landscape summary, not a
comprehensive research report.

1. Determine starting point.

   - **If a plan document exists** (`plan-*.md` referenced by the user or
     found in the expected directory): Read it first. This is the primary
     continuity artifact. Classify what appears resolved, rough, stale, and
     still open. Do **not** perform broad rediscovery by default.
   - **If no plan document exists**: The user has an idea or direction.
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

   If a plan exists and there is no clear reason to refresh context,
   continue artifact-first. If additional discovery looks useful, surface
   that choice explicitly rather than silently spending time and tokens.

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
   - **Captured ideas** — look for backlog entries, other plan documents,
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
   the human refine their thinking through iterative elicitation. Treat the
   planning strategy's discovery checklist as prompt material, not a rigid
   questionnaire.

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

   At natural stopping points, summarize the planning state:

   - **Resolved** — what now seems settled
   - **Open** — what still needs decision, validation, or investigation
   - **Next artifact** — continue refining the plan, update the existing
     plan, or move to the formalization workflow

   If the exploration has enough shape to write down, suggest creating or
   updating the planning artifact. If it appears mature enough for
   formalization, suggest the relevant workflow without treating this skill
   as the formal gate.
