# Task List: Storage Ref Hardening

- **Design:** `spec-storage-ref-hardening.md`

---

## **Phase 1:** The import review

_Purpose:_ A trial import of this repository's real state and one standard review pass over the import's irreversible
stages and admission rules, before any code changes, so their findings size the rest of the plan.

_Mode:_ `slice` — closes on the import exercised end to end as a trial over this repository's real state, with every
finding it and the review raise given a home.

_Exit criterion:_ A `--trial` import of this repository's real state ran in a disposable copy and returned its report,
and, while the review mapping was unbound, so did one with the copy's review-gate sources set aside; every trial
refusal, blocking notice, review finding, and held-out observation no finding matched is recorded with a disposition: a
reachable code defect as a subtask of 5.9 or folded into the task that already fixes its cause, an unreachable one in
the spec's § Non-Goals by amendment, a correct refusal of this repository's state as a state fault for 5.11, and an
unmapped review source as cleared by the review mapping's binding.

### `[ ]` **1.1 Run a trial import of this repository's state in a disposable copy — § 11.1**

- _Goal:_ The import's transform runs over every ref and personal directory this repository holds, and the report it
  returns, blocked or not, is kept as the review's evidence.

    - Check `memcap_policy` before starting: a real-state trial reads every registered checkout's personal directory,
      and the batch path check, whose cost grows with the square of the batch until 5.7, runs before the blocking
      check. When blocked, stop and ask. When allowed, run through the gate at reduced priority in one command, since
      `memcap_gated` and `nicecap` are shell functions and neither can launch the other:
      `. ~/.memcap.sh && memcap_gated -m <cap> nice -n 15 taskset -c 0-<N> node …`, with `<N>` leaving six logical
      CPUs free, as `nicecap` does.
    - Build this branch's CLI here (`npm run build:fast`); the trial runs it by path, with the copy as its working
      directory: `node <this checkout>/packages/arc-framework/bin/arc.js store migrate --import --trial --json`.
      `npx arc` in the copy would run the copy's own package. A trial writes objects, locks, and gathering refs only
      inside the copy and deletes the gathering refs (`landImportRefs`); it never lands state refs, publishes, or cleans
      up transient sources.
    - Right before the copy, and only on approval, save notes with that built CLI,
      `node <this checkout>/packages/arc-framework/bin/arc.js user save`, run from each registered checkout whose
      work-unit files the import reads, root files saving from any one, so the copy's disk and notes copies agree; copy
      in the same step. The command saves only the configured identity. The trial reads each checkout's personal
      directory live, so from the save until both trials have read them, no session writes a personal file in any
      registered checkout. A state fault may still block a trial, which 1.2 covers.
    - Copy the primary checkout with its Git directory to `~/dev/arc-evidence/storage-ref-hardening/import-trial/`, then
      clear the copy's `.git/arc/locks/`: a copied lock whose process is alive cannot be broken. A file copy carries
      the notes refs, `refs/arc/user/*`, and local branches, and the import reads the linked worktrees' personal
      directories in place, read-only, through the copy's `git worktree list`. A clone carries none of them, so its
      trial never reaches the personal or transient stages.
    - Keep the report beside the copy and record whether the trial was blocked. A trial returns `status: "ok"` either
      way and carries no blocked marker: it was blocked when `refused` is non-empty or it holds any notice other than
      an Errand origin that changed (`import/transient.ts:118`), a skipped derived capture (`code-captures.ts`), or the
      identity mint (`entry.ts:40`). A blocked trial returns before `buildImportCommits` and `landImportRefs` run.
    - While this branch lacks the review family's import mapping (spec § 11.1), each review-gate source but
      `arc/review-gate/identity/repository-identity.json` raises an unmapped-source notice, so the trial is blocked.
      Then move the copy's other review-gate sources aside and run the trial again, so the commit build and gathering
      refs can run over the rest of real state; any other blocking notice still blocks it. Keep both reports.

### `[ ]` **1.2 Review the import's landing, publication, cleanup, and admission rules — § 11.1**

- _Goal:_ A non-author evaluator has reviewed the stages that write history and cannot be undone, and the transform's
  admission rules, against the standard rubric with the trial report as evidence, and returned source-grounded
  findings.

- _Approach:_ ARC's review verbs bind an exact change set, and this scope is unchanged code, so the pass runs as a
  fresh-context adversarial review that applies `standard-review/v1`'s rubric — the `implementation-audit` lens, every
  dimension — to a named source scope. Its result is advisory evidence, not an attested review.

    - Scope: landing (`landImport`, `buildImportCommits`, `landImportRefs`); publication with transient cleanup
      (`publishImport`, `retireImportLocals`, `retireImportRemote`, `retireOriginRefs`, `dropKeptTips`); and the
      transform's admission rules. Those are what refuses — every writer of `report.refused`: `reportImportAdmission`,
      `reportBranchRefusal`, and the direct writers in `build.ts`, `parked-source.ts`, `review-mapping.ts`, and
      `session-context.ts` — and the rule in `entry.ts` that any notice raised before the blocking check blocks the
      landing. They also cover what imports verbatim (review candidates, integration boundaries, task lists, a broken
      Candidate chain through `inspectCandidateChain`) and what is skipped with a notice.
    - Evidence: 1.1's reports. A stage no trial ran is reviewed from source: the destination landing, publication, and
      transient cleanup always, and the commit build and gathering refs when every trial was blocked.
    - The first-pass context carries no author conclusion: leave out the spec's known import defects, the observations
      in `notes-storage-ref-hardening.md` § Held out of the import review's first pass, and any suspected weak spot,
      and match findings against them afterward.
    - Keep the prompt and the verbatim report under `~/dev/arc-evidence/storage-ref-hardening/import-review/`.

### `[ ]` **1.3 Give every import finding a home in the plan — § 11.1**

- _Goal:_ Every trial refusal, blocking notice, review finding, and held-out observation no finding matched is verified
  against source and dispositioned, so no import finding is deferred to later work: a code defect an import of this
  repository's state can reach is fixed by a subtask of 5.9 or by the task that already fixes its cause, one it cannot
  reach is recorded in the spec's § Non-Goals, a correct refusal of this repository's state is a state fault that 5.11
  repairs, and an unmapped review source waits for the review mapping's binding.

    - Verify each finding against source, then present the complete disposition set for approval before any plan or
      spec write.
    - Reachable: one subtask of 5.9 per finding or shared cause, each with its failing-first case. A finding that
      repeats a known defect folds into that defect's task in Phase 5, and one that matches an observation
      `notes-storage-ref-hardening.md` § Held out of the import review's first pass names folds into its task there.
      Each held-out observation no finding matched takes a disposition too: a reachable one its task there or a subtask
      of 5.9, an unreachable one a § Non-Goals amendment.
    - Already fixed by a task of this plan: a finding whose cause a task of Phases 3, 4, 6, or 7 already changes folds
      into it with its failing-first case — for example 3.7 (the migration fetch under source retirement), 3.8 (the
      publication journal), 4.2.b (publication's designation question), 6.2.b (`withMigrationLock`'s raw Git ref lock
      error at landing), or 4.3.a, 6.4, and 7.3 on the push path `publishImport` takes.
    - Every fold, under this bullet or the one above, adds to the task it folds into a line recording its fix's SHA
      under `notes-storage-ref-hardening.md` § Import review fixes as it lands. A fold into a Phase 6 task also adds a
      parent `6.R` ahead of 6.10 that checks the fix as 5.10 does, and a fold into a Phase 7 task a parent `7.R` at the
      end of Phase 7 that does the same.
    - Cleared by another change: each unmapped review-source notice, which the review family's import mapping clears
      once bound. Record them once under `notes-storage-ref-hardening.md` § Import state faults as cleared by that
      binding; they take no repair.
    - Unreachable: append `Amended YYYY-MM-DD — <delta> — <prompt>` to the spec's § Non-Goals naming the finding and why
      this repository's state cannot reach it.
    - State fault: a refusal or blocking notice the code raises correctly about this repository's state — personal
      copies that differ between checkouts, a missing or diverged branch, a paused work unit. Record it with its
      condition, its remedy, and the state it names, under `notes-storage-ref-hardening.md` § Import state faults; the
      code is unchanged.
    - A fault in a read-only transform module that the trial surfaced is in scope; § Non-Goals excludes only a full
      review of those modules.

### `[ ]` **1.4 Confirm the trial ran and every finding has a home** — validate exit criterion at segment scope

- _Goal:_ Each trial's report is on disk beside its copy with its blocked status recorded, the set-aside trial's
  included while the review mapping was unbound, and the approved disposition set accounts for every trial refusal,
  blocking notice, review finding, and held-out observation no finding matched, each now a subtask of 5.9, a fold into
  the task that fixes it, a § Non-Goals amendment, a recorded state fault, or an unmapped review source the mapping's
  binding clears.

    - Run `npx arc check segment`.

## **Phase 2:** One fault classification

_Purpose:_ The metadata read keeps what is wrong with an object, a `missing` point-read answer is resolved by its
containing tree, and one helper maps each fault to its refusal, diagnostic, and remedy, so every site in Phase 3
moves onto one settled classification.

_Mode:_ `layer` — closes on the settled classification every fault site calls.

_Exit criterion:_ The metadata read, the containing-tree resolution, and the fault helper each have cases for the
§ 1.1 rows they produce and for the historical rule, and capture diagnostics carry their fault internally with the
listing schemas and output unchanged.

### `[ ]` **2.1 The metadata read keeps absent, missing, unparseable, and parsed apart — § 1.2**

- _Goal:_ A metadata read tells an absent entry, a missing object, an unparseable object, and parsed metadata apart, so
  a caller classifies the fault instead of receiving one `null` for all of them.

    - A discriminated read beside `parseRefMetadata` in `lib/store/ref/metadata.ts` takes the tree entry, or its
      absence, and the batch's object map. Today a dozen callers pass `null` for an absent entry, the value
      `readBatchObjects` gives a missing object, so the read takes the entry rather than the looked-up object. A
      `<tip>:<path>` site holds no entry, only the object its query looked up, keyed by the query string
      (`batch-read.ts`), so the read also takes a looked-up object that is present, which reads as unparseable or parsed
      (2.2). `parseRefMetadata` stays as the null-returning form for the sites that tolerate both.
    - An absent entry is the caller's to classify: **No metadata** in a tree holding records, a fresh start or a skip
      elsewhere.
    - Metadata with no slug on a work or cohort ref, live or history, is unparseable, as `parseRefMetadata`'s namespace
      test (`metadata.ts`) treats it today.
    - Build `test-first` (one behavior at a time):
        - an absent entry reads as absent
        - an entry whose object the batch answered `missing` reads as missing
        - a present blob that is not canonical metadata JSON reads as unparseable
        - a present tree or commit where a blob is expected reads as unparseable
        - metadata with no slug reads as unparseable on a live work or cohort ref and on its history ref
        - valid metadata reads as parsed, equal to `parseRefMetadata`'s result
        - a present object looked up by `<tip>:<path>` reads as unparseable or parsed, as an entry's object does

