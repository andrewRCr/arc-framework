# Task List: Delivery Post-Landing Conflict Recovery

- **Design:** `spec-delivery-post-landing-conflict-recovery.md`

---

## **Phase 1:** Member-suffix conflict recovery

_Purpose:_ Complete the disclose-and-resubmit protocol on the native member-suffix arm, so a landed member whose
replay conflicts receives a resubmittable decision instead of a byte-identical refusal.

_Mode:_ `slice` through Phase 3 — closes on an operator settling or releasing a wedged landing end to end.

_Design decisions:_ The native disclosure is a distinct result arm rather than a relaxation of the shared
provider arm; nothing is persisted on the input side, so the held reservation is what survives the wait.
See `notes-delivery-post-landing-conflict-recovery.md` § Recorded exclusions.

### `[x]` **1.1 Collect the complete member-suffix conflict set**

- _Goal:_ One run over a conflicting suffix reports every conflicted member with its paths, so the operator sees
  the whole decision rather than discovering it one member at a time.

    - `[x]` **1.1.a Collect every conflicted member instead of returning at the first**

        - Composed `collectDeliveryProviderRefreshConflicts` through a new `collectNativeDeliverySuffixConflicts`
          adapter in `native-landing.ts`. The suffix loop builds a `DeliveryNativeSuffixMovement` array carrying
          the before and after predecessors it had already resolved from state, and the adapter's closure maps
          each movement back onto the native arbiter's endpoints without re-reading Git. The collector is
          unchanged; the conflicted arm now carries the deduplicated union of every conflicted member's paths.

    - `[x]` **1.1.b Keep every other refusal hard**

        - Inherited from the composed collector, which returns any non-`contribution-conflicted` refusal
          immediately. A divergence or a bare refusal sitting behind an already-collected conflict still stops
          the run and keeps the reservation, so no partial set is ever disclosed.

- _Outcome:_ The per-member set (`{deliverableId, paths}`) is the adapter's return value and stays internal until
  Task 1.2's disclosure arm consumes it, so the result union still holds exactly its three arms. Endpoint
  resolution now runs over the whole suffix ahead of any proof, which moves an unverifiable endpoint in front of a
  partial conflict set rather than behind it.

### `[x]` **1.2 Author the native conflict-disclosure arm and its scope discriminant**

- _Goal:_ With conflicts present and no resolution supplied, the native path returns `conflict-resolution-required`
  carrying the conflicts and a resubmittable `resolutionInput`, matching a real arm of the result union.

    - `[x]` **1.2.a Author the distinct native disclosure arm**

        - Added the arm to `ReconcileLinkedNativeDeliverySuffixResult` and a field-matching arm to the handler's
          result union, and replaced the conflicted `blocked` return with the disclosure. The resolution blob is
          the shared type with its scope narrowed to the native kind, so the two cannot drift. Its
          `observedSuffixDigest` covers the freshly observed member coordinates, keyed by deliverable.
        - The native landing operation is now narrowed once at function entry rather than re-tested per use,
          which splits the existing `suffix-position-unavailable` guard without changing its arm or its text.

    - `[x]` **1.2.b Give `RefreshConflictResolutionSchema.scope` its own discriminated union**

        - `scope` now holds a new union over the existing dependent-suffix object and a native one keyed on the
          reservation's `operationId` — the suffix under reservation, not a selected member. Widening it broke the
          two predicted loci: the mirrored `DeliveryProviderConflictResolutionInput` scope, widened to match, and
          the `scope.selectedDeliverableId` dereference in `adoptExternalDeliverySuffixRefresh`, narrowed by the
          guard below. This is a provider-contract change: the schema is shared with `arc delivery refresh adopt`.

    - `[x]` **1.2.c Leave both existing scope schemas untouched**

        - `DependentRefreshExecutionScopeSchema` and `RefreshExecutionScopeSchema` are unchanged, so the execution
          scope still admits exactly its two kinds and no third kind reaches the provider branches written as a
          binary. The native kind is refused on the provider path by a typed check at the adopt guard.

- _Outcome:_ The native disclosure now matches a real arm end to end: removing it reproduces the exact failure the
  design predicted — `invalid-service-result` naming the observed fields, with no conflicts and no route forward.
  The adopt-guard refusal turned out to hold by two independent mechanisms; the typed check refuses a native scope
  before the provider's whole-blob canonicalization would reach the same verdict, so the clause is the narrowing
  the dereference needs rather than the sole protection.

### `[x]` **1.3 Carry the resubmitted resolution on the native status request**

- _Goal:_ A resubmitted resolution reaches the settle path in the same `land-status` call that consumes it, at the
  same revision, without a new operation. The state-schema additions — a reservation field and a phase value —
  belong to the decline's lease, not to this arrival.

    - `[x]` **1.3.a Add the field that carries the resubmitted resolution**

        - Both loci landed together: `NativeStatusSchema` gained an optional `conflictResolution` and
          `reconcileLinkedNativeDeliverySuffix` the matching input field, with `settleAppliedNativeLanding`
          threading the parsed value between them. The request admits the native scope alone — a
          `dependent-suffix` resolution cannot apply to a reservation-keyed suffix, so it refuses at the door.

### `[x]` **1.4 Settle under the held reservation on a canonicalizing resolution**

- _Goal:_ A resolution that canonicalizes identically to a freshly derived one settles the landing under the
  reservation already held; anything else refuses `conflict-resolution-mismatch` without claiming clearance.

    - `[x]` **1.4.a Compare the supplied resolution against a freshly derived one**

        - The disclosure now derives `resolutionInput` first and branches on whether one was supplied, mirroring the
          provider's whole-blob `canonicalize` comparison rather than a digest-field equality. Every other exit that
          reaches no conflict set refuses a supplied resolution through one shared arm, so no path accepts a
          resolution it never derived — including the short suffix that settles before collection runs.

    - `[x]` **1.4.b Keep the silent fast paths silent**

        - Both accepted proofs settle with no disclosure and no resolution, asserted per proof kind.

- _Outcome:_ The disclosure's guidance named a route that cannot succeed — resolving the listed paths moves the
  member coordinates the digest covers, so the resubmitted blob could never match. It now names the two routes
  that do: resubmit unchanged to accept the collisions, or fix and rerun without a resolution.

### `[x]` **1.5 Correct the shared refusal guidance on both native-landing arms**

- _Goal:_ Neither the suffix-proof arm nor the terminal-absorption arm names a remedy that cannot clear its own
  refusal, and both state that the reservation is kept. Amended after Task 1.1: the unmoved-suffix arm settles
  rather than refusing, so no arm this function returns directs a rerun that cannot clear it.

    - `[x]` **1.5.a Replace the unclearable remedy on both arms**

        - The suffix-proof arm survives only on `contribution-diverged`, where nothing was disclosed, so it now
          directs rebuilding the listed paths onto the member's new predecessor. The terminal-absorption arm
          directs the hand merge of the highest member into the checked-out top, which is the merge whose
          three-way conflict produced the refusal.

    - `[x]` **1.5.b Restore the reservation statement on both arms**

        - Both open with the same "Keep the reservation and" wording the neighbouring arms already use.

    - `[x]` **1.5.c Settle an unmoved suffix instead of refusing it**

        - _Added after Task 1.1._ A third arm in the same function carried an unclearable remedy. The arm
          inventory in the original note predates the finding and is left as it was written.
        - Removing the early return settles a fast-forward landing whose suffix did not move: the empty
          movement set collects no conflicts, the unchanged heads skip the local-ref rewrite, and the terminal
          base already equals the highest member's head, so contribution proof and top absorption are never
          reached and the only write is the single state publication that clears the reservation.

- _Outcome:_ Every refusal this function returns now names a repair that changes what the next run observes,
  rather than a bare rerun over unchanged refs.

## **Phase 2:** Terminal absorption conflict recovery

_Purpose:_ Give the structurally separate terminal collision a recovery route, by publishing the disclosure the
subsystem already carries and admitting the operator's hand merge as the resolution.

_Design decisions:_ Reuse `DeliveryTerminalConflictPreparation` rather than authoring a second disclosure; the
acceptance is the existing `applicability-selection` transition, not a new waiver record.

### `[x]` **2.1 Populate `conflictPreparation` on the native terminal refusal**

- _Goal:_ The native `content-conflict` refusal returns the disclosure naming the required merge parent, so an
  operator can act on it instead of on a remedy that returns the byte-identical refusal.

    - `[x]` **2.1.a Add both optional fields to the library result type and `BlockedContributionRefusalSchema`**

        - `conflictPreparation` and `externalRefRestorations` are optional on both the conflicted arm of
          `ReconcileLinkedNativeDeliverySuffixResult` and `BlockedContributionRefusalSchema`, so the refusal
          validates with either, both, or neither. The restoration element is now one named schema const, shared
          with the `conflict-resolution-required` arm that carried the same three fields inline.

    - `[x]` **2.1.b Build the disclosure on the native arm**

        - The arm hoists the absorption input it already composed and builds the disclosure from that one value,
          so `topRef`, `logicalMergeBase`, both parents, and the argv cannot drift from the merge that refused.
        - `workspace` is left unpopulated, matching the provider.

