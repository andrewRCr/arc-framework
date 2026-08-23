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

The request carries only the attended `assess-boundary-fit` disposition and, when present, confirmation that the
provisional plan was reviewed. Render `laterEntryCostText` and `recommendedActionText` verbatim when present, then
dispatch the returned route; the workflow never parses headings, derives members, or re-decides cohesion:

- `not-applicable` returns to ordinary work-unit execution.
- `authoring-required` enters the existing inventory-schema, `from-tasks`, author-slot, and compose sequence.
- `canonicalize-provisional` runs that same canonicalization sequence or its receipt-pinned recovery.
- `validate-canonical` advances to eligibility.
- `resume-bound` reads delivery position and reconciles any named active operation before continuing.
- `refused` stops before every eligibility or mutation verb after rendering the precomposed refusal.

The inspection is read-only. It never treats the presence of prose as delivery judgment and never binds state.

## Validate and publish

Prepare the complete explicit candidate chain:

Keep disposable candidates outside `refs/heads/`: record each authored cut under
`refs/arc/delivery-candidates/{planId}/{chunkKey}` and use detached worktrees for project gates. Do not leave
ordinary slash-prefixed local branches or branched worktrees for these cuts — ARC may interpret them as work-unit
loci or cleanup residue. The private refs are identity-free locators only and grant no delivery authority.

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

Follow the typed result. `applied / read-position` returns to `arc delivery position`; any other `applied` result
follows its returned `nextAction`. A `retryable` result dispatches only one of these exact
`transition / action / selector` arms:

- `retryable / cleared / delivery-publish` with `operationKind: materialize` reruns
  `arc delivery publish`.
- `retryable / preserved / delivery-publish` with `operationKind: publish` revalidates and retries
  `arc delivery publish` against the retained reservation.
- `retryable / cleared / delivery-rematerialize` with `operationKind: rewrite` and `mode: review-fix` reruns
  `arc delivery rematerialize`.
- `retryable / cleared / delivery-native-observe` with `operationKind: rewrite` and
  `mode: provider-adoption` reruns `arc delivery native observe`.
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

Only after every request ID exists, an operator may register the exact non-terminal chain for native presentation:

```bash
arc delivery native link - --json
```

The CLI receives the explicit opt-in and exact plan/state-derived non-terminal member set; the terminal is never
registered. A one-member delivery has no registration set and skips this verb. `linked` continues only after a fresh
exact host observation. An opt-out `unlinked` result makes zero native host calls and enters the ordinary singleton
path. `downgrade-required` renders `recommendedActionText` verbatim and invokes the explicit unlink verb; `refused`
stops. On the linked path, refresh presentation facts before every landing:

```bash
arc delivery native observe - --json
```

Provider registration never selects member order and never enters the delivery plan or state.

## Select and execute the native landing arm

Immediately after the fresh native observation, select the service-owned arm:

```bash
arc delivery native land-select - --json
```

The selector derives the exact plan-ordered non-terminal remainder from current plan/state facts. An `unlinked` arm
or a preceding `downgrade-required` result invokes the presentation-only degradation verb:

```bash
arc delivery native unlink - --json
```

Only its fresh `unlinked` result continues through the ordinary singleton path below. Every other result renders its
precomposed guidance and stops without a landing mutation. `blocked` likewise renders `recommendedActionText` and
stops. A `linked-single` or explicitly selected direct `linked-atomic` result advances to set-wide preparation:

```bash
arc delivery native land-prepare - --json
```

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
persisted effect identity again. After a restart or interruption, invoke the general recovery verb instead:

```bash
arc delivery reconcile - --json
```

Only a `retryable` / `cleared` / `delivery-native-land-select` result, returned after a persisted terminal `failed`
effect and exact `none-landed` observation, returns to preparation and a new interlock. A missing identity, `pending`,
`partial-landed`, unavailable, expired, contradictory, or ambiguous result stops with the reservation intact. An
applied `linked-single` result must settle the existing recognized suffix-retarget path, including contribution proof,
before new-head review admission. An applied `linked-atomic` result has no remaining non-terminal suffix.

## Review and land the current member

Read the next action from:

```bash
arc delivery position - --json
```

Dispatch only on its typed route. `review-member` enters the review and landing path below with the returned
`selectedDeliverableId`. `teardown-member` skips review and landing and enters the teardown path below with its
exact `selectedDeliverableId`. `terminal-handoff` delegates to the terminal workflow. Every refusal stops.

For `review-member`, run the existing review sequence with the exact delivery-member vehicle returned by the CLI:

```json
{"kind":"delivery-member","planId":"<planId>","deliverableId":"<deliverableId>","workUnitSlug":"<workUnitSlug>"}
```

The vehicle binds the review to the exact head supplied by delivery; no second member-review verb or delivery-owned
review evidence exists. Apply `frontline-review`, then `standard-review` or `implementation-audit` as applicable,
and settle findings through `review-triage` and `review-response` before preparing a landing.

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

Do not advance until the effect and any remaining suffix reconciliation settle. A `retryable` result returns to
land prepare and a new integration interlock; it never reuses approval. A blocked or ambiguous result runs the
typed reconcile route and stops when that route does not settle:

```bash
arc delivery reconcile - --json
```

Apply review fixes to the freshly authored suffix, run the ordinary project gates for every candidate, then invoke
the composed rematerialization service with only the exact selected-member IDs and raw candidate locators:

```bash
arc delivery rematerialize - --json
```

The service recloses suffix eligibility and recomputes carried-contribution proof before every reserved rewrite.
It executes in plan order, using each persisted result as the next predecessor; candidate movement or unselected
contribution drift stops with the current reservation/state intact. Never invoke the low-level rewrite verb as an
operator-assembled batch.

A successful `verify-review-fix` next action means the service has re-adopted the freshly recut suffix beneath the
content-neutral top, published that exact top, and version-rebound the terminal state. Invoke
[`validate-criteria`][validate-criteria] at member scope once for each ID in `memberDeliverableIds`; the list contains
only contributions changed by the approved fix. An arbiter-accepted contribution-equivalent member, including a
successful mechanical reapply after predecessor movement, is absent and re-verifies nothing. Then honor
`tier1Required` by rerunning Tier 1 over the rebound top. These actions ride the same finding-disposition approval;
do not add an interlock.

After a member is authoritatively landed and its request is merged or closed, remove only its proven residue:

```bash
arc delivery teardown - --json
```

The request carries the position result's exact `selectedDeliverableId` plus the current plan, repository, protected
target, remote, and freshly observed position facts. This makes `teardown-member` idempotent after reconciliation;
never select a member from prose or provider order.

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
