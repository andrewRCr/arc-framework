# Draft: lifecycle-slug-selection

**Purpose:** Make lifecycle verb subject and dependency selection agree with canonical slug lookup under reuse and
clashes, and make a work-unit checkout claim name its holder by UID.

- **Origin:** [internal] — inbox routing, 2026-10-19; original capture provenance is retained below.
- **Purpose amended:** 2026-10-22, at the re-entry's boundary read, to take in the checkout claim (D8), which the
  lifecycle verbs need under reuse; Owner-confirmed.
- **Planning posture:** `P1`; `Heavy`. Draft-design at `high` depth since the 2026-10-22 re-entry; readiness in
  § Planning continuity.

---

## Problem / Motivation

From the flip a slug can have several holders, each its own identity-keyed lifecycle entry (`listLifecycleIndex`,
`lib/store/lifecycle-index.ts`, keys entries by `identityKey`): a completed work unit and a new one reusing its slug
(the storage contract's D2, "reusable once its record completes"), or two live ones after a clash between machines
(D14, "a rename resolves it").

The store's slug lookup ranks holders, and both backends rank alike: live under its current name, then live under a
former name, then archived under its current name, then archived under a former name; a tie refuses `ambiguous-match`
(`preferredSlugRecords`, `__tests__/helpers/store/lookup.ts`; `rankNameTrees`, `lib/store/ref/lookup-primary.ts` on
`feat/storage-ref-backend`, where an archived folder's tree carries `liveRef`). Every verb's subject comes through
that lookup (`readWorkUnit`, `lib/store/lifecycle-write.ts`).

Lifecycle's view does not rank. `readLifecycleView` (`lib/store/lifecycle-view.ts`) builds its slug-keyed index with
`buildLifecycleIndexFromRecords` (`lib/work-unit/lifecycle-index.ts`), where the last entry listed for a slug wins, and
the verbs pick their own entry from `entries` by name, where the first listed wins. Over the reference backend, which
lists in insertion order, the two disagree with the lookup and with each other, and the store arms' other readers that
start from a name assume one holder too:

- **Subject entry by name.** `agreesWithInventory` and `resumeStoreTransitionFinalization`
  (`lib/work-unit/lifecycle-store-executor.ts`), `readLifecyclePrimary` and `readOtherPrimaries`
  (`lib/work-unit/verbs/activate-deactivate-store.ts`), `lib/work-unit/verbs/abandon-store.ts`,
  `handlers/abandon-store.ts`, `startedPlanningReason` (`handlers/start-store.ts`), `graduate`
  (`commands/start-store.ts`), and `materialize-store.ts`. `arc activate` of a reused slug pairs the live primary from
  `readWorkUnit` with the first-listed completed holder's entry (`readLifecyclePrimary`) and rejects "is not a
  Planning work unit held in active placement" on that entry's fields, before the executor's `agreesWithInventory`
  check is reached. `readOtherPrimaries` filters other primaries by name, so a completed namesake drops out of
  activation's comparison.
- **Re-reads by name.** Group acquisition takes a slug and resolves it again (`acquireLifecycleRecords`,
  `lib/work-unit/prepared-lifecycle-write.ts`, through `readWorkUnit`), so a caller that already holds a record ranks
  its name again: rename's own and backlog groups (`acquireRenameGroups`, `lib/store/lifecycle-rename.ts`), where a
  backlog clash blocks every rename, the UID rename that repairs it among them, and decomposition's acquisitions of a
  record it holds (`conservation.ts`, `acquire-origin.ts`, `discard-plan.ts`, and `acquire-terminal-targets.ts`,
  `lib/decompose/`).
- **Position by slug.** `executeStoreTransition` resolves the transition edge from `resolveSlugPosition(index, slug)`
  (`lib/work-unit/lifecycle-resolver.ts`), so a reused slug can take the completed holder's position.
- **Dependency edges.** The dependency reconcile classifies each `Depends On` edge with `resolveSlugState(input.index,
  edge)` (`planDependencyReconcile`, `lib/work-unit/side-effects/discharge-dep-edges.ts`). An edge naming a reused slug
  reads the last-listed holder: if the completed one lists last, the edge reads `shipped` and is discharged though the
  live work unit reusing the slug has not shipped. An edge naming a slug whose live holder is a cohort, while a
  completed work unit holds it too, reads `shipped` from the work unit, though status, which asks the lookup, reports it
  unsatisfied over the ref backend, whose ranking admits the cohort (`found`,
  `lib/status/store-project-dependencies.ts`).
- **Creation.** `arc start --new` refuses any slug the index holds (`resolveStartDispatch`, `commands/start.ts`:
  `options.create === true && state !== "nonexistent"`), after `resolveStartName` (`handlers/start-store.ts`) has
  refused every lookup result but not-found and rewritten a former slug to its holder's current name, and `arc stub`
  reaches the executor's create edge, which requires a nonexistent position (`runStub`, `lib/work-unit/verbs/stub.ts`),
  so neither admits the reuse D2 allows. Decomposition admits a work-item name only when the lookup's top-ranked holder
  is completed under that name (`checkNamespaceName`, `lib/decompose/check-names.ts`), as the store's write rules do,
  but it lets a new cohort take a completed work unit's slug. No creating verb settles the edges naming a reused slug,
  though shipped design commits every creating and renaming verb to it from the move onto the store
  (`spec-seam-record-kinds.md` § 5.3).
- **Completed ties.** Once a reused slug's second holder completes, both backends rank its two completed holders alike
  (`preferredSlugRecords`; `rankNameTrees`), so every lookup of the slug refuses `ambiguous-match`, and the store's
  write rules then refuse the slug to every later creation (`checkFormerSlug`,
  `lib/store/kinds/work-item/former-slug.ts`; `priorTarget`, `lib/store/kinds/work-item/slug-edges.ts`). Reuse would
  leave a slug no reader can resolve; decomposition, which admits a completed holder's slug, reaches it today.
- **Clashes.** Under a clash the store reconcile's word check (`artifactAliasTransitions`,
  `lib/work-unit/store-reconcile-context.ts`) skips any slug the index holds. Were the index to drop the clashed slug,
  the check would look it up, the lookup would refuse `ambiguous-match`, and the refusal would block activation. A
  dependent whose own edge names the clashed slug reaches the retired-edge query (`resolveRetiredEdge`,
  `planDependencyReconcile`), which maps `ambiguous-match` to `namespace-corrupt` (`store-reconcile-context.ts`) and
  rejects the dependent's activation with no remedy.
- **Cohorts.** D14 puts work items and cohorts in one namespace. The ref backend's ranking admits cohort trees
  (`rankNameTrees`); the reference backend's admits only work-item primaries (`preferredSlugRecords`). When the lookup
  returns a cohort document, `readWorkUnit` misreports it: "resolves to an Errand rather than a work unit". This
  repository holds a live instance: `decompose-transform-integrity` is a completed work unit and a live cohort.
- **Checkout claims.** A checkout claim `{ kind: "work-unit", slug }` matches every primary named by the slug in both
  backends (`lookupReference`'s `claim` arm, `__tests__/helpers/store/lookup.ts`; `claimLookupCandidates`,
  `lib/store/ref/lookup-claims.ts` on `feat/storage-ref-backend`), and the ref backend's lookup trees include the
  latest archived folders (`readLookupTrees`, `lib/store/ref/lookup-trees.ts`). So a reused slug's claim matches the
  archived and the live holder and refuses `ambiguous-match`, and every reader that resolves a checkout's work unit
  through the claim fails for it: seven name a work-unit claim directly (`current-work-unit-marker.ts`,
  `marker-occupancy.ts`, `lifecycle-ports.ts`, `store-work-unit-evidence.ts`, `store-worktree-selection.ts`,
  `worktree-roster.ts`, and `store-overlap.ts`'s `callerIdentity`); `store-identities.ts` returns before the claim
  for a work-unit subject. A husk-stamped checkout never reaches the claim (`selectCheckout`, `lifecycle-ports.ts`,
  and `marker-occupancy.ts` return first when `marker.husk` is set); a checkout of the archived holder not yet
  stamped as a husk does. Marker exclusivity and holder lookup match the marker's name (`checkMarkerExclusivity` and
  `findHoldingCheckout`, `lib/locus/lifecycle-ports.ts`; `findWorkUnitHoldingCheckout`; the roster's subject key;
  `workUnitLocation`, `lib/git/in-flight-store.ts`; `readStoreOccupancy`), so a lingering checkout of the archived
  holder makes creation and materialize refuse, and makes rename, pause, and decompose of the live holder throw.
- **Cleanup of an ended holder.** Teardown reads its subject by name (`readStoreRetirementEvidence`,
  `lib/work-unit/store-retirement-evidence.ts`, through `readWorkUnit`), so under reuse it reaches the live holder and
  refuses that the work unit "has not ended", and every offer to tear down the archived holder's checkout or branch
  names that slug. The retirement sweep's `hasAbandonment` (`lib/session-init/store-retirement-sweep.ts`) reads the same
  way, finds the live holder, and never reports an abandoned origin's checkout. Abandon and decomposition remove the
  retiring primary in their batch and then tear down by slug (`runStoreTeardown`,
  `lib/work-unit/verbs/abandon-store.ts`, `lib/decompose/retirement.ts`), so under reuse the slug resolves to the
  completed namesake: teardown reads that holder's evidence and applies its `landed` rule, removing the retired holder's
  checkout, which it finds by name (`holdingCheckout`), but keeping that holder's unmerged branch and its push
  (`assessReapSafety`, `reapRetiringRemote`), which the abandonment's `discard` would reap, and reports success. Their
  retry commands name the slug, as branch-gone recovery's offer names the marker's (`wuName`,
  `lib/session-init/branch-gone-recovery.ts`). And both holders of a reused slug link `feat/<slug>`, while teardown
  reaps by branch name (`lib/work-unit/verbs/teardown-store.ts`): it returns any clean checkout holding the branch to
  base before deleting it (`prepareCreatedBranch`, `returnRetiringCheckout`), deletes the local branch under `discard`
  with no safety check, since `assessReapSafety` runs under `landed` only (`reapRetiringBranch`), and deletes the remote
  under `discard` at whatever tip `git ls-remote` advertises (`reapRetiringRemote`). Tearing down the ended holder can
  so take the live holder's checkout off its branch, delete that branch, and delete its push.
- **Branch links.** Completed records keep their branch links, and both backends' `ref` arm matches every primary
  that links a branch, live or archived, with no ranking (`lookupReference`'s `ref` case; `lookupCandidates`,
  `lib/store/ref/lookup.ts` on `feat/storage-ref-backend`), so a reused slug's `feat/<slug>` refuses
  `ambiguous-match` for each session-init reader that looks a branch up: the orphan advisory
  (`readOrphanStoreCandidates`, through `resolveStoreBranch`, `store-branch-classification.ts`) and the missing-worktree
  check (`readStoreMissingFolderActions`, `missing-worktree-store.ts`). Each fails closed to unavailable, for every
  reuse.

Status already solved selection for itself. `seam-status-roadmap` built `selectStandingLifecycleEntries`
(`lib/status/store-project-standing.ts`), which picks one standing entry per slug as the lookup ranks, reports each
clash as a `slug-clash` warning naming each holder's UID, and withholds a name whose meta the listing rejects;
`arc status <slug>` already builds its index from those standing entries (`handlers/status/lifecycle.ts`). That spec
left lifecycle's verbs as they were and named no owner (`spec-seam-status-roadmap.md` § 2.1). The storage-coupling
register now carries the row (`cohort-state-storage.md`: "Lifecycle subject, index, dependency, and
transition-finalization selection assumes one holder per slug").

Why now: `storage-cutover` depends on this work unit; from the flip every lifecycle verb runs its store arm, so the
defect is reachable the first time a slug is reused or two machines clash.

## Decisions

Settled 2026-10-22, across the draft's first facilitated pass and the re-entry the first adversarial pass opened
(personal pass record, `ADVERSARIAL-PASSES.md`), which settled D8 and D9 and widened D1–D5; the fresh loop's first
pass added D10 and D11 and corrected D1, D5, D6, and D8, and its first fix-check round scoped D10 to work units,
narrowed D5 to match, and widened D11 to the teardowns callers run and to what teardown may delete; its second bound
teardown's checkout steps to the UID. The second pass found D8's residue exits needing detail and smaller gaps in D4,
D6, and D11; its folds detailed D8's exits and named release, gave D4 its edge on a non-work-unit holder's slug, named
D11's UID resolution, and added D9 and D11's branch gate to D6's seam. Its fix check moved D4's rule into the
disposition query and settled D8's release order, exclusivity exit, and marker stamp.

### D1. One standing-holder selection, applied at the view

Promote `selectStandingLifecycleEntries` from `lib/status/` into `lib/store/` as lifecycle's own selection, returning
only what it establishes: the standing entries, each clash's holders as typed references, and the fail-closed names.
`readLifecycleView` builds its slug-keyed `index` from the standing entries and exposes the clash and fail-closed facts
beside it, so every consumer that asks by slug inherits one selection. Each caller keeps its own failure policy: status
omits and warns, lifecycle verbs refuse (D3). The view itself never refuses for a clash: it refuses only when the
listing does (`readLifecycleView`), and its `entries` and listing keep every holder, each keyed by its reference, so a
reader of the inventory, `arc rename` among them (`readStoreRenameSubject` and `acquireRenameGroups`), still runs under
the clash it may be repairing. The selection's rule is the status rule as shipped:

- a live entry named by the slug stands, and the completed entries named by it are left out;
- else, where a live entry holds the slug as a former name, none stands;
- else the one completed entry named by it stands, and of several the latest archived, by quarter then sequence;
- several live entries named by one slug are a clash, and none stands;
- a name the listing withholds as a malformed or conflicted meta fails closed.

Where the lookup resolves among work units, the selection agrees with it, a tie among completed work units included,
since the lookup breaks that tie as the selection does (D10). The index answers for work units only: cohorts and
Errands take no entry in it, and where a holder's type matters, dependency classification (D4) and creation (D5)
consult the lookup, which ranks every type.

**Membership counting reads every holder.** A cohort's member count asks about each holder, not the one standing for a
slug, so archive's cohort closeout counts the view's identity-keyed entries at both its call sites, the `prospective`
snapshot `runStoreArchive` builds and the settle loop's (`prepareStoredCloseout`), each passed through
`prepareArchiveCohorts` to `isArchivalTriggeredWithDescendants` (`prepareObservedCohorts`,
`lib/work-unit/verbs/archive-store.ts`). Over the slug-keyed index, two clashed live members would drop from the count,
and archiving the cohort's last other open member would propose a closeout that `checkCohortOpenMembers`
(`lib/store/kinds/cohort/rules.ts`) refuses. As D3 keeps a clash elsewhere from blocking activation, this keeps one
from blocking archive.

The rule reaches every slug-keyed map the store arms build over lifecycle entries, not only the view's index: a map
keyed by slug takes the standing entries, and a read keyed by identity stays on `IdentityLifecycleIndex`. Known
instances beyond the view are `readStoreCompletedEvidence`' records map (`lib/store/lifecycle-completed.ts`), which
lists completed records only and so must drop any slug that has a live holder, as the in-repo arm does
(`resolveCompletedCandidateWorkUnits`, `handlers/candidate-mutation-owner.ts`), since the set grants an unowned checkout
Candidate mutation authority and feeds the stale-worktree sweep's `shipped` set; `snapshotFs`' `bySlug`
(`lib/store/lifecycle-storage.ts`), whose path check would otherwise read a reused slug's live artifacts as missing; and
`paused-work.ts`, which reads each paused entry's holding checkout by slug and takes D3's clash facts for two live
paused holders. The spec's propagation sweep enumerates the rest from the importers of `listLifecycleIndex` and
`readLifecycleView`.

**Rejected: re-key `LifecycleIndex` by UID.** The UID-keyed layer already exists (`IdentityLifecycleIndex`), and the
slug-keyed index exists because every question into it starts from a slug — a CLI operand, a `Depends On` edge, a
word in an artifact. Re-keying would push the slug-to-holder step into each caller, one rule copied across the 21
files that reference the type, and would rework the in-repo arm (`buildLifecycleIndex`) the cutover deletes.
Identity-keyed reads arrive per consumer as edges gain UIDs — contract D2's "machine records reference each other by
UID", owned by `work-item-relations` — and move to `IdentityLifecycleIndex.get` then; D1 does not obstruct that.

### D2. A verb's entry is the lookup's record

Every lifecycle verb takes its subject from `readWorkUnit` and finds its entry by that record's reference
(`sameReference`), never by name. It resolves its position, guards, and finalization under the subject's current
name, so a former slug typed as the operand acts on the live holder that the lookup returns.

The rule reaches every re-read of a listed entry, not only the subject's: a record already selected is acquired again by
its reference, never by its name, so group acquisition takes the reference a caller holds: rename's own and backlog
groups, decomposition's acquisitions of a record it holds (§ Problem, re-reads by name), and an ended holder's cleanup
(D11). Owner-confirmed 2026-10-22 in both work units' sessions: this work unit owns the rule, and
`cohort-identity-verbs` builds rename's sweep on it (D6).

### D3. Clash behavior

- **The clashed slug as subject.** The verb refuses with the lookup's `ambiguous-match`, naming each live holder's UID
  and the repair, renaming one holder. The refusal keeps each holder as a typed `RecordReference` (owner type and UID)
  through the verb's result, its CLI rendering, and `--json`, so a remedy can be rendered per holder type (D6).
  Lifecycle verbs take no UID subject: a UID-addressed `activate` or `archive` would let work proceed on a slug that
  stays clashed. Teardown is the one exception (D11): its subject has ended, so no work proceeds.
- **The clashed slug elsewhere.** A `Depends On` edge naming it stays unsatisfied with a diagnostic, never discharged
  and never dangling; the reconcile's word check treats a clashed name as held and does not look it up, so a clash
  elsewhere never blocks an unrelated work unit's activation.
- **The clashed slug in a dependent's edges.** The dependency reconcile routes a clashed name before the retired-edge
  query, so the lookup's `ambiguous-match` never becomes `namespace-corrupt` (`store-reconcile-context.ts`). The edge
  is kept, unsatisfied, with a diagnostic naming each holder as a typed reference and the rename remedy, and the
  dependent activates: activation never waits on an unfinished dependency, and of its dependency reconcile it rejects
  only a conflict (`runStoreActivate`, `activate-deactivate-store.ts`).

### D4. Dependency edges resolve against the standing holder

An edge naming a reused slug classifies against the live work unit, as the project view's does
(`spec-seam-status-roadmap.md` § 2.1) and as `readWorkUnit` resolves it. Pinning an edge to the holder its author
meant needs UID-bearing edges, which is `work-item-relations`' typed relation model, not this work unit. Creation's
edge settling (D5) leaves that case narrow: after a reuse lands, the edges still naming the slug are those in archived
records, which gate nothing, and those written after it, which mean the new holder.

Before the reconcile discharges an edge whose standing holder is completed, it confirms the holder through the lookup
and discharges only when the lookup returns a completed work unit. Any other result keeps the edge unsatisfied with a
diagnostic naming the holder or the refusal, never discharged: a live cohort or Errand holding the slug, where the edge
names no work unit, or a completed tie that includes an Errand or cohort, which D10 leaves refusing. Status classifies
both the same way (`found` and `resolveName`, `lib/status/store-project-dependencies.ts`). Only discharge, the
destructive step, pays for the lookup. This repository's `decompose-transform-integrity` is the case.

Where no work unit stands for an edge's slug, the reconcile's retired-edge query (`resolveRetiredEdge`,
`planDependencyReconcile`) asks its disposition query, which today retargets whenever the lookup returns another name,
whatever the record's type, and otherwise reads the retired origin's lineage (`queryDisposition`,
`store-reconcile-context.ts`). Where the lookup returns a record that is not a work unit, under the slug as its current
or a former name, or refuses `ambiguous-match` over a tie that includes one, the query does not retarget and does not
map the tie to `namespace-corrupt` as it maps every other refusal today. It reads the lineage as it does for a slug the
lookup does not find (`queryRetiredOriginDisposition`), which maps a retired origin's former names through its aliases,
since a cohort or Errand can take a retired origin's slug, current or former, once the slug lookup no longer resolves
it. Every disposition that reader returns applies as today: a drop, a replace, or an abandonment, and the lineage's own
`ambiguous`, `unmapped-dependent`, and `namespace-corrupt` results stay conflicts. Only an absent disposition changes:
the edge stays unsatisfied with a diagnostic naming the holder, or each tied candidate, never discharged, rather than
taking the `missing-evidence` conflict that rejects the dependent's activation today (`conflictReason`,
`discharge-dep-edges.ts`); so the dependent activates, and D3's "never `namespace-corrupt`" holds for every tie the
lookup refuses. It arises when a work unit is renamed away from a slug a cohort keeps, when a cohort is renamed away
from a slug an edge names, or when an edge names a cohort's slug outright.

### D5. Creation admits a slug no live record holds, within the store's write rules

`arc stub` and `arc start --new` admit a slug with no live holder, as contract D2 and D14's creation guard ("checked
against live records") state, within the store's write rules. Creation asks its own question rather than what stands
for the slug: under D1 a completed holder stands for it, and the store-arm creation paths read that today: `arc stub`
through `resolveSlugPosition` in `executeStoreTransition` and the create edges' `from: null`, and `arc start` through
`resolveStartName` and `resolveStartDispatch` in `handleStoreStart` (`handlers/start-store.ts`). `nameCollisionGuard`
guards only the in-repo `start` edge (`lib/work-unit/lifecycle-transitions.ts`), which no store path runs
(`runCreateNew` never calls the executor), and is unchanged.

- **One admission check in `lib/store/`, through the lookup.** A slug is free when the lookup finds nothing or returns
  a completed work unit under that slug as its current name, the latest of several by D10, and held when it returns a
  live record, under its current or a former name, or ties among live ones. A completed Errand or cohort holding the
  slug refuses, as `arc start` refuses it today (`resolveStartName`), so the only completed ties reuse creates are among
  work units, the ties D10 orders: Errands archive with no sequence (`ErrandReadPlacementSchema`,
  `lib/store/placement.ts`), and a closed cohort's members still name it by path. A slug the lookup returns as a
  completed record's former name refuses too, as `work-item.former-slug` refuses it (`checkFormerSlug`), keeping
  § 5.3's "a former slug resolves to its own work item alone" wherever the lookup returns the former name; any other
  lookup refusal fails closed. The write rule judges only the holder the lookup returns, so it admits a former slug
  that a completed holder under its current name outranks, short of § 5.3's "refuses a creation or rename that gives a
  work item a slug another record holds as a former slug"; D5 inherits that and does not close it (Owner-accepted
  2026-10-23). A slug the lookup returns as the subject itself is free, so a rename's resume onto its
  current name and a rename back to its own former slug pass, as the store's rule exempts the writing owner
  (`sameOwner`, `checkFormerSlug`). The lookup ranks every holder type in the namespace, so the check is D14's guard as
  written, and it admits only what the store's write rules admit (`checkFormerSlug`; `priorTarget`, `checkSlugEdges`).
