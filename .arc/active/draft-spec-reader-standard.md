# Draft: Spec Reader Standard

- **Origin:** [internal] — minted at the 2026-09-30 housekeep drain from a `USER-INBOX` capture, "Write specs for the
  reader who checks the change against them", made during `storage-contract` draft-design, C10 export discussion
  (2026-09-29).
- **Purpose:** Write specs for the reader who checks the change against them: the body uses the project's own
  vocabulary and cites no planning context that reader cannot reach.
- **Planning posture:** `P2`; independent of the storage program. The reader contract applies to cold development
  reads and reviews wherever the spec is presented.
- **Class at capture:** `Heavy` — planning authored the substantive/admin boundary, binding-completeness safeguard,
  and enforcement tradeoffs. This realizes the design-authoring floor; the implementation surface remains bounded.

---

## Problem / Motivation

The intake identified specs that describe scope through another work unit's ownership, borrow concepts from
unshipped plans, or refer the reader to drafts and notes. Those references require planning history to understand
the change and decay as work units ship, rename, or retire. The executing session and reviewer both need a spec
they can read cold.

The spec is also the binding design for task generation and implementation. Improving its reader independence
must preserve every obligation and settled decision needed to build and assess the change.

## Approach

A reader standard composed with existing authoring, review, and draft-retirement steps. The substantive spec
states the desired behavior, settled design, scope, and observable success conditions in project vocabulary. It
does not use work-unit names, register-row identifiers, its own draft or notes, or other planning records to
supply that meaning.

### Binding completeness

Every binding obligation and settled design decision is available in the spec or its permitted specification and
documentation references. Supplemental notes may aid execution, but cannot supply an otherwise missing
requirement or decision. Removing a planning reference preserves the substance it supplied.

- Retain requirements, interfaces, invariants, preconditions, failure behavior, scope exclusions, success criteria,
  and rationale needed to distinguish correct implementations. Exploration history and provenance can remain in
  drafts or notes.
- Retain technical precision: symbols, field names, schemas, examples, requirement identifiers, and internal
  section references. The reader standard does not import the code-reference check's token prohibitions.
- State dependencies through the contract and availability condition the change requires. A prerequisite that
  has not shipped is explicitly an expected contract; a sibling's plan cannot stand in for that definition.
- State exclusions through behavior rather than ownership. The reader can tell what this change does not do
  without finding who is expected to do it elsewhere.

### Permitted references and metadata

- **Substantive references:** established project code and documentation accessible to the reader, and internal
  references within the spec. Define unfamiliar required concepts locally or reference their established
  definition. Code references ground existing behavior; the spec still states the desired behavior and changes.
- **Layered specifications:** preserve the existing complementary PRD/RFC convention for distinct product and
  engineering authors. Treat the pair as the specification set; the reader must be able to access the companion.
  This does not license references to another work unit's spec or change the layering convention.
- **Header:** preserve the title's identity, `Origin`, and `Purpose` where present. Existing pre-activation `State` and
  `Related Work` metadata may retain dependency tracking while present. `Purpose` remains a substantive thesis,
  not a place to hide design behind a planning reference. No new header field is introduced.
- **Amendments and boundary carriers:** retain their existing form and process anchors. An amendment's binding
  delta satisfies the substantive reader standard; its task locators remain useful tracking. Neither a locator
  nor header metadata substitutes for the amended behavior.
- **Subject matter:** process terms and artifact names remain legal when they are what the change actually works
  on. An ARC implementation spec can describe a work-unit field or `spec-*` convention using the same definition
  and completeness standard. This is a meaning rule, not a banned-word list.

### Authoring, review, and finalization

`spec-review` is the shared review entry point for all four spec-writing workflows. Its contract applies to a
complete newly authored specification set or a changed footprint, including removals, with the surrounding
contract needed to assess it. Each of the four templates carries a concise authoring instruction appropriate to
its form. The paired checks are a common requirement whenever reviewing a newly authored spec or changed content
in a spec authored under this standard. Grounding-only invocations and coherence-only re-reads explicitly retain
that common requirement:

1. **Reader independence:** can a reader understand the change, boundaries, required concepts, and criteria
   without consulting its planning history?
2. **Binding completeness:** can an executor derive complete coverage of the form's enumerable design and a
   verifier distinguish correct behavior from incorrect behavior, with no additional obligation hidden in notes?

The `create-spec` draft-retirement audit checks retained reference content before migration or deletion. Content
that defines an obligation or settled decision is absorbed into the spec; genuinely supplemental context may go
to notes. If this reveals missing binding design, return to the existing spec review/iteration before retiring
the draft. Add no gate or separate checklist runner.

The method's invocation contract and body are the canonical home for the paired check wording and scoped review
behavior. Generalize its existing create-spec-finalization framing to the spec-writing operation. Caller method
declarations and executable fire-point instructions name the method and its scope; template instructions guide
authoring without copying a second full rubric. Run the review after a bounded batch of substantive spec writes,
before its existing approval/release boundary. Existing depth rules select the remaining coherence and grounding
work; callers do not acquire a whole-spec re-review merely because they edited one element.

