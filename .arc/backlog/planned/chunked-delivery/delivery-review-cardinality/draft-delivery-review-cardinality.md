# Draft: delivery-review-cardinality — review obligation and terminal assurance across deliverables

- **Cohort:** `chunked-delivery` — see `cohort-chunked-delivery.md` for the shared canonical model,
  the problem framing, the field evidence the design rests on, and the cut that produced this member.
- **Purpose:** Own assurance-subject binding, the review-owned qualification projection, the review
  authority and cardinality boundary, work-unit verification cardinality, and the combined terminal gate.
  It also holds the inherited assurance-group and seam algebra under a consume-not-adopt disposition:
  measure it against v1 delivery mechanics before adopting any part of it.
- **Position:** depends on `delivery-plan-record`, and externally on `review-request-contracts` for both
  public derivation seams. That chain is the cohort's long pole and gates this member alone.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Make review-verdict identities stable across clones**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-08-03); captured during
  `delivery-plan-record` task generation.
- _Concern:_ delivery's append-only assurance chain must revalidate away from the writing clone, while current
  review identities derive from a per-clone repository value.
- _Fold-in:_ settle the public qualification boundary's stable subject/generation identity and answer shape so
  delivery can store review-owned references without copying or recomputing review authority.

### `[x]` **Coordinate multi-PR review cardinality with the reviewed-lane gate contract**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-13); captured during
  `reviewed-lane-review-gate` task-generation reviewability assessment. Carried from `review-chunking` at the
  2026-07-21 cut — the concern is explicitly multi-PR, so it follows the topology half.
- _Concern:_ each deliverable can reuse the proven per-change-request review contract, but stack-level review
  cardinality and usage policy remain unsettled. More PRs must not automatically multiply expensive review passes.
- _Approach:_ settle which deliverables auto-admit versus wait for checkpoints, where independent/adversarial
  review runs, and how findings and approvals compose without one PR erasing another's evidence. Preserve each
  deliverable's truthful `merge-ok` while keeping WU-terminal aggregation outside `ReviewCore`. `review-architecture`
  shipped 2026-07-21, so its settled, topology-neutral review-obligation contract is now a readable input rather
  than a projected one — consume it rather than duplicating the decision.
- _Disposition:_ **Folded.** Every deliverable retains its independently routed obligation and project-policy
  admission mode. V1 projects no receipt across exact targets and adds no automatic terminal whole-series review;
  terminal aggregation consumes review-owned requirement qualification plus delivery-owned membership / tree proof.
  More PRs can yield more required reviews only because their own routes require them, never because PR count is a
  policy input.

### `[x]` **Coordinate adversarial verify cardinality and partition criteria**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-03); captured during `adversarial-review`
  create-spec. Carried from `review-chunking` at the 2026-07-21 cut.
- _Concern:_ `adversarial-review` wires an adversarial pass at `verify-work-unit`; this work unit owns whether that
  verify runs once at the terminal deliverable or per deliverable in a multi-PR work unit. It also owns the
  distinction between work-unit/cohort orthogonality and PR-stack bisectability: the same seam can be "do not cut
  here" for PRs but "cover carefully" for review.
- _Fold-in:_ decide terminal-vs-per-deliverable adversarial verify and integrate the
  orthogonality-vs-bisectability distinction into this work unit's partition/coherency pass.
- _Disposition:_ **Folded.** Run WU self-verification and any advisory adversarial verify once over the exact
  aggregate candidate, not once per deliverable. Standard review remains per independently routed deliverable.
  `adversarial-review` partitioning stays an attention-allocation choice for a wide aggregate pass and never implies
  a deliverable cut; deliverable bisectability still requires a green, semantically consistent intermediate tree.

### `[x]` **Carry the assurance-group contract into PR decomposition (own the full seam algebra)**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-19); captured during `review-architecture`
  draft-design joint reconciliation (2026-07-18), then re-scoped at its `create-spec` re-examination (2026-07-19).
  Carried from `review-chunking` at the 2026-07-21 cut with its disposition intact.
- _Concern:_ `review-architecture` judged the full multi-PR assurance-group / seam / series-membership algebra
  overengineered _for that work unit_ and ahead of the delivery shape it depended on, so it extracted the algebra
  and routed it onward as inherited input. It retains only the single-deliverable obligation contract, the
  no-weakening principle, and the per-requirement projection seam.
