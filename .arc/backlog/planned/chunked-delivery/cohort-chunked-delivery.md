# Cohort: `chunked-delivery`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table._

**Purpose:** Plan a work unit's review surface during task generation and land the resulting chunks through one
topology-neutral delivery model. One canonical delivery plan carries stable chunk and deliverable identity, order,
membership, and assurance requirements; two first-class projections consume it — chunk change requests
accumulating on a work-unit-scoped integration target before a single merge to the protected base, and a
dependency-ordered stack that reaches the base member by member. The members exist because that one model has four
separable consumers, not because the work was large: each carries a distinct external blocker, and the blockers
partition the design along the same lines its subsystems already do.

---

## Sequencing

```text
delivery-plan-record                    no dependency — buildable now
├── delivery-integration-target         ← delivery-plan-record
├── delivery-review-cardinality         ← delivery-plan-record
│                                         + external: review-request-contracts
└── delivery-stack-topology             ← delivery-plan-record, delivery-integration-target
                                          + external: session-locus-model,
                                            a typed delivery-slice review vehicle
```

Current readiness derives from member metas and their `Depends On`, not from this orientation view.

`delivery-plan-record` and `delivery-integration-target` carry no external edge, so they are buildable
immediately and independently of the review-architecture and session-locus chains. Once they land, the remaining
two members become their first consumers — the mechanism delivers the rest of itself. That property, rather than
raw ordering, is what makes the first two the critical path.

`delivery-review-cardinality` waits on `review-request-contracts`, which is itself four deep
(`review-signal-convergence` → `review-source-authority` → `review-activity-contracts` →
`review-request-contracts`). It is severable: nothing else in the cohort waits on it. What it gates is terminal
assurance — proving the ordered sum was reviewed — which is an audit property rather than an operational one.

## Shared contracts

- `delivery-plan-record` owns the canonical plan record and its identities, the authoring verb and task-list
  projection, the mutable state contract with its store and lease, the shared transition reducer, and the
  membership and tree-exactness proof every other member consumes.
- `delivery-integration-target` owns the integration-target reducer, the generic Git / pull-request adapter, and
  the terminal integration ceremony.
- `delivery-review-cardinality` owns assurance-subject binding, qualification projection, the review authority
  boundary, verification cardinality, and the combined terminal gate. It holds the inherited assurance-group and
  seam algebra under a consume-not-adopt disposition.
- `delivery-stack-topology` owns the stack-to-base reducer, stack eligibility, the GitHub reference adapter, and
  the lifecycle-artifact exclusion with its non-regression criteria.

**Named seam — terminal contribution proof.** `delivery-plan-record` owns membership and tree-exactness;
`delivery-review-cardinality` owns obligation and coverage qualification plus the combined gate. This is the one
proof two members co-own, which is why it is recorded here rather than in either member's design.

**Out-of-cohort predecessor.** A typed delivery-slice review vehicle — admitting a member ref to exact-head
clearance — belongs to the review subsystem's vehicle schema and readiness surface, not to a delivery record. It
is independently work-unit-worthy and is an external edge into `delivery-stack-topology`, never a fifth member.

## Closeout criteria

The cohort closes when all four members have shipped, a work unit can author a delivery plan and land its chunks
under either projection without degrading ordinary operations for concurrent work, and terminal assurance proves
the ordered sum under both projections.

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

## Problem / Motivation

ARC welds two separable boundaries together: the _concern_ boundary (the work unit — correctly broad for one
uniform concern) and the _review / merge_ boundary (the PR — currently forced to equal the work unit). Industry
separates them: one concern ships as many small, individually-reviewable parts, planned up front.

The origin work unit narrows that gap for changes that are **already built** — carving an existing branch's review
surface without touching merge topology. This member closes the other half: letting a work unit decide its chunk
boundaries **during planning**, and giving those chunks somewhere to land that keeps `main` coherent.

Both mature precedents decompose up front — Google's splitting strategies plus its implementation-plan grid where
"each cell is its own standalone CL", and the Linux kernel's patch-series with its hard bisectability rule (every
intermediate state must build and run, which implies expand → migrate → contract ordering that must be _planned_).
So the chunk boundary belongs where ARC already decomposes: `generate-tasks`. Grounding research is captured in
`research-review-chunking.md` (retained by the origin).

