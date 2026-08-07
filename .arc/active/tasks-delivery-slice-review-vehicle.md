# Task List: Delivery Slice Review Vehicle

- **Design:** `spec-delivery-slice-review-vehicle.md`

---

## **Phase 1:** Delivery member lookup port

_Purpose:_ Establish the one narrow, injectable read of delivery state that answers member identity and finality
at an exact head. Both lanes authenticate against this single port, so it lands before either consumer.

_Design decisions:_ The default implementation wraps the delivery state store alone — never the plan store —
because state binds one exact plan revision by digest while the plan store returns the current plan. Finality
reads the last element of the state's plan-ordered member list.

### `[x]` **1.1 Delivery member lookup port contract**

- _Goal:_ Review has one storage-agnostic way to ask what delivery member a given head is, so the readiness lane
  and the local lane authenticate through a single injectable seam instead of re-modelling delivery twice.

- _Outcome:_ `core/delivery-member-lookup.ts` declares `DeliveryMemberLookup.resolveMemberByHead`, returning a
  three-state `DeliveryMemberLookupResult` — `resolved` with the owning plan, deliverable, work unit, recorded
  base and head, and a final-member flag; `unbound`; or `unavailable`. The port is total: no throw reaches a
  caller, and `unbound` never collapses into `unavailable`. Identifiers are plain strings rather than delivery's
  branded digests, so the review core stays free of delivery-module types; the ownership hint the underlying
  store accepts is deliberately absent from the contract. The core/adapter split mirrors the lane's existing
  `local-review-authority` pair, so the adapter lands beside the Git-common-state boundary it is built from.

### `[x]` **1.2 Repository-backed default lookup implementation**

- _Goal:_ A caller holding a repository root gets real member resolutions, and every way the underlying store
  can fail arrives as a closed, non-throwing unavailability.

    - `[x]` **1.2.a Resolve a member from repository-common delivery state**

        - `RepositoryDeliveryMemberLookup` selects by exact head through `RepositoryDeliveryStateStore`, then
          reads the matched member's recorded base and head off the returned state and marks the list's last
          member final. The selector already skips members holding no coordinates, so the type-required
          coordinate fallback is unreachable and folds into the port's totality rather than guarding a case.

    - `[x]` **1.2.b Map every store failure onto the port's closed unavailability**

        - Typed refusals — ambiguous match, malformed record, corrupt namespace, identity mismatch — map to
          `unavailable`, and a `try`/`catch` around the store call contains the two failures it does not return:
          the snapshot read's I/O errors and the throw raised when the state namespace resolves outside a
          repository.

    - `[x]` **1.2.c Bind the store to an explicitly injected working directory**

        - The publisher is constructed from the supplied root, so two ports over different repositories resolve
          independently and neither reads the process working directory.

- _Outcome:_ `hosts/local/delivery-member-lookup.ts` supplies the port's only implementation, wrapping the
  delivery state store alone — no plan read, so the terminal answer stays with the state revision the record is
  bound to. Coverage is one integration suite over real repository-common state
  (`review-delivery-member-lookup.test.ts`), which is where the store's own failure modes are reachable at all:
  the namespace and permission faults have no faithful unit-tier form.

---

## **Phase 2:** Readiness admission for delivery members

_Purpose:_ Admit a `delivery-member` vehicle into exact-head readiness, authenticated by delivery-state reverse
lookup rather than branch naming, with no work-unit lifecycle arm — the refusal this work unit exists to remove.

_Design decisions:_ The vehicle asserts plan, member, and owning work unit only; the head arrives independently
and no base is asserted. The terminal boundary is enforced rather than trusted, because a terminal member's head
is also bound in delivery state. This work unit adds no host surface — the vehicle reaches the CLI as JSON on
stdin, composed by the consuming callsite.

### `[x]` **2.1 Admit the `delivery-member` variant and scope the branch-slug check to slug-bearing kinds**

