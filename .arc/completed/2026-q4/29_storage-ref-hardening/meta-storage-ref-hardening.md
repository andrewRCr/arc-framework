# Metadata: storage-ref-hardening

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** `state-storage`
- **Depends On:** [none]

- **Origin:** [internal] — routed from `storage-ref-backend`'s review (2026-10-29)
- **Design:** `spec-storage-ref-hardening.md`
- **Task List:** `tasks-storage-ref-hardening.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:5deb409b9c12e6fbfe20c6e49c72d33b6ef4342e7c97699c5d0b1f22251f9ce6`

- **Current Workflow:** [none]
- **Last Completed:** Task 8.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** —

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/1271>
- **Completed:** 2026-11-04

## Release Notes Entry

Ref-backed state operations and imports now retain recoverable failure evidence, report actionable remedies, and
preserve pending work across retries.

### Added

- Explicit repair of competing approval roots, refusing a choice that would exclude performed or settled work.

### Fixed

- Missing-object refusals distinguish unavailable Git objects from malformed metadata and misplaced archive folders.
- Live listings honor owner scope, and pull consumers retain designation questions and history notices.
- Transport failures remain typed when cleanup or local diagnostics also fail, without losing earlier outcomes.
- Prepared ref transactions finish under Git's control; ref-lock refusals identify the lock and its removal remedy.
- Keeper leases avoid waiting under the layout lock during ordinary operations, and history publication retries are bounded.
- Withdrawal preserves independent histories and restores completed records at compatible coordinates.
- Import validation accounts for registered personal files and review sources, retaining publication failures for retry.

## Completion Notes

The ref backend now classifies unavailable objects at its refusal and reporting sites, preserves diagnostic and notice
propagation through pull consumers, and handles transport, transaction, lock, retry, and withdrawal failures through
typed results. The import uses the shipped review mapping and real registered-checkout inventory. Ordinary commands
still use the in-repo backend; this change hardens the ref implementation before the separate cutover.

Forward amendments settle withdrawal conflict placement and operation budgets, conventional Design admission,
approval-root selection, role-compatible restoration, and completed acquisition-failure precedence. The approval
repair adds narrowly scoped selector vocabulary and native response access without replacing the existing Store
result envelopes. A role change may require different completed coordinates. The documented unnamed-blob thin-pack
residual remains, as do the explicitly excluded remote-move and release-only tooling concerns.

All 24 acceptance criteria are met with their original text retained and the recorded contract qualifications. The
qualified implementation is `6343d32b6c`: normal CI `41928095350` passes without retry, including the Windows/macOS
store pair. The forced verification merge gate passes all 19 selected checks, including 23,901 unit cases and 414
selected store suites. Native process comparisons retain the stated withdrawal and successful/no-op pull budgets.
The consolidated actual-CLI trial proposes 332 refs with no refused record and only five accepted informational
notices, accounts for all 3,308 review sources, and leaves copied refs unchanged. The personal-write hold is released.

Three complete working reviews and their approved repair checks precede verification. The last complete review
finds one major and one minor; both repairs converge after two independent fix-check rounds. The Owner-directed stop
accepts the residual whole-change review risk without a fourth complete pass. The public review boundary records
that accepted-risk decision rather than a clean full-pass result. Verification, review, and trial artifacts remain
under `~/dev/arc-evidence/storage-ref-hardening/`.

---
