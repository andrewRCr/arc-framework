# Spec (`detailed` · `RFC`): seam-locus

- **Origin:** [internal]

- **Purpose:** Derive locus and what is in flight from the checkout marker plus the store, route session-init's state
  reads and the personal surfaces through the storage contract, and own the entry grammar the inboxes, inbound lists,
  and Errand descriptions share.

---

## Introduction / Context

ARC's storage contract is shipped: one interface for every read and write of operational and planning state (`Store`,
`lib/store/contract.ts`), an in-repo implementation over today's substrates (`lib/store/in-repo/`), a kind registry
giving every record kind its mechanism and parser slot (`KIND_MECHANISMS`, `createKindRegistry`,
`lib/store/registry.ts`), and the pieces every caller shares: the current-work-unit resolver
(`resolveCurrentWorkUnit`, `lib/store/current-work-unit.ts`) and the lifecycle index. The meta, task list, design
documents, lineage record, and cohort document are registered with their parsers, field writers, and write checks
(`lib/store/kinds/`).

The code that decides where a session stands, what is in flight, and what a person has captured still reads beneath
that contract:

- **Locus** is derived from each checkout's ownership marker and then the active metas under that checkout's
  `.arc/active/` (`runDerivedLocusStateProbe`, `handlers/derived-locus-state-probe.ts`; `lib/locus/derived-evidence.ts`;
  `lib/locus/subject-meta.ts`), and the current work unit is resolved by reading the single meta there (`resolveActiveWu`,
  `lib/release/wu-resolution.ts`; `readActiveMetaCandidates`, `lib/active/meta-reader.ts`).
- **What is in flight** is read from branch refs: in-flight derivation lists and shows `.arc/active/meta-*` at each
  eligible ref (`deriveInFlight`, `lib/git/in-flight-derivation.ts`), and the overlap check diffs branches against base
  (`detectForeignArtifactOverlap`, `lib/git/foreign-artifact-detection.ts`).
- **Session-init** binds every state probe itself (`handleSessionInitStatus`, `handlers/status.ts`): the in-flight
  oracle, the roster and the sweeps, the inbox and nudge reads, and `currentWuReconcile`'s inputs, which it binds a second
  time beside the binding the reconcile's own command uses (`buildCurrentWuReconcile`,
  `lib/work-unit/executor-context-current-wu.ts`). It builds work-unit state paths by hand and reads the archive index.
- **The personal surfaces,** `USER-INBOX` and `WORKING-MEMORY`, parse through `lib/user-sync/parser.ts`, keyed on an
  entry's bold title, and sync as Git notes. A capture reaches a work unit by being held in its backlog draft's buffer
  section until its owner integrates it (hold-and-route), and an Errand's place in a person's queue is a mark on its
  inbox entry (`executeBoundMark`, `lib/user-sync/inbox-writer.ts`).

The import ratchet counts these reads (`store-raw-state`, `surface-names`, and `work-unit-paths`,
`eslint/architecture-imports.ts`) and records today's callers in `eslint-suppressions.json` as a floor that only
rerouting a caller drains. Until those callers go through the contract, a backend storing state off the checkout's
branch cannot replace the in-repo implementation. Several behaviors also cannot exist until state leaves the branch —
a planning checkout holding no branch, an inbox entry keyed by an ID that one write moves with a receipt, a queue of
Errands kept apart from the entries it names — so the code that carries them is built against the contract now and
switched on by its capability. This change does both for locus, in-flight derivation, session-init, and the personal
surfaces, and defines the grammar every entry list shares.

**Terms used throughout:**

- **Store, record, family, kind** — as `lib/store/` defines them: the contract (`Store`), one stored document (a file is
  its own record), a storage grouping, and a record type within a family (`KIND_SHAPES`, `KIND_MECHANISMS`).
- **In-repo implementation** — the backend over today's tracked files, personal files and notes, and transient-identity
  ref (`lib/store/in-repo/`). **Ref backend** — a planned backend storing state under `refs/arc/*`, not yet built.
  **Projection** — the planned gitignored working copy of stored state at the familiar `.arc/` paths, with `arc save`
  and automatic write-back to persist a person's edits; not yet built.
- **The flip** — the per-repository switch after which the store reports `capabilities.stateOffBranch` as true
  (`StoreCapabilitiesSchema`, `lib/store/read.ts`). Before it, the in-repo implementation serves every read and write.
  Code that behaves differently across the flip branches on that capability inside the CLI verb, never on a
  configuration value and never in workflow prose. The **deletion pass** later removes the arms that serve only before
  the flip.
- **Work item** — a work unit, whose primary record is its meta, or an Errand, whose primary record is its Errand
  record. **Placement** — a record's lifecycle location: active, backlog planned or provisional, or completed
  (`ReadPlacementSchema`, `lib/store/placement.ts`). A work unit is **in flight** while placed active.
- **Locus** — one registered checkout plus the ARC role derived for it: a work unit's, a transient role's (an Errand,
  a grooming set, a housekeeping sweep), or none. The **roster** is every registered checkout's derived row
  (`DerivedLocusFrame`, `lib/locus/derived-reader.ts`). The **primary** is the repository's main checkout; it is the
  **launchpad** — where new transient work may start — only while it holds no role, is clean, and is on the configured
  base.
- **Checkout marker** — the machine-local file `.arc/system/.internal/worktree-marker.json` naming the work item a
  checkout belongs to (`WorktreeMarker`, `lib/git/worktree-marker.ts`). A **spawned** checkout's marker carries
  `spawnedByArc: true`, for a checkout ARC created; an **anchored** checkout's carries `false`, for a checkout ARC claimed
  in place and did not create.
- **Entry list** — a record holding a sequence of entries, each a bold title with managed fields and prose: the
  personal inbox (`USER-INBOX`), the project inbox (`ATOMIC-INBOX`), `WORKING-MEMORY`, a work unit's **inbound list**
  of entries routed to it, an Errand's **description**, and a person's **Errand queue**. Entry lists merge by entry
  (`lib/store/concurrency/entries.ts`). A **managed field** is one the entry grammar parses (§ 6).
- **Routing** — moving an entry from one list to another, or inserting a new one, with a **routing receipt**: a
  write-once record of the move, kept beside an inbox and never shown in it (§ 7.3). A **survivor** is an entry edited
  while a routing removed it: the removal takes out only the version it observed, so the edit survives in place
  (`lib/store/concurrency/entries.ts`).
- **Slot** — one field of the session-init envelope (`arc status --session-init --json`), each a `Probe` failing alone.
- **Floor** — as § 11 defines it for the commits a work branch carries.

## Shared decisions

The storage seam's other plans cite this shared-decision number. It resolves to the sections below, which define it.

| Item | Decision             | Current sections |
| ---- | -------------------- | ---------------- |
| 9    | Entry managed fields | § 6, § 7         |

## Goals

1. **Locus from the marker and the store.** A checkout's role is derived from its marker plus stored lifecycle facts,
   and the current work unit through the contract's resolver; no locus reader lists `.arc/active/` or takes lifecycle
   from a branch ref (§ 2).
2. **What is in flight, through the store.** In-flight derivation, the overlap check, and the readers of shipped work
   read placement and lifecycle through the contract (§ 3).
3. **Session-init's state reads through the contract,** with one binding per slot, and every slot this change rebuilds
   carrying a registered schema and its recommended action as a typed, executable action wherever running it repairs
   the condition (§ 4).
4. **One grammar for every entry list,** entries keyed by `_Id:_`, read through one listing verb and moved by one
   routing verb that writes a receipt for every move into or out of an inbox (§ 6, § 7).
5. **The behaviors that need state off the branch are built now and switched on at the flip:** branchless planning's
   locus and the marker's exclusivity, routing straight into an inbound list, routing receipts and survivors, the
   Errand queue, removal by ID and version, the pause's reading, and the listing of commits not yet closed (§ 1.4).
6. **No observable change before the flip** but those § 1.4 lists.
7. **No ratchet floor grows,** and in this change's files every remaining floor entry sits in an arm that serves only
   before the flip (§ 1.5).

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This change does not:

- **change any workflow, skill, or method text,** or reshape session-init's prose conditionals. Workflows keep reading
  the envelope as they do; their text changes once, in the flip's rewrite, which is not this change's.
- **build the ref backend, its import, the projection, write-back, `arc save`, or the projection's worktree lock,** or
  perform the flip or the deletion pass. It fills none of the projection's slots (§ 16).
- **build the lifecycle verbs it calls** — the checkout removal function and its check, the pause and its verbs, the
  task close verb, the widened `arc materialize`, `arc handover`, branch links' created-or-adopted record and floor, the
  prepared-write protocol, or the cold start's seed handling (§ 16).
- **reroute the notes-sync machinery** — the `arc user` push, fetch, compaction, sync-status, save, load, and pull
  commands and their handlers — which the deletion pass removes with notes.
- **change `lib/work-unit/transition-overlay.ts`,** which reads and writes nothing; its composition consumers are the
  lifecycle executor's and status's.
- **change the review gate's own reads of the Errand index,** or its checkout binding beyond the derived-locus probe it
  already calls.
- **route handoff's base and notes sync to the primary checkout.**
- **let anyone but an owner reassign a work unit or Errand,** or let another person take over a stalled Errand.
- **change `lib/locus/primary-safety.ts`,** which decides only whether the primary may host a transient claim and
  removes no checkout.
- **make the overlap check gate anything;** it stays advisory.
- **build scheduled ref rotation, a service backend, or per-record authorization,** which the tripwires only name
  (§ 9.3).

## Proposed Design

§ 1 sets the boundary and what holds before the flip. § 2–3 derive locus and what is in flight; § 4–5 rebuild
session-init and add the release verb; § 6–7 define the entry grammar, the listing, and routing; § 8–12 cover the
Errand, handoff, identity setup, commits not yet closed, and checkout removal; § 13–15 list the actions, names, and
forward amendments; § 16 states the contracts this design relies on.

### 1. Boundary, scope, and order

#### 1.1 One work unit

The boundary read keeps the change whole (`stays one WU`). Locus derivation, in-flight derivation, session-init's state
reads, and the personal surfaces share one current-work-unit resolution, one marker roster, one session-init binding,
and one entry grammar: the slots read the roster and the in-flight set, the paused-work slot, the materialize offer,
and `arc locus release` read the same marker roster, and the listing, the routing verb, the drain, and the back-pressure
slot read the same entry kinds. Split along any of those lines, the parts would duplicate the binding or the grammar
they share. The change lands as one merge, reviewed in chunks on one branch; no chunk lands on its own, so the change
carries no delivery plan.

#### 1.2 What this change takes

Paths are under `packages/arc-framework/src/`.

