# Draft: ADR Proposed→Accepted Timing — flip at integration, not authoring (+ enforcement)

- **Origin:** [internal] — routed from `BACKLOG-INBOX` at the work-routing-discipline retirement pass
  (2026-06-01); surfaced live when an integration-time ADR amendment raised amend-vs-edit, and the root cause
  traced to Proposed→Accepted timing.
- **Purpose:** Make in-WU ADRs freely editable through implementation and lock them in their final, correct form
  at integration — removing the amend-vs-edit tension at its root.

---

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
