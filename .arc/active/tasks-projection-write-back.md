# Task List: Projection Write-Back

- **Design:** `spec-projection-write-back.md`

---

## **Phase 1:** Write-back and conflicts

_Purpose:_ Send each hand edit through its kind's parser, write check, and the store's merge at every command's start
and at `arc save`, and show the conflicts the store files, and the clashes the checkout finds, in the file.

_Mode:_ `slice` — closes on a hand edit in a projected file persisting through the command's start and `arc save` over
the reference backend, its conflicts drawn into the file and parsed back.

_Exit criterion:_ Over the reference backend in a real repository, on Linux and in a dispatched run of the portability
pair, driven through the engine's start and `arc save`'s handler, an edit to a projected file reaches the store at the
next command's start under `write-back` and at `arc save` under `save`; a stale edit merges through the store and its
clash lands as a conflict record drawn back into the file as markers; resolving the markers persists naming the
conflict; an edit the write check refuses stays in its file, reported on stderr ahead of the command's output; and
through the CLI over the in-repo implementation the hooks do nothing and `arc save` refuses `unsupported`.

_Design decisions:_ This list is the second of three members' that build one design (spec § 1.1, § 1.3), over the
shipped engine in `lib/store/projection/` and its take-in port (`TakeInPort`, `take-in-port.ts`); `projection-worktrees`
builds on both, and tests run as the engine's do (§ 1.5). The base version 1.5 passes (`MergeTextInput.baseVersion`),
the hunk record's `baseVersion`, `currentLines`, and `incomingLines` 1.7.a places from (`TextConflictRecordSchema`,
`lib/store/conflict.ts`), and the reference backend's stale-base parse refusal 1.6 exercises have shipped. Only 1.6 and
2.3 build after `storage-ref-hardening` lands; the `state-unresolvable` and `namespace-corrupt` arms of 1.2, 1.3, 1.7,
and 1.8 key only on the refusal's code and `historyRefs` (`StoreRefusalSchema`, `lib/store/refusal.ts`), which this
checkout holds, and build now over the test stores, confirmed against it as shipped with 1.6. The engine's process state
(1.9.a) is the one place the later phases' and `projection-worktrees`' process-wide state and ports live. Adoption is
Phase 2's (2.8), after the addresses and edit rights it reads. Every test of a typed refusal also shows success once its
condition is repaired (spec Cross-cutting Considerations, Testing), whether or not the test below names that case: the
same edit or command landing once the condition clears, or, where the repair is a different input — a name, a path, an
owner, a checkout — a test of that input beside it, which the tests below name; a refusal of what a backend cannot hold
— the in-repo implementation's path-keyed companion, an entry kind whose grammar is not yet declared (spec § 7.6), or an
edit to a record no longer there, which stays a refused edit at its path until the person resolves it (spec § 7.8;
`spec-projection-substrate.md` § 5.6) — has none, and every other, `namespace-corrupt` and a backend's key refusals
among them, has one.

### `[x]` **1.1 Parse an edit and send it against its base — § 7.1**

- _Goal:_ Each hand-edited file reaches the store as its own write: its IDs restored, parsed by its kind's parser, sent
  against the record version its base names, merged by the store where it has moved on, and replaced by the record read
  back, with what the write-back took in kept for a stale buffer's next save.

    - `[x]` **1.1.a Parse and send**

        - Added `prepareWriteBack` and the bound take-in port: settled reads, production parsing, one content put per
          file against its indexed base, primary placement preserved without its archive sequence, and refusal reports.
          The caller owns swaps and publication; the pre-send raw index write marks other aside copies without advancing
          the racy reference, and an aside landing records the bytes it read.

    - `[x]` **1.1.b Read back**

        - The shared send reads and records the landed content without swapping; `writeBackFile` stages that record
          through the guarded read-back batch, keeping the exact read baseline and prior pending state. The shared
          renderer separates stored-base stamps from laid bytes; a failed read-back preserves a reported, pending edit.

    - `[x]` **1.1.c Entries typed by hand**

        - Restore missing IDs through the shared matcher against the selected base. Later duplicate IDs draw from a
          SHA-256 stream seeded by the reference, base, and edited content; preparation retains the remaining stream for
          stamping, and a retry after an unrecorded landing sends the same replacement identity.

    - `[x]` **1.1.d Select the base**

        - Added stamp, persisted, history, and recovery base selection with stampless candidate agreement. Both
          interrupted-replacement versions survive the read; unreadable or differing candidates stay pending. Stored
          candidates de-duplicate by version, kept copies by blob; one candidate needs no content read.

### `[x]` **1.2 Check an edit with the kind's write check and the `after` view — § 7.2, § 7.3**

- _Goal:_ An edit persists only if its kind's write check, run as a hand edit over the merged result, admits it — a
  change to a verb-owned field refused there and kept in its file — and an `after` view answers as the backend will once
  the write lands, which a conformance case holds.

    - `[x]` **1.2.a The check's input**

        - Write-back checks production-parsed merged content as a hand edit, retaining raw prior content when its
          parser fails. Entry merges stamp a seeded check copy while the backend receives the unstamped edit;
          every broken rule is reported with its remedy, and refused edits remain available for repair.

    - `[x]` **1.2.b The `after` view**

        - `createWriteBackAfterView` overlays caller-parsed pending content, preserving envelopes, conflicts, saved
          views and lookup results. Name-only reads and listings retain the backend's generation authority; new
          companions inherit their owner's placement and receive a placeholder version.

    - `[x]` **1.2.c The conformance case**

        - Conformance item 18 compares canonical and named reads, family listings, and slug, lineage, claim and ref
          lookups with landed writes across projecting kinds, apart from backend-assigned versions, conflicts and entry
          IDs. It runs in the reference suite and both ref layouts; registration ranges and inventories follow.

### `[x]` **1.3 Persist under hand-edit provenance, and extend the test stores — § 7.4–§ 7.6, § 1.5**

- _Goal:_ Every persist of a hand edit lands under `write-back`, or `save` at `arc save`, with the lifecycle action
  `edit`, set by write-back and never read from the file; a serialization or unhomed-kind refusal is a refused edit with
  its remedy; and test stores wrapping the reference backend return the refusals it cannot.

- _Outcome:_ The operation selects `write-back` or `save` with `edit`; backend malformed-record refusals retain their
  rule ID and remedy. The schema-checked refusal store covers unhomed kinds, missing state without history refs,
  namespace corruption and pull locks, with explicit repair and call counts.

### `[x]` **1.4 Render conflict markers and parse them back — § 6.1, § 6.2, § 6.4**

- _Goal:_ Markers render at one length per file — seven, or escalated with a resolve-by-hand line where the file holds a
  marker-like line — and parse back exactly, each set to its own conflict: untouched markers keep a stored conflict
  open, replaced markers resolve it, a clash found in the checkout keeps its file unsent, and a malformed set refuses
  until repaired.

    - `[x]` **1.4.a Rendering and length**

        - `createMarkerRenderer` labels each stored conflict or checkout clash, preserving the stored side first.
          One file-wide length grows past all marker-like runs, including outside and fenced content; escalated sets
          carry a resolve-by-hand instruction, and side labels remain on their marker lines.

    - `[x]` **1.4.b Parsing back**

        - Exact-length scanning binds sets to indexed origins, substitutes stored sides, and resolves replacements in
          the same put. Malformed entries restore selected-base content while independent edits land; refused files
          retain their bytes. Persisted take-ins support repair, and unseen conflicts carry the file's repair remedy.

### `[x]` **1.5 Merge in the checkout where the store holds no base — § 7.7**

- _Goal:_ The three edits whose base the store never held — a save merging from content a persisted write-back took in
  and kept as a copy, content sharing no non-blank line with any candidate, and a hand edit to a meta or task list over
  a verb's write — merge in the checkout onto the store's current version; a clean result is sent, and a clash stays in
  its file as markers, never stored. A file other than Markdown whose candidate bases disagree is held: its clash with
  the store's current version is drawn into it once, and it stays held, reported with a token, until its candidates
  agree or `arc save --resolve` sends it.

- _Outcome:_ `checkout-merge.ts` sends clean copy, empty-base, and single-writer merges against the current record,
  retaining their raw input. Line callbacks render clashes without storing them; candidate comparison includes their
  positions and sides. Stampless holds retain their token and final-newline choice. Staged metadata and observed edits
  protect saves at guarded swaps, while malformed entries keep the whole file undrawn until repaired.

