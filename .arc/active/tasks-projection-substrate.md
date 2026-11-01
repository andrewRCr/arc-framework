# Task List: Projection Substrate

- **Design:** `spec-projection-substrate.md`

---

## **Phase 1:** The ignore strategy

_Purpose:_ Keep every path the projection writes ignored and searchable before anything is written there, and land the
two ignore changes that go live before the flip.

_Mode:_ `layer` — closes on the ignore layer: every projected root and the aside folder ignored by a rule the guard
reads, and ARC's managed `.ignore` block written by the setup verbs.

_Exit criterion:_ The guard refuses a projected root no rule ignores and an `.arc/user/*/` rule outside `.gitignore`,
and passes once the line is restored; `arc init` (with `--reconfigure`), `join`, and `update` write the managed
`.ignore` block and keep a repository's own lines; and in this repository, once its block is written,
`rg --files .arc/user` lists the files under `.arc/user/<identity>/`.

_Design decisions:_ This list is the first of three members' that build one design (spec § 1.1, § 1.3):
`projection-write-back` builds on it, and `projection-worktrees` on both. `seam-lifecycle`, `seam-locus`, and
`storage-ref-backend` have shipped, so every part that consumes one of them finds it on base. Tests run at the unit and
integration tiers over the in-memory reference backend (`__tests__/helpers/store/`) and real temporary repositories,
since no CLI process runs over a store before the flip (§ 1.5).

### `[x]` **1.1 Write the exclude entries as one path list derived from the shared projected roots — § 11.1**

- _Goal:_ One Git call and one write register every exclude entry the projection needs, from one list of projected roots
  that nothing keeps by hand, and every other reader of those roots takes the same list.

    - `[x]` **1.1.a Generalize the exclude writer to a path list**

        - `ensureGitExcludePatterns(root, patterns, exec, fs)` in `lib/git/exclude.ts` makes one
          `git rev-parse --git-path info/exclude` call, one read, and at most one write, appending in order each pattern
          not yet present and writing nothing when every pattern is; `ensureGitExcludePattern` is its one-element call,
          so `writeEditorDocuments` and `ensureWorktreeMarkerIgnored` keep their calls unchanged. Covered in
          `unit/git/exclude.test.ts`.

    - `[x]` **1.1.b The projected roots and the exclude list**

        - `lib/layout/projected-roots.ts` adds the two forms beside the roots it names once: `projectedRootPaths`, each
          root as the path for one identity, and `projectedRootPatterns`, each as the directory pattern ignoring it for
          every identity, `.arc/user/*/` for the personal root; both and `PROJECTED_LIFECYCLE_PATTERNS` export through
          the layout index. `unit/layout/projected-roots.test.ts` pins each shared root to the path `resolveArcPath`
          gives, the backlog root as the one parent of the `planned` and `provisional` roots and the project inbox.
        - `lib/store/projection/` opens with its README and `excludes.ts`: `projectionExcludePatterns`, the three shared
          roots' patterns plus `.arc/system/.local/` (`PROJECTION_LOCAL_ROOT`), and no personal root; nothing calls it
          before the flip. Its tests sit under `store/projection/` at the unit and integration tiers, the latter
          showing a check's worktree capture staging nothing under those roots once the list is written.

### `[x]` **1.2 Guard the projected roots with one `git check-ignore` call — § 11.2**

- _Goal:_ The projection never writes into a root that no rule ignores: one Git call proves every projected root and the
  aside folder ignored, `.arc/user/*/` by `.gitignore` itself, and a refusal names the missing line and clears once it
  is restored.

    - `[x]` **1.2.a The call and its verdict**

        - `guardProjectionIgnores` (`lib/store/projection/ignore-guard.ts`) runs one
          `git check-ignore -z -v --non-matching --no-index --stdin` through `GitExecInput` over the identity's four
          projected roots and the aside folder, `PROJECTION_ASIDE_ROOT` in the new `paths.ts`, which
          `PROJECTION_LOCAL_ROOT` moved into. Exit status 1 is read from the failure's `stdout`; any other failure, or
          output that does not answer every path, refuses every root as `guard-failed` with the rerun remedy. A
          `not-ignored` refusal names each path, its line, and the file it belongs in, and the personal root passes
          only on a `.gitignore` on its path.
        - A pass returns `info/exclude` in the common Git directory, every `.gitignore` above a guarded path, present or
          not, and each match's source, as absolute paths without duplicates.
        - On Git 2.55 a directory a `!` pattern re-includes answers with an empty source, as an unmatched path does,
          for every negation form tried; the arm reading a `!` pattern as not ignored, which Git returns for a file
          path, stays as § 11.2 states, though no guarded directory reaches it. Covered in
          `integration/store/projection/ignore-guard.test.ts`.

### `[x]` **1.3 Write ARC's managed `.ignore` block through the setup verbs — § 11.3**

