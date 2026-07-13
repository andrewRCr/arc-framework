# Task List: Notes Export History Containment

- **Design:** `spec-notes-export-replay-ordering.md`

---

## **Phase 1:** Local-Exclusive Notes History

_Purpose:_ Derive the complete set of annotated commits introduced by a pinned canonical notes tip, including
historical and snapshot entries that are absent from the current notes tree.

### `[x]` **1.1 Read the local-exclusive annotated-commit set from notes history**

- _Goal:_ A pinned local/remote notes range yields every newly published annotated commit exactly once and fails
  closed on any path or history record it cannot interpret.

    - `[x]` **1.1.a Parse status-bearing notes-history records**
        - Added a strict NUL-framed status parser that collects added, modified, and cross-commit rename destinations;
          excludes deletions, fanout-only renames, and compaction metadata; and rejects malformed paths or records
          before returning any publication set.

    - `[x]` **1.1.b Read and deduplicate the pinned local-exclusive range**
        - Added a strict, single-call history reader over pinned local and optional remote tips, using root and
          merge-parent diffs plus explicit commit framing; it deduplicates valid publication paths while propagating
          every Git, framing, and status parse failure.

### `[x]` **1.2 Prove root, merge, fanout, rename, deletion, and malformed-history behavior**

- _Goal:_ Real Git histories demonstrate that the range reader protects historical note content that current-tree
  inspection would miss.

- _Outcome:_ Added focused real-Git coverage for root/snapshot history, deletions, merge-parent diffs, fanout and
  cross-object renames, malformed paths, and Git failures; consolidated the duplicated notes-tree builder into one
  nested-tree-capable integration fixture shared by all three suites.

## **Phase 2:** Live Remote Publication Proof

_Purpose:_ Establish one bounded, reusable view of live remote branch heads and prove annotated-commit publication
against locally readable live tips without fetching branch objects.

### `[x]` **2.1 Generalize the bounded live-head membership read**

- _Goal:_ Notes publication and existing in-flight consumers share one authoritative, bounded remote-head query that
  preserves the difference between an empty remote and an unavailable remote.

    - `[x]` **2.1.a Expose the typed live-head result**
        - Exported one timeout-bounded live-head read carrying reachability, completeness, and validated lowercase
          SHA-1/SHA-256 branch tips; malformed, duplicate, empty, and non-head records remain a safe incomplete
          under-approximation rather than becoming publication evidence.

    - `[x]` **2.1.b Migrate existing membership consumers to the shared helper**
        - Routed live-branch listing, remote-tracking pruning, and in-flight derivation through the shared snapshot;
          updated their Git fixtures to real object IDs while preserving empty, unreachable, and local-only
          degradation behavior.

### `[x]` **2.2 Prove publication through the union of locally readable live-head histories**

- _Goal:_ Every annotated commit in the publication set is proven reachable from at least one currently live remote
  head using only branch-tip objects already available in the local repository.

    - `[x]` **2.2.a Select locally readable live commit tips in one object check**
        - Added a typed proof helper that short-circuits verified-empty sets, requires the stdin Git seam, consumes
          only complete live-head snapshots, deduplicates tips, and strictly validates one batched object-type response
          without fetching or spawning per-object reads.

    - `[x]` **2.2.b Walk the live-tip union once and compare the publication set**
        - Walks readable live tips through one validated stdin traversal, proves complete coverage immediately, and
          reports unpublished history only after every live tip is readable in a confirmed non-shallow repository;
          focused unit failures and real live/stale/shallow repositories cover the refusal boundary.

## **Phase 3:** Canonical Publication Planner and Transport

_Purpose:_ Replace reconstructed branch-bounded exports with a read-only three-part planner whose only successful
target is the captured canonical notes tip.

### `[ ]` **3.1 Define the proof-bearing canonical publication target and result contract**

