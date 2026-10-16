# Task List: Storage Projection

- **Design:** `spec-storage-projection.md`

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

_Design decisions:_ The work unit starts once `seam-lifecycle`, `seam-locus`, and `storage-ref-backend` have all
landed, so every part that names one of their tasks finds it on base, as 1.1.b takes `seam-locus`'s Task 2.1.a address
for the personal root. Tests run at the unit and integration tiers over the in-memory reference backend
(`__tests__/helpers/store/`) and over `createRefStore`: no CLI process runs over either before the flip, so E2E covers
the dark path and the hooks' wiring alone (§ 1.5).

### `[ ]` **1.1 Write the exclude entries as one path list derived from the layout registry — § 11.1**

- _Goal:_ One Git call and one write register every exclude entry the projection needs, from one list of projected roots
  that nothing keeps by hand, and every other reader of those roots takes the same list.

    - `[ ]` **1.1.a Generalize the exclude writer to a path list**

        - `ensureGitExcludePatterns(root, patterns, exec, fs)` in `lib/git/exclude.ts`: one
          `git rev-parse --git-path info/exclude`, one read, and one write appending, in order, each pattern not yet
          present; nothing is written when every pattern is present. `ensureGitExcludePattern` stays as its
          one-element call, so `writeEditorDocuments` (`lib/schema-command/editor-documents.ts`) and
          `ensureWorktreeMarkerIgnored` (`lib/git/worktree-marker.ts`) keep their calls unchanged.
        - Build `test-first` (one behavior at a time):
            - several patterns land in one write, in order, after the file's existing content
            - patterns already present are skipped, and a file holding every pattern is not written
            - a file without a trailing newline gains one before the first appended pattern
            - a failed path lookup returns the failure and writes nothing

    - `[ ]` **1.1.b The projected roots and the exclude list**

        - This creates `lib/store/projection/`, with a README as the store's other folders carry
          (`lib/store/concurrency/README.md`).
        - One module in `lib/store/projection/` names the projected roots, each resolved through `resolveArcPath`
          (`lib/layout/projection.ts`): the `active` and `completed` placement roots; the backlog root, which has no
          address of its own, as the parent the `planned` and `provisional` placement roots and the project inbox
          (`.arc/backlog/ATOMIC-INBOX.md`) all resolve under; and an identity's personal root through the address
          `seam-locus` adds for it (its Task 2.1.a). It gives each root in two forms: the path resolved for this
          checkout's identity, which the guard (1.2) checks, and the pattern that ignores the root for every identity —
          `.arc/user/*/` for the personal root — which the managed `.ignore` block (1.3) and the Zed settings (5.10)
          write. Each reads this module, never a copy.
        - The projection's tests live under a `store/projection/` folder of their tier from this first task on (2.1).
        - The exclude list is the three shared roots plus `.arc/system/.local/`, the folder holding the aside folder
          (§ 5.4), each as a directory pattern; `.arc/user/*/` stays in `.gitignore` and never enters the exclude file.
          A source's `.arc/system/` paths join the list (§ 14); the store, the only source built here, projects none.
        - The list is written once per clone, when the projection first projects (6.3), so nothing calls it before the
          flip.
        - Build `test-first` (one behavior at a time):
            - the exclude list holds the three shared roots and `.arc/system/.local/`, each with a trailing slash, and no
              `.arc/user` entry
            - each root is the path the layout resolver returns for its address, and the backlog root is the one parent
              of both backlog placement roots and the project inbox
            - the personal root resolves to this identity's folder, and its pattern is `.arc/user/*/`

### `[ ]` **1.2 Guard the projected roots with one `git check-ignore` call — § 11.2**

- _Goal:_ The projection never writes into a root that no rule ignores: one Git call proves every projected root and the
  aside folder ignored, `.arc/user/*/` by `.gitignore` itself, and a refusal names the missing line and clears once it
  is restored.

- _Note:_ The guard's skip — recording each ignore file's existence, stat, and blob id when it passes — lives in the
  index (2.2), its comparison in 2.4.b, and runs from the refresh's write into a root (6.4); this task builds the call
  and its verdict.

    - `[ ]` **1.2.a The call and its verdict**

        - One `git check-ignore -z -v --non-matching --no-index --stdin` over the projected roots and the aside
          folder, each given with its trailing slash, through the stdin executor (`GitExecInput`, `lib/git/exec.ts`).
          `--no-index` judges the rules alone: without it Git skips a path its index holds entries under, and a root
          holding tracked files reads as not ignored. The output is four NUL-terminated fields per path — source,
          line, pattern, path — so a source path holding a colon, such as a Windows `core.excludesFile`, parses intact.
          A path with an empty source reads as not ignored, which is how a directory path a `!` pattern re-includes
          comes back.
        - Exit status 1, which Git returns when it counts no path ignored, is a verdict, not a failure: the executor
          throws a `GitProcessError` (`lib/git/process-error.ts`) whose `stdout` still carries every path's fields.
        - `.arc/user/<identity>/` passes only when its rule's source is the repository's root `.gitignore`, since
          `npm pack` reads only `.gitignore`; the same path ignored from `.git/info/exclude` refuses.
        - The refusal is typed and recoverable: it names each path and the line that would ignore it, and the
          projection writes nothing into that root until a later guard passes.
        - Build `test-first` (one behavior at a time):
            - Integration tier, over a real repository
            - with every root ignored and `.arc/user/*/` in `.gitignore`, the guard passes in one call
            - a root holding a tracked file passes where its rule exists
            - an excludes file whose path holds a colon, set as `core.excludesFile`, parses intact as the source
            - a projected root no rule ignores refuses naming its missing line, and passes once the line is added
            - with no root ignored, Git's exit status 1 yields a refusal naming every path, not a Git failure
            - a root re-included by a `!` pattern refuses as not ignored
            - `.arc/user/*/` ignored only from `.git/info/exclude` refuses naming `.gitignore`, and passes once the line
              moves there

### `[ ]` **1.3 Write ARC's managed `.ignore` block through the setup verbs — § 11.3**

- _Goal:_ Every repository the setup verbs run in carries a tracked root `.ignore` whose ARC block re-includes the four
  projected roots for ripgrep-family search, keeping the repository's own lines.

    - `[ ]` **1.3.a The block and its writer**

        - The block's entries negate the pattern that ignores each projected root, read from 1.1.b's module, so this
          task follows 1.1.b: `!.arc/active/`, `!.arc/backlog/`, `!.arc/completed/`, and `!.arc/user/*/`. A negation
          re-includes only the path its pattern names, so `!.arc/user/` would re-include the parent alone and leave
          every `.arc/user/<identity>/` ignored by `.gitignore`'s `.arc/user/*/` (checked with ripgrep 14.1.1).
        - Written through `writeArcManagedBlock` (`lib/template/files.ts`), which `writeArcGitignoreBlock` wraps and
          which replaces only its own block and keeps every other line. One helper writes both managed ignore blocks,
          so the four verbs share one entry list where each builds the same `.gitignore` list inline today.
        - Build `test-first` (one behavior at a time):
            - an absent `.ignore` gains the block holding the four negations
            - a `.ignore` with a repository's own lines keeps them, and a second write leaves the file unchanged

    - `[ ]` **1.3.b The four verbs**

        - `arc init` (`commands/init.ts`), `arc join` (`commands/join.ts`: `runJoin` and `runJoinReconfigure`),
          `arc init --reconfigure` (`runReconfigure`, `commands/reconfigure.ts`), and `arc update`
          (`commands/update.ts`) write the `.ignore` block beside their `.gitignore` block. It runs live, whatever the
          store's capability.
        - Build `test-first` (one behavior at a time):
            - Beside each verb's existing managed-block test — `__tests__/unit/init.test.ts`, `unit/join.test.ts`, and
              `e2e/update.e2e.test.ts` for `arc update` — and in `unit/reconfigure.test.ts`, which has none, a new one
            - `arc init`, `arc join`, `arc join --reconfigure`, and `arc init --reconfigure` each write `.ignore` with
              the block
            - `arc update` leaves an unchanged `.ignore` byte-identical, and rewrites only the block over an edited file

### `[ ]` **1.4 Stop ignoring `.ignore` in this repository and write its managed block — § 11.5, § 11.3**

- _Goal:_ This repository tracks a root `.ignore` holding exactly ARC's managed block, and its `.gitignore` no longer
  ignores `.ignore`.

    - The `.gitignore` loses the `# Marksman LSP exclusions` comment and its `.ignore` line, which sit outside ARC's
      managed block.
    - The root `.ignore` is the block 1.3.a writes and nothing else; the primary's untracked `.ignore`, holding one
      personal Marksman line, is deleted before this lands (7.10) and its line is not carried over.
    - Verified once by hand with ripgrep in this worktree: `rg --files .arc/user` lists the identity's files, recorded in
      the completion note.

## **Phase 2:** The engine's state

_Purpose:_ Build what each worktree records about its copy and how a command tells an edited file from one it wrote,
the substrate every later phase reads.

_Mode:_ `layer` through Phase 3 — closes on the file substrate: what each worktree records, how it detects an edit,
and how it replaces and removes a file without losing a save.

### `[ ]` **2.1 Run the projection's tests in the portability tier — § 13**

- _Goal:_ Every projection test runs in the portability tier, Phase 1's included — on Linux in each reviewed pull
  request's `portability` job, and on Windows and macOS in the cross-platform pair, which CI runs on its weekly schedule
  and on a dispatch with `run_portability_pair`.

    - The `portability` selectors in `localVitestTierArguments` (`lib/local-vitest-runner.ts`) gain `store/projection/`,
      a path no existing test holds ("projection" alone matches fourteen unrelated tests), and every projection test
      lives under a `store/projection/` folder of its tier.
    - `PORTABILITY_SURFACE_GLOBS` (`lib/change-facts.ts`) gains the module's source and test paths, so the classifier's
      relevance signal (`portability_target`) reports a change there; no CI job consumes that signal, so it selects
      nothing on a pull request.
    - Each segment verifier whose exit criterion names Windows or macOS dispatches the pair on the branch with
      `run_portability_pair: true` and records the run in its completion note.
    - Build `test-first` (one behavior at a time):
        - `isPortabilitySurfacePath` accepts a projection source file and a projection test file
        - the `portability` tier's selectors match every test under a `store/projection/` folder and no other test file

### `[ ]` **2.2 The index, the aside folder, and where they live — § 3.1, § 5.4, § 12.9**

- _Goal:_ Each worktree that holds a projection keeps one machine-local index recording what the projection wrote
  there, written whole under the projection lock, and one aside folder beside its files; a command finds both without a
  Git process, never creates a Git directory, and tells an index it can use from one it cannot.

    - `[ ]` **2.2.a The index's schema**

        - Per entry: the record reference the file was read with, its owner's UID where the store gives one; type, size,
          modification time, and file identity, each read as a bigint and stored as a decimal string; the blob id last
          written into the file; the base — its blob id and record version; marker state (whether the file holds
          markers, their one length for the file, and for each marker set the conflict record it shows or that the
          checkout found it); the conflict record each notice line names, and, for a stampless file or one the replace
          guard holds whole for a resolution in progress or a malformed set (4.4.b), the open conflicts it does not
          show; whether it is protected; the pending, withheld, and refused marks, a refused mark carrying the refusal's
          typed reason and remedy; the stamp the last persisted write-back read and the content it took in — the version
          the write landed, or the kept copy's file name and blob id (2.7); and, for a file other than Markdown, the
          in-progress record — the blob id and record version of the version a replacement in progress replaces, and the
          name of the aside copy its batch makes of the file, none for a rebuild by the link alone (2.8); and, for each
          aside copy a swap makes of the file, listed in the order the swaps were made, while the copy stays in the
          aside folder: its name; the blob id the swap was moving — what the projection last wrote there or, for
          write-back's own copies, the blob id write-back read; the blob id it linked in its place, none for a removal
          (3.4); whether a write-back of the file has been sent since the swap; and, once the copy's take-in lands, the
          blob id the copy held when it landed (3.2.a, 3.3). A file adoption refuses (5.8) takes an ownerless entry: its
          path, stat, and refusal, and no record reference.
        - The refused and pending marks record what the last write-back or refresh met, never what the file holds now. A
          re-read that finds no edit, or an edit that lands whole (4.1.b), clears the refused mark; one whose malformed
          entry was refused while the rest landed keeps it (4.4.b). The pending mark clears only once the file holds
          what a swap batch linked there — a refresh's, or the read-back of a landed edit, by 3.2.b's rule — or, for a
          file whose record has left its path, once it is gone and no aside copy of its path remains, unless the
          projection now lays another record there; a deleted file a record still projects at, that one included, keeps
          its mark, so the next refresh writes it fresh (3.4, 6.3, 6.4.a). A file whose record the projection already no
          longer lays at its path stays pending until a refresh removes it (3.4), and a move the store makes later
          reaches the file through `changes` (6.4.a), so a refresh or removal a file was owed is never dropped. The
          removal check and the persist step re-run the read path rather than trust a mark (7.1, 7.2).
        - Beside the entries: the format version; per source, the state version last projected (only the store is
          built as a source, 6.2); the in-flight view setting, identity, checkout claim, and effective `layout.active`
          it was projected under; the aside copies withheld at a rebuild, by copy name; for each tripwire, its last
          nine measurements in milliseconds (6.10.b); and each ignore file's existence, stat, and blob id when the guard
          last passed (1.2).
        - A strict schema, so a field it does not know reads the index as unusable rather than dropping the field.
        - Build `test-first` (one behavior at a time):
            - an index with every field round-trips, bigints included
            - an unknown field, or a format version other than the running build's, does not parse

    - `[ ]` **2.2.b Where the index lives, found without Git**

        - `<worktree Git dir>/arc-projection/`, also holding the projection lock (2.3) and the kept copies (2.7). The
          Git directory is read from `<checkout>/.git` — a folder, or a `gitdir:` file naming it, as a linked worktree's
          is, where a `commondir` file names the common directory for `info/exclude` — and only where neither form reads
          does `resolveCheckoutGitDir` (`lib/git/exec.ts`) run its Git process, so the start's two Git calls stay two
          (§ 15.3) and a fan-out reads each sibling's from its roster path (6.5.b), skipping one that holds no `.git`,
          or whose aside folder holds no reference stamp, rather than running Git there. One reader in `lib/git/`
          returns both directories, the one `storage-ref-backend`'s Task 3.1.c builds, which this task takes.
        - `arc-projection/` is created by a non-recursive `mkdir` inside an existing Git directory: a missing Git
          directory fails with `ENOENT`, read as a worktree that is gone. The index is written by temp-and-rename
          under the projection lock and re-read after the lock is taken, through an option on `atomicWriteFile`
          (`lib/fs.ts`) that skips its recursive `mkdir`, so no write recreates a removed worktree's Git directory.
        - `MACHINE_LOCAL_PATHS` (`lib/store/registry.ts`) gains `arc-projection/**` under the `git-worktree` root,
          beside `arc-checks/**`.
        - Build `test-first` (one behavior at a time):
            - Integration tier, over a real repository with a linked worktree
            - the primary's and a linked worktree's Git directories are read from `.git` with no Git process, and each
              index lands in its own Git directory
            - a `.git` neither form reads falls back to `resolveCheckoutGitDir`
            - a write that stops before its rename leaves the previous index readable
            - with the Git directory removed, creating `arc-projection/` fails as gone and creates nothing

    - `[ ]` **2.2.c The aside folder and its names**

        - `.arc/system/.local/projection/` inside the worktree, since a rename or link cannot cross volumes: the racy
          reference stamp (`reference`, 2.4) at its top, and aside copies and staged files under `aside/`, in folders
          mirroring the file's path below `.arc/` with the file's own name as the last folder, so a path round-trips
          and no single name grows with it.
        - Each copy or staged file is named `<base blob id>.<pid>-<instance>-<scope>.<nonce>.<role>`: the base blob id
          of the version it replaced, its writer as the projection lock records a holder (2.3) — its process scope as a
          short hex digest, since a scope string holds characters a file name cannot (`pid:[…]`, `win32:host`) — a
          per-move nonce, and the role (`aside` or `staged`); no name ends in `.md`, so `lint:md:fix`'s `**/*.md` glob
          never rewrites a copy. A staged file is created exclusively.
        - `MACHINE_LOCAL_PATHS` gains `{ root: "checkout", pattern: ".arc/system/.local/**" }`, checkout-relative; the
          registry's `as const` literal admits the new root with no type change. `listArcFiles` (`lib/fs.ts`) skips
          `system/.local/` as it skips `system/.internal/`, so `arc health` reports no aside file as new.
        - Build `test-first` (one behavior at a time):
            - two moves of one file in one command take distinct names
            - `listArcFiles` lists no file under `system/.local/`
            - a copy's folder and name parse back to its path, base blob id, writer with its scope digest, and role
            - for a deep backlog path in a SHA-256 repository, every folder and name stays within 255 bytes
            - the registry holds the `checkout` entry (`toContainEqual`, as the registry test does)

    - `[ ]` **2.2.d An index a command cannot use**

        - Reading returns the index, or `unusable` naming whether it is missing, unreadable, or of another format
          version; each caller applies its own policy: materialization withholds (6.3), fan-out and the end skip (6.5),
          the removal check answers `unobservable` (7.1), and the persist and release steps refuse (7.2, 7.3), the last
          two naming the remedy — run the removal or release from that checkout.
        - A checkout 6.1 gives no projection and that holds no index reads as no projection, never as `unusable`; one
          that still holds an index — its marker changed under it — is read as any other, so the removal check and the
          persist and release steps act on it (7.1–7.3).
        - Build `test-first` (one behavior at a time):
            - a missing, an unreadable, and an older-format index each read as `unusable` with that cause

### `[ ]` **2.3 The projection lock — § 3.2**

