# Draft: delivery-stack-topology — guarded ordered delivery to the protected base

- **Cohort:** `chunked-delivery` — `cohort-chunked-delivery.md` owns the shared v1 lifecycle, robustness floor,
  non-goals, and hardening-admission boundary.
- **Purpose:** Execute a human-authored stack to the protected base while preserving exact member order, member-sized
  review and authorization, lifecycle-artifact isolation, and resumability from the owning work-unit control locus.
- **Position:** Depends on `delivery-plan-record` and `delivery-integration-target`. It reuses their state and operation
  boundaries and adds only stack-specific eligibility, ref topology, landing, and review-vehicle behavior.

---

## Goals

- Validate that every planned member can leave the protected base green and semantically coherent before external
  binding.
- Materialize an ordered member-ref and pull-request chain without treating provider stack metadata or branch names as
  authority.
- Land one exact member at a time through existing review and integration authorization.
- Reconcile the remaining suffix after each landing without rewriting the owning work-unit control branch.
- Keep active lifecycle artifacts out of every non-final member and preserve ordinary session resolution for unrelated
  work.
- Resume from `DeliveryState` and the retained control locus after interruption.

## Stack eligibility

The author supplies member boundaries. Before the first pushed ref or opened change request binds the plan, construct
and test disposable candidate heads for those boundaries:

- each member must pass the relevant gates at its own head;
- each intermediate tree must expose a semantically coherent supported surface; and
- any compatibility cap or temporary dormant surface must be understood as real stack cost, not generated
  automatically.

An independently green but semantically incomplete member is not stack eligible. Use the integration-target
projection when the concern cannot leave the protected base coherent in increments. Do not introduce mixed topology
segments or split the concern into sibling work units merely to obtain incremental landing.

## Projection lifecycle

1. **Materialize the chain.** The lowest unlanded member targets the current protected base; each higher member targets
   its predecessor ref. Bind every exact ref and pull request in `DeliveryState`, while the work-unit control branch
   remains the authoring surface.
2. **Review the next member.** Extend the existing review vehicle boundary only enough to bind the plan, member,
   owning work unit, exact base, and exact head. Existing review routing and clearance remain authoritative.
3. **Reserve and reobserve.** Reserve a single-member landing with the expected plan revision, state version, base,
   member head/tree, and predecessor relation. Reobserve Git, host, checks, and review immediately before mutation.
4. **Authorize and land once.** Every member landing reaches the existing integration interlock for its exact head.
   V1 invokes one ordinary merge; approval never reaches a later member.
5. **Reobserve and reconcile.** Record the exact landed base and current suffix coordinates with a version-checked
   write. If the host rewrites or retargets descendants, rebind their current refs and review targets through existing
   applicability rules before another landing.
6. **Close out from the control locus.** The final member incorporates the attended lifecycle/archive tail according
   to the normal work-unit closeout contract. Verify that no unplanned contribution rode the final landing, complete
   ordinary work-unit verification, and leave no active lifecycle artifact on the protected base.

The generic sequential path is the whole v1 projection. A host-native stack API may later improve presentation or
batching, but it is not required for correctness or initial completion.

## Ref and session boundaries

- Delivery refs are projections owned by the plan, not work-unit branches or independent lifecycle loci.
- Authoring and review-driven fixes land on the retained work-unit control branch, then rematerialize the affected
  suffix. Member refs are not durable authoring surfaces.
- Reverse lookup from repository plus member ref resolves the owning plan, member, and work unit through shared state.
  Branch naming is only presentation.
- Mid-delivery handoff resumes the owning work unit at its control locus and active operation. V1 does not require a
  separate session-locus record per member.

## Lifecycle-artifact exclusion

Every non-final member excludes the owning work unit's active metadata, spec, task list, notes, roadmap projection, and
other lifecycle records supplied by the storage layer. The rule is expressed over owned records, not a permanent path
blocklist, so it becomes vacuous when those records materialize outside the code repository.

The final attended closeout publishes only the lifecycle result the existing work-unit integration contract requires.
Delivery does not add per-member artifact flags, holdback state, or a second archive mechanism.

## Robustness floor

- The next landable member is derived from plan order plus current state, never selected from provider ordering.
- Exact pre/post coordinates guard every mutation; ambiguous movement refuses.
- A crash may reconcile a recognized landing result through the single active operation.
- Host rewrites invalidate only the affected current coordinates and review applicability. They do not create plan
  generations, assurance generations, or immutable observation history.
- No member lands until its current checks, existing review obligation, predecessor relation, and exact-head
  integration authorization settle.
- A partially landed stack leaves the protected base valid and does not expose active work-unit artifacts.

## Explicit non-goals

This member does not add:

- automatic stack discovery, boundary derivation, compatibility-cap generation, or semantic landability inference;
- provider-native stack creation, webhooks, atomic-prefix, ordered-prefix, merge-queue, or batch-merge support in v1;
- a general delivery-host capability registry or parity across provider previews;
- per-member work-unit identities, session loci, metadata records, or authoring branches;
- review groups, seam receipts, terminal assurance, or receipt projection across rewritten pull requests;
- commit-history preservation across delivery refs when exact tree/contribution comparison suffices;
- autonomous abandoned-stack rollback or cleanup of every possible partial provider outcome; or
- topology changes, reactive insertion modes, or live-to-landed plan conversion after binding.

## Hardening boundary

The cohort's hardening-admission rule applies. A new provider capability, recovery state, identity, or proof record must
address a demonstrated failure in the sequential stack lifecycle. Native-host convenience and theoretical support for
larger batch operations are follow-up scope.

## Open implementation details

- Exact naming and namespace of delivery refs.
- The narrow review-vehicle extension's existing schema locus.
- The repository operation used to establish exact member contribution after a provider rewrite.
- The attended final-tail composition point shared with current work-unit integration.
