# Metadata: user-save-status-divergence

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P2`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-user-save-status-divergence.md`
- **Task List:** `tasks-user-save-status-divergence.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 5.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/157>
- **Completed:** 2026-07-01

---

## Release Notes Entry

ARC's portable user-state reads now resolve saved notes by commit ancestry rather than git-notes write recency.
Status, session-init freshness, and per-work-unit loads agree on the saved commit after cross-machine pulls or
older note re-anchors, while off-branch local saves still surface explicitly instead of becoming hidden drift.

### Changed

- `arc user status`, session-init freshness, and per-WU `arc user load` now share causally-latest reachable
  saved-note resolution, with deterministic handling of concurrent notes.
- `arc user load` records either a real saved commit or a defined sentinel for cross-WU-only loads, never a
  notes-ref history commit.

### Removed

- The obsolete `--max-walk` user-note search cap and `walk-exhausted` load outcome are gone; reachable saved notes
  are no longer hidden by a distance cap.

### Fixed

- Fresh saves no longer report as stale, mixed, or behind when a later note write lands on an older commit.
- Cross-WU-only loads no longer write a fake source basis that can cause follow-up status checks to report
  spurious mixed drift.

## Completion Notes

user-save-status-divergence shipped the causally-latest saved-note resolver for ARC's portable user-state layer.
The central change replaces notes-ref write-recency selection with an ancestry-based candidate flow: enumerate the
annotated note commits, filter to commits reachable from HEAD, reduce to causally-maximal commits, and use the
local sync-state pointer only to break genuine concurrent ties or to corroborate this machine's off-ancestry save.
Status, session-init freshness, disk-vs-note inspection, push recovery, and per-WU load now all project that single
resolution result instead of carrying separate selection logic.

The load path also received the secondary-source fix the new resolver made more visible. When a per-WU note is not
resolved but the cross-WU flat-file merge still materializes shared context, `arc user load` records a defined
`no-comparable-saved-commit` sentinel rather than a notes-ref history commit. The status inspector now treats that
sentinel as a stale or missing comparable basis instead of feeding it into git ancestry checks, avoiding the
spurious `mixed` status that motivated the D10 follow-through.

Implementation landed in a few focused pieces: git ancestry helpers for reachability and independent-set
reduction, notes-ref helpers keyed by annotated commits, the pointer-refined resolver, projection updates across
status/freshness/disk/load/push-recovery surfaces, retirement of the legacy walk cap and `walk-exhausted` outcome,
and integration tests covering the original save-then-older-note reproduction plus capless and cross-WU-only load
cases.

Review iteration tightened the empty-load and cross-WU merge edge, accepted 64-character object IDs for SHA-256
repositories, refreshed stale comments around the old notes-ref walk, and parallelized per-candidate scoped note
reads. The remaining adaptive reachability-filtering idea was captured for later performance work with the
user-notes-retention / architecture-remediation planning stream rather than expanding this correctness PR.

Verification covered focused unit and integration suites during review, then the full local gate set before
integration: markdown lint, TypeScript lint, shell lint, source and test typecheck, full Vitest suite, and build
all passed. PR #157 has no unresolved review threads, CodeRabbit review disposition is posted, and CI is green on
the final pushed review-response head.
