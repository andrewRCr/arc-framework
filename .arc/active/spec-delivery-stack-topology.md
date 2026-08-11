# Spec (`detailed` · `RFC`): delivery-stack-topology

- **Origin:** [internal]

- **Purpose:** Execute a human-authored delivery stack to the protected base — validated member eligibility, ordered
  ref and pull-request materialization, guarded one-at-a-time landing, suffix reconciliation, and lifecycle-artifact
  exclusion — with the landing core built projection-neutral, member review admitted through the shipped
  delivery-member vehicle, and the routine work-unit lifecycle reaching delivery through owned attachment points.

---

## Introduction / Context

ARC couples a work unit's concern boundary to one review and merge boundary. A correctly-scoped cross-cutting
concern can still produce a change set too large for one effective review or merge. Two recorded field deliveries
(`decompose-transform-integrity`, seven members; `session-locus-model`, a rolling corrective sequence) landed as
manual stacks to the protected base and established what ARC usefully adds: durable member identity and order,
exact ref handling, lifecycle-artifact exclusion, reverse lookup, and interruption-safe resumability. Ordinary Git
and host operations already perform the delivery itself.

The cohort substrate has shipped. `delivery-plan-record` supplies the immutable `DeliveryPlanV1` (ordered members,
seams, the `stack-to-main` projection discriminant), binding and amendment classification, one version-checked
`DeliveryStateV1` with exact ref/change-request bindings and a single active-operation reservation, reverse
lookup, and the guarded-operation contract (`reserve → reobserve → mutate → reobserve → reconcile → clear`) with
operation kinds `materialize | publish | rewrite | land | teardown`. `delivery-slice-review-vehicle` admits a
non-final member into the exact-head review lifecycle as a typed `delivery-member` vehicle, authenticated by
delivery-state reverse lookup, and routes one named constraint back to this work unit (§ 5).

This work unit is the v1 executable projection: it owns stack eligibility, materialization, guarded sequential
landing, suffix reconciliation, lifecycle-artifact exclusion, and the routine-lifecycle attachment points — entry
(planned and discovered), resume, and closeout — plus the shared boundary checkpoint they ride. It invokes the
shipped state constructor and guards; it re-models none of them. `cohort-chunked-delivery.md` owns the shared v1
robustness floor, non-goals, and hardening-admission boundary, all of which apply here unchanged.

## Goals

- Validate before external binding that every planned member can leave the protected base green and semantically
  coherent, using disposable candidate heads — never generated compatibility caps.
- Materialize an ordered member-ref and pull-request chain without treating provider stack metadata or branch
  names as authority.
- Land exactly one member at a time through the existing review, merge-lock, and integration-authorization
  machinery, each at its exact head.
- Reconcile the remaining suffix after each landing — including a host's recognized retarget under opt-in native
  stack linking — without rewriting the owning work unit's control branch.
- Keep the owning work unit's active lifecycle artifacts out of every non-final member, and preserve ordinary
  session resolution for unrelated work while a stack is partially landed.
- Resume from `DeliveryState` and the retained control locus after interruption, surfacing delivery position at
  session-init as one precomposed orientation line.
- Reach delivery from the routine lifecycle through advisory attachment points — the re-chartered boundary
  checkpoint, the operator-invoked discovered door, and the integration-time attention advisory — that never gate.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This member does not add:

- automatic stack discovery, boundary derivation, compatibility-cap generation, or semantic landability inference;
- dependence on provider-native stack capability — opt-in linking of the materialized chain is in scope (§ 9),
  while native webhook, atomic-prefix, ordered-prefix, merge-queue, and batch-merge support stays out of v1;
- a general delivery-host capability registry or parity across provider previews;
- per-member work-unit identities, session loci, metadata records, or authoring branches;
- review groups, seam receipts, terminal assurance, or receipt projection across rewritten pull requests;
- commit-history preservation across delivery refs when exact tree or contribution comparison suffices;
- autonomous abandoned-stack rollback or cleanup of every possible partial provider outcome;
- topology changes, reactive insertion modes, or live-to-landed plan conversion after binding; or
- mixed topology segments inside one plan revision.

