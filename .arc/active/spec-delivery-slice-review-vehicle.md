# Spec (`outline`): delivery-slice-review-vehicle

- **Origin:** [internal]

- **Purpose:** Admit an independently landable delivery slice into the existing exact-head review lifecycle as a
  typed, parent-bound vehicle — authenticated against the shipped delivery state contract rather than by branch
  naming — so a reviewed member can be reviewed locally and released for merge without forging a work-unit or
  Errand identity.

---

## Problem / Context

A manually cut delivery slice passed local and hosted CI, hosted review, and thread settlement at one exact head,
yet its readiness evaluation refused with `vehicle-branch-mismatch`. The slice branch intentionally carried
neither the canonical work-unit slug nor independent lifecycle metadata, while the review vehicle schema admitted
only work units and Errands.

Branch protection correctly prevented an administrative shortcut. Without a typed slice vehicle, reviewed delivery
members cannot clear the checks that gate merge, and every stack must choose between weakened protection and
forged identity.

**What the vehicle must reach has changed since the refusal was observed.** `merge-readiness-control` replaced the
`arc-cleared` required-status gate with a draft-first pull-request lifecycle (`merge.lock` plus the `arc merge
lock` verbs), and `clearance-corpus-retirement` then deleted the installable clearance workflow and its merge-gate
template. There is consequently no dispatch surface that composes a vehicle from a webhook payload. The live
consumers of a vehicle are `arc review readiness`, `arc merge lock release` (which gates lock release on the
readiness result), and the local review lane's prepare/attest boundary. The original refusal remains the
motivating fact; the mechanism it blocked is now lock release rather than status publication.

Both upstream contracts have shipped. `delivery-plan-record` supplies authoritative plan and member identity
(`DeliveryStateV1`) together with the reverse lookup from a member ref to its owning plan, member, and work unit;
`merge-readiness-control` supplies the draft-first merge lock a member pull request opens under.
`delivery-stack-topology` consumes this work unit for member review admission and cannot reach cohort closeout
without it.

## Decision(s)

### D1 — A third member of the review vehicle unions

Three vehicle unions exist in the review gate, and all three gain a `delivery-member` variant peer to `work-unit`
and `errand`:

- `ReviewVehicleSchema` in `readiness.ts` — the readiness/merge-lock union carrying the asserted identity (D2);
- the operation-state vehicle union in `operation-state-schema.ts` — so a local review operation over a member is
  representable and resumable;
- the hand-written `LocalReviewAuthority["vehicle"]` union in `core/local-review-authority.ts` — the shape the
  local host populates and writes into `LocalReviewState.vehicle`.

The third is easy to miss and is load-bearing: without it the local lane (D7) cannot produce a member operation
at all.

We choose the general-schema union over an admission path behind the delivery substrate because every variant of
that alternative either re-presents an identity the gate already admits (forged identity), delegates admission to
delivery (delivery-authored review authority, forbidden by the cohort contract), or mints a parallel admission
path (a second review system, a cohort non-goal).

### D2 — The vehicle asserts plan, member, and owning work unit; the head arrives independently

The readiness variant carries `kind`, `planId`, `deliverableId`, and `workUnitSlug`. It does **not** carry a base.

Every field earns its place by a readiness check that consumes it. The exact head is already supplied twice, by
`target.headSha` and by the live `pullRequest.headSha`, and the existing `stale-head` fact reconciles them — so the
vehicle restating it would add no check. A base field cannot be checked the same way: readiness receives no
independently observed base, so the only available comparison is the vehicle's asserted base against delivery
state's recorded base — two values authored by the same side. That comparison is either trivially true, or it fails
because the member's base legitimately moved during suffix reconciliation, which is review refusing for a
delivery-internal reason. Unexpected base movement is caught by `delivery-stack-topology`'s reobserve-and-refuse
cycle, where the cohort's robustness floor already places it.

This narrows the draft's stated "exact base and head" binding by applying the draft's own field-justification rule.

The three asserted fields are the caller's **claim** about what is under review; readiness authenticates the claim.
A degenerate alternative — a bare `{ kind: "delivery-member" }` that lets readiness derive identity entirely from
the head — was rejected: with nothing asserted there is nothing to authenticate, any head bound in any plan would
admit, and the readiness envelope (which echoes the vehicle at `payload.vehicle`) would record no member identity.

