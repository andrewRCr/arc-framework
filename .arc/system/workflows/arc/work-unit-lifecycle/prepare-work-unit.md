---
purpose: Prepare a verified Candidate for publication through private review, convergence, and the publication transition.
audience: agent
arc:
  methods:
    - classify-review-risk
    - self-review
    - frontline-review
    - standard-review
    - review-chunking
    - review-triage
    - review-response
    - commit-footer
---

# Workflow: Prepare Work Unit for Publication

Prepare a verified Candidate for public integration. Verification remains the final execution task; this workflow
starts from its durable Candidate attestation, settles private review and convergence, then schedules publication.

**When to use:** All tasks in `tasks-{name}.md` are marked `[x]`, `active/meta-{name}.md` shows
`**State:** Active`, and the typed integration boundary projects a Candidate locus.

> [!NOTE]
> **No Candidate?** Finish [`verify-work-unit.md`](verify-work-unit.md), including `arc attest`. **Already
> Integrating?** Publication already began; load [`integrate-work-unit.md`](integrate-work-unit.md).

---

## 1) Resolve the Candidate preparation locus

Invoke `arc status {name} --json` and require the Candidate-bearing Active boundary. Session initialization and
recovery project this state as `sessionType: prepublication` with `workflow: prepare-work-unit`; never infer it from
`Current Workflow`, `Next Action`, or SESSION-NOTES.

Before composing review, inspect whether the Candidate has plan-owned private member targets:

```bash
printf '%s\n' '{"entryMode":"prepublication"}' | arc delivery entry inspect -
```

Dispatch only on the typed result. `not-applicable` continues ordinary singleton preparation.
`validate-canonical` carries its exact `planId` into [Deliver Stack][deliver-stack]
§ Prepare private delivery candidates; complete only that bounded authoring and gate-preparation section, then return
here without publishing. `refused` renders `recommendedActionText` and stops. Any other result stops as a
pre-publication entry contract violation.

Re-enter every review operation only through the public typed protocol in Step 2. Retain any returned operation ID
and follow its last `state` / `nextAction`: resume local work with `arc review local resume -`, and re-invoke the
owning idempotent verb for frontline, response, reduction, or pre-publication composition. When no public action can
advance, leave the Candidate in `Active` and state the exact source change or direction required for re-entry.

## 2) Settle pre-publication review

From the local Candidate branch, compose the change-set routing facts — content kind, risk, determinacy,
ownership, and surface authority — as the author judgment the repository cannot read. The lane routing target, the
routed `standardReview` projection, the work unit's `Class`, and each lane's effective method activity are composed
from repository state by the command below; never assemble or restate them here.

**Method fire-point** · [`classify-review-risk`][classify-review-risk]: Load and apply it to set the risk fact.

Invoke `arc review pre-publication <wu>`, carrying the routing facts as `--change-set`, each lane's scope
mode and one-run invocation override, and any approved ceiling override as `--lanes`, and a
completed author self-review as `--self-review settled` only when the effective method is active and ran; omit the
option when the method is inactive. A user-directed skip of an enabled frontline lane is
`lanes.frontline.invocation: { mode: "skip" }`; it cannot suppress the standard lane. An explicit Owner selection
of a configured standard source is `lanes.standard.invocation: { mode: "force", sourceId: "<source-id>" }`; configured
order remains the default when it is absent. After the active Work Unit Owner explicitly accepts the current review
terminus, carry `lanes.standard.terminus: { mode: "owner-accepted" }`. The command authenticates that Owner and reports
a distinct `owner-accepted / none` conclusion; it never means clean, converged, no-op, or evaluator-satisfied. The
Owner's decision is the authorization, so do not ask for a second confirmation while the exact Candidate remains
current.

For a singleton Candidate lineage, frontline is an opening phase. Its configured allowance applies while that phase is
open. An accepted initial skip or durable standard admission closes it; changed heads and validated Candidate
supersession do not reopen it. Follow the typed pre-publication continuation across a re-root: inherited complete
standard-review passes still count toward the ceiling, while older producer evidence remains bound to its original
target.

