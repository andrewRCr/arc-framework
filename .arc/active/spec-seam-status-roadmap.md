# Spec (`detailed` · `RFC`): seam-status-roadmap

- **Origin:** [internal]

- **Purpose:** Build the versions of `arc status --project`, `arc status --user`, and `arc view` that read state from the
  store at the flip, rendering on demand from lifecycle's typed view with no ROADMAP or `STATUS.USER` file, beside
  today's code, which keeps its behavior until the flip and leaves at the cutover; add a Paused tier and a conflict
  view; and fix three duplications that would otherwise survive the flip.

---

## Introduction / Context

ARC's storage contract has shipped: one interface for every read and write of operational and planning state (`Store`,
`lib/store/contract.ts`), an in-repo implementation over today's substrates (`lib/store/in-repo/`), and a reference
backend the tests run (`__tests__/helpers/store/reference-backend.ts`). A caller tells them apart by one capability,
`capabilities.stateOffBranch`, read through `usesOffBranchState` (`lib/store/lifecycle-write.ts`): `createStore`
(`lib/store/create.ts`) and the in-repo implementation (`lib/store/in-repo/backend.ts`) report `false`, and the reference
backend `true`. **The flip** is the one cutover per repository at which the configured store starts reporting `true`,
so that state is read and written through the store rather than through tracked files on the checkout's branch. Code
that behaves differently across it branches on the capability: its **in-repo arm** runs while the capability is false,
its **arm from the flip** once it is true, and the cutover's deletion pass removes the in-repo arms. Until the flip
every arm from the flip is dark, reachable only over the reference backend in tests.

Status, ROADMAP, and `arc view` today:

- **The project view** (`arc status --project`) builds readiness records from the metas in the checkout's tracked tree
  and, through in-flight derivation, from metas at other branches' tips (`resolveProjectReadinessViewInput` and
  `resolveProjectReadinessComposition`, `lib/status/project-view.ts`; `deriveInFlight`, `lib/git/in-flight-derivation.ts`).
  A pure composer (`composeProjectReadinessViewResult`) renders them into four tiers — In Flight, Ready, Blocked in depth
  bands, and Parked, printed only when it has rows — and, with `--json`, writes `{ markdown, warnings, facts }` with one
  fact row per work unit (`ProjectReadinessFact`). By default it reads remote branch membership live and writes nothing
  (`acquisitionPolicy: "passive-live"`, `handleProjectStatus`, `handlers/status/views.ts`); `--local` and `--no-fetch`
  read local refs alone.
- **ROADMAP** is that view stored as `.arc/backlog/ROADMAP.md`. Lifecycle verbs re-render and stage it on their edges,
  `arc status --project --staged --write` writes it from the Git index (`handleStagedProjectStatus`), a pre-commit
  assert checks it is current, a merge driver and a conflict remedy re-render it on conflict, and
  `arc base merge --regenerate-roadmap` refreshes it.
- **`arc status --user`** renders the identity's in-flight and ready work and writes it to `STATUS.USER.md` on every
  render (`assembleStatusUserView`, `lib/status/assemble-user-view.ts`, called from `handleUserStatus`); lifecycle edges
  write that file too.
- **`arc view`** takes its default target from the active metas in the checkout, using the branch only to break a tie
  between several (`resolveAmbientTarget`, `handlers/view.ts`), opens each artifact at its path, and refuses a completed
  work unit ("completed viewing is unsupported", `lib/view-artifact.ts`).

Lifecycle's verbs, already rerouted, stop their own ROADMAP and `STATUS.USER` writes from the flip: no edge's form from
the flip lists the `reconcile-roadmap` or `reconcile-status-user` side effect
(`lib/work-unit/lifecycle-transitions.ts`), and the store-backed start returns before `refreshRoadmapForStartCeremony`
(`handleStoreStart`, `handlers/start.ts`). `arc rename` branches on the capability itself (`runRenameCommand`,
`commands/rename.ts`): its in-repo arm re-renders ROADMAP (`reconcileRoadmap`), and its store arm (`runStoreRename`,
`lib/work-unit/verbs/rename-store.ts`, which `runRename` dispatches to on the capability, with `storeRenameAdapters`,
`commands/rename-store.ts`) renders none. Decomposition renders ROADMAP into its cut
(`renderGitV3RepositoryTreeRoadmap`, `lib/work-unit/git-decompose-v3-repository-plan.ts`) and refuses where none exists
(`result-base-roadmap-unreadable`, `lib/work-unit/git-decompose-v3-finish.ts`); the change that makes a cut one store
batch gives it an arm from the flip that renders and checks no ROADMAP (§ 12). What else still reads and writes beneath
the store is status's own surfaces and `arc view`.

### Why status does not reroute

The usual path for a consumer of the contract routes its modules through the in-repo implementation first, so the same
code runs on either side of the flip. For status that buys nothing and cannot work:

- **No reader needs the stored file.** People read direction elsewhere, and the one reader that is not a person —
  session-init's next-work discovery and the routing method's horizon advisory — runs `arc status --project` live,
  never the file.
- **The composition cannot feed from the in-repo implementation.** The in-repo `list` is built on it: `composedMetas`
  (`lib/store/in-repo/meta.ts`) calls `resolveCallerComposedLifecycleIndex`, which reaches
  `resolveProjectReadinessComposition`, so a composition fed from `list` would call itself.
- **ROADMAP's machinery is deleted at the cutover.** Stopping each of its paths on the capability first would be work
  thrown away there, most of it in entry points with no store in scope: the bash pre-commit hook, the assert and remedy
  scripts, the merge driver's Git configuration, `arc init`, `arc join`, and `arc update`.

So this change builds the arms from the flip fresh, from lifecycle's typed view and the in-flight set, beside today's
code, which stays the in-repo arm unchanged.

### What there is to build on

- **One capability check in status's files today:** lifecycle's arm of `arc status <slug>` (`handleStoreLifecycleStatus`,
  `handlers/status/lifecycle.ts`), reached only when `usesOffBranchState` is true, so dormant. The locus change, on
  which this change depends (§ 12), gives every status mode a store and the store's synchronization port through the
  session context (`SessionStatusContext`'s `store` and `storeSync`, `createSessionStatusContext`,
  `handlers/status/session-context.ts`), and gives `arc view` a store and an arm from the flip for its default target
  (`createViewDependencies`, `handlers/view.ts`).
- **Lifecycle's typed view.** `readLifecycleView` (`lib/store/lifecycle-view.ts`) returns the listing's completeness
  evidence (`LifecycleIndexOutcome`, `lib/store/lifecycle-index.ts`: `complete` with `diagnostics` and `missed`,
  `absent`, or `unreadable` with a condition and remedy) and, for a complete listing, each work unit's entry
  (`LifecycleEntry`): its reference, version, `phase` (the meta's `State`, `validateState`), placement-derived
  `location`, and its parsed meta fields — owner, cohort, `dependsOn`, priority, `workClass`, and the pause. For a
  listing that is not complete it returns no entries, so a caller must read `listing.status` to tell an unreadable
  store from an empty one.
- **Single-record reads:** `readWorkUnit` (`lib/store/lifecycle-write.ts`) looks a work unit up by slug and reads it;
  `readLifecycleDesign` (`lib/store/lifecycle-design.ts`) selects a work unit's design record; `resolveCurrentWorkUnit`
  (`lib/store/current-work-unit.ts`) gives the checkout's claim; and `store.lookup` (`lib/store/lookup.ts`) resolves a
  slug, a renamed work unit's former slug included (`lookupSlug`, `lib/store/in-repo/lookup.ts`, following rename
  lineage; the reference backend's `formerSlugs`), or a lineage record by its origin (`{ kind: "lineage", origin }`),
  refusing `not-found` where none matches.
- **A dependent's disposition.** A dependent's own reconcile resolves an edge whose slug no work unit holds through its
  store context's disposition query (`createStoreReconcilePrepareContext`, `lib/work-unit/store-reconcile-context.ts`):
  the lineage listing enumerated by origin (`storeLineageEnumeration`), the terminal records' former names read from
  their histories (`readTerminalReferenceAliases`, `lib/work-unit/terminal-reference-aliases.ts`), and the origin's
  record, which names the dependent's disposition, matched by the dependent's UID first, then its name
  (`queryStoreDisposition`, `readDependentMatch`). The pieces are private to that module.
- **The pause record.** `MetaPauseSchema` (`lib/active/meta-schema.ts`) carries `pausedBy`, `since`, `reason`,
  `waitsOn` (a work unit, a note, or none), `resumeNotes`, and `open`. Status ignores it today: `readProjectMeta`
  (`project-view.ts`) parses it and drops it, and the Parked tier comes from park's own markers (`isParkedPointer`,
  `scheduling: "parked"`).
- **Conflict records** (`ConflictRecordSchema`, `lib/store/conflict.ts`) come in three shapes: a hunk (a zero-based,
  end-exclusive line range with the base text and each side's content), an entry (the entry's ID, its base section,
  and each side's content and section), and a whole record (each side's record value, or none). Each side carries a
  label `{ actor, time }`. Ten of the store's families have a conflict-record kind (`lib/store/catalog.ts`); the in-repo
  readers return `conflicts: []`, so only a backend that stores state off the branch has any.
- **The derived views the registry names** (`DERIVED_VIEWS`, `lib/store/registry.ts`: `project-status`,
  `identity-status`, `archive-index`) are rendered by nothing; only `project-status` has a layout address
  (`.arc/backlog/ROADMAP.md`, `lib/layout/projection.ts`).

## Goals

1. **From the flip, `arc status --project` and `arc status --user` render on demand from the store and write no file**
   (§ 2, § 3).
2. **The view's rules stay one implementation across the flip.** The tiers, the dependency rules, the fact rows, and
   the user slices come from today's pure modules, fed by a new acquisition; only the acquisition differs, and the
   in-repo one leaves at the cutover (§ 2.1, § 3).
3. **Paused work is visible to everyone,** Planning and Active alike, with its reason, what it waits on, whether it is
   open to takers, and whether it is resumable or due for review (§ 2.3).
4. **An open conflict's sides are readable from status,** for every conflict shape, one at a time by the token a
   conflicted file's notice line prints (§ 5).
5. **From the flip `arc view` opens any work unit through the store,** a completed one and one not projected in this
   checkout included, with no identity needed for a work unit's own artifacts; a completed work unit whose slug a later
   one has taken is reached through its projected file, not `--for` (§ 6).
6. **No observable change before the flip** but the capability dispatch (§ 7), the three fixes (§ 8), and
   `arc status --conflicts`, registered and refusing until the flip (§ 5).
7. **ROADMAP's stored-file machinery can leave at the cutover with nothing breaking at the flip:** beside the rerouted
   verbs' own arms from the flip, only status's own write stops on the capability, and every other path stays in place
   and inert until the deletion pass (§ 9).

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This change does not:

- **change the behavior of status, ROADMAP, `STATUS.USER`, or `arc view` before the flip** beyond the capability
  dispatch, the fixes in § 8, and the conflict view's refusing registration;
- **render any derived view as a file from the flip** — the project view, the identity's status, or an archive index —
  **or keep a `STATUS.USER` cache;**
- **build a listing of archived work units:** from the flip the projected `completed/` folder, each archived work
  unit's placement carrying its `{ quarter, sequence }`, is that listing;
- **build a listing of closed Errands, `arc view` of a closed Errand, or a default `arc view` target for an Errand
  claim;**