The operation-state variant follows that union's existing `{ kind, identity }` shape, carrying the member's
`deliverableId` as `identity`; the canonical digest form satisfies that union's identifier pattern unchanged.

### D3 — Authentication by delivery-state reverse lookup, replacing the branch-slug check

The existing branch-encodes-slug check cannot apply: a member branch carries no slug by design, and branch naming
is presentation only. `identityFacts` currently runs `branchToWorkUnitSlug(headBranch) !== vehicle.slug`
unconditionally; it is scoped to the slug-bearing kinds (`work-unit`, `errand`), which is also a mechanical
requirement once the union admits a variant with no `slug` field. `errand-branch-mismatch` stays errand-only.
`pull-request-mismatch`, `pull-request-closed`, and `stale-head` are vehicle-agnostic and carry over unchanged.

In their place, readiness resolves the pull request's exact head through the delivery contract and compares the
resolution against the vehicle's assertion. New facts:

| Code                         | Condition                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `delivery-state-unavailable` | The lookup failed or returned an ambiguous match — fail closed.               |
| `delivery-member-unbound`    | The exact head is bound to no delivery member.                                |
| `delivery-member-mismatch`   | A resolved plan, member, or work unit disagrees with the vehicle's assertion. |
| `delivery-member-terminal`   | The bound member is the plan's final member (see D4).                         |

A mismatch emits one fact per disagreeing field, each carrying its own `path` (`vehicle.planId`,
`vehicle.deliverableId`, `vehicle.workUnitSlug`), so a refusal names what disagreed.

The lookup's optional `owningUnit` ownership hint is **not** passed. Readiness compares the resolution itself, so
refusal vocabulary stays readiness-owned rather than surfacing as a store failure.

### D4 — Non-final members only, enforced at admission

The kind serves non-final members. In a stack the final member carries the work unit's lifecycle tail and completes
the work unit; it is the work unit's own terminal change and admits under the existing `work-unit` vehicle
unchanged. The uniform alternative was rejected in drafting: the final/non-final distinction already exists in the
stack contract, and a terminal member vehicle would have to duplicate or drop the work-unit lifecycle facts.

Readiness **enforces** the boundary rather than trusting the caller's `kind`. Because a terminal member's head is
also bound in delivery state, an unenforced boundary would let a work unit present its terminal pull request as a
delivery member and skip meta-presence, completion-notes, release-notes, archive-candidate, and cohort-closeout
readiness entirely — a concrete authority bypass in the supported path. A resolved member that is the plan's final
member refuses with `delivery-member-terminal`. The local lane applies the same rule (D7).

**The terminal member's own admission is a constraint on the consumer, not a property this work unit can
establish.** Closing the `delivery-member` door on the terminal member leaves the `work-unit` vehicle as the only
door for the last pull request in a stack, and that vehicle admits only when
`branchToWorkUnitSlug(headBranch)` equals the vehicle slug — plus, under `manual` cadence, when the active meta's
`Branch:` equals the pull-request head branch. Delivery refs are plan-owned projections whose naming
`delivery-stack-topology` leaves open, so if the terminal member's pull request were opened from a delivery ref it
would refuse with `vehicle-branch-mismatch` — the exact refusal this work unit removes — and no vehicle would
admit the last pull request of any stack.

This work unit therefore records a **named constraint on `delivery-stack-topology`**: the terminal member's pull
request head is the retained work-unit control branch, and the owning work unit's meta `Branch:` matches it. The
constraint is on ref materialization, not on the vehicle contract, and the cohort's closeout criterion — that a
work unit can review _each_ member through the existing exact-head lifecycle — depends on it holding. It is
routed to that work unit rather than assumed silently here.

### D5 — Work-unit lifecycle readiness does not apply to this kind

The meta-presence, archive-candidate, and cohort-closeout facts that govern a `work-unit` vehicle do not run for a
`delivery-member`: a member pull request excludes lifecycle artifacts by design. This absence is what the distinct
kind buys — the vehicle adds identity checks, not lifecycle ones. Tree-root resolution still runs, matching the
`errand` arm's shape, so an unusable supplied root refuses consistently across kinds.

**Archival cadence does not apply to this kind.** The `archive.cadence` project setting projects into the
`work-unit` vehicle's `archiveCadence` field, which selects between the archived arm (`with-integration` — a
Shipped meta under `.arc/completed`) and the manual arm (an Integrating meta under `.arc/active`). Neither arm
runs for a `delivery-member`, so the variant does not carry the field.

