---
purpose: Execute or resume one canonical delivery stack through exact-head review, attended landing, and ordinary terminal integration.
audience: agent
arc:
  methods:
    - assess-evidence-applicability
    - frontline-review
    - standard-review
    - implementation-audit
    - review-triage
    - review-response
    - review-chunking
    - validate-criteria
  extensions:
    - pre-push-review
    - pre-merge
---

# Workflow: Deliver Stack

Use this workflow when an operator enters delivery during implementation or resumes a bound plan at the owning
work-unit control locus. Delivery is an attended projection of the existing work-unit, review, and integration
authorities. It does not infer a concern boundary, copy review verdicts, or create a per-member session locus.

Every command below emits a strict verb-specific JSON result. Render its `recommendedActionText` or consequence
verbatim. Follow its named `nextAction`; never derive member order, coordinates, readiness, or recovery from prose,
branch names, task-list tables, or provider order.

## Enter

Run the delivery-owned read before eligibility or mutation:

```bash
arc delivery entry inspect --input - --json
```

The request carries either the attended `assess-boundary-fit` disposition (plus confirmation when a provisional plan
was reviewed), the closed `{ "entryMode": "execution" }` context supplied by the task loop, or the closed
`{ "entryMode": "integrating" }` context supplied by ordinary integration's pre-push dispatch.
Render `laterEntryCostText` and `recommendedActionText` verbatim when present, then dispatch the returned route; the
workflow never parses headings, derives members, or re-decides cohesion:

- `not-applicable` returns to ordinary work-unit execution, including singleton integration from the pre-push door.
- `authoring-required` enters the existing inventory-schema, `from-tasks`, author-slot, and compose sequence.
- `repair-required` with `reauthor-plan` re-enters the returned `entry` path, authors a supported replacement
  revision, composes it, and reruns entry inspection before eligibility.
- `canonicalize-provisional` runs that same canonicalization sequence or its receipt-pinned recovery.
- `validate-canonical` advances to eligibility.
- `continue-publication` invokes `publicationAction.command` unchanged before reading position.
- `resume-bound` reads delivery position and reconciles any named active operation before continuing.
- `correction-routing-required` and `review-fix-verification-required` invoke the selector-free
  `arc delivery review-fix continue - --json` procedure below. The controller owns the selected member, persisted
  operation, exact verification, and acknowledgment locators; workflow prose carries none of them.
- `refused` stops before every eligibility or mutation verb after rendering the precomposed refusal.

The inspection is read-only. It never treats the presence of prose as delivery judgment and never binds state.

## Prepare private delivery candidates

This bounded section may be invoked by Candidate pre-publication. Its output is fresh private authoring and gate
evidence; a pre-publication caller returns after eligibility closes, while delivery execution continues below.

Resolve the complete plan's exact disposable authoring locators:

```bash
arc delivery authoring locate - --json
```

Record each authored cut at its returned private candidate ref and returned matching detached gate path. Do not leave
ordinary local branches or branched worktrees for these cuts — ARC may interpret them as work-unit loci or cleanup
residue. The private refs are identity-free locators only and grant no delivery authority. Gate execution waits for
the materialized member scale recheck below.

The write half of that locus is typed too, so a correction interrupted between authoring and its gate replay
completes without hand-writing a ref in the ARC-owned namespace. `arc delivery authoring rematerialize - --json`
prepares the exact private ref and detached gate pair at the current public member;
`arc delivery authoring rebind - --json` binds a clean detached authoring head to its candidate ref. Both take the
exact inputs the correction continuation dispatches in-process and refuse with the executor's own typed reason on a
dirty locus, a moved head or tree, a stale state revision, or an active operation.

For every returned locator in plan order, compose the exact materialized member target from its private candidate
head and plan-ordered predecessor boundary, then invoke:

```bash
arc review chunking resolve -
```

Supply the member's `{ kind, baseRef, diffBaseSha, headSha }` and any exact-target scope selection retained from
member closeout. Dispatch only on the typed result:

- `disabled / none`, `below-threshold / continue-review`, and `scope-selected / continue-review` continue.
- `consider-chunks / select-review-scope` renders `recommendedActionText` and applies the
  [`review-chunking` method][review-chunking]. For a selected bounded-review route, reinvoke the resolver and require
  `scope-selected / continue-review`. An explicit capable whole-target choice closes the attention disposition while
  retaining the unchanged `consider-chunks` result and exact-target selection. An honest coherent member re-cut that
  has no bound selection stops for the Owner's decision.
