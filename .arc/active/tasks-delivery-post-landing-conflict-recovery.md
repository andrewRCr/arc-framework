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

### `[ ]` **2.1 Populate `conflictPreparation` on the native terminal refusal**

- _Goal:_ The native `content-conflict` refusal returns the disclosure naming the required merge parent, so an
  operator can act on it instead of on a remedy that returns the byte-identical refusal.

- _Rationale:_ This edits the library result type and the schema arm; it is not the population of an existing
  optional field. `ReconcileLinkedNativeDeliverySuffixResult`'s conflicted arm is `{ status, reason, paths,
  guidance }` with no `conflictPreparation`, and `BlockedContributionRefusalSchema` is a `z.strictObject` of the
  same four fields, so a populated object would fail validation at runtime rather than at the compile boundary.
  `RetainedOperationBlockSchema` carries the field but additionally requires `operationId` and `nextAction`.

- _Note:_ `BlockedContributionRefusal` is not a third locus. It is a file-local conditional type whose only
  consumer is `ProviderAdoptionBlockedResult`; nothing on the native path routes through it, so widening it buys
  nothing and would drag an unrelated base-merge observation into this change.

- _Note:_ Three arms of the handler union already carry `conflictPreparation` and none is the slot — the third
  belongs to the review-fix continuation union, which carries it required beside its own stop and resume fields.
  `RetainedOperationBlockSchema` needs no edit — it has the field, and additionally requires `operationId` and
  `nextAction`. A separate arm pinned to the `content-conflict` reason literal carries it as required beside
  `paths` but admits no `guidance`; emitting that arm instead is the rejected shortcut, since the arm would delete
  the guidance 1.5 corrects and reversing the translation is a user-facing surface change. The native path
  translates `content-conflict` into `contribution-conflicted` at one site; the other translation belongs to the
  provider adopt path.

    - `[ ]` **2.1.a Add both optional fields to the library result type and `BlockedContributionRefusalSchema`**

        - `conflictPreparation` and the local ref restorations 2.2 emits land in the same edit. The schema is a
          `z.strictObject` and the only `externalRefRestorations` in the handler belongs to the unrelated
          `conflict-resolution-required` arm, so emitting restorations without a slot fails validation at runtime
          exactly as a populated `conflictPreparation` would.
        - Build `test-first` (one behavior at a time):

            - A terminal conflict refusal validates with `conflictPreparation` populated
            - A terminal conflict refusal validates with the ref restorations populated
            - The same refusal still validates without either, so existing producers are unaffected

    - `[ ]` **2.1.b Build the disclosure on the native arm**

        - `settleReservedDeliverySuffixRefresh` already builds it on this same refusal on the provider path.
        - Leave the optional `workspace` unpopulated, matching the provider, which never sets it either. Its one
          reader selects the workspace as the resolution locus when present and falls back to `topRef` otherwise,
          which is the locus a native operator resolves in.
        - Build `test-first` (one behavior at a time):

            - `parents.refreshedPredecessor` names the refreshed member head the operator must merge
            - `topRef`, `logicalMergeBase`, and the exact `merge-tree` argv are carried through unchanged

### `[ ]` **2.2 Carry the local ref restorations on the terminal arm**

- _Goal:_ Refs ARC moved itself come back with this refusal, which returns after the local member-ref rewrite —
  unlike the suffix arm, which returns before it and has nothing to restore.

    - `[ ]` **2.2.a Emit the restorations with the terminal refusal**

        - Build `test-first` (one behavior at a time):

            - A terminal conflict after the rewrite reports every ref ARC moved
            - The suffix arm reports none, because none moved

### `[ ]` **2.3 Derive the hand-resolution evidence and report the operator's own residual**

- _Goal:_ An operator who merges the refreshed predecessor by hand and commits is admitted on the parent pair
  alone, and the residual reported back is their resolution rather than the whole absorbed predecessor.

- _Rationale:_ Two of the composition's three inputs are recorded rather than observed and the third follows the
  host's landing, so no act of the operator is an input and resolve-and-rerun returns the identical refusal. The
  complete route sits one layer above: `observeExactAbsorption` accepts a commit on its parent pair alone,
  whatever its tree, when `rev-list --parents -n 1 HEAD` is exactly `<head> <top.head> <highestMember.head>` and
  the worktree is clean. Derive the evidence rather than writing it — `priorTop` is data applicability holds.

    - `[ ]` **2.3.a Admit the hand-merged top on its parent line**

        - Build `test-first` (one behavior at a time):

            - A hand merge of the refreshed predecessor is admitted with an arbitrary resolved tree
            - A commit whose parent line does not match is refused
            - A dirty worktree is refused

    - `[ ]` **2.3.b Report the residual as the operator's own resolution**

        - Regression coverage over behaviour the derivation already produces, not a change to it: the drift
          classification computes its residual paths from the highest coordinate against the baseline, so an
          operator-absorbed top already reports their own resolution rather than the whole absorbed predecessor.
          Assert that; do not add a channel from absorption into the residual computation.

### `[ ]` **2.4 Prove the acceptance route through applicability selection**

- _Goal:_ Accepting an operator-absorbed terminal head is expressed by the transition that already carries the
  disclosure, the accepting identity, and a binding that dies when the content is rewritten — no record is minted.

- _Rationale:_ Two checkpoint mechanisms hold the terminal member: the coordinate advance proof withholds a proof
  because the absorbed commit is not an ancestor of the Candidate's recognized target, and the applicability
  dispatch demands a resolution selector on `decision-required`. That selection is the acceptance.

- _Note:_ The transition kind is `applicability-selection`, not its sibling `review-applicability-selection`,
  which carries distinct handling on the review-fix path. Reusing the `review-terminus/v1` family is rejected on
  source — its discharge reader matches on the vehicle without inspecting `kind`, so a second `kind` there would
  discharge hosted review for an unreviewed head.

    - `[ ]` **2.4.a Exercise the selection over an operator-absorbed top**

        - Build `test-first` (one behavior at a time):

            - The dispatch reaches `decision-required` and the selection settles it
            - The decision surface carries the `fresh` evidence reduction with `judgmentRequired: false`
            - `covered` and `targeted-check` are both offered, neither being the forced path

## **Phase 3:** The decline route

_Purpose:_ Give an operator who will not adopt a landing a deliberate way out that releases the reservation
without reversing the landing.

_Exit criterion:_ A landed member wedged under a reservation is settled by resubmitted resolution and, on a
separate run, released by decline — with a failed lease leaving the reservation held rather than half-released.

### `[ ]` **3.1 Add the `delivery native land-release` verb and its request contract**

- _Goal:_ A decline is a distinct operator intent against a held reservation, reachable without overloading the
  verb that is re-run routinely.

- _Rationale:_ The warrant is intent separation, not a read/mutate split — `land-status` already performs every
  mutation this verb would reverse. Folding decline into it would put poll-and-settle and abandon-and-release on
  one request, dispatched on payload rather than on the verb.

    - `[ ]` **3.1.a Register the verb in the `delivery native` command group**

        - The group carries seven commands today — `observe`, `link`, `unlink`, and the four `land-*` verbs.

    - `[ ]` **3.1.b Take the exact reservation selector**

        - The verb admits only a **settled** effect. A held native land reservation is not by itself enough:
          `prepared` and in-flight `submitting` reservations present the same way, and clearing one while a host
          merge is in flight releases the wedge with nothing left to reconcile against. The decline observes the
          effect and refuses on pending, partial, or ambiguous facts exactly as the reconcile path already does;
          an unapplied effect routes to `land-status`, which owns that reconciliation. Both disclosure points
          this verb exists for sit after an applied effect, so neither is excluded.
        - The selector carries the plan, the repository, the `remote`, and the `operationId` naming the held
          reservation. `NativeStatusSchema` has no `operationId`, while `NativeSubmitSchema` does, and a decline
          must name the reservation it abandons. `remote` is not derivable from state — the state carries refs,
          not a remote name — and the effect observation needs it, so it rides the request with the same
          `origin` default its three neighbouring schemas use. Register the request schema in the command map
          alongside the CLI verb.
        - The reconcile path is the shape precedent: it takes plan, repository, and remote on the wire and
          derives the merge request from `activeOperation.effect`, which already carries the repository, the
          change request, and the head. Compose the same effect observer; do not call the reconcile itself,
          which publishes a clear on its never-applied branch and returns a preserved reservation on a
          `prepared` one — neither of which is this verb's answer.
        - **The effect observer alone cannot separate in-flight from never-applied**, and two of the behaviours
          below depend on that separation. Its facts report `none-landed` for each, and the classifier reaches
          `not-applied` only for a `none-landed` fact paired with a **failed** host observation. The
          distinguishing read is the host poll against the persisted effect identity, which reports `pending`
          while an effect is still in flight. Compose that poll as a second piece beside the observer — it is
          what the reconcile composes, not the reconcile itself.
        - The branch key is whether a persisted effect identity exists, not whether the effect was synchronous.
          With no identity there is nothing to poll, and fresh facts do not resolve it either — a none-landed
          fact there blocks on the submission having outrun its persistence, holding the reservation. Branch on
          the identity the same way rather than polling unconditionally, and do not describe the other side as
          a path that resolves.
        - The refusal set is wider than pending, partial and ambiguous. The poll also reports an enqueued
          effect and three refusal reasons of its own, and the classifier does not rescue them — an enqueued
          effect with none-landed facts falls through to ambiguous, so it refuses under a word that misnames
          it. Enumerate them. An in-flight effect can also report partial-landed rather than none-landed, so
          the facts are ambiguous in more than one direction.
        - The reconcile's three pre-checks — a missing effect identity, a reservation mismatch, and a protected
          target mismatch — are inline in the reconcile rather than extracted, so composing the poll and the
          classifier does not bring them along. This verb re-derives them.
        - Build `test-first` (one behavior at a time):

            - The exact selector is accepted and resolves the held reservation
            - A selector naming no held reservation refuses rather than acting
            - A reservation whose effect is pending, partial, or ambiguous refuses rather than clearing
            - A reservation carrying a persisted effect identity, whose poll reports the effect failed and
              whose facts report nothing landed, routes to `land-status`, which publishes the clear
            - The same reservation with no persisted identity blocks instead, holding the reservation, rather
              than reaching that route
            - An enqueued effect refuses under a reason naming it, not under ambiguity
            - A `prepared` reservation, which no verb releases, refuses naming that it is abandoned by
              reconciling rather than declining — never a route that returns the same refusal

### `[ ]` **3.2 Restore ARC-moved refs by lease, refusing rather than forcing**

- _Goal:_ Every ref ARC rewrote goes back under a lease check, which keeps the decline clear of the
  rebase-and-force prohibition.

- _Rationale:_ The restoration is `rewriteLocalRef`'s existing `{ ref, beforeHead, requestedHead }` call with its
  arguments swapped. No force-push on either arm.

- _Shape:_ `reapCompletedDeliveryResidue` is the execution precedent for this task and the two after it:
  lease-checked undo per item, typed refusal returning the still-held reservation, then one publish at the exact
  revision. Compose that tail rather than deriving it — the precedent mints its own teardown reservation before
  undoing, which this verb must not, since it acts against one already held.

- _Note:_ The restoration target is durable and the lease is not. Persisted state carries pre-rewrite member
  coordinates while the reservation is held, which is where the target comes from; the swapped `beforeHead` is the
  head ARC rewrote **to**, which nothing persists today.

    - `[ ]` **3.2.a Phase-publish the observed suffix before the rewrite loop**

        - Placement is exact, and "after the proof loop" is not precise enough to name it: four further
          refusals sit between the proof loop and the first rewrite, including a paths-bearing disclosure.
          The publish goes **immediately before the first rewrite**, so those four return ahead of it too.
        - Every **suffix-proof** conflict refusal returns earlier, so the disclosure and resubmission paths on
          that arm still reach no state write. The terminal-absorption arm is the exception by design — it
          refuses after the local member-ref rewrite, which is why Task 2.2 carries its ref restorations.
          Moving the publish later to take that arm in too would destroy what the publish exists for, which is
          recording the observed suffix before the rewrite.
        - _Note:_ Five refusals return after the publish and only one of them carries restorations: a refused
          mid-loop ref rewrite, which may leave refs partly moved; an unavailable terminal top; the
          absorption's non-conflict reason; a failed top publish; and a state conflict on the final publish.
          The sharpest is the last — the top publish can **succeed** before the final publish conflicts, so a
          remote terminal ref has moved and Task 3.2.b's local-only swap restores nothing there. Disclosing
          what was not restored is within this work unit; restoring a remote move is not.
        - Every move below, not just the first. `beginNativeDeliverySubmission` is the precedent because it
          makes them together; a publish that records the coordinates and stops corrupts the reservation rather
          than recording it.
            - The observed member coordinates land in a **new optional field on the `land` arm's `native`
              object**, beside `arm` and `phase`. They do not overwrite `requested`, which records what ARC was
              authorized to produce rather than what it observed.
            - `stateRevision` is set to the revision the phase publish is made **against** — the reservation's
              current revision, not the one the publish returns. The invariant is that current state sits exactly
              one ahead of it, so setting it forward instead wedges the reservation `operation-stale`.
            - `native.phase` gains a value naming this phase.
            - The submit path's phase guard is restated from `=== "submitting"` to `!== "prepared"`. It is a
              positive binary match today, so a third value falls through it into stack reobservation and the
              member lock release before anything refuses. Of the six phase readers it is the only one the new
              value breaks: four test `prepared` and stay correct, and the fifth refuses a non-`submitting`
              phase, which is right because it runs only immediately after the submission transition.
            - The restated guard now also covers a settle-time reservation, whose condition its existing reason
              literal does not name — the submission was persisted and the settle is mid-flight. Give that state
              its own reason rather than letting it share one that describes the opposite.
            - The settle rebinds only its landing record's **revision** to the one the phase publish
              **returns**, so its terminal publish is revision-checked against current state. The record's
              value stays the landing projection: it pairs a pre-landing revision with a post-landing projection,
              so replacing the whole record would revert the landed members and target to their pre-landing
              coordinates and erase the host's merge from persisted state on a successful settle.
        - Build `test-first` (one behavior at a time):

            - A wedged landing leaves the observed suffix readable from persisted state
            - The reservation still validates after the phase publish, and `land-status` can be re-run
            - A settle that rewrites a ref still completes, its terminal publish landing at the rebound revision
            - The landed members and target keep their post-landing coordinates through the phase publish
            - The phase publish is revision-checked and refuses rather than overwriting a competing write
            - A suffix-proof conflict disclosure still returns with no state write at all
            - A terminal-absorption disclosure returns after the phase publish, carrying its ref restorations

    - `[ ]` **3.2.b Swap the rewrite arguments under a lease check**

        - The lease is the decline's own comparison, not a delegated one: read each ref, compare against the
          head 3.2.a recorded, and only then call the rewrite. `rewriteLocalRef` refuses
          `collision | malformed | unavailable` and carries no head, so it cannot be the lease's source of truth
          and widening it would cross five call sites and three port types.
        - The restoration target reads from the pre-rewrite coordinates already in state.
        - Build `test-first` (one behavior at a time):

            - The absorption arm restores every member ref ARC moved
            - The suffix arm restores none, and the verb still succeeds

### `[ ]` **3.3 Publish `activeOperation: null` at the exact revision and return the typed result**

- _Goal:_ The reservation is released at the exact revision, and the result names what was restored and what was
  deliberately left standing — the landing the host performed is not reversed.

    - `[ ]` **3.3.a Publish the clear at the exact revision**

    - `[ ]` **3.3.b Return the typed result naming both halves**

        - The result needs its own arm on the handler's result union. Every result is validated before it is
          returned and rewritten to an invalid service result on a miss, so an unarmed result reaches the operator
          as a validation failure rather than as the decline's answer.
        - Build `test-first` (one behavior at a time):

            - The result enumerates every restored ref
            - The result names the landed work it left standing

### `[ ]` **3.4 Hold the reservation on a failed lease**

- _Goal:_ A failed lease reports the observed head and leaves the reservation held, never half-released.

- _Rationale:_ Publishing the clear before every restoration succeeds would leave the wedge released with refs
  still where ARC moved them — a state neither the landing path nor the decline path can reason about afterwards,
  and one no refusal describes. `reapCompletedDeliveryResidue` already orders it this way, so the rule is a
  precedent to follow rather than a new invariant to establish.

    - `[ ]` **3.4.a Refuse before publishing when any restoration fails**

        - The observed head comes from the decline's own ref read in 3.2.b, which is what makes it reportable —
          the rewrite's refusal carries no head to report.
        - Build `test-first` (one behavior at a time):

            - A failed lease reports the observed head
            - The reservation is still held after the refusal, and a retry can still succeed
            - The clear is never published when any restoration fails

### `[ ]` **3.5 Update the shipped delivery workflow to the changed protocol**

- _Goal:_ An operator following the shipped workflow reaches the routes this segment built, rather than one that
  no longer clears the refusal it names.

- _Rationale:_ `deliver-stack.md` drives the native landing lifecycle by verb and states that a suffix
  reconciliation refusal is settled by rerunning `land-status` "without resubmitting" — precisely what the
  disclose-and-resubmit protocol replaces. The terminal interlock's payload and the verb set both changed
  alongside it.

- _Note:_ The edit goes through `packages/arc-framework/arc/` and syncs to the project copy. Never copy between
  them — that overwrites project-specific overrides silently.

    - `[ ]` **3.5.a Correct the suffix-refusal recovery statement**

    - `[ ]` **3.5.b Add the decline verb, the terminal disclosure, and the new phase to the lifecycle prose**

        - The workflow enumerates recovered reservations by phase, and 3.2.a adds one an interrupted settle sits
          in — so that row is written here rather than leaving an operator without one.

        - The absorption refusal now carries the required merge parent, so the prose names the hand-merge route
          rather than a bare rerun.

### `[ ]` **3.6 Settle and release a wedged landing** — validate exit criterion at segment scope

- _Goal:_ Exercise the segment's capability end to end: a wedged landing settles by resubmitted resolution, and a
  separate wedged landing releases by decline with the reservation held on a failed lease.

## **Phase 4:** The shared base resolver

_Purpose:_ Replace the repeated hand-rolled base derivation with one resolver whose refusal is typed once, and
carry its ambiguous and unrelated distinctions through every layer that currently re-flattens them.

_Mode:_ `layer` through Phase 5 — closes on one settled comparison substrate both singleton and delivery
readers can adopt.

_Design decisions:_ The split is four layers deep; editing `RevisionOverlapResult` alone changes nothing the
pinned probes observe. The first three layers carry each distinction as a peer status arm; the fourth reduces it
to a verdict and carries the cause as a discriminant instead. See
`notes-delivery-post-landing-conflict-recovery.md` § Propagation surfaces.

### `[ ]` **4.1 Author the sole-base resolver with its four arms**

- _Goal:_ One mechanism answers "which single base" for every reader that adopts it, refusing when the answer is
  not one rather than picking, and never throwing.

- _Rationale:_ The arms split on what the caller can do next, not on what Git reported: `resolved` diffs or
  records, `ambiguous` and `unavailable` are recoverable, `unrelated` is terminal.

- _Shape:_ The resolver is exported from `base-overlap.ts` beside `analyzeRevisionOverlap`, which already performs
  the `--all` read inside a private helper — so this is an extraction of existing machinery, not a new module. It
  takes the exec handle and the two revisions and returns the four arms; the analyzer adopts it rather than
  keeping a second copy of the read.

    - `[ ]` **4.1.a Author the resolver over its four arms**

        - Build `test-first` (one behavior at a time):

            - Exactly one merge base resolves and returns it
            - Two equally good merge bases return `ambiguous`, never a pick
            - No common ancestor returns `unrelated`
            - A failed read returns `unavailable` rather than throwing or collapsing into a verdict

### `[ ]` **4.2 Split `ambiguous` out of `RevisionOverlapResult`**

- _Goal:_ An ambiguous history and an unanswerable read stop arriving as one word at the first layer.

- _Rationale:_ The type's multiple-merge-base branch and its non-exit-1 `catch` both currently reach
  `merge-base-failed`. `ambiguous` lands as a peer `status` arm beside the existing `unrelated`, not as another
  reason inside `unavailable` — recoverability is a status-level property and consumers branch on status.

- **Additional Context:** `notes-delivery-post-landing-conflict-recovery.md` § Propagation surfaces

    - `[ ]` **4.2.a Add the peer `ambiguous` arm and route the multi-base branch to it**

        - The arm carries `detail` like every other arm on the type — a named conversion site forwards `detail`
          on any non-available status, and that site is only compiler-silent if the field is there.
        - The arm carries **no merge base and no overlap**. The multi-base branch returns before the merge base
          is assigned and before any changed-path read, so nothing downstream may assume either.
        - `predecessor-relation.ts` is a consumer this split breaks at the compiler: it handles `unavailable`
          and `unrelated`, then dereferences the overlap. Phase 5 owns its disposition, but the break lands
          here, so the two phases are executed in order and 5.1's arm set is what this task hands to.
        - Name the interim rather than leaving it to whoever hits the break: fold the new arm into the existing
          `unavailable` arm here, which is fail-closed, and record that 5.1 undoes the fold when the four-arm
          wrapper exists. A deliberate interim with a named undo is traceable; an improvised one is not.
        - Build `test-first` (one behavior at a time):

            - A two-base history reports `ambiguous`
            - An unanswerable read still reports `unavailable` with `merge-base-failed`
            - No common ancestor still reports `unrelated`
            - `invalid-revision` is untouched by the split

### `[ ]` **4.3 Carry ambiguous and lift `unrelated` out at `OverlapEvidence`**

- _Goal:_ The middle layer stops folding three conditions into one, so the drift-overlap reader can report which
  of them held.

- _Rationale:_ Its unavailable reason set is `merge-base-failed | branch-diff-failed | base-diff-failed |
  classification-failed` with no ambiguous and no unrelated arm, and `analyzeBaseOverlap` folds `unrelated`
  together with `merge-base-failed` — so `unrelated` is lifted out here rather than passed through.

    - `[ ]` **4.3.a Add peer `ambiguous` and `unrelated` arms**

        - This layer expresses everything non-available as `unavailable` with a reason enum, so both arms are
          new structure rather than new enum members.

    - `[ ]` **4.3.b Convert the two readers that narrate or classify this evidence**

        - `base-drift-register.ts` composes the operator-facing drift text from this type and branches on a
          positive `status === "available"` test, so both new arms would be narrated as though no overlap
          existed. It dereferences a path field afterwards, so the compiler does flag it — but the flag points
          at the dereference, not at the missing narration, and a minimal fix restores compilation while leaving
          both arms sharing the quiet text. Give each its own.
        - `base-distance.ts`'s movement classifier is the second reader and takes the same shape: a negative
          test for the unavailable status, then a path dereference. It derives the movement value that the
          checkpoint composition, the errand merge composition, and Task 4.7.a's hold all observe, so state what
          movement each new arm produces — 4.7.a's replacement assertion cannot be written without it.

    - `[ ]` **4.3.c Keep the two layers' arm shapes parseable across their seam**

        - _Goal:_ The site that reads this layer's evidence into the layer above keeps working, rather than
          throwing the first time an ambiguous or unrelated base reaches it.

        - Errand merge composition parses evidence of this type directly into the observation schema of the
          layer above, by shape coincidence rather than by conversion. Both are strict unions, so the new arms
          must carry identical field sets on both sides or that parse throws at runtime — and it throws in the
          window between this task and 4.4 whatever field sets are chosen. Land the two layers' arms together,
          or sequence this site's read so the window is closed.

    - `[ ]` **4.3.d Stop folding `unrelated` into `merge-base-failed`**

        - Build `test-first` (one behavior at a time):

            - An unrelated pair reports `unrelated`, which callers may treat as terminal
            - An ambiguous pair reports `ambiguous` rather than a failed read
            - A genuinely failed read still reports `unavailable` with its existing reason

### `[ ]` **4.4 Carry both distinctions through `EvidenceOverlapObservation` and the review-status path**

- _Goal:_ The third layer stops re-collapsing the pair, so the review-status reader reports the same distinction
  the analyzer established.

- _Rationale:_ Editing only the first layer leaves both affected pins observing byte-identical values —
  `status-composition.ts` re-collapses the same pair again on this path.

- _Note:_ `EvidenceOverlapObservationSchema` is a Zod schema with **two** consumers — the base-movement
  observation and the base-merge producer — so this is a validated contract change of the same kind as the
  relation's literals, not an internal type edit. The pre-public-release posture settles the cost and no
  compatibility alias is owed.

- _Note:_ The evidence normalizer is the third consumer, and it is the boundary into the fourth layer rather
  than another carrier of the distinction. Task 4.5 owns its settled disposition; this task hands it two new
  observation arms to convert.

- _Note:_ The hand-off is not clean, and the interim must be named rather than discovered. Widening the
  observation union breaks the normalizer at the compiler — it reads a path field the new arms do not carry — so
  this task cannot leave it untouched, and the behaviors below are observed through a reader that runs it. Route
  both new arms to the `unknown` overlap here as a **fail-closed interim**, which Task 4.5 then refines with the
  cause discriminant. The interim matters because the shape a fallthrough would take is an empty path list, which
  reduces to the strongest accept.

    - `[ ]` **4.4.a Carry both arms through the observation schema and its two consumers**

    - `[ ]` **4.4.b Stop re-collapsing them on the review-status path**

        - Build `test-first` (one behavior at a time):

            - Review status distinguishes an ambiguous base from an unreadable one
            - Review status distinguishes an unrelated base from both

### `[ ]` **4.5 Reduce the distinction at the normalized verdict space**

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

    - `[ ]` **4.5.a Make the conversion this layer's forcing point**

        - It returns through a cast today, so the one place where every arm from the layer above crosses into this
          one is the place the compiler cannot see. Remove the cast and switch exhaustively over the observation's
          status with an `assertNever` default, so every arm added above is forced at this crossing rather than
          landing on whichever branch its path shape happens to match.
        - Build `test-first` (one behavior at a time):

            - Each observation status converts to the arm this design states for it
            - An arm carrying no paths **field** never converts to the arm that reduces to the strongest accept
            - An available observation whose path list is empty still converts to that accept, unchanged

    - `[ ]` **4.5.b Carry the cause on the `unknown` arm and split the reducer's reason**

        - The reason enum is embedded in an emitted result schema, so new members are a request-contract change
          rather than a local rename, and are disclosed as one.
        - Build `test-first` (one behavior at a time):

            - An ambiguous base reduces to the conservative verdict under its own reason
            - An unrelated base reduces to the conservative verdict under its own reason
            - A failed read keeps the reason it reports today

    - `[ ]` **4.5.c Route each cause to a typed action at the two reductions that can receive it**

        - A cause that reaches the reducer and stops there is a better label on the same dead end. Only the two
          `base-movement` reductions reach the conversion, so only they can carry a base-resolution cause:
          review status and errand merge composition. Name both — the second is a reduction consumer this task
          set otherwise never mentions.
        - Review status reports the cause beside its movement field rather than inside it, leaving the
          projection's value set unchanged. Its own `state` and `nextAction` follow the cause: every
          non-carrying result routes to a rerun today, so a terminal cause keeps inviting a retry that cannot
          succeed unless this task states otherwise. Task 4.7.b's replacement assertion needs that value stated.
        - **Candidate applicability is not one of the two**, and this task does not touch it. Its ambiguous case
          is refused at the `merge-base --all` read itself, ahead of any reduction, and its one reduction
          composes a member-rewrite cause whose overlap is the constant. The re-baselining remedy on that
          refusal belongs to Task 6.6, which owns the applicability result's slot for it — and which requires the
          refusal's four existing strings be preserved exactly, so nothing here may repurpose its `nextAction`.
        - Build `test-first` (one behavior at a time):

            - An ambiguous cause reaches review status under its own reason
            - An unrelated cause reports terminally, with a state and next action that do not invite a rerun
            - Errand merge composition carries the same cause to its own surface
            - The movement field still reports only its three established values

    - `[ ]` **4.5.d Make the reducer's open-ended accept branch exhaustive**

        - One branch there ends in a two-way test whose else-arm returns the strongest accept. The new causes do
          not reach it — the `unknown` arm is caught earlier — so this is hardening rather than a dependency of
          the arm set. An accept reached by falling past a single test, in a module this phase is already
          opening, is how the next arm gets swallowed.
        - **That else-arm is live, not dead**, so this is a restatement and not a repair. It is the accept every
          `member-rewrite` delta takes, whose overlap is always the constant, and the `base-merge` accept on a
          disjoint overlap. Two production call sites depend on it. The exhaustive form preserves those outcomes
          exactly; changing them is a different concern with different consumers.
        - Build `test-first` (one behavior at a time):

            - A member-rewrite delta still reaches the accept it reaches today
            - A base-merge delta with a disjoint overlap still reaches it
            - An arm with no stated disposition fails to reduce rather than accepting
        - _Note:_ The reducer revalidates what it is handed by shape rather than by provenance, and both its delta
          schema and type are exported, so a caller can hand-build a valid delta. Three of the five reduction call
          sites already bypass the conversion legitimately, on the causes that use the constant. The closed arm
          set is what keeps that boundary safe; do not widen it here.

### `[ ]` **4.6 Attach the per-coordinate-pair remedy to the ambiguous arm**

- _Goal:_ An ambiguous refusal names a remedy that can actually clear it, which differs by the topology of the
  pair being compared rather than by which reader asked.

- _Rationale:_ At a `(head, base)` pair an append-only merge collapses cardinality to one, so "merge the base in"
  clears it. At a pinned-durable-baseline pair the merge moves neither element, so the refusal stands and the
  route is re-baselining. Emitting the first remedy at the second pair would name a remedy that provably cannot
  clear the refusal — the recoverable-looking dead end this design's own refusal rule forbids.

    - `[ ]` **4.6.a Type the remedy as a dispatched action per pair**

        - `checkpoint-composition.ts` carries **two** compiler-silent sites, at different pair topologies, and
          both convert. The pinned-durable-baseline site branches on `status !== "available"` and forwards
          `detail`; the drift site branches on the widened overlap evidence and replaces it with a fixed generic
          string, losing the distinction entirely. A peer `ambiguous` arm compiles unchanged at both, so neither
          is forced by the compiler and both are converted by name. The drift site is a `(head, base)` pair, so
          its remedy is merging the base in rather than re-baselining.
        - Build `test-first` (one behavior at a time):

            - A `(head, base)` pair carries the merge-the-base-in remedy
            - A pinned-durable-baseline pair carries the re-baselining remedy

        - _Note:_ The design also states a third case — a pair where an append-only merge is not permitted at
          all, whose recoverability is satisfied by a restart route instead. No coordinate pair in this work
          unit's conversion set is in that state, so it gets no behavior here. Carry it as a constraint on
          future pairs rather than writing a test with no locus to bind to.

### `[ ]` **4.7 Replace the drift-overlap and review-status holds with plain assertions**

- _Goal:_ Both holds become plain assertions on the peer `ambiguous` status, so the suite asserts the behavior
  rather than waiting for it.

- _Note:_ Both go red as neither-shape once all three layers carry the distinction — their declared targets state
  the resolve-branch expectation the design rejects, so each replacement asserts what the design produces, never
  what the hold awaited. Seven other `expectPinnedObservation` holds elsewhere in the suite belong to adjacent
  concerns and must stay untouched.

- **Additional Context:** `notes-delivery-post-landing-conflict-recovery.md` § Pinned probes — the eight holds

    - `[ ]` **4.7.a Replace the drift-overlap hold**

    - `[ ]` **4.7.b Replace the review-status hold, asserting the base-movement half only**

        - Its `observed` pins two strings: the multi-base detail this phase changes, and a
          `routedObligation.detail` carrying the effective-target reader's untyped throw, which Task 6.2
          converts. Leave the routed-obligation half unpinned here so that conversion extends the assertion
          rather than re-editing it.

## **Phase 5:** The predecessor relation and vocabulary migration

_Purpose:_ Extract the ordered-pair ancestry relation four sites already derive by hand, and migrate the one
existing spelling onto it so the two implementations cannot diverge again.

_Exit criterion:_ One resolver and one relation vocabulary exist; `predecessor-relation.ts` exports no second
ordered-pair spelling, and `eligibility.ts` decides on the overlap field rather than on a variant name.

_Design decisions:_ `unrelated` maps onto the resolver's arm rather than becoming a seventh variant; cardinality
is a field on `diverged`, not a variant.

### `[ ]` **5.1 Author the predecessor-relation classifier over its six variants**

- _Goal:_ A reader asking whether a bound head is still the observed one distinguishes unmoved, append-only
  advance, rewound, diverged, absent, and unreadable — rather than collapsing them into equality-or-not.

- _Shape:_ The **read wrapper carries four arms, mirroring the resolver's**: resolved, `ambiguous`, `unrelated`,
  and `unavailable`. Two of them exist because the six-variant relation vocabulary cannot express them — an
  ambiguous pair has no single base to relate against, and an unrelated pair has no relation at all — and
  parking either under `unavailable` is what the design forbids, since `unavailable` is recoverable-by-retry
  while these are recoverable-by-remedy and terminal respectively. The `ambiguous` arm carries the pair and the
  per-pair remedy; the `unrelated` arm carries the observed tip and the resolver's detail.

- _Note:_ The wrapper's **resolved arm carries only the chain-base-bearing variants** — `unchanged`, `advanced`,
  `rewound`, `diverged`. An unresolvable ancestry read is the `unavailable` arm rather than a resolved `unknown`:
  the wrapper owns the Git access, so it reports its own failure instead of handing a consumer a verdict-shaped
  value meaning "no verdict". `absent` is not a topological answer at all — this read takes two revisions and asks
  how they relate, while "no record binds this subject" is a prior fact about whether there is a subject, which
  this read consults nothing to establish. Narrowing the arm is what makes `chainBase` total on it, and that
  totality is what lets Task 5.4 remove a null branch because the value cannot be absent rather than because a
  comment asserts it.

- _Rationale:_ The classifier is pure over an ordered pair: topology only, no content term and no Git access.
  Purity is possible only because the facts arrive pre-computed — it is a new function beside the existing async
  `predecessorRelation` in `predecessor-relation.ts`, taking the bound head, the observed head, the ancestry
  answers relating them, and the merge-base cardinality. `predecessorRelation` keeps its injected readers and
  becomes one of its callers, so every Git read stays in that wrapper.
  Cardinality rides as a field on `diverged` rather than as a variant, because cardinality above one is reachable
  only when neither revision is an ancestor of the other — a variant would place it beside the case it lives
  inside. Applicability is its only deciding consumer, and its remedy is re-baselining, not merging the base in.

- _Note:_ `advanced` is ancestry-only. What keeps an unreviewed change from riding it is the gate below, which
  still requires the observed head to equal the target head with the routed obligation discharged at that exact
  vehicle — do not add a subject term to close a hole the downstream gate already holds.

    - `[ ]` **5.1.a Classify the six variants**

        - Build `test-first` (one behavior at a time):

            - Equal heads report `unchanged`
            - A bound head that is an ancestor of the observed reports `advanced`
            - An observed head that is an ancestor of the bound reports `rewound`
            - Neither an ancestor of the other reports `diverged`
            - A failed ancestry read reports `unknown` and never collapses into a verdict
            - An externally rewritten head reports `diverged` or `rewound` rather than assuming the landed head
              is the head ARC bound

    - `[ ]` **5.1.b Settle how `absent` is reached, since it is not a topological answer**

        - The classifier's inputs are the bound head, the observed head, the ancestry answers, and the
          cardinality — none of which can report that no record binds the subject. So either the bound head is
          nullable in the signature and `absent` is the answer to a null one, or `absent` sits outside the
          classifier entirely and each reader emits it from the binding it already holds. Decide it here and
          state it: Task 7.3 consumes `absent` for a member with no binding, and it needs to know which
          interface produces it.

    - `[ ]` **5.1.c Carry cardinality as a field on `diverged`**

        - Build `test-first` (one behavior at a time):

            - A two-base `diverged` pair carries the cardinality field
            - A single-base `diverged` pair carries it as one

### `[ ]` **5.2 Migrate `predecessor-relation.ts` onto the relation's vocabulary**

- _Goal:_ The tree holds one ordered-pair spelling, so the defect class this work unit removes cannot recur under
  a second name.

- _Rationale:_ `exact` collapses `unchanged` and `advanced` — the same defect class. `overlapping-ahead` becomes
  `diverged`; `disjoint-ahead` becomes `diverged` too, except where the merge base equals the member head and the
  overlap is necessarily empty, which is `rewound`. So this arm splits on ancestry direction rather than being
  renamed wholesale. `overlapping-ahead` has no matching case: a member behind the tip diffs empty against the
  merge base, so its overlap can never be the non-empty one.

    - `[ ]` **5.2.a Split `exact` into `unchanged` and `advanced`**

        - This call site reads ancestry as "is the observed tip an ancestor of the member head", so the
          tip plays the classifier's bound element and the member head plays the observed one — the inverse of
          what the local variable names suggest. Wire by that role assignment, not by name, or `advanced` and
          `rewound` invert here while Phase 7's readers use the opposite assignment.

    - `[ ]` **5.2.b Map `overlapping-ahead` onto `diverged`**

    - `[ ]` **5.2.c Split `disjoint-ahead` on ancestry direction**

        - State how the split is detected before writing it: the wrapper performs one ancestry read today, in
          one direction, which cannot distinguish the member-behind-tip case on its own. Either add the second
          ancestry read or use the merge-base-equals-member-head equality the design names. Both are sound; they
          differ in how many Git reads the wrapper performs, so the choice is stated rather than left to
          whoever implements it.
        - Build `test-first` (one behavior at a time):

            - A member behind the tip reports `rewound`
            - A member with an empty overlap that is not behind the tip reports `diverged`

    - `[ ]` **5.2.d Map `unrelated` onto the resolver's arm rather than a seventh variant**

        - "No common ancestor" is a fact the base resolver establishes before the classifier runs, and the
          classifier reads no Git — so the relation keeps six variants and the terminal outcome stays separated
          from the recoverable ones.

### `[ ]` **5.3 Migrate `samePredecessorRelation` and the payload destinations with the variants**

- _Goal:_ Every payload field a variant carries today stays reachable after the migration, and the comparison
  that reads them field by field moves with the variants rather than after them.

- _Rationale:_ `exact` carries `chainBase`; `disjoint-ahead` carries `chainBase`, `mergeBase`, and `overlap`;
  `overlapping-ahead` carries `mergeBase` and `overlap` but no `chainBase`. `eligibility.ts` consumes `chainBase`
  as the coordinate it observes the chain against at two readers, so it must stay reachable for every arm that
  carries it today.

- _Shape:_ The migrated payload, stated once so no later task infers it. `unchanged` and `advanced` carry
  `chainBase`. `rewound` carries `chainBase`, `mergeBase`, and `overlap` — it is the ancestry-direction half of
  today's `disjoint-ahead`, so it keeps that arm's payload, and its `chainBase` is what makes the second reader's
  null branch unreachable. `diverged` carries `chainBase`, `mergeBase`, `overlap`, and cardinality. `absent` and
  `unknown` carry neither base nor overlap and sit outside the read's resolved arm (5.1), so no eligibility
  reader receives one. **`overlap` stays on the relation** rather than moving to the reader
  result: the field-by-field comparison reads it there, and moving it would narrow that comparison silently.

- _Note:_ `sameOverlap` compares path arrays order-sensitively by index. Preserve that behavior as-is — it is not
  this work unit's to change — but do not widen its reach while migrating around it.

    - `[ ]` **5.3.a Carry `chainBase` unconditionally on `diverged`, with the close-time overlap test alongside**

        - The two source arms disagree about carrying it, and an optional field would push a null check into
          the accept path. It costs nothing: on the `not-ancestor` branch the classifier already sets
          `chainBase` and `mergeBase` to the same merge base, so the arm that omits it today can carry the
          value it already holds. Keep the two fields distinct — on the `ancestor` branch `chainBase` is the
          observed tip.
        - **This is the task that kills the close-time overlap protection, so it is the task that replaces it.**
          The second reader has no overlap test: it refuses a non-empty overlap only because the variant
          carrying one carries no chain base, and this change gives it one. 5.2 already forces that expression
          to be rewritten at the compiler, so the protection is gone as of here — one task before 5.4 states the
          reader's full disposition. Write the overlap refusal in this task; 5.4.b then states the disposition
          around it and 5.4.c removes the dead null branch.
        - Nothing in the suite covers this today — no close-time test constructs a snapshot carrying a non-empty
          overlap — so the gap would be silent rather than red. Build the refusal test first, against a
          submitted snapshot whose relation the fresh read reproduces exactly.

    - `[ ]` **5.3.b Migrate the field-by-field comparison with the variants**

        - Remove the `unrelated` branch rather than migrating it: that variant leaves the relation for the
          resolver's arm, so there is no migrated kind for it to compare.
        - Build `test-first` (one behavior at a time):

            - Two equal migrated relations compare equal across every payload field
            - A cardinality difference on `diverged` compares unequal
            - A `chainBase` difference on `diverged` compares unequal

### `[ ]` **5.4 Re-point `eligibility.ts`'s accept and refuse split onto the overlap field**

- _Goal:_ The reader decides on the overlap rather than on a variant name, which is what lets one variant carry
  both an accepted and a refused case.

- _Rationale:_ It accepts `disjoint-ahead` and refuses `overlapping-ahead` as `wrong-predecessor`. No single
  variant name can carry that split — merging an accept and a refuse is the defect class this work unit removes,
  and it would recur under `advanced` exactly as it would under `diverged`. This is why `diverged` is fail-closed
  by default rather than by definition.

    - `[ ]` **5.4.a Decide on the overlap field**

        - The refusal branch also refuses `unrelated` on the same reason today. That variant leaves the relation
          for the resolver's arm, so the terminal case is settled before the classifier runs and the branch
          sheds a condition rather than keeping one that can no longer arrive.
        - It needs somewhere to arrive instead, and 5.1 has already put it there: the read mirrors the resolver's
          four arms, so the terminal outcome arrives on its own rather than folded into the recoverable one —
          folding it there is what the design forbids, because a terminal condition parked under a recoverable
          status is retried forever. That is not a seventh relation variant: the variant set stays at six and the
          arms sit on the read.
        - **Both** wrapper call sites take these dispositions, not just the prepare-time one. The close-time
          reader guards only `unavailable` today and then reads the relation, so each arm beyond resolved forces
          a branch there too — and widening its existing guard to "not resolved" would park the terminal and the
          ambiguous cause under a recoverable reason, the merge this phase exists to undo.
        - The accept rule decides on the overlap field, so every arm and variant carrying no overlap needs its
          disposition stated rather than falling through. Three do. The two non-resolved arms refuse as above.
          `unchanged` and `advanced` **accept**: the classifier returns on the ancestor branch before the
          overlap is ever read, so they carry none and they are today's accept path. The compiler forces the
          branch — there is no field to read — so what is needed is the statement, not a guard.
        - The eligibility reader refuses that arm under its **own terminal reason**, carrying the detail and the
          rebuild remedy it already emits, and carrying no relation payload — the migrated relation schema has no
          arm for one. Keeping `wrong-predecessor` here would re-merge a terminal cause with a recoverable one,
          which is the split this phase exists to make.
        - It still carries the observed tip. The emitted failure composes its observed head from the relation
          today, so a refusal carrying no relation drops the only coordinate that reports the observed
          condition — which the refusal-recoverability rule requires. Carry it as the refusal's own field.
        - That reason needs its own emitted arm. The wrong-predecessor refusal is a `z.strictObject` pinned to
          its reason literal and is a member of the result union; a sibling arm lands beside it, reusing the same
          remedy shape. Two further sites read that schema's remedy by reference and must keep resolving.
        - **The ambiguous reason needs one too, and for a sharper cause.** Without its own arm it falls through
          to the generic owned-authority failure, whose projection keeps a remedy only when it recognizes the
          kind — so the refusal ships with none at all. Its remedy kind and that projection are 5.4.d's, so the
          ambiguous behavior below is satisfied only once 5.4.d lands; sequence the two together rather than
          asserting the remedy before the slot exists.
        - Build `test-first` (one behavior at a time):

            - An empty overlap is accepted
            - A non-empty overlap refuses `wrong-predecessor`
            - No common ancestor reaches this reader as the wrapper's terminal arm, never as a relation variant
            - It refuses under its own terminal reason, distinct from `wrong-predecessor`, carrying no relation
            - An ambiguous pair refuses under its own recoverable reason carrying the per-pair remedy, never
              reaching the accept path on an empty overlap
            - The close-time reader refuses both non-resolved arms the same way the prepare-time one does

    - `[ ]` **5.4.b Give the close-time reader its own overlap decision**

        - _Goal:_ The second reader refuses a non-empty overlap because it tested for one, not as a side effect
          of a field being absent.

        - The refusal itself lands in 5.3.a, because that is the task that retires the null branch standing in
          for it and the protection may not lapse between them. What lands here is the reader's full
          disposition around it: which arms and variants refuse, under which reason, and why the accept path
          cannot be reached by falling through.
        - The snapshot comparison is not that test and cannot be made into one. The snapshot arrives through the
          request contract, and this read is taken over the member head and protected-base head that snapshot
          carries — both pinned object ids. A snapshot whose relation already holds a non-empty overlap
          reproduces identically and compares **equal**. That comparison proves the snapshot is consistent; it
          never proves it is admissible.
        - The close entry point is the only one that admits such a snapshot, which bounds the work: the mutation
          path re-prepares through the prepare-time reader and inherits its refusal.
        - Build `test-first` (one behavior at a time):

            - A submitted relation carrying a non-empty overlap is refused at close
            - It is refused even when the fresh read reproduces it exactly and the comparison finds them equal
            - An empty overlap still closes

    - `[ ]` **5.4.c Re-point both `chainBase` readers onto the migrated shape**

        - The accept path observes the chain against `chainBase` and refuses `evidence-unavailable` when the
          observation does not match; the second reader compares against the snapshot's own and refuses
          `wrong-predecessor`. Once 5.3 carries `chainBase` unconditionally on `diverged` and 5.2 moves
          `unrelated` out, the second reader's null branch is unreachable — remove it, and only after 5.4.b has
          written out the overlap test it was standing in for.

    - `[ ]` **5.4.d Widen the remedy slot and convert the projection that reads it**

        - The refusal's remedy slot holds one kind today, so the ambiguous arm's remedy is a widening at the
          library. The locus that must widen with it is the owned-authority failure projection, and it is named
          here because the compiler will not name it: the projection validates each preserved field and keeps it
          only on success, so an unrecognized remedy kind is dropped silently and the refusal ships with no
          remedy at all.
        - The same projection composes its observed head from the relation, which the terminal and ambiguous
          arms do not carry. Take the tip from the arm that carries it instead.
        - Build `test-first` (one behavior at a time):

            - An ambiguous refusal reaches the operator with its remedy intact
            - A terminal refusal reaches the operator carrying the observed tip

### `[ ]` **5.5 Update `PredecessorRelationSchema`'s literals through the request contract**

- _Goal:_ The literals one verb writes and another reads back move together, so no close request carries a
  vocabulary the reader no longer knows.

- _Rationale:_ The schema sits inside `EligibilitySnapshotSchema` inside `CloseSchema` — a request-contract
  change, not a local rename. It has four consumers, not one: that nested request path, a refusal schema, an
  emitted result arm, and a runtime `safeParse`. The library emits the relation on its refusals too, so the
  operator-visible surface carries the same literals and migrates in the same change. The pre-public-release
  posture settles the cost: unpublished project-owned
  contracts may change in place and no compatibility alias is owed.

    - `[ ]` **5.5.a Move the literals through the nested request contract**

        - Build `test-first` (one behavior at a time):

            - A close request round-trips every migrated literal
            - An emitted refusal carries the migrated literal on its relation
            - The variant names derive from the type rather than being restated beside it

## **Phase 6:** Reader adoption across the conversion set

_Purpose:_ Convert every reader D4 places in scope onto the shared resolver or the relation, so one traced
defect class is removed everywhere it was traced rather than at the instance that surfaced it.

_Mode:_ `replication` — closes on the enumerated conversion surface exhausted and batch-verified.

_Exit criterion:_ A two-merge-base history produces a typed refusal at every converted reader, with no subject,
digest, or overlap derived from an arbitrary ancestor, and both propagations carry their widened result to every
consuming call site.

_Design decisions:_ The two allocated-but-unconverted readers and the five out-of-scope silent picks are
recorded exclusions. See `notes-delivery-post-landing-conflict-recovery.md` § Recorded exclusions.

### `[ ]` **6.1 Adopt the resolver at the subject reader and derive the subject from the single base**

- _Goal:_ The subject is the base-relative diff from one resolved base, so a two-base history refuses instead of
  naming the base's own change as the contribution.

- _Rationale:_ A tree-to-tree comparison with fragility discharged by refusal — no merge-diff mode selection, no
  union, no special handling of merge commits. A commit-derived set was falsified twice: it cannot see a branch
  retaining its own side of a base-changed path across a base merge, and because the digest is taken over path,
  content digest, and mode, a path changed and reverted within the branch leaves a permanent no-op entry so
  currentness never clears. The base-relative set drops that path and the digest returns to its attested value.

- _Note:_ This reader fails by throwing today, several times before it reaches its merge-base read. The new refusal
  arrives as the widened result its call sites handle; the unrelated throws stay. `resolveGitCandidateBaseRevision`
  is its immediate dependency and also throws, but it resolves the base branch tip rather than a merge base, so it
  is outside the conversion set and stays as it is.

    - `[ ]` **6.1.a Derive the subject from the single resolved base**

        - Build `test-first` (one behavior at a time):

            - A single-base history produces the base-relative path set
            - A two-base history refuses typed rather than picking an ancestor
            - A path changed and reverted within the branch leaves no entry
            - A branch retaining its own side of a base-changed path contributes that retention

### `[ ]` **6.2 Adopt the resolver at the overlap, effective-target, and repository-target readers**

- _Goal:_ Each of the three records or diffs from one refused-or-resolved base, and the local review host stops
  examining a change set derived from an arbitrary ancestor.

- _Rationale:_ `repository-target.ts` is the strongest trace in the set — its silently picked base becomes
  `diffBaseSha` and `diffBaseTree`, the local review host's diff base, asserted in the gate's identity module and
  used to compute the reviewed change set as `base..head`. It maps into `LocalTargetDerivationError`'s existing
  closed reason set, beside the `no-merge-base` reason it already carries; no new error family.

- **Additional Context:** `notes-delivery-post-landing-conflict-recovery.md` § Recorded exclusions

    - `[ ]` **6.2.a Adopt at the overlap analyzer**

    - `[ ]` **6.2.b Adopt at the effective-target reader**

        - Its untyped throw currently carries "The Candidate target has no sole base coordinate." — the same
          string the ledger records as a blocked obligation's `detail`, so the surfaced message is exception text
          rather than a result.
        - Typing it moves the `routedObligation.detail` that Task 4.7 deliberately left unpinned; extend that
          assertion here rather than re-editing it.

    - `[ ]` **6.2.c Adopt at the repository target and map into the existing reason set**

        - This reader reports failure by raising `LocalTargetDerivationError`, so the new reason is raised
          through that typed error rather than returned — the channel it already uses, and no new error family.
        - One consumer maps this reason set to review preconditions through a switch with no default arm, so a
          new member returns undefined rather than a precondition. Give it the base-resolved precondition its
          neighbouring base reasons already return.
        - The reason is a **new member** of `LocalTargetInvalidReason`, not a reuse of `no-merge-base`. Reusing it
          would conflate "no common ancestor" with "two equally good bases" at the strongest traced reader in the
          set — the conflation this phase removes. Adding the member is a contract change for every consumer
          switching on the enum.
        - Build `test-first` (one behavior at a time):

            - A two-base history refuses with the new ambiguous reason, distinct from `no-merge-base`
            - The local review host examines no change set derived from an arbitrary ancestor

### `[ ]` **6.3 Propagate the collector's widened result across its eleven call sites**

- _Goal:_ Every consumer of the widened collector result handles the new refusal explicitly, each applying its own
  failure policy rather than inheriting one baked into the resolver.

- _Note:_ Eleven sites across seven consuming files, two of which are injected dependency lambdas rather than
  direct calls. Re-derive the enumeration rather than trusting it if the tree has moved.

- **Additional Context:** `notes-delivery-post-landing-conflict-recovery.md` § Propagation surfaces

    - `[ ]` **6.3.a Propagate through the direct call sites**

    - `[ ]` **6.3.b Propagate through the injected dependency lambdas**

    - `[ ]` **6.3.c Convert the terminal record advance proof's arm to no-proof**

        - Carrying the reason onward is deliberately not required there.

### `[ ]` **6.4 Admit attestation's new refusal at the lifecycle ceremony**

- _Goal:_ Attestation refuses a two-base history rather than attesting a subject derived from an arbitrary
  ancestor, and the refusal reads as a ceremony outcome rather than an internal error.

- _Rationale:_ The lifecycle handler passes `currentTarget` into `runAttest`, so this is new behavior in a
  load-bearing ceremony, not a pass-through. A plan treating the widening as a mechanical type propagation would
  miss that a ceremony changes behavior.

    - `[ ]` **6.4.a Surface the refusal as a ceremony outcome**

        - Build `test-first` (one behavior at a time):

            - Attestation over a two-base history refuses with a typed reason and an actionable remedy
            - Attestation over a single-base history is unchanged
            - The refusal is recoverable — the ceremony succeeds after the base is merged in

### `[ ]` **6.5 Propagate the target-base resolver's widened result across its five call sites**

- _Goal:_ The second propagation's consumers handle the new refusal too, so a reader converted through one
  propagation is not left unconverted through the other.

- _Note:_ Five sites across four files, not covered by the collector's propagation.

- **Additional Context:** `notes-delivery-post-landing-conflict-recovery.md` § Propagation surfaces

    - `[ ]` **6.5.a Propagate through all five call sites**

### `[ ]` **6.6 Adopt the relation at Candidate applicability**

- _Goal:_ Base movement under a baseline is classified by the relation, with cardinality carried as the field its
  only deciding consumer reads.

- _Note:_ The sibling review-contribution reader is the same code shape line for line and is a recorded
  exclusion — the absence of a traced defect is what separates them, not the presence of a typed reason.

    - `[ ]` **6.6.a Classify base movement through the relation**

        - Preserve the refusal's `state`, `nextAction`, `reason`, and `detail` exactly. The Candidate
          applicability hold matches on a subset, so added fields leave it green while any edit to those four
          strings breaks it — and Task 6.7 retires that hold on the premise the refusal is kept.
        - The cardinality field and the typed remedy both need a slot on the applicability result schema, which
          the refusal is parsed through on its way out. Adding them to the reader alone fails that parse at
          runtime rather than at the compiler.
        - Build `test-first` (one behavior at a time):

            - An append-only base advance classifies as `advanced`
            - A two-base history refuses and carries cardinality
            - The refusal names re-baselining rather than merging the base in

### `[ ]` **6.7 Replace the four history-shape holds with plain assertions**

- _Goal:_ The history-shape probe file asserts the settled behavior at every hold it carries, with none left
  asserting nothing.

- _Note:_ The committed-arm subject and the digest sibling go red as neither-shape, so each replacement asserts
  what the design produces rather than what the hold awaited; the staged arm reaches its declared target. The
  Candidate applicability hold goes red by neither route — the design keeps its observed refusal, including the
  `detail` the hold names verbatim — so nothing forces its replacement and it is retired deliberately. Dropping
  it as redundant against the digest hold is rejected on evidence, as is making the ancestor pick deterministic.

- **Additional Context:** `notes-delivery-post-landing-conflict-recovery.md` § Pinned probes — the eight holds

    - `[ ]` **6.7.a Replace the committed-arm subject and digest sibling holds**

    - `[ ]` **6.7.b Replace the staged-arm hold**

    - `[ ]` **6.7.c Retire the Candidate applicability hold deliberately**

        - Identify it by its shapes, not its title. The title reads like this work unit's goal, while its
          `target` is the resolve-branch expectation the design rejects and its `observed` — an unavailable
          classification that stops — is the refusal the design keeps, `detail` included.
        - Because it can never fire, it asserts nothing about the behavior it names; the replacement asserts
          that kept refusal.

### `[ ]` **6.8 Exhaust the conversion set** — validate exit criterion at segment scope

- _Goal:_ Batch-verify the enumerated surface: a two-merge-base history refuses typed at every converted reader,
  and both propagations reach every consuming call site.

## **Phase 7:** Ancestry-aware readiness and per-term closeout

_Purpose:_ Make the two readers that currently collapse distinct causes report them — a stale binding apart from
an absent one, and a failing closeout term apart from the other thirteen.

_Mode:_ `slice` — closes on a reader distinguishing the causes it currently shares one word for.

_Exit criterion:_ Review readiness returns `in-plan-unbound` where it previously found nothing, and closeout
names the observed condition for each of the fourteen conditions that currently reach `terminal-unsettled`.

_Design decisions:_ Readiness resolves by deliverable identity behind a fifth lookup interface;
`resolveDischargeTargets` is eliminated because it relocates the conflation one reader over.

### `[ ]` **7.1 Add the deliverable-keyed lookup as a fifth interface**

- _Goal:_ A caller holding a deliverable identity can resolve its member without keying on a head, through a
  result whose arms express every outcome readiness reports today.

- _Rationale:_ `resolveTerminalRecords` already performs the plan read, state read, and coherence check the body
  needs, so the route is that body behind a named method. Routing through it directly would widen a method named
  for terminal integration by use rather than by design. Widening the member selector with an identity arm is the
  recorded rejected alternative — it edits a predicate both live lookups share to reach the same result.

- _Note:_ The designated body does not supply every arm as written: it returns unbound at two distinct points and
  unavailable when several plans match, and it never asserts a caller-supplied plan id. Folding any of those into
  `unavailable` would repeat the defect that eliminated `resolveDischargeTargets` — answering _could not
  establish_ where the truthful answer is _not bound_ — at the very reader this phase is fixing.

    - `[ ]` **7.1.a Author the method and its six-arm result**

        - The `bound` arm carries the whole member readiness consumes — its plan, deliverable, work unit, and
          final-member flag — not the coordinate alone. The flag feeds a separate terminal-member fact that the
          inversion must not drop.
        - Build `test-first` (one behavior at a time):

            - A bound member returns `bound` with its coordinate
            - A member in the plan with no binding returns `in-plan-unbound`
            - A deliverable absent from the resolved plan returns `not-in-plan`
            - No plan carrying this work unit returns `no-plan`, a miss rather than an unavailability
            - A refused read or several matching plans return `unavailable`

    - `[ ]` **7.1.b Keep the lookup interface single-method**

### `[ ]` **7.2 Assert the caller-supplied plan id explicitly inside the new method**

- _Goal:_ A request naming the wrong plan is refused as a plan mismatch rather than passing unchecked or arriving
  as a deliverable miss.

- _Rationale:_ The designated body filters on the work unit alone and derives the plan id from that filter — it
  never asserts a caller-supplied one. Leaving it implicit would drop a live validation, and folding it in beside
  the deliverable miss would reintroduce the cause-conflation this work unit exists to remove.

    - `[ ]` **7.2.a Assert the plan id and return `plan-mismatch`**

        - The live comparison lowercases both plan ids, while the deliverable and work-unit comparisons beside it
          are exact. Preserve the case-insensitive compare when the assertion moves, or a request differing only
          in case starts refusing where it is admitted today.
        - Build `test-first` (one behavior at a time):

            - A request naming another plan returns `plan-mismatch`
            - A request naming the resolved plan proceeds
            - A request whose plan id differs only in case still proceeds

### `[ ]` **7.3 Invert review readiness to resolve by identity, then compare by relation**

- _Goal:_ A stale binding and an absent binding become distinguishable, because the reader now finds the member
  and then compares its recorded head against the observed one.

- _Rationale:_ A moved head does not mismatch at this reader — it misses. Readiness resolves by head, and every
  production member lookup is keyed the same way, so no member is found and there is no bound coordinate to
  compare. Adding an ancestry term to a comparison that never runs would change nothing. The inversion conforms
  readiness to the order the review gate already uses, where identity-first resolution across head movement is
  the pattern rather than the exception.

- _Note:_ The vehicle already holds the key, so the call is a conversion rather than a new lookup — readiness
  spells the third field one way where the vehicle spells it another, so the hand-off needs a rename.

    - `[ ]` **7.3.a Resolve by deliverable identity**

    - `[ ]` **7.3.b Compare the recorded head against the observed one by relation**

        - Build `test-first` (one behavior at a time):

            - A member whose branch advanced past its bound head reports the stale binding, not nothing
            - A member with no binding reports absent
            - An unmoved member is unaffected
            - A final member still emits its terminal-member fact

### `[ ]` **7.4 Retire `delivery-member-mismatch` and emit the arm-specific outcomes**

- _Goal:_ The reader stops emitting one code three times over, discriminated only by path, and each surviving
  outcome carries its own remedy.

- _Rationale:_ Of its three emissions the work-unit one becomes tautological because it is the lookup key, the
  deliverable one becomes the `not-in-plan` arm under its own remedy, and the plan one survives as the explicit
  assertion under a renamed identity — so the code itself stops being emitted at all. Treat that as a user-facing
  surface change, not an internal rename.

    - `[ ]` **7.4.a Drop the tautological emission and route the other two**

        - Build `test-first` (one behavior at a time):

            - A deliverable miss reports `not-in-plan` with its own remedy
            - A plan mismatch reports the renamed identity
            - No path emits the retired code

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

    - `[ ]` **7.5.a Replace the equality term with the relation**

        - The ancestry-blind term is the conjunction's head-equality comparison.

    - `[ ]` **7.5.b Give the pre-guard's five conditions distinct reasons**

    - `[ ]` **7.5.c Give the unobserved host request its own reason**

    - `[ ]` **7.5.d Give the conjunction's eight terms distinct reasons**

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

### `[ ]` **7.6 Replace the review-readiness binding and terminal head-movement holds**

- _Goal:_ Both probe files assert the settled behavior, leaving no hold in the four files this boundary owns.

- _Note:_ Both reach their declared targets, so the helper reports each hold spent and the replacement asserts
  that target — the readiness binding asserts the stale-versus-absent distinction, the head movement asserts the
  ancestry verdict.

- **Additional Context:** `notes-delivery-post-landing-conflict-recovery.md` § Pinned probes — the eight holds

    - `[ ]` **7.6.a Replace the review-readiness binding hold**

    - `[ ]` **7.6.b Replace the terminal head-movement hold**

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
