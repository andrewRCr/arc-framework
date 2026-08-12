# Spec (`detailed` · `RFC`): delivery-stack-topology

- **Origin:** [internal]

- **Purpose:** Execute a human-authored delivery stack to the protected base — validated member eligibility, ordered
  ref and pull-request materialization, guarded exact-head landing, suffix reconciliation, and lifecycle-artifact
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

This work unit is the v1 executable projection: it owns stack eligibility, materialization, a complete guarded
sequential landing path plus the bounded native arm, suffix reconciliation, lifecycle-artifact exclusion, and the
routine-lifecycle attachment points — entry
(planned and discovered), resume, and closeout — plus the shared boundary checkpoint they ride. It invokes the
shipped state constructor and guard sequence. It extends the current active-operation shape in place only where an
external host assigns the resulting change-request handle or merge coordinates: the same one-operation slot and
version-checked state remain the entire recovery authority. `cohort-chunked-delivery.md` owns the shared v1 robustness
floor, non-goals, and hardening-admission boundary, all of which apply here unchanged.

## Goals

- Validate before external binding that every planned member can leave the protected base green and semantically
  coherent, using disposable candidate heads — never generated compatibility caps.
- Materialize an ordered member-ref and pull-request chain without treating provider stack metadata or branch
  names as authority.
- Land one non-terminal member at a time through the complete provider-independent path, with an opt-in native arm
  allowed to land the exact complete remaining non-terminal set atomically only after every included head satisfies
  the same review, merge-lock, and integration-authorization requirements.
- Reconcile the remaining suffix after each landing — including a host's recognized retarget under opt-in native
  stack linking — without rewriting the owning work unit's control branch.
- Keep the owning work unit's active lifecycle contribution out of every disposable candidate, and preserve
  ordinary session resolution for unrelated work while a stack is partially landed.
- Resume from `DeliveryState` and the retained control locus after interruption, surfacing delivery position at
  session-init as one precomposed orientation line.
- Reach delivery from the routine lifecycle through advisory attachment points — the re-chartered boundary
  checkpoint, the operator-invoked discovered door, and the integration-time attention advisory — that never gate.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This member does not add:

- automatic stack discovery, boundary derivation, compatibility-cap generation, or semantic landability inference;
- dependence on provider-native stack capability — opt-in linking and one exact all-remaining direct atomic landing
  are in scope (§ 9), while native webhooks, arbitrary or partial ordered-prefix landing, merge queues, and
  provider-general batch support stay out of v1;
- a general delivery-host capability registry or parity across provider previews;
- per-member work-unit identities, session loci, metadata records, or authoring branches;
- review groups, seam receipts, terminal assurance, or receipt projection across rewritten pull requests;
- commit-history preservation across delivery refs when exact tree or contribution comparison suffices;
- autonomous abandoned-stack rollback or cleanup of every possible partial provider outcome;
- topology changes, reactive insertion modes, or live-to-landed plan conversion after binding;
- mixed topology segments inside one plan revision; or
- new stores, new configuration axes beyond the two renamed changeset advisory-threshold keys, CLI verbs beyond § 10
  responsibilities, or behavior changes riding either rename beyond its mechanical requirement (the re-charter's
  third outcome and new fire-point; the register keys' new names).

The cohort's hardening-admission boundary (`cohort-chunked-delivery.md`) governs findings against this work: a new
provider capability, recovery state, identity, or proof record must address a demonstrated failure in the supported
stack lifecycle, and anything crossing the lines above is a scope change accepted only through a design
amendment — never silently promoted into a required fix.

## Proposed Design

### 1. Stack eligibility — human-authored, candidate-validated

The author supplies member boundaries in the delivery plan; eligibility validation proves them landable before
delivery state or an external projection binds. **Member content is operator-authored, mechanically validated.**
The plan's `taskIds` /
`designElementIds` coverage names each member's intent, but no shipped record maps a member to commits or trees —
that mapping is the operator's cut, made with ordinary Git (cherry-pick or equivalent) from the control branch's
content into a disposable candidate branch per member, each candidate based on its predecessor's (the lowest on
the protected base). A member cut is never a raw cumulative prefix of the control branch, whose history
interleaves lifecycle commits; the operator's cut selects content, and validation proves the selection. The
eligibility procedure derives no cut. It validates the authored chain in plan order:

- the existing `quality-gate-commands` method runs the relevant project gates in each candidate checkout at its
  exact head — workflow-executed, owning the red-or-unavailable-gate stop, while the eligibility verb validates
  mechanics only and never receives a gate result; delivery adds no command resolver, gate registry, or copied
  gate verdict;
- each candidate preserves the protected-base tree state at every repository path through which the owning work
  unit's lifecycle can contribute (§ 6);
- the chain composes — the **completeness identity**: the final candidate tree equals the control branch tree after
  every lifecycle-contribution path is reset to its protected-base state, proving the cut dropped and invented
  nothing; and
