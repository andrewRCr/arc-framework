# Draft: Left-Errand Resumption

- **Origin:** `USER-INBOX § Errand`, housekeep drain (2026-08-20).
- **Purpose:** Make an Errand left awaiting merge visible, classifiable, and resumable on the leaving machine.

## Problem / Motivation

The in-flight Errand surface appears only on session-init's Orient arm and has no mergeable state, so it never says
that checks and review are settled. The materialize route is also blocked on the leaving machine: `arc errand leave`
removes occupancy but retains the local branch, while materializable-Errand discovery excludes records whose branch
is locally present. The Errand consequently appears in neither actionable surface.

## Direction

- Add a mergeability-bearing event derived from host checks and review settledness on the recorded exact head.
- Decide where that event should render beyond the Orient arm.
- Settle whether leave deletes the local branch or materialization admits the left-local case.
- Preserve exact-head, ambiguity, and stale-state refusals while making ordinary re-entry deterministic.

Remote branch cleanup after a completed Errand is a separate atomic repair and is not part of this work unit.

---