- _Goal:_ One per-worktree advisory lock serializes the projection's reads and writes in each worktree; a command holds
  at most one at a time, waits 200 ms for a sibling's and skips it, never creates the Git directory of a worktree that
  is gone, and reports the holder of a lock it could not take.

    - `acquireAdvisoryLock` (`lib/advisory-lock.ts`) at `arc-projection/lock`, its holder recording the process ID, the
      per-process instance, and the process scope, and held under a renewable lease (`withRenewableLease`,
      `ADVISORY_LEASE_DURATION_MS`, `lib/renewable-lease.ts`), all through `NATIVE_LEASE_PROCESS`
      (`lib/lease-process.ts`), as the build-ownership lock's holder is (`withBuildArtifactOwnership`,
      `lib/build-ownership.ts`), where the store's per-checkout locks record the process ID alone. A holder in the same
      PID namespace is judged by its process, and one in another — WSL and Windows sharing a checkout, or a container's
      bind mount — only by its lease, so a live holder there is never taken for dead. Where Linux cannot read the
      process's PID namespace, `resolveProcessVisibilityScope` falls back to a scope of its own
      (`linux:unknown:<instance>`), so it and every other process read each other as another scope: a holder judged by
      its lease alone, and a copy taken over by no other process's sweep. The sweep passes the predicate a copy's writer
      with its scope digest and its own scope's digest (2.2.c). An aside copy carries no lease, so a sweep leaves a copy
      written from another process scope, reporting it (3.3), to a sweep from that scope, or to a removal's or release's
      takeover, which takes a copy over live or not once it settles (7.2, 7.3).
    - Its `exclusiveCreate` seam creates the lockfile only inside an existing `arc-projection/` (2.2.b), so a sibling
      whose Git directory is removed during the wait fails as gone and is skipped, recreating nothing.
    - The lease takes its own dependencies, built from `NATIVE_LEASE_PROCESS`: its `renewLock` and `releaseLock` pass
      the same seam to `renewAdvisoryLock`'s and `releaseAdvisoryLockConfirmed`'s options, which `NATIVE_LEASE_PROCESS`
      leaves at the recursive default, so neither a renewal nor a release recreates a removed Git directory. A release
      finds nothing to release where the directory is already gone, `releaseAdvisoryLock`'s holder read finding no
      holder of its own, and where the directory goes after that read its break lock's create fails with `ENOENT`, which
      the lease's `releaseLock` reads as the worktree gone, nothing left to release, so the guarded operation's result
      stands. Its `terminateProcess` ends only that worktree's operation at its next step, reported. A lease is lost
      when its lockfile no longer names this holder or when renewal keeps failing until the last confirmed deadline
      (`withRenewableLease`). Fan-out, the end, and an ordinary start then skip that worktree, as a removed sibling is
      skipped, and the command goes on; the persist and release steps (7.2, 7.3) and `arc save`'s start (4.10) refuse
      with a retry instead, so no removal proceeds past an edit not yet persisted.
    - A command's start and the persist and release steps wait the default bound, 10 s, by leaving `maxWaitMs` unset
      (`DEFAULT_MAX_WAIT_MS` is the module's own); the end and a fan-out wait `maxWaitMs: 200` for every worktree's
      lock, the command's own included. The lock is not reentrant, so the engine's entry points take it at one level
      only, and nothing that runs under it fans out (6.5).
    - The holder a report names is the last one `onWait` observed (`AdvisoryLockContention`), `unreadable` included,
      since `AdvisoryLockTimeoutError` carries none.
    - `lib/advisory-lock.ts` exports the predicate `isMainLockBreakable` applies to a holder — a dead process, or the
      same process ID with another instance, or, in another process scope, a lapsed lease — so the aside folder's sweep
      (3.3) judges a writer's liveness by the same rule.
    - Build `test-first` (one behavior at a time):
        - a sibling held past 200 ms is skipped, and one released within it is taken
        - a worktree whose Git directory is gone before the attempt, or removed while the writer waits, is skipped
          without creating it
        - a command's own lock that times out reports the holder `onWait` last saw
        - the exported predicate answers as the lock's own reclaim does for a dead process and a reused process ID
        - for a holder in another process scope the predicate answers not breakable while its lease lasts, and for a
          copy's writer in another scope, which holds no lease, not breakable at all
        - a renewal whose worktree's Git directory is removed after it reads the holder, through an injected `readFile`,
          recreates nothing, and the lost lease ends the guarded operation at its next step, reported, without
          terminating the process
        - a release whose worktree's Git directory is removed after it reads the holder, through an injected `readFile`,
          recreates nothing and resolves, the guarded operation's result kept

### `[ ]` **2.4 Detect a change by Git's racy rule — § 3.3, § 11.2**

- _Goal:_ A file reads clean only when its stat matches its entry and its modification time is older than the index's
  reference; anything else is hashed, so no same-tick save reads as unchanged and no later index write hides one — and
  the guard's recorded ignore-file stats obey the same rule.

- **Additional Context:** `notes-storage-projection.md` § Spike 2, § Spike 3

    - `[ ]` **2.4.a The reference and the rule**

        - The reference is the stamp file in the aside folder (2.2.c), rewritten after each index write, so it shares
          the projected files' volume and clock. A missing reference makes every entry racy.
        - Clean means type, size, modification time, and file identity match and the modification time is older than
          the reference; a changed identity sends the file to the hash, and an unchanged one never proves it clean.
        - The stat is an `lstat`: a symbolic link at a path the index lists is never followed or hashed, and reads as a
          deleted file (3.1).
        - Build `test-first` (one behavior at a time):
            - a same-size rewrite within one modification-time tick is found by the hash
            - a symbolic link replacing a projected file is never hashed, and its target is never read
            - a replacement keeping size and an older modification time (`cp -p`) is found through its changed identity
            - with the reference missing, every entry is hashed

    - `[ ]` **2.4.b Smudging**

        - Each index write zeroes the cached size of every entry it carries over unchanged that is racy against the
          reference it replaces, after Git's `ce_smudge_racily_clean_entry`; the entries it records are racy against the
          new reference instead. A cached size of zero whose recorded blob id is not the empty blob's always hashes, as
          Git treats a smudged entry, so a save that empties the file is still found. A command that hashes a smudged
          entry clean re-records its stats and writes the index.
        - The ignore-file stats the guard records (1.2) are smudged by the same rule, each against the blob id recorded
          beside it. This task builds the comparison the guard's skip reads — each ignore file's recorded existence,
          stat, and blob id against the file as it is, by the racy rule with smudging, answering changed or unchanged —
          which 6.4.a and the fan-out call before a write into a root. So an ignore file edited in the tick the guard
          passed, truncated to empty included, still reads as changed after a later index write.
        - Build `test-first` (one behavior at a time):
            - an entry racy at an index write is smudged, and a save in its tick is still found after a later write
            - a smudged entry whose file was truncated to empty is hashed and found
            - a smudged entry that hashes clean is re-recorded with its stats
            - an ignore file racy at the guard's pass, after a later index write, still reads as changed
            - an ignore file truncated to empty in the guard's tick still reads as changed

### `[ ]` **2.5 Blob ids, the configuration read, and the base stamp — § 3.4, § 15.3**

- _Goal:_ The projection computes both sides of every content comparison itself — Git blob ids in the repository's
  object format over LF-normalized content with the stamp and notice lines stripped — reads identity, its settings,
  and the object format in one Git call, and keeps each base's record version beside its blob id.

    - `[ ]` **2.5.a Blob ids**

        - `blob <length>\0` plus the bytes, hashed by `node:crypto` in SHA-1 or SHA-256, over content whose CRLF is
          normalized to LF and whose base stamp and notice lines are stripped; never a Git process per file.
        - Build `test-first` (one behavior at a time):
            - Integration tier for the comparison with Git
            - a blob id equals `git hash-object`'s in a SHA-1 and in a SHA-256 repository
            - CRLF content hashes as its LF form, and a stamp or notice line does not change the blob id

    - `[ ]` **2.5.b The one configuration read**

        - One `git config --null --get-regexp '^(arc\.|user\.name$|extensions\.objectformat$)'`, its keys matched
          lowercased as Git prints them (`arc.inflightview`), exit status 1 read as no key set. It prints every scope's
          value in Git's order, so a single-valued key takes its last occurrence, as `git config --get` does, and
          `arc.inflightPin` collects every occurrence. It yields the object format, SHA-1 where the key is absent; the
          in-flight view keys (5.6); and identity, which the identity owner resolves: `lib/git/identity.ts` exports a
          pure resolver over already-read `arc.identity` and `user.name` values — `arc.identity` validated, else
          `user.name` slugified — which `readConfiguredIdentity` and `resolveIdentity` also call, and this read passes
          its two values to it, so no second identity rule exists.
        - The read returns a typed verdict: the settings, or no identity or an invalid `arc.identity` with the remedy
          that sets `arc.identity`. The command start acts on it (4.9.a).
        - Build `test-first` (one behavior at a time):
            - one call returns identity, the view keys, and the object format
            - with no `arc.identity`, identity is `user.name` slugified, through the identity owner's resolver
            - an invalid `arc.identity` returns the no-identity verdict naming the remedy
            - a repository with no matching key reads as SHA-1 with no identity and the default view
            - with `user.name` and `arc.identity` set in both global and local configuration, the local values win, as
              `git config --get` returns them

    - `[ ]` **2.5.c The base stamp and notice lines**

        - `<!-- arc-base: <blob id> -->` on a Markdown file's first line, or on the line after its YAML frontmatter
          where the file opens with one, as D13 places it, and each notice line one HTML comment opening
          `<!-- arc-notice:` in the block directly after the stamp; rendered, parsed, and stripped in one module, which
          the conflict notice (4.7.b) and the protected notice (5.2) render through. Only lines of that form in that
          block strip, so a person's own HTML comment stays content.
        - Build `test-first` (one behavior at a time):
            - a rendered file parses back to its stamp, its notice lines, and the stored content exactly
            - a file opening with YAML frontmatter takes the stamp after it, and parses back with its frontmatter whole
            - a file whose first line, or first line after its frontmatter, is not a stamp reads as stampless
            - a person's HTML comment under the stamp stays in the content and its blob id

### `[ ]` **2.6 Recover a lost base stamp — § 3.5**

- _Goal:_ A file whose stamp was deleted or dropped by a whole-file rewrite merges from the right base — an exact
  version, else the closest candidate, else empty — reading `history` only where it must, once per record per command.

    - Order: content equal, stamp aside, to the index's version, then to a `history` version newest first, takes that
      version; otherwise the closest — the fewest lines changed in a line diff — among the candidates the diff matches
      at least one non-blank line with: the index's version, the content the last persisted write-back took in (2.7),
      and the five newest versions, that content and then the newer version winning a tie; with no such candidate, an
      empty base. Write-back restores the stamp.
    - A stored version taken as the base — the content a persisted write-back took in among them, where 2.7 finds it the
      version the write landed — goes to the store as the expected version; the copy 2.7 keeps otherwise and the empty
      base merge in the checkout (4.5).
    - `history` is memoized per record for the command, the memo passed to the worktrees its fan-out visits and dropped
      for a record once the command's own write to it lands.
    - Where `history` refuses `state-unresolvable` — from `storage-ref-backend`'s Task 1.4, tested through 4.3's
      wrapping store — recovery chooses between the index's version and the content taken in alone and pulls nothing.
    - Build `test-first` (one behavior at a time):
        - content equal to an older version takes that version
        - edited content takes the closest candidate, and a tie goes to the content taken in, then the newer version,
          that content seeded through 2.2.a's fields
        - content sharing only blank lines with every version takes an empty base
        - two files of one record in one command read its `history` once, and a write to it in between reads it again

### `[ ]` **2.7 Keep what a persisted write-back took in — § 3.6**

- _Goal:_ A save carrying the stamp the file's last persisted write-back read merges from what that write-back took in,
  so an editor that never reloads cannot undo what the person changed since.

    - This task builds the index fields and the base selection over them; write-back's read-back (4.1.b) records them.
    - A persisted write-back is one whose write landed, whether or not the store's merge filed conflicts or an entry was
      refused beside it (4.4.b); one refused whole, by write-back or the store, deferred, skipped, or clashing in the
      checkout (4.5) is not one, and leaves these fields as they were. The content taken in is what write-back read from
      the file after parse-back (4.4.b), an entry it refused standing as the version its base holds, each entry carrying
      the `_Id:_` the landed record gave it. Where the record read back is at the version the write returned and its
      content equals the content taken in, set aside the `_Id:_` lines the stamp added — the ID lines whose IDs the
      content taken in lacked, in the kind's line form, with the final newline normalized — that version is the content
      taken in and goes to the store as the expected version. Otherwise — the store merged it onto a newer version,
      another writer landed in between, or a merge in the checkout (4.5) sent its own result — the content taken in is a
      copy kept under `arc-projection/` until a write-back reads a newer stamp, and a save merging from it merges in the
      checkout (4.5).
    - Each entry of the content taken in takes the ID the landed record gave it through one matcher, which 4.1.c also
      restores IDs through against the base: from the reference entries whose `_Id:_` no entry carries, the one whose
      text, apart from its `_Id:_` line, equals the entry's, else the one whose heading — in a field-header list, its
      field header — the entry shares, each only where exactly one reference entry matches; a reference entry's ID goes
      to one entry at most — the one matching it by text, else by heading — and where two entries match it the same way,
      neither takes it. This task builds that matcher in `lib/store/projection/`.
    - After a persisted write-back whose content taken in is kept as a copy, a save of a file other than Markdown takes
      the closer of that copy and the version the write landed as its base.
    - A file whose malformed entry write-back refused while the rest landed keeps its stamp and the base it was rendered
      from (4.1.b), so a save carrying that stamp merges from the content that landing took in, and only the refused
      entry reads as an edit.
    - Build `test-first` (one behavior at a time):
        - a read-back equal to the content taken in apart from stamped `_Id:_` lines records the version written as that
          content
        - a read-back the store merged keeps a copy with the landed IDs, and a write-back reading a newer stamp clears it
        - an entry whose text equals one landed entry's takes its ID though another shares its heading, and a heading
          the landed record holds twice gives an entry matching only by heading no ID
        - a read at a version other than the write's keeps a copy
        - a save carrying the persisted stamp selects the content taken in as its base
        - a landing whose store merge filed conflicts, and one refusing a malformed entry while the rest landed, each
          record the fields; a write-back refused whole, deferred, or clashing in the checkout leaves them as they were
        - two entries matching one landed entry the same way take neither its ID
        - a file kept after a malformed entry was refused, its stamp unchanged, selects the content that landing took in
          as its base, only the refused entry differing

### `[ ]` **2.8 Files other than Markdown — § 3.7**

- _Goal:_ A text file of any kind in a projected root carries no stamp and keeps its base in its index entry alone, and
  old content a stopped replacement left reads as unedited, never written back over the newer version.

    - This task builds the entry's in-progress record, which names the version a replacement replaces and the aside copy
      its batch makes of the file; the base selection over it; and the one deletion of an aside copy every deleter calls
      — the end's second check (4.9.a), a later sweep (3.3), and a removal's or release's takeover (7.2, 7.3) — which
      clears the record when the copy it names is deleted and the file holds what the batch linked there, and clears the
      copy's own record (2.2.a) whenever it deletes any aside copy. The swap sets the record (3.2.b), and a refused move
      restores the entry (3.2.b). A rebuild by the link alone (3.4, 6.7) sets one naming the version it replaces and no
      copy, only where that version is the record's the entry names, never at a path re-laid for another record (3.4);
      the batch's second index write clears it where the path holds the file the batch linked (3.2.b), and where the
      link yielded to a save it stays until the file's next replacement.
    - The entry's version is the base, so a file restored to an older version is an edit. A file not matching an entry
      still holding an in-progress record takes whichever version it equals exactly, by blob id, else the closer of the
      two. An empty one is read only once its modification time is 50 ms old.
    - Build `test-first` (one behavior at a time):
        - a stampless file restored to an older version reads as an edit
        - with an in-progress record, the old content reads as unedited and selects the replacing version
        - deleting the copy the record names clears it once the file holds the linked version, and deleting another
          aside copy of the file leaves it, each deletion clearing the deleted copy's own record
        - an empty stampless file younger than 50 ms waits for the next command

### `[ ]` **2.9 A seeded projection for tests**

- _Goal:_ Tests of Phases 3–5 start from a real projection — stamped files and a matching index — before full
  materialization (6.3) exists, so no test hand-builds index entries.

    - A helper under `__tests__/helpers/store/projection/` writes the records a store lists at the paths its caller
      gives, stamped and rendered through 2.5.c, and the index 2.2.a describes, in a real temporary repository; 6.3
      replaces it in the tests that exercise materialization itself.
    - Build `test-first` (one behavior at a time):
        - a seeded worktree's files are clean against its index by the racy rule once the reference is newer than
          them

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
      or `arc sync` rebuilds deleted files (6.7).
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

- **Additional Context:** `notes-storage-projection.md` § Spike 1, § Spike 1b, § Spike 7

    - `[ ]` **3.2.a The replace guard and the take-in port**

        - Before replacing, the re-check runs the racy rule against a baseline (2.4): the index entry, or, for the file
          write-back just sent (4.1.b) or just drew a clash into (4.5), the stat and blob id write-back read, which the
          caller passes so its own edit never reads as a new one. On a mismatch the file goes to the take-in, then the
          guard re-reads the record's current version and restages it, at most three passes. A refused refresh marks the
          file pending.
        - The take-in is a port the guard, the second check (3.2.c), the sweep (3.3), and removal (3.4) call, bound to
          write-back in 4.9.a and a test double until then. It takes the worktree whose file holds the edit, whose
          rights apply rather than the writer's; the path or the aside copy; its index entry; and its base — the stamp,
          or, stampless, the base blob id the copy's name carries. It answers `no-edit`, `taken-in`, `deferred`,
          `refused`, `unparseable`, `clashed` — an edit that merged in the checkout and clashed (4.5) — or `pending`.
        - Every swap's first index write records beside each aside copy, in its file's entry in swap order (2.2.a), the
          blob id it was moving — what the projection last wrote there or, for write-back's own copies, the blob id
          write-back read — and the blob id it linked in its place, none for a removal (3.4). Write-back replaces a file
          itself in two ways — reading back a landed edit (4.1.b), adoption's included, whose verb-owned fields take the
          minted record's values (5.8.b), and drawing a clash found in the checkout (4.5) — and only where it refused
          nothing the file held (4.1.b), so the aside copy such a swap makes holds nothing write-back has not taken in
          or, at adoption, deliberately set. A copy holding the blob id its swap was moving, or the one it held when its
          own take-in landed, answers `no-edit` without reaching the port wherever it is read — at the first and second
          checks, the sweep, a removal's or release's takeover, and the removal check (7.1); a copy holding anything
          else goes to the port, checked against its own base stamp or, stampless, the base blob id its name carries.
        - A copy's path has moved on while it holds anything but the blob id its swap linked — a later save there, a
          write-back's read-back, another replacement — and, present or absent, once a write-back of it has been sent
          since the swap; an absent path with no write-back sent since has not moved on, whatever it held before. A copy
          holding an edit is taken in only while its path has not moved on; once it has, the copy is kept in the aside
          folder, reported with its path and never sent or merged, until the person deletes it, and the removal check
          and the persist and release steps refuse over it (7.1–7.3). Before each write-back of a path sends an edit
          (4.1.a), an index write records, beside every aside copy of the path but the one it takes in, that a
          write-back has been sent since that copy's swap, so a stop after the write lands leaves the record; a send
          that lands nothing leaves it too, which only keeps a copy. Once a copy's take-in lands, its entry records the
          blob id the copy held. 2.8's deletion clears a copy's record, and the sweep drops a record whose copy is no
          longer in the aside folder (3.3).
        - What each answer does where:
            - At the guard: `no-edit` re-records the file's stat as its baseline and replaces it; `taken-in` takes the
              next pass; `deferred`, `pending`, `refused`, and `unparseable` leave the file unreplaced and pending, its
              edit in place, a refused or unparseable one also marked refused; `clashed` leaves it unreplaced too,
              holding its clash's markers (4.5), pending.
            - At the second check and the sweep: a copy is deleted only once it answers `no-edit` or its `taken-in` edit
              has landed whole; a `deferred` or `pending` copy stays in the aside folder for the next command's sweep,
              which sends it again while its path has not moved on; a `refused`, `unparseable`, or `clashed` one goes as
              3.2.c states; and a copy holding an edit once its path has moved on is kept, reported with its path.
            - At a removal's or release's takeover there is no next sweep: a `deferred` or `pending` copy, or one that
              never settles, is kept and refuses the step with a retry (7.2, 7.3); a `clashed` copy is kept and refuses
              it as held by a conflict; and a copy holding an edit once its path has moved on is kept and refuses it,
              naming the copy's path and the remedy of copying out what it holds and deleting it.
            - At removal (3.4): a file whose take-in answers `deferred` or `pending` stays at its path, its entry marked
              pending, and the refresh retries a pending file whose record has left this projection as a removal
              (6.4.a); a `clashed` one stays at its path, or goes back to it, holding its clash's markers (4.5),
              pending, and the removal check refuses over it (7.1). In a release step (7.3), which leaves no projection
              to retry from, a `deferred` or `pending` file refuses the step with a retry instead, a `refused` or
              `unparseable` file, linked back to its path, refuses it with its remedy, and a `clashed` one refuses it as
              held by a conflict.
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

    - `[ ]` **3.2.b The swap and its outcomes**

        - The index and its reference are written first (2.4), once for all the files a swap batch replaces — a
          refresh's (6.4) or a read-back's (4.1.b) — and the files it removes (3.4), each entry recording its new base,
          or, for a removal, kept as it was, marked pending, and, for a file other than Markdown, an in-progress record
          naming the version being replaced and the aside copy the batch makes of it, or no copy for a rebuild by the
          link alone (2.8), and, for each file it moves aside, the aside copy's record — its name, the blob id it is
          moving, which for write-back's baseline (4.1.b, 4.5) is the blob id write-back read, and the blob id it links,
          none for a removal (2.2.a, 3.2.a); then each file is renamed into the aside folder (2.2.c), its staged file
          hard-linked onto the path, and its aside copy checked through the take-in.
        - Where the projection now lays another record's file at the path of a file a batch removes — a path-keyed
          companion re-laid by a changed claim (6.6) — the batch removes it only, as any removal (3.4), its entry
          staying the leaving record's while the file or any aside copy of the path remains, so every take-in of the
          file or a copy of it goes to the record it was projected from; the next refresh after both are gone lays the
          arrival (3.4).
        - Once its swaps are done the batch writes the index again, under the same lock, clearing the pending mark of
          each file whose path still holds the staged file it linked, its file identity the one the entry records (2.4),
          and, for a file rebuilt by the link alone, its in-progress record (2.8). A file swapped back or linked back at
          its first check (3.2.c), saved over, or left unreplaced by a move or link keeps its mark, and so does a file a
          read-back replaced that was already pending, which the next refresh settles, removing it where its record has
          left the path (3.4, 6.4.a); the caller says whether the batch is a read-back. A stop between the two writes
          leaves the file pending in any root, `completed/` included, its old file reading as unedited — after a
          refresh's first write a Markdown file equals its own stamp's version, and any other matches the version its
          in-progress record names (2.8); after a read-back's, the file holds what its write-back took in, which 2.7
          reads as no new edit — so write-back finds no edit in it and the next refresh writes it again.
        - Each outcome leaves the index true: in place, the entry records the new version; a link refused because the
          path reappeared yields to that save, the replaced version still recorded; a move still refused past
          `retryTransientFileSystemRefusal`'s bound (`lib/kernel/fs-retry.ts`) leaves the file in place, its entry
          restored and pending; a link failing for another reason after the move links the aside copy back, pending.
        - The projection closes its own handles before moving a file; the rename and link run inside the bounded
          retry, and a read-only file moves aside and links in with its mode intact.
        - Step hooks after the re-check, after the move, and after the first check let tests and the harness (3.5) place
          a save in each interval.
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
          (4.5), the file pending and held by them; otherwise kept as a copy whose path has moved on is, reported with
          its path as a clash to resolve by hand, which the removal check refuses over (7.1) and a removal's or
          release's takeover refuses as held by a conflict.
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

- **Additional Context:** `notes-storage-projection.md` § Spike 7

    - Under the projection lock, before write-back reads any file — the stat walk may start first, and write-back
      re-reads the stats of each path the sweep linked back or replaced (4.9.a) — every command touches only the copies
      and staged files whose writer has exited, judged by the predicate the lock exports (2.3): a copy whose path is
      absent and has not moved on (3.2.a) is linked back, yielding if the path reappeared; every other copy is read as
      3.2.a states — no edit while it holds the blob id its swap was moving or the one it held when its own take-in
      landed, its edit taken in only while its path has not moved on, a refused or clashed one handled as 3.2.c states,
      and otherwise kept and reported with its path; leftover staged files are deleted; deleting the aside copy a file's
      in-progress record names clears the record, through 2.8's deletion, once the file holds what the batch linked; and
      a copy's record whose copy is no longer in the aside folder — moved back to its path, or never made after a stop —
      is dropped. The reference stamp is left alone, and a copy the index lists as withheld is left by every sweep until
      the person deletes it. A copy written from another process scope, which the predicate never reads as exited, since
      a copy holds no lease, is left and reported with its path.
    - With no usable index (2.2.d) it takes nothing in: an absent path's copy is linked back, a copy equal to its
      base is deleted, and every other copy stays and is reported. The sweep returns those copies' names, and the
      materialization that rebuilds the index records them as withheld (6.3).
    - Build `test-first` (one behavior at a time):
        - a copy left by an exited writer with its path absent is linked back
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
      the next refresh removes (6.4.a); with no usable index it is withheld and reported (6.3). A refused edit, to a
      record now archived for one, goes back to its path by link, reported, its entry marked pending; an edit that
      clashes in the checkout stays at its path, or goes back to it, holding its clash's markers (4.5), pending, the
      removal check refusing over it (7.1); a take-in that defers leaves the file at its path, pending; and each later
      command's refresh retries the removal of a pending file whose record has left this projection (6.4.a). A withheld
      file (6.3) is never removed. Where the projection now lays another record at the removed file's path (3.2.b),
      deleting the last aside copy of that path, the file gone, leaves the entry pending as a deleted file rather than
      dropping it (2.2.a), so the next refresh lays the arrival there by the link alone, recording no replaced version
      (2.8); while the file or any copy remains, the entry stays the leaving record's and the arrival waits.
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

- **Additional Context:** `notes-storage-projection.md` § Spike 1, § Spike 1b, § Spike 3

    - A harness under `__tests__/integration/store/projection/` drives the engine's swap, link, and removal while a
      writer saves in place, by renaming a new file over the path, and by truncate-then-write as VS Code and Zed do,
      with a reader holding the file open with delete access shared.
    - Each interval — re-check to move, move to link, first check to second — is reached two ways: placed exactly
      through 3.2.b's step hooks, and by a randomized run of 1,000 saves per save mode within the integration tier's 30
      s budget. The harness requires no lost save in either; a save left in a copy kept because its path moved on
      (3.2.a), reported with its path, is kept rather than lost and counted as its own outcome. Each hook places the
      save its interval can catch, which must produce that interval's outcome, counted per platform, so a hook that
      never fires fails the run: after the re-check, an in-place or rename-over save, rescued from the aside copy at the
      first check; after the move, a save that recreates the path, which the replacement yields to; after the first
      check, a write through a handle opened before the move, rescued at the second check. The randomized run reports
      its own count of each outcome, which the second check's rarity can leave at zero.
    - It runs in the portability tier (2.1); the Windows and macOS evidence is a dispatched run of the pair, recorded
      in this task's completion note.

## **Phase 4:** Write-back and conflicts

_Purpose:_ Send each hand edit through its kind's parser, write check, and the store's merge at every command's start
and at `arc save`, and show the conflicts the store files, and the clashes the checkout finds, in the file.

_Mode:_ `slice` — closes on a hand edit in a projected file persisting through the command's start and `arc save` over
the reference backend, its conflicts drawn into the file and parsed back.

_Exit criterion:_ Over the reference backend in a real repository, driven through the engine's start and `arc save`'s
handler, an edit to a projected file reaches the store at the next command's start under `write-back` and at
`arc save` under `save`; a stale edit merges through the store and its clash lands as a conflict record drawn back into
the file as markers; resolving the markers persists naming the conflict; an edit the write check refuses stays in its
file, reported on stderr ahead of the command's output; and through the CLI over the in-repo implementation the hooks
do nothing and `arc save` refuses `unsupported`.

_Design decisions:_ The base version 4.5 passes in `MergeTextInput` and the hunk record's `baseVersion`, `currentLines`,
and `incomingLines` 4.7.a places from are `storage-ref-backend`'s Task 1.6.a; the reference backend's stale-base parse
refusal 4.6 exercises is its Task 1.8; and the `state-unresolvable` refusal 5.3 exercises is its Task 1.4. The engine's
process state (4.9.a) is the one place every later phase's process-wide state and ports live. Adoption is Phase 5's
(5.8), after the addresses and edit rights it reads.

### `[ ]` **4.1 Parse an edit and send it against its base — § 7.1**

- _Goal:_ Each hand-edited file reaches the store as its own write: its IDs restored, parsed by its kind's parser, sent
  against the record version its base names, merged by the store where it has moved on, and replaced by the record read
  back, with what the write-back took in kept for a stale buffer's next save.

    - `[ ]` **4.1.a Parse and send**

        - In order: parse back the markers (4.4.b), so each marker set becomes the side or the text it sends; restore
          and de-duplicate entry IDs over that result (4.1.c); parse it with the kind's parser; stamp a copy of any
          entry lacking one (4.5) before any merge in the checkout; merge where the store holds no base (4.5); run the
          write check (4.2); record in the index, beside every other aside copy of the path, that a write-back has been
          sent since its swap (3.2.a); send.
        - The file's kind comes from its index entry, or, for a new file, from adoption (5.8); its parser from the
          production registration set (`lib/store/kinds/registrations.ts`). A file that fails to parse is skipped and
          reported, its edit kept and its entry marked refused (2.2.a). A symbolic link, at a projected path or as an
          aside copy, is never read: write-back answers `no-edit` for it and reports it (3.1, 5.8.c).
        - The write is a content `put` (`MutationSchema`, `lib/store/write.ts`) to the entry's record reference, with the
          base's record version as its expected version. A `work-item/meta` write, `MutationSchema`'s primary, carries
          its current placement unchanged, its read form less `sequence`, which `WritePlacementSchema` rejects; a cohort
          document's write carries none; no write carries a changed placement, a former slug, or a link. Each file is
          its own `write`, never a `batch`.
        - Every entry kind takes the ID restore, stamp, and merge, `work-item/description`, `work-item/inbound`, and
          `personal/errand-queue` among them, whose entry grammars `seam-locus`'s Task 4.2.b declares
          (`KIND_MECHANISMS`, `lib/store/registry.ts`).
        - Build `test-first` (one behavior at a time):
            - an edited prose file is written once, against its base's record version
            - a file that fails its kind's parser is skipped and reported, and the file keeps its content
            - a meta's write carries its placement unchanged and no `sequence`
            - two edited files are two writes, and one refused leaves the other landed
            - an Errand description's entries keep their IDs through a hand edit
            - a write-back stopped after its write lands, before the read-back's index write, leaves the record beside
              the path's other aside copies, so the next sweep keeps a copy holding an edit rather than linking it back
              to the path the person then deleted

    - `[ ]` **4.1.b Read back**

        - After a write lands, write-back reads the record back and records 2.7's state — the stamp it read and the
          content taken in, the version written or a kept copy — either way a persisted write-back. Where it refused
          nothing the file held, it clears the refused mark and replaces the file through the swap (3.2), the record
          read back — its blob id and record version — becoming the file's base, never what was sent (2.5), its
          conflicts drawn in (4.7), the re-check's baseline the stat and blob id write-back read (3.2.a), which its
          first index write records beside the aside copy (2.2.a), as a read-back's batch: its second index write clears
          the pending mark it set, and a file already pending keeps its mark for the next refresh (3.2.b). Where it
          refused a malformed entry's persist while the rest landed (4.4.b), the file keeps the person's content, its
          stamp, and the base it was rendered from, pending, its refused mark and remedy kept, and its entry records the
          record's open conflicts, reported beside the refusal (4.4.b); no swap runs, since the entry's text exists
          nowhere else.
        - Build `test-first` (one behavior at a time):
            - a stale edit the store merges is replaced by the merged record, and the index's base is the merge's version
            - an entry the backend stamped shows its `_Id:_` in the file after read-back
            - a read-back holding the content taken in records the version written, and a merged one keeps a copy with
              the landed IDs
            - a save landing between write-back's read and its read-back replacement is taken in, and the sent content
              is not sent again
            - a landed edit's read-back leaves no pending mark on the file it put in place
            - a file other than Markdown whose edit landed has its read-back's aside copy deleted as no edit, nothing
              sent again
            - a file pending before its edit landed is still pending after the read-back
            - a landing beside a refused malformed entry keeps the file's stamp and base, and records and reports the
              record's open conflicts

    - `[ ]` **4.1.c Entries typed by hand**

        - Before sending, and before any merge in the checkout, once the duplicated-`_Id:_` rule below has run, an entry
          with no `_Id:_` takes an ID its base carries, through 2.7's matcher: from the base entries whose `_Id:_` no
          entry in the file carries, the one whose text, apart from its `_Id:_` line, equals the entry's, else the one
          whose heading — in a field-header list, its field header — the entry shares, each only where exactly one base
          entry matches; a base entry's ID goes to one entry at most, and where two entries match it the same way,
          neither takes it. An entry its base lacks is left for the stamp. A duplicated `_Id:_` left by an editor's
          "accept both" gives the second entry a fresh ID drawn from a seeded stream this task builds, so a retry after
          a stop sends the same one: a SHA-256 stream in `lib/store/projection/` over `digestBytes`
          (`lib/kernel/canonical/canonical-json.ts`), seeded by the record's reference, the base content, and the file's
          content, which 4.5's entry merge draws from too.
        - Build `test-first` (one behavior at a time):
            - an entry whose `_Id:_` line was deleted takes its base's ID back by its heading
            - a heading the base holds twice matches nothing, and the entry is left for the stamp
            - an entry whose text equals a base entry's takes that entry's ID though another base entry shares its
              heading
            - two ID-less entries matching one base entry by heading both take none, and a base entry whose ID an entry
              in the file still carries gives it to no other
            - an "accept both" duplicate gives its second copy a fresh ID, and sent again after a stop it lands once

### `[ ]` **4.2 Check an edit with the kind's write check and the `after` view — § 7.2, § 7.3**

- _Goal:_ An edit persists only if its kind's write check, run as a hand edit over the merged result, admits it — a
  change to a verb-owned field refused there and kept in its file — and an `after` view answers as the backend will once
  the write lands, which a conformance case holds.

    - `[ ]` **4.2.a The check's input**

        - `writer: { kind: "hand-edit" }`; the record's reference; `prior`, the store's current version with its content
          and parsed fields, or its content alone where it fails to parse, and absent for an adopted file; `next`, the
          merged content and its fields — for a merge kind with a stale base, the store's merge run in the checkout with
          the same library over the base's content, read through `history` (2.6); for a meta or task list over a verb's
          newer write, 4.5's merge; never the file alone; and `before` and `after` (`WriteCheckInput`,
          `lib/store/write-check.ts`).
        - Every rule the check returns is reported with its remedy and sets the refused mark; the edit stays in its
          file. A `history` read that refuses `state-unresolvable` takes 5.3's path.
        - Build `test-first` (one behavior at a time):
            - an edit changing a verb-owned field is refused with the check's rule, and the file keeps its content
            - an entry kind's stale-base edit is checked over the merged entries
            - an edit leaving `State` alone over a verb's newer `State` is admitted, since `next` merges the verb's change
            - an edit repairing a record stored unparseable is checked against its content alone

    - `[ ]` **4.2.b The `after` view**

        - In `lib/store/projection/`, built from `before`, the written record's reference, and the pending write's
          content and parsed fields — the check's `next` — never a parser of its own: `read` and `list` answer the
          written record from the pending write, its `conflicts` as `before` holds them, and everything else from
          `before`; a record absent from `before` takes a placeholder version and its owner's placement; `lookup` is
          `before`'s for every kind.
        - Build `test-first` (one behavior at a time):
            - `read` of the written record returns the pending content, and of any other record `before`'s
            - `list` of the written record's family returns the pending record in its place
            - a record absent from `before` reads and lists from the pending write

    - `[ ]` **4.2.c The conformance case**

        - A new item in the store's conformance suite (`registerStoreConformanceSuite`,
          `__tests__/helpers/store/conformance-suite.ts`), its eighteenth, which widens `SuiteItem`
          (`__tests__/helpers/store/fixture-contract.ts`) and the `conformanceItems` map: for each hand-editable kind —
          each whose mechanism's `projection` is not `never` (`KIND_MECHANISMS`, `lib/store/registry.ts`) — over each
          backend that runs checks, the `after` view built before a write answers `read`, `list`, and the slug, lineage,
          claim, and ref lookups as the backend does once the write lands, compared apart from each result's `version`
          and `asOf`, the written record's `conflicts`, the conflict records the landing files or removes, and the
          `_Id:_` values the landing stamps. The pending fields come from the fixture's parser override, as
          `suite-write-checks.ts`'s `checked` builds them. The commit lookup stays outside it.
        - Build `test-first` (one behavior at a time):
            - the case passes over the reference backend for every hand-editable kind
            - the case passes over the ref backend's fixture (`storage-ref-backend`'s suite registration)

