# Draft: Inbound Routing Method

- **Origin:** [internal] — routed from `USER-INBOX § Backlog` at the housekeep drain (2026-06-02); graduated to
  a `planned` stub (committed at drain).
- **Purpose:** Extract the inbound-routing convention — the holistic-vs-`## Inbound Buffer` integration-mode fork
  and the buffer-section shape — into a shared method that `drain-inbox`, `run-errand`, and `1_create-spec`
  declare / reference, so "route a concern into an existing stub" has one codified shape instead of inline
  duplication.

- **State:** Draft — pre-PRD capture (2026-06-02). Iterate before PRD promotion.

- **Created:** 2026-06-02

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration
> (`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Codify the direct-edit-inbound-buffer vs. `arc-inbox` threshold on an always-loaded surface**

- *Routed from:* `USER-INBOX § Backlog`, housekeep drain (2026-06-14); captured during
  `lifecycle-state-machine` forward-compat alignment.
- *Concern:* the routing table + express lane *are* codified on an always-loaded surface (`DEV-RULES.ARC
  § Discovered Work Routing`), but the express lane names only "run an errand" and "scaffold a `backlog/` stub" —
  writing into an **existing** WU's inbound buffer is described only as a *drain* action ("the housekeep drain
  writes it straight in"). So "may I write directly into another live WU's inbound buffer, or must it go via
  `arc-inbox`?" has no explicit codified line; it is derivable (out-of-WU + not-urgent → inbox default;
  planning-artifacts-aren't-capture-surfaces) but gets re-judged each time. Hit live deciding where to route the
  method-model note (now in `composable-workflows`).
- *Proposed:* make the threshold explicit so it isn't re-derived — a sentence on the always-loaded surface
  and/or folded into this method. Candidate framing: an ad-hoc cross-WU write into an existing WU's inbound
  buffer, from another session, defaults to `arc-inbox` capture; direct-to-buffer is a drain action (or an
  explicit express-lane the rule names). Confirm the design-vs-consequence test is the intended line, or
  supersede it.

### `[ ]` **`assess-wu-target` — a codified procedure for resolving a capture's backlog home**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: inbound-routing-method`), housekeep drain (2026-06-17);
  captured during `release-ceremony-commits` session-init — raised while hand-resolving the `arc-design-audit`
  capture's own `WU_Target` (live dogfood: index-scan, then 2-candidate validate) (2026-06-17).
- *Concern:* "capture with a backlog `WU_Target`" recurs constantly, and resolving the target — which existing
  stub, or a new one — requires reading backlog drafts, costly and context-polluting. No codified procedure; it
  gets re-improvised at every drain (and `WU_Target: TBD` defers it there) and ad-hoc at capture.
- *Gap in the method family:* `inbound-routing-method` codifies how to write a concern into a **chosen** stub
  (assumes you know which); `assess-parallel-fit` matches a candidate against the in-flight set for a *concurrency*
  verdict. Missing: **which** stub does this belong to (homing/discovery). Family: **homing** (`assess-wu-target`)
  → **integration** (`inbound-routing`), with **concurrency** (`assess-parallel-fit`) the cousin.
- *Proposed shape:* a **method**, not a skill. **Two tiers:** (1) **Cheap** — match against a lightweight index
  (slug + one-line purpose; ROADMAP carries much of it), no subagents; resolves the obvious-home majority. (2)
  **Scout** — on ambiguity (2–4) or no clean match, fan out Explore subagents over candidate drafts, each
  returning `{slug, fit, body-vs-buffer, confidence, rationale}`; the caller validates + picks, never seeing draft
  bodies. Optimizes calling-agent context load.
- *Home note:* primary `inbound-routing-method` (find-the-home + write-it-in belong together); could stand alone
  as a sibling method if that WU stays narrow.

---

## Problem / Motivation

The holistic-vs-`## Inbound Buffer` integration-mode fork is codified only inline in `drain-inbox` (§ 5) and
consumed by `1_create-spec`; `run-errand` says nothing about how to route a concern into an existing stub. So the
express-lane "route to home" path has no codified shape — it gets improvised (e.g. an in-flight-awareness routing
pass matched each draft's ad-hoc pattern, leaning holistic).

## Proposed shape

Extract the fork + the `## Inbound Buffer — Pending Integration` section shape into a method (e.g.
`methods/inbound-routing.md`); have `drain-inbox`, `run-errand` (Execute, route-to-home), and `1_create-spec`
declare / reference it. A caller-appropriate default falls out: the run-errand express-lane leans **holistic**
(it holds the context), the drain leans **buffer** (it batches). The DRY primitive is a method, not duplication.

## Forward-compat

A method is already a composable unit — when `composable-workflows` formalizes fragment / step composition, an
extracted method slots in with no rework. Doable today with existing method machinery; **coordinate-with, do not
block on, `composable-workflows`** (it is not the home).

## Scope Estimate

Quick-tier: a new method doc + reference-wiring across `drain-inbox`, `run-errand`, and `1_create-spec`
(package-synced). No behavioral change to routing — a DRY consolidation of existing convention.
