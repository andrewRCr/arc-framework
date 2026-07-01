# Draft: ci-tiered-portability-gating

- **Origin:** [internal] — `USER-INBOX § Work Unit`, housekeep drain (2026-07-01); captured during
  `ci-content-aware-depth` generate-tasks, weighing further CI-efficiency levers.
- **Purpose:** Add a finer second CI tier — skip the 3-OS `Portability` matrix for changes that provably can't
  touch the concurrency primitives — extending "cost follows content" one level past the single code-vs-docs
  gate.

---

## Problem / Motivation

`ci-content-aware-depth` gates the heavy suite on a single binary code-vs-docs path set. The 3-OS `Portability`
matrix, however, only validates the concurrency guards (exclusive-create `wx`/`O_EXCL`, advisory-lock `mkdir` +
`process.kill` liveness, CAS), so a code change that provably can't touch those primitives arguably needn't pay
for the cross-OS fan-out.

## Scope

Deliberately **not** folded into `ci-content-aware-depth`: it turns the canonical code-surface set from a clean
binary into tiers, and swaps the crisp "markdown can't affect tests" safety claim for a subtler "this code can't
affect concurrency behavior" one — ballooning the safety-verification surface that WU keeps precise. Best as a
**sequel** once the single-tier foundation (path set + Checks-API lookback) is proven in production.

## Approach

Add a concurrency-primitive path sub-set (the files behind the `Portability` guards) and gate the matrix on it
independently of the broader heavy gate, reusing the same already-verified lookback discipline so a skip still
means "this exact tree was actually verified."

- **Files:** `.github/workflows/ci.yml`, `scripts/classify-change.sh` (the canonical path set). Shares `ci.yml`
  with `ci-content-aware-depth` and `ci-cross-platform-hardening` — sequence on the shared file.

## Scope Estimate

Small–Medium; provisional until the single-tier foundation is proven in production.
