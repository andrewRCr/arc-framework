# Task List: Spec Reader Standard

- **Design:** `spec-spec-reader-standard.md`

---

## **Phase 1:** Shared review contract and specification authoring

_Purpose:_ Establish the common reader checks and authoring prompts before wiring the workflows that consume them.

_Mode:_ `replication` through Phase 2 — closes when the nine source surfaces and their project projections carry
the complete reader contract, with every required operation covered and the representative cases checked.

### `[x]` **1.1 Define the shared reader-review contract — Decisions 1–3, 7**

- _Goal:_ Reviewers can assess reader independence and binding completeness over a new specification set or an
  affected footprint without importing planning history, dropping binding design, or expanding unrelated review.

- _Outcome:_ The shared method and matching projection require reader independence and binding completeness for
  either review slice, scoped to new specification sets or changed contracts, including removals and affected
  obligations. Its reference rules preserve precision, tracking, amendments, accessible paired specs, and expected
  prerequisite contracts while retaining source grounding, depth selection, and design re-entry.

### `[x]` **1.2 Guide brief specification authors — Decisions 1–3, 7**

- _Goal:_ A brief states its complete falsifiable signal and scope without relying on planning history.

- _Outcome:_ The brief template and projection prompt authors to preserve the complete intent, boundary, and
  falsifiable signal when replacing planning dependence, and link the shared checks without changing the header,
  clause-scoped freeze, amendment convention, or technical precision.

### `[x]` **1.3 Guide outline specification authors — Decisions 1–3, 7**

- _Goal:_ An outline records every settled decision and decisive rationale needed for complete task coverage.

- _Outcome:_ The outline template and projection preserve complete decisions, decisive rationale, boundaries,
  consequences, and criteria while directing authors to the common checks. Supplemental notes cannot supply
  otherwise missing design; the form's header, scope carrier, and amendment anchors remain intact.

### `[x]` **1.4 Guide detailed product and engineering authors — Decisions 1–3, 7**

- _Goal:_ Detailed specifications retain exhaustive requirements or design elements and the sanctioned division
  of authority in an accessible distinct-author PRD/RFC pair.

    - `[x]` **1.4.a Add the product-spec authoring prompt**
        - The product template and projection require a complete numbered-requirement contract and shared reader
          checks, preserving accessible distinct-author pairing, shared context ownership, header fields,
          boundary/amendment carriers, and paired-mode scaffolding.

    - `[x]` **1.4.b Add the engineering-spec authoring prompt**
        - The engineering template and projection require complete design, interfaces, invariants, failure behavior,
          rationale, and criteria under the common reader checks, retaining the accessible companion contract and
          existing paired/standalone section division.

## **Phase 2:** Writer integration and complete-surface validation

_Purpose:_ Reach every authoring and revision operation, then check the complete source/projection surface and
reference-boundary judgments together.

_Exit criterion:_ All nine authoritative sources and matching project projections apply the common reader checks
at their specified scopes and existing boundaries, with the eight representative cases receiving their specified
judgments and every binding obligation retained.

### `[ ]` **2.1 Review new specs and preserve binding content at retirement — Decisions 1–4, 6–7**

- _Goal:_ A new specification is reviewed as a complete contract, and draft retirement cannot move a missing
  obligation or settled decision into supplemental notes.

    - Update `packages/arc-framework/arc/system/workflows/arc/create-spec.md` and its `.arc/` counterpart. Invoke
      the shared checks on the full new specification or sanctioned layered set before spec approval.
    - Extend the reference-content audit to absorb binding content into the specification and migrate only
      supplemental context. Route missing binding design through existing review/iteration before retirement.
    - Preserve the existing method declaration, two approval gates, retirement sequence, and ceremony behavior.

### `[ ]` **2.2 Review specification writes during task generation — Decisions 1–4, 7**

- _Goal:_ Corrected specification content reaches task planning as a complete reader-independent contract while
  local corrections keep their existing scope and approval flow.

    - `[ ]` **2.2.a Integrate proportionality and boundary-decision writes**
        - Update `packages/arc-framework/arc/system/workflows/arc/generate-tasks.template.md` first and mirror its
          applicable edits to `.arc/system/workflows/arc/generate-tasks.md`. Declare the direct `spec-review`
          consumer and invoke it after bounded batches of substantive specification corrections or decision writes.
        - Review changed elements and their affected surrounding contract before the corrected plan is finalized;
          retain existing approval and restart behavior and prospective eligibility.

    - `[ ]` **2.2.b Integrate propagation and suite-coherence writes**
        - Cover Spec-propagation corrections and edits to the specification during final suite coherence, feeding
          reader findings into the existing iteration/approval flow.
        - Keep review tied to specification writes rather than task/notes edits or unchanged reads; preserve the
          selected generation depth and existing source-grounding/task-audit work.

### `[ ]` **2.3 Review distributed and retained extraction contracts — Decisions 1–5, 7**

- _Goal:_ Both destination specifications and the surviving source retain every definition and obligation needed
  to understand and validate their assigned design before their existing mutation/release boundaries.