The cost of the coupling shows up on cross-cutting work units — `lifecycle-closeout` is the trigger case: one work
unit bundling a ~20-file two-mirror doc sweep, several code-wiring legs, a new ceremony, a CLI removal, and a
terminal audit. By ARC's own criteria it is correctly _one concern_, but it lands as _one large diff_ at
integration.

## Proposed direction — shared canonical model

**Four orthogonal levels (concern / review / delivery / implementation):**

- **Work unit = the concern unit.** Planning, ownership, design, and one canonical delivery plan.
- **Chunk = the review unit.** A contract-cohesive scope defined by `review-chunking`; consumed, never re-authored
  here.
- **Deliverable = a chunk with an independent PR / merge boundary.** A dependency ordering over deliverables is a
  stack. Not every chunk must become a deliverable.
- **Phase = the task-plan grouping.** It may seed a candidate boundary but is not itself a review or delivery unit;
  chunks may cross phase / task boundaries when contract closure requires it.

**Canonical plan + human projection.** `generate-tasks` supplies the irreducible boundary, grouping, topology, and
semantic-eligibility judgments to a CLI author / bind verb. The schema-kernel-derived `DeliveryPlan` record owns
stable identity, ordered chunk / deliverable membership, selected projection, and invariant assurance requirements.
The task list renders a concise delivery-plan view and per-task / spec coverage, but it does not become a second
schema or a topology mini-language. A mutable, version-checked `DeliveryState` separately tracks the exact facts from
which current position, predecessor consumption, and terminal readiness derive. It references review-system
identities and derived verdicts without becoming another review ledger. Delivery binds state to an immutable plan
revision by digest. A plan amendment creates a new revision and an explicit reconcile boundary; state never silently
follows changed intent.

**One topology per plan revision.** A revision selects either WU-integration-target or stack-to-`main`, never mixed
segments. This keeps projection a single discriminant rather than a second orchestration language. A mixed work
unit whose complete concern cannot land safely in increments uses the integration-target projection; it decomposes
into sibling work units only when the concern boundaries independently warrant that cut.

**Two first-class projections.** Both consume the same plan and preserve the same chunk / deliverable identities:

- **WU-integration-target.** Deliverable PRs accumulate on the WU's integration target, then the WU integrates to
  `main` once. Intermediate PRs do not consume the exclusive final-integration window. Terminal assurance proves
  that the final target is the ordered sum of the reviewed deliverables with no extra delta.
- **Stack-to-`main`.** Deliverable PRs form an ordered branch chain whose bottom targets `main`; eligible
  deliverables may land incrementally or as an atomic group when the provider supports it. Rebase / squash identity
  changes are projection mechanics, never changes to ARC's canonical delivery identity.

**Amended invariant.** The storage-compatible core invariant is `1 WU = 1 delivery plan, emitting ≥ 1 PR`; WU
identity never derives from one branch. The current in-git projection may use one authoritative WU / integration
branch plus disposable delivery refs, while future storage and provider adapters preserve the same WU and
deliverable identities under different materializations. This touches `integrate-work-unit`, `generate-tasks`, the
task-list strategy and template, the spec form, session locus resolution, and `assess-cohort-fit`'s current use of
"stack" for dependency-ordered WUs. Deep change; an enhancement, not a bug-fix.

**Procedure shape.** The topology record is domain data, not an agenda. CLI verbs own deterministic transition,
projection, ref / path, provider, proof, and remedy mechanics and emit typed verdicts plus precomposed text.
Workflow spines declare inputs / outcomes, invoke those verbs, preserve unconditional interlocks, and re-resolve
after mutation. Topology-specific paths may become fixed private procedural fragments; neither projection duplicates
the invariant lifecycle.

**Deferred — the cover letter / reviewer's guide.** Composing `meta` / `spec` / `cohort` into a PR-side guide is a
human-_navigation_ aid, not a surface reducer (so it does not help AI review), and it is storage-sensitive
(`strategy-storage-evolution` moves those artifacts to a separate backing store). Out of scope here; coordinate
later.

## Delivery sequencing — field evidence before formalization

This work unit cannot ship in time to serve the work that motivated it, and does not need to. The motivating
blockage is two in-flight work units whose change sets outgrew reviewable size: `decompose-transform-integrity`
at 27.4k insertions across 146 files with its implementation phases only partly complete, and
`session-locus-model` at 50.5k insertions across 375 files. Neither waits on this contract.

