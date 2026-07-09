# Metadata: user-notes-retention

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-user-notes-retention.md`
- **Task List:** `tasks-user-notes-retention.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 5.1 - Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/211>
- **Completed:** 2026-07-08

---

## Release Notes Entry

ARC's portable user-state layer is now hardened for concurrent worktrees and cross-machine siblings. User-notes
sync converges without re-exporting unchanged notes, saves no longer infer deletions for entries disk never
materialized, and accumulated notes history can be compacted to a snapshot baseline that lagging clones can adopt
without resurrecting pruned notes.

### Added

- `arc user compact`, with human and JSON output, creates a retained-notes snapshot, publishes a backup ref,
  records a cumulative prune manifest, prunes expired backups, and publishes a sync-state generation marker.
- `arc user status` and session-init now surface a once-per-day compaction advisory when notes history crosses
  the internal threshold.
- The user-notes concurrency strategy documents each shared-state mutator's lock, CAS, or lock-free discipline.

### Changed

- Branch-bounded paired pushes adopt pushed supersets, skip byte-identical remote notes, and push the planned
  notes tip rather than a mutable ref name.
- User-note save/load state now records a repo-shared materialized baseline, so tombstones are synthesized only
  from entries that were actually materialized to disk.
- Fetch, pull, reconcile, rollback, temp-ref, and sync-state writes now use explicit locks, expected-old ref
  moves, unique temp refs, or versioned local-state updates according to their shared-state role.

### Fixed

- `arc sync` no longer reports success when a second notes re-push race leaves user notes diverged.
- `arc user fetch` and `arc user pull` refuse local-ahead or diverged refs with typed outcomes instead of
  force-resetting local notes.
- Status reads no longer clear recovery markers or recommend destructive saves for ref-only notes advances.
- Retired-work-unit retention now uses archive completion dates and preserves local per-WU subdirs that still
  exist on the machine.

## Completion Notes

user-notes-retention shipped the coherence, concurrency, and retention path described in the spec. The first
step stopped the live growth driver: branch-bounded notes export now skips unchanged blobs, adopts pushed tips
that preserve every local note pair, pushes the planned tip instead of the mutable source ref, and reports typed
reconcile outcomes. Live validation showed steady-state `arc sync -y --json` returning notes `noop`, with the
remote notes ref unchanged across the measured run.

The concurrency sweep established a written discipline for every shared user-notes mutator and then enforced it
in code. Notes reconcile now holds the per-identity lock across the critical fetch/merge/scan/rollback decision,
rollback and fetch/pull use expected-old ref moves, stale-lock breaks serialize through a break-lock, temp refs
carry per-call tokens, and local `.sync-state.json` writes use a locked version check/retry path. Deterministic
multi-clone and interleaving tests cover the original save/push/reconcile races without sleep-based timing.

The save/status work replaced ref-history inference with a materialized-baseline stamp in the repo-shared user
internal store. Saves synthesize tombstones only against the entry set that disk actually materialized; loads
write identity-global files atomically while holding the notes lock; and status now separates worktree-local and
shared-disk truth without mutating recovery state. The standing operational guards in WORKING-MEMORY were
retired after these invariants and the live convergence checks were in place.

Retention and compaction landed as a manual `arc user compact` command backed by a cumulative in-band prune
manifest, backup refs, a compaction-aware sibling adopt path, generation-marker publication, and status/session
init advisories. Review iteration tightened the retention inputs so completed-meta archive dates, not note
timestamps, drive retired-WU pruning, and local per-WU subdirs block pruning as still in flight. A live compaction
published generation 1, retained 300 notes, pruned 609, backed up the pre-compaction ref, and collapsed local and
origin notes history to one commit; a backup-ref audit against the corrected policy found no wrongly-pruned
retained pairs.

Verification completed with markdown lint, TypeScript lint, shell lint, source and test typecheck, build, and
the full Vitest suite passing locally before PR review. Review-driven follow-ups kept focused tests green and CI
is green on PR #211, with zero unresolved review threads after the final CodeRabbit disposition.