- **delete a `STATUS.USER.md` left on a machine from before the flip,** which nothing reads from the flip;
- **remove any of ROADMAP's machinery,** which the cutover removes (§ 9.4);
- **make a Markdown check a gate runs read projected state** (§ 9.3);
- **add a render standard for stored views, rename the project view, or add cohort or graduation helpers to status;**
- **show a decomposition in progress:** between a cut's two batches status shows the cut's new members and cohort
  documents as ordinary stubs and cohort documents and its origin as live, and reads no cut-map record;
- **reroute the readiness composition, the in-flight expansion, or the in-repo `list`** onto anything;
- **change any workflow's text.**

## Proposed Design

§ 1 bounds the change and orders it. § 2–6 are the surfaces from the flip: the project view, the user view, the slug
query, the conflict view, and `arc view`. § 7 is the dispatch that reaches them, § 8 the three fixes to duplication,
and § 9 ROADMAP's machinery across the flip. § 10 states the refusals, § 11 the amendments to shipped specifications,
and § 12 the expected contracts this design consumes.

### 1. Boundary, scope, and order

#### 1.1 One work unit

The boundary read keeps the change whole (`stays one WU`). Its concern is one: rendering status and opening artifacts
from typed store listings. The Paused tier and the conflict view are status surfaces over the same store, `arc view`'s
arm from the flip reads the same records, and the three fixes touch the same files. A part that was once a candidate —
Markdown checks over projected state — is its own planned work, with its own design of where and when a check over
projected state runs and which files it reads, so moving it out removed scope and added nothing new to weigh. Nothing
here is landable on its own before the flip, since every arm from the flip is dark, so the change lands as one merge
reviewed in chunks and carries no delivery plan.

#### 1.2 What this change takes

- **Status handlers:** `handlers/status/views.ts` (the project and user views and the staged write),
  `handlers/status/input.ts`, `cli.ts`, and `lib/cli-help-content.ts` (`--conflicts`), `handlers/status.ts`'s mode
  dispatch, `handlers/status/lifecycle.ts`'s purpose and state reads and derived position (§ 8.2, § 4), and
  `handlers/status/store-locus.ts`'s pull warnings (`pullStoreStatus`, through which every status mode pulling under
  `--fetch` renders, § 2.4).
