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
  `lib/locus/subject-meta.ts`), and the current work unit is resolved by reading the single meta there
  (`resolveActiveWu`, `lib/release/wu-resolution.ts`; `readActiveMetaCandidates`, `lib/active/meta-reader.ts`).
- **What is in flight** is read from branch refs: in-flight derivation lists and shows `.arc/active/meta-*` at each
  eligible ref (`deriveInFlight`, `lib/git/in-flight-derivation.ts`), and the overlap check diffs branches against base
  (`detectForeignArtifactOverlap`, `lib/git/foreign-artifact-detection.ts`).
- **Session-init** binds every state probe itself (`handleSessionInitStatus`, `handlers/status.ts`): the in-flight
  oracle, the roster and the sweeps, the inbox and nudge reads, and `currentWuReconcile`'s inputs, which it binds a
  second time beside the binding the reconcile's own command uses (`buildCurrentWuReconcile`,
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
  `spawnedByArc: true`, for a checkout ARC created; an **anchored** checkout's carries `false`, for a checkout ARC
  claimed in place and did not create.
- **Entry list** — a record holding a sequence of entries, each a bold title with managed fields and prose: the
  personal inbox (`USER-INBOX`), the project inbox (`ATOMIC-INBOX`), `WORKING-MEMORY`, a work unit's **inbound list**
  of entries routed to it, an Errand's **description**, and a person's **Errand queue**. Entry lists merge by entry
  (`lib/store/concurrency/entries.ts`). A **managed field** is one the entry grammar parses (§ 6).
- **Routing** — moving an entry from one list to another, or inserting a new one, with a **routing receipt**: a
  write-once record of the move, kept beside an inbox and never shown in it (§ 7.3). A **survivor** is an entry edited
  while a routing removed it: the removal takes out only the version it observed, so the edit survives in place
  (`lib/store/concurrency/entries.ts`).
- **Slot** — one field of the session-init envelope (`arc status --session-init --json`), each a `Probe` failing alone.
- **Exclusions** and **copy key** — as § 11 defines them for the commits a work branch carries.

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

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This change does not:

- **change any workflow, skill, or method text,** or reshape session-init's prose conditionals. Workflows keep reading
  the envelope as they do; their text changes once, in the flip's rewrite, which is not this change's.
- **build the ref backend, its import, the projection, write-back, `arc save`, or the projection's worktree lock,** or
  perform the flip or the deletion pass. It fills none of the projection's slots (§ 16).
- **build the lifecycle verbs it calls** — the checkout removal function and its check, the pause and its verbs, the
  task close verb, the widened `arc materialize`, `arc handover`, branch links' created-or-adopted record and
  exclusions, the prepared-write protocol, or the cold start's seed handling (§ 16).
- **reroute the notes-sync machinery** — the `arc user` push, fetch, compaction, sync-status, save, load, and pull
  commands and their handlers — which the deletion pass removes with notes. Its one read of the worktree roster takes
  the row's work unit where the roster changes beneath it (§ 2.1).
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
  admission, and the worktree marker's origin binding with its writer, `lib/locus/provisioning-marker.ts`, § 7.6), the
  locus ports' binding where the executor context is built (`buildExecutorContext`,
  `lib/work-unit/executor-context.ts`), with store start's create-new taking the executor's ports
  (`handlers/start-store.ts`) and the port's refusal carrying the check's message whole (`requireMarkerExclusivity`,
  `lib/work-unit/locus-ports.ts`) (§ 2.4, A1), the in-place arms' refusal of an occupied checkout (`readStoreOccupancy`,
  `lib/work-unit/lifecycle-guards.ts`) and their report of a marker raced in before the anchored marker's write
  (`reconcileWorkUnitWorktree`, `lib/work-unit/mutators/reconcile-work-unit-worktree.ts`) (§ 2.6, A4),
  `lib/git/worktree-cleanup.ts` (the cleanup decision), `commands/active/roster.ts`, `lib/release/wu-resolution.ts`
  (`resolveActiveWu`'s body and `resolveOriginatingMetaPath`), `lib/session-init/locus-classification.ts`, the derived
  frame and roster (`lib/locus/derived-reader.ts`, whose work-unit context gains the pause record and the commits not
  yet closed, and `lib/locus/derived-roster.ts`), the frame's guidance (`deriveDerivedLocusSessionGuidance`,
  `lib/locus/session-guidance.ts`), and the layout resolver's address for an identity's personal root
  (`lib/layout/schema.ts`, `lib/layout/projection.ts`).
- **In-flight derivation and overlap:** `lib/git/in-flight-derivation.ts`, `commands/active/in-flight.ts`,
  `handlers/active.ts`, `lib/git/foreign-artifact-detection.ts`, `handlers/errand.ts`'s `arc errand check`
  (`handleErrandCheck`), the pre-commit foreign-write hook (`scripts/check-foreign-writes.ts`, § 3.3),
  `lib/session-init/in-flight-work-unit-sweep.ts`, `lib/session-init/in-flight-composition.ts`, the target classifier
  beside the layout resolver (`lib/layout/`, § 3.3), `arc status <slug>`'s worktree path, operational read path, and
  in-flight warnings (`handlers/status/lifecycle.ts`, § 3.1), and the notes save's one read of the worktree roster
  (`resolveSameMachineInFlightSubdirs`, `commands/user/save-load.ts`, § 2.1).
- **Session-init and recovery:** `handlers/status.ts`'s session-init binding (`handleSessionInitStatus`),
  `handlers/status/session.ts`, `handlers/status/session-context.ts`, `handlers/status/session-evidence.ts`,
  `commands/status/run.ts`, `handlers/recover.ts`, `handlers/recover-probes.ts`, `lib/recover/audit.ts`,
  `lib/recover/committed-progress.ts`, `lib/recover/integration-correction.ts`, `lib/handoff/restate-candidates.ts`,
  `lib/handoff/session-notes-path.ts`, `lib/work-unit/reference-reconcile.ts` (the cut's successors, § 3.5),
  `lib/load-set/projection.ts`, `lib/compaction-seed/emitter.ts`, and under
  `lib/session-init/`: `branch-gone-cascade.ts`, `branch-gone-recovery.ts`, `cohort-doc.ts`, `current-husk-advisory.ts`,
  `current-wu-reconcile.ts`, `errand-state.ts`, `errand-staleness-sweep.ts`, `inbox-reminders.ts`, `inbox-state.ts`,
  `lifecycle-residue-sweep.ts`, `materializable-work-units.ts`, `orphan-branch-sweep.ts`, `recommended-action.ts`,
  `retired-subdir-detection.ts`, `stale-worktree-sweep.ts`, and `work-unit-state.ts`; with
  `lib/user-sync/retired-subdir.ts` and `lib/user-reference-reconcile.ts` and its command
  (`handleUserReconcileReferences`, `handlers/user.ts`); and the session envelope's slot schemas and their registration
  (`commands/status/schema.ts`, `commands/status/types.ts`, `lib/session-envelope/registry.ts`).
- **Errands:** under `lib/errand/`, `open-runtime.ts`, `close-runtime.ts`, `abandon-runtime.ts`, `leave-runtime.ts`,
  `link-runtime.ts`, `partial-settle-runtime.ts`, `terminal-occupancy.ts`, `identity-claims.ts` (its claim rollback's
  call of the identity transaction) and `identity-transitions.ts` (the transition rules the runtimes compute, § 8), the
  locus consumers' listing protocols, which leave `record.ts`'s index projection, and the identity discovery's readers
  (`terminal-authority.ts`, and `scripts/integration/errand-merge-composition.ts`'s `selectCurrentErrandMergeIdentity`),
  which read its two acquisitions (§ 3.2); the origin's carriers (`identity-record.ts`, `lib/locus/schema/identity.ts`,
  `lib/locus/provisioning-authority.ts`, and `lib/locus/provisioning-marker.ts`'s `partialOrigin`, § 7.6), the open and
  the link that compose it (`open.ts`, `link.ts`), the comparisons of it (`identity-transitions.ts`'s `desiredRecord`,
  `open.ts`'s `validateResumeContinuity`), and every projection of it in a result or slot (`operation-result.ts`,
  `terminal-result.ts`, `promotion-result.ts` with `promote.ts`, `lib/session-init/materializable-errands.ts`, and
  `handlers/errand.ts`'s settlements and materialize's re-feed, § 7.6); `change-request-lifecycle.ts`, whose merged
  evidence carries the merge commit (§ 8.1); and `promote-runtime.ts`'s selection of promotion's steps on the
  capability, its marker settlement, and its inbox settlement step (`receiptFromAuthority`, `settlePromotedInbox`,
  § 8.3), shared with the change rerouting promotion's write (§ 1.3); `promote-store.ts`, that change's promotion steps,
  where this change has their receipt report the origin as the record holds it (§ 7.6, A5); and `handlers/errand.ts`'s
  `arc errand materialize` (`handleErrandMaterialize`), its Errand read (§ 8).
- **The personal surfaces and entry lists:** `lib/user-sync/parser.ts`, `lib/user-sync/inbox-writer.ts`,
  `lib/user-sync/inbox-target.ts`, `lib/user-sync/execution-offer.ts`, `commands/user/inbox-list.ts`,
  `handlers/user-inbox-list.ts`, `commands/user/inbox-mutation.ts`, `lib/inbox-entry-operand.ts` with its callers'
  operand parsing (`handleUserInboxRemove`, `handlers/user.ts`, with its title-source check,
  `UserInboxRemoveInputSchema`, `handlers/user-inbox-remove-input.ts`, and `arc errand open` and `link` in
  `handlers/errand.ts`), `commands/user/add.ts`, `commands/user/open.ts`, `commands/user/close.ts`, and `lib/setup.ts`'s
  seeding of the personal surfaces (`runPostInitSetup`), with identity setup's store binding — the store ports' optional
  identity (`createDefaultStorePorts`, `lib/store/default-ports.ts`) and `arc join`'s pull and check
  (`handlers/join.ts`, § 10.2); the entry kinds' declarations and the receipt kinds' own mechanism in
  `lib/store/registry.ts` and their modules under `lib/store/kinds/`; and the heading arm of `stampEntryIds`
  (`lib/store/concurrency/stamp.ts`) with the entry config's managed-field list (`lib/store/concurrency/entries.ts`,
  § 6.4).
- **The cold start:** `commands/start.ts`'s cold start (`runColdStart`, `coldStartOccupancyRefusal`,
  `rollbackColdStart`), with its sequence from the flip, the anchored marker among it, and its rollback's removal of
  that marker, and its handler's prompt and report and the executor's store and ports it hands the slot
  (`handlers/start.ts`) (§ 2.5, A1); its call of the scaffold (`lib/git/worktree-scaffold.ts`) stays, the scaffold's arm
  from the flip being the transition-write-path change's (§ 2.8).
- **Handoff:** the new `arc handoff write` command and its handler, and the tripwire report beside it under
  `lib/handoff/` (§ 9.1, § 9.3).
- **The new verbs and settings, and the changed forms:** their registrations in `cli.ts` — the new verbs, and from the
  flip `arc errand open`'s and `arc errand link`'s `--from-inbox` and `arc user inbox-remove`'s `--id` and
  `--expected-version` (§ 14) — and the three settings' declarations (`lib/config/schema.ts`,
  `commands/config/validate.ts`).

Readers outside this list that call into it keep their call: the lifecycle verbs and handlers that call the in-flight
expansion (`commands/rename.ts`, `handlers/start.ts`, `handlers/lifecycle.ts`) and the review handlers' checkout binding
(`handlers/review-locus-context.ts`, through `runDerivedLocusStateProbe`). The lifecycle callers call the expansion only
in their in-repo arms, reading the store's slug-keyed lifecycle view from the flip (§ 16), so the expansion keeps its
result shape for them and never hands them an entry with no branch (§ 3.1). Status's direct calls of the derivation
(`lib/status/project-view.ts`, `lib/status/user-view.ts`) and `arc view`'s explicit-target composition and its cohort
read, for either target (`handlers/view.ts`), are the status change's (§ 16).

#### 1.3 Order and shared files

This change follows the change that reroutes the transition write path, whose removal function and check, prepared-write
protocol, pause, task close verb, branch links, widened `arc materialize`, and seed handling it calls (§ 16). A file
both changes rewrite carries one change's edits at a time, that change's landing first. Those whose order this design
builds on:

- `commands/start.ts`, where the cold start's seed handling precedes this change's reroute of `runColdStart`;
- `handlers/start.ts`, where that change's start dispatch precedes this change's binding of its cold-start slot and the
  cold start's prompt and report (§ 2.5);
- `lib/errand/promote-runtime.ts`, where this change has the runtime select that change's promotion steps on the
  capability, with its marker settlement and its inbox settlement step (§ 8.3);
- `lib/errand/promote-store.ts`, which that change creates with promotion's steps, and where this change has their
  receipt report the origin as the record holds it (§ 7.6, A5);
- `handlers/status/lifecycle.ts`, where that change moves the slug query's state and record onto the store and this
  change its locus reads (§ 3.1);
- `lib/work-unit/reference-reconcile.ts`, where this change adds the cut's `successors` (§ 3.5);
- `lib/work-unit/locus-ports.ts`, which that change creates with the port record and its today-behavior default, and
  where this change has the port's refusal carry the check's message whole (§ 2.4);
- `lib/work-unit/executor-context.ts`, where that change has the executor context carry the ports it is given, and this
  change binds them (§ 2.4, A1);
- `handlers/start-store.ts`, which that change creates, and where this change has create-new take the executor's ports
  and hand a named in-place start to the cold-start slot (§ 2.4, § 2.5, A1, A3);
- `lib/work-unit/lifecycle-guards.ts`, where that change gives the occupancy guard its store arm, and where this change
  has it refuse a checkout another marker occupies (§ 2.6, A4);
- `lib/work-unit/mutators/reconcile-work-unit-worktree.ts`, where that change's in-place leg writes the anchored marker
  through the port, and where this change has it report the writer's `exists` naming the checkout and its marker (§ 2.6,
  A4);
- `lib/git/worktree-marker.ts`, where that change adds a lineage arm to the marker's evidence decoding
  (`decodeKnownEvidence`) and this change widens the marker check (`isWorktreeMarker`, § 2.3, § 7.6);
- `lib/git/worktree-roster.ts`, which that change also edits, and where this change has the registered-worktree scan
  read each folder's presence and rebuilds the roster (§ 2.1).

The scaffold (`lib/git/worktree-scaffold.ts`), whose arm from the flip is that change's, this change leaves alone, the
cold start keeping its call (§ 2.8).

#### 1.4 Before the flip

Today's behavior holds until the flip, but for these, each with its own test:

1. **Every slot this change rebuilds carries its typed actions and registered schema** (§ 4.2, § 4.3), beside the
   command fields it carries today, the orphan-branch sweep's `git branch -D` for every merged branch among them
   (§ 12.4), and the two slots it adds, `pausedWork` and `inboundBackPressure`, are present with their schemas and
   report nothing (§ 4.4, § 4.6).
2. **The removal prompts carry their command:** the stale-worktree sweep's removable worktree and branch-gone recovery's
   removable candidate each carry an `arc teardown <name>` argv; the registered-worktree scan carries each folder's
   presence (§ 2.1); and the sweep reports a registration whose folder is missing in its own `missingFolders` field — a
   branched one whose work unit has ended with its teardown, every other with its removal by path as text, unlocking
   first where it is locked — and so stops reporting a shipped work unit's as an `external` `branched` report (§ 12.2).
3. **The residue sweep's rename-move remedy takes the `git worktree move -f -f` form** (§ 12.3).
4. **The removal callers take the removal function's and check's outcomes** — the Errand's exits and `arc errand leave`
   both, and the stale-worktree sweep, branch-gone recovery, and the residue sweep the check's `unobservable`, `locked`,
   and `missing`, where today a failed status read folds into not clean, branch-gone recovery reporting a registration
   whose folder is missing in its `missingFolders` field, with its removal by path, rather than switching to it
   (§ 12.1).
5. **The compaction seed's schema version advances** (§ 4.9).
6. **`arc inbox`, `arc route`, `arc locus release`, `arc errand queue`, `arc errand queue set`, and `arc handoff write`
   are registered and refuse `unsupported`,** each naming what serves until the flip (§ 14).
7. **The marker's new admissions are dormant:** the marker check and the topology check admit a work-unit marker with
   `spawnedByArc: false`, and every removal reader keys on `spawnedByArc: true` (§ 2.3); and the marker check admits a
   partial Errand's origin binding as a qualified ID with its version beside today's title and digest, which the
   provisioning authority, `partialOrigin`, the derived evidence, and the roster row carry, and the Errand record's and
   claim's inbox arm and the link transition admit a `null` digest (§ 7.6). Nothing writes these forms before the flip,
   so nothing observable changes.
8. **The three settings are declared** and show in `arc config`, with no effect (§ 14).

Every other part of this design runs only in an arm from the flip, beside an in-repo arm keeping today's behavior.

#### 1.5 Arms kept until the deletion pass

These run only while `capabilities.stateOffBranch` is false, and the deletion pass removes them:

- **Locus from the checkout's active meta:** a marked checkout's subject and evidence reads of it
  (`projectCheckoutSubjectMeta`, `lib/locus/subject-meta.ts`; `lib/locus/derived-evidence.ts`) and the frame's cohort
  document read through it (`resolveActiveCohortDocPath`, `lib/session-init/cohort-doc.ts`, whose call by `arc view`
  takes the status change's arm from the flip, § 16), and its reading for a checkout with no marker (§ 2.1); the
  worktree roster's branch and meta gates (§ 2.1), the current-work-unit name's fallback to the branch's slug
  (`resolveCurrentWuName`, § 2.2), and the cold start's own occupancy check (`coldStartOccupancyRefusal`), with Git's
  refusal to check out one branch twice guarding the rest (§ 2.4).
- **The cold start's branch and `arc user open`:** the protected-base cut of `plan/<name>`, and its rollback's branch
  deletion and clean of the meta's file (`rollbackColdStart`, § 2.5); and `arc user open` (§ 2.8). The scaffold's meta
  write by path and its `runUserOpen` call, which seeds the cold start's `SESSION-NOTES`, are the transition-write-path
  change's in-repo arm (§ 16).
- **Promotion's runtime settlement,** its branch rename and commit (§ 8.3).
- **Identity setup's unconditional seeding** of the personal files (§ 10.1), and the user-surfaces resolver and its
  migration, which the in-repo implementation imports (§ 10.3).
- **In-flight derivation at branch refs** (`deriveInFlight`), the parked set built from the lifecycle index's parked
  slugs (`listParkedSlugs`) with its `parked` scheduling value, the overlap check's self-exclusion by checkout and
  `resolveOriginatingMetaPath`, the pre-commit foreign-write hook's whole body, and `arc status <slug>`'s worktree path,
  read path, and warnings from the composed lifecycle index (§ 3).
- **The shipped-work readers' archive index at a base ref** (`lib/work-unit/completed-index.ts`), with its object and
  shallow-history guards, and the Candidate mutation owner's completed set from the working tree's lifecycle index
  (`buildLifecycleIndex`) (§ 3.4).
- **The Errand runtimes' identity transaction** (`transactTransientIdentities`, `lib/errand/identity-transaction.ts`),
  which fetches, reconciles, and publishes around each runtime's read and write; the derived evidence's direct read of
  the one snapshot (`readTransientIdentitySnapshot`); and the one-snapshot projection of Errands and claims
  (`lib/errand/record.ts`) (§ 3.2, § 8).
- **Session-init's notes recommendations and loads** (§ 4.7), each session-notes reader's own resolution of the path
  into the per-work-unit workspace and the meta's `Task List` pointer as the task list's path (§ 2.8), and the
  current-work-unit reconcile's inline bindings of the lifecycle index, transition queries, and artifact reads (§ 4.1).
- **The slots' command fields their actions supersede:** `currentWuReconcile`'s and `userReferenceReconcile`'s
  `recommendedCommand`, the residue sweep's `teardown` and `remedy`, and the refresh remedies (§ 4.3).
- **The personal surfaces' title-keyed reads and writes:** removal by title (`removeCurrentInboxEntry`,
  `commands/user/inbox-mutation.ts`), the execute-bound marks (`executeBoundMark`, `listExecuteBoundInboxEntries`) and
  `arc user inbox-mark-execute-bound`, the Errand origin's title and digest, the notes lock around the inbox writer and
  the user-reference reconcile's re-plan under it, and today's `arc user inbox-list --target` (§ 4.1, § 7.1, § 7.6,
  § 7.7).
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
and so follows it onto the marker and the store. The subject's meta read resolves the frame's cohort document itself: it
takes the work unit's `Cohort` from its record and reads the `cohort/document` record through the store, where today the
cohort resolver (`resolveActiveCohortDocPath`, `lib/session-init/cohort-doc.ts`) reads the active meta by path and
checks the document on disk; a work unit with no cohort, or a cohort with no document, still yields none. The resolver
stays the in-repo arm, and `arc view`'s calls of it, for either target, are the status change's (§ 16). The
identity-global user root comes from the layout resolver (`resolveArcPath`, `lib/layout/projection.ts`) through a new
address for an identity's personal root, where the probe builds the path by hand today and the resolver's addresses name
only files beneath it.

