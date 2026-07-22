# Draft: review-surface-binding

- **Origin:** [internal] — split from `review-architecture` after verification found review contracts that were
  correct in isolation but unreachable from a production surface.
- **Purpose:** Complete the invocable, host-neutral review protocol around the shipped review contract. Bind local
  review, work-unit assurance, and method activation into `arc review`; keep local execution recoverable and
  freshness-bounded; and close the remaining exact-target gaps in frontline execution — at a persistence and
  ceremony weight proportional to the advisory authority the local lane carries.

---

## Grooming status (continuity)

> _Updated each planning pass. This is the resume anchor._

- **Readiness:** `formalization-ready` — the proportionality revision reshaped the draft (twelve verbs to seven,
  the durable fix ledger replaced by fix-creates-new-head re-review, the anti-tamper tier a permanent non-goal,
  expected concurrency residue self-healing rather than interrupting), and two fresh adversarial passes then ran
  at the `Heavy` cap against the revised design: all confirmed findings — two majors and four minors per pass —
  are fixed and folded, the post-settle coherence re-read is complete, every settle-able decision is settled, the
  success signals are concrete, and there is no inbound buffer.
- **Class:** `Heavy` — reduced surface, but the protocol still crosses CLI composition, local persistence, workflow
  guidance, and exact-target execution.
- **Resolved:** this is one work unit; it exposes explicit host-neutral transitions under `arc review`, not a
  resident orchestrator. Seven verbs cover the local satisfying lane, universal response/reduction, and advisory
  frontline execution. The CLI derives local target/request identity from trusted repository and project bindings
  and reviews a reachability-pinned Git-object source through a detached checkout. Project adapters supply routing
  facts, source/admission policy, and identity-keyed rubric augmentation. Approved dispositions land as one durable
  record; an approved fix produces a new head that is re-reviewed as its own target — nothing carries across a fix.
  Evidence-grade storage is reserved for the receipt/guidance pair; advisory records get idempotent replay.
  Tamper-resistance against the local operator is a permanent non-goal. Hosted enforcement, provider qualification,
  and multi-target review algebra remain downstream.
- **Next:** begin `create-spec` over the captured draft; at planning close, mint the provisional
  `review-durability-hardening` stub (the qualification and gate-sibling reconcile captures are already routed).

## Problem and motivation

`review-architecture` shipped the review target, requirement, request, receipt, routing, response, local storage,
operation-state, and method-activation contracts. The hosted GitHub runtime calls the resulting core, but three
capabilities still stop at library boundaries:

1. A `local-change-set` request can satisfy `independent-analysis/v1`, yet no CLI verb prepares the request,
   accepts the normalized reviewer result, attests it, or reduces the resulting local state.
2. Work-unit assurance resolves `Class`, method activity, and the optional `Review Rubric` field, but no production
   adapter supplies the rubric or passes the resolution into review composition.
3. The method activation registry resolves `self-review` and `frontline-review`, while production composition still
   substitutes literal enabled booleans and discards activation diagnostics.

The missing concern is composition, not another review model. Library-level integration tests prove the pieces can
compose when called; they do not give an agent or project an invocable route through them.

## Existing substrate and source reconciliation

The following shipped behavior is input to this work, not residual scope:

- CodeRabbit's registered frontline source runs structured `--agent` mode. Its qualified parser emits normalized
  findings as well as clean, partial, ambiguous, rate-limited, stale, malformed, and failed outcomes. The plain-text
  parser remains a compatibility fallback and needs no separate findings contract here.
- Both production GitHub launchers inject the authenticated raw-byte Git executor. Coverage derivation therefore
  preserves non-UTF-8 Git output; no hosted executor wiring remains.
- GitHub runtime composition already calls the self-hosting routing-fact deriver. Generic CLI surfaces correctly
  accept explicit policy facts because the framework cannot infer project sensitivity or ownership.

## Direction

### Proportionality posture

Two rules govern every choice below. **Contract discipline never scales down:** typed envelopes, fail-closed
parsing, exact identities, and no prose-as-control-flow hold everywhere. **Persistence and recovery ceremony
scales with the authority the evidence carries:** the receipt/guidance pair that downstream qualification may
consume as satisfying evidence gets evidence-grade storage; everything advisory gets idempotent retry and
re-run-as-recovery. Interrupts scale with genuine ambiguity — expected concurrency residue self-heals internally
and never stops the operator.

### One host-neutral `arc review` transition protocol

Extend the public `arc review` namespace with small, JSON-capable verbs that expose deterministic state
transitions. The CLI owns validation, identity construction, persistence, and reduction. The calling agent owns
the judgmental loop and launches a fresh reviewer only with the authorization required by the active harness.

The public command grammar is:

```text
arc review frontline resolve <file | ->
arc review frontline run <file | ->

arc review local prepare <file | ->
arc review local attest <file | ->
arc review local resume <file | ->

arc review respond <file | ->
arc review reduce <file | ->
```

