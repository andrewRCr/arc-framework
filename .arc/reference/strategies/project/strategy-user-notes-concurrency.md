# User Notes Concurrency Strategy

User notes are identity-scoped shared state. Same-machine sibling worktrees, separate machines, and session-init
probes can all touch the same notes ref or its supporting state, so every mutator needs one explicit write
discipline.

Consult this strategy before adding or modifying any mutator of shared user-notes state: the canonical notes ref,
identity-global user files, `.sync-state.json`, partial-push markers, sync-state refs, temp refs, or notes locks.

## Shared State

- **Canonical notes ref:** `refs/notes/arc/user/{identity}`.
- **Identity-global disk files:** `.arc/user/{identity}/WORKING-MEMORY.md`, `USER-INBOX.md`, per-WU
  `SESSION-NOTES.md`, and the `.internal/` backup/materialization records that describe them.
- **Per-worktree sync state:** `.arc/user/{identity}/.internal/.sync-state.json`.
- **Sibling sync-state ref:** `refs/arc/user/{identity}/sync-state`, plus its per-call incoming refs.
- **Partial-push markers:** local `.sync-state.json` markers and remote sync-state-ref marker entries.
- **Temp refs:** notes reconcile refs such as `refs/notes/arc/user/{identity}__incoming`, branch-bounded export
  refs, and `refs/arc-sync-temp/*` probe refs.
- **Lock files:** the repo-shared `.notes.lock` and its stale-break coordination lock.

## Disciplines

### Lock-Serialized

Use the per-identity notes lock when a mutator performs an unguarded read-modify-write that cannot carry a native
expected-old ref check.

- **Save note write:** `runUserSave` serializes disk read, tombstone synthesis, `writeNote` / `git notes add`,
  verification, and the materialized-baseline stamp write under `.notes.lock`. Only the local `.sync-state.json`
  write happens after lock release.
- **Reconcile critical section:** `reconcileAndRepush` holds `.notes.lock` across remote-temp fetch,
  `git notes merge`, corrupt-note scan, and rollback decision. The network re-push runs after release so a held
  remote push cannot consume the bounded wait. A sibling save landing after a clean scan is itself lock-guarded
  and can safely be pushed by the re-push or by the next sync.
- **Compaction writer:** `arc user compact` takes the notes lock while building the snapshot, backup ref, prune
  manifest, local ref move, and lease-push preparation. It never union-merges across a compaction boundary.
- **Identity-global materialization:** load/save operations that read or write the shared disk baseline and the
  files it describes run under the notes lock.
- **`.sync-state.json` read-modify-write:** local sync-state writes are serialized with a version check so two
  same-worktree writers do not drop each other's markers.
- **Stale-lock breaks:** breaking `.notes.lock` is itself serialized by a secondary exclusive-create break-lock.
  The breaker re-reads the main holder while holding the break-lock and unlinks only when the stale holder record
  is unchanged.

### CAS-Guarded

Use a native expected-old ref move when the mutator can name the exact state it is replacing.

- **Corrupt-merge rollback:** rollback uses `git update-ref <ref> <preMergeTip> <postMergeTip>` or the guarded
  delete analogue for a previously absent ref. On CAS decline, the operation returns a typed conflict and never
  publishes the known-corrupt ref.
- **Branch-bounded adopt:** `pushBranchBoundedNotesExport` adopts a temp export with `update-ref <ref> <new>
  <expected-old>` only when the temp tree is a content superset of local notes.
- **Fetch/pull:** `runUserFetch` fetches remote notes into a temp ref, classifies ancestry, then moves the
  canonical notes ref with an expected-old guard. Local-ahead, diverged, and mid-fetch local advances refuse with
  typed outcomes; `runUserPull` loads disk only after a successful fetch.
- **Sibling sync-state ref writes:** sync-state marker writes use tree-commit CAS retry; cross-machine pushes
  reconcile by keyed tree union and bounded retry.

### Lock-Free By Design

Use this only when holding the notes lock would put remote I/O inside the bounded wait and a stale plan is safe.

- **Branch-bounded export plan-to-push:** paired push plans against one notes tip and pushes that exact tip to
  remote. A sibling save landing after the plan is not exported accidentally because the push is pinned to the
  planned tip. A stale-plan non-fast-forward reconciles on the next notes push.
- **Read-only status/probe reads:** status may fetch into per-call temp refs and read local refs without a lock.
  Reads must not mutate durable state; any cleanup belongs to the mutating operation that resolved the condition.
- **Remote sync-state marker publication push:** the marker write is CAS-guarded locally and the remote push has
  its own reconcile path. It deliberately precedes the notes push so a later partial push is discoverable.

## Temp Ref Rules

- Never fetch directly into a live notes ref or live sync-state ref.
- Temp refs are per-call unless the operation holds the notes lock for the entire create/use/delete span.
- Cleanup deletes only the caller's temp ref and is best-effort.
- A shared temp ref is acceptable only inside a serialized critical section whose lock also protects cleanup.

## Accepted Residuals

- **Break-lock residual:** a stale break-lock can itself be broken. That re-admits the stale-break race one level
  down, but only across the tiny read/unlink/release section. A kernel-released `flock` style primitive is the
  upgrade path if this residual ever bites.
- **Branch-bounded stale plan:** a sibling save can land between export planning and push. The pinned-tip push
  prevents accidental widening, and the next reconcile adopts or merges the sibling content.
- **Cross-machine retired-subdir trust:** a cross-machine load still accepts the shipped-on-origin oracle, backed
  by pre-load `.internal/` backups and later compaction-aware adoption. Same-machine siblings require an active
  worktree roster check.

## Review Checklist

When reviewing a user-notes mutator, ask:

- Which shared state does it write?
- Is the write lock-serialized, CAS-guarded, or explicitly lock-free by design?
- Does any temp ref have a per-call token or a lock-protected lifetime?
- Can a declined CAS, non-fast-forward push, or failed fetch leave both local and remote recoverable?
- Does status/reporting read without mutating durable recovery state?

---
