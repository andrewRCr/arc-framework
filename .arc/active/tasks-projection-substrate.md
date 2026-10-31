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

### `[ ]` **2.8 Files other than Markdown — § 3.7**

- _Goal:_ A text file of any kind in a projected root carries no stamp and keeps its base in its index entry alone, and
  old content a stopped replacement left reads as unedited, never written back over the newer version.

    - This task builds the entry's in-progress record, which names the version a replacement replaces and the aside copy
      its batch makes of the file; the base selection over it; and the one deletion of an aside copy every deleter calls
      — the end's second check (`projection-write-back`), a later sweep (3.3), and a removal's or release's takeover
      (`projection-worktrees`) — which clears the record when the copy it names is deleted and the file holds what the
      batch linked there, and clears the copy's own record (2.2.a) whenever it deletes any aside copy. The swap sets the
      record (3.2.b), and a refused move restores the entry (3.2.b). A rebuild by the link alone (3.4,
      `projection-worktrees`) sets one naming the version it replaces and no copy, only where that version is the
      record's the entry names, never at a path re-laid for another record (3.4); the batch's second index write clears
      it where the path holds the file the batch linked (3.2.b), and where the link yielded to a save it stays until the
      file's next replacement.
    - The entry's version is the base, so a file restored to an older version is an edit. A file not matching an entry
      still holding an in-progress record takes whichever version it equals exactly, by blob id, else the closer of the
      two. An empty one is read only once its modification time is 50 ms old.
    - The closer of the two is chosen over both versions' content, read through `history` once per record between the
      write-backs the command lands to it (2.6's memo). Where that read refuses `state-unresolvable`
      (`lib/store/refusal.ts`), the file takes neither version: it stays pending and reported, written back nowhere,
      until a read succeeds, since taking either unread could write old content over the newer version — an arm 2.9
      builds over its wrapping store. `arc save` and the persist and release steps pull the named history ref and retry
      once (`projection-write-back`); no other command's start pulls.
    - Build `test-first` (one behavior at a time):
        - a stampless file restored to an older version reads as an edit
        - with an in-progress record, the old content reads as unedited and selects the replacing version
        - deleting the copy the record names clears it once the file holds the linked version, and deleting another
          aside copy of the file leaves it, each deletion clearing the deleted copy's own record
        - an empty stampless file younger than 50 ms waits for the next command

### `[ ]` **2.9 A seeded projection, a wrapping store for tests, and the `history` refusal's arms — § 3.5, § 3.7**

- _Goal:_ Tests of Phase 3 and of `projection-write-back` start from a real projection — stamped files and a matching
  index — before full materialization (`projection-worktrees`) exists, so no test hand-builds index entries, and one
  test store returns the `history` refusal the reference backend cannot, over which recovery's and a stopped
  replacement's arms for that refusal are built.

    - A helper under `__tests__/helpers/store/projection/` writes the records a store lists at the paths its caller
      gives, stamped and rendered through 2.5.c, and the index 2.2.a describes, in a real temporary repository;
      `projection-worktrees`' full materialization replaces it in the tests that exercise materialization itself.
    - A test store under `__tests__/helpers/store/projection/` wraps the reference backend and returns
      `state-unresolvable` (`lib/store/refusal.ts`) naming a missing history ref on `history` for the records
      a test names, which the reference backend, holding no history refs, cannot (spec § 1.5); `projection-write-back`
      extends it with the write refusals. Its refs take the shipped shape, an owner's lowercase stored UID
      (`HistoryRefSchema`, `lib/store/refusal.ts`), and the history entries it passes through may carry a
      `creationReceipt` (`HistoryEntrySchema`, `lib/store/contract.ts`), since both schemas are strict.
    - Over that store, this task builds 2.6's and 2.8's arms for a `history` refusing `state-unresolvable`: recovery
      chooses between the index's version and the content taken in alone and pulls nothing (2.6), and a file with an
      in-progress record that equals neither version stays pending and reported, written back nowhere, until a read
      succeeds (2.8).
    - Build `test-first` (one behavior at a time):
        - a seeded worktree's files are clean against its index by the racy rule once the reference is newer than
          them
        - the wrapping store refuses `history` for a named record with a history ref that parses, and passes every
          other call through
        - under a `history` refusing `state-unresolvable`, recovery chooses between the index's version and the content
          taken in, and records no pull
        - under a `history` refusing `state-unresolvable`, a file with an in-progress record that equals neither version
          stays pending and reported, sends nothing, and records no pull

## **Phase 3:** Reading and replacing

_Purpose:_ Read an edit only once its save has settled, and replace, rebuild, or remove a projected file without
losing a save timed into the move.

_Exit criterion:_ On Linux and in a dispatched run of the portability pair, saves timed into a replacement — in place
and by renaming a new file over the path — lose none, a copy whose path moved on kept and reported, an absent file is
rebuilt by the link alone and yields to a save that recreated it, a removal takes an edit in first, and the next
command's sweep takes over the copies a stopped command left.

### `[ ]` **3.1 Read an edit only once it has settled — § 4, § 3.7**

- _Goal:_ Write-back never reads a file mid-save: an empty file is never read as an edit while a save may still be
  writing it, and a file modified within the last 50 ms is read only once two stats 15 ms apart agree, else at the
  next command.

    - The read gate takes an injected clock, stat, and sleep. Up to three tries of the settle check; only a command
      closely following a save pays the wait.
    - An empty file younger than 50 ms, Markdown or not (2.8), is deferred and marked pending. An empty projected
      Markdown file at least 50 ms old is a deleted file — every projected one carries its stamp — so it is no edit:
      never sent to stamp recovery (2.6), not pending, and replaced by the swap (3.2) when a refresh next writes it
      or `arc sync` rebuilds deleted files (`projection-worktrees`).
    - A symbolic link at a path the index lists (2.4.a) is a deleted file too, never followed or read, reported with the
      remedy of replacing it with a regular file, and replaced as an emptied file is.
    - Build `test-first` (one behavior at a time):
        - an empty stamped Markdown file 10 ms old is deferred and never recovered
        - an empty stamped Markdown file 50 ms old reads as no edit, and the next replacement overwrites it
        - a symbolic link at a projected path reads as no edit and is reported, its target never read
        - a file modified 10 ms ago is read once two stats agree
        - a file still changing across three tries is left pending for the next command

### `[ ]` **3.2 Replace a file by the swap behind the replace guard — § 5.1, § 5.2, § 5.3**

- _Goal:_ Every replacement re-checks its file by the racy rule, takes an edit in first, and replaces by moving the old
  file aside and linking the new one in, so a save timed into the replacement lands in the aside copy rather than being
  lost, and every way the swap can end leaves the index telling the truth.

- **Additional Context:** `notes-projection-substrate.md` § Spike 1, § Spike 1b, § Spike 7

    - `[ ]` **3.2.a The replace guard and the take-in port**

        - Before replacing, the re-check runs the racy rule against a baseline (2.4): the index entry, or, for the file
          write-back just sent (`projection-write-back`) or just drew a clash into (`projection-write-back`), the stat
          and blob id write-back read, which the caller passes so its own edit never reads as a new one. On a mismatch
          the file goes to the take-in, then the guard re-reads the record's current version and restages it, at most
          three passes. A refused refresh marks the file pending.
        - The take-in is a port the guard, the second check (3.2.c), the sweep (3.3), and removal (3.4) call, bound to
          write-back by `projection-write-back`, and a test double until then. It takes the worktree whose file holds
          the edit, whose rights apply rather than the writer's; the path or the aside copy; its index entry; and its
          base — the stamp, or, stampless, the base blob id the copy's name carries. It answers `no-edit`, `taken-in`,
          `deferred`, `refused`, `unparseable`, `clashed` — an edit that merged in the checkout and clashed
          (`projection-write-back`) — or `pending`.
        - Every swap's first index write records beside each aside copy, in its file's entry in swap order (2.2.a), the
          blob id it was moving — what the projection last wrote there or, for write-back's own copies, the blob id
          write-back read — and the blob id it linked in its place, none for a removal (3.4). Write-back replaces a file
          itself in two ways — reading back a landed edit (`projection-write-back`), adoption's included, whose
          verb-owned fields take the minted record's values (`projection-write-back`), and drawing a clash found in the
          checkout (`projection-write-back`) — and only where it refused nothing the file held
          (`projection-write-back`), so the aside copy such a swap makes holds nothing write-back has not taken in or,
          at adoption, deliberately set. A copy holding the blob id its swap was moving, or the one it held when its own
          take-in landed, answers `no-edit` without reaching the port wherever it is read — at the first and second
          checks, the sweep, a removal's or release's takeover, and the removal check (`projection-worktrees`); a copy
          holding anything else goes to the port, checked against its own base stamp or, stampless, the base blob id its
          name carries.
        - A copy's path has moved on while it holds anything but the blob id its swap linked — a later save there, a
          write-back's read-back, another replacement — and, present or absent, once a write-back of it has been sent
          since the swap; an absent path with no write-back sent since has not moved on, whatever it held before. A copy
          holding an edit is taken in only while its path has not moved on; once it has, the copy is kept in the aside
          folder, reported with its path and never sent or merged, until the person deletes it, and the removal check
          and the persist and release steps refuse over it (`projection-worktrees`). Before each write-back of a path
          sends an edit (`projection-write-back`), an index write records, beside every aside copy of the path but the
          one it takes in, that a write-back has been sent since that copy's swap, so a stop after the write lands
          leaves the record; a send that lands nothing leaves it too, which only keeps a copy. Once a copy's take-in
          lands, its entry records the blob id the copy held. 2.8's deletion clears a copy's record, and the sweep drops
          a record whose copy is no longer in the aside folder (3.3).
        - Every read and every link-back of an aside copy — the first and second checks, a link failing after the move
          (3.2.b), the sweep and its comparison with no usable index (3.3), a removal's or release's takeover, and the
          removal check (`projection-worktrees`) — takes an `lstat` first: a copy that is a symbolic link, as a swap
          moves one aside from a projected path (3.1), answers `no-edit` without being followed or read and is never
          linked back, its path left absent and pending for the next refresh to rebuild; 2.8's deleters delete it at
          their usual points.
        - What each answer does where:
            - At the guard: `no-edit` re-records the file's stat as its baseline and replaces it; `taken-in` takes the
              next pass; `deferred`, `pending`, `refused`, and `unparseable` leave the file unreplaced and pending, its
              edit in place, a refused or unparseable one also marked refused; `clashed` leaves it unreplaced too,
              holding its clash's markers (`projection-write-back`), pending.
            - At the second check and the sweep: a copy is deleted only once it answers `no-edit` or its `taken-in` edit
              has landed whole; a `deferred` or `pending` copy stays in the aside folder for the next command's sweep,
              which sends it again while its path has not moved on; a `refused`, `unparseable`, or `clashed` one goes as
              3.2.c states; and a copy holding an edit once its path has moved on is kept, reported with its path.
            - At a removal's or release's takeover there is no next sweep: a `deferred` or `pending` copy, or one that
              never settles, is kept and refuses the step with a retry (`projection-worktrees`); a `clashed` copy is
              kept and refuses it as held by a conflict; and a copy holding an edit once its path has moved on is kept
              and refuses it, naming the copy's path and the remedy of copying out what it holds and deleting it.
            - At removal (3.4): a file whose take-in answers `deferred` or `pending` stays at its path, its entry marked
              pending, and the refresh retries a pending file whose record has left this projection as a removal
              (`projection-worktrees`); a `clashed` one stays at its path, or goes back to it, holding its clash's
              markers (`projection-write-back`), pending, and the removal check refuses over it
              (`projection-worktrees`). In a release step (`projection-worktrees`), which leaves no projection to retry
              from, a `deferred` or `pending` file refuses the step with a retry instead, a `refused` or `unparseable`
              file, linked back to its path, refuses it with its remedy, and a `clashed` one refuses it as held by a
              conflict.
        - Build `test-first` (one behavior at a time):
            - a file edited since its entry is taken in, then replaced with the record's current version
            - a file still changing after three passes is marked pending, its edit kept
            - the file write-back just sent, re-checked against the baseline it passes, is replaced without a take-in
            - a file whose stat moved but whose content did not is replaced, its stat re-recorded
            - with the take-in double answering `deferred`, `pending`, and `refused` in turn, the file is left
              unreplaced and pending each time
            - a copy holding the blob id its swap was moving, or the one it held when its own take-in landed, answers
              `no-edit` without reaching the port
            - a copy holding an edit is taken in while its path holds the blob id its swap linked, and kept, reported
              with its path and never sent, once a later save there has moved the path on
            - an absent path with no write-back sent since the swap reads as not moved on, and one a write-back of was
              sent since reads as moved on
            - recording a write-back as sent marks every aside copy of the path but the one taken in, and deleting a
              copy clears its record
            - a symbolic link swapped aside from a projected path is deleted as no edit by the second check, and by a
              sweep, its target never read

    - `[ ]` **3.2.b The swap and its outcomes**

        - The index and its reference are written first (2.4), once for all the files a swap batch replaces — a
          refresh's (`projection-worktrees`) or a read-back's (`projection-write-back`) — and the files it removes
          (3.4), each entry recording its new base, or, for a removal, kept as it was, marked pending, and, for a file
          other than Markdown, an in-progress record naming the version being replaced and the aside copy the batch
          makes of it, or no copy for a rebuild by the link alone (2.8), and, for each file it moves aside, the aside
          copy's record — its name, the blob id it is moving, which for write-back's baseline (`projection-write-back`)
          is the blob id write-back read, and the blob id it links, none for a removal (2.2.a, 3.2.a); then each file is
          renamed into the aside folder (2.2.c), its staged file hard-linked onto the path, and its aside copy checked
          through the take-in.
        - Where the projection now lays another record's file at the path of a file a batch removes — a path-keyed
          companion re-laid by a changed claim (`projection-worktrees`) — the batch removes it only, as any removal
          (3.4), its entry staying the leaving record's while the file or any aside copy of the path remains, so every
          take-in of the file or a copy of it goes to the record it was projected from; the next refresh after both are
          gone lays the arrival (3.4).
        - Once its swaps are done the batch writes the index again, under the same lock, clearing the pending mark of
          each file whose path still holds the staged file it linked, its file identity the one the entry records (2.4),
          and, for a file rebuilt by the link alone, its in-progress record (2.8). A file swapped back or linked back at
          its first check (3.2.c), saved over, or left unreplaced by a move or link keeps its mark, and so does a file a
          read-back replaced that was already pending, which the next refresh settles, removing it where its record has
          left the path (3.4, `projection-worktrees`); the caller says whether the batch is a read-back. A stop between
          the two writes leaves the file pending in any root, `completed/` included, its old file reading as unedited —
          after a refresh's first write a Markdown file equals its own stamp's version, and any other matches the
          version its in-progress record names (2.8); after a read-back's, the file holds what its write-back took in,
          which 2.7 reads as no new edit — so write-back finds no edit in it and the next refresh writes it again.
        - Each outcome leaves the index true: in place, the entry records the new version; a link refused because the
          path reappeared yields to that save, the replaced version still recorded; a move still refused past
          `retryTransientFileSystemRefusal`'s bound (`lib/kernel/fs-retry.ts`) leaves the file in place, its entry
          restored and pending; a link failing for another reason after the move links the aside copy back, pending, unless
          it is a symbolic link (3.2.a).
        - The projection closes its own handles before moving a file; the rename and link run inside the bounded
          retry, and a read-only file moves aside and links in with its mode intact.
        - Step hooks after the re-check, after the move, after the first check, and before a rebuild's link (3.4) let
          tests and the harness (3.5) place a save in each interval.
        - Build `test-first` (one behavior at a time):
            - a save landing after the re-check, in place or by renaming over the path, lands in the aside copy and is
              taken in
            - a save that recreated the path before the link makes the replacement yield, the replaced version recorded
            - a file rebuilt by the link alone has its in-progress record cleared by the second index write, and keeps
              it where the link yields
            - a move refused past the retry bound leaves the file in place, its entry restored and pending
            - once the swaps are done, a file put in place carries no pending mark and a file whose move was refused
              keeps it
            - a read-back's batch keeps the pending mark a file carried into it and clears the one it set
            - a file a new file was renamed over after its link keeps its pending mark through the second index write
            - a read-only file is replaced with its mode kept
            - a held file refusing with `EBUSY` is retried within the bound
            - a stop between the index write and the move, and one between the move and the link, each leave the file
              pending, write-back reading no edit in it, in `completed/` too

    - `[ ]` **3.2.c The second check and a refused copy**

        - A command keeps its aside copies until it ends, then takes each worktree's lock again and checks each copy
          through the take-in before deleting it; a copy taken in there, its path not moved on (3.2.a), is deleted once
          its edit lands whole, its file replaced at the next refresh. Only the writer checks and deletes its copies
          while it runs.
        - A copy whose edit is `refused` or `unparseable` is never deleted while refused: where its path has not moved
          on and holds the blob id its swap linked, swapped back onto it, the file then pending and refused; where it
          has not moved on and is absent, linked back, the file marked pending and refused; otherwise its path has moved
          on, and it is kept as such a copy is (3.2.a), reported with its path as a refused edit, until the person
          deletes it.
        - A copy whose take-in answers `clashed` goes the same way, never deleted while its clash stands: where its path
          has not moved on, swapped back or linked back to it, where its clash is drawn as markers found in the checkout
          (`projection-write-back`), the file pending and held by them; otherwise kept as a copy whose path has moved on
          is, reported with its path as a clash to resolve by hand, which the removal check refuses over
          (`projection-worktrees`) and a removal's or release's takeover refuses as held by a conflict.
        - Build `test-first` (one behavior at a time):
            - a save written through a handle opened before the move, landing after the first check, is found at the
              second
            - a copy whose take-in answers `deferred` at the second check stays for the next sweep, which takes it in
            - a refused copy whose path still holds the replacement is swapped back and reported as a refused edit
            - a refused copy swapped back at the first check keeps its pending mark through the batch's second index
              write
            - a refused copy whose path is absent is linked back and reported, and keeps its pending mark through the
              batch's second index write
            - a refused copy whose path went absent before the second check is linked back there, its file marked
              pending
            - a refused copy whose path was saved over stays in the aside folder, reported with its path, and no later
              sweep sends it
            - a copy whose take-in answers `clashed` at the second check is swapped back to its path, pending, and
              reported
            - a copy whose take-in clashes at the sweep, its path saved over, stays in the aside folder, reported with
              its path
            - a save written through a handle opened before the move, landing after the first check and after a later
              save to the path, is kept at the second check, reported with its path, and the later save stands

### `[ ]` **3.3 Sweep the aside folder — § 5.4**

- _Goal:_ Every command's sweep takes over the copies and staged files an exited writer left, without losing one and
  without touching a live writer's.

- **Additional Context:** `notes-projection-substrate.md` § Spike 7

    - Before its first write, the sweep runs the guard's skip check (2.4.b) and, where an ignore file may have changed,
      the guard (1.2), recording a pass's snapshot in the index, so every write a command's start makes follows the
      guard. A refusal leaves each root it names unwritten for the command, no copy linked back into it, and the sweep
      returns the verdict with the guard's remedy, which write-back's read-back honors (`projection-write-back`).
    - Under the projection lock, before write-back reads any file — the stat walk may start first, and write-back
      re-reads the stats of each path the sweep linked back or replaced (`projection-write-back`) — every command
      touches only the copies and staged files whose writer has exited, judged by the predicate the lock exports (2.3):
      a copy whose path is absent and has not moved on (3.2.a), a symbolic link excepted, is linked back, yielding if
      the path reappeared; every other copy is read as 3.2.a states — no edit while it holds the blob id its swap was
      moving or the one it held when its own take-in landed, its edit taken in only while its path has not moved on, a
      refused or clashed one handled as 3.2.c states, and otherwise kept and reported with its path; leftover staged
      files are deleted; deleting the aside copy a file's in-progress record names clears the record, through 2.8's
      deletion, once the file holds what the batch linked; and a copy's record whose copy is no longer in the aside
      folder — moved back to its path, or never made after a stop — is dropped. The reference stamp is left alone, and a
      copy the index lists as withheld is left by every sweep until the person deletes it. A copy written from another
      process scope, which the predicate never reads as exited, since a copy holds no lease, is left and reported with
      its path.
    - With no usable index (2.2.d) it takes nothing in: an absent path's copy, a symbolic link excepted, is linked back,
      a copy equal to its base, or a symbolic link, is deleted, and every other copy stays and is reported. The sweep
      returns those copies' names, and the materialization that rebuilds the index records them as withheld
      (`projection-worktrees`).
    - Build `test-first` (one behavior at a time):
        - with an ignore line removed since the guard last passed, the sweep runs the guard, links no copy back into the
          refused root, and returns the refusal; once the line is restored, the next sweep links the copy back
        - after a sweep whose guard ran and passed, the next sweep, no ignore file changed since, makes no Git call
        - a copy left by an exited writer with its path absent is linked back
        - a symbolic-link copy whose path is absent after a stop is never linked back: the sweep deletes it as no edit,
          its target never read, and leaves the path pending
        - a copy holding an edit is taken in, and a live writer's copy is left alone
        - a copy whose writer's process ID now runs another instance of this process is taken over
        - a reused process ID keeps its copies until that process exits
        - leftover staged files are deleted, and the reference stamp stays
        - with no usable index, a copy holding an edit is withheld and reported, and the next sweep leaves it
        - an in-progress record a failed action left is cleared by the next command's sweep once it deletes the copy
        - a copy a failed command left holding the blob id its swap was moving, its record seeded, is deleted by the
          next sweep as no edit without reaching the take-in port, its record cleared; two such copies of one file, each
          with its own record, both go
        - a copy's record whose copy was moved back to its path, or never made, is dropped by the next sweep
        - a copy written from another process scope is left and reported with its path
        - a copy holding an edit whose path a later save moved on is kept and reported with its path, and later sweeps
          leave it
        - a copy whose path the person deleted after a write-back of it was sent is kept, never linked back
        - of two copies of one absent path, the sweep links one back and keeps the other, its path then moved on

### `[ ]` **3.4 Rebuild an absent file and remove a file — § 5.5, § 5.6**

- _Goal:_ An absent file is rebuilt by the link alone, yielding to a save that recreated it, and a file whose record
  left this projection is removed only after its edit is taken in, a refused edit going back to its path.

    - Rebuilding is the swap's link alone, which makes no aside copy; its in-progress record names the version it
      replaces and no copy (2.8). Removing is the swap without the link: the same re-check, an edit taken in against the
      record the file was projected from, then the file moved aside and its copy checked and deleted. The batch's first
      index write keeps the removed file's entry, marked pending, and, once the file is gone, deleting the last aside
      copy of its path drops the entry, so a copy that goes back to its path (3.2.c) is still taken in against that
      record, and a copy a sweep links back after a stop is a pending file whose record has left this projection, which
      the next refresh removes (`projection-worktrees`); with no usable index it is withheld and reported
      (`projection-worktrees`). A refused edit, to a record now archived for one, goes back to its path by link,
      reported, its entry marked pending; an edit that clashes in the checkout stays at its path, or goes back to it,
      holding its clash's markers (`projection-write-back`), pending, the removal check refusing over it
      (`projection-worktrees`); a take-in that defers leaves the file at its path, pending; and each later command's
      refresh retries the removal of a pending file whose record has left this projection (`projection-worktrees`). A
      withheld file (`projection-worktrees`) is never removed. Where the projection now lays another record at the
      removed file's path (3.2.b), deleting the last aside copy of that path, the file gone, leaves the entry pending as
      a deleted file rather than dropping it (2.2.a), so the next refresh lays the arrival there by the link alone,
      recording no replaced version (2.8); while the file or any copy remains, the entry stays the leaving record's and
      the arrival waits.
    - Build `test-first` (one behavior at a time):
        - an absent file is rebuilt, and an editor's save that recreated it first wins
        - a removed file's edit is taken in before the file goes
        - an edit refused at removal is linked back to its path, reported, and marked pending
        - a take-in that defers at removal leaves the file at its path, pending
        - a take-in answering `clashed` at removal leaves the file at its path, pending
        - a removal at a path the projection now lays another record at takes in the leaving file's edit against its own
          record, and deleting its aside copy leaves the path pending for the arrival
        - a refused copy of the leaving file goes back to its path, holds the arrival back while it stands, and is taken
          in against the leaving record
        - an edit refused at a re-laid path is linked back to it, and the arrival waits while it stands
        - deleting the last aside copy of a removed file's path, the file gone, drops the file's entry
        - a removal's aside copy left by a stopped command is linked back by the next sweep, its entry still pending
        - a withheld file is left at its path

### `[ ]` **3.5 Hold saves timed into a replacement in a save-loss harness — § 5.2, § 13**

- _Goal:_ Saves timed into the engine's own replacement, rebuild, and removal lose none on Linux and in a dispatched
  run of the portability pair, with evidence that every targeted interval was reached — what closes this layer.

- **Additional Context:** `notes-projection-substrate.md` § Spike 1, § Spike 1b, § Spike 3

    - A harness under `__tests__/integration/store/projection/` drives the engine's swap, link, and removal while a
      writer saves in place, by renaming a new file over the path, and by truncate-then-write as VS Code and Zed do,
      with a reader holding the file open with delete access shared.
    - Each interval — re-check to move, move to link, first check to second — is reached two ways: placed exactly
      through 3.2.b's step hooks, and by a randomized run of 1,000 saves per save mode within the integration tier's 30
      s budget. The harness requires no lost save in either; a save left in a copy kept because its path moved on
      (3.2.a), reported with its path, is kept rather than lost and counted as its own outcome. Each hook places the
      save its interval can catch, which must produce that interval's outcome, counted per platform, so a hook an
      operation passes through that never fires fails the run: after the re-check, an in-place or rename-over save,
      rescued from the aside copy at the first check; after the move, a save that recreates the path, which the
      replacement yields to; after the first check, a write through a handle opened before the move, rescued at the
      second check. A rebuild, the link alone, has one interval: a save that recreates the absent path before the link
      wins, and the link yields. A removal has no link: after the re-check, a save is rescued from the aside copy at the
      first check; after the move, a save that recreates the path keeps the entry pending, and the next command's
      removal takes its edit in first (3.4); after the first check, a write through a handle opened before the move is
      rescued at the second check. The randomized run reports its own count of each outcome, which the second check's
      rarity can leave at zero.
    - It runs in the portability tier (2.1); the Windows and macOS evidence is a dispatched run of the pair, recorded
      in this task's completion note.

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

### `[ ]` **4.1 Lock each checkout ARC spawns for a work item — § 12.1, § 12.4, § 12.5**

- _Goal:_ Every linked checkout ARC spawns for a work unit or an Errand carries `git worktree lock` with
  `PROJECTION_LOCK_REASON` once its spawn has succeeded, before the flip as after, but for one another tool already
  locked, which keeps that lock, reported; an anchored checkout carries none; and every removal ARC runs of one goes
  through the removal function, which unlocks only its own reason and locks the checkout again when the removal fails.

    - `[ ]` **4.1.a Confirm the landing order**

        - Before the lock lands, confirm on the merged base that every removal of a work item's checkout runs the
          removal function, every decision to remove one reads the removal check, and every move ARC runs or prints
          takes `git worktree move -f -f`: `reconcileWorkUnitWorktree`'s move, the rename follow-up
          (`handlers/lifecycle-rename-report.ts`), the occupied-move fallback, and the residue sweep's remedy
          (`lib/session-init/lifecycle-residue-sweep.ts`). The spawn rollbacks — `rollbackSpawnedWorktree`
          (`commands/start.ts`), graduation's in both forms (`lib/work-unit/atomic-graduation.ts`, and the store form's
          `occupyStoreGraduation` rollback run from `commands/start-store.ts`), the fresh-spawn rollback in
          `reconcile-work-unit-worktree.ts`, which a resume's spawn runs too, and the transient claim's
          `rollbackSpawned` (`lib/locus/provisioning-runtime.ts`) — are exempt, since each removes a checkout before its
          lock exists, and so is `removeDisposableSpawn` (`lib/work-unit/spawned-worktree-claim.ts`), the plain `git
          worktree remove` the store forms of the start, graduation, and fresh-spawn rollbacks call. Teardown's
          decomposition-candidate cleanup (`cleanupGitOwnedDecomposeCandidate`,
          `lib/work-unit/git-owned-decompose-candidate-cleanup.ts`) removes through the removal function its one
          production caller injects, its raw removal only a fallback when none is. Teardown's remaining
          `isWorktreeClean` reads (`lib/work-unit/verbs/teardown.ts`, `lib/work-unit/store-retirement-husk.ts`) guard
          husking a checkout in place, returning the primary to base, and a detached husk's cleanup decision
          (`decideHuskCleanup`, `lib/git/worktree-cleanup.ts`), whose removal runs the removal function through
          `reconcileWorkUnitWorktree`; the first two remove or move no checkout. A plain `git worktree remove` or `move`
          of a locked checkout left on base stops this task and is routed to its owning seam member.

    - `[ ]` **4.1.b The lock at each spawn**

        - The lock is each spawning verb's last step, once every rollback that can remove the checkout has passed:
          `arc start` after `rollbackSpawnedWorktree`'s window; `arc materialize`; `arc resume` and `arc start` on a
          parked work unit, which re-attach its branch in a fresh worktree (`runResume`,
          `lib/work-unit/verbs/park-resume.ts`); and graduation after its rollback — the in-repo form's in
          `lib/work-unit/atomic-graduation.ts`, whose rollback runs `git worktree remove --force`, and the store form's
          once `runStoreGraduate`'s transition returns (`commands/start-store.ts`), since its occupation step's rollback
          runs `removeDisposableSpawn`'s plain `git worktree remove` — the in-repo form spawning through its own
          `git worktree add` and every other through `reconcileWorkUnitWorktree`;
          and an Errand's through `provisionTransientLocus` (`lib/locus/provisioning.ts`) after `rollbackSpawned`'s
          window. The lock, run as `git worktree lock --reason <reason> <path>` with `PROJECTION_LOCK_REASON`, keys on
          the spawn, never on the capability; a checkout claimed with `arc start --here` is never locked; promotion
          rewrites the marker and leaves the lock.
        - The step locks only a linked worktree the verb placed with `git worktree add` — never a placement in place,
          which `arc start`, `arc materialize`, and `arc resume` under `--here` return as a spawn naming the current
          checkout, and never the primary, which Git refuses to lock. It reads the checkout's roster row first
          (`scanRegisteredWorktrees`'s `locked`, `lib/git/worktree-roster.ts`), since
          `git worktree lock` refuses a worktree already locked: unlocked, it locks; locked with
          `PROJECTION_LOCK_REASON`, as a replayed `arc errand open` finds the checkout it reuses (`provisionSpawned`'s
          `path-collision` arm, `lib/locus/provisioning.ts`), it does nothing; locked with any other reason, it leaves
          that lock and returns that reason, which the verb prints on stderr as a warning naming the checkout and the
          reason, and the spawn completes.
        - `PROJECTION_LOCK_REASON` (`lib/git/worktree-removal.ts`) takes the value
          `arc: remove with 'arc teardown' (work unit) or 'arc errand close|abandon|leave' (Errand)`, which Git prints
          after "lock reason:" in its refusal; callers and tests read the constant, never the text.
        - Build `test-first` (one behavior at a time):
            - Integration tier, over real repositories
            - a work unit's spawn, `arc materialize`'s, graduation's in both forms, a resume's, and an Errand's each
              leave the checkout locked with the reason
            - a start whose scaffold fails after the spawn, and a graduation that fails after its spawn, roll back
              without a lock in the way
            - an `arc start --here` checkout carries no lock, and an Errand promoted to a work unit keeps its lock
            - `arc materialize --here` and `arc resume --here` leave their checkout unlocked
            - a replayed `arc errand open` finds its checkout locked with the reason, keeps the lock, and succeeds
            - a spawned checkout another tool locked first keeps that lock, and the spawn's stderr warning names the
              checkout and that tool's reason
            - a plain `git worktree remove` refuses a locked checkout naming the exits, and the removal function removes
              it
            - `git worktree move -f -f` keeps the lock and its reason

    - `[ ]` **4.1.c Relock after a failed retirement**

        - `removeWorktreeCheckout` (`lib/git/worktree-removal.ts`) unlocks a checkout held with
          `PROJECTION_LOCK_REASON` before its second `beforeRetire` and the remove, and its error path returns `failed`
          naming the step with the checkout left unlocked. Where the call unlocked the projection's lock and did not
          remove the checkout — that `beforeRetire` throws, `onlyMissing` finds the folder returned, or
          `git worktree remove` fails — it runs `git worktree lock --reason <reason> <path>` with
          `PROJECTION_LOCK_REASON` before returning `failed`; a relock that itself fails is named in the result's
          detail with the remedy of locking the checkout again. A failure before the unlock leaves the lock as it was.
        - Of the three exits after the unlock, the folder `onlyMissing` finds returned is a `return`, not a throw, so
          the relock covers that return as well as the error path.
        - Build `test-first` (one behavior at a time):
            - Integration tier, over a real repository
            - a `git worktree remove` that fails after the unlock returns `failed` with the checkout locked again with
              the reason, and a rerun removes it
            - a `beforeRetire` throwing after the unlock, and a folder `onlyMissing` finds returned, each leave the lock
            - a relock that fails is named in the `failed` result's detail with its remedy
            - a persist slot that refuses, injected, leaves the lock untouched, since it refuses before the unlock

### `[ ]` **4.2 Rewrite the removals printed or documented — § 12.6**

- _Goal:_ With the lock live, every removal the agent is told to run or a person is told to type names an exit verb or
  the unlock-then-remove sequence, never a plain `git worktree remove` that the lock refuses.

    - `[ ]` **4.2.a A missing folder's remedy under the lock**

        - The removal check answers `missing`, not `locked`, for a registration whose folder is missing under the
          projection's lock, since the removal function unlocks that lock itself, and the composers that build the
          `missingFolders` remedies take a registration as locked only where the check answers `locked`: the stale
          sweep's (`readMissingWorktreeFolders`, `lib/session-init/missing-worktree-folders.ts`), its store arm
          (`readStoreMissingFolderActions`, `lib/session-init/missing-worktree-store.ts`), and branch-gone recovery's
          (`buildWorktreeCandidate`, `lib/session-init/branch-gone-recovery.ts`), each through
          `missingRegistrationActions`. Under the lock an adopted branch's remedy and branch-gone recovery's would
          therefore name a plain `git worktree remove <path>`, which Git refuses.
        - This task passes each registration's lock reason from its derived roster row (`row.checkout.locked`,
          `lib/locus/derived-roster.ts`, carrying `RegisteredWorktree.locked`, `lib/git/worktree-roster.ts`) into those
          composers; each reader already holds the row, and branch-gone recovery refuses without a derived roster. A
          registration answering `missing` whose reason is `PROJECTION_LOCK_REASON` keeps the typed
          `arc teardown <name>` where the stale sweep offers it — before the flip, where its branch names a shipped work
          unit (`readMissingWorktreeFolders`'s `shipped` set), and from the flip, where its ended work unit created its
          branch (`linkedAs: created`) — since teardown runs the removal function, which unlocks that lock; every other
          — an unshipped one before the flip, an adopted branch from it, which teardown keeps with its registration
          (`reportAdopted`, `lib/work-unit/verbs/teardown-store.ts`), and branch-gone recovery's — takes the locked
          remedy as text, `git worktree unlock <path>` before `git worktree remove <path>`. A registration another tool
          locked keeps today's remedy.
        - Build `test-first` (one behavior at a time):
            - Integration tier, over a real repository
            - a registration under the projection's lock whose folder was deleted is reported by branch-gone recovery
              naming `git worktree unlock <path>` before its removal
            - before the flip, the stale sweep reports a shipped work unit's registration under the projection's lock
              with its typed `arc teardown <name>`, and an unshipped one's with the unlock before
              `git worktree remove <path>`
            - from the flip, an ended work unit's registration under the projection's lock whose branch it created is
              reported by the stale sweep with its typed `arc teardown <name>`, and one whose branch it adopted with the
              unlock before `git worktree remove <path>`
            - an unlocked registration, and one another tool locked, keep their remedies

    - `[ ]` **4.2.b The workflow and strategy text**

        - `session-init.md` (`session-init.template.md` in the package, with the installed copy): the stale-worktree
          offer becomes the `arc teardown <name>` command line `seam-locus` adds to the sweep's report; branch-gone
          recovery's shipped-worktree prompt runs the `arc teardown <name>` it adds to the candidate; the
          `missingFolders` reports show with their remedies; a husk no verb covers is removed by hand after
          `arc user save` and `git worktree unlock`.
        - `strategy-concurrent-work.md` (package and project copies): removal and recovery name the exit verbs, the
          lock, unlocking then removing a missing folder's registration by its path, and that forcing past the lock
          skips the persist step.
        - Edited in the package source and synced to `.arc/`, in the shipped-content register.
        - _Note:_ `session-init-agenda` moves session-init's orientation surfaces, the cleanup-residue lists among them,
          into CLI-composed text. Where it has landed first, the stale-worktree offer and the missing-folder remedies
          live in its composer: re-read both at execution and make the change wherever the text then lives.

### `[ ]` **4.3 Clear the primary's personal `.ignore` — § 11.5**

- _Goal:_ The primary's untracked `.ignore`, holding one personal Marksman line, is gone before the tracked one lands
  there, so the line is dropped on purpose rather than overwritten unseen.

    - Delete the primary's untracked `.ignore`, its line not carried over. Git would not refuse the pull: it treats an
      ignored file as expendable and overwrites it without a word.
    - Record the deletion in the completion note.

### `[ ]` **4.4 Removal behind the lock** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base, the lock live and the slots passing.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - In a disposable repository set up with this checkout's built CLI (`arc init`), its `origin` a local bare
      repository, spawn a throwaway work unit and claim another with `arc start --here`: confirm the spawned checkout's
      lock and reason, a plain `git worktree remove`'s refusal naming the exits, `git worktree move -f -f` keeping the
      lock, and no lock on the `--here` checkout; then abandon both with `arc abandon` and, once the spawned one's
      abandonment has landed on that repository's base, remove its checkout with `arc teardown`. A work unit started in
      this repository would push its branch here, and under `branch.protection: full` teardown removes an unshipped work
      unit's checkout only once its abandonment lands on `origin/main` (`lib/work-unit/verbs/teardown.ts`).
    - In this repository, spawn an Errand: confirm the same lock, refusal, and move, and its removal through
      `arc errand abandon`. Confirm 4.1.c's relock cases pass on the merged base, and request `arc check segment`.

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` On Linux and in a dispatched run of the portability pair, the save-loss harness loses no save timed into a
  replacement, a rebuild, or a file removal — saved in place or by renaming a new file over it — a copy whose path moved
  on kept and reported; an absent file is rebuilt by the link alone and yields to a save that recreated it; and the next
  command's sweep takes over the copies a stopped command left, but for the residuals the spec's § 17 names.

- `[ ]` Before the flip, every checkout ARC spawns for a work unit or an Errand carries `PROJECTION_LOCK_REASON`, or
  keeps a lock another tool set first, reported; under `PROJECTION_LOCK_REASON` a plain `git worktree remove` refuses
  it naming the exits, the removal function removes it or, failing after its unlock, locks it again, and a move keeps
  it; and an `arc start --here` checkout carries none.

- `[ ]` The guard refuses a projected root no rule ignores and an `.arc/user/*/` rule outside `.gitignore`, and passes
  once the line is restored; and `arc init` (with `--reconfigure`), `join`, and `update` write the managed `.ignore`
  block, which re-includes the four roots and keeps a repository's own lines.

- `[ ]` A same-size save inside one modification-time tick reads as changed, and still does after a later index write
  smudges its entry, a file truncated to empty included; and a changed file identity sends a file to the hash.

- `[ ]` Base-stamp recovery takes the exact version a file's content equals, else the closest candidate, else an empty
  base, reading `history` at most once per record between the write-backs the command lands to it; and a save carrying
  the stamp the last persisted write-back read takes the content that write-back took in as its base.

- `[ ]` Taken with the 200 ms bound fan-out and the end use, a sibling's projection lock held past it is skipped and one
  released within it is taken; and no acquire, renewal, or release recreates a removed worktree's Git directory.

- `[ ]` Session-init's stale-worktree offer and branch-gone recovery name `arc teardown <name>`; a registration whose
  folder is missing under the projection's lock takes its typed `arc teardown <name>` where the sweep offers it, and
  otherwise the remedy that runs `git worktree unlock` before the removal; and `strategy-concurrent-work.md` names the
  exit verbs and the lock.

- `[ ]` Before the flip, the worktree lock, the managed `.ignore` block, and this repository's `.gitignore` without its
  `.ignore` line are live.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