Cadence still governs the **terminal** member, which reviews under `work-unit` and inherits the configured value
unchanged. Since non-final members exclude lifecycle artifacts by design, the whole cadence requirement lands on
the last pull request in the stack — which is what an unenforced terminal boundary (D4) would let a work unit
dodge, under either cadence value.

### D6 — One narrow injected lookup port

`ReviewReadinessDependencies` gains a delivery lookup alongside `fs`, exposing a single method that takes the exact
member head and returns the owning plan, member, and work unit, the member's recorded coordinates, and whether the
member is the plan's final one — or a typed unavailability. One method keeps readiness's widened authority surface
to exactly one call and keeps review from re-modelling delivery; test substitution follows the established `fs`
pattern.

The default implementation wraps the shipped `RepositoryDeliveryStateStore` **alone**. The plan store is not
needed: `resolveMember` already returns the whole `DeliveryStateV1`, and state members are plan-ordered — the
delivery module enforces exact ordered equality between `state.members` and `plan.members` deliverable ids
(refusing `member-sequence-mismatch` otherwise) and constructs initial state by mapping plan members in order. The
plan's final member is therefore the last element of `state.members`, and reading the plan to learn it would buy
nothing while introducing a real hazard: the plan store returns the _current_ plan, whereas state binds one exact
revision by digest, so a plan published ahead of its state rebinding would answer the terminal question against a
plan the state is not bound to.

This relies on one stated invariant — **`state.members` is plan-ordered** — which the delivery module maintains
rather than merely happening to satisfy. The spec depends on it explicitly rather than silently.

The port binds to the **repository resolved by the composition root** — the root the readiness handler already
resolves and passes to its adapter, and the injected `cwd` on the local lane — never to `request.treeRoot` and
never to a module-internal read of the process working directory. Every local-lane store is constructed from an
explicitly injected cwd, so a `process.cwd()` read inside the port would ignore the checkout the rest of the lane
is bound to and would defeat the test-substitution pattern `fs` already establishes. Delivery state is
Git-common-directory state rather than a tree product, and the supplied tree is untrusted by construction, which
the readiness module's existing posture already assumes.

The local lane consumes the same port for its member authentication and target derivation (D7), so there is one
delivery read in the review gate, not two.

### D7 — The local lane admits a member named at the owning work unit's control locus

Local review of a delivery member runs from the **owning work unit's retained control locus**, not from a member
checkout. `delivery-stack-topology` establishes this: member refs are plan-owned projections rather than durable
authoring surfaces, authoring and review-driven fixes land on the retained control branch, and mid-delivery handoff
resumes the owning work unit at its control locus with no per-member session-locus record.

That settles what looked like the hard problem. At the control locus the owning work unit's meta is present, so
`readActiveMetaCandidates` resolves it exactly as it does today, and assurance composes through
`composeWorkUnitReviewAssurance` **unchanged** — a member's review assurance _is_ the owning work unit's
`workClass` and `reviewRubric`, which are the only two meta fields that composition consumes. There is no new
rubric model, no new guidance surface, and no cross-checkout or by-branch-name meta read.

What is genuinely missing is **selection**, and it reaches further than prepare. The control branch resolves to
the work unit, so the member under review cannot be inferred from the checkout; the operator names it. Three
things follow, and each is settled here rather than left to task generation.

**The selector is the member's exact head object id.** The delivery member selector admits only a head object id
or a ref plus its observed head — both head-keyed — so no other operator-facing coordinate reaches the D6 port
without either a second lookup shape or a delivery read outside the port, both of which this design excludes. The
caller supplies the head, which the member-review callsite already holds: it is the ref it just pushed or opened
(D8). Naming the coordinate this way keeps the port head-keyed and adds no verb surface.

**Member selection is a property of the operation, carried to every site that re-derives authority.** The local
lane re-resolves authority through one shared adapter used by prepare, attest, and respond, and compares the
result against persisted state — attest refuses on a vehicle mismatch, and re-entrant admission (a comparison
inside prepare, not a separate resolution) refuses on an operation-key mismatch. A selector honored only at
prepare would therefore produce an operation that can be prepared and never attested. The selector is
consequently carried on the operation and supplied wherever that adapter runs. Assurance dispatch, which today
branches on `work-unit` and treats everything else as an Errand, routes `delivery-member` to the **work-unit**
arm; left unrouted it would compose an Errand assurance with no work class, the opposite of this decision's
intent. Routing it there also keeps the guidance digest stable between prepare and attest, which reach the same
composition.

