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

### `[x]` **1.9 Write back at every command's start, and report it — § 2.2, § 1.4**

- _Goal:_ Every `arc` command starts by writing back pending edits under its worktree's projection lock and ends with
  the second check, reporting each refused, skipped, deferred, withheld, or conflicted file on stderr ahead of its own
  output — and over the in-repo implementation the hooks return at once.

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

    - `[x]` **1.9.c What `arc status` reports**

        - Composite status exposes a read-only projection probe in JSON and its human summary, covering refused,
          pending, withheld and ownerless files, unseen conflicts, and retained aside copies with original paths.
          Probe failures leave healthy sections available; disabled backends resolve no projection dependencies.

### `[x]` **1.10 `arc save` and its `--resolve` — § 2.4, § 6.5**

- _Goal:_ `arc save` writes back every pending edit in every projected root, `completed/` included, under `save`, and
  returns the state version; `--resolve <conflict>` resolves a conflict shown without markers, and a held file other
  than Markdown by the token its index entry names, refusing every case it cannot; and before the flip it refuses
  `unsupported` naming `arc user save`.

- _Outcome:_ The registered save action consumes its start's Store and final version, with whole JSON refusals.
  Resolution intent binds exact indexed subjects before the sweep, rechecks afterward, and sends unchanged files
  when needed. Acceptance is recorded at the store write and survives later read-back failure; current-base holds
  preserve their recorded tokens until accepted. Marker, whole-record and lookup refusals carry their repair routes,
  and decomposition's source-conflict remedy names the registered resolution command.

### `[x]` **1.11 A hand edit persists through write-back** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds end to end on a freshly merged base.

- _Outcome:_ One reference-store checkout carries command-start write-back, a stale conflict, marker resolution, and
  a refused edit through repair via the registered CLI. In-repo hooks stay dark and save names `arc user save`.
  Windows/macOS portability qualified at `c3cbda01b7` in run `42060487448`.

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

### `[x]` **2.1 Edit rights by lifecycle state and kind of record — § 8.1**

- _Goal:_ Write-back decides who may edit a file by its record's lifecycle state and kind, never by the folder it
  projects to: stubs by anyone; an in-flight work unit's prose by its owner from any checkout, and its meta and task
  list only from the owning checkout; an Errand's description and a work item's inbound list by its owner from any
  checkout; cohort documents, live or archived, and the project inbox by anyone; personal records by their identity
  alone; archived work by its owner (2.3); and nothing of another person's work items, their inbound lists included,
  where routing inserts arrive through the routing verb.
- _Outcome:_ Record-based rights now gate command-start and take-in against the file-holding checkout's exact claim.
  Refused edits remain pending, report their path or aside copy, and keep explicit resolution intent and hold tokens.
  Repairing ownership permits retry; archived work retains its owner's correction rights.

### `[x]` **2.2 Protect a file in three layers — § 8.2**

- _Goal:_ A file the reader may not edit says so where it is read, is read-only on disk, and refuses at persist naming
  where on this machine the edit can be made — the refusal keyed on the content change, never the mode.

- _Outcome:_ Winning replacements publish the protection bit, native read-only mode, and a notice naming where to
  edit; stampless files carry mode and refusal alone. Persist rechecks native holders and recovery exits; yielded
  swaps keep their original protection and bases. Windows/macOS qualified at `e3d2c509d8` in run `42102353178`
  (attempt 2).

### `[x]` **2.3 Edit archived work in place — § 8.4**

- _Goal:_ The archived work unit's owner corrects its files in `completed/` from any checkout, meta and task list
  included, as a write in place that keeps its archive number; anyone else's archived work is read-only; and a missing
  history ref is pulled by name and retried once only where the network may be waited on.

- _Outcome:_ Save binds its history memo over named-ref retry and reports pull notices before command output. Owner
  corrections keep their archive placement; refused pulls and retried operations preserve the edit and selected remedy.
  Ordinary commands stay offline and name `arc save`, including rights checks and interrupted stampless replacements.

### `[x]` **2.4 Register the `active/` locations and the projected file names as layout addresses — § 10.1, § 10.2, § 9**

