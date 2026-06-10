# Notes: Doc Cascade Sweep

## Contents

- [Concept-Site Scope Map](#concept-site-scope-map)
- [Framework File Copy Mechanics](#framework-file-copy-mechanics)
- [Conductor Draft Realignment](#conductor-draft-realignment)
- [Manual Graduation Reconciliation](#manual-graduation-reconciliation)
- [Archive-Relevant Deviations](#archive-relevant-deviations)

---

## Concept-Site Scope Map

The concept-retirement pass scoped grep coverage to live framework surfaces: workflows, methods, strategies,
briefs, `QUICK-REFERENCE`, templates, skills, extensions, rules, install metadata, and tests. Frozen history and
planning records (`completed/**`, `backlog/**`, `reference/adr/**`, `reference/supplemental/**`, and this WU's own
artifacts) were intentionally excluded from the zero-hit criteria.

The decisive distinction was whether a site framed `incidental/` as a distinct work-unit shape, or used
"incidental" in the ordinary sense of a concern that surfaced during work. Ordinary commit-context and routing
uses remain valid, especially `Context: ... (incidental during <context>)` in the commit-footer method.

Retired surfaces:

- The `manage-incidental-work.md` workflow in both copies. Its model (`incidental/<name>` branches,
  `.arc/active/incidental/` directories, incidental task lists as their own spec, and parent pause/resume) is
  fully superseded by Discovered Work Routing, Errands, `arc-inbox`, housekeep, and backlog graduation.
- The `Incidental` task-list form in task-list formatting and task generation guidance.
- Pause-pointer residue in `deactivate-work-unit` and `template-meta`.
- The `strategy-work-organization` incidental-model section, replaced by the current discovered-work routing
  pointer.

Preserved surfaces:

- Ordinary-English uses of "incidental" in commit discipline, issue routing, and session handoff examples.
- Historical records and backlog drafts that document earlier states of the methodology.

## Framework File Copy Mechanics

The rename cascade had two distinct package/source shapes:

- `create-spec.md` is a plain both-copy workflow file.
- `generate-tasks.template.md` and `process-task-loop.template.md` are package-source templates that render to
  `.arc/system/workflows/arc/generate-tasks.md` and `.arc/system/workflows/arc/process-task-loop.md`.
- `session-init.template.md` is also a template/render pair, but it was not renamed.

This distinction is load-bearing for review: the package source should not contain plain
`generate-tasks.md` or `process-task-loop.md` files. The install recipe points at the `.template.md` files, while
the project instance and manifest path keys use the rendered `.md` names.

The manifest update was intentionally file-scoped. `framework-sync.test.ts` verifies every Framework manifest path
against package source, so stale numbered path keys would fail the suite. Broader manifest hash regeneration remains
owned by the future self-hosting manifest freshness work.

## Conductor Draft Realignment

The `arc-plan-conductor` draft was realigned to the shipped model, not merely stripped of a few stale tokens:

- Retired `atomic` / `quick` / `standard` tier language became `Class` language (`Light`, `Heavy`, `Novel`), with
  atomic preserved only as Work Character.
- `minimum` / `standard` / `expanded` depth modes became `planning depth` (`low`, `medium`, `high`).
- Tier-to-spec-form coupling was replaced by the shipped rule: derivation depth selects spec form and `Class`
  constrains ceremony.
- The quick-tier `## Scope` task-list-header claim was removed; the lightest spec is the separate brief form.

Residual conductor-owned design remains outside this WU: depth-aware navigation, template-family scaling, the
remaining WOR file-class rename, and the deeper `create-spec` body reframe.

## Manual Graduation Reconciliation

The manual graduation that created the cohort surfaced two steps worth checking against
`decomposition-machinery`'s graduation workflow:

- Members inherit cohort-level fields where appropriate.
- Member slugs must read legibly out of context (`class-model-foundation`, not merely `model-foundation`).

Reconciliation found both steps already codified in the shipped decomposition workflow: field inheritance in
`decompose-work-unit` and member-slug naming in `assess-cohort-fit`. The worked example exists as the real PR that
graduated the cohort, so this WU did not add a separate in-repo narrative. That avoids putting ARC-internal WU
history into adopter-facing workflow documentation.

## Archive-Relevant Deviations

- The numbered-workflow-name zero-hit criterion is met for the live two-copy framework surface, config, and tests.
  Historical records, supplemental analysis, backlog drafts, and this WU's own artifacts intentionally retain older
  filenames where they document earlier state.
- `cohort-agile-wu-lifecycle.md` is conceptually conformant, but the current backlog-scoped validator sees its
  graduated members as orphaned. That lifecycle-gap was captured to `operational-state-docs`; this WU did not patch
  around it.
- `draft-design.md`'s commit template now emits `Context: draft-{name}.md (planning)`. The separate
  `graduate-work-unit.md` `(graduation)` parenthetical is routed to `rules-restructure`, which owns the
  commit-footer vocabulary and hook acceptance list.