- `evidence-unavailable / continue-review`, `delivery-bound / continue-review`, and every malformed or unsupported
  result stop before gate execution.

No Tier 2 command starts until every exact member target has a closed result and disposition. Retain each exact-target
selection for the calling pre-publication review. This recheck governs the current materialization only; later target
movement requires another exact check.

```bash
arc delivery eligibility prepare - --json
```

Run the complete Tier 2 command set in every returned checkout. For each zero-exit run, report one result in the
returned member order, bound to that member's exact coordinates:

```json
{
  "gateResults": [{
    "deliverableId": "{canonical deliverable ID}",
    "head": "{returned candidate head}",
    "tree": "{returned candidate tree}",
    "status": "passed"
  }]
}
```

Supply the snapshot and complete `gateResults` list to close the same observation window:

```bash
arc delivery eligibility close - --json
```

Invoke each eligibility verb once for its observation window. Dispatch only on the typed result and render any
supplied `nextAction` or `recommendedActionText`; a re-prepare action starts a new window rather than replaying either
verb inside the current one. Mechanical eligibility and terminal-position classification do not fire an evidence-
applicability method.

## Validate and publish

Before the first mutation, load both the ordinary and delivery-member forms of
[`template-pull-request.md`][template-pull-request]. Author one `presentations` entry for every non-terminal
deliverable ID plus the ordinary terminal request as `terminalPresentation`:

```json
{
  "presentations": [{
    "deliverableId": "{canonical deliverable ID}",
    "summary": "{reviewer-facing purpose and outcome}",
    "changes": [{ "topic": "{concrete topic}", "description": "{specific output}" }],
    "designReference": "{accessible filename or URL}"
  }],
  "terminalPresentation": {
    "title": "{ordinary Conventional Commits pull-request title}",
    "body": "{complete ordinary work-unit pull-request body}"
  }
}
```

`summary`, terminal `title`, and terminal `body` are required; `changes` and `designReference` are content-gated.
Supply that complete presentation set with the plan ID, repository locators, the same candidate refs and checkout
locators, and the same `gateResults` list to the sole initial mutation verb:

```bash
arc delivery publish - --json
```

A refusal stops without publication. The verb resolves the current plan and originating top from repository-owned
work-unit state, validates the complete presentation set, and reruns mechanical eligibility and exact Tier 2 result
admission against the post-gate checkouts before the first ref push or host mutation. It then creates or adopts
every member ref before opening any request: delivery refs in plan order, the content-neutral top adoption and
ordinary top-branch push, then
requests bottom-up. Each request is based on its predecessor branch; the terminal request uses the originating branch
over the highest delivery ref. Set `draft` from the configured `merge.lock` posture (`draft` ⇒ `true`) so every request
opens under the configured hold; the landing sequence releases that lock only after readiness. The verb derives
non-terminal titles from the canonical plan and uses authored presentation only when creating a missing request; an
exact existing request is adopted unchanged. A failed request step retains its reservation for `reconcile` or an exact
publication retry.

After interruption, rerun the candidate gates before invoking the mutation verb again. Resume any persisted
reservation through:

```bash
arc delivery reconcile - --json
```

Supply only the plan, repository, and remote locators. The verb dispatches on the persisted operation kind and
derives its Git, request, target, and contribution evidence itself; never serialize an operation observation into
the request.

Follow the typed result. `applied / teardown-member` takes the returned `selectedDeliverableId` and immediately
invokes `arc delivery teardown` with the existing plan, repository, protected-target, and remote locators before any
ordinary position read. `applied / read-position` returns to `arc delivery position`; any other `applied` result
follows its returned `nextAction`. A `prepared / preserved / delivery-native-land-submit` result re-presents the
returned `presentation`: render its exact member/head set and consequence verbatim.

> [!IMPORTANT]
> `integration-interlock`: Stop after prepared native landing recovery. Surface the exact recovered member/head set
> and consequence; await approval before proceeding to the returned native submission.

After approval, invoke the returned `submitAction` unchanged. A `retryable` result dispatches only one of these exact
`transition / action / selector` arms:

- `retryable / cleared / delivery-publish` with `operationKind: materialize` reruns
  `arc delivery publish`.
- `retryable / preserved / delivery-publish` with `operationKind: publish` revalidates and retries
  `arc delivery publish` against the retained reservation.
- `retryable / cleared / delivery-rematerialize` with `operationKind: rewrite` and `mode: review-fix` reruns
  `arc delivery rematerialize`; when present, pass its `supersedePendingReviewFixVerification` unchanged as the
  exact authority to supersede the restored verification marker. Its `reviewFixSelectedDeliverableId` and
  `reviewFixVerificationDeliverableIds` retain the corresponding correction subject.
