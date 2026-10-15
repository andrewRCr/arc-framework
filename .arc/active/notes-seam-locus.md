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

---
