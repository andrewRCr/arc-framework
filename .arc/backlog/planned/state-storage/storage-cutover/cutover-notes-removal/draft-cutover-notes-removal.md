# Draft: Cutover Notes Removal

- **Origin:** [internal] — the `storage-cutover` cut (2026-11-03); carved from that work unit's draft.
- **Purpose:** Remove notes-specific sync, which the flip retires with Git notes, and keep the survivors the storage
  register names.
- **Planning posture:** `P1`, a Gate B Must. It is planned to implementation-ready before `cutover-flip` lands, and
  lands between the flip and the start of the product-renames sweep (`cohort-storage-cutover.md`).

---

## Planning state

- **Readiness:** rough (carved from `storage-cutover`'s draft at its cut, 2026-11-03).
- **Resolved at the cut** (Owner, 2026-11-03; `cohort-storage-cutover.md`):
    - this member's scope and items, below, and its Gate B placement;
    - it stays whole although it crosses the size mark of about 10,000 changed lines: it is a pure deletion of one
      self-contained subsystem.
- **Open:**
    - the inventory: each module's surviving symbols and callers, measured against the base the flip lands on.
- **Next:** draft-design, from the scope and items below. Implementation waits on `cutover-flip`.

The inbound items keep the numbers they had in `storage-cutover`'s buffer, shown in their headings. An
item cited here that this draft does not hold is in another member's draft under the same number.

---

## Scope

Measured on 2026-11-03 in `packages/arc-framework/src/`, before tests: `lib/user-sync/` and `commands/user/`
together about 12,700 lines, and `handlers/user-sync.ts`, `handlers/push-recovery.ts`, and `lib/git/user-sync.ts`
about 900 more.

- **From #1,** which `cutover-tracked-state-removal`'s draft holds: the notes machinery in `lib/user-sync/`, the
  `commands/user/` push, fetch, compaction, and sync-status family, `handlers/user-sync.ts` with its registrations
  in `command-input-registrations.ts` and `cli.ts`, `handlers/push-recovery.ts`, and the notes portions of
  `commands/user/save-load.ts`, `handlers/user.ts`, `handlers/sync.ts`, and `lib/io-context.ts`.
    - Survivors: the cross-work-unit entry parser with its contracts (inbox state, reminders, and
      `matchInboxEntryTitle`), and the inbox writer and execution offers. `resolveCurrentWuName` moves to the removed
      set (#17).
    - The Git failure-text predicates (`isCasRejectionError`, `isRemoteUnavailableError`, `isNonFastForwardError`)
      move to `lib/git/ref-tree.ts` first, and `resolveGitCommonDir` to `lib/git/exec.ts`.
- **From #10,** which `cutover-tracked-state-removal`'s draft holds: the sync-state ref
  (`refs/arc/user/<id>/sync-state`) and the suites that target notes.
- **The notes configuration keys:** `user.notes_push`, with its consumers and its migrator in `commands/update.ts`,
  `session.init_pull.notes`, and `session.init_load.notes`, once `cutover-flip`'s #37 module deletion leaves them no
  reader.
- **The notes residue refs:** `refs/notes/test` and `refs/notes/tmp-remote-andrew*`.

---

## Unknowns and Assumptions

None on unlanded members.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's first planning iteration. Integrate — or_
> _consciously reject — each one._

### `[ ]` **17. Drop `resolveCurrentWuName` from the cutover's list of `lib/user-sync/` survivors**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: storage-cutover`), housekeep drain (2026-10-13).

- _Shapes:_ the survivor list in the inbound entry "Delete the code `cli-substrate-complete-migration` carves out",
  and the register's notes-specific sync row.

- _Observation:_ the draft lists `resolveCurrentWuName` (`lib/user-sync/current-wu.ts`) among the symbols that must
  survive the notes deletion. `spec-seam-locus.md` § 2.2 moves its one caller outside notes sync, the user-reference
  reconcile (`handleUserReconcileReferences`, `handlers/user.ts`), onto `resolveCurrentWorkUnit`, leaving only the
  notes-sync commands (`commands/user/sync-status.ts`, `commands/user/save-load.ts`, and `handlers/user.ts`'s notes
  arms) calling it. Once that lands, the function goes with the notes machinery rather than surviving it.

- _Approach:_ move it from the survivor list to the removed set, after re-checking its callers when the cutover plans.

- _Captured during:_ `seam-locus` create-spec, 2026-10-12.

### `[ ]` **Remove `arc user inbox-list` once the flip moves its three callers onto `arc inbox`**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-11-06).

- _Shapes:_ its deletion set from #1, and that set's survivors.

- _Observation:_ at the flip, `create-spec`'s owner's pass, `activate-work-unit`'s pre-condition gate, and the start of
  `verify-work-unit` move from `arc user inbox-list --target <slug>` onto `arc inbox` (`cutover-flip`'s inbound #11;
  `spec-seam-locus.md` § 1.5 lists the old verb among the arms the deletion pass removes), so the verb is inert from
  then. Its reader, `lib/user-sync/inbox-target.ts`, sits in the notes machinery this unit deletes and is not a
  survivor, but its handler (`handlers/user-inbox-list.ts`) and its command registration are not in the deletion set.
  The inbox writer and the `user inbox` mutations stay survivors.

- _Approach:_ delete the handler, its registration, and `inbox-target.ts` with the notes machinery.

- _Captured during:_ `cutover-flip` draft-design, the Owner's planning pass, 2026-11-06 (Owner-approved; the target has
  no session).

### `[ ]` **Delete the old notes ref the cutover window moves aside, with the notes residue refs**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-11-06).

- _Shapes:_ its notes residue refs (draft § Scope: `refs/notes/test` and `refs/notes/tmp-remote-andrew*`).

- _Observation:_ the cutover window's last step moves the importing machine's notes ref
  (`refs/notes/arc/user/<id>`) under a namespace that is neither a tag nor pushed, so `git push --tags` cannot publish
  every past personal note, and amends ADR-035 item 8 to match (`draft-cutover-flip.md` § Notes retirement). That draft
  names this unit as the one that deletes it with the notes residue refs, but this unit's draft lists only
  `refs/notes/test` and `refs/notes/tmp-remote-andrew*`, so the routing never landed. `origin` holds no notes refs
  (deleted 2026-10-06), so the old ref exists only on the importing machine.

- _Approach:_ add it to the residue refs this unit deletes, once nothing reads it as a fallback after the window.

- _Captured during:_ `cutover-flip` draft-design, planning review's source-grounding, 2026-11-06 (Owner-approved; the
  target has no session).

### `[ ]` **Move the notes lock's surviving callers onto the store's write serialization before deleting it**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-11-06).

- _Shapes:_ the deletion set from #1 and its survivors.

- _Observation:_ `spec-storage-contract.md` D15: "The inbox writer's lock moves onto the contract's per-surface write
  serialization before the notes-lock code is deleted; `getNotesLockPath` and `getRepoSharedUserInternalDir` then
  retire with notes sync." Three callers of `getNotesLockPath` (`lib/user-sync/notes-lock.ts`) survive the flip: the
  personal-reference reconcile's store arm (`handlers/user-reference-store.ts`), which runs from the flip; the inbox
  writer's binding (`lib/store/personal-command-store.ts`); and the `locks.notes` port
  (`lib/store/default-store-ports.ts`). This unit's draft deletes "the notes machinery in `lib/user-sync/`" and keeps
  the inbox writer as a survivor, but names neither the lock nor the move, so the deletion as drafted breaks a store
  arm that runs after the flip.

- _Approach:_ move each caller onto the store's per-surface write serialization first, then delete `notes-lock.ts`
  with `getRepoSharedUserInternalDir`.

- _Captured during:_ `cutover-flip` draft-design, planning review's expected-contract sweep, 2026-11-06
  (Owner-approved; the target has no session).

### `[ ]` **Reconcile keeping `isCasRejectionError` with the ref backend's retiring it**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-11-06).

- _Shapes:_ the survivor list's Git failure-text predicates.

- _Observation:_ this unit's draft keeps `isCasRejectionError` as a survivor moved to `lib/git/ref-tree.ts`, as
  `draft-cutover-tracked-state-removal.md` does, while `spec-storage-ref-backend.md` § 11.1 and § 13.2 have it retire
  with notes. Its callers today are `lib/git/ref-tree.ts`, `lib/user-sync/cas-retry.ts`,
  `lib/user-sync/compaction.ts`, `lib/errand/identity-transaction.ts`, and `commands/user/push-fetch.ts`, most of which
  the cutover deletes.

- _Approach:_ decide from the callers that survive both deletion passes, and record the departure from the ref
  backend's specification if it stays.

- _Captured during:_ `cutover-flip` draft-design, planning review's expected-contract sweep, 2026-11-06
  (Owner-approved; the target has no session).

### `[ ]` **Name the session-init notes surfaces in the notes deletion set**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-11-10).

- _Shapes:_ § Scope's deletion set from #1 and its survivors.

- _Observation:_ the shipped specs leave six session-init notes surfaces to the deletion pass that no cutover draft
  names: `lib/session-init/notes-compaction-advisory.ts` (`spec-storage-contract.md` L482),
  `lib/session-init/partial-push-marker-surface.ts` (`spec-storage-contract.md` L484; `spec-seam-locus.md` L780),
  `composeNotesPromptText` and `composeCombinedPrompt` with the notes inputs of `commands/status/run.ts`
  (`spec-storage-contract.md` L441; `spec-seam-locus.md` L1241), and the notes branches of `inferUser` and
  `inferRetiredSubdirs` in `lib/session-init/recommended-action.ts` (`spec-seam-locus.md` L1109, L1241). The notes
  lock's callers also include `runUserInboxRemove` and `removeCurrentInboxEntry` (`commands/user/inbox-remove.ts`;
  `spec-storage-contract.md` L540), which the draft's notes-lock entry does not name.

- _Approach:_ verify each against the base the flip lands on, then add the live ones to the deletion set or name them
  as survivors.

- _Captured during:_ `cutover-tracked-state-removal` draft-design, a sweep of the shipped specs' hand-offs to the
  cutover (subagent findings, not yet verified at source), 2026-11-10 (Owner-approved; the target has no session).

### `[ ]` **Settle which deletion pass takes the Errand ref-tree and publish-outcome residue**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-11-10).

- _Shapes:_ § Scope's survivor list, and the Git failure-text predicates' move to `lib/git/ref-tree.ts`.

- _Observation:_ these items are reached by both notes removal's survivor list and tracked-state removal's collapse
  share, and named by neither draft: the in-repo-only statuses of `PublishOutcomeSchema` (`lib/store/sync.ts`;
  `spec-storage-ref-backend.md` L368); `lib/errand/ref-tree.ts` and `errandsRef` (L3511); `hashBlob`,
  `reconcileErrandPush`, `lib/git/publication-failure.ts`, and `writeTreeCommit`, `RefTreeWriteIO`, and
  `MAX_RECONCILE_ATTEMPTS` beside the predicates #1 moves into `lib/git/ref-tree.ts` (L3509; `spec-seam-lifecycle.md`
  L224); and the register's named survivor symbols (`CrossWuShape`, `CrossWuEntrySchema`, `CrossWuEntryParseSchema`,
  `CrossWuEntry`, `EntryParse`), which the draft names only generally.

- _Approach:_ at notes removal's planning, decide for each item which unit deletes it, or that it survives.
  Tracked-state removal's collapse share, cut out at the flip's landing, takes whatever notes removal leaves that is an
  in-repo arm.

- _Captured during:_ `cutover-tracked-state-removal` draft-design, the same sweep, 2026-11-10 (Owner-approved; the
  target has no session).

---