- `retryable / cleared / delivery-review-fix-publish` with `operationKind: rewrite` and
  `mode: selected-change` reruns `arc delivery review-fix publish` from the returned selected-member subject.
- `retryable / preserved / delivery-refresh-adopt` with `operationKind: rewrite` and
  `mode: provider-adoption` reruns `arc delivery refresh adopt` with the exact `operationId`; the CLI derives the
  reserved suffix rather than accepting the selector's affected IDs as request authority.
- `retryable / preserved / delivery-refresh-execute` with `operationKind: rewrite` and
  `mode: provider-refresh` reruns `arc delivery refresh execute` with the exact `operationId`; the CLI resumes the
  retained publication vector and never asks the provider to prepare a second result.
- `retryable / cleared / delivery-land-prepare` with `operationKind: land` and `mode: sequential` reruns
  `arc delivery land prepare` and requires a new integration interlock before apply.
- `retryable / cleared / delivery-native-land-select` with `operationKind: land` and `mode: native` reruns
  `arc delivery native land-select`; any selected landing returns through preparation and a new interlock.
- `retryable / preserved / delivery-teardown` with `operationKind: teardown` revalidates and retries
  `arc delivery teardown` against the retained reservation.
- `retryable / cleared / delivery-top-remedy` with `operationKind: top-remedy` reruns
  `arc delivery top-remedy`.

For every arm, use the returned selector's exact `planId`, `operationId`, `affectedDeliverableIds`, `operationKind`,
and narrow `mode`, `reviewFixSelectedDeliverableId`, `reviewFixVerificationDeliverableIds`, and
`supersedePendingReviewFixVerification` when present as the authoritative reservation, correction subject, and
supersession identity. Render `recommendedActionText` verbatim and let the named ordinary verb reobserve and
prepare every other input; workflow prose infers neither a selector nor a recovery policy.
Any unlisted action/transition/selector pairing, or any blocked, refused, unavailable, or ambiguous result, stops
with its reason rendered.

Only after every request ID exists, compose the exact non-terminal native-link request without `optIn` and invoke:

```bash
arc delivery native link - --json
```

An initial `unlinked` result, returned after exact plan/state validation, enters the ordinary singleton path without
an operator choice; `refused` stops. Only `decision-required` reaches the choice. Render both texts verbatim —
`recommendedOptInText` and
`recommendedOptOutText` — before asking the operator to choose. This is the choice surface, not a capability check.
After the choice, set `optIn` to its exact boolean value and resubmit the otherwise unchanged request:

```bash
arc delivery native link - --json
```

The terminal is never registered. A one-member delivery has no registration set and skips both invocations. A
two-member delivery has a singleton registration set below the provider floor, so its initial read returns
`unlinked` without resubmission. `linked` continues only after a fresh exact host observation. An opt-out `unlinked`
result makes zero native host calls and enters the ordinary singleton path. `downgrade-required` renders
`recommendedActionText` verbatim and invokes the explicit unlink verb; `refused` stops. On the linked path, refresh
presentation facts before every landing:

```bash
arc delivery native observe - --json
```

Provider registration never selects member order and never enters the delivery plan or state.

## Select and execute the native landing arm

Immediately after the fresh native observation, select the service-owned arm:

```bash
arc delivery native land-select - --json
```

The selector request carries only the plan, repository, remote, and merge-choice inputs — no member coordinates or
position facts. The handler freshly observes position from canonical plan/state, then derives the exact plan-ordered
non-terminal remainder before provider observation. An `unlinked` arm or a preceding `downgrade-required` result
invokes the presentation-only degradation verb:

```bash
arc delivery native unlink - --json
```

The request carries the exact `planId` and current native member subject retained from the link/observation route;
it derives no position facts. The handler revalidates both against canonical plan/state before provider access.
Only its fresh `unlinked` result continues through the ordinary singleton path below. Every other result renders its
precomposed guidance and stops without a landing mutation. `blocked` likewise renders `recommendedActionText` and
stops. `queue-not-atomic` remains this native refusal: render its supplied sequential fallback without synthesizing an
enqueue route. A `linked-single` or explicitly selected direct `linked-atomic` result binds `selectedDeliverableId`
to its first returned member and settles exact member review authority before set-wide preparation.

### Settle exact member review authority

