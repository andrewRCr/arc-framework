# Draft: state-ref-write-safety

**Purpose:** Guard ARC's local identity-scoped state writes against same-machine inter-process races, so two
concurrent ARC processes for one identity can't silently clobber each other's record. Three git state-refs (the
errand ref, the user-notes ref, the sync-state ref) plus one JSON file (the machine-id), closed by the right
primitive for each write mechanism.

- **State:** Maturing → formalization-ready. Re-grounded against shipped code on 2026-06-26 (the
  `partial-push-marker` sync-state ref had landed since extraction; the user-notes "identical shape" premise was
  corrected). Originally extracted from `cross-machine-sync-coherence` at its 2026-06-25 re-grounding (the shed
  single-machine-concurrency concern; that WU is cross-machine, this is not).

- **Class:** `Heavy` — four distinct guards across the git, errand, and user-sync surfaces, including a portable
  advisory-lock primitive with crash-stale handling and a concurrency test matrix. Bounded mechanisms composed
  from known primitives (no invention), but past the trivial-Light floor on scale.

- **Created:** 2026-06-25

- **Origin:** Surfaced as a CodeRabbit finding on the errand orphan-ref write during errand-lattice integration
  (PR #116, triaged defer-to-follow-up 2026-06-21), then parked in `cross-machine-sync-coherence`'s inbound
  buffer because that WU already held the notes-ref twin as an open question. Re-homed here at decomposition —
  it is single-machine, distinct from that WU's cross-machine framing.

---

## Problem / Motivation

ARC keeps several **identity-scoped** records that are shared across a developer's worktrees: the errand orphan
state-ref, the user-notes ref, and (since `partial-push-marker`) the sync-state ref, plus a local `.sync-state`
JSON file holding the machine-id. Identity-scoped means two in-flight sessions on one machine — the exact
multi-worktree scenario `finalize-parallelism` blesses — write the same record concurrently. Each write is an
unguarded read-modify-write, so two processes can both read state `S`, build on `S`, and write back: last writer
wins, silently dropping the other's record. The branch or working tree survives; the identity record is lost.

The shape differs by write mechanism, which is why one primitive does not cover all four:

- **Errand ref and sync-state ref — shared tree-commit chokepoint.** Both write through
  `lib/git/ref-tree.ts` `writeTreeCommit` (errand via the `writeRefTreeCommit` wrapper at `lib/errand/ref-tree.ts:56`;
  sync-state via `writeEntry` at `lib/user-sync/sync-state-ref.ts:92`). That function ends in an **unconditional**
  `git update-ref <ref> <sha>` at `lib/git/ref-tree.ts:103` — no old-value compare — over a read-tip →
  read-tree → mutate → commit-tree → update-ref sequence. Two same-machine processes racing it both update the
  ref; the stale one wins last. The sync-state ref already has a *cross-machine* retry (`reconcileSyncStatePush`,
  `lib/user-sync/sync-state-merge.ts`, bounded ×3) on non-fast-forward push; the errand ref has the analogous
  `reconcileErrandPush` (`lib/errand/merge.ts`). Neither closes the *single-machine* local update-ref.

- **User-notes ref — `git notes add`, a different mechanism (premise correction).** The earlier extraction
  assumed the notes ref had "the identical unconditional-write shape" as the errand ref. It does not. The local
  write is `git notes --ref <ref> add -f -F - <commit>` (`lib/io-context.ts:44` `writeGitNote`, driven from
  `runUserSave` at `commands/user/save-load.ts:82`), with the whole `user/{identity}/` manifest stored as one
  JSON note anchored to **HEAD**. The notes *tree* is structurally a key→blob map (key = annotated commit SHA) —
  the same per-key union shape as the tree refs — but `git notes add` does its own unguarded read-modify-write on
  that tree and provides **no** old-value protection. Verified empirically: 40/40 rounds of two concurrent
  `git notes add` for two *different* commits (which should union to two notes) collapsed to one note, with zero
  errors — silent loss, every time the writes truly overlap. A partial backstop exists for content that already
  reached origin (the push-time `cat_sort_uniq` union-merge, `reconcileAndRepush` at
  `commands/user/push-fetch.ts:246`); the pure-loss window is a local save clobbered before its first push. The
  trigger window is narrower than the tree refs (note-writes happen at human-invoked sync/handoff boundaries, not
  a hot automatic path), but the loss is real and silent when it fires.

- **Machine-id file — read-miss → generate → write (TOCTOU).** `getOrCreateMachineId`
  (`lib/user-sync/sync-state.ts:190`) reads the persisted id, and on a miss generates a `randomUUID()` (line 198)
  and `atomicWriteJson`s it. The write is file-atomic (temp-then-rename, `lib/fs.ts`), but the read→generate→write
  is a TOCTOU gap: two concurrent first-pushes on one machine both miss, mint **different** ids, and the rename
  winner persists one — so the two processes disagree on machine identity. A JSON-file race, not an `update-ref`
  race.

The **cross-machine** path is already safe across the refs (fetch → union/reject merge → non-fast-forward retry).
This WU is the **single-machine** complement: inter-process, not inter-machine.

## Scope

Four guards, each matched to its write mechanism:

1. **CAS + retry at the shared `writeTreeCommit` chokepoint** — covers the errand ref and the sync-state ref in
   one fix.
    - **Compare-and-swap:** thread the tip read at the start of the read-modify-write through to the final write
      as `git update-ref <ref> <new> <old>` — git's native optimistic-concurrency primitive; the update rejects
      if canonical moved since the read.
    - **Retry loop** wrapping the read-modify-write: on a rejected CAS, re-read the tree, rebuild on the fresh
      tip, retry (bounded, matching the existing reconcile attempt cap).
    - Threaded through the direct writes and the reconcile's local-commit leg, so both the errand and sync-state
      consumers inherit it from the shared `lib/git/ref-tree.ts` mechanism without per-consumer reinvention.

2. **Reconcile-read failure discrimination** — `readRefTip` / `readTreeEntries` (`lib/git/ref-tree.ts:31`, `:41`)
   collapse every git error to absent-ref (null / empty Map) — the deliberate fail-open stance for advisory
   orphan state. The one real edge: in the sync-state reconcile (`reconcileTrees`), an *errored* (not empty)
   read after a successful fetch makes the union write a tree with only this machine's key, transiently dropping
   siblings' entries from origin (self-healing on the next push — lag, not loss). The read path should
   distinguish genuine git failure from absent-ref so a transient error never silently narrows the merged tree.

3. **Machine-id atomic-create-if-absent** — close the `getOrCreateMachineId` TOCTOU with an exclusive
   create-if-absent (O_EXCL) on first write rather than a lock: the racing first-callers either create
   exclusively or fall through to read the winner's id, so both agree. A create, not a modify — cheaper than the
   notes lock and needs no lock lifecycle.

4. **User-notes write lock** — the notes ref can't take the tree-ref CAS (you can't inject a compare-and-swap
   into `git notes add` porcelain without reimplementing notes-add's tree layout/fanout). Serialize instead: a
   **portable per-identity advisory lock** (mkdir / O_EXCL lockfile with pid+mtime stale detection, cross-platform
   across Win/WSL/Mac) around `runUserSave`'s note-write critical section. Leaves git owning the notes format;
   closes the verified silent-loss race with the minimal change.

**Concurrency tests** for each guard: two racing writers both land (no silent drop) on the tree refs and the
notes ref; two concurrent first-callers agree on the machine-id; a transient read error does not narrow the
reconcile union.

### Mechanism rationale — why CAS for two refs and a lock for one

CAS where ARC owns the plumbing (the tree-commit writes), a lock where ARC drives porcelain (`git notes add`).
The split is principled, not incidental:

- **CAS** is lock-free, has no stale-lock failure mode, and is git's native optimistic-concurrency primitive —
  strictly better for refs we write via plumbing. Retry handles contention.
- A single **global per-identity lock** over *all* identity-scoped writes was considered and rejected: it would
  serialize the tree refs too, trading CAS's lock-free robustness for a stale-lock failure mode on the hot paths.
  Reserve the lock for where CAS cannot reach.
- **Reimplementing `git notes add`** to bring the notes ref under the same CAS was considered and rejected:
  disproportionate risk (betting on git's notes tree format/fanout to keep `git notes show/list` working against
  hand-built trees) for a narrow-window race. The lock leaves git owning the format.

## Why it gates `finalize-parallelism`

The errand, user-notes, and sync-state refs are identity-scoped — shared across worktrees — so two in-flight
sessions on one machine (the multi-in-flight scenario the parallelism GA blesses) can race the same record and
silently lose a write. `finalize-parallelism`'s bar is "prove watertight for concurrent same-machine worktrees";
a known, verified silent-loss race in a shared identity record is exactly what that bar forbids, even at low
frequency. Closing all four guards — including the narrow-window notes-ref race — is what lets the GA claim hold
without a documented hole in the shared identity surface.

## Forward-compat

This is the git-native interim of what `arc-backend` eventually owns — its version-checked-writes /
optimistic-concurrency substrate. CAS-on-`update-ref` is the same shape (read version, write-if-unchanged,
reconcile-on-reject), so the tree-ref guards lift into that substrate with zero reshape. The cross-machine twin —
`partial-push-marker`'s sync-state marker — lifts into the same target; together they are the two halves of
"don't clobber shared state" (single-machine CAS + cross-machine marker). The notes-write lock and machine-id
create-guard are interim local-serialization measures that the version-checked substrate subsumes when records
move off bare git refs.

---

## Continuity

- **Resolved:** three-ref + one-file decomposition; CAS-for-tree-refs / lock-for-notes / atomic-create-for-machineId
  mechanism split, with the rejected alternatives recorded; file references re-grounded against shipped code; both
  former inbound-buffer items folded into Scope (items 2 and 3); Class ratcheted to `Heavy`.
- **Open (detail-design for create-spec / task generation):** CAS retry-bound value; the lock's exact home and
  stale-detection policy (pid liveness vs mtime timeout); machine-id O_EXCL interaction with the broader
  `.sync-state` record; the concurrency test harness shape (true-race vs deterministic interleave injection).
- **Next:** formalize into a spec — requirements per guard, the test matrix as acceptance criteria.