The cohort's hardening-admission boundary (`cohort-chunked-delivery.md`) governs findings against this work: a new
provider capability, recovery state, identity, or proof record must address a demonstrated failure in the
sequential stack lifecycle, and anything crossing the lines above is a scope change accepted only through a design
amendment — never silently promoted into a required fix.

## Proposed Design

### 1. Stack eligibility — human-authored, candidate-validated

The author supplies member boundaries in the delivery plan; eligibility validation proves them landable before
anything binds. **Member content is operator-authored, CLI-validated.** The plan's `taskIds` /
`designElementIds` coverage names each member's intent, but no shipped record maps a member to commits or trees —
that mapping is the operator's cut, made with ordinary Git (cherry-pick or equivalent) from the control branch's
content into a disposable candidate branch per member, each candidate based on its predecessor's (the lowest on
the protected base). A member cut is never a raw cumulative prefix of the control branch, whose history
interleaves lifecycle commits; the operator's cut selects content, and validation proves the selection. The CLI
derives nothing; it validates the authored chain, in plan order:

- each member passes the relevant quality gates at its own candidate head;
- each candidate tree carries none of the owning work unit's active lifecycle records (§ 6);
- the chain composes — the **completeness identity**: the final candidate tree equals the control branch's tree
  minus the excluded lifecycle records, proving the cut dropped and invented nothing; and
- each intermediate tree exposes a semantically coherent supported surface (a judgment the operator attests, not
  a generated inference), with any compatibility cap or temporarily dormant surface authored and understood as
  real stack cost.

An independently green but semantically incomplete member is not stack eligible. When the concern cannot leave the
protected base coherent in increments, the remedy is the integration-target projection — never mixed topology and
never splitting the concern into sibling work units merely to obtain incremental landing.

Candidate construction is disposable by contract: it creates no binding, writes no state, and its refs carry no
authority. The validation result feeds the operator's landability attestation in the plan
(`mainlineLandability: independently-landable`, required for every `stack-to-main` member by the shipped plan
contract); the CLI records and rechecks mechanics, the human owns the coherence judgment.

### 2. Delivery refs — a recognized presentation namespace

Member refs are plan-owned projections, not work-unit branches. Naming is presentation only — identity always
resolves through delivery-state reverse lookup from the exact ref and head — but the namespace is settled here so
every surface that parses branch names can recognize and exclude it:

- **Namespace:** `delivery/{wu-slug}/{chunkKey}` under `refs/heads/` (hosts require branches for pull requests).
  The slug segment is human legibility only; a work-unit rename leaves existing ref names stale and correct,
  because nothing derives identity from them.
