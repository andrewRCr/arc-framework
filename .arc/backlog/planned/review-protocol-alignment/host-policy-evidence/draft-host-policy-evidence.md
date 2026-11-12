# Draft: Host Policy Evidence

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-08-20).
- **Cohort:** `review-protocol-alignment`
- **Purpose:** Make merge and reconcile decisions read the host policy facts that actually govern the target branch.

## Problem / Motivation

Three shipped-path failures share a missing capability: accurate branch-scoped host evidence.

- Merge-method resolution reads repository-level method flags but not branch protection or rulesets such as required
  linear history, so it can attest a method the branch refuses.
- An empty required-check result cannot distinguish an unconfigured repository from required contexts not yet
  created on the current head, allowing a wait to finish before deferred CI appears.
- Reconcile reads the legacy lazy `mergeable` boolean instead of the host's native `mergeStateStatus` signal.

PR #510 confirmed the required-check gap: the checkpoint reported `not-required`, then the host refused merge because
the branch ruleset required `merge-ok`.

## Direction

- Add a branch-rules read to the merge-method port family and bind it into the policy fingerprint.
- Distinguish required-but-not-yet-created checks from an explicitly unconfigured host state.
- Adopt native merge-state evidence for reconcile.
- Preserve fail-closed exact-head and policy-change behavior with typed operator-facing diagnostics.

This is correctness work and does not wait behind `review-orchestration-right-sizing`; that work may consume the
resulting host-read shape when pruning duplicate composition.

---