- **Amended 2026-10-22, after the fresh loop's first pass (Owner):** the check first admitted a tie among completed
  holders and a completed holder's former slug, which the write rules refuse and § 5.3 forbids. A former slug now
  refuses, and a completed tie resolves through D10 instead.
- **Amended 2026-10-23, after that pass's first fix-check round (Owner):** reuse narrowed to a completed work unit's
  slug, since D10 cannot order a tie that includes an Errand, and the former-slug clause and self-exception reworded to
  what `checkFormerSlug` checks: the lookup's top-ranked holder, not every holder.
- **The store-arm creation paths run it and take position `null` when it passes:** a create in
  `executeStoreTransition` (`inputs.storeTransition.create`) for `arc stub`; `arc start --new` and `--here <name>` in
  `handleStoreStart`, which check the operand as typed; and the nameless cold start's derived name (`admitColdStart`,
  the cold start's admission hook in `handleStoreStart`). `resolveStartName`'s rewrite of a former slug to its holder's
  current name stays for graduation only: creation under the rewritten name would make a work unit nobody named. The
  transition table and the in-repo arm, where a slug has one holder, are unchanged.
- **It is the one admission check wherever a work item takes a name.** Owner-confirmed 2026-10-22: creation,
  decomposition's work-item names, and Errand promotion's target name (`replace`, `lib/errand/promote-store.ts`, which
  today relies on the store's write checks alone) take it here, and `cohort-identity-verbs` adopts it for rename's
  work-unit target (D6), replacing a draft rule that refused any slug the lookup resolves, ended holders included.
  `checkNamespaceName`'s rule for work-item names agrees with it but for a completed Errand or cohort holder, which it
  admits today and now refuses, and D10 lifts its refusal of a tie among completed work units.
- **A cohort taking a name adds a stricter rule:** it takes only a slug nothing resolves through, as
  `cohort-identity-verbs`' cohort rename does, so decomposition's new-cohort names also refuse a completed work unit's
  slug, which `checkNamespaceName` admits today. Membership names its cohort by path and readers match it as text
  (`lib/decompose/removal-cohorts.ts`, `lib/store/kinds/cohort/rules.ts`), and `work-item.slug-edges` guards no cohort
  write, so a cohort on a completed work unit's slug would otherwise shadow that work unit's edges (D4).
- **Creation settles the edges naming the slug, as shipped design requires.** A batch giving a work item a slug that an
  edge names for another record first settles each such edge in the records it may write, stubs' and its own: an edge
  on shipped work discharges, and one on a retired origin takes its lineage disposition (`spec-seam-record-kinds.md`
  § 5.3). An in-flight or parked dependent's edge refuses through `work-item.slug-edges` (`checkSlugEdges`,
  `lib/store/kinds/work-item/slug-edges.ts`) with its remedy. One settler in `lib/store/` serves creation, Errand
  promotion, and, by Owner choice in that work unit, `cohort-identity-verbs`' rename. It joins the batch that writes the
  record: for `arc start`, `--new` and the cold start alike, `scaffoldIntoWorktree`'s create batch
  (`lib/git/worktree-scaffold.ts`); for `arc stub`, the executor's; for promotion, `replace`'s. Decomposition keeps its
  own settler (`decomposeSlugSettlementWrites`, `lib/decompose/slug-settler.ts`), which already settles a cut's names
  from the cut map's dispositions; nothing requires moving it.
