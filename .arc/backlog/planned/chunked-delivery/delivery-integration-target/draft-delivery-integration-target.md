# Draft: delivery-integration-target — guarded delivery through a private target

- **Cohort:** `chunked-delivery` — `cohort-chunked-delivery.md` owns the shared v1 lifecycle, robustness floor,
  non-goals, and hardening-admission boundary.
- **Purpose:** Execute the work-unit integration-target projection by landing planned members sequentially on a
  private target, then hand the completed contribution to the existing work-unit integration lifecycle.
- **Position:** Depends only on `delivery-plan-record`. It is the first executable consumer of the plan and state
  contract; stack-specific behavior remains in `delivery-stack-topology`.

---

## Goals

- Preserve the authored member order and bind every landing to exact expected target, head, and tree coordinates.
- Make interruption safe through the shared single-active-operation state rather than through branch-name inference or
  a new delivery history.
- Refuse unexpected target movement and leave the operator a typed, current-state remedy.
- Reuse ordinary member review and work-unit integration instead of constructing parallel assurance gates.
- Preserve today's one-branch/one-pull-request path for a one-member plan.

## Projection lifecycle

Let `I0` be the exact private integration-target head at bind and `Ik` the observed target after members `D1 … Dk`
have landed.

1. **Prepare the next member.** Only `D(k+1)` may open against `Ik`. Bind its exact ref and change request in
   `DeliveryState`; later members remain intent, not active host operations.
2. **Reserve and reobserve.** Reserve the landing operation with the expected plan revision, state version, member,
   target head/tree, and member head/tree. Immediately reobserve the Git and change-request authorities. Any mismatch
   refuses before mutation.
3. **Land once.** Invoke the ordinary merge capability for that one member. V1 does not loop a multi-member merge or
   simulate host atomicity.
4. **Reobserve and reconcile.** Read the resulting target coordinates and prove that the target contribution advanced
   by exactly the planned member. Record the current coordinates and clear the operation with a version-checked write.
   An ambiguous or rider-bearing result remains blocked for explicit repair or replacement.
5. **Repeat.** The observed `I(k+1)` becomes the exact predecessor for the next member.
6. **Complete the work unit.** After `Dn`, reobserve the private target, reconcile it with the current protected base,
   and construct the ordinary work-unit integration candidate. Existing review applicability, verification,
   integration-interlock, and exact-head merge rules govern that candidate.

A one-member plan uses the existing work-unit pull request directly. It needs no private target, intermediate ref, or
extra change request; the state still binds the exact plan revision and current carrier.

## Robustness floor

- Every mutation follows reserve → reobserve → mutate → reobserve → version-checked completion.
- The reducer admits only the next planned member and only at the expected target coordinates.
- Post-observation compares exact trees or exact contribution, not merge-message, branch-name, or provider status
  heuristics.
- A recognized operation result may complete after a crash. Unknown movement never becomes a member implicitly.
- Base reconciliation that changes interacting content creates a new ordinary work-unit review target before final
  integration.
- The private target is a delivery projection, not a second work-unit identity or lifecycle locus.

## Explicit non-goals

This member does not add:

- a durable observation log, assurance ledger, terminal-proof record, or historical reconstruction API;
- group review, seam receipts, cross-pull-request receipt projection, or a terminal whole-series review pass;
- parallel member landing, atomic-prefix or ordered-prefix capability algebra, or provider-native stack APIs;
- a generalized pull-request provider framework beyond the narrow operations this projection invokes;
- automatic repair of an arbitrary changed target, or adoption of unplanned commits as delivery members;
- mixed topology segments or direct-to-base landing; or
- a replacement for work-unit verification, candidate-tail handling, integration authorization, or merge locking.

## Hardening boundary

The cohort's hardening-admission rule applies. In particular, a proposed store, identity, retry state, provider
capability, or proof record must answer a demonstrated failure in this sequential lifecycle. Supporting a hypothetical
future adapter or making the result more auditable is not sufficient by itself.

## Open implementation details

- The exact Git/change-request port method names and observation field spelling derive from the shared typed schema.
- The private target's ref naming is a projection detail and must not become work-unit identity.
- The terminal contribution comparison may use tree subtraction or an equivalent exact repository operation; it does
  not need a persisted proof object.