- _Goal:_ A readiness request can name a delivery member by plan, deliverable, and owning work unit, and the
  branch-encodes-slug check stops applying to a vehicle that carries no slug by design.

    - `[x]` **2.1.a Add the variant to the readiness vehicle union**

        - `ReviewVehicleSchema` gains a third `strictObject` carrying `kind`, `planId`, `deliverableId`, and
          `workUnitSlug`; strictness is what rejects a base or an archive-cadence field.
        - two module-local formats were added rather than imported: `PlanIdSchema` is `z.uuid()` — matching
          delivery's own acceptance set but **without** its lower-casing `overwrite`, so a canonical-case
          assertion parses and normalization stays a comparison concern (Task 2.2.c) — and
          `DeliverableIdSchema` constrains the `sha256:` canonical digest. `workUnitSlug` reuses `SlugSchema`.

    - `[x]` **2.1.b Scope both unconditional dereferences to the kinds that carry their fields**

        - the branch-encodes-slug check is guarded on `kind !== "delivery-member"`, which leaves the
          Errand-branch, pull-request identity, closed-state, and stale-head facts vehicle-agnostic as they were.
        - the arm dispatch gains a member arm ahead of the archive-cadence read, admitting unconditionally for
          now; what it actually declines to do is Task 2.3's.

- _Outcome:_ Readiness admits a `delivery-member` vehicle end to end — the envelope echoes it unchanged in both
  the ready and the invalid payload — and no work-unit or Errand behavior moved. The member arm is deliberately a
  bare `ready(request)` at this point: authentication (2.2) and the lifecycle-skip contract (2.3) land on top of
  it, so a member currently admits on identity alone.

### `[x]` **2.2 Authenticate the member against delivery state**

- _Goal:_ Readiness admits a member only when the pull request's exact live head resolves to the plan, member,
  and work unit the vehicle asserts, and every refusal names what disagreed.

    - `[x]` **2.2.a Add the lookup port to the readiness dependency boundary**

        - `ReviewReadinessDependencies` gains an optional `deliveryMemberLookup` beside `fs`, substituted in
          tests the same way. It is documented as optional-because-undefaultable rather than
          optional-because-convenient, so a later reader does not supply a module-internal default for it.
        - an absent port and an `unavailable` answer both produce `delivery-state-unavailable` — the port's
          absence is a delivery read that could not be established, which is the same refusal.

    - `[x]` **2.2.b Refuse an unresolvable or unbound head**

        - both refusals carry `pullRequest.headSha`: the head is the subject being resolved, and the assertion
          has not yet been reached when either fires.

    - `[x]` **2.2.c Refuse a resolution that disagrees with the assertion**

        - the vehicle asserts the owning work unit as a slug while the resolution names the same value as an id;
          both are slugs in one domain, so they compare directly — the differing field names are the hazard, not
          the values
        - plan ids compare on the lower-cased form. Delivery lower-cases as it parses, and the readiness schema
          deliberately does not (Task 2.1.a), so an assertion carrying a canonical-case UUID names a correct
          member and must not be refused.

    - `[x]` **2.2.d Refuse the plan's final member**

        - the boundary is enforced rather than trusted from the asserted kind: a terminal member's head is also
          bound in delivery state, so an unenforced boundary would let a work unit present its terminal pull
          request as a member and skip lifecycle readiness entirely
        - the terminal fact carries `vehicle.deliverableId` — the field naming the member the boundary rejects.

- _Outcome:_ `evaluateDeliveryMember` in `readiness.ts` is the member arm, reached after tree-root resolution and
  authenticating `pullRequest.headSha` rather than `target.headSha` (a stale head returns early, so the two are
  proven equal and the observed value is the one authenticated). Mismatch and terminal facts accumulate rather
  than short-circuit, so a refusal names every field that disagreed in one pass; the unavailable and unbound
  answers return alone, having reached no assertion to compare.

### `[x]` **2.3 Skip work-unit lifecycle evaluation for members**

- _Goal:_ A member pull request evaluates ready with no work-unit lifecycle artifact present anywhere in the
  supplied tree, while an unusable supplied tree still refuses consistently across every vehicle kind.