- **A live holder, under its current or a former name, still refuses**, naming each holder; the remedy is to choose
  another name or, for a holder under its current name, wait for it to complete — never a rename, since a renamed
  holder keeps the slug as a former name. A completed holder's former slug refuses with the remedy to choose another
  name. A lingering checkout of a completed holder does not block reuse: holder matching follows the claim's UID (D8).

**Rejected:** create edges from a completed position, which changes the transition table the in-repo arm shares;
admission through D1's selection, which lists metas only and misses a live cohort or Errand holding the slug; and
admitting a slug the lookup returns as a completed holder's former name, which reverses § 5.3's "a former slug
resolves to its own work item alone" and the write rule enforcing it.

### D6. Boundary with `cohort-identity-verbs`

Owner-confirmed here and in that work unit's planning session, 2026-10-22. This work unit owns selection and the clash
refusal. `cohort-identity-verbs` owns `arc rename <slug|uid> <new-slug>`, where a UUID-shaped operand selects that exact
owner and anything else is a slug resolved through the store's slug lookup (`readStoreRenameSubject`,
`lib/store/lifecycle-rename.ts`); from this work unit it takes the view's listing under a clash (D1) and the re-read by
reference (D2). It puts the repair into the store's own `ambiguous-match` remedy where live holders tie under their
current slug, one line per candidate — `arc rename <uid> <new-slug>`, or `arc errand close` for an Errand holder — so
every reader that prints the refusal names it, and three sites keep a richer line per typed candidate: rename's own
refusal, status's `slug-clash` warning, and D3's refusal. Rename renames any holder in the shared namespace and consumes
the resolved subject by holder type, never assuming a meta, so D7's cohort alignment serves its subject resolution as
well as the lifecycle verbs'. Cohort close and removal are that work unit's explicit `arc cohort` commands; abandon only
reports a cohort it leaves empty, so no abandon edge here changes.

