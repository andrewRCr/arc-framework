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

### `[ ]` **2.1 Add orthogonal base-movement classification** — D4

- _Goal:_ base drift reports path interaction independently of its distance verdict, allowing aware consumers to
  distinguish harmless movement while unaware consumers retain their current fail-closed behavior.

    - `[x]` **2.1.a Produce `movement` from the existing overlap read**
        - Added the orthogonal `disjoint | overlapping | unknown` result projection beside the existing overlap read;
          unavailable and skipped readings continue to omit it, and authoritative materialization preserves it.
        - Test-first coverage proves incomplete integration evidence does not prevent `disjoint`, any substantive path
          yields `overlapping`, unavailable overlap yields `unknown`, and clean readings are `disjoint`.

    - `[ ]` **2.1.b Carry movement without changing verdict dispatch**
        - Render the field through `composeBaseDriftRegister`, `arc base drift`, and the session-init value schema,
          requiring it on healthy readings and excluding it from not-applicable arms. Keep the raw verdict and
          `recommendedAction` enum unchanged, but replace the register's unconditional reconcile instruction with
          movement-aware text that delegates the integration continuation to the typed checkpoint.
        - Build `test-first` (one behavior at a time):
            - healthy command and session-init projections carry movement;
            - not-applicable arms omit it; and
            - every existing raw-distance verdict and recommendation action remains unchanged while disjoint,
              overlapping, and unknown register text names the correct checkpoint consequence.

### `[ ]` **2.2 Separate Git feasibility from provider-neutral host admission** — D5

- _Goal:_ checkpoint planning combines exact local merge feasibility with an independently authoritative host
  admission observation, without allowing either source to impersonate the other.

- **Additional Context:** `notes-evidence-applicability.md` § Applicability architecture and proportionality
  decisions; § Terminal integration decisions

    - `[ ]` **2.2.a Establish exact-pair Git feasibility**
        - Add a discriminated typed production boundary beside the existing merge-tree capability helpers that
          returns `clean | regenerable-conflict | substantive-conflict | unavailable` for one observed base/head
          pair. Carry the exact base/head on every arm, sorted unique conflict paths on conflict arms, and sanitized
          detail on unavailable; extract and reuse the merge-tree execution/path parsing now private to delivery
          contribution proof rather than duplicating it.
        - Build `test-first` (one behavior at a time):
            - clean merge-tree composition returns `clean`;
            - conflicts confined to registry-classified regenerable paths remain distinct;
            - any wider conflict is substantive; and
            - unsupported, malformed, or failed merge-tree evidence is unavailable with its coordinates and useful
              detail.

    - `[ ]` **2.2.b Define the semantic host-observation port**
        - Place `ChangeRequestMergeObservationPort` beside the existing provider-neutral change-request boundary,
          returning `mergeable | base-currentness-required | refused | unresolved` with exact coordinates and an
          optional opaque evidence reference. Require every non-positive arm to retain sanitized actionable detail;
          the evidence reference supplements rather than replaces it.
        - Build `test-first` (one behavior at a time):
            - positive and strict-currency observations must bind repository, request, base, and head;
            - unbound or mismatched observations become unresolved; and
            - core types expose no GitHub field name, HTTP code, or command detail while preserving enough semantic
              cause detail for the operation result to compose a useful retry or terminal explanation.

    - `[ ]` **2.2.c Implement the supported GitHub adapter**
        - Resolve native pull-request and test-merge data behind the port, validating the test-merge parents against
          the observed pair before returning `mergeable`. Reuse the required-check adapter's applicable branch and
          ruleset policy read to establish strict currentness from `required_status_checks.strict` or
          `strict_required_status_checks_policy`; never treat raw distance, a generic `BEHIND` value, or an opaque
          refusal as that policy. Keep actual merge-call refusal in Phase 4 and classify every unprovable read-side
          negative conservatively.
        - Implement one logical observation with at most three abortable adapter-internal re-reads while the provider
          computes its test merge. Revalidate the unchanged request and coordinates on each read; exhaustion returns
          `unresolved` with the last useful detail for the checkpoint's structured retry, never an agent-authored
          loop.
        - Build `test-first` (one behavior at a time):
            - exact test-merge parents establish resolved mergeability;
            - explicit applicable strict policy establishes `base-currentness-required`, while absent, ambiguous, or
              unreadable policy never does;
            - lagging, malformed, unavailable, stale-coordinate, or exhausted evidence is unresolved with actionable
              detail; and
            - success, early resolution, exhaustion, abort, and coordinate movement prove the three-read cap without
              workflow polling.

