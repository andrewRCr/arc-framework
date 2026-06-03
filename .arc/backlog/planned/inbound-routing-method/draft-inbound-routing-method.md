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