- **Locus derivation and the roster:** `handlers/derived-locus-state-probe.ts`, `handlers/candidate-mutation-owner.ts`,
  `lib/locus/derived-evidence.ts`, `lib/locus/derived-lifecycle-evidence.ts`, `lib/locus/subject-meta.ts`,
  `lib/git/worktree-roster.ts`, `lib/git/worktree-marker.ts` and `lib/locus/occupancy-marker.ts` (the anchored marker's
  admission), `lib/git/worktree-cleanup.ts` (the cleanup decision's key), `commands/active/roster.ts`,
  `lib/release/wu-resolution.ts` (`resolveActiveWu`'s body and `resolveOriginatingMetaPath`),
  `lib/session-init/locus-classification.ts`, the derived frame and roster (`lib/locus/derived-reader.ts`, whose
  work-unit context gains the pause record and the commits not yet closed, and `lib/locus/derived-roster.ts`), the
  frame's guidance (`deriveDerivedLocusSessionGuidance`, `lib/locus/session-guidance.ts`), and the layout resolver's
  address for an identity's personal root (`lib/layout/schema.ts`, `lib/layout/projection.ts`).
- **In-flight derivation and overlap:** `lib/git/in-flight-derivation.ts`, `commands/active/in-flight.ts`,
  `handlers/active.ts`, `lib/git/foreign-artifact-detection.ts`, `handlers/errand.ts`'s `arc errand check`
  (`handleErrandCheck`), and `lib/session-init/in-flight-work-unit-sweep.ts`.
- **Session-init and recovery:** `handlers/status.ts`'s session-init binding (`handleSessionInitStatus`),
  `handlers/status/session.ts`, `handlers/status/session-context.ts`, `handlers/status/session-evidence.ts`,
  `commands/status/run.ts`, `handlers/recover.ts`, `handlers/recover-probes.ts`, `lib/recover/audit.ts`,
  `lib/recover/committed-progress.ts`, `lib/recover/integration-correction.ts`, `lib/handoff/restate-candidates.ts`,
  `lib/handoff/session-notes-path.ts`, `lib/load-set/projection.ts`, `lib/compaction-seed/emitter.ts`, and under
  `lib/session-init/`: `branch-gone-cascade.ts`, `branch-gone-recovery.ts`, `cohort-doc.ts`, `current-husk-advisory.ts`,
  `current-wu-reconcile.ts`, `errand-state.ts`, `errand-staleness-sweep.ts`, `inbox-reminders.ts`, `inbox-state.ts`,
  `lifecycle-residue-sweep.ts`, `materializable-work-units.ts`, `orphan-branch-sweep.ts`, `recommended-action.ts`,
  `retired-subdir-detection.ts`, `stale-worktree-sweep.ts`, and `work-unit-state.ts`; with
  `lib/user-sync/retired-subdir.ts` and `lib/user-reference-reconcile.ts` and its command
  (`handleUserReconcileReferences`, `handlers/user.ts`); and the session envelope's slot schemas and their registration
  (`commands/status/schema.ts`, `commands/status/types.ts`, `lib/session-envelope/registry.ts`).
- **Errands:** under `lib/errand/`, `open-runtime.ts`, `close-runtime.ts`, `abandon-runtime.ts`, `leave-runtime.ts`,
  `link-runtime.ts`, `partial-settle-runtime.ts`, `terminal-occupancy.ts`, `identity-claims.ts` (its claim rollback's
  call of the identity transaction) and `identity-transitions.ts` (the transition rules the runtimes compute, § 8),
  `record.ts`'s index projection and the locus consumers' listing protocols, and `promote-runtime.ts`'s marker
  settlement, shared with the change rerouting promotion's write (§ 1.3); and `handlers/errand.ts`'s
  `arc errand materialize` (`handleErrandMaterialize`), its Errand read (§ 8).
- **The personal surfaces and entry lists:** `lib/user-sync/parser.ts`, `lib/user-sync/inbox-writer.ts`,
  `lib/user-sync/inbox-target.ts`, `lib/user-sync/execution-offer.ts`, `commands/user/inbox-list.ts`,
  `handlers/user-inbox-list.ts`, `commands/user/inbox-mutation.ts`, `lib/inbox-entry-operand.ts` with its callers'
  operand parsing (`handleUserInboxRemove`, `handlers/user.ts`, and `arc errand open` and `link` in
  `handlers/errand.ts`), `commands/user/add.ts`, `commands/user/open.ts`, `commands/user/close.ts`, and `lib/setup.ts`'s
  seeding of the personal surfaces (`runPostInitSetup`); the entry kinds' declarations in `lib/store/registry.ts` and
  their modules under `lib/store/kinds/`; and the heading arm of `stampEntryIds` (`lib/store/concurrency/stamp.ts`).
- **The cold start and the spawn's scaffold:** `commands/start.ts`'s cold start (`runColdStart`,
  `coldStartOccupancyRefusal`, `rollbackColdStart`) and its call of the scaffold (`lib/git/worktree-scaffold.ts`), whose
  create arm from the flip is the transition-write-path change's (§ 2.8).
- **Handoff:** the new `arc handoff write` command and its handler, and the tripwire report beside it under
  `lib/handoff/` (§ 9.1, § 9.3).
- **The new verbs and settings, and the changed forms:** their registrations in `cli.ts` — the new verbs, and from the
  flip `arc errand open`'s and `arc errand link`'s `--from-inbox` and `arc user inbox-remove`'s `--id` and `--version`
  (§ 14) — and the three settings' declarations (`lib/config/schema.ts`, `commands/config/validate.ts`).

Readers outside this list that call into it keep their call: the lifecycle verbs and handlers that call the in-flight
expansion (`commands/rename.ts`, `handlers/start.ts`, `handlers/lifecycle.ts`) and the review handlers' checkout
binding (`handlers/review-locus-context.ts`, through `runDerivedLocusStateProbe`). The in-flight expansion keeps its
result shape, so they change only where a call must.

#### 1.3 Order and shared files

This change follows the change that reroutes the transition write path, whose removal function and check, prepared-write
protocol, pause, task close verb, branch links, widened `arc materialize`, and seed handling it calls (§ 16). Three
files serialize with it: `commands/start.ts`, where the cold start's seed handling lands first and this change's reroute
of `runColdStart` follows; `lib/git/worktree-scaffold.ts`, where that change's create arm lands and this change reroutes
the cold start onto it (§ 2.8); and `lib/errand/promote-runtime.ts`, where that change's one-write promotion lands and
this change moves the runtime's marker settlement onto it (§ 8.3). A file both changes rewrite carries one change's
edits at a time.

#### 1.4 Before the flip

Today's behavior holds until the flip, but for these, each with its own test:

1. **Every slot this change rebuilds carries its typed action and registered schema** (§ 4.2, § 4.3), the orphan-branch
   sweep's `git branch -D` for every merged branch among them (§ 12.4), and the two slots it adds, `pausedWork` and
   `inboundBackPressure`, are present with their schemas and report nothing (§ 4.4, § 4.6).
2. **The removal prompts carry their command:** the stale-worktree sweep's removable worktree and branch-gone recovery's
   removable candidate each carry an `arc teardown <name>` argv, and the sweep reports a missing locked registration
   with the unlock-and-prune remedy (§ 12.2).
3. **The residue sweep's rename-move remedy takes the `git worktree move -f -f` form** (§ 12.3).
4. **The removal callers take the removal function's and check's outcomes** — the Errand's exits and `arc errand leave`
   both, and the stale-worktree sweep, branch-gone recovery, and the residue sweep the check's `unobservable`, `locked`,
   and `missing`, where today a failed status read folds into not clean, branch-gone recovery reporting a candidate
   whose folder is missing with its prune rather than switching to it (§ 12.1).
5. **The compaction seed's schema version advances** (§ 4.9).
6. **`arc inbox`, `arc route`, `arc locus release`, `arc errand queue`, `arc errand queue set`, and `arc handoff write`
   are registered and refuse `unsupported`,** each naming what serves until the flip (§ 14).
7. **The anchored marker's admission is dormant:** the marker check and the topology check admit a work-unit marker
   with `spawnedByArc: false`, and every removal reader keys on `spawnedByArc: true`; nothing writes such a marker
   before the flip, so nothing observable changes (§ 2.3).

Every other part of this design runs only in an arm from the flip, beside an in-repo arm keeping today's behavior.

#### 1.5 Arms kept until the deletion pass

These run only while `capabilities.stateOffBranch` is false, and the deletion pass removes them:

- **Locus from the checkout's active meta** for a checkout with no marker (§ 2.1), and the cold start's own occupancy
  check (`coldStartOccupancyRefusal`), with Git's refusal to check out one branch twice guarding the rest (§ 2.4).
- **The cold start's branch and seed:** the protected-base cut of `plan/<name>`, its rollback's branch deletion
  (`rollbackColdStart`), and the `SESSION-NOTES` seed (§ 2.5); and `arc user open` (§ 2.8). The scaffold's meta write by
  path and its `runUserOpen` call are the transition-write-path change's in-repo arm (§ 16).
- **Promotion's runtime settlement,** its branch rename and commit (§ 8.3).
- **Identity setup's unconditional seeding** of the personal files (§ 10.1), and the user-surfaces resolver and its
  migration, which the in-repo implementation imports (§ 10.3).
- **In-flight derivation at branch refs** (`deriveInFlight`), the parked set built from the lifecycle index's parked
  slugs (`listParkedSlugs`), and the overlap check's self-exclusion by checkout and `resolveOriginatingMetaPath` (§ 3).
- **Session-init's notes recommendations and loads** (§ 4.7), and the session-notes path into the per-work-unit
  workspace (§ 2.8).
- **The personal surfaces' title-keyed reads and writes:** removal by title (`removeCurrentInboxEntry`,
  `commands/user/inbox-mutation.ts`), the execute-bound marks (`executeBoundMark`, `listExecuteBoundInboxEntries`), the
  notes lock around the inbox writer, and today's `arc user inbox-list --target` (§ 7.1, § 7.6, § 7.7).
- **Hold-and-route:** the backlog draft's buffer section and owner adoption's `_Hold:_` re-stamp (§ 7.9).
- **`SESSION-NOTES` as handoff's write** and the verbs' writes of `Next Task`, `Last Completed`, and `Blockers` (§ 9.1).
- **Lineage from today's transition records and their projected dispositions** in the reconcilers (§ 3.5).

Every floor entry left at landing in the parts of § 1.2's files this change reroutes sits inside one of these.

### 2. Locus derivation

#### 2.1 The roster from the marker and the store

From the flip, each registered checkout's role is derived from its marker and the store, never from the checkout's
`.arc/active/`: the marker names the work item, and the work item's lifecycle facts — its placement, its `State`, its
owner, its pause (§ 4.4) — are read through the store. This covers the derived-locus probe
(`runDerivedLocusStateProbe`), the derived evidence and lifecycle evidence (`lib/locus/derived-evidence.ts`,
`lib/locus/derived-lifecycle-evidence.ts`), the subject's meta read (`lib/locus/subject-meta.ts`), the worktree roster
(`lib/git/worktree-roster.ts`, `commands/active/roster.ts`), and the Candidate mutation owner
(`resolveCandidateMutationOwner`, `handlers/candidate-mutation-owner.ts`), which projects the derived-locus probe today
and so follows it onto the marker and the store. The identity-global user root comes from the layout resolver
(`resolveArcPath`, `lib/layout/projection.ts`) through a new address for an identity's personal root, where the probe
builds the path by hand today and the resolver's addresses name only files beneath it.

- **Two markers naming one work unit** derive as unresolved for both checkouts rather than either being chosen.
- **An incomplete observation is never absence.** A marker that cannot be read, a store read that fails, or a listing
  that is not complete grants no role and no cleanup authority, and the slot reports it, as today's derived frame
  reports an unreadable checkout.
- **Until the flip** a checkout with no marker keeps today's reading of its active meta, which is how a cold-started
  checkout and a checkout graduated in place are found today, since neither writes a marker.

#### 2.2 The current work unit

`resolveActiveWu`'s body (`lib/release/wu-resolution.ts`) resolves through the contract's resolver
(`resolveCurrentWorkUnit`), and this change's own callers of `readActiveMetaCandidates` call that resolver directly and
take its result: the cold start's occupancy check (`coldStartOccupancyRefusal`, `commands/start.ts`) and
`resolveOriginatingMetaPath`. For the default root `readActiveMetaCandidates` already delegates to the resolver
(`readHeldCandidates`, `lib/active/meta-reader.ts`), so the move changes the result's shape, not the read; the function
stays for its other callers. The user-reference reconcile's current-work-unit read
(`resolveCurrentWuName` in `handleUserReconcileReferences`, `handlers/user.ts`) moves onto `resolveCurrentWorkUnit` too,
leaving `resolveCurrentWuName` (`lib/user-sync/current-wu.ts`) with only the notes-sync commands as callers.

#### 2.3 The anchored marker

Locus derivation from the flip reads the marker and the store, so a checkout ARC claimed in place carries a work-unit
marker, and that marker must grant no removal. Today a work-unit marker is always `spawnedByArc: true`: the marker check
admits `false` only for a transient subject (`isWorktreeMarker`, `lib/git/worktree-marker.ts`), the topology check
requires `false` exactly on the primary, with no arm for a work unit (`validateOccupancyMarkerTopology`,
`lib/locus/occupancy-marker.ts`), the derived evidence projects every work-unit marker as `true`
(`lib/locus/derived-evidence.ts`), the cold start writes none (`writeWorktreeOwnershipMarker` returns without writing
when `createdByArc` is false), and the cleanup decision keys on whether a marker is present (`decideWorktreeCleanup`,
`lib/git/worktree-cleanup.ts`).

- **The admission lands before the flip, dormant.** Both checks' work-unit arms admit `spawnedByArc: false`, meaning
  ARC did not create the checkout, on the primary or a linked checkout; the derived evidence carries the marker's own
  value; and every removal path keys on `spawnedByArc: true` rather than a marker's presence, so an anchored checkout
  reads as `external`. Nothing writes an anchored work-unit marker until the flip, so nothing observable changes.
- **An anchored checkout is kept.** Teardown releases its marker and keeps the checkout, the primary included, and
  rename completes in place without moving it (§ 16). `arc locus release` releases it (§ 5).
- **From the flip every in-place arm writes it** (§ 2.6).

#### 2.4 The marker's exclusivity

Branchless planning gives up Git's refusal to check out one branch twice, so from the flip the marker carries the
guard. The roster exposes one exclusivity check: given a work unit and the checkout about to hold it, it reads the
derived roster and refuses when another registered checkout's marker names the same work unit, naming that checkout.
Every verb that writes a work-unit marker runs it first: `arc start --here` in both its arms, the spawn, `arc materialize`
in either arm, and Errand promotion, whose fresh slug never collides (`convertSpawnedMarker`,
`lib/errand/promote-runtime.ts`). This change runs it in the cold start and in promotion; the spawn, graduation in
place, and `arc materialize` call it (§ 16). The guard is per machine, as markers are; across machines the work unit's
owner governs. Until the flip, Git's refusal and the cold start's own check, which inspects only its own checkout
(`coldStartOccupancyRefusal`), stay as today.

#### 2.5 The cold start

`runColdStart` (`commands/start.ts`) keeps one shape across the flip once the seed handling that precedes it has landed
(§ 1.3): `--from` sets `Origin` for an issue reference and passes every other seed through for the agent to read, and the
cold start enters at `draft-design` (§ 16).

- **Its occupancy check** reads the current work unit from the marker plus the store (§ 2.2).
- **Its meta** is written through the store by the meta kind's creation writer (`renderMetaFile`,
  `lib/store/kinds/meta/projection.ts`), with no `SESSION-NOTES` seed from the flip (§ 2.8).
- **From the flip `arc start --here` writes only the marker and the store's records and never moves `HEAD`.** The
  protected-base cut of `plan/<name>` and its rollback's branch deletion (`rollbackColdStart`) retire on the
  capability, with the `plan/` prefix, since a planning work unit holds no branch. It writes the anchored marker (§ 2.6).
- **Until the flip** both stay as today.

#### 2.6 Every in-place arm writes an anchored marker

From the flip, since derivation reads only the marker and the store, every arm that claims a checkout in place writes an
anchored work-unit marker (`spawnedByArc: false`):

- **the cold start,** this change's (§ 2.5);
- **graduation in place** (`runGraduate` with `inPlace`, `commands/start.ts`), whose atomic graduation checks the branch
  out with no marker today (`occupy`, `lib/work-unit/atomic-graduation.ts`), so the marker is written there, inside its
  rollback (§ 16);
- **`arc materialize --here`,** through `reconcileWorkUnitWorktree`'s in-place leg, which writes none today (§ 16);
- **Errand promotion on the primary,** this change's: today promotion removes the primary's transient marker
  (`removePrimaryTransientOccupancy`, called by `settlePromotedOccupancy`, `lib/errand/promote-runtime.ts`), and from the
  flip it writes an anchored work-unit marker in its place, so the work unit carries on where the Errand ran. On a
  spawned checkout promotion converts the transient marker (`convertSpawnedMarker`), as today.

**Anchoring under each protection mode.** An anchored primary is no launchpad. Under full protection, where promotion
runs (`promoteOrdinaryErrand` refuses `full-protection-required`, `lib/errand/promote.ts`), an Errand promoted on the
primary leaves it anchored, and each new Errand spawns its own worktree. Under partial protection `arc start --here`
anchors the primary and `arc errand open` refuses `primary-occupied` (`planLocusAllocation`, `lib/locus/allocator.ts`),
so a project working in one checkout runs one thing at a time in it, as it does today, and parallel work takes full
protection's spawned checkouts.

#### 2.7 Checkouts claimed in place before the flip

Before the flip no in-place arm writes a marker: the cold start's write returns without writing, graduation's in-place
occupation writes none (`occupy`), the executor's in-place spawn leg writes none (`reconcileWorkUnitWorktree`), which
`arc materialize --here` runs and in-place resume too — `arc resume --here` and `arc start <slug> --here` on a parked
work unit — and promotion on the primary removes the Errand's transient marker and writes none
(`removePrimaryTransientOccupancy`). The marker is machine-local, so moving state onto the ref store carries none, and
from the flip a checkout claimed in place before it holds its work unit with no marker.

- **Session start finds each such checkout:** a checkout with no marker that has out a branch linked by an in-flight
  work unit this identity owns. Its materialize offer carries `arc materialize <slug> --here` for that work unit, with
  that checkout to run in (§ 4.3), which writes the anchored marker. Such a work unit leaves the offer's ordinary set,
  since a spawn would meet Git's refusal; a paused one stays with the paused-work slot, whose item carries the same
  action (§ 4.4).
- **A work unit no checkout here holds** takes the ordinary offer (§ 4.5), one cold-started on base under partial
  protection among them: moving state links no branch for a work unit whose `Branch` is empty or names base, which is
  where a partial-protection cold start leaves it (`runColdStart` cuts `plan/<name>` only on a protected base).

#### 2.8 The workspace, session notes, and scratch

- **The session-notes path** that session-init's load set and handoff resolve (`lib/handoff/session-notes-path.ts`,
  `lib/load-set/projection.ts`) is, from the flip, the meta's session context; until then the per-work-unit workspace's
  `SESSION-NOTES.md`. The load set's meta and task-list paths come from the layout resolver, where callers supply them
  today.
- **The spawn's scaffold** (`scaffoldIntoWorktree`, `lib/git/worktree-scaffold.ts`), which create-new and the cold start
  share, writes the meta, calls `runUserOpen` (`commands/user/open.ts`) for the workspace and its `SESSION-NOTES` seed,
  and writes the marker. From the flip its create arm writes the meta and its session context through the store and
  calls no `runUserOpen`, an arm the transition-write-path change builds (§ 16); this change reroutes the cold start
  onto it, and the marker stays machine-local. `arc user open` (`handlers/user.ts`) refuses `unsupported` from the flip,
  naming the meta's session context; until then it runs as today.