### `[ ]` **2.3 Compose the checkpoint action matrix and regenerable remedy** — D5

- _Goal:_ one checkpoint result selects the only authorized continuation for every movement, feasibility, admission,
  and evidence-completeness combination.

    - `[ ]` **2.3.a Replace the conflated reconcile fact with the closed matrix**
        - Replace `ReconcileHostFact` and `reconcileSafety` in `integration/checkpoint.ts` with exact Git-feasibility,
          host-admission, and applicability inputs plus typed results for direct approval, base reconcile,
          regenerable reconcile, host pending, host refusal, conflict, and unsafe reconcile.
        - Build `test-first` (one behavior at a time):
            - disjoint + clean + mergeable requests approval directly;
            - a reducer carry is not actionable unless the exact-pair Git-feasibility result is `clean`;
            - overlapping + clean + mergeable reconciles only with complete integration evidence;
            - `base-currentness-required` maps clean movement to base reconcile and regenerable-only conflict to its
              own reconcile arm;
            - substantive conflict blocks; and
            - unknown, unavailable, unresolved, mismatched, or incomplete evidence never carries, and every
              non-success result preserves the decisive coordinates, useful detail, and one structured remedy or
              explicit terminal explanation.

    - `[ ]` **2.3.b Bind production observations to one checkpoint invocation**
        - Rework `checkpoint-composition.ts` to resolve the exact open request, drift observation, Git feasibility,
          and one logical host admission observation once and reject any coordinate disagreement before invoking the
          planner. Memoize the exact request within that invocation for later ready composition rather than resolving
          it a second time.
        - Build `test-first` (one behavior at a time):
            - all admitted facts share the checkpoint's exact coordinates;
            - a mismatched observation refuses before planning;
            - handler JSON and prose render the new reasons, movement, endpoints, and remedies; and
            - session-init remains host-read-free.

    - `[ ]` **2.3.c Reuse the bounded readiness-projection conflict remedy**
        - Extend the typed base-merge composition so `reconcile-regenerable` invokes
          `applyRoadmapConflictAutoRemedy` only when its existing eligibility guard proves the project readiness
          document is the sole conflict. Bind the attempt to the checkpoint's exact `expectedHead` and
          `expectedBase`, render from the candidate index under that observation, and accept `applied` only when the
          render is determinate and its staged bytes and exact `[expectedHead, expectedBase]` merge parents revalidate.
          On coordinate movement, indeterminate render, skipped, failed, wider, commit, or verification failure,
          abort and prove restoration of the pre-merge head and tree.
        - Build `test-first` (one behavior at a time):
            - the sole regenerable conflict is determinately regenerated from the exact candidate index, staged,
              committed with the bound parents, and returned through the existing Tier 1, push, and recheckpoint
              handoff;
            - a moved parent, indeterminate render, wider conflict, skipped/failed remedy, unavailable eligibility
              read, or malformed merge result refuses with useful detail; and
            - every non-success arm aborts cleanly and restores the exact pre-merge state.

## **Phase 3:** Delivery and review applicability

**Delivery member:** 2 — `concurrent-integration`

_Purpose:_ let delivery eligibility and review status distinguish disjoint target movement before ordinary downstream
currentness and merge authority are re-established.

### `[ ]` **3.1 Admit disjoint protected-base movement in delivery eligibility** — D7