- _Context:_ A member pull request excludes lifecycle artifacts by design. This absence is what the distinct kind
  buys — the vehicle adds identity checks, not lifecycle ones.

- _Outcome:_ The arm placement Task 2.1.b established already had this shape, so the deliverable is the coverage
  that pins it plus one comment recording why the arm must stay below tree-root resolution: the resolution is
  itself the unusable-root check, and its result being unused on this path reads like dead code otherwise.
  Coverage asserts the absence directly — a filesystem boundary that records every call shows the member path
  touching nothing but the root itself — rather than asserting `ready` over an empty tree, which would also pass
  if lifecycle reads ran and found nothing. Root faults are asserted against the Errand arm's own result in the
  same case, so "the same root fact" is a comparison rather than a restated constant.

### `[x]` **2.4 Bind the port at every readiness composition root and state the widened contract**

- _Goal:_ Every production path that evaluates readiness reads delivery state from the repository its own
  composition root resolved, and the module's documented contract stops claiming it reads only lifecycle
  products beneath the supplied tree.

- _Note:_ Delivery state is Git-common-directory state rather than a tree product, and the supplied tree is
  untrusted by construction. The binding must therefore come from the composition root's own resolved root,
  never from the request's tree root.

    - `[x]` **2.4.a Construct the port from the composition root's resolved root at each construction site**

        - `readinessBoundTo(root)` in `handlers/review.ts` is the one binding, consumed by both construction
          sites: the readiness handler's `check`, and `defaultMergeLockPort`, which now takes the root and is
          reached from resolve, hold, and release. Both already received the resolved root and discarded it.
        - the value each handler holds is the resolved **ARC root** — the ancestor directory holding `.arc` —
          not the Git repository root. The Git-common publisher resolves the common directory from any path
          inside the repository, so that value is correct to build from; the distinction matters only so the
          wiring is checked against what is actually in hand.
        - only two callers reach the evaluation itself — the readiness handler and merge-lock **release**.
          Resolve never gates on readiness and hold is declared not to, so their constructed port is inert with
          respect to it. Binding is uniform anyway; the assertions cover the two paths where it is observable.
        - `defaultMergeLockPort` gained a runner parameter defaulting to the `gh` runner, and is exported. That
          is what makes release's binding assertable at all: the port otherwise reaches a live `gh` before it
          ever reaches readiness. `merge-lock.ts` itself is untouched.

    - `[x]` **2.4.b State the delivery read in the module contract**

        - the module doc records the second authority source, its repository binding, and why the binding cannot
          come from the request; it also records that the read is not side-effect-free — the snapshot creates its
          namespace directory and takes an advisory lock, so a member evaluation writes inside the Git common
          directory, and a sandbox denying that degrades the arm to unavailable rather than failing a new way.
        - `evaluateReviewReadiness`'s `overrides` parameter was documented as test-only, which 2.4.a made false.
          It now names the filesystem boundary as test-only and the delivery lookup as the production injection
          path.

- _Outcome:_ Coverage is one integration suite over real repositories
  (`review-readiness-delivery-binding.test.ts`) exercising both composition roots against a bound and an unbound
  repository, with the supplied tree root deliberately crossed against the resolved root in each direction — so
  binding to the wrong one is a failing assertion rather than an indistinguishable pass.

### `[x]` **2.5 Gate merge-lock release on a member's readiness result**

- _Goal:_ A member pull request's lock release passes or fails on the same readiness verdict as any other
  vehicle, with the merge-lock module itself untouched.

- _Context:_ Release already forwards the request's vehicle into the readiness request and gates on the returned
  envelope, and the transition request reuses the shared vehicle schema — so admitting the variant widens it with
  no schema work here. What this task supplies is the binding: the merge-lock port is constructed with a bare
  readiness function today, so its delivery read is wired at the handler in 2.4.a rather than in the merge-lock
  module. The verbs, their request shapes, and their gating logic are unchanged.

