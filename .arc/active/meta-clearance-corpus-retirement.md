# Metadata: clearance-corpus-retirement

| **State**     | **Owner** | **Branch**                          | **Class** | **Priority** |
| ------------- | --------- | ----------------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `chore/clearance-corpus-retirement` | `Light`   | `P2`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-clearance-corpus-retirement.md`
- **Task List:** `tasks-clearance-corpus-retirement.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Task 5.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** open the PR

- **PR URL:** [none]
- **Completed:** [none]

---

## Release Notes Entry

New installs and live doctrine no longer offer or describe an installable required-status clearance path. Merge
hold is a configuration opt-in (`merge.lock: draft`) with draft-PR structural hold and the existing `arc merge
lock` commands; setup and auto-merge guidance point only at documentation that ships with the package.

### Removed

- The Set Up ARC Clearance workflow and the `arc-clearance.yml` merge-gate template from the install recipe and
  project mirror.

### Changed

- Initial setup offers a draft-state merge lock config opt-in instead of a clearance install ceremony.
- Auto-merge setup, CODEOWNERS comments, doctrine, and overview prose describe the draft-lock model and keep the
  never-infer merge-safety caution.
- The live-pair script install blurb describes lane-attestation support rather than clearance publication.

## Completion Notes

Shipped the docs/install retirement of the optional `arc-cleared` path after draft-lock landed in
merge-readiness-control. Package and project mirrors stayed byte-identical for dual-copy edits; recipe and
manifest dropped the deleted paths while retaining `confirm-live-change-pair.sh` for lane attestation.

Doctrine rewords stayed inside the recorded constraint (required check ≠ draft lock; never-infer caution kept).
Coupled integration tests were retargeted to positive ship-set and live-prose pins rather than inverted absence
cases. Hosted review produced two findings: migration/teardown for legacy host clearance was **rejected** under
pre-public-release compatibility posture; an adopter-facing ADR-031 pointer was **fixed** by making setup guidance
self-contained against shipped Auto-Merge Lane doctrine.

Verification: Tier 3 green including full suite (9722 tests); success criteria 8/8 met with one recorded
deviation on test pin style. Operator direction skipped the broken ARC review substrate for this PR except merge
lock; hosted review was run manually.

---
