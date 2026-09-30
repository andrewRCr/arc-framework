# Metadata: cli-substrate-complete-migration

| **State**     | **Owner** | **Branch**                                  | **Class** | **Priority** |
| ------------- | --------- | ------------------------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `refactor/cli-substrate-complete-migration` | `Heavy`   | `P2`         |

- **Cohort:** `cli-substrate-adoption`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-cli-substrate-complete-migration.md`
- **Task List:** `tasks-cli-substrate-complete-migration.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:0a5873096bc47f76115e5d48d0d139c7e9e19313f3772ca08811c5969dcd93d9`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 8.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Resume publication at the idempotent push, then resolve or open the change request.

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

Automated CLI calls now apply their subprocess policy consistently, and session status and recovery data use
complete shared validation contracts.

### Added

- The published JSON Schema bundle includes ten complete session-status and release-routing roots.

### Changed

- Always-JSON review and merge-lock commands, along with remaining value-bearing commands, bind Git execution to
  their invocation's subprocess policy.
- Nested base-drift payloads and session-status fields validate through their full schemas while retaining their
  existing wire shapes.

### Fixed

- Framework path construction preserves native filesystem root spelling, including decomposed Unicode names.

## Completion Notes

The surviving CLI consumers now use the six landed kernel, validation, session-envelope, layout, Git-executor and
command-input contracts. Transitional import shims and re-exports are retired; canonical digest schemas and result
types share their kernel authority; complete session roots feed the published schemas; and framework paths resolve
through the layout owner. Reusable test support converges on the scripted Git fake, typed process-error fixtures,
meta builder and schema assertions. The residual matrix records retained rules, external owners and storage-carved
symbols rather than treating the storage program's future rewrites as migration work delivered here.

The effective implementation walk resolved all 35 original criteria at its recorded verification target: 33 met and
two superseded forward by A3's evidence timing. A4 adopts only the two exact decomposition and continuity register
rows, preserving mixed-module survivor ranges. Producer coverage for three filesystem/parser roots runs in the
integration lane as an accepted placement deviation. The historically non-converged adversarial Pass 2 remains
recorded; its approved corrections and scoped follow-up do not claim another fresh whole-target pass.

The local standard-review series covered the complete change set by contract chunks and seams. Its three findings
were corrected: native roots are preserved, canonical digest result annotations remain narrow, and raw failure
fixtures accept byte stderr. The admitted incremental Pass 2 converged clean and its aggregate receipt was accepted.
Full local convergence at the corrected Candidate included the declaration build, both TypeScript programs,
repository lint and contracts, and 13,153 passing routine-lane tests. The twelve local cost samples stayed within the
recorded 10 percent noise band; no causal speedup or regression is established.

Base reconciliation appended current main at `80e169b3f` as `650cf4d26`. Only generated ROADMAP conflicted; the
approved guarded remedy regenerated it, while both code/test overlaps retained the substrate conversions.
Post-merge Markdown, ARC contracts, code and shell lint, both type programs and 839 affected tests passed. The
checkpoint's host-admission-before-repair dead end is separately captured; that workaround supplies no merge
clearance. Public CI, E2E, Linux portability and all six compatible ci-job cost reports remain due under A3 at the
integration gate. Archival follows separately after merge under the manual cadence.

---