- _Outcome:_ Zero production lines. `merge-lock.ts` is byte-unchanged, which is the claim under test rather than
  a happy accident, so the deliverable is the coverage proving a member reaches the same gate: released when
  ready, blocked carrying the delivery diagnostics when not, blocked on a readiness result bound to another
  target, and locked without consulting readiness at all. The vehicle is asserted to arrive at the readiness
  request unchanged, which is what "the transition request reuses the shared vehicle schema" amounts to in
  practice. Each behavior was reconstructed against a mutated gate rather than accepted on a first-run pass,
  since none of them would have failed before this work unit began for want of the schema alone.

---

## **Phase 3:** Member review target

_Purpose:_ Give the local lane a target that pins a member's recorded coordinates and declares its own kind,
while leaving an ordinary target's identity, derivation, and confirmation byte-identical.

_Design decisions:_ The target carries a `delivery-member` kind so the kind-conditional diff-base reading is
declared rather than hidden, and so confirmation can verify pinned objects instead of re-deriving. Derivation
gains an optional member-coordinate input while retaining the base ref it already writes into the target; the
worktree-cleanliness guard is scoped to the inputs that actually read the worktree.

### `[x]` **3.1 Widen the review target kind to `delivery-member`**

- _Goal:_ A review target can declare that it pins a member's recorded coordinates, while every ordinary target
  keeps the identity it has today.

    - `[x]` **3.1.a Widen the kind on the target identity preimage and schema**

        - `ReviewTargetKindSchema` replaces the `z.literal("change-set")` on `ReviewTargetIdPreimageSchema`, so
          the widening reaches the input and target schemas that derive from it — one line, one exported type,
          no branch anywhere yet.
        - the ordinary target's identity is pinned against its literal digest rather than a recomputation, so a
          change to the preimage's shape or field order fails the assertion instead of moving with it.

    - `[x]` **3.1.b Carry the widened contract through registration**

        - both registrations already reference the widened schema objects, so neither version moved: this is a
          contract change under a strict-current posture, and the pre-public-release posture changes it in place
          with no compatibility alias or migration reader.
        - coverage retrieves both schemas from a freshly composed registry rather than importing them, which is
          what makes the registration itself the thing under test, and reproduces each kind's `targetId` from
          the registered preimage.

- _Outcome:_ Ordinary and member targets are now distinguishable by inspection and by identity, with the
  member kind carried but not yet produced anywhere — derivation (Task 3.2) is what first sets it. Task 3.1.b
  changes no production line; its behaviors were reconstructed against a registration narrowed back to the
  single kind, and 3.1.a's identity pin against a preimage that rewrites the ordinary kind.

### `[x]` **3.2 Parameterize local target derivation by optional member coordinates**

- _Goal:_ Derivation accepts the exact commits it should diff, defaulting without them to the configured base and
  the current head, so a caller can derive against coordinates that are not the current checkout.

    - `[x]` **3.2.a Accept optional member coordinates alongside the retained base ref**

        - `deriveLocalReviewTarget` splits into two coordinate resolvers behind one entry point that keeps the
          base-ref format check, the kind assignment, and the single `createReviewTarget` call. The optional
          `memberCoordinates` carries both shas together, so "exactly one supplied" is unrepresentable rather
          than a state the resolvers would each need an answer for.
        - the supplied path resolves the base ref's format but never its object, and computes no merge base — a
          member derives correctly against a base ref that is absent locally, which is what keeps the
          unresolved-base refusal naming one thing.
        - failure reasons are reused rather than widened: an unresolvable or non-commit recorded head reports
          `non-commit-head`, and the recorded base reports `unresolved-base`.
        - frontline materialization passes no coordinates and is untouched; coverage pins that its re-derivation
          still yields the ordinary kind rather than assuming the defaulted parameter holds.

    - `[x]` **3.2.b Scope the worktree-cleanliness guard to the checkout-reading path**

        - the guard moved into the checkout resolver, so it still refuses a dirty tree on the default path and
          never runs on the supplied one, where neither HEAD nor the working tree is read.

