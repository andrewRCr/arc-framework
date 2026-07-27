# Spec (`detailed` · `RFC`): Review Signal Convergence

- **Origin:** [internal]

- **Purpose:** Make review coverage claims, severity vocabulary, convergence, and pass-cap control derive from
  validated ARC judgment and durable review evidence instead of provider labels, caller summaries, or implicit loop
  state.

---

## Introduction / Context

ARC's review surfaces currently preserve several correct ideas at different layers without joining them at the
decision point:

- `withstood` reports where a reviewer looked and found nothing, but neither its schema nor its prompt says whether
  that means attention, correctness, or clearance.
- Review severity is the ordered magnitude vocabulary `blocker`, `major`, `minor`, even though `blocker` is an
  outcome word used elsewhere for several unrelated impediment concepts.
- Review triage asks the primary to verify and re-grade provider findings, but the durable disposition record stores
  only the provider severity and exact-source validation requires that value to remain unchanged.
- User-facing disposition reports are assembled ad hoc, so a primary can compress the original finding until a reader
  who has not seen the raw review loses its locus, evidence, or material consequence.
- The policy driver sees that findings occurred but cannot read which findings ARC confirmed or their verified
  severity, so any findings result forces another pass.
- A caller can still report `clean` without binding that strongest convergence signal to the durable operation that
  reviewed the current exact target.
- Hosted findings have no durable normalized result record that can bind their dispositions to the exact result.
- The adversarial-review method combines backlog completeness with pass convergence and leaves pass count visible
  only in the primary's implicit control flow.

The resulting protocol can report the right re-grade to the developer while persisting the wrong control-bearing
value, repeat a review after every finding regardless of triage, or continue an agent-managed review loop past its
cap when the primary loses count. This work unit makes the existing rules reachable from the decisions they govern.
It is one cohesive technical-design unit within the `review-protocol-alignment` cohort: verified severity becomes a
durable input to one convergence rule shared by the adversarial method and every review lane.

## Goals

1. Define `withstood` as an advisory report of reviewer attention, never a correctness or clearance claim.
2. Use one magnitude vocabulary, `critical > major > minor`, for review findings without changing unrelated
   impediment or `blocked` concepts.
3. Separate disposition completeness from pass convergence and make pass-cap exhaustion visible and
   human-authorized.
4. Preserve provider-reported severity while recording ARC's verified severity as a distinct judgment.
5. Give every disposition approval a faithful standalone human report without creating a second record architecture.
6. Derive convergence from exact, pass-bound, source-bound, approved disposition records on local, frontline, and
   hosted lanes.
7. Make every findings path follow one order: triage and source-bind, resolve policy, then perform the approved
   response.
8. Reuse the existing version-checked Git-common record substrate without creating a hosted-only persistence
   architecture.

## Non-Goals

- Redesign provider selection, source fallback, chunk capability declarations, or provider registration.
- Configure or automatically activate planning and verification audit activities. Those fire-points must consume
  the pass-cap contract defined here, but their activation policy belongs to `review-activity-contracts`.
- Build automated chunk partition transport, construct per-chunk scope identities, or change the meaning of a
  logical pass. This work only makes operation identity capable of consuming a carrier-issued scope binding.
- Add a durable multidimensional budget ledger for evaluator calls, tokens, or work-unit-wide review spend.
- Make reviewer output authoritative, let a provider assign ARC's verified severity, or let a reviewer attest its
  own result.
- Introduce a compatibility reader, migration path, or version advance for unpublished development-only records.
- Replace the current Git-common review stores with a service or a new storage backend.

## Proposed Design

### 1. Give `withstood` one advisory meaning

Update `adversarial-review.md` and its prompt template so `withstood` means:

> The reviewer examined this decision-relevant claim or region and has no finding to report.

It does not mean that the artifact is correct, complete, or cleared. The field remains freeform because the reviewer
chooses where absence of a finding is informative; enumerating every touched region would create noise rather than
coverage signal.

The primary applies a claim-type risk gradient before relaying a `withstood` statement:

- Externally verifiable claims about source, behavior, or the diff are worth spot-checking.
- Internal judgments about what the reviewer considered convincing or coherent are not independently verifiable.

`withstood` remains outside severity, disposition, convergence, and evidence-attestation machinery.

### 2. Rename review severity `blocker` to `critical`

Change `ReviewSeveritySchema` to the strict ordered enum:

```text
critical > major > minor
```

