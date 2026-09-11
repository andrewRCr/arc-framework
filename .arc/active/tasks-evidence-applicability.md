# Task List: evidence-applicability

- **Design:** `spec-evidence-applicability.md`

---

<!-- arc:delivery-plan:start -->
## Delivery Plan

- **Plan Revision:** `1`
- **Plan Digest:** `sha256:11ac7e89bfde9afd6c62f40379cf95fc7178928f56448daec8cc619a67fba4a4`
- **Projection:** `stack-to-main`
- **Landability:** All members are `independently-landable`.

### Members

| #   | Member                  | Chunk key                 |
| --- | ----------------------- | ------------------------- |
| 1   | Applicability substrate | `applicability-substrate` |
| 2   | Concurrent integration  | `concurrent-integration`  |
| 3   | Scoped verification     | `scoped-verification`     |

#### Member coverage

| #   | Tasks                                                                                     | Design elements                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `1.1`, `1.2`, `1.3`, `1.4`, `1.5`                                                         | `detailed:D1`, `detailed:D2`, `detailed:D3`                                                                                                                              |
| 2   | `2.1`, `2.2`, `2.3`, `3.1`, `3.2`, `3.3`, `4.1`, `4.2`, `4.3`, `4.4`, `4.5`, `4.6`, `4.7` | `detailed:D10`, `detailed:D11`, `detailed:D14`, `detailed:D15`, `detailed:D16`, `detailed:D4`, `detailed:D5`, `detailed:D6`, `detailed:D7`, `detailed:D8`, `detailed:D9` |
| 3   | `5.1`, `5.2`, `5.3`, `5.4`, `5.5`, `5.6`, `5.7`                                           | `detailed:D12`, `detailed:D13`                                                                                                                                           |

### Named seams

| #   | Seam                                             | Members | Owner | Design elements                                                                                                                                                                                                       |
| --- | ------------------------------------------------ | ------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Applicability reducer to Candidate lineage       | 1, 3    | 3     | `detailed:D12`, `detailed:D13`, `detailed:D2`, `detailed:D3`                                                                                                                                                          |
| 2   | Applicability contracts to integration consumers | 1, 2    | 2     | `detailed:D1`, `detailed:D10`, `detailed:D11`, `detailed:D14`, `detailed:D15`, `detailed:D16`, `detailed:D2`, `detailed:D3`, `detailed:D4`, `detailed:D5`, `detailed:D6`, `detailed:D7`, `detailed:D8`, `detailed:D9` |

#### Acceptance

- **1. Applicability reducer to Candidate lineage:** Candidate lineage composes approved-fix transitions through the
  shared envelope and reducer without duplicating scope authority or waiting for the proposal-side producer.

- **2. Applicability contracts to integration consumers:** Every integration path consumes the same path treatment,
  total delta, and exhaustive reducer while its typed verb retains mutation, provider, and retry authority.
<!-- arc:delivery-plan:end -->

## **Phase 1:** Applicability substrate

**Delivery member:** 1 — `applicability-substrate`

_Purpose:_ settle the shared path, delta, and reducer contracts before any integration or Candidate consumer depends
on them.

_Mode:_ `layer` — closes on a complete, settled applicability layer.

_Exit criterion:_ one provider-neutral substrate classifies paths, composes every delta arm, reduces every valid
applicability input, preserves raw-distance and Candidate subject-digest behavior across the intentional treatment
change, and removes the unused predecessor.

### `[x]` **1.1 Unify path-treatment classification** — D1

- _Goal:_ every consumer assigns the same treatment to a path, so review subjects, overlap reads, and regenerable
  conflict handling cannot disagree about whether content counts.

    - `[x]` **1.1.a Establish the shared registry contract**
        - Added the pure `evidence-applicability` registry, derived project-document treatment from the layout schema,
          and made overlap partitioning omit neutral paths while retaining readiness regeneration separately.

    - `[x]` **1.1.b Replace the two independent production classifiers**
        - Routed Candidate collection and base-drift composition through explicit work-unit and projection context;
          own planning groups and relocations are neutral, foreign artifacts remain reviewable, and Errands receive
          no work-unit identity.

- _Outcome:_ Candidate subjects, unstaged-review gates, and base-overlap reads now share one storage-agnostic path
  treatment contract, with focused caller and classification coverage preserving raw-distance behavior.

### `[x]` **1.2 Define total evidence-delta producer contracts** — D2

- _Goal:_ every applicability decision receives one normalized, exact-coordinate description with no missing axis or
  cause-specific default left to a caller.

- **Additional Context:** `notes-evidence-applicability.md` § Substrate inventory and § Applicability architecture
  and proportionality decisions

    - `[x]` **1.2.a Define strict producer and normalized schemas**
        - Added strict cause-specific producer and total-envelope schemas with exact observations, explicit
          inapplicable axes, shared bounded residuals, and unbounded diagnostic overlap preservation.

    - `[x]` **1.2.b Normalize existing producer evidence**
        - Composed base movement, base merge, D4 rewrites, narrow review responses, and unexplained Candidate deltas;
          approval scope comes only from the optional approver-owned field and omission remains full.

    - `[x]` **1.2.c Enforce coordinate and authority boundaries**
        - Bound semantic host admission to exact repository, request, base, and head coordinates, reducing mismatches
          to unresolved evidence while rejecting provider-specific payload fields.

    - `[x]` **1.2.d Export one stable applicability surface**
        - Exported the registry, producer contracts, normalized types, bounds, and composer from one module boundary.

