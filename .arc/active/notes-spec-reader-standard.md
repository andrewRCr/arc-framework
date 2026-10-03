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

## Complete guidance validation

All nine authoritative sources are unconditional `init-recipe.json` inclusions and match their project projections
byte-for-byte, including `generate-tasks.template.md` rendered as `generate-tasks.md`. The configurable method's
override body and nested `source-grounding` declaration remain intact. All four writers declare `spec-review`;
direct invocations cover complete new sets, every required correction operation, retained extraction contracts,
and grounding-only amendment review. Existing approval/interlock callouts are unchanged.

The eight representative cases were walked against the completed instructions:

1. **Planning ownership supplies scope or an interface:** rejected by `spec-review.md` § Common reader checks.
   The replacement must state the behavior, required interface, and precondition; a sibling name, register row,
   or foreign specification cannot supply that meaning. All four template prompts retain the required substance.
2. **Notes supply the sole conflict policy:** rejected by the binding-completeness check. Policy and decisive
   rationale stay in the specification; `create-spec.md` § Finalize absorbs missing binding content before draft
   retirement. Supplemental task-context pointers remain usable for otherwise non-binding execution context.
3. **Precise identifiers and provenance removal:** identifiers, schema fields, symbols, examples, and internal
   references remain permitted by § Reference boundaries. The completeness check retains failure cases,
   invariants, preconditions, and acceptance conditions when planning dependence is replaced.
4. **Header tracking and amendment anchors:** permitted for tracking by § Reference boundaries, while the thesis
   and binding delta must stand independently. Template headers, boundary carriers, and amendment locators remain
   unchanged; `amend-design.md` reviews the binding footprint and affected contract at every depth.
5. **Complementary PRD/RFC context:** an accessible pair by distinct product and engineering authors is accepted
   as one set with its existing content division; an unavailable companion supplies no authority. The detailed
   prompts and `create-spec.md` full-set invocation apply this boundary without changing paired-mode scaffolding.
6. **Unshipped prerequisite or ARC subject matter:** an expected prerequisite contract with its availability
   condition is accepted, rather than a claim of shipped behavior. ARC terms and artifacts used as actual subject
   matter remain valid when their required meaning is established or locally defined, under § Reference boundaries.
7. **Destination, task-generation, and low-depth amendment writes:** the shared checks are reached before the
   existing boundaries. `decompose-work-unit.md` § Author every reported destination includes copied member specs;
   `generate-tasks.template.md` invokes review after proportionality, boundary, propagation, and suite-coherence
   writes; `amend-design.md` § Depth and rigor retains both checks in grounding-only calls and post-settle rereads.
8. **Extraction transfers a definition needed by a retained requirement:** rejected by retained-contract review
   before distribution approval and exact-preview review before apply in `decompose-work-unit.md`. Removed units
   and destination specs cannot supply missing retained authority. Later substantive source edits receive scoped
   review before finish release; unchanged bytes and task/pointer-only reconciliation skip repeated spec review.

Markdown lint, the method-trigger/domain-rule/section-reference audits, and the framework-contract test suite passed.
The changed guidance inventory is exactly the nine sources and nine projections; work-unit notes and task records
carry completion evidence. Work-unit Success Criteria remain unchanged for terminal verification. No always-loaded
guidance, configuration, CLI behavior, detector, review method, or interlock was added.

These results establish artifact integrity and the judgments directed by the completed guidance. They do not measure
executing-agent adherence or demonstrate a measured improvement in reliability.
