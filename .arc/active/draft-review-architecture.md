# Draft: review-architecture — coherent end-to-end review system

- **Origin:** [internal] — rescoped in place from `review-method-family` (2026-07-16); full lineage in
  § Provenance.
- **Purpose:** One holistic pass over every review surface ARC carries — local preflight, external code review
  (CLI and PR channels), finding triage and response, the review-gate's enforcement boundary, and the
  config/method/extension containers that hold them — partitioned once by an explicit layer model, with review
  spend routed by normalized change and work facts. Replaces piecemeal patching of individual review surfaces,
  which is how the current incoherence accumulated.

---

## Problem / Motivation

Three strands, in the order they surfaced:

**The original method-family diagnosis (2026-04, carried forward).** `integrate-work-unit`'s review-iteration step
inlines too-thin review-response guidance and assumes every PR receives review; `diff-review` conflates its
classification utility with self-review activity and its name reads as generic code review; there is no shipped
reviewer-facing independent-analysis contract or full respond-to-findings cycle — this project's review-gate
instructions and `coordinate-pr-review.md` carry those ad hoc, project-locally.

**The parallelism forcing function (2026-07, wave-3 burn-in).** Multi-WU + errand parallelism saturated both
external review budgets within days — the GitHub Actions budget drained weeks early, and CodeRabbit's adaptive
fair-usage throttle engaged (95th-percentile identity; Pro degrades to 1 PR review/hour at 60+ reviews/week).
Key economics: CodeRabbit meters PR, IDE, and CLI reviews as **separate hourly pools**, and the adaptive
throttle tracks **PR reviews specifically** — so review-source and request-cadence selection are real levers, and
unmetered "every code PR gets full PR review, iterate until quiet" is not sustainable at parallel volume. Evidence:
`notes-finalize-parallelism.md` § Day-2 evidence. Supply-side fixes (tier upgrades) buy ~1.5× headroom and were
judged insufficient alone; the durable fix is demand-side metering — exact obligations derived from review risk,
with review requests composed against delivery topology rather than counted from PR containers.

**The systemic incoherence (2026-07-16 audit).** The same review boundary is served by four container kinds
with no stated division of labor, and each past patch picked whichever container was nearest:

- `review.pre_merge` (config) gates a step that fires **pre-PR** — its own comment says "before pushing" — a
  misnamed boundary, and a config-gated built-in step whose relationship to the extension family is undefined.
- The finding-disposition approval guard (triage findings, verify, present to the user _before_ fixes land)
  exists only in the project-local `coordinate-pr-review.md`, PR-channel only — the shipped `review-triage`
  contract requires explicit dispositions but records them in the _commit message_, i.e. after acting. Local
  reviews and any adopter without the project workflow inherit the observed agent failure mode: accept findings
  and act without a user checkpoint.
- The fire-point extension family still mixes legacy action-suffixed names (`pre-commit-review` /
  `pre-push-review`) with the settled, action-neutral PR lifecycle hooks (`pre-pr-open` / `post-pr-open` /
  `pre-merge`), while `integrate-work-unit` gives `pre-push-review` a full callout twice and `pre-pr-open` only an
  inline mention. This WU must reconcile callsite ownership without reopening the settled lifecycle vocabulary.
- `pre-merge` marks the final agent fire point, but agent-side hooks structurally cannot guarantee the merge
  boundary — a manual host-UI merge bypasses them. The actual guarantee is the host-side review-gate required
  check, and that division is documented nowhere.

## Charter

Inventory → layer model → re-partition. Every surface below gets an explicit target layer; nothing is patched
in place without a layer assignment.

| Surface                                        | Today                                                    | Reconciliation need                                             |
|------------------------------------------------|----------------------------------------------------------|-----------------------------------------------------------------|
| `review-triage` (method)                       | shipped; disposition contract                            | add verify-against-source + pre-fix user-approval invariants    |
| `diff-review` (method)                         | shipped; gated by `review.pre_merge`                     | rename to `self-review`; move activation onto the method        |
| `review.pre_merge` (config)                    | gates the pre-PR local aggregate review                  | retire the config-as-method-toggle smell                        |
| PR lifecycle extensions                        | action-neutral `pre-pr-open` / `post-pr-open` + final    | consume the settled hooks; do not reopen their naming           |
|                                                | `pre-merge` boundary                                     |                                                                 |
| `coordinate-pr-review.md` (project)            | typed controller action/await + finding-settlement loop  | keep host mechanics project-side; graduate reusable invariants  |
| review-gate core + self-hosting policy         | code/cutover shipped; qualification and promotion remain | project exact-change-set requirements need a method-level seam  |
| CI classifier + review-gate policy classifiers | shipped typed facts (`light/heavy`, `auto/reviewed`,     | reuse facts without conflating CI weight, ownership, and review |
|                                                | `routine/sensitive`)                                     | obligations                                                     |
| project `pre-pr-open` frontline review         | active CodeRabbit CLI action + disposition guard         | graduate the role; retain provider invocation project-side      |
| project `independent-analysis/v1` rubric       | gate + hosted Codex instructions + attestation contract  | graduate the neutral rubric, not the coordination workflow      |

## Success signal

Given representative documentation-only, routine-code, sensitive-code, `Heavy` / `Novel`, Errand, and multi-PR
cases, ARC derives explicit self-review and independent-analysis obligations plus an opt-in frontline action for
the exact change set. Frontline review can be fulfilled by a project-selected fresh source without discharging a
hosted-review obligation; it removes low-value noise before publication so the public reviewer receives a
higher-signal diff and needs fewer token-expensive repeat passes. Hosted providers receive a neutral rubric rather
than an ARC workflow; no PR-count rule mechanically multiplies expensive full reviews; and every finding is
independently verified and disposition-approved before fixes land. Each review surface has one layer owner, and
agent hooks remain ergonomic while the host-side gate remains enforcement.