- **The worktree roster keeps every registered checkout.** Today it drops a detached checkout and returns no rows when
  no checkout holds an active meta (`runWorktreeRoster`, `lib/git/worktree-roster.ts`), and a row's `identity` is the
  owner its meta names. From the flip a planning checkout is detached and holds no meta file, so the roster keeps
  detached rows, with no `branch`, and drops the meta gate: a row's work unit, by slug, comes from its marker, and its
  owner and the other fields its meta gives today from the work unit's record, which the owner filter
  (`filterRosterByIdentity`) then reads. A row whose marker names an Errand carries no work unit, as today it carries no
  `metaFilePath`.
    - **The consumers that take `metaFilePath` as the sign of a work unit** take the row's work unit in its place:
      `arc active roster` (`commands/active/roster.ts`), branch-gone recovery's candidates (`buildWorktreeCandidate`,
      `lib/session-init/branch-gone-recovery.ts`), the in-flight work-unit sweep (`enumerateOwnedIntegratingWorkUnits`,
      § 3.1), and the notes save's in-flight subdirectories (`resolveSameMachineInFlightSubdirs`,
      `commands/user/save-load.ts`).
    - **A consumer keyed on a row's branch passes a detached row over,** as today's roster does by dropping it:
      branch-gone recovery's candidates, and the `Integrating` rows the work-unit state slot reads
      (`lib/session-init/work-unit-state.ts`).
    - **The in-flight class tally** (`resolveInFlightComposition`, `lib/session-init/in-flight-composition.ts`), which
      counts every row it is given by its `Class` and labels each by its branch, labels a row by its work unit instead
      and keeps detached rows, so branchless planning work stays counted.
    - **The stale-worktree sweep** is the exception: from the flip it selects a marked row by its work unit's placement
      (§ 3.4), branch or none, so a branchless checkout whose work unit has ended is still reported, and it tests a row
      with no branch for landing at its checkout's `HEAD` commit, which `isLandedInBaseStrict`
      (`lib/git/branch-containment.ts`) takes as it takes a branch. A planning checkout left on base reads landed, and
      one holding commits made on its detached `HEAD` reads unmerged. Such a row reports as a `detached` report, naming
      its work unit where a `branched` report (`StaleWorktreeReport`) names its branch. A registration whose folder is
      missing has no marker, since the marker went with the folder, so the sweep selects those by the derived roster's
      reading of their folder (below), apart from its marked rows (§ 12.2).
    - **Lifecycle's own roster scan,** which serves park, stays its in-repo arm (§ 16).
- **Whether a registration's folder is present is read once per scan.** The registered-worktree scan
  (`scanRegisteredWorktrees`, `lib/git/worktree-roster.ts`) carries it on each registration (`folderPresent`), from one
  `lstat` of its path, any failure but a missing path reading present, and the derived roster carries it on its rows.
  Session-init's readers that select or offer by a folder take it from the derived roster's rows, which the
  stale-worktree sweep is handed (`derivedRoster`), rather than from the sweep's own scan, which serves its other loops;
  a decision on the removal check reads the folder again (§ 12.1, § 12.2). Git's `prunable` annotation is not this fact:
  it marks only an unlocked registration, and marks one whose folder is present but no longer linked. A registration
  whose folder is missing is no checkout, so it never reads as a checkout with no marker (§ 2.7), and the sweep reports
  it (§ 12.2). Nothing removes on this reading: the removal function, which teardown and the spawns' clearing of a dead
  registration run, reads the folder again when it acts (§ 16). Beyond those readers the field shows in the derived
  rows' JSON (`derivedLocusState`, `arc locus --json`), whose full schema, the derived frame's, admits it (§ 4.2), and
  in the rename transaction's whole-record comparisons (`rename-worktree-transaction.ts`), which still hold, both reads
  observing the same folder. It lands before the flip (§ 1.4).
- **A completed work unit reads in one of two frames.** Today a marker naming a work unit whose archived meta is on
  the checkout's `HEAD` derives an integration frame, and one in base's completed index a retired frame
  (`projectWorkUnitLifecycle`, `lib/locus/derived-lifecycle-evidence.ts`). Over the store both are placement
  `completed`, as is a work unit retired by a cut or an abandonment, so from the flip the frame reads what the archive
  cadence allows:
    - **Under `archive.cadence: manual`** archival follows the merge, and from the flip it is a store write rather than
      a change of its own awaiting merge, so a completed work unit derives the retired frame.
    - **Under `with-integration`** archival precedes the merge (§ 3.7). A completed work unit derives the retired frame
      when it carries a landing-commit link (`landingCommit`, `lib/store/links.ts`), which the landing writes from the
      flip (§ 16); when a lineage record retires it by a cut or an abandonment; or when its checkout's `HEAD` has landed
      in base by patch identity (`isLandedInBaseStrict`, `lib/git/branch-containment.ts`, against `origin/<base>` where
      it resolves and the local base otherwise), which covers a merge made outside ARC. Otherwise, archived and not yet
      merged, it derives the integration frame, as it does where no base ref resolves. A multi-commit squash merged
      outside ARC reads unlanded and stays in the integration frame, with no cleanup offered, until `arc teardown`.
    - **Two cases change from today.** A checkout whose `HEAD` carries the archived meta derives the integration frame
      today. From the flip it derives the retired frame both for an archive change's branch under `manual` and for a
      merged work unit's checkout not yet torn down under `with-integration`.
    - **A wrong retired frame loses nothing.** The frame only offers cleanup: teardown removes a checkout only through
      the removal check, which refuses uncommitted edits, and deletes its branch only once that branch's commits are
      preserved, contained in its upstream or landed in base (`delete-merged` through `assessReapSafety`,
      `lib/work-unit/mutators/reconcile-branch.ts`), which covers a work unit archived before its merge under
      `manual`.
    - **The cadence is read when the frame derives,** and records carry none, so a project moving from `manual` to
      `with-integration` after the flip reads earlier completed work with no link and an unlanded `HEAD` as awaiting
      merge, until its checkout is torn down.
- **The subject's branch comes from its links.** Today the frame reads it from the meta's `Branch` field, which feeds
  the expected topology the checkout's role is corroborated against (`expectedTopology`,
  `lib/locus/derived-lifecycle-evidence.ts`), session-type inference (`inferSessionType`), and an Integrating work
  unit's integration boundary (`recoverIntegratingBoundary`, `lib/locus/subject-meta.ts`). From the flip the meta
  carries no `Branch`, its branch link holding it (§ 16), so the branch is the work unit's work-branch link, chosen by
  the transition-write-path change's selection (`selectWorkBranchLink`, `workBranchName`,
  `lib/store/lifecycle-branch.ts`) among the links naming the project ID: a chosen link gives its branch to all three;
  no link gives no branch, as a branchless planning work unit has; and links the selection cannot choose among leave the
  subject unresolved, naming its reason, rather than one being guessed. The project ID comes from the project-ID port
  the transition-write-path change injects, which that change binds at its executor context from the flip to a read of
  the project's identity record (`createProjectIdentityReader`, `lib/store/project-identity.ts`, § 16). Each reader and
  writer of links this change adds takes the port as optional, a verb holding an executor context passing the
  executor's, and given none, over a store that reads state off the branch, binds the same read over the store it reads
  (A2). From the flip every reader this change adds of a work item's or an Errand's links that gets no project ID — the
  port absent, or its read of the project's identity record failing — treats that as an incomplete observation, never
  matching no link or every link: the subject stays unresolved, a sweep reports nothing from the links, the commits
  listing (§ 11) reports the condition in place of its set, and a verb that writes or looks up a link refuses, each
  naming the port's failure as text (§ 13).
- **Two markers naming one work unit** derive as unresolved for both checkouts rather than either being chosen.
- **An incomplete observation is never absence.** A marker that cannot be read, a store read that fails, or a listing
  that is not complete grants no role and no cleanup authority, and the slot reports it, as today's derived frame
  reports an unreadable checkout.
- **Until the flip** a checkout with no marker keeps today's reading of its active meta, which is how a cold-started
  checkout and a checkout graduated in place are found today, since neither writes a marker.

#### 2.2 The current work unit

`resolveActiveWu`'s body (`lib/release/wu-resolution.ts`) resolves through the contract's resolver
(`resolveCurrentWorkUnit`), and this change's own callers of `readActiveMetaCandidates` call that resolver directly and
take its result: the cold start's occupancy check (`coldStartOccupancyRefusal`, `commands/start.ts`), which also reads
the marker's `spawnedByArc` itself (§ 2.5), and `resolveOriginatingMetaPath`. For the default root
`readActiveMetaCandidates` already delegates to the resolver (`readHeldCandidates`, `lib/active/meta-reader.ts`), so the
move changes the result's shape, not the read; the function stays for its other callers. The user-reference reconcile's
current-work-unit read (`resolveCurrentWuName` in `handleUserReconcileReferences`, `handlers/user.ts`) moves onto
`resolveCurrentWorkUnit` too, leaving `resolveCurrentWuName` (`lib/user-sync/current-wu.ts`) with only the notes-sync
commands as callers. Until the flip, where the resolver finds no work unit the reconcile falls back to the slug of the
checkout's branch, as `resolveCurrentWuName` does today, so a checkout whose meta has left `.arc/active/` keeps its
session notes scanned.

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
  value; and every removal reader keys on `spawnedByArc: true` rather than a marker's presence — the cleanup decision,
  the husk cleanup decision (`decideHuskCleanup`, `lib/git/worktree-cleanup.ts`), and the residue sweep's candidate
  filter (`runLandedRetirementSweep`, `lib/session-init/lifecycle-residue-sweep.ts`) — so an anchored checkout reads
  as `external`. Nothing writes an anchored work-unit marker until the flip, so nothing observable changes.
- **An anchored checkout is kept.** Teardown releases its marker and keeps the checkout, the primary included, and
  rename completes in place without moving it (§ 16). `arc locus release` releases it (§ 5).
- **From the flip every in-place arm writes it** (§ 2.6).

#### 2.4 The marker's exclusivity

Branchless planning gives up Git's refusal to check out one branch twice, so from the flip the marker carries the guard.
The roster exposes two reads: the exclusivity check, and the lookup of the checkout whose marker names a given work
unit, which `arc locus release` (§ 5) reads, as do the transition-write-path change's rename, `arc materialize`'s
candidates, abandon, start, teardown, pause, and handover. The exclusivity check, given a work unit and the checkout
about to hold it, reads the derived roster and refuses when another registered checkout's marker names the same work
unit, naming that checkout and the repair: work there; or free it there by `arc locus release`, which releases a paused
work unit's checkout or another identity's. For one's own live work unit, which release refuses (§ 5), the repair is the
step its state takes: `arc pause <slug> --reason <text>`, then the release, for a Planning or Active one, and its
integration, then teardown, for an Integrating one. Every verb that writes a work-unit marker runs it first:
`arc start --here` in both its arms, the spawn, `arc materialize` in both its arms, spawned and `--here`, and Errand
promotion, whose fresh slug never collides (`convertSpawnedMarker`, `lib/errand/promote-runtime.ts`). This change runs
it in the cold start and in promotion; the spawn, graduation in place, and `arc materialize` call it, and that change's
verbs the lookup, through ports the transition-write-path change injects, each defaulting to the behavior until the
flip, and the change landing second binds them to these reads, by § 1.3's order this one (§ 16). Those ports give the
check the work unit alone, so through them a marker naming it in the checkout about to hold it refuses too, naming that
checkout; the checkout's own marker is admitted only where its caller passes the checkout, as the cold start and
promotion do. The binding has one production point, where the executor context is built (`buildExecutorContext`,
`lib/work-unit/executor-context.ts`): given no ports and a store that reads state off the branch (`usesOffBranchState`),
it binds one record of this change's check, lookup, and anchored-marker writer (§ 2.6) over the context's checkout, Git
executor, and store, and carries it to every caller, its rebind on another checkout (`withCwd`) included.
Store start's create-new, whose spawn takes the handler's ports today (`handlers/start-store.ts`), takes the executor's,
and the cold start takes the executor's store and record through its slot (§ 2.5). Over the in-repo implementation the
context carries no record, so the check's and the writer's callers read the today-behavior default
(`createDefaultLocusPorts`), and the lookup's two callers (`findWorkUnitHoldingCheckout`,
`lib/work-unit/verbs/unshared-work.ts`, and teardown's, `lib/work-unit/verbs/teardown-store.ts`) their own marker scan,
as today (A1). The port's refusal carries the check's message whole, its repair included, and its caller
(`requireMarkerExclusivity`, `lib/work-unit/locus-ports.ts`) reports that message as given, since each refusal names its
own repair (§ 13) and an incomplete roster names no checkout. A roster that is not complete, or a marker that cannot be
read, refuses the check rather than admitting the write (§ 2.1), and the refusal names its repair (§ 13). A marker that
cannot be read names its checkout and what the read reported (`readWorktreeMarkerGeneration`,
`lib/git/worktree-marker.ts`): a `malformed` marker with its message and path, or the error the read threw for any
failure but a missing file. Its repair: inspect that checkout, then repair or remove its marker, or remove the checkout.
An incomplete roster names the rerun once Git lists the worktrees. The lookup fails closed as the check does: a roster
that is not complete, a marker on any registered checkout that cannot be read, or two checkouts whose markers name the
work unit reject it, naming the condition and its repair as the check does and two holders naming both (§ 13), never
returning no checkout, since its port returns a checkout or none and carries no refusal; a husk-stamped marker names no
holder, as the scan it replaces skips it (`findWorkUnitHoldingCheckout`). The guard is per machine, as markers are;
across machines the work unit's owner governs. Until the flip, Git's refusal and the cold start's own check, which
inspects only its own checkout (`coldStartOccupancyRefusal`), stay as today.

#### 2.5 The cold start

`runColdStart` (`commands/start.ts`) keeps one shape across the flip once the seed handling that precedes it has landed
(§ 1.3): `--from` sets `Origin` for an issue reference and passes every other seed through for the agent to read, and the
cold start enters at `draft-design` (§ 16).

- **Its entry from the flip** is the transition-write-path change's store-backed start (`handleStoreStart`,
  `handlers/start-store.ts`), which hands a nameless `arc start --here` to its cold-start slot (`admitColdStart`) ahead
  of its dispatch, and a named `arc start <name> --here --new` from its create-new arm (`create`), in place of that
  arm's refusal of in-place creation, which stays for an empty slot (A3). This change fills the slot at its production
  point, `handleStart`'s (`handlers/start.ts`), which the CLI calls with no overrides, handing it the store and the port
  record of the executor it builds (§ 2.4, A1). A named start so reaches the cold start only once store start has
  resolved the name through `lookup` (`resolveStartName`), which takes a former slug to its work unit and refuses an
  Errand's, dispatched it over the store's lifecycle view with `create: true` (`resolveStartDispatch`), which refuses
  unless it selects `create-new`, and refused `--class`, as the in-repo arm dispatches and refuses `--class` before its
  cold start; so a name the store holds refuses before anything is written, and the cold start runs no dispatch of its
  own (A3); a nameless start derives its name from the branch and dispatches nothing, as today, so a derived name the
  store holds meets the record write's conflict, after which the rollback removes the marker and the cold start refuses,
  naming the held work unit, `arc start <name> --new --here` for a new one under another name, and for the held one the
  step its state takes, which `arc status <slug>` shows (§ 13).
- **Its occupancy check** reads the current work unit from the marker plus the store (§ 2.2), and the marker itself,
  since that resolver (`readClaimedCurrentWorkUnit`, `lib/store/current-work-unit-marker.ts`) reads a transient role and
  a husk stamp as no work unit and never reads `spawnedByArc`. From the flip the cold start admits one present marker,
  an anchored marker naming a work unit the store holds no record of, which only a crashed cold start leaves (below),
  and refuses every other, naming its exit:
    - a transient marker, the exits of its role, as `arc locus release` reports them (§ 5);
    - a marker naming a work unit in flight, work there or free it there as § 2.4 names;
    - a husk-stamped marker, its teardown;
    - a marker naming an ended work unit, `arc teardown <slug>`, or `arc locus release <slug>` where another identity
      owns it (§ 5);
    - a marker naming a backlog work unit, `arc locus release <slug>`;
    - a spawned marker naming a work unit the store holds no record of, a spawn's residue, `arc locus release <slug>`,
      which removes that checkout (§ 5).
- **Its meta** is written through the store by the meta kind's creation writer (`renderMetaFile`,
  `lib/store/kinds/meta/projection.ts`), with no `SESSION-NOTES` seed from the flip (§ 2.8).
- **From the flip `arc start --here` writes no tracked file, cuts no branch, seeds no `SESSION-NOTES`, and never moves
  `HEAD`.** Its records go through the store, and in its checkout it writes only the anchored marker and the editor
  documents, each with its entry in the clone's exclude file. The protected-base cut of `plan/<name>` and its rollback's
  branch deletion retire on the capability, with the `plan/` prefix, since a planning work unit holds no branch.
- **Its sequence from the flip,** after the dispatch and the occupancy and exclusivity checks (§ 2.4), puts its one
  record write last, so nothing in the store ever needs undoing: 1. the marker's ignore rule
  (`ensureWorktreeMarkerIgnored`), registered as every marker creator registers it; 2. the editor documents
  (`writeEditorDocuments`), which are checkout-local and read nothing from the meta; 3. the anchored marker (§ 2.6); 4.
  the call of the scaffold, whose arm from the flip writes the meta through the store, the one record write (§ 2.8).
- **A failure** at any step leaves no record, and removes the marker where step 3 wrote it (`rollbackColdStart`, whose
  branch deletion and clean of the meta's file serve only the in-repo arm). A hard crash between steps 3 and 4 leaves an
  anchored marker naming a work unit the store holds no record of, which derivation reports unresolved (§ 2.1), with its
  repairs (§ 4.3): the cold start rerun in that checkout reads such a marker, on a complete read of the store and
  `lookup`, as no occupancy and replaces it, and `arc locus release` clears it (§ 5). Only a crashed cold start leaves
  one: every other writer of an anchored marker has its work unit's record first, and a spawned marker naming no record
  is a spawn's residue, which the occupancy check refuses (above).
- **Its prompt and report** (`coldStart`, `handlers/start.ts`) from the flip neither refuse a detached `HEAD` nor offer
  to cut `plan/<name>`, since the cold start moves no `HEAD` and cuts no branch, and they name the work unit and the
  checkout where they print the meta's path and a branch today.
- **Until the flip** the cold start runs as today and writes no marker (§ 2.7).

#### 2.6 Every in-place arm writes an anchored marker

From the flip, since derivation reads only the marker and the store, every arm that claims a checkout in place writes an
anchored work-unit marker (`spawnedByArc: false`):

- **the cold start,** this change's (§ 2.5);
- **graduation in place** (`runGraduate` with `inPlace`, `commands/start.ts`), whose atomic graduation checks the branch
  out with no marker today (`occupy`, `lib/work-unit/atomic-graduation.ts`), so the marker is written there, inside its
  rollback (§ 16);
- **`arc materialize --here`,** through `reconcileWorkUnitWorktree`'s in-place leg, which writes none today (§ 16);
- **Errand promotion on the primary,** this change's: today promotion removes the primary's transient marker
  (`removePrimaryTransientOccupancy`, called by `settlePromotedOccupancy`, `lib/errand/promote-runtime.ts`), and from
  the flip it replaces the transient marker's generation with an anchored work-unit marker in one write, so the work
  unit carries on where the Errand ran and no crash leaves the primary with neither marker. A rerun that finds its own
  anchored marker treats the occupancy as settled, as `convertSpawnedMarker` treats a converted marker. On a spawned
  checkout promotion converts the transient marker (`convertSpawnedMarker`), as today.

Graduation in place and `arc materialize --here` write the anchored marker through a port the transition-write-path
change injects, whose default writes nothing, as today's marker writer writes nothing for a checkout ARC did not create
(`writeWorktreeOwnershipMarker`, `lib/git/worktree-marker.ts`); this change binds it to its own anchored-marker writer,
the one the cold start and promotion write through, as it binds the exclusivity check and the lookup (§ 2.4, § 16). The
writer takes the checkout, the marker, and an optional expected generation, and composes the marker generation
operations (`createWorktreeMarkerGeneration`, `replaceWorktreeMarkerGeneration`, `lib/git/worktree-marker.ts`):
without an expected generation it creates exclusively, and with one it replaces the generation holding those bytes. It
returns `created` or `replaced`, each with the bytes written, so a rollback removes exactly the generation it wrote
(`removeWorktreeMarkerGeneration`); `exists` when a marker is present and no generation was expected; or
`generation-mismatch` when the present marker is not the expected one. The cold start creates, or replaces a crashed
cold start's residue at the bytes it read (§ 2.5); promotion replaces the transient marker at the bytes it read.

**An occupied checkout refuses before any Git step (A4).** From the flip graduation in place and
`arc materialize --here` refuse a checkout whose marker names anything but the work unit they claim, before any Git
step, so `HEAD` stays as found. Their occupancy guard's store arm (`readStoreOccupancy`,
`lib/work-unit/lifecycle-guards.ts`), which graduation's transition runs in its guard phase and `arc materialize` before
its reconcile (`claimMaterialization`, `lib/work-unit/verbs/materialize-store.ts`), reads the marker as well as the
current work unit, since the claim read it resolves that through (`readClaimedCurrentWorkUnit`) takes a transient,
husk-stamped, ended, backlog, or no-record marker as no work unit. It refuses each such marker naming the exit the cold
start's occupancy check names for it (§ 2.5), and a crashed cold start's anchored no-record marker with the frame's two
exits (§ 4.3); a marker naming the work unit itself passes to the exclusivity check, which refuses it naming
`arc locus release` (§ 2.4). The anchored-marker writer's `exists` then arises only when a marker appears between that
read and the write, and is reported naming the checkout and its marker (§ 13).

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