- _Outcome:_ The refusal now carries the parent pair and the exact `merge-tree` argv the absorption ran, so an
  operator merges named heads instead of rerunning a remedy that reproduces the identical refusal. The native
  logical merge base is the pre-landing highest member's head, where the provider arm reads the terminal's
  recorded base — the same commit in a well-formed chain, but sourced from what each arm actually observed.

### `[x]` **2.2 Carry the local ref restorations on the terminal arm**

- _Goal:_ Refs ARC moved itself come back with this refusal, which returns after the local member-ref rewrite —
  unlike the suffix arm, which returns before it and has nothing to restore.

    - `[x]` **2.2.a Emit the restorations with the terminal refusal**

        - Each rewrite records its own undo as it lands, so the refusal returns one entry per ref actually
          moved, carrying the head ARC wrote and the head it replaced. The suffix arm returns upstream of the
          loop and so discloses no restorations at all.

### `[x]` **2.3 Derive the hand-resolution evidence and report the operator's own residual**

- _Goal:_ An operator who merges the refreshed predecessor by hand and commits is admitted on the parent pair
  alone, and the residual reported back is their resolution rather than the whole absorbed predecessor.

    - `[x]` **2.3.a Admit the hand-merged top on its parent line**

        - The route was already complete in `absorbGitDeliveryChain`, so this pins it rather than building it:
          a hand merge is adopted carrying a tree that is neither parent's and omits the predecessor's own file,
          a merge against the wrong predecessor refuses `top-moved`, and an unclean worktree refuses
          `worktree-dirty`.

    - `[x]` **2.3.b Report the residual as the operator's own resolution**

        - The residual diff is anchored at the highest member's head, so the predecessor's content sits on both
          sides of the comparison and only the hand resolution survives it. Pinned at `classifyDeliveryDrift`,
          where the anchor is chosen, against a fixture that also offers the wider span the wrong anchor reads.

- _Outcome:_ No production code changed. The whole route — parent-line admission, and a residual scoped above
  the absorbed predecessor — was already derivable, so the increment is the evidence that it holds and the
  reconstructions proving each behavior is load-bearing rather than incidental.

### `[x]` **2.4 Prove the acceptance route through applicability selection**

- _Goal:_ Accepting an operator-absorbed terminal head is expressed by the transition that already carries the
  disclosure, the accepting identity, and a binding that dies when the content is rewritten — no record is minted.

    - `[x]` **2.4.a Exercise the selection over an operator-absorbed top**

        - The dispatch reaching `decision-required` and its `fresh` reduction with `judgmentRequired: false` were
          already asserted by the probe this work unit's planning wrote, so the increment is the two claims the
          probe stopped short of: a bounded check advances the durable baseline exactly as coverage does, and the
          acceptance stops carrying once the accepted content is rewritten. Both share the probe's absorbed-top
          fixture through one extracted helper.

- _Outcome:_ The acceptance is scoped to exact content, which is what makes minting no record safe: the
  selection binds a revision and subject digest, so a later head falls back to a fresh decision rather than
  inheriting the earlier one. Reconstructing the two guards — advancing on `covered` alone, and letting an
  accepted selection outlive its subject — turns each claim red, so neither rides on the probe's narrative.

## **Phase 3:** The decline route

_Purpose:_ Give an operator who will not adopt a landing a deliberate way out that releases the reservation
without reversing the landing.

_Exit criterion:_ A landed member wedged under a reservation is settled — by resubmitted resolution on the suffix
wedge, by the disclosed hand merge on the terminal wedge — and, on a separate run, released by decline, with a
failed lease leaving the reservation held rather than half-released.

### `[x]` **3.1 Add the `delivery native land-release` verb and its request contract**

- _Goal:_ A decline is a distinct operator intent against a held reservation, reachable without overloading the
  verb that is re-run routinely.

    - `[x]` **3.1.a Register the verb in the `delivery native` command group**

        - The eighth command in the group, beside the four `land-*` verbs, carried into both command-input
          boundary sets and the real-process coverage matrix that exact-matches them.

    - `[x]` **3.1.b Take the exact reservation selector**

        - The request carries the plan, the repository, the `remote` with its `origin` default, and the
          `operationId` naming the held reservation, registered in the command map beside the CLI verb.
        - `admitNativeDeliveryLandingRelease` composes the effect observer and the persisted-identity host poll
          as two pieces and re-derives the reconcile's three pre-checks. The reconcile itself is not called: it
          publishes a clear on its never-applied branch and preserves a `prepared` one, neither of which is this
          verb's answer.
        - The poll's own outcomes are enumerated rather than collapsed. An enqueued effect refuses under a reason
          naming it, and the poll's three refusal reasons pass through as themselves.
        - The branch key is whether a persisted effect identity exists. With none there is nothing to poll, so a
          none-landed fact holds the reservation rather than reaching the unapplied route.
        - A `prepared` reservation refuses naming that reconciliation abandons it, never a route.
        - The unapplied effect returns a `preserved` recovery envelope naming `arc delivery native land-status`,
          which owns the clear. That required one arm on the canonical recovery result, whose action literals are
          closed.

- _Outcome:_ Only a settled effect is admitted; every other reservation state refuses or routes to the verb that
  owns it. The admitted arm resolves the reservation and returns a named `release-not-composed` refusal until
  Task 3.3.b lands the restoration and the typed result — an interim that keeps `land-status` reachable rather
  than reporting a release that has not happened.

### `[x]` **3.2 Restore ARC-moved refs by lease, refusing rather than forcing**

- _Goal:_ Every ref ARC rewrote goes back under a lease check, which keeps the decline clear of the
  rebase-and-force prohibition.

    - `[x]` **3.2.a Phase-publish the observed suffix before the rewrite loop**

        - The publish sits immediately before the first rewrite, so every suffix-proof refusal and disclosure —
          including the paths-bearing ones — still returns with no state write at all. It fires only when a ref
          will actually move; a suffix that did not move settles in one publish as before.
        - `beginNativeDeliverySettlement` makes the move together, as the submission transition does: it records
          the complete observed suffix on a new optional `native.observedSuffix`, advances `native.phase` to
          `settling`, and sets `stateRevision` to the revision the publish is made **against**, which keeps the
          reservation exactly one behind current state rather than wedging it stale.
        - Member coordinates, `before`, and `requested` are untouched, so the reservation still validates and the
          landing verb can be re-run over the wedge.
        - The settle rebinds only its landing record's revision to the one the phase publish returns. The record
          keeps its post-landing projection, so the landed members and target survive the phase publish instead of
          reverting to their pre-landing coordinates.
        - The submit path's phase guard is restated from `=== "submitting"` to `!== "prepared"`, which a third
          phase value would otherwise fall through into stack reobservation and the member lock release. A
          settling reservation gets its own `settlement-in-flight` reason rather than sharing one that describes
          the opposite condition.

    - `[x]` **3.2.b Swap the rewrite arguments under a lease check**

        - `restoreNativeDeliveryLandingRefs` reads each ref and compares it against the head the settle recorded
          before calling the rewrite, so the lease is the decline's own comparison. `rewriteLocalRef` carries no
          head and could not have been its source of truth.
        - The admitted reservation carries the restoration plan itself: the recorded observed head supplies the
          lease, and the pre-rewrite head comes from the member coordinates persisted state still holds under the
          reservation. A member the settle observed but never moved contributes none.
        - The step is composed into the verb in Task 3.3, once the clear is published in the same pass. Restoring
          refs and then refusing would leave the reservation held over refs no longer where it recorded them, and
          a retry's lease would then fail against ARC's own undo.

- _Outcome:_ Both wedge arms are covered by one pass: the terminal arm restores every ref the settle moved, and
  the suffix arm, which refuses before any rewrite, records nothing and so restores nothing.

### `[x]` **3.3 Publish `activeOperation: null` at the exact revision and return the typed result**

- _Goal:_ The reservation is released at the exact revision, and the result names what was restored and what was
  deliberately left standing — the landing the host performed is not reversed.

    - `[x]` **3.3.a Publish the clear at the exact revision**

        - `releaseNativeDeliveryLanding` composes the residue reap's tail: restore every recorded ref, refuse on
          any failure, then publish the reservation's own value with `activeOperation: null` at the revision the
          decline read it at. A competing write leaves the reservation held with nothing written.

    - `[x]` **3.3.b Return the typed result naming both halves**

        - The released result carries the refs it restored and the landing it left standing — the effect and the
          members that effect covers — and takes its own arm on the handler's result union, which rewrites any
          unarmed result to a validation failure rather than returning it.

