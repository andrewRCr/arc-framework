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
          `readGitV3DecomposeTreeSnapshot`, which needs `{ cwd, exec, readBlob(commit, path) }` plus `ref` and
          `origin` operands and signals failure by throwing rather than by a result arm. Accept both as separate
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
  landing commit, while its exact-base verdicts stay byte-identical.

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

        - _Note:_ the cost is one production construction site plus the test literals building the same facts. The
          tree's second producer call site is a pure resolver with no production caller, so it inherits the
          requirement without a behavioral consequence and needs no work of its own.

        - Build `test-first` (one behavior at a time):

            - Resolves when the current base equals the landing result (unchanged behavior).

            - Resolves when the current base is a proven descendant, populating `currentBaseHead` with the live
              base and `landedCommitHead` with the landing commit.

            - Refuses a differing current base carrying no descendant proof.

            - Refuses a descendant proof naming any pair other than the landing commit and the live base.

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

        - Enumerate the commits the current base has gained since the recorded prepared base — one bounded
          enumeration, not a walk — and apply the core's existing landing predicate to that set. An empty result,
          or a set containing no landing commit, is `not-landed`.

        - _Shape:_ enumeration rather than a first-parent walk is a correctness choice before it is a cost one. A
          base that advanced through a merge puts the landing commit off the first-parent line entirely, so a walk
          misses exactly the case this phase exists to admit; a walk also has no termination when the prepared base
          is not on that line. Enumerating what the base gained finds the landing wherever it sits, bounds the
          search by how far the base advanced rather than by repository history, and asks nothing of path-history
          simplification.

        - _Note:_ the search **finds** where the exact path **claims**, and the two answer a mismatch differently.
          A base asserting itself as the landing whose transition does not replay is a corrupt claim and refuses; a
          located commit whose transition does not replay simply is not this receipt's landing, and returns
          `not-landed`. Refusing there would convert a genuinely unlanded receipt from `not-landed` into
          `transition-tree` — visible to callers, since landed-handoff maps `not-landed` to itself but every
          refusal to `namespace-corrupt`.

        - `landingFor` reads `resultHead` and `resultTree` from the current base commit, which is the landing commit
          only in the exact case. Both come from the located landing commit instead; the current base supplies the
          search's starting point and nothing else.

        - **Relocate**, do not delete, the adapter's insistence that the candidate tree equal the current base tree:
          re-read it against the located landing commit, where it means what it always meant. Deleting it looks
          safe because the producer carries an equivalent landing-tree check, and is not — the adapter's check
          fires first and refuses as `transition-tree`, the producer's as `landing-topology`, and those reasons
          reach callers verbatim. Deletion silently reclassifies an existing exact-base refusal.

        - Build `test-first` (one behavior at a time):

            - Detects fast-forward landing when the base has since advanced.

            - Detects two-parent merge landing when the base has since advanced.

            - Detects a landing that an intervening merge placed off the base's first-parent line.

            - Sources the landing head and tree from the landing commit rather than the current base.

            - Returns `not-landed` when the enumerated set contains no landing commit.

            - Preserves the `transition-tree` refusal for a candidate tree that does not match the landing commit.

            - Returns `not-landed` when a located candidate's recorded transition does not replay.

            - Leaves the exact path's `transition-tree` refusal unchanged.

    - `[ ]` **2.2.b Prove the descendant relation for the producer**

        - Supply the `baseDescent` proof Task 2.1.a consumes, naming the located landing commit and the pinned
          current base, derived from pinned objects and closed by the existing final reread.

        - Build `test-first` (one behavior at a time):

            - Proves a strict descendant relation between landing commit and current base.

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

Every candidate-side operation runs in the candidate's registered worktree, which is also the `cwd` the ROADMAP
remedy resolves its base branch, index transaction, and write path against. The operator's own checkout is never
the merge target.

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
          Task 3.1.a deliberately leaves hand-maintained — omitting it lands the option with no schema ownership
          in the repository command-input inventory, which no existing assertion would catch.

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

        - _Shape:_ do not reach for the existing candidate inspection. That surface is uncommitted-only — it
          requires the candidate head to equal the prepared base, which a committed candidate never satisfies —
          so adapting it would mean widening a contract this work unit only consumes. Its refusal vocabulary is
          also the discard path's, and this command's refusals must stay distinguishable.

        - Build `test-first` (one behavior at a time):

            - Admits a clean committed candidate whose receipt is unreachable from the base.

            - Refuses when the receipt commit is already reachable from the base (landed).

            - Refuses a dirty index or worktree.

            - Refuses a foreign or superseded candidate generation.

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

        - _Shape:_ two properties make this safe to run pre-merge. Composition pins the base by requiring the
          restated head to be the live tip of the recorded base ref — exactly what advancement restates it to —
          and it reads only the source, merge-base, and result-base trees, never the candidate. So the whole
          derivation is provable while the candidate still sits where it was.

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

            - Aborts when the authoring block differs by digest.

            - Aborts when the re-derived receipt identity does not match the recorded one.

            - Re-derives the preflight, plan, and preparation identities, and the prospective projection's overlay
              and ROADMAP pair, against the advanced base.

            - The re-assembled record parses and re-validates through the core's own parser.

### `[ ]` **3.3 Merge the pinned base without rewriting history**

- _Goal:_ The candidate absorbs the advanced base through one append-only merge, and any outcome other than a clean
  merge or a ROADMAP-only conflict leaves the pre-merge candidate exactly as it was.

