# Draft: Give Delivery Slices an Exact-Head Review Vehicle

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit`, housekeep drain (2026-07-30); captured during
  `decompose-transform-integrity` delivery 01 integration.
- **Purpose:** Admit a delivery member into the existing exact-head review lifecycle as a typed, parent-bound
  vehicle, so an independently landable slice can earn clearance without forging a work-unit or Errand identity
  and without weakening either of those stricter contracts.
- **Position:** The delivery/review seam. `delivery-stack-topology` (the v1 delivery spine, coordinated in
  `cohort-chunked-delivery.md`) consumes this work unit for member review admission. Both upstream
  contracts have shipped: `delivery-plan-record` supplies authoritative plan and member identity
  (`DeliveryStateV1`), and `merge-readiness-control` supplies the draft-first merge lock a member PR opens under.

---

## Problem / Motivation

A manually cut delivery slice passed local and hosted CI, hosted review, and thread settlement at one exact head,
yet clearance refused with `vehicle-branch-mismatch`. The slice branch intentionally carried neither the canonical
work-unit slug nor independent lifecycle metadata, while the review vehicle schema admitted only work units and
Errands.

Branch protection correctly prevented an administrative shortcut. Without a typed slice vehicle, reviewed delivery
members cannot reach the status the repository requires, and every stack must choose between weakened protection
and forged identity.

## Decision — general-schema vehicle, authenticated by state lookup

A third member of the general `ReviewVehicleSchema` union (`readiness.ts`, mirrored in `operation-state-schema.ts`),
peer to `work-unit` and `errand`. Settled over the alternative (an admission path behind the delivery substrate)
because every variant of that alternative either re-presents an identity the gate already admits (forged identity),
delegates admission to delivery (delivery-authored review authority, forbidden by the cohort contract), or mints a
parallel admission path (a second review system, a cohort non-goal).

- **The binding:** the vehicle names the delivery plan, member, owning work unit, and exact base and head. Every
  field earns its place by a readiness check that consumes it; anything readiness does not validate is not bound.
- **Authentication replaces branch naming.** The existing branch-encodes-slug check cannot apply — a member branch
  carries no slug by design, and branch naming is presentation only. Readiness instead authenticates the vehicle
  against the shipped delivery contract: the PR's exact head ref must match the member's current binding in
  `DeliveryStateV1` (reverse lookup from member ref to owning plan, member, and work unit). Stronger than a naming
  convention, and the direct fix to the refusal that spawned this work unit.
- **Review never re-models delivery.** Delivery facts enter through a narrow read of the shipped state contract.
  Review stores nothing delivery-shaped beyond the vehicle's own fields; delivery stores nothing review-shaped —
  the boundary the `delivery-plan-record` scope correction deliberately established.
- **Non-final members skip work-unit lifecycle readiness.** The meta-presence, archive-candidate, and cohort
  closeout facts that govern a `work-unit` vehicle do not apply — a member PR excludes lifecycle artifacts by
  design. This absence is what the distinct kind buys; the vehicle adds identity checks, not lifecycle ones.

**Settled: the terminal member needs no new vehicle.** In a stack, the final member carries the work unit's
lifecycle tail and completes the work unit — it is the WU's own terminal change and admits under the existing
`work-unit` vehicle unchanged. The `delivery-member` kind serves non-final members only, which keeps the new
surface strictly smaller. The uniform alternative (every member presents `delivery-member`) was rejected: the
final/non-final distinction already exists in the stack contract, and a terminal member vehicle would have to
duplicate or drop the work-unit lifecycle facts — both worse than reusing the vehicle that already owns them.

## Constraints (claimed as properties, not mechanisms)

- **Evidence cannot authorize a later head or member.** Falls out of exact-head binding — evidence attaches to one
  exact head; a rebased or advanced member is a new head with no clearance. No invalidation machinery is built;
  existing review applicability decides whether prior coverage carries after a rewrite.
- **Landing order is not review's question.** Predecessor relation and independently-landable state are landing-time
  guards owned by `delivery-stack-topology`'s reserve/reobserve cycle. Review admission authenticates identity at an
  exact head; it does not gate sequence.
- **The stricter contracts stay strict.** `work-unit` and `errand` vehicle semantics are untouched; nothing widens
  to fit an identity it does not model.
- **No protocol-chain contact.** The change stays inside the vehicle/readiness seam — no touch on convergence,
  source-authority, activity- or request-contract surfaces pending the review-architecture right-sizing.

## Explicit non-goals (carry into the spec)

Scope guardrails for the spec and every review pass over it — adversarial review, pre-implementation audit, and
code review alike. Per the cohort's hardening-admission boundary (`cohort-chunked-delivery.md`), a finding is
blocking only when it demonstrates a concrete failure, authority violation, or unsafe ambiguity in the supported
path; a proposal that crosses one of the lines below is a scope change to be accepted through a design amendment —
never a required fix promoted silently. "More robust," "more general," and hypothetical future hosts, storage
tiers, or review models are not admission on their own:

- **No delivery-authored review authority.** The review router stays authoritative for obligation, applicability,
  findings, and clearance; the vehicle is an identity the router admits, never a verdict source.
- **No review-shaped records in delivery, no delivery-shaped records in review** beyond the vehicle's own fields.
  In particular, nothing resurrected from the pre-cut plan-record design: no assignment/observation/assurance
  stores, no assurance-subject identities, no review-routing payloads.
- **No evidence machinery.** No receipts, ledgers, invalidation records, or coverage projections — exact-head
  binding plus existing review applicability is the entire mechanism.
- **No landing semantics in review admission.** Predecessor order, stack eligibility, and landing guards stay in
  `delivery-stack-topology`; the vehicle authenticates identity at an exact head only.
- **No change to `work-unit` or `errand` vehicle semantics** — not widened, not parameterized, not shared-field
  refactored beyond what adding a union member mechanically requires.
- **No aggregate or terminal review pass, review groups, or request-cardinality mechanics** — that pressure routes
  to `delivery-review-cardinality`'s own activation threshold, not here.
- **No contact with the review protocol chain** (convergence, source authority, activity/request contracts) —
  those surfaces are pending right-sizing and this work unit must not deepen them.
- **No new stores, verbs, or host capabilities** beyond the readiness branch, the narrow delivery-state read, and
  existing clearance publication.

## Unknowns and Assumptions

- The exact readiness-fact set for a `delivery-member` vehicle — which of the shared facts (PR match, open state,
  exact head) carry over unchanged, plus the state-lookup facts that replace the branch and lifecycle checks.
- The shape of the delivery read port readiness consumes (existing state-store read vs. the reverse-lookup surface)
  — an implementation choice for the spec, not a design fork.
- Whether member PRs under `merge.lock: draft` need any member-specific lock-resolve behavior, or the existing
  resolve path serves once readiness admits the vehicle (assumed: the latter).
- Host-status publication is assumed to reuse the existing clearance publication path per vehicle, with nothing
  member-specific.

## Scope Estimate

Medium (days): one schema union member mirrored in two files, one readiness validation branch backed by a narrow
delivery-state read, policy/test coverage, and the workflow prose that names the member-review step. No new stores,
no new verbs expected.

Dependencies: none open — `delivery-plan-record` and `merge-readiness-control` both shipped; `delivery-stack-topology`
depends on this work unit.