### `[ ]` **4.3 Persist under hand-edit provenance, and wrap the test store — § 7.4–§ 7.6, § 1.5**

- _Goal:_ Every persist of a hand edit lands under `write-back`, or `save` at `arc save`, with the lifecycle action
  `edit`, set by write-back and never read from the file; a serialization or unhomed-kind refusal is a refused edit
  with its remedy; and one test store returns the refusals the reference backend cannot.

    - Provenance imports `HAND_EDIT_VERBS` (`lib/store/links.ts`); the persist and release steps (7.2, 7.3) use
      `write-back`.
    - `checkSerializationRules` is the ref backend's (its Task 5.1); write-back keeps no copy of the rules and reports
      the backend's `record-malformed` refusal as it reports any. A kind with no parser or write check persists
      unvalidated, and an `unsupported` `unhomed-kind` refusal is a refused edit carrying the backend's remedy.
    - A test store under `__tests__/helpers/store/projection/` wraps the reference backend and returns `unsupported`
      `unhomed-kind`, which its fixture excludes; it returns `state-unresolvable` (`storage-ref-backend`'s Task 1.4)
      naming a missing history ref on a write and on `history`, and records a `pull({ history })` (its Tasks 1.2 and
      1.3, the by-name history fetch its Task 9.1.b), after which the retry lands (5.3).
    - Build `test-first` (one behavior at a time):
        - write-back's write carries `write-back` and `edit`, and `arc save`'s carries `save`
        - a file naming another verb in its content still persists under `write-back`
        - an `unhomed-kind` refusal leaves a refused edit carrying the backend's remedy
        - stamp recovery (2.6) under a `history` refusing `state-unresolvable` chooses between the index's version and
          the content taken in, and records no pull

### `[ ]` **4.4 Render conflict markers and parse them back — § 6.1, § 6.2, § 6.4**

- _Goal:_ Markers render at one length per file — seven, or escalated with a resolve-by-hand line where the file holds a
  marker-like line — and parse back exactly, each set to its own conflict: untouched markers keep a stored conflict
  open, replaced markers resolve it, a clash found in the checkout keeps its file unsent, and a malformed set refuses
  until repaired.

- **Additional Context:** `notes-storage-projection.md` § Spike 4

    - `[ ]` **4.4.a Rendering and length**

        - Standard Git markers, the store's side first, each labelled with its machine or session and time. Each set's
          start label also carries the conflict record's ID, or `checkout` for a clash found in the checkout (4.5), so
          each set names its own conflict however many share a merge's labels.
        - The length is seven unless any line in the file, inside a side or outside the sets, is marker-like — it starts
          with seven or more of one marker character, a setext `=======` among them; then it is the longest such run
          plus four, one length for every set in the file, so no content line holds a run of that length, and each set
          carries, right after its start marker, an HTML comment telling the person to resolve by hand and delete the
          line with the markers. The index records the one length.
        - Build `test-first` (one behavior at a time):
            - a plain clash renders at length seven, the store's side first, its start label naming the conflict record,
              with no resolve-by-hand line
            - a setext `=======` inside a side escalates every set to eleven characters, each with the line
            - a setext `=======` outside the sets escalates every set
            - a `<<<<<<<` line in a fenced block outside the sets escalates every set

    - `[ ]` **4.4.b Parsing back**

        - Parsing matches markers of exactly the recorded length, and reads each set's origin from its start label,
          checked against the conflicts the index holds open for the file; a set whose label names none of them is
          malformed. A stored conflict's set left as it was sends the store's side in its place; replaced by text, it
          sends the text naming the conflict in `resolves`, riding the file's own write; a set whose markers stand but
          whose sides differ from those its conflict record holds is a resolution in progress, which write-back refuses,
          its remedy naming the set to finish or restore: its whole file, for every kind, stays pending, unsent, and
          reported, taking a refused edit's routes (3.2.a, 3.2.c), so the replace guard leaves it unreplaced, the
          store's other changes reaching it once the resolution is sent, and an aside copy holding one goes back to its
          path with its bytes as they are where 3.2.c sends a refused copy back, and is otherwise kept as 3.2.c keeps
          it; a conflict already resolved elsewhere is dropped from `resolves`, its text sent as an ordinary edit. A set
          the checkout found (4.5) keeps its file pending and unsent, for every kind, while it stands.
        - Malformed — an incomplete set at the recorded length, or a resolve-by-hand line left behind — refuses the
          entry, or the whole file for prose, with a typed remedy, and persists once repaired. The write carries each
          refused entry as its base holds it — none, where its base has no such entry — so the landing leaves the
          store's version of that entry as it was. A take-in refusing one is a refused edit, whether the rest lands or
          nothing else is left to send, and the replace guard holds the file whole while the set stands. Where the rest
          lands, the file keeps the person's content, its stamp, and its base, pending and refused (4.1.b), so its next
          write-back merges from the content that landing took in (2.7) and only the refused entry reads as an edit. An
          aside copy holding one is refused whole, sending nothing, and takes a refused copy's routes (3.2.c): back to
          its path where that path has not moved on, the file's own take-in then landing the rest, and otherwise kept,
          reported with its path. Write-back reports every resolution it sends.
        - A file the replace guard holds whole, for a resolution in progress or a malformed set, is not drawn into
          (4.7), so its index entry records its record's open conflicts it does not show — those of the record read back
          after a landing (4.1.b), and those of the version each refresh that leaves it unreplaced reads (6.4.a) — until
          the file is next replaced with the record, which draws them. Write-back reports them beside the file's
          refusal, with the repair that releases the file as their remedy, and `arc status` shows them (4.9.c).
        - Build `test-first` (one behavior at a time):
            - untouched markers keep the conflict open and the record holds the store's side
            - an entry kind's untouched markers keep their conflict open, the entry's second version keeping its `_Id:_`
            - an edit inside a side, the markers standing, is refused naming the set, and its file, another entry's edit
              in it included, stays pending and unsent through a command
            - markers replaced by text persist naming the conflict, and the conflict closes
            - of two sets from one merge, resolving the second closes its conflict and keeps the first open
            - a longer marker run added while resolving does not confuse the parse
            - a missing end marker refuses the entry with its remedy while another entry's edit lands, the file keeping
              the set's text through the command, pending and refused, and the repaired file persists and is replaced
            - a resolution that leaves the resolve-by-hand line refuses, and VS Code's Accept Current and Accept
              Incoming on an escalated set whose current side holds a `=======` line each refuse; a hand resolution
              deleting the markers and the line persists
            - a conflict resolved from another checkout first is dropped from `resolves`, its text merged as an edit
            - a landing beside a refused malformed entry leaves the store's version of that entry as it was
            - a file holding a malformed set merges its next write-back from the content the last landing took in, only
              the refused entry reading as an edit
            - a malformed set with nothing else to send refuses the file as a refused edit, unsent
            - an aside copy holding a malformed set is refused whole and goes back to a path that has not moved on,
              where the file's take-in lands the rest
            - a conflict the store files while a malformed set holds the file is recorded in its entry and reported
              beside the refusal, and drawn once the set is repaired
            - a prose file holding a clash the checkout found keeps its markers and is not sent

### `[ ]` **4.5 Merge in the checkout where the store holds no base — § 7.7**

- _Goal:_ The three edits whose base the store never held — a save merging from content a persisted write-back took in
  and kept as a copy, content sharing no non-blank line with any candidate, and a hand edit to a meta or task list over
  a verb's write — merge in the checkout onto the store's current version; a clean result is sent, and a clash stays in
  its file as markers, never stored.

    - The merge uses `mergeLineText` or `mergeEntryText` (`lib/store/concurrency/`) with the base's record version in
      `MergeTextInput`, which `storage-ref-backend`'s Task 1.6.a adds — null for the empty base and the kept copy — and
      side labels (`SideLabelSchema`, `lib/store/conflict.ts`): this checkout's machine, from the machine ID
      `storage-ref-backend`'s Task 3.1.d moves to `lib/store/machine-id.ts`, and the save's modification time for the
      edit; the record version it merged onto and the time write-back read it for the
      store's side.
    - A clash's markers are rendered inline as `mergeLineText` builds its result, through an option on it that takes
      4.4.a's renderer as a callback, since `lib/store/concurrency/` imports nothing from `lib/store/projection/`
      (`store-concurrency`, `eslint/architecture-imports.ts`), at 4.4.a's length, so no placement step can miss. An
      entry kind merges through `mergeEntryText` first, and a clean result is sent; where it clashes, `mergeLineText`
      runs over the same base and sides, and a clean line merge is the clean result, sent with both sides' lines; where
      that clashes too, its markers are the file's, since its every clash has one span to draw, where an entry clash
      keeps one side and a prose clash spanning an entry has none.
    - An entry merge stamps its own copy first (`stampEntryIds`, `lib/store/concurrency/stamp.ts`), its random source
      4.1.c's seeded stream, so a result sent again after a stop carries the same IDs. A field-header entry with no
      `_Remove when:_` line is found before stamping and is a refused edit, `record-malformed`, naming the entry.
    - The file is stamped with the version it merged onto, and the index marks each marker set as found in the checkout
      (4.4.b). Drawing the markers replaces the file by the swap, its guard's baseline what write-back read and its
      aside copy write-back's own (3.2.a), so a save that landed in the copy is taken in. A file one of whose entries
      write-back refused (4.4.b) is not drawn into: the clash is reported beside that refusal and drawn once the entry
      is repaired. Once its markers are resolved, the file writes back as an ordinary edit against that stamp.
    - A clash found while taking in an aside copy has no file of its own: the take-in answers `clashed` (3.2.a), and
      3.2.c puts the copy back at its path, where write-back, taking the file in there, merges it again and draws the
      clash as this task draws any, or keeps it, reported. A resolution in progress (4.4.b) is refused, never a clash,
      so its copy goes back with its bytes as they are where its path has not moved on (3.2.c).
    - Build `test-first` (one behavior at a time):
        - a stale buffer's save, its content taken in kept as a copy, merges from that copy and keeps the other writer's
          change
        - the next edit of a file kept after a malformed entry was refused, whose landing the store merged, merges in
          the checkout from the content taken in
        - a clean merge in the checkout lands its result, the content taken in is the file as read, kept as a copy, and
          the buffer's next save under that stamp keeps the other writer's change
        - content sharing no non-blank line with any candidate merges against an empty base, its clashes kept in the
          file
        - a hand edit to a meta over a verb's newer write clashes into markers and stays pending, unsent
        - an entry kind's clash, and a prose clash spanning an entry, each render whole through the line merge
        - an entry clash whose line merge is clean sends the line merge's result
        - the clash, resolved by hand, persists as an ordinary edit
        - a save placed into a drawing's swap by 3.2.b's after-re-check hook is taken in, never deleted as no edit
        - a clash beside a malformed set in another entry draws nothing, both reported, and is drawn once the set is
          repaired
        - the same merge run twice stamps the same IDs
        - a field-header entry missing `_Remove when:_` is refused naming the entry

### `[ ]` **4.6 Handle each refusal the store returns — § 7.8, § 1.5**

- _Goal:_ A refusal lands nothing and loses nothing: each code leaves the edit in its file, marked refused or pending,
  and takes the path its section names, exercised over the reference backend and, for the refusals it cannot return,
  the wrapping test store (4.3).

    - `record-malformed` leaves a refused edit reported with its rule and remedy. `version-conflict` on a merge kind
      reads the record: gone, it takes the removal path's refused edit (3.4); still there, the stamp is treated as lost
      and the file goes to stamp recovery (2.6) once per command, a second `version-conflict` leaving it pending and
      reported. `lock-held` marks the file pending. `state-unresolvable` on a write to a completed item, or on a merge's
      `history`, is 5.3's, and `unsupported` `unhomed-kind` is 4.3's. Any other refusal lands nothing, and the next
      command sends the edit again.
    - A command stopped after a write lands and before the index records it sends the edit again at its next run.
    - Build `test-first` (one behavior at a time):
        - a stale-base merge the kind's parser rejects refuses `record-malformed`, the edit stays reported, and the
          repaired edit lands
        - `version-conflict` for a record now absent takes the removal path's refused edit
        - `version-conflict` whose expected version is outside the record's history recovers the stamp once, and a
          second leaves the file pending
        - `lock-held` leaves the file pending, and the next command lands it
        - a prose write landed but unrecorded is sent again, and the record's content holds the edit once

### `[ ]` **4.7 Draw the conflicts the store files into the file — § 6.3**

- _Goal:_ A conflict the store files shows in every checkout that renders its record — markers where placement's check
  passes, and a notice line where it fails or the conflict is whole-record — never markers placed by guess.

- **Additional Context:** `notes-storage-projection.md` § Spike 6

    - `[ ]` **4.7.a Placing an entry or hunk conflict**

        - An entry conflict goes around the entry its `_Id:_` names; one whose ID the content being written lacks shows
          as a notice line. A hunk conflict is placed at its start line moved through a diff from the base content into
          the content being written (`relocateTextOffsets`, `lib/store/concurrency/line-merge.ts`, its character offsets
          converted from the record's line range), spanning `currentLines`, and accepted only where those lines equal
          the current side and the line beside each end equals the line beside the base range in the base content, or
          the file's edge; the base content is read through `history` at the record's `baseVersion`, empty where it is
          null, and `incomingLines` draws the incoming side exactly. Where `history` refuses `state-unresolvable`, the
          conflict shows as a notice line and nothing is pulled.
        - Build `test-first` (one behavior at a time):
            - an entry conflict is drawn around its entry
            - a hunk conflict rendered at its filing version is placed on its lines
            - after an unrelated later edit it is still placed, and after an edit touching its neighbors it is not
            - an empty incoming side and a side of one blank line draw differently, by their counts
            - a `history` refusing `state-unresolvable` shows the conflict as a notice line

    - `[ ]` **4.7.b Notice lines and stampless files**

        - A placement that fails its check, and a whole-record conflict, show as a notice line (2.5.c) naming the
          conflict as `<family>/<owner type>/<owner name>/<id>`, the token `arc save --resolve` parses back (4.10); the
          incoming side's machine or session and time; where that side reads, in status, as `seam-status-roadmap` shows
          both sides; and the remedy, `arc save --resolve <conflict>`. Refresh writes the line only while the conflict
          is open; deleting it changes nothing.
        - A file with no stamp takes the markers of a conflict whose placement passes, and shows any other nowhere in
          the file, its index entry recording it; a file the replace guard holds whole (4.4.b) is not drawn into, its
          entry recording its open conflicts until the file is next replaced with the record. The index maps each marker
          set and notice line to its conflict record.
        - Build `test-first` (one behavior at a time):
            - a failed placement shows as a notice line naming the conflict's token and the remedy
            - an entry merge's prose hunk spanning an entry shows as a notice line
            - a whole-record conflict a pull files shows as a notice line
            - a stampless file takes a placeable conflict's markers, and records an unplaceable one in its entry alone
            - a file held for a resolution in progress is not drawn into, its conflicts recorded in its entry, and draws
              them once replaced

### `[ ]` **4.8 Keep a conflicted file refreshing — § 6.6**

- _Goal:_ A conflicted file keeps taking the store's other changes by a three-way line merge, takes a resolution made
  elsewhere when unchanged since it was written, and waits, reported, only where the store's change overlaps an open
  marker set — one function the refresh calls (6.4.a). A file holding a resolution in progress or a malformed set never
  reaches it: the replace guard holds it whole, a refused edit, until the resolution is sent or the set repaired
  (4.4.b).

    - Base: the stored version the file was rendered from, read through `history` (2.6); current: the store's newer
      version; incoming: the file, markers included, merged by `mergeLineText` whatever the kind's mechanism. Where
      `history` refuses `state-unresolvable`, the file keeps its version, pending and reported, and nothing is pulled.
    - A marker set whose conflicts all closed elsewhere leaves when the file is unchanged since the projection wrote it;
      a closed conflict's notice line leaves at the same refresh; a conflict the newer version files is drawn by 4.7's
      rules; merged content bringing in a marker-like line re-renders every set at the escalated length (4.4.a); an
      overlap keeps the file's version, pending and reported, and each later command retries.
    - Build `test-first` (one behavior at a time):
        - a change elsewhere in a conflicted file refreshes in, its markers kept
        - a conflict resolved from another checkout leaves an unchanged file's markers
        - a store change overlapping open markers keeps the file pending and reported
        - a newer version bringing a setext `=======` re-renders the markers escalated
        - a `history` refusing `state-unresolvable` keeps the file's version, pending

### `[ ]` **4.9 Write back at every command's start, and report it — § 2.2, § 1.4**

- _Goal:_ Every `arc` command starts by writing back pending edits under its worktree's projection lock and ends with
  the second check, reporting each refused, skipped, deferred, withheld, or conflicted file on stderr ahead of its own
  output — and over the in-repo implementation the hooks return at once.

    - `[ ]` **4.9.a The engine's start and end**

        - The entry points take the command's store — in production one `createStore` builds over the checkout, in
          tests the reference backend or `createRefStore` — and bind the take-in (3.2.a) to write-back, under the
          rights of the worktree whose file holds the edit.
        - One module in `lib/store/projection/` holds the engine's process-wide state, since `createStore` builds a new
          store at each call site: the skip verdict — set by 2.5.b's no-identity verdict, by a start whose lock wait
          timed out or whose lease was lost (2.3), and by the switch (5.9) — whether this process holds a projection
          lock, the fan-out's rounds (6.5), the `history` memo (2.6), each checkout root's claim and effective
          `layout.active` (5.4.c), and the ports the root hook (4.9.b) binds at every command: the take-in bound to
          write-back, the rights function (5.1), adoption's mint (5.8.b), and materialization (6.3). `withFanOut`'s
          dependencies read it; a process whose root hook never ran — a script, or a test that binds nothing — fans out
          nothing, and each sibling refreshes at its next command.
        - The start takes the worktree's projection lock, which makes no Git call, then starts 2.5.b's configuration
          read, `version()`, and the stat walk together, the personal root's walk waiting for the identity. With no
          identity or an invalid `arc.identity` it releases the lock and runs the command as under `--skip-projection`
          (5.9), reporting the remedy that sets `arc.identity`. Otherwise it sweeps the aside folder (3.3), writes back
          pending edits — re-reading the stats of each path the sweep linked back or replaced, since the walk began
          before it — and runs the refresh, then releases the lock; its write-backs fan out once after release. A lock
          held past its bound runs the command as under `--skip-projection`, its edits pending, reporting the holder
          `onWait` last saw. A lease lost while the start runs (2.3) stops its projection work at its next step and runs
          the command the same way, reporting the loss, its unsent edits pending.
        - Write-back checks every projected root but `completed/` — the checkout's own work item, the personal surfaces,
          its in-flight views, and `backlog/` — and finds new files by walking those roots' folders without following
          links (`lstat`), skipping the folders `MACHINE_LOCAL_PATHS` lists; `completed/` is checked by `arc save`
          (4.10), the removal check, and the persist and release steps (7.1–7.3), and wherever a refresh touches a file
          (5.3).
        - Refresh (6.4), fan-out (6.5), and materialization (6.3) are slots Phase 6 fills, inert until then.
        - _Retired in:_ Phase 6
        - The rights port and adoption's mint stay unbound until 5.1 and 5.8.b bind them: an unbound rights port grants
          the edit, and an unbound mint adopts nothing.
        - _Retired in:_ Phase 5
        - The end takes each worktree's lock again for the second check (3.2.c), deleting each copy through 2.8's
          deletion, which clears the in-progress record naming that copy once the file holds what the batch linked, and
          the copy's own record; each swap batch's second index write has already cleared the pending marks it settled
          (3.2.b). A lease lost there skips that worktree, its copies left to the next sweep.
        - Every entry point returns at once while `capabilities.stateOffBranch` is false.
        - Build `test-first` (one behavior at a time):
            - Integration tier, over a seeded projection (2.9) and the reference backend
            - a pending edit is written back at the next command's start
            - an edit in each projected root but `completed/` is found at the start, and one in `completed/` is not
            - a new file in a backlog folder is found by the walk, and nothing under an identity's `.internal/` is
              walked
            - with no identity, the start runs the command with the projection off and reports the remedy
            - with the executor injected, the configuration read and `version()` are both issued, after the lock is
              taken, before either returns
            - a start that cannot take its lock, with the wait injected, runs the command, leaves the edit pending, and
              reports the holder
            - a start whose lease is lost mid-write-back runs the command as under the switch, reporting the loss, its
              unsent edits pending
            - an end whose lease is lost skips that worktree, and the next command's sweep takes its copies over
            - a drawing's copy a failed command left is deleted by the next command's sweep as no edit, the markers kept
              whether or not the person has edited them, and no text the person removed comes back
            - a stampless file whose rebuild yielded to a recreated save is written back against the replaced version,
              keeping the store's change
            - a store built at another call site in the process reads the ports the hook bound
            - the end clears the in-progress record of a file replaced in place
            - a stale buffer's save landing in an aside copy clashes at the second check and goes back to its path, its
              clash drawn as markers, pending, and the drawing's own aside copy is deleted as no edit, the markers
              staying
            - a resolution in progress landing in an aside copy goes back to its path at the second check with its bytes
              unchanged, reported as refused
            - a copy the sweep links back after the stat walk began is read at its new stats
            - over the in-repo implementation, the start and end touch no file and make no Git call

    - `[ ]` **4.9.b The root hooks and the report**

        - `cli.ts` registers the start as a root `preAction` hook after the dev-build guard, and the end as a root
          `postAction` hook, which Commander skips when an action fails. The start hook runs `arc save`'s start too, in
          its `save` form, which 4.10 builds and tests: every projected root written back under `save`, `completed/`
          included; a lock held past its bound, a lease lost while it runs, or no identity, refusing rather than running
          the command; a missing history ref pulled and retried once (5.3); and each `--resolve` conflict attached to
          its subject file's write. Its sweep, refresh, port binding, and fan-out are any start's.
        - The report lists each file refused, skipped, deferred, withheld, or kept as a conflict, with its typed reason
          and each rule's remedy, argv included, each aside copy kept because its path moved on, with its path, each
          open conflict a file held for a resolution in progress or a malformed set does not show, and each resolution
          sent; it goes to stderr before the command's output, so a JSON result on stdout stays whole.
        - Build `test-first` (one behavior at a time):
            - a refused task-list tick (`task-list.close`) is reported ahead of the command's output, at the integration
              tier through the start over the reference backend
            - an aside copy kept because its path moved on, and an open conflict a held file does not show, are each
              reported, the copy with its path
            - E2E tier, through the CLI over the in-repo implementation: the hooks run around a command and its
              `--json` stdout parses whole

    - `[ ]` **4.9.c What `arc status` reports**

        - `arc status`'s composite view gains a projection section — what stays refused or pending, every withheld file,
          ownerless files (2.2.a's ownerless entries), every aside copy kept for the person, with its path, and the open
          conflicts a stampless or held file does not show — which its handler reads from the index without writing it:
          a field on `StatusResult` (`commands/status/types.ts`), which its `--json` output writes as it writes the
          rest, and a section in its rendered summary. The composite result has no registered schema, and none is added.
        - Build `test-first` (one behavior at a time):
            - a refused edit and a withheld file each appear in `arc status`, and the refused edit leaves once resolved;
              an aside copy kept because its path moved on appears with its path and leaves once deleted

### `[ ]` **4.10 `arc save` and its `--resolve` — § 2.4, § 6.5**

- _Goal:_ `arc save` writes back every pending edit in every projected root, `completed/` included, under `save`, and
  returns the state version; `--resolve <conflict>` resolves a conflict shown without markers, refusing every case it
  cannot; and before the flip it refuses `unsupported` naming `arc user save`.

    - A new command in `cli.ts`, in `HELP_GROUPS[""]` (`lib/cli-help-content.ts`) and the command-input declarations,
      with a handler that takes the command's store. Its start is the engine's start in its `save` form, which this task
      builds and the root hook runs (4.9.b): each file its own write; a lock held past its bound refuses naming the
      holder and a retry, and a lease lost while it runs (2.3) refuses with a retry; a refusal naming a missing history
      ref is pulled and retried once (5.3); and with no identity (2.5.b) it refuses naming the remedy that sets
      `arc.identity`. Its refusal of `--skip-projection` comes with the switch (5.9).
    - `--resolve` parses 4.7.b's token and finds its conflict in the index's mappings, whose references carry the
      owner's UID (2.2.a), never building a store reference from the token alone. On a token the index does not map, it
      lists the store's conflicts with no owner in the listing's input (`ListInputSchema`, `lib/store/read.ts`), since
      each backend resolves an owner named without a UID to a single holder, the live one first (`listReference`,
      `__tests__/helpers/store/read.ts`; `spec-storage-ref-backend.md` § 8), and matches the token's family, owner type,
      owner name, and ID itself, only to choose the refusal below, refusing as ambiguous, naming each, where several
      owners match; it never resolves from that listing. It attaches the conflict to its subject file's write, sent even
      when the file is unedited, which keeps the store's side. It refuses, each with its remedy: an unknown conflict;
      one already closed, named as resolved; a subject with no projected file in this checkout, naming where it projects
      or its owner; a conflict this checkout shows with markers, naming them; a whole-record conflict whose other side
      is a removal, a verb-owned field, or a changed placement, naming the verb that redoes the change; a withheld
      subject file, naming 6.3's remedy; and a subject file the replace guard holds whole for a resolution in progress
      or a malformed set (4.4.b), naming the repair that releases it — finishing the resolution or repairing the set —
      after which the conflict shows as 4.7 draws it. The withheld subject's refusal is tested at 6.4.a, and the refusal
      for a subject with no projected file here at 5.6, once what each reads exists.
    - Build `test-first` (one behavior at a time):
        - Integration tier, through the start in its `save` form and the handler, over the reference backend
        - `arc save` persists an edit in `completed/` that no other command's start scans, and prints the state version
        - `arc save` takes in an aside copy an exited writer left
        - `arc save --resolve <conflict>` with the subject file unedited keeps the store's side and closes the conflict
        - each other `--resolve` refusal names its remedy, and the same conflict resolves once the cause is repaired
        - `--resolve` on a conflict whose subject file holds a malformed set refuses naming the repair, and the conflict
          draws into the file once the set is repaired
        - a token is found through the index's mapping, its owner's UID included
        - a token the index does not map, whose owner name two owners with that conflict ID share, refuses as ambiguous,
          naming each
        - a lock held past its bound refuses naming the holder, and the retry lands
        - a lease lost while it runs refuses with a retry, and the retry lands
        - with no identity it refuses naming the remedy
        - E2E tier, through the CLI over the in-repo implementation: `arc save` and `arc save --resolve` refuse
          `unsupported` naming `arc user save`, and the help inventory lists `save`

### `[ ]` **4.11 A hand edit persists through write-back** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds end to end on a freshly merged base.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - In one scripted repository over the reference backend, run the exit criterion's scenario through the engine's
      start and `arc save`'s handler — an edit, a stale edit and its conflict, its resolution, a refused edit — then the
      CLI over the in-repo implementation, and request `arc check segment`.

## **Phase 5:** Edit rights, the `active/` layout, adoption, and settings

_Purpose:_ Settle the rules every write-back and refresh obeys — who may edit what, where each record projects, which
record a new file belongs to — and the settings that steer them.

_Mode:_ `layer` — closes on the rules every write-back and refresh obeys: edit rights, protected files, the layout's
addresses, adoption, and the settings that select them.

_Exit criterion:_ Every projected path resolves through `resolveArcPath` and inverts back through the classifier to its
record; an edit to a protected file is refused naming where it can be made, and an archived file's owner corrects it in
place; a new file adopts by its folder or refuses naming where it goes; the in-flight view setting and `layout.active`
select what projects where; `--skip-projection` runs a command with no write-back; and `arc editor` merges and removes
only ARC's keys.

_Design decisions:_ The classifier's two steps are `seam-locus`'s Task 3.6.a, the holding-checkout lookup its Task 2.4,
the finder for a checkout claimed in place its Task 2.7, and the path function its Task 1.9; a write to a completed
item, its refusal, and the history pull that answers it are `storage-ref-backend`'s Tasks 6.3, 1.4, and 9.1.b, and a
companion's path key, with the ref backend's stored path and codec for it, is that work unit's too (§ 18).

### `[ ]` **5.1 Edit rights by lifecycle state and kind of record — § 8.1**

- _Goal:_ Write-back decides who may edit a file by its record's lifecycle state and kind, never by the folder it
  projects to: stubs by anyone; an in-flight work unit's prose by its owner from any checkout, and its meta and task
  list only from the owning checkout; an Errand's description and a work item's inbound list by its owner from any
  checkout; cohort documents, live or archived, and the project inbox by anyone; personal records by their identity
  alone; archived work by its owner (5.3); and nothing of another person's work items, their inbound lists included,
  where routing inserts arrive through the routing verb.

    - One function in `lib/store/projection/` answers from the record's lifecycle state, kind, and owner, the editing
      identity, and the work item the checkout's marker names (6.1). This task binds it to the rights port 4.9.a leaves
      unbound, through which write-back reads it; the persist refusal (5.2), adoption (5.8), the protected mark a
      refresh records (2.2.a), and the removal check (7.1) read it too, and rights follow the worktree whose file holds
      the edit (3.2.a).
    - Build `test-first` (one behavior at a time):
        - a stub's file is editable by any identity
        - an in-flight work unit's spec is editable by its owner from another checkout, and its meta is not
        - an Errand's description and a work item's inbound list are editable by their owner from any checkout
        - another person's inbound list is protected
        - a cohort document, live and archived, and the project inbox are editable by any identity
        - another identity's working memory is protected
        - with the port bound, write-back reads rights through it, refusing an edit to another identity's working memory

### `[ ]` **5.2 Protect a file in three layers — § 8.2**

- _Goal:_ A file the reader may not edit says so where it is read, is read-only on disk, and refuses at persist naming
  where on this machine the edit can be made — the refusal keyed on the content change, never the mode.

    - The notice line is an HTML comment beside the base stamp, after Go's `Code generated … DO NOT EDIT.`, naming where
      an edit can be made: the checkout on this machine whose marker names the work item, from `seam-locus`'s
      holding-checkout lookup (its Task 2.4); where none does, `arc materialize <slug>` for its owner, with `--here` and
      the checkout where a markerless one has the work branch out (its Task 2.7's finder); the owner for anyone else;
      for archived work another person owns, its owner; and for a read-only source's file, the source (6.2). It never
      names another machine. Where the lookup rejects — a failed scan, an incomplete roster, an unreadable marker, or
      two holders — the notice and the refusal name the lookup's repair in place of a checkout.
    - The file is written read-only (0444, or Windows' read-only attribute); the swap keeps the mode (3.2.b). The persist
      refusal compares content against the base, never the mode, and names the place from the markers as they stand
      when it fires. A file other than Markdown carries the mode and the refusal but no notice line.
    - Build `test-first` (one behavior at a time):
        - a protected meta is written read-only with a notice naming the owning checkout's path
        - an edit forced through the mode is refused at persist, stays in the file, and is reported naming the checkout
        - with no checkout here holding the work item, the notice names `arc materialize <slug>` for its owner
        - a markerless checkout with the work branch out makes the notice name `--here` and that checkout
        - a lookup rejecting over two holders makes the notice name its repair
        - a protected stampless file carries the mode and refuses an edit, with no notice line

### `[ ]` **5.3 Edit archived work in place — § 8.4**

- _Goal:_ The archived work unit's owner corrects its files in `completed/` from any checkout, meta and task list
  included, as a write in place that keeps its archive number; anyone else's archived work is read-only; and a missing
  history ref is pulled by name and retried once only where the network may be waited on.

    - Write-back does not scan `completed/` (4.9.a), so a correction persists at `arc save`, at the persist or release step
      (7.2, 7.3), or when a refresh touches the file. Each kind's write check applies.
    - A write to a completed item, or a `history` read a merge in the checkout makes, that refuses `state-unresolvable`
      naming its history ref is pulled by name (`pull({ history })`) and retried once at `arc save` and the persist and
      release steps; where the state remote lacks the ref too, the edit stays refused, carrying the backend's remedy. At
      any other command's start the refusal stays refused with a remedy naming `arc save`, and nothing is pulled.
    - Build `test-first` (one behavior at a time):
        - Integration tier, over the reference backend and the wrapping test store (4.3)
        - the owner's correction to an archived meta persists at `arc save` and keeps its archive number
        - another person's archived file is protected and its edit refused
        - at `arc save`, a missing history ref is pulled, the test store records the pull, and the retry lands
        - where the pull leaves the ref missing, the edit stays refused with the backend's remedy
        - at another command's start, the same refusal stays refused with the `arc save` remedy and nothing is pulled

### `[ ]` **5.4 Register the `active/` locations and the projected file names as layout addresses — § 10.1, § 10.2, § 9**

- _Goal:_ Every path the projection writes resolves through `resolveArcPath` and inverts back through the classifier
  to one record: `active/current/` for the checkout's own work item and its cohort copies, `active/in-flight/<slug>/`
  for the other work items its view selects, and every file name the projection defines.

    - `[ ]` **5.4.a The two locations**

        - The active placement (`ArcLayoutAddressSchema`, `lib/layout/schema.ts`) gains its two projected locations —
          the checkout's own, carrying the effective `layout.active` value (5.5) and the slug of the work item the
          checkout claims, since `lib/layout/` imports no configuration and reads no marker (`layout-dependencies`,
          `eslint/architecture-imports.ts`), and another work item's — beside today's flat form, which the in-repo
          implementation keeps resolving. Inverting a path at the checkout's own location — under `active/current/`, or
          at the top of `active/` where `layout.active` is `flat` — takes that slug and the effective `layout.active` as
          its inputs, since the path holds no slug a hyphenated name could not also claim, and the top of `active/`
          names a record only under `flat`; `seam-locus`'s overlap check (`handleErrandCheck`, its Task 3.6.b) passes
          both, read from the checkout's marker and configuration as 5.4.c reads them. `resolveArcPath`
          (`lib/layout/projection.ts`) projects each, and a cohort document takes an address at the checkout's own
          location for its copy there, a second path of one record.
        - Build `test-first` (one behavior at a time):
            - a work unit's meta resolves under `active/current/` at its own location and under
              `active/in-flight/<slug>/` at another's
            - at the own location with `flat`, it resolves to `.arc/active/meta-<slug>.md`
            - a cohort document's copy resolves into `active/current/` and inverts to the cohort document's record

    - `[ ]` **5.4.b The file names**

        - A companion (`work-item/companion`) is keyed by a managed path — `keyed("work-item", "path")` in `KIND_SHAPES`
          (`lib/store/catalog.ts`), the key `personal/document` already takes — with the ref backend's stored path and
          codec for it, from `storage-ref-backend` (§ 18). That backend refuses a key colliding with its own folders and
          files in the work item's ref, one an earlier decode form would claim, or one through a segment Git refuses,
          and write-back reports each as a refused edit (4.6). The in-repo implementation refuses `unsupported`
          `unhomed-kind` every key but a name of lowercase letters alone or a paired spec's half, since any other file
          name it builds fails `companionPath`'s matcher (`artifactMatcher`,
          `lib/work-unit/mutators/relocate-artifacts.ts`; `lib/store/in-repo/paths.ts`).
        - Addresses for a work unit's companions as `<name>-<slug>.md`, keyed `<name>`; any other text file in a work
          item's folder, or in a folder beneath it, as a companion keyed by its path below that folder, forward
          slashes, projected back at that path; a paired spec's halves as `spec-<slug>-prd.md` and
          `spec-<slug>-rfc.md`, keyed `spec-prd` and `spec-rfc`; `inbound-<slug>.md`; `errand-<slug>.md` for an Errand's
          description; a cohort document's copy as `cohort-<cohort>.md`; `scratch/` documents, each keyed by its path;
          and `STATUS.USER.md` as a user document, the identity status view's rendered path.
        - The inverse tries, in order: a work unit's artifact names (`WorkUnitArtifactKindSchema`;
          `parseArtifactFilename` is private to `lib/layout/identification.ts`, so the inverse lives there); the fixed
          forms — a paired spec's halves, `inbound-`, `errand-`, and a cohort copy; `<name>-<slug>.md`; then the path
          key. The schema refuses a companion key equal to `meta`, `tasks`, `draft`, `spec`, `notes`, `errand`,
          `inbound`, or `cohort`, as the ref backend does; one beginning `cohort-`, which D13 reserves inside
          `current/`; and a path key an earlier form would match. The `<name>-<slug>.md` form claims neither `spec-prd`
          nor `spec-rfc`, so no key resolves to a path that inverts to another.
        - In the same change each new address takes its kind and key in the classifier's exhaustive store-side map
          (`seam-locus`'s Task 3.6.a), which the compiler holds. A record projects only where an address exists for its
          kind, so the Errand queue (`personal/errand-queue`) projects nothing.
        - Build `test-first` (one behavior at a time):
            - each new address resolves to its path and the classifier inverts the path back to its kind and key
            - `research-<slug>.md` inverts to a companion keyed `research`, and `diagram.svg` to one keyed `diagram.svg`
            - a file in a work item's subfolder inverts to a companion keyed by its relative path
            - `inbound-<slug>.md`, `errand-<slug>.md`, a cohort copy, and a paired spec's halves each invert to their own
              kind, never to a companion
            - under `active/current/`, `notes-x-<slug>.md` for a hyphenated slug inverts to the companion `notes-x` by
              the claimed slug
            - given the claimed slug and `flat`, `spec-<slug>-prd.md` at the top of `active/` inverts to that work
              item's paired-spec half, and `notes-x-<slug>.md` to its companion `notes-x`; given `nested`, neither
              inverts to a record
            - a companion key equal to a fixed name, or one an earlier form would claim given as a path, is refused
            - a companion named `cohort-x` is refused, and a new `spec-prd-<slug>.md` is never read as a paired spec's
              half
            - the in-repo implementation refuses a path-keyed companion `unhomed-kind`
            - the Errand queue has no address and projects nothing

    - `[ ]` **5.4.c Paths callers resolve from the flip**

        - The path function `seam-locus`'s Task 1.9 adds under `lib/store/` takes the checkout root beside its slug and
          placement. Where the store's `capabilities.stateOffBranch` is true, it reads the checkout's claim from its
          marker (`readWorktreeMarker`) and the effective `layout.active` (5.5), once per checkout root in a process,
          kept in the engine's process state (4.9.a), since one process resolves paths for sibling checkouts too, and
          returns the `active/current/` path for the work item the checkout claims and the `active/in-flight/<slug>/`
          path for any other, which holds a file only where the view selects it (5.6); over the in-repo implementation
          it returns today's paths, which the tracked files hold, reading neither.
        - A process that rewrites a checkout's marker — an in-place claim (`writeAnchoredMarker`, `seam-locus`'s Task
          2.5.a), a promotion (`convertSpawnedMarker`), or a release — drops that root's cached claim, so its next
          resolution reads the marker again.
        - This task updates each caller `seam-locus` composed to pass its checkout root: the compaction seed's emitter
          and recovery's relocation (its Task 1.9), the evidence's cohort document path (its Task 2.1.b), the resolved
          work unit's path (its Task 2.3), the session-notes resolver's readers (its Task 2.8.a), the load-set
          projection's callers (its Task 2.8.b), and session-init's slot paths (its Task 5.1); `candidatePath`
          (`lib/store/current-work-unit.ts`) resolves through it too. The current work unit already resolves from the
          marker and the store (its Tasks 2.1 and 2.3).
        - `seam-lifecycle`'s meta path, `workUnitMetaPath` (`lib/store/lifecycle-write.ts`), maps every active placement
          to the flat `.arc/active/meta-<slug>.md`, and `lifecycleRecordPath` (`lib/store/lifecycle-record-path.ts`)
          places a work unit's other records beside it; `lifecycleArtifactPath` (`lib/store/lifecycle-storage.ts`) maps
          an active placement to the same flat path for activation and deactivation (`activate-deactivate-store.ts`),
          graduation's reported `metaPath` (`commands/start-store.ts`), and the lifecycle view (`lifecycle-view.ts`),
          and reconciliation keys its acquired records by `lifecycleRecordPath` (`store-reconcile-context.ts`), so the
          two must agree. This task resolves both functions' active arms through the same path function, taking the
          checkout root, so every path a from-the-flip verb reports or keys — `arc set-stage`'s `Meta:` line and the
          finalize, archive, reopen, promote, rename, design-repoint, reconcile, publish, and Errand-promotion arms
          among them — names the file the projection lays there. Each caller passes the root of the checkout the path is
          for, which the compiler finds: graduation into a spawned worktree passes that worktree's root
          (`occupation.worktreePath`), and in-place graduation its own (`ctx.cwd`). The snapshot reader beside
          `lifecycleArtifactPath` (`snapshotFs`), which also calls it, builds an in-memory tree for the integration
          compositions' lifecycle summary, which walks `active/` without recursing (`collectLifecycleMetaFiles`,
          `lib/work-unit/lifecycle-index.ts`), so it moves to a helper of its own that keeps the flat active path.
        - Build `test-first` (one behavior at a time):
            - over the reference backend, the checkout's own meta path is under `active/current/`, and another work
              unit's under `active/in-flight/<slug>/`
            - with `layout.active: flat`, the checkout's own meta path is `.arc/active/meta-<slug>.md`
            - two checkout roots resolved in one process each get their own work item's `active/current/` path
            - from the flip, `arc set-stage` reports the checkout's own meta under `active/current/`, and
              `lifecycleRecordPath` places its task list beside it
            - from the flip, `arc activate` reconciles over the reference backend, and graduation into a spawned
              worktree reports its meta under that worktree's `active/current/`
            - from the flip, over the reference backend under `nested`, the checkpoint lifecycle summary finds an
              integrating active work unit
            - a claim written in place mid-command resolves the claimed work item's path under `active/current/` at the
              next resolution
            - over the in-repo implementation, the path is today's `.arc/active/meta-<slug>.md`, and no marker or
              configuration is read

### `[ ]` **5.5 The `layout.active` revert key — § 10.3**

- _Goal:_ A project can set `layout.active: flat` in `arc-config.yml` to lay its checkout's work item flat in `active/`,
  leaving everything else unchanged, and a change takes effect at each checkout's next command.

    - An enum field in the configuration schema (`lib/config/schema.ts`), `nested` by default, in the file's flat dotted
      key form; `arc config validate` lists it (`VALIDATION_DOMAIN_ORDER`, `commands/config/validate.ts`), the schema
      test's key list gains it, and both copies of `arc-config.yml` document it.
    - The projection reads it and passes it to the checkout's own location (5.4.a); the index records the effective
      value (2.2.a), and a command reading a different one reprojects `current/` (6.6).
    - Build `test-first` (one behavior at a time):
        - with no key, the value is `nested`
        - an unknown value is refused by `arc config validate`

### `[ ]` **5.6 The in-flight view setting — § 10.4**

- _Goal:_ A person chooses which other in-flight work items project — `mine` by default, `cohort`, or `all`, plus pinned
  slugs — through personal `git config` keys read in the projection's one configuration read.

    - `arc.inflightView`, one value, and `arc.inflightPin`, one entry per pinned slug, set with `git config --local` and
      read by 2.5.b's call, which reports them lowercased (`arc.inflightview`, `arc.inflightpin`), the last
      `arc.inflightView` winning and every `arc.inflightPin` counting. An unknown value reads as `mine`, and a pin
      naming no in-flight work item selects nothing; `arc status` names each.
    - The selection lists in-flight work items from the store with no owner filter: the identity's own for `mine`, the
      other members of the checkout's work unit's cohort for `cohort`, every one for `all`, plus the pins; the checkout's
      own work item is never among them.
    - The index records the effective setting, pins included, with the identity and checkout claim; reprojection on a
      change is 6.6.
    - Build `test-first` (one behavior at a time):
        - with no key set, the view is `mine`
        - `cohort` selects the cohort's other members, and a pin adds a work item outside it
        - `all` selects another person's in-flight work unit
        - the checkout's own work item never appears in the selection
        - an unknown value reads as `mine`, and `arc status` names it
        - `arc save --resolve` on a conflict whose subject projects in no file here refuses naming where it projects or
          its owner

### `[ ]` **5.7 Project a paused work unit as any in-flight one — § 8.3**

- _Goal:_ A paused work unit projects where any in-flight one does, under the same rights, its protected files' notice
  naming its owning checkout here or, with none, `arc materialize <slug>`.

    - From the flip a pause is a section of the meta that changes neither `State` nor placement, so nothing in the layout
      reads it; the notice follows 5.2, since `arc resume` only clears the pause.
    - Build `test-first` (one behavior at a time):
        - a paused work unit's files project under `active/in-flight/<slug>/` with the in-flight view
        - with its checkout released, its protected file's notice names `arc materialize <slug>`

### `[ ]` **5.8 Adopt files the store does not know — § 9**

- _Goal:_ A new file is adopted by the folder it appears in, through the one layout classifier, or refused naming where
  it belongs; a new `backlog/` folder with a parseable meta becomes a stub owned by the adopting identity; and editor
  and system side files and derived views are never adopted.

    - `[ ]` **5.8.a Classify by folder**

        - The classifier (`seam-locus`'s Task 3.6.a, over 5.4's addresses) maps a path to a kind and key:
          `active/current/` and a stub's folder adopt into that work item; `active/in-flight/<slug>/` takes the owner's
          prose only (5.1); `completed/` adopts into its archived work unit (5.3); a path it maps to no record — the top
          of `active/` or `backlog/`, the identity root outside `scratch/`, a commitment or quarter folder — refuses at
          persist, naming `current/`, `scratch/`, or a work item's folder. Under `layout.active: flat` the top of
          `active/` is the checkout's own work item's folder, and adopts into it.
        - Build `test-first` (one behavior at a time):
            - a new file in `active/current/` adopts into the checkout's work item
            - a new file at the top of `active/` refuses naming `current/`, and under `flat` adopts into the checkout's
              work item
            - a new file in a stub's folder adopts into that stub
            - another person's new prose in `active/in-flight/<slug>/` is refused
            - over the ref backend's fixture, a new file at `review/notes.md` in a work item's folder is a refused edit
              carrying the backend's remedy

    - `[ ]` **5.8.b A new stub**

        - A new folder under `backlog/` holding a meta that parses and names no `Owner` but the adopting identity mints
          through `arc stub`'s path (`runStub`, `lib/work-unit/verbs/stub.ts`), with the meta rendered by
          `renderMetaFile` (`lib/store/kinds/meta/projection.ts`): the commitment tier and any cohort from the path;
          priority, origin, design, and `Class` from the meta as `arc stub`'s own parameters, `Class` validated as
          `--class` is; owned by the adopting identity. The rest of the file is then a hand edit of the minted record:
          write-back first sets the file's verb-owned fields — State, Class, Current Workflow, Owner, and the pause
          section, the set `checkMetaVerbOwnedField` guards (`lib/store/kinds/meta/authority-rules.ts`) once
          `seam-lifecycle` adds the last two — to the minted record's, then sends it against the minted version, checked
          like any other.
        - The engine mints through a port, bound by the root hook over the engine's store with the executor `handleStub`
          (`handlers/lifecycle.ts`) builds, since `runStub` takes its executor from the handler layer. A refusal from
          `runStub` leaves the folder ownerless and is reported with the verb's remedy; the minted stub fans out once
          the lock is released (6.5).
        - `runStub`'s checks of its parameters — name, commitment, priority, `Class`, and cohort — move into a pure
          function `runStub` and the removal check (7.1) both call, so the check reads adoption's verdict without
          minting; a refusal only the executor returns reaches the persist step, which refuses with the verb's remedy.
        - A meta naming another identity as `Owner` is not adopted; its remedy has the person name themselves, adopt
          it, then run `arc handover <slug> --to <identity>`. A folder with no meta that parses leaves its files
          ownerless, flagged in `arc status` and refused over by the removal check (7.1), with the remedy
          `arc stub <name> --commitment <tier> --priority <priority>`, the tier filled in.
        - Build `test-first` (one behavior at a time):
            - a new folder with a meta naming no owner mints a stub owned by the adopter, its tier from the path
            - the adopted meta's own prose and soft fields persist after minting, and the verb-owned field check passes
            - a meta naming another owner is left unadopted with the handover remedy
            - a meta whose `Class` `--class` would refuse leaves the folder ownerless with the verb's remedy
            - the verdict read without minting refuses that meta too, and writes nothing
            - a folder with no parseable meta reports ownerless files with the `arc stub` remedy, and adopts once the
              stub exists

    - `[ ]` **5.8.c Never adopted**

        - Matched on the file name before any other test: editor side files (`*~`, `.#*`, `#*#`, `.*.sw?`, `4913`,
          `*.tmp.<pid>.<hex>`) and operating-system folder files (`.DS_Store`, `._*`, `Thumbs.db`, `desktop.ini`,
          `.directory`). Then by path: each derived view's rendered path (`DERIVED_VIEWS`, `lib/store/registry.ts`) —
          `ROADMAP.md` at the `project-document` address and `STATUS.USER.md` at its user-document address (5.4.b), the
          archive index rendering no file — and any path `MACHINE_LOCAL_PATHS` lists, whose folders write-back's walk
          skips. A symbolic link, past the name match, is never followed, read, or adopted: one at a path the index
          lists reads as a deleted file (3.1), and any other in a projected root is never adopted, as the files above
          are, but is reported, each naming the remedy of replacing it with a regular file. The removal check and the
          persist and release steps never refuse over one (7.1–7.3), since the record lives in the store and the link's
          target outside the projection.
        - Build `test-first` (one behavior at a time):
            - Emacs's `.#name.md` lock, a dangling symlink ending in `.md`, is ignored by name
            - a Vim swap file and a Claude Code temp file in `active/current/` are ignored
            - a rendered `ROADMAP.md` is neither adopted nor refused
            - files under an identity's `.internal/` are never walked
            - a symbolic link in `active/current/` is never adopted but is reported, and its target is never read

### `[ ]` **5.9 The skip switch — § 2.3**

- _Goal:_ Every `arc` command accepts `--skip-projection`, running that one command with no write-back, no refresh, no
  end, and no fan-out of its writes, its edits left pending — while the removal check and the persist and release steps
  run under it as without it.

    - A program-level option in `cli.ts`, never a mode. The root `preAction` hook reads it and sets it on the engine's
      module state, which the hooks (4.9.b), the fan-out (6.5), and `arc sync`'s rebuild (6.7) read, since the store
      `createStore` builds sees no argv. Under it a command fans out none of its writes, the persist and release steps'
      included; each sibling's next command refreshes (§ 2.2). `arc save` refuses it, naming the switch, since its start
      is its whole work; this task adds that refusal to 4.10's handler.
    - Build `test-first` (one behavior at a time):
        - Integration tier, through the engine's entry points over the reference backend
        - a command run under the switch leaves a pending edit unsent, and the next command sends it
        - `arc save --skip-projection` refuses naming the switch, and `arc save` alone runs
        - E2E tier, through the CLI over the in-repo implementation: every command accepts `--skip-projection`

### `[ ]` **5.10 Editor settings — § 11.4**

- _Goal:_ `arc editor <vscode|zed>` merges only ARC's keys into the checkout's editor settings, keeping comments and
  other keys, `--remove` takes them out, and `arc init` and `arc join` print the one user-level Zed setting — each
  refusing or printing nothing before the flip.

    - A new command in `cli.ts`, in `HELP_GROUPS` (`lib/cli-help-content.ts`) and the command-input declarations, with
      a handler that takes the command's store, editing through `jsonc-parser`'s `modify` and `applyEdits`. The CLI
      bundles `jsonc-parser` (`lib/markdown/configuration.ts`) though only the root `package.json` declares it, so the
      package's own `devDependencies` gain it.
    - VS Code: `files.readonlyFromPermissions: true` in `.vscode/settings.json`. Zed: `file_scan_inclusions` in
      `.zed/settings.json`, `"..."` first, then a glob for each projected root built from the pattern that ignores it
      (1.1.b), so no identity is named: `.arc/active/**`, `.arc/backlog/**`, `.arc/completed/**`, and `.arc/user/*/**`.
      A missing file is created holding ARC's keys alone; an existing list gains only the globs it lacks. `--remove`
      takes out ARC's globs, and the key where only `"..."` remains, and the VS Code key where its value is ARC's; on a
      missing file it changes nothing. A file that does not parse is refused naming the parse error, left untouched.
    - `arc init` and `arc join` print the same `file_scan_inclusions` list for Zed's user settings, keeping no record,
      since ARC writes nothing per machine and each verb runs once per person per clone. Both print it from
      `runPostInitSetup` (`lib/setup.ts`), which both call, reading the capability from the store `seam-locus`'s Task
      7.3.a gives it, bound to the identity being set up. Before the flip `arc editor` refuses `unsupported` and neither
      verb prints it.
    - Build `test-first` (one behavior at a time):
        - Unit tier, over the settings editor
        - a settings file with comments and other keys gains only ARC's key, comments kept
        - `--remove` takes ARC's keys out and leaves the rest byte-identical
        - Zed's list keeps `"..."` first and gains only the globs it lacks, the personal root's naming no identity
        - a missing file is created with ARC's keys, and an unparseable one is refused untouched
        - Integration tier, through the handler over the reference backend: `arc editor zed` writes the checkout's file
        - with the store reporting off-branch state, the line `arc init` and `arc join` print holds the list
          `arc editor zed` writes
        - E2E tier, through the CLI over the in-repo implementation: `arc editor` refuses `unsupported`, and neither
          `arc init` nor `arc join` prints the Zed setting

## **Phase 6:** Refresh, fan-out, and materialization

_Purpose:_ Keep every worktree's copy current — at each command's start, at a writer's fan-out, and in a full
materialization — at a cost that grows with what changed.

_Mode:_ `slice` — closes on the working copy end to end across worktrees: an edit in one reaches the store and every
sibling's copy, and a new worktree projects its layout.

_Exit criterion:_ Over the reference backend with real worktrees, a worktree marked for a work unit materializes the
layout the isolation test asserts; an edit in one worktree reaches every sibling's copy at the writer's fan-out, and a
pull's merges fan out; a deleted file returns at `arc sync`; a state version that no longer resolves rebuilds the
worktree; over the ref backend, twenty worktrees saving into refreshes, fan-outs, and file removals lose no save, a copy
whose path moved on kept and reported; and at this repository's size the no-change overhead, a full materialization, and
a one-file fan-out each stay within their bounds, and a ten-file fan-out within its bound but on Windows, where § 15.4
expects it to reach the bound.

_Design decisions:_ The rebuild on `state-unresolvable` (6.4.b) and the fan-out of `pull` and `push` (6.5) rest on
`storage-ref-backend`'s `pull`, `push`, and refusal (its Tasks 1.3 and 1.4), and the timing suite (6.10.a) and the
multi-process lane (6.11) on its `createRefStore` (its Task 3.1.a) and the `ARC_STORE_BURSTS` gate (its Task 18.1).
The lane's bursts into a removal's persist step wait for that step, in Phase 7 (7.7). Fan-out wraps only the store
`createStore` returns; a move or an import that bypasses it is caught at each worktree's next command start, since that
start refreshes from the index's state version.

### `[ ]` **6.1 Decide which checkouts hold a projection — § 2.5**

- _Goal:_ A worktree holds a projection when it holds an index, and gets one only when it is the primary or its
  work-unit marker names a work unit or a transient claim — an `arc start --here` checkout included — so ARC's machinery
  checkouts and unclaimed worktrees run with the projection off.

    - Read from the marker (`readWorktreeMarker`, `decodeWorktreeMarkerOwnership`, `lib/git/worktree-marker.ts`) and
      whether the checkout is the primary, which 2.2.b's reader answers with no Git call — the primary's Git directory
      holds no `commondir`, being the common one: a `current` ownership naming a work unit, or a transient subject whose
      provisioning is `ready`, counts; a `pending` provisioning, a `manual-only` ownership, a husk-stamped marker, and a
      subject naming a branch, as a decomposition worktree's does, get none.
    - A checkout with the projection off still fans out its writes to the machine's projections (6.5).
    - Build `test-first` (one behavior at a time):
        - the primary and a checkout whose marker names a work unit or a ready claim each get a projection
        - a primary whose `.git` is a `gitdir:` file, as `git init --separate-git-dir` makes it, gets a projection
        - a hand-made worktree with no marker, a decomposition worktree, and a claim still `pending` get none, and the
          engine's start there touches no projection file
        - a husk-stamped marker and a `manual-only` ownership get none

### `[ ]` **6.2 Read records through one source interface — § 14**

- _Goal:_ The engine reads records only through one source interface — `read`, `list`, `version`, and `changes` over
  the roots the source projects — which the store implements here, and a read-only source's files project protected.

    - Typed as `Pick<Store, "read" | "list" | "version" | "changes">` beside a descriptor of the source's name, the
      roots it projects, and whether it is read-only; the ref backend's `ReadOnlyStore` (`lib/store/contract.ts`, its
      Task 1.7) satisfies it, so a later read source plugs in unchanged. `history` and `lookup` are read from the
      writable store alone. Each source keeps its own state version in the index (2.2.a). Only the store is built as a
      source here.
    - A read-only source's files are protected (5.2), their notice naming the source, and write-back refuses an edit to
      one as a refused edit.
    - Build `test-first` (one behavior at a time):
        - the rights function (5.1) answers protected for a file of a source marked read-only, naming the source
        - write-back refuses an edit to such a file as a refused edit naming the source
        - the store satisfies the interface with no adapter

### `[ ]` **6.3 Materialize a worktree in full, and rebuild one with no usable index — § 2.5, § 3.1**

- _Goal:_ A worktree with no projection gets every record written under the replace guard and adoption rules, and one
  whose index it cannot use is rebuilt writing over no file that might hold an edit, withholding and reporting each.

    - At a spawn, into a worktree that has none, and at `arc sync` (6.7). A spawn calls it once the marker is written —
      after `writeWorktreeOwnershipMarker` in `provisionSpawnedWorktree`
      (`lib/work-unit/mutators/reconcile-work-unit-worktree.ts`), and once `provisionTransientLocus`
      (`lib/locus/provisioning.ts`) marks a claim `ready` — before the worktree lock (7.8), through the materialize port
      the root hook binds into the engine's process state (4.9.a), so neither mutator takes a store of its own. The root
      hook binds the port at every command, and before the flip the bound port returns at once, as every entry point
      does (4.9.a); from it, a failure there is reported and the spawn completes, the worktree's first command
      materializing it. A spawn in a process whose root hook never ran — a script, or a test that binds nothing — finds
      the port unbound, and materializes and reports nothing, the worktree's first command materializing it.
    - It writes the clone's exclude entries (1.1.b), then runs the guard (1.2) before writing into any root, since on a
      fresh clone nothing ignores the shared roots until those entries exist, and creates the checkout's scratch folder,
      `.arc/user/<identity>/scratch/work-unit/<slug>/`, for the work unit its marker names.
    - With no usable index (2.2.d): a file at a path the current projection lays a stored record at is refreshed only
      where its blob id, stamp aside, equals its stamp's, or, stampless, the stored content's; every other file under
      a projected root is left, written over by nothing, sent nowhere, and marked withheld in the new index, as is each
      aside copy the sweep (3.3) returned as withheld. Files 5.8.c never adopts and `MACHINE_LOCAL_PATHS` entries are
      left alone. Deleting a withheld file releases it: pending where a record projects at its path, its entry gone
      otherwise.
    - A listing that is not whole writes files only for the records it returns; a record listed only as a diagnostic
      projects no file and is reported.
    - Build `test-first` (one behavior at a time):
        - Integration tier, over the reference backend and a real linked worktree
        - a fresh worktree materializes every projected record at its layout path, stamped, and its scratch folder
        - a materialization failing at a spawn is reported, and the worktree's first command materializes it
        - a spawn before the flip, and one whose port is unbound, materialize nothing and report nothing
        - with the index deleted, an unedited file is refreshed and an edited one is withheld and reported
        - with the index deleted, an aside copy the sweep withheld is recorded withheld in the new index
        - with the index deleted, a removal's aside copy the sweep linked back after a stop is withheld and reported
        - a withheld file, deleted by the person, is marked pending where a record projects at its path
        - a file of a source marked read-only projects protected, its notice naming the source (6.2)
        - a record listed only as a diagnostic projects no file and is reported

### `[ ]` **6.4 Refresh from the store's changes — § 15.2**

- _Goal:_ Each command's start brings its worktree up from the state version its index last projected, rewriting only
  the records `changes` names and the files marked pending, moving every file a primary record's change relocates, and
  rebuilding when that state version no longer resolves.

    - `[ ]` **6.4.a Reducing `changes`**

        - Refresh keeps each record's newest entry. An entry for a primary record — a meta, an Errand record, or a cohort
          document — re-lays every record its owner holds (`list` by `owner`, `ListInputSchema`, `lib/store/read.ts`),
          moving each file whose path changed by the removal swap and a write at the new path, an edit at the old path
          taken in first (3.4). A meta's entry adds or removes its `current/` copy of each cohort document its `Cohort`
          names; an archive, an abandon, or an owner leaving the view removes the files.
        - A conflict-record entry refreshes the file of the record it names, or, for a removed conflict, the file the
          index maps it to — by its marker set, its notice line, or, for a conflict the file does not show, the file's
          entry (4.4.b, 4.7.b). A conflicted file refreshes through 4.8's merge, but for one holding a resolution in
          progress or a malformed set, which the replace guard holds whole (4.4.b): the refresh leaves it unreplaced and
          records in its entry the open conflicts of the version it read.
        - Every file marked pending is refreshed too, and a pending file whose record has left this projection is
          removed by 3.4's rules, so a removal a take-in deferred is retried.
        - Before a write into a root the guard runs only when an ignore file may have changed: the index's recorded
          existence, stat, and blob id of `.git/info/exclude` and each `.gitignore` on the path to the roots and the
          aside folder must match by 2.4.b's comparison, or the call runs (1.2), and its pass records them again.
          Fan-out applies the same skip.
        - Build `test-first` (one behavior at a time):
            - a changed record rewrites only its file, and an unchanged one is not touched
            - a rename re-lays every file the owner holds, an edit at the old path taken in first
            - an archive removes the work item's files from `active/`
            - a cohort document's change rewrites its folder's file and each `current/` copy
            - a resolved conflict's markers or notice line leave its file
            - a withheld file the person deleted is written fresh from the store at the next command, and leaves
              `arc status`
            - a deferred removal whose edit lands at the next command's start is still removed by that command's refresh
            - a pending file whose record left the projection is removed at the next refresh
            - a file a stopped replacement left pending is rewritten at the next refresh, in `completed/` too
            - an edit refused at removal stays at its path through each refresh until resolved, then is removed
            - a removed file a sweep linked back is removed again at the next refresh
            - `arc save --resolve` on a withheld subject refuses naming 6.3's remedy, and resolves once the file is
              deleted and written fresh
            - a file a refresh skipped, then reverted to its base, stays pending and is replaced at the next refresh
            - a file holding a resolution in progress is left unreplaced by a refresh its record's change reaches, and
              takes the change once the resolution is sent
            - a file holding a malformed set is left unreplaced by a refresh, its entry recording the newer version's
              open conflicts, which `arc status` shows, and a removed conflict recorded there refreshes that file
            - the refresh's second index write leaves no pending mark on a file it put in place
            - an `arc status` whose own start refreshed files lists none of them as pending
            - a refused edit the person reverts to its base leaves `arc status` at the next command, which clears its
              refused mark and runs the refresh it was owed
            - an ignore file changed since the guard last passed runs the guard before the write
            - an ignore file's smudged record runs the guard at the next write into a root

    - `[ ]` **6.4.b A state version that no longer resolves**

        - When `changes` refuses `state-unresolvable`, the command rebuilds from current state, pulling nothing: every
          projected record refreshed by the same rules, every index entry the state no longer holds handled as a removal
          (3.4), pending marks and the replace guard applied, and the index taking the current state version. Write-back
          has already run, so no edit is lost.
        - A file is removed only on a complete listing, with nothing missed and no diagnostic, that no longer holds its
          record.
        - Build `test-first` (one behavior at a time):
            - a `changes` refusal of `state-unresolvable` rebuilds the worktree and loses no pending edit
            - a listing reporting `missed` removes nothing

### `[ ]` **6.5 Fan out from the store `createStore` builds — § 2.2, § 1.2**

- _Goal:_ Once a write or a pull's merges land, the writer brings every worktree on the machine that holds a projection
  up from that worktree's own state version, taking each one's projection lock in turn — and whatever fan-out misses,
  the next command's start refreshes.

    - `[ ]` **6.5.a The wrapper**

        - `withFanOut(store, deps)`, exported from `lib/store/projection/`, wraps a store once: `write` and `batch` fan
          out after a landed write, and `pull` and `push` after every call whatever the outcome, since a push runs pulls
          and a refused or timed-out sync may still have merged. `createStore` (`lib/store/create.ts`) applies it to the
          store it returns, and tests apply it to the reference backend and `createRefStore`.
        - It is inert while `capabilities.stateOffBranch` is false. A write made under a projection lock fans out once
          that lock is released, and a command's start fans out once for all its write-backs; a write landing during a
          fan-out — a take-in in a sibling's refresh, a stub minted by adoption — joins that fan-out's next round rather
          than starting another; under `--skip-projection` nothing fans out (5.9).
        - Build `test-first` (one behavior at a time):
            - a landed write fans out, and a refused one does not
            - a `pull` reported `failed` after merging still fans out
            - a write made under the start's lock fans out once, after release
            - a take-in during a sibling's refresh fans out in the same fan-out's next round
            - over the in-repo implementation, a write fans out nothing and makes no Git call

    - `[ ]` **6.5.b One fan-out**

        - One `scanRegisteredWorktrees` call (`lib/git/worktree-roster.ts`) lists the machine's worktrees, detached ones
          included; each one's Git directory is read from its roster path's `.git` (2.2.b) — a path holding none, as Git
          lists a primary whose `.git` is a `gitdir:` file at its Git directory, or whose aside folder holds no
          reference stamp (2.4), as Git lists such a primary at that directory's parent where it is named `.git`, is
          skipped with no Git call, that checkout refreshing at its own next command — and each holding a projection has
          its index read for its state version, then one `version()` call and one `changes` call per distinct state
          version. The writer's own worktree is found from its own root, never from the roster, whose entry for its Git
          directory it skips. Under each worktree's lock, held past 200 ms by another — the writer's own worktree
          included — skipped, its index is read again, and the worktree skipped when its state version moved, when it is
          already current, when its state version no longer resolves, or when its index is unusable or of another format
          version. A lease lost while it works in a worktree skips that worktree from its next step, and the fan-out
          goes on (2.3). A step hook before each worktree it visits lets the multi-process lane (6.11) place a save
          there.
        - Each worktree is laid out under the view setting, identity, checkout claim, and `layout.active` its index
          records; a change to any of them is reprojected at that worktree's own next command (6.6). A primary entry's
          re-lay lists its owner's records once per fan-out, and each worktree's refresh reads `history` through the
          command's memo in the engine's process state (2.6, 4.9.a), one call per record across the fan-out.
        - Build `test-first` (one behavior at a time):
            - Integration tier, over the reference backend and real linked worktrees
            - an edit written back in one worktree reaches the other worktrees' copies
            - a write from a checkout with the projection off (6.1) reaches a sibling's projection
            - a pull's merges reach every worktree
            - two worktrees refreshing one conflicted record read its `history` once
            - a worktree another refresh brought up first is skipped
            - a worktree whose lock is held past 200 ms is skipped and refreshes at its own next command
            - a worktree whose lease is lost mid-refresh is skipped, the fan-out going on, and refreshes at its own next
              command
            - a worktree with an older index format is skipped and refreshes at its own next command
            - a primary made by `git init --separate-git-dir`, which Git lists at its Git directory, is skipped, nothing
              written under that directory, and refreshes at its own next command
            - a primary whose separate Git directory is named `.git`, which Git lists at that directory's parent, is
              skipped, nothing written in that parent
            - a writer that is such a primary refreshes its own worktree
            - a sibling with the `all` view takes another person's new work unit, and one with `mine` does not
            - `arc save`'s writes reach the other worktrees' copies
            - a process whose root hook bound no ports fans out nothing, each sibling refreshing at its next command
            - a write made under `--skip-projection` reaches no sibling until that sibling's next command

### `[ ]` **6.6 Reproject on a changed view setting, identity, claim, or layout — § 10.4, § 10.3**

- _Goal:_ A command that reads a view setting, identity, checkout claim, or `layout.active` different from the one its
  index recorded reprojects what it governs — views added, files leaving a view by the removal path, the personal roots
  following the identity, and `current/`, its scratch folder, and owning-checkout notices following the claim or layout.

    - A release, a promotion, or a materialize changes the marker without a store write, so the comparison against the
      index's recorded claim is what catches it.
    - A file of the old claim's work item at a path the new one's also projects at — a path-keyed companion — is removed
      by the removal path, its edit taken in against its own record, and the next refresh lays the new file there
      (3.2.b, 3.4).
    - Build `test-first` (one behavior at a time):
        - switching the view from `mine` to `all` adds the other in-flight work items
        - switching back removes them, an edit there taken in first
        - a changed claim re-lays `current/` to the newly named work item and creates its scratch folder
        - a save placed by 3.2.b's after-re-check hook at a path both claims' work items project at is taken in against
          the leaving record, and the next command lays the arriving file there
        - a changed identity re-lays the personal roots under the new identity
        - setting `layout.active: flat` moves `current/`'s files to `active/`'s top level
        - `arc save --resolve` on a conflict whose subject projects in no file here resolves once a changed view lays
          its file

### `[ ]` **6.7 Rebuild deleted files at `arc sync` — § 2.4**

- _Goal:_ `arc sync` rebuilds every deleted projected file as a full materialization, from the flip.

    - From the flip the top-level `arc sync` command (`cli.ts`, `handleSync` in `handlers/sync.ts`) runs a full
      materialization (6.3) of its worktree once its identity and ARC root resolve and before its network steps, so an
      offline sync still rebuilds; with no identity, its existing refusal (`IDENTITY_MISSING`, `resolveUserIdentity` in
      `handlers/shared.ts`, over the same `resolveIdentity`) names `arc.identity` first, and nothing is rebuilt;
      `--dry-run` skips it. Its handler takes the command's store, as 4.10's does. With a usable index the
      materialization rebuilds each absent file by the link alone (3.4), replaces by the swap (3.2) each file 3.1 reads
      as deleted — an empty stamped Markdown file at least 50 ms old, or a symbolic link at a path the index lists — and
      leaves every other present file to the refresh. A rebuild that fails is reported and the sync goes on to its
      network steps, and `--skip-projection` skips it (5.9). Its existing steps stay as they are, for `storage-cutover`
      to rewire onto `pull` and `push`. Before the flip it runs as today.
    - Build `test-first` (one behavior at a time):
        - Integration tier, through `arc sync`'s handler over the reference backend
        - a deleted projected file returns at `arc sync`, and an edited one keeps its edit
        - with the fetch failing, a deleted projected file still returns
        - a present, unchanged file is not rewritten, and `--dry-run` rebuilds nothing
        - with no identity, `arc sync` refuses naming `arc.identity` and rebuilds nothing
        - an emptied projected Markdown file at least 50 ms old, and a symbolic link at a projected path, are replaced
          at `arc sync`
        - a rebuild that fails is reported, and the sync still runs its network steps
        - `arc sync --skip-projection` rebuilds nothing

### `[ ]` **6.8 Hold the `.worktreeinclude` copy off the projection's paths — § 11.6**

- _Goal:_ A new linked worktree takes none of the primary's projected files through `.worktreeinclude`, so the
  projection fills them itself.

    - `copyWorktreeIncludes` (`lib/git/worktree-include.ts`), run at every spawn through `setupLinkedWorktree`
      (`lib/git/linked-worktree-setup.ts`), already copies nothing under `.arc/` (`isArcPath`), which keeps out every
      projected root and `.arc/system/.local/`; a regression test holds it.
    - Build `test-first` (one behavior at a time):
        - with a broad pattern, the primary's `active/current/` and `.arc/system/.local/` files are not copied, and an
          `.env` file still is

### `[ ]` **6.9 The isolation invariant and its test — § 10.5**

- _Goal:_ An integration test holds "`active/current/` holds only this checkout's work item": a worktree spawned for a
  work unit holds exactly that work unit's files and a copy of each cohort document it names in `active/current/`,
  exactly the selected views in `active/in-flight/`, and nothing else at `active/`'s top level.

    - Over the reference backend: a linked worktree created from base and marked for a work unit as a spawn marks it,
      then materialized (6.3); it asserts the layout the documentation states and adds no guard on today's flat layout.
      `storage-cutover`'s documentation pass rewrites the strategy's acceptance test to match.

### `[ ]` **6.10 The no-change budget and the tripwires — § 15.3, § 15.4, § 15.5**

- _Goal:_ A command with nothing changed spends at most 10 ms on Linux and 60 ms on Windows in the projection, its two
  Git calls started together with the stat walk, and each tripwire shows only when the median of its recent
  measurements crosses its bound.

- **Additional Context:** `notes-storage-projection.md` § Spike 2, § Tripwire timings

    - `[ ]` **6.10.a The start's cost**

        - The start's two Git calls — the store's `version()` and the one configuration read (2.5.b) — start together
          with the stat walk. No folder-time cache.
        - A timing suite under `store/projection/`, run where `ARC_STORE_BURSTS` is set, times the no-change start over
          `createRefStore` in a prepared repository (`__tests__/helpers/prepared-repository.ts`) at this repository's
          size — about 800 projected files — taking the median of eleven runs. It reports its medians rather than
          asserting the budget, since hosted runners' timing varies; a dispatched run of the portability pair and one of
          the Linux `portability` job record them in `notes-storage-projection.md`, read against the budget at 6.12 and
          at verification.
        - The same suite times, over `createRefStore` with the same median, a one-file and a ten-file write's fan-out
          into 20 linked worktrees and a full materialization at this repository's size, reporting each against its
          tripwire's bound (6.10.b), and the same runs record them.

    - `[ ]` **6.10.b The tripwires**

        - The index keeps the last nine measurements of the command start, each fan-out (store reads included), and each
          full materialization (2.2.a), written by the index write each command makes. A fan-out's time goes into the
          writer's own worktree's index at its end, under the lock the end takes again (4.9.a); a writer with no
          projection records none. Each shows in the command's report (4.9.b) and in `arc status` when its median
          crosses 20 ms / 120 ms, 100 ms / 600 ms, or 1 s / 5 s on Linux and macOS / Windows.
        - Build `test-first` (one behavior at a time):
            - one slow measurement shows nothing, and a median past the bound shows its tripwire
            - a tenth measurement drops the oldest
            - measurements are kept per worktree in its index, a fan-out's in the writer's at its end

### `[ ]` **6.11 Hold saves through bursts across processes — § 1.5**

- _Goal:_ Twenty worktrees of one clone, each a separate process over the ref backend, saving into refreshes, fan-outs,
  and file removals at once, lose no save and no write.

    - A suite under `store/projection/` in the integration tier, run only where `ARC_STORE_BURSTS` is set, as
      `storage-ref-backend`'s bursts are (its Task 18.1), with a per-test timeout above the Windows bursts' 401 s.
    - Each worktree runs the engine's start and end over `createRefStore` in a child process, as
      `personal-lock-holder.ts` (`__tests__/helpers/store/`) runs one, in a repository from `prepared-repository.ts`.
      The processes line up across process boundaries: a child reaching a step hook prints the hook's name on stdout and
      waits for the parent's release line on stdin, as that helper's `READY` and release do; the hooks are 3.2.b's three
      and each worktree a fan-out visits (6.5.b), so saves land inside another's replacement, fan-out, and file removal
      (3.4). The suite requires every save to reach the store, stay in its file, pending or reported, or stay in an
      aside copy — pending for the next sweep, or kept because its path moved on, reported with its path (3.2.a) — and
      fails a run whose processes never reached each hook.
    - Passes in one dispatched run of the portability pair and one of the Linux `portability` job, each recorded in
      this task's completion note.

### `[ ]` **6.12 The working copy across worktrees** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds across real worktrees on a freshly merged base.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - Over the reference backend in one scripted repository with linked worktrees, run the exit criterion's scenario —
      materialize, an edit's fan-out, a pull's fan-out, `arc sync` after a delete, a rebuild on `state-unresolvable` —
      confirm 6.10.a's recorded medians — the no-change start within budget, a full materialization and a one-file
      fan-out within their tripwires' bounds on every platform, and a ten-file fan-out within its bound on Linux and
      macOS, its Windows median read against the bound (§ 15.4) — confirm 6.11's recorded runs, and request
      `arc check segment`.

## **Phase 7:** Worktrees — the removal slots, the release step, and the lock

_Purpose:_ Fill the removal function's three projection slots so ARC removes or releases a checkout only after its
edits persist, give every worktree its own user surfaces, and land the worktree lock last.

_Mode:_ `slice` — closes on ARC removing a projected checkout only after its edits persist, behind the live worktree
lock.

_Exit criterion:_ Over the reference backend, the removal check answers `persist-would-refuse` for each state an edit
could lose and `unobservable` for a failed read, the persist and release steps refuse over each and succeed once it is
resolved or, for an aside copy kept because its path moved on, deleted, and teardown through its store-backed context
persists, then removes; over the ref backend, twenty worktrees saving into removals' persist steps lose no save but for
§ 17's residuals; before the flip, a spawned checkout carries `PROJECTION_LOCK_REASON`, or keeps a lock another tool set
first, reported; under `PROJECTION_LOCK_REASON` a plain `git worktree remove` refuses it naming the exits, the removal
function removes it, and a move keeps it; and an `arc start --here` checkout carries none.

_Design decisions:_ The removal check, the removal function, the release, the slot type, and `PROJECTION_LOCK_REASON`
(`checkWorktreeRemoval`, `removeWorktreeCheckout`, `releaseWorktreeCheckout`, `ProjectionRemovalSlots`,
`lib/git/worktree-removal.ts`) are `seam-lifecycle`'s, on base when this work unit starts; nothing locks with the
constant before 7.8.b, which gives it a value naming the exits, since Git prints it in its refusal (§ 12.1). This phase
fills the slots in `lib/store/projection/` and binds them, at the bindings `seam-locus` composes — the sweeps, the
Errand exits, and `arc locus release` (its Tasks 1.5, 1.6, and 2.9.b) — and beside its missing-folder remedy (its Tasks
1.5.c and 1.7.b). The lock tasks run last but for clearing the primary's `.ignore` (7.10), which waits until just before
landing. No one-off pass locks the existing worktrees: each takes the lock when it is next spawned, and
`storage-cutover` locks any left before the flip (§ 12.7).

### `[ ]` **7.1 The removal check's projection part — § 12.2**

- _Goal:_ The `check` slot, reading only and taking no lock, answers `would-refuse` with a remedy for every state an
  edit could lose, `unobservable` with its detail when a read it needs fails, and `passes` otherwise — so no failed read
  ever reads as `persist-would-refuse`.

    - `would-refuse` for a file adoption would refuse (5.8), read through 5.8.b's verdict without minting, one held by a
      conflict (4.4, 4.5), failing to parse, or holding a refused edit, an aside copy whose edit is refused or clashes
      in the checkout (3.2.c), or that holds an edit once its path has moved on (3.2.a), a file or aside copy withheld
      (6.3), or a file or aside copy not yet settled (3.1); and for a checkout 6.1 gives a projection, or that holds an
      index, with no identity (2.5.b), naming the remedy that sets `arc.identity`. It runs write-back's read path over
      each changed file in every projected root, `completed/` included, and each settled aside copy — the settle rule,
      the edit rights (5.1) with a read-only source's protection (6.2), the parser, the store's merge in the checkout,
      the write check with 4.2's views, and `checkSerializationRules` (`lib/store/`, `storage-ref-backend`'s Task 5.1) —
      rather than trust the index's refused mark (2.2.a), so an edit made since the last command and a refusal since
      reverted both read true. The aside copies read as 3.2.a states, as the persist step's takeover reads them: in the
      order their swaps were made (2.2.a), each read with the record that a write-back has been sent since its swap set
      wherever an earlier copy of its path would be taken in. A symbolic link is never read and refuses nothing (5.8.c).
    - `unobservable` for a missing, unreadable, or other-format index (2.2.d), its detail naming the remedy — run the
      removal or release from that checkout; for a projected file that cannot be read; and for a store read refusing
      `namespace-corrupt`, `identity-mismatch`, or `state-unresolvable`, its detail carrying the refusal's own remedy.
    - A checkout 6.1 gives no projection and that holds no index answers `passes`, before the identity is consulted; one
      that holds an index anyway is checked as any other.
    - Build `test-first` (one behavior at a time):
        - Integration tier, over the reference backend and real linked worktrees
        - each would-refuse state answers `would-refuse` with its remedy, and `passes` once it is resolved
        - an edit to a protected file, another person's archived file, or a read-only source's file, made since the
          last command, answers `would-refuse`
        - a new file adoption would place answers `passes`, and one it would refuse answers `would-refuse`
        - a refused edit reverted to its base answers `passes`
        - a drawing's aside copy a failed command left, its markers since resolved, answers `passes`
        - an aside copy holding an edit whose path has moved on answers `would-refuse` naming the copy's path, and
          `passes` once it is deleted
        - two copies of one absent path, both holding edits, answer `would-refuse` for the newer, as the persist step,
          taking the older in first, refuses over it
        - a symbolic link in a projected root, at a path the index lists or not, answers `passes`, its target unread
        - an unusable index answers `unobservable` naming the checkout to run from, and `passes` once a command run
          there rebuilds it
        - a projected file that cannot be read answers `unobservable`
        - a store read refusing `state-unresolvable` answers `unobservable` with its remedy, never `would-refuse`
        - a checkout with no projection answers `passes`, with no identity configured too
        - a claimed checkout whose index was deleted answers `unobservable`, never `passes`
        - an unclaimed checkout that still holds an index is checked as any other, never passed
        - the check writes nothing and takes no lock

