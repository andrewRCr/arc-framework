# Notes: seam-locus

## Contents

- [Consumer-map re-verification](#consumer-map-re-verification)
- [Where the reroute happens](#where-the-reroute-happens)
- [Row corrections: locus and session-init](#row-corrections-locus-and-session-init)
- [Row corrections: user sync](#row-corrections-user-sync)
- [Row corrections: in-flight derivation](#row-corrections-in-flight-derivation)
- [Consumers with no row](#consumers-with-no-row)
- [Key 55: foreign-artifact detection](#key-55-foreign-artifact-detection)

## Consumer-map re-verification

The rows this member inherits from `notes-storage-contract.md` § Consumer map, re-verified 2026-10-12 at `327d4178a`
against the sweep at `b050528c5`. Paths are under `packages/arc-framework/src/` unless they start with `.arc/`.

- **Method.** Three read-only passes, one over the locus and session-init partition, one over the user-sync seam rows
  and the six in-flight rows the cohort moved here, and one deriving key 55's rows, each citing a symbol for every
  claim. The author re-read at source every claim the draft builds on and a sample of the rest: the session-init
  binding and its duplicated reconcile reads, the overlap roster's Errand skip, `handleErrandCheck`'s reads, the
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
- **`currentWuReconcile`'s reads are bound twice.** `handleSessionInitStatus` binds the lifecycle index, transition
  queries, and artifact reads inline beside the same reads `buildCurrentWuReconcile` binds
  (`lib/work-unit/executor-context-current-wu.ts`); both run `prepareCurrentWuReconcile`
  (`lib/work-unit/side-effects/discharge-dep-edges.ts`). One store-backed binding replaces both.

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
| `lib/git/worktree-scaffold.ts`                           | `scaffoldIntoWorktree` calls `runUserOpen`; editor documents are written in `lib/locus/provisioning-runtime.ts`                                                                                                                                                                                                                                                                                                                              |
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

| Row                                                     | Correction                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.arc/system/workflows/arc/supplemental/drain-inbox.md` | `notes-*` is no longer a write target; it reads held entries in backlog drafts (`wu.inbound`) and runs `arc errand check --target`: add key 55                                                                                              |
| `.arc/system/.internal/skills/arc-inbox/SKILL.md`       | Gained a route-now step (`route-discovered-work`); it still writes only the personal `USER-INBOX`                                                                                                                                           |
| `commands/user/add.ts`                                  | `runUserAdd` touches only `WORKING-MEMORY` and `USER-INBOX` (`personal`); the identity-in-use warning needs `read` and `list`                                                                                                               |
| `lib/user-sync/current-wu.ts`                           | Every caller but `handleUserReconcileReferences` is a cutover row, while `storage-cutover`'s deletion keeps `resolveCurrentWuName`; the store's `resolveCurrentWorkUnit` (`lib/store/current-work-unit.ts`) exists. Settle its fate at spec |
| `lib/user-sync/execution-offer.ts`                      | Pure over supplied inbox bytes: operations `read`                                                                                                                                                                                           |
| `lib/user-sync/notes-lock.ts`                           | `getNotesLockPath` is also the in-repo store's notes lock port (`lib/store/default-ports.ts`), so retiring it moves the port                                                                                                                |
| `lib/user-sync/retired-subdir.ts`                       | Its shipped set reads the `origin/<base>` `completed/` tree: `placement`, not `lineage`                                                                                                                                                     |

## Row corrections: in-flight derivation

| Row                                   | Correction                                                                                                                                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/git/in-flight-derivation.ts`     | Two entry points: `analyzeInFlightSnapshot` over supplied evidence and `deriveInFlight`, which still acquires refs; both read metas at refs. Callers supply the Errand facts, so add `errand.record`             |
| `lib/work-unit/transition-overlay.ts` | Pure typed tokens with no I/O, imported by no in-flight module; its consumers are project-record composition and transition writers, so it reads as a lifecycle row. Raise with `seam-lifecycle` at spec         |
| `commands/active/in-flight.ts`        | Three entry points: `runActiveInFlightExpansion` (the handler's default), `expandActiveInFlight`, and `runActiveInFlight`, which serves `--local`, `arc errand check`, and `check-foreign-writes.ts`: add key 55 |
| `handlers/active.ts`                  | `handleActiveInFlight` builds the parked set from the lifecycle index as a deciding input, so `projection` understates its reads                                                                                 |
| `in-flight-scope-check.md`            | Its symbols were wrong at the sweep: the default path is `runActiveInFlightExpansion` → `analyzeInFlightSnapshot`. `activate-work-unit.md` runs the same oracle, and its row lacks key 29                        |

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
- `.arc/system/methods/route-discovered-work.md` — writes captures, mints stubs, and folds concerns; `run-errand.md`
  and the lifecycle workflows fire it.

Found in passing, other partitions': `lib/locus/provisioning-runtime.ts` and `lib/schema-command/editor-documents.ts`
(projection); `handlers/status/views.ts`, `lib/work-unit/executor-context-status.ts`, `lib/view/started-artifacts.ts`,
and `lib/status/work-unit-purpose.ts` (status); `lib/work-unit/executor-context-current-wu.ts`,
`lib/work-unit/teardown-lifecycle-projection.ts`, `handlers/lifecycle-shared.ts`, and
`handlers/lifecycle-delivery-review.ts` (lifecycle). Modules that only transform evidence passed to them — the rest of
`lib/locus/`, `lib/session-init/`, and `lib/errand/`, `derived-reader.ts` and `derived-roster.ts` among them — need no
row.

## Key 55: foreign-artifact detection

**Today.** `handleErrandCheck` (`handlers/errand.ts`) builds the parked set from the working tree's lifecycle index,
runs `runActiveInFlight` (→ `deriveInFlight`, which lists and shows `.arc/active/meta-*` at each eligible ref), and
projects the result with `projectInFlightToOverlapRoster`, which keeps work units only. `detectForeignArtifactOverlap`
drops shipped, parked, marked, and self entries — self by name, worktree, or `resolveOriginatingMetaPath` — and for each
remaining entry runs a committed probe (`git diff <origin/base>...<sha> --name-only -- <targets>`) and, for a
checked-out entry, an uncommitted probe (`git status --porcelain -- <targets>`) bracketed by `HEAD` and `MERGE_HEAD`
checks, which report `indeterminate` on a merge in progress or a moved head (`1ed18416c`, `4fdbbe8ec`, `8db141413`).
Targets are prefix-matched paths with no special handling for `.arc/`. The other caller, `check-foreign-writes.ts`,
narrows targets to the work-unit surface (`classifyPathSurface`), so it compares state targets only.

**The skipped Errands.** The roster drops Errands by design since `c0a0e815b` ("no meta, not WU-overlap candidates"),
pinned by a unit test, though neither probe needs a meta; the pre-flip fix is a captured Errand (`USER-INBOX § Errand`,
"Let `arc errand check` see in-flight Errands as overlap candidates", 2026-10-12).

**Rows.** New or amended, `?` marking a guess:

| Consumer                                           | Owner   | Register     | Families                                               | Becomes                                                                                                                                                                                                                 |
| -------------------------------------------------- | ------- | ------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/git/foreign-artifact-detection.ts` (new)      | seam    | 13, 29, 55   | `wu.meta`, `placement`, `machine-local`; state targets | Targets split through the layout resolver: code targets keep both probes; state targets compare against the in-flight work items' writes through the store (`changes`?, `pending`?), Errands included; self by identity |
| `handlers/errand.ts` (amend)                       | seam    | + 29, 47, 55 | + `wu.meta`, `placement`, `machine-local`              | The in-flight set from the store's `list`, the parked set from stored placement, self from the checkout marker                                                                                                          |
| `commands/active/in-flight.ts` (amend)             | seam    | + 55         | + `machine-local`                                      | `runActiveInFlight` stays the oracle for the check and the hook                                                                                                                                                         |
| `lib/git/in-flight-derivation.ts` (amend)          | seam    | + 55         | + `errand.record`                                      | —                                                                                                                                                                                                                       |
| `lib/release/wu-resolution.ts` (amend)             | seam    | + 55         | —                                                      | `resolveOriginatingMetaPath` stops being the self-exclusion key                                                                                                                                                         |
| `scripts/check-foreign-writes.ts` (amend)          | cutover | + 55         | `wu.meta`, `wu.tasks`, `wu.prose`, `placement`         | Retires with the pre-commit foreign-write advisory, unless the store query serves it at write time (?)                                                                                                                  |
| `drain-inbox.md`, `run-errand.md` (amend)          | seam    | + 55         | —                                                      | The drain's targets are mostly state targets, so the store query becomes its main path                                                                                                                                  |
| `.arc/system/methods/assess-parallel-fit.md` (new) | seam    | 55           | —                                                      | Consumes the check's facts; unchanged unless state-target facts change the envelope (?)                                                                                                                                 |

---
