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
- Durable dispositions support agreeing grades, distinct reviewer/ARC regrades, and unsupported findings. Their
  varying shapes and shared nit field obscure provenance; unsupported findings still fall back to reported severity
  in gating.
- User-facing disposition reports are assembled ad hoc, so a primary can compress the original finding until a reader
  who has not seen the raw review loses its locus, evidence, or material consequence.
- The policy driver sees findings and settlement but cannot read verified material severity. `settled-findings`
  can complete a pass regardless of the signal that caused the response.
- A caller can still report `clean` without binding that strongest convergence signal to the durable operation that
  reviewed the current exact target.
- Hosted requests and results already persist in lane progress and feed source-bound disposition preparation.
  Their producer content is not separately sealed against settlement updates, and replay compares mutable progress.
- Hosted coverage distinguishes requested/effective complete or incremental review, while local progress loses that
  distinction. Member history survives head movement, but its accounting and discharge still depend on attempt labels.
- Convergence attestation stages lifecycle projections, but its continuation loses earlier replay judgments and can
  permit an intermediate commit that consumes the reviewed head before publication readiness.
- The adversarial-review method combines backlog completeness with pass convergence and leaves pass count visible
  only in the primary's implicit control flow.

The resulting protocol can gate on the wrong severity, overstate coverage, complete a material pass because its
findings were settled, or repeat expensive review when an incremental correction check would suffice. This work
unit makes existing rules reachable from the decisions they govern.
It is one cohesive technical-design unit within the `review-protocol-alignment` cohort: verified severity becomes a
durable input to one convergence rule shared by the adversarial method and every review lane.

This work unit lands as one branch under the storage program's 2026-09-24 decision; its former delivery members are
review chunks. Native-stack member progression, coverage and logical-pass accounting, native finding navigation, and
attestation-before-readiness ordering remain part of the product design. Explicit member-scoped Owner acceptance
remains distinct from convergence derived from durable results and approved dispositions.

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
9. Preserve member progression and exact coverage through target changes, with one shared convergence rule and a
   visible distinction between logical passes, complete coverage, and explicit Owner acceptance.
10. Carry convergence attestation into publication readiness without manufacturing another review pass.
11. Make public command outputs sufficient to resume the review sequence without internal imports, hand-built
    digests, or reconstruction of pass history from prose.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- Redesign provider selection, source fallback, chunk capability declarations, or provider registration.
- Configure or automatically activate planning and verification audit activities. Those fire-points must consume
  the pass-cap contract defined here, but their activation policy belongs to `review-activity-contracts`.
- Build automated chunk partition transport, per-chunk scope identities, multi-producer aggregation, or union proofs.
  Consume the existing terminal aggregate producer without changing the meaning of a logical pass.
- Add a durable multidimensional budget ledger for evaluator calls, tokens, or work-unit-wide review spend.
- Make reviewer output authoritative, let a provider assign ARC's verified severity, or let a reviewer attest its
  own result.
- Introduce a compatibility reader, migration path, or version advance for unpublished development-only records.
- Replace the current Git-common review stores with a service or a new storage backend.
- Introduce a new physical hosted-result store, a generic event ledger, or a hook prohibiting arbitrary Git commits.
- Implement automatic review-scope optimization or provider capabilities that the selected adapter cannot establish.
- Introduce a session-agenda compiler, resident review engine, new guidance-loading system, or generic eval harness.
- Require advisory planning/criteria reviews to produce code-review receipts or use code-review response machinery.
- Turn author self-review into a producer-backed review lane or add a public rendering command for its findings.

Amended 2026-09-11 — Permit carrier-relative incremental proof for existing review sources: ARC retains one exact
internal correction scope, exact-capable local carriers receive that scope directly, and a hosted provider may
establish incremental coverage through authenticated native baseline-and-generation evidence. This narrows the
provider-capability non-goal without adding a provider-selection, configuration, or storage axis. — Prompted by
terminal adversarial review and Owner clarification that rejecting CodeRabbit's ordinary incremental review would
defeat the work unit's cost and continuation goals.

Amended 2026-09-25 — Keep review-pass usage and the singleton frontline phase across an explicitly validated
superseding Candidate root. This corrects the observed landing route in which `attest --new-root` hid two settled
standard passes and reopened frontline. It does not carry old-target review clearance, add a work-unit-wide budget,
or change delivery-member activity decisions. — Prompted by the Owner's one-time frontline direction and approval
to repair the live cap reset before another evaluator runs.

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

Strict rejection of `blocker` applies to ARC-owned severity inputs and records, not provider-native wire vocabulary.
Preserve the CodeRabbit agent parser's accepted `blocker | major | minor` event contract and normalize its top grade
to ARC `critical`; retain native-event hashing for finding identity. Hosted native P0/Critical and other provider
classifications keep their existing materiality thresholds while their normalized ARC top grade becomes `critical`.
This boundary translation is not an alias or compatibility reader for old ARC records. Test top-grade mappings and
unchanged lower grades, plus old-grade rejection through nested ARC-owned hosted, disposition, and receipt inputs.

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

- Every completed adversarial result reports `Pass N of M` beside its outcome, and every ended loop names its stop
  reason — converged, `cap-exhausted`, suspended, or Owner-accepted — so a later reader never confuses them.
- At `N == M`, a non-converged result reports `cap-exhausted` and stops before another evaluator invocation. A
  converged result completes normally and reports that the allowance is exhausted; the cap does not negate evidence.
- The primary reports unresolved material findings and may recommend another pass with a cost-and-signal rationale.
  It presents that recommendation in the same turn as the disposition report, not as a later checkpoint: the signal
  that warrants another pass is already established by the verified severities under approval.
- A recommendation is not authorization.
- Explicit approval naming the activity and next pass authorizes exactly one additional pass. Approval granted with
  the disposition set is conditional on that set's approved response; § 7 binds it after performance.
- After an over-cap pass, any further continuation requires fresh approval.

The pass cap remains absent from evaluator context so it cannot bias the review. It stays explicit in primary control
flow and the operator-facing report. Driver-managed lanes keep the existing typed
`approval-required / obtain-ceiling-override` path and exact one-pass override validation. The agent-managed method
applies the same authority invariant.

**Activity boundary.** The adversarial mechanism serves the three planning stages and the verification criteria
companion; a code-review carrier may also reuse it underneath `standard-review` or `frontline-review`. Reuse does not
transfer ownership of the author response cycle. For advisory planning/criteria reviews, an approved disposition
record means the complete source-verified finding/account/action set approved at that stage and retained in its
existing planning or verification evidence. It is not an `ApprovedDispositionRecordSchema` instance and creates no
code-review operation, Candidate, policy binding, or receipt. Sections 4–8 govern the durable code-review lanes;
the shared materiality, completeness, approval, and cap principles also govern the advisory method.

Author `self-review` remains a separate aggregate-diff preflight, not an attested-local review or an adversarial
pass. Its existing triage/approval path is preserved under § 4's non-producer presentation boundary; it supplies
neither independent review evidence nor a completed pass to the durable lanes.

Convergence is deterministic at the materiality threshold. A confirmed `minor` never buys a pass: the primary must
not raise `verifiedSeverity` to withhold convergence from a pass the evidence converged. Where a confirmed minor
still carries unusual signal, the converged completion report names it as a follow-up observation. That observation
is report content, not a driver state — it neither reopens the completed loop nor requests approval, and a new
review remains available through the normal entry points.

**Logical passes and coverage.** A logical pass is one completed review over its admitted scope, potentially using
safe fallback or a carrier-proven chunk series. A complete review and an incremental correction review each consume
one logical pass when they produce a complete terminal result for that scope. Requested/effective coverage is a
separate fact: an incremental pass never increments the complete-coverage count unless its adapter actually upgraded
it to complete. Counting only complete effective reviews toward the ceiling would allow an unbounded incremental
loop; the cap therefore counts both complete and incremental terminal reviews.

`completedPasses` counts distinct completed logical passes within the lane's review lineage; `completePasses` is a
derived display count of those whose effective coverage is complete. Both derive from durable native admission facts,
not caller counters or the number of result records. Retries, pending observations, unavailable attempts, failed
results, disposition/settlement replays, and target movement consume no additional pass. A complete chunk aggregate
consumes one; individual chunks do not. For delivery, lineage is the existing stable member identity within the
plan, never the WU as one shared allowance. A Candidate's explicitly validated supersession chain retains consumed
passes across new roots; unrelated roots never share an allowance. Other non-delivery lanes retain their existing
target lineage. Historical attempts keep their original targets and authority; inherited spend does not establish
current-target clearance or applicability.

Runtime allocates `logicalPass = completedPasses + 1` at admission and preserves it through retries, fallback, and
chunks. A completed pass followed by a fix remains counted on the old target; the next fresh review receives the
next ordinal on the current target. Count advancement and terminal publication are replay-safe within the existing
operation store. Parallel attempts for one admitted pass cannot produce two authoritative terminal results; conflicting
or duplicate terminal evidence fails closed. An adapter upgrade consumes one pass, not two.

Operator output includes `Pass N of M`, requested/effective coverage, and complete-coverage count. Recommendations
name incremental versus complete coverage and the outstanding material signal; they never invoke an extra pass.
The existing one-pass override binds the current exact target, lane/member, exhausted count, and next ordinal.

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
  `disposition: reject`; its gating is `record-only` regardless of reported severity.
- `reportedNit` is legal only when `reportedSeverity` is `minor`.
- `verifiedNit` is legal only when `verifiedSeverity` is `minor`.
- Exact-source validation compares only reported fields with the durable normalized result.
- `gating` is computed from verified severity, verified nit, and the existing minor-gating policy. Reported fields
  never control ARC gating.

When canonical validation reconstructs retained minor-gating policy, use only verified ordinary minors. Unsupported
findings remain record-only independently and cannot select that policy; reported nit markers cannot supply verified
nit intent. Mixed-set validation must preserve blocking ordinary minors alongside unsupported findings, regardless
of canonical order. Reported and verified nit may disagree in either direction without changing source comparison.