- _Outcome:_ Derivation is now the single place a member target can be built, and the decoupling the design
  called for is structural rather than conditional: the supplied path reads only the two recorded commits and
  their trees. `baseRef` is written into the target unchanged on both paths, so the identity-bearing field keeps
  one meaning while `diffBaseSha` carries the kind-conditional one.

### `[x]` **3.3 Compose a member target from recorded coordinates**

- _Goal:_ A member's target pins the exact commits delivery recorded for it, with trees resolved locally and the
  configured base as its base ref.

    - `[x]` **3.3.a Build the target from a member resolution**

        - `composeDeliveryMemberTarget` maps the resolution's `head` / `base` onto the derivation's member
          coordinates and does nothing else. The mapping is the whole point of naming it: the two vocabularies
          differ on the same values, which is the hazard the readiness lane already hit comparing a slug against
          an id.
        - the composer takes a `DeliveryMemberBinding`, which carries no ref at all, so "no member ref is
          consumed" holds by the input's shape rather than by inspection; coverage pins it against a real
          member ref that exists in the repository and is never named.

    - `[x]` **3.3.b Refuse a member whose recorded objects are unavailable**

        - no new failure reason: an unresolvable recorded head is a non-commit head and an unresolvable recorded
          base is an unresolved base, and the handler's existing exhaustive switch already maps both onto
          `commit-head` and `base-resolved` in the error envelope.

- _Outcome:_ Composition adds no target-building path — the object checks, tree resolution, and identity
  computation stay in the derivation Task 3.2 parameterized. Task 3.3.b changes no production line; its
  behaviors were reconstructed against a mutated precondition switch, and the composer's own refusals fail
  first through the derivation they delegate to.

### `[x]` **3.4 Branch target confirmation on the carried kind**

- _Goal:_ Confirming a member target verifies its pinned coordinates still resolve, so a member operation stays
  current while the control locus moves on, and every verb reaches that behavior through the confirm port it
  already injects.

    - `[x]` **3.4.a Confirm a member target by verifying its objects**

        - the object verification Task 3.2 introduced was extracted so confirmation and derivation share it
          verbatim; confirmation stops there, re-checking neither the recorded trees nor anything about the
          checkout, and reuses the head and base reasons rather than adding a refusal shape.
        - coverage runs against a control checkout that has moved past the member and is dirty — the state this
          branch exists for — and asserts the absence directly: no merge base, no status read, no HEAD read.

    - `[x]` **3.4.b Keep ordinary confirmation unchanged**

        - `confirm-delegation.test.ts` stubs the preparation composition and pins that attest, resume, respond,
          and reduce all reach it for both kinds, which is what keeps one confirmation behavior across the five
          verbs rather than four re-implementations that could drift apart.

- _Outcome:_ A member operation now survives the control locus moving on, which is the behavior the whole kind
  exists to buy: staleness keeps one meaning because the member path produces none. Task 3.4.b changes no
  production line; its behaviors were reconstructed against a resume composition rewired to confirm on its own,
  and the ordinary-staleness pin against a confirmation branch widened to every kind.

---

## **Phase 4:** Local member admission at prepare

_Purpose:_ Let an operator at the owning work unit's control locus name a member by its exact head and prepare a
review over it, with the owning work unit's assurance and no change to the no-selector path.

_Design decisions:_ Selection is the only genuinely missing piece — the control locus already resolves the owning
work unit's meta, so assurance composes through the existing work-unit function unchanged. Assurance dispatch
routes `delivery-member` to the work-unit arm; left unrouted it would compose an Errand assurance with no work
class.

### `[x]` **4.1 Admit the `delivery-member` variant into the local authority and operation-state vehicle unions**

- _Goal:_ The local lane can both represent and persist a review whose subject is a delivery member.

    - `[x]` **4.1.a Add the variant to the local review authority vehicle**

        - added to `LocalReviewAuthority["vehicle"]` in `local-review-authority.ts`, keeping the union's
          kind-and-identity shape

    - `[x]` **4.1.b Add the variant to the persisted operation-state vehicle**

        - added to `ReviewVehicleSchema` in `operation-state-schema.ts`, so both the local-review and suspension
          states accept a member. A canonical deliverable-id digest satisfies the shared identifier pattern
          unchanged — no separate identity schema