### `[x]` **1.6 Handle each refusal the store returns — § 7.8, § 1.5**

- _Goal:_ A refusal lands nothing and loses nothing: each code leaves the edit in its file, marked refused or pending,
  and takes the path its section names, exercised over the reference backend and, for the refusals it cannot return,
  the test stores (1.3).

- _Outcome:_ Store refusals retain their rule and backend remedy without changing the saved bytes. A rejected merge
  base recovers once per command across the walk and aside take-ins, preserving the carried stamp and pre-send copy
  marks and standing ambiguity tokens; a second rejection or held lock stays pending. Removed records remain refused
  with a copy-out remedy. Local data faults pull nothing and retry after repair; an accepted write is never resent for
  a read-back refusal. The shipped hardening surfaces match the grounding notes.

### `[x]` **1.7 Draw the conflicts the store files into the file — § 6.3**

- _Goal:_ A conflict the store files shows in every checkout that renders its record — markers where placement's check
  passes and its span meets no other set, and a notice line where the check fails, where it would meet another set, or
  where the conflict is whole-record — never markers placed by guess.

    - `[x]` **1.7.a Placing an entry or hunk conflict**

        - `placeStoredConflict` locates entry spans by ID and hunks through memoized base history, checking the current
          side and both neighbors or file edges. Exact side counts preserve blank lines and deletion points; unreadable
          history leaves the conflict unplaced until repair.

    - `[x]` **1.7.b Notice lines and stampless files**

        - Unplaceable and whole-record conflicts render as notices with their token, incoming label, status command,
          and resolution remedy. Stampless files record unshown conflicts only in their index; held files retain their
          bytes and draw fresh conflicts after repair.

    - `[x]` **1.7.c One renderer for every replacement**

        - `createRecordRenderer` binds stored evidence and history for read-back, checkout drawings, and guard restaging.
          Held sets retain their origins; token-ordered placements share one marker length and reserve lines and empty
          points. Restaging refusals retain fresh unshown conflicts and reach the caller's diagnostic report.

- _Outcome:_ Stored hunk line counts now govern rendering and parse-back, so unchanged blank sides remain open
  conflicts. Closed held sets keep their work-item generation, and a failed rendering preserves a landed take-in.

### `[x]` **1.8 Keep a conflicted file refreshing — § 6.6**

- _Goal:_ A conflicted file keeps taking the store's other changes by a three-way line merge, takes a resolution made
  elsewhere when unchanged since it was written, and waits, reported, only where the store's change overlaps an open
  marker set — one function the refresh calls (`projection-worktrees`). A file holding a resolution in progress or a
  malformed set never reaches it: the replace guard holds it whole, a refused edit, until the resolution is sent or the
  set repaired (1.4.b).

- _Outcome:_ `prepareConflictedRefresh` returns the shared rendered view or a retryable pending remedy without writing.
  It removes closed sets only from byte-unchanged files, grows controls before merging, and uses line merges for every
  kind; newly open conflicts draw and closed notices leave together.

### `[ ]` **1.9 Write back at every command's start, and report it — § 2.2, § 1.4**

- _Goal:_ Every `arc` command starts by writing back pending edits under its worktree's projection lock and ends with
  the second check, reporting each refused, skipped, deferred, withheld, or conflicted file on stderr ahead of its own
  output — and over the in-repo implementation the hooks return at once.

- _Note:_ `seedProjection` takes no protected, notice-line, or marker options and sets up no ignore rules; tests needing
  them extend it, the ignore rules as `sweep.test.ts` sets them up.

    - `[x]` **1.9.a The engine's start and end**

        - Command start binds process state, launches reads under its lease, and sweeps before writing back indexed
          roots; ignore-refused roots send edits without replacing files. End re-locks and reads fresh indexes before
          settling copies and removing unreferenced retained content. Mutation checkpoints stop writes after lease loss.
          Aside copies retain their own marker origins; returns publish restored mappings before alias cleanup and
          recover interrupted links by filesystem identity.
        - _Retired in:_ Phase 2

    - `[x]` **1.9.b The root hooks and the report**

        - Root hooks start after the development guard and settle before refresh, including actions that set an exit
          code. Root `save` includes completed roots under save provenance; every start outcome remains in process
          state. Stderr reports carry file and copy paths, pending reasons, rule remedies and quoted argv, unseen
          conflicts and accepted resolutions. The production CLI retains whole JSON and performs no projection I/O
          over the in-repo backend.

    - `[ ]` **1.9.c What `arc status` reports**

        - `arc status`'s composite view gains a projection section — what stays refused or pending, every withheld file,
          ownerless files (the index's ownerless entries, `ProjectionIndexSchema`,
          `lib/store/projection/index-schema.ts`), every aside copy kept for the person, with its path, and the open
          conflicts a stampless or held file does not show — which its handler reads from the index without writing it:
          a field on `StatusResult` (`commands/status/types.ts`), which its `--json` output writes as it writes the
          rest, and a section in its rendered summary. The composite result has no
          registered schema, and none is added.
        - Build `test-first` (one behavior at a time):
            - a refused edit and a withheld file each appear in `arc status`, and the refused edit leaves once resolved;
              an aside copy kept because its path moved on appears with its path and leaves once deleted

### `[ ]` **1.10 `arc save` and its `--resolve` — § 2.4, § 6.5**

- _Goal:_ `arc save` writes back every pending edit in every projected root, `completed/` included, under `save`, and
  returns the state version; `--resolve <conflict>` resolves a conflict shown without markers, and a held file other
  than Markdown by the token its index entry names, refusing every case it cannot; and before the flip it refuses
  `unsupported` naming `arc user save`.

