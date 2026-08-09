# Metadata: proportionality-floor

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Light`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-proportionality-floor.md`
- **Task List:** `tasks-proportionality-floor.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Task 4.1 — verification complete; 9/9 success criteria met, Tier 3 green
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/480>
- **Completed:** 2026-08-08

---

## Release Notes Entry

ARC now applies a compact proportionality check beyond planning: implementation choices and proposed review fixes
must earn their machinery against an actual goal, constraint, trust boundary, or observed failure. A work unit's
explicit scope boundary now travels from its draft through every specification form and into local review context,
with visible amendments when that boundary changes after activation.

### Added

- A universal proportionality rule pairs lighter handling for low-consequence paths with explicit safeguards
  against under-delivery, and separates the smallest complete response from any proposed scope expansion.
- Every shipped specification form states when its scope boundary freezes and how later expansions or contractions
  are recorded.

### Changed

- New drafts ask what adjacent work will not be done, and why, instead of asking for an estimate no downstream
  workflow consumes.
- Drafting and specification workflows preserve and sharpen the boundary across every planning-depth path and retain
  its amendment carrier when emitting the final specification.
- Frontline and standard local review context includes the governing specification boundary and requires remedies
  that cross it to identify and justify the crossing.

## Completion Notes

Delivered the proportionality floor and the complete scope-boundary carrier chain described by the specification.
The always-loaded rule retains all nine load-bearing clauses and keeps each restraining clause beside its
counterweight, so proportionality cannot be read as permission to omit required callsites, migrations, or tests.
Draft and specification templates, both authoring workflows, and local reviewer context now carry one consistent
boundary contract across every supported form and planning-depth path.

Scope held throughout implementation. No rubric, hosted-review, CLI, task-generation, migration, or counting
mechanism entered the change. The optional phrasing-consolidation sweep yielded no removal because the adjacent
rules govern distinct concerns; that zero-yield result preserves their force rather than manufacturing a token
saving. Framework-classified files remain byte-identical across the package source and project instance, while the
two configurable files received equivalent targeted edits without erasing their existing project differences.

Integration review intentionally used one complete local Codex pass over the exact pull-request change set instead
of the frontline and hosted lanes, which were set aside for this documentation-heavy change. The merge lock and
final exact-head authorization remain in force. The independent pass reported no material findings after checking
the rule's counterweights, carrier reach, reviewer scoping, and two-copy contracts.

Verified evidence includes the work-unit Tier 3 run (Markdown and ARC contract lint, TypeScript and shell lint,
both typechecks, 9,607 passing tests with one skipped, and the build), followed after the mainline reconciliation by
targeted lint, both typechecks, 1,546 unit tests, and 64 framework-contract tests. The reconciled session-init probe
also exercised the newly shipped read-only remote-evidence path from this linked worktree and returned exact
evidence without elevated Git access.