- **Scratch.** The projection creates `.arc/user/<identity>/scratch/work-unit/<slug>/`, empty, for the checkout's own
  work unit. From the flip session start reconciles the person's folders there through `lookup`: a folder whose work
  unit was renamed follows its current slug; one whose work unit has ended is removed and reported; and a name
  resolving to no work unit is left and reported. A promoted work item's folder reconciles as a fresh start's does, and
  the tests include one.

### 3. In-flight derivation and overlap

#### 3.1 The in-flight set

From the flip in-flight derivation lists work items through the store at placement active — work units and open
Errands — and reads each one's lifecycle facts there, rather than listing metas at branch refs
(`analyzeInFlightSnapshot`, `deriveInFlight`, `lib/git/in-flight-derivation.ts`). A remote branch that outlives its
work item is a locus hint — evidence of where work sits — never lifecycle authority. The oracle behind the
`workUnitState` and `errandState` slots reads this set; the in-flight expansion (`runActiveInFlightExpansion`,
`expandActiveInFlight`, `runActiveInFlight`, `commands/active/in-flight.ts`; `handleActiveInFlight`,
`handlers/active.ts`) keeps its result shape. The in-flight work-unit sweep takes each work unit's name from its
in-flight entry's identity, where it derives it from the meta path's basename today (`workUnitNameFromMetaPath`,
`lib/session-init/in-flight-work-unit-sweep.ts`).

- **A paused work unit stays in flight.** A pause changes neither `State` nor placement, so the derivation's
  `scheduling` axis, built today from the lifecycle index's parked slugs (`listParkedSlugs`), reads the pause record
  from the flip (§ 4.4).
- **Until the flip** the derivation reads branch refs as today.

#### 3.2 Errands and claims list apart

Today one pinned read of the identity's Errand ref (`refs/arc/user/<identity>/errands`) returns Errands and grooming and
housekeeping claims together, as absent, a root-level error, or a complete snapshot with per-entry diagnostics
(`readTransientIdentitySnapshot`, `lib/errand/identity-snapshot.ts`), and the derived evidence consumes it directly
(`lib/locus/derived-evidence.ts`).

- **From the flip** Errands are project-scope work items listed through the store, and claims stay identity-scoped, so
  the two are acquired separately, each pinned at its own version with the same three outcomes and per-entry
  diagnostics kept apart. A listing of Errands alone never stands in for the claims, and review admission still
  requires both complete, with no diagnostics.
- **Until the flip** the in-repo implementation serves both from the one snapshot, so a single pin holds, as today.
- This change moves the Errand index projection (`lib/errand/record.ts`) and its locus consumers' listing protocols onto
  that acquisition; the review gate's own reads keep theirs.

#### 3.3 Overlap for a state target

`arc errand check` (`handleErrandCheck`, `handlers/errand.ts`) builds the in-flight set, projects it to an overlap
roster that keeps work units by name and Errands by slug (`projectInFlightToOverlapRoster`), and for each candidate
other than itself runs a committed probe (`git diff <base>...<sha> --name-only -- <targets>`, against `origin/<base>`
where it resolves and the local base otherwise, `preferRemoteBaseRef`) and, for a checked-out candidate, an uncommitted
probe (`git status --porcelain`), which `HEAD` and `MERGE_HEAD` checks bracket to report `indeterminate`
(`detectForeignArtifactOverlap`, `lib/git/foreign-artifact-detection.ts`). Targets are prefix-matched paths with no
special handling for `.arc/`.

- **From the flip, targets split through the layout resolver.** A code target keeps both probes. A state target
  resolves to its record, and the check reports overlap when that record's own work item is in flight in another locus.
  An entry-list target — an inbox, an inbound list, an Errand's description — reports none, since its writes merge by
  entry, and any other concurrent state write still meets compare-and-swap at write time, so the check stays advisory.
  The store's write provenance names the verb, the record, and its owner, never the work item that wrote it, so the
  in-flight work item carries the state arm rather than the store's `changes`.
- **A paused work unit counts, through both probes,** since a pause keeps its checkout and any edits in it. Today's
  skip of parked work units rests on park's teardown of the checkout (`parkActive`,
  `lib/work-unit/verbs/park-resume.ts`) and retires with park.
- **Self-exclusion by identity.** From the flip the check excludes the locus running it, Errand or work unit, by its own
  identity from the marker, where today it excludes by name, by originating checkout, or by `resolveOriginatingMetaPath`,
  and an Errand only by its checkout.
- **Errands stay candidates,** as they are today: the roster lists in-flight Errands beside work units, and an online
  read classifies Errand branches from the remote's Errand records (`readFetchedTransientInFlightIndexes`).

#### 3.4 Shipped-work readers

The locus and session-init readers of the archive index (`lib/work-unit/completed-index.ts`) — the stale-worktree and
orphan-branch sweeps (`lib/session-init/stale-worktree-sweep.ts`, `lib/session-init/orphan-branch-sweep.ts`),
retired-subdirectory detection (`lib/session-init/retired-subdir-detection.ts`, which hands the shipped set it reads to
`planRetiredSubdirReconcile`), and the derived locus evidence (`lib/locus/derived-evidence.ts`), whose read the derived
lifecycle evidence and the roster consume — read placement and `lookup` instead, and none keys on an archive folder's
number, which the archive's sync may renumber until the archive is published.

#### 3.5 Former slugs

From the flip the reconcilers — the current-work-unit reconcile (`lib/session-init/current-wu-reconcile.ts`) and the
user-reference reconcile (`lib/user-reference-reconcile.ts`) — resolve a former slug from the live primary record
through `lookup`, and list lineage only for terminal outcomes: a cut or an abandonment. They keep their fail-closed
outcomes: the current-work-unit reconcile's refusals, `ambiguous-evidence` and `rename-cycle` among them
(`DependencyReconcileConflictReason`), and the user-reference reconcile's unavailable authority and per-entry conflict
advisories (`resolveReferenceTransition`). Until the flip they read today's transition records and the dispositions
projected from them (`lib/work-unit/transition-disposition-query.ts`).

#### 3.6 Lingering refs and a decomposed origin

Shipped lifecycle authority already outranks a stale `plan/` or `feat/` ref, keeping the ref as cleanup evidence. Over
the store a lingering ref is a locus hint, never lifecycle authority, and the dependency-discharge consumer reads the
store's answer (§ 16). Today nothing outranks a decomposed origin's lingering ref: while its remote `plan/` ref exists,
`arc status` reports it `Planning · active` and ROADMAP lists it In Flight beside its own members, since both reach
`resolveProjectReadinessComposition` — `arc status` through `resolveComposedLifecycleIndex` — whose record merge lets an
in-flight meta win when no operational record exists (`mergeProjectReadinessRecords`, `lib/status/project-view.ts`).
Over the store the origin reads as decomposed from its lineage record, once the status change's merge reads it (§ 16).

#### 3.7 The archived-but-not-torn-down frame

Under `archive.cadence: with-integration` the meta reaches `completed/` before merge and teardown, and an interruption
there leaves a durable role whose subject is `subject-unresolved`. Archival at or after merge would remove the interval,
which takes more than dropping the integration workflow's archive step: under that setting the integration checkpoint
and readiness require an archived meta before merge (`readLifecycleSummary`,
`scripts/integration/checkpoint-composition.ts`; `evaluateArchivedWorkUnit`, `scripts/review-gate/readiness.ts`), and
merge refuses unless that lifecycle position holds (`scripts/integration/merge.ts`). None of it is this change's, and
locus depends on none of it: over the store it keeps an arbitrary missing or ambiguous subject fail-closed whether or
not the interval remains. Tests cover a restart after archive and before merge, merge before teardown, a partial
teardown, a retained-control finalization, and missing or ambiguous completed subjects, across the reader, session-init,
and recovery.

### 4. Session-init

#### 4.1 One binding

Session-init's composition stays in `handleSessionInitStatus` (`handlers/status.ts`), which binds every state probe: the
in-flight oracle (`getOracle`, over `analyzeInFlightSnapshot`) and the transient indexes, `currentWuReconcile` and
`userReferenceReconcile`, the roster and the sweeps, `errandSweep` and `inboxState`, the nudge-marker reads behind
`errandState` and `workUnitState` (`resolveNudgeState`, `handlers/status/session-evidence.ts`), and the compaction
seed's write. Each probe's reads go through the contract, its slot paths and load-set entries come from the layout
resolver, and its outcome stays the plain `{ ok, … }` object composed in `commands/status/result-composition.ts`, with
today's failure isolation: each slot fails alone, except where `runSessionInitStatus` (`commands/status/run.ts`) builds
it from another slot's result — as `errandState` from `worktree` and `active`, the residue sweep from the roster, and
`loadSet` from `derivedLocusState`. Handoff's and recovery's probes take the same route: `createHandoffProbes` and the
`resolveHandoffSurfaces` option `handlers/status/session.ts` passes to `runSessionHandoffStatus`
(`commands/status/run.ts`), `readUserInbox` (`handlers/status/session-context.ts`), and the recovery probes
(`handlers/recover-probes.ts`, `handlers/recover.ts`), which today read the seed's task list with
`git show <seedHead>:<taskListPath>`. The nudge markers stay machine-local files under the identity's `.internal/`.

- **`currentWuReconcile`'s reads are bound once.** Today `handleSessionInitStatus` binds the lifecycle index, the
  transition queries, and the artifact reads inline, beside the same reads `buildCurrentWuReconcile`
  (`lib/work-unit/executor-context-current-wu.ts`) and the reconcile's own command (`handleWuReconcile`,
  `handlers/reconcile.ts`) each bind, and all three run `prepareCurrentWuReconcile`
  (`lib/work-unit/side-effects/discharge-dep-edges.ts`). Session-init's binding moves onto the store-backed prepare the
  transition-write-path change builds for all three (§ 16), dropping its inline reads; the other two bindings are that
  change's. The slot only prepares; the apply is `arc wu reconcile <slug> --apply` (`handleWuReconcile`,
  `handlers/reconcile.ts`), a prepared write under the protocol § 16 names.
- **The user-reference reconcile** rewrites personal records rather than a work unit's artifact group, and takes the
  prepared-write shape over them: it revalidates each prepared record by its version and applies every rewrite in one
  `batch` with expected versions.
- **The reads stay narrow:** each goes through the contract without reshaping the workflow's prose conditionals over
  the envelope.

#### 4.2 Rebuilt slots and their schemas

This change rebuilds these slots: `workUnitState` (`WorkUnitStateResult`), `errandState` (`ErrandStateResult`), `user`
(`UserSessionInitStatusResult`), `userReferenceReconcile`, `derivedLocusState` (`DerivedLocusFrame`),
`currentWuReconcile`, `sweep` (`StaleWorktreeSweepResult`), `recovery` (`SessionInitRecoveryValue`), `inboxState`,
`materializableWorkUnits`, and `orphanBranchSweep`; and adds two, `pausedWork` (§ 4.4) and `inboundBackPressure`
(§ 4.6). Each registers its schema with the contract's schema registry, which `arc schema` serves, as the session-init
envelope's own schema is registered (`session-init-envelope`), never a hand-written copy.

- **`retiredSubdirs`** reads shipped work through placement until the flip (§ 3.4). From the flip it resolves `skip`
  with no candidates, since the per-work-unit workspace it reconciles retires and session start's scratch reconcile
  takes its place (§ 2.8).
- **`user`** reports, from the flip, the store's pull at session start in place of the notes channel (§ 4.7, § 4.8).

#### 4.3 Every slot carries its action

Each slot § 4.2 names carries, for each condition it reports that wants a repair, its recommended action in one shared
shape: the shipped remedy shape (`RemedySchema`, `lib/store/refusal.ts`) — precomposed `text`, and an `argv` where
running it as given repairs the condition — plus an optional `checkout`, below. The shape is registered once and every
slot reuses it, where today `currentWuReconcile` carries a bare `recommendedCommand` and the residue sweep a `remedy`.

- **Typed or text.** An action with an argv is typed. One with text alone names the command with its arguments where the
  repair needs the agent's or the owner's input or order: the commits a lost floor leaves to be named (§ 11), the
  decisions a re-triage or a survivor's carry takes (§ 4.6, § 7.4), or a ceremony that runs under its own interlocks, as
  an archive or an integration does. A condition that wants no repair carries no action. Whether an action runs unasked
  is the slot's own `recommendedAction`, which the CLI computes as today — `recovery`'s `switch` for an exact, clean
  switch and `userReferenceReconcile`'s `apply` among them; an action no slot marks to run unasked is an offer the
  workflow runs only on the person's approval. Typed means runnable as given.
- **The checkout to run in.** An action whose verb works on, or writes from, the checkout it runs in carries that
  checkout: the task close, which takes no slug and captures that checkout's `HEAD`; the reconcile's apply, which
  refuses unless that checkout's branch owns the slug (`resolveOwnedTarget`, `handlers/reconcile.ts`);
  `arc materialize <slug> --here` for a branch a checkout with no marker has out; and, from the flip, any writer of a
  work unit's meta or task list, which writes only from the work unit's own checkout. Each slot sets the checkout from
  its verb's own rule; an action without one runs from any checkout.
- **A paused work unit.** From the flip, on a paused work unit, a slot whose action advances the work takes
  `arc resume <slug>` as its action in its place, since the verb would refuse naming it (§ 16), and its text names the
  command to run once resumed: `currentWuReconcile` offers no `arc wu reconcile <slug> --apply --json`, and the commits
  not yet closed name `arc task close`.
- **Existing commands are kept.** Where a slot carries a command today, the action is that command, under today's
  condition (`lib/session-init/current-wu-reconcile.ts`; `projectUserReferenceSessionResult`,
  `lib/user-reference-reconcile.ts`; the residue sweep's teardown and successor remedies,
  `lib/session-init/lifecycle-residue-sweep.ts` and `lib/work-unit/retirement-lifecycle-result.ts`). A work unit
  `awaiting-review`, and a retirement surfaced as `blocked`, want no repair and carry no action.
- **The notes channel's recommendations** (`inferUser`, `lib/session-init/recommended-action.ts`) are the envelope's
  recommendation rather than a slot's action; they keep today's shape until they retire at the flip (§ 4.7).