- **Exclusions:** the `delivery/` prefix is excluded from work-unit branch parsing (`branchToWorkUnitSlug` and the
  branch-format method's type-prefix set), from the orphan-branch sweep's WU-residue classification, and from the
  pre-commit in-flight-artifact advisory — each recognizes the namespace and resolves ownership through reverse
  lookup instead of surfacing a false "no record" warning.
- **The terminal member has no delivery ref.** Its pull request opens from the retained control branch (§ 5).

Materialization pushes the validated candidate heads (§ 1) as the member refs, walking the plan suffix: the
lowest unlanded member targets the current protected base; each higher member targets its predecessor's ref.
Pushing the first member ref (or opening the first member change request) is
the shipped binding event — the executor observes it and invokes the delivery-state binding constructor with the
validated current plan. Member pull requests open with base = predecessor ref (base = protected base for the
lowest), carry the `delivery-member` vehicle identity for review admission, and open locked when `merge.lock:
draft` is configured, exactly as work-unit pull requests do.

### 3. Guarded landing — one member, one exact head, one authorization

Landing a non-terminal member _k_ runs the shipped guarded-operation contract with `kind: land` (the terminal
member's landing is the integration workflow's own merge, adopted by observation — § 5):

1. **Derive the next landable member** from plan order plus current state — never from provider ordering or
   branch-name inspection. A member lands only when every predecessor is landed.
2. **Reserve** the operation with the expected plan revision, state revision, base coordinates, member head/tree,
   and predecessor relation. A second reservation or a stale state token refuses.
3. **Reobserve** Git, host, checks, review, and merge-lock state immediately before mutation. The member's review
   obligation must be settled at its exact head and its integration authorization obtained — the
   integration-interlock fires per member landing, surfacing the member's exact head, its settled review state,
   and the landing consequence. Approval never reaches a later member. On approval the merge lock releases through
   the existing `delivery-member` readiness path.
4. **Mutate once:** one ordinary host merge of the member's pull request, head-matched to the exact approved head
   (the unlinked arm; § 9 supplies the linked variant). No batch, queue, or prefix merge in v1.
5. **Reobserve and record:** confirm the landed result matches `requested` exactly, then record the landed base
   and current suffix coordinates with a version-checked write and clear the reservation.

A crash leaves the reservation in place; reconciliation reobserves first, adopts an exact already-applied result,
permits retry on exact non-application, and blocks ambiguous movement for explicit remedy — the shipped contract,
invoked not re-modeled.

### 4. Suffix reconciliation — after every landing, before the next

After member _k_ lands, the remaining suffix reconciles before member _k+1_ may land:

- **Retarget:** member _k+1_'s pull request rebases to the protected base (its predecessor is gone). Under an
  unlinked stack the executor performs the retarget as a `rewrite` operation. A host-initiated retarget is a
  **recognized operation result** on either arm — the linked stack's automatic rebase/retarget (§ 9), and the
  host's retargeting of open pull requests when a landed member's branch is deleted through the merge flow
  (delete-on-merge, a configuration the teardown path already anticipates). Each is reobserved and rebound
  through the same reconcile path with the same contribution proof, never refused as ambiguous movement.
- **Contribution proof:** a rewritten member's rebound head must carry the same contribution. Exact tree equality
  is the strong form (a pure retarget of an unchanged member onto the tree it was cut against); where the rewrite
  changes parents, patch-identity over the member range (`git patch-id`-class comparison of
  `predecessor-head..member-head` before and after) establishes equivalence. Anything neither form proves refuses
  for explicit remedy — ambiguity is never adopted.
- **Rebinding:** current refs, heads, trees, and review targets rebind through a version-checked state write.
  Review applicability of the rebound head follows the existing review rules — a rebased member is a new head that
  must be admitted again; delivery copies no verdict forward.
- **Review-driven fixes rematerialize:** fixes land on the retained control branch (member refs are not durable
  authoring surfaces), then the operator re-cuts the affected members from the control branch's content — the
  same authored-cut, CLI-validated discipline as § 1 — and the executor rebinds each as a `rewrite` operation,
  with the contribution rules distinguishing what changed deliberately from what must have carried.
- **Landed cleanup:** a proven-landed member's ref and pull-request residue retire through presence-guarded
  `teardown` operations authorized by the versioned state — never inferred from branch absence or host
  presentation.

### 5. Terminal member — the work unit's own integration, unchanged

The final member is not a delivery-member vehicle. It is the owning work unit's ordinary integration pull request,
opened from the retained control branch once every predecessor has landed and the suffix has reconciled:

- **The routed two-clause constraint holds by construction** (from `spec-delivery-slice-review-vehicle.md`): the
  terminal pull request's head is the retained control branch, and the meta `Branch:` matches it — so the
  work-unit vehicle admits it under either archival cadence.
- **Base absorption precedes the terminal pull request.** After the last non-terminal member lands and its
  suffix reconciliation completes, the protected base — which now contains every landed member — merges
  append-only into the control branch (an ordinary, reversible base merge; Tier 1 gates re-run). This is what
  makes the reuse below true in practice: the merge advances the merge-base past the landed prefix, so the
  terminal pull request's diff presents the residual work-unit tail rather than the whole stack re-presented,
  and the integration workflow's behind-base reconcile gate reads ordinary drift instead of a guaranteed
  substantive self-overlap with the work unit's own landed paths.
- **The attended final tail is `integrate-work-unit.md` Phase 2, unchanged.** Completion composition, archive
  sweep, ROADMAP regeneration, the behind-base reconcile gate, readiness, the integration-interlock, merge, and
  teardown all run exactly as they do for an unstacked work unit. Delivery adds one precondition read at entry:
  the plan's landed prefix covers every non-terminal member, no operation is active, and the base absorption
  above has landed. It adds no second closeout ceremony and no terminal proof record.
- **The terminal member still binds into `DeliveryState`** as the last ordered member — exact ref (the control
  branch) and reverse lookup apply — but its landing is **not a reserved delivery operation**. The integration
  workflow's own guarded merge is the mutation authority (exact-head match, the integration interlock, and its
  no-mutation terminal window — a stronger bracket than a reservation could add, and one no reservation could
  survive: the control branch legitimately moves throughout review iteration, so any pre-taken `before`
  snapshot would be stale by contract at merge time, and a long-lived reservation would monopolize the single
  operation slot the suffix work needs). Delivery instead **adopts the observed result** through the same
  recognized-result reconciliation the crash path uses — a version-checked closeout write recording the landed
  coordinates, minting no reservation and no second authorization.
