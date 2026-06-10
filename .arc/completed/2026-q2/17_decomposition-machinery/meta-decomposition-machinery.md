# Metadata: Decomposition Machinery

| **State**     | **Owner** | **Branch**                     | **Class** | **Priority** |
| ------------- | --------- | ------------------------------ | --------- | ------------ |
| `Shipped`     | `andrew`  | `feat/decomposition-machinery` | `Novel`   | `P1`         |

- **Cohort:** `principle-anchored-core/agile-wu-lifecycle`
- **Depends On:** `class-model-foundation`

- **Origin:** [internal]
- **Design:** `spec-decomposition-machinery.md`
- **Task List:** `tasks-decomposition-machinery.md`

- **Last Completed:** Task 6.1 — Complete verification (line ~455). Tier 3 gates green and all 12 success
  criteria met (SC7 with Deviation note); ready for integration.
- **Next Task:** [none] — verification complete; proceed to integrate-work-unit.
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 1 — verify completion.

---

## Release Notes Entry

ARC can now recognize when a concern is too large for one work unit and turn it into a coordinated cohort of
self-contained work units, with a first-class cohort record and consistency guard.

### Added

- `assess-cohort-fit`, a planning-time method that decides whether a settled design stays one work unit or
  becomes a cohort, using orthogonality, two guard rails, maturity timing, and a cut-map.
- `decompose-work-unit`, a lifecycle workflow for transforming a live work unit into a cohort of backlog member
  stubs without shipping the origin as a code deliverable.
- `template-cohort.md` and the `cohort-{name}.md` record shape: a required Purpose floor, optional coordination
  sections, per-member partitioning, and derived membership.
- A cohort-consistency validator and pre-commit hook coverage for field-to-directory path matching, constitutive
  cohort docs, and orphan per-member sections.

### Changed

- Work organization guidance now defines cohorts, the one-level nesting cap, path-valued `Cohort` semantics, the
  three decomposition arms, and a work-unit sizing standard consumed by `assess-cohort-fit`.
- Design-stage workflows now declare `assess-cohort-fit` beside the existing lower-bound classification method.
- `DEV-RULES.ARC` and `AGENT-BRIEF.ARC` now account for `cohort-*` artifacts and introduce the cohort concept
  on always-loaded surfaces.

### Fixed

- The cohort-consistency invariant is now enforced at commit time for staged backlog cohort artifacts, closing the
  "defined but unenforced" gap for cohort structure.

## Completion Notes

Decomposition Machinery shipped the upper bound of ARC's work-unit model. `classify-work-unit` decides when work
is large enough to deserve a work unit, and `assess-cohort-fit` now decides when a concern is too broad to remain
one. The resulting shape is Model B: a cohort of self-contained, single-branch work units, not one task list split
across stacked PR branches.

The durable model landed across the strategy, brief, rules, method, workflow, template, ADR, hook, and package
mirrors. `strategy-work-organization` now owns cohort taxonomy, one-level nesting, path-valued `Cohort` semantics,
at-cap lateral fan-out with provenance, and the sizing standard the method consumes. `decompose-work-unit` owns the
execution half: consume a cut-map, mint or backfill cohort structure, scaffold member stubs, distribute origin
design under a conservation gate, sweep incoming dependencies, verify cohort consistency, and park the transform.

Implementation also added the structural guard that keeps the cohort model honest. `cohort-consistency.ts` and
`validate-cohort-consistency.ts` enforce the three conditions over staged backlog cohort artifacts, and CHECK 18
wires that guard into both hook copies with unit and integration coverage.

The main intentional deviation is SC7: the final model does not restate the two constitutive rules as standalone
`DEV-RULES.ARC` prose. They live in `AGENT-BRIEF.ARC` for always-loaded orientation and are enforced by the
cohort-consistency invariant; `DEV-RULES.ARC` carries only the `cohort-*` movable-artifact enumeration. Broad
cleanup of older cohort docs remains `doc-cascade-sweep` scope, and merge/rebase discipline for delivering
decomposed stacks remains Concurrent Work Conventions scope.

Verification and integration review are clean: Tier 3 gates passed locally, CI is green on PR #74, local CodeRabbit
review returned no findings, and the one self-review finding (planning IDs in new test labels) was fixed before PR
creation.