- _Outcome:_ all five producer causes now normalize through one strict, computed-only envelope without changing
  durable producer records or leaking provider mechanics into core.

### `[x]` **1.3 Implement exhaustive evidence-applicability reduction** — D3

- _Goal:_ deterministic evidence applicability is decided once in TypeScript, while only a bounded residual that
  truly requires judgment escapes into procedural prose.

    - `[x]` **1.3.a Encode the closed precedence table**
        - Added the pure closed-row reducer for review clearance, verification, and merge safety, including approved
          scope, base movement, D4 relation, overlap, and conservative unavailable behavior.

    - `[x]` **1.3.b Bound the judgment handoff**
        - Limited judgment output to bounded overlap and clean-divergence residuals; every other arm returns a final
          typed verdict, with compile-time axis exhaustiveness and runtime impossible-pair rejection.

- _Outcome:_ deterministic applicability now resolves through one exhaustive reducer, and only a bounded residual
  with a `supplemental` minimum can escape to procedural judgment.

### `[x]` **1.4 Retire the unused review-applicability core** — D2

- _Goal:_ the new substrate has one live authority surface, with the unused predecessor removed and the unrelated
  gate `applicabilityId` contract preserved exactly.

    - `[x]` **1.4.a Remove the dead classifier and proof schema**
        - Removed the unused classifier, proof schema registrations, durable inventory row, canonical-caller entry,
          and isolated unit coverage.

    - `[x]` **1.4.b Prove the removal boundary**
        - Updated schema inventories and generated-artifact expectations; focused unit and E2E schema coverage passes
          while the unrelated gate-contract `applicabilityId` field and every consumer remain present.

- _Outcome:_ the new applicability substrate is the only live core authority surface, with the obsolete registered
  schema identities removed and the distinct gate receipt identity preserved.

### `[x]` **1.5 Close the applicability substrate member** — D1-D3 — validate criteria at member scope

- _Goal:_ Member 1's criteria are validated against the settled registry, total envelope, reducer, and removal
  evidence before an integration consumer lands on top of them.

- _Outcome:_ Member 1 criteria report.

    - _Criteria slice:_ `Success Criteria > Member 1 — applicability-substrate`.
    - _Span:_ bounded diff `6c52c8997..a57de042b`; cumulative reachability `a57de042b` at tree `3f85dcead`;
      boundary-order deviation: none. Incidental transition-oracle repair `8dfc6683c` is inside the chronological
      range but supplies no criterion evidence.
    - _Criterion:_ `Success Criteria > Member 1 — applicability-substrate > 1`; _criterion-digest:_
      `sha256:3c2204c729ae2a91624f2ed356949cffda52ba66b02251dde102d8caef4570e8`; _State:_ `[x]`; _Evidence:_ the shared
      registry routes Candidate, unstaged-review, base-overlap, status, checkpoint, and merge callers through explicit
      identity and projection context; caller, relocation, foreign-WU, shipped-content, and raw-distance coverage
      preserves the three treatments.
    - _Criterion:_ `Success Criteria > Member 1 — applicability-substrate > 2`; _criterion-digest:_
      `sha256:ed4dc00227bc7cad568666aefa5155fad1e13ac483afaaf8028042c9ef50545b`; _State:_ `[x]`; _Evidence:_ all five
      strict producer arms compose total axes, and normalized schemas preserve coordinate, overlap/residual, D4
      continuity, carried-residual, UTF-8 order, and authority invariants before the closed reducer can return one of
      the three verdicts.
    - _Criterion:_ `Success Criteria > Member 1 — applicability-substrate > 3`; _criterion-digest:_
      `sha256:66f8b347292dca07615686f8865eb84f6dc7316928acd48c55749de8edb37036`; _State:_ `[x]`; _Evidence:_ the obsolete
      module, registration, inventory identity, canonical-caller entry, and isolated tests are absent, while the
      distinct gate-contract `applicabilityId` fields and consumers remain.
    - _Adversarial companion:_ three fresh Heavy passes found five criterion defects, fixed in `c15fed9ff`,
      `a87f37ada`, `fe3e0ded0`, `cc92a478b`, and `0e2d2bc16`; one Candidate v1 compatibility concern was dropped
      against the explicit pre-public-release regeneration posture.
    - _Summary:_ three met, zero superseded, zero unresolved. Success Criteria markers remain unchanged.

## **Phase 2:** Base-movement observation and checkpoint planning

**Delivery member:** 2 — `concurrent-integration`

_Purpose:_ turn fresh Git and host observations into one closed checkpoint plan without deriving policy from distance
or provider-specific payloads.

_Mode:_ `slice` through Phase 4 — closes on exercisable concurrent integration across work-unit, delivery, review,
and Errand paths.

### `[x]` **2.1 Add orthogonal base-movement classification** — D4

- _Goal:_ base drift reports path interaction independently of its distance verdict, allowing aware consumers to
  distinguish harmless movement while unaware consumers retain their current fail-closed behavior.

    - `[x]` **2.1.a Produce `movement` from the existing overlap read**
        - Added the orthogonal `disjoint | overlapping | unknown` result projection beside the existing overlap read;
          unavailable and skipped readings continue to omit it, and authoritative materialization preserves it.
        - Test-first coverage proves incomplete integration evidence does not prevent `disjoint`, any substantive path
          yields `overlapping`, unavailable overlap yields `unknown`, and clean readings are `disjoint`.

    - `[x]` **2.1.b Carry movement without changing verdict dispatch**
        - Healthy `arc base drift` and session-init projections now carry schema-validated movement while unavailable,
          skipped, detached-head, and no-remote arms omit it.
        - Register text names all three movement states and delegates proceed/reconcile/stop policy to the typed
          checkpoint; focused unit and E2E coverage preserves every raw-distance verdict and recommendation action.