- _Goal:_ Callers can transport notes only through an immutable target that records a successfully proven canonical
  tip, while each unsafe topology has a stable refusal class.

    - Simplify `BranchBoundedNotesExportTarget` in
      `packages/arc-framework/src/lib/user-sync/branch-bounded-notes-export.ts` to exactly the destination ref and
      captured canonical tip required by push and marker publication.
    - Remove reconstruction/adoption fields and the `empty-export` skip; reserve `no-local-notes` for an absent
      canonical ref, not an existing ref with an empty current tree.
    - Give refused plans a stable `reason` union for `unpublished-history`, `history-diverged`,
      `compaction-lineage`, and `proof-unavailable`, plus an actionable message; retain `failed` for malformed
      metadata and unexpected Git failures.
    - Remove the no-longer-relevant branch from the planner input and the identity/stdin seams from the push input;
      within this planner/transport boundary, only the proof helper consumes optional stdin plumbing.
    - Update `packages/arc-framework/src/commands/user/types.ts`, paired-push planner/pusher seams, and direct test
      callers to accept only the proof-bearing target and result contracts.
    - Update the `UserIOContext.execInput` and production `gitExecInput` TSDoc to cover the batch object and
      reachability proof, and keep alternate adapters and test doubles explicit about whether they provide the seam.

### `[ ]` **3.2 Gate the planner on containment, compaction lineage, and commit publication**

- _Goal:_ Planning returns the captured canonical tip only when ancestry, compaction lineage, and live-head
  publication all succeed, without mutating canonical refs on any path.

    - Build `test-first` (one behavior at a time):
        - Capture the local canonical tip once through a strict reader that distinguishes verified ref absence from
          malformed object IDs and unexpected Git failures; reserve `no-local-notes` for verified absence, and keep
          malformed or failed reads in `failed`. Fetch the remote notes ref into a caller-unique temporary ref and
          use the fetched ref's observed tip as the remote snapshot; clean that temporary ref best-effort before
          every return.
        - Read remote-ref membership strictly: distinguish a genuinely absent notes ref from unavailable, malformed,
          duplicate, or mismatched `ls-remote` output rather than treating an invalid object ID as absence.
        - Accept an absent remote ref or a remote ancestor; classify ordinary graph divergence without merging.
        - Treat only `merge-base --is-ancestor` exit status `1` as ordinary non-ancestry; missing objects and other
          command failures remain `failed` rather than masquerading as graph divergence.
        - Read compaction metadata through a strict optional-tree-entry seam that distinguishes a successfully absent
          manifest from an unreadable tree or blob. Compare normalized complete manifests before divergence routing;
          any newer, older, or incompatible snapshot lineage refuses before adoption or merge, while malformed or
          unreadable manifests fail.
        - Derive the local-exclusive publication set and require the live-head proof from Phases 1–2.
        - Treat an existing deletion-bearing empty tree as publishable history rather than absent local notes.
        - Return the same immutable target without publication scanning only when the remote snapshot already equals
          the captured local tip; every target that could transfer new history must complete all three checks.
        - Verify planning never calls `git notes add`, `git notes merge`, `adoptCompactedNotesRef`, `commit-tree`, or
          canonical `update-ref`, and that cleanup failure never masks its primary result.
        - Cover verified local-ref absence, valid SHA-1 and SHA-256 tips, malformed output, and injected command
          failure so the tolerant `readRefTip` behavior cannot erase a planner trust-boundary error.
    - Rework the real-Git planner coverage in
      `packages/arc-framework/__tests__/integration/branch-bounded-notes-export.test.ts` around exact canonical
      publication instead of reconstructed subset trees.

### `[ ]` **3.3 Push the immutable canonical tip and retire reconstruction and adoption**

- _Goal:_ Successful non-force transport publishes exactly the proven object ID and creates no local notes event or
  post-push canonical reconciliation.

    - Push `<captured-tip>:<destination-ref>` normally; return `noop` when the remote already matches and preserve
      non-fast-forward rejection when the remote advances after planning.
    - Keep the target pinned when a sibling save advances the local canonical ref after planning.
    - Delete the union builder, adoption routine, temporary export target cleanup contract, and their obsolete
      tests; remove paired-push cleanup plumbing that exists only for temporary export refs from
      `packages/arc-framework/src/commands/user/paired-push.ts`, its command types, and the sync adapter.
    - Migrate direct planner/pusher coverage in `user-notes-compaction.test.ts`,
      `notes-export-state-coherence.test.ts`, `user-notes-interleaving.test.ts`, and sync-orchestrator mocks so no
      released test seam still constructs a reconstructed target or invokes caller-owned cleanup.
    - Retain `BRANCH_BOUNDED_NOTES_JOIN_MESSAGE` and released-history recognition as read compatibility, without
      creating new join commits.
    - Build `test-first` (one behavior at a time):
        - Push and no-op paths leave the local canonical ref at its current tip and add no notes commit.
        - A local post-plan save remains local and cannot widen the pushed target.
        - A remote post-plan advance rejects the push without force, reconstruction, or cleanup masking the error.

