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

### `[x]` **3.1 Define the proof-bearing canonical publication target and result contract**

- _Goal:_ Callers can transport notes only through an immutable target that records a successfully proven canonical
  tip, while each unsafe topology has a stable refusal class.

- _Outcome:_ The planner, paired-push seams, marker adapter, and direct callers now share an exact destination-ref
  plus captured-tip target; stable refusal reasons distinguish unsafe topology from strict read failure, and stdin
  adapter documentation names its batch-object and reachability-proof responsibilities.

### `[x]` **3.2 Gate the planner on containment, compaction lineage, and commit publication**

- _Goal:_ Planning returns the captured canonical tip only when ancestry, compaction lineage, and live-head
  publication all succeed, without mutating canonical refs on any path.

- _Outcome:_ Strict local/remote reads, caller-unique fetched snapshots, complete manifest equality, ancestry, and
  local-exclusive live-head publication now gate every transferable target. Real-Git and injected-boundary coverage
  includes deletion history, SHA-256 tips, malformed metadata, Git failures, cleanup failure, and mutation absence.

### `[x]` **3.3 Push the immutable canonical tip and retire reconstruction and adoption**

- _Goal:_ Successful non-force transport publishes exactly the proven object ID and creates no local notes event or
  post-push canonical reconciliation.

- _Outcome:_ Transport pushes only the captured object ID, no-ops exact remote equality, and leaves local notes
  untouched across sibling saves and remote races. Reconstruction, adoption, caller cleanup, and their obsolete
  seams are gone; the historical join subject remains read-only compatibility.

## **Phase 4:** Non-Force Publication Orchestration

_Purpose:_ Put every paired and standalone non-force notes publication behind the shared proof while preserving
ordinary same-lineage reconciliation and existing partial-publication recovery.

### `[x]` **4.1 Preflight local-ahead standalone notes publication**

- _Goal:_ `arc user push` cannot bypass a paired-push refusal, while its explicit `--force` escape hatch remains
  unchanged and visibly separate from routine publication.

- _Outcome:_ Routine `runUserPush` now plans and transports only a proof-bearing captured tip, returns structured
  refusal or no-local/no-remote outcomes without clearing recovery state, and routes only ordinary divergence into
  reconciliation. The explicit force path remains a direct planner-free override.

### `[x]` **4.2 Merge ordinary divergence, recapture, and re-prove before publication**

- _Goal:_ Same-lineage graph divergence retains the existing lossless merge convenience, but the merged canonical
  tip reaches the remote only after a fresh containment proof.

- _Outcome:_ Ordinary divergence now fetches and validates under the notes lock, preserves existing merge/rollback
  behavior, then releases the lock before recapturing and proving the merged canonical tip. Refusal after a valid
  merge leaves that local history intact and the remote unchanged, with structured rendering across callers.

### `[x]` **4.3 Refuse incompatible compaction lineage before canonical mutation**

- _Goal:_ Cross-snapshot histories remain intact for explicit operator repair and never enter compaction adoption,
  ordinary merge, or fresh note authorship automatically.

- _Outcome:_ Reconciliation strictly compares complete manifests and returns a sticky compaction-lineage refusal
  before merge or adoption; malformed metadata fails closed. Remote-newer, local-newer, one-sided, field-mismatched,
  raced, and equal-lineage topologies now preserve canonical refs and recovery state under real and modeled Git.

### `[x]` **4.4 Preserve paired-push results, markers, and refusal taxonomy**

- _Goal:_ A refused notes leg remains an observable partial publication: the worktree stays published, the local
  recovery marker persists, and no remote notes intent or unsafe target is emitted.

- _Outcome:_ Paired publication now preserves structured proof refusals and worktree success, records local recovery
  state without publishing unsafe remote intent, and renders reason-specific operator guidance. Unit and real-Git
  topology coverage proves refusals never reach transport or retry, immutable planned targets survive transient
  retries, marker failures preserve the primary result, and later loads honor removal tombstones without resurrection.

## **Phase 5:** Status, Compatibility, and Operating Guidance

_Purpose:_ Make every user-facing projection describe proof-gated publication accurately while retaining read
compatibility for histories emitted by released versions.

### `[x]` **5.1 Align status and sync guidance with explicit reconciliation**

- _Goal:_ Session-init, verbose status, terse status, and sync guidance agree on which topologies need explicit
  preflighted reconciliation and which local-ahead residue may publish after proof.

- _Outcome:_ Session-init, full/terse status, and sync guidance now name zero-contested divergence as explicit
  reconciliation, direct operators to the preflighted standalone path, and state that paired push defers.
  Remote-subset topology remains non-conflicting/no-pull publication residue while every projection keeps safety
  proof conditional and preserves genuine-conflict routing.

### `[x]` **5.2 Preserve legacy join recognition without emitting new join history**

- _Goal:_ Histories created by released branch-bounded exporters remain classifiable even though current publication
  no longer creates or adopts join commits.

- _Outcome:_ Real-Git compatibility coverage preserves the exact released two-parent join signature as local-ahead
  `remote-subset` residue while rejecting malformed parent ordering and ignoring the signature after later saves.
  Later uncontested/contested divergence uses the normal content classifier, and current paired/standalone paths are
  verified not to mint the legacy subject; no write-side union or adoption surface remains.

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
