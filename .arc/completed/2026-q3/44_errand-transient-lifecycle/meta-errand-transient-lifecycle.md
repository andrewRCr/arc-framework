# Metadata: errand-transient-lifecycle

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-errand-transient-lifecycle.md`
- **Task List:** `tasks-errand-transient-lifecycle.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Task 5.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/444>
- **Completed:** 2026-08-04

## Release Notes Entry

Errand identity can now survive a local checkout and resume on another machine through exact, provenance-bearing
lifecycle operations.

- **Added:** `arc errand leave` persists verified paused or review-waiting state, and `arc errand materialize`
  recreates an exact remote-only Errand locus.
- **Changed:** Session initialization discovers materializable Errands from complete v3 identity snapshots and
  binds pickup to the selected claim and remote head.
- **Removed:** Legacy v1/v2 Errand identity readers, record mutations, recovery probes, and compatibility paths;
  v3 transient identity is now the sole authority.
- **Fixed:** Leave and materialization fail closed on stale generations, incomplete identity state, mismatched
  remote or review heads, fork-only preservation, and rollback residue without deleting recoverable branches.

## Completion Notes

Delivered the complete leave-to-materialize lifecycle for full-protection Errands. Departure now proves remote
preservation before retiring local occupancy, retained identities remain independent of machine-local worktrees,
and materialization recreates exact ARC ownership and role provenance before ordinary open resumes the claim.

Review hardening bound discovery and mutation to complete, exact identity generations; added remote-only discovery,
strict head validation, stale-retry guards, machine-readable topology failures, and preservation of branches when
failed provisioning leaves durable recovery state. The original compatibility boundary was intentionally
superseded under the project's pre-public-release posture: obsolete v1/v2 readers and their duplicate close,
recovery, and status paths were removed after they falsely classified valid v3 identities as malformed.

Local Tier 3 verification passed Markdown and code linting, ARC contract checks, both TypeScript checks, 9,557
tests with one intentional skip, and the package build. Required pull-request CI also passed on the implementation
head.

---