- _Outcome:_ The decline is composed end to end and the `release-not-composed` interim is retired. The cleared
  state keeps its pre-landing member coordinates, so ARC's record and the restored refs agree while the host keeps
  the merge — which is why naming the landed work is the only way the operator learns what still stands.

### `[x]` **3.4 Hold the reservation on a failed lease**

- _Goal:_ A failed lease reports the observed head and leaves the reservation held, never half-released.

    - `[x]` **3.4.a Refuse before publishing when any restoration fails**

        - The refusal names the ref, the head its lease expected, and the head actually found; the decline's own
          ref read supplies all three, where the rewrite's refusal carries no head to report. It takes its own arm
          on the handler's result union, which would otherwise reduce it to a validation failure.
        - The lease admits a ref sitting at either of its two ends, so a run that restored some refs before
          failing can be rerun: an already-restored ref is adopted rather than refused as moved.

- _Outcome:_ The refusal is recovery-complete — it names the ref and both heads, writes nothing, and leaves a
  rerun of the same verb reachable once the operator repairs the one ref it named. A partly restored decline
  resumes rather than wedging.

### `[x]` **3.5 Update the shipped delivery workflow to the changed protocol**

- _Goal:_ An operator following the shipped workflow reaches the routes this segment built, rather than one that
  no longer clears the refusal it names.

    - `[x]` **3.5.a Correct the suffix-refusal recovery statement**

        - The bare "rerun `land-status` without resubmitting" line gives way to a typed dispatch over the
          disclosure, the resolution resubmitted unchanged, and the mismatch that sends the operator back for a
          fresh disclosure.

    - `[x]` **3.5.b Add the decline verb, the terminal disclosure, and the new phase to the lifecycle prose**

        - The recovered-reservation enumeration gains the `settling` row — an applied effect whose settlement was
          interrupted after local member refs moved, which returns to polling rather than resubmitting.

        - The absorption refusal carries the merge parents and the logical merge base, so the prose names the
          hand-merge route and the read that lists the collisions rather than a bare rerun.

        - `arc delivery native land-release` takes its own dispatch, including the failed-lease refusal that
          leaves the reservation standing.

- _Outcome:_ The workflow now presents a settled landing's three exits — settle the disclosed suffix, decline and
  release, or abandon a prepared reservation through reconcile — each by verb and typed result, where it named
  only a rerun that no longer clears the refusal it described.

### `[x]` **3.6 Settle and release a wedged landing** — validate exit criterion at segment scope

- _Goal:_ Exercise the segment's capability end to end against each wedge it opens: a suffix-wedged landing
  settles by resubmitted resolution, a terminal-wedged landing settles by the hand merge its disclosure names,
  absorbed on the next `land-status`, and a separate wedged landing releases by decline with the reservation held
  on a failed lease.

- _Outcome:_ Planned as a validation pass over existing coverage, executed as a build: no fixture reached suffix
  settlement at all, so `delivery-native-suffix-e2e.ts` and `delivery-native-suffix.e2e.test.ts` are both new.
  Four built-CLI cases cover the clean settlement and all three wedges. The arrangement turns on the protected
  target carrying a commit of its own — replayed onto a landing that carries only the bottom member's tree, every
  remaining member reproduces its original tree exactly and neither collision can be represented at all. The
  rerun after the hand merge is the first exercise of the real adapters' `adopted` arms, for the member-ref
  rewrite and the terminal publish alike.

## **Phase 4:** The shared base resolver

_Purpose:_ Replace the repeated hand-rolled base derivation with one resolver whose refusal is typed once, and
carry its ambiguous and unrelated distinctions through every layer that currently re-flattens them.

_Mode:_ `layer` through Phase 5 — closes on one settled comparison substrate both singleton and delivery
readers can adopt.

_Design decisions:_ The split is four layers deep; editing `RevisionOverlapResult` alone changes nothing the
pinned probes observe. The first three layers carry each distinction as a peer status arm; the fourth reduces it
to a verdict and carries the cause as a discriminant instead. See
`notes-delivery-post-landing-conflict-recovery.md` § Propagation surfaces.

### `[x]` **4.1 Author the sole-base resolver with its four arms**

- _Goal:_ One mechanism answers "which single base" for every reader that adopts it, refusing when the answer is
  not one rather than picking, and never throwing.

    - `[x]` **4.1.a Author the resolver over its four arms**

        - `resolveSoleMergeBase` reads every best common ancestor and answers `resolved`, `ambiguous`,
          `unrelated`, or `unavailable`, never throwing and never reducing a multi-base history to a pick.

- _Outcome:_ `resolveSoleMergeBase` and `SoleMergeBaseResult` sit in `base-overlap.ts`, and
  `analyzeRevisionOverlapWithClassifier` now reads through them instead of keeping its own `--all` read. The
  adoption is deliberately behavior-preserving: an ambiguous history still reduces to `merge-base-failed` at the
  analyzer with its detail intact, so the existing overlap coverage and the pinned probes observe exactly what
  they did before, and Task 4.2 is what moves them. The `ambiguous` arm carries the cardinality rather than the
  bases themselves — cardinality is what the relation wrapper consumes, and the base identities have no named
  reader. No failure policy is baked in, so each adopting caller keeps its own.

### `[x]` **4.2 Split `ambiguous` out of `RevisionOverlapResult`**

- _Goal:_ An ambiguous history and an unanswerable read stop arriving as one word at the first layer.

- **Additional Context:** `notes-delivery-post-landing-conflict-recovery.md` § Propagation surfaces

    - `[x]` **4.2.a Add the peer `ambiguous` arm and route the multi-base branch to it**

        - The arm carries `detail` and nothing else — no merge base and no overlap, since the branch returns
          before either is read. `checkpoint-composition.ts` forwards `detail` on every non-available status and
          is compiler-silent on that field alone, which is what the arm's shape is answerable to.
        - Three sites fold the arm in fail-closed, all awaiting the same undo at Task 5.1: `predecessor-relation.ts`
          routes it to `unavailable`, and `analyzeBaseOverlap` and `status-composition.ts` route it to
          `merge-base-failed`, neither second-layer surface having an arm for it yet. Only the first was a
          compiler-forced break; the other two were non-exhaustive reason reads that the same typecheck caught.

### `[x]` **4.3 Carry ambiguous and lift `unrelated` out at `OverlapEvidence`**

- _Goal:_ The middle layer stops folding three conditions into one, so the drift-overlap reader can report which
  of them held.

    - `[x]` **4.3.a Add peer `ambiguous` and `unrelated` arms**

        - Both carry status alone. This layer already drops the first layer's `detail` for a reason enum, so
          neither new arm reintroduces one.

    - `[x]` **4.3.b Convert the two readers that narrate or classify this evidence**

        - The register narrates each in its own terms instead of leaving both on the quiet unavailable text. The
          movement classifier switches over every arm, so both new ones state `unknown` explicitly and a fifth
          arm becomes a compiler event rather than a silent `unknown`.

    - `[x]` **4.3.c Keep the two layers' arm shapes parseable across their seam**

        - Closed by conversion rather than by landing both layers at once: `observeDriftOverlap` reads this
          layer's evidence into the observation above it, reporting a base that cannot be compared from as
          unprovable. The compiler stayed silent on the seam throughout, the parse being a runtime strict-union
          check, so the window was closed by naming the site rather than by being shown it.

    - `[x]` **4.3.d Stop folding `unrelated` into `merge-base-failed`**

        - `analyzeBaseOverlap` routes each of the three conditions to its own arm.

- _Outcome:_ The drift-overlap hold goes red here, not after all three layers carry the distinction: it observes
  this layer directly, so moving it is what fires the hold. Its replacement — planned as Task 4.7.a — is
  therefore taken here, since a plan that leaves the suite red across four tasks is not one the quality gate
  admits. Task 4.7 keeps only its review-status half.

### `[x]` **4.4 Carry both distinctions through `EvidenceOverlapObservation` and the review-status path**

- _Goal:_ The third layer stops re-collapsing the pair, so the review-status reader reports the same distinction
  the analyzer established.

    - `[x]` **4.4.a Carry both arms through the observation schema and its two consumers**

        - Both land as peer statuses carrying no fields, so the base-movement observation and the base-merge
          producer carry them unchanged. The normalizer holds them fail-closed at the unproven arm — the interim
          Task 4.5 refines with the cause. The errand crossing folded them and no longer needs to: the two unions
          state the same four readings again, so it is an assignment the compiler checks rather than a conversion.

    - `[x]` **4.4.b Stop re-collapsing them on the review-status path**

        - The reader reports each arm under its own status, observed through the production status composition
          over a criss-cross history and over a base replaced by an unrelated root commit. Its `movement` field
          and the state that field drives are unchanged, because the interim reduces both arms to the verdict an
          unreadable read already took.