- _Note:_ The hold remedy from 1.5 and notice line from 1.7.b name `arc save --resolve`; registration here closes the
  emitted-command case of `command-surface-documentation.test.ts` (`registers emitted corrective commands`), which the
  commit gate does not run (`ARC_CONTRACT_SUITES`, `lib/local-vitest-runner.ts`).

    - A new command in `cli.ts`, in `HELP_GROUPS[""]` (`lib/cli-help-content.ts`), `COMMAND_SUMMARIES`
      (`lib/cli-help-summaries.ts`), and the command-input declarations, with a handler that takes the command's store.
      Its start is the engine's start in its `save` form, which this task builds and the root hook runs (1.9.b): each
      file its own write, and a refusal naming a missing history ref pulled and retried once (2.3). The start records
      its outcome in the engine's process state and refuses nothing itself; the handler refuses on it as its own result,
      `--json` included — a lock the start found held naming the holder and a retry, one lost while it ran or gone with
      the worktree's Git directory naming the loss or the missing directory and a retry (`withProjectionLock`), and no
      identity (`readProjectionConfiguration`) naming the remedy that sets `arc.identity`. Its refusal of
      `--skip-projection` comes with the switch (2.9).
    - `--resolve` parses 1.7.b's token with `parseConflictToken` (`lib/status/conflict-token.ts`), which returns the
      family, owner type, owner name, and key, no owner UID, and finds its conflict in the index's mappings, whose
      references carry the owner's UID (1.7.c), never building a store reference from the token alone. Before any
      listing, a token ending the remedy argv of an entry's `bases-disagree` refused mark (1.5) finds a hold: it sends
      that file's text against the store's current version under `save`, naming no conflict in `resolves`, and its
      read-back clears the mark; while the drawing's markers stand it refuses naming them, as for any conflict this
      checkout shows with markers. On a token the index does not map, it lists the store's conflicts with no owner in
      the listing's input (`ListInputSchema`, `lib/store/read.ts`), since each backend resolves an owner named without a
      UID to a single holder, the live one first (`listReference`, `__tests__/helpers/store/read.ts`;
      `spec-storage-ref-backend.md` § 8), and matches the token's family, owner type, owner name, and ID itself, only to
      choose the refusal below, refusing as ambiguous, naming each, where several owners match; it never resolves from
      that listing. It attaches the conflict to its subject file's write, sent even when the file is unedited, which
      keeps the store's side. It refuses, each with its remedy: an unknown conflict; one already closed, named as
      resolved; a subject with no projected file in this checkout, naming where it projects or its owner; a conflict
      this checkout shows with markers, naming them; a whole-record conflict whose other side is a removal, a verb-owned
      field, or a changed placement, naming the verb that redoes the change; a withheld subject file, naming the remedy
      `projection-worktrees`' materialization gives; and a subject file the replace guard holds whole for a resolution
      in progress or a malformed set (1.4.b), naming the repair that releases it — finishing the resolution or repairing
      the set — after which the conflict shows as 1.7 draws it. The withheld subject's refusal is tested with
      `projection-worktrees`' refresh, and the refusal for a subject with no projected file here at 2.6, once what each
      reads exists.
    - Registering `save` with `--resolve` extends decomposition's source-conflict remedy, the one constant every source
      and decision site that refuses an open conflict shares (`DECOMPOSE_SOURCE_CONFLICT_REMEDY`,
      `lib/decompose/source-conflicts.ts`), in the same change: resolve the markers in the file that shows them, which
      write-back persists, or otherwise run `arc save --resolve <token>` from a checkout projecting the subject, then
      the mode again (`spec-seam-decomposition.md` § 18). Its integration test, `decompose-conflict-remedy.test.ts`,
      requires the remedy to name `arc save --resolve <token>` exactly when the command inventory registers a top-level
      `save` with `--resolve` (`loadRepositoryCommandInputSnapshot`), so it fails from the registration until the remedy
      changes. The terminal lineage's conflict refusal keeps its own remedy (`readDecomposeLandedRetirement`,
      `lib/decompose/landed.ts`), as does a stored cut map's (`acquireDecomposeTerminal`,
      `lib/decompose/acquire-terminal.ts`). Registering it also clears the emitted-command case of
      `command-surface-documentation.test.ts`, red since 1.5's hold remedy named `arc save`.
    - Build `test-first` (one behavior at a time):
        - Integration tier, through the start in its `save` form and the handler, over the reference backend
        - `arc save` persists an edit in `completed/` that no other command's start scans, and prints the state version
        - `arc save` takes in an aside copy an exited writer left
        - `arc save --resolve <conflict>` with the subject file unedited keeps the store's side and closes the conflict
        - each other `--resolve` refusal names its remedy, and the same conflict resolves once the cause is repaired
        - `--resolve` on a conflict whose subject file holds a malformed set refuses naming the repair, and the conflict
          draws into the file once the set is repaired
        - a token is found through the index's mapping, its owner's UID included
        - `arc save --resolve <token>` on a held file other than Markdown, its drawn markers gone, sends the file's text
          against the store's current version and clears the hold
        - `--resolve` on a hold whose drawn markers stand refuses naming them
        - a token the index does not map, whose owner name two owners with that conflict ID share, refuses as ambiguous,
          naming each
        - a lock held past its bound refuses naming the holder, and the retry lands
        - a lease lost while it runs refuses with a retry, and the retry lands
        - a worktree whose Git directory is gone refuses naming it, and the retry lands once it is restored
        - with no identity it refuses naming the remedy, and the same `arc save` lands once `arc.identity` is set
        - a refusal under `--json` is the handler's whole JSON result on stdout
        - E2E tier, through the CLI over the in-repo implementation: `arc save` and `arc save --resolve` refuse
          `unsupported` naming `arc user save`, and the help inventory lists `save`
        - decomposition's conflict-remedy test passes with `save` registered, its remedy naming
          `arc save --resolve <token>`

### `[ ]` **1.11 A hand edit persists through write-back** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds end to end on a freshly merged base.

    - Merge base into the branch (append-only); run `npm ci` first if the merge changed `package-lock.json`.
    - In one scripted repository over the reference backend, run the exit criterion's scenario through the engine's
      start and `arc save`'s handler — an edit, a stale edit and its conflict, its resolution, a refused edit — then the
      CLI over the in-repo implementation, and request `arc check segment`.
    - On the branch head, dispatch the portability pair with `run_portability_pair: true`, and record the run in this
      task's completion note.

## **Phase 2:** Edit rights, the `active/` layout, adoption, and settings

_Purpose:_ Settle the rules every write-back and refresh obeys — who may edit what, where each record projects, which
record a new file belongs to — and the settings that steer them.

_Mode:_ `layer` — closes on the rules every write-back and refresh obeys: edit rights, protected files, the layout's
addresses, adoption, and the settings that select them.

_Exit criterion:_ Every projected path resolves through `resolveArcPath` and inverts back through the classifier to its
record; an edit to a protected file is refused naming where it can be made, and an archived file's owner corrects it in
place; a new file adopts by its folder or refuses naming where it goes; the in-flight view setting and `layout.active`
select what projects where; `--skip-projection` runs a command with no write-back; `arc editor` merges and removes
only ARC's keys; and `arc selection` prints the projected Markdown files the checkout may edit, `--changed` those it
changed since its last `arc save`, which the Markdown checks' reader returns.

_Design decisions:_ The classifier's two steps are `identifyArcFileAddress` (`lib/layout/file-identification.ts`) and
`classifyStoreAddress` (`lib/store/target-classification.ts`); the holding-checkout lookup is `findHoldingCheckout`
(`LocusPorts`, `lib/work-unit/locus-ports.ts`), the finder for a checkout claimed in place
`findMarkerlessWorkUnitCheckouts` (`lib/locus/markerless-work-units.ts`), and the path function `workItemArtifactPath`
(`lib/store/lifecycle-storage.ts`); a completed item's write refusal is the ref backend's (`missingArchivedHistory`,
`lib/store/ref/archive-resolution.ts`), and a companion's path key has its stored path and codec there (§ 18). Every
test of a typed refusal also shows success once its condition is repaired (spec Cross-cutting Considerations, Testing),
whether or not the test below names that case: the same edit or command landing once the condition clears, or, where the
repair is a different input — a name, a path, an owner, a checkout — a test of that input beside it, which the tests
below name; a refusal of what a backend cannot hold — the in-repo implementation's path-keyed companion, an entry kind
whose grammar is not yet declared (spec § 7.6), or an edit to a record no longer there, which stays a refused edit at
its path until the person resolves it (spec § 7.8; `spec-projection-substrate.md` § 5.6) — has none, and every other,
`namespace-corrupt` and a backend's key refusals among them, has one.

### `[ ]` **2.1 Edit rights by lifecycle state and kind of record — § 8.1**

- _Goal:_ Write-back decides who may edit a file by its record's lifecycle state and kind, never by the folder it
  projects to: stubs by anyone; an in-flight work unit's prose by its owner from any checkout, and its meta and task
  list only from the owning checkout; an Errand's description and a work item's inbound list by its owner from any
  checkout; cohort documents, live or archived, and the project inbox by anyone; personal records by their identity
  alone; archived work by its owner (2.3); and nothing of another person's work items, their inbound lists included,
  where routing inserts arrive through the routing verb.

    - One function in `lib/store/projection/` answers from the record's lifecycle state, kind, and owner, the editing
      identity, and the work item the checkout's marker names (`projection-worktrees`). This task binds it to the rights
      port 1.9.a leaves unbound, through which write-back reads it; the persist refusal (2.2), adoption (2.8), the
      protected mark a refresh records (`RecordEntry`, `lib/store/projection/index-schema.ts`), and the removal check
      (`projection-worktrees`) read it too, and rights follow the worktree whose file holds the edit
      (`TakeInRequest.checkout`, `lib/store/projection/take-in-port.ts`).
    - Build `test-first` (one behavior at a time):
        - a stub's file is editable by any identity
        - an in-flight work unit's spec is editable by its owner from another checkout, and its meta is not
        - an Errand's description and a work item's inbound list are editable by their owner from any checkout
        - another person's inbound list is protected
        - a cohort document, live and archived, and the project inbox are editable by any identity
        - another identity's working memory is protected
        - with the port bound, write-back reads rights through it, refusing an edit to another identity's working memory
          and landing one to its own

### `[ ]` **2.2 Protect a file in three layers — § 8.2**