- **Closeout derivation:** cohort-level closeout readiness derives from the plan, state, Git, host, and review
  authorities — the landed prefix is complete, exact trees or contributions agree, and ordinary work-unit
  verification is the completion record. Verify no unplanned contribution rode the final landing.

### 6. Lifecycle-artifact exclusion — owned records, not a path blocklist

Every non-final member excludes the owning work unit's active lifecycle records — meta, spec, task list, notes,
roadmap projection, and other records supplied by the storage layer. The rule is expressed over **owned records**
resolved through the storage layer, so it becomes vacuous when those records materialize outside the code
repository. Enforcement sites:

- **Eligibility** (§ 1): a candidate member tree containing an owned active lifecycle record fails validation
  with the offending paths named.
- **Materialization and rewrite** (§ 2, § 4): the same check reruns before any member ref push, since suffix
  content changes after validation.

The final member carries the lifecycle tail the existing integration contract requires — that is the ordinary
work-unit ship, not a delivery exemption. Delivery adds no per-member artifact flags, holdback state, or second
archive mechanism. A partially landed stack therefore leaves the protected base free of active lifecycle
artifacts, and unrelated sessions' resolution (session-init roster, sweeps, status) is unperturbed.

### 7. Lifecycle attachment — advisory checkpoints, owned doors

Delivery is reachable from the routine lifecycle through owned attachment points. No attachment invents a new
ceremony; every planning-time signal is advisory — the system facilitates the split-vs-stack decision, then
respects it. All attachment surfaces are built as typed probe slots, dispatch lines, and precomposed text — the
shapes `draft-composable-workflows.md`'s contract and agenda model consume.

**The re-chartered boundary checkpoint.** `assess-cohort-fit` re-charters as **`assess-boundary-fit`** — one
orthogonality-plus-sizing read returning three first-class outcomes:

1. **stays one WU** — the default; borderline silence.
2. **cut-map** — orthogonal concerns; routes to `decompose-work-unit` (decomposition doctrine owns that arm's
   discriminator content).
3. **stays one WU + delivery-plan candidate** — cohesive concern, separable delivery surfaces; the existing
   dead-end delivery advisory promoted to a consumed outcome that seeds slice-aware authoring.

