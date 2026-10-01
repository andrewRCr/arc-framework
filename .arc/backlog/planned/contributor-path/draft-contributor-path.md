# Draft: OSS Contributor Path Refinement

- **Origin:** [internal]
- **Purpose:** Refine ARC's OSS contributor path post-WOR + Worktree Foundation + Agile WU Lifecycle. WOR ships
  the structural path convention (R65a — contributor-role meta at `user/{identity}/<wu-name>/meta-<wu-name>.md`);
  full lifecycle, tooling, and boundaries defer here for focused iteration once foundational conventions settle.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's next planning iteration._

### `[ ]` **Design the contribution ceremony and the export's removal handshake**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: contributor-path`), housekeep drain (2026-09-30); captured during
  `storage-contract` draft close, 2026-09-30.
- _Observation:_ `storage-contract` defers three things here (C7, C14): the contribution's ceremony and tooling, and
  the review-only spec export's removal when a maintainer merges a fork's pull request — the owner's candidate-tail
  cleanup deletes the copy, but a maintainer merges, and ARC's merge gate refuses a merge that outruns the cleanup
  (C10). Its open question of who creates a contributor's meta falls away: a contributor's work unit is an ordinary
  record in their own store, and the contributor layout retires.
- _Approach:_ Design the handshake so the contributor's cleanup follows the maintainer's approval without a round
  trip; drop the contributor-meta question.

---

## Problem / Motivation

WOR establishes the per-WU subdir convention under `user/{identity}/<wu-name>/` and codifies where the contributor-role
meta file lives, but the full contributor flow isn't designed end-to-end. Several open scope items exist that don't
belong in WOR (would inflate scope) and don't belong in the parallelism trio (Worktree Foundation, Agile WU Lifecycle,
Concurrent Work Conventions — different concerns). Without a focused planning pass, contributor-flow design drifts
across whichever WU happens to touch adjacent code, producing inconsistent treatment. This plan-doc collects the open
items so revisit happens deliberately after WOR + the parallelism trio settle, when the substrate is stable enough to
design against.

## Alternatives

- **Option A: Build contributor flow under WOR.** Rejected — inflates WOR scope, blocks WOR ship, contributor design
  benefits from settled substrate.
- **Option B: Address contributor concerns ad-hoc as adjacent WUs touch the code.** Rejected — produces inconsistent
  treatment; design drifts across uncoordinated touchpoints.
- **Option C (this plan): Defer to a focused planning pass post-WOR + post-parallelism-trio.** Captures open items
  here; revisit when foundations are stable.

## Unknowns and Assumptions

**Open scope items** (revisit at planning pass):

- Contributor-meta creation step: who emits `user/{identity}/<wu-name>/meta-<wu-name>.md` — workflow vs. CLI
  command vs. fork-init flow.
- Full contributor lifecycle ceremony (fork → clone → create-WU → PR → merge → archive).
- Per-user content sync between contributor and maintainer machines (intersects Worktree Foundation sync work).
- Contributor boundaries on package-source vs. instance-source edits — codified in DEV-RULES.ARC §
  Configurability; contributor-flow side not fully wired.
- Tooling shape for fork-aware operations (`arc contribute`? `arc fork-init`? reuse of `arc join`?).

**Assumptions**:

- WOR's R65a path convention is the durable shape (contributor-role meta at per-WU subdir).
- Worktree Foundation's sync mechanism handles the cross-machine portability dimension.
- Agile WU Lifecycle's tier model applies to contributor WUs uniformly.

## Scope Estimate

Medium (days-week) — a focused planning pass producing a PRD. Some scope items may split into separate WUs depending
on what surfaces.

Dependencies: WOR (parent — ships path convention), Worktree Foundation (sync), Agile WU Lifecycle (tier model).