## **Phase 4:** Non-Force Publication Orchestration

_Purpose:_ Put every paired and standalone non-force notes publication behind the shared proof while preserving
ordinary same-lineage reconciliation and existing partial-publication recovery.

### `[ ]` **4.1 Preflight local-ahead standalone notes publication**

- _Goal:_ `arc user push` cannot bypass a paired-push refusal, while its explicit `--force` escape hatch remains
  unchanged and visibly separate from routine publication.

    - Route the non-force path in `packages/arc-framework/src/commands/user/push-fetch.ts` through the shared planner
      and proof-bearing push helper, including local-ahead and absent-remote topologies.
    - Expand `UserPushResult` and `NotesPushOutcome` with a structured refused result carrying the planner reason and
      message. Let `reconcileNotesPush` route only `history-diverged` into the ordinary merge; propagate every other
      refusal without transport or mutation.
    - Preserve `no-local-notes` as a non-transport planning miss. It must not clear a partial-push marker or be
      confused with an existing deletion-bearing notes ref.
    - Preserve the existing remote-equals-local no-op and clear the partial-push marker only after `pushed`, `noop`, or
      successfully reconciled publication; refusal and failure leave any existing marker intact.
    - Keep `force: true` on the direct explicit override path; automatic and guided recovery never set it.
    - Build `test-first` across `packages/arc-framework/__tests__/unit/push-fetch.test.ts` and
      `packages/arc-framework/__tests__/integration/user.test.ts`: safe tips push, unsafe tips refuse without
      transport, missing stdin plumbing refuses, a persisted partial-push marker grants no bypass, and explicit
      force remains a planner-free direct push.

### `[ ]` **4.2 Merge ordinary divergence, recapture, and re-prove before publication**

- _Goal:_ Same-lineage graph divergence retains the existing lossless merge convenience, but the merged canonical
  tip reaches the remote only after a fresh containment proof.

    - Keep the notes lock around fetch, ordinary `git notes merge`, manifest validation, and rollback decisions in
      `reconcileNotesPush`; release it before remote publication.
    - After the initial planner reports ordinary history divergence, fetch a fresh remote snapshot under the lock and
      revalidate complete compaction lineage before merge so a remote race cannot cross a snapshot boundary.
    - After a clean ordinary merge and content validation, release the lock, recapture the resulting canonical tip
      through the shared planner, and use its proof-bearing push helper instead of calling a direct full-ref push.
    - Preserve the validated local history merge when later publication refuses; leave the remote unchanged and
      report the proof failure accurately.
    - Extend every exhaustive `NotesPushOutcome` consumer in `handlers/push-recovery.ts`, `handlers/user.ts`, and
      `handlers/sync.ts` so standalone and sync callers render refusal without converting it to conflict or failure.
    - Build `test-first` in `packages/arc-framework/__tests__/unit/notes-reconcile-push.test.ts` and real-Git
      integration coverage for merge-before-proof, merged-tip publication, post-merge refusal, remote movement before
      the locked fetch, rollback, and lock/temp-ref cleanup.

### `[ ]` **4.3 Refuse incompatible compaction lineage before canonical mutation**

- _Goal:_ Cross-snapshot histories remain intact for explicit operator repair and never enter compaction adoption,
  ordinary merge, or fresh note authorship automatically.

    - Replace `adoptFetchedCompactionIfNewer` routing with manifest validation and a sticky compaction-lineage
      refusal before `adoptCompactedNotesRef` or `git notes merge` can run.
    - Preserve both canonical refs, disk state, the local partial-push marker, and inspection guidance; do not offer
      a claimed lossless automatic repair.
    - Remove automatic adoption imports and calls from the standalone path while retaining the compaction command's
      separate equal-tip, lease-guarded publisher.
    - Build `test-first` across `user-notes-compaction.test.ts`, `user-notes-interleaving.test.ts`, and reconcile
      coverage for remote-newer, local-newer, one-sided manifests, same-generation field mismatch, malformed or
      unreadable manifests, and ordinary same-lineage ancestry.