- _Goal:_ Every repository the setup verbs run in carries a tracked root `.ignore` whose ARC block re-includes the four
  projected roots for ripgrep-family search, keeping the repository's own lines.

    - `[x]` **1.3.a The block and its writer**

        - `writeArcIgnoreBlocks` (`lib/template/files.ts`) writes both managed blocks through `writeArcManagedBlock`:
          `.gitignore`'s from one entry list, its personal-root line now read as `PROJECTED_PERSONAL_PATTERN`, plus the
          caller's skill directories, and `.ignore`'s as each `projectedRootPatterns` entry negated — `!.arc/active/`,
          `!.arc/backlog/`, `!.arc/completed/`, and `!.arc/user/*/`. Unit cases sit in `unit/template/files.test.ts`;
          `integration/template-ignore-blocks.test.ts` shows a check's worktree capture still staging nothing under
          `.arc/user/<identity>/`.

    - `[x]` **1.3.b The four verbs**

        - `arc init`, `runJoin` and `runJoinReconfigure`, `runReconfigure`, and `arc update` each call
          `writeArcIgnoreBlocks` with their skill directories in place of their inline `.gitignore` lists, so every one
          writes the `.ignore` block, live whatever the store's capability. Each verb's suite gains its case, sharing
          `__tests__/helpers/arc-ignore-block.ts`; `e2e/update.e2e.test.ts` shows `arc update` leaving an unchanged
          `.ignore` byte-identical and rewriting only the block over an edited one.

### `[x]` **1.4 Stop ignoring `.ignore` in this repository and write its managed block — § 11.5, § 11.3**

- _Goal:_ This repository tracks a root `.ignore` holding exactly ARC's managed block, and its `.gitignore` no longer
  ignores `.ignore`.

- _Outcome:_ The `.gitignore` drops its `# Marksman LSP exclusions` comment and `.ignore` line, and the tracked root
  `.ignore` is byte-identical to the block `writeArcIgnoreBlocks` writes into an absent file; the primary's untracked
  copy stays for 4.3. Checked by hand with ripgrep 14.1.1 in this worktree: `rg --files .arc/user` lists the eleven files
  under `.arc/user/andrew/` beside `.arc/user/README.md`, where with `--no-ignore-dot` it lists `README.md` alone.

## **Phase 2:** The engine's state

_Purpose:_ Build what each worktree records about its copy and how a command tells an edited file from one it wrote,
the substrate every later phase reads.

_Mode:_ `layer` through Phase 3 — closes on the file substrate: what each worktree records, how it detects an edit,
and how it replaces and removes a file without losing a save.

_Design decisions:_ 2.5 comes before 2.4, since change detection hashes through 2.5's blob ids over the content its
stamp parsing strips (§ 3.3, § 3.4).

### `[x]` **2.1 Run the projection's tests in the portability tier — § 13**

- _Goal:_ Every test of a `lib/store/projection/` module runs in the portability tier, Phase 1's guard and exclude list
  included — on Linux in the `portability` job of each reviewed pull request not classified light, and on Windows and
  macOS in the cross-platform pair, which CI runs on its weekly schedule and on a dispatch with `run_portability_pair`.

- _Outcome:_ `PORTABILITY_SUITES` gains `store/projection/`, which `vitest list` resolves to exactly the projection's
  three test files; `unit/vitest-controller-logic.test.ts` walks every test file and holds the tier to all of them and no
  other, where `projection` alone selects nineteen more. `PORTABILITY_SURFACE_GLOBS` gains
  `src/lib/store/projection/*` and `__tests__/*/store/projection/*`, which also covers 2.9's helpers. Dispatching the
  pair stays 3.5's.

### `[x]` **2.2 The index, the aside folder, and where they live — § 3.1, § 5.4, § 12.9**