The proposal-side `AuthorDispositionSchema` requires explicit nullable `verifiedSeverity` and optional `verifiedNit`;
omission never silently adopts the reviewer grade. It never asks the caller to copy reported severity, reported nit,
source identity, locus, or gating. Retain the existing three-lane `RespondProposalRequestSchema.source` union and
extend its hosted result binding as specified below. The first `arc review respond -` call resolves the durable
source, copies its source-owned fields, derives gating, and returns the complete canonical proposed disposition set.
The approved second call re-resolves that source before appending the source-bound record and returning the response
plan and policy-selected continuation. No lane constructs a disposition-set identity by importing internal code.

The new fields replace the collapsed `severity`, differing `reviewerSeverity`/`arcSeverity`, and shared `nit` forms
in place, including the unsupported branch. They participate in the existing canonical
disposition-set identity and approval binding; no parallel re-grade record is introduced.

Bind every canonical proposal's source context to the runtime-resolved producer ID and immutable result digest, in
addition to its existing policy/rubric or executable-source context. Both participate in the disposition-set
preimage. Approval of the same-looking findings from an earlier pass therefore cannot authorize a different result.
The command supplies this context in both proposal and approved re-resolution; the caller never computes it. For
local results compute a domain-separated read-side digest of the canonical receipt plus its native admission
context, retaining the existing store-issued receipt reference; for frontline use its outcome digest; for hosted
use the sealed `hostedResultId`. The approved record retains the same producer binding.

Update both Framework copies of `review-triage.md` and `review-response.md`, plus every integration-workflow
presentation site, to consume the split fields. Triage records provider observation and ARC verification separately,
including the null ARC-severity case for a rejected unsupported finding. Response planning derives gating only from
verified severity and verified nit. No methodology path instructs a caller to reconstruct the old single-severity
shape.

For the three durable source variants, the default `review-triage` presentation consumes a CLI-produced report.
The `respond-command.ts` composition calls a pure TypeScript renderer over the canonical proposal/approved set and
exact producer findings, returning `payload.dispositionReportText` alongside the existing structured response.
Proposal and approved/replay paths use the same renderer. It assigns one-based report-local labels (`F1`, `F2`, …)
from canonical order and composes this
channel-neutral shape; the example specifies output, not a workflow-side template to execute:

```text
Finding F{ordinal}: <standalone account of the original claim, stable locus, source evidence, and consequence>
Source: <verbatim native label when available> · source #{sourceOrdinal} · <originating finding link/reference>
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

This is the method's default producer-backed presentation contract, not a second durable schema. A configured
`review-triage` override may replace or extend the projection under the existing method override model. The canonical
proposal, source binding, approval identity, and command validation remain unchanged by presentation overrides.

The existing author-owned `rationale` supplies the faithful standalone allegation, evidence, consequence, and basis
for ARC's judgment; `recommendation` supplies the proposed action and boundaries. The renderer does not invent or
evaluate either narrative. It combines those fields with source-owned locus/references and verified fields to
produce labels, assessment, navigation, separators, and optional-question formatting deterministically. No second
agent-authored report body or narrative ledger is added. Narrative changes require newly approved canonical content;
formatting alone does not. Default producer-backed workflows emit the returned text, not their own reconstruction.
Configured presentation overrides remain judgment-layer behavior and cannot change approved content or its authority.

**Author self-review — non-producer presentation.** Preserve the existing `self-review` → `review-triage`
classification and complete-set approval path, including when the governing workflow invokes triage directly.
The primary presents a faithful standalone account of each finding, stable locus, source-verification evidence,
verified severity, proposed disposition/action, and any open questions. Use report-local `F1`, `F2`, … labels and
separate adjacent findings; identify the report as author self-review. A distinct provider grade, native source
label, producer ordinal, and receipt reference are absent, not fabricated. Preserve the reported/verified
distinction if the author revises an initial grade, without implying a separate evaluator.

This path requires no `arc review respond` call, canonical producer-bound disposition identity, or new renderer
entry point. Approval covers the complete surfaced content through the existing caller's review increment;
changed content requires renewed approval. Retain its disposition evidence in the existing caller-owned record,
without admitting it to the convergence reader or consuming a durable review pass. The producer-backed report and
hashing requirements above, and native navigation below, do not apply to this path. Its presentation remains
agent-authored judgment communication; it does not inherit a mandatory verbatim CLI report template.

**Native navigation.** Producer normalization retains a required one-based `sourceOrdinal` and optional
`sourceLabel` with `sourceLabelTruncated: true` only when bounded clipping occurred. The ordinal is the position in
the original normalized producer result, before canonical disposition sorting; it is explicitly labeled capture
order, never asserted to be a provider-assigned number. Mixed thread/review-body results use their captured combined
order; an exact replay preserves it. Provider-native numbering, if present in the label, stays verbatim there.

Keep evaluator input distinct from runtime-normalized findings. Local input supplies its existing finding fields,
not runtime navigation metadata; normalization assigns ordinals from the submitted finding array. Complete normalized
producer arrays retain capture order and validate `sourceOrdinal === index + 1` at persistence/read boundaries.
Assign hosted ordinals after combining thread and body findings, not independently within each subset. Report joins
and filtered projections retain the producer's ordinals rather than renumbering them as fresh evidence.

Select the label from an actual provider title/heading or the first non-empty line of that finding's source body.
Retain a verbatim prefix of at most 512 Unicode code points, marking clipping; do not invent a title or keep an
unbounded body solely for navigation. Escape it as inert display text. If no source text is available, show
`source #N` plus the existing stable locus and evidence reference. Duplicate labels remain distinct by finding ID
and source ordinal. Labels never substitute for the standalone account of the allegation.

The existing local evaluator wire carries no source title/body, so local normalization leaves the label absent.
Do not add an evaluator narrative field for navigation or interpret an opaque `evidenceUrlOrId` as source text.
Provider adapters extract labels where actual source text is available, before their existing projections discard it.

Canonical proposal order and `F1` labels remain unchanged. The report joins each approved/proposed item to the exact
producer finding by `findingId`, showing source ordinal alongside canonical order. Navigation metadata belongs to
producer content and its result digest, not to separate disposition-item fields or severity/gating/settlement
decisions. The producer digest is already part of approval binding: changed source content requires a newly bound
proposal, while merely reordering or styling the report changes no identity.

**Forward amendment — provider completion and observation fragments.** A hosted provider's completion marker and its
reported observations are distinct facts. For CodeRabbit, an empty `APPROVED` review may close the admitted request
while a preceding `COMMENTED` review for that same request and exact head carries supplemental nitpicks. Normalize the
complete request-bounded terminal sequence: retain each observation once in capture order and use the approval only as
the completion signal. A request with approval and no observations remains clean; a request with any observations
returns findings, and only ARC's verified severity and effective gating decide whether those findings withhold
convergence.

Correlation is bounded by the exact admitted hosted attempt, provider, actor, head, and request-generation interval.
When the provider exposes no request identifier, use the admitted dispatch time and the next known request-generation
boundary; overlapping or otherwise ambiguous intervals refuse rather than combining records. Never aggregate across a
different request generation or head. Thread and review-body observations deduplicate by their stable provider identity
before the existing combined-order ordinal assignment. This extends the completed supplemental-nitpick contract to the
provider's multi-review terminal protocol; it does not widen production APIs solely to share fixture helpers.

**Forward amendment — approved verification scope.** Add required `proposedVerification` to the immutable canonical
disposition-set content, at set level beside `proposedBy` and `findings`, using the existing
`CandidateVerificationApplicabilitySchema` (`targeted | focused | full`). The proposal request supplies it as
`proposal.proposedVerification`; it participates in the disposition-set digest and approval binding rather than a
separate continuation capture. The canonical report renders `Verification: <scope>` once at set level before its
findings.

For a performed fix, `verifiedFix.applicability` confirms the approved proposal. Rank the existing scopes
`targeted < focused < full`: equal or broader verification is valid, while narrower verification is a schema refusal.
The response writer passes the approved scope to the existing review-response transition constructor as
`approvedVerification`. The ready-to-fix authorization and a changed-target continuation preserve that approved value
with the response plan, just as the existing ceiling-override capture is preserved. This work does not use the field to
skip or narrow verification; until the Candidate-lineage consumer lands, an absent or unread transition field retains
today's `full` behavior.

This moves the scope judgment to the approval gate because it decides which checks apply to the agent's own work, an
authority reserved to the approver. Declaring it only after the fix disclosed that judgment too late, at the merge
gate, and allowed the same authority error to recur.

### 5. Resolve immutable producer evidence through existing stores

#### Execution admission

Use existing lane progress to admit a positive `logicalPass` within the lane/subject lineage before execution.
Persist the selected source attempt and requested scope there before dispatch, retaining admission through retries,
fallback, and member head movement. No new admission ledger is introduced. Command composition resolves target,
progress, policy, rubric, source, and scope and returns exact ready inputs; the pure reducer neither reads storage
nor mints evidence. Producing commands consume the admitted inputs, not caller-selected counters.

Make the existing progress record's ownership explicit: one version-checked admission owner per repository, lane,
and runtime-resolved subject lineage. For delivery, use the existing plan/work-unit/member identity without head;
for a Candidate-backed singleton use its current authorized Candidate lineage; other head-bound paths retain their
existing exact-head allowance, scoped to the active vehicle identity. Do not infer identity from a caller string,
merge unrelated Candidate roots, or turn this into WU-wide allowance. Missing lineage authority refuses admission.
An explicitly validated `supersedes` chain is one authorized singleton review-budget lineage: compose prior owners'
completed pass counts for display and every new admission, retain native attempts on their original owners, and
allocate new attempts only under the current root. Missing expected predecessor evidence refuses with an actionable
recovery path rather than silently granting a new allowance. Frontline stays open only until its normal terminal
follow-up closes it, an explicit initial skip closes it, or standard review is durably admitted. Once closed for this
singleton lineage, a changed head or superseding root cannot automatically reopen it; explicit new frontline work
requires a separate decision. The closure is activity state, not a clean review result or clearance.
Head, host change-request coordinates, and source-specific vehicle facts belong to each attempt, not one mutable
container discriminator. Head-specific readers become projections of this owner. Hosted/local fallback must retain
both source histories, and members sharing a head must not share requests, pending admissions, or counts.

