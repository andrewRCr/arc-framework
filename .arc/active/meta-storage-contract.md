# Metadata: Storage Contract

| **State**     | **Owner** | **Branch**              | **Class** | **Priority** |
| ------------- | --------- | ----------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/storage-contract` | `Novel`   | `P1`         |

- **Cohort:** `state-storage`
- **Depends On:** [none]

- **Origin:** `[internal] — renamed from arc-backend at the state-storage re-cut (2026-09-28), absorbing
  local-mode`
- **Design:** `spec-storage-contract.md`
- **Task List:** `tasks-storage-contract.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:69b9660eec916aac7c0168c8b15490e4c57f8f415a37dfb8c5250632c780d97c`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 8.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Resume publication at the idempotent push, then resolve or open the change request.

- **PR URL:** [none]
- **Completed:** [none]

---

## Completion Notes

Delivered the typed storage contract, existing-substrate implementation, non-Git reference backend and shared
conformance suite. Shared concurrency primitives preserve current-side placement and conflicts. The reference backend
demonstrates record history and identity across promotion. The current-work-unit resolver, lifecycle index and
integration lifecycle port use the contract at their existing call sites. The consumer map assigns the remaining
substrate coupling and records the ref backend, projection and cutover obligations; those implementations remain later
work.

Source-verified repairs and forward amendments settle promotion identity, repository-qualified captures, typed absence
and conflicts, deciding inventory, publication failures and owner-scoped listings. Original criteria and historical
verification remain unchanged. Eight full Standard passes and their approved responses are retained; the final
independent focused owner-filter check reported no findings and passed 72 tests. Standard review ends by the accepted
Owner terminus after Pass 8, with the broader residual accepted.

Local verification at the completed response passed 15,854 tests. Fresh checks after the append-only base merge passed
16,050 tests, both type checks, the complete lint and ARC contract gates, and the build. Behavioral controls
reproduced the original owner-filter failure and verified its repair. Required E2E/portability CI and final readiness
remain governed by the exact-head integration checkpoint; prior results remain evidence for their original inputs.
Verification archives are preserved outside the work-unit workspace.

## Release Notes Entry

State synchronization and integration checks retain clearer failure diagnostics and refuse unsafe continuation when
Git observations or work-unit inventories are incomplete.

### Fixed

- Incomplete Git observations and uncertain notes merges retain their failure causes, preserve pending state and
  require a safe repair before publication.
- Integration checks refuse incomplete or unreadable work-unit inventory while unrelated work units' session
  initialization remains isolated.

---
