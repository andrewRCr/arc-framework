# Task List: state-ref-write-safety

- **Design:** `spec-state-ref-write-safety.md`

---

## **Phase 1:** D1 — CAS + retry at the tree-commit chokepoint

_Purpose:_ Close the unconditional `update-ref` in the shared `writeTreeCommit` mechanism with git's native
compare-and-swap plus a bounded retry, so the errand ref and the sync-state ref both inherit the guard from one
place. Deterministic interleave tests are the primary assertions here; the true-race backstop lands in Phase 5.

_Design decisions:_ The expected-old tip is read at the start of each caller's read-modify-write and threaded to
the final `update-ref`; a rejected CAS is distinguished by message (sibling of the existing `isNonFastForwardError`
discriminator); the retry frame reuses the exported `MAX_RECONCILE_ATTEMPTS` so same-machine retry and
cross-machine reconcile share one bound.

### `[x]` **1.1 Thread an expected-tip compare-and-swap through `writeTreeCommit`**

- _Goal:_ `writeTreeCommit`'s final ref move rejects when the ref advanced since the caller read its tip, instead
  of unconditionally overwriting it.

- _Outcome:_ `writeTreeCommit` (`lib/git/ref-tree.ts`) gained an `expectedOldTip: string | null` parameter threaded
  to `git update-ref <ref> <new> <old>`; a `null` tip maps to git's empty old-value form, so create-from-absent
  fails if the ref already exists. Threaded through the errand wrapper (`lib/errand/ref-tree.ts`) and all five call
  sites — errand `writeErrandRecord` / `removeErrandRecord` / `reconcileTrees`, sync-state `writeEntry` /
  `reconcileTrees` — each passing the tip it already read (the reconcile legs now capture the local tip explicitly).
  CAS is active; a rejection surfaces as a raw git error until the retry frame lands in 1.2/1.3. Real-git CAS
  behavior covered by `ref-tree-cas.test.ts`.

### `[x]` **1.2 Bounded CAS-retry frame, with rejection discrimination**

- _Goal:_ A losing same-machine writer re-reads the fresh tip and tree, rebuilds its mutation on that state, and
  retries — bounded, surfacing a typed failure on exhaustion rather than looping or dropping.

