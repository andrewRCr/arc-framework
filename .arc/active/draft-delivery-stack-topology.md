# Draft: delivery-stack-topology — guarded ordered delivery to the protected base

- **Cohort:** `chunked-delivery` — `cohort-chunked-delivery.md` owns the shared v1 lifecycle, robustness floor,
  non-goals, and hardening-admission boundary.
- **Purpose:** Execute a human-authored stack to the protected base while preserving exact member order, member-sized
  review and authorization, lifecycle-artifact isolation, and resumability from the owning work-unit control locus.
- **Position:** Depends on `delivery-plan-record` and the external `delivery-slice-review-vehicle`. It reuses the
  shipped state and operation contracts, builds the projection-neutral landing core other projections may later
  reuse, and adds stack-specific eligibility, ref topology, landing, and suffix reconciliation — plus the
  routine-lifecycle attachment points (entry, resume, closeout) and the shared boundary checkpoint they ride
  (§ Lifecycle attachment).

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
2. **Review the next member.** Admit it through the delivery-member vehicle owned by
   `delivery-slice-review-vehicle`, which binds the plan, member, owning work unit, and exact head — the settled
   vehicle contract; the projection retains no second exact-base binding at review admission. Existing review
   routing and clearance remain authoritative; this projection adds no review schema of its own. The terminal
   member follows its named exception (§ Ref and session boundaries).
3. **Reserve and reobserve.** Reserve a single-member landing with the expected plan revision, state version, base,
   member head/tree, and predecessor relation. Reobserve Git, host, checks, and review immediately before mutation.
4. **Authorize and land once.** Every member landing reaches the existing integration interlock for its exact head.
   V1 invokes one ordinary merge; approval never reaches a later member.
5. **Reobserve and reconcile.** Record the exact landed base and current suffix coordinates with a version-checked
   write. If the host rewrites or retargets descendants, rebind their current refs and review targets through existing
   applicability rules before another landing. Proven-landed member refs and worktrees are then retired by
   presence-guarded cleanup authorized by the versioned delivery state — never inferred from branch absence or host
   presentation.
6. **Close out from the control locus.** The final member incorporates the attended lifecycle/archive tail according
   to the normal work-unit closeout contract. Verify that no unplanned contribution rode the final landing, complete
   ordinary work-unit verification, and leave no active lifecycle artifact on the protected base.

The generic sequential path is the whole v1 projection and is complete on its own. Opt-in host-native stack
linking (§ Host-native stack composition) is the only v1 composition with a provider's stack capability; batching
and richer host features remain follow-up scope, never required for correctness or initial completion.

## Ref and session boundaries

- Delivery refs are projections owned by the plan, not work-unit branches or independent lifecycle loci.
- Authoring and review-driven fixes land on the retained work-unit control branch, then rematerialize the affected
  suffix. Member refs are not durable authoring surfaces.
- Reverse lookup from repository plus member ref resolves the owning plan, member, and work unit through shared state.
  Branch naming is only presentation, and review constrains none of it: review consumes plan/member identity and
  exact target data, never the member ref name, so ref presentation settles freely with no phantom review
  dependency.
- Mid-delivery handoff resumes the owning work unit at its control locus and active operation. V1 does not require a
  separate session-locus record per member.
- **Terminal-member exception (named).** The final member is not a delivery-member review vehicle: its pull request
  and lifecycle/archive tail originate from the retained work-unit control branch, never a delivery ref. It still
  binds into `DeliveryState` as the last ordered member — exact ref, reverse lookup, and the single active
  operation all apply — while its review admission follows the ordinary work-unit path. The routed constraint
  (from `spec-delivery-slice-review-vehicle.md`) is two-clause: the terminal pull request's head is the retained
  control branch **and** the owning work unit's meta `Branch:` matches it — under `manual` cadence the work-unit
  vehicle refuses otherwise, stranding the last member.

## Lifecycle-artifact exclusion

Every non-final member excludes the owning work unit's active metadata, spec, task list, notes, roadmap projection, and
other lifecycle records supplied by the storage layer. The rule is expressed over owned records, not a permanent path
blocklist, so it becomes vacuous when those records materialize outside the code repository.

The final attended closeout publishes only the lifecycle result the existing work-unit integration contract requires.
Delivery does not add per-member artifact flags, holdback state, or a second archive mechanism.

## Lifecycle attachment

Delivery is reachable from the routine work-unit lifecycle through owned attachment points. No attachment invents a
new ceremony, and every planning-time signal below is advisory: the system facilitates the split-vs-stack decision,
then respects it. The attachment points are compatible with `draft-composable-workflows.md` by construction — typed
probe slots, dispatch lines, and precomposed text are the shapes its contract and agenda model consume — a
constraint carried forward to the spec.

**Two entry doors.** Delivery intent may be **planned** — anticipated during design — or **discovered** — realized
any time from task generation up to shipping. Decomposition closes at implementation start; stacked delivery stays
viable until the final member lands. Later entry is legal but honestly costlier: seams planned early are cheaper
than seams found late, and the entry surface says so rather than pretending the doors are equivalent.

**Composed checkpoints (shared with decomposition).** The split-vs-stack conversation is one read at each
checkpoint, supplied by the re-chartered `assess-boundary-fit` method (today `assess-cohort-fit`, renamed and
promoted). One orthogonality-plus-sizing read returns three outcomes — stays one WU / cut-map (decompose) / stays
one WU **+ delivery-plan candidate** — promoting the method's existing dead-end delivery advisory into a consumed
first-class outcome. No new pass is added anywhere; the sizing read already counts deliverable multiplicity.