- **Session start finds each such checkout:** a checkout with no marker, its folder present (§ 2.1), that has out a
  branch linked by an in-flight work unit this identity owns. Its materialize offer carries
  `arc materialize <slug> --here` for that work unit, with that checkout to run in (§ 4.3), which writes the anchored
  marker. Such a work unit leaves the offer's ordinary set, since a spawn would meet Git's refusal; a paused one stays
  with the paused-work slot, whose item carries the same action (§ 4.4).
- **A registration whose folder is missing** — a checkout deleted by hand — is no such checkout (§ 2.1), whether it
  holds the branch or, for a work unit with no branch, sits at the path a spawn would take. Its work unit takes the
  ordinary offer, since a work unit's spawn clears a registration whose folder is missing from its path and its branch
  before adding its checkout (§ 16), and the sweep reports the registration meanwhile (§ 12.2).
- **A work unit no checkout here holds** takes the ordinary offer (§ 4.5), one cold-started on base under partial
  protection among them: moving state links no branch for a work unit whose `Branch` is empty or names base, which is
  where a partial-protection cold start leaves it (`runColdStart` cuts `plan/<name>` only on a protected base).

#### 2.8 The workspace, session notes, and scratch

- **The session-notes path.** Six readers build it today, each its own way:
    - handoff's restate probe, which scans the identity's folder for the one work-unit folder holding a
      `SESSION-NOTES.md` and finds none where there are several (`resolveSessionNotesPath`,
      `lib/handoff/session-notes-path.ts`, called by `restateCandidates`, `handlers/status/session.ts`);
    - handoff's surfaces (`resolveHandoffSurfaces`, the same handler), whose path the status run reads for the active
      work unit (`commands/status/run.ts`);
    - `arc view`, for one named work unit (`resolveWorkUnitSessionNotesPath`, `lib/handoff/session-notes-path.ts`);
    - the load set's own entry (`lib/load-set/projection.ts`);
    - the user-reference reconcile's probe in the session-init binding (`handlers/status.ts`) and its command
      (`handleUserReconcileReferences`, `handlers/user.ts`).

  Until the flip each keeps its own resolution, the restate probe's scan among them. From the flip all six read one
  resolver, `resolveWorkUnitSessionNotesPath`, keyed by the work unit, which gives the meta's projected path, since the
  session context is the meta's (§ 9.1); the load set therefore carries no separate session-notes entry, the meta
  being already a full entry. The re-pointing lives in that resolver's arm from the flip alone: the session-notes
  address (`resolveArcPath`'s `session-notes` document) and `materializeWorkUnitSessionNotesPath` stay the per-work-unit
  workspace's, so the workspace's removal (`runUserClose`, `commands/user/close.ts`, which `arc user close`, teardown of
  an abandoned work unit, and a transition leaving active call) keeps removing that folder and never reaches the
  meta's. The seed's writers write nothing from the flip: the scaffold's `runUserOpen` call through the scaffold's arm
  (below), and start's stamp of the seed's `Commit at Handoff` (`stampStartSessionNotesCommit`, `handlers/start.ts`),
  which keeps the workspace's address, by finding no seed there, which it already tolerates.
- **The load set's meta and task-list paths** come from the layout resolver, where callers supply them today. From the
  flip the task list's path resolves from the work item's task-list record; until then the meta's `Task List` pointer
  gives it, as today (`lib/locus/subject-meta.ts`).
- **The spawn's scaffold** (`scaffoldIntoWorktree`, `lib/git/worktree-scaffold.ts`), which create-new and the cold start
  share, writes the meta and calls `runUserOpen` (`commands/user/open.ts`) for the workspace and its `SESSION-NOTES`
  seed. Its marker write, gated by `createdByArc`, writes nothing for either caller: create-new's marker is the spawn's
  (`reconcileWorkUnitWorktree`), and the cold start passes `false`. From the flip the scaffold itself branches on the
  capability, creating the meta through the store and calling no `runUserOpen`, so it seeds no `SESSION-NOTES`, an arm
  the transition-write-path change builds (§ 16). The cold start keeps its call, as the last step of its sequence, and
  writes its anchored marker itself before it, its ignore rule first (§ 2.5), so the marker stays machine-local.
  `arc user open` (`handlers/user.ts`) refuses `unsupported` from the flip, naming the meta's session context; until
  then it runs as today.
- **Scratch.** The projection creates `.arc/user/<identity>/scratch/work-unit/<slug>/`, empty, for the checkout's own
  work unit. From the flip the user-reference reconcile reconciles the person's folders there through `lookup`, its
  slot planning and `arc user reconcile-references --apply` applying, since session start writes nothing (§ 3.5): a
  folder whose work unit was renamed follows its current slug, applied unasked as the reconcile's reference rewrites
  are; one whose work unit has ended is reported with its path, for its person to remove (§ 4.3); and a name
  resolving to no work unit is left and reported. The reconcile never removes a folder, `--apply` included, since its
  apply runs unasked and a folder may hold anything the person put there. An absent scratch root plans nothing. A
  promoted work item's folder reconciles as a fresh start's does, and the tests include one.

### 3. In-flight derivation and overlap

#### 3.1 The in-flight set

From the flip in-flight derivation lists work items through the store at placement active — work units and open Errands
— and reads each one's lifecycle facts there, rather than listing metas at branch refs (`analyzeInFlightSnapshot`,
`deriveInFlight`, `lib/git/in-flight-derivation.ts`). A remote branch that outlives its work item is a locus hint —
evidence of where work sits — never lifecycle authority. The oracle behind the `errandState` and
`materializableWorkUnits` slots reads this set (`getOracle`, `handlers/status.ts`); `workUnitState` reads roster
rows (§ 2.1). From the flip the oracle lists the set whether or not a remote is configured or reachable, where today it
reports no entries when the session needs no remote or cannot reach it. The in-flight expansion
(`runActiveInFlightExpansion`, `expandActiveInFlight`, `runActiveInFlight`, `commands/active/in-flight.ts`;
`handleActiveInFlight`, `handlers/active.ts`) keeps its result shape until the flip. The in-flight work-unit sweep
(`enumerateOwnedIntegratingWorkUnits`, `lib/session-init/in-flight-work-unit-sweep.ts`) reads roster rows, skipping a
row with no `metaFilePath` and deriving the name from the meta path's basename (`workUnitNameFromMetaPath`); from the
flip it takes each row's work-unit identity (§ 2.1).

- **An entry's branch is optional from the flip.** A branchless planning work unit has none, so `branch`, required
  today (`InFlightLocation`, `lib/git/in-flight-derivation.ts`), is absent for it: an entry takes its branch from the
  work item's branch link and its checkout from the marker roster (§ 2.4). Lifecycle's callers keep the in-repo
  expansion (§ 1.2), so the shape is locus's and status's.
- **Claims stay in flight.** Today the derivation lists the identity's grooming and housekeeping claims that name a
  branch as transient entries, by the claim's slug, through the one-snapshot index it reads Errands from
  (`slugByBranch`, `classifyInput`), and reports a transient record whose branch no ref holds as residue
  (`errand-record-without-branch`). Claims link no branch, so from the flip the derivation lists them through the
  store's claim kinds (`claims/groom`, `claims/housekeep`), each with its checkout from the roster row whose marker
  names it; a branch a claim names is no unlinked ref, and an open Errand or a claim whose branch no ref holds still
  reports as residue. A claims read that is not complete marks the set degraded, as an incomplete transient read does
  today.
- **A paused work unit stays in flight.** A pause changes neither `State` nor placement, so the derivation's
  `scheduling` axis, built today from the lifecycle index's parked slugs (`listParkedSlugs`) as `parked`, reads the
  pause record from the flip and takes `paused` (§ 4.4). `parked` stays the in-repo arm's value, whose consumers treat
  it as out of flight; `paused` is in flight for every consumer.
- **`arc status <slug>`'s locus reads.** The slug query (`handlers/status/lifecycle.ts`) reads the work unit's worktree
  path, the read path for its operational boundary, and the in-flight warnings from the composed lifecycle index
  (`resolveCallerComposedLifecycleIndex`: `worktreePathBySlug`, a record's `writablePath`, and `qualityFacts`). From the
  flip the worktree path comes from the roster's lookup of the checkout whose marker names the work unit (§ 2.4), a
  lookup that rejects reporting its condition in place of the path, never no checkout, the read path is that checkout,
  the warnings come from the in-flight set listed through the store, and with `--fetch` the remote's reachability comes
  from the store's pull (§ 4.8). The query's state and record are the transition-write-path change's, and the
  operational boundary the delivery change's (§ 16).
- **Until the flip** the derivation reads branch refs as today.

#### 3.2 Errands and claims list apart

Today one pinned read of the identity's Errand ref (`refs/arc/user/<identity>/errands`) returns Errands and grooming and
housekeeping claims together, as absent, a root-level error, or a complete snapshot with per-entry diagnostics
(`readTransientIdentitySnapshot`, `lib/errand/identity-snapshot.ts`), and the derived evidence consumes it directly
(`lib/locus/derived-evidence.ts`).

- **From the flip** Errands are project-scope work items listed through the store at placement `active`, and claims stay
  identity-scoped, so the two are acquired separately, each pinned at its own version with the same three outcomes and
  per-entry diagnostics kept apart. The listing takes `active` only, since a closed Errand's record stays at `completed`
  (§ 8) and its slug may be reused, while discovery keys each Errand by its slug (`readTransientIdentitySnapshot`'s
  projections, `lib/errand/identity-snapshot.ts`). The derived frame's identity discovery (`DerivedIdentityDiscovery`,
  `lib/locus/derived-reader.ts`) carries the two acquisitions, each with its own status. A listing of Errands alone
  never stands in for the claims, and its readers that admit an Errand's terminal or merge (`authorizeErrandTerminal`,
  `lib/errand/terminal-authority.ts`; `selectCurrentErrandMergeIdentity`,
  `scripts/integration/errand-merge-composition.ts`) still require both complete. The claims, this identity's own, admit
  no diagnostic, as today. Of the Errands, which list everyone's, the listing's diagnostics refuse nothing by
  themselves, since a diagnostic's key names an entry, not the slug and claim the subject is known by, and another
  person's malformed record is not the subject's to repair and would otherwise stop every Errand's close and merge: the
  gate resolves the subject Errand's record by `lookup` through its checkout claim (`CheckoutClaimSchema`'s `errand`
  arm, `lib/store/lookup.ts`) and reads it, refusing, naming the record and what was reported, where either refuses with
  anything but `not-found`; where the lookup finds none while the Errands' listing carries a diagnostic, it refuses
  naming those diagnostics and their remedies, since one may be the subject's own record (§ 13). A lookup that finds
  none beside no diagnostic refuses nothing here, as today's authority (`authorizeErrandTerminal`) refuses only on
  diagnostics, then works from the marker's roster row.
- **An Errand's owner is a field of its record from the flip,** where today the identity-scoped ref it lives on implies
  it, as the shipped record kinds settle once Errands list at project scope. The Errand record
  (`lib/errand/identity-record.ts`) gains an optional `owner`, the person's identity slug as `resolveIdentity` resolves
  it (`lib/git/identity.ts`), which the open writes from the flip and the import writes from the identity ref it
  re-homes each Errand from (§ 16); the in-repo arm writes none, its ref still implying the owner (§ 15.1). From the
  flip every Errand record therefore carries one, and a record without one is malformed: the listing reports it among
  the Errands' per-entry diagnostics, the in-flight set keeps it, as `keepForIdentity` keeps an entry with no owner, and
  the open's resume and `arc errand materialize` refuse it, naming the record. In team mode the in-flight set (§ 3.1)
  leaves out another identity's Errands by it, where today's identity filter passes every Errand (`keepForIdentity`,
  `lib/git/in-flight-derivation.ts`) and only reading one's own ref keeps another's out. In any mode `errandState`'s
  materializable Errands and its resume detection take only this identity's own (§ 4.3), and the open's resume
  (`arc errand open <slug>`) and `arc errand materialize` refuse an Errand another identity owns, naming its owner,
  since no one else takes over an Errand (Non-Goals).
- **Until the flip** the derived evidence keeps its direct read of the one snapshot, so a single pin holds, as today:
  the store's transient listing reads a fresh snapshot on every call, so two listings would be two pins.
- This change moves its locus consumers' listing protocols onto the two acquisitions. The one-snapshot index projection
  (`lib/errand/record.ts`) stays the in-repo arm for its other callers — status (`handlers/status/views.ts`,
  `lib/status/project-oracle-context.ts`), the composed lifecycle index (`lib/work-unit/composed-lifecycle-index.ts`),
  and the review gate (`scripts/review-gate/`). Status's and the review gate's arms from the flip are their owners'
  (§ 16). The composed lifecycle index has none: it stays an in-repo arm, and each of its callers reads the store from
  the flip through its owner's arm instead — the lifecycle verbs' through the store's slug-keyed view, the integration
  checkpoint's (`scripts/integration/checkpoint-composition.ts`) through delivery's, `arc status <slug>`'s locus reads
  through this change's (§ 3.1), and `arc view`'s explicit target through the status change's (§ 16).

#### 3.3 Overlap for a state target

`arc errand check` (`handleErrandCheck`, `handlers/errand.ts`) builds the in-flight set, projects it to an overlap
roster that keeps work units by name and Errands by slug (`projectInFlightToOverlapRoster`), and for each candidate
other than itself runs a committed probe (`git diff <base>...<sha> --name-only -- <targets>`, against `origin/<base>`
where it resolves and the local base otherwise, `preferRemoteBaseRef`) and, for a checked-out candidate, an uncommitted
probe (`git status --porcelain`), which `HEAD` and `MERGE_HEAD` checks bracket to report `indeterminate`
(`detectForeignArtifactOverlap`, `lib/git/foreign-artifact-detection.ts`). Targets are prefix-matched paths with no
special handling for `.arc/`.

- **From the flip, targets split through the layout resolver.** One classifier inverts `resolveArcPath` over every
  registered file address — a location plus a kind's file pattern — to a kind and key, or none, in two steps the
  layout's dependency rule splits: beside the resolver in `lib/layout/`, which imports no store, a path inverts to its
  address, where today's identification recognizes only work-unit artifacts and project documents
  (`lib/layout/identification.ts`); beside the kinds in `lib/store/`, an address maps to its kind and key, over the
  whole address union, so an address the projection adds takes its kind there. A directory inverts to none, since one
  directory's path can resolve from more than one address: `.arc/active` is the active placement root and every
  project-scope active work unit's container. A target the classifier places nowhere is a code target and keeps both
  probes. A state target resolves to its record, and the check reports overlap when that record's own work item is in
  flight in another locus. An entry-list target — the kinds `personal/inbox`, `project-inbox/inbox`,
  `work-item/inbound`, `work-item/description`, `personal/errand-queue`, and `personal/working-memory` — reports none,
  since its writes merge by entry, and any other concurrent state write still meets compare-and-swap at write time, so
  the check stays advisory. The store's write provenance names the verb, the record, and its owner, never the work item
  that wrote it, so the in-flight work item carries the state arm rather than the store's `changes`. The projection
  registers its locations and file names as addresses, the inbound list's and the Errand description's among them, so
  the one classifier serves its adoption of new files too (§ 16).
- **An entry with no branch link takes no committed probe;** its uncommitted probe still covers a checkout here.
- **A paused work unit counts, through both probes,** since a pause keeps its checkout and any edits in it. Today's
  skip of parked work units rests on park's teardown of the checkout (`parkActive`,
  `lib/work-unit/verbs/park-resume.ts`) and retires with park.
- **Self-exclusion by identity.** From the flip the check excludes the locus running it, Errand or work unit, by its own
  identity from the marker, where today it excludes by name, by originating checkout, or by
  `resolveOriginatingMetaPath`, and an Errand only by its checkout.
- **Errands stay candidates,** as they are today: the roster lists in-flight Errands beside work units, and an online
  read classifies Errand branches from the remote's Errand records (`readFetchedTransientInFlightIndexes`).
- **The pre-commit foreign-write hook** (`scripts/check-foreign-writes.ts`) runs the same overlap over a commit's
  staged paths from the same reads — `runActiveInFlight`, `listParkedSlugs`, and `resolveOriginatingMetaPath` — when a
  staged path is named like a work unit's artifact (`selectForeignWriteCandidates`; `classifyPathSurface`,
  `lib/git/write-context.ts`), which framework files such as `.arc/system/methods/spec-review.md` also are. From the
  flip a commit stages no work unit's state, so the hook branches on the capability and returns before any read; until
  the flip it runs as today, and the deletion pass removes it (§ 1.5).

#### 3.4 Shipped-work readers

The locus and session-init readers of the archive index (`lib/work-unit/completed-index.ts`) — the stale-worktree and
orphan-branch sweeps (`lib/session-init/stale-worktree-sweep.ts`, `lib/session-init/orphan-branch-sweep.ts`) and the
derived locus evidence (`lib/locus/derived-evidence.ts`), whose read the derived lifecycle evidence and the roster
consume — read placement and `lookup` from the flip, and none keys on an archive folder's number, which the archive's
sync may renumber until the archive is published. Retired-subdirectory detection
(`lib/session-init/retired-subdir-detection.ts`, which hands the shipped set it reads to `planRetiredSubdirReconcile`)
reads none from the flip, its slot resolving `skip` (§ 4.2). Until the flip each of the four keeps its read of the
archive at a base ref, with its object and shallow-history guards (§ 1.5): the in-repo implementation lists
placement from the checkout's working tree and local branches (`composedMetas`, `lib/store/in-repo/meta.ts`), which is
not the shipped set those readers take today.

The Candidate mutation owner's completed set (`resolveCompletedCandidateWorkUnits`,
`handlers/candidate-mutation-owner.ts`) reads no archive: it takes the working tree's lifecycle index
(`buildLifecycleIndex`) at location `completed`. From the flip it reads placement `completed` through the store, and
until then it keeps that read (§ 1.5).