The native arm supplies its first selected member; the ordinary singleton arm supplies the `selectedDeliverableId`
returned by `arc delivery position`. Run the existing review sequence with that member's exact delivery vehicle:

```json
{"kind":"delivery-member","planId":"<planId>","deliverableId":"<deliverableId>","workUnitSlug":"<workUnitSlug>"}
```

The vehicle binds the review to the exact head supplied by delivery; no second member-review verb or delivery-owned
review evidence exists. Resolve its exact open change request and pass the resolver's `targetRef` to:

```bash
arc review status --target '{targetRef}' --json
```

No review carrier may run while the latest exact-target `consider-chunks / select-review-scope` result is unresolved.
A selected bounded-review route closes through `scope-selected`; an explicit capable whole-target choice closes the
attention disposition while retaining `consider-chunks`. Require the returned review action to carry either the
exact-target chunked scope selection or, for the whole-target route, the exact-target forced hosted invocation selected
by the Owner. A missing or stale selection returns to the owning route rather than editing the action or invoking a
carrier.

After the Owner selects the whole-target route, re-enter the same exact target with that configured hosted source:

```bash
arc review status --target '{targetRef}' --source <hosted-source-id> --json
```

The source-less form retains the automatic chunked route.

The default action requests complete coverage. When a typed applicability recommendation requires a focused
supplemental hosted pass, request it from the same first-outstanding member position instead of editing an action:

```bash
arc review status --target '{targetRef}' --coverage incremental --json
```

Pass the returned action unchanged. Re-enter without `--coverage` after the supplemental attempt concludes; an
incremental result does not settle or consume the member's required complete review.

Dispatch only on `nextAction`. `obtain-ceiling-override` renders the exact `consequence` and stops without requesting.
Only explicit approval of that exact consequence admits one additional pass; on approval, re-enter the same target
with the returned consequence serialized unchanged:

```bash
arc review status --target '{targetRef}' --ceiling-override '{consequence}' --json
```

`review-hosted-request` means pass the returned action unchanged to:

```bash
arc review hosted request -
```

`review-local-prepare` returns the exact standard-review driver admission. Pass its `action` unchanged as
`deliveryAdmission` in the ordinary local prepare request:

```bash
arc review local prepare -
```

Follow the typed local launch, attest, reduce, and findings-response sequence. Do not rerun source selection or
substitute the current checkout head for the returned member head. After the local attempt concludes, re-enter
through `arc review status`; durable lane progress consumes the admitted pass.

`review-local-resume` means pass the returned action unchanged to:

```bash
arc review local resume -
```

Follow the same typed local sequence, then re-enter through `arc review status`.

`respond-to-findings` uses the returned `responsePlan`'s exact target, source, and findings. Run
[`review-triage`][review-triage] and [`review-response`][review-response], then submit the approved proposal through:

```bash
arc review respond -
```

This resumes the retained attempt and never requests another hosted review. Execute any returned hosted settlement
plan through the existing phase-ordered settlement path below, then re-enter through `arc review status`.
After a member fix, require `delivery-member-advanced` or idempotent `delivery-member-current` and pass
`payload.hostedFixTarget` unchanged as the after-fix settlement's `fixTarget`; never reconstruct it from the checkout.

On `requested / await`, pass the returned `action` unchanged to:

```bash
arc review hosted await -
```

`pending / await` retains the newly returned `action` unchanged for one more bounded call;
`pending / inspect-or-extend` retains the request for the diagnostic below, then stops. Submitting `action`
unchanged checks once; on explicit direction, add
`continueAfterAttention: true` to that action for one more bounded call. Neither path requests another review or
records a provider outcome. For either pending outcome, run one short exact-head diagnostic observation before
continuing or stopping:

```bash
arc review checks await \
  --repository <action.handle.target.repository> \
  --pull-request <action.handle.target.pullRequest> \
  --head-sha <action.handle.target.headSha> \
  --timeout-ms 10000 \
  --poll-interval-ms 10000 \
  --json
```

Surface failed required `checks` and any `diagnosticFailures`; begin read-only diagnosis when either is present.
`unavailable / retry` surfaces `cause`, `detail`, current `checks`, and `diagnosticFailures`, retains the same
hosted-review `action`, and ends this foreground attempt.
`pending / await`, `green / complete`, and `not-required / complete` retain the same hosted-review `action`; only
that action re-enters hosted await. `failed / stop`, stale or mismatched targets, and blocked reads stop with the
action intact. This observation does not become review settlement, feed the review driver, move the exact head, or
release the draft lock.

