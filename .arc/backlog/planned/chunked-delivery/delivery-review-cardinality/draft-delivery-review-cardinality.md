# Draft: delivery-review-cardinality — evidence-triggered review aggregation

- **Cohort:** `chunked-delivery` — `cohort-chunked-delivery.md` owns the v1 review baseline, non-goals, and
  hardening-admission boundary.
- **Purpose:** Evaluate whether field use of multi-member delivery needs fewer provider review requests or stronger
  aggregate coverage than existing exact-head member review and work-unit verification provide.
- **Position:** Optional follow-up after `delivery-stack-topology`, and after `review-request-contracts` exposes the
  applicable review-owned derivation seams. It does not gate v1 delivery or cohort v1 closeout.

---

## Activation threshold

Do not activate this work unit from architectural completeness alone. Activation requires field evidence of at least
one concrete deficiency that cannot be solved through existing review routing and applicability:

- repeated provider requests impose material cost without increasing useful coverage;
- a named cross-member interaction repeatedly escapes member review and ordinary aggregate work-unit verification;
- host-induced rewrites make valid review applicability unusable despite exact current-tree evidence; or
- an enforced repository policy requires one aggregate review subject that existing review vehicles cannot express.

Record the observed workflow, frequency, consequence, and why the existing contract is insufficient before choosing a
new record or identity. More pull requests, by itself, is not evidence that review requests should be grouped.

## V1 baseline to measure

- Each delivery member enters the existing review router as its own exact-head vehicle. The router remains
  authoritative for obligation, source policy, applicability, findings, and clearance.
- PR count is not a policy input. A member is reviewed only because its independently derived route requires or admits
  review.
- Mandatory work-unit verification and any advisory aggregate review run once over the current whole-work-unit
  contribution at the normal verification boundary, not once per delivery member.
- A terminal-only change set follows existing review applicability and routing. Topology does not make it exempt.
- Delivery may bind the current review target needed to guard a landing, but it stores no receipt copy, review verdict,
  assurance subject, or terminal aggregate result.
- A rewrite or retarget creates a current exact target. Existing review applicability decides whether prior coverage
  carries, needs a focused supplement, or must repeat.

This baseline is the default outcome, not an intentionally incomplete first half of an assurance-group system.

## Questions if activated

An activated design should answer only the deficiency that triggered it:

1. Can existing cumulative or local change-set review vehicles present the needed aggregate target without a new
   delivery-owned subject?
2. Can review-owned requirement and applicability projections express the result without copying evidence into
   delivery state?
3. What is the minimum no-weakening rule when one review request covers several independently routed requirements?
4. Which exact tree or membership fact must be proved after host rewriting, and which subsystem already owns it?
5. Does the solution remove more review ceremony than the new grouping, identity, recovery, and explanation costs it
   creates?

If durable review identities must work across clones, their repository identity source belongs to the review
subsystem. Delivery must not patch clone-local identity by minting a parallel verdict namespace.

## Explicit non-goals

Unless field evidence and a design amendment admit them, this work unit does not create:

- assurance groups, group merge barriers, seam universes, seam owners, or scheduling algebra;
- delivery-authored review requirements, verdicts, exemptions, receipts, or applicability decisions;
- `assuranceSubjectId`, `ReviewCoverageBinding`, `RequirementQualificationProjection`, or similarly speculative
  contract kinds;
- cross-pull-request receipt projection, per-member satisfaction projection, or terminal assurance ledgers;
- a mandatory terminal provider pass for every multi-member work unit;
- review policy keyed to member count, topology, work-unit `Class`, or provider marketing capabilities; or
- cross-repository review groups or a generic review-carrier framework.

The design may ultimately need one or more such concepts, but their existence must follow the activating failure and
the smallest adequate remedy rather than precede them.

## Hardening boundary

The cohort's hardening-admission rule applies. A reviewer may identify a concrete no-weakening or authority violation
in an activated design. A suggestion that would make review history more complete, portable, or theoretically
composable is a scope proposal until tied to the activating failure.

## Closeout shape

If activated, this work unit closes when the measured deficiency is resolved without weakening any member's existing
review obligation and without making delivery authoritative for review evidence. If the v1 baseline proves adequate,
the correct disposition is to retire or retain this draft without implementation.