### `[ ]` **4.4 Preserve paired-push results, markers, and refusal taxonomy**

- _Goal:_ A refused notes leg remains an observable partial publication: the worktree stays published, the local
  recovery marker persists, and no remote notes intent or unsafe target is emitted.

    - Update `packages/arc-framework/src/commands/user/paired-push.ts` to consume structured planner refusals and
      remove obsolete temporary-target cleanup while retaining worktree-first ordering and worst-outcome exit code.
    - Carry the refusal reason through `PairedPushNotesPusherResult` and every exhaustive renderer so the plan's
      safety classification is not flattened into a generic conflict or transport failure.
    - Map refusal classes to actionable messages: publish unpublished commits, run preflighted `arc user push` for
      ordinary divergence, or restore proof visibility. For compaction lineage, name the two operator choices at a
      high level — accept the remote snapshot, or verify materialized disk and establish a fresh authoritative save
      after manual canonical-ref repair — without prescribing destructive ref-movement commands.
    - Keep partial-push marker recording for every refused/failed notes leg and suppress remote intent publication
      when no proof-bearing target exists.
    - Build `test-first` across `packages/arc-framework/__tests__/unit/paired-push.test.ts`,
      `packages/arc-framework/__tests__/unit/sync-orchestrator.test.ts`, and focused integration cases:
        - Planning refusal preserves successful worktree output and returns notes `refused` with a non-zero result.
        - Marker write failure is reported without hiding the primary refusal.
        - A planning refusal never invokes the notes pusher or automatic transport retry; later standalone recovery
          recomputes the proof, while transient retries after a successful plan reuse only its immutable safe target.
        - Messages never recommend sorting, force-pushing, or blind retry.
        - A real resurrection induction in `notes-export-state-coherence.test.ts` reaches the formerly reconstructed
          topology, defers canonical publication, and proves a later load does not restore the tombstoned inbox entry.

## **Phase 5:** Status, Compatibility, and Operating Guidance

_Purpose:_ Make every user-facing projection describe proof-gated publication accurately while retaining read
compatibility for histories emitted by released versions.

### `[ ]` **5.1 Align status and sync guidance with explicit reconciliation**

- _Goal:_ Session-init, verbose status, terse status, and sync guidance agree on which topologies need explicit
  preflighted reconciliation and which local-ahead residue may publish after proof.

    - Update `packages/arc-framework/src/commands/user/sync-status.ts` and handler projections without adding a
      sixth spine state or a new content-relation value.
    - Rename the `UserStatusHeadline` literal `notes diverged (reconciling)` to
      `notes diverged (reconciliation required)` across its type, summaries, terse and verbose renderers, and
      exhaustive switches.
    - Render `local-subset`, `equal`, and `mixed-uncontested` as non-conflicting but reconciliation-required; paired
      push defers, and the explicit `arc user push` path may still refuse unsafe publication or compaction lineage.
    - Replace `notes diverged (reconciling)` and every next-paired-push self-heal promise with explicit
      reconciliation language.
    - Keep `remote-subset` as local-ahead publication residue, conditioned on the canonical publication proof, and
      keep its no-pull/non-conflict action routing and genuine `conflicting` guidance unchanged.
    - Keep status read-only: do not run the live-head proof or label residue intrinsically safe. Say that
      `arc user push` can preflight publication now or a later paired push can attempt proof-gated publication.
    - Update the direct guidance in `packages/arc-framework/src/handlers/user-sync.ts` alongside the shared status
      renderers.
    - Build `test-first` across `packages/arc-framework/__tests__/unit/user-status.test.ts`,
      `packages/arc-framework/__tests__/unit/sync.test.ts`, and
      `packages/arc-framework/__tests__/integration/notes-export-state-coherence.test.ts` so session-init, full and
      terse status, sync decisions, and handler messages project each content relation consistently.

### `[ ]` **5.2 Preserve legacy join recognition without emitting new join history**

- _Goal:_ Histories created by released branch-bounded exporters remain classifiable even though current publication
  no longer creates or adopts join commits.

    - Keep `BRANCH_BOUNDED_NOTES_JOIN_MESSAGE` and `isBranchBoundedExportResidue` on the read path while removing
      write-side union/adoption exports and tests.
    - Add focused regression coverage in `notes-export-state-coherence.test.ts` proving a well-formed legacy join is
      still recognized as `remote-subset`, while malformed signatures and later uncontested or contested histories
      fall through to the normal content classifier.
    - Verify new paired and standalone publication integration cases inspect notes-ref history and mint no commit
      carrying the legacy subject.