Feed `clean`, `findings`, and safe-unavailability results to the existing review driver. For approved hosted
finding settlement, execute the returned settlement plan in phase order through:

```bash
arc review hosted settle -
```

`resolve-review-applicability` renders `selectionAction.interactionText` before the Owner's typed choice.

**Method fire-point** · [`assess-evidence-applicability`][assess-evidence-applicability]: Only when the typed
member-rewrite result carries `selectionAction.projection.applicability.judgmentRequired: true`, or a projection in
`selectionAction.projections` carries the same field, load and apply the method to each such bounded review residual
and show its `supplemental | fresh` recommendation before selection. A
`judgmentRequired: false` result is final, `merge-safety` never fires the method, and mechanical eligibility or
terminal position never substitutes for this result.

Obtain the Owner's typed choice and submit the returned `selectionAction` unchanged as `offer` beside that
`selection` to:

```bash
arc candidate applicability resolve {workUnitId} -
```

Commit a returned `commit-selection`, then re-enter through `arc review status`. `continue` retains the earlier
attempt; `request-review` re-enters status and receives the ordinary hosted request action. Applicability reruns,
check failures, and `base-moved / rerun-checkpoint` return to their typed checkpoint; `upgrade` and every `stop`
remain stops. Classified base movement on an exact pre-terminal member follows the returned ordinary review or
discharge action; unavailable or mismatched member movement stops. After any concluded attempt, invoke status again
for the arm-selected exact member target. A `member-discharged / continue-reconcile`
result permits that member's landing when `selectedMember.vehicle.deliverableId` matches the arm selection and its
target matches the resolved `targetRef`; later members may still need review. `settled / continue-reconcile` also
permits landing when a returned typed discharge conjunction is `discharged`; the typed settled variant without a
conjunction is also authoritative because no delivery-member conjunction remains to discharge. No other review-status
result permits landing preparation.

Apply `frontline-review`, then `standard-review` or `implementation-audit` as applicable, and settle findings through
`review-triage` and `review-response` before returning to the calling landing arm.

Only a native arm admitted by `member-discharged / continue-reconcile` or `settled / continue-reconcile` advances to
set-wide preparation:

```bash
arc delivery native land-prepare - --json
```

The request carries the selected arm, operation identity, and repository, remote, and protected-target locators —
never position facts. The handler freshly reobserves position before reserving the native effect.

Render the returned exact member/head set and consequence verbatim, including the atomic residual race. The terminal
member is never included. Every displayed head has independently passed the existing readiness, review, check, and
merge-lock reads.

> [!IMPORTANT]
> `integration-interlock`: Stop after native landing preparation. Surface the exact authorized member/head set and
> consequence; await approval before proceeding to the native submission.

After approval, submit only the prepared effect:

```bash
arc delivery native land-submit - --json
arc delivery native land-status - --json
```

For ordinary polling after submission, use `land-status`. `pending` retains the reservation and polls the same
persisted effect identity again. After a restart or interruption, invoke the general recovery verb with only the
plan, repository, and remote locators:

```bash
arc delivery reconcile - --json
```

A recovered `prepared` reservation makes no provider observation: it re-presents the exact member/head set and
consequence behind the same integration interlock, then invokes its returned `submitAction` unchanged after approval.
A recovered `submitting` reservation never resubmits: a persisted identity returns to polling, while a missing
identity is resolved only from exact all/partial/none/ambiguous effect facts.

Only a `retryable` / `cleared` / `delivery-native-land-select` result, returned after a persisted terminal `failed`
effect and exact `none-landed` observation, returns to preparation and a new interlock. `pending`, `partial-landed`,
unavailable, expired, contradictory, or ambiguous results stop with the reservation intact. A suffix reconciliation
refusal likewise retains that reservation; rerun `land-status` to reobserve and settle it without resubmitting. An
`applied` result is returned only after a `linked-single` result settles the complete recognized suffix-retarget path,
including contribution proof before new-head review admission, or a `linked-atomic` result performs its final
no-suffix state write.

## Review and land the current member

Supply only the canonical plan identity and repository and remote locators:

```json
{"planId":"<planId>","repository":"<repositoryRef>","remote":"origin"}
```

Read the next action from fresh handler observation:

```bash
arc delivery position - --json
```

