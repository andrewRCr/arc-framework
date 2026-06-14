# Draft: Goal-Aware Direction

- **Cohort:** [none]
- **Origin:** [internal] — routed from `USER-INBOX § Backlog` at the housekeep drain (2026-06-14); graduated to
  a `planned` stub (committed at drain). Surfaced live during `lifecycle-state-machine` draft-design (2026-06).
- **Purpose:** Give ARC a **goal-aware next-work recommender** — a "direction layer" that answers "what should I
  do next, and *why*," not just "what is unblocked." ARC's planning model is flat and local (it stores `Priority`
  P1/P2/P3 and `Depends On` edges, nothing more); developers decide "what's next" globally and goal-relative,
  using knowledge ARC never captures.

- **State:** Draft — pre-PRD capture (2026-06-14). Iterate before PRD promotion.

---

## Problem / Motivation

ARC's planning model is **flat and local**: `Priority` + `Depends On` edges, nothing more. Between WUs,
session-init's discovery arm can only surface "N unblocked P1s" with no reason to prefer one. The
actually-correct next pick is often a *lower-priority* WU that is right for reasons ARC never captures — e.g.
`single-owner-wu-model` (a P2) was the correct pick only because it closes the `concurrent-work-conventions`
cohort (all other members shipped) and because the near-term goal is `finalize-parallelism`. None of that
reasoning lives in any rendered view, probe, or workflow — only in developer memory.

## Missing primitives

1. **Target / near-term-goal primitive** — "what I'm steering toward" as *data*, not memory.
2. **Critical-path-to-goal** — computed over the dependency graph; the *usage* half of the deps-are-messy
   concern, distinct from `operational-state-docs`' edge state-blindness item (the *representation* half).
3. **Cohort-completion pull** — the value of finishing a cohort's last unshipped member, which raw priority
   can't express.
4. **Unblock-leverage** — the downstream fan-out a completion frees.
5. **The recommender** — fuses these into "do X next, because Y," surfaced at session-init discovery and as
   input to `assess-parallel-fit` (which ranks parallel *fit* today, not *goal-progress*).

## Reopens a settled lean

`roadmap-tooling` § Unknowns "Direction's home" concluded now/next/later is *derivable* from `State × Depends-On
× Priority` (a pure render mode; no separate directional doc; narrative direction in PROJECT-PRD). This session's
counter-evidence (`finalize-parallelism` goal-distance; `single-owner-wu-model` cohort-closeout) shows priority +
deps + state is **insufficient** to rank by goal-distance or cohort-completion. So the open routing decision is:
expand `roadmap-tooling`'s horizon view into a goal-aware recommender, **or** build a new model above the
substrate. (Routed to its own `planned` stub at drain to preserve that decision rather than pre-fold into
`roadmap-tooling`.)

## Consumes (coordination seams, not dependencies)

- `lifecycle-state-machine`'s derived-state predicates (parked / in-flight / on-my-plate over phase × location).
- `operational-state-docs`' dependency-edge state resolution plus the "resolve a WU's lifecycle state by slug"
  CLI primitive.
- `roadmap-tooling`'s horizon render.

These are *consumed* surfaces, not gating dependencies — kept off `Depends On` so the WU tiers as Ready; settle
the actual sequencing against them at spec time.

## Scope Estimate

Medium-to-large — a new planning primitive (the target/goal), graph computation over the dependency model, and a
recommender surfaced at session-init discovery. Settle the home question (expand `roadmap-tooling` vs. new model)
before committing the cut.
