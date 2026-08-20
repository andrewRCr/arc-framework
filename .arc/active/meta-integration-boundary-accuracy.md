# Metadata: integration-boundary-accuracy

| **State**     | **Owner** | **Branch**                           | **Class** | **Priority** |
| ------------- | --------- | ------------------------------------ | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/integration-boundary-accuracy` | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-integration-boundary-accuracy.md`
- **Task List:** `tasks-integration-boundary-accuracy.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:73f9d59b4b1ab247830d50d5a2af92b9fdba0680f5948dbeac0d91d9ce40687b`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 15.2.c — Verify and re-attest the corrected Candidate
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Resume publication at the idempotent push, then resolve or open the change request.

- **PR URL:** [none]
- **Completed:** [none]

---

## Release Notes Entry

ARC now distinguishes verified Candidate preparation from public integration and drives the publication and merge
tail through typed, exact-target operations. Review authority, recovery, reconciliation, required checks, and the
final merge decision remain bound to the Candidate and head they actually cover.

### Added

- Durable Candidate attestation, subject lineage, and a prepublication review phase with exact resume loci.
- Typed change-request resolution, base reconciliation, required-check waiting, integration checkpointing,
  settlement execution, merge-method validation, and pinned merge commands.
- An explicit Work Unit Owner-accepted standard-review terminus that records accepted risk without claiming a clean
  review result.

### Changed

- `Integrating` now begins when publication starts; `arc publish` owns that transition, while `arc integrate` is the
  namespace for checkpoint and merge operations.
- Integration workflows retain human judgments, interlocks, and extension seams while delegating deterministic
  sequencing and evidence composition to the CLI.

### Fixed

- Candidate and review authority now survive operational movement and exact-subject recovery without carrying
  stale review state onto changed implementation.
- Final integration refuses stale heads, unsettled review responses, moved base state, disallowed merge methods,
  and approval-voiding state changes before merge.

## Completion Notes

Delivered the Candidate-to-publication lifecycle and exact integration spine described by the spec: canonical
Candidate attestation and currentness, private prepublication routing and convergence, durable hosted-review and
Owner-terminus authority, exact change-request and base-state resolution, checkpointed settlement composition,
required-check waiting, merge-lock coordination, and head-pinned merge execution. Status, session initialization,
recovery, lifecycle verbs, workflow guidance, public schemas, and package/project mirrors now share those contracts.

Several planned names and surfaces changed as their semantics became concrete. `propose` and `submit` became
`attest` and `publish`; the public pull-request review record was reduced to the optional local-review carrier
instead of carrying internal process narration; and Candidate preparation became a first-class prepublication
session phase rather than remaining labelled execution or integration. Dogfooding the final Owner-accepted terminus
then exposed that Active status and recovery discarded the exact stored boundary; the closing correction preserves
it only for the matching Work Unit, Candidate, and subject, while stale subjects still return to review.

Verification finished on the exact corrected Candidate with every Markdown, ARC contract, TypeScript, and shell
lint gate green; both strict typechecks; the production and declaration build; a 189-test focused recovery and
procedure matrix; and the full 10,249-test suite with one intentional skip. Repeated chunked standard review drove
the substantive remediation, and the Work Unit Owner explicitly accepted the final exact review terminus without
recasting that decision as an evaluator clean result.
