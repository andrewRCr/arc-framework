# Metadata: Seam Lifecycle

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** `state-storage/storage-seam`
- **Depends On:** [none]

- **Origin:** [internal] — the `storage-seam` cut (2026-10-09)
- **Design:** `spec-seam-lifecycle.md`
- **Task List:** `tasks-seam-lifecycle.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:eb2e36f2665318c46401fca522b242717d325007fe46022b04358b34869cb7f9`

- **Current Workflow:** [none]
- **Last Completed:** Task 8.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** —

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/1027>
- **Completed:** 2026-10-16

## Release Notes Entry

Lifecycle commands preserve planning seeds and handle checkout cleanup and work classification more consistently.

### Added

- `arc set-class` sets a work unit's Class at any lifecycle placement.

### Fixed

- Cold starts preserve draft and spec seeds. Spawning with `--from` refuses before creating work instead of dropping
  the seed.
- Abandonment and Planning park check checkout removal before recording the transition. Missing checkout folders
  leave registrations that cleanup can unlock and prune.
- Personal workspaces close after transition record writes succeed, and activation refuses a work unit whose branch
  names the integration base.
- Checkout moves use Git's locked-worktree move form.

## Completion Notes

The lifecycle write path now has store-backed transition preparation and execution, typed record writes, prepared
reference reconciliation, dependency discharge, identity-preserving rename, and archive/cohort closeout. Branch
links retain created/adopted authority and exclusions; branchless Planning, activation and deactivation, pause and
handover, materialization, retirement, and task close/capture have capability-selected implementations. The existing
in-repo arms remain selected until the storage capability changes.

The off-branch arms are implemented and exercised over the checked reference backend and real Git provider seams.
Live default-backend selection, projection, anchored-marker admission, and the remaining runtime bindings depend on
the providers in `spec-seam-lifecycle.md` section 19. This work does not build the ref backend, perform the import or
cutover, or claim those integrations are live.

Forward amendments make spec finalization one checked record write, retain terminal branch authority for cleanup
retries, keep the legacy workspace outside off-branch rename, and distinguish local archive closeout from completion
learned through synchronization. Off-branch wrapper amendments refuse before Git until additive rewrite remapping
and recovery exist; ordinary new commits remain the supported continuation. The task list records the spec's 17
criteria and their provider and verification boundaries without rewriting the original verification outcome.

Verification at code commit `6a1fd03ec` passed all 19 locally applicable merge checks: 15,685 unit tests, 3,745
integration tests, 235 contract tests, both type checks, lint, and build. The real CLI lifecycle suites passed 29
cases. Spawn compensation has 18 real-Git regression cases, including commits arriving before the first checkout
observation, pinned start commits, unchanged cleanup, and owner repair followed by successful retry. CI-only E2E and
portability checks remain part of integration.

Standard review ended by explicit Owner acceptance after eight completed passes. The final corrections received
scoped advisory review and the final rollback fix received a focused check with no actionable findings. The accepted
terminus is recorded in the publication boundary; it is an accepted-risk review conclusion and grants no merge
authority. The work lands as one branch, with archival deferred to a separate post-merge change request.

---
