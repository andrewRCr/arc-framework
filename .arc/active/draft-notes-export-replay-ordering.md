# Draft: notes-export-replay-ordering

- **Origin:** [internal] — observed during the 2026-07-13 housekeep finalization after the completed Actions-spend
  capture and nineteen routed captures reappeared on `arc user load`.
- **Purpose:** Prevent branch-bounded notes export from fabricating user-state history, while retaining safe
  portability paths until user state moves to the materialized backing-store substrate.

---

## Problem / Motivation

Cross-WU user files (`USER-INBOX.md`, `WORKING-MEMORY.md`, and other identity-global projections) consume notes-ref
history, not only the current notes tree. They traverse authorship events newest-first, admit only a seven-day and
ten-event window, and let the newest eligible event mentioning an identity win. Compaction snapshots are history
boundaries, not authorship events.

Branch-bounded export currently reconstructs a temporary notes ref by starting from the fetched remote tree and
issuing `git notes add` for each reachable current local note. That reconstruction invents new authorship events:

- `git notes list` order becomes false recency;
- copied notes receive fresh commit times and can re-enter or displace the eligibility window; and
- local copies become descendants of remote history regardless of the histories' actual causal relationship.

The live failure staged a correctly saved tombstone before an older note that still contained twenty live inbox
entries. The older state became the newest event and resurrected the entries at the next load. Tombstone expiry
itself behaved correctly: thirteen old tombstones naturally expired and two live tombstones remained. The export
producer corrupted the history against which those rules ran.

An initial repair design attempted to filter and rewrite the local notes DAG. Adversarial review exposed that a
correct rewrite also requires source-event identity, projection deduplication, local-adoption topology, and
compaction-restore provenance. That is an event-store implementation inside Git notes, not a keep-the-lights-on
repair. Git notes remains necessary in the interim, but the release-gate storage verdict explicitly limits new
notes-specific machinery because the materialized backing store will retire this transport.

## Design Goals

- Never publish or adopt a branch-bounded notes target that fabricates, refreshes, duplicates, or reorders
  authorship history.
- Preserve transparent paired sync when the canonical notes ref itself is proven safe to push unchanged.
- Broaden that safe path to include notes attached to commits already published on any live remote branch, without
  reconstructing notes history.
- When safety cannot be proven, complete the worktree push and expose a durable, retryable notes deferral through
  existing partial-publish machinery.
- Add no notes schema, history-rewrite engine, marker type, reconciliation arm, or backing-store-incompatible axis.

## Chosen Direction: Push Canonical History or Defer

Branch-bounded export will stop constructing temporary notes histories. It may push the captured canonical notes
tip unchanged when every annotated commit referenced by the history being published is proven safe for remote
publication and the local notes history already contains the remote notes tip. Otherwise it refuses the notes leg
before mutating either canonical ref.

### 1. Capture and inspect without canonical mutation

Capture the local canonical notes tip before reading its tree. Fetch the remote notes ref into the existing
caller-unique temporary ref and inspect local/remote ancestry and compaction generations against those pinned tips.
The planning phase may create and clean temporary fetch refs, but it must not:

- call `git notes add` to construct a target;
- adopt a remote compaction snapshot into the local canonical ref;
- create a union or join commit; or
- update the local or remote canonical notes ref.

A concurrent local save after capture remains outside the plan. The push still names the captured object ID, so a
later local advance is not included accidentally.

### 2. Prove the canonical tip publication-safe

The direct canonical-ref path is safe only when all of these facts hold:

1. the local notes ref contains the fetched remote notes tip, or no remote notes ref exists;
2. the remote compaction generation is not newer than the local generation; and
3. every annotated commit referenced anywhere in the local-exclusive notes history being published is reachable
   from at least one live remote branch tip after the worktree leg succeeds.

