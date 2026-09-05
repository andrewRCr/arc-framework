# Metadata: delivery-native-stack-composition

| **State**     | **Owner** | **Branch**                               | **Class** | **Priority** |
| ------------- | --------- | ---------------------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/delivery-native-stack-composition` | `Heavy`   | `P1`         |

- **Cohort:** `chunked-delivery`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-delivery-native-stack-composition.md`
- **Task List:** `tasks-delivery-native-stack-composition.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:5937478d0d6b85ddf055526218a884779bf620432ad0eb1f1bce552bf109d774`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 9.1.R.n — Recover an interrupted prepared native landing exactly
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Candidate review pending — resume integration review

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

ARC can now deliver one work unit as an ordered provider-native stack while keeping the originating work-unit branch
as the ordinary terminal integration vehicle. Exact typed transitions coordinate member verification, hosted review,
provider refresh, landing, recovery, and cleanup without reconstructing stack state from branch names or prose.

### Added

- Provider-native stack composition in which every code-bearing member, including the terminal work-unit branch,
  participates in one ancestral chain.
- Member-scoped verification and hosted-review fan-out, with exact-head applicability, correction, and recovery
  continuations across member movement.
- Structural contribution comparison for provider-delegated refresh and native aggregate landing, plus deterministic
  position, teardown, and closeout operations.
- Integration doctrine and an architecture decision record covering delivery, review, and terminal authority.

### Changed

- Delivery integration now reduces the complete member conjunction through provider-neutral status before entering
  the ordinary exact-head checkpoint and merge interlock.
- Mechanically equivalent member movement preserves applicable verification and review evidence; genuine content
  conflicts and authority decisions remain attended.

### Fixed

- Interrupted refresh, correction, aggregate landing, teardown, Candidate renewal, and terminal rebind paths now
  resume through typed durable state without replaying provider effects or completed review lanes.
- Stacked bases, landed member bindings, base movement, and explicit Owner review closure no longer fabricate review
  work or block the terminal closeout sequence.

## Completion Notes

Delivered native stacked composition across authoring, publication, member verification, hosted-review fan-out,
provider-delegated refresh, landing, correction recovery, terminal integration, and residue cleanup. The work-unit
branch is the top member and terminal pull request; non-terminal members form its registered predecessor chain, and
the complete delivery converges through the ordinary Candidate checkpoint and exact-head merge authority.

Live self-delivery expanded the implementation through forward amendments where the original mechanics proved
incomplete. The final design includes a bounded delivery-correction driver, exact contribution-equivalence carry,
aggregate native settlement, member review-applicability preservation, fixed-origin session recovery, and typed
terminal rebind and teardown. It deliberately does not add convergence policy, a generalized workflow engine, a new
storage model, provider-independent restack machinery, or automatic content-conflict resolution.

The final scope aligns with the project's typed CLI architecture and its principle of codifying deterministic
operational friction while preserving human judgment at review disposition, conflicts, and merge authority. All 47
success criteria are resolved: 44 met and three superseded by implemented replacements. Final verification passed
Markdown and ARC contract lint, TypeScript and shell lint, both typechecks, the production build, 865 test files, and
11,445 tests, with one intentional skip each in files and tests. The eight-member review conjunction is discharged,
and the first seven members landed natively before the terminal candidate entered its final checkpoint.

---