The residue sweep's retirement read (`runLandedRetirementSweep`, `lib/session-init/lifecycle-residue-sweep.ts`) admits
only a Git-proven abandon (`git-transition`) today. From the flip it takes an abandonment's evidence from its lineage
record through the store's retirement read (`readStoreRetirementEvidence`, § 16), which returns it as `lineage` evidence
under the `discard` rule, since the Git-backed teardown authority it builds today (`createTeardownRetirementAuthority`)
admits no lineage, so a work unit abandoned on another machine reports this machine's checkout once its record is
pulled. Since that read throws for every outcome alike, the sweep reads it only for a work unit with no live record
whose lineage, by `lookup` from its origin, is an abandonment; a work unit with a live record, with no lineage, or with
a lineage of another kind reports no retirement, as today's `evidence-missing` and `unsupported-transition` do, and a
lookup or read refusing with anything but `not-found` — a lineage record with no `retiredBranches` among them — reports
its message as the checkout's repair (§ 4.3). The Git-proven abandon stays its in-repo arm. Its candidates stay
branched, and the stale-worktree sweep's selection by placement leaves it a branched checkout an abandonment retires, so
each checkout reports in one sweep, as today.

#### 3.5 Former slugs

From the flip the reconcilers — the current-work-unit reconcile (`lib/session-init/current-wu-reconcile.ts`) and the
user-reference reconcile (`lib/user-reference-reconcile.ts`) — resolve a former slug from the live primary record
through `lookup`, and list lineage only for terminal outcomes: a cut or an abandonment. They keep their fail-closed
outcomes: the current-work-unit reconcile's refusals, `ambiguous-evidence` and `rename-cycle` among them
(`DependencyReconcileConflictReason`), and the user-reference reconcile's unavailable authority and per-entry conflict
advisories (`resolveReferenceTransition`). Until the flip they read today's transition records and the dispositions
projected from them (`lib/work-unit/transition-disposition-query.ts`).

The user-reference reconcile's prose scan takes its subjects from today's transition list, and `lookup` resolves one
slug at a time while a rename from the flip writes no lineage, so from the flip the scan takes its former slugs from the
work items' aliases, listed through the store, plus lineage for cuts and abandonments. A cut's advisory carries its
successors: the reconcile's `decompose` outcome (`lib/work-unit/reference-reconcile.ts`) gains `successors`, read from
the cut's lineage record, where today it carries none.

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
not the interval remains, and it tells the interval from retirement as § 2.1 states: by the archive cadence, and under
`with-integration` by the landing-commit link, a lineage record retiring the work unit, or its checkout's `HEAD` landed
in base. Tests cover, under each cadence, a restart after archive and before merge, merge before teardown, a merge made
outside ARC by merge commit and by squash, a work unit retired by a cut or an abandonment, a partial teardown, and
missing or ambiguous completed subjects, across the reader, session-init, and recovery.

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
`git show <seedHead>:<taskListPath>`. The nudge markers stay machine-local files under the identity's `.internal/`,
read as files at a path built from the personal root's address (§ 2.1). The two reconcile slots, gated today on a work
unit's name parsed from its meta's file name (`metaWorkUnitNameFromActive`, `commands/status/run.ts`), take it from the
frame's subject from the flip.

- **`currentWuReconcile`'s reads are bound once.** Today `handleSessionInitStatus` binds the lifecycle index, the
  transition queries, and the artifact reads inline, beside the same reads `buildCurrentWuReconcile`
  (`lib/work-unit/executor-context-current-wu.ts`) and the reconcile's own command (`handleWuReconcile`,
  `handlers/reconcile.ts`) each bind, and all three run `prepareCurrentWuReconcile`
  (`lib/work-unit/side-effects/discharge-dep-edges.ts`). From the flip session-init's binding moves onto the
  store-backed prepare the transition-write-path change builds for all three (`createStoreReconcilePrepareContext`,
  § 16), dropping its inline reads; the other two bindings are that change's. Until the flip the inline bindings stay
  (§ 1.5): over the in-repo implementation they read the transition records that carry today's renames. The slot only
  prepares, and the prepare never reads the pause; the apply is `arc wu reconcile <slug> --apply` (`handleWuReconcile`,
  `handlers/reconcile.ts`), a prepared write under the protocol § 16 names, which refuses on a paused work unit. From
  the flip the prepare throws over a lifecycle listing with a malformed or missed record (`store.lifecycle-incomplete`,
  its diagnostics its `cause`) or one it cannot read (`store.lifecycle-unreadable`), through `requireCompleteInventory`
  (§ 16), where today's index drops such a meta (`buildLifecycleIndex`); the slot catches either and reports each
  diagnostic's condition as its condition, with that diagnostic's remedy as its action, or, for an unreadable listing or
  an incomplete one whose `cause` holds no diagnostic, the thrown message as its condition (§ 4.3), rather than failing
  as a probe.
- **The user-reference reconcile** rewrites personal records rather than a work unit's artifact group, and from the flip
  takes the prepared-write shape over them: it revalidates each prepared record by its version and applies every
  rewrite in one `batch` with expected versions. The session notes it rewrites are from the flip the meta's session
  context (§ 2.8), so the same batch writes the meta through the meta kind's writer at its expected version beside the
  personal records. Until the flip it re-plans under the notes lock, as `runUserReferenceReconcile` does today.
- **The reads stay narrow:** each goes through the contract without reshaping the workflow's prose conditionals over
  the envelope.

#### 4.2 Rebuilt slots and their schemas

This change rebuilds these slots: `workUnitState` (`WorkUnitStateResult`), `errandState` (`ErrandStateResult`), `user`
(`UserSessionInitStatusResult`), `userReferenceReconcile`, `derivedLocusState` (`DerivedLocusFrame`),
`currentWuReconcile`, `sweep` (`StaleWorktreeSweepResult`), `recovery` (`SessionInitRecoveryValue`), `inboxState`,
`materializableWorkUnits`, `orphanBranchSweep`, and `roster` (`WorktreeRosterResult`, served too as `worktreeRoster`),
whose rows admit no `branch` and carry their work unit (§ 2.1); and adds two, `pausedWork` (§ 4.4) and
`inboundBackPressure` (§ 4.6). Each registers its schema with the contract's schema registry, which `arc schema` serves,
as the session-init envelope's own schema is registered (`session-init-envelope`), never a hand-written copy.

- **The two new slots' presence.** `pausedWork` is present whenever the identity resolves, as `{ items: [] }` before
  the flip; `inboundBackPressure` is present when one work unit is current, as `null` before the flip. Each registered
  schema admits both arms' values, the fields from the flip among them.
- **`retiredSubdirs`** keeps its read of shipped work until the flip (§ 3.4). From the flip it resolves `skip` with no
  candidates, since the per-work-unit workspace it reconciles retires and the user-reference reconcile's scratch plan
  takes its place (§ 2.8).
- **`user`** carries, from the flip, the store's pull at session start in place of the notes channel (§ 4.7, § 4.8):
  the pull's states (`PullResult`, § 16), a `designation-needed` state with its remote, choices, and remedy, and no
  notes fields. The `user` probe (`handlers/status.ts`) produces it, since today's producer
  (`runUserSessionInitStatus`, `commands/user/sync-status.ts`) is notes-sync machinery, which this change leaves alone.
- **`errandState`**'s materializable Errands (`lib/session-init/materializable-errands.ts`) report `originEntry` as the
  record holds it (§ 7.6): the qualified ID for an Errand a start from the flip opened, the entry's title for one opened
  before.
- **`inboxState`** leaves execute-bound entries out of its routable count and counts them apart (`inbox-state.ts`); from
  the flip both counts read the Errand queue, since the marks it reads give way to the queue (§ 7.6).

#### 4.3 Every slot carries its action

Each slot § 4.2 names carries, on each condition it reports that wants a repair, `actions`: a non-empty array of one
shared shape, absent when the condition wants no repair. The shape is the shipped remedy shape (`RemedySchema`,
`lib/store/refusal.ts`) — precomposed `text`, and an `argv` where running it as given repairs the condition — plus an
optional absolute `checkout`, below. It is an array because some conditions carry two: a landed retirement its teardown
and its successor's start, a reconcile its inspection and its apply. The shape is registered once and every slot reuses
it. Today's command fields — `currentWuReconcile`'s bare `recommendedCommand`, `userReferenceReconcile`'s
`recommendedCommand`, the residue sweep's `teardown` and `remedy`, and the refresh remedies, whose schemas pin exact
command tuples — stay beside `actions` until the deletion pass, since the workflow text reads some of them until the
flip's rewrite (§ 1.5).

- **Typed or text.** An action with an argv is typed. One with text alone names the command with its arguments where the
  repair needs the agent's or the owner's input or order: which task a rewritten commit belongs to (§ 11), the
  decisions a re-triage or a survivor's carry takes (§ 4.6, § 7.4), or a ceremony that runs under its own interlocks, as
  an archive or an integration does. A condition that wants no repair carries no action. Whether an action runs unasked
  is the slot's own `recommendedAction`, which the CLI computes as today — `recovery`'s `switch` for an exact, clean
  switch and `userReferenceReconcile`'s `apply` among them; an action no slot marks to run unasked is an offer the
  workflow runs only on the person's approval. Typed means runnable as given.
- **The checkout to run in.** An action whose verb works on, or writes from, the checkout it runs in carries that
  checkout: the task close, which takes no slug and computes its set from that checkout's `HEAD`; the reconcile's apply,
  which refuses unless that checkout's branch owns the slug (`resolveOwnedTarget`, `handlers/reconcile.ts`);
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
  `lib/session-init/lifecycle-residue-sweep.ts` and `lib/work-unit/retirement-lifecycle-result.ts`). The residue sweep
  reports no successor today (`runLandedRetirementSweep` projects successor readiness over an empty set), so its
  successor action applies only where successor readiness reports one (`projectSuccessorReadiness`). A work unit
  `awaiting-review`, and a retirement surfaced as `blocked`, want no repair and carry no action.
- **The notes channel's recommendations** (`inferUser`, `lib/session-init/recommended-action.ts`) are the envelope's
  recommendation rather than a slot's action; they keep today's shape until they retire at the flip (§ 4.7).

| Slot and condition                                                                                                                         | Action                                                                                                                                          | Form  |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `currentWuReconcile`: tracked repairs pending                                                                                              | `arc wu reconcile <slug> --apply --json`, in the work unit's checkout                                                                           | typed |
| `currentWuReconcile`: advisory or conflicted                                                                                               | `arc wu reconcile <slug> --json`, to inspect, as today                                                                                          | typed |
| `currentWuReconcile`: the prepare threw over an incomplete or unreadable lifecycle listing (§ 4.1)                                         | each diagnostic's own remedy, naming each record and its condition, or the remedy the thrown message carries                                    | text  |
| `userReferenceReconcile`: rewrites pending                                                                                                 | `arc user reconcile-references --apply --json`, as today                                                                                        | typed |
| `userReferenceReconcile`: advisory references                                                                                              | `arc user reconcile-references --json`, to inspect, as today                                                                                    | typed |
| `userReferenceReconcile`: rename evidence unavailable or in conflict                                                                       | its precomposed text                                                                                                                            | text  |
| `userReferenceReconcile`: an ended work unit's scratch folder (§ 2.8)                                                                      | the folder's path, for its person to remove once nothing in it is wanted                                                                        | text  |
| `workUnitState`: `merged-needs-archival`                                                                                                   | the archive, in the work unit's checkout                                                                                                        | text  |
| `workUnitState`: `mergeable`                                                                                                               | the integration, after merging base in where `behindBase` is known true                                                                         | text  |
| `workUnitState`: `mergeability-unavailable`                                                                                                | its precomposed guidance (`mergeabilityGuidance`)                                                                                               | text  |
| `workUnitState`: `blocked`                                                                                                                 | the open pull request's requested changes or failing checks, which its owner answers                                                            | text  |
| `workUnitState`: `stale`                                                                                                                   | its once-a-day nudge                                                                                                                            | text  |
| `errandState`: an Errand to materialize                                                                                                    | `arc errand materialize <slug> --claim-id <id> --expected-head <head> --json`                                                                   | typed |
| `errandState`: the current branch's Errand to resume, or residue                                                                           | its precomposed text                                                                                                                            | text  |
| `inboxState`: routable captures (`housekeepNeeded`)                                                                                        | the drain, `arc-session --housekeep`                                                                                                            | text  |
| `inboxState`: the person's survivors (§ 7.4)                                                                                               | `arc inbox personal`, then the drain's carry                                                                                                    | text  |
| `sweep`: a removable worktree                                                                                                              | `arc teardown <name>`                                                                                                                           | typed |
| `sweep`: a work unit's husk, on the primary                                                                                                | `arc teardown <name>`, as today                                                                                                                 | typed |
| `sweep`: a work unit's husk, from a linked checkout                                                                                        | `arc teardown <name> --husk <path>`, as today                                                                                                   | typed |
| `sweep`: a branch's husk, on the primary                                                                                                   | `arc teardown --branch <ref>`, as today                                                                                                         | typed |
| `sweep`: an Errand's husk, a branch's from a linked checkout, or a manual-only stamp                                                       | its text, for manual cleanup, as today                                                                                                          | text  |
| `sweep`: a landed retirement's residue                                                                                                     | `arc teardown <slug>`, its teardown remedy, as today                                                                                            | typed |
| `sweep` from the flip: a lineage lookup or retirement read refusing with anything but `not-found` (§ 3.4)                                  | its message: for a lineage record with no `retiredBranches`, repair its retired branch links, then `arc teardown <slug>`                        | text  |
| `sweep`: a landed retirement's one ready successor, where successor readiness reports one                                                  | `arc start <slug>`, its successor remedy                                                                                                        | typed |
| `sweep`'s `missingFolders`: a branched registration whose work unit has ended, unlocked (§ 12.2)                                           | `arc teardown <name>`                                                                                                                           | typed |
| `sweep`'s `missingFolders`: a branched registration whose work unit has ended, locked (§ 12.2)                                             | `git worktree unlock <path>`, then `arc teardown <name>`                                                                                        | text  |
| `sweep`'s `missingFolders`: any other registration, unlocked (§ 12.2)                                                                      | `git worktree remove <path>`, once `<path>` is confirmed still missing                                                                          | text  |
| `sweep`'s `missingFolders`: any other registration, locked (§ 12.2)                                                                        | `git worktree unlock <path>`, then `git worktree remove <path>`, once `<path>` is confirmed still missing                                       | text  |
| `sweep`: a checkout whose work unit another identity owns (§ 5)                                                                            | `arc locus release <slug>`                                                                                                                      | typed |
| `sweep`: another checkout whose marker names a work unit with no record (§ 2.5)                                                            | `arc locus release <slug>`                                                                                                                      | typed |
| The residue sweep's deferred rename move                                                                                                   | `git worktree move -f -f <from> <to>`                                                                                                           | typed |
| `orphanBranchSweep`: a shipped work unit's branch                                                                                          | `arc teardown <name>`                                                                                                                           | typed |
| `orphanBranchSweep`: a branch whose commits all landed (§ 12.4)                                                                            | `git branch -D <name>`                                                                                                                          | typed |
| `orphanBranchSweep`: an adopted branch not landed                                                                                          | `git branch -D <name>`, as its owner's step                                                                                                     | text  |
| `materializableWorkUnits`: a work unit no checkout here holds                                                                              | `arc materialize <slug>`                                                                                                                        | typed |
| `materializableWorkUnits`: its branch out in a checkout with no marker, its folder present (§ 2.7)                                         | `arc materialize <slug> --here`, in that checkout                                                                                               | typed |
| `materializableWorkUnits`: discovery pending a fetch                                                                                       | `arc active in-flight --json`, its refresh remedy, as today                                                                                     | typed |
| `recovery`: branch-gone's removable candidate                                                                                              | `arc teardown <name>`                                                                                                                           | typed |
| `recovery`: a checkout to switch to                                                                                                        | that checkout's path, to continue there                                                                                                         | text  |
| `recovery`: the in-flight tier pending a fetch                                                                                             | `arc active in-flight --json`, its refresh remedy, as today                                                                                     | typed |
| `recovery`: an exact, clean switch to a branch with no checkout                                                                            | `git switch <branch>`, after `git fetch` where only its remote holds it                                                                         | text  |
| `recovery`'s `missingFolders`: a registration whose folder is missing, unlocked: `missing` (§ 12.1)                                        | `git worktree remove <path>`, once `<path>` is confirmed still missing                                                                          | text  |
| `recovery`'s `missingFolders`: a registration whose folder is missing, locked: `locked` (§ 12.1)                                           | `git worktree unlock <path>`, then `git worktree remove <path>`, once `<path>` is confirmed still missing                                       | text  |
| `recovery`: any other outcome — main-fallback, surface, unproven, an external candidate, or a prompted switch to a branch with no checkout | its precomposed text, as today                                                                                                                  | text  |
| `pausedWork`: a review-due item (§ 4.4)                                                                                                    | its review prompt, naming `arc resume <slug>`, `arc handover <slug> --to <identity>`, `arc pause <slug> --open`, and `arc abandon <slug>`       | text  |
| `pausedWork`: each item (§ 4.4)                                                                                                            | `arc resume <slug>`, or a materialize as `materializableWorkUnits` carries it                                                                   | typed |
| `inboundBackPressure` past a threshold (§ 4.6)                                                                                             | `arc inbox <slug>`, then the owner's re-triage                                                                                                  | text  |
| `derivedLocusState`: commits not yet closed, every one made fresh (§ 11)                                                                   | `arc task close`, in the work unit's checkout                                                                                                   | typed |
| `derivedLocusState`: commits not yet closed, one of them not made fresh (§ 11)                                                             | the bare close where the open task's work is among them; otherwise a closed task's re-close, `arc task close <id>`; in the work unit's checkout | text  |
| `derivedLocusState`: an Active work unit with no linked branch out (§ 11)                                                                  | the work branch to switch to                                                                                                                    | text  |
| `derivedLocusState`: an Active work unit linking no branch (§ 11)                                                                          | `arc deactivate <slug>`, then `arc activate`, which links a work branch                                                                         | text  |
| `derivedLocusState`: no base ref, with `origin` (§ 11)                                                                                     | `git fetch origin +refs/heads/<base>:refs/remotes/origin/<base>`                                                                                | typed |
| `derivedLocusState`: no base ref, no `origin` (§ 11)                                                                                       | `git branch <base> <commit>`, a base commit chosen                                                                                              | text  |
| `derivedLocusState`: no project ID, the port absent or its read failing (§ 2.1, § 11)                                                      | the port's failure, naming the project identity record's read and its remedy                                                                    | text  |
| `derivedLocusState`: the entering checkout's anchored marker names a work unit with no record (§ 2.5)                                      | `arc start <slug> --new --here` in that checkout, to finish the cold start, or `arc locus release <slug>`, to clear the marker                  | text  |
| `derivedLocusState`: the entering checkout's spawned marker names a work unit with no record (§ 2.5)                                       | `arc locus release <slug>`, which removes the checkout                                                                                          | typed |
| `user`: the store needs a designation (§ 4.8)                                                                                              | the store's remedy argv                                                                                                                         | typed |

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
  work unit; or, when a checkout with no marker, its folder present, still has the work branch out — released, or
  claimed in place before the flip (§ 2.7) — `arc materialize <slug> --here` with that checkout to run in, since a spawn
  would meet Git's refusal there. A registration whose folder is missing is no such checkout, and the spawn clears it
  (§ 2.7).
- **Entering a paused checkout.** The derived frame's work-unit context carries the pause record, and the frame's
  guidance (`locusGuidance`) renders the pause, its reason, and its resume notes before any work starts. Orientation is
  then not bare-clean, so an entry shortcut never fires past it.
- **Until the flip** the slot reports nothing, and park stays as today.

#### 4.5 The materialize offer

From the flip `arc materialize <slug>` gives a checkout to any in-flight work unit this identity owns that no checkout
on this machine holds — remote-only or released here, paused or not — and leaves a pause in place (§ 16); where the
lookup of a work unit's holder rejects (§ 2.4), the offer reports that condition for it rather than offering it. Session
start's offer (`findMaterializableWorkUnits`, `lib/session-init/materializable-work-units.ts`, behind the
`materializableWorkUnits` slot) lists the same set less paused work units, which the paused-work slot lists, and offers
`arc materialize <slug> --here`, with its checkout, for a work unit whose branch a checkout with no marker has out, its
folder present; a registration whose folder is missing holds no checkout, so its work unit takes the ordinary offer,
whose spawn clears it (§ 2.7). It reads the in-flight set listed through the store, which no remote gates (§ 3.1), so a
work unit released here is offered with no remote configured. Today both the offer and the verb admit only remote-only
work units that are not parked (`findMaterializableWorkUnits`, `handleMaterialize`).

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

