# Draft: notes-export-replay-ordering

- **Origin:** [internal] — observed during the 2026-07-13 housekeep finalization after the completed Actions-spend
  capture and nineteen routed captures reappeared on `arc user load`.
- **Purpose:** Preserve cross-WU authorship order through branch-bounded notes export so transport reconstruction
  cannot make a stale live entry newer than its deletion tombstone.

---

## Problem / Motivation

Cross-WU user files (`USER-INBOX.md`, `WORKING-MEMORY.md`, and the other identity-global projections) merge the
recent notes-ref history by entry identity. The newest note-history event mentioning an identity wins: a live
entry keeps it, while a live tombstone suppresses it. That contract assumes notes-ref change order represents
authorship order.

Branch-bounded export currently violates the assumption. When a paired push cannot publish the whole local notes
ref, `planBranchBoundedNotesExport` fetches the remote ref into a temporary ref and overlays each reachable local
note with repeated `git notes add` calls. `git notes list` supplies the overlay set in note-path order, not in the
order those note versions were last authored. Each overlay call creates a fresh notes-ref history commit, so the
arbitrary path order becomes false authorship recency.

The live induction made the reversal visible:

1. A 07:31 save on `4fb963550` correctly carried removal tombstones for the completed Actions capture and the
   nineteen housekeep removals.
2. The subsequent paired sync staged reachable notes in annotated-commit order: the current clean note, the
   tombstone-bearing note, then the older `64a020af0` note containing all twenty live entries.
3. The reconstructed stale note therefore became the newest event for those identities. A later `arc user load`
   obeyed the merge contract and resurrected the entries.

This is a producer-side ordering defect, not tombstone expiry. The seven-day filter correctly dropped thirteen
older tombstones dated June 30 through July 5 and retained the two dated July 9; it did not authorize the twenty
fresh resurrections.

## Decision

Stage reachable local notes in their **source-ref last-change order, oldest to newest**. Transport may reconstruct
notes-ref commits, but it must preserve the relative recency of the current note versions it carries.

- Resolve each selected note path's latest change event from the plan-time local canonical notes ref. The first
  occurrence found in a newest-first history walk is that current version's source rank.
- Overlay ranked entries oldest-to-newest so the source-newest version is written last and remains newest after
  reconstruction. Entries with no resolvable source event (for example, inherited only through a compaction
  snapshot) stage first in stable annotated-commit order; they cannot outrank an explicitly-authored version.
- Rank only the current `(annotated commit, blob)` pairs selected for export. A historical version no longer in the
  source tree is irrelevant, and remote-identical pairs remain skipped as today.
- Keep the existing branch-reachability filter, conflict refusal, compaction adoption, union-tree construction,
  compare-and-swap adoption, and no-op behavior unchanged.
- Ground the fix in an end-to-end regression that creates a stale live entry, a newer tombstone, and a later clean
  save; runs the real branch-bounded plan/push/join path; then builds or loads the cross-WU projection and proves
  the entry stays absent while the live tombstone wins.

The history read should be bounded by the selected current paths and avoid one Git process per note. Exact parsing
and helper placement are implementation details, but the semantic output—stable source-recency order—is part of
the contract.

## Alternatives

- **Make the consumer ignore export-staging commits.** Rejected: a different machine sees those commits as the
  only transport of newly exported notes. Skipping them would prevent legitimate remote state from entering the
  recent cross-WU window unless a second event channel were invented.
- **Timestamp every entry and tombstone in the manifest schema.** Rejected for this fix: it would make recency
  explicit, but expands the notes-specific data model and migration surface when notes are an interim bridge to
  the materialized git backing store. The existing event-order contract is sufficient once the producer preserves
  it.
- **Collapse the export into one snapshot commit.** Rejected: same-event entries and tombstones would need a new
  within-snapshot precedence rule, and per-commit note history used by WU-specific loading would be flattened.
- **Tie-break same-second staging in favor of tombstones.** Rejected as accidental: staging can cross a second,
  and a legitimate later re-add must still beat an older tombstone.

## Boundaries and Forward Compatibility

- No change to the seven-day tombstone TTL, the ten-note recent window, tombstone rendering, or merge precedence.
- No general notes-history compaction, user-sync module decomposition, or backing-store migration.
- No workflow or operator workaround; save/sync/load must remain safe in their existing order.
- No new config or storage axis. The correction stays inside the notes transport adapter and disappears cleanly
  when user state moves to the materialized git backing store.

## Success Signal

After a removal is saved, any branch-bounded paired sync followed by `arc user load` leaves the removed cross-WU
entry absent, including when an older exported note still contains it. Existing export subset, conflict, compaction,
CAS, and repeated-push tests remain green.

## Readiness

- **State:** formalization-ready
- **Resolved:** failure mechanism, source-of-truth ordering, fallback order, scope boundary, and end-to-end proof.
- **Open:** exact helper/API shape and test fixture construction; both are implementation details.
- **Next:** formalize the decision as a brief spec, preserving `Light` class and P1 priority.