- _Disposition:_ **Accepted as inherited input — consume-not-adopt.** Settle v1 delivery mechanics and the simplest
  industry-aligned reviewability mechanism first, then measure the algebra against that v1. If a simpler solution
  meets v1 needs, park the full algebra as a durable **provisional v2** — preserving its provenance — rather than
  adopting it wholesale or discarding it. The verbatim algebra is retained in § Inherited input below until that
  call is made, so the cut carries it to its owning member rather than stranding it in a companion the transform
  would retire unallocated.

---

## Review cardinality and terminal assurance

**Rewrite and review evidence.** Review receipts remain immutable and bound to their original exact target. A
rebase, retarget, or squash observation derives a new target and consumes the existing review-gate applicability
contract. On a host that retargets and rebases higher members automatically as each lower one lands — the confirmed
GitHub stacking behavior — this path is the **steady state rather than an exception**: every landing rewrites commit
identity above it, so the tree-exact membership proof carries ordinary operation, not a rare host anomaly. Size the
implementation and its tests accordingly. The contract itself is unchanged: a conflict-free delta disjoint from
reviewed paths may carry prior coverage; interacting paths or conflict resolution require the configured
incremental or full-final retrigger; unknown facts fail stale. `DeliveryState`
references the target, receipt, and applicability identities rather than minting another review-surface digest.
Provider approval validity is observed independently, environment-dependent checks rerun on the new head / base, and
terminal assurance re-proves the complete ordered result even when every constituent receipt remains applicable.

**Review authority and cardinality boundary.** Review routing derives each deliverable's truthful obligation
independently. Delivery passes caller-held Git / WU facts into public review verbs and references their derived
target, requirement, operation, receipt, applicability, and verdict identities; it never fabricates those records or
recomputes finding convergence. V1 defaults to one exact review target per deliverable and does not project one
receipt across several PR targets. PR count itself does not promote or multiply an obligation — the review router
still decides whether each deliverable is exempt, recommended, or required — and project review policy still decides
whether a non-exempt request is admitted automatically or waits at a checkpoint. Delivery does not override either
decision.

A required deliverable receives one complete standard review of its exact target. V1 gains no automatic
whole-series pass at the terminal carrier: that carrier is not another deliverable and does not erase or duplicate
the member requirements. It may still expose a real terminal-only change set — integration-candidate lifecycle
composition is the principal case. That delta gets an exact review target and independently routed requirement, or a
review-owned applicability proof when prior complete coverage validly carries. An empty terminal delta creates no
requirement. The terminal reducer consumes review-owned member, seam, and terminal-delta qualification alongside
delivery's membership proof; it never declares the final carrier exempt by topology alone.

The shipped `assuranceMode: terminal-aggregate` is the review-routing hook, not a parallel gate. A
multi-deliverable plan requires that output regardless of WU `Class`; this extends only the assurance-mode input with
a delivery-plan fact and does not change any deliverable's independent-analysis obligation. Final-carrier
qualification consumes the delivery-owned aggregate proof through the existing readiness / integration boundary,
while `ReviewCore` remains authoritative for each requirement inside it.

**WU-level verification cardinality.** `verify-work-unit` asks whether the work unit satisfies its design; standard
review asks whether one exact deliverable meets the review rubric. Keep those questions separate:

- Mandatory self-verification and any advisory adversarial verify run once over the exact aggregate WU candidate
  after all current deliverable generations compose and before terminal completion. The integration-target
  projection uses its accumulated integration tree before the sole WU → `main` landing. Stack-to-`main` may already
  have landed an independently safe prefix; its candidate is the exact contribution represented by those landing
  observations plus the top member's cumulative remaining suffix, and verification completes before the terminal
  member landing.
- A pure rebase or retarget with a proven tree-equivalent WU contribution does not multiply the advisory pass.
  A material contribution change reopens the affected success-criteria validation and, when previously chosen, the
  adversarial verify.
- Novel partitioned fan-out remains an attention partition inside that one logical pass. Its orthogonality test does
  not prove a deliverable is safe to land, while the delivery bisectability test does not dictate reviewer count.

The verification close emits only a strict `WorkUnitVerificationAnchor` value object: exact design revision,
task-list / success-criteria tree, and aggregate contribution digest. It lets the terminal intent detect a changed
candidate; it is not a review receipt, adversarial-pass attestation, or new approval authority.

