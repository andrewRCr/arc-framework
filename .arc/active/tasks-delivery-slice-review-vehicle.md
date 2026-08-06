# Task List: Delivery Slice Review Vehicle

- **Design:** `spec-delivery-slice-review-vehicle.md`

---

## **Phase 1:** Delivery member lookup port

_Purpose:_ Establish the one narrow, injectable read of delivery state that answers member identity and finality
at an exact head. Both lanes authenticate against this single port, so it lands before either consumer.

_Design decisions:_ The default implementation wraps the delivery state store alone — never the plan store —
because state binds one exact plan revision by digest while the plan store returns the current plan. Finality
reads the last element of the state's plan-ordered member list.

### `[ ]` **1.1 Delivery member lookup port contract**

- _Goal:_ Review has one storage-agnostic way to ask what delivery member a given head is, so the readiness lane
  and the local lane authenticate through a single injectable seam instead of re-modelling delivery twice.

- _Shape:_ The contract is host-neutral and belongs beside the lane's other host-neutral contracts; its adapter
  belongs with the local-host adapters, alongside the Git-common-state boundary it is built from. That split
  mirrors how the lane already separates review authority from its adapter.

    - One method takes the exact member head object id and answers in three states: **resolved**, carrying the
      owning plan, deliverable, and work unit, the member's recorded base and head commits, and whether the
      member is the plan's final one; **unbound**, meaning no delivery member holds that head; or
      **unavailable**, meaning the answer could not be established.
    - Unbound and unavailable stay distinct all the way through the contract — the two consumers refuse
      differently on each, and collapsing them would make a missing binding indistinguishable from a broken read.
    - Answer with that third state rather than throwing, so each caller maps it to its own refusal vocabulary.
    - Do not expose the optional ownership hint the underlying lookup accepts. Callers compare resolutions
      themselves, which keeps refusal vocabulary with the caller rather than surfacing as a store failure.

### `[ ]` **1.2 Repository-backed default lookup implementation**

- _Goal:_ A caller holding a repository root gets real member resolutions, and every way the underlying store
  can fail arrives as a closed, non-throwing unavailability.

- _Note:_ The plan's final member is the last element of the state's member list, which holds because the
  delivery module keeps state plan-ordered and refuses a sequence mismatch. Reading the plan to learn it would
  buy nothing and introduce a hazard: a plan published ahead of its state rebinding would answer the terminal
  question against a plan the state is not bound to.

- _Note:_ These behaviors exercise real repository-common state, so they belong at the integration tier
  alongside the existing delivery state-store suite rather than as unit tests over a substituted publisher.

    - `[ ]` **1.2.a Resolve a member from repository-common delivery state**

        - the underlying selector matches on recorded coordinates and skips any member holding none, so a head
          match always carries a base and a head — a member bound only by an opened change request is simply
          unselectable this way, and needs no defensive branch

        Build `test-first` (one behavior at a time):

        - a head bound to a member returns the owning plan, deliverable, and work unit, plus that member's
          recorded base and head
        - a head bound to no member returns unbound, distinct from unavailable
        - the last member of the state's member list resolves as final; every earlier member does not

    - `[ ]` **1.2.b Map every store failure onto the port's closed unavailability**

        - the underlying lookup returns typed refusals but does not contain thrown failures: its snapshot read
          propagates I/O errors, and resolving the state namespace throws outside a repository altogether. The
          adapter is what makes the port total, so an unreadable state directory fails closed instead of
          crashing the caller.

        Build `test-first` (one behavior at a time):

        - an ambiguous match surfaces as unavailable rather than resolving to one candidate
        - a malformed record, a corrupt namespace, and an identity mismatch each surface as unavailable
        - an unreadable state directory surfaces as unavailable
        - a root that is not a repository surfaces as unavailable rather than throwing

    - `[ ]` **1.2.c Bind the store to an explicitly injected working directory**

        - constructed from a supplied root, never from a process-working-directory read — a module-internal
          read would ignore the checkout the rest of the lane is bound to and defeat test substitution

        Build `test-first` (one behavior at a time):

        - two ports constructed against different roots each resolve against their own repository

