# Metadata: Seam Delivery and Review Records

| **State**     | **Owner** | **Branch**                  | **Class** | **Priority** |
| ------------- | --------- | --------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/seam-delivery-review` | `Heavy`   | `P1`         |

- **Cohort:** `state-storage/storage-seam`
- **Depends On:** [none]

- **Origin:** [internal] — the `storage-seam` cut (2026-10-09)
- **Design:** `spec-seam-delivery-review.md`
- **Task List:** `tasks-seam-delivery-review.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:88fda83978ce192ec2b9d570009971ee3505042f470541bebabee12d45cdd8d9`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 8.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Run or resume the typed pre-publication review procedure.

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

The CLI's integration checks now bind the metadata and code head they validated. Delivery and review operations also
gain capability-gated support for off-branch state.

### Added

- `arc review adversarial record` records approved adversarial results when off-branch storage is active and reports
  unsupported on repository-backed storage.

### Changed

- Integration checkpoints bind evidence to both the metadata record and code head.

- Native Candidate, review and readiness paths use project and generation identities and preserve complete, absent and
  unreadable listing distinctions.

- Saved delivery scope judgments retain every examined member, and base-drift inspection reports unavailable locus
  evidence explicitly.

### Fixed

- Native lifecycle snapshot and readiness diagnostics retain supplied repair commands.

- Stored-design export rejects linked destination components before staging review copies.

## Completion Notes

The delivery and review storage seam is implemented: six compact review kinds carry Candidate and publication state,
evidence, outcomes, immutable subject-bound decisions and adversarial results. Registered parsers and write checks
validate those records, while executable review working state stays machine-local. Candidate, local and hosted review,
lifecycle readiness, publication and reopening use the selected Store with exact project and generation binding.
Withdrawal and retirement are derived from native facts; design export produces one-way review copies with destination
containment checks.

The current repository-backed behavior remains in place behind the storage capability. Native arms, record schemas and
the import mapping are implemented and tested; backend activation and an end-to-end store-backed cutover rehearsal
were not performed here. Material corrections preserve saved conditional grants, established-owner policy reads and
faithful command fixtures. The remaining native diagnostic command-loss risk in review-fact synthesis, Candidate-owner
inventories and Candidate-subject reads is assigned to the existing cutover rehearsal by the accepted review decision.

The qualified code head bb170d9d43c0c0c1214e136c594fb9a71b42b33c passed the local merge gate after both base
reconciliations: 19 selected checks, including 23,722 unit cases and all 324 reached store suites out of 337. The
store selection completed 4,896 cases; 604 unit cases and 61 store cases were skipped by their declared platform or
scenario conditions. Full hosted CI run 41584885394 passed on its first attempt with all 12 Windows/macOS portability
shards and no diagnostic inputs; required PR CI run 41584847160 also passed. A separate bounded repair check at
d5c7fb18b961fd2e517ac7614f1544eabdae9b60 covered three files and five hunks without findings, supported by 36
completed integration cases.

Review concluded by an Owner-accepted stop at d5c7fb18b961fd2e517ac7614f1544eabdae9b60 after five complete passes and
the approved repair checks; no sixth complete pass ran. Pass 5 had four source-verified majors, seven minors and one
unsupported finding, compared with pass 4’s ten majors and seven minors. All material fixes from those rounds and the
subsequent qualification corrections are performed and checked. The standard terminus records accepted risk; the
frontline skip/no-progress representation under-records the Owner’s accepted-risk decision and is not an evaluator-
clean result. The accepted stop carries across later base reconciliation, record and lifecycle commits under the
standing direction.

---