- _Goal:_ a delivery member remains eligible when the live target advanced without touching its contribution, while
  recorded predecessor coordinates and every interacting-movement refusal remain authoritative.

    - `[ ]` **3.1.a Classify the bottom member against the observed target**
        - Extract one provider-neutral exact-revision overlap primitive that accepts two explicit revisions plus
          explicit WU treatment context (or an unbound context), and returns the merge-base with the D1 overlap or
          precise no-common-ancestor/unavailable detail. Keep `analyzeBaseOverlap` as its base-drift wrapper; neither
          primitive reads ambient `HEAD` or infers WU identity.
        - Add `predecessorRelation(member, observedTip)` with `exact | disjoint-ahead | overlapping-ahead |
          unrelated` outcomes that retain the exact observed tip, chain base or merge-base, overlap, and detail each
          arm establishes.
        - Build `test-first` (one behavior at a time):
            - an ancestor tip is exact;
            - empty substantive intersection is disjoint ahead;
            - any substantive intersection is overlapping ahead; and
            - no common ancestor is unrelated; and
            - explicit non-`HEAD` revision pairs and both WU-bound and unbound treatment contexts produce the same
              deterministic overlap facts through the shared primitive and wrapper.

    - `[ ]` **3.1.b Preserve lifecycle contribution across regenerable movement**
        - Extend `compareDeliveryLifecycleContribution` and `compareNormalizedDeliveryTree` so a `disjoint-ahead`
          member reads registry-classified regenerable entries from `chainBase`, while every other lifecycle path
          remains compared with `protectedBase`. Require every disposable nonterminal member's regenerable entry to
          equal that chain baseline; this lifecycle-neutral invariant admits a sibling-only readiness update as an
          ordinary one-sided host merge and rejects a member-authored competing render.
        - Update both Git adapters and every direct caller. Preserve `chain-containment.ts` by supplying its already
          closed common base for both coordinates rather than imposing delivery-eligibility semantics on that path.
          Preserve the invariant through initial materialization, pre-binding review-target composition, suffix
          rematerialization, and ordinary nonterminal landing. Route a terminal dual-sided readiness conflict through
          D5's exact-parent `reconcile-regenerable` arm and fresh approval.
        - Build `test-first` (one behavior at a time):
            - a sibling-only readiness regeneration stays eligible and lands with the custom merge driver disabled;
            - a nonterminal member that changes readiness relative to `chainBase` refuses with the exact path;
            - a terminal candidate and base carrying divergent readiness renders take D5's typed remedy;
            - another lifecycle-path change still refuses; and
            - exact predecessor behavior and chain-containment's common-base comparison remain unchanged across all
              comparator call sites.

    - `[ ]` **3.1.c Preserve observed-tip and chain-base authority through materialization**
        - Carry `protectedBase`, `chainBase`, and `predecessorRelation` separately through
          `prepareDeliveryEligibility`, eligibility close, and the handler snapshot schema. Treat the round-tripped
          snapshot as untrusted: close reobserves the protected and member refs, recomputes the exact relation and
          merge-base, and rejects caller-altered or stale facts before completeness or mutation.
        - Update initial materialization, pre-binding review-target composition, and suffix rematerialization so the
          chain base is persisted as the real predecessor while the observed tip is independently verified as the
          protected-ref snapshot; suffix work compares the chain base with the persisted target, and nonterminal
          delivery projections cannot introduce a new regenerable entry.
        - Build `test-first` (one behavior at a time):
            - exact and disjoint relations preserve distinct observed-tip and chain-base coordinates through the
              handler schema and initial materialization;
            - suffix rematerialization accepts the persisted chain base while still detecting observed-tip movement;
            - a tampered relation, merge-base, or chain base and movement between prepare and close refuse before
              mutation, with moved source returning the exact re-prepare action; and
            - pre-binding composition preserves caught failure detail instead of collapsing it to an unexplained
              evidence-unavailable token.

    - `[ ]` **3.1.d Align eligibility and terminal refusal contracts**
        - Add the terminal classifier's `disjoint / continue` arm, exclude regenerable paths from predecessor
          overlap, preserve persisted delivery coordinates on every eligibility arm, and keep terminal
          regenerable-conflict routing distinct from nonterminal lifecycle neutrality.
        - Make `wrong-predecessor` distinguish `overlapping-ahead` from `unrelated`, retaining exact coordinates,
          merge-base and overlap paths when present, and useful sanitized detail. Explain that the separately owned
          chain rebuild is required and that this work unit supplies no safe automated rebuild command.
        - Build `test-first` (one behavior at a time):
            - all four predecessor relations flow through eligibility without mutating persisted coordinates;
            - inert-only terminal overlap continues while a real terminal readiness conflict returns the typed D5
              continuation; and
            - overlapping, unrelated, and predecessor-overlap refusals remain distinct and give the agent decisive
              evidence plus an executable remedy or explicit terminal explanation.

### `[ ]` **3.2 Classify terminal delivery drift from the durable Candidate baseline** — D7

- _Goal:_ the terminal classifier reaches the evidence that determines base-movement applicability before requiring
  currentness against the very base advance it is classifying.