With those settled, the lane's behavior is:

- with no selector, resolution, target derivation, and assurance are unchanged and yield a `work-unit` or `errand`
  vehicle exactly as today;
- with a selector, the named head is authenticated through the D6 port, and the resolution's `workUnitId` must
  equal the identity of the work unit resolved at the control locus — a member of another work unit's plan is
  refused, never adopted;
- a named member that resolves as the plan's final member is refused, applying D4 uniformly across lanes;
- `authorIdentity` remains the owning work unit's `owner` validated against the active identity, so actor
  separation between author, evaluator, and runtime is unchanged.

The existing `vehicle-unresolved` refusal — raised when a work unit and an Errand are both absent or both present
— keeps its current meaning for the no-selector path.

**A member's review target composes from the coordinates delivery already records.** `baseRef` carries the
configured base, and drift detection stays with the authentication this lane already runs rather than with target
staleness:

- **Five of the six target fields have a delivery or local source.** The D6 port supplies the member's recorded
  head and base commits, filling `headSha` and `diffBaseSha`; `headTree` and `diffBaseTree` are local `rev-parse`
  reads over those two commits; `repositoryId` is the composition root's, as today. Only `baseRef` has no delivery
  source.
- **`baseRef` is filled with the configured base ref** — `branch.base`, the base the stack lands to. Outside
  derivation itself every consumer of the field compares or copies it: it is one of the identity-bearing fields in
  the target-id preimage, and the carrier snapshot equality, fix authorization, and lifecycle-tail proof all read
  it that way. A deterministic, resolvable value satisfies them all, and exactness rides the shas. The
  kind-conditional invariant this creates is recorded rather than left to the field name: **for a member target,
  `diffBaseSha` is the member's recorded base — its predecessor's head — not the merge base of `HEAD` and
  `baseRef`.**
- **No member ref is consumed anywhere in the lane.** The target carries commits and trees, never a member ref,
  which dissolves the coupling to `delivery-stack-topology`'s open ref naming: ref name and namespace stay that
  work unit's free choice, and this work unit routes an **informational** note rather than a constraint. The
  predecessor-ref alternative was rejected — it would have constrained naming, namespace (derivation admits
  `refs/heads/` only), and binding non-nullability at successor-review time, three couplings for a label whose
  identity contribution the shas already supply.
- **Derivation parameterizes by base and head revisions**, defaulting to the configured base and `HEAD`. The
  shipped derivation hardcodes both, so parameterization is mandatory infrastructure for any member formulation
  rather than one option among several; the member path feeds it the recorded shas. Object-existence checks are
  retained on both paths. **The worktree-cleanliness guard is scoped to the inputs that read the worktree** — it
  exists because the ordinary path derives from `HEAD` and the working tree, and a member target derives from
  neither. Retaining it uniformly would refuse the supported path for an unrelated reason: the control locus is
  where authoring and review-driven fixes land, so an uncommitted edit is the normal state there, and a member
  already pushed would be unreviewable while its successor is being written. Nothing is lost — the evaluator's
  materialization checks cleanliness of the detached worktree it creates at the pinned head, which is the
  cleanliness the review actually depends on.
- **The target carries its own kind, and confirmation branches on it.** The review target gains a
  `delivery-member` kind alongside `change-set`, and confirmation verifies a member target's objects rather than
  re-deriving it. All five verbs consume one injected confirm port — attest, resume, respond, and reduce delegate
  to prepare's — and confirmation re-derives from the carried target rather than from fresh configuration. Without
  a discriminator a member target is indistinguishable from an ordinary one by inspection (same `baseRef` value,
  same kind), so confirm would re-derive against the control branch's `HEAD` and refuse `stale-target` on every
  member operation. Widening the existing `kind` literal costs one schema line and one branch, leaves ordinary
  targets' identity byte-identical, and — the deciding reason — makes the kind-conditional `diffBaseSha`
  semantics below **declared** rather than a hidden property two competent readers could miss. The alternative
  considered was threading the operation's vehicle context through the confirm port's signature; it was rejected
  as the larger change (the port is declared across five dependency interfaces) that leaves the invariant
  undeclared.