---

## **Phase 2:** Readiness admission for delivery members

_Purpose:_ Admit a `delivery-member` vehicle into exact-head readiness, authenticated by delivery-state reverse
lookup rather than branch naming, with no work-unit lifecycle arm — the refusal this work unit exists to remove.

_Design decisions:_ The vehicle asserts plan, member, and owning work unit only; the head arrives independently
and no base is asserted. The terminal boundary is enforced rather than trusted, because a terminal member's head
is also bound in delivery state. This work unit adds no host surface — the vehicle reaches the CLI as JSON on
stdin, composed by the consuming callsite.

### `[ ]` **2.1 Admit the `delivery-member` variant and scope the branch-slug check to slug-bearing kinds**

- _Goal:_ A readiness request can name a delivery member by plan, deliverable, and owning work unit, and the
  branch-encodes-slug check stops applying to a vehicle that carries no slug by design.

- _Rationale:_ These land together because the union is dereferenced unconditionally in two places, and admitting
  a variant that carries neither field type-checks in neither. Splitting them would leave an intermediate state
  that does not compile, so a one-behavior-at-a-time list could not run across the boundary.

    - `[ ]` **2.1.a Add the variant to the readiness vehicle union**

        - carries the kind, plan id, deliverable id, and owning work-unit slug — no base, no archive cadence
        - every field in this module is regex-constrained, and the variant needs two formats the module does not
          yet have: the plan id is a UUID and the deliverable id is a `sha256:` canonical digest. The work-unit
          slug reuses the module's existing slug format.

        Build `test-first` (one behavior at a time):

        - a well-formed member vehicle parses
        - a malformed plan id or deliverable id is rejected
        - one carrying a base or an archive-cadence field is rejected
        - the envelope echoes the member vehicle unchanged in both the ready and the invalid payload

    - `[ ]` **2.1.b Scope both unconditional dereferences to the kinds that carry their fields**

        - two sites read fields the member variant does not have: the branch check reads the vehicle's slug, and
          the arm dispatch reads its archive cadence after narrowing past the Errand return. Scoping the second
          means introducing the member arm, which lands here as a dispatch that admits; the work it does — or
          rather declines to do — is defined in Task 2.3.

        Build `test-first` (one behavior at a time):

        - a member vehicle never produces the branch-mismatch fact, whatever the head branch is named
        - work-unit and Errand vehicles keep today's branch-mismatch and Errand-branch behavior
        - the pull-request identity, closed-state, and stale-head facts apply to all three kinds
        - a member vehicle reaches its own arm rather than either work-unit cadence arm

### `[ ]` **2.2 Authenticate the member against delivery state**

- _Goal:_ Readiness admits a member only when the pull request's exact live head resolves to the plan, member,
  and work unit the vehicle asserts, and every refusal names what disagreed.