- _Outcome:_ All three layers now carry the distinction and the review-status hold is still green, which its
  retirement note did not expect. Nothing that hold pins has moved: the reduction behind it is the interim, so
  the state, next action, and detail it observes are still what the reader produces. Its replacement stays at
  Task 4.7.b rather than following Task 4.7.a forward; recorded there.

### `[x]` **4.5 Reduce the distinction at the normalized verdict space**

- _Goal:_ The layer the applicability reducer consumes answers its own question safely on both new arms, while the
  cause that produced them survives to the operator rather than dying at the boundary.

- _Rationale:_ This layer is not a reporting layer — it is the reduced input to a reducer answering whether prior
  evidence still carries, with three verdicts. An ambiguous base and an unrelated one are not new answers to that
  question: both mean disjointness was not established, and both reduce to the conservative verdict. A peer arm
  here would add a branch every consumer resolves identically, and would widen a published projection that is not
  about base resolution at all — the review-status reader assigns the normalized arm straight into its `movement`
  field.

- _Shape:_ The arm set stays at four, and `unknown` carries the cause — a failed read, an ambiguous base, or an
  unrelated one. `unknown` means _disjointness not established_, never _nothing known_. The reducer maps the cause
  onto its own reason, so the verdict space stays three-valued while the cause reaches the surface.

- _Note:_ The normalizer is the only place an observation is _converted_ into this layer, which is what makes it
  the forcing point. It is not the only constructor: the `not-applicable` arm has a separate origin on the three
  delta causes that read no base, and those causes cannot reach a base-resolution arm. Convert the conversion and
  leave that constant alone.

    - `[x]` **4.5.a Make the conversion this layer's forcing point**

        - The cast is gone and the crossing switches exhaustively with an `assertNever` default, so an arm added
          above now fails to compile here rather than landing on whichever branch its path shape matches —
          confirmed by adding a fifth arm and reading the error at that call. The three behaviors were already
          true, so each was reconstructed to a behavioral failure first: the pre-widening fold reduces both new
          arms to the strongest accept, and withholding the accept from an empty path list loses it entirely.

    - `[x]` **4.5.b Carry the cause on the `unknown` arm and split the reducer's reason**

        - The unproven arm carries `read-failed` / `ambiguous` / `unrelated`, and the reduction maps each onto its
          own reason — `overlap-unknown` stays with the failed read, joined by `overlap-ambiguous-base` and
          `overlap-unrelated-base`. Both the Candidate applicability result and the review-contribution result
          embed that enum, so the two new members are a contract change rather than a rename.

    - `[x]` **4.5.c Route each cause to a typed action at the two reductions that can receive it**

        - Review status reports the cause as `baseMovementCause`, beside `movement`, whose three values are
          unchanged. **An ambiguous base keeps `base-moved` / `rerun-checkpoint`** — merging the base in
          collapses the two comparison points to one, and the checkpoint is where that route is offered.
          **An unrelated base is terminal: `blocked` / `stop` under a new `base-unrelated` reason**, carrying a
          remedy that gives the two revisions a common ancestor rather than re-running the reading that cannot
          clear it. Errand merge composition carries the reduction onto its invalidated result, where the cause
          previously stopped at a fixed string. Candidate applicability is untouched, as planned.

    - `[x]` **4.5.d Make the reducer's open-ended accept branch exhaustive**

        - The accept is stated arm by arm, so an arm added later fails at the compiler here instead of taking
          `carries` by falling past one test — confirmed by admitting a probe arm through the axis guard and
          reading the error at this branch. Both preserved accepts already had rows, and flipping the branch
          fails them.
        - _Finding:_ The runtime half needed no repair, and no reconstruction could make it fail. An arm the
          design never stated is refused twice before reaching this branch — by the delta parse and by the axis
          guard, which already switches exhaustively. The contribution here is the compiler event for an arm
          those two would admit.

- _Outcome:_ The reduced layer answers both new arms conservatively while the cause survives to an action an
  operator can take, and the verdict space never widened to carry it. Two contract additions: two reason members
  on the applicability result, and `baseMovementCause` on review status.

### `[x]` **4.6 Attach the per-coordinate-pair remedy to the ambiguous arm**

- _Goal:_ An ambiguous refusal names a remedy that can actually clear it, which differs by the topology of the
  pair being compared rather than by which reader asked.

- _Rationale:_ At a `(head, base)` pair an append-only merge collapses cardinality to one, so "merge the base in"
  clears it. At a pinned-durable-baseline pair the merge moves neither element, so the refusal stands and the
  route is re-baselining. Emitting the first remedy at the second pair would name a remedy that provably cannot
  clear the refusal — the recoverable-looking dead end this design's own refusal rule forbids.

    - `[x]` **4.6.a Type the remedy as a dispatched action per pair**

        - The classifier's dispatched action carries the route instead of one rerun for every condition:
          `reconcile-base` at the drift pair, where both revisions move and the merge leaves one base where
          there were two, and `rebaseline` at the pinned-baseline pair, where that merge moves neither side.
          Both sites were converted by name, as expected — a peer arm compiled unchanged at each. The third
          case the design states, a pair where no append-only merge is permitted, still has no locus here.

- _Finding:_ An unrelated base reaches both sites and neither has a route for it: each still answers with the
  rerun that cannot clear it. This arm became reachable at Task 4.3, when the layer below stopped folding it,
  and no task in this phase assigns it a remedy — the ambiguous arm is what Task 4.6 scopes. The two pairs would
  want different answers here too, since re-baselining cannot give a pinned baseline an ancestor it never had.

### `[x]` **4.7 Replace the drift-overlap and review-status holds with plain assertions**

- _Goal:_ Both holds become plain assertions on the peer `ambiguous` status, so the suite asserts the behavior
  rather than waiting for it.

- _Note:_ Both go red as neither-shape once all three layers carry the distinction — their declared targets state
  the resolve-branch expectation the design rejects, so each replacement asserts what the design produces, never
  what the hold awaited. Seven other `expectPinnedObservation` holds elsewhere in the suite belong to adjacent
  concerns and must stay untouched.

- _Finding:_ Only the review-status hold waits for all three layers. The drift-overlap hold reads the middle
  layer directly, so it went red as neither-shape the moment that layer stopped folding — during Task 4.3, which
  is where its replacement was taken. Both replacements are as described; what did not hold is when the first
  one fires.

- _Finding:_ The review-status hold does not fire at the third layer either. Task 4.4 carried both arms to the
  observation and left the reduction behind them unchanged, so the state, next action, and detail the hold pins
  are still what the reader produces. Nothing it observes moves until that reduction does, and Task 4.5.c is the
  first task that changes it.

- _Finding:_ Nor at Task 4.5.c, which is where this phase ends for it. The design's answer for an ambiguous base
  is the rerun the hold already observes, so its `observed` never stops describing what happens and its `target`
  never arrives — the position the Candidate applicability hold is in. Nothing forces the replacement, so
  Task 4.7.b is a deliberate retirement; left standing, the hold goes red at Task 6.2 through its
  routed-obligation half.

- **Additional Context:** `notes-delivery-post-landing-conflict-recovery.md` § Pinned probes — the eight holds

    - `[x]` **4.7.a Replace the drift-overlap hold**

        - Taken in Task 4.3, where the behavior moved. The hold now asserts the peer `ambiguous` status plus
          the `unknown` movement the classifier states for it.

    - `[x]` **4.7.b Replace the review-status hold, asserting the base-movement half only**

        - The assertion is the state, the next action, and the multi-base detail; the routed-obligation half is
          left unasserted for the conversion that changes it. Pinning the detail is safe for a reason the note
          above did not expect — it predates this work unit, and the phase moved it onto the ambiguous arm with
          its text unchanged, which is also why the hold never fired on it.

### `[x]` **4.8 Give an unrelated base a route at both checkpoint pairs**

- _Goal:_ A base sharing no history with what it is compared against names a remedy that can clear it, at both
  pairs, rather than the rerun that cannot.

- _Rationale:_ Folded in from the finding recorded on Task 4.6, which scoped the ambiguous arm alone. This arm
  became reachable at Task 4.3, when the layer below stopped folding it into an unreadable read, and no task in
  this phase had assigned it a route — so both sites answer it today with a rerun that changes nothing, which is
  the recoverable-looking dead end this design's own refusal rule forbids.