That work unit's Owner adopted D5's admission check and its edge settler for rename's work-unit target, 2026-10-22,
so a slug's reuse behaves alike whichever verb gives it, and builds rename's checkout step on D8: it finds the
subject's checkout by the UID in its marker, from anywhere on the machine, and `renamedMarker` keeps that UID through
the rename. Teardown's UID operand (D11) follows rename's operand rule, and rename's branch step reads the `ref` arm
(D9) as teardown's branch gate does (D11).

### D7. The cohort divergence

`readWorkUnit` names a cohort holder as a cohort. The reference backend's slug ranking admits cohort primaries beside
work-item primaries, as the ref backend's does, and a conformance assertion pins it; neither branch's suite pins it
today (`suite-lookup.ts` on `main` and on `feat/storage-ref-backend`).

### D8. A work-unit checkout claim names its holder by UID

The claim and the readers resolving through it are grounded in § Problem, checkout claims.

- **From the flip, the work-unit claim carries the owner's UID and matches by it**, with no slug fallback:
  `CheckoutClaimSchema` (`lib/store/lookup.ts`) gains it for the `work-unit` kind, both backends' claim arms match
  the exact owner, and a conformance assertion pins it. The in-repo arm, which has no UIDs, keeps its slug claim.
- **The marker's work-unit subject records the UID.** A writer that holds the record writes it with the claim:
  graduation, spawned or in place, and materialize (`claimSpawnedWorktree`, `lib/work-unit/spawned-worktree-claim.ts`,
  and the in-place leg of `reconcileWorkUnitWorktree`), and promotion's two marker conversions
  (`lib/errand/promote-runtime.ts`); rename's marker rewrite (`renamedMarker`, `rename-worktree-transaction.ts`) keeps
  it, so a rename changes the marker's name for paths while its claim identity stays put. The two creation paths claim
  before the record exists, in the order `seam-locus` set so that the record write comes last and nothing in the store
  needs undoing (`spec-seam-locus.md` § 2.5): `arc start --new`'s spawn (`runCreateNew`, `commands/start.ts`) and the
  cold start (`runStoreColdStart`, `commands/start-cold-store.ts`). Each stamps the UID after its create batch, from
  the owner the batch returns, which both backends mint and return (`matchesMutationReference`, `lib/store/write.ts`),
  replacing exactly the generation it wrote, as promotion settles its marker after its commit (`settleOccupancy`,
  `lib/errand/promote.ts`). A stamp that fails once the batch has committed leaves the pending marker in place, and the
  creation reports its exit, `arc materialize <slug> --here`, since the record is live; the shipped rollbacks
  (`recoverColdStartFailure`, `commands/start-cold-store.ts`; `rejectCreateNewScaffold`, `commands/start.ts`) run only
  before the batch commits. Decomposition writes `branch` subjects only (`lib/work-unit/git-decompose-*`). Husk stamps
  are unchanged: no claim reads them. The derived checkout row's work-unit subject carries the UID too
  (`DerivedCheckoutRowSchema`, `lib/locus/derived-schema.ts`, reduced from the marker in `derived-evidence.ts`), so a
  reader that builds its claim from the session frame has it (`callerIdentity`, `lib/errand/store-overlap.ts`); the
  row is part of the published derived schema, which `session-envelope/registry.ts` and `commands/status/schema.ts`
  import, and changes in place under the pre-public posture.