From the flip, under `session.remote_sync`, session start calls the store's `pull` (§ 16), in the `user` probe. Where
the store reports that a remote must be designated (`designation-needed`), session start carries it in the `user` slot
as an orientation line with the remedy's argv. `arc join` asks among the state's choices on a terminal, the
recommended one carrying the argv, and otherwise reports it the same way; neither ever guesses. This change reaches
`pull` through the narrow port § 16 names, whose default pulls nothing until it is bound.

#### 4.9 The compaction seed

The compaction seed stays a read-only projection, produced from the session-init envelope by the shared load-set
projection (`resolveLoadSetManifest`, `lib/load-set/projection.ts`), never a bespoke parser. Its task cursor is derived
from the task list and compared against the seed's baseline. It records the state version beside an explicit code-head
baseline and resolves its meta path through the layout resolver, where `emitCompactionSeed` matches a hand-written
`.arc/active/meta-` pattern today (`lib/compaction-seed/emitter.ts`), and `COMPACTION_SEED_SCHEMA_VERSION` advances for
both. Where `version()` refuses, the seed records `stateVersion: null`, and recovery rebuilds from the current state,
as it does for a state version that no longer resolves.

- **Recovery's task-list reads** (`resolveRecoveryTaskListEvidence`, `handlers/recover.ts`) read the seed's task list
  with `git show <seedHead>:<taskListPath>` and the fresh one from the checkout's file; from the flip both go through
  the store, the seed's as of its state version and the fresh one at the current version.
- **Recovery's archived-integration relocation** (`archivedIntegrationRelocation`, `lib/recover/audit.ts`), which builds
  the active and completed meta paths by hand, takes them from the layout resolver.

### 5. `arc locus release`

`arc locus release [<slug>]` releases a work unit's checkout. With a slug it acts on the checkout whose work-unit marker
names that work unit, found through the roster, refusing when no checkout on this machine holds it, naming `arc locus`,
which lists this machine's checkouts, and refusing with the lookup's message where the lookup rejects (§ 2.4); without
one, on the current checkout. It refuses a checkout holding a transient role, naming that role's exits as handoff's
locus plan names them (`transientPlan`, `lib/handoff/locus-plan.ts`) — `arc errand leave` for an Errand under full
protection; finish, promote, or abandon for a partial one; ship, close, or abandon for grooming; complete or abandon for
housekeeping — since those exits keep preconditions the release does not check (§ 12.1). It is a subcommand of the
existing `arc locus` inspect command (`handleLocus`), which keeps working unchanged.

- **A spawned checkout** takes the removal function, which runs the removal check itself (§ 16). Before it runs, a
  spawned checkout whose detached `HEAD` holds commits not on base refuses, naming them and `git switch -c <name>`,
  since the check reads no commits and `git worktree remove` would leave them unreachable, as the transition-write-path
  change's activation and `arc base sync` refuse such a `HEAD`.
- **An anchored checkout** is kept, through the release teardown runs on one (§ 16): only the removal check's projection
  part runs, so a dirty checkout does not refuse it, then the projection's `release` slot, refusing if that refuses,
  and then the marker is cleared. The slot persists every edit or refuses, and passes until the projection fills it.
- **Either arm revalidates the marker's generation first**, and run from inside the checkout it releases, moves the
  process out first, as teardown's locus hop does (`runTeardown`, `lib/work-unit/verbs/teardown.ts`).
- **Who may release.** It releases a paused work unit's checkout for its owner, and a checkout whose work unit another
  identity owns — the handover case, which the stale-worktree sweep reports with `arc locus release <slug>`, runnable
  from any checkout (§ 4.3). From the flip the sweep reports such a checkout past the two filters that keep it out
  today, the roster's owner filter (`filterRosterByIdentity`, `lib/git/worktree-roster.ts`) and the sweep's skip of a
  marker another identity spawned (`runStaleWorktreeSweep`). It refuses on a work unit this identity owns that is in
  flight and not paused, so it never strands a live locus, or that has ended, whose checkout its teardown removes or
  releases; each refusal names the remedy the state takes: `arc pause <slug> --reason <text>` for a Planning or Active
  one; its integration, then teardown, for an Integrating one; and `arc teardown <slug>` for one that has ended. It
  releases a backlog work unit's checkout for its owner, since none of that work unit's work runs there. A checkout
  whose marker names a work unit with no record, a crashed cold start's or a spawn's residue (§ 2.5), it releases for
  anyone, since no owner governs it.
- **Before the flip** it refuses `unsupported`, naming `arc park` and `arc teardown`, which serve it until then.

### 6. The entry grammar (shared decision 9)

#### 6.1 One grammar for every entry list

The personal inbox, the project inbox, `WORKING-MEMORY`, a work unit's inbound list, an Errand's description, and a
person's Errand queue share one grammar.

- **A managed field** is ``- _Name:_ `value` ``, its backticked value marking it parsed, as today
  (`lib/session-init/managed-field.ts`). Managed fields lead an entry, grouped together and separated by a blank line
  from the bare prose descriptors that follow, as today. A `_Disposition:_`, when present, is the entry's first body
  line, its own group ahead of the managed fields, as `executeBoundMark` requires (`lib/user-sync/inbox-writer.ts`).
- **A `WORKING-MEMORY` entry** carries its one field, the `_Remove when:_` trigger, as an italic line under its header
  (`WM_REMOVE_WHEN`, `lib/user-sync/parser.ts`). The module writes it `_Remove when: <trigger>._` and reads that form
  and the asterisk form `*Remove when: <trigger>.*`, both of which today's entries carry; a trigger wrapped across lines
  ends at its closing delimiter.
- **One module, the entry-field module, defines each field once,** and each kind's parser admits the fields it uses
  (§ 6.3). The module reads a field in every spelling today's entries carry and writes only the managed form:
  `_WU_Target:_` in the three spellings the capture gates accept (`TARGET_LINE`, `lib/user-sync/inbox-target.ts`), since
  a missed target line would let a gate pass, and `_Shapes:_` in its bare prose form too.
- **Entries key on `_Id:_`,** the concurrency library's key, rather than the bold title `parseUserInbox` keys on today
  (`lib/user-sync/parser.ts`). The title stays the human handle; keyed on the title, a retitle would read as a removal
  and an insertion.
- **An entry's version** is a digest of its bytes and its section as the entry list splits them — exactly what the
  entry merge compares when it decides whether an entry changed (`same`, `lib/store/concurrency/entry-merge.ts`) —
  written `v1:` and the first 16 hex characters of the SHA-256 of the section's name and the entry's bytes. The
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
  member, and `_Inbox:_`, `personal` or `project`, qualifies it. Since members merge by ID, `arc errand queue set`
  refuses a set naming both entries of an ID both inboxes hold, a rare case, naming both. `_Rank:_` is the member's rank
  key, which orders the queue in place of file position, so the run order merges by entry. `arc errand queue set` sets
  the queue whole but writes rank keys only for the members it adds or moves: it keeps in place the longest subsequence
  of current members, contiguous or not, already in the set's order — among several, the one whose members come earliest
  in the current queue — and places each other member, one at a time over the changing list, through the concurrency
  library's placement, which re-keys tied successors in the same write (`placeRankedStub`,
  `lib/store/concurrency/rank.ts`), so two sets clash only on a member both wrote, a tie's re-keyed successors included.
  Its entries are references, never items, each heading carrying the referenced entry's title for legibility.

#### 6.4 The ID's place in an entry

`stampEntryIds` places a heading entry's `_Id:_` after its last bullet of the form `- _Key:_` whose key holds no
underscore, so an italic-key prose descriptor after the managed fields draws the ID away from them, splitting the group,
and `_WU_Target:_` is skipped. This change amends its heading arm to place the ID after the last of the kind's managed
fields, or, when the entry has none, after a leading `_Disposition:_`, which keeps the place § 6.1 gives it, or directly
under the heading, matching each field by name from the entry-field module's list, since a match on the managed shape
would also catch prose descriptors that open with a backticked token. The list reaches the stamp in the entry config, as
an optional `managedFields` (`EntryListConfig`, `lib/store/concurrency/entries.ts`), since the concurrency library
imports no kind; where it is absent, today's placement holds. A field-header entry keeps its ID after its
`_Remove when:_` trigger, placed after the trigger's last line, where today's arm places it after the trigger's first
line and so splits a wrapped trigger. Each placement has a test.

#### 6.5 `WORKING-MEMORY` headers fail loudly

`lib/user-sync/parser.ts` recognizes an entry header only as one line matching `WM_HEADER` (`^\*\*.+:\*\*\s*$`), so a
header wrapped past the line limit is silently folded into the entry before it. From the flip, with its parser in its
registry slot, the `personal/working-memory` kind requires the documented entry shape (`strategy-session-operations.md`
§ Working Memory) — a one-line header (`WM_HEADER`), its `_Remove when:_` trigger the next non-blank line — and rejects
a wrapped or colon-less header loudly: a trigger whose nearest non-blank line above is not such a header refuses, naming
that line and the shape, while bold-led prose elsewhere in an entry's body is untouched. This tightens today's parser,
which accepts a trigger anywhere in an entry (`parseWorkingMemory`); a malformed header with no trigger at all still
folds into the entry before it, and a trigger inside an HTML comment, as the seeded file's commented example is, never
refuses. The write refuses before the concurrency library's entry splitter (`isEntryHeader`,
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
- **`--target <slug>`** filters the personal inbox to the entries naming that target and keeps today's `clear`,
  `named`, and `refused` result, on which the three capture gates branch; the gates' calls move to it in the flip's
  rewrite. It refuses on any other list, naming the form `arc inbox personal --target <slug>`, since only Work Unit
  captures carry `_WU_Target:_`.
- **A work unit's inbound list** also carries its pending count and oldest age (§ 4.6).
- **One listing serves every reader:** the drain, the exit gates, session start, and the routing verb's callers.
- **Its result** registers its schema, as the slots' do (§ 4.2).
- **Before the flip** `arc inbox` refuses `unsupported`, naming `arc user inbox-list --target`, which serves as today.
  From the flip `arc user inbox-list` refuses `unsupported`, naming `arc inbox personal --target <slug>`.

#### 7.2 The routing verb, `arc route`

`arc route <entry-id> --from <list> --expected-version <version> --to <destination>` moves an existing entry, and
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
  entry's ID and destination, the durable carrier an out-of-band message points at. The insert form stamps the new
  entry's `_Id:_` before the batch, so its receipt and the report carry it.
- **One mover.** That write set — the destination's insert under its kind's field rules, below, the source's removal
  at the version read, and the receipts — is the one every move composes: the route, an Errand's start and
  `arc errand link` (§ 7.6), the abandon's return (§ 7.5), and a survivor's carry (§ 7.4).
- **An entry gone from both.** A move whose entry is gone from the source and absent from the destination refuses,
  naming where the entry's latest receipt says it went, or that no receipt names it.
- **Who writes.** Anyone inserts; only a started work unit's owner removes an entry from its list, anyone a backlog
  stub's, and anyone the project inbox's, the team's shared inbox. The verb refuses a removal from a started work unit's
  inbound list by anyone but its owner, naming the owner; the host cannot enforce the rule against a write made outside
  the verb, as it enforces no ARC writer rule.
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
  its lineage record names; and an ended Errand, closed or abandoned, naming the inbox, since a survivor of finished
  work is ordinary work.
- **Before the flip** it refuses `unsupported`, naming the routing method's until-the-flip binding
  (`route-discovered-work`, "Binding: carrying out outcomes"), hold-and-route, since no workflow calls it until the
  flip's rewrite.

#### 7.3 Routing receipts

- **Every move into or out of an inbox writes one,** from the flip, whichever verb makes it: `arc route`, an insert into
  an inbox included, an Errand's start, `arc errand link`, and an Errand's abandon. The receipt kinds share the conflict
  records' write-once mechanism today, which admits `merge`, `sync`, `route`, and `resolve` (`writerVerbs`,
  `KIND_MECHANISMS`), so with the declarations (§ 6.6) they take their own, admitting `route`, `errand-open`,
  `errand-link`, and `errand-abandon` beside `merge`, `sync`, and `resolve`, and leaving the conflict records' as it
  is. Those four are the provenance verbs the moving runtimes pass.
- **Each receipt is its own record,** written once under a fresh key, with the entry's ID in its content, since the
  kinds are keyed and write-once (`lib/store/catalog.ts`) and one entry gathers a receipt for every move.
- **Where it goes:** to the ref of each inbox the move leaves or enters — the person's own ref for their personal
  inbox, which only they write, and the project inbox's for the project inbox — so a move between the two writes one to
  each, in the batch that already writes both refs. A move that leaves and enters no inbox — between a work unit's
  inbound list and an Errand's description — writes none, so an edit racing it survives in the list it left as an
  ordinary entry, which that list's owner disposes of by removing it from the list's projected file (§ 16).
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
      unit's — it replaces that entry's title and prose, keeping its managed fields and `_Routed from:_` line, as a
      write at the destination record's version as the verb read it, so an edit to the held entry landing meanwhile
      meets the replacement as a same-entry clash, kept as a conflict record with both sides, rather than being
      overwritten;
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
- **An abandon whose entry another open Errand holds,** read by the entry's inbox and ID as a start reads it (§ 7.6),
  returns nothing: the description stays with the abandoned Errand, and the abandon names the Errand that keeps the
  entry. Each returned entry gets a receipt, after which it reads as unstarted work.
- **One batch** retires the Errand, empties its description, and writes the returned entries and their receipts, so a
  replayed abandon returns nothing twice.
- **An open that fails** after the start's batch landed rolls back through the same return, retiring the record in the
  batch that returns the entry to the list it left, with its section, its `_Created:_`, and a receipt.

This amends the contract's return to "the inbox it came from", which assumed a description fills only from an inbox, as
`arc route` and a route out of an executing work unit into an Errand no longer do (§ 15).

#### 7.6 Starting an Errand, and the Errand queue

- **Starting an Errand moves its entry,** from the flip. A full-protection Errand started from an inbox entry is a
  routing whose destination is the new Errand: one batch creates the work item, makes the entry its description, removes
  the entry at the version read (§ 6.1), drops the entry from the person's queue, and writes the routing receipt, and
  the Errand's origin names the inbox and the entry's ID. A start fetches first when online and refuses an entry that is
  gone, naming where its latest receipt says it went, or one an open Errand holds: an entry of that inbox and ID whose
  latest receipt (§ 7.3) moved it into the description of an Errand still open, a reading the abandon's check shares
  (§ 7.5), since an ID is unique only within its list. An entry whose Errand already closed is reported rather than
  refused, since a surviving edit can carry new work. An Errand opened from text mints its description's entry in
  the open's batch: its intent as the title, with a fresh `_Id:_` and `_Created:_`, as the storage contract's D11
  settles. `arc errand link --from-inbox` moves a capture into an Errand opened from text the same way, beside the entry
  minted at open. Until the flip an Errand starts only from its person's own inbox and the entry stays there until
  close, as today.
- **The origin's carriers.** An Errand's origin keeps today's fields and changes what a start from the flip writes in
  them. The record's and the claim's inbox arm (`lib/errand/identity-record.ts`, `lib/locus/schema/identity.ts`), under
  the discriminator `origin: inbox | description` the record keeps as its own (`spec-seam-record-kinds.md` § 4), carries
  in `originEntry` the entry's qualified ID, `<personal|project>:<id>`, the form `--from-inbox` takes from the flip
  (§ 7.7), and `originEntrySourceDigest` `null`, where today it carries the entry's title and source digest, which the
  in-repo arm keeps. So the arm's digest admits `null` (`InboxOriginShape`; `inboxOrigin`), as does the link
  transition's (`OrdinaryErrandTransition`, `lib/errand/identity-transitions.ts`), which `desiredRecord` writes onto the
  record. A record written before the flip keeps its title and digest after it: the import moves its entry into its
  description before stamping IDs, and rewrites no record's origin (§ 16). A partial Errand's binding — the worktree
  marker's origin fields, which `isWorktreeMarker` admits only as a pair (`lib/git/worktree-marker.ts`), written at
  provisioning (`partialOrigin`, `lib/locus/provisioning-marker.ts`) from the provisioning authority's partial-Errand
  arm (`ProvisioningAuthority`, `lib/locus/provisioning-authority.ts`), which the open builds — carries in `originEntry`
  the qualified ID, with `originEntryVersion`, the version observed at open, in place of `originEntrySourceDigest`; the
  marker check, the authority, and `partialOrigin` each admit `originEntry` with exactly one of the two. The roster
  row's `origin` (`projectMarkerDetails`, `lib/locus/derived-roster.ts`) likewise holds `entry` with either
  `sourceDigest` or `version`. The close reads the binding through the derived evidence's marker projection
  (`projectMarker`, `lib/locus/derived-evidence.ts`, into the occupancy marker's type, `lib/locus/occupancy-marker.ts`),
  that row, and the partial settlement (`settlePartialErrandAtRuntime`, `lib/errand/partial-settle-runtime.ts`), each
  admitting the version beside the digest, since a projection that dropped it would read no origin and settle removing
  nothing. The open composes the origin from the entry it starts from (`openOrdinaryErrand`, `lib/errand/open.ts`), and
  the link from the entry it links (`linkOrdinaryErrand`, `lib/errand/link.ts`).
- **Every projection of an origin reports it as its source holds it.** A result, slot, or provisioning field that
  reports an origin reports `originEntry` and `originEntrySourceDigest` as the record or binding holds them: a title and
  digest where the in-repo arm or a start before the flip wrote it, the qualified ID and `null` where a start from the
  flip did. Each such field is free text (`LocusOpaqueTextSchema` in the results, `NON_EMPTY_TEXT` in `errandState`'s
  view, a string elsewhere), so no schema changes for the ID, and the qualified ID a result reports is the operand a
  start or link takes. This binds every projection, not a list of them; today's include the open's, link's, leave's,
  close's, and abandon's results (`ErrandOperationResultSchema`, `lib/errand/operation-result.ts`;
  `ErrandTerminalResultSchema`, `lib/errand/terminal-result.ts`, through `partialCaptureSettlement` and the
  full-protection settlements in `handlers/errand.ts`), promotion's `commit-required` settlement
  (`lib/errand/promotion-result.ts`, from `receiptFromAuthority`, `lib/errand/promote-runtime.ts`, and
  `lib/errand/promote.ts`), and `errandState`'s materializable Errands (`lib/session-init/materializable-errands.ts`,
  § 4.2). Readers keep their reads: a check for no inbox origin still reads `originEntry` as `null`, which only a
  description-origin Errand carries; the comparisons of an origin — the link's conflict and idempotency checks
  (`linkOrdinaryErrand`; `desiredRecord`, `lib/errand/identity-transitions.ts`) and the open's resume check
  (`validateResumeContinuity`, `lib/errand/open.ts`) — compare the pair as the record holds it; and materialize's
  re-feed of the recorded origin into the open (`handlers/errand.ts`) passes that pair back, which the open's resume
  compares with the record.
- **A settlement's `disposition` reports the verb's own effect on an inbox entry.** A partial close reports `removed`
  where it removes the entry and `retained` where it leaves an entry edited since in place (§ 7.7), and from the flip
  `absent` where it finds the entry already gone, as a rerun does after a failed occupancy settlement, since the partial
  settlement settles the inbox first (`settlePartialErrandAtRuntime`), where today it reports `removed`; a partial
  abandon reports `retained`, as today. From the flip a full-protection close reports `absent`, since the start moved
  the entry into the description and the close removes nothing (§ 7.7), and still names the origin; a full-protection
  abandon reports `retained`, its entries back in the lists § 7.5 names, or `absent` where another open Errand holds the
  entry and it returns nothing (§ 7.5). Promotion removes nothing from the flip: its runtime skips the inbox settlement
  step (`settlePromotedInbox`, `lib/errand/promote-runtime.ts`), whose digest guard would refuse an origin with a `null`
  digest (§ 8.3), and its `settled` arm, which carries no disposition, reports `originEntry` as `null`, as today.
- **The Errand queue.** From the flip each person's queue is an ordered list of references to entries in either inbox,
  by ID, at identity scope — never projected, read through `arc`, and merged by entry (§ 6.3) — replacing today's
  execute-bound marks and their file order (`listExecuteBoundInboxEntries`, `lib/user-sync/inbox-writer.ts`).
  `arc errand queue set` replaces `arc user inbox-mark-execute-bound`, taking entry IDs, each with its inbox, where that
  verb takes titles, and `arc errand queue` shows the queue; the drain's execute-now disposition appends to it. It holds
  references, never items, and claims nothing.
