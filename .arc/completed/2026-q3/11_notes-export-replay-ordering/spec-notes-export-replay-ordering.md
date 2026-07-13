# Spec (`detailed` · `RFC`): Notes Export History Containment

- **Origin:** [internal] — a branch-bounded paired push re-authored stale user-directory state after housekeep and
  made it newer than the tombstone that removed it.

- **Purpose:** Replace branch-bounded notes-history reconstruction with a conservative canonical-history
  publication proof, so routine notes publication either preserves authorship semantics exactly or defers through
  the existing recovery contracts.

---

## Introduction / Context

ARC stores portable per-user state in `refs/notes/arc/user/{identity}`. Cross-WU projections do not read only the
current notes tree: `readRecentUserNotes` traverses notes-ref authorship events newest-first, admits a seven-day and
ten-event window, and lets the newest eligible event mentioning an identity win. Compaction snapshots are excluded
from authorship, but their trees and manifests still bound the history.

`planBranchBoundedNotesExport` currently fetches the remote notes ref into a temporary ref, overlays current local
notes whose annotated commits are reachable from the just-pushed branch, and pushes the reconstructed ref. Each
`git notes add` overlay creates a new notes commit. The resulting tree can be correct while its event history is
false: old state receives a fresh timestamp, path order becomes recency, and local copies become descendants of
unrelated remote events. The observed failure made an older live inbox snapshot newer than its tombstone and
resurrected twenty routed entries.

A faithful subset exporter would need source-event identity, filtered-history topology, projection deduplication,
local-adoption semantics, and compaction-restore provenance. That is the future backing-store event model rebuilt
inside an interim transport. ADR-012 now records the stop-loss: Git notes remains operational, but keep-the-lights-on
work preserves existing history or fails closed rather than deepening notes-specific event infrastructure.

## Goals

- Publish no notes event with fabricated authorship time, order, identity, or ancestry.
- Preserve transparent paired sync whenever the exact captured canonical notes tip is safe to publish.
- Let already-published sibling branches satisfy the safety proof, so a later paired push can flush identity-wide
  notes without requiring one branch to contain every annotated commit.
- Prevent any routine non-force publication from carrying a current or historical note for an unpublished commit.
- Leave a successful worktree push intact and expose notes deferral through the existing partial-push marker,
  status surface, and retry contract.
- Keep every routine and guided non-force notes retry behind the same publication proof, so a standalone retry
  cannot bypass a paired-push refusal.
- Keep the change removable with Git notes and forward-compatible with version-checked backing-store writes.

## Non-Goals

- Reconstruct, filter, reorder, timestamp, or otherwise rewrite a subset of notes history.
- Add source-event metadata, replay markers, reconciliation states, config keys, or storage axes.
- Redesign `readRecentUserNotes`, tombstone TTL, the ten-event window, projection precedence, or compaction policy.
- Redesign the existing ordinary graph-divergence merge or add an automated recovery for histories across an
  incompatible compaction boundary.
- Migrate user state to Local mode or the ARC backend in this work unit.
- Rewrite already-corrupted notes history. A later authoritative save or removal establishes fresh state.

## Proposed Design

### 1. Replace reconstruction with a three-part publication proof

A shared canonical-publication planner captures the local canonical notes tip, fetches the remote notes ref into a
caller-unique temporary ref, and produces a push target only when all three conditions hold. Both
`planBranchBoundedNotesExport` and the non-force `arc user push` path use this boundary:

1. **History containment:** no remote ref exists, or the fetched remote tip is an ancestor of the captured local
   tip.
2. **Compaction lineage:** no remote ref exists, or the local and fetched remote refs carry the same compaction
   manifest (both absent, or equal generation, boundary tip, and cumulative pruned set).
3. **Commit publication:** every annotated commit referenced by the local-exclusive notes history is reachable
   from at least one live `origin` branch head.

Read and validate compaction manifests before routing a history-divergence refusal. Any lineage mismatch—remote
newer, local newer, or incompatible snapshots at the same generation—receives the compaction-boundary outcome and
must never fall through to the ordinary standalone merge path; malformed manifest state is `failed`, not generic
divergence. A missing remote ref is exempt because no history must be reconciled.