Dispatch only on its typed route. `review-member` enters the review and landing path below with the returned
`selectedDeliverableId`. `teardown-member` skips review and landing and enters the teardown path below with its
exact `selectedDeliverableId`. `terminal-handoff` delegates to the terminal workflow. `operation-active` invokes
`arc delivery reconcile - --json` with the same locators and follows the recovery dispatch above.
`review-fix-routing-required` with `nextAction: plan-review-fix` renders its `recommendedActionText`, then invokes
the selector-free `arc delivery review-fix continue - --json` procedure below with no member or operation selector.
The controller derives the approved correction's member from the open correction task or, when none exists, the exact
unsettled approved review response; never infer that selection from terminal branch movement. Every other refusal
stops.

For `review-member`, settle exact member review authority above with the returned `selectedDeliverableId`. Only its
`member-discharged / continue-reconcile` result for that exact selected member, or its
`settled / continue-reconcile` result, returns here for ordinary landing preparation.

The preparation request carries that selection plus plan, repository, remote, target, lock, and tree locators — no
position facts. The handler freshly reobserves position before preparing the singleton effect.

```bash
arc delivery land prepare - --json
```

The handler freshly reobserves native-stack presence before any sequential reservation. Dispatch only on the typed
result:

- `prepared` — render the singleton member/head and its consequence. Fire one `integration-interlock` for exactly that
  effect. Approval authorizes only the displayed member/head; no other member or later head inherits it.
- `refused / registered-native-stack` — no reservation exists. Follow `recommendedActionText` to
  `arc delivery native land-select`. Do not unlink, change the selected member, or treat the refusal as merge
  approval.
- `refused / native-observation-unavailable` — restore authoritative observation; do not sequential-prepare.
- every other refusal stops.

After `prepared` approval:

```bash
arc delivery land apply - --json
```

The apply request carries the prepared presentation and repository locators, not position facts. The service
reobserves the exact selection and readiness before lock release and again before merge, then accepts only the
matching merged request, target, and contribution.

A semantic `native-stack-required` result is not a stale-suffix refresh. Only its returned
`retryable / cleared / delivery-native-land-select` transition, with `operationKind: land` and `mode: sequential`,
continues: invoke `arc delivery native land-select`, which freshly observes the canonical remaining chain, then
return through native preparation and a new integration interlock. If exact no-effect proof or the version-checked
clear fails, stop with the sequential reservation retained; do not infer refresh or ordinary landing preparation.

Do not advance until the effect and any remaining suffix reconciliation settle. A `retryable` result returns to
land prepare and a new integration interlock; it never reuses approval. A blocked or ambiguous result runs the
typed reconcile route and stops when that route does not settle:

```bash
arc delivery reconcile - --json
```

When landing refuses for a genuine conflict, `native-stale-suffix` requirement, or host up-to-date policy — or when
the operator explicitly chooses a refresh — plan from current canonical state. `native-stack-required` never enters
this arm; it follows the semantic native-selection transition above.

```bash
arc delivery refresh plan - --json
```

The request carries only the plan and repository locators plus that exact trigger. With no `mechanics` selection, an
exact registered presentation selects `provider-invoked`; other exact presentation selects `operator-initiated`.
Supply `"mechanics": "operator-initiated"` only when the operator explicitly selects the external fallback. Only
`refresh-required` continues. Render its exact `plannedSuffix`, mechanics, and `recommendedActionText`.
`provider-invoked` submits the same plan and repository locators with `{ "kind": "complete-remainder" }` as `scope`
to:

```bash
arc delivery refresh execute - --json
```

The provider-neutral service derives the exact bound remainder from plan and state. Its adapter prepares the native
refresh in an isolated repository, returns only exact candidate coordinates, and never publishes. ARC validates and
proves that result, reserves `rewrite / provider-refresh`, lease-publishes the changed member refs bottom-up, settles
the terminal top, removes the private candidates, and clears the reservation only with the final complete state.
`applied / verify-review-fix` enters the review-fix verification continuation below; any other `applied` returns to
`arc delivery position`. A `retryable` result with a retained reservation reruns this verb with only its exact
`operationId`; all-before retries the whole changed vector, a contiguous requested prefix resumes its untouched tail,
and any other mixed or unavailable observation stops. A retained `blocked / reconcile` result runs
`arc delivery reconcile` and follows its exact returned selector. A retained
`blocked / resolve-terminal-conflicts` result renders its exact `paths` and `recommendedActionText`.

> [!IMPORTANT]
> `workflow-interlock`: Stop on `blocked / resolve-terminal-conflicts`. Surface the returned conflict paths and
> guidance; await approval before proceeding to attended terminal conflict resolution.

