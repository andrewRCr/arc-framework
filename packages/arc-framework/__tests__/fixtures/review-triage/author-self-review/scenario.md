# Scenario: Author Self-Review Finding

An author reviews an aggregate diff and finds this omission in the response-continuation projection:

```text
authoringAuthorization = {
  fixAuthorizationId,
  dispositionSetId,
  reviewedHead,
  ref,
  checkoutPath,
}
```

- Claim: changed-target continuation drops the approver-selected verification floor.
- Locus: `src/lib/delivery/review-fix-continuation.ts:authoringAuthorization`.
- Source verification: the approved disposition set contains `proposedVerification`, but the projection above does
  not carry it into the authoring authorization.
- ARC judgment: confirmed `major`, blocking.
- Proposed disposition: `fix`.
- Proposed action: carry `approvedVerification` from the exact approved set through the authorization and add a
  focused propagation assertion.
- Open questions: none.

This is author self-review. It has no external producer, reviewer grade, native finding label, source ordinal,
receipt, or producer-bound identity.
