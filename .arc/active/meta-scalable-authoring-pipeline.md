# Metadata: Scalable Authoring Pipeline

| **State**     | **Owner** | **Branch**                         | **Class** | **Priority** |
| ------------- | --------- | ---------------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/scalable-authoring-pipeline` | `Heavy`   | `P1`         |

- **Cohort:** `principle-anchored-core/agile-wu-lifecycle`
- **Depends On:** `class-model-foundation`

- **Origin:** [internal]
- **Design:** `spec-scalable-authoring-pipeline.md`
- **Task List:** `tasks-scalable-authoring-pipeline.md`

- **Last Completed:** Task 7.1 — Complete verification; Tier 3 gates green, 17/17 success criteria met.
- **Next Task:** [none] — verification complete; WU ready for integration.
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 1 — verify completion

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/67>
- **Completed:** 2026-06-09

---

## Release Notes Entry

ARC planning now scales its drafting, specification, and task-generation ceremony to the work unit's actual
design and implementation-planning demand. Lighter work can use brief or outline specifications and smaller
task-generation passes, while heavier or novel work keeps detailed specifications, explicit design review, and
deeper grounding.

### Added

- Added brief, outline, detailed PRD, and detailed RFC specification templates.
- Added the `draft-design` workflow, `resolve-planning-depth` method, `spec-review` method, and inactive
  `pre-spec-finalization-review` extension.
- Added layered `Design` support for paired PRD/RFC specifications.

### Changed

- Updated `create-spec` and `generate-tasks` so authoring stages resolve planning depth from current evidence
  instead of assuming the heaviest ceremony.
- Updated integration and archival workflows to tolerate lighter artifact shapes, including brief specs,
  one-phase task lists, optional release notes, and layered spec pairs.
- Reframed planning and strategy guidance around scalable specification forms and class-aware authoring.

### Removed

- Removed the former default PRD template path in favor of the four-form specification template family.

### Fixed

- Fixed fresh-install inventory and manifest coverage for the new scalable authoring files.

## Completion Notes

`scalable-authoring-pipeline` realizes the `Class` model across ARC's pre-implementation authoring flow. The
work unit adds the four-form spec template family, extracts `draft-design` as the drafting-stage workflow,
introduces `resolve-planning-depth`, and wires `classify-work-unit` through draft/spec/task generation so each
stage can confirm or ratchet `Class` while selecting the right local depth.

The shipped authoring flow keeps one invariant grammar rather than adding light/heavy forks. `create-spec` now
selects brief, outline, or detailed PRD/RFC forms by derivation demand; `generate-tasks` uses a depth spine over
shared decomposition, fill, and audit procedures; and re-entry valve behavior lives in `resolve-planning-depth`
instead of duplicated per interlock. The workflow family also received a coherence pass so `draft-design`,
`create-spec`, and `generate-tasks` share the same structural vocabulary: resolve depth and `Class`, paths,
passes, finalization, and `Next Step`.

Lifecycle and install surfaces were updated to match the lighter artifacts the authoring pipeline can now
produce. Integration and archival tolerate brief specs, one-phase task lists, absent separate completion docs,
optional Release Notes entries, and layered PRD/RFC pairs. CLI/package support now ships the new templates,
methods, extension, and workflow through the init recipe, manifest, classification logic, validators, and tests.

The main scope deferrals remain deliberate: existing workflow filenames were not renamed or renumbered, and
workflow composition/conductor machinery was left to the sibling/future work already carrying those concerns.
Verification finished with Tier 3 gates green, 17/17 success criteria met, CI green on PR #67, and the
CodeRabbit review cycle resolved.
