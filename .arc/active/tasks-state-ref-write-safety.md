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

### `[ ]` **1.3 Route the direct write legs through the retry frame**

- _Goal:_ Every direct ref write that can lose a same-machine race runs under the retry frame, so neither
  consumer can silently clobber a concurrent writer; the reconcile legs' rejections fold into their existing push
  loops.

    - `[ ]` **1.3.a Errand direct writes**
        - wrap `writeErrandRecord` and `removeErrandRecord` (`lib/errand/record.ts`) in the retry frame; the
          mutation closures are the per-slug `entries.set` / `entries.delete`

    - `[ ]` **1.3.b Sync-state direct write**
        - wrap `writeEntry` (`lib/user-sync/sync-state-ref.ts`) in the retry frame; the mutation closure is the
          per-`machineId` `entries.set`

    - `[ ]` **1.3.c Confirm reconcile-leg rejections fold into the existing push loops**
        - verify a CAS rejection in each `reconcileTrees` local-commit leg surfaces into the surrounding
          `reconcileSyncStatePush` / `reconcileErrandPush` retry loop (already bounded by
          `MAX_RECONCILE_ATTEMPTS`) rather than needing a fresh wrapper
        - each leg keeps its own outcome contract: the errand reconcile carries a `{ kind: "collision" }` /
          `conflict` shape, the sync-state reconcile a `{ kind: "failed" }` shape — a CAS rejection maps into the
          leg's existing shape, not a single shared one

## **Phase 2:** D2 — Reconcile-read failure discrimination

_Purpose:_ Give the sync-state reconcile a read that distinguishes a genuine git failure from a legitimately
absent ref, so a transient errored read aborts the reconcile instead of writing a tree narrowed to this machine's
own key — without disturbing the fail-open advisory callers.

### `[ ]` **2.1 Add a discriminating ref/tree read**

- _Goal:_ The reconcile can tell a genuine git read failure apart from a legitimately absent ref, while every
  existing advisory caller keeps its fail-open null / empty-on-error behavior.

    Build `test-first` (one behavior at a time):

    - the discriminating read reports a genuinely absent ref distinctly from a present ref with entries
    - a git read _failure_ (not an absent ref) is reported as an error, not collapsed to empty
    - the existing `readRefTip` / `readTreeEntries` advisory callers are unchanged (still null / empty on error)

    - add a discriminating reader beside `readTreeEntries` (`lib/git/ref-tree.ts`) — a tagged result
      (`{ kind: "absent" | "entries" | "error" }`) or an exception-throwing variant; the discrimination is opt-in
      at the reconcile call site, not a global change to the fail-open readers
- _Note:_ Whether this ships as a new sibling reader or a tagged-result variant of the existing reader is a
  local-structure choice settled here (spec Open Question); the behavior — distinguish error from absent — is fixed.

### `[ ]` **2.2 Abort the reconcile on a discriminated read error**

- _Goal:_ A transient errored read inside the sync-state reconcile aborts it instead of writing a union tree
  narrowed to this machine's own key.

    Build `test-first` (one behavior at a time):

    - a post-fetch read error in `reconcileTrees` aborts before `writeTreeCommit` and surfaces through
      `reconcileSyncStatePush`'s single `{ kind: "failed" }` channel — no narrowed tree is written
    - a genuinely-absent ref still unions normally (absence is not an error)

    - swap the reconcile reads in `reconcileTrees` (`lib/user-sync/sync-state-merge.ts`) to the discriminating
      read; on an `error` result abort, propagating to the existing `{ kind: "failed" }` outcome. The errand
      reconcile is out of scope — D2 is the sync-state reconcile only

## **Phase 3:** D3 — Machine-id exclusive create-if-absent

_Purpose:_ Replace `getOrCreateMachineId`'s read→generate→write TOCTOU with a dedicated `.machine-id`
exclusive-create file, so concurrent first-callers converge on one id; adopt a legacy `.sync-state.json`
`machineId` once so an established machine identity is never orphaned.

### `[ ]` **3.1 Dedicated `.machine-id` exclusive-create store with EEXIST read-back**