Use that owner's version check to select the active source attempt and claim at most one authoritative terminal
producer for each logical pass. A source-specific operation lock alone cannot arbitrate competing fallback sources.
Producer publication and progress may be separate existing writes: interrupted publication repairs the same
admitted producer/count, never allocates a replacement pass or selects a second terminal. Preserve exact targets on
historical results and derive current-head actions separately from lineage-wide counts.

Extend each source's native binding only where a required fact is missing:

- Local operation identity retains target, requirement, actors, source, policy, mechanism, and delivery admission;
  bind runtime-issued lineage, logical pass, and native retry generation in both operation and request identity.
  The receipt already binds that request; distinct members at the same target and ordinal must have distinct request
  IDs as well as operations. Local requirements continue to own policy/rubric admission.
- Frontline operation identity binds the admitted lineage and logical pass alongside its existing target, source,
  and retry generation. Its outcome already carries pass information; validate agreement instead of duplicating it.
  Public resolve derives admission and allowance from durable state/configured policy; run re-resolves the returned
  admission before execution. A schema-valid caller-authored ready envelope or `pass`/`maxPasses` pair is not
  authority. Executable identity and policy remain source bound, with rubric fields only where the source binds one.
- Hosted admission is durable before the external request effect, not first established by its returned handle.
  The handle retains admitted pass/scope and immutable requirement context across request/await; the existing attempt
  ID remains derived from that handle. A result digest is never substituted for producer identity.

Another pass over the same target receives a different operation; exact same-attempt replays reuse it; fallback retains
the logical pass and requested scope while creating source-specific attempts. Retry generation does not increment
logical pass. Adapter upgrades persist source-owned effective coverage alongside the unchanged requested coverage.
No terminal producer re-derives policy, rubric, actor, pass, or scope from current configuration.

Resolve a pending admission before fresh policy, evaluator, or source selection. Keep its author/evaluator identity,
source, policy/rubric, pass, and scope fixed. Preserve existing pre-terminal cleanup/materialization renewal and
attesting-runtime transport renewal only after the existing separation/authority checks, with no terminal receipt
and no change to admitted review actors or scope. The resulting receipt binds the authorized attesting runtime;
terminal evidence cannot renew. Policy/source/evaluator changes require an explicitly selected and validated new
attempt, not an implicit replacement under a pending operation ID.

A failed local evaluation that produced no terminal receipt retains its failed attempt. A deliberate rerun advances
the existing native retry generation, giving it a distinct operation/request within the same admitted logical pass.
Pending replay does not advance generation, and successful terminal replay returns the existing producer. Preserve
the existing bounded retry/fallback policy; missing or partial results do not become clean or gain a new allowance.

Hosted admission covers singleton, Errand, and delivery-member requests while retaining their existing authority
checks. Distinguish admission without a durably acknowledged request from acknowledged result-pending state. Persist
admission before the effect; a failed admission write prevents dispatch. Bind a successful handle back to that
admitted attempt using the existing version check. Acknowledged replay returns the stored await action without
another request. Interrupted or ambiguous dispatch without a bound acknowledgment returns the existing typed
ambiguous-delivery stop: no automatic redispatch, fallback, or fresh pass. A crash before the effect may be
indistinguishable from effect-before-acknowledgment loss; recovery needs an explicit decision rather than an invented
provider exactly-once or reconciliation capability. Pending await uses stored admission even after config/actor
changes; later terminal sealing adds replay-before-observation for completed results.

Complete whole-target scope uses the existing exact target identity, without a redundant scope hash. Incremental
execution persists its concrete prior-result reference, correction endpoints, applicability basis, and material
re-examination instructions in the source's admitted context and existing identity/digest inputs. Ready actions
carry that context. Normalize the source-specific facts in the read-side view; do not propagate a generic persisted
execution object through every schema root. Coverage (complete/incremental) remains distinct from execution
partitioning (whole-target/chunked).

#### Coverage and incremental continuation

Persist `requestedCoverage` and `effectiveCoverage` for every local and hosted execution and its lane attempt. Derive
the local request from the admitted requirement's retrigger; the carrier supplies effective coverage from what it
actually requested of the evaluator. Hosted adapters retain their existing upgrade reporting. A requested complete
review may never become effective incremental; an unsupported incremental mechanism returns typed unavailability or
an explicit complete upgrade. No consumer infers complete coverage from the presence of `attempt.local`.

Frontline's current whole-target producer records complete requested/effective coverage. Incremental frontline
execution is available only if its existing adapter contract can carry the admitted scope; this spec grants no new
provider capability. The common reader never manufactures coverage for an unsupported source.

An incremental result is complete evidence for its admitted correction scope, not for the whole target. To close a
lane/member from it, runtime must resolve a coverage basis through the existing applicability machinery:

1. A prior complete result, or an already validated prior complete-plus-incremental basis, belongs to the same lane
   and subject lineage and has compatible policy/rubric binding. Reference its producer, never a caller assertion.
2. Current contribution applicability establishes what prior coverage remains usable. A changed contribution uses
   the existing explicit covered/review-required decision; unsupported, failed, or missing applicability stops.
3. The fresh operation binds the exact prior/current endpoints and covers the entire required correction scope,
   including re-examination of earlier confirmed material findings whose responses it is checking. The admitted
   scope identifies those finding IDs as review instructions; approving a response alone is not re-examination.
4. Every preceding finding has its approved disposition and performed response; no unresolved material finding is
   dropped by selecting a narrow delta. A deferred/rejected supported material issue outside the delta still
   requires review at its locus or explicit Owner termination. A current reviewer may refute or confirm it anew.

Use one optional predecessor result reference in the source's admitted context to retain this chain in existing
records. The command resolves it back to a complete basis, rejects cycles, missing links, incompatible identities,
and gaps between exact endpoints, and revalidates applicability for the current target. The chain is coverage
provenance, not a new budget store or a rewritten receipt. If an adapter cannot carry the required correction scope,
do not claim it did: offer a capable source or complete coverage through the existing selection boundary.

Resolve the explicit predecessor through `ReviewResultReader` against the complete snapshot, not a source-filtered
earlier-attempt query or a settlement-truncated selection view. Compatible predecessors may use another source or
the same head; validate each producer's own admission context plus shared lane/lineage and policy/rubric compatibility.
Switching from hosted complete review to a capable local correction review must not make that basis disappear.

Derive reviewed endpoints from the immutable predecessor producer. Existing performed-fix retention may project an
attempt at its response's new target for response handling; that projection is not evidence of review at that target.
If review at A leads to a performed fix at B and correction review at C, the required correction scope includes the
unreviewed A→B change, not merely B→C. Preserve established equivalent-head applicability and covered-decision carry
without substituting response completion for reviewed coverage.

An effective complete result needs no predecessor basis for coverage. An incremental result without an adequate
basis can still be triaged and its approved response performed, but resolves `coverage-required / select-coverage`
instead of completing the whole lane. Its completed logical pass still counts. The returned recommendation states
the missing basis and available scope/source choices; it never silently launches an expensive complete pass.

Convergence uses the fresh pass's verified signal after coverage validation; it does not take a lifetime maximum of
historical severities. Earlier material findings remain historical evidence, and only actual subsequent review can
establish a new no-material signal. Neither applicability nor settlement changes the earlier result's severity.

Adapter support is checked at admission, not inferred from `incremental` labels. Extend local materialization to
carry exact correction endpoints separately from the whole review target and include required finding instructions
in its payload. Frontline's existing whole-target execution stays complete. Hosted Codex retains its explicit
complete upgrade. CodeRabbit's current fixed incremental command carries neither arbitrary endpoints nor a material
finding instruction list; its label alone therefore cannot establish the required correction scope. Such a result
may be triaged and counted but cannot close coverage without an established source-specific scope binding. Return
the existing capable-source/complete-coverage selection action; do not silently launch a complete review or add an
unproven provider capability. Contribution applicability establishes retained code, not evaluator scope.

**Amended 2026-09-11 — carrier-relative hosted proof.** Keep the source-neutral exact correction scope in ARC's hosted
admission even when the carrier cannot accept arbitrary endpoints or a material-finding instruction list. CodeRabbit's
native incremental command establishes coverage only when authenticated provider evidence binds its reviewed baseline
and terminal generation to the admitted predecessor and current exact head. This supersedes the blanket CodeRabbit
rejection above: the native range is carrier-relative proof of the internal scope, not a claim that ARC transported its
instruction list. Missing, ambiguous, overlapping, or mismatched provider history returns the existing capable-source
or complete-coverage selection rather than silently launching or crediting a complete review.

Separate ARC's exact required correction scope, the carrier's invocation mode, and the effective coverage established
by evidence. Exact-capable delegated local review receives the admitted endpoints and material-finding instructions
directly. Provider-native hosted review retains them internally and proves the corresponding range through its
authenticated provider generation. Frontline remains whole-target unless its execution contract later gains
exact-scope support. A different, missing, or non-comparable provider baseline cannot establish the admitted scope.
Required material finding identities remain in the internal scope and cannot be dropped merely because the provider
owns range selection.

An admitted local correction operation owns reachability for every required correction endpoint during its existing
materialization lifetime, including a nonancestor prior head after amend/rebase. Extend existing pin verification,
enumeration, and cleanup together; a current-head pin alone cannot retain such an endpoint. Check required objects
on prepare, replay, and attestation. Already-unavailable predecessor objects return typed scope unavailability rather
than invented coverage. Predecessor cleanup must not remove the current operation's pins; retain existing terminal
and expiry cleanup, without a permanent history-retention service.

`chunk-scope-binding` owns automated partition transport, per-chunk identities, scope-aware receipts, multi-producer
reduction, and union proof. RSC consumes one terminal aggregate producer already supported by the selected carrier,
including the existing aggregate after manual chunk review. Partial progress cannot establish terminal convergence;
independent partial producers cannot be combined into clearance here. Preserve the current manual chunk procedure
and its complete aggregate finding set. Incremental correction binding does not assert automated chunk coverage.

#### One read contract, distinct persistence responsibilities