## Layer model — the doctrine

Five layers, each with one role. The re-partition rule: **policy that generalizes ships as a method; tool
bindings and host mechanics stay in the project/adapter layers; config never carries instructions.**

1. **Shipped method contract** — the invariants (the blockquote contract). Binds overrides: an override must
   satisfy the same invariant. This is where behavioral guards live so no project override can delete them.
2. **Shipped method default** — the default policy prose. Overridable by replacement or additive composition —
   the live enum spells the latter `override-mode: extend`; `naming-conventions` owns any rename. The base
   contract stands while project layers add "use this tool, with this policy" on top.
3. **Typed values** — config or code-owned policy data only when a hook, CLI, or adapter consumes the value; never
   prose and never a standalone activity toggle. Method activation stays on the method. Deterministic change facts
   are computed CLI-side and supplied as typed inputs rather than re-derived in workflow prose.
4. **Host adapter / coordinator** — channel mechanics: reviewer-native rubric delivery, thread etiquette, await
   loops, provider trigger commands, and evidence receipts. Host-neutral contracts and coordination skeletons
   ship; host specifics (GitHub threads, GitLab discussions) are adapter content; this repo's CodeRabbit specifics
   stay project-side.
5. **Project layer** — additive method overrides and extension `.actions`: project-specific policy and provider
   bindings at lifecycle fire points.

## Proposed shape

### 1. `review-routing` method (new) — topology-neutral obligations and action policy

The method returns two deliberately distinct result families rather than a channel-combination "lane":

- **Review obligations** use the gate-proven `exempt / recommended / required` vocabulary and carry typed reasons:
    - **Author self-review** — whether the aggregate local author pass is exempt, recommended, or required.
    - **Independent analysis** — whether exact-change-set evidence from a qualified independent source is exempt,
      recommended, or required.
    - **Retrigger treatment** — `none / incremental / full-final`, with a full pass reserved for a settled final
      head when policy requires it.
- **Frontline action** uses `skip / offer / attempt`: whether the workflow should privately expose the aggregate
  pre-change-request diff to a distinct reviewer. It is action selection, not gate satisfaction; `attempt` is a
  best-effort run, provider unavailability is surfaced rather than reinterpreted as clean, and the action produces
  no independent-analysis receipt by default.

The framework obligation defaults apply whether or not frontline review is active. The Frontline column is its
effective default only after a project activates `frontline-review`; otherwise that column resolves to `skip`:

| Exact change set                   | Author self-review | Frontline | Independent analysis | Retrigger   |
|------------------------------------|--------------------|-----------|----------------------|-------------|
| routine ARC-auto-eligible planning | recommended        | skip      | exempt               | none        |
| routine reviewed documentation     | recommended        | skip      | recommended          | incremental |
| routine code-bearing               | required           | attempt   | required             | incremental |
| sensitive, any content             | required           | attempt   | required             | full-final  |
| unknown / malformed                | required           | attempt   | required             | full-final  |

`self-review` is active by default, preserving today's `review.pre_merge: enabled` behavior. Its activation is an
input to effective routing: explicit project deactivation resolves the author self-review obligation to `exempt`
with reason `self-review-inactive`, so no result can contain both an inactive method and a required invocation.
Frontline activation is independent: under inherited activation, an inactive frontline method always resolves to
`skip`; projects may override the active default without changing the role's contract. A one-run invocation override
may force, skip, or select a different source without rewriting project policy. A clean frontline result may support
declining a **recommended** hosted review, but it never suppresses a **required** one.

`Sensitive` means elevated review impact, not confidential content. The project classifier owns the concrete
predicate; the framework consumes the typed fact. The semantic floor covers changes that can materially alter
executable behavior, enforcement or trust boundaries, broadly-loaded agent behavior, constitutional/project
direction, or whose changed surface cannot be established reliably. Review risk is classified independently of WU
`Class`, work character, ownership, artifact authority, and raw diff size; the effective route composes those facts
afterward. This repo's current self-hosting predicate marks all code, GitHub control surfaces, ARC
system/strategy/ADR/brief surfaces, project-direction documents, harness contracts, and unknown change sets
sensitive. Its concrete path list remains project policy rather than becoming the framework default.

The core router consumes one closed ARC record, not an arbitrary project-facts bag:

- change-set state (`known / unknown`), content kind (`documentation / code-bearing`), and review risk
  (`routine / sensitive`);
- work context (`unscoped / errand / work-unit`) and WU `Class` (`none / Light / Heavy / Novel`);
- review eligibility and authority facts: ownership relation
  (`self / foreign / mixed / ownerless / not-applicable / unknown`) and surface authority
  (`planning-grooming / ordinary / design-authority / constitutional / unverifiable-derived / unknown`); and
- effective method activation.

These are ARC concepts. Project adapters own the bindings that normalize raw host identity, exact-ref Owner lookup,
concrete path predicates, and provider configuration into that record. The self-hosting gate's `auto / reviewed`
lane remains a derived presentation, not an input enum. Project customization consumes the same versioned closed
record and may emit namespaced reasons; it cannot append untyped facts.

The default reducer applies ordered effects. Code-bearing, sensitive, malformed, foreign/mixed/unknown ownership,
and elevated-authority facts can promote an obligation but never weaken the risk floor. Routine planning-grooming
artifacts with self or ownerless ownership are ARC-auto-eligible and may remain independent-analysis `exempt`;
otherwise routine documentation is `recommended`. Work context never weakens the per-change baseline. `Class` does
not reclassify risk or mechanically add provider requests: the default uses it only to select WU assurance output —
`none` for unscoped changes, Errands, and `Light`; `terminal-aggregate` for `Heavy` / `Novel`. Auto-eligible formative
planning remains exempt even inside a `Heavy` / `Novel` WU. A project that wants `Class` to strengthen per-change
obligations must encode that promotion explicitly in its versioned typed policy, where it enters `policyVersion`.

