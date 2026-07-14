# Draft: Dev-Build Staleness-Guard Hard-Fail Policy

- **Origin:** [internal] — routed from `USER-INBOX` at the work-routing-discipline housekeep drain
  (2026-06-01); the asymmetry was surfaced in that WU's pre-PR review (CodeRabbit flagged `housekeep check`).
- **Purpose:** Decide — consistently across the `isHandoffCritical` set — whether advisory classifier commands
  whose output drives later state should hard-fail the stale-`dist` guard, rather than warn-and-proceed.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration.*

### `[ ]` **Content-hash the dev-build guard's bundle inputs**

- *Routed from:* `USER-INBOX § Errand`, housekeep drain (2026-07-13); reclassified because the content-hash
  sidecar and fail-safe detection policy cross the load-bearing dev-build guard's design floor.
- *Concern:* PR #223 scoped staleness to the bundle's esbuild-metafile input graph, but the verdict remains
  mtime-based. Checkout or rebase can rewrite input mtimes without changing content and falsely report stale dist.
- *Approach:* persist a build-time content hash over bundle inputs and compare it at check time, reusing the
  metafile input selection. A missing, malformed, or unreadable hash sidecar must retain the conservative fallback.
  Coordinate this correctness mechanism with the WU's hard-fail policy rather than creating a second guard owner.

---

## Problem / Motivation

`isHandoffCritical` (`packages/arc-framework/src/cli.ts`) hard-fails the stale-compiled-`dist` guard only for
state-mutating cross-machine operations — `arc sync`, `user save` / `push` / `sync`, `release commit` / `push`,
and the `status --json --session-init` / `--session-handoff` probes. Read / classify commands — `housekeep
check`, `errand check` — warn and proceed.

This is internally consistent today: both classifiers are advisory, not mutators. But their output *drives* later
state — `housekeep check`'s write-context verdict routes where the drain writes; a stale `dist` could make a
classifier mis-report and mis-route. So the open question is whether "is itself a mutator" is the right axis, or
whether "feeds a later state-mutating decision" should pull a command into the hard-fail set.

## Scope (candidate directions — not yet chosen)

1. **Promote feeds-later-state classifiers** — add `housekeep check` / `errand check` (and any advisory whose
   output drives a subsequent mutating decision) to the hard-fail set.
2. **Affirm the mutator-only line** — keep warn-and-proceed for all advisory classifiers and document the
   rationale, so the asymmetry reads as deliberate rather than an oversight.

Either way, apply the resolved policy **consistently across the whole `isHandoffCritical` set**, not per-command.

## Boundaries

Evaluate in the dev-build / release-tooling domain — not as a work-routing fix. Distinct from
`self-hosting-manifest-freshness` (install-state manifest hashes, not dev-build freshness) and from
`release-lifecycle` (release-model aggregation).

## Scope Estimate

Small — a policy decision plus a localized `cli.ts` change and tests. The decision may take longer than the
change, hence provisional.