### `[ ]` **7.2 The persist step — § 12.2**

- _Goal:_ The `persist` slot writes back every edit in the target checkout under its projection lock, every projected
  root included, takes over every settled aside copy, and refuses with the blocking file's remedy rather than let a
  removal drop an edit — releasing the lock before it returns.

    - Under the target's projection lock, waiting the default bound and refusing on timeout naming the holder and a
      retry, and refusing with a retry where the lock's lease is lost while the step runs (2.3): write back every edit
      under `write-back`, each file its own write, waiting through the settle rule; refuse where any file stays
      unadopted, held by a conflict, failing to parse, holding a refused edit, withheld, not yet settled, or pending
      after `lock-held`, the file keeping its content. A symbolic link, at a path the index lists or not, is never
      adopted and refuses nothing (5.8.c). Then take over every aside copy, in the order their swaps were made (2.2.a),
      its writer live or not, once it has settled, as 3.2.a states — an edit taken in only while its path has not moved
      on — deleting it through 2.8's deletion, which clears the in-progress record naming it and its own record; a
      refused or unparseable copy is kept and refuses; a copy holding an edit once its path has moved on is kept and
      refuses, naming the copy's path and the remedy of copying out what it holds and deleting it; a copy whose edit
      clashes in the checkout is kept and refuses as held by a conflict; a withheld one is left and refuses; one that
      does not settle, or whose edit write-back defers or leaves pending, is kept and refuses with a retry. Then check
      every projected file and the aside folder once more against the index by the racy rule, and walk the projected
      roots' folders again for files the index does not hold, writing back, adopting, or taking over whatever changed or
      appeared since, at most three passes, refusing with a retry where something still changes. A missing history ref
      is pulled and retried once (5.3). An unusable index refuses (2.2.d). Release the lock, then the writes fan out.
    - Under `--skip-projection` the step runs as without it (5.9). A checkout 6.1 gives no projection and that holds no
      index returns at once, before the identity is consulted; on any other, with no identity (2.5.b) the step refuses
      naming the remedy that sets `arc.identity`.
    - A step hook before it takes over each aside copy, and one before its last check, let the multi-process lane (7.7)
      place a save there.
    - Build `test-first` (one behavior at a time):
        - Integration tier, through teardown's store-backed context (`createStoreTeardownContext`,
          `lib/work-unit/store-teardown-context.ts`) over the reference backend, the slots injected into it until 7.4.b
          binds them
        - teardown persists a pending edit, then removes the checkout
        - a refused edit reverted to its base persists nothing and lets the removal proceed
        - each held state refuses the persist with its remedy, and the removal proceeds once it is resolved
        - an aside copy left by a live writer is taken over once settled
        - an aside copy whose take-in answers `pending` is kept and refuses with a retry
        - a save landing after write-back read its file, before the lock is released, is taken in by the last check
        - a new file created after write-back's walk, before the lock is released, is found by the last check and
          adopted
        - a file still changing through the last check's three passes refuses with a retry, and the retry removes the
          checkout once it settles
        - with no identity the step refuses naming the remedy, and once `arc.identity` is set the removal proceeds
        - a checkout with no projection is removed with no identity configured
        - an unclaimed checkout that still holds an index has its edits persisted, never returning at once
        - a lock held past its bound refuses naming the holder, and the retry removes the checkout
        - a lease lost mid-step refuses with a retry, and the retry removes the checkout
        - a drawing's aside copy a failed command left, its markers since resolved, is taken over as no edit, and
          teardown removes the checkout
        - an aside copy holding an edit whose path has moved on refuses naming its path and remedy, and the removal
          proceeds once it is deleted
        - of two copies of one absent path, the older is taken in and the newer, recorded as sent since by that take-in,
          is kept and refuses
        - a symbolic link in a projected root, at a path the index lists or not, lets the removal proceed, its target
          unread
        - an unusable index refuses naming the checkout to run from, and the removal proceeds once a command run there
          rebuilds it
        - a missing history ref is pulled through the wrapping test store (4.3) and the retry lands
        - teardown under `--skip-projection` still persists the checkout's edits before removing it
        - the step returns with the lock released, so its own fan-out runs