- _Approach:_ Authenticate inside the member arm, after tree-root resolution — identity-fact evaluation is
  synchronous and pure, and folding an asynchronous read into it would change that function's character.
  Authenticate the **live pull-request head**, not the requested target head: the two are proven equal by the
  time the arm runs, since a stale head returns early, and the authenticated value should be the observed one.
  Then compare the resolution against the assertion field by field. The three asserted fields are the caller's
  claim; readiness authenticates the claim.

    - `[ ]` **2.2.a Add the lookup port to the readiness dependency boundary**

        - sits alongside the filesystem boundary and is substituted in tests the same way
        - the port is supplied rather than defaulted: no repository root reaches the evaluation through its
          request, and the two sources that would supply one — the request's tree root and the process working
          directory — are both excluded by design. It is therefore optional at the boundary, and an unbound port
          fails the member arm closed as unavailable.

        Build `test-first` (one behavior at a time):

        - with no port bound, a member vehicle refuses as unavailable rather than throwing or admitting
        - with no port bound, work-unit and Errand evaluation is unchanged

    - `[ ]` **2.2.b Refuse an unresolvable or unbound head**

        Build `test-first` (one behavior at a time):

        - a lookup reporting unavailable refuses with the unavailable fact — fail closed
        - a head bound to no delivery member refuses with the unbound fact

    - `[ ]` **2.2.c Refuse a resolution that disagrees with the assertion**

        - the vehicle asserts the owning work unit as a slug while the resolution names the same value as an id;
          both are slugs in one domain, so they compare directly — the differing field names are the hazard, not
          the values
        - delivery lower-cases a plan id as it parses it, so a resolution's plan id is always lower case. An
          assertion carrying a canonical-case UUID would otherwise mismatch a correctly named member — a wrong
          refusal rather than a parse failure, which is the harder one to diagnose. Compare plan ids on the
          normalized form.

        Build `test-first` (one behavior at a time):

        - a disagreeing plan, deliverable, or work unit each emits one mismatch fact carrying that field's path
        - several disagreeing fields emit several facts, one per field
        - a fully agreeing resolution emits no mismatch fact
        - an assertion whose plan id differs from the resolution's only in case emits no mismatch fact

    - `[ ]` **2.2.d Refuse the plan's final member**

        - the boundary is enforced rather than trusted from the asserted kind: a terminal member's head is also
          bound in delivery state, so an unenforced boundary would let a work unit present its terminal pull
          request as a member and skip lifecycle readiness entirely

        Build `test-first` (one behavior at a time):

        - a resolution reporting the plan's final member refuses with the terminal fact
        - a non-final member does not

### `[ ]` **2.3 Skip work-unit lifecycle evaluation for members**

- _Goal:_ A member pull request evaluates ready with no work-unit lifecycle artifact present anywhere in the
  supplied tree, while an unusable supplied tree still refuses consistently across every vehicle kind.

- _Context:_ A member pull request excludes lifecycle artifacts by design. This absence is what the distinct kind
  buys — the vehicle adds identity checks, not lifecycle ones.

    - Tree-root resolution still runs, matching the Errand arm's shape. Its result is then unused on this
      path — nothing beneath the root is read for a member. The resolution is itself the check, so it is load
      bearing despite producing a value the arm never consumes.
    - Meta-presence, completion-notes, release-notes, archive-candidate, and cohort-closeout evaluation do not
      run for this kind, and the variant carries no archive cadence to select an arm with.

    Build `test-first` (one behavior at a time):

    - a member vehicle over a tree carrying no lifecycle artifacts evaluates ready
    - a member vehicle over a symlinked, missing, or non-directory root refuses with the same root fact the
      other kinds produce
    - both work-unit cadence arms and the Errand arm are unchanged

### `[ ]` **2.4 Bind the port at every readiness composition root and state the widened contract**

- _Goal:_ Every production path that evaluates readiness reads delivery state from the repository its own
  composition root resolved, and the module's documented contract stops claiming it reads only lifecycle
  products beneath the supplied tree.

- _Note:_ Delivery state is Git-common-directory state rather than a tree product, and the supplied tree is
  untrusted by construction. The binding must therefore come from the composition root's own resolved root,
  never from the request's tree root.

    - `[ ]` **2.4.a Construct the port from the composition root's resolved root at each construction site**

        - the value each handler holds is the resolved **ARC root** — the ancestor directory holding `.arc` —
          not the Git repository root. The Git-common publisher resolves the common directory from any path
          inside the repository, so that value is correct to build from; the distinction matters only so the
          wiring is checked against what is actually in hand.
        - there are two construction sites: the readiness handler, and the shared merge-lock port constructor
          reached from resolve, hold, and release. Both already receive the resolved root and discard it, so the
          change is to consume it rather than to route it, and the merge-lock constructor takes the root.
        - only two callers reach the evaluation itself — the readiness handler and merge-lock **release**.
          Resolve never gates on readiness and hold is declared not to, so their constructed port is inert with
          respect to it. Bind uniformly anyway; assert against the paths where binding is observable.

        Build `test-first` (one behavior at a time):

        - the readiness handler binds the port to the root it resolves, not to the request's supplied tree root
        - merge-lock release authenticates a member against the repository its handler resolved
        - a request whose supplied tree root differs from the resolved root still authenticates against the
          repository
        - neither reaching path leaves the port unbound, so a member never refuses as unavailable for want of
          wiring

    - `[ ]` **2.4.b State the delivery read in the module contract**

        - the module documentation records the second, narrow authority source outside the supplied root and
          names its repository binding
        - it also records that this read is not side-effect-free: the underlying snapshot creates its namespace
          directory and takes an advisory lock, so a member evaluation writes inside the Git common directory. A
          sandbox that denies those writes degrades member evaluation to unavailable, which is the fail-closed
          outcome rather than a new failure mode — but a module whose stated posture is pure inspection must not
          leave it unsaid.
        - the evaluation's own dependency parameter is documented as test-only today, and 2.4.a makes it the
          production injection path. Correct it in the same pass, or the module posture becomes accurate while
          the function it describes actively misstates how production calls it.

