# Task List: Decompose Base Mobility

- **Design:** `spec-decompose-base-mobility.md`

---

## **Phase 1:** Host-neutral descendant-base validator

_Purpose:_ Establish the read-only pre-landing verdict that decides whether a recorded transition still replays
exactly over a moved base. Pure policy with injected readers, so the landing decision is settled and independently
testable before any Git mutation or CLI surface depends on it.

_Design decisions:_ The validator leads because the advancement command consumes it and it carries no dependency of
its own. The recorded transition patch is the complete overlap model **for the paths the transition touches** —
non-touched paths are ignored by construction rather than by an allow-list, and drift in the origin's own
predecessor state is not this verdict's question but re-derivation's, in Phase 3. It answers the pre-landing
question alone; the anchor proof in Phase 2 is a separate derivation that shares the extracted readers and nothing
else.

The exact-object read helpers this phase needs already exist as module-private functions serving the exact-base
anchor adapter. They are extracted to a shared reader rather than reimplemented, so the work unit adds no second
path-state or transition-replay implementation. Dependency state reuses the core's exported tree-snapshot reader
at the moved base for the same reason.

Refusals return the core's closed mismatch shape with `kind: "base"`, distinguishing the specific relation through
its stable optional `locus` rather than widening the core's mismatch vocabulary; the verdict pairs that mismatch
with an explicit success arm rather than returning a bare one.

### `[ ]` **1.1 Validate the commit relation**

- _Goal:_ A moved configured base is admitted only when it is the exact recorded result base or a strict
  descendant of it; every other relation refuses through the core's typed mismatch result.

    - `[ ]` **1.1.a Extract the shared exact-object readers**

        - `resolveCommit`, `readCommit`, `readTreeEntry`, `stateMatches`, and `changedPaths` are module-private in
          `configured-base-decomposition-anchor.ts`. Move them to `git-decomposition-object-readers.ts`, which both
          that adapter and the new validator import.

        - Add an ancestry reader to the same module, serving this validator and the anchor adapter only. The
          existing `merge-base --is-ancestor` call sites in the errand, user-sync, teardown, retirement, in-flight,
          and sync-status drivers are left where they are — migrating subsystems this work unit otherwise never
          touches is a separate concern.

        - Document `readTreeEntry`'s tri-state on the extracted module: `null` is a genuinely absent path, `false`
          is a malformed, duplicate, or unreadable entry. `stateMatches` collapses both into a plain mismatch,
          which is correct for it — a non-regular object is a well-formed entry that `stateMatches` already
          refuses on type and mode. The validator reads the reader directly only where a refusal must name which
          relation failed, since `stateMatches` returns a bare boolean.

        - Keep byte-preserving blob access on the injected `readBlob` seam; the shared module performs no direct
          filesystem access and holds no policy.

        - Build `test-first` (one behavior at a time):

            - Every existing exact-base anchor verdict is unchanged after extraction.

            - The ancestry reader reports descent, non-descent, and unresolvable refs distinctly.

            - An absent path and a malformed entry stay distinguishable to a direct reader consumer.

    - `[ ]` **1.1.b Decide the base relation**

        - New `validate-descendant-base-landing.ts` consuming `{ receipt, currentBaseOid, candidateHeadOid }` plus
          two injected reader seams: the extracted object readers including ancestry, and the dependency reader
          Task 1.2.b uses.

        - _Note:_ the two seams do not unify. The object readers take `readBlob(oid)`; the dependency reader is
          `readGitV3DecomposeTreeSnapshot`, which needs `{ cwd, exec, readBlob(commit, path) }` plus `ref`,
          `head`, and `origin` operands and signals failure by throwing rather than by a result arm. Accept both
          as separate
          injected seams and map the dependency reader's throws onto the refusal arm at the validator boundary;
          unifying them would mean rewriting a core reader this work unit otherwise only consumes.

        - _Shape:_ the result is a discriminated union — an admitted arm carrying the proven base/head pair, or a
          refusal carrying the core's `V3DecompositionMismatch`. `V3DecompositionMismatch` is `{ kind, locus? }`
          with no success arm of its own, so returning it bare would leave admission unrepresentable; the core's
          own validation result pairs it the same way. The union carries no recovery action — routing an
          unavailable binding to a recovery arm is Phase 4's, per Task 1.3.b.

        - Build `test-first` (one behavior at a time):

            - Accepts the exact recorded `resultBase.head`.

            - Accepts a strict descendant of the recorded result base.

            - Refuses a regressed base (an ancestor of the recorded result base), with `locus` naming the relation.

            - Refuses a divergent base sharing no descent relation, with `locus` naming the relation.

            - Refuses malformed or mixed-width object ids.

            - Refuses a receipt that does not decode as canonical v3.

### `[ ]` **1.2 Replay the complete recorded overlap**

- _Goal:_ Landing is admitted only when every recorded touched path, mode, type, and incoming dependency still
  replays exactly against the moved base and the candidate head.

- _Context:_ The recorded transition patch is the complete overlap model for the paths it touches, so paths absent
  from it need no inspection here. This is what keeps validation proportional to the recorded transition rather
  than repository size, and it is also why this verdict is not the whole admission decision — Task 3.2.c catches
  base changes that fall outside the patch entirely.

- _Shape:_ regenerable projections are excluded from that model, and the exclusion is what makes the mode work
  rather than a convenience. ROADMAP is always a recorded touched path — every decomposition changes it — and the
  base changes it on essentially every advance, since it projects the very lifecycle events that move the base.
  Replaying it as overlap would refuse the ordinary case this work unit exists to admit. Key the exclusion off the
  plan's own projection slot rather than a path spelled into the validator, so it names the class rather than the
  file and disappears with the class when projections leave the tracked tier. The line the validator draws is
  preserved-versus-re-derived: a semantic destination must replay exactly, because advancement must not alter what
  review approved; a projection must not, because advancement recomputes it.

    - `[ ]` **1.2.a Replay recorded path states**

        - Compare each `transitionPatch` entry's `before` state at the current base and `after` state at the
          candidate head, reusing the extracted `stateMatches` reader.

        - _Shape:_ the two checks key off different commit pairs, and conflating them is the trap here. The
          candidate's own transition is `preparedBase..candidateHead` — stable wherever the base has since moved,
          since the candidate has not merged it — so the extra-path check uses that pair. Whether base advancement
          collided with the transition is a separate question, answered by evaluating each recorded `before` state
          at the **current** base. Diffing `currentBase..candidateHead` instead would read every unrelated base
          advance as a reverted path and refuse exactly the movement this work unit exists to admit.

        - The expected path set for the extra-path check is the recorded patch **plus the candidate's own receipt
          path** (`v3DecomposeReceiptPath(receiptId)`), matching the exact-base implementation. The patch derives
          from managed path results and so never carries the receipt blob, while the diff always does — a set
          built from the patch alone refuses every well-formed candidate on its own evidence.

        - Build `test-first` (one behavior at a time):

            - Admits unrelated base movement that touches no recorded path.

            - Admits a base advance whose only recorded-path change is the regenerable projection.

            - Refuses a base advance that changed a semantic destination alongside the projection.

            - Admits a well-formed candidate whose diff carries its own receipt blob.

            - Refuses changed content on a recorded touched path.

            - Refuses a mode change whose content is byte-equal.

            - Refuses a create or delete that inverts a recorded before/after state.

            - Refuses a non-regular object (symlink, gitlink, or submodule) at a recorded path.

            - Refuses a transition path present in the tree diff but absent from the recorded patch.

    - `[ ]` **1.2.b Detect dependencies the base acquired on the retired origin**

        - _Goal:_ A base that gained a dependency on the origin since the candidate was prepared is refused, so
          the transform never retires a work unit something on the base still depends on.

        - Derive incoming edges through the core's exported tree-snapshot reader
          (`readGitV3DecomposeTreeSnapshot`, already parameterized by head) at **both** the recorded result base
          and the current base, and refuse when the current base carries an edge on the origin that the recorded
          result base did not.

        - _Shape:_ this is a base-to-base comparison, and comparing against the receipt's recorded `incomingEdges`
          instead would be wrong. Those edges are derived at the **selected source snapshot** — for a
          started-planning origin, its own branch rather than the base — so they are not a base-side inventory and
          the two sets can differ legitimately from the moment the receipt was written. Reading both ends with the
          same reader at the same parameterization is what makes the difference meaningful.

        - Compare the two ends by **dependent slug set**. A snapshot edge entry is
          `{ dependent, currentTargets }`, where `currentTargets` is that dependent's entire `dependsOn` list
          rather than the origin edge alone, so a set difference over whole entries refuses whenever an existing
          dependent gains or loses an unrelated prerequisite — a base change touching neither the origin nor
          anything the transition recorded, and exactly the concurrent grooming this work unit exists to tolerate.

        - _Rationale:_ a dependent's meta is not a recorded touched path, so path replay alone cannot see a new
          edge. The retired origin stays live and visible on the base for the whole review window, which makes
          acquiring a dependency on it the natural thing for concurrent grooming to do — and the failure lands
          silently as a dangling edge rather than a loud error.

        - _Note:_ the snapshot reader also loads source-artifact blobs this check does not need, and throws on a
          malformed meta anywhere in the tree. Both are accepted in exchange for adding no second derivation.

        - Build `test-first` (one behavior at a time):

            - Refuses a dependency on the retired origin that exists at the current base and not at the recorded
              result base.

            - Admits a base whose dependency set on the origin is unchanged.

            - Admits dependency changes that touch neither the origin nor the base's own edge set.

            - Admits an existing dependent that gained an unrelated prerequisite alongside its origin edge.

            - Admits a candidate whose recorded edges were derived at a source branch that differs from the base.

            - Converts a thrown reader failure into the validator's refusal arm rather than propagating it.

