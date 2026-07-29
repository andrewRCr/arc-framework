# Metadata: decompose-transform-integrity

| **State**     | **Owner** | **Branch**                           | **Class** | **Priority** |
| ------------- | --------- | ------------------------------------ | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/decompose-transform-integrity` | `Heavy`   | `P1`         |

- **Cohort:** `decompose-transform-integrity`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-decompose-transform-integrity.md`
- **Task List:** `tasks-decompose-transform-integrity.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Phase 6 verification completed; delivery stack landed through PR #393
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Open the lifecycle-only closeout PR

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

Decomposition now runs through one closed v3 transform from read-only preflight to exact-base publication and
local cleanup. Canonical machine evidence, typed recovery, and one semantic distribution interlock replace the
previous operator-assembled proof path.

### Added

- Canonical read-only preflight, exact result planning, claim-backed candidate ownership, idempotent finalization,
  and a read-only landed-publication handoff.
- Exact planning-profile preservation, composed cohort topology, receipt-backed launch readiness, and atomic
  work-unit start for decomposed members.

### Changed

- Commit validation, project projection, merge recovery, landed handoff, and local cleanup now consume the same
  validated transition authority and exact-base integration anchor.
- The decomposition workflow now drives typed CLI operations and reported recovery actions while reserving one
  post-authoring interlock for semantic distribution judgment.

### Removed

- Legacy v1/v2 decomposition authoring, execution, evidence, fixtures, and workflow choreography.

## Completion Notes

Delivered the trustworthy retirement core described by the detailed RFC: one tree-pinned source and immutable
result plan, byte-exhaustive allocation, exact managed-path composition, protection-aware occupation, atomic
planning graduation, canonical finalization, durable publication, exact-base lifecycle authority, and a
verb-driven workflow. The resulting v3 contract is the only decomposition authoring and authority path; unrelated
rename, abandon, and park receipt behavior remains intact.

The delivery departed materially from its size estimate and the normal one-work-unit/one-PR topology. A
5k-8.5k core estimate became 52,050 implementation changed lines, plus 3,015 planning lines. Seven ordered PRs
(#382-#386, #392, and #393) therefore landed the work append-only, with temporary self-deleting compatibility
caps where the authored phase boundary was not independently coherent. This changed delivery mechanics, not the
settled product scope. The cohort's separate base-mobility, extraction, planning-lane, and durable-consumer
extensions remain outside this core by design.

Verification passed Markdown and ARC contract linting, TypeScript and shell linting, source and test typechecking,
build, and the full Vitest matrix with 8,373 tests passed and one intentional skip. Two adversarial verification
passes converged after legacy retirement and final shipped-reference corrections. Alignment checks found no
conflict with the project PRD or technical overview: the result strengthens typed CLI boundaries, preserves the
human semantic interlock, and stays within the documented hybrid CLI and methodology architecture.

---