- **The review half already shipped.** `review-chunking` owns the review-only retrofit — carving an already-built
  branch's review surface with no merge-topology change — and its exact-target chunking resolver is live. Review
  tractability for a large coherent branch is available today, independently of delivery topology.
- **The topology half needs no contract to execute.** Integration branches and dependency-ordered pull requests are
  native Git and host capabilities. What this work unit adds is the canonical plan, the delivery record, and the
  terminal contribution proof — not the ability to arrange refs.
- **The transform cannot bootstrap itself.** `decompose-transform-integrity` _is_ the decomposition transform, so it
  is cut by hand under every possible sequencing. No ordering of this work unit changes that.

Both blocked work units therefore run their cut manually, and those runs become this work unit's missing input:

- `session-locus-model` has already authored a thirteen-slice stack-to-`main` cut in its own task list. The cut
  follows the module import graph — acyclic across 72 new modules — into concern-coherent slices; each branch
  targets its predecessor and the host retargets to the base as each merges; the seam inventory and ordering proof
  are recorded alongside. That is this contract's stack projection, executed by hand and in full.
- `decompose-transform-integrity` cuts along task-scoped commit ranges at a completed phase boundary, before further
  implementation interleaves the ranges. Its measured candidate stack is uneven — planning plus the first phase at
  roughly 16.2k changed lines over 20 commits, the second at 6.9k over 11, the third at 11.5k over 15 — and carving
  planning into its own slice still leaves the first implementation slice near 12k. No candidate slice falls below
  the review scale that already held a sibling work unit non-executable.

Formalize against what those runs prove. The exact points to harvest are the ones the canonical model currently
asserts without evidence: whether plan-ordered membership survives a real rewrite cascade, what reconciliation
actually costs when a base advances mid-series, whether the seam-owner derivation matches the seams a real cut
produces, and where the manual procedure needed judgment that the CLI-owned-procedure boundary assumes is
deterministic.

**Semantic-coherence cost is projection-owned, not work-owned.** The first hand-run's boundary test is the earliest
substantive correction to this design. Task-scoped commit ranges that pass their own quality gates still failed the
stack-eligibility test: each candidate head advertised a surface its runtime had not yet wired, so the states were
test-green and semantically incoherent at the same time. Making them independently landable requires compatibility
caps — code written only to hold an unfinished surface dormant, superseded by the slice that finishes it.

Those caps are an artifact of the projection rather than of the work. Stack-to-`main` requires every member to leave
the protected base coherent, so it must buy that property wherever the authored boundaries do not already supply it.
The integration-target projection accumulates members on a private target and reaches the protected base once, so the
requirement never arises and the same boundaries land uncapped. The stack-eligibility invariant therefore prices a
real construction cost, not merely a judgment the author records — and the throwaway caps carry their own exposure: a
stack abandoned mid-series leaves dormant surfaces on the base with nothing structurally obligated to remove them.

**Chunking reduces surface; topology only redistributes it.** Neither projection makes a member smaller. Where every
candidate member still exceeds the project's review scale, the delivery cut alone does not deliver reviewability, and
the chunk / deliverable split is what resolves it: a member may land as one merge boundary and still be reviewed as
several review-only partitions of that exact target, which carry no delivery identity of their own. The two
mechanisms compose because the review boundary is orthogonal to the merge boundary by construction. Keep that
composition explicit in the spec — a reader who takes delivery cutting
as the reviewability mechanism will size members against reviewer capacity and reach for splits the topology cannot
justify.

**Enforcement asymmetry between the projections.** The two projections do not carry equal structural enforcement,
and the current default was settled without weighing it. Under the WU-integration-target projection only the
terminal merge reaches the protected base, so member change requests receive no required host-side check and the
terminal target still presents the whole contribution for gating. Under stack-to-`main` each member reaches the
protected base as the landed prefix advances, so every member is gated at member size. Where a repository protects
only its base branch — the common case, and this project's own configuration — integration-target chunking buys
review tractability by discipline, while stack-to-`main` buys it structurally. This does not weaken either
projection's contract, and it does not make integration-target unsound: terminal assurance still proves the ordered
sum. It does mean the default should be argued from a project's actual protection surface rather than from topology
alone.