- _Shape:_ The two pairs differ here as they do for ambiguity, and not in the same way. At the drift pair an
  append-only merge can still give the two revisions a common ancestor, which is the route review status already
  names for this arm. At the pinned-baseline pair neither side moves, and a fresh baseline taken from a branch
  that still shares no history with the base does not clear it either — so whatever this task emits there must
  not read as a one-step remedy that provably cannot succeed. Settle that shape in the task rather than assuming
  the ambiguous arm's answer carries over.

    - `[x]` **4.8.a Route the unrelated arm at both checkpoint pairs**

        - Both pairs dispatch `reconcile-base`, and the details differ rather than the routes: at the pinned
          pair it names the fresh baseline that has to follow the merge, because a baseline taken from a branch
          sharing no ancestry with the base shares none either.

- _Outcome:_ The per-pair distinction Task 4.6 established does not extend to this arm. An absent ancestor has
  the same prerequisite at either pair, so the two differ in what has to follow the merge rather than in whether
  one is called for at all.

## **Phase 5:** The predecessor relation and vocabulary migration

_Purpose:_ Extract the ordered-pair ancestry relation four sites already derive by hand, and migrate the one
existing spelling onto it so the two implementations cannot diverge again.

_Exit criterion:_ One resolver and one relation vocabulary exist; `predecessor-relation.ts` exports no second
ordered-pair spelling, and `eligibility.ts` decides on the overlap field rather than on a variant name.

_Design decisions:_ `unrelated` maps onto the resolver's arm rather than becoming a seventh variant; cardinality
is a field on `diverged`, not a variant.

### `[x]` **5.1 Author the predecessor-relation classifier over its six variants**

- _Goal:_ A reader asking whether a bound head is still the observed one distinguishes unmoved, append-only
  advance, rewound, diverged, absent, and unreadable — rather than collapsing them into equality-or-not.

    - `[x]` **5.1.a Classify the six variants**

        - `classifyPredecessorRelation` answers from the two ancestry readings and the revisions themselves:
          equality settles before either reading is consulted, and `diverged` requires both readings to say so, so
          an unresolvable one reports `unknown` rather than falling through to it. The vocabulary lands whole while
          the classifier's return excludes `absent`, which 5.1.b places.

        - _Finding:_ The four-arm read wrapper 5.1 describes has no subtask that lands it. 5.2.d moves
          `unrelated` onto a read arm, but nothing names the `ambiguous` arm or the fold in
          `predecessor-relation.ts` waiting on it, and 5.4.a reads as though 5.1 placed both. Added as 5.1.d.

    - `[x]` **5.1.b Settle how `absent` is reached, since it is not a topological answer**

        - Settled outside the classifier: each reader emits it from the binding it already holds, and the return
          excludes it rather than a nullable revision standing in for a missing record. A null revision cannot
          tell an absent binding from one naming a revision that no longer resolves; the reader holding the
          binding can. Stated at the classifier, where 7.3's reader will look for it.

    - `[x]` **5.1.c Carry cardinality as a field on `diverged`**

        - `diverged` carries `mergeBaseCount`, supplied to the classifier rather than derived by it: containment
          leaves exactly one best common ancestor, so the arms reached by containment need no read to state it.

    - `[x]` **5.1.d Land the read's `ambiguous` arm and undo the fold it stands in for**

        - The arm carries the pair, the resolver's detail, and the merge that collapses two bases to one; the
          fold that sent it to `unavailable` is gone. Both eligibility readers refuse it under the failed-read
          reason for now, each as its own branch rather than a widened guard, and carry the detail through so the
          refusal reports the condition it cannot yet name.

- _Outcome:_ Topology lives in a pure classifier and everything that is not a relation lives in the read around
  it. The read carries `resolved`, `ambiguous`, and `unavailable`, with `unrelated` joining them at 5.2.d once it
  stops being a relation variant. The vocabulary is stated once, so later schema literals derive from it rather
  than beside it, and widening the read is a compiler event at every consumer — both eligibility readers took one
  here, fail-closed, pending the dispositions 5.4 states.

### `[x]` **5.2 Migrate `predecessor-relation.ts` onto the relation's vocabulary**

- _Goal:_ The tree holds one ordered-pair spelling, so the defect class this work unit removes cannot recur under
  a second name.

    - `[x]` **5.2.a Split `exact` into `unchanged` and `advanced`**

        - Wired by role rather than by name: the observed tip is the bound element and the member head is the
          observed one, so a member ahead of the tip is `advanced` and one behind it is `rewound`. Equal heads
          report `unchanged`, a state the real close path reaches and the collapsed name could not report.

    - `[x]` **5.2.b Map `overlapping-ahead` onto `diverged`**

        - The arm keeps its merge base and overlap and loses only its name. Because the accepted case merges into
          the same name, the reader it fed now decides on the shared content instead.

    - `[x]` **5.2.c Split `disjoint-ahead` on ancestry direction**

        - Detected by a second ancestry read, not by the merge-base equality: the classifier answers from both
          directions, and the equality shortcut settles whether the member is behind the tip without producing
          the answer the classifier asks for. The cost is one added read on the branch that was already reading
          an overlap.

    - `[x]` **5.2.d Map `unrelated` onto the resolver's arm rather than a seventh variant**

        - The variant left the relation for the read's own arm, so the refusal that named it alongside a
          shared-content pair shed that condition and now carries no relation — there is no variant left to
          report a pair that relates by nothing.

- _Outcome:_ One spelling remains, and the compiler walked to every place the old one was read. Because the
  accepted and the refused case now share `diverged`, the prepare-time reader decides on the content the pair
  shares rather than on the name, and `samePredecessorRelation` moved with the variants as the callsite it is.
  Two spellings are deliberately still standing: the request contract restates its literals rather than deriving
  them, and `diverged` carries a chain base only where the pair shares nothing — 5.5.a and 5.3.a own them.

### `[x]` **5.3 Migrate `samePredecessorRelation` and the payload destinations with the variants**

- _Goal:_ Every payload field a variant carries today stays reachable after the migration, and the comparison
  that reads them field by field moves with the variants rather than after them.

    - `[x]` **5.3.a Carry `chainBase` unconditionally on `diverged`, with the close-time overlap test alongside**

        - `chainBase` rides every `diverged` pair now, at the merge base both directions already name — through
          the producer and the nested request contract. The close-time reader gained the overlap refusal the
          absent field stood in for, decided on the fresh observation and ahead of the snapshot comparison,
          which a snapshot carrying its own overlap passes.
        - With the field total and that refusal unwritten, a submitted overlap closed `eligible`.

    - `[x]` **5.3.b Migrate the field-by-field comparison with the variants**

        - The comparison reads the merge-base count alongside the coordinates, and the field it reads rides the
          relation the producer builds — taken off the classified variant rather than restated beside it.
        - The `unrelated` branch was already gone: 5.2 removed it as a forced callsite when that variant left the
          relation for the read's own arm.

- _Outcome:_ Every field the retired vocabulary carried is reachable on the migrated one, and the comparison that
  reads them field by field moved with it rather than after it. `diverged` gained a total `chainBase` and the
  merge-base count; on this path the count is always one, since a pair leaving more than one base leaves by the
  ambiguous arm before any relation is built, so a value above one first arrives with Task 6.6's adoption. The
  close-time reader no longer refuses shared content by a field's absence — it tests for it, ahead of a
  comparison that an inadmissible snapshot passes.

### `[x]` **5.4 Re-point `eligibility.ts`'s accept and refuse split onto the overlap field**

- _Goal:_ The reader decides on the overlap rather than on a variant name, which is what lets one variant carry
  both an accepted and a refused case.

    - `[x]` **5.4.a Decide on the overlap field**

        - Both readers state a disposition per arm rather than letting any fall through: `unrelated-predecessor`
          is terminal, `ambiguous-predecessor-base` is recoverable through the merge the read already composed,
          and `unchanged` and `advanced` accept — they carry no overlap because the classifier returns on the
          ancestor branch before one is taken.
        - The ambiguous reason is deliberately not applicability's `merge-base-ambiguous`; one literal for both
          would re-merge the two routes the design keeps apart.

    - `[x]` **5.4.b Give the close-time reader its own overlap decision**

        - _Goal:_ The second reader refuses a non-empty overlap because it tested for one, not as a side effect
          of a field being absent.

        - The reader states which variants reach its accept and why each does, so none arrives there by falling
          through: `rewound` diffs empty against the merge base and has no overlap that could refuse, `unchanged`
          and `advanced` return before one is read, and `diverged` alone is decided by content. The stated
          behaviors were covered as the refusal landed in 5.3.a and the empty-overlap close in 5.3.b.

    - `[x]` **5.4.c Re-point both `chainBase` readers onto the migrated shape**

        - Both absent-base branches are gone, along with the nullable helper that was keeping them compiling;
          each reader takes `chainBase` off the relation directly. What survives at the second reader is the
          coordinate check it always was, now stated as one.

    - `[x]` **5.4.d Widen the remedy slot and convert the projection that reads it**

        - The remedy slot became a union of the two kinds and every reader of it moved together, including the
          emitted result union. A reason literal with no arm there does not degrade quietly as the remedy would:
          it fails the union parse outright and the refusal reaches the operator as an invalid service result.
        - The projection takes the observed tip from the refusal itself where no relation carries one.

