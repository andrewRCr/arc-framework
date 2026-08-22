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

## Validate and materialize

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

A refusal stops without materialization. An eligible result closes the workflow-owned gate bracket but is never
mutation input. Supply the plan ID plus the same candidate refs and checkout locators to:

```bash
arc delivery materialize - --json
arc delivery publish - --json
```

These verbs resolve the current plan and lifecycle paths and rerun mechanical eligibility against the exact post-gate
checkouts. Materialization creates or adopts every member ref before publication opens any request: delivery refs in
plan order, then the content-neutral top adoption and ordinary top-branch push. Publication opens requests bottom-up,
each based on its predecessor branch; the terminal request uses the originating branch over the highest delivery ref.
Set `draft` from the configured `merge.lock` posture (`draft` ⇒ `true`) so every request opens under the configured
hold; the landing sequence releases that lock only after readiness.

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
The complete presentation set validates before the first ref push. The verb derives non-terminal titles from the
canonical plan and uses authored presentation only when creating a missing request; an exact existing request is
adopted unchanged. A failed request step retains its reservation for `reconcile` or an exact publication retry.

After interruption, rerun the candidate gates before invoking the mutation verbs again. Resume any persisted
reservation through:

```bash
arc delivery reconcile - --json
```

Supply only the plan, repository, and remote locators. The verb dispatches on the persisted operation kind and
derives its Git, request, target, and contribution evidence itself; never serialize an operation observation into
the request.

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

Dispatch only on the typed result. `pending` retains the reservation; after a restart, invoke `land-status` with
only the plan, request, and remote locators rather than submitting again. The service resolves the persisted effect
identity from delivery state. `retryable` / `none-landed` returns to preparation and a new interlock.
`partial-landed`, unavailable, expired, or ambiguous results stop with the reservation intact. An applied
`linked-single` result must settle the existing recognized suffix-retarget path, including contribution proof, before
new-head review admission. An applied `linked-atomic` result has no remaining non-terminal suffix.

## Review and land the current member

Read the next action from:

```bash
arc delivery position - --json
```

For a non-terminal member, run the existing review sequence with the exact delivery-member vehicle returned by the
CLI:

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

The CLI's returned `nextAction` selects the next member, reconciliation, or terminal handoff. Workflow prose does
not implement a loop.

## Terminal handoff

Before delegating, derive the repository-owned terminal handoff:

```bash
arc delivery terminal prepare - --json
```

`blocked` stops. `absorbed` means the command applied the exact ordinary append-only base reconcile; run Tier 1 and
rerun the command from fresh facts. Only `terminal-ready` delegates to the ordinary
[`integrate-work-unit.md`][integrate-work-unit] workflow. Its existing integration interlock owns the terminal merge;
do not fire a delivery interlock. Both fresh-merge and already-merged resume converge on the workflow's single
post-merge delivery adoption call before close or teardown. Repeated adoption is idempotent, and an ordinary work
unit returns `not-applicable`.

[integrate-work-unit]: ../work-unit-lifecycle/integrate-work-unit.md
[template-pull-request]: ../../../../reference/templates/arc/work-unit/template-pull-request.md
[validate-criteria]: ../../../methods/validate-criteria.md
