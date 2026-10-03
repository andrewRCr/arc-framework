# Spec (`outline`): Spec Reader Standard

- **Origin:** [internal]

- **Purpose:** Make specifications understandable without planning history while preserving every binding
  obligation and settled design decision needed for task generation, implementation, and verification.

---

## Problem / Context

A specification that supplies scope through another planned change's ownership, borrows undefined concepts from
unshipped plans, or directs the reader to drafts and notes requires context that may be unavailable or obsolete.
The executing session and reviewer both need to understand the change from the specification and its permitted
references.

Reader independence must preserve the specification's binding role. Removing a planning reference must retain
the requirement, decision, or definition it supplied, so tasks cover the complete design and verification can
distinguish correct behavior from incorrect behavior.

## Decision(s)

### 1. Keep the binding design in the specification

The substantive specification states desired behavior, settled design, scope, and observable success conditions
in project vocabulary. Work-unit names, register-row identifiers, drafts, notes, and other planning records cannot
supply that meaning. Remove dependence on those records by stating their required substance.

Retain requirements, interfaces, invariants, preconditions, failure behavior, exclusions, success criteria, and
rationale needed to distinguish correct implementations. Supplemental notes may aid execution, but cannot be the
only home of a binding obligation or settled decision. Exploration history and provenance may remain supplemental.

Dependencies describe the required contract and availability condition. Define an unshipped prerequisite as an
expected contract; do not present it as shipped behavior or substitute a sibling plan for its definition.
Exclusions describe behavior rather than another change's ownership.

### 2. Preserve useful references, precision, and tracking

The permitted references and exceptions are:

- Established project code and documentation accessible to the reader, and internal specification references.
  Define unfamiliar required concepts locally or reference their established definition. Code references ground
  existing behavior; the specification still states the desired behavior and changes.
- Symbols, schema fields, examples, requirement identifiers, and section references remain available for precise
  implementation and validation. This is a meaning rule, not a banned-token policy.
- The existing complementary PRD/RFC convention for distinct product and engineering authors remains available.
  Treat the accessible pair as the specification set, with the existing division of content. Another work unit's
  specification is not an allowed substitute for missing design.
- Preserve title identity, `Origin`, and `Purpose` where present. Existing pre-activation `State` and `Related Work`
  metadata may retain dependency tracking while present. `Purpose` states the substantive thesis; tracking fields
  cannot substitute for it or carry otherwise missing design.
- Preserve amendment records, boundary carriers, and task locators. Each binding amendment delta satisfies the
  reader standard; its process anchors cannot substitute for the amended behavior.
- ARC process terms and artifact names remain valid as actual subject matter, using their established definitions
  or a local definition when required. The standard does not prohibit describing the processes being changed.

### 3. Use the existing shared review method

`spec-review` owns the canonical paired checks:

1. **Reader independence:** the reader can understand the change, boundaries, required concepts, and criteria
   without consulting its planning history.
2. **Binding completeness:** the executor can derive complete coverage of the form's enumerable design and the
   verifier can distinguish correct behavior, with no additional obligation or decision hidden in notes.

Make both checks a common requirement when reviewing every new specification or substantive edit to an existing
specification, regardless of when it was authored (A1). Grounding-only calls and coherence-only rereads retain that
common requirement. Existing depth rules continue to select the remaining coherence and grounding work.

Generalize the method's create-spec-finalization framing to specification authoring and revision. Review a complete
new specification set, or the changed footprint, including removals, with affected surrounding obligations and
definitions. A local edit does not automatically require reviewing unrelated specification content.

Caller declarations and direct fire-point instructions invoke `spec-review` after a bounded batch of substantive
specification writes, before the existing approval/release boundary. Each template carries a concise authoring
prompt appropriate to its form; it does not duplicate the full rubric. No standalone reader method is needed:
the existing method already owns artifact review, and all consumers need that responsibility.

### 4. Reach all four specification-writing workflows

- **`create-spec`:** review the complete new specification or sanctioned layered set before spec approval.
- **`generate-tasks`:** review changed specification elements and their affected contract after proportionality
  corrections, boundary-decision writes, Spec-propagation corrections, or suite-coherence edits. Feed findings into
  the existing iteration and approval flow before finalizing the corrected plan.
- **`decompose-work-unit`:** after destination authoring and before distributed-result approval, review each newly
  authored member's specification set and substantively changed content in existing destinations, regardless of
  when they were authored (A1).
  This includes specifications copied from an origin that continue directly to task generation. Extraction also
  reviews the retained source as specified in Decision 5.
- **`amend-design`:** invoke the common reader checks over the amendment footprint and affected surrounding
  contract at every depth, including grounding-only low-depth calls. Preserve depth-based coherence/grounding work,
  the assurance rubric, and the post-settle coherence reread's common reader requirement.

Declare `spec-review` where missing and place a direct invocation at each listed operation. The method advances
no lifecycle stage and adds no interlock. Preserve existing source grounding, amendment arms, depth selection,
and approval boundaries.

### 5. Preserve the retained source contract during extraction

Before distributed-result approval, review the prospective retained contract of every source specification (A1),
using reported source units and the operator's allocation intent. Removed units are change context; they cannot supply
definitions or obligations still needed by the retained design.

At the finish leg, review the exact CLI-reported retained specification bytes before destructive apply. Report
missing binding design before applying a known-incomplete preview. A change to the approved distribution requires
the existing owner decision. Preserve the sole semantic distribution approval and exact finish authority; do not
reconstruct CLI-owned facts or add a preview mechanism or a second distribution gate.

