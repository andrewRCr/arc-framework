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

### `[ ]` **1.1 Parse an edit and send it against its base — § 7.1**

- _Goal:_ Each hand-edited file reaches the store as its own write: its IDs restored, parsed by its kind's parser, sent
  against the record version its base names, merged by the store where it has moved on, and replaced by the record read
  back, with what the write-back took in kept for a stale buffer's next save.

    - `[x]` **1.1.a Parse and send**

        - Added `prepareWriteBack` and the bound take-in port: settled reads, production parsing, one content put per
          file against its indexed base, primary placement preserved without its archive sequence, and refusal reports.
          The caller owns swaps and publication; the pre-send raw index write marks other aside copies without advancing
          the racy reference, and an aside landing records the bytes it read.

    - `[ ]` **1.1.b Read back**

        - After a write lands, write-back reads the record back and records what it took in (`recordWriteBack`,
          `lib/store/projection/taken-in.ts`) — the stamp it read; for a Markdown file whose stamp was lost, the
          recovered base's blob id (`recoverBase`, `lib/store/projection/base-recovery.ts`); for a file other than
          Markdown, which carries none, the base blob id its take-in carried (`TakeInBase`'s `blob`): its entry's
          `base.blob` for the file at its path, which write-back reads from the entry at the command's start and the
          guard's re-check hands it (`baseOf`, `lib/store/projection/replace-guard.ts`), and the blob an aside copy's
          name carries for a copy, which 1.1.d's revert rules compare with the entry's base and the version a
          replacement in progress replaces — and the content taken in, the version written or a kept copy, either way a
          persisted write-back; the copy it releases, and one a stop left before an index named it, is removed by the
          command's end (1.9.a), never before the index that stops naming it is written (`commitProjectionIndex`,
          `lib/store/projection/index-file.ts`). Where it refused nothing the file held, it clears the refused mark and
          replaces the file through the swap (`swapBatch`, `lib/store/projection/swap.ts`), laid by the one renderer
          (1.7.c), the record read back — its stored content's blob id and record version — becoming the file's base,
          never what was sent, its conflicts drawn in once 1.7 draws them, the re-check's baseline the stat and blob id
          write-back read (`ReplaceGuardInput.baseline`, `lib/store/projection/replace-guard.ts`), which the batch's
          first index write records beside the aside copy, as a read-back's batch: its second index write clears the
          pending mark it set, and a file already pending keeps its mark for the next refresh. Where it refused a
          malformed entry's persist while the rest landed, which 1.4.b builds and tests, the file keeps the person's
          content, its stamp, and the base it was rendered from, pending, its refused mark and remedy kept, and its
          entry records the record's open conflicts, reported beside the refusal; no swap runs, since the entry's text
          exists nowhere else. Where the sweep's ignore verdict refuses the file's root, which 1.9.a builds and tests,
          the file keeps its content and is pending in the same way, since nothing may be written into that root for the
          command, and the guard's refusal is reported.
        - The one renderer's core, which this task builds in `lib/store/projection/`, 1.5 and 1.7 extend, and 1.7.c
          completes: given the record, the content being written, and the marker length the sets that content holds are
          at (1.7.c), it lays the content under the stored content's stamp (`renderStampedFile`,
          `lib/store/projection/stamp.ts`), a file other than Markdown as it is, and stages it as `stageRecordFile`
          (`staging.ts`) stages the stored content, its stamp and `base.blob` the stored content's and `written` the
          laid bytes' blob id.
        - Two blob ids are kept apart: the file's own bytes' (`written`, a `taken-in` answer's `read.blob`, and an aside
          copy's moving, linked, and landed blobs), and the stored content's (`base.blob`, the stamp).
        - Build `test-first` (one behavior at a time):
            - a stale edit the store merges is replaced by the merged record, and the index's base is the merge's
              version
            - an entry the backend stamped shows its `_Id:_` in the file after read-back
            - a landed edit's read-back stamps the stored content's blob id, and the index records the laid bytes' as
              `written`
            - a read-back holding the content taken in records the version written, and a merged one keeps a copy with
              the landed IDs
            - a save landing between write-back's read and its read-back replacement is taken in, and the sent content
              is not sent again
            - a landed edit's read-back leaves no pending mark on the file it put in place
            - a file other than Markdown whose edit landed has its read-back's aside copy deleted as no edit, nothing
              sent again
            - a file pending before its edit landed is still pending after the read-back

    - `[ ]` **1.1.c Entries typed by hand**

        - Before sending, and before any merge in the checkout, once the duplicated-`_Id:_` rule below has run, an entry
          with no `_Id:_` takes an ID its base carries, through the engine's one matcher (`restoreEntryIds`,
          `lib/store/projection/taken-in.ts`): from the base entries whose `_Id:_` no entry in the file carries, the one
          whose text, apart from its `_Id:_` line, equals the entry's, else the one whose heading — in a field-header
          list, its field header — the entry shares, each only where exactly one base entry matches; a base entry's ID
          goes to one entry at most, and where two entries match it the same way, neither takes it. An entry its base
          lacks is left for the stamp. A duplicated `_Id:_` left by an editor's "accept both" gives the second entry a
          fresh ID drawn from a seeded stream this task builds, so a retry after a stop sends the same one: a SHA-256
          stream in `lib/store/projection/` over `digestBytes` (`lib/kernel/canonical/canonical-json.ts`), seeded by the
          record's reference, the base content, and the file's content, which 1.2.a's stamp draws from too.
        - Build `test-first` (one behavior at a time):
            - an entry whose `_Id:_` line was deleted takes its base's ID back by its heading
            - a heading the base holds twice matches nothing, and the entry is left for the stamp
            - an entry whose text equals a base entry's takes that entry's ID though another base entry shares its
              heading
            - two ID-less entries matching one base entry by heading both take none, and a base entry whose ID an entry
              in the file still carries gives it to no other
            - an "accept both" duplicate gives its second copy a fresh ID, and sent again after a stop it lands once

    - `[ ]` **1.1.d Select the base**

        - The base an edit is sent against or merged from is chosen in the order `spec-projection-substrate.md`
          § 3.5–§ 3.7 gives, as spec § 16.5 amends it for a file other than Markdown, over the content parse-back
          returns, before each entry parse-back refused is put in as that base holds it and before the ID restore, which
          takes the base's entries. For a Markdown file, at its path or as an aside copy, by the stamp it carries: a
          stamp equal to the one its last persisted write-back read takes what that write-back took in
          (`selectPersistedBase`, `lib/store/projection/taken-in.ts`); a stamp naming the index's base takes its
          version, reading no `history`; a stamp naming another stored version takes that version, found through the
          command's `history` memo by its stored blob id; and a stamp lost, or naming no stored version, goes to stamp
          recovery (`recoverBase`, `lib/store/projection/base-recovery.ts`), the read-back restoring the stamp. A file
          other than Markdown at its path is read against its entry at the read step, on the text as read
          (`readStamplessFile`, `lib/store/projection/stampless.ts`): young and empty, it waits; holding what was
          written, or the version a replacement in progress replaces, it is unedited, except where the path's last
          persisted write-back recorded the base blob id its entry holds (1.1.b), where content equal to what was
          written is the person's revert of what was taken in, and, while a replacement in progress replaces that
          recorded base, so is content equal to the version it replaces; where neither version of a stopped replacement
          can be read, it stays pending and reported. This task changes `readStamplessFile` to answer those reverts as
          edits, taking the record they compare with from the entry's `persisted`, and to return for an edit the version
          a replacement in progress replaces beside the entry's base in place of the closer of them, keeping its
          `history` read of that version and its pending answer, with its tests. An edit of a file other than Markdown,
          at its path or in an aside copy holding a save that landed in it, takes its base by agreement. Its candidates
          are the base its take-in carries (`TakeInBase`'s `blob`) — at its path its entry's `base.blob`, which
          write-back reads from the entry at the command's start and the guard's re-check hands it (`baseOf`,
          `lib/store/projection/replace-guard.ts`), and in a copy the base its name carries (`copyBase`,
          `lib/store/projection/aside-copies.ts`), each swap naming its copy for the base of the file it moves (`plan`,
          `lib/store/projection/swap.ts`, and `putBack`, through `nameAsideFile`), resolved as a stamp is: the index's
          base, reading no `history`, where it names it; the version a replacement in progress replaces where its blob
          id matches; a stored version found through the `history` memo by that blob id; and stamp recovery
          (`recoverBase`) where it names no stored version — then, at its path, the version a replacement in progress
          replaces; and, where the path's last persisted write-back is recorded, the version it landed and the copy it
          kept (`readTakenInCopy`, `lib/store/projection/taken-in.ts`). Candidates holding the same content count once:
          a stored version by its record version, which names one content, so the version a write-back landed, whose
          blob id the index does not hold (`PersistedSchema`, `lib/store/projection/index-schema.ts`), counts with the
          entry's base or the version a replacement replaces where it names the same version; the copy a write-back kept
          counts apart from every stored version, by its blob id, never by the version it records, which is the version
          it landed (`recordWriteBack`); where one remains, the edit is sent against it with no content read or merge.
          Otherwise write-back reads each candidate's content, a stored version through the `history` memo, and one it
          cannot read leaves the file pending and reported; it merges the edit from each onto the store's current
          version, which it reads with `store.read` as the guard's restage does (`restage`,
          `lib/store/projection/replace-guard.ts`), with the library the store's merge uses for the kind. Where every
          merge gives the same content and files the same clashes, a merge that finds no edit counting as the store's
          content unchanged, the edit is sent against the base its take-in carries. Merges are compared as their texts
          with each clash drawn inline, through the option 1.5 adds to `mergeLineText`, at one length over every
          candidate's plain result and under one set of labels, a clash found in the checkout naming `checkout` (1.4.a),
          so two clashes are the same where they fall at the same place with the same two sides, and no base, base
          version, or base line range is compared, but a merge from a kept copy, which the store never held, that files
          any clash counts as differing, since its clash is one found in the checkout (1.5); until 1.5 builds the option
          and routes this comparison through it, a merge that files any clash counts as differing. Where they differ,
          nothing is sent and the file is held, drawn once at its path by write-back's own walk and answered `clashed`
          with no mark through the take-in port (1.5); until 1.5 draws, a hold sends nothing and leaves the file pending
          and reported. No candidate is chosen by closeness: this task removes `selectPersistedBase`'s arm for a file
          other than Markdown and `closerOfCopyAndLanded`, and corrects the docs of `selectPersistedBase`, of
          `PersistedBaseInput`'s `stamp`, which serves Markdown alone, of `WriteBackRecording`'s `stamp` and
          `PersistedSchema` (`lib/store/projection/index-schema.ts`), which hold the take-in's base blob id for a file
          other than Markdown, and the projection `README.md`'s closer-of rules for a kept copy and a replacement in
          progress and its sentence that content equal to the version a replacement replaces always reads as unedited.
        - A stored version goes to the store as the write's expected version, but a meta or task list, which the store
          refuses over a newer version rather than merging, merges in the checkout onto the current version (1.5) where
          its base is stale, and is sent against that version; a kept copy or an empty base, which the store never held,
          merges in the checkout (1.5). A `history` refusal here takes 1.2.a's `history` arm, but where `recoverBase`
          chooses without `history` on `state-unresolvable` and where `readStamplessFile`, or a candidate of a file
          other than Markdown it cannot read, leaves the file pending.
        - Build `test-first` (one behavior at a time):
            - a stamp naming the index's base sends that base's version and reads no `history`
            - a stale buffer's save after a write-back that landed as a fast-forward, carrying the stamp that write-back
              read, sends against the landed version, and the person's own removal stays removed
            - a Markdown file whose stamp an agent's whole-file write dropped, its content equal to a stored version,
              sends against that version, and the read-back restores the stamp
            - a stamp naming an older stored version sends against that version, found through `history`, and a stamp
              naming no stored version goes to stamp recovery
            - an aside copy of a Markdown file is taken in against its own stamp, and one of a file other than Markdown
              whose path has no persisted write-back against the base its name carries, even where its content is closer
              to the entry's newer version
            - a file other than Markdown whose candidates all give the same merge is sent against the base its take-in
              carries
            - the entry's base and the landed version its read-back laid count once, the edit sent against it with no
              content read or merge, and the copy a write-back kept, recording the landed version, counts apart from it
            - after a write-back the store merged and its read-back laid, a reloaded save of a file other than Markdown
              deleting what the merge brought in is held, never sent as a merge from the kept copy
            - after a write-back the store merged, a stale buffer's unchanged save of a file other than Markdown is held
              at the other writer's change, never sent to revert it
            - a save landing in the read-back's own aside copy of a file other than Markdown, after a write-back that
              landed as a fast-forward, is sent, and the person's own removal away from the landed change stays removed
            - a save at the path of a file other than Markdown before a read-back is laid, its content equal to what was
              written, is the person's revert, held rather than refreshed over as unedited, left pending with no mark
              for the next command's start
            - while a read-back replaces the base the last persisted write-back recorded, content equal to the replaced
              version is the person's revert, and content equal to what was written is unedited
            - a stale buffer's save landing in a later refresh's aside copy of a file other than Markdown, after a
              write-back the store merged and kept as a copy, is held, never reverting the other writer's change
            - an aside copy of a file other than Markdown naming the index's base reads no `history`, and one naming no
              stored version goes to stamp recovery
            - a file other than Markdown at its path, while a stopped replacement is in progress, is unedited holding
              the replaced version, and an edit merges from both the entry's base and the replaced version, sent only
              where they agree
            - a file other than Markdown whose stopped replacement's versions, or whose kept copy, cannot be read stays
              pending and reported