Introduce a source-specific `ReviewResultReader` port (new) that resolves complete immutable producer evidence from
local receipt/operation, frontline outcome, or hosted attempt stores. Its normalized view includes producer ID,
exact target, execution/coverage binding, source admission context, original terminal outcome, complete findings,
and content identity. It performs no write and is not a generic repository. Keep `FrontlineOutcomeRecordSchema`,
`FrontlineOutcomeStore`, and their existing version-checked `outcomes` namespace; extend their evidence fields only
as required by execution and navigation. Local receipts retain their separate ledger semantics.

For hosted evidence, extend `HostedLaneAttemptBindingSchema` with a sealed terminal snapshot. Move producer findings
into that snapshot rather than maintaining a second authoritative array. It records original `clean | findings`,
review URL when the provider supplies one, complete ordered normalized findings, and canonical `hostedResultId`.
The existing admitted handle, exact v2 target, execution/coverage binding, and requirement remain immutable alongside
it. Pending attempts have no terminal snapshot; failed/unavailable outcomes never acquire a clean one.

The hosted result digest covers the hosted producer ID, admitted handle, exact v2 target, execution and effective
coverage binding, canonical admitted requirement, original outcome, review URL, and complete ordered findings,
including their bounded native navigation. Exclude mutable lane/attempt outcome, completed counts, update time,
store version, disposition/approval/fix/settlement state, dispatch actions, opaque reference, and the digest itself.
The current operation-state publisher validates hosted transitions: admitted hosted attempts cannot disappear or
change identity; pending-to-terminal seals content once; sealed content cannot change or disappear. Settlement
mutates only its own fields. Put this validation at the version-checked write boundary so another schema-valid
rewrite cannot bypass it. Old unpublished state may be regenerated; no compatibility reader is added.

Keep hosted opaque-reference coordinates as lane-progress operation ID plus hosted attempt ID. Extend the existing
hosted source variant with `hostedResultId`; no physical store version belongs in that reference because settlement
changes it. The reader resolves exactly one producer and verifies its content digest. Approved dispositions remain
keyed by producer/attempt ID and bind the immutable result identity; the lane-progress container ID is not itself a
review producer. The existing operation snapshot supports producer lookup; missing, duplicate, or corrupt entries
fail closed.

Every hosted terminal await returns the opaque reference and digest after durable persistence, for both clean and
findings. On retry, resolve the persisted admitted handle before provider observation. A sealed result returns its
original outcome/reference without repolling, re-deriving actors or requirements, rewriting evidence, or advancing
counts. After settlement, replay still returns the original findings result while retaining settled operational
state. Equal concurrent terminal writes are idempotent; different terminal content conflicts. Equality here compares
sealed producer evidence, not the entire mutable progress record. On a version conflict, reread the winner and
validate the same admitted producer/content; return current progress without overwriting newer settlement, other
attempts, timestamps, or counts. A pending replay continues under its original admission, with the existing bounded
version-conflict retry discipline.

Replay without provider observation requires a durably sealed result. If sealing succeeded but its acknowledgment
was lost, or a subsequent progress write failed, reread the seal and repair the same producer/count without polling.
If no seal was persisted, retain acknowledged pending admission and permit observation under that admission; do not
claim to reconstruct the unstored result or allocate another pass. Resolve uncertain write outcomes by reading the
store first. No additional result journal or provider request is needed for this distinction.

`respond-command.ts` resolves the same immutable result for proposal and approved preparation, compares the complete
finding set, and appends the existing approved record. Clean results go directly to evidence admission, with no empty
disposition record. Historical result replay grants no current-target applicability or integration authority.

The producer-binding migration closes every constructor, validator, and replay consumer of the canonical disposition
context at the same delivery boundary. This includes `reduce-command.ts` and the local resume path that consumes its
projection, plus response/follow-up consumers and their fixtures. Reuse the shared source-context validation rather
than accepting weaker binding outside proposal preparation. The later reported/verified grade migration changes
judgment representation, not whether these consumers can read and validate producer-bound approvals.

### 6. Bind terminal review attempts to durable source records

Extend `ReviewAttemptSchema` with one conditionally required `reviewOperationId`: terminal `clean` or `findings`
attempts name their producer; unavailable, failed, and partial-progress attempts cannot supply terminal convergence
evidence. A manual chunk series reaches this boundary through its existing complete terminal aggregate, not an
ordered list of independently scoped producers.

At the command boundary, resolve the current v2 target from repository state and load the named producer through
`ReviewResultReader`. Reject unless it resolves uniquely, its original terminal outcome matches the attempt, and
its original exact target, source, admitted logical pass/scope, and source-appropriate policy/rubric context match
the durable admission. Separately establish applicability to the current target as below; a historical producer
need not claim that it reviewed the current SHA. An incomplete aggregate or competing authoritative terminal
producers for one logical pass fails closed.

Head movement alone neither erases review evidence nor requires another evaluator call. Validate a historical
producer against its original admitted target, then establish current applicability through the existing Candidate
and contribution machinery. Preserve automatic recognition through tree equality or mechanical reapplication, and
existing exact `covered` decisions with their validated mechanical carry. Do not replace those paths with a blanket
current-SHA requirement or repeatedly ask for an unchanged applicability decision. Conversely, a clean result merely
occurring somewhere in the Candidate span is not sufficient when current applicability is unavailable; surface the
existing applicability decision/refusal rather than silently clearing or automatically requesting another review.
Retaining a result retains its original signal and completed-pass count: applicability cannot turn an earlier
material result into a new no-material result or substitute for Owner accepted-risk termination.

For a findings producer, additionally load exactly one `ApprovedDispositionRecordSchema`. It must point back to
that producer and immutable result, and the producing boundary's exact comparison must cover every finding in the
complete result, including the aggregate of a manual chunk review. A clean producer needs no disposition record.

The external request supplies the producer operation ID, not record bodies, an unsupported clean assertion, or a
caller-computed severity summary. Result/continuation actions carry that reference and runtime-owned progress;
commands re-resolve durable progress before dispatch, refusing caller counter drift. A settled operational attempt
resolves to its original producer outcome and approved record; `settled-findings` is never standalone convergence
evidence. No list-based aggregation contract or speculative chunk-union validator is introduced.

After validation, derive internally:

```text
confirmedFindingCount
maxConfirmedSeverity: ReviewSeverity | null
coverageAdequate: boolean
```

The confirmed subset contains every item with `sourceVerification: verified` and a non-null `verifiedSeverity`.
Compute the maximum from `verifiedSeverity` only. Disposition never changes the review signal: a supported finding
resolved as `fix`, `defer`, or `reject` retains its verified severity, while an unsupported allegation has null
verified severity and therefore contributes none.

`coverageAdequate` comes from § 5's current complete coverage or validated incremental basis. Predecessor results are
validated against their own exact targets and the current applicability chain; they are not rewritten as fresh
current-target producers. Missing evidence is a typed admission failure, not a synthesized minor-only summary.

Once coverage is adequate, the policy reducer handles a last `findings` attempt as follows:

- `maxConfirmedSeverity: null` — all reported findings were refuted; resolve `pass-complete / none`.
- `maxConfirmedSeverity: minor` — only confirmed minors remain; resolve `pass-complete / none`.
- `maxConfirmedSeverity: major | critical` — withhold convergence and resolve `findings / respond` with
  `postResponseAction: resolve-next-pass`.

A durable clean result with adequate coverage resolves `pass-complete / none`. Inadequate incremental coverage
resolves `coverage-required / select-coverage`; a material finding remains visible in that result. The response
plan is preserved in either case. Once coverage selection seeks another evaluator call, the existing ceiling check
fires before invocation, including an incremental request at the cap.

The exact operation binding distinguishes positively refuted findings from an unbound assertion that findings
occurred. A clean operation binding likewise distinguishes a durable clean result from an unbound caller assertion.
The reducer never receives reported severity as its control value.

For an unchanged target, `resolve-next-pass` re-invokes policy resolution with the driver's returned
`completedPasses`, the same exact target and lane, revalidated scope selection, and an empty attempt history for the
new pass, all supplied as a runtime-composed continuation. Admission reuses an existing pending logical pass on
retry rather than allocating another. The driver then returns `ready` or `approval-required` at the ceiling before
any evaluator invocation. Retry and safe-fallback attempts remain scoped to one pass and never leak into the next
pass's source selection. The evidence reader normalizes validated state for the pure policy reducer; no summary or
coverage-adequacy field becomes a caller-controlled wire assertion.

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

Retain `respond-command.ts` as the channel-neutral preparation boundary for all three source variants. Source
validation, canonical proposal construction, approval validation, approved-record append, and response-plan
projection happen there before policy resolution. The preparation step may derive and persist a
`fixAuthorization`, but it does not apply a fix or close a finding.

Compose that post-append policy resolution inside the approved `respond` command boundary; no extra agent-invoked
policy round trip or reapproval is required. Return the selected response action and retain its policy continuation
through existing response/resolve/status composition. Fix execution, verification, and commit retain their existing
interlocks. This is not a replacement correction-loop engine.

Carry the governing caller's nonrecoverable review judgments into this composition and its returned continuation.
Reuse the existing prepublication resume context and corresponding caller-owned inputs for other lifecycle paths;
a source reference or publication-boundary lookup alone cannot recover pending scope, invocation, or ceiling choices.
Revalidate the supplied context through its existing owner and preserve current head-bound override/terminus
invalidation rules. Runtime returns the exact continuation inputs; it neither silently substitutes defaults nor asks
the agent to reconstruct them. No second session-context store is introduced.

For hosted sources, persist the normalized result during terminal await handling, feed its returned source reference
through the same proposal and approved preparation calls, and perform thread settlement only after the driver call.

The common lane order imposes these contracts on every production caller:

- A non-empty result from `arc review frontline run -`, `arc review local attest -`, `arc review reduce -`, or
  `arc review hosted await -` triggers triage directly.
- The prepared response plan, not a second reconstruction of the approved set, drives post-driver performance.
  `nextAction: respond` narrows to executing that plan; triage, approval, and source binding have already completed.
- Every complete disposition set, including a no-action record-only set, is approved before the driver call. Remove
  the integration workflow's deferral of such approval to the final combined gate. The final integration interlock
  remains separate merge authority and does not re-approve the disposition set.