Weigh that enforcement gain against its costs, both of which the first hand-run surfaced: the compatibility caps
above, and re-review on retarget. Every advance of the protected base that a member absorbs derives a new exact
review target, and prior coverage carries only across a conflict-free delta disjoint from the reviewed paths — so a
member count is a floor on review passes, not an estimate of them. Where the base moves briskly, a stack's review
cost scales with base movement as well as with member count, while an integration-target series reconciles against
the base once. Two host facts also condition the comparison and belong in the adapter capability contract rather than
the plan: whether the host permits a merge method that preserves commit identity across the series, and whether its
required checks bind to the exact head such that a retarget without a head change can carry a stale verdict.

**Field-evidence status (2026-07-30).** `decompose-transform-integrity` shipped its full stack — seven delivery
slices plus the terminal merge — so its half of the input is complete and reconstruction-only from here.
`session-locus-model` has landed three of thirteen slices and remains in flight. Against the four harvest points
above: the rewrite cascade and the mid-series base-advance cost are both answered, the second measured from the
bystander side as well as the cutting side; the seam-owner derivation can be checked now against
`session-locus-model`'s up-front seam inventory, which does not depend on its slices landing; and the
manual-procedure judgment points accrue per slice and have already repeated. Formalization therefore does not wait
on the remaining ten slices. What would still change the design is a structurally new event rather than another
instance — a rewrite cascade that breaks plan-ordered membership, a stack abandoned mid-series, or a host merge
method that silently breaks commit identity. Those are a watch list, not a gate.

**Bystander cost is a distinct axis.** The harvest points above are all cutting-WU cost. A partially-landed stack
also imposes a cost on every concurrent work unit that merges the base, and none of it is visible from the cutting
branch. Measured on one such sibling in a single session: `arc release commit` refused with `ambiguous-active-wu`
for the rest of that session, so four commits fell back to raw Git; the handoff path set resolved its session-notes
pointer to null; session initialization and handoff both took the multiple-candidate arm; and every lifecycle
invocation emitted seven to nine shadowing advisories. The cost scales with how long the stack stays partial, which
makes it a property of the projection's dwell time rather than of the work. Record it beside the cutting-WU axes: a
stack-to-`main` plan that will sit half-landed for a week prices differently from one that drains in a day, and the
integration-target projection never incurs it.

**A non-final deliverable excludes the owning work unit's lifecycle artifacts.** That bystander cost has one
proximate cause. One-work-unit-one-PR keeps a unit's own artifacts branch-private for free, because creation and
archival both happen inside the merging change request. A stack removes that: the first slice published the unit's
metadata, notes, spec, and task list to the protected base in active state, where they stayed for the remaining
slices. State the exclusion as an invariant on member composition and let a check enforce it.

State the rule; do not build machinery for it. The storage direction already classifies operational state —
metadata, task lists, notes, inboxes, and the rendered roadmap — as materialized rather than tracked, with authored
design materialized by default under a single knob. Under that target none of these artifacts is in the code
repository at all, and the failure mode dissolves rather than needing delivery machinery to manage it. Path-set
negotiation, artifact-holdback state, or a per-deliverable "publish artifacts" flag would all be dead weight there,
and the last is a per-artifact tracking boolean by another name — the matrix the storage model deliberately
collapsed into one enum.

Two constraints follow from phrasing the rule correctly. It must be written over the **records the storage layer
owns for this work unit**, not over a list of tracked paths: under the current in-repo tier the two coincide, but a
path blocklist would bake in exactly the tracked-storage assumption the abstraction principle prohibits, where a
records-phrased rule goes quietly vacuous once the artifacts materialize. And the reviewability it costs — a slice
reviewer cannot see which tasks the slice closes, and the base cannot render in-flight state from its tree — is a
current-tier cost only, self-liquidating once the roadmap renders from records and the reviewer's view comes from
the delivery plan. Do not over-invest in compensating for it.

**Non-regression is this contract's obligation, not a routed one.** Chunked delivery must not degrade ordinary
operations for concurrent work, and any operation a delivery in flight degrades is therefore in scope here.
Forward-compat discipline forbids building machinery that a later tier must undo; it does not license shipping a
known regression against a substrate that may be far out. Where the two pull apart, the resolution is the cheapest
mechanism that does not deepen coupling — not deferral.