The change follows the complete acceptance graph:

- every registered schema root that reaches `ReviewSeveritySchema`;
- the hosted-await finding schemas, which currently repeat their own severity enum;
- adapters, fixtures, generated schema artifacts, and command envelopes;
- the adversarial-review method, review rubrics, and adopter-facing review prose.

The sweep is occurrence-sensitive. It must not rename:

- work-unit impediment fields or prose in `session-init.md`, `session-init.contributor.md`,
  `session-handoff.md`, `generate-tasks.md`, and `drain-inbox.md`;
- impediment vocabulary in `AGENT-BRIEF.ARC.md` and `strategy-session-operations.md`;
- settle-before-starting wording in `template-spec-detailed-rfc.md` and `template-spec-outline.md`;
- adopter-facing impediment wording in `docs/getting-started.md`, `docs/the-framework.md`,
  `docs/work-planning.md`, and `docs/reference/work-organization.md`;
- `GateBlocker`, `GateVerdict.blockers`, or the `blocked` review resolution state; or
- generic blocker occurrences in `task-audit.md` and `review-response.md`, which also contain severity occurrences
  and therefore require per-occurrence edits.

The active schema versions, semantics versions, and digest domains remain unchanged. ARC is pre-public-release, and
old development review records are disposable; they are cleared or regenerated instead of supported through an
alias or migration reader.

### 3. Separate the exit gate, convergence, and cap authority

The adversarial-review method states two independent rules:

- **Exit gate — completeness:** every reported finding has an approved disposition record when the normal loop
  closes, including a `reject` record for a finding ARC did not support. This is a property of the disposition
  backlog.
- **Convergence — signal:** a pass converges when it surfaces no triage-confirmed finding above `minor`. This is a
  property of the pass result, independent of what the primary subsequently did with the findings.

A disposed material finding satisfies completeness while withholding convergence; when the same loop continues, the
next fresh pass examines the settled response. An undisposed minor may satisfy convergence while keeping the
completeness gate open.

Cap exhaustion is an admitted bounded exit, not a third disposition:

- Every completed adversarial result reports `Pass N of M` beside its outcome.
- At `N == M`, the method reports `cap-exhausted` and stops before another pass's evaluator invocation.
- The primary reports unresolved material findings and may recommend another pass with a cost-and-signal rationale.
- A recommendation is not authorization.
- Explicit approval naming the activity and next pass authorizes exactly one additional pass.
- After an over-cap pass, any further continuation requires fresh approval.

The pass cap remains absent from evaluator context so it cannot bias the review. It stays explicit in primary control
flow and the operator-facing report. Driver-managed lanes keep the existing typed
`approval-required / obtain-ceiling-override` path and exact one-pass override validation. The agent-managed method
applies the same authority invariant.

Convergence is deterministic at the materiality threshold. The primary may recommend another within-cap pass for an
unusually signal-rich `minor`, but that judgment does not redefine severity or authorize an over-cap pass.

### 4. Split reported observation from ARC judgment

Replace the ambiguous severity fields in `DispositionReportItemSchema` with two provenance lanes:

| Lane                 | Fields                                              | Authority                                    |
| -------------------- | --------------------------------------------------- | -------------------------------------------- |
| Reported observation | `reportedSeverity`, optional `reportedNit`          | Copied from the normalized provider result   |
| ARC judgment         | nullable `verifiedSeverity`, optional `verifiedNit` | Supplied by primary triage and user-approved |

Retain `sourceVerification`, `verificationRefs`, `disposition`, `gating`, rationale, recommendation, and open
questions. Enforce these relationships:

- `sourceVerification: verified` requires non-null `verifiedSeverity`.
- `sourceVerification: not-supported` requires `verifiedSeverity: null`, no `verifiedNit`, and
  `disposition: reject`.
- `reportedNit` is legal only when `reportedSeverity` is `minor`.
- `verifiedNit` is legal only when `verifiedSeverity` is `minor`.
- Exact-source validation compares only reported fields with the durable normalized result.
- `gating` is computed from verified severity, verified nit, and the existing minor-gating policy. Reported fields
  never control ARC gating.