- _Goal:_ Each worktree that holds a projection keeps one machine-local index recording what the projection wrote
  there, written whole under the projection lock, and one aside folder beside its files; a command finds both without a
  Git process, never creates a Git directory, and tells an index it can use from one it cannot.

    - `[x]` **2.2.a The index's schema**

        - `ProjectionIndexSchema` in `lib/store/projection/index-schema.ts`, every object strict and `format` the build's
          literal, so a field it does not know or another format version fails the parse. Entries are keyed by
          repository-relative path (validated, not branded) and discriminate `record` from `ownerless`; stat fields
          decode from decimal strings to bigints through a codec; an ignore file is its stat and blob id or both null.
          The owner's UID rides in the record reference's owner. Covered in `unit/store/projection/index-schema.test.ts`.

    - `[x]` **2.2.b Where the index lives, found without Git**

        - `locateProjection` (`lib/store/projection/location.ts`) reads the Git directories through `readGitDirectories`
          and the primary as the checkout whose `commonDir` is its `gitDir`; where that reader throws, it runs
          `resolveCheckoutGitDir` once and reads `commondir` through `readCommonDirectory`, now its own export of
          `lib/git/directories.ts`. `ensureProjectionStateFolder` makes `arc-projection/` non-recursively, reading
          `ENOENT` as `gone`; `writeProjectionIndex` (`index-file.ts`) writes through `atomicWriteFile`'s new
          `createParents: false`. `MACHINE_LOCAL_PATHS` gains `arc-projection/**` under `git-worktree`. Covered in
          `integration/store/projection/location.test.ts` and `unit/lib/store/registry.test.ts`.

    - `[x]` **2.2.c The aside folder and its names**

        - `nameAsideFile` (`lib/store/projection/aside.ts`) places a copy or staged file under
          `.arc/system/.local/projection/aside/`, mirroring its path below `.arc/`, named
          `<base blob id>.<pid>-<instance>-<scope digest>.<nonce>.<role>` with a 16-hex `processScopeDigest` and nonce;
          it refuses a path outside `.arc/` or in the aside folder and an instance a name cannot hold. `parseAsideFile`
          reads a location back, and `createStagedFile` creates one exclusively. `listArcFiles` skips `system/.local/`,
          and `MACHINE_LOCAL_PATHS` gains the `checkout` entry. Covered in `unit/store/projection/aside.test.ts`,
          `unit/fs.test.ts`, and `unit/lib/store/registry.test.ts`.

    - `[x]` **2.2.d An index a command cannot use**

        - `readProjectionIndex(location, holdsProjection)` (`index-file.ts`) returns the index, `no-projection` for a
          missing index where the checkout holds none, or `unusable` with cause `missing`, `unreadable` (a failed read,
          bad JSON, or a failed strict parse), or `other-format`, told apart by reading `format` before the strict parse.
          An index a checkout holding no projection still holds reads as any other. Covered in
          `unit/store/projection/index-file.test.ts`.

- _Outcome:_ The writer and reader take no lock of their own; the projection lock (2.3) is what puts each index write,
  and the re-read after it is taken, under the lock.

### `[x]` **2.3 The projection lock — § 3.2**

- _Goal:_ One per-worktree advisory lock serializes the projection's reads and writes in each worktree; a command holds
  at most one at a time, waits 200 ms for a sibling's and skips it, never creates the Git directory of a worktree that
  is gone, and reports the holder of a lock it could not take.

- _Outcome:_ `withProjectionLock` (`lib/store/projection/lock.ts`) takes `arc-projection/lock` through a create seam
  with no `mkdir`, the same seam and reader passed to the lease's renewal and release, and returns `done`, `held` with
  the holder `onWait` last saw, `gone`, or `lost` with the lease's report; a lost lease marks the session, whose next
  `step` ends the operation, and never terminates the process. `isAdvisoryHolderAbandoned` (`lib/advisory-lock.ts`) is
  the reclaim rule, now what `isMainLockBreakable` applies. Callers pass `SIBLING_LOCK_WAIT_MS` or leave the default.

### `[x]` **2.5 Blob ids, the configuration read, and the base stamp — § 3.4, § 15.3**

- _Goal:_ The projection computes both sides of every content comparison itself — Git blob ids in the repository's
  object format over LF-normalized content with the stamp and notice lines stripped — reads identity, its settings,
  and the object format in one Git call, and keeps each base's record version beside its blob id.

    - `[x]` **2.5.a Blob ids**

        - `gitBlobId(content, format)` (`lib/store/projection/blob-id.ts`) hashes `blob <length>\0` plus the UTF-8
          bytes with `node:crypto`, matching `git hash-object` in both formats; `storedBlobId` hashes a file's content as
          stored, CRLF read as LF and, for Markdown only, the stamp and notice lines stripped through `parseStampedFile`.
          Covered in `integration/store/projection/blob-id.test.ts`, with 2.5.c's person's-comment clause.

    - `[x]` **2.5.b The one configuration read**

        - `readProjectionConfiguration` (`lib/store/projection/configuration.ts`) makes the one `--get-regexp` call and
          returns the object format, the raw `arc.inflightView` and `arc.inflightPin` values, and identity — identified,
          or `no-identity` with cause `unset` or `invalid` and the remedy setting `arc.identity`; `parseConfigurationRecords`
          reads a valueless key as `null`. `resolveIdentityFromValues` (`lib/git/identity.ts`) is the one identity rule,
          which `readConfiguredIdentity` and `resolveIdentity` now call. Covered in
          `integration/store/projection/configuration.test.ts` and `unit/git/identity.test.ts`.

    - `[x]` **2.5.c The base stamp and notice lines**

        - `renderStampedFile` and `parseStampedFile` (`lib/store/projection/stamp.ts`) work over the file's lines, so a
          round trip is exact: the stamp on line one, or after a frontmatter block closed by a `---` line, then the notice
          block, each notice one line `<!-- arc-notice: … -->`; parsing reads CRLF as LF, and a file whose stamp is not
          there is stampless and whole. Rendering refuses a stamp that is no blob id and a notice a comment cannot hold.
          A person's comment staying in the blob id is covered with 2.5.a. Covered in `unit/store/projection/stamp.test.ts`.