- _Goal:_ Every path the projection writes resolves through `resolveArcPath` and inverts back through the classifier
  to one record: `active/current/` for the checkout's own work item and its cohort copies, `active/in-flight/<slug>/`
  for the other work items its view selects, and every file name the projection defines.

    - `[x]` **2.4.a The two locations**

        - Active addresses resolve and invert the checkout's own claim under `current/` or its configured flat layout,
          and another work item under `in-flight/<slug>/`, preserving the legacy and contributor flat forms. Cohort
          copies classify to their canonical record. The Errand overlap reader passes the shared checkout claim and
          layout, preserving a hyphenated own companion's identity when another slug shares its suffix.

    - `[x]` **2.4.b The file names**

        - Companion, paired-spec, inbound, Errand-description, cohort-copy, and scratch addresses round-trip through
          the layout and classifier. Backend alias, metadata-path, and role refusals retain their remedies and authored
          bytes; safe repaired keys adopt, while exact indexed authority survives renamed or ambiguous surroundings.

    - `[x]` **2.4.c Paths callers resolve from the flip**

        - Checkout-rooted async artifact and lifecycle paths share capability, claim, and layout coordinates across
          command reports, views, reconciliation, session context, compaction, and recovery. Pure manifests consume
          resolved placement; the in-repo snapshot retains its synchronous flat tree, and cohort homes stay canonical.
        - Store composition records per-root capability, command-engine overrides retain precedence, and marker
          writes, teardown clears, rollback restores, worktree moves, and successful checkout occupation invalidate or
          bind the shared context. Projection entry refreshes it under its lease; delayed reads cannot replace a newer
          observation. Invalid or unreadable markers and configuration refuse with repair and retry.
        - Reporting paths validate before committing a transition; staged Errand promotion resolves its final path
          after marker settlement and retains the existing retry boundary. Graduation reports against the occupied
          checkout root. An Errand seed inherits its healthy parent's exact
          meta path and identity without interpreting those paths through the Errand's claim; an unhealthy parent
          supplies no inherited identity.

### `[x]` **2.4.R Establish folder ownership before classifying new backlog files — § 9, § 10.1**

- _Goal:_ Under A1, a new backlog file is classified only within one established work-item container; absent or
  conflicting ownership preserves it unadopted with a repair route, while indexed files keep their exact references.

    - `[x]` **2.4.R.a Classify relative to an explicit container**

        - The pure inverse takes an established `work-unit-container`, confirms a strict descendant through
          `resolveArcPath`, and interprets its relative filename by that container's slug. The nested counterexample
          resolves to either owner only when supplied that owner's container; absent or unrelated context guesses none.

    - `[x]` **2.4.R.b Establish and bind container evidence for unindexed paths**

        - Shared ownership resolution binds indexed/stored primaries or a validated stub's exact creation before
          companion classification. Pending receipts remain authority without a public-name binding; absent and
          conflicting evidence preserves files with repair guidance, and indexed references remain authoritative.

    - `[x]` **2.4.R.c Verify the ownership boundary and repaired continuation**

        - Native engine entry distinguishes both owners of the nested counterexample, preserves missing/conflicting
          ownership and exact indexed authority, and adopts the same bytes after repair. The registered CLI's stub-mint
          cases bind prospective owners through the actual command Store, completing A1's bounded evidence.

### `[x]` **2.5 The `layout.active` revert key — § 10.3**

- _Goal:_ A project can set `layout.active: flat` in `arc-config.yml` to lay its checkout's work item flat in `active/`,
  leaving everything else unchanged, and a change takes effect at each checkout's next command.

- _Outcome:_ The shared configuration catalog and validator register `nested` and `flat`, defaulting to `nested`;
  both configuration copies document the key. The checkout reader consumes its validated domain and resolves flat
  paths after an invalid value is repaired. The index retains its typed layout field for reprojection.

### `[x]` **2.6 The in-flight view setting — § 10.4**

- _Goal:_ A person chooses which other in-flight work items project — `mine` by default, `cohort`, or `all`, plus pinned
  slugs — through personal `git config` keys read in the projection's one configuration read.