- **The next offer** — at startup and in `arc errand next` (`resolveExecutionStartupOffer`, through `handleErrandNext`,
  `handlers/errand.ts`) and after a close (`resolveExecutionNextOffer`, `lib/user-sync/execution-offer.ts`) — takes the
  queue's first entry a start would accept, and writes nothing: it leaves out a member a start would refuse and skips
  one in conflict, reporting each with `arc errand queue set` as its repair. The queue changes only by
  `arc errand queue set`, a start, and the drain's execute-now append; abandoning an Errand does not put its entry back.
- **Until the flip** the queue stays today's marks in the person's own inbox, set by today's verb, and
  `arc errand queue` and `arc errand queue set` refuse `unsupported`, naming `arc user inbox-mark-execute-bound`. From
  the flip that verb refuses `unsupported`, naming `arc errand queue set`, and `inboxState` reads the queue (§ 4.2).

#### 7.7 Removal by ID and version

- **The drain's removal** takes the entry's `_Id:_` and version (§ 6.1) from the flip, removing only that version and
  leaving an entry edited since in place and reporting it; until then it removes by title. Removal stays idempotent: a
  no-op that reports when the entry is already gone, since several backstops may replay it.
- **The title-matched removals** of `arc errand close` and `arc user inbox-remove`, both through
  `removeCurrentInboxEntry` (`commands/user/inbox-mutation.ts`), and Errand promotion's digest-checked removal
  (`runUserInboxMutation`, `handlers/errand.ts`) serve until the flip. From the flip a full-protection close and
  promotion remove nothing, since the start already moved the entry into the Errand's description (§ 7.6); the partial
  close and `arc user inbox-remove` remove by the entry's ID at its version, read with the parser. From the flip
  `arc errand open --from-inbox` and `arc errand link --from-inbox` take `<personal|project>:<id>`, since an ID is
  unique only within its inbox, and `arc user inbox-remove` takes `--id <id> --expected-version <version>`; each refuses
  a title from any of today's sources — the `--from-inbox` title, `--inbox-title-file`, `--inbox-entry-file`, and
  `inbox-remove`'s title positional (`resolveInboxEntryOperand`, `lib/inbox-entry-operand.ts`).
- **Under partial protection** an Errand has no portable record or description, so its origin entry stays in the inbox
  until close removes that exact ID at its observed version. Its start drops the entry from the person's queue, as a
  full start does, and its abandon keeps the entry in the inbox; until the flip the abandon clears the entry's mark,
  as today.
- **A partial Errand opened before the flip** binds its origin by title and digest, and the move onto the ref store
  writes no marker (§ 2.7), so its close from the flip resolves a binding with no ID once, by the digest it carries, to
  the entry's ID and version, and removes by them; no match reports as today's digest mismatch does.

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

From the flip the Errand runtimes — open, close, abandon, leave, link, and promote, under `lib/errand/` — and
`arc errand materialize`'s read of the Errand it materializes (`handleErrandMaterialize`, `handlers/errand.ts`) read and
write the Errand record and claims through the store (`read`, `list`, `write`, `batch`) rather than calling the identity
transaction (`transactTransientIdentities`, `lib/errand/identity-transaction.ts`) themselves. Partial settlement reads
and writes no Errand record (`settlePartialErrandAtRuntime`, `lib/errand/partial-settle-runtime.ts`); its inbox removal
is § 7.7's.

- **The transition rules stay the runtimes'.** The transforms that authorize each transition (`ordinaryErrandTransform`
  and its retirement rules, `lib/errand/identity-transitions.ts`), which run inside the transaction's callback today,
  become each runtime's computation over the record it read, with no change to what they admit or refuse; they become
  no write check.
- **A stale version refuses unless already applied.** Each runtime writes the record it computed at the version it
  read. Records are stored per key, so the store refuses a stale version only when that Errand's own record changed.
  The runtime then reads the record once more: where it now equals the record computed, it reports `idempotent`, as the
  transform does today before it compares the request's `previous` (`transitionOrdinaryErrand`,
  `lib/errand/identity-transitions.ts`); otherwise it reports today's mismatch refusal. It recomputes nothing. A runtime
  that decides from the record pulls first when online, through the port § 16 names, as the transaction fetches first
  today.
- **One write step carries the companion writes.** The step that writes the record also carries the writes a
  transition makes beside it — a start's description, source inbox, queue, and receipts (§ 7.6), an abandon's return
  (§ 7.5) — in one batch, each at its expected version.
- **Close and abandon keep the record.** From the flip both write the record as the transition's `previous` holds it,
  its `updatedAt` stamped as the retirement's time, at placement `completed` rather than deleting it, as the `retire`
  arm does today (`ordinaryErrandTransform`); a closed Errand carries its landing-commit link and its close time (§ 8.1)
  and an abandoned one no link, so the contract's Errand schema gains only the owner (§ 3.2). A rerun retirement that
  finds the record already at `completed` reports `idempotent`, as the transform does today for one whose record is
  already absent.
- **Open Errands read at `active`.** The runtimes read an Errand through `lookup`'s claim, its slug and `claimId`; the
  open, which holds no claim until it opens, reads one to resume through `lookup`'s `slug` kind. Every reader of open
  Errands — the open's check for one to resume, `arc errand materialize`, the in-flight set, `errandState`, and identity
  discovery (§ 3.2) — takes placement `active` only, so a slug a completed Errand held, reusable once its record
  completes, never reads that record.
- **Until the flip** each runtime keeps calling the identity transaction itself (§ 1.5): the transaction fetches,
  reconciles, and publishes around its read, where the in-repo implementation's Errand reads are local-only
  (`readTransient`, `listTransient`, `lib/store/in-repo/transient-read.ts`), so routing them through the store would
  read an Errand that exists only on the remote as absent.

#### 8.1 The close's landing commit and close time

From the flip the close (`lib/errand/close-runtime.ts`) captures the Errand's landing commit on its record, naming its
repository by the project ID, as every commit capture does (§ 16). The landing commit is the commit the Errand's merge
made on base, never the Errand's head (`closeTargetHead`), which a squash merge leaves off base: for a merge through the
host, its merge commit, which the close's lifecycle read (`ChangeRequestLifecyclePort`,
`lib/errand/change-request-lifecycle.ts`) carries from the flip as the delivery host reports one (`mergeCommitSha`,
`lib/delivery/host.ts`); for ARC's own merge (`scripts/integration/errand-merge.ts`), the commit that merge wrote. The
close write stamps the record's `updatedAt` as the close time, by which a listing of closed Errands orders them. Today
the close deletes the record from the transient-identity ref (`ordinaryErrandTransform`'s `retire` arm,
`lib/errand/identity-transitions.ts`), and the last write to stamp `updatedAt` is the await-merge write. Until the flip
the close captures nothing and keeps today's deletion.

#### 8.2 The Errand's branch link

From the flip `arc errand open` (`lib/errand/open-runtime.ts`), under full protection, where it cuts the Errand's branch
(`chore/<slug>`, `lib/errand/open.ts`) — in place by `git checkout -b` (`lib/locus/provisioning-runtime.ts`) or in a
spawned worktree — writes the Errand's branch link, its repository the project ID and its ref `chore/<slug>` (§ 16),
recorded `created`, with no exclusions, since an Errand has no tasks for them to serve (§ 11, § 16). Under partial
protection it cuts no branch and writes no link, as an Errand there has no portable record (§ 7.7). Until the flip no
branch link is stored.

#### 8.3 Promotion

Promotion's one write and its branch are the transition-write-path change's (§ 16): from the flip, at either floor, it
cuts the work branch `<type>/<name>` (`--type`, default `feat`) at the Errand's tip, switches the checkout onto it, and
links it beside the Errand's branch, recorded `created` with the Errand link's exclusions, which are none. At the scale
floor the work unit is Active at once, so the Errand's commits stay in the close's default capture for the tasks it
backfills, which promotion's `Next Action` asks for (`metaOverrides`, `lib/errand/promote-runtime.ts`); a
derivation-floor promotion's work unit, in Planning, meets them in its activation's report, since activation adds the
branch's default set to its exclusions and reports them with the close that captures any that are task work (§ 16).
Today a derivation-floor promotion renames the Errand branch to `plan/<name>` (`promotionBranch`).

That change builds the write and the Git step as steps `promoteOrdinaryErrand` composes (`lib/errand/promote.ts`), in a
module of their own beside it. This change has the promotion runtime (`promoteOrdinaryErrandAtRuntime`) select those
steps on the capability, with its marker settlement (`settlePromotedOccupancy`): on a spawned checkout it converts the
transient marker (`convertSpawnedMarker`), as today; on the primary, from the flip, it replaces the transient marker's
generation with an anchored work-unit marker, a rerun finding its own marker settled (§ 2.6); and either way the runtime
runs the exclusivity check before `promoteOrdinaryErrand`, so a refusal leaves nothing written (§ 2.4). From the flip
the runtime also skips its inbox settlement step (`settlePromotedInbox`), since the start moved the entry into the
Errand's description (§ 7.7), and its settled result reports no origin, as today (§ 7.6). The selection lands once the
runtime's Errand record reads go through the store (§ 8), since the steps from the flip read the Errand from it. Until
the flip the runtime keeps today's steps and settlement, commit included.

### 9. Handoff and continuity

#### 9.1 Session context through `arc handoff write`

From the flip handoff's write is a verb, `arc handoff write`. Its request, a versioned JSON document on standard input
or in a file, carries only what the session decides: the `## Session Context` body, whole, `Next Action`, and an
optional `Session Type`, an omitted one writing `[none]`, since each handoff decides the next session's. The verb
computes the two anchors itself — `State at Handoff`, the store's `version()` as it read it before its write, the state
the handoff saw; and `Commit at Handoff`, the checkout's `HEAD` — and writes all five in one write of the current work
unit's meta (§ 2.2), at its current placement, through the meta's writers (`writeMetaStateAtHandoff`,
`writeMetaCommitAtHandoff`, `writeMetaSessionType`, `writeMetaNextAction`, `lib/store/kinds/meta/bullet-writers.ts`;
`writeMetaSessionContext`, `lib/store/kinds/meta/section-writer.ts`).

- **Its refusals.** It refuses a body line that would end the section — an H2 heading, or one trimming to `---`, the
  rule the section writer throws on (`writeMetaSessionContext`) without naming the line — naming that line, before any
  write. A `version()` that refuses refuses the handoff, writing nothing. On a checkout that holds no work unit it
  refuses, since a handoff between work units writes no session context (§ 13). Each refusal's request passes once
  repaired, and the tests run both.
- **It pushes nothing, and maintains the store.** Handoff's push stays its sync, under the sync interlock as today.
  After its write the verb calls the store's `maintain()`, through the port § 16 names, and reports the growth figures
  past their bounds, whether or not a sync follows (§ 9.3). A refused handoff calls no `maintain()`, and a `maintain()`
  that fails after the write landed is reported as a diagnostic while the handoff succeeds.
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

- **What restating reads from the flip.** Its anchors come from the meta (`stateAtHandoff`, `commitAtHandoff`,
  `lib/store/kinds/meta/`), where today it reads a baseline from `SESSION-NOTES` (`BASELINE_HASH_REGEX`,
  `lib/handoff/restate-candidates.ts`). Commits since handoff stay a Git walk from the code anchor; the tasks closed
  since come from the task-list record's `changes` since the state anchor, and changes to the work unit's notes from
  its notes record's `changes`, since a notes edit leaves Git's diff from the flip.
- **A missing history ref.** On a clone lacking an ended item's history ref, a read as of a state version refuses with
  the store's `state-unresolvable` code, naming each ref it lacks; the verb pulls them by name through the port § 16
  names and retries once, with no stop, so a person meets the refusal only when that pull fails (§ 16).
- **Another person's anchor.** Restating tells another person's anchor, when a work unit changes hands, by the meta's
  `Owner` in the content of the history entry that wrote the anchor (`HistoryEntrySchema`, `lib/store/contract.ts`) —
  the oldest of the newest run of entries that all hold the current `State at Handoff`, since a later write such as a
  handover carries the anchor unchanged under its new `Owner` — set against the identity restating, since stored
  provenance names the record's owner and never the person who wrote it (`StoredProvenanceSchema`,
  `lib/store/links.ts`). It then restricts `changes` to the work item's project-scope records, since `changes` between
  two people's states would carry the newer one's identity history whole.
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
take up. A handoff between work units, or an Errand's, writes no session context and calls no `maintain()`, nor does a
refused handoff (§ 9.1). A store with a remote is still maintained by each pull's fetch, but a local-only store whose
person never hands off a work unit goes unmaintained until one does, a residual the growth tripwire cannot report. The
bounds are constants beside the report, with no configuration key, since the signal is advisory and guards the store's
scale rather than a team's preference. Nothing calls the report before the flip, when `arc handoff write` starts and the
cutover rewires `arc sync`; over the in-repo implementation, which reports no measurements and no retries, it would show
nothing.

The bounds' basis: the notes-compaction advisory nudges past 2,000 commits (`COMPACTION_ADVISORY_HISTORY_THRESHOLD`,
`lib/user-sync/compaction-retention.ts`), the nearest measured analogue — this repository's one personal notes ref held
739 commits after fourteen weeks, about three a day over its last month, in 20 MB with a whole manifest per note, where
the store keeps one blob per changed file; and the storage contract's design expects one retry to settle a collision on
a shared ref.

### 10. Identity setup

#### 10.1 First records only when absent

`arc user add` (`commands/user/add.ts`) and, for `arc init` and `arc join`, `runPostInitSetup` (`lib/setup.ts`) write
the personal inbox's and `WORKING-MEMORY`'s seed files (`CROSS_WU_INSTANCE_FILES`) unconditionally today, overwriting
what is there. From the flip each creates an identity's personal records through the store only where they are absent:
a create the store refuses because the record exists reads as present and is skipped.

#### 10.2 An identity already in use

From the flip, when one of the three finds the identity's records already in the store, it says so and asks the person
to confirm the identity is theirs; a run that cannot ask reports it in its output. It warns and never refuses on its
own, since a slug cannot tell the same person's second machine from a second person who chose the same name, and it
misses two people who both set up before either syncs; a person who answers that the identity is not theirs stops the
run before it writes, and it names choosing another identity. It checks before it sets the identity (`arc.identity`) or
writes any record, and in `arc join` after join's pull, since on a fresh clone the records appear only once it pulls.
Each verb opens its store bound to the identity being set up — the store's ports take an optional identity in place of
the configured one (`createDefaultStorePorts`, `lib/store/default-ports.ts`) — so the check reads, and `arc join`'s pull
fetches, that identity's records whether or not `arc.identity` is set or names another (§ 16); from the flip `arc join`
pulls before it checks, which it does not today. Until the flip setup runs as today.

#### 10.3 Off the user-surfaces resolver

This change moves its own callers of the user-surfaces resolver (`resolveUserSurfaceResolver`,
`createUserSurfaceResolver`, `lib/user-surfaces.ts`) onto the store's personal records: `commands/user/add.ts`,
`commands/user/inbox-mutation.ts`, `handlers/derived-locus-state-probe.ts`, `handlers/errand.ts`, `handlers/recover.ts`,
`handlers/status/session-context.ts`, `handlers/status/session-evidence.ts`, and `handlers/user.ts` outside its
notes-sync commands. Over the in-repo implementation, which itself imports the resolver
(`lib/store/in-repo/personal-paths.ts`), nothing observable changes: `arc user add` opens its store bound to the
identity it adds (§ 10.2), so the in-repo personal records, which refuse any identity but the store's
(`personalIdentity`), resolve that identity's root as today. The resolver and `lib/user-surface-migration.ts` stay as
the in-repo arm until the deletion pass, and teardown keeps merging a linked worktree's copy up through the migration
until the flip.

### 11. Commits not yet closed

From the flip a task's commits are captured by the task close verb (§ 16). A branch link records **exclusions**, the
commits on its branch that are no task's work — an adopted branch's from before its activation, a kept branch's from its
time back in Planning, and a carried branch's from before moving state onto the ref store — which activation and the
import write (§ 16). Each capture and exclusion carries its commit's SHA and its **copy key**, which one function
computes (`lib/git/copy-key.ts`, § 16), so a copy of a commit that keeps its author line and diff, as a rebase that
changes neither makes, matches it.

- **The listing.** While an Active work unit has open tasks — a Planning one's wait for activation, which cuts or links
  its branch (§ 16) — the derived frame's entering work-unit context carries the set the close's default capture takes,
  computed once, for that checkout rather than for every roster row, by the same code, the default-set computation
  without its refresh (§ 16): the non-merge commits reachable from `HEAD` and from neither base nor base's
  remote-tracking ref, less every commit matching, by SHA or copy key, one of the work item's captures or one of the
  branch link's exclusions. Its copy keys come from that one function, since keys computed any other way never match.
  Session start (`derivedLocusState`) and recovery both list them beside the task cursor, with the close as the action,
  run in the work unit's checkout (§ 4.3). The listing and the close therefore agree: a base merge adds none, an adopted
  branch's earlier commits stay out, a scale-floor promotion's Errand commits stay in, no captured or excluded commit
  lists again, and the exclusions the import writes stand for every commit before the move. A checkout behind its
  branch, or lacking commits another machine made, lists over the commits it holds, as the close computes.
- **Where the listing and the close differ.** The listing fetches nothing and computes over the base refs the clone has,
  where the close refreshes base first, so after a fetch of the work branch alone it may list base commits the close
  then leaves out. Where those are all it lists, the close's refresh empties its set, so the close refuses, recording
  nothing and naming the commits the refresh found on base, and the next listing, over the refreshed ref, shows none of
  them. And the listing does not attribute: a rewritten copy of a captured or excluded commit, its author line kept and
  its diff changed, lists until a close takes it to its original's task or the exclusions (§ 16).
- **The listing's action.** The close with no IDs closes the cursor's task, and it takes to another task, or to the
  exclusions, only a commit whose committer time differs from its author time (§ 16). So the action is the bare close,
  `arc task close`, typed, only where every listed commit is one Git made fresh, its committer and author times equal,
  read from the commit header its copy key's author half is read from. Otherwise it is text naming both repairs, since
  only the agent knows whether the open task's work is among the commits: the bare close where it is, which also takes
  each rewritten copy of a captured or excluded commit to its original's task or the exclusions; where it is not, as
  after a hand amend of a closed task's commit, that task's re-close, `arc task close <id>`, which closes nothing new. A
  rewrite that writes a new author line — `--reset-author`, `rebase --ignore-date`, a squash by `git reset --soft` that
  names no commit to `-C` or `-c` — reads as fresh, as the close's own named residuals have it, so the typed bare close
  captures it to the cursor's task and closes that task, a named residual.
- **No linked branch out.** The close reads which of the work item's branch links the checkout has out through one
  resolver (§ 16) — `linked`, `detached`, `unlinked`, or `no-link` — and refuses on the last three, naming the work
  branch to switch to, or, where the work item links no branch, `arc activate` for a Planning work unit and
  `arc deactivate <slug>`, then `arc activate`, for an Active one. The listing reads the same resolver and
  reports that refusal, with its repair, rather than listing.
- **No base ref.** Where neither base nor base's remote-tracking ref resolves, the set would take the branch's whole
  history, so the listing reports the condition in place of the set, with the repair the close names where
  its own fetch brings in no base ref: base fetched by its explicit refspec,
  `git fetch origin +refs/heads/<base>:refs/remotes/origin/<base>`, which writes the ref even where the clone's
  configured refspec omits base, as a single-branch clone's does; or, in a clone with no `origin`, a local base branch,
  `git branch <base> <commit>` (§ 4.3).
- **A paused work unit.** The close refuses on one, naming `arc resume`, so the listing there takes `arc resume <slug>`
  as its action, its text naming `arc task close` to follow (§ 4.3).
- **Recovery lists them beside a matching cursor:** a compaction between a commit and its close leaves the cursor's task
  open with its commit landed, which the recovery audit reads as ready, the advanced `HEAD` explained drift
  (`auditTaskCursor`, `lib/recover/audit.ts`), with nothing naming the close, which the listing names.
- **Until the flip** tasks are ticked by hand and nothing is listed.

### 12. Removing and moving checkouts, and the orphan sweep

#### 12.1 Onto the removal function and check

The transition-write-path change builds one removal function for every removal ARC runs of a work unit's or Errand's
checkout, and one removal check that decides on its own whether a checkout can be removed, returning `removable`,
`missing`, or `refused` as `dirty`, `persist-would-refuse`, `unobservable`, or `locked` (§ 16).

