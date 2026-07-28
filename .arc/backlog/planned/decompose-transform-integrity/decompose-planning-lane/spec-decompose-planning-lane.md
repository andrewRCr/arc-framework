# Spec (`detailed` · `RFC`): decompose-planning-lane

- **Origin:** [internal]

- **Purpose:** Allow one fully validated v3 decomposition receipt to accompany otherwise planning-only changes
  through an explicitly installed host lane without weakening review, ownership, or exact-head protection.

---

## Introduction / Context

Canonical decomposition results are planning artifacts plus one machine-validated retirement receipt. Existing
planning-lane classification treats that receipt as a non-planning endpoint, so even mechanically exact
decomposition remains reviewed.

That conservative behavior is correct by default. Some projects may explicitly opt into automated planning
clearance, but doing so changes a host security boundary: receipt ownership, exact candidate identity, branch
currency, and clearance publication must agree. This policy is separable from transform correctness and ships
only after `decompose-transform-integrity` and `decompose-base-mobility`.

## Goals

1. Classify exact base/head changes as `planning`, `reviewed`, or fail-closed `invalid-retirement`.
2. Admit exactly one canonical v3 receipt endpoint beside otherwise valid planning changes.
3. Bind descendant landing and classification to one immutable live base/head pair.
4. Couple the receipt CODEOWNERS exception to exact-head `arc-cleared` and an up-to-date-base rule.
5. Keep ordinary ARC installation and planning auto-merge default-off.

## Non-Goals

- Change decomposition authoring, finalization, landing correctness, semantic approval, or receipt meaning.
- Admit legacy, malformed, multiple, historical-only, unrelated, or rider-bearing receipts.
- Auto-enable `arc-cleared`, planning auto-merge, CODEOWNERS exceptions, or branch rules.
- Treat clearance as proof that child content or distribution is semantically approved.
- Add a second receipt validator, approval token, signature, or prose classifier.
- Support hosts that cannot bind or immediately reread the exact candidate pair.

## Proposed Design

### Exact-ref evidence adapter

`classifyPlanningLane(ChangeSet)` remains the pure reducer for ordinary planning changes. One asynchronous
repository adapter beside the review handler resolves canonical exact-ref change facts and blobs, recognizes
retirement-record endpoints, and invokes the core v3 validator plus base-mobility descendant verdict.

The closed outcome is:

- `planning` — every non-receipt endpoint satisfies the existing planning grammar and exactly one added/current v3
  decomposition receipt validates;
- `reviewed` — an ordinary noneligible or unknown change that does not purport to alter retirement evidence;
- `invalid-retirement` — a purported add/modify/delete of retirement evidence that fails cardinality, identity, or
  shared validation and exits nonzero with its stable locus.

The current receipt path is the sole non-planning endpoint exception. An old receipt only in unlanded ancestry is
ignored; a receipt already present in the base disqualifies an added-current-receipt claim.

### Immutable host binding

`handleReviewPlanningLane()` exclusively owns host composition. It supplies exact base/head SHAs to the
base-mobility validator and this work unit's exact-ref classifier, preserves that pair through clearance
publication, and rereads live refs immediately before arming an action. Movement, fork ambiguity, unreadable
facts, or hosts unable to preserve the pair publish no success.

When base movement is otherwise safe, the handler returns the core `refresh-base` action executed through
`decompose-base-mobility` rather than weakening the pair.

### Opt-in ownership exception

Ordinary ARC installs keep clearance and planning auto-merge disabled, and the retirement-receipt namespace stays
owned/reviewed.

Only the explicit planning auto-merge recipe may add:

```text
/.arc/system/.internal/retirement-receipts/*.json
```

to the final unowned CODEOWNERS block, and only after it verifies:

1. the existing `arc-cleared` workflow publishes an exact-head required context;
2. the branch protection or merge queue requires branches to be current with the base; and
3. the host/admin operation actually installed those prerequisites.

If verification is unavailable or fails, the namespace remains owned and decomposition remains reviewed.
`arc-cleared` may be installed independently; the dependency is one-way from the ownership exception to its
guards.

### Package and project projection

Package-source CODEOWNERS, clearance workflow, merge-gate recipes/readmes, setup guidance, and initial-setup
guidance are authoritative. Project copies are rendered through the established Framework projection and verified
for parity; they are never independently edited.

## Alternatives & Rationale

### Make all decomposition receipts planning changes

Rejected because malformed evidence or unrelated receipt endpoints would bypass review.

### Enable the lane by default

Rejected because host rules, exact-head status, and CODEOWNERS ownership are project-level security choices.

### Treat invalid retirement evidence as ordinary reviewed work

Rejected because a purported authority artifact that cannot validate must fail closed, not silently downgrade.

### Put exact-ref binding in the transform handler

Rejected because the review host owns the immutable pair and clearance action; lifecycle handlers do not.

## Cross-cutting Considerations

- **Security:** ownership changes atomically with exact-head and base-current enforcement.
- **Compatibility:** only current canonical v3 receipts qualify; obsolete or legacy-shaped evidence cannot gain
  lane authority.
- **Testing:** pure policy, exact-ref adapter, workflow recipe, CODEOWNERS ordering, fork, and stale-head cases are
  separated.
- **Rollout:** the feature is optional and safely absent until both dependencies land.
- **Human authority:** the distribution interlock remains the sole semantic approval boundary.

## Success Criteria

- Exact-ref classification admits one canonical current v3 receipt plus otherwise planning-only endpoints.
- Malformed, legacy, multiple, existing-in-base, unrelated, modified/deleted, or rider-bearing evidence never gains
  planning authority.
- Base/head movement, fork ambiguity, or unreadable live facts publishes no clearance success.
- New installs remain reviewed/default-off.
- The receipt ownership exception is installed only with verified exact-head `arc-cleared` and base-current
  enforcement; otherwise ownership remains intact.
- Package and project host-policy assets remain projection-identical.
- No semantic classifier, approval credential, duplicate receipt validator, or transform behavior is added.

## Open Questions

[none]