### `[ ]` **1.3 Bind one immutable base/head pair**

- _Goal:_ No verdict is granted over a base or candidate that moved during validation; a raced observation fails
  closed rather than returning a stale admission.

- _Approach:_ Compose the pin → validate → reread shape the exact-base adapter already uses, whose raced reread
  returns a `configured-base-raced` stale result. This layer returns no clearance, merge, or mutation behavior.

    - `[ ]` **1.3.a Pin and reread around validation**

        - Build `test-first` (one behavior at a time):

            - Returns the verdict when both refs are unchanged across the reread.

            - Refuses when the configured base moves mid-validation.

            - Refuses when the candidate head moves mid-validation.

            - Refuses when both refs move within the same window.

            - Refuses when either ref becomes unresolvable.

    - `[ ]` **1.3.b Route unavailable binding to the recovery arm**

        - A host that cannot retain an immutable pair returns the validator's refusal arm and nothing more. The
          command observes that refusal and constructs the binding-unavailable cause itself, per Task 4.1.b — it
          already holds the authorizing origin and receipt facts, so no recovery-bearing channel has to be threaded
          out of a pure validator.

        - _Note:_ this keeps the validator free of recovery entirely. It returns a verdict; deciding what a refused
          verdict means belongs to the caller.

        - Build `test-first` (one behavior at a time):

            - The validator's exported surface carries no recovery action, remedy, or command operand on any arm.

## **Phase 2:** Descendant-current integration anchor

_Purpose:_ Make a descendant configured base the baseline the shared anchor derives over, so receipt-backed
consumers stay resolvable across unrelated commits — without a second fact, shape, or consumer interface.

_Severity:_ this is not an extension to a working baseline. The anchor holds only while the base head _is_ the
landing commit, so its window is one commit wide, and the sanctioned completion procedure closes it itself: a
decomposition must be finished with a follow-up commit recording the external dependency edges a cut map cannot
carry. A landed decomposition therefore makes its own members unlaunchable, refused at graduation preflight with
no bypass. Exact-base-only derivation has no realistic operating window at all.

_Design decisions:_ The anchor shape is unchanged — `currentBaseHead` and `landedCommitHead` are already separate
fields. Two named extension points carry the change: the pure producer's exact-equality refusal and the Git
adapter's landing detection.

The proof consumed here is its own, and conflating it with the Phase 1 validator is the principal hazard in this
area. Phase 1 asks whether an unlanded candidate may still land over a moved base, evaluating each recorded
`before` state at the current base; this phase asks whether a decomposition did land, given the base has since
advanced past it — where those same `before` states have already been consumed by the landing commit itself. A
validator built for the first question refuses every case of the second.

The fact is consumer-blind, so descendant reach lands for every consumer at once. Branching it by consumer would
mint the second consumer interface the design forbids, and the launch path benefits as much as cleanup does: a
decomposition-minted work unit stays resolvable after its base advances, rather than only while the base head is
the landing commit itself.

### `[ ]` **2.1 Extend the pure producer to a descendant current base**

- _Goal:_ The producer grants authority when the current configured base is a proven safe descendant of the
  landing commit — under any admitted landing relation — while its exact-base verdicts stay byte-identical.

- _Context:_ `produceDecompositionIntegrationAnchor` currently returns `stale: "current-base"` whenever
  `currentBaseHead` differs from the landing result, and its documentation states that it grants no descendant
  mobility. That refusal is the extension point.

    - `[ ]` **2.1.a Admit a proven descendant current base**

        - Take the descendant proof as an input rather than deriving it here — the producer stays free of ref and
          history lookup, as its module contract requires.

        - _Shape:_ `DecompositionIntegrationFacts` gains a **required** `baseDescent: { kind: "exact" } |
          { kind: "descendant"; from; to }`. The producer cannot establish ancestry, but it can establish that the
          proof is bound to the pair it accompanies — `from` must equal `landing.resultHead`, `to` must equal
          `currentBaseHead` — so a proof lifted from another derivation authorizes nothing. `exact` reproduces
          today's equality refusal unchanged.

        - _Rationale:_ required rather than optional so that no producer path can take exact semantics by
          omitting the fact — descent is a claim about a specific pair, and a caller that has not established it
          should be unable to stay silent and be read as claiming "exact". Reach is not the argument: every
          consumer in service today resolves through the configured-base adapter.

        - A proof that fails to bind takes the existing `stale: "current-base"` arm — the verdict the producer
          already gives a differing current base. A proof naming another pair authorizes nothing, so the producer
          stands exactly where it stood before the extension, and that is the arm it stood on. Routing it to
          `refused: "invalid-authority"` instead would surface a caller's mis-binding as a corrupt namespace at
          the handoff seam, which reports the wrong fault to the wrong reader.

        - _Shape:_ the facts likewise gain a **required** landing-relation input, because two producer checks
          cannot hold for a descendant-merge landing by construction — its landing's first parent is a descendant
          rather than the prepared base, and its tree is the per-path composition rather than the candidate's.
          `{ kind: "exact" }` runs every existing check byte-for-byte unchanged; `{ kind: "descendant-merge";
          slotZeroDescent: { from; to }; composition: "matches" | "deviates" }` carries the adapter-derived facts
          the producer cannot establish itself. Under that kind the producer verifies the candidate in the
          landing's second slot, binds `slotZeroDescent` to the recorded prepared base and the landing's first
          parent — mis-binding takes the same arm a mis-bound descent proof takes — and consumes `composition` in
          place of the landing-tree equality, refusing `"deviates"` as the existing `landing-topology` fault. The
          slot-equality and landing-tree checks it replaces are exactly the two a descendant-merge landing cannot
          satisfy; every other check runs unchanged.

        - _Note:_ the cost is one production construction site plus the test literals building the same facts. The
          tree's second producer call site is a pure resolver with no production caller, so it inherits the
          requirement without a behavioral consequence and needs no work of its own.

        - Build `test-first` (one behavior at a time):

            - Resolves when the current base equals the landing result (unchanged behavior).

            - Resolves when the current base is a proven descendant, populating `currentBaseHead` with the live
              base and `landedCommitHead` with the landing commit.

            - Refuses a differing current base carrying no descendant proof.

            - Refuses a descendant proof naming any pair other than the landing commit and the live base, on the
              same arm an unproven differing current base takes.

            - Resolves a descendant-merge landing, verifying the candidate in the landing's second slot.

            - Refuses `landing-topology` when the supplied composition verdict is `deviates`.

            - Refuses a slot-zero descent proof naming any pair other than the prepared base and the landing's
              first parent, on the same arm a mis-bound descent proof takes.

            - Runs every exact-relation check unchanged under the `exact` landing relation.

            - Leaves `claimRetirement` derivation driven solely by the receipt's `candidateOwnership`.

    - `[ ]` **2.1.b Prove the result vocabulary is unchanged**

        - `DecompositionIntegrationAnchorResult` gains no arm. An unproven differing current base still returns
          `stale: "current-base"`; a proven descendant now resolves. Admitting descent is an input-side change, so
          a new result arm would be evidence the fact had been branched by derivation route.

        - Build `test-first` (one behavior at a time):

            - Every existing result arm stays reachable with its current meaning after the extension.

