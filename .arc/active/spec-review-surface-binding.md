# Spec (`detailed` · `RFC`): review-surface-binding

- **Origin:** [internal] — split from `review-architecture` after verification found review contracts that were
  correct in isolation but unreachable from a production surface.

- **Purpose:** Complete the invocable, host-neutral review protocol around the shipped review contract. Bind local
  review, work-unit assurance, and method activation into `arc review`; keep local execution recoverable through
  re-run and lightweight resume; and close the remaining exact-target gaps in frontline execution — at a
  persistence and ceremony weight proportional to the advisory authority the local lane carries. With no downstream
  gate consuming local review as satisfying evidence (`review-gate-right-sizing` declined the evidence-grade gate),
  that authority is advisory end to end, and the lane's storage and recovery ceremony are sized to a
  durable-but-advisory trace rather than evidence-grade proof.

---

## Introduction / Context

`review-architecture` shipped the review target, requirement, request, receipt, routing, response, local storage,
operation-state, and method-activation contracts. The hosted GitHub runtime calls the resulting core. Three
capabilities still stop at library boundaries:

1. A `local-change-set` request can satisfy `standard-review/v1`, yet no CLI verb prepares the request,
   accepts the normalized reviewer result, attests it, or reduces the resulting local state.
2. Work-unit assurance resolves `Class`, method activity, and the optional `Review Rubric` field, but no production
   adapter supplies the rubric or passes the resolution into review composition.
3. The method activation registry resolves `self-review` and `frontline-review`, while production composition still
   substitutes literal enabled booleans and discards activation diagnostics.

A reachability walk over `packages/arc-framework/src/scripts/review-gate/` from every production entry point — the
CLI, the ten `run-*.ts` launchers, and the build's schema registration — confirms the shape of the gap: 23 modules
(~1,960 LOC) have no reachable production caller and are exercised only by tests. Today the entire public surface is
one verb, `arc review frontline resolve`.

The missing concern is composition, not another review model. Library-level integration tests prove the pieces can
compose when called; they do not give an agent or a project an invocable route through them.

Two facts about the shipped substrate are inputs to this work rather than residual scope. CodeRabbit's registered
frontline source runs structured `--agent` mode, and its qualified parser already emits normalized findings plus
clean, partial, ambiguous, rate-limited, stale, malformed, and failed outcomes. Both production GitHub launchers
already inject the authenticated raw-byte Git executor, so coverage derivation preserves non-UTF-8 Git output and no
hosted executor wiring remains.

## Goals

1. A project on the `local` channel can complete a standard review end to end through documented
   `arc review` commands, with no hosted provider: prepare an immutable source, hand the payload to an authorized
   evaluator, attest the result, respond to a complete approved finding set, re-enter after interruption, and reduce
   to a public terminal state.
2. Every state transition is a deterministic, typed, JSON-in / JSON-out CLI operation. Explanatory prose never
   selects a transition, and the CLI never infers approval.
3. Production composition consumes effective method activation and a declared, typed work-unit rubric augmentation,
   with fail-closed diagnostics when a declaration is malformed or unavailable.
4. Frontline provider execution binds to the exact target head and records the identity of the executable that
   actually ran, with a durable outcome that survives a crash and re-enters the universal response path.
5. Interrupts scale with genuine ambiguity: expected concurrency residue self-heals internally, and the only
   operator-repair surfaces are conditions that configuration or authorization alone can cure.
6. Every delivered port has a non-test production caller. The dormant inventory this work inherits is left with no
   module unclassified.

## Non-Goals

This work unit does not own:

- **downstream-consumable satisfying evidence.** Local review is advisory; nothing here produces evidence a merge
  gate consumes as proof. The gate that would have consumed a satisfying receipt / guidance pair — the
  evidence-grade rung — was declined upstream (`review-gate-right-sizing`), so the satisfying-pair semantics,
  generation compare-and-swap, and freshness-as-evidence are shed rather than built. The lane keeps a
  durable-but-advisory trace — a local receipt, a lightweight operation record for resume, and an advisory
  disposition record — sized for recovery and human review, not downstream proof. Explicit hosted import remains the
  boundary that revalidates;