| Slot and condition                                                                                                                         | Action                                                                                                                                    | Form  |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `currentWuReconcile`: tracked repairs pending                                                                                              | `arc wu reconcile <slug> --apply --json`, in the work unit's checkout                                                                     | typed |
| `currentWuReconcile`: advisory or conflicted                                                                                               | `arc wu reconcile <slug> --json`, to inspect, as today                                                                                    | typed |
| `userReferenceReconcile`: rewrites pending                                                                                                 | `arc user reconcile-references --apply --json`, as today                                                                                  | typed |
| `userReferenceReconcile`: advisory references                                                                                              | `arc user reconcile-references --json`, to inspect, as today                                                                              | typed |
| `userReferenceReconcile`: rename evidence unavailable or in conflict                                                                       | its precomposed text                                                                                                                      | text  |
| `workUnitState`: `merged-needs-archival`                                                                                                   | the archive, in the work unit's checkout                                                                                                  | text  |
| `workUnitState`: `mergeable`                                                                                                               | the integration, after merging base in where `behindBase` is known true                                                                   | text  |
| `workUnitState`: `mergeability-unavailable`                                                                                                | its precomposed guidance (`mergeabilityGuidance`)                                                                                         | text  |
| `workUnitState`: `blocked`                                                                                                                 | the open pull request's requested changes or failing checks, which its owner answers                                                      | text  |
| `workUnitState`: `stale`                                                                                                                   | its once-a-day nudge                                                                                                                      | text  |
| `errandState`: an Errand to materialize                                                                                                    | `arc errand materialize <slug> --claim-id <id> --expected-head <head> --json`                                                             | typed |
| `errandState`: the current branch's Errand to resume, or residue                                                                           | its precomposed text                                                                                                                      | text  |
| `inboxState`: routable captures (`housekeepNeeded`)                                                                                        | the drain, `arc-session --housekeep`                                                                                                      | text  |
| `inboxState`: the person's survivors (§ 7.4)                                                                                               | `arc inbox personal`, then the drain's carry                                                                                              | text  |
| `sweep`: a removable worktree                                                                                                              | `arc teardown <name>`                                                                                                                     | typed |
| `sweep`: a work unit's husk, on the primary                                                                                                | `arc teardown <name>`, as today                                                                                                           | typed |
| `sweep`: a work unit's husk, from a linked checkout                                                                                        | `arc teardown <name> --husk <path>`, as today                                                                                             | typed |
| `sweep`: a branch's husk, on the primary                                                                                                   | `arc teardown --branch <ref>`, as today                                                                                                   | typed |
| `sweep`: an Errand's husk, a branch's from a linked checkout, or a manual-only stamp                                                       | its text, for manual cleanup, as today                                                                                                    | text  |
| `sweep`: a landed retirement's residue                                                                                                     | `arc teardown <slug>`, its teardown remedy, as today                                                                                      | typed |
| `sweep`: a landed retirement's one ready successor                                                                                         | `arc start <slug>`, its successor remedy, as today                                                                                        | typed |
| `sweep`: a missing folder whose registration is locked                                                                                     | `git worktree unlock <path>`, then `git worktree prune`                                                                                   | text  |
| `sweep`: a checkout whose work unit another identity owns (§ 5)                                                                            | `arc locus release <slug>`                                                                                                                | typed |
| The residue sweep's deferred rename move                                                                                                   | `git worktree move -f -f <from> <to>`                                                                                                     | typed |
| `orphanBranchSweep`: a shipped work unit's branch                                                                                          | `arc teardown <name>`                                                                                                                     | typed |
| `orphanBranchSweep`: a branch whose commits all landed (§ 12.4)                                                                            | `git branch -D <name>`                                                                                                                    | typed |
| `orphanBranchSweep`: an adopted branch not landed                                                                                          | `git branch -D <name>`, as its owner's step                                                                                               | text  |
| `materializableWorkUnits`: a work unit no checkout here holds                                                                              | `arc materialize <slug>`                                                                                                                  | typed |
| `materializableWorkUnits`: its branch out in a checkout with no marker                                                                     | `arc materialize <slug> --here`, in that checkout                                                                                         | typed |
| `materializableWorkUnits`: discovery pending a fetch                                                                                       | `arc active in-flight --json`, its refresh remedy, as today                                                                               | typed |
| `recovery`: branch-gone's removable candidate                                                                                              | `arc teardown <name>`                                                                                                                     | typed |
| `recovery`: a checkout to switch to                                                                                                        | that checkout's path, to continue there                                                                                                   | text  |
| `recovery`: the in-flight tier pending a fetch                                                                                             | `arc active in-flight --json`, its refresh remedy, as today                                                                               | typed |
| `recovery`: an exact, clean switch to a branch with no checkout                                                                            | `git switch <branch>`, after `git fetch` where only its remote holds it                                                                   | text  |
| `recovery`: a candidate's folder missing, unlocked: `missing` (§ 12.1)                                                                     | `git worktree prune`                                                                                                                      | typed |
| `recovery`: a candidate's folder missing, locked: `locked` (§ 12.1)                                                                        | `git worktree unlock <path>`, then `git worktree prune`                                                                                   | text  |
| `recovery`: any other outcome — main-fallback, surface, unproven, an external candidate, or a prompted switch to a branch with no checkout | its precomposed text, as today                                                                                                            | text  |
| `pausedWork`: a review-due item (§ 4.4)                                                                                                    | its review prompt, naming `arc resume <slug>`, `arc handover <slug> --to <identity>`, `arc pause <slug> --open`, and `arc abandon <slug>` | text  |
| `pausedWork`: each item (§ 4.4)                                                                                                            | `arc resume <slug>`, or a materialize as the two rows above                                                                               | typed |
| `inboundBackPressure` past a threshold (§ 4.6)                                                                                             | `arc inbox <slug>`, then the owner's re-triage                                                                                            | text  |
| `derivedLocusState`: commits not yet closed (§ 11)                                                                                         | `arc task close`, in the work unit's checkout                                                                                             | typed |
| `derivedLocusState`: an Active work unit with no linked branch out (§ 11)                                                                  | the work branch to switch to                                                                                                              | text  |
| `derivedLocusState`: the floor behind (§ 11)                                                                                               | `git pull` of the work branch, in the work unit's checkout                                                                                | typed |
| `derivedLocusState`: the floor diverged (§ 11)                                                                                             | `git pull --no-rebase` and the close again where nothing was rewritten, or the lost floor's explicit close where pushed commits were      | text  |
| `derivedLocusState`: the floor missing (§ 11)                                                                                              | `git fetch`, then a push of the work branch from the checkout that holds it, or the lost floor's explicit close where none does           | text  |
| `derivedLocusState`: the floor lost (§ 11)                                                                                                 | a task's re-close, `arc task close <id> --commit <sha>…`, or `arc task close <ids> --commit <sha>…`                                       | text  |
| `user`: the store needs a designation (§ 4.8)                                                                                              | the store's remedy argv                                                                                                                   | typed |

The session-init workflow keeps rendering each slot from its own text until the flip's rewrite dispatches the actions;
these slots are what that rewrite consumes, without reopening them.

#### 4.4 The paused-work slot and a paused checkout

From the flip a pause is a record on the work item that changes neither its `State` nor its placement (§ 16).

- **`pausedWork`** is a per-identity slot listing the person's paused work units, each with its reason and what it waits
  on. An item is marked **resumable** once the work unit it waits on ships, and **review-due** at once if that work unit
  ends otherwise, abandoned or cut, or once a pause waiting on no work unit, a note included, passes
  `pause.review_after_days`, a project setting beside `inbox.remind_after_days` (default 14). A review-due item carries
  a review prompt, its text precomposed, asking its owner to resume it (`arc resume <slug>`), hand it over
  (`arc handover <slug> --to <identity>`), open it to takers (`arc pause <slug> --open`), or abandon it
  (`arc abandon <slug>`), each a command it names in full but the identity a handover takes; the slot always passes the
  slug.
- **Each item's action** is `arc resume <slug>`; or `arc materialize <slug>` when no checkout on this machine holds the
  work unit; or, when a checkout with no marker still has the work branch out — released, or claimed in place before
  the flip (§ 2.7) — `arc materialize <slug> --here` with that checkout to run in, since a spawn would meet Git's refusal
  there.
- **Entering a paused checkout.** The derived frame's work-unit context carries the pause record, and the frame's
  guidance (`locusGuidance`) renders the pause, its reason, and its resume notes before any work starts. Orientation is
  then not bare-clean, so an entry shortcut never fires past it.
- **Until the flip** the slot reports nothing, and park stays as today.

#### 4.5 The materialize offer

From the flip `arc materialize <slug>` gives a checkout to any in-flight work unit this identity owns that no checkout on
this machine holds — remote-only or released here, paused or not — and leaves a pause in place (§ 16). Session start's
offer (`findMaterializableWorkUnits`, `lib/session-init/materializable-work-units.ts`, behind the
`materializableWorkUnits` slot) lists the same set less paused work units, which the paused-work slot lists, and offers
`arc materialize <slug> --here`, with its checkout, for a work unit whose branch a checkout with no marker has out
(§ 2.7). Today both the offer and the verb admit only remote-only work units that are not parked
(`findMaterializableWorkUnits`, `handleMaterialize`).

#### 4.6 Inbound back-pressure

One per-work-unit computation, built with the inbound list's kind, reports the pending inbound count and the oldest
entry's age, from its `_Created:_` (§ 6.2), against two thresholds: a work unit is past them when it holds more than
`inbound.retriage_after_entries` pending entries (default 10) or its oldest is older than `inbound.retriage_after_days`
(default 30). Both are project settings beside `inbox.remind_after_days`, since how often a team drains is the
project's preference. Two places read it:

- **Session-init** carries the current work unit's figures in the `inboundBackPressure` slot, with its full schema,
  and past a threshold recommends its owner's re-triage, naming in its text `arc inbox <slug>`, which lists the work
  unit's inbound list (§ 7.1), since the re-triage takes the owner's decisions.
- **The drain** reads it through the same listing, and its routing plan gives each backlog stub it routes into that
  already holds entries one line with the count and oldest date and the precomposed offer to re-triage it, since the
  drain grooms only backlog stubs and a started work unit's entries are its owner's.

Until the flip no inbound list exists, and the slot reports nothing.

#### 4.7 Notes policies retire

From the flip `user.notes_push`, `session.init_pull.notes`, and `session.init_load.notes` have no effect, and
session-init's notes recommendations go with them: their policy branches, the notes and combined prompts
(`composeNotesPromptText`, `composeCombinedPrompt`, `lib/session-init/recommended-action.ts`), and the
retired-subdirectory load dispatch (`inferRetiredSubdirs`). `session.remote_sync`, the worktree and base
recommendations, and each slot's failure isolation stay. Until the flip all of them run as today.

#### 4.8 Session start pulls

From the flip, under `session.remote_sync`, session start calls the store's `pull` (§ 16). Where the store reports
that a remote must be designated (`designation-needed`), session start carries it in the `user` slot as an orientation
line with the remedy's argv, and `arc join` asks on a terminal or reports it the same way, never guessing.

#### 4.9 The compaction seed

The compaction seed stays a read-only projection, produced from the session-init envelope by the shared load-set
projection (`resolveLoadSetManifest`, `lib/load-set/projection.ts`), never a bespoke parser. Its task cursor is derived
from the task list and compared against the seed's baseline. It records the state version beside an explicit code-head
baseline and resolves its meta path through the layout resolver, where `emitCompactionSeed` matches a hand-written
`.arc/active/meta-` pattern today (`lib/compaction-seed/emitter.ts`), and `COMPACTION_SEED_SCHEMA_VERSION` advances for
both.

### 5. `arc locus release`

`arc locus release [<slug>]` releases a work unit's checkout. With a slug it acts on the checkout whose work-unit marker
names that work unit, found through the roster, refusing when no checkout on this machine holds it; without one, on the
current checkout. It refuses a checkout holding a transient role, naming that role's exits as handoff's locus plan names
them (`transientPlan`, `lib/handoff/locus-plan.ts`) — `arc errand leave` for an Errand under full protection; finish,
promote, or abandon for a partial one; ship, close, or abandon for grooming; complete or abandon for housekeeping —
since those exits keep preconditions the release does not check (§ 12.1). It is a subcommand of the existing `arc locus`
inspect command (`handleLocus`), which keeps working unchanged.

- **A spawned checkout** takes the removal check, then the removal function (§ 16).
- **An anchored checkout** is kept: only the removal check's projection part runs, so a dirty checkout does not refuse
  it, then the projection's `release` slot, refusing if that refuses, and then the marker is cleared. The slot persists
  every edit or refuses, and passes until the projection fills it.
- **Either arm revalidates the marker's generation first**, and run from inside the checkout it releases, moves the
  process out first, as teardown's locus hop does (`runTeardown`, `lib/work-unit/verbs/teardown.ts`).
- **Who may release.** It releases a paused work unit's checkout for its owner, and a checkout whose work unit another
  identity owns — the handover case, which the stale-worktree sweep reports with `arc locus release <slug>`, runnable
  from any checkout (§ 4.3). It refuses on a work unit this identity owns that is not paused, so it never strands a live
  locus, naming the remedy its state takes: `arc pause <slug> --reason <text>` for a Planning or Active one; its
  integration, then teardown, for an Integrating one; and `arc teardown <slug>` for one that has ended.
- **Before the flip** it refuses `unsupported`, naming `arc park` and `arc teardown`, which serve it until then.

### 6. The entry grammar (shared decision 9)

#### 6.1 One grammar for every entry list

The personal inbox, the project inbox, `WORKING-MEMORY`, a work unit's inbound list, an Errand's description, and a
person's Errand queue share one grammar.

- **A managed field** is ``- _Name:_ `value` ``, its backticked value marking it parsed, as today
  (`lib/session-init/managed-field.ts`). Managed fields lead an entry, grouped together and separated by a blank line
  from the bare prose descriptors that follow, as today, where a `_Disposition:_`, when present, must be the first
  descriptor (`executeBoundMark`, `lib/user-sync/inbox-writer.ts`).
- **A `WORKING-MEMORY` entry** carries its one field, the `_Remove when:_` trigger, as an italic line under its header
  (`WM_REMOVE_WHEN`, `lib/user-sync/parser.ts`).
- **One module, the entry-field module, defines each field once,** and each kind's parser admits the fields it uses
  (§ 6.3). The module reads a field in every spelling today's entries carry and writes only the managed form:
  `_WU_Target:_` in the three spellings the capture gates accept (`TARGET_LINE`, `lib/user-sync/inbox-target.ts`), since
  a missed target line would let a gate pass, and `_Shapes:_` in its bare prose form too.
- **Entries key on `_Id:_`,** the concurrency library's key, rather than the bold title `parseUserInbox` keys on today
  (`lib/user-sync/parser.ts`). The title stays the human handle; keyed on the title, a retitle would read as a removal
  and an insertion.
- **An entry's version** is a digest of its bytes and its section as the entry list splits them — exactly what the
  entry merge compares when it decides whether an entry changed (`same`, `lib/store/concurrency/entry-merge.ts`). The
  store versions whole records only, and on an entry list a write from a stale record version merges by entry rather
  than failing, so a verb that must act on one entry as its caller saw it checks this version itself. Every listing row
  carries it (§ 7.1).
- **This change owns the module, the inboxes' parsers, the drain's reads and removals, the routing verb, and the
  inbound list's and Errand description's kinds,** whose parsers admit the module's fields and whose writers the routing
  verb uses.

#### 6.2 The managed fields

- **`_Id:_`** — eight hex characters, stamped at capture or else at an entry's first persist (`stampEntryIds`,
  `lib/store/concurrency/stamp.ts`), unique within its list and re-drawn on the rare clash there.
- **`_Created:_`** (`YYYY-MM-DD`) — the date the entry entered its current list, or was last retained or adopted there.
  Capture stamps it in an inbox; the drain's retain and its owner adoption re-stamp it beside `_Hold:_`, so the reminder
  floor runs from then (`drain-inbox.md`); and the routing verb restamps it on every route except into an Errand's
  description, which keeps the date. An Errand's start moves the entry unchanged, an abandon returning it to the list it
  left keeps the date the reminder nudge reads, and one setting it in a list it never held restamps it (§ 7.5). The
  back-pressure computation reads it for the oldest pending inbound entry's age (§ 4.6). From the flip it carries the
  date a route into an inbound list once wrote on the entry's `_Routed from:_` line (§ 15).
