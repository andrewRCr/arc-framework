# Metadata: state-ref-write-safety

| **State**     | **Owner** | **Branch**                   | **Class** | **Priority** |
| ------------- | --------- | ---------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `fix/state-ref-write-safety` | `Heavy`   | `P2`         |

- **Cohort:** `agile-parallelism`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-state-ref-write-safety.md`
- **Task List:** `tasks-state-ref-write-safety.md`

- **Current Workflow:** integrate-work-unit
- **Last Completed:** PR #147 opened; pre-PR + re-review CodeRabbit findings (12 + 4) all fixed, pushed, CI green
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 4 — triage CodeRabbit's PR review on #147, then Phase 2 (compose + sweep + ship)

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/147>
- **Completed:** [none]

---

## Completion Notes

Closed the same-machine inter-process write races on ARC's identity-scoped state — the single-machine complement
to the already-safe cross-machine path, and a gate for `finalize-parallelism`'s "watertight for concurrent
same-machine worktrees" bar. Four guards landed as designed (D1–D4):

- **D1 — CAS + bounded retry** at the shared `writeTreeCommit` chokepoint, inherited by both the errand ref and
  the sync-state ref. The unconditional `update-ref` became a compare-and-swap against the tip read at the start
  of the read-modify-write; a losing CAS re-reads and rebuilds, bounded by `MAX_RECONCILE_ATTEMPTS` (3) with a
  typed failure on exhaustion.
- **D2 — discriminating reconcile read**: a genuine post-fetch read error aborts the reconcile (typed failure)
  instead of unioning a tree narrowed to this machine's key; a legitimately absent ref still unions; the advisory
  fail-open readers are unchanged.
- **D3 — machine-id exclusive create**: the read→generate→write TOCTOU closed by an `O_EXCL` create of a
  dedicated `.machine-id`; losers read the winner's id. A one-time migration adopts a legacy `.sync-state.json`
  `machineId` (then read-tolerates it), preserving an established identity's marker key.
- **D4 — portable advisory notes lock**: the human-invoked `runUserSave` note-write critical section serialized
  by an exclusive-create lockfile, since `git notes add` cannot take a CAS.

**Deviation from the spec (D4 stale detection).** The spec specified pid-liveness *plus* an mtime-ceiling
backstop; the shipped policy is **liveness-only** — a held lock is broken only when provably abandoned (a dead
pid or a corrupt record), never on age. Age was dropped as a reclaim trigger to avoid evicting a live-but-slow
holder mid-critical-section: a reused pid that merely reads as alive costs a bounded acquire-timeout, a
deliberate fail-safe over risking the collapse of the `git notes add` the lock guards. The spec's mtime-ceiling
Open Question is therefore moot — no ceiling shipped.

**Review-driven hardening (beyond D1–D4).** Five review passes over PR #147 surfaced and closed adjacent
same-machine hazards in the rewritten paths: reconcile-merge reads bound to their CAS/parent snapshot; a
**per-reconcile process-unique incoming tracking ref** on both reconcile paths (closing a concurrent-reconcile
delete-race that could narrow the committed tree); fail-closed reconcile reads on the errand path; settled
partial-write reads on the lock and machine-id files; pid and machine-id shape validation; and errand reconcile
final-push parity with the sync-state loop. One finding (CI action SHA-pinning) was deferred as an out-of-scope
repo-wide policy change and captured to the `ci-cross-platform-hardening` backlog item.

**Verification.** All seven success criteria met. A new `portability` CI matrix job (`ubuntu` / `windows` /
`macos`) runs the concurrency, lock/liveness, and true-race suites — all three legs green on the PR's CI. Full
suite green (3498 passed, 1 skipped), every quality gate passes, and no user-facing or config surface changed,
so no Release Notes entry. The hybrid harness — deterministic interleave plus a bounded true-race e2e smoke —
proves each guard.