### `[ ]` **2.5 Gate merge-lock release on a member's readiness result**

- _Goal:_ A member pull request's lock release passes or fails on the same readiness verdict as any other
  vehicle, with the merge-lock module itself untouched.

- _Context:_ Release already forwards the request's vehicle into the readiness request and gates on the returned
  envelope, and the transition request reuses the shared vehicle schema — so admitting the variant widens it with
  no schema work here. What this task supplies is the binding: the merge-lock port is constructed with a bare
  readiness function today, so its delivery read is wired at the handler in 2.4.a rather than in the merge-lock
  module. The verbs, their request shapes, and their gating logic are unchanged.

- _Note:_ These behaviors inject the readiness function directly, so they need no repository fixtures. Only
  2.4.a's binding check exercises a real port.

    Build `test-first` (one behavior at a time):

    - releasing a lock for a ready member unlocks
    - releasing for a member readiness refuses reports the readiness failure and carries its diagnostics
    - releasing for a member whose readiness result binds a different target refuses on target mismatch
    - locking a member is unaffected, since locking never gates on readiness

---

## **Phase 3:** Member review target

_Purpose:_ Give the local lane a target that pins a member's recorded coordinates and declares its own kind,
while leaving an ordinary target's identity, derivation, and confirmation byte-identical.

_Design decisions:_ The target carries a `delivery-member` kind so the kind-conditional diff-base reading is
declared rather than hidden, and so confirmation can verify pinned objects instead of re-deriving. Derivation
gains an optional member-coordinate input while retaining the base ref it already writes into the target; the
worktree-cleanliness guard is scoped to the inputs that actually read the worktree.

### `[ ]` **3.1 Widen the review target kind to `delivery-member`**

- _Goal:_ A review target can declare that it pins a member's recorded coordinates, while every ordinary target
  keeps the identity it has today.

- _Rationale:_ Without a discriminator a member target is indistinguishable from an ordinary one by inspection —
  same base ref, same shape — so confirmation would re-derive against the control branch and report every member
  operation stale. The kind is also what makes the member-specific diff-base reading declared rather than a
  hidden property two competent readers could miss.

    - `[ ]` **3.1.a Widen the kind on the target identity preimage and schema**

        Build `test-first` (one behavior at a time):

        - both kinds parse, and an unrecognized kind is rejected
        - an ordinary target's id is byte-identical to the id the same inputs produce today
        - two targets differing only by kind produce different ids

    - `[ ]` **3.1.b Carry the widened contract through registration**

        - two registrations are in scope, not one: the target and its id preimage are registered separately, both
          at version 2 under a strict-current posture. That makes this a contract change rather than an additive
          one; under the pre-public-release posture it changes in place, with no compatibility alias or migration
          reader

        Build `test-first` (one behavior at a time):

        - a member target round-trips through the registry
        - registered ordinary targets are unaffected

### `[ ]` **3.2 Parameterize local target derivation by optional member coordinates**

- _Goal:_ Derivation accepts the exact commits it should diff, defaulting without them to the configured base and
  the current head, so a caller can derive against coordinates that are not the current checkout.