No new pass is added anywhere — the sizing read already counts deliverable multiplicity. Fire-points:

- **`draft-design` / `create-spec`** — the method's existing fire-points, unchanged cadence. A delivery-candidate
  outcome means the draft/spec is authored slice-aware.
- **`generate-tasks` Pass 1** — a new fire-point against the first concrete scale evidence (the task skeleton),
  dispatching three ways: a derivation gap fires the existing re-entry valve upstream; revealed orthogonal
  concerns route to lateral decomposition from the latest completed planning authority; a cohesive-but-large
  surface authors the delivery plan here, from the task decomposition. This corrects the current method note
  claiming the depth valve covers task-generation discovery — the valve routes scale and derivation, and concern
  multiplicity is a third axis it does not own.
- **Implementation onward** — operator-invoked entry only (the discovered door); eligibility validates at entry.
  Decomposition closes at implementation start; stacked delivery stays viable until the final member lands. Later
  entry is legal and honestly costlier — the entry surface says so.
- **Integration** — the metric-keyed advisory floor (§ 8).

**Advisory posture.** The method speaks only when its primary signal fires; borderline silence is the default. A
decided outcome is sticky — "considered, holding whole" is recorded in the draft/spec decision structure, and
later checkpoints re-raise only on a new-evidence delta, never on mere re-invocation. One voice: a bound delivery
plan or a recorded hold-whole decision suppresses redundant downstream advisories.

**Rename mechanics** (verified against the current recipe — all affected files carry dispositions):

- method file `assess-cohort-fit.md → assess-boundary-fit.md`, frontmatter `name:`, and the `init-recipe.json`
  path entry — package source and `.arc/` instance both;
- declarations, fire-point prose, and link definitions in `draft-design.md` and `create-spec.md` (both copies);
- the new declaration and Pass-1 fire-point in `generate-tasks.md` — whose package source is
  `generate-tasks.template.md`, so the edit lands in the template counterpart;
- the methods README pairing table and any strategy references (`strategy-work-organization.md`);
- the runtime file-classification registry (`CONFIGURABLE_FILES` in `classification.ts`), whose entry keeps the
  method in the Configurable set init/update preserve — omitted, the renamed file silently reclassifies as
  managed and update would clobber adopter overrides; and
- test files that hard-code the old path (rename fallout, resolved mechanically at implementation).

Pre-release posture: rename in place, no alias, no migration reader.

**Resume.** Session-init gains one probe slot over bound `DeliveryState`: delivery position (member _k_ of _n_
landed, active operation pending or none) as one precomposed orientation line, following the existing envelope
pattern (typed slot, `ok`/`value`, precomposed text; degraded independently on failure). Mid-delivery handoff
resumes the owning work unit at its control locus — no per-member session loci.

**Self-application.** This work unit's own `generate-tasks` pass authors a provisional delivery plan alongside its
task list — the first consumer of the eligibility discipline it ships.

### 8. Attention register — one size signal, two remedies

The shipped chunking tripwires rename to attention-register keys consumed by both concerns:

- `review.chunking_threshold_lines` → **`attention.register_lines`**
- `review.chunking_threshold_files` → **`attention.register_files`**

Semantics are unchanged: attention-selection tripwires that recommend considering a remedy, never draw boundaries
or gate. The integration-time advisory reads them at candidate entry and offers one of two remedies — chunked
review, or stacked delivery — with delivery-aware wording when a plan is bound. Chunked review is built into
stacked delivery (`deliverable ⊂ chunk`), so the advisory never recommends both. The advisory text is precomposed
CLI-side (the `recommended*Text` pattern), and its suppression splits by layer:

- **Typed suppression (CLI-evaluated)** — the precomposed advisory is silent when a delivery plan is bound for
  the work unit (delivery-aware wording replaces the offer), when chunked review was already selected for the
  current target (operation state), or when the tripwires are disabled (`0`, the shipped default).