- **Holder matching follows the claim, in two modes, and the caller sets the mode.** Every caller that holds a record
  passes its UID, and marker exclusivity and holder lookup match it, not the marker's name, so a lingering checkout of
  the archived holder neither blocks the slug's reuse nor is taken for the live holder's. Known store-arm callers are
  graduation (`commands/start-store.ts`), materialize, rename, and promotion, which passes the Errand's own UID
  (`promote-store-runtime.ts`), through `reconcileWorkUnitWorktree`'s shared spawn leg or their own check; and the
  holder lookups through `findWorkUnitHoldingCheckout` (`lib/work-unit/verbs/unshared-work.ts`): abandon
  (`abandon-store.ts`), decomposition's retirement check (`checkDecomposeRetirementCheckout`,
  `lib/decompose/retirement-checkout.ts`), the sharing report that gates pause and handover (`readUnsharedWork`,
  `pause-handover.ts`), and start's already-started check (`startedPlanningReason`); and teardown's own, which calls
  `findHoldingCheckout` directly with a name-matching fallback of its own (`holdingCheckout`, D11). A caller given a
  slug a person typed holds no record yet: it resolves the slug through the lookup first, as D2 has every verb do, and
  matches the returned record's UID, so `arc locus release <slug>` (`runLocusRelease`) acts on the live holder's
  checkout, and an ended holder's checkout stays teardown's (D11). The order is fixed: where the lookup returns a live
  holder, release matches its UID; otherwise, a completed holder or nothing, as D5 reads a free slug, release matches
  only the markers without a UID that name the slug, a crashed creation's or one the re-stamp left, so a completed
  holder's stamped checkout and a crashed reuse's pending marker never both match. That stamped checkout is released
  from inside it, by the unnamed form its exit prints, as a non-owner may today (`releaseAuthority`). The exits that
  locate a checkout print the unnamed form, run in that checkout, rather than a slug that may resolve to another holder:
  the marker exits (`marker-occupancy.ts`), the stale-worktree sweep's release action (`store-worktree-selection.ts`),
  the derived row's spawn-residue action (`derived-reader.ts`), and the exclusivity refusal a crashed creation's retry
  prints (`refusal`, `lib/locus/lifecycle-ports.ts`). The spec's sweep enumerates the rest from the callers of
  `checkMarkerExclusivity` and `findHoldingCheckout` (`lib/locus/lifecycle-ports.ts`). A creation holds no record yet,
  so its claim is pending and carries no UID: it passes the slug, and its check (`requireMarkerExclusivity`, through the
  spawn leg for `arc start --new` and in `runStoreColdStart`) compares it against other pending markers only. A crashed
  creation's leftover therefore blocks a retry and names its exits, and a UID-bearing marker never blocks creation: D5's
  lookup decides that.
- **A pending work-unit marker is a creation's residue.** A creation writes `provisioning: "pending"` with no UID, and
  its stamp writes the UID and drops the provisioning, as a transient marker's provisioning runs (`provisioning`,
  `lib/git/worktree-marker.ts`); a work-unit marker with neither predates the flip. This ends the rule that a
  work-unit marker carries no provisioning, and its readers change with the subject's new UID key: the marker type and
  `provisioningIsConsistent` (`worktree-marker.ts`), `decodeWorktreeMarkerOwnership`, `occupancy-marker.ts`' field and
  exact-key checks, and the work-unit reduction in `derived-evidence.ts`. Claim readers refuse a pending marker naming
  its exits, rather than taking the not-found path that advises `arc locus release` (`marker-occupancy.ts`,
  `selectCheckout`), and its exits follow D5's check of its slug. Where the slug is free, the creation never landed:
  the cold start's rerun, which admits its own pending marker, or `arc locus release`, the exits `seam-locus` names
  for a crashed cold start. Where a live holder exists, `arc materialize <slug> --here` from that checkout binds it,
  the person naming the holder, an admission materialize gains. The current-work-unit resolver
  (`readClaimedCurrentWorkUnit` under `resolveCurrentWorkUnit`) reports a pending marker as its own state rather than a
  warning, and only the two exits admit it: the cold start, which checks the resolver first (`runStoreColdStart`), and
  materialize `--here`, whose occupancy guard (`readStoreOccupancy`, `lib/work-unit/lifecycle-guards.ts`) admits a
  pending marker naming the slug where the lookup returns a live holder and matches a stamped marker by its UID, and
  whose in-place leg stamps the pending marker by its generation (`writeAnchoredMarker` with `expected`, in
  `reconcileWorkUnitWorktree`): it adds the UID and drops the provisioning, keeping the marker's other fields,
  `spawnedByArc` among them, as the creation's own stamp does, rather than refusing an existing marker or writing the
  fresh one the leg writes today, which sets `spawnedByArc: false`. Every other caller of
  the resolver refuses a pending marker, naming its exits. This replaces that work unit's by-name residue test, a
  marker naming a work unit the store holds no record of (`missingRecord`, `marker-occupancy.ts`), which a reused slug
  defeats: the claim lookup returns its archived holder (`readClaimedWorkUnit`, `lib/locus/store-work-unit-evidence.ts`).
  Claim readers refuse a marker that predates the flip and is still unstamped, naming the re-stamp. Locus release
  admits any work-unit marker without a UID in the checkout it runs from, pending or pre-flip, since releasing gives up
  a claim rather than using one, as `releaseAuthority` (`lib/locus/release.ts`) admits the by-name residue today.