- _Shape:_ The base ref and the diff-base revision are separate inputs and must stay so. The base ref is a ref
  name written into the target as an identity-bearing field; the diff base is a commit. They are coupled on the
  default path, where the diff base is the merge base of the base ref and the head — and deliberately decoupled
  on the member path, where the base ref remains the configured base while the diff base is a predecessor's
  head. Adding revision parameters must not displace the base ref.

- _Shape:_ The two revisions arrive as one optional **member-coordinate** input — both shas together, or nothing.
  Independent optionals would leave a third state, exactly one supplied, that neither the derivation nor the
  cleanliness guard below has a defined answer for. Naming the input for what it carries also settles the kind:
  its presence is what makes the derived target a member target, which the derivation must set itself because the
  kind is part of the target's identity preimage and cannot be assigned afterwards without invalidating the id.
  A generic revision pair plus a separate kind flag would be more parameters and unused generality — the member
  path is the only caller that supplies either.

- _Shape:_ On the supplied path the configured base ref is validated for format, because it is written into the
  target, but its object is **not** resolved. The default path resolves it only to compute a merge base, which
  the supplied path does not compute. Resolving it anyway would refuse a member derivation whenever the base ref
  is absent locally — an unrelated reason — and would make the unresolved-base failure name two different things
  on the same path, blunting the refusal Task 3.3.b relies on.

- _Note:_ The cleanliness guard exists because the default path derives from the checkout and its working tree.
  Scoping it is not a weakening: the control locus is where authoring and review-driven fixes land, so an
  uncommitted edit is the normal state there, and a member already pushed would otherwise be unreviewable while
  its successor is being written. The evaluator's materialization still checks cleanliness of the detached
  worktree it creates at the pinned head, which is the cleanliness review actually depends on.

- _Note:_ Derivation has a second caller — frontline materialization re-derives inside a detached worktree at the
  target head. Defaulted parameters leave it untouched, and it must never receive a member target: re-deriving
  one would produce an ordinary target with a merge-base diff base, a different identity for the same review.
  Frontline is the no-selector path over the work unit's own change set, which is what keeps members away from
  it; the task below pins that its derivation is untouched rather than assuming it.

    - `[ ]` **3.2.a Accept optional member coordinates alongside the retained base ref**

        Build `test-first` (one behavior at a time):

        - omitting the coordinates reproduces today's derivation exactly, including the merge-base diff base and
          the ordinary target kind
        - supplying them derives against those two shas verbatim, computing no merge base
        - supplying them yields the member kind, and omitting them yields the ordinary kind
        - the base ref is written into the target unchanged on both paths
        - the base ref's format is validated on both paths; its object is resolved only on the default path
        - a base ref absent from the local repository refuses on the default path and does not on the supplied one
        - object-existence and commit-type checks refuse on both paths
        - frontline materialization's derivation is unchanged

    - `[ ]` **3.2.b Scope the worktree-cleanliness guard to the checkout-reading path**

        Build `test-first` (one behavior at a time):

        - a dirty worktree still refuses when no member coordinates are supplied
        - a dirty worktree does not refuse when they are supplied

### `[ ]` **3.3 Compose a member target from recorded coordinates**

- _Goal:_ A member's target pins the exact commits delivery recorded for it, with trees resolved locally and the
  configured base as its base ref.