After the approved resolution, run `arc delivery reconcile` and follow its exact returned selector.
A refusal before reservation leaves canonical refs and state unchanged. Render a returned `detail` verbatim before
stopping; it is bounded adapter diagnosis, not mutation authority. If the operator selects the external fallback,
rerun refresh planning with the same subject and trigger plus `"mechanics": "operator-initiated"`, then follow the
returned external-adoption arm.

`operator-initiated` is the external fallback. The operator refreshes the disclosed registered set through the
provider UI or supported procedure. That external refresh is unreserved: ARC has no provider mutation operation
while it runs, and the terminal top remains outside it. After the external operation settles, adopt only a fresh
complete observation:

```bash
arc delivery refresh adopt - --json
```

The request carries only the plan and repository locators; the CLI derives the remaining suffix. Before reserving,
the verb freshly observes the complete exact suffix and proves every changed contribution. It then reserves
`rewrite / provider-adoption` against the old and observed suffixes, reobserves and reproves that exact result,
absorbs the refreshed predecessor into the terminal top append-only, lease-publishes the top, and installs the
target, suffix, and terminal coordinates in one final state transition. It never records suffix-only state.

`applied / verify-review-fix` enters the review-fix verification continuation below; any other `applied` returns to
`arc delivery position`. A refusal before reservation leaves no operation. A blocked result after reservation
retains it; follow the returned `delivery-refresh-adopt` selector and rerun this verb with the exact `operationId`.
Recovery recognizes an already-created local merge and already-published top before retrying the final state
transition. Any other retryable result follows its precomposed action, and every refused or blocked result stops
without adopting ambiguous movement. Base movement alone never invokes this arm.

`conflict-resolution-required` is a pre-reservation stop. Render its complete `conflicts`,
`externalRefRestorations`, and `recommendedActionText` verbatim. Retain its `resolutionInput` as an opaque object;
do not reconstruct its revision, scope, digest, member IDs, or paths.

> [!IMPORTANT]
> `workflow-interlock`: Stop on `conflict-resolution-required`. Surface the exact conflict and restoration offer;
> await approval before resubmitting the exact adoption.

On approval, rerun `arc delivery refresh adopt` with the otherwise identical request plus the returned
`resolutionInput` as `conflictResolution`. The verb reobserves and reproves the complete suffix; only the exact
approved conflict set may be classified as changed, and every other movement still requires structural equivalence.
On decline, restore every returned external ref from `observedHead` to `restoreHead` through its exact Git lease;
a lease collision stops without changing delivery state. Then rerun delivery position.

Before authoring or publishing any approved correction while the canonical delivery remains bound, enter the
delivery-owned continuation with no member, operation, or state selector:

```bash
arc delivery review-fix continue - --json
```

The request carries only the repository and remote identities. The command derives the current member and exact next
step from the open correction task or, when none exists, the exact unsettled approved review response, then validates
that authority against the canonical plan, versioned Delivery State, persisted operation, Candidate, and public
boundary. Re-enter the same command after every returned step; never invoke a low-level correction verb from a
selector reconstructed in prose.

- `dispatch / dispatch` invokes `action.argv` with `action.input` unchanged, then re-enters this continuation
  without an interlock. The typed action may publish the selected correction, rematerialize the exact suffix, resume
  provider refresh/adoption, reconcile a persisted operation, or acknowledge completed scoped verification.
- `authoring-required / author-correction` returns to the calling task loop for the named authoring locus. Its
  `derivedFrom` names the canonical fact that selected the member and route — the open task, the pending approved
  review response, or the pending verification being superseded. Render `recommendedActionText` verbatim, author
  only in the returned `authoring` locus, run ordinary project gates there, then invoke `resumeAction`. Do not
  reconstruct or invoke a lower-level delivery mutation.
- `verification-required / verify-review-fix` enters the scoped verification section below. After the correction
  task closes, invoke `resumeAction` with only the returned verification result added to its input.
- `authority-required / dispatch-authority-action` preserves the exact Candidate-renewal, publication, or delivery
  status action. Candidate renewal requires `unchanged` before re-entry. A delivery-status action resumes the
  provider-neutral retained-member reducer directly; only its exact hosted-request result authorizes provider work.
- `repair-required / reauthor-plan` re-enters the returned `entry` authoring path, composes a supported replacement,
  then re-enters this continuation before correction work resumes.
- `idle / continue-work-unit` returns to the current non-delivery task. Every `refused` or downstream
  conflict/authority stop renders its typed reason and retains the durable continuation for retry.

