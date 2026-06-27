# Spec (`detailed` · `RFC`): state-ref-write-safety

- **Origin:** [internal]

- **Purpose:** Guard ARC's local identity-scoped state writes against same-machine inter-process races, so two
  concurrent ARC processes for one identity cannot silently clobber each other's record. Four guards — CAS+retry
  for the two tree-refs, a reconcile-read discrimination fix, an exclusive-create for the machine-id, and a
  portable advisory lock for the user-notes write — each matched to its write mechanism.

---

## Introduction / Context

ARC keeps several **identity-scoped** records shared across a developer's worktrees: the errand orphan state-ref
(`refs/arc/user/{identity}/errands`), the user-notes ref (`refs/notes/arc/user/{identity}`), and — since the
`partial-push-marker` work — the sync-state ref, plus a local `.sync-state.json` file holding the machine-id.
Identity-scoped means two in-flight sessions on **one machine** — the multi-worktree scenario
`finalize-parallelism` blesses — can write the same record concurrently. Each write is an unguarded
read-modify-write (RMW): two processes both read state `S`, build on `S`, and write back, and the last writer
wins, silently dropping the other's record. The branch and working tree survive; the identity record is lost.

The cross-machine path is already safe across the refs (fetch → union/reject merge → non-fast-forward retry, via
`reconcileSyncStatePush` and the errand twin `reconcileErrandPush`). This work is the **single-machine
complement**: inter-process, not inter-machine. The shape differs by write mechanism, which is why one primitive
does not cover all four surfaces:

- **Errand ref and sync-state ref — shared tree-commit chokepoint.** Both write through `lib/git/ref-tree.ts`
  `writeTreeCommit` (errand via `writeRefTreeCommit` at `lib/errand/ref-tree.ts`; sync-state via `writeEntry` at
  `lib/user-sync/sync-state-ref.ts`). That function ends in an **unconditional** `git update-ref <ref> <sha>`
  (`lib/git/ref-tree.ts:103`) — no old-value compare — over a read-tip → read-tree → mutate → commit-tree →
  update-ref sequence. Two same-machine processes racing it both update the ref; the stale one wins last. The
  reconcile path (`reconcileTrees`, `lib/user-sync/sync-state-merge.ts`) already comments that it keeps the write
  path "compare-and-swap-ready for a later same-machine guard" — this work is that guard.

- **User-notes ref — `git notes add`, a different mechanism.** The local write is
  `git notes --ref <ref> add -f -F - <commit>` (`lib/io-context.ts` `writeGitNote`, driven from `runUserSave` at
  `commands/user/save-load.ts`), storing the whole `user/{identity}/` manifest as one JSON note anchored to HEAD.
  The notes *tree* is a key→blob map (the same per-key shape as the tree refs), but `git notes add` does its own
  unguarded RMW on that tree with **no** old-value protection. Verified empirically: 40/40 rounds of two
  concurrent `git notes add` for two *different* commits (which should union to two notes) collapsed to one note,
  zero errors — silent loss every time the writes truly overlap. A partial backstop exists for content already at
  origin (the push-time `cat_sort_uniq` union-merge, `reconcileAndRepush` at `commands/user/push-fetch.ts`); the
  pure-loss window is a local save clobbered before its first push.

- **Machine-id file — read-miss → generate → write (TOCTOU).** `getOrCreateMachineId`
  (`lib/user-sync/sync-state.ts:190`) reads the persisted id, and on a miss generates a `randomUUID()` and
  `atomicWriteJson`s it (merged into `.sync-state.json`). The write is file-atomic (temp-then-rename, `lib/fs.ts`),
  but the read→generate→write is a TOCTOU gap: two concurrent first-callers both miss, mint **different** ids,
  and the rename winner persists one — so the two processes disagree on machine identity. Because the sync-state
  marker ref keys entries by `machineId`, a disagreement orphans marker entries.