- _Outcome:_ No consumer broke on the widened unions, which is the intended state rather than an oversight:
  assurance dispatch treats every non-work-unit vehicle as an Errand today, so a member composes the wrong
  assurance until Task 4.3 routes it. The variant is inert until a member authority can be produced (Task 4.2).

### `[x]` **4.2 Resolve a named member through the delivery port at the control locus**

- _Goal:_ Naming a member's exact head at the owning work unit's control locus yields a member authority, while a
  member belonging to another work unit's plan or standing last in its own is refused rather than adopted.

    - `[x]` **4.2.a Accept an optional member selector**

        - `memberHeadObjectId` joins `LocalPrepareRequestSchema` as an optional `GitObjectIdSchema` field. The
          handler parses the raw request through that schema directly, so the verb, its flags, and the host
          surface are untouched
        - `resolveLocalReviewAuthority` takes the selector as an optional input field, and `memberLookup` joins
          its dependencies as an optional port bound at the local lane's composition root from the injected cwd.
          Absent, a supplied selector refuses `delivery-state-unavailable` — the readiness boundary's fail-closed
          shape

    - `[x]` **4.2.b Authenticate the named member against the control locus's work unit**

        - the member's recorded `workUnitId` must equal the work unit the control locus resolves; otherwise
          `delivery-member-work-unit-mismatch`. Lookup failures keep the port's own distinction —
          `delivery-state-unavailable` for an answer that could not be established, `delivery-member-unbound` for
          a head no member holds
        - a selector in an Errand context refuses `delivery-member-requires-work-unit`, distinct from
          `vehicle-unresolved`, which keeps its meaning as the both-or-neither case

    - `[x]` **4.2.c Refuse the plan's final member**

        - `delivery-member-terminal`, read off the binding's `isFinalMember` — the same signal and boundary the
          readiness lane applies

    - `[x]` **4.2.d Keep actor separation unchanged**

        - the member path runs through the identical owner, author/evaluator, and runtime checks. The
          owner-against-active-identity check is deliberately ordered ahead of member authentication, so an
          operator working outside their own work unit learns that before anything about the member

- _Outcome:_ Resolution now returns `{ authority, member }` rather than a bare authority — the coordinates target
  composition needs (Task 4.4.a) cannot ride the vehicle, which is written verbatim into a strict persisted union.
  Three callsites adapt: prepare destructures and forwards its request's selector, while attest and respond take
  `.authority` and supply no selector, holding both to today's behavior. Attest's conditional selector supply is
  Task 5.1.a's, so a member operation can be prepared but not yet attested until that lands.

### `[x]` **4.3 Route `delivery-member` assurance to the work-unit arm**

- _Goal:_ A member's review assurance is the owning work unit's work class and review rubric, composed by the
  existing function rather than falling through to the Errand arm.

- _Outcome:_ One predicate in the local lane's `composeAssurance` — the member kind now enters the same arm as a
  work unit, so both compose from the control locus's meta through the unchanged composition function and produce
  byte-identical assurance. Refusals follow for free: an absent meta and an unresolvable rubric each refuse for a
  member exactly as for a work unit, which is what keeps the guidance digest stable across prepare and attest.

### `[ ]` **4.4 Prepare a member operation end to end**

