# Spec (`detailed` · `RFC`): evidence-applicability

- **Origin:** [internal]

- **Purpose:** Stop concurrent work from pausing on each other's integration by binding ARC's three "is prior evidence
  still good" decisions — merge safety, review clearance, verification currentness — to what a delta actually touched
  rather than to whether the head moved. One evidence-delta envelope composed from existing producers, one
  path-treatment registry, and one judgment method, with base movement as the first fully wired instance and the
  approved review-fix scope as the second.

---

## Introduction / Context

Three verified work units and the Errand queue idle while one work unit integrates. Nothing refuses them; the hold is
a convention adopted after an earlier integration forced the integrating session to stop repeatedly and re-run
ceremony, and the remedy offered was "have the other session pause". That turned a policy defect into a lifecycle
habit: serialize whole lifecycles upstream of publication so the base never moves under an integrating branch.

The defect is that ARC binds three decisions to **base containment** — is the current base OID an ancestor of the
head — rather than to **overlap** — did the base's advance touch anything this change touches:

- The base-drift analyzer (`lib/git/base-distance.ts`) mints `reconcile` whenever `behind > 0`; its module contract
  states that raw Git distance exclusively controls the verdict. `arc integrate checkpoint` refuses to compose on
  `reconcile`. Its safety composer (`reconcileSafety`) uses the overlap read only to decide whether the typed
  `arc base merge` may run: safe when integration evidence is complete, overlap is available, and the substantive
  overlap is empty (or, for a delivery, contained in the terminal residual). After that merge the workflow runs
  Tier 1 gates, a push, and a full recompose, and the new head owes a review-applicability judgment because
  "clearance never carries". Any other substantive overlap stops on `blocked / unsafe-reconcile` with a manual remedy.
  So the loop runs on exactly the movement that is harmless, and the movement that needs a merge has only a manual
  stop.
- `arc review status` returns `base-moved / rerun-checkpoint` from its own containment read (`readBasePosition`:
  fetch, then `merge-base --is-ancestor`), with no overlap read at all.
- Delivery eligibility (`lib/delivery/eligibility.ts`) resolves the bottom member's predecessor to the freshly
  observed protected-base tip and refuses `wrong-predecessor` when that tip is not an ancestor of the member head, so
  any base advance after private chain authoring owes a chain rebuild. `plan-segmentation` hit this.
- The Errand path has no typed base reconcile: `run-errand.md` gates twice on `arc base drift --json`, and any
  `reconcile` returns to Step 5, re-runs chunking, and re-enters the applicability judgment.
- `arc integrate merge` reads only `verdict` from its final drift read and folds a host HTTP refusal (a strict-currency
  `BEHIND`, a protection refusal, or a conflict) into `blocked / operation-failed` beside transport failures, so a
  refused merge loops through re-checkpoint and re-approval.
- Verification currentness has the same defect on a different axis. An approved review fix that changes any
  reviewable path flips the Candidate lineage to `convergence pending`, and the only exit is one final Tier 3 over
  the converged lineage (`pre-publication-procedure.ts`). The `targeted | focused | full` scope recorded on the
  `review-response` transition is stored and never consulted; the sole discriminator is the boolean
  `implementationChanged`. On `plan-segmentation` a one-line code fix and, later, a six-line documentation sync each
  forced a full re-verification.

The host does none of this. The live `main` ruleset does not require branches to be up to date, does not dismiss
stale reviews on push, requires one check, and CI runs on every push to `main`. The pull-request check runs on the
host's test-merge ref, so it already exercises the head combined with the base as of run time. ARC applies a policy
equivalent to "require branches to be up to date" plus a review re-judgment, on a host configured for the opposite.

The substrate already holds most of the answer. Overlap is computed (`analyzeBaseOverlap`) and then ignored for the
verdict. Path-intersection carry exists in the review core. The Candidate attestation binds the reviewable subject
digest and already survives unrelated base movement. The terminal merge is already a compare-and-swap on exact heads.
What is missing is one vocabulary for "does evidence bound to target T0 still cover T1", one registry for "does this
path count", and consumers that read overlap where they read containment today.

## Goals

- **No session waits for another.** Concurrent work units and Errands publish and integrate throughout each other's
  landing windows. Disjoint base movement on a host that reports the request mergeable invalidates nothing: no base
  merge, no re-judgment, no recompose, no delivery rebuild. Overlapping movement reconciles once, at the terminal
  boundary, through a typed arm.
- **Evidence applicability follows covered content.** Review clearance, verification currentness, and merge safety
  are judged over one typed delta description and one three-way answer — `carries | supplemental | fresh` — with the
  deterministic arms computable and the residual judgment disclosed.
- **Verification repeats scale to the approved scope of a fix.** A `targeted` fix advances the Candidate on its own
  Tier 1 evidence; a `focused` fix records one bounded check; `full` and an unexplained delta stay fresh.
- **Strictness comes from the host.** Where the host enforces up-to-date branches, ARC observes it and takes the
  typed base-merge arm; ARC never imposes stricter currency than the host and adds no key of its own.
- **Fail closed on missing evidence.** Unavailable overlap, an unresolved host, or a transition that predates the new
  field each degrade to today's behavior, never to a carry.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- No repository-scoped queue, lane record, priority, head-of-line visibility, or exclusive cross-work-unit window.
  Serialization is the terminal compare-and-swap that already exists.
- No native `merge_group` adapter; no change to the delivery-stack `queue-not-atomic` refusal beyond confirming it.
- No typed chain-rebuild operation. `delivery-authoring-rebuild` (to be minted from its capture; not yet in the
  backlog) owns the rebuild for overlapping and interrupted-authoring cases; this work unit owns only the predicate
  that says whether a rebuild is owed.
- No change to the unexplained-delta path (`blocked / establish-new-root` and fresh full verification), and no change
  to the delivery-member route defect the "resume scoped review-fix verification before Candidate re-root" Errand owns.
- No proposal-side disposition-set schema, `review-triage` / `review-response` method, or `respond-command.ts` edits.
  `review-signal-convergence` carries `proposedVerification` and its pass-through into the transition; this work unit
  owns the transition schema and constructor and reads the value fail-closed.
- No merger of the review-contribution and Candidate D4 classifiers (captured for after `review-signal-convergence`
  lands). No edits to the review cohort's review-fix fire-points, no `retrigger` semantics, no review-fix collapse.
- No criterion-digest or criterion-immutability changes.
- No host merge-state signal redesign. `host-policy-evidence` owns replacing the lazy `mergeable` boolean with native
  `mergeStateStatus`; this work unit exposes the existing boolean through one typed, bound slot with a bounded
  re-read on `null`.
