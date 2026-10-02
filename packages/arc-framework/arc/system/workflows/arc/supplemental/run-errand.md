---
purpose: Execute an out-of-work-unit errand end to end as a re-enterable Launch → Execute → Integrate lifecycle dispatched by arc-session — one atomic concern, single session, no task list.
audience: agent
arc:
  methods:
    - assess-evidence-applicability
    - assess-parallel-fit
    - commit-footer
    - frontline-review
    - standard-review
    - implementation-audit
    - review-triage
    - review-response
  extensions:
    - post-task-quality
    - pre-pr-open
    - post-pr-open
    - pre-push-review
    - pre-merge
---

# Workflow: Run Errand

Execution body for an **errand** — a single **atomic** concern (one indivisible unit of work, bounded to one
session) — entered warm from an active session via the `arc-errand` skill, cold via `arc-session` (`--errand`, or
adopted from session-init's discovery arm), or from a [`drain-inbox`][drain-inbox] hand-off. For the
errand-vs-work-unit boundary, see [§ Errand Work Class][errand-class].

**Typically one review increment, often one commit** — but neither bounds the character: a determinate sweep may
land in several commits, and a large one may be reviewed in a bounded few **in-session** passes (an _extended
errand_), each its own gate. No task list, no `process-task-loop`. The phases — Launch → Execute → Integrate — are
re-enterable through the Errand's exact identity and checkout. A full-mode interruption or review tail retains that
exact identity and checkout without a meta, task list, or SESSION-NOTES; partial mode must complete, promote, or
explicitly abandon in the current session.

Every state-touching Errand command uses `--json`. For `open` / `materialize`, consume `operation`, `subject`, the
non-null `allocation` and its exact `checkoutPath`, optional `parentCheckoutPath`, identity/origin settlement
evidence, `nextOffer`, and `recommendedPromptText`. For `link`, require `allocation: null`, no parent checkout, and
consume the exact updated subject and identity/origin evidence. For terminal `close` / `abandon` / `leave` results:

- On `applied` / `idempotent`, consume `operation`, `subject`, `generation`, `checkoutPath`,
  `parentCheckoutPath`, `settlement`, `nextOffer`, and `recommendedPromptText`. Only an `idempotent` result proving
  terminal absence may carry null `subject` and `generation`; evidence-bearing results carry both exactly.
- On `confirmation-required`, bind the named `operation`, exact `subject`, `generation`, `checkoutPath`, and
  `destructiveEffect`; surface the effect and the retry command from `recommendedPromptText`, then stop. On explicit
  approval, invoke only that verb-owned retry. The verb re-derives fresh evidence and the supplied generation
  authorizes only that named act in that request.
- On `refused` / `error`, render `recommendedPromptText` and stop.

Promotion is a two-call transition owned by [`init-work-unit`][promote-errand-to-wu]. Consume the typed result rather
than inspecting the renamed branch, meta, identity, or marker: `settlement.state: commit-required` retains the exact
identity while the returned `metaPath` is committed; rerun the same command and continue only from the same exact
`subject` and `generation` with `settlement.state: settled`. Render `recommendedPromptText` and stop on
`confirmation-required`, `refused`, or `error`.

Never reconstruct allocation, terminal authority, preservation, cleanup, or continuation from Git branch shape.

When an `open` / `materialize` result asks for directed-command confirmation, confirm that the current session can
run subsequent commands at `allocation.checkoutPath`. If it cannot or the capability is uncertain, recommend a cold
session at that checkout and stop before execution.

## Launch

Confirm the work is an Errand, check for in-flight overlap, then open or resume its allocated checkout.

1. **Classify — errand vs. work unit.** Confirm the work is a single **self-evident** concern that fits one
   session. The work-unit tell is **spec-worthiness**: design worth recording, or a determinate concern large
   enough to need a durable cross-session plan — route those through [`init-work-unit`][init-work-unit]. A
   determinate sweep stays an errand however many commits, or in-session passes, it takes. (Scope that _crosses a
   floor_ mid-execution is handled by Execute's promote primer.) See [§ Errand Work Class][errand-class] for the
   boundary.

2. **Check for foreign overlap — apply [`assess-parallel-fit`][assess-parallel-fit] (overlap read only).** Run the
   overlap check against the paths the errand will touch:

   ```bash
   arc errand check --target <path>... --json
   ```

   It emits `{overlaps, reachable}` — which in-flight work units touch the same paths, across worktrees and
   machines, fresher here than at capture. Apply the method's overlap read (the rubric and the all-owner gate:
   foreign-owned → coordinate); an errand has no design stage, so the design-load read does not apply. **Advisory,
   never a gate:** surface any overlap, coordinate or sequence after the other unit integrates, then proceed. If
   the remote is unreachable the check degrades to local refs and says so.

3. **Open or resume the Errand checkout.**

   - **Launch mode:** invoke `arc errand open <slug> --intent <text> --json`. For an originating
     `USER-INBOX § Errand` capture, add `--from-inbox <entry-title>` or `--inbox-title-file <path>` (`-` reads
     stdin). The verb owns both protection modes: full protection allocates the free primary or a provisioned
     transient and mints the exact v3 identity; partial protection occupies only a safe free primary and creates no
     branch or portable identity. A warm entry never moves the session home or repurposes its WU checkout.
   - **Resume mode:** consume the exact current checkout selected by session-init; its derived transient role is the
     re-entry authority, so do not invoke `arc errand open` again. A remote-only eligible generation first runs
     `arc errand materialize <slug> --claim-id <claimId> --expected-head <expectedHead> --json`, using the selected
     candidate's claim ID and expected head; accept only its exact returned generation and path. A recorded head
     that no longer matches the fetched remote or open change request refuses materialization. Open identities,
     legacy branch-only candidates, closed or missing change requests, and partial Errands are not materializable.

   Execute every subsequent command from `allocation.checkoutPath`. Retain `parentCheckoutPath` when present as the
   warm-return parent; terminal results own the actual restoration outcome.

4. **Late inbox adoption, when needed.** If an in-flight ordinary full-mode Errand acquires a matching capture
   after open, run `arc errand link <slug> --from-inbox <entry-title> --json` (or `--inbox-title-file`). It may add
   only one exact origin back-pointer to an otherwise linkable v3 claim. Conflicts, legacy records, missing
   captures, and partial mode refuse; never edit the identity or inbox by hand.

## Execute

Honor the [Review-Increment Invariant][dev-rules-arc]: each review increment's change **accumulates uncommitted**,
is **reviewed once at its gate**, and is committed only **after** approval — never commit-then-review.

**Most errands are one pass.** Make the change, run the project's Tier 1 quality gates on what you touched, gate,
and commit.

**Extended errand (the exception).** A _determinate_ concern too large to review in one window may be staged into
a **bounded few in-session passes** — but only when it crosses **neither floor** (no design to author, no durable
cross-session plan). Propose the split and get approval first ("this is ~N passes — gate at each?"); then run each
pass as its own increment, tracked in-session only, never a task list. Staging review for ergonomics is not a
work-unit signal; needing a _durable plan_ is.

**Spec-worthy → promote.** If the work crosses a floor mid-execution — it needs design authored, or a durable
cross-session plan — stop and continue through the [Promote Errand path][promote-errand-to-wu]. That path owns the
floor judgment, generation-checked conversion, meta commit, and capture settlement; do not promote inline.

**Explicit abandon.** On explicit direction to discard a safely preserved generation, invoke
`arc errand abandon <slug> --json`. A full identity and its local review tail abandon only when the verb proves
provenance, cleanliness, exact refs, and host disposition. A partial Errand abandons only while its clean primary is
at the freshly pushed base. Both modes retain the originating capture and clear its execute-bound marking; never
simulate abandonment by deleting a branch, marker, or identity. Consume the typed terminal result above;
`subject.kind` distinguishes exact full and partial authority, while `settlement` reports the retained capture.

Run each review increment (one for a typical errand; a few for an extended one):

1. **Build** the change and run Tier 1 quality gates on what you touched.

   - **Extensions** · `#post-task-quality`: If `post-task-quality` is active, run its `.actions`. Otherwise skip.

   > [!IMPORTANT]
   > `workflow-interlock`: Stop after the change is complete and its gates pass. Surface the diff and verification
   > status; await approval before committing. For the final increment, approval also releases into Integrate.

2. **Commit** on approval — the change carries a `standalone (...)` context footer (no work unit owns it):

   > [!CAUTION]
   > `commit-interlock` release — commit as `taskCommit` (the gate above precedes the commit; a determinate
   > increment that spans several commits releases them together):

   ```text
   <type>(<scope>): <errand summary>

   Context: standalone (<kind>)
   ```

   See the [`commit-footer` method][commit-footer] for the `standalone (...)` parenthetical set.

## Integrate

The Errand's tracked changes, if any, are ready; now ship and clean up. Integrate branches on protection mode.

For a full-protection Errand with no tracked change, skip Ship and invoke `arc errand close <slug> --json`
directly. The verb completes only when the checkout is clean and the Errand branch, local base, and freshly fetched
remote base all name the same exact head. Any tracked change continues through the ordinary PR path below.

### Ship — full protection

1. **Compose Errand review facts.** Atomic determinacy is a routing fact alongside the canonical change facts and
   `vehicle: errand`; it can scale the obligation only through registered policy. Do not select a merge lane yet.
   When the change is confidently routine planning-grooming and self- or ownerless-owned, retain only the exact Git
   coordinates plus the caller-owned content kind, risk, determinacy, ownership, and surface authority judgments for
   the direct adapter below. The adapter derives the remaining routing facts; do not hand-author its change-set
   state, assurance, method activity, repository identity, target trees, or standard-review projection.

2. **Push** the errand branch upstream.

   - **Extensions** · `#pre-push-review`: If active, run its `.actions` before the push; halt-on-fail surfaces an
     actionable message, fix-and-retry or explicit-invoke bypasses. Otherwise skip.

   > [!CAUTION]
   > `push-interlock` release — `workflowPush`: `-u origin <branch>`.

   For the confidently recognized planning-grooming case, invoke `arc review planning-grooming resolve -` with the
   exact committed target and the three caller-owned judgments:

   ```json
   {
     "schemaVersion": 1,
     "target": { "baseRef": "<base-ref>", "diffBaseSha": "<diff-base-sha>", "headSha": "<head-sha>" },
     "routingFacts": {
       "contentKind": "documentation",
       "reviewRisk": "routine",
       "changeDeterminacy": "atomic",
       "ownership": "self",
       "surfaceAuthority": "planning-grooming"
     }
   }
   ```

   The command independently derives the immutable repository target, proves the exact diff contains only plain
   planning artifacts, and supplies the transient vehicle's assurance and live method activity. Content kind and
   surface authority remain caller-owned semantic judgments. Follow only its typed state:

   - `exempt / none` — both review lanes are complete (`frontline: skipped`, `standard: exempt`); skip the remaining
     review composition in this step and continue to Step 3.
   - `review-required / continue-review` — reuse its exact target, routing, and obligation payload, preserve its
     diagnostics, then enter ordinary review below; do not retype those projections.
   - `not-eligible / continue-review` — surface the typed reason, then enter ordinary review below.
   - A command error carries no action; stop.

   Never infer this exemption from `arc review planning-lane`, absence of a work unit, file count, or prose. The
   planning-lane classifier remains the later merge-lane input only.

   Compose the immutable policy target `{ repository, pullRequest: null, headSha }`, the routed `standardReview`
   projection, and explicit review-routing facts for every target continuing through ordinary review. The future
   merge lane remains downstream presentation, not a routing input. Errand atomicity fixes each role's
   `scopeSelection` to `{ mode: "whole-target", target: <immutable-policy-target> }`; chunk selection is not an
   Errand review action. Pass that exact whole-target selection to `arc review resolve -`.
   Configured standard-source order is the default. For an explicit Owner selection of a configured source, pass
   `invocation: { mode: "force", sourceId: "<source-id>" }` on every policy call for that target; the resulting
   Errand binding carries that source and its ordered fallbacks through hosted request and await.

   A converged result replays as complete: a clean pass, or one whose approved dispositions fix no confirmed
   `critical` or `major` finding. If the Owner explicitly authorizes another named standard pass, carry the exact
   target, preceding producer, completed-pass count, and next ordinal as `additionalPassAuthorization` through
   `arc review resolve -`. Carry the full authorization on hosted admission, or its targetless fields under
   `policyJudgment.additionalPassAuthorization` on local preparation.
   For an open PR, `arc review status --target <targetRef> --additional-pass '<authorization>'` reports the
   outstanding review. A fresh decision is required for each later pass; the same decision covers a named
   above-ceiling pass. A later material result enters the ordinary response route.

   Resolve frontline, then the pre-PR standard lane. Follow only the driver's typed `state` / `nextAction`:

   - `skipped | no-op | pass-complete / none` — complete the lane at this boundary.
   - `awaiting-change-request / open-change-request` — retain progress and continue to PR creation.
   - `ready / run-frontline` — invoke `arc review frontline resolve -`. Its `skipped / none` completes the lane; from
     its `ready / run-frontline`, invoke `arc review frontline run -` with the ready resolution and the target's
     `{ kind, baseRef, diffBaseSha, headSha }` projection.
   - `ready / local-prepare` — if the Owner declined the pass a fix triggers, prepare nothing; continue to Step 3 and
     offer the Owner-directed review stop at the open PR. Otherwise invoke `arc review local prepare -`; submit
     evaluator-owned result content through `arc review local attest -`, with runtime-owned bindings injected from the
     immutable operation.
   - `findings / respond` — run [`review-triage`][review-triage], include the effective policy as
     `proposal.severityGatingPolicy`, submit the proposal through the first `arc review respond -` call, emit
     `payload.dispositionReportText`, obtain complete-set approval, submit the exact
     approved set through the second `arc review respond -` call, and perform only its returned action through
     [`review-response`][review-response]. Preserve the `ready-to-fix` authorization's `approvedVerification` through
     re-entry and changed-target continuation; it does not select fewer checks here. Retain any returned
     `payload.policyRequest` carrying `conditionalPassAuthorizationId` unchanged for the named next-pass admission.
   - `approval-required / obtain-ceiling-override` — surface the exact one-pass consequence and
     `Approve (or redirect)?`; return only exact approval to the same target/lane call.
   - `stale-target / select-scope` — recompose the exact target, bind its whole-target scope, and rerun the driver.
   - `blocked | unavailable | invalid-override / stop` — surface the typed diagnostics and stop.

   Resume local operations with `arc review local resume -` and reduce with `arc review reduce -`. A command error
   envelope carries no action. Approval is required before any finding-driven fix, durable deferral, channel
   settlement, or other mutation/commitment. A complete no-action record-only set must be approved for its exact
   target before continuing. Approved fixes run Tier 1 gates, commit atomically, push, and create a new target.
   Never carry clearance or merge authority.

   A frontline `operator-repair` result replays on the same run request. Inspect its reason and operation ID;
   another provider invocation requires an explicit Owner decision and a new request carrying
   `retryOfOperationId`. A `review reduce` result with `retryable / operator-repair` supplies that ID.

3. **Resolve the Errand PR** before creation. Invoke the exact-head resolver:

   ```bash
   arc review change-request resolve --head-ref <branch> --head-sha <head-sha>
   ```

   Follow only its typed state and action:

   - `none / create-change-request` — enter the creation arm below.
   - `open / reuse-change-request` — reuse `candidate` and enter Step 4.
   - `merged-at-head / complete` — enter Complete.
   - `closed-unmerged / reopen-change-request` — reopen `candidate`, then enter Step 4.
   - `merged-stale-head / reconcile-head` — surface the stale candidate and reconcile before rerunning this step.
   - `ambiguous | blocked / stop` — surface the typed evidence and stop.

   The no-match creation arm uses a **lean errand body** — `template-pull-request` assumes a work unit, so inline a
   one-line Summary plus a one-line Test Plan only when verification is non-obvious. When gated local review ran,
   include `**Local review:** {carrier identity}`; otherwise omit the field entirely. No Spec / Out-of-Scope /
   Follow-Up sections.

   Compose `proposedChangeRequest = { repositoryRef, baseRef, headRef, headSha }`. If `pre-pr-open` is active,
   execute numbered actions in authored order immediately before creation; halt before later actions on failure.
   Retry these retry-safe actions after a failed create, but never run them on the one-open-match reuse path.

   Immediately before creation, re-invoke
   `arc review change-request resolve --head-ref <branch> --head-sha <head-sha> --require-remote` with the
   current head and dispatch on its typed state again. Continue only from `none / create-change-request`. This
   pre-create validation requires the remote branch itself to carry the exact creation head, including after any
   hook action.

   Then invoke `arc merge lock resolve -` with
   `{ "schemaVersion": 1, "treeRoot": "<absolute-checkout-path>" }`; `treeRoot` is the checkout path, not a Git
   tree object ID. Follow only its typed action:
   `locked / open-locked` creates the PR locked; `none / open-plain` creates it plain; `blocked / stop` halts
   creation before any PR exists. The lane is still unresolved here — it settles in Step 4 — so both lanes open the
   same way, and no lane input reaches this call.

   ```bash
   gh pr create --base <base-branch> --head <branch>            # open-plain
   gh pr create --base <base-branch> --head <branch> --draft    # open-locked
   ```

4. **Enter the open PR.** On both newly-created and reused-open paths, compose
   `openedChangeRequest = { repositoryRef, hostRef, headSha }`. If `post-pr-open` is active, execute its idempotent
   numbered actions before review. Both hooks and the review protocol share this exact-head contract. After any
   head-changing action, recompose `openedChangeRequest` from the canonical current head before re-entry.

   Before spending a hosted pass on a branch already behind its base, read `arc base drift --json`. Keep `clean`
   and regenerable-only drift silent and surface substantive or uncertain interaction as review context. This read
   is advisory only: it authorizes no merge, commit, push, or target recomposition. Base mutation belongs
   exclusively to Step 5's authoritative terminal planner and its typed base-merge arm.

   For every confidently recognized planning-grooming entry at this checkpoint, re-invoke
   `arc review planning-grooming resolve -` with the opened PR's exact current coordinates and freshly affirmed
   caller-owned judgments. This opened-target result supersedes the pre-PR result and is the sole exemption
   authority for this head. Follow its typed result:

   - `exempt / none` — skip the remaining review composition in this step and continue to Step 5.
   - `review-required / continue-review` — reuse its exact target, routing, and obligation payload below.
   - `not-eligible / continue-review` — continue below through ordinary fact composition.
   - A command error carries no action; stop.

   Any head movement invalidates the exemption and returns here before the integration interlock, including after a
   hook action, review fix, or base reconciliation. Continue only when `openedChangeRequest` and the adapter target
   name the same exact head.

   Bind the opened target's `scopeSelection` directly to whole-target and invoke `arc review resolve -` for each
   incomplete lane. If the Owner has directed that no further standard-review pass be spent, take the exact
   Owner-directed review stop below only from `ready / hosted-request`,
   `ready / local-prepare`, or `approval-required / obtain-ceiling-override`; stop before source dispatch. Every
   other driver state retains its typed action. Otherwise, on `ready / hosted-request`, invoke
   `arc review hosted request -` with the selected provider, exact opened target, `coverage: complete`, and
   `vehicle: { kind: "errand", standardReview }` from the routed Errand review facts:

   - `requested / await` — pass the returned `action` unchanged to `arc review hosted await -`; omitted timing uses
     the project's configured bounded-call defaults.
   - `pending / await` — retain the newly returned `action` through the diagnostic below, then pass it unchanged to
     `arc review hosted await -` for one more bounded call. Repeat this typed continuation until
     `pending / inspect-or-extend` or another terminal outcome; do not build an independent polling schedule.
   - `pending / inspect-or-extend` — unattended waiting reached its configured attention threshold. Retain the
     request for the diagnostic below, then stop. Submitting `action` unchanged checks once; on explicit direction,
     add `continueAfterAttention: true` to that action for one more bounded call. Neither path requests another review
     or records a provider outcome.

   For either pending outcome, run one short exact-head diagnostic observation before continuing or stopping:

   ```bash
   arc review checks await \
     --repository <action.handle.target.repository> \
     --pull-request <action.handle.target.pullRequest> \
     --head-sha <action.handle.target.headSha> \
     --timeout-ms 10000 \
     --poll-interval-ms 10000
   ```

   Surface failed required `checks` and any `diagnosticFailures`; when either is present, begin read-only diagnosis
   by inspecting every returned `failureLogs.logs[].path` before deciding the failure, and surface
   `failureLogs.failures` when retrieval is partial or unavailable.
   `unavailable / retry` surfaces `cause`, `detail`, current `checks`, and `diagnosticFailures`, retains the same
   hosted-review `action`, and ends this foreground attempt.
   `pending / await`, `green / complete`, and `not-required / complete` retain the same hosted-review `action`; only
   that action re-enters hosted await.
   `failed / stop`, stale or mismatched targets, and blocked reads stop with the action intact. This observation does
   not become review settlement, feed the review driver, move the exact head, or release the draft lock.

   Before feeding any `clean`, `findings`, or `settled-findings` attempt to the driver, set `completedPasses` to
   the `pass` from the driver envelope that authorized it. A completed attempt consumes that pass; pending chunk
   series and non-pass outcomes retain the prior count.

   - `clean / complete` — feed a `clean` attempt to `arc review resolve -`.
   - `findings / triage` — run [`review-triage`][review-triage], include the effective policy as
     `proposal.severityGatingPolicy`, submit the proposal through the first `arc review respond -` call, emit
     `payload.dispositionReportText`, obtain complete-set approval, submit the exact
     approved set through the second `arc review respond -` call, and perform only its returned action through
     [`review-response`][review-response]. When the approved call returns `payload.hostedSettlementPlan` for
     `settlement: reply-and-resolve` findings, execute its phases in order: invoke `arc review hosted settle -` for
     every ID in the active phase, passing `payload.hostedSettlementPlan.actorIdentity` unchanged as the settlement
     actor. Settle each `beforeFixFindingIds`
     entry against the unchanged originating `target` with `fixTarget: null`, and require every result to complete
     before any approved fix changes the head; then apply, verify, commit, and push the approved fixes; then settle
     every `afterFixFindingIds` entry against the originating `target` plus the changed `fixTarget` verified for the
     current head. A `settlement: not-applicable` finding appears in neither phase and remains triage-only:
     never invoke `hosted settle`, post a reply or compensating summary comment, or resolve anything for it.
     Retain any returned `payload.policyRequest` carrying `conditionalPassAuthorizationId` unchanged and pass its exact
     ceiling override into the named hosted, local, or frontline admission; never reconstruct the authorization ID.
     On re-entry, re-invoke the exact settlement request. `already-settled / complete` advances the durable attempt
     only after the verb verifies the exact approved reply, actor, comment, and resolved thread with no host
     mutation; every stop state remains a stop. After the required phases complete, follow the approved response
     continuation and, after a fix, the verified-fix response continuation through the owning status or resolve
     action. Do not feed the same findings to the driver again. If the Owner declined the pass the fix triggers,
     resolve the lane at the new head as usual and, from `ready / hosted-request`, present the Owner-directed review
     stop offer below instead of requesting the pass.
   - `rate-limited | transient-unavailable / try-next-source` — feed that safe outcome to the same driver call; it
     may select the next configured source without consuming the pass.
   - Any ambiguous delivery, stale target, malformed output, source failure, or terminal failure stops. Never replay
     an uncertain request.

   **Owner-directed review stop (open PR only).** When the Owner explicitly asks to end further standard-review
   spending, declines at a disposition turn the pass a fix triggers, or redirects an
   `approval-required / obtain-ceiling-override` decision, present one exact offer before treating that direction as
   approval. Re-read `arc review status --target <targetRef>` to validate the
   current Errand binding; `review-required` is expected, but a refusal or pending/response action stops. Name the
   current Errand key and claim, repository and PR, base ref and OID, head SHA, at least one completed same-claim
   standard-review pass and its disposition/settlement state, the complete current PR diff, and the change since
   the last completely reviewed head. State the residual risk and that `arc review status` will remain
   `review-required`: this is Owner acceptance, not a clean provider result or an ARC terminus. Stop if any review
   request is pending, a known finding lacks an approved disposition or required channel settlement, an authorized
   fix remains unfinished, the earlier reviewed head is not an ancestor of this head, or the evidence is incomplete.
   Ask for explicit acceptance of that exact residual risk; an earlier approval to fix, commit, or spend a pass does
   not answer this offer.

   On acceptance, request no further standard-review pass for those exact coordinates and continue to the reviewed
   merge lane below, not auto-merge. Do not submit a fabricated `clean` attempt, `terminus`, or `ceilingOverride` to
   the review commands. Recheck the Errand claim, PR, base OID, head, and known review/response state at Step 5 and
   immediately before release; any movement or new finding voids this decision and returns to this exact offer.
   This conversational authority is not durable: after a context loss or session re-entry, obtain it again if the
   exact approval and its coordinates cannot be recovered.

   On interruption, retain the returned operation ID and follow the last typed `state` / `nextAction`. Resume a
   suspended local operation with `arc review local resume -`; re-invoke the owning idempotent verb for frontline,
   hosted await, response, settlement, or reduction. Never reconstruct review state from workflow prose or invent
   WU state: the Errand branch, PR, and public operation references are sufficient continuity.

   After every target movement, return through the routed review action and dispatch its typed continuation. Do not
   classify movement or choose review scope from prose. When Step 6 supplies a `supplemental` recommendation, request
   hosted `coverage: incremental`; when it supplies `fresh`, repeat the complete applicable review. If an adapter
   reports `effectiveCoverage: complete` for the supplemental request, accept the broader review and disclose the
   upgrade. Under an Owner-directed review stop, any changed target or base requires a new exact offer describing
   the changed delta and the returned review-applicability result; never carry the prior acceptance forward.

   Re-run Tier 1 gates after every review-driven change. A new target invalidates clearance and integration
   authority. After the routed review settles or the exact Owner-directed review stop above is approved, run
   `arc review planning-lane <base-sha> <head-sha>` over the exact PR delta. Only literal `planning` is eligible
   for the **auto-merge-lane**; `reviewed` selects the **reviewed-lane**, while command failure or malformed output
   stops. An Owner-directed review stop always selects the reviewed-lane. Then apply the judgment-only threshold from
   [§ Auto-Merge Lane][auto-lane]: foreign ownership or another confidently recognized review condition may move
   an eligible change to reviewed without a permission stop, but never the reverse. The merge lane is downstream
   presentation only and cannot change routing, response, or evidence authority.

5. **Settle the final head.** Establish `vehicle: errand` from the strict Errand record, branch, and exact PR. That
   vehicle is explicitly outside WU composition-product requirements. **Never infer the exemption from absent or
   malformed WU state** · `[invariant]`; a missing or contradictory Errand identity stops.

   After any fix, request action, or append-only base reconcile changes the head, execute the generic push contract,
   rebind whole-target scope, and return through Step 4's review-applicability route. Compose the final
   `openedChangeRequest`, require any planning-grooming adapter target to match it, and retain the exact strict Errand
   identity and selected lane.

   Run `arc base drift --json` once immediately before approval composition. Continue only from a healthy reading
   whose `headOid` equals the exact Errand head; retain its `baseOid` as pre-approval evidence, not mutation authority.
   The terminal operation will perform its own post-approval observation. Invoke
   `arc review merge-method resolve` once and continue only from `validated / use-method`. Retain the
   returned `method` and `policyFingerprint`; `blocked / stop` stops. Compose one strict `errandMergeRequest` from
   those returned values plus `schemaVersion: 1`, the strict Errand `slug`, `claimId`, `branch`, and `generation`,
   the exact `repository`, `pullRequest`, `baseRef`, `headRef`, and `headSha`, and the selected `lane`.

   ```json
   {
     "schemaVersion": 1,
     "identity": {
       "slug": "<errand-slug>",
       "claimId": "<claim-id>",
       "branch": "<errand-branch>",
       "generation": "errand-v1/<errand-slug>/<claim-id>"
     },
     "approvedTarget": {
       "repository": "<owner>/<name>",
       "pullRequest": 123,
       "baseRef": "<base-ref>",
       "headRef": "<errand-branch>",
       "headSha": "<head-sha>"
     },
     "lane": "reviewed",
     "mergeMethod": {
       "method": "<resolved-method>",
       "policyFingerprint": "<resolved-policy-fingerprint>"
     }
   }
   ```

   Two fields are composed rather than read, and the request refuses when either disagrees. `generation` is
   always `errand-v1/<slug>/<claim-id>` built from the two identity fields beside it, and `identity.branch` and
   `approvedTarget.headRef` must name the same branch. `lane` is the value the lane classifier selected, and
   `method` and `policyFingerprint` are the resolver's returned values, never chosen here.

   Under an Owner-directed review stop, `review-required` remains expected; a status refusal or pending/response
   action stops. Recheck the accepted Errand claim, PR, base OID, head, and known review/response state before the
   integration interlock. A changed coordinate (including base OID or Errand claim), new finding, or unfinished fix
   returns to Step 4 for a new exact offer. Inspect the PR's native review and unresolved
   conversations separately; the stop clears no host blocker, so obtain separate Owner direction for any dismissal
   or thread action before proceeding.

   **Extension report** · `#pre-merge`: If active, execute its `.actions` once for this settled request and render
   their results under this label. Otherwise, skip — an inactive extension renders nothing. No review-authored commit
   or push may occur after this checkpoint.

> [!IMPORTANT]
> `integration-interlock`: Stop after the exact Errand merge request and extension report are settled. Surface the
> request, exact head, applicable planning-grooming adapter target, review applicability calls and targeted
> verification, approved responses already performed, proposed final dispositions, required checks and approvals,
> base freshness, and resolved lane. State that completed responses are not re-approved at this gate. Name
> the retained last-observed base OID; disclose that required checks are bound to the approved head unless the host
> supplies a stronger currency guarantee, and that base movement during the provider's in-call merge window remains
> a residual race. The base OID qualifies the evidence but is not merge authority. Distinguish an Owner-accepted
> residual review risk from provider-clean evidence and surface native-review blockers separately.
> State that approval applies remaining dispositions and channel settlement, ends review or confirms the exact
> Owner-directed stop, invokes exact-head release on the selected lane, and authorizes the exact-head merge represented
> by this request. Approval authorizes that exact request and
> the bounded exact-head wait below; it never satisfies required checks, and merge proceeds only after they report
> green or not-required. A redirect may instead select release-only for asynchronous host review or later manual
> merge. Close with `Approve (or redirect)?`.

After approval, apply the approved final dispositions and channel settlements. An explicit release-only redirect
composes `releaseRequest` with `schemaVersion: 1`, the absolute checkout path as `treeRoot`, the exact approved PR as
`target: { repository, pullRequest, headSha }`, and the strict Errand identity as
`vehicle: { kind: "errand", slug }`. Pass `releaseRequest` as JSON stdin to `arc merge lock release -` and stop after
`released / proceed` or `no-lock / none`; `blocked / stop` renders its typed reason and stops.
This separate operation authorizes no merge. Otherwise, continue to the selected lane action.

6. **Run the approved terminal operation.** Under an Owner-directed review stop, immediately recheck the accepted
   Errand claim, PR, base OID, head, and known review/response state. Any movement or new finding returns to Step 4
   for a new exact offer; required checks and host-native review blockers remain independent stops. Owner acceptance
   never satisfies a required check.

   For both routes, invoke the existing bounded waiter against the approved target. Omit timing options so the
   project's configured bounded-call defaults apply:

   ```bash
   arc review checks await \
     --repository <approvedTarget.repository> \
     --pull-request <approvedTarget.pullRequest> \
     --head-sha <approvedTarget.headSha>
   ```

   Dispatch only on its typed result:

   - `green | not-required / complete` — pass `errandMergeRequest` unchanged exactly once:

     ```bash
     arc errand merge <slug> - --json
     ```

   - `pending / await` — surface current `checks` and any `diagnosticFailures`, retain the exact
     `errandMergeRequest` and waiter coordinates, and stop at the bounded attention threshold.
   - `unavailable / retry` — surface `cause`, `detail`, current `checks`, and any `diagnosticFailures`; retain the
     exact request and waiter coordinates, then stop.
   - `failed / stop`, `stale-target / stop`, `target-mismatch / stop`, and `blocked / stop` — surface the typed
     evidence and stop. When `failureLogs` is present, inspect every `logs[].path` before diagnosis and surface any
     retrieval `failures`.

   For an invoked terminal merge, render the returned `state`, `nextAction`, `detail`, and its supplied remedy or
   terminal explanation. Dispatch only on that typed result:

   - `merged / complete` enters Complete.
   - `awaiting-checks / retry`, `host-pending / retry`, and retryable operational or unknown-mutation results stop
     with the exact continuation intact. A later re-entry invokes only its supplied remedy; never poll or recursively
     invoke the terminal command.
   - `reconcile-base / reconcile-base` and `reconcile-regenerable / reconcile-regenerable` invoke only the supplied
     remedy. Dispatch its typed base-merge result: `merged / run-quality-gates` runs Tier 1 on the new head, pushes
     through the generic contract, and returns through Step 4 before fresh approval.
     `skipped-clean / continue-reconcile`, `base-moved / rerun-checkpoint`, `head-moved / rerun-checkpoint`, and
     `head-contained-by-base / rerun-checkpoint` return through Step 4 without gates or push. `conflict / stop`,
     `regenerable-refused / stop`, and `blocked / stop` render the supplied explanation and stop; any other result
     is a contract violation.
   - `invalidated / request-approval` returns through Step 4 and settles a fresh exact request before approval.
   - `conflict / stop`, `host-refused / stop`, and non-retryable operational results stop on their supplied
     explanation. Lock recovery and mutation-state classification remain owned by the verb.

   **Method fire-point** · [`assess-evidence-applicability`][assess-evidence-applicability]: Only an
   `applicability-judgment-required / assess-applicability` result with
   `applicability.judgmentRequired: true` loads and applies the method to its bounded review residual. Follow its
   `supplemental | fresh` recommendation through Step 4's review/applicability route, then compose a new request and
   obtain fresh integration approval before any terminal mutation. A `judgmentRequired: false` result is final, and
   `merge-safety` never fires the method.

7. **Leave at a terminal session exit or before a genuine blocking-Errand detour.** When the session is ending with
   the merge tail unresolved, or work is moving machines, invoke
   `arc errand leave <slug> --state awaiting-merge --json`. Do not leave merely because the change request is open,
   checks or owner review are pending, or for ordinary next-Errand queue advancement. Otherwise retain the owning
   session and continue to Complete when the host reports the merge.

   When another Errand must land before the current one can complete, first checkpoint a clean pushed head. Leave
   the current Errand as `awaiting-merge` when its PR exists, or as `paused` before PR creation; consume the returned
   restoration checkout, then open the blocker there. Never open a different Errand from an active transient. After
   the blocker lands, resume only the original exact identity through its owning open or materialize driver.

   If the session is ending before PR creation, commit and push the checkpoint first, then use `--state paused`.
   Partial mode and unpushed or unproven heads refuse. Post-leave work resumes only through the identity's owning
   open or materialize driver; never use the checkout closed by `leave` as a re-entry surface. Consume the typed
   terminal result above; its exact `subject` / `generation`, checkout paths, and identity-tail `settlement` are the
   sole preservation and restoration evidence.

### Ship — partial protection

No branch and no PR: the Errand is a direct base-branch commit, so there is no merge step. The base push follows
the project's normal discipline. It cannot pause, await merge, materialize, or hand off; completion must pop the
exact partial role and remove any originating capture before the session can leave.

### Complete

On merge or exact no-tracked-change proof (full), or final commit (partial), invoke
`arc errand close <slug> --json` and consume the typed terminal result above. Its exact `subject` / `generation`,
checkout paths, and `settlement` are the sole closure evidence.

- **Full protection** — the verb proves either merged-change-request preservation or an unchanged clean base
  generation, finalizes the exact v3 identity tail, reaps refs and any retained checkout safely, and
  drops only its origin capture. A foreign checkout requires the exact generation returned by the verb's
  confirmation result; no
  bypass overrides preservation or host/base evidence.
- **Partial protection** — the completion arm verifies the direct-base result, pops the exact partial role, and
  removes its origin capture through the inbox mutation boundary. It creates no branch, PR, or portable identity.

When the current conversation has already agreed one exact next Errand, that named target takes precedence over
`nextOffer` and needs no additional completion offer. From the restored parent/between-WUs frame, derive and confirm
a branch-safe `<slug>`, then invoke `arc errand open <slug> --from-inbox <exact-entry-title> --json`. Consume the open
result as the new sibling locus. The target must resolve to one exact Errand entry; stop when it is missing or
ambiguous.

Otherwise, when the result carries `nextOffer`, offer only that exact file-ordered execute-bound sibling (`kind`,
`key`, and `parentCheckoutPath`). On acceptance, enter from `parentCheckoutPath` when non-null, otherwise from the
returned between-WUs frame; derive and confirm a branch-safe `<slug>` for `nextOffer.key`, then invoke
`arc errand open <slug> --from-inbox <nextOffer.key> --json`. Consume the open result as the new sibling locus. On
decline, return to the restored parent/between-WUs frame. Never scan for a substitute, persist an Errand sequence,
or reorder inbox captures.

**Post-leave merge.** If the merge lands after the session ends, the [finalize pass][finalize-pass] or next session
re-enters through the identity's owning open or materialize driver, then invokes `arc errand close`. Exact replay is
idempotent and may return the next file-ordered execute-bound offer.

---

[assess-parallel-fit]: ../../../methods/assess-parallel-fit.md
[assess-evidence-applicability]: ../../../methods/assess-evidence-applicability.md
[finalize-pass]: ../session-lifecycle/session-handoff.md#same-session-finalize-pass
[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md
[drain-inbox]: drain-inbox.md
[init-work-unit]: ../work-unit-lifecycle/planning/init-work-unit.md
[promote-errand-to-wu]: ../work-unit-lifecycle/planning/init-work-unit.md#promote-errand-to-work-unit-path
[commit-footer]: ../../../methods/commit-footer.md
[review-response]: ../../../methods/review-response.md
[review-triage]: ../../../methods/review-triage.md
[errand-class]: ../../../../reference/strategies/arc/strategy-work-organization.md#errand-work-class
[auto-lane]: ../../../../reference/strategies/arc/strategy-work-organization.md#auto-merge-lane