- _Goal:_ A file the reader may not edit says so where it is read, is read-only on disk, and refuses at persist naming
  where on this machine the edit can be made — the refusal keyed on the content change, never the mode.

    - The notice line is an HTML comment beside the base stamp, after Go's `Code generated … DO NOT EDIT.`, naming where
      an edit can be made: the checkout on this machine whose marker names the work item, from the holding-checkout
      lookup keyed by the owner's UID (`findHoldingCheckout` over `ownerHolderRequest`); where none does,
      `arc materialize <slug>` for its owner, with `--here` and the checkout where a markerless one has the work branch
      out (`findMarkerlessWorkUnitCheckouts`); the owner for anyone else; for archived work another person owns, its
      owner; and for a read-only source's file, the source (`projection-worktrees`). It never names another machine.
      Where the lookup answers `unbound` — a checkout's marker naming the work item that no record binds — the notice
      and the refusal name its recovery exits, and where it throws — two holders (`requireSingleHolder`,
      `lib/locus/lifecycle-ports.ts`), a failed scan, an incomplete roster, an unreadable marker — they name its
      message, which carries the repair, in place of a checkout.
    - The file is written read-only (0444, or Windows' read-only attribute) by 1.7.c's renderer, which adds the notice
      line; the swap keeps the mode (`swapBatch`, `lib/store/projection/swap.ts`). The persist refusal compares content
      against the base, never the mode, and names the place from the markers as they stand when it fires. A file other
      than Markdown carries the mode and the refusal but no notice line.
    - The Windows read-only case is evidenced by a dispatched run of the portability pair, recorded in this task's
      completion note.
    - Build `test-first` (one behavior at a time):
        - a protected meta the swap writes, driven directly over the seeded projection (`seedProjection`), is read-only
          with a notice naming the owning checkout's path
        - an edit forced through the mode is refused at persist, stays in the file, and is reported naming the checkout,
          and the same edit made in that checkout lands
        - with no checkout here holding the work item, the notice names `arc materialize <slug>` for its owner
        - a markerless checkout with the work branch out makes the notice name `--here` and that checkout
        - a lookup throwing over two holders makes the notice name its repair, and one answering `unbound` its exits
        - a protected stampless file carries the mode and refuses an edit, with no notice line, and the same edit made
          in the checkout that may make it lands

### `[ ]` **2.3 Edit archived work in place — § 8.4**

- _Goal:_ The archived work unit's owner corrects its files in `completed/` from any checkout, meta and task list
  included, as a write in place that keeps its archive number; anyone else's archived work is read-only; and a missing
  history ref is pulled by name and retried once only where the network may be waited on.

- _Note:_ Built once `storage-ref-hardening` is on base and this branch has merged it, never on that work's branch;
  the retry's arms are confirmed against it as shipped first (spec § 18). See `notes-projection-write-back.md`
  § Grounding against `storage-ref-hardening`.

    - Write-back does not scan `completed/` (1.9.a), so a correction persists at `arc save`, at the persist or release
      step (`projection-worktrees`), or when a refresh touches the file. Each kind's write check applies.
    - `arc save`, and the persist and release steps when `projection-worktrees` builds them, run write-back over the
      store's history retry (`retryEndedItemHistory`, `lib/store/history-retry.ts`), its notices written into
      write-back's report, and build the command's `history` memo over that store (`createHistoryMemo`), memo over
      retry over store, so the memo keeps the answer the retry reached. A write to a completed item, or a `history` read
      a merge in the checkout makes, that refuses `state-unresolvable` naming at least one history ref then pulls those
      refs by name and runs once more (`pullHistoryForRetry`, `lib/store/pull-consumption.ts`). Where the pull is
      refused, `lock-held` among its refusals, or a state or candidate outcome fails, or the pull leaves a store
      designation unanswered, the retry answers the first refusal; where the retried operation refuses again, as where
      the state remote lacks the ref too, it answers that one; either way the edit stays refused, carrying the remedy of
      the refusal answered. A refusal naming none, and `namespace-corrupt`, are 1.6's and take no pull. Every other
      start uses the store unwrapped, so at any other command's start the refusal stays refused with a remedy naming
      `arc save`, and nothing is pulled.
    - Build `test-first` (one behavior at a time):
        - Integration tier, over the reference backend and the test stores (1.3): `lackingEndedHistory` for a refusal a
          pull lifts, and `createHistoryRefusingStore` for one it does not
        - the owner's correction to an archived meta persists at `arc save` and keeps its archive number
        - another person's archived file is protected and its edit refused, and the same edit by its owner persists
        - at `arc save`, a missing history ref is pulled, the test store records the pull, and the retry lands
        - at `arc save`, a merge's `history` read refused for a missing ref is pulled and retried, and the memo answers
          the retried read
        - where the pull leaves the ref missing, the edit stays refused with the retry's remedy
        - where the pull is refused `lock-held`, the edit stays refused with the first refusal's remedy, and lands at
          the next `arc save` once the lock is free
        - a refusal naming no history ref at `arc save` records no pull and stays refused with its remedy, and lands
          once the remedy is applied
        - at another command's start, the same refusal stays refused with the `arc save` remedy and nothing is pulled

### `[ ]` **2.4 Register the `active/` locations and the projected file names as layout addresses — § 10.1, § 10.2, § 9**

- _Goal:_ Every path the projection writes resolves through `resolveArcPath` and inverts back through the classifier
  to one record: `active/current/` for the checkout's own work item and its cohort copies, `active/in-flight/<slug>/`
  for the other work items its view selects, and every file name the projection defines.

    - `[ ]` **2.4.a The two locations**

        - The active placement's project scope (`ActivePlacementSchema`, `lib/layout/schema.ts`) gains its two projected
          locations — the checkout's own, carrying the effective `layout.active` value (2.5) and the slug of the work
          item the checkout claims, since `lib/layout/` imports no configuration and reads no marker
          (`layout-dependencies`, `eslint/architecture-imports.ts`), and another work item's — beside today's flat form,
          which the in-repo implementation keeps resolving. The contributor scope keeps its flat form alone: the store's
          `active` placement carries no scope, and the path function lays it under the project scope
          (`lib/store/lifecycle-storage.ts`). Inverting a path at the checkout's own location — under `active/current/`,
          or at the top of `active/` where `layout.active` is `flat` — takes that slug and the effective `layout.active`
          as its inputs, since the path holds no slug a hyphenated name could not also claim, and the top of `active/`
          names a record only under `flat`; the Errand overlap check (`handleErrandCheck`, `handlers/errand.ts`) passes
          both, read from the checkout's marker and configuration as 2.4.c reads them. `resolveArcPath`
          (`lib/layout/projection.ts`) projects each. A cohort document's copy at the checkout's own location takes its
          own address kind (2.4.b), carrying that location's inputs, which the classifier maps to the cohort document's
          record, a second path of one record; `cohort-document`, whose placement stays `planned` or `completed`, is
          unchanged, and so are its readers.
        - Build `test-first` (one behavior at a time):
            - a work unit's meta resolves under `active/current/` at its own location and under
              `active/in-flight/<slug>/` at another's
            - at the own location with `flat`, it resolves to `.arc/active/meta-<slug>.md`
            - a cohort document's copy resolves into `active/current/` and inverts to the cohort document's record

    - `[ ]` **2.4.b The file names**

        - A companion (`work-item/companion`) is keyed by a managed path — `keyed("work-item", "path")` in `KIND_SHAPES`
          (`lib/store/catalog.ts`), the key `personal/document` already takes — with the ref backend's stored path and
          codec for it, from `storage-ref-backend` (§ 18). That backend refuses a key colliding with its own folders and
          files in the work item's ref — at the root, any name matching `^metadata-[0-9a-f-]{36}\.json$` or a path under
          one (`isOwnerMetadataName`, `lib/store/ref/metadata-filename.ts`) — one an earlier decode form would claim,
          judged after it resolves the owner, against that owner's current slug, or one through a segment Git refuses
          or over 4,096 bytes, and write-back reports each as a refused edit carrying the backend's remedy (1.3). The
          in-repo implementation refuses `unsupported` `unhomed-kind` a key naming a registered role, and every key but
          a name of lowercase letters alone or a paired spec's half, since any other file name it builds fails
          `companionPath`'s matcher (`artifactMatcher`, `lib/work-unit/mutators/relocate-artifacts.ts`;
          `lib/store/in-repo/paths.ts`).
        - Addresses for a work unit's companions as `<name>-<slug>.md`, keyed `<name>`; any other text file in a work
          item's folder, or in a folder beneath it, as a companion keyed by its path below that folder, forward
          slashes, projected back at that path; a paired spec's halves as `spec-<slug>-prd.md` and
          `spec-<slug>-rfc.md`, keyed `spec-prd` and `spec-rfc`; `inbound-<slug>.md`; `errand-<slug>.md` for an Errand's
          description; a cohort document's copy as `cohort-<cohort>.md`; and `scratch/` documents, each keyed by its
          path.
        - The inverse, which the classifier's first step reaches (`identifyArcFileAddress`), tries, in order: a work
          unit's artifact names (`WorkUnitArtifactKindSchema`; `parseArtifactFilename` is private to
          `lib/layout/identification.ts`, so the inverse lives there); the fixed forms — a paired spec's halves,
          `inbound-`, `errand-`, and a cohort copy; `<name>-<slug>.md`; then the path key. The schema refuses a
          companion key equal to `meta`, `tasks`, `draft`, `spec`, `notes`, `errand`, `inbound`, or `cohort`, as the ref
          backend does; one beginning `cohort-`, which D13 reserves inside `current/`; and a path key an earlier form
          would match, judged against the slug the folder names, or the checkout claim's for its own location, as the
          ref backend judges a verbatim key against the resolved owner's current slug. The `<name>-<slug>.md` form
          claims neither `spec-prd` nor `spec-rfc`, so no key resolves to a path that inverts to another.
        - These addresses are new address kinds in `ArcLayoutAddressSchema` (`lib/layout/schema.ts`), not new values of
          `WorkUnitArtifactKindSchema`, whose readers stay as they are; the cohort copy is its own, carrying the
          checkout's own location's inputs (2.4.a), and `cohort-document` stays as it is. In the same change each new
          address takes its kind and key in the classifier's exhaustive store-side map (`classifyStoreAddress`,
          `lib/store/target-classification.ts`), which the compiler holds, and each new kind naming a work item's or a
          cohort's state, the cohort copy's among them, joins the `work-unit-paths` ratchet's kind set
          (`WORK_UNIT_ADDRESS_KINDS`, `eslint/architecture-imports.ts`), which it does not. A record projects only where
          an address exists for its kind, so the Errand queue (`personal/errand-queue`) projects nothing.
        - Build `test-first` (one behavior at a time):
            - each new address resolves to its path and the classifier inverts the path back to its kind and key
            - `research-<slug>.md` inverts to a companion keyed `research`, and `diagram.svg` to one keyed `diagram.svg`
            - a file in a work item's subfolder inverts to a companion keyed by its relative path
            - `inbound-<slug>.md`, `errand-<slug>.md`, a cohort copy, and a paired spec's halves each invert to their
              own kind, never to a companion
            - under `active/current/`, `notes-x-<slug>.md` for a hyphenated slug inverts to the companion `notes-x` by
              the claimed slug
            - given the claimed slug and `flat`, `spec-<slug>-prd.md` at the top of `active/` inverts to that work
              item's paired-spec half, and `notes-x-<slug>.md` to its companion `notes-x`; given `nested`, neither
              inverts to a record
            - a companion key equal to a fixed name, or one an earlier form would claim given as a path, is refused
            - a companion named `cohort-x` is refused, and a new `spec-prd-<slug>.md` is never read as a paired spec's
              half
            - the in-repo implementation refuses a path-keyed companion `unhomed-kind`
            - after `alpha` is renamed to `beta`, a literal `extra-alpha.md` under `beta` inverts to a path-keyed
              companion, persists, and projects back at its path; a true alias, reachable only from a folder not yet
              re-laid after the rename, since a known file writes back under its index reference, comes back as a
              refused edit carrying the backend's remedy, and the same content under a key outside the reserved path,
              written to the ref backend's fixture, persists
            - written to the ref backend's fixture, a root file named `metadata-<uid>.json` is refused with the
              backend's remedy, and the same content as `scratch/metadata-<uid>.json` persists as an ordinary companion,
              the refusal's repaired case
            - the Errand queue has no address and projects nothing

    - `[ ]` **2.4.c Paths callers resolve from the flip**

        - The work-item path is flat today, `workItemArtifactPath(slug, artifact, readPlacement, cohort)`
          (`lib/store/lifecycle-storage.ts`), which `lifecycleArtifactPath` calls. This task gives it the checkout root
          first, keeping the name,
          `workItemArtifactPath(checkoutRoot, slug, artifact, readPlacement, cohort): Promise<string>`, returning a path
          relative to `checkoutRoot`. Backlog and completed placements resolve as today, reading nothing. Where the
          root's store answers `capabilities.stateOffBranch` true, the active arm reads the checkout's claim from its
          marker (`readWorktreeMarker`) and the effective `layout.active` once per root, a forward-compatible key it
          reads from the project's configuration (`ArcConfigSchema`, `lib/config/schema.ts`), `nested` where absent,
          which 2.5 types and validates, kept in the engine's process state (1.9.a), since one process resolves paths
          for sibling checkouts too, and returns the `active/current/` path for the work item the checkout claims — flat
          in `active/` under `flat` — and the `active/in-flight/<slug>/` path for any other, which holds a file only
          where the view selects it (2.6); otherwise it returns today's flat path through the synchronous resolver that
          keeps today's body, reading neither.
        - The capability is cached per root beside the claim: the engine's start records that of the store it is given
          for its root (1.9.a); this task gives the composition a hook recording that of each store it composes, in
          `lazyStore` (`lib/store/create.ts`), so `createStore`, which answers false until the flip, and
          `createRefStore` both record, while `createReadSourceStore`, a read-only view of another remote, records
          nothing; and the engine records it for each worktree it refreshes (`projection-worktrees`). The engine's
          record for a root holds over a composition's, whichever comes later in the command. A root nothing recorded
          resolves as the in-repo implementation lays it, so a script, which runs no root hook, resolves as a command
          does once it composes its store.
        - Every exported writer in `lib/git/worktree-marker.ts` — `writeWorktreeMarker`, `writeWorktreeOwnershipMarker`,
          `stampWorktreeHusk`, the `create`, `replace`, `restore`, and `removeWorktreeMarkerGeneration` family, and
          `removePrimaryTransientOccupancy` — notifies a listener the engine's process state registers, which drops that
          root's entry, so an in-place claim (`LocusPorts.writeAnchoredMarker`, `lib/locus/lifecycle-ports.ts`), a
          promotion (`convertSpawnedMarker`), a release, and a materialization all reach it. The three marker writes
          that bypass the module move onto writers it exports: the marker clear after a release in
          `lib/work-unit/verbs/teardown.ts` and `lib/work-unit/verbs/teardown-store.ts`, each a raw file removal, onto
          an unconditional removal, since `removeWorktreeMarkerGeneration` compares a generation; and
          `restoreSpawnClaim`'s raw exclusive `writeFile` (`lib/work-unit/spawned-worktree-claim.ts`) onto an exclusive
          create from bytes beside `createWorktreeMarkerGeneration`. A worktree move, which changes a checkout's root
          without writing its marker (`git worktree move` in `lib/work-unit/mutators/reconcile-work-unit-worktree.ts`),
          notifies the listener with both roots, so the entry moves to the new root and its claim is read fresh. The
          root hook clears every entry at each command's start, and projection work in a worktree reads that worktree's
          claim fresh under its projection lock and reseeds the entry (`projection-worktrees`), so no file is laid from
          a cached claim.
        - This task updates each caller to pass its checkout root: the compaction seed's emitter (`emitCompactionSeed`,
          `lib/compaction-seed/emitter.ts`) and recovery's relocation, the current work unit's path (`candidatePath`,
          `lib/store/current-work-unit.ts`), the session-notes resolver (`resolveSessionNotesPath`,
          `lib/handoff/session-notes-path.ts`) and its readers, the load-set projection's callers, and session-init's
          slot paths. The current work unit already resolves from the marker and the store (`resolveCurrentWorkUnit`,
          `lib/store/current-work-unit.ts`). The held-candidates reader, which builds the active meta path itself
          through `resolveArcPath` (`readHeldCandidates`, `lib/active/meta-reader.ts`), resolves through the path
          function instead. `arc view`'s callers, synchronous today (`handlers/view-store.ts`, the lifecycle view, its
          design reads, and reconciliation), convert with the rest: 14 calls of the work-item path in 12 files and 43 of
          the lifecycle path functions in 33 files, `archive-store.ts` among them, which the compiler finds. `arc view`
          resolves a design selector's path through `lifecycleRecordPath` and matches a design name through
          `workUnitArtifactName` (`lib/store/lifecycle-write.ts`) and `companionStoredName`
          (`lib/store/companion-name.ts`) in `readLifecycleDesign` (`lib/store/lifecycle-design.ts`), so the file names
          keep today's slug forms under both `active/` folders. The evidence's cohort document path goes through
          `cohortDocumentPath` (`lib/store/lifecycle-record-path.ts`), which takes no checkout root, since a cohort
          document's home is under `backlog/` or `completed/` in every checkout.
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
          `lifecycleArtifactPath` (`snapshotFs`), which also calls it, keeps the flat active path through the
          synchronous flat resolver: it builds the in-memory tree the integration compositions' lifecycle summary walks
          only over the in-repo implementation, since over an off-branch store the checkpoint and merge compositions
          read the stored summary instead (`readStoredLifecycleSummary`, `scripts/integration/lifecycle-record.ts`).
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
              next resolution, through each marker writer, the two teardown clears and the spawn claim's restore among
              them
            - after a worktree move mid-command, the moved checkout's own meta path resolves under its new root's
              `active/current/`
            - from the flip, the held-candidates reader reads the checkout's own meta from `active/current/`
            - a store `createRefStore` composes records its capability for its root
            - a root nothing recorded resolves as the in-repo implementation lays it, and the same root resolves under
              `active/current/` once the engine's start runs over an off-branch store for it, while `createStore`'s
              composition records it false
            - a cohort document's path is its home under `backlog/` or `completed/`, whatever checkout asks
            - over the in-repo implementation, the path is today's `.arc/active/meta-<slug>.md`, and no marker or
              configuration is read