### `[ ]` **7.3 The release step — § 12.3**

- _Goal:_ On every path that releases a checkout rather than removing it — teardown, abandon, and `arc locus release`
  of an anchored checkout — the `release` slot persists every edit as the persist step does and, on a linked checkout,
  removes its projection, refusing where an edit would go back as a refused edit.

    - A checkout 6.1 gives no projection and that holds no index returns at once, before the identity is consulted, as
      7.2's does. Otherwise, under the target's projection lock: write back, take over aside copies, and run the last
      check as 7.2 does, refusing on the same conditions; then, on a linked checkout, remove each projected file by the
      removal swap (3.4), refusing with the edit's remedy where an edit goes back to its path as a refused edit, as held
      by a conflict where its take-in answers `clashed`, and with a retry where it answers `deferred` or `pending`, then
      the aside folder and the index. The primary — decided by 2.2.b's reader, as 6.1 decides it, never by the
      `isPrimary` the release (`releaseWorktreeCheckout`) passes, which compares the checkout with the primary path its
      caller supplies — keeps its projection. A caller failing after the step leaves the marker, and the next command
      projects again.
    - Build `test-first` (one behavior at a time):
        - Integration tier, through teardown's store-backed context over the reference backend, the slots injected
          until 7.4.b binds them
        - releasing an anchored linked checkout persists its edits and leaves it with no projection, its uncommitted Git
          changes intact
        - the primary's release keeps its projection
        - releasing a primary made by `git init --separate-git-dir`, passed `isPrimary` false, keeps its projection
        - each held state refuses the release with its remedy, the marker staying, and the release succeeds once it is
          resolved
        - a lease lost mid-step refuses the release with a retry, the marker staying, and the retry releases it
        - a symbolic link in a projected root refuses no release, its target unread and untouched
        - a lock held past its bound refuses naming the holder, and the retry succeeds
        - an unusable index refuses naming the checkout to run from, and the release succeeds once a command run there
          rebuilds it
        - with no identity the release refuses naming the remedy, and once `arc.identity` is set it succeeds
        - a checkout with no projection is released with no identity configured
        - a new file created after the release's write-back walk is found by its last check and adopted
        - a removal swap whose take-in answers `pending` refuses the release with a retry, the file kept
        - a removal swap whose edit is refused links the file back and refuses the release with the edit's remedy, the
          marker staying, and the release succeeds once the edit is resolved
        - a removal swap whose take-in answers `clashed` refuses the release as held by a conflict, the marker staying,
          and the release succeeds once the clash is resolved
        - the primary's release takes over an aside copy and clears the in-progress record naming it and the copy's own
          record
        - an aside copy kept because its path moved on refuses the release naming its path, the marker staying, and the
          release succeeds once it is deleted