### `[ ]` **1.2 Check an edit with the kind's write check and the `after` view — § 7.2, § 7.3**

- _Goal:_ An edit persists only if its kind's write check, run as a hand edit over the merged result, admits it — a
  change to a verb-owned field refused there and kept in its file — and an `after` view answers as the backend will once
  the write lands, which a conformance case holds.

    - `[ ]` **1.2.a The check's input**

        - `writer: { kind: "hand-edit" }`; the record's reference; `prior`, the store's current version with its content
          and parsed fields, or its content alone where it fails to parse, and absent for an adopted file; `next`, the
          merged content and its fields — for a merge kind with a stale base, the store's merge run in the checkout with
          the same library over the base's content, read through `history` by way of the command's memo
          (`createHistoryMemo`, `lib/store/projection/base-recovery.ts`); for a meta or task list over a verb's newer
          write, 1.5's merge; never the file alone; `before`, which also answers `history`, and `after`; and
          `observations: []`, a hand edit observing no other record, with `proposedCreatedOwners` absent
          (`WriteCheckInput`, `lib/store/write-check.ts`). The hand-edit writer carries no `lifecycleAction`, which only
          a verb's writer takes.
        - Before an entry merge in the checkout, the copy it merges is stamped (`stampEntryIds`,
          `lib/store/concurrency/stamp.ts`), its random source 1.1.c's seeded stream, since `entryFrame` throws on an
          entry with no `_Id:_` (`lib/store/concurrency/entry-frame.ts`); the write sends the edit as it is, unstamped,
          for the backend to stamp.
        - Every rule the check returns is reported with its remedy and sets the refused mark; the edit stays in its
          file. A `history` read that refuses `state-unresolvable` naming a history ref takes 2.3's path; one naming
          none, or refusing `namespace-corrupt`, leaves a refused edit carrying the backend's remedy, nothing pulled,
          which 1.3 tests over its wrapper.
        - Build `test-first` (one behavior at a time):
            - an edit changing a verb-owned field is refused with the check's rule, the file keeping its content, and
              lands once the field is restored
            - an entry kind's stale-base edit is checked over the merged entries
            - an entry typed by hand over a stale stored base is checked over the merged entries, its copy stamped, and
              the edit is sent unstamped
            - an edit repairing a record stored unparseable is checked against its content alone
            - an edit breaking a record link is refused by the link rules every linked kind's check carries
              (`RECORD_LINK_KINDS` and `composeLinkChecks`, `lib/store/kinds/in-repo-registrations.ts`), and lands
              once the link is repaired

    - `[ ]` **1.2.b The `after` view**

        - In `lib/store/projection/`, built from `before`, the written record's reference, and the pending write's
          content and parsed fields — the check's `next` — never a parser of its own: `read` and `list` answer the
          written record from the pending write, its `conflicts` as `before` holds them, and everything else from
          `before`; a record absent from `before`, never a primary record or a cohort document since write-back creates
          neither, takes a placeholder version and its owner's placement; `lookup` is `before`'s for every kind.
        - Build `test-first` (one behavior at a time):
            - `read` of the written record returns the pending content, and of any other record `before`'s
            - `list` of the written record's family returns the pending record in its place
            - a record absent from `before` reads and lists from the pending write

    - `[ ]` **1.2.c The conformance case**

        - A new item in the store's conformance suite (`registerStoreConformanceSuite`,
          `__tests__/helpers/store/conformance-suite.ts`), item 18, which widens `SuiteItem`
          (`__tests__/helpers/store/fixture-contract.ts`) and the `conformanceItems` map, and joins the `sync` range
          beside item 17's registered write checks: `[16, 18]` in the ref fixture's ranges and its three separate-layout
          parts (`wholeRunRanges`, `separateWholeRunRanges`, `__tests__/helpers/store/ref-fixture.ts`), so no test file
          is added. In the same change the registration unit test's item literals
          (`__tests__/unit/lib/store/conformance-registration.test.ts`), which its casts hide from the compiler, follow
          — `[7, 18]` for each `[7, 17]`, and both unknown-item cases moved past the new last item, the range case's
          `[7, 18]` to `[7, 19]` and the exclusion case's `18` to `19` — and the item counts the file comments state
          follow: `conformance-suite.ts`, `fixture-contract.ts`, `__tests__/helpers/store/README.md`,
          `conformance-reference.test.ts`, and the four `sync` files' items 16–17. Over each backend that runs checks,
          for each kind that projects which its fixture serves — every kind whose mechanism's `projection` is not
          `never` (`KIND_MECHANISMS`, `lib/store/registry.ts`) but `personal/errand-queue`, `project-machinery/prose`,
          and `constitution/prose`, which hold no layout address and so project nothing (spec § 10.1) — the `after` view
          built before a write answers `read`, `list`, and the slug, lineage, claim, and ref lookups as the backend does
          once the write lands, compared apart from each result's `version` and `asOf`, the written record's
          `conflicts`, the conflict records the landing files or removes, and the `_Id:_` values the landing stamps. The
          pending fields come from the fixture's parser override, as `suite-write-checks.ts`'s `checked` builds them.
          The commit lookup stays outside it.
        - Build `test-first` (one behavior at a time):
            - the case passes over the reference backend for every hand-editable kind
            - the case passes over the ref backend's fixture (`refRegistration`,
              `__tests__/helpers/store/ref-fixture.ts`) for every hand-editable kind it serves