- _Goal:_ Prepare at the control locus with a selector publishes an operation whose vehicle, target, and
  assurance all describe the named member, and prepare without one produces exactly what it produces today.

    - `[ ]` **4.4.a Resolve authority before deriving, and feed the resolution to derivation**

        - prepare derives its target before resolving authority today, which leaves the recorded coordinates
          unavailable at the moment derivation needs them. Invert the two steps and pass the resolution's
          recorded shas into derivation as its member coordinates; with no selector, derivation receives none and
          behaves exactly as it does now.
        - the inversion moves which refusal surfaces first when two would fire at once — a dirty worktree and an
          unresolvable vehicle, say. No successful outcome changes, and no existing test pins the old order, but
          the new order is pinned below so it is a decision rather than a drift.

        Build `test-first` (one behavior at a time):

        - a selector produces a member vehicle and a member target in the published operation state
        - derivation receives the resolution's recorded shas, and receives no coordinates without a selector
        - an unresolvable vehicle refuses before a dirty worktree does
        - the source descriptor and materialization consume the pinned head unchanged
        - the admission carrier's snapshot carries the member's base ref and its recorded diff base

    - `[ ]` **4.4.b Preserve the no-selector path exactly**

        Build `test-first` (one behavior at a time):

        - prepare with no selector yields today's vehicle, target, and assurance in a work-unit context
        - the same holds in an Errand context

---

## **Phase 5:** Member operations across the re-derivation sites

_Purpose:_ Carry member selection to the one site that compares a re-derived vehicle against persisted state, and
establish that the remaining sites need nothing, so a member operation prepared with a selector can also be
attested, responded to, resumed, and reduced.

_Design decisions:_ A selector honored only at prepare yields an operation that can be prepared and never
attested, because attest re-resolves authority and compares the result against persisted state. The other three
verbs each need nothing for their own reason: respond consumes only actor identities, which are
selector-invariant, while resume and reduce re-confirm the target without re-resolving authority at all. Binding
drift is consequently caught at admission and at merge-lock release, never by staleness.

### `[ ]` **5.1 Re-resolve the member vehicle at attest and re-entrant admission**

- _Goal:_ Attesting a member operation derives the same vehicle the operation was published with, so neither the
  vehicle comparison nor the operation-key comparison refuses on the supported path.

- _Context:_ Authority re-resolution is the lane's integrity mechanism, so member selection has to satisfy it
  rather than bypass it.

    - `[ ]` **5.1.a Carry member selection to attest's authority resolution**

        - attest makes two member-sensitive checks, not one: it compares the re-resolved vehicle against the
          persisted vehicle, and it recomputes the delivered guidance digest through the same assurance
          composition. Misrouted assurance passes the first and fails the second as a changed-guidance
          corruption, which names nothing about the real cause — so both are pinned here.

        Build `test-first` (one behavior at a time):

        - attesting a member operation re-derives a vehicle identical to the persisted one
        - the attestation's vehicle comparison passes on the supported path
        - the recomputed guidance digest equals the one prepare published
        - attesting an ordinary work-unit operation supplies no selector and is unaffected, including when its
          target head is itself bound in delivery state
        - a vehicle that genuinely differs still refuses

    - `[ ]` **5.1.b Keep re-entrant admission consistent**

        - re-preparing without the selector neither collides nor corrupts: a work-unit vehicle derives an
          ordinary target, so a different target identity and a different operation identity — it addresses a
          separate operation and admits fresh. The operator-visible cost lands only on a clean control locus,
          where a forgotten selector silently prepares a review of the control branch instead of the member. On
          the dirty locus that is normal there, the retained cleanliness guard refuses instead, so the silent
          case is the narrower one.

        Build `test-first` (one behavior at a time):

        - re-preparing an existing member operation resolves the existing record rather than refusing on an
          operation-key mismatch
        - a member operation and a work-unit operation in the same repository hold distinct operation identities
        - re-preparing the same repository without a selector admits a separate ordinary operation

### `[ ]` **5.2 Confirm respond serves member operations unchanged**

- _Goal:_ Responding to findings on a member operation resolves the right actor identities without carrying
  member selection at all, so the verb needs no change.

- _Rationale:_ Respond consumes only the author and runtime identities out of the resolution, and both are
  selector-invariant at the control locus — the author is the owning work unit's owner whether or not a member is
  named. This is the one re-derivation site the selector does not have to reach, which is worth proving rather
  than assuming, since it is the exception to the rule the rest of this phase enforces.

    Build `test-first` (one behavior at a time):

    - respond over a member operation resolves the owning work unit's owner as approver, with no selector supplied
    - respond over a work-unit or Errand operation is unchanged

