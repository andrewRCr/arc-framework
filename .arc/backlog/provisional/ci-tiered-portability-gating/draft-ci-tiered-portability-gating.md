# Draft: ci-tiered-portability-gating

- **Origin:** [internal] — `USER-INBOX § Work Unit`, housekeep drain (2026-07-01); captured during
  `ci-content-aware-depth` generate-tasks, weighing further CI-efficiency levers.
- **Purpose:** Add a finer second CI tier — skip the 3-OS `Portability` matrix for changes that provably can't
  touch the concurrency primitives — extending "cost follows content" one level past the single code-vs-docs
  gate.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration._

### `[ ]` **Audit CI job topology for setup and whole-minute rounding waste**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-13); July 2026 Actions-allowance audit.
- _Approach:_ measure setup, dependency-install, and per-job rounding cost; evaluate safe consolidation or reusable
  prepared state while preserving diagnosability, required-context compatibility, least privilege, and truthful
  aggregate checks. Treat consolidation as an evidence-backed optimization, not an assumed win.
- _Runtime evidence (2026-07-14):_ PR #247's green attempt measured integration at 114.82s and E2E at 91.32s.
  E2E's global setup rebuilt the CLI for about five seconds after the same job had already run `npm run build`;
  the notes-heavy `user.test.ts` took 31.68s and the high-churn notes-compaction file took 12.67s. Separate
  integration and E2E jobs could remove roughly 90 seconds of wall latency, but would add setup and billed-minute
  overhead and reverse `ci-content-aware-depth`'s deliberate fixed-job decision. First evaluate removing the
  redundant in-job build and fixture-cost reductions that also improve reliability. Revisit job splitting only
  if faster feedback now outweighs the recorded Actions-cost rationale; do not restructure the retiring
  notes-user test surface purely for speed.

---

## Problem / Motivation

`ci-content-aware-depth` gates the heavy suite on a single binary code-vs-docs path set. The 3-OS `Portability`
matrix, however, only validates the concurrency guards (exclusive-create `wx`/`O_EXCL`, advisory-lock `mkdir` +
`process.kill` liveness, CAS), so a code change that provably can't touch those primitives arguably needn't pay
for the cross-OS fan-out.

Live observation from PR #162: the PR-triggered CI run for a workflow-doc-only change skipped Integration/E2E and
Portability, while the branch-push-triggered run for the same change ran both heavy jobs. The refinement should
check event/source asymmetry as well as path tiers, and distinguish workflow markdown that can affect runtime from
plain planning/docs markdown.

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
