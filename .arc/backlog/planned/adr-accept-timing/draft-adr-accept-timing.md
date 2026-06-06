# Draft: ADR Proposed→Accepted Timing — flip at integration, not authoring (+ enforcement)

- **Origin:** [internal] — routed from `BACKLOG-INBOX` at the work-routing-discipline retirement pass
  (2026-06-01); surfaced live when an integration-time ADR amendment raised amend-vs-edit, and the root cause
  traced to Proposed→Accepted timing.
- **Purpose:** Make in-WU ADRs freely editable through implementation and lock them in their final, correct form
  at integration — removing the amend-vs-edit tension at its root.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Structured deferred-acceptance trigger convention and lifecycle backstop**

- _Routed from:_ `USER-INBOX § Backlog`, housekeep drain (2026-06-06); captured while authoring
  `adr-023-class-model-scaled-ceremony.md`.
- _Concern:_ `adr-022` uses an ad hoc inline `Flip trigger`, while `adr-020`, `adr-021`, and `adr-023` remain
  `Proposed` with heterogeneous ratification events. Codify a machine-discoverable deferred-acceptance trigger
  naming the WU and event type (`kickoff` / `integration`), then add lifecycle backstops that surface applicable
  flips during `init-work-unit` and/or `integrate-work-unit`.
- _Scope note:_ the existing draft focuses on in-WU ADRs flipping at integration; this capture broadens the WU to
  cover deferred acceptance for ADRs ratified by downstream WU kickoff or ship events.

## Problem / Motivation

An ADR was marked `Accepted` at authoring time, so a premise corrected later in the same work unit had to land as
an append-only amendment rather than a clean body edit — under the ADR methodology, `Accepted` bodies are
immutable. If in-WU ADRs instead held `Proposed` (freely editable) through implementation and flipped to
`Accepted` at integration, mid-WU corrections would be plain edits and the ADR would lock in its final, correct
form. The amend-vs-edit tension is really a Proposed→Accepted timing question.

## Scope (iterate into a plan)

1. **Codify the timing** in `strategy-adr-methodology.md` — in-WU ADRs hold `Proposed` through implementation,
   flip to `Accepted` at integration.
2. **Add a flip step** to `integrate-work-unit.md` — "flip any `Proposed` in-WU ADRs → `Accepted`".
3. **Enforcement** to catch an ADR merged while still `Proposed` — a pre-merge / CI check or commit-msg-adjacent
   hook.

## Scope Estimate

Quick-tier — touches a strategy, a workflow, and likely a hook/CI check. Concrete and ready; no research gate.