- **The Errand's exits** through `lib/errand/terminal-occupancy.ts` — close, abandon, leave, and partial settlement,
  each through `settleTerminalOccupancy` — move onto the function. It runs inside each exit's own serialization and
  authorization, and the exits keep their preconditions: the marker generation, the branch and head match, the
  self-teardown locus hop, and the user-surface merge-up. On a spawned checkout the exit's own status read gives way to
  the function's check, so its refusal carries the check's outcome. The primary, which no exit removes, keeps
  `git status` where `settleTerminalOccupancy` inspects it.
- **The cleanup decision** (`decideWorktreeCleanup`, `lib/git/worktree-cleanup.ts`), which the sweeps read, takes the
  check's result in place of its `clean` flag and gains `unobservable`, `locked`, and `missing`. It decides the folder
  outcomes before its marker check, since a missing folder's marker went with it, where today it returns `external`
  for a checkout with no marker before reading anything else.
- **The removal decisions** move onto the check: the stale-worktree sweep (`lib/session-init/stale-worktree-sweep.ts`),
  branch-gone recovery (`lib/session-init/branch-gone-recovery.ts`), the residue sweep
  (`lib/session-init/lifecycle-residue-sweep.ts`), and `arc errand leave`'s authorization (`authorizePreservation`,
  `lib/errand/leave-runtime.ts`), which inspects the Errand's checkout before recording its paused or awaiting-merge
  state and removes it only afterward.
- **The projection's slots reach each caller.** Every caller this change moves onto the function, the check, or the
  release — the Errand's exits, the removal decisions, and `arc locus release` (§ 5) — takes the projection's slots as
  an optional `projectionRemovalSlots` (`ProjectionRemovalSlots`, `lib/git/worktree-removal.ts`) on its options, as the
  transition-write-path change's teardown and reconcile contexts do: the function and the release take them whole, and a
  decision, which removes nothing, only their check. The projection binds them where those options are composed (§ 16);
  given none, the passing defaults apply.
- **Each outcome is reported.** A check that cannot observe the checkout grants no removal, as today, but reports
  `unobservable`, `locked`, or `missing` where today a failed status read folds into not clean. These outcomes land
  before the flip (§ 1.4).
- **Branch-gone's candidate action** (`determineCandidateAction`, `lib/session-init/branch-gone-cascade.ts`) maps the
  check's outcomes: `removable` stays removable; `dirty`, `persist-would-refuse`, and `locked` with its folder present
  (`folderPresent`, § 16) make the checkout a switch target, a live checkout the check keeps; and `unobservable` reads
  `external`. The candidate's proposed actions stay `switch`, `removable`, and `external`
  (`CascadeCandidateSchema`). A registration whose folder is missing — `missing`, or `locked` with no folder — is
  never a candidate: the candidate builder (`buildWorktreeCandidate`, `lib/session-init/branch-gone-recovery.ts`) leaves
  it out and `recovery` reports it in a field beside its outcome, `missingFolders: [{ worktreePath, branch, actions }]`
  (§ 4.3). A roster entry with no meta, which today short-circuits to `switch` with no read, takes the folder outcome
  alone, so a main or administrative checkout whose folder is present stays `switch`. The branches the roster represents
  (`runBranchGoneRecovery`) are built from the roster's entries, folderless registrations included, rather than from the
  candidates, so a folderless registration's branch stays out of the recent-branch tier, since Git refuses to switch to
  a branch a registration holds. Its remedy is `git worktree remove <path>` for `missing`, whose registration carries
  no lock until the projection's own lock lands (§ 16), with `git worktree unlock <path>` first for `locked`, the lock
  being its owner's, each as text naming its precondition, that the folder is still missing (§ 12.2). Its folder gone,
  only the registration is left to remove, so the remedy removes that one registration by its path, where
  `git worktree prune` would drop every stale registration in the repository, and leaves its work unit and branch to
  their own flows.
- **`lib/locus/primary-safety.ts`** decides only whether the primary may host a transient claim, removes no checkout,
  and stays as today.

#### 12.2 The removal prompts carry their command

The stale-worktree sweep's report of a removable worktree carries only its path and branch, and branch-gone recovery's
removable candidate is prompted with no command (`inferBranchGoneRecovery`, `lib/session-init/recommended-action.ts`).
Each carries an `arc teardown <name>` argv, as the residue sweep's report already does (`teardown.argv`).

**Registrations whose folder is missing are selected by folder.** A missing folder's marker went with it, so the sweep
selects every registration whose folder reads missing on the derived roster's rows (`folderPresent`, § 2.1), apart from
the rows it selects by their work unit (§ 2.1), in the primary's session only, as it selects branched candidates today
(`findStaleWorktreeCandidates`), since with no marker a registration names no owner to filter by. It reports one only
where the removal check agrees — `missing` where it is unlocked, `locked` with no folder where it is locked; any other
outcome means the folder came back or could not be observed, and the registration waits for the next session start's
reading. It reports each in its own field, `missingFolders: [{ worktreePath, branch, outcome, actions }]`, beside
`worktrees`, never as a `StaleWorktreeReport`, whose kinds session-init's text dispatches on:

- **A branched one whose work unit has ended** — shipped by its branch, as today, and from the flip by its branch's link
  (`lookup` by ref) and the work unit's placement — takes `arc teardown <name>`, typed, since teardown matches it by the
  branch it retires and removes it through the removal function, which reads the folder again (§ 16); where it is
  locked, `git worktree unlock <path>`, then `arc teardown <name>`, as text, the lock being its owner's.
- **Every other one** takes `git worktree remove <path>` as text, once `<path>` is confirmed still missing, with
  `git worktree unlock <path>` first where it is locked: a detached one, which names nothing, since it has no branch and
  its marker went with its folder, a hand-deleted husk's among them; and a branched one whose work unit is in flight,
  whoever owns it, or whose branch no work unit links. A work unit's spawn clears such a registration itself (§ 2.7,
  § 16), so for a work unit the report is hygiene, never a step a materialize waits on; an Errand's spawns clear nothing
  (§ 16), so an Errand whose registration holds its branch respawns only once the removal has run.

A removal ARC does not run is text naming its precondition, that the folder is still missing: the folder was read at
session start, and `git worktree remove` run later deletes a checkout whose folder is present again by then, gitignored
files included, where the removal function reads the folder when it acts. Removing by path drops that one
registration, where `git worktree prune` would drop every stale registration in the repository.

These land before the flip (§ 1.4). A shipped work unit's registration whose folder is missing, which today reports as a
`branched` report read `external`, moves to `missingFolders`, which session-init's text does not read until the flip's
rewrite; that text changes only then.

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

- **The rebuilt slot carries the action,** before the flip, from both of the sweep's paths, `runOrphanBranchSweep` and
  the snapshot analysis session-init calls (`analyzeOrphanBranchesSnapshot`): `arc teardown <name>` for a shipped work
  unit's branch, and for a merged one `git branch -D <name>`, since `git branch -d` tests reachability and so refuses a
  rebased branch, or one squash-merged from a single commit, which the `merged` verdict admits. Session-init's offer
  text keeps `-d` until the flip's rewrite dispatches the slot's action.
- **From the flip a branch linked `adopted`** is never offered `arc teardown`, since teardown never deletes an adopted
  branch and the offer would repeat at every session start. The sweep admits a gone-upstream branch the store links,
  whatever its name, through the store's lookup of its ref (`lookup` with `LookupInputSchema`'s `ref` kind,
  `lib/store/lookup.ts`), and takes its work unit from the link, where today it scans only type-prefixed branches and
  derives the work unit from the branch's name (`branchToWorkUnitSlug`). Where its `merged` verdict holds, the slot
  offers `git branch -D <name>`; otherwise it reports the branch kept, its owner's, naming `git branch -D <name>` in its
  text, the step an abandon's and a teardown's reports name (§ 16).
- **From the flip a transient branch** is left out as today's sweep leaves out every branch the identity's transient
  records name — its Errands' and its grooming and housekeeping claims' — through the one-snapshot index
  (`errandBranches`, from `readTransientInFlightIndexes`, over `slugByBranch`, `lib/errand/record.ts`), which reads
  empty from the flip. A branch whose link resolves, through the same lookup, to an open Errand's record is left out,
  and so is a branch a claim names, read from the claims acquisition (§ 3.2), which stays this identity's and whose
  records keep their `branch`. A lookup that fails, or a claims acquisition that is not complete, declines the sweep, as
  an incomplete transient read does today. An ended Errand's branch is never offered `arc teardown`; where its `merged`
  verdict holds it takes `git branch -D <name>`, as today.
- **Until the flip** no link carries the record, so the sweep reads every branch as one ARC created.

### 13. Refusals name their remedy

Every refusal and report this design adds carries the command that repairs it: a typed action beside its text where
running it as given repairs the condition, and the command named in its text, with its arguments, where the repair
needs the agent's or the owner's input (`DEV-RULES.PROJECT`, "Recovery-complete refusals"). § 4.3 lists the slots'
actions; the verbs' refusals are these:

| Refusal or report                                                                                                                          | Repair it names                                                                                                                                                                                                                                          | Form   |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A verb this change adds, run before the flip (§ 5, § 7, § 9.1)                                                                             | what serves until then, per § 14                                                                                                                                                                                                                         | text   |
| `arc user open` from the flip (§ 2.8)                                                                                                      | the meta's session context, which `arc handoff write` writes                                                                                                                                                                                             | text   |
| `arc route`: the source entry changed since the version read (§ 7.2)                                                                       | `arc inbox <list>`, then the route at the version it reports                                                                                                                                                                                             | text   |
| `arc route`: an ID the destination holds from elsewhere (§ 7.2)                                                                            | both entries; the insert form without the `_Id:_`, stamping a fresh one, then the source's removal: `arc user inbox-remove --id <id> --expected-version <version>` from the personal inbox, else from the list's projected file (§ 16)                   | text   |
| `arc route` into the personal inbox with no `--section` (§ 7.2)                                                                            | `--section Errand` or `--section "Work Unit"`                                                                                                                                                                                                            | text   |
| `arc route` removing from a started work unit's inbound list, not its owner (§ 7.2)                                                        | the owner, who removes it; the insert form for a copy                                                                                                                                                                                                    | text   |
| `arc route` into a work unit Integrating or completed (§ 7.2)                                                                              | a follow-on work unit, or `arc reopen <slug>` for an Integrating one                                                                                                                                                                                     | text   |
| `arc route` into a work unit retired by abandonment or a cut (§ 7.2)                                                                       | the inbox, and for a cut the successors its lineage record names                                                                                                                                                                                         | text   |
| `arc route` into an ended Errand (§ 7.2)                                                                                                   | the inbox                                                                                                                                                                                                                                                | text   |
| `arc route`: an entry gone from the source and absent from the destination (§ 7.2)                                                         | where its latest receipt says it went, or that no receipt names it                                                                                                                                                                                       | text   |
| `arc inbox --target` on a list other than the personal inbox (§ 7.1)                                                                       | `arc inbox personal --target <slug>`                                                                                                                                                                                                                     | text   |
| `arc user inbox-list` from the flip (§ 7.1)                                                                                                | `arc inbox personal --target <slug>`                                                                                                                                                                                                                     | text   |
| `arc user inbox-mark-execute-bound` from the flip (§ 7.6)                                                                                  | `arc errand queue set`, its request naming each entry's inbox and ID                                                                                                                                                                                     | text   |
| A title operand from the flip — `--from-inbox <title>`, `--inbox-title-file`, `--inbox-entry-file`, or `inbox-remove`'s positional (§ 7.7) | the ID form, `<personal\|project>:<id>` or `--id <id> --expected-version <version>`, its ID and version read from `arc inbox <list>`                                                                                                                     | text   |
| An Errand's start from an entry that is gone (§ 7.6)                                                                                       | where its latest receipt says it went                                                                                                                                                                                                                    | text   |
| An Errand's start from an entry an open Errand holds (§ 7.6)                                                                               | that Errand, to resume in its own checkout                                                                                                                                                                                                               | text   |
| `arc errand queue set` naming both entries of one ID (§ 6.3)                                                                               | both entries, to queue one now and the other once the first starts                                                                                                                                                                                       | text   |
| A marker write while another checkout's marker names the work unit (§ 2.4)                                                                 | work in that checkout; or free it there with `arc locus release`, after `arc pause <slug> --reason <text>` for one's own Planning or Active work unit; for one's own Integrating one, its integration, then teardown                                     | text   |
| A marker write while a registered checkout's marker cannot be read (§ 2.4)                                                                 | that checkout and the read's diagnostic: inspect it, then repair or remove its marker, or remove the checkout                                                                                                                                            | text   |
| A marker write while the worktree roster is not complete (§ 2.4)                                                                           | the run again once Git lists the worktrees                                                                                                                                                                                                               | text   |
| The holding-checkout lookup finding two checkouts whose markers name the work unit (§ 2.4)                                                 | both checkouts: remove by hand the marker (`.arc/system/.internal/worktree-marker.json`) in the one not to keep, then rerun                                                                                                                              | text   |
| `arc start --here --new <slug>` from the flip naming a work unit the store holds (§ 2.5)                                                   | start's dispatch's own: omit `--new`, the work unit's state deciding what `arc start <slug>` does                                                                                                                                                        | text   |
| A nameless `arc start --here` from the flip whose derived name the store holds (§ 2.5)                                                     | `arc start <name> --new --here` under another name, or for the held work unit the step its state takes, which `arc status <slug>` shows                                                                                                                  | text   |
| The cold start from the flip in a checkout whose spawned marker names a work unit with no record (§ 2.5)                                   | `arc locus release <slug>`, which removes that checkout                                                                                                                                                                                                  | typed  |
| The cold start from the flip in a checkout holding any other marker but a crashed cold start's (§ 2.5)                                     | the marker's exit: its role's exits; work there or free it as for a marker write; its teardown; for an ended work unit `arc teardown <slug>`, or `arc locus release <slug>` where another identity owns it; for a backlog one `arc locus release <slug>` | text   |
| Graduation in place or `arc materialize --here` from the flip in a checkout whose marker names anything but its work unit (§ 2.6)          | the marker's exit, as for the cold start; for a crashed cold start's anchored marker, `arc start <slug> --new --here` or `arc locus release <slug>`                                                                                                      | text   |
| The anchored marker's write finding a marker that appeared after the occupancy read (§ 2.6)                                                | the checkout and its marker: inspect it, then rerun                                                                                                                                                                                                      | text   |
| A link read or write from the flip that gets no project ID (§ 2.1)                                                                         | the port's failure, which names the read of the project's identity record and that read's own remedy                                                                                                                                                     | text   |
| An Errand's terminal or merge from the flip whose record's lookup or read refuses, `not-found` aside, or misses beside diagnostics (§ 3.2) | that record and what its lookup or read reported with that report's remedy, or, where the lookup finds none beside listing diagnostics, those diagnostics with their remedies                                                                            | text   |
| `arc locus release` on a work unit this identity owns, in flight and not paused, or ended (§ 5)                                            | `arc pause <slug> --reason <text>` for a Planning or Active one; its integration, then teardown, for an Integrating one; `arc teardown <slug>` for an ended one                                                                                          | text   |
| `arc locus release` on a checkout holding a transient role (§ 5)                                                                           | the role's exits, as handoff's locus plan names them                                                                                                                                                                                                     | text   |
| `arc locus release` on a slug no checkout on this machine holds (§ 5)                                                                      | `arc locus`, which lists this machine's checkouts and the work units their markers name                                                                                                                                                                  | text   |
| `arc locus release <slug>` from the flip where the holding-checkout lookup rejects (§ 5)                                                   | the lookup's own message and repair, as a marker write's refusal names it (§ 2.4)                                                                                                                                                                        | text   |
| `arc locus release` on a spawned checkout whose detached `HEAD` holds commits not on base (§ 5)                                            | the commits, named, and `git switch -c <name>`, which keeps them on a branch the removal leaves                                                                                                                                                          | text   |
| `arc errand materialize` from the flip on an Errand another identity owns (§ 3.2)                                                          | its owner, who materializes it                                                                                                                                                                                                                           | text   |
| `arc errand open <slug>` from the flip on an Errand another identity owns (§ 3.2)                                                          | its owner, who resumes it; another slug, for a new Errand                                                                                                                                                                                                | text   |
| `arc handoff write` where the checkout holds no work unit (§ 9.1)                                                                          | the work unit's checkout; a handoff between work units writes no session context                                                                                                                                                                         | text   |
| `arc handoff write`: a body line that would end the section (§ 9.1)                                                                        | that line, to rewrite                                                                                                                                                                                                                                    | text   |
| `arc handoff write` where `version()` refuses (§ 9.1)                                                                                      | the store refusal's own remedy                                                                                                                                                                                                                           | text   |
| A wrapped or colon-less `WORKING-MEMORY` header (§ 6.5)                                                                                    | the documented shape: the header on one line ending `:**`, its trigger the next non-blank line                                                                                                                                                           | text   |
| A remote the store needs designated (§ 4.8)                                                                                                | the store's remedy argv                                                                                                                                                                                                                                  | typed  |
| An identity already in use (§ 10.2)                                                                                                        | the person's confirmation that the identity is theirs                                                                                                                                                                                                    | prompt |
| An identity the person says is not theirs (§ 10.2)                                                                                         | the run again with another: `--identity <name>` on `arc init` or `arc join`, another name to `arc user add`                                                                                                                                              | text   |

### 14. Names

| Name                                | Form                                                                                                                                                                                        | From                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `arc inbox`                         | `arc inbox <personal\|project\|slug> [--json]`; `arc inbox personal --target <slug> [--json]`                                                                                               | the flip                           |
| `arc route`                         | `arc route <entry-id> --from <list> --expected-version <version> --to <destination> [--section <name>]`; `arc route --to <destination> [--section <name>]` with the entry on standard input | the flip                           |
| `arc locus release`                 | `arc locus release [<slug>]`                                                                                                                                                                | the flip                           |
| `arc errand queue`                  | `arc errand queue [--json]`                                                                                                                                                                 | the flip                           |
| `arc errand queue set`              | `arc errand queue set <file \| ->`, a versioned JSON request listing the whole queue's members in order, each an inbox and an entry ID                                                      | the flip                           |
| `arc handoff write`                 | `arc handoff write <file \| ->`, a versioned JSON request carrying the session context, `Next Action`, and an optional `Session Type`                                                       | the flip                           |
| `pausedWork`, `inboundBackPressure` | session-init slots (§ 4.4, § 4.6), `{ items: [] }` and `null` before the flip                                                                                                               | this change; empty before the flip |
| `inbound.retriage_after_entries`    | project setting, a positive integer, default 10                                                                                                                                             | the flip                           |
| `inbound.retriage_after_days`       | project setting, a positive integer, default 30                                                                                                                                             | the flip                           |
| `pause.review_after_days`           | project setting, a positive integer, default 14                                                                                                                                             | the flip                           |

- **Before the flip** each verb is registered and refuses `unsupported`, naming what serves until then: `arc inbox`,
  `arc user inbox-list --target`; `arc route`, the routing method's until-the-flip binding (`route-discovered-work`,
  "Binding: carrying out outcomes"); `arc locus release`, `arc park` and `arc teardown`; `arc errand queue` and
  `arc errand queue set`, `arc user inbox-mark-execute-bound`; and `arc handoff write`, the `SESSION-NOTES` write.
- **The settings** are declared beside `inbox.remind_after_days` (`lib/config/schema.ts`, `commands/config/validate.ts`)
  and show in `arc config`, with no effect before the flip; the shipped configuration template documents them in the
  flip's rewrite.
- **Retired from the flip:** `arc user inbox-list` and `arc user inbox-mark-execute-bound` refuse `unsupported`, naming
  `arc inbox personal --target <slug>` and `arc errand queue set` (§ 7.1, § 7.6).
- **Changed forms from the flip:** `--from-inbox <personal|project>:<id>` on `arc errand open` and `arc errand link`,
  and `arc user inbox-remove --id <id> --expected-version <version>`, each refusing a title (§ 7.7).
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
- **The Errand record's schema** gains an optional `owner`, which the open and the import write from the flip, once
  Errands list at project scope, and the in-repo implementation's records, whose identity-scoped ref implies the owner,
  leave unset (§ 3.2).

#### 15.2 The routing method (`spec-inbound-routing-method.md`)

- **D4's provenance line,** `routed from <origin>, <date>`, takes § 15.1's shape from the flip.

### 16. Expected contracts

This design consumes behavior other changes build. Each is an expected contract, available when its change lands; what
holds until then is stated with it.