Review any later substantive specification edits before source-finish release. Do not repeat review over unchanged
bytes. These checks use the existing operation inputs: `scanV3DecomposeContent` inventories heading-bounded units,
and `planV3ExtractionSourceThinning` retains units allocated `retained-origin` without assessing semantic completeness.
`composeFinishPreview` supplies exact source paths and retained `contentBase64` or absence;
`finishGitV3ExtractionOperation` previews or applies the thinning before the workflow's source-finish release.

### 6. Keep binding content through draft retirement

Extend the existing `create-spec` reference-content audit before migration or deletion. Absorb content defining an
obligation or settled decision into the specification; only supplemental execution context may migrate to notes.
If the audit reveals missing binding design, return to the existing review/iteration before retiring the draft.
Use the existing finalization steps without a new gate or checklist runner.

### 7. Apply the standard prospectively through nine sources

Every new specification and every future substantive specification edit receives the standard, regardless of when
the specification was authored (A1). Review edits over their affected footprint; unchanged existing content requires
no rewrite, backfill, or retrofit.

Update these authoritative sources under `packages/arc-framework/arc/` and their matching project projections:

- `system/methods/spec-review.md`
- `system/workflows/arc/create-spec.md`
- `system/workflows/arc/generate-tasks.template.md`
- `system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md`
- `system/workflows/arc/supplemental/amend-design.md`
- `reference/templates/arc/work-unit/spec/template-spec-brief.md`
- `reference/templates/arc/work-unit/spec/template-spec-outline.md`
- `reference/templates/arc/work-unit/spec/template-spec-detailed-prd.md`
- `reference/templates/arc/work-unit/spec/template-spec-detailed-rfc.md`

All nine sources are included by `init-recipe.json`. The task-generation template's project counterpart is
`generate-tasks.md`. The surfaces implement one reader contract and land together; no independent delivery boundary
or cross-member sequencing is needed.

## Scope boundary (No-gos)

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- No historical specification rewrite, archive cleanup, backfill, or retrofit campaign.
- No `DEV-RULES`, briefs, session load-set, or other always-loaded changes.
- No mechanical detector, hook extension, detector configuration, or banned-token list. Reference scans cannot
  establish semantic independence or completeness and would reject identifiers useful in specifications.
- No new configuration, lifecycle stage, interlock, review method, CLI behavior, or evaluation framework.
- Preserve task-list coverage, Success Criteria validation, supplemental task-context pointers, metadata,
  amendment records, and the existing layered-specification convention.

## Consequences & Risks

- The standard preserves implementation precision and every binding obligation while removing the need for
  planning history. Authors must replace a reference with its substance rather than simply delete it.
- Scoped method calls keep the reader checks reachable at all authoring and revision operations. Broader coherence
  and grounding still follow existing depth rules; caller additions must not turn local corrections into unrelated
  whole-spec reviews or reopen settled design through an artifact check.
- Judgment-based adherence remains a limitation. Markdown lint and ARC contract checks establish document integrity;
  examples and design reviews do not demonstrate executing agents' reliability. Behavioral eval coverage remains
  unavailable here, and this change claims no measured adherence improvement. The cases below define the intended
  judgments without adding an executable harness.
- Guidance stays at authoring/review fire points using existing method declarations. This adds no universal context,
  loading flags, procedural markup, or state-comparison logic.

## Success Criteria

- All nine source surfaces and matching project projections implement Decisions 1–7. Each template guides its form;
  the method owns the full paired checks, and all four workflows declare and directly invoke it where required.
- Reader independence and binding completeness are common to either review slice, and review scope includes the
  affected surrounding contract without automatically expanding to unrelated content. Amendment depth and native
  approval/release boundaries remain as specified.
- The draft-retirement audit distinguishes binding content from supplemental context and routes missing binding
  design back through review before migration or deletion.
- The completed guidance gives the following cases these concrete judgments, with every binding obligation retained:
    - A sibling name, register row, or foreign specification supplying scope or an interface obligation is rejected;
      its replacement states the behavior and precondition.
    - Notes supplying the only conflict policy are rejected; policy and decisive rationale belong in the specification.
      Tasks may still reference supplemental implementation context.
    - Requirement identifiers, schema fields, code symbols, and internal section references remain usable; removing
      provenance preserves failure cases, invariants, and acceptance conditions.
    - Header tracking and amendment task anchors remain usable; the thesis and binding delta stand without them.
    - An accessible sanctioned PRD/RFC pair supplies its shared context; an unavailable companion cannot do so.
    - An unshipped prerequisite is defined as an expected contract; an ARC artifact used as subject matter is permitted
      with its definition.
    - New decomposition member specs, task-generation corrections, and low-depth amendments encounter the shared checks
      before their existing boundaries, at the required scope.
    - Extraction retaining a requirement while transferring its required definition fails the retained-contract check.
      Review occurs before distribution approval and over the exact finish preview before apply; a destination spec
      cannot supply the missing authority. Later unchanged bytes need no repeated review.
- Markdown lint and the ARC method-trigger, domain-rule, and section-reference checks pass.
- Every future substantive specification edit receives the common reader checks over its affected footprint,
  regardless of original age; unchanged legacy content requires no retrofit or adoption marker (A1).

## Open items

None requiring design before implementation. Exact instruction phrasing and concise template-prompt placement are
implementation details within the defined surfaces and review boundaries.

## Amendments

- **A1** — 2026-10-03 — design: apply reader checks to every new specification and future substantive edit.
  _Supersedes:_ Decision 7 ¶1. _Trigger:_ PRRT_kwDOP8ODB86orFZU review. _Work:_ review-fix. _Revalidated:_ review-fix.