- each intermediate tree exposes a semantically coherent supported surface (a judgment the operator attests, not
  a generated inference), with any compatibility cap or temporarily dormant surface authored and understood as
  real stack cost.

An independently green but semantically incomplete member is not stack eligible. When the concern cannot leave the
protected base coherent in increments, the remedy is the integration-target projection — never mixed topology and
never splitting the concern into sibling work units merely to obtain incremental landing.

The plan's `mainlineLandability: independently-landable` value is the operator's prospective semantic-coherence
attestation, authored before candidate validation and required for every `stack-to-main` member by the shipped plan
contract. Eligibility requires that attestation and validates mechanics afterward; it never rewrites the plan or
stores a second verdict.

One eligibility run pins the current plan revision/digest, protected-base and control ref/head/tree coordinates, and
one explicit candidate ref/head/tree mapping per `deliverableId`. Git proves the lowest candidate descends from the
protected-base head and every successor descends from its predecessor's exact head; branch-name segments grant no
identity. Every non-terminal candidate contributes a non-empty delta from its predecessor and has a distinct head;
before binding, each head is checked against global delivery-state reverse lookup so an existing binding refuses
unless it is the exact same plan/member retry. The procedure verifies each candidate remains at its pinned head before
and after the normal gate run, refuses tracked/index dirt that would make the gate result describe bytes outside that
head, and reobserves every source ref plus the plan before returning success. Candidate construction and validation
are disposable by contract: they create no binding, write no plan or state, and their refs carry no authority. A
standalone result is not a persisted authorization token; materialization re-enters the complete eligibility procedure
and publishes only the exact candidate object IDs it just validated. After interruption, eligibility reruns.

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

Materialization re-runs the complete eligibility procedure and pushes only the exact heads it just validated. It
walks the plan suffix: the lowest unlanded member targets the current protected base; each higher member targets its
predecessor's ref. The first ref publication is the narrow prebinding carve-out. It uses an exact remote-ref lease:
create when absent, adopt an exact-head retry, and refuse any different existing head. The executor immediately
reobserves that event and invokes the shipped delivery-state constructor. Recovery may instead first observe an
already-open first change request and bind from that event; the two entry arms establish the same plan/member identity
without pretending their initially known ref, coordinates, and change-request fields are identical.

Once state exists, binding the protected target, publishing every remaining ref, and opening or adopting every member
change request run through `materialize` or `publish` reservations. Each remote ref keeps the same absent-create,
exact-retry-adopt, mismatch-refuse lease. Change requests open with base = predecessor ref (base = protected base for
the lowest), are uniquely reobserved by repository/head/base, and preserve the configured draft/merge-lock posture.
The later review call binds the exact request/head to the `delivery-member` vehicle; the pull request itself does not
carry a second vehicle identity.

### 3. Guarded landing — one exact authorized effect

The single active-operation contract distinguishes deterministic coordinate requests from host-assigned results.
Its member snapshots include the nullable change-request binding alongside ref and coordinates so `publish` can bind
and `teardown` can clear that handle through the same atomic state application. `materialize`, `rewrite`, and
`teardown` reserve exact `before` and `requested` snapshots. `publish` and `land` reserve the exact admissible inputs
and intended effect — repository, request/base/head identity, plan/state revision, and allowed mutation — because a
host assigns the request handle or resulting merge coordinates. Acceptance still
requires one fresh, unique observation matching that effect and records the actual handle/coordinates before clear.
Absent, multiple, queued, cross-repository, partial, or otherwise ambiguous results retain the reservation and refuse.
This is an in-place pre-release change to the existing operation schema and guards, not a new state machine, store,
ledger, or compatibility reader.

Ordinary landing of a non-terminal member _k_ uses `kind: land` in two attended stages. The opt-in native arm may
substitute one exact all-remaining non-terminal effect under § 9; the terminal member's landing remains the integration
workflow's own merge, adopted by observation (§ 5):

1. **Prepare:** derive the next landable member from plan order plus fresh state and host facts, never provider order
   or branch names. Require all predecessors landed, uniquely resolve its open change request, run the existing
   `delivery-member` readiness path unconditionally, and reserve the exact admissible landing effect. The § 9 atomic
   arm instead derives the complete remaining non-terminal set and repeats those requirements independently for
   every included member/head before reserving one effect over the exact ordered set. Merge-lock configuration is an
   additional transition, never a substitute for readiness. Return a typed interlock presentation naming every
   affected member and exact head, settled review state, configured merge strategy, and consequence; prepare performs
   no merge.
2. **Authorize:** the workflow fires one integration interlock over that presentation. Approval applies only to the
   named exact member/head set and is never written to delivery state.