### `[ ]` **7.4 Bind the slots where the removal function's callers are composed — § 12.2**

- _Goal:_ Every production caller of the removal check, the removal function, and the release takes the projection's
  three slots, so none falls back to the passing defaults once the capability is on.

    - `[ ]` **7.4.a The callers on the merged base**

        - On the merged base, list every production construction of a context carrying `projectionRemovalSlots`, a
          `removal` option, or a removal `check`, and every direct call of the removal check, the removal function, the
          release, `checkRetiringCheckout`, and `clearMissingWorktreeRegistrations`; record the list in this task's
          completion note. A caller absent from 7.4.b and 7.4.c is bound with them.

    - `[ ]` **7.4.b Lifecycle's contexts**

        - One factory in `lib/store/projection/` returns the slots for a checkout's store; it is bound where each
          context is composed: the store-backed teardown and abandon context (`createStoreTeardownContext`) and the
          abandon handler (`handlers/abandon-store.ts`); the teardown, abandon, and park contexts the lifecycle handlers
          build (`handlers/lifecycle.ts`), their `removal` option taking the slots' `check`; and the reconcile context
          wherever `reconcileWorkUnitWorktree` is called — the executor context (`lib/work-unit/executor-context.ts`),
          `arc start` (`commands/start.ts`, `commands/start-store.ts`), and `arc rename` (`commands/rename.ts`,
          `commands/rename-store.ts`).
        - Over the in-repo implementation the slots pass, so binding them changes nothing before the flip.
        - Build `test-first` (one behavior at a time):
            - a test over each production context asserts it carries the projection's slots, not the passing defaults
            - over the reference backend, teardown through the store-backed context refuses over a refused edit

    - `[ ]` **7.4.c The sweeps, the Errand exits, and `arc locus release`**

        - The field `seam-locus` adds, `projectionRemovalSlots`, is bound in `handleSessionInitStatus`
          (`handlers/status.ts`) on `RunStaleWorktreeSweepOptions` and `RunBranchGoneRecoveryOptions` — the stale sweep
          passing its own to the residue sweep it runs; on the Errand runtimes' options in `handlers/errand.ts`, which
          carry it into `SettleTerminalOccupancyOptions` (`lib/errand/terminal-occupancy.ts`) and the leave's
          authorization; and on `arc locus release`'s handler context. The decisions read its `check`, and the exits
          and the release pass it whole as `slots`.
        - Build `test-first` (one behavior at a time):
            - each of the three compositions carries the projection's slots, not the passing defaults