Why it gates `finalize-parallelism`: that work's bar is "prove watertight for concurrent same-machine
worktrees." A known, verified silent-loss race in a shared identity record is exactly what that bar forbids, even
at low frequency. Closing all four guards is what lets the GA claim hold without a documented hole in the shared
identity surface.

## Goals

- Every identity-scoped **local** write survives a same-machine concurrent writer for the same identity — no
  silent drop, across all four surfaces (errand ref, sync-state ref, user-notes ref, machine-id file).
- Two concurrent machine-id first-callers converge on **one** id (both agree), never two.
- A transient (errored, not absent) ref read inside the sync-state reconcile never silently narrows the merged
  tree by dropping siblings' entries.
- Portable across Windows / WSL / Mac — the advisory lock and the exclusive-create use cross-platform primitives.
- Bounded, lock-free where possible: contention resolves by retry (CAS) or short serialization (notes lock),
  never an unbounded loop or a stale-lock deadlock.
- Forward-compatible: the tree-ref guards lift into the eventual `arc-backend` version-checked-writes substrate
  with no reshape.

## Non-Goals

- **Cross-machine write safety.** Already handled by the fetch → union/reject → non-fast-forward retry path; this
  work is the single-machine complement, not a replacement for it.
- **A global per-identity lock** over all identity-scoped writes — explicitly rejected (see Alternatives); it
  would serialize the CAS-able hot paths and add a stale-lock failure mode there.
- **Reimplementing `git notes add`** to bring the notes ref under CAS — rejected; the lock leaves git owning the
  notes tree format.
- **The `arc-backend` version-checked substrate itself.** This is the git-native interim that later lifts into
  it, not that substrate.
- **Any user-facing surface or new configuration axis.** These are internal robustness guards; no command, flag,
  or config key changes.

## Proposed Design

Four guards (D1–D4), each the enumerable substrate the task list is built from and validated against. D1 and D2
sit in the shared tree-commit plumbing; D3 and D4 are adjacent additions on the user-sync surface.

### D1 — CAS + retry at the `writeTreeCommit` chokepoint (errand ref + sync-state ref)

Close the unconditional `update-ref` with git's native optimistic-concurrency primitive, in the one shared
mechanism so both consumers inherit it.

- **Compare-and-swap.** Thread the ref tip read at the **start** of the RMW through to the final write as
  `git update-ref <ref> <new> <old>` (and `update-ref <ref> <new> ""` for the create-from-absent case — git's
  zero-old-value form, which fails if the ref already exists). The update rejects if canonical moved since the
  read.
- **Expected-tip parameter.** `writeTreeCommit` (`lib/git/ref-tree.ts`) takes an explicit **expected old tip**
  (the value the caller read before building its tree) and issues the compare-and-swap `update-ref`. A sentinel
  (e.g. absent → empty old-value) covers the root-commit case. The existing `parents` argument is unchanged.
- **Retry loop.** A wrapper around the full RMW (read tip → read tree → mutate → `writeTreeCommit`) catches a
  rejected CAS, re-reads the tip and tree, rebuilds the mutation on the fresh state, and retries — **bounded by
  `MAX_RECONCILE_ATTEMPTS` (= 3)**, the existing exported cap in `lib/user-sync/sync-state-merge.ts`, reused so
  both reconcile and same-machine retry share one bound. Exhaustion surfaces a **typed failure** (mirroring
  `reconcileSyncStatePush`'s `{ kind: "failed" }`), never a silent drop or an unbounded loop.
- **Applied at both write legs.** The direct writes (errand `writeRefTreeCommit`, sync-state `writeEntry`) and
  the reconcile's local-commit leg (`reconcileTrees`' `writeTreeCommit` call) both route through the
  CAS-and-retry shape, so the errand and sync-state consumers inherit it from the shared mechanism without
  per-consumer reinvention. The mutation closure differs per caller (per-slug errand record vs per-machine
  sync-state entry); the CAS+retry frame is shared.