### `[ ]` **2.2 A `missing` point-read answer is resolved by its containing tree — § 1.3**

- _Goal:_ A site that refuses or reports on a `missing` `<tip>:<path>` answer tells an absent entry from an entry
  whose object is absent, with one tree read only after the `missing` answer.

    - Generalize `refRecordAbsence`'s tree read (`lib/store/ref/record-absence.ts`) into a resolution the § 1.3 sites
      share; a present answer costs no extra read.
    - The `<tip>:<path>` metadata sites that refuse or report (`read.ts`, `read-uid.ts`, `lineage-resolution.ts`,
      `live-owners.ts`, `sync-withdraw-sibling-ends.ts`) hold a looked-up answer, not a tree entry. A present answer
      goes to 2.1's read in its looked-up form; a `missing` answer goes to this resolution, whose present entry is
      **Missing** and whose absent entry takes the site's own rule. `retiredHistoryHome`'s revision scan
      (`retired-history.ts`) tolerates a `missing` answer and keeps skipping that revision (spec § 1.3).
    - Build `test-first` (one behavior at a time):
        - an entry present in its tree whose object is absent resolves to **Missing**
        - an entry absent from its tree resolves to absent, for the caller's own rule
        - a containing tree that is itself absent resolves to **Missing**
        - a present first answer issues no tree read

### `[ ]` **2.3 One fault helper maps a fault to its refusal, diagnostic, and remedy — § 1.1, § 1.4, § 1.6**

- _Goal:_ Every site can turn a § 1.1 fault into its point refusal, listing diagnostic, pull notice condition, or push
  failure condition through one helper, whether it read by `tip:path` or by object ID, with the historical remedy for
  history commits and saved states.

    - `[ ]` **2.3.a The fault rows and their remedies**
        - **Missing** → recoverable `state-unresolvable` with the restore-or-fetch remedy; **Unparseable** and **No
          metadata** → terminal `namespace-corrupt` with the forward repair at a current tip and the historical remedy
          at a history commit or saved state; **Misplaced** → terminal `namespace-corrupt` carrying a placement
          condition the caller supplies; **Local transport fault** → the per-remote failure `refused` with the restore
          or remote-URL repair remedy.
        - Composes `corruptRef`, `recordDiagnostic`, `unreadableRef`, `unavailableRefHistory`,
          `isUnavailableGraphFailure`, `missingChangeState`, `metadataFailure`, `historicalMetadataFailure`, and
          `unparsedMetadata`; adds no refusal code, notice kind, failure kind, or schema.
        - Each row has a default condition and remedy. A builder that already gives the **Missing** row's code, class,
          and remedy passes its own text and keeps it (§ 1.4).
        - `corruptRef` keeps its missing-objects arm until 3.9 removes it, so callers move over batch by batch.
        - Build `test-first` (one behavior at a time): each row's refusal, diagnostic, and default remedy; a builder's
          own **Missing** text kept; each of **Unparseable** and **No metadata** at a current tip and at a history
          commit or saved state.

    - `[ ]` **2.3.b `historyRefs` names a history ref only for an item with no live ref**
        - The **Missing** row takes whether the clone's current state holds the item's live ref. A caller reads it from
          its operation's current tips (inside a pull, the local snapshot the pull captured), or with one ref read on
          the refusal path when it holds only saved tips, so a successful read costs nothing more.
        - A graph walk passes `readHistoricalGraph` a builder it calls only when the walk fails, rather than a refusal
          built before the walk, so the live-ref read happens on the refusal path alone.
        - A refusal for an item whose live ref the current state holds carries empty `historyRefs` and the restore
          remedy; for an item with no live ref it names that item's history ref, so the automatic history pulls fetch
          only where retained history can hold the object.
        - Build `test-first` (one behavior at a time): a live item with a missing nested tree; an ended item with no
          live ref; a saved read of an item that is live now; a project or personal ref, which has no history ref.

### `[ ]` **2.4 Capture diagnostics carry their fault — § 1.9**

- _Goal:_ A capture diagnostic carries its § 1.1 fault beside its condition and remedy, internally, so every site that
  turns a diagnostic into a refusal or notice takes that fault's row while a listing still shows **Missing** and
  **Unparseable** as `unreadable`.

    - The fault rides an internal diagnostic type that extends `ListingDiagnostic`, and the listing drops it where it
      assembles its output, so `ListingDiagnosticSchema`'s strict shape and a listing's output are unchanged.
    - A diagnostic with no § 1.1 fault — ambiguous owner metadata, a `key-mismatch`, an entry outside an owner folder, a
      malformed owner UID — carries none and keeps its own condition and remedy.
    - Build `test-first` (one behavior at a time):
        - a missing record blob's capture diagnostic carries **Missing**
        - a malformed metadata blob's carries **Unparseable**
        - a `key-mismatch` diagnostic carries no fault
        - a listing's output carries no fault field and parses under `ListingOutcomeSchema`

## **Phase 3:** Every fault site classifies

_Purpose:_ Every site the § 1.4 search finds that refuses, reports, or holds on an object fault moves onto the helper,
batched by store family, so no missing object is reported as unparseable state and no misplaced folder as missing
metadata.

_Mode:_ `replication` — closes when the swept fault-site inventory is exhausted and batch-verified.

_Exit criterion:_ A re-run of the § 1.4 search finds no site that refuses, reports, or holds on an object fault outside
the helper and the inventory's tolerated, unchanged, and invariant sites, and `corruptRef` has no missing-objects arm;
every behavior case Phase 3 lists passes in a `store-ref-*` suite or a unit test.

_Design decisions:_ `notes-storage-ref-hardening.md` § Fault-site inventory — every site, its row, its side, and the
classification calls the sweep settled.

### `[ ]` **3.1 Point reads, listings, and lookups — § 1.3, § 1.6, § 1.9**

- _Goal:_ A point read, listing, or owner lookup that meets a missing object refuses recoverably or lists it with the
  restore remedy, and one that meets unparseable or absent metadata keeps its terminal refusal with its side's remedy.

- _Note:_ See `notes-storage-ref-hardening.md` § Fault-site inventory › 3.1 and § Classification calls the sweep settled
  for its sites, their rows and sides.

    - `[ ]` **3.1.a The shared tip check and record point reads**
        - `checkRefTip`, which history, changes, pull, and push all run first, classifies a missing tip or tree as
          **Missing** and its metadata entry through 2.1, with the historical remedy when `saved` is set.
        - `readBoundRecord` and `readUidRefRecord` resolve a `missing` metadata answer through 2.2's resolution;
          `refRecordAbsence`'s missing tree and `readArchivedRecord`'s quarter trees take the helper, and the builders
          that already give the **Missing** row call it.
        - Build `test-first` (one behavior at a time):
            - a tip check of a ref whose nested tree is missing refuses **Missing**; unparseable tip metadata keeps the
              forward repair, and the historical remedy when `saved` is set
            - a read whose metadata entry is present with its blob removed refuses **Missing**
            - once that blob is restored, the same read succeeds
            - a read of a tree holding records with no metadata entry refuses **No metadata** with the forward repair
            - a record-free tree with no metadata still answers `not-found`
            - a read whose record tree is missing refuses **Missing** through `refRecordAbsence`
            - an archived read whose quarter tree is missing refuses **Missing**

    - `[ ]` **3.1.b Listings**
        - The listing decoders in `read.ts` and `archive-view.ts` take § 1.2's read; `recordDiagnostic` gives a current
          listing's unavailable record blob the restore remedy.
        - Build `test-first` (one behavior at a time):
            - a live listing lists a missing metadata blob as `unreadable` with the restore remedy
            - a live listing lists unparseable metadata as `unreadable` with the forward repair, a saved listing with
              the historical remedy
            - a current listing lists a missing record blob with the restore remedy
            - the listing's output shape is unchanged

    - `[ ]` **3.1.c Owner and project lookups**
        - `readLineageOwners`, `readLiveRefOwners`, `decodeLookupCapture`, the project-identity reads with their
          callers, `checkRefDesignationProject`'s incoming arm, and `resolveArchivedReferences` with
          `archivedHistoryBatches`.
        - Build `test-first` (one behavior at a time):
            - a lineage or live-owner lookup whose metadata entry is present with its blob removed refuses **Missing**,
              and one whose entry is absent refuses **No metadata**; a saved read takes the historical remedy
            - a lookup whose tip or tree is missing refuses **Missing**
            - a missing project identity blob or registry tree refuses **Missing**; an unparseable identity keeps
              `record-malformed`
            - the designation check's incoming refusal keeps its condition, led by the candidate registry's commit and
              remote; a missing candidate object takes the restore remedy or a `git fetch --refetch` of
              `refs/arc/project/registry` from the target the check fetched from, a backing candidate's URL included,
              with `--git-dir` where the layout is separate, and an unparseable identity the remote's registry repair,
              never the local registry's
            - running the rendered `git fetch --refetch` for a missing candidate object, then retrying, completes the
              designation
            - an archived reference whose history tip is not a commit refuses **Missing**, naming the history ref

### `[ ]` **3.2 Archived folders: placement faults, record keys, and their converters — § 1.5, § 1.6, § 1.9**

- _Goal:_ A misplaced archive folder reports a placement fault with a remedy that names its placement, an archived
  record diagnostic names its archive and full path, and every site that turns an archive diagnostic into a refusal or
  notice takes the diagnostic's fault row.

- _Note:_ See `notes-storage-ref-hardening.md` § Fault-site inventory › 3.2 and § Classification calls the sweep settled
  for its sites, their rows and sides.

    - `[ ]` **3.2.a The decoder and its keys**
        - `decodeArchiveFolderControls` reports § 1.5's three `folderPlacement` conditions as `malformed` diagnostics
          with `rule: "placement"`, keyed `${ref}:${root}`, with the current or saved remedy and the **Misplaced**
          fault. A cohort folder with no closeout letter stays a `key-mismatch`. `decodeArchiveFolder`'s metadata takes
          § 1.2's read.
        - An archived record diagnostic is keyed `${ref}:${root}${path}` at the `archive-view.ts` and `read.ts` sites,
          not inside `decodeCapturedRef`, and its remedy names that key.
        - Build `test-first` (one behavior at a time):
            - each placement condition yields its § 1.5 condition and current remedy, and the saved remedy on a saved
              capture
            - a sequence prefix `ArchiveSequenceSchema` rejects reaches the sequence condition; any other bad folder
              name stays a `key-mismatch`
            - a record-role work item's folder reaches only the first two conditions
            - an archived record diagnostic's key and remedy name `${ref}:${root}${path}`, and the key's first segment
              is the ref

    - `[ ]` **3.2.b The converters**
        - Each converter the inventory lists takes the diagnostic's fault row through the helper, and a diagnostic with
          no § 1.1 fault keeps its own text and terminal refusal. `mergeArchiveTree` decodes its base with `saved` set.
        - `completeSyncPlacements` reports the owned faulty folder's diagnostic when no folder supplies a side's
          placement, and `mergeGroupTree`, `readSyncRecordPlacement`, and `conflictValue` take its row; with no owned
          fault each keeps today's refusal.
        - Build `test-first` (one behavior at a time), one case per converter over a shared planted archive:
            - a missing folder metadata blob refuses **Missing** on an archived read and a write, and a pull holds its
              ref with the restore remedy
            - a misplaced folder refuses or holds with its placement condition and remedy
            - the archive merge's base takes the saved remedy, its `local` and `incoming` sides the current one
            - a pull merge of an item whose folder is misplaced holds the item ref with the placement row, not an
              unparseable-metadata condition
            - a `key-mismatch` keeps its condition and remedy