- **`_Routed from:_`** — on inbound entries, from the flip, written only by the routing verb, on a move into an inbound
  list, and by the import for a held capture it moves into one (§ 16), and holding only the list and section the entry
  left, as its receipt names them (§ 7.3): `personal` with the router's identity, `project`, or a work unit's slug, with
  the section where the list has sections, as in `personal (andrew) § Work Unit`. An insert writes none. The date the
  entry entered the list is its `_Created:_`, the capture's context its `_Captured during:_` descriptor, which moves
  with the entry's prose, and any other account of the route the entry's prose. It is a plain prose bullet,
  `- _Routed from:_ <list> § <section>`, its value unbackticked, written directly after the managed fields and the
  `_Id:_`; the verb finds it by its label to replace or drop it. The grammar does not parse it, since no code reads it;
  the verb's form keeps it narrow. Until the flip it stays the routing method's prose line,
  `routed from <origin>, <date>`.
- **`_Remind:_` and `_Hold:_`** (`` `true` ``, or absent) — personal-inbox fields, carried unchanged through an Errand's
  description. Capture writes `_Remind:_` and the drain `_Hold:_`; session-init's nudge reads both
  (`lib/session-init/inbox-reminders.ts`) and its routable count reads `_Hold:_` (`isRoutableEntry`,
  `lib/session-init/inbox-state.ts`). `_Hold:_` is the retain escape hatch only.
- **`_WU_Target:_`** — a slug with an optional `(planned)` or `(provisional)` hint, or `TBD`, on Work Unit captures.
  Capture writes it, the drain's gate reads it as its first candidate, and the user-reference reconcile rewrites a
  former slug (`lib/user-reference-reconcile.ts`). From the flip the reconcile reads it through the module, so its
  match on the managed spelling alone (`MANAGED_TARGET`) no longer misses the other two; until then it matches as today.
  It keeps its name: entries drain, so a rename of the field would rewrite only the live ones.
- **`_Shapes:_`** — the decision or section of its target that the entry shapes, on Work Unit captures and inbound
  entries. Capture or the drain's gate writes it, and the gate and the target's owner read it. It is parsed from the
  flip, its bare prose form included, and stays a prose descriptor until then. The capture skill's entry template
  already carries it.
- **`_Cites:_`** (an entry ID), from the flip, on inbound entries and Errand descriptions — written by the routing verb
  when it carries a survivor's new content into a list the router may not edit, naming the entry that content supersedes
  (§ 7.4), and read by the list's owner beside that entry. It names an entry of its own list, since an ID is unique only
  within its list, so every move out of that list drops it, the routing verb's and the abandon's.
- **`_Disposition:_`** retires into the Errand queue at the flip (§ 7.6).
- **`_Inbox:_` and `_Rank:_`** — the Errand queue's member fields (§ 6.3).

#### 6.3 The kinds

The entry-field module admits, per kind, a shape, the sections that hold entries, and the managed fields beyond `_Id:_`
(`EntryConfig`, `KIND_MECHANISMS`, `lib/store/registry.ts`):

| Kind                      | Shape        | Sections              | Managed fields beyond `_Id:_`                                     |
| ------------------------- | ------------ | --------------------- | ----------------------------------------------------------------- |
| `personal/inbox`          | heading      | `Errand`, `Work Unit` | `_Created:_`, `_Remind:_`, `_Hold:_`, `_WU_Target:_`, `_Shapes:_` |
| `personal/working-memory` | field-header | `Memories`            | `_Remove when:_`, required                                        |
| `project-inbox/inbox`     | heading      | `Inbox`               | `_Created:_`                                                      |
| `work-item/inbound`       | heading      | `Inbound`             | `_Created:_`, `_Shapes:_`, `_Cites:_`                             |
| `work-item/description`   | heading      | `Description`         | the personal inbox's fields, whole, and `_Cites:_`                |
| `personal/errand-queue`   | heading      | `Queue`               | `_Inbox:_`, `_Rank:_`                                             |

- **The inbound list.** Its entries carry the `_Routed from:_` line the routing verb writes (§ 6.2). The routing verb
  drops a moved entry's fields this kind does not admit, since a routed entry's home is settled.
- **An Errand's description** admits the personal capture's fields whole, so an Errand's start, and an abandon
  returning an entry to the list it left, move it unchanged; a survivor's new content enters it as a new entry whose
  `_Cites:_` carries the original's ID (§ 7.4).
- **The Errand queue.** A member's `_Id:_` is the referenced entry's ID, so two appends of one entry merge as one
  member, and `_Inbox:_`, `personal` or `project`, qualifies it. Since members merge by ID, `arc errand queue set` refuses
  a set naming both entries of an ID both inboxes hold, a rare case, naming both. `_Rank:_` is the member's rank key,
  which orders the queue in place of file position, so the run order merges by entry. `arc errand queue set` sets the
  queue whole but writes rank keys only for the members it adds or moves, through the concurrency library's placement,
  which re-keys tied successors in the same write (`placeRankedStub`, `lib/store/concurrency/rank.ts`), so two sets
  clash only on a member both wrote, a tie's re-keyed successors included. Its entries are references, never items, each
  heading carrying the referenced entry's title for legibility.

#### 6.4 The ID's place in an entry

`stampEntryIds` places a heading entry's `_Id:_` after its last bullet of the form `- _Key:_` whose key holds no
underscore, so an italic-key prose descriptor after the managed fields draws the ID away from them, splitting the group,
and `_WU_Target:_` is skipped. This change amends its heading arm to place the ID after the last of the kind's managed
fields, or directly under the heading when the entry has none, matching each field by name from the entry-field
module's list passed with the entry config, since a match on the managed shape would also catch prose descriptors that
open with a backticked token. A field-header entry keeps its ID after its `_Remove when:_` trigger, placed after the
trigger's last line, where today's arm places it after the trigger's first line and so splits a wrapped trigger. Each
placement has a test.

#### 6.5 `WORKING-MEMORY` headers fail loudly

`lib/user-sync/parser.ts` recognizes an entry header only as one line matching `WM_HEADER` (`^\*\*.+:\*\*\s*$`), so a
header wrapped past the line limit is silently folded into the entry before it. From the flip, with its parser in its
registry slot, the `personal/working-memory` kind requires the documented entry shape (`strategy-session-operations.md`
§ Working Memory) — a one-line header (`WM_HEADER`), its `_Remove when:_` trigger the next non-blank line — and rejects
a wrapped or colon-less header loudly: a trigger whose nearest non-blank line above is not such a header refuses, naming
that line and the shape, while bold-led prose elsewhere in an entry's body is untouched. This tightens today's parser,
which accepts a trigger anywhere in an entry (`parseWorkingMemory`); a malformed header with no trigger at all still
folds into the entry before it. The write refuses before the concurrency library's entry splitter (`isEntryHeader`,
`lib/store/concurrency/entries.ts`), which keeps the same one-line rule, could fold it into the entry before it; a test
covers both. The slot stays empty until this change moves the file's readers and writers off `lib/user-sync/parser.ts`
(`createKindRegistry`); until then the file parses as today.

#### 6.6 Declared before the import

`work-item/inbound`, `work-item/description`, and `personal/errand-queue` are the kinds the registry leaves unhomed
(`entry(unhomed)`, `lib/store/registry.ts`). This change declares their entry configs and parsers. Until a kind is
declared, the ref backend refuses its writes, the record kinds' held-entries rules admit, and moving state onto the ref
store names the kind and refuses (§ 16), so the flip waits on all three.

### 7. Listing and routing

#### 7.1 One listing, `arc inbox`

Today's listing verb is `arc user inbox-list` (`runUserInboxList`, `commands/user/inbox-list.ts`, over
`listInboxEntriesNamingTarget`, `lib/user-sync/inbox-target.ts`), which requires `--target` and whose `clear`, `named`,
and `refused` result gates `create-spec.md`, `activate-work-unit.md`, and `verify-work-unit.md`. From the flip
`arc inbox <list>` replaces it, `<list>` being `personal`, `project`, or a work item's slug — a work unit's inbound list
or an Errand's description — so every list the routing verb takes from has a reader. `personal` and `project` always
name the inboxes; a work item with either slug is named by its UID, here and in `arc route`.

- **Each row** carries the entry's `_Id:_` and version (§ 6.1), and an inbox row its survivor reading (§ 7.4).
- **`--target <slug>`** filters an inbox to the entries naming that target and keeps today's `clear`, `named`, and
  `refused` result, on which the three capture gates branch; the gates' calls move to it in the flip's rewrite.
- **A work unit's inbound list** also carries its pending count and oldest age (§ 4.6).
- **One listing serves every reader:** the drain, the exit gates, session start, and the routing verb's callers.
- **Before the flip** `arc inbox` refuses `unsupported`, naming `arc user inbox-list --target`, which serves as today.

#### 7.2 The routing verb, `arc route`

`arc route <entry-id> --from <list> --version <version> --to <destination>` moves an existing entry, and
`arc route --to <destination>`, with the entry on standard input, inserts a new one — route-now's door. A list or
destination is `personal` or `project`, an inbox, or a slug: a work unit's, whose inbound list takes the entry, or an
Errand's, whose description does. `--section <name>` names the destination's section, required where its kind has more
than one — the personal inbox's `Errand` or `Work Unit` — and refused elsewhere, since the router decides an entry's
fate and the verb infers none.

- **The version** is the entry's version (§ 6.1) as the caller read it, which the listing reports for every list
  (§ 7.1). The verb reads the source list and refuses when the entry's current version differs — it changed since the
  caller read it — naming the version it found and leaving the entry in place, as the drain's removal does (§ 7.7).
  Otherwise it writes the batch at the source record's version as it read it, and an edit landing between that read and
  the write survives the removal through the entry merge, which takes out only the bytes the verb observed, and stays in
  the source: as a survivor where the source is an inbox (§ 7.4), and otherwise as an ordinary entry its list's owner
  disposes of (§ 7.3).
- **One batch:** the destination's insert, the source's removal, and its routing receipts (§ 7.3). It reports the
  entry's ID and destination, the durable carrier an out-of-band message points at.
- **Who writes.** Anyone inserts; only a started work unit's owner removes an entry from its list, and anyone a backlog
  stub's. The verb refuses a removal from a started work unit's inbound list by anyone but its owner, naming the owner;
  the host cannot enforce the rule against a write made outside the verb, as it enforces no ARC writer rule.
- **An ID the destination already holds.** An insert whose ID the destination holds writes nothing and reports that
  home when the held entry's receipt shows it came from the same inbox and the source no longer holds it, as when two
  drains route one entry the same way; and otherwise refuses, naming both entries, since an ID is unique only within its
  list. Carrying a survivor is the exception (§ 7.4).
- **Fields.** It drops the managed fields the destination's kind does not admit, an Errand's description admitting the
  capture's fields whole, and `_Cites:_` on every move, and restamps `_Created:_` on every route except into a
  description (§ 6.2). On a move into an inbound list it writes the entry's `_Routed from:_`, replacing any it carried,
  and on a move into any other kind drops it (§ 6.2).
- **Refusals by destination.** It refuses a work unit that takes nothing — Integrating or completed — naming a follow-on
  or `arc reopen` (§ 7.8); a work unit retired by abandonment or a cut, naming the inbox and, for a cut, the successors
  its lineage record names; and an ended Errand, closed or abandoned, naming the inbox, since a survivor of finished work
  is ordinary work.
- **Before the flip** it refuses `unsupported`, naming the routing method's until-the-flip binding
  (`route-discovered-work`, "Binding: carrying out outcomes"), hold-and-route, since no workflow calls it until the
  flip's rewrite.

#### 7.3 Routing receipts

- **Every move into or out of an inbox writes one,** from the flip, whichever verb makes it: `arc route`, an insert into
  an inbox included, an Errand's start, `arc errand link`, and an Errand's abandon. The receipt kinds admit today only
  `route` among the moving verbs (`writerVerbs`, `KIND_MECHANISMS`), so with the declarations (§ 6.6) they also admit
  the Errand's start, link, and abandon.
- **Where it goes:** to the ref of each inbox the move leaves or enters — the person's own ref for their personal
  inbox, which only they write, and the project inbox's for the project inbox — so a move between the two writes one to
  each, in the batch that already writes both refs. A move that leaves and enters no inbox — between a work unit's
  inbound list and an Errand's description — writes none, so an edit racing it survives in the list it left as an
  ordinary entry, which that list's owner disposes of.
- **What it holds:** the entry's ID, its destination, the list and section the move left, and the time of the move
  rather than only its date (§ 15). A receipt is write-once, never edited, and never projected.
- **An entry's latest receipt** is the latest of those naming its ID whose source or destination is the list its reader
  reads or names — the inbox a listing row or a start names, the description an abandon empties — since an ID is unique
  only within its list. Every reader of it — the listing's survivor rows, the drain and its carry, a start's refusal,
  and the abandon — reads the person's receipts and the project inbox's together, and the time decides the latest
  across the two.

#### 7.4 Survivors

- **An inbox row is a survivor** when its latest receipt moved it out of that inbox: a removal takes out only the
  version it observed, so an edit racing it survives. The row carries the home that receipt names, derived and never
  stored, so the drain carries the survivor's new content there and no stored line can clash with the person's edit.
- **An entry an abandon or a route returned** reads by its return's receipt, so it lists as unstarted work.
- **A row whose latest receipt names a home that now takes nothing** — an ended Errand, a work unit Integrating or
  completed, or one retired by abandonment or a cut, the homes the routing verb refuses — lists as ordinary work, not a
  survivor, since a survivor of finished work is ordinary work.
- **Session start reports the person's survivors** in the `inboxState` slot, naming `arc inbox personal` in its text,
  whose rows name each one's home, since carrying a survivor takes the drain's decisions (§ 4.3). The projected file
  shows nothing.
- **Carrying a survivor.** The drain carries it through the move form, with the survivor's ID and version and the home
  its listing row carries. Finding the ID already there from the same inbox while the source still holds it, the verb
  carries the survivor's content rather than moving the entry:
    - where the router may edit the held entry — in an inbox, a backlog stub's inbound list, or the router's own work
      unit's — it replaces that entry's title and prose, keeping its managed fields and `_Routed from:_` line, as a write
      at the destination record's version as the verb read it, so an edit to the held entry landing meanwhile meets the
      replacement as a same-entry clash, kept as a conflict record with both sides, rather than being overwritten;
    - otherwise — into another person's started work unit, or an open Errand — it inserts the content as a new entry
      whose `_Cites:_` carries the original's ID.

  The same batch removes the survivor at its version and writes a receipt, so a crash leaves the survivor or its carry,
  never both, and a carried survivor no longer lists.

#### 7.5 Where an abandon returns an entry

From the flip an Errand's abandon returns each entry of its description to the list its latest receipt says it left
when that is the project inbox or the abandoner's own personal inbox, and every other entry — from a work unit's inbound
list, another Errand's description, or another person's personal inbox, whose receipt it cannot read — to the
abandoner's personal inbox, never into a work unit's list, since a work unit past planning takes nothing by default
(§ 7.8) and only a person writes their own inbox. An entry minted when the Errand opened returns to its person's inbox.

- **Returned to the list it left,** an entry takes the section the receipt records and keeps its `_Created:_`.
- **Set in a list it never held,** it lands in `Errand`, since it was routed to an Errand, with `_Created:_` restamped,
  since it entered a new list, and its `_Cites:_` dropped (§ 6.2).
- **An abandon whose entry another open Errand holds** returns nothing: the description stays with the abandoned Errand,
  and the abandon names the Errand that keeps the entry. Each returned entry gets a receipt, after which it reads as
  unstarted work.

This amends the contract's return to "the inbox it came from", which assumed a description fills only from an inbox, as
`arc route` and a route out of an executing work unit into an Errand no longer do (§ 15).