### `[ ]` **5.3 Update the shared user-notes mutation and recovery guidance**

- _Goal:_ Maintainers can reason about every remaining notes mutator, proof/refusal path, and accepted availability
  residual without relying on retired reconstruction behavior.

    - Update `.arc/reference/strategies/project/strategy-user-notes-concurrency.md` to replace CAS-guarded
      branch-bounded adoption with the lock-free, read-only proof plus pinned canonical push.
    - Remove branch-export temp refs and adoption from the shared-state and CAS inventories; document the planner's
      caller-unique fetched notes ref, strict cleanup ownership, and exact-tip transport in the current mutator set.
    - Describe ordinary standalone merge, compaction-lineage refusal, force override, marker persistence, and
      manual-repair-only residuals as current behavior.
    - Document the compaction-lineage boundary as an explicit operator decision between the remote snapshot and a
      verified disk-backed fresh authoritative save after manual canonical-ref repair; do not present destructive
      ref movement as an automated, lossless, or rollback-safe procedure.
    - Record durable operational caveats without expanding the interim Git-notes model: compact with machines synced,
      and expect notes for abandoned unpublished commits to block routine publication until made reachable or
      explicitly overridden. Keep the one-time frozen-annotation release check in this work unit's verification
      criteria rather than turning it into permanent strategy guidance.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` The resurrection induction reaches a formerly unsafe topology, paired notes publication defers, and a later
  load does not restore the tombstoned inbox entry.
- `[ ]` Current, historical, deletion-bearing, root/snapshot, merge-parent, and cross-object rename paths all enter
  the local-exclusive publication set when applicable.
- `[ ]` Fanout-only exact renames and deletions do not create false publication entries; malformed history and Git
  read failures never become optimistic empty success.
- `[ ]` An existing canonical ref with an empty current tree is distinguished from an absent ref and can publish its
  exact deletion-bearing tip once safe.
- `[ ]` Live remote membership, locally readable tip filtering, and one union reachability walk prove publication
  without branch fetches or stale remote-tracking authority; shallow-history truncation cannot become an
  unpublished-history verdict.
- `[ ]` Local canonical-tip planning distinguishes verified ref absence from malformed output and Git failure, and
  the optional stdin adapter contract is accurate at every released seam.
- `[ ]` The planner is side-effect-free, cleans only its caller-unique temporary ref, and returns a target only after
  ancestry, compaction-lineage, and commit-publication proof.
- `[ ]` Paired and standalone non-force transport publish the exact captured canonical tip and mint no reconstructed,
  replayed, adopted, or join notes event.
- `[ ]` A local save after planning stays local, and a remote advance after planning rejects the pinned push without
  force or canonical-ref mutation.
- `[ ]` Every non-force standalone push is preflighted; ordinary same-lineage divergence merges then re-proves, while
  incompatible compaction lineage refuses before adoption or merge.
- `[ ]` Paired refusal preserves the successful worktree result, records the existing local partial-push marker,
  returns the existing mixed failure, and emits no remote notes intent marker.
- `[ ]` Refusal messages distinguish unpublished history, ordinary divergence, incompatible compaction lineage, and
  unavailable proof without recommending sorting, force-pushing, or blind retry.
- `[ ]` Session-init, verbose and terse status, and sync guidance consistently describe explicit reconciliation and
  proof-gated local-ahead residue without growing the five-state spine or content-relation vocabulary.
- `[ ]` Released branch-export join commits remain readable and classifiable, while new publication paths emit no
  join signature.
- `[ ]` The shared user-notes concurrency strategy accurately documents the remaining mutators, proof boundary,
  cleanup, force escape hatch, recovery residuals, and manual compaction-lineage repair.
- `[ ]` Before the notes-push hold is lifted, every annotation in the current frozen canonical history is confirmed
  reachable from a live remote head or is flagged for explicit operator resolution under the documented manual-
  repair-only refusal.
- `[ ]` Focused unit and real-Git integration suites pass, including the live resurrection induction and all failure
  and race cases.
- `[ ]` All quality gates pass (tests, linting, type checking, build, and Markdown linting).
- `[ ]` Ready for integration.
