# Draft: Cutover Notes Removal

- **Origin:** [internal] — the `storage-cutover` cut (2026-11-03); carved from that work unit's draft.
- **Purpose:** Remove notes-specific sync, which the flip retires with Git notes, wherever it still runs, and keep the
  survivors this draft names.
- **Planning posture:** `P1`, a Gate B Must. It is planned now as far as the flip's state allows, and what is not ready
  by the window finishes right after it (Owner, 2026-11-16). It lands between the flip and the start of the
  product-renames sweep, which waits on it (`cohort-storage-cutover.md`).

---

## Planning state

- **Readiness:** formalization-ready.
- **Resolved at the cut** (Owner, 2026-11-03; `cohort-storage-cutover.md`): this member's share of #1 and #10, its
  Gate B placement, and that it stays whole past the size mark of about 10,000 changed lines as a pure deletion of one
  self-contained subsystem.
- **Resolved at draft-design** (Owner, 2026-11-17): D1–D9 below, with D2 confirmed by `cutover-tracked-state-removal`'s
  session; the scope rules in § Scope, from the project manager's proposal; the inbound dispositions (§ Inbound
  dispositions).
- **Boundary:** stays one work unit. The evidence the cut rested on still holds: every decision here deletes or keeps
  code in place, apart from two moves that need no design. D4 repoints two callers to a module already on `main`, and
  D1 relocates `arc rename`'s workspace move out of `save-load.ts` to sit beside
  `reconcileRenameUserWorkspaceDirectory`. D3 keeps the notes lock rather than designing its replacement, the one move
  that would have needed a design. D1 adds the notes legs of dormant arms, which is more deletion of the same subsystem.
- **Class:** `Heavy`, by scale. About 13,600 lines of notes code (§ Scope) reached from about 40 files outside it, with
  survivors interleaved in mixed modules.
- **Open:**
    - The inventory: each module's surviving symbols and callers, taken at the head the flip lands on, which the task
      list's file lists come from.
- **Next:** create-spec. Implementation waits on `cutover-flip`.

The inbound items keep the numbers they had in `storage-cutover`'s buffer. An item cited here that this draft does not
hold is in another member's draft under the same number.

---

## Problem / Motivation

The flip retires Git notes (`spec-cutover-flip.md` § 12):

- the import (`lib/store/ref/import/`) reads the notes ref into the store;
- the sealing guard (`refuseWriteIfStoreImported`) refuses every notes writer once the store is imported;
- `arc sync` runs no notes leg off the branch (`finishStoreSync`);
- the window moves the old notes ref aside.

The notes machinery stays in the tree, and it is almost all dead on the live path. It is still reachable:

- from the notes-era `arc user` commands. The sealing guard refuses their writes, but `arc user status` still reads
  notes state, unsealed (`handleUserStatus`);
- from arms that run only with the `stateOffBranch` capability false or under the in-repo store;
- from the one-time import;
- from one surviving command, live: `arc status`'s user section (D9).

Its three configuration keys stay in the schema and the shipped template (`arc/system/arc-config.yml`), whose comments
mark them as having no effect off the branch, and `arc sync` still reports `user.notes_push`'s resolved value
(`handleSync`). This unit deletes that machinery before the product-renames sweep would otherwise rename dead code,
and it keeps the pieces live code still uses.

---

## Decisions

### D1. Every notes leg goes, wherever it runs

After the flip, notes code is also reached from arms that run only with `stateOffBranch` false or only under the
in-repo store. This unit deletes the notes leg in each. The host arm keeps the rest of its behavior for
`cutover-in-repo-removal`, and changes only where a notes leg was:

- `pullInRepo` (`lib/store/in-repo/pull.ts`): its only leg, `pullPersonal`, which runs `runUserFetch` and `runUserLoad`,
  goes. It reports its configuration states and no pull. Nothing on the import path reaches it: the import reads the
  notes ref itself (`lib/store/ref/import/`) and never pulls its source store.
- `pushInRepo` (`lib/store/in-repo/sync.ts`): the personal publish goes (`runUserSave`, `reconcileNotesPush`, and
  `notesPublish` in `sync-outcomes.ts`). It publishes the transient family alone, through `transientPublish`.
- Session-init (`handlers/status.ts`): with the capability off, the `user` slot runs `runUserSessionInitStatus`; it
  reads `getStoreUser()` on both arms instead, which yields `null` with the capability off. The partial-push-marker,
  compaction-advisory, and `retiredSubdirs` slots, which the ref arm already leaves empty, go with their surfaces. The
  retired-subdir reconcile is notes-load machinery end to end: `inferRetiredSubdirs` reads `session.init_load.notes`
  (`commands/status/run.ts`), and its recommendation runs the reconcile inside `arc user load` (`runUserLoad`). So it
  goes here with `lib/session-init/retired-subdir-detection.ts`. The handoff probes' `user` slot
  (`createHandoffProbes`, `handlers/status/session.ts`) returns `null` on both arms, as it already does with the
  capability on.
- `arc user open` with the capability off (`handleUserOpen`, `handlers/user.ts`): its retired-subdir reconcile
  (`reconcileRetiredSubdirsStandalone`) goes. `cutover-tracked-state-removal` removes the command itself; if that unit
  lands first, the call is already gone.
- `arc rename`'s in-repo arm (`commands/rename.ts`): its `renameUserWorkspace` port runs `runUserRenameWorkspace`
  (`commands/user/save-load.ts`). That refuses once the store is imported, takes the notes lock, moves the workspace
  directory, and saves notes. The save goes; the port keeps the refusal, the lock, and the directory move. The move
  runs `reconcileRenameUserWorkspaceDirectory` (`lib/work-unit/rename-user-workspace.ts`) over a Node file-system
  adapter defined in `save-load.ts` (`nodeRenameUserWorkspaceFs`), so `runUserRenameWorkspace`, without its save, and
  that adapter move out of `save-load.ts` to sit beside `reconcileRenameUserWorkspaceDirectory`.
- `arc sync` with the capability off (`handleSync`, `handlers/sync.ts`): the notes leg goes. That covers:
    - the matrix's notes action (`decideNotes`);
    - the paired push (`executePaired`, `pairedNotesAdapter`, `publishMarkerAdapter`), with the pushability matrix's
      `notes` and `both` targets (`lib/git/pushability.ts`);
    - the notes save and push (`performSave`, `completeNotesLeg`, `pushNotesLeg`) and the notes push question
      (`syncNotesPushPromptSite`);
    - `arc sync`'s `-y` option (`cli.ts`), its input-policy site, and its echo in the retry remedy of the worktree
      inspection's failure path (`handlers/sync-worktree-inspection.ts`). Answering that question was its only effect;
    - the outcome's `save` and `notes` leg records (`SyncOutcome`) and their audit tokens (`lib/release/schema.ts`,
      `handlers/sync-audit.ts`), and the notes parts of its dry run and rendering. The worktree inspection runs on
      both arms, and its failure path writes a skipped `notes` record to the audit entry only (`writeSyncAuditEntry`,
      `handlers/sync-worktree-inspection.ts`); that record goes too;
    - the Errand leg's partial-push marker (`recordErrandPartialPushMarker`, `clearErrandPartialPushMarker`,
      `lib/user-sync/sync-state.ts`), which it writes to `.sync-state.json` and nothing reads. The leg's failure
      detail loses its `:marker-not-recorded` suffix.

  The arm keeps the rebuild, the branch leg it shares with the store path (`pushBranch`, `pullBranchInbound`), and the
  Errand reconcile leg (`reconcileErrandLeg`). Its cells name the worktree action alone, as its notes-free cells do
  today (`worktree-only`, `worktree-only-with-upstream-init`, `inbound-pull`, `blocked-<reason>`). With nothing to push,
  the case that now ends in a save-only cell reports `noop`.

The exceptions are pieces an approved plan gives to `cutover-in-repo-removal`. They keep the notes code they import
until they go (D2):

- the user-surface migration (`lib/user-surface-migration.ts`), with what it imports: `shapeForFile`,
  `classifyUserSyncPath`, and `mergeCrossWuFile`;
- the sealing guard's in-repo arm.

The `retiredSubdirs` slot goes here rather than with `cutover-in-repo-removal` (Owner, 2026-11-17):
`spec-cutover-flip.md` § 17.2 says only that it leaves with the in-repo arm, and that unit's draft does not name it.

_Alternative:_ keep any notes code a dormant arm reaches. That would leave most of the notes machinery to
`cutover-in-repo-removal`, a Should that may land after the product-renames sweep, so dead notes code would live
through the sweep.

_ADR:_ `none`, temporary. It divides one deletion between two cohort members, and this draft records the division.

### D2. Either order with `cutover-tracked-state-removal`; the second to land deletes what the first left

Confirmed by that unit's session (2026-11-17). Its spec now excludes import-only notes code from its Non-Goals'
"notes-specific sync" line, and its § 2.7 deletes that code with the transform (§ Unknowns and Assumptions).

The one-time import (`lib/store/ref/import/`), which that unit deletes once the window has run, imports notes code:

- `mergeCrossWuFromNotes` (`commands/user/save-load.ts`);
- `projectManifest` (`lib/user-sync/projection.ts`);
- the notes-ref readers' `notePathToCommit`, `NOTES_COMPACTION_SNAPSHOT_MESSAGE`, `CROSS_WU_NOTE_WINDOW`,
  `CROSS_WU_NOTE_WINDOW_MS`, and `RecentNote`;
- `isAllowedFile`, `MAX_FILE_SIZE`, and `isSafeManifestPath` (`lib/git/user-sync.ts`).

Its other notes imports, `stripHtmlComments` and the inbox writer's functions, survive anyway. If this unit lands
first, it keeps each listed symbol the import still reaches. That unit's boundary rule, "with a surface goes the code
reachable only through it", then deletes them with the import. If that unit lands first, this one deletes them.

The same rule settles what this unit shares with `cutover-in-repo-removal`: whichever unit removes a piece's last caller
deletes the piece. The pieces are:

- the sealing guard's module (`lib/store/store-imported.ts`, `handlers/pre-cutover-seal.ts`);
- the notes code D1's exceptions import;
- the survivors in § Scope that only in-repo code still calls.

That unit's draft already deletes each dormant arm "with the modules only they reach".

_Alternative:_ `Depends On: cutover-tracked-state-removal`. It would be simpler here, but it would serialize two
follow-ons that the window wants to run in parallel.

_ADR:_ `none`, temporary: a landing order.

### D3. The notes lock stays where it is, unchanged

`getNotesLockPath` (`lib/user-sync/notes-lock.ts`) keeps a caller on the live path. The personal-reference
reconcile's store arm (`runStoreUserReferenceReconcileCommand`, `handlers/user-reference-store.ts`) serializes its
apply step on it.

After this unit, its other callers run only under the in-repo store:

- `handlers/user-reference-legacy-store.ts`;
- `arc rename`'s in-repo workspace move (D1);
- the `locks.notes` port (`lib/store/default-store-ports.ts`), which only `lib/store/in-repo/personal-write.ts`
  reads;
- the inbox writer's override of that port (`lib/store/personal-command-store.ts`), inert under the ref store because
  `composeRefStorePorts` (`lib/store/selection.ts`) drops `locks`.

So `notes-lock.ts` survives in place, with `getRepoSharedUserInternalDir` (`lib/user-sync/repo-shared-paths.ts`),
which locates the lock file. Its in-repo callers leave with `cutover-in-repo-removal`. This departs from
`spec-storage-contract.md` D15, which moves the inbox writer's lock onto the contract's per-surface write serialization
before deleting the notes-lock code. That move needs a design of its own, which a pure deletion does not carry. The
storage register already places it: its row "The notes lock serializes one machine only …" (`cohort-state-storage.md`)
moves the lock's serializing role, reference reconcile included, onto the contract's per-ref write serialization, held
by `sync-primitive-discipline`. A capture targeting that unit carries the lock's last live caller and its misleading
name (§ Inbound dispositions).

_ADR:_ `none`, temporary. It keeps a mechanism in place until its replacement is designed.

### D4. The machine ID reads `lib/store/machine-id.ts` directly

The store's default ports (`lib/store/default-ports.ts`) and the projection's engine ports
(`lib/store/projection/engine-ports.ts`) read the machine ID through `getOrCreateMachineId` and
`getOrCreateMachineIdAtCommonDir` (`lib/user-sync/sync-state.ts`). Those wrappers call `getOrCreateMachineId` in
`lib/store/machine-id.ts`, whose ID lives under the common Git directory at `arc/user/<id>/.internal/.machine-id`. On
top, they adopt an older ID from the checkout-local `.machine-id` or `.sync-state.json`.

Both callers move to `lib/store/machine-id.ts`, and the adoption goes with the wrappers. It is a migration reader, and
the pre-public-release posture in `DEV-RULES.PROJECT.md` lets development-only persisted state change in place with
none, so a clone holding only a legacy ID mints a new one. Apart from `arc rename`'s workspace move (D1), this is the
only survivor the deletion would strand. The assumption it rests on is in § Unknowns and Assumptions.

_ADR:_ `none`, tactical.

### D5. A changelog entry, and no configuration migration

An entry in `packages/arc-framework/changelog/versions.json`, as `cutover-tracked-state-removal`'s D7 does, names
among its breaking changes, with no compatibility alias:

- the removed `arc user` subcommands;
- the three retired keys;
- `arc sync`'s `-y` (D1) and its output's `notesPush`;
- `arc status`'s user section (D9).

A configuration that still sets a retired key keeps loading:

- `lib/config/status-reader.ts` ignores unknown keys;
- `arc config validate` warns "Unknown key ... (possible typo?)" (`commands/config/validate.ts`).

So `migrateUserSyncPush` and `translateLegacyNotesPushValue` (`commands/update.ts`) go, with no stripping step to
replace them. `arc sync`'s output loses `notesPush` from its interlock state (`SyncInterlockStateSchema`,
`lib/release/schema.ts`) on both arms.

_ADR:_ `none`, tactical: a release-note convention.

### D6. References follow `cutover-tracked-state-removal`'s rule

Removing a surface also removes every reference to it in the repository's tracked files outside `docs/`: links, remedy
and help strings, examples, test assertions, and prose mentions. This takes `spec-cutover-tracked-state-removal.md`
§ 1's rule and its exemptions:

- point-in-time records, D5's changelog entry among them;
- tests that assert a removed surface is absent;
- the dormant code `cutover-in-repo-removal` deletes;
- doctrine `cutover-documentation` rewrites, where this unit removes only the reference.

That unit's scope takes the notes prose, in the shipped strategies and the ADRs, and `arc join`'s notes message.
`strategy-user-notes-concurrency.md` is project-internal, and that unit's draft does not name it, so it went to that
unit as a capture (2026-11-17), with its index entry. The strategy still governs the notes lock D3 keeps (its lock and
stale-break disciplines), so the capture asks that it be cut to what survives and retired only once the lock leaves.

_ADR:_ `none`, tactical.

### D7. Survivors stay where they are

Nothing moves except D4's callers and `arc rename`'s workspace move (D1). The survivors keep their modules,
`lib/user-sync/` its name, and their behavior unchanged. The Git failure-text predicates (`isCasRejectionError`,
`isRemoteUnavailableError`, `isNonFastForwardError`) are already in `lib/git/ref-tree.ts`, and `resolveGitCommonDir` is
already in `lib/git/exec.ts`, so the moves the cut planned are done.

`isCasRejectionError` stays for its last caller after this unit, `applyAndPublish`
(`lib/errand/identity-transaction.ts`), and leaves with it in `cutover-in-repo-removal`. `writeTreeCommit`, the
`RefTreeWriteIO` type of its parameter, and `MAX_RECONCILE_ATTEMPTS` stay for the Errand paths and the window's
tooling, and leave with their last caller. This departs from `spec-storage-ref-backend.md` § 13.2, which
retires all four with notes, and § 11.1, which retires `isCasRejectionError` at the cutover.

The storage register's row for notes-specific sync (`cohort-state-storage.md`) names `CrossWuShape` and
`resolveCurrentWuName` among the survivors. This unit departs from it for both: `resolveCurrentWuName` goes, since
every caller is notes code (#17), and `CrossWuShape` stays only until its last caller leaves (§ Survivors).

_ADR:_ `none`, tactical.

### D8. The refs go by a hand step at verification

The refs are local only: `origin` holds no notes ref and no sync-state ref (`git ls-remote`, 2026-11-17). So a step run
by hand at this unit's verification, with the Owner present and no shipped code, removes them from each of the Owner's
clones that holds them, after the window has closed (§ Scope, The refs). This mirrors `cutover-tracked-state-removal`'s
D5. That the old notes ref is deleted at all is ADR-035 item 8 as `cutover-flip` amends it (§ Unknowns and
Assumptions).

_ADR:_ `none`, temporary: a one-time cleanup.

### D9. `arc status` drops its user section

The plain `arc status` (`handleCompositeStatus`, `handlers/status/session.ts`) fills its user section from
`runUserStatus` (`commands/user/sync-status.ts`) on both arms, the store's included. Among commands that survive this
unit, that is the one notes reader on the live path that the flip leaves. Its whole content is notes portability
state: the notes ref, the saved snapshot and its backups, and remote notes identities. Deleting it leaves a surviving,
user-visible command without that section's source.

So the section goes: the `user` probe, its summary lines, and the `user` field of `arc status --json`. The command keeps
its identity, configuration, active-work, and projection sections, and session-init's `user` slot still reports the
store's user pull. This is the smallest change, and it stays a pure deletion. Because the removal is visible to users,
it takes a test and a line in D5's entry.

_Alternatives:_

- Fill the section from the store's user pull (`createStoreSessionProbes`' `user`, as session-init's `getStoreUser()`
  does). That value's shape (`StoreSessionInitUserValueSchema`) is not the summary's (`UserStatusResult`), so it would
  need new rendering, a design of its own.
- Have the flip take it. The flip rewrites only the command's help (its Task 4.2.b, `spec-cutover-flip.md` § 6.1), not
  the probe. Taking it would add a task to a work unit already executing, for an interval in which the section reports
  stale notes state rather than failing.

_ADR:_ covered by ADR-035, as every removal is (below).

### What every removal rests on

ADR-035, Accepted, retires Git notes through a one-time import (item 8). Every removal in § Scope is _covered by_ it,
since once the flip runs that import, this machinery has nothing to act on. The one exception is deleting the old
notes ref. On `main`, item 8 keeps that ref as an archive tag. `cutover-flip` amends item 8 to keep it unpushed and
delete it after the window (its Task 4.4, done at its head), and this unit depends on the flip, so the amendment is on
the base before this work starts.

---

## Scope

### Rules

- **A pure deletion.** It removes notes-specific sync and keeps what § Survivors names. It adds no new abstraction,
  refactors no survivor, and changes no survivor's behavior, apart from D4's ID adoption, the dormant arms D1 cuts, and
  the removals on live surfaces that § What goes, D5, and D9 name. A move that needs a design of its own stops and
  goes to the Owner.
- **Every outside caller is classified.** An importer sweep at the head the flip lands on finds every caller from
  outside the deletion set into it. Each one is a survivor (§ Survivors), a leftover that goes with its last caller
  (D2), a dormant host that loses its notes leg (D1), or a surviving live host whose notes part § What goes, D5, or D9
  removes. The inventory runs that sweep; the lists below are what it is known to find.
- **Inventory late.** The rules here settle what goes and what survives. The per-module inventory and the task list's
  file lists come from the head the flip lands on, or from `main` after it lands.
- **Tests.** A suite whose subject is deleted goes with it. A surviving suite loses the cases that pin a removed leg, and
  keeps the cases that pin the arm's remaining result (D1). That covers the in-repo store's suites, the differential
  harnesses, and the lane that runs both backends, whose cases for the personal family's pull and publish go. A test is
  added only where a survivor moves (D4, and `arc rename`'s workspace move in D1) or a removal is visible to users: a
  removed `arc user` subcommand, a retired key, `arc sync`'s `-y` and `notesPush` (D1, D5), and `arc status` (D9). The
  rename case in the user suite (`__tests__/integration/user.test.ts`) keeps its directory-move assertions, loses its
  notes-save ones, and follows the moved code.
- **Size.** It stays whole past about 10,000 changed lines as a pure deletion. Anything that stops being one is
  flagged.

### What goes

Measured on 2026-11-03 in `packages/arc-framework/src/`, before tests, `lib/user-sync/` and `commands/user/` together
come to about 12,700 lines. `handlers/user-sync.ts`, `handlers/push-recovery.ts`, and `lib/git/user-sync.ts` add about
900 more.

- **The notes machinery,** from #1. This is `lib/user-sync/` except its survivors, and `commands/user/` except the
  modules serving the surviving subcommands, `cutover-tracked-state-removal`'s, and the survivors' types: `add.ts`,
  `inbox-remove.ts`, `inbox-mutation.ts`, `inbox-store.ts`, `open.ts`, `close.ts`, `session-init-schema.ts` (its store
  variant), and `types.ts`. At the flip's head that leaves `save-load.ts`, `push-fetch.ts`, `compact.ts`,
  `sync-status.ts`, `drift.ts`, `paired-push.ts`, `notes-push-retry.ts`, `inbox-list.ts`, `format.ts`,
  `ancestry-message.ts`, `relative-time.ts`, and `shared.ts`. The inventory confirms each by its importers. With it
  go:
    - the notes exports of `commands/user.ts`, the barrel the `arc user` family is imported through;
    - the user summaries in `commands/status/format.ts`, which render `format.ts`'s summaries for D9's section and
      the notes `user` slot;
    - the notes parts of `commands/user/types.ts`, `handlers/user.ts`, `handlers/shared.ts`, and `lib/io-context.ts`,
      among them `createUserIOContext`'s note reader and writer (`readGitNote`, `writeGitNote`);
    - `handlers/user-sync.ts` and `handlers/push-recovery.ts`;
    - the notes-only parts of `lib/git/user-sync.ts`, and the in-repo store's notes I/O (`notesIO`,
      `lib/store/in-repo/sync-io.ts`);
    - the materialized-baseline stamp (`lib/user-sync/materialized-baseline.ts`), which only the notes save and load
      use;
    - `resolveCurrentWuName` (`lib/user-sync/current-wu.ts`; #17), whose every caller is a notes command or handler;
    - the notes legs of D1;
    - the tombstone writers, which only `arc user save` reaches: `applyRemovalTombstones`, `appendRemovalTombstones`,
      `appendRemovalTombstonesFromEntries`, and `synthesizeTombstones`. The tombstone readers leave with their last
      caller (D2): `stripTombstoneSections`, through `mergeCrossWuFile` and `projectManifest`, and `TOMBSTONE_TTL_MS`,
      through `CROSS_WU_NOTE_WINDOW_MS`.
- **The notes-era `arc user` subcommands:** `save`, `load`, `push`, `fetch`, `pull`, `compact`, `status`, `sync`, and
  `inbox-list`. Their handlers go (`handlers/user-inbox-list.ts` among them), along with their registrations in
  `cli.ts` and `command-input-registrations.ts`, and their help.
    - The sealing guard's calls go with them: `refuseWriteIfStoreImported` in `save-load.ts`, `push-fetch.ts`, and
      `compact.ts`, and `push-fetch.ts`'s imports of `StoreImportedError` and `storeImportedHere`.
    - So does `arc user load`'s seal, which `spec-cutover-tracked-state-removal.md` § 2.8 keeps until these commands
      go.
- **The session-init notes surfaces** (`handlers/status.ts`):
    - `lib/session-init/notes-compaction-advisory.ts` and `lib/session-init/partial-push-marker-surface.ts`, with their
      slots;
    - the entries of the `partialPushMarker`, `compactionAdvisory`, and `retiredSubdirs` slots in the session-init view
      schema (`commands/status/schema.ts`), with the first and last from its presence rule (the rule stays for
      `pausedWork`), and their schemas' registrations in `lib/session-envelope/registry.ts`;
    - `composeNotesPromptText` and `composeCombinedPrompt` (`lib/session-init/recommended-action.ts`), with the notes
      inputs of `commands/status/run.ts`;
    - the session-init envelope's `recommendedCombinedPrompt`, which only `composeCombinedPrompt` fills: its entry and
      refinement in the view schema (`commands/status/schema.ts`), and its fields in `commands/status/types.ts`,
      `commands/status/run.ts`, and `recommended-action.ts`;
    - `inferUser`'s notes branch, and the notes drift verdict `commands/status/run.ts` folds into the `user` slot
      (`resolveCleanArmNotesVerdict`, `commands/user/drift.ts`);
    - the `retiredSubdirs` slot, `inferRetiredSubdirs`, and `lib/session-init/retired-subdir-detection.ts` (D1);
    - the capability-off `user` slot's call to `runUserSessionInitStatus` (D1);
    - the `user` slot's notes variant (`NotesSessionInitUserValueSchema`, `commands/user/session-init-schema.ts`), so
      `SessionInitUserValueSchema` admits the store's value or `null`.
- **`arc status`'s user section** (D9).
- **The sync-state contracts,** from #10:
    - the sync-state ref, `refs/arc/user/<id>/sync-state`, whose writers are `publishMarkerAdapter`
      (`handlers/sync.ts`) and `commands/user/compact.ts`, and whose one reader is `partial-push-marker-surface.ts`;
      the store does not read it;
    - the local sync-state file (`.sync-state.json`) and its schema, `PersistedLocalSyncStateSchema`, with its
      registration in `lib/validation-surfaces/registry.ts`;
    - the machine-ID wrappers (D4).
- **The notes-only publish outcomes:** `PublishOutcomeSchema` (`lib/store/sync.ts`) loses `blocked`,
  `unpublished-history`, `history-diverged`, `compaction-lineage`, and `proof-unavailable`, which only `notesPublish`
  produces.
- **The suites that target notes,** from #10: every test whose subject is a removed module, command, slot, key, or
  leg.
- **The configuration keys:** `user.notes_push`, `session.init_pull.notes`, and `session.init_load.notes`. What goes
  with them:
    - their schema entries (`lib/config/schema.ts`);
    - `resolveNotesPushPolicy` and the `arc.notesPush` Git setting (`NOTES_PUSH_GIT_CONFIG_KEY`,
      `lib/config/resolved-settings.ts`);
    - their readers in `handlers/sync.ts`, `handlers/user-sync.ts`, `lib/config/index.ts`,
      `commands/config/status.ts`, `commands/config/validate.ts`, `lib/config/status-reader.ts`, `commands/status/run.ts`,
      and `lib/release/schema.ts` (`notesPush`), with whatever the flip's Task 3.3 leaves of the agenda's notes channel
      (§ Unknowns and Assumptions);
    - the migrator in `commands/update.ts` (D5);
    - their entries and comments in the shipped template (`arc/system/arc-config.yml`) and in this repository's
      `.arc/system/arc-config.yml`.
- **The references** to each removed surface (D6), and **the changelog entry** (D5).

### Survivors

These stay with their behavior unchanged:

- **The cross-work-unit entry parser and its contracts:**
    - `CrossWuEntrySchema`, `CrossWuEntryParseSchema`, `CrossWuEntry`, and `EntryParse` (`lib/user-sync/schema.ts`);
    - `inboxEntrySourceDigest`, `hasExecuteBoundDisposition`, and `stripHtmlComments`.

  They serve inbox state and reminders (`lib/session-init/inbox-state.ts`, `inbox-reminders.ts`), the personal-inbox
  kind (`lib/store/kinds/personal-inbox.ts`), `lib/store/legacy-inbox-origin.ts`, and
  `lib/store/session-notes-fields.ts`. `matchInboxEntryTitle`, which every live caller takes from
  `lib/store/kinds/entry-fields.ts`, is outside the notes code. `lib/user-sync/parser.ts`'s copy goes with its callers.
- **The inbox writer and execution offers:**
    - `removeCurrentInboxEntry`, `unmarkCurrentInboxEntry`, `runUserInboxMutation`, `withLockedUserInbox`,
      `InboxMutationConflictError`, and `inspectInboxEntry`, which `handlers/errand.ts` uses;
    - `resolveExecutionNextOffer` and `resolveExecutionStartupOffer` (`commands/errand-next.ts`);
    - `listInboxEntriesNamingTarget` (`lib/user-sync/inbox-target.ts`), which `arc inbox` reads
      (`lib/inbox/listing.ts`).
- **`UserIOContext`** (`commands/user/types.ts`), which store paths take, without its note reader and writer.
- **The session envelope's store-user schema** (`StoreSessionInitUserValueSchema`, through
  `commands/user/session-init-schema.ts`).
- **The `arc user` subcommands** `add`, `reconcile-references`, and `inbox-remove`. `cutover-tracked-state-removal`
  removes `open`, `close`, `inbox-mark-execute-bound`, and the title-keyed inbox operands.
- **The notes lock** (D3).
- **Until their last caller leaves (D2):**
    - the notes code the import or D1's exceptions reach, `CrossWuShape` (`lib/user-sync/types.ts`, through
      `shapeForFile`) among it;
    - `isCasRejectionError` (D7);
    - the Errand ref-tree and publication helpers that the Errand identity and merge paths, the in-repo transient
      writer, the window's tooling, and the import call: `errandsRef`, `writeTreeCommit` with `RefTreeWriteIO`,
      `hashBlob`, `reconcileErrandPush`, `lib/git/publication-failure.ts`, and `MAX_RECONCILE_ATTEMPTS` (D7);
    - `PublishOutcomeSchema`'s `conflict`, which `transientPublish` produces.

### The refs

Removed by D8's hand step, after the window has closed:

- the old notes ref, `refs/notes/arc/user/<id>`, under the namespace the window moves it to;
- the notes residue refs: `refs/notes/test`, `refs/notes/tmp-remote-andrew`, `refs/notes/tmp-remote-andrew-fresh`, and
  `refs/notes/arc/user/test-user`;
- the sync-state ref, `refs/arc/user/<id>/sync-state`;
- every notes-era machine-local file:
    - in each checkout's identity `.internal/` (`getUserInternalDir`), `.sync-state.json` and the notes load's
      backups (`.pre-load-backup.json`, `.pre-load-backup-<timestamp>.json`);
    - under the common Git directory, the materialized-baseline stamp (`materialized-baseline.json`);
- the clone's local Git setting `arc.notesPush`, which `resolveNotesPushPolicy` reads.

On 2026-11-17 the primary clone holds every one of them, with the old notes ref still at `refs/notes/arc/user/andrew`
and `arc.notesPush` set to `manual`. That day 12 checkouts held a `.sync-state.json`, and the primary held four
backups. The step works from the rule, not from these counts.

### Success signal

- `arc user --help` lists none of the nine notes-era subcommands, and `arc status` and `arc status --json` carry no
  user section.
- `arc config validate` warns that a set retired key is unknown, nothing reads it, and the shipped template carries
  none.
- A search of `packages/arc-framework/src/` finds no read or write of a `refs/notes/` ref or of the sync-state ref,
  except in the import and the window's tooling while `cutover-tracked-state-removal` has not yet deleted them (D2).
- A search of the tracked files outside `docs/` finds a removed surface only where D6 exempts it.
- The survivors' suites pass unchanged: inbox state and reminders, `arc inbox`, the Errand execution offers, and the
  reference reconcile.
- No clone of the Owner's holds a notes ref, the moved-aside notes ref, or a sync-state ref once D8's step has run.

---

## Unknowns and Assumptions

Grounded at `cutover-flip`'s head `2cd07bb283` (2026-11-17). The import's notes reach and the session-init surfaces were
first grounded at `9d7f885774` the same day and spot-checked at the later head. Everything is re-grounded at the
inventory, against the head that lands.

- **The flip's unfinished tasks.** Each assumption below rests on a task in `tasks-cutover-flip.md` that is not yet
  closed:
    - **Task 2.3:** `handleSync` runs no notes leg off the branch (`finishStoreSync`; its subtask 2.3.a is done at the
      head). The notes path remains only as the capability-off arm D1 cuts.
    - **Task 3.3:** the switch makes the ref store the default, so the in-repo store runs only under the override. Its
      3.3.c deletes `commands/agenda/notes.ts` (`compileNotesSync`) and `commands/agenda/legacy-materialize.ts`. The
      agenda's sync prefix and sync state (`prefix.ts`, `sync-state.ts`) call `compileNotesSync` and read both
      session notes keys (`CHANNEL_POLICIES`) through a `notes` sync channel (`SyncChannels`). The agenda's orientation
      (`orientation.ts`) imports `compileNotesOrientation` and lists the `partialPushMarker`, `compactionAdvisory`, and
      `retiredSubdirs` slots D1 deletes. The agenda's combined sync offer (`combineSyncOffers`, `combine.ts`) reads
      `recommendedCombinedPrompt`, and `reads.ts` calls `compileNotesSync`. Whatever of that channel, orientation, and
      these readers 3.3.c leaves comes here, and so does the module if 3.3.c keeps it.
    - **Tasks 3.4–3.6:** where the flip re-homes the tests that target the in-repo store sets which notes-targeting
      suites are left here.
    - **Task 4.2:** its 4.2.c rewrites `arc sync`'s help, which still names the notes leg and `notes_push`. This unit
      removes the help of the subcommands it deletes.
    - **Tasks 6.4 and 7.1, with `spec-cutover-flip.md` § 12:** the window moves the importing machine's notes ref
      under a namespace that is neither a tag nor pushed, deletes no notes ref, and leaves none on `origin`. ADR-035
      item 8 as the flip amends it records the old ref's deletion after the window. On `main`, item 8 still keeps it
      as an archive tag.
- **`spec-cutover-flip.md` § 17.2** keeps open the register row for the current-work-unit reconciliation and
  stale-worktree sweep slots, saying that the `retiredSubdirs` slot leaves with the in-repo arm. This unit deletes the
  slot (D1), so it takes that row's remaining share.
- **D2's confirmation:** `cutover-tracked-state-removal`'s session confirmed (2026-11-17) that it deletes, with the
  import, any notes code only the import still reaches when it lands. That unit's Task 2.2.a names the list, and its
  census at the flip's landing confirms which remain. The amendment to its spec (§ Non-Goals and § 2.7) lands with
  its task-generation commit. If that commit does not carry it, D2 falls back to
  `Depends On: cutover-tracked-state-removal`.
- **D4's assumption:** every clone already holds the machine ID under the common Git directory. The primary clone
  does. The rest are checked at the inventory, and a clone without one mints a new ID.

---

## Scope boundary (Won't Do)

- **The import and its transform** (`lib/store/ref/import/`): `cutover-tracked-state-removal`. If this unit lands first,
  that includes the notes code only the import reaches (D2).
- **`arc user open` and `close`, `inbox-mark-execute-bound`, the title-keyed inbox operands, and the window's refs and
  tooling:** `cutover-tracked-state-removal`.
- **What the dormant arms keep once their notes legs go,** and the pieces D1 excepts: `cutover-in-repo-removal`. That
  covers the in-repo store, the sealing guard's in-repo arm, `lib/user-surfaces.ts` and the user-surface migration,
  the Errand identity and merge paths, and `readLiveRemoteHeads`.
- **Strategy and ADR rewrites:** `cutover-documentation`. That includes the notes prose, `arc join`'s notes message, and
  `strategy-user-notes-concurrency.md`, which went to that unit as a capture (D6).
- **Replacing or renaming the notes lock, or renaming `lib/user-sync/`** (D3, D7).
- **What the flip does:** the notes ref's move aside, `commands/agenda/notes.ts` and `legacy-materialize.ts`, and
  `arc sync`'s help.
- **`docs/`.**

Depends on `cutover-flip`.

---

## Inbound dispositions

The Owner's planning pass (2026-11-17) drained the buffer.

| Entry                                                  | Outcome       | Where, or why                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #17 Drop `resolveCurrentWuName` from the survivors     | fold          | § Scope, What goes. Every caller at the flip's head is a notes command or handler.                                                                                                                                                                                                                                                                                                              |
| Remove `arc user inbox-list`                           | fold          | § Scope, What goes: the handler, registration, and help. Corrected: `listInboxEntriesNamingTarget` survives, since `arc inbox` reads it (§ Survivors).                                                                                                                                                                                                                                          |
| Delete the old notes ref with the residue refs         | fold          | § Scope, The refs; D8. With it go `refs/notes/arc/user/test-user`, `refs/notes/tmp-remote-andrew-fresh`, and the sync-state ref, all local.                                                                                                                                                                                                                                                     |
| Move the notes lock's callers, then delete it          | fold; capture | Fold: D3 keeps the lock for its live caller, and its in-repo callers leave with `cutover-in-repo-removal`. Capture: moving its caller onto per-ref write serialization, and its name, need a design of their own; the register gives that move to `sync-primitive-discipline`, which the capture targets.                                                                                       |
| Reconcile keeping `isCasRejectionError`                | fold          | D7. It stays for `applyAndPublish` and leaves with it, departing from `spec-storage-ref-backend.md` § 11.1 and § 13.2.                                                                                                                                                                                                                                                                          |
| Name the session-init notes surfaces                   | fold          | D1 and § Scope, What goes, for all six surfaces, `inferRetiredSubdirs` among them: its reconcile rides the notes load this unit deletes. `runUserInboxRemove` and `removeCurrentInboxEntry` take the lock only through the in-repo store's port (D3).                                                                                                                                           |
| Settle the Errand ref-tree and publish-outcome residue | fold          | § Scope. The five notes-only statuses go. The Errand helpers, with `writeTreeCommit`'s `RefTreeWriteIO`, and `conflict` stay until their last caller leaves (D2, D7). The survivor symbols are named.                                                                                                                                                                                           |
| Stop loading working-memory tombstones                 | dismiss       | Resolved by the flip: the import lands each personal file without its `## Removed:` sections (`comparePersonalFile` runs `projectManifest`), and the only writer, `applyRemovalTombstones` on `arc user save`'s path, is sealed once the store is imported. `lib/load-set/` treats them as plain text. The writers go here as own work, and the readers leave with their last caller (§ Scope). |

---