The proposal-side `AuthorDispositionSchema` accepts the primary's verified severity judgment and never asks the
caller to copy reported severity, reported nit, source identity, locus, or gating. Generalize
`RespondProposalRequestSchema.source` from its current attested-local literal to the same local, frontline, and
hosted source union used for approved preparation. The first `arc review respond -` call resolves the durable
source, copies its source-owned fields, derives gating, and returns the complete canonical proposed disposition set.
The approved second call re-resolves that source before appending the source-bound record and returning the response
plan. No lane constructs a disposition-set identity by importing internal code.

The new fields replace the old `severity` and `nit` fields in place. They participate in the existing canonical
disposition-set identity and approval binding; no parallel re-grade record is introduced.

Update both Framework copies of `review-triage.md` and `review-response.md`, plus every integration-workflow
presentation site, to consume the split fields. Triage records provider observation and ARC verification separately,
including the null ARC-severity case for a rejected unsupported finding. Response planning derives gating only from
verified severity and verified nit. No methodology path instructs a caller to reconstruct the old single-severity
shape.

The default `review-triage` presentation assigns each item a one-based report-local label (`F1`, `F2`, …) from the
canonical ordered finding set and projects it through one channel-neutral, human-readable shape:

```text
Finding F{ordinal}: <standalone account of the original claim, stable locus, source evidence, and consequence>
Assessment: <CONFIRMED | NOT SUPPORTED> · <verified severity | no ARC severity> (ARC) · <reported severity> (reviewer)
Recommendation: <FIX | DEFER | REJECT> [<blocking | record-only>] — <complete proposed action and its boundaries>
Open questions: <questions, when present>
```

Separate adjacent findings with a Markdown horizontal rule (`---`); omit it before the first and after the last.
The `F{ordinal}` label is stable within that proposal and its approval conversation, but never replaces the durable
finding identity or participates in canonical hashing.

The finding may be faithfully paraphrased, but not compressed into shorthand that assumes access to the raw reviewer
report or the primary's private context. A reader with only the disposition report can understand what was alleged,
where, what evidence bears on it, and why it matters. ARC assessment appears before reviewer severity because it is
the control-bearing judgment; reviewer severity remains visible for provenance.

This is the method's default presentation contract, not a second durable schema. A configured `review-triage`
override may replace or extend the projection under the existing method override model. The canonical proposal,
source binding, approval identity, and command validation remain unchanged by presentation overrides.

### 5. Generalize the durable result record across channels

Generalize `FrontlineOutcomeRecordSchema` and `FrontlineOutcomeStore` into:

- `ReviewResultRecordSchema`, discriminated by `channel: frontline | hosted`; and
- `ReviewResultRecordStore`, retaining record-per-operation, version-checked, idempotent storage in the existing
  Git-common `outcomes` namespace.

Every result variant carries the exact target plus the runtime-owned `policyVersion`, `rubricVersion`, and
`rubricDigest` under which the review ran. The policy driver emits this binding in its ready result. Producing
commands copy it from that exact resolution instead of accepting a second caller-authored restatement; local review
continues to derive the same fields from its persisted requirement.

Add a runtime-owned `ReviewExecutionBindingSchema` beside that policy and rubric binding. It carries the positive
logical pass plus an opaque scope-binding digest. Whole-target execution derives its scope binding directly from the
exact target. A chunked execution may use only a carrier-issued scope binding; the external request cannot invent or
restate one.

Local, frontline, and hosted operation identities include the execution binding:

- another pass over the same exact target produces a new operation;
- an exact retry of the same pass and scope reuses the operation idempotently;
- retry generation remains distinct from logical pass, so retry policy cannot alias pass accounting; and
- fallback sources retain the same logical pass and scope binding while producing source-specific operation IDs.

Persist the binding in operation state and in each frontline or hosted normalized result. Local approved records
resolve it through their operation state alongside the existing requirement and receipt. The hosted request handle
retains it across request and await, so no terminal producer reconstructs pass or scope from caller prose.

`chunk-scope-binding` continues to own automated scope construction and transport, per-chunk scope identities,
scope-aware receipts, reduction, and union coverage. This work adds only the operation-identity consumption seam. If
a chunked path cannot present a carrier-issued scope binding, it resolves a typed unavailable result and cannot
contribute to convergence.

The frontline variant retains its source identity, executable identity, normalized outcome, and complete outcome
digest behavior.

The hosted variant:

1. derives a stable `operationId` from the exact hosted request handle;
2. stores the complete normalized terminal `clean` or `findings` result under that operation;
3. computes a separate canonical `hostedResultId` over the request handle and result content; and
4. returns a store-issued result reference.

