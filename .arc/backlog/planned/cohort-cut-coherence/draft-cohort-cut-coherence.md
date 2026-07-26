# Draft: Cohort-Cut Coherence

- **Cohort:** [none]
- **Origin:** [internal] — routed from `USER-INBOX § Backlog` at the housekeep drain (2026-06-14); graduated to
  a `planned` stub (committed at drain). Captured during `lifecycle-state-machine` completeness audit /
  consolidation (2026-06).
- **Purpose:** Codify **"consistency-on-exit"** as a cohort-cut rail — when a cohort transforms a foundational /
  core domain, it should leave the substrate **coherent**, not merely functional-in-parts. A general
  decomposition heuristic, neutrally stateable as ARC-level methodology.

- **State:** Draft — pre-PRD capture (2026-06-14). Iterate before PRD promotion.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Cohort-less split shape is an adjacent rail — coordinate, don't fold**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-23); captured during
  `decomposition-hardening` create-spec finalization.
- _Concern:_ DH area 2 adds a first-class **cohort-less** (flat-sibling) split — a new `parentPosition` value that
  omits `cohort` and scaffolds flat siblings. Adjacent to this WU's concern (what a cohort absorbs on exit): a
  different axis, so coordinate rather than fold the two cuts together. Also note the Ready sibling stub
  `cohortless-decomposition` if that unit still owns delivery of the flat-sibling path.
- _Fold-in:_ align the cohort-vs-cohortless boundary at grooming; keep the cuts distinct. See
  `spec-decomposition-hardening.md` area 2.

---

## Problem / Motivation

When a cohort transforms a foundational / core domain, it should absorb the mechanical cascades that would
otherwise leave a documented-but-unbuilt / half-migrated core. The deferral saving (diff size) is shallow and
short-lived; the half-migrated cost is deep and long-lived — every session and downstream WU operates against a
model documented one way and built another.

## Resolved model — the additive-vs-consistency test

The limit on what a cohort cut must absorb is the **additive-vs-consistency test**:

- **Absorb** what would be _inconsistent_ if deferred (the model says X, the substrate doesn't do X).
- **Leave out** what is merely _un-enhanced_ (does X correctly, lacks an additive nicety) or belongs to a
  _different foundational domain_.

Pairs with two implementation patterns:

- **Per-member-docs-update-with-their-code** — local consistency (each member leaves its own surface coherent).
- **A closeout doc-cascade member** — global consistency (a final member absorbs the cross-cutting cascade).

## Proposed home

ARC-level general methodology, neutrally stateable — **NOT** `DEV-RULES`, **NOT** a workflow body:

- A third cohort-cut rail in `assess-cohort-fit` (alongside ADR-024's over-/under-split rails), and/or
- `strategy-work-organization § Decomposition`.

Settle which surface (or both) at spec time.

## Anti-rider note

A **distinct concern** from `lifecycle-state-machine` (a general decomposition heuristic, not the lifecycle
deliverable) — deliberately NOT folded into that cohort even though its cascade members touch the same surfaces
(`assess-cohort-fit`, `strategy-work-organization`); concern-identity, not file-identity. The heuristic is
_recorded_ as that cohort's scope rationale (its draft § Ship shape); this stub is the separable codification.

## Scope Estimate

Small — a methodology codification (a rail in a method + a strategy section), package-synced. No behavioral
machinery; the work is stating the rail clearly and placing it on the right surface(s).