- **Additional Context:** `notes-evidence-applicability.md` § Delivery drift classifier-ordering field evidence

    - `[ ]` **3.2.a Separate the versioned Candidate record from effective currentness**
        - Refactor `checkpoint-composition.ts` around one invocation-local, versioned managed-record read per work
          unit and separate effective projections keyed by work unit plus explicit base revision. Remove the implicit
          `candidateBaseRevisions` binding/sentinel and pass the authoritative base revision to every projection,
          including `composeReady`.
        - Immediately before `createHandle` persists the create-only checkpoint, re-read only to assert the managed
          record version. Return a typed recompose result with expected and observed versions if it moved; never mix
          record versions within one checkpoint.
        - Build `test-first` (one behavior at a time):
            - classification and downstream projections perform one record read and consume the same version;
            - distinct base revisions receive distinct effective projections; and
            - a record-version change immediately before checkpoint persistence returns the typed recompose result
              without writing a handle.

    - `[ ]` **3.2.b Reorder the delivery drift decision**
        - Resolve the durable baseline revision with `reduceCandidateDurableBaseline`, return the disjoint continuation
          after record and overlap validation, and compute residual/predecessor intersections only on overlapping
          movement before the ordinary effective-currentness gate runs.
        - Preserve the exact baseline, base, merge-base, and path evidence or the most specific sanitized failure
          detail on every non-success result, with a structured next action or explicit terminal explanation.
        - Build `test-first` (one behavior at a time):
            - a real three-member unlinked sequential delivery whose first member lands with the custom readiness
              merge driver disabled reaches downstream gates on empty overlap even while the next Candidate is not
              current against the advanced base, preserving every reviewed nonterminal head;
            - interacting predecessor paths retain their refusal; and
            - malformed records, unresolved revisions, and unreadable diffs remain unavailable.

### `[ ]` **3.3 Apply overlap-aware carry in review status** — D8

- _Goal:_ review status invalidates an earlier attempt only when fresh base movement overlaps its subject or cannot
  be classified, never because containment alone failed.

    - `[ ]` **3.3.a Compose a direct base-movement observation**
        - Extend `readBasePosition` in `status-composition.ts` to retain its base fetch and containment read, ensure
          the exact reviewed head is locally resolvable, and call the shared exact-revision overlap primitive with
          treatment context derived from the resolved review subject rather than the active checkout.
        - Adapt the exact repository, change request, head, observed base, and overlap directly to
          `BaseMovementObservation` without manufacturing a base-drift result, D4 relation, or ambient WU identity.
        - Build `test-first` (one behavior at a time):
            - disjoint non-containment reduces to carry;
            - overlapping non-containment and unavailable overlap retain their exact classification; and
            - an exact reviewed head absent locally is fetched or returns precise unavailability without substituting
              another revision.

    - `[ ]` **3.3.b Project the typed status result**
        - Deterministically return `base-moved / rerun-checkpoint` for overlapping or unknown movement without
          invoking `assess-evidence-applicability`; disjoint movement retains the attempt and contained-head behavior
          stays unchanged. The actual reconciled checkpoint subject owns any later bounded-residual judgment.
        - Carry movement, exact coordinates, overlap paths or precise unavailability detail through `status.ts` and
          the handler, together with a structured return-to-checkpoint action or an explicit terminal explanation
          when target-only status cannot safely construct one.
        - Build `test-first` (one behavior at a time):
            - disjoint movement retains the attempt and renders its classification;
            - overlap and unknown movement rerun the checkpoint without a method fire-point and preserve actionable
              diagnostics; and
            - a contained head preserves today's result.

## **Phase 4:** Terminal integration operations and doctrine

**Delivery member:** 2 — `concurrent-integration`

_Purpose:_ carry the checkpoint policy through the exact approved-head release, prompt CI continuation, Errand lane,
and shipped procedural guidance.

_Exit criterion:_ disjoint work-unit, delivery, review, and Errand scenarios proceed without lifecycle serialization;
overlap, stale bindings, failed checks, opaque refusals, and unavailable evidence retain their typed safe exits.

### `[ ]` **4.1 Revalidate and classify terminal host merge outcomes** — D6

- _Goal:_ terminal release acts only on the exact approved head and current typed plan, while host policy, opaque
  refusal, uncertain mutation, and established operational failure retain distinct provider-neutral exits.