3. **Apply:** after approval, freshly reobserve Git, host, checks, review, target, predecessor, and operation
   preconditions; release the configured merge lock; then perform one ordinary host merge head-matched to the exact
   approved head using the configured `merge`, `rebase`, or `squash` strategy (the unlinked arm; § 9 supplies the
   linked variants). Queue, arbitrary/partial prefix, cross-repository, and terminal merges are refused.
4. **Record:** uniquely reobserve the actual protected-base result, require it to match the reserved admissible
   effect, version-record every affected member's landed coordinates plus the current suffix, and clear the
   reservation. The § 9 atomic arm accepts only all-applied or none-applied; partial application blocks.

A crash leaves the reservation in place. Reconciliation observes first, adopts one uniquely matching applied effect,
returns exact non-application as retryable, and blocks ambiguous movement for explicit remedy. Retrying an attended
`land` returns to prepare and fires a new interlock; no prior approval survives interruption or non-application.

### 4. Suffix reconciliation — after every landing, before the next

After member _k_ lands, the remaining suffix reconciles before member _k+1_ may land:

- **Retarget:** member _k+1_'s pull request rebases to the protected base (its predecessor is gone). Under an
  unlinked stack the executor performs the retarget as a deterministic exact `rewrite` operation. A host-initiated
  retarget is recognized from coordinates, never trusted provider provenance: exactly the current first-unlanded
  member may move; its stored predecessor is the freshly landed prefix member; its unique observed request/ref base
  is the protected target; its contribution is equivalent; every other member/target coordinate remains exact; and
  no operation is active. Delete-on-merge and native retarget are scenarios satisfying this same predicate, not
  authority labels. After proving the observed movement, the executor persists an exact post-observation `rewrite`
  reservation (`before` = recorded state, `requested` = observed snapshot), reobserves, and uses ordinary exact
  reconciliation. Any movement in that window blocks. General position derivation remains strict; only this
  reconciliation-specific read tolerates the one candidate movement.
- **Contribution proof:** compare four immutable endpoints — before predecessor/member and after
  predecessor/member heads and trees. Equality of the complete before/after member trees accepts without patch
  acquisition. Otherwise an injected Git fact reader emits one canonical aggregate, whitespace-preserving patch
  identity for each predecessor-exclusive/member-inclusive contribution. It pins the byte protocol, handles binary,
  rename, and mode changes, and refuses unavailable, malformed, or non-linear evidence; the pure comparator requires
  identical aggregate identities. Commit reorder or squash is immaterial when the aggregate contribution is exact.
  Anything neither form proves refuses for explicit remedy — ambiguity is never adopted.
- **Rebinding:** the member ref, `coordinates.base/head/tree`, and existing change-request handle rebind through one
  accepted-state CAS write that also clears `activeOperation`; the request's current target remains fresh host
  observation rather than a new persisted field. A CAS failure leaves the persisted reservation unchanged. Review
  applicability of the rebound head follows the existing review rules — a rebased member is a new head that must be
  admitted again; delivery copies no verdict forward.
- **Review-driven fixes rematerialize:** fixes land on the retained control branch (member refs are not durable
  authoring surfaces), then the operator supplies a complete freshly validated unlanded suffix under § 1.
  Contributions may change only for explicitly selected unlanded members; every other suffix member must prove
  carried contribution, and the landed prefix is immutable. A semantic repartition or coverage move routes through
  the shipped plan amendment classifier before re-cut rather than masquerading as rewrite.
- **Landed cleanup:** fresh plan/state/host facts select a proven-landed member. Its deterministic `teardown`
  operation compare-and-deletes the exact delivery ref or adopts exact absence, observes the uniquely bound request
  as merged/closed without mutating it, then atomically clears the ref, request handle, and obsolete coordinates.
  A wrong-head ref, open/mismatched request, or unavailable proof blocks; ref absence plus unavailable request proof
  retains the reservation for recovery. Landed status is derived from fresh host facts, not a new ledger.

### 5. Terminal member — ordinary integration authority preserved

The final member is not a delivery-member vehicle. In v1 it is the owning work unit's ordinary integration pull
request, opened from the retained control branch once every predecessor has landed and the suffix has reconciled:

- **The routed two-clause constraint holds by construction** (from `spec-delivery-slice-review-vehicle.md`): the
  terminal pull request's head is the retained control branch, and the meta `Branch:` matches it — so the
  work-unit vehicle admits it under either archival cadence.
- **Base absorption precedes the terminal pull request.** A read-only decision returns `absorption-ready`,
  `already-absorbed`, or `blocked` from the complete non-terminal landed prefix, inactive operation slot, reconciled
  suffix, exact retained control ref, and fresh target facts. On `absorption-ready`, the delivery-owned workflow
  invokes the ordinary reversible WU base reconcile: the protected base merges append-only into the unbound control
  branch, then Tier 1 reruns. A second read derives `terminal-ready` only after the exact absorption is observed and
  the comparison exposes solely the residual tail. This is ordinary WU base reconciliation, outside delivery
  projection mutation and therefore not a fourth reservation carve-out. Dirty, stale, or conflicting inputs stop
  before mutation or use the ordinary remedy.