- _Goal:_ Concurrent first-callers on one machine converge on a single machine-id — the create winner's — instead
  of each minting and persisting a different UUID.

    Build `test-first` (one behavior at a time):

    - a first-caller with no `.machine-id` mints a `randomUUID()` and persists it via an exclusive create
    - a concurrent caller that loses the exclusive create (`EEXIST`) reads the file and returns the winner's id —
      both callers return the same id
    - a later call returns the persisted id without minting (idempotent)

    - add a dedicated `.machine-id` file under `user/{identity}/.internal/` holding the bare UUID; first-write
      uses Node `writeFile` with the `wx` flag (`O_CREAT | O_EXCL`)
    - on `EEXIST`, read the file to adopt the winner's id
- _Strategies:_ strategy-storage-evolution.md
- _Note:_ The `wx` create needs a net-new write seam — the existing `atomicWriteJson` (temp-then-rename) and
  `io.writeFile` can't express `O_EXCL`, so this adds a direct exclusive-create path (likely a new `CoreIO`
  method). The `.machine-id` filename is a naming particular settled here (spec Open Question); the behavior is fixed.

### `[ ]` **3.2 One-time migration adopt of a legacy `.sync-state.json` `machineId`**

- _Goal:_ A machine that already minted an id under the old `.sync-state.json` keeps it — the existing id migrates
  into `.machine-id` rather than a fresh mint orphaning its sync-state marker key.

    Build `test-first` (one behavior at a time):

    - on a `.machine-id` miss, an existing `.sync-state.json` `machineId` is adopted and written into
      `.machine-id` (via the same exclusive-create race), not re-minted
    - with neither store present, a fresh id is minted exactly as today
    - after migration the `.sync-state.json` `machineId` is read-tolerated only — never written back

    - perform the migration read before minting in `getOrCreateMachineId` (`lib/user-sync/sync-state.ts`); route
      the adopted id through the same exclusive-create path so concurrent migrators converge on one

### `[ ]` **3.3 Repoint the machine-id schema; stop writing `machineId` to the sync-state record**

- _Goal:_ `.machine-id` is the single canonical store — the sync-state record stops carrying the id on write,
  while old records stay parseable for the one-time adopt.

    - `[ ]` **3.3.a Repoint the readers/writers at `.machine-id`**
        - point `getOrCreateMachineId`, `readPersistedMachineId`, and the `machineId` carry-forward in
          `writeLocalSyncState` (`lib/user-sync/sync-state.ts`) at `.machine-id`

    - `[ ]` **3.3.b Stop writing the `LocalSyncState.machineId` field**
        - drop `machineId` from records written by `writeLocalSyncState` / `clearPartialPushMarker` /
          `clearErrandPartialPushMarker`; keep it parseable on read solely for the migration adopt. No version
          bump — the field was additive / optional, and its absence on new writes is already tolerated
- _Strategies:_ strategy-storage-evolution.md

## **Phase 4:** D4 — User-notes write lock

_Purpose:_ The notes ref can't take a CAS, so serialize instead — a portable per-identity advisory lock around the
smallest span of `runUserSave` that contains the `git notes add` read-modify-write. Git keeps owning the notes
format; only the write is serialized.

### `[ ]` **4.1 Portable per-identity advisory lock primitive**

- _Goal:_ A cross-platform advisory lock serializes a per-identity critical section, reclaiming a lock held by a
  dead or hung process without deadlocking or dropping a live holder's lock.

    Build `test-first` (one behavior at a time):

    - acquiring an uncontended lock creates the lockfile recording the holder's pid and mtime
    - a second acquirer retries with bounded backoff while the lock is held-and-live, then proceeds once it frees
    - a lock whose recorded pid is no longer alive (`process.kill(pid, 0)` throws `ESRCH`) is detected stale and
      reclaimed; a lock past the generous mtime ceiling is likewise reclaimed (pid-reuse / liveness-edge backstop)
    - two processes breaking a stale lock concurrently converge on one holder (the break is itself raced through
      the same exclusive create)
    - release frees the lock, and a release verifies ownership so it never drops another holder's lock

    - implement an exclusive-create lockfile (Node `wx` / `O_EXCL`, or `mkdir`-based) under
      `user/{identity}/.internal/` (e.g. `.notes.lock`), recording the holder pid + write mtime
    - stale detection: pid-liveness primary (`process.kill(pid, 0)`), mtime-ceiling backstop
- _Note:_ The `O_EXCL` create here is the same primitive D3's `.machine-id` create rests on — reuse the
  exclusive-create seam from that task rather than reimplementing it. The concrete mtime ceiling, acquire-backoff
  timing, and lockfile encoding are tuning / format particulars settled at implementation against the test matrix
  (spec Open Questions), not design decisions.