Each command accepts a versioned JSON request from a file or standard input and emits exactly one strict,
command-specific JSON envelope. Only `schemaVersion`, `mode`, and typed `diagnostics` are common. Successful
envelopes add a state-discriminated payload whose `state` and `nextAction` are one legal pair; error envelopes
carry neither. `operationId`, `targetId`, `persistedVersion`, and semantic records appear only where that command
can truthfully supply them. The existing effect-free resolver remains compatible while gaining its explicit
state/action projection; it is not padded with operation or persistence fields.

Registered TypeScript/Zod discriminated unions are the single contract authority. Command parsers, emitted JSON
schema, and reference projections derive from those types; the vocabulary below fixes the design but is not a
second hand-maintained runtime schema.

The public result vocabulary is fixed as legal pairs, not independently combinable enum sets:

| Command             | Legal `state -> nextAction` pairs                                                                                                                                                                                                                                                    |
|---------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `frontline resolve` | `skipped -> none`; `offered -> bind-source` when no source resolved; `offered -> obtain-authorization` when a source resolved; `ready -> run-frontline`                                                                                                                              |
| `frontline run`     | `clean -> none`; `findings -> respond`; `unavailable -> retry \| operator-repair`; `timed-out -> retry`; `stale-target -> prepare-current-target`; `failed -> retry \| operator-repair`; `pass-cap-exhausted -> none`; multi-action states select by the closed reason classes below |
| `local prepare`     | `exempt -> none`; `ready -> launch-review`; `unavailable -> operator-repair`; `stale-target -> prepare-current-target`                                                                                                                                                               |
| `local attest`      | `attested-current -> reduce`; `stale-target -> prepare-current-target`; `expired -> rerun-review`; `not-attestable -> rerun-review`                                                                                                                                                  |
| `respond`           | `ready-to-fix -> apply-fix`; `settled -> reduce`; `already-settled -> reduce`; `stale-target -> prepare-current-target`                                                                                                                                                              |
| `reduce`            | `satisfied -> none`; `findings -> respond`; `settled -> none`; `advisory-complete -> none`; `unqualified -> rerun-review`; `retryable -> retry`; `stale-target -> prepare-current-target`                                                                                            |
| `local resume`      | `suspended -> wait`; `review-complete -> reduce`; `respond-to-findings -> respond`; `stale-target -> prepare-current-target`; `expired -> rerun-review`                                                                                                                              |

The reason-class discriminants make every multi-action row exact. `frontline run: unavailable` maps
`rate-limited | transient-unavailable -> retry` and `source-unbound | capability-unsupported -> operator-repair`.
`frontline run: failed` maps
`transient-transport | process-failure | signal-termination | unexpected-adapter-failure -> retry` and
`invalid-output | authorization-rejected -> operator-repair`. Those edges, plus `local prepare: unavailable` (a
missing or malformed declared project policy binding, which only configuration can cure), are the protocol's only
operator-repair surfaces. Explanatory text never selects a transition. A valid domain outcome — including
findings, unavailable capability, timeout, stale target, or structurally valid external divergence — exits
successfully with one of those pairs. Expected compare-and-swap conflicts are not public states: every mutating
handler reloads and retries internally and surfaces only its domain result.

The error envelope is a strict union over `invalid-input`, `corrupt-state`, and `unexpected-failure`; it exits 1
and contains no `state`, `nextAction`, or success payload. Its message and typed diagnostics are explanatory only.
`corrupt-state` includes an operation that claims completion while its required evidence is absent or mismatched.
No valid domain state is emitted for corrupt storage.

#### Exact request authority

Callers never provide compare-and-swap expected versions. Each mutating handler reads the current durable version,
performs its internal version-checked write, and returns `persistedVersion` on success when an operation or ledger
record exists. The strict request bodies are:

| Command             | Caller-supplied request fields                                                                                                                                                                                                                                                                                 |
|---------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `frontline resolve` | `schemaVersion`, `changeSet`, `invocation`, optional `maxPasses`; effect-free                                                                                                                                                                                                                                  |
| `frontline run`     | `schemaVersion`, exact `target` from the project/host adapter, the complete `ready` resolution returned by resolve, optional `timeoutMs`; the CLI revalidates the current source registration and derives policy/source digests, pass state, and operation identity                                            |
| `local prepare`     | `schemaVersion`, `evaluatorIdentity`, explicit typed project `routingFacts`, optional `freshnessMs` (the persisted admissibility window; framework default when omitted); the CLI derives repository, target, vehicle, author, policy, rubric, generation, runtime, immutable source, and operation identities |
| `local attest`      | `schemaVersion`, `operationId`, normalized `result`; all target, actor, policy, rubric, source, evidence, and store-version facts are reloaded internally                                                                                                                                                      |
| `respond`           | `schemaVersion`, discriminated `source`, and strict `dispositions`; source is either `{ kind: attested-local, receiptRef, guidanceEvidenceRef }` or `{ kind: frontline, outcomeRef }`                                                                                                                          |
| `reduce`            | `schemaVersion`, `operationId`; the handler follows durable references from that operation and reloads current repository facts                                                                                                                                                                                |
| `local resume`      | `schemaVersion`, `operationId`                                                                                                                                                                                                                                                                                 |