### `[ ]` **3.3 Writes and their views — § 1.4, § 1.9**

- _Goal:_ A write or check view that meets a missing object refuses recoverably with the restore remedy, never as
  unparseable state, a version conflict, or an archive-control mismatch, while unparseable or absent metadata keeps its
  terminal refusal.

- _Note:_ See `notes-storage-ref-hardening.md` § Fault-site inventory › 3.3 and § Classification calls the sweep settled
  for its sites, their rows and sides.

    - `[ ]` **3.3.a The write path**
        - `readWriteGroups` with `capturedGroupMetadata`, `staleMutation`, `checkRecord`, the archive quarter reads,
          `planRefRetirements`, and `checkRefHistoryDestinations`, whose other Git failures keep today's condition and
          remedy, built in place rather than through `corruptRef`.
        - A present metadata entry whose blob is missing refuses **Missing** in a record-free tree too; an absent entry
          or unparseable metadata there still starts fresh metadata, as today.
        - `copyArchiveEntries` reads its own metadata through 2.1 and classifies a fault through the helper ahead of
          `archiveOutputControlRefusal`. That blob was staged by the same batch, so no public input reaches the fault
          arm and it has no failing-first case.
        - Build `test-first` (one behavior at a time):
            - a write whose target tree is missing refuses **Missing**, naming the history ref only for a target with
              no live ref
            - a write whose metadata blob is missing refuses **Missing**, in a tree holding records and in a record-free
              one; unparseable metadata keeps the forward repair in a tree holding records and starts fresh in a
              record-free one
            - once that blob is restored, the same write succeeds
            - a write to a record-free ref with no metadata entry still starts fresh metadata
            - a create-only put whose prior record blob is missing refuses **Missing**, not `version-conflict`
            - an archive write whose quarter tree is missing refuses **Missing**; an owner mismatch keeps
              `record-malformed`
            - a retirement whose registry tree is missing refuses **Missing**
            - a history-destination check that Git fails on a missing object refuses **Missing**; any other Git failure
              stays terminal, naming Git's message

    - `[ ]` **3.3.b The views**
        - `viewRefMetadata` takes § 1.2's read for its callers in `write-views.ts` and `cohort-coordinates.ts`;
          `readViewRecord` calls the helper.
        - Build `test-first` (one behavior at a time):
            - a check view's missing metadata blob refuses **Missing**, and an absent entry in a tree holding records
              refuses **No metadata** with the forward repair
            - a saved read's unparseable metadata takes the historical remedy
            - a record-free tree still answers `not-found`
            - a cohort parent whose metadata blob is missing refuses **Missing**

### `[ ]` **3.4 History and changes — § 1.6, § 1.9**

- _Goal:_ `history` and `changes` refuse a missing object recoverably, naming a history ref only for an item with no
  live ref, and never let one escape as a raw Git error; unparseable or absent metadata at a history commit or saved
  state keeps the historical remedy.

- _Note:_ See `notes-storage-ref-hardening.md` § Fault-site inventory › 3.4 and § Classification calls the sweep settled
  for its sites, their rows and sides.

    - `[ ]` **3.4.a The builders and history**
        - `unavailableRefHistory`, `unavailableHistory`, and `missingChangeState` become the helper's **Missing** row,
          reading the clone's current tips; `missingChangeState`'s coordinate gaps keep their semantics.
        - `captureHistoricalNamespaces` takes 2.1's read and reports a present entry whose blob is missing in a new
          `missing` set, a record-free revision in `recordFree` as well. History, the change window, and the pull label
          walk refuse **Missing** on a `missing` revision whose tree holds records, where today's `corrupt` arm refuses,
          and keep treating a record-free one as record-free: their answer there is no record, which needs no metadata
          (`historicalState`, `versionAt`). `retiredHistoryHome`'s fallback refuses any `missing` revision, since its
          revision scan skipped a missing blob that may hold the slug. `readHistorySnapshots`, `historicalState`,
          `stateMetadata`, `readRefHistoryDetails`, and `indexHistoryBatches` classify the rest.
        - Build `test-first` (one behavior at a time):
            - a history read of a live item whose nested tree is missing refuses **Missing** with empty `historyRefs`;
              for an ended item it names the history ref
            - a history revision whose metadata blob is missing refuses **Missing** where its tree holds records, and
              reads as record-free where it holds none
            - unparseable metadata at a history revision refuses with the historical remedy
            - `retiredHistoryHome` refuses a missing blob **Missing**, a record-free revision's included; its
              unparseable refusal takes the forward repair, since it fires only when no revision, the tip included,
              yields a slug
            - `retiredHistoryHome`'s revision scan skips a revision whose metadata blob is missing and resolves the home
              from an older revision's slug
            - a changes coordinate gap keeps today's refusal and `historyRefs`

    - `[ ]` **3.4.b Changes**
        - `captureChangeWindow`, `checkWindowTips`, `changeNamespaceFacts`, the end and record reads in
          `changes-ends.ts` and `changeWindowReferences`, the restricted paths in `changes-scope.ts`, and the commit
          reads, walks, and `retirementCommit`'s ancestry check in `changes-lifecycle.ts`. `originEndBefore`'s operands
          come from the history it already walked, so its check stays as it is.
        - Build `test-first` (one behavior at a time):
            - a change window whose revision tree is missing refuses **Missing**
            - a window revision whose metadata blob is missing refuses **Missing** where its tree holds records, and
              reads as record-free where it holds none
            - a window endpoint with unparseable metadata refuses with the historical remedy
            - a missing `lineage/conflict-record` blob refuses **Missing**, not as a path that does not decode
            - a name-restricted and a lineage-restricted comparison over a manifest tip this clone lacks each refuse
              **Missing**, recoverably
            - an object missing from the lower bound's ancestry, which the walk did not read, makes
              `retirementCommit`'s ancestry check refuse **Missing** instead of throwing

### `[ ]` **3.5 Pull merges, tip checks, fetch checks, and push exclusion — § 1.7, § 1.9**

- _Goal:_ A pull holds a ref that has a missing object with the restore remedy, a push excludes it with a `refused`
  failure carrying that remedy, and a merge base's unparseable metadata takes the historical remedy while its tips take
  the forward repair.

- _Note:_ See `notes-storage-ref-hardening.md` § Fault-site inventory › 3.5 and § Classification calls the sweep settled
  for its sites, their rows and sides.

    - `[ ]` **3.5.a Tip checks and push exclusion**
        - `checkSyncRefTip` over 3.1.a's `checkRefTip`, and `excludeBrokenPushRefs`' tip checks and batch walk.
        - Build `test-first` (one behavior at a time):
            - a pull of a ref whose tip tree is missing holds it with a `namespace-corrupt` notice carrying the
              **Missing** row's condition and remedy
            - once that tree is restored, the same pull completes with no notice for the ref
            - a pull of a ref with unparseable tip metadata holds it with the forward repair, as today
            - a push excludes a ref whose metadata blob is missing with a `refused` failure carrying the restore
              remedy, and publishes the rest
            - once that blob is restored, the same push publishes the ref

    - `[ ]` **3.5.b The merges' side reads**
        - `groupSides` through `sideMetadata` and `metadataAt`, `indexRecords`, `readableSyncReference`,
          `mergeRefSets`, `mergeCapturedSyncRef`, `prepareSyncHistoryFastForward`, `captureSyncRecordHistory`, and
          `versionAt`.
        - Build `test-first` (one behavior at a time):
            - a merge base with unparseable metadata holds with the historical remedy, a `local` or `incoming` side with
              the forward repair
            - a merge side whose metadata blob is missing holds **Missing**
            - an undecodable record on the base side holds with the historical remedy
            - a merged record whose blob is missing holds **Missing**, with no forward-repair remedy
            - a merge whose graph or endpoint is unavailable holds **Missing**
            - a label-walk revision whose metadata blob is missing takes **Missing** where its tree holds records, and a
              record-free one stays record-free, as today

    - `[ ]` **3.5.c Lifecycle holds and fetch checks**
        - The lifecycle walks in `sync-corrupt.ts`, `sync-lifecycle-holds.ts`, and `sync-batches.ts`;
          `incomingLineageHolds`; `observeTerminalEndedTwice` and `observeOwnerEnds`; and `unavailableFetchGraphNotice`
          with its callers.
        - Build `test-first` (one behavior at a time):
            - a lifecycle walk that meets a missing commit holds **Missing**
            - `observeTerminalEndedTwice` holds **Missing** for a present lineage record whose blob is missing, and
              skips an owner with no record
            - a fetch check whose graph lacks an object raises its notice with the **Missing** row

### `[ ]` **3.6 The withdrawal — § 1.3, § 1.9, § 9**

- _Goal:_ A withdrawal that meets a faulty object holds its ref with the notice its fault prescribes, never rejecting
  the pull or push with an untyped exception, and each side's unparseable metadata takes the remedy its snapshot can
  take.

- _Note:_ See `notes-storage-ref-hardening.md` § Fault-site inventory › 3.6 and § Classification calls the sweep settled
  for its sites, their rows and sides.

    - `[ ]` **3.6.a The journal's fault and its hold**
        - `UnavailableWithdrawJournal` carries its fault; `heldWithdrawal` and `commitWithdrawEnd` take it; the journal
          reads and `readLineageMessage` classify.
        - Build `test-first` (one behavior at a time):
            - a missing journal tree holds **Missing**, naming the end's history ref
            - an undecodable preserved-lineage record holds **Unparseable**
            - a throw that names no fault keeps its condition with the restore remedy
            - `readLineageMessage` holds **Missing** only for a confirmed missing object

    - `[ ]` **3.6.b The inverse's metadata**
        - `inverseMetadata` reads through § 1.2 (§ 9); `withdrawRecordMetadata` takes the side `entryDocument`,
          `sameWithdrawRecord`, and `selectedWithdrawFormat` pass; `retainSelectedFormats` and `repairWithdrawnLineage`
          take their side from the metadata entry's object ID. `preserveInverseConflicts` throws the fault instead of a
          raw error, though no input reaches it: a conflict exists only once `entryDocument` parsed the current
          metadata, and the inverse never replaces that entry, so it has no failing-first case.
        - Build `test-first` (one behavior at a time):
            - non-JSON metadata on a withdrawal journal ref holds the ref instead of rejecting the pull
            - unparseable `before`, `after`, or ancestor metadata holds with the historical remedy; unparseable current
              or published metadata with the forward repair
            - at `retainSelectedFormats`, a restored `before` metadata entry that does not parse holds with the
              historical remedy, in a fixture where neither the current tip nor the journal's `after` has a metadata
              entry; the current tip's holds with the forward repair

    - `[ ]` **3.6.c Ends and lineage**
        - `readItemEndCandidates` returns its faulted commits under `"all"`; `currentEndCandidates`, `terminalOwner`,
          `siblingFolders`, `laterSiblingEnds`, the preserved-lineage reads, and `entryLabel` classify.
        - Build `test-first` (one behavior at a time):
            - a folder end whose metadata blob is missing holds **Missing**, before the published-folder exemption
            - undecodable end metadata holds **Unparseable** with the historical remedy, an end at the ref's tip
              included
            - a fault at another batch is no end, as today
            - a `"retirement"` reader sees no change
            - a misplaced sibling folder holds with its placement remedy