- **`stale-target` keeps one semantics.** For a member, confirmation verifies that the pinned coordinates still
  resolve; it does not re-derive, so it does not manufacture a member-specific staleness meaning. **Binding drift
  is caught at admission, not at confirmation.** The D6-port authentication runs wherever authority is
  re-resolved — prepare and attest — and again at readiness when the merge lock is released
  (`delivery-member-unbound`, `delivery-member-mismatch`). Resume and reduce re-confirm the target but do not
  re-resolve authority, so they operate on the head the operation was prepared against. That is deliberate and
  consistent with this spec's exact-head evidence rule: an operation reviews the head it was admitted for, and a
  rebased or rebound member is a new head that must be admitted again.
- **Lane boundaries hold unchanged.** The evaluator's source materialization consumes the pinned exact head
  without re-deriving a target, so it serves member targets as-is. Frontline self-review remains the no-selector
  path over the work unit's own change set; member review does not run it.

### D8 — Vehicle composition callsites stay with the consumer

With the clearance workflow and its template retired, a vehicle reaches the CLI only as JSON on stdin, composed by
workflow prose at the callsite that owns the operation. This work unit ships the **contract** — the schema, the
authentication, the facts, the port — and no new host surface: no workflow file, no dispatch payload, no template,
no permission.

The member-review callsite belongs to `delivery-stack-topology`, whose draft already reserves the workflow prose
that names the member-review step. Composing it here would place a delivery execution step in the review seam,
which the cohort's boundary assigns to the consumer.

## Scope boundary (No-gos)

Carried from the draft as scope armor for every review pass over this work — adversarial review, pre-implementation
audit, and code review alike. Per the cohort's hardening-admission boundary, a finding is blocking only when it
demonstrates a concrete failure, authority violation, or unsafe ambiguity in the supported path. A proposal that
crosses one of the lines below is a scope change to be accepted through a design amendment — never a required fix
promoted silently. "More robust," "more general," and hypothetical future hosts, storage tiers, or review models
are not admission on their own.

- **No delivery-authored review authority.** The review router stays authoritative for obligation, applicability,
  findings, and clearance; the vehicle is an identity the router admits, never a verdict source.
- **No review-shaped records in delivery, no delivery-shaped records in review** beyond the vehicle's own fields.
  In particular, nothing resurrected from the pre-cut plan-record design: no assignment/observation/assurance
  stores, no assurance-subject identities, no review-routing payloads.
- **No evidence machinery.** No receipts, ledgers, invalidation records, or coverage projections — exact-head
  binding plus existing review applicability is the entire mechanism.
- **No landing semantics in review admission.** Predecessor order, stack eligibility, and landing guards stay in
  `delivery-stack-topology`; the vehicle authenticates identity at an exact head only.
- **No change to `work-unit` or `errand` vehicle semantics** — not widened, not parameterized, not shared-field
  refactored beyond what adding a union member mechanically requires. The branch-check scoping in D3 and the
  optional selector in D7 are exactly that mechanical requirement: with no selector supplied, both lanes behave
  as they do today. D7's derivation parameterization and target-kind widening are held to the same standard — an
  ordinary target keeps its `change-set` kind, its byte-identical id, and today's derivation and confirmation.
- **No new rubric, guidance, or assurance model for members.** A member's assurance is the owning work unit's,
  composed by the existing function from the existing two fields (D7).
- **No aggregate or terminal review pass, review groups, or request-cardinality mechanics** — that pressure routes
  to `delivery-review-cardinality`'s own activation threshold, not here.
- **No contact with the review protocol chain** (convergence, source authority, activity/request contracts) —
  those surfaces are pending right-sizing and this work unit must not deepen them.
- **No new stores, verbs, host surfaces, or workflow prose** beyond the readiness branch, the narrow delivery
  read, the local-lane selector threaded to the existing authority-resolution sites, the target-derivation
  parameterization and target-kind widening D7 settles, and the existing merge-lock release path. No revival of
  any retired clearance install surface (D8). In particular, no member-enumeration or plan-listing command: the
  selector is a head the caller already holds (D7).
- **No member-checkout review path.** Local member review is supported from the owning work unit's control locus
  only, per `delivery-stack-topology`'s ref and session boundaries.