V1 core reasons include `unknown-change-set`, `auto-eligible-planning`, `reviewed-routine-documentation`,
`routine-code`, `sensitive-change-set`, `self-owned-artifact`, `ownerless-artifact`, `foreign-owned-artifact`,
`mixed-ownership`, `unknown-ownership`, `design-authority`, `constitutional-surface`,
`unverifiable-derived-surface`, `self-review-inactive`, `frontline-inactive`, `frontline-policy-skip`,
`frontline-policy-offer`, `frontline-policy-attempt`, `invocation-force`, `invocation-skip`, `source-invocation`,
`source-developer`, `source-project`, and `source-unbound`. Assurance projection adds
`assurance-group-coalesced`, `assurance-group-singleton`, and `wu-terminal-assurance`; these describe composition,
not risk reclassification. Project policy codes use the registered `project:<policy-id>:<code>` namespace and enter
`policyVersion`. The CLI computes the effective per-deliverable obligations, frontline action, and
`assuranceMode: none | terminal-aggregate`; the assurance planner consumes that output rather than re-reading
`Class`. Provider and host-channel selection remain adapter/project decisions, so `local-only` or `local + PR` is a
derived presentation rather than another technical enum.

#### Joint assurance plan with `pr-decomposition` — settled

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

This scales the review mechanism, never the engineering bar. `quality-gate-commands` remains `Class`-invariant;
review routing determines which review obligations and actions apply. The method records the metering economics
(separate provider pools, PR-specific adaptive throttles, and repeated heavy-CI cost) as rationale.

#### Gate projection contract

The host-side gate consumes only the independent-analysis obligation for the normalized exact change set. Author
self-review stays a workflow obligation, and frontline action/result never crosses the satisfaction boundary. The
projection is a lossless mapping, not a second policy decision:

```yaml
independentAnalysis:
  obligation: exempt | recommended | required
  reasons: [reason-code, ...]
  rubricVersion: independent-analysis/v1
  rubricDigest: digest
  retrigger: none | incremental | full-final
```

`exempt` emits no gate requirement but remains an explicit policy decision with reasons. `recommended` emits a
visible, non-blocking requirement; `required` emits the same requirement shape as blocking. Project gate policy then
adds acceptable source kinds/qualifiers and automatic-vs-checkpoint admission — host mechanics that do not belong in
review routing — before binding `changeSetId`, `headSha`, and `policyVersion`. V1 fixes `count: 1`: one requirement is
satisfied by one qualifying source chain. Multi-reviewer assurance, if later justified, uses separate requirements
until coverage reduction defines counted independent chains explicitly. The valid policy pairs are `exempt + none`
and `recommended|required + incremental|full-final`; a non-exempt obligation cannot select `none`.

The resulting requirement carries `rubricVersion + rubricDigest`, retrigger treatment, typed reasons, and the exact
change-set identities. `policyVersion` hashes the normalized obligation plus project source/admission policy, rubric
identity, and retrigger treatment. A source qualifies against the rubric pair, not the version string alone; its
carrier-specific `guidanceDigest` remains an additional proof of what it received.

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

This WU owns a forward-only gate-contract version bump for those semantic fields; it does not mutate the current
schema-v1 exact-key contract in place. The new requirement and request/evidence identities bind `rubricDigest`,
`reviewTarget.targetId`, and member coverage; the requirement plus coverage reducer bind `retrigger`, and
`policyVersion` includes them. Group receipts and series-membership proofs are new strict contract kinds, not fields
smuggled into v1 evidence. Current v1 receipts and evidence are ineligible for the new requirement rather than
silently upgraded, which is safe while the controller is not merge authority. `cli-substrate-adoption` owns the
shared schema-version mechanism and registry API, but not this compatibility decision. Review-gate qualification /
promotion retain live-provider proof and required-check cutover; the normalized contracts, reducer behavior, strict
parser migration, and stale/group-membership tests are implementation scope here.

Coverage starts with one full review from the target's diff base through its requested head. For a group, the result
must also cover every manifest member and named seam. `incremental` permits a contiguous same-source chain after
approved fixes; every link is exact and the chain must reach the current target head. `full-final` may use
incremental passes for feedback, but satisfaction requires a final full review of the settled target. `none` is the
exempt treatment and creates no review request. Lifecycle-bookkeeping-tail and series-membership carry-forward are
separate typed applicability proofs; neither silently broadens target coverage.

ARC ownership relation, artifact authority, work context, `Class`, and review risk enter routing as normalized facts;
raw host lane labels and project classifier names do not enter the requirement. `pr-decomposition` supplies the
authored assurance plan and series-membership proofs; the gate validates those typed inputs but neither counts PRs
nor infers topology from host containers.

#### Shared change-fact classifier

CI run weight, review risk, ownership/authority eligibility, and review obligations remain different decisions, but
they must consume the same pure path facts. The CLI owns one changed-path fact resolver that returns at least
known-vs-unknown change set, code-surface membership, and stable named surface memberships. Consumers map those facts
independently:

- CI maps code-surface facts plus its verified-tree history to `light / heavy` scheduling;
- review risk maps code and project-sensitive surfaces to `routine / sensitive`;
- the ownership/authority resolver combines exact-ref ARC Owner data with those facts to emit normalized ownership
  relation and artifact-authority reasons; and
- review routing combines those facts with work context, `Class`, risk, and activation to emit obligations,
  frontline action, and WU assurance mode.