- No ARC-side strictness configuration key (see § Alternatives & Rationale).
- No projection retirement, dematerialization, or `ROADMAP`-specific merge machinery; `roadmap-tooling` and
  `operational-state-docs` own branch-carried projection retirement.
- No change to this repository's CI workflow (which legs run on push to `main`); captured separately.

## Proposed Design

The design has three layers. The **evidence layer** (D1–D3) adds one registry, one envelope, and one method. The
**base-movement instance** (D4–D11) wires the envelope's overlap and host axes through every path that offers a
merge. The **verification instance** (D12–D13) wires the envelope's cause axis through the Candidate lineage.
Doctrine (D14) and fire-points (D15) close it. Boundary fit at this read: **stays one WU + delivery-plan candidate**
— the three layers are independently reviewable surfaces of one coherent design (see § Cross-cutting Considerations
› Delivery), and the evidence basis is unchanged from the draft's read.

### D1. One path-treatment registry

Two classifiers answer "does this path count" incompatibly today. The base-drift adapter
(`lib/base-drift/current-adapters.ts`) knows `substantive | regenerable` and marks only `ROADMAP` regenerable. The
Candidate subject collector (`lib/work-unit/git-candidate-subject.ts`, `classifyCandidateSubjectPath`) knows
`reviewable | operational | candidate-projection`: the work unit's own `meta-*` and any project document
(`isProjectDocumentPath`, whose set is today `ROADMAP` alone) are `operational`; the Candidate record and the
submission boundary are `candidate-projection`; a relocated own artifact keys by artifact kind. Nothing shares them.

One registry module under `lib/` replaces both:

```text
classifyPathTreatment(path, { workUnit, projectionPaths }) -> reviewable | operational | regenerable
```

- `reviewable` — counts everywhere.
- `operational` — the work unit's own `meta-*`, the Candidate record, the submission boundary, a vacated relocation
  source, and project documents. Never counts toward overlap.
- `regenerable` — the subset of `operational` the host may three-way merge into a hybrid render; today `ROADMAP`
  alone, drawn from the same `ProjectDocumentKindSchema` the subject collector already uses. Carries the hybrid-render
  consequence of D5 and nothing else.

The registry takes the work-unit identity because the own-artifact and projection paths are keyed by it, and every
caller — checkpoint, merge verb, `arc base drift` in a work-unit checkout, subject collector — already holds it. In a
checkout with no work unit (an Errand), the own-artifact and projection inputs are empty and the registry degenerates
to project-document classification. The Candidate subject entry's `treatment` records the registry's value;
`candidate-projection` folds into `operational` (its only producer is the collector; no consumer dispatches on it —
`candidate-applicability.ts` excludes both from the reviewable residual). The set is not widened.

### D2. One evidence-delta envelope, composed from existing producers

A typed shape every fire-point composes from computations that already exist. It is **computed, never persisted** —
rendered into the surfaces below and discarded; the durable records it is derived from are unchanged except as D12
states. It lives in one module under `lib/` beside the registry, with one composition function,
`composeEvidenceDelta`, that takes the producers' outputs (a base-drift result, an optional D4 projection, an
optional lineage cause) and returns the envelope; every consumer named below calls that function rather than
assembling axes by hand. `analyzeBaseOverlap` is parameterized by the head OID it diffs (today it diffs `HEAD`), so
review status and eligibility can compose overlap over a reviewed head or a member head that is not the checkout's
`HEAD`.

```text
EvidenceDelta {
  cause:    base-movement | approved-fix | base-merge | member-rewrite | unexplained
  relation: equal | mechanical-reapply | clean-divergence | interaction | unavailable | not-applicable
  overlap:  { kind: disjoint | overlapping | unknown, substantivePaths, regenerablePaths }
  host:     { state: mergeable | conflicting | unresolved | not-applicable, observedBase?, observedHead?, detail? }
  observed: { head, base }            # the one Git observation every axis was composed from
  residual: bounded path list | null  # the D4 residual when a classifier produced one
}
```

- `cause` comes from the base-drift read's integration evidence (`base-movement`), the merge verb after a typed base
  merge (`base-merge`), the Candidate lineage's `review-response` transition (`approved-fix`), the delivery
  suffix-rewrite observers — the D4 classifier's before/after predecessor endpoints and native landing's movement
  count (`member-rewrite`; no lineage transition records a rewrite) — and the attestation verb's unexplained-delta
  arm (`unexplained`).
- `relation` comes from the D4 proofs and subject-digest equality the two existing classifiers already return
  (`candidate-applicability.ts` and `review-contribution-applicability.ts`), produced for the movement causes only.
  An `approved-fix` is `not-applicable`: its in-place edit is never D4-classified (after a response the durable
  baseline is the new target) and is described by its reviewable path delta and the approved scope (D12).
- `overlap` comes from `analyzeBaseOverlap` classified through the D1 registry. `operational` paths are excluded from
  the intersection entirely; `regenerable` paths are reported beside it.
- `host` comes from the bound read of D5, admitted only when its observed OIDs match `observed`.

The Git axes are composed from one observation of head and base; the host axis is admitted only when its observed
OIDs match that observation. The four base-movement detectors that exist today (`behind`, `merge-base --is-ancestor`,
OID inequality, re-observed heads) therefore cannot disagree inside one envelope. The two D4 classifiers keep producing
their projections unchanged and are not merged.

**Removal.** The review-gate `core/applicability.ts` module (`classifyReviewApplicability`,
`validateIncrementalApplicabilityReceipt`, `ReviewApplicabilityProofSchema`), its `review-applicability` v2 row in
`core/schema-inventory.ts`, its registration, and the expectations in `review-schema-registration.test.ts` and
`core/applicability.test.ts` are removed together: the classifier has no production callers, the schema has no records
on disk, and there are no adopters to carry. The `applicabilityId` **field** on the gate contract, projection, and
local-review result is a different thing and stays.

### D3. One judgment method: `assess-evidence-applicability`

A method (`system/methods/assess-evidence-applicability.md`, shipped through package source), not a verb, so
`composable-workflows` can lift it unchanged.

```text
assess-evidence-applicability(delta, evidence, act) -> { verdict: carries | supplemental | fresh, residual }
  evidence: review-clearance | verification | merge-safety     (quality-gate results fold under verification)
  act:      the operation the evidence gates
```

Deterministic arms, stated in the method and computable from the envelope. They apply **in order**; the first row
whose condition holds decides:

| Condition                                                               | Verdict                                  |
| ----------------------------------------------------------------------- | ---------------------------------------- |
| `cause: unexplained`                                                    | `fresh` — the arm no judgment may soften |
| `merge-safety`: `base-movement`, `overlap: disjoint`, `host: mergeable` | `carries`                                |
| `merge-safety`: `overlap: overlapping`, `host: mergeable`               | `fresh` (typed base merge, checkpoint)   |
| `merge-safety`: `host: conflicting` / `unresolved`, `overlap: unknown`  | never `carries` (D5 names the stop)      |
| `merge-safety`: `cause: base-merge`                                     | `fresh` (the merged head owes its own)   |
| `overlap: overlapping` (movement causes, other evidence kinds)          | never `carries` — see below              |
| `relation: interaction`                                                 | never `carries` — see below              |
| `relation: equal`                                                       | `carries`                                |
| `cause: approved-fix`, approved scope `targeted`                        | `carries`                                |
| `cause: approved-fix`, approved scope `focused`                         | `supplemental`                           |
| `cause: approved-fix`, approved scope `full`                            | `fresh`                                  |

Precedence settles the two cases that would otherwise read two ways. For `merge-safety`, overlap × host decides
before relation: an unchanged head over an overlapping base is not merge-safe on its own. For review clearance and
verification, `overlapping` movement and `interaction` both defeat `relation: equal`: review clearance is
`supplemental` at minimum; verification is `supplemental` under overlapping movement (Tier 1 over the merged head,
as D5 runs) and `fresh` under `interaction`. Only `base-movement` unlocks the merge-safety carry; a `base-merge`
cause is always fresh for merge-safety.

