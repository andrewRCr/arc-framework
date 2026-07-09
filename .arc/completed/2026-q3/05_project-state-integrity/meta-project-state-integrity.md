# Metadata: Project State Integrity

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-project-state-integrity.md`
- **Task List:** `tasks-project-state-integrity.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 7.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/213>
- **Completed:** 2026-07-09

---

## Release Notes Entry

ARC's project status and in-flight state layer now derives work-unit truth from meta content and lifecycle
records instead of branch-name assumptions or hand-maintained roadmap state. Project status can be rendered live
with `arc status --project`, tracked `ROADMAP` renders are reproducible regeneration outputs, and degraded or
ambiguous state now surfaces as warnings rather than silently becoming false facts.

### Added

- `arc status --project` renders a live project-status view from the project record set and in-flight oracle,
  with `--local` / `--no-fetch` support for local-ref-only operation.
- The in-flight oracle now reads WU identity from meta files at refs, includes local worktree branches, dedupes
  stale or shadowed candidates, marks parked and degraded entries, and emits structured warnings.
- `ROADMAP` regeneration now exact-compares staged content against a deterministic re-render and rejects hand
  divergence or conflict markers through the pre-commit hook.

### Changed

- Tracked `ROADMAP` content is treated as a regenerated project-status snapshot over tree files plus local refs,
  stamped with its source scope and a pointer to the live `arc status --project` view.
- Project dependency satisfaction now resolves through lifecycle classification, so shipped work satisfies,
  pending or parked work blocks, and unresolved dependency targets warn instead of reading as satisfied.
- Materialize, status, session-init, active, errand-check, and foreign-write surfaces consume the same in-flight
  oracle and propagate its warning/degradation model.

### Fixed

- Stale planning refs no longer mint phantom remote-only work units when the real branch has been renamed or is
  only present in a local worktree.
- Stale same-branch upstream refs no longer keep a work unit in flight after the checked-out branch has removed
  its active meta during archive or similar lifecycle windows.
- Unpushed in-flight worktree branches are visible to status and overlap detection.
- The foreign-write advisory no longer reports a work unit's own stale duplicate ref as a foreign overlap.
- Parked work units render and filter as parked rather than appearing in flight or materializable.

### Infrastructure

- Added fixture-backed churn and stale-ref integration coverage for ref/worktree reshuffles, overlap
  self-exclusion, project-status rendering, and ROADMAP regeneration assertions.

## Completion Notes

project-state-integrity shipped the state-integrity layer needed before the remaining parallelism work can rely
on ARC's own project-status surfaces. The branch-to-WU assumption was replaced by content-derived identity:
`deriveInFlight` now enumerates active meta files at refs, reads lifecycle state from those records, unions remote
refs with local worktree branches, dedupes candidate refs per WU, and preserves stale or ambiguous candidates as
provenance plus warnings. Errand records remain the source of errand identity, while parked-WU classification is
threaded in as a scheduling overlay resolved through the lifecycle classifier.

The mutation-window discipline landed across both the roster and the foreign-write advisory path. The oracle now
double-reads mutable local refs and worktree state, retries meta reads before degrading, and marks indeterminate
inputs instead of asserting confidently over mid-transition state. The overlap detector excludes self by WU
identity, uses pinned SHAs for committed probes, double-reads sibling worktree status probes, and reports caveats
for indeterminate or skipped entries. The original stale-`plan/` plus renamed local-branch failure mode is now
captured by temp-repo fixtures.

The project-status composer moved to an injected record model. `composeProjectReadinessView` renders from a
resolved slug-keyed record set; dependency satisfaction resolves through lifecycle classification rather than
pending-set absence; and readiness enters through a provider socket with the current deps-only behavior behind
it. `arc status --project` exposes the live network-verified view, while tracked `ROADMAP` regeneration renders a
checkout-deterministic tree-plus-local-refs snapshot with a shared render stamp.

Regenerate-wins enforcement shipped through the pre-commit hook. When `ROADMAP` is staged, the hook re-renders
from the index-backed source set, rejects conflict markers or determinate mismatches, and warns rather than
blocks on an indeterminate snapshot. Lifecycle and start-ceremony regeneration share the same renderer, and
workflow/source guidance now routes current project-state discovery to `arc status --project` rather than reading
`ROADMAP` back as data.

Verification completed with markdown lint, TypeScript lint, shell lint, source and test typecheck, build, and
the full Vitest suite passing locally before integration. Review iteration fixed status warning propagation,
oracle pruning order, project-status errand classification, a discovery-disabled warning drop, and several small
test/documentation cleanups. Performance and helper-extraction follow-ups from review were captured for
roadmap-tooling rather than widening this PR. Archive-time verification also found and fixed a stale upstream
same-branch shadow case: a checked-out branch that had removed its active meta now suppresses its old
remote-tracking twin, so the archived WU drops out of the tracked project-status render before merge. CI is green
on PR #213, CodeRabbit's final incremental pass produced no new actionable findings, and all review threads are
resolved.