Explicit caller coverage:

- **`create-spec`:** review the complete new spec or sanctioned layered specification set before spec approval.
- **`generate-tasks`:** review changed spec elements and their affected surrounding contract after proportionality
  corrections, boundary-decision writes, spec-propagation corrections, or suite-coherence edits to the spec. Feed
  findings into the existing iteration/approval flow before the corrected plan is finalized.
- **`decompose-work-unit`:** review every newly authored member's specification set and affected content in
  existing destinations authored under the standard, after destination authoring and before distributed-result
  approval. For extraction, include the prospective retained source contract of specs authored under the standard,
  using reported source units and the operator's allocation intent. Removed units are change context, not authority
  for the retained contract. At the finish leg, review the exact CLI-reported retained specification bytes before
  destructive apply. Review any later substantive spec edits before source-finish release; unchanged bytes need no
  repeated review. This covers both scaffolded specs that continue directly at task generation and source thinning.
- **`amend-design`:** explicitly invoke the common reader requirement over the amendment footprint and affected
  surrounding contract at every depth, including its grounding-only low-depth path. Keep the existing depth-based
  coherence/grounding work and assurance rubric; its post-settle coherence re-read also retains the common check.

Declare `spec-review` where the caller does not already declare it, and retain direct invocation at every listed
spec-writing boundary. The method performs artifact review; it advances no lifecycle stage and creates no new
interlock. Existing source grounding, amendment arms, depth selection, and approval boundaries continue alongside
it.

Extraction review feeds the existing distribution and finish stops. A retained requirement cannot depend on a
definition or obligation allocated away. Report missing binding design before applying a known-incomplete finish
preview; changes to the approved distribution need the existing owner decision. Preserve the sole semantic
distribution approval and exact finish authority; no second distribution gate, CLI-owned fact reconstruction, or
new preview mechanism is introduced.

## Alternatives

- **Chosen — authoring and review guidance:** composes with the current workflow and evaluates both explicit
  references and implicit dependence on missing design. Its limitation is judgment-based adherence; concrete
  examples and the existing review boundary are the proportionate response.
- **Chosen — shared `spec-review` entry point:** all four consumers write specifications and need scoped artifact
  review. The paired reader questions belong to that existing responsibility. A standalone reader method would
  add a second invocation/dependency surface without removing any required caller integration; no independent
  reader-only consumer requires that split here.
- **Rejected — mechanical detector:** a string scan can find selected references but cannot establish reader
  independence or binding completeness. The current pre-commit `meta_project_refs` pipeline excludes `.arc/`,
  package ARC content, and Markdown; its code rules reject tokens useful in specs. Extending it would require a
  distinct policy and exclusions for modest coverage. No checker, hook extension, or detector configuration is
  included.
- **Rejected — always-loaded rule:** spec authoring and review are explicit consumers. Their fire sites carry the
  instruction without adding to universal context.
- **Rejected — archive cleanup:** prospective adoption addresses future authoring without coupling this change
  to a historical rewrite.

## Scope boundary

- Future specs only; no existing-spec rewrite, backfill, or retrofit campaign.
- Change `create-spec`, `generate-tasks.template`, `decompose-work-unit`, `amend-design`, `spec-review`, and the
  four spec templates through package source and their project projections. All nine source files are included
  by `init-recipe.json`; the task-generation template projects to the project's `generate-tasks.md`.
- No `DEV-RULES`, brief, session load-set, or other always-loaded changes.
- No mechanical checker, new configuration, workflow stage, interlock, or evaluation framework.
- Preserve task-list coverage, Success Criteria validation, task-local supplemental-context pointers, metadata,
  amendment records, and the existing layered-spec convention.
- One work unit: the nine authoring and review surfaces implement one reader contract and land together. No
  independent delivery boundary or cross-member sequencing is required.

## Verification examples and success signal

Use these representative cases to assess the completed guidance and its application. They are review examples,
not a new executable harness or changes to existing specs:

- **Foreign planning dependency:** a scope clause or interface obligation supplied only by a sibling name,
  register row, or foreign spec is rejected. Its replacement states every required behavior and precondition.
- **Own notes as hidden authority:** an instruction to find the conflict policy in the spec's notes is rejected.
  The policy and decisive rationale remain in the spec; tasks may still point to supplemental implementation
  context.
- **Technical traceability:** a requirement identifier, schema field, named code symbol, or intra-spec section
  reference is retained. Removing provenance does not drop failure cases, invariants, or acceptance conditions.
- **Metadata and amendment tracking:** `Origin`, temporary dependency metadata, and amendment task anchors remain
  usable. The thesis and each binding amendment delta remain understandable without following those anchors.
- **Layered specification:** the sanctioned RFC references its accessible companion PRD for shared context while
  retaining its own design and checks. An unavailable companion cannot be used to satisfy reader independence.
- **Future contract and subject matter:** an unshipped prerequisite is defined as an expected interface rather
  than claimed as existing; an ARC artifact name used as actual subject matter is permitted with its definition.
