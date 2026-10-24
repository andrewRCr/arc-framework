# Spec (`detailed` · `RFC`): lifecycle-slug-selection

- **Origin:** [internal]

- **Purpose:** Make every store-backed reader that starts from a name agree with the store's slug lookup when a slug
  has several holders — lifecycle's view and verbs, dependency edges, creation, branch links, and an ended holder's
  cleanup — and make a work-unit checkout claim name its holder by UID.

---

## Introduction / Context

ARC keeps operational and planning state behind one storage contract (`Store`, `lib/store/contract.ts`). Three
implementations matter here: the in-repo implementation over today's tracked files (`lib/store/in-repo/`), the reference
backend the tests run (`__tests__/helpers/store/reference-backend.ts`), and the ref backend, which keeps state in
same-repository `refs/arc/*` refs and is not yet on `main` (§ 11). A caller tells the store-backed path apart by
`capabilities.stateOffBranch`, read through `usesOffBranchState` (`lib/store/lifecycle-write.ts`). **The flip** is the
one cutover per repository after which the configured store reports it true. Code that behaves differently across it has
an **in-repo arm**, which runs until the flip, and a **store arm**, which runs from it; until the flip a store arm is
reachable only over the reference backend in tests. **The cutover** is the change that performs the flip and deletes the
in-repo arms. Everything this specification changes is a store arm or a backend's lookup, unless it says otherwise.

Every record is owned by an identity (`OwnerIdentity`, `lib/store/identity.ts`): an owner type, a display name, and, for
work items and cohorts, a generated UID. A **slug** is the display name a person types. A slug's **holders** are the
primary records named by it, under their current name or under a **former slug**, a name the record held before a
rename and keeps as an alias. A holder is **live** until it completes and **completed** once archived; a completed work
unit's placement carries its archive quarter and sequence (`WorkUnitReadPlacementSchema`, `lib/store/placement.ts`). A
**retired origin** is an abandoned or decomposed work unit: its primary leaves the store, and a lineage record keeps its
names and the disposition of the edges that named it (`lineage/transition`, read through the lookup's `lineage` arm).

### How a slug gets several holders

Two rules of the storage design give one slug several holders:

- **Reuse.** A completed work unit's slug may name a new work item. The store's write rules refuse a creation only
  where the lookup returns another record holding the slug as a former name (`checkFormerSlug`,
  `lib/store/kinds/work-item/former-slug.ts`), or where a non-completed record still carries an edge naming the slug for
  its prior holder (`checkSlugEdges`, `lib/store/kinds/work-item/slug-edges.ts`).
- **Clash.** Slug uniqueness holds by a check against live records at creation, so two machines can each create a live
  record on one slug before either pulls the other's. Both records exist, and renaming one holder repairs the clash
  (ADR-035, amendment of 2026-09-29).

Work items and cohorts share one namespace. Each holder keeps its own lifecycle entry, keyed by identity
(`listLifecycleIndex` and `identityKey`, `lib/store/lifecycle-index.ts`).

### The lookup ranks; lifecycle does not

The slug lookup ranks a slug's holders: live under its current name, then live under a former name, then completed
under its current name, then completed under a former name. A tie within the first non-empty tier refuses
`ambiguous-match`. The reference backend ranks work-item primaries this way (`preferredSlugRecords`,
`__tests__/helpers/store/lookup.ts`); the ref backend ranks work-item and cohort trees alike (§ 11). Every lifecycle
verb's store arm takes its subject through the lookup (`readWorkUnit`, `lib/store/lifecycle-write.ts`).

Lifecycle's view does not rank. `readLifecycleView` (`lib/store/lifecycle-view.ts`) builds its slug-keyed `index` with
`buildLifecycleIndexFromRecords` (`lib/work-unit/lifecycle-index.ts`), where the last entry listed for a slug wins,
while the verbs pick their own entry from the view's `entries` by name, where the first listed wins. Over a backend that
lists in insertion order the two disagree with the lookup and with each other, and every other reader that starts from a
name assumes one holder:

- **Subject entry by name.** The store executor (`agreesWithInventory` and `resumeStoreTransitionFinalization`,
  `lib/work-unit/lifecycle-store-executor.ts`), activation (`readLifecyclePrimary` and `readOtherPrimaries`,
  `lib/work-unit/verbs/activate-deactivate-store.ts`), abandon (`lib/work-unit/verbs/abandon-store.ts`,
  `handlers/abandon-store.ts`), start (`startedPlanningReason`, `handlers/start-store.ts`), graduation (`graduate`,
  `commands/start-store.ts`), and materialize (`runStoreMaterialize`, `lib/work-unit/verbs/materialize-store.ts`) find
  their entry by name. `arc activate` of a reused slug pairs the live primary from `readWorkUnit` with the first-listed
  completed holder's entry and rejects "is not a Planning work unit held in active placement" on that entry's fields.
  `readOtherPrimaries` filters other primaries by name, so a completed namesake drops out of activation's comparison.
- **Re-reads by name.** Group acquisition takes a slug and resolves it again (`acquireLifecycleRecords`,
  `lib/work-unit/prepared-lifecycle-write.ts`, through `readWorkUnit`), so a caller that already holds a record ranks
  its name again. Rename's own and backlog groups (`acquireRenameGroups`, `lib/store/lifecycle-rename.ts`) are among
  them, where one backlog clash blocks every rename, the rename that would repair it included.
- **Position by slug.** `executeStoreTransition` resolves the transition edge from `resolveSlugPosition(index, slug)`
  (`lib/work-unit/lifecycle-resolver.ts`), so a reused slug can take the completed holder's position.
- **Dependency edges.** The dependency reconcile classifies each `Depends On` edge with `resolveSlugState(index, edge)`
  (`planDependencyReconcile`, `lib/work-unit/side-effects/discharge-dep-edges.ts`). An edge naming a reused slug reads
  the last-listed holder: if the completed one lists last, the edge reads shipped and is discharged though the live
  holder has not shipped. An edge naming a slug a live cohort and a completed work unit both hold reads shipped from
  the work unit.
- **Creation.** `arc start --new` refuses any slug the index holds (`resolveStartDispatch`, `commands/start.ts`), after
  `resolveStartName` (`handlers/start-store.ts`) has refused a lookup refusal other than not-found and an Errand's slug,
  and rewritten a former slug to its holder's current name; `arc stub` reaches the executor's create edge, which
  requires a nonexistent position (`runStub`, `lib/work-unit/verbs/stub.ts`). Neither admits the reuse the store allows,
  and the nameless cold start asks the store no slug lookup before its create batch (`runStoreColdStart`). Decomposition
  admits a work-item name only when the lookup's top-ranked holder is completed under that name (`checkNamespaceName`,
  `lib/decompose/check-names.ts`), but lets a new cohort take a completed work unit's slug. Outside decomposition, no
  creating verb settles the edges naming a reused slug.
- **Completed ties.** Once a reused slug's second holder completes, both backends rank its two completed holders alike,
  so every lookup of the slug refuses `ambiguous-match`, and the write rules then refuse the slug to every later
  creation (`checkFormerSlug`; `priorTarget`, `slug-edges.ts`).
- **Clashes.** Today a clashed slug stays in the index, the last-listed holder winning, so a dependent's edge reads that
  holder and is discharged if it is Integrating (`planDependencyReconcile`). The store reconcile's word check
  (`artifactAliasTransitions`, `lib/work-unit/store-reconcile-context.ts`) skips a slug the index holds and returns the
  refusal of any other word's lookup, so a tie the index lacks, such as one among Errands, blocks the activation of
  every work unit whose records contain the word. Were the index to drop a clashed slug, the word check would block the
  same way, and a dependent's edge would reach the retired-edge query (`resolveRetiredEdge`), whose disposition query
  maps `ambiguous-match` to `namespace-corrupt` and rejects the dependent's activation with no remedy.
- **Cohorts.** The ref backend's ranking admits cohort trees; the reference backend's admits only work-item primaries.
  When the lookup returns a cohort document, `readWorkUnit` misreports it: "resolves to an Errand rather than a work
  unit". Start's name resolution, decomposition's home check, and the inbox's work-item list report it as an Errand the
  same way (`resolveStartName`, `resolveHome`, `resolveWorkItemList`).
- **Checkout claims.** A work-unit checkout claim (`{ kind: "work-unit", slug }`, `CheckoutClaimSchema`,
  `lib/store/lookup.ts`) matches every work-unit meta whose current name is the slug (`lookupReference`'s `claim` arm,
  `__tests__/helpers/store/lookup.ts`), and the ref backend's lookup includes archived owners (§ 11), so a reused slug's
  claim refuses `ambiguous-match` and every reader that resolves a checkout's work unit through it fails. Marker
  exclusivity and holder lookup match the marker's name (`createLocusPorts`, `lib/locus/lifecycle-ports.ts`), as do the
  derived roster's readers (`guardDuplicateMarkerClaims`, `lib/locus/derived-reader.ts`), so a lingering checkout of the
  archived holder makes creation and materialize refuse, turns the live holder's own checkout unresolved, and rename,
  pause, and decompose of the live holder take it for the live holder's checkout, or throw where the live holder holds
  one too (`findHoldingCheckout`).
- **Cleanup of an ended holder.** Teardown reads its subject by name (`readStoreRetirementEvidence`,
  `lib/work-unit/store-retirement-evidence.ts`, through `readWorkUnit`), so under reuse it reaches the live holder and
  refuses that the work unit "has not ended", and every offer to tear down the archived holder's checkout names that
  slug. Abandon and decomposition tear down by slug after removing the retiring primary (`runStoreTeardown`,
  `lib/work-unit/verbs/teardown-store.ts`), so under reuse teardown reads the completed namesake's evidence, applies its
  `landed` rule, and keeps the retired holder's unmerged branch and push. Both holders of a reused slug link the same
  branch name, and teardown reaps by branch name: it returns a clean checkout holding the branch to base, deletes the
  local branch under `discard` with no safety check (`reapRetiringBranch`), and deletes the remote under `discard` at
  whatever tip `git ls-remote` advertises (`reapRetiringRemote`). Tearing down the ended holder can so take the live
  holder's checkout off its branch, delete that branch, and delete its push.
- **Branch links.** A completed record keeps its branch links, and the lookup's `ref` arm matches every primary that
  links a branch, with no ranking, so a reused slug's branch refuses `ambiguous-match` for each session-start reader
  that looks a branch up, which then fails closed to unavailable.

### What there is to build on

- **A standing-holder selection.** Status already picks one standing entry per slug as the lookup ranks, reports each
  clash as a `slug-clash` warning naming each holder's UID, and withholds a name whose meta the listing rejects
  (`selectStandingLifecycleEntries`, `lib/status/store-project-standing.ts`); `arc status <slug>` builds its index from
  those entries (`handlers/status/lifecycle.ts`).
- **An identity-keyed index.** `IdentityLifecycleIndex` (`lib/store/lifecycle-index.ts`) already answers by owner.
- **Edge settling and its write rules.** Decomposition settles the edges naming each name its cut gives
  (`decomposeSlugSettlementWrites`, `lib/decompose/slug-settler.ts`): an edge on shipped work discharges, and one on a
  retired origin takes its lineage disposition. `checkSlugEdges` refuses a creation while a non-completed record's
  `Depends On` or pause `waits-on` edge still names the slug for its prior holder.
- **Marker settlement after a commit.** Errand promotion settles its checkout marker after its store commit, replacing
  exactly the generation it wrote (`settleOccupancy`, `lib/errand/promote-runtime.ts`).

## Goals

1. One standing-holder selection serves lifecycle's view, every slug-keyed reader of lifecycle entries, and status.
2. Each lifecycle verb acts on the record the lookup returns, and every re-read of a record already selected goes by its
   reference.
3. A clash, whether live holders tie on a slug as their current name or only as a former name, refuses with each
   holder as a typed reference and its repair. No tie the lookup refuses blocks an unrelated work unit's activation,
   reconcile, publish, rename, or abandon, a dependent's activation, or a cohort's archive.
4. A dependency edge resolves each name it meets once, through the lookup, and is decided by the resolved record's
   reference: discharged only for a work unit that is Integrating or completed, never moved onto a name that does not
   resolve back to its work unit, and held with a diagnostic, never discharged, where it resolves to a tie or to a
   cohort or an Errand that no lineage disposition settles.
5. Creation admits a slug no live record holds, within the store's write rules, and settles the edges naming it.
6. The lookup answers for a reused slug in every arm: cohorts rank alike in both backends, a completed tie that includes
   a work unit resolves to its latest archived work unit, branch links rank live holders first, and a tie's refusal
   names its tier.
7. A work-unit checkout claim and holder matching follow the owner's UID, and a marker that carries no UID, an
   interrupted creation's or one written before the flip, refuses with exits that bind or release it.
8. An ended holder's cleanup finds it by UID and never takes, deletes, or reaps the live holder's checkout, branch, or
   push.

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This change does not:

- **give a lifecycle verb other than `arc teardown` a UID subject** (§ 4.1, § 8.3);
- **add a UID operand to `arc rename`, rename a cohort, or change rename's subject resolution;** § 11 states the
  operand rule `arc teardown` shares with the rename change;
- **add UID-bearing dependency edges or typed relations:** an edge keeps naming a slug and classifies against the slug's
  standing holder (§ 5);
- **change the lookup beyond § 1:** the reference backend's cohort ranking, the completed tie that includes a work unit,
  the ranked `ref` arm, the UID-matched work-unit claim, and the tie's facts on its refusal;
- **change the store's write rules** `work-item.former-slug` and `work-item.slug-edges`, so a slug the lookup returns as
  another record's former name is never reused;
- **close the former-slug case the write rule leaves open:** a creation may take a slug that a lower-ranked completed
  holder keeps as a former name, where a completed holder under its current name outranks it (§ 6.1);