- _Outcome:_ Each base's record version sits beside its blob id in the index entry's `base` (2.2.a). Run c, a, b, since
  a's stripping goes through c's module.

### `[x]` **2.4 Detect a change by Git's racy rule — § 3.3, § 11.2**

- _Goal:_ A file reads clean only when its stat matches its entry and its modification time is older than the index's
  reference; anything else is hashed, so no same-tick save reads as unchanged and no later index write hides one — and
  the guard's recorded ignore-file stats obey the same rule.

- **Additional Context:** `notes-projection-substrate.md` § Spike 3, `notes-projection-worktrees.md` § Spike 2

    - `[x]` **2.4.a The reference and the rule**

        - `checkChange` (`lib/store/projection/change-detection.ts`) answers `absent`, `clean`, `hashed-clean`, or
          `changed` with the blob id, hashing the raw bytes against the entry's `written`; `readStat` reads a bigint
          `lstat`, and `readReference` the stamp's modification time, null where missing. The reference's rewrite after
          each index write is the index commit's, with smudging (2.4.b). Covered in
          `unit/store/projection/change-detection.test.ts`.

    - `[x]` **2.4.b Smudging**

        - `commitProjectionIndex` (`index-file.ts`) smudges, writes the index, and rewrites the reference;
          `smudgeRacyEntries` zeroes the size of each entry and ignore-file record it carries over with a modification
          time at or past the reference it replaces, sparing what `RecordedAfresh` names, and a size of zero for content
          not empty never stat-cleans. `recordCleanStat` re-records a file that hashed clean. `ignore-snapshot.ts`
          snapshots a pass's ignore files and answers `changed` or `unchanged`, reading an ignore file through a symbolic
          link as Git does. Covered in `unit/store/projection/smudging.test.ts` and `ignore-snapshot.test.ts`.

### `[x]` **2.6 Recover a lost base stamp — § 3.5**

- _Goal:_ A file whose stamp was deleted or dropped by a whole-file rewrite merges from the right base — an exact
  version, else the closest candidate, else empty — reading `history` only where it must, once per record between the
  write-backs the command lands to it.

- _Outcome:_ `recoverBase` (`lib/store/projection/base-recovery.ts`) answers a stored version, a kept copy, or an empty
  base, reading the content taken in from the entry's `persisted` field and a copy through a reader 2.7 binds; the
  index's version is matched by blob id with no `history` read. `createHistoryMemo` keeps one whole answer per record,
  refusals included, until `drop`; a refusal is returned for 2.9's arm. Covered in
  `unit/store/projection/base-recovery.test.ts`.

### `[x]` **2.7 Keep what a persisted write-back took in — § 3.6**

- _Goal:_ A save carrying the stamp the file's last persisted write-back read merges from what that write-back took in,
  so an editor that never reloads cannot undo what the person changed since.

- _Outcome:_ `recordWriteBack`, `restoreEntryIds`, and `selectPersistedBase` (`lib/store/projection/taken-in.ts`); copies
  live in `arc-projection/taken-in/`, and a recording returns the copies it releases, removed once the index that stops
  naming them is written. `insertEntryId` is exported from `lib/store/concurrency/stamp.ts`, and 2.6's line comparison
  as `lineDistance`. A file other than Markdown compares a copy with the version the read-back laid, its entry's base.
  Covered in `unit/store/projection/taken-in.test.ts`.

### `[x]` **2.8 Files other than Markdown — § 3.7**

- _Goal:_ A text file of any kind in a projected root carries no stamp and keeps its base in its index entry alone, and
  old content a stopped replacement left reads as unedited, never written back over the newer version.

- _Outcome:_ `readStamplessFile` and `deleteAsideCopy` (`lib/store/projection/stampless.ts`) over 2.2.a's `inProgress`
  and `copies` fields, which the swap and the rebuild set in Phase 3. Content matching neither version takes the
  replaced version on a tie, so a tie never merges from the newer one over it, and a `history` refusal is returned for
  2.9's arm. Covered in `unit/store/projection/stampless.test.ts`.

### `[x]` **2.9 A seeded projection, a wrapping store for tests, and the `history` refusal's arms — § 3.5, § 3.7**

- _Goal:_ Tests of Phase 3 and of `projection-write-back` start from a real projection — stamped files and a matching
  index — before full materialization (`projection-worktrees`) exists, so no test hand-builds index entries, and one
  test store returns the `history` refusal the reference backend cannot, over which recovery's and a stopped
  replacement's arms for that refusal are built.

- _Outcome:_ `seedProjection` and `createHistoryRefusingStore` (`__tests__/helpers/store/projection/`), the latter
  counting every operation so a test shows nothing was pulled or sent. Under the refusal, recovery takes a kept copy
  sharing a non-blank line with the file, else a version the write landed, being the older base, else the index's
  version; a `stored` result no longer carries content, since the store merges from its own. `readStamplessFile`
  answers `pending` with the refusal. Covered in `unit/store/projection/history-refusal.test.ts` and
  `integration/store/projection/seeded-projection.test.ts`.