The history input is every notes commit reachable from the captured local tip but not the remote tip, or the full
reachable history when no remote exists. Collect annotated-commit paths from each published tree change and from
any compaction snapshot tree; checking only the current notes tree is insufficient because an older, now-removed
note and its blob remain in canonical history. The compaction manifest path is metadata, not an annotated commit.

The publication proof then uses live `origin` head membership and commit ancestry, not stale remote-tracking
membership. The just-pushed branch and locally available sibling-branch objects cover the common multi-worktree
case. If a live head's object is unavailable locally, the planner may ignore that candidate and continue proving
against the others; it does not fetch or materialize additional branch history solely to make the proof pass. An
unavailable remote or incomplete object graph therefore degrades to deferral, never optimistic publication.

This broadens the former fast path without weakening its privacy boundary. A sibling note may ride once its
annotated commit is already public on some live remote branch; a note for an unpushed sibling branch cannot.
Because the exact canonical tip is pushed, its original authorship order, timestamps, count eligibility, and
compaction history remain intact.

### 3. Defer every reconstruction case

Refuse the notes leg when any local annotated commit lacks the publication proof, the remote notes history is not
contained locally, or the remote carries a newer compaction generation. These are cases where the current
implementation would overlay current state, adopt-and-restore notes, or construct a local union.

The refusal occurs before any canonical notes mutation. The planner cleans its temporary ref best-effort and
returns a structured message naming the failed safety condition. It does not suggest that sorting, retrying the
same unsafe topology, or force-pushing will repair the condition.

### 4. Reuse the existing partial-publish contract

Paired push already publishes the worktree first. A containment refusal therefore keeps the successful worktree
outcome, reports the notes leg as refused, records the existing partial-push marker, and returns the existing mixed
outcome. Session-init and status continue to surface that marker; no new degraded-state channel is needed.

The message distinguishes two useful recovery paths:

- retry paired sync after the remaining annotated commits have been published on live remote branches and local
  notes history contains the remote tip; or
- use the existing explicit notes reconciliation path when remote history or compaction must first be reconciled.

The second path may still invoke existing notes merge/compaction behavior. This WU does not expand that behavior or
claim that every divergence can auto-resolve. An unresolved marker is an honest interim limitation, not grounds to
reconstruct history.

## Why This Is the Right Interim Boundary

- **History correctness:** a pushed notes event is always an existing event; export never mints a replacement.
- **Branch privacy:** every annotated commit referenced by newly published notes history is proven present on a
  live remote branch before its note or historical blob can publish.
- **Multi-worktree usability:** once sibling branches are published, a later paired push can flush the exact
  identity-wide notes history even though no single branch contains every annotated commit.
- **Concurrency:** the pushed target remains one captured immutable tip; later local saves cannot ride or be
  clobbered.
- **Compaction:** newer remote compaction causes deferral instead of re-authoring restored local-only notes.
- **Forward compatibility:** publication proofs and version/ancestry refusals carry into the backing-store model;
  Git commit rewriting does not.

## Verification Design

Use real temporary Git repositories for the history-sensitive cases:

1. **Resurrection induction:** create an older live inbox entry and newer tombstone, enter a topology that formerly
   reconstructed history, run paired push and `arc user load`, and prove the notes leg defers without resurrecting
   the entry.
2. **No-mutation refusal:** for unpublished sibling notes, divergent remote notes, and newer remote compaction,
   prove local and remote canonical tips and histories are byte-for-byte unchanged after planning.
3. **Existing safe path:** with all local notes reachable from the just-pushed branch and local containing remote,
   prove the captured canonical tip is pushed directly with no extra event.
4. **Published sibling flush:** publish sibling branches independently, then prove a later paired push recognizes
   every annotated commit in the local-exclusive notes history on live remote heads and pushes the canonical tip
   unchanged.
5. **Unpublished sibling containment:** keep one sibling branch local-only and prove its note prevents the canonical
   push, even when the current branch push succeeds.
