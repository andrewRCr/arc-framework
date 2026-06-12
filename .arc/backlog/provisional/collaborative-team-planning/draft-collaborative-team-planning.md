# Draft: Collaborative Team Planning

- **Origin:** Extracted from the retired `arc-plan-conductor` draft's Inbound Buffer at the conductor
  decomposition (2026-06-12); originally captured during `concurrent-work-conventions` planning (2026-06-03).
- **Purpose:** Extend ARC's planning pipeline to **multi-human team planning** — the single-author-draft +
  review (RFC) model — rather than assuming human+agent co-development throughout. Pre-commitment: a genuine gap,
  but single-developer today, so vet timing before committing.

---

## Problem / Motivation

ARC's planning pipeline (`arc-plan` → `create-spec` → `generate-tasks`) and the document-iteration loop assume
human+agent co-development, never multi-human team planning — a genuine gap. Idiomatic collaborative planning is
single-author / scribe-drives-the-doc + others contributing via review / comments / discussion (the RFC model) —
the same single-owner + review pattern `concurrent-work-conventions` blessed for code WUs, applied to planning
artifacts.

## Approach (candidate)

- **Candidate homes:** `strategy-team-coordination` (the "how teams plan together" framing) + a planning-workflow
  seam (the single-author-draft-plus-review mechanism).
- Partly subsumes / transforms the conductor's Open Question 23 ("cleanup under team mode — multiple developers
  on a planning branch"), premised on the multi-dev-per-WU model that `concurrent-work-conventions` retires: under
  single-owner, a planning branch has one owner and collaboration is review, not co-located commits.

## Unknowns and Assumptions

- **Flag (do not decide yet):** a possible "planning machinery / conventions" cohort could group this concern with
  `synthesis-modality`, `graduation-cleanup`, `decompose-work-unit-arms`, and the contested spec-form templates.
  Carried as a flag, not a decision.
- Single-developer today — confirm the gap is worth closing before this matures past pre-commitment.

## Scope Estimate

Medium — a `strategy-team-coordination` section plus a planning-workflow review-mode seam. Pre-commitment until
the team-planning need is concrete.
