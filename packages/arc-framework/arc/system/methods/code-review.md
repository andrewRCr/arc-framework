---
name: code-review
description: Shared procedures for reviewing a change set through its caller's typed lane actions
arc:
  methods:
    - review-model
    - self-review
    - frontline-review
    - standard-review
    - implementation-audit
    - review-triage
    - review-response
    - review-chunking
    - pull-request-format
related:
  - review-model
  - review-triage
  - review-response
override-active: false
---

# Method: code-review

> - **Workflow:** [run-errand][run-errand], [prepare-work-unit][prepare-work-unit],
>   [integrate-work-unit][integrate-work-unit], [deliver-stack][deliver-stack], and the author check in
>   [verify-work-unit][verify-work-unit].
> - **When:** Reviewing a change set, including a fresh target after approved repairs.
>
> - **Contract:** Execute only the caller's typed review action over its exact target. Shared procedures preserve
>   source verification, complete-set approval, performed-fix evidence, and separate authority for each next look.
>   The caller owns lifecycle state, its CLI dispatch, verification requests, and re-entry.

## code-review.override

[No override configured]

## code-review.default

### Signature and inputs

`code-review(action, exact target, caller continuation) → typed result + evidence | explicit stop`

Inputs are the returned action and immutable target/source bindings, the governing change-set intent and scope,
effective lane and method activity, caller-owned verification and commit context, and the exact re-entry command.
For an Owner stop, also supply the caller's available stop continuation or its explicit limit. Return the selected
verb's result unchanged, producer and disposition references when present, and any residual or refusal. This method
adds no stored operation or synthetic lane state. Each section below is an independent entrypoint. Apply
[review-model][review-model] when using any entrypoint.

The CLI carries [frontline-review][frontline-review] and [standard-review][standard-review] to their selected lanes;
[implementation-audit][implementation-audit] is the intent-and-implementation rubric, not an alternative lane.
Follow the selected action rather than manually invoking both lanes.

### Author check

**Signature:** Before verification or at `run-self-review`, take the aggregate diff and effective author activity;
leave a completed author check or its explicit inactive result before the caller advances.