- **The attended final tail is ordinary `integrate-work-unit.md` Phase 2.** Completion composition, archive
  sweep, ROADMAP regeneration, the behind-base reconcile gate, readiness, the integration-interlock, merge, and
  teardown all run exactly as they do for an unstacked work unit. Delivery adds one precondition read at entry:
  the plan's landed prefix covers every non-terminal member, no operation is active, and the base absorption
  above has landed. The read lives in delivery's own workflow surface (§ 10) at the handoff into integration.
  In addition to the Phase 1 attention attachments (§ 8), one typed post-merge attachment runs immediately after
  the ordinary workflow confirms the request merged and before `arc user close` or branch teardown. It is total and
  `not-applicable` for ordinary work units; for a delivery terminal it authenticates and records the observed result.
  These narrow attachments add no prose-side comparison, mechanics, markup control flow, second closeout ceremony,
  or terminal proof record; the rest of Phase 2 stays behavior-identical.
- **The terminal member remains unbound during absorption and integration preparation.** Its landing is **not a
  reserved delivery operation**. The integration workflow's own guarded merge is the mutation authority (exact-head
  match, the integration interlock, and its
  no-mutation terminal window — a stronger bracket than a reservation could add, and one no reservation could
  survive: the control branch legitimately moves throughout review iteration, so any pre-taken `before`
  snapshot would be stale by contract at merge time, and a long-lived reservation would monopolize the single
  operation slot the suffix work needs). The post-merge attachment authenticates the final head from the ordinary
  work-unit request's exact observed merged head/result plus retained control-ref identity, rechecks prefix and
  contribution, and **adopts the observed result** in one version-checked write that binds the terminal ref/request
  and landed coordinates. It requires no delivery-owned rebinding while Phase 2 legitimately advances the control
  head, mints no reservation or second authorization, and is idempotent on resume after an already-observed merge.
- **Closeout derivation:** cohort-level closeout readiness derives from the plan, state, Git, host, and review
  authorities — the landed prefix is complete, exact trees or contributions agree, and ordinary work-unit
  verification is the completion record. Verify no unplanned contribution rode the final landing.

The durable contract here is terminal **work-unit integration authority**, not the permanent existence of a terminal
pull request or a repository-hosted lifecycle tail. Under today's in-repo storage, the terminal carries the residual
code and finalized lifecycle contribution that ordinary integration produces. If a future materialized-storage tier
supplies no repository paths and base absorption leaves no code-repository delta, a later executor may adopt the exact
delivery result and run ordinary WU closeout without manufacturing an empty request. The plan/state records require no
migration for that arm: request bindings are nullable and the terminal remains the last ordered member. V1 implements
only the current request-backed vehicle.

### 6. Lifecycle-contribution normalization — storage-resolved, not a path blocklist

Every disposable candidate preserves the protected-base tree state at each repository path through which the owning
work unit's lifecycle can contribute. The storage/projection boundary supplies that repository-path set; delivery
does not encode `.arc/active`, a specific artifact inventory, or `.arc/backlog/ROADMAP.md`. Under today's in-repo
materialization the set includes the current WU's materialized artifact companions (including a tracked
`notes-{slug}.md` when present) and the shared project-readiness projection path. That readiness document is not an
owned WU record: it is a derived shared view whose WU-specific contribution must not ride a member. Exact
protected-base state handles both shapes uniformly — an exclusive WU artifact stays absent when absent on the base,
while the shared readiness view stays present with its base entry identity.

This boundary follows the managed-record direction: canonical operational state becomes storage-agnostic structured
records, and `ROADMAP` / eventual `STATUS.PROJECT` is a derived view over those records. When a record or rendered
view materializes outside the code repository, the boundary supplies no repository path and the rule is vacuous for
it. Delivery never parses a readiness row or treats rendered Markdown as authority.

Enforcement sites:

- **Eligibility** (§ 1): every disposable candidate, including the candidate representing the terminal member,
  must match the protected-base entry state at every supplied path; all mismatching paths are named.
- **Materialization and rewrite** (§ 2, § 4): the same comparison reruns before each non-terminal member-ref push,
  since suffix content can change after validation.
- **Completeness** (§ 1): the control tree is normalized by restoring protected-base state at the same paths before
  exact comparison with the final candidate tree.

