# Spec (`detailed` · `RFC`): evidence-applicability

- **Origin:** [internal]

- **Purpose:** Stop concurrent work from pausing on each other's integration by binding ARC's three "is prior evidence
  still good" decisions — merge safety, review clearance, verification currentness — to what a delta actually touched
  rather than to whether the head moved. One evidence-delta envelope composed from existing producers, one
  path-treatment registry, and one judgment method, with base movement as the first fully wired instance and the
  approved review-fix scope as the second.
- **Amended purpose, 2026-09-09:** Remove the terminal merge's session-occupying required-check poll while preserving
  the exact checkpoint and approval bindings, so the integration lane yields a resumable continuation instead of
  consuming the agent foreground until CI settles.
- **Amended purpose, 2026-09-09:** Keep the verification instance independently landable from its coordinated
  proposal-side producer: this work unit makes the Candidate lineage consume an approver-bound scope and fail closed
  when none is supplied; production scope reduction activates only when that producer is present.

---

## Introduction / Context

Three verified work units and the Errand queue idle while one work unit integrates. Nothing refuses them; the hold is
a convention adopted after an earlier integration forced the integrating session to stop repeatedly and re-run
ceremony, and the remedy offered was "have the other session pause". That turned a policy defect into a lifecycle
habit: serialize whole lifecycles upstream of publication so the base never moves under an integrating branch.

The defect is that ARC binds three decisions to **base containment** — is the current base OID an ancestor of the
head — rather than to **overlap** — did the base's advance touch anything this change touches:

- The base-drift analyzer (`lib/git/base-distance.ts`) mints `reconcile` whenever `behind > 0`; its module contract
  states that raw Git distance exclusively controls the verdict. `arc integrate checkpoint` refuses to compose on
  `reconcile`. Its safety composer (`reconcileSafety`) uses the overlap read only to decide whether the typed
  `arc base merge` may run: safe when integration evidence is complete, overlap is available, and the substantive
  overlap is empty (or, for a delivery, contained in the terminal residual). After that merge the workflow runs
  Tier 1 gates, a push, and a full recompose, and the new head owes a review-applicability judgment because
  "clearance never carries". Any other substantive overlap stops on `blocked / unsafe-reconcile` with a manual remedy.
  So the loop runs on exactly the movement that is harmless, and the movement that needs a merge has only a manual
  stop.
- `arc review status` returns `base-moved / rerun-checkpoint` from its own containment read (`readBasePosition`:
  fetch, then `merge-base --is-ancestor`), with no overlap read at all.
- Delivery eligibility (`lib/delivery/eligibility.ts`) resolves the bottom member's predecessor to the freshly
  observed protected-base tip and refuses `wrong-predecessor` when that tip is not an ancestor of the member head, so
  any base advance after private chain authoring owes a chain rebuild. `plan-segmentation` hit this.
- The Errand path has no typed base reconcile: `run-errand.md` gates twice on `arc base drift --json`, and any
  `reconcile` returns to Step 5, re-runs chunking, and re-enters the applicability judgment.
- `arc integrate merge` reads only `verdict` from its final drift read and folds a host HTTP refusal (a strict-currency
  `BEHIND`, a protection refusal, or a conflict) into `blocked / operation-failed` beside transport failures, so a
  refused merge loops through re-checkpoint and re-approval.
- Verification currentness has the same defect on a different axis. An approved review fix that changes any
  reviewable path flips the Candidate lineage to `convergence pending`, and the only exit is one final Tier 3 over
  the converged lineage (`pre-publication-procedure.ts`). The `targeted | focused | full` scope recorded on the
  `review-response` transition is stored and never consulted; the sole discriminator is the boolean
  `implementationChanged`. On `plan-segmentation` a one-line code fix and, later, a six-line documentation sync each
  forced a full re-verification.

**Field-evidence amendment, 2026-09-09.** `plan-segmentation` exposed a second terminal-integration liveness defect
after the bounded-wait repair cited below. `arc integrate merge` held the foreground while its required-check reader
polled for up to ten minutes; the agent session compacted during that call, swallowed the result, and had to recover
and reload the complete ARC context before integration could resume. The existing `awaiting-checks` result is the
right authority shape, but it arrives too late: an in-process polling loop is cheap computationally and still wrong
for a session whose foreground call occupies the agent. D16 makes the existing checkpoint-backed continuation
prompt-returning rather than introducing a queue or another approval carrier.

The same landing supplied a base-drift ordering failure inside the already-chartered delivery instance. After the
first `plan-segmentation` member advanced `main`, `arc base drift --json` proved one integration commit, complete
evidence, and empty overlap, but `arc integrate checkpoint` returned `drift-classification-unavailable`.
`classifyDeliveryDrift` projected Candidate currentness against the advanced base before computing the delivery
predecessor/residual interaction that decides whether the base movement is admissible. A terminal Candidate behind
its just-landed predecessor cannot satisfy that ordering. D7 makes classification consume the managed Candidate's
durable recognized baseline for this read-only purpose; ordinary currentness, terminal rebind, and exact-head
checkpoint requirements remain downstream and unchanged.

The host does none of this. The live `main` ruleset does not require branches to be up to date, does not dismiss
stale reviews on push, requires one check, and CI runs on every push to `main`. The pull-request check runs on the
host's test-merge ref, so it already exercises the head combined with the base as of run time. ARC applies a policy
equivalent to "require branches to be up to date" plus a review re-judgment, on a host configured for the opposite.

The substrate already holds most of the answer. Overlap is computed (`analyzeBaseOverlap`) and then ignored for the
verdict. Path-intersection carry exists in the review core. The Candidate attestation binds the reviewable subject
digest and already survives unrelated base movement. The terminal merge already pins the approved Candidate head and
revalidates the observed base before asking the host to merge into the named target ref.
What is missing is one vocabulary for "does evidence bound to target T0 still cover T1", one registry for "does this
path count", and consumers that read overlap where they read containment today.

## Goals

- **No session waits for another.** Concurrent work units and Errands publish and integrate throughout each other's
  landing windows. Disjoint base movement on a host that reports the request mergeable invalidates nothing: no base
  merge, no re-judgment, no recompose, no delivery rebuild. Overlapping movement reconciles once, at the terminal
  boundary, through a typed arm.
- **Evidence applicability follows covered content.** Review clearance, verification currentness, and merge safety
  are judged over one typed delta description and one three-way answer — `carries | supplemental | fresh` — with the
  deterministic arms computable and the residual judgment disclosed. The current WU's planning artifacts remain
  subject to their planning-stage gates but never become implementation-review evidence merely because a storage mode
  tracks them in the code repository.
- **Verification repeats scale to the approved scope of a fix.** A `targeted` fix advances the Candidate on its own
  Tier 1 evidence; a `focused` fix records one bounded check; `full` repeats full convergence verification; and an
  unexplained delta establishes a fresh root.
- **Strictness comes from the host.** Where a provider adapter can authoritatively establish an exact request's
  current-base requirement, ARC takes the typed base-merge arm; ARC never infers stricter currency from distance or
  an opaque refusal and adds no key of its own.
- **Fail closed on missing evidence.** Unavailable overlap, an unresolved host, or a transition that predates the new
  field each degrade to today's behavior, never to a carry.
- **Every stop explains recovery.** Every agent-facing non-success result preserves a stable semantic cause, useful
  sanitized detail, and either one executable structured remedy or an explicit terminal explanation. Provider
  abstraction may remove provider vocabulary from core; it never swallows the underlying failure, strands the
  session without a next step, or collapses distinct recovery paths into one generic error.
- **Required-check waiting does not occupy the agent session.** The terminal merge observes the exact head's checks
  once and either proceeds or promptly returns a checkpoint-backed continuation. Pending or unavailable checks keep
  the unchanged approval resumable; failed or stale checks invalidate it with an actionable typed exit.

_Amended goal interpretation, 2026-09-09._ The verification-scaling goal is this work unit's Candidate-side
contract, not a claim that it also lands the proposal-side producer. `review-signal-convergence` retains that
producer; until it lands, omission of the optional transition field deliberately preserves full verification.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- No repository-scoped queue, lane record, priority, head-of-line visibility, or exclusive cross-work-unit window.
  Serialization is the host's atomic merge of the approved head into the named target ref.
- No native `merge_group` adapter; no change to the delivery-stack `queue-not-atomic` refusal beyond confirming it.
- No typed chain-rebuild operation. `delivery-authoring-rebuild` (to be minted from its capture; not yet in the
  backlog) owns the rebuild for overlapping and interrupted-authoring cases; this work unit owns only the predicate
  that says whether a rebuild is owed.
- No change to the unexplained-delta path (`blocked / establish-new-root` and fresh full verification), and no change
  to the delivery-member route defect the "resume scoped review-fix verification before Candidate re-root" Errand owns.
- No proposal-side disposition-set schema, `review-triage` / `review-response` method, or `respond-command.ts` edits.
  `review-signal-convergence` carries `proposedVerification` and its pass-through into the transition; this work unit
  owns the transition schema and constructor and reads the value fail-closed. That coordination is not a dependency
  on the sibling work unit's completion and does not move its producer into this scope.
- No merger of the review-contribution and Candidate D4 classifiers (captured for after `review-signal-convergence`
  lands). No edits to the review cohort's review-fix fire-points, no `retrigger` semantics, no review-fix collapse.
- No criterion-digest or criterion-immutability changes.
- No general host merge-state or policy-capability redesign. `host-policy-evidence` owns richer native policy
  evidence. This work unit owns only the provider-neutral exact-coordinate observation required by its merge paths;
  provider-specific payload fields and failure codes remain inside the adapter, and an unprovable state is
  `unresolved` rather than an inferred policy fact.
- No ARC-side strictness configuration key (see § Alternatives & Rationale).
- No projection retirement, dematerialization, or new `ROADMAP`-specific merge machinery; `roadmap-tooling` and
  `operational-state-docs` own branch-carried projection retirement. The typed regenerable-conflict arm may compose
  the existing exact `applyRoadmapConflictAutoRemedy` implementation.
- No change to this repository's CI workflow (which legs run on push to `main`); captured separately.

## Proposed Design

The design has three layers. The **evidence layer** (D1–D3) adds one registry, one envelope, one deterministic
reducer, and one residual-judgment method. The **base-movement instance** (D4–D11) wires the envelope's overlap,
Git-feasibility, and provider-neutral host-admission axes through every path that offers a merge. The **verification
instance** (D12–D13) wires the envelope's cause axis through the Candidate lineage.
Doctrine (D14) and fire-points (D15) close it. Boundary fit at this read: **stays one WU + delivery-plan candidate**
— the three layers are independently reviewable surfaces of one coherent design (see § Cross-cutting Considerations
› Delivery), and the evidence basis is unchanged from the draft's read.

D16 is a forward amendment at the same terminal merge seam: it changes when the existing checks verdict returns,
not what evidence authorizes the merge or which lifecycle owns settlement.

_Amended boundary-fit result:_ **stays one WU + delivery-plan candidate.** D16 is not independently ownable: it
changes the same post-approval merge verb and reuses the same checkpoint, lock, check reader, and invalidation exits
that D6 already changes. It joins the terminal-integration delivery surface rather than creating another concern.

### D1. One path-treatment registry

Two classifiers answer "does this path count" incompatibly today. The base-drift adapter
(`lib/base-drift/current-adapters.ts`) knows `substantive | regenerable` and marks only `ROADMAP` regenerable. The
Candidate subject collector (`lib/work-unit/git-candidate-subject.ts`, `classifyCandidateSubjectPath`) knows
`reviewable | operational | candidate-projection`: the work unit's own `meta-*` and any project document
(`isProjectDocumentPath`, whose set is today `ROADMAP` alone) are `operational`; the Candidate record and the
submission boundary are `candidate-projection`; a relocated own artifact keys by artifact kind. Nothing shares them.