**Assurance-subject binding and qualification projection.** `DeliveryPlan` assigns a stable
`assuranceSubjectId` to every ordered deliverable and named seam independently of its current target or evidence
carrier. Each seam names its incident deliverables, its exact acceptance statement, and the latest incident
deliverable that owns its review scheduling. A named seam is a required assurance dimension even when its owner
would otherwise route exempt; it may promote that target's review obligation but never weakens another floor.
Scheduling ownership is valid only when that deliverable is structurally after every incident member. At request
preparation, the review boundary also proves that the exact head contains every named current generation; failure
blocks the binding instead of moving the seam to an arbitrary review.

The public review boundary derives a strict `ReviewCoverageBinding` for each non-exempt exact target from those
caller-held plan facts. The binding contains the target and plan revision, the member subject, assigned seam
subjects, exact incident deliverable generations, and a digest of the generated reviewer instructions. Its canonical
identity participates in the requirement and delivered-guidance digests. The reviewer therefore receives the named
interaction as governing review context, and the receipt attests the complete requirement that included it.
Delivery neither authors the requirement nor infers seam coverage from the scheduling assignment. The binding is a
strict value object carried by the existing requirement / projection path, not a new store, ledger, or independently
mutable evidence record.

`DeliveryState` binds every subject to the current review-routing projection. An exempt member retains that explicit
reasoned exemption and has no fabricated requirement. A non-exempt subject additionally binds the current review
`targetId`, `coverageBindingId`, and `requirementId`; a rewrite, retarget, or later assurance regrouping may replace
that binding without changing delivery identity. At terminal reduction, delivery asks the public review surface for
either the exact routed-exemption projection or a review-owned `RequirementQualificationProjection`. The latter
reports the current target, coverage binding, and requirement; a closed `qualified | nonblocking | blocked | stale`
outcome that already preserves requirement obligation semantics; and references to its backing receipt and
applicability evidence. Delivery admits only `qualified` or `nonblocking` and never recalculates why. Both are
derived views over review authority, not a new receipt, ledger, or delivery-authored verdict.

This is the v1 / v2 compatibility boundary. A v1 singleton target and receipt produce one qualification projection.
Several member and seam subjects may point to that one requirement only because its coverage binding names and
delivers all of them. A future assurance-group target and group receipt may satisfy several requirements, backed by
the deferred series-membership proofs. Terminal assurance consumes the same per-requirement set in either case and
never reasons about group, carrier, request, or receipt cardinality. V1 therefore adds one exact-target coverage
binding, not singleton groups or speculative group fields; assurance-group coalescing remains provisional v2.

This is deliberately not `chunk-scope-binding`'s partial-review contract. The full deliverable target is still
reviewed once; assigned seams are additive rubric dimensions over the exact checkout, not independently attested
subsets of one diff. `chunk-scope-binding` may later automate several bounded review scopes inside a single target
without becoming a dependency of this whole-target proof.

**Terminal-only delta.** The final carrier may contain deterministic lifecycle / archive composition produced after
member review. Those bytes may not disappear into “terminal aggregation.” Delivery derives their exact change set
against the fully composed member tree and treats it as a reserved terminal assurance subject:

- an empty delta is proven empty and creates no review requirement;
- a non-empty delta receives its own exact target plus independently routed coverage binding / requirement, or a
  review-owned applicability proof that validly carries prior complete coverage; and
- any behavioral or interacting content that cannot carry is reviewed before the final landing.

For stack-to-`main`, normal planning folds this late content into the last unlanded deliverable generation so it
travels through the ordinary member path. The reserved subject remains the fail-closed proof that no unassigned byte
rode a landing. For the integration-target projection it is usually a real exact tail between the accumulated member
tree and final WU candidate. This composes the existing candidate-tail exception without pretending the tail was an
up-front deliverable.

## Inherited input — assurance-group / seam algebra (from review-architecture, 2026-07-19)

> _Provisional inherited input, not settled design. Retained under the consume-not-adopt disposition recorded_
> _in the inbound buffer above: measure this algebra against v1 delivery mechanics before adopting any part of it._
> _Body below is unmodified — it predates the `pr-decomposition` → `review-chunking` rename and retains the former slug._

Extracted verbatim from `draft-review-architecture.md` on 2026-07-19 (also recoverable from git `970436e94`) and
routed here at the 2026-07-19 housekeep drain. `review-architecture`'s `create-spec` re-examination judged the full
multi-PR assurance-group / seam / series-membership algebra overengineered _for that WU_ and ahead of
`review-chunking`'s settled delivery shape, so it extracted the algebra and routed it here as inherited input — to
be consumed, not necessarily wholesale, against this WU's own settled delivery mechanics at its next planning
iteration. `review-architecture` retains only the single-deliverable obligation contract, the no-weakening
principle, and the per-requirement projection seam.