- _Approach:_ Route ROADMAP resolution through `applyRoadmapConflictAutoRemedy`, which already regenerates and
  restages from the staged-index projection and already refuses on any wider conflict. No second renderer and no
  second conflict classifier is introduced.

- _Rationale:_ the remedy's shared path discovers transition authority from a pinned snapshot and requires the
  receipt's recorded result base to equal the live configured base. Advancement is precisely the state where those
  differ, so discovery refuses by construction and cannot serve this command. The remedy already takes its overlay
  resolver as an injected dependency alongside the repository root, Git executor, and write seam, so this command
  supplies the authority it was invoked with rather than discovering it — same renderer, same classifier, only the
  discovery-and-selection layer skipped. Callers that must still discover keep the generic path untouched.

- _Note:_ with authority supplied, the resolver's ambiguous, stale, and refused arms are unreachable here, so the
  raise they produce is not part of this command's restore surface. Discovery-side callers keep it.

    - `[ ]` **3.3.a Execute the append-only merge**

        - Build `test-first` (one behavior at a time):

            - Merges an advanced base carrying no overlap with recorded paths.

            - Uses no rebase, amend, or force-push on any path through the command.

            - Refuses to proceed when the pinned base moves before the merge begins.

    - `[ ]` **3.3.b Resolve ROADMAP only, and restore on everything else**

        - Build `test-first` (one behavior at a time):

            - Regenerates and restages a ROADMAP-only conflict through the existing owner.

            - Supplies the validated overlay to the remedy rather than letting it discover one.

            - Restores the bounded pre-merge candidate on any non-ROADMAP conflict.

            - Restores the bounded pre-merge candidate on interruption mid-merge.

            - Restores the bounded pre-merge candidate when the remedy returns a failed status.

            - Leaves no partial merge state behind after a restore.

### `[ ]` **3.4 Stage one current same-path receipt**

- _Goal:_ Advancement changes only base-derived mechanical evidence, leaving every semantic destination byte and
  mode exactly as authored and review approved.

- _Context:_ the record itself was produced and proven in Task 3.2.c, before the merge. What remains here is
  staging it and proving the result is admissible.

- _Rationale:_ the governing invariant is that the authored cut stays byte-identical while every base-derived fact
  is re-derived by its own producer. Receipt identity carries the other half of that check — `v3ReceiptId` digests
  origin, source branch, and source head alone, so it is invariant under base movement and keeps the refreshed
  receipt on its original path. Preparation identity covers the result base and legitimately changes.

    - `[ ]` **3.4.a Preserve every semantic destination across the merge**

        - Build `test-first` (one behavior at a time):

            - Preserves every destination byte and mode across advancement.

            - The staged transition patch matches the one re-derived against the advanced base.

            - Leaves the receipt identity and its path unchanged across advancement.

            - Refuses when the merged result would alter a semantic destination.

    - `[ ]` **3.4.b Stage the receipt and prove hook admission**

        - Compare-and-swap the same receipt path and stage ROADMAP plus receipt for one ordinary commit.

        - _Note:_ repetition follows the same authority rather than a one-shot guard. Comparing the recorded result
          base against the live base separates the two cases, so neither needs an advancement ledger, and the
          candidate stays committed-unlanded across both — the precondition in Task 3.2.a holds on every pass.

        - Build `test-first` (one behavior at a time):

            - The staged receipt passes the core record-validation hook.

            - The receipt remains the sole live current receipt for its origin.

            - Re-invocation while the recorded result base is still the live base is a no-op.

            - A base that has advanced again runs the same append-only merge again.

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

    - `[ ]` **5.1.b Prove end-to-end composition**

        - Cover finalized receipt through advancement or exact landing, then live anchor, then both consumers that
          gate on it — cleanup admission and the launch path's anchor resolution — as one path, without duplicating
          the full transform or the remote matrix.

        - Cover the launch case the anchor exists for: decompose, land, merge an unrelated commit onto the base,
          then start a member. That is the sequence that fails today, and a matrix that starts a member
          immediately after landing would pass while proving nothing.

        - Cover the refusal path as well: a refused advancement leaves the candidate committed and unlanded,
          exactly as it was found.

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

        - _Shape:_ the negative half does not extend cleanly and is not forced to. Extraction source-thinning has
          no symbols to forbid — it belongs to a sibling that is not built — and `planning-lane` names a live,
          unrelated shipped command, so adding it to the forbidden set would flag correct existing code. Absence
          of a ledger, transaction, cache, or token is a design property rather than an identifier at all. Those
          commitments stay Success Criteria, decided against the finished change during the verification phase
          where a human check is the honest instrument.

        - Build `test-first` (one behavior at a time):

            - The landing validator, the descent-proof producer input, and the recovery arm are exported from the
              modules the design assigns them to.

            - The existing removed-module and forbidden-identifier assertions still pass unchanged.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` A canonical full-protection candidate advances across unrelated base movement through one append-only
  merge.
- `[ ]` ROADMAP is the only automatically resolved conflict; every other conflict restores the bounded candidate.
- `[ ]` The restaged same-path receipt passes the core hook and remains the sole live current receipt.
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
- `[ ]` ROADMAP regenerates through the shared renderer with a supplied overlay, leaving the discovery-based
  remedy unchanged for its own callers.
- `[ ]` A refused advancement leaves the candidate exactly as it found it — committed, unlanded, and no further
  torn down than before the attempt.
- `[ ]` No rebase, amend, force-push, mobility ledger, host-policy grant, second anchor shape, or duplicate
  validator is added.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.
