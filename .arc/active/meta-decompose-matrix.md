# Metadata: decompose-matrix

| **State**     | **Owner** | **Branch**              | **Class** | **Priority** |
| ------------- | --------- | ----------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/decompose-matrix` | `Heavy`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-decompose-matrix.md`
- **Task List:** `tasks-decompose-matrix.md`

- **Current Workflow:** [none]
- **Last Completed:** Phase 7 — verification (Tier 3 gates green; 12/12 success criteria met)
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** open the PR

- **PR URL:** [none]
- **Completed:** [none]

---

## Release Notes Entry

`arc decompose` becomes a real command. Splitting one work unit into a cohort of members is now a structured,
validated operation across the full matrix of transform shapes and parent positions — the deterministic
mechanics (scaffold, retire, re-point, regenerate) run in the CLI while the cut-map judgment stays in the
workflow.

### Added

- `arc decompose <origin> --cut-map <file>` — split a work unit into a cohort of members from a structured,
  validated cut-map file: batch-scaffold N members, retire the origin, re-point dependency edges onto the
  delivering members, and regenerate the readiness view.
- `arc teardown --force` — branch + worktree cleanup for a retired or parked origin whose branch is unmerged by
  construction (the caller asserts the work is conserved), alongside the default merged-safe path.

### Changed

- Decomposition covers all four transform shapes — whole-split, partial extraction, backlog-stub source, and
  mixed-destination — across the three parent positions, each with a named, reachable path; the conservation gate
  now holds under partial extraction and edit-in-place destinations.
- Extraction mid-implementation is first-class: the origin stays active and only not-yet-built scope is extracted.
  A full split of an in-progress work unit is documented as a manual procedure rather than an automated transform.
- A started origin's branch + worktree teardown — for both `decompose` and a planning-stage `park` — runs
  after the change merges, via `arc teardown`, instead of mid-transform.

### Fixed

- An in-verb teardown that could refuse on its own staged tree, target the un-removable primary worktree, or
  leave the shell in a deleted directory — moved out-of-band, where it runs correctly.

## Completion Notes

Modeled `decompose` as the full `{parent-position} × {transform-shape}` matrix it always was, and brought it to
parity with the migrated sibling lifecycle verbs: the last markdown-orchestrated lifecycle holdout now has a CLI
executor carrying its deterministic mechanics, with the cut-map judgment kept in the rewritten workflow.

**Shipped.** `runDecompose` is a fan-out executor over the transition primitives (not a single transition edge):
it batch-scaffolds N members under the resolved cohort with fields set from the cut and the origin (`Depends On`
distributed by actual need, never blanket-inherited), retires the origin through its position-appropriate reserved
edge, sweeps every incoming dependency edge off the retired origin onto the delivering members (scanning the index
directly, so it catches dependents the cut-map never named), and regenerates the readiness view on every shape.
The cut-map reaches the command as a structured file parsed by a single co-located boundary validator — versioned
and hand-rolled, shaped so a later schema-library swap is a drop-in. The conservation gate generalized to hold
under partial extraction and edit-in-place homes; the cut-map gains surviving-origin and existing-home entry
kinds; the workflow was rewritten to carry the judgment and call the executor, with the full-split-from-Active
escape hatch documented as recognized-and-routed guidance rather than a blessed transform.

**Key deviation (Phase 4.R).** The shipped `decompose@planning` edge tore the origin's branch + worktree down
*in-verb*, before the transform committed — broken for a started origin three ways (it refused on its own staged
tree, targeted the un-removable primary under in-place, and stranded the process locus), and hidden because the
tests drove the verb cores with cross-worktree inputs the CLI never generates. The fix moves teardown out-of-band:
`decompose@planning` drops its branch/worktree legs (keeping `artifacts: remove`), and the teardown runs
post-merge through a generalized `arc teardown` force mode whose gate and delete strategy invert for the
unmerged-by-construction retired origin. The identical defect on the planning-stage `park` edge was corrected onto
the same surface as a deliberate consistency fold-in; the `abandon` family adopting that surface is a captured
follow-up, not folded here. A new E2E tier drives the destructive verbs through the real CLI seam in both
worktree models — the coverage that would have caught the original defect.

**Verification + review.** Tier 3 gates green; all success criteria met, the teardown-ordering criterion via the
out-of-band correction above. Review hardened the force path (a failed local force-delete now rejects rather than
misreporting a torn-down branch that survived), added internal-edge member-slug validation at the parse boundary,
and tightened the deferral E2E tests to assert worktree persistence — each with a regression test.

---
