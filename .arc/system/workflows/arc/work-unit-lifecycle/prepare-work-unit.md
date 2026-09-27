---
purpose: Prepare a verified Candidate for publication through private review, convergence, and the publication transition.
audience: agent
arc:
  methods:
    - self-review
    - frontline-review
    - standard-review
    - review-chunking
    - review-triage
    - review-response
    - commit-footer
    - quality-gate-commands
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

Invoke `arc review pre-publication <wu>`, carrying the routing facts as `--change-set`, each lane's scope
mode and one-run invocation override, and any approved ceiling override as `--lanes`, and a
completed author self-review as `--self-review settled` only when the effective method is active and ran; omit the
option when the method is inactive. A user-directed skip of an enabled frontline lane is
`lanes.frontline.invocation: { mode: "skip" }`; it cannot suppress the standard lane. An explicit Owner selection
of a configured standard source is
`lanes.standard.invocation: { mode: "force", sourceId: "<source-id>" }`; configured order remains the default when
it is absent. After the active Work Unit Owner explicitly accepts the current review terminus, carry
`lanes.standard.terminus: { mode: "owner-accepted" }`. The command authenticates that Owner and reports a distinct
`owner-accepted / none` conclusion; it never means clean, converged, no-op, or evaluator-satisfied. The Owner's
decision is the authorization, so do not ask for a second confirmation while the exact Candidate remains current.

For a singleton Candidate lineage, frontline is an opening phase. Its configured allowance applies while that phase
is open. An accepted initial skip or durable standard admission closes it; changed heads and validated Candidate
supersession do not reopen it. Follow the typed pre-publication continuation across a re-root: inherited completed
standard passes still count toward the ceiling, while older producer evidence remains bound to its original target.

A clean or confirmed-minor standard result remains converged on ordinary replay. If the Owner explicitly authorizes
another named standard pass, carry its exact head, preceding producer, completed-pass count, and next ordinal as
`lanes.standard.additionalPassAuthorization` in `--lanes`. This admits that pass only; each further pass needs a
fresh decision, even after another convergence. If it is above the configured ceiling, the same explicit decision
covers the named ceiling override. A later material result follows the ordinary response route.

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

Before invoking or rendering review attention for each new target, read the latest planning decision prose for the
selected `assess-boundary-fit` outcome and its evidence basis. A recorded `stays one WU` decision stays silent while
evidence is semantically unchanged; invocation, elapsed time, and restatement are not material deltas. Otherwise
invoke `arc review changeset resolve -` with the envelope's `target` projected to
`{ kind, baseRef, diffBaseSha, headSha }` and any exact-target `scopeSelection` projected the same way, then
dispatch only on its typed state/action pair:

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
`pass-complete` or `owner-accepted`, but its current findings response is still unfinished. Use
`nextAction.responseOperationId` and `nextAction.responseSource` to resume that exact producer through the typed
`arc review respond -` action and [`review-response`][review-response]. Reconstruct a lost proposal from this bound
source and obtain any approval still required; continue an existing approved response from its durable disposition.
Re-enter pre-publication only after durable response completion. The pass conclusion does not authorize publication
while this response remains pending.

A null `policy` means no lane operation is open — follow the envelope's `nextAction.kind`, one of
`run-self-review`, `run-convergence-verification`, or `publish-candidate`. Otherwise follow only the `policy`
state/action pair:

For `run-convergence-verification`, use only the typed action: run its `nextAction.verificationKind` at
`nextAction.requiredScope`, obtain a fresh verification evidence reference, replace only the
`{verificationEvidenceRef}` operand in `nextAction.attestArgv`, and invoke that exact argv. Never select a
verification scope in prose or substitute the Candidate root task-list reference. Complete final Tier 3 without an
intervening commit. Keep every projection staged while the returned action re-enters prepublication, through
`candidate-publish-ready`; the publication transition in Step 3 is the single lifecycle projection commit.