#### Success payload authority

Every success payload contains the common header plus only fields the command can truthfully supply; failure and
non-ready variants never fabricate operations, evidence references, or targets they did not persist. In
particular:

- `frontline resolve` returns `routing` and `frontlineReview`; it never returns operation fields.
- Every `frontline run` terminal variant returns `operationId`, `persistedVersion`, full `target`, and the
  durable `outcomeRef` plus its digest. Executable digest and qualified version appear exactly when an executable
  was resolved and launched; never-executed variants (`source-unbound`, `capability-unsupported`,
  `authorization-rejected`) carry no executable identity. Stale execution is itself a durable typed outcome;
  findings never live only in the command response.
- `local prepare: ready` returns `operationId`, `persistedVersion`, full `target` and `request`, the exact typed
  `reviewerPayload`, and `sourceRef` plus `sourceDigest`. `exempt`, `unavailable`, and pre-publication
  `stale-target` omit synthetic operation fields; stale returns the attempted and current target.
- `local attest: attested-current` returns the operation/version, exact target, source reference, receipt
  reference, guidance-evidence reference, and `receiptRecorded: true`. `stale-target` is a strict sub-union:
  pre-append carries `receiptRecorded: false` and no evidence references; post-append carries
  `receiptRecorded: true` and the exact references. `expired` and `not-attestable` carry the operation/version and
  no evidence references.
- `respond` always returns the source review `operationId`. `ready-to-fix` returns the disposition-record
  reference and validated `FixAuthorization`; `settled` and `already-settled` return the disposition-record
  reference.
- Every `reduce` variant returns `operationId`, the loaded `persistedVersion`, and full current target. Satisfying
  local variants return a registered projection binding the qualified receipt/guidance pair and disposition
  status; `findings` also returns the exact response source references. `advisory-complete` instead returns the
  frontline outcome reference and no satisfying projection. `retryable` returns a closed `retryCommand` plus the
  exact request reference.
- Every `local resume` result returns `operationId`, `persistedVersion`, and full current target.
  Evidence-complete states return their durable evidence references; only `respond-to-findings` owns a
  `responsePlan`.

The operations divide responsibility as follows:

1. **Prepare.** `arc review local prepare` derives the exact local target and request from trusted repository,
   vehicle, project-policy, and runtime bindings; consumes explicit project routing facts; binds effective method
   activity and work-unit assurance; creates the requirement and request; persists the admitted operation and its
   freshness window; then materializes the immutable `local-change-set` carrier and advances the operation to
   ready. It emits a complete typed reviewer payload.
2. **Launch.** For satisfying local analysis, the agent gives the prepared payload to the separately authorized
   independent evaluator; ARC does not interpret prose as control flow or host a resident worker.
3. **Run frontline.** `arc review frontline run` is the provider-effectful sibling. It consumes one complete ready
   resolution plus the exact adapter-supplied target, revalidates the registered source, publishes the pending
   non-evidentiary operation, prepares the exact-head checkout, resolves and interrogates the executable it will
   run, executes the bounded provider, and durably records the full normalized outcome before advancing operation
   state. Command-kind registrations only: an agent-kind registration returns the typed
   `unavailable: capability-unsupported` refusal — agent-carried frontline execution stays outside this work,
   with the provider-registry non-goal. A frontline run does not become satisfying evidence.
4. **Attest.** `arc review local attest` accepts only the normalized result schema, derives runtime identity at
   the trusted boundary, validates the exact target, rubric, and delivered-guidance digest, appends the local
   receipt and linked guidance evidence with version checking, and returns the reduction transition.
5. **Respond.** After the existing review-response checkpoint has presented the complete source-verified report
   and obtained approval, `arc review respond` accepts that strict `ApprovedDispositionSet` against either
   attested-local evidence or one durable frontline outcome. It requires its approver to be the active local
   identity and the proposer to be the composing runtime identity — derived at the trusted boundary by the same
   mechanism as the attesting runtime, never caller text — so the shipped distinct-actor check structurally
   encodes the agent-proposes / human-approves shape. It revalidates every finding against the selected source record, and
   appends the approved dispositions as one durable record before returning `apply-fix` or a settled state. The
   CLI never synthesizes or infers approval from prose.
6. **Reduce.** `arc review reduce` is the missing invocable composition over the shipped requirement,
   qualification, response, and projection reducers. From one operation it reloads the exact source/evidence
   chain, the disposition record when present, and the current target, then emits the registered current
   projection or advisory terminal state. It is read-only and never substitutes frontline advice for satisfying
   evidence.