### `[ ]` **3.7 A missing local object after a failed fetch is a local transport fault — § 1.6**

- _Goal:_ A fetch that fails because a local ref or worktree `HEAD` has no tip object, or because a later step of the
  fetch reads a missing commit in local history, reports a per-remote `refused` failure naming that ref or commit with
  the restore remedy, not an unreachable remote; a remote that cannot send an object stays an unreachable remote unless
  the clone also lacks a commit the fetch read, which is reported first.

- _Note:_ `pull.ts` is shared with another unit's change; see `notes-storage-ref-hardening.md` § Coordination with
  `store-operation-git-access`. The helper's Git observations and settled calls are in `notes-storage-ref-hardening.md`
  § Fault-site inventory › 3.7.

    - One helper, run after a completed Git failure with no porcelain rows, checks every ref (`for-each-ref` with no
      pattern) and every worktree's `HEAD` (`worktree list --porcelain`) through one `cat-file --batch-check`. It skips
      a `HEAD` listed as the null object ID, a worktree on an unborn branch. A missing tip names its ref.
    - When every tip is present, the helper takes the object IDs the failure's stderr names, by
      `isUnavailableGraphFailure`'s match (`history-graph.ts`), factored to take that stderr, and confirms them by one
      local-only commit walk, `rev-list --missing=print --all` without `--objects`. A named commit the walk lists, such
      as an ancestor the forced-update check read, names the commit, and the failure's condition keeps the fetch's
      stderr. Message text never classifies alone.
    - It runs where `pullRemote` meets the state fetch's and the history fetch's failures, and in `runMigrationFetch`
      and `runProjectFetch`. `pullRemote` sees only the fetch's outcome, so `parseFetchPorcelain` (`lib/git/fetch.ts`)
      marks whether its rowless `unreachable` outcome came from a completed failure, and the helper runs on that mark;
      the other two sites hold the error. `failedRemotePull`, which also reports timeouts as `unreachable`, takes the
      failure code from its caller.
    - Build `test-first` (one behavior at a time):
        - a pull whose state ref under a negotiation pattern has no tip object fails `refused`, naming the ref, with
          the restore remedy
        - the same for a code branch, a `refs/arc/tmp/*` ref, and a linked worktree's detached `HEAD`
        - a migration fetch and a project check each report the same
        - a pull whose state ref's tip parent is missing, while the remote has new commits for that ref, fails
          `refused`, naming the commit, with the restore remedy; once the commit is restored, the same pull succeeds
        - a pull from a remote that rewinds a state ref onto a commit the clone has lost and builds on it fails
          `refused`, naming the commit, though no forced-update failure appears in its stderr
        - a fetch from a remote that lacks an object it must send, every local tip present, keeps today's `unreachable`
          classification and text
        - the same failure beside a clone that lacks a commit the fetch read fails `refused`, naming that commit, and its
          condition keeps the remote's failure; the same for a lost grandparent of a store ref and for a code branch's
          lost commit the fetch names
        - a completed failure with every local tip present and no confirmed missing object keeps today's `unreachable`
          classification and text
        - an unreachable remote beside a worktree on an unborn branch stays `unreachable`
        - a fetch the deadline cancels never runs the check

### `[ ]` **3.8 The import's publication journal reports its faults — § 1.4**

- _Goal:_ Source retirement reports a missing or unparseable publication journal as its own condition and remedy, not
  an untyped exception.

- _Note:_ `import/transient-publication.ts` is shared with another unit's change; see `notes-storage-ref-hardening.md`
  § Coordination with `store-operation-git-access`. Its sites are in `notes-storage-ref-hardening.md` § Fault-site
  inventory › 3.8.

    - `unpublishedImportClaims` returns its `{condition, remedy}` pair for a missing blob tip and for one that does not
      parse, as it does for an absent ref.
    - Build `test-first` (one behavior at a time): a missing journal blob, and one that does not parse, each reach the
      import's report as a cleanup refusal with the restore remedy.

### `[ ]` **3.9 The readers whose behavior changes, and `corruptRef` without a missing arm — § 1.4, § 1.8**

- _Goal:_ Every reader that branches on a changed code, notice kind, failure code, pull status, or refusal class
  behaves as § 1.8's table states, and no caller can report a missing object through `corruptRef`.

- _Note:_ See `notes-storage-ref-hardening.md` § Fault-site inventory › 3.9 and § Classification calls the sweep settled
  for its sites, their rows and sides.

    - `[ ]` **3.9.a The readers that change**
        - `unavailableSnapshot` (`snapshot-read.ts`) converts no code: its point-read wrapper adds the snapshot's
          `stateVersion` to a `state-unresolvable` that has none and keeps the producer's `historyRefs`, and its
          listing refusal names a history ref only for an item with no live ref (§ 1.6). `followCleanupFailure`
          (`follow-delete.ts`) rethrows a wrapped `state-unresolvable`.
        - Its cases land in a `store-ref-*` suite or a unit test, never the CI-only integration tier, where
          `recovery-state-basis.test.ts` sits.
        - Build `test-first` (one behavior at a time), one case per § 1.8 row:
            - a saved read of an ended item whose archive tree is unavailable returns `state-unresolvable` with the
              snapshot's version
            - a saved listing over a live item's missing tree refuses with empty `historyRefs`
            - `readStateHistory` retries a missing object once, pulling only for an item with no live ref
            - `resolveRecoveryStateBasis` rebuilds the seed over a change window with a missing object
            - `runStoreRename` and `conflictHistory` return a missing object's refusal unchanged when there is no
              history to pull
            - `historyRefs` (`operational-sync.ts`) returns the narrower set
            - follow's cleanup keeps a missing local object's restore remedy and its move record
            - `adoptionFailure` refuses the whole pull on a missing project identity blob
            - a local transport fault moves `projectPull`'s status to `incomplete`
            - `readMigrationRemote`, `destinationAnswers`, `judgeRefFollow`, and `settleHistoricalCopy` pass a
              `refused` local object on

    - `[ ]` **3.9.b `corruptRef` keeps only its unparseable arm**
        - `corruptRef` (`namespace-health.ts`) drops its missing-objects parameter and takes `saved` as an option, so a
          surviving positional call fails both type checks instead of landing its boolean in `saved`. The type checks
          are its evidence; it has no failing-first case.

### `[ ]` **3.10 Re-run the fault search over the swept inventory** — validate exit criterion at segment scope

- _Goal:_ Phase 3's exit criterion holds: the re-run search finds every fault site on the helper or among the
  inventory's tolerated, unchanged, and invariant sites, and Phase 3's cases pass in the store suites and the unit
  tests.

    - Run the search, `npx arc check run test:store`, and `npx arc check segment`, and record what each found.
    - A site outside the inventory fails the criterion; its classification and fix land in a revision parent of their
      own, never in this task.

## **Phase 4:** Listing scope, pull consumption, and transport failures

_Purpose:_ The caller-observable changes later ref-backend work reads: live listings take the owner scope and absence
rule, every pull consumer shows a designation question, and transport failures become typed outcomes.

_Mode:_ `slice` — closes on the fault classes, listing scope, and pull consumption exercised through public store
calls and their consumers.

_Exit criterion:_ Through public store calls, a missing object refuses recoverably with the restore remedy, and each
call succeeds once the object is restored; a history retry pulls only for an item with no live ref; an owner-scoped
listing ignores another owner's unreadable ref; a designation question shows in each consumer and stops the retries; a
transport failure is a per-remote outcome.

### `[ ]` **4.1 Live listings take the owner scope and the absence rule — § 2**

- _Goal:_ A live listing narrows records and diagnostics to its owner as an as-of listing does and returns `absent`
  when it finds no records and no diagnostics, so one unreadable unrelated ref no longer blocks every lifecycle write
  through `acquireLifecycleRecords`.

    - `listBoundRecords` (`lib/store/ref/read.ts`) selects tips by `input.owner` as `selectSnapshotTips`
      (`snapshot-read.ts`) does: the owner's own ref in its family, and archive refs only when the owner holds no live
      ref. `decodeCapturedRef`, which point reads and the fetch check share, is unchanged.
    - Archived diagnostics narrow by `archiveOwnerTrees`' rule (`archive-read.ts`): the owner's folders and any folder
      no valid UID attributes, since it could be the owner's. A diagnostic no owner can be read from stays, so an
      incomplete listing never reads as complete.
    - The absence rule matches the in-repo tracked and personal listings (`in-repo/list.ts`, `in-repo/personal.ts`),
      whether or not the listing names a kind, on the live path alone; `readableRefListing` keeps its kind-scoped rule
      for as-of and write-check listings.
    - The write-check views (`write-views.ts`) and as-of archived diagnostics (`archive-view.ts`) take the same owner
      scope.
    - Build `test-first` (one behavior at a time):
        - an owner-scoped live listing omits another owner's unreadable ref and its archived diagnostics
        - an owner-scoped live listing keeps an archived diagnostic no valid UID attributes
        - an owner-only live listing that finds nothing returns `absent`, with and without a kind
        - a family-wide live listing that finds nothing returns `absent`
        - a lifecycle write through `acquireLifecycleRecords` proceeds beside another owner's unreadable ref
        - a write-check view ignores another owner's diagnostic
        - an as-of listing keeps its kind-scoped absence rule, and its archived diagnostics narrow to the owner's
          folders and unattributed ones

### `[ ]` **4.2 Every pull consumer renders a designation question — § 3**

- _Goal:_ A pull that raises a designation question shows it once, with its remedy and command, in every consumer, and
  the history-retry paths stop on it instead of failing with a bare `state-unresolvable`.