### `[ ]` **2.2 Extend configured-base landing detection**

- _Goal:_ The Git adapter locates the landing commit when the configured base has advanced beyond it, and
  invalidates on movement, deletion, or history replacement.

- _Context:_ `landingFor` admits only a base commit whose first parent is the recorded prepared base, so an
  advanced base reads as `not-landed` today.

    - `[ ]` **2.2.a Locate the landing commit under an advanced base**

        - Preserve the exact path first: when the current base's own first parent is the recorded prepared base,
          the existing detection runs unchanged, including its `transition-tree` refusal on a mismatch. Only when
          that fails does the search below run.

        - Generalize the fast-forward relation so it recognizes an advanced candidate. Advancement merges the base
          into the candidate, so the candidate becomes a two-parent commit whose first parent is its own
          predecessor and whose second is the base. Landing that by merge at the prepared base is already covered —
          the landing commit's first parent is still the prepared base — but landing it by fast-forward moves the
          base onto the candidate itself, where the one-parent relation fails on arity and the merge relation fails
          on order, and a real landing goes unrecognized.

        - _Shape:_ state the relation set exhaustively rather than by description, since this is the substrate the
          implementation is built from. A merge landing at the prepared base is arity two with the prepared base
          in slot zero; a fast-forward landing is arity one with it in slot zero, **or** arity two with it in slot
          one; a merge landing over a descendant base is arity two with a surviving candidate in slot one and a
          strict descendant of the prepared base in slot zero, proven by the per-path test below rather than by
          slot equality. Merge at the prepared base is evaluated first, so no existing verdict moves, and no other
          shape is admitted — an octopus commit carrying the prepared base in a later slot is not a landing.

        - _Rationale:_ the recorded principle is that neither a candidate tree nor a history-wide receipt search
          proves landing — an exact relation reads the prepared base from a fixed slot of one pinned commit. This
          extension keeps that intact; what it drops is a first-parent constraint that was incidental to a
          one-parent candidate, which is the only kind the core could produce. Fast-forward is the likely landing
          shape for an advanced candidate, since it already contains the base.

        - _Shape:_ this extends the relation set, not the anchor. `DecompositionIntegrationAnchorResult` gains no
          arm and the anchor gains no field, so all four consumers are untouched — which is what the cohort's
          no-second-anchor-shape commitment constrains. Refusing the fast-forward case instead was considered and
          rejected: refusing it _visibly_ requires the same shape detection that admits it, so it costs identical
          machinery and returns a correctly-performed landing refused after the fact.

        - Enumerate the commits the current base has gained since the recorded prepared base — one bounded
          enumeration, not a walk — and apply the core's existing landing predicate to that set.

        - _Shape:_ selection is part of the search rather than a consequence of it, because the relations admit
          more than one commit in the ordinary case. The candidate relations match any commit carrying the
          recorded prepared base in the named slot, so an unrelated sibling commit off the prepared base matches
          alongside the candidate; replay each such hit and keep the ones that replay. A landing merge over a
          descendant base carries the prepared base in no slot, so its own relation admits it structurally — its
          second parent is a surviving candidate and its first parent strictly descends from the prepared base —
          with its tree proven against the per-path composition: the candidate's content on every recorded touched
          path, its first parent's elsewhere, regenerable projections excepted exactly as the landing verdict
          excepts them. Then take the survivor every other survivor is an ancestor of: the landing merge wherever
          one exists, the candidate itself under a fast-forward landing. Taking the first hit instead would report
          a merge landing as a fast-forward, recording a landing topology that never happened, so one receipt
          would carry different anchor facts before and after the base advanced — the second derivation route this
          phase exists to avoid.

        - No survivor is `not-landed`; two survivors with no ancestry relation between them are `ambiguous`. Both
          arms already exist on the landing topology and the anchor result, so admitting descent still adds no
          result vocabulary.

        - For the candidate-shaped relations the filter is the transition replay alone; candidate-tree equality
          is applied **after** selection, as a refusal, and is not a survival test — a landing merge at the
          prepared base whose tree was altered during resolution replays exactly (the replay reads only the
          prepared base and the candidate) while its tree does not match, and dropping it there would elect its
          own candidate commit instead and report a fast-forward landing whose tree the base does not hold.
          Refusing after selection preserves what the exact path says about the same repository. The
          descendant-merge relation reaches the same doctrine through its admission: the parent structure
          identifies the landing merge, and one whose tree deviates from the per-path composition is refused as
          altered during resolution rather than dropped to elect its own candidate.

        - Guard the enumeration with the ancestry reader before running it: when the recorded prepared base is not
          an ancestor of the current base — history replaced beneath it — nothing in the base's ancestry can name
          it as a first parent, so the answer is `not-landed` without enumerating. The guard is what makes the
          search bounded by how far the base advanced; without it a replaced prepared base widens the enumeration
          to the base's own history, on a path `arc start` and every cleanup admission resolve through.

        - _Shape:_ enumeration rather than a first-parent walk is a correctness choice before it is a cost one. A
          base that advanced through a merge puts the landing commit off the first-parent line entirely, so a walk
          misses exactly the case this phase exists to admit; a walk also has no termination when the prepared base
          is not on that line. Enumerating what the base gained finds the landing wherever it sits, bounds the
          search by how far the base advanced rather than by repository history, and asks nothing of path-history
          simplification.

        - _Note:_ the search **finds** where the exact path **claims**, and the two answer a replay failure
          differently. A base asserting itself as the landing whose transition does not replay is a corrupt claim
          and refuses; an enumerated hit whose transition does not replay is simply not this receipt's landing and
          drops out of the surviving set, leaving `not-landed` only when nothing survives. Refusing there would
          convert a genuinely unlanded receipt from `not-landed` into `transition-tree` — visible to callers, since
          landed-handoff maps `not-landed` to itself but every refusal to `namespace-corrupt`. It would also make
          the verdict order-dependent: an unrelated sibling commit off the prepared base satisfies the predicate
          too, and can enumerate ahead of the real landing.

        - `landingFor` reads `resultHead` and `resultTree` from the current base commit, which is the landing commit
          only in the exact case. Both come from the located landing commit instead; the current base supplies the
          search's starting point and nothing else.

        - **Relocate**, do not delete, the adapter's insistence that the candidate tree equal the current base tree:
          re-read it against the **selected** landing commit, where it means what it always meant. Deleting it looks
          safe because the producer carries an equivalent landing-tree check, and is not — the adapter's check
          fires first and refuses as `transition-tree`, the producer's as `landing-topology`, and those reasons
          reach callers verbatim. Deletion silently reclassifies an existing exact-base refusal.

        - Build `test-first` (one behavior at a time):

            - Detects fast-forward landing when the base has since advanced.

            - Detects two-parent merge landing when the base has since advanced.

            - Detects a fast-forward landing of an advanced candidate, where the prepared base is the base head's
              second parent.

            - Detects a merge landing of an advanced candidate, where the landing commit's first parent is the
              prepared base.

            - Detects a merge landing over a descendant base, recording the landing merge itself as the landing
              commit.

            - Detects a merge landing of an advanced candidate over a descendant base.

            - Honors the regenerable-projection exception in the descendant landing merge's per-path test.

            - Selects the descendant landing merge over its own surviving candidate commit.

            - Refuses `transition-tree`, rather than electing the candidate commit, when a descendant landing
              merge's tree deviates from the per-path composition.

            - Refuses an octopus commit carrying the prepared base in a slot beyond the second.

            - Every landing verdict the core produced before the extension is unchanged, across both existing
              relations and every non-landing shape.

            - Detects a landing that an intervening merge placed off the base's first-parent line.

            - Selects the landing merge when both it and its own candidate commit satisfy the predicate.

            - Discards a non-replaying hit that enumerates ahead of the real landing.

            - Returns `ambiguous` when two replaying hits share no ancestry relation.

            - Sources the landing head and tree from the landing commit rather than the current base.

            - Returns `not-landed` when the enumerated set contains no landing commit.

            - Returns `not-landed` without enumerating when the prepared base is not an ancestor of the base.

            - Preserves the `transition-tree` refusal for a candidate tree that does not match the selected
              landing commit.

            - Refuses `transition-tree`, rather than electing the candidate commit, when the selected landing
              merge's tree was altered during resolution.

            - Returns `not-landed` when no enumerated hit's recorded transition replays.

            - Leaves the exact path's `transition-tree` refusal unchanged.

    - `[ ]` **2.2.b Prove the descendant relation for the producer**

        - Supply the proofs Task 2.1.a consumes, derived from pinned objects and closed by the existing final
          reread: the `baseDescent` proof naming the located landing commit and the pinned current base, and the
          landing-relation input — `exact` for the prepared-base relations, or `descendant-merge` carrying the
          slot-zero descent proof and the per-path composition verdict the search already established.

        - Build `test-first` (one behavior at a time):

            - Proves a strict descendant relation between landing commit and current base.

            - Supplies the descendant-merge relation with its slot-zero descent and composition verdict for a
              landing merge over a descendant base.

            - Supplies the exact relation for both prepared-base landing shapes.

            - Refuses when history was replaced beneath the landing commit.

            - Returns `configured-base-raced` when the base moves before the reread.