Most of the observed damage needs no separate mechanism, because the exclusion invariant above removes it at the
source: multiple-candidate resolution, the ambiguous-work-unit commit refusal, the null session-notes pointer, the
multiple-candidate arm at initialization and handoff, and the shadowing advisories are one cause with five
symptoms. The exclusion also goes vacuous rather than wrong once operational state materializes, so it is the rare
fix that is both immediate and terminal.

**The single-branch metadata field needs no schema change.** A stacked unit has one branch per slice while its
metadata record carries a single branch field, which is what the shadowing advisories report across five candidate
branches. Delivery must not answer this with a per-slice branch list — that deepens work-unit-to-branch coupling in
the direction the storage model is leaving. The answer is a boundary statement instead: **delivery refs are not
work-unit branches.** The metadata field keeps naming the unit's own branch; delivery refs live in a namespace the
delivery record owns and binds. That reinforces the identity-decoupling principle rather than bending it, and it
costs nothing.

What remains genuinely outside this work unit is the **scope** of the materialized active-work projection —
worktree-scoped, developer-scoped, or every unit — which governs what active work resolves to for all work units,
stacked or not. State the constraint here and let the storage and local-mode design satisfy it: **a delivery member
must not perturb another work unit's session resolution.**

**Session position mid-delivery — recorded, but not resolvable, and not yet handoff-safe.** The delivery ref itself
is durable: the state contract already carries one plan-ordered entry per deliverable with its ref and
change-request handles, its last exact base / head / tree observation, and the owning repository and work-unit
identity, held in a store with version-checked publication rather than as a tracked tree file. That is the right
shape and it survives the storage tier change untouched. Three things it does not yet supply:

- **The reverse lookup.** The record maps a plan to its members and their refs; a session occupying a member ref
  needs the inverse — this head resolves to which plan, which member, which parent unit — and needs it _before_ it
  knows which plan to read. No query or index is specified for that direction. Note this is a lookup in an
  authoritative binding, not an inference from branch naming, so it does not reintroduce the identity coupling the
  boundary statement above removes.
- **Reachability from a member checkout.** The exclusion invariant is what makes this decision-forcing. Previously
  a slice checkout could answer "where am I" from the lifecycle artifacts it had wrongly published; with those
  correctly absent, nothing in the tree answers it. The state store must therefore be reachable from a checkout
  that deliberately carries none of the unit's artifacts — which rules out placing it in the delivery's own tracked
  change set and leaves the choice to the storage layer.
- **Handoff mid-delivery.** Unaddressed. Handoff anchors session notes on the work-unit name and writes the next
  action to the unit's metadata, and on a member ref neither is present in the checkout. A delivery that cannot be
  handed off mid-stack fails the non-regression obligation above as squarely as the commit refusal did.

This corrects a sequencing assumption recorded earlier. Automatic session resolution was treated as a convenience,
on the grounds that explicit delivery commands remain usable without it. An explicit per-invocation pointer is not
durable across a session boundary, and durability across that boundary is exactly what handoff requires — so for
the stack-to-`main` projection, automatic resolution is not a convenience but the mechanism by which a session
knows what it is working on at all. Either `session-locus-model` becomes a hard prerequisite for that projection,
or delivery owns a minimal durable position record, which this design has so far declined to build. That fork
belongs to the cohort cut.

Phrase the requirement as a **query contract, not a storage choice**: given a repository and a head or ref, return
the plan, member, and owning work unit. Under records-canonical projection that is an ordinary record query and the
tier change is transparent; today it needs a home outside the delivery's change set. Specifying the query rather
than its placement is what keeps the answer from having to be rebuilt.

**The structural-enforcement claim needs narrowing.** The asymmetry argued above holds for host-side required
checks but not for ARC's own review clearance, and the gap is load-bearing precisely because that asymmetry is the
stated reason to re-argue the default from a project's protection surface. The first hand-run proved a reviewed
slice cannot currently reach cleared state: one delivery slice passed complete local and hosted checks, provider
review, and settlement of all fourteen inline threads at an exact head, and the unlock still failed on a
vehicle-branch mismatch. The delivery ref intentionally encodes no canonical unit slug and carries no independent
lifecycle identity, while the review vehicle schema admits only work units and errands. A pinned administrative
merge was rejected because branch protection applies required checks to administrators, so no scoped bypass exists
without weakening protection or forging trusted status — and the incompatibility recurs for every reviewed slice.

