# Metadata: session-locus-operability-hardening

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-session-locus-operability-hardening.md`
- **Task List:** `tasks-session-locus-operability-hardening.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Task 5.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/470>
- **Completed:** 2026-08-06

## Release Notes Entry

ARC now derives each registered checkout's session role from its ownership marker, work-unit lifecycle, transient
identity, and Git topology. Healthy sessions no longer depend on machine-local locus records, process leases, or
sibling-checkout liveness, while destructive operations retain exact subject, generation, and repository guards.

### Changed

- Session initialization, handoff, recovery, work-unit lifecycle operations, and transient departure now consume one
  checkout-derived frame with explicit degraded outcomes.
- Foreign transient terminal actions require confirmation bound to the exact current subject generation; local exits
  remain self-authorizing when their retained authority checks pass.

### Removed

- Durable locus records, process-anchored session leases, reconciliation state, and the `locus attach`, `release`, and
  `resolve` mutation commands.

### Fixed

- Stale, malformed, retired, or unreadable sibling-checkout state can no longer block an otherwise healthy checkout's
  entry, handoff, recovery, or exit.
- Sandboxed sessions no longer infer repository-wide occupancy from process visibility they cannot establish.

### Security

- Rename, teardown, transient settlement, promotion, and cleanup preserve their marker, identity, ancestry, lifecycle,
  exact-HEAD, and generation checks without treating branch shape or process inspection as role authority.

## Completion Notes

Replaced the persisted repository-wide locus state machine with a read-time role projection over the authorities ARC
already maintains. Registered worktree topology, ownership markers, work-unit metadata and completed-index evidence,
transient identity refs, and Git facts now produce typed active, parked, retired, transient, partial-Errand,
free-primary, unmanaged, and unresolved outcomes. Role authority excludes branch naming and `HEAD`; those facts only
corroborate an already-derived subject or degrade it non-destructively.

Session initialization and recovery now share the same current-checkout frame, including warm-parent return and an
explicit fallback to the configured base when that parent is gone. Errand open, materialize, link, leave, close,
abandon, partial settlement, and promotion use verb-owned result and confirmation contracts. Rename and teardown
serialize physical worktree mutations under one advisory mutex while preserving their independent destructive
authority checks. Stale-worktree and orphan-branch cleanup remain offer-only and confirmation-gated without a
lease-derived occupancy veto.

The cutover removed the record store, leases, record locks, process anchors, liveness inspectors, reconciliation-only
paths, obsolete commands and options, stale workflow doctrine, and dead schema fields. It also retired
`claimed-sweep-verbs` and `locus-generation-binding`; identity-conflict recovery remains provisional and evidence
gated, while recovery hardening and advisory aggregation remain separate concerns on the smaller surviving surface.

Delivery used an independently green dormant foundation followed by the complete behavioral cutover and retirement.
Final verification passed Markdown and ARC contracts, TypeScript and shell linting, both typechecks, the production
build, and 9,298 tests with one intentional skip. The reconciled exact head also passed the complete GitHub-hosted CI
matrix and lane attestation. Project-PRD and technical-overview alignment checks found no conflict: the result removes
redundant operational state inside the documented CLI architecture while retaining explicit human authorization for
destructive foreign actions and final integration.

---