- **The re-stamp is a standing, explicit, idempotent command over this machine's registered checkouts.** It binds only
  markers that predate the flip, with no UID and no provisioning, where the store holds exactly one record of the
  marker's name — counting a work unit holding it as its current or a former name (the identity-keyed listing) and a
  retired origin's lineage under it (the `lineage` arm), whose origin UID it binds so the checkout takes D11's teardown
  path — and reports every other subject, never guessing; it never binds a pending marker, whose creation may
  have landed as another checkout's or machine's record. Where the name has several records, as on a machine that flips
  after the slug's reuse, the report names each candidate's UID and the exit, `arc locus release` from that checkout.
  `storage-cutover` runs it as a flip step on every machine with live checkouts, since no marker written before the flip
  carries a UID and the import leaves markers out as machine-local (`spec-storage-ref-backend.md`, "What stays out");
  routed to that work unit's draft as an inbound requirement. It stays standing for a machine that flips late. An
  automatic backfill on the first store-backed read is rejected: it is the compatibility reader the pre-public posture
  regenerates instead.

**Rejected: rank the claim arm as D1 ranks**, with creation refusing reuse while a local checkout still claims the
slug. It needs no marker change, but nothing catches another machine's case. A checkout there of the archived holder,
not yet stamped as a husk, resolves to the live holder after a pull, and the topology check cannot refuse it: a record
with no branch link expects no topology (`readStoreWorkUnitEvidence`), store-arm spawns are detached (`runCreateNew`),
a planning work unit holds no branch, and a feature branch's name comes from the slug. That checkout then stops
reading `ended`, losing its husk and teardown offer, and the claim decides cleanup authority (`selectCheckout` reads
`ended` from it), a destructive path, which is where exactness belongs.

**Rejected: create the record before the claim.** It leaves no UID-less marker, but reverses `seam-locus`'s
record-last order: a failed creation would leave a live record with no checkout, in the store and shared on push,
where the stamp's residue stays in one checkout.

**Rejected: the caller mints the UID.** Contract D2 has the backend mint it at creation.

**Rejected: a slug fallback for UID-less claims from the flip.** It keeps the first rejected option alive as a second
path for development-only state, which the pre-public posture regenerates instead of reading compatibly.

**Rejected: no `pending` state, every UID-less marker after the flip read as residue.** It keeps a work-unit marker
free of provisioning, but works only if the re-stamp runs once, at the flip: a standing re-stamp could not tell a
crashed creation's leftover from a pre-flip marker, and binding the leftover by name would misbind it.

### D9. Branch-link lookup ranks live holders first

The `ref` arm ranks as the slug arm does: a live holder before a completed one, a tie among live holders refuses, and a
tie among completed work units resolves to the latest archived (D10); in both backends, with a conformance assertion. Each
session-init reader of a reused slug's branch then resolves its live holder (§ Problem, branch links), and every caller
stays safe: the one destructive offer, the missing-worktree check's branch cleanup, requires the resolved holder to be
completed, so a live holder ranked first means no cleanup while a live work unit links the branch. The in-repo arm's
`lookupRef` (`lib/store/in-repo/lookup.ts`), where a slug has one holder, is unchanged.

**Rejected:** retiring branch links at archive, which changes archive's record writes and loses which branch shipped a
work unit; and naming the ranking out to another owner, which leaves every reuse's branch reading unavailable until one
acts.

### D10. The lookup breaks a completed tie by latest archived

Both backends' slug ranking resolves a tie among completed work units to the latest archived, by quarter then sequence,
as D1's selection and status's do (`selectStandingLifecycleEntries`) and as the ref backend already orders one owner's
archived folders (`latestArchivedFolders`, `lib/store/ref/archive-read.ts` on `feat/storage-ref-backend`). A tie among
live holders still refuses `ambiguous-match`, as does a completed tie that includes an Errand or cohort: an Errand
archives with no sequence (`ErrandReadPlacementSchema`, `lib/store/placement.ts`), and D5 creates no such tie, though a
cohort decomposition placed on a completed work unit's slug forms one when it closes (§ Problem, cohorts). A conformance
assertion pins all three. Without it, a reused slug's lookup refuses for every reader once its second holder completes,
and the write rules refuse the slug to every later creation (§ Problem, completed ties), so the reuse D5 admits would
leave a slug no reader can resolve. The write rules and § 5.3 stay as shipped. Owner-chosen 2026-10-22, after the fresh
loop's first pass; scoped to work units 2026-10-23, after its first fix-check round (Owner).

**Rejected:** narrowing D5 to one reuse per slug and capturing the tie for the lookup's owner, which leaves every
reused slug unresolvable once its reuse completes; and relaxing the write rules to admit a completed tie at creation,
which leaves the lookup refusing.

### D11. An ended holder's cleanup finds it by UID

Under reuse, the archived holder's cleanup reads its subject by name and reaches the live holder (§ Problem, cleanup of
an ended holder).

- **Every cleanup exit that holds the checkout or the branch resolves the ended holder by its UID** — a checkout's from
  its marker through the claim arm (D8), a branch's from its link through the `ref` arm (D9) — and reads retirement
  evidence by that reference, a lineage through the lookup's `lineage` arm, whose `origin` takes a UID
  (`lib/store/lookup.ts`). The exits are the stale-worktree sweep (`selectStoreWorktreeCleanup`,
  `lib/session-init/store-worktree-selection.ts`, rendered in `stale-worktree-sweep.ts`), locus release's ended remedy
  (`releaseAuthority`, `lib/locus/release.ts`), the husk exit (`inspectCheckoutMarker`, `marker-occupancy.ts`), the
  missing-worktree check (`missingRegistrationActions`, `lib/session-init/missing-worktree-folders.ts`), the orphan
  advisory (`orphan-store-candidates.ts`, rendered in `orphan-branch-sweep.ts`), the retirement sweep
  (`hasAbandonment`), and branch-gone recovery's teardown offer (`branch-gone-recovery.ts`). It is D2's re-read by
  reference.
- **A caller that already holds its subject passes that reference; only an operand a person types resolves as a
  slug.** Abandon's and decomposition's teardown steps pass the retired primary's reference, whose lineage the
  `lineage` arm finds by UID, and their retry commands name that UID.