Operation identity is stable across reads and never aliases the content digest. An exact replay is idempotent; a
different result for the same operation is a conflicting replay.

`arc review frontline run -` already consumes the exact ready resolution and persists its binding with the result.
Extend the hosted request/await path to retain the same driver-issued binding in its request handle and terminal
result. A fallback provider receives the unchanged binding for the same logical pass.

`ApprovedDispositionSourceSchema` gains a hosted variant carrying the result reference and `hostedResultId`.
Hosted triage resolves the record and compares the approved set one-for-one with its complete finding result before
appending the existing `ApprovedDispositionRecordSchema` under the same operation ID.

The public source-reference vocabulary gains the matching hosted reference variant. Every hosted-await terminal
envelope returns that opaque reference after persisting the normalized result. A findings caller passes it directly
to `arc review respond -`; a clean caller binds it directly to the policy attempt. Neither composes internal
identities.

Local review receipts remain their own evidentiary ledger. Operation state, immutable local source descriptors,
normalized results, and approved dispositions retain their different lifecycle and authority semantics. The design
shares the persistence substrate and result abstraction without collapsing domain-distinct records into one generic
repository.

### 6. Bind terminal review attempts to durable source records

Extend `ReviewAttemptSchema` with conditionally required, ordered-unique `reviewOperationIds`:

- A `clean` or `findings` attempt supplies a non-empty list.
- Safe-unavailable, failure, and other non-terminal outcomes omit the field.
- A non-terminal chunk call names only the current scope-bound operation because it can resolve only
  `chunk-pending`.
- The terminal call for a completed chunk series names every scope-bound operation in series order because
  convergence applies to the logical pass as a whole.

At the command boundary, resolve the current v2 target from repository state and load every named
producing receipt or result. Reject unless:

1. every operation ID resolves to exactly one producer with terminal outcome `clean` or `findings`;
2. every producer belongs to the attempt's source and current exact target;
3. every producer matches the current driver-issued execution, policy, and rubric binding;
4. producers combined for one logical pass agree on those bindings and logical pass; and
5. every combined chunk producer carries a distinct carrier-issued scope binding, with terminal-series and union
   coverage proven by the chunk carrier.

For a whole-target attempt, the single producer outcome matches the attempt. For a chunked aggregate, `clean`
requires every producer to be clean; `findings` requires at least one findings producer and permits the remaining
producers to be clean.

For every findings-producing operation, additionally load exactly one `ApprovedDispositionRecordSchema` and reject
unless the record points back to that producer and operation and the producing boundary's exact comparison covered
every finding. A clean-producing operation has no disposition record; its complete producer is the source-bound
convergence evidence. The confirmed count and maximum combine only the approved records from findings producers
while coverage validation still spans the whole ordered operation series.

The external request supplies operation IDs, not record bodies, clean assertions without producers, or a
caller-computed severity summary. Duplicate execution bindings fail even when the operation IDs differ. Until the
automated chunk carrier can issue and prove scope bindings, the multi-record validation is fail-safe infrastructure
rather than a claim that automated local chunk convergence ships in this work unit.

After validation, derive internally:

```text
confirmedFindingCount
maxConfirmedSeverity: ReviewSeverity | null
```

The confirmed subset contains every item with `sourceVerification: verified` and a non-null `verifiedSeverity`.
Compute the maximum from `verifiedSeverity` only. Disposition never changes the review signal: a supported finding
resolved as `fix`, `defer`, or `reject` retains its verified severity, while an unsupported allegation has null
verified severity and therefore contributes none.

The policy reducer handles a last `findings` attempt as follows:

- `maxConfirmedSeverity: null` — all reported findings were refuted; resolve `pass-complete / none`.
- `maxConfirmedSeverity: minor` — only confirmed minors remain; resolve `pass-complete / none`.
- `maxConfirmedSeverity: major | critical` — withhold convergence and resolve `findings / respond` with
  `postResponseAction: resolve-next-pass`.

The non-empty operation binding distinguishes positively refuted findings from an unbound assertion that findings
occurred. A clean operation binding likewise distinguishes a durable clean result from an unbound caller assertion.
The reducer never receives reported severity as its control value.

For an unchanged target, `resolve-next-pass` re-invokes policy resolution with the driver's returned
`completedPasses`, the same exact target and lane, revalidated scope selection, and an empty attempt history for the
new pass. The driver then returns `ready` for the next pass or `approval-required` at the ceiling before any evaluator
invocation. Retry and safe-fallback attempts remain scoped to one pass and never leak into the next pass's source
selection.