### `[ ]` **5.3 Confirm member targets at resume and reduce without re-resolving authority**

- _Goal:_ Resume and reduce operate on the head the operation was admitted for, confirming its pinned
  coordinates rather than re-deriving against the control branch.

- _Note:_ Neither verb re-resolves authority, so neither detects binding drift. That is deliberate and consistent
  with the exact-head evidence rule: an operation reviews the head it was admitted for, and a rebased or rebound
  member is a new head that must be admitted again. The work-unit path gets an incidental drift signal here
  because its confirmation re-derives; the member path deliberately does not. Both verbs carry a confirm
  dependency and no authority resolution at all, so this holds structurally rather than by convention.

- _Note:_ Reduce confirms in two arms, and only the local-review arm is reachable here — the other belongs to
  frontline runs, which members never enter. There is no member frontline fixture to build.

    Build `test-first` (one behavior at a time):

    - resuming a member operation confirms current while the control locus is dirty and on the control branch
    - reducing a member operation confirms current under the same conditions
    - a member operation whose pinned objects are gone refuses at both verbs
    - resume and reduce over ordinary operations are unchanged

---

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` A `delivery-member` vehicle whose asserted `planId`, `deliverableId`, and `workUnitSlug` match the
  delivery-state resolution for the pull request's exact live head evaluates `ready`, with no work-unit lifecycle
  artifact present in the supplied tree

- `[ ]` A head bound to no delivery member refuses with `delivery-member-unbound`; an asserted field disagreeing
  with the resolution refuses with `delivery-member-mismatch` naming that field's path; an unavailable or
  ambiguous lookup refuses with `delivery-state-unavailable`

- `[ ]` A vehicle naming the plan's final member refuses with `delivery-member-terminal` in both lanes, and the
  same change presented under a `work-unit` vehicle is evaluated by the unchanged work-unit path

- `[ ]` A `delivery-member` vehicle is never refused with `vehicle-branch-mismatch` regardless of head branch
  name, while the existing work-unit and Errand readiness tests pass with unchanged expectations

- `[ ]` `releaseMergeLock` admits a `delivery-member` vehicle and gates it on the readiness result, with no edit
  to `merge-lock.ts`

- `[ ]` Local prepare at the owning work unit's control locus with a member selector produces a review state
  carrying the `delivery-member` vehicle, with assurance composed from the owning work unit's `workClass` and
  `reviewRubric` by the existing composition function — not the Errand arm

- `[ ]` A member operation prepared with a selector can be attested: authority re-resolution at attest and at
  re-entrant admission derives the same `delivery-member` vehicle as the persisted state, so neither the
  vehicle-mismatch nor the operation-key-mismatch refusal fires on the supported path

- `[ ]` A member operation's target carries the `delivery-member` kind, the member's recorded head and base as
  `headSha` and `diffBaseSha`, the trees resolved from those two commits, and the configured base ref as
  `baseRef`; confirmation at prepare, attest, resume, respond, and reduce returns `current` for that target while
  the control locus's `HEAD` remains the control branch and its worktree is dirty

- `[ ]` An ordinary target's kind, id, derivation, and confirmation are unchanged

- `[ ]` A member whose binding has drifted — rebased, rebound, or unbound — is refused at admission by the
  delivery authentication and again at merge-lock release, not by `stale-target`; a missing object still refuses
  on the member path

- `[ ]` Local prepare invoked with no selector produces exactly the vehicle, target, and assurance it produces
  today, for both a work-unit and an Errand context

- `[ ]` Local prepare refuses a selector whose bound head resolves to a work unit other than the one resolved at
  the control locus, refuses a selector naming the plan's final member, and refuses a selector supplied where no
  work unit resolves at all

- `[ ]` No workflow file, dispatch payload, template, or host permission is added or revived

- `[ ]` The readiness module's documented contract states the delivery read and its repository binding

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