- lifecycle-readiness gating and provider qualification (`review-gate-right-sizing`, which absorbed the retired
  qualification WU's readiness requirement);
- enabling a required host check or merge authority (the thin `arc-cleared` merge guard is
  `review-gate-right-sizing`'s);
- GitHub App installation, repository import, or host-specific authority (retired with the gate cohort; any hosted
  adapter re-homes behind `review-gate-right-sizing`'s hosted-provider verbs);
- cumulative or multi-PR **target** algebra (`chunked-delivery`); and automated single-target, multi-**scope**
  review carving — per-chunk scoping of one change set — which is deferred to `review-chunking` as an extension of
  this lane's surface (agent-driven chunk review needs no automation here);
- a generic provider registry, a `review-routing` method, or a new storage / configuration axis;
- agent-kind frontline execution — a registered agent-kind source returns a typed refusal;
- **tamper-resistance against the local operator.** This is a permanent non-goal at every tier, rejected rather
  than deferred. Local evidence is process attestation; the authority boundary where stronger guarantees matter is
  hosted import, which revalidates explicitly. Sealed executable snapshots, durable run-binding lineage, and
  un-resettable pass counts are deliberately not built;
- the durable fix-carry-across ledger and mid-fix crash-recovery machinery. That tier is deferred to a provisional
  `review-durability-hardening` stub minted at planning close, groomed only if practice shows mid-fix crashes
  losing settled dispositions or the re-review-at-new-head cost proving material.

## Proposed Design

Two rules govern every unit below. **Contract discipline never scales down:** typed envelopes, fail-closed parsing,
exact identities, and no prose-as-control-flow hold everywhere. **Persistence and recovery ceremony scales with the
authority the evidence carries** — and after `review-gate-right-sizing` declined the evidence-grade gate, no lane
here carries downstream-satisfying authority. Both the local and frontline lanes are advisory, so both get a
durable-but-advisory trace, idempotent retry, and re-run / resume-as-recovery — not evidence-grade storage,
generation compare-and-swap, or freshness-as-evidence. The local lane keeps enough durable state to resume an
interrupted review and leave a reviewable record; it keeps nothing whose purpose was to be trusted downstream as
proof.

### D1 — The `arc review` transition protocol

Extend the public `arc review` namespace with small, JSON-capable verbs exposing deterministic state transitions.
The CLI owns validation, identity construction, persistence, and reduction. The calling agent owns the judgmental
loop and launches a fresh reviewer only with the authorization the active harness requires. ARC does not host a
resident orchestrator or worker.

```text
arc review frontline resolve <file | ->
arc review frontline run <file | ->

arc review local prepare <file | ->
arc review local attest <file | ->
arc review local resume <file | ->

arc review respond <file | ->
arc review reduce <file | ->
```

Responsibility divides as follows:

1. **Prepare.** `arc review local prepare` derives the exact local target and request from trusted repository,
   vehicle, project-policy, and runtime bindings; consumes explicit project routing facts; binds effective method
   activity and work-unit assurance; creates the requirement and request; persists the lightweight admitted
   operation record; then materializes the immutable `local-change-set` carrier. It returns `ready` once that
   materialization verifies, and emits a complete typed reviewer payload. The operation record is written once, at
   admission; `ready` is a derived reading of the materialization, not a second durable state (D6).
2. **Launch.** For local analysis, the agent gives the prepared payload to the separately authorized
   independent evaluator. This step is outside the CLI.
3. **Run frontline.** `arc review frontline run` is the provider-effectful sibling. It consumes one complete `ready`
   resolution plus the exact adapter-supplied target, revalidates the registered source, publishes the pending
   non-evidentiary operation, prepares the exact-head checkout, resolves and interrogates the executable it will
   run, executes the bounded provider, and durably records the full normalized outcome before advancing operation
   state. Command-kind registrations only. A frontline run never becomes satisfying evidence.
4. **Attest.** `arc review local attest` accepts only the normalized result schema, derives runtime identity at the
   trusted boundary, validates the exact target, rubric, and delivered-guidance digest, and appends the advisory
   local receipt. It records that a review ran against the exact reviewed bytes; it appends no downstream-satisfying
   guidance-evidence pair (D8). It returns the reduction transition.
5. **Respond.** After the existing review-response checkpoint has presented the complete source-verified report and
   obtained approval, `arc review respond` accepts that strict `ApprovedDispositionSet` against either the
   attested-local receipt or one durable frontline outcome, then appends the approved dispositions as one advisory
   disposition record (D9).
6. **Reduce.** `arc review reduce` is the invocable composition over the shipped requirement, qualification,
   response, and projection reducers. It is read-only.
7. **Resume.** `arc review local resume` reads the durable operation record plus current repository facts and emits
   the next typed action. It may complete an interrupted idempotent transition (the receipt or disposition append),
   so it is deliberately not named `status`.

Work-unit and Errand workflows consume the same operations. Project scripts may pre-compose repository policy, but
they do not fork the protocol or become the only way to reach the local channel.

### D2 — Envelope contract and result vocabulary

Each command accepts a versioned JSON request from a file or standard input and emits exactly one strict,
command-specific JSON envelope. Only `schemaVersion`, `mode`, and typed `diagnostics` are common. Successful
envelopes add a state-discriminated payload whose `state` and `nextAction` are one legal pair; error envelopes carry
neither.

Registered TypeScript / Zod discriminated unions are the single contract authority. Command parsers, emitted JSON
schema, and reference projections derive from those types; the vocabulary below fixes the design but is not a second
hand-maintained runtime schema.

| Command             | Legal `state -> nextAction` pairs                                                                                                                                                       |
|---------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `frontline resolve` | `skipped -> none`; `offered -> bind-source` when no source resolved; `offered -> obtain-authorization` when a source resolved; `ready -> run-frontline`                                 |
| `frontline run`     | `clean -> none`; `findings -> respond`; `unavailable -> retry \| operator-repair`; `timed-out -> retry`; `stale-target -> prepare-current-target`; `failed -> retry \| operator-repair` |
| `local prepare`     | `exempt -> none`; `ready -> launch-review`; `unavailable -> operator-repair`; `stale-target -> prepare-current-target`                                                                  |
| `local attest`      | `attested-current -> reduce`; `stale-target -> prepare-current-target`; `expired -> rerun-review`; `not-attestable -> rerun-review`                                                     |
| `respond`           | `ready-to-fix -> apply-fix`; `settled -> reduce`; `already-settled -> reduce`; `stale-target -> prepare-current-target`                                                                 |
| `reduce`            | `findings -> respond`; `settled -> none`; `advisory-complete -> none`; `retryable -> retry`; `stale-target -> prepare-current-target`                                                   |
| `local resume`      | `suspended -> wait`; `review-complete -> reduce`; `respond-to-findings -> respond`; `stale-target -> prepare-current-target`; `expired -> rerun-review`                                 |

Reason-class discriminants make every multi-action row exact:

- `frontline run: unavailable` maps `rate-limited | transient-unavailable -> retry` and
  `source-unbound | capability-unsupported -> operator-repair`.
- `frontline run: failed` maps
  `transient-transport | process-failure | signal-termination | unexpected-adapter-failure -> retry` and
  `invalid-output | authorization-rejected -> operator-repair`.
- `local attest: not-attestable` fires when the normalized result is not terminal evidence — any `status` other
  than `complete`, **or** a `complete` status carrying a null verdict, which the result schema admits but
  attestation refuses. Attestation appends nothing in those cases.

**The pass cap is not a `frontline run` terminal.** `pass-cap-exhausted` stays a variant of the shipped normalized
outcome union — durable records may carry it, and `reduce` maps it (D10) — but the CLI never produces one. The
shipped resolver reaches its cap only by declining a _follow-up_ after approved dispositions, and because a fix
produces a new head and therefore a new target, that decline surfaces as advisory follow-up text in `respond` /
`reduce` output (D9), not as a run outcome. Enumerating it as a `frontline run` state would publish a transition no
sequence of legal calls can reach.

Those edges, plus `local prepare: unavailable` (a declared project policy binding that fails to parse or names an
unregistered source — see D8), are the protocol's only operator-repair surfaces. A valid domain outcome —
including findings, unavailable capability, timeout, stale target, or structurally valid external divergence —
exits successfully with one of those pairs. Expected compare-and-swap conflicts are not public states: every
mutating handler reloads and retries internally and surfaces only its domain result.

**Preparation preconditions are `invalid-input`.** `local prepare` refuses an unborn repository, an unresolved
base, a dirty index or worktree, or a non-commit `HEAD` (D4 step 2) through the `invalid-input` error envelope with
a typed diagnostic naming the failed precondition. These are not domain states: no review was admitted, so there is
nothing to report a `state` / `nextAction` about, and they are not `operator-repair` edges — the cure is committing
or stashing, not repairing a binding. This is the one place `invalid-input` covers repository condition rather than
malformed request input, and it is why the union's first member is named for the _invocation_ being invalid rather
than the request body alone.

The error envelope is a strict union over `invalid-input`, `corrupt-state`, and `unexpected-failure`. It exits 1 and
contains no `state`, `nextAction`, or success payload; its message and typed diagnostics are explanatory only.
`corrupt-state` includes an operation that claims completion while its required evidence is absent or mismatched. No
valid domain state is emitted for corrupt storage.

**Compatibility break.** The shipped `arc review frontline resolve` handler emits `error.code: "invalid-request"`.
That code is renamed to `invalid-input` so one strict union covers all seven verbs. The change is deliberate and
pre-GA: `frontline resolve` is the only shipped verb and is effect-free. It does have two adopter-facing consumers —
the `integrate-work-unit` and `run-errand` workflows invoke it by name — but both are rewritten by D16 in this same
work unit, so no surface is left reading the old code. The resolver otherwise stays compatible, gaining its explicit
`state` / `nextAction` projection without being padded with operation or persistence fields.

### D3 — Request authority and success-payload authority

Callers never provide compare-and-swap expected versions. Each mutating handler reads the current durable version,
performs its internal version-checked write, and returns `persistedVersion` on success when an operation or ledger
record exists.

| Command             | Caller-supplied request fields                                                                                                                                                   |
|---------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `frontline resolve` | `schemaVersion`, `changeSet`, `invocation`, optional `maxPasses`; effect-free                                                                                                    |
| `frontline run`     | `schemaVersion`, exact `target` from the project / host adapter, the complete `ready` resolution returned by resolve (which carries the authorized `pass`), optional `timeoutMs` |
| `local prepare`     | `schemaVersion`, `evaluatorIdentity`, the five caller-owned `routingFacts` fields, optional `freshnessMs`                                                                        |
| `local attest`      | `schemaVersion`, `operationId`, normalized `result`                                                                                                                              |
| `respond`           | `schemaVersion`, discriminated `source`, strict `dispositions`; source is either `{ kind: attested-local, receiptRef }` or `{ kind: frontline, outcomeRef }`                     |
| `reduce`            | `schemaVersion`, `operationId`                                                                                                                                                   |
| `local resume`      | `schemaVersion`, `operationId`                                                                                                                                                   |

Everything not listed is derived or reloaded internally. `local prepare` derives repository, target, vehicle,
author, policy, rubric, runtime, immutable source, and operation identities, and applies the framework default when
`freshnessMs` is omitted. `local attest` reloads all target, actor, policy, rubric, source, and receipt facts.
`reduce` follows durable references from its operation and reloads current repository facts.

**Routing-fact authority is per-lane, not global.** `ReviewRoutingFacts` carries six decision fields plus the
CLI-bound `assurance` and `activity` records (D1 item 1, D7). Which side supplies them follows the same rule that
governs target authority below: **the lane that can independently establish a fact derives it; the lane that holds
no target accepts what its adapter composed.**

- **`local prepare` — `changeSetState` is CLI-derived.** This verb resolves the base ref, `HEAD`, and their merge
  base (D4 step 2), so it holds the coordinates a changed-path record needs and computes `changeSetState` itself.
  Supplying it is `invalid-input` rather than a silently honored override. The remaining five —
  `contentKind`, `reviewRisk`, `ownership`, `surfaceAuthority`, `changeDeterminacy` — are caller-supplied.
- **`frontline resolve` — every fact is caller-composed.** The verb is effect-free and holds no target, base, or
  head, so it has nothing to derive from; its facts record arrives whole from the project or host adapter that owns
  the change request, exactly as `frontline run`'s target does. The frontline lane produces advice, never
  satisfying evidence, so nothing rests on the CLI having independently established these facts.

`contentKind` stays caller-supplied on both lanes even though it is load-bearing for the one obligation-_removing_
transition — `standardReview: exempt` requires `contentKind: documentation` together with
`surfaceAuthority: planning-grooming` and self / ownerless `ownership`. Deriving it generically is not possible:
the only shipped classifier is keyed to this repository's own directory layout and treats an unmatched path as
code-bearing, so a framework-generic derivation would make `exempt` unreachable in every other project. Hardening
it against a mis-declaring caller would also be futile here — that caller already controls the other two conjuncts,
the policy binding, and the evidence store, which is precisely the local-operator tamper-resistance this design
rejects as a permanent non-goal. Where the actor boundary genuinely differs, derivation is correct and already
exists: the hosted lane derives these facts from the change request, and that split belongs to the host adapter.

Omitting or malforming any caller-supplied field takes the conservative path by construction: the shipped reducer
resolves `changeSetState: unknown` on any diagnostic, which collapses the whole decision to the maximal floor
regardless of what the other fields claimed.

**The obligation is change-shaped; source selection is the driver's.** This projection's obligation is
change-shaped: `changeSetState: unknown` collapses to the maximal floor (`required`) — the conservative reading of
what the _change_ needs. It is deliberately **not** gated on source availability here. The `standardReview`
obligation is shared: it names the ordinary review a change needs, satisfiable by any one configured **standard
source** — the local `delegated-agent` (this lane's `local prepare` path) or a hosted provider — and RSB is blind to
hosted configuration, so demoting it locally would wrongly suppress a hosted-configured install. Source selection
and opt-out are therefore the review-policy driver's (`arc review resolve`, sibling-owned): it dispatches exactly
one configured standard source per pass in order, reaching a **no-op** when none is configured and `unavailable`
when a configured source cannot satisfy. RSB keeps the obligation change-shaped and supplies the local lane as one
such source; the driver owns dispatch. See § Cross-cutting — Review-source model (settled with
`review-gate-right-sizing`).

**Frontline target authority.** `frontline run` is the one verb that accepts a `target` as caller input, because
the frontline lane is advisory and its target is composed by the project or host adapter that owns the change
request. That input is validated, never trusted as proof: `frontline run` re-derives the target coordinates from
the exact-head checkout it creates (D11) and refuses on any mismatch, so the caller selects _which_ target to
review while the CLI proves _what was actually reviewed_. `frontline run` additionally revalidates the current
source registration and derives policy / source digests and operation identity.

Every success payload contains the common header plus only fields the command can truthfully supply. Failure and
non-ready variants never fabricate operations, evidence references, or targets they did not persist:

- `frontline resolve` returns `routing` and `frontlineReview`; it never returns operation fields. It is effect-free
  and reads no operation state. A `ready` variant carries the authorized `pass` and the effective allowance, which
  is what `frontline run` executes under (D11). Moving an `offered -> obtain-authorization` result forward is a
  **re-resolve** once authorization is obtained — the shipped forced-invocation mode — not a separate verb;
  `frontline run` accepts only a `ready` resolution.
- Every `frontline run` terminal variant returns `operationId`, `persistedVersion`, full `target`, and the durable
  `outcomeRef` plus its digest. Executable digest and qualified version appear exactly when an executable was
  resolved and launched; never-executed variants (`source-unbound`, `capability-unsupported`,
  `authorization-rejected`) carry no executable identity. Stale execution is itself a durable typed outcome;
  findings never live only in the command response.
- `local prepare: ready` returns `operationId`, `persistedVersion`, full `target` and `request`, the exact typed
  `reviewerPayload`, and `sourceRef` plus `sourceDigest`. `exempt`, `unavailable`, and `stale-target` omit
  synthetic operation fields; stale returns the attempted and current target. Prepare's staleness check precedes
  publication (D5), so no prepare `stale-target` ever carries an operation.
- `local attest: attested-current` returns the operation / version, exact target, source reference, receipt
  reference, and `receiptRecorded: true`. `stale-target` is a strict sub-union: pre-append carries
  `receiptRecorded: false` and no receipt reference; post-append carries `receiptRecorded: true` and the exact
  receipt reference. `expired` and `not-attestable` carry the operation / version and no receipt reference.
- `respond` always returns the source review `operationId`. `ready-to-fix` returns the disposition-record reference
  and validated `FixAuthorization`; `settled` and `already-settled` return the disposition-record reference.
- Every `reduce` variant returns `operationId`, the loaded `persistedVersion`, and full current target. Local
  advisory variants (`settled`, `advisory-complete`, `findings`) return the advisory reduction projection over the
  local receipt and disposition status; `findings` also returns the exact response source references. A frontline
  `advisory-complete` returns the frontline outcome reference. `retryable` returns a closed `retryCommand` plus the
  exact request reference.
- Every `local resume` result returns `operationId`, `persistedVersion`, and full current target. Receipt-complete
  states return their durable receipt reference; only `respond-to-findings` owns a `responsePlan`.

### D4 — Canonical local target and request derivation

`local prepare` does not accept a prebuilt `ReviewTarget`, `ReviewRequestV2`, repository identity, Git object ID, or
attestation runtime identity as trusted caller data. It derives them:

1. Resolve or mint one repository-local UUID in a locked Git-common identity record. The record is shared by every
   sibling worktree, survives checkout relocation, and deliberately does not claim cross-machine identity; any
   hosted import authenticates its mapping to a host repository explicitly, downstream of this work.
2. Read the logical `baseRef` from configured `branch.base`, resolve `refs/heads/<baseRef>` and `HEAD` as commits,
   compute their merge base as `diffBaseSha`, and resolve `diffBaseTree` and `headTree` from those exact commits.
   Reject an unborn repository, unresolved base, uncommitted index / worktree state, or non-commit HEAD. Re-read the
   coordinates immediately before publishing operation state and return `stale-target` if they moved.
3. Resolve the vehicle and author from live ARC state: a work unit uses its canonical meta owner and requires the
   active identity to match; an Errand uses the active ARC identity. The command's sole explicit actor selection is
   the evaluator identity, because only the authorized launcher knows which fresh evaluator it will invoke. Local
   OS / repository write authority admits that selection; the CLI requires it to differ from the author and binds it
   through payload, result, and receipt.
4. Resolve the attesting runtime from the actual installed CLI / runtime binding at prepare and again at attest. A
   project-supplied label or caller-supplied version is never identity evidence.
5. Derive the request and operation identity deterministically from the exact target, requirement, actor bindings,
   and request mechanism through the shipped constructor. No generation compare-and-swap is allocated: the local
   lane carries no downstream-satisfying evidence to distinguish across re-runs, so identity is a pure function of
   those facts. A new head is a new target and a new operation; the frontline lane keeps its own advisory pass /
   generation bookkeeping (D11), separate from this.

**Identical-retry predicate.** A `local prepare` invocation is an _identical retry_ — returning the existing
operation rather than admitting a new one — when the derived `targetId`, evaluator identity, author,
policy-binding digest, and request mechanism all match a live operation for this repository. Any
difference in those facts admits a new operation (a new head, by construction, is a different target). An identical
retry is idempotent: it returns the same `operationId` and re-verifies rather than rebuilds an intact
materialization, so repeating `local prepare` while an evaluator is running cannot pull the checkout out from under
it. It does create a pin or checkout that is _absent_ — the recoverable case publish-first makes reachable when an
invocation fails between publication and pin creation (D5). The rule is never-destroy, not never-create.

That predicate is also the **operationId re-acquisition path**. `local resume` takes an `operationId`, and after a
lost session the caller no longer has one; re-running `local prepare` from the same working tree derives the same
identity and returns it. No enumeration affordance is added to the operation-state port — the derivation _is_ the
lookup, which is why target and actor facts key the operation rather than a minted opaque id.

### D5 — Immutable local review source

Preparation never asks the evaluator to inspect the caller's mutable worktree. Add the registered
`LocalReviewSourceV1` descriptor with `semanticsVersion: git-object-range/v1`, repository and target identities,
object format, `diffBaseSha`, `headSha`, `diffBaseTree`, `headTree`, stable opaque `reachabilityRef` and
`materializationRef` locators, and `sourceDigest`. The digest is the domain-separated canonical digest of the
semantic fields, explicitly excluding `sourceDigest` itself and both operational locators. It therefore binds the
exact Git-object range without a recursive preimage or filesystem / ref-name dependence.

**Publication precedes the pin.** After deriving the clean target and operation identity, preparation re-reads the
target coordinates and returns `stale-target` if they moved, then **publishes the admitted operation and its
cleanup TTL first**. Only then does the source adapter create the operation-owned Git ref under its private
review namespace pointing to `headSha`, verify the pin and range, and create the detached checkout. Because
`diffBaseSha` is the verified merge-base ancestor, that pin keeps the entire reviewed range and both trees
reachable.

This ordering is a correctness requirement, not a preference. An orphan pin is defined as one whose operation
record is absent, so publishing first means that class **cannot arise from a live prepare at all** — every pin the
adapter creates already has its record on disk. The alternative ordering would need pin creation and publication to
be mutually atomic, which the substrate cannot express: `publishOperation` is itself a Git-common state update that
takes the namespace write lock, and that lock is non-reentrant with a bounded wait, so wrapping the sequence in an
outer hold of the same lock would deadlock into a timeout rather than serialize.

The residual case is the benign one and is already covered: an operation published whose pin is missing or whose
checkout was lost is restored idempotently from the published record (below). Nothing is left partially admitted —
a failure between publication and pin creation leaves a recoverable operation, not an unreachable ref.

Before launch, the adapter proves detached `HEAD == headSha`, the checked-out tree equals `headTree`, both range
endpoints remain present, the reachability ref still equals `headSha`, and porcelain-v2 status is empty. Each proof
failure has a defined outcome rather than an assertion: a missing pin or lost checkout whose objects all remain is
restored idempotently in place from the published operation and the proof re-run once; a pin resolving to different
bytes, or absent objects, is `corrupt-state`. The typed reviewer payload contains the resolved review root,
`diffBaseSha`, `headSha`, `sourceRef`, and `sourceDigest`; no mutable caller-worktree path enters it.

The normalized evaluator result must echo `sourceDigest`, and attestation reloads the source descriptor, recomputes
its semantic digest, and re-verifies the pin plus detached checkout before accepting the result. If the checkout
was lost, resume recreates it from the pinned objects. If the pin is absent but every object remains, resume
restores it idempotently; a pin targeting different bytes, or a missing pin whose objects were pruned, is
`corrupt-state`. Moving the original branch away and
back during evaluation does not change the reviewed source; it can only make that exact target no longer current for
later reduction.

The materialization and reachability pin may be released only after the local receipt is durably recorded or the
operation terminally expires under its cleanup TTL. Release is idempotent, and it runs through the source store's
sweep inside `local prepare` and `local resume`; no background process.

**The sweep reaps two classes, not one.** A pin is reapable when its operation record is **absent** (a true
orphan — reachable only from an interrupted or externally-disturbed run, since publication now precedes pin
creation) **or** when its operation has **terminally expired** under its cleanup TTL with no complete receipt. The
second class is what makes cleanup total: an abandoned review whose `operationId` is no longer derivable — the
ordinary case once HEAD moves, since `targetId` changes with it — still has a live record, so an orphan-only sweep
would never reap it and its pin would block Git maintenance indefinitely. Expiry is readable from the record's own
cleanup TTL, so the sweep needs no enumeration affordance beyond the pins it is already walking.

The sweep cannot strand a live prepare: it reaps only records that are absent or already expired, and a prepare
publishes a fresh record before its pin exists. The registered descriptor and receipt reference survive cleanup, so
the historical record does not depend on an ephemeral path while an in-flight retry stays protected from Git
pruning.

### D6 — Local operation state

`ReviewOperationStateSchema` is a closed discriminated union whose shipped variants are `frontline-run` and
`review-suspension`. Neither fits a local review operation: `frontline-run` is provider-specific, and
`review-suspension` mandates `wakeupToken` and `deadlineAt` on a hosted-watcher model with no local meaning.

Add a third `local-review` variant carrying the operation envelope, vehicle, repository identity, `targetId`,
`requestId`, policy version, the local policy binding digest, the admitted attestation runtime kind, `sourceRef`
and `sourceDigest`, and a plain cleanup TTL (the bound on how long an abandoned pin survives before the sweep reaps
it — not an evidence-admissibility window). Register it in the closed durable-record inventory alongside the
existing variants.

**The `local-review` record is written once, at admission, and never advanced.** Every field above is fixed at
admission; none is mutable afterward. Publication state is **derived, never stored**: whether the receipt and
disposition records exist is read from their stores, and whether the source is materialized is read from the
pin and detached checkout. `local attest` and `local resume` already re-read all of those on every entry (D5, D12),
so a stored phase would duplicate derivable state and introduce a disagreement mode — a torn write between
appending a record and advancing a phase would manufacture exactly the `corrupt-state` condition the recovery
design exists to prevent. The stores and the pin are the authority.

Two consequences bind the rest of this spec, and the local lane's vocabulary follows them:

- **"Advancing" an operation is frontline-only.** The `frontline-run` variant genuinely carries a mutable `outcome`
  that claims completion, so publish-pending-then-record-outcome is a real two-write sequence there. The local lane
  has no equivalent: `ready` is derived (D1), and there is no local "operation advance" for recovery to complete.
- **`corrupt-state`-on-claimed-completion is likewise frontline-only.** A local operation cannot claim completion,
  so the local corruption conditions are exactly the evidence-side ones — guidance without its receipt, a digest or
  reference mismatch, or a pin resolving to different bytes.

**The `frontline-run` variant's outcome enum extends with the same two terminals.** D11 makes `timed-out` and
`stale-target` first-class in the normalized outcome union, and the shipped `persistFrontlineRunOutcome` writes the
normalized `outcome` value directly into `FrontlineRunState`, whose enum is currently `pending | clean | findings |
failed | unavailable | pass-cap-exhausted`. Without the matching extension, persistence throws on exactly the two
terminals D11 introduces. Both are registered records under a strict-current migration posture, so the enum
extension and the new `local-review` variant land together as one inventory change.

`review-suspension` remains a registered schema — see D14 — but gains no new consumer here.

### D7 — Assurance composition

Production composition must call the existing method-activation resolver rather than constructing literal activity
facts. The adapter reads the registered `self-review` and `frontline-review` method files, preserves package-default
fallback behavior, and returns diagnostics on the public result so malformed project declarations are visible.

Replace the boolean-only `ReviewRubricAvailabilityPort` with an identity-keyed `ReviewRubricBindingPort`. Its production
adapter resolves the exact `Review Rubric` meta identity through the canonical method-file loader, then parses one
optional, strictly typed `review-augmentation` frontmatter field into `StandardReviewProjectAugmentation`. The
field carries `rubricId` plus sorted, unique typed dimensions; `rubricId` must version the named method identity as
`<identity>/vN`. Method prose is never parsed into control data, and a command payload cannot supply an
augmentation. This extends the existing method-frontmatter schema and loading path rather than adding another
registry, configuration axis, or document family.

A resolved overlay augments the immutable baseline deterministically. A missing method, missing structured field,
malformed projection, ambiguous lookup, or identity mismatch refuses that review request with a diagnostic. An
absent meta field uses the baseline unchanged.

At review time the binding is automatic from the `Review Rubric` meta field; the agent does not rediscover or
hand-compose the overlay. Authoring the field is out of scope here: no shipped workflow or meta template currently
offers a rubric overlay, and adding that offer is a planning-workflow concern rather than a review-surface one. The
declaration path this work depends on is the meta field the shipped reader already parses, which is sufficient for a
project to declare an overlay by hand.

### D8 — Guidance delivery and the local policy binding

Preparation projects the exact effective guidance (the baseline rubric plus any resolved overlay, D7) and computes
its carrier-specific `guidanceDigest` using the shipped domain-separated preimage. The reviewer payload carries that
digest; the normalized result must echo it; attestation re-resolves the overlay and recomputes the delivered
projection before accepting the result. This is a delivery-correctness check — it proves the evaluator reviewed
under the guidance actually delivered — not a downstream-consumable evidence record. The baseline
`rubricVersion + rubricDigest` are unchanged by augmentation.

The satisfying receipt / guidance pair is not built. With no downstream gate consuming it (Non-Goals), attestation
appends a single advisory `ReviewReceiptV2` recording that a review ran against the exact reviewed bytes under the
exact delivered guidance. There is no separate `ReviewGuidanceEvidenceV2` store, no satisfying-pair completion
requirement, and no evidence-first partial-publication window to recover. The receipt is a durable-but-advisory
trace: a valid historical record of what was reviewed, never proof a merge gate consumes. `ReviewReceiptV2` is used
as shipped — not mutated, and `applicabilityId` is not overloaded.

Source and admission policy arrive through a strict `LocalReviewPolicyBinding`, not as independent free-form fields.
It carries the complete sorted acceptable-source set, initial admission mode, request mechanism, and accepted
attestation runtime kinds, has its own registered canonical digest, and the CLI validates the selected evaluator /
carrier against it. The shipped v2 identities retain their exact ownership: acceptable sources and initial admission
enter `policyVersion` and the requirement, while the request mechanism enters the request. The complete binding
digest and admitted runtime kind are carried by the operation record and the receipt, not smuggled into a v2 field
that does not own them.

**The package default is opt-in, not a forced review.** RSB provides the lane _mechanism_ (the verbs); the local
lane is one **standard source** (`delegated-agent`) the review-policy driver may select, off until a project lists
it in the driver's ordered `standard_sources` (§ Cross-cutting — Review-source model). When the driver selects it,
the default binding permits `{ sourceKind: agent, qualifier: standard-review/v1 }` with the fixed
`local-attestation` request mechanism as the _acceptable source_; a project may further narrow the binding to a
stricter typed one by supplying a composition adapter (code, not a configuration key, which is why RSB adds no
configuration axis).

**Declaration surface and the `unavailable` cure.** `local prepare: unavailable` fires only where a composition
adapter is present but its declared binding fails to parse or names an unregistered source; the cure is correcting
that adapter's declaration. A project with no adapter takes the package default and can never reach this state. The
binding is never silently downgraded to a weaker default on a parse failure.

Project routing facts remain explicit because generic ARC cannot infer project sensitivity or ownership. Risk,
ownership, and surface authority are project-policy facts: the self-hosting adapter derives them, the generic CLI
accepts their typed values, and no `review-routing` method is minted.

### D9 — Approved dispositions and the fix path

Add a registered `ApprovedDispositionRecordV1` persisted through an append-only, repository-scoped store in the
Git-common namespace. The record binds the review operation, a discriminated source reference (receipt +
local-source references, or frontline-outcome reference), the full `ApprovedDispositionSet`, and a nullable
`FixAuthorization`. This is an advisory record, not evidence-grade: identical replay is idempotent so a retried
`respond` converges, and a different record for the same disposition set is refused as a conflict — but the record
is a durable trace of the human disposition, never proof a downstream gate consumes. `respond` appends it after
approval validation; `reduce` reads it to conclude settlement. The shipped disposition, approval, and
fix-authorization contracts are consumed as-is; no parallel authority store or settlement-batch machinery is added.

`respond` requires its approver to be the active local identity and its proposer to be the composing runtime
identity — both derived at the trusted boundary by the same mechanism as the attesting runtime, never caller text —
so the shipped distinct-actor check structurally encodes the agent-proposes / human-approves shape. It revalidates
every finding against the selected source record before appending.

The fix path is deliberately simple: an approved fix is applied by the agent under the ordinary review-increment and
commit interlock, producing a new head. A new head is a new review target — re-enter `local prepare` (or
`frontline resolve`) there; nothing carries across a fix. The disposition record closes the old target's response
obligation, and the fixed change earns its own review at its own head. This trades one extra evaluator pass per
fixed head for the absence of a durable fix ledger, fix-phase verbs, and their interrupt surface. For a frontline
source, the shipped `resolveFrontlineFollowUp` semantics run as advice in the `respond` / `reduce` output — whether
another advisory pass at the new head is worthwhile — never as a durable binding chain.

### D10 — Invocable reduction

Add a registered `ReviewReductionProjectionV1` and production adapter over the shipped forward requirement and
projection reducers. `arc review reduce` resolves its source from `operationId`; callers cannot supply a receipt,
disposition record, target, or conclusion.

For an attested-local source it reloads and validates the exact target / requirement / request / receipt chain, the
immutable source descriptor, and any disposition record before deriving the projection:

- a current clean receipt returns `advisory-complete` with the advisory projection;
- a current findings receipt without a complete disposition record returns `findings` with the exact response
  source references;
- the same receipt with a complete approved disposition record returns `settled`;
- a receipt whose own result is `failed` or `unavailable` returns `retryable`: `local attest` never appends one, so
  it can only arrive from a prior contract generation or an imported record, and the repository-shared receipt
  store returns every receipt for a target — reduction reads what is there rather than assuming what this CLI wrote;
- a changed current target returns `stale-target`.

For a frontline authority, reduction never emits a satisfying projection, and its mapping is total over the outcome
union: undispositioned findings return `findings` with the outcome reference; a clean or fully dispositioned outcome
returns `advisory-complete` with the advisory follow-up verdict, as does `pass-cap-exhausted` (the advisory lane is
spent); a non-review terminal returns `retryable` naming `frontline-run`; a moved head returns `stale-target`.

Reduction is read-only. It never writes — it completes no pending append and, on the frontline lane, advances no
operation state; the returned retry / resume locus invokes the owning idempotent command instead. Evidence that is
missing or mismatched relative to what a record asserts remains `corrupt-state`, never a reduction result: on the
local lane that means a digest or reference mismatch, and
on the frontline lane it additionally covers an operation whose completion claim outruns its evidence (D6).

### D11 — Durable frontline outcomes and exact-target execution

Two CodeRabbit adapter gaps close here, because the new public `frontline run` surface would otherwise
operationalize them:

- Bind both `diffBaseSha` and `headSha` to the provider invocation. A before / after HEAD equality check is
  insufficient because a checkout can move away and return during the run. The adapter must execute against an
  immutable checkout at the target head, or use an equivalent provider-native exact-head mechanism; observing the
  same mutable ref twice is not acceptable proof.
- Executable identity comes from what actually ran. The adapter resolves the executable once, interrogates that
  resolved artifact for its version, launches the same resolved artifact, and records the digest and qualified
  version in the durable outcome. The caller-supplied CLI version leaves the trusted input. Sealed snapshots,
  copy-on-resolve artifacts, and write-prevention across the launch window are deliberately not built.

Add a registered `FrontlineOutcomeRecordV1` containing the frontline operation identity, source registration
identity, a nullable executable identity (digest and qualified version, present exactly when an executable was
resolved and launched), the full normalized `FrontlineExecutionOutcome`, and its canonical outcome digest. Persist
it through an append-only, version-checked `FrontlineOutcomeStore`; the initial adapter uses the Git-common review
namespace, but the record and port make no tracked-repository or path assumption. The record is durable advisory
source evidence for response — not a satisfying review receipt, and not host-side authority.

Extend the normalized outcome union so `timed-out` and `stale-target` are first-class alongside the shipped clean,
findings, unavailable, failed, and pass-cap-exhausted variants, and add the closed reason classes D2 names. Those
changes are owned by the provider-neutral outcome schema; adapters map their existing detailed results into it
rather than letting CLI handlers reinterpret provider prose. Both new variants are non-clean, so each carries a
non-null `reason` under the shipped refinement: `timed-out` carries the execution-timeout reason, and
`stale-target` carries the observed-versus-expected head mismatch. The CodeRabbit adapter's existing `stale-head`
result normalizes to `stale-target` rather than to `failed`; the `stale-head` provider-level result name is
retained, and only its normalization target changes. The matching `frontline-run` operation-state enum extension
lands with D6.

An interruption after outcome publication is repaired by validating that exact record and advancing operation state;
re-entry to a concluded operation returns the same durable outcome reference. Reuse discriminates on review content,
not failure class: a review-concluding outcome — clean, findings, or pass-cap-exhausted — is reused at unchanged
coordinates. Every non-review terminal — `timed-out` and all `unavailable` / `failed` reason classes — concludes its
operation without concluding the pass, and a fresh invocation admits a new operation at an advanced generation for
the same head with the same pass number (attempt bookkeeping, not pass consumption). The retry-vs-`operator-repair`
split is advice about the next action, never a persistence discriminator, so a repaired authorization or upgraded
executable self-cures by simple re-invocation. The shipped reuse resolver composes unchanged: generation keys the
operation identity, so a fresh attempt never re-reaches a concluded operation. If no record was published, re-entry
retries the same operation and never promotes an inferred result.

**Where `pass` comes from.** The provider adapter requires an explicit `pass`, so the protocol must say who assigns
it: `frontline run` takes it from the `ready` resolution it consumes, never from a request field and never by
reading prior operations. A first resolution over a head authorizes pass 1. After findings are dispositioned, the
shipped follow-up resolver may authorize one more — and it authorizes it **at the changed head**, returning pass 2
against the new target. That is the real shape of the two-pass allowance: not two runs at one head, but an initial
run plus one follow-up run across the fix boundary. Pass numbering therefore does _not_ reset per head; it tracks
the advisory chain the resolver authorizes, and a chain is spent once it reaches its allowance. Pass counts remain
advisory bookkeeping in the operation-state record — a caller that never consults the follow-up resolver simply
starts a new chain, which is the same latitude every advisory surface in this design carries.

Stale or mismatched targets fail closed and produce typed outcomes. A stale run never becomes evidence for a newer
head even when its result is otherwise complete.

`arc review respond` uses a source-discriminated authority. Attested-local input reloads and validates the exact
receipt and immutable local source; frontline input reloads and validates the exact durable
outcome and rejects any non-findings outcome. Both are projected through the existing universal review-response
checkpoint and validated against the same strict `ApprovedDispositionSet` before the disposition record is appended.

### D12 — Bounded execution, cleanup, and recovery

Provider execution runs under a plain execution timeout — an operation input with a framework default, not a new
project configuration axis. The runner passes the remaining time and an abort signal to the adapter and kills the
spawned process on expiry; a timed-out result is typed `timed-out` and can never be normalized as clean or findings.
Unknown thrown errors map to the closed adapter-failure class rather than an unbounded wait.

Local operations persist a cleanup TTL at admission — `freshnessMs` when supplied, else the framework default. It
bounds only how long an abandoned pin and detached checkout survive before the sweep reaps them (D5); it is not an
evidence-admissibility window, because nothing here is downstream evidence. Attestation is gated on the
_materialization_, not the clock: while the pinned source is still present, a late `local attest` records its
advisory receipt normally; once the sweep has reaped the materialization, `local attest` and `local resume` find no
checkout to attest against and return `expired -> rerun-review`. Re-entry does not extend the TTL, and re-preparing
re-materializes at the current head.

Corrupt durable state fails loudly: a malformed registered record, or a digest or reference mismatch, emits the
strict `corrupt-state` error envelope and exits 1. On the frontline lane, where an operation record does carry a
completion claim, a claim whose required evidence is missing is corrupt on the same terms. No repair action or
success state accompanies any of them.

There is no receipt / guidance partial publication to recover: attestation appends a single advisory receipt
atomically, and the local operation record is written once at admission (D6), so it is never mid-advance and there
is no pending second write. A crash after the receipt but before dispositions leaves a findings receipt with no
disposition record, which reduction and resume read as `findings -> respond` — an ordinary continuation, not a
corrupt in-between. Expected compare-and-swap residue never surfaces. There is no `repair-required` state: with no
durable fix machinery, an unrelated head transition is simply `stale-target`.

Treat a receipt's exact-target validity and its current applicability as separate facts. `local attest` first loads
the operation and the receipt store. An already-recorded exact receipt replays identically regardless of the
current time: the receipt is the durable trace, so re-attesting the same result at the same target is idempotent.
When the materialization has been reaped and no receipt exists, attestation appends nothing and returns
`expired -> rerun-review` with `receiptRecorded: false`.

For a live operation, attestation checks the current target. If already stale, it appends nothing. Otherwise it
appends the exact-target receipt, then re-reads the current target:

- an unchanged target returns `attested-current` with the durable receipt reference;
- a changed target returns `stale-target` with `receiptRecorded: true`, the historical receipt reference, and
  `nextAction: prepare-current-target` for the new target.

The receipt remains a valid record for the exact target it names; it simply cannot describe a newer target. Every
reduction re-reads the current target and considers only matching receipts. Do not add a target-aware publication
lock: the Git-common state lock cannot atomically cover Git refs, later reduction revalidates again, and no local
result claims host-side merge authority.

Re-entry into a waiting operation validates the operation identity, exact target, and immutable source digest before
accepting a terminal result; a result for different reviewed bytes is rejected regardless of matching identifiers.

### D13 — Storage ports and namespaces

Receipt, disposition-record, frontline-outcome, reduction, local-source, and operation-state ports remain storage
abstractions. Git-common namespaces and private reachability refs are the initial repository-local adapters needed
for sibling-worktree continuity, not semantic record addresses: identities never depend on a Git-directory path or
ref name, durable references are opaque adapter references, and every mutation is append-only or version-checked as
its record requires. A future materialized git-backing-store adapter can implement the same ports without reshaping
records or adding a review-specific storage setting.

### D14 — Predecessor prune-at-consumption

`review-architecture` shipped a local lane that is dormant end-to-end. A reachability walk from every production
entry point identifies 23 modules with no reachable production caller. Each is classified below, reconciled against
`review-gate-right-sizing`'s coordination seam (its § D4), which retires the gate cohort and with it the downstream
claims several of these modules rested on.

**Consume — this design wires it (14 modules).**

| Module                                 | Wired by                                                |
|----------------------------------------|---------------------------------------------------------|
| `hosts/local/receipt-store.ts`         | local receipt append (D8)                               |
| `hosts/local/operation-state-store.ts` | operation publication and reload (D6)                   |
| `hosts/local/git-common-state.ts`      | identity record, sweep lock (D4, D5)                    |
| `core/local-carrier.ts`                | `local-change-set` carrier materialization (D5)         |
| `runtime/local-attestation.ts`         | normalized result schema and attest path (D12)          |
| `core/response-plan.ts`                | universal response checkpoint (D9)                      |
| `policy/activity.ts`                   | method-activation resolution (D7)                       |
| `policy/assurance.ts`                  | work-unit assurance binding (D7)                        |
| `policy/standard-review-projection.ts` | obligation projection feeding requirement creation (D4) |
| `policy/frontline-operation.ts`        | run resolution, pending and outcome persistence (D11)   |
| `policy/frontline-carrier.ts`          | authorization offer and carrier preparation (D2)        |
| `policy/frontline-response.ts`         | frontline outcome to response projection (D11)          |
| `policy/frontline-follow-up.ts`        | advisory follow-up verdict (D9, D10)                    |
| `core/schema-inventory.ts`             | extended with this work's registered records (D6)       |

**Boundary — joint-confirm with `review-gate-right-sizing` (2 modules, outside the dormant 23).**
`policy/standard-review.ts` and `policy/standard-review-guidance.ts` are reachable today only through the
shadow modules the sibling's cut removes, so the walk never flagged them among the 23; they orphan on that side
only after that cut — **except** D7 here consumes `StandardReviewProjectAugmentation`, which
`standard-review-guidance.ts` defines. Disposition is this WU's per-module consumer-test call, confirmed
jointly at build so neither WU deletes a module the other still consumes:

| Module                               | Leaning (confirm at build)                                                                                              |
|--------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| `policy/standard-review-guidance.ts` | **Consume** — D7's rubric binding parses its `StandardReviewProjectAugmentation`                                        |
| `policy/standard-review.ts`          | **Consumer-test** — consume if the obligation projection (`standard-review-projection.ts`) imports it; retire otherwise |

**Handed to `review-gate-right-sizing`'s cut (3 modules).** These carried downstream claims the gate cohort owned;
that cohort retires there, so they are deleted on that WU's side rather than kept here. Merge order is append-only
and coordinated — whichever branch lands first removes them:

| Module                                | Was claimed by                                                                               |
|---------------------------------------|----------------------------------------------------------------------------------------------|
| `providers/coderabbit/config.ts`      | provider qualification (retired) — deleted with the hosted provider surfaces                 |
| `runtime/qualification-activation.ts` | activation-diff compilation (retired) — deleted with the qualification / promotion machinery |
| `runtime/operations.ts`               | closed launcher inventory over the ten `run-*.ts` — deleted once those launchers are gone    |

The `review-suspension` variant of `ReviewOperationStateSchema` stays as registered contract; it gains no consumer
here.

**Retire — no consumer and no named downstream claim (6 modules, deleted with their tests).** The last two join the
cluster because `review-gate-right-sizing` retires the github-adapter WU that was their only downstream claim (its
§ D4 hands the disposition here); the consumer test now returns delete.

| Module                                    | Reason                                                                                    |
|-------------------------------------------|-------------------------------------------------------------------------------------------|
| `runtime/review-reentry.ts`               | superseded design                                                                         |
| `runtime/review-reentry-fallback.ts`      | superseded design                                                                         |
| `runtime/review-wakeup-capability.ts`     | superseded design                                                                         |
| `providers/coderabbit/frontline-plain.ts` | documented as a compatibility fallback but imported by nothing                            |
| `core/contract-version-dispatch.ts`       | only claim was the retired github-adapter WU's v1/v2 ledger-upgrade contract; no consumer |
| `core/forward-evidence-eligibility.ts`    | same: v1-evidence-audit-only claim retired with the github-adapter WU; no consumer        |

The three re-entry modules implement durable suspension reconstruction plus an armed promoted watcher. The
architecture that shipped replaced that model with stateless re-query: the wake-up workflow is an echo-only relay
and privileged reconciliation re-queries canonical state, so wake-up events are transport hints rather than state.
`review-gate-enforcement-cutover` shipped the watcher, and no surviving draft claims suspension reconstruction or
watcher arming — the github-adapter WU that had claimed passive-await and head-mutability contracts is itself
retired by `review-gate-right-sizing`, and those contracts are already reachable in production regardless. Retiring
these also orphans `reconstructReviewSuspensionState`, which is removed while its
containing store class is retained, and the four wakeup port interfaces in `core/ports.ts` —
`ReviewWakeupRequest`, `ReviewWakeupCapability`, `ReviewScheduledWakeupRequest`, and
`ReviewScheduledWakeupCapability` — whose only consumers are the two retired runtimes. They retire with the
cluster: leaving unconsumed capability seams in the file this design calls the port boundary would violate the same
rule the cluster is retired under, and Goal 6 is stated at port granularity, not module granularity.

Retirement additionally reaches one module outside the dormant 23. `core/review-reentry-schema.ts` is
production-reachable through schema registration, so the walk never flagged it — but its only functional producers
are the two re-entry runtimes above, and its published `review-reentry-result` state vocabulary
(`suspended | review-complete | respond-to-findings | stale-target | timed-out | provider-failed |
operation-conflict`) sits one step from, and disagrees with, the `local resume` envelope this work introduces.
Publishing a registered schema with no producer alongside a near-duplicate live vocabulary is a coherence cost, so
the schema and its registration retire with the cluster. `local resume` defines its own envelope rather than
inheriting a hosted-suspension shape.

`providers/coderabbit/frontline-plain.ts` is retired rather than wired: the structured `--agent` parser is the only
path any design here depends on, and wiring a fallback would require a selection rule and failure semantics that no
spec owns. Recovery for every retired module is from history.

### D15 — Documentation surface reconciliation

`TECHNICAL-OVERVIEW` § 2 Architecture Components describes the review controller as "outside the tsup entry graph
and npm package manifest." That is **already inaccurate**: `cli.ts` imports the review handler, which imports four
`review-gate` modules, so the tree entered the bundle when `frontline resolve` shipped. This work corrects a
standing error and widens what the corrected text must cover — after it, the local lane is a working,
adopter-reachable surface with no hosted provider. Update that section to describe the shipped `arc review` CLI
surface and preserve the standing statement that no host-side context is treated as operational merge authority.

**Shared surface with `review-gate-right-sizing` (its E2).** That WU also rewrites § 2 — its cut deletes the GitHub
App, controller, and check-run projection this text would otherwise describe a boundary against. The two edits are
append-only and merge-order-coordinated: whichever lands second reconciles so § 2 neither reintroduces the deleted
controller nor describes a boundary against a machine that no longer exists. The review-controller text is
repository-specific and lives in the rendered instance `.arc/reference/TECHNICAL-OVERVIEW.md` (its
`### Self-Hosting Review Gate` section); the generic package-source template carries no such section, so these edits
land in the rendered file directly rather than projecting from package source.

### D16 — Invoking workflow reconciliation

The seven verbs need an owning surface that calls them, and two shipped adopter-facing workflows currently occupy
that position while prescribing something adopters cannot do. `integrate-work-unit.md` and `run-errand.md` both
instruct the agent to hand-compose the routing-fact record, run `arc review frontline resolve -`, and then "resolve
`frontline-run` through `ReviewOperationStateStore`… publish pending state before the carrier effect and the
normalized outcome after it" — naming a TypeScript interface that exists only inside the repository-only tree.

That is the same failure this work unit exists to close, expressed in prose rather than code: a documented
procedure with no reachable production route. Leaving it would ship seven verbs with no caller while the surface
that should call them still points at a library.

Reconcile both workflows against the protocol:

- Replace hand-composed operation-state management with `arc review frontline run`, which owns pending publication,
  carrier execution, and durable outcome recording (D1 item 3, D11).
- Keep the routing-fact record the workflows compose for `frontline resolve` (D3 assigns every frontline fact to
  the caller), but drop the operation-state prose around it. Where a workflow reaches the _local_ lane, it supplies
  only the five caller-owned fields and lets `local prepare` derive `changeSetState`.
- Route the local lane through `local prepare` / `local attest` / `local resume` and the universal `respond` /
  `reduce`, so the workflows express the review loop as verb invocations rather than library calls.
- Carry the `invalid-input` rename (D2) so no shipped surface reads the old error code.

Both files are package source under the two-copy discipline; edits originate in `packages/arc-framework/arc/` and
project into `.arc/`. This is workflow-prose reconciliation only — it introduces no method, extension, or
configuration surface, and does not alter the interlock structure either workflow already carries.

**Shared surface with `review-gate-right-sizing` (its E1).** Both workflows are also edited by that WU, which wires
its hosted-provider choreography and the `arc-cleared` merge guard into the same review segment. This WU owns the
local / frontline rewrite and the `invalid-input` rename in both copies; the sibling adds the hosted-lane and guard
wiring. The edits are append-only and merge-order-coordinated — not two branches racing the same paragraphs. Author
the local / frontline segment as typed dispatch — follow each verb's returned `state` / `nextAction`, no prose
config-checks — composable with the sibling's inline segment (its § E3 discipline). The driver selects the local
lane as one ordered standard source and reaches end-of-chain when none is configured (§ Cross-cutting — Review-source
model), so this prose stays free of source-selection logic.

## Alternatives & Rationale

**An evidence-grade local tier, shed after its downstream consumer was declined.** An earlier shape gave the local
receipt / guidance pair evidence-grade storage — a durable satisfying pair, generation compare-and-swap, and
freshness-bounded admissibility — so a downstream qualification / promotion gate could consume it as proof that a
review had run. `review-gate-right-sizing` settled that target state and **declined the evidence-grade rung**: its
merge guard is a thin `arc-cleared` commit-status anchored on the human disposition moment, and no rung consumes a
satisfying local pair. With the consumer gone, that tier buys ceremony without a beneficiary, so it is shed rather
than kept: one advisory receipt replaces the satisfying pair, a deterministic derivation replaces generation
compare-and-swap, and a plain cleanup TTL replaces freshness-as-evidence. The lane keeps a durable-but-advisory
trace — enough to resume an interrupted review and record what was reviewed — and nothing whose only purpose was to
be trusted downstream. Contract discipline is unchanged; only the persistence tier scales down, exactly as the
design's second rule prescribes once the authority the evidence carries drops to advisory. The rejected tier is not
lost — its durability concerns route to the provisional `review-durability-hardening` stub.

**A durable fix ledger, rejected in favor of re-review at the new head.** An earlier shape carried settled
dispositions across a fix through a durable fix-carry ledger with fix-phase verbs and mid-fix crash recovery. That
tier buys protection against a narrow failure — a crash between approving a disposition and landing its fix — at the
cost of a second durable authority, additional public states, and an interrupt surface on every fix. The chosen
design makes a new head a new target and lets the fixed change earn its own review, trading one extra evaluator pass
per fixed head for the removal of that entire machinery. The rejected tier is not lost: it is deferred to a
provisional `review-durability-hardening` stub, groomed only if practice shows the trade going the other way.

**Tamper-resistance against the local operator, rejected permanently rather than deferred.** Sealed executable
snapshots, copy-on-resolve artifacts, write-prevention across the launch window, durable run-binding lineage, and
un-resettable pass counts were all considered. Anyone who can run `arc review local prepare` already has local
OS and repository write authority, so every such control is defeatable by the same actor it would constrain — it
buys ceremony, not a guarantee. The authority boundary where stronger guarantees matter is hosted import, which
revalidates the receipt explicitly. Recording this as a permanent non-goal rather than a deferred tier prevents it
from being re-litigated at each downstream grooming.

**A resident orchestrator, rejected for explicit host-neutral transitions.** Hosting a worker that drives the review
loop would let ARC own sequencing end to end. It would also require ARC to launch evaluators itself, interpret
reviewer prose as control flow, and carry process supervision across harnesses. Exposing deterministic transitions
instead keeps the judgmental loop and the authorization decision with the calling agent, which is what makes the
protocol host-neutral.

**A `review-routing` method, rejected.** Routing facts could be declared like method activation. But risk, ownership,
and surface authority are project-policy facts that generic ARC cannot infer from paths, and pretending otherwise
pushes policy derivation into workflow prose. Method activation and rubric augmentation are framework-known
declarations and stay composed separately; routing facts arrive as explicit typed values.

**Generalizing `review-suspension` for the local lane, rejected for a third variant.** Making `wakeupToken` and
`changeRequestId` nullable would avoid a new variant, but one record would then mean two different things and the
hosted fields would be permanent dead weight locally. A `local-review` variant keeps each record honest about its
own domain, and leaves the hosted variant available as registered contract without a consumer.

**Renaming `invalid-request` to `invalid-input`, chosen over widening the union or versioning the envelope.**
Widening keeps a legacy alias in the public vocabulary forever and weakens the strict-union claim; versioning adds a
schema axis and dual-parse burden to a surface with no independent consumer. `frontline resolve` is effect-free and
is the only shipped verb; its two consumers are the workflows D16 rewrites in this same work unit, so the rename
strands nothing and a clean break is the cheapest correct option.

**Retiring the re-entry cluster, chosen over keeping it as contract.** Keeping it costs ~274 LOC of tested but
unreachable code carried indefinitely against a model the shipped architecture already replaced. Deletion is
recoverable from history if a stateful hosted await is ever wanted.

## Cross-cutting Considerations

**Review-source model (settled with `review-gate-right-sizing`).** The two WUs settled a unified role / source model
for the review program. **Roles:** `frontline` (optional early review, method-activated); `standard-review` (the
ordinary obligation-satisfying review — the role this WU's local lane and the sibling's hosted providers both
serve); `supplemental` (explicit, user / project-directed specialist review — additive, advisory, no registry /
config here); `convergence` (the state after all applicable reviews and dispositions settle, not a role). Non-author
/ fresh-context separation stays a contract invariant, not a role name.

**Source selection is the sibling's driver.** The `standardReview` obligation is change-shaped and shared (D3); the
sibling's `arc review resolve` driver selects exactly one configured **standard source** per pass from an ordered
`standard_sources` list, falling over on a confirmed-safe unavailable outcome. No configured standard source →
no-op; a configured source that cannot satisfy → `unavailable`. RSB supplies the local lane as one such source under
the configured identity **`delegated-agent`** (a fresh subagent launched by the primary, with the authorized
fresh-session degrade path); `local` stays this lane's command / channel namespace but is not the configured source
ID (CLI providers are local too). The local source's output is advisory and human-disposition-anchored (the
evidence-grade tier was declined), consistent with the model's `convergence` definition.

**Terminology rename (`independent-analysis` → `standard-review`).** "Independent" names the non-author invariant,
which both frontline and standard reviews share; "standard review" names the ordinary-stream role. So the contract
renames: method / rubric identity `standard-review/v1`, obligation field / type `standardReview`, and the
`policy/standard-review*.ts` modules. It is a **clean pre-GA forward rename with no legacy alias or migration** — no
published consumer (the CLI at `0.1.0` predates these contracts), no durable receipt (the local lane is dormant),
and the only other named references are the retiring gate drafts and `review-chunking`'s predecessor notes. Because
the obligation field and its schemas live in the live-closure `routing-schema` / core modules the sibling's § D4
seam calls untouchable, the rename is a **coordinated live-closure edit**. Settled sequencing: **RSB owns it as its
first implementation increment** and integrates it before `review-gate-right-sizing` consumes the renamed surface —
an integration-order constraint, not a `Depends On` edge (the sibling parallelizes its non-overlapping hosted-adapter
and merge-guard work, reconciling onto the RSB-landed mainline before its driver / config / workflow consumers). It
is a pre-GA `frontline resolve` schema break with no compatibility obligation. After task generation, RSB returns
the shared-surface task identifier (the live-closure rename increment plus the D16 workflow edits) to the sibling so
it cites the exact boundary rather than a provisional phase number.

**Frontline-source ordering (RSB reciprocal).** RSB's frontline reason classes already distinguish the
fall-through-eligible outcomes (`rate-limited | transient-unavailable`) from terminal / ambiguous ones, so
driver-owned ordered fallback needs no new outcome machinery. The reciprocal on RSB is source _selection_: the
current singular `review.frontline_source` resolver becomes driver-orderable (ordered `review.frontline_sources` +
`arc.frontlineSources`), a small change that also lands in the live-closure frontline surface and rides the same
coordinated edit.

**Trust boundaries.** Both lanes are advisory — neither produces downstream-consumable proof — but the local lane
still derives every authority-carrying identity at the trusted boundary rather than accepting caller text:
repository identity, target coordinates, author, attesting runtime, and the composing runtime that proposes
dispositions. This integrity is not for downstream proof; it is what keeps the human-disposition moment honest and
binds the reviewed bytes exactly. Its one explicit caller selection is `evaluatorIdentity`, admitted because only
the authorized launcher knows which fresh evaluator it will invoke, and constrained to differ from the author. The
distinct-actor check on `respond` is what structurally encodes agent-proposes / human-approves; it is not advisory
even though the receipt it guards is.

The **advisory frontline lane** binds differently and deliberately: `frontline run` accepts an adapter-composed
`target` (D3), because the change request it reviews is owned by the project or host adapter, and because a
frontline outcome can never become satisfying evidence. That input selects _which_ target to review; it is not
accepted as proof of _what was reviewed_ — the exact-head checkout re-derives the coordinates and refuses on
mismatch (D11). The asymmetry tracks evidence authority, which is the same rule that scales persistence and
ceremony everywhere else in this design.

**Security.** The local lane produces process attestation, not proof against a motivated local operator (see
Non-Goals). Its guarantees are: an evaluator sees only a detached exact-head checkout, the reviewed bytes are bound
by `sourceDigest`, and a result for different bytes is rejected regardless of matching identifiers. Hosted import is
the boundary that revalidates.

**Performance.** Each prepared review creates one detached checkout and one Git ref; both are released once the
receipt is recorded, and reaped by the sweep once the operation's cleanup TTL expires — including the abandoned case
where the caller never returns and the `operationId` is no longer derivable. The sweep runs inline inside `local prepare`
and `local resume` rather than as a background process, so its cost is bounded by the number of pins present and
paid by an operation already doing Git work. Provider execution is bounded by an explicit timeout with an abort
signal.

**Concurrency.** Sibling worktrees share the Git-common identity record and the durable-record namespaces. Every
mutation is append-only or version-checked, and every mutating handler reloads and retries internally, so expected
compare-and-swap residue never reaches the operator. Publish-first ordering (D5) is what keeps the sweep and a
concurrent prepare from interfering: a sibling's live prepare has a published, unexpired record before its pin
exists, and the sweep reaps only records that are absent or already expired — so it can never reap a live
sibling's pin, and there is no pre-publication pin for it to find.

**Testing.** Contract tests exercise every legal command-specific `state` / `nextAction` pair and reject impossible
fields. Failure-injection tests cover the recovery surface enumerated in Success Criteria. Integration tests enter
through the CLI or a production launcher rather than composing library calls, which is the check that keeps this
work from reproducing the gap it exists to close.

**Migration and rollout.** Two deliberate compatibility breaks, both pre-GA and consumer-free: `error.code` on
`frontline resolve` (D2), absorbed by the workflow rewrite in D16 so no shipped surface reads the old code; and the
`independent-analysis` → `standard-review` rename (§ Review-source model), a clean forward rename with no alias or
migration, carried as a coordinated live-closure edit with `review-gate-right-sizing`. Six dormant modules plus
`core/review-reentry-schema.ts` and their tests retire, and three more are handed to `review-gate-right-sizing`'s
cut (D14); merge order between the two branches is append-only and coordinated. Registered-record changes are
additive: the new `local-review` operation-state variant, the `frontline-run` outcome-enum extension, the
normalized outcome union's two new terminals, and the new advisory record types (`ApprovedDispositionRecordV1`,
`FrontlineOutcomeRecordV1`, `ReviewReductionProjectionV1`, and the `LocalReviewSourceV1` descriptor). The
evidence-grade `ReviewGuidanceEvidenceV2` store is **not** added — it is shed with its
tier — and `ReviewReceiptV2` is used as shipped. Retired registrations are the `review-reentry-result` schema and
any schema the two retired `core/` contract modules registered. No new configuration axis, no new dependency, no
storage setting.

**User-facing impact.** Seven documented `arc review` verbs become available, and a project can complete a local
standard review with no hosted provider. That review is advisory: a durable record and a human-disposition
checkpoint, not a merge gate. The local lane is one opt-in standard source — an install that configures no standard
source runs nothing (§ Cross-cutting — Review-source model). The two workflows that already reach for the review
lane invoke those verbs instead of prescribing library composition
(D16), and `TECHNICAL-OVERVIEW` is corrected to describe the shipped surface (D15). Nothing here is represented as
host-side enforcement; the required-check boundary stays explicit.

## Success Criteria

1. A project on the `local` channel can prepare an immutable source, hand the payload to an authorized evaluator,
   attest, respond to a complete approved finding set, re-enter, and reduce a standard review through documented
   `arc review` commands, with no hosted provider. Clean, findings, and fully dispositioned results all reach their
   exact advisory reduction states; a defer/reject-only set reaches durable local closure without any fix machinery.
2. The public path consumes effective method activation and a declared typed rubric augmentation. Malformed or
   unavailable declarations produce visible, fail-closed diagnostics, and the delivered guidance is re-verified at
   attestation, so a result reviewed under guidance other than what was delivered is refused.
3. The registered CodeRabbit source runs against the exact head through an immutable checkout, records the digest
   and qualified version of the executable that actually ran, persists the complete outcome durably, and enters the
   universal response path after a crash/restart. A hung provider is terminated at the execution timeout and returns
   `timed-out`.
4. No expected concurrency residue surfaces as an operator interrupt: compare-and-swap conflicts self-heal
   internally, and the only `operator-repair` edges are the five D2 enumerates — unresolvable source bindings,
   unsupported source capability, rejected authorization, invalid provider output, and a project policy binding
   that fails to parse or names an unregistered source.
5. Failure-injection tests cover dirty/unborn preparation refusal, target/request derivation from Git, pin
   loss/restore and pruned-object corruption, failure between operation publication and pin creation, staleness at
   attestation, disposition-record idempotent and conflicting replay, frontline-outcome publication before operation
   advance, re-admission after a repaired non-review terminal, provider timeout, stale-run-never-evidence, target
   movement during attestation, and every reduction result.
6. A local evaluator sees only the detached exact-head checkout. Moving the original worktree away and back while
   the evaluator runs cannot change the source digest or satisfy attestation for different bytes; the operation pin
   keeps the range reachable through branch deletion and Git maintenance, and resume recreates the identical review
   root.
7. Contract tests exercise every legal command-specific state/action pair, reject impossible fields, and prove that
   per-state payloads, strict error variants, and domain outcomes retain their distinct field and exit semantics.
8. Integration tests enter through the CLI or production launcher rather than manually composing library calls, so
   every delivered port has a non-test production caller and a user-reachable path.
9. The prune-at-consumption pass leaves no dormant review module unclassified: each of the 23 is consumed, retired
   with its tests, or handed to `review-gate-right-sizing`'s cut, and the two boundary `policy/` modules are
   dispositioned under the consumer test. A re-run of the reachability walk shows no module in the consume set
   without a production caller. Every port this work delivers or touches has a non-test production consumer;
   pre-existing forward-contract interfaces this work neither delivers nor touches are out of scope.
10. `TECHNICAL-OVERVIEW` § 2 describes the shipped `arc review` surface, and no added behavior is represented as
    host-side enforcement; the required-check boundary remains explicit.
11. `integrate-work-unit` and `run-errand` reach the review lane exclusively through `arc review` verbs in both
    package source and the projected instance. Neither names `ReviewOperationStateStore` or any other library
    symbol, and neither reads `invalid-request`; a grep for those symbols across shipped workflow prose returns
    nothing. Where either workflow reaches the local lane it supplies no `changeSetState`.
12. No abandoned local review leaks its pin or checkout. The failure-injection suite proves both sweep classes:
    a true orphan pin (no operation record) is reaped, and an expired operation whose `operationId` is no longer
    derivable — because HEAD moved after abandonment — is reaped with its materialization on the next
    `local prepare` or `local resume`. A live unexpired operation's pin is never reaped by a concurrent sweep.

## Open Questions

Implementation-detail latitude, not deferred design:

- Internal handler/module boundaries may follow existing CLI conventions as long as the public command and envelope
  contracts remain stable.
- Record filenames and internal module boundaries may evolve behind the receipt, local-source, frontline-outcome,
  disposition-record, reduction, and operation-state ports. Their authority split, publication ordering, strict
  schemas, and idempotency/conflict behavior are fixed.
- The provider adapter may select the concrete process-execution primitive; it must preserve the exact-head
  checkout, interrogation of the executable that actually runs, and typed timeout behavior.

No design question remains open. The cross-WU items below are settled coordination — reciprocal edits and a
merge-order plan carried out with `review-gate-right-sizing`, whose model is detailed in § Cross-cutting —
Review-source model. At planning close, mint the provisional `review-durability-hardening` stub.

- **Settled with `review-gate-right-sizing` — the review-source model.** The `standardReview` obligation stays
  change-shaped (D3); the local lane is one `delegated-agent` **standard source** the sibling's `arc review resolve`
  driver selects from an ordered `standard_sources`, and the driver owns source selection, the no-configured-source
  no-op, and `unavailable`. The reciprocal edits land on the sibling (config axis, uniform driver dispatch, the
  no-configured-source semantics); RSB's reciprocals are the terminology rename and the frontline-source ordering.
- **Joint-confirm at build:** the two boundary `policy/` modules' per-module consumer-test disposition (D14).
- **Merge-order-coordinated shared surfaces:** `integrate-work-unit.md` / `run-errand.md` (D16),
  TECHNICAL-OVERVIEW § 2 (D15), and the shared live-closure rename edits (§ Cross-cutting — Review-source model) —
  reconciled by merge-order between the two branches.
- **Deferred to `review-chunking`:** the automated per-chunk review-scoping seam (a `chunkScope` parameter, a
  bounded review-source variant, and its scope-aware attest/reduce binding) is not built here — it extends this
  lane's surface and is `review-chunking`'s to design when it specs Mode B (routed to `USER-INBOX`). Agent-driven
  chunk review works today with no automation.