- **Status modules:** `lib/status/project-view.ts` (the composer's optional inputs, its tier classification exported,
  `class` and `pause` on the record candidate, the Paused tier, the new warning codes), `lib/status/project-horizon.ts`,
  `lib/status/in-flight-mine.ts`, `lib/status/ready-mine.ts` (`isMine`, § 3), `lib/status/render.ts` (the Paused tier's
  columns), `lib/status/work-unit-purpose.ts`, `lib/status/slug-position.ts` (the scope window's pause, § 4),
  `lib/store/lifecycle-index.ts` (the entry's `aliases`, § 2.1), `lib/store/lifecycle-view.ts` (the index builder
  the slug query's state read shares, § 4), `lib/session-init/store-user-pull.ts` (the pull's
  `no-identity` orientation, § 2.4), and new modules for the acquisition from the flip, one record per slug among it
  (§ 2.1), and the conflict view.
- **Shared reads:** `lib/work-unit/store-reconcile-context.ts`, whose retired-origin query § 2.2 calls, and
  `handlers/status/store-session.ts`, whose parser of `pause.review_after_days` the marks share (§ 2.3).
- **`arc view`:** `handlers/view.ts`, `lib/view-artifact.ts`, `lib/view/types.ts`, `lib/view/started-artifacts.ts`, and
  `commands/view/run.ts`.
- **The fixes:** `handlers/identity-pointers.ts`, `lib/status/project-oracle-context.ts`,
  `scripts/review-gate/hosts/local/live-context.ts`, the identity messages (`lib/status/user-view.ts`,
  `handlers/recover.ts`, `commands/status/result-composition.ts`, `commands/status/format.ts`),
  `strategy-session-operations.md` in the package source and its synced copy, `lib/store/lifecycle-design.ts` with the
  meta parameter of `lib/store/lifecycle-record-path.ts` and `lib/store/lifecycle-write.ts`'s `workUnitMetaPath`
  (§ 8.2), and a conformance test for `lib/layout/schema.ts`'s work-unit kind list.

#### 1.3 Order and shared files

This change lands after the change that derives locus and the in-flight set from the checkout marker and the store,
whose pieces it consumes (§ 12), so it edits that change's version of every file both touch: `cli.ts`,
`lib/cli-help-content.ts`, `handlers/status.ts`, `handlers/status/lifecycle.ts` (the locus reads in the slug query's
arm, before this change's purpose and state reads and derived position), `handlers/status/store-locus.ts` (the slug
query's pull, through which every status mode then pulls under `--fetch`, § 2.4), `handlers/status/store-session.ts`
(the setting parser, § 2.3), `lib/session-init/store-user-pull.ts` (the pull's orientation, § 2.4),
`handlers/recover.ts`, `commands/status/format.ts`, `handlers/view.ts` and `lib/view-artifact.ts` (the session context,
the default target, and the session-notes resolver's arms from the flip, § 6), `lib/store/lifecycle-index.ts` (the
entry's `links`, beside which this change adds `aliases`), and `lib/store/lifecycle-record-path.ts`
(`cohortDocumentPath`, beside which this change narrows `lifecycleRecordPath`'s meta parameter). Two files are shared
with the delivery-and-review change, and whichever lands second takes the conflict:

- `handlers/status/lifecycle.ts`, where that change moves the slug query's operational-boundary read;
- `scripts/review-gate/hosts/local/live-context.ts`, where that change edits the local host for the flip.

The ref backend's binding of the synchronization port also lands after the locus change, in either order with this one
(§ 12). It shares `handlers/status.ts`, `handlers/status/store-locus.ts`, whose `pullStoreStatus` is the one place
status renders the port's results under `--fetch` (§ 2.4), and `lib/session-init/store-user-pull.ts`, and whichever
lands second takes the conflict. The projection's change, which gives the work-item path function,
`lifecycleRecordPath`, `workUnitMetaPath`, and `lifecycleArtifactPath` a checkout-root input and updates their callers,
also lands in either order with this one. It shares `lib/store/lifecycle-record-path.ts` and
`lib/store/lifecycle-write.ts` (whose meta parameter this change narrows, § 8.2), `lib/store/lifecycle-view.ts` (§ 4),
and `lib/work-unit/store-reconcile-context.ts` (§ 2.2), and the arms from the flip call those path functions (§ 6.3);
whichever lands second takes the conflict.

The review chunks run in this order: the fixes (§ 8), of which the identity fix is the only change observable before the
flip; the pure modules' additions, with the in-repo render's byte-identity tests (§ 1.4); then the arms from the flip —
the project view (§ 2), the user view (§ 3), the conflict view (§ 5), and `arc view` (§ 6) — with the dispatch (§ 7) and
the staged write's refusal (§ 2.5) in the chunk of the arm each serves, and the slug query's state read and derived
position (§ 4) in the project view's, which builds the standing entries the state read takes (§ 2.1).

#### 1.4 Before the flip

Today's behavior holds before the flip but for:

1. **the identity fix** (§ 8.1), observable where `arc.identity` is unset and in the status render's identity label;
2. **the kind-list test** (§ 8.3), which adds a test and changes no behavior;
3. **`arc status --conflicts`,** registered and refusing `unsupported` (§ 5).

The purpose parse (§ 8.2) changes only code an arm from the flip runs.

The additions to the pure modules both arms run — the composer, the horizon advisory, the in-flight builder, and the
scope window's projection (`projectScopeWindow`, § 4) — are optional inputs and values the in-repo arm never passes or
produces, and the composer's default readiness reading its own classification (§ 2.2) classifies the same records
against the same index as today, so the in-repo render stays byte-identical, which a test holds for the project view,
the staged and ROADMAP renders, and the user view over today's fixtures, and the scope window's unit tests, which pass
no pause, hold the slug query's in-repo window (`__tests__/unit/status/slug-position.test.ts`). Every other change in
this design runs only in an arm from the flip.

#### 1.5 In-repo arms kept until the deletion pass

These run only while the capability is false, and the cutover's deletion pass removes them:

- **The project view's acquisition:** `resolveProjectReadinessViewInput`, `resolveProjectReadinessComposition`, its
  record merge (`mergeProjectReadinessRecords`), the oracle's in-flight reads (`resolveOracleCandidates`), the Errand
  index projection (`readTransientInFlightIndexes`, `projectTransientInFlightRead`, `lib/errand/record.ts`) and its
  context (`resolveProjectErrandOracleContext`), the render stamp (`resolveProjectReadinessRenderStamp`), and the parked
  derivation (`isParkedPointer`, `listParkedSlugs`).
- **The user view's acquisition and write:** `runStatusUserView`'s direct in-flight derivation, `buildReadyMineSlice`
  with its own readiness rule and `lib/status/ready-mine-source.ts`, and `assembleStatusUserView`'s `STATUS.USER.md`
  write.
- **The staged write** (`handleStagedProjectStatus`) and the ROADMAP renders (§ 9.2).
- **`arc view`'s:** `resolveAmbientTarget`'s in-repo arm, the explicit target's read of the composed lifecycle index
  (`resolveExplicitViewTarget`), `selectWorkUnitDesign`, the user-surfaces resolver (`resolveUserSurfaceResolver`,
  called from `handlers/view.ts`), the session-notes resolver call, the cohort resolver (`resolveActiveCohortDocPath`),
  and the hand-built project inbox path in `lib/view-artifact.ts`.
- **The `ROADMAP_PATH` literals** and the `project-document` address's in-repo readers (§ 9.2).

### 2. The project view from the flip

#### 2.1 Acquisition

With the capability true, `arc status --project` reads lifecycle's view alone (`readLifecycleView`), never
`resolveProjectReadinessComposition`, maps each entry standing for its slug to a readiness record, and passes the
records to today's composer (`composeProjectReadinessViewResult`), which builds its own index from them
(`lifecycleIndexFromRecords`). The tiers, the dependency rules (`classifyDependencies`: an edge is satisfied once its
work unit has shipped, and one naming no work unit blocks a Planning row with a warning), the depth bands, and the fact
rows therefore stay one implementation across the flip.

- **The mapping.** Each entry gives a record: the slug from its reference's owner name; `location` from its
  placement-derived `location` and `state` from its `phase`, the meta's `State`; owner, priority, `dependsOn`, and
  cohort from its parsed fields, priority validated as today's meta read validates it (`validatePriority`); a `source`
  naming the store, a value the in-repo arm never produces; `class` from `workClass` (§ 3); `pause` from its parsed
  pause, an optional field `ProjectReadinessRecordCandidate` gains and the in-repo arm never fills; and `purpose` from
  its design's parsed purpose.
- **One record per slug.** The composer keys every rule by slug, and today's record merge gives it one record per slug
  (`mergeProjectReadinessRecords`). From the flip a slug can have several holders, each its own entry, since lifecycle's
  view keys its entries by UID (`listLifecycleIndex`, `lib/store/lifecycle-index.ts`): a completed work unit and a new
  one reusing its slug (the contract's D2), or two live ones after a clash (D14). One function in the acquisition from
  the flip selects, from lifecycle's entries, the entry standing for each slug as the store's slug lookup ranks holders
  (`preferredSlugRecords`, `__tests__/helpers/store/lookup.ts`, which the ref backend ranks alike) and reports each
  clash; the acquisition maps the standing entries alone, and the slug query builds its state from them (§ 4).
  Lifecycle's own slug index (`readLifecycleView`) stays as it is, keeping the last entry listed for a slug, since
  lifecycle's verbs from the flip pick their subject from its entries by name (`readLifecyclePrimary`,
  `lib/work-unit/verbs/activate-deactivate-store.ts`; `agreesWithInventory`,
  `lib/work-unit/lifecycle-store-executor.ts`) and its store reconcile checks words against it
  (`artifactAliasTransitions`, `lib/work-unit/store-reconcile-context.ts`): how they treat a reused or clashed slug is
  not this change's, and no change owns it yet, nor does the storage-coupling register hold a row for it.
  `LifecycleEntry` gains an optional `aliases`, its record's former slugs (§ 12), carried only where the record has at
  least one, an empty list dropped, and read only by this function. For each slug:
    - **a live entry named by it,** at any placement but `completed`, stands, and the completed entries named by it are
      left out, so an edge naming a reused slug classifies against the live work unit, as `readWorkUnit` resolves it;
    - **else, where a live entry holds it as a former slug,** no entry stands for it, so an edge naming it takes § 2.2's
      lookup, which names that live work unit, or refuses `ambiguous-match` where several hold it;
    - **else the one completed entry named by it** stands, and of several, which the lookup refuses `ambiguous-match`,
      the latest archived, by its placement's quarter, then its sequence.

  Where several live entries are named by one slug, a clash, none stands. A clash arises wherever writes can land two
  live holders of one slug: the ref backend's pull merging two machines' records, or two processes on one machine
  creating the slug, or renaming onto it, at once (`spec-storage-ref-backend.md` § 6.4, § 5.1). A `slug-clash` warning
  names the slug and each holder's UID, owner, and location, states that the view omits them, and states that renaming
  one holder repairs it, naming no command (§ 10): the ref backend's store takes a rename naming one holder by its UID
  (`spec-storage-ref-backend.md` § 5.1), but no command reaches it yet, since `arc rename` resolves its subject by slug
  (`readStoreRenameSubject`, `lib/store/lifecycle-rename.ts`), which refuses `ambiguous-match` there. An edge naming
  that slug takes § 2.2's lookup, which refuses `ambiguous-match`, so it stays unsatisfied with that section's
  `store-read-failed` warning.

  A meta lifecycle's view withholds, one with open conflicts or a malformed one, reaches the listing only as a
  `malformed` diagnostic keyed `work-item/meta:<name>` (`lifecycleEntry`, `lib/store/lifecycle-index.ts`), so the view
  cannot tell whether it is the live holder of its name. That name fails closed: no entry stands for it, the entries
  named by it are left out, and an edge naming it stays unsatisfied, reported by the diagnostic's own
  `listing-diagnostic` warning (below) rather than classifying against another holder of the name or reading as
  dangling. An edge whose § 2.2 lookup names a work unit the listing does not hold stays unsatisfied the same way. The
  name is read from the diagnostic's key, whatever its kind, since a backend's own diagnostic for a meta its parser
  rejects carries the same key. A diagnostic under any other key — a backend's own key for an `oversized`,
  `unreadable`, `unknown-format-version`, or `key-mismatch` record, which may name the record by its UID — names no
  work unit, so it fails no name closed: its `listing-diagnostic` warning states that the view omits a record. Failing
  every name closed for it instead would drop every completed holder whenever any record is unreadable, leaving each
  dependent of shipped work Blocked.
- **Purposes come from one listing per design kind.** The acquisition lists `work-item/spec`, `work-item/draft`, and
  `work-item/companion` once each per render, with no owner in the input, groups the records by owner identity, the UID
  where the reference carries one, as lifecycle's view keys its entries, so a reused slug's purpose comes from its own
  work unit's design, and selects each work unit's design from its group through the selection `readLifecycleDesign`
  uses (§ 8.2). An `absent` design listing, the usual result for a kind no work unit has, adds no candidates and no
  warning. A design listing that refuses, or reads `unreadable`, leaves every purpose empty, so no purpose is chosen
  from an incomplete set of designs, and adds a `store-read-failed` warning carrying its condition and remedy; a
  complete one's diagnostics add `listing-diagnostic` warnings; the view still renders.
- **In Flight comes from placement:** a work unit at placement `active` whose record carries no pause. The in-flight
  set (§ 12) adds nothing here: what its degradation concerns, Errands and claims, the project view never shows.
- **The tiers from the flip are In Flight, Ready, Blocked, and Paused** (§ 2.3), Paused taking Parked's place. No work
  unit parks from the flip, since `arc park` refuses there (`runPark`, `lib/work-unit/verbs/park-resume.ts`), so the
  Parked tier, printed only when it has rows, holds only a planned work unit whose `State` reads Active, which no verb
  from the flip writes, and never a paused one.
- **Completeness.** A refused read refuses the command with the refusal's condition and remedy, and so does an
  `unreadable` listing with its own, since it carries no entries and an empty render would read as no work. An `absent`
  listing renders the empty view. A `complete` listing renders the entries it has, each diagnostic passed as a source
  warning (the composer's `sourceWarnings` input) with the `listing-diagnostic` code, carrying the diagnostic's
  condition and remedy (`ListingDiagnosticSchema`, `lib/store/read.ts`) and, where the listing missed a record, stating
  that the view omits it, so a malformed record never reads as absent work. The arm from the flip never passes the
  composer's `indeterminate` input, whose warning describes in-flight derivation.
- **Conflicted records.** Lifecycle's view withholds a meta with open conflicts, so lifecycle's verbs never act on a
  conflicted record: it reaches the view as its `listing-diagnostic` warning, which names its conflict records, states
  that the view omits it, and passes through the diagnostic's remedy, and its name fails closed as the fold above
  states. The conflict view lists its conflicts (§ 5).
- **Warning codes.** `ProjectReadinessWarningCode` gains `listing-diagnostic`, `store-read-failed` (a design listing
  refusing or `unreadable`, an edge's lookup or lineage listing, or a marking failing, § 2.2, § 2.3), `dependency-retired`
  (§ 2.2), `pull-incomplete` and `pull-notice` (§ 2.4), and `slug-clash`; the in-repo arm emits none of them. The codes
  are the project view's (`--project --json`); the user view's warnings stay strings, as `StatusUserViewResult.warnings`
  (`lib/status/user-view.ts`) is today (§ 3).
- **No render stamp.** The composer's `renderedRef` becomes optional; with none, the view's header carries no stamp
  lines, since a view rendered on demand cannot go stale.
- **`--json`** writes the same `{ markdown, warnings, facts }` result as today. Each fact row keeps today's fields —
  slug, purpose, owner, derived lifecycle state, position, horizon advisory, dependency satisfaction, readiness, and
  unsatisfied dependencies — so session-init's discovery and the routing method's horizon advisory read it unchanged. A
  paused work unit's fact row keeps its derived lifecycle state (`planning`, `active`), which the composer's index gives
  from phase and location; its pause shows in the horizon advisory (§ 2.3).

#### 2.2 Edges naming no listed work unit

The composer resolves an edge only against the records it is given, so an edge whose slug names no listed work unit
reads as dangling (`dangling-dependency`, "depends on missing work unit"). Two such edges are not dangling: one naming a
renamed work unit's former slug, which a dependent keeps until its owner's reconcile rewrites it, and one naming a
retired origin, decomposed or abandoned, whose primary record the retiring transition removed. The composer cannot look
either up, so the acquisition resolves each unlisted edge before composing and passes the results as an optional input
the in-repo acquisition never passes:

1. **By slug,** `store.lookup({ kind: "slug", slug })`. A match names the work unit the edge means, and the edge
   classifies against that work unit's listed record: satisfied once it has shipped, as any edge. A match the listing
   does not hold, a withheld meta's, leaves the edge unsatisfied (§ 2.1). A match that is no work unit's meta, an
   Errand's record, which the lookup ranks beside metas, names no work unit, so the edge reads as step 3 states.
2. **Then by lineage origin,** where the slug lookup refuses `not-found`, as the dependent's own reconcile resolves the
   same edge, through its disposition query's pieces (§ Introduction / Context), exported for this: the lineage listing,
   read once per render and only when an edge reaches this step, enumerated by origin, with the terminal records' former
   names, so an edge naming a retired origin's former slug resolves as one naming that origin. A `decompose` or
   `abandon` record names a retired origin. A `rename` record found there, whose successor the slug lookup did not find,
   resolves as an edge naming that successor, as the reconcile follows it (`planDependencyReconcile`). The edge stays
   unsatisfied, as a dangling edge does today, and its warning (`dependency-retired`), in place of "missing work unit",
   names the retirement, the dependent's disposition, which the query matches by the dependent's UID first, then its
   name, and that the dependent's dependency reconcile applies it:
    - for a cut, the dependent's `incoming` entry: the work units replacing the edge, or why the edge drops;
    - for an abandonment, `abandoned`, since an abandonment rewrites no dependent's `Depends On`;
    - for a dependent the cut did not map, no disposition (`unmapped-dependent`): the warning says so and names the
      remedy, editing the dependent's `Depends On`, which its owner may do, or anyone for a stub.

   The reconcile that applies a disposition is the dependent's own (`planDependencyReconcile`,
   `lib/work-unit/side-effects/discharge-dep-edges.ts`): at activation (`runStoreActivate`), or sooner by
   `arc wu reconcile --apply` from its checkout. Until then a stub depending on an abandoned origin reads Blocked, with
   the warning.
3. **Neither found:** today's dangling-dependency warning, also for an edge that is not a valid slug (`SlugSchema`),
   which takes no lookup.

A lookup or history read refusing with anything but `not-found`, a lineage listing that is not complete or holds a
record that does not parse, a former slug two terminal records held, several records for one origin, or a chain of
renames returning to a name it passed adds a `store-read-failed` warning naming its condition and remedy, and the edge
stays unsatisfied; it never reads as a missing work unit. The dependent's reconcile reads the same listing and refuses on
the same conditions.

The resolutions reach every composer site that reads an edge. They reach its classification (`classifyDependencies`),
and its default readiness (`depsOnlyReadinessProvider`), which classifies the records again today, reads that same
classification instead, so an edge's satisfaction and its row's readiness always agree. They reach its depth banding
(`blockedDepths`), which bands a Blocked row below the work unit each unsatisfied edge resolves to, where today it looks
the edge up by its written slug. Rows and fact rows show each edge as the dependent's `Depends On` writes it, the form
its reconcile rewrites.

#### 2.3 The Paused tier

The Paused tier shows every work unit whose record carries a pause (§ 2.1), Planning and Active alike and whatever its
placement; no other tier shows it. It prints only when it has rows, where Parked prints today. Each row carries the In Flight
tier's columns (`PROJECT_IN_FLIGHT_COLUMNS`) and, from the pause, its reason, what it waits on (a work unit, a note, or
nothing), and whether it is open to takers, and its mark: `resumable`, `review-due`, or none.

- **The marks come from one function** that the session-start slot for a person's paused work also uses (§ 12): given
  the store, one paused work item `{ slug, pause }`, and the `pause.review_after_days` project setting, it marks the item
  `resumable` once the work unit it waits on ships, and `review-due` at once if that work unit ends otherwise, abandoned
  or cut, or once a pause waiting on no work unit passes the setting's age, measured from the pause's `since`. It reads
  no identity and no checkout, so it marks anyone's paused work alike. The acquisition calls it for each paused row and
  passes the marks to the composer as an optional input; nothing in status computes a mark itself. A marking that fails
  — its lookup refusing, or a record it reads unresolved — leaves the row unmarked and adds a `store-read-failed`
  warning carrying the failure's text.
- **The horizon advisory** (`projectHorizonAdvisory`, `lib/status/project-horizon.ts`) gains a paused arm, keyed on the
  record's pause, which its input gains, and taking precedence over the others, as its parked arm does today:
  "`<slug>` is paused (P<n>); an entry routed here waits for its resumption. Resume it or send a separable part now?".

#### 2.4 Freshness

From the flip `--project` renders from the local store by default, and `--fetch` pulls state first, the flag the slug
query already takes for its remote read (`handleLifecycleStatus`). `--local` and `--no-fetch` stay accepted and render
locally, as the default does. Given together, they keep today's precedence: `--local` wins over `--fetch` in any order
(`localOnly`, `handleProjectStatus` and `handleUserStatus`, `handlers/status/views.ts`), and of `--fetch` and
`--no-fetch`, which set one field (`fetch`, `statusCommandInputRegistration`, `handlers/status/input.ts`), the later
wins. Session start already pulls under `session.remote_sync`, and session-init's discovery and the routing method's
horizon advisory run `arc status --project` after it, so a default render reads what that pull brought; a read surface
pulls, merging remote state and filing conflict records (§ 5), only when asked. A render is as fresh as the store's last
pull.

Under `--fetch` the pull goes through the session context's synchronization port (§ 7, § 12), the one session start
uses, and its result renders before the view:

| Pull result          | Renders from the local store, with                                               |
| -------------------- | -------------------------------------------------------------------------------- |
| `pulled`, `noop`     | no warning but for its notices, below                                            |
| `no-remote`          | no warning, since a store with no remote is ordinary                             |
| `no-identity`        | `pull-incomplete`: no identity resolved, naming `git config arc.identity <name>` |
| `unreachable`        | `pull-incomplete`, carrying its condition and remedy                             |
| `incomplete`         | `pull-incomplete`, carrying its condition and remedy                             |
| `designation-needed` | `pull-incomplete`, carrying the designation line and its command                 |

Each warning the table names is built from the orientation a pull's result gets for session start's `user` slot
(`describeStorePull`, `lib/session-init/store-user-pull.ts`), the locus change's but for its `incomplete` arm, which the
ref backend's binding adds (§ 12): its summary, then its remedy's text where the summary leaves it out (`unreachable`,
whose summary is the condition alone), and its remedy's command where the result carries one (`argv`, the recommended
command `designation-needed` gives). Every status mode that pulls under `--fetch` renders its pull through one function,
the slug query's `pullStoreStatus` (`handlers/status/store-locus.ts`), which today warns only for `unreachable` and
which this change rebuilds to return each warning this section names with its code: `--project` keeps the code, and
`--user`, `--conflicts`, and the slug query's arm from the flip (§ 4) render the warning as text. Session start's `user`
slot, which pulls under `session.remote_sync` rather than `--fetch`, keeps its own rendering of that orientation. The
orientation's `no-identity` summary gains `git config arc.identity <name>`, which session start's slot then shows too,
from the flip only, since its probe pulls nothing before (`probeStoreUserPull`).

Each notice the port's result carries (`PullNotice`, `spec-storage-ref-backend.md` § 2.2), a successful outcome's or one
inside the partial outcomes an `incomplete` result keeps (§ 12), renders through `pullStoreStatus` as a `pull-notice`
warning carrying the notice's condition and remedy; session start's slot renders a pull as the locus change and the
binding give it. A notice that an item ended with open conflicts passes through its condition and remedy too, the ref
backend's, the remedy naming `arc store conflict`, which inspects and explicitly discards each record the notice lists
(`spec-storage-ref-backend.md` § 6.6, A16). Its warning also names the item and each conflict record the notice lists,
and states that the conflict view does not list them, since the item was abandoned or cut, its records now on its
history ref (`spec-storage-ref-backend.md` § 6.6, § 7.4), which the store's listing does not read (`listRefRecords`,
`lib/store/ref/read.ts` in the ref backend's change); it adds no `arc status --conflicts`. A conflict a pull files on a
listed item also shows in the conflicted file's notice line, which names `arc status --conflicts <conflict>`, in the
conflict view's listing, and, on a work unit's meta, as its listing diagnostic (§ 2.1). Until the port is bound to a
backend's pull it pulls nothing and reports `no-remote`, so a `--fetch` render is local with no warning, and until the
ref backend's binding lands the port's results are the locus change's, without `incomplete` or notices (§ 12). The
flags' help text in `cli.ts` and the `status` help notes in `lib/cli-help-content.ts` describe today's arms until the
cutover rewrites them (§ 12), since changing them before the flip would be observable.

#### 2.5 The staged write refuses from the flip

`arc status --project --staged`, with or without `--write`, refuses `unsupported` from the flip, naming
`arc status --project`: no ROADMAP file exists to write, and the Git index holds no state to render from. Before the
flip it runs as today.

### 3. `arc status --user` from the flip

From the flip `--user` renders the identity's in-flight and ready slices on demand and writes nothing. It renders from
the local store by default and, under `--fetch`, pulls once before both slices, as § 2.4 states. With no identity
resolved it prints the identity message (§ 8.1) and exits 0, as today, its `--json` result carrying the same
`source: "no-identity"`.

- **The in-flight slice** comes from the in-flight set (§ 12) and feeds today's pure builder (`buildInFlightMineSlice`,
  `lib/status/in-flight-mine.ts`). The set applies the locus change's identity rule (§ 12): every entry outside team
  mode or with no identity resolved, and inside it the identity's own and unowned entries, Errands among them, where
  today's rule passes every Errand (`keepForIdentity`, `lib/git/in-flight-derivation.ts`). The builder still drops
  Errands, gains a paused arm — a row's state renders `Paused` where its entry's scheduling is `paused`, as it renders
  `Parked` today — and renders an entry with no branch, since it reads none. The set's warnings render as today's do,
  each in its own text (`renderInFlightWarning`), and a set marked degraded adds a warning that the in-flight slice may
  be incomplete, naming `arc status --user` to render it again: the remedy for a failed read of the checkout's local
  refs, which the set reports by its mark alone (§ 12).
- **The ready slice** comes from the same acquisition as § 2.1. The composer's tier classification, inline today, is
  extracted into a pure function `project-view.ts` exports and the composer itself calls, so `--project`'s tiers and
  `--user`'s ready rows cannot drift; `ProjectReadinessViewResult` and `--project --json` keep their shape. The slice
  takes the Ready tier's rows that are the identity's own or unowned (`isMine`, `lib/status/ready-mine.ts`) and renders
  them in today's columns (`STATUS_USER_READY_COLUMNS`, `lib/status/render.ts`: work unit, Class, priority, cohort).
  `ProjectReadinessRecordCandidate` gains an optional `class`, which the acquisition fills from the meta's parsed
  `workClass`, so Class still renders.
- **The rule for a ready row changes from the flip** to the project view's: a Planning work unit at a planned
  placement, not paused, whose dependencies are satisfied, with an unlisted edge resolved as § 2.2 states. Today's
  slice has its own rule (`buildReadyMineSlice`), which also lists a planned meta whose `State` is Active and drops a
  row with a missing dependency silently; that rule stays in the in-repo arm.
- **Completeness** follows § 2.1: a refused or unreadable listing refuses, and a complete one renders with its
  diagnostics as warnings, a withheld meta among them, and a `slug-clash` warning for each clash.
- **Warnings in text mode.** Today's arm prints no warning in text mode, carrying them only in its `--json` result, and
  keeps that. From the flip text mode prints each warning to stderr as `warning: <text>`, as `--project` does, so an
  omitted record or a clash never reads as absent work.
- **`--json`** writes the same result shape as today.

### 4. `arc status <slug>`

From the flip the slug query is lifecycle's arm (`handleStoreLifecycleStatus`), with the locus reads and the
operational-boundary read other changes add to it (§ 12). This change alters four things in it:

- **Its purpose read** (§ 8.2).
- **Its state read,** which takes an index built from § 2.1's standing entries, in place of that view's index, so a
  reused slug reports its live holder's state. The index comes from the builder `readLifecycleView` uses
  (`buildLifecycleIndexFromRecords` over its entries), exported from `lib/store/lifecycle-view.ts` for both, since that
  function's module is a raw state helper, which only `lib/store/` imports without raising a `store-raw-state` count
  (§ Cross-cutting Considerations).
- **Its derived position and scope window,** which its `--json` carries as `derivedPosition` and `scopeWindow` and its
  text as the in-repo arm prints them, read as the in-repo arm reads them (`readDerivedSlugPosition` and
  `projectScopeWindow`, `lib/status/slug-position.ts`; § 12). The roster comes through the derived locus probe given the
  arm's store (`runDerivedLocusStateProbe`'s `store` option) and the identity the arm resolves, so no second store is
  built (§ 7). The checkout path field the arm's locus reads give (`readStoreStatusLocus`), a failed lookup's text among
  its values, decides only whether the roster is read, since the row is chosen by the work unit's key alone
  (`selectWorkUnitRow`), and a failed roster read's warning joins the arm's warnings. The scope window reads the state
  the standing entries give and the record's pause, which `projectScopeWindow`'s input gains and the in-repo arm never
  passes: a paused work unit's window is null, whatever its checkout or state, on the `lifecycle` basis, since the pause
  is a field of the record, with the reason that a routed concern waits for its resumption, as a parked one's is today
  and as § 2.3's paused advisory reads.
- **Its pull under `--fetch`,** which takes the session context's port (§ 7), and the pull's warnings, which § 2.4
  gives.

### 5. The conflict view

`arc status --conflicts [<conflict>]` shows the store's open conflict records.

- **Its own mode.** `--conflicts` joins the status modes everywhere they are held exclusive: the options' conflict
  lists (each mode's `Option(...).conflicts([...])`, `cli.ts`), which `--conflicts` gets too, the input schema's
  refinement and its message (`StatusCommandInputSchema`, `handlers/status/input.ts`), `handleStatus`'s count and its
  message (`modeCount`, `handlers/status.ts`), and the `status` help notes that list the modes
  (`lib/cli-help-content.ts`). So it combines with no slug, `--session-init`, `--session-handoff`, `--recover`,
  `--user`, or `--project`. These change before the flip, as part of the flag's registration. Its freshness is
  § 2.4's: it reads the local store, `--fetch` pulls first, and `--local` and `--no-fetch` render locally, with
  § 2.4's precedence.
- **Whose conflicts.** The families owned by the project, a work item, or a cohort list for everyone. The `personal` and
  `claims` families are scoped to an identity (`FAMILY_REGISTRY`, `lib/store/registry.ts`, each under
  `refs/arc/user/<id>/`), so their listings read the conflicts the store holds for the resolved identity, which the view
  names as those two listings' owner, since a person's name has no other holder to hide; with no identity resolved they
  list `absent` (`listReference`), and the view lists the rest and warns that those two families were not read, naming
  `git config arc.identity <name>`.
- **The token.** `<conflict>` is `<family>/<owner type>/<owner name>/<id>`, the form a conflicted file's notice line
  prints and `arc save --resolve <conflict>` parses (§ 12).
- **With no token** it lists every open conflict of a listed item across the ten families' conflict-record kinds
  (`lib/store/catalog.ts`), each listing but the identity-scoped two given no owner in its input (`ListInputSchema`,
  `lib/store/read.ts`). An abandoned or cut item's retained conflicts reach status only as its pull's notice (§ 2.4).
- **With a token** it lists that family's conflict-record kind the same way, with no owner in the input, and matches the
  token's owner type, owner name, and ID itself. An owner named without its UID resolves to a single holder, the live
  one first (`listReference`, `__tests__/helpers/store/read.ts`), which would hide a completed holder of the same name,
  so the view never names the owner in the listing's input. Where several owners match it shows each. An unknown token
  refuses, naming `arc status --conflicts` to list them.
- **Each conflict shows** its token, its subject record, both sides' labels, and both sides' content: for a hunk the
  line range, the base text, and each side's content; for an entry its ID, its base section, and each side's section
  and content; for a whole record each side's value, or that the side removed it.
- **A record that does not decode.** No parser is registered for the conflict-record kinds, so the view decodes each
  record's content against `ConflictRecordSchema` itself. One that does not decode is omitted, with a warning naming its
  token, stating that its content could not be read, and naming `arc store conflict`, which inspects and discards a
  conflict record (`spec-storage-ref-backend.md` § 6.6, A16); the view lists the rest.
- **`--json`** writes `{ conflicts, warnings }`: the matched conflict records as the store lists them, each with its
  token, and the view's warnings as strings.
- **Before the flip** the flag refuses `unsupported`: the in-repo implementation stores no conflict record, and a
  conflict in a tracked file shows as a Git conflict, which the refusal names `git status` to see.

### 6. `arc view` from the flip

#### 6.1 Targets

- **The default target** is the locus change's arm from the flip of `resolveAmbientTarget` (`createViewDependencies`,
  `handlers/view.ts`; § 12): the checkout's claim (`resolveCurrentWorkUnit`), a work-unit claim giving its work unit,
  and anything else, an Errand claim, no claim, or a claim that does not resolve, giving no default target. The command
  then refuses with a message of the arm from the flip: no work-unit claim resolved for this checkout, each warning
  `resolveCurrentWorkUnit` returned (a malformed marker or meta, a claim lookup, read, or listing refusing or
  unreadable, or a listing diagnostic), each candidate where it reports several (`ambiguous`), and `arc view <kind>
  --for <slug>` to open a work unit's artifacts. This change extends the locus change's arm to return that message,
  which `unavailableTarget` prints in place of its own. Today's no-target message ("No active work unit matches the
  current branch.", `unavailableTarget`, `lib/view-artifact.ts`), which names no remedy and describes a branch match the
  arm from the flip does not make, stays the in-repo arm's. This change builds `createViewDependencies`'s other arms
  from the flip: the explicit target, the cohort read, the session notes (§ 6.4), and the personal records.
- **`--for <slug>`** reads the work unit through `readWorkUnit`, whose slug lookup also resolves a former slug. A slug
  naming no work unit refuses as an unknown target does today; a closed Errand is no work unit, so it is never viewed.
  The lookup gives a slug's live holder over a completed one, so a completed work unit whose slug a later one holds is
  not reached through `--for` and opens through its projected file under `completed/`. A lookup refusing
  `ambiguous-match`, where several holders tie — two live after a clash (§ 2.1), two live that each renamed away from
  the slug, or several completed with none live — refuses with the lookup's condition and remedy, passed through as the
  store gives them, and adds that a completed holder opens through its projected file under `completed/`, the route that
  reaches several completed holders, since `--for` and `arc rename` both resolve their subject by slug.
- **A completed work unit** opens through `--for`, where today it refuses: each artifact at its projected path under
  `completed/`, or its content where no file is projected (§ 6.3).

#### 6.2 Kinds

`VIEW_KINDS` (`lib/view/types.ts`) keeps today's ten names, and one table typed by `KindId` (`lib/store/catalog.ts`)
maps each to what it reads, so a renamed or removed store kind fails the type check:

| View kind        | Reads                                                                              |
| ---------------- | ---------------------------------------------------------------------------------- |
| `meta`           | `work-item/meta`                                                                   |
| `tasks`          | `work-item/task-list`                                                              |
| `spec`           | `work-item/spec`                                                                   |
| `draft`          | `work-item/draft`                                                                  |
| `notes`          | `work-item/notes`                                                                  |
| `session-notes`  | `work-item/meta`, where session context lives from the flip (§ 6.4)                |
| `design`         | the spec, draft, or companion `readLifecycleDesign` selects, not a kind of its own |
| `cohort`         | `cohort/document`, for the cohort the work unit's `Cohort` field names             |
| `working-memory` | `personal/working-memory`                                                          |
| `inbox`          | `personal/inbox`, or with `--project` `project-inbox/inbox`                        |

`readLifecycleDesign` gains a return of the record it selects (`StoreRecord`: its reference, version, and conflicts),
beside its content, so the view opens that record and warns of its conflicts (§ 6.3). With no kind given, an open work
unit opens its furthest artifact present, in today's order (`resolveFurthestPresent`, `lib/view-artifact.ts`: tasks,
spec, draft, meta), and a completed one opens its meta, which carries its completion and release notes. The personal
kinds read the resolved identity's records and keep today's refusal where no identity resolves
(`resolveViewArtifactUnchecked`, `lib/view-artifact.ts`).

#### 6.3 Paths and content

A work item's artifact path comes from the one function that resolves it through the layout resolver (§ 12), and a
companion design's from `lifecycleRecordPath` (`lib/store/lifecycle-record-path.ts`), which places it beside its meta.
The cohort document's comes from the cohort record through the locus change's `cohortDocumentPath` (§ 12). These
functions sit under `lib/store/`, so the arms calling them raise no `work-unit-paths` count (§ Cross-cutting
Considerations). The personal records' and the project inbox's paths come from their layout addresses (`resolveArcPath`,
`lib/layout/projection.ts`). A target counts as projected here when a file exists at that path, and then opens as
today: shown, its path printed with `--path`, or opened with `--editor`.

A target with no file at that path — another identity's work unit that this checkout's in-flight view setting does not
project, or a file briefly absent while a refresh replaces it — renders the record's content through
`ViewArtifactResult`'s content arm (`lib/view/types.ts`), which `resolveRefViewArtifact`
(`lib/view/started-artifacts.ts`) builds today for an artifact read at a ref: its `ref` is the record's version, and
its `displayLabel` names the work unit and the kind. `--path` and `--editor` refuse there with their own text: the work
unit's `<kind>` has no file in this checkout, and `arc view <kind> --for <slug>` renders its content. Today's refusal for
a ref (`viewArtifactFileRefusal`) is not reused, since it names its ref as where the work unit is.

A target whose record has open conflicts carries a warning naming `arc status --conflicts <conflict>` for each of its
conflicts (§ 5). With a file at its path it opens that file as any projected target does, for display, `--path`, and
`--editor`, showing whatever the projection wrote for the conflict (§ 12). With no file it renders the record's current
side, as the store reads it, through the content arm above.

#### 6.4 Session notes open the meta

From the flip a work unit's session context is a section of its meta, so `session-notes` opens the meta, resolved as
the `meta` kind is, through the work-item path function, which reads no identity. It is the path the session-notes
resolver gives from the flip (`resolveWorkUnitSessionNotesPath`, `lib/handoff/session-notes-path.ts`; § 12), but that
resolver requires an identity, and a work unit's meta is not identity-scoped, so the arm from the flip does not call
it. This arm takes the place of the session-notes arm from the flip the locus change gives `createViewDependencies`,
which calls the resolver and reads the meta through the store, refusing one with open conflicts; a conflicted meta
renders as § 6.3 states. The in-repo arm keeps calling the resolver, with today's missing-identity refusal
(`resolveSessionContextArtifact`, `lib/view-artifact.ts`), and never reads the interim per-person session-context kind
(`personal/session-context`), which retires at the flip.

### 7. The capability dispatch

No handler builds a second store. The status handlers that serve an arm from the flip — `handleProjectStatus` and
`handleStagedProjectStatus`, `handleUserStatus`, and the conflict view's handler — take the store and the
synchronization port from the session context (`SessionStatusContext`'s `store` and `storeSync`), the port session
start's `user` probe pulls through (`probeStoreUserPull`, `lib/session-init/store-user-pull.ts`), using the port's
default (`createStoreSyncPort`, `lib/store/operational-sync.ts`) where the context carries none, and branch on
`usesOffBranchState` over that store; tests inject both through `createSessionStatusContext`'s `operational` input. From
the flip the slug query's arm takes the same context's store and port, so its `--fetch` pulls through the bound port:
`handleStatus` builds the context before it dispatches a slug, where today it dispatches a slug first
(`handleLifecycleStatus`), and passes it on; the in-repo arm takes nothing from it. `arc view`'s arms take the store
`createViewDependencies` opens (`openDefaultStore`), accepting an injected one for tests, and branch on its
`stateOffBranch`. Before the flip each branch selects the in-repo arm, so output is unchanged; the context builds its
store without reading state or making a network call.

### 8. Fixes to duplication that survives the flip

Each fixes duplication that survives the flip and would drift if left; duplication that lives only in an in-repo arm
leaves with it at the cutover and stays (§ 8.4). The identity fix (§ 8.1) is observable before the flip; the purpose
parse (§ 8.2) changes only code the arms from the flip run, and the kind-list test (§ 8.3) changes no behavior.

#### 8.1 One identity

Three readers take `arc.identity` alone (`readConfiguredIdentity`): `arc status` in every mode
(`readIdentityPointers`, `handlers/identity-pointers.ts`), the in-repo ROADMAP renders' Errand context
(`resolveProjectErrandOracleContext`, `lib/status/project-oracle-context.ts`), and the review gate's local host
(`readLocalReviewLiveContext`, `scripts/review-gate/hosts/local/live-context.ts`). The store's ports, `arc view`, and
the Errand verbs fall back to the slugified Git `user.name` (`resolveIdentity`, `lib/git/identity.ts`). All three switch
to `resolveIdentity` without its prompt, which never prompts. With `arc.identity` unset:

- **every `arc status` mode** — session-init's probe among them — **`arc base`, and `arc recover`** resolve the
  fallback identity, and session-init's identity-absent arm fires only when `user.name` is unset too;
- **the in-repo ROADMAP renders that read the Errand context** classify Errands under the same identity
  `arc status --project` reads, which they would not if their context, serving only them, stayed configured-only. They
  run through `renderRoadmapFromIndexViewResult` and `renderRoadmapFromIndexResult`
  (`lib/status/roadmap-regeneration-assert.ts`) — the staged write, lifecycle's edge render
  (`lib/work-unit/executor-context-status.ts`), `arc rename`, the pre-commit assert, and the conflict remedy, the last
  reached by `arc base merge --regenerate-roadmap` too — and through `renderTrackedProjectReadinessViewResult`
  (`lib/status/project-roadmap-render.ts`), `arc start`'s refresh. Decomposition's render
  (`renderGitV3RepositoryTreeRoadmap`, `lib/work-unit/git-decompose-v3-repository-plan.ts`) reads no Errand records, so
  it stays as it is;
- **every consumer of the review gate's local identity follows,** resolving the fallback identity where today a null
  identity refuses or reads nothing: pre-publication Owner authorization (`readOwnerTerminusAuthority`,
  `policy/pre-publication-composition.ts`), local review authority (`resolveLocalReviewVehicle`,
  `hosts/local/review-authority.ts`), which `runtime/local-prepare-composition.ts` reaches for a fix response's
  applicability and Errand lineage authority, and in `runtime/respond-composition.ts` the frontline approver
  (`resolveFrontlineActors`), the admitted-author fallback (`resolveLocalActors`), and the active Errand
  (`resolveActiveErrand`). The context's Errand vehicle comes from that identity's claims
  (`readTransientInFlightIndexes`, `lib/errand/record.ts`, which reads nothing for a null identity), so an incomplete
  claims read for the fallback identity throws where today it is an absence;
- **the text that names `arc.identity` as required names the unresolved identity instead:** `runStatusUserView`'s
  message (`lib/status/user-view.ts`), `handleRecoverAudit`'s (`handlers/recover.ts`), `SessionIdentityMissingError`'s
  (`commands/status/result-composition.ts`), and `strategy-session-operations.md`'s identity-missing short-circuit,
  which that error carries out, edited in the package source and synced, each still naming `git config arc.identity`
  as the way to set one; and the status render's identity line (`renderIdentity`, `commands/status/format.ts`), labelled
  `arc.identity:` today, is labelled `identity:`, set or not, since it shows the resolved identity.

`arc.identity` and `user.name` are both self-declared local Git configuration, so requiring the first was a setup step,
not authentication; the fallback adds no trust the store's ports do not already extend.

#### 8.2 One purpose parse

The design kinds' parser already returns each design record's purpose (`DESIGN_REGISTRATIONS`,
`lib/store/kinds/design/registration.ts`, through `readDesignPurpose`, `lib/store/kinds/design/purpose-reader.ts`), and
the in-repo listing attaches it as the record's parsed fields. Yet `readLifecycleDesign` re-parses each candidate's
content to choose one (`readDesignPurpose`), and the slug query's arm parses the chosen design again
(`extractWorkUnitPurpose`, `lib/status/work-unit-purpose.ts`). Both read the record's `fields.purpose` instead, and one
first-sentence extractor serves both, so the slug query and the project view report the same purpose.

`readLifecycleDesign`'s choice — for each name the meta's `Design` field lists, in order, the spec, draft, or companion
whose projected path ends in that name, the first such record with a purpose, or else the first found — becomes a pure
exported function over a meta and its candidate records, which `readLifecycleDesign` calls after its own listing and the
project view's acquisition calls over its per-kind listings (§ 2.1). Its meta is the meta's `reference`, `fields`, and
`placement`, which a `StoreRecord` and a `LifecycleEntry` both carry, and `lifecycleRecordPath`
(`lib/store/lifecycle-record-path.ts`) and `workUnitMetaPath` (`lib/store/lifecycle-write.ts`), which read only those
three, narrow their meta parameter to the same shape, a change of types alone. The extractor is
`extractWorkUnitPurpose`'s first-sentence step, made a function over the purpose field, which `extractWorkUnitPurpose`
keeps calling, so its in-repo callers (`selectWorkUnitDesign`, `readWorkUnitPurpose`) return what they return today. The
callers that change, `readLifecycleDesign` and the slug query's purpose read, run only in an arm from the flip
(`handleStoreLifecycleStatus`), so nothing observable changes before it.

#### 8.3 One work-unit kind list

`WorkUnitArtifactKindSchema` (`lib/layout/schema.ts`: `meta`, `draft`, `spec`, `tasks`, `notes`) cannot import the
store's registry, since the `layout-dependencies` predicate (`eslint/architecture-imports.ts`) limits `lib/layout` to
`zod`, `node:path`, the kernel, and its own modules. A conformance test holds each of its names, through one typed
table, to a registered `work-item/*` kind — `tasks` to `work-item/task-list` among them — failing on a rename or a
removal on either side. The two hand-kept lists, this and `VIEW_KINDS` (§ 6.2), each fail a check when a kind they map
is renamed or removed. A kind the registry adds trips neither check: it reaches either list only by a hand edit.

#### 8.4 Left as they are

Each sits in an in-repo arm and leaves with it: `arc view`'s design selection (`selectWorkUnitDesign`), which serves
only its in-repo arm while `readLifecycleDesign`'s selection serves the arms from the flip, so the two never run
together; the parked derivation (`isParkedPointer`, `listParkedSlugs`, `deriveState`'s parked state); the hand-built
project inbox path in `lib/view-artifact.ts`; and the `ROADMAP_PATH` literals.

### 9. ROADMAP's machinery across the flip

#### 9.1 What stops on the capability

Beside the rerouted verbs' own arms from the flip, only status's own write: `arc status --project --staged --write`
refuses from the flip (§ 2.5). Lifecycle's renders already stop there (§ Introduction / Context), and decomposition's
arm from the flip renders and checks no ROADMAP (§ 12).

#### 9.2 What stays inert from the flip

The rerouted verbs' ROADMAP renders stay in their in-repo arms: lifecycle's edge renders, `arc start`'s refresh,
`arc rename`'s re-render, and decomposition's render and its refusal where no ROADMAP exists, which the decomposition
change's arm from the flip leaves (§ 12). Every other ROADMAP path stays in place, unchanged, until the cutover's
deletion pass. Each acts only on a staged or conflicted `ROADMAP.md`, a staged meta, or a path naming a file that no
longer exists, none of which a checkout after the flip stages or holds:

- the pre-commit assert and its regeneration trigger (`scripts/assert-roadmap-regenerated.ts`,
  `roadmap-regeneration-assert.ts`, the hook's `CHECK[roadmap-regeneration-trigger]`);
- the conflict remedy and its hidden command (`arc hook-remedy-roadmap-conflict`,
  `lib/status/roadmap-conflict-auto-remedy.ts`, `scripts/remedy-roadmap-conflict.ts`);
- the merge driver, its `.gitattributes` attribute, and its wiring by `arc init`, `arc join`, and `arc update`
  (`configureRoadmapConflictRemedy`, `lib/setup.ts`), whose re-wiring on each `arc update` is harmless;
- `arc base merge --regenerate-roadmap`, with the integration checkpoint's argv for it
  (`scripts/integration/checkpoint.ts`);
- the `derived-readiness` classification (`lib/markdown/authority.ts`) and its remedy text (`lib/markdown/contracts.ts`);
- the in-repo arms' reads of the layout's `project-document` address;
- `isPlanningArtifactPath`'s `ROADMAP.md` literal (`lib/change-facts.ts`), `.arc/system/arc-checks.yml`'s `ROADMAP.md`
  input exclusion, the hooks README's remedy text, the merge-gate `CODEOWNERS` template's `ROADMAP.md` line, each in
  both copies, and this repository's `.github/CODEOWNERS` entry.

None can go before the deletion pass: the tracked pre-commit hook runs the hidden remedy command on every commit under
`pm.mode: arc-in-git` (`.arc/system/.internal/githooks/pre-commit`), and a branch cut before the flip keeps its tracked
hook, so a CLI without the command would fail every commit there.

#### 9.3 Markdown checks and the table formatter

From the flip no Markdown check a gate runs reads projected state, which is gitignored and never staged: this
repository's `lint:md` lists its worktree view with `--exclude-standard` (`enumerateTrackedMarkdownPaths`,
`lib/markdown/selection.ts`), and the shipped pre-commit hook's link check reads staged files (`validate-links.sh`). The
hook's checks of a state file's shape leave with that file's commit path. Checks over projected state — which files a
check may read, and the check over them — are separate planned work, which checks them where they are written and as
feedback, never at a gate; from the flip no gate checks them.

The table formatter (`format:tables`, `lib/markdown/format-plan.ts` and `format-write.ts`), which normalizes metas
outside lifecycle's executor, needs nothing here: from the flip a meta it rewrites is a hand edit to a projected file,
which the projection's write-back persists through the kind's write check.

#### 9.4 What the cutover takes

This change neither builds nor depends on these; it leaves them for the cutover:

- **Its flip change** takes the ROADMAP template out of the installer — the template with its `init-recipe.json`,
  `SCAFFOLDED_FILES` (`lib/classification.ts`), and `manifest.json` entries — and the integrity check's presence test
  for `ROADMAP.md` (`verify-integrity.sh`, in both copies). Each acts once no ROADMAP file exists: the installer would
  write the template into a projected root, `arc health` would report the manifest entry missing, and the presence
  test would fail.
- **Its deletion pass** takes status's and `arc view`'s in-repo arms (§ 1.5), every path § 9.2 lists, and
  `DERIVED_VIEWS`, which nothing reads once no view renders as a file. The layout's `project-document` address
  (`ProjectDocumentKindSchema`, `lib/layout/schema.ts`) stays past it, since the projection resolves a leftover
  `ROADMAP.md` through it for its rule that never adopts a file left from before the flip (§ 12).

### 10. Refusals name their remedy

Every refusal and warning this design adds carries what repairs it (`DEV-RULES.PROJECT`, "Recovery-complete refusals"),
in its text or as a typed action where running it as given repairs the condition: the command, with its arguments, where
one performs the repair, and otherwise the repair itself, a hand edit such as an unmapped dependent's `Depends On`
(§ 2.2) or the repair a store's remedy or a listing's diagnostic names, passed through as given. For a slug clash, which
the `slug-clash` warning reports and a lookup refusing `ambiguous-match` for the clashed slug passes through (§ 2.2,
§ 6.1), the repair is a rename of one holder, which no command reaches yet: the ref backend's store takes that rename,
naming the holder by its UID (`spec-storage-ref-backend.md` § 5.1), as the contract's D14 has a rename resolve a clash,
but `arc rename` resolves its subject by slug (§ 2.1).

| Refusal or warning                                                                                     | Repair it names                                                                     | Form |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ---- |
| `--project` or `--user` over a refused read or an `unreadable` listing (§ 2.1, § 3)                    | the refusal's or listing's own remedy, then the command again                       | text |
| A complete listing's diagnostic (§ 2.1, § 3)                                                           | the diagnostic's own remedy                                                         | text |
| Several live work units holding one slug (§ 2.1, § 3)                                                  | a rename of one holder, which no command reaches yet (§ 2.1)                        | text |
| The user view's in-flight set marked degraded (§ 3)                                                    | `arc status --user`, beside the set's own warnings                                  | text |
| `--project --staged`, with or without `--write`, from the flip (§ 2.5)                                 | `arc status --project`                                                              | text |
| `--conflicts` before the flip (§ 5)                                                                    | `git status`, where a tracked file's conflict shows                                 | text |
| `--conflicts <conflict>` with an unknown token (§ 5)                                                   | `arc status --conflicts`                                                            | text |
| `--conflicts` with no identity resolved (§ 5)                                                          | `git config arc.identity <name>`                                                    | text |
| A record with open conflicts (§ 6.3)                                                                   | `arc status --conflicts <conflict>`, for each                                       | text |
| A conflict record whose content does not decode (§ 5)                                                  | `arc store conflict`, which inspects and discards it                                | text |
| An edge naming a retired origin, its dependent unmapped (§ 2.2)                                        | edit the dependent's `Depends On`                                                   | text |
| An edge naming a retired origin, its dependent mapped (§ 2.2)                                          | `arc wu reconcile --apply` from the dependent's checkout, or its activation         | text |
| A design or lineage listing failing; a lookup, read, or marking refusing (§ 2.1–§ 2.3, § 6.1)          | the refusal's own remedy                                                            | text |
| A `--fetch` pull reporting `unreachable`, `incomplete`, or `designation-needed`; `no-identity` (§ 2.4) | its remedy, or the designation command; `git config arc.identity <name>`            | text |
| A `--fetch` pull's notice (§ 2.4)                                                                      | the notice's own remedy (§ 2.4)                                                     | text |
| `arc view --for` over a slug several holders tie on (§ 6.1)                                            | the lookup's own remedy, and a completed holder's projected file under `completed/` | text |
| `arc view` with no default target from the flip (§ 6.1)                                                | `arc view <kind> --for <slug>`                                                      | text |
| `arc view --path` or `--editor` on content with no projected file (§ 6.3)                              | `arc view <kind> --for <slug>`                                                      | text |
| The identity messages (§ 8.1)                                                                          | `git config arc.identity <name>`, or a Git `user.name`                              | text |

### 11. Forward amendments to shipped specifications

The storage contract and the transition write path have shipped. Where this design changes what their specifications
define, the change is stated here and built by this change; neither specification is edited.

#### 11.1 The storage contract (`spec-storage-contract.md`)

- **D15's capability branch and its ROADMAP order.** D15 lists "every code path that writes, renders, or checks the
  stored ROADMAP" among the verbs that branch on the capability, and orders ROADMAP's removal as every such path
  stopping on it, then the flip's workflow rewrite, then the deletion pass. From this change, beside the rerouted verbs'
  own arms from the flip, lifecycle's, `arc rename`'s, and decomposition's, only status's own write branches (§ 9.1);
  the installer's template entries and the integrity check's presence test leave in the cutover's flip change, and every
  other path stays in place and inert from the flip until the deletion pass (§ 9.2, § 9.4).
- **The derived views.** The contract's derived views — ROADMAP, `STATUS.USER`, and the archive listing — render from
  listings and are never stored. ROADMAP is the on-demand `arc status --project` alone, `STATUS.USER` renders on demand
  with no cache, and the archive listing is the projected `completed/` folder, each archived work unit's placement
  carrying its `{ quarter, sequence }`; no archive listing renders (§ Non-Goals).
- **The identity the in-repo composition reads.** Where the contract states that `arc status` and ROADMAP rendering read
  only `arc.identity`, both resolve the fallback identity after § 8.1.

#### 11.2 The transition write path (`spec-seam-lifecycle.md`)

- **§ 4, closed Errands.** A closed Errand is not read through `arc view <slug>`, and no listing of closed Errands is
  built, so nothing orders by its close time. The close still stamps it.
- **§ 19, its expectations of status.** Of the Paused tier, ROADMAP derived, `STATUS.USER` rendered as a view, and the
  archive and closed-Errand listings, this change builds the first three (§ 2.3, § 2, § 3); the archive listing is the
  projected `completed/` folder, and the closed-Errand listing is not built.

### 12. Expected contracts

This design consumes behavior other changes build. Each is an expected contract, available when its change lands; what
holds until then is stated with it.

- **Locus and the in-flight set** (the change deriving locus and in-flight state from the checkout marker and the
  store, on which this change depends and after which it lands):
    - **the in-flight set's arm from the flip:** work units at placement `active`, listed through lifecycle's view, and
      open Errands, each work unit's facts read there; an entry's branch optional, absent for a work unit with no branch
      link; a paused work unit kept in flight with `scheduling: "paused"`; an identity rule that in team mode keeps the
      identity's own and unowned entries, Errands among them (§ 3); and the set marked degraded where a read it makes is
      incomplete;
    - **the marking function and its setting:** one exported function (`markPausedWorkItem`,
      `lib/session-init/paused-work.ts`) over the store, one paused work item, and `pause.review_after_days` (default 14),
      returning its marks and, for a review-due item, its review prompt and choices, as § 2.3 states, with the setting
      registered beside `inbox.remind_after_days`;
    - **the work-item path function:** one function under `lib/store/` returning a work item's artifact path through
      the layout resolver from its slug, artifact kind, placement, and cohort (`workItemArtifactPath`,
      `lib/store/lifecycle-storage.ts`), giving today's flat paths;
    - **the cohort document's path function:** `cohortDocumentPath` (`lib/store/lifecycle-record-path.ts`), giving a
      cohort document's path from its record (§ 6.3);
    - **the session context's store and port:** `SessionStatusContext`'s `store` and `storeSync`, built by
      `createSessionStatusContext` with an `operational` input for an injected store and port (§ 7);
    - **`arc view`'s store and default target:** `createViewDependencies`'s store (`openDefaultStore`) and its arm from
      the flip of `resolveAmbientTarget`, which gives a work-unit claim's work unit and nothing for any other claim or
      none (§ 6.1);
    - **the session-notes resolver's arm from the flip,** which gives the meta's projected path for an identity and a
      work unit (§ 6.4);
    - **the slug query's locus reads,** in lifecycle's arm (§ 4);
    - **the slug query's pull:** `pullStoreStatus` (`handlers/status/store-locus.ts`), which pulls through the port it
      is given and warns only for `unreachable`, and which this change rebuilds for every status mode under `--fetch`
      (§ 2.4);
    - **the store's synchronization port** (`StoreSyncPort`, `lib/store/operational-sync.ts`), whose `pull` reports
      `pulled`, `noop`, `no-remote`, `no-identity`, `unreachable` with a condition and remedy, or `designation-needed`
      with its remote, choices, and command (§ 2.4), and through which session start's `user` probe pulls from the flip
      under `session.remote_sync`. Its default pulls nothing and reports `no-remote`;
    - **the pull's orientation:** `describeStorePull` (`lib/session-init/store-user-pull.ts`), giving each pull result a
      summary and, for `unreachable` and `designation-needed`, its remedy as a typed action (§ 2.4);
    - **a listed meta record's former slugs:** `aliases` on a primary `StoreRecord` (`lib/store/read.ts`), which § 2.1's
      fold reads;
    - **a withheld meta:** lifecycle's view lists a meta with open conflicts, as a malformed one, only as a
      `malformed` diagnostic keyed `work-item/meta:<name>`, never as an entry (`lifecycleEntry`,
      `lib/store/lifecycle-index.ts`), which § 2.1's fold reads;
    - **the in-flight set's degraded mark** set without a warning of its own where its read of the checkout's local refs
      fails (`deriveStoreInFlight`, `lib/git/in-flight-store.ts`), which § 3's degraded warning covers.

  Until the locus change lands none of these exist, so this change lands after it.
- **The ref backend:** the store's pull and conflict records stored off the branch (§ 5). The session context's
  synchronization port is bound to the store's pull by the ref backend's change (`spec-storage-ref-backend.md` A14), so
  session start and `--fetch` pull through one binding: it maps the pull's result onto the port's results, adding
  `incomplete`, with its condition and remedy, for a pull that did not fully synchronize the requested state, and
  keeping a successful outcome's notices and an `incomplete` result's partial outcomes with theirs, all of which § 2.4
  renders. Each notice carries its condition and remedy, an ended item's remedy naming `arc store conflict`
  (`spec-storage-ref-backend.md` § 2.2, § 6.6, A16), which that change builds before the binding. This change takes the
  context's port and binds none itself. The binding and this change both land after the locus change, in either order:
  the port's added result and its notices are the binding's (`lib/store/operational-sync.ts`,
  `lib/session-init/store-user-pull.ts`), status's rendering under `--fetch` of every result the port gives is this
  change's, in `pullStoreStatus` alone (§ 2.4), and whichever lands second completes the other's part and verifies the
  `incomplete` and notice cases: where this change lands first, the binding completes `pullStoreStatus` for `incomplete`
  and for each notice, which no type forces it to render, as § 2.4 states, editing no status file beyond those § 1.3
  names. Until the binding lands the port pulls nothing, so a `--fetch` render is local with no warning (§ 2.4), and
  only the reference backend stores conflict records. Its writes and pulls are where a slug clash arises (§ 2.1); its
  store takes the rename that ends one, naming one holder by its UID, but no command reaches that rename yet, so § 2.1's
  warning names none (§ 10).
- **The projection:** the conflict token `<family>/<owner type>/<owner name>/<id>`, which its notice lines print and
  `arc save --resolve` parses (§ 5); a conflicted file's shape (§ 6.3): marker sets where it can place them, a notice
  line beside the base stamp where it cannot and for a whole-record conflict, and nothing in a file with no stamp, with
  `arc save --resolve <conflict>` resolving a conflict shown without markers; the per-checkout `active/` layout and the
  personal in-flight view setting that decide which work items have a file here (§ 6.3), with the work-item path
  function's checkout input, its wiring through lifecycle's callers, and the paths it then returns under
  `active/current/` and `active/in-flight/<slug>/`; and its rule never adopting a leftover `STATUS.USER.md`, or a
  tracked `ROADMAP.md` on a branch that has not merged the cutover, which it names itself, `ROADMAP.md` through the
  layout's `project-document` address (§ 9.4). Until it lands no file is projected, so an arm from the flip over the
  reference backend renders content (§ 6.3).
- **Decomposition:** a cut's arm from the flip, one store batch, which claims, renders, and checks no ROADMAP, today's
  ROADMAP render and its refusal staying in its in-repo arm (§ 9.2). Until it lands `arc decompose` keeps its ROADMAP
  render; the flip waits on it, as on every change routing a verb through the store.
- **Delivery and review:** the slug query's operational-boundary read in lifecycle's arm (§ 4), and its edit of the
  review gate's local host for the flip, beside § 8.1's switch (§ 1.3).
- **The slug query's derived position** (the change that adds it to the slug query's in-repo arm, after which this
  change lands): `derivedPosition` and `scopeWindow` in `arc status <slug> --json` and their lines in its text, read
  through `readDerivedSlugPosition` from an injected roster read, null where the work unit has no checkout here, no
  identity resolves, or no single checkout row holds it, and where the roster read fails, which adds the warning that
  its derived position is unavailable, and `projectScopeWindow`, which falls back to the lifecycle state where there is
  no position or its session type is unknown (`lib/status/slug-position.ts`), the in-repo arm binding the roster read to
  the derived locus probe (`runDerivedLocusStateProbe`) with no store; lifecycle's arm from the flip carries both, and
  this change gives `projectScopeWindow` the record's pause (§ 4).
- **The cutover:** the flip, the flip change, and the deletion pass (§ 9.4), and the rewrite for the arms from the flip
  of the status flags' help text (`cli.ts`) and the `status` help notes (`lib/cli-help-content.ts`) (§ 2.4).

## Alternatives & Rationale

- **Reroute every module onto the in-repo implementation,** the usual path for a consumer of the contract. Rejected: the
  composition cannot feed from the in-repo `list` without calling itself, and nothing reads what the reroute would
  preserve.
- **Render the derived views into projected files** (`DERIVED_VIEWS`). Rejected: no one reads the files, and they would
  need a renderer, a layout address for each view, and a refresh trigger, which an on-demand render does without.
- **Stop ROADMAP now,** before the flip. Rejected: lifecycle's in-repo edges, `arc start`, the pre-commit assert, the
  merge driver, and the workflows' regenerate steps all assume the file, and no workflow text changes before the flip.
- **Stop every ROADMAP path on the capability before the deletion pass,** as D15 orders. Rejected: the bash hook, the
  scripts, the merge driver, and setup have no store in scope, so each stop needs a store or a probe built only to be
  deleted, while every path left for the deletion pass is inert from the flip anyway (§ 9.2).
- **Delete the hook-reached ROADMAP paths in the flip change.** Rejected: a branch from before the flip keeps its
  tracked pre-commit hook, which runs `arc hook-remedy-roadmap-conflict` on every commit, so a CLI without the command
  fails each commit there, while the inert paths cost nothing until the deletion pass.
- **Render an unreadable listing as an empty view with a warning.** Rejected: an empty view reads as no work, and
  session-init's discovery reads the view; refusing with the listing's remedy keeps the failure visible (§ 2.1).
- **Add `paused` to the lifecycle states the fact rows carry.** Rejected: `LifecycleState`
  (`lib/work-unit/lifecycle-resolver.ts`) is a derived `(phase, location)` reading many callers share, and a pause
  changes neither; the horizon advisory's paused arm gives the routing method what it reads (§ 2.3).
- **Leave the Paused tier's marks to session start.** Rejected: the transition write path makes the review flag
  visible to everyone (`spec-seam-lifecycle.md` § 8.3), and the marking function supplies the marks without a second
  derivation.
- **Match an edge's former slug from the listing's aliases** rather than by lookup. Rejected: lifecycle's view carries
  the aliases into its entries only to decide which entry stands for a slug (§ 2.1), while resolving an unlisted edge by
  lookup keeps one path for former slugs and retired origins alike, and one lookup per unlisted edge is cheap.
- **Fold a reused slug in lifecycle's view,** so that its verbs read the holder the lookup names too. Rejected:
  lifecycle's verbs from the flip pick their subject from the view's entries by name, which a folded index does not
  reach, and a folded index would lack a clashed slug, so its store reconcile, which looks up each word its index lacks
  (`artifactAliasTransitions`), would refuse `ambiguous-match` there and block activation, whose reconcile throws on
  that refusal (`buildStoreCurrentWuReconcile`, `lib/work-unit/store-current-wu-reconcile.ts`); no change owns yet how
  lifecycle's verbs treat a reused slug (§ 2.1).
- **Pull before every `--project` and `--user` render.** Rejected: the store's pull can run far longer than today's
  remote read, which gives up after 5 s (`DEFAULT_NETWORK_TIMEOUT_MS`, `lib/git/remote-ref-reader.ts`), it would pull
  with `session.remote_sync` off, and a pull's merges reach every worktree on the machine, while discovery and routing
  render right after session start has pulled (§ 2.4).
- **Pull by default only under `session.remote_sync`, with a deadline of status's own.** Rejected: the synchronization
  port takes no deadline, so it needs new mechanism in another change's port, and session start's pull already serves
  the renders that follow it.
- **Leave the slug query's pull mapping as it is.** Rejected: one flag on one command would render the same result
  differently by mode, and the slug query would stay silent on `designation-needed` (§ 2.4).
- **Keep one of a slug clash's live holders standing.** Rejected: no rule picks between them, since the store's lookup
  refuses `ambiguous-match`, and either pick classifies dependents against one holder arbitrarily; omitting both with a
  warning that lists them keeps the clash visible (§ 2.1).
- **Let `--for` name an earlier work unit of a reused slug,** by UID or archive position. Rejected: the projected
  `completed/` folder already holds the earlier work unit's files (§ 6.1).
- **Take a conflict's bare ID.** Rejected: conflict records are keyed by ID per owner across ten families, and no lookup
  takes an ID alone; the token names the family and the owner.
- **Refuse `arc view` of a work unit not projected here,** naming a pin. Rejected: `--for` reaches such a work unit
  today at its ref, and the content arm already renders one.
- **Keep a machine-local `STATUS.USER` cache.** Rejected: from the flip lifecycle's view is local, so an on-demand render
  needs no fallback.
- **Read only a configured identity everywhere.** Rejected: the store, `arc view`, and the Errand verbs already ship the
  fallback identity, and requiring `arc.identity` there would change them.
- **Derive `VIEW_KINDS` and the layout's kind list from the registry.** Rejected: `lib/layout` cannot import the
  registry, and `VIEW_KINDS` carries selectors that are no kind (`design`) and one name that reads two (`inbox`); a typed
  table and a conformance test catch drift at the same cost.

## Cross-cutting Considerations

- **Testing.** Each arm from the flip is verified over the reference backend, which reports the capability true, with
  the synchronization port bound to a double for § 2.4's results under `--fetch`, `incomplete` and notices among them
  once the ref backend's binding gives the port those results (§ 12), the slug query's derived position with its roster
  read bound to a double and a test that its production roster read hands the derived locus probe the arm's store and
  the identity it resolves, and the slug clash, which the reference backend refuses at a write and a sync
  (`indexIdentities`, `__tests__/helpers/store/identities.ts`), over a store double whose listing holds both live
  holders; the flip arms first run for real after the flip, through the cutover's rehearsal. The in-repo renders are
  held byte-identical over today's fixtures (§ 1.4). Each fix carries its own tests (§ 8), the identity fix with
  `arc.identity` set and unset and `user.name` set and unset. Tests of rerouted code keep their local doubles.
- **The import ratchet.** The arms from the flip read through the store, so no `store-raw-state`, `surface-names`, or
  `work-unit-paths` floor in `eslint-suppressions.json` grows; floors in the in-repo arms stay until the deletion pass.
- **Performance.** From the flip a default render makes no network call; `--fetch` adds a pull before listing. The
  acquisition then makes the lifecycle listing, three design listings for every work unit's purpose, one marking per
  paused row, and one slug lookup per unlisted edge, all local; an edge whose slug lookup misses adds the lineage listing,
  once per render, and one history read per lineage record it lists, as the dependent's reconcile reads them.
- **Trust.** The identity fix extends no trust (§ 8.1). A `--fetch` pull merges remote state into the local store as
  any pull does; the view renders what the store holds, withholding a conflicted meta as lifecycle's view does, its
  warnings naming what it could not read, what it omits, and what is in conflict.
- **User-facing impact.** Before the flip: the identity line's label, and status working without `arc.identity` where
  `user.name` is set. From the flip: no ROADMAP or `STATUS.USER` file; a Paused tier in place of Parked; a default
  render from the local store, with `--fetch` to pull first; `arc status --conflicts`; `arc view` of completed and
  unprojected work units; and the user view's ready rows following the project view's rule (§ 3).
- **Rollout.** Dark until the flip; nothing migrates. Files left from before the flip are inert: a `STATUS.USER.md` no
  one reads, and on a branch that has not merged the cutover a tracked `ROADMAP.md` the projection never adopts.

## Success Criteria

1. **Today's behavior holds before the flip.** Every status, ROADMAP, and `arc view` test passes over the in-repo
   implementation unchanged but for the identity fix's, the label's, and those pinning the status modes' exclusion
   message and help groups, which name `--conflicts` from its registration (§ 5), and the project view, the staged and ROADMAP
   renders, and the user view render byte-identically to the merged base over today's fixtures.
2. **One identity.** With `arc.identity` unset and `user.name` set, every `arc status` mode, `arc base`, `arc recover`,
   the in-repo ROADMAP renders that read the Errand context, and the review gate's local host resolve the slugified
   `user.name`; with both unset, session-init's identity-absent arm fires, and each message names the unresolved
   identity and how to set one. The identity line reads `identity:`.
3. **One purpose parse.** Over the reference backend, `readLifecycleDesign`, the slug query's arm, and the project view
   read the design record's parsed purpose through one selection, and the slug query and the project view report the
   same purpose for a work unit, a companion-designed one among them; a reused slug's purpose comes from its own work
   unit's design, and `arc status <slug>` of a reused slug reports its live holder's state, from the standing entries.
4. **One kind list.** The conformance test fails when a `WorkUnitArtifactKindSchema` name or its `work-item/*` kind is
   renamed or removed, and the `VIEW_KINDS` table fails the type check when a kind it maps is.
5. **The project view from the flip,** over the reference backend: renders from the store and writes no file; shows In
   Flight from placement, Ready, Blocked in depth bands, and Paused, a paused work unit in no other tier; folds the
   entries sharing a slug to the live holder, or with none the latest archived, a dependent of a reused slug classifying
   against the live work unit; over a store double (§ Cross-cutting Considerations), omits several live holders of one
   slug with a `slug-clash` warning naming each, an edge naming that slug staying unsatisfied; renders a complete
   listing's diagnostics as `listing-diagnostic` warnings carrying each diagnostic's remedy, naming each record it
   missed as omitted, and never the in-flight indeterminate warning; refuses over a refused read or an `unreadable`
   listing, naming its remedy; renders an `absent` listing empty; lists each design kind once per render, an `absent`
   design listing adding no warning and a refused or `unreadable` one rendering every purpose empty with a warning;
   renders a meta with open conflicts as its listing diagnostic, omitted, no entry standing for its name and an edge
   naming it staying unsatisfied, a completed holder of that name among the entries left out; and carries no render
   stamp.
6. **Edges naming no listed work unit:** an edge naming a renamed work unit's former slug classifies against that work
   unit, a former slug a completed work unit holds as its own name among them; one naming a decomposed origin warns
   naming the cut and the dependent's disposition, or that the cut left it unmapped and the remedy; one naming an
   abandoned origin warns naming the abandonment; one naming a retired origin's former slug warns as one naming that
   origin; each retired-origin edge stays unsatisfied, with the disposition the dependent's reconcile reads; a dependent
   of an unshipped renamed work unit shows in Blocked with the former slug as written in its row and fact row, banded
   below that work unit; a lookup refusing other than `not-found`, or a lineage listing that is not complete, warns with
   its condition; and an edge naming nothing, or an Errand, warns as today.
7. **The Paused tier** shows Planning and Active paused work alike, and nowhere else, with its reason, what it waits on,
   whether it is open, and the marking function's mark for anyone's paused work; a failed marking leaves its row
   unmarked with a warning; and a paused work unit's fact row carries the paused horizon advisory and its derived
   lifecycle state.
8. **`--json`** keeps today's result and fact-row shape; each warning `--project`'s arm from the flip adds carries one
   of the codes § 2.1 names, and `--user`'s warnings stay strings; and `arc status <slug> --json` from the flip carries
   `derivedPosition` and `scopeWindow` as the in-repo arm does, over a roster double, its production roster read handing
   the derived locus probe the arm's store and identity so that no second store is built, and a paused work unit's
   window null on the `lifecycle` basis with the reason that a routed concern waits for its resumption.
9. **Freshness:** `--project`, `--user`, and `--conflicts` render from the local store by default and with `--local` or
   `--no-fetch`, calling no pull, `--local` winning over `--fetch` in any order and the later of `--fetch` and
   `--no-fetch` winning; `--fetch` pulls first through the session context's port, each result in § 2.4 rendering as
   that table states and each notice a pull reports as a `pull-notice` warning carrying its condition and remedy, the
   warning for an item ended with open conflicts also naming the item and its conflicts and that the conflict view does
   not list them, the `incomplete` and notice cases verified by whichever of this change and the ref backend's binding
   lands second (§ 12); the slug query's `--fetch` through the session context's bound port and the same orientation as
   session start's `user` slot, whose `no-identity` summary names `git config arc.identity <name>`; and an unbound port
   renders locally with no warning.
10. **The user view from the flip** renders its in-flight slice from the in-flight set, a branchless entry and a paused
    one among its rows, with the set's warnings and, for a degraded set, a warning naming `arc status --user`, and its
    ready slice from the exported tier classification with Class, a clash's holders omitted with the `slug-clash`
    warning; prints each warning to stderr in text mode; writes no `STATUS.USER.md`; and with no identity prints the
    identity message and exits 0.
11. **The staged write** refuses from the flip, with and without `--write`, naming `arc status --project`.
12. **The conflict view** refuses before the flip naming `git status`; from the flip lists every open conflict of a
    listed item, of each shape, with both sides' labels and content; shows one by its token, each owner where several
    match, and a completed holder of the name as well as a live one; omits a record that does not decode with a warning
    naming its token and `arc store conflict`; refuses an unknown token naming the listing;
    refuses alongside another status mode, through the input schema and the mode count, with the help notes listing it
    among the modes; writes `{ conflicts, warnings }` with `--json`; and with no identity lists the other families with
    a warning naming how to set one.
13. **`arc view` from the flip** opens the claim's work unit and gives an Errand claim no default target, refusing with
    a message that names `arc view <kind> --for <slug>`; resolves `--for` through the store, a former slug included, a
    reused slug to its live holder, and an ambiguous slug to a refusal carrying the lookup's remedy; opens a completed
    work unit, its meta by default; renders the content of a target with no file here and refuses `--path` and
    `--editor` there, naming the remedy; opens `session-notes` as the meta with no identity; opens a companion design
    and a cohort document at their paths; opens a conflicted record's projected file as any projected target, and
    renders its current side where no file exists, each with its warning; and opens each other kind through § 6.2's
    table.
14. **The ratchet holds:** no `store-raw-state`, `surface-names`, or `work-unit-paths` count in
    `eslint-suppressions.json` exceeds its count at the final merged base.
15. **The quality gates pass** at every gate the project declares.

## Open Questions

None blocks starting. The expected contracts in § 12 each state what holds until their change lands, and none leaves
this design open.

## Amendments

None.

---
