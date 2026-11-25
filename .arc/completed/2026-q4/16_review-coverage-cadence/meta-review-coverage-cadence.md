# Metadata: review-coverage-cadence

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-review-coverage-cadence.md`
- **Task List:** `tasks-review-coverage-cadence.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:c32c34fa2597519e5513da26f9e5f480e651644171e9bff373c7efb6393e1ad1`

- **Current Workflow:** [none]
- **Last Completed:** Task 8.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** —

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/1038>
- **Completed:** 2026-10-18

---

## Release Notes Entry

Review distinguishes complete passes from scoped fix and delta checks. Repairs receive local inspection while
complete coverage remains the requirement for automatic satisfaction of a `full-final` review.

### Added

- Local fix checks and plain-commit delta checks with ranges derived from verified review history.
- Review-lane facts showing complete-pass counts, material-finding trends, correction ranges, and performed changes.
- Optional advisory fix tags that distinguish a local correction from new design without changing disposition identity.

### Changed

- Only complete passes consume the standard-review ceiling; fix-check rounds retain separate approval.
- Material fixes require local follow-up, and hosted review sources provide complete coverage.
- Planning, code, and verification review use named shared methods and one pass model across lifecycle entrypoints.

### Fixed

- Recoverable source refusals retain local and configuration-repair guidance and offer Owner stops only where supported.
- Stored review envelopes preserve their public shape while coverage facts remain internal.

## Completion Notes

Delivered scoped fix and delta coverage across private preparation, published singletons, Errands, and delivery-member
review. Complete-pass accounting, local reinspection after material fixes, exact correction proofs, and typed source
selection preserve the existing routing and approval boundaries. A converged fix check alone does not satisfy
`full-final`; an explicit Owner acceptance remains a distinct accepted-risk terminus.

Shared review methods now own the author checks, criteria companion, findings protocol, and pass model used by their
lifecycle callers. Criterion text and identity remain immutable. Stored terminal review envelopes retain their public
shape; the optional advisory fix tag is the sole stored addition and stays outside the approved disposition identity.

All nineteen success criteria closed against source and executable evidence. The final prepublication merge gate
passed nineteen selected checks, including both type checks, full build, 16,136 unit tests, 3,862 integration tests,
and contract checks; three CI-only checks remained for hosted execution. Verification's independent companion produced
three minor corrections, all approved and tested. The later complete standard review covered seven chunks plus a seam
and aggregate, found one minor guidance defect, and its approved correction passed targeted regressions and forced
focused gates. The Owner accepted the review terminus after that correction; no independent reread of the minor repair
or additional complete pass was claimed.

The integration base merge at `1070c0ff1` preserves main's verification-scope and sizing safeguards while keeping the
independent criteria companion in its shared review method. The approved conflict resolution matched its prepared
preview in both copies. New-head checks passed four checks and reused eleven valid results, including both type
checks and contract checks; the unit suite passed 16,141 tests with 549 skips. Hosted integration and E2E coverage
remains owned by the pull request's required checks.