- **change the in-repo arm:** its lifecycle arms (`handlers/lifecycle.ts`'s `index.get(target)` paths), its slug claim,
  and its `ref` arm (`lookupRef`, `lib/store/in-repo/lookup.ts`) stay until the cutover deletes them;
- **add a UID to husk stamps,** which no claim reads, **or admit a work-unit husk to the store teardown:** work-unit
  husks are torn down before the flip, and the store teardown's `--husk` replay keeps refusing every pre-flip husk
  (§ 8.1);
- **change `arc errand open`'s admission** (`decodeBasis`, `lib/errand/store-runtime.ts`), which refuses any slug whose
  lookup returns a work unit, completed ones included;
- **let a new cohort take a completed cohort's name** (`checkNamespaceName`): completed members still name their cohort
  by path;
- **order a completed tie that includes a cohort or holds only Errands,** which keeps refusing `ambiguous-match`
  (§ 1.2);
- **pull store state inside teardown,** or gate teardown's remote deletion on another holder being visible in this
  machine's store (§ 8.6);
- **change abandon's cohort handling:** abandon reports a cohort it leaves empty and closes none, and cohort close and
  removal stay explicit cohort commands;
- **re-stamp or backfill markers written before the flip,** by a command or on a read: from the flip such a marker is
  unbound until a person binds or releases it (§ 7.4).

## Proposed Design

§ 1 changes the lookup. § 2 is the standing selection and the view built on it, § 3 the verbs' subjects and re-reads,
§ 4 clash behavior, § 5 dependency edges, and § 6 creation. § 7 moves checkout claims and holder matching to the owner's
UID, and § 8 moves an ended holder's cleanup onto it. § 9 lists the interfaces other verbs consume, § 10 records the
boundary and order, and § 11 states the expected contracts.

### 1. The lookup

Each rule below applies to the reference backend and, once it lands, the ref backend (§ 11). An assertion in the lookup
conformance suite (`suite-lookup.ts`, `__tests__/helpers/store/`) pins each rule that public writes can build on every
store-arm backend, landing as § 10.2 orders; a live tie from the slug arm and a cohort's ranking under a former name,
which they cannot build on both, are pinned in each backend's own tests instead (§ Cross-cutting Considerations). The
in-repo implementation, where a slug has one holder, is unchanged.

#### 1.1 Cohorts rank beside work items

The reference backend's slug ranking admits cohort primaries (`cohort/document`) beside work-item primaries in the same
four tiers (`preferredSlugRecords`, `__tests__/helpers/store/lookup.ts`), as the ref backend's does; the predicate the
commit and `ref` arms share (`primary`) keeps admitting work-item primaries alone. An assertion pins that a slug a
cohort holds resolves to the cohort's document; neither backend's suite pins it today. The reference backend's writes
keep a former name for work-item primaries alone (`land`, `__tests__/helpers/store/write.ts`), and no verb renames a
cohort before the rename change (§ 11), so its tests of a cohort's former name plant one on the cohort's record.

`readWorkUnit` names the holder type it refuses. Where the lookup returns a cohort document, it refuses as it does for
an Errand (`record-malformed`, rule `lifecycle.work-unit`), with the condition "`<slug>` resolves to a cohort rather
than a work unit" and the remedy to use the cohort's own commands or name a work unit; an Errand keeps today's text.
Start's name resolution (`resolveStartName`, `handlers/start-store.ts`), decomposition's home check (`resolveHome`,
`lib/decompose/check-homes.ts`), and the inbox's work-item list (`resolveWorkItemList`, `lib/inbox/lists.ts`) each
refuse a cohort with the same condition in its own refusal form, and keep their handling of an Errand. Every other
caller of the slug lookup takes a cohort as it already does over the ref backend, status's dependency resolution among
them, which answers no work unit for a cohort-held name (`found`, `lib/status/store-project-dependencies.ts`).

#### 1.2 A completed tie resolves to its latest archived work unit

Both backends' slug ranking breaks a completed tie that includes a work unit: a work unit outranks an Errand, and of
several completed work units the latest archived stands, by the later quarter, then the higher sequence, the order
status's selection already uses (`compareArchive`, `lib/status/store-project-standing.ts`). That order becomes one
exported comparator over completed placements (`lib/store/placement.ts`), which status and both backends call. The
reference backend reads each record's completed placement (`placement` on `MemoryRecord`,
`__tests__/helpers/store/model.ts`); the ref backend reads each archived tree's folder placement (§ 11). Holder type
orders without a sequence, so an Errand's archiving with none (`ErrandReadPlacementSchema`, `lib/store/placement.ts`)
leaves the order defined. The tie-break is the slug lookup's alone: the ref backend's name-only reference binding, which
shares its ranking (`preferredNameTrees` under `resolveCapturedReference`), still refuses a completed tie, and the
reference backend's, which binds the last-inserted holder (`indexIdentities`), is unchanged.

A tie among live holders still refuses `ambiguous-match`, and so does a completed tie that includes a cohort, since a
closed cohort's members still name it by path and creation refuses its slug (§ 6.1), or that holds only Errands, which
carry no sequence. Creation on one machine forms no tie (§ 6), but two machines can each create a live holder of one
slug (§ Introduction), and § 4.1's repair for a clash among types leaves no such completed tie: a cohort renamed off the
slug keeps it only as a former name, and a closed Errand ranks below the work unit once both complete. One still forms
when a cohort placed on a completed work unit's slug before this change closes, or when a clash is repaired otherwise.
Assertions pin each outcome.

Without the tie-break, a reused slug's lookup refuses for every reader once its second holder completes, and the write
rules, which consult the lookup, refuse the slug to every later creation. They stay as shipped and see the holder the
tie-break returns.

#### 1.3 Branch links rank live holders first

The `ref` arm ranks the primaries that link a branch as the slug arm ranks a slug's holders: a live holder before a
completed one; a tie among live holders refuses `ambiguous-match`; a completed tie that includes a work unit resolves to
its latest archived work unit (§ 1.2); and a completed tie of Errands alone refuses. The reference backend implements it
in `lookupReference`'s `ref` case.

Each session-start reader of a reused slug's branch then resolves its live holder: the orphan advisory
(`readOrphanStoreCandidates`, `lib/session-init/orphan-store-candidates.ts`, through `resolveStoreBranch`,
`store-branch-classification.ts`) and the missing-worktree check (`readStoreMissingFolderActions`,
`missing-worktree-store.ts`). Every caller stays safe: the missing-worktree check's branch cleanup and the orphan
advisory's teardown offer require the resolved holder to be a completed work unit, so neither is offered while a live
work unit links the branch; the advisory's other offer, `git branch -D`, requires the branch merged into base
(`withOrphanActions`, `orphan-branch-sweep.ts`). Teardown's branch gate (§ 8.5) reads the same arm.

#### 1.4 The work-unit claim matches by UID

`CheckoutClaimSchema`'s `work-unit` variant (`lib/store/lookup.ts`) gains the owner's UID as `uid`. The reference and
ref backends match a work-unit claim to the one owner with that UID, live or completed, and resolve a work-unit claim
without a UID to nothing (`not-found`): there is no slug fallback. The in-repo implementation, which has no UIDs, keeps
matching by slug (`lookupTracked`, `lib/store/in-repo/lookup.ts`) and ignores the field. Assertions pin that a reused
slug's claims resolve the live and the archived holder each by its own UID. § 7 states which callers send a UID.

#### 1.5 A tie's refusal names its tier

The `ambiguous-match` refusal (`LocalRefusalSchema`, `lib/store/refusal.ts`) gains an optional
`tie: { liveness: "live" | "completed"; name?: "current" | "former" }`: whether its candidates are live or completed
and, from the slug arm alone, whether the slug is their current name or a former one. A `RecordReference` carries
neither, so no reader can tell a completed tie from a live clash by its candidates. The slug and `ref` arms of both
backends set it from the rank they already compute; within one tier the candidates share both facts, since the lookup
ranks live above completed and a current name above a former one. Every other arm, the claim arm included, and the
in-repo implementation leave it out, and no arm's condition or remedy text changes. The field changes in place under the
pre-public compatibility posture. Shared assertions pin a completed tie's facts for both arms and a live tie's for the
`ref` arm, and each backend's own tests a live slug-arm tie's (§ 1).

### 2. One standing-holder selection

#### 2.1 The selection

`selectStandingLifecycleEntries` moves from `lib/status/` into `lib/store/` as lifecycle's own selection and returns
only what it establishes: the standing entries; each clash, as its slug, its kind, and each live holder's
`RecordReference`; and the fail-closed names, as `{ entries, clashes, failClosedNames }`, each clash
`{ slug, kind: "current-name" | "former-name", holders }`. A clash is one of two kinds, matching the two live tiers on
which the lookup refuses a tie:

- **a current-name clash:** several live entries are named by the slug;
- **a former-name tie:** no live entry is named by the slug, and several live entries hold it as a former name. It
  arises once the holders of a current-name clash have each been renamed away from the slug, since a renamed holder
  keeps its former name.

Status renders its `slug-clash` warning from the current-name clashes with today's text, matching each holder's
reference to its listed entry for the owner and location the text names, and omits former-name ties, as it does today;
`ProjectReadinessWarning` stays in `lib/status/`. The rule is status's as shipped, with the
former-name tie added, applied to every slug a listed entry carries as its current or a former name, since a former-name
tie's slug names no entry:

- a live entry named by the slug stands, and the completed entries named by it are left out;
- else, where one live entry holds the slug as a former name, none stands;
- else, where several live entries hold the slug as a former name, none stands, and the slug is a former-name tie;
- else the one completed entry named by it stands, and of several the latest archived, by quarter then sequence;
- several live entries named by one slug are a current-name clash, and none stands;
- a slug the listing withholds as a malformed or conflicted meta (a `work-item/meta:<slug>` diagnostic) fails closed,
  and nothing stands for it.

Where the lookup resolves a slug among work units holding it as their current name, the selection agrees with it, a tie
among completed work units included (§ 1.2). A slug one live entry holds only as a former name stands for nothing, since
the index answers by current name, while the lookup returns that holder, as a verb's operand reaches it (§ 3.1). The
selection lists metas only, so it answers for work units: cohorts and Errands take no entry in it. Where a
holder's type matters, dependency classification (§ 5) and creation (§ 6) consult the lookup, which ranks every type.

#### 2.2 The view

`readLifecycleView` runs the selection over its listing, returns it as `standing` beside its `listing`, `entries`, and
`index`, and builds its slug-keyed `index` from the standing entries (`buildLifecycleViewIndex`), so every consumer that
asks the index by slug inherits one selection. The view never refuses for a clash: it refuses only where the listing
does, and its `listing` and `entries` keep every holder, each identified by its reference. A reader of the whole
inventory therefore still runs under a clash it may be repairing, rename's subject read and group acquisition among them
(`readStoreRenameSubject` and `acquireRenameGroups`, `lib/store/lifecycle-rename.ts`). Each caller keeps its own failure
policy: status omits and warns, and a lifecycle verb refuses (§ 4).

The consumers of the view's index inherit the selection without change of their own: the store executor's position and
guards (`executeStoreTransition` and `validateStoreGuards`, `lib/work-unit/lifecycle-store-executor.ts`), the
reconcile's word check, which skips a slug the index holds (`artifactAliasTransitions`,
`lib/work-unit/store-reconcile-context.ts`), start's dispatch (`handleStoreStart`, `handlers/start-store.ts`), and the
verb-target candidate list (`resolveVerbTargetOrReport`, `handlers/lifecycle.ts`). Status's two readers
(`readStoreProjectViewInput`, `lib/status/store-project-input.ts`, and `handlers/status/lifecycle.ts`), which read the
view today and run the selection over it, take `standing` from the view and keep their output. The dependency
reconcile's store arm reads the lookup rather than the index (§ 5.2).

#### 2.3 Membership reads every holder

A cohort's membership asks about each holder, not the one standing for a slug. Archive's cohort closeout counts the
view's entries at both its call sites, the `prospective` snapshot `runStoreArchive` builds and the settle loop's
(`prepareStoredCloseout`), each passed through `prepareArchiveCohorts` to `isArchivalTriggeredWithDescendants`
(`prepareObservedCohorts`, `lib/work-unit/verbs/archive-store.ts`), as an index of every view entry keyed by its
identity (`identityKey`), the archive's subject marked completed by its reference; `isArchivalTriggeredWithDescendants`
reads only the index's values and is unchanged. Over the slug-keyed index, two clashed live members
would drop from the count, and archiving the cohort's last other open member would propose a closeout that
`checkCohortOpenMembers` (`lib/store/kinds/cohort/rules.ts`) refuses. The cohort consistency check's store arm builds
its member sets from every view entry, completed included, in the same way (`resolveCohortValidationContext`,
`scripts/validate-cohort-consistency.ts`, today through `buildCohortMembership` over the index), so a slug is a member
of each of its holders' cohorts.

#### 2.4 Slug-keyed maps beyond the view

The rule reaches every slug-keyed map the store arms build over lifecycle entries: a map keyed by slug takes the
standing entries or reads every holder, and a read keyed by identity stays on `IdentityLifecycleIndex`. The importers of
`listLifecycleIndex` and `readLifecycleView` hold these maps:

- **Completed evidence** (`readStoreCompletedEvidence`, `lib/store/lifecycle-completed.ts`) lists completed records,
  and drops any slug that has a live holder, as the in-repo arm does, where an active copy outranks an archived one
  (`compareLifecycleSources`). It finds them in a listing of the live locations beside its completed one: a slug a live
  entry holds as its current or a former name contributes no completed evidence, nor does a slug whose live meta that
  listing withholds, which leaves the result's status as the completed listing sets it; a refused or unreadable live
  listing makes the result unavailable. It feeds Candidate mutation authority (`resolveCompletedCandidateWorkUnits`,
  `handlers/candidate-mutation-owner.ts`) and, in the store arm, only the stale-worktree sweep's husk reports
  (`completedWorkUnit`, `stale-worktree-sweep.ts`), the store arm's sweep keeping no other shipped set. The
  derived roster reads none in the store arm (`acquireDerivedLocusEvidence`, `lib/locus/derived-evidence.ts`, passes an
  empty map).
- **The lifecycle snapshot** (`snapshotFs`, `lib/store/lifecycle-storage.ts`) resolves a requested path to the one
  listed entry whose own projected artifact path it is, so the live and the archived holder of a reused slug each read
  at their own path, and a path two entries project to, as two live holders under a clash do, reads as missing.
- **Paused work** (`runPausedWork`, `lib/session-init/paused-work.ts`) finds each paused entry's checkout by the entry's
  UID (§ 7.3). Paused work reads the clash facts from the view (`readLifecycleView`, § 2.2), which cover every live
  placement, since its own listing reads active records only. For a paused item whose slug they name (§ 2.1), whatever
  the other holder's pause state or placement, the item offers the clash repair (§ 4.1) alone, in place of `arc resume`
  or `arc materialize` and of a review-due item's review prompt and actions (`markPausedWorkItem`), each of which names
  a command that would refuse; the item keeps its marks. A clash with a cohort or Errand, which the selection does not
  see, keeps today's actions, each of which refuses with the clash's repair.
- **The in-flight projection** (`workUnitLocation`, `lib/git/in-flight-store.ts`) matches roster rows and the holding
  checkout by the entry's UID (§ 7.3), so two live holders under a clash each locate their own checkout.
- **Materialize's candidates** (`listStoreMaterializable`, `lib/work-unit/verbs/materialize-store.ts`) find each
  candidate's checkout by its UID (§ 7.3) and key `held` by reference.

The remaining importers read the view only for inventory completeness (`unclosed-task-commits.ts`, `task-close.ts`,
`lib/decompose/retirement.ts`, `store-worktree-selection.ts`), list every holder by identity
(`acquireDecomposeOrigin`'s incoming candidates, `acquire-origin.ts`; `acquireDecomposeSurvivingMembers`,
`removal-holders.ts`), list live entries alone and resolve their offer through the lookup
(`findMarkerlessWorkUnitCheckouts`, `lib/locus/markerless-work-units.ts`), or are the store-arm verbs of § 3; each is
unchanged but for § 3, § 7, and § 8.

### 3. A verb's entry is the lookup's record

#### 3.1 Subject entry

Every lifecycle verb's store arm takes its subject from `readWorkUnit` and finds its entry in the view by that record's
reference (`sameReference`, `lib/store/identity.ts`), never by name. It resolves its position, guards, and finalization
under the subject's current name, so a former slug typed as the operand acts on the live holder the lookup returns. The
sites:

- the store executor's inventory agreement and finalization resume (`agreesWithInventory` and
  `resumeStoreTransitionFinalization`, `lifecycle-store-executor.ts`), and its position, guards, and side effects, which
  it resolves after selecting its subject (`selectPrimary`), for the subject's current name rather than the operand, so
  a clashed subject meets the store's own refusal, while a prepared primary its caller supplies is re-read by reference
  (§ 3.2);
- activation (`readLifecyclePrimary`, and `readOtherPrimaries`, which excludes the subject by reference so a completed
  namesake stays in the comparison, `activate-deactivate-store.ts`);
- abandon (`runStoreAbandon`, `lib/work-unit/verbs/abandon-store.ts`, and `handleStoreAbandon`,
  `handlers/abandon-store.ts`);
- start's already-started check (`startedPlanningReason`, `handlers/start-store.ts`) and graduation (`graduate`,
  `commands/start-store.ts`);
