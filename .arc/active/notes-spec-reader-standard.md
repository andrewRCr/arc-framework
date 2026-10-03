# Notes: Spec Reader Standard

## Authoring and review loci

- `packages/arc-framework/arc/system/methods/spec-review.md` carries the review contract and coherence/grounding
  slices. Its method declaration reaches `source-grounding`; callers declare only their own direct consumers.
- `packages/arc-framework/arc/system/workflows/arc/create-spec.md` has the saved-spec self-review and the reference
  content audit before draft retirement. The latter distinguishes retained reference material from disposable
  exploration content.
- `packages/arc-framework/arc/system/workflows/arc/generate-tasks.template.md` writes spec corrections after
  proportionality findings, records boundary decisions in draft or spec prose, propagates corrected spec-level
  assumptions, and edits only on drift during final suite coherence. Its projection is the project's
  `generate-tasks.md`.
- `packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md` authors reported
  destinations before distributed-result approval, then handles the surviving extraction source at finish.
- `packages/arc-framework/arc/system/workflows/arc/supplemental/amend-design.md` invokes grounding at every depth;
  medium/high paths add coherence. Preserve the assurance rubric and post-settle footprint reread.
- `strategy-work-organization.md` § Validation contract ties task-list coverage to the form's enumerable substrate
  and implementation validation to Success Criteria. `strategy-work-planning.md` § Layered Specs defines the
  distinct-author PRD/RFC exception.

## Extraction source behavior

`memberProfileArtifacts` and `scaffoldMemberProfile` in
`packages/arc-framework/src/lib/work-unit/decompose-v3-repository-plan.ts` select and copy source specifications
for new single/paired members. Spec profiles continue directly at task generation rather than at spec creation.

`scanV3DecomposeContent` in `packages/arc-framework/src/lib/work-unit/decompose-content.ts` inventories
heading-bounded units. `planV3ExtractionSourceThinning` in
`packages/arc-framework/src/lib/work-unit/decompose-v3-thinning.ts` concatenates units allocated `retained-origin`
and removes the other units. Its checks establish source allocation and byte integrity, not semantic completeness.

`composeFinishPreview` in `packages/arc-framework/src/lib/work-unit/git-decompose-v3-finish.ts` emits reported source
paths with retained `contentBase64` or absence and binds them to `applyAuthority`.
`finishGitV3ExtractionOperation` previews or applies that thinning. The finish arm of `handleDecompose` in
`packages/arc-framework/src/handlers/lifecycle.ts` serializes the schema-validated result. The workflow's finish
preview precedes destructive apply; successful apply leaves the exact source thinning staged before the finish
release and required owner reconciliation.

## Reference-check boundaries

The `meta_project_refs` pipeline in `packages/arc-framework/arc/system/.internal/githooks/pre-commit` excludes
`.arc/`, package ARC content, and Markdown. Its code-reference rules reject identifiers and citations that are
useful in specifications. It is not an existing semantic specification check to compose with, and a token scan
cannot prove reader independence or binding completeness.