- **Judgment suppression (workflow-owned)** — a "considered, holding whole" decision recorded in the spec/draft
  decision structure is honored by the planning checkpoints and the operating workflow, which stay silent absent
  a new-evidence delta. It is a prose record read by the agent, deliberately not a CLI input — the CLI evaluates
  only typed state.

**Rename surface** (rename in place, pre-release, no alias): config schema, validation allowlist, the
review-chunking policy reader, the update-command template handling, `arc-config.yml`, and
`strategy-configurability-architecture.md` — package source and `.arc/` instance both. The `review-chunking`
method's tripwire prose updates to the new names; its boundary contract is untouched.

### 9. Host-native stack composition — opt-in, observed-never-authoritative

The chain topology (each member targets its predecessor) is the same derivation model GitHub's native stacked
pull requests read (public preview, 2026-07-30), so an ARC-materialized chain can register as a native stack
through one linking call. Composition is opt-in and never load-bearing. The opt-in is the operator's link
invocation at materialization — no plan or state field records it, so both shipped record schemas are untouched.
Each landing derives its arm from fresh host observation: a stack-registered pull request lands through the
asynchronous stack-merge API (the legacy synchronous endpoints refuse stack members), an unregistered one through
the ordinary merge. A recorded preference would be a second copy of a fact the host owns, able to disagree with
the endpoint that enforces it:

- **No dependence.** The unlinked path (§ 3–§ 4) is the complete v1 projection on its own. Linking buys the
  host's stack map, per-layer review surfaces, and transitive protection gating — presentation and review
  ergonomics.
- **Linking registers, never authors.** ARC materializes every ref; the link call registers the existing chain as
  an externally-managed stack. Provider stack metadata remains non-authoritative — the next landable member
  always derives from plan order plus state (§ 3).
- **Linked landing arm.** A linked landing merges the bottom member through the host's asynchronous stack-merge
  API — still one member, one exact head, one integration authorization, head-matched. The asynchronous
  completion is reobserved like any mutation result.
- **Recognized retarget.** The host's automatic rebase/retarget of the next member after a linked landing is a
  recognized operation result, reconciled through § 4's normal path with the same contribution proof.
- **Merge-strategy constraint.** Native stack identity tracking survives merge commits and breaks under squash
  and rebase merges; the linked arm therefore requires the merge-commit strategy, and a plan configured otherwise
  composes unlinked.
- **Degrade path.** Preview volatility is absorbed structurally: on any host regression, refusal, or capability
  absence, the executor unlinks the chain (or confirms the host already has), after which observation yields the
  unlinked arm for the remainder of the stack; the downgrade is surfaced, never silent. Exact API shapes (link
  registration, async merge, status reads) verify at implementation against the live surface — the design binds
  the arm's behavior, not preview endpoint signatures. Auto-merge is unsupported for native stacks, which is
  moot here: every landing is attended by design.
- Cross-fork stacks are unsupported by the host and out of scope: delivery refs are same-repository projections.

### 10. Authority boundaries and command surface

- Plan and state authority, Git/host authority, review authority, and work-unit lifecycle authority hold exactly
  as `cohort-chunked-delivery.md` § Shared contracts records them. Delivery stores bindings to current review
  targets only where execution needs them and never copies verdicts.
- Deterministic comparison, derivation, dispatch, and remedy selection live in typed CLI verbs; workflow prose
  invokes those verbs, renders their precomposed text, and preserves the human interlocks.