7. **Resume.** `arc review local resume` reads durable operation and evidence state plus current repository facts
   and emits the next typed action. It may complete an interrupted idempotent transition, so it is deliberately
   not named `status`. It covers suspension, expiry, stale-target, findings, and completion.

Work-unit and Errand workflows consume the same operations. Project scripts may pre-compose repository policy, but
they do not fork the protocol or become the only way to reach the local channel.

### Approved dispositions and the fix path

Add a registered `ApprovedDispositionRecordV1` persisted through an append-only, version-checked,
repository-scoped ledger in the Git-common evidence namespace. The record binds the review operation, a
discriminated source reference (receipt + guidance + local-source references, or frontline-outcome reference), the
full `ApprovedDispositionSet`, and a nullable `FixAuthorization`. Identical replay is idempotent; a different
record for the same disposition set is a hard conflict. `respond` appends it after approval validation; `reduce`
reads it to conclude settlement. The shipped disposition, approval, and fix-authorization contracts are consumed
as-is; no parallel authority store or settlement-batch machinery is added.

The fix path is deliberately simple: an approved fix is applied by the agent under the ordinary review-increment
and commit interlock, producing a new head. A new head is a new review target — re-enter `local prepare` (or
`frontline resolve`) there; nothing carries across a fix. The disposition record closes the old target's response
obligation, and the fixed change earns its own review at its own head. This trades one extra evaluator pass per
fixed head for the absence of a durable fix ledger, fix-phase verbs, and their interrupt surface. For a frontline
source, the shipped `resolveFrontlineFollowUp` semantics run as advice in the `respond` / `reduce` output —
whether another advisory pass at the new head is worthwhile — never as a durable binding chain.

### Invocable reduction

Add a registered `ReviewReductionProjectionV1` and production adapter over the shipped forward requirement and
projection reducers. `arc review reduce` resolves its source from `operationId`; callers cannot supply a receipt,
guidance record, disposition record, target, or conclusion. For an attested-local source it reloads and validates
the exact target/requirement/request/receipt chain, matching `ReviewGuidanceEvidenceV2`, immutable source
descriptor, and any disposition record before deriving the projection:

- a current qualified clean receipt returns `satisfied` with a successful projection;
- a current qualified findings receipt without a complete disposition record returns `findings` with the exact
  response source references;
- the same receipt with a complete approved disposition record returns `settled`;
- failed/unavailable source results or a known-good evidence-first partial publication return `retryable` with the
  exact operation to replay or resume;
- an invalid qualification returns `unqualified`, and a changed current target returns `stale-target`.

For a frontline authority, reduction never emits a satisfying projection, and its mapping is total over the
outcome union: undispositioned findings return `findings` with the outcome reference; a clean or fully
dispositioned outcome returns `advisory-complete` with the advisory follow-up verdict, as does
`pass-cap-exhausted` (the advisory lane is spent); a non-review terminal returns `retryable` naming
`frontline-run`; a moved head returns `stale-target`.

Reduction is read-only. It may recognize an evidence-first partial publication but does not advance operation
state; the returned retry/resume locus invokes the owning idempotent command. Missing or mismatched evidence
behind an advanced operation remains `corrupt-state`, never a reduction result.

### Canonical local target and request derivation

`local prepare` does not accept a prebuilt `ReviewTarget`, `ReviewRequestV2`, repository identity, Git object ID,
generation, or attestation runtime identity as trusted caller data. It derives them as follows:

1. Resolve or mint one repository-local UUID in a locked Git-common identity record. The record is shared by every
   sibling worktree, survives checkout relocation, and deliberately does not claim cross-machine identity; any
   hosted import authenticates its mapping to a host repository explicitly, downstream of this work.
2. Read the logical `baseRef` from configured `branch.base`, resolve `refs/heads/<baseRef>` and `HEAD` as commits,
   compute their merge base as `diffBaseSha`, and resolve `diffBaseTree` and `headTree` from those exact commits.
   Reject an unborn repository, unresolved base, uncommitted index/worktree state, or non-commit HEAD. Re-read the
   coordinates immediately before publishing operation state and return `stale-target` if they moved.
3. Resolve the vehicle and author from live ARC state: a work unit uses its canonical meta owner and requires the
   active identity to match; an Errand uses the active ARC identity. The command's sole explicit actor selection
   is the evaluator identity because only the authorized launcher knows which fresh evaluator it will invoke.
   Local OS/repository write authority admits that selection; the CLI requires it to differ from the author and
   binds it through payload, result, receipt, and guidance evidence.
4. Resolve the attesting runtime from the actual installed CLI/runtime binding at prepare and again at attest. A
   project-supplied label or caller-supplied version is never identity evidence.
5. Allocate generation through Git-common compare-and-swap state keyed by target plus source: an identical retry
   reuses the live generation, while a new admitted run advances it. The request ID is then derived from the exact
   target, requirement, actor bindings, generation, and request mechanism through the shipped constructor.

### Immutable local review source