The v1 runtime terminal is different from its disposable eligibility candidate: it uses the retained control branch,
has no delivery ref, and under current in-repo storage carries the lifecycle tail the existing integration contract
requires. Delivery adds no per-member artifact flags, holdback state, or second archive mechanism. A partially landed
stack therefore leaves the protected base free of this WU's active lifecycle contribution, and unrelated sessions'
resolution (session-init roster, sweeps, status) is unperturbed.

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
  entry is legal and honestly costlier — the entry surface says so. When an incubating task-generation run left a
  reviewed provisional plan section, this attended entry canonicalizes that intent through the same `from-tasks` and
  compose path before eligibility; it does not infer members, bind state, or mutate an external projection.
  The door is a delivery-owned workflow over one read-only typed entry inspection:
  `not-applicable | authoring-required | canonicalize-provisional | validate-canonical | resume-bound | refused`.
  It precomposes the later-entry cost and next action from authoritative plan/state/task-list facts. Semantic cohesion
  and candidate selection remain the attended boundary judgment; the inspection never derives either from size,
  branch shape, or repository content.
- **Integration** — the metric-keyed advisory floor (§ 8).

**Advisory posture.** The method speaks only when its primary signal fires; borderline silence is the default. A
decided outcome is sticky — "considered, holding whole" is recorded in the draft/spec decision structure, and
later checkpoints re-raise only on a new-evidence delta, never on mere re-invocation. One voice: a bound delivery
plan or a recorded hold-whole decision suppresses redundant downstream advisories. The record stays in the existing
decision prose: it names the selected outcome and evidence basis, and the agent compares later evidence semantically.
It is not a CLI input, fingerprint, schema, or new authority record.

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

Pre-release posture: rename in place, no alias, no migration reader. **Mechanical requirement only:** the
re-charter changes the method's outcome set and fire-point wiring — the third outcome and the Pass-1 site — and
nothing else; no prose improvement, restructure, or behavior change rides the rename through the touched
workflows and copies.

**Resume.** Session-init gains one probe slot over bound `DeliveryState`: delivery position (member _k_ of _n_
landed, active operation pending or none) as one precomposed orientation line, following the existing envelope
pattern. At a resolved owning control-WU locus the slot is present: authoritative absence is `ok` with a null value,
a coherent binding carries structured counts/operation identity plus the line, and malformed, stale, ambiguous, or
unavailable bound evidence fails only that slot. Other loci omit it. The reader finds the WU's canonical plan through
the existing plan-store enumeration, requires at most one current match, and reads state by that plan identity. A
bounded read-only facts adapter reuses the delivery host-observation boundary; it performs no fetch, ref update,
state write, or prompt. Clean state may reuse strict position derivation. An active reservation instead uses a
separate orientation projection over the same kind-aware reconciliation evidence, leaving
`deriveDeliveryPosition`'s `operation-active` readiness refusal unchanged. Mid-delivery handoff resumes the owning
work unit at its control locus — no per-member session loci.

**Self-application.** This work unit's own `generate-tasks` pass authors a provisional delivery plan alongside its
task list — the first consumer of the eligibility discipline it ships. Pass 1 leaves that bootstrap locus unmarked.
When the delivery-candidate outcome remains selected after content fill, grounding, and suite coherence, an active
Planning flow uses the shipped `from-tasks` and composition path to replace it with the canonical projection. For
this bootstrap consumer the sequence inverts pointer-first: the existing finalizer writes the meta task-list
pointer, authoring reads it, and canonical composition plus the post-settle reread precede the single shared
ceremony commit. Once this work unit ships, the repo-relative task-list input lets later consumers read the settled
file before the ceremony writes its meta pointer, with the final workflow interlock following canonical rendering
and the post-settle reread. An incubating work unit still has its invariant meta, but outside the
active Planning locus; it retains the provisional section until an active delivery-authoring entry canonicalizes it.
The design-inventory shape remains owned by its TypeScript schema, registered in the generated kernel bundle and
exposed through a delivery-local schema-description verb rather than copied into workflow prose. Canonical publication
is replaceable prebinding intent: it creates no member ref, change request, or delivery-state binding, and later
eligibility still gates materialization.

### 8. Changeset advisory thresholds — one size signal, two remedies

The shipped chunking thresholds rename around the shared subject and behavior consumed by both concerns:

- `review.chunking_threshold_lines` → **`changeset.advisory_threshold_lines`**
- `review.chunking_threshold_files` → **`changeset.advisory_threshold_files`**

Semantics are unchanged: independent thresholds over exact-target changeset size whose crossing raises an advisory
signal, never draws boundaries or gates. `changeset` names the bounded base/head subject, `advisory` names why the
threshold exists, and `lines` / `files` name the measured dimensions; attention is the derived signal rather than
the configured quantity. The integration-time advisory reads them at candidate entry. An authoritative unbound
result recommends chunked review; a coherent bound plan replaces that choice with delivery-continuation wording.
Chunked review is built into stacked delivery (`deliverable ⊂ chunk`), so the advisory never recommends both.
Starting delivery remains the operator-invoked discovered door rather than an inference from size. The advisory text
is precomposed CLI-side (the `recommended*Text` pattern), and its suppression splits by layer:

- **Typed suppression (CLI-evaluated)** — disabled or below-threshold tripwires and exact-target chunk selection
  are silent. A coherent bound plan suppresses the generic choice and emits one delivery-continuation result. An
  authoritative unbound result emits only the chunked-review remedy. Unavailable, malformed, ambiguous, or
  incoherent delivery evidence is silent with diagnostics; it is never treated as authoritative absence.
- **Judgment suppression (workflow-owned)** — a "considered, holding whole" decision recorded in the spec/draft
  decision structure is honored by the planning checkpoints and the operating workflow, which stay silent absent
  a new-evidence delta. It is a prose record read by the agent, deliberately not a CLI input — the CLI evaluates
  only typed state.

**Rename surface** (rename in place, pre-release, no alias): config schema, validation allowlist, the
review-chunking policy reader, the update-command template handling, `arc-config.yml`, and
`strategy-configurability-architecture.md` — package source and `.arc/` instance both. The `review-chunking`
method's threshold prose updates to the new names; its boundary contract is untouched. **Mechanical requirement
only:** across the rename surface, nothing beyond the key names changes — the advisory behavior this section
specifies is the only behavioral delta. Update recognizes only the new template keys; it does not alias, transfer,
or migrate old values. Unpublished installations clear, regenerate, or manually update development config.

### 9. Host-native stack composition — opt-in, observed-never-authoritative

The chain topology (each member targets its predecessor) is the same derivation model GitHub's native stacked
pull-request public preview reads, so an ARC-materialized chain can register as a native stack through one linking
call. Composition is opt-in and never load-bearing. The opt-in is the operator's link
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
- **Linked landing arms.** The ordinary linked arm merges the bottom member through the host's asynchronous
  stack-merge API with the same one-member authorization — a singleton pinned-head effect under the same trust
  model as ordinary integration. One additional explicit per-invocation arm may merge the complete remaining
  non-terminal linked set atomically, in direct-merge mode only. Exactness is ARC's authorization subject, not a
  server payload: the complete expected remainder — order, bases, change requests, heads — derives from validated
  plan/state plus fresh host observation, every included member independently satisfies order, exact-head
  readiness, review, checks, and lock posture, and the observed host stack must match the expected chain exactly
  at arm selection, at reservation, and at pre-submit reobservation. Prepare reserves one `land` effect over the
  ordered set; one interlock names every member/head, the atomic consequence, and the residual-race disclosure
  below. Submission pins the selected top change request's head; the host selects and atomically applies the
  currently registered prefix, re-evaluating its protection rules for every included member. The host-assigned
  asynchronous effect identity is version-stored in the active operation as soon as it exists and polled/reobserved
  after restart. Adoption accepts only the exact authorized all-landed result; none-landed is retryable only under
  a new interlock when non-submission is authoritatively established; a partial, extra, or reordered effect, or a
  crash after submission before the identity can be persisted that cannot be resolved from fresh facts, blocks for
  explicit remedy. The terminal work-unit vehicle is never included.
- **Residual race — disclosed, not closed.** The public API exposes no stack-generation or full-member
  compare-and-set token, so a lower member, head, or relationship can change between ARC's final observation and
  the host's server-side prefix snapshot. Post-effect observation detects such a result and blocks reconciliation
  but cannot undo an applied atomic prefix. Exposure narrows to heads that independently pass the repository's
  protection rules and scales with that configuration (for example, stale-approval dismissal); the interlock text
  carries this disclosure, and an operator declining the race lands sequentially — the default throughout.
- **Recognized retarget.** After a single-member linked landing, the host's automatic rebase/retarget of the next
  member is reconciled through § 4's post-observation exact-reservation path with the same contribution proof. An
  all-remaining atomic result has no non-terminal suffix to retarget.
- **Merge-strategy constraint.** The linked arms require the merge-commit strategy as v1 policy: the host contract
  does not establish that squash or rebase break native identity tracking, but their interaction with § 4's
  contribution proof is unverified, so widening waits on primary-source evidence. A plan configured otherwise
  composes unlinked.
- **Degrade path.** Preview volatility is absorbed structurally: on any host regression, refusal, or capability
  absence, the executor unlinks the chain (or confirms the host already has), after which observation yields the
  unlinked arm for the remainder of the stack; the downgrade is surfaced, never silent. Exact API shapes (link
  registration, async merge, status reads) verify at implementation against the live surface — the design binds
  the arm's behavior, not preview endpoint signatures. Auto-merge is unsupported for native stacks, which is
  moot here: every landing is attended by design.
- **No merge queue.** An `enqueued` result is not the atomic direct effect: a queue may split the prefix into
  separate merge groups. It refuses or visibly downgrades to sequential unlinked delivery.
- Cross-fork stacks are unsupported by the host and out of scope: delivery refs are same-repository projections.

### 10. Authority boundaries and command surface

