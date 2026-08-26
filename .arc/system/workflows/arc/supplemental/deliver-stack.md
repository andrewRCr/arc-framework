---
purpose: Execute or resume one canonical delivery stack through exact-head review, attended landing, and ordinary terminal integration.
audience: agent
arc:
  methods:
    - frontline-review
    - standard-review
    - implementation-audit
    - review-triage
    - review-response
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
was reviewed) or the closed `{ "entryMode": "integrating" }` context supplied by ordinary integration's pre-push
dispatch. Render `laterEntryCostText` and `recommendedActionText` verbatim when present, then dispatch the returned
route; the workflow never parses headings, derives members, or re-decides cohesion:

- `not-applicable` returns to ordinary work-unit execution, including singleton integration from the pre-push door.
- `authoring-required` enters the existing inventory-schema, `from-tasks`, author-slot, and compose sequence.
- `canonicalize-provisional` runs that same canonicalization sequence or its receipt-pinned recovery.
- `validate-canonical` advances to eligibility.
- `resume-bound` reads delivery position and reconciles any named active operation before continuing.
- `refused` stops before every eligibility or mutation verb after rendering the precomposed refusal.

The inspection is read-only. It never treats the presence of prose as delivery judgment and never binds state.

## Validate and publish

Resolve the complete plan's exact disposable authoring locators:

```bash
arc delivery authoring locate - --json
```

Record each authored cut at its returned private candidate ref and run project gates in the matching returned
detached gate path. Do not leave ordinary local branches or branched worktrees for these cuts — ARC may interpret
them as work-unit loci or cleanup residue. The private refs are identity-free locators only and grant no delivery
authority.

```bash
arc delivery eligibility prepare - --json
```

Bracket each candidate's ordinary project gates with the returned exact checkout/head coordinates, then close the
same observation window:

```bash
arc delivery eligibility close - --json
```

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
Supply that complete presentation set with the plan ID, repository locators, and the same candidate refs and checkout
locators to the sole initial mutation verb:

```bash
arc delivery publish - --json
```

A refusal stops without publication. The verb resolves the current plan and originating top from repository-owned
work-unit state, validates the complete presentation set, and reruns mechanical eligibility against the exact
post-gate checkouts before the first ref push or host mutation. It then creates or adopts every member ref before
opening any request: delivery refs in plan order, the content-neutral top adoption and ordinary top-branch push, then
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
follows its returned `nextAction`. A `retryable` result dispatches only one of these exact
`transition / action / selector` arms:

- `retryable / cleared / delivery-publish` with `operationKind: materialize` reruns
  `arc delivery publish`.
- `retryable / preserved / delivery-publish` with `operationKind: publish` revalidates and retries
  `arc delivery publish` against the retained reservation.
- `retryable / cleared / delivery-rematerialize` with `operationKind: rewrite` and `mode: review-fix` reruns
  `arc delivery rematerialize`.
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
and narrow `mode` when present as the authoritative reservation subject. Render `recommendedActionText` verbatim and
let the named ordinary verb reobserve and prepare every other input; workflow prose infers neither a selector nor a
recovery policy. Any unlisted action/transition/selector pairing, or any blocked, refused, unavailable, or ambiguous
result, stops with its reason rendered.

Only after every request ID exists, compose the exact non-terminal native-link request without `optIn` and invoke:

```bash
arc delivery native link - --json
```

Only `decision-required` continues. Render both texts verbatim — `recommendedOptInText` and
`recommendedOptOutText` — before asking the operator to choose. This is the choice surface, not a capability check.
After the choice, set `optIn` to its exact boolean value and resubmit the otherwise unchanged request:

```bash
arc delivery native link - --json
```

The terminal is never registered. A one-member delivery has no registration set and skips both invocations. `linked`
continues only after a fresh exact host observation. An opt-out `unlinked` result makes zero native host calls and
enters the ordinary singleton path. `downgrade-required` renders `recommendedActionText` verbatim and invokes the
explicit unlink verb; `refused` stops. On the linked path, refresh presentation facts before every landing:

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