Preparation never asks the evaluator to inspect the caller's mutable worktree. Add the registered
`LocalReviewSourceV1` descriptor with `semanticsVersion: git-object-range/v1`, repository and target identities,
object format, `diffBaseSha`, `headSha`, `diffBaseTree`, `headTree`, stable opaque `reachabilityRef` and
`materializationRef` locators, and `sourceDigest`. The digest is the domain-separated canonical digest of the
semantic fields while explicitly excluding `sourceDigest` itself and both operational locators. It therefore binds
the exact Git-object range without a recursive preimage or filesystem/ref-name dependence.

After deriving the clean target and operation identity, the source adapter creates an operation-owned Git ref
under its private review namespace pointing to `headSha`. Because `diffBaseSha` is the verified merge-base
ancestor, that pin keeps the entire reviewed range and both trees reachable. Preparation verifies the pin and
range, re-reads the original target coordinates, removes the pin and returns `stale-target` if they moved, then
publishes the admitted operation and its freshness window and creates a detached checkout from the pinned object
database. Before launch, the adapter proves detached `HEAD == headSha`, the checked-out tree equals `headTree`,
both range endpoints remain present, the reachability ref still equals `headSha`, and porcelain-v2 status is
empty. The typed reviewer payload contains the resolved review root, `diffBaseSha`, `headSha`, `sourceRef`, and
`sourceDigest`; no mutable caller-worktree path enters it.

The normalized evaluator result must echo `sourceDigest`. `ReviewGuidanceEvidenceV2` binds both `sourceRef` and
`sourceDigest`, and attestation reloads the source descriptor, recomputes its semantic digest, and re-verifies the
pin plus detached checkout before accepting the result. If the checkout was lost, resume recreates it from the
pinned objects. If the pin is absent but every object remains, resume restores it idempotently; a pin targeting
different bytes or a missing pin whose objects were pruned is `corrupt-state`. Moving the original branch away and
back during evaluation does not change the reviewed source; it can only make that exact target no longer current
for later reduction.

The materialization and reachability pin may be released only after the receipt/guidance pair is durably complete
or the operation terminally expires. Release is idempotent; an orphan pin — one whose
operation record is absent — is removed by the source store's idempotent sweep, which runs inside `local prepare`
and `local resume` under the Git-common state lock; no background process. The sweep cannot strand a sibling's
in-flight prepare: preparation already re-verifies its pin before publication, and a swept pin is recreated
idempotently there from the still-local objects. The registered descriptor and evidence references survive cleanup, so
historical evidence does not depend on an ephemeral path while an in-flight retry remains protected from Git
pruning.

Project routing facts remain explicit because generic ARC cannot infer project sensitivity or ownership. Source
and admission policy arrive through a strict `LocalReviewPolicyBinding`, not as independent free-form fields. The
package default permits `{ sourceKind: agent, qualifier: independent-analysis/v1 }` at checkpoint admission with
the fixed `local-attestation` request mechanism; a project composition adapter may supply a stricter typed
binding. The binding contains the complete sorted acceptable-source set, initial admission mode, request
mechanism, and accepted attestation runtime kinds and has its own registered canonical digest. The CLI validates
the selected evaluator/carrier against it. The shipped v2 identities retain their exact ownership: acceptable
sources and initial admission enter `policyVersion` and the requirement, while the request mechanism enters the
request. The complete local binding digest and admitted runtime kind are carried by operation state and linked
guidance evidence; they are not smuggled into a v2 field that does not own them. A missing or malformed declared
project binding returns `unavailable`; it never silently falls back to a weaker default.

### Assurance composition

Production composition must call the existing method-activation resolver rather than constructing literal activity
facts. The adapter reads the registered `self-review` and `frontline-review` method files, preserves
package-default fallback behavior, and returns diagnostics on the public result so malformed project declarations
are visible.

Replace the boolean-only rubric availability port with an identity-keyed `ReviewRubricBindingPort`. Its production
adapter resolves the exact `Review Rubric` meta identity through the canonical method-file loader, then parses one
optional, strictly typed `review-augmentation` frontmatter field into
`IndependentAnalysisProjectAugmentation`. The field carries `rubricId` plus sorted, unique typed dimensions;
`rubricId` must version the named method identity as `<identity>/vN`. Method prose is never parsed into control
data, and a command payload cannot supply an augmentation. This extends the existing method-frontmatter schema and
loading path rather than adding another registry, configuration axis, or document family.

A resolved overlay augments the immutable baseline deterministically; a missing method, missing structured field,
malformed projection, ambiguous lookup, or identity mismatch refuses that review request with a diagnostic. An
absent meta field uses the baseline unchanged.

Preparation projects the exact effective guidance and computes its carrier-specific `guidanceDigest` using the
shipped domain-separated preimage. The reviewer payload carries that digest; the normalized result must echo it;
attestation re-resolves the overlay and recomputes the delivered projection before accepting the result. The
baseline `rubricVersion + rubricDigest` remain unchanged by augmentation.