### `[ ]` **2.5 The `layout.active` revert key — § 10.3**

- _Goal:_ A project can set `layout.active: flat` in `arc-config.yml` to lay its checkout's work item flat in `active/`,
  leaving everything else unchanged, and a change takes effect at each checkout's next command.

    - An enum field in the configuration schema (`lib/config/schema.ts`), `nested` by default, in the file's flat dotted
      key form; `arc config validate` lists it (`VALIDATION_DOMAIN_ORDER`, `commands/config/validate.ts`), the schema
      test's key list gains it, and both copies of `arc-config.yml` document it.
    - The reader 2.4.c builds reads it typed and passes it to the checkout's own location (2.4.a); the index records the
      effective value (`ProjectionIndexSchema`, `lib/store/projection/index-schema.ts`), and a command reading a
      different one reprojects `current/` (`projection-worktrees`).
    - Build `test-first` (one behavior at a time):
        - with no key, the value is `nested`
        - an unknown value is refused by `arc config validate`

### `[ ]` **2.6 The in-flight view setting — § 10.4**

- _Goal:_ A person chooses which other in-flight work items project — `mine` by default, `cohort`, or `all`, plus pinned
  slugs — through personal `git config` keys read in the projection's one configuration read.

    - `arc.inflightView`, one value, and `arc.inflightPin`, one entry per pinned slug, set with `git config --local` and
      read by the configuration read (`readProjectionConfiguration`, `lib/store/projection/configuration.ts`), which
      reports them lowercased (`arc.inflightview`, `arc.inflightpin`), the last `arc.inflightView` winning and every
      `arc.inflightPin` counting. An unknown value reads as `mine`, and a pin naming no in-flight work item selects
      nothing; `arc status` names each.
    - The selection lists in-flight work items from the store with no owner filter: the identity's own for `mine`, the
      other members of the checkout's work unit's cohort for `cohort`, every one for `all`, plus the pins; the
      checkout's own work item is never among them.
    - The index records the effective setting, pins included, with the identity and checkout claim; reprojection on a
      change is `projection-worktrees`'.
    - Build `test-first` (one behavior at a time):
        - with no key set, the view is `mine`
        - `cohort` selects the cohort's other members, and a pin adds a work item outside it
        - `all` selects another person's in-flight work unit
        - the checkout's own work item never appears in the selection
        - an unknown value reads as `mine`, and `arc status` names it
        - `arc save --resolve` on a conflict whose subject projects in no file here refuses naming where it projects or
          its owner, and resolves once the subject's file and its conflict mapping are seeded here (`seedProjection`,
          extended as 1.9's note says)