A standard look converges when it is clean or its approved dispositions fix no confirmed `critical` or `major`
finding. Under `full-final`, only a converged complete pass replays as complete; a converged fix check still requires
complete review.

After a plain commit, when the Candidate checkpoint's `covered` or `targeted-check` advances the same Candidate, follow
the local delta check without a coverage question. It closes the standard lane on convergence under `incremental`; under
`full-final`, a complete pass follows by configured rank. `changed` requires a new Candidate and keeps complete review.
For a local complete pass instead, supply `coverageAdmission: { requestedCoverage: "complete" }` with no correction
scope. An additional hosted pass after an incremental delta converges takes the authorization below.

If the Owner explicitly authorizes another named complete standard pass after a converged complete pass under
`full-final`, or after convergence under `incremental`, carry its exact head, preceding producer, logical
completed-attempt count, and next ordinal as `lanes.standard.additionalPassAuthorization` in `--lanes`. This admits that
complete pass only; each further complete pass needs a fresh decision. If it is above the configured ceiling, the same
explicit decision covers the named ceiling override. A later material result follows the ordinary response route.

Supply `--change-set`, `--lanes`, and `--self-review` on the initial invocation and whenever the procedure explicitly
requests new author judgment. After every lane operation, re-enter through the envelope's typed pre-publication
continuation. For `ready / run-frontline`, `nextAction.command` advances into the frontline resolver; retain
`nextAction.request` and `nextAction.authorizationRequest`, submit the initial request as JSON stdin to that command,
and retain `nextAction.resumeCommand`. Submit the authorization request only after explicit approval of an
`offered / obtain-authorization` result. Invoke the resume after the frontline operation's typed protocol completes.
For every other policy action, `nextAction.command` is the continuation. The opaque resume carries judgment the
repository cannot recover and confines a one-pass frontline ceiling approval to its selected exact head. It drops
`standard.terminus` after `candidate-fix-pending`, because the response changes the reviewable Candidate subject and
requires fresh Owner direction. Once `owner-accepted` lands, the durable boundary carries it through convergence; do
not restate it. For a canonical delivery, each re-invocation recomposes the first outstanding exact member in plan
order. Follow the returned exact target and policy action; never enumerate members or preserve a separate review
cursor in prose.

The envelope's `target` is the exact target every exact-target operation below binds against. A null `target`
means the checkout could not compose one; resolve the returned advisory before invoking any operation. The lane
`target` inside `policy` routes lanes and does not identify a review.

Measure the range the next pass reviews once its coverage is known. A first or complete pass uses the envelope's whole
`target`. For a local coverage offer, take the listed choice before measuring and before re-invoking local prepare with
that choice. A fix check uses the envelope's `{ kind, baseRef, headSha }` with
`diffBaseSha: correctionScope.predecessorHeadSha`; its chunk gate binds that fix range, not the whole contribution.
After a private member is rematerialized, its retained whole-member selection serves only complete review; measure a fix
check's range afresh.

Before invoking or rendering review attention for each new review range, read the latest planning decision prose for the
selected `assess-boundary-fit` outcome and its evidence basis. A recorded `stays one WU` decision stays silent while
evidence is semantically unchanged; invocation, elapsed time, and restatement are not material deltas. Otherwise invoke
`arc review changeset resolve -` with that review range's `{ kind, baseRef, diffBaseSha, headSha }` and any selection
bound to that exact range as `scopeSelection`, then dispatch only on its typed state/action pair:

- `disabled / none`, `below-threshold / continue-review`, `scope-selected / continue-review`, or
  `evidence-unavailable / continue-review` — continue without attention text.
- `consider-chunks / select-review-scope` — render `recommendedActionText` verbatim, then apply
  [`review-chunking`][review-chunking].
- `delivery-bound / continue-review` — render `recommendedActionText` verbatim and use the bound delivery plan;
  never also offer chunked review.