---

**Joint assurance plan (verbatim)**

Do not choose between per-PR review and one grouped review prematurely. Review routing derives the truthful
obligation for each deliverable; `pr-decomposition` authors an ordered **assurance plan** at the same
`generate-tasks` boundary that plans merge seams. The plan groups one or more contiguous deliverables into an
**assurance group** — one exact review target and one provider request — so PR count and review-request count are
separate planned axes.

A group may coalesce member obligations only when all of these hold:

- **No policy weakening:** the group takes the strongest member obligation and retrigger treatment, keeps the same
  rubric pair, has a non-empty intersection of acceptable source policy, and resolves admission to the stricter
  checkpoint when members differ.
- **Exact ordered manifest:** every member has a stable deliverable id plus exact boundary commit and tree identities;
  the group id hashes the ordered member manifest, carrier base, terminal head, rubric identity, and effective policy.
  Changed membership, order, reviewed content, or policy makes prior group evidence stale. A host operation that
  rewrites only commit identity never mutates the receipt; it needs the separate tree-exact membership proof below.
- **Reviewability:** one reviewer can still cover the grouped surface and its seams without attention dilution. If
  not, split the assurance group even when the merge stack could remain one mechanical batch.
- **Carrier capability:** the selected adapter can present and prove the complete group range. A hosted provider that
  can review only one PR-shaped range may coalesce only when the stack exposes a qualifying cumulative carrier;
  otherwise the plan falls back to PR-aligned singleton groups rather than inferring coverage.

One group review applies `independent-analysis` to every member plus every seam assigned to the group. Its receipt
carries one `reviewRunId`, the exact group manifest, per-member coverage, seam coverage, and findings assigned to a
member or named seam. A clean group result is legal only when every member and seam cleared. The gate
deterministically projects that receipt into each member requirement; it does not pretend the provider ran once per
PR.

Grouping derives one **group requirement** from the compatible member and owned-seam policies: the strongest
obligation and retrigger treatment, acceptable-source intersection, and stricter admission checkpoint, plus the ids
of every non-exempt member and seam requirement. Member obligations remain unchanged for audit and presentation. A
required group activates a separate **group merge barrier** for every manifest member as soon as the assurance plan
is composed; a recommended group remains non-blocking unless its review is explicitly admitted, at which point
admission freezes the target and activates the same barrier. While active, no member may become merge-ready until the
group receipt is complete and every finding is settled. An exempt or recommended predecessor therefore cannot merge
early and mutate a cumulative target merely because its own review obligation is non-blocking. If that shared cadence
is undesirable, the planner must split the group rather than promote or weaken a member obligation. An all-exempt
delivery group creates no review group or barrier unless an owned seam carries a non-exempt requirement.

Each change-request gate accepts that projection only with a typed **series-membership proof**: the current PR maps
to the named member range; its base/head boundaries either retain the reviewed commit ids or have exactly the same
tree ids as the manifest boundaries; predecessors were consumed in the declared order; and no unreviewed delta
entered during merge, rebase, or retargeting. Tree-pair equality is the equivalence floor — patch-id similarity,
path overlap, or provider assertion is insufficient. Like the existing lifecycle-tail proof, this is adapter-produced
applicability evidence, not review evidence and not a policy bypass. Any diagnostic fails closed to a fresh singleton
or regrouped review.

Grouping sets the review/merge cadence: complete and freeze one assurance group, review it, then merge its member PRs
bottom-up before advancing. Later groups need not be implemented before the first group lands. A finding that changes
the group target invalidates or incrementally extends that group's evidence under ordinary retrigger policy.

The assurance plan also supplies a generated **seam universe**, never a hand-authored duplicate graph. Structural
seams come from every consecutive deliverable boundary and delivery-graph dependency edge; semantic seams come from
every spec/task element mapped to more than one deliverable. `pr-decomposition` proves that every design element and
task maps to a deliverable and that every multi-deliverable mapping emits a seam; unknown, duplicate, or unmapped
entries are diagnostics. Each stable seam record names its kind, incident deliverables, derived obligation and
retrigger treatment, and exactly one owner. The assurance group containing the latest incident deliverable owns the
seam, because every predecessor must land before that group's review; an intra-group seam is owned by that group.
The seam default is the strongest independent obligation and retrigger treatment among its incident members, and
project policy may promote it. A structural seam record alone does not create a provider run: it blocks only when
its derived policy is non-exempt or its review produces a finding.