- **Additional Context:** `notes-spec-reader-standard.md` § Extraction source behavior.

    - `[ ]` **2.3.a Integrate destination and prospective retained-source review**
        - Update `packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md` and
          its `.arc/` counterpart. Declare `spec-review` and invoke it after destination authoring, before
          distributed-result approval, on new member specification sets and eligible existing destinations.
        - Include the prospective retained source contract for extraction, using reported source units and
          allocation intent. Removed units are context, not authority for the retained contract. Preserve reported
          profiles, topology, paths, and the sole semantic distribution approval.

    - `[ ]` **2.3.b Integrate exact finish-preview and later-edit review**
        - Review the exact CLI-reported retained specification bytes before destructive apply. Surface missing
          binding design through the existing stop and owner decision; preserve approved distribution and
          `applyAuthority` without reconstructing CLI-owned facts or adding a preview mechanism.
        - Review any later substantive specification edits before source-finish release. Keep review scoped and
          avoid repeating it over unchanged bytes; retain the existing reconciliation and finish controls.

### `[ ]` **2.4 Retain the reader checks at every amendment depth — Decisions 1–4, 7**

- _Goal:_ Every eligible binding amendment remains understandable and complete, including determinate corrections
  whose existing review uses only the grounding slice.

    - Update `packages/arc-framework/arc/system/workflows/arc/supplemental/amend-design.md` and its `.arc/`
      counterpart. Explicitly invoke the common checks on the amendment footprint and affected surrounding contract
      at every depth, including low-depth grounding-only review and the post-settle coherence reread.
    - Preserve amendment arms, locators, depth-selected remaining reviews, the assurance rubric, and native
      approval/capture behavior. Keep the existing direct method declaration and prospective specification scope.

### `[ ]` **2.5 Validate the complete guidance and projection surface — Decisions 1–7**

- _Goal:_ The shipped guidance and project projections agree on the reader contract and all required fire points,
  with intended judgments verified without claiming measured agent adherence.

    - Confirm the exact nine-source inventory and matching projections, including the task-generation template's
      rendered filename. Use targeted propagation that preserves the configurable method's project override.
    - Inspect every required caller declaration and executable fire point; declaration reachability alone cannot
      establish body invocation. Confirm affected-footprint scope, prospective eligibility, retained-source review,
      unchanged-byte handling, and existing depth/approval boundaries.
    - Walk all eight representative cases from the specification against the completed method, authoring prompts,
      and applicable caller instructions, recording the actual rule/operation supporting each intended judgment.
    - Confirm the retirement audit keeps binding design in the specification, task-local supplemental context
      remains usable, and no always-loaded guidance, checker, configuration, CLI behavior, or interlock was added.
    - Run Markdown lint plus the ARC method-trigger, domain-rule, and section-reference checks. Report artifact
      integrity and the case judgments separately from unverified runtime adherence.

## **Phase 3:** Verification

_Purpose:_ Validate the completed implementation against the specification and prepare the work unit for integration.

### `[ ]` **3.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The complete implemented reader contract has source-grounded Success Criteria dispositions and passing
  required quality gates.

---

## Success Criteria

- `[ ]` The exact nine source surfaces and matching projections implement the specification's seven decisions;
  each template has a concise form-appropriate prompt, and the shared method owns the complete paired checks.

- `[ ]` Every required writer operation declares and directly invokes the shared review at the specified boundary,
  including task-generation corrections, decomposition destinations, retained extraction source, and amendments.

- `[ ]` Either selected review slice retains reader independence and binding completeness; affected surrounding
  obligations and definitions are included without automatically reviewing unrelated content.

- `[ ]` Draft retirement absorbs binding requirements and decisions into the specification, migrates only
  supplemental context, and routes missing binding design back through review before deletion or migration.

- `[ ]` A sibling name, register row, or foreign specification supplying scope or an interface obligation is
  rejected in favor of explicit behavior and preconditions.

- `[ ]` A conflict policy supplied only by notes is rejected; its policy and decisive rationale remain in the
  specification while tasks may reference supplemental implementation context.

- `[ ]` Technical identifiers and internal references remain usable, and removing provenance retains failure
  cases, invariants, and acceptance conditions.

- `[ ]` Header tracking, amendment anchors, and an accessible sanctioned PRD/RFC pair retain their permitted roles;
  the thesis and binding delta stand without tracking anchors, and an unavailable companion cannot supply context.

- `[ ]` An unshipped prerequisite is defined as an expected contract, and an ARC artifact used as subject matter is
  permitted with its definition.

- `[ ]` New member specs, task-generation corrections, and grounding-only low-depth amendments receive the common
  checks over the required scope before their existing approval/release boundaries.

- `[ ]` Extraction cannot remove a definition needed by retained design unnoticed: the prospective retained contract
  and exact finish preview receive review before distribution approval and apply respectively; a destination spec
  cannot supply missing authority, and later unchanged bytes require no repeated review.

- `[ ]` Task-list coverage, Success Criteria validation, metadata, amendment records, supplemental task context,
  depth selection, and native lifecycle/approval controls retain their specified behavior.

- `[ ]` The implementation remains prospective and within the nine-source surface, with no historical retrofit,
  always-loaded change, checker, new configuration, CLI behavior, interlock, review method, or evaluation framework.

- `[ ]` Verification reports distinguish document integrity and intended case judgments from unmeasured runtime
  adherence, with no claimed measured improvement in executing-agent reliability.

- `[ ]` All quality gates pass.

- `[ ]` Ready for integration.