### `[ ]` **2.3 Preserve exact-base verdicts and extend every consumer unmodified**

- _Goal:_ All four anchor consumers gain descendant reach with no change to their own code, contracts, or refusal
  reasons.

- _Rationale:_ every consumer takes the anchor structurally through `{ status: "resolved", anchor }`, so a
  descendant-derived anchor of the same shape drops in. Proving that by regression rather than by modification is
  what keeps the "no second consumer interface" commitment honest — a consumer that needed editing would be
  evidence the fact had been branched.

- _Note:_ that commitment is about **consuming** a resolved anchor, not about producer plumbing. Requiring the
  descent fact touches one production construction site and the test literals that mirror it; no consumer's own
  code, contract, or refusal reason moves.

- _Context:_ the consumers are local cleanup, the claim-retirement gate, the landed-handoff emitter, and the
  graduation transaction behind `arc start`, which resolves the anchor by receipt id.

    - `[ ]` **2.3.a Regress the cleanup consumers unchanged**

        - Build `test-first` (one behavior at a time):

            - Local cleanup eligibility resolves from a descendant-derived anchor with no consumer edit.

            - The claim-retirement gate's full and partial arms behave identically across exact and descendant
              anchors.

            - Every pre-existing exact-base verdict is unchanged, including the adapter's `namespace-corrupt`
              refusal with its optional `ref` and `record` operands and the split between a corrupt namespace and
              a record version conflict.

    - `[ ]` **2.3.b Extend the handoff and launch consumers unchanged**

        - _Note:_ the graduation transaction currently captures an `anchor-policy` refusal whenever the anchor does
          not resolve, so a decomposition-minted work unit stops resolving as soon as anything lands on its base
          after the decomposition. This phase closes that window; the behavior is asserted here rather than left as
          an unclaimed side effect.

        - Build `test-first` (one behavior at a time):

            - Landed-handoff emission resolves against a descendant current base.

            - The graduation transaction resolves its anchor after the base has advanced past the landing commit.

            - A genuinely unlanded receipt still captures the existing `anchor-policy` refusal.

## **Phase 3:** Append-only base advancement command

_Purpose:_ Deliver the explicit full-protection route that moves a committed but unlanded candidate across
unrelated base movement, preserving semantic destinations and reviewable history.

_Design decisions:_ Merge only — no rebase, amend, or force-push. ROADMAP regeneration is the sole automatically
resolved conflict and routes through its existing owner rather than a second renderer. Every other conflict or
interruption restores the bounded pre-merge candidate.

The mode is named for base advancement because the core already owns an uncommitted `refreshed` finalization state
that replaces staged receipt bytes against an unchanged result base. The two operations stay distinguishable at the
command surface and in every refusal code.

Authority is established before anything mutates, so the ordinary refusal costs no restore. The merge is not a
second overlap authority: recorded-path, mode, type, and dependency overlap is refused by the landing verdict ahead
of it, and a conflict surviving that verdict is a surprise on a path the transition never recorded.

Every candidate-side operation runs in the candidate's registered worktree — the `cwd` the command's index
transactions, projection staging, and write paths resolve against. The operator's own checkout is never the merge
target.

### `[ ]` **3.1 Register the `--advance-base` mode**

- _Goal:_ The command surface exposes exactly one new mode, mutually exclusive with every existing decomposition
  operation and available only under full protection.

    - `[ ]` **3.1.a Derive the decomposition mode set from one declaration**

        - _Goal:_ Adding or removing a decomposition mode is a single-site edit, and no mode can be
          exclusive-checked without also being machine-readable and stderr-routed.

        - Export the mode-key declaration that the input schema's exclusivity refinement reads, plus a second
          declaration derived from it — the modes together with the non-mode options that equally imply a
          machine-readable invocation — for the command registration's predicate and the handler's
          stderr-versus-interactive branch.

        - _Shape:_ the three consumers are not reading the same list today, and collapsing them to one would be a
          silent behavior change. The schema counts five modes; the predicate and the stderr branch count those
          five plus `--continuation`, which is not a mode. Deriving all three from the mode set alone moves
          `--continuation` parse errors off stderr onto the interactive refusal path. Per-option metadata — the
          `.option()` registrations, the schema's field declarations, the option-to-field map — stays where it is.

        - Build `test-first` (one behavior at a time):

            - Every declared mode is exclusive-checked, machine-readable, and stderr-routed, with no mode reachable
              by one consumer alone.

            - A `--continuation` parse error with no mode supplied still writes to stderr under a non-zero exit.

            - Existing mode behavior is unchanged across all five current modes.

    - `[ ]` **3.1.b Add `--advance-base` and enforce its preconditions**

        - Register the option, add its field to `DecomposeOptions` and the strict input schema together, add it to
          the mode declaration from Task 3.1.a, and add its entry to the command-input option-to-field map that
          Task 3.1.a deliberately leaves hand-maintained. The repository command-input inventory requires an owned
          entry for every command-schema field, so omitting the map entry fails that assertion once the schema
          field lands — the two edits belong in the same step.

        - Dispatch from `handleDecompose` beside the existing modes and in their established convention: canonical
          JSON on stdout for a result, `reason` plus `remedy` on stderr under a non-zero exit for a refusal. The
          repository-bound driver sits beside its siblings as `git-decompose-v3-base-advancement.ts`.

        - Build `test-first` (one behavior at a time):

            - Refuses when combined with any other decomposition mode.

            - Refuses under partial protection, which has no committed-unlanded state to advance.

            - Refuses a malformed or unknown receipt id without mutating the repository.

            - Emits canonical JSON on stdout and a reason/remedy pair on stderr, matching the sibling modes.