- _Outcome:_ Added `writeTreeWithCasRetry` (`lib/user-sync/cas-retry.ts`), wrapping read tip → read tree →
  mutate → `writeTreeCommit`: a CAS rejection re-reads and rebuilds the mutation closure on the fresh state and
  retries, bounded by `MAX_RECONCILE_ATTEMPTS`, returning a typed `{ kind: "written" | "failed" }` (mirroring the
  reconcile push); a non-CAS git error surfaces immediately. Added the `isCasRejectionError` discriminator
  (`lib/user-sync/notes-merge.ts`) matching git's two CAS shapes (`but expected`, `reference already exists`).
  Relocated `MAX_RECONCILE_ATTEMPTS` to the shared `lib/git/ref-tree.ts` (re-exported from `sync-state-merge.ts`;
  errand's duplicate `const` dropped) so same-machine retry and cross-machine reconcile share one bound and the
  frame carries no upward dependency — which also removes the latent `sync-state-ref ↔ sync-state-merge` import
  cycle 1.3's wiring would otherwise form. The frame is not yet wired into the direct writes (that is 1.3); its
  `mutate` closure doubles as the deterministic interleave seam the tests inject through.

### `[x]` **1.3 Route the direct write legs through the retry frame**

- _Goal:_ Every direct ref write that can lose a same-machine race runs under the retry frame, so neither
  consumer can silently clobber a concurrent writer; the reconcile legs' rejections fold into their existing push
  loops.

    - `[x]` **1.3.a Errand direct writes**
        - Routed `writeErrandRecord` / `removeErrandRecord` (`lib/errand/record.ts`) through
          `writeTreeWithCasRetry`; a `failed` outcome re-throws, preserving the `void` contract. `removeErrandRecord`
          keeps a pre-check so an absent slug stays a no-op (no redundant commit).

    - `[x]` **1.3.b Sync-state direct write**
        - Routed `writeEntry` (`lib/user-sync/sync-state-ref.ts`) through the frame; `failed` re-throws, success
          returns the sha — the `Promise<string>` contract is unchanged.

    - `[x]` **1.3.c Confirm reconcile-leg rejections fold into the existing push loops**
        - sync-state's `reconcileSyncStatePush` already wraps its `reconcileTrees` call into `{ kind: "failed" }`
          (covered by an existing test). Errand's `reconcileErrandPush` did **not** — fixed it to mirror that wrap,
          so a CAS rejection in the local-commit leg folds into `{ kind: "failed" }` rather than escaping as a throw.
          Each leg keeps its own shape (errand `conflict` / `failed`, sync-state `failed`); no fresh wrapper needed.

- _Outcome:_ All direct tree-ref writes (errand records, sync-state entries) now recover from a same-machine CAS
  loss by re-reading and retrying instead of throwing, and the reconcile legs fold their rejections into their
  existing bounded push loops. Closes Phase 1 / D1 — the deterministic CAS rejection / retry / exhaustion and
  no-clobber assertions hold (Success Criteria 1–2); the true-race e2e backstop lands in Phase 5.

## **Phase 2:** D2 — Reconcile-read failure discrimination

_Purpose:_ Give the sync-state reconcile a read that distinguishes a genuine git failure from a legitimately
absent ref, so a transient errored read aborts the reconcile instead of writing a tree narrowed to this machine's
own key — without disturbing the fail-open advisory callers.

### `[x]` **2.1 Add a discriminating ref/tree read**

- _Goal:_ The reconcile can tell a genuine git read failure apart from a legitimately absent ref, while every
  existing advisory caller keeps its fail-open null / empty-on-error behavior.

    - added `readTreeEntriesDiscriminating` (`lib/git/ref-tree.ts`) returning a tagged
      `{ kind: "absent" | "entries" | "error" }`, beside the unchanged fail-open `readTreeEntries`
    - absence is keyed off git's "Not a valid object name" message via a local `isAbsentRefError` discriminator
      (sibling in spirit to `isNonFastForwardError`); every other read failure surfaces as `error`
    - shared `ls-tree` parsing extracted to a `parseTreeEntries` helper, so the new reader and `readTreeEntries`
      stay one parse
- _Outcome:_ Chose a new sibling reader over mutating the existing one (spec Open Question), keeping the
  discrimination opt-in at the future reconcile call site; the fail-open advisory callers are untouched.

### `[x]` **2.2 Abort the reconcile on a discriminated read error**

- _Goal:_ A transient errored read inside the sync-state reconcile aborts it instead of writing a union tree
  narrowed to this machine's own key.

    - swapped `reconcileTrees`' two tree reads (`lib/user-sync/sync-state-merge.ts`) to a `readReconcileTree`
      helper over `readTreeEntriesDiscriminating`: an `error` result throws (aborting before `writeTreeCommit`),
      an `absent` result unions as empty, `entries` unions as read
    - the thrown abort propagates through `reconcileSyncStatePush`'s existing reconcile-step catch to its single
      `{ kind: "failed" }` channel — no new outcome variant
    - the errand reconcile (`lib/errand/merge.ts`) is left on the fail-open reader — out of scope per D2
- _Outcome:_ Closes the D2 narrowing window: a post-fetch read failure now fails the push rather than silently
  dropping siblings' entries from the union, while a genuine absence still unions normally.

## **Phase 3:** D3 — Machine-id exclusive create-if-absent

_Purpose:_ Replace `getOrCreateMachineId`'s read→generate→write TOCTOU with a dedicated `.machine-id`
exclusive-create file, so concurrent first-callers converge on one id; adopt a legacy `.sync-state.json`
`machineId` once so an established machine identity is never orphaned.

### `[x]` **3.1 Dedicated `.machine-id` exclusive-create store with EEXIST read-back**

- _Goal:_ Concurrent first-callers on one machine converge on a single machine-id — the create winner's — instead
  of each minting and persisting a different UUID.

    - added a `.machine-id` store under `user/{identity}/.internal/` holding the bare UUID, written via a new
      `exclusiveCreateFile` primitive (`lib/fs.ts`, Node `writeFile` `wx` flag — `O_CREAT | O_EXCL`), beside the
      overwrite-style `atomicWriteJson`
    - repointed `getOrCreateMachineId` (`lib/user-sync/sync-state.ts`) at `.machine-id`: a read-hit returns the
      persisted id; a miss mints and exclusive-creates; an `EEXIST` reads back the winner's id so losers converge.
      The create is an injectable seam (defaulting to the real primitive) so the lost-race branch tests deterministically
    - read-back tolerates the brief winner-created-but-not-yet-written window via a bounded retry, then surfaces
      the `EEXIST` rather than minting a divergent id
- _Outcome:_ Chose a direct `fs.ts` exclusive-create helper over a new `CoreIO` method — matching the existing
  direct-`atomicWriteJson` write path and avoiding threading the seam through ~20 IO fakes. The legacy
  `.sync-state.json` `machineId` is left untouched here: its one-time adopt is Task 3.2, and the
  `readPersistedMachineId` / `writeLocalSyncState` repoint and stop-write are Task 3.3.

### `[x]` **3.2 One-time migration adopt of a legacy `.sync-state.json` `machineId`**

- _Goal:_ A machine that already minted an id under the old `.sync-state.json` keeps it — the existing id migrates
  into `.machine-id` rather than a fresh mint orphaning its sync-state marker key.

    - `getOrCreateMachineId` (`lib/user-sync/sync-state.ts`) now reads the legacy `.sync-state.json` `machineId`
      (via the existing `readPersistedMachineId`) on a `.machine-id` miss, before minting: an established id is
      adopted as the create candidate, only an absent legacy id mints fresh
    - the adopted id routes through the same `exclusiveCreateFile` path as a fresh mint, so concurrent migrators
      converge on one and a lost migration race still reads back the winner
    - the legacy field is read-tolerated only — `getOrCreateMachineId` no longer writes `.sync-state.json` at all,
      so the adopt leaves the legacy record byte-identical

### `[x]` **3.3 Repoint the machine-id schema; stop writing `machineId` to the sync-state record**

- _Goal:_ `.machine-id` is the single canonical store — the sync-state record stops carrying the id on write,
  while old records stay parseable for the one-time adopt.

    - `[x]` **3.3.a Repoint the readers/writers at `.machine-id`**
        - the canonical reader is already `.machine-id` (`readMachineIdFile`, from Task 3.1); narrowed the legacy
          `.sync-state.json` reader to migration-only (renamed `readPersistedMachineId` → `readLegacyMachineId`,
          sole caller the adopt) and dropped the `machineId` carry-forward from `writeLocalSyncState`
          (`lib/user-sync/sync-state.ts`)

    - `[x]` **3.3.b Stop writing the `LocalSyncState.machineId` field**
        - stopped `readLocalSyncState` surfacing `machineId`, so every record writer (`writeLocalSyncState`,
          `clearPartialPushMarker` / `clearErrandPartialPushMarker`, and the `record*` spreads) omits it; dropped
          the now-dead explicit field from the `clear*` records. The type keeps `machineId?` parseable on read
          (raw-read path) for the adopt; no version bump — the field was additive/optional
- _Outcome:_ Realized 3.3.a's "repoint readers" against the as-built split — the `.machine-id` canonical read
  (Task 3.1) plus a renamed legacy-only reader — rather than repointing one shared accessor. Dropped the field at
  the `readLocalSyncState` boundary so the `record*` markers stop carrying it too, not just the three named
  writers; the migration adopt is unaffected (it reads via the raw read).

## **Phase 4:** D4 — User-notes write lock

_Purpose:_ The notes ref can't take a CAS, so serialize instead — a portable per-identity advisory lock around the
smallest span of `runUserSave` that contains the `git notes add` read-modify-write. Git keeps owning the notes
format; only the write is serialized.

### `[x]` **4.1 Portable per-identity advisory lock primitive**

- _Goal:_ A cross-platform advisory lock serializes a per-identity critical section, reclaiming a lock held by a
  dead or hung process without deadlocking or dropping a live holder's lock.
- _Outcome:_ New `lib/user-sync/notes-lock.ts` exposes `acquireAdvisoryLock` / `releaseAdvisoryLock` over an
  exclusive-create `.notes.lock` (reuses `exclusiveCreateFile`, the same `O_EXCL` seam as D3's `.machine-id`).
  Stale reclaim is pid-liveness primary (`process.kill(pid, 0)`, treating `EPERM` as alive) with an mtime-ceiling
  backstop; a stale break re-races the exclusive create so concurrent breakers converge; release verifies the
  on-disk pid before removing so it never drops another holder's lock; held-and-live contention backs off to a
  bounded wait, then surfaces `AdvisoryLockTimeoutError`. Tuning settled against the test matrix: stale ceiling
  60s, max wait 10s, backoff 10→250ms; lockfile encodes `{pid, acquiredAt}`. Exported via the user-sync barrel.

### `[x]` **4.2 Serialize `runUserSave`'s note-write critical section under the lock**

- _Goal:_ Two racing same-machine `runUserSave` note writes both land instead of one silently overwriting the
  other, with the lock released even when the note write throws.
- _Outcome:_ `runUserSave` (`commands/user/save-load.ts`) now wraps the recent-notes read → tombstone apply →
  `io.writeNote` span in `acquireAdvisoryLock` / `finally`-`releaseAdvisoryLock` keyed on `getNotesLockPath`.
  Deterministic-interleave tests assert the critical section never overlaps (`maxActive === 1`, both writes land)
  and that a thrown write still frees the lock so the next save proceeds — guarding only the cold, human-invoked
  save path. The true-race e2e proof of both notes landing against real git is Phase 5.

## **Phase 5:** True-race e2e smoke & cross-platform portability

_Purpose:_ Add the hybrid harness's empirical tier — a bounded number of rounds spawning real concurrent writers
against a temp git repo, per guard — and confirm the exclusive-create / lock / liveness primitives behave across
the Windows / WSL / Mac CI matrix.

### `[x]` **5.1 Bounded true-race e2e harness and per-guard smokes**

- _Goal:_ Real concurrent processes racing each guard against a temp git repo land both writes (and agree on the
  machine-id), giving the empirical backstop the deterministic interleave tests can't.

    - `[x]` **5.1.a True-race harness**
        - `true-race.ts` spawns the round's workers, holds them at a shared file barrier until all are set up, then
          releases together so the contended writes overlap; `race-worker.ts` is one process performing one guarded
          write, run via `node --import tsx` so it imports the guard primitives from source

    - `[x]` **5.1.b Per-guard smokes**
        - errand ref and sync-state ref: two distinct-key writes both land in the ref tree, no silent drop (D1)
        - two notes for two commits both land under the advisory lock (D4)
        - two first-callers converge on a single persisted machine-id (D3)
- _Outcome:_ Added `__tests__/e2e/{race-worker,true-race,state-ref-race.e2e.test}.ts`. The worker races the genuine
  guard primitives (`writeEntry` / `writeErrandRecord`, the lock + `git notes add`, `getOrCreateMachineId`) as real
  OS processes — the in-process interleave tests prove the catch; this proves real processes race clean. Worker
  loads source via the already-present `tsx` devDep (no new dependency, no extra build step). 5 bounded rounds ×
  2 racers per guard; ~3.3s total.
- _Strategies:_ strategy-testing-methodology.md

### `[x]` **5.2 Add an OS-matrixed CI job for the concurrency/portability suite**

- _Goal:_ The exclusive-create, lock, and liveness primitives — and the true-race smoke — are confirmed on
  `ubuntu` / `windows` / `macos`, so the `wx` / `O_EXCL`, `mkdir`, and `process.kill(pid, 0)` choices are
  CI-verified rather than assumed.

- _Outcome:_ Added a `portability` matrix job (`ubuntu` / `windows` / `macos`, `fail-fast: false`) to
  `.github/workflows/ci.yml`, gated to the reviewed PR lane and rolled into `merge-ok`; the rest of the pipeline
  stays `ubuntu`-only (WSL = Linux syscalls, covered by the `ubuntu` leg — noted in the job comment). It runs a
  new `test:portability` script (root + package) selecting the lock/liveness, D1 CAS, and true-race suites — the
  real-process smoke is what confirms exclusive-create and machine-id convergence on each OS. Cross-OS
  confirmation lands when this WU's PR runs (Windows / macOS aren't reproducible locally).

## **Phase 6:** Verification

### `[x]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

- _Quality gates:_ ARC lints (triggers / domain-rules / section-refs), `lint:ts`, `typecheck:all`, `lint:sh`,
  `lint:md`, `build`, and the full suite (3491 passed, 1 skipped) — all green.
- _Success criteria:_ 8 criteria, all met; the portability criterion carries a deviation note — the `windows` /
  `macos` matrix legs confirm at this WU's PR CI run (not locally reproducible).

---

## Success Criteria

- `[x]` Two racing same-machine writers to the errand ref both land; same for the sync-state ref; the CAS
  rejection path is exercised deterministically and the retry re-reads and re-applies (D1)
- `[x]` A relentlessly-racing write exhausts at `MAX_RECONCILE_ATTEMPTS` (3) and surfaces a typed failure — no
  unbounded loop, no silent drop (D1)
- `[x]` A transient (errored, not absent) reconcile read aborts the reconcile with a typed failure instead of a
  narrowed union; the genuinely-absent case still unions; the advisory fail-open callers are unchanged (D2)
- `[x]` Two racing `runUserSave` note writes both land under the advisory lock; a held lock from a dead pid (or
  past the mtime ceiling) is detected stale and reclaimed; a thrown note-write releases the lock (D4)
- `[x]` Two concurrent machine-id first-callers converge on a single id; an existing `.sync-state.json`
  `machineId` is adopted into `.machine-id` on first run (no re-mint, no orphaned marker key) (D3)
- `[x]` The exclusive-create, lock, and liveness primitives pass on the `ubuntu` / `windows` / `macos` matrixed
  CI job this work adds, including the bounded true-race e2e smoke (portability)
    - _Deviation:_ The `portability` matrix job is in place and its `ubuntu` leg is green (locally and in the
      Tier 3 attestation). The `windows` / `macos` legs run only on GitHub-hosted runners — not reproducible
      locally — so they confirm when this WU's PR opens, at the integrate-work-unit CI gate.
- `[x]` All existing tests green; all quality gates pass (markdown lint, `lint:ts`, `typecheck:all`, `test`,
  `build`); no user-facing or config surface changed
- `[x]` Ready for integration
