# Draft: Bound Decomposition Finalization Cost

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit`, housekeep drain (2026-07-30); captured during
  `decompose-transform-integrity` delivery slice 06.
- **Purpose:** Bound finalization's subprocess and concurrency growth so a realistic decomposition completes
  within ordinary command budgets without changing canonical ordering, Git path semantics, or fail-closed
  transition evidence.

---

## Problem / Motivation

Finalization starts one managed-path state projection with two Git-backed reads for every allowed path. Staged-path
discovery adds another two Git probes per path. Neither surface bounds concurrency or subprocess count.

The first real measurement showed this is already material at the smallest realistic cut, not only on a
hypothetical wide plan:

- 19 source units, five destinations, and 16 allowed paths in a 2,504-file repository
- `--preflight`: 15.6 seconds
- `--execute`: 2 minutes 28 seconds, roughly 9.5 times preflight
- system time at 56% of user time, consistent with process and syscall churn

The runtime exceeds common two-minute command timeouts. Termination can strand a partial candidate, turning a
performance defect into an operational recovery state.

## Approach

1. Add representative measurements that separate worktree creation, managed-path projection, staged-path
   discovery, and non-Git computation.
2. Bound projection concurrency while preserving canonical result ordering and deterministic diagnostics.
3. Batch staged-path probes without changing Git pathspec behavior, empty-input handling, or error policy.
4. Reuse immutable object identity where safe; never cache across a boundary whose integrity contract requires a
   reread.
5. Prove output and refusal parity against the shipped finalization path before adopting the faster path.

## Unknowns and Assumptions

- How much of the measured cost belongs to worktree creation versus per-path projection?
- Can one Git invocation preserve every current path-level failure locus, or does batching require a typed
  attribution layer?
- Which timeout budget should become the regression target across supported platforms?

## Scope Estimate

Medium — measurement harness, Git-query restructuring, concurrency control, and parity coverage.