Do not mutate strict `ReviewReceiptV2` or overload `applicabilityId`. Add a registered
`ReviewGuidanceEvidenceV2` that binds target, requirement, request, review operation identity, canonical receipt
digest, carrier,
baseline rubric pair, nullable overlay identity, `guidanceDigest`, local-policy-binding digest, request mechanism,
admitted runtime kind, evaluator, attesting runtime, `sourceRef`, `sourceDigest`, and durable carrier reference.
Persist those records through a dedicated append-only, repository-scoped
`LocalGuidanceEvidenceStore` in the Git-common evidence namespace, with the same version-conflict,
identical-replay, and conflicting-replay behavior as receipt storage. A receipt is satisfying only with one
matching guidance-evidence record; a baseline-only result cannot satisfy a declared stronger overlay. Explicit
hosted import revalidates and imports the pair, not the receipt alone. If interruption lands after receipt append
but before guidance-evidence append, the receipt remains valid historical but non-satisfying evidence and
`local resume` completes the exact idempotent second append before reduction.

`create-spec` offers the optional work-unit rubric overlay for Heavy and Novel work. At review time the binding is
automatic from the meta field; the agent does not rediscover or hand-compose the overlay.

Receipt, guidance-evidence, disposition-record, frontline-outcome, reduction, local-source, generation, and
operation-state ports remain storage abstractions. Git-common namespaces and private reachability refs are the
initial repository-local adapters needed for sibling-worktree continuity, not semantic record addresses:
identities never depend on a Git-directory path or ref name, durable references are opaque adapter references, and
every mutation is version-checked. A future materialized git-backing-store adapter can implement the same ports
without reshaping records or adding a review-specific storage setting.

### Routing facts stay project-owned

Do not mint a `review-routing` method. Risk, ownership, and surface authority are project-policy facts: the
self-hosting GitHub adapter derives them, while the generic CLI accepts their typed values. Method activation and
rubric augmentation are framework-known declarations and are composed separately.

This keeps policy derivation out of generic workflow prose and avoids pretending ARC can infer repository-specific
sensitivity from paths alone.

## Exact-target and executable identity

The remaining CodeRabbit adapter gaps are part of this work because the new public `frontline run` surface would
otherwise operationalize them:

- Bind both `diffBaseSha` and `headSha` to the provider invocation. A before/after HEAD equality check is
  insufficient because a checkout can move away and return during the run. The adapter must execute against an
  immutable checkout at the target head, or use an equivalent provider-native exact-head mechanism; observing the
  same mutable ref twice is not acceptable proof.
- Executable identity comes from what actually ran. The adapter resolves the executable once, interrogates that
  resolved artifact for its version, launches the same resolved artifact, and records the digest and qualified
  version in the durable outcome. The caller-supplied CLI version leaves the trusted input. Sealed snapshots,
  copy-on-resolve artifacts, and write-prevention across the launch window are deliberately not built:
  tamper-resistance against the local operator is a non-goal (see § Scope boundaries), and a digest of the
  launched artifact is sufficient identity evidence for advisory review.
- Preserve the already-shipped structured `--agent` findings parser and authenticated raw-byte Git execution.

Stale or mismatched targets fail closed and produce typed outcomes. A stale run never becomes evidence for a newer
head even when its result is otherwise complete.

### Durable frontline outcomes and universal response

Add a registered `FrontlineOutcomeRecordV1` containing the frontline operation identity, source registration
identity, a nullable executable identity (digest and qualified version, present exactly when an executable was
resolved and launched), the full normalized `FrontlineExecutionOutcome`, and its canonical outcome digest.
Persist it through an append-only, version-checked `FrontlineOutcomeStore`; the initial
adapter uses the Git-common review namespace, but the record and port make no tracked-repository or path
assumption. The record is durable advisory source evidence for response, not a satisfying review receipt and not
host-side authority.

Extend the normalized outcome union so `timed-out` and `stale-target` are first-class alongside the shipped clean,
findings, unavailable, failed, and pass-cap-exhausted variants, and add the closed reason classes used by the
public pair table. Those changes are owned by the provider-neutral outcome schema; adapters map their existing
detailed results into it rather than letting CLI handlers reinterpret provider prose.

An interruption after outcome publication is repaired by validating that exact record and advancing operation
state; re-entry to a concluded operation returns the same durable outcome reference. Reuse discriminates on
review content, not failure class: a review-concluding outcome — clean, findings, or pass-cap-exhausted — is
reused at unchanged coordinates. Every non-review terminal — `timed-out` and all `unavailable` / `failed` reason
classes — concludes its operation without concluding the pass, and a fresh invocation admits a new operation at
an advanced generation for the same head with the same pass number (attempt bookkeeping, not pass consumption). The
retry-vs-`operator-repair` split is advice about the next action, never a persistence discriminator, so a
repaired authorization or upgraded executable self-cures by simple re-invocation. The shipped reuse resolver
composes unchanged: generation keys the operation identity, so a fresh attempt never re-reaches a concluded
operation. If no record was published, re-entry retries the same operation and never promotes an inferred result.
Pass counts are advisory bookkeeping in the existing operation-state record, bounded by the shipped resolver's
pass allowance (the initial pass plus one follow-up); a new head starts its own count. Lineage tamper-resistance
is not built.