The fact resolver consumes changed-path records, not destination strings:
`{ status: added | modified | deleted | renamed, path, previousPath? }`. A deletion classifies its deleted path; a
rename classifies the union of old and new endpoints, and either endpoint can establish code or sensitive-surface
membership. Missing required rename metadata, an unknown status, an empty set, or malformed input fails closed at
the fact boundary. The verified-tree Checks-API lookback, ownership/meta reads, and policy mappings are not reusable
facts and stay with their consumers. Raw host identities, path predicates, provider ids, and `auto / reviewed` lane
presentation stay in the project adapter; their normalized ARC reasons are what routing and requirements retain.

For this repository, the path predicate currently authoritative in `scripts/classify-change.sh` moves behind the CLI
resolver; the shell entry becomes a compatibility/CI adapter and supplies status plus both rename endpoints rather
than remaining a second implementation. The review gate's current TypeScript-extension-only
`derivesCodeSurface()` approximation retires — it misses package manifests, shell, fixture, workflow, and project-
extension surfaces that the canonical predicate correctly treats as code-bearing. Risk-specific project paths remain
project policy layered over the shared facts.

### 2. Review roles, methods, and rubric

- `self-review` — rename of `diff-review`; the authoring agent reviews its own aggregate diff. The existing
  non-evidence contract carries forward.
- `frontline-review` — new, inactive-by-default method; a distinct fresh/local reviewer privately attacks the
  aggregate change before request creation. Findings are advisory and triaged, and the run authors no satisfying
  evidence by default.
- `independent-analysis` — reviewer-facing, versioned baseline rubric: intent/scope, correctness/failure behavior,
  trust/compatibility, verification, and coherence/maintainability over the complete requested change set. Hosted
  adapters deliver this minimal rubric through provider-native instruction surfaces; reviewers never receive the
  ARC coordination workflow or the author's conclusions.
- `review-response` — new; the respond-to-received-findings cycle, replacing integration's inline content.
- `review-triage` — unchanged position: source-agnostic classifier used by every finding-producing role.

`peer-review` is not the hosted-review abstraction and does not need to ship for symmetry. A future optional entry
may marshal context for a person or interactive agent intentionally reviewing another change, but the reusable
contract is `independent-analysis`. A hosted source unable to receive or demonstrate the bound rubric remains
useful advisory input but cannot claim satisfaction of that rubric version. Specialized project rubrics — the
thermonuclear maintainability skill is one example — augment the baseline and satisfy it only when all baseline
dimensions are also covered.

Fresh-agent bindings reuse `adversarial-review`'s context-isolation and primary-held-judgment primitives rather
than inventing a second spawn doctrine. Hosted and human bindings use their native carriers; all keep author
beliefs, suspected weak spots, preferred fixes, and self-verification claims out of first-pass context.

#### Independent-analysis authority and delivery contract

The canonical public procedure is the shipped `independent-analysis` method. Its invariant contract owns the
rubric's identity; its default supplies neutral evaluation guidance. It is not a new knowledge/rubric document
family, a peer-review workflow, or review-gate policy. The method owns one typed contract record whose semantic
fields are:

- **version:** `independent-analysis/v1`;
- **coverage:** the complete exact requested change set, not a sample or only the latest fix;
- **evaluator boundary:** a non-author evaluator works from source and governing project context, without author
  conclusions, suspected weak spots, preferred fixes, or self-verification claims;
- **dimensions:** intent and scope; correctness and failure behavior; trust boundaries and compatibility;
  verification quality and missing cases; coherence and maintainability;
- **finding floor:** every actionable finding states materiality, a stable code/document locus, source-grounded
  evidence, and why the change fails the rubric; and
- **clean rule:** a clean result is legal only after all dimensions have been considered across the full requested
  change set. Unavailable, partial, ambiguous, or failed review is never clean.

The typed record is structure, not prose control flow. Its schema composes with the shared kernel; the method is the
human-authored public home, and build/validation tooling projects the record into runtime constants and carrier
payloads instead of repeating the version and dimensions by hand. A normalized `rubricDigest` covers the identity
contract above. Changing any identity field requires a version change in the same reviewed commit; editorial method
guidance may change without a version bump only when the contract and digest remain stable.

Delivery adapters expose the rubric through each reviewer's native carrier:

- hosted Codex receives a managed `AGENTS.md` review-guidelines projection plus the owned trigger;
- another hosted provider receives its provider-instruction/configuration projection when that carrier can deliver
  and prove the complete contract;
- a local agent or command receives a precomposed neutral prompt;
- a human receives the equivalent checklist and exact-change-set coordinates.

These are projections, not additional authorities. Each includes the rubric version and baseline payload; project
guidance may add context or a specialist augmentation but cannot delete or weaken a baseline field. Adapters resolve
the effective instructions for the exact changed paths, mechanically validate that the baseline projection is
present and unambiguous, and record a `guidanceDigest` for the actual carrier content. A missing, stale, conflicting,
or unverifiable projection leaves the source advisory and non-satisfying.

V1 preserves the current hosted Codex qualification rule: every changed path must resolve to the same effective
guidance set. Project context or specialist augmentation qualifies only when it is root-scoped or repeated
identically across the requested change set; differing nested instruction sets remain conflicting and therefore
advisory. Composing several path-specific rubrics into one provable request is future adapter work, not an implicit
relaxation of this contract.

Gate binding therefore carries both identities: `rubricVersion + rubricDigest` prove which evaluation contract was
required, while the source qualification's `guidanceDigest` proves what the reviewer actually received. The reviewer
never receives the ARC coordination workflow, controller state, author dispositions, or a finding hypothesis. This
is neutral criteria and coverage, not an authored interpretation of the change; evaluator independence remains in
the evaluator and its source-grounded analysis.

Specialist review augments rather than replaces the baseline. For example, a thermonuclear maintainability pass may
add stricter maintainability questions, but it satisfies `independent-analysis/v1` only when the same run demonstrably
covers every baseline dimension and output rule. Its specialist identity remains separately visible so downstream
policy can distinguish baseline satisfaction from the additional assurance.