- `skipped | no-op | pass-complete / none` — lane complete.
- `owner-accepted / none` — standard lane complete by the Work Unit Owner's explicit accepted-risk decision.
- `awaiting-change-request / open-change-request` — retain the hosted-first reservation and complete at
  `candidate-publish-ready`.
- `ready / run-frontline` — submit the envelope's `nextAction.request` as JSON stdin to `nextAction.command` and
  retain both `nextAction.authorizationRequest` and `nextAction.resumeCommand`. On
  `offered / obtain-authorization`, surface the exact one-pass consequence and ask `Approve (or redirect)?`; only
  approval submits `nextAction.authorizationRequest` to the same command. Continue only from
  `ready / run-frontline`, then run `arc review frontline run -` with that resolution, the target's
  `{ kind, baseRef, diffBaseSha, headSha }` projection, and `responseBinding` when the pre-publication envelope
  supplies it. Invoke the retained resume only after the frontline operation's typed protocol completes.
- `ready / local-prepare` — invoke `arc review local prepare -`.
- `findings / respond` — enter the disposition protocol below.
- `approval-required / obtain-ceiling-override` — surface the exact consequence and `Approve (or redirect)?`.
- `chunk-pending / continue-chunks` — continue the selected local chunk series.
- `stale-target / select-scope` — rerun chunking against the current target.
- `blocked | unavailable | invalid-override / stop` — surface diagnostics and stop.

When local preparation offers both complete and incremental coverage, explain which scope is proportionate from the
latest confirmed signal and the exact correction being reviewed. An incremental choice still spends one logical pass;
it narrows the new evaluator's target without treating the prior review as clearance for changed code. Do not infer a
scope from a finding count, and keep the Owner's next-pass authorization separate from this choice.

Dispatch local operations only through public typed actions. The evaluator submits status, result, findings, and
run identity to `arc review local attest -`; runtime-owned bindings come from the immutable operation. Resume with
`arc review local resume -`, reduce with `arc review reduce -`, and submit approved dispositions with
`arc review respond -`. A command error envelope carries no dispatchable state.
For frontline `operator-repair`, inspect the reported failure; another provider invocation requires an explicit
Owner decision and a new run request carrying `retryOfOperationId` from the prior operation.

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
commitment; the approver need not repeat its canonical digest. Submit the exact approved set through a second call:

```bash
arc review respond -
```

Follow only its returned action and use [`review-response`][review-response] to perform the approved response. A
`ready-to-fix` authorization carries `approvedVerification`; preserve it through re-entry and the changed-target
continuation. The scope does not select fewer checks here. Approved fixes run Tier 1 gates
([`quality-gate-commands`][arc-methods-qg]), commit atomically, and produce a new target. Disclose review
applicability from the exact delta: `targeted` for confidently narrow non-interacting record or lifecycle changes,
`focused` for a bounded interaction, and `full` for behavioral, authority, contract, materially interacting, or
uncertain changes. Clearance never carries. If the response carries `conditionalPassAuthorizationId`, retain its
returned `payload.policyRequest` unchanged; the next pre-publication admission projects its exact ceiling override
into the selected lane request. A `ready-to-fix / apply-fix` response carrying `payload.authoring` binds a
Candidate-bound private-member fix. Author only in its exact `authoring.checkoutPath`, `authoring.ref`, and
`authoring.head`; a missing or different locus stops before mutation. Never author this fix in the disposable member
checkout. After the fix commit, re-invoke the exact approved `arc review respond -` request with `verifiedFix`
carrying the approved applicability and verification evidence. Require `candidate-advanced / continue-review` or
idempotent
`candidate-current / continue-review`, then commit its staged Candidate response under the same approved increment
before any Candidate-currentness or delivery-preparation read.
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

[review-chunking]: ../../../methods/review-chunking.md
[review-triage]: ../../../methods/review-triage.md
[review-response]: ../../../methods/review-response.md
[arc-methods-qg]: ../../../methods/quality-gate-commands.md
[deliver-stack]: ../supplemental/deliver-stack.md