- _Outcome:_ base drift now exposes path interaction independently of raw distance across its public projections,
  while existing verdict and recommendation dispatch remains unchanged.

### `[x]` **2.2 Separate Git feasibility from provider-neutral host admission** — D5

- _Goal:_ checkpoint planning combines exact local merge feasibility with an independently authoritative host
  admission observation, without allowing either source to impersonate the other.

- **Additional Context:** `notes-evidence-applicability.md` § Applicability architecture and proportionality
  decisions; § Terminal integration decisions

    - `[x]` **2.2.a Establish exact-pair Git feasibility**
        - Added a discriminated, coordinate-carrying Git feasibility observer over a shared byte-preserving
          merge-tree execution/parser now also used by delivery contribution proof.
        - Focused coverage proves clean composition, sorted regenerable-only and substantive conflicts, and sanitized
          unavailable results for unsupported, malformed, or failed merge-tree evidence.

    - `[x]` **2.2.b Define the semantic host-observation port**
        - Added a strict provider-neutral merge-observation port and schema whose four semantic states bind repository,
          request, base, and head, with mandatory detail on every non-positive state and optional opaque evidence.
        - Adapter failures, malformed/provider-shaped values, and coordinate mismatch normalize to actionable
          `unresolved` observations without leaking provider fields.

    - `[x]` **2.2.c Implement the supported GitHub adapter**
        - Added an abortable GitHub observer that admits mergeability only from exact test-merge parents and reuses the
          required-check policy reader for explicit classic or ruleset strict-currentness authority.
        - Generic behind state, malformed or stale coordinates, unavailable policy, and exhausted computation remain
          actionable `unresolved`; focused coverage proves early success/strict resolution, abort, and the three-read
          cap without workflow polling.

- _Outcome:_ Git feasibility and provider-neutral host admission are now independently typed and exact-coordinate
  bound, with GitHub-specific interpretation confined to its adapter.

### `[x]` **2.3 Compose the checkpoint action matrix and regenerable remedy** — D5

- _Goal:_ one checkpoint result selects the only authorized continuation for every movement, feasibility, admission,
  and evidence-completeness combination.

    - `[x]` **2.3.a Replace the conflated reconcile fact with the closed matrix**
        - Replaced the host-only safety flag with one exhaustive movement × feasibility × admission × completeness
          reducer and typed direct-approval, base/regenerable reconcile, host, conflict, and unsafe results.
        - Focused matrix and checkpoint coverage proves exact disjoint continuation, completeness-gated reconciliation,
          distinct cause preservation, Candidate-head binding, and fail-closed unknown/unavailable/mismatched evidence.

    - `[x]` **2.3.b Bind production observations to one checkpoint invocation**
        - Production composition now memoizes one exact open request and binds its head with the drift base across the
          shared Git-feasibility and bounded host-admission reads; the ready composer reuses that same request.
        - Result schemas carry movement, endpoints, semantic causes, detail, and remedies; checkpoint tests prove
          coordinate refusal and public JSON projection while session-init remains outside the host boundary.

    - `[x]` **2.3.c Reuse the bounded readiness-projection conflict remedy**
        - Added the checkpoint-authorized `--regenerate-roadmap` base-merge arm, binding the existing eligibility and
          staged-index renderer to the exact expected base/head before committing only determinate, clean output with
          exact `[expectedHead, expectedBase]` parents.
        - Skipped, failed, indeterminate, wider, malformed, or verification-failed remedies return typed detail after
          abort/CAS restoration; successful merges retain the existing Tier 1, push, and recheckpoint continuation.

- _Outcome:_ the checkpoint now selects one exact, typed continuation from independent movement, Git, host, and
  applicability evidence, including a bounded regenerate-wins merge path with restoration on every non-success.

## **Phase 3:** Delivery and review applicability

**Delivery member:** 2 — `concurrent-integration`

_Purpose:_ let delivery eligibility and review status distinguish disjoint target movement before ordinary downstream
currentness and merge authority are re-established.

### `[x]` **3.1 Admit disjoint protected-base movement in delivery eligibility** — D7

- _Goal:_ a delivery member remains eligible when the live target advanced without touching its contribution, while
  recorded predecessor coordinates and every interacting-movement refusal remain authoritative.

    - `[x]` **3.1.a Classify the bottom member against the observed target**
        - Added an exact-revision overlap primitive with explicit treatment context and a provider-neutral
          predecessor classifier whose exact, disjoint, overlapping, unrelated, and unavailable arms retain the
          coordinates and evidence they establish; base drift delegates without changing its public contract.

    - `[x]` **3.1.b Preserve lifecycle contribution across regenerable movement**
        - Lifecycle comparators and both Git adapters now source registry-classified regenerable entries from the
          chain baseline while retaining protected-tip comparison elsewhere; real-Git coverage proves a base-only
          readiness regeneration lands one-sided with its custom merge driver disabled and competing renders refuse.

    - `[x]` **3.1.c Preserve observed-tip and chain-base authority through materialization**
        - Eligibility snapshots, strict handler schemas, initial materialization, review-target composition, and
          suffix rematerialization now preserve the two coordinates independently; close reobserves sources and
          relation evidence before completeness, returning exact re-prepare input or sanitized failure detail.

    - `[x]` **3.1.d Align eligibility and terminal refusal contracts**
        - Terminal drift now continues on regenerable-only overlap and counts only substantive predecessor
          intersection; eligibility distinguishes overlapping from unrelated predecessor evidence and returns exact
          paths, coordinates, detail, and the explicit no-automated-rebuild boundary.