#### Review-response contract

`review-response` is the channel-neutral author-side cycle after a finding-producing run. Its inputs are the exact
review target, the source-normalized findings and loci, the effective `review-routing` result, and adapter capability
handles — never provider command prose. It runs one bounded sequence:

1. verify each finding against source, classify it with `review-triage`, and obtain approval for the complete
   disposition set before mutation;
2. apply approved `FIX NOW` / `MINOR FIX` changes as one review increment, run affected quality gates, and let the
   caller's commit/push interlocks persist the result; `DEFER` / `REJECT` leave the head unchanged;
3. return the approved dispositions, verification evidence, and old/new exact target to the adapter so it can record
   audience-visible replies and closure with its own authority; and
4. when the head changed, return to `review-routing` and the channel adapter for the permitted retrigger rather than
   choosing or invoking a provider inside the method.

Completion means every received finding has an approved disposition, every approved fix is verified and persisted,
and any channel-owned blocking conversation has either authoritative settlement or an explicit still-blocking
result. The method never equates thread resolution with authority. The four-way local taxonomy remains canonical;
adapters with only `FIX / DEFER / REJECT` map both `FIX NOW` and `MINOR FIX` to `FIX` while retaining the finer
classification in the disposition record. This is the reusable cycle graduated from integration Step 4 and the
project coordinator; exact controller actions, await loops, receipts, replies, and thread mutation stay adapter-side.

### 3. `frontline-review` as an opt-in ARC feature

The role has a stable framework purpose: privately expose the aggregate change set to a distinct reviewer before
opening the change request so obvious findings resolve without public review churn. This is attention and spend
shaping, not cleanup for its own sake: the public reviewer receives less noise, can spend attention on residual
high-signal concerns, and requires fewer hosted repeat passes and fewer review tokens. Promote that purpose into
the integration and Errand creation paths; the generic `pre-pr-open` extension remains available for unrelated
project actions but no longer owns the semantic feature.

The method contract is provider-neutral:

1. review the aggregate candidate diff from a context distinct from the author;
2. apply the selected reviewer binding without prescribing a provider;
3. verify, disposition, and approve findings through `review-triage` before fixes land;
4. after at least one approved `FIX NOW` disposition changes the review target, allow one bounded follow-up according
   to project policy; `MINOR FIX`-only changes do not spend a second frontline pass;
5. report unavailability or pass-cap exhaustion without calling it clean; and
6. never discharge independent-analysis obligations unless a separately-reserved invocation runs the complete
   rubric and emits a qualifying receipt.

Configuration divides by authority: project policy activates the method and maps normalized classifications to
actions; the developer binding chooses a locally available preferred source; an invocation override may force,
skip, or replace that source for one run. The activation/binding contract composes with
`customization-arch-realign`; deterministic selection lands in a typed CLI result so future workflow agendas can
dispatch without prose logic. V1 does not build a generic provider registry — project overrides/adapters bind
concrete commands, and repeated bindings may justify a registry later.

#### Frontline activation and source-binding contract

Four inputs retain distinct authorities and feed one deterministic resolver:

- **Method activation (project-static):** `frontline-review.active`, default `false`, is the ordinary project-wide
  enable bit. It follows the method-activation model rather than recreating an activity toggle in config.
- **Action policy (framework default or project-static override):** a typed policy maps normalized review facts to
  `skip / offer / attempt`, chooses a project-default source when one exists, and selects one or two allowed passes.
  The default matrix in § 1 is code-owned policy; customization supplies typed values or an adapter implementation,
  never an English condition or a new expression language.
- **Developer binding (user-scoped):** an optional preferred source names what is locally available to this
  developer. It is a private preference, not tracked project policy; its current storage transport may be git config,
  but the resolver consumes a storage-neutral user-scope value so a future private user store does not reshape the
  contract.
- **Invocation override (one run):** `mode = inherit | force | skip` plus an optional source. `force` temporarily
  activates the role and overrides a policy skip without mutating project policy; `skip` accepts no source;
  `inherit` plus a source replaces only source selection and leaves the action decision intact.

Action precedence is invocation `skip` / `force` over the project activation + action policy. Source precedence is
invocation source, then developer preference, then project default, then unbound. A source is the minimal carrier
reference `{ kind: agent | command, ref }`: `kind` selects a carrier adapter and `ref` is opaque to the resolver.
It is neither a shell fragment nor a qualifying reviewer identity. The adapter owns safe resolution and invocation;
an unresolved reference is unavailable, not a request for the agent to guess provider mechanics.

The resolver emits the semantic record below; exact Zod syntax, registry calls, and version annotations wait for the
shared schema kernel rather than being invented locally:

```yaml
frontlineReview:
  action: skip | offer | attempt
  reasons: [reason-code, ...]
  source: null | {kind: agent | command, ref: string}
  maxPasses: 0 | 1 | 2
  promptText: null | string
```

`reasons` is a controlled machine vocabulary carrying activation, policy, override, classification, and binding
provenance; it is not explanatory prose. `skip` always carries `source: null`, `maxPasses: 0`, and no prompt.
`attempt` requires a **selected** source reference, not a probe-proven available provider. When policy or `force`
calls for a run but source selection is unbound, the action is `offer` with a precomposed binding remedy rather than
`skip` or a fabricated clean result. A policy-selected `offer` may carry a selected source and a confirmation prompt.
Projects may reduce the pass allowance; V1 never exceeds the initial pass plus one follow-up after an approved
`FIX NOW` disposition changed the target.

