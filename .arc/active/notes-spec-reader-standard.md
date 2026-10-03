# Notes: Spec Reader Standard

## Contents

- [Authoring and review loci](#authoring-and-review-loci)
- [Extraction source behavior](#extraction-source-behavior)
- [Reference-check boundaries](#reference-check-boundaries)
- [Complete guidance validation](#complete-guidance-validation)
- [Work-unit verification](#work-unit-verification)

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
carry completion evidence. Implementation left Success Criteria for terminal verification. No always-loaded
guidance, configuration, CLI behavior, detector, review method, or interlock was added.

These results establish artifact integrity and the judgments directed by the completed guidance. They do not measure
executing-agent adherence or demonstrate a measured improvement in reliability.

## Work-unit verification

Author self-review found no material issue. The fresh criteria companion found F1, a major timing gap: the low-depth
grounding call preceded the amendment write, and the conditional reread could skip the written delta. The approved
correction in `69d82f772` binds review to the completed writes before the existing commit. Fresh full Pass 2 of 2
returned no findings; the loop converged. These are advisory artifact-validation results, not review-lane evidence.

The existing framework-sync test rejected an isolated project projection with the required Spec-propagation review
invocation removed, then passed after restoration. This current-subject negative control proves detection of missing
projected guidance; it does not prove semantic adherence by an executing agent. Full Markdown lint and all three ARC
audits passed, as did all 98 framework-contract tests. The initial Markdown-only gate excluded code checks and the
full build. Candidate attestation added managed JSON records, widening the path-based gate: TypeScript and shell lint,
source and test type checks, the routine unit/integration suite, and the full build then passed. The routine suite
reported 13,260 tests passed and two skipped; E2E and portability remain required CI checks before merge.

The report binds immutable criterion text by locus and digest; checkbox state and wrapping are excluded from identity.
The reviewed span includes the full work-unit implementation through the correction. The verification-only delta
contains these records, criteria markings, and Candidate ceremony metadata; it changes no guidance contract.

```yaml
criteria-slice: Success Criteria
span:
  diff: 955ea6de33ad939a0949ac1517c2226350b06dba..69d82f772229c56ed87df194be0948abd6851c5e
  reachability: 69d82f772229c56ed87df194be0948abd6851c5e
  boundary-order-deviation: null
criteria:
  - locus: Success Criteria > 1
    criterion-digest: sha256:8767e2beee91a3e54e81119e3fe6c7eff381ac02cb4072acc929593481553ee8
    evidence: >-
      Nine recipe inclusions and exact source/projection equality; all four form-specific prompts and shared
      complete rubric inspected. F1 now binds the written amendment review after bounded writes and before
      existing commits; exact approved change and checks verified.
    state: "[x]"
  - locus: Success Criteria > 2
    criterion-digest: sha256:2b2d689034e053506e5f0a7054f4c10fd0e857c9939aabbd59935d304769ce28
    evidence: >-
      Direct caller declaration and invocation at create-spec finalization, four generation writes,
      destination/retained-source/preview/later-edit extraction points, and both amendment slices. F1 now
      binds the written amendment review after bounded writes and before existing commits; exact approved
      change and checks verified.
    state: "[x]"
  - locus: Success Criteria > 3
    criterion-digest: sha256:be1b45c68ff35533730d0748c409ea292963d977cd27ccc19aaf3c19323cf3a1
    evidence: >-
      Spec-review common checks and selected-scope prelude cover either slice, removals, affected definitions
      and obligations, and exclude unrelated content.
    state: "[x]"
  - locus: Success Criteria > 4
    criterion-digest: sha256:65743648133a5606d79d64cf039fc67e87332316b85bb4ba4bc7b39493849e23
    evidence: >-
      Create-spec reference audit absorbs binding design and decisive rationale, migrates only supplemental
      context, and returns through existing reviews/approvals before retirement.
    state: "[x]"
  - locus: Success Criteria > 5
    criterion-digest: sha256:1e04ad5d8ba67eb5220b7bee9a3f6e0ae2bed6a4c0034ac3ce3767b573c3045f
    evidence: >-
      Spec-review reader-independence check rejects planning ownership and foreign specs as missing meaning;
      replacement must state behavior and prerequisites.
    state: "[x]"
  - locus: Success Criteria > 6
    criterion-digest: sha256:f46a4e110d40c2e07497cb4aef580fe23062a4daf1e6416d0a7f40975be03e24
    evidence: >-
      Spec-review completeness check retains policy and decisive rationale; supplemental task-context remains
      permitted; retirement audit enforces the distinction.
    state: "[x]"
  - locus: Success Criteria > 7
    criterion-digest: sha256:e545755b12572a95aa023dd2d5bd78af6bbb19899edac0517979a72024eb68cb
    evidence: >-
      Spec-review reference boundaries retain symbols, schemas, examples, identifiers, and internal
      references; completeness preserves failure cases, invariants, and acceptance conditions.
    state: "[x]"
  - locus: Success Criteria > 8
    criterion-digest: sha256:96c42a9a05fa4ace2cfee4e14450db31b87fe21da0ef5bc3a40af054b0fe04ff
    evidence: >-
      Spec-review permits tracking/anchors and accessible distinct-author PRD/RFC sets without missing
      thesis/design; inaccessible companion cannot supply authority; template structures preserved.
    state: "[x]"
  - locus: Success Criteria > 9
    criterion-digest: sha256:89d15df884629d6c82357d6111fb9bf31e69e74617429d96ec6da33a09cc1230
    evidence: >-
      Spec-review expected prerequisite contract and availability rule, plus explicit ARC subject-matter
      definition permission.
    state: "[x]"
  - locus: Success Criteria > 10
    criterion-digest: sha256:376743fd887204140acb96c1d10b2b7493e296a89adbd1505ee0ac5e6ec4a882
    evidence: >-
      New copied member sets and all generation writes directly review their required scopes before existing
      boundaries; low-depth amendments explicitly retain both common checks. F1 now binds the written
      amendment review after bounded writes and before existing commits; exact approved change and checks
      verified.
    state: "[x]"
  - locus: Success Criteria > 11
    criterion-digest: sha256:b05fe9577dc7aacd8e87b3608ca926f474c25b73f1dcefc2290303774ef82285
    evidence: >-
      Decompose prospective source and exact CLI retained-preview reviews precede distribution/apply; missing
      definitions cannot come from transferred units/destinations; later unchanged bytes skip repeat review.
    state: "[x]"
  - locus: Success Criteria > 12
    criterion-digest: sha256:8c78e29a122c64ff37f9ca281cd3a48e868867031e7ae00a19b16f49bb694df8
    evidence: >-
      Existing gate callouts, nested source grounding, override body, template header/amendment/paired
      structures preserved; no implementation CLI/validation changes.
    state: "[x]"
  - locus: Success Criteria > 13
    criterion-digest: sha256:977c6d1efd2a4f0ae903491ea391a38b5140909aac8a1649e1dc6826b56bf300
    evidence: >-
      Implementation inventory limited to nine source/projection pairs plus local WU records; no historical
      retrofit, always-loaded changes, checker, config, CLI behavior, method, or interlock added.
    state: "[x]"
  - locus: Success Criteria > 14
    criterion-digest: sha256:1472608bf414fc009eece3aacbd31699618f5ab721c2692f238b09c968f9314e
    evidence: >-
      Notes distinguish artifact integrity and intended judgments from unmeasured executing-agent adherence;
      no claimed measured reliability gain.
    state: "[x]"
  - locus: Success Criteria > 15
    criterion-digest: sha256:1ea4d51faae9eee4e2e26241f5c53a09252e4072cac5af386bf483ae843fc588
    evidence: >-
      Full Markdown lint and three ARC audits passed; all 98 framework-contract tests passed. Generated
      Candidate JSON widened the path-based gate: code and shell lint, both type checks, 13,260 routine tests
      with two skipped, and the full build passed. E2E and portability remain required CI checks before merge.
    state: "[x]"
  - locus: Success Criteria > 16
    criterion-digest: sha256:58db93fe39223454b81347ff1a639f8238086deb7e85ae3c3f70a2bbbc6c04d1
    evidence: >-
      All implementation criteria verified for Candidate preparation, subject to the authorized fresh
      adversarial companion; no merge authorization or hosted review satisfaction claimed. F1 now binds the
      written amendment review after bounded writes and before existing commits; exact approved change and
      checks verified.
    state: "[x]"
summary:
  met: 16
  superseded: 0
  unresolved: 0
adversarial-companion:
  first-pass:
    ordinal: 1
    reviewed-head: 3b2609c3cd5479858e721c47a6f0f98128179e3c
    finding: F1
    reported-severity: major
    verified-severity: major
    disposition: fix
    approval: explicit Owner approval of the fix, atomic commit, and fresh full Pass 2
    response: exact approved correction applied to both workflow copies; required checks passed
    commit: 69d82f772229c56ed87df194be0948abd6851c5e
    signal: non-converged after an approved major fix
  second-pass:
    ordinal: 2
    reviewed-head: 69d82f772229c56ed87df194be0948abd6851c5e
    findings: []
    response: no finding responses required
    stop-reason: converged
  conditional-next-pass: authorized Pass 2 permission consumed once; no further pass authorized
```
