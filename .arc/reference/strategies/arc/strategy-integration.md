# Strategy: Integration

Operational doctrine for taking one verified work unit from its private Candidate to landed work on the protected
base. This strategy owns the publication boundary, delivery topology and landing window, exact-head review admission,
the terminal integration decision, and the post-landing hand-back to ordinary lifecycle cleanup.

It is deliberately narrow. The lifecycle workflows and typed commands own execution mechanics; this document owns
the posture those mechanisms compose.

---

## Charter

Integration begins when a verified Candidate is prepared for publication and ends when the exact authorized work has
landed and its delivery and work-unit residue has been closed out.

This strategy owns:

- the Candidate's publication boundary and the role of its attestation;
- whether one work unit lands as one change request or as an ordered delivery;
- the landing window and member order for a delivery;
- admission of each review subject at an exact head;
- the final checkpoint, integration interlock, and terminal merge; and
- the post-landing hand-back to delivery closeout and work-unit teardown.

It does not decide which concerns become work units, how several work units run concurrently, what review obligations
exist or how findings clear, or where project checks belong. Those belong respectively to [Work Organization],
[Concurrent Work], the review contracts, and [Quality Gates].

## Publication Boundary

Verification establishes a Candidate attestation over the exact work-unit subject. Private review and convergence
settle against that Candidate before publication. Publishing then records the durable `Active` to `Integrating`
transition and carries any hosted-review reservation into the public integration lifecycle before the first push.

The attestation anchors what passed verification; it is neither a review verdict nor merge authority. If the public
head changes, the typed integration boundary determines whether the Candidate remains applicable, needs a new
attestation root, or must return to pre-publication work. Workflow prose does not infer that relation.

The [Prepare Work Unit] workflow owns the private side of this boundary. The [Integrate Work Unit] workflow owns the
public side.

## Delivery Shape and Landing Window

The ordinary shape is one work-unit branch and one terminal change request. A delivery plan may divide the same work
unit into independently landable members without creating new work units or per-member session loci.

For an ordered delivery:

- every code-bearing member participates in one predecessor chain;
- the originating work-unit branch is the top member and its ordinary change request is the terminal integration
  vehicle;
- provider-native registration, when selected, covers only the non-terminal member set; and
- members land bottom-up while the top remains outside provider rewrites and absorbs the landed chain.

Review and checks gate members incrementally, but merges run in one post-publication landing window. The
`Integrating` lifecycle state spans that window, and the top member's merge is the terminal instant. Protected-base
movement outside the delivery does not by itself force a refresh; the delivery reobserves and reconciles at the
landing boundaries that actually need it.

The [Deliver Stack] workflow owns the typed execution path. A project that does not select delivery keeps the ordinary
single-request path unchanged.

## Review Admission and Head Movement

Each merge boundary is reviewed at an exact head. In a delivery, every member uses the existing review vehicle and
the work-unit obligation settles only as the conjunction of the retained member bindings. Delivery records current
review targets only where execution needs them; they do not copy review verdicts or clearance.

Evidence applicability follows the content an earlier result covers, never head movement by itself. The review
contracts and typed applicability projections decide whether that evidence carries, whether a bounded residual enters
[`assess-evidence-applicability`][assess-evidence-applicability], or whether fresh evidence is required. Delivery and
singleton integration use the same authority boundary.

An approved delivery-member review fix follows the presentation that currently exists. One fresh observation through
the native-stack provider port selects only an exact registered or exact unregistered route. A registered remainder
publishes the selected member alone, then invokes a provider-neutral refresh capability for the exact dependent
suffix. The provider adapter prepares native rewritten commits in an isolated repository, while ARC retains
reservation, contribution-proof, lease-publication, terminal-top, and recovery authority. An unregistered remainder
recuts the complete suffix from top content that already carries the fix. External operator refresh followed by
fresh structural adoption remains the fallback. Partial, incoherent, ambiguous, malformed, unsupported, or
unavailable presentation stops. Provider-specific commands and UI stay behind adapters or operator procedure;
delivery plan, state, operation, and core-service contracts retain only provider-neutral member and suffix identities.

## Terminal Integration Authority

Immediately before merge, the integration checkpoint composes fresh Candidate applicability, publication settlement,
review status, quality evidence, target coordinates, and any delivery-specific terminal claim. For a delivery, that
claim includes the exact landed member heads, the terminal residual, the top target, and the member-review
conjunction.

The checkpoint is evidence offered to the integration interlock, not authority by itself. Merge authorization remains
the always-loaded integration-interlock invariant in [Development Rules]; approval applies to the exact checkpointed
head and plan, and the merge verb revalidates them before acting. A changed head or invalidated checkpoint returns to
composition rather than inheriting the prior authorization.

Disjoint protected-base movement proceeds without a reconcile commit when Git feasibility is exact and the configured
host policy admits the current head into the named target. Overlapping movement enters one typed base reconcile and
then a fresh checkpoint and approval. Complete exact-coordinate evidence may offer local repair before final host
admission when Git proves only generated conflicts and the host reports non-mergeability, or when the host test merge
covers the exact head but a stale base, and the head lacks the requested current base. Repair grants no merge authority:
fresh host admission, review applicability, and exact-head approval still follow. Unknown movement, incomplete evidence,
substantive conflict, and other unresolved or refused host admission stop. Strict current-base requirements come only
from authoritative host-policy evidence, never distance or provider guesswork.

Authorization binds the exact Candidate head and change request into the named target ref, not a base object ID. The
approval surface discloses the last observed base and the residual race between observation and merge. Required-check
evidence is head-bound unless the host proves stronger currency: before merge, the host's current test-merge result is
the integration evidence; after merge, base CI is the backstop and should run the same legs that gate a change request.
A project that omits those base legs knowingly accepts the resulting coverage gap.

## Post-Landing Hand-Back

After the terminal merge, integration hands control back in a fixed order:

1. retire the work unit's personal session workspace;
2. close out delivery residue and retire completed delivery records when a delivery exists; and
3. tear down the merged work-unit branch and worktree through the ordinary lifecycle path.

Each step is independently re-runnable so an unattended merge or interrupted tail can converge without reconstructing
authority from branch names. Delivery closeout is a no-op for a work unit with no delivery plan.

---

[Concurrent Work]: strategy-concurrent-work.md
[assess-evidence-applicability]: ../../../system/methods/assess-evidence-applicability.md
[Development Rules]: ../../../system/rules/DEV-RULES.ARC.md
[Deliver Stack]: ../../../system/workflows/arc/supplemental/deliver-stack.md
[Integrate Work Unit]: ../../../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md
[Prepare Work Unit]: ../../../system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md
[Quality Gates]: strategy-quality-gates.md
[Work Organization]: strategy-work-organization.md