`arc review respond` uses a source-discriminated authority. Attested-local input reloads and validates the exact
receipt, guidance evidence, and immutable local source; frontline input reloads and validates the exact durable
outcome and rejects any non-findings outcome. Both are projected through the existing universal review-response
checkpoint and validated against the same strict `ApprovedDispositionSet` before the disposition record is
appended.

## Failure behavior and bounded execution

### Bounded execution and freshness

Provider execution runs under a plain execution timeout — an operation input with a framework default, not a new
project configuration axis. The runner passes the remaining time and an abort signal to the adapter and kills the
spawned process on expiry; a timed-out result is typed `timed-out` and can never be normalized as clean or
findings. Unknown thrown errors map to the closed adapter-failure class rather than an unbounded wait.

Local operations persist a freshness window at admission — `freshnessMs` when supplied, else the framework
default. A separately launched local evaluator is outside ARC's
process-control boundary, so the window bounds admissibility, not execution: `local attest` and `local resume`
enforce it, and re-entry never extends it. Once an operation with no timely evidence expires, resume performs
idempotent source cleanup and returns `expired -> rerun-review`; a late normalized result cannot recreate the
checkout or publish historical evidence.

### Corruption and partial publication

Corrupt durable state fails loudly: a malformed registered record, a digest or reference mismatch, guidance
evidence without its receipt, or an operation that claims completion while its required evidence is missing emits
the strict `corrupt-state` error envelope and exits 1. No repair action or success state accompanies it.

Recoverable evidence-first partial publication is the one expected in-between: when a receipt exists but its
guidance evidence or operation advance is pending, `local attest` and `local resume` validate the exact record and
complete the idempotent second write automatically. Expected compare-and-swap residue never surfaces at all —
mutating handlers reload and retry internally and emit only their domain result. There is no `repair-required`
state: with no durable fix machinery, an unrelated head transition is simply `stale-target`.

### Attestation and re-entry consistency

Treat a receipt's exact-target validity and its current applicability as separate facts. `local attest` first
loads the operation and its evidence stores. An already-complete exact receipt/guidance pair replays identically
regardless of the current time. A lone exact receipt may complete its matching guidance append idempotently even
after expiry: attestation refuses expired appends, so the receipt's existence proves its append was admitted
within the freshness window — no record carries a timestamp, and none is needed. This finishes an already-started
evidence-first publication. Guidance without its receipt is `corrupt-state`. When neither record exists and the window has
passed, attestation releases the source materialization and pin, appends nothing, and returns
`expired -> rerun-review` with `receiptRecorded: false`.

For an unexpired operation, attestation checks the current target. If already stale, it appends nothing. Otherwise
it appends the exact-target receipt and linked guidance evidence through their versioned authorities, then
re-reads the current target:

- an unchanged target returns `attested-current` with the durable evidence references;
- a changed target returns `stale-target` with `receiptRecorded: true`, the historical evidence references, and
  `nextAction: prepare-current-target` for the new target.

The receipt remains valid evidence for the exact target it names; it simply cannot satisfy a newer target. Every
reduction re-reads the current target and considers only matching receipts. Do not add a target-aware publication
lock: the Git-common state lock cannot atomically cover Git refs, and later reduction revalidates again while no
local result claims host-side merge authority.

Re-entry into a waiting operation validates the operation identity, exact target, and immutable source digest
before accepting a terminal result; a result for different reviewed bytes is rejected regardless of matching
identifiers.

## Scope boundaries and downstream fit

This work unit owns:

- the invocable local review, universal response/reduction, and frontline resolve/run CLI operations;
- production composition for method activation and work-unit rubric augmentation;
- immutable and reachability-pinned local-source materialization, durable frontline outcomes, freshness-bounded
  execution and recovery, and re-entry identity checks;
- the two remaining CodeRabbit exact-target/executable fixes; and
- the predecessor prune-at-consumption pass below.

It does not own:

- lifecycle-readiness evidence or provider qualification (`review-gate-enforcement-qualification`);
- enabling a required host check or merge authority (`review-gate-enforcement-promotion`);
- GitHub App installation, repository import, or host-specific authority (`review-gate-github-adapter`);
- cumulative or multi-PR target algebra (`pr-decomposition`);
- a generic provider registry, a routing method, or a new storage/configuration axis;
- tamper-resistance against the local operator — a permanent non-goal at every tier, rejected rather than
  deferred. Local evidence is process attestation; the authority boundary where stronger guarantees matter is
  hosted import, which revalidates explicitly. Sealed executable snapshots, durable run-binding lineage, and
  un-resettable pass counts are deliberately not built; or