- **`draft-design` / `create-spec`** — the method's existing fire-points, unchanged cadence. A delivery-candidate
  outcome means the draft/spec is authored slice-aware: broad, independently coherent and mergeable slices the
  later member plan adopts.
- **`generate-tasks` Pass 1** — a new fire-point against the first concrete scale evidence (the task skeleton),
  dispatching three ways: a derivation gap routes upstream through the existing re-entry valve; revealed orthogonal
  concerns route to lateral decomposition from the latest completed planning authority (decomposition doctrine owns
  that arm's content); a cohesive-but-large surface authors the delivery plan here, from the task decomposition.
  This fire-point corrects the current method note claiming the depth valve covers task-generation discovery — the
  valve routes only scale and derivation signals, and concern multiplicity is a third axis it does not own.
- **Implementation onward** — operator-invoked entry only (the discovered door); eligibility validates at entry.
- **Integration** — the metric-keyed advisory floor below.

**Advisory posture.** Planning-time boundary signals are judgment reads where reasonable calls differ; they bite
only through evidence and never gate:

- The method speaks only when its primary signal fires (orthogonality, or deliverable multiplicity); borderline
  silence is the default.
- A decided outcome is sticky. "Considered, holding whole" is recorded in the draft/spec decision structure, and
  later checkpoints re-raise only on a new-evidence delta (Pass 1 surfacing an orthogonal cluster the draft never
  weighed), never on mere re-invocation.
- One voice: a bound delivery plan or a recorded hold-whole decision suppresses redundant downstream advisories.

**Resume.** A session-init probe slot over bound `DeliveryState` surfaces delivery position (member k of n, active
operation pending) as one precomposed orientation line, following the existing envelope pattern.

**Verification and closeout.** Per-member landings are already gated by existing review and integration interlocks;
ordinary work-unit verification runs at the terminal member, which opens from the retained control branch and
carries the normal lifecycle/archive tail.

**Integration-time advisory (metric floor).** The shipped chunking tripwires (`review.chunking_threshold_lines`,
`review.chunking_threshold_files`) rename to attention-register names consumed by both concerns — exact names at
spec; pre-release contracts rename in place. One size signal, two remedies: chunked review or stacked delivery,
with delivery-aware wording when a plan is bound and suppression once the operator has decided. Chunked review is
built into stacked delivery (deliverable ⊂ chunk), so the advisory never recommends both.

**Self-application.** This work unit's own `generate-tasks` pass authors a provisional delivery plan alongside its
task list — the first consumer of the eligibility discipline it ships.

## Host-native stack composition (opt-in)

The chain topology (each member targets its predecessor) is the same derivation model GitHub's native stacked pull
requests read, so an ARC-materialized chain can register as a native stack through one linking call where the host
offers it (public preview since 2026-07-30). Composition is opt-in and observed-never-authoritative:

- **No dependence.** Correctness never requires native stack capability; the unlinked path is complete on its own.
- **Linking is presentation and review ergonomics.** Registering the materialized chain buys the host's stack map,
  per-layer review surfaces, and transitive protection gating. The cost is low but real — a recognized-retarget
  reconcile branch, the linked landing arm, a degrade path, and spec-time re-verification — accepted as a named
  amendment (§ Hardening boundary). ARC still authors every ref, and provider stack metadata remains
  non-authoritative.
- **Known-retarget reconciliation.** Under a linked stack, the host's automatic rebase/retarget of the next member
  after a landing is a recognized operation result — reobserved and rebound through the normal reconcile path, not
  ambiguous movement to refuse. Unlinked behavior is unchanged.
- **Landing primitive, linked arm.** A linked landing merges the bottom member through the host's asynchronous
  stack-merge API (ordinary merge when unlinked); still one member, one exact head, one integration authorization.
- **Deferred by proportionality.** Batch prefix merges (one attended authorization naming a prefix of individually
  review-settled members), merge-queue composition, and provider-parity surfaces wait on field evidence per the
  hardening boundary. The plan order and state model support a prefix landing naturally if it earns admission.
- **Preview volatility.** The host feature is preview-stage: exact API semantics re-verify at spec time, and the
  linked arm degrades to the unlinked path on any host regression.

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
- dependence on provider-native stack capability — opt-in linking of the materialized chain is in scope
  (§ Host-native stack composition), while native webhook, atomic-prefix, ordered-prefix, merge-queue, and
  batch-merge support stays out of v1;
- a general delivery-host capability registry or parity across provider previews;
- per-member work-unit identities, session loci, metadata records, or authoring branches;
- review groups, seam receipts, terminal assurance, or receipt projection across rewritten pull requests;
- commit-history preservation across delivery refs when exact tree/contribution comparison suffices;
- autonomous abandoned-stack rollback or cleanup of every possible partial provider outcome; or
- topology changes, reactive insertion modes, or live-to-landed plan conversion after binding.

## Hardening boundary

The cohort's hardening-admission rule applies. A new provider capability, recovery state, identity, or proof record must
address a demonstrated failure in the sequential stack lifecycle. Opt-in host-native linking (§ Host-native stack
composition) is a deliberate v1 scope amendment accepted under that rule — composition with the host's shipped stack
surface, never a dependence on it. Batch operations, merge-queue composition, and provider parity remain follow-up
scope.

## Open implementation details

- Exact naming and namespace of delivery refs.
- The repository operation used to establish exact member contribution after a provider rewrite.
- The attended final-tail composition point shared with current work-unit integration.
- Attention-register names for the renamed size tripwires, and the advisory's exact suppression states.
- `assess-boundary-fit` rename mechanics: recipe disposition (both directions), workflow method declarations, and
  fire-point markers across the three planning workflows.
- Re-verification of host-native stack API semantics at spec time (the feature is preview-stage).