### `[ ]` **3.2 Establish the whole admission decision before any mutation**

- _Goal:_ Every question that can refuse this operation is answered against committed objects while the candidate
  sits untouched, so the ordinary refusal has nothing to restore.

- _Rationale:_ all three admissions read committed trees or pure facts. Making them total rather than partial is
  what keeps the restore path a genuine exception rather than the common case.

    - `[ ]` **3.2.a Establish the candidate and receipt topology**

        - Prove the committed-unlanded shape with this command's own reader over pinned refs and claim state:
          require a clean deterministic candidate, prove the canonical receipt commit is not reachable from the
          configured base, and pin the live base.

        - Refuse a candidate whose recorded source ref equals the recorded result-base ref. Such a source head
          moves with every base advance, so re-composition — which pins the source ref to its recorded head exactly
          as it pins the base — would refuse `source-ref-moved` on every attempt, and restating the source head is
          closed off because receipt identity digests it. Refuse on the precondition, with its own reason, rather
          than letting it surface as an opaque composition failure after the operation has begun.

        - _Shape:_ the test is structural, not a source-kind check. A backlog-stub origin always lands in that
          state, but a started-planning origin whose planning branch _is_ the base lands in it too, so keying on
          `source.kind` would build a different gate than the one this reasoning justifies.

        - _Shape:_ do not reach for the existing candidate inspection. That surface is uncommitted-only — it
          requires the candidate head to equal the prepared base, which a committed candidate never satisfies —
          so adapting it would mean widening a contract this work unit only consumes. Its refusal vocabulary is
          also the discard path's, and this command's refusals must stay distinguishable.

        - Build `test-first` (one behavior at a time):

            - Admits a clean committed candidate whose receipt is unreachable from the base.

            - Refuses when the receipt commit is already reachable from the base (landed).

            - Refuses a dirty index or worktree.

            - Refuses a foreign or superseded candidate generation.

            - Refuses a candidate whose recorded source ref is the result-base ref, on its own reason, without
              mutating the repository.

            - Refuses it on the structural test, including for a started-planning origin whose planning branch is
              the base.

            - Admits a candidate whose source branch is independent of the base.

            - Refuses when the receipt evidence is absent or non-canonical.

    - `[ ]` **3.2.b Validate canonically and take the landing verdict**

        - Validate the finalized receipt canonically, which is also what mints the `ValidatedTransitionOverlay`
          Task 3.3.b supplies to ROADMAP regeneration — the overlay has no other legitimate source. Then run the
          Phase 1 landing validator over the pinned base and candidate head.

        - Build `test-first` (one behavior at a time):

            - Aborts without mutating the repository when canonical validation refuses.

            - Aborts without mutating the repository when the landing validator refuses.

            - Carries the validator's typed mismatch out of the command unchanged.

    - `[ ]` **3.2.c Re-derive against the advanced base ahead of the merge**

        - _Goal:_ The record that advancement will stage is produced and proven while the candidate is still
          untouched, so a re-derivation refusal costs no restore.

        - Restate `machine.resultBase` on the recorded cut map and recompute `machine.preflightId` from it, then
          re-compose the repository plan against the advanced base and re-assemble the preparation facts through
          `createV3DecomposePreparation` — the constructor that built them originally.

        - _Note:_ the record staged at the receipt path is a full receipt, not a preparation, and its finalized
          half moves with the base — managed path results are bound to `prepared.allowedPaths` by canonical
          equality, ROADMAP is one of those allowed paths, and its `before` is read at the result base, so the
          transition patch and its digest change under advancement. Re-sealing is therefore required, but it is
          Task 3.4's, not this one's: the receipt records what the merge produced. This task ends with the
          restated preparation proven against the advanced base.

        - _Shape:_ two properties make this safe to run pre-merge. Composition pins the base by requiring the
          restated head to be the live tip of the recorded base ref — exactly what advancement restates it to —
          and it reads only the source, merge-base, and result-base trees, never the candidate. So the whole
          derivation is provable while the candidate still sits where it was.

        - _Note:_ composition pins **two** refs, not one. It refuses `source-ref-moved` when the origin's own
          recorded source ref no longer resolves to the recorded head, and re-checks both refs after composing. A
          review window long enough for the base to advance is long enough for the origin's branch to move too, so
          this refusal is reachable in ordinary operation rather than only under a race.

        - _Rationale:_ this is a second **admission** point, though not a second semantic decision — the authored
          cut it composes from is byte-identical, so nothing is re-decided. Composition re-evaluates the origin's
          predecessor state against a recomputed merge base, the receipt path, ROADMAP presence, cohort topology,
          destination shapes, and dependent writability, all at the advanced base. Any of those can refuse a base
          the per-path transition replay admits, which is exactly why it runs: a base advance that quietly changed
          the origin's own artifacts is invisible to Task 1.2 and fatal to the plan.

        - Build `test-first` (one behavior at a time):

            - Produces the advanced record without touching the candidate branch, worktree, or index.

            - Refuses a base whose advance altered the origin's own predecessor artifacts.

            - Refuses a base that already carries this receipt path.

            - Refuses when the restated base is not the live tip of the recorded base ref.

            - Refuses when the origin's recorded source ref moved during re-derivation.

            - Aborts when the authoring block differs by digest.

            - Aborts when the re-derived receipt identity does not match the recorded one.

            - Re-derives the preflight, plan, and preparation identities, and the prospective projection's overlay
              and ROADMAP pair, against the advanced base.

            - The restated preparation parses and re-validates through the core's own preparation parser.

### `[ ]` **3.3 Merge the pinned base without rewriting history**

- _Goal:_ The candidate absorbs the advanced base through one append-only merge, and any outcome other than a clean
  merge or a ROADMAP-only conflict leaves the pre-merge candidate exactly as it was.

- _Approach:_ Re-derive ROADMAP from the plan re-composed in Task 3.2.c and stage those bytes as the resolution.
  The plan already renders ROADMAP — that render is how it knows the projection's post-transition state — so
  advancement stages what it already computed. Do not route through `applyRoadmapConflictAutoRemedy`.

- _Rationale:_ the shared remedy fails this command twice over. Its discovery half requires the receipt's recorded
  result base to equal the live configured base, which is exactly the state advancement is not in. Its resolution
  half renders from inputs the plan does not own — it reads the merged index under an overlay its own discovery
  must supply, where the plan renders the projected tree it already composed under the overlay it already holds.
  Core finalization admits a candidate only when its ROADMAP equals the render its plan projected against the
  result base, so taking the remedy's bytes would seal a receipt whose projection describes a tree that never
  existed.

- _Note:_ this is not a second renderer. It is the renderer the plan already runs, producing bytes the plan already
  projected, which is what makes the seal's projection-equality check in Task 3.4.a real on every path rather than
  holed. The generic remedy is untouched for every caller that must still discover.

- _Note:_ this surface is interim by construction. It exists because ROADMAP is currently carried on every branch;
  the project's storage direction moves operational-state projections off the tracked tier, at which point the
  projection is not an allowed path and has no merge behavior at all. Keep the coupling to one excluded slot, one
  render call, and one discovery arm so arriving there is a deletion rather than an unpicking.

    - `[ ]` **3.3.a Execute the append-only merge**

        - Build `test-first` (one behavior at a time):

            - Merges an advanced base carrying no overlap with recorded paths.

            - Uses no rebase, amend, or force-push on any path through the command.

            - Refuses to proceed when the pinned base moves before the merge begins.

    - `[ ]` **3.3.b Re-derive the projection, and restore on everything else**

        - Stage the plan's rendered ROADMAP unconditionally — whether the merge conflicted on it, resolved it
          cleanly, or left it untouched. A clean textual merge is not a correct result here: it would blend the
          candidate's projection with the base's, producing bytes neither the plan nor any render would produce.

        - Build `test-first` (one behavior at a time):

            - Stages the plan's rendered projection when the merge conflicted on it.

            - Stages the same bytes when the merge resolved the projection cleanly.

            - The staged projection equals the plan's projected after-state exactly.

            - Restores the bounded pre-merge candidate on any conflict outside the projection.

            - Restores the bounded pre-merge candidate on interruption mid-merge.

            - Leaves no partial merge state behind after a restore.