6. **Historical containment:** remove the current note for an unpublished sibling commit and prove its older
   history still prevents publication; include a compaction snapshot carrying an unpublished annotated path.
7. **Live-membership and object degradation:** use deleted remote heads, unreachable `origin`, and a live head whose
   object is absent locally; each must fail closed without fetching branch history or mutating notes.
8. **Pinned-tip concurrency:** advance the local notes ref after planning and prove the push names only the captured
   tip while the later save remains local.
9. **Operational recovery:** prove refusal records the existing partial-push marker, renders the established status
   surface, and clears through an eventual safe canonical push.

Focused unit tests may cover the publication-proof classifier and message mapping. Integration tests own Git
topology, timestamps, canonical-ref immutability, and paired-push behavior.

## Alternatives

- **Sort and replay current notes.** Rejected: sorting repairs one relative-order symptom but refreshes old events,
  changes the count window, loses compaction meaning, and falsely places local state over remote history.
- **Rewrite a filtered local DAG.** Rejected: even metadata-preserving commits duplicate events when reconciled
  into the canonical local history, while newer-compaction adoption re-authors restored local-only notes before the
  filter runs. Correctness requires durable source-event identity and deduplication—the future event store.
- **Teach the reader about source timestamps or replay metadata.** Rejected: adds a second event model and migration
  burden to the retiring transport.
- **Always refuse when any note lies outside the just-pushed branch.** Safe but needlessly sticky after sibling
  branches are already public. Live-remote reachability proves the actual publication boundary without rewriting
  history.
- **Immediately migrate user state to the backing store.** Strategically correct but not an appropriate detour:
  Local mode still has broader materialization, versioning, setup, and recovery design to settle.

## Durable Decision and Downstream Coordination

- Amend ADR-012 append-only with the production learning: Git notes remains the interim portability mechanism, but
  keep-the-lights-on work may preserve existing history or fail closed; it must not deepen notes-specific event
  infrastructure.
- The existing `draft-local-mode.md` inbound item, “Retire git notes into the backing-store abstraction,” is the
  authoritative downstream migration capture. It already covers ordinary materialized user-state records, one-time
  import, retirement of notes/sync refs, and preservation of the versioned failure model.
- `draft-arc-backend.md` inherits the same storage abstraction from Local mode and already defines
  append-plus-tombstone event semantics for user state. A duplicate inbound capture there would create two homes
  for one migration, so this WU adds none.
- The eventual backing-store ADR will supersede ADR-012's Git-notes mechanism when that substrate is accepted and
  ready to implement. This WU does not pre-accept that still-forming design.

## Boundaries

- No change to tombstone TTL, ten-event window, projection precedence, or compaction policy.
- No new notes event schema, source-ID field, replay marker, reconciliation mode, config key, or operator workflow.
- No automatic remote-history merge or compaction redesign.
- No retroactive rewrite of already-corrupted notes history. A later authoritative save/removal establishes fresh
  state; the identity affected during diagnosis was repaired before this WU began.
- No local-mode or backend implementation.

## Classification and Cohort Fit

- **Class:** `Heavy` — the realized design work crossed the Heavy derivation floor before the stop-loss pivot. The
  implementation is intentionally smaller, but the history, concurrency, and migration boundary still require a
  detailed correctness record. The design composes existing primitives and is not `Novel`.
- **Cohort:** stays one work unit. Safety classification, paired-push containment, status recovery, and the
  regression suite are one independently deliverable correctness boundary.
- **Next spec form:** `detailed` · `RFC`, recording both the containment mechanism and why faithful replay is
  explicitly rejected.

## Readiness

- **State:** formalization-ready
- **Resolved:** safe canonical publication proof, fail-closed cases, mutation boundary, paired-push/status behavior,
  verification, ADR treatment, downstream ownership, and backing-store stop-loss.
- **Open:** helper placement and exact refusal wording; both are implementation details constrained above.
- **Next:** formalize the design as a detailed RFC after draft review.
