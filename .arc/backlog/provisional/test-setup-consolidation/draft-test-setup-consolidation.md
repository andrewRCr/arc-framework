# Draft: Test Setup Consolidation

- **Purpose:** Replace hand-built review objects and copied per-test setup with shared test builders, cutting the
  unit suite's reducible bulk without losing protection.
- **Origin:** routed from `USER-INBOX § Work Unit` at housekeep drain (2026-11-05); captured from a sampled audit of
  `packages/arc-framework/__tests__` during `test-typecheck-heap` draft-design (2026-11-05). The audit's
  internal-mocking half went to `test-di-migration`, and its syntax-analyzer move is an Errand.

---

## Problem

A sampled audit (about 62 files, 54k lines, weighted toward growth since `b2035d69c3`) found the suite mostly sound:
growth since 10-20 is new behavior coverage. About 5–8% of test lines are reducible without losing protection:

- **Review objects built by hand, with no shared builder.** `createReviewTarget({` appears at 276 sites in 129 files
  (131 files on 2026-11-05), with `createDispositionSet({` and `createReviewRequirement({` alongside.
- **Per-test setup copied inside the giant files**, such as `unit/sync-orchestrator.test.ts` and
  `unit/scripts/review-gate/policy/hosted-reservation-discharge.test.ts`.

This is not a type-check heap lever: the reducible share is a few days of the suite's growth.

## Approach

Shared domain builders in `__tests__/helpers/` for the review objects, then consolidate the giant files' copied
setup onto them. Settle each builder's shape against the call sites it replaces before sweeping.

## Sequencing

P3 (project-manager.ARC, 2026-11-05). The builders run through review and delivery tests that the storage chain is
changing, so start after those changes land. `unit/sync-orchestrator.test.ts` mocks `commands/user`,
`handlers/push-recovery` and `lib/user-sync/branch-bounded-notes-export`, which `cutover-notes-removal` deletes:
spend no consolidation there before that lands.

## Evidence

Audit report and scripts: `~/dev/arc-evidence/test-typecheck-heap/test-audit/` (`REPORT.md`) on this machine.