#### 7.6 Starting an Errand, and the Errand queue

- **Starting an Errand moves its entry,** from the flip. A full-protection Errand started from an inbox entry is a
  routing whose destination is the new Errand: one batch creates the work item, makes the entry its description, removes
  the entry at the version read (§ 6.1), drops the entry from the person's queue, and writes the routing receipt, and
  the Errand's origin names the inbox and the entry's ID. A start fetches first when online and refuses an entry that is
  gone, naming where its latest receipt says it went, or one whose ID an open Errand holds; an entry whose Errand
  already closed is reported rather than refused, since a surviving edit can carry new work.
  `arc errand link --from-inbox` moves a capture into an Errand opened from text the same way, beside the entry minted
  at open. Until the flip an Errand starts only from its person's own inbox and the entry stays there until close, as
  today.
- **The Errand queue.** From the flip each person's queue is an ordered list of references to entries in either inbox,
  by ID, at identity scope — never projected, read through `arc`, and merged by entry (§ 6.3) — replacing today's
  execute-bound marks and their file order (`listExecuteBoundInboxEntries`, `lib/user-sync/inbox-writer.ts`).
  `arc errand queue set` replaces `arc user inbox-mark-execute-bound`, taking entry IDs, each with its inbox, where that
  verb takes titles, and `arc errand queue` shows the queue; the drain's execute-now disposition appends to it. It holds
  references, never items, and claims nothing.
- **The next offer** (`resolveExecutionNextOffer`, `lib/user-sync/execution-offer.ts`), at startup, after a close, and
  in `arc errand next` (`handleErrandNext`, `handlers/errand.ts`), takes the queue's first entry a start would accept,
  drops any it would refuse, and skips a member in conflict, reporting each. Abandoning an Errand does not put its entry
  back in the queue.
- **Until the flip** the queue stays today's marks in the person's own inbox, set by today's verb, and `arc errand queue`
  and `arc errand queue set` refuse `unsupported`, naming `arc user inbox-mark-execute-bound`.

#### 7.7 Removal by ID and version

- **The drain's removal** takes the entry's `_Id:_` and version (§ 6.1) from the flip, removing only that version and
  leaving an entry edited since in place and reporting it; until then it removes by title. Removal stays idempotent: a
  no-op that reports when the entry is already gone, since several backstops may replay it.
- **The title-matched removals** of `arc errand close` and `arc user inbox-remove`, both through
  `removeCurrentInboxEntry` (`commands/user/inbox-mutation.ts`), and Errand promotion's digest-checked removal
  (`runUserInboxMutation`, `handlers/errand.ts`) repoint onto the ID with the parser from the flip, and the removals
  onto the entry's version at its compare-and-swap boundary once the notes lock retires. From the flip
  `arc errand open --from-inbox` and `arc errand link --from-inbox` take `<personal|project>:<id>`, since an ID is
  unique only within its inbox, and `arc user inbox-remove` takes `--id <id> --version <version>`; each refuses a title
  from any of today's sources — the `--from-inbox` title, `--inbox-title-file`, `--inbox-entry-file`, and
  `inbox-remove`'s title positional (`resolveInboxEntryOperand`, `lib/inbox-entry-operand.ts`).
- **Under partial protection** an Errand has no portable record or description, so its origin entry stays in the inbox
  until close removes that exact ID at its observed version, and a partial abandon clears the mark and keeps the entry.

#### 7.8 Where a work unit takes entries

- **A Planning work unit** takes routed entries as today.
- **An Active one is no default home.** Routing proposes a route out, and an entry its owner admits lands as a spec
  amendment or new tasks, which the owner writes, held in its inbound list for the owner when the owner is not at the
  door (§ 16).
- **An Integrating or completed one takes nothing,** so a late concern goes to a follow-on, or the owner reopens an
  Integrating work unit (`arc reopen`).
- **Nothing stays held past an exit.** From the flip the record kinds' write check refuses moving a work unit to
  Active, to Integrating (`arc publish`), or to the archive, and refuses retiring it by a cut or an abandonment, while
  its inbound list holds an entry, naming each (`meta.inbound-held`, `lineage.inbound-held`); those rules read this
  change's inbound kind and admit until it is declared (§ 6.6). Before a cut the owner folds each held entry into the
  origin's draft or spec, whichever the cut copies to every member, or re-routes or dismisses it; before an abandonment,
  re-routes or dismisses it. Until the flip, activation's and verification's capture gates
  (`arc user inbox-list --target`) carry the property.

#### 7.9 Hold-and-route's drain side

Until the flip, routing keeps today's hold-and-route: the routing method's until-the-flip binding, the backlog draft's
buffer section, owner adoption's `_Hold:_` re-stamp, and route-now handing off from capture to an Errand. From the flip
the drain routes straight into an inbound list through `arc route`; this change's obligation to that path is what its
verbs return — the listing's rows, the routing verb's report, and the receipts — while the binding's text and its
hand-off sites change in the flip's rewrite.

### 8. Errands

The Errand runtimes — open, close, abandon, leave, link, and promote, under `lib/errand/` — and
`arc errand materialize`'s read of the Errand it materializes (`handleErrandMaterialize`, `handlers/errand.ts`) read and
write the Errand record and claims through the store (`read`, `list`, `write`, `batch`) rather than calling the identity
transaction (`transactTransientIdentities`, `lib/errand/identity-transaction.ts`) themselves.

- **The transition rules stay the runtimes'.** The transforms that authorize each transition (`ordinaryErrandTransform`
  and its retirement rules, `lib/errand/identity-transitions.ts`), which run inside the transaction's callback today,
  become each runtime's computation over the record it read, with no change to what they admit or refuse; they become
  no write check.
- **The expected version replaces the callback's freshness.** Each runtime writes the record it computed with the
  version it read; when the store refuses a stale version, the runtime reads again and recomputes, within the bound the
  transaction re-runs its transform today (`MAX_RECONCILE_ATTEMPTS`), and reports the exhausted retries as the
  transaction does.
- **Nothing observable changes before the flip.** The in-repo implementation serves those writes through the same
  transaction, publishing when a remote is configured (`batchTransient`, `lib/store/in-repo/transient-write.ts`).

#### 8.1 The close's landing commit and close time

From the flip the close (`lib/errand/close-runtime.ts`) captures the Errand's landing commit on its record, naming its
repository by the project ID, as every commit capture does (§ 16). The close write stamps the record's `updatedAt` as
the close time, by which a listing of closed Errands orders them. Today the close deletes the record from the
transient-identity ref (`ordinaryErrandTransform`'s `retire` arm, `lib/errand/identity-transitions.ts`), and the last
write to stamp `updatedAt` is the await-merge write. Until the flip the close captures nothing and keeps today's
deletion.

#### 8.2 The Errand's branch link

From the flip `arc errand open` (`lib/errand/open-runtime.ts`), under full protection, where it cuts the Errand's branch
(`chore/<slug>`, `lib/errand/open.ts`) — in place by `git checkout -b` (`lib/locus/provisioning-runtime.ts`) or in a
spawned worktree — writes the Errand's branch link recorded `created` and, as every branch link records, its floor: the
commit it cut the branch from (§ 11, § 16). Under partial protection it cuts no branch and writes no link, as an Errand
there has no portable record (§ 7.7). Until the flip no branch link is stored.

#### 8.3 Promotion

Promotion's one write and its branch are the transition-write-path change's (§ 16): from the flip, at either floor, it
cuts the work branch `<type>/<name>` (`--type`, default `feat`) at the Errand's tip, switches the checkout onto it, and
links it beside the Errand's branch, recorded `created` with the Errand link's floor. At the scale floor the work unit
is Active at once, so the Errand's commits stay in the close's default capture for the tasks it backfills, which
promotion's `Next Action` asks for (`metaOverrides`, `lib/errand/promote-runtime.ts`); a derivation-floor promotion's
work unit, in Planning, meets them in its activation's report, since activation moves the floor to the branch's tip
(§ 16). Today a derivation-floor promotion renames the Errand branch to `plan/<name>` (`promotionBranch`).

This change moves the promotion runtime (`promoteOrdinaryErrandAtRuntime`) onto that write, with its marker settlement
(`settlePromotedOccupancy`): on a spawned checkout it converts the transient marker (`convertSpawnedMarker`), as today;
on the primary, from the flip, it writes an anchored work-unit marker in place of the transient one (§ 2.6); and either
way it runs the exclusivity check first (§ 2.4). Until the flip the runtime keeps today's settlement, commit included.

### 9. Handoff and continuity

#### 9.1 Session context through `arc handoff write`

From the flip handoff's write is a verb, `arc handoff write`. Its request, a versioned JSON document on standard input
or in a file, carries only what the session decides: the `## Session Context` body, whole, `Next Action`, and an
optional `Session Type`. The verb computes the two anchors itself — `State at Handoff`, the store's `version()` as it
read it before its write, the state the handoff saw, or null where the store holds none; and `Commit at Handoff`, the
checkout's `HEAD` — and writes all five in one write of the current work unit's meta (§ 2.2) through the meta's writers
(`writeMetaStateAtHandoff`, `writeMetaCommitAtHandoff`, `writeMetaSessionType`, `writeMetaNextAction`,
`lib/store/kinds/meta/bullet-writers.ts`; `writeMetaSessionContext`, `lib/store/kinds/meta/section-writer.ts`).

- **Its refusals.** The section writer throws on a body line that would end the section, which the verb reports as its
  refusal, naming the line. On a checkout that holds no work unit it refuses, since a handoff between work units writes
  no session context (§ 13).
- **It pushes nothing, and maintains the store.** Handoff's push stays its sync, under the sync interlock as today.
  After its write the verb calls the store's `maintain()` and reports the growth figures past their bounds, whether or
  not a sync follows (§ 9.3).
- **`arc schema` serves its request's schema,** and the verb is a subcommand of a new `arc handoff` group.
- **The spawn's scaffold,** from the flip, creates the meta through the creation writer (`renderMetaFile`), in the
  transition-write-path change's arm (§ 2.8, § 16).
- **Until the flip** the verb refuses `unsupported`, naming the `SESSION-NOTES` write that serves until then; handoff
  writes `SESSION-NOTES` as today, and the verbs that write `Next Task`, `Last Completed`, and `Blockers` keep writing
  them.

#### 9.2 State continuity across clones

Restating at handoff (`lib/handoff/restate-candidates.ts`) and the recovery audit (`lib/recover/audit.ts`) read state as
of a state version, or through `changes` from one, beside the retained code-head baseline and never in place of it,
since code identity, task progress, and preservation still validate against Git.

- **A missing history ref.** On a clone lacking an ended item's history ref, a read as of a state version refuses with
  the store's unresolvable-state-version code, naming each ref it lacks; the verb pulls them by name and retries once,
  with no stop, so a person meets the refusal only when that pull fails (§ 16).
- **Another person's anchor.** Restating from another person's anchor, when a work unit changes hands, restricts
  `changes` to project scope, since `changes` between two people's states would carry the newer one's identity history
  whole.
- **An anchor that no longer resolves.** A compaction seed whose state version no longer resolves, after Git's expiry,
  is rebuilt from the current state. Handoff's own anchor always resolves where it is written, since `arc handoff write`
  takes it from the `version()` it read (§ 9.1).
- **The first handoff after the flip** finds no `State at Handoff`, since moving state onto the ref store writes none,
  and takes restating's existing baseline-unknown path. A `Commit at Handoff` that a later history rewrite left
  unreachable takes the same path for code commits, while the state anchor still serves state, since nothing keys
  state to a commit's reachability.

#### 9.3 Growth and contention tripwires

From the flip a tripwire report, which this change builds, takes the store's `maintain()` measurements or a push's retry
count and time waited, and returns only the figures past these bounds, its text precomposed. `arc handoff write` runs it
over the `maintain()` it calls after its write, so every handoff of a work unit maintains the store and reports growth
whatever its sync interlock; `arc sync`, handoff's push, runs it over its push's figures once the cutover rewires the
sync onto the contract (§ 16):

- **Growth:** a never-retiring ref — the person's `personal` or `claims` ref, or the project's `project/inbox` or
  `project/registry` — past 2,000 commits or 50 MB on disk.
- **Contention:** the push past one retry or 10 s waited.

A figure past its bound names the deferred capability its tripwire guards — scheduled ref rotation for growth, and for
contention a service backend, per-record authorization, or very high write parallelism — for the project's maintainer to
take up. A handoff between work units, or an Errand's, writes no session context and calls no `maintain()`. A store with
a remote is still maintained by each pull's fetch, but a local-only store whose person never hands off a work unit goes
unmaintained until one does, a residual the growth tripwire cannot report. The bounds are constants beside the report,
with no configuration key, since the signal is advisory and guards the store's scale rather than a team's preference.
Nothing calls the report before the flip, when `arc handoff write` starts and the cutover rewires `arc sync`; over the
in-repo implementation, which reports no measurements and no retries, it would show nothing.

The bounds' basis: the notes-compaction advisory nudges past 2,000 commits (`COMPACTION_ADVISORY_HISTORY_THRESHOLD`,
`lib/user-sync/compaction-retention.ts`), the nearest measured analogue — this repository's one personal notes ref held
739 commits after fourteen weeks, about three a day over its last month, in 20 MB with a whole manifest per note, where
the store keeps one blob per changed file; and the storage contract's design expects one retry to settle a collision on
a shared ref.

### 10. Identity setup

#### 10.1 First records only when absent

`arc user add` (`commands/user/add.ts`) and, for `arc init` and `arc join`, `runPostInitSetup` (`lib/setup.ts`) write
the personal inbox's and `WORKING-MEMORY`'s seed files (`CROSS_WU_INSTANCE_FILES`) unconditionally today, overwriting
what is there. From the flip each creates an identity's personal records through the store only where they are absent.

#### 10.2 An identity already in use

From the flip, when one of the three finds the identity's records already in the store, it says so and asks the person
to confirm the identity is theirs; a run that cannot ask reports it in its result. It warns and never refuses, since a
slug cannot tell the same person's second machine from a second person who chose the same name, and it misses two people
who both set up before either syncs. Until the flip setup runs as today.

#### 10.3 Off the user-surfaces resolver

This change moves its own callers of the user-surfaces resolver (`resolveUserSurfaceResolver`,
`createUserSurfaceResolver`, `lib/user-surfaces.ts`) onto the store's personal records: `commands/user/add.ts`,
`commands/user/inbox-mutation.ts`, `handlers/derived-locus-state-probe.ts`, `handlers/errand.ts`, `handlers/recover.ts`,
`handlers/status/session-context.ts`, `handlers/status/session-evidence.ts`, and `handlers/user.ts` outside its
notes-sync commands. Over the in-repo implementation, which itself imports the resolver
(`lib/store/in-repo/personal-paths.ts`), nothing observable changes. The resolver and `lib/user-surface-migration.ts`
stay as the in-repo arm until the deletion pass, and teardown keeps merging a linked worktree's copy up through the
migration until the flip.

### 11. Commits not yet closed

From the flip a task's commits are captured by the task close verb (§ 16). A work branch's **floor** is the commit its
branch link records, at or below which every commit is captured or is no task's work: activation, an Errand's open,
promotion, and the import set it where they write the link, and closes move it up (§ 16).