Record-only approval is an intentional judgment turn: letting an unapproved proposal control convergence
would make the durable approved-record requirement fictional. The standardized disposition projection makes the
complete judgment visible at that turn.

No driver arm may complete or suspend a lane while an approved disposition set remains unperformed.

The following table is a command-composition contract, not an agent-executed conditional procedure. Keep the pure
policy result separate from the selected executable action. Existing response/resolve/status composition first
projects any outstanding approved response as that action, retaining the policy continuation behind it. On response
completion, composition rechecks target currentness and selects continuation or reroute. Public actions carry the
exact request inputs; workflow prose never compares targets, reconstructs the table, or selects which pending
response to discard. Fix execution and its approval/commit interlocks remain human/agent leaves, not automatic CLI
mutations. No new resident coordinator is introduced.

| Driver result                                     | Required behavior before target-movement resolution               |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| `findings / respond`                              | Perform the approved response.                                    |
| `pass-complete / none` with an outstanding set    | Perform the approved response.                                    |
| `pass-complete / none` without an outstanding set | No response performance is required.                              |
| `chunk-pending / continue-chunks`                 | Perform the current scope's approved response.                    |
| `approval-required / obtain-ceiling-override`     | Perform the approved response, then bind or request the override. |
| `coverage-required / select-coverage`             | Perform the approved response before selecting coverage.          |
| `owner-accepted / none`                           | Perform any already-approved outstanding response.                |

Response performance returns one of two target-movement states:

- `unchanged-target` — apply the driver result: complete a converged pass, continue the existing chunk series,
  execute `resolve-next-pass` after a material response, suspend, or admit the named one-pass override — binding
  the capture taken with the disposition set, or requesting approval when no capture exists — and then execute
  `resolve-next-pass` for the named pass.
- `changed-target` — any performed fix created a new exact target. Discard the old-target driver action, abort the
  old chunk series, and return through the existing reroute boundary. Preserve the originating pass count and
  approved response plan, including remaining thread settlement and any captured ceiling override. Re-resolve
  applicability, scope, and policy for the new target while preserving valid existing decisions through the
  established equivalence/carry paths. A changed SHA alone does not mandate a new judgment or evaluator call.
  Earlier evidence may contribute only through validated coverage/applicability; exact-head clearance and old
  chunk-series completion never carry implicitly.

**Conditional ceiling override.** The one-pass override may be captured with the disposition set, before that set's
approved response is performed. Approval of the disposition set alone does not grant it: the caller records explicit
authorization for the named activity and next pass. In the approved `respond-command.ts` path, append the approved
record first, then persist the capture as response-continuation state in § 5's existing version-checked lane-progress
owner. Bind its authorizer, repository/lane/member or singleton lineage, originating producer and disposition-set ID,
exhausted count, and named next ordinal. It enters neither the immutable disposition content nor evaluator context;
no new store is added.

An unapplied, unverified, or uncommitted fix, incomplete thread settlement, or another outstanding approved item
keeps the capture pending and unusable, not invalidated. Restart and status preserve it without another approval.
After complete response performance, runtime resolves the existing durable response evidence and binds the exact
produced head — unchanged, or created by the fix — under normal target, lineage, count, scope, and policy checks.
An unrelated current head cannot substitute for that result. Explicit withdrawal, a superseded approved set, or an
incompatible response/lineage/pass binding invalidates the capture. Whether the performed fix exceeded its proposed
scope remains primary judgment; when it did, withdraw through the same continuation input and seek fresh approval.

Consume the capture with admission of its one named logical pass through the lane owner's existing version check,
before dispatch. Retain the consumed admission reference: retry/fallback resumes that same pass, while replay of the
old approval cannot recreate permission for another. Concurrent re-entry and interrupted acknowledgment reread the
owner; a failed capture write dispatches nothing, and exact approval replay may repair it without resurrecting a
withdrawn, superseded, or consumed capture. A pending capture is not a portable exact-head override. When no usable
capture exists, the existing request path applies unchanged; every evaluator invocation still requires admission.

For advisory planning/criteria reviews, retain the conditional decision and performance check in the caller's
existing evidence, not lane-progress records. The primary consumes the named permission for one fresh pass only
after the approved response is complete; unfinished work preserves it, while withdrawal or supersession does not.

Capturing the decision with the disposition report keeps one operator turn per pass instead of two, without making
any pass beyond the cap automatic.

**Forward amendment — approved disposition supersession.** Add one narrow post-approval/pre-performance correction
transition for an unchanged producer and exact target when new source evidence or fix verification disproves part of
the approved judgment before an incompatible fix is consumed. This is not a generic amendment framework. The proposal
arm of `arc review respond -` names the predecessor disposition-set ID and supplies a fresh complete proposal; the
ordinary approval arm then requires a distinct fresh approval and returns a typed supersession result. Neither call may
edit the predecessor or infer approval from the earlier set.

The Git-common advisory record retains an immutable ordered lineage of approved sets plus one current-set pointer.
Each successor binds its predecessor, the same repository, producer, source result, and exact target. Publishing the
successor and advancing any local, frontline, or hosted producer/lane binding occur through the existing Git-common
transaction boundary and shared advisory-lock abstraction; do not add a response-specific lock. Exact replay returns
the recorded successor. A second different successor, stale predecessor, moved target, different producer, or partial
proposal refuses without rewriting history.

Supersession marks the predecessor non-current and invalidates its unconsumed fix authorization, pending continuation,
and ceiling-override capture. Every reader and admission path checks current-set status, so replay of the predecessor
cannot restore or consume its authority. Refuse supersession after any incompatible fix consumption or when external
settlement cannot be attributed exactly. A record-only predecessor or compatible already-performed hosted action may
carry forward only with its exact settlement evidence and unchanged required channel action; a changed disposition or
channel action reopens that finding for new performance. Ambiguous settlement never carries.

Successor proposal materialization reads the immutable producer and confirms that the repository HEAD still equals the
approved target. It does not materialize Candidate content or treat the authorized, uncommitted fix increment as the
proposal's source, so expected dirty paths do not block proposal construction. The transition grants no authority over
those bytes: the successor approval, fix authorization, staging, verification, and commit gates still decide whether
they may land. Unrelated dirty paths and a moved HEAD remain typed refusals.

Expose the transition, its replay/conflict/refusal states, and its settlement carry/reopen plan through the public
`arc review respond -` envelope and `review-response` guidance. Apply the same lineage semantics to local, frontline,
and hosted producer bindings wherever they share this record shape. Interrupted publication repairs idempotently from
the current pointer and successor edge; no direct Git-common state surgery is part of the workflow.

**Forward amendment — continuation serialization and performed-response evidence.** Member 5 adversarial verification
showed that exact-head lane operation IDs are correct state owners but insufficient serialization identities for a
singleton continuation that deliberately survives head movement. Keep persisted producer and lane identities exact.
For mutation ordering only, derive a stable continuation-owner key from repository, lane, and the lineage identity
without its mutable head coordinate. Successor publication, conditional-authorization capture, withdrawal,
response-performance binding, and next-pass admission for that continuation owner all acquire the existing repository
review-operation advisory lock by this stable key before currentness checks or writes. Candidate and delivery-member
lineages retain their already-stable identity. No second lock abstraction or response-specific lock is introduced.

One terminal producer may retain an append-only ordered history of conditional next-pass authorizations with one
current pointer. Invalidating a predecessor records its terminal state and never deletes or overwrites its approval
evidence. A freshly approved successor may append one distinct authorization bound to its own disposition-set ID even
when the predecessor has an invalidated authorization; exact replay resolves that same node, while a conflicting
successor, stale approval, consumed predecessor, or attempt to revive an earlier node refuses. The approved response
command may publish the successor before appending its authorization only because replay repairs that exact partial
state under the stable lock; it must never dispatch a pass from the partial state.

Record fix response performance as its own durable fact, whether or not a conditional next-pass authorization exists.
Bind the approved disposition set, exact response origin, and exact produced head; repeated recording is idempotent and
conflicting performance refuses. Conditional authorization may consume this fact but is not its storage or proxy.
For hosted findings, completion is the conjunction of every required host-addressable settlement and this performed-fix
fact whenever the approved set contains a fix. A record-only fix requires no provider receipt but still requires the
performed-fix fact. A host-addressable fix receipt must name the same produced head. Settlement-first and fix-first
execution both retain partial evidence and converge when the other side arrives; neither partial ordering may report
the hosted attempt settled. No-fix record-only actions retain their existing immediate settlement semantics.

The public `review-response` guidance includes the complete two-call supersession choreography: a fresh complete
proposal naming `supersedes`, fresh approval of the returned successor, performance of only the returned carried or
reopened actions, and typed replay/refusal handling. It also states that expected authorized fix dirt may coexist with
proposal materialization while unrelated dirt and moved HEAD still refuse. Public examples consume command-returned
identities and actions rather than constructing Git-common state.

The no-outstanding-set completion arm confirms the exact target is still current before completing. Convergence,
suspension, and cap exhaustion therefore end only an unchanged-target loop and never discard approved work.

**Member progression.** Apply this same evidence admission and reducer at each native-stack delivery member.
`projectHostedReservationPolicyProgress`, `projectHostedReservationDischarge`, earlier-attempt projections, and
local attestation retain requested/effective coverage and logical pass identity through head movement. Ordered
conjunction selects the first outstanding member. A material pass remains outstanding after fixes/settlement until
a subsequent coverage-adequate no-material result or a valid Owner terminus; at the cap expose the exact additional
pass consequence. A clean complete member advances after one pass. No member-local alternate convergence threshold
or WU-wide budget is introduced.

**Owner terminus.** Preserve `resolveDeliveryReviewTerminusAcceptance` and its authenticated exact-member/boundary
binding. Owner acceptance is a deliberate accepted-risk stop and is displayed as such; it neither changes severity
nor claims a clean/converged result. A ceiling override permits one new pass and never implies Owner acceptance.
Apply the existing terminus invalidation rules on target movement, and never discard an approved response merely
because a terminus exists.

