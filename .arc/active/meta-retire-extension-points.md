# Metadata: retire-extension-points

| **State**     | **Owner** | **Branch**                     | **Class** | **Priority** |
| ------------- | --------- | ------------------------------ | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/retire-extension-points` | `Heavy`   | `P2`         |

- **Cohort:** `configuration`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-retire-extension-points.md`
- **Task List:** `tasks-retire-extension-points.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:1dacaf21e3fb737825291921502822c3a59a69903e8cd602d0f4eecc3d16e261`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 6.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Resume publication at the idempotent push, then resolve or open the change request.

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

Inactive lifecycle extension points have been removed from ARC's CLI, installed workflows, and customization model.

### Changed

- Updates retain previously authored extension documents as unmanaged files for review. Their managed README is removed,
  and subsequent updates leave the retained documents untouched.
- Customization guidance describes configuration, checks, method overrides, project content, and native harness hooks.

### Removed

- The `arc extensions` command, extension activation and workflow dispatch, and extension-specific validation.
- The `extensions` status/session/recovery output, `activeExtensions` context input, and `extensionReport` checkpoint
  field. Surviving output contracts and exact-head merge authorization remain enforced.
- Extension files and their directory from every supported fresh-install recipe.

## Completion Notes

The retirement covers runtime composition, typed schemas and discovery, CLI routing, installed content, workflow
instructions, validation, installation membership, and supported guidance. Method coverage, domain rules, project
checks, exact remote-head PR validation, Errand review-target binding, and final merge authorization retain their
independent behavior. The updater's existing retention policy remains unchanged and is covered by legacy-update and
subsequent-update regressions. Recipe-derived membership is 142 files: 103 Framework, 35 Configurable, and four Scaffolded.

ADR-038 preserves all eleven retired event contracts and a full source-retrieval revision. Four prior ADRs received
scoped supersession metadata without body rewrites. Approved amendments preserve unrelated extension meanings and
repair one historical-analysis retrieval link. The contributor session introduction was corrected to preserve its
own freshness route after renumbering. Obsolete implementation-planning notes were removed; no intended scope remains
deferred. The final scope aligns with PROJECT-PRD and TECHNICAL-OVERVIEW.

Pre-publication verification passed all 17 selected local merge checks and selected local E2E feedback. The complete
live corpus sweep, 386 same-file fragment links, historical retrieval checks, rendered content agreement, and all eleven
task-list success criteria have recorded evidence in `tasks-retire-extension-points.md`. The optional fresh criteria
review found no acceptance gap. Local standard review at `8defeef355fdb85852d125278739a08049f809e0` covered 235 changed
paths through six chunks, a dedicated seam, and a fresh aggregate evaluator; its complete clean result was recorded
through the typed review protocol. Frontline was skipped by direction. CI-only E2E and portability checks remain host
admission requirements, and any reconciled head retains its own verification and applicability obligations.

---
