# Draft: integration-lane — provider-neutral final-integration serialization

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit` at the 2026-07-19 housekeep drain; captured during
  post-`finalize-parallelism` CI and merge-concurrency review, 2026-07-18.
- **Purpose:** Give ARC a repository-scoped **integration lane** that serializes the final-integration window across
  concurrent work, so a work unit's final-integration checkpoint is not repeatedly invalidated by unrelated merges to
  the base branch — without depending on a provider-native merge queue the current private repository cannot use.

- **State:** Provisional — pre-spec capture (2026-07-19). Iterate before committing to sequencing.

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

To be assessed at grooming — spans lifecycle integration mechanics and a provider-adapter seam; likely Heavy, but
the provisional tier defers the commitment.