- **Detection of a CAS rejection.** Distinguish git's "old value mismatch" `update-ref` failure from other git
  errors by message, in the same spirit as the existing `isNonFastForwardError` / `isRemoteUnavailableError`
  discriminators — only a genuine CAS rejection retries; any other error surfaces.

### D2 — Reconcile-read failure discrimination

`readRefTip` / `readTreeEntries` (`lib/git/ref-tree.ts:31`, `:41`) collapse every git error to absent-ref
(`null` / empty `Map`) — the deliberate fail-open stance for advisory orphan state. The one real edge: in the
sync-state reconcile (`reconcileTrees`), an **errored** (not empty) read after a successful fetch makes the union
write a tree with only this machine's key, transiently dropping siblings' entries from origin (self-healing on
the next push — lag, not loss). Close it:

- Provide a **discriminating read** that distinguishes genuine git failure from a legitimately absent ref —
  either a sibling reader returning a tagged result (`{ kind: "absent" | "entries" | "error" }`) or an
  exception-throwing variant — without changing the fail-open behavior of the existing advisory callers.
- In `reconcileTrees`, on a discriminated read **error** (post-fetch), **abort the reconcile** (surface through
  the existing single-channel `{ kind: "failed" }` outcome of `reconcileSyncStatePush`) rather than writing a
  narrowed union. The absent-ref case still unions normally.
- The existing fail-open callers (advisory orphan-state reads outside the reconcile) keep today's
  null/empty-on-error behavior — the discrimination is opt-in at the reconcile call site, not a global change.

### D3 — Machine-id exclusive create-if-absent

Close the `getOrCreateMachineId` TOCTOU with an **exclusive create**, not a lock — "a create, not a modify."

- **Dedicated file.** Move the canonical machine-id store to its own file under
  `user/{identity}/.internal/` (e.g. `.machine-id`), holding the bare UUID. First-write uses an **exclusive
  create** (Node `writeFile` with the `wx` flag — `O_CREAT | O_EXCL`).
- **Race resolution.** Concurrent first-callers race the exclusive create: the winner writes its `randomUUID()`;
  every loser gets `EEXIST`, then **reads the file** to obtain the winner's id. Both processes return the same
  id. No lock, no lock lifecycle.
- **One-time migration read.** On a miss of `.machine-id`, before minting: if `.sync-state.json` carries a
  legacy `machineId`, **adopt and migrate** it — write that existing id into `.machine-id` (via the same
  exclusive-create race) rather than minting fresh, preserving a machine's already-established identity so its
  sync-state marker key is not orphaned. After migration the `.sync-state.json` `machineId` field is **read-
  tolerated only**, never written.
- **Schema reconciliation.** `getOrCreateMachineId`, `readPersistedMachineId`, and the `machineId` carry-forward
  in `writeLocalSyncState` (`lib/user-sync/sync-state.ts`) are repointed at `.machine-id`. The `LocalSyncState`
  `machineId?` field stops being written; it remains parseable on read solely for the migration adopt. No
  version bump is required (the field was additive/optional; its absence on new writes is already tolerated).

### D4 — User-notes write lock

The notes ref cannot take D1's CAS (you cannot inject a compare-and-swap into `git notes add` porcelain without
reimplementing its tree layout/fanout). Serialize instead, with a portable per-identity advisory lock around the
note-write critical section.

- **Lock primitive.** A portable per-identity advisory lock — an exclusive-create lockfile (Node `wx` /
  `O_EXCL`, or `mkdir`-based, cross-platform across Win/WSL/Mac) under `user/{identity}/.internal/` (e.g.
  `.notes.lock`). The lockfile records the holder's **pid** and write **mtime**.
- **Scope.** Wrap only `runUserSave`'s note-write critical section (`commands/user/save-load.ts`) — the smallest
  span that contains the `git notes add` RMW. Git keeps owning the notes format; only the write is serialized.
- **Acquire / contend.** A caller that fails to create the lockfile retries with bounded backoff while the lock
  is held-and-live, then proceeds once it acquires.