Select whole-target or chunked scope separately for frontline and standard review. Carry a selection by
re-invoking the procedure with it in `--lanes`; never recompute thresholds in prose.

No review carrier may run while the latest exact-target `consider-chunks / select-review-scope` result is unresolved.
Re-invoke the procedure with the exact-target scope selection. A selected bounded-review route must return
`scope-selected / continue-review`; an explicit capable whole-target choice closes the attention disposition while
retaining `consider-chunks`. A stale or missing selection stops before the frontline or standard action.

At `candidate-fix-pending` with `nextAction.command: arc review respond -`, the pass may already be
`pass-complete`, `owner-accepted`, or `coverage-required`, but its current findings response is still unfinished. Use
`nextAction.responseOperationId` and `nextAction.responseSource` to resume that exact producer through the typed
`arc review respond -` action and [`review-response`][review-response]. Reconstruct a lost proposal from this bound
source and obtain any approval still required; continue an existing approved response from its durable disposition.
Re-enter pre-publication only after durable response completion. The pass conclusion does not authorize publication
while this response remains pending.

**After a clean fix check.** On a `full-final` standard lane, before `ready / local-prepare`, run
`arc review lane read -` with its request derived from `arc review lane read --schema`. Also run this check when a
non-null `reservation` appears at `candidate-convergence-verification-pending` or `candidate-publish-ready`, before
`run-convergence-verification` or `publish-candidate`. For a delivery-member target, supply its exact `target.headSha` as
`memberHeadObjectId`. Follow a refusal's remedy. When `payload.lastLook` has `coverage: incremental` and `outcome: clean`,
use `payload.facts` for advisory judgment: recommend another complete pass while new defect classes keep appearing in
previously read code or a fix round introduced new design; otherwise recommend stopping. Prefer a different source for
a successor pass. State the recommendation, its reasons, and what would change it. Honor an existing Owner decision for
this exact successor across unchanged re-entry. Otherwise, when recommending stopping, offer the Work Unit Owner's
accepted-risk terminus before continuing. On acceptance, re-enter the procedure with
`lanes.standard.terminus: { mode: "owner-accepted" }` in `--lanes`; on a choice to continue review, follow the original
action. A complete pass never replaces a required fix check.

The non-null `reservation` is the driver's `awaiting-change-request / open-change-request` continuation. Retain the
hosted-first reservation when continuing review and follow the envelope through `candidate-publish-ready`.

A null `policy` means no lane operation is open — follow the envelope's `nextAction.kind`, one of
`run-self-review`, `run-convergence-verification`, or `publish-candidate`. Otherwise follow only the `policy`
state/action pair:

For `run-convergence-verification`, use only the typed action's `nextAction.requiredScope`: `focused` requests
`arc check gate push --range --force`; `full` requests `arc check gate merge --force`. Retain
`nextAction.verificationKind`, obtain a fresh verification evidence reference, replace only the
`{verificationEvidenceRef}` operand in `nextAction.attestArgv`, and invoke that exact argv. Never select a
verification scope in prose or substitute the Candidate root task-list reference. Complete the final forced merge
check without an intervening commit. Keep every projection staged while the returned action re-enters prepublication,
through `candidate-publish-ready`; the publication transition in Step 3 is the single lifecycle projection commit.

- `skipped | no-op | pass-complete / none` — lane complete.
- `owner-accepted / none` — standard lane complete by the Work Unit Owner's explicit accepted-risk decision.
- `ready / run-frontline` — submit the envelope's `nextAction.request` as JSON stdin to `nextAction.command` and
  retain both `nextAction.authorizationRequest` and `nextAction.resumeCommand`. On
  `offered / obtain-authorization`, surface the exact one-pass consequence and ask `Approve (or redirect)?`; only
  approval submits `nextAction.authorizationRequest` to the same command. Continue only from
  `ready / run-frontline`, then run `arc review frontline run -` with that resolution, the target's
  `{ kind, baseRef, diffBaseSha, headSha }` projection, and `responseBinding` when the pre-publication envelope
  supplies it. Invoke the retained resume only after the frontline operation's typed protocol completes.
