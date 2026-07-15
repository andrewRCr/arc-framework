# Draft: stub-mint-to-launch

- **Origin:** FP wave-2 slate preparation required repeated protected-base round trips before newly minted work
  units were visible to `arc start`.
- **Purpose:** Turn the protected-repository stub-to-launch sequence into one resumable, explicit workflow without
  weakening integration approval or hiding base freshness.

---

## Problem / Motivation

A new slate work unit currently requires a grooming branch, `arc stub`, a PR, integration approval, merge, local
base synchronization, and launch from a checkout that can resolve the merged stub. The sequence is principled but
manual, and it was repeated for both FP wave-2 stubs. A stale invoking checkout can also miss the merged stub and
fall into the wrong start arm unless slug resolution is base-anchored or launch returns to the synced base locus.

## Candidate Shape

- Provide one operator-facing flow that mints the stub on an isolated grooming branch, publishes the lean planning
  PR, and stops at the existing integration interlock.
- Resume after merge to synchronize the local base and report a launch-ready locus; never imply that routing or PR
  creation authorized integration.
- Reuse the shipped stub, PR-resolution, merge-strategy, and base-sync contracts instead of duplicating their
  safety logic.
- Make re-entry idempotent across the PR-open, merged-but-unsynced, and launch-ready states.

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