### `[ ]` **7.5 The user surfaces in every worktree — § 12.8**

- _Goal:_ Under the capability every worktree holds its own copy of the identity's personal records, `USER-INBOX` and
  `WORKING-MEMORY` among them, read through the store and never through `lib/user-surfaces.ts`'s resolver.

    - The projection reads none of them through the resolver; the in-repo implementation keeps it
      (`lib/store/in-repo/personal-paths.ts`), teardown keeps merging a linked copy up (`lib/user-surface-migration.ts`)
      until the flip, the seam's members move their own callers off it, and `storage-cutover`'s deletion pass removes
      both with the in-repo arms.
    - Build `test-first` (one behavior at a time):
        - over the reference backend, a linked worktree's `USER-INBOX` is its own projected copy, and an edit there
          reaches the primary's copy at fan-out
        - no module under `lib/store/projection/` imports `lib/user-surfaces.ts` or `lib/user-surface-migration.ts`

### `[ ]` **7.6 Machine-local paths under `.arc/system/.internal/` — § 12.9**

- _Goal:_ The registry lists every machine-local file under `.arc/system/` by name, so a source projecting
  `.arc/system/` leaves them alone.

    - `MACHINE_LOCAL_PATHS` gains, under the `checkout` root (2.2.c), `.arc/system/.internal/worktree-marker.json`,
      `.arc/system/.internal/pristine.json`, and `.arc/system/.internal/schemas/**`, each by name, never all of
      `.internal/`.
    - Build `test-first` (one behavior at a time):
        - each of the three entries is machine-local, and a tracked file beside them under `.internal/` is not