One group review covers all members plus every seam it owns. `seamMapDigest` binds the generated enumeration,
policies, and ownership map; the group requirement names its non-exempt seam requirements. Full diagnostic-free
seam proof is mandatory only when an assurance group coalesces multiple PRs, evidence is projected across PRs, or a
`Heavy` / `Novel` terminal checkpoint claims complete WU assurance. Ordinary `Light` singleton/per-PR review uses
lightweight dependency ownership and cannot project evidence across PRs. A single deliverable has no seam record or
seam ceremony. If the latest group's carrier cannot expose the required predecessor context, the planner must
regroup onto a qualifying cumulative target or fall back to ordinary per-PR reviews; if neither can expose the
context, the proposed split is invalid and fails closed. A seam finding blocks its owner and every incident member
until settlement; a fix that changes reviewed content invalidates the affected target under ordinary retrigger
policy.

For `Heavy` / `Novel`, WU-terminal assurance is the AND of all required group receipts plus the full diagnostic-free
seam proof. It is an aggregate checkpoint, not a review target, a terminal-seam provider request, or an automatic
additional full-provider pass. A single-deliverable WU with a non-exempt requirement naturally has one ordinary
review target; an all-exempt WU has no group unless an owned seam is non-exempt, and an Errand has no WU-terminal
aggregation.

This is the settled joint contract because it preserves every deliverable's blocking risk floor while allowing one
exact review run to satisfy several requirements when the topology and adapter can prove it. It promises that PR
count does not **mechanically** determine review count, not that every stack can collapse to one review.
`pr-decomposition` owns the delivery refs, cumulative-carrier shape, merge-consumption proof, and assurance-plan
placement; this WU owns the group target/evidence algebra and the no-weakening rule.

**Gate-projection group/member/seam contract (verbatim)**

The assurance planner then binds one or more compatible member requirements to a review target:

```yaml
reviewTarget:
  kind: change-set | assurance-group
  targetId: digest
  repositoryId: id
  baseRef: ref
  diffBaseSha: sha
  diffBaseTree: oid
  headSha: sha
  headTree: oid
  members:
    - {deliverableId: id, rangeId: digest, fromSha: sha, fromTree: oid, throughSha: sha, throughTree: oid}
  seamMapDigest: digest | null

groupRequirement:
  requirementId: digest
  targetId: digest
  obligation: recommended | required
  retrigger: incremental | full-final
  memberRequirementIds: [id, ...]
  seamRequirementIds: [id, ...]
  initialAdmission: automatic | checkpoint

reviewRequest:
  requestId: digest
  repositoryId: id
  targetId: digest
  requirementId: digest
  carrier: {kind: change-request | local-change-set, adapterId: id, changeRequestId: id | null}
  sourceIdentity: id
  generation: integer
  requestMechanism: id
```

A singleton carries one member and its ordinary exact range; its seam digest is null when full seam proof is not
required. An assurance group carries its ordered members and owned seams; `rangeId` and `targetId` bind every shown
identity field and change with any field. Each member requirement retains its own obligation and member id while
referencing the shared target, so one source run can produce one group receipt and deterministic per-member
satisfaction projections without weakening or duplicating the requirements. The receipt remains bound to that
original target. A later host rewrite can project it only through a proof that binds the current requirement to the
original member and establishes exact boundary-tree equivalence.

V1 permits one repository per target. One group request is admitted and recorded against one concrete carrier; a
hosted carrier must expose the complete target range on its named change request. The request identity binds the
repository, carrier adapter/change-request id, target, group requirement, source, generation, and mechanism. The
carrier's existing exclusive-trigger and causal-attribution rules apply to that one request, and its terminal receipt
binds `requestId + reviewRunId + targetId + provider event identity`. Other member change requests receive typed
satisfaction projections referencing that receipt plus their series-membership proofs; they do not fabricate
duplicate requests or receipts. Retargeting or mutating the carrier during an active flight invalidates the flight.
After a terminal receipt, host-induced rewrites may carry only through the tree-exact proof above. Cross-repository
groups and one provider event observed through several carriers are unsupported in V1 and fall back to ordinary
per-PR reviews.

Group receipts and series-membership proofs are new strict contract kinds. For a group, coverage must also cover
every manifest member and named seam. Series-membership carry-forward is a separate typed applicability proof.