### `[ ]` **1.3 Persist under hand-edit provenance, and extend the test stores — § 7.4–§ 7.6, § 1.5**

- _Goal:_ Every persist of a hand edit lands under `write-back`, or `save` at `arc save`, with the lifecycle action
  `edit`, set by write-back and never read from the file; a serialization or unhomed-kind refusal is a refused edit with
  its remedy; and test stores wrapping the reference backend return the refusals it cannot.

    - Provenance imports `HAND_EDIT_VERBS` (`lib/store/links.ts`); the persist and release steps
      (`projection-worktrees`) use `write-back`.
    - `checkSerializationRules` (`lib/store/serialization.ts`) runs in the ref backend's `write` and `batch` alone;
      write-back keeps no copy of the rules and reports the backend's `record-malformed` refusal as it reports any, so
      its test runs over the ref backend's fixture (`refRegistration`). A kind with no parser and no rules of its own
      still carries the link rules (1.2.a), and otherwise persists unvalidated; an `unsupported` `unhomed-kind` refusal
      is a refused edit carrying the backend's remedy.
    - The test stores: `createHistoryRefusingStore` (`__tests__/helpers/store/projection/history-refusing-store.ts`)
      refuses `history` for the records it names, naming each one's history ref whatever is pulled, and counts every
      call; `lackingEndedHistory` (`__tests__/helpers/store/ended-history.ts`) refuses an ended item's writes, batches,
      and `history` naming its history ref until a `pull({ history })` names it, answering a pull result
      `PullResultSchema` parses, after which the retry lands (2.3). This task adds, beside them, a wrapper returning the
      refusals neither does — `unsupported` `unhomed-kind`, which the reference fixture excludes; `state-unresolvable`
      naming no history ref (`historyRefs: []`) on a write or on `history`, as the ref backend refuses a captured
      object it cannot read under a ref it holds or an anchor naming a state version it cannot resolve;
      `namespace-corrupt` (1.6); and a `pull` refused `lock-held` (2.3) — each as `StoreRefusalSchema`
      (`lib/store/refusal.ts`) parses it.
    - Build `test-first` (one behavior at a time):
        - write-back's write carries `write-back` and `edit`, and `arc save`'s carries `save`
        - a file naming another verb in its content still persists under `write-back`
        - an `unhomed-kind` refusal leaves a refused edit carrying the backend's remedy
        - a serialization rule's refusal over the ref backend's fixture leaves a refused edit with its rule, and the
          edit lands once the rule is met
        - the write check's `history` read refused `state-unresolvable` naming no history ref, or `namespace-corrupt`,
          leaves a refused edit carrying the backend's remedy, nothing pulled, and the same edit lands once the read
          succeeds