### `[ ]` **7.7 Hold saves through bursts into a removal's persist step — § 1.5**

- _Goal:_ Twenty worktrees of one clone, each a separate process over the ref backend, saving while their checkouts are
  persisted for removal, lose no save.

    - 6.11's suite gains the persist step (7.2), bound through teardown's store-backed context (7.4.b): its processes
      save into another's persist step, lined up by the same stdout and stdin protocol at 6.11's hooks and at 7.2's,
      before it takes over an aside copy and before its last check. Every save placed before the target's last check
      reaches the store, or stays in its file or in an aside copy — pending, refusing with a retry, or kept because its
      path moved on, reported with its path — and refuses the removal; the suite places none at the target's own fan-out
      visit after its persist step, where a save goes with the checkout (§ 17).
    - Passes in one dispatched run of the portability pair and one of the Linux `portability` job, each recorded in
      this task's completion note.

### `[ ]` **7.8 Lock each checkout ARC spawns for a work item — § 12.1, § 12.4, § 12.5**

- _Goal:_ Every linked checkout ARC spawns for a work unit or an Errand carries `git worktree lock` with
  `PROJECTION_LOCK_REASON` once its spawn has succeeded, before the flip as after, but for one another tool already
  locked, which keeps that lock, reported; an anchored checkout carries none; and every removal ARC runs of one goes
  through the removal function, which unlocks only its own reason.

    - `[ ]` **7.8.a Confirm the landing order**

        - Before the lock lands, confirm on the merged base that every removal of a work item's checkout runs the
          removal function, every decision to remove one reads the removal check, and every move ARC runs or prints
          takes `git worktree move -f -f`: `reconcileWorkUnitWorktree`'s move, the rename follow-up
          (`handlers/lifecycle-rename-report.ts`), the occupied-move fallback, and the residue sweep's remedy
          (`lib/session-init/lifecycle-residue-sweep.ts`). The spawn rollbacks — `rollbackSpawnedWorktree`
          (`commands/start.ts`), graduation's in both forms (`lib/work-unit/atomic-graduation.ts`, and the store form's
          `occupyStoreGraduation` rollback run from `commands/start-store.ts`), the fresh-spawn rollback in
          `reconcile-work-unit-worktree.ts`, which a resume's spawn runs too, and the transient claim's
          `rollbackSpawned` (`lib/locus/provisioning-runtime.ts`) — are exempt, since each removes a checkout before its
          lock exists. A plain `git worktree remove` or `move` of a locked checkout left on base
          stops this task and is routed to its owning seam member.

    - `[ ]` **7.8.b The lock at each spawn**

        - The lock is each spawning verb's last step, once every rollback that can remove the checkout has passed:
          `arc start` after `rollbackSpawnedWorktree`'s window; `arc materialize`; `arc resume` and `arc start` on a
          parked work unit, which re-attach its branch in a fresh worktree (`runResume`,
          `lib/work-unit/verbs/park-resume.ts`); and graduation after its rollback — the in-repo form's in
          `lib/work-unit/atomic-graduation.ts`, the store form's once `runStoreGraduate`'s transition returns
          (`commands/start-store.ts`), since its occupation step's rollback runs `git worktree remove --force`, the
          in-repo form spawning through its own `git worktree add` and every other through `reconcileWorkUnitWorktree`;
          and an Errand's through `provisionTransientLocus` (`lib/locus/provisioning.ts`) after `rollbackSpawned`'s
          window. The lock, run as `git worktree lock --reason <PROJECTION_LOCK_REASON>`, keys on the spawn, never on
          the capability; a checkout claimed with `arc start --here` is never locked; promotion rewrites the marker and
          leaves the lock.
        - The step locks only a linked worktree the verb placed with `git worktree add` — never a placement in place,
          which `arc start`, `arc materialize`, and `arc resume` under `--here` return as a spawn naming the current
          checkout, and never the primary, which Git refuses to lock. It reads the checkout's roster row first
          (`scanRegisteredWorktrees`'s `locked`, `lib/git/worktree-roster.ts`, `seam-lifecycle`'s Task 1.6.a), since
          `git worktree lock` refuses a worktree already locked: unlocked, it locks; locked with
          `PROJECTION_LOCK_REASON`, as a replayed `arc errand open` finds the checkout it reuses (`provisionSpawned`'s
          `path-collision` arm, `lib/locus/provisioning.ts`), it does nothing; locked with any other reason, it leaves
          that lock and reports it, and the spawn completes.
        - `PROJECTION_LOCK_REASON` (`lib/git/worktree-removal.ts`) takes the value
          `arc: remove with 'arc teardown' (work unit) or 'arc errand close|abandon|leave' (Errand)`, which Git prints
          after "lock reason:" in its refusal; callers and tests read the constant, never the text.
        - Build `test-first` (one behavior at a time):
            - Integration tier, over real repositories
            - a work unit's spawn, graduation's in both forms, a resume's, and an Errand's each leave the checkout
              locked with the reason
            - a start whose scaffold fails after the spawn, and a graduation that fails after its spawn, roll back
              without a lock in the way
            - an `arc start --here` checkout carries no lock, and an Errand promoted to a work unit keeps its lock
            - `arc materialize --here` and `arc resume --here` leave their checkout unlocked
            - a replayed `arc errand open` finds its checkout locked with the reason, keeps the lock, and succeeds
            - a spawned checkout another tool locked first keeps that lock, and the spawn reports it
            - a plain `git worktree remove` refuses a locked checkout naming the exits, and the removal function removes
              it
            - `git worktree move -f -f` keeps the lock and its reason

### `[ ]` **7.9 Rewrite the removals printed or documented — § 12.6**

- _Goal:_ With the lock live, every removal the agent is told to run or a person is told to type names an exit verb or
  the unlock-then-remove sequence, never a plain `git worktree remove` that the lock refuses.

    - `[ ]` **7.9.a A missing folder's remedy under the lock**

        - The removal check answers `missing`, not `locked`, for a registration whose folder is missing under the
          projection's lock, since the removal function unlocks that lock itself. Two of `seam-locus`'s `missingFolders`
          readings then go wrong, and this task changes both where it composes them, reading the lock's reason from the
          registration's row in the derived roster (`lib/locus/derived-roster.ts`), which carries the reason Git's
          porcelain listing prints (`RegisteredWorktree.locked`, `lib/git/worktree-roster.ts`, `seam-lifecycle`'s Task
          1.6.a):
            - Branch-gone recovery (`lib/session-init/branch-gone-recovery.ts`, `branch-gone-cascade.ts`) gives
              `missing` a plain `git worktree remove <path>`, which Git refuses; where the row's reason is
              `PROJECTION_LOCK_REASON`, `git worktree unlock <path>` comes first, the whole remedy text; where the
              derived roster is null (`getOptionalDerivedRoster`, `handlers/status.ts`: no identity, or its read
              failed), which leaves recovery no reading of the lock, the remedy text carries the condition itself — run
              `git worktree unlock <path>` first if `git worktree list` shows the path locked — before the removal. This
              task hands recovery the derived roster beside the session roster it reads (`WorktreeRosterResult`), whose
              strict `WorktreeRosterEntrySchema`, registered in the session envelope, carries no reason and stays as it
              is.
            - The stale sweep (`lib/session-init/stale-worktree-sweep.ts`, `seam-locus`'s Task 1.7.b) reports a locked
              registration only where the check answers `locked`, so it would never report one under the projection's
              lock; its agreement rule also takes `missing` for a row locked with `PROJECTION_LOCK_REASON`. Its remedy
              keys on that row: an ended work unit's stays the typed `arc teardown <name>`, since the removal function
              unlocks the projection's lock itself, and every other takes the sweep's locked remedy,
              `git worktree unlock <path>` first.
        - Build `test-first` (one behavior at a time):
            - Integration tier, over a real repository
            - a registration under the projection's lock whose folder was deleted is reported by the stale sweep and by
              branch-gone recovery, each naming `git worktree unlock <path>` before its removal
            - an ended work unit's registration under the projection's lock is reported with its typed
              `arc teardown <name>`
            - given a derived roster, an unlocked one keeps its remedy
            - given a null derived roster and a registration locked with `PROJECTION_LOCK_REASON`, branch-gone
              recovery's remedy text names the conditional unlock before its removal

    - `[ ]` **7.9.b The workflow and strategy text**

        - `session-init.md` (`session-init.template.md` in the package, with the installed copy): the stale-worktree
          offer becomes the `arc teardown <name>` command line `seam-locus` adds to the sweep's report; branch-gone
          recovery's shipped-worktree prompt runs the `arc teardown <name>` it adds to the candidate; the
          `missingFolders` reports show with their remedies; a husk no verb covers is removed by hand after
          `arc user save` and `git worktree unlock`.
        - `strategy-concurrent-work.md` (package and project copies): removal and recovery name the exit verbs, the
          lock, unlocking then removing a missing folder's registration by its path, and that forcing past the lock
          skips the persist step.
        - Edited in the package source and synced to `.arc/`, in the shipped-content register.

### `[ ]` **7.10 Clear the primary's personal `.ignore` — § 11.5**

- _Goal:_ The primary's untracked `.ignore`, holding one personal Marksman line, is gone before the tracked one lands
  there, so the line is dropped on purpose rather than overwritten unseen.

    - Delete the primary's untracked `.ignore`, its line not carried over. Git would not refuse the pull: it treats an
      ignored file as expendable and overwrites it without a word.
    - Record the deletion in the completion note.

### `[ ]` **7.11 Removal behind the lock** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base, the lock live and the slots bound.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - Over the reference backend, run the removal check, the persist step, and the release over each held state and its
      repair, then teardown through its store-backed context; confirm 7.7's recorded runs.
    - In this repository, spawn a throwaway work unit and an Errand: confirm each checkout's lock and reason, a plain
      `git worktree remove`'s refusal naming the exits, `git worktree move -f -f` keeping the lock, and the removal
      function's removal through `arc teardown` and `arc errand abandon`; claim a checkout with `arc start --here` and
      confirm it carries no lock, then release it.
    - On the branch head, dispatch the portability pair with `run_portability_pair: true` and the Linux `portability`
      job, and record both runs in this task's completion note, so the final engine has Windows and macOS evidence.
      Request `arc check segment`.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Over the reference backend with real repositories and worktrees, on Linux and in a dispatched run of the
  portability pair, a hand edit saved in place, by renaming a new file over it, or by an agent's write reaches the store
  at the next `arc` command and every other worktree's copy at the writer's fan-out, a pull's merges included; the
  save-loss harness loses no save timed into a refresh or a file removal; and over the ref backend, twenty worktrees
  saving into refreshes, fan-outs, file removals, and checkouts' persist steps at once lose no save, but for the
  residuals the spec's § 17 names.

- `[ ]` A clash with a stored base lands as a conflict record that every rendering checkout draws in — markers where
  placement's check passes, escalated with the resolve-by-hand line where the file holds a marker-like line, a notice
  line where it fails or the conflict is whole-record, status and the refusing verbs alone for a stampless file, and
  write-back's report and status for a file held whole for a malformed set or a resolution in progress until it is
  released, then the file — and resolves by hand-edited markers or `arc save --resolve`, keeping the store's side
  included, which refuses while its file is held; untouched markers keep it open, malformed ones refuse, and a clash
  with no stored base stays in its file and persists once resolved.

- `[ ]` Write-back and `arc save` send each edit through its kind's parser against its base's record version, under
  `write-back` or `save`; a verb-owned field change is refused and kept in its file; one refused edit blocks no other;
  each store refusal takes its path; and the `after` view's conformance case passes over each backend that runs checks.

- `[ ]` An edit to a protected or another person's archived file, an unadopted file, a file that fails to parse, a
  refused edit, a file held by a conflict, a file withheld at a rebuild, and a file not yet settled each stay in their
  file and are reported, as an aside copy kept because its path moved on stays in the aside folder, reported with its
  path; the removal check answers `persist-would-refuse` for each and `unobservable` for a failed read; and the persist
  and release steps refuse over each, then succeed once it is resolved or, for the copy, deleted.

- `[ ]` Before the flip, every checkout ARC spawns for a work unit or an Errand carries `PROJECTION_LOCK_REASON`, or
  keeps a lock another tool set first, reported; under `PROJECTION_LOCK_REASON` a plain `git worktree remove` refuses
  it naming the exits, the removal function removes it, and a move keeps it; and an `arc start --here` checkout carries
  none.

- `[ ]` The isolation test passes; `layout.active: flat` lays the checkout's work item flat; a changed view setting,
  identity, checkout claim, or `layout.active` reprojects what it governs; and every projected path resolves through
  `resolveArcPath` and back through the classifier.

- `[ ]` The no-change overhead stays within 10 ms on Linux and 60 ms on Windows at this repository's size; the start, a
  full materialization, and a one-file fan-out into 20 worktrees each measure within their tripwires' bounds on every
  platform; and a ten-file fan-out into 20 worktrees measures within its bound on Linux and macOS, its Windows median
  recorded against it.

- `[ ]` Over the in-repo implementation the root hooks do nothing, `arc save` and `arc editor` refuse `unsupported`,
  `arc init` and `arc join` print no Zed setting, and the removal slots pass — while the worktree lock, the managed
  `.ignore` block, and this repository's `.gitignore` change are live.

- `[ ]` The guard refuses a projected root no rule ignores and an `.arc/user/*/` rule outside `.gitignore`, and passes
  once the line is restored; `arc init` (with `--reconfigure`), `join`, and `update` write the managed `.ignore` block,
  which re-includes the four roots and keeps a repository's own lines; and the `.worktreeinclude` copy copies nothing
  under the projected roots or `.arc/system/.local/`.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
