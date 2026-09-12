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
printf '%s\n' '{"entryMode":"prepublication"}' | arc delivery entry inspect --input - --json
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

Invoke `arc review pre-publication <wu> --json`, carrying the routing facts as `--change-set`, each lane's scope
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

Supply `--change-set`, `--lanes`, and `--self-review` on the initial invocation and whenever the procedure explicitly
requests new author judgment. After every lane operation, re-enter through the exact command returned by the envelope:
its opaque resume carries judgment the repository cannot recover and confines a one-pass Frontline ceiling approval
to its selected exact head. It drops
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
invoke `arc review chunking resolve -` with the envelope's `target` projected to
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

A null `policy` means no lane operation is open — follow the envelope's `nextAction.kind`, one of
`run-self-review`, `run-convergence-verification`, or `publish-candidate`. Otherwise follow only the `policy`
state/action pair:

For `run-convergence-verification`, use only the typed action: run its `nextAction.verificationKind` at
`nextAction.requiredScope`, obtain a fresh verification evidence reference, replace only the
`{verificationEvidenceRef}` operand in `nextAction.attestArgv`, and invoke that exact argv. Never select a
verification scope in prose or substitute the Candidate root task-list reference.

- `skipped | no-op | pass-complete / none` — lane complete.
- `owner-accepted / none` — standard lane complete by the Work Unit Owner's explicit accepted-risk decision.
- `awaiting-change-request / open-change-request` — retain the hosted-first reservation and complete at
  `candidate-publish-ready`.
- `ready / run-frontline` — invoke `arc review frontline resolve -`, then `arc review frontline run -` with the
  ready resolution, the target's `{ kind, baseRef, diffBaseSha, headSha }` projection, and `responseBinding` when
  the pre-publication envelope supplies it.
- `ready / local-prepare` — invoke `arc review local prepare -`.
- `findings / respond` — enter the disposition protocol below.
- `approval-required / obtain-ceiling-override` — surface the exact consequence and `Approve (or redirect)?`.
- `chunk-pending / continue-chunks` — continue the selected local chunk series.
- `stale-target / select-scope` — rerun chunking against the current target.
- `blocked | unavailable | invalid-override / stop` — surface diagnostics and stop.

Dispatch local operations only through public typed actions. The evaluator submits status, result, findings, and
run identity to `arc review local attest -`; runtime-owned bindings come from the immutable operation. Resume with
`arc review local resume -`, reduce with `arc review reduce -`, and submit approved dispositions with
`arc review respond -`. A command error envelope carries no dispatchable state.

For every finding, run [`review-triage`][review-triage] and [`review-response`][review-response]. Present one
unqualified severity when the reviewer and ARC grades agree, label both only when they differ, and include the source
locus plus a discrete `Recommended disposition:` line. Approval of the complete unchanged surfaced set is required
before any mutation or commitment; the approver need not repeat its canonical digest. Approved fixes run Tier 1
gates ([`quality-gate-commands`][arc-methods-qg]), commit
atomically, and produce a new target. Disclose review applicability from the exact delta: `targeted` for confidently
narrow non-interacting record or lifecycle changes, `focused` for a bounded interaction, and `full` for behavioral,
authority, contract, materially interacting, or uncertain changes. Clearance never carries.
After the fix commit, re-invoke the same approved `arc review respond -` request with `verifiedFix` carrying the
selected applicability and verification evidence. Require `candidate-advanced / continue-review` or idempotent
`candidate-current / continue-review`, then commit its staged Candidate response under the same approved increment
before any Candidate-currentness or delivery-preparation read.
After an approved fix changes the Candidate, rerun Step 1 and repeat [Deliver Stack][deliver-stack]
§ Prepare private delivery candidates when directed before re-invoking pre-publication review.

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