- _Outcome:_ The split rests on the overlap field at both readers, so one variant carries an accepted and a
  refused case without a name having to mean either. The two conditions that are not about overlap at all left
  under reasons of their own — one terminal, one recoverable — each carrying the observed tip itself, since
  neither relates by a variant that could report it. The close-time accept is now reached by statement rather
  than by a field's absence, and the branch that stood in for that statement is gone.

### `[x]` **5.5 Update `PredecessorRelationSchema`'s literals through the request contract**

- _Goal:_ The literals one verb writes and another reads back move together, so no close request carries a
  vocabulary the reader no longer knows.

    - `[x]` **5.5.a Move the literals through the nested request contract**

        - The schema is pinned to the library's own relation type, so a variant renamed or reshaped there stops
          compiling here instead of being read back under a spelling this contract still recognizes.
        - A variant merely _dropped_ stays assignable and slips past the compiler — verified, not assumed. What
          catches that is a round-trip over relations the producer actually builds: removing one arm turns its
          close request into `invalid-command-input`, which is this task's goal stated as a failure.

- _Outcome:_ The two spellings can no longer come apart, and it takes both mechanisms to say so: the compiler
  holds the names and shapes, and a round-trip over producer-built relations holds the arm set the compiler is
  blind to. The literals themselves had already moved with the variants, so what landed here is the coupling
  that keeps them moved.

## **Phase 6:** Reader adoption across the conversion set

_Purpose:_ Convert every reader D4 places in scope onto the shared resolver or the relation, so one traced
defect class is removed everywhere it was traced rather than at the instance that surfaced it.

_Mode:_ `replication` — closes on the enumerated conversion surface exhausted and batch-verified.

_Exit criterion:_ A two-merge-base history produces a typed refusal at every converted reader, with no subject,
digest, or overlap derived from an arbitrary ancestor, and both propagations carry their widened result to every
consuming call site.

_Design decisions:_ The two allocated-but-unconverted readers and the five out-of-scope silent picks are
recorded exclusions. See `notes-delivery-post-landing-conflict-recovery.md` § Recorded exclusions.

### `[x]` **6.1 Adopt the resolver at the subject reader and derive the subject from the single base**

- _Goal:_ The subject is the base-relative diff from one resolved base, so a two-base history refuses instead of
  naming the base's own change as the contribution.

    - `[x]` **6.1.a Derive the subject from the single resolved base**

        - `collectGitCandidateSubject` resolves through `resolveSoleMergeBase` and answers `collected` or a
          `merge-base-ambiguous` refusal. A base that cannot be read, and one sharing no lineage, still raise:
          only the choice made silently is converted. Two integration cases pin the base-relative set against the
          commit-derived one that was falsified — the reverted path absent, the merge-retained path present.

- _Outcome:_ `collectGitCandidateTarget` survives as a wrapper raising the refusal, so the eleven call sites keep
  compiling until each takes its own policy. Its removal is the whole of Task 6.3. The refusal also reached the
  review-status fixture, which attested a Candidate over the criss-cross history it then measured: attesting
  there is now refused, so `arrangeAmbiguousMergeBase` gained a deferred base push and the fixture publishes the
  second ancestor after attestation — the order a real Candidate reaches that state in anyway.

### `[x]` **6.2 Adopt the resolver at the overlap, effective-target, and repository-target readers**

- _Goal:_ Each of the three records or diffs from one refused-or-resolved base, and the local review host stops
  examining a change set derived from an arbitrary ancestor.

- **Additional Context:** `notes-delivery-post-landing-conflict-recovery.md` § Recorded exclusions

    - `[x]` **6.2.a Adopt at the overlap analyzer**

        - Already taken at Task 4.1.a, which routed `analyzeRevisionOverlapWithClassifier` through the resolver
          in place of its own `--all` read; Tasks 4.2 through 4.5 then carried both distinctions out of it.
          Nothing remained here.

    - `[x]` **6.2.b Adopt at the effective-target reader**

        - `readGitCandidateTargetBase` answers `resolved` or a `merge-base-ambiguous` refusal, dropping the
          reader's own `--all` parse. A target with no base at all still raises, apart from one recording more
          than one — the two readings the single throw had been giving the same words.
        - `resolveGitCandidateTargetBase` stays on as the raising wrapper for its five call sites, so what the
          ledger records is still exception text until Task 6.5; what moved is which condition it names.

    - `[x]` **6.2.c Adopt at the repository target and map into the existing reason set**

        - `ambiguous-merge-base` is a new member of `LocalTargetInvalidReason`, raised through the typed error
          the reader already uses. It is named for its neighbour `no-merge-base` rather than for the
          `merge-base-ambiguous` the other converted readers carry: a consumer switching on this enum reads the
          two side by side, and the pair is the distinction the phase exists to keep.
        - The unconverted member returns worse than the undefined precondition the plan expected. The diagnostic
          is strict, so `precondition: undefined` fails the envelope's own parse and the handler raises a schema
          error in place of emitting anything — the operator gets no typed refusal at all rather than an
          incomplete one.

- _Outcome:_ Each of the three took a different channel, which is what D4's per-reader allocation predicts and a
  shape-based one would have flattened: the overlap analyzer needed nothing, the effective-target reader answers
  through a widened result, and the repository target raises through the closed error it already had. No new
  error family, and no reader left picking.

### `[x]` **6.3 Propagate the collector's widened result across its eleven call sites**

- _Goal:_ Every consumer of the widened collector result handles the new refusal explicitly, each applying its own
  failure policy rather than inheriting one baked into the resolver.

- **Additional Context:** `notes-delivery-post-landing-conflict-recovery.md` § Propagation surfaces

    - `[x]` **6.3.a Propagate through the direct call sites**

        - Nine, and they do not all answer alike. The three in delivery execution return a typed refusal;
          the effective-target, checkpoint-composition, and respond-composition readers raise, because every
          arm of what each returns names a current target by digest and a subject never collected has none.
        - `candidate-verification-unavailable` rather than `candidate-not-current`: a reason is reusable when
          what it asserts is true of the refusal, and not-current asserts a comparison this path never reached.
          Reading it as movement would report a settled Candidate as a stale one.

    - `[x]` **6.3.b Propagate through the injected dependency lambdas**

        - Attestation and applicability each ask for one exact target, so their dependencies answer with one or
          not at all and the refusal leaves both lambdas raised. Each names the condition where it is decided
          rather than inheriting a policy from the reader.

    - `[x]` **6.3.c Convert the terminal record advance proof's arm to no-proof**

        - A subject that could not be collected proves no advance, and a movement nothing proves is exactly the
          one that keeps no public review — so the absent proof is the whole answer and carries no reason.

- _Outcome:_ Removing the raising wrapper is what forced the pass, but not what the pass was: the compiler
  enumerated the sites and each then had to be read for what its own result can say. Most still raise, which is
  the point of the exercise rather than a failure of it — the decision and the words are now local, and a later
  reader confronts the arm instead of inheriting it. Test fixtures that only want a subject take one shared
  helper, so the raise a fixture inherits is visibly a fixture's and not a consumer's.

### `[x]` **6.4 Admit attestation's new refusal at the lifecycle ceremony**

- _Goal:_ Attestation refuses a two-base history rather than attesting a subject derived from an arbitrary
  ancestor, and the refusal reads as a ceremony outcome rather than an internal error.

    - `[x]` **6.4.a Surface the refusal as a ceremony outcome**

        - The subject is collected as a ceremony precondition beside the open-task, unstaged-path, and delivery
          renewal checks, so the refusal carries the `rejected` envelope and spine remedy they do. The target
          dependency handed to `runAttest` no longer raises.
        - The remedy names merging the configured base in, and is asserted by running it: one repository refuses
          and then attests, which is also where the single-base arm is observed through the ceremony.

- _Outcome:_ Attestation's own result had no slot for this. Every refusal `runAttest` returns names a Candidate
  and the subject digest it was measured against, and a subject never collected has neither — the same reading
  that gave each consumer its own policy at Task 6.3. So the refusal is the ceremony's, standing beside its other
  preconditions, rather than a fourth arm of the verb's result.