### 7. Use one lane order and preserve every approved disposition

Every local, frontline, and hosted clean path follows:

```text
producing clean result
  → exact operation binding
  → policy-driver resolution
```

Clean has no finding proposal or empty disposition record.

All local, frontline, and hosted findings paths follow:

```text
producing result
  → primary triage and approval
  → exact source binding and approved-record append
  → policy-driver resolution
  → approved response performance
```

Generalize `respond-command.ts` into the channel-neutral preparation boundary for all three source variants. Source
validation, canonical proposal construction, approval validation, approved-record append, and response-plan
projection happen there before policy resolution. The preparation step may derive and persist a
`fixAuthorization`, but it does not apply a fix or close a finding.

For hosted sources, persist the normalized result during terminal await handling, feed its returned source reference
through the same proposal and approved preparation calls, and perform thread settlement only after the driver call.

Moving triage before the driver changes two workflow contracts:

- A non-empty result from `arc review frontline run -`, `arc review local attest -`, `arc review reduce -`, or
  `arc review hosted await -` triggers triage directly.
- The prepared response plan, not a second reconstruction of the approved set, drives post-driver performance.
  `nextAction: respond` narrows to executing that plan; triage, approval, and source binding have already completed.
- Every complete disposition set, including a no-action record-only set, is approved before the driver call. Remove
  the integration workflow's deferral of such approval to the final combined gate. The final integration interlock
  remains separate merge authority and does not re-approve the disposition set.

The earlier record-only approval is an intentional judgment turn: letting an unapproved proposal control convergence
would make the durable approved-record requirement fictional. The standardized disposition projection makes the
complete judgment visible at that turn.

No driver arm may complete or suspend a lane while an approved disposition set remains unperformed:

| Driver result                                     | Required behavior before target-movement resolution       |
| ------------------------------------------------- | --------------------------------------------------------- |
| `findings / respond`                              | Perform the approved response.                            |
| `pass-complete / none` with an outstanding set    | Perform the approved response.                            |
| `pass-complete / none` without an outstanding set | No response performance is required.                      |
| `chunk-pending / continue-chunks`                 | Perform the current scope's approved response.            |
| `approval-required / obtain-ceiling-override`     | Perform the approved response before requesting approval. |

Response performance returns one of two target-movement states:

- `unchanged-target` — apply the driver result: complete a converged pass, continue the existing chunk series,
  execute `resolve-next-pass` after a material response, suspend, or request the named one-pass override.
- `changed-target` — any performed fix created a new exact target. Discard the old-target driver action, abort the
  old chunk series, and return through the existing reroute boundary. The new target receives a fresh applicability
  judgment, scope selection, and review-policy resolution; no prior clearance or chunk coverage carries forward.

The no-outstanding-set completion arm confirms the exact target is still current before completing. Convergence,
suspension, and cap exhaustion therefore end only an unchanged-target loop and never discard approved work.

## Alternatives & Rationale

### Keep the re-grade only in the user-facing report

Rejected. The operator sees the correct judgment, but the driver and durable record still see provider severity.
That preserves the current split-brain behavior and makes convergence depend on a value ARC explicitly re-graded.

### Let verified severity overwrite provider severity

Rejected. It destroys provenance and makes exact-source validation either reject legitimate re-grades or stop
checking the source. Separate reported and verified lanes preserve both facts.

### Accept a caller-computed confirmed-severity scalar

Rejected. The scalar duplicates control-bearing derived state without carrying exact-target, complete-result,
approval, or source bindings. A stale or provider-sourced value could falsely converge or buy an unnecessary pass.

### Add a hosted-only finding or disposition store

Rejected. Frontline already has the required version-checked record-per-operation result architecture. Generalizing
that result abstraction is smaller and keeps one storage contract while preserving channel-specific record variants.

### Call the driver once before triage and again afterward

Rejected. The caller would need to know not to advance pass state between calls, creating a second ordering rule the
driver cannot enforce. One post-triage call has one authoritative input state.

### Continue the old driver action after a fix

Rejected. A fix changes the exact target guarded by the driver result. Completing that target or continuing its chunk
series would carry stale clearance or coverage onto bytes the review never examined. Response performance instead
reports target movement and reroutes every changed target.

### Let an unapproved record-only proposal control convergence