Resolution is explicitly two-stage. The pure CLI resolver above selects policy and an opaque candidate without
executing or probing it. Only after an `attempt` or accepted `offer` does the carrier adapter resolve the ref and
check availability/authorization. A missing candidate produces the resolver's `offer`; a present but invalid,
unavailable, or rate-limited candidate produces the execution outcome `unavailable`. For `kind: agent`, routing
intent is not spawn permission: the adapter preserves the active harness's delegation-authorization contract and
turns `needs-authorization` into the precomposed offer before spawning. This keeps project activation from silently
becoming standing process-creation consent.

Execution returns a separate provider-neutral outcome — `clean / findings / unavailable / failed /
pass-cap-exhausted` — with the resolved source and pass count. Only `clean` means the selected source completed and
reported no findings; missing, ambiguous, rate-limited, or failed output cannot normalize to clean. Findings enter
`review-triage`. No ordinary frontline outcome emits an independent-analysis receipt.

For this repository, the existing CodeRabbit CLI action becomes the initial project-policy override: code-bearing
changes attempt a frontline pass, documentation skips it even when review risk independently requires hosted review,
an approved `FIX NOW` change may trigger one follow-up, and rate-limit or tool failure reports then continues. That
run remains pre-publication cleanup even when hosted review is planned.
Only a separate explicit CodeRabbit CLI invocation under the full attestation contract can act as satisfying review
evidence. Its ordinary benefit is a cleaner public diff and fewer hosted finding/fix cycles, not replacement of the
hosted reviewer. The current heavy-CI defer action remains an ordinary `pre-pr-open` extension action.

### 4. `review-triage` contract upgrade — the disposition invariant

Upgrade the contract block (override-proof) to three legs:

1. every finding gets an explicit, documented disposition (already present);
2. findings are **verified against source with the agent's own judgment** — never accepted on reviewer
   authority (anchors to DEV-RULES.ARC § Sub-agent scope: delegated outputs are advisory until verified);
3. the disposition set is **presented to the user for approval before fixes land** — classification,
   recommendation, and open questions surfaced as a report, so the user can redirect before any commit.

The procedure (four-way taxonomy, report format, commit-message record) stays in `.default`, overridable. A concise
DEV-RULES.ARC anchor also ships: verify delegated findings independently and obtain approval for the disposition
set before applying fixes. The invariant is behavioral and high-miss-cost, so it cannot live only in an on-demand
method; the method remains the procedural detail home.

### 5. Disposition etiquette — the channel split

- **Method (channel-neutral principles):** every finding's fate is recorded _where its audience can see it_;
  closure is explicit; never emit noise surfaces nobody reads.
- **Adapter/coordinator (host mechanics):** for GitHub — reject/defer dispositions reply in-thread when the
  finding has its own comment; findings without a dedicated comment get no response (no rollup-comment noise);
  threads are resolved when no further round is coming; when a round _is_ being triggered, the reviewer gets
  the chance to resolve first. Local reviews have no response surface — the disposition report is the record.
  `coordinate-pr-review`'s existing controller-normalized-findings vs provider-native-conversations split (with
  distinct closure authority) is the frame these rules slot into.
- **Routing method:** whether a retrigger is worth spending (§ 1).

### 6. Method/config migration + settled hook vocabulary

- `diff-review` → `self-review` — the method names the author-side activity it performs.
- `review.pre_merge` retires rather than renames. `self-review` gains the method-activation axis owned with
  `customization-arch-realign`; workflow callers invoke it when active. Review obligations and project gate policy
  do not recreate the activity toggle under a new config key.
- `frontline-review` uses the same method-activation architecture but defaults inactive. Activation, smart routing,
  source binding, and invocation override remain separate axes; enabling the method never turns its result into
  independent-review evidence.
- `pre-commit-review` and `pre-push-review` retain their shipped names, files, and callsites as generic low-level
  verification extension points. They lose no capability, but they own no self/frontline/independent review role and
  produce no satisfying evidence merely because their names contain `review`. Any future vocabulary cleanup is a
  naming/cascade concern, not part of this semantic repartition.
- The action-neutral `pre-pr-open` / `post-pr-open` pair and final-state `pre-merge` hook are shipped decisions.
  This WU consumes them and reconciles workflow callouts; it does not reopen extension-family naming.
- The additive override term (`extend` vs `augment`) and any behavior-preserving cascade belong to
  `naming-conventions`, with override semantics remaining in `customization-arch-realign` and deterministic
  resolution in `composable-workflows`. This WU consumes the live spelling and does not own the rename.

### 7. Enforcement division — documented honestly

Agent-side workflow methods and extensions are ergonomics, best-effort by construction; the host-side review-gate
required check is the guarantee (it fires regardless of who presses merge — manual host-UI merges bypass every
agent hook). State this division explicitly so neither self-review nor frontline review implies enforcement it
cannot deliver. The gate's core and inactive cutover machinery now exist; qualification and promotion retain
ownership of live provider qualification, required-check authority, and project-hook activation. This WU defines
the obligation interface without claiming that enforcement is already operational.

### 8. Coordinator interface + rubric/method graduation

`coordinate-pr-review.md` now provides the project-local typed action/await and authoritative finding-settlement
loop; host/provider-neutral core behavior already lives behind its controller commands. Keep that workflow as the
project binding. Graduate only the reusable procedure into `review-response` and the strengthened `review-triage`
contract; provider triggers, host conversations, receipts, and exact command loops stay in adapters/project
workflow. Graduate the neutral independent-analysis rubric separately; adapters deliver it through native reviewer
instruction surfaces without exposing controller procedure. PR-body composition remains in the adapter layer and
surfaces a non-internal `Origin` when it gives reviewers material context. A generic workflow-pointer method
override is not required for this binding and routes to `customization-arch-realign` / `composable-workflows`
rather than receiving review-specific semantics here.

## Cross-cutting