- _Note:_ For a member target the diff base is the member's recorded base — its predecessor's head — not the
  merge base of the head and the base ref. The base ref carries the base the stack lands to; exactness rides the
  shas. The two readings are consistent by construction on the ordinary path and deliberately decoupled here.

    - `[ ]` **3.3.a Build the target from a member resolution**

        - composition is the resolution's recorded shas passed to the parameterized derivation as its member
          coordinates; there is no second target-building path, so the object checks, tree resolution, and
          identity computation all stay in one place

        Build `test-first` (one behavior at a time):

        - the recorded head and base fill the head sha and the diff-base sha
        - both trees resolve from those two commits
        - the base ref is the configured base and the repository id is the composition root's
        - the target carries the member kind
        - no member ref is consumed anywhere in the composition

    - `[ ]` **3.3.b Refuse a member whose recorded objects are unavailable**

        - reuse the derivation's existing failure reasons rather than adding one — an unresolvable recorded head
          is a non-commit head and an unresolvable recorded base is an unresolved base, both accurate here. Each
          reason maps through an exhaustive switch onto a closed precondition value in the error envelope, so a
          new reason would widen a typed public surface for no gain in accuracy.

        Build `test-first` (one behavior at a time):

        - a missing recorded head refuses, reporting the head precondition
        - a missing recorded base refuses, reporting the base precondition

### `[ ]` **3.4 Branch target confirmation on the carried kind**

- _Goal:_ Confirming a member target verifies its pinned coordinates still resolve, so a member operation stays
  current while the control locus moves on, and every verb reaches that behavior through the confirm port it
  already injects.

- _Note:_ Staleness keeps one meaning — confirmation does not re-derive for a member, so it manufactures no
  member-specific staleness. Binding drift is not confirmation's concern; it is caught at admission and again at
  merge-lock release.

    - `[ ]` **3.4.a Confirm a member target by verifying its objects**

        - verification is existence and commit type for the two recorded commits, and stops there. The recorded
          trees are not re-checked against their commits: they were resolved from exactly those commits when the
          target was composed, and the operation record is local state this lane already trusts for every other
          field it reads back. The target's own identity recomputation does not establish the correspondence
          either — it is a digest over the record's own fields and performs no repository read — so trust is the
          honest basis here, not a proof that already ran.
        - object failures reuse the derivation reasons Task 3.3.b settles. Confirmation has no refusal shape of
          its own to widen: its result type carries only current and stale, and the stale shape requires a
          re-derived current target that a member path never produces.

        Build `test-first` (one behavior at a time):

        - a member target whose objects resolve confirms current with the control branch checked out and its
          worktree dirty
        - a member target whose recorded head or base object is gone refuses, reporting the derivation reason for
          that object
        - confirmation never re-derives against the checkout for this kind

    - `[ ]` **3.4.b Keep ordinary confirmation unchanged**

        Build `test-first` (one behavior at a time):

        - an ordinary target re-derives and reports staleness exactly as today
        - the four delegating verbs reach the same confirmation behavior as prepare, for both kinds

---

## **Phase 4:** Local member admission at prepare

_Purpose:_ Let an operator at the owning work unit's control locus name a member by its exact head and prepare a
review over it, with the owning work unit's assurance and no change to the no-selector path.

_Design decisions:_ Selection is the only genuinely missing piece — the control locus already resolves the owning
work unit's meta, so assurance composes through the existing work-unit function unchanged. Assurance dispatch
routes `delivery-member` to the work-unit arm; left unrouted it would compose an Errand assurance with no work
class.

### `[ ]` **4.1 Admit the `delivery-member` variant into the local authority and operation-state vehicle unions**

- _Goal:_ The local lane can both represent and persist a review whose subject is a delivery member.

- _Note:_ The persisted union follows its existing kind-and-identity shape, carrying the member's deliverable id
  as the identity; the canonical digest form satisfies that union's identifier pattern unchanged. The
  hand-written authority union is the one that is easy to miss and is load-bearing — without it the lane cannot
  produce a member operation at all.

    - `[ ]` **4.1.a Add the variant to the local review authority vehicle**

    - `[ ]` **4.1.b Add the variant to the persisted operation-state vehicle**

        Build `test-first` (one behavior at a time):

        - a member vehicle round-trips through the operation-state schema
        - a deliverable-id digest satisfies the union's identifier pattern
        - persisted work-unit and Errand vehicles are unaffected

### `[ ]` **4.2 Resolve a named member through the delivery port at the control locus**

- _Goal:_ Naming a member's exact head at the owning work unit's control locus yields a member authority, while a
  member belonging to another work unit's plan or standing last in its own is refused rather than adopted.