### `[ ]` **1.4 Render conflict markers and parse them back — § 6.1, § 6.2, § 6.4**

- _Goal:_ Markers render at one length per file — seven, or escalated with a resolve-by-hand line where the file holds a
  marker-like line — and parse back exactly, each set to its own conflict: untouched markers keep a stored conflict
  open, replaced markers resolve it, a clash found in the checkout keeps its file unsent, and a malformed set refuses
  until repaired.

- **Additional Context:** `notes-projection-write-back.md` § Spike 4

    - `[ ]` **1.4.a Rendering and length**

        - Standard Git markers, the store's side first, each labelled with its machine or session and time. Each set's
          start label also carries the conflict record's ID, or `checkout` for a clash found in the checkout (1.5), so
          each set names its own conflict however many share a merge's labels. 1.5 passes this renderer to
          `mergeLineText` as its option's callback.
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

    - `[ ]` **1.4.b Parsing back**

        - Parsing matches markers of exactly the recorded length, and reads each set's origin from its start label,
          checked against the conflicts the index holds open for the file; a set whose label names none of them is
          malformed. A stored conflict's set left as it was sends the store's side in its place; replaced by text, it
          sends the text naming the conflict in `resolves`, riding the file's own write; a set whose markers stand but
          whose sides differ from those its conflict record holds is a resolution in progress, which write-back refuses,
          its remedy naming the set to finish or restore: its whole file, for every kind, stays pending, unsent, and
          reported, taking a refused edit's routes, so the replace guard leaves it unreplaced (`guardReplacement`,
          `lib/store/projection/replace-guard.ts`), the store's other changes reaching it once the resolution is sent,
          and an aside copy holding one goes back to its path with its bytes as they are where the copy's settlement
          sends a refused copy back, and is otherwise kept as it keeps one (`settleAsideCopy`,
          `lib/store/projection/aside-copies.ts`); a conflict already resolved elsewhere is dropped from `resolves`, its
          text sent as an ordinary edit. A set the checkout found (1.5) keeps its file
          pending and unsent, for every kind, while it stands.
        - Malformed — an incomplete set at the recorded length, or a resolve-by-hand line left behind — refuses the
          entry, or the whole file for prose, with a typed remedy, and persists once repaired. The write carries each
          refused entry as its base holds it — none, where its base has no such entry — so the landing leaves the
          store's version of that entry as it was. A take-in refusing one is a refused edit, whether the rest lands or
          nothing else is left to send, and the replace guard holds the file whole while the set stands. Where the rest
          lands, the file keeps the person's content, its stamp, and its base, pending and refused (1.1.b), so its next
          write-back merges from the content that landing took in (`selectPersistedBase`,
          `lib/store/projection/taken-in.ts`) and only the refused entry reads as an edit. An aside copy holding one is
          refused whole, sending nothing, and takes a refused copy's routes (`settleAsideCopy`): back to its path where
          that path has not moved on, the file's own take-in then landing the rest, and otherwise kept, reported with
          its path. Write-back reports every resolution it sends.
        - A file the replace guard holds whole, for a resolution in progress or a malformed set, is not drawn into
          (1.7), so its index entry records its record's open conflicts it does not show — those of the record read back
          after a landing (1.1.b), and those of the version each refresh that leaves it unreplaced reads
          (`projection-worktrees`) — until the file is next replaced with the record, which draws them. Write-back
          reports them beside the file's refusal, with the repair that releases the file as their remedy, and
          `arc status` shows them (1.9.c).
        - Build `test-first` (one behavior at a time):
            - untouched markers keep the conflict open and the record holds the store's side
            - an entry kind's untouched markers keep their conflict open, the entry's second version keeping its `_Id:_`
            - an edit inside a side, the markers standing, is refused naming the set, and its file, another entry's edit
              in it included, stays pending and unsent through a command
            - markers replaced by text persist naming the conflict, and the conflict closes
            - of two sets from one merge, resolving the second closes its conflict and keeps the first open
            - a longer marker run added while resolving does not confuse the parse
            - a missing end marker refuses the entry with its remedy while another entry's edit lands, the file keeping
              the set's text, its stamp, and its base through the command, pending and refused, and the repaired file
              persists and is replaced
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
              beside the refusal
            - a prose file holding a clash the checkout found keeps its markers and is not sent

### `[ ]` **1.5 Merge in the checkout where the store holds no base — § 7.7**

- _Goal:_ The three edits whose base the store never held — a save merging from content a persisted write-back took in
  and kept as a copy, content sharing no non-blank line with any candidate, and a hand edit to a meta or task list over
  a verb's write — merge in the checkout onto the store's current version; a clean result is sent, and a clash stays in
  its file as markers, never stored. A file other than Markdown whose candidate bases disagree is held: its clash with
  the store's current version is drawn into it once, and it stays held, reported with a token, until its candidates
  agree or `arc save --resolve` sends it.