- Plan and state authority, Git/host authority, review authority, and work-unit lifecycle authority hold exactly
  as `cohort-chunked-delivery.md` § Shared contracts records them. Delivery stores bindings to current review
  targets only where execution needs them and never copies verdicts.
- Deterministic comparison, derivation, dispatch, and remedy selection live in typed CLI verbs; workflow prose
  invokes those verbs, renders their precomposed text, and preserves the human interlocks.
- The shipped plan-authoring surface also carries two local, prebinding reads needed by § 7 finalization: a validated
  repo-relative `--task-list <path>` input to `from-tasks`, and a delivery-local schema-description verb projecting
  the registered `DesignInventoryInputSchema` from the generated kernel bundle. The option falls back to the active
  meta pointer when omitted. Neither surface is a general schema-introspection layer, inferred design inventory,
  external mutation, or new authority.
- **Command surface:** one `arc delivery` group mapping onto the shipped operation kinds — read-only discovered-entry
  inspection, eligibility validation
  (§ 1), materialization and binding (`materialize`/`publish`), landing (`land`), suffix reconciliation
  (`rewrite`), landed-ref cleanup (`teardown`), the opt-in link call (§ 9), and a position read feeding the
  session-init slot (§ 7). Phase 3 supplies provider-neutral services and strict prepare/apply/reconcile result
  envelopes; the delivery-owned workflow and argv registration compose them in § 7. Exact verb names and argv
  shapes are implementation detail. The design boundary is that every coordinate-bearing external mutation the
  executor performs against bound state — anything moving a ref, head, tree, or change-request binding — runs
  inside a reserved operation, and every judgment stop is a workflow interlock, not a CLI prompt. A retryable
  attended mutation returns to the interlock rather than persisting approval. Three named carve-outs, each with its
  own guard:
  the pre-binding materialization pushes (no state yet exists to hold a reservation; candidate refs carry no
  authority, and the binding constructor adopts the first observed event — the shipped contract's own design);
  the § 9 link/unlink registration calls (presentation-only, no coordinate moved, re-observed fresh,
  self-healing); and the terminal member's merge (owned and guarded by the integration workflow, adopted by
  observation — § 5).
- **Workflow prose:** the delivery execution steps (member review admission via the vehicle, landing
  authorization, reconciliation dispatch) live in this work unit's workflow surface — the member-review callsite
  `delivery-slice-review-vehicle` deliberately left to its consumer. The workflow reuses the existing review
  command/method sequence with the exact `{ planId, deliverableId, workUnitSlug }` delivery-member vehicle; it adds no
  second review verb or ordinary-WU composition side effect. One integration interlock authorizes each non-terminal
  landing effect: a singleton member/head in the unlinked arm or the complete exact remaining member/head set in the
  optional native atomic arm. The terminal handoff delegates to ordinary integration's existing interlock and adds no
  delivery authorization. Prose dispatches each service's own closed typed result union without a generic normalized
  envelope, compatible with the composable-workflows shapes.
- **Host observation:** one narrow provider-neutral boundary supplies unique change-request lookup/open/read,
  head-matched merge, direct atomic remaining-stack submission/status, and resulting protected-target observation.
  The GitHub adapter consumes the configured merge strategy and normalizes host-assigned results; it is not a
  capability registry, provider workflow engine, review authority, or source of member order.

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
rides the existing Phase 2 integration authority (§ 5); delivery contributes the precondition/handoff reads and one
total post-merge adoption attachment, not a parallel ceremony.

## Cross-cutting Considerations

- **Storage evolution.** All delivery reads and writes go through the shipped plan/state store interfaces;
  records are Git-common-directory state, version-checked, and independent of tracked `.arc/` paths. Member
  refs and delivery position are consequently clone-local, like the state they bind — the supported v1 path is
  one operator at the owning control locus, and a second clone resolves no member (the recorded
  `delivery-slice-review-vehicle` consequence, inherited unchanged). The normalization rule (§ 6) asks the
  storage/projection boundary only for code-repository paths carrying this WU's lifecycle contribution, so
  external-storage materialization and on-demand derived views make it vacuous rather than wrong. Terminal WU
  authority is likewise independent of storage: v1 uses the current request-backed integration vehicle, but no
  plan/state field makes a pull request or repository lifecycle tail permanently mandatory, so a later zero-delta
  terminal closeout composes without record migration.
- **Procedure evolution.** New surfaces are typed verbs plus precomposed text; workflow prose dispatches on typed
  results and owns the interlocks. The existing integration attention callsites gain only closed-result dispatch
  and verbatim rendering; no agent-interpreted control-flow markup or prose-side comparison is introduced. Existing
  workflow contract coverage gates the mechanically testable boundary without building the absent general eval
  harness here, and generated schema authority prevents a second handwritten design-inventory contract (§ 7).