- **Additional Context:** `notes-evidence-applicability.md` § Applicability architecture and proportionality
  decisions

    - `[ ]` **4.1.a Expand the terminal result and remedy contracts**
        - Extend `integration/merge.ts` with semantic outcomes for `head-moved`, `base-currentness-required`,
          `host-refused`, `host-pending`, `merge-outcome-unknown`, and confirmed merge success while retaining the
          existing invalidation and established-operation-failure contracts.
        - Build `test-first` (one behavior at a time):
            - every definitively unapproved post-release exit re-holds the exact target, while uncertain mutation
              neither claims failure nor re-locks solely from uncertainty;
            - opaque refusal never selects reconciliation; and
            - only independently established currency policy plus complete evidence returns the typed base reconcile;
              every other exit retains its exact coordinates, sanitized cause detail, and structured next step or
              explicit terminal explanation.

    - `[ ]` **4.1.b Re-run the shared plan immediately before mutation**
        - Expand `readFinalDrift` into the exact D2/D3/D5 observation and planner, invoking one complete observation
          before the host call. After a definitive refusal, reuse the adapter's semantic result and reobserve only
          the target coordinates needed to rerun the planner; invalidate a changed head, base, request identity,
          lifecycle, settlement, or merge method.
        - Build `test-first` (one behavior at a time):
            - disjoint direct release survives unchanged reobservation;
            - pre-call movement or admission mismatch invalidates;
            - strict-host evidence selects reconcile; and
            - unresolved or opaque refusal never derives cause from `behind` or repeats the full host observer.

    - `[ ]` **4.1.c Keep native semantics inside the pinned-merge adapter**
        - Classify GitHub responses behind `mergePinned`, pin only the approved head the API supports, and confirm that
          the exact change request and head merged into the named target; return the provider merge identity when
          available. After any timeout, transport failure, or malformed response to the mutating request, perform the
          same exact confirmation before classifying the result.
        - Build `test-first` (one behavior at a time):
            - native head movement, authoritative currency refusal, and opaque refusal remain distinct;
            - confirmed exact merge after an ambiguous response returns success;
            - confirmed-unmerged evidence returns the narrowest established non-success and re-holds the target;
            - unavailable confirmation returns `merge-outcome-unknown` with mutation and confirmation diagnostics,
              preserves the exact checkpoint approval, and does not re-lock;
            - replay first resolves the exact merged state and cannot duplicate the mutation; and
            - no confirmation or adapter failure is swallowed; and
            - successful confirmation returns the exact merged request and provider identity despite the disclosed
              observation-to-atomic-merge base race.

    - `[ ]` **4.1.d Make the external-seam authority visible**
        - Add the exact head, change request, target ref, last observed base OID, configured-host-policy boundary, and
          residual in-call race to the checkpoint approval surface; keep terminal success confirmation explicit
          without claiming a base-OID pin or exact-pair required-check evidence.
        - Build `test-first` (one behavior at a time):
            - approval text names every authorized and observed coordinate;
            - the residual race and host-policy boundary are present; and
            - no surface describes head-bound checks as exact-pair evidence.

### `[ ]` **4.2 Return prompt checkpoint continuations for required checks** — D16

- _Goal:_ a terminal merge with unsettled CI returns control after one observation and can resume idempotently from
  the same authorization once external checks advance.

- **Additional Context:** `notes-evidence-applicability.md` § Terminal checks-wait field evidence;
  § Terminal integration decisions

    - `[ ]` **4.2.a Extract one required-check observation**
        - Refactor `checks-await.ts` around a coordinate-only observation input (`repository`, pull request, exact
          `headSha`) plus injected port and abort signal. Its closed result owns required-row aggregation,
          stale-target and target-mismatch detection, failed details, pending, unavailable, green, and not-required;
          keep timing policy and `elapsedMs` only on `awaitRequiredChecks`, which composes the observer through
          `boundedWait` for callers that explicitly await.
        - Build `test-first` (one behavior at a time):
            - each observation kind is complete and head-bound;
            - pending can retain already-failed diagnostic rows without becoming green; and
            - unavailable preserves actionable sanitized provider detail and abort/deadline cause; and
            - the explicit await wrapper retains bounded polling and elapsed-time behavior independently.

    - `[ ]` **4.2.b Replace integration polling with the continuation contract**
        - Remove the integration-specific ten-minute budget and poll interval from `merge-composition.ts`, invoke one
          observation, and extend `awaiting-checks` with the checkpoint handle, approved target, observation kind,
          current rows, diagnostic failures, and exact structured retry argv while removing `elapsedMs`.
        - Build `test-first` (one behavior at a time):
            - pending and unavailable keep the checkpoint, approval, and draft lock;
            - failed checks and stale coordinates invalidate and re-lock; and
            - no merge invocation calls `sleep`, `boundedWait`, or recursively retries;
            - the same retry later observes green and merges; and
            - an already-merged exact target settles successfully without duplicating effects;
            - the checks command's JSON result and workflow presentation preserve the same typed detail.

### `[ ]` **4.3 Add the typed Errand terminal merge operation** — D9

- _Goal:_ the Errand lane receives the same evidence and host-policy behavior as work-unit integration through one
  typed operation, with no workflow-authored state machine.

