# Spec (`detailed` · `RFC`): Cutover Notes Removal

- **Origin:** [internal] — the `storage-cutover` cut (2026-11-03)

- **Purpose:** Remove notes-specific sync, the Git-notes portability layer for personal state that the flip to the ref
  store retires, wherever it still runs, live or in a dormant arm. That covers its commands, its configuration keys,
  its sync-state contracts, and its refs. Keep the pieces live code still uses.

---

## Introduction / Context

ARC is moving operational and planning state out of tracked branch files and Git notes into same-repository
`refs/arc/*` behind one storage contract (ADR-035). Before that move, a person's personal state under
`.arc/user/<identity>/` travelled between machines as Git notes. The `arc user` commands `save`, `load`, `push`,
`fetch`, `pull`, `compact`, `status`, and `sync` kept a manifest of those files on `refs/notes/arc/user/<identity>`, and
`arc sync` saved and pushed that ref beside the branch. A sync-state ref (`refs/arc/user/<identity>/sync-state`) and a
local file (`.sync-state.json`) recorded partial pushes and the machine's ID. Three configuration keys governed when the
notes pushed, pulled, and loaded: `user.notes_push`, `session.init_pull.notes`, and `session.init_load.notes`. In the
store model, personal state lives in the store's personal refs and moves with the store's own pull and push.

The seam work built each store path behind a store capability, `capabilities.stateOffBranch` (`StoreCapabilitiesSchema`,
`lib/store/read.ts`), and left the in-repo path beside it. With the capability false, the in-repo store
(`lib/store/in-repo/`) still syncs personal state through the notes machinery.

**Prerequisite: the flip.** This change builds on the flip change (`cutover-flip`) as an expected contract, available
once that change has landed on `main`. From its landing:

- `createStore` (`lib/store/create.ts`) builds the ref backend, so every store a command opens reports `stateOffBranch`
  true. The in-repo store runs only under an explicit override;
- the one-time import (`lib/store/ref/import/`) reads each person's notes ref into the store, and deletes no notes ref;
- the sealing guard (`refuseWriteIfStoreImported`, `lib/store/store-imported.ts`) refuses every notes command that
  writes once the store is imported: `arc user save`, `load`, `push`, `fetch`, `pull`, and `compact`, and `arc rename`'s
  workspace leg (`runUserRenameWorkspace`);
- `arc sync` off the branch runs no notes leg (`finishStoreSync`, `handlers/sync.ts`), and its help no longer names the
  notes leg or `notes_push`;
- the agenda's notes module (`commands/agenda/notes.ts`) and its in-place materialize
  (`commands/agenda/legacy-materialize.ts`) are deleted;
- the flip runs the cutover window, ADR-035's quiesce → import → flip sequence, once in this repository; "the window"
  means it throughout. The window moves the importing machine's notes ref under a namespace that is neither a tag nor
  pushed. ADR-035's item 8, as the flip amends it, keeps that ref there and deletes it with the notes residue refs
  after the window. `origin` holds no notes ref.

None of this holds on `main` before the flip lands, and on `main` item 8 still keeps the old ref as an archive tag.
This change's inventory is therefore measured against the flip's implementation and again once the flip has landed
(§ 6).

**What the flip leaves.** The notes machinery stays in the tree. Almost all of it is dead on the live path, but it is
still reachable:

- from the notes-era `arc user` commands. The sealing guard refuses their writes, but `arc user status` still reads
  notes state, unsealed (`handleUserStatus`);
- from arms that run only with the capability false, under the in-repo store;
- from the one-time import;
- live, from `arc status`'s user section (D9).

Its three keys stay in the configuration schema and the shipped template (`arc/system/arc-config.yml`), whose comments
mark them as having no effect where state is kept off the branch, and `arc sync` still reports `user.notes_push`'s
resolved value (`handleSync`). Left in place, this dead code would be renamed by the product-renames sweep, which
renames ARC's user-visible terms across CLI verbs, output and help, file names, documentation, and shipped prose.

## Goals

1. **No notes-era command surface.** `arc user` registers no `save`, `load`, `push`, `fetch`, `pull`, `compact`,
   `status`, `sync`, or `inbox-list`. `arc status` carries no user section, in text or in `--json`. `arc sync` has no
   `-y`, and its output carries no `notesPush`.
2. **No notes leg anywhere.** No code path reads or writes a notes ref, whether on the live path or in an arm that
   runs only with the capability false.
3. **No notes configuration.** The configuration schema, the shipped template, and this repository's configuration
   carry none of the three keys. Nothing reads them or the `arc.notesPush` Git setting, and `arc update` carries no
   notes-key migrator.
4. **No notes sync-state.** The sync-state ref, the local sync-state file and its schema, and the machine-ID wrappers
   that adopt a legacy ID are gone.
5. **Survivors unchanged.** The pieces § 3 names keep their behavior, among them the inbox entry contracts, the inbox
   writer, the Errand execution offers, `arc inbox`'s target listing, the reference reconcile, and the notes lock.
6. **No dangling reference.** Nothing that remains names a removed command, option, key, slot, or module, except the
   records § 1 exempts.
7. **No notes residue on the owner's clones or `origin`.** Once § 5's step has run, no clone of the repository owner's
   holds a notes-era ref in any namespace, a notes-era machine-local file, or the `arc.notesPush` setting, and `origin`
   holds no notes-era ref (§ 5).

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **The one-time import and its transform** (`lib/store/ref/import/`) are not removed here. A separate change, the
  tracked-state removal (`cutover-tracked-state-removal`), deletes them, with their suites, once the window has run.
  This change lands after it (§ 7), so the notes code only they reached goes here (§ 4).
- **`arc user open` and `arc user close`, `arc user inbox-mark-execute-bound`, the title-keyed inbox operands, and the
  window's refs and tooling** are not removed here. The same change removes them.
- **What the dormant arms keep once their notes legs go** stays. That covers the in-repo store and every
  capability-false arm, the sealing guard's in-repo arm, `lib/user-surfaces.ts` and the user-surface migration
  (`lib/user-surface-migration.ts`) with the notes code it imports, the Errand identity and merge paths, and
  `readLiveRemoteHeads`. A separate change, `cutover-in-repo-removal`, removes them with the in-repo implementation.
- **Strategy and ADR rewrites** stay with the change that rewrites ARC's documentation to the store model,
  `cutover-documentation`. That covers the notes prose in the shipped strategies and the ADRs, `arc join`'s notes
  message, `strategy-user-notes-concurrency.md`, and `TECHNICAL-OVERVIEW.md` § Cross-Machine User State. This change
  removes only the references to the surfaces it removes (§ 1).
- **Replacing or renaming the notes lock, and renaming `lib/user-sync/`** (D3, D7).
- **What the flip itself changes** (§ Introduction) is not redone here: the notes ref's move aside, the agenda's notes
  module and in-place materialize, and `arc sync`'s help.
- **The documentation site** under `docs/` is not edited.

## Proposed Design

### 1. The boundary rule

**A pure deletion.** This change removes notes-specific sync and keeps what § 3 names. It adds no abstraction,
refactors no survivor, and changes no survivor's behavior, apart from four things:

- D4's machine-ID adoption;
- the arms that run only with the capability false, which lose their notes legs (D1);
- the removals on live surfaces that § 2 names: `arc sync`'s `-y`, `notesPush`, and inspection-failure `notes` record
  (§ 2.4), the session-init envelope's notes slots (§ 2.5), `arc status`'s user section (§ 2.6), and the three keys in
  `arc config status`, the session envelopes' `config` slot, and the agenda document's `residual.config` (§ 2.9);
- the agenda's narrow entry channel, which keeps its behavior and is renamed once it selects no notes step (§ 2.5).

A move that needs a design of its own stops and goes to the Owner. Two moves need none: D4 repoints two callers to a
module already on `main`, and D1 relocates `arc rename`'s workspace move.

**Every outside caller is classified.** The census (§ 6) finds every caller into the deletion set from outside it. Each
one belongs to exactly one class:

- a survivor (§ 3);
- a caller the tracked-state removal deletes before this change lands: the import, the window's tooling, and their
  suites (§ 4, § 7);
- a leftover that goes with its last caller (§ 4);
- a dormant host that loses its notes leg (D1);
- a surviving live host whose notes part § 2 removes.

A caller no class covers is a design question, routed back to this specification.

**What only the deletion set reaches goes with it.** Once § 2's members are gone, code that nothing outside the
deletion set reaches is a member too, wherever it lives: a constant, field, type, branch, or detail string, and a
machine-local file only that code wrote (§ 5). The census finds it (§ 6).

**References.** Removing a surface also removes every reference to it that remains when this change lands. That
includes links, remedy and help strings, examples, test assertions, prose mentions, and entries that name a removed
file. It covers every tracked file in the repository outside `docs/`, among them source, tests, the shipped `arc/`
tree, the package's configuration (the size gate's record, `eslint-suppressions.json`, among it), this repository's
`.arc/` and `.github/`, and the root `scripts/`. Exempt from this:

- point-in-time records: an ADR's Context and other invariant sections, dated analyses, completed work units' records,
  and the package changelog, D5's entry among them;
- tests that assert a removed surface is absent, such as a check that a command is no longer registered;
- the dormant code § Non-Goals keeps, whose references leave with it;
- doctrine the documentation rewrite owns (§ Non-Goals). There this change removes only the reference and leaves the
  rewrite, so no landing order binds the two.

**Tests.** A suite whose subject is deleted goes with it. A surviving suite loses the cases that pin a removed leg and
keeps the cases that pin the arm's remaining result (D1). That covers the in-repo store's suites, the differential
harnesses, and the lane that runs both backends, whose cases for the personal family's pull and publish go. A test is
added only where a survivor moves or a removal is visible to users:

- D4's machine-ID callers and `arc rename`'s workspace move (D1);
- each removed `arc user` subcommand, each retired key, `arc sync`'s `-y` and `notesPush` (D1, D5), and `arc status`'s
  user section (D9);
- the session envelopes' removed slots and keys, which their wire-compatibility goldens pin, and the keys the agenda
  document's `residual.config` loses (§ 2.5, § 2.9).

The rename case in the user suite (`__tests__/integration/user.test.ts`, "user workspace rename") keeps its
directory-move assertions, loses its notes-save assertions (the manifest read through `readNote`), and follows the moved
code.

**Size.** The change stays whole past the project's mark of about 10,000 changed lines (D2, § 8). Anything that stops
being a pure deletion is flagged.

### 2. What goes

Measured at the flip's head `8dcf8562e3` in `packages/arc-framework/src/`, before tests: `lib/user-sync/` (33 files,
5,816 lines) and `commands/user/` (20 files, 6,893 lines) together come to about 12,700 lines. `handlers/user-sync.ts`,
`handlers/push-recovery.ts`, and `lib/git/user-sync.ts` add about 900 more, and `handlers/user-inbox-list.ts` about 170.
Each section states its rule, with its known members. The census (§ 6) completes each list.

#### 2.1 The notes machinery

`lib/user-sync/` goes, except its survivors (§ 3) and the leftovers that wait for their last caller (§ 4).
`commands/user/` goes too, except the modules that serve the surviving subcommands, the subcommands the tracked-state
removal takes, and the survivors' types: `add.ts`, `inbox-remove.ts`, `inbox-mutation.ts`, `inbox-store.ts`, `open.ts`,
`close.ts`, `session-init-schema.ts`, and `types.ts`. At the flip's head that leaves these known members:

- `save-load.ts`, `push-fetch.ts`, `compact.ts`, `sync-status.ts`, and `drift.ts`;
- `paired-push.ts`, `notes-push-retry.ts`, `inbox-list.ts`, and `format.ts`;
- `ancestry-message.ts`, `relative-time.ts`, and `shared.ts`.

With them go:

- the notes exports of `commands/user.ts`, the barrel through which the `arc user` family is imported;
- the notes parts of `commands/user/types.ts`. `UserIOContext` loses its `writeNote` and `readNote` fields, and the
  notes result and error types go;
- the notes parts of `lib/io-context.ts`: `createUserIOContext`'s note writer and reader (`writeGitNote`,
  `readGitNote`);
- the notes parts of `handlers/user.ts` and `handlers/shared.ts`, the latter including `isUserFetchOutcome` and
  `isUserFetchSuccess`;
- `handlers/user-sync.ts` and `handlers/push-recovery.ts`;
- the notes-only parts of `lib/git/user-sync.ts`, which holds the notes manifest, allowlist, size cap, and secret
  exclusions, and the in-repo store's notes I/O (`notesIO`, `lib/store/in-repo/sync-io.ts`);
- the materialized-baseline stamp (`lib/user-sync/materialized-baseline.ts`), which only the notes save, load, and
  status use;
- `resolveCurrentWuName` (`lib/user-sync/current-wu.ts`), whose every caller is a notes command or handler (D7);
- the tombstone writers, which only `arc user save` reaches: `save-load.ts`'s local `applyRemovalTombstones`,
  `appendRemovalTombstones`, `appendRemovalTombstonesFromEntries`, and `synthesizeTombstones`. The tombstone readers
  leave with their last caller (§ 4): `stripTombstoneSections`, through `mergeCrossWuFile` and `projectManifest`, and
  `TOMBSTONE_TTL_MS`, through `CROSS_WU_NOTE_WINDOW_MS`;
- `lib/user-sync/parser.ts`'s copy of `matchInboxEntryTitle`, which nothing calls. Every live caller takes the copy in
  `lib/store/kinds/entry-fields.ts`, which is outside the notes code.

#### 2.2 The notes-era `arc user` subcommands

`arc user save`, `load`, `push`, `fetch`, `pull`, `compact`, `status`, `sync`, and `inbox-list` go:

- their handlers, `handlers/user-inbox-list.ts` among them;
- their registrations in `cli.ts` and their input registrations and policy declarations
  (`command-input-registrations.ts`);
- their help.

`arc user inbox-list` reads no notes ref. It lists the personal-inbox captures whose `WU_Target` line names a work
unit (`listInboxEntriesNamingTarget`, which § 3 keeps for `arc inbox`). The flip replaces it with `arc inbox <list>`,
whose `--target <slug>` keeps its `clear`, `named`, or `refused` result, and leaves it inert. So it goes with the
others, and D5's notice names `arc inbox` as its replacement.

The sealing guard's calls go with them: `refuseWriteIfStoreImported` in `save-load.ts`, `push-fetch.ts`, and
`compact.ts`, and `push-fetch.ts`'s use of `StoreImportedError` and `storeImportedHere`. So does the guard's reach to
`arc user load` (`runUserLoad`), which the window's tooling added and which stays only until these commands are deleted.
`arc rename`'s workspace leg is not among them: its move keeps its refusal (D1).

#### 2.3 The notes legs of the dormant arms (D1)

With the capability false, the in-repo store and its hosts still reach notes code. Each such arm loses its notes leg,
keeps the rest of its behavior for the in-repo implementation's removal, and changes only where a notes leg was:

- **`pullInRepo`** (`lib/store/in-repo/pull.ts`). Its only leg, `pullPersonal`, which runs `runUserFetch` and then
  `runUserLoad`, goes. It reports its configuration states (`no-remote`, `no-identity`) and no pull. Nothing on the
  import path reaches it: the import reads the notes ref itself and never pulls its source store.
- **`pushInRepo`** (`lib/store/in-repo/sync.ts`). The personal publish goes: `runUserSave`, `reconcileNotesPush`, and
  `notesPublish` (`lib/store/in-repo/sync-outcomes.ts`). It publishes the transient family alone, through
  `reconcileErrandPush` and `transientPublish`.
- **Session-init** (`handlers/status.ts`). With the capability false, the `user` slot runs `runUserSessionInitStatus`.
  It reads the store's user pull (`getStoreUser()`) on both arms instead, which yields `null` with the capability false.
  The partial-push marker, compaction advisory, and retired-subdirectory slots go with their surfaces (§ 2.5). The
  ref arm already leaves them empty.
- **The retired-subdirectory reconcile.** It is notes-load machinery end to end:
    - `commands/status/run.ts` reads `session.init_load.notes` and passes it to `inferRetiredSubdirs`
      (`lib/session-init/recommended-action.ts`);
    - that recommendation's remedy runs the reconcile inside `arc user load` (`runUserLoad`).

  So it goes, with `lib/session-init/retired-subdir-detection.ts`.
- **The handoff probes.** Their `user` slot (`createHandoffProbes`, `handlers/status/session.ts`) returns `null` on
  both arms, as it already does with the capability true.
- **`arc user open`** with the capability false (`handleUserOpen`, `handlers/user.ts`). Its retired-subdirectory
  reconcile (`reconcileRetiredSubdirsStandalone`) is a caller into the deletion set. The tracked-state removal deletes
  the command, with that call, before this change lands (§ 7).
- **`arc rename`'s in-repo arm.** `runRename` (`lib/work-unit/verbs/rename.ts`) sends an off-branch store to
  `runStoreRename`, so the `renameUserWorkspace` port (`commands/rename.ts`) runs only with the capability false. It
  runs `runUserRenameWorkspace` (`commands/user/save-load.ts`), which:
    1. refuses once the store is imported;
    2. takes the notes lock;
    3. moves the workspace directory through `reconcileRenameUserWorkspaceDirectory`
       (`lib/work-unit/rename-user-workspace.ts`), over a Node file-system adapter defined in `save-load.ts`
       (`nodeRenameUserWorkspaceFs`);
    4. saves notes under the same lock.

  The save goes. The port keeps the refusal, the lock, and the directory move, and its result reports the move's
  status (`moved`, `already-moved`, or `absent`) alone. `runUserRenameWorkspace`, without its save, and
  `nodeRenameUserWorkspaceFs` move out of `save-load.ts` to sit beside `reconcileRenameUserWorkspaceDirectory`.
- **`arc sync` with the capability false**: § 2.4.

The exceptions are the user-surface migration and the sealing guard's in-repo arm, which the in-repo implementation's
removal deletes (§ Non-Goals). They keep the notes code they import until they go (§ 4).

#### 2.4 `arc sync`'s notes leg

`handleSync` (`handlers/sync.ts`) branches on `stateOffBranch` after a shared preamble: the root check
(`prepareSyncRoot`), the projection restore, settings resolution, the interlock state, and the worktree inspection.

**With the capability false**, the notes leg goes:

- the matrix's notes action (`decideNotes`);
- the paired push (`executePaired`, `pairedNotesAdapter`, `publishMarkerAdapter`), with the pushability matrix's
  `notes` and `both` targets (`PushabilityTarget`, `lib/git/pushability.ts`);
- the notes save and push (`performSave`, `completeNotesLeg`, `pushNotesLeg`), wherever the worktree paths call them,
  and the notes push question (`syncNotesPushPromptSite`, `askSyncNotesPush`, `resolveSyncNotesPushQuestion`);
- the outcome's `save` and `notes` leg records and its `retryOffer`, which only the paired push fills (`SyncOutcome`),
  and the notes parts of its dry run (`dryRunNotesAction`, `describeNotesAction`) and rendering
  (`renderPairedNotesOutcome`, `partialPublishRecoveryLine`, and the notes records of the blocked, rebase, and inbound
  paths, among them);
- the Errand leg's partial-push marker (`recordErrandPartialPushMarker`, `clearErrandPartialPushMarker`, and their
  wrappers in `handlers/sync.ts`). The leg writes it to `.sync-state.json`, and nothing reads it. The leg's failure
  detail loses its `:marker-not-recorded` suffix (`errandPartialPushDetail`), and its success record loses the
  `marker-clear-failed` detail (`reconcileErrandSuccessRecord`).

The arm keeps the rebuild, the branch leg it shares with the store path (`pushBranch`, `pullBranchInbound`), and the
Errand reconcile leg (`reconcileErrandLeg`). Each cell names the worktree action alone:

- a worktree push reports `worktree-only`, or `worktree-only-with-upstream-init`;
- an inbound pull reports `inbound-pull`;
- a blocked worktree reports `blocked-<reason>`;
- a skipped worktree push reports `noop`. Today those cells name only the notes action (`notes-only`, `notes-prompt`,
  `notes-blocked`, `save-only`).

The audit's `cell` is a free string (`SyncOutcomeSchema`, `lib/release/schema.ts`), so `noop` needs no schema change.

**On both arms**:

- **`-y`.** `arc sync`'s `-y` goes, with its option site in the sync input policy declarations
  (`syncCommandInputPolicyDeclarations`) and its echo in the worktree inspection failure path's JSON remedy argv
  (`handlers/sync-worktree-inspection.ts`). Its only effect beyond the global `--no-input` is answering the notes push
  question, through the interaction context's `confirmation`. Otherwise it does what `--no-input` does: it makes the
  run non-interactive (`resolveInteractionContext`, `lib/command-input/interaction-context.ts`), so the store
  designation question goes unasked (`offerStoreDesignation`, `handlers/store-designation.ts`) and the branch leg's Git
  runs without terminal prompts. So `--no-input` replaces it (D5).
- **The inspection failure's `notes` record.** That shared failure path writes a skipped `notes` record to the audit
  entry only (`writeSyncAuditEntry`), and the record goes. With it goes the audit's `notes` token
  (`SyncOutcomeSchema`'s `notes`, `lib/release/schema.ts`, and its encoding in `handlers/sync-audit.ts`).
- **`notesPush`.** `arc sync`'s output loses `notesPush` from its interlock state (`InterlockState`,
  `handlers/sync.ts`), and the audit entry's snapshot of that state loses it too (`SyncInterlockStateSchema`,
  `lib/release/schema.ts`; D5).

#### 2.5 The session-init notes surfaces

- `lib/session-init/notes-compaction-advisory.ts` and `lib/session-init/partial-push-marker-surface.ts` go, with their
  slots in `handlers/status.ts` and the compaction advisory's nudge marker path
  (`NOTES_COMPACTION_NUDGE_MARKER_RELATIVE`, `handlers/status/session-evidence.ts`), which only that slot reads. The
  nudge reader (`resolveNudgeState`) stays for the Errand and work-unit staleness nudges.
- The view schema (`commands/status/schema.ts`) loses the entries of the `partialPushMarker`, `compactionAdvisory`, and
  `retiredSubdirs` slots:
    - The exact-presence rule loses `retiredSubdirs` and `partialPushMarker`, and stays for `pausedWork`.
    - `compactionAdvisory`'s own presence rule goes.
    - `lib/session-envelope/registry.ts` loses their schemas' registrations (`notesCompactionSessionAdvisory`,
      `partialPushMarkerSurface`, `retiredSubdirDetection`).
- `composeNotesPromptText` and `composeCombinedPrompt` (`lib/session-init/recommended-action.ts`) go, with the notes
  inputs of `commands/status/run.ts`.
- The session-init envelope's `recommendedCombinedPrompt`, which only `composeCombinedPrompt` fills, goes. That covers
  its entry in the view schema and its clause in the recommendation-prerequisite refinement
  (`refineRecommendationPrerequisites`), and its fields in `commands/status/types.ts`, `commands/status/run.ts`, and
  `recommended-action.ts`.
- The user recommendation's notes branch (`inferUser`) goes, with the refinement's clause that forces a notes-shaped
  `user` value to `skip`.
- The notes drift verdict that `commands/status/run.ts` folds into the `user` slot goes, in session-init and in handoff
  (`resolveCleanArmNotesVerdict`, `commands/user/drift.ts`).
- The retired-subdirectory slot, `inferRetiredSubdirs`, and `lib/session-init/retired-subdir-detection.ts` go (§ 2.3).
- The capability-false `user` slot's call to `runUserSessionInitStatus` goes (§ 2.3).
- The `user` slot's notes variant goes (`NotesSessionInitUserValueSchema`, `commands/user/session-init-schema.ts`).
  `SessionInitUserValueSchema` then admits the store's value (`StoreSessionInitUserValueSchema`) or `null`. With it go
  the notes discriminator `isNotesSessionUser` and the notes summary in session-init's text rendering
  (`buildUserSessionInitStatusSummary`, through `commands/status/format.ts`).
- The agenda's notes channel goes, as far as the flip leaves it:
    - the notes steps of the narrow entry channel, `SyncChannels`' `notes` value (`commands/agenda/compile-input.ts`);
    - the `notes:pull` and `notes:load` entries of `CHANNEL_POLICIES` (`commands/agenda/sync-state.ts`), which read the
      two session keys;
    - `combineSyncOffers`' notes arm (`commands/agenda/combine.ts`), which reads `recommendedCombinedPrompt`;
    - the notes slots and surfaces in the orientation's resume list (`commands/agenda/orientation.ts`);
    - any reader of `compileNotesSync` in `prefix.ts`, `reads.ts`, or `sync-state.ts`;
    - the module itself, if the flip keeps it.

  That value narrows more than notes, and the narrowing stays. The start, plan, and Errand entries pass it
  (`signal-start.ts`, `signal-plan.ts`, `signal-errand.ts`), as do the housekeep and context entries
  (`compileCheckoutEntry`, `signal-checkout.ts`). With it they offer no worktree, base, superseded-reset, or reference
  sync, since `compileSyncPrefix` (`prefix.ts`) returns before composing any of them, and they report the worktree and
  base as unsynced (`compileSyncState`, `sync-state.ts`, which `compileCheckoutSessionOrientation` in `orientation.ts`
  reads). `resetPending` (`superseded.ts`) also tests the value. Once the value selects no notes step, it is renamed for
  what it selects (§ 1), and those entries keep that behavior.

The session envelope family is registered `strict-current` at version 1 (`STRICT_CURRENT_V1`,
`lib/session-envelope/registry.ts`). So these slots leave the envelope in place, with no version change. The envelope's
wire-compatibility goldens (`__tests__/e2e/session-envelope-compat.e2e.test.ts`) change with them.

#### 2.6 `arc status`'s user section (D9)

The plain `arc status` (`handleCompositeStatus`, `handlers/status/session.ts`) loses its user section on both arms:

- the `user` probe (`runUserStatus`, `commands/user/sync-status.ts`);
- its text rendering (`renderSlot("User", …)` with `buildUserStatusSummary`, `commands/status/format.ts`);
- the `user` field of `arc status --json`.

The command keeps its identity, configuration, active-work, and projection sections. Its description and help stop
naming user sync wherever the flip's help rewrite leaves it. That help is the description in `cli.ts` and the `status`
entry in `lib/cli-help-content.ts`.

#### 2.7 The sync-state contracts and the machine ID (D4)

- **The sync-state ref**, `refs/arc/user/<id>/sync-state` (`syncStateRef`, `lib/user-sync/sync-state-ref.ts`). Its
  writers are `arc sync`'s paired push (`publishMarkerAdapter`, through `publishSyncStateMarker`) and
  `arc user compact` (`publishNotesCompactionSyncMarker`). Its one reader is `partial-push-marker-surface.ts`, through
  `readSyncStateMarker`. `readNotesCompactionSyncMarker` is exported, and nothing calls it. The store does not read the
  ref.
- **The local sync-state file** (`.sync-state.json`, `LOCAL_SYNC_STATE_FILENAME`) and its readers and writers, with its
  schema, `PersistedLocalSyncStateSchema`, and that schema's registration as `local-sync-state` in
  `lib/validation-surfaces/registry.ts`.
- **The machine-ID wrappers**, `getOrCreateMachineId` and `getOrCreateMachineIdAtCommonDir`
  (`lib/user-sync/sync-state.ts`). The store's default ports (`lib/store/default-ports.ts`) and the projection's engine
  ports (`lib/store/projection/engine-ports.ts`) instead resolve the common Git directory and call
  `getOrCreateMachineId` in `lib/store/machine-id.ts` directly, with no legacy candidate (D4).

#### 2.8 The notes-only publish outcomes

`PublishOutcomeSchema` (`lib/store/sync.ts`) loses `blocked`, `unpublished-history`, `history-diverged`,
`compaction-lineage`, and `proof-unavailable`, which only `notesPublish` produces. `conflict` stays, since
`transientPublish` produces it.

#### 2.9 The configuration keys (D5)

`user.notes_push`, `session.init_pull.notes`, and `session.init_load.notes` go:

- their schema entries (`lib/config/schema.ts`);
- `resolveNotesPushPolicy` and the `arc.notesPush` Git setting (`NOTES_PUSH_GIT_CONFIG_KEY`,
  `lib/config/resolved-settings.ts`);
- their readers. Known members: `handlers/sync.ts`, `handlers/user-sync.ts`, `lib/config/index.ts`,
  `lib/config/resolved-settings.ts`, `lib/config/status-reader.ts` (`TOLERANT_POLICY_KEYS` among them),
  `commands/config/status.ts`, `commands/config/types.ts`, `commands/config/validate.ts`, `commands/status/run.ts`,
  `commands/status/types.ts`, `lib/release/schema.ts` (`notesPush`), and the agenda's channel policies (§ 2.5);
- the migrator in `commands/update.ts` (`migrateUserSyncPush`, `translateLegacyNotesPushValue`), which renames a legacy
  `user.sync_push` to `user.notes_push` (D5);
- their entries and comments in the shipped template (`arc/system/arc-config.yml`) and in this repository's
  `.arc/system/arc-config.yml`, including the solo/team default note for `user.notes_push`.

The session-init configuration settings (`ConfigSessionInitSettingsSchema`, `commands/config/status.ts`) are strict
and require all three keys. Through the result that carries them (`ConfigSessionInitResultSchema`, registered as
`config-session-init` in `lib/session-envelope/registry.ts`), they type `arc config status --session-init --json`, the
`config` slot of both the session-init and the session-recover envelopes (`commands/status/schema.ts`), and the
`residual.config` of `arc agenda session-init`'s document (`SessionInitAgendaSchema`, `commands/agenda/schema.ts`,
registered as `session-init-agenda`). So each loses the three keys in place, as § 2.5 sets out for the envelope's
slots, and every session-envelope golden changes with it, the recovery-audit goldens among them.

`session.remote_sync` and `push.interlock` stay, as do `session.init_pull.worktree` and `session.init_pull.base`.

#### 2.10 The suites that target notes

Every test whose subject is a removed module, command, slot, key, or leg goes, under § 1's test rule.

#### 2.11 The references and the notice

The references to each removed surface go, under § 1's rule. Known members:

- remedy and log text naming `arc user push` and its siblings;
- `cli.ts`'s help for the removed subcommands;
- the notes-key comments in both configuration files;
- `TECHNICAL-OVERVIEW.md`'s references to the removed surfaces. Those are § Customization Surfaces' "user-notes push
  behavior" and the sentence in § Cross-Machine User State that has the `arc user` group handle push, pull, and load and
  `arc sync` orchestrate user-notes sync. The rest of that section is the documentation rewrite's.

D5's changelog entry carries the notice.

### 3. Survivors

These stay, with their behavior unchanged:

- **The cross-work-unit entry contracts** (`lib/user-sync/schema.ts`): `CrossWuEntrySchema` and
  `CrossWuEntryParseSchema`, from which the types `CrossWuEntry` and `EntryParse` derive. The store's personal-inbox
  parser (`parsePersonalInboxEntries`, `lib/store/kinds/personal-inbox.ts`) produces `EntryParse` values. Inbox state
  and reminders (`lib/session-init/inbox-state.ts`, `inbox-reminders.ts`) consume them, and the target listing consumes
  `CrossWuEntry`.
- **Entry helpers**: `inboxEntrySourceDigest` and `hasExecuteBoundDisposition` (`lib/user-sync/inbox-writer.ts`), and
  `stripHtmlComments` (`lib/user-sync/parser.ts`). They serve `lib/store/legacy-inbox-origin.ts`, inbox state, and
  `lib/store/session-notes-fields.ts`.
- **The inbox writer and execution offers**:
    - `removeCurrentInboxEntry`, `unmarkCurrentInboxEntry`, `runUserInboxMutation`, and `withLockedUserInbox`
      (`commands/user/inbox-mutation.ts`);
    - `InboxMutationConflictError`, `inspectInboxEntry`, and `listExecuteBoundInboxEntries`
      (`lib/user-sync/inbox-writer.ts`), which `handlers/errand.ts` and the offers use;
    - `resolveExecutionNextOffer` and `resolveExecutionStartupOffer` (`lib/user-sync/execution-offer.ts`), which
      `handlers/errand.ts` and `commands/errand-next.ts` call;
    - `listInboxEntriesNamingTarget` (`lib/user-sync/inbox-target.ts`), which `arc inbox` reads
      (`lib/inbox/listing.ts`).
- **`UserIOContext`** (`commands/user/types.ts`), which store paths take, without its note writer and reader.
- **The session envelope's store-user schema** (`StoreSessionInitUserValueSchema`, through
  `commands/user/session-init-schema.ts`).
- **The surviving `arc user` subcommands**: `add`, `reconcile-references`, and `inbox-remove`. The tracked-state removal
  takes `open`, `close`, `inbox-mark-execute-bound`, and the title-keyed inbox operands.
- **The notes lock** (D3): `getNotesLockPath` (`lib/user-sync/notes-lock.ts`), with `getRepoSharedUserInternalDir`
  (`lib/user-sync/repo-shared-paths.ts`), which locates its file.
- **The Git helpers already moved out of the notes code**: the failure-text predicates (`isCasRejectionError`,
  `isRemoteUnavailableError`, `isNonFastForwardError`, `lib/git/ref-tree.ts`) and `resolveGitCommonDir`
  (`lib/git/exec.ts`) stay where they are (D7).

### 4. Shared pieces and landing order (D2)

Some notes code stays only because something this change does not delete still reaches it. Each such piece goes with
its last caller, in whichever change removes that caller. A test whose subject survives this change counts as a caller.

**The one-time import.** This change lands after the tracked-state removal (§ 7), which deletes the import
(`lib/store/ref/import/`), the window's tooling, and their suites. Until then they reach notes code, which goes here
once they are gone. The import imports:

- `mergeCrossWuFromNotes` (`commands/user/save-load.ts`);
- `projectManifest` (`lib/user-sync/projection.ts`);
- the notes-ref readers' `notePathToCommit`, `NOTES_COMPACTION_SNAPSHOT_MESSAGE`, `CROSS_WU_NOTE_WINDOW`,
  `CROSS_WU_NOTE_WINDOW_MS`, and `RecentNote` (`lib/user-sync/notes-ref.ts`);
- `isAllowedFile`, `MAX_FILE_SIZE`, and `isSafeManifestPath` (`lib/git/user-sync.ts`).

Its other notes imports survive anyway: `stripHtmlComments`, `hasExecuteBoundDisposition`, `inboxEntrySourceDigest`,
and `listExecuteBoundInboxEntries`.

Their suites create notes test data through `runUserSave` and `runUserLoad`: the import's through `saveImportPersonal`
(`__tests__/helpers/store/import-fixture.ts`), `store-ref-import-notes.test.ts`, and
`store-ref-import-personal-layout.test.ts`, and the window tooling's through `cutover-window-fixture.test.ts`. Two of
the import's suites also write notes directly through `UserIOContext`'s note writer (`makeUserIO`):
`store-ref-import-notes.test.ts` and `store-ref-import-annotated-commit-loss.test.ts`. So `runUserSave`, `runUserLoad`,
the notes code they reach, and `UserIOContext`'s note writer and reader go only once `main` carries the tracked-state
removal (§ 7).

**The in-repo implementation.** The same rule holds with the in-repo implementation's removal, and both can land in
either order. Its pieces are:

- the sealing guard's module (`lib/store/store-imported.ts`, `handlers/pre-cutover-seal.ts`). After this change,
  `arc rename`'s relocated workspace move, the Errand paths, `arc sync`'s root check (`prepareSyncRoot`), and the
  tracked-state refusal (`trackedStateRefusal`, `lib/store/selection.ts`, through `storeImportedHere`) still call it;
- the notes code the user-surface migration imports (`shapeForFile`, `classifyUserSyncPath`, `mergeCrossWuFile`), with
  what that code reaches: `parseCrossWuEntries`, `stripTombstoneSections`, and `CrossWuShape`
  (`lib/user-sync/types.ts`);
- the notes lock's in-repo callers (D3);
- `isCasRejectionError`, whose last caller after this change is `applyAndPublish` (`lib/errand/identity-transaction.ts`)
  (D7);
- the Errand ref-tree and publication helpers: `errandsRef`, `writeTreeCommit` with `RefTreeWriteIO`, `hashBlob`,
  `reconcileErrandPush`, `lib/git/publication-failure.ts`, and `MAX_RECONCILE_ATTEMPTS`. The Errand identity and merge
  paths and the in-repo transient writer call them (D7);
- `PublishOutcomeSchema`'s `conflict` (§ 2.8).

### 5. The refs and machine-local files (D8)

A step run by hand at this change's verification, with the repository owner present and no shipped code, removes the
following from each of the owner's clones that holds them, after the window has closed:

- every notes-era ref, in any namespace: a ref whose tip is a commit made on a notes ref or on the sync-state ref,
  whether the ref is the original, a backup, or a temporary copy. Its known members are:
    - the old notes ref, `refs/notes/arc/user/<id>`, under the namespace the window moved it to;
    - the notes residue refs: `refs/notes/test`, `refs/notes/tmp-remote-andrew`, `refs/notes/tmp-remote-andrew-fresh`,
      and `refs/notes/arc/user/test-user`;
    - the sync-state ref, `refs/arc/user/<id>/sync-state`;
    - the backups of the notes ref and the sync-state ref made by hand: `refs/arc-backup/notes-pre-retirement`,
      `refs/arc-backup/sync-state-pre-retirement`, and `refs/backup/notes-arc-user-<id>-<date>`;
    - the notes compaction's backups, `refs/backup/arc-user-<id>-compaction-g<N>-created-…` (`backupRefFor`,
      `lib/user-sync/compaction.ts`), which only the removed `arc user compact` prunes. The compaction pushes each one
      to `origin` and writes none locally, so a clone holds one only if it was fetched;
    - the temporary refs the notes code leaves when its best-effort cleanup fails:
        - the status inspection's `refs/arc-sync-temp/<id>_…` (`inspectUserSyncRefsDetailed`, `TEMP_SYNC_REF_PREFIX`,
          `commands/user/sync-status.ts`);
        - the sync-state merge's tracking refs, `refs/arc/user/<id>/sync-state__incoming__…` (`reconcileTrees`,
          `lib/user-sync/sync-state-merge.ts`);
        - the copies beside the notes ref, `refs/notes/arc/user/<id>__<kind>_…`: the fetch's `__fetch_`
          (`runUserFetch`, `commands/user/push-fetch.ts`), the notes merge's `__incoming_` (`incomingNotesRef`,
          `lib/user-sync/notes-merge.ts`), the branch-bounded export's `__publication_`
          (`planBranchBoundedNotesExport`, `lib/user-sync/branch-bounded-notes-export.ts`), and the compaction's
          `__compact_adopt_` (`lib/user-sync/compaction.ts`);
- every notes-era machine-local file, wherever the notes code wrote it:
    - the local sync-state file `.sync-state.json` and its lock `.sync-state.lock`, in each checkout's identity
      `.internal/` folder (`.arc/user/<id>/.internal/`), and the file at its legacy path
      `.arc/user/<id>/.sync-state.json`;
    - the notes load's backups (`.pre-load-backup.json`, `.pre-load-backup-<timestamp>.json`), in the identity roots and
      their `.internal/` folders, the identity-global root's among them (`listBackupFiles`);
    - the compaction advisory's nudge marker, `.internal/notes-compaction-last-nudge.txt` under the identity-global
      root;
    - the legacy checkout-local machine ID, `.arc/user/<id>/.internal/.machine-id`, which only D4's removed adoption
      reads;
    - under the common Git directory: the materialized-baseline stamp (`materialized-baseline.json`);
- the clone's local Git setting `arc.notesPush`, which `resolveNotesPushPolicy` reads.

`origin` holds no notes-era ref: on 2026-11-19 it held only `HEAD`, branches, tags, pull-request refs, and the Errand
identity ref `refs/arc/user/<id>/errands` (`git ls-remote`). So nothing is expected to be removed remotely. The step
repeats that check when it runs, and a notes-era ref it finds on `origin` goes there too, by the same rule, with the
repository owner approving that push. On 2026-11-17 the primary clone held the old notes ref, still at
`refs/notes/arc/user/andrew`, the four residue refs, the sync-state ref, and the three hand-made backups, and no
compaction backup or temporary ref. It also had `arc.notesPush` set to `manual`, 12 checkouts held a
`.sync-state.json`, and the primary held four notes-load backup files. The step works from the rules above, not from
these counts.

### 6. The census

The census is an importer sweep. For every module, export, command or option registration, configuration key,
schema entry, and slot in § 2's deletion set, it finds every importer, caller, registration, or reader outside that
set, and places each one in a class of § 1. It also finds every reference § 1's rule removes, such as an entry in the
size gate's record that names a deleted file. Both sweeps cover every tracked file outside `docs/`, as § 1's reference
rule does. The census also runs the other way: anything outside the set that only members reach joins the set, under
§ 1's rule. The task list's file lists come from it.

It runs four times:

- **Before the task list is generated**, against the flip's branch head. The task list is built from it.
- **Once the flip has landed.** Implementation begins by re-running it against the flip as merged, and by amending the
  task list in place. A new member that a rule here covers joins that rule's tasks, and a member that has gone leaves
  them. This run also:
    - settles which of the agenda's notes channel the flip left (§ 2.5), and where the flip's help rewrite left
      `arc status`'s user-sync wording (§ 2.6);
    - settles which suites that target the in-repo store the flip re-homed, which sets the suites left here (§ 2.10);
    - confirms that every clone of the owner's holds its machine ID under the common Git directory (D4).
- **Once `main` carries the tracked-state removal**, after merging it in. The callers that change deleted leave § 1's
  classes, and the deletions they held back go (§ 4, § 7).
- **At this change's verified head**, with `main` merged in, as a success criterion.

A caller no class covers, or a member no rule here covers, is a design question routed back to this specification.

### 7. Ordering

- **This change builds after the flip lands.** It needs the switch to the ref store and the sealing guard in place.
- **It lands before the product-renames sweep starts**, which waits on it.
- **It lands after the tracked-state removal** (`Depends On: cutover-tracked-state-removal`, D2). The edge orders only
  the landing: this change builds alongside that one and is implemented and checked when it lands. What remains then
  is merging `main`, making the deletions held for it (§ 4), and rerunning the checks. Verification, § 5's step among
  it, runs only after those deletions, since Goals 2 and 4 and Success Criterion 5 cannot hold before them.
- **If the edge is dropped.** The Owner reads both changes' forecasts when the flip lands and both builds start, and may
  drop the edge if the tracked-state removal's landing projects well after this change is ready. This specification is
  then amended to keep, until the tracked-state removal lands, the notes code that the import, the window's tooling,
  their suites, and `arc user open`'s reconcile reach (§ 2.3, § 4). That includes the notes save/load core
  (`runUserSave`, `runUserLoad`, and the notes code they reach), `UserIOContext`'s note writer and reader, and the
  import's notes imports. Every statement that assumes those callers gone first takes that exception: Goals 2 and 4,
  § 1's caller classes, § 2, § 2.3's `arc user open` bullet, § 3, Cross-cutting § Security, and Success Criterion 5.
  That case rests on an expected contract of the tracked-state removal, available once its specification states it:
  code that only the callers it deletes reach goes with them, the notes save/load core among them. If its
  specification does not state that when the edge is dropped, its plan is amended too.
- **It lands in either order with the in-repo implementation's removal** (§ 4).
- **Within the change:**
    - Each removed command leaves with its registration, its input declarations, and its help, since the command-input
      inventory (`repository-inventory.test.ts`) requires every registered command's input to be declared.
    - Each removed link leaves in the same change as its target, since CI's link audit (`lint:arc:links`) fails on a
      dangling one.
    - The machine-ID callers move (D4) before the wrappers are deleted.
    - The deletions held for the tracked-state removal land once `main` carries it: the notes code that the import,
      the window's tooling, their suites, and `arc user open`'s reconcile reach (§ 2.3, § 4).

### 8. Settled decisions

Settled 2026-11-17 unless marked otherwise.

- **D1. Every notes leg goes, wherever it runs** (§ 2.3, § 2.4). The in-repo implementation's removal is planned to
  land between the flip and the product-renames sweep, but may land after the sweep. Leaving the notes code that dormant
  arms reach to that change would keep most of the notes machinery alive through the sweep. So each dormant arm loses
  its notes leg here. The retired-subdirectory slot goes here too, with the notes load it rides on. _ADR:_ `none`,
  temporary: it divides one deletion between two changes.
- **D2. After the tracked-state removal; in either order with the in-repo implementation's removal, the second to
  land deleting what the first left** (§ 4, § 7). A test whose subject survives this change counts as a caller. The
  import's and the window tooling's suites seed notes through `runUserSave` and `runUserLoad`, and two of them write
  notes through `UserIOContext`'s note writer. Landing first, this change would keep that save/load core and those
  fields, against Goals 2 and 4 and § 3, and the tracked-state removal would inherit deleting them. A `Depends On` edge
  does not block activation: `runStoreActivate` (`lib/work-unit/verbs/activate-deactivate-store.ts`) refuses only on a
  reconcile conflict, and `planStoreDependencyReconcile` (`lib/work-unit/side-effects/store-dependency-rows.ts`) keeps
  an unlanded edge live. So the two still build alongside, and only the landing is ordered. The Owner may drop the edge
  at the flip's landing (§ 7). _ADR:_ `none`, temporary: a landing order.
    - **Size.** The change stays one unit past the project's mark of about 10,000 changed lines, about 13,600 lines of
      notes code reached from about 40 files outside it (Owner, 2026-11-03). It is a pure deletion of one
      self-contained subsystem, which the build, both type checks, the test tiers, and the reference search check
      mechanically. Another branch and review would not shrink the subsystem a reviewer must check.
- **D3. The notes lock stays where it is, unchanged.** `getNotesLockPath` keeps a caller on the live path: the
  personal-reference reconcile's store arm (`runStoreUserReferenceReconcileCommand`, `handlers/user-reference-store.ts`)
  serializes its apply step on it. After this change, its other callers run only under the in-repo store:
    - the reconcile's capability-false arm (`runLegacyStoreUserReferenceReconcile`,
      `handlers/user-reference-legacy-store.ts`);
    - `arc rename`'s in-repo workspace move (D1);
    - the `locks.notes` port (`lib/store/default-store-ports.ts`), which only `lib/store/in-repo/personal-write.ts`
      reads;
    - the inbox writer's override of that port (`lib/store/personal-command-store.ts`). Under the ref store it is inert,
      because `composeRefStorePorts` (`lib/store/selection.ts`) drops `locks`.

  So `notes-lock.ts` survives in place with `getRepoSharedUserInternalDir`. This departs from `spec-storage-contract.md`
  D15, which moves the inbox writer's lock onto the contract's per-surface write serialization before deleting the
  notes-lock code. That move, which includes the reference reconcile's serialization, needs a design of its own, and a
  pure deletion does not carry one. Its in-repo callers leave with the in-repo implementation. _ADR:_ `none`, temporary:
  it keeps a mechanism in place until its replacement is designed.
- **D4. The machine ID reads `lib/store/machine-id.ts` directly** (§ 2.7).
    - **What the wrappers add.** The wrappers in `lib/user-sync/sync-state.ts` call `getOrCreateMachineId` in
      `lib/store/machine-id.ts`, whose ID lives under the common Git directory at `arc/user/<id>/.internal/.machine-id`.
      On top, they adopt an older ID as the candidate when none exists there: from the checkout-local
      `.arc/user/<id>/.internal/.machine-id`, or from `.sync-state.json`'s `machineId`.
    - **The decision.** Both callers move to the store module, and the adoption goes with the wrappers. The adoption is
      a migration reader, and the pre-public-release posture lets development-only persisted state change in place
      without one. So a clone holding only a legacy ID mints a new one.
    - **The consequence.** The ID forms the store's write actor (`<identity>@<machineId>`). A clone that mints a new ID
      writes under a new actor from then on, and its earlier writes keep the old one.
    - **The assumption.** Every clone already holds its ID under the common Git directory. The primary clone does, and
      the census confirms the rest (§ 6). Apart from `arc rename`'s workspace move (D1), this is the only survivor the
      deletion would strand.

  _ADR:_ `none`, tactical.
- **D5. A changelog entry, and no configuration migration.** An entry in the package changelog
  (`packages/arc-framework/changelog/versions.json`) names among its breaking changes, with no compatibility alias:
    - the removed `arc user` subcommands, with `arc inbox` named as `inbox-list`'s replacement (§ 2.2);
    - the three retired keys, among them in `arc config status`, the session envelopes' `config` slot, and the agenda
      document's `residual.config` (§ 2.9);
    - `arc sync`'s `-y`, with `--no-input` named as its replacement, and its output's `notesPush` (§ 2.4);
    - `arc status`'s user section (D9);
    - the session-init envelope's removed slots and `recommendedCombinedPrompt` (§ 2.5).

  The entry is keyed by the version the package's `package.json` names when this change lands, and it is added to that
  version's entry when one exists. `arc update` shows only entries keyed after a project's installed version, up to and
  including the version it moves to (`filterChangelogRange`). So the first release that ships this change re-keys the
  entry if it publishes a different version. A configuration that still sets a retired key keeps loading:
  `readConfigSettings` (`lib/config/status-reader.ts`) reads only known keys, and `arc config validate` warns
  "Unknown key: '<key>' (possible typo?)" (`commands/config/validate.ts`). So `migrateUserSyncPush` and
  `translateLegacyNotesPushValue` go, with no stripping step to replace them. _ADR:_ `none`, tactical: a release-note
  convention.
- **D6. References follow § 1's rule.** The strategy that governs user-notes concurrency
  (`strategy-user-notes-concurrency.md`) is project-internal. It still governs the notes lock D3 keeps, through its lock
  and stale-break disciplines, so it stays live doctrine. This change edits only the references in it to the surfaces it
  removes, and leaves its rewrite to the documentation rewrite (§ Non-Goals). _ADR:_ `none`, tactical.
- **D7. Survivors stay where they are.**
    - **Nothing moves** except D4's callers and `arc rename`'s workspace move (D1). The survivors keep their modules,
      and `lib/user-sync/` keeps its name. The Git failure-text predicates and `resolveGitCommonDir` already sit outside
      the notes code (§ 3).
    - **`isCasRejectionError`** stays for `applyAndPublish` and leaves with it. `writeTreeCommit`, the `RefTreeWriteIO`
      type of its parameter, and `MAX_RECONCILE_ATTEMPTS` stay for the Errand paths, and leave with their last caller
      (§ 4). This departs from `spec-storage-ref-backend.md`, which retires all four with notes (§ 13.2) and
      `isCasRejectionError` at the cutover (§ 11.1).
    - **`resolveCurrentWuName`** goes, since every caller is a notes command or handler (§ 2.1).
    - **`CrossWuShape`** stays only until its last caller leaves (§ 4).

  _ADR:_ `none`, tactical.
- **D8. The refs go by a hand step at verification** (§ 5). The refs are local only today, and `origin` holds none
  (§ 5), so a hand step with the owner present removes them, with no shipped code. Deleting the old notes ref rests on
  ADR-035's item 8 as the flip amends it. Every older copy of the notes and sync-state history goes too, the hand-made
  backups among them (Owner, 2026-11-19): item 8 as amended deletes even the newest copy, the moved-aside ref, so no
  older copy is kept. _ADR:_ `none`, temporary: a one-time cleanup.
- **D9. `arc status` drops its user section** (§ 2.6). The plain `arc status` fills that section from `runUserStatus`
  on both arms, the store's included. Among the commands that survive this change, that is the one notes reader on the
  live path that the flip leaves. Its whole content is notes portability state: the disk against the saved snapshot,
  the backups, the notes ref against the remote, the compaction advisory, and, given `--all`, remote notes identities.
  Deleting it leaves a surviving, user-visible command without that section's source. So the section goes. This is the
  smallest change, and it stays a pure deletion. Session-init's `user` slot still reports the store's user pull. _ADR:_
  covered by ADR-035.

Every removal in § 2 except `arc user inbox-list` is covered by ADR-035, Accepted, which retires Git notes through a
one-time import (item 8): once the flip runs that import, this machinery has nothing to act on. `arc user inbox-list`
reads no notes ref; it goes because the flip replaced it with `arc inbox` (§ 2.2). Deleting the old notes ref rests on
item 8 as the flip amends it. On `main`, item 8 keeps that ref as an archive tag. The flip amends item 8 to keep it
unpushed and delete it after the window. This change depends on the flip, so the amendment is on the base before this
work starts.

## Alternatives & Rationale

- **Keeping the notes code a dormant arm reaches** (D1) — rejected. Most of the notes machinery would stay for the
  in-repo implementation's removal, which may land after the product-renames sweep. Dead notes code would then live
  through the sweep.
- **Either order with the tracked-state removal** (D2) — rejected. Landing first, this change would keep the notes
  save/load core and `UserIOContext`'s note fields for the import's and the window tooling's suites, against Goals 2
  and 4 and § 3, and the tracked-state removal would inherit deleting them. It remains the fallback if the Owner drops
  the edge (§ 7).
- **Rewriting the import's and the window tooling's test data setup to write notes refs directly** (D2) — rejected.
  It would let this change land first with no leftovers, but it adds a test helper that copies the notes manifest
  format into suites the tracked-state removal is about to delete.
- **Splitting the deletion** (D2) — rejected. Another branch and review would not shrink the subsystem a reviewer must
  check, and each part is a mechanically checked deletion.
- **Moving the notes lock onto the contract's per-surface write serialization now** (D3) — rejected for this change.
  That needs a design of its own, which a pure deletion does not carry.
- **Keeping the legacy machine-ID adoption** (D4) — rejected. It is a migration reader for development-only state,
  which the pre-public-release posture removes rather than carries.
- **A configuration migrator that strips the retired keys** (D5) — rejected. A retired key keeps loading and draws a
  validation warning, so there is nothing to migrate.
- **Filling `arc status`'s user section from the store's user pull** (D9) — rejected. That value's shape
  (`StoreSessionInitUserValueSchema`) is not the summary's (`UserStatusResult`), so it would need new rendering, a
  design of its own.
- **Having the flip remove `arc status`'s user section** (D9) — rejected. The flip rewrites only the command's help, not
  the probe. Taking it would add work to a change already executing, for an interval in which the section reports stale
  notes state rather than failing.
- **Keeping `arc rename`'s workspace move in `save-load.ts`** (D1) — rejected. The module's every other export goes, so
  it would survive only as a misnamed holder for one function and its adapter.

## Cross-cutting Considerations

- **Compatibility and notice.** ARC is pre-public-release, so removed project-owned contracts change in place, with no
  alias or migration reader. D5's changelog entry carries the notice. A configuration that still sets a retired key
  loads, and `arc config validate` names it as unknown.
- **Persisted records.** The audit entry schema (`AuditEntrySchema`) is registered `strict-current` at version 2
  (`lib/validation-surfaces/registry.ts`), and it narrows in place when `notes` and `notesPush` leave it. Production
  code parses an entry only before appending it (`parseAuditEntry`, `lib/release/audit-log.ts`) and never reads the log
  back. So existing `.audit-log.jsonl` lines that carry either field stay as written. The `local-sync-state` validation
  surface leaves the same registry with its schema (§ 2.7).
- **User-facing impact.** The visible changes are these:
    - `arc user --help` lists none of the nine removed subcommands, and `arc inbox` replaces `inbox-list`;
    - `arc status` and `arc status --json` carry no user section;
    - `arc sync` has no `-y`, which `--no-input` replaces, and its JSON interlock state has no `notesPush`;
    - `arc config status`, its `--session-init --json` result, the `config` slot of the session-init and the
      session-recover envelopes, and `arc agenda session-init`'s `residual.config` carry none of the three keys;
    - `arc status --session-init --json` carries no `partialPushMarker`, `compactionAdvisory`, `retiredSubdirs`, or
      `recommendedCombinedPrompt`. On a store-backed checkout those were empty, or null.
- **Security.** The notes layer's secret exclusions and size cap (`lib/git/user-sync.ts`) guarded what the notes push
  published. With the push gone and the import deleted first (§ 7), they guard nothing this change keeps. The store's
  own publication boundary is unchanged.
- **Testing.** Tests follow § 1's rule:
    - The suites whose subject is removed go, among them the notes compaction, interleaving, export-coherence, and
      partial-push-marker suites, and the sync orchestrator's notes cases.
    - Surviving suites drop the cases that pin a removed leg. Among them are the session envelopes' wire goldens
      (§ 2.5, § 2.9), the release and configuration fixtures that carry `notesPush`, and `arc status`'s user section.
    - Tests are added for each user-visible removal (§ 1), for D4's callers, and for `arc rename`'s moved workspace
      move.
    - The integration content tier runs before the push, since this change edits shipped ARC Markdown the integration
      tests read, and the link audit (`lint:arc:links`) must pass.
- **Rollout.** The change builds after the flip lands, and lands after the tracked-state removal and before the
  product-renames sweep (§ 7). § 5's hand step runs at verification.

## Success Criteria

At this change's verified head, with `main` merged in:

1. The census (§ 6), redone at that head, places every caller into the deletion set in a class of § 1, and finds no
   member no rule covers.
2. `arc user --help` lists none of the nine removed subcommands. `arc status` and `arc status --json` carry no user
   section. `arc sync --help` shows no `-y`, and `arc sync --json` carries no `notesPush` in its interlock state.
3. `arc status --session-init --json` carries no `partialPushMarker`, `compactionAdvisory`, `retiredSubdirs`, or
   `recommendedCombinedPrompt`, and its `user` slot is the store's value or `null`. Its `config` slot, the
   session-recover envelope's, `arc agenda session-init`'s `residual.config`, and `arc config status` carry none of the
   three retired keys.
4. `arc config validate` warns that a set retired key is unknown, nothing in source reads any of the three keys or
   `arc.notesPush`, and neither the shipped template nor this repository's configuration carries them.
5. A search of `packages/arc-framework/src/` finds no read or write of a `refs/notes/` ref or of the sync-state ref.
6. The store's default ports and the projection's engine ports take the machine ID from `lib/store/machine-id.ts`. No
   source reads a legacy machine ID from a checkout-local `.machine-id` or from `.sync-state.json`.
7. `arc rename`'s in-repo workspace move still refuses once the store is imported, still takes the notes lock, and
   still moves the directory, with no notes save.
8. The survivors' suites pass unchanged: inbox state and reminders, `arc inbox`, the Errand execution offers, the
   reference reconcile, and the inbox writer.
9. The build, both type checks, the unit, integration, and E2E tiers, and the link audit pass. A search of the
   repository's tracked files outside `docs/` finds a removed command, option, key, slot, exported symbol, or file path
   only in D5's changelog entry, the point-in-time records § 1 exempts, tests that assert a removed surface is absent,
   the dormant code § Non-Goals keeps, and the shared pieces § 4 keeps for their last caller.
10. Once § 5's step has run, no clone of the owner's holds a notes-era ref in any namespace, a notes-era machine-local
    file, or the `arc.notesPush` setting, and `git ls-remote origin` lists no notes-era ref (§ 5).

## Open Questions

None in the design. The census (§ 6) sets the members of each rule in § 2, including the conditional ones:

- what of the agenda's notes channel the flip leaves (§ 2.5);
- where the flip's help rewrite leaves `arc status`'s user-sync wording (§ 2.6);
- which in-repo-targeting suites the flip re-homes (§ 2.10);
- which of § 4's shared pieces remain, by the order this change and the in-repo implementation's removal land in.

Its run at the flip's landing also confirms that every clone holds its machine ID under the common Git directory (D4).
At the same point the Owner reads whether the edge to the tracked-state removal holds (§ 7).

## Amendments

[none]

---