- _Note:_ Its cases land beside the consumers' unit tests (`unit/lib/store/pull-consumption.test.ts`,
  `unit/handlers/status/store-locus-pull.test.ts`, `unit/errand/store-runtime.test.ts`,
  `unit/errand/promote-store-runtime.test.ts`) or in a `store-ref-*` suite.

    - `[ ]` **4.2.a The helper and the retry paths**
        - `consumePull` (`lib/store/pull-consumption.ts`) renders whatever designation question `pullDesignation`
          finds, top-level or partial, as a notice for every consumer, and names the question it rendered so a
          consumer that shows it its own way drops that notice.
        - `pullHistoryForRetry` reads `states` as well as `pulls`; on a designation question it writes the question
          and its remedy as a notice and returns false, so its caller returns the refusal it holds.
          `readStateHistory` (`lib/handoff/state-history.ts`) keeps stopping on it, its stop carrying the question in
          place of the notice.
        - `join` (`handlers/join.ts`) keeps its designation prompt in place of the notice.
        - Build `test-first` (one behavior at a time): `consumePull` renders a top-level question, and a partial one
          beside a failed read source; `pullHistoryForRetry` returns false with the notice; `readStateHistory` stops
          with the question's remedy, shown once; `join` prompts without also logging the question.

    - `[ ]` **4.2.b The consumers move onto the helper**
        - Through `pullSelectedStore` (`operational-sync-bindings.ts`) with `pullDesignation`: `runStoreRename`
          (`rename-store.ts`) and `conflictHistory` (`conflict-command.ts`) through `pullHistoryForRetry`;
          `store-user-pull.ts`; and `pullStoreStatus` (`handlers/status/store-locus.ts`).
        - The push-result consumers, the import's publication (`import/finish.ts`) and `archivePublicationHold`
          (`lib/work-unit/verbs/archive-store.ts`), find a designation question through `pullDesignation` over
          `projectPull` (`operational-sync-bindings.ts`), exported, over the push result's `pulls` and `states`, and
          stop on it with the helper's rendering, dropping their own designation text. Each keeps its own handling of
          publish outcomes, failed pulls, and other states, whose typed refusals the helper's rendered stop would lose.
        - The helper's callers that omit `pullDesignation` — `errand/store-runtime.ts`,
          `errand/promote-store-runtime.ts`, `handlers/errand-entry-storage.ts` — receive the rendered notice.
        - Build `test-first` (one behavior at a time):
            - the retry consumers show the question and its remedy and return the refusal they hold
            - `pullStoreStatus` gives a partial designation question its command, which only a top-level one gets
              today; `store-user-pull.ts` renders the question once
            - the import's publication and archive's publication hold each stop on a push's designation question with
              the helper's rendering
            - each errand runtime shows the rendered notice

### `[ ]` **4.3 Transport failures become per-remote outcomes or typed refusals — § 4**

- _Goal:_ No transport-target or effective-transport failure escapes `pull`, `push`, push admission, or follow as a
  raw exception: each becomes a per-remote failed outcome with failure `refused` and the remote-URL repair remedy, or
  a typed refusal where no per-remote outcome exists, and the outcomes and notices already gathered survive.

- _Note:_ `pull.ts` and `push.ts` are shared with another unit's change; see `notes-storage-ref-hardening.md`
  § Coordination with `store-operation-git-access`.

    - `refFetchTarget` and `refPushTarget` (`fetch-target.ts`) and `readComparisonSource` (`comparison-witness.ts`)
      throw `EffectiveTransportError` for a remote with no effective URL, where they throw a plain `Error` today, so a
      call site tells a transport failure from a Git process failure.
    - Typing happens at the call sites. The lookups beneath them — `repositoryConfig`, `configOutput`,
      `readRemoteTransports`, `readNamedTransport`, `resolveLiteral`, `refFetchNeedsCompleteness` — keep throwing, so a
      caching wrapper over them caches no failure value.
    - A per-remote failure takes 2.3.a's **Local transport fault** row.

    - `[ ]` **4.3.a Pull and push**
        - Pull: `refFetchTarget`'s failures through `fetch.ts` and `pull.ts`, and through `refFetchRewriteRemedy`
          (`fetch-remedy.ts`), which builds a `history-diverged` notice's remedy from `rejectedFetchNotice` and
          `fetch-seen.ts`, become the remote's failed outcome.
        - Push: `checkedPushTarget`'s call of `refPushTarget` in `publishRefAttempt`, and `publishListing`'s `admit`
          around `captureComparisonWitness`, become the remote's failed publish, rather than a retry to the deadline.
        - Build `test-first` (one behavior at a time): one of two remotes with an unresolvable URL fails `refused`
          while the other's pull outcome and notices survive; a push remote whose push URL cannot be resolved, while
          its fetch URL can, fails `refused` at a `history-diverged` remedy without losing the pull; the same at push
          admission and at the push target.

    - `[ ]` **4.3.b Follow**
        - Follow's resume (`follow.ts`), its cleanup (`follow-delete.ts`), and `judgeRefFollow`
          (`follow-candidates.ts`) wrap a transport failure from `captureComparisonWitness` as `migrationTransportRefusal`
          does, so resume and cleanup return `move-unfinished` and `judgeRefFollow` its typed refusal.
        - Build `test-first` (one behavior at a time): follow's resume and cleanup over an unresolvable transport each
          return `move-unfinished` with the move record kept; `judgeRefFollow` returns its refusal.

### `[ ]` **4.4 Exercise the caller-observable group through public calls** — validate exit criterion at segment scope

- _Goal:_ Through public store calls and their consumers, the § 1–§ 4 group behaves as Phase 4's exit criterion
  states, and the store suites and the unit tests pass.

    - Run the exit criterion's scenarios through public store calls, among them the restore-then-succeed cases 3.1.a,
      3.3.a, and 3.5.a add for the read, the write, the pull, and the push.
    - Then run `npx arc check run test:store` and `npx arc check segment`, and record what each found.

## **Phase 5:** The import's fixes

_Purpose:_ The known import defects and every reachable review finding fixed, then checked by a fresh pass, so the
import the cutover runs first lands nothing wrong in this repository's history.

_Mode:_ `slice` — closes on a clean trial import of this repository's real state.

_Exit criterion:_ With the review family's import mapping bound, a `--trial` import of this repository's real state in
a fresh disposable copy returns a report with no refused record, whose every notice is of a kind that does not block:
an Errand origin that changed, a skipped derived capture, the identity-mint notice, a personal link, or an unreadable
annotated commit.

### `[ ]` **5.1 A body-less execute-bound capture imports without its mark — § 11.2**

- _Goal:_ An execute-bound capture whose mark is its last line is queued, and its entry stays in the imported inbox
  without the mark, as a capture with a body does.

    - The pattern in `import/pending-entries.ts` accepts a mark at the end of its entry, since `splitEntryList`
      (`lib/store/concurrency/entries.ts`) moves trailing newlines into the separator.
    - Build `test-first` (one behavior at a time): a body-less capture is queued, and its entry stays in the imported
      inbox without its mark; a capture with a body still imports as today.

### `[ ]` **5.2 Personal links are followed where notes saved through them, and reported — § 11.2**

- _Goal:_ The import follows a link only where the notes snapshot holds a path through it, so the disk and notes copies
  compare as for any file; it skips every other link, and reports each link it follows or skips with a notice that
  does not block.

    - `walk` (`import/personal-disk.ts`) records each link it meets, with its path, rather than skipping it silently,
      and `readImportPersonalDisk`'s loop over each checkout's `.arc/user/` records a linked identity directory the same
      way, where it skips any entry that is not a directory today. The walk runs before any person's snapshot is read,
      so `appendPerson` (`import/personal.ts`), which holds the snapshot, follows a recorded link the snapshot holds a
      path through, reading its target as `readUserDir` (`lib/io-context.ts`) does when notes save;
      `comparePersonalFile` then compares as for a regular file.
    - Resolving a link needs `realpath`, which the default port already returns (`createDefaultStorePorts`, typed
      through `RefRepositoryFileAccess`) and `StoreFileAccess` lacks. The type of `importSource.ports.fs`
      (`lib/store/ports.ts`) gains it, so `StoreFileAccess` and the fakes typed by it stay as they are. A followed
      directory keeps `readUserDir`'s visited set of real paths, so a link cycle is walked once.
    - One carrier holds the import's notices that do not block: `importTrackedState` (`entry.ts`) creates it beside
      `transients`, before `readImportSource`, passes it through that call to `appendImportPersonal`, and joins it to
      the report after the blocking check, as it joins the transient and skipped-capture notices. 5.3 uses it too.
    - Build `test-first` (one behavior at a time):
        - a linked file the notes snapshot holds imports and compares
        - a file under a linked directory the snapshot holds imports and compares
        - a linked tree notes never saved, such as another checkout's `node_modules`, is skipped with a notice
        - a link whose target cannot be read is skipped with a notice
        - a link cycle under a followed directory is walked once
        - a linked identity directory under `.arc/user/` whose person's snapshot holds paths imports and compares; one
          whose person has no snapshot is skipped with a notice
        - no link notice blocks the import
    - Directory links use the junction fixtures the existing symlink tests use; a file-link case skips where the
      platform cannot create a file link.

### `[ ]` **5.3 Unreadable annotated commits sort last with a notice — § 11.2**

- _Goal:_ A person's compacted notes import even when a retained note's annotated commit is unreadable: such commits
  sort last, by object ID, with a notice that does not block.

    - `committedAt` (`import/personal-notes.ts`) no longer throws inside the sort, for an unreadable commit or one with
      no committer date; `personal.ts` no longer turns the failure into a blocking notice that drops the person's
      records. The notice goes through 5.2's carrier.
    - Build `test-first` (one behavior at a time): an identity with one unreadable annotated commit keeps its records
      and reports the notice; a commit with no committer date does the same; two unreadable commits order by object
      ID.

### `[ ]` **5.4 A lost transient-source delete lease is its own recoverable condition — § 11.2**

