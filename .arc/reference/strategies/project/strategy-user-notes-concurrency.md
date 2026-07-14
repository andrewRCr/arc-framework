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
- **Temp refs:** caller-unique canonical-publication snapshots such as
  `refs/notes/arc/user/{identity}__publication_<token>`, locked reconcile refs such as
  `refs/notes/arc/user/{identity}__incoming_<token>`, and `refs/arc-sync-temp/*` probe refs.
- **Lock files:** the repo-shared `.notes.lock` and its stale-break coordination lock.

## Disciplines

### Lock-Serialized

Use the per-identity notes lock when a mutator performs an unguarded read-modify-write that cannot carry a native
expected-old ref check.

- **Save note write:** `runUserSave` serializes disk read, tombstone synthesis, `writeNote` / `git notes add`,
  verification, and the materialized-baseline stamp write under `.notes.lock`. Only the local `.sync-state.json`
  write happens after lock release.
- **Ordinary reconcile critical section:** `reconcileNotesPush` enters `reconcileAndRepush` only for ordinary
  same-lineage graph divergence. It holds `.notes.lock` across a fresh remote-temp fetch, strict compaction-manifest
  comparison, `git notes merge`, corrupt-note scan, and rollback decision. Incompatible compaction lineage refuses
  before merge. After lock release, the merged canonical tip is recaptured, re-proven, and only then transported;
  a sibling save cannot be widened into a previously captured target.
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
- **Fetch/pull:** `runUserFetch` fetches remote notes into a temp ref, classifies ancestry, then moves the
  canonical notes ref with an expected-old guard. Local-ahead, diverged, and mid-fetch local advances refuse with
  typed outcomes; `runUserPull` loads disk only after a successful fetch.
- **Sibling sync-state ref writes:** sync-state marker writes use tree-commit CAS retry; cross-machine pushes
  reconcile by keyed tree union and bounded retry.

### Lock-Free By Design

Use this only when holding the notes lock would put remote I/O inside the bounded wait and a stale plan is safe.

- **Proof-gated canonical publication:** the planner captures one local canonical tip, fetches the exact remote ref
  into a caller-unique snapshot, and reads without mutating either canonical ref. It returns a target only after
  history containment, exact compaction lineage, and live-remote-head publication proof all pass. Transport pushes
  the captured object ID to the canonical destination; a sibling save after planning remains local, while a remote
  advance rejects the pinned push. Every later non-force invocation recomputes the proof from current state.
- **Explicit force override:** `arc user push --force` deliberately bypasses the planner and overwrites the remote
  canonical ref from the live local ref. No automatic, paired, retry, or reconcile path selects it; it is the
  operator's destructive escape hatch when preservation is no longer the chosen outcome.
- **Read-only status/probe reads:** status may fetch into per-call temp refs and read local refs without a lock.
  Reads must not mutate durable state; any cleanup belongs to the mutating operation that resolved the condition.
- **Remote sync-state marker publication push:** the marker write is CAS-guarded locally and the remote push has
  its own reconcile path. It deliberately precedes transport only after planning returns a proof-bearing target.
  A planning refusal publishes no remote intent; every refused or failed paired notes leg retains the local
  partial-push marker for later recovery.

## Temp Ref Rules

- Never fetch directly into a live notes ref or live sync-state ref.
- Publication-planner and status refs carry caller-unique tokens and are best-effort deleted by the caller that
  created them. Reconcile refs are likewise caller-unique and stay inside the lock-protected fetch/use/delete span.
- Cleanup deletes only the caller's temp ref and is best-effort.
- A shared temp ref is acceptable only inside a serialized critical section whose lock also protects cleanup.

## Operating Boundaries

- **Compaction is a coordinated boundary:** compact only when participating machines are synced. Incompatible
  manifests disable automatic adoption and merge; the partial-push marker stays live until an operator chooses
  either the remote snapshot, or verifies materialized disk state and establishes a fresh authoritative save after
  manual canonical-ref repair. Neither choice is an automated, lossless rollback procedure.
- **Publication follows commit visibility:** a current or historical note for an abandoned unpublished commit blocks
  routine publication. Make the commit reachable from a live origin branch, or consciously use the explicit force
  override; routine retries never reinterpret an unchanged unsafe topology as safe.

## Accepted Residuals

- **Break-lock residual:** a stale break-lock can itself be broken. That re-admits the stale-break race one level
  down, but only across the tiny read/unlink/release section. A kernel-released `flock` style primitive is the
  upgrade path if this residual ever bites.
- **Pinned-plan residue:** a sibling save can land between planning and transport. The exact-tip push prevents
  accidental widening, so the sibling save remains local for a later freshly proven publication. A remote advance
  instead rejects the pinned push and leaves both canonical refs recoverable.
- **Manual compaction-lineage repair:** cross-snapshot histories intentionally have no automatic reconcile. The
  sticky refusal and marker trade availability for preserving both snapshots and materialized disk until the
  operator makes the authoritative-state decision described above.
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