## Consequences & Risks

- **Delivery state is clone-local, so member readiness is too.** The delivery stores persist under the
  repository's Git **common directory**, not the tracked tree and not the host — so the record exists only in the
  clone (and its worktrees) where the plan was bound. A member therefore evaluates `ready` only there; a second
  machine or a fresh clone of the same repository resolves no member and refuses `delivery-member-unbound`. The
  authentication that D3 substitutes for branch naming is consequently an authentication against a store the
  author's own clone writes. This does not break the supported path as chartered — one operator at the owning
  work unit's control locus — but it is load-bearing and easy to misread from the phrase "repository-common", so
  it is stated rather than left implicit.
- **Readiness stops being tree-only.** Its module contract today is that it reads only lifecycle products beneath
  the supplied root and infers nothing from the caller's checkout or refs. The delivery lookup is a second,
  narrow authority source outside that root, and the module's documented posture must be updated to say so rather
  than left contradicting the code. Accepted: the draft anticipated a narrow read of the shipped state contract,
  and D6 confines it to one method against repository-common state.
- **Evidence cannot authorize a later head or member.** This falls out of exact-head binding — evidence attaches to
  one exact head, and a rebased or advanced member is a new head with no clearance. No invalidation machinery is
  built; existing review applicability decides whether prior coverage carries after a rewrite.
- **A retarget at an unchanged head is not caught by review admission.** Dropping the base field (D2) means a
  member pull request retargeted to a different base at the same head still authenticates, while the change set
  under review shifts. Accepted: this is unexpected target movement, which `delivery-stack-topology`'s
  reobserve-and-refuse cycle owns under the cohort's v1 robustness floor.
- **The terminal check depends on a delivery-module invariant.** D4's enforcement reads the last element of
  `state.members`, which is the plan's final member only because the delivery module keeps state plan-ordered.
  Accepted, and stated in D6 rather than assumed: the alternative — reading the current plan — is both
  unnecessary and less safe, because state binds one exact plan revision by digest while the plan store returns
  the current one.
- **The terminal member's admission is a constraint this work unit does not enforce.** D4 records it as a named
  constraint on `delivery-stack-topology` (terminal pull request opened from the retained control branch, meta
  `Branch:` matching) and routes it there. If that constraint is not honored when delivery ref naming is settled,
  the last pull request of every stack refuses with `vehicle-branch-mismatch` and no vehicle admits it. Recorded
  and routed, not assumed silently.
- **Local member review depends on the control-locus assumption.** If a future projection lets an operator review
  a member from a member checkout, D7's resolution path does not serve it — the meta would be absent there. This
  is recorded as a bounded assumption grounded in `delivery-stack-topology`'s stated boundaries, not an
  invariant this work unit enforces.
- **The local lane's selector reaches past prepare.** Authority is re-resolved at prepare and at attest, respond
  reaches the same resolution for actor identities, and re-entrant admission compares the persisted vehicle
  against a fresh admission inside prepare. A selector honored only at prepare therefore yields an operation that
  can be prepared and never attested. Accepted: the re-resolution is the lane's integrity mechanism, so the
  selector must satisfy it rather than bypass it.
- **The review target's schema changes, and it is a registered contract.** `ReviewTargetSchema` and its id
  preimage are registered at version 2 under a `strict-current` migration posture, so widening the `kind` literal
  is a contract change rather than an additive one. Accepted under the pre-public-release posture: ordinary
  targets keep byte-identical ids because their `kind` value is unchanged, and no consumer branches on the
  literal today. The alternative — leaving the target opaque and threading vehicle context through the confirm
  port — was rejected in D7 as the larger change that also leaves the `diffBaseSha` invariant undeclared.
- **A member target's `diffBaseSha` is not a merge base.** For member targets the field carries the member's
  recorded base — its predecessor's head — while `baseRef` carries the configured base the stack lands to. The two
  are consistent by construction on the ordinary path and deliberately decoupled on the member path. The target's
  own kind declares which reading applies, so a consumer inferring merge-base semantics from the field name is
  contradicted by the record rather than by convention alone.
