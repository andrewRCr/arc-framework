# Notes: evidence-applicability

- [Substrate inventory](#substrate-inventory)
- [Terminal checks-wait field evidence](#terminal-checks-wait-field-evidence)
- [Delivery drift classifier-ordering field evidence](#delivery-drift-classifier-ordering-field-evidence)
- [Applicability architecture and proportionality decisions](#applicability-architecture-and-proportionality-decisions)
- [Delivery and review applicability decisions](#delivery-and-review-applicability-decisions)
- [Terminal integration decisions](#terminal-integration-decisions)
- [Scoped verification decisions](#scoped-verification-decisions)
- [Planning-close captures](#planning-close-captures)

## Substrate inventory

Reference material for task generation and execution: what the codebase already holds that the spec composes over,
recorded so grounding passes start from the inventory rather than re-deriving it.

- **Overlap evidence is computed and then ignored for the verdict.** `analyzeBaseOverlap` intersects the branch's
  changed paths with the base's changed paths since their merge-base and classifies each as substantive or
  regenerable; `reconcileSafety` in the checkpoint uses the result only to decide whether the typed `arc base merge`
  may run. Surfacing that computation beside the verdict is composition, not new mechanism.
- **The classifier's inert set is one path, and that is the only shared ceremony surface.** Only `ROADMAP` is
  regenerable (`current-adapters.ts`). Archives land in distinct per-work-unit directories under `.arc/completed/`
  and never overlap by path; the one file two sibling ceremonies both touch is the tracked readiness projection.
  `ROADMAP` merges locally through a custom driver (`.gitattributes`, `merge=arc-roadmap`) that the host's
  server-side merge never runs, so two regenerated renders reach the host as a textual conflict.
- **Branch-carried projections are already a recorded defect.** `roadmap-tooling` holds the target that a work-unit
  branch should not carry a project-level `ROADMAP` diff at all; `operational-state-docs` and the storage evolution
  classify `ROADMAP` as materialized operational state; `project-state-integrity` shipped regenerate-wins. The
  tracked projection is temporary, and every `regenerable` arm in the spec is written to degenerate to nothing when
  it retires.
- **Path-intersection carry already exists in the review core.** `core/applicability.ts` derived
  `treatment: carry | incremental` from `reviewedPaths ∩ deltaPaths` with no callers;
  `review-applicability-authority.ts` carries an Owner `covered` selection across a mechanically-proved segment. The
  semantic precedent for "non-overlapping movement is safe" was in code before the spec named it.
- **The Candidate attestation is already safe against base movement.** It binds the work unit's own subject digest;
  unrelated base movement leaves it `applicable / recognize-current`. Under base movement, verification does not go
  stale — only the checkpoint, review status, and delivery coordinates do.
- **`retrigger: full-final` is inert.** No behavioral consumer reads it; it participates only in requirement identity
  digests (`routing.ts`, `routing-schema.ts`, `project-promotion-schema.ts`, `reduce-command.ts`,
  `respond-command.ts`). The re-review pressure on head movement comes from the containment arms and workflow prose,
  not routing policy.
- **The terminal instant is already serialized.** `arc base merge --expected-base --expected-head` is an ARC-owned
  compare-and-swap; `arc integrate merge --checkpoint` pins the approved Candidate head, revalidates the observed
  base before release, and asks the host to atomically merge into the named target ref. The host API offers no base-OID
  compare-and-swap operand. The draft lock (ADR-031) keeps the unlocked window seconds wide.
- **Merge queues are a recorded non-goal in three places** (ADR-025 doctrine over mechanism; the delivery-stack
  spec's `queue-not-atomic` downgrade; the concurrent-work research note). The one code mention,
  `native-landing.ts` `mergeAction === "queue"`, refuses or downgrades. That refusal is the minimal seam.
- **Prior decisions already point this way.** ADR-025 names the behind-base check at integration as the real safety
  net, so it must be proportionate. ADR-034 separates member review and checks (incremental) from merge acts (the
  `Integrating` window): the window is a merge window, never a review window. The native-stack design commits that
  "the protected base is never frozen" and budgets no manual recuts. The review cohort's shared goal (D7.4:
  "exact-head movement … does not by itself invalidate the applicability of prior complete coverage") states the
  same principle from the review side.
- **The applicability surfaces are ten, and they answer one question in five vocabularies.** "Prior evidence still
  holds" is `carry`, `recognize-prior-review`, `recognize-current`, `current`, and `retain-prior-attempt` across
  `core/applicability.ts`, `review-contribution-applicability.ts`, `candidate-applicability.ts`,
  `candidate-attestation.ts`, and `review-applicability-authority.ts`. "Base moved" is detected four independent
  ways (`behind`, `merge-base --is-ancestor`, OID inequality, re-observed heads). Path-set intersection is
  implemented three times with three result vocabularies. The review-contribution and Candidate classifiers are the
  same D4 algorithm twice, differing only in baseline (head versus subject digest) and in the Candidate side
  filtering by path treatment.
- **Cause-awareness is inverted relative to authority.** The base-drift read names which work unit landed and by what
  proof, and feeds only an advisory line and a set intersection; the surfaces that gate authority discard cause and
  ask a human. Only the Candidate lineage reducer knows a delta's cause (its transition kind), and it uses that for one
  thing: an unexplained delta blocks.
- **Verification and review clearance are separate objects with separate staleness.** The Candidate attestation is
  keyed to the reviewable subject digest and survives head movement; review clearance is keyed to the exact head and
  never carries. The three-valued owner choice (`covered | targeted-check | changed`) exists on the verification side
  only; the review side offers two (`covered | review-required`). The scoped re-verification transition kind
  (`verification-response`) is reachable only from the delivery-member correction path.
- **The success-criteria walk repeats only on the unexplained-delta path.** The normal convergence arm demands gates,
  not criteria. Nothing in the review-fix gate — the disposition set, `review-triage`, `review-response` — refers to
  success criteria; a comment typo and a fix that reverses a criterion produce the same outcome. Criterion text is
  already immutable and `validate-criteria` already digests criterion identity; neither is connected to the fix path.
- **The delivery subsystem already tolerates append-only target movement** outside eligibility: position facts report
  it as `targetMovement: append-only`, `suffix-reconciliation.ts` admits it as a non-mismatch, and the refresh
  planner discloses that base movement alone obligates no refresh. Eligibility's ancestry check and the two
  lifecycle-path tree comparisons are the only hard refusals on base movement.
- **The pinned-merge port already parses the HTTP status.** `HostedProcessError` carries `httpStatus` from the
  `gh` failure text (`gh-process.ts`, `parseHttpStatus`); the merge verb's catch path discards it today.

## Terminal checks-wait field evidence

`plan-segmentation` terminal integration supplied the field instance that reopens the spec's dropped terminal-await
alternative. `arc integrate merge` held the foreground while required CI checks remained pending; the process can
stay inside its current bounded wait for up to ten minutes. The agent session compacted across that call, swallowed
the result, and needed a complete ARC recovery and context reload before integration could resume.

The current substrate already owns the hard parts:

- `checkpoint-store.ts` persists a create-only composition addressed by an opaque handle that binds the approved
  head, target, lifecycle version, settlement plan, and merge method;
- `merge.ts` recognizes an already-merged exact target, executes settlement idempotently, revalidates every binding,
  and returns `awaiting-checks / retry` without releasing the draft lock when its checks dependency reports pending;
- `checks-await.ts` provides the typed required-check aggregation, stale-head guard, failed-row detail, and generic
  bounded-wait composition; and
- `merge-composition.ts` is the policy defect: its integration-specific instance fixes the timeout at ten minutes
  and the initial polling interval at ten seconds.

The selected amendment composes those primitives rather than minting a queue or approval store. Extract one bounded
required-check observation from `checks-await.ts`; retain `boundedWait` only for callers that explicitly await; have
the terminal merge perform the observation once. Pending and unavailable observations return a self-contained retry
carrying the same checkpoint handle and structured argv. Failed or stale observations remain approval-voiding and
re-lock. This removes the session-occupying interval while preserving exact-effect authorization and the existing
idempotent resume path.

## Delivery drift classifier-ordering field evidence

Absorbed from `USER-INBOX`, 2026-09-09; the originating inbox record remains for its other owning session to settle.
Landing the first `plan-segmentation` member advanced `main` by its exact reviewed merge commit. The next terminal
checkpoint had a complete, topology-proven base-drift read with empty substantive and regenerable overlap, but
stopped at `delivery-terminal-blocked / drift-classification-unavailable`.

The live ordering explains the contradiction. `checkpointIntegration` asks `classifyDeliveryDrift` before the
ordinary Candidate gate. The production classifier resolves the delivery records and overlap, then calls its shared
effective Candidate projector with `drift.baseOid` and requires `current` before reading either residual or
predecessor paths. In a sequential stack, the newly landed predecessor is exactly why the next member's base moved;
requiring currentness against that base prevents the classifier from reaching the overlap evidence that determines
whether the movement may carry.

The managed Candidate record already supplies the bounded classification coordinate:
`reduceCandidateDurableBaseline(record).target.revision`. D7 uses that durable revision only to scope the residual
diff while the recorded delivery coordinates continue to scope the predecessor diff. A disjoint envelope can
short-circuit after validating the record because neither intersection can change the result; an overlapping
envelope still computes both and preserves `predecessor-overlap`. The later effective projection against the
resulting base remains mandatory, as do terminal rebind, publication, lifecycle, checkpoint, approval, and exact-head
merge checks. No stale Candidate is promoted and no new authority record is introduced.

The field capture is correct; a later review extrapolation from it was not. The ordering defect explains why the
classifier could not reach already-complete disjoint evidence. It does not imply that every admitted nonterminal
member brings a conflicting readiness render to the host: lifecycle eligibility requires its regenerable entry to
equal the chain baseline, so a sibling-only base regeneration is a one-sided merge. Only a terminal projection may
legitimately supply a second render, and that case belongs to D5's typed exact-parent remedy. The decisive regression
therefore uses a real three-member delivery with the custom readiness driver disabled, preserves each reviewed
nonterminal head, rejects a nonterminal competing render, and exercises the terminal conflict separately.

## Applicability architecture and proportionality decisions

The post-field-evidence adversarial passes found material design gaps. The accepted correction set preserves the
work unit's urgency and its explicit coordination boundary with `review-signal-convergence`:

- Candidate evidence treatment follows semantics rather than storage. The complete identity-bound planning group is
  non-evidence-bearing for implementation review whether materialized or optionally tracked; its planning-stage
  review remains separate. Foreign WU artifacts and shipped or implementation content stay reviewable. The registry
  names the functional value `evidence-neutral` so authored design is not mislabeled as an ADR-022 operational-state
  document.
- Core consumes a provider-neutral `HostMergeAdmission` bound to repository, change request, base, and head. The
  supported GitHub adapter may inspect native pull-request and test-merge data, but provider field names and status
  codes do not cross the port. A positive observation must prove the exact pair; an unprovable negative or strictness
  signal is `unresolved`.
- Git feasibility and host admission are different facts. Exact merge-tree evidence supplies
  `clean | regenerable-conflict | substantive-conflict | unavailable`; host admission supplies
  `mergeable | base-currentness-required | refused | unresolved`. The checkpoint planner composes them without
  treating one as evidence for the other.
- A merge refusal plus `behind > 0` is correlation, not proof of strict currency. Only an exact provider fact may
  select `reconcile-base`, and the planner still requires complete integration evidence. Opaque refusals stop as
  `host-refused`; they never bypass the checkpoint's mutation guard.
- Regenerable-only conflict is a distinct typed arm. It reuses the existing `applyRoadmapConflictAutoRemedy`
  implementation only when its existing eligibility check proves the readiness projection is the sole conflict and
  the composition binds the candidate index to the checkpoint's expected merge parents. A changing-input render is
  non-success, not an applied remedy; only a determinate render with revalidated staged bytes and parents may commit.
  Wider conflicts stop. No new resolver or project-document-specific store is added.
- The D2 envelope is a total discriminated contract with explicit not-applicable axes and approved scope. A pure,
  exhaustive TypeScript reducer owns every deterministic `carries | supplemental | fresh` arm. The method receives
  only bounded residuals that require judgment.
- `arc errand merge` owns the final Errand movement, provider, merge-method, lock, and refusal state machine.
  `run-errand.md` invokes and dispatches the typed result rather than evaluating conditions or issuing raw provider
  merge commands.

The verification instance remains deliberately split at its existing ownership seam. This work unit accepts and
reduces an optional `approvedVerification` transition field, defaulting omission to `full`.
`review-signal-convergence` owns the proposal, approval binding, and response-writer pass-through. Its current
producer work is joined to earlier immutable-disposition and fix-authorization changes, so extracting it here would
duplicate ownership and widen both work units. There is no completion dependency: either can land first, and scoped
production behavior activates only when both sides are present.

The `assess-design-proportionality` method returned `proportionate` after those corrections. Every remaining material
mechanism traces to an observed failure or authority boundary; the design adds no queue, background agent loop,
approval store, configuration axis, persistent host-evidence record, generic conflict framework, or proposal-side
producer. The procedure-evolution check requires the typed reducer and Errand verb; PM-composition requires semantic
provider contracts and one authority per fact; storage evolution requires computed observations and
storage-agnostic, version-checked existing records; integration and concurrent-work doctrine reject lifecycle
serialization while preserving exact-head authority.

The Phase 2 grounding pass added one cross-cutting ergonomics rail from recurring field experience: an abstraction may
normalize or redact provider mechanics, but no agent-facing non-success result may lose the failure itself. Every
public operation changed by this work unit preserves a stable semantic cause, useful sanitized detail and decisive
coordinates, then supplies executable structured remedy argv or explains why no safe automated continuation exists.
JSON and interactive projections render the same typed result. This is a completeness condition on the existing
result contracts, not a diagnostic subsystem, provider vocabulary leak, or new persistence surface.

The second adversarial pass tightened three remaining seams. Host release now authorizes the exact approved head and
change request into the named target ref under configured host policy; the exact base/head observation qualifies
evidence immediately before release but does not pretend the host offers a base-OID pin. The approval surface
discloses the last observed base and the residual observation-to-merge race, successful completion confirms the exact
approved-head request, and required checks remain explicitly head-bound. Review status adapts its own endpoints and
overlap into `BaseMovementObservation`: disjoint movement retains the attempt, while overlapping or unknown movement
deterministically returns to checkpoint composition without a synthetic D4 relation or a pre-reconcile method call.
The checkpoint matrix also names `base-currentness-required` directly across clean, regenerable-only,
substantive-conflict, and incomplete-evidence rows.

## Delivery and review applicability decisions

Delivery eligibility needs two coordinates where the current implementation carries one. The observed protected-base
tip proves what the protected ref named during the observation bracket; the chain base is the member contribution's
real predecessor and is what materialization persists. Disjoint advancement separates them legitimately. Treating the
observed tip as the persisted predecessor would rewrite the contribution boundary, while treating the chain base as
the live observation would make a healthy advanced ref look stale.

One exact-revision overlap primitive supplies both delivery eligibility and review status. It accepts caller-provided
revisions and explicit path-treatment context, returns the merge-base beside the classified overlap, and never reads
ambient `HEAD` or session identity. The existing base-drift analyzer remains a wrapper. This is the smallest
composition because the repository already computes the same diff pair in a base-drift-shaped API whose hardcoded
checkout assumptions do not fit either new caller.

Eligibility close remains the authority boundary. The handler may round-trip the observed tip, chain base, and
relation, but close reobserves refs and recomputes the relation before materialization. The comparator ripple is
deliberately complete: delivery Git adapters and direct callers receive separate coordinates, while
`chain-containment.ts` keeps its existing closed-common-base semantics by supplying that coordinate on both sides.
Initial materialization and pre-binding verify the observed tip but persist the chain base; suffix rematerialization
compares the chain base with the persisted target.

Eligibility also preserves a lifecycle-neutral nonterminal invariant. A disposable member's readiness entry equals
its chain baseline; materialization and landing do not synthesize a hybrid projection into the reviewed member. A
sibling-only base render therefore merges one-sided on an ordinary host. A member-authored readiness difference is
an eligibility refusal, while a terminal dual-sided render routes through the D5 remedy and produces a newly approved
head. This is narrower than a delivery conflict controller and retires automatically with branch-carried readiness.

Checkpoint Candidate reads divide into one versioned record cache and many effective projections. Each projection is
keyed by an explicit base revision; none establishes an implicit bound base for later consumers. Classification and
ready composition therefore share record bytes without sharing a possibly wrong projection. A lightweight record
version assertion immediately before create-only checkpoint persistence returns a typed recompose result if canonical
state moved, satisfying storage evolution's version-checked-write rule without a new record or lock.

Review status has no reconciled subject on which a bounded residual judgment could act. Its decision is therefore
mechanical: disjoint movement retains the attempt; overlapping or unavailable evidence returns to checkpoint
composition, whose actual reconciled subject owns any later applicability judgment. The result must carry exact
coordinates, overlap or unavailability detail, and a checkpoint action when one can be constructed; target-only
status explains explicitly when it cannot.

The failure-ergonomics rail applies throughout this phase. An overlapping predecessor and an unrelated history are
different causes and stay different in public results. A moved observation supplies re-prepare coordinates; a chain
that needs separately owned rebuild machinery says so and does not invent an unsafe command; caught adapter errors
remain sanitized detail rather than disappearing behind `evidence-unavailable`. JSON and interactive output consume
the same typed cause and remedy.

The resulting phase is proportionate. The distinct coordinates and close-time recomputation protect a mutation over
an untrusted round trip; the shared overlap primitive removes duplicate Git logic; the cache change composes the
existing managed record and create-only checkpoint; and deterministic review status removes an inapplicable judgment
surface. No queue, store, configuration axis, provider coupling, PM authority, rebuild mechanism, or dependency on
`review-signal-convergence` is introduced.

## Terminal integration decisions

A mutating host call has three evidence states, not two. A definitive provider rejection can be classified and
re-locked; an exact read can prove the approved request merged; but a transport failure or malformed response followed
by unavailable confirmation proves neither. That last state is `merge-outcome-unknown`: it preserves the exact
checkpoint and approval, reports both failure stages, and does not claim failure or re-lock solely from uncertainty.
Replay starts with the existing exact merged-at-head read, making re-entry idempotent without another store.

Native Errand auto-merge cannot satisfy the promised exact-effect authorization on the supported host. Arming is
head-checked only at that instant, and a later write-author push may change the request while the arm survives. The
Errand lane therefore keeps its planning review exemption but returns prompt check continuations and later performs a
direct head-pinned merge. A bounded applicability-judgment result returns before mutation through the marked method
fire-point and a fresh integration approval. The pre-existing release-only lock operation remains separate because it
authorizes a different effect and must not be forced through the merge verb.

The Errand result mirrors both checkpoint reconcile arms: `reconcile-base` for an admitted ordinary base update and
`reconcile-regenerable` for the exact-parent, determinate readiness-only remedy. Collapsing the latter into generic
conflict would leave the typed state machine less capable than the planner it consumes.

Required-check handling has two layers. A coordinate-only one-attempt observer returns a closed result that includes
sanitized unavailability and accepts an injected abort signal; `awaitRequiredChecks` alone adds timing and
`boundedWait`. Terminal integration and Errands consume one observation and return control on pending or unavailable
checks. This keeps agent sessions out of CI polling while preserving the exact checkpoint's lifecycle, settlement,
head, target, and merge-method bindings.

Method shipment is a dependency surface, not one index edit. The new configurable method must appear in
classification, the installation recipe, generated manifest, session-operations reverse index, package-project
inventory, init/reconfigure expectations, and framework-sync coverage as well as both method files and each marked
workflow fire-point. Those surfaces are enumerated in the task rather than left to implementation discovery.

The terminal observation budget is one complete host-admission read before mutation. A definitive refusal supplies
its semantic result to the planner and needs only coordinate revalidation, not a second full observer. The extra read
reserved for an ambiguous mutating outcome is exact-effect confirmation, justified by the irreversible consequence of
duplicating a merge. This is the least elaborate design that preserves useful failure reporting and safe retry.

The Phase 4 result remains provider- and storage-neutral. Core consumes semantic host outcomes and exact coordinates,
workflow prose invokes typed verbs, and existing versioned records carry the continuation. No platform vocabulary,
background process, agent polling loop, approval store, queue, configuration axis, or dependency on
`review-signal-convergence` is introduced.

## Scoped verification decisions

The approved convergence scope and the evidence that satisfies it are separate facts. `approvedVerification` says
how broad the later check must be; a lineage attestation must also name the fresh check result that actually ran.
The current attest handler always supplies the original `tasks-{name}.md#verification` reference, so adding only a
scope flag would label a convergence result without binding its evidence. The scoped path instead requires one
non-empty convergence evidence reference and echoes it with the recorded scope. It composes the existing reference
field and managed record rather than adding an evidence store.

Scope belongs to the operation, not merely the record field. A fresh Candidate root and an unexplained-delta re-root
remain full-verification operations. Pending focused convergence accepts focused or full evidence; pending full
convergence accepts only full. Missing evidence and a narrower or inapplicable scope refuse before write with the
Candidate subject, requested and required scopes, and the exact verification action needed next. This prevents
`--scope focused` from being silently ignored or treated as a full root.

Convergence status and scope form one closed relationship. Satisfied always carries null scope; pending always carries
focused or full. Encoding that relationship once across durable currentness, effective-target projection, and the
pre-publication request prevents independently copied fields from producing impossible combinations. Phase 5 settles
the response and attestation record contracts before the lineage or operation consumers. The lineage then composes
each response through Member 1's D2 `approved-fix` producer and D3 verification reducer: `carries` inherits prior
satisfaction, `supplemental` requires focused convergence, and `fresh` requires full convergence. It never copies the
scope switch. An attestation is applied at the subject it covers before a later targeted transition carries that
satisfaction forward.

`CandidateLineageAttestationV1` has no dedicated digest or identity field. Its scope and evidence already participate
in the canonical bytes of the containing version-checked managed record. Adding a second attestation identity would
create lifecycle and guard obligations without serving a stated goal, so the task verifies managed-record version
change instead of referring to a nonexistent digest preimage.

The pre-publication action is the convergence presentation surface. Its typed schema and composer carry the required
scope and focused-versus-full check kind; `prepare-work-unit.md` renders that action. `verify-work-unit.md` owns the
initial full root/re-root path and contains no convergence fire-point, so it remains unchanged unless future source
movement creates one. The CLI change explicitly reaches Commander registration, handler options and input policy,
the verb, result formatting, and scoped argv helpers.

Required lineage-attestation scope changes literal development fixtures across the Candidate, delivery, review,
status, and publication suites. That is an in-place pre-release regeneration, not compatibility work. Coverage must
include root/re-root misuse, missing fresh evidence, impossible status/scope pairs, full-over-focused satisfaction,
and paired JSON/interactive refusals so an agent is never left with a generic Candidate error.

The result stays within the work unit's boundary. `review-signal-convergence` still exclusively owns the proposal,
approval binding, and response-writer pass-through; this phase accepts and reduces the optional field and remains
independently landable. No provider contract, persistence surface, configuration axis, migration reader, or sibling
completion dependency is introduced.

## Planning-close captures

Route via `USER-INBOX` at planning close (per the spec's Coordination section); none rests in a sibling's tracked
artifact.

1. To the review cohort: the review-lane doctrine sentence — evidence applicability follows covered content, never
   head movement as such — lands in `strategy-integration` § Review Admission and Head Movement and is cited, not
   restated, by the cohort's workflows.
2. `delivery-authoring-rebuild`: mint its stub with the narrowed boundary — this work unit says _when_ a rebuild is
   owed (the `predecessorRelation` predicate); the rebuild work unit says _how_ (commit and tree construction,
   ARC-private ref leases, detached gate placement, eligibility re-preparation) for the overlapping and
   interrupted-authoring cases.
3. To `review-activity-contracts`: the `baseContained` arm's ownership is decided here (the spec's D8 rewires it), so
   its D7.4 statement cites rather than re-decides; and the reducer/method seam
   (`reduceEvidenceApplicability` for deterministic arms, `assess-evidence-applicability` only for bounded residual
   judgment), so its D7.1 statement invokes rather than reimplements the policy.
4. To `review-orchestration-right-sizing`: its doctrine-home item is discharged by the same strategy sentence.
5. Errand-sized (or to `ci-defer-heavy-reconciliation` if already in its scope): this repository's push-to-`main` CI
   runs lint, typecheck, and unit only; the doctrine contract asks base CI to run the legs that gate a pull request
   (integration, e2e, portability) or accept the reduced coverage knowingly.
6. Post-`review-signal-convergence`: merge the review-contribution and Candidate D4 classifiers into one type (same
   algorithm, two baselines); deferred because that work unit builds on them now.
7. `cohort-chunked-delivery.md` names `integration-lane` as co-owner of final-window behavior with
   `integration-boundary-accuracy`; the rename to `evidence-applicability` orphans that reference.