- _Note:_ The hold's remedy here and 1.7.b's notice line name `arc save --resolve`, so the emitted-command case of
  `command-surface-documentation.test.ts` (`registers emitted corrective commands`) fails from this task until 1.10
  registers `save`; the commit gate does not run it (`ARC_CONTRACT_SUITES`, `lib/local-vitest-runner.ts`).

    - The merge uses `mergeLineText` or `mergeEntryText` (`lib/store/concurrency/`) with the base's record version in
      `MergeTextInput.baseVersion` — null for the empty base and the kept copy — and side labels (`SideLabelSchema`,
      `lib/store/conflict.ts`): for the edit, this checkout's actor as the ref backend writes it,
      `<identity>@<machine-id>` (`createDefaultRefStorePorts`, `lib/store/default-ports.ts`), and the save's
      modification time; for the store's side, the record version it merged onto and the time write-back read it.
    - A clash's markers are rendered inline as `mergeLineText` builds its result, through an option on it that takes
      1.4.a's renderer as a callback, since `lib/store/concurrency/` imports nothing from `lib/store/projection/`
      (`store-concurrency`, `eslint/architecture-imports.ts`), so no placement step can miss: an optional field of
      `MergeTextInput` typed in `line-merge.ts`, given each side's lines and label and a marker length, returning the
      set's lines, its start label naming `checkout`. It takes each side's lines, never the content `ConflictSideSchema`
      (`lib/store/conflict.ts`) stores, since a side of no lines and a side of one blank line both store as `""`. Only
      the drawing's own `mergeLineText` call and 1.1.d's comparison of a file other than Markdown's candidate merges,
      which this task routes through it in place of counting any clash as differing, set it; the input `mergeEntryText`
      spreads into its own line merges (`lib/store/concurrency/entry-merge.ts`) never carries it, so a merge without it
      returns what it does today. The length is a parsing length, 1.4.a's over every line a first run without the option
      returns — its content and each clash's sides — which the second run draws at, the merge returning the same result
      each run; the renderer then sets the file's one length (1.7.c). An entry kind merges through `mergeEntryText`
      first, and a clean result is sent; where it clashes, `mergeLineText` runs over the same base and sides, and a
      clean line merge is the clean result, sent with both sides' lines; where that clashes too, its markers are the
      file's, since its every clash has one span to draw, where an entry clash keeps one side and a prose clash spanning
      an entry has none.
    - An entry merge stamps its own copy first, as 1.2.a stamps it, so a result sent again after a stop carries the same
      IDs, which the backend keeps.
    - The file is stamped with the version it merged onto. Drawing the markers replaces the file by the swap, laid by
      the one renderer (1.1.b, 1.7.c) given the merge's result at its parsing length, which maps each of the merge's
      sets as found in the checkout (1.4.b), draws the record's stored conflicts, one whose span overlaps a set already
      laid, a set found in the checkout among them, as a notice line, and lays every set at the file's one length; its
      guard's baseline is what write-back read (`ReplaceGuardInput.baseline`) and its aside copy write-back's own, so a
      save that landed in the copy is taken in. A file one of whose entries write-back refused (1.4.b) is not drawn
      into: the clash is reported beside that refusal and drawn once the entry is repaired. Once its markers are
      resolved, the file writes back as an ordinary edit against that stamp.
    - A clash found while taking in an aside copy has no file of its own: the take-in answers `clashed`
      (`TakeInResult`), and the copy's settlement puts the copy back at its path (`settleAsideCopy`), where write-back,
      taking the file in there, merges it again and draws the clash as this task draws any, or keeps it, reported. A
      resolution in progress (1.4.b) is refused, never a clash, so its copy goes back with its bytes as they are where
      its path has not moved on. A clash found through the take-in port at a path — the replace guard's re-check before
      a swap (`guardReplacement`, `lib/store/projection/replace-guard.ts`) — is not drawn there, since the port swaps
      nothing (1.1.a): the take-in answers `clashed`, the guard leaves the file pending (`held`), and write-back's own
      walk next takes it in at its path and draws it.
    - A file other than Markdown whose candidates give different merges (1.1.d) is held, never merged from one of them.
      At its path, the first hold write-back's own walk finds — at a command's start, or in the persist and release
      steps, which run it whole — draws the clash between the file and the store's current version: write-back diffs the
      two (`diffIndices`, `node-diff3`), each split into lines with any final newline set apart, as `mergeLineText`
      splits its inputs (`lines`, `lib/store/concurrency/line-merge.ts`), and lays the file's lines where they agree
      and, at each span where they differ, a marker set whose sides are the store's current lines there and the file's,
      through the same renderer as a clash and labelled as one found in the checkout is, the whole file one span where
      the diff finds none, as where the two differ only in their final newline, and lays the file, keeping its own final
      newline, by the swap as a drawing is. A hold always has a span to draw, since every candidate's merge returns the
      store's current version, clean, where the file equals it (`mergeLineText`), and the drawing shows every line where
      the two differ, one every candidate's merge resolves alike among them; nothing is stored, and the take-in answers
      `clashed`. Its entry records the hold as its `refused` mark (`RecordEntry`,
      `lib/store/projection/index-schema.ts`), reason `bases-disagree`, whose remedy names `arc save --resolve <token>`
      with its argv, the token last, in `formatConflictToken`'s form (`lib/status/conflict-token.ts`) over the file's
      family and owner and a fresh key, as a conflict record's is (`randomUUID`, `lib/store/ref/write-conflicts.ts`), so
      it names no stored conflict. The mark is set on the entry the replace guard's `replace` hands the drawing's swap
      batch (`SwapFile`, `lib/store/projection/swap.ts`), only where that `replace` still stages the drawing, and never
      on the entry the guard re-checks: a save that re-check holds leaves the file unmarked, pending, and one it takes
      in and sends restages the record's current version in the drawing's place (`restage`,
      `lib/store/projection/replace-guard.ts`), the hold gone. The mark stays until the file is sent: a later save whose
      candidates agree is sent, and its read-back clears the mark; one whose candidates still disagree, the mark
      standing, is not drawn again but answers `refused` with the mark (`TakeInResult`), the file pending; and 1.10
      sends it by its token. A hold found through the take-in port draws nothing and mints no mark: the take-in answers
      `clashed`, which carries none, leaving the entry's `refused` and `base` as they were, since the guard's re-check
      at a path and a copy's settlement each write onto the entry any mark the answer carries (`held`; `putBack`), where
      it would stand for a drawing never made; at a path the guard leaves the file pending until write-back's own walk
      next takes it in, which draws a first hold, never one whose mark already stands, and a copy goes back to its path
      as a clash's does (above), where the path's own candidates decide. The persisted write-back stays until the next
      landing replaces it.
    - Build `test-first` (one behavior at a time):
        - a stale buffer's save, its content taken in kept as a copy, merges from that copy and keeps the other writer's
          change
        - a stale buffer's save of a file other than Markdown, after a write-back the store merged and kept as a copy,
          is held and drawn, the other writer's change on the store's side, never merged from one candidate
        - the next edit of a file kept after a malformed entry was refused, whose landing the store merged, merges in
          the checkout from the content taken in
        - a clean merge in the checkout lands its result, the content taken in is the file as read, kept as a copy, and
          the buffer's next save under that stamp keeps the other writer's change
        - content sharing no non-blank line with any candidate merges against an empty base, its clashes kept in the
          file
        - a hand edit to a meta over a verb's newer write clashes into markers and stays pending, unsent
        - an edit leaving `State` alone over a verb's newer `State` is admitted, since the write check's `next` merges
          the verb's change, and lands, sent against the version it merged onto
        - an entry kind's clash, and a prose clash spanning an entry, each render whole through the line merge
        - an entry clash whose line merge is clean sends the line merge's result
        - a clash whose side holds a setext `=======` draws every set at the escalated length, and parses back
        - a clashing side of one blank line draws that line between its markers, and a side of no lines draws none
        - the clash, resolved by hand, persists as an ordinary edit
        - a save placed into a drawing's swap by the swap's after-re-check hook (`SwapHooks.afterRecheck`,
          `lib/store/projection/swap.ts`) is taken in, never deleted as no edit
        - a clash beside a malformed set in another entry draws nothing, both reported, and is drawn once the set is
          repaired
        - the same merge run twice stamps the same IDs
        - a hold's drawing lays a set of the store's current lines against the file's at every span where the two
          differ, one every candidate's merge resolves alike among them, and the file's lines where they agree
        - a hold whose candidates' merges give the same text but file different clashes is drawn, a set where the file
          and the store's current version differ, and stays pending, never read as unedited
        - candidates whose merges file the same clash, at the same place with the same two sides, from different stored
          versions, agree and are sent; merges whose texts differ only in where a clash falls do not; and a merge from a
          kept copy that files a clash differs from every other
        - a hold's mark carries `bases-disagree` and a remedy naming `arc save --resolve`, its argv ending in a token
          `parseConflictToken` parses and no stored conflict carries
        - a drawing resolved to the store's side is sent, and its read-back clears the hold
        - a drawing resolved to the person's side is held undrawn, refused with the mark's reason and remedy, the file
          pending
        - a never-reloading buffer's save over a drawing is held undrawn, never sent
        - a hold taken in from an aside copy answers `clashed` with no mark, the entry's refused mark and base
          unchanged, and goes back to its path, where the path's own candidates decide, or stays with the copy, as a
          clash found taking it in does
        - a hold found at its path by the guard's re-check, a save landing while a read-back's swap runs, answers
          `clashed` with no mark, the file left pending and undrawn, and the next command's start draws it and mints the
          mark
        - a clash found at a path by the guard's re-check is left pending and undrawn, and the next command's start
          draws it
        - a save landing while a drawing's swap re-checks the file is held unmarked and pending, and the next command's
          start draws it and mints the mark
        - a save landing while a drawing's swap re-checks the file, whose candidates now agree, is sent, and the
          record's current version is laid in the drawing's place, unmarked