- **Stale detection — pid-liveness primary, mtime-ceiling backstop.** A held lock is considered **stale** (and
  may be broken — removed and re-acquired) when **either**: the recorded pid is no longer alive
  (`process.kill(pid, 0)` throws `ESRCH`), **or** the lockfile mtime exceeds a generous ceiling. Liveness handles
  the crash case precisely; the mtime ceiling backstops pid-reuse and any cross-platform liveness edge. Breaking
  a stale lock is itself raced through the same exclusive-create, so two processes breaking concurrently still
  converge on one holder.
- **Release.** Release in a `finally` so a thrown note-write still frees the lock; a crash leaves a stale lock
  the next acquirer reclaims via the stale check. Never `--no-verify`-style force; never a release that can drop
  another holder's lock (verify ownership before removing on the normal path).

## Alternatives & Rationale

The central decision is the **mechanism split** — CAS where ARC owns the plumbing, a lock where ARC drives
porcelain. It is principled, not incidental:

- **CAS for the tree refs.** Lock-free, no stale-lock failure mode, git's native optimistic-concurrency
  primitive — strictly better for refs ARC writes via plumbing. Retry handles contention, bounded by the same
  cap the cross-machine reconcile already uses. The reconcile code was already written "CAS-ready," so this is
  the anticipated closure, not a new pattern.

- **A single global per-identity lock over *all* identity-scoped writes — rejected.** It would serialize the
  tree refs too, trading CAS's lock-free robustness for a stale-lock failure mode on the hot automatic paths
  (errand/sync-state writes fire far more often than the human-invoked notes write). Reserve the lock for where
  CAS cannot reach.

- **Reimplementing `git notes add` to bring the notes ref under CAS — rejected.** Disproportionate risk: it bets
  on git's notes tree format and fanout to keep `git notes show/list` working against hand-built trees, for a
  narrow-window race (note writes happen at human-invoked sync/handoff boundaries, not a hot automatic path).
  The lock leaves git owning the format and closes the verified silent-loss race with the minimal change.

Per-fork rationale for the three discovery decisions:

- **Machine-id: separate exclusive-create file (D3), over an in-place lock or an O_EXCL sentinel token.** The
  machine-id need is a *create*, not a *modify* — an exclusive create is the exact primitive, cheaper than the
  notes lock and with no lock lifecycle. An in-place lock would reuse D4's primitive but is the heavier "modify"
  shape this case does not need; an O_EXCL sentinel-token-plus-JSON-field keeps the field in `.sync-state.json`
  but adds a second file whose only job is the token and still forces the loser to read the id back from a record
  it may not yet see. The dedicated file *is* the record, so the loser reads the id directly. The one-time
  migration read is cheap insurance against orphaning an already-minted identity; it collapses to read-tolerate
  immediately after, leaving no permanent dual-store.

- **Lock stale-detection: pid-liveness + mtime backstop (D4), over either alone.** mtime-only forces an arbitrary
  timeout — too short risks stealing a live-but-slow lock, too long stalls behind a crashed holder. pid-only is
  precise for crashes but pid-reuse can read an unrelated live process as the holder. The combination uses
  liveness as the precise primary and the mtime ceiling as the rare-case backstop, matching the draft's intended
  "pid+mtime" policy.

