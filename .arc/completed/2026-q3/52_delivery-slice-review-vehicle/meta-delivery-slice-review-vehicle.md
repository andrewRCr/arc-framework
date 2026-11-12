# Metadata: delivery-slice-review-vehicle

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-delivery-slice-review-vehicle.md`
- **Task List:** `tasks-delivery-slice-review-vehicle.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Task 6.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/481>
- **Completed:** 2026-08-08

---

## Release Notes Entry

Non-final delivery-stack members can now enter ARC's exact-head local-review and merge-lock readiness lifecycle as
typed `delivery-member` vehicles, without adopting work-unit or Errand branch naming and lifecycle artifacts.
Terminal members continue through the existing work-unit readiness path.

### Added

- A repository-bound delivery-member identity authenticates the plan, deliverable, owning work unit, and recorded
  base and head commits before admitting a non-final member to review.
- Local delivery-member reviews pin the member's recorded target while preserving the owning work unit's review
  assurance across preparation, attestation, re-entry, response, and reduction.

### Changed

- Review readiness and merge-lock release now fail closed when delivery state is unavailable, a member head is
  unbound or mismatched, or the requested member is terminal.
- A local member review can resume from a moved or dirty owning-work-unit control checkout without weakening its
  exact-target binding; ordinary work-unit and Errand behavior remains unchanged.

## Completion Notes

Delivered exact-head delivery-member admission across readiness, local review, and merge-lock release. One
repository-bound lookup authenticates member identity and finality, member targets derive from their recorded base
and head commits, and local prepare, attest, resume, respond, and reduce operations preserve the member vehicle.
Terminal members retain work-unit lifecycle checks, and ordinary work-unit and Errand paths remain unchanged.

Scope held throughout implementation. No workflow, dispatch, template, permission, or storage surface was added.
The implementation extends the existing typed review contracts, injectable repository adapters, and CLI composition
roots without changing the documented division between deterministic CLI mechanics and human disposition or final
integration authority.

Integration used a maintainer-authorized direct local review while the routed review architecture remains pending
repair. Three contract-closed chunk passes and a cross-chunk seam pass found one persisted-state discriminator gap:
local review state allowed delivery-member vehicle and target kinds to disagree. The schema now rejects both crossed
combinations, valid member and ordinary states remain accepted, and a focused follow-up review was clean.

After reconciliation with main and again after the review fix, applicable gates passed. Final verification covered
Markdown and ARC contract checks, TypeScript and shell lint, both typechecks, the build, and the full test suite:
9,800 tests passed and one was skipped.