**Resumption and presentation.** Public prepare, attest, await, respond, resolve, and status outputs retain the
exact next command input, source reference, coverage, and pass state. Repeated status or resolution is read-only
with respect to pass consumption. An interrupted session uses those public actions to finish the same response and
continue; it never imports schema internals, invents operation IDs, or reconstructs history. Mechanical diagnostics
and coverage/cap offers are precomposed in TypeScript. Primary judgment remains source verification, disposition,
scope recommendation, and the existing applicability decision where required.

**Invocation ownership and reachability.** `prepare-work-unit` owns private code-review triage and response;
`integrate-work-unit` owns the public cycle, with delivery/Errand callers owning their corresponding cycles.
`verify-work-unit` retains its separate non-producer self-review triage step under § 4. Each direct caller declares
and fires the methods it actually invokes. `review-response` consumes the approved set for performance; reconcile its
current `awaiting-approval` instruction by returning that state to the governing caller, not secretly invoking triage
again. Preserve refusal of unapproved mutation. Do not add an `adversarial-review → review-triage` dependency just
to share convergence semantics, or make planning workflows acquire code-review records.

Audit declarations and actual fire-points together, including method-owned dependencies and configured overrides;
`related` is consistency guidance, not a loading edge. The advisory method owns its source-verification,
complete-disposition, and cap instructions at the relevant primary-runtime steps. Those steps remain reachable
through the three planning callers and `validate-criteria`, including direct method invocation. Check installation
through `init-recipe.json`, not file presence alone. Use existing declaration/loading mechanisms and minimal
operation-local constraints; add no global load-set entry or blanket method preload.

Producer-backed caller choreography distinguishes the two response-command uses: triage supplies the proposal input,
the proposal command returns the report, complete-set approval precedes the approved command, and response performance
follows its returned action. Update existing ordering assertions as well as prose, including retained delivery attempts
and private/public Errand paths. Self-review declares its direct triage dependency; verification's direct self-review
triage remains on the non-producer approval path and acquires no response-command requirement.

### 8. Preserve convergence attestation ordering through publication readiness

Extend the existing `run-convergence-verification` action on the persisted publication boundary with a typed
post-attest continuation. It carries the reviewed exact head, the existing
`continue-pre-publication-review` action with runtime-built opaque `--resume` transport, and
`projectionDisposition: keep-staged-until-publication`. Candidate ID and subject digest remain on the enclosing
boundary. This adds no parallel receipt or authority record.

`handleReviewPrePublication` constructs this continuation when it emits the convergence action, using its existing
replay-judgment transport. Preserve completed self-review, change-set judgment, lane/scope selections, coverage,
already-consumed exact-head ceiling authorization, and the enclosing reservation or Owner terminus. The token is
replay input, never a clean-review assertion; every authority-bearing claim still resolves against current records.

Convergence `arc attest` consumes the matching Candidate/boundary and returns the stored continuation through
`projectCandidateReviewResumeBoundary`. An unchanged replay repairs the same boundary if Candidate persistence
succeeded before boundary/meta persistence failed. Preserve the continuation after repair and on later retries.
Initial root/re-root attestation stays on its existing path; it does not acquire a fictitious reviewed-head basis.

Retain the typed post-attest context, including reviewed head and projection disposition, on the resulting
`CandidateReviewResumeBoundary` until readiness or explicit recovery replaces it. It must survive removal of the
original convergence action, so plain prepublication invocation and later re-entry apply the same ordering guard.
After readiness, retries honor the advanced boundary rather than reinstalling the pending guard or regressing its
authority. This context stays inside the existing boundary, not only in caller-carried text.

`prepare-work-unit.md` follows this sequence:

```text
convergence verification → attest with projections staged → returned prepublication continuation
  → candidate-publish-ready → publish transition → one lifecycle projection commit
```

Before invoking policy on that continuation, re-resolve Candidate, reviewable subject, and Git head:

- Same Candidate/subject/reviewed head: resume ordinary prepublication using the preserved judgments.
- Changed reviewable content or Candidate: use the existing Candidate reroute/refusal; no stale completion.
- Same subject but head moved before readiness: return a typed `attestation-ordering-conflict / stop` diagnostic
  naming the reviewed/current heads and pending continuation, before policy execution, evaluator dispatch, or pass
  consumption. Repeated status must not turn this into a fresh above-ceiling review request.

The premature-commit diagnostic offers a CLI-generated recovery continuation using the existing opaque resume
transport. Its explicit `attestationOrderingRecovery` input binds Candidate ID/subject digest, reviewed/current heads,
and expected boundary version. Following it requires an explicit recovery decision; ordinary re-entry or omission of
`--resume` cannot imply that choice. Revalidate all bindings before replacing the pending guard through the existing
version-checked boundary write, then re-enter current-head review composition with the preserved judgments and normal
applicability/cap authority. Stale recovery input refuses without replacing newer state. Equivalent-head evidence and
valid carried applicability decisions remain reusable; recovery itself grants neither a pass nor clearance.

Recovery performs no reset, history rewrite, automatic evaluator invocation, or receipt rebinding. Existing
authorization of subject-stable operational commits after `candidate-publish-ready` remains valid. The distinction is
whether readiness was established before the projection changed the exact reviewed head.

These typed actions enforce safe continuation at ARC boundaries. They do not prevent an arbitrary external
`git commit`; no new commit hook is claimed. `verify-work-unit.md` distinguishes convergence re-entry from its
initial verification commit wording, so the normal workflow does not instruct the premature commit.

## Alternatives & Rationale

### Keep the re-grade only in the user-facing report

Rejected. Shipped records already preserve regrading; leaving it only in presentation would regress provenance.
Retaining the current variants without fixing gating and evidence admission still leaves the driver unable to use
the judgment. The explicit two-lane shape makes the required null and independent nit states uniform.

### Let verified severity overwrite provider severity

Rejected. It destroys provenance and makes exact-source validation either reject legitimate re-grades or stop
checking the source. Separate reported and verified lanes preserve both facts.

### Accept a caller-computed confirmed-severity scalar

Rejected. The scalar duplicates control-bearing derived state without carrying exact-target, complete-result,
approval, or source bindings. A stale or provider-sourced value could falsely converge or buy an unnecessary pass.

### Add a hosted-only finding or disposition store

Rejected. Hosted attempts already persist the admitted context and result. Sealing that producer snapshot and
validating transitions at the existing publisher gives immutable evidence without dual-writing a hosted result into
the frontline store. A common reader composes these domain-specific stores while preserving exact-result, replay,
and source-binding obligations.

### Count only complete reviews against the pass cap

Rejected. It makes incremental continuation effectively unbounded and conflates coverage with allowance. Count every
completed logical pass once and expose complete-coverage count separately. This keeps a cheaper incremental check
available while preserving one-extra-pass authority at the configured cap.

### Persist one generic execution object and a separate whole-target scope hash

Rejected. Native operation/request/handle identities already bind the target and source admission. Add missing pass
and incremental scope facts there; use existing lane progress for shared admission and normalize at the read side.
Uniform persistence adds schema and replay obligations without stronger authority. Retry generation and logical pass
still differ, and hosted admission must precede its external request effect.

### Prebuild multi-producer chunk convergence before its carrier

Rejected. Without independently scope-bound receipts and a proven union, list validation supplies no working
capability. Consume the existing complete terminal aggregate, preserving manual chunk review. The automated carrier
must own scope transport, identities, and complete union proof together; no incomplete aggregate can converge.

### Replace incremental lineage with a single cumulative complete anchor

Rejected as a mandatory simplification. Reviewing the entire residual since the last complete review repeats earlier
corrections and cannot be expressed by every current adapter. Retain narrow predecessor-based correction review,
using existing applicability facts without mistaking them for evaluator scope. A capable source may perform a wider
review, but reducing traversal code does not justify making every reviewer repeatedly cover the cumulative delta.

### Add an agent-invoked policy step after approved response preparation

Rejected. The existing response command can append approval, resolve policy, and return the selected action in that
order. Exposing those deterministic internal stages as separate required calls increases ceremony without adding
authority. Actual judgment, fix execution, verification, and commit retain their existing boundaries.

### Treat an incremental clean result as a whole-target clean review

Rejected. It overstates what was reviewed. A current correction result can close convergence only with a validated
prior coverage basis and re-examination of the material responses. Otherwise it contributes scoped evidence and
returns a coverage-selection action. No historical material finding is erased by settlement or by a narrow review.

### Require every incremental carrier to accept ARC-authored endpoints and finding instructions

Rejected. That transport is the strongest and preferred proof for delegated local review, but it would disable the
ordinary hosted incremental path used by providers whose API owns the reviewed delta. Retain ARC's exact internal
scope while allowing a registered hosted adapter to prove a carrier-native baseline and terminal generation. This
does not trust an `incremental` label alone: missing or intervening provider history fails closed to a capable source
or complete coverage.

### Preserve labels in the canonical disposition item

Rejected. Navigation metadata describes the provider result, not ARC's judgment. Joining by the durable finding ID
preserves native recognition without adding presentation fields to disposition items. Result content hashing and
its approval binding still detect altered source metadata; report-only styling changes no canonical identity.

### Accept any attestation-only head change as prior review applicability

Rejected for the publication-ordering fix. The typed continuation can preserve the reviewed head until
readiness. Extending receipt applicability to compensate for a premature commit would add authority machinery for
an avoidable sequencing error. Fail before another review dispatch and offer § 8's explicit recovery through the
existing resume transport, preserving established applicability rather than adding an exception.

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
that judgment to an exact target, source-appropriate policy/rubric context, complete finding result, proposer, and
distinct approver. No external scalar or provider label controls convergence.

Clean convergence resolves from the same exact operation, target, pass, scope, and source admission bindings without
inventing an empty disposition record.

Pass-cap overrides bind the exact target, lane or activity, exhausted count, and next pass. They authorize one
additional invocation, not a continuing exception. An override captured with the disposition set binds only after
its approved response is performed, against the head that response produces. Incomplete performance keeps it pending;
withdrawal, supersession, or incompatible bindings invalidate it. Capture reduces operator turns without replacing
exact admission, authorizing another pass on replay, or granting permission from disposition approval alone.

### Procedure evolution