- **`arc teardown` takes `<slug|uid>`**, a UUID-shaped operand selecting that exact owner as `cohort-identity-verbs`'
  rename does (D6), and each offer names the holder's UID when its slug resolves to another holder. No lookup arm finds
  a primary by UID (`LookupInputSchema`), so a UUID operand scans the work-item listing for that owner's UID, as the
  inbox's UUID selector does (`primaryByUid`, `lib/inbox/lists.ts`), and, where no primary carries it, asks the
  `lineage` arm for a retired origin by that UID. D3's rule against a UID subject guards against work proceeding on a
  clashed slug, and teardown's subject has ended.
- **Teardown finds its subject's checkout by UID.** Its holder lookup (`holdingCheckout`, through
  `findHoldingCheckout`) and its selection check (`readTeardownSelection`, whose `subjectsEqual` in
  `lib/work-unit/teardown-selection.ts` compares work-unit subjects by name today) match the evidence owner's UID (D8),
  so a teardown run by UID never takes the live holder's checkout for its subject's; and when it ran by UID, every
  retry it names carries the UID: its retry remedy (`teardownRetryRemedy`), the husk refusal
  (`store-retirement-husk.ts`), and the lineage repair text (`store-retirement-evidence.ts`).
- **Teardown touches only a branch the retiring holder still owns.** Before it returns a checkout to base or deletes a
  linked branch, it looks the branch up through the `ref` arm (D9). Where that finds no record, as for an abandoned or
  decomposed holder, whose links move to its lineage (`retiredBranches`), or returns the subject or a completed holder,
  teardown proceeds. Where it returns a live holder other than its subject, or refuses with `ambiguous-match` or
  another failure, as for two live holders' shared branch after a clash's rename (`cohort-identity-verbs`), teardown
  leaves the checkout, the local branch, and the remote alone and reports each, naming the holder. A local branch so
  kept can be the ended holder's own: after a clash's rename both links name the old branch, and when the renamed
  holder completes first its teardown keeps that branch, which the other holder's later rename on that machine then
  takes as its own (`cohort-identity-verbs` records the same residual). Nothing is lost and the rename reverses;
  accepted as a residual over reaping a branch the subject's own checkout held (Owner, 2026-10-23), which needs that
  checkout observed before teardown retires it and its released files returned to base, all on a destructive step.
  This covers the retiring link and any other created link (`prepareCreatedBranch`,
  `reapRetiringBranch`, `reapAdditionalBranch`). Under `discard`, teardown deletes the remote only when the advertised
  tip is contained in this machine's local branch for the retiring holder (`generation.localHead`,
  `selectRetiringLinks`), and otherwise keeps it and reports it, as `landed` keeps a remote whose commits have not
  landed (`reapRetiringRemote`).
- **The two halves gate differently because their evidence differs.** A checkout ARC makes of the live holder on this
  machine comes from this machine's store, so the `ref` arm sees that holder wherever ARC put its branch, and a link
  carries no tip to compare. The remote can carry another machine's push before this machine pulls that holder's
  record, so only the tip comparison is safe there. One case escapes both: a branch made by hand from a fetch this
  machine's store has not pulled (`git switch feat/<slug>`), where the `ref` arm sees no live holder and the local
  branch matches the advertised tip, so teardown deletes the live holder's push, since it pulls no store state
  (`runStoreTeardown`). The holder's own machine keeps the branch to push again; accepted as a residual over a store
  pull inside teardown (Owner, 2026-10-23). The remote gate narrows `discard` on a machine without the local branch,
  which keeps the remote and reports it where today it deletes it: a scope expansion, Owner-approved 2026-10-23 after
  the fresh loop's first fix-check round.

**Rejected:** refusing reuse while a local checkout of the completed holder lingers, which misses another machine's
checkout after a pull, as D8's rejected ranked claim does; teardown only from the checkout or its offer, which
leaves a missing worktree's registration with no checkout to run from; and gating the remote on another holder being
visible in this machine's store, which deletes a push that store has not yet pulled.

### Class, depth, and boundary

- **Class `Heavy`, confirmed.** Derivation fires: clash behavior, edge semantics under reuse, creation admission, and
  the checkout claim each carried real alternatives. Scale fires: about twenty consumers of the view, the claim's
  readers and marker writers, the creation paths, and the cleanup exits to map. Every piece composes from shipped
  substrate — the status selection, the lookup's ranking, promotion's marker settlement, and § 5.3's edge settling — so
  it is not `Novel`.
- **Depth `high` since the 2026-10-22 re-entry.** Entered at `medium`; the first adversarial pass found corrections
  reaching name-keyed sites beyond the draft's surface — checkout holder matching, branch links, Candidate authority,
  rename groups — and new design at D5 and D8, so the stage stepped up.
- **Boundary: stays one WU, re-read at re-entry and Owner-confirmed 2026-10-22.** One concern: a slug with several
  holders (contract D2, D14) breaks the store arms' one-holder assumption wherever a reader starts from a name,
  lifecycle's view and verbs (D1–D7), the checkout claim (D8), the branch-link lookup (D9), the lookup's completed tie
  (D10), and an ended holder's cleanup (D11) alike. They sit in different subsystems but are coupled by need: the
  lifecycle executors consult marker exclusivity and holder lookup, so the verbs under reuse need D8, and D5's admission
  is sound only with its UID matching. A cut was the alternative, with an edge from D5 to the new work unit; it was
  declined for that coupling and because extracting from a started work unit is unrehearsed before the cutover. No
  delivery plan: the ref backend's lookup changes order last in the plan, after `storage-ref-backend` lands, and review
  chunks as usual, since landing the selection early serves no consumer, `cohort-identity-verbs` waiting on
  `storage-ref-backend` too. `cohort-identity-verbs` stays a separate deliverable; D6 settles the seam. Re-read after
  the fresh loop's first pass added D11 and D8's pending claim: stays one WU, since that work follows from the reuse D5
  admits (Owner, 2026-10-22).

## Success signal

Over both the reference backend and the ref backend:

- **Reuse.** With a completed holder and a live holder of one slug, every lifecycle verb from the flip acts on the
  live holder — `arc activate` succeeds where it now rejects "is not a Planning work unit held in active placement" —
  the dependency reconcile classifies an edge naming the slug against the live holder, `arc stub`, `arc start --new`,
  and decomposition admit a slug whose holders are all completed work units under it as their current name, a third
  generation included, and refuse a completed Errand's or cohort's slug and a slug the lookup returns as a completed
  holder's former name, and session-init resolves the live holder's checkout through
  its UID-bearing claim, and its branch through the ranked `ref` arm, while a checkout of the archived holder not yet
  stamped as a husk still reads `ended` and tears down through its UID, leaving the live holder's checkout, local
  branch, and remote branch in place, while an abandoned holder's teardown still reaps its own branches.
- **Settling.** Creating onto a completed holder's slug settles a stub's edge naming it in the same batch, and an
  in-flight dependent's edge refuses through `work-item.slug-edges` with its remedy.
- **Clash.** With two live holders, a verb naming the slug refuses `ambiguous-match` carrying both holders as typed
  references through `--json`, an edge naming it stays unsatisfied without discharge, both a dependent naming it and
  an unrelated work unit still activate, and the last other open member of a cohort holding both still archives.
- **Cohort.** A slug held by a cohort resolves as a cohort in both backends, and `readWorkUnit` reports it as one; an
  edge naming a slug a live cohort holds stays unsatisfied, never discharged, and its dependent activates, with or
  without a work unit standing for the slug and under the cohort's current or a former name, unless a retired origin's
  lineage under that slug settles it first, as a drop or a replace; a new cohort refuses a completed work unit's slug.
