# Metadata: arc-view-refinements

| **State**     | **Owner** | **Branch**                  | **Class** | **Priority** |
| ------------- | --------- | --------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/arc-view-refinements` | `Heavy`   | `P2`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-arc-view-refinements.md`
- **Task List:** `tasks-arc-view-refinements.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 6.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Open the PR

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

`arc view` now follows a work unit's forming artifact lifecycle, can target checkout-local planning and live work by
slug, adds compact source metadata, improves task-opening context, and preserves provable loose-list spacing in Glow
without changing stored Markdown or non-Glow output.

### Added

- `arc view --for <slug>` selects active, planned, and provisional work units for every work-unit-scoped surface,
  with validated slugs and fail-closed errors that never fall back to another context.
- Non-task headers show logical line counts, and the user-scoped `arc.viewClock` setting selects deterministic `24h`
  or `12h` rendered-at timestamps.

### Changed

- Bare `arc view` renders the furthest-present artifact in the `meta → draft → spec → tasks` lifecycle, while
  explicit kinds and `--current` retain their established semantics.
- Task resolution falls back to a conventional task-list companion when the meta pointer is absent or stale, and
  Bat/plain task views preserve a top margin plus first-task phase context.

### Fixed

- Glow restores exactly one display gap at provable loose-list sibling boundaries and preserves ordered numbering,
  while ambiguous boundaries remain compact.

### Infrastructure

- Viewer contracts, formatting, resolution, and render planning now live below command orchestration with filesystem,
  Git, executable-probe, and process effects injected from adapters; compatibility exports remain available.

## Completion Notes

The viewer now resolves explicit active, planned, and provisional targets through checkout-local lifecycle authority,
uses conventional artifact companions without directory enumeration, and selects the furthest-present forming artifact
for bare invocation. Non-task renders carry exact logical line counts and a user-scoped clock format; Bat/plain task
views preserve margin and phase context; Glow receives a conservative transient transformation that restores one row
between provably loose siblings without mutating source or other renderer inputs.

The touched viewer slice was reorganized around neutral `lib` contracts and injected production effects, preserving
the public command export surfaces while restoring the documented dependency direction. The implementation stayed
within the planned boundaries: completed-work-unit viewing, ambient groom-locus provision, last-modified metadata,
live/watch behavior, and the broader CLI substrate remain separate concerns. Two adversarial verification passes and
live rendering of this task list surfaced six valid boundary and compatibility issues; all were resolved with
regression coverage, including exact one-row spacing at nested-task and phase boundaries.

The final scope aligns with the project principles and the documented Commander, command-adapter, injectable-library,
and Vitest architecture without adding a package dependency or infrastructure component. Full local Markdown,
TypeScript, and shell linting, source/test typechecking, the 510-file Vitest suite with 6,454 passing tests and one
expected skip, the real-Glow and live task-list probes, and the production build passed before PR creation. After
append-only base reconciliation, the exact-head hosted suite passed all 12 required checks, including unit,
integration, three end-to-end shards, portability, `ci-ok`, and `merge-ok`.

---