### `[ ]` **4.2 Serialize `runUserSave`'s note-write critical section under the lock**

- _Goal:_ Two racing same-machine `runUserSave` note writes both land instead of one silently overwriting the
  other, with the lock released even when the note write throws.

    Build `test-first` (one behavior at a time):

    - two racing `runUserSave` writes for different commits both produce notes (no collapse to one)
    - a thrown note write releases the lock (acquired in a `try`, released in `finally`) so the next acquirer
      proceeds

    - wrap the smallest span of `runUserSave` (`commands/user/save-load.ts`) that contains the `git notes add`
      read-modify-write — the recent-notes read, removal-tombstone apply, and `io.writeNote` — in
      acquire / `finally`-release
- _Note:_ The lock guards only the cold, human-invoked save path; no measurable cost on the common automatic paths.

## **Phase 5:** True-race e2e smoke & cross-platform portability

_Purpose:_ Add the hybrid harness's empirical tier — a bounded number of rounds spawning real concurrent writers
against a temp git repo, per guard — and confirm the exclusive-create / lock / liveness primitives behave across
the Windows / WSL / Mac CI matrix.

### `[ ]` **5.1 Bounded true-race e2e harness and per-guard smokes**

- _Goal:_ Real concurrent processes racing each guard against a temp git repo land both writes (and agree on the
  machine-id), giving the empirical backstop the deterministic interleave tests can't.

    - `[ ]` **5.1.a True-race harness**
        - an e2e helper spawning a fixed, bounded number of rounds of real concurrent writers against a temp git
          repo; bounded so the suite stays fast and flake-free

    - `[ ]` **5.1.b Per-guard smokes**
        - errand ref and sync-state ref: both racing writes land, no silent drop (D1)
        - two racing `runUserSave` note writes both land (D4)
        - two machine-id first-callers agree on a single id (D3)
- _Strategies:_ strategy-testing-methodology.md

### `[ ]` **5.2 Add an OS-matrixed CI job for the concurrency/portability suite**

- _Goal:_ The exclusive-create, lock, and liveness primitives — and the true-race smoke — are confirmed on
  `ubuntu` / `windows` / `macos`, so the `wx` / `O_EXCL`, `mkdir`, and `process.kill(pid, 0)` choices are
  CI-verified rather than assumed.

    - add a dedicated matrixed job to `.github/workflows/ci.yml` running the new deterministic and true-race
      suites across `ubuntu-latest` / `windows-latest` / `macos-latest`
    - resolve any platform-specific behavior in the primitives, not by narrowing assertions
- _Note:_ The existing CI jobs stay `ubuntu`-only — generalizing the OS matrix across the whole pipeline is out of
  this WU's scope. GitHub-hosted runners are `ubuntu` / `windows` / `macos`; WSL is Linux syscalls,
  covered-by-proxy by the `ubuntu` runner — the load-bearing axis is `windows` vs `ubuntu`.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Two racing same-machine writers to the errand ref both land; same for the sync-state ref; the CAS
  rejection path is exercised deterministically and the retry re-reads and re-applies (D1)
- `[ ]` A relentlessly-racing write exhausts at `MAX_RECONCILE_ATTEMPTS` (3) and surfaces a typed failure — no
  unbounded loop, no silent drop (D1)
- `[ ]` A transient (errored, not absent) reconcile read aborts the reconcile with a typed failure instead of a
  narrowed union; the genuinely-absent case still unions; the advisory fail-open callers are unchanged (D2)
- `[ ]` Two racing `runUserSave` note writes both land under the advisory lock; a held lock from a dead pid (or
  past the mtime ceiling) is detected stale and reclaimed; a thrown note-write releases the lock (D4)
- `[ ]` Two concurrent machine-id first-callers converge on a single id; an existing `.sync-state.json`
  `machineId` is adopted into `.machine-id` on first run (no re-mint, no orphaned marker key) (D3)
- `[ ]` The exclusive-create, lock, and liveness primitives pass on the `ubuntu` / `windows` / `macos` matrixed
  CI job this work adds, including the bounded true-race e2e smoke (portability)
- `[ ]` All existing tests green; all quality gates pass (markdown lint, `lint:ts`, `typecheck:all`, `test`,
  `build`); no user-facing or config surface changed
- `[ ]` Ready for integration