- **Writer coverage and scope:** new member specs authored after decomposition receive the shared review before
  distribution approval; task-generation spec corrections receive it over their affected footprint; a low-depth
  amendment retains the reader check despite its grounding-only slice. A local edit includes affected neighboring
  obligations and definitions without automatically re-reviewing every unrelated spec element.
- **Retained extraction contract:** a retained requirement still needs a definition allocated to an extracted
  destination. Review the prospective retained contract before distribution approval and the exact retained text
  in the finish preview before apply; the destination's spec cannot supply the missing authority. Retain the
  required substance locally or through a permitted established reference. Later unchanged bytes do not trigger
  another review.

Success is concrete coverage of this reader contract in all nine sources, with matching project projections;
the existing review and retirement steps apply both reader independence and binding completeness; and the
representative cases preserve every binding obligation while distinguishing legitimate references from planning
dependence. Markdown and ARC contract checks establish document integrity, not semantic adherence by themselves.

### Behavioral evidence limitation

`strategy-procedure-evolution.md` Principle 5 calls for behavioral eval coverage over judgment prose. Reviewing the
cases above establishes the intended judgments; neither that review, static checks, nor an adversarial design pass
demonstrates that executing agents reliably apply the instructions. Runtime adherence and regression coverage
remain unverified here. `workflow-eval-harness` is planned and not shipped; these cases are offered to its owner
through the identity-global inbox. This work adds no eval framework and claims no measured adherence improvement.

`strategy-knowledge-evolution.md`'s placement and trigger principles are served by the operation-scoped method
requirement at authoring/review fire sites, with no universal-context growth or new loading machinery. The new
instructions retain irreducible judgment in prose and introduce no state-comparison logic, runtime markup, or
schema. The paired check names describe their local questions rather than introducing new ARC vocabulary.

## Open design

- The shared method, four caller boundaries, and scoped review behavior are settled. Exact instruction phrasing
  and the placement of concise template prompts are implementation details within the nine-file surface.
- Prospective instruction-following remains a practical limitation. The examples and paired review questions
  make the intended judgment explicit; this work does not claim a measured adherence improvement.

**Readiness:** formalization-ready. All settle-able decisions are authored, the success signal is concrete, and
no inbound buffer remains. The Pass 2 retained-source correction passed its independent fix check with no findings;
full adversarial passes stop after that check as agreed.

**Next:** Capture the draft on approval, persist Class `Heavy`, and advance to create-spec for an outline spec.
The outline form records the reference boundaries, retained authority, placement, and verification cases without
requiring a larger architecture or requirements matrix.

## Grounding

`strategy-work-organization.md` § Validation contract binds task-list coverage to the spec form's enumerable
substrate and implementation validation to its Success Criteria. `generate-tasks.template.md` carries that
coverage read, accepts temporary pre-activation metadata, and permits task-local Additional Context pointers to
notes. `verify-work-unit.md` compares the upstream design and criteria with implementation evidence.

`spec-review.md` supplies the existing coherence and source-grounding review; `create-spec.md` supplies the
reference-content audit before draft retirement. `strategy-work-planning.md` § Layered Specs supplies the
distinct-author PRD/RFC exception. The templates supply the current `Origin` / `Purpose` header and amendment
records. The package recipe installs every proposed source destination.

`generate-tasks.template.md` writes spec corrections in its proportionality and Spec-propagation procedures and
records boundary decisions in spec prose. `decompose-work-unit.md` authors reported destination design families
before its distributed-result approval. `memberProfileArtifacts` and `scaffoldMemberProfile` in
`decompose-v3-repository-plan.ts` select and copy member specs from the origin and send spec profiles directly to
`generate-tasks`. `amend-design.md` already declares `spec-review` and invokes grounding at every depth; its
low-depth call needs the common reader requirement stated explicitly. These are existing consumer sites, not new
CLI behavior introduced by this work.

For extraction, `scanV3DecomposeContent` in `decompose-content.ts` inventories heading-bounded source units;
`planV3ExtractionSourceThinning` in `decompose-v3-thinning.ts` retains only units allocated `retained-origin`.
Those operations preserve and validate bytes, not the retained design's semantic completeness.
`composeFinishPreview` in `git-decompose-v3-finish.ts` supplies exact source paths and retained `contentBase64` or
absence; `finishGitV3ExtractionOperation` previews or applies that thinning. The decomposition workflow already
surfaces the preview before its destructive-apply stop and leaves a finished source staged before its release.
These existing inputs support the retained-contract check without changing the CLI.

### Historical intake context

The seed reported 11 of 12 sampled specs naming other work units, up to 32 mentions in one spec, and 11 of 40
citing drafts or notes. Its sample enumeration and method have not been recovered; these remain unverified intake
figures and do not enter the spec's factual basis or success criteria. The intake also named Nygard's ADR writing,
Rust RFC guidance, and Google's developer documentation style as further reading; no design choice depends on
an unverified external quotation.

## Related

- `planning-iteration-mechanics` holds the companion timing rule: coordination routing leaves the planning record at
  draft close, before `create-spec`, because a spec under this standard cites no other work unit.
- `documentation-surface-routing` owns which content belongs on which task-adjacent surface; this unit owns the spec's
  own reader contract.