### `[ ]` **3.4 Stage one current same-path receipt**

- _Goal:_ Advancement changes only base-derived mechanical evidence, leaving every semantic destination byte and
  mode exactly as authored and review approved.

- _Context:_ the restated preparation and the plan it composes from were produced and proven in Task 3.2.c, before
  the merge — that is the admission. What remains here is sealing the receipt over what the merge produced and
  proving the result is admissible.

- _Rationale:_ the governing invariant is that the authored cut stays byte-identical while every base-derived fact
  is re-derived by its own producer. Receipt identity is what keeps the receipt in place — `v3ReceiptId` digests
  origin, source branch, and source head alone, so it is invariant under base movement and keeps the refreshed
  receipt on its original path — while the authored-cut half is proven byte-wise wherever a restated record is
  admitted. Preparation identity covers the result base and legitimately changes.

    - `[ ]` **3.4.a Seal the advanced receipt and preserve every semantic destination**

        - Seal the receipt through `createV3DecomposeReceipt` — the constructor finalization uses — from live path
          reads over the merged tree, carrying the recorded `finalized.publication.initialContinuation` forward
          unchanged. Advancement re-derives base-dependent facts and decides no distribution.

        - The destination-output derivation feeding that constructor is module-private to the retirement driver
          today. Export it beside the recovery-fact constructor Task 4.1.a consolidates, rather than
          reimplementing the projection, so finalization and advancement seal receipts from one derivation.

        - Hold the merged result to the re-composed plan's projection on **every** allowed path, projections
          included, and refuse-and-restore on any divergence.

        - _Shape:_ the projection is in scope for that equality precisely because Task 3.3.b re-derives it through
          the plan's own render rather than accepting a foreign one — merged bytes and projected bytes are the same
          bytes by construction, so the check is real on every path instead of carrying a hole. That is also what
          keeps an advanced receipt satisfying the invariant core finalization enforces on every other receipt:
          `roadmapMismatch` admits a candidate only when its projection equals the render its plan projected
          against the result base, and re-deriving through the plan preserves that standard rather than exempting
          advancement from it.

        - Build `test-first` (one behavior at a time):

            - Every allowed path's merged state equals its projected after-state, projections included.

            - Refuses and restores when a managed destination diverges from the projection.

            - The sealed receipt's `prospectiveProjection` describes the tree that was actually staged.

            - Preserves every destination byte and mode across advancement.

            - Leaves the receipt identity and its path unchanged across advancement.

            - Refuses when the merged result would alter a semantic destination.

    - `[ ]` **3.4.b Stage the receipt for one ordinary commit**

        - Compare-and-swap the same receipt path and stage ROADMAP plus receipt for one ordinary commit. Hook
          admission is proven where the arms are built — Tasks 3.4.c, 3.4.e, and 3.4.f — and composed in
          Task 5.1.b.

        - _Note:_ repetition follows the same authority rather than a one-shot guard. Comparing the recorded result
          base against the live base separates the two cases, so neither needs an advancement ledger, and the
          candidate stays committed-unlanded across both — the precondition in Task 3.2.a holds on every pass.

        - Build `test-first` (one behavior at a time):

            - The receipt remains the sole live current receipt for its origin.

            - Re-invocation while the recorded result base is still the live base is a no-op.

            - A base that has advanced again runs the same append-only merge again.

    - `[ ]` **3.4.c Admit the advancing shape at the finalized-record commit gate**

        - _Goal:_ The advancement commit passes the core's record gate on its own authorized arm, and every commit
          shape the gate judged before the extension is judged identically after it.

        - The gate refuses this commit on three independent arms today, each resting on one assumption — that a
          candidate's head equals its prepared base, so its receipt is always a first-time addition. A merge may
          not introduce a retirement record; a record change must be status `A` with nothing at that path in
          `HEAD`; and the staged write set must equal the receipt path plus its transition patch exactly.
          Advancement violates all three by construction, and splitting into two commits escapes none of them —
          the modified-not-added refusal fires on an ordinary commit too.

        - Add the arm for a base-advancing merge whose record change **restates** the receipt already at that
          path: same receipt identity, moved preparation identity, and a write set that admits the merge's
          inherited paths alongside the exact expected set.

        - _Shape:_ distinguishing a restatement from an amendment is the arm's real decision, and receipt identity
          alone cannot make it — identity digests the origin and its source, never the authored cut, so a record
          whose authored block was rewritten presents the same identity-and-path signature a restatement does. The
          arm decides on bytes the gate already reads: the staged record's authored block must be byte-equal to
          the receipt at `HEAD`, and only the machine-derived facts may move. The advancement command's own
          byte-identical-cut abort is the producer-side twin of this proof, not a substitute — the gate defends
          against every producer.

        - _Note:_ this extends the gate rather than redefining it. No existing caller can produce the shape, since
          only advancement commits a candidate whose receipt already exists, so the arm is unreachable for every
          other path through the gate.

        - Build `test-first` (one behavior at a time):

            - Admits a base-advancing merge whose record change restates the receipt at its existing path.

            - Refuses an amendment that moves receipt identity.

            - Refuses an amendment whose authored block moved under a stable receipt identity.

            - Refuses an ordinary merge that introduces a retirement record.

            - Refuses a first-time addition that arrives on a merge commit.

            - Admits the merge's inherited paths without admitting a rider outside the expected set.

            - Every pre-extension gate verdict is unchanged, across additions, amendments, prepared-not-finalized
              records, and non-record commits.

    - `[ ]` **3.4.d Restate the candidate claim's binding**

        - _Goal:_ A landed advanced candidate retires through the ordinary receipt-backed cleanup gate, because
          its claim is bound to the base the record now names rather than the one it was cut against.

        - The claim binding records the result base head and the cut-map digest alongside origin, candidate
          branch, and source head. Advancement moves the first two — the base head by definition, the digest
          because it covers the machine block the base sits in — while the record is written once at acquisition
          and never updated afterward. Add the operation that restates those two fields on the live claim, under
          the same claim id, generation, and candidate, and run it as part of the same authority that restates
          the record.

        - _Rationale:_ without it this is a silent stranding rather than a refusal. Receipt-backed cleanup admits
          only a claim whose binding matches the anchor's facts, so an advanced-and-landed candidate passes every
          gate this work unit adds and then fails the one that reclaims it — the candidate branch and worktree
          survive indefinitely with nothing in the transform reporting a fault.

        - _Shape:_ restating the binding, rather than narrowing the cleanup gate to base-invariant facts, keeps
          the gate's strength for every caller. Those two fields exist to bind a claim to an exact cut; the
          operation that moves the cut's base is the one that owns moving them.

        - Build `test-first` (one behavior at a time):

            - Restates the binding's result base head and cut-map digest to the re-derived values.

            - Leaves claim id, generation, candidate branch, origin, and source head untouched.

            - The cleanup gate admits the advanced candidate's claim after landing.

            - Refuses to restate a claim that is not the live claim for this candidate.

            - A refused advancement leaves the binding as it was.

    - `[ ]` **3.4.e Admit the restated receipt at the projection regeneration assert**

        - _Goal:_ The advancement commit passes the pre-commit projection assert re-rendering under the overlay
          the plan rendered with, and every commit shape the assert judged before the extension is judged
          identically after it.

        - _Context:_ the assert independently re-renders the staged projection and demands byte equality,
          discovering its transition overlay from the staged retirement record — and its discovery recognizes
          only an added record, because every producer before advancement commits its receipt exactly once.
          Advancement stages a modification at that same path, so an unextended discovery re-renders with no
          overlay while the staged bytes were rendered with one; the divergence reaches rendered entries, because
          the overlay suppresses the retired origin's own entry and the source-ref pin guarantees that entry is
          present to suppress.

        - Extend the discovery to accept a modified record at the receipt's own path under the same proof as the
          gate arm in Task 3.4.c: authored block byte-equal to the receipt at `HEAD`, machine-derived facts free
          to move. A restated receipt grants its overlay; an amendment grants nothing, exactly as a malformed
          added record grants nothing today.

        - Build `test-first` (one behavior at a time):

            - Admits advancement's staged projection, re-rendering under the restated record's overlay.

            - Grants no overlay for a modified record whose authored block moved.

            - Discovers an added record's overlay exactly as before the extension.

            - Still rejects a staged projection whose bytes mismatch the overlay-aware re-render.

    - `[ ]` **3.4.f Classify restated provenance in the merge-overlay discovery**

        - _Goal:_ The commit-time conflict remedy discovers advancement's transition authority instead of
          refusing the restated receipt as namespace corruption, so the pre-commit hook family admits the
          advancement commit end to end.

        - _Context:_ the ROADMAP auto-remedy runs at every commit and its eligibility is shape-level — a
          merge-like state with the projection staged and no wider conflict is exactly advancement's commit
          shape. Its discovery classifies the staged record against each parent's copy of the same path, and a
          parent carrying different bytes reads as namespace corruption — the state a restated receipt produces
          against the candidate's own pre-merge tip by construction.

        - Extend the parent-provenance classification with the restatement arm — the same proof as Tasks 3.4.c
          and 3.4.e: a parent copy whose authored block is byte-equal to the staged record's, with only
          machine-derived facts moved, is restated provenance rather than conflict.

        - _Shape:_ the extension is two-layered, because the provenance vocabulary is a closed contract
          recording where **exact** receipt bytes were observed and a restated parent is exactly not that. The
          union gains a named restated kind carrying the parent's commit oid, and the pure selector's
          provenance-validity check admits that kind as satisfying its at-least-one-parent requirement, under
          the same oid binding an exact entry carries. Pushing a restated parent through the existing
          exact-bytes kinds instead would silently falsify the contract every other caller reads; relaxing the
          validity check without a recorded kind would erase the distinction its refusal exists to draw. With
          both layers extended, discovery succeeds on its own terms — at commit time the restated record's
          result base is the live configured base — and the remedy's re-render converges with the plan's staged
          bytes, the equality the regeneration assert independently enforces.

        - _Note:_ the command's own resolution still never routes through the remedy. Mid-merge, before the
          restatement is staged, discovery refuses exactly as Task 3.3's rationale records; this arm acts at the
          hook's invocation, where the restated record is already staged.

        - Build `test-first` (one behavior at a time):

            - Classifies a parent copy differing only in machine-derived facts as restated provenance.

            - Records the restated kind distinctly from the exact-bytes provenance kinds, bound to the parent's
              commit oid.

            - The selector admits a snapshot whose only parent provenance is restated.

            - The selector still refuses a snapshot carrying no parent provenance at all.

            - Still classifies a parent copy whose authored block moved as conflicting.

            - Discovers the restated receipt's overlay at advancement's commit shape.

            - The remedy's re-render at that shape byte-equals the plan's staged projection.

            - Every non-advancement provenance classification is unchanged.