- **Additional Context:** `notes-evidence-applicability.md` § Terminal integration decisions

    - `[ ]` **4.3.a Define the exact Errand merge request and result**
        - Add an operation module distinct from the existing per-slug storage merge, binding the current Errand
          identity, approved target, selected lane, head, change request, merge method, and retry authority.
        - Build `test-first` (one behavior at a time):
            - the closed result covers `merged`, `awaiting-checks`, `applicability-judgment-required`,
              `reconcile-base`, `reconcile-regenerable`, `conflict`, `host-pending`, `host-refused`,
              `invalidated`, `merge-outcome-unknown`, and `operation-failed`, with no native auto-merge arm;
            - every non-success result carries semantic reason, sanitized detail, decisive coordinates, and structured
              retry/remedy argv or an explicit terminal explanation; and
            - a changed target invalidates prior authorization.

    - `[ ]` **4.3.b Compose the final Errand state machine**
        - Inject current identity, final drift, Git feasibility, host admission, checks, merge method, lock, and
          provider ports; reuse the shared applicability/checkpoint planner for direct exact-head merge and typed
          base or regenerable reconcile. The regenerable arm consumes D5's exact-parent, determinate-render contract.
          Return a bounded applicability-judgment arm before mutation, prompt continuations for unsettled checks, and
          D6's exact confirmation semantics for an ambiguous mutating result.
        - Build `test-first` (one behavior at a time):
            - direct merge preserves exact-head authority and no path arms native auto-merge;
            - pending checks retain approval and lock;
            - bounded residual judgment returns before mutation and requires a fresh approved plan;
            - a strict host reconciles only with complete evidence, and a readiness-only conflict returns the
              regenerable result rather than a generic conflict or base reconcile; and
            - every definitively unapproved exit after lock release re-holds the exact target, while
              `merge-outcome-unknown` preserves approval and does not re-lock solely from uncertainty.

    - `[ ]` **4.3.c Publish `arc errand merge` through the CLI boundary**
        - Add the thin handler, Commander registration, input-policy declarations, JSON formatter, and focused unit/E2E
          coverage without extending the Errand lifecycle record or introducing another approval store.
        - Build `test-first` (one behavior at a time):
            - valid JSON input reaches the typed operation and preserves its result;
            - invalid identity, target, and lane inputs return typed refusals; and
            - interactive rendering uses the operation's precomposed detail, next action, and argv without swallowing
              adapter failures.

### `[ ]` **4.4 Wire typed terminal results and residual judgment through workflows** — D3, D6, D9-D11, D15

- _Goal:_ executing sessions invoke stable verbs and render precomposed outcomes, while the only agent judgment occurs
  at an explicit bounded-residual fire-point.

- **Additional Context:** `notes-evidence-applicability.md` § Terminal integration decisions

    - `[ ]` **4.4.a Ship the residual-judgment method**
        - Add `assess-evidence-applicability.md` to package source and the project mirror; register it in
          `src/lib/classification.ts`, `init-recipe.json`, the generated `.arc/system/.internal/manifest.json`, and
          both copies of `strategy-session-operations.md`'s method-trigger reverse index. Update the project-only
          configurable inventory/count in `strategy-package-project-sync.md`.
        - Constrain the method to `supplemental | fresh` recommendations over bounded non-base clean divergence or
          review/verification base-movement overlap, exclude merge safety, and keep every final deterministic row in
          the TypeScript reducer.
        - Build `test-first` (one behavior at a time):
            - classification and recipe membership agree;
            - init and reconfigure install the method in the applicable modes;
            - generated-manifest and configurable-inventory expectations include it; and
            - framework-sync proves every shipped pair that should match.

    - `[ ]` **4.4.b Convert integration and delivery workflows to typed dispatch**
        - Update both copies of `integrate-work-unit.md` and `deliver-stack.md` to invoke the checkpoint, terminal
          merge, and eligibility verbs once, render their supplied next action, and mark/declare the method only where
          the post-reconcile integration result or a delivery member-rewrite applicability result carries
          `judgmentRequired: true`. Mechanical eligibility, review status, and terminal-position classification stay
          deterministic and never fire the method.
        - Preserve exact-head integration approval, the native `queue-not-atomic` refusal, and all lifecycle and
          settlement bindings without comparing provider or movement fields in prose.

    - `[ ]` **4.4.c Convert the Errand workflow to the terminal verb**
        - Update both copies of `run-errand.md` so its advisory drift read stays advisory and its approved terminal
          step invokes `arc errand merge` once; declare `assess-evidence-applicability` and mark the judgment-required
          result's fire-point, returning through review/applicability and fresh integration approval before mutation.
          Remove raw provider merge commands, movement matrices, recursive polling, and lock-recovery mechanics from
          the prose. Preserve the existing release-only `arc merge lock release` route as the explicit separate
          operation because it authorizes no merge.
        - Add workflow pin tests and run method-trigger, section-reference, and package/project sync checks over every
          edited shipped surface.