Stack-to-`main` therefore buys structural enforcement **from the host**, which is real and is what rejected the
bypass, while ARC's own gate cannot presently admit a member at all. Decide whether a typed delivery-slice vehicle
— or an equivalent parent-bound projection authenticating plan-member identity, parent unit, exact head,
predecessor relation, and landable state — must land as a prerequisite before this contract can claim structural
enforcement end to end. It must not fabricate a metadata file, weaken work-unit or errand readiness, or let an
earlier review confer authority on a later slice. This is the sharpest open input to the cohort cut, because it
decides whether review admission is a member of the first cohort or a hard predecessor to it.

**Settled — segment refinement is the authoring default, never an invariant.** `plan-segmentation` models a task
plan as ordered segments, each carrying a mode that states what its boundary closes on. Because every
implementation leaf occurs in exactly one member in task-inventory order, membership is induced by task order, so
segmentation is an input to delivery authoring rather than a competing annotation. The question is whether a member
must lie within one segment — only promoted chunks carry delivery identity, so this is a constraint on members, not
on review-only partitions.

It must not be an invariant, and the first hand-run is what decides it. A horizontal substrate segment followed by
a vertical slice segment is exactly the shape whose seam sometimes has to be spanned for a member to leave the base
coherent; forcing members inside segment boundaries would systematically manufacture the compatibility caps
documented above rather than avoiding them. The deciding argument is that the plan already requires every member to
carry the `independently-landable` invariant. Landability is the real constraint, and segment refinement is a proxy
for it that is neither necessary nor sufficient — a member can span a seam and land cleanly, or sit wholly inside
one segment and not.

So refinement is the **default the authoring verb applies**, which preserves the free derivation in the common case
`plan-segmentation` expects, and a spanning member is authored without ceremony. The override needs no separate
justification field: the landability assertion the member already carries bears that burden, so this decision adds
no record surface.

## Cohort cut

The cut fires affirmative at the 2026-07-30 maturity gate. The discriminator is orthogonality rather than size, and
here the two coincide legibly: each member's external blocker is distinct, and the blockers partition the design
along the same lines its subsystems already do. Placement is `standalone` — the "one canonical model, two
first-class projections" invariant is shared coordination no single member owns, which requires a cohort-backed
home rather than flat siblings.

- **`delivery-plan-record`** — the canonical plan record and its schema-kernel identities, the task-generation
  authoring verb, the human task-list projection, the mutable state contract with its store and lease, the shared
  transition reducer, and membership / tree-exactness proof. _Depends on:_ nothing.
- **`delivery-integration-target`** — the work-unit-scoped integration-target reducer, the generic Git /
  pull-request host adapter, and the terminal integration ceremony. _Depends on:_ `delivery-plan-record`.
- **`delivery-review-cardinality`** — assurance-subject binding, qualification projection, the review-authority
  boundary, work-unit verification cardinality, and the combined terminal gate. _Depends on:_
  `delivery-plan-record`; externally `review-request-contracts`.
- **`delivery-stack-topology`** — the stack-to-base reducer, the stack-eligibility test, the GitHub reference host
  adapter, and the lifecycle-artifact exclusion with its non-regression criteria. _Depends on:_
  `delivery-plan-record` and `delivery-integration-target`; externally `session-locus-model` and a delivery-slice
  review vehicle.

**Named seam — terminal contribution proof.** `delivery-plan-record` owns membership and tree-exactness;
`delivery-review-cardinality` owns obligation and coverage qualification plus the combined gate. This is the one
proof two members co-own, so it belongs in the cohort's shared coordination rather than either member's spec.

**The cohort bootstraps itself.** `delivery-plan-record` and `delivery-integration-target` carry no external edges,
so they are buildable immediately and independently of the review-architecture and session-locus chains. Once they
land, the remaining two members become their first consumers — the mechanism delivers the rest of itself. That
property, not raw sequencing, is what makes the first two members the critical path.

`delivery-plan-record` ships a substrate contract rather than an end-to-end capability: a plan can be authored,
validated, and projected, but not executed until the integration-target member lands. That is deliberate — it is
independently reviewable without being independently useful, which the residual-risk reading treats as the correct
shape for substrate work. The two stay separate so each lands at a reviewable size.

