# Metadata: Storage Ref Backend

| **State**     | **Owner** | **Branch**                 | **Class** | **Priority** |
| ------------- | --------- | -------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/storage-ref-backend` | `Heavy`   | `P1`         |

- **Cohort:** `state-storage`
- **Depends On:** [none]

- **Origin:** [internal] — the `state-storage` re-cut (2026-09-28)
- **Design:** `spec-storage-ref-backend.md`
- **Task List:** `tasks-storage-ref-backend.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:5ff0f5dd93beb68f34575568e152e4c01a84c1740cafa6b58eb4fd31653e660e`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 19.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Resume publication at the idempotent push, then resolve or open the change request.

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

ARC now requires Git 2.47 or newer, and `arc-config.yml` gains a setting for a state backing repository.

### Added

- `storage.backing_repository` in `arc-config.yml`: an optional backing-repository URL for ARC state, empty by
  default. `arc config validate` refuses a value that is only whitespace.

### Changed

- ARC requires Git 2.47 or newer, up from 2.45.

## Completion Notes

The `refs/arc/*` store implements the whole storage contract over Git refs, in the code repository's own refs or in a
separate Git directory for a backing repository, on one engine. It syncs through a fetch-only `pull` and a batched
`push` that can carry a code ref and classifies every rejection per ref. Each clone designates its state remote on the
remote itself, and an upstream's state reads as a read-only source. `arc store migrate` moves a clone between layouts
and remotes restartably, with the import of today's tracked files and notes as its one-time source. Git access gained a
ref-transaction helper, batched reads, cancellation on every executor variant and a 2.47 floor, and `maintain()` keeps
the store packed. The backend stays dark: `createStore` still composes the in-repo implementation, which answers the new
`pull` and `push`, and `arc store` is hidden. What runs live is the shared Git executors and cancellation, the in-repo
store's sync operations and their session and handoff consumers, configuration parsing, and the reach-selected
`test:store` check.

The design was amended forward sixty times. The contract changes it makes — to D1, D2, D3, D4, D6, D10, D12 and D14 —
are recorded in `cohort-state-storage.md` § Shared contracts, and the contract's own specification stays as it shipped
(A59). A58 accepts one platform residual: on Windows the separate layout's publishing burst fails on a ref lock its
deadline strands, so it is skipped there. That repair, the review residual, and a same-quarter double-end copy that
refuses as namespace-corrupt are routed to `storage-ref-hardening` and `storage-ref-release-hardening`, which depend on
this work unit.

The task list's success-criteria record holds 53 lines: 45 met, two with deviation notes, and 8 superseded. Fifteen
spec criteria that review-fix amendments added (44–57 and 64) have no line there; each landed with the case that
exposed it and was not re-checked as a criterion. The host kit ran with GitHub and GitLab holding every check, and the
other hosts' results and the pack-cost measurement are in `notes-storage-ref-backend.md`. Prepublication review ran
eight complete standard passes. The eighth chunked the merge-reachable surface and the base-merge resolutions apart,
its material findings fell from 8 to 2 to 0 over two fix checks, and review closed there by Owner acceptance; the
boundary records frontline as skipped under that same decision. The convergence merge gate passed 19 checks at
`fa687de22`, the store suites' full run included, and hosted run `40928051907` passed every job at that head, the
Windows and macOS pair included.

---
