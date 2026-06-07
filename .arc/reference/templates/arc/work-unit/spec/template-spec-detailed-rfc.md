# Spec (`detailed` · `RFC`): {wu-name}

- **Origin:** {`[internal]` default; external tracker URL when applicable.}

- **Purpose:** {One- to three-line north-star summary of the WU's intent — distilled "what + why," not framing
  prose. Body sections carry the full context.}

---

{The ceiling form for **technical-design** derivation — where the open question is _what's the right technical
design and its tradeoffs_ (a refactor, migration, internal architecture, or perf rework). (When the open
question is instead _what should this do_, use the `PRD` subtype.) The heart is the Proposed Design and the
Alternatives that justify it.}

<!--
  Paired-spec mode — when this RFC is authored alongside a product spec (`spec-{name}-prd.md`), it goes
  referential: the PRD owns the shared spine, so the sections flagged `omit-when-paired` below drop out and the
  PRD carries them; only the design sections remain here. A standalone RFC keeps the full spine. create-spec
  sets paired vs. standalone and strips these scaffolding markers (the heading flags and these comments do not
  belong in a finalized spec).
-->

## Introduction / Context · `omit-when-paired`

The situation and why it matters now. What problem or constraint forces a design decision? Enough background for
a reader to evaluate the design without prior briefing.

## Goals · `omit-when-paired`

What the design must achieve — the outcomes a correct design satisfies. Focus on ends, not the mechanism.

## Non-Goals · `omit-when-paired`

What this design explicitly won't address. Bounds the design space and the review.

## Proposed Design

The heart of the RFC: the chosen technical design — architecture, interfaces, data model, and behavior.
Concrete enough to build from. This replaces the PRD's User Stories + Requirements; the design _is_ the
enumerable substrate the task list is built from and validated against.

## Alternatives & Rationale

The derivation heart: the designs considered and rejected, and _why_ the proposed one wins. A reader should come
away understanding the tradeoffs, not just the conclusion.

## Cross-cutting Considerations

Security, performance, testing, migration, and rollout implications of the design. Include user-facing impact
where the technical change surfaces to users.

## Success Criteria

How will you know the design was realized correctly? Concrete checks validated at work-unit completion — not
aspirations.

## Open Questions

Design questions still open — resolved during the work, not deferred as debt. A "resolve-before-starting"
blocker here means the design isn't settled enough to build.