- `ready / local-prepare` — invoke `arc review local prepare -`, carrying the chunk gate's selected scope as
  `policyJudgment.scopeMode`, as well as in the procedure's `--lanes` on re-entry.
- `coverage-required / select-coverage` — while `policy.payload.responseRequired` is true, enter the disposition
  protocol below. Once false, offer the Owner's stop alongside the next pass, with a recommendation and disclosure that
  the approved material fixes have not been re-examined. Carry explicit acceptance through `lanes.standard.terminus`
  as above. Otherwise invoke ordinary `arc review local prepare -` for the next pass and its coverage question.
- `findings / respond` — enter the disposition protocol below.
- `approval-required / obtain-ceiling-override` — for the standard lane, run the lane read with the same subject and
  member selector as above; follow any refusal's remedy. From `payload.facts`, show `completePasses` against `ceiling`
  and the `fixChecksSinceLastComplete` rounds; recommend another complete pass or stopping, with the expected fresh
  signal, cost, and what would change the recommendation. The ceiling bounds autonomous spending, not advice. Surface
  the exact complete-pass consequence and `Approve (or redirect)?`; the recommendation grants no pass authority.
- `chunk-pending / continue-chunks` — continue the selected local chunk series.
- `stale-target / select-scope` — rerun chunking against the current target.
- `blocked | unavailable | invalid-override / stop` — surface diagnostics and stop.

When local prepare returns `coverage-required / select-coverage`, show
`payload.coverageSelectionAction.interactionText`, its listed choices, and a recommendation grounded in the latest
confirmed signal and exact correction. Re-invoke the same request with the listed choice as `coverageAdmission` after
measuring its range and carrying the selected scope as `policyJudgment.scopeMode`; dispatch the returned state again. An
incremental choice advances the logical attempt number without spending a complete pass against the ceiling; do not
infer coverage from a finding count or combine the choice with the Owner's next-pass authorization. Launch and attest
only from `ready / launch-review`.

Dispatch local operations only through public typed actions. The evaluator submits status, result, findings, and
run identity to `arc review local attest -`; runtime-owned bindings come from the immutable operation. Resume with
`arc review local resume -`, reduce with `arc review reduce -`, and submit approved dispositions with
`arc review respond -`. A command error envelope carries no dispatchable state unless it names a `remedy`: then render
`remedy.text` and continue only through `remedy.argv`, passing any `remedy.stdin` unchanged.
For frontline `operator-repair`, inspect the reported failure; another provider invocation requires an explicit
Owner decision. On approval, re-run `arc review frontline resolve -` for a fresh ready resolution, then
`arc review frontline run -` with that resolution and `retryOfOperationId` from the prior operation.

For every durable producer finding, run [`review-triage`][review-triage] to verify the source and
[`review-response`][review-response] to compose the complete proposal with the effective policy in
`proposal.severityGatingPolicy` and recommended `proposal.proposedVerification`. Submit that proposal through the
first call:

```bash
arc review respond -
```

Emit the returned `payload.dispositionReportText` verbatim unless the effective triage override changes
presentation. Co-present `payload.provisionalPassAssessment.summaryText` and an agent cost-and-signal recommendation
for stopping or requesting a named next pass. This assessment is provisional until the approved response and policy
continuation establish the verified action. Keep disposition approval distinct from any later one-pass ceiling
authorization. Obtain complete-set approval over that exact report and canonical set before any mutation or
commitment; the approver need not repeat its canonical digest. That approval is the fix round's structured gate:
where the configured interlocks release them, the fix's commit, push, and approved settlement follow without another
stop ([DEV-RULES.ARC § Review-Increment Invariant][review-increment-invariant]). Submit the exact approved set
through a second call:

```bash
arc review respond -
```