- _Outcome:_ delivery eligibility can admit disjoint protected-base movement without rewriting the member's real
  predecessor, while every source, relation, lifecycle, and terminal-conflict boundary remains independently typed
  and freshly revalidated.

### `[x]` **3.2 Classify terminal delivery drift from the durable Candidate baseline** — D7

- _Goal:_ the terminal classifier reaches the evidence that determines base-movement applicability before requiring
  currentness against the very base advance it is classifying.

    - `[x]` **3.2.a Separate the versioned Candidate record from effective currentness**
        - Checkpoint composition now shares one versioned managed-record snapshot per work unit, caches effective
          projections by explicit base revision, passes that revision through readiness composition, and returns an
          exact `recompose-required` result before persistence when the final version assertion observes movement.

    - `[x]` **3.2.b Reorder the delivery drift decision**
        - Delivery drift now reduces the versioned record's durable baseline, validates exact overlap before ordinary
          currentness, short-circuits disjoint movement, and scopes overlapping residual and predecessor diffs to the
          retained baseline while preserving exact evidence, sanitized failures, and typed continuation guidance.

- _Outcome:_ a landed predecessor can advance the protected base without making its successor's classification
  depend on currentness against that advance; interacting movement and unavailable evidence still fail closed with
  the coordinates and path envelope needed to diagnose the refusal.

### `[x]` **3.3 Apply overlap-aware carry in review status** — D8

- _Goal:_ review status invalidates an earlier attempt only when fresh base movement overlaps its subject or cannot
  be classified, never because containment alone failed.

    - `[x]` **3.3.a Compose a direct base-movement observation**
        - `readBasePosition` now fetches the base, materializes the exact reviewed head, retains containment, and
          emits a direct exact-coordinate `BaseMovementObservation` from shared overlap analysis using the resolved
          review subject's treatment context, with precise unknown evidence when head or overlap reads fail.

    - `[x]` **3.3.b Project the typed status result**
        - Review status now reduces the direct base-movement observation through the shared applicability substrate,
          carries disjoint movement, fails closed on overlap or unknown evidence only with non-containment, and emits
          exact movement evidence plus a typed checkpoint action or target-only terminal explanation through JSON.

- _Outcome:_ exact containment and shared applicability now compose without a residual-judgment fire-point: disjoint
  movement retains the review attempt, while overlapping or unavailable movement returns actionable checkpoint
  guidance and contained-head outcomes remain unchanged.

## **Phase 4:** Terminal integration operations and doctrine

**Delivery member:** 2 — `concurrent-integration`

_Purpose:_ carry the checkpoint policy through the exact approved-head release, prompt CI continuation, Errand lane,
and shipped procedural guidance.

_Exit criterion:_ disjoint work-unit, delivery, review, and Errand scenarios proceed without lifecycle serialization;
overlap, stale bindings, failed checks, opaque refusals, and unavailable evidence retain their typed safe exits.

### `[x]` **4.1 Revalidate and classify terminal host merge outcomes** — D6

- _Goal:_ terminal release acts only on the exact approved head and current typed plan, while host policy, opaque
  refusal, uncertain mutation, and established operational failure retain distinct provider-neutral exits.

- **Additional Context:** `notes-evidence-applicability.md` § Applicability architecture and proportionality
  decisions

    - `[x]` **4.1.a Expand the terminal result and remedy contracts**
        - Terminal merge results now distinguish exact head movement, independently established strict currency,
          opaque or pending host evidence, established operation failure, unknown mutation outcome, and confirmed
          success; definitive non-success re-holds while uncertainty preserves approval without re-locking.

    - `[x]` **4.1.b Re-run the shared plan immediately before mutation**
        - Production now composes fresh authoritative movement, Git feasibility, and exact host admission through the
          shared checkpoint planner before release; post-refusal revalidation reuses semantic admission without
          repeating its host observer and rejects changed or incomplete coordinates.

    - `[x]` **4.1.c Keep native semantics inside the pinned-merge adapter**
        - The GitHub adapter pins the approved head, confirms the exact request afterward, distinguishes head movement,
          strict currency, refusal, established failure, and unknown outcome, and retains provider identity plus both
          diagnostics when confirmation follows an ambiguous mutation.

    - `[x]` **4.1.d Make the external-seam authority visible**
        - Checkpoint approval text now names the exact head, change request, target ref, last observed base, configured
          host-policy boundary, head-bound check scope, and the residual observation-to-merge race without claiming a
          base-OID pin or exact-pair check evidence.

- _Outcome:_ terminal release now revalidates the complete shared plan and reports the narrowest established host
  outcome, preserving exact approval through uncertainty while keeping definitive failures safely locked and
  actionable.

### `[x]` **4.2 Return prompt checkpoint continuations for required checks** — D16

- _Goal:_ a terminal merge with unsettled CI returns control after one observation and can resume idempotently from
  the same authorization once external checks advance.

- **Additional Context:** `notes-evidence-applicability.md` § Terminal checks-wait field evidence;
  § Terminal integration decisions

    - `[x]` **4.2.a Extract one required-check observation**
        - Added a coordinate-only, abortable observer whose closed union preserves exact-target rows, diagnostic
          failures, sanitized provider detail, and provider/abort/deadline causes; the explicit await API now composes
          that observer through `boundedWait` and alone adds polling policy and elapsed time.

    - `[x]` **4.2.b Replace integration polling with the continuation contract**
        - Terminal merge now makes one required-check observation; pending or unavailable evidence returns the exact
          checkpoint, approved target, current rows, typed diagnostics, and executable retry without elapsed time or
          polling, while failed or stale evidence invalidates and re-locks and exact replay remains idempotent.