- **Command surface:** one `arc delivery` group mapping onto the shipped operation kinds — eligibility validation
  (§ 1), materialization and binding (`materialize`/`publish`), landing (`land`), suffix reconciliation
  (`rewrite`), landed-ref cleanup (`teardown`), the opt-in link call (§ 9), and a position read feeding the
  session-init slot (§ 7). Exact verb names and argv shapes are implementation detail; the boundary that is
  design is that every coordinate-bearing external mutation the executor performs against bound state —
  anything moving a ref, head, tree, or change-request binding — runs inside a reserved operation, and every
  judgment stop is a workflow interlock, not a CLI prompt. Three named carve-outs, each with its own guard:
  the pre-binding materialization pushes (no state yet exists to hold a reservation; candidate refs carry no
  authority, and the binding constructor adopts the first observed event — the shipped contract's own design);
  the § 9 link/unlink registration calls (presentation-only, no coordinate moved, re-observed fresh,
  self-healing); and the terminal member's merge (owned and guarded by the integration workflow, adopted by
  observation — § 5).
- **Workflow prose:** the delivery execution steps (member review admission via the vehicle, landing
  authorization, reconciliation dispatch) live in this work unit's workflow surface — the member-review callsite
  `delivery-slice-review-vehicle` deliberately left to its consumer — composed as dispatch lines over typed verb
  results, compatible with the composable-workflows shapes.

## Alternatives & Rationale

### Per-member work-unit identities

Making each member a work unit (or Errand) gives every landing an existing lifecycle for free — and multiplies
metas, session loci, branches, and onboarding cost while splitting a concern the cohort decided is one design.
Rejected by the cohort boundary; the vehicle work unit exists precisely so members admit to review without forged
identity.

### Depend on host-native stacks

Deriving order, next-landable, or retarget behavior from the provider's stack object inverts authority — a
preview-stage presentation surface would become correctness-load-bearing, and the unlinked/other-host path would
be a second implementation. The chain is authored locally; native capability composes as presentation (§ 9).

### Rebase the control branch per landing

Rebasing the retained control branch onto each newly-landed member keeps its diff small but rewrites a pushed
branch — orphaning SHA-keyed notes and breaking the append-only invariant `DEV-RULES.ARC` § Commit Discipline
marks invariant. The control branch merges the base in append-only; member refs, which are disposable
projections, absorb the rewrites.

### Automatic boundary or eligibility inference

The field runs cut along semantic structure a general tool cannot establish safely; a generated "eligible" verdict
would be a coherence attestation no check witnessed. Authoring and coherence stay human; the CLI validates
mechanics (gates, closure, exclusion, exactness).

### A delivery-owned closeout ceremony

A second terminal ceremony (delivery verification, terminal proof, stack archive) would duplicate
`integrate-work-unit.md` Phase 2 and mint the evidentiary chain the cohort explicitly rejects. The terminal member
rides the existing integration workflow unchanged (§ 5); delivery contributes one precondition read.

## Cross-cutting Considerations

- **Storage evolution.** All delivery reads and writes go through the shipped plan/state store interfaces;
  records are Git-common-directory state, version-checked, and independent of tracked `.arc/` paths. Member
  refs and delivery position are consequently clone-local, like the state they bind — the supported v1 path is
  one operator at the owning control locus, and a second clone resolves no member (the recorded
  `delivery-slice-review-vehicle` consequence, inherited unchanged). The exclusion rule (§ 6) is expressed over
  owned records so external-storage materialization makes it vacuous rather than wrong.
- **Procedure evolution.** New surfaces are typed verbs plus precomposed text; workflow prose dispatches on typed
  results and owns the interlocks. No agent-interpreted control-flow markup is introduced; attachment surfaces
  are composable-workflows-compatible by construction (§ 7).
- **Security and trust.** No local record becomes merge or review authority: every landing re-reads host, checks,
  review, and lock state at the exact head, and the integration interlock is per member. Refs, heads, trees,
  digests, and revisions are exact values; branch names are never trusted. Provider credentials stay outside
  delivery records.
- **Performance and operability.** One active operation bounds recovery and reconciliation work; per-landing cost
  is a handful of Git/host reads around one merge. Eligibility validation (§ 1) is the expensive pass (gates per
  member) and runs pre-binding, where retry is free.