The controller does not create an orchestration record. Registered publication, provider refresh, external adoption,
unregistered rematerialization, terminal rebind, and response-loss recovery retain their existing exact service
contracts; the controller only derives their strict inputs and prevents agent/user re-selection between them.
A content-neutral terminal absorption is allowed only when fresh Git tree-entry proof shows the refreshed highest
member's complete movement already exists in the checked-out top. Otherwise the ordinary content merge and attended
conflict route remain authoritative.

### Complete a review-fix verification continuation

`applied / verify-review-fix` from refresh settlement, `rematerialized / verify-review-fix`,
`rebound / verify-review-fix` from terminal correction settlement, and
`review-fix-verification-required / verify-review-fix` from execution entry all enter the same exact verification
continuation. Invoke [`validate-criteria`][validate-criteria] at member scope once for each retained
`memberDeliverableIds`. The linked selector contains the selected changed member plus every operator-approved
conflicted dependent; the rematerialized selector contains every contribution the arbiter found changed. An
arbiter-accepted contribution-equivalent dependent member is absent and re-verifies nothing. Bind Tier 1 to
`verification.target`. Rerun by default. Reuse is admissible only under `tier1Reuse` when an existing passed result
names exactly `targetTree` and every covered input is unchanged; inconclusive evidence reruns the tier.

Retain the completed checks as one `verificationResult`: the primary selects `targeted`, `focused`, or `full` to
describe the scope actually run, echoes the exact `target`, records non-empty evidence references for the
member-criteria and Tier 1 results, and records Tier 1 as passed with `provenance: rerun` or
`provenance: exact-tree-reuse`. The reuse arm also records `coveredInputs: unchanged`; both arms echo the exact target
tree. This is verification evidence for the exact correction delta, not a review verdict or signal-convergence
decision.

The verification stop offers one resubmission shape: its `resumeAction`. Return the `verificationResult` to the
calling task loop; after ordinary correction-task closure, invoke `resumeAction` with only `verification` added to
its input. The controller derives the exact acknowledgment locator from canonical state itself and re-enters
Candidate renewal; no acknowledgement input is echoed for the caller to retain. Do not acknowledge before task
closure. These actions ride the same finding-disposition approval; do not add an interlock.

After a member is authoritatively landed and its request is merged or closed, remove only its proven residue:

```bash
arc delivery teardown - --json
```

The request carries the position result's exact `selectedDeliverableId` plus the current plan, repository, protected
target, and remote locators — no position facts. The handler freshly reobserves position before teardown, making
`teardown-member` idempotent after reconciliation; never select a member from prose or provider order.

The CLI retains the exact member binding. For the highest non-terminal member, it first retargets an exact open
terminal request to the protected base under the teardown reservation, proves that result, and only then deletes the
proven member branch. Follow only its returned `nextAction`:

- `continue` returns to the position read for the next member.
- `terminal-checkpoint` enters the ordinary [`integrate-work-unit.md`][integrate-work-unit] workflow.
- `blocked / top-remedy-required` means the exact terminal request was already closed while its predecessor still
  exists. Surface its `reopen-and-retarget` remedy and stop. Await explicit user direction for that exact action;
  do not sequence or repair the request in workflow prose. After that explicit direction,
  invoke the reserved mutation surface with the current plan ID and returned repository, protected base, and action:

```bash
arc delivery top-remedy - --json
```

The command freshly rederives the terminal position and exact remedy before reserving and mutating. Follow
`teardown-member` by invoking teardown again for its exact `selectedDeliverableId`; `terminal-checkpoint` returns to
ordinary checkpoint composition when a host-refreshed terminal head first needs rebind. A
`trigger-ref-restore-required` result means an earlier deletion already made GitHub's closed request immutable:
surface its exact ref/head and stop for Owner approval before restoring only that missing ref, then rerun the same
top remedy. Any other refusal or blocked result stops with any persisted reservation intact.

## Terminal handoff

On `terminal-checkpoint`, delegate to [`integrate-work-unit.md`][integrate-work-unit]. Its checkpoint composes the
delivery arm from the current Candidate and retained member bindings, and its existing integration interlock owns the
terminal merge. Do not fire a delivery interlock here.

[integrate-work-unit]: ../work-unit-lifecycle/integrate-work-unit.md
[assess-evidence-applicability]: ../../../methods/assess-evidence-applicability.md
[review-chunking]: ../../../methods/review-chunking.md
[review-response]: ../../../methods/review-response.md
[review-triage]: ../../../methods/review-triage.md
[template-pull-request]: ../../../../reference/templates/arc/work-unit/template-pull-request.md
[validate-criteria]: ../../../methods/validate-criteria.md