If [self-review][self-review] is effectively active, execute it over the aggregate diff against the base branch.
Run its findings through [review-triage][review-triage] as a standalone non-producer report and obtain complete-set
approval before applying fixes. That approval is the author fix round's structured gate under
[DEV-RULES.ARC's review-increment invariant][review-increment-invariant]. Apply and verify only approved fixes and
request `arc check increment` once over them. Do not invoke the producer-backed response command or fabricate a
producer, receipt, or lane result. Commit with the caller's canonical `(code review)` context, reserving lifecycle
footers for ceremony commits:

> [!CAUTION]
> `commit-interlock` release — commit the approved fixes as `taskCommit`:

```text
<type>(<scope>): <what the approved fixes change>

Context: <the caller's context> (code review)
```

An inactive method supplies no completed check. The caller records `--self-review settled` only when the enabled
check ran; the verification caller runs this section before its merge gate so fixes precede verification evidence.

### Local operation

**Signature:** At a ready local action, resume, reduction, or operator repair, take the immutable operation and caller
continuation; leave its public typed result or explicit stop.

Launch only from `ready / launch-review`. The evaluator submits its status, result, findings, and run identity to
`arc review local attest -`; runtime-owned bindings come from the immutable operation. Resume with
`arc review local resume -` and reduce with `arc review reduce -`, preserving the caller's exact target and admitted
source/scope. A chunked action first follows the [chunk gate][chunk-gate]; only its aggregate is attested.
A command error carries no dispatchable state unless it supplies a remedy: render `remedy.text` and continue only
through `remedy.argv` with any `remedy.stdin` unchanged.

For frontline `operator-repair`, inspect the failure and operation ID. Another provider invocation requires explicit
Owner direction; on approval, rerun `arc review frontline resolve -` for a fresh ready resolution and then
`arc review frontline run -` with that resolution and `retryOfOperationId` from the prior operation. Retain the
caller's opaque resume command and invoke it only after the selected operation's typed protocol completes.

### Convergence

**Signature:** At a concluded standard look or a moved target, take its typed policy and coverage; leave the exact
next admission or the caller's completed-lane result.

Apply [review-model's convergence and permission rules][convergence]. Under `full-final`, only a converged complete
pass closes the standard lane; a converged fix check continues to a complete pass by configured rank. Incremental
closure requires the policy's proved chain. A pending or failed invocation spends no completed pass. Standard
ceilings count complete coverage only; frontline keeps its recorded completed-pass accounting.

After a material fix, follow the driver's `delegated-agent` action even when hosted sources rank first. Fix and delta
checks run locally; never force a hosted incremental request. After a converged look, configured rank selects a
complete successor. A local complete alternative carries `coverageAdmission: { requestedCoverage: "complete" }`
without correction scope. Never infer an incremental basis or carry an earlier review to a new head by agent judgment.

For a plain commit after convergence, follow the returned delta check without a coverage question. Under
`incremental`, it may close an Errand before or after its PR, the same checkpoint-advanced Candidate, or the published
singleton. Under `full-final`, it runs on an open-PR Errand or that Candidate and a complete pass follows; an Errand
before its PR takes complete review directly, and a published singleton takes the review-applicability stop, with a
local complete alternative to re-rooting. A bound delivery member follows its typed applicability route.

An Owner-directed additional complete pass needs the exact target, preceding producer, logical completed-attempt
count, and next ordinal. Retain the authorization on the selected admission; each later complete pass needs a fresh
decision, and the same decision covers its named ceiling override. A later material result returns to findings.
The caller carries its command-specific authorization fields; a status scope that admits no additional pass reports
that limit rather than manufacturing an admission.

### Successor decision

**Signature:** Before dispatch after a clean fix check under `full-final`, take the exact lane subject and available
Owner-stop continuation; leave a recommendation and the selected continuation, without launching a reviewer.

Run `arc review lane read -`, deriving the request from `arc review lane read --schema`. For a delivery member, supply
its exact head as `memberHeadObjectId`; otherwise use the caller's Candidate or Errand subject. Follow a refusal's
remedy. When `payload.lastLook` has `coverage: incremental` and `outcome: clean`, use `payload.facts` for advisory
judgment: recommend another complete pass while new defect classes keep appearing in previously read code or a fix
round introduced new design; otherwise recommend stopping. Prefer a different source for a successor pass. State the
recommendation, its reasons, and what would change it. A complete pass never replaces a required fix check.

Honor an existing decision for this exact successor across unchanged re-entry. Otherwise, when recommending stopping,
use the [stop line][stop-line] before source dispatch. An unavailable stop is a disclosed limit, never a clean result
or an invented terminus. The pre-publication caller also runs this check when a non-null hosted-first `reservation`
appears before convergence verification or publication, retaining that reservation when review continues.

### Coverage selection

**Signature:** At `coverage-required / select-coverage` or `select-coverage`, take the typed response obligation and
listed choices; leave one selected coverage admission or the caller's accepted stop.

While `payload.responseRequired` is true, complete the [findings round][findings-round] first, including a converged
fix check's minor fixes. Once false, recommend a listed choice from the latest confirmed signal and exact correction.
Offer an available Owner stop alongside the next look, disclosing when approved material fixes have not been
re-examined. A decline leaves the approved set unchanged and follows the caller's stop continuation.

Off delivery, invoke ordinary `arc review local prepare -` for its question. Render
`payload.coverageSelectionAction.interactionText` and the listed choices verbatim. On delivery, status owns that
question: render `coverageSelectionAction.interactionText` and carry its returned admission unchanged into prepare.

> [!IMPORTANT]
> `workflow-interlock`: Stop at the coverage offer. Await the Owner's listed choice or explicit acceptance of an
> available exact stop before continuing review.

Re-enter the same offer/request with the listed choice, as `coverageAdmission` for local prepare or through status's
returned command for that pair. Complete the [chunk gate][chunk-gate] after coverage is known and before the call
carrying the selection. Carry `policyJudgment.scopeMode` and the procedure's lane scope when required. Dispatch the
returned state again; only `ready / launch-review` admits evaluation. Never ask the coverage question again after
status selected it, infer coverage from a finding count, or combine coverage with next-pass authorization.

### Chunk gate

**Signature:** Before a carrier runs, take its exact chosen review range and any bound scope selection; leave a
resolved attention disposition and the selected scope or a stop.

An Errand stays whole-target and takes no chunk action. On delivery, status measures the selected pass after coverage
is chosen; use that exact result at the moved head, without an additional whole-member measure for a fix check.
Off delivery, measure once coverage is known: first/complete review uses the whole target; a fix check uses
`diffBaseSha: correctionScope.predecessorHeadSha` and the current head with the target's kind and base ref. That gate
binds the fix range. A private member's retained whole-member selection serves only complete review.

For pre-publication, keep a recorded `stays one WU` decision silent while its evidence is semantically unchanged.
Otherwise invoke `arc review changeset resolve -` with the exact range and its bound `scopeSelection`.
`disabled / none`, `below-threshold / continue-review`, `scope-selected / continue-review`, and
`evidence-unavailable / continue-review` continue without attention text. `delivery-bound / continue-review` renders
its action and uses the bound plan without also offering chunks. At `consider-chunks / select-review-scope`, render
`recommendedActionText` verbatim and apply [review-chunking][review-chunking].

No carrier runs with unresolved exact-target attention. A bounded selection must return `scope-selected`; an explicit
capable whole-target choice closes attention while retaining `consider-chunks`. Delivery's action must carry its exact
chunked selection or the exact forced hosted whole-target invocation selected by the Owner. A stale or missing
selection returns to the owning route before any carrier. Carry selected scope through local prepare and caller
re-entry. For a chunked local action, run contract-closed chunks, the dedicated seam, and a fresh aggregate against
the returned review root and rubric; attest only the aggregate result, never partial chunks or seam reports.

### Ceiling override

**Signature:** At `obtain-ceiling-override`, take the exact consequence and lane subject; leave one explicit named
admission authorization or the caller's stop, without requesting a pass.

For the standard lane, run the schema-derived lane read with the same exact subject and member selector. Follow a
refusal's remedy. From `payload.facts`, show `completePasses` against `ceiling` and `fixChecksSinceLastComplete` rounds.
Recommend another complete pass or stopping with expected signal, cost, and what would change the recommendation.
The ceiling bounds autonomous spending, not advice, and the recommendation grants no pass authority.

Render the exact consequence and any supplied `terminusAction.offer.interactionText`, then stop. Only explicit
approval of that consequence admits its one complete pass. Re-enter the caller's same target/lane or status scope with
the returned consequence serialized unchanged; use only a lane admission that caller supports. Retain
`conditionalPassAuthorizationId` and its returned `payload.policyRequest` unchanged through performance and rerouting;
never reconstruct the identity. Fix and delta checks neither spend nor inherit complete-pass authority.

### Findings round

**Signature:** At a producer-backed findings action, take its exact source, findings, target, and caller verification
route; leave a durably performed response and re-entry or the selected explicit stop.

If a durable approved response is already pending, resume its exact selected author leaf from the retained
producer and approved set. Reconstruct a lost proposal only from that bound source and obtain approval still owed;
never reapprove or replay a new producer merely to resume. Otherwise:

Run [review-triage][review-triage] to verify source and compose the complete proposal, including effective
`proposal.severityGatingPolicy`, recommended `proposal.proposedVerification`, and separate advisory `report` inputs.
Submit it through the first `arc review respond -` call. Emit `payload.dispositionReportText` verbatim unless the
effective triage override changes presentation; its provisional header and one Decisions block already carry the
assessment and successor recommendation. Obtain complete-set approval over the exact report and canonical set before
any mutation or commitment. A complete no-action record-only set also needs approval for its exact target before
continuing. The approver need not repeat the digest. Submit the exact approved set and its advisory
fix tags through the second call; follow only its returned action through [review-response][review-response].

That approval is the fix round's structured gate under [DEV-RULES.ARC's review-increment
invariant][review-increment-invariant]. Apply only the approved fixes, preserving
`approvedVerification` through re-entry and changed-target continuation. The scope never selects fewer checks. Run
the caller's review-fix quality request and verification over the actual new target. Clearance and merge authority
never carry to a moved head. A changed scope, non-mechanical failure, ambiguous host state, or new finding returns to
the approver. For a bound delivery, execute its typed correction/authoring continuation rather than substituting
manual writes or another checkout. Complete any [before-fix settlement][hosted-settlement] before changing the head.

Commit the verified fixes atomically where the configured interlock releases them; manual settings retain their stop:

> [!CAUTION]
> `commit-interlock` release — commit the approved fixes as `taskCommit`:

```text
<type>(<scope>): <what the approved fixes change>

Review disposition set: <identity>
- <finding identity>: <verified severity> / <disposition> — <rationale>

Context: <caller's task-list filename or standalone> (code review)
```

Once the fix is committed and the worktree is clean, replay the exact approved `arc review respond -` request with
`verifiedFix` carrying the approved applicability and actual verification evidence, leaving out `supersedes`.
Require the caller's exact advanced/current response state before any push interlock releases. This is the performed
response evidence, never a new proposal or provider review. An uncommitted replay follows its commit-then-replay remedy.
A Candidate response may stage its required record commit; the caller completes that under the same approved increment
before Candidate-currentness or delivery-preparation reads. The typed delivery controller owns any machine commits.

Then push when the caller's route requires it and the configured interlock releases:

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `origin <caller's reviewed branch>`.

Perform the remaining [hosted settlement][hosted-settlement] when supplied, including description upkeep after the
pushed fix. Retain any returned conditional policy request unchanged for its named admission. A response with no fix
returns `settled | already-settled / continue-review`; use its `payload.policy` when present. Re-enter through the
caller's own status/resolve continuation and never feed the same findings to the driver a second time.

### Hosted await and settlement

**Signature:** At a hosted request, await, or settlement action, take its exact handle and response plan; leave the
returned typed continuation or explicit stop without inventing host authority.

Pass `review-hosted-request` actions unchanged to `arc review hosted request -`. Pass `requested / await` actions
unchanged to `arc review hosted await -`; omitted timing uses configured bounded-call defaults. `pending / await`
retains the newly returned `action` unchanged for one more bounded call, without an agent polling schedule.
Repeat only this typed continuation until `inspect-or-extend` or a terminal outcome.
`pending / inspect-or-extend` retains the request for the diagnostic below, then stops. Submitting it unchanged checks
once; explicit direction may add `continueAfterAttention: true` for one more bounded call. Neither requests another
review or records a provider outcome.

For either pending result, run one short exact-head diagnostic before continuing or stopping:

```bash
arc review checks await \
  --repository <action.handle.target.repository> \
  --pull-request <action.handle.target.pullRequest> \
  --head-sha <action.handle.target.headSha> \
  --timeout-ms 10000 \
  --poll-interval-ms 10000
```

Surface failed required `checks` and `diagnosticFailures`. Begin read-only diagnosis by inspecting every returned
`failureLogs.logs[].path`; surface `failureLogs.failures` when retrieval is partial or unavailable.
`unavailable / retry` surfaces `cause`, `detail`, current checks and diagnostics, retains the same hosted action, and
ends this foreground attempt. `pending / await`, `green / complete`, and `not-required / complete` retain that action;
only it re-enters hosted await. `failed / stop`, stale or mismatched targets, and blocked reads stop with it intact.
This observation neither settles review, feeds the driver, moves the head, nor releases the draft lock. Before any
head-moving push while the action is pending, conclude hosted await and handle its findings so they join that push.
At `inspect-or-extend`, only explicit Owner direction may push while giving up that result.

Feed clean and safe-unavailability outcomes through the caller's retained driver/status route. Findings enter the
[findings round][findings-round]. `reviewOperationId` identifies the producer; `hostedResultId` identifies content.
The caller retains the authorizing logical pass coordinate for ordinary resolve; delivery progress persists admitted
attempts and re-enters status. Ambiguous delivery, stale targets, malformed output, source failure, and terminal
failure stop; never replay an uncertain request.

#### Hosted settlement

**Signature:** At an approved settlement plan or pushed-PR description update, take the exact request and any
supplied immutable actor/phase entries; leave completed upkeep and exact settlement or its retained retry/stop.

With no settlement plan, perform only the description upkeep below.

Follow [review-response's channel boundary][channel-boundary]. For `reply-and-resolve`, invoke
`arc review hosted settle -` for each active phase ID with `payload.hostedSettlementPlan.actorIdentity` unchanged.
Complete every `beforeFixFindingIds` entry against the unchanged originating `target` and `fixTarget: null` before
any approved fix changes the head. Return control to the ongoing [findings round][findings-round] for its approved
fix, verification, commit, verified-fix replay, and push; never restart its proposal. After-fix settlement waits for
that performed response.

After a pushed fix, load [pull-request-format][pull-request-format] before editing the open description. Update every
section and qualifying decision the fix made inaccurate. For a design link, run `git diff --quiet <pinned> HEAD --
<paths>` over every linked path of a layered design, and `git merge-base --is-ancestor <pinned> HEAD`. Re-pin when
either test fails; diagnose command errors instead of treating them as successful checks. With no design link, skip
those tests. On GitHub, use `gh pr edit <n> --body-file <path>` before review re-entry. The delivery caller also applies
this upkeep to the terminal request after a delivery-owned pushed correction and before its next action.

Then settle every `afterFixFindingIds` entry against the originating `target` plus the verified changed `fixTarget`.
For a delivery member, require `delivery-member-advanced` or idempotent `delivery-member-current` and pass
`payload.hostedFixTarget` unchanged; never derive it from the checkout.

A `not-applicable` finding appears in neither phase: no hosted settle, reply, resolution, or compensating summary. At
`head-pending / retry`, surface `remedy.text` and end this attempt; later re-entry passes `remedy.stdin` unchanged
through `remedy.argv`. `already-settled / complete` advances the durable attempt only after the verb verifies the exact
approved reply, actor, comment, and resolved thread with no host mutation; every stop remains a stop. Follow the
approved response continuation only after all required phases complete.

### Stop line

**Signature:** When the Owner declines further review or a successor recommendation says stop, take the exact current
coordinates, performed-response state, and caller's stop capability; leave its accepted-risk continuation or a limit.

Keep the accepted-risk decision distinct from clean convergence. Surface the latest pass, approved dispositions and
settlement, complete current change, delta since that pass, verification, and outstanding risk. An unfinished response
must complete before a coverage-required stop can take effect. Honor existing exact-target authority once, without a
second confirmation on unchanged re-entry. The caller authenticates and records the decision through its own route.

Pre-publication carries `lanes.standard.terminus: { mode: "owner-accepted" }` after explicit Owner
acceptance. Work-unit delivery uses the supplied `terminusAction` and its exact acceptance continuation. The published
singleton and member-target route take no new Owner terminus: state that limit and follow their typed action.
Do not turn a declined pass into completed review, weaken carrier-native requirements, or invent a stop capability.

#### Errand stop

**Signature:** At an open Errand PR's accepted-risk offer, take the current claim, PR/base/head, and completed
response evidence; leave exact conversational authority for the caller's reviewed merge lane or an explicit stop.

When the Owner explicitly asks to end further standard-review spending, declines at a disposition turn the pass a fix
triggers, or redirects an `approval-required / obtain-ceiling-override` decision, or the clean-fix-check successor check
recommends stopping, present one exact offer before treating that direction as approval. A settled-response
`coverage-required / select-coverage` also admits this offer; while `payload.responseRequired` is true, perform the
approved response first. Before PR creation defer the stop to the open PR. Re-read `arc review status --target
<targetRef>` to validate the current Errand binding; `review-required` is expected, but a refusal or pending/response
action stops. Name the current Errand key and claim, repository and PR, base ref and OID, head SHA, at least one
completed same-claim standard-review pass and its disposition/settlement state, the complete current PR diff, and the
change since the last completely reviewed head. State the residual risk and that `arc review status` will remain
`review-required`: this is Owner acceptance, not a clean provider result or an ARC terminus. Stop if any review request
is pending, a known finding lacks an approved disposition or required channel settlement, an authorized fix remains
unfinished, the earlier reviewed head is not an ancestor of this head, or the evidence is incomplete. Ask for explicit
acceptance of that exact residual risk; an earlier approval to fix, commit, or spend a pass does not answer this offer.

On acceptance, request no further standard-review pass for those exact coordinates and continue to the reviewed merge
lane through the caller, not auto-merge. Do not submit a fabricated `clean` attempt, `terminus`, or `ceilingOverride` to
the review commands. Recheck the Errand claim, PR, base OID, head, and known review/response state at the caller's
final-head check and immediately before release. A changed claim, PR, or head, or a new finding, voids this decision and
returns to this exact offer. A base that alone moved keeps it under the disjoint-drift condition: the accepted base OID
is an ancestor of the new base OID, and `arc base drift --json` reads the exact accepted head with `movement: disjoint`.
Name the new base OID at the next report. A rewound base or any other drift reading voids it. This conversational
authority is not durable: after a context loss or session re-entry, obtain it again if the exact approval and its
coordinates cannot be recovered.

---

[run-errand]: ../workflows/arc/supplemental/run-errand.md
[prepare-work-unit]: ../workflows/arc/work-unit-lifecycle/prepare-work-unit.md
[integrate-work-unit]: ../workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[deliver-stack]: ../workflows/arc/supplemental/deliver-stack.md
[verify-work-unit]: ../workflows/arc/work-unit-lifecycle/verify-work-unit.md
[review-model]: review-model.md
[convergence]: review-model.md#convergence-and-permission
[self-review]: self-review.md
[frontline-review]: frontline-review.md
[standard-review]: standard-review.md
[implementation-audit]: implementation-audit.md
[review-triage]: review-triage.md
[review-response]: review-response.md
[review-chunking]: review-chunking.md
[pull-request-format]: pull-request-format.md
[channel-boundary]: review-response.md#keep-response-etiquette-at-the-channel-boundary
[review-increment-invariant]: ../rules/DEV-RULES.ARC.md#review-increment-invariant
[stop-line]: #stop-line
[findings-round]: #findings-round
[chunk-gate]: #chunk-gate
[hosted-settlement]: #hosted-settlement
