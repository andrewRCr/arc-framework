# Draft: integration-lane — provider-neutral final-integration serialization

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit` at the 2026-07-19 housekeep drain; captured during
  post-`finalize-parallelism` CI and merge-concurrency review, 2026-07-18.
- **Purpose:** Give ARC a repository-scoped **integration lane** that serializes the final-integration window across
  concurrent work, so a work unit's final-integration checkpoint is not repeatedly invalidated by unrelated merges to
  the base branch — without depending on a provider-native merge queue the current private repository cannot use.

- **State:** Planned — promoted 2026-08-22 after repeated final-integration waiting and recovery failures made the
  lifecycle boundary a near-term operational priority.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration._

### `[ ]` **Right-size integration waiting and make merge semantics honest**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-08-22); captured during `decompose-extraction`
  integration of PR #533.
- _Concern:_ `arc integrate merge` releases the draft lock before a long required-check wait, names the whole
  operation “merge” even while it is only awaiting checks, observes the required rollup too late to diagnose an
  already-failed shard, and can leave an interrupted pull request released without having merged.
- _Immediate extraction:_ an Errand keeps the lock held while checks are pending, surfaces terminal underlying
  failures diagnostically without making them merge authority, bounds the wait without immediate recursive retry,
  and releases only for the final exact-head merge attempt.
- _Fold-in:_ reconsider the durable lifecycle and verb boundary after that relief lands. Compare a distinct
  preflight/await verb, a green-only merge verb, and native auto-merge; keep exact approved-head binding,
  checkpoint and settlement authority, merge-method enforcement, lock compensation, and post-merge lifecycle
  attachment while preferring host-native waiting and merge primitives over duplicate orchestration.

---

## Problem / Motivation

A work unit's final integration checkpoint was repeatedly invalidated while a sequence of Errand PRs merged to
`main`. ARC names merge queues as the mechanical answer, but the lifecycle has no provider-neutral queue or
serialization contract, and the current personal/private GitHub repository cannot use the native queue.

## Proposed direction (rough)

Define a repository-scoped integration lane that:

- distinguishes a broad `Integrating` state from a short **exclusive final-integration window**;
- provides a **manual serialized fallback** on every host (no dependency on a native queue);
- leaves a typed **adapter seam** for GitHub `merge_group` behavior when native queues become available.

## Scope

Coordinate work-unit integration, Errand close, queue-head visibility and priority changes, exact-head review state,
asynchronous merge completion, and the future public-repository or organization transition.

## Scope Estimate

Heavy — the design composes existing integration, host-check, merge-lock, and provider-adapter primitives, but the
cross-surface lifecycle and recovery contract requires substantial grounding before implementation.