**Out-of-cohort predecessor.** The delivery-slice review vehicle — typed admission of a member ref to exact-head
clearance — belongs to the review subsystem's vehicle schema and readiness surface, not to a delivery record. It is
independently work-unit-worthy and is recorded as an external edge into `delivery-stack-topology` rather than
adopted as a fifth member.

## Unknowns and Assumptions

- **Projection observations:** the canonical plan and member / seam fingerprints are settled. Exact
  projection-specific host-observation field spelling remains implementation detail inside the already-fixed
  authority boundary: immutable plans; one non-evidentiary, version-checked snapshot; one resumable host operation;
  derived positions; and explicit replacement when bound intent changes.
- **Session-locus availability:** the core state contract accepts an owning-WU pointer explicitly, which is
  sufficient for the integration-target projection. It is **not** sufficient for stack-to-`main`: with lifecycle
  artifacts correctly excluded from member change sets, nothing in a member checkout resolves position, and an
  explicit per-invocation pointer does not survive a session boundary. See § Delivery sequencing — either
  `session-locus-model` is a hard prerequisite for that projection or delivery owns a minimal durable position
  record. Open for the cohort cut; delivery still authors no second locus record.
- **Delivery-host capability:** the generic Git / PR fallback and GitHub native adapter must implement the same
  semantic capability contract. Public-preview GitHub behavior is evidence, not a promise of stable API shape:
  availability broadened to all repositories on 2026-07-30, but preview is not general availability, merge-queue
  and auto-merge parity is still rolling out, and identity-preserving merge-method selection can be overridden at
  runtime. This contract stays separate from the review-source capability registry.
- **Final-integration window:** integration-target deliverable PRs should remain outside the exclusive WU → `main`
  window; stack-to-`main` may consume the provider's own ordered / atomic merge facility. Confirm both against
  `integration-lane`.
- **Class:** confirmed `Heavy`, with `high` draft depth. The direction is composed from existing ARC and industry
  primitives, while the scale and cross-substrate contract work remain substantial.
- **Relationship:** `Depends On: review-chunking`; its boundary doctrine and `chunk` vocabulary are shipped inputs.

## Dependency Assessment

- **Satisfied formal edge:** `review-chunking` is shipped, and the edge has been discharged — the current
  monolithic meta records no remaining dependency.
- **Hard for review integration:** `review-request-contracts` must expose both public derivation seams before
  delivery's review / terminal-assurance consumer lands: the exact-target `ReviewCoverageBinding` carried into the
  requirement / guidance identity, and the review-owned routed-exemption / per-requirement qualification projection.
  Its current planned ordering is transitively `review-signal-convergence` → `review-source-authority` →
  `review-activity-contracts` → `review-request-contracts`. That chain blocks only the review-integration slice; it
  does not block the canonical plan, delivery state, or topology reducers.
- **Projection-dependent for session resolution:** the core accepts an explicit owning-WU / state pointer, which
  carries the integration-target projection. For stack-to-`main` the same edge is load-bearing rather than
  convenience — see § Delivery sequencing — so a member delivering that projection sequences after
  `session-locus-model` unless the cohort cut instead admits a minimal durable position record. No parallel locus
  record is built here.
- **Coordination, not dependency:** `integration-boundary-accuracy` may rename or move integration verbs;
  `integration-lane` may later serialize the final window; `decomposition-doctrine` owns the concern-level
  decomposition test; and `chunk-scope-binding` owns partial multi-scope evidence inside one target. The landing
  intent composes with the first work unit's checkpoint / exact-head merge boundary, while whole-target seam
  dimensions do not require the last work unit's scoped receipt algebra. None supplies a semantic primitive required
  by the core state or projection contracts.
- **Capability, not dependency:** GitHub Stacked PRs may be unavailable or may change. The generic Git / PR adapter is
  complete in its absence.

At the final cohort cut, put these edges only on the consuming members. If the work remains monolithic, promote
`review-request-contracts` and `session-locus-model` to formal `Depends On` entries before activation rather than
blocking unrelated design work during this stage.

## Coordination

- **`review-chunking`** — the sibling this was cut into; owns the chunk-boundary cohesion doctrine, the review
  unit's name, and the review-only retrofit. Keep chunking and merge topology decoupled across the seam; consume the
  doctrine, never re-author it.
