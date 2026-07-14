# Metadata: notes-export-replay-ordering

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-notes-export-replay-ordering.md`
- **Task List:** `tasks-notes-export-replay-ordering.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 6.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/232>
- **Completed:** 2026-07-13

## Release Notes Entry

User notes now publish their captured canonical history only after ARC proves that every newly introduced
annotation belongs to a commit reachable from a live origin branch. Unsafe or unverifiable histories defer without
reconstructing notes, refreshing old authorship events, or reviving deleted state.

**Changed**

- Paired sync and standalone non-force notes pushes share one proof-gated canonical-tip publication path; ordinary
  same-lineage standalone divergence preserves both histories and then re-runs the proof.
- Status and sync guidance identify when explicit reconciliation or publication proof is required.

**Fixed**

- Prevent branch-bounded notes export from replaying unpublished sibling annotations and making stale user state
  newer than its tombstone.
- Refuse incomplete live-head evidence and incompatible compaction lineage before unsafe canonical mutation.
- Allow bounded canonical-history reads up to 64 MiB so large valid notes histories can be verified in production.

## Completion Notes

Routine notes publication now preserves the exact captured canonical tip or defers. The shared planner validates
remote ancestry and compaction lineage, derives every annotated commit introduced by the local-exclusive history,
and proves that set against complete live origin-head membership using locally available commit objects. The paired
path retains its successful worktree push and partial-push marker on refusal; the standalone non-force path cannot
bypass the same proof. Explicit force remains the operator escape hatch, and released join commits remain readable,
but new publication no longer reconstructs notes or adopts entries through fresh authorship events.

Verification exposed and fixed a production-only 1 MiB Git stdout ceiling while reading the current canonical
history; the Git adapter now applies a bounded 64 MiB limit with regression coverage. The final suite passed 419
test files and 5,190 tests (one file and one test skipped), plus TypeScript checks, lint, build, portability, and
integration/E2E CI. An independent full-diff review was clean, and review follow-up additionally made incomplete
remote membership fail closed, guarded force-push behavior when no local notes ref exists, and preserved
saved-locally guidance on deferred sync.

The frozen-history audit found 354 current annotations: 350 are reachable from live origin heads, while four
previously documented burn-in fixtures remain intentionally unreachable. Those fixtures predate this change and
already exist in the remote canonical history, so they do not block proof-gated publication; their cleanup remains
with the burn-in fixture owner.

---