The residual judgment — whether a bounded `clean-divergence` or an overlapping delta deserves a supplemental pass or a
fresh one — stays prose, disclosed with the residual it was made over. Where an authority already holds the choice
(the checkpoint's Candidate selection `covered | targeted-check | changed`; the review-contribution selection
`covered | review-required`; the disposition set's approved scope), the method's verdict is the recommendation that
authority sees, made before the choice, and the recorded selection is what acts afterward. An approver may select
more narrowly than the recommendation; that is the holder's decision, not a softened arm. The agent's own verdict
never releases a check over its own work.

### D4. Additive movement classification; the verdict is unchanged

`BaseDriftResult` keeps its four-valued `verdict` with `clean` versus `reconcile` driven by raw distance alone — the
recorded module invariant stands unamended — and gains an orthogonal `movement` field:

- `disjoint` — overlap evidence available and the registry-filtered `substantivePaths` empty;
- `overlapping` — any substantive overlap;
- `unknown` — overlap unavailable.

`movement` is the base-drift read's projection of the envelope's `overlap` axis, computed in `analyzeAvailableBase`
beside the overlap it already computes. Integration-evidence completeness is **not** a precondition for classifying:
completeness exists to authorize a mutating merge, and requiring it for a reading would disable the disjoint arm on
any history with an unproven single-parent commit. The register text (`composeBaseDriftRegister`) names the movement,
so every surface that renders the register — `arc base drift`, the session-init advisory — carries it without a
consumer change. Consumers that never read `movement` keep today's fail-closed behavior.

**Every `verdict` consumer, and which consult `movement`.** Code consumers:

- `arc integrate checkpoint` (`scripts/integration/checkpoint.ts`, `reconcileSafety`) — reads `verdict`, overlap,
  integration evidence, and the host fact today. **Consults `movement` × `host`** (D5).
- `arc integrate merge` (`scripts/integration/merge.ts`, `readFinalDrift`) — reads `verdict` only today.
  **Consults `movement`, `baseOid`, and `host`** (D6).
- `arc base drift` (`handlers/base.ts`) — reads `verdict` and the register. Dispatch unchanged; the register and the
  JSON carry `movement` and the D5 host slot.
- `arc base merge` (`scripts/base/merge.ts`) — reads no verdict (expected endpoints only) and carries no evidence
  guard of its own; the integration-evidence-completeness guard lives in the checkpoint that offers the arm.
  Unchanged.
- Session-init `baseDistance` probe, recommendation, and schema (`handlers/status.ts`,
  `lib/session-init/recommended-action.ts`, `commands/status/schema.ts`) — reads `verdict` and the register. Action
  unchanged (`surface` on `reconcile`); the value schema admits `movement` and requires its absence on the
  not-applicable arms.
- `arc review status` `base-moved` arm (`scripts/review-gate/status.ts`) — reads its own `baseContained` today, not
  the analyzer. **Composes the envelope's overlap axis** from its own base observation (D8).
- Delivery eligibility and the terminal classifier (`lib/delivery/eligibility.ts`, `terminal-integration.ts`) — read
  no verdict; the classifier reads overlap paths. **Compose overlap through the registry** (D7).
- Delivery position refresh trigger (`lib/delivery/position.ts`, `refresh.ts`) — reads its own `targetMovement`.
  Unchanged; "Base movement alone obligates no refresh" already holds.

Workflow prose consumers:

- `integrate-work-unit.md` Step 2 advisory read — silent on `clean` and regenerable-only drift. Unchanged in
  effect; wording cites `movement`.
- `integrate-work-unit.md` Step 10 checkpoint and merge dispatch — `reconcile / reconcile-base` and
  `invalidated / checkpoint` today. **Dispatches the D5 and D6 arms.**
- `run-errand.md` Step 4 advisory read and Step 6's two gates — `clean` continues, `reconcile` returns to Step 5
  today. **Dispatches `movement` × `host`** (D9).
- `session-init.md` Step 6 and `probe-envelope.md` — render the register on `surface`. Rendering unchanged; the
  envelope reference documents the field.

### D5. The checkpoint decides merge-safety from movement × host, with typed arms

On `reconcile`, `arc integrate checkpoint` reads host mergeability through one shared typed read that moves from the
checkpoint's private `readHostFact` onto the base-drift read as an optional `host` slot. The slot is attached only
when a caller passes the bound change request into `runBaseDrift` — the `arc base drift` handler, the checkpoint,
the merge verb, and the Errand's read do; the session-init `baseDistance` probe never does, so session init pays no
host read. The slot is **bound**, not bare: it carries the host-observed base and head OIDs from the pull-request
payload (`base.sha`, `head.sha`) beside `mergeable`. A mismatch between the observed base and the drift read's
`baseOid`, or between the observed head and the local head, classifies `unresolved`, never `mergeable`. Path
disjointness is not Git mergeability in general, so the host read is load-bearing.

- **`disjoint` + host `mergeable` → continue composition to `ready / request-approval`.** `arc integrate merge`
  proceeds to the exact-head merge; the host's merge commit combines the trees, as on any non-strict repository. No
  base merge, no re-judgment; clearance carries. The ready surface's base-drift line reads "behind N, disjoint, host
  mergeable" as a decision-bearing fact for the approver rather than asserting a clean read.
- **`overlapping` + host `mergeable`, integration evidence complete → `reconcile / reconcile-base`.** The typed
  `arc base merge`, Tier 1 gates, one push, one checkpoint, one approval; the review-applicability judgment is owed.
  This is the one movement arm where "clearance never carries" still applies.
- **`overlapping` + host `mergeable`, integration evidence incomplete → `blocked / unsafe-reconcile`.** Manual
  remedy as today; the checkpoint keeps its completeness guard for the mutation it offers, while the read-only
  classification (D4) needs none.
- **Host `conflicting` → `blocked / conflict`.** A conflict-resolution stop. The remedy names the substantive
  overlap paths from the overlap read as the likely conflict locus; the host exposes no per-path conflict data.
- **Host `unresolved` → `blocked / host-pending`, `nextAction: retry`.** Reached after a bounded re-read inside
  the checkpoint (three reads, short spacing). Retryable path, light handling; never the overlap remedy.
- **`unknown` → `blocked / unsafe-reconcile`.** Fail closed; the remedy directs `arc base drift --json`.
- **No bound change request → as today.** The host slot is optional; a checkpoint without a bound request cannot
  reach a merge.

This retargets today's typed base-merge arm. Today `reconcileSafety` admits it only when the substantive overlap is
empty or, for a delivery, `residual-contained`; the empty case becomes the disjoint compose path, and the arm now
serves overlapping, host-mergeable movement, where git can three-way merge cleanly but the merge commit carries
interaction. Inert-only overlap (`regenerable` paths, today `ROADMAP`) resolves on the disjoint path: a mergeable host
lands a hybrid render on the base, accepted under `project-state-integrity`'s regenerate-wins posture; a conflicting
one is the existing local merge plus regenerate path. No projection-specific mechanism is added, and the rule
degenerates to "nothing inert" once `roadmap-tooling` retires branch-carried projections. The delivery terminal
classifier gains the same disjoint arm (D7).

### D6. A typed exit from a host merge refusal

The pinned-merge port (`scripts/integration/merge-composition.ts`, `mergePinned`) classifies a host HTTP refusal
into a typed **host-refusal** state distinct from transport failure, composing on the `httpStatus` the
`HostedProcessError` already parses: a `405` (the host cannot perform the merge — strict currency, protection, or
conflict) is a host refusal; a `409` (head SHA mismatch) is the existing head-moved invalidation; anything else stays
`operation-failed`. The merge verb's final drift read returns `verdict`, `baseOid`, `movement`, and `host`, with the
host slot bound to the same observed OIDs as D5, and re-classifies at merge time:

- `clean`, or `reconcile` with `disjoint` and a `mergeable` host → proceed to the pinned merge, as today's `clean`;
- `reconcile` with `overlapping` → `invalidated / reconcile-base`, carrying `expectedBase` and `expectedHead`, so the
  workflow offers the typed `arc base merge` instead of looping through re-checkpoint and re-approval;
- a host refusal when the merge-time read reports `behind > 0` → the same `invalidated / reconcile-base` (the host
  is enforcing currency the disjoint arm cannot satisfy);
- a host refusal when the read reports `behind == 0` → `blocked / host-refused`, a typed stop carrying the host's
  detail — a protection or review-requirement refusal no base merge can cure, so offering one would loop through
  `skipped-clean` and re-approval;
- `conflicting` → `blocked / conflict`; `unresolved` → `blocked / host-pending` with `retry`; transport failure →
  `blocked / operation-failed`, unchanged.

Exact-head merge authorization is untouched: `invalidated` still returns to composition, and a re-checkpointed head
needs its own approval. When `host-policy-evidence` lands native merge-state, `BEHIND` is observed before the merge is
offered and the `reconcile-base` exit becomes the rare path.

### D7. Delivery eligibility tolerates disjoint movement without falsifying a member's base

Two different things are called "the base" in the delivery subsystem, and the design keeps them apart. The
**persisted target** (`state.target.coordinates`, head and tree) is written only at materialization (the protected
base as authored) and at each landing (the landing result — the base tip the member's merge produced); it is the
chain's anchor, and every member's `coordinates.base` is its real predecessor — the persisted target for index 0,
the previous member otherwise. The **observed tip** is the protected base as observed at the operation: eligibility
resolves the local base ref (`observeRef(protectedBaseRef)`, fresh insofar as that ref was updated), the
checkpoint's drift read fetches, and position facts already report an advanced tip as `targetMovement: append-only`
and disclose that base movement alone obligates no refresh. Nothing in this design writes the observed tip into the
persisted target; the persisted-target equalities below therefore stay valid.

Three eligibility reads equate the two today. The index-0 ancestry check becomes a predicate over the member and the
observed tip:

```text
predecessorRelation(member, observedTip) -> exact | disjoint-ahead | overlapping-ahead | unrelated
```

`exact` when the tip is an ancestor of the member head (today's pass). Otherwise the merge-base of tip and member head
is located; none → `unrelated` (today's `wrong-predecessor`). With one, the base delta (merge-base → tip) is
classified through the D1 registry and intersected with the member diff (merge-base → member head): empty substantive
intersection → `disjoint-ahead`, else `overlapping-ahead`. Inert overlap resolves as in D5.

A `disjoint-ahead` bottom member stays eligible with its `coordinates.base` unchanged — downstream consumers diff
from it, pass it as the three-way merge base, and check chain consistency against it. The landing itself already
targets the protected ref by name, and the host's merge commit combines the member with the live tip; the landing
result then becomes the persisted target, as today. `overlapping-ahead` and `unrelated` still refuse and owe a
rebuild; `delivery-authoring-rebuild` (to be minted) owns how. The terminal checkpoint reads the same disjoint drift
and D5 handles it.

The other two reads are tree-entry comparisons at the lifecycle paths, and they are where the common disjoint case —
a sibling ship regenerating `ROADMAP` on the base — bites today. The lifecycle-contribution revalidation
(`lifecycle-contribution.ts` `compareDeliveryLifecycleContribution`) requires each member's entries at the lifecycle
paths to equal the tip's, and the normalized-completeness close (`compareNormalizedDeliveryTree`) overwrites the
top's lifecycle entries with the tip's before requiring the final candidate to match; the lifecycle path set includes
the project readiness document by default. After a sibling regenerates it, every member differs from the tip at that
one path and eligibility refuses `lifecycle-contribution` before the predicate is consulted. Under `disjoint-ahead`,
both comparators take their base-side entries for paths the D1 registry classifies `regenerable` from the bottom
member's merge-base rather than the tip; every other lifecycle path stays tip-compared, because a sibling cannot
legitimately touch this work unit's own artifacts, so tip and merge-base agree there. The host merge then lands the
hybrid render under regenerate-wins, exactly as D5 states for the singleton path. This is the registry lookup D1
already provides, not a projection-specific rule, and it degenerates to nothing once branch-carried projections
retire.

**Every consumer that compares a member's `base` to a base head, or diffs a member against the observed tip.** Sites
that change:

- `lib/delivery/eligibility.ts` `prepareDeliveryEligibility` — the index-0 predecessor is the observed
  `protectedBase` and ancestry is required (`wrong-predecessor`). **Uses the predicate; `disjoint-ahead` passes.**
- `lib/delivery/lifecycle-contribution.ts` `compareDeliveryLifecycleContribution` and
  `compareNormalizedDeliveryTree`, through eligibility's `revalidateLifecycleContribution` and
  `compareNormalizedCompleteness` — base-side entries come from the tip. **Under `disjoint-ahead`, `regenerable`
  paths compare against the merge-base entries.**
- `lib/delivery/terminal-integration.ts` `classifyDeliveryTerminalDrift` — folds `regenerablePaths` into the
  predecessor-overlap intersection and has no disjoint arm. **Gains the disjoint arm; `regenerable` paths never count
  toward predecessor overlap.**
- `scripts/review-gate/status-composition.ts` `readBasePosition` — the live tip must be an ancestor of the reviewed
  head. **D8.**

Sites that compare against the persisted target and stay as they are, because it never carries the observed tip:

- `lib/delivery/position.ts` `recognizeDeliverySuffixRetarget` (`coordinates.base !== target.coordinates.head`) and
  `resolveDeliveryPredecessorHead` (index 0 and a landed predecessor both resolve to the persisted target head), and
  the `handlers/delivery-execution.ts` refusal that consumes the latter.
- `lib/delivery/terminal-integration.ts` `rebindDeliveryTerminalCoordinates` — a single-member plan's terminal
  compares its base to the persisted target head; a multi-member plan's to its predecessor member.
- `lib/delivery/native-landing.ts` observed suffix rebuild and terminal rebind — index 0 reads the persisted
  `target.coordinates` from the landed state.
- `lib/session-init/delivery-position-facts.ts` `snapshotIsCurrent` and `observeTarget` — an advanced tip is
  `append-only`, which `suffix-reconciliation.ts` already admits as a non-mismatch.
- `lib/delivery/materialization.ts` — index-0 `base` is the snapshot's protected-base head at authoring time.
- `lib/delivery/suffix-rematerialization.ts` — index-0 `afterPredecessor` is the snapshot's protected base. That is
  the rebuild path `delivery-authoring-rebuild` owns.

Sites that read a member's base for another purpose and stay as they are:

- `scripts/integration/checkpoint-composition.ts` `classifyDeliveryDrift` — `predecessorPaths` diff from
  `firstCoordinate.base`, the chain's real ancestor.
- `lib/delivery/chain-absorption.ts`, `review-fix-continuation.ts` — member-to-member adjacency.
- `lib/delivery/landing.ts` (`exactOpenRequest`, `prepareDeliveryLanding`), `native-stack.ts` registration,
  `retirement.ts` — ref-level comparisons (`baseRef` is the protected ref), not OIDs.
- Review targets — `pre-publication-delivery-targets.ts` (`diffBaseSha = member.coordinates.base`),
  `handlers/candidate.ts` `observeEndpoints`, `earlier-review-applicability.ts` — diff from the member's recorded
  base, which is exactly why `base` stays the real ancestor.
- `deliver-stack.md` prose ("each request is based on its predecessor branch"; "Base movement alone never invokes
  this arm") — the predecessor chain is unchanged; the eligibility prose names the predicate.

### D8. Review status stops treating containment as movement

`readBasePosition` keeps its fetch and containment read and additionally composes the envelope's overlap axis from
the same observation (`analyzeBaseOverlap` through the D1 registry, over the reviewed head and the observed base). The
`base-moved / rerun-checkpoint` arm fires only when `!baseContained` **and** `movement` is `overlapping` or `unknown`
(fail closed). Disjoint movement neither invalidates the retained attempt nor demands an applicability judgment; the
status result carries the movement so the caller can render it. The judgment itself is D3's method; this design wires
its base-movement instance at the review-status arm and the checkpoint and leaves the review-fix fire-points to the
review cohort as seams.

### D9. The Errand path gets the same policy through the same read

`arc base drift --json` exposes the D5 host slot whenever the current branch has an open change request. `run-errand.md`
Step 6's two gates dispatch on `movement` × `host` with the same arms: `disjoint` and `mergeable` → release and merge;
`overlapping` and `mergeable` with complete integration evidence → the typed
`arc base merge --expected-base --expected-head` (replacing the implicit append-only reconcile), Tier 1 gates, push,
and the applicability judgment; `overlapping` with incomplete evidence → stop, as the checkpoint's `unsafe-reconcile`
does; `conflicting` → the conflict stop with the lock still held; `unresolved` → bounded re-read, then stop with
`retry`; `unknown` → stop. An Errand never reaches `gh pr merge` on a refusal the read would have shown.

The Errand lanes merge with `gh pr merge`, not `arc integrate merge`, so D6's typed exit does not reach them and the
workflow carries the refusal arm itself: a refused merge after a `disjoint` read with `behind > 0` re-holds the lock
(as today) and then takes the typed `arc base merge` arm above — gates, push, Step 4 re-entry — instead of returning
to the same read and the same refusal; a refusal at `behind == 0` stops with the host's detail, as D6's
`host-refused` does. Step 4's advisory read is unchanged in effect.

### D10. Strictness comes from the host, not a new key

Where the host enforces up-to-date branches, ARC observes it and takes the typed base-merge arm instead of offering a
disjoint merge it cannot complete. Until the native merge-state read ships, the host's own refusal at the merge is the
enforcement, and the typed route out is D6 for work units and D9's refusal arm for Errands. No dependency edge;
consume the host-read shape when it lands.

### D11. Native queue seam stays where it is

The terminal action remains a closed typed value (`merge`); `queue-not-atomic` remains the delivery refusal
(`native-landing.ts`, `mergeAction === "queue"`). A future `enqueue` arm is additive after lock release, with
asynchronous completion handled by the existing `merged-at-head` resume path. Nothing is built for it here.

### D12. Verification instance: the lineage carries and consumes the approved scope

`review-signal-convergence` carries the proposal-side field: a required `proposedVerification` at the root of the
canonical disposition set, valued from the existing `targeted | focused | full` enum, in immutable disposition content
so it participates in disposition-set identity, approval binding, and fix authorization; the post-fix
`verifiedFix.applicability` must be equal or broader. The durable baseline reducer is a pure function over the
Candidate record and cannot reach the disposition store, and the transition's existing `applicability` is the
primary's own selection, which may not release a check over the primary's own work. So the lineage carries the
approved value itself:

- **Transition.** `CandidateReviewResponseEvidenceV1` (`lib/work-unit/candidate-attestation.ts`) gains
  `approvedVerification?: targeted | focused | full`, copied from the approved disposition set at the one write site
  that already holds it (the response writer that calls `recordCandidateVerifiedResponse`, where
  `review-signal-convergence` enforces the ≥ floor — the one pass-through it adopted). This work unit owns the
  schema, the constructor
  (`createCandidateReviewResponseEvidence`, whose `responseId` preimage now includes the field), the record guards,
  the reducer, and every consumer. A transition without the field reduces to `full` — today's behavior, the
  fail-closed default, and what makes landing order against `review-signal-convergence` immaterial.
- **Reducer.** Today `reduceCandidateDurableBaseline` walks transitions alone, clearing `verificationCompleted` on
  any implementation-changing response, and only the final currentness projection consults lineage attestations, by
  subject digest against the final baseline. That cannot carry a `targeted` response that follows an attested
  `focused` one: the flag is already clear, a `targeted` response neither clears nor sets it, and no attestation
  covers the new subject. So the reducer takes the lineage attestations as input and walks them with the transitions:
  before applying each `review-response` it marks the running target satisfied when an attestation covers its
  subject; it then applies the response, and an implementation-changing response clears `verificationCompleted`
  unless its approved scope is `targeted`, which **inherits** the satisfaction state of the baseline it advances.
  The projection gains `convergenceScope: focused | full | null` — the broadest scope among responses since the
  last satisfaction point, null when the baseline is satisfied. A pending set that is `targeted`-only is by
  construction satisfied, so `targeted` never appears as a pending scope and the attest verb never meets a
  `targeted` baseline that is pending. Every `convergenceVerification` reader derives from this one reducer through
  `projectCandidateCurrentness`, so the seven decision sites (`verbs/attest.ts`, `delivery/review-fix.ts`,
  `handlers/lifecycle.ts`, `pre-publication-procedure.ts`, two arms in `integration/checkpoint.ts`,
  `handlers/delivery-execution.ts`) agree by construction; only `pre-publication-procedure.ts` changes, to project
  `convergenceScope` and word its action.
- **`targeted`.** Convergence is satisfied by the fix increment's own Tier 1 evidence — the transition's existing
  `verificationEvidenceRefs` — with no convergence Tier 3, no criteria walk, no attestation; the lineage advances.
- **`focused` and `full`.** Both close through `arc attest` writing a lineage attestation
  (`CandidateLineageAttestationV1`) that gains a required `scope: focused | full` mirroring the approved scope:
  `focused` over the bounded check's evidence, `full` over today's Tier 3. The verb takes `--scope` (default `full`)
  and refuses `focused` when `convergenceScope` is `full`; the record guard enforces the same so a hand-edited record
  cannot satisfy. The pre-publication request (`pre-publication-procedure.ts`) projects `convergenceScope`, and the
  `run-convergence-verification` action text names the bounded check for `focused` and the Tier 3 for `full`.
- The delivery-member `verification-response` kind is not reused: its guard requires an already-satisfied baseline and
  it records a correction delta, the inverse of what a same-subject bounded check needs.
- The unexplained-delta path is untouched: `blocked / establish-new-root` still follows fresh full verification, and
  that is the only path on which the success-criteria walk repeats. Criterion-text immutability and the
  `validate-criteria` digest stand.
- The liveness Errand ("resume scoped review-fix verification before Candidate re-root") fixes the route by which an
  explained delivery-member delta reaches its transition; without it that path degrades to `full`, never to a wrong
  answer, so it is sequencing, not a dependency.

### D13. ADR-034 amendment

ADR-034's reopening clause names this change ("any remedy that carries structural equivalence into the attestation
lineage changes authority semantics and requires an explicit amendment"). A Tier 2 dated annotation under
§ Amending This Document records that the lineage now advances on an approver-bound scope, with the disposition-set
approval as the authority, and that the Candidate root attestation and its subject-digest applicability are untouched.

### D14. Doctrine

- `strategy-concurrent-work` § Merge ordering between concurrent work units and § Worktree operations state the
  invariant plainly: sessions never coordinate around each other's landing windows; disjoint landings invalidate
  nothing; overlapping landings reconcile at the terminal boundary only. "Errand branches wait their turn" is
  revised to that invariant; "merge from one designated worktree" is removed (no identity rationale; already stale
  against the self-teardown step); "refresh the others after a merge" is revised because a between-sessions
  reconcile pass contradicts "disjoint landings invalidate nothing" (the bullet is append-only-compliant; that is
  not the conflict). The merge-queue bullet stays as a host-side option a team may enable, reworded so it is plain
  ARC builds none and re-reviews nothing at a queue head.
- `strategy-integration` § Review Admission and Head Movement carries the principle — evidence applicability follows
  covered content, never head movement as such — and names the method; § Terminal Integration Authority states the
  disjoint compose path and the CI contract the disjoint arm relies on: pre-merge evidence is the host's test-merge
  check as of run time, post-merge evidence is CI on the base, which must therefore run the same legs that gate a
  pull request or the project accepts the reduced coverage knowingly. `strategy-concurrent-work` cites, never
  restates. `review-orchestration-right-sizing`'s doctrine-home item is discharged by it.
- `integrate-work-unit.md` narrows "clearance never carries" to the overlapping base-merge arm.
- `DEV-RULES.ARC` § Review-Increment Invariant's fourth exception, "a typed safe base reconcile", is amended through
  package source so that "safe" means host-mergeable with the overlap disclosed and Tier 1 green, with the
  review-applicability judgment owed at the checkpoint and exact-head authorization still gating the merge. The merge
  commit is git-generated content the checkpoint approval already sees, so a separate stop before its push would be a
  stop with one answer (maintainer decision, 2026-09-09).

### D15. Fire-points this work unit marks

Each is a marked fire-point in a workflow this work unit edits, with `assess-evidence-applicability` declared in
that workflow's `arc.methods`, because a method a workflow needs but never marks silently never loads:

- `integrate-work-unit.md` — the Step 10 checkpoint drift arms, the review-status `base-moved` arm, and the
  host-refusal exit;
- `deliver-stack.md` — eligibility and the terminal classifier;
- `run-errand.md` — the Step 6 pre-release reads.

`verify-work-unit.md` and `prepare-work-unit.md` carry no fire-point: at the attest / convergence arm the verdict is
computed by the reducer from an approver-bound scope, so the method has nothing to judge there. Their edits are the
D12 action wording only. The review-fix disposition gate, where the scope is chosen, is the review cohort's seam.

## Alternatives & Rationale

- **Repository-scoped integration lane or queue (the original direction).** A claim in git refs or a host label,
  head-of-line, priority, an exclusive final-integration window. Rejected: it serializes a merge git already
  serializes, automates a re-check ARC has made too expensive rather than removing it, adds coordination state the
  storage evolution would later have to fold into a backend, and contradicts ADR-025's doctrine-over-mechanism
  posture. No queue in industry re-reviews; a queue would still pay ARC's judgment cost at the queue head. Merge
  queues remain a recorded non-goal in ADR-025, the delivery-stack `queue-not-atomic` downgrade, and the
  concurrent-work research note.
- **Proportionate base-movement policy (selected).** Distinguish disjoint from overlapping movement and let the host's
  mergeability settle what git can combine. This is what every non-strict host already does; ARC composes its own
  gates on top instead of adding a stricter currency rule.
- **Defer entirely to the host's signals.** Insufficient alone: the host cannot express overlap (only textual conflict
  or "behind") and ARC's own gates must know whether to run. The host read composes: where the host enforces strict
  currency, ARC's disjoint arm is moot and must observe that (D10).
- **Keep the policy, make the wait unattended.** Automating the reconcile loop preserves a cost with no safety return
  and still owes delivery rebuilds.
- **An ARC-side strictness key.** Rejected, recorded so it is not re-proposed: every mainstream host already exposes
  the "require branches to be up to date" knob, so an ARC key would be a second authority for one fact and
  speculative capability with no requesting team. The only condition that reopens this is a team without host branch
  protection asking for ARC-only strictness, and that team's answer is host protection.
- **A distinct terminal await verb before a green-only merge.** Dropped: its motivating failure is fixed (`4cff6d787`
  keeps checks waits locked and bounded) and no concrete pain remains.
- **Extending the verdict enum with a movement value.** Rejected in favor of the additive `movement` field: it
  preserves the recorded "raw distance controls the verdict" invariant and keeps unaware consumers fail-closed.
- **Widening the classifier's inert set.** Rejected: there is no shared completed index to protect (archives land in
  distinct per-work-unit directories), and the one shared ceremony surface (`ROADMAP`) is handled by the
  host-in-the-loop rule rather than by classification.
- **Rewriting the two D4 classifiers into one type.** Unsupported by any chartered goal and collides with
  `review-signal-convergence` building on them now; the envelope composes over their existing projections and the
  merger is captured for after that work unit lands.
- **A pre-push stop before the overlapping base merge.** Rejected by maintainer decision on 2026-09-09 in favor of
  amending what "safe" means in the Review-Increment Invariant's exception (D14): the merge commit is content the
  checkpoint approval already sees, so the stop would have one answer.
- **Carrying the approved scope through the disposition store.** Rejected: the reducer is a pure function over the
  Candidate record and must stay one; the one-field pass-through at the response writer is the smallest carrier.
- **Reusing the `verification-response` transition for `focused`.** Rejected: its guard requires an already-satisfied
  baseline and records a correction delta, the inverse of a same-subject bounded check.

**Grounding correction folded at this stage.** The draft had the conflict-resolution remedy name "the conflicting
paths from the host read". The host's `mergeable` boolean carries no per-path data (the checkpoint's own comment says
so); the remedy names the substantive overlap paths from the overlap read instead (D5). A local interface correction,
not a design change.

## Cross-cutting Considerations

**Trust boundaries.** Every carry is decided from ARC-observed Git facts plus a host fact admitted only when its
observed OIDs match ARC's own observation; a bare host boolean never unlocks anything. Exact-head merge authorization,
the integration interlock, the draft lock, and the append-only invariant are untouched. The approved-scope carry in
the lineage is bound to a disposition-set approval a person made; the agent's own `applicability` selection still
releases nothing, and the fail-closed default (`full`) applies to every record that lacks the field. The attest
verb and the record guard both refuse a narrower scope than approved.

**Load-bearing assumption.** Goal 3's proposal-side carrier, `proposedVerification`, is adopted by
`review-signal-convergence` as a forward amendment in its own task list (its worktree,
`tasks-review-signal-convergence.md`, Task 4.3) and has no record in this repository yet. If that adoption slips,
every transition reduces to `full` and Goal 3 never activates, with no safety exposure. This work unit therefore
proves its own half independently: criterion 7 is exercised with test-constructed transitions carrying
`approvedVerification`, not through the sibling's writer.

**Failure behavior.** Unavailable overlap → `unknown` → today's `unsafe-reconcile` stop. Unresolved or unbound host →
`host-pending / retry` after a bounded re-read, never an overlap remedy. Host conflict → conflict stop naming the
overlap paths. Host refusal at the merge → typed `invalidated / reconcile-base`, never a re-approval loop. Transport
failure → `operation-failed`, unchanged. An unexplained Candidate delta → fresh full verification, unchanged.

**Compatibility and migration.** ARC is pre-public-release: the `review-response` transition preimage and the
lineage attestation shape change in place, with no aliases or migration readers; development Candidate records
regenerate. The session-init `baseDistance` value schema admits `movement` (and validates that the not-applicable
arms carry none). The `review-applicability` v2 schema leaves the durable-record inventory with its module. Workflow,
method, rule, and strategy edits go through `packages/arc-framework/arc/**` and sync to `.arc/**`.

**Testing.** Unit: `movement` classification (all three values, evidence-completeness not required), the registry
(own artifacts, projections, relocations, `ROADMAP`, Errand checkout), envelope composition (host OID binding →
`unresolved`), the method's deterministic arms as a table, checkpoint dispatch over movement × host including the
bounded re-read, the pinned-merge port's status classification and `host-refused` split, the eligibility predicate
over all four relations, the two lifecycle comparators' merge-base arm for `regenerable` paths, the terminal
classifier's inert exclusion, the reducer's scope dispatch (`targeted` inherits satisfaction, including
after an attested `focused` response; absent field reduces to `full`; broadest pending scope wins), and the attest
verb's scope refusal. Integration: a checkpoint
and merge run against a fake host for each arm; a delivery eligibility run over a disjointly advanced base; a
pre-publication procedure run across `targeted`, `focused`, and `full`. Existing tests that assert
`unsafe-reconcile` on any substantive overlap, `base-moved` on any containment failure, or a Tier 3 after any
implementation change are updated to the new arms.

**Performance.** One additional `diff --name-only` pair at review status (already run at the checkpoint) and one host
`pulls/{n}` read per merge-offering path, with the bounded re-read capped at three; session init pays none. No new
fetches: the overlap axis reuses the observation each consumer already makes. If the Open Question resolves to the
`merge_commit_sha` binding, that costs one `commits/{sha}` read per host read, on the same paths.

**CI contract.** The disjoint arm relies on the pull-request check running on the host's test-merge ref (true for the
current CI workflow) and on base CI as the post-merge backstop. This repository's push-to-`main` CI runs lint,
typecheck, and unit only; integration, e2e, and portability are pull-request-only. Doctrine (D14) names what base CI
must cover; bringing this project's own `main` CI up to that contract is a project CI change captured separately.

**User-facing impact.** Ceremony disappears on the disjoint path: no base merge, no gate re-run, no recompose, no
re-approval, no delivery rebuild. On the overlapping path the operator sees one typed arm with the overlap disclosed.
A `targeted` review fix no longer costs a full suite; a `focused` one costs one bounded check.

**Delivery (delivery-plan candidate, not bound).** Three independently reviewable surfaces, in landing order:
A — base movement on the envelope (D4–D11): the relief; B — the registry, the method, doctrine, and the seams (D1–D3,
D14, D15); C — the verification instance and the ADR amendment (D12–D13). A depends on D1's registry and D2's overlap
and host axes; B and C are otherwise independent. Re-raise at the task-generation boundary read.

**Coordination.** Sequence edits to `integrate-work-unit.md` with `review-signal-convergence` (Step 3/4 regions and
every presentation site of the disposition set, including `prepare-work-unit.md`'s review-fix paragraph) and
`review-activity-contracts` (applicability step); this work unit edits Step 10, the drift arms, and the convergence
arm. Two asks to `review-signal-convergence` stand: consume applicability only through the public verbs, never
classifier internals, because the envelope composes beneath them; and adopt the method's output vocabulary so its
coverage-basis language matches. One ordering constraint runs one way: the transition schema is strict, so the
sibling's writer can emit `approvedVerification` only after this work unit's schema field lands; until then it omits
the field and every consumer reduces to `full`. This work unit has no ordering constraint on the sibling. At planning
close, the seven captures the draft's coordination note enumerates — the review-lane doctrine sentence, the narrowed
`delivery-authoring-rebuild` boundary, the `baseContained` ownership notice, the push-to-`main` CI gap, the method
signature to the two review work units, the D4 classifier merger, and the orphaned cohort reference — route via
`USER-INBOX`.

## Success Criteria

The field outcome — verified work units publishing and integrating concurrently while Errands land throughout, with
no session pausing for another — is the goal. The criteria below are its checkable derivatives, validated at
completion.

1. An integrating singleton work unit whose base advanced only disjointly, on a host reporting it mergeable, reaches
   `ready / request-approval` with zero reconcile commits and zero re-judgments; the ready surface names the movement
   and host fact.
2. One whose base advanced with overlap, or whose host refuses, takes the typed base-merge arm once, then one fresh
   checkpoint and one fresh approval — no cycle, and no manual stop short of a real conflict.
3. `arc integrate merge` never folds a host refusal into `operation-failed`: with `behind > 0` it returns
   `invalidated / reconcile-base` with the expected base and head; with `behind == 0` it returns
   `blocked / host-refused` carrying the host's detail. An Errand lane's refused merge with `behind > 0` reaches the
   typed base-merge arm rather than the same read again.
4. A delivery whose bottom member's observed protected base advanced disjointly — including by a sibling ship that
   regenerated the project readiness document — is eligible with its recorded `coordinates.base` and the persisted
   target unchanged, and no rebuild is owed; the terminal classifier never refuses on inert-only overlap.
   Overlapping movement still refuses `wrong-predecessor`.
5. `arc review status` returns `base-moved` only for overlapping or unknown movement.
6. `movement: unknown`, an unresolved host, or a host OID mismatch never produces a carry on any path.
7. Over test-constructed Candidate records: a `review-response` with `approvedVerification: targeted` leaves
   `convergenceVerification` satisfied on its own Tier 1 evidence, including when it follows a `focused` response
   closed by an attestation; `focused` is pending until a lineage attestation with `scope: focused` covers the
   subject, and `arc attest --scope focused` is refused when `convergenceScope` is `full`; `full` and an unexplained
   delta still root fresh; a transition lacking the field behaves as `full`.
8. `core/applicability.ts`, its inventory row, and its tests are gone; the `applicabilityId` field consumers are
   untouched and the schema-registration test passes.
9. The base-drift analyzer's verdict tests are unchanged; the `movement` field is present on every healthy reading
   and absent on the not-applicable arms.
10. The method file ships and every fire-point in D15 is marked; the three workflows declare it.
11. Doctrine reads as D14 states, the Review-Increment Invariant's fourth exception carries the amended meaning in
    package source and `.arc/`, and ADR-034 carries the dated Tier 2 annotation.
12. Quality gates: the full suite, both type checks, and Markdown lint are green; the ARC contract checks pass.

## Open Questions

- Whether the pull-request payload's `base.sha` tracks the base tip the host used for its last mergeability
  computation is a host contract to confirm against live responses during implementation. If it lags, binding on it
  would exhaust the re-read bound on every disjoint case and leave the relief arm dead; the fallback binding is the
  test-merge commit the host exposes (`merge_commit_sha`), whose parents are the exact head and base tip it merged.
  Either binding satisfies D5's contract, and D6's typed host refusal is the safety backstop under both.
- The exact HTTP status set the pinned-merge port classifies as host refusal is confirmed against the host's live
  responses during implementation (the `405` / `409` split above is the documented contract; a `422` for a
  protection refusal, if observed, joins `405`). Implementation detail, not design.
- Where the bounded host re-read's spacing lives (a constant beside the merge verb's existing checks-wait bound) is
  an implementation choice.

---