### `[ ]` **4.5 Align integration authority and concurrent-work doctrine** — D14

- _Goal:_ the always-loaded rule and shipped strategies consistently state that evidence follows covered content,
  terminal overlap is reconciled once, and provider strictness comes only from configured host policy.

- _Note:_ Author every shipped edit in the reader-facing register: no work-unit names, planning identifiers, or
  transitional rationale may survive into package content.

    - `[ ]` **4.5.a Amend terminal integration doctrine**
        - Update both copies of `strategy-integration.md` with content-based applicability, the disjoint compose path,
          exact-head/named-target authority, the head-bound checks contract, base-CI backstop, and disclosed provider
          race.

    - `[ ]` **4.5.b Remove lifecycle serialization from concurrent-work doctrine**
        - Update both copies of `strategy-concurrent-work.md` so disjoint landings invalidate nothing, overlapping
          landings reconcile only at their terminal boundary, Errands use the same rule, and merge-queue guidance
          remains a host-side option rather than ARC machinery.
        - Remove the designated-merge-worktree and refresh-all-after-merge obligations whose rationale no longer
          survives the typed locus and applicability model.

    - `[ ]` **4.5.c Align the review-increment exception and integration workflow wording**
        - Amend both copies of `DEV-RULES.ARC.md` so a typed safe base reconcile carries the host-admitted,
          overlap-disclosed meaning while Tier 1, checkpoint judgment, and exact-head authorization remain mandatory.
        - Narrow both copies of `integrate-work-unit.md` from unconditional clearance invalidation to the overlapping
          base-merge arm and prove every package/project pair remains byte-aligned where the recipe requires it.

### `[ ]` **4.6 Exercise integration slice** — D3-D11, D14-D16 — validate exit criterion at segment scope

- _Goal:_ one executable scenario family demonstrates that the composed integration slice removes disjoint waiting
  without turning unknown, overlapping, stale, failed, or host-refused evidence into authority.

    - Exercise a disjoint singleton through direct checkpoint approval and confirmed exact-head merge.
    - Exercise an overlapping and a host-required-currentness case through exactly one typed base reconcile and fresh
      approval, plus a regenerable-only conflict through the bounded readiness remedy.
    - Exercise a real three-member unlinked delivery with the custom readiness merge driver disabled: land an
      ordinary nonterminal after sibling-only readiness regeneration without changing its reviewed head, reject a
      nonterminal competing render, route a terminal dual-sided render through `reconcile-regenerable`, and retain an
      interacting predecessor refusal.
    - Exercise an Errand direct merge and a pending-check continuation that later resumes green, recording the absence
      of workflow or CLI polling and native auto-merge.
    - Exercise an ambiguous mutating response through exact merged confirmation and through unavailable confirmation,
      proving retry settlement, preserved approval, both diagnostics, and no uncertainty-only re-lock.
    - Exercise the complete changed public-operation inventory—`arc base drift`, `arc base merge`,
      `arc integrate checkpoint`, `arc integrate merge`, delivery eligibility and terminal status,
      `arc review status`, required-check observation, `arc errand merge`, `arc attest`, and pre-publication action
      composition—through both JSON and interactive projections. For every non-success variant, assert the stable
      semantic cause, most specific sanitized detail, decisive coordinates, and executable structured remedy argv or
      explicit reason no safe automated continuation exists; no adapter exception may survive only in logs or a
      generic fallback.

### `[ ]` **4.7 Close the concurrent-integration member** — D3-D11, D14-D16 — validate criteria at member scope

- _Goal:_ Member 2's criteria are validated against its terminal-operation, delivery, review, workflow, and doctrine
  evidence before the scoped-verification member lands.

- _Note:_ Run `validate-criteria` over `Success Criteria` § Member 2 — `concurrent-integration` and record the
  member-scope report without changing criterion markers.

## **Phase 5:** Scoped Candidate verification

**Delivery member:** 3 — `scoped-verification`

_Purpose:_ let Candidate convergence scale to an optional approver-bound verification scope while omission preserves
the existing full-verification behavior.

_Mode:_ `slice` — closes on exercisable scoped convergence over constructed Candidate transitions.

_Exit criterion:_ targeted, focused, full, missing-field, and unexplained-delta lineages produce their specified
currentness and attestation outcomes without requiring the separately owned proposal-side producer.

