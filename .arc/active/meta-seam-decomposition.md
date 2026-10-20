# Metadata: Seam Decomposition

| **State**     | **Owner** | **Branch**                | **Class** | **Priority** |
| ------------- | --------- | ------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/seam-decomposition` | `Heavy`   | `P1`         |

- **Cohort:** `state-storage/storage-seam`
- **Depends On:** [none]

- **Origin:** [internal] — the `storage-seam` cut (2026-10-09)
- **Design:** `spec-seam-decomposition.md`
- **Task List:** `tasks-seam-decomposition.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:3d7c3674f462a536316bde7d25ccbc3ef99ae1ac85ecfc5caab77431ae6d6ecd`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 7.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Resume publication at the idempotent push, then resolve or open the change request.

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

Prepare record-based decomposition for repositories using off-branch state, while retaining existing decomposition
behavior until that storage capability is enabled.

### Added

- Publish the version-4 `cut-map` schema alongside the existing decomposition map schema.
- Register decomposition revision and discard modes, with unsupported-mode guidance before off-branch state is enabled.

## Completion Notes

The store-based decomposition path now prepares and applies retirement and extraction cuts in two atomic batches.
The additive batch creates members, copied artifacts, cohort documents, and the stored map; the approved terminal
batch checks content conservation, writes dependency dispositions and retirement lineage or extraction thinning,
and removes the map. Preview authorities bind removing operations to their observations and exact writes. Revision
and discard check protected records and edges before removal and retain edits made to existing destinations.

Shared contract extensions add atomic evidence admission, backend-generated creation receipts, and authenticated
former-name lineage lookup. These retain original member and provider generations through rename, retirement, and
name reuse without scanning unrelated terminal histories. The amended bounded-read criterion permits one preparation
history pass and one atomic admission pass per selected map and member; it supersedes the original once-per-run
history clause while retaining its other read bounds and Git isolation. Existing decomposition remains the in-repo
path, selected by the storage capability, with its later deletion outside this change.

The final forced convergence run passed all 19 selected local merge checks, including unit and integration suites,
contracts, both type checks, lint, build, and package synchronization. The current attestation retains that evidence.
End-to-end retirement, extraction, revision, discard, race, and repair scenarios exercise the reference backend and
scripted checkout boundaries. They do not certify a native ref-backend cut or the projection's future public
write-back handler; provider adoption, conformance, and the representative cutover rehearsal remain required before
activation. CI-only E2E and portability checks remain due on the integration head. Review concluded by Owner acceptance
after the complete local chunked series and the bounded main-reconcile check.

---