- materialize (`runStoreMaterialize`, `materialize-store.ts`).

#### 3.2 Re-reads by reference

A record already selected is acquired again by its reference, never by its name. `acquireLifecycleRecords`
(`lib/work-unit/prepared-lifecycle-write.ts`) takes the owner's reference and reads that owner's group; a caller that
holds only a typed operand resolves it through `readWorkUnit` first. Its callers:

| Caller                                                              | Passes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acquireRenameGroups` (`lib/store/lifecycle-rename.ts`)             | the subject's reference, and each backlog entry's reference for its own group                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `createStoreReconcilePrepareContext` (`store-reconcile-context.ts`) | the subject's reference: from a ceremony, the optional `reference` on its operation (`CurrentWuReconcileOp`, `discharge-dep-edges.ts`), which the store arm's callers set from the record they hold (`runStoreActivate`, `runStorePublish`, `handleStoreReconcile`), `buildStoreCurrentWuReconcile` passes on, and the in-repo arm leaves out; at session start's reconcile probe (`runCurrentWuReconcileSessionProbe`, `lib/session-init/current-wu-reconcile.ts`), the work unit its checkout's claim selects (§ 7.1) |
| `acquireDecomposeOrigin` (`lib/decompose/acquire-origin.ts`)        | the selected origin's reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| conservation (`lib/decompose/conservation.ts`)                      | the primary's reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `discard-plan.ts` (`lib/decompose/`)                                | the origin primary's reference, and each member primary's reference                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `revision-members.ts` (`lib/decompose/`)                            | each prior member primary's reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `acquireDecomposeTerminal` (`lib/decompose/acquire-terminal.ts`)    | the origin resolved from the operand through `readWorkUnit`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `acquire-terminal-targets.ts` (`lib/decompose/`)                    | each home primary's reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Other re-reads of a selected subject go by its reference too:

- the pause check (`checkAdvancingPause`, `lib/store/lifecycle-pause.ts`), which takes the record its caller already
  read as its `basis`, as reopen and publish pass it (`reopen-store.ts`, `publish-store.ts`): activation and
  deactivation (`runStoreActivate`, `runStoreDeactivate`), the reconcile's apply from its acquired primary
  (`applyStoreCurrentWuReconcile`), task close (`task-close.ts`), set-stage (`set-stage.ts`), reopen's and publish's
  handler checks (`handleReopen`, `handlers/lifecycle.ts`; `permitUnpausedPublication`,
  `handlers/lifecycle-delivery-review.ts`) from the record their target resolution selected (`resolvePublicationTarget`,
  which returns it beside the name and, with no slug, reads it by the current work unit's reference), as reopen's
  delivery checks take it too (`permitDeliveryReopen`, `resolvePrMerged`), while the store executor's `unpaused` guard
  (`makePauseGuard`, `lib/work-unit/lifecycle-guards.ts`) already takes the primary `validateStoreGuards` receives
  (`selectPrimary`);
- publish's and reopen's initial store reads (`inspectPublication`, `runStoreReopen`), which take an optional
  work-unit `reference` through `PublishParams` and `ReopenParams`. With an explicit operand whose lookup succeeded,
  `handlePublish` passes the selected reference through `publishCandidateWithReviewBoundary`, and `handleReopen`
  passes it to `runReopen`; each initial read uses `store.read` by that reference. Without an operand, the handlers
  still pass their checkout-selected record to their checks, but leave the verb's `reference` absent, so its first
  `readWorkUnit` by name performs the clash check (§ 4.1). A direct caller without a selected reference takes that
  same entry path;
- the store executor's subject selection (`selectPrimary`, `lifecycle-store-executor.ts`), which re-reads a prepared
  primary its caller supplies, as activation, publish, and reopen do (`storeTransition.primary`), by its reference,
  keeping its version check, and reads the subject through `readWorkUnit` only where none is supplied;
- reopen's PR withdrawal (`withdrawalBranch`, `lib/work-unit/executor-context.ts`), whose store-arm preparation
  (`prepareStoreSideEffects`) passes the executor's selected primary as `inputs.storeTransition.primary`, preserving
  the other transition inputs, even where the executor's caller supplied no primary. The withdrawal callbacks
  (`legacyWithdrawPrHandler`, `withdrawPrHandler.prepareWithdrawal`) pass that optional primary to `withdrawalBranch`;
  in the store arm it re-reads the primary by reference through `store.read` and selects its branch through
  `linkedWorkBranch`, using `readWorkUnit` by name only where no primary was supplied. The in-repo arm keeps its
  file-based branch read;
- activation's and publish's re-reads after their reconcile (`store.read` by the primary's reference, in
  `runStoreActivate` and in `runStorePublish`'s `inspectPublication`);
- the reconcile handler (`handleStoreReconcile`, `handlers/reconcile.ts`), which takes the resolved current work unit's
  reference and, from the flip, resolves its marker fallback (`storeReconcileSlug`) through the marker's UID claim, so
  an ended holder's checkout reaches its own holder, never the live namesake;
- unclosed task commits (`computeUnclosedTaskCommits`, `lib/locus/unclosed-task-commits.ts`), which read the entering
  subject through the claim arm by the UID its derived row carries (§ 1.4, § 7.1).

An ended holder's cleanup re-reads by reference too (§ 8.2).

### 4. Clash behavior

#### 4.1 The clashed slug as subject

A lifecycle verb whose subject's name resolves to a clash, the operand it names or, without one, its checkout's current
work unit's name, refuses with the lookup's `ambiguous-match`, naming each live holder and the repair for the clash's
kind (§ 2.1). The refusal keeps each holder as a typed `RecordReference` (owner type and UID) through the verb's result,
its CLI rendering, and `--json` where the verb takes it, so a remedy renders per holder. Of `readWorkUnit`'s callers, a
lifecycle verb first meets the refusal at one of the sites below, and each passes it to its renderer whole:

- **The shared preamble.** A verb that resolves its subject through `resolveVerbTargetOrReport` or
  `resolvePublicationTarget` with an operand refuses there, before any § 3.1 site, in `canonicalVerbTarget`
  (`handlers/lifecycle.ts`) or, for publish and reopen, in `resolvePublicationTarget`'s own read (§ 3.2), as does a
  context-defaulting verb without one, whose checkout's current work unit's name (`resolveCurrentWuSlug`) it
  canonicalizes there too. It refuses through `refuseWithRemedy`, whose `LifecycleCommandRefusalSchema`
  (`handlers/lifecycle-shared.ts`) carries only a reason and a remedy today. `refuseWithRemedy` takes the store refusal
  as an optional parameter for both forms, its other callers unchanged, and the schema gains it whole as an optional
  `refusal` in place, under the pre-public compatibility posture, as publish's own read, the reconcile's envelope, and
  `arc status <slug>` already carry it; its `remedy` is the repair's (below).
- **A verb's own read.** Every other store-arm read of a verb's subject by name returns the refusal on the verb's
  rejected result, and its handler passes it to `refuse`. Publish and reopen without an operand meet it there, since
  their target resolution reads no name (§ 3.2), as do the verbs that resolve their checkout's current work unit
  themselves (`resolveCurrentWorkUnit`, `lib/store/current-work-unit.ts`). Reopen's later PR-withdrawal preparation
  (`withdrawalBranch`, `lib/work-unit/executor-context.ts`) reads the admitted subject by reference (§ 3.2), so a
  clash formed after admission does not cause another name lookup there.
- **The shared text renderer.** `refuse` (`lifecycle-shared.ts`) prints each candidate's type, current name, and UID
  with the repair its tie's kind names below, reading the kind from the refusal's `tie` (§ 1.5) and each candidate's
  type from its reference's kind, since a work unit's and an Errand's owner type are both `work-item`. One pure builder
  in `lib/store/` (`clashRepair`) composes the repair for it, for the reconcile's held entries (§ 5.2), and for paused
  work (§ 2.4). Pause and handover already pass it the refusal (`rejected`, `handlers/lifecycle-collaboration.ts`). A refusal
  without a `tie`, from another arm, prints its candidates with the lookup's own condition and remedy.
- **Sites that flatten the refusal.** Each passes the refusal whole rather than its text, and renders through the shared
  `refuse` rather than a handler's own reason-only one: materialize's handler (`handleStoreMaterialize`,
  `handlers/materialize-store.ts`); start's name resolution and graduation (`resolveStartName` and the handler's
  graduation report, `handlers/start-store.ts`; `graduate`, `commands/start-store.ts`), with `GraduateResult`'s rejected
  arm (`commands/start.ts`) carrying the refusal, and name resolution looking a former slug's current name up again, so
  a clash on that name refuses there rather than at start's dispatch, which would report the name nonexistent and advise
  `--new`; teardown's retirement read (`readStoreRetirementEvidence`, `lib/work-unit/store-retirement-evidence.ts`),
  which throws an error carrying the refusal rather than its text, so `runStoreTeardown`'s catch returns it in
  `TeardownResult`'s rejected arm (`lib/work-unit/verbs/teardown.ts`) for `handleTeardown`, while the read's other
  caller, the session-start retirement sweep (`store-retirement-sweep.ts`), keeps reporting the error's message; and the
  reconcile handler's operand check (`requestedReconcileConflict`, `handlers/reconcile.ts`), whose conflict report
  (`emitConflict`), which builds its own envelope with no `refusal` field today and prints its reason alone, carries it
  as `refusal` and renders its text through `refuse`. That check still skips the lookup for an operand equal to the
  checkout's holder's current name, which the checkout's claim selects (§ 3.2), so that reconcile runs, as one without
  an operand does.

The repair for each kind:

- **A current-name clash:** move one holder off the slug, in this order: rename a cohort holder (`arc rename <uid>
  <new-slug>`), which then keeps the slug only as a former name; else close an Errand holder (`arc errand close <uid>`),
  which § 1.2 ranks below a work unit once both complete; else rename either work unit. Where a work unit holds the
  slug, either of the first two leaves it no tie; of two Errands, closing either leaves a completed tie once the other
  closes, which § 1.2 keeps refusing as it does any completed tie of Errands alone. The refusal names the preferred move
  for its holders' types (§ 11). Renaming a work unit off a clash with a cohort or an Errand repairs the clash too, but
  leaves its former name with the other holder (§ 4.2), and with it every edge naming it, which the reconcile holds
  while that holder outranks the work unit: while the other holder is live, and for good once both have completed
  (§ 5.2).
- **A former-name tie:** name the intended holder by its current name, which the refusal prints for each holder. A
  rename is no repair, since the renamed holder keeps the slug as a former name; the tie resolves once all but one of
  its holders have completed.
- **A completed tie** that § 1.2 leaves refusing: none. No lifecycle verb acts on a completed holder, and creation
  refuses the slug (§ 6.1). The refusal prints each holder's UID; a work-unit holder's is what `arc teardown <uid>`
  takes for its checkout (§ 8.3).

`clashRepair` returns the repair as one `Remedy` (`lib/store/refusal.ts`), which is the refusal's remedy: its text names
the move for each holder, and its argv is the move's command where the move runs as printed, `arc errand close <uid>`,
and otherwise `arc status --json`, since a rename names a slug the person chooses. `refuse` prints it beside the
holders.

A lifecycle verb takes no UID subject: a UID-addressed `activate` or `archive` would let work proceed on a slug that
stays clashed. Teardown is the one exception, since its subject has ended and no work proceeds (§ 8.3).

#### 4.2 The clashed slug elsewhere

A `Depends On` edge naming a clashed slug, of either kind, is held unsatisfied with a diagnostic, never discharged and
never dangling (§ 4.3), and so is one on a slug the lookup ties between a work unit and a cohort or Errand, a tie the
selection does not see (§ 2.1). Status, which lists a live name from the view, shows the latter as a live dependency on
the work unit, with no clash diagnostic (§ 5.2).

Two checks look up words found in a work unit's records: the reconcile's word check (`artifactAliasTransitions`) and the
paired-spec owner check (`knownArtifactOwner`, `lib/work-unit/paired-reference-owners.ts`), which both the reconcile and
rename's shared-reference check (`checkSharedPairedReferences`, `lib/store/lifecycle-rename.ts`) run. Today each returns
any lookup refusal but not-found. Each instead takes `ambiguous-match` as an answer: the word check records no rename
for the word, and the paired-spec check counts the name as a work unit's where a candidate the refusal names is a work
unit. A word is no edge and needs no rewrite, so holding it loses nothing.

The rule covers every tie the lookup refuses, whatever its holders' types: a clash of either kind, a live tie among
Errands or cohorts, which the selection never lists, and a completed tie that § 1.2 leaves refusing. No such tie blocks
an unrelated work unit's activation, reconcile, or publish, each of which runs the reconcile
(`buildStoreCurrentWuReconcile`, `lib/work-unit/store-current-wu-reconcile.ts`), or its rename, whose shared-reference
check runs the paired-spec check.

Abandon's impact plan (`integratingDependents`, `handlers/abandon-store.ts`) looks up each `Depends On` edge of every
Integrating work unit and throws on any refusal but not-found, so a tie on one such edge, which a held edge keeps
(§ 5.2), would refuse abandoning any work unit. It takes `ambiguous-match` as an answer: it lists the Integrating work
unit for coordination where a candidate the refusal names is the abandoned owner, and passes over it otherwise.

Readers outside lifecycle verbs keep today's refusal where a lookup refuses or returns a holder type they do not expect,
and it is accepted: each refuses or reads unavailable without writing, loses nothing a person wrote, and no lifecycle
verb reads it. Of `readWorkUnit`'s callers outside lifecycle verbs, five print a tie's refusal by its text alone, which
names no holder: `arc view` (`resolveStoreViewTarget`, `handlers/view-store.ts`), plan grooming's draft-presence and
backlog-stub reads (`storedDraftPresent`, `handlers/plan.ts`; `readLifecycleStub`, `lib/store/lifecycle-stub.ts`), and
session start's inbound back-pressure and materializable-work slots (`readInboundBackPressure`,
`storeMaterializableCandidate`). Status's `slug-clash` warning names a clash's holders by UID (`clashWarning`,
`lib/status/store-project-standing.ts`); `arc status <slug>` (`renderStoreQueryRefusal`, `handlers/status/lifecycle.ts`)
prints its text and carries the store refusal whole in `--json`, and decompose, which takes no `--json`, prints its
reason code and remedy and always writes the store refusal whole to standard output (`emitDecomposeOutcome`,
`handlers/decompose.ts`; `storeRefusal`, `lib/decompose/refusal.ts`), so § 1.5's facts reach both there. Session start
continues past each slot (`safeProbe`, `commands/status/result-composition.ts`). The two readers below fail whole on a
tie among the many names they read, and are stated in full.

The personal notes reconcile (`arc user reconcile-references`, and its session-start slot through
`createStoreUserReferencePrepareContext`, `lib/user-reference-reconcile-store.ts`) looks names up at several sites: each
work unit's former names, completed work units' included (`resolveAliases`, `lib/store/user-reference-authority.ts`),
which returns every lookup refusal and refuses a name the lookup returns as another record type; each retired origin's
former name (`resolveTerminalAliases`), which returns any refusal but not-found and passes over a holder it finds; each
scratch folder's name (`planFolder`, `lib/user-reference-scratch.ts`), which throws on a refusal; the subjects and
targets of the rewrites it plans (`capturedLookup`, `lib/store/user-reference-targets.ts`); and the current work unit by
name (`acquireSessionContext`). Any of these refuses the command and reads the slot unavailable: a work unit's or a
retired origin's former name reaches every person, and any other name those whose notes, scratch, or checkout name it.
Under § 4.1's preferred repairs no lasting state reaches it: a cohort renamed off a clash leaves the slug with the work
unit, and an Errand closed off one ranks below it once both complete (§ 1.2). What remains:

- a live tie, until its repair for a current-name clash, or until all but one holder completes for a former-name tie;
- a cohort renamed off a clash, once the work unit completes and until the cohort closes: the live cohort then outranks
  the completed work unit by its former name (§ Introduction), for those whose notes or scratch name the slug;
- a work unit renamed off a clash with a cohort or an Errand rather than as § 4.1 prefers, whose former name resolves to
  the other holder whenever that holder outranks it: while the other holder is live, and for good once both complete;
- a completed tie that § 1.2 leaves refusing, for good.

Creation on one machine forms none of these, and two machines can still create a clash (§ Introduction).

Paused work's prerequisite check (`waitingWorkDisposition`, `lib/session-init/paused-work.ts`) reads a waits-on slug's
lookup: a work unit reads shipped or live, and a slug the lookup does not find reads its lineage. It throws on any other
resolution, a tie or a cohort or an Errand holding the slug (a cohort's document the ref backend's ranking already
returns, § 11), and `readPausedWork` catches no single item, so the owner's session-start paused-work slot reads
unavailable. The project view runs the same check for every owner's entries and warns `store-read-failed` on that entry
alone, for every viewer (`readStoreProjectPauseMarks`, `lib/status/store-project-pauses.ts`). A tie reports the lookup's
condition and its repair, and a slug a cohort or an Errand holds the check's own condition. The failure lasts while the
slug resolves so, which changes only as its holders complete, close, or rename (§ 5.2), and clears at once when the
pause's prerequisite changes (`arc pause <slug> --waits-on <slug>` or `--no-waits-on`). Rename rewrites a waits-on edge
only in the records it acquires, its own and the backlog's (`acquireRenameGroups`), so a work unit renamed off a clash
leaves another active pause waiting on the slug the other holder keeps.

#### 4.3 The clashed slug in a dependent's edges

A name an edge meets that the lookup refuses as a tie including a work unit, in any tier, holds the edge under its own
name, never a target's, with a diagnostic naming each holder as a typed reference and the repair: for a current-name
clash, the move § 4.1 names for its holders' types; otherwise, editing the edge to name the intended holder's current
name, or removing it (§ 5.2). The lookup's `ambiguous-match` never becomes `namespace-corrupt`. The dependent activates:
activation never waits on an unfinished dependency, and of its dependency reconcile it rejects only a conflict
(`runStoreActivate`, `activate-deactivate-store.ts`).

### 5. Dependency edges

#### 5.1 Classification against the standing holder

An edge naming a reused slug classifies against the live work unit, as status's project view does and as `readWorkUnit`
resolves it. Pinning an edge to the holder its author meant needs UID-bearing edges, which this change does not add.
Creation's edge settling (§ 6.4) leaves that case narrow: once a reuse lands, the edges still naming the slug are those
in archived records, which gate nothing, and those written after it, which mean the new holder.

#### 5.2 Each name resolves once

The store arm's reconcile decides an edge from one resolution of each name the edge meets, and from then on by the
resolved record's reference, never by the name again. The context supplies the resolution as a resolver that memoizes
each name as the reconcile meets it, since a lineage disposition's targets are known only once it is read. The names an
edge meets are its own slug, the current name of a work unit it would follow, and each target a lineage disposition
gives it (§ 5.3). A name resolves through the slug lookup. A lineage target that carries a UID (`WorkItemRef`,
`lib/store/kinds/lineage/schema.ts`), as a decomposition writes for each destination whose record it holds
(`destinationReferences`, `lib/decompose/lineage-plan.ts`), resolves instead to the view's entry with that UID (§ 2.2),
and where no entry has it, to its own lineage, since its primary has left the store; a target without one resolves by
its name. The reconcile reads a complete inventory (`requireCompleteInventory`, in
`createStoreReconcilePrepareContext`), so every work unit a resolution returns has its entry, and its state is that
entry's (`deriveState`).

The first row that matches a resolution applies:

| The name resolves to                                                                                            | The edge                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| the dependent itself                                                                                            | refuses as a `self-dependency` conflict                                                                                                                            |
| a work unit that is Integrating or completed                                                                    | is discharged                                                                                                                                                      |
| a live work unit under the name as its current name                                                             | stays, live                                                                                                                                                        |
| a live work unit under another current name                                                                     | follows it to that name where the name's lookup returns the same work unit (`sameReference`), and otherwise is held under its own name with that name's diagnostic |
| a tie (`ambiguous-match`) whose candidates include a work unit                                                  | is held under its own name with the clash diagnostic (§ 4.3)                                                                                                       |
| a cohort or an Errand, under the name as its current or a former name, or a tie among cohorts and Errands alone | takes the lineage's disposition for the name (§ 5.3), and without one is held under its own name, naming the holder or each tied candidate                         |
| nothing (`not-found`), or, for a target with a UID, no entry                                                    | takes the lineage's disposition for the name (§ 5.3), and without one refuses as today's `missing-evidence` conflict                                               |
| any other refusal                                                                                               | refuses as a `namespace-corrupt` conflict, as today                                                                                                                |

An edge naming the dependent's own current name refuses as a self-dependency before any lookup, as today
(`planDependencyReconcile`). A disposition that substitutes targets, a rename's successor or a decomposition's
replacements, resolves each target once and applies its row: the edge is replaced by the targets that stay live, under
their current names, and discharged for those that are Integrating or completed. Where a target's row would hold the
edge, the whole edge is held under its own name with that diagnostic, so the reconcile never moves an edge onto a name
that does not resolve to the work unit it means. Any conflict refuses the whole rewrite, as today, and a cycle among
lineage names is today's `rename-cycle`.

A held edge stays in `Depends On`, unsatisfied, and is never discharged. It blocks no ceremony: activation and publish
refuse only a reconcile conflict, and publish's review stop reads the plan's advisories alone (`runStoreActivate`;
`runStorePublish`, `lib/work-unit/verbs/publish-store.ts`). The dependency component (`DependencyReconcileComponent`,
`discharge-dep-edges.ts`) carries it in an optional `held` list, each entry
`{ edge, name, cause, candidates, tie?, repair }`: the edge, the name whose resolution held it, why (`tie`,
`not-a-work-unit`, or `unresolved-follow`), the holder or each tied candidate as a typed reference, the tie's facts
where a tie held it, and the repair as a `Remedy`: `clashRepair`'s for a tie that includes a work unit (§ 4.1, § 4.3),
and otherwise text alone. A held edge stays in the component's `after` and is not listed in `live`. The session-start
reconcile schema (`lib/session-init/current-wu-reconcile-schema.ts`) gains the field in place under the pre-public
compatibility posture. A held edge makes an otherwise clean plan `pending`, at prepare and at apply alike
(`prepareCurrentWuReconcile`; `applyStoreCurrentWuReconcile`, `lib/work-unit/store-current-wu-reconcile.ts`), so session
start surfaces it with its inspect action and a prompt naming the held edges (`projectCurrentWuResult`,
`lib/session-init/current-wu-reconcile.ts`), and `arc wu reconcile` prints each held edge with its holders and repair
(`emitHuman`, `handlers/reconcile.ts`) and carries the list whole in `--json` (`toEnvelope`).

`createStoreReconcilePrepareContext` supplies the resolution, and `planDependencyReconcile` takes the store path where
its input carries one. The in-repo contexts supply none (`buildCurrentWuReconcile`,
`lib/work-unit/executor-context-current-wu.ts`; `handleWuReconcile`, `handlers/reconcile.ts`; session start's probe,
`handlers/status.ts`) and keep today's path through the index (`resolveSlugState`) and the Git disposition query
(`queryGitTransitionDisposition`, `lib/work-unit/git-transition-record-enumeration.ts`): there a slug has one holder,
and the planner leaves `held` out. The store arm's disposition query becomes the lineage read alone (§ 5.3), its lookup
moving into the resolution. Its retarget and replace dispositions (`TransitionReconcileDisposition`,
`lib/work-unit/transition-disposition-query.ts`) gain an optional `references`, the lineage's `WorkItemRef` for each
target, which the store arm's lineage read sets (`queryStoreDisposition`) and the shared projection
(`queryTransitionDisposition`) leaves out, so the in-repo arm's dispositions are unchanged.

Today the store arm decides an edge from the view's index first (`resolveSlugState`, in `planDependencyReconcile` and in
`resolveRetiredEdge`'s retarget and replace arms), and compares a retarget or replacement target with the dependent by
name (`target === input.dependentSlug`). Under reuse an edge on a completed work unit's former name so refuses as a
self-dependency where the dependent has taken that work unit's current name, and a retargeted edge reads the standing
holder of its work unit's current name, which may be a newer work unit.

A name's resolution follows its holders: it changes as they complete, close, or rename, with no write to the name, so
one edge can take different rows across reconciles. Discharge needs the work unit the name resolves to be Integrating or
completed itself, so a holder that outranks that work unit for a time only delays its discharge; a rename that leaves
the name with another work unit (§ 4.1), or a reuse (§ 5.1), is what moves an edge to another work unit. For instance,
take an edge on a slug a work unit holds and a cohort renamed off it keeps as a former name (§ 4.1): the edge stays
while the work unit is live and is discharged once it is Integrating; should the work unit complete before a reconcile
discharges it, the cohort outranks it by its former name (§ Introduction) and the edge is held, until the cohort closes
and the slug resolves to the work unit again.

Status classifies edges for the project view and discharges nothing (`resolveStoreProjectDependencies`,
`lib/status/store-project-dependencies.ts`), unchanged: it lists a name with a live standing entry from the view with no
lookup (`liveNames`), so a tie there between a work unit and a cohort or Errand shows no clash diagnostic; reads a
cohort or Errand holder as a missing dependency, with no lineage read (`found`); reads a former-name edge's work unit by
its identity; and reports a tie with the lookup's refusal (`resolveName`).

#### 5.3 The lineage read

Where a name resolves to a cohort, an Errand, a tie among them alone, or nothing, or is a target with a UID that no
entry has (§ 5.2), the reconcile reads the lineage under it. Today the store arm's disposition query
(`queryDisposition`, built in `createStoreReconcilePrepareContext`) does more: it retargets the edge whenever the lookup
returns another name, whatever the record's type; reads the lineage enumeration for a same-name hit
(`queryStoreDisposition`); maps every refusal but not-found to `namespace-corrupt`; and only for not-found reads the
retired origin's lineage with its aliases (`queryRetiredOriginDisposition`, `store-reconcile-context.ts`).

The store arm reads every such name's lineage as it does today for a name the lookup does not find
(`queryRetiredOriginDisposition`), which maps a retired origin's former names through its aliases, since a cohort or an
Errand can take a retired origin's slug, current or former, once the slug lookup no longer resolves it. A tie that
includes a work unit reads no lineage: the edge may mean that work unit, which a lineage disposition for the name cannot
settle. Every disposition the reader returns applies as § 5.2 states: a drop or an abandonment drops the edge, and a
rename's successor or a decomposition's replacements substitute for it; the lineage's own `ambiguous`,
`unmapped-dependent`, and `namespace-corrupt` results stay conflicts.

Only an absent disposition for a cohort or an Errand changes: the edge is held, naming the holder or each tied
candidate, rather than taking the `missing-evidence` conflict that rejects the dependent's activation today
(`conflictReason`, `discharge-dep-edges.ts`). The dependent activates. The case arises when a work unit is renamed away
from a slug a cohort keeps, when a cohort is renamed away from a slug an edge names, and when an edge names a cohort's
slug outright.

### 6. Creation

#### 6.1 The admission check

Creation admits a slug with no live holder, within the store's write rules, through one admission check in `lib/store/`
that asks the lookup. It takes the slug and the writing owners, the owners of records a caller already holds that take
the name, and answers free, held, or refused:

- **Free:** the lookup finds nothing (`not-found`), or returns a completed work unit under the slug as its current name
  (the latest of several, and above a completed Errand, § 1.2), or returns a writing owner.
- **Held:** the lookup returns a live record under the slug as its current or a former name, or refuses
  `ambiguous-match` over live holders. A tie falls within one ranking tier, so its candidates are all live or all
  completed; the check reads which from the refusal's `tie` (§ 1.5) and treats a live tie as held.
- **Refused:** the lookup returns a completed Errand or cohort holding the slug, as `arc start` refuses an Errand's slug
  today (`resolveStartName`); returns a completed record holding the slug as a former name, as `work-item.former-slug`
  refuses it (`checkFormerSlug`); refuses `ambiguous-match` over completed candidates, a tie that § 1.2 leaves refusing;
  or refuses for any other reason, which fails closed.

A held or refused answer carries each holder's reference, whether the slug is its current or a former name, and whether
the lookup refused a tie, which § 6.5's refusal reads. The lookup returns only a reference (`LookupResult`,
`lib/store/lookup.ts`), so the check reads the returned record for its liveness, and it fails closed as well on a read
refusal, on a holder with unresolved conflicts, and on a tie refused without its `tie`, as the in-repo implementation
refuses one (§ 1.5).

Reuse is so limited to completed work units, the only completed holders § 1.2 lets stand for a tie: a closed cohort's
members still name it by path, and Errands alone carry no sequence. A completed Errand that ranks below a completed work
unit no longer resolves through the slug, so its slug admits reuse as that work unit's does. A slug the lookup returns
as a writing owner is free, as the write rule exempts the writing owner (`sameOwner`, `checkFormerSlug`): Errand
promotion's default name is the Errand's own slug, and a decomposition revision keeps its retained members' names. The
lookup ranks every holder type in the shared namespace, so the check is the creation guard against live records as the
storage design states it, and it admits only what the write rules admit (`checkFormerSlug`; `priorTarget` and
`checkSlugEdges`).

The write rule judges only the holder the lookup returns, so it admits a former slug that a completed holder under its
current name outranks; a former slug resolves to its own work item alone only where the lookup returns the former name.
The check inherits that and does not close it (§ Non-Goals).

#### 6.2 Where it runs

The check is the one admission check at every path that creates a work item and at Errand promotion. Rename
(`readStoreRenameSubject`, `lib/store/lifecycle-rename.ts`) and `arc errand open` keep their own admission.

- **`arc stub`:** a create in `executeStoreTransition` (`inputs.storeTransition.create`) runs it and, when it passes,
  takes position `null` rather than the completed holder's position, which the index would return. `arc stub` prints a
  write rule's refusal with its remedy, where today it prints the condition alone (`runStoreStub`, `sequenceRejection`).
- **`arc start <name> --new`, spawned or `--here`:** `handleStoreStart` runs it on the operand as typed, in place of
  `resolveStartName` and `resolveStartDispatch`'s refusal of any slug the index holds. `resolveStartDispatch` itself is
  unchanged, since the in-repo arm shares it.
- **The cold start:** `runStoreColdStart` (`commands/start-cold-store.ts`) runs it on the cold start's name, named or
  derived, before it writes the checkout's marker, since a nameless start's name is derived only in `runColdStart`
  (`commands/start.ts`), which passes it there. Its failure path no longer rewrites a nameless failure as a held name
  (`recoverColdStartFailure`): the check refuses a held name first, and the rewrite would replace a write rule's remedy.
- **Decomposition's work-item names:** `checkNamespaceName` (`lib/decompose/check-names.ts`) runs it, with a revision's
  retained members' owners as its writing owners. Its rule today agrees but for a completed Errand or cohort holder,
  which it admits and now refuses, and § 1.2 lifts its refusal of a completed tie that includes a work unit.
- **Errand promotion's target name:** `replace` (`lib/errand/promote-store.ts`) runs it, with the Errand's owner as its
  writing owner, where today it relies on the store's write checks alone.

`resolveStartName`'s rewrite of a former slug to its holder's current name stays for graduation only: creation under the
rewritten name would make a work unit nobody named. `nameCollisionGuard` (`lib/work-unit/lifecycle-guards.ts`) guards
only the in-repo `start` edge, which no store path runs, and is unchanged, as are the transition table and the in-repo
arm, where a slug has one holder.

#### 6.3 A cohort taking a name

A cohort takes only a slug nothing resolves through, so decomposition's new-cohort names refuse whenever the slug's
lookup returns a record, a completed work unit's or a completed Errand's slug included, which `checkNamespaceName`
admits today. Membership names its cohort by path and readers match it as text (`lib/decompose/removal-cohorts.ts`,
`lib/store/kinds/cohort/rules.ts`), and `work-item.slug-edges` guards no cohort write, so a cohort on a completed work
unit's slug would otherwise take that work unit's edges (§ 5.2).

#### 6.4 Creation settles the edges naming the slug

A batch that gives a work item a slug that an edge names for a prior holder first settles each such edge in the stubs it
may write: an edge on shipped work discharges, and an edge on a retired origin takes its lineage disposition. It settles
only where `work-item.slug-edges` counts an edge, where the rule's prior-target resolution (`priorTarget`) finds a prior
holder other than the writing owner; an edge naming a slug no record has held names the new record and stays. It leaves
each writing owner's own records to its caller, which writes them in the same batch. A stub is a work-unit meta in
backlog placement with no conflicts and no cut map, as decomposition's settlement reads one (`slug-settlement.ts`), and
in Planning, since a parked record sits in backlog placement too. An edge the settler cannot settle, on a conflicted or
cut-mapped stub or through lineage it cannot resolve, stays for the rule. An in-flight dependent's edge, `Depends On`
or, when paused, `waits-on`, still refuses through `work-item.slug-edges` (`checkSlugEdges`) with its remedy, since only
its owner settles it.

One settler in `lib/store/` serves creation and Errand promotion and joins the batch that writes the record, after the
create: for `arc start`, `--new` and the cold start alike, `scaffoldIntoWorktree`'s create batch
(`lib/git/worktree-scaffold.ts`); for `arc stub`, the executor's; for promotion, `replace`'s. It binds the records it
read as the batch's observations. The lineage resolution it shares with decomposition (`resolveDecomposeRetiredEdge`,
`lib/decompose/retired-edge.ts`) and the slot replacement (`replaceDependencySlot`, `lib/decompose/dependency-slot.ts`)
move to `lib/store/`, which imports nothing from `lib/decompose/`, and decomposition wraps them. Decomposition keeps its
own settler (`decomposeSlugSettlementWrites`, `lib/decompose/slug-settler.ts`), which settles a cut's names from the cut
map's dispositions.

#### 6.5 Refusals

A live holder, under its current or a former name, refuses, naming each holder by type, current name, and UID; the
remedy is to choose another name or, for a holder under its current name, to wait for it to complete. Where the lookup
returns a live work unit, `arc start --new` keeps today's pointer: that work unit's already-started report where it is
Planning in active placement (`startedPlanningReason`, `handlers/start-store.ts`), and otherwise the pointer to omit
`--new`, since that work unit's lifecycle state decides what `arc start <slug>` does (`resolveStartDispatch`). A tie
takes no pointer, since `arc start <slug>` refuses it first (`resolveStartName`). A rename is never the remedy, since a
renamed holder keeps the slug as a former name, so creation's refusal never prints the clash repair (`clashRepair`,
§ 4.1). The nameless cold start names `arc start <name> --new --here` as the way to choose another name. A completed
holder's former slug, and a completed Errand's or cohort's slug, refuse with the remedy to choose another name. A
lingering checkout of a completed holder whose marker carries its UID does not block reuse: holder matching follows the
claim's UID (§ 7.3). One whose marker predates the flip is unbound and blocks a creation of the slug until it is
released (§ 7.4).

### 7. Checkout claims by UID

#### 7.1 The marker subject and the claim

A checkout marker's work-unit subject (`createdFor`, `lib/git/worktree-marker.ts`) records the owner's UID beside its
name, which the marker's validator (`isWorktreeSubject`) requires to be a UUID; a husk stamp's subject, which the same
validator checks today, takes one of its own that admits none. The derived checkout row's work-unit subject carries it
too (`DerivedCheckoutRowSchema`, `lib/locus/derived-schema.ts`), reduced from the marker through `projectMarker`
(`lib/locus/derived-evidence.ts`), `markerSubject` (`derived-lifecycle-evidence.ts`), and the role's marker candidate
(`DerivedWorkUnitSubject`, `role-derivation.ts`), so a reader that builds its claim from the session frame has it
(`callerIdentity`, `lib/errand/store-overlap.ts`). The field is optional in both:
the in-repo arm writes none, an unbound marker carries none (§ 7.4), and a husk's row carries none (§ 8.1). The row is
part of the published derived schema, which `lib/session-envelope/registry.ts` and `commands/status/schema.ts` import,
and changes in place under the pre-public compatibility posture.

From the flip, every reader that resolves a checkout's work unit through the claim sends the marker's UID with the claim
(§ 1.4); a marker that carries none is unbound, and § 7.4 states what each reader does with it:

- the current-work-unit resolver (`readClaimedCurrentWorkUnit`, `lib/store/current-work-unit-marker.ts`);
- marker occupancy (`inspectCheckoutMarker`, `lib/locus/marker-occupancy.ts`);
- the exclusivity refusal (`createLocusPorts`, `lib/locus/lifecycle-ports.ts`);
- work-unit evidence (`readClaimedWorkUnit`, `lib/locus/store-work-unit-evidence.ts`);
- the stale-worktree selection (`selectCheckout`, `lib/session-init/store-worktree-selection.ts`);
- the worktree roster (`lib/git/worktree-roster.ts`);
- the Errand overlap check's caller identity (`callerIdentity`, `lib/errand/store-overlap.ts`);
- unclosed task commits (`computeUnclosedTaskCommits`, `lib/locus/unclosed-task-commits.ts`), which read the entering
  subject by its slug through `readWorkUnit` today and take the claim instead, from the entering row's UID (§ 3.2).

`store-identities.ts` returns before the claim for a work-unit subject, and a husk-stamped checkout never reaches the
claim: `readClaimedCurrentWorkUnit`, `selectCheckout`, `marker-occupancy.ts`, and `readMarkerHolder`
(`lifecycle-ports.ts`) return first when `marker.husk` is set, and from the flip so do the derived row's work-unit
reduction and the store roster (`runStoreRoster`), each reading the husk as retired (§ 8.1). `callerIdentity` reads the
entering row, which for a husk carries no UID, so it sends no claim. Where a reader's claim finds no primary and it then
reads a retired origin's lineage, it reads the lineage by the marker's UID (`readTerminalWorkUnitLineage`,
`lib/locus/store-terminal-work-unit.ts`, which already admits one; the lineage lookups in `store-work-unit-evidence.ts`,
`store-worktree-selection.ts`, and `marker-occupancy.ts`). Before the flip, readers send the slug claim as today.

#### 7.2 Marker writers

A writer that holds the record writes the UID with the claim: graduation, spawned or in place, and materialize
(`claimSpawnedWorktree`, `lib/work-unit/spawned-worktree-claim.ts`, and the in-place leg of `reconcileWorkUnitWorktree`,
`lib/work-unit/mutators/reconcile-work-unit-worktree.ts`), and promotion's two marker conversions
(`lib/errand/promote-runtime.ts`), from the UID on the record promotion reads, which its frame receipt
(`PromotionFrameReceipt`, shared with the in-repo arm) carries as an optional field. Rename's marker rewrite (`renamedMarker`,
`lib/work-unit/rename-worktree-transaction.ts`) keeps the UID, so a rename changes the marker's name for paths while its
claim identity stays put.

The two creation paths claim before the record exists, so the record write comes last and a failed creation leaves
nothing in the store to undo: `arc start --new`'s spawn (`runCreateNew`, `commands/start.ts`) and the cold start
(`runStoreColdStart`, `commands/start-cold-store.ts`). Each writes its marker without a UID (§ 7.4) and stamps the UID
after its create batch, from the owner the batch wrote, which both store-arm backends mint and the scaffold's store arm
(`scaffoldIntoWorktree`, `lib/git/worktree-scaffold.ts`) returns. The stamp replaces exactly the generation the creation
wrote, as promotion settles its marker after its commit (`settleOccupancy`, `lib/errand/promote-runtime.ts`). A stamp
that fails once the batch has committed leaves the marker unbound, and the creation reports its exit,
`arc materialize <slug> --here`, since the record is live; the shipped rollbacks (`recoverColdStartFailure`,
`commands/start-cold-store.ts`; `rejectCreateNewScaffold`, `commands/start.ts`) run only before the batch commits, so
the stamp sits outside them.

Decomposition writes `branch` subjects only (`lib/work-unit/git-decompose-*`), and husk stamps are unchanged.

#### 7.3 Holder matching follows the claim

Marker exclusivity and holder lookup (`checkMarkerExclusivity` and `findHoldingCheckout` on `LocusPorts`,
`lib/work-unit/locus-ports.ts`, bound by `createLocusPorts`) take one discriminated request, which the caller sets:
`{ kind: "owner"; uid; names }`, the owner's UID with its current and former names, from a caller that holds a record,
or `{ kind: "creation"; slug }`. `findHoldingCheckout` answers none, a checkout holding the subject, or an unbound
holder with its exits, and takes the same `checkoutPath` exclusion as `checkMarkerExclusivity`, whose refusal carries
the unbound case too. The spawn op graduation, materialize, and `arc start --new` share (`ReconcileWorkUnitWorktreeOp`,
`reconcile-work-unit-worktree.ts`) carries it beside its placement name, and a store-arm record without a UID refuses
rather than taking a creation request. An owner request matches markers by UID, never by the marker's name, so a
lingering bound checkout of the archived holder neither blocks the slug's reuse nor is taken for the live holder's;
several markers carrying one UID still refuse as several holders do today.

An unbound marker (§ 7.4) matches no UID, so an owner request reports one that names the subject's current or a former
slug as an **unbound holder** rather than passing over it. A caller that acts on the holder refuses on an unbound
holder, naming the marker's exits, as the scan refuses a marker whose ownership it cannot read (`readMarkerHolder`):
exclusivity, rename, abandon, decomposition's retirement check, the sharing report, teardown, and
`arc locus release <slug>`, which names the unnamed release to run inside the unbound holder's checkout. One that finds
a bound checkout and an unbound holder both refuses naming both. A caller that only lists or reports shows the work unit
as held at its bound checkout or, with none, at the unbound one, with the unbound marker's exits: materialize's
candidates, start's already-started check, paused work, the in-flight projection, and materializable work units.
`arc materialize --here` excludes the checkout it binds (`checkoutPath`) from its own exclusivity check and candidate
listing, as the cold start excludes its own (`runStoreColdStart`), so binding a marker never refuses on that marker.

Every caller that holds a record passes the owner request:

- **through `requireMarkerExclusivity`:** graduation (`graduate`, `commands/start-store.ts`) and the spawn leg
  graduation and materialize share (`reconcileWorkUnitWorktree`);
- **through `checkMarkerExclusivity`:** promotion, with the Errand's own UID (`promote-store-runtime.ts`);
- **through `findWorkUnitHoldingCheckout`** (`lib/work-unit/verbs/unshared-work.ts`): rename (`rename-store.ts`),
  abandon (`abandon-store.ts`), decomposition's retirement check (`checkDecomposeRetirementCheckout`,
  `lib/decompose/retirement-checkout.ts`), the sharing report that gates handover and that pause reports after its write
  (`readUnsharedWork`), start's already-started check (`startedPlanningReason`, `handlers/start-store.ts`), and
  materialize's candidates (`listStoreMaterializable`, `materialize-store.ts`);
- **through `findHoldingCheckout` directly:** teardown (`holdingCheckout`, `teardown-store.ts`, § 8.4), and the
  session-start and status readers over listed entries, paused work (`runPausedWork`), the in-flight projection
  (`workUnitLocation`, `in-flight-store.ts`), and materializable work units (`storeMaterializableCandidate`,
  `lib/session-init/materializable-work-units.ts`), through the functions bound for them in
  `handlers/status/store-session.ts`, `handlers/status/store-locus.ts`, and `handlers/active.ts`, and status's own
  holder lookup for `arc status <slug>` (`readStoreStatusLocus`, `handlers/status/store-locus.ts`), with the UID of the
  record it read.

The derived roster's rows carry the UID too (§ 7.1), and from the flip every reader that matches a row to a work unit it
selected elsewhere matches by that UID, never by the row's name:

- the duplicate-marker guard (`guardDuplicateMarkerClaims`, `lib/locus/derived-reader.ts`), which groups rows by UID and
  rows without one by slug among themselves, as creation's exclusivity compares unbound markers, and in the store arm
  passes over a husk's row, the `retired` row without a UID that § 8.1 gives it, which holds nothing;
- branch ownership (`storeLocusOwnsBranch` under `locusOwnsBranch`, `lib/session-init/locus-classification.ts`) and the
  orphan advisory's candidate filter (`orphan-store-candidates.ts`), against the record the branch resolves to;
- the in-flight projection (`workUnitLocation`, `lib/git/in-flight-store.ts`), against each listed entry (§ 2.4);
- status's slug position (`selectWorkUnitRow`, `lib/status/slug-position.ts`), against the standing holder status
  selects for the slug (§ 2.1);
- promotion's recovery checkout (`selectRecoveryCheckout`, `lib/errand/promote-store-runtime.ts`), against the promoted
  record.

A bound checkout or a husk of the archived holder therefore neither puts the live holder's checkout in conflict nor
stands in for it. Readers of the entering row's own subject (the active frame, session guidance, path treatment, and the
completed review terminus, `completedReviewTerminusContext`, `handlers/review-locus-context.ts`, which requires that
row's own completed location, so no live holder's row matches it), the Errand and partial-Errand matches, which carry
their own claim identity, and the in-repo arm's collision guard (`guardWorkUnitLocusCollisions`), whose unmarked
carriers no store-arm row has, are unchanged.

A caller given a slug a person typed holds no record yet: it resolves the slug through the lookup first (§ 3) and
matches the returned record's UID. `arc locus release <slug>` (`runLocusRelease`, `lib/locus/release.ts`) so acts on the
live holder's checkout, and an ended holder's bound checkout stays teardown's (§ 8). Its order is fixed: where the
lookup returns a live holder, release matches that holder's UID; where it refuses other than `not-found`, as under a
clash (`ambiguous-match`), release refuses with it and names the unnamed form (§ 7.4); otherwise, for a completed holder
or nothing, as § 6.1 reads a free slug, it matches only the unbound markers that name the slug (§ 7.4) and releases the
one it matches from wherever it runs, as it releases a missing record's marker today (`releaseAuthority`), refusing on
several and naming each. An unbound holder of a live slug refuses instead where materialize admits that holder for the
person releasing (`ownedInFlight`), since binding recovers it (§ 7.4); otherwise release takes it as it takes a free
slug's, so a backlog stub's crashed marker stays releasable by name. A completed holder's stamped checkout and a crashed
reuse's unbound marker therefore never both match. That stamped checkout is released from inside it, by the unnamed form
its exit prints, as a non-owner may today (`releaseAuthority`, `lib/locus/release.ts`).

A creation holds no record yet, so its claim carries no UID: it passes the slug, and its exclusivity check
(`requireMarkerExclusivity`, through the spawn leg for `arc start --new` and in `runStoreColdStart`) compares it against
the other unbound markers only. A crashed creation's leftover therefore blocks a retry and names its exits (§ 7.4), and
a UID-bearing marker never blocks creation: the admission check decides that (§ 6.1).

#### 7.4 A marker without a UID is unbound

From the flip, a work-unit marker without a UID is **unbound**: a creation's before its stamp, or one written before the
flip, which the import into the store leaves out as machine-local. A husk-stamped marker is a husk rather than unbound,
and no claim reader reads one (§ 7.1, § 8.1). A creation writes its marker without a UID and its stamp adds one; nothing
else stamps an unbound marker but materialize, below. The marker's readers change with the subject's UID key: the marker
type and its validator (`worktree-marker.ts`), `decodeWorktreeMarkerOwnership`, and the work-unit reduction through
`projectMarker`, `markerSubject`, and the role's marker candidate (§ 7.1). A work-unit marker still carries no
provisioning.

From the flip, a claim reader that acts on the checkout refuses an unbound marker, naming its exits, rather than taking
the not-found path that advises `arc locus release` (`marker-occupancy.ts`), and holder matching treats it as § 7.3
states. One classifier in `lib/locus/` reads the marker and the lookup of its slug for every reader. It names each work
unit holding the slug as its current name, live and completed, and the record the lookup returns or the candidates it
ties, each by its UID, so a person binding under reuse sees which holder is which; an incomplete listing of work units
reads as unreadable. Its exits are actions bound to the marker's checkout. The exits follow the marker and the lookup of
its slug:

- **A live holder materialize admits,** one owned and in flight in active placement (`ownedInFlight`,
  `materialize-store.ts`): `arc materialize <slug> --here` from that checkout binds it, the person naming the holder,
  and materialize gains this admission; `arc locus release` frees it where the checkout is not that holder's. Where the
  marker names a former slug, the bind exit names the holder's current name, and a reader that has no identity names the
  holder's owner on the bind exit rather than deciding whether materialize admits it.
- **An anchored marker (`spawnedByArc: false`) whose slug neither the slug lookup nor the lineage arm finds:** a cold
  start's leftover from before its create batch commits; one interrupted after the batch holds a live record and takes
  the bind exit. The cold start's rerun admits it, under any name, or `arc locus release` frees it. Today's admission
  (`missingRecord`, `runStoreColdStart`) reads the work-unit claim, which matches only a work unit under its current
  name and so misses an Errand's, a cohort's, or a former slug; the slug lookup finds each, so such a leftover takes
  release instead, as § 6.1 refuses that creation.
- **Otherwise:** `arc locus release` alone. This covers a spawned marker, an anchored one whose slug has a completed
  holder or a retired origin, as a checkout promoted before the flip may (`anchorPromotedMarker`,
  `lib/errand/promote-runtime.ts`), one whose live holder materialize does not admit, and one whose slug's lookup
  refuses, as under a clash (`ambiguous-match`), where materialize by slug refuses too (§ 4.1). A crashed creation of a
  reused slug is released, then rerun.

The stale-worktree sweep reports an unbound marker as a release report whose actions are its exits, rather than as the
warning its other refusals become (`selectCheckout`). The work-unit evidence behind the derived roster
(`readStoreWorkUnitEvidence`, `lib/locus/store-work-unit-evidence.ts`) recognizes a marker without a UID before its
claim read (`readClaimedWorkUnit`) and gives its row a distinct diagnostic carrying the exits, in place of the
missing-record residue (`work-unit-record-missing`, `derived-reader.ts`), whose advice would release a live work unit's
checkout or rerun a creation § 6.1 refuses. The cleanup sweep admits that row (`cleanupAuthorityRow`), and the roster's
claim read (`runStoreRoster`, `lib/git/worktree-roster.ts`) warns naming the exits.

The current-work-unit resolver (`resolveCurrentWorkUnit`, `lib/store/current-work-unit.ts`, through
`readClaimedCurrentWorkUnit`, `current-work-unit-marker.ts`) reports an unbound marker as its own state rather than as a
warning, and only the two exits that bind admit it:

- the cold start, which checks the resolver first (`runStoreColdStart`);
- `arc materialize --here`, alone of the verbs that share the occupancy guard (`readStoreOccupancy`,
  `lib/work-unit/lifecycle-guards.ts`). Each passes the guard its subject's primary, start and resume through the
  guard's context from the primary their executor selects (`validateStoreGuards`), and the guard matches a bound marker,
  and the checkout's current work unit, by that primary's UID, never by name; a creation, which holds none, owns no
  bound marker. Only materialize's call admits an unbound marker naming the slug, and only where that record is one
  materialize admits; start and resume refuse it. Its in-place leg, given the unbound marker's generation through a
  materialize-only field of the spawn op, so that graduation `--here` keeps refusing, stamps the unbound marker by its
  generation (`writeAnchoredMarker` with `expected`, in `reconcileWorkUnitWorktree`): it adds the UID and keeps the
  marker's other fields, `spawnedByArc` among them, as the creation's own stamp does, rather than refusing an existing
  marker or writing the fresh one the leg writes today, which sets `spawnedByArc: false`.

Every other caller that acts on the checkout's one current work unit refuses an unbound marker, naming its exits: a
lifecycle verb run without an operand (`resolveCurrentWuSlug`, `resolvePublicationTarget`, and the store-arm target of
`arc set-stage`, `arc finalize`, and `arc repoint-design`, in `handleSetStage`, `handleFinalizeStage`, and
`handleRepointDesign`, `handlers/lifecycle.ts`; `target`, `handlers/lifecycle-collaboration.ts`), `arc wu reconcile`
(`handleStoreReconcile`, whose marker fallback, `storeReconcileSlug`, then never reads an unbound marker's name), the
task commands (`handlers/task.ts`), `arc handoff write` (`lib/handoff/write.ts`), `arc set-class` without a name
(`lib/work-unit/verbs/set-class.ts`), the ambient `arc view` (`resolveStoreAmbientViewTarget`,
`handlers/view-store.ts`), and the planning base sync (`handlers/base-sync-planning.ts`). The shared work-unit
resolution that the release wrappers, delivery, and review import, among others (`resolveActiveWu`,
`lib/release/wu-resolution.ts`), maps an unbound marker to its `ambiguous` result with a hint naming the exits, as it
maps a resolver warning today, so each importer keeps its policy for a checkout that resolves to no one work unit:
`arc release commit` and `arc release push` refuse it with the hint, delivery refuses it with its generic refusal
(`resolveDeliveryContext`, `handlers/delivery.ts`, as `active-work-unit-unresolved`), and the notes sync's work-unit
name (`resolveCurrentWuName`, `lib/user-sync/current-wu.ts`) falls back to the branch's slug, as for an ambiguous
checkout today. A reader that only reports takes it as a warning naming the exits, as listing readers show its work unit
as held there (§ 7.3): the active-meta candidate read behind `arc active status` (`readHeldCandidates`,
`lib/active/meta-reader.ts`), and the advisory notes reconcile's current-work-unit read
(`resolveReconcileCurrentWorkUnit`, `handlers/user.ts`), which then runs with no current work unit and warns in human
mode alone, since its `--json` envelope carries no warnings and is unchanged. The candidate read also feeds the local
review gate's live context (`readLocalReviewLiveContext`, `scripts/review-gate/hosts/local/live-context.ts`), which
drops its warnings, finds no work unit, and refuses `vehicle-unresolved` (`review-authority.ts`), as for an unresolved
checkout today. Neither that refusal nor delivery's names the exits, which is accepted: each fails closed, and the exits
print from `arc active status` and from every verb above that refuses. This replaces the by-name residue test, a marker
naming a work unit the store holds no record of (`missingRecord`, `marker-occupancy.ts`), which a reused slug defeats,
since the claim lookup returns its archived holder (`readClaimedWorkUnit`). A bound marker whose claim and lineage find
nothing keeps that test, with today's release admission and no rerun.

`arc locus release` admits an unbound marker, the unnamed form in the checkout it runs from and the named form where
§ 7.3 matches it, since releasing gives up a claim rather than using one, as `releaseAuthority` admits the by-name
residue today. A checkout of an ended holder whose marker predates the flip is unbound like any other: it takes no
teardown offer by UID, and is torn down before the flip, or released and removed by hand.

#### 7.5 Exits print the unnamed form

The exits that locate a checkout print the unnamed release form, run in that checkout, rather than a slug that may
resolve to another holder: the marker exits (`marker-occupancy.ts`), the stale-worktree sweep's release action
(`store-worktree-selection.ts`), the derived row's spawn-residue action (`lib/locus/derived-reader.ts`), and the
exclusivity refusal a crashed creation's retry prints (`createLocusPorts`, `lifecycle-ports.ts`).

### 8. An ended holder's cleanup

#### 8.1 Every cleanup exit resolves the ended holder by UID

Each exit that holds the ended holder's checkout or branch resolves the holder by its UID, a checkout's from its marker
through the claim arm (§ 1.4) and a branch's from its link through the `ref` arm (§ 1.3), and reads retirement evidence
by that reference (`readStoreRetirementEvidence`, `lib/work-unit/store-retirement-evidence.ts`), a retired origin's
lineage through the `lineage` arm, whose `origin` takes a UID (`LookupInputSchema`, `lib/store/lookup.ts`). The exits:

- the stale-worktree sweep (`selectStoreWorktreeCleanup`, `lib/session-init/store-worktree-selection.ts`, rendered in
  `stale-worktree-sweep.ts`), whose store-arm report for an ended checkout, branched or detached, carries a teardown
  naming the holder, in place of the marker's `wuName` (`inspectBranchedRemoval`);
- locus release's ended remedy (`releaseAuthority`, `lib/locus/release.ts`);
- marker occupancy's teardown remedies, for a retained lineage, a completed holder, and an Integrating one
  (`readWorkUnitOccupancy` and `workUnitMarkerExit`, `marker-occupancy.ts`, which materialize's refusal reuses);
- the work-unit husk exits, which follow the rule below: `inspectCheckoutMarker` (`marker-occupancy.ts`), the
  stale-worktree sweep's husk report (`inspectHuskRemoval` and `withHuskActions`, `stale-worktree-sweep.ts`), and the
  current-husk advisory (`resolveCurrentHuskAdvisory`, `lib/session-init/current-husk-advisory.ts`), the last two with
  session start's rendering of them (`session-init.template.md`);
- the missing-worktree check (`readStoreMissingFolderActions`, `lib/session-init/missing-worktree-store.ts`);
- the orphan advisory (`orphan-store-candidates.ts`, rendered in `orphan-branch-sweep.ts`), whose store-arm shipped
  report carries its teardown the same way;
- the retirement sweep (`hasAbandonment`, `lib/session-init/store-retirement-sweep.ts`);
- branch-gone recovery's teardown offer (`inferBranchGoneRecovery`, `lib/session-init/recommended-action.ts`, from the
  marker's work unit, `branch-gone-recovery.ts`), which holds no store and so names the derived row's UID where the row
  carries one, and otherwise its name, as an in-repo row carries none.

Each exit names the ended holder by slug only where the slug is not UUID-shaped and its lookup returns exactly that
holder, and by UID otherwise, a refused lookup included, through one helper. The helper uses the same UUID
classification as the command (§ 8.3), so a UUID-shaped display name always yields the holder's own UID. The store arm's
stale-worktree and orphan reports carry their teardown as `teardown` (`{ argv, text }`, the retirement report's shape),
the command the CLI composes, which session start offers where present (`session-init.template.md`). The in-repo arm's
reports carry none, so session start composes their offers from the report's fields as today (`git worktree remove
{worktreePath}`, `arc teardown {shippedWorkUnit}`), and the in-repo arm's offers stay unchanged. Session start gains a
rule for the store arm's ended detached report.

A husk never reaches the claim, and only the in-repo teardown stamps a work-unit husk (`runTeardown`,
`lib/work-unit/verbs/teardown.ts`; the store arm's `runStoreTeardown` stamps none), so every work-unit husk a store arm
reads predates the flip and carries no UID. Its stamp carries the in-repo arm's retirement evidence, which the store
teardown's husk selection never admits (`huskEvidenceMatches`, `store-retirement-husk.ts`): a `shipped` digest taken
over the completed artifact group (`readCompletedProjectionDigest`), where the store compares one over the record's
content (`readStoreRetirementEvidence`), and an abandon's `git-transition` evidence. Work-unit husks are therefore torn
down before the flip, as ended holders' pre-flip checkouts are (§ 7.4). From the flip, every work-unit husk exit reports
the husk for a manual decision with no teardown command, whatever its slug resolves to, as the sweep and the advisory
report a `manual-only` stamp:

- **The stamp.** In the store arm, every work-unit husk's stamp reads `manual-only`, whatever it decodes to, with a
  reason for a husk stamped before the flip, which the closed reason set gains (`decodeWorktreeHuskStamp`,
  `worktree-marker.ts`). The decoder takes the arm from its caller, in-repo by default, and the exits pass the store
  arm. The store teardown's `--husk` replay (`selectStoreRetirementHusk`) keeps the default decode: it admits only a
  stamp whose evidence matches the selected store version, which no shipped path writes, so it refuses every pre-flip
  husk as today.
- **The derived row.** The work-unit reduction (`readStoreCheckout`, `lib/locus/derived-evidence.ts`) keeps the husk
  fact before `projectMarker` drops it and returns before the claim with the terminal evidence it reads for a work unit
  with only lineage (`readRemovedWorkUnit`, `store-work-unit-evidence.ts`), so the row is `retired`, with a subject that
  carries no UID and no context. Session start orients from a `retired` entering row without selecting a work unit
  (`session-init.template.md`), so the current-husk advisory renders there, and its guidance names the path alone
  (`renderDerivedCleanup`, `session-guidance.ts`). `cleanupAuthorityRow` (`store-worktree-selection.ts`) admits the row,
  so the sweep reaches the husk, and the UID-keyed row readers never match it to a holder (§ 7.3).
- **The roster.** The store roster marks a husk's entry `retired`, as it marks a work unit with only lineage
  (`runStoreRoster`), so the husk is never counted in flight (`isInFlightWorkUnitRosterEntry`).
- **The sweep.** It pairs the stamp with a `blocked` decision carrying the same reason, as it pairs an
  `evidence-mismatch` stamp today (`inspectHuskRemoval`), and the template's primary-checkout sweep section, which
  offers a teardown only for a `removable` decision, maps the reason as manual cleanup.

The published advisory and sweep schemas carry both reason sets (`CurrentHuskAdvisorySchema`,
`lib/session-init/current-husk-advisory.ts`; `HuskCleanupDecisionSchema`, `stale-worktree-sweep-schema.ts`), which
`lib/session-envelope/registry.ts` and `commands/status/schema.ts` import, and change in place under the pre-public
compatibility posture.

A branch husk's subject is its `chore/<slug>` branch, which `arc teardown --branch` takes as an exact ref, with no slug
lookup, in either arm (`runBranchTeardown`), so slug reuse never reaches it, and its exits stay as they are but for
marker occupancy's (`inspectCheckoutMarker`), which prints `arc teardown --branch <ref>`, the form the command takes,
where it prints `arc teardown <branch>` today, which the slug operand rejects.

#### 8.2 Callers that hold their subject pass its reference

Only an operand a person types resolves as a slug. Abandon's and decomposition's teardown steps (`runStoreTeardown`,
from `lib/work-unit/verbs/abandon-store.ts` and `lib/decompose/retirement.ts`) pass the retired primary's reference,
whose lineage the `lineage` arm finds by UID, and their retry commands name that UID.

#### 8.3 `arc teardown <slug|uid>`

`arc teardown` takes `<slug|uid>`: a UUID-shaped operand selects that exact owner, and any other operand is a slug
resolved through the lookup. Each offer names its holder by slug only where the slug is not UUID-shaped and its lookup
returns exactly that holder, and by UID otherwise; the offer helper and the command use the same UUID classification.
Branch-gone recovery's offer, which holds no store, names the row's UID where the row carries one (§ 8.1). Teardown
carries its subject typed, a slug or an owner (`TeardownParams`), so abandon's and decomposition's owner (§ 8.2) and a
UID operand reach the evidence read and the retries alike; the in-repo arm takes every operand as a slug. No lookup arm
finds a primary by UID (`LookupInputSchema`), so a UUID operand scans the work-item listing for that owner's UID, as the
inbox's UUID selector does (`primaryByUid`, `lib/inbox/lists.ts`), and, where no primary carries it, asks the `lineage`
arm for a retired origin with that UID. The scan lowercases the operand, returns the primary carrying the UID with its
record kind, or none, refuses `ambiguous-match` where several carry it, as the inbox's does today, and refuses an
incomplete listing; the inbox calls it in place of its own, and each verb that shares the operand applies its own type
rule; teardown refuses an Errand's UID and a UID neither the scan nor the `lineage` arm finds. A UUID-shaped slug, which
`SlugSchema` admits, so selects by UID, and its holder stays reachable by its own UID. § 4.1's rule against a UID
subject guards against work proceeding on a clashed slug; teardown's subject has ended, so no work proceeds.

#### 8.4 Teardown finds its subject's checkout by UID

Teardown's holder lookup (`holdingCheckout`, `lib/work-unit/verbs/teardown-store.ts`, through `findHoldingCheckout`) and
its selection check (`readTeardownSelection`, a `TeardownContext` field whose logic, `classifyTeardownSelection` and
`subjectsEqual` in `lib/work-unit/teardown-selection.ts`, compares work-unit subjects by name today) match the evidence
owner's UID, so a teardown run by UID never takes the live holder's checkout for its subject's. `holdingCheckout`'s own
name-matching scan (`resolveLegacy`) serves only where no locus ports are bound, and from the flip it matches by UID
too. When teardown ran by UID, every retry it names carries the UID: its retry remedy (`teardownRetryRemedy`), the
lineage repair text (`store-retirement-evidence.ts`), and the `--husk` replay's retry (`store-retirement-husk.ts`).

#### 8.5 Teardown touches only a branch the retiring holder still owns

Before teardown returns a checkout to base or deletes a linked branch, it looks the branch up through the `ref` arm
(§ 1.3) by the link's repository and ref exactly. This covers the retiring link, before its checkout returns to base
(`prepareCreatedBranch`, `reapRetirementLinks`), and any other created link, before its zero-delta reap
(`reapZeroDeltaBranch`, in `reapAdditionalBranch`):

- **Proceed:** the lookup finds no record, as for an abandoned or decomposed holder, whose links move to its lineage
  (`retiredBranches`), or returns the subject or a completed holder.
- **Keep:** the lookup returns a live holder other than the subject, or refuses with `ambiguous-match` or another
  failure, as for two live holders' shared branch after a clash's rename. Teardown leaves the checkout, the local
  branch, and the remote alone and reports each, naming the holder by its UID. A link so kept never counts as the
  blocked cleanup that fails a teardown (`reapRetirementLinks`), and an adopted link a live holder links drops its
  owner-cleanup advice (`reportAdopted`), which would advise deleting that holder's branch.

A local branch so kept can be the ended holder's own: after a clash's rename both links name the old branch, and when
the renamed holder completes first its teardown keeps that branch, which the other holder's later rename on that machine
then takes as its own. Nothing is lost, and the rename reverses. This residual is accepted over reaping a branch the
subject's own checkout held, which needs that checkout observed before teardown retires it and its released files
returned to base, all on a destructive step.

#### 8.6 Teardown deletes a remote only at a tip it holds

Under `discard`, teardown deletes the remote branch only when the advertised tip is contained in this machine's local
branch for the retiring holder (`generation.localHead`, `selectRetiringLinks`), and otherwise keeps it and reports it,
as `landed` keeps a remote whose commits have not landed (`reapRetiringRemote`). On a machine without the local branch
this keeps and reports a remote that teardown deletes today. A kept remote keeps its tracking ref, and an advertised tip
whose object this machine lacks counts as not contained (`isContainedIn`).

The two halves gate differently because their evidence differs. A checkout ARC makes of the live holder on this machine
comes from this machine's store, so the `ref` arm sees that holder wherever ARC put its branch, and a link carries no
tip to compare. The remote can carry another machine's push before this machine pulls that holder's record, so only the
tip comparison is safe there. One case escapes both: a branch made by hand from a fetch this machine's store has not
pulled (`git switch feat/<slug>`), where the `ref` arm sees no live holder and the local branch matches the advertised
tip, so teardown deletes the live holder's push, since it pulls no store state (`runStoreTeardown`). The holder's own
machine keeps the branch and can push it again; the residual is accepted over a store pull inside teardown.

### 9. Interfaces other verbs consume

The rename change (§ 11) and the cutover build on these, and each is stable once this change lands:

- the view's whole listing under a clash (§ 2.2), the typed clash candidates (§ 4.1), and the former-name tie's
  treatment as a clash (§ 2.1, § 4);
- the clash repair builder (`clashRepair`, `lib/store/`), which returns one `Remedy`, with its preference order and its
  argv rule (§ 4.1);
- a cohort's membership read from every holder, by archive's cohort closeout at both its call sites and by the cohort
  consistency check (§ 2.3);
- the word check, the paired-spec owner check, and abandon's impact plan taking any `ambiguous-match` as an answer, so
  no tie the lookup refuses blocks an unrelated work unit's activation, reconcile, publish, rename, or abandon (§ 4.2);
- re-reading a held record by reference, `acquireLifecycleRecords` taking the owner's reference (§ 3.2);
- the reference backend's cohort ranking (§ 1.1), the completed tie-break beneath it (§ 1.2), and the tie's facts on its
  refusal (§ 1.5);
- the admission check (§ 6.1) and the edge settler (§ 6.4), each in `lib/store/`;
- the UID-bearing marker and claim, holder matching by UID, and `renamedMarker` keeping the UID (§ 7);
- the reconcile's resolution rows, and its rule for an edge whose name resolves to a cohort, an Errand, or a tie (§ 5.2,
  § 5.3);
- the ranked `ref` arm and its refusal of a live tie (§ 1.3);
- teardown's `<slug|uid>` operand (§ 8.3) and its branch gate (§ 8.5);
- the unbound marker and its exits (§ 7.4), and the flip step they leave the cutover: before the flip, tear down ended
  holders' checkouts and work-unit husks (§ 8.1); after it, bind or release each remaining checkout's marker.

### 10. Boundary and order

#### 10.1 One work unit

The boundary read keeps the change whole (`stays one WU`). Its concern is one: a slug with several holders breaks the
store arms' one-holder assumption wherever a reader starts from a name, in lifecycle's view and verbs (§ 2–§ 6), the
checkout claim (§ 7), the branch-link lookup (§ 1.3), the lookup's completed tie (§ 1.2), and an ended holder's cleanup
(§ 8) alike. The pieces sit in different subsystems but are coupled by need: the lifecycle executors consult marker
exclusivity and holder lookup, so the verbs under reuse need § 7, and the admission check is sound only with UID
matching. No delivery plan: the ref backend's lookup changes land last, after the ref backend does, and review chunks
as usual. Landing the selection early serves no consumer, since the rename change waits on the ref backend too.

#### 10.2 Order

The ref backend's lookup changes, § 1.2's slug candidates (`slugCandidates`), § 1.3's `ref` arm (`lookupCandidates`),
§ 1.4's claim arm (`claimLookupCandidates`), and § 1.5's tie facts in the slug and `ref` arms, implement after the ref
backend lands on `main`, an ordering this specification records rather than a dependency edge. § 1's conformance
assertions land with those changes, since the shared suite runs over every registered backend and would fail the ref
backend before them; until then, tests over the reference backend alone pin each rule. The one existing assertion § 1
changes, the work-unit claim's (`checkout-work-unit-claim`), sends the owner's UID once § 1.4 lands in the reference
backend, since the suite already runs it there; the ref backend's claim arm ignores the field until its own change.
Every other change implements now and edits the reference backend and the shared code on `main` without imposing a
change on the ref backend's branch. That branch touches these files this design reaches, each in a small, mechanical
way: `lib/store/lifecycle-rename.ts`, `lib/work-unit/verbs/archive-store.ts`, `suite-lookup.ts`,
`handlers/status/lifecycle.ts`, `lib/store/in-repo/lookup.ts`, `lib/work-unit/verbs/rename-store.ts`,
`lib/errand/promote-store-runtime.ts`, `handlers/status/store-locus.ts`, `lib/handoff/write.ts`, `cli.ts` and
`lib/cli-help-summaries.ts`, which teardown's operand reaches (§ 8.3), and `lib/store/refusal.ts`, where it reorders
`LocalRefusalSchema`'s members beside the one § 1.5 extends; among the tests, under `__tests__/unit/`,
`lib/store/envelopes.test.ts`'s refusal cases and `status/store-project-input.test.ts`'s imports; and, among the tests
whose work-unit marker, subject, and holder fixtures the Testing bullet reaches, under `__tests__/unit/`,
`git/worktree-roster-store.test.ts`, `locus/derived-store-evidence.test.ts`, `locus/store-work-unit-terminal.test.ts`,
`locus/derived-task-conflicts.test.ts`, `release/wu-resolution-store.test.ts`,
`session-init/stale-worktree-store.test.ts`, `session-init/store-retirement-sweep.test.ts`,
`session-init/paused-work-store.test.ts`, and `lib/decompose/atomic-admission.test.ts`, and under
`__tests__/integration/`, `handoff-write-store.test.ts`, `recovery-state-basis.test.ts`, and
`status-store-refresh-cli.test.ts`.

This change lands before the rename change, which rebases onto § 2's selection.

### 11. Expected contracts

This design consumes behavior two other changes build. Each is an expected contract, available when its change lands.

- **The ref backend** (the change that stores state in `refs/arc/*`, after which § 1's ref-backend edits land):
    - its slug ranking (`rankNameTrees`, `lib/store/ref/lookup-primary.ts`) tiers work-item and cohort trees as
      § Introduction states, an archived tree marked by its `liveRef`;
    - each archived lookup tree carries its folder's placement, quarter and sequence (`RefLookupTree.archived`,
      `lib/store/ref/lookup.ts`, decoded by `folderPlacement` in `archive-read.ts`), and the backend already orders one
      owner's archived folders by later quarter, then higher sequence (`latestArchivedFolders`);
    - its lookup trees include the latest archived folder of each completed owner (`readLookupTrees`,
      `lib/store/ref/lookup-trees.ts`);
    - its claim arm (`claimLookupCandidates`, `lib/store/ref/lookup-claims.ts`) and `ref` arm (`lookupCandidates`,
      `lib/store/ref/lookup.ts`) match by slug and by branch link today, as the reference backend's do;
    - it refuses a write that gives two live primaries one slug, a work item and a cohort included
      (`checkLiveNamespace`, `lib/store/ref/namespace-admission.ts`).
- **The rename change** (the change that adds `arc rename <slug|uid> <new-slug>` and cohort rename, landing after this
  one):
    - its operand rule, which `arc teardown` shares (§ 8.3): a UUID-shaped operand selects that exact owner, and any
      other operand is a slug resolved through the slug lookup (`readStoreRenameSubject`);
    - `arc rename <uid> <new-slug>`, which § 4.1's refusal names as the repair for a cohort holder, or for a work unit
      in a clash among work units, and `arc errand close <slug|uid>` by the same operand rule, the UID selecting one
      Errand's `work-item/record`, which it names for an Errand holder; until that change lands, the repair names
      operands those verbs do not yet accept, and both changes land before the flip.

## Alternatives & Rationale

- **Read a tie's kind from the operand.** Rejected. A `RecordReference` carries no placement, so a renderer holding the
  operand still cannot tell a completed tie from a live clash, and every refusing site would have to pass the operand
  through its renderer. The lookup already computes the tier it refuses in (§ 1.5).
- **Leave a completed tie that includes an Errand refusing, and repair a work unit's clash with an Errand by renaming
  the work unit.** Rejected. Closing the Errand would then leave the slug refusing for every reader once both holders
  complete, and renaming the work unit leaves its former name resolving to the Errand, which refuses the personal notes
  reconcile for every person (§ 4.2). Ordering by holder type needs no sequence (§ 1.2).

- **Re-key `LifecycleIndex` by UID.** Rejected. The identity-keyed layer already exists (`IdentityLifecycleIndex`), and
  the slug-keyed index exists because every question into it starts from a slug: a CLI operand, a `Depends On` edge, a
  word in an artifact. Re-keying would push the slug-to-holder step into each caller, one rule copied across the 21
  files that reference the type, and would rework the in-repo arm (`buildLifecycleIndex`) that the cutover deletes.
  Identity-keyed reads arrive per consumer as edges gain UIDs, and move to `IdentityLifecycleIndex.get` then; § 2 does
  not obstruct that.
- **Accept a UID subject for every lifecycle verb.** Rejected: a UID-addressed `activate` or `archive` lets work proceed
  on a slug that stays clashed. Teardown alone takes one, since its subject has ended (§ 8.3).
- **Create from a completed position.** Rejected: it changes the transition table the in-repo arm shares. Creation takes
  position `null` when the admission check passes instead (§ 6.2).
- **Decide an edge from the standing holder, looking up only one it would discharge.** Rejected. It saves a lookup per
  live edge but splits one decision between the view, which lists work units alone, and the lookup, which ranks every
  holder type, so each pairing of holder types needs its own rule. A lookup per name costs little beside the listing the
  reconcile already reads (§ 5.2).
- **Keep a state per slug, or a state machine over its holders.** Rejected. What a slug resolves to is a function of its
  holders' records, which the lookup computes; a stored state would be a second authority over those records, and two
  machines could each write one, which is how a clash arises. § 5.2's rows state the function once.
- **Stop following a renamed work unit.** Rejected: edges would keep stale former names, and following loses nothing.
  The write rules keep a followed current name from reuse while an open dependent's edge names it (`checkSlugEdges`), as
  they keep a former name the lookup returns for another holder (`checkFormerSlug`), and the follow never writes a name
  that does not resolve back to its work unit (§ 5.2).
- **Admit through the standing selection.** Rejected: the selection lists metas only and misses a live cohort or Errand
  holding the slug. The admission check asks the lookup, which ranks every holder type (§ 6.1).
- **Admit a slug the lookup returns as a completed holder's former name.** Rejected: a former slug resolves to its own
  work item alone, the rule `work-item.former-slug` enforces, and the write would refuse.
- **Narrow reuse to one generation per slug and leave the completed tie to the lookup's owner.** Rejected: every reused
  slug becomes unresolvable once its reuse completes. **Relax the write rules to admit a completed tie** instead:
  rejected, since the lookup would still refuse.
- **Rank the claim arm as § 2 ranks, refusing reuse while a local checkout still claims the slug.** Rejected. It needs
  no marker change, but nothing catches another machine's case. A checkout there of the archived holder resolves to the
  live holder after a pull, and the topology check cannot refuse it: a record with no branch link expects no topology
  (`readStoreWorkUnitEvidence`), store-arm spawns are detached (`runCreateNew`), a planning work unit holds no branch,
  and a feature branch's name comes from the slug. That checkout then stops reading ended, losing its husk and teardown
  offer, and the claim decides cleanup authority (`selectCheckout` reads ended from it), a destructive path, which is
  where exactness belongs.
- **Create the record before the claim.** Rejected. It leaves no UID-less marker, but reverses the record-last creation
  order: a failed creation would leave a live record with no checkout, in the store and shared on push, where the
  stamp's residue stays in one checkout.
- **Let the caller mint the UID.** Rejected: the store backend mints a record's UID at creation.
- **Keep a slug fallback for UID-less claims from the flip.** Rejected: it keeps the ranked-claim alternative alive as a
  second path for development-only state, which the pre-public posture regenerates instead of reading compatibly.
- **A standing re-stamp command, with a `pending` state marking a creation's marker.** Rejected. The command would bind
  each marker written before the flip where the store holds one record of its name, and the `pending` state would keep
  it from binding a crashed creation's leftover. Together they are a data migration of machine-local development state,
  which the pre-public posture regenerates instead, and they change the marker's invariant and its readers. They bought
  one command per machine over one bind per checkout at a one-time flip, and a teardown offer by UID for a pre-flip
  checkout of an ended holder, which is torn down before the flip or released instead (§ 7.4).
- **Backfill a marker's UID on the first store-backed read.** Rejected: it is the compatibility reader the pre-public
  posture regenerates instead; a person binds each unbound marker through materialize or releases it (§ 7.4).
- **Retire branch links at archive.** Rejected: it changes archive's record writes and loses which branch shipped a
  work unit. **Leave the `ref` arm's ranking to a later change**: rejected, since every reuse's branch would read
  unavailable until one acts.
- **Refuse reuse while a local checkout of the completed holder lingers.** Rejected: it misses another machine's
  checkout after a pull, as the ranked claim does.
- **Tear down only from the checkout or its offer.** Rejected: a missing worktree's registration has no checkout to run
  from.
- **Gate the remote on another holder being visible in this machine's store.** Rejected: it deletes a push that store
  has not yet pulled. The tip comparison (§ 8.6) needs no store state.
- **Reap a kept local branch the subject's own checkout held (§ 8.5).** Rejected for its cost: that checkout would have
  to be observed before teardown retires it and its released files returned to base, all on a destructive step, to
  recover a branch nothing loses.
- **Pull store state inside teardown (§ 8.6).** Rejected: teardown stays a local operation; the holder's own machine
  keeps its branch.
- **Split the change, extracting the claim and cleanup work.** Rejected: the lifecycle executors consult marker
  exclusivity and holder lookup, so the verbs under reuse need the UID claim, and the admission check is sound only with
  UID matching (§ 10.1).

## Cross-cutting Considerations

- **Trust and destructive paths.** Exactness concentrates where failure destroys work: teardown takes its subject by
  UID, touches only a branch the retiring holder still owns, and deletes a remote only at a tip this machine holds;
  cleanup authority comes from claims matched by UID; discharge, the destructive step of the dependency reconcile,
  decides by the reference of the work unit the lookup resolves; and creation fails closed on every lookup refusal but
  not-found. Three residuals are accepted and stated: the kept local branch (§ 8.5), the hand-made branch whose push
  teardown deletes (§ 8.6), and the former slug a higher-ranked completed holder hides from the write rule (§ 6.1).
- **Performance.** The selection is one pass over the listing a view read already makes, as status pays today. The store
  arm's reconcile makes one slug lookup per name an edge meets, where it reads the index first today, and a lineage
  target with a UID reads its entry from the view it already holds; creation adds the admission lookup, which start
  already makes, and the settler's listing inside its create batch; teardown adds one `ref` lookup per branch it would
  touch. Holder matching keeps its one marker scan.
- **Testing.** The lookup's rules (§ 1) are pinned by tests over the reference backend alone until the ref backend's
  lookup changes land, then by conformance assertions every store-arm backend runs (§ 10.2), but for a live slug-arm tie
  and a cohort's ranking under a former name, which public writes cannot build on both backends and each backend's own
  tests pin instead. The reference backend refuses a live clash between holders of one owner type at a write
  (`indexIdentities`, `__tests__/helpers/store/identities.ts`, keyed by owner type and name) and admits a live work item
  and a live cohort on one slug, which the ref backend refuses (§ 11). So clash cases among work items run over a store
  double whose listing and lookup hold both live holders, as status's clash test does
  (`store-project-standing.test.ts`); a live tie of a work item and a cohort, reuse, and cohort cases run over the
  reference backend directly, a cohort's former name planted on its record (§ 1.1). Each recoverable refusal is tested
  with its successful continuation after repair: an unbound marker, an interrupted creation's and one written before the
  flip, with each of its exits, and a clash and the rename or Errand close that repairs it, written directly to the
  store until the rename change lands. A store-arm fixture that writes a work-unit marker, builds a derived row's
  work-unit subject, or sends a work-unit claim carries the owner's UID, as § 1.4, § 7.3, and § 7.4 require, and one
  that means an unbound marker leaves it out. A fixture that stubs a holder port by slug matches by the UID the port now
  receives. Among the status handler tests (`__tests__/unit/handlers/status/`), these fixtures change:
  `checkout-roster.test.ts`'s marker, whose planning row § 7.4 would otherwise refuse;
  `store-derived-position.test.ts`'s row, which `selectWorkUnitRow` matches by UID (§ 7.3); and
  `store-session-ref-failure.test.ts`'s claim lookup, which § 1.4 resolves to nothing without one, and its holder stub
  (`findHoldingCheckout`), keyed by slug, which paused work calls by the entry's UID (§ 2.4). Status's output-pinning
  tests pass unchanged but for the selection's import path: `store-project-standing.test.ts`,
  `store-project-dependencies.test.ts`, `store-project-dependencies-errand-reuse.test.ts`,
  `store-project-records.test.ts`, `store-project-input.test.ts`, `store-user-ready.test.ts` (`__tests__/unit/status/`),
  and the other status handler tests. The planner's in-repo tests (`discharge-dep-edges.test.ts`) pass unchanged; the
  store arm's reconcile tests (`store-reconcile-context.test.ts`) change where they pin the disposition query's lookup,
  which moves into the resolution (§ 5.2). The one exception is `store-project-standing.test.ts`'s warning assertions,
  which move to status's rendering of the clash facts, with today's text. The in-repo arm's tests pass unchanged.
- **Migration and rollout.** Everything is dark until the flip. Records already carry UIDs, so no store data migrates.
  The marker's work-unit subject, the derived row's, the store refusal's `tie` (§ 1.5), the lifecycle refusal's
  `refusal` (§ 4.1), the reconcile component's `held` list (§ 5.2), the husk stamp's and sweep decision's reason sets,
  and the store arm's stale-worktree and orphan reports' `teardown` (§ 8.1) change in place under the pre-public
  compatibility posture, with no compatibility reader or migration. A marker written before the flip is unbound: the
  readers that act on its claim and acting holder matching refuse it, naming each holder of its slug and its exits; the
  consumers that keep their own policy for an unresolved checkout keep it, the release wrappers refusing with the exits,
  delivery and the local review gate with their generic refusal, and the notes sync using the branch's slug; the readers
  that only report warn, naming the exits; listing readers show its work unit as held there; and a person binds it with
  `arc materialize <slug> --here` or releases it (§ 7.3, § 7.4). The cutover's flip step follows (§ 9): it tears down
  ended holders' checkouts and work-unit husks before the flip, since neither takes a teardown after it, and binds or
  releases each remaining checkout's marker after the import. The ref backend's lookup edits land after the ref backend
  (§ 10.2).
- **User-facing impact, from the flip.** Every lifecycle verb acts on a reused slug's live holder. A clash refuses,
  naming each holder and the repair, typed under `--json` where the verb takes it. A dependency edge on a tied name, or
  on one a cohort or an Errand holds with no lineage disposition, is held rather than refused: `arc wu reconcile` lists
  it with its holders, and session start surfaces it. `arc stub` and `arc start --new` admit a completed work unit's
  slug and refuse a completed Errand's or cohort's slug and a completed holder's former slug, each with its remedy. `arc
  teardown` takes a UID, and keeps and reports a branch or remote it no longer owns or cannot prove. A work-unit husk
  reports a manual decision with no teardown command, and its `manual-only` reason appears in `arc status --json` and
  the session-start envelope. The release exits print `arc locus release`, run in the checkout they name. A checkout
  whose marker carries no UID refuses the verbs that act on its work unit, naming each holder of its slug and its exits:
  `arc materialize <slug> --here`, the cold start's rerun, or `arc locus release`. `arc release commit` and `arc release
  push` refuse with the exits, delivery and the local review gate with their generic refusal, and the notes sync uses
  the branch's slug; `arc active status` and `arc user reconcile-references` run with a warning naming the exits. The
  derived row's work-unit subject carries `uid` in `arc locus --json` and the session-start envelope.

## Success Criteria

Each holds over the reference backend, and over the ref backend once it lands (§ 10.2).

1. **Verbs act on the live holder.** With a completed and a live holder of one slug, every lifecycle verb's store arm
   acts on the live holder: `arc activate` succeeds where it now rejects "is not a Planning work unit held in active
   placement", and a former slug typed as the operand acts on its live holder.
2. **Edges under reuse.** The dependency reconcile resolves each name an edge meets once and decides by reference: an
   edge naming the reused slug classifies against the live holder and is not discharged; an edge on a completed work
   unit's former name is discharged, with no self-dependency, where the dependent has taken that work unit's current
   name; an edge on a live work unit's former name takes its current name only where that name's lookup returns the same
   work unit, and is held otherwise; and a decomposed origin's replacement target that carries a UID resolves to that
   work unit under its current name.
3. **Creation admits reuse within the write rules.** `arc stub`, `arc start <name> --new`, spawned and `--here`, the
   nameless cold start, decomposition's work-item names, and Errand promotion admit a slug whose holders are all
   completed work units under it as their current name, a third generation included, or a completed work unit and a
   completed Errand, and refuse a slug a live record holds, a completed Errand's or cohort's slug, and a slug the lookup
   returns as a completed holder's former name, each with § 6.5's remedy. A new cohort refuses a completed work unit's
   slug.
4. **Settling.** Creating onto a completed holder's slug settles a stub's edge naming it in the same batch, and an
   in-flight dependent's edge refuses through `work-item.slug-edges` with its remedy.
5. **The lookup.** § 1's rules hold, pinned as § 1 states and § 10.2 orders: a cohort-held slug resolves to the cohort,
   and each reader that requires a work unit reports it as one; a completed tie that includes a work unit resolves to
   its latest archived work unit, above a completed Errand, while a live tie and a completed tie that includes a cohort
   or holds only Errands refuse, each refusal naming its tie's tier; the `ref` arm resolves a reused slug's branch to
   its live holder; and a work-unit claim resolves each holder by its own UID and nothing without one.
6. **One selection.** Lifecycle's view, status, and every slug-keyed map in § 2.4 take the standing holder: completed
   evidence omits a slug with a live holder, so the free primary gains no Candidate authority over that slug and a
   husk stamped for it reports no completed work unit; the lifecycle snapshot reads each holder's artifacts at its own
   path; paused work offers the clash repair alone for a paused holder of a slug the selection reports as a clash,
   whatever the other holder's state, review-due ones included; and the cohort consistency check counts each holder of a
   clash in its own cohort.
7. **Session start under reuse.** With a bound checkout or a husk of the archived holder on the same machine, it
   resolves the live holder's checkout through its UID-bearing claim and its branch through the ranked `ref` arm, and
   offers no branch cleanup while a live work unit links the branch; the duplicate-marker guard leaves the live holder's
   checkout resolved, and the in-flight projection, status's slug position, and branch ownership each read the live
   holder's checkout alone.
8. **An ended holder's cleanup.** A bound checkout of the archived holder still reads ended, session start offers its
   teardown by UID, and it tears down through its UID, leaving the live holder's checkout, local branch, and remote
   branch in place; a work-unit husk reports a manual decision at every exit, session start's primary-checkout sweep and
   its own checkout included, offers no command naming its slug, and never reads as holding that slug;
   `arc teardown --branch` still removes a branch husk; an abandoned holder's teardown still reaps its own branches;
   `arc teardown <uid>` resolves a retired origin through its lineage; and under `discard` teardown keeps and reports a
   remote whose advertised tip its local branch does not contain.
9. **Clash.** With two live holders, a verb naming the slug, or run without one in either holder's checkout, refuses
   `ambiguous-match` carrying both holders as typed references in its text refusal, and through `--json` where the verb
   takes it, whichever site meets the clash first (§ 4.1) and naming the preferred move for its holders' types, but for
   a reconcile in either holder's checkout, without an operand or naming its holder's current name, which runs; an edge
   naming it is held unsatisfied with both holders, never discharged, a tie between an Integrating work unit and a
   cohort or Errand included, and so, under its own name, is an edge that a follow or a lineage disposition would move
   onto the slug; a dependent naming it and an unrelated work unit both activate; the last other open member of a cohort
   holding both still archives; and status reports the `slug-clash` warning as today. With two live holders that each
   hold the slug only as a former name, a verb naming it refuses with each holder's current name as the repair, and a
   work unit whose records mention the slug and a dependent whose edge names it both activate, the edge held with a
   diagnostic. A work unit whose records mention a tied slug, as a word or in a paired spec's filename, activates,
   reconciles, and publishes, whether the tie is a clash, a live tie among Errands or cohorts, or a completed tie that
   § 1.2 leaves refusing; a rename runs while another record mentions a clashed slug's paired spec; and an unrelated
   work unit abandons while an Integrating work unit's held edge names a tied slug. After the preferred repair, the slug
   never ties again and no work unit keeps it as a former name, both holders completed included: a work unit and a
   cohort clashed, once the cohort is renamed; a work unit and an Errand clashed, once the Errand is closed.
10. **Cohort edges.** An edge on a name the lookup resolves to a cohort, under its current or a former name, or to a tie
    among cohorts and Errands alone, is held unsatisfied, never discharged, and its dependent activates, unless a
    retired origin's lineage under that name settles it first, as a drop or a replace; one the lookup ties between a
    cohort and a work unit is held with the clash diagnostic, and its dependent activates.
11. **Unbound markers.** A work-unit marker without a UID, written before the flip or left by a creation interrupted
    between its claim and its stamp, refuses the readers that act on its claim and acting holder matching, naming each
    holder of its slug and the exits its marker and slug select; `arc release commit` and `arc release push` refuse with
    the exits, delivery and the local review gate refuse with their generic refusal, and the notes sync uses the
    branch's slug; `arc active status` and `arc user reconcile-references` run with a warning naming the exits, the
    latter with no current work unit; and listing readers show its work unit as held there.
    `arc materialize <slug> --here` binds it to a live holder materialize admits, even while another owned work unit's
    checkout is unbound too; the cold start's rerun admits an anchored one whose slug has no record or lineage; and
    `arc locus release` from its checkout frees any; each then succeeds. `arc locus release <slug>` frees the one
    unbound marker naming a slug from any checkout unless materialize admits the slug's live holder, and refuses, naming
    the unnamed form, where it does or where the slug's lookup refuses. A creation's leftover blocks its retry until one
    of them runs. Each exit that locates a checkout prints `arc locus release` to run in that checkout rather than a
    slug.
12. **Nothing else moves.** Status's output-pinning tests and the in-repo arm's tests pass unchanged but for the
    selection's import path, the standing test's warning assertions, which move to status's rendering, and the status
    handler fixtures the Testing bullet names (§ Cross-cutting Considerations).

## Open Questions

None blocks starting. Module and field names inside `lib/store/` for the selection, the admission check, and the
settler are implementation detail; § 7.3 fixes the request `LocusPorts` takes.

## Amendments

None.

---