- **Test harness: hybrid (deterministic interleave + bounded true-race smoke), over either alone.** Deterministic
  interleave injection gives CI-safe, zero-flake primary assertions (force the read→write interleaving via an
  injected seam, assert the guard catches it) — the right fit for the zero-tolerance quality bar. A bounded
  true-race smoke at the e2e tier preserves the empirical "real processes actually race clean" evidence (the
  draft's 40-round validation) without making the whole suite nondeterministic. Deterministic-only loses the
  empirical backstop; true-race-only is flake-prone in CI and slow.

## Cross-cutting Considerations

- **Testing.** Hybrid harness per guard (see Success Criteria for the matrix):
    - *Deterministic interleave* at the unit/integration tier — an injected seam (a barrier or instrumented IO
      hook) forces a specific read→write interleaving, asserting the CAS rejection path, the EEXIST fallback, the
      reconcile abort-on-error, and lock contention each behave. These are the primary, reproducible assertions.
    - *Bounded true-race smoke* at the e2e tier — a small fixed number of rounds spawning real concurrent writers
      against a temp git repo, asserting both writes land (no drop) and the machine-id agrees. Bounded so the
      suite stays fast and flake-free.
- **Performance.** CAS is lock-free; the retry fires only under genuine same-machine contention, which is rare.
  The notes lock guards only the cold, human-invoked save path. No measurable cost on the common path.
- **Migration.** No data migration for the refs. The machine-id one-time migration read adopts an existing
  `.sync-state.json` `machineId` into `.machine-id` on first run of the new code; thereafter the JSON field is
  ignored. Records without a legacy id mint fresh exactly as today.
- **Cross-platform.** The exclusive-create (`wx` / `O_EXCL`) and `mkdir` lock primitives, and `process.kill(pid,
  0)` liveness, all behave on Windows / WSL / Mac. The true-race e2e smoke runs on the CI matrix to confirm.
- **Forward-compat.** This is the git-native interim of `arc-backend`'s version-checked-writes /
  optimistic-concurrency substrate. CAS-on-`update-ref` is the same shape (read version, write-if-unchanged,
  reconcile-on-reject), so the tree-ref guards lift in with zero reshape; the cross-machine twin (the
  `partial-push-marker` sync-state marker) lifts into the same target — together the two halves of "don't clobber
  shared state." The notes lock and machine-id create-guard are interim local-serialization measures the
  substrate subsumes when records move off bare git refs.
- **Rollout.** Pure internal robustness — no user-facing surface, no config, no command change. Ships behind the
  existing commands; correctness is proven by the test matrix.

## Success Criteria

Validated at work-unit completion — the per-guard race matrix is the acceptance contract:

1. **Tree refs (D1).** Two racing same-machine writers to the errand ref both land — neither record is silently
   dropped. Same for the sync-state ref. The CAS rejection path is exercised deterministically and the retry
   re-reads and re-applies.
2. **Retry bound (D1).** A relentlessly-racing write exhausts at `MAX_RECONCILE_ATTEMPTS` (3) and surfaces a
   typed failure — never an unbounded loop, never a silent drop.
3. **Reconcile read discrimination (D2).** A transient (errored, not absent) ref read inside the sync-state
   reconcile aborts the reconcile (typed failure) instead of writing a tree narrowed to this machine's key;
   the genuinely-absent case still unions normally; the advisory fail-open callers are unchanged.
4. **Notes ref (D4).** Two racing same-machine `runUserSave` note writes both land (no collapse to one) under the
   advisory lock. A held lock from a dead pid (or past the mtime ceiling) is detected stale and reclaimed; a
   thrown note-write releases the lock.
5. **Machine-id (D3).** Two concurrent first-callers on one machine converge on a single id. An existing
   `.sync-state.json` `machineId` is adopted into `.machine-id` on first run (no re-mint, no orphaned marker
   key).
6. **Portability.** The exclusive-create, lock, and liveness primitives pass on the Windows / WSL / Mac CI
   matrix, including the bounded true-race e2e smoke.
7. **No regression.** All existing tests green; all quality gates (markdown lint, `lint:ts`, `typecheck:all`,
   `test`, `build`) pass; no user-facing or config surface changed.

## Open Questions

Genuine implementation-tactical detail, resolved during the work — not deferred design:

- The concrete mtime-ceiling value and the lock-acquire backoff timing (D4) — tuning constants settled at
  implementation against the test matrix, not design decisions.
- Whether D2's discrimination ships as a new sibling reader or a tagged-result variant of the existing readers —
  a local-structure choice settled at task generation; the behavior (abort the reconcile on a real read error) is
  fixed.
- The exact lockfile encoding (D4) and `.machine-id` file name (D3) — naming/format particulars, not behavior.