- **Security and trust.** No local record becomes merge or review authority: every landing re-reads host, checks,
  review, and lock state at every affected exact head, and the integration interlock names the exact member/head set.
  Refs, heads, trees, digests, and revisions are exact values; branch names are never trusted. Provider credentials
  stay outside delivery records.
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

1. Eligibility validation, run over operator-authored candidate heads for a planned stack, runs the existing
   project gates per exact member head, verifies ancestry and the normalized completeness identity, fails a member
   whose candidate changes a supplied lifecycle-contribution path away from protected-base state (naming every
   path), survives no ref/plan or tracked-worktree drift, and binds nothing.
2. Materialization produces the ordered `delivery/{wu-slug}/{chunkKey}` chain (lowest member based on the
   protected base, each higher member on its predecessor), refuses empty/duplicate/colliding non-terminal heads,
   publishes the first ref under an exact remote lease, invokes the shipped binding constructor exactly once from
   the first observed ref or change request, and reserves every subsequent ref/request mutation.
3. Work-unit branch parsing, the orphan-branch sweep, and the in-flight-artifact advisory each recognize the
   `delivery/` namespace and surface no false work-unit or missing-record signal for a live stack.
4. A non-terminal landing runs only through the full guarded sequence — fresh readiness, reserve, typed prepare,
   integration-interlock approval over the exact member/head set, fresh apply-time reobservation, merge-lock release,
   one admissible host effect, unique result observation, and version-checked record. The complete unlinked path
   selects one member and refuses an unlanded predecessor; the § 9 atomic arm alone may select every remaining
   non-terminal member after proving each exact head independently ready. Disabled merge locking never skips
   readiness, and retry re-fires authorization.
5. After a single-member landing, suffix reconciliation recognizes only the uniquely moved immediate member through
   a post-observation exact `rewrite` reservation, proves aggregate contribution by complete tree equality or strict
   canonical patch identity, blocks any concurrent/unrelated movement, and atomically rebinds stored coordinates; a
   review-driven fix supplies a complete validated suffix with only explicitly selected contributions allowed to
   change, rather than editing member refs or silently repartitioning the plan.
6. A crash mid-operation resumes through the reservation: deterministic exact snapshots and host-assigned admissible
   effects each adopt a unique already-applied result, return non-application as retryable, and block ambiguity —
   demonstrated per operation kind used by this projection without persisting a verdict or approval.
7. The terminal pull request opens from the retained control branch with the meta `Branch:` matching (the routed
   two-clause constraint), is refused as a `delivery-member` vehicle, and admits under the `work-unit` vehicle. A
   typed absorption decision authorizes the ordinary append-only base reconcile before a separate terminal-ready
   read exposes only the residual tail. Ordinary integration remains the merge authority; immediately after it
   observes the exact merge and before close/teardown, one total post-merge attachment atomically adopts the terminal
   result without reservation or second authorization and is `not-applicable` for unstacked work units.
8. A partially landed stack leaves the protected base green and free of the owning work unit's active lifecycle
   contribution, and an unrelated session's init/status resolution is unchanged by its existence.
9. Session-init surfaces bound delivery position as one precomposed line from the new probe slot, and the slot
   degrades independently on failure.
10. `assess-boundary-fit` returns the three-outcome read at its three planning fire-points (including the new
    `generate-tasks` Pass 1 site), the rename is complete across method, workflows, README, recipe, the runtime
    classification registry, and both copies, and decided outcomes suppress re-advisories absent a new-evidence
    delta.
11. The changeset advisory-threshold rename is complete across schema, validation, policy reader, update handling,
    config, and strategy surfaces (both copies); the integration advisory offers exactly one remedy with
    delivery-aware wording when a plan is bound and stays silent under every § 8 suppression state.
12. With linking opted in, the chain registers as a native stack and supports both one exact bottom-member landing
    and, in direct-merge mode after set-wide exact validation and one race-disclosing interlock, one explicitly
    authorized atomic landing of every remaining non-terminal member. The atomic arm retains its asynchronous
    effect identity, adopts only the exact authorized all-landed result, blocks partial or unexpected effects,
    refuses queue grouping, and never includes the terminal WU vehicle. A single-member host retarget reconciles
    through the exact recognized-movement path; refusal visibly degrades the remainder to the complete unlinked
    executor with equivalent delivery semantics, and opting out makes no native call.
13. This work unit's own task-generation pass authors a provisional delivery plan for its implementation, and active
    finalization replaces that locus with the generated-schema-backed canonical projection without binding delivery
    state or mutating an external projection.
14. All quality gates pass and the work unit is ready for integration.

## Open Questions

No design question is intentionally deferred. Two implementation details are noted as resolve-during-work:

- Exact `arc delivery` verb names and argv shapes (§ 10 fixes the boundary, not the spelling).
- Exact preview API signatures for the linked arm (§ 9 binds behavior and degrade posture; signatures verify
  against the live host surface at implementation).