Follow only its returned action and use [`review-response`][review-response] to perform the approved response. A
`ready-to-fix` authorization carries `approvedVerification`; preserve it through re-entry and the changed-target
continuation. The scope does not select fewer checks here. Approved fixes request `arc check gate commit`, commit
atomically, and produce a new target. The `verifiedFix` replay attests the approved scope as performed, so before it a
`focused` scope also requests `arc check gate push --range --force` and a `full` scope `arc check gate merge --force`
over that target; the Candidate's convergence verification repeats it. Disclose review applicability from the exact
delta: `targeted` for confidently narrow non-interacting record or lifecycle changes, `focused` for a bounded
interaction, and `full` for behavioral, authority, contract, materially interacting, or uncertain changes. Clearance
never carries. If the response carries `conditionalPassAuthorizationId`, retain its returned `payload.policyRequest`
unchanged; the next pre-publication admission projects its exact ceiling override into the selected lane request. On the
standard lane it admits only a complete pass; fix checks and delta checks cite and spend none. A `ready-to-fix /
apply-fix` response carrying `payload.authoring` binds a Candidate-bound private-member fix. Author only in its exact
`authoring.checkoutPath`, `authoring.ref`, and `authoring.head`; a missing or different locus stops before mutation.
Never author this fix in the disposable member checkout. After the fix commit, re-invoke the exact approved `arc review
respond -` request with `verifiedFix` carrying the approved applicability and verification evidence. Require
`candidate-advanced / continue-review` or idempotent `candidate-current / continue-review`, then commit its staged
Candidate response as `taskCommit` under the same approved increment before any Candidate-currentness or
delivery-preparation read.

> [!CAUTION]
> `commit-interlock` release — commit the approved fixes as `taskCommit`:

```text
<type>(<scope>): <what the approved fixes change>

Review disposition set: <identity>
- <finding identity>: <verified severity> / <disposition> — <rationale>

Context: tasks-{name}.md (code review)
```

After an approved fix changes the Candidate, rerun Step 1 and repeat [Deliver Stack][deliver-stack]
§ Prepare private delivery candidates when directed before re-invoking pre-publication review. For a response
carrying `authoring`, its `deliverySuffixReconstruction: after-candidate-advance` value requires that reconstruction
to wait until the Candidate response has advanced.

Proceed only from `candidate-publish-ready`; its durable boundary carries any hosted-first reservation or exact
Owner-accepted terminus into publication without classifying either as settled, no-op, or clean.

## 3) Schedule publication

```bash
arc publish {name} --json
```

The verb reads `Next Action` from the boundary it writes and `Last Completed` from the last `[x]` task. Supply
`--last-completed "{work}"` or `--action "{pointer}"` only when that read refuses or is wrong.

The executor fires `Active → Integrating`, writes the composed orientation, regenerates ROADMAP, and stages the
publication boundary with any reservation. An advisory-only reconcile stops before transition; edit and rerun, or
obtain explicit direction to retain all advisories and use `--allow-advisories`. Confirm ROADMAP changed only for
the state flip.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): publish {name}

- Flip State: Active → Integrating

Context: meta-{name}.md (prepublication)
```

After the transition commit, load [`integrate-work-unit.md`](integrate-work-unit.md). Its Step 1 owns the first
push and change-request creation; do not push from this workflow.

---

## Related workflows

- [`verify-work-unit.md`](verify-work-unit.md) — preceding execution close; attests the Candidate.
- [`integrate-work-unit.md`](integrate-work-unit.md) — begins after `arc publish` at `State: Integrating`.
- [`reopen-work-unit.md`](reopen-work-unit.md) — withdraws public integration back to `Active`.

---

[classify-review-risk]: ../../../methods/classify-review-risk.md
[review-chunking]: ../../../methods/review-chunking.md
[review-triage]: ../../../methods/review-triage.md
[review-response]: ../../../methods/review-response.md
[deliver-stack]: ../supplemental/deliver-stack.md
[review-increment-invariant]: ../../../rules/DEV-RULES.ARC.md#review-increment-invariant