Deterministic summary derivation and driver dispatch remain in TypeScript. The workflow prose dispatches on typed
states and retains only irreducible source-verification and recommendation judgment. This change adds no
agent-interpreted control syntax.

The adversarial-review method has no resident engine, so its visible `Pass N of M` output remains a primary-runtime
contract for now. Any automatic planning or verification audit dispatcher must compute and expose the same state
rather than re-encoding comparisons in workflow prose.

This is an explicit enforcement residual: the advisory loop's judgment report and pass stop remain agent-executed,
not mechanically equivalent to driver-managed lanes. Keep their constraints in the invoked method, while registered
request/envelope contracts and schema documentation derive from TypeScript. Current workflow composition consumes
typed actions with exact inputs and precomposed mechanical text; it does not acquire agenda compilation or fragment
infrastructure. Follow the composable-workflows separation of contract, procedure, and judgment without broad
lifecycle rewrites. Loop interlocks remain visible at their operation boundaries.

### Knowledge evolution

Keep shared code-review guidance in existing methods and declare only direct dependencies at their consuming
artifact. Keep advisory-review instructions in that mechanism and caller-owned launch/approval gates at callers.
Do not move hard constraints behind passive index entries, extract a new guidance family for one consumer, or add
always-loaded narrative to compensate for a missing fire-point. Historical design rationale belongs in these
planning artifacts, not shipped procedure. The occurrence-sensitive severity vocabulary update does not require
global definitions of every private transport field.

### Storage evolution

Review evidence stays behind injectable ports with version-checked writes. Hosted sealed results share existing
operation persistence; the common result reader adds no backend or configuration axis. The sealed projection has
evidence semantics, while mutable operational progress remains non-evidentiary. Update the operation-port contract
to make that distinction explicit. Candidate/publication projections retain their existing tracked storage and
version checks; this work does not relocate them.

The 2026-09-11 carrier-relative amendment keeps exact hosted correction scope and provider-native range evidence in the
existing admitted hosted attempt and sealed-result identity; it creates no other store, ledger, or configuration mode.

### Compatibility and migration

All affected contracts are unpublished strict-current baselines. Update repository-owned callers, fixtures,
generated schemas, and stored development records together. Clear or regenerate incompatible local review state.
Do not add aliases, dual-input readers, or data migrations.

### Performance

Each terminal attempt reads its one named producer; a findings result also reads its approved disposition record.
The existing manual chunk carrier supplies one complete aggregate at this boundary. Review execution dominates local
I/O. The configured ceiling bounds logical pass recurrence, not raw evaluator-call count; bounded chunk and scout
orchestration own intra-pass calls. Incremental coverage reads its predecessor chain from the existing snapshot,
memoizing within the command. Missing or cyclic history fails closed; no new history store is introduced.

The clean path adds no empty record or approval. Findings require one complete judgment approval; the approved
command returns the selected response/continuation without caller reconstruction of counters or history. Replays
reuse admitted actions and sealed results. Scope uncertainty and cap overruns retain their genuine decision turns;
mechanical continuation introduces no new permission turn.

### Testing

- Schema tests accept `critical`, reject severity-position `blocker`, and preserve every enumerated non-severity use.
- Disposition tests cover reported/verified divergence, refuted findings, nit constraints, derived gating, canonical
  ordering, approval identity, report-local labels and separators, and the default standalone human projection.
- Result-reader/store tests cover frontline parity, hosted sealing, conflicting replay, direct publisher mutation
  refusal, malformed state, and operation/result-ID separation. An await replay after approval or settlement returns
  the original result with no provider call, count increment, or progress regression.
- Operation tests prove same-target passes have different identities, same-attempt replays are idempotent, retry
  generations do not advance logical pass, and fallback sources retain one admitted pass and requested scope.
- Admission tests separate same-head/same-ordinal members through request/receipt identity, preserve mixed hosted/local
  histories, and serialize competing terminal claims at the lineage owner. Public frontline run rejects forged or
  stale ready admission. Pending policy/source/actor changes cannot replace original admission; narrowly authorized
  pre-terminal runtime renewal remains possible. Failed local rerun uses a new generation and counts one completion.
- Hosted dispatch tests cover all three vehicle paths: admission-write failure prevents the effect, acknowledged
  replay uses the stored await action, and unacknowledged interruption/ambiguity stops without redispatch or fallback.
  Pending await retains original admission under changed config/actor; no external exactly-once guarantee is assumed.
- Command tests reject invalid target/admission or current-applicability bindings, missing or ambiguous producer
  identity, competing terminal producers, wrong sources, incomplete results, mismatched pass/policy/rubric/scope facts,
  and caller-supplied summaries. Clean attempts additionally reject missing producers, mismatched terminal outcomes,
  and caller-only clean assertions.
- Reducer tests cover all-refuted, minors-only, and material results, including a complete manual-chunk aggregate.
  Every finding in that aggregate contributes; missing aggregate completion or partial-only evidence refuses
  convergence. No independent partial producer union is accepted. Material unchanged-target responses re-enter with
  the returned completed-pass count and an empty next-pass attempt history; ceiling exhaustion stops before
  invocation. A verified material `reject` retains its severity and withholds convergence.

- Workflow and integration tests cover the triage-before-driver order, every outstanding-disposition arm, unchanged
  target continuation, changed-target rerouting after a fix, early approval of record-only sets, and removal of the
  old final-gate approval deferral.
- Methodology tests keep both copies of `review-triage.md`, `review-response.md`, and
  `integrate-work-unit.md` aligned on the reported/verified split, verified-only gating, and default presentation
  projection while preserving configured method overrides.
- Pass-ceiling tests retain exact-target/lane/count/next-pass override validation and prove an override grants only
  the named next pass. Complete and incremental terminal passes each count once; partial chunks, retries, status,
  and response replay do not. An effective complete upgrade changes coverage reporting without double counting.
- Conditional-capture tests cover explicit consent versus disposition-only approval, pending work across restart,
  failed capture writes and exact repair, unchanged/fixed-head binding from durable response evidence, withdrawal,
  supersession, incompatible member/count/head, and concurrent single-use admission. Consumed or invalidated capture
  cannot revive through old approval replay; pending-pass retry/fallback does not require a second permission.
- Native-navigation cases cover duplicate labels, titleless sources, bounded verbatim clipping, mixed thread/body
  capture order, canonical proposal reordering, stable evidence links, and metadata/result-digest tampering.
- CodeRabbit terminal-sequence cases cover a supplemental `COMMENTED` review followed by an empty `APPROVED` review for
  one admitted request/head, exact-once retention, approval-only clean, stable capture order, and refusal or exclusion
  for another request generation or head.
- Supersession store and command cases cover fresh complete approval over an unconsumed predecessor, record-only
  correction, partial hosted settlement with exact compatible carry, changed-action reopening, replay, conflicting
  successors, consumed-authorization refusal, ambiguous settlement refusal, and expected authorized fix dirt beside
  proposal materialization. Local, frontline, and hosted binding tests prove the predecessor cannot regain authority.
- Coverage cases prove complete basis plus a fresh bounded correction can converge, incremental-only evidence cannot,
  historical materiality is not a lifetime maximum, unreviewed material loci cannot disappear from scope, and missing,
  stale, cyclic, incompatible, or interrupted predecessor history cannot manufacture complete coverage.
- Carrier-relative amendment cases prove CodeRabbit's authenticated native predecessor-to-current range can satisfy
  the retained internal correction scope, while missing, newer, overlapping, or mismatched provider generations fall
  back without claiming coverage.
- Member scenarios replay the captured five-pass finding sequence `6, 7, 5, 2, 3`, a sibling clean after one pass,
  and the local incremental pass previously mislabeled complete. Material settlement keeps the first member
  outstanding; a valid fresh signal advances it; Owner acceptance remains a distinct exact-member route.
- Publication-spine coverage reaches a clean result at the cap, follows convergence attestation's returned action
  verbatim, then publishes with one projection commit and no extra evaluator call. Preserve non-default replay
  judgments through actual boundary and later metadata/staging failures after Candidate persistence. Plain and token
  re-entry retain the ordering guard; a premature projection commit refuses before policy/pass consumption. Explicit
  version-bound recovery preserves equivalent-head reuse; stale recovery and post-readiness replay cannot regress the
  boundary. Changed reviewable content reroutes; a subject-stable projection commit after readiness remains publishable.
- Public-command lifecycle scenarios resume without private schema imports or hand-built digests/counters. Each
  behavioral delivery member owns an executable production-path scenario; helpers and workflow text alone cannot
  satisfy the lifecycle. Member verifiers consume that evidence and do not accumulate corrective implementation.
- A methodology contract check keeps both copies of the adversarial method aligned on `Pass N of M`,
  `cap-exhausted`, stop-before-invocation, recommendation-not-authorization, and one-additional-pass semantics.
- Renderer tests exercise the actual command-returned report on proposal and approved replay, deterministic field
  order, source escaping, absent questions, and identical canonical identity under presentation-only changes.
  Declaration/fire-point checks cover direct ownership across planning, criteria verification, self-review,
  preparation, integration, delivery, and Errand callers, plus installation and override preservation.
- Self-review caller checks preserve source verification and complete-set approval before fixes without a producer
  reference or respond-command invocation. A bounded author-self-review exercise proves a standalone finding report
  can reach that approval without fabricating provider identity, receipts, or independent/convergence evidence.
- Behavioral evaluation separately exercises the irreducible agent layer: a source-contradicted `withstood` claim,
  an unsupported high-severity finding, a material finding already fixed, an exhausted pass with a tempting extra
  review, and a terse/native-labeled finding requiring a faithful standalone account. Retain bounded fixture inputs
  and source-grounded expected behaviors with the owning methodology tests. Run each in a fresh context with the
  applicable shipped method and caller instructions, using the current harness as an attended exercise rather than
  building an eval runner. Record observed output, expected behavior, and deviations as member verification evidence;
  disclose unavailable execution and route failures through normal review instead of claiming a green result.
  Static text/parity tests prove presence and consistency, not judgment adherence. These bounded observations do not
  prove universal reliability or depend on the unshipped `workflow-eval-harness`.

