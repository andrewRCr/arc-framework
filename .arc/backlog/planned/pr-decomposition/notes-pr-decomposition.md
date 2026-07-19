# Notes: pr-decomposition

> _Companion reference for `pr-decomposition`. Holds bulky inherited input in transit — not the design record._

## Inherited input — assurance-group / seam algebra (from review-architecture, 2026-07-19)

Extracted verbatim from `draft-review-architecture.md` on 2026-07-19 (also recoverable from git `970436e94`) and
routed here at the 2026-07-19 housekeep drain. `review-architecture`'s `create-spec` re-examination judged the full
multi-PR assurance-group / seam / series-membership algebra overengineered _for that WU_ and ahead of
`pr-decomposition`'s settled delivery shape, so it extracted the algebra and routed it here as inherited input — to
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