### `[x]` **6.5 Propagate the target-base resolver's widened result across its five call sites**

- _Goal:_ The second propagation's consumers handle the new refusal too, so a reader converted through one
  propagation is not left unconverted through the other.

- **Additional Context:** `notes-delivery-post-landing-conflict-recovery.md` § Propagation surfaces

    - `[x]` **6.5.a Propagate through all five call sites**

        - Three channels again. Review status blocks in its own words at both of its sites; the checkpoint and
          respond readers raise, where each already raised for a subject it could not collect; and the reconcile
          path returns `ambiguous-predecessor-base` — the reason the eligibility readers give this same
          condition, and already an admitted arm of that command's result. The coordinate reason a line above it
          asserts something else: the Candidate's own coordinate, which was just read.
        - `resolveGitCandidateTargetBase` is gone, with no reference left in `src/` or `__tests__/`.

- _Outcome:_ The assertion this task was warned about did not have to move. The wrapper's text was already in the
  status reader's voice, beside its sibling literals, so what changed is that the reader composes the statement
  instead of a catch-all reporting an exception — and a base that cannot be read at all still raises past it,
  which is the distinction that catch-all had been hiding.

### `[x]` **6.6 Adopt the relation at Candidate applicability**

- _Goal:_ Base movement under a baseline is classified by the relation, with cardinality carried as the field its
  only deciding consumer reads.

    - `[x]` **6.6.a Classify base movement through the relation**

        - The pinned baseline is the bound element and the observed base the moved one, so a base that took the
          baseline in reads as `advanced` and a criss-cross as `diverged`. Two `--is-ancestor` reads join the
          existing `--all` count, and a read that failed answers `unresolvable` and stops as a Git failure rather
          than arriving as the verdict that neither side contains the other.
        - `merge-base-ambiguous` took its own result arm instead of optional fields on the four-reason one, so a
          refusal cannot ship without its cardinality. The four strings are untouched, and the remedy names
          re-baselining: both elements of this pair are fixed, so merging advances the branch and moves neither.

- _Outcome:_ The disclosed contract change cost less than the plan budgeted for it. The resolution wraps the whole
  result schema as its projection rather than restating a field set, so the two added fields reach the operator
  without a second edit — the failure mode that dropped a remedy in projection elsewhere has no purchase here.
  What the plan did not anticipate is where the cost landed instead: the unit stubs answered the new containment
  question with the `--all` reply, which placed an ambiguous pair as an append-only advance.

### `[x]` **6.7 Replace the four history-shape holds with plain assertions**

- _Goal:_ The history-shape probe file asserts the settled behavior at every hold it carries, with none left
  asserting nothing.

- **Additional Context:** `notes-delivery-post-landing-conflict-recovery.md` § Pinned probes — the eight holds

    - `[x]` **6.7.a Replace the committed-arm subject and digest sibling holds**

        - Taken at Task 6.1, which is where both went red: the collector refuses, so the committed arm reports no
          paths to hold and the digest sibling has no ambiguous digest to compare. The replacements assert the
          refusal, and the sibling keeps its control — identical content on both arrangements, so the shape of
          the history is all that separates the outcomes.

    - `[x]` **6.7.b Replace the staged-arm hold**

        - Taken at Task 6.1 with its sibling, by the spent route its `target` declared: the staged arm refuses.

    - `[x]` **6.7.c Retire the Candidate applicability hold deliberately**

        - Its `target` awaited the applicable classification the design rejects and its `observed` is the
          refusal the design keeps, `detail` included — so no run could redden it. The replacement asserts that
          refusal over the same arrangement the file's other boundaries are read against, leaving the
          cardinality and remedy asserted where they were added.

- _Outcome:_ The file carries no hold at all now, so the boundary story it tells is asserted end to end rather
  than partly held. Three of the four went red on their own — two reporting themselves spent, one reaching the
  target it declared — and only this one needed the decision, because a hold whose `target` the design rejects
  and whose `observed` it keeps has no route to red at all.

### `[x]` **6.8 Exhaust the conversion set** — validate exit criterion at segment scope

- _Goal:_ Batch-verify the enumerated surface: a two-merge-base history refuses typed at every converted reader,
  and both propagations reach every consuming call site.

- _Outcome:_ The criterion's two halves take different proofs, which is what sizes the gaps the plan could not.
  Readers must be observed refusing — all six are, each over a real two-base history — while call sites must
  carry, which the compiler proved when both wrappers were deleted with no reference left to either. That makes
  the refusals reached by no case carried rather than uncovered, except the reconcile arm: the only one emitting
  rather than raising, and its envelope degrades an unadmitted field to a service fault silently, now observed
  both ways. The checkpoint raise gained a case naming its own words, and attestation from Integrating reaches
  the subject refusal — the renewal read runs first but reads records, not history.

## **Phase 7:** Ancestry-aware readiness and per-term closeout

_Purpose:_ Make the two readers that currently collapse distinct causes report them — a stale binding apart from
an absent one, and a failing closeout term apart from the other thirteen.

_Mode:_ `slice` — closes on a reader distinguishing the causes it currently shares one word for.

_Exit criterion:_ Review readiness returns `in-plan-unbound` where it previously found nothing, and closeout
names the observed condition for each of the fourteen conditions that currently reach `terminal-unsettled`.

_Design decisions:_ Readiness resolves by deliverable identity behind a fifth lookup interface;
`resolveDischargeTargets` is eliminated because it relocates the conflation one reader over.

### `[x]` **7.1 Add the deliverable-keyed lookup as a fifth interface**

- _Goal:_ A caller holding a deliverable identity can resolve its member without keying on a head, through a
  result whose arms express every outcome readiness reports today.

    - `[x]` **7.1.a Author the method and its six-arm result**

        - `resolveMemberByIdentity` takes the route `resolveTerminalRecords` already takes — plan read, state
          read, coherence check — behind its own name, and its `bound` arm reuses `DeliveryMemberBinding`, so the
          final-member flag reaches the caller together with the plan, deliverable, work unit, and recorded head
          rather than a coordinate alone.
        - Membership is asked of the plan ahead of the state read. That ordering is what lets a plan carrying no
          state record still answer by deliverable instead of collapsing every such member into one word.

    - `[x]` **7.1.b Keep the lookup interface single-method**

        - The capability is its own `DeliveryMemberIdentityLookup`, so `DeliveryMemberLookup` still exposes only
          `resolveMemberByHead` and the repository adapter implements a fifth interface beside the four.

- _Outcome:_ The designated body's two `unbound` returns and one of its `unavailable` returns separate into four
  arms, and the read order is what buys them: the plan enumeration answers `no-plan`, the plan's own member list
  answers `not-in-plan` before any state is read, and only past both can a missing record or a null coordinate
  mean `in-plan-unbound`. The sixth arm is authored and unreachable — nothing asserts a caller-supplied plan id
  yet, which is what Task 7.2 adds.

### `[x]` **7.2 Assert the caller-supplied plan id explicitly inside the new method**

- _Goal:_ A request naming the wrong plan is refused as a plan mismatch rather than passing unchecked or arriving
  as a deliverable miss.

    - `[x]` **7.2.a Assert the plan id and return `plan-mismatch`**

        - The assertion sits between the single-plan resolution and the deliverable membership check, so a wrong
          plan refuses as a mismatch rather than arriving as a deliverable miss. Plan ids compare without case
          while the deliverable and work unit beside them compare exactly, which preserves today's admission.

### `[x]` **7.3 Invert review readiness to resolve by identity, then compare by relation**

- _Goal:_ A stale binding and an absent binding become distinguishable, because the reader now finds the member
  and then compares its recorded head against the observed one.

    - `[x]` **7.3.a Resolve by deliverable identity**

        - The reader hands the vehicle's own three fields to the deliverable-keyed lookup, renaming the work unit
          it spells as a slug. The four identity misses take the paths the three post-hoc comparisons used, so
          the emitted code and paths are unchanged while the resolution order is inverted.

    - `[x]` **7.3.b Compare the recorded head against the observed one by relation**

        - `classifyPredecessorRelation` takes the recorded head as bound and the head under review as observed:
          `unchanged` and `advanced` admit, and every other reading reports `delivery-member-stale`. Only the
          forward direction is read, which also leaves `diverged` unreachable — the one variant carrying a
          cardinality — so no count is ever supplied that nothing read.
        - Ancestry is a second authority the module could not reach, injected beside the lookup from the same
          composition root and pinned to that root. An absent reader answers `unresolvable`, so an unmoved
          binding is still admitted and a moved one is never admitted without the read.