- _Outcome:_ required-check observation is now separate from optional waiting, so terminal integration promptly
  yields a complete checkpoint continuation and the command and workflow surfaces preserve its typed evidence.

### `[x]` **4.3 Add the typed Errand terminal merge operation** — D9

- _Goal:_ the Errand lane receives the same evidence and host-policy behavior as work-unit integration through one
  typed operation, with no workflow-authored state machine.

- **Additional Context:** `notes-evidence-applicability.md` § Terminal integration decisions

    - `[x]` **4.3.a Define the exact Errand merge request and result**
        - Added a strict exact-effect request binding Errand generation, branch, approved target, selected lane, and
          merge policy plus a closed direct-merge result union whose non-success arms retain semantic detail,
          decisive observations, and either structured retry authority or an explicit terminal explanation.

    - `[x]` **4.3.b Compose the final Errand state machine**
        - Composed strict current-identity and exact-target replay, one-shot checks, the shared applicability and
          checkpoint planners, both typed reconcile arms, direct pinned merge, exact confirmation, and compensating
          re-hold semantics; only an indeterminate mutating outcome preserves approval without re-locking.

    - `[x]` **4.3.c Publish `arc errand merge` through the CLI boundary**
        - Published the exact request through a thin file-or-stdin handler, Commander, command-input registration and
          policy declarations, JSON and interactive formatting, typed validation/adapter refusals, and built-CLI E2E
          coverage without adding Errand lifecycle or approval storage.

- _Outcome:_ the Errand terminal lane now composes the shared evidence policy and host semantics behind one
  exact-effect command whose machine and interactive surfaces preserve the same typed continuation.

### `[x]` **4.4 Wire typed terminal results and residual judgment through workflows** — D3, D6, D9-D11, D15

- _Goal:_ executing sessions invoke stable verbs and render precomposed outcomes, while the only agent judgment occurs
  at an explicit bounded-residual fire-point.

    - `[x]` **4.4.a Ship the residual-judgment method**
        - Shipped the configurable method through recipe, classification, manifest, reverse-index, inventory, init,
          reconfigure, and package/project sync surfaces with a bounded `supplemental | fresh` contract.

    - `[x]` **4.4.b Convert integration and delivery workflows to typed dispatch**
        - Embedded the shared reducer result in Candidate and review-contribution authority projections; integration
          and delivery now dispatch typed verbs and fire the method only for their concrete bounded residual fields.

    - `[x]` **4.4.c Convert the Errand workflow to the terminal verb**
        - Replaced terminal lane mechanics with one `arc errand merge` dispatch and its supplied continuations while
          retaining advisory drift, fresh approval after judgment, and the separate release-only lock operation.

- _Outcome:_ executing workflows now preserve exact authority while rendering code-owned terminal outcomes; agent
  judgment is isolated to declared, marked, bounded-residual fire-points.

### `[x]` **4.5 Align integration authority and concurrent-work doctrine** — D14

- _Goal:_ the always-loaded rule and shipped strategies consistently state that evidence follows covered content,
  terminal overlap is reconciled once, and provider strictness comes only from configured host policy.

    - `[x]` **4.5.a Amend terminal integration doctrine**
        - Bound applicability to covered content and terminal authority to disjoint host-admitted composition,
          exact-head/named-target approval, head-bound checks, base-CI parity, and the disclosed provider race.

    - `[x]` **4.5.b Remove lifecycle serialization from concurrent-work doctrine**
        - Made each terminal boundary independently classify disjoint, overlapping, or unknown movement; removed the
          designated merge locus and refresh sweep while retaining explicit dependencies and host-side queues.

    - `[x]` **4.5.c Align the review-increment exception and integration workflow wording**
        - Bound the reconcile exception to complete host evidence, disclosed overlap, Tier 1, fresh checkpoint
          applicability, and exact-head approval; narrowed clearance invalidation to the overlapping merge arm.

- _Outcome:_ always-loaded rules, integration doctrine, concurrent-work guidance, and executing workflow prose now
  share one content-based terminal policy without lifecycle-wide serialization.

### `[x]` **4.6 Exercise integration slice** — D3-D11, D14-D16 — validate exit criterion at segment scope

- _Goal:_ one executable scenario family demonstrates that the composed integration slice removes disjoint waiting
  without turning unknown, overlapping, stale, failed, or host-refused evidence into authority.

- _Outcome:_ the executable integration family proves direct disjoint approval and exact merge, one bounded reconcile
  for overlap or host currentness, three-member chain preservation with the custom driver disabled, Errand direct
  merge with resumable checks, and exact confirmation after ambiguous mutation. Unknown, stale, failed, conflicting,
  and host-refused variants retain typed coordinates, diagnostics, and safe remedies across JSON and interactive
  projections without acquiring authority.

### `[x]` **4.7 Close the concurrent-integration member** — D3-D11, D14-D16 — validate criteria at member scope

- _Goal:_ Member 2's criteria are validated against its terminal-operation, delivery, review, workflow, and doctrine
  evidence before the scoped-verification member lands.

- _Outcome:_ Member 2 criteria report.

    - _Criteria slice:_ `Success Criteria > Member 2 — concurrent-integration`.
    - _Span:_ bounded diff `effb42974..4742e3ed5`; cumulative reachability `4742e3ed5` at tree `cb67efedd`;
      boundary-order deviation: none.
    - _Criterion:_ `Success Criteria > Member 2 — concurrent-integration > 1`; _criterion-digest:_
      `sha256:00a73f3ec0279c6dc519a3a1dd2d02e93c479ac0bf9c8a6d8094fcf8fea053a2`; _State:_ `[x]`; _Evidence:_
      checkpoint movement planning and terminal checkpoint composition carry exact disjoint Git and host evidence
      directly to approval; focused tests prove no reconcile, re-judgment, or recompose action is emitted.
    - _Criterion:_ `Success Criteria > Member 2 — concurrent-integration > 2`; _criterion-digest:_
      `sha256:e438666a5795f44e0d5e1e5d092083a23636bd4ec356792944deab4f2ae2175e`; _State:_ `[x]`; _Evidence:_
      checkpoint and merge planning select one typed reconcile for complete overlap or strict-currentness evidence,
      retain the bounded regenerable remedy, and stop on substantive conflict or incomplete evidence.
    - _Criterion:_ `Success Criteria > Member 2 — concurrent-integration > 3`; _criterion-digest:_
      `sha256:22401bddcbe865761ae37c51ae6af2278883ddf766f857f2fdfa3640f6469db1`; _State:_ `[x]`; _Evidence:_
      closed terminal result unions distinguish host refusal, unavailability, operation failure, uncertain mutation,
      and changed coordinates; exact confirmation settles success or preserves both diagnostics without replay.
    - _Criterion:_ `Success Criteria > Member 2 — concurrent-integration > 4`; _criterion-digest:_
      `sha256:1fbaf3b4039f8fd667c70014c1eb66e8c471ea56c4987710ff0b1633e70153d3`; _State:_ `[x]`; _Evidence:_
      delivery eligibility, predecessor relation, materialization, and terminal integration retain distinct tips and
      chain bases; the real unlinked three-member exercise proves one-sided landing, competing-render refusal,
      regenerable terminal reconciliation, and interacting-predecessor refusal with the custom driver disabled.
    - _Criterion:_ `Success Criteria > Member 2 — concurrent-integration > 5`; _criterion-digest:_
      `sha256:9d2ea1a9e5c7792699c2d8b8914799fc86721019b46591b7e86fd1db0f258dd8`; _State:_ `[x]`; _Evidence:_
      checkpoint delivery composition classifies drift from the durable Candidate before currentness, uses the
      shared versioned record for explicit-base projections, and refuses persistence with a typed recompose result
      when the record version moves.
    - _Criterion:_ `Success Criteria > Member 2 — concurrent-integration > 6`; _criterion-digest:_
      `sha256:c07e55b326c5933edf0764996c85ec98282709870a617707213dfd5c84462bc6`; _State:_ `[x]`; _Evidence:_
      review-status composition retains a settled attempt across disjoint movement and routes overlap or unavailable
      evidence through the exact checkpoint continuation with preserved coordinates, detail, and terminal reason.
    - _Criterion:_ `Success Criteria > Member 2 — concurrent-integration > 7`; _criterion-digest:_
      `sha256:5f78f2fb4e03af820cb133648dfcc33dbea3a8eb0bbfc6bc7c085aee905b948a`; _State:_ `[x]`; _Evidence:_
      work-unit and Errand merge composition bind approved head, named target, repository, method, and host policy;
      both confirm the exact request, disclose the provider race, and the Errand path requires bounded judgment and
      direct merge without a native auto-merge arm.
    - _Criterion:_ `Success Criteria > Member 2 — concurrent-integration > 8`; _criterion-digest:_
      `sha256:101b6fa864dd672e6bc4a6cfc1414d02cfcfb444a4e9a88a494c05f79a099c71`; _State:_ `[x]`; _Evidence:_
      one-shot required-check observation returns pending or unavailable with the same idempotent checkpoint action;
      terminal merge tests prove failed or moved-head bindings invalidate, re-lock, and retain actionable remedies.
    - _Criterion:_ `Success Criteria > Member 2 — concurrent-integration > 9`; _criterion-digest:_
      `sha256:b6965adc194684e923088f8194344211926d778f87c10f70ed31fc3b9ac44d11`; _State:_ `[x]`; _Evidence:_
      `assess-evidence-applicability` is classified, installed, manifest-registered, reverse-indexed, and inventoried;
      workflow and doctrine contract tests prove typed dispatch, marked fire-points, and no ARC policy engine or queue.
    - _Adversarial companion:_ not run; the Heavy-class neutral offer was delegated to agent judgment, and the focused
      segment exercise plus the composed suite exposed no unresolved criterion warranting a third pass.
    - _Summary:_ nine met, zero superseded, zero unresolved. Success Criteria markers remain unchanged.

## **Phase 5:** Scoped Candidate verification

**Delivery member:** 3 — `scoped-verification`

_Purpose:_ let Candidate convergence scale to an optional approver-bound verification scope while omission preserves
the existing full-verification behavior.

_Mode:_ `slice` — closes on exercisable scoped convergence over constructed Candidate transitions.

_Exit criterion:_ targeted, focused, full, missing-field, and unexplained-delta lineages produce their specified
currentness and attestation outcomes without requiring the separately owned proposal-side producer.

### `[x]` **5.1 Extend review-response evidence with optional approved scope** — D12

- _Goal:_ a Candidate transition can carry the approver-bound verification scope when supplied, while older and
  independently produced transitions continue to parse and conservatively require full verification.

    - `[x]` **5.1.a Add the optional transition field and identity binding**
        - Added the optional closed scope to the schema, constructor input, and canonical response preimage; all three
          values round-trip distinctly and malformed scope fails before construction.

    - `[x]` **5.1.b Preserve independent landing compatibility**
        - Managed-record parsing, serialization, and constructed-transition coverage accept both scoped and omitted
          records without changing the sibling-owned writer or adding compatibility machinery.

- _Outcome:_ review-response transitions can bind an approved verification scope into their identity while omission
  remains a valid independently landable input for the conservative lineage default.

### `[x]` **5.2 Define the scoped lineage-attestation contract** — D12

- _Goal:_ the record contract can represent exactly which fresh convergence evidence was supplied before any reducer,
  currentness projection, or attest operation consumes it.

- _Outcome:_ lineage attestations now require `focused | full` scope in their strict schema and canonical bytes;
  record guards reject narrower evidence at an approved full subject while accepting full evidence for either scope.
  Existing construction sites write explicit full scope without aliases, migration readers, or a second identity.

### `[x]` **5.3 Reduce convergence across scoped lineage attestations** — D2-D3, D12

- _Goal:_ every Candidate currentness consumer derives convergence satisfaction and pending scope from one lineage
  reducer, including targeted fixes that advance an already attested baseline.

    - `[x]` **5.3.a Walk attestations and transitions as one lineage**
        - The durable reducer applies subject-bound attestations before later responses, composes every response through
          the shared approved-fix envelope and verification reducer, and retains the broadest pending requirement.

    - `[x]` **5.3.b Project the single result through currentness**
        - Currentness, effective targets, delivery, lifecycle, checkpoint, status, and pre-publication requests now
          share the closed satisfied/null or pending/focused|full projection and reject impossible pairs.

- _Outcome:_ targeted evidence carries established satisfaction, focused and full requirements close only through
  sufficiently broad subject attestations, and omitted scope conservatively projects full. A cycle-free Candidate
  evidence contract lets the lineage invoke the shared reducer without duplicating the scope decision.

### `[ ]` **5.4 Enforce focused and full attestation semantics** — D12

- _Goal:_ only evidence at least as broad as the pending approved scope can satisfy Candidate convergence, and the
  operator receives the correct bounded or full verification action.

- **Additional Context:** `notes-evidence-applicability.md` § Scoped verification decisions

    - `[ ]` **5.4.a Extend the typed attest operation**
        - Add `--scope focused | full` with default `full` and a convergence-only
          `--verification-evidence-ref <reference>` through `verbs/attest.ts`, `AttestOptions`,
          `AttestCommandInputSchema`, the input-policy mapping, Commander registration, handler invocation and
          formatting, and scoped attestation argv helpers.
        - Require a fresh non-empty evidence reference before a convergence write; never substitute the root
          `tasks-{name}.md#verification` reference. Echo recorded scope and evidence on success.
        - Permit `focused` only for pending focused convergence, permit `full` for either pending scope, and refuse
          focused root/re-root or focused-against-full before write. Each refusal carries the Candidate and subject,
          requested and required scope, missing-evidence state when applicable, and the exact focused/full
          verification action.
        - Build `test-first` (one behavior at a time):
            - omitted scope records `full` only when fresh convergence evidence is supplied;
            - focused and broader full evidence satisfy focused convergence and echo the recorded binding;
            - missing evidence, focused-against-full, and focused root/re-root refuse without a write; and
            - verb, record guard, JSON, and interactive projections preserve the required scope, decisive
              coordinates, evidence requirement, and corrective action.

    - `[ ]` **5.4.b Project the scoped verification request**
        - Extend `RunConvergenceVerificationActionSchema`, `pre-publication-procedure.ts`,
          `pre-publication-request.ts`, and `pre-publication-composition.ts` so the typed action carries the required
          scope and verification kind, names one bounded focused check or today's Tier 3 full check, and gives the
          exact scoped attest syntax once that check yields its evidence reference. Targeted produces no convergence
          action.
        - Update both copies of `prepare-work-unit.md` only where they render the typed action; keep selection logic
          inside the CLI and add workflow pin coverage. Leave `verify-work-unit.md` on its existing full root/re-root
          procedure because it has no convergence-action fire-point.
        - Build `test-first` (one behavior at a time):
            - focused and full pending states emit their bounded and Tier 3 actions;
            - targeted emits no convergence action; and
            - an omitted transition field requests full verification; and
            - request/action schemas reject impossible status/scope pairs and preserve the evidence-ref requirement.

### `[ ]` **5.5 Record the verification-authority amendment** — D13

- _Goal:_ the architectural record identifies the disposition approval as scope authority without weakening the
  Candidate root attestation or its subject-digest applicability.

    - Add a dated Tier 2 annotation under § Amending This Document in
      `adr-034-use-windowed-landing-around-agentic-review.md`, stating the stable authority relationship rather than
      implementation or work-unit history.
    - Run focused ADR references and Markdown checks after the annotation.

### `[ ]` **5.6 Exercise the scoped-verification slice** — D2-D3, D12-D13 — validate exit criterion at segment scope

- _Goal:_ constructed Candidate lineages demonstrate every scoped-verification outcome without depending on the
  separately owned proposal-side producer.

    - Exercise targeted after a satisfied root and after an attested focused response; both remain satisfied on the
      transition's Tier 1 evidence.
    - Exercise focused pending-to-attested convergence and full pending-to-Tier-3 convergence with fresh evidence
      references, including a broader full attestation satisfying focused.
    - Exercise missing convergence evidence, focused-against-full, focused root/re-root, impossible status/scope
      pairs, and missing-field fallback to full through both JSON and interactive results.
    - Exercise an unexplained delta to confirm it still establishes a fresh root and repeats the criteria walk.