- **Review-gate seam.** Ownership relation, artifact authority, work context, `Class`, and review risk are
  ARC-normalized router inputs. The self-hosting adapter owns exact-ref Owner lookup, host-author-to-ARC-owner
  mapping, concrete path predicates, provider binding, and the derived `auto / reviewed` presentation. The gate
  consumes normalized exact-change-set requirements (`exempt / recommended / required`) projected from that ARC
  contract and binds them to the independent-analysis rubric; no raw host lane, channel enum, frontline result, or
  WU-cardinality assumption crosses the satisfaction boundary.
- **`pr-decomposition` follow-on.** The two WUs coordinate through the obligation contract, not cohort membership.
  Review architecture owns topology-neutral obligations, assurance-group target/evidence algebra, conditional seam
  proof, latest-group seam ownership, terminal aggregation, and frontline action semantics; PR decomposition owns
  the authored assurance plan, deliverable refs, cumulative review-carrier shape, merge-consumption proof, frontline
  placement, and stack orchestration. Groom it against this contract, then add `Depends On: review-architecture`
  before full launch. Its existing cardinality inbound entry is the reciprocal record; a targeted `USER-INBOX`
  capture is filed so planning close can drain the settled contract there without editing the sibling draft from
  this branch.
- **Knowledge/procedure forward-compat.** Declare reusable methods at their fire sites; keep high-miss-cost
  triage constraints in DEV-RULES.ARC; compute deterministic classifiers, `skip / offer / attempt`, and rendered
  decisions CLI-side; derive any eventual schema projection and reviewer instruction binding from one typed/rubric
  source rather than hand-authoring a second contract.
- **CLI substrate seam.** This WU settles the semantic review records now. Their implementation schemas stay
  co-located with the review subsystem, derive static types from Zod, compose shared primitives, and register with
  `cli-substrate-adoption`'s kernel. Planning and specification do not wait; schema-bearing implementation waits only
  for that cohort's small kernel head, not its resolver, executor, or other members. Bind the concrete dependency once
  the decomposition cut names the kernel member. Registry API shape, the generic schema-version mechanism, generated
  artifacts, and introspection remain the substrate owners' decisions; this WU still owns the review-gate-specific
  forward-only contract bump and v1-evidence invalidation rule.
- **Developer-binding storage.** The preferred frontline source is a user-scoped preference carried through the
  configuration/storage abstraction, not another storage mode or a tracked method edit. Project activation, action
  policy, and any project-default source remain project authority; invocation overrides remain ephemeral. This keeps
  the contract compatible with the future private user store without adding a storage axis.
- **Project frontline evidence.** The active `pre-pr-open` action already performs classify-gated CodeRabbit CLI
  review and enforces the disposition guard. `frontline-review` graduates that role into the built-in creation path
  while the CodeRabbit command becomes the project binding. A clean/nits-only result may support declining only a
  **recommended** hosted review; required or already-intended hosted review still runs against the cleaner diff.
  Qualify `--agent` output across successful, findings, empty-findings, scoped-directory, and failure cases before
  replacing `--plain`; retain `--plain` as compatibility fallback if structured output cannot support reliable
  triage.
- **`customization-arch-realign` coupling.** This WU owns `review.pre_merge → self-review.active` alongside the
  method-family reshape and defines `frontline-review`'s required activation/binding semantics. Customization
  architecture owns the general activation/composition and per-developer/invocation override model; the additive
  override naming and generic workflow-pointer questions are routed to their own homes rather than riding this
  change.

## Alternatives

Carried from the pre-rescope draft (all still standing):

- **Promote `address-pr-review` to a top-level method** — rejected; name collided semantically with
  `review-triage` and mixed reviewer procedure with author-side response.
- **Leave review response inline; projects extend the workflow directly** — rejected; inline-only override forces
  out-of-tree workflow duplication.
- **Merge self-review and independent analysis into one parameterized method** — rejected; evaluator independence,
  evidence qualification, and host conversation semantics are real contract differences.

New at the rescope:

- **Fresh WU superseding `review-method-family`** — rejected in favor of rescope-in-place: the inbound buffer
  was live (entries through 2026-07-13, two of them earlier captures of the same metering problem), and a
  supersession ceremony would orphan routed captures for no design gain.
- **Supply-side remediation (CodeRabbit Pro+, additional providers) as the primary fix** — rejected as sole
  remediation: ~1.5× weekly headroom against unbounded parallel volume. Complementary providers remain an
  adapter/project option once obligation-aware metering exists.
- **Channel-combination lanes (`none / local-only / local+pr / pr-only`) as the primary model** — rejected during
  active-draft reconciliation: they conflate obligation, channel, and delivery topology; collide with existing
  review-gate and workflow uses of "lane"; and force a future multi-PR WU to multiply policy by container. Channel
  combinations derive from independent obligations instead.
- **Promote the raw self-hosting gate's `auto / reviewed` enum unchanged** — rejected: normalize its underlying ARC
  ownership and artifact-authority facts instead. Host identity mapping, path policy, and the derived lane remain
  project bindings; the framework contract is the closed fact record and normalized obligation set.
- **Keep frontline review solely as a project `pre-pr-open` action** — rejected: private noise reduction,
  reviewer-attention shaping, and hosted-pass savings are stable lifecycle value independent of CodeRabbit.
- **Treat a normal frontline result as satisfying independent analysis** — rejected: its role is pre-publication
  shaping, it carries no qualifying receipt by default, and conflation would silently weaken required hosted review.
- **Feed hosted reviewers an ARC method/workflow** — rejected: adapters deliver only the bound neutral rubric;
  orchestration state and author conclusions stay outside reviewer context.
- **Ship `peer-review` as a first-class method for symmetry** — rejected: hosted review does not execute ARC
  procedure. A later interactive entry may be useful, but `independent-analysis` is the reusable contract.
- **Build a generic provider registry in v1** — rejected: the role and binding seam are stable; project overrides
  can prove repeated provider shapes before ARC standardizes a registry.

## Implementation Validation