- **`decomposition-doctrine`** — its stated scope includes codifying "the stack-vs-coupling test", and the
  stack-eligibility test above uses the same green-and-consistent vocabulary. Ownership is now explicit and
  non-overlapping: that work unit governs whether a _concern_ decomposes into work units; this delivery contract
  governs whether a chosen _chunk_ may land independently and stores the authored invariant. Coordinate terminology,
  not authority or records.
- **`session-locus-model`** — automatic materialized-session resolution consumes its opaque subject-pointer locus
  record; explicit delivery commands remain usable without it. Both edit `strategy-work-organization` and its
  `routingLane` / reviewed-lane vocabulary says a work unit's PR is "classified by strictest lane, never splits into
  per-lane PRs", which must be reconciled with chunk-splitting (chunk ⊥ lane).
- **`integration-boundary-accuracy` / `integration-lane`** — the first owns integration verb naming / fire-point
  placement and the second may own repository-wide final-window serialization. Delivery owns admissibility for one
  plan. Sequence shared workflow edits, but neither surface enters `DeliveryState`.
- **`review-architecture`** — shipped 2026-07-21. Its integration reshape, Review-Increment Invariant, and
  review-obligation contract are the baseline this layers on (sequential layering, not a concurrent collision).
- **`review-request-contracts`** — the applicable `review-protocol-alignment` cohort member. Sequence its P1 public
  derivation work before implementing this work unit's review/cardinality integration. It owns the review-side
  exact-target coverage binding and routed-exemption / per-requirement qualification projection needed here; inbound
  captures record the contract. Delivery supplies caller-held plan / Git facts, consumes those projections, and does
  not freeze the current singleton chain into `DeliveryPlan` or `DeliveryState`.
- **`review-source-authority` / `review-signal-convergence` / `review-activity-contracts`** — sibling cohort inputs,
  not owners of the qualification seam. Consume provider-owned capabilities, source-bound convergence records, and
  exact-target applicability judgment without importing provider or review-activity mechanics into delivery.
- **`chunk-scope-binding`** — owns scope-aware receipt / reduction binding for partial reviews inside one exact
  target and explicitly excludes cumulative multi-PR target algebra. Coordinate its scope identity with
  `ReviewCoverageBinding`, but keep this work unit authoritative for cross-PR membership and use whole-target
  additive seam dimensions in v1.
- **`review-adapter-extensibility`** — concerns project-supplied review sources and their evidence trust boundary.
  Delivery-host adapters are a separate contract and must never gain review attestation authority by association.
- **`unit-scoped-review` / `review-durability-hardening`** — orthogonal boundaries: the first widens human
  task-interlock cadence without collapsing integration authorization; the second owns durable findings-driven fix
  carry. Neither is a prerequisite for provider-induced rewrite applicability or multi-PR delivery.
- **`composable-workflows` / `strategy-procedure-evolution`** — the typed contract, private-fragment, CLI-verbs,
  precomposed-text, and no-prose-control-flow constraints are design inputs. Keep the domain record independent of
  the still-evolving agenda step schema.
- **`strategy-storage-evolution` / `arc-backend`** — delivery records are storage-agnostic, version-checked, and
  branch-independent; Markdown and refs are materializations. The deferred cover-letter composition also reads
  artifacts the storage target moves. The lifecycle-artifact exclusion in § Delivery sequencing is phrased over
  owned records rather than tracked paths for this reason, and it routes one question outward: the **scope** of the
  materialized active-work projection, which decides whether multiple-candidate session resolution is an anomaly or
  steady state. Delivery states the constraint and consumes the answer; it must not settle it here.
- **`strategy-pm-composition-evolution` / `external-pm-composition`** — delivery topology stays ARC's agent-native
  authority. Preserve provider-neutral lifecycle events and explicit per-fact authority without implementing a
  generic external-PM synchronization model here.
- **`assess-cohort-fit` has multiple pending editors** — sequence the method edits at each work unit's grooming
  close so one surface doesn't churn several ways. This work unit's edit is the delivery-framing coherency pass.

## Scope Estimate

**Large** (week+), likely cohort-worthy once the cut is stable. Spans the schema-kernel-backed delivery records,
task-generation authoring and projection, session-locus resolution, two delivery projections, delivery-host
adapters, review cardinality, terminal assurance, integration ceremony, and methodology coherence across both
maintained ARC copies. The elaborate assurance-group coalescing algebra and cover-letter composition remain out of
the initial contract, which bounds the shared core without dropping either first-class topology.
