# Notes: seam-locus

## Contents

- [Consumer-map re-verification](#consumer-map-re-verification)
- [Where the reroute happens](#where-the-reroute-happens)
- [Row corrections: locus and session-init](#row-corrections-locus-and-session-init)
- [Row corrections: user sync](#row-corrections-user-sync)
- [Row corrections: in-flight derivation](#row-corrections-in-flight-derivation)
- [Consumers with no row](#consumers-with-no-row)
- [Key 55: foreign-artifact detection](#key-55-foreign-artifact-detection)
- [Register keys on locus's rows](#register-keys-on-locuss-rows)
- [Sources of the ref-backend contracts](#sources-of-the-ref-backend-contracts)
- [Calibration and evidence](#calibration-and-evidence)
- [Obligations tracked elsewhere](#obligations-tracked-elsewhere)
- [Registered folder presence completion coverage](#registered-folder-presence-completion-coverage)
- [A1: where the locus ports bind](#a1-where-the-locus-ports-bind)
- [A2: where locus's link readers get the project ID](#a2-where-locuss-link-readers-get-the-project-id)
- [A3: where a named in-place start meets the cold start](#a3-where-a-named-in-place-start-meets-the-cold-start)
- [A7: where promotion's steps get their checkout](#a7-where-promotions-steps-get-their-checkout)
- [A10: where `arc status <slug>`'s locus reads land](#a10-where-arc-status-slugs-locus-reads-land)
- [A11: removing an adopted branch's missing folder](#a11-removing-an-adopted-branchs-missing-folder)
- [A14: a review-due pause's choices as actions](#a14-a-review-due-pauses-choices-as-actions)
- [Final ratchet inventory](#final-ratchet-inventory)
- [Session and recovery segment comparison](#session-and-recovery-segment-comparison)

## Consumer-map re-verification

The rows this member inherits from `notes-storage-contract.md` § Consumer map, re-verified 2026-10-12 at `327d4178a`
against the sweep at `b050528c5`. Paths are under `packages/arc-framework/src/` unless they start with `.arc/`.

- **Method.** Three read-only passes, one over the locus and session-init partition, one over the user-sync seam rows
  and the six in-flight rows the cohort moved here, and one deriving key 55's rows, each citing a symbol for every
  claim. The author re-read at source every claim the draft builds on and a sample of the rest: the session-init
  binding and its duplicated reconcile reads, the overlap roster's Errands, `handleErrandCheck`'s reads, the
  in-flight entry points, the transition overlay's consumers, the notes-lock port, and eleven citation fixes below.
  Classification calls are the passes' judgment, spot-checked as the sweep's were; the spec re-verifies each row it
  rewrites.
- **Inherited rows: 63.** Locus and session-init, 43 of its 57 (7 projection, 4 cutover, 3 ref-backend); user sync, 14
  of its 45 (26 cutover, 3 ref-backend, 2 projection); and the six in-flight rows. Every one still exists at its rowed
  path; none moved, split, or was deleted, and none of the locus rows names one of the four files split after the sweep.
  Most drift is in citations and in classification, below.

## Where the reroute happens

- **Session-init composition stayed in `handlers/status.ts`.** The split (`d8813fa47`, 2026-10-05) moved handoff,
  recover, and the composite probe to `handlers/status/session.ts`, but `handleSessionInitStatus` still binds every
  session-init state probe: the in-flight oracle (`getOracle` → `analyzeInFlightSnapshot`) and transient indexes,
  `currentWuReconcile` and `userReferenceReconcile`, the roster and the sweeps, `errandSweep` and `inboxState`, the
  nudge-marker reads behind `errandState` and `workUnitState` (`resolveNudgeState`,
  `handlers/status/session-evidence.ts`), and the compaction seed's write. Most of this member's reroute lands there.
- **The `handlers/status.ts` row is stale.** Of its four parts, (a) is now `handlers/status/lifecycle.ts`
  (`handleLifecycleStatus`); (b) and (c) are `handlers/status/views.ts` (`handleProjectStatus`); and (d), the
  session-init probes, spans `handlers/status.ts` and `handlers/status/session*.ts`, none of them rowed since.
- **Slot outcomes are plain objects.** `632a414d2` replaced `neverthrow` with `{ ok, … }` outcomes composed in
  `commands/status/result-composition.ts` (`mapSlot`, `composeSlot`, `failedSlot`); rebuilt slots return those.
- **`currentWuReconcile`'s reads are bound three times.** `handleSessionInitStatus` binds the lifecycle index,
  transition queries, and artifact reads inline beside the same reads `buildCurrentWuReconcile`
  (`lib/work-unit/executor-context-current-wu.ts`) and the reconcile's own command (`handleWuReconcile`,
  `handlers/reconcile.ts`) bind; all three run `prepareCurrentWuReconcile`
  (`lib/work-unit/side-effects/discharge-dep-edges.ts`). From the flip one store-backed prepare, the
  transition-write-path change's, serves all three; locus moves session-init's binding onto it (`spec-seam-locus.md`
  § 4.1).

## Row corrections: locus and session-init

Rows not listed hold as mapped.

| Row                                                      | Correction                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commands/status/run.ts`                                 | `composeSessionInitRecommendations` is private to it; `inferSessionInitRecommendations` and the private `composeNotesPromptText` and `composeCombinedPrompt` are in `lib/session-init/recommended-action.ts`                                                                                                                                                                                                                                 |
| `handlers/derived-locus-state-probe.ts`                  | `runDerivedLocusStateProbe` builds the identity-global root by hand (`join(primary.path, ".arc", "user", identity)`): add keys 13 and 59                                                                                                                                                                                                                                                                                                     |
| `handlers/errand.ts`                                     | Symbols over lines: `runErrandOpenHandler` (`resolveLiveInboxAdoption`), `handleErrandLink`, `runErrandCloseHandler` (`removeCurrentInboxEntry`), `runErrandAbandonHandler` (`unmarkCurrentInboxEntry`), `runErrandPromoteHandler` (`runUserInboxMutation`). Under-classified: `handleErrandCheck` reads the lifecycle index, the in-flight oracle, and `resolveOriginatingMetaPath`, so add `wu.meta`, `placement`, and keys 29, 47, and 55 |
| `handlers/recover.ts`                                    | The seed's task list is read with `git show <seedHead>:<taskListPath>`; wiring now runs through `handleRecoverStatus` (`handlers/status/session.ts`) and `handlers/recover-probes.ts`                                                                                                                                                                                                                                                        |
| `lib/compaction-seed/emitter.ts`                         | A hand-written `.arc/active/meta-` pattern in `emitCompactionSeed`; its snapshot helper is now `readCompactionSeedGitSnapshot` (`handlers/status/session-evidence.ts`)                                                                                                                                                                                                                                                                       |
| `lib/errand/open-runtime.ts`                             | `syncPrimaryBase` is now `syncBase`, which refreshes the local base before any new Errand branch; code refs only                                                                                                                                                                                                                                                                                                                             |
| `lib/git/worktree-scaffold.ts`                           | `scaffoldIntoWorktree` calls `runUserOpen`; editor documents are written in `lib/locus/provisioning-runtime.ts`; it writes no `STATUS.USER`, nor does `runUserOpen`, so its key-53 tag has no mechanism and locus carries no share                                                                                                                                                                                                           |
| `lib/handoff/*`                                          | `restate-candidates.ts` and `session-notes-path.ts` are now called from `createHandoffProbes` (`handlers/status/session.ts`)                                                                                                                                                                                                                                                                                                                 |
| `lib/load-set/projection.ts`                             | Fixed entries and session-notes paths now come from `resolveArcPath`; the meta and task-list paths are still caller-supplied, which half-answers the row's `?`                                                                                                                                                                                                                                                                               |
| `lib/recover/audit.ts`, `integration-correction.ts`      | Workflow paths now come from `resolveArcPath`                                                                                                                                                                                                                                                                                                                                                                                                |
| `lib/session-init/current-wu-reconcile.ts`               | A pure projection over an injected context; the deciding reads are in the binding (§ Where the reroute happens)                                                                                                                                                                                                                                                                                                                              |
| `lib/session-init/errand-state.ts`, `work-unit-state.ts` | The nudge-marker reads are in the binding                                                                                                                                                                                                                                                                                                                                                                                                    |
| `lib/session-init/inbox-state.ts`                        | The content is read by `readUserInbox` (`handlers/status/session-context.ts`)                                                                                                                                                                                                                                                                                                                                                                |
| `lib/user-reference-reconcile.ts`                        | Bound for session-init in `handleSessionInitStatus`; its CLI is `handlers/user.ts`                                                                                                                                                                                                                                                                                                                                                           |
| `session-init/probe-envelope.md`                         | The `errandSweep` slot, the `_Remind:_` sweep over `USER-INBOX`, appears in no row                                                                                                                                                                                                                                                                                                                                                           |
| `run-errand.md`                                          | New since the sweep: route-only Errands that write captures or mint stubs through `route-discovered-work`                                                                                                                                                                                                                                                                                                                                    |

## Row corrections: user sync

| Row                                                     | Correction                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.arc/system/workflows/arc/supplemental/drain-inbox.md` | `notes-*` is no longer a write target; it reads held entries in backlog drafts (`wu.inbound`) and runs `arc errand check --target`: add key 55                                                                                                                                                                                                                           |
| `.arc/system/.internal/skills/arc-inbox/SKILL.md`       | Gained a route-now step (`route-discovered-work`); it still writes only the personal `USER-INBOX`                                                                                                                                                                                                                                                                        |
| `commands/user/add.ts`                                  | `runUserAdd` touches only `WORKING-MEMORY` and `USER-INBOX` (`personal`); the identity-in-use warning needs `read` and `list`                                                                                                                                                                                                                                            |
| `lib/user-sync/current-wu.ts`                           | Every caller but `handleUserReconcileReferences` is a cutover row, while `storage-cutover`'s deletion keeps `resolveCurrentWuName`; the store's `resolveCurrentWorkUnit` (`lib/store/current-work-unit.ts`) exists. The spec moves `handleUserReconcileReferences` onto it, leaving `resolveCurrentWuName` with only the notes-sync callers (`spec-seam-locus.md` § 2.2) |
| `lib/user-sync/execution-offer.ts`                      | Pure over supplied inbox bytes: operations `read`                                                                                                                                                                                                                                                                                                                        |
| `lib/user-sync/notes-lock.ts`                           | `getNotesLockPath` is also the in-repo store's notes lock port (`lib/store/default-ports.ts`), so retiring it moves the port                                                                                                                                                                                                                                             |
| `lib/user-sync/retired-subdir.ts`                       | Its shipped set reads the `origin/<base>` `completed/` tree: `placement`, not `lineage`                                                                                                                                                                                                                                                                                  |

## Row corrections: in-flight derivation

| Row                                   | Correction                                                                                                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/git/in-flight-derivation.ts`     | Two entry points: `analyzeInFlightSnapshot` over supplied evidence and `deriveInFlight`, which still acquires refs; both read metas at refs. Callers supply the Errand facts, so add `errand.record`                                 |
| `lib/work-unit/transition-overlay.ts` | Pure typed tokens with no I/O, imported by no in-flight module; its consumers are project-record composition and transition writers, so it reads as a lifecycle row; the spec leaves it unchanged (`spec-seam-locus.md` § Non-Goals) |
| `commands/active/in-flight.ts`        | Three entry points: `runActiveInFlightExpansion` (the handler's default), `expandActiveInFlight`, and `runActiveInFlight`, which serves `--local`, `arc errand check`, and `check-foreign-writes.ts`: add key 55                     |
| `handlers/active.ts`                  | `handleActiveInFlight` builds the parked set from the lifecycle index as a deciding input, so `projection` understates its reads                                                                                                     |
| `in-flight-scope-check.md`            | Its symbols were wrong at the sweep: the default path is `runActiveInFlightExpansion` → `analyzeInFlightSnapshot`. `activate-work-unit.md` runs the same oracle, and its row lacks key 29                                            |

## Consumers with no row

Locus's, each touching state no row covers:

- `handlers/status/session.ts` — `createHandoffProbes` reads `SESSION-NOTES` and `USER-INBOX`; `resolveHandoffSurfaces`
  supplies the `WORKING-MEMORY` and session-notes paths.
- `handlers/status/session-context.ts` — `readUserInbox`; shared with user sync.
- `handlers/status/session-evidence.ts` — `resolveNudgeState` reads the per-identity `.internal/*-last-nudge.txt`
  markers (`machine-local`).
- `handlers/recover-probes.ts` — wires the derived-locus probe for `--recover`.
- `lib/errand/link-runtime.ts` and `partial-settle-runtime.ts` — the Errand record's inbox back-pointer, and the partial
  settle of the inbox entry and its mark.
- `lib/errand/identity-transitions.ts` and `identity-claims.ts` — record transforms inside the rowed transaction; on the
  boundary with `storage-ref-backend`.
- `lib/session-init/inbox-reminders.ts` and `errand-staleness-sweep.ts` — the `USER-INBOX` parsers behind `errandSweep`.
- `lib/git/foreign-artifact-detection.ts` — key 55, below.
- `commands/user/inbox-list.ts`, `handlers/user-inbox-list.ts`, and `lib/user-sync/inbox-target.ts` — `arc user
  inbox-list --target` (`6bb65ea35`), which reads `USER-INBOX` under the notes lock and gates `create-spec.md`,
  `activate-work-unit.md`, and `verify-work-unit.md`: `personal`, `read`, `store`.
- `.arc/system/methods/route-discovered-work.md` — the hold-and-route binding whose flip rewrite key 21's fate names,
  added after the map's freeze (`1fb8d2136`): it reads a draft's Inbound Buffer, re-stamps `_Hold:_` captures, reads the
  owner from `arc status`, writes captures, mints stubs, and folds concerns; the `arc-inbox` skill, `run-errand.md`,
  `drain-inbox.md`, `draft-design.md`, `create-spec.md`, `activate-work-unit.md`, and `verify-work-unit.md` fire it. Its
  text changes only in `storage-cutover`'s flip rewrite; locus's obligation is what its verbs return.
- `lib/session-init/in-flight-work-unit-sweep.ts` — derives each work unit's name from its meta path's basename
  (`workUnitNameFromMetaPath`), a hand-built state path (keys 13, 29); from the flip it takes each roster row's work
  unit (`spec-seam-locus.md` § 3.1).
- `lib/session-init/locus-classification.ts` — classifies a branch's owner, importing from `completed-index.ts` only the
  pure `branchToWorkUnitSlug` helper; it reads no archive index, so it is no shipped-work reader
  (`spec-seam-locus.md` § 3.4).

Callers outside locus's files: `commands/rename.ts`, `handlers/start.ts`, and `handlers/lifecycle.ts` call the in-flight
expansion (`expandActiveInFlight`, and `runActiveInFlightExpansion` in the last), key 29's; the reroute keeps its result
shape, so those lifecycle files change only if it must, serialized with lifecycle. `handlers/review-locus-context.ts`
(#827) binds review handlers to their checkout through the derived-locus probe (`runDerivedLocusStateProbe`) and reads
nothing itself; it follows the probe, shared with delivery and review. Checked and needing no row, since they read and
write code branches only: `handlers/status-remote-context.ts` (remote prerequisites for session-init),
`lib/errand/exact-branch-generation.ts` (an Errand tail's branch deletion, before the identity retirement that follows),
and `lib/errand/materialize-branch.ts`.

Found in passing, other partitions': `lib/locus/provisioning-runtime.ts` and `lib/schema-command/editor-documents.ts`
(projection); `handlers/status/views.ts`, `lib/work-unit/executor-context-status.ts`, `lib/view/started-artifacts.ts`,
and `lib/status/work-unit-purpose.ts` (status); `lib/work-unit/executor-context-current-wu.ts`,
`lib/work-unit/teardown-lifecycle-projection.ts`, `handlers/lifecycle-shared.ts`, and
`handlers/lifecycle-delivery-review.ts` (lifecycle). Modules that only transform evidence passed to them — the rest of
`lib/locus/`, `lib/session-init/`, and `lib/errand/`, `derived-reader.ts` and `derived-roster.ts` among them — need no
row.

## Key 55: foreign-artifact detection

Re-read at `c83d24256`, after PR #919, which the baseline above predates.

**Today.** `handleErrandCheck` (`handlers/errand.ts`) builds the parked set from the working tree's lifecycle index,
runs `runActiveInFlight` (→ `deriveInFlight`, which lists and shows `.arc/active/meta-*` at each eligible ref), and
projects the result with `projectInFlightToOverlapRoster`, which keeps work units by name and meta path and Errands by
slug. An online read classifies Errand branches from the remote's Errand records, falling back to the local ones when
the remote is absent or unreachable (`readFetchedTransientInFlightIndexes`, `lib/errand/record.ts`), and a local-only
read keeps the local records. `detectForeignArtifactOverlap` keeps unshipped work units and Errands
(`isOverlapCandidate`), drops parked, marked, and self entries — self by name, by the originating checkout, or by
`resolveOriginatingMetaPath`, an Errand only by its checkout — and for each remaining entry runs a committed probe
(`git diff <origin/base>...<sha> --name-only -- <targets>`) and, for a checked-out entry, an uncommitted probe
(`git status --porcelain -- <targets>`) bracketed by `HEAD` and `MERGE_HEAD` checks, which report `indeterminate` on a
merge in progress or a moved head (`1ed18416c`, `4fdbbe8ec`, `8db141413`). Targets are prefix-matched paths with no
special handling for `.arc/`. The other caller, `check-foreign-writes.ts`, narrows targets to the work-unit surface
(`classifyPathSurface`), so it compares state targets only, against work units and Errands alike.

**Errands as candidates (PR #919).** The roster dropped Errands from `c0a0e815b` ("no meta, not WU-overlap candidates")
until PR #919, though neither probe needs a meta; since then both callers count them, so key 55's fate carries no
pre-flip Errand fix, and from the flip the check excludes the locus running it, Errand or work unit, by its own identity
rather than by checkout or meta path.

**Rows.** New or amended, `?` marking a guess:

| Consumer                                           | Owner | Register     | Families                                               | Becomes                                                                                                                                                                                                                          |
| -------------------------------------------------- | ----- | ------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/git/foreign-artifact-detection.ts` (new)      | seam  | 13, 29, 55   | `wu.meta`, `placement`, `machine-local`; state targets | Targets split through the layout resolver: code targets keep both probes; state targets report overlap when the record's own work item is in flight in another locus, read through the store, Errands included; self by identity |
| `handlers/errand.ts` (amend)                       | seam  | + 29, 47, 55 | + `wu.meta`, `placement`, `machine-local`              | The in-flight set from the store's `list`, paused work units counted through both probes, since a pause keeps the checkout, the parked skip retiring with park, self from the checkout marker                                    |
| `commands/active/in-flight.ts` (amend)             | seam  | + 55         | + `machine-local`                                      | `runActiveInFlight` serves the check and the hook until the flip; from it the check reads the store's in-flight set and the hook reads nothing                                                                                   |
| `lib/git/in-flight-derivation.ts` (amend)          | seam  | + 55         | + `errand.record`                                      | —                                                                                                                                                                                                                                |
| `lib/release/wu-resolution.ts` (amend)             | seam  | + 55         | —                                                      | `resolveOriginatingMetaPath` stops being the self-exclusion key                                                                                                                                                                  |
| `scripts/check-foreign-writes.ts` (amend)          | seam  | + 55         | `wu.meta`, `wu.tasks`, `wu.prose`, `placement`         | Branches on the capability: from the flip it returns before any read, a commit then staging no work unit's state, and the deletion pass removes it                                                                               |
| `drain-inbox.md`, `run-errand.md` (amend)          | seam  | + 55         | —                                                      | The drain's targets are mostly state targets, so the store query becomes its main path                                                                                                                                           |
| `.arc/system/methods/assess-parallel-fit.md` (new) | seam  | 55           | —                                                      | Consumes the check's facts; unchanged unless state-target facts change the envelope (?)                                                                                                                                          |

## Register keys on locus's rows

Every `storage-seam` register key that a locus row of the consumer map carries, derived from the map's
locus-and-session-init and user-sync partitions and the six in-flight rows the cohort moved here. Locus realizes its
share of each; a row closes once every member carrying it has (`cohort-storage-seam.md` § Closeout criteria). Key 55's
rows are this file's own (§ Key 55); the session-init path row carries no key, and neither does the inbound
back-pressure row, which locus alone carries and closes. Two rows of locus's partitions are left out, since the spec
gives locus no share of them: `lib/git/worktree-scaffold.ts` (keys 17, 30, 33, 45, 47, and the map's 53, though that
file writes no `STATUS.USER`), whose arm from the flip the transition-write-path change builds (`spec-seam-locus.md`
§ 1.3, § 2.8), and `lib/work-unit/transition-overlay.ts` (keys 14, 29), which the spec leaves unchanged. Paths drop
`src/`; `workflows/` is `.arc/system/workflows/arc/` and `skills/` is `.arc/system/.internal/skills/`.

| Key | Mechanism                          | Locus rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12  | placement as lifecycle             | `handlers/active.ts`, `workflows/session-lifecycle/session-init.contributor.md`, `handlers/candidate-mutation-owner.ts`, `lib/git/worktree-roster.ts`, `lib/locus/derived-evidence.ts`, `lib/locus/derived-lifecycle-evidence.ts`, `lib/locus/subject-meta.ts`, `lib/recover/audit.ts`, `lib/session-init/cohort-doc.ts`                                                                                                                                                                                                                                                                              |
| 13  | hand-built state paths             | `handlers/candidate-mutation-owner.ts`, `lib/git/worktree-roster.ts`, `lib/handoff/session-notes-path.ts`, `lib/load-set/projection.ts`, `lib/locus/subject-meta.ts`, `lib/session-init/cohort-doc.ts`                                                                                                                                                                                                                                                                                                                                                                                                |
| 14  | lifecycle from branch refs         | `lib/git/in-flight-derivation.ts`, `lib/locus/derived-evidence.ts`, `lib/locus/derived-lifecycle-evidence.ts`, `lib/session-init/branch-gone-recovery.ts`, `lib/session-init/errand-state.ts`, `lib/session-init/orphan-branch-sweep.ts`, `lib/session-init/work-unit-state.ts`                                                                                                                                                                                                                                                                                                                       |
| 15  | archive before merge               | `lib/locus/derived-evidence.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 16  | retirement writes                  | `lib/session-init/current-husk-advisory.ts`, `lib/session-init/current-wu-reconcile.ts`, `lib/session-init/lifecycle-residue-sweep.ts`, `lib/session-init/stale-worktree-sweep.ts`, `lib/user-reference-reconcile.ts`                                                                                                                                                                                                                                                                                                                                                                                 |
| 17  | per-work-unit workspace            | `lib/handoff/session-notes-path.ts`, `commands/user/close.ts`, `commands/user/open.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 21  | hold-and-route                     | `lib/session-init/inbox-state.ts`, `workflows/supplemental/drain-inbox.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 29  | in-flight derivation               | `workflows/work-unit-lifecycle/in-flight-scope-check.md`, `commands/active/in-flight.ts`, `handlers/active.ts`, `lib/git/in-flight-derivation.ts`, `workflows/session-lifecycle/session-init.md`, `workflows/session-lifecycle/session-init/probe-envelope.md`, `commands/status/run.ts`, `handlers/candidate-mutation-owner.ts`, `lib/errand/record.ts`, `lib/git/worktree-roster.ts`, `lib/session-init/errand-state.ts`, `lib/session-init/work-unit-state.ts`                                                                                                                                     |
| 31  | notes probes and user reconcile    | `skills/arc-session/SKILL.md`, `workflows/session-lifecycle/session-init.md`, `workflows/session-lifecycle/session-init/probe-envelope.md`, `commands/status/run.ts`, `lib/session-init/inbox-state.ts`, `lib/user-reference-reconcile.ts`                                                                                                                                                                                                                                                                                                                                                            |
| 32  | reconcile and stale-sweep slots    | `workflows/session-lifecycle/session-init.md`, `workflows/session-lifecycle/session-init/probe-envelope.md`, `commands/status/run.ts`, `lib/session-init/current-wu-reconcile.ts`, `lib/session-init/lifecycle-residue-sweep.ts`, `lib/session-init/retired-subdir-detection.ts`, `lib/session-init/stale-worktree-sweep.ts`, `lib/user-sync/retired-subdir.ts`                                                                                                                                                                                                                                       |
| 33  | locus derivation                   | `workflows/session-lifecycle/session-init.md`, `workflows/session-lifecycle/session-recover.md`, `commands/status/run.ts`, `handlers/derived-locus-state-probe.ts`, `handlers/errand.ts`, `handlers/recover.ts`, `lib/compaction-seed/emitter.ts`, `lib/errand/abandon-runtime.ts`, `lib/errand/close-runtime.ts`, `lib/errand/leave-runtime.ts`, `lib/errand/open-runtime.ts`, `lib/errand/record.ts`, `lib/locus/derived-evidence.ts`, `lib/locus/derived-lifecycle-evidence.ts`, `lib/locus/subject-meta.ts`, `lib/recover/integration-correction.ts`, `lib/session-init/current-husk-advisory.ts` |
| 45  | record writes through code commits | `lib/errand/promote-runtime.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 46  | promotion waits on its commit      | `workflows/supplemental/run-errand.md`, `handlers/errand.ts`, `lib/errand/promote-runtime.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 47  | single-meta current work unit      | `commands/active/roster.ts`, `handlers/candidate-mutation-owner.ts`, `handlers/derived-locus-state-probe.ts`, `lib/git/worktree-roster.ts`, `lib/locus/subject-meta.ts`, `lib/session-init/current-wu-reconcile.ts`, `lib/user-sync/current-wu.ts`                                                                                                                                                                                                                                                                                                                                                    |
| 48  | lifecycle from HEAD or the PR head | `handlers/candidate-mutation-owner.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 51  | writes routed by committability    | `workflows/supplemental/run-errand.md`, `skills/arc-housekeep/SKILL.md`, `workflows/supplemental/drain-inbox.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 52  | continuity on code commits         | `workflows/session-lifecycle/session-handoff.md`, `workflows/session-lifecycle/session-init.md`, `workflows/session-lifecycle/session-recover.md`, `handlers/recover.ts`, `lib/compaction-seed/emitter.ts`, `lib/handoff/restate-candidates.ts`, `lib/recover/audit.ts`, `lib/recover/committed-progress.ts`, `lib/recover/integration-correction.ts`                                                                                                                                                                                                                                                 |
| 54  | identity seeding overwrites        | `lib/user-reference-reconcile.ts`, `skills/arc-inbox/SKILL.md`, `commands/user/add.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 55  | overlap through branch diffs       | this file's § Key 55 rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 57  | workflows commit state             | `workflows/session-lifecycle/session-handoff.md`, `workflows/supplemental/run-errand.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Key 54 also sits on `lib/setup.ts`, a `storage-cutover` row (18, 22, 54), where `runPostInitSetup` seeds
`USER-INBOX` and `WORKING-MEMORY` for `arc init` and `arc join` unconditionally. Locus takes that key's share of the
file, the absent-only creation and the identity-in-use warning, and cutover keeps keys 18 and 22 (Owner, 2026-10-12).

Three keys bear on locus's reads without a row in the table: `session-init-performance`'s notes items go with
session-init's reads (key 10); handoff's routing of base and notes sync to the primary stays `handoff-optimization`'s
(key 41); and the Errand index projection in `lib/errand/record.ts`, with the locus consumers' listing protocols, is key
62's surviving half, the review gate's staying with delivery and review.

## Sources of the ref-backend contracts

The rules the spec takes from the reference backend, with the sections of `spec-storage-ref-backend.md` that settle
them and the contract decisions they rest on:

| Spec  | Rule                                                                                                    | Source                               |
| ----- | ------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| § 2.7 | The import carries no checkout marker, which is machine-local                                           | § 10.8                               |
| § 2.7 | The import links no branch for a work unit whose `Branch` is empty or names base                        | § 10.9 (settled 2026-10-12)          |
| § 4.8 | Session start's `pull`, and its `designation-needed` report with the remedy's argv                      | § 6.1                                |
| § 6.3 | `_Rank:_` orders the Errand queue by rank key, so the run order merges by entry                         | § 3.8; D6, D11                       |
| § 6.6 | A kind no declaration homes refuses its writes `unhomed-kind`, and the import's trial refuses it        | § 5.1, § 10.5                        |
| § 8.1 | The project's identity record (`project-registry/identity`), with its write, merge, and adoption        | § 3.2, § 9.8                         |
| § 9.2 | An ended item's missing history ref refuses `state-unresolvable`; the verb pulls it by name and retries | § 2.3, § 4.5                         |
| § 9.2 | Restating across people restricts `changes` to project scope                                            | `strategy-storage-evolution.md` § 11 |
| § 9.3 | `maintain()`'s ref measurements and the push's retry count and time waited                              | § 12; D10, D11                       |

## Calibration and evidence

- **Back-pressure's default.** The default of 10 pending entries (`spec-seam-locus.md` § 4.6) sits against about six
  per buffer-carrying draft: 86 of 143 backlog drafts carried a buffer, holding 509 entries
  (`spec-inbound-routing-method.md` § Introduction / Context, counted at `c009ab198`).
- **Wrapped `WORKING-MEMORY` headers.** One sweep found three of twelve entries silently folded into the entry before
  them by a header wrapped past the line limit, the case § 6.5's loud refusal closes.
- **Shared decision 9 is not provisional.** `inbound-routing-method` shipped as specified (PR #860), its amendments
  touching nothing item 9 consumes.

## Obligations tracked elsewhere

Other work units' records hold these; each is named here only to find it.

- **`storage-cutover`'s draft:** "Rehearse the flip's carry of checkouts claimed in place before it" (§ 2.7's
  claimed-in-place and cold-started-on-base cases); "Carry `arc user inbox-list` and the capture exit guards across the
  flip" (§ 7.1); "Take `storage-seam`'s flip-rewrite obligations into the cutover's workflow rewrite", which carries the
  `_Routed from:_` date's move to `_Created:_` (§ 6.2); and the flip rehearsal, where the tripwires' first live figures
  come, since the in-repo store reports none (§ 9.3).
- **The hold-and-route hand-off the flip rewrites** (§ 7.9) spans three sites: `arc-inbox`'s route-now step,
  `arc-errand`'s route shape, and `run-errand.md`'s route-only Errand. `inbound-routing-method`'s D7 and D8 moved the
  buffer section, the owner-adoption hold, and the coordination-seam rule into the `route-discovered-work` method's
  until-the-flip binding (PR #860).
- **`composable-workflows`' draft:** "Dispatch published remedy actions instead of reducing them to prompt text", the
  consuming side of § 4.3's actions.
- **`USER-INBOX § Errand`:** "Make the routing method route out of a work unit past planning by default" (§ 7.8, and
  § 16's routing-method arms).

## Registered folder presence completion coverage

Task 1.4 - `tasks-seam-locus.md` implements spec § 1.4, item 2 of `spec-seam-locus.md`.
`scanRegisteredWorktrees` observes each registered path once. A missing path reads absent; other observation failures
retain presence. The shared topology schema requires `folderPresent`, and derived rows preserve it.

These tests change for this observable item; paths are relative to `packages/arc-framework/__tests__/`. The scanner
and derived-row tests exercise the new behavior, the locus E2E exercises its actual wire output, and other changes
add the required field to topology fixtures.

- `e2e/locus-folder-presence.e2e.test.ts`
- `integration/recovery-locus.test.ts`
- `integration/status.test.ts`
- `unit/compaction-seed/emitter.test.ts`
- `unit/errand/open-resume.test.ts`
- `unit/errand/partial-settle-runtime.test.ts`
- `unit/errand/terminal-authority.test.ts`
- `unit/errand/terminal-occupancy.test.ts`
- `unit/git/worktree-roster-folder.test.ts`
- `unit/git/worktree-roster.test.ts`
- `unit/handlers/locus.test.ts`
- `unit/handlers/status-locus.test.ts`
- `unit/handoff/locus-plan.test.ts`
- `unit/locus/allocator.test.ts`
- `unit/locus/derived-evidence.test.ts`
- `unit/locus/derived-reader.test.ts`
- `unit/locus/derived-roster.test.ts`
- `unit/locus/provisioning.test.ts`
- `unit/locus/role-authority-boundary.test.ts`
- `unit/locus/session-guidance.test.ts`
- `unit/recover/audit.test.ts`
- `unit/recover/locus-context.test.ts`
- `unit/scripts/integration/errand-merge-composition.test.ts`
- `unit/scripts/review-gate/hosted/errand-authority.test.ts`
- `unit/session-init/lifecycle-residue-sweep.test.ts`
- `unit/session-init/locus-classification.test.ts`
- `unit/session-init/stale-worktree-sweep.test.ts`
- `unit/status/run.test.ts`
- `unit/status/session-envelope-schema.test.ts`
- `unit/work-unit/mutators/reconcile-work-unit-worktree.test.ts`
- `unit/work-unit/teardown-selection.test.ts`
- `unit/work-unit/verbs/teardown.test.ts`

The session-envelope compatibility scenarios add only `folderPresent` on registered checkout records in these
fixtures under `packages/arc-framework/__tests__/fixtures/session-envelope/`:

- `recovery-audit-dirty-path-drift.json`
- `recovery-audit-ready.json`
- `session-init-active-resume.json`
- `session-init-branch-gone.json`
- `session-init-current-husk.json`
- `session-init-orient.json`

The unchanged `integration/rename-worktree-composition.test.ts` exercises the whole-record comparisons across an
actual checkout move, with presence retained in both snapshots.

## A1: where the locus ports bind

A1 moves the locus ports' binding from their default record to the executor context. `spec-seam-locus.md` § 2.4 read:

> The binding has one production point, the default port record (`createDefaultLocusPorts`): the check's and the
> writer's callers read it when given no record, as every production context gives none, and the lookup's two callers
> (`findWorkUnitHoldingCheckout`, `lib/work-unit/verbs/unshared-work.ts`, and teardown's,
> `lib/work-unit/verbs/teardown-store.ts`), which fall back to their own marker scan when given none, come to read it
> too.

and, later in the same paragraph:

> The default record, given no context, opens its own Git executor, and the check its own store for the holder's state,
> over the checkout the process runs in, as this change's readers do where none is given.

§ 16's ports item read:

> the three ports are one record (`LocusPorts`, in `lib/work-unit/locus-ports.ts`), whose default
> (`createDefaultLocusPorts`) the check's and the writer's callers read when given no record, as every production
> context gives none, and the lookup's callers, which fall back to their own marker scan, come to read through this
> change, so it binds them at that one point;

The landed transition-write-path change already carries a port record through the executor context:
`buildExecutorContext` (`lib/work-unit/executor-context.ts`) passes an injected `locusPorts` to its callers and into
`reconcileWorkUnitWorktree`'s context, and every lookup caller already reads the executor's (`handlers/start-store.ts`,
`handlers/materialize-store.ts`, `lib/work-unit/verbs/abandon-store.ts`, `lib/work-unit/store-teardown-context.ts`,
`handlers/lifecycle-collaboration.ts`, `handlers/lifecycle.ts`). Binding the default instead would have:

- had a function given no context open a Git executor and a store over the process's directory on every call, beside the
  verb's own, which a test could replace only by mocking the module;
- had the lookup's callers rewritten to default through it, where given no record they keep their own scan today;
- rested pre-flip inertness on each caller's arm alone, with no gate at the binding itself.

Binding where the context is built gives one production point that tests already inject through (the overrides
`handleStart` takes, `VerbBase.locusPorts` in `handlers/lifecycle-shared.ts`), and gating it on `usesOffBranchState`
leaves every context over the in-repo implementation without ports, so nothing changes before the flip. It follows the
context's binding of the project-ID reader (`createProjectIdentityReader`), gated the same way.

The trade-off is that a context built outside `buildExecutorContext` carries no ports. One production path reaching the
check or the writer does so: store start's create-new, whose spawn takes the store start context's own field
(`StoreStartContext.locusPorts`, `handlers/start-store.ts`), and A1 moves it onto the executor's. Rename's and
teardown's direct calls of `reconcileWorkUnitWorktree` run its move and teardown arms, which call no port. Promotion
runs the check from its own runtime's store and Git executor (Task 3.9 - `tasks-seam-locus.md`), not through lifecycle's
ports, so A1 leaves it alone.

## A2: where locus's link readers get the project ID

A2 gives locus's link readers and writers a project ID from the flip. `spec-seam-locus.md` § 16's cutover item read:

> its production binding of the project-ID port the transition-write-path change injects (`projectId`), to a read of the
> project's identity record, which only tests supply until then (§ 8.1);

and the task list's Phase 2 design decision called the port one "which only tests supply until the flip binds it to a
read of the project's identity record (spec § 16)", with Task 3.4 saying of it "which the flip binds; tests inject it".

The landed transition-write-path change already binds that read, in its executor context: `buildExecutorContext`
(`lib/work-unit/executor-context.ts`) gives a context over a store that reads state off the branch
`createProjectIdentityReader(store)` (`lib/store/project-identity.ts`), and its verbs read the context's
(`handlers/task.ts`, `handlers/lifecycle.ts`, `handlers/lifecycle-collaboration.ts`,
`lib/work-unit/store-teardown-context.ts`). The binding the cutover was to make exists, gated on the same capability as
the flip, so the cutover has nothing to bind. What it would not have reached is this change's readers and writers of
links outside an executor context, which took the port as optional and were given one nowhere: from the flip, in
production, each would have read no project ID — the frame unresolved, the Errand close, open, and promotion refusing,
the sweeps and the commits listing reporting nothing.

The rule follows the executor's: each takes the port as optional, a verb holding an executor context passes the
executor's, and given none it binds `createProjectIdentityReader` over the store it already reads, so tests that inject
a reference-backend store stay hermetic. A composer of several such readers passes one, since the reader memoizes its
observation. The link readers and writers, each now with a test that, given no port, the project ID comes from the
identity record: the frame (Task 2.1.b), the current-work-unit resolver's `branch` (2.3), the claimed-in-place match
(2.7), the in-flight set (3.1.a), the close's landing commit (3.4), the open's branch link (3.5), the stale-worktree
sweep's folderless registrations (3.7.b), promotion (3.9.a), the locus classification (5.2.a), the orphan-branch sweep
(5.2.b), and the commits listing (7.4.a). The overlap check reads 3.1.a's set rather than links, and the Errand abandon,
leave, and link runtimes write no branch link.

"The port absent" stays among the no-project-ID conditions, as the shipped resolver still distinguishes it
(`resolveProjectIdentity`). § 13's two rows dropped the remedy text "or that no port is bound", which no shipped code
says: the resolver reports an absent port as "Project identity is unavailable." with the identity record's restore
remedy. The Phase 2 sentence also dropped that the task close "refuses only an absent port": it refuses a failed read
too, through `resolveProjectIdentity` (`prepareTaskClose`).

The rule is realized across Phases 2, 3, 5, and 7, so the row names Task 2.1, where it first lands, as its work, and the
terminal verification, the first check over all of Success Criterion 13, as its revalidation.

## A3: where a named in-place start meets the cold start

A3 moves store start's hand-off of a named in-place start. `spec-seam-locus.md` § 2.5's entry item said store start

> hands `arc start --here` with `--new` or with no name to its cold-start slot (`admitColdStart`) ahead of its dispatch,
> and refuses in-place creation while the slot is empty

and that

> A named start runs that dispatch itself first, over the store's lifecycle view with `create: true`
> (`resolveStartDispatch`), refusing with its reason unless it selects `create-new`, as the in-repo arm's dispatch does,
> so a name the store holds refuses before anything is written;

The cold start's own dispatch could not deliver that outcome. `handleStoreStart` (`handlers/start-store.ts`) fills the
slot before `resolveStartName`, which resolves a slug through `lookup`, so it takes a former slug to its work unit and
refuses an Errand's, and before `create`'s refusal of `--class`. The lifecycle view's index, which
`resolveStartDispatch` reads, holds neither former slugs nor Errand slugs, so a named `--here --new` on either passed
the cold start's dispatch, wrote the marker, and met its refusal only at the record write, and `--class` was taken
silently. The in-repo arm (`handleStart`, `handlers/start.ts`) dispatches and refuses `--class` before its cold start.

Handing the named start over from `create`, where store start already refuses in-place creation, reuses all three checks
and removes the cold start's second dispatch. A nameless start has no name to resolve, so it keeps the slot ahead of the
dispatch, and a derived name the store holds still meets the record write's conflict.

## A7: where promotion's steps get their checkout

A7 elaborates `spec-seam-locus.md` § 8.3 where it said nothing: how promotion's steps get their checkout from the flip.
Today promotion's frame step (`replaceLocalFrame`, `lib/errand/promote-runtime.ts`) authorizes the Errand it read
against the derived frame (`authorizeErrandTerminal`, `lib/errand/terminal-authority.ts`), takes the checkout that
authority selects, refusing `checkout-missing` where it selects none, checks that checkout's branch, head, and clean
tree (`inspectCheckout`), and on a rerun finds the promoted checkout by its branch (`recoverPromotedFrame`).

The transition-write-path change's steps replace that frame step: their put and cut fill `replaceFrame`
(`spec-seam-lifecycle.md` § 7.2), and they leave the frame to their caller ("Caller-owned checkout frame metadata stays
outside these storage steps", `lib/errand/promote-store.ts`), taking a fixed `cwd` and `frame` when they are built.
Nothing in this change's plan supplied them. Task 3.9.a had the runtime build the frame "as `receiptFromAuthority`
derives it", which needs an authority over the record, whose `claimId` the steps read only inside
`promoteOrdinaryErrand`. From the flip the only check of the Errand's generation would have been the occupancy
settlement's marker comparison, after the role write, the cut, and the switch, and a promotion from another checkout
would have run with no confirmation.

The steps therefore take their checkout through a callback once they hold the Errand. The alternative, the runtime
finding the Errand's checkout from the frame by slug before the read, keeps the steps' options but cannot tell a stale
marker's generation from the live one's without the record. Only lifecycle's tests build the steps, so the option change
reaches no production caller.

A rerun finds its checkout by marker rather than by branch. A crash after the role write and before the switch leaves
the checkout on the Errand's branch with the Errand's marker, one after the switch leaves it on the work branch with
that marker, and one after the settlement leaves the work unit's marker. The rerun runs no authorization, as today's
recovery runs none, since the Errand's record is now the work unit's.

The clean-tree check does not carry over. Today's arm commits the meta in the checkout, and the only dirt it admits is
that meta (`inspectCheckout`); from the flip the meta is a store record and the cut lands on the commit the checkout
holds, so the switch carries any uncommitted changes onto the work branch.

The exclusivity check stays where § 8.3 places it, before `promoteOrdinaryErrand`, at the checkout the runtime runs in.
A fresh promotion's work unit is new, so no marker names it, and a rerun after the settlement from the promoted checkout
admits that checkout's own marker. A promotion confirmed onto another checkout passes the check the checkout it runs in
rather than the one that will hold the work unit, which admits only a marker in the invoking checkout naming the new
work unit, such as a crashed cold start's of that name; that edge is accepted rather than given a second check.

## A10: where `arc status <slug>`'s locus reads land

A10 places this change's `arc status <slug>` reads in the store arm and drops the boundary's read path.
`spec-seam-locus.md` § 3.1's status bullet read that

> From the flip the worktree path comes from the roster's lookup of the checkout whose marker names the work unit
> (§ 2.4), a lookup that rejects reporting its condition in place of the path, never no checkout, the read path is that
> checkout, the warnings come from the in-flight set listed through the store, and with `--fetch` the remote's
> reachability comes from the store's pull (§ 4.8).

and § 1.2 listed the query's "operational read path" among this change's files; Task 3.1.c had the query "read the path
for its operational boundary at that checkout".

The transition-write-path change's store arm (`handleStoreLifecycleStatus`, `handlers/status/lifecycle.ts`) already
serves the query from the flip: `handleLifecycleStatus` returns into it before any composed-index read, and it reads
state, record, purpose, and owner through the store, reporting no worktree path and no in-flight warnings, ignoring
`--fetch`, and reporting `integrationBoundary: null`. The reads Tasks 3.1.c and 3.3.a described as moving have nothing
to move there; they are additions to that arm.

The read path fed today's boundary read (`resolveSlugOperationalBoundary`), which reads the checkout's active meta and
the Candidate and submission-boundary records there (`runActiveStatus`, `commands/active/status.ts`). From the flip none
of these sits in the checkout, so a read there would report the meta missing. The delivery change reads the boundary
record through the store wherever the work unit is checked out (`spec-seam-delivery-review.md` § 12.4), which needs no
path from this change. The arm keeps reporting `null` until that change lands its read; the flip follows every member,
so no flipped repository reads the gap.

## A11: removing an adopted branch's missing folder

A11 narrows `spec-seam-locus.md` § 12.2's typed teardown for a missing folder's registration to a branch the work unit
created. Its first bullet read

> **A branched one whose work unit has ended** — shipped by its branch, as today, and from the flip by its branch's link
> (`lookup` by ref) and the work unit's placement — takes `arc teardown <name>`, typed, since teardown matches it by the
> branch it retires and removes it through the removal function, which reads the folder again (§ 16); where it is
> locked, `git worktree unlock <path>`, then `arc teardown <name>`, as text, the lock being its owner's.

The transition-write-path change's store teardown (`runStoreTeardown`, `lib/work-unit/verbs/teardown-store.ts`) clears a
missing folder's registration only on its way to deleting a branch it created: `prepareCreatedBranch` calls
`clearMissingWorktreeRegistrations` (`lib/git/worktree-removal.ts`) for the retiring branch when its link records
`linkedAs: "created"`, and for the additional created branches it reaps. A link recording `adopted` goes to
`reportAdopted`, which keeps the branch and prints its owner's cleanup, a `git switch` from the registration's path
among it, a path that no longer exists. The holder removal (`retireHolder`) finds its checkout by marker, and a missing
folder took its marker with it. A typed `arc teardown <name>` offered for such a registration would leave it registered,
and the sweep would offer the same action at every session start, against § 4.3's rule that an action is typed only
where running it as given repairs the condition.

Such a registration joins the ones that take `git worktree remove <path>` as text. With its folder gone nothing tells an
ARC-spawned checkout of the adopted branch from one its owner made, so removing it is the owner's call, as for an
in-flight work unit's. Before the flip the sweep reads no link, so nothing changes there. Teardown's own `git switch`
text for a missing path is that change's code, captured for an Errand rather than changed here.

## A14: a review-due pause's choices as actions

A14 gives a review-due `pausedWork` item its choices as actions where `spec-seam-locus.md` § 4.3 and § 4.4 gave it a
prompt alone, as text. § 4.4 read

> A review-due item carries a review prompt, its text precomposed, asking its owner to resume it (`arc resume <slug>`),
> hand it over (`arc handover <slug> --to <identity>`), open it to takers where it is not open already
> (`arc pause <slug> --open`), or abandon it (`arc abandon <slug>`), each a command it names in full but the identity a
> handover takes; the slot always passes the slug.

and § 4.3's row for the item, its form text, gave as its action

> its review prompt: `arc resume <slug>`, `arc handover <slug> --to <identity>`, `arc pause <slug> --open` unless open,
> and `arc abandon <slug>`

The transition-write-path change, whose pause and verbs the slot reports, expects the prompt's choices — resume, hand
over, open to takers, abandon — as runnable commands, its text precomposed by the CLI (`spec-seam-lifecycle.md` § 19).
Three run as given once the slot fills the slug: `arc resume <slug>` clears the pause (`runResumePaused`,
`lib/work-unit/verbs/pause-handover.ts`), `arc pause <slug> --open` updates it in place, keeping its other fields, and
`arc abandon <slug> --yes` abandons, where without `--yes` it refuses (`handleStoreAbandon`,
`handlers/abandon-store.ts`). No slot marks any of them to run unasked, so each is an offer the workflow runs only on
the person's approval (§ 4.3), and that approval is the abandon's confirmation. The handover takes the identity it hands
to, which only the owner can name, so it stays text, as a typed action is one runnable as given.

## Task 1.5: removal observations

Spec § 1.4, item 4 changes `unit/git/worktree-cleanup.test.ts`, `unit/session-init/branch-gone-cascade.test.ts`,
`unit/session-init/branch-gone-recovery.test.ts`, `unit/session-init/stale-worktree-sweep.test.ts`, and
`unit/session-init/lifecycle-residue-sweep.test.ts`; it adds `unit/session-init/removal-observations.test.ts` and
`unit/errand/leave-runtime-removal.test.ts`. All paths are under `packages/arc-framework/__tests__/`. No golden fixture
changes are required by this increment.

Recovery takes folder presence from the cached derived roster alongside its identity-filtered candidate roster, so it
neither widens the public roster nor scans registrations again. Filesystem injection keeps synthetic checkout paths
independent of module import order in the shared unit workers. Leave's spawned inspection omits a redundant status read
once its pre-write removal check has established cleanliness; terminal settlement keeps its inspection until Task 1.6 -
`tasks-seam-locus.md`.

## Task 1.6: terminal removal

Spec § 1.4, item 4 additionally changes `unit/errand/terminal-occupancy.test.ts` and adds
`unit/errand/terminal-occupancy-removal.test.ts`, under `packages/arc-framework/__tests__/`. Existing real-CLI scenarios
cover spawned close (`errand.e2e.test.ts`), abandon (`errand-abandon.e2e.test.ts`), and paused leave
(`errand-open-base-freshness.e2e.test.ts`), plus partial close and abandon retaining primary occupancy's status check.
No golden fixtures change. Partial settlement remains primary-only before the flip; its optional projection slots
follow the same runtime contract without introducing a spawned partial allocation.

## Task 1.7: cleanup commands and missing registrations

Spec § 1.4, item 2 changes `unit/session-init/branch-gone-cascade.test.ts`,
`unit/session-init/branch-gone-recovery.test.ts`, `unit/session-init/recommended-action-recovery.test.ts`,
`unit/session-init/removal-observations.test.ts`, `unit/status/schema.test.ts`, and `unit/status/run.test.ts`, and adds
`unit/session-init/missing-worktree-folders.test.ts`. The integration status fixtures in `integration/status.test.ts`
also supply the new empty missing-folder list and assert the housekeep action introduced by item 1. Paths are under `packages/arc-framework/__tests__/`.

The five session-init goldens (`session-init-active-resume.json`, `session-init-branch-gone.json`,
`session-init-current-husk.json`, `session-init-identity-missing.json`, and `session-init-orient.json`) gain only
`sweep.value.missingFolders: []`. Recovery's removable candidate carries the work-unit name read from its marker; a
marker without a work-unit name grants no teardown offer. Missing registrations keep their branches out of both
candidate tiers, and a foreign lock's unlock stays its owner's text-only decision.

## Task 1.8: deferred rename moves

Spec § 1.4, item 3 changes `unit/session-init/lifecycle-residue-sweep.test.ts`,
`unit/session-init/stale-worktree-sweep.test.ts`, and `unit/status/session-envelope-schema.test.ts`, under
`packages/arc-framework/__tests__/`. Branched and detached validated moves share the doubled-force argv and executable
action; displayed paths use literal shell quoting. No golden fixtures change.

## Task 1.9: seed state version and projected paths

Spec § 1.4, item 5 changes `unit/compaction-seed/emitter.test.ts`, `unit/compaction-seed/schema.test.ts`,
`unit/recover/audit.test.ts`, `unit/recover/report.test.ts`, and `unit/handlers/recover-envelope-boundary.test.ts`; it adds
`unit/lib/store/lifecycle-paths.test.ts`, under `packages/arc-framework/__tests__/`. The recovery goldens
`recovery-audit-ready.json` and `recovery-audit-dirty-path-drift.json` gain only seed schema 2 and the state version,
which equals the code head on the in-repo backend. Envelope selection remains a read-only projection: meta paths are
recognized through the layout inverse and reprojected through the store's shared path provider.

## Task 1.10: dormant command registrations

Spec § 1.4, item 6 adds `unit/store-command-registration.test.ts` and `e2e/store-command-dormancy.e2e.test.ts`;
changes `unit/command-input/registry.test.ts`, `unit/lib/cli-help-coverage.test.ts`, and
`unit/no-input-invocations.test.ts`; and extends `fixtures/command-input/no-input-matrix.ts` and
`helpers/cli-transport.ts`. Paths are under `packages/arc-framework/__tests__/`. No session-envelope golden changes
are required. Both in-repo and reference stores refuse each dormant arm before reading any request or stdin bytes.

## Task 1.11: dormant settings

Spec § 1.4, item 8 adds `unit/config/inbound-pause-settings.test.ts` and changes the config inventory, schema, and
status-reader tests. Full-settings fixtures change in `unit/config-format.test.ts`, `unit/status-format.test.ts`,
`unit/status/run.test.ts`, `unit/handlers/release/commit.test.ts`, `unit/handlers/release/push.test.ts`,
`unit/release/interlock-validation.test.ts`, and `integration/release-push-upstream-init.test.ts`, all under
`packages/arc-framework/__tests__/`. The inventory admits only these three runtime-only catalog keys; the packaged
configuration template and session-init's key set keep their current contents. No envelope golden changes are required.

## Task 1.12: dormant marker and origin admissions

Spec § 1.4, item 7 changes `unit/git/worktree-marker.test.ts`, `unit/git/worktree-cleanup.test.ts`,
`unit/locus/occupancy-marker.test.ts`, `unit/locus/derived-roster.test.ts`, `unit/locus/provisioning.test.ts`,
`unit/session-init/lifecycle-residue-sweep.test.ts`, `unit/errand/partial-settle-runtime.test.ts`,
`unit/errand-identity-record.test.ts`, and `unit/errand-identity-transitions.test.ts`; it adds
`unit/locus/marker-origin-evidence.test.ts` and `unit/locus/origin-binding.test.ts`, all under
`packages/arc-framework/__tests__/`. No envelope goldens change: existing producers keep their old forms.

Behavioral reconstruction logs retain the removal, residue, derived-evidence, origin validation and exclusivity,
projection, provisioning, and partial-settlement red cases under `/tmp/arc-task1.12-*-red.log`. The origin round-trip
uses the public marker writer and reader; settlement verifies the capture consumption and actual marker removal.

## A16: exposing former names to the prose scan

The superseded premise in `spec-seam-locus.md` § 3.5 was:

> the scan takes its former slugs from the work items' aliases, listed through the store

`lookupReference` resolves a supplied former slug, but cannot enumerate names a prose scan has not discovered.
`StoreRecordSchema` admits no alias projection, and `publicRecord`, used by both `readReference` and `listReference`,
drops `MemoryRecord.formerSlugs`. The aliases already persist and participate in lookup; the missing read-only
projection is the bounded correction. Explicit empty arrays distinguish a complete observation from an absent
projection; selected snapshots preserve historical alias evidence. The in-repo reader remains unchanged.

The amendment's grounding and task audit cover the schema, private reference model, projection, lookup, and reconcile
consumer. No alias mutation operation, content field, or new identity mechanism is introduced.

## A17: destructive verification before the backend flip

`createStore` selects `createInRepoBackend` and advertises `stateOffBranch: false`; the reference backend is test-only.
The new off-branch destructive arms cannot succeed through the production executable yet. The approved verification
split retains successful handler integration with CLI-generated inputs and real Git now, and actual built-CLI refusal
scenarios now, with successful real-CLI destructive scenarios required at the flip. No handler result claims to be a
successful CLI run. The task's evidence inventory records those future release checks explicitly.

The grounding footprint is `createStore`, `ReferenceBackend.capabilities`, the dormant handlers, and the real-CLI
refusal suite. Existing reference-backend success and continuation criteria remain intact; no completed verifier changes.

## A18: the real rename-move assertion

The Phase 1 scenario run left one failing whole-row assertion in `e2e/session-init.e2e.test.ts`: it expected the plain
move and omitted the typed action. The observed result from `projectRenameMoveRemedy` has the doubled force, executable
quoted text, and matching action that § 1.4's items 1 and 3 already require. The specification holds; Task 1.R corrects
its test derivation and adds this file to both items' completion inventory. No production behavior or golden changes.
The initial failure is retained in `/tmp/arc-phase1-segment-scenarios.log`; Task 1.13 stays open for its rerun.

## Phase 1: comparison against merged base

Fresh base is `c45c3e908`; the append-only merge was already up to date, and the lockfile was unchanged. Both built
executables ran `status --session-init --json`, `locus --json`, `active roster --json`, and `active in-flight --json`
on the five envelope fixtures: orient, active resume, current husk, branch gone, and missing identity. Normalized raw
captures are `/tmp/arc-phase1-differential.json`; the invocation report is `/tmp/arc-phase1-differential-rerun.log`.
All changed paths are folder presence or missing-folder lists (item 2), or slot actions and dormant empty slots
(item 1). The branch-gone fixture exercises the reachable in-flight result; the others retain their unchanged typed
unreachable result. No output difference falls outside the declared items.

The original session-init and envelope scenarios, plus the surrounding locus, Errand, and personal-surface real-CLI
suites, pass in `/tmp/arc-phase1-segment-e2e-rerun.log`. The corresponding broad unit surfaces pass in
`/tmp/arc-phase1-unit-surfaces.log`. The suppression comparison, retained as
`/tmp/arc-phase1-suppression-comparison.json`, has no added or increased entry. A18's original failed assertion remains
separate evidence and closes on the corrected scenario, rather than being counted as a passing verifier run.

## A19: the complete lazy-handler inventory

The segment quality request found that `cli-loading-boundary.test.ts`'s complete implementation-module inventory
omitted `errand-queue`, `locus-release`, `inbox`, `route`, and `handoff-write`, which `cli.ts` loads dynamically.
Both affected assertions share that one inventory. Adding those modules retains the existing import-time registration
check over every handler. The changed test belongs to § 1.4, item 6; no runtime behavior changes. The original gate
failure remains in `/tmp/arc-phase1-segment-check.log`, including its separate Markdown underwrap finding.

## A20: authoritative empty claims

The superseded § 3.2 statement was “still require both complete.” `listReference` returns `absent` when no selected
claim records exist, and `acquireStoreClaims` preserves that outcome. A normal Errand therefore has a complete project
Errands acquisition beside absent claims. Treating that absence as incomplete would prevent its terminal operation
without an unrelated claim being created. The registered-CLI full-terminal scenario exposed the missing acquisition
binding; tracing the effective gate exposed this additional admission conflict.

The approved bounded rule admits authoritative claims absence as empty, while a failed read and claims diagnostics
remain refusals. Errands still need a complete acquisition and the exact subject lookup. The public frame keeps the
absence visible; no synthetic claim or fabricated complete snapshot grants authority. Task 3.R2 covers both terminal
and merge gates, their repaired continuations, and real-Git handler closure. No Store contract or production backend
capability changes.

## A21: the user-reference prose boundary

The superseded § 4.1 statement was “the same batch writes the meta through the meta kind's writer at its expected
version beside the personal records.” `planUserReferenceReconcile` mechanically rewrites only inbox `WU_Target`
fields; its working-memory and session-notes paths call `scanProse` and produce advisories. It neither calls the
artifact code-span planner nor prepares a session-context edit. Automatic artifact-span rewriting in personal prose
would therefore add a new grammar rather than preserve this boundary.

The approved correction keeps prose advisory, including the meta's session context from the flip, and batches only
existing managed inbox rewrites. Every supporting record is still version-revalidated before application; an unchanged
record needs no put merely to carry that guard. Task 5.R records this correction to Task 5.1.c's meta-write premise.

## A23: the complete locus consumer inventory

`referencesUnder` in `locus-dormant-foundation-contract.test.ts` scans static and dynamic imports of seven derived
modules, including type-only references. Its exact incoming lists predate the Store adapters. `readStoreIdentityEvidence`
uses the existing checkout evidence type; the new session, overlap, unclosed-set, roster, marker, and cleanup adapters
use the derived frame, row, and lifecycle types. The reference scan reports fourteen added production importers and six
added test importers, with none removed. Each is within § 1.2's reroute; no dynamic activation or forbidden authority
import was found. The specification holds, and the correction updates only the complete test inventory. The original
failed segment result remains in `/tmp/arc-segment-2-10-scenarios.log`.

## Final ratchet inventory

Comparison base is `5e83105f2923991480756a8a60f5ec9d1534a170`. The three architecture rules have no per-file increase:
raw-state imports are 186 → 180, surface names 172 → 150, and work-unit paths 57 → 57. Whole-project lint and
suppression pruning retain only the existing baseline; no new suppression was added.

The table covers each retained entry in the rerouted or explicitly shared files and the drained files. Counts are base →
final for the entire file; Raw means `arc/store-raw-state`, Names `arc/surface-names`, and Paths `arc/work-unit-paths`.
Paths are relative to `packages/arc-framework/`.

F identifies a capability-false arm held by § 1.5; P identifies a producer contract that keeps legacy parser inputs out
of the Store path. C marks unchanged code-proof utilities; D delivery/review projectors; S shared status/view ownership;
T transition-write-path ownership; N unchanged notes/setup parts. Those shared parts lie outside the narrowed reroute in
§ 1.2; their continued calls are not described as false-only.

| File                                                  | Raw | Names | Paths | Exact legacy arm or shared ownership and capability dataflow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | --: | ----: | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/handlers/active.ts`                              | 1→1 |   0→0 |   0→0 | F — §1.5 in-flight derivation / parked set: capability-false branch alone calls legacy listParkedSlugs; Store arm derives in-flight records.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/handlers/errand.ts`                              | 3→2 |   2→2 |   0→0 | F + guaranteed Store refusal discriminator — Two raw imports remain: inspectInboxEntry for legacy title adoption (prepareHandlerErrandAdoption only invokes callback when false), and buildLifecycleIndex below Store-overlap return. Two names: legacy live-adoption error; buildErrandNextResult fallback remedy. Store startup queue refusal always supplies resolution.remedy from offer.refusal.remedy.text, so fallback is selected only by legacy refusal production. Direct exported projector has no capability precondition; do not label the whole function false-only.                                                          |
| `src/handlers/status/lifecycle.ts`                    | 1→1 |   1→1 |   0→0 | F — §1.5 composed lifecycle-index status path/read/warnings: usesOffBranchState selects Store handler before legacy index and meta-name boundary enrichment. Store integrationBoundary null remains explicit §16 delivery coordination.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/lib/errand/open-runtime.ts`                      | 1→1 |   0→0 |   0→0 | F — §1.5 identity transaction: Store runtime performs rollback through Store transforms; legacy rollbackResume transaction is false ternary and rollbackIdentityClaim is below Store return.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/lib/errand/promote-runtime.ts`                   | 2→2 |   0→0 |   2→2 | F — §1.5 promotion runtime settlement / branch rename / commit and identity transaction: capability true returns promoteStoreErrandAtRuntime before legacy callbacks, meta renderer, recovery, and the two active-dir/meta path projections.                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/lib/errand/identity-claims.ts`                   | 2→2 |   0→0 |   0→0 | F + C — One raw import is legacy identity transaction for claim rollback; ordinary Store open returns before rollbackIdentityClaim. Other raw import is uniqueRefToken only: unchanged code-preservation pinRemoteBaseHead temporary ref, shared across both backends; no raw record/ref/file read by token utility.                                                                                                                                                                                                                                                                                                                        |
| `src/lib/errand/identity-transitions.ts`              | 1→1 |   0→0 |   0→0 | C — Only uniqueRefToken import; provePauseHead code-preservation temporary ref runs on both backends. Scope §1.2 reroutes state transition/origin parts, not this unchanged Git proof primitive. Not a false-only state reader.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/lib/errand/record.ts`                            | 3→3 |   0→0 |   0→0 | F for rerouted callers; shared consumers — §1.5 one-snapshot Errands/claims projection. Migrated active/in-flight entry points return Store derivation before legacy snapshot helpers. Other delivery/status/review-gate callers are shared with those owners; this is not a universal false-only module assertion.                                                                                                                                                                                                                                                                                                                         |
| `src/lib/git/in-flight-derivation.ts`                 | 1→1 |   1→1 |   0→0 | F for rerouted callers — §1.5 in-flight derivation at branch refs. Migrated active/in-flight selects deriveStoreInFlight before the legacy raw meta/name classifier. Shared direct view/status consumers retain their explicit status-member scope.                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/lib/session-init/in-flight-work-unit-sweep.ts`   | 0→0 |   1→1 |   0→0 | P — §1.5 roster branch/meta gates: consumer uses entry.workUnit first; meta-filename fallback is legacy rows only. Store roster producer supplies workUnit; pure consumer has no local capability check.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/lib/session-init/lifecycle-residue-sweep.ts`     | 1→1 |   0→0 |   0→0 | F — §1.5 shipped-work archive index: capability true returns runStoreRetirementSweep before readRefTip legacy proof.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/lib/session-init/orphan-branch-sweep.ts`         | 1→1 |   0→0 |   0→0 | F — §1.5 shipped-work archive index: sync snapshot and async sweep both choose Store lookup first on capability true; legacy archive-index calls remain false-side.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/lib/session-init/retired-subdir-detection.ts`    | 2→2 |   0→0 |   0→0 | F — §1.5 shipped-work archive index: both legacy discovery entry points return empty before reads on true; separate Store-aware reconciliation provides authority.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/lib/session-init/stale-worktree-sweep.ts`        | 1→1 |   0→0 |   0→0 | F — §1.5 shipped-work archive index: archive evidence reads are false-side ternaries; true uses Store placement/lineage selector.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/scripts/check-foreign-writes.ts`                 | 2→2 |   1→1 |   0→0 | F — §1.5 pre-commit foreign-write hook whole body: command returns before hook body on true; injectable overlap composition likewise returns empty.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/lib/git/foreign-artifact-detection.ts`           | 0→0 |   0→0 |   1→1 | F legacy path slice — §1.5 overlap self-exclusion by checkout / originating meta path: includeWorkItem true supplies typed workItem without metaFilePath. Only legacy includeWorkItem false projects the active meta path. Root correction preserved this distinction.                                                                                                                                                                                                                                                                                                                                                                      |
| `src/lib/git/worktree-roster.ts`                      | 1→1 |   2→2 |   0→0 | F — §1.5 checkout-active-meta and roster branch/meta gates: runWorktreeRoster returns runStoreRoster on true before parser, readCandidate active filename, and listMetaFiles meta prefix.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/lib/locus/derived-evidence.ts`                   | 3→3 |   3→3 |   0→0 | F — §1.5 checkout-active-meta, direct one-snapshot identity read, and shipped-work archive index: true acquires Store identities/completed evidence and returns readStoreCheckout before legacy meta/archive callbacks; legacy identity snapshot replaced by absent snapshot. Store checkout produces empty metaRoots/metas, no archived file evidence.                                                                                                                                                                                                                                                                                     |
| `src/lib/locus/derived-lifecycle-evidence.ts`         | 1→1 |   2→2 |   0→0 | P — §1.5 checkout-active-meta projector. Store producer supplies empty legacy candidate/root/archived arrays; Store work-unit evidence travels separately. Pure projector can be called in true mode but reaches no legacy parser/name site with those empty inputs; no intrinsic false guard.                                                                                                                                                                                                                                                                                                                                              |
| `src/lib/locus/subject-meta.ts`                       | 2→2 |   2→2 |   0→0 | F acquisition + D projection — §1.5 checkout-active-meta: workUnit evidence chooses Store record/path rather than legacy meta literals/parser. A22 at3a684b671: offbranch candidateStore selects readStoreSubjectCandidate; resolveCandidateRecordRelativePath and checkout read are now else-only false arm. Candidate parse/effective-target/durable-baseline/review/submission/integration projectors remain delivery/review-owned §16 machinery; their continued invocation is not labeled false-only. Two raw import floors remain meta-reader and candidate-record-store resolver; Store acquisition helper is under Store ownership. |
| `src/lib/session-init/cohort-doc.ts`                  | 1→1 |   0→0 |   1→1 | F frame acquisition + S view consumer — §1.5 frame cohort read: subject-meta chooses readStoreCohortDoc when present Store evidence exists; legacy resolver parser/planned path otherwise. The separate arc view cohort consumer belongs to status member under §1.2/§16 and is not universally false-only.                                                                                                                                                                                                                                                                                                                                 |
| `src/handlers/candidate-mutation-owner.ts`            | 1→1 |   0→0 |   0→0 | F — §1.5 Candidate owner's shipped-work completed set: true returns Store completed evidence before working-tree buildLifecycleIndex.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/handlers/status.ts`                              | 2→2 |   1→1 |   0→0 | F — §1.5 current-WU inline reconcile bindings, transition-record lineage, legacy in-flight/parked set and notes recommendations. operational exists only for offbranch selected Store; slots return operational providers before legacy inline callbacks/USER-INBOX display. Lazy legacy oracle is called only after operational returns, not when callbacks are constructed.                                                                                                                                                                                                                                                               |
| `src/lib/work-unit/executor-context-current-wu.ts`    | 2→2 |   0→0 |   0→0 | F — §1.5 inline current-WU lifecycle-index and transition callbacks: true returns buildStoreCurrentWuReconcile before constructing old bindings; executor supplies selected Store.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/lib/work-unit/executor-context.ts`               | 2→2 |   0→0 |   1→1 | F locus slice + T writes — Occupancy parser callback bypassed by Store-backed makeWorktreeOccupancyGuard; withdrawalBranch true reads Store qualified link before layout call/meta parse. Mixed meta-reader import also carries setters/reconcilers for unchanged transition-write-path member callbacks (§1.2/§1.3); those imported values are not claimed false-only. This member owns locus-port binding only.                                                                                                                                                                                                                           |
| `src/lib/work-unit/lifecycle-guards.ts`               | 0→0 |   1→1 |   0→0 | F — §1.5 checkout-active-meta occupancy: selected Store returns readStoreOccupancy before legacy candidateSlug regex/loop; executor always supplies selected Store.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/lib/session-init/partial-push-marker-surface.ts` | 1→1 |   0→0 |   0→0 | F in session binder; N other notes consumers — §1.5 session notes recommendations/loads: offbranch session-init supplies empty legacy marker result instead of calling old notes-ref reader. Low-level helper has no capability input; unchanged notes consumers are outside rerouted binding.                                                                                                                                                                                                                                                                                                                                              |
| `src/commands/user/inbox-mutation.ts`                 | 1→1 |   5→4 |   0→0 | F production callers — §1.5 title-keyed personal reads/writes and execute-bound marks: true CLI removal handled by stable-ID Store handler; marking refuses true; abandon unmark callbacks return on true; promotion Store runtime bypasses legacy mutation callback. Helper reads personal bytes through Store on both backends, but exported title-transform helpers do not enforce false capability themselves. Four names are legacy mutation/remove/mark/unmark errors.                                                                                                                                                                |
| `src/handlers/user.ts`                                | 1→1 |   8→4 |   0→0 | F — §1.5 transition-record lineage and title/execute marks: true reconcile returns Store preparation before enumerateGitTransitionRecords; true removal handled before three legacy title-result names; true mark refuses before parsing/mutation/fourth diagnostic.                                                                                                                                                                                                                                                                                                                                                                        |
| `src/lib/session-init/inbox-state.ts`                 | 1→1 |   0→0 |   0→0 | P — §1.5 execute-bound marks: Store session producer always supplies queuedEntryIds (including empty), selecting queue parser return before hasExecuteBoundDisposition legacy transform.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/lib/user-sync/execution-offer.ts`                | 1→1 |   0→0 |   0→0 | F production callers — §1.5 title/execute queue: production Errand startup and after-close return Store queue offer first on true, before listExecuteBoundInboxEntries legacy readers.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/lib/setup.ts`                                    | 0→0 |   4→4 |   0→0 | F seed slice + N driver setup — §1.5 unconditional identity seed: prepared identity non-null on true seeds absent Store records then returns before USER-INBOX.md legacy loop. Other three names are unchanged ROADMAP merge-driver attributes/remedy/hook setup outside §1.2's narrowed personal-seeding slice; no false guard claimed for those.                                                                                                                                                                                                                                                                                          |
| `src/lib/user-sync/parser.ts`                         | 0→0 |   2→2 |   0→0 | N notes compatibility — Two names are legacy file-shape mapping and USER-INBOX section parse label. Retained user-surfaces migration/resolver is §1.5, while unchanged notes merge/projection/materialized-baseline also call it without capability guard. Notes-sync is explicit Non-Goal; migrated entry grammar uses Store kind parsers. Not universally false-only.                                                                                                                                                                                                                                                                     |
| `src/lib/user-sync/inbox-writer.ts`                   | 0→0 |  19→8 |   0→0 | F title/marks; dormant legacy APIs — Eight remaining names: execute-bound empty/duplicate/outside-section/omitted-order; duplicate mutation title; mutation source digest; no-live-title; removed-title digest. Actual routed callers are false-held as inbox-mutation row. Last two exported legacy APIs have no current production caller found, so no intrinsic false-only claim. Postflip old partial-origin digest is Store-owned compatibility, not one of these remaining names.                                                                                                                                                     |
| `src/lib/user-reference-reconcile.ts`                 | 0→0 |   1→0 |   0→0 | drained — Legacy literal floor removed; selected-Store legacy replanning and operational authority/scratch helpers introduce no remaining floor here.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/handlers/status/views.ts`                        | 1→1 |   0→0 |   0→0 | S — Explicit later status member (§1.2/§16): direct readiness/view lifecycle-index assembly still executes on both backends. Outside rerouted session/locus slice, not false-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/lib/work-unit/executor-context-status.ts`        | 1→1 |   0→0 |   0→0 | S — Explicit later status member (§1.2/§16): STATUS.USER direct view/index side-effect module; separate from this member's executor locus-port binding. Not false-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/handlers/view.ts`                                | 2→2 |   0→0 |   0→0 | S — Shared unchanged general viewer and explicit-target/cohort composition owned by status member. Session-context path slice now uses Store; remaining general view raw helpers are not false-only.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/lib/view/started-artifacts.ts`                   | 1→1 |   0→0 |   0→0 | S — Shared unchanged general viewer meta parser, explicit status/view ownership (§1.2/§16), not a false-only session-context helper.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/lib/view-artifact.ts`                            | 0→0 |   2→2 |   2→2 | S general artifacts; F session-notes branch — Two names/two path calls belong unchanged general artifact/inbox viewer. Changed session-notes resolution takes Store session-context resolver before general artifact path calls. Ambient Store artifact rendering still uses shared viewer; no whole-module false claim.                                                                                                                                                                                                                                                                                                                    |
| `src/lib/release/interlock-validation.ts`             | 0→0 |   1→1 |   0→0 | shared authorization formatter — Existing default active-root refusal name is outside §1.2's narrowed resolveActiveWu and resolveOriginatingMetaPath bodies. Migrated resolver provides its own ambiguity hint; not a new Store authority and not universally false-only.                                                                                                                                                                                                                                                                                                                                                                   |
| `src/lib/errand/abandon-runtime.ts`                   | 1→0 |   0→0 |   0→0 | drained — Old raw transaction import removed; Store/runtime split owns writes behind contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/lib/errand/close-runtime.ts`                     | 1→0 |   0→0 |   0→0 | drained — Old raw transaction import removed; Store/runtime split owns writes behind contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/lib/errand/leave-runtime.ts`                     | 1→0 |   0→0 |   0→0 | drained — Old raw transaction import removed; Store/runtime split owns writes behind contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/lib/errand/link-runtime.ts`                      | 1→0 |   0→0 |   0→0 | drained — Old raw transaction import removed; Store/runtime split owns writes behind contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/lib/release/wu-resolution.ts`                    | 1→0 |   1→0 |   0→0 | drained — Narrowed originating/current-WU resolution now uses contract authority; old raw/name floors removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/lib/recover/audit.ts`                            | 0→0 |   2→0 |   0→0 | drained — Recovery rederives Store basis; old surface-name floors removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/handlers/status/session-context.ts`              | 0→0 |   1→0 |   0→0 | drained — Store session-context path projection replaced legacy surface literal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/lib/compaction-seed/emitter.ts`                  | 0→0 |   1→0 |   0→0 | drained — Canonical Store-derived load-set forwarded; legacy name floor removed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

A22 closes the Candidate acquisition omission: `subject-meta.ts` reads `review/candidate` through the selected Store
using the resolved primary owner, including its UID. Only the capability-false arm reads the checkout Candidate. Missing
authority, malformed bytes, and conflicts remain unresolved with a repair. Existing Candidate parsing, effective-target,
submission-boundary, and delivery/review projectors keep their owners under § 16.

## Session and recovery segment comparison

The fresh base remains `5e83105f2923991480756a8a60f5ec9d1534a170`. Its package source, templates, tests, and build
inputs are unchanged from the comparison executable at `c45c3e908`; the intervening base diff contains five
planning/roadmap documents. Both built executables ran the same five temporary compatibility repositories through
session-init, locus, roster, and in-flight inspection. All twenty comparisons preserve exit status. Differences are
limited to folder presence, missing-folder lists, typed recovery actions, and dormant paused-work/inbound slots, all
declared by § 1.4. No additional wire difference was found.

Raw normalized captures and the complete path classification are `/tmp/arc-final-envelope-differential.json` and
`/tmp/arc-final-envelope-classification.json`. The session/recovery process scenarios also cover completed subjects
across archive cadences, saved-state baselines, named-history repair, prepared personal references, and recovery stop
conditions. Their current result is `/tmp/arc-segment-5-11-process-scenarios.log`; the shared unit scenarios are
`/tmp/arc-remaining-segment-units.log`.

---
