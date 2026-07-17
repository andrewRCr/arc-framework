# Metadata: husk-lifecycle-drivers

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-husk-lifecycle-drivers.md`
- **Task List:** `tasks-husk-lifecycle-drivers.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 7.1 — verification complete; 13 of 13 success criteria met
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/279>
- **Completed:** 2026-07-16

## Release Notes Entry

ARC now preserves a live linked session when authorized abandon, park-at-Planning, or decompose cleanup retires its
worktree. Each transition leaves a self-describing, replayable husk and reaps refs only when exact committed evidence
and current projection checks authorize the operation.

### Added

- A versioned retirement authority with canonical receipts, exact transition proofs, and fail-closed authorization
  for non-shipped lifecycle cleanup.
- `arc park <name> --land <commit>` for exact partial-protection planning transitions and
  `arc teardown --husk <absolute-path>` for unambiguous detached-husk replay.
- Linked-session cleanup awareness for the current husk, sibling husks, and orphan refs without network access or
  persistent reminder state.

### Changed

- Linked abandon, park-at-Planning, and retirement-shaped decompose now preserve the invoking terminal as a detached
  husk instead of requiring its live worktree to be removed.
- Decompose retirement uses a durable version-2 allocation and finalization contract that accounts for every source
  content unit and dependency edge before the origin can retire.
- Directional teardown prepares evidence before detach, revalidates immediately before mutation, and applies remote
  leases before compare-and-set local ref cleanup.

### Fixed

- Interrupted cleanup retains exact replay evidence and completed remote outcomes instead of reconstructing authority
  from mutable lifecycle state.
- Same-subject husks, restarted work units, changed refs, malformed evidence, and unconserved projections no longer
  permit ambiguous or stale cleanup.

### Security

- Branch names, receipt identifiers, record paths, artifact paths, and ref outcomes are validated at their trust
  boundaries; destructive cleanup fails closed when evidence, transport, or compare-and-set checks are incomplete.

## Completion Notes

Implemented a teardown-specific retirement authority and three non-shipped lifecycle drivers around exact committed
evidence. Canonical digests, receipt records, relation validation, versioned snapshots, and result projections now
bind authorization to one subject, branch, worktree, commit, artifact transition, and remote disposition. The
teardown orchestrator consumes that narrow port, prepares a forward-compatible stamp before detach, revalidates at
the last safe moment, and performs remote and local ref cleanup directionally with explicit lease operands.

Abandon and park-at-Planning now record their terminal transitions directly, with partial protection gaining an
exact base-landing arm. Retirement-shaped decompose became a durable two-stage transaction: a version-2 cut map
accounts for every authored content unit and dependency edge, preparation persists the approved allocation, and
finalization revalidates the conserved result before retirement. This replaced the earlier scratch-map assumptions
without adding a lifecycle state, storage mode, notes mechanism, or park-at-Active behavior.

Husk replay now resolves exact receipt or shipped evidence, distinguishes retained and deleted remote projections,
supports path-qualified selection for repeated subjects, and refuses moved, restarted, ambiguous, malformed, or
unconserved state. Session initialization exposes the current husk and network-free sibling cleanup residue from
linked worktrees while preserving existing primary behavior, identity boundaries, and offer-only cleanup.

Verification passed Markdown, TypeScript, and shell linting; source and test typechecking; build; package/project
sync; focused real-Git and CLI scenarios; and the full suite with 476 test files and 6,110 tests passing, plus one
intentional skip in each count. Review-driven corrections tightened projection identity, transaction boundaries,
path validation, evidence bytes, Markdown allocation semantics, and failure-path mocks. GitHub CI passed all
required checks on the final reviewed head. Alignment against PROJECT-PRD and TECHNICAL-OVERVIEW found no conflict:
the result strengthens typed lifecycle tooling, injected library boundaries, cross-platform Git behavior, and
judgment-preserving cleanup gates without expanding ARC into application generation or autonomous cleanup.

---