- **Flip and residue.** The re-stamp gives every pre-flip work-unit checkout marker its owner's UID, idempotently,
  and reports a subject it cannot name with its candidates' UIDs and its exit; an unstamped pre-flip marker refuses
  claim readers naming the re-stamp, and locus release from its checkout succeeds; a creation interrupted between its
  claim and its stamp leaves a pending marker that blocks a retry and refuses naming its exits, and the exit its slug's
  state names succeeds.

Amended 2026-10-22 after the fresh loop's first pass (Owner): a completed holder's former slug no longer counts as
reusable (§ 5.3), and the third generation (D10), the archived holder's teardown (D11), archive under a clash (D1), and
the pending residue's exits (D8) were added; the residue signal first named the re-stamp as its exit.

Amended 2026-10-23 after that pass's first fix-check round (Owner): reuse narrowed to completed work units (D5, D10),
the former-slug signal reworded to what the write rule checks, and the unbindable pre-flip marker's exit and the
live holder's branch surviving the ended holder's teardown added (D8, D11); after the second round, the abandoned
holder's own cleanup.

Amended 2026-10-23 after the fresh loop's second pass (Owner): the cohort signal's dependent activates even where no
work unit stands for the slug (D4).

## Unknowns and Assumptions

- **Assumption — the in-repo arm is out of reach.** The in-repo implementation resolves identity from the slug, so a
  slug has one holder there; its lifecycle arms (`handlers/lifecycle.ts`'s `index.get(target)` paths) stay as they are
  until the cutover deletes them.
- **Assumption — status keeps its behavior.** Moving the selection changes status's import, not its output; which
  status tests pin that output is confirmed at spec.
- **Assumption — both backends can order completed work units by archive.** D10 ranks by quarter then sequence; the
  ref backend's archived folders carry both (`folderPlacement`, `archive-read.ts` on `feat/storage-ref-backend`), and
  the reference backend's work-unit records carry their completed placement; the spec confirms each lookup reads it.
  An Errand's completed placement carries no sequence (`ErrandReadPlacementSchema`), which is why D10 leaves Errands
  out; a cohort's carries one (`CohortReadPlacementSchema`), and D10 leaves cohorts out because D5 gives no cohort a
  work unit's slug.

## Scope boundary (Won't Do)

- No UID subject for lifecycle verbs other than teardown (D11), and no `arc rename` by UID or cohort rename
  (`cohort-identity-verbs`, D6).
- No UID-bearing dependency edges or typed relations (`work-item-relations`).
- No change to the store's lookup beyond D7's cohort alignment in the reference backend, D8's UID-matched work-unit
  claim, D9's ranked `ref` arm, and D10's tie-break among completed work units (added 2026-10-22, scoped 2026-10-23,
  Owner).
- No change to the store's write rules: `work-item.former-slug` and `work-item.slug-edges` stay as shipped, so a slug
  the lookup returns as another record's former name is never reused.
- No in-repo arm changes: its lifecycle arms, its slug claim, and its `ref` arm stay until the cutover deletes them.
- No UID in husk stamps: no claim reads them.
- No change to `arc errand open`'s admission, which refuses any slug whose lookup returns a work unit, completed ones
  included (`decodeBasis`, `lib/errand/store-runtime.ts`): it fails closed, an Errand's slug is disposable, and
  settling edges for Errand creation serves no present need.
- No change to decomposition's refusal of a completed cohort's name for a new cohort (`checkNamespaceName`): completed
  members still name their cohort by path, so reuse waits on membership telling cohort generations apart; captured
  for the drain with `work-item-relations` as the neighbor to check.
- No new register row: row 226 carries this work unit, and its widening to the checkout claim (D8) is routed to the
  register's drain rather than edited from this branch.

## Sequencing and coordination

`storage-cutover` depends on this work unit, and this one records no edge: it designs and builds now. Of the files the
design reaches on `main`, `feat/storage-ref-backend` touches `lifecycle-rename.ts` (path computation),
`archive-store.ts` and `suite-lookup.ts` (each `sync` to `push`), `handlers/status/lifecycle.ts` (refresh-warning
plumbing, beside the selector import D1 moves), `lib/store/in-repo/lookup.ts` (an exported footer parser),
`verbs/rename-store.ts` (a pull and retry), `promote-store-runtime.ts` (its sync port), and
`handlers/status/store-locus.ts` (pull notices), all small and mechanical, and `feat/seam-delivery-review` touches none,
so implementation need not wait on either. The ref backend's lookup changes — D8's claim arm (`claimLookupCandidates`),
D9's `ref` arm (`lookupCandidates`), and D10's slug ranking (`rankNameTrees`) — implement after `storage-ref-backend`
lands, an ordering the spec records, not a `Depends On` edge, and edit both backends on `main` without imposing a change
on that branch; D7's conformance assertion lands the same way.

This work unit lands before `cohort-identity-verbs`, which rebases onto D1's selection and records the same ordering on
its side, with its spec approved only after this one's and a re-read of what it consumes: the typed clash candidates
(D3), the re-read by reference (D2), the view's listing under a clash (D1), the reference backend's cohort ranking (D7),
D5's admission check and edge settler with D10's tie-break beneath it, which leaves a completed tie refusing only where
it includes an Errand or cohort, D8's UID-bearing marker and claim with holder lookup by UID, kept through
`renamedMarker`, D4's rule for an edge on a non-work-unit holder's slug, which rename's reference sweep cites, D9's
`ref` ranking and its refusal of a live tie, which rename's branch step reads, and D11's
`<slug|uid>` teardown operand, which follows rename's, and its branch gate, which rename's branch step mirrors.
`storage-cutover` gains an inbound requirement: run D8's marker re-stamp as a flip step.

## Planning continuity

- **Readiness:** formalization-ready (2026-10-23). The fresh loop's first pass (2026-10-22) found D5 admitting what the
  store's write rules refuse and D8's creation and cleanup cases open; its folds settled them as D10, D11, and D8's
  pending claim. The first fix-check round (2026-10-23) scoped D10, narrowed D5, widened D8's exits, and widened D11 to
  the in-verb teardowns and to what teardown may delete; the second bound teardown's checkout steps to the UID and split
  the branch gate's not-found case; the third corrected D8's caller cases and teardown's retry texts, and the fix-check
  rounds ended there (Owner, 2026-10-23). The second pass (2026-10-23) found D8's residue exits needing detail and
  smaller gaps in D4, D6, and D11; its folds changed D4, D6, D8, and D11. Its fix check's two rounds moved D4's rule
  into the disposition query, named its lineage reader and tie handling, and settled D8's release order, exclusivity
  exit, and marker stamp; the rounds ended there (Owner, 2026-10-23).
- **Resolved:** D1–D11 and the boundary, Owner-confirmed 2026-10-22; Class `Heavy`.
- **Open:** none.
- **Next:** create-spec.

## Captured provenance

Captured during `seam-status-roadmap` create-spec, adversarial pass 2 fix-check round 2 (findings on the fold's reach),
2026-10-16, with the approach "give lifecycle's verbs from the flip one selection of a slug's standing holder, as the
lookup ranks, for both the subject and the index, with a defined behavior under a clash; and add the register row the
mechanism lacks". Routed at the 2026-10-19 inbox drain, which added the register row and the cutover edge.

---