### `[ ]` **2.7 Project a paused work unit as any in-flight one — § 8.3**

- _Goal:_ A paused work unit projects where any in-flight one does, under the same rights, its protected files' notice
  naming its owning checkout here or, with none, `arc materialize <slug>`.

    - From the flip a pause is a section of the meta that changes neither `State` nor placement, so nothing in the
      layout reads it; the notice follows 2.2, since `arc resume` only clears the pause.
    - Build `test-first` (one behavior at a time):
        - a paused work unit's files resolve under `active/in-flight/<slug>/` with the in-flight view, laid there
          through the seeded projection (`seedProjection`)
        - with its checkout released, its protected file's notice names `arc materialize <slug>`

### `[ ]` **2.8 Adopt files the store does not know — § 9**

- _Goal:_ A new file is adopted by the folder it appears in, through the one layout classifier, or refused naming where
  it belongs; a new `backlog/` folder with a parseable meta becomes a stub owned by the adopting identity; and editor
  and system side files and derived views are never adopted.

    - `[ ]` **2.8.a Classify by folder**

        - The classifier (`identifyArcFileAddress` then `classifyStoreAddress`, over 2.4's addresses) maps a path to a
          kind and key: `active/current/` and a stub's folder adopt into that work item; `active/in-flight/<slug>/`
          takes the owner's prose only (2.1); `completed/` adopts into its archived work unit (2.3); a path it maps to
          no record — the top of `active/` or `backlog/`, the identity root outside `scratch/`, a commitment or quarter
          folder — refuses at persist, naming `current/`, `scratch/`, or a work item's folder. Under
          `layout.active: flat` the top of `active/` is the checkout's own work item's folder, and adopts into it.
        - Build `test-first` (one behavior at a time):
            - a new file in `active/current/` adopts into the checkout's work item
            - a new file at the top of `active/` refuses naming `current/` and adopts once moved there, and under `flat`
              adopts into the checkout's work item
            - a new file in a stub's folder, found by the start's walk, adopts into that stub
            - another person's new prose in `active/in-flight/<slug>/` is refused, and the same prose made by its owner
              adopts
            - over the ref backend's fixture, a new file at `review/notes.md` in a work item's folder is a refused edit
              carrying the backend's remedy, and adopts once moved outside the reserved path, as the remedy directs

    - `[ ]` **2.8.b A new stub**

        - A new folder under `backlog/` holding a meta that parses and names no `Owner` but the adopting identity mints
          through `arc stub`'s path (`runStub`, `lib/work-unit/verbs/stub.ts`), with the meta rendered by
          `renderMetaFile` (`lib/store/kinds/meta/projection.ts`): the commitment tier and any cohort from the path;
          priority, origin, design, and `Class` from the meta as `arc stub`'s own parameters, `Class` validated as
          `--class` is but for `[TBD]`, which `arc stub` writes where no `--class` is passed and which enters as an
          omitted `--class`, so a provisional folder adopts and a planned one is refused as
          `arc stub --commitment planned` with no `--class` is; owned by the adopting identity. The rest of the file is
          then a hand edit of the minted record: write-back first sets the file's verb-owned fields — State, Class,
          Current Workflow, Owner, and the pause section, the set `checkMetaVerbOwnedField` guards
          (`lib/store/kinds/meta/authority-rules.ts`) — to the minted record's, then sends it against the minted
          version, checked like any other.
        - The engine mints through a port, bound by the root hook over the engine's store with the executor `handleStub`
          (`handlers/lifecycle.ts`) builds, since `runStub` takes its executor from the handler layer. A refusal from
          `runStub` leaves the folder ownerless and is reported with the verb's remedy; the minted stub fans out once
          the lock is released (`projection-worktrees`).
        - `arc stub`'s checks of its parameters are split today: the command's input schema parses the commitment,
          priority, cohort path, and `Class` (`StubCommandInputSchema`, `handlers/lifecycle.ts`), and `runStub` checks
          the name and refuses a missing commitment or priority, an explicit `Class` that does not resolve or a
          `planned` commitment with none (`resolveStubClass`), and a cohort without `planned` or with an unsafe or
          malformed path. Both move behind one pure function, the schema's parse then `runStub`'s refusals, which
          `runStub` and the removal check (`projection-worktrees`) call, so the check reads adoption's verdict without
          minting; a refusal only the executor returns reaches the persist step, which refuses with the verb's remedy.
        - A meta naming another identity as `Owner` is not adopted; its remedy has the person name themselves, adopt it,
          then run `arc handover <slug> --to <identity>`. A folder with no meta that parses leaves its files ownerless,
          flagged in `arc status` and refused over by the removal check (`projection-worktrees`), with the remedy
          `arc stub <name> --commitment <tier> --priority <priority>`, the tier filled in, and `--cohort <cohort>` where
          the folder's path carries a cohort, so the stub lands where its files are.
        - Build `test-first` (one behavior at a time):
            - a new folder with a meta naming no owner mints a stub owned by the adopter, its tier from the path
            - a folder under `backlog/provisional/` whose meta's `Class` is `[TBD]`, as `arc stub` writes it, mints a
              provisional stub
            - the adopted meta's own prose and soft fields persist after minting, and the verb-owned field check passes
            - a meta naming another owner is left unadopted with the handover remedy, and adopts once the person names
              themselves its owner
            - a meta whose `Class` `--class` would refuse leaves the folder ownerless with the verb's remedy, and adopts
              once the `Class` is corrected
            - the verdict read without minting refuses that meta too, and writes nothing
            - a folder under `backlog/planned/` whose meta's `Class` is `[TBD]` leaves the folder ownerless with the
              verb's remedy, the verdict read without minting refuses it too, and it adopts once the `Class` is resolved
            - a folder with no parseable meta reports ownerless files with the `arc stub` remedy, and adopts once the
              stub exists
            - under a cohort folder, the ownerless remedy names `--cohort` with the folder's cohort, and the stub it
              mints adopts the files
            - the verdict refuses a meta whose priority `StubCommandInputSchema` rejects, as `arc stub` would

    - `[ ]` **2.8.c Never adopted**

        - Matched on the file name before any other test: editor side files (`*~`, `.#*`, `#*#`, `.*.sw?`, `4913`,
          `*.tmp.<pid>.<hex>`) and operating-system folder files (`.DS_Store`, `._*`, `Thumbs.db`, `desktop.ini`,
          `.directory`). Then by path: the two files a projected root can hold from before the flip, since no derived
          view renders as a file from it — `STATUS.USER.md` in an identity's personal root, which nothing deletes but
          teardown's user-surface migration, which discards a linked worktree's copy as a generated cache
          (`DISCARDABLE_GENERATED_CACHES`, `lib/user-surface-migration.ts`), and the tracked `ROADMAP.md` on a branch
          that has not merged the cutover, at the layout's `project-document` address (`lib/layout/schema.ts`), which
          stays past the cutover — named directly rather than read from `DERIVED_VIEWS`, which leaves in
          `storage-cutover`'s deletion pass; and any path `MACHINE_LOCAL_PATHS` lists, whose folders write-back's walk
          skips. A symbolic link, past the name match, is never followed, read, or adopted: one at a path the index
          lists reads as a deleted file (`gateRead`), and any other in a projected root is never adopted, as the files
          above are, but is reported, each naming the remedy of replacing it with a regular file. The removal check and
          the persist and release steps never refuse over one (`projection-worktrees`), since the record lives in the
          store and the link's target outside the projection.
        - Build `test-first` (one behavior at a time):
            - Emacs's `.#name.md` lock, a dangling symlink ending in `.md`, is ignored by name
            - a Vim swap file and a Claude Code temp file in `active/current/` are ignored
            - a leftover `ROADMAP.md` and a leftover `STATUS.USER.md` are each neither adopted nor refused, and the
              second stays on disk
            - files under an identity's `.internal/` are never walked
            - a symbolic link in `active/current/` is never adopted but is reported, and its target is never read

### `[ ]` **2.9 The skip switch — § 2.3**

- _Goal:_ Every `arc` command accepts `--skip-projection`, running that one command with no write-back, no refresh, no
  end, and no fan-out of its writes, its edits left pending — while the removal check and the persist and release steps
  run under it as without it.

    - A program-level option in `cli.ts`, never a mode. The root `preAction` hook reads it and sets it on the engine's
      module state, which the hooks (1.9.b), the fan-out (`projection-worktrees`), and `arc sync`'s rebuild
      (`projection-worktrees`) read, since the store `createStore` builds sees no argv. Under it a command fans out none
      of its writes, the persist and release steps' included; each sibling's next command refreshes (§ 2.2). `arc save`
      refuses it, naming the switch, since its start is its whole work; this task adds that refusal to 1.10's handler.
    - Build `test-first` (one behavior at a time):
        - Integration tier, through the engine's entry points over the reference backend
        - a command run under the switch leaves a pending edit unsent, and the next command sends it
        - `arc save --skip-projection` refuses naming the switch, and `arc save` alone runs
        - E2E tier, through the CLI over the in-repo implementation: every command accepts `--skip-projection`

### `[ ]` **2.10 Editor settings — § 11.4**

- _Goal:_ `arc editor <vscode|zed>` merges only ARC's keys into the checkout's editor settings, keeping comments and
  other keys, `--remove` takes them out, and `arc init` and `arc join` print the one user-level Zed setting — each
  refusing or printing nothing before the flip.

    - A new command in `cli.ts`, in `HELP_GROUPS` (`lib/cli-help-content.ts`), `COMMAND_SUMMARIES`
      (`lib/cli-help-summaries.ts`), and the command-input declarations, with a handler that takes the command's store,
      editing through `jsonc-parser`'s `modify` and `applyEdits`. The CLI's bundle holds no `jsonc-parser` today: the
      Markdown lint configuration that imports it (`lib/markdown/configuration.ts`) serves the repository's scripts, and
      only the root `package.json` declares it, so the package's own `devDependencies` gain it and the build bundles it.
    - VS Code: `files.readonlyFromPermissions: true` in `.vscode/settings.json`. Zed: `file_scan_inclusions` in
      `.zed/settings.json`, `"..."` first, then a glob for each projected root built from the pattern that ignores it
      (`projectedRootPatterns`, `lib/layout/projected-roots.ts`), so no identity is named: `.arc/active/**`,
      `.arc/backlog/**`, `.arc/completed/**`, and `.arc/user/*/**`. A missing file is created holding ARC's keys alone;
      an existing list gains only the globs it lacks. `--remove` takes out ARC's globs, and the key where only `"..."`
      remains, and the VS Code key where its value is ARC's; on a missing file it changes nothing. A file that does not
      parse is refused naming the parse error, left untouched.
    - `arc init` and `arc join` print the same `file_scan_inclusions` list for Zed's user settings, keeping no record,
      since ARC writes nothing per machine and each verb runs once per person per clone. `runPostInitSetup`
      (`lib/setup.ts`), which both call and which prints nothing, returns the capability it reads from the prepared
      personal setup — `preparePersonalIdentitySetup` (`lib/personal-identity-setup.ts`) opens the store bound to the
      identity being set up and returns null unless state is off-branch, so a non-null prepared setup is the capability
      — and `arc init`'s and `arc join`'s results carry the line, which their output prints. Before the flip
      `arc editor` refuses `unsupported` and neither verb prints it.
    - Build `test-first` (one behavior at a time):
        - Unit tier, over the settings editor
        - a settings file with comments and other keys gains only ARC's key, comments kept
        - `--remove` takes ARC's keys out and leaves the rest byte-identical
        - Zed's list keeps `"..."` first and gains only the globs it lacks, the personal root's naming no identity
        - a missing file is created with ARC's keys, and an unparseable one is refused untouched and gains ARC's keys
          once it parses
        - Integration tier, through the handler over the reference backend: `arc editor zed` writes the checkout's file
        - with the store reporting off-branch state, the line `arc init` and `arc join` print holds the list
          `arc editor zed` writes
        - E2E tier, through the CLI over the in-repo implementation: `arc editor` refuses `unsupported`, and neither
          `arc init` nor `arc join` prints the Zed setting

### `[ ]` **2.11 The selection of editable Markdown files — § 11.7**

- _Goal:_ `arc selection` prints the projected Markdown files this checkout may edit, taken after its start has taken
  pending edits in, and `--changed` the part this checkout changed since its last `arc save`, refusing wherever that
  take-in could not run; over the in-repo implementation it prints an empty list.

    - `[ ]` **2.11.a The changed mark**

        - The index's changed mark (`RecordEntry`, `lib/store/projection/index-schema.ts`) is set by write-back whenever
          it finds an edit in a file, whatever comes of it — landed, refused, skipped for failing to parse (1.1.a), or
          left pending — on the checkout whose file holds the edit, whichever process takes it in, so a sibling's
          refresh that takes it in through the replace guard (`guardReplacement`) and a persist step
          (`projection-worktrees`) mark the holding checkout. A verb's write marks its own checkout through the
          fan-out's refresh of it, which `projection-worktrees`' fan-out adds, so until then `--changed` holds hand
          edits alone; a refresh that only rewrites a file never sets it.
        - `arc save`'s handler (1.10), under the projection lock, clears the mark on every file but one still holding an
          edit the store lacks — refused, failing to parse, pending, withheld (`projection-worktrees`), or held for a
          resolution (1.4.b) — after its own write-back, so a verb write racing it can only over-include.
        - Build `test-first` (one behavior at a time):
            - Integration tier, over the reference backend
            - a landed edit, a refused edit, an unparseable edit, and a pending edit each set the mark
            - `arc save` clears the mark on a landed file and keeps it on a refused one
            - an edit taken in through the replace guard (`guardReplacement`), driven directly as a sibling's refresh
              would drive it, marks the holding checkout, not the sibling

    - `[ ]` **2.11.b The command**

        - A new command in `cli.ts`, `arc selection [--changed] [--json]`, in `HELP_GROUPS` (`lib/cli-help-content.ts`),
          `COMMAND_SUMMARIES` (`lib/cli-help-summaries.ts`), and the command-input declarations, whose name is the check
          mode's, `selection` (`spec-projected-markdown-checks.md` § 4.1). After the command's start (1.9.a), it reads
          the index: the projected Markdown files this checkout may edit (2.1), leaving out `completed/`, protected
          files (2.2), files holding conflict markers, and the personal root's `.internal/` and `scratch/`; under
          `--changed`, only those carrying the changed mark. It prints one repository-relative path per line, or
          `{ paths }` under `--json`.
        - Its answer is only as current as the start's take-in, so, as `arc save` does (1.10), it refuses where the
          start cannot take its lock, naming the holder and a retry, loses its lease, or finds the worktree's Git
          directory gone, each with a retry (`withProjectionLock`); refuses with no identity
          (`readProjectionConfiguration`), naming the remedy that sets `arc.identity`; and refuses `--skip-projection`
          (2.9). Over the in-repo implementation, whose start takes no lock and reads no identity, it prints an empty
          list, or `{ "paths": [] }`, refusing only `--skip-projection`.
        - Build `test-first` (one behavior at a time):
            - Integration tier, through the handler over the reference backend
            - the selection lists the checkout's own and owned in-flight Markdown files and leaves out `completed/`, a
              protected file, a conflicted file, and the personal `.internal/` and `scratch/`
            - a new file is listed once the start adopts it
            - `--changed` lists only marked files, and `--json` prints the same paths as `{ paths }`
            - a lock held past its bound refuses naming the holder, and the retry prints the selection
            - a lease lost while it runs refuses with a retry, and the retry prints the selection
            - a worktree whose Git directory is gone refuses naming it, and the retry prints the selection once it is
              restored
            - with no identity it refuses naming the remedy, and prints the selection once `arc.identity` is set
            - E2E tier, through the CLI over the in-repo implementation: `arc selection` and `arc selection --changed`
              print an empty list, `--skip-projection` refuses, and the help inventory lists `selection`

### `[ ]` **2.12 Connect the Markdown checks' reader — § 11.7**

- _Goal:_ The `selection` checks, `lint:md:fix`, and `lint:md:fix:file` read what `arc selection` prints for the same
  checkout and `--changed` flag, through the one reader `projected-markdown-checks` added, and report a failure to read
  it as `couldn't run` rather than as an empty selection.

    - Replace the body of `readProjectedSelection(root, { changed })` (`lib/checks/projected-selection.ts`), as
      `spec-projected-markdown-checks.md` § 4.6 states: where the engine's process state holds a completed start for
      `root` (1.9.a), it reads the selection from the index as 2.11.b does; inside a command whose start found the store
      answering the capability false, it returns an empty list and runs no subprocess; inside one whose start did not
      complete — under the skip switch, with no identity, or after a start that could not take its lock, lost its lease,
      or found the Git directory gone — it returns `unavailable` with the reason `arc selection` would refuse with;
      otherwise, from a script, which runs no `arc` start, it reads the capability of the store a command builds
      (`createStore`, `lib/store/create.ts`), constructing no backend: answering false, the in-repo implementation's, it
      returns an empty list and runs no subprocess, as `arc selection` prints there; answering true, it runs
      `arc selection --json`, with `--changed` where asked, through `npx arc`, the one script reading it being this
      repository's `lint:md:fix` (`src/scripts/fix-markdown.ts`). Every failure, the command's refusal and a stale
      build's among them, maps to `unavailable` with its reason.
    - `__tests__/unit/handlers/check/run.test.ts` pins the empty body; its assertion becomes the connected reader's,
      while the subprocess CLI tests that run over the in-repo implementation, the Markdown fix's end-to-end test among
      them (`__tests__/e2e/markdown-fix.e2e.test.ts`), keep their empty selection, the reader running no subprocess
      there.
    - Build `test-first` (one behavior at a time):
        - Unit tier, over the reader with an injected command runner
        - inside a command whose start ran, the reader returns the index's selection and runs no subprocess
        - inside a command over the in-repo implementation, the reader returns an empty list and runs no subprocess
        - from a script over the in-repo implementation, it returns an empty list and runs no subprocess
        - from a script over a store answering the capability true, it returns the command's `{ paths }`, and a refusal
          maps to `unavailable` with its reason
        - under the skip switch, and after a start whose lock wait timed out, it returns `unavailable` with the reason
          `arc selection` would refuse with
        - Integration tier, over the reference backend: a `selection` check over a conflicted file leaves it out, and
          over a changed file with `--changed` includes it

## **Phase 3:** Verification

### `[ ]` **3.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Over the reference backend with real repositories and worktrees, on Linux and in a dispatched run of the
  portability pair, a hand edit saved in place, by renaming a new file over it, or by an agent's write reaches the
  store at the next `arc` command, but for the residuals the spec's § 17 names.

- `[ ]` A clash with a stored base lands as a conflict record that the writing checkout's read-back draws in — markers
  where placement's check passes and no set the file already shows overlaps its span, escalated with the resolve-by-hand
  line where the file holds a marker-like line, a notice line where the check fails, where such a set overlaps it, or
  where the conflict is whole-record, status and the refusing verbs alone for a stampless file, and write-back's report
  and status for a file held whole for a malformed set or a resolution in progress until it is released, then the file —
  and resolves by hand-edited markers or `arc save --resolve`, keeping the store's side included, which refuses while
  its file is held; untouched markers keep it open, malformed ones refuse, and a clash with no stored base stays in its
  file and persists once resolved.

- `[ ]` Write-back and `arc save` send each edit through its kind's parser against its base's record version, under
  `write-back` or `save`; a verb-owned field change is refused and kept in its file; one refused edit blocks no other;
  each store refusal takes its path; and the `after` view's conformance case passes over each backend that runs checks.

- `[ ]` An edit to a protected or another person's archived file, an unadopted file, a file that fails to parse, a
  refused edit, a file held by a conflict, a clash found in the checkout included, a file other than Markdown whose
  candidate bases disagree, drawn into once and held until they agree or `arc save --resolve` sends it, and a file not
  yet settled each stay in their file and are reported, as an aside copy kept because its path moved on stays in the
  aside folder, reported with its path.

- `[ ]` Every projected path resolves through `resolveArcPath` and back through the classifier, under
  `layout.active: flat` as under `nested`; and every work-item path a caller reports, resolved from its checkout root,
  names the path the spec's § 10.1 lays its file at.

- `[ ]` `arc selection` prints the projected Markdown files the checkout may edit, leaving out `completed/`, protected
  files, files holding conflict markers, and the personal `.internal/` and `scratch/`; `--changed` prints those the
  checkout changed by hand since its last `arc save` under the spec's § 11.7 rules; and the Markdown checks' reader
  returns what the command prints.

- `[ ]` Over the in-repo implementation the root hooks do nothing, `arc save` and `arc editor` refuse `unsupported`,
  `arc selection` prints an empty list, and `arc init` and `arc join` print no Zed setting.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