- **The listing.** While an Active work unit has open tasks — a Planning one's wait for activation, which cuts or links
  its branch (§ 16) — the derived frame's work-unit context carries the set the close's default capture takes, computed
  by the same code: the non-merge commits reachable from `HEAD` and from none of the floor, base, and base's
  remote-tracking ref, less every commit already captured for the work item, a difference by commit. Session start
  (`derivedLocusState`) and recovery both list them beside the task cursor with `arc task close` as the typed action,
  run in the work unit's checkout (§ 4.3). The listing and the close therefore agree: a base merge adds none, an adopted
  branch's earlier commits stay out, a promoted Errand's commits stay in, no captured commit lists again, and the floor
  that moving state onto the ref store records stands for every commit before the move.
- **No linked branch out.** The close reads the branch link whose ref the checkout has out and refuses on a detached
  checkout or one with no linked branch out, so the listing there reports that refusal, naming the work branch to
  switch to, rather than listing.
- **A floor not in `HEAD`'s history.** The listing reports the case the close tells apart, with the close's repair, in
  place of the set, the cases and repairs being the close's (§ 16):
    - **Behind:** the work branch's remote-tracking ref holds the floor and `HEAD` is an ancestor of that ref, as for a
      checkout kept through a handover's round trip; `git pull` of the work branch fast-forwards it to the ref, which
      holds the floor.
    - **Diverged:** the remote-tracking ref holds the floor and `HEAD` holds commits it lacks. Only the agent can tell a
      checkout that worked while the branch moved on elsewhere from one that rewrote commits it had pushed, so the
      listing reports the commits since base that no task captured and names both repairs: where nothing here was
      rewritten, a merge of the work branch's remote (`git pull --no-rebase`) and the close again; where this checkout
      rewrote pushed commits, the lost floor's explicit close.
    - **Missing:** this clone lacks the floor's commit, as a checkout materialized before that commit was pushed does;
      the repair is `git fetch`, and where that does not bring it in, a push of the work branch from the checkout that
      holds it, or, where no checkout holds it any longer, the lost floor's explicit close. The listing reports the
      commits since base that no task captured, which need no floor, for that close to pick from.
    - **Lost:** the commit is here and reachable from neither `HEAD` nor the remote-tracking ref, as after an amend or a
      rebase ARC did not make with no remote-tracking copy left. The listing reports the commits since base that no task
      captured, and its text names the repair, since the agent picks the commits: where the lost floor is a commit a
      closed task captured, as after an amend of the last closed increment, that task's re-close,
      `arc task close <id> --commit <sha>…`; otherwise an explicit close of the increment's own commits among those
      listed, `arc task close <ids> --commit <sha>…`. Either moves the floor to the named commit every other named
      commit is an ancestor of.
- **A paused work unit.** The close refuses on one, naming `arc resume`, so the listing there takes `arc resume <slug>`
  as its action, its text naming `arc task close` to follow (§ 4.3).
- **Recovery lists them beside a matching cursor** rather than stopping: a compaction between a commit and its close
  leaves the cursor's task open with its commit landed, which the cursor comparison alone reads as unchanged, and the
  close is the remedy.
- **Until the flip** tasks are ticked by hand and nothing is listed.

### 12. Removing and moving checkouts, and the orphan sweep

#### 12.1 Onto the removal function and check

The transition-write-path change builds one removal function for every removal ARC runs of a work unit's or Errand's
checkout, and one removal check that decides on its own whether a checkout can be removed, returning `removable`,
`missing`, or `refused` as `dirty`, `persist-would-refuse`, `unobservable`, or `locked` (§ 16).

- **The Errand's exits** through `lib/errand/terminal-occupancy.ts` move onto the function. It runs inside each exit's
  own serialization and authorization, and the exits keep their preconditions: the marker generation, the branch and
  head match, the self-teardown locus hop, and the user-surface merge-up. The primary, which no exit removes, keeps
  `git status` where `settleTerminalOccupancy` inspects it.
- **The removal decisions** move onto the check: the stale-worktree sweep (`lib/session-init/stale-worktree-sweep.ts`),
  branch-gone recovery (`lib/session-init/branch-gone-recovery.ts`), the residue sweep
  (`lib/session-init/lifecycle-residue-sweep.ts`), and `arc errand leave`'s authorization (`authorizePreservation`,
  `lib/errand/leave-runtime.ts`), which inspects the Errand's checkout before recording its paused or awaiting-merge
  state and removes it only afterward.
- **Each outcome is reported.** A check that cannot observe the checkout grants no removal, as today, but reports
  `unobservable`, `locked`, or `missing` where today a failed status read folds into not clean. These outcomes land
  before the flip (§ 1.4).
- **Branch-gone's candidate action** (`determineCandidateAction`, `lib/session-init/branch-gone-cascade.ts`) maps the
  check's outcomes: `removable` stays removable; `dirty`, `persist-would-refuse`, and `locked` with its folder present
  make the checkout a switch target, a live checkout the check keeps; and `unobservable` reads `external`. A candidate
  whose folder is missing — `missing`, or `locked` with no folder — is never a switch target, the folderless roster
  entry that today short-circuits to one (`buildWorktreeCandidate`, `lib/session-init/branch-gone-recovery.ts`)
  included. The cascade (`resolveCascade`) drops it from the worktree tier's destinations but keeps its branch out of
  the recent-branch tier, since Git refuses to switch to a branch a registration holds until it is pruned, and
  `recovery` reports it beside its outcome (§ 4.3): `git worktree prune` for `missing`, whose registration carries no
  lock until the projection's own lock lands (§ 16), and `git worktree unlock <path>` then `git worktree prune` as text
  for `locked`, the lock being its owner's. With no marker it has no name for `arc teardown`.
- **`lib/locus/primary-safety.ts`** decides only whether the primary may host a transient claim, removes no checkout,
  and stays as today.

#### 12.2 The removal prompts carry their command

The stale-worktree sweep's report of a removable worktree carries only its path and branch, and branch-gone recovery's
removable candidate is prompted with no command (`inferBranchGoneRecovery`, `lib/session-init/recommended-action.ts`).
Each carries an `arc teardown <name>` argv, as the residue sweep's report already does (`teardown.argv`), and the sweep
reports a missing folder whose registration is locked with the unlock-and-prune remedy as text, since the lock is its
owner's. These land before the flip (§ 1.4); session-init's text that prints them changes in the flip's rewrite.

#### 12.3 Moving a locked checkout

A locked worktree refuses `git worktree move` with no `-f` or one, and `git worktree move -f -f` moves it with its lock
and reason intact. The residue sweep's rename-move remedy (`projectRenameMoveRemedy`), which session-init has the agent
run as given, takes the doubled-force form before the flip as after. Its one difference before any lock exists is an
accepted edge: a move may land on a path registered to a missing or locked worktree, which a plain move refuses.

#### 12.4 The orphan-branch sweep

The sweep (`runOrphanBranchSweep`, `lib/session-init/orphan-branch-sweep.ts`) reports each local branch whose upstream
is gone with two verdicts: whether its work unit shipped, and `merged`, true when every commit landed in base by patch
identity (`git cherry`, through `isLandedInBase`, or `isLandedInBaseStrict` on the local-only read,
`lib/git/branch-containment.ts`). Session-init's text offers `arc teardown <name>` for a shipped work unit's branch and
`git branch -d <name>` for a merged one.

- **The rebuilt slot carries the action,** before the flip: `arc teardown <name>` for a shipped work unit's branch, and
  for a merged one `git branch -D <name>`, since `git branch -d` tests reachability and so refuses a rebased branch, or
  one squash-merged from a single commit, which the `merged` verdict admits. Session-init's offer text keeps `-d` until
  the flip's rewrite dispatches the slot's action.
- **From the flip a branch linked `adopted`** is never offered `arc teardown`, since teardown never deletes an adopted
  branch and the offer would repeat at every session start. Where its `merged` verdict holds, the slot offers
  `git branch -D <name>`; otherwise it reports the branch kept, its owner's, naming `git branch -D <name>` in its text,
  the step an abandon's and a teardown's reports name (§ 16).
- **Until the flip** no link carries the record, so the sweep reads every branch as one ARC created.

### 13. Refusals name their remedy

Every refusal and report this design adds carries the command that repairs it: a typed action beside its text where
running it as given repairs the condition, and the command named in its text, with its arguments, where the repair
needs the agent's or the owner's input (`DEV-RULES.PROJECT`, "Recovery-complete refusals"). § 4.3 lists the slots'
actions; the verbs' refusals are these:

| Refusal or report                                                                                                                          | Repair it names                                                                                                                                                 | Form   |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A verb this change adds, run before the flip (§ 5, § 7, § 9.1)                                                                             | what serves until then, per § 14                                                                                                                                | text   |
| `arc user open` from the flip (§ 2.8)                                                                                                      | the meta's session context, which `arc handoff write` writes                                                                                                    | text   |
| `arc route`: the source entry changed since the version read (§ 7.2)                                                                       | `arc inbox <list>`, then the route at the version it reports                                                                                                    | text   |
| `arc route`: an ID the destination holds from elsewhere (§ 7.2)                                                                            | both entries; the insert form without the `_Id:_`, which stamps a fresh one, then the source's removal                                                          | text   |
| `arc route` into the personal inbox with no `--section` (§ 7.2)                                                                            | `--section Errand` or `--section "Work Unit"`                                                                                                                   | text   |
| `arc route` removing from a started work unit's inbound list, not its owner (§ 7.2)                                                        | the owner, who removes it; the insert form for a copy                                                                                                           | text   |
| `arc route` into a work unit Integrating or completed (§ 7.2)                                                                              | a follow-on work unit, or `arc reopen <slug>` for an Integrating one                                                                                            | text   |
| `arc route` into a work unit retired by abandonment or a cut (§ 7.2)                                                                       | the inbox, and for a cut the successors its lineage record names                                                                                                | text   |
| `arc route` into an ended Errand (§ 7.2)                                                                                                   | the inbox                                                                                                                                                       | text   |
| A title operand from the flip — `--from-inbox <title>`, `--inbox-title-file`, `--inbox-entry-file`, or `inbox-remove`'s positional (§ 7.7) | the ID form, `<personal\|project>:<id>` or `--id <id> --version <version>`, its ID and version read from `arc inbox <list>`                                     | text   |
| An Errand's start from an entry that is gone (§ 7.6)                                                                                       | where its latest receipt says it went                                                                                                                           | text   |
| An Errand's start from an entry an open Errand holds (§ 7.6)                                                                               | that Errand, to resume in its own checkout                                                                                                                      | text   |
| `arc errand queue set` naming both entries of one ID (§ 6.3)                                                                               | both entries, to queue one now and the other once the first starts                                                                                              | text   |
| A marker write while another checkout's marker names the work unit                                                                         | that checkout (§ 2.4)                                                                                                                                           | text   |
| `arc locus release` on a work unit this identity owns, not paused (§ 5)                                                                    | `arc pause <slug> --reason <text>` for a Planning or Active one; its integration, then teardown, for an Integrating one; `arc teardown <slug>` for an ended one | text   |
| `arc locus release` on a checkout holding a transient role (§ 5)                                                                           | the role's exits, as handoff's locus plan names them                                                                                                            | text   |
| `arc handoff write` where the checkout holds no work unit (§ 9.1)                                                                          | the work unit's checkout; a handoff between work units writes no session context                                                                                | text   |
| `arc handoff write`: a body line that would end the section (§ 9.1)                                                                        | that line, to rewrite                                                                                                                                           | text   |
| A wrapped or colon-less `WORKING-MEMORY` header (§ 6.5)                                                                                    | the documented shape: the header on one line ending `:**`, its trigger the next non-blank line                                                                  | text   |
| A remote the store needs designated (§ 4.8)                                                                                                | the store's remedy argv                                                                                                                                         | typed  |
| An identity already in use (§ 10.2)                                                                                                        | the person's confirmation that the identity is theirs                                                                                                           | prompt |

### 14. Names

| Name                                | Form                                                                                                                                                                               | From                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `arc inbox`                         | `arc inbox <personal\|project\|slug> [--target <slug>] [--json]`                                                                                                                   | the flip                           |
| `arc route`                         | `arc route <entry-id> --from <list> --version <version> --to <destination> [--section <name>]`; `arc route --to <destination> [--section <name>]` with the entry on standard input | the flip                           |
| `arc locus release`                 | `arc locus release [<slug>]`                                                                                                                                                       | the flip                           |
| `arc errand queue`                  | `arc errand queue [--json]`                                                                                                                                                        | the flip                           |
| `arc errand queue set`              | `arc errand queue set <file \| ->`, a versioned JSON request listing the whole queue's members in order, each an inbox and an entry ID                                             | the flip                           |
| `arc handoff write`                 | `arc handoff write <file \| ->`, a versioned JSON request carrying the session context, `Next Action`, and an optional `Session Type`                                              | the flip                           |
| `pausedWork`, `inboundBackPressure` | session-init slots (§ 4.4, § 4.6)                                                                                                                                                  | this change; empty before the flip |
| `inbound.retriage_after_entries`    | project setting, a positive integer, default 10                                                                                                                                    | the flip                           |
| `inbound.retriage_after_days`       | project setting, a positive integer, default 30                                                                                                                                    | the flip                           |
| `pause.review_after_days`           | project setting, a positive integer, default 14                                                                                                                                    | the flip                           |

- **Before the flip** each verb is registered and refuses `unsupported`, naming what serves until then: `arc inbox`,
  `arc user inbox-list --target`; `arc route`, the routing method's until-the-flip binding (`route-discovered-work`,
  "Binding: carrying out outcomes"); `arc locus release`, `arc park` and `arc teardown`; `arc errand queue` and
  `arc errand queue set`, `arc user inbox-mark-execute-bound`; and `arc handoff write`, the `SESSION-NOTES` write.
- **The settings** are declared beside `inbox.remind_after_days` (`lib/config/schema.ts`, `commands/config/validate.ts`)
  and have no effect before the flip; the shipped configuration template documents them in the flip's rewrite.
- **Changed forms from the flip:** `--from-inbox <personal|project>:<id>` on `arc errand open` and `arc errand link`,
  and `arc user inbox-remove --id <id> --version <version>`, each refusing a title (§ 7.7).
- **Code identifiers** keep today's names, `_WU_Target:_` among the fields (§ 6.2).

### 15. Forward amendments to shipped specifications

The storage contract and the routing method have shipped. Where this design changes what their specifications define,
the change is stated here and built by this change; neither specification is edited.

#### 15.1 The storage contract (`spec-storage-contract.md`)

- **D11's routing receipt** carries the time of the move rather than its date, and the list and section the move left;
  it goes to the ref of each inbox the move leaves or enters, and an entry's latest receipt is read across the person's
  receipts and the project inbox's together (§ 7.3).
- **D11's `_Routed:_` line** is derived in the listing from the latest receipt, never stored in the entry (§ 7.4).
- **D11's inbound provenance line,** `routed from <origin>, <date>`, becomes `_Routed from:_`, which the routing verb
  writes holding only the list and section the entry left; the date is `_Created:_`'s (§ 6.2).
- **D11's abandon,** which returns each entry to "the inbox it came from", returns it as § 7.5 states, since a
  description no longer fills only from an inbox.
- **D11's Errand queue** qualifies each member by its inbox (`_Inbox:_`) beside its ID, and a set naming both entries of
  one ID refuses (§ 6.3).
- **D6's concurrency library** places a heading entry's `_Id:_` after the kind's last managed field, and a field-header
  entry's after its trigger's last line (§ 6.4).