Rejected. It preserves the old deferred approval turn, but lets a primary-authored proposal decide that no further
review is needed before the operator approves the re-grade or disposition. Approval moves to the disposition boundary
instead; the final integration interlock retains only its distinct merge-authority role.

### Trust a caller-reported clean outcome without its producer

Rejected. Clean is the strongest convergence-producing result and therefore cannot have a weaker evidence boundary
than findings. Local receipts and normalized frontline or hosted results already provide the producer record; the
attempt carries its operation reference instead of restating the conclusion.

### Treat cap exhaustion as a disposition or let a recommendation continue automatically

Rejected. Surfacing is not one of the closed finding dispositions, and a recommendation does not carry human
authority. The cap bounds automatic cost; exactly one explicit override preserves the option to continue without
turning approval into an open-ended loop.

### Build a work-unit-wide review budget ledger

Rejected as disproportionate. Existing pass ceilings already encode the needed authority boundary. The observed
failure is reachability and visibility, not absence of a multidimensional accounting system.

## Cross-cutting Considerations

### Trust and authority

Provider output remains an observation. Primary triage supplies ARC judgment, and the approved disposition set binds
that judgment to an exact target, policy, rubric, complete finding result, proposer, and distinct approver. No
external scalar or provider label controls convergence.

Clean convergence resolves from the same exact operation, target, pass, scope, policy, and rubric bindings without
inventing an empty disposition record.

Pass-cap overrides bind the exact target, lane or activity, exhausted count, and next pass. They authorize one
additional invocation, not a continuing exception.

### Procedure evolution

Deterministic summary derivation and driver dispatch remain in TypeScript. The workflow prose dispatches on typed
states and retains only irreducible source-verification and recommendation judgment. This change adds no
agent-interpreted control syntax.

The adversarial-review method has no resident engine, so its visible `Pass N of M` output remains a primary-runtime
contract for now. Any automatic planning or verification audit dispatcher must compute and expose the same state
rather than re-encoding comparisons in workflow prose.

### Storage evolution

Review records stay behind injectable ports and use version-checked, idempotent writes. The Git-common
implementation remains service-optional and does not rely on tracked work-unit artifacts or branch identity.
Generalizing the record type does not change the canonical store or introduce a storage configuration axis.

### Compatibility and migration

All affected contracts are unpublished strict-current baselines. Update repository-owned callers, fixtures,
generated schemas, and stored development records together. Clear or regenerate incompatible local review state.
Do not add aliases, dual-input readers, or data migrations.

### Performance

Each terminal attempt adds bounded reads for its named operation IDs. A clean whole-target pass reads one producer; a
findings whole-target pass also reads one disposition record. A terminal chunk-series call reads one producer per
scope plus disposition records for findings producers. Review execution dominates this local I/O. The configured
ceiling bounds logical pass recurrence, not raw evaluator-call count; bounded chunk-series and scout orchestration own
any intra-pass calls, and this work adds no work-unit-wide budget ledger.

### Testing

- Schema tests accept `critical`, reject severity-position `blocker`, and preserve every enumerated non-severity use.
- Disposition tests cover reported/verified divergence, refuted findings, nit constraints, derived gating, canonical
  ordering, approval identity, report-local labels and separators, and the default standalone human projection.
- Result-store tests cover frontline parity, hosted exact replay, conflicting replay, malformed state, and
  operation/result-ID separation.
- Operation tests prove same-target passes have different identities, same-pass retries are idempotent, retry
  generations do not advance logical pass, and fallback sources retain one execution binding.
- Command tests reject stale targets, missing or duplicate operation IDs or execution bindings, wrong sources,
  incomplete result bindings, mixed pass, policy, rubric, or scope identities, caller-supplied summary state, and
  chunked execution without a carrier-issued scope binding. Clean attempts additionally reject a missing producer,
  mismatched terminal outcome, or caller-only clean assertion.
- Reducer tests cover all-refuted, minors-only, material, multi-record, and properly scope-bound terminal
  chunk-series summaries. Material unchanged-target responses re-enter with the returned completed-pass count and an
  empty next-pass attempt history; ceiling exhaustion stops before invocation. A verified material `reject` retains
  its severity and withholds convergence. Chunk aggregation accepts all-clean and mixed clean/findings producer series,
  requires a disposition record only for each findings producer, and rejects an aggregate outcome inconsistent with
  its producer set.