## **Phase 4:** Recovery vocabulary extension

_Purpose:_ Give the transform one actionable route out of the committed-candidate state, replacing terminal prose
guidance wherever established facts authorize the new command.

_Design decisions:_ Exactly one arm is added to the core's closed recovery union — no second classifier, no
parallel mapper, no prose-derived remedy. Mismatch loci stay diagnostics and never become command operands.

Each action carries only the facts that authorize it, so the new arm takes a narrowed shape rather than reusing the
finalize invocation wholesale — it consumes no continuation. The two sites that feed the mapper build their
recovery facts through one shared constructor for the same reason.

The cause vocabulary gains one arm as well. No existing cause represents a host unable to retain an immutable
base/head pair, and both alternatives are closed off — a mismatch locus stays a diagnostic, and the validator
constructs no actions. Adding a cause is not adding a classifier: the action union still gains exactly one arm,
and the one mapper still decides.

### `[ ]` **4.1 Add the `advance-base` arm to the core recovery union**

- _Goal:_ The recovery vocabulary gains one arm that carries only the origin and receipt facts authorizing the
  command, and renders the exact invocation.

    - `[ ]` **4.1.a Consolidate the recovery-fact constructor**

        - _Goal:_ Both paths that feed the recovery mapper establish their facts identically by construction, so the
          new arm cannot reach one path and miss the other.

        - The retirement driver and the finalization adapter each build the same provenance-tagged invocation facts
          inline. Export one constructor and have both call it.

        - _Shape:_ scoped to the fact constructor feeding the mapper this phase extends. Wider cleanup of the
          retirement driver is a separate concern and stays out.

        - Build `test-first` (one behavior at a time):

            - Both paths produce identical facts for the same invocation.

            - A non-canonical receipt id still yields empty facts on both paths.

    - `[ ]` **4.1.b Extend the union and mapper**

        - Add the arm to `V3DecomposeFinalizationRecovery` alongside `retry`, `discard`, `re-preflight`,
          `reauthor`, and `guidance`, carrying a narrowed `{ provenance, origin, receiptId }` rather than the whole
          finalize invocation.

        - Add the binding-unavailable cause that Task 1.3.b routes to, and map it to the same arm. That cause is
          the arm's only route until Task 4.2.b adds the committed-receipt one, so the behaviors below are stated
          against it rather than cause-agnostically.

        - Build `test-first` (one behavior at a time):

            - Resolves the binding-unavailable cause to the arm when verified origin and receipt facts are
              supplied.

            - Falls back to existing guidance when those facts are unavailable.

            - Never sources an operand from a validator mismatch locus.

            - Carries only the narrowed facts, consuming no continuation.

    - `[ ]` **4.1.c Render the exact command**

        - Add the advance-base renderer beside the existing preflight, execute, discard, and finalize renderers,
          and extend the recovery renderer's exhaustive switch.

        - Build `test-first` (one behavior at a time):

            - Renders a correctly quoted invocation for ordinary and awkward operands.

### `[ ]` **4.2 Convert the committed-candidate dead end**

- _Goal:_ A committed receipt parent resolves to an actionable route instead of terminal prose, while the states
  the command cannot repair keep the honest dead end they have today.

- _Context:_ The `candidate-parent-record` refusal maps to a `committed-candidate` cause that today resolves to
  prose guidance — inspect the committed state instead of retrying or discarding — because at core scope no safe
  route existed. This work unit supplies that route for one of the states behind it.

    - `[ ]` **4.2.a Discriminate the committed parent record**

        - _Goal:_ The cause distinguishes which committed state the refusal saw, so routing can act on the one this
          command repairs.

        - The refusal fires identically for a committed preparation, a committed receipt, and an unparseable
          record, and the authorizing facts are the same in all three — so authority alone cannot discriminate.
          Carry the decoded record kind on `candidate-parent-record` and forward it onto the cause.

        - Build `test-first` (one behavior at a time):

            - Each of a committed preparation, a committed receipt, and an unparseable record is reported as
              itself.

            - Every other finalization refusal is unchanged.

    - `[ ]` **4.2.b Route the repairable state to the new arm**

        - Build `test-first` (one behavior at a time):

            - Resolves a committed receipt to the arm when established facts authorize the command.

            - Retains the existing guidance for a committed preparation or an unparseable record.

            - Retains the existing guidance for a committed receipt when the facts are unavailable.

            - Leaves every other cause's mapping unchanged.

## **Phase 5:** Real-topology acceptance and boundary preservation

