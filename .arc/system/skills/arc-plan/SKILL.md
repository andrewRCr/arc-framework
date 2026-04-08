---
name: arc-plan
description: >-
  Collaborative exploration for new or in-progress work — gathers project
  context, surfaces framing questions, then steps back for freeform
  conversation. Use when starting to think about new work, or when revisiting
  a rough plan document to refine it toward PRD readiness.
disable-model-invocation: false
---

# ARC Plan

Collaborative exploration for work planning. Sets up the conversation with
project context and framing questions, then gets out of the way. Works for
two scenarios: starting from a vague idea (no plan doc yet), or revisiting
an existing rough plan document to refine it.

The value is in assembling context the human would otherwise gather manually
or skip — not in structuring the exploration itself.

Not a "plan mode" where the agent produces a plan for approval. The human
formulates and explores _with_ the agent. The skill front-loads context so
the conversation starts informed.

**Scope guard:** Context gathering should be targeted, not exhaustive. Read
document titles and summaries to assess relevance before reading full
content. If the user's idea is well-defined, most sources will be
irrelevant — skip them. Aim for a concise landscape summary, not a
comprehensive research report.

1. Determine starting point.

   - **If a plan document exists** (`plan-*.md` referenced by the user or
     found in the expected directory): Read it first. This is primary
     context — the exploration builds on what's already captured. Note
     what's well-developed versus rough, and what gaps would need filling
     before PRD creation.
   - **If no plan document exists**: The user has an idea or direction.
     Proceed to context gathering with whatever the user has described.

2. Gather project context.

   Read available sources to understand the landscape around the work.
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

3. Present context and framing questions.

   Share what you found — relevant project direction, related prior work,
   design constraints, codebase state. Keep the summary concise: the
   human needs orientation, not a literature review.

   Then ask framing questions to help the human articulate their thinking.
   Adapt these based on the starting point:

   **Starting fresh (no plan doc):**

   - What problem or opportunity is driving this?
   - What does success look like — what's different when this is done?
   - What's the rough scope — is this a focused change or a broad effort?
   - Are there approaches you're already leaning toward or away from?
   - What constraints or dependencies should shape the approach?

   **Refining an existing plan:**

   - What feels unresolved or underspecified in the current plan?
   - Have any assumptions changed since this was written?
   - Are there alternatives that weren't explored?
   - What would need to be clearer before this could become a PRD?

   These are starting points, not a checklist. Skip questions the user
   has already answered. Add questions specific to what you found in the
   codebase or prior work.

4. Step back.

   After presenting context and initial framing, the conversation becomes
   freeform. Follow the human's lead. The exploration may go in any
   direction — that's the point. Contribute analysis, surface trade-offs,
   and ask clarifying questions as the conversation develops, but don't
   impose structure.

   When the exploration has enough shape to write down, suggest creating
   or updating a plan document. See the work-planning strategy for plan
   document conventions and the discovery checklist for PRD-readiness
   signals.
