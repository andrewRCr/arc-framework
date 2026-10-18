---
purpose: Prepare a verified Candidate for publication through private review, convergence, and the publication transition.
audience: agent
arc:
  methods:
    - code-review
    - classify-review-risk
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

Apply [code-review's convergence procedure][code-convergence] to each concluded look or eligible plain commit.
For an explicitly authorized additional complete pass, carry the exact authorization as
`lanes.standard.additionalPassAuthorization` in `--lanes`.

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

Before invoking a carrier, run [code-review's chunk gate][code-chunk-gate] using the envelope's exact `target`,
chosen coverage, and any correction scope. Carry its selected frontline/standard scope through `--lanes`.

At `candidate-fix-pending` with `nextAction.command: arc review respond -`, the pass may already be `pass-complete`,
`owner-accepted`, or `coverage-required`, but its current findings response is still unfinished. Use
`nextAction.responseOperationId` and `nextAction.responseSource` to resume that exact producer through the typed `arc
review respond -` action and [code-review's findings round][code-findings-round]. Reconstruct a lost proposal from this
bound source and obtain any approval still required; continue an existing approved response from its durable
disposition. Re-enter pre-publication only after durable response completion. The pass conclusion does not authorize
publication while this response remains pending.

**After a clean fix check.** Before source dispatch, or a non-null `reservation` at convergence verification or
publication, run [code-review's successor decision][code-successor-decision]. This caller's available stop re-enters
with `lanes.standard.terminus: { mode: "owner-accepted" }`; keep an unchanged accepted decision on re-entry.

The non-null `reservation` is the driver's `awaiting-change-request / open-change-request` continuation. Retain the
hosted-first reservation when continuing review and follow the envelope through `candidate-publish-ready`.

A null `policy` means no lane operation is open — follow the envelope's `nextAction.kind`, one of
`run-self-review`, `run-convergence-verification`, or `publish-candidate`. Otherwise follow only the `policy`
state/action pair:

For `run-self-review`, run [code-review's author check][code-author-check] before re-entry. Carry
`--self-review settled` only when the effective enabled check ran; omit it when inactive.

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
- `coverage-required / select-coverage` — apply [code-review's coverage selection][code-coverage-selection] with
  `policy.payload.responseRequired` and this caller's Owner-stop continuation.
- `findings / respond` — enter the disposition protocol below.
- `approval-required / obtain-ceiling-override` — apply [code-review's ceiling override][code-ceiling-override],
  retaining this procedure's exact lane request and continuation.
- `chunk-pending / continue-chunks` — continue the selected local chunk series.
- `stale-target / select-scope` — rerun chunking against the current target.
- `blocked | unavailable | invalid-override / stop` — surface diagnostics and stop.

When local prepare returns `coverage-required / select-coverage`, apply [code-review's coverage
selection][code-coverage-selection], including its range measure and selected lane scope.

Apply [code-review's local operation][code-local-operation] to launch/attest, resume/reduce, command remedies, and
frontline operator-repair, retaining the pre-publication command's opaque resume and exact operation bindings.

For every durable producer findings action, run [code-review's findings round][code-findings-round] with its exact
source and the following Candidate-owned verification/authoring continuation.

Approved fixes request `arc check gate commit`. Before their `verifiedFix` replay, a `focused` scope also requests
`arc check gate push --range --force`, and `full` requests `arc check gate merge --force` over the new target; Candidate
convergence verification repeats it. Disclose applicability from the actual delta: `targeted` for confidently narrow
non-interacting record/lifecycle changes, `focused` for a bounded interaction, and `full` for behavioral, authority,
contract, materially interacting, or uncertain changes. The approved scope does not select fewer checks.

A `ready-to-fix / apply-fix` response carrying `payload.authoring` binds a Candidate private-member fix. Author only in
its exact `authoring.checkoutPath`, `authoring.ref`, and `authoring.head`; a missing or different locus stops before
mutation. Never author it in the disposable member checkout. The shared committed `verifiedFix` replay must return
`candidate-advanced / continue-review` or idempotent `candidate-current / continue-review`. Commit its staged Candidate
response as `taskCommit` under the same approved increment before any Candidate-currentness or delivery-preparation
read.

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
[deliver-stack]: ../supplemental/deliver-stack.md

[code-author-check]: ../../../methods/code-review.md#author-check
[code-convergence]: ../../../methods/code-review.md#convergence
[code-successor-decision]: ../../../methods/code-review.md#successor-decision
[code-coverage-selection]: ../../../methods/code-review.md#coverage-selection
[code-chunk-gate]: ../../../methods/code-review.md#chunk-gate
[code-ceiling-override]: ../../../methods/code-review.md#ceiling-override
[code-findings-round]: ../../../methods/code-review.md#findings-round
[code-local-operation]: ../../../methods/code-review.md#local-operation