- **The transition write path** (the change rerouting lifecycle's transition writes through the store, which this
  change follows, § 1.3):
    - the checkout removal function and its removal check, with their outcomes, `locked` carrying whether its folder is
      present (`folderPresent`), the function running the check itself, the removal check's projection part alone
      serving a release, and teardown completing on a missing folder (§ 5, § 12.1, § 12.2);
    - the prepared-write protocol: acquire the whole artifact group, prepare, revalidate each input by its version,
      apply in one batch with expected versions (§ 4.1);
    - the pause record on the work item, `arc pause`, `arc resume`, and `arc handover`, and the refusal of every verb
      that advances a paused work unit's work, naming `arc resume` (§ 4.3, § 4.4);
    - `arc task close`, its default capture — the non-merge commits from `HEAD` on neither base nor base's
      remote-tracking ref, less those matching a capture or the branch link's exclusions by SHA or copy key, computed
      after its best-effort refresh of base — its attribution of a rewritten copy, its committer time differing from its
      author time, to its original's task or the exclusions, and its refusals on a checkout with no linked branch out
      and where no base ref resolves, naming their repairs, and where its refresh empties a set that was not empty
      before it, naming the commits the refresh found on base (§ 11);
    - the default-set computation callable without its refresh, and one resolver of which branch link a checkout has
      out — `linked` with the link, `detached`, `unlinked` with the branch out, or `no-link` — which the close and this
      change's listing both read (§ 11);
    - the one function computing a commit's copy key (`lib/git/copy-key.ts`), which the listing calls, since keys
      computed any other way never match, a key computed only for a commit no stored SHA matches and from local objects
      alone (`GIT_NO_LAZY_FETCH`), so the computation never fetches (§ 11);
    - branch links' record of whether ARC created or adopted the branch and their exclusions (§ 8.2, § 11, § 12.4), each
      link naming the project ID as its repository, through the project-ID port that change injects and binds at its
      executor context from the flip (`buildExecutorContext`), which this change's readers and writers outside that
      context bind as § 2.1 states (A2), and the branch's short name as its ref, which this change's link writes and
      lookups take too, and from the flip the meta carrying no `Branch`, its link holding it (§ 2.1); its selection of a
      work item's branch among its links (`selectWorkBranchLink`), and against a checkout its resolver
      (`resolveLinkedCheckoutBranch`), which this change's readers of a work item's branch call (§ 2.1, § 3.1); and an
      abandon's and a teardown's report of a kept adopted branch (§ 12.4);
    - the widened `arc materialize` in both its arms, spawned and `--here`, the spawn, and graduation in place, each
      running the exclusivity check, and rename, `arc materialize`, abandon, start, teardown, pause, and handover the
      holding-checkout lookup, through ports that change injects and this change binds (§ 2.4), and the in-place arms
      writing the anchored marker through a third, whose default writes nothing and reports `unadmitted`, bound to this
      change's anchored-marker writer (§ 2.6, § 4.5); the three ports are one record (`LocusPorts`, in
      `lib/work-unit/locus-ports.ts`), which the executor context carries to its callers and into its worktree reconcile
      when given one (`buildExecutorContext`), and whose default (`createDefaultLocusPorts`) keeps today's behavior for
      the check's and the writer's callers given none, as the lookup's callers keep their own marker scan, so this
      change binds them at that one point, the context, when the store reads state off the branch (§ 2.4, A1);
    - from the flip, a work unit's spawns clearing a registration whose folder is missing at their target path or
      holding their branch, through the removal function's missing-folder arm, so a checkout deleted by hand never
      blocks one: graduation's spawn and the linked spawn, through `createLinkedWorktree`'s optional clearing step
      (`clearMissingRegistration`), which `reconcileWorkUnitWorktree` supplies, and that function's in-place leg before
      it checks the branch out, by branch, for `arc materialize --here`; a registration locked by anything but the
      projection refuses `locked`, naming `git worktree unlock <path>` as text. The transient claims' spawns through
      `createLinkedWorktree` (`lib/locus/allocator.ts`, `lib/locus/provisioning-runtime.ts`) supply no clearing step and
      keep today's behavior (§ 2.7, § 12.2);
    - teardown releasing an anchored marker and keeping its checkout, and rename moving only a spawned checkout (§ 2.3);
    - the store's retirement read from the flip (`readStoreRetirementEvidence`,
      `lib/work-unit/store-retirement-evidence.ts`), which returns an abandonment's lineage record as `lineage` evidence
      (`RetirementEvidenceRef`) under the `discard` rule and refuses one with no `retiredBranches`, and which the
      residue sweep's retirement read takes (§ 3.4);
    - the cold start's seed handling, landing before this change reroutes `runColdStart`, and from the flip its
      store-backed start (`handleStoreStart`) handing `arc start --here` with `--new` or with no name to a cold-start
      slot (`admitColdStart`) ahead of its dispatch, which this change fills, and for a named start moves into its
      create-new arm (§ 2.5, A3);
    - promotion's one write and its work branch, built as steps `promoteOrdinaryErrand` composes, in their own module
      (§ 8.3);
    - the rule that an Active work unit is no default routing home, and the record kinds' write check refusing the move
      to Active while the inbound list holds an entry (§ 7.8);
    - the scaffold's arm from the flip, branching on the capability itself, creating the meta through the store with no
      `runUserOpen` and so no `SESSION-NOTES` seed, and keeping the cold start's call (§ 2.8);
    - the current-work-unit reconcile's store-backed prepare from the flip (`createStoreReconcilePrepareContext`), with
      its executor and command bindings, the prepare never reading the pause and the apply refusing on one, and the
      prepare throwing over a lifecycle listing with a malformed or missed record (`store.lifecycle-incomplete`, its
      diagnostics its `cause`) or one it cannot read (`store.lifecycle-unreadable`), through `requireCompleteInventory`,
      `lib/store/lifecycle-storage.ts` (§ 4.1);
    - lifecycle's own callers reading the store's slug-keyed lifecycle view from the flip — start's dispatch, rename's
      subject and collision checks, and resume's and abandon's target and state (`handleResume`, `handleAbandon`,
      `handlers/lifecycle.ts`), taking the branch from the link, with `resolveTransformComposition` their in-repo arm —
      and `arc materialize`'s candidates from the store's listing and the holding-checkout lookup, so the in-flight
      expansion and the composed lifecycle index stay their in-repo arms, and park's roster scan (`resolveParkSource`,
      `handlers/lifecycle.ts`) park's (§ 1.2, § 2.1, § 3.2);
    - `arc status <slug>`'s state and record from the flip (`handlers/status/lifecycle.ts`): the query
      (`resolveSlugQuery`) over the store's lifecycle view and the purpose and owner from the work unit's record, beside
      which this change moves the query's locus reads (§ 1.3, § 3.1);
    - dependency discharge reading lifecycle through the store (§ 3.6);
    - activation adding the default set of a branch it adopts or reattaches to that link's exclusions and reporting
      them with the close that captures any that are task work (§ 8.3, § 11).

  Until it lands none of these exist, so this change lands after it.
- **Status and ROADMAP** (the change rendering them from typed listings): the readiness composition's record merge
  (`mergeProjectReadinessRecords`, `lib/status/project-view.ts`) reading a decomposed origin as decomposed from its
  lineage record (§ 3.6), until which `arc status` and ROADMAP report the origin as today; and the arms from the flip of
  status's own reads — its direct calls of in-flight derivation (`lib/status/project-view.ts`,
  `lib/status/user-view.ts`), which render an entry with no branch and the `paused` scheduling (§ 3.1), its reads of the
  Errand index projection (§ 3.2), `arc view`'s explicit-target composition (`handlers/view.ts`), which reads the
  composed lifecycle index (§ 3.2), and `arc view`'s cohort read for either target, through the cohort resolver today
  (`resolveActiveCohortDocPath`, § 2.1).
- **Delivery and review** (the change rerouting Candidate and review records through the store): its landing writes a
  work unit's landing-commit link (`landingCommit`, `lib/store/links.ts`) from the flip when the work unit's merge
  lands, which the frame reads under `archive.cadence: with-integration` to tell an archived work unit awaiting merge
  from a retired one, beside its own landing test for a merge the landing never sees (§ 2.1, § 3.7); the
  review gate's arm from the flip for its reads of the Errand index projection (§ 3.2); the integration checkpoint's for
  its reads of the composed lifecycle index (§ 3.2); and `arc status <slug>`'s operational-boundary read
  (`resolveSlugOperationalBoundary`, `handlers/status/lifecycle.ts`), which reads that work unit's checkout this change
  locates (§ 3.1). The flip waits on it.
- **The projection:** the removal check's projection part, the persist step, and the release slot, each passing until
  filled (§ 5, § 12.1); the empty scratch folder for the checkout's work unit (§ 2.8); its locations and file names
  registered as layout addresses, the inbound list's and the Errand description's among them, which the target
  classifier inverts, each mapped to its kind in its store step (§ 3.3); its write-back of a person's edit to a
  projected entry list, by which a list's owner removes an entry (§ 7.3, § 13); and its worktree lock, which lands only
  after this change's removals, removal decisions, and moves are on the function, the check, and the doubled-force form
  (§ 12), with its rewrite, under that lock, of the removals printed rather than run, branch-gone's registration removal
  among them (§ 12.1).
- **The ref backend and its import:** `pull`, its result (`PullResult`) carrying the `designation-needed` state with its
  remote, choices, and remedy argv (§ 4.2, § 4.8); `maintain()`'s ref measurements (`MaintainResult`) and the push's
  retry count and time waited (§ 9.3); the `state-unresolvable` refusal naming the history refs a clone lacks, and
  `pull` of them by name (§ 9.2); the refusal of writes to a kind no declaration homes (§ 6.6); the project's identity
  record (`project-registry/identity`), with its write, merge, and adoption, whose project ID every capture names as its
  repository (§ 8.1); its fetch of the personal refs of the identity the store's ports resolve, so a store bound to the
  identity being set up pulls that identity's records (§ 10.2); and the import, which carries each open Errand's and
  live work unit's branch link with its record, a work unit's with its exclusions (§ 8.2, § 11), writes each Errand's
  `owner` from the identity ref it re-homes the Errand from (§ 3.2), stamps every entry's `_Id:_`, carries each open
  Errand's origin entry into its description, rewriting no record's origin (§ 7.6), moves each draft's held entries —
  its buffer section — and each pending owner-adoption `_Hold:_` capture into its work unit's inbound list, an entry
  from a buffer section taking as its `_Created:_` the latest date its `_Routed from:_` line carries, or the import's
  date where it carries none, and that line moving unchanged into the entry's prose as a plain paragraph, and one from a
  held capture keeping the capture's `_Created:_` and taking the `_Routed from:_` a route from its inbox would write, so
  every `_Routed from:_` line from the flip has § 6.2's form (§ 4.6, § 7.8), turns each person's execute-bound marks
  into their Errand queue in file order (§ 7.6), and writes no `State at Handoff` (§ 9.2) and no marker (§ 2.7, § 7.7).
  The frame needs no landing-commit link from it (§ 2.1).

  That change lands alongside this one in either order. This change reaches `pull`, the pull of named history refs, and
  `maintain()` through a narrow port whose default pulls nothing and measures nothing, and whichever of the two lands
  second binds the port to the store's operations. Every call through it sits in an arm from the flip, which waits for
  both changes, so until the binding session start pulls nothing and carries no designation line, the retry on a
  missing history ref pulls nothing, and the tripwire report shows nothing, as over the in-repo implementation.
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

**A completed work unit's frame from the archive cadence (§ 2.1, § 3.7).**

- _The landing-commit link alone._ Under `manual`, this repository's cadence, the import would have to write a link
  for every work unit completed or merged before the flip, and the one commit its history marks for each is the
  archive's merge, not the commit that landed its integration, which is what the storage contract's landing commit
  names (D3); and under `with-integration` a merge made outside ARC would get no link at all.
- _Merged derived from Git alone._ A multi-commit squash leaves the work branch's commits off base even by patch
  identity, so a merged work unit would read unmerged; beside the link, that failure only withholds a cleanup offer.
- _A positive awaiting-merge record from delivery._ It rests on a record no change has designed.

**An Errand's stale version refuses unless already applied (§ 8).** _Recompute from the record read again._ Records
are stored per key, so a stale version means that Errand's own record changed; recomputing would rebind the request's
`previous` and change what the transform admits. The one re-read only reports `idempotent` where the record already
holds the result, as the transform does today before it compares `previous`.

**Each condition's actions an array, beside today's fields (§ 4.3).** _One action per condition._ A landed retirement
and the reconciles report two. _Replace today's command fields._ The workflow text reads some of them until the flip's
rewrite.

**The scratch reconcile inside the user-reference reconcile (§ 2.8).** _Session start reconciles._ Session start writes
nothing, and a folder removed unasked may hold anything its person put there.

**A partial Errand across the flip resolved by its digest (§ 7.7).** _Require no open partial Errand at the flip._ A
precondition on the cutover for a case one lookup at close settles.

**`--expected-version` (§ 7.2, § 7.7).** _`--version`._ The root program's version flag takes it before the verb runs
(`program.version`, `cli.ts`). _`--at`, `--seen`, `--entry-version`._ ARC's own compare-before-act options already read
`--expected-head`, `--expected-base`, and their kin, as HTTP's conditional request does with `If-Match`.

**`git branch -D` for a merged orphan (§ 12.4).** `git branch -d` tests reachability, so it refuses a rebased branch or
one squash-merged from a single commit, both of which the `merged` verdict admits.

**A dead registration cleared where it blocks (§ 2.7, § 12.2, § 16).** A checkout deleted by hand leaves a registration
that blocks a work unit's spawn only at Git's `worktree add` or checkout, by holding its path or its branch, so the
spawn clears it.

- _Each offer removes it first._ Every reader that offers a spawn would have to recognize the registration in its way
  — by branch, and for a work unit with no branch by the path a spawn takes — and each new reader would have to learn
  it again.
- _A bare `git worktree remove <path>` at session start._ The folder is read at session start and the command runs
  after the person approves it, so a folder present again by then would be removed, gitignored files included. The
  removal function reads the folder when it acts; a removal ARC does not run is text naming that precondition, for
  whoever runs it.

## Cross-cutting Considerations

**Testing.** Every locus, session-init, and personal-surface test passes unchanged over the in-repo implementation, but
for those a § 1.4 item changes, each named with its item. Each arm from the flip runs over the reference backend, which
reports `stateOffBranch: true` (`__tests__/helpers/store/reference-backend.ts`), with Git steps over the shared scripted
`GitExec` fake. Each verb this design adds passes on its success path and on each refusal it names, and a recoverable
refusal also passes its continuation once repaired. Tests of rerouted code keep their local doubles. The reference
fixture's stand-in entry shapes for the inbound list, the description, and the queue give way to their declarations
(§ 6.6), so the tests meet the production grammar.

**Migration and rollout.** Nothing observable changes before the flip but § 1.4's items. At the flip the import carries
branch links, entry IDs, open Errands' descriptions, held entries into inbound lists, and each person's queue (§ 16);
the cutover's rewrite moves the workflows onto the slots' actions and the new verbs; and the deletion pass removes
§ 1.5's arms. A partial Errand open across the flip resolves its binding once, by its digest, at its close (§ 7.7). The
anchored marker's admission lands before any anchored checkout exists, and the projection's lock after every removal and
move is on the function, the check, and the doubled-force form.

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
is computed once, for the entering checkout, as one revision walk from `HEAD` excluding base and its remote-tracking
ref, less the captures and exclusions it matches, a copy key computed only for a commit no stored SHA matches, from
local objects alone (§ 16); and the back-pressure slot reads the current work unit's inbound list once.

**Security and trust.** Anyone may insert into an entry list, but only a started work unit's owner removes from its
inbound list, a rule the host cannot enforce, as it enforces no ARC writer rule. A person's personal-inbox receipts live
in that person's own ref. An anchored checkout is never removed, and a check that cannot observe a checkout grants no
removal. A slug collision between two people warns rather than refuses (§ 10.2).

**User-facing impact.** Before the flip: the rebuilt slots carry actions, the removal prompts name `arc teardown`, the
orphan sweep's merged offer is `git branch -D`, the rename-move remedy takes `-f -f`, the new settings show in
`arc config`, and the new verbs exist and refuse. From the flip: `arc inbox` and `arc route` replace hold-and-route and
title-keyed listing and removal, the Errand queue replaces execute-bound marks, a paused work unit and its inbound
back-pressure show at session start, survivors are reported with their homes, `arc locus release` releases a checkout,
handoff writes its session context through `arc handoff write`, and the commits not yet closed are listed with their
close.

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
   absent records and warning on one in use (§ 10.1, § 10.2); the cold start writing its records only through the store
   and, in its checkout, only the marker and the editor documents, with their entries in the clone's exclude file and
   `HEAD` unmoved (§ 2.5); Errands and claims acquired apart, an Errand's terminal and merge admission taking both
   complete (§ 3.2); former slugs resolved through `lookup` (§ 3.5); the queue's offer and a start's refusals (§ 7.6);
   removal by ID and version, and `--from-inbox` taking the inbox (§ 7.7); an adopted branch never offered
   `arc teardown` (§ 12.4); `retiredSubdirs` resolving `skip` (§ 4.2); `arc user open` refusing (§ 2.8); and a paused
   work unit's slot actions taking `arc resume` (§ 4.3). The tripwire report, whose figures neither implementation
   produces, passes over scripted measurements and push outcomes, showing each figure past its bound and none below
   (§ 9.3).
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
9. **The commits not yet closed** equal the close's default set over the same base refs on an adopted, a re-activated,
   and a promoted work unit's branch, a rebased copy of a captured or excluded commit matching by its copy key; where no
   base ref resolves, the condition is reported with the close's repair in place of the listing; the action is the bare
   close only where every listed commit is one Git made fresh; a paused work unit takes `arc resume <slug>`; and
   recovery lists them beside a matching cursor.
10. **Back-pressure trips on each threshold,** and below both the slot reports its figures with no action.
11. **The quality gates pass** at every gate the project declares.
12. **The locus ports bind at the executor context (A1).** From the flip, a production verb's executor context given no
    ports carries this change's exclusivity check, lookup, and anchored-marker writer, its rebind on another checkout
    (`withCwd`) the same record, and store start's create-new and the cold start reach them through it; over the in-repo
    implementation the context carries none, and lifecycle's callers keep today's defaults.
13. **Every link reader and writer gets the project ID with none injected (A2).** From the flip, each reader and writer
    of links this change adds, given no project-ID port, reads the project's identity record over its store, and treats
    a failed read of that record as an incomplete observation (§ 2.1).
14. **A named in-place start refuses as a spawning one does (A3).** From the flip, `arc start <name> --here --new`
    refuses before any write every name `arc start <name> --new` refuses — a held work unit's, a former slug, or an
    Errand's — and refuses `--class`, as the in-repo arm does.
15. **Lifecycle's in-place arms refuse an occupied checkout (A4).** From the flip, graduation in place and
    `arc materialize --here` in a checkout whose marker names anything but their work unit refuse before any Git step,
    `HEAD` unmoved and nothing written, naming that marker's exit.

## Open Questions

None blocks starting. The expected contracts in § 16 each state what holds until their change lands, and none leaves
this design open.

## Amendments

- **A1** — 2026-10-16 — design: the locus ports bind at the executor context, not in their default record. _Supersedes:_
  § 2.4 ¶1; § 16, the transition write path's ports item. _Trigger:_ door. _Work:_ 2.5. _Revalidated:_ pending → 2.10.
- **A2** — 2026-10-16 — design: locus's link readers and writers bind the project-ID port over their store; the cutover
  binds none. _Supersedes:_ § 16, the cutover item. _Trigger:_ door. _Work:_ 2.1. _Revalidated:_ pending → 8.1.
- **A3** — 2026-10-16 — design: a named in-place start reaches the cold start from store start's create-new arm.
  _Supersedes:_ § 2.5, its entry item. _Trigger:_ door. _Work:_ 2.6. _Revalidated:_ pending → 2.10.
- **A4** — 2026-10-16 — spec-depth: lifecycle's in-place arms refuse a checkout another marker occupies, naming its
  exit. _Supersedes:_ none. _Trigger:_ door. _Work:_ 2.R. _Revalidated:_ pending → 2.10.
- **A5** — 2026-10-16 — task: promotion's receipt carries an inbox origin's digest as the record holds it, `null`
  included. _Supersedes:_ none. _Trigger:_ door. _Work:_ 3.9. _Revalidated:_ pending → 3.10.

---