- _Outcome:_ The distinction lands by narrowing rather than by adding: `delivery-member-unbound` now means the
  plan carries this member and records no head for it, so a repository whose plans carry the work unit not at all
  reports an identity miss instead. That reaches two live assertions about composition-root binding, which now
  name the miss they actually get. The design costed this inversion as the lookup alone; the ancestry read is a
  second cost it did not carry, and pinning that read to the resolved root — rather than to whatever directory
  the process is in — is what the first run got wrong. The readiness probe reached its declared target here
  rather than at Task 7.6, so 7.6.a landed in this increment.

### `[x]` **7.4 Retire `delivery-member-mismatch` and emit the arm-specific outcomes**

- _Goal:_ The reader stops emitting one code three times over, discriminated only by path, and each surviving
  outcome carries its own remedy.

    - `[x]` **7.4.a Drop the tautological emission and route the other two**

        - The three emissions become `delivery-plan-absent`, `delivery-plan-mismatch`, and
          `delivery-member-not-in-plan`. Each keeps the path it had and each names the act that clears it —
          reserve a plan, re-read the plan id, re-read the deliverable id — so no remedy directs a caller at
          inputs that never reach what failed. The retired code is emitted nowhere in source.

- _Outcome:_ The work-unit emission was tautological only as a comparison. Resolving by the key does retire the
  post-hoc check, but _no plan carries this work unit_ is a real miss that had no emission of its own before, and
  it takes the retired path — so the three codes out are not the three codes in: two are renamed survivors and
  one is new.

### `[ ]` **7.5 Give each of closeout's fourteen conditions a distinct reason and typed remedy**

- _Goal:_ A caller told the terminal is unsettled can tell which term failed and act on it, instead of receiving
  one word reachable fourteen ways with a remedy directing a rerun over inputs that never reach the failing term.

- _Rationale:_ The one reason is reachable three ways in the same function — a five-condition pre-guard before
  the conjunction is built, an unobserved host request, and the eight-term conjunction itself. The relation
  supplies the vocabulary for the one term that was ancestry-blind; the other terms need only stop sharing a
  word. Giving only the relation's term a distinct reason is the recorded rejected alternative: it fixes the
  ancestry row while leaving the report-the-observed-condition clause unsatisfiable for the other thirteen.

- _Shape:_ The two halves land in different places. The settlement result types its blocked reason as the single
  literal `"terminal-unsettled"`, so fourteen reasons widen that union — and it has a second consumer, where
  `retireCompletedDeliveryRecords` spreads the blocked result straight into its own free-string retirement result.
  The reasons also share a namespace with closeout's own blocked reasons, which the terminal reason reaches bare
  while closeout prefixes its own, so each needs a distinguishing shape of the kind `terminal-unsettled` already
  carries. The typed remedy is the second contract addition: it lands on the emitted closeout refusal, derived
  from the reason, replacing the prose remedy there.

    - `[x]` **7.5.a Replace the equality term with the relation**

        - The head-equality term becomes the relation's admission: a terminal merged at a descendant of the head
          it binds is the same landed contribution and settles, while every other reading — an ancestry the read
          could not establish included — stays unsettled. The reader is a second authority the library could not
          reach, required rather than optional in the retirement dependencies, and pinned to the resolved
          checkout at the one composition root that builds them.

    - `[x]` **7.5.b Give the pre-guard's five conditions distinct reasons**

        - The guard was one boolean over five conditions, so it had to be resequenced rather than split: the
          absent terminal member is what the other four dereference, and only once it answers for itself can an
          unbound ref, request, or coordinate answer for theirs. That first miss is unreachable past coherence
          against the plan, and keeps the reader total rather than guarding a live case.

    - `[x]` **7.5.c Give the unobserved host request its own reason**

        - The host withholds the request six ways and none of them is a reading of it, so a caller clears every
          one by observing again rather than by correcting a field. The six keep one reason between them, which
          is the sizing the design costed.

    - `[x]` **7.5.d Give the conjunction's eight terms distinct reasons**

        - Each term becomes its own guarded return in the order the conjunction evaluated them, so the first
          failing term is the one reported and no later term's read runs against an input an earlier one already
          refused. The relation's term reports a head that moved, which is exactly what reaching it means:
          equality is settled before any ancestry answer is consulted, so the heads differ and what is
          unestablished is only whether the difference is the advance this settles on.

    - `[ ]` **7.5.e Derive the emitted refusal's dispatchable remedy from the reason**

        - Bounded to the fourteen terminal conditions. Closeout's own reasons keep their prose remedy; this task
          does not widen to the whole free-string reason space it emits beside them.
        - Two loci, as in 2.1.a: the closeout result's blocked arm — five fields, no remedy among them — and the
          handler's closeout blocked schema, a `z.strictObject` of the same five. The handler returns the library
          result unchanged, so emitting a remedy without both edits yields an invalid service result.
        - The terminal reason reaches closeout's output under two spellings — bare, and prefixed once retirement
          re-runs the same verification — so the distinguishing shape must hold for both.
        - Build `test-first` (one behavior at a time):

            - Each of the fourteen conditions reports its own reason
            - No terminal reason collides with a closeout reason
            - Each reason yields a typed remedy the caller dispatches rather than prose it re-authors
            - A moved head is distinguishable from a wrong base ref
            - A merged-past-the-bound-head terminal returns closed-out rather than unsettled

### `[x]` **7.6 Replace the review-readiness binding and terminal head-movement holds**

- _Goal:_ Both probe files assert the settled behavior, leaving no hold in the four files this boundary owns.

- **Additional Context:** `notes-delivery-post-landing-conflict-recovery.md` § Pinned probes — the eight holds

    - `[x]` **7.6.a Replace the review-readiness binding hold** — landed with Task 7.3

        - Inverting the reader is what reaches the hold's declared target, so the helper reported it spent in
          that same change and the replacement could not wait. It asserts the target directly and adds the
          reading the target implies: a head its binding does not contain is refused as its own condition,
          distinct from a member the plan holds with nothing recorded for it.

    - `[x]` **7.6.b Replace the terminal head-movement hold** — landed with Task 7.5.a

        - Correcting the comparison is what reaches the hold's declared target, so the helper reported it spent
          in that same change. The replacement asserts that target and the reading it implies beside it: a head
          merged behind the one the record binds is not the landed contribution and stays unsettled.

- _Outcome:_ Neither hold took a pass of its own. Each went red in the increment that corrected the reader it
  held — the readiness binding at Task 7.3, the head movement at Task 7.5.a — and by the same route, the helper
  reporting the hold spent rather than neither-shape. That empties the last of the four probe files this boundary
  owns, so no `expectPinnedObservation` call remains in any of them.

### `[ ]` **7.7 Distinguish a stale binding from an absent one** — validate exit criterion at segment scope

- _Goal:_ Exercise the segment's capability: a member whose head advanced reports a stale binding at review
  readiness, and closeout names the observed condition rather than one shared word.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` A real overlapping base change that prevents the host's rebase of a successor yields an exact actionable
  resolution offer, and approved successor and top resolutions settle the retained operation and continue the
  delivery.
- `[ ]` New member heads receive fresh applicability, review, and checks before landing.
- `[ ]` Stale decisions, undisclosed divergence, ref collisions, incomplete suffix observations, and ambiguous
  host results still refuse without claiming clearance.
- `[ ]` A two-merge-base history produces a typed refusal at every converted reader — no silent pick, and no
  subject, digest, or overlap derived from an arbitrary ancestor.
- `[ ]` A stale binding and an absent binding are distinguishable at review readiness, and closeout reports a
  distinct reason for each of the fourteen conditions that currently reach `terminal-unsettled`.
- `[ ]` Resolving a disclosed terminal collision by hand merge settles the landing, and the native arm's refusal
  returns a populated `conflictPreparation` whose `parents.refreshedPredecessor` names the required merge parent.
- `[ ]` `delivery native land-release` takes the exact reservation selector, restores every ref ARC moved by
  lease, publishes `activeOperation: null` at the exact revision, and returns a typed result naming what it
  restored and what it left standing; on a failed lease it reports the observed head and leaves the reservation
  held.
- `[ ]` No `expectPinnedObservation` hold remains in the four probe files this boundary owns, and the suite is
  green with none of them asserting nothing.
- `[ ]` `predecessor-relation.ts` exports no second ordered-pair spelling and no caller reads its `exact` arm.
- `[ ]` The shipped `deliver-stack.md` describes the protocol as changed — no instruction to settle a suffix
  reconciliation refusal by rerunning `land-status` without resubmitting, and the decline verb present in the
  native landing lifecycle it drives.
- `[ ]` An ambiguous or unrelated base reaches the operator with a remedy that can clear it, or with a terminal
  statement that stops inviting one, at both eligibility readers and both reductions that can receive the
  normalized cause — none reporting a retry it cannot satisfy, and none shipping with its remedy dropped in
  projection.
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration
