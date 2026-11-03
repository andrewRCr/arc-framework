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

---