### Rollout order

1. Rename severity across the complete acceptance graph; align advisory attention, convergence, and cap semantics.
2. Extend native source admissions with missing pass/scope facts, logical counting, and truthful coverage.
3. Seal hosted terminal content in existing attempts, expose immutable reads, and bind proposals to exact producers.
4. Split reported/verified dispositions and add native navigation and command-rendered reports through all consumers.
5. Bind clean and findings attempts to their source operations, bind findings to approved disposition records, and
   derive the convergence summary.
6. Reorder all lane workflows, move every disposition approval before the driver, add unchanged-target
   `resolve-next-pass`, preserve outstanding responses, and reroute changed targets.
7. Close incremental/member convergence, then publication attestation continuation; keep Owner acceptance distinct.
8. Update adversarial coverage, convergence, cap visibility, tests, generated schemas, and both methodology copies
   at their owning delivery boundary, not as a final disconnected documentation sweep.

Boundary outcome is `stays one WU + delivery-plan candidate`. Structural task generation derives the delivery
partition from the reduced design and complete caller graph; earlier proposals retained in
`notes-review-signal-convergence.md` are history, not fixed boundaries. Producer sealing/read composition requires no
physical store generalization. Each member must be coherent with its complete strict-current caller graph, tests,
generated artifacts, and both methodology copies. Target headroom below 5,000 raw changed lines per member. This is
a review-size advisory, not a mandatory split boundary: a modest exceedance needs a recommendation and explicit
review-scope decision based on the actual change. Estimates alone authorize neither extra scope nor a review bypass.
Do not assume the separately captured delivery whole-target escape hatch is available.

Use the plan-segmentation design's reasoning manually: settle necessary substrate, then exercise complete producer,
convergence, member, and publication paths as early as their dependencies permit. Inventory every mandatory lifecycle
row, production callsite, and executable scenario before finalization. Assign criteria to the earliest visible member
boundary or cross-member seam, retain the shipped member-verifier form and one terminal WU verifier, and name the
retiring owner of any temporary scaffold. No unshipped segmentation machinery is required.

## Success Criteria

1. `withstood` is defined and prompted as decision-relevant attention without a finding, never correctness or
   clearance, and the primary-side claim-type verification gradient is explicit.
2. `critical > major > minor` is the only review-severity vocabulary across registered roots, hosted findings,
   adapters, fixtures, generated schemas, and review prose. Every enumerated impediment, gate-blocker,
   template-blocker, and `blocked` occurrence remains unchanged.
3. The adversarial method states completeness and convergence as separate rules. Every reported finding receives an
   approved disposition, while a disposed confirmed material finding still withholds convergence; all-refuted and
   confirmed-minors-only passes converge. A confirmed minor never withholds convergence, and a signal-rich minor
   surfaces as a completion-report observation rather than a driver state or a severity raise.
4. Every adversarial result exposes `Pass N of M` and every ended loop names its stop reason. At the cap, no
   evaluator is invoked without explicit approval for the named next pass, and each over-cap pass consumes that
   authority completely. An override approved with the disposition set binds only after the approved response is
   performed, against the head it produces. Incomplete work keeps permission pending; withdrawal, supersession, or
   incompatible bindings invalidate it. Durable lanes consume it at single-pass admission without revival on replay;
   advisory callers retain their non-producer evidence path. An absent capture leaves the existing request unchanged.
5. `arc review respond -` produces canonical proposals and source-bound approved records for local, frontline, and
   hosted result references. Durable items preserve provider-reported severity and ARC-verified severity separately;
   exact-source validation checks the reported lane, while gating and convergence use only the verified lane.
6. Every default producer-backed user-facing disposition report faithfully stands alone, presents ARC assessment
   before reviewer severity, assigns stable report-local `F1`, `F2`, … labels, separates adjacent findings visually,
   and combines the proposed disposition and correction under `Recommendation`. A `review-triage` override may replace
   or extend that projection without changing the canonical record or approval binding. Author self-review retains
   § 4's standalone non-producer report and complete-set approval, without requiring a distinct reviewer grade,
   canonical producer identity, or command-rendered output.
7. Hosted clean/findings outcomes persist as sealed complete snapshots in the existing attempt store, with stable
   producer identity, separate content identity, idempotent replay before and after settlement, and exact
   approved-disposition binding. A common result
   reader composes existing source stores; no second physical hosted-result store is required.
8. Every clean or findings attempt references its one exact durable terminal producer, and a findings producer
   additionally resolves its approved disposition record. Another pass on the same target has a distinct
   operation identity, while an exact same-attempt replay is idempotent. A failed local rerun advances native retry
   generation within the same logical pass. Missing, duplicate, stale, incomplete,
   wrong-outcome, wrong-source, wrong-target, wrong-pass, wrong-policy, wrong-rubric, or wrong-scope bindings fail
   closed. Historical producers retain their original exact target and remain reusable through validated current
   applicability; a new SHA alone causes no fresh review, pass consumption, or repeated unchanged judgment.
9. The driver derives confirmed count and maximum severity internally from the producer's complete approved finding
   set, including the existing terminal aggregate after manual chunk review. It accepts no caller-computed summary
   or union of independent partial producers. Every verified non-null severity contributes regardless of disposition;
   incomplete aggregate evidence cannot converge.
10. Local, frontline, and hosted lanes approve every complete disposition set before the driver, then perform
    approved responses. An unchanged material response starts the next pass or stops at the ceiling; a fix invalidates
    the old action, aborts any old chunk series, and reroutes the new exact target. No completion, continuation,
    suspension, or cap-exhaustion arm discards an outstanding approved disposition or carries stale review state
    forward.
11. Old development records are cleared or regenerated, all repository-owned callers and generated schemas use the
    strict-current shape, and the full applicable quality-gate suite passes.
12. Every local and hosted result preserves requested/effective coverage. Each distinct completed logical pass counts
    once at the existing lane/member ceiling, including incremental review; complete-coverage counts remain accurate.
    Retries, fallback, partial chunks, head movement, response replay, and status do not create extra completed passes.
13. Incremental convergence requires a validated prior coverage basis plus complete current correction-scope evidence.
    Inadequate coverage returns a typed selection action without losing approved work or bypassing cap authority.
14. Material settled findings keep their member outstanding until a fresh adequate no-material result or explicit
    Owner acceptance. Clean complete members advance after one pass. Owner acceptance, convergence, and a one-pass
    override remain distinct in durable state and the operator report.
15. Default producer-backed disposition reports retain bounded verbatim source labels when available, source capture
    ordinals, and originating references. Duplicate/titleless/mixed-origin findings remain identifiable without adding
    navigation fields to disposition items or changing canonical report order. Altered producer metadata changes
    result identity and its approval binding; report-only formatting changes neither.
16. Convergence attestation preserves the typed resume action and staged projection through publish-readiness; normal
    closeout commits the lifecycle projection once. Interrupted writes repair idempotently. Plain and token re-entry
    preserve the ordering guard; a premature head-changing projection commit refuses before another review is
    requested. Explicit version-bound recovery preserves applicable evidence without granting clearance. Stale recovery
    or later replay cannot regress readiness, and ordinary post-readiness projection commits retain existing authority.
17. A restarted session can complete the public review/response/continuation path from returned actions and durable
    references without importing internal code or inventing identities and counters. Behavioral member boundaries
    prove their mandatory lifecycle through executable production-path scenarios.
18. Default producer-backed reports are CLI-rendered from canonical data plus author judgment; the approved response
    command composes policy and selects response-before-continuation actions without an extra policy round trip.
    Workflow and method declarations match actual invocation ownership without code-review persistence on advisory
    planning/criteria reviews or author self-review. Bounded agent-behavior evaluations report observed adherence
    separately from static contract checks; no unshipped composition or evaluation engine is required.
19. Every canonical disposition proposal includes one approved verification scope in immutable set content and its
    report. A verified fix refuses verification narrower than that scope, forwards it as `approvedVerification`, and
    preserves it through ready-to-fix and changed-target continuation without yet narrowing Candidate verification.
20. A CodeRabbit request whose terminal sequence contains supplemental `COMMENTED` observations followed by an empty
    `APPROVED` marker retains those observations exactly once while preserving provider completion. Approval-only is
    clean, and no record from another request generation or head enters the result.
21. An approved disposition set may be superseded before incompatible fix consumption only by a fresh complete proposal
    and fresh approval over the same producer and target. The immutable predecessor and exact compatible settlement
    remain historical evidence; stale authorization cannot replay, changed actions reopen, ambiguous or consumed state
    refuses, and the public response path repairs the successor transition idempotently beside expected uncommitted fix
    work.
22. Every mutation that can advance a head-surviving continuation serializes on one stable continuation-owner key through
    the existing advisory-lock abstraction. A successor may append its own conditional next-pass authorization after
    predecessor invalidation; the ordered authorization history retains one current node and cannot revive, overwrite,
    or consume stale authority through concurrency or replay.
23. Fix response performance is durable independently of optional next-pass authority. Hosted completion requires both
    that fact and all required host-addressable settlement, accepts either arrival order, requires matching produced
    heads for host-addressable fixes, and never asks a record-only fix for a provider receipt or reports a partial
    conjunction settled.
24. Shipped `review-response` guidance exposes the fresh-proposal/fresh-approval supersession path, returned carry/reopen
    work, replay and refusal behavior, and the bounded expected-dirty-worktree rule without requiring direct state
    surgery or caller-invented identities.
25. CodeRabbit incremental correction coverage requires ARC's retained exact scope plus an authenticated provider-native
    predecessor-to-current range bound to the admitted request generation. A label, missing or ambiguous range,
    intervening generation, or mismatched baseline cannot establish coverage; local exact transport, frontline
    completeness, and explicit hosted complete upgrades retain their existing semantics.

## Open Questions

None at the design level. Logical-pass counting, validated incremental basis, existing-store sealing, native
capture-order projection, publication continuation, and non-producer self-review boundaries are specified above.
Task generation must establish complete caller coverage and coherent, reviewable delivery-member boundaries before
finalization. Surface estimated advisory exceedances for judgment rather than requiring an automatic split. Concrete
private helper names remain implementation details.