## **Phase 3:** Reading and replacing

_Purpose:_ Read an edit only once its save has settled, and replace, rebuild, or remove a projected file without
losing a save timed into the move.

_Exit criterion:_ On Linux and in a dispatched run of the portability pair, saves timed into a replacement — in place
and by renaming a new file over the path — lose none, a copy whose path moved on kept and reported, an absent file is
rebuilt by the link alone and yields to a save that recreated it, a removal takes an edit in first, and the next
command's sweep takes over the copies a stopped command left.

### `[x]` **3.1 Read an edit only once it has settled — § 4, § 3.7**

- _Goal:_ Write-back never reads a file mid-save: an empty file is never read as an edit while a save may still be
  writing it, and a file modified within the last 50 ms is read only once two stats 15 ms apart agree, else at the
  next command.

- _Outcome:_ `gateRead` (`lib/store/projection/read-gate.ts`) judges a file by `lstat` alone over an injected clock,
  stat, and sleep, the system's by default. A file not regular — a folder as well as a link, since reading one fails or
  blocks — reads as a deleted file with the remedy naming its path. The emptied file's replacement lands with the swap
  (3.2). `stampless.ts` takes the gate's window and clock. Covered in `unit/store/projection/read-gate.test.ts`.

### `[x]` **3.2 Replace a file by the swap behind the replace guard — § 5.1, § 5.2, § 5.3**

- _Goal:_ Every replacement re-checks its file by the racy rule, takes an edit in first, and replaces by moving the old
  file aside and linking the new one in, so a save timed into the replacement lands in the aside copy rather than being
  lost, and every way the swap can end leaves the index telling the truth.
    - _Amended in:_ 3.R (A1)

- **Additional Context:** `notes-projection-substrate.md` § Spike 1, § Spike 1b, § Spike 7

    - `[x]` **3.2.a The replace guard and the take-in port**

        - `guardReplacement` (`lib/store/projection/replace-guard.ts`) over `take-in-port.ts`'s port and
          `staging.ts`'s staged file; the copy rules, the sent mark, and the one per-copy step the second check and the
          sweep call, `settleAsideCopy`, in `aside-copies.ts`. Each port answer returns the entry as the take-in left
          it, the index staying in memory until the batch writes it; `taken-in` means landed whole and carries what it
          read, the next pass's baseline, and `refused`/`unparseable` carry the mark the guard records. A pass that
          takes an edit in on the third re-check stops there, pending. The batch's first index write records each copy
          from the guard's `moving` (3.2.b), and each link-back reads its copy by `lstat` first where it is built (3.2.b,
          3.2.c, 3.3). Covered in `integration/store/projection/replace-guard.test.ts` and `aside-copies.test.ts`.

    - `[x]` **3.2.b The swap and its outcomes**

        - `swapBatch` (`lib/store/projection/swap.ts`) over the guard's decisions: the first index write records the
          staged file's stat, which the path shares once linked, so the second write clears pending by that identity;
          the first check is `checkAsideCopy`, which takes an edit in and deletes nothing. A link failing otherwise links
          the copy back and removes its aside name. Staging stages a protected file read-only, the guard's restage
          included. Removals and a path-keyed companion join the batch in 3.4. Covered in
          `integration/store/projection/swap.test.ts`.

    - `[x]` **3.2.c The second check and a refused copy**

        - `runSecondCheck` (`lib/store/projection/second-check.ts`) settles each copy the batches made that the index
          still records, then writes the index. `putBack` (`aside-copies.ts`) returns a refused, unparseable, or clashed
          copy to a path that has not moved on — swapped back, its replacement recorded as a copy holding what its swap
          moved, or linked back — and otherwise keeps it aside, reported with its path; the swap's first check puts such
          a copy back too. The swap's rename and link moved to `aside-moves.ts`, which the put-back shares. A
          replacement made at the second check waits for the next sweep. Covered in
          `integration/store/projection/second-check.test.ts` and `swap.test.ts`.

### `[x]` **3.3 Sweep the aside folder — § 5.4**

- _Goal:_ Every command's sweep takes over the copies and staged files an exited writer left, without losing one and
  without touching a live writer's.

- **Additional Context:** `notes-projection-substrate.md` § Spike 7

- _Outcome:_ `sweepAsideFolder` (`lib/store/projection/sweep.ts`) runs `checkIgnores` (`ignore-check.ts`) first, then
  takes over an exited writer's recorded copies — a gone copy's record dropped, a link deleted, an absent unmoved path's
  copy linked back, every other settled through `settleAsideCopy` — deletes its staged files, and returns a swap back's
  replacements for the second check. A copy the index does not record is deleted only where it equals its base, and
  otherwise kept and reported. `checkIgnores` reads each ignore file a pass rests on, and each the last pass recorded,
  before the call and again after, reading again where they disagree, so an edit landing while Git reads never becomes
  the skip's baseline; the order was this task's to set, so it took no amendment. Covered in
  `integration/store/projection/sweep.test.ts` and `ignore-check.test.ts`.