One registry module under `lib/` replaces both:

```text
classifyPathTreatment(path, { workUnit, projectionPaths }) -> reviewable | evidence-neutral | regenerable
```

- `reviewable` — counts everywhere.
- `evidence-neutral` — the current work unit's complete planning-artifact group (`meta-*`, `draft-*`, `spec-*`,
  `tasks-*`, `notes-*`, and lifecycle-directory companions), the Candidate record, the submission boundary, a
  vacated relocation source, and any non-regenerable project document. It never counts toward Candidate
  implementation-review applicability or base overlap. This is an applicability treatment, not a reclassification
  of authored design as an ADR-022 managed operational-state document.
- `regenerable` — the derived operational subset whose dual-sided conflict may be resolved only by D5's bounded,
  exact-parent regeneration; today `ROADMAP` alone, drawn from the same `ProjectDocumentKindSchema` the subject
  collector already uses. It carries no blanket host-merge or delivery-normalization policy.

The registry takes the work-unit identity because the own-artifact and projection paths are keyed by it. That context
is explicit: the subject collector and integration compositions pass the identity they already hold, while the
`arc base drift` and session-status compositions resolve the current locus before constructing their adapter. The
registry remains a synchronous pure classifier and never infers identity from a branch name or mutable ambient state.
In a checkout with no work unit (an Errand), the own-artifact and projection inputs are empty and the registry
degenerates to project-document classification.

The rule is semantic and storage-agnostic. It does not read `pm.mode`, Git tracking, or the future
`storage.track_design_docs` setting: materialization versus optional in-Git visibility cannot change whether an
implementation Candidate's evidence is current. Planning artifacts retain their own planning-stage review gates, and
an explicitly tracked design document may still be reviewed through a design-review surface; neither makes its bytes
implementation evidence. The identity boundary is deliberate: a foreign work unit's artifact is not silently
excluded from this Candidate, and shipped ARC machinery or ordinary implementation documentation remains
`reviewable`.

Base overlap consumes the three-valued treatment directly rather than the current binary
`ReconciliationClassifier`: it omits `evidence-neutral`, retains `regenerable` in its explicit bucket, and counts
only `reviewable` as substantive. This intentionally makes the current WU's planning artifacts and projections inert
to implementation overlap while leaving raw-distance verdicts unchanged. Candidate relocation remains two-part: the
collector owns artifact re-keying, the vacated source is `evidence-neutral`, and the re-keyed planning content retains
the same `evidence-neutral` treatment at its canonical artifact path. Relocation or an accompanying planning edit
therefore cannot manufacture an implementation delta. The Candidate subject entry's `treatment` records the
registry's value; the former `operational` and `candidate-projection` values fold into `evidence-neutral` in
regenerated development records. Candidate applicability and `collectUnstagedReviewablePaths` select only
`reviewable` entries, intentionally expanding the non-reviewable set from the historical meta-only exception to the
whole identity-bound planning group.

### D2. One total evidence-delta envelope, composed from existing producers

_Amended 2026-09-09 after adversarial review._ The earlier illustrative object omitted the approved-scope axis and
made a base-drift result look mandatory for non-base causes. The production contract is a strict discriminated input
union plus one total normalized envelope. It is **computed, never persisted** — rendered into the surfaces below and
discarded; the durable records it is derived from are unchanged except as D12 states.

`composeEvidenceDelta` accepts exactly one producer variant:

- `base-movement` — a strict `BaseMovementObservation` carrying exact head/base endpoints and overlap, adapted either
  from the authoritative base-drift result or from review status's own fetch/containment/overlap read;
- `base-merge` — the authoritative base-drift result after the typed merge, its exact head/base observation, overlap,
  and the optional D5 merge-admission observation;
- `member-rewrite` — one existing D4 projection with its exact before/after endpoints and residual;
- `approved-fix` — one Candidate `review-response` transition, its reviewable delta, and its approved scope; or
- `unexplained` — the Candidate projection that could not be joined to an explained transition.

It returns every axis on every arm, using explicit `not-applicable` values rather than omission. The normalized
contract is itself discriminated by `cause`, not a loose Cartesian product: each cause fixes which relation, overlap,
host-admission, scope, observation, and residual shapes are legal.

```text
EvidenceDelta {
  cause:         base-movement | approved-fix | base-merge | member-rewrite | unexplained
  relation:      equal | mechanical-reapply | clean-divergence | interaction | unavailable | not-applicable
  overlap:       { kind: disjoint | overlapping | unknown | not-applicable,
                   substantivePaths, regenerablePaths }
  hostAdmission: { state: mergeable | base-currentness-required | refused | unresolved | not-applicable,
                   coordinates | null, evidenceRef | null, detail | null }
  approvedScope: targeted | focused | full | not-applicable
  observed:      exact cause-discriminated endpoint tuple
  residual:      bounded path list | null
}
```

The observation variants are exact and provider-neutral:

- `base-movement` observes one integration coordinate `{ repository, changeRequest, base, head }`;
- `base-merge` observes `before` and `after` integration coordinates for the same repository and change request;
- `member-rewrite` observes the existing `DeliveryContributionEndpoints` before/after tuple;
- `approved-fix` observes the Candidate ID, disposition ID, and exact old/new Candidate targets; and
- `unexplained` observes the Candidate ID and exact prior/current Candidate targets that failed to join to a known
  transition.

Schema refinements reject semantically impossible combinations: `disjoint` has no substantive paths,
`overlapping` has at least one, positive host admission carries exact coordinates, cause-inapplicable axes are fixed
to `not-applicable`, and path arrays are sorted and unique. A residual eligible for judgment is a non-empty managed
path set bounded by the existing applicability limits (200 paths and 16,384 UTF-8 bytes). Exact base-overlap paths
remain available outside that bound for diagnostics, but an over-bound set produces `residual: null` and therefore
fails closed without a judgment handoff.

- `cause` comes from the base-drift integration evidence, the typed base merge, the Candidate transition, the
  existing delivery rewrite observers, or the attestation verb's unexplained-delta arm.
- `relation` comes from the D4 proofs and subject-digest equality the two existing classifiers already return.
  `approved-fix` and `base-movement` arms without a D4 projection carry `not-applicable`, never an invented relation.
- `overlap` comes from `analyzeBaseOverlap` classified through D1. `evidence-neutral` paths are excluded from the
  intersection; `regenerable` paths remain explicit. Non-base causes carry `not-applicable` unless their own producer
  actually supplies an overlap observation.
- `hostAdmission` is D5's provider-neutral semantic contract. It is admitted only when its repository, change-request,
  base, and head coordinates equal the envelope's observation. Provider payload keys and status codes never enter
  this type. An opaque evidence reference may support diagnostics but is neither interpreted nor persisted by core.
- `approvedScope` comes only from the optional approver-bound `approvedVerification` field on a `review-response`;
  every other cause carries `not-applicable`, and an older response that omits the field reduces to `full` before
  composition. The transition's existing primary-owned `applicability` field is not approval evidence and never
  populates this axis. Member 1 accepts a narrow structural review-response input with the optional future field, so
  it lands independently before D12 adds that field to the durable Candidate schema.

The Git axes are composed from one observation of the relevant endpoints, and the host-admission axis is admitted
only when it binds those same coordinates. The four base-movement detectors that exist today (`behind`,
`merge-base --is-ancestor`, OID inequality, re-observed heads) therefore cannot disagree inside one envelope. The
exact pair qualifies evidence at observation time; it is not represented as a base-OID pin the host merge operation
cannot enforce (D6). `BaseMovementObservation` is the shared structural input: Member 1 proves both authoritative-drift
and review-status-shaped fixtures can construct it, while D8 owns the actual review-status adapter and callsite. The
two D4 classifiers keep producing their projections unchanged and are not merged. Strict Zod schemas cover every
input variant and normalized arm; exhaustive TypeScript switches make an added cause or axis value a compile-time and
test failure rather than a prose default.

**Removal.** The review-gate `core/applicability.ts` module (`classifyReviewApplicability`,
`validateIncrementalApplicabilityReceipt`, `ReviewApplicabilityProofSchema`), its `review-applicability` v2 row in
`core/schema-inventory.ts`, and the registration import/call in `core/register-review-schemas.ts` are removed together.
Remove the corresponding expectations from `core/applicability.test.ts`, `review-schema-registration.test.ts`,
`review-semantic-schemas.test.ts`, `kernel/schema-generation.test.ts`, and `schema-artifact.e2e.test.ts`: the classifier
has no production callers, the schema has no records on disk, and there are no adopters to carry. The
`applicabilityId` **field** on the gate contract, projection, and local-review result is a different thing and stays.

### D3. One total reducer and one residual-judgment method

_Amended 2026-09-09 after the procedure-evolution self-check._ Deterministic applicability is code, not method prose.
A pure `reduceEvidenceApplicability(delta, evidence)` function consumes D2's total envelope and returns exactly one
of the common verdicts on every structurally valid input. Its return is a discriminated union. A
`judgmentRequired: false` result makes the verdict final; `judgmentRequired: true` carries a bounded residual and
uses `supplemental` as the minimum/default recommendation that the method may retain or escalate to `fresh`.

```text
reduceEvidenceApplicability(delta, evidence) ->
  { verdict: carries | supplemental | fresh, residual, reason, judgmentRequired }
  evidence: review-clearance | verification | merge-safety
```

The reducer owns the closed precedence sequence:

1. Any `cause: unexplained` returns `fresh`.
2. Verification over `approved-fix` returns `carries`, `supplemental`, or `fresh` for approved scope `targeted`,
   `focused`, or `full`, respectively. Review clearance over `approved-fix` returns `fresh`.
3. Merge safety returns final `carries` only for `base-movement` + `disjoint` + exact
   `hostAdmission: mergeable`. Overlapping movement, a completed `base-merge`, unknown overlap, refused or unresolved
   host admission, and exact conflict return final `fresh`; merge safety never enters residual judgment.
4. Review clearance and verification over `base-movement` return final `carries` for `overlap: disjoint`, final
   `fresh` for `overlap: unknown`, and `judgmentRequired: true` with the bounded substantive residual for
   `overlap: overlapping`. An absent or over-bound residual returns final `fresh`. D8 therefore needs no D4 relation
   or host-admission fact to retain a disjoint attempt.
5. For other movement causes, `overlap: unknown` always returns `fresh`. With `overlap: disjoint | not-applicable`,
   `relation: equal | mechanical-reapply` returns final `carries`, bounded `clean-divergence` returns
   `judgmentRequired: true`, and `interaction | unavailable` returns final `fresh`. With `overlap: overlapping`,
   equal or mechanical returns final `supplemental`, bounded clean divergence returns `judgmentRequired: true`, and
   interaction or unavailable returns final `fresh`.
6. Any remaining structurally valid arm returns the explicit conservative default, `fresh`.

"Unknown" and "unavailable" are conservative only when they occur on an axis the selected cause/evidence pair
actually consults. D2 fixes cause-inapplicable axes to `not-applicable`; those values neither trigger `fresh` nor
participate in judgment. Thus unresolved host admission is decisive for merge safety but cannot stale review or
verification evidence on a row where host admission is inapplicable. Compile-time exhaustiveness and the closed-row
tests cover both halves: every evidence-relevant unknown fails closed, and every inapplicable axis is inert.

The `fresh` merge-safety rows classify evidence applicability; they do not themselves make an unavailable merge
action executable. D5 and D6 consume the reducer beside exact Git feasibility, integration-evidence completeness,
and host-admission state to select a typed continuation or stop.

The shipped `assess-evidence-applicability` method receives only
`judgmentRequired: true` results whose bounded residual admits a genuine choice:

```text
assess-evidence-applicability(delta, evidence, act) ->
  { recommendation: supplemental | fresh, residual, rationale }
```

It judges whether a bounded non-base `clean-divergence` or an overlapping base-movement residual for review or
verification deserves a supplemental pass or a fresh one; it never handles merge safety or re-evaluates a final
deterministic arm. Where an authority already owns the choice (the checkpoint's Candidate
selection `covered | targeted-check | changed`, the review-contribution selection `covered | review-required`, or the
disposition set's approved scope), the recommendation is shown before selection and only the recorded selection acts.
An approver may select more narrowly than the recommendation; that is the holder's decision, not a softened reducer
arm. The agent's own recommendation never releases a check over its own work.

### D4. Additive movement classification; the verdict is unchanged

`BaseDriftResult` keeps its four-valued `verdict` with `clean` versus `reconcile` driven by raw distance alone — the
recorded module invariant stands unamended — and gains an orthogonal `movement` field:

- `disjoint` — overlap evidence available and the registry-filtered `substantivePaths` empty;
- `overlapping` — any substantive overlap;
- `unknown` — overlap unavailable.

`movement` is the base-drift read's projection of the envelope's `overlap` axis, computed in `analyzeAvailableBase`
beside the overlap it already computes. Integration-evidence completeness is **not** a precondition for classifying:
completeness exists to authorize a mutating merge, and requiring it for a reading would disable the disjoint arm on
any history with an unproven single-parent commit. The register text (`composeBaseDriftRegister`) names the movement
without retaining today's unconditional "required before integration" instruction: it states that the typed
checkpoint decides whether integration proceeds, reconciles, or stops. Every surface that renders the register —
`arc base drift`, the session-init advisory — carries that explanation without a dispatch change. Consumers that
never read `movement` keep today's fail-closed behavior.

**Every `verdict` consumer, and which consult `movement`.** Code consumers:

- `arc integrate checkpoint` (`scripts/integration/checkpoint.ts`, `reconcileSafety`) — reads `verdict`, overlap,
  integration evidence, and the host fact today. **Consults `movement` × Git feasibility × host admission** (D5).
- `arc integrate merge` (`scripts/integration/merge.ts`, `readFinalDrift`) — reads `verdict` only today.
  **Consults `movement`, `baseOid`, Git feasibility, and host admission** (D6).
- `arc base drift` (`handlers/base.ts`) — reads `verdict` and the register. Dispatch unchanged; the register and the
  JSON carry `movement`. Host admission remains request-bound inside checkpoint and merge operations.
- `arc base merge` (`scripts/base/merge.ts`) — reads no verdict (expected endpoints only) and carries no evidence
  guard of its own; the integration-evidence-completeness guard lives in the checkpoint that offers the arm.
  Unchanged.
- Session-init `baseDistance` probe, recommendation, and schema (`handlers/status.ts`,
  `lib/session-init/recommended-action.ts`, `commands/status/schema.ts`) — reads `verdict` and the register. Action
  unchanged (`surface` on `reconcile`); the value schema admits `movement` and requires its absence on the
  not-applicable arms.
- `arc review status` `base-moved` arm (`scripts/review-gate/status.ts`) — reads its own `baseContained` today, not
  the analyzer. **Composes the envelope's overlap axis** from its own base observation (D8).
- Delivery eligibility and the terminal classifier (`lib/delivery/eligibility.ts`, `terminal-integration.ts`) — read
  no verdict; the classifier reads overlap paths. **Compose overlap through the registry** (D7).
- Delivery position refresh trigger (`lib/delivery/position.ts`, `refresh.ts`) — reads its own `targetMovement`.
  Unchanged; "Base movement alone obligates no refresh" already holds.

Workflow prose consumers:

- `integrate-work-unit.md` Step 2 advisory read — silent on `clean` and regenerable-only drift. Unchanged in
  effect; wording cites `movement`.
- `integrate-work-unit.md` Step 10 checkpoint and merge dispatch — `reconcile / reconcile-base` and
  `invalidated / checkpoint` today. **Dispatches the D5 and D6 arms.**
- `run-errand.md` Step 4 advisory read and Step 6's two gates — `clean` continues, `reconcile` returns to Step 5
  today. **Step 4 stays advisory; Step 6 delegates the complete dispatch to `arc errand merge`** (D9).
- `session-init.md` Step 6 and `probe-envelope.md` — render the register on `surface`. Dispatch is unchanged; the
  revised register and envelope reference document the field without instructing a raw-distance reconcile.

### D5. The checkpoint decides merge-safety from movement × feasibility × host admission

_Amended 2026-09-09 after adversarial review._ The former `readHostFact` conflated Git feasibility with host
admission and named provider payload fields in the core contract. The checkpoint instead composes two independently
owned, exact-coordinate facts:

- `GitMergeFeasibility` — a discriminated `clean | regenerable-conflict | substantive-conflict | unavailable` fact
  computed over the observed base/head pair through existing merge-tree and D1 registry substrate. Every arm carries
  the exact base and head; conflict arms carry sorted unique conflict paths, and `unavailable` carries sanitized
  diagnostic detail. The merge-tree execution and parsing primitive is shared with delivery contribution proof rather
  than implemented a second time; and
- `HostMergeAdmission` — `mergeable | base-currentness-required | refused | unresolved`, returned by a
  provider-neutral `ChangeRequestMergeObservationPort` bound to repository, change request, base, and head. Every
  non-positive arm carries sanitized diagnostic detail; the optional opaque evidence reference supplements rather
  than replaces that explanation.

Core knows only those semantic states and coordinates. A provider adapter may use any native payload needed to
establish them, but a positive admission is accepted only when the adapter proves it belongs to the exact pair. The
supported GitHub adapter validates the provider's test-merge commit parents against the observed base and head before
returning `mergeable`. It establishes `base-currentness-required` only from the exact target's applicable native
strict-currentness policy, reusing the branch-protection and ruleset policy read already owned by required-check
observation; a generic "behind" merge-state value, raw Git distance, or opaque refusal is insufficient. Unreadable,
ambiguous, or otherwise unprovable strictness becomes `unresolved`. A read-time `refused` result is admitted only for
an explicit native condition unrelated to ARC's expected draft lock or unsettled checks; an actual merge-call refusal
belongs to D6. Provider-specific names stay in the adapter.

One logical host observation may perform at most three abortable adapter-internal re-reads while the provider
computes its test merge. Every re-read remains bound to the same request and coordinates; movement returns a stale
observation for checkpoint invalidation rather than silently restarting the read. Exhaustion returns `unresolved`
with the last useful sanitized detail so the checkpoint can compose its structured retry remedy. No workflow or agent
loop performs those reads. The observation and its opaque diagnostic evidence reference are computed and discarded,
not persisted. Session init still performs no host read.

The checkpoint's closed dispatch is:

- **`disjoint` + Git `clean` + host `mergeable` → `ready / request-approval`.** The pinned host merge combines the
  exact trees. No base merge, re-judgment, or recompose occurs; the ready surface discloses the movement and admission
  fact rather than calling the branch current.
- **Registry-only overlap + Git `regenerable-conflict` + complete integration evidence →
  `reconcile / reconcile-regenerable`.** The existing typed `arc base merge` production adapter reuses
  `applyRoadmapConflictAutoRemedy` only when its existing eligibility check proves the derived readiness projection is
  the sole conflict. The composition binds the remedy to the checkpoint's exact expected head and base parents and
  renders from the resulting candidate index under that same observation; parent movement or a render that reports
  changing inputs is a non-success, never an applied remedy. Only a determinate render whose staged bytes and merge
  parents revalidate completes the append-only merge, then runs Tier 1, pushes, and recomposes. A wider conflict,
  coordinate mismatch, or indeterminate render returns a typed refusal after restoring the pre-merge head and tree.
  No new resolver or projection-specific state is introduced.
- **`overlapping` + Git `clean` + host `mergeable` + complete integration evidence →
  `reconcile / reconcile-base`.** The typed base merge, Tier 1, one push, one checkpoint, and one approval run; the
  review-applicability judgment is owed.
- **Host `base-currentness-required` + complete integration evidence → a typed reconcile.** Git `clean` returns
  `reconcile / reconcile-base` for either disjoint or overlapping movement; a registry-only
  `regenerable-conflict` returns `reconcile / reconcile-regenerable`; and `substantive-conflict` remains
  `blocked / conflict`. The new head then owes Tier 1, checkpoint composition, and approval exactly once.
- **Any reconcile candidate with incomplete integration evidence → `blocked / unsafe-reconcile`.** Read-only
  movement classification still requires no completeness proof; mutation does.
- **Git `substantive-conflict` → `blocked / conflict`.** The remedy names exact locally observed conflict paths when
  available, falling back to substantive overlap paths as likely loci.
- **Host `unresolved` → `blocked / host-pending`, `nextAction: retry`.** Reached after the bounded logical
  observation. Its detail names the unavailable evidence and its structured retry argv; it never aliases conflict,
  strict currency, or an overlap remedy.
- **Host `refused` → `blocked / host-refused`.** The provider-neutral detail is actionable but confers no reconcile
  authority.
- **Unknown overlap or unavailable Git feasibility → `blocked / unsafe-reconcile`.** The remedy directs a fresh typed
  drift read.
- **No bound change request → as today.** A checkpoint without one cannot reach a merge.

This retargets today's typed base-merge arm without weakening its mutation guard. The ordinary empty-overlap case
becomes the direct disjoint compose path; overlapping movement still reconciles before merge because the resulting
merge commit carries interaction. The separate regenerable-conflict arm removes the earlier contradiction between
"every conflict blocks" and the existing local regenerate-wins path. It degenerates to nothing once branch-carried
readiness projections retire. D7 uses the same path treatment and never treats regenerable-only movement as
predecessor overlap.

### D6. A typed exit from a host merge refusal

_Amended 2026-09-09 after adversarial review._ The pinned-merge adapter classifies provider failures into semantic
states, but an opaque refusal never acquires a cause from HTTP status or `behind > 0`. Its provider-neutral outcomes
are `merged`, `head-moved`, `base-currentness-required`, `refused`, `merge-outcome-unknown`, and
`operation-failed`. Provider-specific codes and messages stay inside the adapter; it returns
`base-currentness-required` only when native evidence authoritatively establishes that policy for the exact request
and coordinates. Otherwise a definitive host rejection is `refused`.

Every non-success terminal result carries the exact coordinates it did establish, a stable provider-neutral reason,
sanitized detail that retains the most specific available cause, and either structured retry/remedy argv or an
explicit explanation that no safe automated continuation exists. Adapter exceptions are classified at the boundary;
they are never replaced by an empty message, logged without reaching the result, or flattened into
`operation-failed` when a narrower semantic state is known. Interactive rendering is a projection of that same typed
result, so JSON and prose cannot disagree about recovery.

Immediately before the host call, the merge verb performs one complete target and admission observation and invokes
the D2/D3/D5 planner. After a definitive adapter refusal it reobserves only the coordinates needed to prove the
approved request is still current, then feeds the adapter's semantic result into that planner; it does not repeat the
full admission observer by default:

- changed head, base, request identity, or checkpoint binding → the existing exact invalidation and recompose path;
- independently established `base-currentness-required`, unchanged coordinates, and complete integration evidence →
  `invalidated / reconcile-base` with the exact expected base and head;
- opaque or policy refusal → `blocked / host-refused` with provider-neutral actionable detail;
- unresolved admission → `blocked / host-pending` with a retry remedy; and
- a failure authoritatively established before mutation, or an exact confirmation that establishes an unmerged
  terminal failure → `blocked / operation-failed`; and
- an indeterminate result after the mutating request → `blocked / merge-outcome-unknown`, with the exact checkpoint
  retry and both the mutation and confirmation diagnostics.

A timeout, transport failure, or malformed response after the mutating request does not prove that the merge failed.
The adapter immediately reads the exact request and target: exact confirmation that the approved head merged returns
`merged`; authoritative evidence that it remains unmerged returns the narrowest established non-success result and
re-holds the exact target; unavailable or ambiguous confirmation returns `merge-outcome-unknown / retry`. The unknown
arm preserves the checkpoint and its exact-effect approval, reports both failure stages, and does not claim failure or
re-lock solely from uncertainty. Replay first performs the same exact merged-at-head read, so it can settle a completed
merge or safely resume the still-unmerged path without duplicating the effect.

**External-seam authority.** The supported pull-request merge operation pins the Candidate head but does not offer a
compare-and-swap operand for the base OID. The integration interlock therefore authorizes one exact Candidate head and
change request to merge into the named base ref under that ref's configured host policy; it does not authorize or
claim an exact base OID. D5's exact pair qualifies the evidence observed immediately before release. If the base moves
before that observation completes, the command invalidates normally. Movement after the observation begins and before
the host atomically performs its merge is an irreducible provider race, disclosed on the approval surface rather than
represented as an ARC guarantee.

A successful or replay-confirmed mutation returns `merged` only after the provider adapter confirms that the exact
approved-head change request merged into the named target and returns its provider merge identity when available.
That confirmation does not retroactively turn head-bound required checks into exact-pair evidence. Projects that
configure strict
current-base checks or a native merge queue get the host's stronger behavior; ARC neither invents that requirement nor
weakens it. Eliminating the residual race for a non-strict host would require strict currency, a merge queue, or an
exclusive base lock, all outside this work unit's selected policy and non-goals.

Raw distance never selects reconciliation and `arc base merge` is never offered without the checkpoint planner's
complete-evidence guard. This may conservatively stop on a strict host whose adapter cannot yet prove its native
currentness policy; `host-policy-evidence` can later widen the adapter capability without changing core or workflow
contracts. Exact-head merge authorization remains untouched: every invalidation returns to composition, and a
recheckpointed head needs its own approval.

### D7. Delivery eligibility tolerates disjoint movement without falsifying a member's base

Two different things are called "the base" in the delivery subsystem, and the design keeps them apart. The
**chain base** is the bottom member's real Git predecessor. It becomes the persisted target
(`state.target.coordinates`, head and tree) at materialization and is replaced by each landing result as members
land; every member's `coordinates.base` remains that real predecessor — the chain base for index 0, the previous
member otherwise. The **observed tip** is the protected ref as freshly observed at the operation. Eligibility reads
it through `observeRef(protectedBaseRef)`, the checkpoint's drift read fetches it, and position facts already report
an advanced tip as `targetMovement: append-only`. The eligibility snapshot carries both coordinates explicitly:
`protectedBase` remains the observed ref tip, while `chainBase` is the exact coordinate that materialization and
suffix contribution use. Neither is inferred from the other or from a branch name.

Three eligibility reads equate the two today. The index-0 ancestry check becomes a predicate over the member and the
observed tip:

```text
predecessorRelation(member, observedTip) ->
  | { kind: exact, observedTip, chainBase: observedTip }
  | { kind: disjoint-ahead, observedTip, chainBase: mergeBase, overlap }
  | { kind: overlapping-ahead, observedTip, mergeBase, overlap }
  | { kind: unrelated, observedTip, detail }
```

`exact` when the tip is an ancestor of the member head (today's pass). Otherwise the merge-base of tip and member head
is located; none → `unrelated` (today's `wrong-predecessor`). With one, one shared exact-revision overlap primitive
diffs merge-base → tip and merge-base → member head, classifies their intersection through the D1 registry, and
returns the merge-base beside the overlap. Empty substantive intersection → `disjoint-ahead`; any substantive
intersection → `overlapping-ahead`. The same provider-neutral primitive underlies D8, while the existing
`analyzeBaseOverlap` remains its base-drift wrapper. It accepts exact head/base revisions rather than reading ambient
`HEAD`; callers supply explicit WU treatment context or no WU context for an unbound/Errand subject.

A `disjoint-ahead` bottom member stays eligible with `chainBase` equal to its merge-base and therefore keeps its real
`coordinates.base`. Initial materialization persists that chain base; suffix rematerialization requires it to equal
the already-persisted target. The materialization mutation separately proves that the protected ref still equals the
snapshot's observed tip before recording the chain base, rather than requiring the live ref to equal the older chain
base. The landing itself targets the protected ref by name, and the host's merge commit combines the member with the
live tip; the landing result then becomes the persisted target, as today. `overlapping-ahead` and `unrelated` still
refuse and owe a rebuild; `delivery-authoring-rebuild` (to be minted) owns how. Their refusal preserves the relation,
exact established coordinates, overlap paths or no-common-ancestor detail, and explicitly says that no safe automated
rebuild exists in this work unit.

The snapshot is an externally round-tripped observation, not authority. `eligibility-close` reobserves the protected
ref and member refs, revalidates the exact relation and its merge-base/chain-base coordinate, and rejects a caller-
altered relation before completeness or mutation. A source move returns the changed coordinate and one re-prepare
action. This preserves the existing observation bracket while preventing the new relation fact from becoming a
trusted caller assertion.

The other two reads are tree-entry comparisons at the lifecycle paths, and they are where the common disjoint case —
a sibling ship regenerating `ROADMAP` on the base — bites today. The lifecycle-contribution revalidation
(`lifecycle-contribution.ts` `compareDeliveryLifecycleContribution`) requires each member's entries at the lifecycle
paths to equal the tip's, and the normalized-completeness close (`compareNormalizedDeliveryTree`) overwrites the
top's lifecycle entries with the tip's before requiring the final candidate to match; the lifecycle path set includes
the project readiness document by default. After a sibling regenerates it, every member differs from the tip at that
one path and eligibility refuses `lifecycle-contribution` before the predicate is consulted.

Under `disjoint-ahead`, both comparators instead take the base-side entries for D1 `regenerable` paths from the
bottom member's merge-base. This is not permission for a member to carry a competing render: eligibility establishes
the **lifecycle-neutral nonterminal invariant** that every disposable nonterminal member's regenerable entry equals
its recorded chain baseline. Every other lifecycle path stays protected-tip-compared because a sibling cannot
legitimately touch this work unit's own artifacts. Materialization, pre-binding review-target composition, suffix
rematerialization, and ordinary landing preserve that invariant; `deriveDeliveryMaterialization` selects
`snapshot.members[index]` for a nonterminal contribution. Consequently, when a sibling alone regenerated the
protected base's readiness view, the admitted nonterminal contribution is unchanged at that path relative to the
merge base and the host performs an ordinary one-sided merge; no custom merge driver, hybrid-render policy, or
delivery rebuild is needed. A nonterminal candidate that changes the readiness entry itself fails eligibility with
the exact path and corrective boundary.

The terminal projection is different: `deriveDeliveryMaterialization` may take it from `snapshot.top`, so both the
terminal candidate and the protected base can carry divergent renders. That exact, registry-only conflict routes
through D5's typed `reconcile-regenerable` arm, whose determinate exact-parent remedy produces a new head and therefore
requires a fresh checkpoint and approval. This is the registry lookup D1 already provides, not a delivery conflict
controller, and it degenerates to nothing once branch-carried projections retire.

**Every consumer that compares a member's `base` to a base head, or diffs a member against the observed tip.** Sites
that change:

- `lib/delivery/eligibility.ts` `prepareDeliveryEligibility`, close, and the handler's eligibility snapshot schema —
  the index-0 predecessor is the observed `protectedBase` today. **Carry `protectedBase`, `chainBase`, and the exact
  relation separately; `disjoint-ahead` passes and close revalidates the caller-carried fact.**
- `lib/delivery/lifecycle-contribution.ts` `compareDeliveryLifecycleContribution` and
  `compareNormalizedDeliveryTree`, their Git adapters, and every direct caller — base-side entries come from one
  coordinate today. **Under `disjoint-ahead`, `regenerable` paths compare against `chainBase`; every other lifecycle
  path compares against `protectedBase`. An eligible nonterminal's regenerable entry must equal its `chainBase`;
  `chain-containment.ts` supplies its already-closed common base for both inputs, preserving its existing semantics.**
- `lib/delivery/materialization.ts`, the pre-binding review-target composition, and
  `lib/delivery/suffix-rematerialization.ts` — one `protectedBase` currently supplies both the live-ref proof and
  persisted predecessor. **Materialization persists `chainBase` while verifying `protectedBase`; suffix
  rematerialization compares `chainBase` with the persisted target, and every nonterminal projection preserves the
  lifecycle-neutral entry. A terminal projection that diverges on both sides routes to D5 rather than being
  normalized into an unreviewed head.**
- `lib/delivery/terminal-integration.ts` `classifyDeliveryTerminalDrift` — folds `regenerablePaths` into the
  predecessor-overlap intersection and has no disjoint arm. **Gains
  `{ status: "disjoint", nextAction: "continue" }`; `regenerable` paths never count toward predecessor overlap.**
- `scripts/review-gate/status-composition.ts` `readBasePosition` — the live tip must be an ancestor of the reviewed
  head. **D8.**

Sites that compare against the persisted target and stay as they are, because it never carries the observed tip:

- `lib/delivery/position.ts` `recognizeDeliverySuffixRetarget` (`coordinates.base !== target.coordinates.head`) and
  `resolveDeliveryPredecessorHead` (index 0 and a landed predecessor both resolve to the persisted target head), and
  the `handlers/delivery-execution.ts` refusal that consumes the latter.
- `lib/delivery/terminal-integration.ts` `rebindDeliveryTerminalCoordinates` — a single-member plan's terminal
  compares its base to the persisted target head; a multi-member plan's to its predecessor member.
- `lib/delivery/native-landing.ts` observed suffix rebuild and terminal rebind — index 0 reads the persisted
  `target.coordinates` from the landed state.
- `lib/session-init/delivery-position-facts.ts` `snapshotIsCurrent` and `observeTarget` — an advanced tip is
  `append-only`, which `suffix-reconciliation.ts` already admits as a non-mismatch.

Sites that read a member's base for another purpose and stay as they are:

- `scripts/integration/checkpoint-composition.ts` `classifyDeliveryDrift` — `predecessorPaths` still diff from
  `firstCoordinate.base`, the chain's real ancestor. Its Candidate read ordering changes as described below.
- `lib/delivery/chain-absorption.ts`, `review-fix-continuation.ts` — member-to-member adjacency.
- `lib/delivery/landing.ts` (`exactOpenRequest`, `prepareDeliveryLanding`), `native-stack.ts` registration,
  `retirement.ts` — ref-level comparisons (`baseRef` is the protected ref), not OIDs.
- Review targets — `pre-publication-delivery-targets.ts` (`diffBaseSha = member.coordinates.base`),
  `handlers/candidate.ts` `observeEndpoints`, `earlier-review-applicability.ts` — diff from the member's recorded
  base, which is exactly why `base` stays the real ancestor.
- `deliver-stack.md` prose ("each request is based on its predecessor branch"; "Base movement alone never invokes
  this arm") — the predecessor chain is unchanged; the eligibility prose names the predicate.

**Checkpoint classifier ordering — amended 2026-09-09 from terminal field evidence.**
`checkpoint-composition.ts` currently calls the effective Candidate projector with the newly observed base and
requires its result to be `current` before it reads `residualPaths` or `predecessorPaths`. That reverses the
dependency: the delivery overlap classification is evidence needed to decide whether the base movement preserves
Candidate applicability. The classifier instead reads the versioned managed Candidate record and reduces its
durable baseline through `reduceCandidateDurableBaseline`; the baseline target's exact revision is the upper bound
for the residual diff. It does not ask the effective projector to recognize that revision against the advanced base.
On the envelope's `disjoint` arm no residual/predecessor intersection can alter the answer, so the classifier returns
`{ status: "disjoint", nextAction: "continue" }` after validating the delivery records, overlap availability, and
managed Candidate baseline. The checkpoint admits that result only through D5's disjoint + host-mergeable arm; it is
not an alias for `clean`. On `overlapping`, the classifier computes the existing residual and predecessor path sets
against that durable revision and retains the `predecessor-overlap` refusal or existing typed reconcile result.

This is a classification-only exception, not Candidate authority. The durable baseline must parse, belong to the
same managed record, and name a resolvable revision; missing or malformed records and failed diffs still return
`drift-classification-unavailable`. The result grants no currentness, review carry, terminal claim, or merge
authority. After the typed base-movement arm, the existing effective Candidate read against the resulting base must
be `current`, and terminal rebind, publication, lifecycle, checkpoint, approval, and final exact-head checks all
still run. Dependency composition factors the current cache into one versioned managed-record read keyed by work unit
and an effective projection keyed by work unit + an explicit base revision. No projection reads or establishes an
implicit "bound base", and every downstream call, including ready composition, receives the authoritative revision
directly. Classification and downstream currentness consume the same record bytes within one checkpoint invocation.
Immediately before the create-only checkpoint record is persisted, composition re-reads only to assert that the
managed-record version is unchanged; movement returns a typed recompose result with the expected and observed
versions. This adds no store and prevents either a classification read from poisoning a later projection or two
record versions from being mixed into one checkpoint.

### D8. Review status stops treating containment as movement

`readBasePosition` keeps its base fetch and containment read, ensures the exact reviewed head is locally resolvable,
and invokes D7's exact-revision overlap primitive over that head and the observed base. It obtains WU treatment context
from the resolved review subject rather than the active checkout and adapts the exact repository, change request,
head, base, and overlap directly into D2's `BaseMovementObservation`; it does not synthesize a `BaseDriftResult` or D4
relation. D3 returns `carries` for disjoint base movement and `fresh` for unknown movement.

This pre-reconcile status read is deterministic. `base-moved / rerun-checkpoint` fires only when
`!baseContained` and movement is `overlapping` or `unknown` (fail closed); disjoint movement retains the attempt. An
overlapping status observation does not invoke the residual-judgment method because no post-reconcile subject exists
yet for that judgment to act on. The typed checkpoint produces the actual reconciled subject and owns any later
review-applicability decision. The status result carries movement, exact coordinates, overlap paths or the precise
unavailability reason, and a structured return-to-checkpoint action (or an explicit terminal explanation when its
target-only scope cannot construct one), so neither unknown evidence nor a missing subject strands the caller.

_Amended 2026-09-14 — pre-terminal delivery review._ When a request uniquely matches the current outstanding or an
already discharged non-terminal delivery member, classified protected-base movement retains the ordinary exact-member
review or landing route, even when its overlap is substantive. Status carries the movement evidence; member landing
reobserves its own exact target and predecessor chain, while the terminal checkpoint handles downstream interaction
after the preceding members land. Unavailable or mismatched movement evidence stops with a retryable status result;
ambiguous member binding, singleton requests, and terminal members keep the checkpoint route. This does not grant
review clearance, change the member head, or bypass required checks or landing authorization.

### D9. The Errand path gets the same policy through the same read

_Amended 2026-09-09 after the procedure-evolution self-check._ Workflow prose does not evaluate the movement matrix,
classify a provider refusal, or coordinate lock release and re-hold. A typed `arc errand merge` verb consumes the
strict current Errand identity plus the exact approved target and selected lane, then composes the same D2/D3/D5
planner through injected Git, change-request, checks, merge-method, merge-lock, and provider ports.

The verb owns one final drift and host-admission observation, exact change-request revalidation, method resolution,
lock release, direct exact-head merge, and re-holding the exact target on every definitively unapproved exit. Its
closed result includes `merged | awaiting-checks | applicability-judgment-required | reconcile-base |
reconcile-regenerable | conflict | host-pending | host-refused | invalidated | merge-outcome-unknown |
operation-failed`, a precomposed next action, and exact retry/remedy argv when one exists. It never infers strict
currency from raw distance or an opaque host refusal; both reconcile results require the same complete integration
evidence as D5/D6, and `reconcile-regenerable` additionally requires the exact-parent, determinate readiness-render
contract. Native auto-merge is not an Errand result: the supported host can arm at the current head but cannot keep
that authorization exact if a later write-author push changes the request. Pending checks therefore return control,
and the unchanged request later uses direct head-pinned merge. Re-entry over the same target is idempotent, while a
changed target invalidates the prior authorization.

`run-errand.md` Step 6 invokes the verb once after the existing integration interlock and dispatches only on its typed
`state` / `nextAction`. An `applicability-judgment-required` result returns to the marked D15 review/applicability
fire-point before mutation; any resulting terminal plan receives a fresh exact integration approval. The workflow
contains no raw `gh pr merge`, movement or HTTP comparisons, or lock-recovery mechanics. The existing typed checks
observation may still supply reviewed-lane readiness before the merge verb; Step 4's advisory read remains unchanged
in effect. The existing release-only `arc merge lock release` operation remains separate because releasing a lock
without merging is a different authorized effect; it is the explicit exception to the normal `arc errand merge`
terminal route. The command introduces no approval store, queue, configuration axis, or Errand lifecycle record.

### D10. Strictness comes from the host, not a new key

Where a provider adapter can authoritatively establish an exact request's current-base requirement, ARC takes the
typed base-merge arm instead of offering a disjoint merge the host cannot complete. An adapter that cannot prove the
policy returns `unresolved` or `refused`; ARC stops rather than inferring strictness from distance or a generic merge
failure. `host-policy-evidence` may widen that adapter capability later. No ARC key, provider vocabulary in core, or
dependency edge is introduced.

### D11. Native queue seam stays where it is

The terminal action remains a closed typed value (`merge`); `queue-not-atomic` remains the delivery refusal
(`native-landing.ts`, `mergeAction === "queue"`). A future `enqueue` arm is additive after lock release, with
asynchronous completion handled by the existing `merged-at-head` resume path. Nothing is built for it here.
Errands likewise expose no native auto-merge arm: their exact-head authorization resumes through the direct merge
operation until a host capability can preserve that exact effect across asynchronous completion.

### D12. Verification instance: the lineage carries and consumes the approved scope

`review-signal-convergence` carries the proposal-side field: a required `proposedVerification` at the root of the
canonical disposition set, valued from the existing `targeted | focused | full` enum, in immutable disposition content
so it participates in disposition-set identity, approval binding, and fix authorization; the post-fix
`verifiedFix.applicability` must be equal or broader. The durable baseline reducer is a pure function over the
Candidate record and cannot reach the disposition store, and the transition's existing `applicability` is the
primary's own selection, which may not release a check over the primary's own work. So the lineage carries the
approved value itself:

_Amended 2026-09-09 after adversarial review._ This section specifies the coordinated seam, not a producer owned or
completion-gated here. This work unit can land first: its transition field is optional and absence reduces to `full`.
`review-signal-convergence` can land later and begin supplying the already-accepted field without a migration or a
change to this reducer. Constructed-transition coverage proves this work unit's complete consumer contract; the
sibling owns production proposal-to-approval-to-response coverage. Neither work unit duplicates the other's side.

- **Transition.** `CandidateReviewResponseEvidenceV1` (`lib/work-unit/candidate-attestation.ts`) gains
  `approvedVerification?: targeted | focused | full`, copied from the approved disposition set at the one write site
  that already holds it (the response writer that calls `recordCandidateVerifiedResponse`, where
  `review-signal-convergence` enforces the ≥ floor — the one pass-through it adopted). This work unit owns the
  schema, the constructor
  (`createCandidateReviewResponseEvidence`, whose `responseId` preimage now includes the field), the record guards,
  the reducer, and every consumer. A transition without the field reduces to `full` — today's behavior, the
  fail-closed default, and what makes landing order against `review-signal-convergence` immaterial.
- **Reducer composition.** Today `reduceCandidateDurableBaseline` walks transitions alone, clearing
  `verificationCompleted` on any implementation-changing response, and only the final currentness projection
  consults lineage attestations, by subject digest against the final baseline. That cannot carry a `targeted`
  response that follows an attested `focused` one: the flag is already clear, a `targeted` response neither clears
  nor sets it, and no attestation covers the new subject. So the reducer takes the lineage attestations as input and
  walks them with the transitions. Before applying each `review-response`, it marks the running target satisfied when
  an attestation covers its subject, composes that transition through D2's `approved-fix` producer, and invokes D3's
  shared reducer with `evidence: verification`. The resulting `carries | supplemental | fresh` verdict is the only
  authority for the convergence state change: `carries` inherits satisfaction, `supplemental` establishes a pending
  `focused` requirement, and `fresh` establishes a pending `full` requirement. The lineage reducer never switches on
  `approvedVerification` independently. This is the explicit Member 1 → Member 3 seam; omission is normalized to
  `full` by the D2 producer before D3 runs, so either member may land first without duplicating the scope table.
  The projection gains one closed convergence shape: `{ convergenceVerification: satisfied,
  convergenceScope: null } | { convergenceVerification: pending, convergenceScope: focused | full }`. The pending
  scope is the broadest requirement among responses since the last satisfaction point; impossible satisfied/scope
  and pending/null pairs are rejected rather than represented. A pending set that is `targeted`-only is by
  construction satisfied, so `targeted` never appears as a pending scope and the attest verb never meets a
  `targeted` baseline that is pending. `CandidateCurrentnessProjection`, every effective-target projection, and the
  pre-publication request reuse that relationship instead of copying two independent fields. Every
  `convergenceVerification` reader derives from this one reducer through `projectCandidateCurrentness`, so the seven
  decision sites (`verbs/attest.ts`, `delivery/review-fix.ts`, `handlers/lifecycle.ts`,
  `pre-publication-procedure.ts`, two arms in `integration/checkpoint.ts`, `handlers/delivery-execution.ts`) agree by
  construction; only pre-publication action composition needs to inspect the pending scope.
- **`targeted`.** Convergence is satisfied by the fix increment's own Tier 1 evidence — the transition's existing
  `verificationEvidenceRefs` — with no convergence Tier 3, no criteria walk, no attestation; the lineage advances.
- **`focused` and `full`.** Both close through `arc attest` writing a lineage attestation
  (`CandidateLineageAttestationV1`) that gains a required `scope: focused | full` mirroring the evidence actually
  supplied: `focused` over the bounded check, `full` over today's Tier 3. A convergence invocation also requires one
  non-empty `verificationEvidenceRef` naming the fresh check result; the handler may not reuse the root
  `tasks-{name}.md#verification` reference. The attestation stores that reference and the successful JSON and
  interactive results echo the recorded scope and evidence. This composes the existing string reference and managed
  record — no evidence store or new attestation identity is introduced. Scope and evidence participate in canonical
  managed-record serialization and therefore its version; `CandidateLineageAttestationV1` has no separate digest
  preimage to extend.

_Amended 2026-09-12._ Each lineage attestation also carries the exact `responseId` whose pending convergence it
satisfies. The field is a foreign-key-style occurrence binding, not a new attestation identity or digest: it prevents
evidence for an earlier response from satisfying a later response when the same subject digest recurs. Record
validation requires that occurrence to be pending at the attested subject before applying the attestation.

- **Operation guard.** `arc attest` takes `--scope focused | full` with default `full` and a convergence-only
  verification-evidence operand. A root or unexplained-delta re-root remains full-only; `focused` is accepted only
  for a pending focused convergence requirement, while `full` may satisfy either pending requirement. A narrower or
  inapplicable request refuses before write with the Candidate and subject coordinates, requested and required
  scopes, and a precomposed verification action; missing fresh evidence likewise refuses without substituting the
  root reference. The managed-record guard applies the same scope ordering at the attested subject so a hand-edited
  narrower attestation cannot satisfy currentness.
- **Typed action.** The pre-publication request (`pre-publication-procedure.ts`) projects the closed convergence
  shape. `RunConvergenceVerificationActionSchema` and its composer carry the required scope and verification kind,
  naming one bounded focused check or today's Tier 3 full check and the exact scoped attest syntax once its evidence
  reference exists. `prepare-work-unit.md` renders that typed action without selecting scope in prose.
  `verify-work-unit.md` remains the full root/re-root procedure and has no convergence-action edit.
- The delivery-member `verification-response` kind is not reused: its guard requires an already-satisfied baseline and
  it records a correction delta, the inverse of what a same-subject bounded check needs.
- The unexplained-delta path is untouched: `blocked / establish-new-root` still follows fresh full verification, and
  that is the only path on which the success-criteria walk repeats. Criterion-text immutability and the
  `validate-criteria` digest stand.
- The liveness Errand ("resume scoped review-fix verification before Candidate re-root") fixes the route by which an
  explained delivery-member delta reaches its transition; without it that path degrades to `full`, never to a wrong
  answer, so it is sequencing, not a dependency.

### D13. ADR-034 amendment

ADR-034's reopening clause names this change ("any remedy that carries structural equivalence into the attestation
lineage changes authority semantics and requires an explicit amendment"). A Tier 2 dated annotation under
§ Amending This Document records that the lineage now advances on an approver-bound scope, with the disposition-set
approval as the authority, and that the Candidate root attestation and its subject-digest applicability are untouched.

### D14. Doctrine

- `strategy-concurrent-work` § Merge ordering between concurrent work units and § Worktree operations state the
  invariant plainly: sessions never coordinate around each other's landing windows; disjoint landings invalidate
  nothing; overlapping landings reconcile at the terminal boundary only. "Errand branches wait their turn" is
  revised to that invariant; "merge from one designated worktree" is removed (no identity rationale; already stale
  against the self-teardown step); "refresh the others after a merge" is revised because a between-sessions
  reconcile pass contradicts "disjoint landings invalidate nothing" (the bullet is append-only-compliant; that is
  not the conflict). The merge-queue bullet stays as a host-side option a team may enable, reworded so it is plain
  ARC builds none and re-reviews nothing at a queue head.
- `strategy-integration` § Review Admission and Head Movement carries the principle — evidence applicability follows
  covered content, never head movement as such — and names the method; § Terminal Integration Authority states the
  disjoint compose path and the CI contract the disjoint arm relies on: pre-merge evidence is the host's test-merge
  check as of run time, post-merge evidence is CI on the base, which must therefore run the same legs that gate a
  pull request or the project accepts the reduced coverage knowingly. `strategy-concurrent-work` cites, never
  restates. `review-orchestration-right-sizing`'s doctrine-home item is discharged by it.
- `integrate-work-unit.md` narrows "clearance never carries" to the overlapping base-merge arm.
- `DEV-RULES.ARC` § Review-Increment Invariant's fourth exception, "a typed safe base reconcile", is amended through
  package source so that "safe" means host-mergeable with the overlap disclosed and Tier 1 green, with the
  review-applicability judgment owed at the checkpoint and exact-head authorization still gating the merge. The merge
  commit is git-generated content the checkpoint approval already sees, so a separate stop before its push would be a
  stop with one answer (maintainer decision, 2026-09-09).

### D15. Fire-points this work unit marks

Each is a marked fire-point in a workflow this work unit edits, with `assess-evidence-applicability` declared only
where D3's typed reducer can return `judgmentRequired: true`. Deterministic arms remain inside their verbs and do not
load the method:

- `integrate-work-unit.md` — the Step 10 checkpoint's post-reconcile applicability result when it exposes a bounded
  residual; review status's pre-reconcile movement result stays deterministic;
- `deliver-stack.md` — a delivery member-rewrite applicability result carrying the same judgment-required shape, not
  mechanical eligibility or terminal-position classification; and
- `run-errand.md` — the pre-mutation `arc errand merge` result only when it carries that shape; the workflow returns
  through applicability review and obtains a fresh integration approval before any terminal mutation.

`verify-work-unit.md` and `prepare-work-unit.md` carry no fire-point: at the attest / convergence arm the verdict is
computed by the reducer from an approver-bound scope, so the method has nothing to judge there. Only
`prepare-work-unit.md` receives D12 action-rendering edits; `verify-work-unit.md` remains unchanged. The review-fix
disposition gate, where the scope is chosen, is the review cohort's seam.

### D16. Required-check waiting promptly yields the existing checkpoint-backed continuation

The current production composition gives `arc integrate merge` a ten-minute `awaitRequiredChecks` instance with a
ten-second initial polling interval (`merge-composition.ts`). The reducer already has the correct post-approval
shape: it retains the immutable checkpoint and draft lock on `awaiting-checks`, replays settlement idempotently, and
revalidates the approved head, target, lifecycle version, merge method, and final drift on every retry. The defect is
the foreground policy around that substrate, not a missing authority record.

Replace the integration merge's bounded polling instance with **one bounded required-check observation**. Extract a
coordinate-only observation contract from `checks-await.ts`:

```text
observeRequiredChecks({ repository, pullRequest, headSha }, { port, signal })
  -> not-required | green | failed | pending | stale-target | target-mismatch | unavailable
```

The closed result owns sanitized availability detail; an injected abort signal and the host process runner's deadline
bound the one external read. Timing policy remains solely on `awaitRequiredChecks`, which composes the observer through
`boundedWait` and retains its elapsed-time result for callers that explicitly await. `arc integrate merge` invokes
the observer once and contains no sleep or polling loop. "Prompt" means no deliberate sleep or repeated observation
inside the merge invocation, not zero transport latency. The ten-minute checks budget and ten-second polling constant
leave `merge-composition.ts`. The result dispatch is:

- `green` or `not-required` — continue through the existing post-check target refresh, merge-method validation,
  final drift read, lock release, and exact-head merge;
- `pending` — return `awaiting-checks / retry` immediately, keeping the checkpoint and draft lock;
- required checks `failed`, or the observed head / repository `stale` — take the existing approval-voiding
  invalidation, re-lock, and return the failed rows or changed coordinates with the corrective remedy; and
- checks `unavailable` — return `awaiting-checks / retry` with the typed availability detail, keeping the checkpoint
  and draft lock because transport availability changed no authorized effect.

The `awaiting-checks` payload becomes a self-contained **continuation**: it repeats the exact `checkpointHandle`, the
approved head and pull request, the current required-check rows and diagnostic failures, an observation kind
(`pending | unavailable`), and a structured retry remedy whose argv is exactly
`arc integrate merge {name} --checkpoint {checkpointHandle} --json`. The handle addresses the existing create-only
checkpoint composition in the managed work-unit workspace; no second continuation store, mutable approval record,
configuration key, background process, or agent-authored retry loop is introduced. The integration result drops
`elapsedMs`: no wait was served, and retaining the field as observation duration would preserve a misleading
contract. The explicit review-await result keeps its own elapsed-time field unchanged.

Re-entry is idempotent by construction. Replaying that argv first recognizes an already-merged exact target, then
re-executes the checkpoint's settlement plan idempotently and runs the complete binding cascade before another checks
observation. The prior approval carries only while the checkpoint still names the same head, target, lifecycle
version, settlement plan, and merge method and the final drift arm still admits the same merge effect. Any changed
binding takes the existing invalidation path; unavailable or pending checks alone do not counterfeit such a change.

Workflow prose dispatches the typed result once: surface the check rows, diagnostic failures or availability detail,
and the precomposed retry remedy, then return control. A later operator- or harness-initiated re-entry may invoke the
continuation after external check progress; the workflow never recursively polls. D11's future `enqueue` seam stays
unchanged because host auto-merge still cannot pin the authorized head across later pushes on the supported lane,
while the present defect needs no autonomous merge authority to solve. Errands use the same observer and an
Errand-specific exact request continuation before their direct merge; they do not arm native auto-merge.

## Alternatives & Rationale

- **Repository-scoped integration lane or queue (the original direction).** A claim in git refs or a host label,
  head-of-line, priority, an exclusive final-integration window. Rejected: it serializes a merge git already
  serializes, automates a re-check ARC has made too expensive rather than removing it, adds coordination state the
  storage evolution would later have to fold into a backend, and contradicts ADR-025's doctrine-over-mechanism
  posture. No queue in industry re-reviews; a queue would still pay ARC's judgment cost at the queue head. Merge
  queues remain a recorded non-goal in ADR-025, the delivery-stack `queue-not-atomic` downgrade, and the
  concurrent-work research note.
- **Proportionate base-movement policy (selected).** Distinguish disjoint from overlapping movement, derive exact Git
  feasibility locally, and let a provider-neutral host-admission fact settle whether the external merge is offered.
  ARC composes its own gates on top instead of adding a stricter currency rule.
- **Defer entirely to the host's signals.** Insufficient alone: provider merge state does not express ARC's path
  overlap or evidence applicability, and an opaque refusal does not reveal its cause. Host admission composes with
  exact Git facts; it does not replace them.
- **Expose provider payload fields in the evidence envelope.** Rejected: a pull-request field name is neither a
  provider-neutral semantic contract nor proof that the value belongs to ARC's exact base/head observation. D5 keeps
  native payload interpretation in the adapter and admits only exact-bound semantic facts into core.
- **Keep the policy, make the wait unattended.** Automating the reconcile loop preserves a cost with no safety return
  and still owes delivery rebuilds.
- **An ARC-side strictness key.** Rejected, recorded so it is not re-proposed: every mainstream host already exposes
  the "require branches to be up to date" knob, so an ARC key would be a second authority for one fact and
  speculative capability with no requesting team. The only condition that reopens this is a team without host branch
  protection asking for ARC-only strictness, and that team's answer is host protection.
- **A distinct terminal await verb before a green-only merge.** Dropped: its motivating failure is fixed (`4cff6d787`
  keeps checks waits locked and bounded) and no concrete pain remains.

  _Amended 2026-09-09 — `plan-segmentation` field evidence reopens the conclusion, not the separate-verb shape._ The
  ten-minute in-process wait crossed a session compaction boundary and lost its result. D16 selects one observation
  followed by the existing merge verb's checkpoint-backed continuation; a second verb would split an already
  idempotent exact-effect operation without adding authority or recovery value.
- **Arm host auto-merge or a merge queue after approval.** Still rejected for this lane: the supported host's
  auto-merge survives later pushes and therefore cannot preserve the approved exact head, while native queue
  integration remains D11's future additive seam. D16 removes foreground waiting without weakening the pin.
- **Extending the verdict enum with a movement value.** Rejected in favor of the additive `movement` field: it
  preserves the recorded "raw distance controls the verdict" invariant and keeps unaware consumers fail-closed.
- **Blanket exclusion of planning directories.** Rejected: silently ignoring foreign WU artifacts would hide an
  out-of-scope write. D1 instead excludes the current WU's identity-bound planning group from implementation evidence
  regardless of storage mode, while foreign artifacts remain reviewable and the shared `ROADMAP` projection retains
  its explicit regenerable treatment.
- **Rewriting the two D4 classifiers into one type.** Unsupported by any chartered goal and collides with
  `review-signal-convergence` building on them now; the envelope composes over their existing projections and the
  merger is captured for after that work unit lands.
- **A pre-push stop before the overlapping base merge.** Rejected by maintainer decision on 2026-09-09 in favor of
  amending what "safe" means in the Review-Increment Invariant's exception (D14): the merge commit is content the
  checkpoint approval already sees, so the stop would have one answer.
- **Carrying the approved scope through the disposition store.** Rejected: the reducer is a pure function over the
  Candidate record and must stay one; the one-field pass-through at the response writer is the smallest carrier.
- **Depend on all of `review-signal-convergence`, or copy its producer here.** Rejected: the sibling is a large
  independently progressing work unit, and its producer is joined to its immutable disposition and authorization
  graph. Waiting would serialize unrelated delivery; copying would violate the explicit proposal-side non-goal and
  create competing contract owners. The optional transition field plus fail-closed `full` default is the smallest
  independently landable seam.
- **Keep the Errand movement matrix in workflow prose.** Rejected by the procedure-evolution self-check: it would make
  the agent classify exact state, provider failures, and lock recovery. D9's typed verb is the smallest complete
  correction because it composes existing ports and adds no durable state.
- **Reusing the `verification-response` transition for `focused`.** Rejected: its guard requires an already-satisfied
  baseline and records a correction delta, the inverse of a same-subject bounded check.

**Grounding correction folded at this stage.** The draft had the conflict-resolution remedy name "the conflicting
paths from the host read". The host's `mergeable` boolean carries no per-path data (the checkpoint's own comment says
so); the remedy names the substantive overlap paths from the overlap read instead (D5). A local interface correction,
not a design change.

## Cross-cutting Considerations

**Trust boundaries.** Every carry is decided from ARC-observed Git facts plus a provider-neutral host-admission fact
whose repository, change request, base, and head match ARC's exact observation; a bare provider boolean or status code
never unlocks anything. Git feasibility and host admission retain separate authorities. Exact-head merge
authorization, the integration interlock, the draft lock, and the append-only invariant are untouched. The
approved-scope carry in the lineage is bound to a disposition-set approval a person made; the agent's own
`applicability` selection still releases nothing, and the fail-closed default (`full`) applies to every record that
lacks the field. The attest verb and record guard both refuse a narrower scope than approved.

The exact-pair observation binds evidence, not an unavailable base-ref compare-and-swap. The interlock surface names
the exact head, target base ref, last observed base OID, and residual in-call provider race. A successful host mutation
is accepted only after exact approved-head change-request confirmation; projects that require stronger base currency
obtain it from host policy or a native queue rather than an ARC-side shadow rule.

**Coordinated verification seam.** `review-signal-convergence` owns the proposal-side `proposedVerification` carrier,
its approval binding, and its response-writer pass-through. This work unit owns the optional Candidate transition
field and all downstream reduction, with the lineage consuming D2/D3 rather than reimplementing their scope table.
Criterion 7 therefore exercises test-constructed transitions and the transition constructor, not the sibling-owned
proposal path. Until the producer lands, every production transition omits the field and reduces to `full`; that is
the declared compatibility state, not evidence that scoped production behavior already activated. The work units
have no completion dependency and retain one owner per contract side.

**Failure behavior.** Unavailable overlap or Git feasibility → today's `unsafe-reconcile` stop. Unresolved or unbound
host admission → `host-pending / retry` after a bounded re-read, never an overlap remedy. Exact substantive conflict
→ conflict stop; a registry-only conflict composes the existing regenerating base-merge arm. An opaque host refusal
→ `host-refused`; only independently proved `base-currentness-required` plus complete integration evidence selects
`reconcile-base`. A failure proved to precede mutation → `operation-failed`; an indeterminate mutating-call result
whose exact confirmation is unavailable → `merge-outcome-unknown / retry`, with no inferred failure or relock. An
unexplained Candidate delta → fresh full verification, unchanged.

**Failure ergonomics.** Every public operation changed here uses the same result discipline: semantic reason first,
sanitized cause detail second, structured continuation where safe. The inventory is base drift and typed base merge,
checkpoint and terminal integration, delivery eligibility and terminal status, review status, required-check
observation, Errand merge, scoped attestation, and pre-publication action composition. Each preserves the decisive
coordinates and names what must change before retry. A terminal non-automatable case names that boundary explicitly
rather than emitting a dead-end command. Provider diagnostics may be normalized or referenced opaquely, but never
discarded. Unexpected adapter exceptions become an actionable `operation-failed` result when non-mutation is
established, or `merge-outcome-unknown` when the mutating effect cannot be established, instead of escaping or
disappearing into logs.

For delivery eligibility, `wrong-predecessor` retains `overlapping-ahead` versus `unrelated`, including the exact
observed tip, member, merge-base when present, and overlap paths; both explain that the separately owned chain rebuild
is required and that this work unit supplies no safe rebuild command. A moved source instead supplies the exact
eligibility re-prepare action. For review status, `base-moved` retains the movement classification, exact head/base,
overlap or unavailability detail, and the calling checkpoint continuation when constructible. Pre-binding review
composition and other adapter boundaries preserve caught error detail rather than replacing every exception with an
unexplained `evidence-unavailable` token.

_Amended 2026-09-09._ Delivery drift classification may read the durable Candidate baseline before currentness is
re-established against an advanced base, but it fails closed on a missing record, invalid baseline, unresolved
revision, or diff failure. A classifier result never substitutes for the downstream currentness, terminal-rebind,
or exact-head authority checks; those retain their existing typed failures.

_Amended 2026-09-09._ Required-check `pending` and `unavailable` are resumable observations, not approval-invalidating
facts: both return the exact checkpoint-backed continuation while the draft lock stays held. A failed required check
or stale target still invalidates and re-locks. The unavailable arm carries the host error and exact retry remedy;
the pending arm carries required rows plus any already-failed diagnostic rows beneath a still-pending rollup.

_Amended 2026-09-09._ Scoped attestation never turns an invalid or missing scope/evidence input into a generic
Candidate failure. A refusal identifies the operation, exact Candidate subject, requested and required scope, and
whether fresh evidence is absent, then returns the matching focused or full verification action. Successful
convergence reports the scope and evidence reference it actually recorded. Root and re-root keep their full-only
meaning rather than silently ignoring a focused option.

**Compatibility and migration.** ARC is pre-public-release: the Candidate subject treatment enum, the
`review-response` transition preimage, and the lineage attestation shape change in place, with no aliases or migration
readers; development Candidate records regenerate. The session-init `baseDistance` value schema admits `movement`
(and validates that the not-applicable arms carry none). The `review-applicability` v2 schema leaves the durable-record
inventory with its module. Workflow, method, rule, and strategy edits go through `packages/arc-framework/arc/**` and
sync to `.arc/**`.

**Testing.** Unit: `movement` classification (all three values, evidence-completeness not required); the registry
(complete own planning group, foreign WU artifacts, projections, relocations, `ROADMAP`, Errand checkout, and
tracking-mode independence); every D2 producer and explicit not-applicable axis; exhaustive D3 reducer rows that
distinguish evidence-relevant unknowns from inert not-applicable axes; residual-only method presentation;
exact-coordinate host-admission binding;
provider-adapter positive proof, strict-policy proof, bounded re-read, and conservative unresolved negatives;
checkpoint dispatch over movement × Git feasibility × host admission; the existing regenerable-only remedy through
a determinate exact-parent/index render, with parent movement, indeterminate render, and wider-conflict rollback; the
pinned-merge adapter's semantic refusal classes and
exact approved-head success confirmation; pre-call base movement invalidation and the disclosed in-call race; and
`arc errand merge` dispatch, lock re-hold, applicability-judgment return, and direct-only terminal release. Mutating
call timeout, transport, and malformed-response fixtures prove exact confirmation to success, confirmed-unmerged
failure handling, unavailable confirmation to `merge-outcome-unknown` with both diagnostics and no uncertainty-only
relock, and exact retry settlement without duplicate effects or a swallowed confirmation error.

Delivery coverage includes the shared exact-revision overlap primitive with explicit non-`HEAD` revisions and
explicit WU or unbound treatment context; all four predecessor relations with separate observed-tip and chain-base
coordinates; eligibility-snapshot schema, caller tampering, and protected-ref movement between prepare and close;
initial materialization, pre-binding review-target composition, and suffix rematerialization; both lifecycle
comparators and every direct adapter/caller, including preservation of `chain-containment.ts`'s closed-common-base
semantics and rejection of a nonterminal readiness change; ordinary host landing with the custom readiness driver
disabled; terminal dual-sided readiness conflict routing through D5; the terminal classifier's inert exclusion and
durable-baseline ordering; and useful relation-specific refusals. Candidate-cache coverage proves one versioned
record read shared by distinct explicit-base projections,
no implicit bound-base sentinel, and a final version assertion before checkpoint persistence that returns the typed
recompose result on movement. D8 coverage proves exact reviewed-head availability, subject-derived treatment context,
direct `BaseMovementObservation` adaptation, disjoint retention, and deterministic overlapping/unknown checkpoint
reruns without invoking residual judgment.

The Candidate reducer's scope coverage proves every response first crosses D2's `approved-fix` producer and D3's
shared verification reducer, with no second scope switch; `targeted` inherits satisfaction, including after an
attested `focused` response; an absent field reduces to `full`; the broadest pending scope wins; a full attestation
satisfies a focused requirement; and impossible satisfied/scope or pending/null pairs are rejected throughout
currentness, effective-target, and pre-publication request projections. Attestation coverage proves focused and full
scope plus fresh evidence round-trip, managed-record version change, missing-evidence refusal,
focused-against-full refusal, and focused root/re-root refusal before write. JSON and interactive results preserve the
recorded or required scope, evidence reference, Candidate coordinates, and corrective action. Integration: checkpoint
and merge runs against fake
provider adapters for each arm; Errand
direct, awaiting-checks, applicability-judgment, refused, unknown-outcome, and invalidated paths through the typed
verb, with release-only lock handling retained through its separate operation; a delivery eligibility run over a
disjointly advanced base through initial and suffix materialization; and a pre-publication procedure run across
constructed `targeted`, `focused`, and `full` transitions. Existing tests that assert `unsafe-reconcile` on every
overlap, `base-moved` on any containment failure, or a Tier 3 after any implementation change are updated to the new
arms.

The delivery-ordering regression constructs a real three-member unlinked sequential stack and disables the custom
readiness merge driver. After its first member lands, the drift read proves the exact integration commit with complete
evidence and empty overlap while the next Candidate is not yet current against the advanced base. Classification
reaches the disjoint path from the durable baseline, ordinary nonterminal landing preserves every reviewed head, and
checkpoint composition proceeds to the downstream applicability/currentness gates rather than returning
`drift-classification-unavailable`. A member-authored readiness change fails the lifecycle-neutral eligibility
invariant; a terminal dual-sided readiness conflict routes through D5. A separate overlapping fixture intersects the
predecessor path set and still returns `predecessor-overlap`; malformed baseline and unreadable-diff fixtures remain
unavailable.

The D16 amendment adds unit coverage for the coordinate-only observation union, injected abort/deadline behavior,
sanitized `unavailable`, prompt pending and unavailable continuations, self-contained retry argv, removal of the
integration-only `elapsedMs`, unchanged-approval replay, and failed / stale invalidation with re-lock. Separate tests
prove `awaitRequiredChecks` still composes that observer through `boundedWait` and retains elapsed time. Integration
coverage proves an ordinary pending checks set returns without calling the bounded wait or sleeping, and the same
checkpoint later reaches merge after checks turn green. The checks command's JSON result and workflow presentation
are both covered; workflow pins assert surface-and-return, never recursive re-invocation.

The required lineage-attestation scope updates every literal non-empty attestation fixture across unit, integration,
and E2E suites in place; no compatibility alias or migration reader masks an old development record. Focused
Candidate tests cover the constructor, managed-record guard, record store, effective target, applicability resolution,
attest verb and handler, pre-publication request/composition/action, delivery review-fix consumers, checkpoint and
publication gates, status, and Candidate-lineage E2E route.

Method-installation coverage verifies classification, recipe inclusion, generated manifest membership, the session-
operations reverse index, the package-project configurable inventory/count, init and reconfigure output, and
framework-sync parity. Workflow tests prove each declared executing-session fire-point is marked.

Every agent-facing non-success fixture also asserts its stable semantic reason, most specific sanitized detail,
decisive coordinates, and either executable structured remedy or explicit terminal explanation. Paired JSON and
interactive fixtures prove formatting does not swallow adapter failures or weaken the next action.

**Performance.** Delivery eligibility and a non-contained review-status read each pay one exact-revision overlap
pair when classification is required; the existing base-drift analyzer becomes a wrapper over the same primitive.
Callers supply revisions they already observe. Review status retains its existing base fetch and resolves the exact
reviewed head locally, fetching only when that exact revision is not already available; session init pays none. Each
merge-offering path performs one complete pre-call host-admission observation, with its abortable adapter-internal
re-read capped at three. A definitive merge refusal reuses the adapter's semantic result and reobserves only target
coordinates needed to rerun the planner; it does not repeat the full host observer by default. Ambiguous mutation
adds one exact confirmation read because avoiding a duplicate merge is an irreversible-effect boundary. The supported
GitHub adapter's positive exact-pair proof costs one test-merge commit read on the ordinary path.

The D16 amendment removes up to ten minutes of foreground residence and every checks-poll sleep from the terminal
merge invocation. A pending retry repeats cheap, idempotent settlement and exactness reads only when an operator or
harness re-enters; it does not exchange model polling for a CLI busy loop.

**CI contract.** The disjoint arm relies on the pull-request check running on the host's test-merge ref as of its run
and on base CI as the post-merge backstop; required-check evidence remains explicitly head-bound and does not claim a
base-OID pin. This repository's push-to-`main` CI runs lint, typecheck, and unit only; integration, e2e, and
portability are pull-request-only. Doctrine (D14) names what base CI must cover and discloses the external-seam race;
bringing this project's own `main` CI up to that contract is a project CI change captured separately.

**User-facing impact.** Ceremony disappears on the disjoint path: no base merge, no gate re-run, no recompose, no
re-approval, no delivery rebuild. On the overlapping path the operator sees one typed arm with the overlap disclosed.
Once the coordinated producer supplies an approved scope, a `targeted` review fix no longer costs a full suite and a
`focused` one costs one bounded check; until then the production default remains full.

When required checks are pending, the same command now returns after one observation with an exact retry command and
diagnostics. The session is free for other work; unchanged approval resumes later, while a changed target fails back
to checkpoint composition.

**Delivery (delivery-plan candidate, not bound).** Three independently reviewable surfaces, in landing order: the
applicability substrate (D1–D3's registry, envelope, and deterministic reducer); concurrent integration (D3's
residual-judgment method, D4–D11, and D14–D16); and scoped verification with its ADR amendment (D12–D13). The latter
two consume the first member's substrate; the verification member accepts its optional producer field without a
completion dependency on `review-signal-convergence`.

**Coordination.** Sequence edits to `integrate-work-unit.md` with `review-signal-convergence` (Step 3/4 regions and
every presentation site of the disposition set, including `prepare-work-unit.md`'s review-fix paragraph) and
`review-activity-contracts` (applicability step); this work unit edits Step 10, the drift arms, and the convergence
arm. Two asks to `review-signal-convergence` stand: consume applicability only through the public verbs, never
classifier internals, because the envelope composes beneath them; and adopt the method's output vocabulary so its
coverage-basis language matches. One ordering constraint runs one way: the transition schema is strict, so the
sibling's writer can emit `approvedVerification` only after this work unit's schema field lands; until then it omits
the field and every consumer reduces to `full`. This work unit has no ordering constraint on the sibling. At planning
close, the seven captures the draft's coordination note enumerates — the review-lane doctrine sentence, the narrowed
`delivery-authoring-rebuild` boundary, the `baseContained` ownership notice, the push-to-`main` CI gap, the method
signature to the two review work units, the D4 classifier merger, and the orphaned cohort reference — route via
`USER-INBOX`.

## Success Criteria

The field outcome — verified work units publishing and integrating concurrently while Errands land throughout, with
no session pausing for another — is the goal. The criteria below are its checkable derivatives, validated at
completion.

1. An integrating singleton work unit whose base advanced only disjointly, with exact Git feasibility and a
   provider-neutral host-admission fact bound to the same repository, request, base, and head, reaches
   `ready / request-approval` with zero reconcile commits and zero re-judgments; the ready surface names the movement
   and admission fact.
2. Overlapping movement that is Git-clean and host-admitted takes the typed base-merge arm once when integration
   evidence is complete; a registry-only conflict takes the existing regenerating base-merge arm. Both then run one
   fresh checkpoint and one fresh approval. Substantive conflicts and incomplete evidence stop.
3. `arc integrate merge` never folds a host refusal into `operation-failed` or infers its cause from `behind`.
   Independently proved `base-currentness-required` plus complete integration evidence returns
   `invalidated / reconcile-base` with the expected base and head; an opaque policy refusal returns
   `blocked / host-refused`. An indeterminate mutating-call result returns `merge-outcome-unknown / retry`, preserves
   the exact checkpoint approval and both diagnostics, and neither claims failure nor re-locks solely from
   uncertainty. `arc errand merge` returns the same semantic outcomes and re-holds the lock on every definitively
   unapproved post-release exit.
4. A delivery whose bottom member's observed protected-base tip advanced disjointly — including by a sibling ship
   that regenerated the project readiness document — is eligible while preserving the older chain base as its real
   predecessor. Initial materialization persists the chain base only after revalidating the observed tip; suffix
   materialization compares the chain base with the persisted target; and close rejects a moved tip or caller-altered
   relation. Every admitted nonterminal retains the chain-baseline readiness entry, so a base-only regeneration lands
   as a one-sided host merge with the custom driver disabled and preserves the reviewed member head. A nonterminal
   competing render is rejected; a terminal dual-sided render routes through the exact-parent, determinate D5 remedy
   and fresh approval. No delivery rebuild is owed for the eligible one-sided case, and the terminal classifier never
   refuses on inert-only overlap. Overlapping movement still refuses `wrong-predecessor` with exact relation evidence
   and an explicit terminal explanation.
5. `arc review status` returns `base-moved` only for overlapping or unknown movement, preserving the exact reviewed
   head, observed base, overlap or unavailability detail, and a structured checkpoint continuation or explicit
   terminal explanation.
6. `movement: unknown`, unavailable Git feasibility, unresolved host admission, or an admission-coordinate mismatch
   never produces a carry on any path; provider payload fields and status codes do not appear in core contracts.
7. Over test-constructed Candidate records and the transition constructor: a `review-response` with
   `approvedVerification: targeted` leaves
   `convergenceVerification` satisfied on its own Tier 1 evidence, including when it follows a `focused` response
   closed by an attestation; `focused` is pending until a lineage attestation with `scope: focused` covers the
   subject, and `arc attest --scope focused` is refused when `convergenceScope` is `full` or the operation is a root
   or re-root. Focused/full convergence requires and records a fresh evidence reference, impossible convergence
   status/scope pairs are unrepresentable, `full` still requires full convergence verification, an unexplained delta
   still establishes a fresh root, and a transition lacking the field behaves as `full`. No proposal-side producer
   is required for this criterion or claimed as this work unit's output.
8. `core/applicability.ts`, its inventory row, and its tests are gone; the `applicabilityId` field consumers are
   untouched and the schema-registration test passes.
9. The base-drift analyzer's verdict tests are unchanged; the `movement` field is present on every healthy reading
   and absent on the not-applicable arms.
10. The method file is classified, included by recipe, present in the generated manifest and package-project
    inventory, and listed in the session-operations reverse index; init, reconfigure, classification, and framework-
    sync tests prove it ships. Every executing-session fire-point in D15 is marked and the three workflows declare it.
11. Doctrine reads as D14 states, the Review-Increment Invariant's fourth exception carries the amended meaning in
    package source and `.arc/`, and ADR-034 carries the dated Tier 2 annotation.
12. Quality gates: the full suite, both type checks, and Markdown lint are green; the ARC contract checks pass.
13. With required checks pending, `arc integrate merge` performs one coordinate-bound observation and promptly
    returns a self-contained `awaiting-checks / retry` continuation over the exact checkpoint handle without sleeping
    or polling. Replaying it is idempotent: green checks merge the unchanged authorized effect; pending or unavailable
    checks preserve the approval and draft lock with actionable diagnostics; failed checks or stale bindings
    invalidate, re-lock, and route to their corrective remedy.
14. Delivery drift classification does not require Candidate currentness before it can classify the base movement:
    after the first member of an unlinked sequential stack lands with complete topology evidence and empty overlap,
    the next member reaches the disjoint continuation from its durable Candidate baseline rather than
    `drift-classification-unavailable`. One versioned managed-record read feeds every explicit-base projection in the
    checkpoint invocation, and a version change before create-only persistence returns a typed recompose result.
    Interacting predecessor overlap still refuses, and no reconcile, rebind, checkpoint, or merge proceeds without
    the ordinary post-classification currentness and exact-head checks.
15. The applicability envelope is total across every cause, with explicit not-applicable axes and approved scope;
    one exhaustive TypeScript reducer returns `carries | supplemental | fresh` for every valid arm. Unknown or
    unavailable evidence fails closed only when its axis is relevant to the selected cause/evidence pair;
    cause-inapplicable axes remain inert. The method fires only for bounded residual judgment and contains no
    deterministic dispatch table.
16. `run-errand.md` invokes a typed `arc errand merge` result after approval, returns a judgment-required arm through
    its marked applicability fire-point and fresh approval before mutation, and never arms native auto-merge. The
    existing release-only lock operation remains a separate explicit route. No workflow branch compares movement or
    provider failure values, invokes a raw provider merge command, or authors lock-recovery mechanics.
17. Final release authorizes the exact approved Candidate head and change request into the named target ref under the
    host's configured policy, not an exact base OID. A pre-call base movement invalidates the observed evidence; a
    successful result confirms that exact request and head merged into the target and returns the provider merge
    identity when available. The approval surface discloses the last observed base OID and residual in-call provider
    race, and required-check evidence remains head-bound unless the host supplies a stronger currency guarantee. An
    ambiguous mutating response is confirmed against that exact request before success or failure is claimed, and
    exact retry cannot duplicate the effect.
18. Across every changed public operation—base drift and merge, checkpoint and terminal integration, delivery
    eligibility and terminal status, review status, required-check observation, Errand merge, attest, and
    pre-publication action composition—every agent-facing non-success variant preserves a stable semantic reason, the
    most specific useful sanitized detail and decisive coordinates, plus either executable structured remedy argv or
    an explicit terminal explanation. JSON and interactive projections agree; no provider or adapter failure is
    swallowed, stranded in logs, or collapsed into a generic operational error when a narrower cause is known.
19. The current work unit's complete identity-bound planning-artifact group is non-evidence-bearing for Candidate
    implementation review and base-overlap classification regardless of whether those files are tracked or
    materialized. Planning-stage review remains separate; foreign WU artifacts, shipped ARC machinery, implementation
    code and tests, and ordinary implementation documentation remain reviewable. Relocation or an accompanying edit
    to the own planning group does not manufacture an implementation delta.

## Open Questions

- Where the bounded host-admission re-read's spacing lives (adapter-local policy beside the three-read cap) is an
  implementation choice.

---