- _Goal:_ A lost default-layout transient-source delete lease is reported as itself, recoverably, instead of as a change
  to the import's private gathering refs.

    - `landImportRefs` (`import/land.ts`) returns its cause: a layout mismatch, present state refs, or the refs its
      landing transaction lost (`RefTransactionOutcome`'s `refs`). Present state refs never reach the
      changed-gathering-refs notice: `landingRace` (`import/entry.ts`) first runs the destination check
      (`inspectImportDestination`), which refuses them or publishes this import's own earlier landing, and keeps running
      it first. When that check neither refuses nor publishes, a lost `importTransientDeletes` expectation is reported
      as its own recoverable condition, and a layout mismatch or any other lost ref keeps today's notice.
    - Build `test-first` (one behavior at a time): a lost transient-source lease yields its own recoverable condition,
      and retrying the import as its remedy says lands it; a layout mismatch keeps the changed-gathering-refs notice; a
      landing whose registry identity matches still publishes.

### `[ ]` **5.5 A stale publication journal is dropped when no kept tips remain — § 11.2**

- _Goal:_ A rebuild with no transient tips no longer orphans an earlier attempt's import publication journal.

    - `retireImportLocals` and `retireImportRemote` (`import/transient-cleanup.ts`) reach `dropKeptTips`, the journal's
      only deleter, when a stale journal exists and no kept tips remain.
    - Build `test-first` (one behavior at a time): an attempt that wrote a journal, then a rebuild with no transient tips,
      leaves no journal; a rebuild with kept tips keeps today's cleanup.

### `[ ]` **5.6 A publisher refusal keeps its class through source retirement — § 11.2**

- _Goal:_ A refusal thrown while source retirement verifies the publisher or reads origin reaches the import's report
  with its own class, condition, and remedy, so a terminal refusal is never reported as recoverable `move-unfinished`.

    - `retireImportRemote` (`import/transient-cleanup.ts`) catches a `MigrationRefusal` around `retireOriginRefs`,
      which `fetchMigrationRemote` or `captureMoveRemote` throws inside `unpublishedImportClaims`, and in its
      no-publisher arm. It flattens both through `cleanupRefused`, whose `move-unfinished` the command schema admits
      only as recoverable.
    - Each catch returns the thrown refusal: a store refusal through `storeFailure`, a command refusal with its own
      code and class. Its remedy is wrapped by `importRetry`, so the retry reruns `arc store migrate --import`. Both
      helpers are private to `import/finish.ts`, which imports `transient-cleanup.ts`, so they move into a module both
      files import.
    - `originTips`' refusal for an unreachable origin listing carries the restore-access-to-origin remedy itself, the
      one the no-publisher arm's catch writes today, since both catches pass the thrown refusal through.
    - Build `test-first` (one behavior at a time): a terminal refusal thrown during publisher verification stays
      terminal with its remedy; a recoverable one stays recoverable; the no-publisher arm keeps the thrown class, and
      an unreachable origin there keeps the restore-access remedy; each retry's argv is `arc store migrate --import`.

### `[ ]` **5.7 The batch path check runs once per ref — § 11.2**

- _Goal:_ `checkRefBatchPaths` costs time linear in the batch, so an import of every personal document passes it where
  the pairwise check could not, and a batch write's pre-check does too.

    - `checkRefBatchPaths` (`path-admission.ts`) groups the records by the composite key it already uses, which keeps
      unresolved owners sharing a placeholder UID apart, and runs `findRefNamespaceCollision` once per group over its
      paths. The grouping skips a repeat of one reference at one path, and the refusal names a colliding pair in
      today's wording, without pinning which pair when collisions interleave.
    - `storedPathCollision` (`write-build.ts`), which a batch write passes afterward, is unchanged.
    - Build `test-first` (one behavior at a time): a collision refuses naming a colliding pair in today's wording; a
      repeated reference at one path is not a collision; two unresolved owners of one kind whose records share a
      placeholder path do not collide; 20,000 distinct personal paths finish within the test's timeout.

### `[ ]` **5.8 A Git checkout inside personal state is reported, not walked — § 11.2**

- _Goal:_ The import never enters a directory that holds a `.git` entry, under `.arc/user/<identity>/`, the identity
  directory included, or under a followed link's target, and reports it once with a blocking notice whose remedy is to
  move the checkout outside personal state or remove it.

    - `walk` (`import/personal-disk.ts`), and 5.2's read of a followed directory, stop at a `.git` file or directory,
      and each stop is returned as a notice that blocks, as the import's other personal-state faults are
      (`personal.ts`), naming the path, with `git worktree move` for a registered worktree.
    - Build `test-first` (one behavior at a time): at `readImportPersonalDisk`, a directory with a `.git` directory is
      reported once and its files are not read; the same for a `.git` file; a sibling directory without one is read as
      today. At `appendImportPersonal`, a followed linked directory that holds a `.git` entry is reported once and not
      read.

### `[ ]` **5.9 Fix the import review's reachable findings — § 11.1**

- _Goal:_ Every finding 1.3 dispositioned as reachable is fixed, each with a case that fails before its fix.

    - Subtasks are added at 1.3, one per finding or shared cause.
    - Record each fix's SHA as it lands under `notes-storage-ref-hardening.md` § Import review fixes, with its finding
      and task, including a fix that lands in the task 1.3 folded the finding into.

### `[ ]` **5.10 Check the import fixes with a fresh pass — § 11.1**

- _Goal:_ A fresh non-author evaluator confirms that each review finding's fix resolves it without a new reachable
  defect, closing the review's stop rule.

    - Same mechanism and rubric as 1.2. The target is every landed commit `notes-storage-ref-hardening.md` § Import
      review fixes records — 5.9's, and those in a task of Phases 3 to 5 that a finding folded into — and excludes
      base merges. The review's findings are the correction scope.
    - A finding folded into a Phase 6 task is checked the same way by the `6.R` parent 1.3 adds ahead of 6.10, and one
      folded into a Phase 7 task by the `7.R` parent 1.3 adds at the end of Phase 7; the review's stop rule closes at
      the last of these checks.
    - A new finding takes 1.3's disposition. A reachable one takes a corrective parent of its own in the phase running
      the check, ahead of that phase's verifier (`5.R` ahead of 5.13), records its fix's SHA, and is checked again the
      same way.
    - Keep the prompt and verbatim report under `~/dev/arc-evidence/storage-ref-hardening/import-review/`.

### `[ ]` **5.11 Repair the state faults the trial found — § 11.1**

- _Goal:_ Each state fault 1.3 recorded is cleared by the repair its remedy names, and each repair runs only once it is
  approved, since it changes personal files, branches, or registered checkouts that are the Owner's.

    - For each fault in `notes-storage-ref-hardening.md` § Import state faults, present the repair — reconciling
      personal copies that differ, archiving or restoring a branch, settling a paused work unit, pruning a stale
      registered checkout — and run it on approval; record what changed beside the fault.
    - A fault the code raises wrongly is not a state fault: it takes 1.3's disposition, and a reachable one takes the
      corrective route 5.10 gives a new finding (`5.R` ahead of 5.13).
    - An unmapped review source 1.3 recorded as cleared by the review mapping's binding takes no repair; 5.12's
      rehearsal shows it cleared.

### `[ ]` **5.12 Rehearse the trial with the review mapping bound — § 11.1**

- _Goal:_ Everything a trial with the review mapping bound raises over this repository's current state has a home and
  every state repair it needs has run, so that once the corrective parents it adds ahead of 5.13 have landed, and any
  fix to the review mapping it records has landed and this unit has merged base, the verifier confirms a clean report
  rather than discovering faults.

- _Note:_ It runs once this branch holds the review family's import mapping; until then the loop waits here, since
  tasks run in document order. See `notes-storage-ref-hardening.md` § Coordination with `seam-delivery-review`.

    - Run the trial exactly as 5.13 does — no review in flight, notes saved on approval right before a fresh copy — and
      keep its report beside the copy.
    - Verify each refusal and blocking notice against source, then present the complete disposition set for approval,
      by 1.3's dispositions: a state fault is recorded under `notes-storage-ref-hardening.md` § Import state faults and
      repaired on approval, as 5.11 does; a reachable code defect takes the corrective route 5.10 gives a new finding,
      its corrective parent placed after 5.12 and ahead of 5.13; an unreachable one is recorded in the spec's
      § Non-Goals.
    - A fault in the review mapping itself, which § 11.1 takes as an expected contract, is not this change's to fix:
      record it under § Import state faults as the mapping's, and 5.13 waits until its fix lands and this unit merges
      base.
    - The unmapped review-source notices 1.3 recorded no longer appear; one that does is a fault in the mapping.
    - It closes once every item the trial raised has a home and every state repair approved here has run. A code
      defect's fix lands in its corrective parent after 5.12, so 5.13, next in document order, runs once it lands.

### `[ ]` **5.13 A trial import of real state returns a clean report** — validate exit criterion at segment scope

- _Goal:_ A fresh disposable copy's `--trial` import returns the report Phase 5's exit criterion states.

- _Note:_ It runs after 5.12 and any corrective parent ahead of it, once this branch holds the review family's import
  mapping and, for any fault 5.12 recorded in that mapping, its fix has landed and this unit has merged base; until then
  the loop waits here. See `notes-storage-ref-hardening.md` § Coordination with `seam-delivery-review`.

    - Run it with no review in flight, since the bound mapping correctly blocks on one.
    - As 1.1: check `memcap_policy` and run through the gate in one command, copy afresh under
      `~/dev/arc-evidence/storage-ref-hardening/`, clear the copy's `.git/arc/locks/`, and run this branch's built CLI
      by path. Right before the copy, and only on approval, save notes with that built CLI,
      `node <this checkout>/packages/arc-framework/bin/arc.js user save`, run from each registered checkout whose
      work-unit files the import reads, root files saving from any one, so the copy's disk and notes copies agree; copy
      in the same step. The command saves only the configured identity, so another identity's differing files must
      already be reconciled by 5.11's or 5.12's repairs. The trial reads each checkout's personal directory live, so
      from the save until the trial has read them, no session writes a personal file in any registered checkout.
    - The report carries no blocked marker and returns `status: "ok"` either way, so read it: `refused` is empty, and
      every notice is one that does not block — an Errand origin that changed (`import/transient.ts:118`), a skipped
      derived capture (`code-captures.ts`), the identity mint (`entry.ts:40`), or a personal-link or
      unreadable-annotated-commit notice from 5.2's carrier.
    - Run `npx arc check segment`.

## **Phase 6:** Ref transactions, Git ref locks, and the keeper lease

_Purpose:_ The sync deadline never kills a ref transaction it launched, a Git ref lock left behind is reported with a
remedy that can clear it, a push publishes past a ref a stranded tracking lock holds, and no post-flip path waits for
the keeper lease under the layout lock.

_Mode:_ `slice` — closes on concurrent and deadline-bound sync exercised on Linux and in a dispatched Windows
portability pair.

_Exit criterion:_ A transaction held at `prepared` past the deadline commits or fails on Git's own terms and leaves no
lock, on Linux and Windows; both layouts' Windows publishing bursts converge; a push overlapping another checkout's
pull leaves writes and pull merges free of `lock-held` on the layout lock.

### `[ ]` **6.1 A launched ref transaction finishes past the sync deadline — § 5.1, § 12**

- _Goal:_ A ref transaction that the deadline did not refuse at launch runs to Git's own end, so the deadline never
  strands a ref lock from a transaction it launched.

- _Note:_ `sync-deadline.ts` and `ref-transaction.ts` carry deadline behavior another unit's change relies on; see
  `notes-storage-ref-hardening.md` § Coordination with `store-operation-git-access`.

    - `[ ]` **6.1.a The uninterruptible option**
        - `GitExecOptions` (`lib/git/exec.ts`) gains `uninterruptible?: true`, and `GitExecInput`'s options admit it.
          `bindDeadline` (`sync-deadline.ts`) honors it on `execInput`: when the deadline's signal has aborted at launch
          — expiry here is the signal, never the clock-based end alone — it refuses with the canceled `GitProcessError`
          the port raises for an aborted call, so every caller's deadline arm still matches; otherwise it calls the
          port without the deadline's signal, while a signal the caller supplied still applies.
        - `updateRefTransaction` (`lib/git/ref-transaction.ts`) sets the option on its `update-ref --stdin` call
          alone; `readTransactionTips` and the version probe keep the signal. No check follows the call.
        - Build `test-first` (one behavior at a time), through `withRefSyncDeadline`, since `bindDeadline` is internal:
          a deadline whose signal the test aborts refuses an uninterruptible call before launch, as a canceled
          `GitProcessError`; a live deadline launches it without its signal; a caller's own signal still cancels it;
          `bindDeadline` passes every option it does not own through to the default port, `uninterruptible` included.

    - `[ ]` **6.1.b The deadline-kill case**
        - A `reference-transaction` hook holds the transaction at `prepared` until the deadline fires; the transaction
          commits or fails on Git's own terms and leaves no lock.
        - Its test file is a `store-ref-*` integration file, so the store check's reach selects it on Linux, and its
          name joins `PORTABILITY_SUITES` (`lib/local-vitest-runner.ts`), so it runs on Windows in 6.10's dispatched
          pair.

### `[ ]` **6.2 A held Git ref lock refuses `lock-held` at every transaction site — § 5.2, § 5.3, § 8, § 12**

- _Goal:_ Wherever a ref transaction fails because a Git ref lock is held, the caller receives `lock-held` naming the
  lock file and its age, with a remedy that can clear it, except at the designation check's temporary candidate refs,
  where clearing them before a check gives one remote's failed outcome carrying that condition and remedy and removing
  them after it reports nothing; the store never removes the file.

- _Note:_ `write.ts`, `pull.ts`, `push.ts`, and `backend.ts` are shared with another unit's change; see
  `notes-storage-ref-hardening.md` § Coordination with `store-operation-git-access`.

    - `[ ]` **6.2.a The transaction wrapper and its lock error**
        - One store-level wrapper around `updateRefTransaction` serves every transaction in `lib/store/ref/`; no
          direct call remains outside it (26 call sites in 16 files today), which a search confirms. On a completed
          Git failure with every ref still at its expected value, it `lstat`s each candidate through `context.fs` in
          `context.repository.gitDir ?? commonDir`: each ref's `<ref>.lock`, `reftable/tables.list.lock`, and
          `packed-refs.lock` when the transaction deletes a ref. A lock found throws one typed lock error with its
          path and age from `mtimeMs`; none found rethrows as today. A failure the deadline canceled, the read-back's
          included, stays a canceled error.
        - `StoreFileAccess.lstat` (`lib/store/ports.ts`) adds `mtimeMs` to its result type; test fakes gain it.
        - `rethrowRefFetchKeeperLock` (`fetch-keeper-lock.ts`) becomes this classification and gains the
          `packed-refs.lock` case; `RefPushTrackingLockError` (`push-tracking.ts`) keeps the receiver's accepted refs
          and takes the wrapper's lock.
        - Build `test-first` (one behavior at a time): a planted `<ref>.lock`, `packed-refs.lock` held during a deletion
          in the files format, and `tables.list.lock` in reftable each yield the lock error with path and age; no lock
          rethrows, and a stale `packed-refs.lock` beside a failed update is not named; a canceled read-back stays
          canceled; a files-format deletion lock in the keeper path is typed. Through `withRefSyncDeadline` over the
          default ports, as 6.1.a's cases run, the `lstat` result reaches the caller whole, `mtimeMs` included: a
          property case that already holds today and guards it (spec § 12).

    - `[ ]` **6.2.b The `lock-held` mappings and remedies**
        - `refBatchFailure` (writes), `pullRefStore` and `pushRefStore` (merges, withdrawals, keepers, tracking), and
          `withMigrationLock` (the import) map the lock error to `lock-held`; `listBoundRecords` (`list`) and
          `refReadOperations` (`version`, over `refStateVersion`'s bare result) gain the mapping, since both save the
          version token.
        - `clearProjectCheck` (`designation-project.ts`) keeps its one-remote failed outcome and takes the lock's
          condition and remedy. The removal of a check's candidate refs in `checkRefDesignationProject`'s `finally`
          keeps discarding its failure, since it cannot replace the check's result; the next check's `clearProjectCheck`
          clears a ref it leaves, or reports the lock.
        - A lock older than `REF_SYNC_DEADLINE_MS` takes the stale remedy — remove the file once no Git process runs in
          that repository; a younger one the held remedy — retry first.
        - Build `test-first` (one behavior at a time): one case per mapping site; a stale and a held lock by `mtime`;
          once a stale lock's file is removed as its remedy says, the refused write retries and succeeds.

### `[ ]` **6.3 `tracking-update-failed` names the lock it found — § 5.3**

- _Goal:_ A pull notice raised because Git could not update a tracking ref names the lock it found, with its age and
  the stale or held remedy.

    - `rejectedFetchNotice` (`fetch-check.ts`) `lstat`s the tracking ref's candidate lock files through the same
      candidate set as 6.2.a, and names a lock it finds by its absolute path, the form a `lock-held` refusal's `lock`
      carries.
    - Build `test-first` (one behavior at a time): a planted tracking-ref lock is named with its age; with no lock found
      the notice keeps today's condition and remedy.

### `[ ]` **6.4 A stranded tracking lock excludes its ref from the push — § 9**

- _Goal:_ A push meeting a stranded tracking lock publishes the rest and reports the excluded ref's `refused` failure
  with the notice's condition and remedy, instead of retrying to the deadline.

- _Note:_ the exclusion expects Git 2.53.0 or later, whose fetch updates the other refs when one is rejected; the
  floor raise lands outside this change, so a case that relies on it skips below 2.53.0, where the floor job runs.

    - `excludeBrokenPushRefs` (`push-exclusion.ts`) seeds exclusion from `tracking-update-failed` as well as
      `namespace-corrupt` and `end-pending`. The push loop's `blocked` set in `publishRefAttempt` keeps its seeds, as
      § 9 states.
    - Build `test-first` (one behavior at a time): in the default layout's files format, with Git 2.53.0 or later, a
      stranded lock on one tracking ref excludes that ref and the push publishes the others; the excluded ref's failure
      carries 6.3's lock condition and remedy; an `end-pending` dropped beside `tracking-update-failed` yields a
      schema-valid failed publish with a condition and remedy. The separate layout's reftable has one `tables.list.lock`
      for every ref, so a stranded lock there ends the pull `lock-held`, which 6.9 covers.

### `[ ]` **6.5 A lock-failed `!` row counts as applied when its tracking ref holds the fetched tip — § 9**

- _Goal:_ A ref whose tracking ref a sibling's fetch already advanced past the fetched tip raises no
  `tracking-update-failed` notice, so 6.4's exclusion refuses only a ref that cannot publish.

    - `markUncommittedUpdates` (`fetch-check.ts`) also checks a `!` row when its tracking ref has moved off the row's old
      value; a tracking ref holding the fetched tip, itself or a descendant, makes the row applied, as
      `trackingContainsFetchedTip` does for an applied row. A rejected rewrite leaves the tracking ref at its old value
      and keeps its refusal.
    - Build `test-first` (one behavior at a time), handing `checkRefFetchUpdates` a failed fetch's `!` rows directly
      since Git's marking varies by version and format: a tracking ref moved to a descendant raises no notice; a
      rewrite to an ancestor stays `history-diverged`.

### `[ ]` **6.6 A zero wait is one attempt, and expiry refuses before the port — § 6.3, § 12**

- _Goal:_ A zero-wait advisory lock request acquires a free lock in one attempt, an expired deadline refuses before
  any lock port call, and no wrapper raises a lock wait.

- _Note:_ `sync-deadline.ts` carries deadline behavior another unit's change relies on; see
  `notes-storage-ref-hardening.md` § Coordination with `store-operation-git-access`.

    - `acquireAdvisoryLock` (`lib/advisory-lock.ts`) attempts once before its deadline test.
    - `bindDeadline` refuses before calling the lock port once `refSyncDeadlineExpired` holds — the deadline's signal
      aborted or its end reached — whatever wait was asked, with `RefSyncDeadlineError` naming the lock's ref; it
      passes zero as zero and lowers any other wait to the time remaining. 6.1.a's signal-only expiry covers only the
      uninterruptible launch.
    - `createRefLockFactory` (`lib/store/default-ports.ts`) releases a lock taken with a zero wait under
      `DEFAULT_MAX_WAIT_MS`.
    - Build `test-first` (one behavior at a time): a zero wait acquires a free lock; a zero wait on a held lock fails
      after one attempt; an expired deadline refuses without a port call; through `withRefSyncDeadline` over the default
      ports, which applies `bindDeadline`, a wait reaches the port lowered, and zero as zero, a property case that
      already holds today (spec § 12); a zero-wait lock releases past a busy `.break` lock.

### `[ ]` **6.7 The comparison scope never waits for the keeper lease under the layout lock — § 6.1, § 6.2, § 12**

- _Goal:_ A push that overlaps another checkout's pull on the same remote never holds the layout lock while waiting
  for that remote's keeper lease, and the keeper lease is the one lock other than the move lock held across a network
  call.

    - `[ ]` **6.7.a The comparison scope's lease dance**
        - `withComparisonScope` (`comparison-witness.ts`) takes the lease with a zero wait under the layout lock; if
          another holds it, it releases the layout lock, waits for the lease alone, releases it, and tries again. The
          operation always runs under both locks.
        - The retry is bounded by the remaining sync deadline, or, for a caller with none — follow's scopes in
          `follow-delete.ts` and `follow-candidates.ts` — by `REF_SYNC_DEADLINE_MS` from its first attempt, whose
          expiry throws `AdvisoryLockTimeoutError` that `withMigrationLock` maps to `lock-held`.
        - Build `test-first` (one behavior at a time): a held lease releases the layout lock while waiting; a write and
          a pull merge started during that wait do not refuse `lock-held`; the operation runs under both locks; a
          deadline-free caller's expiry maps to `lock-held`; through `withRefSyncDeadline` over the default ports, as
          6.1.a's cases run, the keeper lease is taken through `context.lock`, a property case that already holds today
          (spec § 12).

    - `[ ]` **6.7.b The span rule where the lease is taken**
        - `withRefFetchKeepers` (`fetch-seen.ts`) and `fetchRefPatterns` (`fetch.ts`) document the lease as held across
          the remote's fetch, bounded by the sync deadline, and a sibling that outwaits its remaining deadline ending
          with `RefSyncDeadlineError` and `refSyncDeadlineRemedy`'s retry remedy. The change is documentation only, so
          it has no case.

### `[ ]` **6.8 A write that retires a work ref takes the registry lock — § 8**

- _Goal:_ A batch that retires a targeted live work ref holds the registry lock it writes under, so the lock
  invariant holds without serializing ordinary writes on the registry.

- _Note:_ `write.ts` is shared with another unit's change; see `notes-storage-ref-hardening.md` § Coordination with
  `store-operation-git-access`.

    - `registryAnchorLockRefs` (`write-manifest.ts`) takes the registry lock when a targeted live work ref's owner has
      a lineage transition record in the registry tree at the batch's resolved tips, or the batch creates one. It reads
      that tree through `readRefTrees` only when some target is a live work ref, and `planRefRetirements`
      (`write-retirement.ts`) reuses the read. A fault in that read classifies through 2.3's helper, since § 1.4's
      search binds it.
    - `commitLockedRefBatch` (`write.ts`) re-reads the tips it plans from after the locks are taken. When the
      prediction over those tips needs the registry lock the batch does not hold, the attempt returns to
      re-resolution, which takes it. A lineage record that appears after that re-read meets the admission check and
      retries.
    - Build `test-first` (one behavior at a time): another owner's resolves starting a retirement alone take the
      registry lock; a write to a work item with no lineage record takes none; a lineage record landing between
      resolution and the locked re-read sends the batch back to re-resolution, which takes the registry lock.

### `[ ]` **6.9 The Windows publishing bursts check their recovery in both layouts — § 5.4**

- _Goal:_ Both layouts' publishing bursts run unskipped on Windows and pass when every clone converges, directly or
  after the stranded lock its refusal names is removed and it pushes again.

    - In `__tests__/integration/store-ref-bursts.test.ts`, remove the Windows separate-layout skip.
    - On Windows, once every writer has exited, a lock file left in a clone was stranded; the test finds it by
      `lstat`ing the clone's candidate lock files. A clone whose publication refused passes when its refusal names that
      lock's absolute path — as a `lock-held` refusal's `lock`, or within the condition of 6.4's `refused` publish — and
      removing it and pushing again converges the clone.

### `[ ]` **6.10 Exercise deadline-bound and concurrent sync on both platforms** — validate exit criterion at segment scope

- _Goal:_ Phase 6's exit criterion holds: the store suites and the unit tests pass on Linux, and a dispatched
  portability pair passes the deadline-kill case and both layouts' publishing bursts on Windows.

    - Run `npx arc check run test:store` and `npx arc check segment`.
    - Dispatch `gh workflow run ci.yml --ref <branch> -f run_portability_pair=true` at the pushed head and record the
      run ID and its Windows results.

## **Phase 7:** History retries, withdrawal placements, push refusals, and decomposition

_Purpose:_ The remaining write, sync, push, and decomposition defects end in typed outcomes.

_Mode:_ `layer` — closes on write retries, withdrawal placements, push exclusion's refusals, quarter provenance, and
decomposition naming settled.

_Exit criterion:_ Each § 7 and § 10 defect, and each § 9 defect Phases 3 and 6 do not fix, has a case that failed
before its fix and passes after it in the store suites.

### `[ ]` **7.1 A lost history destination retries within a bound — § 7**

- _Goal:_ An outside writer that moves a history destination once is absorbed by the retry, and one that moves it on
  three consecutive attempts refuses with the repair remedy, however each move is found.

- _Note:_ `write.ts` is shared with another unit's change; see `notes-storage-ref-hardening.md` § Coordination with
  `store-operation-git-access`.

    - `publishRefBatchChanges` (`write-publication.ts`) retries a lost history destination from the tip read like any
      other lost ref; `checkRefHistoryDestinations` still refuses a destination that is not an ancestor.
    - The admission check (`refAdmissionBasisChanged`) returns a retry that names the history refs it found moved and
      the values it read for them, the transaction one that names the history refs it lost, and a history destination
      appearing or disappearing (`ownerLocationsChanged`) counts as a loss. `executeRefBatch` (`write.ts`) keeps the
      count of consecutive attempts that lose one, so it carries across re-resolution. The third consecutive loss
      refuses with `historyDestinationFailure`.
    - Each move counts once. The count keeps each history destination at the value the last attempt saw: its tip
      read, the value the admission check read where it found that destination moved, or the lost race's `actual`
      where its transaction lost on that destination. An attempt or a re-resolution counts a loss only when a
      destination differs from that value. The checks at `write.ts:149` that return to re-resolution
      (`ownerLocationsChanged`, `archiveBasisChanged`, `retainedBasisChanged`) compare with the resolution's tips, so
      they can find again a move an earlier attempt counted through its admission check or its transaction; a
      re-resolution that finds only such a move neither counts nor resets the count, and any other attempt that loses
      none resets it. A return that compares no tips — a renamed owner's `"resolve"` (`write-build.ts`) or 6.8's
      registry-lock prediction — loses nothing itself; the re-resolution it starts counts only a destination that
      differs from its kept value, and otherwise resets the count.
    - Build `test-first` (one behavior at a time): rewrite `__tests__/integration/store-ref-history-destination.test.ts`
      so one ancestor move is absorbed; three consecutive moves refuse, once each through the admission check, the
      transaction, and a re-resolution; a destination created before an attempt's admission check counts once, though
      the re-resolution finds it again; a writer that creates or deletes the destination during three attempts'
      transactions is refused at the third, the re-detections between them leaving the count unchanged; an ordinary
      lost ref between them resets the count.

### `[ ]` **7.2 Withdrawal conflict placements read the captured tips — § 9**

- _Goal:_ The withdrawal places its conflicts from the tip sets its operation captured, as every other
  `completeSyncPlacements` caller does, not from a fresh live listing.

    - `prepareWithdrawEnd`'s basis holds the captured `state`, `held`, and `incoming` tips. Thread them through
      `inverseWithdrawStep`, `inverseEntry`, `inverseEntryDocument`, and `mergeDocumentStage` to `conflictValue`
      (`sync-withdraw-entries.ts`), which passes them as `mergeGroupTree` passes its own and no longer calls
      `readSyncRefs`.
    - Build `test-first` (one behavior at a time): a ref that moves between capture and conflict placement leaves the
      placements as captured.

### `[ ]` **7.3 Push exclusion builds a refusal for every excluded ref — § 9**

- _Goal:_ A pending end the pull withholds without an end-pending seed never makes push emit a schema-invalid failed
  publish: exclusion builds a refusal with a condition and remedy for every ref it excludes.

    - Seedless ends arise in `sync-pull-lifecycle.ts`, at the merge filter, whose blocked or withheld ref a notice
      already names, and at the `ended-twice` filter, whose notice is keyed by its item; and through `uniqueNotices`
      (`pull.ts`), which drops `end-pending` beside `history-diverged` or `tracking-update-failed`.
      `excludeBrokenPushRefs` seeds from `listing.pending`.
    - A ref the seed alone excludes takes the condition and remedy of the pull notice `uniqueNotices` kept that names it
      or its counterpart, or of an `ended-twice` notice whose item's UID the ref carries; with no such notice, it takes
      the end-pending condition and remedy (`sync-pull-lifecycle.ts`) naming its history ref.
    - Build `test-first` (one behavior at a time): an `end-pending` dropped beside `history-diverged` yields a
      schema-valid failed publish carrying the `history-diverged` notice's remedy; a clone that ends an item the remote
      also ended pulls an `ended-twice` notice, and its push yields a schema-valid failed publish carrying that notice's
      remedy; a ref the seed alone excludes with no notice naming it, handed to `excludeBrokenPushRefs` directly, yields
      one carrying the end-pending remedy naming its history ref. 6.4 covers the end dropped beside
      `tracking-update-failed`.

### `[ ]` **7.4 Quarter provenance attributes a restored primary — § 9**

- _Goal:_ A reopen or quarter move that restores a removed completed primary in a single-put batch attributes the
  quarter change to the restoring mutation instead of throwing an internal error.

    - `quarterCommitReference` (`quarter-provenance.ts`) handles `folderHoldsRecord` matching neither snapshot; reached
      from `write-reopen.ts`, `write-completed.ts`, and `write-archive.ts`.
    - Build `test-first` (one behavior at a time): reproduce the throw first, since the path is traced but not yet run;
      then the restoring reopen and the restoring quarter move each record the quarter change against the restoring
      mutation.

### `[ ]` **7.5 Decomposition names a verbatim companion by its stored name — § 10**

- _Goal:_ Under the ref backend, a decomposed member's meta Design entry and the decompose report name the verbatim
  companion record that actually resolves.

    - `copyCoordinates` (`lib/decompose/scaffold-copy.ts`) and the member meta's Design entry (`member-scaffold.ts`)
      use `companionStoredName` (`lib/store/companion-name.ts`), which the store places the record by.
    - Build `test-first` (one behavior at a time), in a `store-ref-*` suite through
      `__tests__/helpers/store/ref-decompose.ts`: a verbatim companion's name in the Design entry and the report
      resolves to the stored record.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ Every success criterion is backed by evidence at the final implementation head, with required checks and
  integration readiness established through the work-unit verification workflow.

- _Note:_ See `notes-storage-ref-hardening.md` § Verification at the final head and § Review during execution.

---

## Success Criteria

- `[ ]` Every item in § 1–§ 11 has a case that fails before its fix and passes after it, wherever an input reaches the
  behavior it changes, run by a quality-gate check: a `store-ref-*` suite the store check's reach selects, or a unit
  test the push gate runs. An arm no input reaches, a change only the type checks or the documentation show, and a
  property case that already holds today are exempt where their task names them. Each refusal or failed outcome at a
  material boundary that the spec's Cross-cutting › Testing names also has a case that carries out its remedy and then
  succeeds.

- `[ ]` No refusal, listing diagnostic, or notice gives a missing object a forward-repair or historical-metadata
  remedy, and no point read or write refuses on one as terminal; each § 1.5 placement condition yields a `malformed`
  diagnostic with `rule: "placement"` and its remedy.

- `[ ]` Every site the § 1.4 search finds that refuses, reports, or holds on a missing object classifies it by § 1.1;
  `corruptRef` has no missing-objects arm, and no refusal, diagnostic, or notice for such an object is built outside
  the helper; a saved read of an ended item whose archive tree is unavailable returns `state-unresolvable`; a pull
  still holds such a ref with a `namespace-corrupt` notice; every § 1.8 reader behaves as its table states.

- `[ ]` `StoreRefusalSchema`, `ListingDiagnosticSchema`, `PullNoticeSchema`, `PublishFailureSchema`, and the result
  schemas are unchanged.

- `[ ]` A live listing scoped to one owner, or to a whole family, returns `absent` when it finds no records and no
  diagnostics, and an unreadable ref of another owner does not appear in an owner-scoped listing.

- `[ ]` A pull that raises a designation question shows it in every consumer § 3 lists, and `pullHistoryForRetry` and
  `readStateHistory` stop on it with its remedy.

- `[ ]` No § 4 transport failure escapes as an exception; each yields a per-remote failed outcome or a typed refusal,
  and follow's resume and cleanup return `move-unfinished`.

- `[ ]` A ref transaction past `prepare` when the deadline fires commits or fails on Git's own terms and leaves no lock,
  on Linux and in a dispatched Windows portability pair; a held Git ref lock at any § 5.2 site refuses `lock-held`
  naming the lock's path and age, with the stale or held remedy by age, except at the designation check's temporary
  candidate refs, where clearing them before a check gives one remote's failed outcome carrying that condition and
  remedy and removing them after it reports nothing.

- `[ ]` The Windows publishing bursts run unskipped in both layouts and pass in a dispatched portability pair, every
  clone converging directly or after the stranded lock its refusal names is removed and it pushes again.

- `[ ]` A push that overlaps another checkout's pull on the same remote does not make concurrent writes or pull merges
  refuse `lock-held` on the layout lock, and a zero-wait advisory lock request acquires a free lock in one attempt.

- `[ ]` A history destination moved once by an outside writer is absorbed by the retry, and one moved on three
  consecutive attempts refuses with the repair remedy, whether the admission check, the transaction, or a
  re-resolution finds each move.

- `[ ]` Every import review finding an import of this repository's state can reach is fixed and any it cannot reach is
  recorded in the spec's § Non-Goals; with the review family's import mapping bound, a `--trial` import of this
  repository's state in a disposable copy returns a report with no refused record and only non-blocking notices.

- `[ ]` § 12's four port properties hold for the default ports, each pinned by a test.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