### `[x]` **3.4 Rebuild an absent file and remove a file — § 5.5, § 5.6**

- _Goal:_ An absent file is rebuilt by the link alone, yielding to a save that recreated it, and a file whose record
  left this projection is removed only after its edit is taken in, a refused edit going back to its path.

- _Outcome:_ A removal is a `swapBatch` file whose guard staged nothing (`staged: null`): the swap (`swap.ts`) moves
  it aside and checks its copy, links nothing, and keeps its entry absent and pending. `dropRemovedEntries` drops the
  entry once the file and the last copy of its path are gone, at the batch's second write and at the second check,
  except at a path the projection now lays another record at. The sweep never drops one, so a copy it links back waits,
  pending, for the refresh. The replace guard leaves a withheld file as it is before anything reads it, for a
  replacement as for a removal, since nothing writes over or sends one. The rebuild landed with 3.2. Covered in
  `integration/store/projection/removal.test.ts` and `replace-guard.test.ts`.

### `[x]` **3.5 Hold saves timed into a replacement in a save-loss harness — § 5.2, § 13**

- _Goal:_ Saves timed into the engine's own replacement, rebuild, and removal lose none on Linux and in a dispatched
  run of the portability pair, with evidence that every targeted interval was reached — what closes this layer.
    - _Amended in:_ 3.R (A1)

- **Additional Context:** `notes-projection-substrate.md` § Spike 1, § Spike 1b, § Spike 3

- _Outcome:_ `integration/store/projection/save-loss.test.ts` places a save at each interval through the swap's step
  hooks (19 tests), and fires 1,000 saves per mode from a worker thread into back-to-back commands as ten tests of 100,
  the per-copy `gate` seam threaded through the swap, second check, and sweep so the harness settles in 1 ms. A
  truncating save's empty window is capped at the 19 ms editor window Spike 3 measured, and a loss whose window passed
  § 4's 50 ms bound counts as "emptied past the settle window", reported apart from a loss, which fails the run with its
  timeline. Run 41274229274 at `730e04d2a3`, the pair dispatched, passed on Windows and macOS: none lost or emptied past
  the window, every placed outcome reached, and the second check's rescue reached by truncate-then-write on both.

### `[x]` **3.R Keep an emptied aside copy for the next command's sweep — § 5.2, § 17**

- _Goal:_ An aside copy empty at its writer's second check waits in the aside folder for the next command's sweep, so a
  save that truncated the file before its move and writes late is settled there rather than lost (A1).

    - `[x]` **3.R.a The second check leaves an empty copy**

        - `runSecondCheck` (`lib/store/projection/second-check.ts`) keeps a copy that is an empty regular file as `kept`
          whose `answer` is `empty`, before `settleAsideCopy` reads it, so it is neither sent nor deleted; the sweep's
          step is unchanged. Covered in `integration/store/projection/second-check.test.ts`, Markdown and not, and
          `removal.test.ts`, where the next sweep links a removal's copy back holding the late write.

    - `[x]` **3.R.b Count a save emptied past the settle window as lost**

        - The harness's "emptied past the settle window" outcome is retired, so a save left empty that long, unless
          taken in or kept, fails the run with its timeline, and a placed save that truncates before the move and
          stalls past the window across the second check is taken in at the next sweep. It passed on Linux, and run
          41308156361 at `4729a849c4`, the pair dispatched, passed on Windows and macOS: none lost, and the stalled save
          reached on both.

## **Phase 4:** The worktree lock

_Purpose:_ Land the worktree lock live before the flip, with the removals printed or documented that it changes, so ARC
removes a work item's checkout only through the removal function.

_Mode:_ `slice` — closes on the live worktree lock: every checkout ARC spawns for a work item locked, removed only
through the removal function, and locked again after a failed retirement.

_Exit criterion:_ Before the flip, a spawned checkout carries `PROJECTION_LOCK_REASON`, or keeps a lock another tool set
first, reported; under `PROJECTION_LOCK_REASON` a plain `git worktree remove` refuses it naming the exits, the removal
function removes it or, failing after its unlock, locks it again, and a move keeps it; and an `arc start --here`
checkout carries none.

_Design decisions:_ `PROJECTION_LOCK_REASON` (`lib/git/worktree-removal.ts`) is `seam-lifecycle`'s, and nothing locks
with it before 4.1.b, which gives it a value naming the exits, since Git prints it in its refusal (§ 12.1). Until
`projection-worktrees` fills the slots they pass, so the removal function runs its Git part alone (§ 1.4), and a
refusing slot is injected where a test needs one. The lock tasks follow Phase 3, but for clearing the primary's
`.ignore` (4.3), which waits until just before landing. No one-off pass locks the existing worktrees: each takes the
lock when it is next spawned, and `storage-cutover` locks any left before the flip (§ 12.7).

### `[x]` **4.1 Lock each checkout ARC spawns for a work item — § 12.1, § 12.4, § 12.5**