### `[ ]` **5.7 Close the scoped-verification member** — D2-D3, D12-D13 — validate criteria at member scope

- _Goal:_ Member 3's criteria are validated from constructed transition, lineage, attest, workflow, and ADR evidence
  without claiming that scoped production behavior is active before the sibling-owned producer lands.

- _Note:_ Run `validate-criteria` over `Success Criteria` § Member 3 — `scoped-verification` and record the
  member-scope report without changing criterion markers.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ the complete work-unit Candidate is proven against every grouped criterion, cross-member seam, quality
  gate, and integration-readiness obligation before publication begins.

---

## Success Criteria

### Member 1 — `applicability-substrate`

- `[ ]` One path-treatment registry supplies equivalent classifications to every existing caller, preserves the
  bounded `regenerable` set, and treats the complete identity-bound own-WU planning group as non-evidence-bearing for
  Candidate implementation review regardless of storage mode while foreign WU and shipped implementation content
  remains reviewable.
- `[ ]` Every producer composes a total evidence-delta envelope, and one exhaustive reducer returns only `carries`,
  `supplemental`, or `fresh`; impossible cross-axis combinations are rejected, evidence-relevant unknown,
  unavailable, or over-bound inputs remain conservative, and cause-inapplicable axes stay inert.
- `[ ]` The unused review-applicability module, schema inventory row, and tests are removed without disturbing the
  unrelated `applicabilityId` contract.

### Member 2 — `concurrent-integration`

- `[ ]` Disjoint singleton movement with exact Git feasibility and bound host admission reaches approval without a
  base reconcile, re-judgment, or recompose.
- `[ ]` Overlapping clean movement and host-required currency take one typed reconcile when evidence is complete;
  regenerable-only conflict reuses the bounded remedy, while substantive conflict and incomplete evidence stop.
- `[ ]` Opaque host refusal, unavailable admission, established operational failure, uncertain mutation, and changed
  coordinates retain distinct typed exits; exact confirmation settles ambiguous mutating responses, retry cannot
  duplicate the effect, and neither distance nor provider-specific vocabulary invents a policy cause.
- `[ ]` Delivery eligibility carries the observed protected-base tip, real chain base, and predecessor relation
  separately; close revalidates their exact relation, initial and suffix materialization preserve the chain base, an
  admitted nonterminal keeps its chain-baseline readiness entry and lands one-sided with the custom driver disabled,
  a competing nonterminal render refuses, and terminal dual-sided conflict routes through D5 while interacting
  movement still refuses.
- `[ ]` Terminal drift classification reaches the durable Candidate baseline before currentness, shares one versioned
  record across explicit-base projections, and returns a typed recompose result if that version moves before
  checkpoint persistence.
- `[ ]` Review status carries disjoint base movement and reruns only for overlapping or unknown movement, preserving
  exact coordinates, overlap or unavailability detail, and an executable checkpoint continuation or explicit
  terminal explanation.
- `[ ]` Work-unit and Errand terminal operations authorize the exact approved head into the named target ref under
  configured host policy, disclose the residual provider race, and confirm the exact merged request on success;
  Errands return bounded residual judgment for fresh approval and use direct merge rather than native auto-merge.
- `[ ]` Pending or unavailable required checks promptly return an idempotent checkpoint continuation without polling;
  failed checks and stale bindings invalidate and re-lock with actionable remedies.
- `[ ]` The residual-judgment method is classified, installed, manifest-registered, reverse-indexed, and represented
  in the package-project inventory; shipped workflows dispatch only typed results, load it only at marked fire-points,
  and state integration and concurrency doctrine without an ARC-side policy or queue.

### Member 3 — `scoped-verification`

- `[ ]` Constructed Candidate transitions prove targeted inheritance, focused attestation, full verification,
  fresh convergence-evidence binding, missing-field fallback to full, and unchanged unexplained-delta behavior.
- `[ ]` One closed convergence shape prevents impossible status/scope pairs, and every currentness consumer derives
  satisfaction and pending scope from the same lineage reducer after each response crosses Member 1's `approved-fix`
  producer and shared verification reducer; no second scope table exists.
- `[ ]` The attest verb and record guards accept evidence at least as broad as the pending convergence scope, reject
  missing evidence, and reject `focused` requests at root, re-root, or against a full-pending baseline before write.
  JSON and interactive results preserve actionable scope, coordinate, evidence, and remedy detail.
- `[ ]` ADR-034 records the approver-bound scope authority without changing the Candidate root attestation or its
  subject-digest applicability.

### Cross-member seams

- `[ ]` Each delivery member is independently landable in order; the verification member consumes but does not
  duplicate or wait for `review-signal-convergence`'s proposal-side producer.
- `[ ]` All mandatory lifecycle rows and external-seam authority claims are exercised at the earliest member boundary
  that can observe them, with union and seam coherence retained for terminal verification.
- `[ ]` Every non-success variant in the enumerated changed public-operation inventory preserves a stable semantic
  reason, useful sanitized detail and decisive coordinates, plus executable structured remedy argv or an explicit
  terminal explanation; JSON and interactive projections agree, and no adapter error is swallowed or stranded in
  logs.
- `[ ]` All quality gates pass, including both type checks, the full test suite, Markdown lint, and ARC contract checks.
- `[ ]` Ready for integration.