- Workflow and integration tests cover the triage-before-driver order, every outstanding-disposition arm, unchanged
  target continuation, changed-target rerouting after a fix, early approval of record-only sets, and removal of the
  old final-gate approval deferral.
- Methodology tests keep both copies of `review-triage.md`, `review-response.md`, and
  `integrate-work-unit.md` aligned on the reported/verified split, verified-only gating, and default presentation
  projection while preserving configured method overrides.
- Pass-ceiling tests retain exact-target/lane/count/next-pass override validation and prove an override grants only
  the named next pass.
- A methodology contract check keeps both copies of the adversarial method aligned on `Pass N of M`,
  `cap-exhausted`, stop-before-invocation, recommendation-not-authorization, and one-additional-pass semantics.

### Rollout order

1. Rename the severity vocabulary across the complete acceptance graph.
2. Split reported and verified disposition fields; update proposal construction, the triage/response methods, and
   integration presentation sites.
3. Add pass- and scope-aware execution binding to operation identity and state.
4. Generalize the result record/store and persist hosted clean and findings outcomes.
5. Bind clean and findings attempts to their source operations, bind findings to approved disposition records, and
   derive the convergence summary.
6. Reorder all lane workflows, move every disposition approval before the driver, add unchanged-target
   `resolve-next-pass`, preserve outstanding responses, and reroute changed targets.
7. Update adversarial coverage, convergence, cap visibility, tests, generated schemas, and both methodology copies.

Steps may be partitioned into task-sized commits, but the work unit ships only when all strict-current contracts and
owned callers agree.

## Success Criteria

1. `withstood` is defined and prompted as decision-relevant attention without a finding, never correctness or
   clearance, and the primary-side claim-type verification gradient is explicit.
2. `critical > major > minor` is the only review-severity vocabulary across registered roots, hosted findings,
   adapters, fixtures, generated schemas, and review prose. Every enumerated impediment, gate-blocker,
   template-blocker, and `blocked` occurrence remains unchanged.
3. The adversarial method states completeness and convergence as separate rules. Every reported finding receives an
   approved disposition, while a disposed confirmed material finding still withholds convergence; all-refuted and
   confirmed-minors-only passes converge.
4. Every adversarial result exposes `Pass N of M`. At the cap, no evaluator is invoked without explicit approval
   for the named next pass, and each over-cap pass consumes that authority completely.
5. `arc review respond -` produces canonical proposals and source-bound approved records for local, frontline, and
   hosted result references. Durable items preserve provider-reported severity and ARC-verified severity separately;
   exact-source validation checks the reported lane, while gating and convergence use only the verified lane.
6. Every default user-facing disposition report faithfully stands alone, presents ARC assessment before reviewer
   severity, assigns stable report-local `F1`, `F2`, … labels, separates adjacent findings visually, and combines the
   proposed disposition and correction under `Recommendation`. A `review-triage` override may replace or extend that
   projection without changing the canonical record or approval binding.
7. Hosted clean and findings outcomes persist as complete normalized result records in the shared result store, with
   stable operation identity, separate content identity, idempotent replay, and exact approved-disposition binding for
   findings.
8. Every clean or findings attempt references the exact durable operations that produced it, and every findings
   operation additionally resolves its approved disposition record. Another pass on the same target has a distinct
   operation identity, while an exact same-pass retry is idempotent. Missing, duplicate, stale, incomplete,
   wrong-outcome, wrong-source, wrong-target, wrong-pass, wrong-policy, wrong-rubric, or wrong-scope bindings fail
   closed.
9. The driver derives confirmed count and maximum severity internally. It accepts no caller-computed summary, and a
   terminal chunk-series maximum spans every distinctly scope-bound approved record. Automated chunk convergence
   remains unavailable until its carrier can issue and prove those bindings. Every verified non-null severity
   contributes regardless of disposition.
10. Local, frontline, and hosted lanes approve every complete disposition set before the driver, then perform
    approved responses. An unchanged material response starts the next pass or stops at the ceiling; a fix invalidates
    the old action, aborts any old chunk series, and reroutes the new exact target. No completion, continuation,
    suspension, or cap-exhaustion arm discards an outstanding approved disposition or carries stale review state
    forward.
11. Old development records are cleared or regenerated, all repository-owned callers and generated schemas use the
    strict-current shape, and the full applicable quality-gate suite passes.

## Open Questions

None. Schema helper extraction, concrete type names below the public contracts, and task partitioning remain
implementation details.
