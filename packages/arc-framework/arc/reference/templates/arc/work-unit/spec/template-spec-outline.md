# Spec (`outline`): {wu-name}

- **Origin:** {`[internal]` default; external tracker URL when applicable.}

- **Purpose:** {One- to three-line north-star summary of the WU's intent — distilled "what + why," not
  framing prose. Body sections carry the full context.}

---

{The recording middle form (~1–2 pages). An `outline` is for work whose design is _settled_ but worth
_recording_: the decisions and scope want a durable home, yet the change doesn't warrant the full derivation
of a `detailed` spec. It firmly settles its Decisions and Scope while omitting requirement IDs and a
success-criteria matrix (those belong to a `detailed` spec). It is structurally its own form — not "a PRD
with sections removed."}

## Problem / Context

What's the situation, and why act now? Enough context for a reader to understand the decisions below without
prior briefing. Frame as the need, not the solution.

## Decision(s)

The settled design choices — the heart of an `outline`, and the substrate the task list is built from and
validated against. State each decision as a resolved position ("We will X because Y"), not an open option.
These are fixed, not provisional: if a choice here is still genuinely open, it belongs in Open items below, or
the work isn't `outline`-ready yet.

## Scope boundary (No-gos)

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

What this work explicitly will _not_ do. Be specific about what's out and why — this section is fixed alongside
Decisions and keeps the work from drifting wider during execution.

## Consequences & Risks

What follows from the decisions — downstream effects, tradeoffs accepted, and the notable risks (with
mitigation or acceptance noted). Honest about what the chosen path costs, not just what it buys.

## Success Criteria

Concrete, checkable signals the implementation is validated against at completion — a short list, not a
prioritized P0/P1/P2 matrix (that escalation belongs to a `detailed` spec). Write them as checks, not
aspirations: each should be unambiguously true or false when the work is done.

## Open items

Questions worked out _during_ this work — not design debt deferred to a later WU. An `outline` settles all
settle-able design upfront; this section holds the genuinely-emergent items that resolve through
implementation. If a "settle-before-starting" blocker lands here, the spec isn't ready.

## Amendments

{The amendment log. One row per amendment — the amendment's identity, and the only mandatory write on every arm.
The first amendment adds this section when the form's template predates it; the row grammar and its token sets are
defined once, in [`amend-design`][amend-design]. Replace the example row with the first real one.}

- **A1** — {YYYY-MM-DD} — design: {one-sentence summary of what the amendment settles}. _Supersedes:_
  § Scope boundary ¶2. _Trigger:_ 4.2 member. _Work:_ 4.R. _Revalidated:_ 4.R.c.

---

[amend-design]: ../../../../../system/workflows/arc/supplemental/amend-design.md