- **Resume and reduce do not re-resolve authority, so they cannot catch binding drift.** Both re-confirm the
  target; neither re-resolves authority, and a member's confirmation verifies pinned coordinates rather than
  re-deriving. A member rebased or unbound after prepare therefore resumes and reduces against the head it was
  admitted for. Accepted rather than closed: that is the exact-head evidence rule working, and admission
  (prepare, attest) plus readiness at merge-lock release re-authenticate the binding. Recorded because the
  work-unit path gets an incidental drift signal here — its confirmation re-derives from `HEAD` — and the member
  path deliberately does not.
- **Storage forward-compatibility is preserved, not merely unharmed.** The delivery read reaches its data through
  the `DeliveryPlanStore` / `DeliveryStateStore` interfaces, with the repository-backed classes as one
  implementation — so it satisfies the storage strategy's treat-storage-as-an-abstraction principle rather than
  baking in an in-repo assumption. Because D5 runs no lifecycle arm and D7 reuses the control locus's existing
  meta read, the member paths inherit **no** new tree-coupled reads. The storage-coupled surface remains the
  `work-unit` arm's direct reads of `.arc/completed` and `.arc/active/meta-*`, which is pre-existing and outside
  this work unit; this change must not extend it, and does not.
- **The stricter contracts stay strict.** `work-unit` and `errand` vehicle semantics are untouched; nothing widens
  to fit an identity it does not model.

## Success Criteria

1. A `delivery-member` vehicle whose asserted `planId`, `deliverableId`, and `workUnitSlug` match the delivery
   state resolution for the pull request's exact live head evaluates `ready`, with no work-unit lifecycle artifact
   present in the supplied tree.
2. The same vehicle presented against a head bound to no delivery member refuses with `delivery-member-unbound`;
   an asserted field disagreeing with the resolution refuses with `delivery-member-mismatch` naming that field's
   path; an unavailable or ambiguous lookup refuses with `delivery-state-unavailable`.
3. A vehicle naming the plan's final member refuses with `delivery-member-terminal` in both lanes, and the same
   change presented under a `work-unit` vehicle is evaluated by the unchanged work-unit path.
4. A `delivery-member` vehicle is never refused with `vehicle-branch-mismatch` regardless of head branch name,
   while the existing work-unit and Errand readiness tests continue to pass with unchanged expectations.
5. `releaseMergeLock` admits a `delivery-member` vehicle and gates it on the readiness result, with no edit to
   `merge-lock.ts`.
6. Local prepare invoked at the owning work unit's control locus with a member selector produces a review state
   carrying the `delivery-member` vehicle, with assurance composed from the owning work unit's `workClass` and
   `reviewRubric` by the existing composition function — not the Errand arm.
7. A member operation prepared with a selector can be attested: authority re-resolution at attest and at
   re-entrant admission derives the same `delivery-member` vehicle as the persisted state, so neither the
   vehicle-mismatch nor the operation-key-mismatch refusal fires on the supported path.
8. A member operation's target carries the `delivery-member` kind, the member's recorded head and base as
   `headSha` and `diffBaseSha`, the trees resolved from those two commits, and the configured base ref as
   `baseRef`; confirmation at prepare, attest, resume, respond, and reduce returns `current` for that target while
   the control locus's `HEAD` remains the control branch and its worktree is dirty. An ordinary target's kind,
   id, derivation, and confirmation are unchanged.
9. A member whose binding has drifted — rebased, rebound, or unbound — is refused at admission by the delivery
   authentication (`delivery-member-unbound` or `delivery-member-mismatch`) and again at merge-lock release, not
   by `stale-target`; a missing object still refuses on the member path.
10. Local prepare invoked with no selector produces exactly the vehicle, target, and assurance it produces today,
    for both a work-unit and an Errand context.
11. Local prepare refuses a selector whose bound head resolves to a work unit other than the one resolved at the
    control locus, and refuses a selector naming the plan's final member.
12. No workflow file, dispatch payload, template, or host permission is added or revived by this work unit.
13. The readiness module's documented contract states the delivery read and its repository binding.
14. Tier 3 quality gates pass.

## Open items

- The exact ordering of the delivery authentication relative to tree-root resolution — behaviourally equivalent
  because neither reads the other's inputs, settled during implementation for diagnostic clarity.
- How the member selector reaches the authority resolution at prepare and attest — as an added parameter on the
  existing resolution dependency, or as operation context those sites already receive. A structural choice within
  D7's settled rule that both derive the same vehicle, not a question about what they derive.