### `[ ]` **1.6 Handle each refusal the store returns — § 7.8, § 1.5**

- _Goal:_ A refusal lands nothing and loses nothing: each code leaves the edit in its file, marked refused or pending,
  and takes the path its section names, exercised over the reference backend and, for the refusals it cannot return,
  the test stores (1.3).

- _Note:_ Built once `storage-ref-hardening` is on base and this branch has merged it, never on that work's branch; the
  arms keyed on `state-unresolvable` and `namespace-corrupt` are confirmed against it as shipped first (spec § 18). See
  `notes-projection-write-back.md` § Grounding against `storage-ref-hardening`. Until then, 1.7–1.10, which use nothing
  from it, build first, and 1.11 closes the phase after it.

    - `record-malformed` leaves a refused edit reported with its rule and remedy. `version-conflict` on a merge kind
      reads the record: gone, it takes the removal path's refused edit (`spec-projection-substrate.md` § 5.6); still
      there, the stamp is treated as lost and the file goes to stamp recovery (`recoverBase`,
      `lib/store/projection/base-recovery.ts`) once per command, a second `version-conflict` leaving it pending and
      reported. `lock-held` marks the file pending, reported with the backend's remedy.
    - `state-unresolvable` naming a history ref comes only for an item this clone holds no live ref for, a completed one
      (`missingHistoryRefs`, `lib/store/ref/missing-history.ts`), on a write or on a merge's `history`, and is 2.3's.
      One naming none (`historyRefs: []`) — a captured object this clone cannot read under a ref it holds
      (`checkRecord`, `lib/store/ref/write-checks.ts`) or an anchor field naming a state version it cannot resolve
      (`prepareAnchor`, `lib/store/ref/write-anchors.ts`) — leaves a refused edit carrying the backend's remedy, and
      nothing is pulled. `namespace-corrupt`, a terminal fault in the store's data, leaves a refused edit carrying the
      backend's remedy, and nothing is pulled; the edit stays in its file, so each command sends it again, and it
      lands once the store is repaired. `unsupported` `unhomed-kind` is 1.3's. Any other refusal lands nothing, and
      the next command sends the edit again.
    - A command stopped after a write lands and before the index records it sends the edit again at its next run.
    - Build `test-first` (one behavior at a time):
        - a stale-base merge the kind's parser rejects refuses `record-malformed`, the edit stays reported, and the
          repaired edit lands
        - `version-conflict` for a record now absent takes the removal path's refused edit
        - `version-conflict` whose expected version is outside the record's history recovers the stamp once, and a
          second leaves the file pending
        - `lock-held` leaves the file pending, reported with its remedy, and the next command lands it
        - `state-unresolvable` naming no history ref leaves a refused edit carrying the remedy, records no pull, and
          the edit lands at the next command once the remedy is applied
        - `namespace-corrupt` leaves a refused edit carrying the remedy, records no pull, and the edit lands at the next
          command once the store answers again
        - a prose write landed but unrecorded is sent again, and the record's content holds the edit once

### `[ ]` **1.7 Draw the conflicts the store files into the file — § 6.3**

- _Goal:_ A conflict the store files shows in every checkout that renders its record — markers where placement's check
  passes and its span meets no other set, and a notice line where the check fails, where it would meet another set, or
  where the conflict is whole-record — never markers placed by guess.

