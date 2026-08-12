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

```bash
arc delivery eligibility prepare --input - --json
```

Bracket each candidate's ordinary project gates with the returned exact checkout/head coordinates, then close the
same observation window:

```bash
arc delivery eligibility close --input - --json
```

A refusal stops without materialization. An eligible result is ephemeral input to:

```bash
arc delivery materialize --input - --json
arc delivery publish --input - --json
```

These verbs create or adopt the guarded refs and requests in plan order. Resume any persisted reservation through:

```bash
arc delivery reconcile --input - --json
```

After the exact chain exists, an operator may opt into native presentation:

```bash
arc delivery native link --input - --json
```

The CLI receives the explicit opt-in and exact plan/state-derived member set. `linked` continues only after a fresh
exact host observation. `unlinked` makes no native call. `downgrade-required` renders `recommendedActionText`
verbatim and enters the explicit unlink path; `refused` stops. Before every landing, refresh presentation facts:

```bash
arc delivery native observe --input - --json
```

Provider registration never selects member order and never enters the delivery plan or state.

## Review and land the current member

Read the next action from:

```bash
arc delivery position --json
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
arc delivery land prepare --input - --json
```

Render the prepared singleton member/head and its consequence. Fire one `integration-interlock` for exactly that
effect. Approval authorizes only the displayed member/head; no other member or later head inherits it. After approval:

```bash
arc delivery land apply --input - --json
```

Do not advance until the effect and any remaining suffix reconciliation settle. A `retryable` result returns to
land prepare and a new integration interlock; it never reuses approval. A blocked or ambiguous result runs the
typed reconcile route and stops when that route does not settle:

```bash
arc delivery reconcile --input - --json
```

Apply review fixes to the freshly authored suffix through the exact rewrite service, then repeat eligibility and
ordinary gates before any later landing:

```bash
arc delivery rewrite --input - --json
```

After a member is authoritatively landed and its request is merged or closed, remove only its proven residue:

```bash
arc delivery teardown --input - --json
```

The CLI's returned `nextAction` selects the next member, reconciliation, or terminal handoff. Workflow prose does
not implement a loop.

## Terminal handoff

When delivery reports the terminal member ready, delegate to the ordinary
[`integrate-work-unit.md`][integrate-work-unit] workflow. Its existing integration interlock owns the terminal merge;
do not fire a delivery interlock. Both fresh-merge and already-merged resume converge on the workflow's single
post-merge delivery adoption call before close or teardown. Repeated adoption is idempotent, and an ordinary work
unit returns `not-applicable`.

[integrate-work-unit]: ../work-unit-lifecycle/integrate-work-unit.md