- **CodeRabbit agent output:** CLI 0.6.5 advertises `--agent` as structured findings for agent workflows but does not
  publish its schema through `--help`; no stored review exists in this worktree to inspect without spending a new
  review. Qualify successful, findings, empty-findings, scoped-directory, and failure cases during adapter
  implementation. Retain `--plain` unless the structured contract proves complete and stable, so this validation
  cannot reopen the architecture or block the existing project binding.

## Scope Estimate

**Medium-Large; `Class: Heavy`** (derivation — the layer model and obligation policy are real design; confirmed at
the 2026-07-16 grooming read and active-draft reconciliation). File ripple is wide (methods/rubric × both copies,
integration + Errand creation workflows, extension docs, config/binding surfaces, strategy docs, and the project
workflow) but individually small; live-provider qualification/promotion and required-check cutover, a generic
provider registry, and multi-PR delivery mechanics stay with their existing or future WUs. The normalized gate
contract/reducer migration needed by this obligation interface remains in scope here.

**Cohort fit (reconfirmed 2026-07-18):** stays one WU — one coherent concern (the layer model) re-partitioning one
surface family; the pieces are coupled by the shared doctrine, not orthogonal subsystems. `pr-decomposition` is a
distinct follow-on concern joined by an explicit contract and dependency, not a cohort member. Re-confirm at spec
time; if implementation tries to grow a generic provider registry, split or defer that registry rather than turning
this concern into a cohort.

## Readiness

**State: formalization-ready** — the joint assurance-group design with `pr-decomposition` is settled, the authorized
fresh full-rubric pass's findings are folded, and the post-settle coherence re-read clears the result. The inbound
buffer is drained, the success signal is stateable, and every settle-able design decision is resolved. The remaining
CodeRabbit check is bounded implementation validation, not architecture.

- **Resolved:** holistic charter + layer model; closed ARC-native routing record with ownership relation, artifact
  authority, work context, and `Class`; single-deliverable obligation/action matrix; `sensitive` semantics; explicit
  self-review activation precedence; opt-in provider-neutral frontline role, two-stage source resolution, and
  deterministic follow-up trigger; canonical independent-analysis authority, identity, and one-effective-guidance-
  set rule; forward-only typed gate projection/coverage migration with `count: 1`; disposition invariant +
  DEV-RULES.ARC anchor; channel-neutral review-response cycle; rename/delete-safe shared change facts; generic legacy-
  hook disposition; enforcement division; coordinator/project boundary; capability-qualified assurance groups;
  derived member/seam group requirements and all-member merge barriers; generated seam universe with latest-group
  ownership and conditional full proof; tree-exact series-membership carry-forward; repository- and carrier-bound
  group requests with typed cross-PR satisfaction projections; aggregate `Heavy` / `Novel` terminal assurance with
  no terminal provider run; rescope-in-place disposition.
- **Open:** no settle-able design decision. `pr-decomposition` mechanics may fail a proposed grouping back to
  ordinary per-PR reviews without reopening the settled semantics. § Implementation Validation separately carries
  the non-blocking CodeRabbit matrix.
- **Next:** return to the workflow interlock; on approval, capture the draft and advance to `create-spec`. Any fourth
  adversarial pass would be an explicit extra beyond the `Heavy` default cap, not an automatic readiness step.

## Provenance

Surfaced during interlock-foundation integration (PR #23 prep, 2026-04) as the inline review-response/method reshape;
graduated from `ATOMIC-INBOX.md` 2026-04-30. Scope reshaped during PR #23 review cycle 2 (directional family).
**Rescoped in place and renamed from `review-method-family` 2026-07-16**, after wave-3 parallelism burn-in
(`finalize-parallelism`) saturated external review/CI budgets and a design session settled the holistic
charter; grooming ran warm from that session.

Buffer disposition ledger (through 2026-07-18; entries integrated into the body above or already departed):

- _Reviewed-lane gate contract consumption_ (routed 2026-07-13) → integrated: § 1 + § Cross-cutting (ARC ownership
  and artifact-authority facts are normalized; the raw project lane and host bindings are not generalized).
- _Reconcile charter with documented `MINOR FIX`_ (routed 2026-07-13) → integrated: body now written against
  the shipped four-way taxonomy; § 4 upgrades the contract without reintroducing `SILENT FIX`.
- _Consume `adversarial-review`'s fresh-subagent primitive_ (routed 2026-07-03) → integrated: § 2 wires the
  review directions onto the shipped invocation contract; the old `design-audit` buffer item stays departed.
- _PR body surfaces non-internal `Origin`_ (routed 2026-06-06) → integrated: § 8 coordinator graduation scope
  (PR-body composition decides what hoists from the meta).
- _Post-PR-open external-review trigger extension_ (routed 2026-06-08/21, interim noted 2026-06-24/07-10) →
  integrated: action-neutral lifecycle hooks and `coordinate-pr-review.md` now exist; § 1 owns obligations and
  § 8 keeps provider/host triggers in the project binding.
- _Content/lane-gate review extensions for doc-only ceremonies_ (routed 2026-06-10, evidence 2026-07-10) →
  integrated: § 1 — typed change facts drive obligations; lifecycle actions derive whether work remains.
- _`arc-design-audit` → departed to `adversarial-review`_ (2026-07-01) → unchanged: departed record stands;
  this WU is a consumer.
- _Multi-PR review + adversarial-verify cardinality_ (routed 2026-07-18) → integrated: § 1 + § Cross-cutting
  define the topology-neutral contract and route deliverable/group/seam mapping to `pr-decomposition`; reciprocal
  dependency capture filed.
- _CodeRabbit `--agent` output mode_ (routed 2026-07-18) → integrated: § Cross-cutting + § Implementation
  Validation retain a bounded project-binding qualification before replacing `--plain`.

---