- _Goal:_ Every linked checkout ARC spawns for a work unit or an Errand carries `git worktree lock` with
  `PROJECTION_LOCK_REASON` once its spawn has succeeded, before the flip as after, but for one another tool already
  locked, which keeps that lock, reported; an anchored checkout carries none; and every removal ARC runs of one goes
  through the removal function, which unlocks only its own reason and locks the checkout again when the removal fails.

    - `[x]` **4.1.a Confirm the landing order**

        - Confirmed on the base merged at `ca8fd0b241`. Every removal of a work item's checkout runs
          `removeWorktreeCheckout` — both teardown forms, `reconcileWorkUnitWorktree`'s teardown,
          `lib/locus/release.ts`, an Errand's close (`lib/errand/terminal-occupancy.ts`), and the
          decomposition-candidate cleanup through the function teardown injects — and every decision to remove one
          reads `checkWorktreeRemoval`. Every move ARC runs or prints takes `-f -f`: reconcile's move and its
          occupied-move remedy, the rename follow-up and `commands/rename-store.ts`'s notice, and the residue sweep's
          remedy. Every other `git worktree remove` is an exempt spawn rollback or a checkout no spawning verb locks:
          the base sync's temporary worktree and its printed remedy (`lib/git/base-sync.ts`, `handlers/base.ts`),
          delivery's gate checkout (`lib/delivery/residue-reaping.ts`), and the test-cost and review-gate scratch
          checkouts. The one printed plain removal of a registration whose folder is missing
          (`lib/session-init/missing-worktree-folders.ts`) is 4.2's.

    - `[x]` **4.1.b The lock at each spawn**

        - `lockSpawnedCheckout` (`lib/git/worktree-removal.ts`) is each spawning verb's last step: it reads the
          checkout's registration, locks it with `PROJECTION_LOCK_REASON` when unlocked, does nothing under that reason
          (a replayed `arc errand open`), and returns `kept` with another tool's reason, or `failed` with the checkout
          unlocked, for the verb's handler to print on stderr through `warnSpawnLock` (`handlers/spawn-lock.ts`).
        - The callers lock once every rollback that can remove the checkout has passed: `completeCreatedWorktree`,
          `runGraduate` and `runMaterialize` after either arm returns, `runResume` at its end (its transition executor
          keeps the fresh spawn's path), and `provisionSpawned` after its ready marker, through a new
          `lockSpawnedCheckout` provisioning dependency whose outcome rides the receipt to the open runtime. Placements
          in place and the primary are never locked; promotion leaves the lock.
        - `PROJECTION_LOCK_REASON` takes the exits text, which Git's refusal of a plain removal prints.
        - A lock the spawn cannot set (`failed`) completes the spawn and warns with the remedy of locking the checkout,
          as a failed relock does (spec § 17, item 9).

    - `[x]` **4.1.c Relock after a failed retirement**

        - `removeWorktreeCheckout` (`lib/git/worktree-removal.ts`) notes when it unlocked the projection's lock; its
          error path and the `onlyMissing` return of a returned folder then lock the checkout again through `relock()`
          before returning `failed`, and a relock that fails adds its error and the `git worktree lock --reason` remedy
          to the detail. A refusal before the unlock, the persist slot's included, leaves the lock as it was. Covered in
          `integration/worktree-projection-lock.test.ts`.

### `[x]` **4.2 Rewrite the removals printed or documented — § 12.6**

- _Goal:_ With the lock live, every removal the agent is told to run or a person is told to type names an exit verb or
  the unlock-then-remove sequence, never a plain `git worktree remove` that the lock refuses.

    - `[x]` **4.2.a A missing folder's remedy under the lock**

        - `missingRegistrationActions` (`lib/session-init/missing-worktree-folders.ts`) takes the registration's lock
          reason — the check's for another tool's lock, else the derived roster row's (`missingRegistrationLock`) — in
          the stale sweep, its store arm, branch-gone recovery, and teardown's adopted-branch notice. Under
          `PROJECTION_LOCK_REASON` a shipped or created branch keeps its typed `arc teardown <name>`, and every other
          registration takes `git worktree unlock <path>` before `git worktree remove <path>` as text; another tool's
          lock keeps its remedy. Covered in `integration/missing-folder-lock-remedies.test.ts`.

    - `[x]` **4.2.b The workflow and strategy text**

        - `session-init.md` (`session-init.template.md` and the installed copy; `session-init-agenda` had not landed,
          so the text stays in the workflow): a removable branched worktree without `teardown` offers the
          `arc teardown <name>` in its `actions`; branch-gone recovery's removable candidate runs its teardown action
          from `argv`, then re-runs Step 1; the sweep's and recovery's `missingFolders` render with their remedies,
          offer-only; and a husk left to manual cleanup is removed after `arc user save` and `git worktree unlock`.
        - `strategy-concurrent-work.md` (both copies): removal names the exit verbs and the lock, and that forcing past
          it skips the persist; a deleted folder's registration is cleared by its path, unlocked first; and the
          refused-removal entry names the lock. Edited in the package source and synced to `.arc/`.

### `[x]` **4.3 Clear the primary's personal `.ignore` — § 11.5**

- _Goal:_ The primary's untracked `.ignore`, holding one personal Marksman line, is gone before the tracked one lands
  there, so the line is dropped on purpose rather than overwritten unseen.

- _Outcome:_ The primary's untracked `.ignore` is deleted, its comment and its one line, `packages/arc-framework/arc/`,
  not carried over; Git had reported it ignored, on `main` at `a0c89b59c9`.

### `[x]` **4.4 Removal behind the lock** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base, the lock live and the slots passing.

- _Outcome:_ On the base merged at `72ebb30cc2`, in a disposable repository set up with this checkout's build, the
  spawned work unit's checkout carried `PROJECTION_LOCK_REASON`, a plain `git worktree remove` refused it printing the
  exits, and `git worktree move -f -f` kept the lock; one claimed with `arc start --here` in a linked checkout carried
  none. Both were abandoned, and once the spawned one's abandonment landed, `arc teardown` removed its checkout and
  branch. In this repository an isolated Errand showed the same lock, refusal, and move, and `arc errand abandon`
  removed it. 4.1.c's relock cases pass on the merged base. The disposable install's first commit passed its link check
  only once given the ten package files its install recipe ships nowhere.

## **Phase 5:** Verification

### `[x]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

- _Quality gates:_ Increment and forced merge gates passed; normal hosted CI 41356724453 passed at e81826e07d,
  including Linux integration/E2E and the Windows/macOS portability pair.
- _Success criteria:_ 15 met; none superseded. The four chunks and shared contracts passed criteria review, with no
  findings in fix-check round 3. The engine remains dark; worktree locks and managed ignore content are live.

---

## Success Criteria

- `[x]` On Linux and in a dispatched run of the portability pair, the save-loss harness loses no save timed into a
  replacement, a rebuild, or a file removal — saved in place or by renaming a new file over it — a copy whose path moved
  on kept and reported; an absent file is rebuilt by the link alone and yields to a save that recreated it; and the next
  command's sweep takes over the copies a stopped command left, but for the residuals the spec's § 17 names.

- `[x]` Before the flip, every checkout ARC spawns for a work unit or an Errand carries `PROJECTION_LOCK_REASON`, or
  keeps a lock another tool set first, reported; under `PROJECTION_LOCK_REASON` a plain `git worktree remove` refuses
  it naming the exits, the removal function removes it or, failing after its unlock, locks it again, and a move keeps
  it; and an `arc start --here` checkout carries none.

- `[x]` The guard refuses a projected root no rule ignores and an `.arc/user/*/` rule outside `.gitignore`, and passes
  once the line is restored; and `arc init` (with `--reconfigure`), `join`, and `update` write the managed `.ignore`
  block, which re-includes the four roots and keeps a repository's own lines.

- `[x]` A same-size save inside one modification-time tick reads as changed, and still does after a later index write
  smudges its entry, a file truncated to empty included; and a changed file identity sends a file to the hash.

- `[x]` Base-stamp recovery takes the exact version a file's content equals, else the closest candidate, else an empty
  base, reading `history` at most once per record between the write-backs the command lands to it; and a save carrying
  the stamp the last persisted write-back read takes the content that write-back took in as its base.

- `[x]` Taken with the 200 ms bound fan-out and the end use, a sibling's projection lock held past it is skipped and one
  released within it is taken; and no acquire, renewal, or release recreates a removed worktree's Git directory.

- `[x]` Session-init's stale-worktree offer and branch-gone recovery name `arc teardown <name>`; a registration whose
  folder is missing under the projection's lock takes its typed `arc teardown <name>` where the sweep offers it, and
  otherwise the remedy that runs `git worktree unlock` before the removal; and `strategy-concurrent-work.md` names the
  exit verbs and the lock.

- `[x]` Before the flip, the worktree lock, the managed `.ignore` block, and this repository's `.gitignore` without its
  `.ignore` line are live.

- `[x]` All quality gates pass (tests, linting, type checking)

- `[x]` Ready for integration

- `[x]` An aside copy empty at its writer's second check is neither sent nor deleted there, and the next command's sweep
  settles it as any copy it takes over; and on Linux and in a dispatched run of the portability pair, the save-loss
  harness loses no save, one that left the file empty past the settle window included.

- `[x]` A same-size save after a clean hash, after a swap link, or after an ignore snapshot remains detectable when
  later index/reference writes land.

- `[x]` After a passing ignore guard, changing or unsetting core.excludesFile forces a new effective-rules verdict
  before any write into affected projected roots.

- `[x]` A cached ignore pass records the effective excludes source used by its Git guard; an unset and a valueless
  core.excludesFile cannot share a passing cache entry.

- `[x]` Changing any core.excludesFile occurrence invalidates a cached ignore pass; Git-invalid earlier values
  refuse writes and a repaired configuration permits retry.