### `[ ]` **5.1 Extend review-response evidence with optional approved scope** — D12

- _Goal:_ a Candidate transition can carry the approver-bound verification scope when supplied, while older and
  independently produced transitions continue to parse and conservatively require full verification.

- **Additional Context:** `notes-evidence-applicability.md` § Scoped verification decisions

- _Note:_ This task owns only the Candidate schema, constructor, guards, and tests. It does not edit the disposition
  producer or `respond-command.ts`; `review-signal-convergence` remains the sole owner of that pass-through.

    - `[ ]` **5.1.a Add the optional transition field and identity binding**
        - Extend `CandidateReviewResponseEvidenceV1Schema`, its input type, and
          `createCandidateReviewResponseEvidence` with `approvedVerification?: targeted | focused | full`, including
          the value in the `responseId` preimage when present.
        - Build `test-first` (one behavior at a time):
            - each supplied scope round-trips and changes response identity;
            - omission remains schema-valid and reduces as `full`; and
            - malformed or out-of-contract values fail before record write.

    - `[ ]` **5.1.b Preserve independent landing compatibility**
        - Update Candidate fixtures, record guards, serialization, and constructed-transition coverage without
          requiring a production writer to emit the field or adding a migration reader for development records.

### `[ ]` **5.2 Define the scoped lineage-attestation contract** — D12

- _Goal:_ the record contract can represent exactly which fresh convergence evidence was supplied before any reducer,
  currentness projection, or attest operation consumes it.

- **Additional Context:** `notes-evidence-applicability.md` § Scoped verification decisions

    - Add required `scope: focused | full` to `CandidateLineageAttestationV1Schema`, its constructor, canonical
      managed-record serialization, and record guard. Keep the existing attestation shape without minting a separate
      attestation ID; the containing record's bytes-version changes with scope and evidence.
    - Update every literal non-empty lineage-attestation fixture across unit, integration, and E2E suites in place,
      with no compatibility alias or migration reader for development records.
    - Build `test-first` (one behavior at a time):
        - focused and full attestations round-trip distinctly;
        - scope or evidence changes the canonical managed-record version;
        - missing scope is rejected; and
        - the record guard applies the same scope ordering at the attested subject, so a focused attestation cannot
          satisfy a full requirement while full may satisfy focused.

### `[ ]` **5.3 Reduce convergence across scoped lineage attestations** — D2-D3, D12

- _Goal:_ every Candidate currentness consumer derives convergence satisfaction and pending scope from one lineage
  reducer, including targeted fixes that advance an already attested baseline.

- **Additional Context:** `notes-evidence-applicability.md` § Scoped verification decisions

    - `[ ]` **5.3.a Walk attestations and transitions as one lineage**
        - Extend `reduceCandidateDurableBaseline` to recognize attestations at each running subject before applying a
          response and after the final transition. Compose every response through D2's `approved-fix` producer and
          invoke D3's shared reducer with verification evidence; map only its `carries | supplemental | fresh`
          verdict to inherited satisfaction, pending focused, or pending full. Do not reproduce an
          `approvedVerification` switch in the lineage reducer. Return the broadest pending requirement through one
          closed shape: `satisfied` with null scope or `pending` with `focused | full` scope.
        - Build `test-first` (one behavior at a time):
            - the D2/D3 result is the only scope-to-convergence decision and the transition fixtures cross the Member
              1 → Member 3 boundary;
            - targeted-only movement stays satisfied;
            - targeted after attested focused stays satisfied;
            - focused remains pending until a focused-or-full attestation covers its subject;
            - any full response dominates pending focused work; and
            - a focused attestation never satisfies a full requirement; and
            - unexplained deltas retain the fresh-root path.

    - `[ ]` **5.3.b Project the single result through currentness**
        - Extend `CandidateCurrentnessProjection`, `projectCandidateCurrentness`, and the effective-target projections
          with the shared closed convergence shape, removing any independent boolean/scope reconstruction and
          rejecting `satisfied + scope` or `pending + null`.
        - Update Candidate record helpers and every direct reducer/currentness caller so checkpoint, delivery,
          lifecycle, status, and review preparation consume the same projection. Make
          `PrePublicationReviewRequestSchema` reuse or enforce the same relationship.
        - Build `test-first` (one behavior at a time):
            - effective-target projections preserve satisfaction and pending scope;
            - impossible convergence pairs fail at every typed boundary;
            - checkpoint, delivery, lifecycle, status, and review preparation agree on the same record; and
            - Candidate lineage E2E coverage matches the focused unit projections.

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