_Purpose:_ Prove command, Git, hook, and landing composition against real DAGs at proportional test homes, and
assert that no core, extraction, or host-policy boundary moved.

_Design decisions:_ Real-Git matrices stay in integration; the mode surface stays in the existing command-mode and
e2e homes. No full transform or remote cross-product is rebuilt here.

### `[ ]` **5.1 Cover the mobility topology at proportional homes**

- _Goal:_ One focused real-Git suite proves the novel graph boundaries this work unit introduces, without
  rebuilding the core transform matrix.

- _Approach:_ Extend the existing decomposition fixtures and the real-Git finalization integration home rather
  than standing up a parallel harness. Exercise both protection modes only where committed-unlanded state actually
  differs between them.

    - `[ ]` **5.1.a Exercise the real-Git DAG matrix**

        - Cover exact base, strict descendant, regressed, divergent, path conflict, mode conflict, type conflict,
          dependency conflict, and mid-operation base and head movement.

        - Cover both landing shapes for an advanced candidate — fast-forward onto the candidate, and merged into
          the base — since advancement changes the candidate's parent arity and only one of those was reachable
          before.

        - Cover the merge landing over a descendant base for both candidate arities, proving the recorded landing
          topology is the merge itself rather than a fast-forward at the candidate.

        - Cover a base advance whose only recorded-path change is the projection, which is the ordinary case and
          the one a touched-path reading would refuse.

    - `[ ]` **5.1.b Prove end-to-end composition**

        - Cover finalized receipt through advancement or exact landing, then live anchor, then both consumers that
          gate on it — cleanup admission and the launch path's anchor resolution — as one path, without duplicating
          the full transform or the remote matrix.

        - Cover the launch case the anchor exists for: decompose, land, merge an unrelated commit onto the base,
          then start a member. That is the sequence that fails today, and a matrix that starts a member
          immediately after landing would pass while proving nothing.

        - Cover the refusal path as well: a refused advancement leaves the candidate committed and unlanded,
          exactly as it was found.

        - Cover the advancement commit against the complete pre-commit hook family — the record gate's advancing
          arm, the projection assert's restated-record discovery, and the conflict remedy's restated-provenance
          classification — as one committed path rather than only as per-hook units.

        - Carry the composition through claim retirement, not only to the anchor: advance, land, merge an
          unrelated commit, then reclaim the candidate through the cleanup gate. A matrix that stops at anchor
          resolution would pass while leaving the candidate permanently unreclaimable.

        - Cover both source kinds at the precondition — a started-planning origin advances, a backlog-stub-sourced
          one refuses — since the two differ precisely in whether the source snapshot tracks the base.

        - _Note:_ the evidence fixture exposes a single entry point, so the topology matrix extends it rather than
          composing from a richer existing set.

### `[ ]` **5.2 Assert the preserved core and host-policy boundaries**

- _Goal:_ The work unit demonstrably adds no duplicate validator, no semantic gate, no extraction behavior, and no
  host-policy grant.

- _Rationale:_ These are the commitments most easily eroded by a plausible-looking convenience, and they are what
  keeps the member independently safe alongside its siblings. Only part of that is mechanically decidable, and the
  honest instrument differs between the parts.

    - `[ ]` **5.2.a Extend the existing authority-boundary proof**

        - The decomposition authority-boundary proof already walks the source graph, asserting removed-module
          absence, forbidden-identifier absence, and positive exported-symbol presence. Extend it there rather
          than standing up a second boundary home: add the positive assertions that this work unit's own
          boundary-carrying symbols are exported where the design says they are.

        - Two of the three assertions need the proof's positive half widened first. Its exported-presence helper
          inspects exported **function declarations**, which reaches the landing validator but not the producer's
          descent input — an interface field — or the recovery arm, a member of an exported type-alias union.
          Widen the helper to inspect interface members and union arms, so all three assertions rest on the same
          instrument rather than on a weaker proxy for two of them.

        - _Shape:_ the negative half does not extend cleanly and is not forced to. Extraction source-thinning has
          no symbols to forbid — it belongs to a sibling that is not built. The planning-lane boundary has nothing
          the negative half can name either: the forbidden set is matched against identifier text, and the live
          shipped surface is a hyphenated command literal that can never be an identifier, so forbidding it would
          assert nothing while forbidding the identifiers that do exist would flag correct, unrelated shipped
          code. Absence of a ledger, transaction, cache, or token is a design property rather than an identifier
          at all. Those commitments stay Success Criteria, decided against the finished change during the
          verification phase where a human check is the honest instrument.

        - Build `test-first` (one behavior at a time):

            - The landing validator, the descent-proof producer input, and the recovery arm are exported from the
              modules the design assigns them to.

            - The positive half resolves an interface member and a type-alias union arm, not only a function
              declaration.

            - The existing removed-module and forbidden-identifier assertions still pass unchanged.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` A canonical full-protection candidate advances across unrelated base movement through one append-only
  merge.
- `[ ]` A regenerable projection is the only automatically resolved path, and it is re-derived rather than merged;
  every other conflict restores the bounded candidate.
- `[ ]` The restaged same-path receipt passes the core hooks and remains the sole live current receipt, through
  authorized advancing-shape arms on the commit gate, the projection regeneration assert, and the conflict
  remedy's provenance discovery — all deciding restatement by the same authored-block byte-equality proof — that
  leave every existing caller's verdict unchanged.
- `[ ]` Exact and strict-descendant bases land only when all touched paths, modes, types, and dependencies replay.
- `[ ]` The shared integration anchor resolves over a descendant current base — after the canonical receipt and
  transition validate against the reread configured base — so a member stays launchable across unrelated commits
  on the base rather than only while the base head is the landing commit.
- `[ ]` Ref movement, divergence, overlap, or unavailable immutable-pair binding produces one typed recovery
  action.
- `[ ]` A committed receipt parent resolves to the actionable `advance-base` arm instead of terminal prose
  guidance, while a committed preparation or unparseable record keeps its existing guidance.
- `[ ]` The base-advancing mode stays distinguishable from the core's uncommitted same-base receipt refresh at the
  command surface and in every refusal code.
- `[ ]` Canonical validation, the landing verdict, and re-derivation against the advanced base all precede the
  merge; a refusal from any of them aborts with no repository mutation to restore.
- `[ ]` Advancement re-derives every base-dependent fact through its own producer; a change to the authored cut,
  or a receipt identity that moves, aborts.
- `[ ]` A base advance that alters the origin's own predecessor state is refused, even where the recorded
  transition patch replays cleanly.
- `[ ]` ROADMAP is re-derived through the plan's own render and staged as the resolution, leaving the shared
  discovery-based remedy untouched for its own callers.
- `[ ]` The advanced receipt is sealed after the merge from live path reads, and every allowed path — projections
  included — matches the re-composed plan's projection, so an advanced receipt satisfies the same
  prospective-projection invariant core finalization enforces on every other receipt.
- `[ ]` Regenerable projections are excluded from the landing verdict's overlap model, so a base advance that
  changed only ROADMAP is admitted rather than refused.
- `[ ]` A candidate whose recorded source ref is the result-base ref is refused on its precondition, without
  mutating the repository, on a structural test rather than a source-kind check.
- `[ ]` A decomposition landed by fast-forward onto an advanced candidate resolves its anchor, with every
  pre-existing exact-base verdict unchanged.
- `[ ]` A merge landing over a descendant base records the landing merge itself as the landing commit, so one
  receipt's anchor facts read the same before and after unrelated base movement.
- `[ ]` A landed advanced candidate retires through the ordinary receipt-backed cleanup gate, because advancement
  restated its claim binding alongside the record rather than leaving the claim bound to the superseded base.
- `[ ]` A refused advancement leaves the candidate exactly as it found it — committed, unlanded, and no further
  torn down than before the attempt.
- `[ ]` No rebase, amend, force-push, mobility ledger, host-policy grant, second anchor shape, or duplicate
  validator is added.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.
