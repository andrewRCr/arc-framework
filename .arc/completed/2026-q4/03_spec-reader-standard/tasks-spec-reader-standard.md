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

### `[x]` **2.1 Review new specs and preserve binding content at retirement — Decisions 1–4, 6–7**

- _Goal:_ A new specification is reviewed as a complete contract, and draft retirement cannot move a missing
  obligation or settled decision into supplemental notes.

- _Outcome:_ New specifications and accessible complementary sets receive the shared checks before approval.
  The retirement audit absorbs missing binding obligations, decisions, and decisive rationale into the spec and
  returns through existing review and approvals before migration or deletion; only supplemental context migrates.
  Both projections retain the two gates, design re-entry, retirement sequence, and ceremony behavior.

### `[x]` **2.2 Review specification writes during task generation — Decisions 1–4, 7**

- _Goal:_ Corrected specification content reaches task planning as a complete reader-independent contract while
  local corrections keep their existing scope and approval flow.

    - `[x]` **2.2.a Integrate proportionality and boundary-decision writes**
        - The authoritative task-generation template and rendered projection declare and invoke the shared review
          after eligible proportionality corrections and specification decision writes, covering removals and the
          affected contract before existing boundaries while retaining approval, restart, and depth selection.

    - `[x]` **2.2.b Integrate propagation and suite-coherence writes**
        - Direct shared-review invocations follow bounded Spec-propagation corrections and eligible specification
          edits during suite coherence, including post-settle re-fires. Findings follow existing iteration and
          phase-confirmation flow; unchanged reads and task/notes-only edits skip the review.

### `[x]` **2.3 Review distributed and retained extraction contracts — Decisions 1–5, 7**

- _Goal:_ Both destination specifications and the surviving source retain every definition and obligation needed
  to understand and validate their assigned design before their existing mutation/release boundaries.

- **Additional Context:** `notes-spec-reader-standard.md` § Extraction source behavior.

    - `[x]` **2.3.a Integrate destination and prospective retained-source review**
        - Both projections declare and invoke the shared checks over new destination sets, including copied specs,
          eligible existing destinations, and the prospective retained source from reported units and allocation
          intent, before the sole distribution approval. Removed units and destinations supply no missing authority.

    - `[x]` **2.3.b Integrate exact finish-preview and later-edit review**
        - Shared review covers exact reported retained bytes or absence before apply and later substantive source
          edits before finish release. Incomplete previews surface at the existing stop; distribution changes return
          to the owner decision. Exact authority, reconciliation, and finish controls remain, with unchanged bytes
          and task/pointer-only edits requiring no repeated specification review.

### `[x]` **2.4 Retain the reader checks at every amendment depth — Decisions 1–4, 7**

- _Goal:_ Every eligible binding amendment remains understandable and complete, including determinate corrections
  whose existing review uses only the grounding slice.

- _Outcome:_ Both amendment projections explicitly retain the common reader checks over eligible amendment
  footprints, removals, and affected obligations at every depth, including grounding-only low review and the
  post-settle coherence slice. The existing arms, assurance rubric, declaration, and approval/capture flow remain.

### `[x]` **2.5 Validate the complete guidance and projection surface — Decisions 1–7**

- _Goal:_ The shipped guidance and project projections agree on the reader contract and all required fire points,
  with intended judgments verified without claiming measured agent adherence.

- _Outcome:_ Validated the exact nine shipped sources and matching projections, preserved override and approval
  surfaces, and direct invocation at every required writer operation. Traced all eight case judgments to the
  completed rules and recorded them in `notes-spec-reader-standard.md` § Complete guidance validation, separately
  from unmeasured runtime adherence; the implementation stays prospective and within the declared guidance surface.

## **Phase 3:** Verification

_Purpose:_ Validate the completed implementation against the specification and prepare the work unit for integration.

### `[x]` **3.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The complete implemented reader contract has source-grounded Success Criteria dispositions and passing
  required quality gates.

- _Quality gates:_ Full Markdown lint, the three ARC audits, TypeScript and shell lint, both type checks, and the
  full build passed. All 98 framework-contract tests passed; the routine suite reported 13,260 passed and two skipped.
  An isolated missing-guidance negative control failed as intended and passed after restoration. E2E and portability
  remain required CI checks before merge.
- _Success criteria:_ All 16 met, none superseded. Fresh criteria Pass 1 found a major amendment-review timing gap;
  its approved correction was committed and fresh full Pass 2 returned no findings. The locus/digest report and
  verification limits are recorded in `notes-spec-reader-standard.md` § Work-unit verification.

---

## Success Criteria

- `[x]` The exact nine source surfaces and matching projections implement the specification's seven decisions;
  each template has a concise form-appropriate prompt, and the shared method owns the complete paired checks.

- `[x]` Every required writer operation declares and directly invokes the shared review at the specified boundary,
  including task-generation corrections, decomposition destinations, retained extraction source, and amendments.

- `[x]` Either selected review slice retains reader independence and binding completeness; affected surrounding
  obligations and definitions are included without automatically reviewing unrelated content.

- `[x]` Draft retirement absorbs binding requirements and decisions into the specification, migrates only
  supplemental context, and routes missing binding design back through review before deletion or migration.

- `[x]` A sibling name, register row, or foreign specification supplying scope or an interface obligation is
  rejected in favor of explicit behavior and preconditions.

- `[x]` A conflict policy supplied only by notes is rejected; its policy and decisive rationale remain in the
  specification while tasks may reference supplemental implementation context.

- `[x]` Technical identifiers and internal references remain usable, and removing provenance retains failure
  cases, invariants, and acceptance conditions.

- `[x]` Header tracking, amendment anchors, and an accessible sanctioned PRD/RFC pair retain their permitted roles;
  the thesis and binding delta stand without tracking anchors, and an unavailable companion cannot supply context.

- `[x]` An unshipped prerequisite is defined as an expected contract, and an ARC artifact used as subject matter is
  permitted with its definition.

- `[x]` New member specs, task-generation corrections, and grounding-only low-depth amendments receive the common
  checks over the required scope before their existing approval/release boundaries.

- `[x]` Extraction cannot remove a definition needed by retained design unnoticed: the prospective retained contract
  and exact finish preview receive review before distribution approval and apply respectively; a destination spec
  cannot supply missing authority, and later unchanged bytes require no repeated review.

- `[x]` Task-list coverage, Success Criteria validation, metadata, amendment records, supplemental task context,
  depth selection, and native lifecycle/approval controls retain their specified behavior.

- `[x]` The implementation remains prospective and within the nine-source surface, with no historical retrofit,
  always-loaded change, checker, new configuration, CLI behavior, interlock, review method, or evaluation framework.

- `[x]` Verification reports distinguish document integrity and intended case judgments from unmeasured runtime
  adherence, with no claimed measured improvement in executing-agent reliability.

- `[x]` All quality gates pass.

- `[x]` Ready for integration.

- `[x]` Every future substantive specification edit receives the common reader checks over its affected footprint,
  regardless of original age; unchanged legacy content requires no retrofit or adoption marker (A1).
