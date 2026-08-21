# Draft: stub-mint-to-launch

- **Origin:** FP wave-2 slate preparation required repeated protected-base round trips before newly minted work
  units were visible to `arc start`. Live decompositions on 2026-07-26 reproduced the same shape arriving through
  `arc decompose` instead of `arc stub`.
- **Purpose:** Turn the protected-repository stub-to-launch sequence into one resumable, explicit workflow without
  weakening integration approval or hiding base freshness — and make a newly minted work unit arrive correctly
  classified and immediately reachable, whichever verb minted it.

---

## Problem / Motivation

A new slate work unit currently requires a grooming branch, `arc stub`, a PR, integration approval, merge, local
base synchronization, and launch from a checkout that can resolve the merged stub. The sequence is principled but
manual, and it was repeated for both FP wave-2 stubs. A stale invoking checkout can also miss the merged stub and
fall into the wrong start arm unless slug resolution is base-anchored or launch returns to the synced base locus.

## Mint semantics — entry-point-agnostic

Two concerns arrived from live decompositions and belong here rather than with the transform, because both are
properties of a freshly minted work unit and both reach the same state through `arc stub` and `arc decompose`.

- **Commitment level must inherit, not default down.** Decomposing already-planned work produced `provisional`
  members, forcing an immediate manual move. Commitment attaches to the _concern_, and a cut redistributes that
  concern without re-litigating whether it is wanted: if the whole was planned, each piece is planned unless
  someone actively decides otherwise. Demotion should be the deliberate act, not the silent one. **Provisional is a
  commitment statement, not a readiness statement** — an unmet dependency, a full plate, or "not startable this
  week" are readiness facts and none of them imply provisional. At minimum this should ask; better, infer from the
  origin.
- **Close with launch, at least opt-in.** Decomposition ends with members in `backlog/planned/` and no member
  started, so the operator must recall N freshly minted slugs with no artifact carrying them forward, and pay the
  protected-base round trip before any of them is workable. Letting a mint optionally end with all members, or an
  agreed subset, started into their own worktrees removes both costs. `arc-session --start <slug>` is the existing
  partial door; the missing piece is handing minted slugs into it.

The readiness-versus-commitment distinction itself may be guidance rather than machinery — it is not currently
written down anywhere, and may belong to the planning-module strategy instead of here.

## Candidate Shape

- Provide one operator-facing flow that mints the stub on an isolated grooming branch, publishes the lean planning
  PR, and stops at the existing integration interlock.
- Resume after merge to synchronize the local base and report a launch-ready locus; never imply that routing or PR
  creation authorized integration.
- Reuse the shipped stub, PR-resolution, merge-strategy, and base-sync contracts instead of duplicating their
  safety logic.
- Make re-entry idempotent across the PR-open, merged-but-unsynced, and launch-ready states.
- Consume the facts-only `LandedDecompositionHandoff` emitted by `arc decompose <origin> --handoff` for
  decomposition entry. Preserve its ordered selected readiness and blockers; do not parse retirement receipts,
  infer a frontier, or accept precomposed launch commands from the core transform.

## Design Questions

- Whether this is a composed CLI verb, a workflow/skill orchestration, or a thin verb plus workflow wrapper.
- What durable state, if any, is required to resume after the asynchronous merge boundary.
- Whether base-anchored slug resolution fully removes the launch-from-base leg; reverify against the current tree
  before fixing the final sequence.

## Boundaries

- Keep explicit integration approval unchanged.
- Do not create a second PR controller or duplicate host-specific review coordination.
- Coordinate with FP wave-3 slate launch and `session-locus-model`; the launch-ready checkout must follow the
  durable-locus decision rather than introducing another displacement rule.

---