- **Testing.** Unit tier for derivation, eligibility mechanics, contribution comparison, and rename fallout;
  integration tier for state transitions and guarded-operation flows against temp repositories; E2E for the
  materialize→land→reconcile→terminal lifecycle with the host port substituted. The linked arm's host calls sit
  behind the port, so preview volatility never reaches the test suite.
- **Migration/rollout.** Pre-public-release: both renames (§ 7, § 8) land in place with no aliases; development
  delivery state predating this work unit is cleared or regenerated, per the standing posture.

## Success Criteria

1. Eligibility validation, run over operator-authored candidate heads for a planned stack, passes gates per
   member, verifies the completeness identity, fails a member whose candidate tree carries an owned active
   lifecycle artifact (naming the paths), and binds nothing.
2. Materialization produces the ordered `delivery/{wu-slug}/{chunkKey}` chain (lowest member based on the
   protected base, each higher member on its predecessor), and the first pushed ref or opened change request
   invokes the shipped binding constructor exactly once.
3. Work-unit branch parsing, the orphan-branch sweep, and the in-flight-artifact advisory each recognize the
   `delivery/` namespace and surface no false work-unit or missing-record signal for a live stack.
4. A non-terminal member lands only through the full guarded sequence — reserve, reobserve, per-member integration-interlock
   approval at the exact head, merge-lock release via the `delivery-member` readiness path, one head-matched
   merge, reobserve, version-checked record — and a landing attempt for a member with an unlanded predecessor
   refuses.
5. After a landing, suffix reconciliation retargets the next member, proves contribution by exact tree equality
   or patch-identity, refuses ambiguous movement, and rebinds coordinates with a version-checked write; a
   review-driven fix on the control branch rematerializes the affected suffix rather than editing member refs.
6. A crash mid-operation resumes through the reservation: already-applied adopts, non-applied retries, ambiguous
   blocks — demonstrated per operation kind used by this projection.
7. The terminal pull request opens from the retained control branch with the meta `Branch:` matching (the routed
   two-clause constraint), is refused as a `delivery-member` vehicle, admits under the `work-unit` vehicle, and
   runs `integrate-work-unit.md` Phase 2 unchanged; its entry precondition refuses while any non-terminal member
   is unlanded, an operation is active, or the post-landing base absorption has not landed — and after
   absorption the terminal diff presents only the residual tail.
8. A partially landed stack leaves the protected base green and free of the owning work unit's active lifecycle
   artifacts, and an unrelated session's init/status resolution is unchanged by its existence.
9. Session-init surfaces bound delivery position as one precomposed line from the new probe slot, and the slot
   degrades independently on failure.
10. `assess-boundary-fit` returns the three-outcome read at its three planning fire-points (including the new
    `generate-tasks` Pass 1 site), the rename is complete across method, workflows, README, recipe, the runtime
    classification registry, and both copies, and decided outcomes suppress re-advisories absent a new-evidence
    delta.
11. The attention-register rename is complete across schema, validation, policy reader, update handling, config,
    and strategy surfaces (both copies); the integration advisory offers exactly one remedy with delivery-aware
    wording when a plan is bound and stays silent under every § 8 suppression state.
12. With linking opted in, the chain registers as a native stack, a linked landing completes through the
    asynchronous stack-merge path at the exact approved head, a host retarget reconciles as a recognized result,
    and any host refusal degrades the remainder to the unlinked path with the downgrade surfaced; opting out
    yields byte-identical unlinked behavior.
13. This work unit's own task-generation pass authors a provisional delivery plan for its implementation.
14. All quality gates pass and the work unit is ready for integration.

## Open Questions

No design question is intentionally deferred. Two implementation details are noted as resolve-during-work:

- Exact `arc delivery` verb names and argv shapes (§ 10 fixes the boundary, not the spelling).
- Exact preview API signatures for the linked arm (§ 9 binds behavior and degrade posture; signatures verify
  against the live host surface at implementation).