- _Context:_ The control branch resolves to the work unit, so the member under review cannot be inferred from the
  checkout — the operator names it. The selector is the member's exact head object id, which the calling site
  already holds: it is the ref it just pushed or opened. Keeping the coordinate head-keyed adds no verb surface.

- _Shape:_ The selector reaches resolution as an added optional parameter on the authority-resolution dependency,
  and each callsite supplies its own source — prepare from its request, attest from the head its persisted target
  pins. Nothing new is persisted to carry it: the target is the operation's exact-head record, and a second
  stored copy of that head would be a field capable of disagreeing with it. The parameter is what makes the
  attest source reachable at all, since that verb's composition wrapper holds no operation state while its
  command does.

- _Shape:_ Attest supplies that head **only when the persisted vehicle is a member**. The condition is
  load-bearing rather than tidy: an ordinary work unit's target pins its control-branch head, and that head can
  itself be bound in delivery state — it is exactly what the terminal member's pull request is opened from. An
  unconditional supply would therefore authenticate an ordinary operation as a member and fail its vehicle
  comparison, breaking the path that is supposed to behave as it does today.

- _Shape:_ Resolution returns the member's recorded coordinates alongside the authority, because target
  composition needs them and the authority vehicle cannot carry them — that vehicle is written verbatim into a
  strict persisted union, so an extra field fails the operation's own parse. Prepare consequently resolves
  authority **before** deriving its target, inverting today's order (see Task 4.4.a); attest, which derives no
  target, is unaffected by the inversion.

    - `[ ]` **4.2.a Accept an optional member selector**

        - the selector enters as one optional field on the prepare request, which the verb already reads as
          versioned JSON — no new verb, flag, or host surface
        - the lookup port joins the authority-resolution dependencies, built at the local lane's existing
          composition root from the cwd already injected there. It is optional and fails closed exactly as the
          readiness boundary's is, so no existing construction of these dependencies has to change

        Build `test-first` (one behavior at a time):

        - with no selector, resolution yields exactly today's work-unit or Errand vehicle
        - the existing unresolved-vehicle refusal keeps its current meaning on the no-selector path
        - a selector with no port bound refuses rather than throwing or admitting

    - `[ ]` **4.2.b Authenticate the named member against the control locus's work unit**

        - a selector supplied where no work unit resolves — an Errand context — has nothing to authenticate
          against and refuses. Refuse it distinctly from the unresolved-vehicle case: the operator did name a
          member, and the naming is what failed.

        Build `test-first` (one behavior at a time):

        - a member whose resolved work unit matches the one resolved at the control locus yields a member vehicle
        - a member belonging to another work unit's plan refuses
        - an unavailable or unbound lookup refuses
        - a selector supplied in an Errand context refuses, and not as an unresolved vehicle

    - `[ ]` **4.2.c Refuse the plan's final member**

        - applies the same boundary as the readiness lane, so the rule holds uniformly across both

        Build `test-first` (one behavior at a time):

        - a selector naming the plan's final member refuses

    - `[ ]` **4.2.d Keep actor separation unchanged**

        Build `test-first` (one behavior at a time):

        - the author identity stays the owning work unit's owner, validated against the active identity
        - the author, evaluator, and runtime separation refusals fire for a member exactly as they do today

### `[ ]` **4.3 Route `delivery-member` assurance to the work-unit arm**

- _Goal:_ A member's review assurance is the owning work unit's work class and review rubric, composed by the
  existing function rather than falling through to the Errand arm.

- _Note:_ Dispatch today branches on the work-unit kind and treats everything else as an Errand, so an unrouted
  member would compose an Errand assurance with no work class — the opposite of the intent. Routing it to the
  work-unit arm also keeps the guidance digest stable between prepare and attest, which reach the same
  composition.

    Build `test-first` (one behavior at a time):

    - a member authority composes work-unit assurance from the control locus's meta
    - the composed assurance carries the owning work unit's work class, not the Errand arm's absent class
    - an absent or unresolvable rubric refuses for a member exactly as it does for a work unit

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
