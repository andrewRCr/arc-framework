# Draft: Cross-WU Forward-Compat

- **Origin:** Extracted from the retired `arc-plan-conductor` draft's Inbound Buffer at the conductor
  decomposition (2026-06-12); originally captured at the work-routing-discipline housekeep drain (2026-06-01).
- **Purpose:** Make "does other planned backlog work bear on this?" a **built-in planning consideration** rather
  than an after-the-fact execution discovery. Pre-commitment: vet the premise and the efficiency model before
  committing to a cut.

---

## Problem / Motivation

Forward-compatibility and cross-WU coordination surface today as manual, ad-hoc cross-checks — and the half that
matters most (writing refinements *back out* to downstream WUs whose assumptions just changed) is the one most
easily dropped.

Make it a built-in step during pre-impl planning (`create-spec`, `generate-tasks`, `arc-plan`) and the pre-impl
audit (`arc-task-audit`). Bidirectional:

- **Pull** downstream planned designs *into* current work where they should inform it.
- **Push** refinements *back out* when current work changes assumptions a downstream WU rests on.

**Motivation — recurring manual pattern.** `worktree-foundation`'s 2026-05-26 cohort/downstream forward-compat
cross-check hand-did exactly this (reserving extension points for `cross-machine-sync-coherence`, keeping logic
extractable for `user-sync-module-split`).

## Unknowns and Assumptions

- **Efficiency.** Needs a cheap relevance filter (most WUs won't relate) plus a bounded read; may key off
  `Depends On` / `Cohort` to scope the candidate set before any design read.
- **Home.** Candidate homes — the planning workflows (codified step), `arc-task-audit` (surfacing point), or a new
  WU; likely also a `strategy-work-planning` convention regardless.
- **Boundary.** Related to but distinct from in-flight-awareness (active WUs vs. planned backlog WUs).

## Scope Estimate

Small–Medium — a codified planning-step convention plus a relevance-filter heuristic, likely touching
`strategy-work-planning.md` and one or more planning workflows. Pre-commitment until the premise is vetted.