- the durable fix-carry-across ledger and mid-fix crash-recovery machinery. That tier is deferred to a provisional
  `review-durability-hardening` stub minted at planning close, groomed only if practice shows mid-fix crashes
  losing settled dispositions or the re-review-at-new-head cost proving material.

### Predecessor prune-at-consumption

`review-architecture` shipped a local lane that is currently dormant end-to-end — built and tested with no
production caller. As part of create-spec, walk that dormant inventory and classify each module **consume** (this
design wires it), **keep-as-contract** (registered schemas and records stay; cheap, stable dormancy), or
**retire** (machinery with no consumer and no named downstream claim is deleted with its tests, recoverable from
history). Expected consumers: the local receipt store, operation-state store, local-change-set carrier, local
attestation input, response reducer, method-activation wrapper, and the follow-up resolver in its advisory role.
Audit candidates for retirement: the review re-entry runtime and the dormant v1 gate projection renderer, plus
anything this revision orphans.

The intended dependency flow is:

`review-architecture` → `review-surface-binding` → `review-gate-enforcement-qualification` →
`review-gate-enforcement-promotion` → `review-gate-github-adapter`.

This is a coordination seam, not yet the authoritative downstream graph: qualification's live meta still names
only its cutover predecessor and its draft retains hosted-only success language that conflicts with its
attestation-first fallback. An identity-global inbox capture routed to qualification carries this reconcile — and
the sibling gate WUs carry matching captures applying the proportionality posture at their next groomings. At its
next grooming, qualification must add `review-surface-binding` as a dependency and reconcile its go/no-go
criteria so the local attested path can be the shared satisfying-evidence fallback. This branch does not edit the
sibling WUs' tracked artifacts.

`pr-decomposition` may consume the host-neutral request/attestation seam later, but this work remains
single-target and does not anticipate its cumulative carrier design.

## Success signals

- A project on the `local` channel can prepare an immutable source, hand the payload to an authorized evaluator,
  attest, respond to a complete approved finding set, re-enter, and reduce independent analysis through documented
  `arc review` commands, with no hosted provider. Clean, findings, and fully dispositioned evidence all reach
  exact public reduction states; a defer/reject-only set reaches durable local closure without any fix machinery.
- The public path consumes effective method activation and a declared typed rubric augmentation; malformed or
  unavailable declarations produce visible, fail-closed diagnostics, and a baseline-only result cannot satisfy a
  declared overlay because the guidance-evidence pair is missing or mismatched.
- The registered CodeRabbit source runs against the exact head through an immutable checkout, records the digest
  and qualified version of the executable that actually ran, persists the complete outcome durably, and enters the
  universal response path after a crash/restart. A hung provider is terminated at the execution timeout and
  returns `timed-out`.
- No expected concurrency residue surfaces as an operator interrupt: compare-and-swap conflicts self-heal
  internally, and the only `operator-repair` edges are unresolvable source bindings, rejected authorization,
  invalid provider output, and a missing project policy binding.
- Failure-injection tests cover dirty/unborn preparation refusal, target/request derivation from Git, pin
  loss/restore and pruned-object corruption, a concurrent orphan-pin sweep racing a sibling's pre-publication
  prepare, receipt/guidance interruption completion, staleness at attestation, disposition-record idempotent and
  conflicting replay, frontline-outcome publication before operation advance, re-admission after a repaired
  non-review terminal, provider timeout, stale-run-never-evidence, target movement during attestation, and every
  reduction result.
- A local evaluator sees only the detached exact-head checkout. Moving the original worktree away and back while
  the evaluator runs cannot change the source digest or satisfy attestation for different bytes; the operation pin
  keeps the range reachable through branch deletion and Git maintenance, and resume recreates the identical review
  root.
- Contract tests exercise every legal command-specific state/action pair, reject impossible fields, and prove that
  per-state payloads, strict error variants, and domain outcomes retain their distinct field and exit semantics.
- Integration tests enter through the CLI or production launcher rather than manually composing library calls, so
  every delivered port has a non-test production caller and a user-reachable path.
- The prune-at-consumption pass leaves no dormant review module unclassified: each is consumed, kept as contract,
  or retired with its tests.
- No added behavior is represented as host-side enforcement; the required-check boundary remains explicit.

## Implementation latitude

- Internal handler/module boundaries may follow existing CLI conventions as long as the public command and
  envelope contracts remain stable.
- Record filenames and internal module boundaries may evolve behind the receipt, guidance-evidence, local-source,
  frontline-outcome, disposition-record, reduction, generation, and operation-state ports. Their authority split,
  publication ordering, strict schemas, and idempotency/conflict behavior are fixed.
- The provider adapter may select the concrete process-execution primitive; it must preserve the exact-head
  checkout, interrogation of the executable that actually runs, and typed timeout behavior.