#### 15.2 The routing method (`spec-inbound-routing-method.md`)

- **D4's provenance line,** `routed from <origin>, <date>`, takes § 15.1's shape from the flip.

### 16. Expected contracts

This design consumes behavior other changes build. Each is an expected contract, available when its change lands; what
holds until then is stated with it.

- **The transition write path** (the change rerouting lifecycle's transition writes through the store, which this
  change follows, § 1.3):
    - the checkout removal function and its removal check, with their outcomes, the removal check's projection part
      alone serving a release (§ 5, § 12.1);
    - the prepared-write protocol: acquire the whole artifact group, prepare, revalidate each input by its version,
      apply in one batch with expected versions (§ 4.1);
    - the pause record on the work item, `arc pause`, `arc resume`, and `arc handover`, and the refusal of every verb
      that advances a paused work unit's work, naming `arc resume` (§ 4.3, § 4.4);
    - `arc task close`, its default capture over the floor less the work item's captures, closes moving the floor up,
      its refusal on a checkout with no linked branch out, and its refusal and named repair for a floor behind,
      diverged, missing, or lost (§ 11);
    - branch links' record of whether ARC created or adopted the branch and their floor (§ 8.2, § 11, § 12.4), and an
      abandon's and a teardown's report of a kept adopted branch (§ 12.4);
    - the widened `arc materialize` in both arms, the spawn, and graduation in place, each running the exclusivity check
      and the in-place arms writing the anchored marker (§ 2.4, § 2.6, § 4.5);
    - teardown releasing an anchored marker and keeping its checkout, and rename moving only a spawned checkout (§ 2.3);
    - the cold start's seed handling, landing before this change reroutes `runColdStart` (§ 2.5);
    - promotion's one write and its work branch (§ 8.3);
    - the rule that an Active work unit is no default routing home, and the record kinds' write check refusing the move
      to Active while the inbound list holds an entry (§ 7.8);
    - the scaffold's create arm from the flip, writing the meta and its session context through the store with no
      `runUserOpen`, which the cold start reroutes onto (§ 2.8);
    - the current-work-unit reconcile's store-backed prepare, with its executor and command bindings (§ 4.1);
    - dependency discharge reading lifecycle through the store (§ 3.6);
    - activation moving the floor to the branch's tip and reporting the uncaptured commits that hides (§ 8.3).

  Until it lands none of these exist, so this change lands after it.
- **Status and ROADMAP** (the change rendering them from typed listings): the readiness composition's record merge
  (`mergeProjectReadinessRecords`, `lib/status/project-view.ts`) reading a decomposed origin as decomposed from its
  lineage record (§ 3.6); until it lands `arc status` and ROADMAP report the origin as today.
- **The projection:** the removal check's projection part, the persist step, and the release slot, each passing until
  filled (§ 5, § 12.1); the empty scratch folder for the checkout's work unit (§ 2.8); and its worktree lock, which
  lands only after this change's removals, removal decisions, and moves are on the function, the check, and the
  doubled-force form (§ 12), with its rewrite, under that lock, of the removals printed rather than run, branch-gone's
  prune among them (§ 12.1).
- **The ref backend and its import:** `pull`, with its `designation-needed` report and remedy argv (§ 4.8);
  `maintain()`'s ref measurements and the push's retry count and time waited (§ 9.3); the unresolvable-state-version
  refusal naming the history refs a clone lacks, and `pull` of them by name (§ 9.2); the refusal of writes to a kind no
  declaration homes (§ 6.6); the project ID as every capture's repository (§ 8.1); and the import, which carries each
  open Errand's and live work unit's branch link with its record and floor (§ 8.2, § 11), stamps every entry's `_Id:_`,
  carries each open Errand's origin entry into its description, moves each draft's held entries — its buffer section —
  and each pending owner-adoption `_Hold:_` capture into its work unit's inbound list, an entry from a buffer section
  taking as its `_Created:_` the latest date its `_Routed from:_` line carries, or the import's date where it carries
  none, and that line moving unchanged into the entry's prose as a plain paragraph, and one from a held capture keeping
  the capture's `_Created:_` and taking the `_Routed from:_` a route from its inbox would write, so every
  `_Routed from:_` line from the flip has § 6.2's form (§ 4.6, § 7.8), turns each person's execute-bound marks into
  their Errand queue in file order (§ 7.6), and writes no `State at Handoff` (§ 9.2) and no marker (§ 2.7).
- **The cutover:** the flip; the workflow rewrite, which dispatches the slots' actions (§ 4.3), moves the capture gates
  onto `arc inbox --target` (§ 7.1), moves hold-and-route's binding and hand-off sites onto `arc route` (§ 7.9), drops
  `session-init.md`'s `-d` offer for the slot's action (§ 12.4) and activation's workspace step (§ 2.8), replaces
  handoff's `SESSION-NOTES` write with `arc handoff write` (§ 9.1), and documents the new settings (§ 14); its rewire of
  `arc sync` onto the contract's push, which reports its push's figures through the tripwire report (§ 9.3); and the
  deletion pass over § 1.5's arms.
- **The routing method's arms for an Active and an Integrating target** (`route-discovered-work`), which route out of a
  work unit past planning (§ 7.8); until they land its gate still proposes holding an entry in an executing work unit.

## Alternatives & Rationale

**The boundary (§ 1.1).** _Split the personal surfaces from locus._ Both read one session-init binding, and the
back-pressure and survivor slots read the entry kinds, so either half would rebuild the binding or wait on the other.

**Entries keyed on `_Id:_` (§ 6.1).**

- _Key on the bold title._ A retitle reads as a removal and an insertion, and two entries may share a title.
- _A `_Slug:_` field._ A second key beside the ID the concurrency library already merges on.

**`_WU_Target:_` keeps its name (§ 6.2).** Entries drain, so a rename would rewrite only the live ones, and every older
spelling must still be read.

**The survivor's home derived (§ 7.4).** _Store a `_Routed:_` line in the entry._ The line is a write into an entry its
person may be editing, so it can clash with the very edit that made the survivor; derived from the receipts, it never
does.

**Where receipts go (§ 7.3).**

- _One log in the project inbox's ref._ A person's moves within their own inbox would land in a ref everyone writes.
- _The person's ref only._ A project-inbox move's receipt would be invisible to everyone else's drain.
- _Dates rather than times._ Two receipts across the two refs on one day could not be ordered.

**One listing verb (§ 7.1).** _Widen `arc user inbox-list`._ It requires `--target` and reads only the inboxes;
`arc inbox` replaces it at the flip (§ 14).

**Where an abandon returns an entry (§ 7.5).** _Back into the work unit's inbound list it left._ A work unit past
planning takes nothing by default, and its owner may not be the abandoner; another person's personal inbox only that
person writes.

**The Errand queue ordered by rank keys (§ 6.3).** _File order._ Two sets on two machines would interleave as text,
where rank keys merge by member.

**Settings and constants (§ 4.6, § 9.3).** How often a team drains is the project's preference, so the back-pressure
thresholds are settings; the tripwires guard the store's scale and are advisory, so their bounds are constants.

**An identity in use warns (§ 10.2).** _Refuse._ A slug cannot tell a person's second machine from a second person, so
a refusal would block the common case to catch the rare one, and it would still miss two people setting up before
either syncs.

**The anchored marker's admission before the flip (§ 2.3).** _Admit it with the flip._ The in-place arms write it from
the flip, and a reader that met one first would read it as malformed; admitted dormant now, nothing observable changes.
_Key removal on a marker's presence._ It would grant removal of a checkout ARC never created.

**The marker's exclusivity per machine (§ 2.4).** _A stored claim._ It would make the machine-local marker stored state
every clone contends on; across machines the work unit's owner governs.

**Overlap for an entry list reports none (§ 3.3).** Its writes merge by entry, so an overlap report would flag work that
never conflicts.

**`git branch -D` for a merged orphan (§ 12.4).** `git branch -d` tests reachability, so it refuses a rebased branch or
one squash-merged from a single commit, both of which the `merged` verdict admits.

## Cross-cutting Considerations

**Testing.** Every locus, session-init, and personal-surface test passes unchanged over the in-repo implementation, but
for those a § 1.4 item changes, each named with its item. Each arm from the flip runs over the reference backend, which
reports `stateOffBranch: true` (`__tests__/helpers/store/reference-backend.ts`), with Git steps over the shared scripted
`GitExec` fake. Each verb this design adds passes on its success path and on each refusal it names, and a recoverable
refusal also passes its continuation once repaired. Tests of rerouted code keep their local doubles.

**Migration and rollout.** Nothing observable changes before the flip but § 1.4's items. At the flip the import carries
branch links, entry IDs, open Errands' descriptions, held entries into inbound lists, and each person's queue (§ 16);
the cutover's rewrite moves the workflows onto the slots' actions and the new verbs; and the deletion pass removes
§ 1.5's arms. The anchored marker's admission lands before any anchored checkout exists, and the projection's lock after
every removal and move is on the function, the check, and the doubled-force form.

**Compatibility.** Under the pre-public-release posture the slots' schemas, the compaction seed, and the entry formats
change in place, with no alias or migration reader. `arc user inbox-list`, `arc user inbox-mark-execute-bound`, and
`arc user open` serve until the flip, and the in-repo arms until the deletion pass. The entry-field module reads every
spelling today's entries carry.

**Procedure boundary.** What a workflow step needs computed, the CLI computes: each slot's action in one registered
shape, typed wherever running it repairs the condition and text alone where the repair takes a decision, so a text
action becomes typed later with no change of shape (§ 4.3); handoff's anchors, which `arc handoff write` takes from the
store and the checkout rather than from its request, whose fields are only what the session decides (§ 9.1); a
survivor's home and the back-pressure figures (§ 7.4, § 4.6); and every refusal's remedy (§ 13). Workflow text and
session-init's prose conditionals stay as they are, so a later step that compiles the session's agenda, or renders the
handoff, consumes these results and verbs without reshaping them.

**Performance.** Session-init binds `currentWuReconcile`'s reads once where it binds them twice today. In-flight
derivation lists placement once rather than reading a meta at each eligible ref. The listing of commits not yet closed
is one revision walk from `HEAD` excluding three bounds, less the work item's captures, and the back-pressure slot reads
the current work unit's inbound list once.

**Security and trust.** Anyone may insert into an entry list, but only a started work unit's owner removes from its
inbound list, a rule the host cannot enforce, as it enforces no ARC writer rule. A person's personal-inbox receipts live
in that person's own ref. An anchored checkout is never removed, and a check that cannot observe a checkout grants no
removal. A slug collision between two people warns rather than refuses (§ 10.2).

**User-facing impact.** Before the flip: the rebuilt slots carry actions, the removal prompts name `arc teardown`, the
orphan sweep's merged offer is `git branch -D`, the rename-move remedy takes `-f -f`, and the new verbs exist and
refuse. From the flip: `arc inbox` and `arc route` replace hold-and-route and title-keyed listing and removal, the
Errand queue replaces execute-bound marks, a paused work unit and its inbound back-pressure show at session start,
survivors are reported with their homes, `arc locus release` releases a checkout, handoff writes its session context
through `arc handoff write`, and the commits not yet closed are listed with their close.

## Success Criteria

1. **Today's behavior holds before the flip.** Every locus, session-init, and personal-surface test passes over the
   in-repo implementation, unchanged but for those a § 1.4 item changes, each named with its item, and the session-init
   envelope and the locus verbs' results on fixture repositories are unchanged but for § 1.4's items.
2. **Each § 1.4 item has its test,** each removal outcome among them over a scripted Git.
3. **The ratchet holds.** At landing no `store-raw-state`, `surface-names`, or `work-unit-paths` count in
   `eslint-suppressions.json` exceeds its count at the final merged base, in total or per file; every entry left in the
   parts of § 1.2's files this change reroutes sits in an arm § 1.5 names; and `npm run -s lint:ts` passes with no
   suppression added for a new violation.
4. **Every slot § 4.2 names registers its schema,** `arc schema` serves each, and each carries the action § 4.3's table
   gives it, its checkout included where § 4.3 requires one.
5. **Each arm from the flip passes over the reference backend:** every behaviour § 2–§ 12 states from the flip has its
   test, among them locus from the marker and the store, two markers unresolved, an incomplete observation granting
   nothing, the exclusivity check in each verb this change runs it in, an anchored checkout kept and read as `external`,
   the in-flight set with a paused work unit in it, the overlap check's state and entry-list targets, and § 3.7's cases;
   the session-notes path and the scratch reconcile, a promoted work item's folder among its cases (§ 2.8); the
   paused-work slot's resumable and review-due marks and entering a paused checkout (§ 4.4); the materialize offer's set
   and its `--here` arm (§ 4.5); the notes policies having no effect (§ 4.7); session start's pull and its designation
   line (§ 4.8); the close's capture, the Errand's branch link, and promotion's branch and marker (§ 8.1–8.3);
   `arc handoff write`'s write with the anchors it computes (§ 9.1) and each case of § 9.2; identity setup writing only
   absent records and warning on one in use (§ 10.1, § 10.2); the cold start writing only its marker and the store's
   records (§ 2.5); Errands and claims acquired apart, review admission taking both complete (§ 3.2); former slugs
   resolved through `lookup` (§ 3.5); the queue's offer and a start's refusals (§ 7.6); removal by ID and version, and
   `--from-inbox` taking the inbox (§ 7.7); an adopted branch never offered `arc teardown` (§ 12.4); `retiredSubdirs`
   resolving `skip` (§ 4.2); `arc user open` refusing (§ 2.8); and a paused work unit's slot actions taking `arc resume`
   (§ 4.3). The tripwire report, whose figures neither implementation produces, passes over scripted measurements and
   push outcomes, showing each figure past its bound and none below (§ 9.3).
6. **The verbs this design adds** — `arc inbox`, `arc route`, `arc locus release`, `arc errand queue`,
   `arc errand queue set`, and `arc handoff write` — pass on their success paths and on each refusal they name, a
   recoverable refusal also on its continuation once repaired, and each refuses `unsupported` before the flip, naming
   what serves until then.
7. **The entry grammar holds:** each kind parses and writes the fields § 6.3 admits; the module reads every spelling and
   writes the managed form; each ID placement in § 6.4 has its test; and a wrapped or colon-less `WORKING-MEMORY` header
   above its trigger refuses (§ 6.5).
8. **Routing holds:** a move writes the insert, the removal, and the receipts in one batch; an entry changed since it
   was listed refuses and stays, and an edit racing the write survives, as a survivor where it left an inbox; an ID the
   destination holds is reported or refused as § 7.2 states; a survivor lists with its home and is carried in both
   forms, a crash leaving the survivor or its carry and never both; each abandon return in § 7.5 lands where it states;
   and the latest receipt is decided across the two refs by time.
9. **The commits not yet closed** equal the close's default capture on an adopted, a re-activated, and a promoted work
   unit's branch; a floor behind, diverged, missing, or lost is reported with its repair, a diverged, missing, or lost
   one with the commits since base no task captured, in place of the listing; a paused work unit takes
   `arc resume <slug>`; and recovery lists them beside a matching cursor.
10. **Back-pressure trips on each threshold,** and below both the slot reports its figures with no action.
11. **The quality gates pass** at every gate the project declares.

## Open Questions

None blocks starting. The expected contracts in § 16 each state what holds until their change lands, and none leaves
this design open.

## Amendments

None.

---