- _Outcome:_ One command observation retains the last view value and every pin; active work units and ordinary Errands
  select by identity, exact cohort, or all, with pins added before exact-own exclusion. Explicit status reports unknown
  values and missing pins through the selected store, preserving incomplete-inventory and claim diagnostics and their
  repair routes. Ordinary entry adds no inventory listing, and observing settings preserves the index's last-projected
  inputs for reprojection. An unprojected conflict names its exact owner and resolves after its mapping is seeded.

### `[x]` **2.7 Project a paused work unit as any in-flight one — § 8.3**

- _Goal:_ A paused work unit projects where any in-flight one does, under the same rights, its protected files' notice
  naming its owning checkout here or, with none, `arc materialize <slug>`.

- _Outcome:_ A seeded paused record remains selected at its active in-flight address, with its Pause and placement
  intact. Its protected metadata names the holding checkout, then materialization after release; a forced edit stays
  unsent outside the owner and persists in the repaired holder without clearing the pause.

### `[x]` **2.8 Adopt files the store does not know — § 9**

- _Goal:_ A new file is adopted by the folder it appears in, through the one layout classifier, or refused naming where
  it belongs; a new `backlog/` folder with a parseable meta becomes a stub owned by the adopting identity; and editor
  and system side files and derived views are never adopted.

    - `[x]` **2.8.a Classify by folder**

        - New and existing files bind established folder, claim, identity, or archive authority before ordinary
          hand-edit checks. Accepted creations retain their exact basis through read-back repair without resending;
          cohort admission retains existing generations, and misplaced or refused files adopt after their repair.

    - `[x]` **2.8.b A new stub**

        - Shared pure validation precedes ordinary executor minting through the command's Store. Published receipts
          bind metadata before companions and survive read/write refusals, missing files, and links. Initial lifecycle
          normalization uses the creation version; guarded read-back preserves prose and executor remedies stay intact.

    - `[x]` **2.8.c Never adopted**

        - Discovery excludes side files before stat and leaves legacy views and private folders untouched. Link
          boundaries cover retries, resolution, sweep destinations, and freshly observed command-end targets. Obsolete
          physical blockers clear while exact records, accepted read-back continuations, and saved copies survive;
          regular-file or directory repair resumes ordinary recovery without resending accepted writes.

### `[x]` **2.8.R Require existing cohort authority for file adoption — § 9**

- _Goal:_ Under A2, a dropped cohort document creates no cohort; adoption preserves the file until existing live or
  exact archived authority is established, then takes in the same edit without changing ordinary fixed-record creation.

    - `[x]` **2.8.R.a Admit live cohort files only into established generations**

        - Missing live authority names the existing-cohort rule and its repair; authority lost before attachment
          forwards the actual Store refusal rather than attempting creation. Both native cases preserve authored bytes
          and take in the same edit once authority is restored.

    - `[x]` **2.8.R.b Retain copy, archive, and fixed-record authority**

        - Native adoption retains current-copy membership and exact archived coordinates despite a live namesake.
          A missing fixed personal record creates with its authored content and settled binding; project-inbox identity
          repair resumes the same file in the established project namespace.

    - `[x]` **2.8.R.c Verify cohort admission and repaired continuation**

        - The native cohort-policy and existing/location adoption suites cover A2's missing and disappearing authority,
          successful repair, exact archived generation, current-copy membership, and personal/project creation. Earlier
          criteria retain their terminal-verification status.

### `[x]` **2.9 The skip switch — § 2.3**

- _Goal:_ Every `arc` command accepts `--skip-projection`, running that one command with no write-back, no refresh, no
  end, and no fan-out of its writes, its edits left pending — while the removal check and the persist and release steps
  run under it as without it.

- _Outcome:_ The global option binds a command-scoped skip before projection I/O, suppresses automatic end settlement,
  and leaves action execution intact. The next ordinary start sends the same pending edit. Root and nested commands
  inherit the option; save names the switch before backend support, while plain in-repo save retains its personal-save
  remedy. Explicit persist and removal paths gain no bypass, and the shared skip remains available to refresh and fan-out.

### `[x]` **2.10 Editor settings — § 11.4**

- _Goal:_ `arc editor <vscode|zed>` merges only ARC's keys into the checkout's editor settings, keeping comments and
  other keys, `--remove` takes them out, and `arc init` and `arc join` print the one user-level Zed setting — each
  refusing or printing nothing before the flip.