- **Additional Context:** `notes-projection-write-back.md` § Spike 6

    - `[ ]` **1.7.a Placing an entry or hunk conflict**

        - An entry conflict goes around the entry its `_Id:_` names; one whose ID the content being written lacks shows
          as a notice line. A hunk conflict is placed at its start line moved through a diff from the base content into
          the content being written (`relocateTextOffsets`, `lib/store/concurrency/line-merge.ts`, its character offsets
          converted from the record's line range), spanning `currentLines`, and accepted only where those lines equal
          the current side and the line beside each end equals the line beside the base range in the base content, or
          the file's edge; the base content is read through `history` at the record's `baseVersion`, empty where it is
          null, and `incomingLines` draws the incoming side exactly. Where `history` refuses `state-unresolvable` or
          `namespace-corrupt`, the conflict shows as a notice line and nothing is pulled.
        - Build `test-first` (one behavior at a time):
            - an entry conflict is drawn around its entry
            - a hunk conflict rendered at its filing version is placed on its lines
            - after an unrelated later edit it is still placed, and after an edit touching its neighbors it is not
            - an empty incoming side and a side of one blank line draw differently, by their counts
            - a `history` refusing `state-unresolvable` or `namespace-corrupt` shows the conflict as a notice line,
              nothing pulled
            - an entry conflict whose ID the content being written lacks shows as a notice line

    - `[ ]` **1.7.b Notice lines and stampless files**

        - A placement that fails its check, a whole-record conflict, and a stored conflict whose placed span overlaps a
          set already laid (1.7.c) show as a notice line (`renderStampedFile`, `lib/store/projection/stamp.ts`) naming
          the conflict by its token, `<family>/<owner type>/<owner name>/<key>`, formatted by status's own
          `formatConflictToken` (`lib/status/conflict-token.ts`), which `arc save --resolve` parses back (1.10); the
          incoming side's machine or session and time; where that side reads, `arc status --conflicts <conflict>`, which
          shows both sides (`handlers/status/conflicts.ts`); and the remedy, `arc save --resolve <conflict>`. Refresh
          writes the line only while the conflict is open; deleting it changes nothing.
        - A file with no stamp takes the markers of a conflict whose placement passes and whose placed span overlaps no
          set already laid, and shows any other nowhere in the file, its index entry recording it; a file the replace
          guard holds whole (1.4.b) is not drawn into, its entry recording its open conflicts until the file is next
          replaced with the record. The index maps each marker set and notice line to its conflict record.
        - Build `test-first` (one behavior at a time):
            - a failed placement shows as a notice line naming the conflict's token, `arc status --conflicts` with it,
              and the remedy, and the token parses back to the conflict's reference
            - an entry merge's prose hunk spanning an entry shows as a notice line
            - a whole-record conflict a pull files shows as a notice line
            - a stampless file takes a placeable conflict's markers, and records an unplaceable one in its entry alone
            - a file held for a resolution in progress or a malformed set is not drawn into, its conflicts recorded in
              its entry, and draws them once the resolution is sent or the set repaired

    - `[ ]` **1.7.c One renderer for every replacement**

        - The one renderer in `lib/store/projection/`, whose core 1.1.b builds and 1.5 extends, and which this task
          completes, takes the record, the content being written, and the marker length the sets that content holds are
          at: the stored content, which holds none; a clash's drawing's merge result, which holds the sets found in the
          checkout (1.5); or a conflicted file's refresh, the line merge's result, which holds the file's sets, stored
          and found in the checkout (1.8). It parses the held sets at that length (1.4.b), mapping each to its conflict
          by its start label; reads the record's open conflicts the content holds no set for and, through the command's
          `history` memo, the base content their placement needs; draws them in the order of their tokens
          (`formatConflictToken`) by 1.7.a and 1.7.b, except that one whose placed span overlaps a set already laid — a
          held set, or one drawn before it — shows as a notice line, or, in a file with no stamp, in its entry alone, so
          no two sets meet, two spans overlapping where they share a line, or where one spans no lines, marking only the
          point before the line it is placed at, and that point lies inside the other's lines, at either of its ends, or
          at the other's own point where that spans none too; writes notice lines for open conflicts alone and adds, for
          a protected file, the protection notice 2.2 supplies; lays every set at the one length 1.4.a gives over every
          line the file shows, the drawn conflicts' sides included; and returns the laid text with the index's mapping
          of each marker set and notice line to its conflict, a set found in the checkout marked as such. The stamp and
          `base.blob` stay the stored content's, and `written` is the laid bytes' blob id.
        - Every replacement lays its file through it: the read-back (1.1.b), a clash's drawing (1.5), a conflicted
          file's refresh (1.8), the refresh (`projection-worktrees`), and the replace guard's restage, which re-reads
          the record's current version after an edit it took in landed whole. `ReplaceGuardInput`
          (`lib/store/projection/replace-guard.ts`) takes the renderer in place of staging the stored content alone
          (`stageRecordFile`, `staging.ts`), and the guard's `replace` result carries the entry with the mapping the
          renderer returned.
        - Build `test-first` (one behavior at a time):
            - a read-back laying a record with an open hunk conflict draws its markers, the stamp naming the stored
              content's blob id and `written` the file's
            - an edit taken in by the replace guard's re-check, then restaged, keeps the record's markers and notice
              lines in the file the guard replaces
            - a clash's drawing over a record with open stored conflicts draws the markers of one whose span meets no
              set found in the checkout, and shows one overlapping such a set as a notice line
            - the renderer, given a line merge's result holding stored sets and a set found in the checkout, keeps each
              held set mapped to its conflict, draws an open conflict the content holds no set for, and writes no notice
              line for a closed conflict
            - two open conflicts on one span, a clash filed twice, draw the first by token as markers and show the other
              as a notice line, and in a file with no stamp record the other in its entry alone
            - an entry conflict and a hunk conflict inside its entry draw the first by token as markers and show the
              other as a notice line
            - a delete/modify clash filed twice, two spans of no lines at one point, draws the first by token as markers
              and shows the other as a notice line
            - a span of no lines inside a drawn set's lines, or at either of its ends, shows as a notice line, and so
              does a span of lines drawn after a set of no lines that sits at its start or its end
            - a drawn conflict whose side holds a setext `=======` lays every set, the held ones among them, at the
              escalated length

### `[ ]` **1.8 Keep a conflicted file refreshing — § 6.6**

- _Goal:_ A conflicted file keeps taking the store's other changes by a three-way line merge, takes a resolution made
  elsewhere when unchanged since it was written, and waits, reported, only where the store's change overlaps an open
  marker set — one function the refresh calls (`projection-worktrees`). A file holding a resolution in progress or a
  malformed set never reaches it: the replace guard holds it whole, a refused edit, until the resolution is sent or the
  set repaired (1.4.b).

    - Base: the stored version the file was rendered from, read through `history` by way of the command's memo
      (`createHistoryMemo`, `lib/store/projection/base-recovery.ts`); current: the store's newer version; incoming: the
      file, markers included, merged by `mergeLineText` whatever the kind's mechanism. Where `history` refuses
      `state-unresolvable` or `namespace-corrupt`, the file keeps its version, pending and reported, and nothing is
      pulled.
    - A marker set whose conflicts all closed elsewhere leaves when the file is unchanged since the projection wrote it;
      a closed conflict's notice line leaves at the same refresh; the merge's result is laid through the one renderer
      (1.7.c) at the length the file's sets are at, which maps the file's sets, draws a conflict the newer version files
      by 1.7's rules, and lays the file's one length over all it then shows; where the newer version holds a marker-like
      line for which 1.4.a's length grows past the file's, the file's sets are parsed at the recorded length and
      rendered again at the grown one before the merge, since a line merged in at the file's length would parse as a
      marker; an overlap keeps the file's version, pending and reported, and each later command retries.
    - Build `test-first` (one behavior at a time):
        - a change elsewhere in a conflicted file refreshes in, its markers kept
        - a conflict resolved from another checkout leaves an unchanged file's markers
        - a store change overlapping open markers keeps the file pending and reported
        - a newer version bringing a setext `=======` re-renders the markers escalated before the merge, and the merged
          file parses back
        - a `history` refusing `state-unresolvable` or `namespace-corrupt` keeps the file's version, pending, nothing
          pulled
        - a newer version filing a conflict has it drawn in the refreshed file, and a conflict closed elsewhere loses
          its notice line at the same refresh

### `[ ]` **1.9 Write back at every command's start, and report it — § 2.2, § 1.4**

- _Goal:_ Every `arc` command starts by writing back pending edits under its worktree's projection lock and ends with
  the second check, reporting each refused, skipped, deferred, withheld, or conflicted file on stderr ahead of its own
  output — and over the in-repo implementation the hooks return at once.

- _Note:_ `seedProjection` takes no protected, notice-line, or marker options and sets up no ignore rules; tests needing
  them extend it, the ignore rules as `sweep.test.ts` sets them up.

    - `[ ]` **1.9.a The engine's start and end**

        - The entry points take the command's store — in production one `createStore` builds over the checkout, in tests
          the reference backend or `createRefStore` — record that store's `capabilities.stateOffBranch` for the checkout
          root in the process state, which the work-item path reads (2.4.c), and bind the take-in (`TakeInPort`,
          `lib/store/projection/take-in-port.ts`) to write-back, under the rights of the worktree whose file holds the
          edit. Until `projection-worktrees` decides which checkouts hold a projection, a checkout holds one exactly
          when it holds an index (`readProjectionIndex`, `lib/store/projection/index-file.ts`).
        - One module in `lib/store/projection/` holds the engine's process-wide state, since `createStore` builds a new
          store at each call site: the skip verdict — set by the configuration read's no-identity verdict
          (`readProjectionConfiguration`, `lib/store/projection/configuration.ts`), by a start the lock answers `held`,
          `lost`, or `gone` (`withProjectionLock`, `lib/store/projection/lock.ts`), and by the switch (2.9) — whether
          this process holds a projection lock, the fan-out's rounds (`projection-worktrees`), the `history` memo
          (`createHistoryMemo`, `lib/store/projection/base-recovery.ts`), each checkout root's claim and effective
          `layout.active` (2.4.c), and the ports the root hook (1.9.b) binds at every command: the take-in bound to
          write-back, the rights function (2.1), adoption's mint (2.8.b), and materialization (`projection-worktrees`).
          The fan-out `projection-worktrees` builds reads it; a process whose root hook never ran — a script, or a test
          that binds nothing — fans out nothing, and each sibling refreshes at its next command.
        - The start takes the worktree's projection lock, which makes no Git call, then starts the configuration read
          (`readProjectionConfiguration`), `version()`, and the stat walk together, the personal root's walk waiting
          for the identity. With no identity or an invalid `arc.identity` it releases the lock and runs the command as
          under `--skip-projection` (2.9), reporting the remedy that sets `arc.identity`. Otherwise it sweeps the aside
          folder (`sweepAsideFolder`, `lib/store/projection/sweep.ts`) and honors the ignore verdict the sweep returns
          (`SweepResult.ignores`) through the sweep's own root test, exported for it (`writableUnder`): a root the
          guard refuses takes no write for the command, so write-back sends its edits but neither replaces nor draws
          into a file there (1.1.b), and the refusal is reported. It then writes back pending edits — re-reading the
          stats of each path the sweep linked back or replaced, since the walk began before it — and runs the refresh,
          then releases the lock; its write-backs fan out once after release.
        - The lock's outcomes (`withProjectionLock`): `held`, past its bound, runs the command as under
          `--skip-projection`, its edits pending, reporting the holder; `lost`, a lease lost while the start runs, ends
          the operation by throwing at its next step, so the start tracks its unsent edits outside the operation, runs
          the command the same way, and reports the loss, those edits pending; and `gone`, the worktree's Git directory
          missing, runs the command the same way, reporting the missing Git directory.
        - Write-back checks every projected root but `completed/` — the checkout's own work item, the personal surfaces,
          its in-flight views, and `backlog/` — and finds new files by walking those roots' folders without following
          links (`lstat`), skipping the folders `MACHINE_LOCAL_PATHS` lists; `completed/` is checked by `arc save`
          (1.10), the removal check, and the persist and release steps (`projection-worktrees`), and wherever a refresh
          touches a file (2.3). Until adoption (2.8), a new file the walk finds is left in place, unsent.
        - Refresh, fan-out, and materialization are slots `projection-worktrees` fills, inert until then; its refresh,
          fan-out, and materialization tasks retire them.
        - The rights port and adoption's mint stay unbound until 2.1 and 2.8.b bind them: an unbound rights port grants
          the edit, and an unbound mint adopts nothing.
        - _Retired in:_ Phase 2
        - The end takes each worktree's lock again for the second check (`runSecondCheck`,
          `lib/store/projection/second-check.ts`), fed the copies the start's sweep returned and every swap batch made
          (`SweepResult.copies`, `SwapBatchResult`) and each batch's removals, an empty copy kept for the next sweep;
          each copy's settlement (`settleAsideCopy`, over `deleteAsideCopy` and `finalizeAsideCopy`,
          `lib/store/projection/stampless.ts`) clears the in-progress record naming that copy once the file holds what
          the batch linked, and the copy's own record; each swap batch's second index write has already cleared the
          pending marks it settled. Then, under the same lock and after reading that worktree's index on disk, it lists
          the kept copies under `taken-in/` against that index and hands each that no entry's persisted write-back names
          to `removeTakenInCopies` (`lib/store/projection/taken-in.ts`), which removes the copies it is given, whether a
          landing released it, through the take-in port or write-back's own read-back, or a stop left it before an index
          named it; a kept copy carries no writer, and the projection lock spans process scopes, so none is in flight. A
          lease lost there skips that worktree, its copies left to the next sweep.
        - Every entry point returns at once while `capabilities.stateOffBranch` is false.
        - Build `test-first` (one behavior at a time):
            - Integration tier, over a seeded projection (`seedProjection`,
              `__tests__/helpers/store/projection/seeded-projection.ts`) and the reference backend
            - a pending edit is written back at the next command's start
            - an edit in each projected root but `completed/` is found at the start, and one in `completed/` is not
            - the walk returns a new file in a backlog folder, and nothing under an identity's `.internal/`
            - with no identity, the start runs the command with the projection off and reports the remedy, and the next
              command with `arc.identity` set writes the edit back
            - with the executor injected, the configuration read and `version()` are both issued, after the lock is
              taken, before either returns
            - a start that cannot take its lock, with the wait injected, runs the command, leaves the edit pending, and
              reports the holder, and the next command, the lock free, writes the edit back
            - a start whose lease is lost mid-write-back runs the command as under the switch, reporting the loss, its
              unsent edits pending, and the next command writes them back
            - a start whose worktree's Git directory is gone runs the command as under the switch, reporting it, and
              the next command with the directory restored writes the edit back
            - a root the ignore guard refuses has its edit sent and its file left unwritten, pending, the refusal
              reported, and the next command with the ignore line repaired replaces it
            - a save at the path of a file other than Markdown, after a write-back that landed as a fast-forward and
              before a read-back is laid there, its root refused by the ignore guard, is sent, and the person's own
              removal away from the landed change stays removed
            - an end whose lease is lost skips that worktree, and the next command's sweep takes its copies over
            - a kept copy a landing released, through the take-in port and through write-back's own read-back, and one a
              stop left before its index write, are removed at the command's end, and a copy an entry names is kept
            - a drawing's copy a failed command left is deleted by the next command's sweep as no edit, the markers kept
              whether or not the person has edited them, and no text the person removed comes back
            - a stampless file whose rebuild yielded to a recreated save is written back against the replaced version,
              keeping the store's change
            - a store built at another call site in the process reads the ports the hook bound
            - the end clears the in-progress record of a file replaced in place
            - a stale buffer's save landing in an aside copy clashes at the second check and goes back to its path,
              pending and undrawn; the next command's start draws its clash as markers, and that command's second check
              deletes the drawing's own aside copy as no edit, the markers staying
            - a resolution in progress landing in an aside copy goes back to its path at the second check with its bytes
              unchanged, reported as refused
            - a copy the sweep links back after the stat walk began is read at its new stats
            - over the in-repo implementation, the start and end touch no file and make no Git call

    - `[ ]` **1.9.b The root hooks and the report**

        - `cli.ts` registers the start as a root `preAction` hook after the dev-build guard, and the end as a root
          `postAction` hook registered after the dev-build refresh; Commander runs `postAction` hooks in reverse, so the
          end runs before the refresh. Commander skips `postAction` only when the action throws, so the end still runs
          where an action sets `process.exitCode`. The start hook runs `arc save`'s start too, in its `save` form, which
          1.10 builds and tests: every projected root written back under `save`, `completed/` included; a lock the start
          finds held, lost, or gone, or no identity, recorded in the engine's process state as the start's outcome, on
          which `arc save`'s handler refuses, the hook itself throwing nothing; a missing history ref pulled and retried
          once (2.3); and each `--resolve` conflict attached to its subject file's write. Its sweep, refresh, port
          binding, and fan-out are any start's.
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
