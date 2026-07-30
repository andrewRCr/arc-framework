# Draft: delivery-integration-target — the work-unit-scoped integration projection

- **Cohort:** `chunked-delivery` — see `cohort-chunked-delivery.md` for the shared canonical model,
  the problem framing, the field evidence the design rests on, and the cut that produced this member.
- **Purpose:** Own the work-unit-scoped integration-target reducer, the generic Git / pull-request
  delivery-host adapter, and the terminal integration ceremony. This is the default topology: chunk
  change requests accumulate on a private integration target and the unit reaches the protected base once.
- **Position:** depends only on `delivery-plan-record`. Together the two make the mechanism usable, and
  the remaining members are their first consumers.

---

## Integration-target projection

**WU-integration-target reducer.** Let `I0` be the exact integration-target head at bind and `Ik` the reconciled head
after `D1 … Dk` have landed there.

- A one-member plan preserves today's one-branch / one-PR path: its existing WU → `main` carrier is both the sole
  member target and terminal carrier. The reducer proves and records one member landing with no intermediate ref,
  extra PR, or topology-created terminal delta; any actual post-review candidate tail still follows the terminal-delta
  contract.
- Only `Dk+1` may materialize or publish. Its ref begins at `Ik`, its PR directly targets the integration ref at
  `Ik`, and no later member is admitted until it lands. This multi-member rule begins at two members.
- A deliverable landing is always the singleton `{Dk+1}`. Post-reconcile proves the new `I(k+1)` tree equals applying
  that member's current reviewed range to `Ik`; commit identity and merge method are irrelevant.
- Intermediate landings never touch `main` and do not consume the final-integration window. After `Dn`, reconcile the
  current `main` head, construct the WU candidate against that exact base, and prove its contribution equals the
  ordered `D1 … Dn` series with no integration-target rider.
- Base reconciliation that changes the candidate's interacting paths creates a new terminal target and follows the
  review applicability / retrigger contract. Only the exact settled candidate reaches the integration interlock and
  the one WU → `main` landing.

Unexpected integration-ref movement is never adopted as another member. A recognized result of the reserved landing
operation may advance the prefix; any other extra commit or ambiguous result blocks for an explicit replan or repair.