- _Outcome:_ Added opt-in VS Code and Zed settings through the command's selected Store and checkout root, including
  invocation from a subdirectory. JSONC edits retain comments and unrelated values, reject malformed settings with a
  repair and retry, and remove only ARC's values. Zed inclusions derive from the shared root patterns; init and join
  carry the same user-setting guidance from prepared personal setup, while the in-repo backend remains dark.

### `[x]` **2.11 The selection of editable Markdown files — § 11.7**

- _Goal:_ `arc selection` prints the projected Markdown files this checkout may edit, taken after its start has taken
  pending edits in, and `--changed` the part this checkout changed since its last `arc save`, refusing wherever that
  take-in could not run; over the in-repo implementation it prints an empty list.

    - `[x]` **2.11.a The changed mark**

        - Proved file and aside edits mark their holding entry before rights, parsing, history, or Store refusals,
          including late command-end saves. Unchanged retries and projection-only refreshes keep existing marks.
          Save clears accepted marks under a fresh lease and index read, checks retained copy payloads without settling
          them, and preserves unsent or uncertain work. Stored-conflict display alone does not retain a mark; clearing
          lock failures report the holder and retry, while stampless recovery preserves its unedited classification.

    - `[x]` **2.11.b The command**

        - Registered `arc selection` and its help/input contracts. It reads the matching command's completed index,
          filters editable Markdown and changed marks, and prints paths or `{ paths }`. Shared start refusal mapping
          preserves holder, identity, lease, and Git-directory remedies; unusable indexes refuse until repaired.
          The in-repo backend returns an empty selection, with the skip switch taking precedence.

### `[x]` **2.12 Connect the Markdown checks' reader — § 11.7**

- _Goal:_ The `selection` checks, `lint:md:fix`, and `lint:md:fix:file` read what `arc selection` prints for the same
  checkout and `--changed` flag, through the one reader `projected-markdown-checks` added, and report a failure to read
  it as `couldn't run` rather than as an empty selection.

- _Outcome:_ The reader shares index selection and refusal evidence with the matching command start. Scripts inspect
  the lazy Store capability before invoking literal `npx arc selection --json`, forwarding `--changed` and validating
  its path list, with an explicit noninteractive subprocess policy. Failed starts, malformed output, stale builds, and
  launch errors remain unavailable. Native declared checks cover take-in, conflict exclusion, holder repair, and checkout
  isolation; the Markdown fixer keeps its existing behavior.

## **Phase 3:** Verification

### `[ ]` **3.1 Complete verification** — load and follow `verify-work-unit.md`

- _Note:_ Verification repairs declare source-CLI entrypoints in store-suite reach, retain decomposition basename locators
  beside full stored companion paths, disambiguate the selection diagnostic, and align integration fixtures with the nested
  active layout. Further repairs retain unsent guarded read-backs with actionable reporting, including accepted
  adoptions, and enforce person ownership for Planning backlog inbound lists while preserving ordinary stub grooming.
  Swap settlement now keeps unreplaced read-backs reported and unsent, and unreadable retained inputs hold only their
  file, preserving accepted-adoption recording and allowing independent edits and a repaired retry.
  Whole-record resolution validates the submitted edit while preserving the stored side and its envelope.
  Equivalent projected aliases now share resolution authority; incompatible or held copies retain their bytes with
  repair guidance while independent edits continue, and agreeing copies resolve through the same conflict token.

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

  **Deviation (A3):** Registered parsers run where present. `work-item/notes`, `personal/document`, and
  `personal/session-context` intentionally have no parser-derived fields; their kind checks, backend validation, and
  write authority remain in force (spec § 7.6).

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

- `[ ]` An unindexed backlog path is classified within one established work-item container. Missing or conflicting
  ownership evidence preserves its bytes unadopted with an actionable refusal; the same edit adopts after repair, and
  indexed files retain their exact record authority (A1).

- `[ ]` Ready for integration

- `[ ]` A dropped cohort document creates no cohort, stays intact with repair guidance until its existing authority is
  established, then adopts the same bytes into that generation. Current copies retain membership binding, archived
  files retain exact archive authority despite a live namesake, and ordinary fixed personal and project-inbox creation
  remains available (A2).