The planned target is always the captured canonical tip and the real destination ref. There is no temporary export
target. The planner returns a structured refusal when a safety condition is false or cannot be proven, and a failed
result for malformed notes metadata or Git plumbing failure. Both outcomes leave canonical refs unchanged. The
ordinary standalone divergence path may first create its existing history-preserving notes merge, then must plan
and publish the resulting canonical tip through this same proof.

`no-local-notes` applies only when the canonical notes ref is absent. An existing notes ref whose current tree has
no annotated entries still carries history and may represent a deletion that must reach the remote; it runs the
same proof and can publish its exact tip. Remove the current-tree `empty-export`/early-skip behavior rather than
silently leaving the remote at an older nonempty tree.

The planner itself performs no canonical mutation. In particular, it never calls `git notes add`,
`adoptCompactedNotesRef`, union-tree construction, `commit-tree`, or `update-ref` while deriving a publication
target. The fetched temporary ref is deleted best-effort inside the planner before every return.

Incompatible compaction lineage is a hard boundary for automatic reconciliation. Change the standalone reconcile
path to refuse before `adoptCompactedNotesRef` can restore local-only entries with fresh `git notes add` commits or
an ordinary notes merge can join histories across snapshot roots. Because a compaction snapshot starts a new root
history, the topology stays deferred for explicit inspection and manual repair. This WU does not invent a
notes-specific projection or re-authorship mechanism to automate that rare case.

### 2. Derive the complete local-exclusive publication set

Commit-publication proof covers history newly introduced to the remote, not merely the captured tip's current tree:

- With a remote ancestor, inspect notes commits reachable from the captured local tip but not the remote tip.
- With no remote notes ref, inspect the captured local tip's complete reachable notes history.
- Collect added, modified, and exact-rename records across that range using one batched, root-aware history read
  with merge-parent diffs. Parse status-bearing rename pairs: ignore an `R100` only when source and destination both
  normalize through `notePathToCommit` to the same annotated object ID (Git's automatic fanout restructure). When
  they normalize to different IDs, include the destination in the publication set; a same-blob move from a published
  commit's note path to an unpublished commit's path is a publication event, not fanout. Deletions remain excluded.
  Root/snapshot trees expose every entry they publish.
- Normalize fanout paths through `notePathToCommit`. Ignore the recognized compaction-manifest path as metadata;
  treat any other path that cannot normalize to an object ID as malformed history and fail closed.
- Deduplicate the resulting annotated commit IDs before the reachability proof.

Checking only `git notes list` is forbidden. A note removed from the current tree still leaves its earlier blob and
annotated-commit path in canonical history; it must block publication until that commit is public. A root compaction
snapshot similarly contributes every retained annotated path even though the reader excludes the snapshot from its
authorship window.

The range reader belongs with the existing notes-history readers in `notes-ref.ts`. It accepts pinned tips and emits
annotated commit IDs; it does not interpret user-directory payloads or modify refs.

### 3. Prove publication against live remote heads without fetching branches

Expose the existing bounded `ls-remote --heads` membership read in `remote-ref-reader.ts` as a generic typed helper
returning reachability plus branch-tip object IDs. Existing in-flight consumers reuse that helper; the notes adapter
does not duplicate remote-membership parsing.

The proof uses only live head tips whose commit objects already exist locally:

1. Batch-check the returned tip IDs through `git cat-file --batch-check` and retain locally readable commit tips.
2. Walk the union of those tips once with `git rev-list --stdin`.
3. Require every annotated commit from the publication set to occur in that reachable-object set.

The just-pushed branch is locally available, and sibling worktrees normally make their branch objects available too.
The planner does not fetch or materialize another branch solely to make notes publication pass. An unreachable head
query, absent local head objects, an unreadable annotated commit, or an incomplete reachability set yields a
safety-proof refusal. A different locally available live head may still prove the commit.

This tests the real privacy boundary: whether the commit is already public anywhere in the repository. It is stricter
than current-tree reachability because it covers historical blobs, and less sticky than requiring every note to lie
on the one branch whose push just completed.

### 4. Push only a proof-bearing immutable canonical target

Simplify `BranchBoundedNotesExportTarget` to the destination notes ref and captured tip required by the push and
marker publishers. Remove reconstruction/adoption fields (`annotatedCommits`, `omittedCommits`, `supersedesLocal`,
`localIncludesRemote`, and `priorLocalTip`) because no post-push local reconciliation remains.

`pushBranchBoundedNotesExport` keeps its pinned-object behavior:

- remote already equals the captured tip → `noop`;
- otherwise push `<captured-tip>:<destination-ref>` normally;
- a remote advance between plan and push is rejected by Git and follows the existing failed/retry outcome; and
- a local save after planning advances the local canonical ref but cannot change the object ID being pushed.

Refactor the standalone non-force orchestration so no direct full-ref push can bypass the planner:

- local-ahead canonical history passes the shared proof before transport;
- ordinary graph divergence may run the existing notes merge and manifest validation under the notes lock, then
  recaptures and proves the merged canonical tip before republishing it;
- incompatible compaction lineage refuses before adoption or merge; and
- `arc user push --force` remains the existing explicit operator override and is not used by automatic or guided
  recovery.

The ordinary merge composes existing source histories and adds no per-note authorship event. This WU changes its
entry and exit gates, not its merge strategy. A low-level transport helper may accept only a proof-bearing planned
target (or the explicit force branch), making the containment boundary structural rather than call-site custom.

`arc user compact` remains a separate lease-guarded publisher. Its existing precondition requires local and remote
canonical tips to be equal before it pushes the old tip to a backup ref and replaces the canonical ref with a root
snapshot of already-remote entries; the reader excludes that snapshot from authorship. It therefore introduces no
previously unpublished note content and is not a bypass around the canonical-tip publication proof.

Delete the branch-export union builder, adoption routine, temporary-target cleanup contract, and their tests. Retain
`BRANCH_BOUNDED_NOTES_JOIN_MESSAGE` and `isBranchBoundedExportResidue` as read compatibility for join commits created
by released versions; this work stops emitting the commits but does not make existing histories unreadable.

Align `strategy-user-notes-concurrency.md` with the new mutator set: remove the CAS-guarded branch-bounded adoption
entry, describe the lock-free planner as a read-only proof plus pinned canonical push, and replace the accepted
“next reconcile adopts or merges” residual with safe canonical publication or explicit reconciliation. Temp-ref
guidance continues to cover the per-call fetched remote ref.

### 5. Preserve paired-push partial-publication behavior

Paired push continues to publish the worktree before planning the notes leg. A planning refusal therefore:

- preserves the successful worktree result;
- reports notes as `refused` with the failed proof named;
- records the existing local partial-push marker;
- returns the existing mixed/non-zero result; and
- does not publish the remote intent marker, because no safe notes target exists.

Refusal messages distinguish the actionable classes:

- **unpublished history:** publish the remaining annotated commits on a branch, then retry paired sync or the
  preflighted non-force `arc user push`;
- **ordinary remote graph divergence:** run `arc user push`; it merges the existing histories, reruns containment,
  and republishes only if the merged canonical tip is safe;
- **incompatible compaction lineage:** do not run automatic adoption or cross-snapshot merge. Preserve both refs,
  inspect with `arc user status --verbose`, and state that no lossless automatic repair exists. The operator must
  explicitly choose the remote snapshot or verify the materialized disk state and establish it as a fresh
  authoritative save after manual canonical-ref repair before retrying; and
- **proof unavailable:** restore remote/object visibility and retry a non-force path.

Messages must not recommend sorting, force-pushing, or repeatedly retrying an unchanged unsafe topology.

### 6. Correct status promises invalidated by removing safe-join

Content-relation classification remains useful and unchanged, but graph-diverged zero-contested refs no longer
self-heal through `adoptPushedTipIntoLocalRef`. Update `sync-status.ts` projections accordingly:

- `local-subset`, `equal`, and `mixed-uncontested` continue to avoid genuine-conflict vocabulary, but say that
  the preflighted `arc user push` path is required and paired push will defer; that path may still refuse a newer
  compaction boundary or unsafe publication set.
- Replace the current `notes diverged (reconciling)` headline with `notes diverged (reconciliation required)`;
  no read-only status or sync-guidance path claims that reconciliation is already underway.
- `remote-subset` on a local-ahead topology remains expected publication residue; guidance says a later paired push
  can publish it only after the canonical safety proof clears.
- `conflicting` retains its existing genuine-conflict guidance.
- The session-init summary, verbose cause/detail lines, `arc user status`, and sync action guidance must agree.
- Partial-push recovery may continue to recommend `arc user push` even though its persisted marker does not encode
  the original refusal reason, because every non-force retry recomputes the proof and cannot bypass it.

Do not grow the five-state sync spine or add a content-relation value. Keep legacy join-signature recognition so an
old safe-join commit is still classified using the behavior of the release that created it.

### 7. Failure and cleanup contract

The planner and every paired-push unsafe or uncertain path are side-effect-free with respect to the local and remote
canonical notes refs. Standalone ordinary-divergence reconciliation is the one deliberate exception: it may retain
its existing validated history merge locally before the shared publication proof refuses; that merge preserves both
source histories and adds no per-note authorship event, while the remote remains unchanged. Incompatible compaction
lineage refuses before local mutation. Temporary fetch refs remain caller-unique and best-effort cleaned; cleanup
failure never turns a refusal into a planned target or hides a primary error. Malformed manifests and unexpected Git
failures remain `failed`, while a well-formed but unprovable publication state is `refused`.

A compaction-lineage refusal is intentionally sticky: the partial-push marker remains until an operator resolves the
canonical topology. This is an accepted interim availability cost. The command must preserve both refs and disk and
must not automate the destructive choice between accepting the remote snapshot and establishing verified disk state
as a new authoritative save.

No read failure is converted to an empty publication set. Empty-success is valid only when the batched history read
successfully proves that the captured local tip introduces no annotated note path beyond the remote ancestor.

## Alternatives & Rationale

### Sort and replay current notes

Rejected. Sorting repairs the observed relative-order symptom but refreshes old events, changes seven-day and
ten-event eligibility, loses compaction meaning, and falsely places all replayed local state after remote history.

### Rewrite a filtered local notes DAG

Rejected. Metadata-preserving rewritten events still duplicate their source events when joined back into the local
canonical history. Newer-compaction adoption also restores local-only notes through fresh `git notes add` commits
before filtering. Correctness requires durable source-event identity and projection deduplication—the future event
store—plus substantial notes-only plumbing that will be retired.

### Teach the reader about replay metadata

Rejected. Source timestamps, source IDs, and replay markers create a second compatibility model in the consumer and
require old-history migration. The transport should not acquire the backing store's record model.

### Refuse whenever a note is outside the just-pushed branch

Rejected as unnecessarily sticky. Once sibling commits exist on any live remote head, publishing their existing
notes history leaks no unpublished code. Live-head reachability preserves the safety boundary and lets subsequent
paired pushes flush the canonical ref unchanged.

### Migrate user state immediately

Rejected for this WU. The separate backing-store substrate is the correct destination, but Local mode must also
settle materialization, version-checked record writes, setup, failure taxonomy, and recovery. The existing Local-mode
inbound capture owns that migration; this repair must remain independently shippable.

## Cross-cutting Considerations

### Security and privacy

The publication set includes historical notes blobs so removed current state cannot leak before its annotated commit
is public. Live remote membership is authoritative; stale remote-tracking refs cannot prove publication. Missing
objects and network uncertainty fail closed. No force update is introduced.

The live-head query is a point-in-time publication proof, not a transaction spanning branch and notes refs. A branch
may be deleted or force-updated after the bounded membership read and before notes publication. That accepted TOCTOU
residual does not expose a commit that was never public—the proof observed it on a live remote head—but it can leave
notes for a commit that is no longer live when the notes update lands. Git offers no cross-client lease over every
remote head, and re-publishing or pinning those heads would be a materially worse ownership violation.

### Performance

The normal proof uses one notes-range history read, one bounded remote-head query, one batch object check, and one
union reachability walk, rather than a Git process per note/head pair. Work scales with local-exclusive notes history
and the repository commit graph. No branch fetch, notes-tree replay, or commit-object rewrite occurs. The unchanged
remote-equals-local no-op may return before publication scanning because it transfers no history. Standalone
non-force pushes pay the same bounded proof cost so their retry convenience cannot bypass the trust boundary.

### Concurrency and compatibility

The local notes tip is captured once and pushed by object ID. Remote races remain non-fast-forward failures; local
races cannot ride accidentally. Released histories containing branch-export join commits remain readable. The
standalone ordinary notes merge, backup, and CAS contracts remain available. Automatic cross-lineage compaction
adoption is narrowed to refusal because its current restore mechanism fabricates authorship; ordinary ancestry-only
fast-forward pull remains.

### Testing

Use real temporary Git repositories for topology, range paths, notes fanout, snapshots, remote head membership,
paired-push outcomes, and standalone retry paths. Prove that every non-force entry reaches the publication proof,
ordinary same-lineage divergence merges before recapture/proof, and any compaction-lineage mismatch refuses before
adoption or merge. Cover both automatic fanout `R100` records and same-blob cross-object `R100` records. Pure
parser/classifier helpers receive focused unit coverage. Mock-only tests cannot establish that no canonical ref or
event history changed.

### Migration and downstream coordination

ADR-012 carries the interim stop-loss. The existing `draft-local-mode.md` inbound item “Retire git notes into the
backing-store abstraction” remains the authoritative migration capture; it covers ordinary materialized user-state
records, one-time import, and retirement of notes/sync refs. The ARC backend inherits the shared storage abstraction
and append-plus-tombstone event model, so no duplicate backend capture is created.

The design aligns with `strategy-storage-evolution.md`: it preserves version-checked mutation, adds no storage axis,
keeps notes mechanics in the transport adapter, and avoids embedding reconstructed Git history into future records.

### Project and architecture alignment

The design advances PROJECT-PRD's **Operational friction down, judgment friction up** principle: deterministic
publication safety is automated, while genuine reconciliation remains explicit. It stays within
TECHNICAL-OVERVIEW § 2 **Cross-Machine User State** and the existing `cli → commands → lib` architecture. It adds
no runtime, dependency, framework, or infrastructure component.

## Success Criteria

- The live resurrection induction reaches a reconstruction topology, paired push defers the notes leg, and a later
  `arc user load` keeps the tombstoned inbox entry absent.
- Unpublished current notes, removed historical notes, and compaction-snapshot paths each block canonical
  publication until their annotated commits are reachable from a live remote head.
- An exact rename is ignored only when both paths normalize to the same annotated commit; moving the same blob to a
  different commit path adds that destination to the proof and blocks it when unpublished.
- An existing canonical ref with an empty current notes tree is not mistaken for absent local notes; once its
  historical publication set is safe, its exact deletion-bearing tip can reach the remote.
- Published sibling branches satisfy the proof, and a subsequent paired push publishes the exact captured canonical
  notes tip without adding a notes event.
- Remote graph divergence and incompatible compaction lineage refuse before local adoption, join creation, or
  canonical-ref mutation on the paired path; the standalone path may create only its existing ordinary
  same-lineage history merge, then must pass containment before publication.
- Unreachable live-head membership, missing local head objects, malformed history output, and Git read failure never
  collapse to an optimistic empty publication set.
- A local save after planning is absent from the pushed target and remains the local canonical tip.
- A remote advance after planning rejects the pinned push without force or history reconstruction.
- Refusal preserves the successful worktree push, records the existing partial-push marker, and renders consistent
  actionable guidance in session-init, status, and sync output.
- Every non-force standalone push is preflighted. Ordinary same-lineage divergence merges source histories and
  re-proves the resulting tip; a compaction-lineage mismatch refuses before `adoptCompactedNotesRef`, any fresh
  `git notes add`, or a cross-snapshot merge.
- A partial-push marker created for unpublished history or an unavailable proof cannot turn `arc user push` into an
  unpreflighted full-ref publication, despite the marker not persisting its original reason.
- Diverged zero-contested status no longer promises next-paired-push reconciliation; local-ahead publication residue
  describes the safety-proof condition accurately; genuine conflicts retain conflict vocabulary.
- Released branch-export join commits remain recognized, while new paired pushes mint no reconstruction or join
  commit.
- `strategy-user-notes-concurrency.md` describes the remaining mutators, proof/refusal behavior, temp-ref lifetime,
  ordinary standalone merge, compaction-lineage refusal, force escape hatch, and recovery residual without
  promising branch-export adoption or union.
- Focused unit and integration suites, full TypeScript checks, lint, build, and repository test gates pass.

## Open Questions

None. Helper names and test-fixture factoring are implementation details constrained by the design above.