Only its fresh `unlinked` result continues through the ordinary singleton path below. Every other result renders its
precomposed guidance and stops without a landing mutation. `blocked` likewise renders `recommendedActionText` and
stops. A `linked-single` or explicitly selected direct `linked-atomic` result binds `selectedDeliverableId` to its
first returned member and settles exact member review authority before set-wide preparation.

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

Dispatch only on `nextAction`. `review-hosted-request` means pass the returned action unchanged to:

```bash
arc review hosted request -
```

On `requested / await`, pass the returned self-contained handle to:

```bash
arc review hosted await -
```

`pending / await` reuses that handle for one more bounded call; `pending / inspect-or-extend` stops with the request
intact. Feed `clean`, `findings`, and safe-unavailability results to the existing review driver. For approved hosted
finding settlement, execute the returned settlement plan in phase order through:

```bash
arc review hosted settle -
```

`resolve-review-applicability` renders `selectionAction.interactionText`, obtains the Owner's typed choice, and
submits the returned `selectionAction` unchanged as `offer` beside that `selection` to:

```bash
arc candidate applicability resolve {workUnitId} -
```

Commit a returned `commit-selection`, then re-enter through `arc review status`. `continue` retains the earlier
attempt; `request-review` re-enters status and receives the ordinary hosted request action. Applicability reruns and
check/base movement return to their typed checkpoint; `upgrade` and every `stop` remain stops. After any concluded
attempt, invoke status again. The CLI selects the next retained target; only `settled / continue-reconcile` permits
either landing preparation. A returned typed discharge conjunction must be `discharged`; the typed settled variant
without a conjunction is also authoritative because no delivery-member conjunction remains to discharge.

Apply `frontline-review`, then `standard-review` or `implementation-audit` as applicable, and settle findings through
`review-triage` and `review-response` before returning to the calling landing arm.

Only the settled native arm advances to set-wide preparation:

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
persisted effect identity again. After a restart or interruption, invoke `land-status` with the same exact request;
it also recovers a synchronous merged result whose effect identity was never assigned. The general recovery verb
delegates an active native reservation to that same status-and-settlement path:

```bash
arc delivery reconcile - --json
```

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
`review-fix-routing-required` with `nextAction: plan-review-fix` renders its `recommendedActionText`, then enters
the correction route below only after the correction's approved scope supplies the selected member. Never infer
that selection from terminal branch movement. Every other refusal stops.

For `review-member`, settle exact member review authority above with the returned `selectedDeliverableId`. Only its
`settled / continue-reconcile` result returns here for ordinary landing preparation.

The preparation request carries that selection plus plan, repository, remote, target, lock, and tree locators — no
position facts. The handler freshly reobserves position before preparing the singleton effect.

```bash
arc delivery land prepare - --json
```

Render the prepared singleton member/head and its consequence. Fire one `integration-interlock` for exactly that
effect. Approval authorizes only the displayed member/head; no other member or later head inherits it. After approval:

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
`applied` returns to `arc delivery position`. A `retryable` result with a retained reservation reruns this verb with
only its exact `operationId`; all-before retries the whole changed vector, a contiguous requested prefix resumes its
untouched tail, and any other mixed or unavailable observation stops. A refusal before reservation leaves canonical
refs and state unchanged. Stop; if the operator selects the external fallback, rerun refresh planning with the same
subject and trigger plus `"mechanics": "operator-initiated"`, then follow the returned external-adoption arm.

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

`applied` returns to `arc delivery position`. A refusal before reservation leaves no operation. A blocked result
after reservation retains it; follow the returned `delivery-refresh-adopt` selector and rerun this verb with the
exact `operationId`. Recovery recognizes an already-created local merge and already-published top before retrying
the final state transition. Any other retryable result follows its precomposed action, and every refused or blocked
result stops without adopting ambiguous movement. Base movement alone never invokes this arm.

Before authoring or publishing any approved correction while the canonical delivery remains bound, identify the
selected member from the correction's approved scope and select the mutation route. Never infer the selected member
from terminal branch movement:

```bash
arc delivery review-fix plan - --json
```

Supply only the plan, repository, remote, and selected-member locators. `planned / provider-refresh` means a fresh
read found the canonical remaining chain exactly registered. An already-authored terminal correction is authoring
movement only, not public position authority or member selection. On the registered route, project the exact approved
correction onto the selected member's derived candidate ref, run its ordinary project gates, then invoke:

```bash
arc delivery review-fix publish - --json
```

The verb derives the candidate ref and lifecycle paths, requires its supplied checkout to be tracked-clean and exact,
requires the candidate to extend the current bound member, reobserves exact registration immediately before mutation,
then lease-publishes only that member under `rewrite / selected-change`.
`execute-provider-refresh` carries the returned selected member as a `dependent-suffix` scope directly into
`arc delivery refresh execute`; do not stop for another attended choice. The executor keeps that selected head fixed,
prepares only its dependents, and still uses the same path when no dependent moves because terminal-top absorption is
owed. Keep the returned verification selector across that continuation. External operator refresh plus
`arc delivery refresh adopt` remains a fallback selected by refresh planning, not the registered review-fix default.

`planned / rematerialize` means a fresh read found the canonical remaining chain exactly unregistered. Apply the
approved fix to the top authoring locus first, cut the complete suffix from that updated content, and run the ordinary
project gates for every candidate. Then invoke the composed fallback with the exact selected-member IDs and raw
candidate locators:

```bash
arc delivery rematerialize - --json
```

The service recloses suffix eligibility and recomputes carried-contribution proof before every reserved rewrite.
It executes in plan order, using each persisted result as the next predecessor; candidate movement or unselected
contribution drift stops with the current reservation/state intact. Its exact eligibility refusal is authoritative;
`completeness-mismatched` means the recut did not originate from top content carrying the approved fix. Never invoke
the low-level rewrite verb as an operator-assembled batch.

Every partial, incoherent, ambiguous, malformed, unsupported, or unavailable presentation stops before candidate
authoring or mutation; do not infer linked or unlinked behavior from provider identity. Provider commands and UI are
adapter/operator concerns, while the workflow carries only the provider-neutral route and affected suffix.

After provider-refresh execution returns `applied`, or after the fallback returns `verify-review-fix`, invoke
[`validate-criteria`][validate-criteria] at member scope once for each retained `memberDeliverableIds`. The linked
selector contains the selected changed member; the fallback selector contains every contribution the arbiter found
changed. An arbiter-accepted contribution-equivalent dependent member is absent and re-verifies nothing. Then honor
`tier1Required` by rerunning Tier 1 over the rebound top. These actions ride the same finding-disposition approval;
do not add an interlock.

After a member is authoritatively landed and its request is merged or closed, remove only its proven residue:

```bash
arc delivery teardown - --json
```

The request carries the position result's exact `selectedDeliverableId` plus the current plan, repository, protected
target, and remote locators — no position facts. The handler freshly reobserves position before teardown, making
`teardown-member` idempotent after reconciliation; never select a member from prose or provider order.

The CLI retains the exact member binding, deletes the proven remote branch, and, after the highest non-terminal
member, immediately reobserves the top request. Follow only its returned `nextAction`:

- `continue` returns to the position read for the next member.
- `terminal-checkpoint` enters the ordinary [`integrate-work-unit.md`][integrate-work-unit] workflow.
- `retarget` or `reopen-and-retarget` surfaces the typed failure-only remedy and stops. Await explicit user direction
  for that exact action; do not sequence or repair the request in workflow prose. After that explicit direction,
  invoke the reserved mutation surface with the current plan ID and returned repository, protected base, and action:

```bash
arc delivery top-remedy - --json
```

The command freshly rederives the terminal position and exact remedy before reserving and mutating. Follow only its
returned `terminal-checkpoint`; a refusal or blocked result stops with any persisted reservation intact.

## Terminal handoff

On `terminal-checkpoint`, delegate to [`integrate-work-unit.md`][integrate-work-unit]. Its checkpoint composes the
delivery arm from the current Candidate and retained member bindings, and its existing integration interlock owns the
terminal merge. Do not fire a delivery interlock here.

[integrate-work-unit]: ../work-unit-lifecycle/integrate-work-unit.md
[template-pull-request]: ../../../../reference/templates/arc/work-unit/template-pull-request.md
[validate-criteria]: ../../../methods/validate-criteria.md
