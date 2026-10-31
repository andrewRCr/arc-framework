# Spec (`detailed` · `RFC`): cohort-identity-verbs

- **Origin:** [internal] — inbox routing, 2026-10-19, from two captures during `seam-decomposition` create-spec
  (2026-10-16): a doubled cut whose names clash had no command to clean it up, and any cohort could empty out through
  abandonment with nothing to close it.

- **Purpose:** Give the store-backed lifecycle the identity commands it lacks. `arc rename` selects its subject by slug
  or UID and renames any holder in the shared namespace, a work unit or a cohort, so every slug clash has a command that
  repairs it; `arc cohort close` and `arc cohort remove` retire a cohort nothing else will; and `arc errand close` and
  `arc errand abandon` take the same UID operand, so a clashed Errand has an exit.

---

## Introduction / Context

### Two holders of one slug

From the storage flip, work items and cohorts share one namespace in the ref backend: the store refuses a local create
or rename onto a slug another live owner holds (`checkLiveNamespace`, `lib/store/ref/namespace-admission.ts`). Two
machines each creating or renaming onto one slug, or two processes on one machine doing so at once, still leave two live
holders, since each machine admits its own write and the second arrives at a pull. Every later lookup of that slug then
refuses `ambiguous-match` naming both owners (`lookupCapturedRefTrees`, `lib/store/ref/lookup.ts`), and so does every
read or write that names a record by that slug within the clashing family (`resolveCapturedReference`,
`lib/store/ref/reference-resolution.ts`).

The store side of the repair exists: a reference carrying its owner's UID needs no name resolution
(`resolveCapturedReference` returns it as given), and a rename that ends a clash lands. No command reaches it.
`arc rename <slug> <new-slug>` (`cli.ts`) selects its subject with `readWorkUnit` through the slug lookup
(`readStoreRenameSubject`, `lib/store/lifecycle-rename.ts`), so it refuses on the clash it should repair, and it renames
work units only. The lifecycle refusal already names the repair as `arc rename <uid> <new-slug>` or
`arc errand close <uid>` (`clashRepair`, `lib/store/clash-repair.ts`, rendered by `refuse`,
`handlers/lifecycle-shared.ts`), operands neither command accepts.

### Cohorts have no identity commands

Today a cohort is renamed or removed by editing tracked files. From the flip that stops working: write-back persists
each edited file as its own write and never changes a reference, while a cohort rename must change the document's name
and every member's `Cohort` path together, since `cohort.parent` refuses a changed `Parent` its open members' paths
disagree with (`checkCohortParent`, `lib/store/kinds/cohort/rules.ts`) and `meta.cohort` resolves a path's last segment
to an open document (`checkMetaCohort`, `lib/store/kinds/meta/reference-rules.ts`).

Only archive closes a cohort, in the batch archiving its last open member (`prepareObservedCohorts`,
`lib/work-unit/verbs/archive-store.ts`, with the trigger `isArchivalTriggeredWithDescendants`,
`lib/work-unit/lifecycle-membership.ts`, which needs at least one member). Neither abandon arm touches a cohort
(`runStoreAbandon`, `lib/work-unit/verbs/abandon-store.ts`; `abandon.ts`), and no lifecycle verb removes a cohort
document: decomposition's `--discard` and `--revise` remove a cut's own new documents, and only while its stored map
stands. So a cohort whose last open member is abandoned, one never given a member, and the open documents a
decomposition race leaves with no stored map stay open for good, and an open subcohort among them keeps its parent from
closing.

### What already exists

The lifecycle's slug selection shipped before this change (PR #1191), and this design builds on it:

- **Ranking.** The slug lookup ranks work items and cohorts together in four tiers — live current name, live former,
  ended current, ended former (`preferredNameTrees`, `lib/store/ref/lookup-primary.ts`) — and a completed tie that
  includes a work unit resolves to its latest archived work unit, which outranks a completed Errand
  (`completedLookupWinner`, `lib/store/ref/lookup-ranking.ts`). A live tie refuses, as does a completed tie that
  includes a cohort or holds only Errands. The refusal carries the tie's facts, `tie: { liveness, name? }`, the slug
  arm setting `name` and the branch-link (`ref`) arm `liveness` alone. Binding a record by name alone
  (`resolveCapturedReference`) takes no tie-break and carries no `tie`. The reference backend ranks the same way
  (`preferredSlugRecords`, `__tests__/helpers/store/lookup.ts`).
- **Re-reads by reference.** `acquireLifecycleRecords` (`lib/work-unit/prepared-lifecycle-write.ts`) takes the owner's
  `RecordReference`, and rename's group acquisition re-reads its subject and every backlog stub by the reference its
  listing returned (`acquireRenameGroups`, `lib/store/lifecycle-rename.ts`).
- **Checkout claims by UID.** The work-unit marker carries its owner's UID (`decodeWorktreeMarkerOwnership`,
  `lib/git/worktree-marker.ts`); rename finds its subject's checkout by an owner request matched by UID
  (`findWorkUnitHoldingCheckout`, `lib/work-unit/verbs/unshared-work.ts`, through `LocusPorts`); a marker carrying no
  UID that names the subject's current or a former slug is an unbound holder, on which rename refuses before its batch,
  naming the holders and the marker's exits (`classifyUnboundMarker`, `lib/locus/unbound-marker.ts`); and the marker
  rewrite keeps the UID (`renamedMarker`, `lib/work-unit/rename-worktree-transaction.ts`).
- **Clashes elsewhere.** The reconcile's word check and paired-spec owner check take any `ambiguous-match` as an answer
  (`artifactAliasLookup`, `lib/work-unit/store-reconcile-context.ts`; `knownArtifactOwner`,
  `lib/work-unit/paired-reference-owners.ts`), as does abandon's impact plan, so no tie blocks an unrelated work unit's
  activation, reconcile, publish, abandon, or rename. The store arm of the dependency reconcile resolves each name an
  edge meets once and holds an edge whose name resolves to a cohort, an Errand, or a tie, unsatisfied with a diagnostic,
  rather than filing a conflict (`planStoreDependencyReconcile`, `lib/work-unit/side-effects/store-dependency-rows.ts`).
- **Shared pieces in `lib/store/`.** The creation admission check (`checkCreationAdmission`,
  `lib/store/creation-admission.ts`), the stub edge settler (`settleCreationSlugEdges`,
  `lib/store/creation-slug-settlement.ts`), the clash repair builder (`clashRepair`), and the exact-UID scan over
  work-item primaries (`readWorkItemByUid`, `lib/store/work-item-uid.ts`), which teardown's `<slug|uid>` operand uses
  (`runTeardownForOperand`, `handlers/teardown-operand.ts`).

`storage-cutover` depends on this change: from the flip these commands are the only routes to the repairs their
refusals name, and a recoverable refusal must keep its repair reachable (`DEV-RULES.PROJECT`, "Recovery-complete
refusals").

## Goals

1. **Every clash has a working repair.** Under any clash or tie the lookup refuses, the remedy a reader prints names a
   command that runs and ends it, or, where none can, says so.
2. **One command renames any namespace holder.** `arc rename <slug|uid> <new-slug>` renames a work unit or a cohort,
   selected by slug or by exact UID, and lands under a clash of its own slug.
3. **A rename changes only what names its subject.** It rewrites another record's reference to the old slug only where
   that slug, resolved within the family the reference names, names the subject alone, and reports every reference to
   the subject that rule leaves with the edit that re-points it.
4. **A cohort rename is one write the store's checks admit,** whatever its members' states, on a clone missing their
   history refs.
5. **A cohort can always be retired.** `arc cohort close` and `arc cohort remove` retire a cohort nothing else will,
   close refusing while an open record in its view holds it and remove while any record does, so no open record they or
   archive see is left in a closed cohort and no record names a removed one. A record another machine writes meanwhile
   is the residual § 8.4 states: after a removal its archive and rename refuse naming the edit that repairs it, and
   after a close it stays an open member of the closed cohort.
6. **A clashed Errand has an exit.** `arc errand close` and `arc errand abandon` select an Errand by exact UID.
7. **Nothing changes before the flip.** Every verb behaves as today until the store runs off-branch, but for one refusal
   order (§ 10): there every operand is a slug, and the new commands refuse `unsupported`, naming what serves.

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **Lifecycle verbs' subject selection** beyond rename's own: every other lifecycle verb keeps selecting its subject by
  slug through the shipped standing-holder selection and its clash refusal; none takes a UID subject. A UID-addressed
  archive or activation would let work proceed on a slug that stays clashed. Teardown's `<slug|uid>` operand is
  shipped and unchanged.
- **Renaming an Errand,** or any Errand verb change beyond close's and abandon's UID operand (§ 9.1–9.2), promote's
  clash refusal passing the store's remedy through, and promote's recovery matching by its receipt (§ 9.3). Closing one
  of two clashed Errands repairs everything a rename would.
- **Renaming, reopening, or re-parenting a closed cohort, or re-parenting an open one.** No verb re-parents a cohort.
- **Closing a cohort on abandon,** or changing archive's close trigger or closeout rule beyond counting holders by
  resolution (§ 7).
- **Teaching every membership reader to resolve former slugs.** Readers § 7.2 does not name keep matching a path's text
  (§ 7.3).
- **A cohort's record and approval forms** (`cohort-design-records`): these commands use today's cohort identity and
  membership.
- **A UID prefix operand.** An eight-hex prefix is itself a valid slug (`SLUG_PATTERN`, `lib/kernel/schema/slug.ts`).
- **Workflow text.** The flip's workflow rewrite owns every workflow change.

## Proposed Design

Each section states behavior from the flip, over the ref backend and the reference backend alike, unless it says
otherwise; § 10 states what holds before the flip.

### 1. The subject operand

#### 1.1 The form

`arc rename <slug|uid> <new-slug>`, `arc cohort close <cohort>`, `arc cohort remove <cohort>`,
`arc errand close <slug|uid>`, and `arc errand abandon <slug|uid>`. A cohort operand is the cohort's slug or UID, never
its `parent/child` path, since a slug is unique in the namespace. An operand `z.uuid()` accepts, upper case included,
selects that exact owner by its lowercased UID; any other operand is a slug resolved through the slug lookup. A slug
shaped like a UUID, which `SlugSchema` admits, so selects by UID; its holder stays reachable by its own UID. This is the
rule teardown's operand already applies (`resolveOperand`, `handlers/teardown-operand.ts`), and like teardown's it holds
from the flip only. Before it every operand is a slug, which, unlike teardown's, the in-repo arm parses with
`SlugSchema`, so an upper-case UUID refuses there through today's input refusal (§ 10). The commands' input schemas
admit a UUID, upper case included, beside a slug, where today `RenameCommandInputSchema` (`handlers/lifecycle.ts`) takes
`SlugSchema` for both of rename's operands and `ErrandCloseInputSchema` and `ErrandAbandonInputSchema`
(`handlers/errand.ts`) for the Errand's.

#### 1.2 A UID operand

No lookup arm finds a primary by UID (`LookupInputSchema`, `lib/store/lookup.ts`), so a UID operand scans listings
through `readWorkItemByUid` (`lib/store/work-item-uid.ts`). It lists `work-item/meta` and `work-item/record`, returns
the primary carrying the UID with its kind or none, refuses `ambiguous-match` where several carry it, and returns
`incomplete` on an unreadable listing or one with diagnostics. It gains the primary kinds it lists as a parameter,
today's two by default for teardown and the inbox list, and matches the UID on any owner that carries one, where today
it matches work-item owners alone. The rename and the cohort verbs pass `cohort/document` beside the two, so one scan
serves them, and a UID selecting both a work item and a cohort refuses `ambiguous-match` naming both.

Each verb applies its own type rule to what the scan returns:

| Verb                                     | Work unit (`work-item/meta`)        | Errand (`work-item/record`)              | Cohort (`cohort/document`) | None                |
| ---------------------------------------- | ----------------------------------- | ---------------------------------------- | -------------------------- | ------------------- |
| `arc rename`                             | the work-unit arm (§ 2)             | refuses, naming `arc errand close <uid>` | the cohort arm (§ 5)       | refuses `not-found` |
| `arc cohort close`, `arc cohort remove`  | refuses, naming the work-unit verbs | refuses, naming `arc errand close <uid>` | the verb (§ 8)             | refuses `not-found` |
| `arc errand close`, `arc errand abandon` | refuses, naming the work-unit verbs | the verb (§ 9)                           | not scanned                | refuses `not-found` |

An `incomplete` scan refuses with its condition and remedy, as teardown's does. A `not-found` refusal names the UID and
says to pull state or check the UID. The rename and the cohort verbs take no lineage arm: a retired origin's UID names
no primary for them to act on.

#### 1.3 A slug operand

A slug operand resolves through `lookup({ kind: "slug" })`. The rename dispatches on the returned record's kind, as the
table above does for a UID: a work unit to the work-unit arm, a cohort to the cohort arm, and an Errand to a refusal
naming `arc errand close <uid>`. A refused lookup returns its refusal whole, `candidates`, `tie`, and remedy included,
which § 3.1 makes the clash's repair. The cohort verbs refuse a slug returned as a work item, and the Errand verbs keep
their own slug reads (§ 9.1).

### 2. Rename: the work-unit arm

#### 2.1 The subject

The arm starts from the record § 1 selected and reads nothing about its subject by name again. The selection replaces
`readStoreRenameSubject`'s `readWorkUnit` read; the rest of that function stands: the complete inventory read, the
Candidate check, and the Integrating advisories, over the lifecycle view, which lists every holder under a clash
(`readLifecycleView`, `lib/store/lifecycle-view.ts`). `renameOrigin`, which recovers a resumed rename's original name from
the subject's history, already reads by the subject's reference. A completed subject is renamed as today: an archived
work unit's rename rewrites its own records and, but for § 4's exception, its cohort document's member heading.

The retry and the typed continuation repeat the operand the person gave, a UID or a slug: `renameSteps`' `retryCommand`
and `finishRename`'s remedy argv (`lib/work-unit/verbs/rename-store.ts`) take it in place of the subject's original
name and the requested source slug. A rerun by slug resolves the subject's current name, which on a resume is the
target and is free for the subject itself (§ 2.2).

#### 2.2 The target takes the shared admission check

The target slug runs `checkCreationAdmission` with the subject as its writing owner, replacing the arm's own collision
check, which refuses any slug the lookup returns as anything but the subject (`readStoreRenameSubject`). Its answers:

- **Free** — the lookup finds nothing; returns the subject itself, so a resumed rename and a rename back to the
  subject's former slug land; or returns a completed work unit under the slug as its current name, the latest of
  several and above a completed Errand, so a completed work unit's slug is reusable as at creation.
- **Held** — a live holder under the slug as its current or a former name, or a live tie. The rename refuses.
- **Refused** — a completed Errand or cohort, a completed holder under the slug as a former name, a completed tie the
  lookup leaves refusing, a read refusal, a holder with unresolved conflicts, or a tie refused without its `tie`. The
  rename refuses.

The check reads conflicts before ownership, so a subject with unresolved conflicts refuses as any holder does. A held
or refused answer renders through `renderCreationAdmissionRefusal`, naming each holder by type, current name, and UID;
its remedy is to choose another name, or wait for a current-name holder to complete, or, for a read or lookup refusal,
that refusal's own, since the person's own write is what needs another slug. An abandoned or decomposition-retired
work unit's slug is free once its primary is removed, since the lookup no longer finds it.

#### 2.3 Edges naming the reused slug

A rename onto a reused slug settles in its batch the edges naming that slug that it may write, as creation does:

- **Stubs' edges** through `settleCreationSlugEdges` with the subject as writing owner: an edge on shipped work
  discharges, and an edge on a retired origin takes its lineage disposition. The settler leaves the writing owner's own
  records to its caller and binds the records it read as the batch's observations. Each stub takes one put: the
  rename's sweep (§ 4) runs over the settler's output. A stub whose edges name both the subject's current slug and the
  target refuses the batch through `work-item.slug-edges`, since after the sweep its one edge on the target names the
  subject and the rule reads it as the prior holder's (`survivingEdge`); the rule's remedy lets anyone edit a stub's
  edge, and settling or dropping the stub's edge on the target lets the rename land.
- **The subject's own edge** naming the target, in the subject's own meta write: discharged where the slug's prior
  holder shipped, and replaced or dropped by the retired origin's lineage disposition otherwise, through the same
  resolver and slot replacement (`resolveRetiredEdge`, `lib/store/retired-edge.ts`; `replaceDependencySlot`,
  `lib/store/dependency-slot.ts`). Left in place, the edge would name the subject itself, and the slug-edge rule counts
  the subject's surviving edge like any other.
- **An in-flight or parked dependent's edge** refuses the batch through `work-item.slug-edges` (`checkSlugEdges`,
  `lib/store/kinds/work-item/slug-edges.ts`) with its remedy, since only that dependent's owner settles it.

#### 2.4 The subject's checkout

The arm finds its subject's checkout by UID through `findWorkUnitHoldingCheckout`, so under a clash it never takes the
other holder's, and a checkout on another machine stays bound to the subject by its UID through the rename. Where the
lookup meets an unbound marker naming the subject's current or a former slug, the rename refuses before its batch with
the unbound holder's report: the work units holding the slug as their current name and whatever the slug lookup returns
or ties, each by UID, and the marker's exits. Under a current-name clash, materializing by slug refuses, so the exit is
the unnamed `arc locus release`, run in that checkout; release removes a spawned checkout but only the marker of an
anchored one (`releaseCheckout`, `lib/locus/release.ts`). The marker names only a slug, so the released checkout may be
either holder's. After the rename, the person whose work it holds brings it back: by `arc materialize <new-slug>` for the
subject's, and by `arc materialize <slug>` for the other holder's, which the slug then resolves to. Each takes `--here`
where release kept the checkout, since a checkout with no marker passes materialize's occupancy guard
(`readStoreOccupancy`, `lib/work-unit/lifecycle-guards.ts`).

#### 2.5 The branch step

Today the step finds the local branch by name alone, `<prefix>/<slug>` (`branchRename`), and renames whatever branch
holds that name (`reconcileRenameLocalBranch`, `lib/work-unit/rename-identity.ts`), while two holders' links can name
one branch: two live holders under a clash, and a live and a completed holder under reuse. From the flip, the first run
decides each branch step from `lookup({ kind: "ref" })` of the branch the subject's link names, read before its batch,
as teardown's branch gate reads it (`teardown-store.ts`):

- **The local branch** is renamed and the link moved where the subject's own checkout on this machine has the old
  branch checked out, or where the lookup returns the subject. Where the lookup returns the subject but this machine
  has no copy of the branch, the rename refuses before its batch, as today (`reconcileRenameLocalBranch`). Otherwise
  the arm takes today's shape for a work branch not named after the slug: no branch step, the record's branch link
  unchanged (`renameMutation`, `lib/store/lifecycle-rename.ts`), and the branch reported kept (`keptBranches`), with
  the catch-up rename below to run on the machine holding the subject's checkout. With no clash and nothing else
  linking the branch, the lookup returns the subject, so today's rename is unchanged.
- **The new name is pushed** where the link moved and the old branch was published (`reconcileRenameRemoteBranch`), on
  the first run or a continuation.
- **The old remote branch** is deleted only on the first run, after the preservation check
  (`requirePublishedPreservation`), where the link was created rather than adopted and the lookup returns the subject,
  a completed holder, or nothing. Where it returns another live holder or refuses, the branch is kept, as an adopted
  branch's is today (`keepOld`), and the result reports it.
- **A continuation never deletes the old remote branch.** A rerun after a failed push or a refused delete pushes what
  remains and reports the old branch kept. A rerun cannot re-decide on the first run's evidence, since the batch has
  moved the subject's link and the other holder may have moved its own since, so the continuation takes the outcome
  that is safe either way. Today's rerun deletes it; the report now leaves that to the person.
- **The preservation check's remedy names both readings.** The lookup says who links a remote branch, not whose commits
  it holds, so where the old branch holds commits the new one lacks, the refusal says to merge them into the new branch
  and delete the old one if they are this work unit's, and to leave it if the branch is another's; a continuation then
  completes the rename with the branch kept.
- **A catch-up run moves a branch the first run left.** Rerunning the rename with the subject's current slug,
  `arc rename <uid> <slug>`, from anywhere on the machine holding the subject's own checkout, found by UID as on a first
  run, where that checkout has checked out a branch its link names after a former slug of the subject, renames that
  local branch to `<prefix>/<slug>`, moves the link in a link-only batch, and pushes the new name, keeping the old
  remote branch as any continuation does. Elsewhere a continuation still runs no local step (`persistRename`), and the
  branch step matches only a branch named after the current slug (`branchRename`), so without the catch-up nothing would
  move the link.

So where both holders link one branch, the rename lands from any machine, a released or remote-only subject's among
them, and a checkout elsewhere keeps the branch its link still names; the other holder's later rename, run where its
own checkout does not hold that branch, leaves it alone. Under a clash whose other holder links no branch, a cohort or a
Planning work unit, the lookup returns the subject, so the rename needs the branch where it runs.

One residual stays: teardown leaves a completed holder's local branch wherever the branch-link lookup resolves it to a
live holder, so on a machine still holding it — after a clash whose other holder completed first, or under ordinary
reuse of a completed work unit's slug — the live holder's later rename finds that branch under its own link and renames
it as its own. That rename can be reversed, and the old remote branch's deletion still meets the preservation check and
its two-sided remedy.

#### 2.6 History rounds

A batch writing completed records refuses `state-unresolvable` naming a history ref where the clone lacks one
(`resolveArchivedReferences`, `lib/store/ref/archive-resolution.ts`), naming the first it meets. In place of
`runStoreRename`'s one retry, the arm pulls the refs each refusal names and retries, round after round, until the batch
lands or a round's refusal names only refs already pulled; the rounds are bounded by the completed records the batch
writes. Renaming an archived work unit also rewrites its cohort document's member heading, but for § 4's exception,
and archive commonly closed that cohort with it, so the batch can write two completed records. Each round pulls through
`pullHistoryForRetry` (`lib/store/pull-consumption.ts`), with the behavior § 11.1 expects of it, and adds no pull policy
of its own: a false return ends the rounds with the refusal the round holds, the pull having written its notices, a
designation question among them, through the arm's notice writer (`writeNotice`).

#### 2.7 A former-slug tie after the batch

Renaming the second holder of a repaired clash away from the slug leaves both holding it as a former name, which the
lookup then refuses, since a renamed holder keeps every former slug (`formerSlugs`, `lib/store/ref/write-rename.ts`).
After its batch the rename looks the old slug up and, where that refuses `ambiguous-match` with `tie.name: "former"`,
reports the tie and its repair: name the intended holder by its current name. Rename pulls only the history refs a
refusal names, so a tie two machines' renames make shows in neither run's view; it surfaces after a pull, at the next
lookup of the slug, whose remedy names the same repair (§ 3.1). The tie resolves once all but one holder completes.

### 3. Clash remedies

#### 3.1 The slug lookup's refusal

Both backends' slug arm builds an `ambiguous-match` refusal's remedy with `clashRepair(candidates, tie)`, in place of
today's "Name the intended owner by UID and rename one to a free slug, then repeat the lookup" (ref backend) and
"Disambiguate the stored names or links, then repeat the lookup" (reference backend). `clashRepair` returns one
`Remedy` from the holders' types and the tie's kind:

- **A live current-name clash:** the preferred move — rename a cohort holder (`arc rename <uid> <new-slug>`), else close
  an Errand holder (`arc errand close <uid>`), else rename either work unit. Renaming a cohort leaves the slug with the
  other holder and keeps it only as the cohort's former name; a closed Errand ranks below a work unit once both
  complete. Renaming a work unit off a clash with a cohort or an Errand instead leaves its former name resolving to the
  other holder.
- **A live former-name tie:** name the intended holder by its current name.
- **A completed tie** the lookup leaves refusing: no lifecycle repair, naming each holder's UID.

Its argv is `arc errand close <uid>` where that move runs as printed, and `arc status --json` otherwise, since a rename
takes a slug the person picks. Most readers print a refusal's condition and remedy as given, so this remedy and § 3.2's
reach each reader that meets a clash through the lookup or a read by name: session entry, `arc status <slug>`,
`arc view cohort`, archive's cohort read, the lifecycle verbs, and decomposition's refusals among them.

The lookup's lineage, commit, and claim arms, whose ties no rename ends, take "Name the intended owner by UID, then
repeat the lookup" in place of today's shared text, which also says to rename one to a free slug.

#### 3.2 A read or write by name

A typed read or write that names its record by slug alone binds the name within the reference's own family
(`resolveCapturedReference`, which `resolveNamedRefWrites`, `lib/store/ref/write-names.ts`, runs for a write before
`resolveOwner`, `lib/store/ref/write-resolution.ts`, resolves its owners). Its `ambiguous-match` refusal gains the `tie`
its ranking tier gives, `liveness` and `name`, as the slug arm sets it, and its remedy is `clashRepair`'s for that tie,
a completed one included: no lifecycle repair, naming each holder's UID. The remedy reads each holder's primary kind,
since a read of a secondary kind keeps the requested kind on its candidates. A write's names bind there (`bindName`)
before `resolveOwner` runs, so a write by name refuses with the same remedy. `resolveOwner`'s own refusal of several
candidates keeps § 3.4's text for the lineage owners it is handed (`lineageOwnerCandidates`), and otherwise takes
`clashRepair`'s for a live current-name tie. The lifecycle renderers print a refusal's own remedy (`refuse` and
`refuseWithRemedy`, `handlers/lifecycle-shared.ts`; the paused-work disposition, `lib/session-init/paused-work.ts`) in
place of rebuilding `clashRepair` from any `tie`, so each lookup arm's repair reaches them as the store built it.

#### 3.3 A branch-link tie

The branch-link lookup's `ambiguous-match`, whose `tie` carries `liveness` alone, takes a remedy from
`branchLinkRepair(candidates, tie, branch)` in `lib/store/clash-repair.ts`, not `clashRepair`, whose moves would not move
a link; `branch` is the branch the lookup names, since neither the tie nor a holder's reference carries the link. A
completed tie — only Errands link the branch, and every one is closed (`refCandidates`) — takes the completed text
`clashRepair` gives: no lifecycle repair, naming each holder's UID. A live tie's remedy names, per holder, the move that
takes its link off the branch, run on the machine holding that holder's checkout:
`arc rename <uid> <new-slug>` for a work unit, or the catch-up `arc rename <uid> <slug>` for one whose current slug no
longer names the branch (§ 2.5), and `arc errand close <uid>` for an Errand, which links its `chore/<slug>` branch as
created and which no rename moves. Its argv is `arc status --json`. Only the branch lookup's readers meet the tie:
teardown's gate, which leaves the branch and reports it, and two session-start checks, each warning with the refusal's
remedy — the orphan-branch sweep (`readOrphanStoreCandidates`, `lib/session-init/orphan-store-candidates.ts`, through
`resolveStoreBranch`) and the missing-worktree check (`readStoreMissingFolderActions`,
`lib/session-init/missing-worktree-store.ts`). Session start resolves a live checkout's work unit by its claim, never
through its branch, so the first rename run's report of the branch kept is what names the catch-up. The tie lasts until
one holder completes, the lookup then ranking the live one first, or one holder's link moves: the other holder renamed
on the machine holding its own checkout, or the subject's catch-up run.

#### 3.4 Remedies that stay

- **Namespace admission's refusal** of a create or rename onto a held slug (`checkLiveNamespace`) answers the person's
  own write, whose repair is another slug.
- **A lineage origin's ambiguity in a write** (`resolveCapturedLineage`; `resolveOwner` over `lineageOwnerCandidates`)
  keeps "Name the intended origin by UID, then retry".
- **The reference backend's identity index** (`indexIdentities`, `__tests__/helpers/store/identities.ts`), which
  refuses a same-type live clash after every write and at pull and push, keeps its remedy to give the colliding owners
  distinct names by UID, since one candidate may be a UID only the refused batch or the remote holds.
- **The in-repo implementation,** which holds no UIDs and no clashes, keeps its own.

#### 3.5 Write rules pass the remedy through

`meta.cohort` and `cohort.parent` observe the cohort a field names through `observeRecord`
(`lib/store/kinds/rule-support.ts`), and `meta.depends-on` each new edge through the slug lookup; each keeps only the
refusal's condition under fixed remedy text (`checkMetaCohort`, `checkMetaDependsOn`, `parentProblem`). Beside
`observeRecord`, which maps an `ambiguous-match` to `unavailable`, `observeNamedRecord` returns
`{ status: "ambiguous"; condition; candidates; tie?; remedy }` for one. `meta.cohort` and `cohort.parent` read through it
and report the refusal's condition with the store's remedy, and `meta.depends-on` reports an ambiguous edge's condition
with the lookup's remedy, several such edges joining their texts under `arc status --json`; so an edit naming a clashed
cohort or slug names the repair. `observeRecord` and its other consumers stay as they are, since a consumer that
returns early only on `unavailable` would read an added status as known (`observeInboundHeld`); § 7.1 reads the
`ambiguous` observation's candidates.

#### 3.6 Status's clash warning

Status's `slug-clash` warning (`clashWarning`, `lib/status/store-project-standing.ts`) keeps naming each work-unit
holder by UID, owner, and location, and replaces "Rename one holder to repair the clash" with
`clashRepair`'s text for its holders, under a live current-name tie. It lists live current-name clashes between work
units only, since the standing selection (`selectStandingLifecycleEntries`, `lib/store/lifecycle-standing.ts`) groups
the lifecycle view's work-unit entries and status warns on its current-name clashes alone; a clash involving a cohort
reaches status through the slug lookup's refusal at the reads that meet it.

#### 3.7 Where a clash surfaces

A typed reference binds within its own family: a cohort read resolves a name among cohorts alone, a work-item read
among work items (`resolveCapturedReference`). So a clash between a work unit and a cohort refuses only where a name
resolves across both families, through the slug lookup. A clash between two cohorts also refuses in every cohort read
by name: the active work unit's frame reads its cohort document by name (`readStoreCohortDoc`,
`lib/locus/subject-meta.ts`), so session entry and status refuse for each of that cohort's members; archive's cohort
read (`prepareObservedCohorts`) refuses too; and a work unit's rename reads its cohort document by name to rewrite its
member heading (`acquireRenameGroups`), so a member of either cohort cannot be renamed until one cohort is, since text
alone cannot say which document holds the heading. Each refusal names the cohort rename through § 3.2. Status lists no
cohort clash: one arises only from a create or rename that two machines, or two processes on one machine, make at
once, or from a decomposition race, and listing it would read every cohort.

### 4. A rename rewrites only the references that resolve to its subject

A rename always writes its subject's own records: a work unit's record group, or a cohort's document with its heading. A
work unit's rename also rewrites its member heading in the cohort document its own `Cohort` names, which it reads
through that path (`acquireRenameGroups`), unless another work item holding the old slug as its current or a former name
holds that cohort too (§ 7.1). The heading's text, which `rewriteCohortMemberHeading` matches, cannot then say whose
heading it is — as after a doubled cut, where a duplicate stub and its original both hold the original cohort — so the
rename reports the heading with its edit. It rewrites another record's reference to the old slug only where that slug,
resolved within the family the reference names, names the subject alone (`resolveCapturedReference`). A member's
`Cohort`, a subcohort's `Parent`, and a `` `cohort-<slug>.md` `` filename name cohorts; a stub's `Depends On` edge or
`waits-on` and a backticked work-item filename name work items. Every reference of one family to one name resolves
alike, so the verb resolves once per family before its batch:

- **The slug names the subject:** the rename rewrites those references as today's work-unit rename does — stubs'
  `Depends On` and `waits-on`, and backticked filenames in stubs' records and in the cohort document the subject's
  `Cohort` names (`acquireRenameGroups`; `planRenameReferences`, `lib/work-unit/rename-reference-sweep.ts`;
  `renameMutation`) — and the cohort arm its sole holdings (§ 5.1). A clash between a work unit and a cohort is this
  case, since each family holds one of them. A started dependent's edge keeps the old slug, as today; once the work unit
  is renamed off a clash with a cohort, the slug resolves to the cohort, and the dependent's reconcile takes a retired
  origin's lineage disposition where one names the slug and otherwise holds the edge unsatisfied with a diagnostic
  naming the cohort, so the dependent activates (`planStoreDependencyReconcile`). The rename reports each such edge with
  the edit that re-points it.
- **The slug is ambiguous** — another holder of the same family shares it: text alone cannot say which holder each
  reference means, so the rename rewrites none of them and reports each with the edit that re-points it — a stub's by
  anyone, a started work unit's by its owner. Once one holder keeps the slug, each such reference resolves to it, and
  `meta.cohort` admits each edit. A subcohort takes three edits, each its own write, since `cohort.parent` and
  `meta.cohort` check its `Parent` and its open members' paths against each other: its open members' `Cohort` cleared,
  its `Parent` set to the renamed cohort's new slug, then their `Cohort` set to `<new-slug>/<child>`. Its completed
  members' `Cohort` is set to the same path after the second edit, each by its owner, who edits archived work in place,
  with no clearing, since `cohort.parent` checks open members alone (`observeOpenMembers`,
  `lib/store/kinds/cohort/check-support.ts`). The report names the edits in that order. A closed subcohort is reported
  and stays with the holder that keeps the slug.
- **The slug names another holder** — an ended subject whose slug a live item has reused, which the lookup ranks above
  it: those references are the live holder's, and the rename leaves them unreported.

The report is part of the rename's result, in its text and in `--json`, which `arc rename` gains for it: each reference
to the subject this rule leaves, its member heading among them, the record holding it by type, name, and UID, and the
edit, as the command or field change that re-points it. A member heading's edit is a change to its document's text,
rewriting that heading line to the new slug where the heading is the subject's; its `--json` entry carries the document,
the line, and the replacement, with no command. Prose the rename never rewrites — a started member's prose and a closed
document's text (§ 5.1) — is not reported.

### 5. Rename: the cohort arm

#### 5.1 The batch

The cohort arm renames an open cohort and refuses a closed one, which nothing renames. Renaming a cohort writes one
version-checked batch:

- **The document** under its new name, the backend recording the former slug (`prepareRefRenames`,
  `lib/store/ref/write-rename.ts`), with its `# Cohort:` heading rewritten, and its own `Parent`, where that names its
  parent by a former slug, rewritten to the parent's current slug, so its members' rewritten paths agree with it.
- **Every record holding the cohort by a sole holding** (§ 7.1): every member's `Cohort`, open or completed, started
  members included — a direct member's and, for a parent, its subcohorts' members' — and every subcohort's `Parent`,
  open or closed, when the renamed cohort is a parent. Each `Cohort` is rewritten to the current path of the cohorts its
  segments resolve to, with the new slug in the renamed cohort's segment, so a record left on a former slug in either
  segment is rewritten whole: renaming a subcohort `s` of `p` to `t` turns its members' `p/s` into `p/t`, and renaming
  `p` to `q` turns them into `q/s`. A `Parent` takes the new slug. An ambiguous holding is not rewritten; § 4 reports
  it.
- **References to the document's filename,** `` `cohort-<old>.md` ``, in stubs and open cohort documents — a parent
  cites its subcohorts' documents by filename — rewritten by the cohort arm itself where the old slug names the cohort
  alone (§ 4). The work-item sweep cannot serve: it leaves every `cohort-` reference unchanged
  (`rewriteBacktickedArtifactReferences`), and run with a cohort's slug it would rewrite work-item edges sharing the
  text.

A rename changes no membership — every member stays in the same cohort under its new name — so it is the verb's identity
write, not an owner's membership move. The batch is also the only shape the checks admit: `cohort.parent` requires open
members' paths to agree in it, every membership reader § 7.2 does not name matches a path's text
(`cohortMembersWithDescendants`, `lib/work-unit/lifecycle-membership.ts`), and the projection lays out each member's
folder from the field. Completed members and closed subcohorts take the same write, since the ref backend's close letter
reads closed subcohorts' `Parent` text (`preparedCohortParents` through `collectArchivedParents`, feeding
`cohortClosePlacement`, `lib/store/ref/cohort-coordinates.ts`), and a text-matching reader would otherwise miss them.

A started member's prose keeps the former name, as a started dependent's `Depends On` does, and a closed cohort's
document keeps it as written. An edge naming the cohort's old slug — one the cohort took from a retired origin, as
creation's admission allows — stays too: the dependent's reconcile takes the origin's lineage disposition where one
names the slug, and otherwise holds the edge naming the cohort.

#### 5.2 The writers

No writer in the cohort kind's folder rewrites the heading or `Parent` today; creation writes both only as it renders a
document (`writeCohortDocument`, `lib/store/kinds/cohort/creation-writer.ts`). Two join `rewriteCohortMemberHeading`
(`member-heading-writer.ts`) there: `rewriteCohortHeading(content, slug)` for the `# Cohort:` line, and
`writeCohortParent(content, parent)` for the `**Parent:**` field. Members' paths take the meta kind's
`writeMetaCohort` (`lib/store/kinds/meta/bullet-writers.ts`).

#### 5.3 Completed records and history

Each completed member and closed subcohort is a write to a completed item in place, which the ref backend admits since
its namespace admission compares live holders alone and admits a write that leaves its primary ended
(`checkLiveNamespace`). A completed member's new path takes `meta.cohort`'s rule for a completed meta (§ 6.2), since a
closed subcohort's members name a completed cohort, and an open straggler of a closed subcohort (§ 8.4) its rule for an
open meta re-pointing a holding. Where the clone lacks history refs, the arm takes § 2.6's rounds.

#### 5.4 The target

The target slug must be free of every holder: its lookup finds nothing, or returns the subject (`sameReference`), the
check `readStoreRenameSubject` makes today, which the cohort arm keeps as its own while membership names cohorts by
path. The lookup spans current and former slugs, live and ended, wherever a holder's primary remains
(`preferredNameTrees`, `lookupPrimary`), so a cohort never takes a slug any holder's name resolves through, a completed
work unit's included. An abandonment or a decomposition's retirement removes the work unit's primary, so the lookup no
longer finds its slug and the rename may take it, as creation may; an edge still naming it takes that unit's lineage
disposition first. A taken target refuses naming each holder the lookup returns or ties, by type, current name, and UID,
as `renderCreationAdmissionRefusal` renders holders (§ 2.2), with the remedy to choose another slug.

#### 5.5 A stored cut map naming the cohort

A cut's `--finish` reads its cohort by the stored map's path and refuses `cohort-parent` on a renamed document, naming
`--revise`, which re-places the cut's placement (`acquireTerminalCohort`, `lib/decompose/acquire-terminal-targets.ts`).
The rename adds nothing there.

### 6. A path names a cohort by its current slug

#### 6.1 The rule

`meta.cohort` and `cohort.parent` admit a path segment only where it is the named cohort's current slug. Both read the
document by name (`observeRecord`), and binding by name admits a former slug (`preferredNameTrees`), so today a
`Cohort` edited back to a renamed cohort's old name passes while every text-matching membership reader misses the member
— and `cohort.open-members` would let the cohort close or be removed under it. A segment resolving through a former slug
refuses, naming the current one. `checkMetaCohort` reads the leaf segment's document and compares the first segment as
text with that document's `Parent`, so a renamed parent's old name in the first segment refuses only while the leaf's
`Parent` is current — a pull can leave it on the former slug (§ 7.1), and then `<former>/<leaf>` agrees as text — and
that refusal names no current slug. So the rule resolves every segment: the leaf, a one-segment path, the first segment,
and the parent `cohort.parent` names.

#### 6.2 The open-cohort requirement applies to an open meta joining a cohort

A completed meta's changed `Cohort` — the cohort rename's write to a completed member — names an existing cohort by its
current slug, open or completed, with the path agreeing with that cohort's `Parent`. Today `meta.cohort` refuses a path
whose cohort is completed whatever the meta's own placement (`checkMetaCohort`), and the ref backend runs each
registered check on every write in a batch (`checkRefWrites`, `lib/store/ref/write-checks.ts`), so renaming a parent
could never rewrite a closed subcohort's completed members. An open meta's changed `Cohort` may name a completed
cohort only where its prior `Cohort` named that same cohort, its leaf segment in the view before the write resolving
to the owner the new leaf names in the view after it: the write re-points a holding rather than joining a cohort.
`cohort.parent` admits the closed subcohort's own `Parent` rewrite (`checkCohortParent`): the renamed parent is open
and top-level, and the subcohort's open members — only § 8.4's straggler, a record another machine wrote meanwhile —
take the rewritten path in the same batch, which that admission lets `meta.cohort` pass.

### 7. Counting a cohort's holders by resolution

#### 7.1 The rule

A record can be left on a cohort's former slug after its rename, which then counts by text no longer see:

- **A member the rename rewrote, edited elsewhere.** The meta is single-writer (`KIND_MECHANISMS["work-item/meta"]`,
  `lib/store/registry.ts`). An owner's edit on the renaming machine that lands after the rename meets
  `version-conflict` and merges in the checkout, where § 6's rule refuses a merge putting the old path back. One made on
  another machine meanwhile becomes a whole-record conflict at the pull, whose current side is the one published first
  (`reconcileSyncRecords`, `lib/store/ref/sync-records.ts`): where the owner's edit published first, the old path stays
  current, and discarding the rename's side writes nothing, so no check runs.
- **A record written on a clone that has not pulled the rename**, to a ref the renaming machine has not written since,
  names the old slug, which that clone still holds: a stub created there, in its `Cohort`; an existing meta whose
  `Cohort` its owner sets there to the cohort's path, or whose extraction re-places it there as a cut's origin
  (`writeMetaCohort` in `prepareDecomposeExtraction`, `lib/decompose/extraction.ts`); and a subcohort a cut creates
  there, in its `Parent` and its members' paths. A pull fast-forwards a ref whose local tip is absent or an ancestor of
  the incoming one after a structural check of its tip alone (`prepareSyncMerge` through
  `prepareSyncHistoryFastForward`, `lib/store/ref/sync-merge.ts`; `checkRefTip`), the kind checks running only on a
  merged tree (`observeSyncChecks` in `mergeSyncTree`), so nothing reports it.

The rename repairs such a record (§ 5.1), and every retiring path refuses or stays open while one holds the cohort
(§ 7.2). A record holds a cohort where a segment of its path resolves to that cohort, or is ambiguous among holders that
include it, read from the `ambiguous` observation's candidates (§ 3.5); a segment resolving to another cohort or to
nothing holds none. A member's `Cohort` holds through each of its segments, and a subcohort's `Parent` through its one.
One helper in `lib/store/kinds/cohort/check-support.ts`, `observeCohortHoldings(candidates, resolve, cohort)`, takes the
paths its caller counts — each a member's `Cohort` or a subcohort's `Parent`, with the record it belongs to — and
resolves each distinct segment of them once in the view `resolve`. It returns each holding: the record, the segment that
holds it, whether that segment resolves to the cohort alone (`sole`) or is ambiguous among holders that include it
(`ambiguous`), and, for one on a former slug, the edit that re-points it. Where one edit alone would refuse — a
subcohort's `Parent` on a former slug while its open members' paths name it there, since `cohort.parent` and
`meta.cohort` check each against the other — the edits are § 4's three, in order, with the current slug. Each site lists
its own candidates, as below, and resolves in the view it lists from unless the list names another:

- **Open members and open subcohorts:** `arc cohort close`; `cohort.open-members`, listing from the view after the
  batch and resolving in the view before it; archive's trigger, listing from the view's lifecycle entries with the
  subject marked completed and from the open subcohorts less those the same batch closes, and resolving in the store;
  archive's closeout rule, in each of its two views; and the reports of a cohort left with nothing open — abandon's, and
  close's and remove's of a parent they empty.
- **Every record:** the cohort rename's members and subcohorts; a work unit's rename's other work items holding its old
  slug; `arc cohort remove`; and those reports' choice of naming the removal.

The sites below count sole and ambiguous holdings alike, but for the cohort rename, which rewrites the first and
reports the second.

#### 7.2 Where it applies

- **The cohort rename** rewrites its sole holdings and reports its ambiguous ones (§ 5.1, § 4).
- **A work unit's rename** asks whether another work item holding the old slug as its current or a former name holds the
  cohort its `Cohort` names, through `observeCohortHoldings` over those work items' `Cohort` in its store, before
  rewriting its member heading (§ 4); a sole or an ambiguous holding by such a record leaves the heading and reports it.
- **`arc cohort close` and `arc cohort remove`** count a cohort's holders, refusing while one holds it (§ 8). Under a
  clash of the cohort's own slug, every candidate naming it holds ambiguously — open records for close, every record for
  remove — so they refuse while one does, until one holder is renamed.
- **`cohort.open-members`** (`checkCohortOpenMembers`) applies it in place of matching text. It lists the open members
  and open subcohorts in the view after the batch, so a member the same batch archives no longer counts, and resolves
  each distinct segment of their paths in the view before it, where the retiring document still stands: the view after
  a removal holds no document, and its open-cohort listing skips a closed one (`observeOpenCohorts`). It counts an
  ambiguous segment only where its candidates include the retiring cohort, so a clash between two other cohorts blocks
  no retirement. Its condition names each record holding the cohort and, for one on a former slug, the edit that
  re-points it. So every close — archive's in-batch close, `arc cohort close`, and `arc cohort remove` — refuses while a
  record left on a former slug holds the cohort.
- **Archive's trigger** counts each cohort's open members and subcohorts by the same resolution, in place of
  `isArchivalTriggeredWithDescendants`'s text match. Its candidates are the lifecycle entries of the view archive already
  reads (`view.result.entries`), each carrying its reference, the subject marked completed by its reference, and the
  open subcohorts less those the same batch closes (`completing` in `prepareObservedCohorts`), resolved in the store its
  cohort preparation already holds. So where a record left on a former slug holds the cohort, archive lands the member
  and leaves the cohort open, reporting that record with the edit that re-points it, rather than refusing or closing the
  cohort under the member for good.
- **Archive's closeout rule** (`checkCohortArchiveCloseout`) counts by the same resolution in the views before and after
  the batch, in place of its text count (`observeOpenCohortHoldings`). Archive's transition batch writes a cohort it
  leaves open unchanged (`prepareObservedCohorts` with `protectOpen`), and a text count would miss the record on a
  former slug, see the last current-path member leave, and refuse.
- **Abandon's report** of a cohort its batch leaves with nothing open, and close's and remove's report of a parent they
  empty (§ 8.3), count the same way — open records for whether nothing open is left, every record for whether to name
  the removal — so the command each names never refuses on a holder the report missed.

#### 7.3 Every other reader keeps text

Status, the frame, the projection's layout, the cohort consistency check (`resolveCohortValidationContext`,
`scripts/validate-cohort-consistency.ts`), and every membership reader § 7.2 does not name keep matching a path's text.
Resolution sits on the retiring path, the irreversible one, and on the renames, whose writes would otherwise reach
another holder's records; a record left on a former slug reaches those readers only once its `Cohort` is re-pointed,
which the rename does and the retiring verbs' refusals name.

### 8. Closing and removing a cohort

#### 8.1 `arc cohort close <cohort>`

Places the document completed in the current quarter, the ref backend assigning the quarter's next sequence when no
member archives in the batch. It refuses while an open member or open subcohort holds the cohort, found by resolution
(§ 7.1), naming each with what would settle it, and `cohort.open-members` backstops it at the store, counting the same
way. No write reopens a cohort, so the verb prints what it will close and writes only with `--yes`, as work-unit
abandon prints its impact plan and proceeds only with `--yes` (`abandon [slug]`, `cli.ts`). It refuses a cohort already
completed.

#### 8.2 `arc cohort remove <cohort>`

Removes the document, for a cohort that never had a member and a race's leftovers. It refuses, naming
`arc cohort close`, while any record holds the cohort — a member, open or completed, or a subcohort, open or closed —
found by resolution, since removal would leave those records naming a document that no longer exists;
`cohort.open-members` backstops the open half at the store. It prints what it will remove and writes only with `--yes`.

#### 8.3 Explicit only, with abandon's report

Abandon does not close a cohort: abandoning a last member may be a re-plan, and a close cannot be undone. Abandon's
result reports a cohort its batch leaves with no open member or subcohort, counted by resolution, naming
`arc cohort close <cohort>`, or `arc cohort remove <cohort>` where no record holds it. A close or remove that empties a
parent reports the parent the same way. Decomposition's retirement or extraction can also leave a cohort with nothing
open; its result is decomposition's, so nothing reports the cohort there, and `arc cohort close` still serves.

#### 8.4 A record another machine writes meanwhile

A stub created, or a member's `Cohort` edited, on a clone that has not pulled a close or removal names the retired
cohort, and the pull lands it unchecked (§ 7.1). After a close, it is an open member of a closed cohort: archive skips a
completed cohort (`prepareObservedCohorts`), so the member still archives, and `meta.cohort` admits its next `Cohort`
edit only onto an open cohort or onto the closed cohort's own current path (§ 6.2), as its parent's rename writes it.
After a removal, its `Cohort` names no document. Archive's cohort read and the rename's member-heading read
(`acquireRenameGroups`), which follow the member's own `Cohort`, then refuse naming the member and the edit that clears
or re-points its `Cohort`, in place of the store's not-found remedy, "Pull state or name the owner by UID, then retry"
(`resolveCapturedReference`), which no pull repairs. The session frame already reads a missing cohort document as none
(`readStoreCohortDoc`).

#### 8.5 The command group

Both commands live in a new `arc cohort` group beside the rename `arc rename` serves, each with `--json` emitting its
typed result: the cohort's reference, its placement after the batch, and any parent reported.

### 9. The Errand verbs

#### 9.1 `arc errand close` and `arc errand abandon` take `<slug|uid>`

Errand close, abandon, and promote find their Errand through the slug lookup (`readReconciledCloseIdentity`,
`lib/errand/close-runtime.ts`; `readBasis`, `lib/errand/store-runtime.ts`; `readPrimary`,
`lib/errand/promote-store.ts`), which refuses `ambiguous-match` under a clash. A clash between two Errands ends when one
closes, so `arc errand close` and `arc errand abandon` take `<slug|uid>` by § 1's rule, a UID selecting one Errand's
`work-item/record` through `readWorkItemByUid`. Close and abandon end their Errand, as teardown ends its subject, so no
work proceeds on the clashed slug.

#### 9.2 The selected record replaces the slug

The record a UID selects replaces the operand wherever a verb uses it as the Errand's slug: close's identity read, its
check of the record's slug, its already-finalized fallback, and its head-lock recovery (`close-locus.ts`,
`close-runtime.ts`), and abandon's matching steps (`abandon-runtime.ts`, `abandon-locus.ts`); their later steps already
read by the record's claim. Close's head-lock recovery, which clears a lock whose receipt matches the slug alone, also
matches the selected record's claim (`recoverFinalizedErrandCloseHeadLock`, `lib/errand/close-head-lock.ts`, whose
receipts carry both), so closing one clashed Errand never clears the locks guarding the other's branch deletion. Their
confirmation retry (`renderRetry`) and close's off-branch retry (`renderOffBranchRefusal`), both in
`lib/errand/terminal-authority.ts`, repeat the operand given, as rename's continuation does, rather than the record's
slug, which refuses under the clash.

Abandon's inbox return (`prepareErrandReturn`, `lib/inbox/errand-return.ts`) takes the operand given, which its list
resolution already selects by UID, and compares the Errand holding an entry with its subject by UID rather than by slug,
so abandoning one clashed Errand never returns the other's held entries to the inbox. Both verbs resolve the operand
before they branch on protection: a partial Errand keeps no stored record, so a UID under partial protection refuses
`not-found`.

Two clashed Errands link one branch name, and close reads that branch's head by name for its merged evidence
(`resolveCloseChangeRequest`), checking it against the subject's checkout only where this machine holds one
(`readCloseOccupancy`). So where this machine holds no checkout of its subject and the branch-link lookup of the
subject's branch returns anything but the subject alone, close refuses before it reads the branch, naming the machine
that must run it: the one holding the subject's checkout. Elsewhere the head it reads is the other holder's, whose
merged change request it would record and whose refs it would delete. Abandon needs no such guard: its deletions compare
against the heads its record holds and keep a branch any registered checkout has checked out.

#### 9.3 Promote

Promote keeps its slug operand. Its refusal under a clash passes the store's remedy through rather than the condition
alone (`readPrimary`), so it names the clash's repair, `arc errand close <uid>` for two Errands; once the clash ends,
promote runs on the Errand left holding the slug. Its recovery matches the Errand's history by the promoted meta's
receipt (`promotionReceipt`) rather than by the operand (`recover`, `sourceFromHistory`), so a promotion under `--name`
that leaves a former-slug tie — `replace` records the Errand's slug as a former name of the promoted work unit — and
stops after its role write resumes when rerun by the new name, the tie's own repair, where today it refuses by either
name. A promotion leaving that tie reports none; the tie surfaces at the next lookup of the slug.

### 10. Before the flip

Nothing changes what a verb does today. The store arms of rename, archive, and abandon run only off-branch
(`usesOffBranchState`), and the kind write checks this change edits run only in the ref backend's write and pull paths
and the reference backend's (`checkRefWrites`; `observeSyncChecks`, `lib/store/ref/sync-checks.ts`;
`__tests__/helpers/store/write-checks.ts`), so their changes reach no pre-flip write.

- `arc cohort close` and `arc cohort remove` register and refuse `unsupported`, naming today's route — edits to the
  tracked cohort files, and archive's sidecar sweep — through `runDormantStoreCommand`
  (`commands/store-command-support.ts`), whose `DormantStoreCommand` union gains `cohort close` and `cohort remove`.
- `arc rename`, `arc errand close`, and `arc errand abandon` keep their in-repo arms unchanged and take every operand
  as a slug, since the in-repo implementation holds no UIDs. Unlike teardown, which passes its operand on unparsed
  before the flip (`runTeardownForOperand`), the in-repo arm parses each operand with `SlugSchema` once the store is
  open, since only the store says whether state is off-branch (`usesOffBranchState`), and refuses one it rejects
  through today's input refusal: `parseLifecycleCommand`'s for rename, and `locus.errand-close.input` and
  `locus.errand-abandon.input` for the Errand verbs. Today that parse runs first, so where an operand that is a UUID but
  not a slug also meets a refusal the verb reaches before its store opens — identity, the project root, configuration
  such as `branch.protection` and `branch.base`, the stdin Git boundary, or the store's own open — that refusal now
  shows first.
- `arc rename --json` (§ 4) gives either arm's result and refusal one form: before the flip the in-repo arm's result
  carries an empty report, and its text output is today's.
- Promote's recovery and refusal changes are in its store arm, which runs only off-branch.
- The remedy builders, the `observeNamedRecord` observation, and the cohort writers are pure or store-side additions whose
  only callers are the paths above.

### 11. Order and dependencies

#### 11.1 Expected contracts from the ref-backend hardening

The ref backend's hardening (`storage-ref-hardening`) lands whole before this change's ref-backend phases. This design
relies on three of its contracts, which are not shipped at this writing:

- **Pull consumption.** `pullHistoryForRetry` keeps its boolean result: on a designation question it writes the
  question and its remedy as a notice and returns false, so its caller returns the refusal it holds. Every other pull
  consumer outside the store's sync internals renders a designation question as a notice too. § 2.6's rounds call it
  unchanged and end on a false return.
- **Fault classes.** A missing object is a recoverable `state-unresolvable` naming only the history refs a pull can
  restore, and a missing object with no history to pull returns its refusal unchanged, so § 2.6's rounds end on it.
- **Listing scope.** Live listings take the owner scope of as-of listings, for records and diagnostics alike, and a
  listing with no records and no diagnostics is `absent`. § 1.2's scan and § 7's resolution read through listings.

The phases that observe those surfaces — the rename's store arms and history rounds, the UID scan, the cohort verbs,
and the counting rule — implement after the hardening lands. The phases that touch none of them — the command
registrations and pre-flip refusals, the remedy builders, the cohort writers, and the write rules — may run before it.
Should the dependent phases be ready while more than about a week of the hardening remains, the hardening's decision
to land whole returns to the Owner.

#### 11.2 Shared files

`cli.ts` and `lib/store/lifecycle-rename.ts` also change on `feat/seam-delivery-review`, which has not landed: merge base
after it lands, before implementing in those files. `handlers/lifecycle-shared.ts` changes there too, outside the
renderers § 3.2 changes, so work there does not wait for it; expect a merge.

#### 11.3 Shared-decision records

This change alters four of the storage seam's shared decisions and one of the storage program's, recorded beside each
item in the cohort documents' § Shared contracts, dated and stating the decision as it now stands: in
`cohort-storage-seam.md`, the writers of `Cohort` (item 1), the rename's rewrites only where a slug resolves to its
subject (item 3), the cohort document's writers and counting (item 7), and the write check's current-slug and
open-members rules (item 11); in `cohort-state-storage.md`, D14's clash refusals and what their remedies name. The
status warning's text, decomposition's remedies, and the rename's branch handling stay in this spec alone.

## Alternatives & Rationale

- **Splitting this change.** Rejected: rename by UID, the cohort rename, close and removal, and the Errand verbs' UID
  operand are one concern — identity commands for owners in the shared namespace — over shared files (`cli.ts`, the
  rename verb, the cohort kind's writers), and no piece is worth shipping alone. The spec ran about 950 lines at its
  creation (2026-10-31), below the 1,500 at which the boundary returns to the Owner; the task list's size and phase
  count are checked when it is generated, and § 11.1 states when the hardening's ordering returns to the Owner. At task
  generation (2026-10-31) the task list reached about 1,060 lines in six phases, with about 9,000 to 11,000 changed
  lines forecast, past the 1,000-line mark, and the Owner held it whole: the storage program's work units land on one
  branch with chunked review, so one review of the whole change set holds as three chunks along the hardening's seam —
  the clash repairs, path rules, writers, and command surface; the Errand exits and the cohort's retirement; and the two
  renames.
- **A clash remedy naming every holder's repair, unordered.** Rejected for `clashRepair`'s one preferred move: every
  surface then shows the same text for one clash — the lifecycle refusal already prints it — and the move it skips,
  renaming a work unit off a clash with a cohort or an Errand, leaves the old slug resolving to the other holder, which
  refuses the personal notes reconcile for anyone whose notes name it and leaves another work unit's pause waiting on
  a slug a cohort holds.
- **Rename for work units only, with `arc cohort rename`.** Rejected: a clash's remedy would name a different command
  per holder's type, and one command form repairs any clash.
- **Cohorts through `arc archive` and `arc abandon`.** Rejected: those carry work-unit ceremony — branches, checkouts,
  Candidate state — that has no cohort meaning.
- **UID subjects on every lifecycle verb.** Rejected: a UID-addressed archive or activation lets work proceed on a slug
  that stays clashed. Rename, teardown, and the Errand close and abandon end or repair the clash, so they take one.
- **An Errand rename.** Rejected: closing one of two clashed Errands repairs everything a rename would.
- **A UID operand on promote.** Rejected: it serves no goal close and abandon do not, and once one clashed Errand
  closes, promote runs on the other by slug.
- **Started members on a cohort rename.** Rewriting stubs only, as a work-unit rename rewrites only stubs'
  `Depends On`: rejected, since every membership reader off the retiring path matches text, and `cohort.parent` refuses
  renaming a parent wherever an open subcohort holds a started member. Refusing while a member is started: rejected as
  a dead end, since an owner cannot point a member at a name that does not exist yet.
- **Completed members and closed subcohorts keep their shipped path.** Rejected: the ref backend's close letter reads
  closed subcohorts' `Parent` text, so it would change the backend's close code, and every text-matching reader would
  miss them.
- **Moving a clashed cohort's members by its `## Members` section,** or a `--member` flag naming them. Rejected: those
  sections are convention only and no store rule enforces them (`reportOrphanCohortMemberSections`), so they cannot
  authorize writes to started members' metas, and a flag is new surface for a cross-machine edge case the report and
  ordinary edits repair. A doubled cut needs neither: once the duplicate cohorts are renamed by UID, every path names
  the originals, and the duplicate stubs leave by rename and abandon.
- **Every membership reader resolving former slugs.** Rejected: it changes each reader and the projection's layout;
  resolution sits on the retiring path, the irreversible one, and on the renames' writes (§ 7.3).
- **Archive refusing, or leaving the cohort out of its batch, when a record on a former slug holds it.** Rejected:
  refusing blocks an unrelated member's archive, and leaving the cohort out drops the closeout rule's refusal of an
  archive prepared against stale membership.
- **Closing a cohort on abandon,** mirroring archive. Rejected: abandoning a last member may be a re-plan, and a close
  cannot be undone.
- **Close only,** every retired cohort into the archive. Rejected for documents that never held anything, which would
  take a sequence number.
- **The branch step.** Touching the local branch only from the subject's checkout: rejected, since a rename without a
  clash, run elsewhere, would leave the old branch name until a continuation ran there. Refusing under a clash except
  from the subject's checkout: rejected, since it needs a UID operand on `arc materialize`, which selects by slug.
  Keeping the old remote under any clash: rejected, since a continuation could not honor it. Re-deciding the old remote
  on a continuation from the lookup again: rejected, since its answer moves between runs. Carrying the first run's
  decision into the continuation: rejected, since it adds state to rename for a deletion that keeping always makes
  safe. The chosen rule follows Git's: `git branch -m` leaves an old remote branch to its owner, and the sequencer
  replays its recorded plan on `--continue` rather than re-deciding.
- **Taking the checkout the rename runs from as the subject's.** Rejected: both holders' markers name the slug, and
  nothing tells a person which holder their checkout holds; renaming the records alone leaves a name-only marker
  resolving to the other holder.
- **Listing cohort clashes in status.** Rejected: new reads across every cohort for a clash that only a create or
  rename two machines, or two processes on one machine, make at once, or a decomposition race, produces.
- **One history retry, as today.** Rejected: a cohort rename can write any number of completed records, and the backend
  names the first missing history ref only.
- **A backend refusal naming every missing history ref,** keeping one retry. Rejected: it changes the refusal contract
  on both backends, beside the hardening's own edits to archive resolution (`resolveArchivedReferences`), to save pulls
  only on a clone lacking several completed records' history, while the rounds work with whatever subset a backend
  names.

## Cross-cutting Considerations

### Testing

- **Both backends.** Every behavior from the flip is asserted over the ref backend's fixture and the reference backend,
  except where a backend cannot form the state. The reference backend refuses a same-type live clash after every write
  and at pull and push (`indexIdentities`), so same-type clash cases run over the ref backend or plant the clash
  (`produceAmbiguity`, `__tests__/helpers/store/reference-recovery.ts`); it admits a live work item and a live cohort
  on one slug, so cross-type cases run over it directly. Its reads by name resolve through its identity index
  (`canonicalReference`, `__tests__/helpers/store/model.ts`), which gives a name two live owners hold as a former slug
  to one of them, so name-binding ties — § 3.2's `tie`, § 3.5's `ambiguous` observation, and § 7's ambiguous holding —
  are asserted over the ref backend alone.
- **Cohort former names.** Both backends record a renamed cohort's former slug: the ref backend for any renamed owner
  (`prepareRefRenames`), and the reference backend's `land` for a `cohort/document` beside work-item primaries
  (`__tests__/helpers/store/write.ts`). So membership by resolution, `meta.cohort` refusing a former slug, and close and
  archive counting a record left on one are asserted over both.
- **Refusal and continuation.** Each recoverable refusal is asserted with its repair, and the repair's success path
  after it: a clash refused, then renamed or closed by UID, then the slug resolving to the remaining holder; a
  history-ref refusal, then rounds landing the batch; a held cohort, then the edit, then close.
- **No pre-flip change.** The in-repo arms' existing tests pass unchanged; `arc cohort close` and `arc cohort remove`
  refuse `unsupported`; and a UUID-shaped operand on `arc rename`, `arc errand close`, and `arc errand abandon` is
  taken as a slug, an upper-case one refusing through today's input refusal.

### Performance

The UID scan reads two listings (three for rename and the cohort verbs), as teardown's does. Counting by resolution
resolves each distinct path segment once per view, bounded by the number of distinct cohort names on open or completed
members' paths. History rounds are bounded by the completed records a batch writes.

### Compatibility and migration

ARC is pre-public: the `ambiguous` observation, the `tie` on name-binding refusals, the remedy texts, and the
rename result's report change in place, with no compatibility alias. No stored record changes shape, and nothing
migrates.

### User-facing impact

New commands: `arc cohort close`, `arc cohort remove`. New operand forms: `arc rename <uid>`, `arc errand close <uid>`,
`arc errand abandon <uid>`. New flag: `arc rename --json`, which emits the rename's typed result with its report, a
refusal through the lifecycle refusal's JSON form. Changed text: every clash refusal's remedy, status's clash warning,
and rename's report of the references it leaves and of a former-slug tie. Help text for the new operands states the UID
form.

### Security

No trust boundary changes: the commands act on records the person can already write, through the store's write checks.

## Success Criteria

Over the ref backend and, where it can form the state, the reference backend, from the flip:

1. **A clash's remedy names the preferred repair.** With two live holders of one slug — two work units, a work unit and
   a cohort, a work unit and an Errand, two Errands, and two cohorts — the slug lookup's refusal, the lifecycle verbs'
   and `arc rename`'s refusals, and the write rules' refusal of an edit naming the slug in `Depends On` carry
   `clashRepair`'s remedy for those holders' types, and for two cohorts so do the write rules' refusals of an edit
   naming the slug in `Cohort` or `Parent`, and session entry's, archive's, and a member's rename's refusals; status's
   `slug-clash` warning for two work units names `arc rename <uid> <new-slug>` for each; a live former-slug tie's remedy
   names the intended holder by its current name.
2. **The repair lands.** `arc rename <uid> <new-slug>` renames the named holder — a work unit or a cohort — under the
   clash, after which the slug resolves to the other holder; `arc errand close <uid>` closes the named Errand of two,
   after which the slug resolves to the other; `arc errand abandon <uid>` lands the same way; a retry `arc errand close`
   or `abandon` prints repeats the UID given; `arc errand promote <slug>` under a two-Errand clash refuses naming
   `arc errand close <uid>` and lands on the remaining Errand once one closes.
3. **Operand rules.** A UID operand selecting an Errand on `arc rename`, a work unit on `arc errand close`, or nothing
   refuses as § 1.2 states; an upper-case UID selects the same owner; a slug resolving to a cohort renames the cohort,
   and renaming a closed cohort refuses.
4. **Target admission.** Renaming a work unit onto an archived work unit's slug lands and discharges a stub's edge naming
   it and the subject's own edge naming it, and refuses while an in-flight dependent's edge names it; renaming onto a
   live holder's current or former slug refuses naming that holder; a resumed rename and a rename back to the
   subject's former slug land.
5. **A rename rewrites only what resolves to it.** Renaming one of two work units sharing a slug lands, rewrites no
   other record naming the slug, reports each with its edit, and leaves the slug resolving to the other holder.
   Renaming one of two cohorts reports a subcohort naming the slug, with an open and a completed member, with the edits
   that re-point them, in order, rewrites none of the other cohort's members, and those edits land. Renaming the cohort
   of a work-unit and cohort pair rewrites its members as with no clash. Renaming a duplicate stub of a doubled cut, it
   and its original both holding the original cohort, reports its member heading and leaves the heading unchanged.
6. **The branch step.** With both work units linking one branch, renaming an active one, run from anywhere on the
   machine holding its checkout, moves that checkout and never the other holder's and keeps the old remote branch, and
   so does its continuation after a failed push; run on a machine where no checkout of the subject holds the branch, it
   lands with the branch and its link unchanged and reports the branch kept with the catch-up command, which, run on
   the machine holding the subject's checkout, then moves them; before that catch-up runs, the other holder's rename
   run where its own checkout is not leaves the branch both links name and keeps the old remote branch. A rename with
   no clash renames, pushes, and deletes as today.
7. **A former-slug tie is reported.** Renaming the second holder of a repaired clash away from the slug lands and
   reports the tie it leaves. A promotion under `--name` that leaves the tie and stops after its role write resumes when
   rerun by its new name.
8. **The cohort rename is one batch.** Renaming a parent cohort with a started member, a completed member, an open
   subcohort, and a closed subcohort with a completed member lands in one batch, on a clone lacking those completed
   records' history refs too, after which every one of those records names the new slug, the document's heading and the
   subcohorts' `Parent` name it, and stubs' and open documents' `` `cohort-<old>.md` `` references name the new file.
   Renaming a subcohort rewrites its members' paths, one left on its parent's former slug included, to the current path,
   and its own `Parent` when a pull left it there. Renaming a parent whose closed subcohort holds an open stub a pull
   landed after its close lands, re-pointing that stub. Renaming an archived work unit whose cohort archive closed lands
   on a clone lacking both their history refs.
9. **A path names the current slug.** After a cohort rename, an edit putting a member's `Cohort`, or a subcohort's
   `Parent`, back on the old name refuses, naming the current one; a completed member's rewrite to a completed cohort's
   current slug lands.
10. **Counting by resolution.** `arc cohort close` refuses a cohort an open stub names by a former slug, naming the edit;
    archive of the cohort's last current-path member then lands, leaves the cohort open, and reports that stub; a clash
    between two other cohorts blocks neither close nor archive's in-batch close. `arc cohort close` of a parent whose
    subcohort's `Parent` and open member a pull left on its former slug names § 4's three edits in order, and they
    land.
11. **Close and remove.** `arc cohort close` closes a cohort left with no open member after an abandon, which the
    abandon's result named, and refuses a completed cohort; `arc cohort remove` removes a cohort nothing ever named and
    refuses one an archived member names, naming `arc cohort close`; without `--yes` each prints what it would do and
    writes nothing. A member a pull lands naming a removed cohort refuses archive and rename naming the edit to its
    `Cohort`, and both land after that edit.
12. **Errand lock recovery and evidence.** Closing one of two clashed Errands by UID clears only its own finalized head
    locks; on a machine holding no checkout of it, the close refuses naming the machine holding its checkout; abandoning
    one returns only its own held inbox entries; and a UID under partial protection refuses `not-found`.
13. **The checkout.** Under a clash, renaming a work unit whose checkout carries an unbound marker refuses before the
    batch naming the holders by UID and the release exit; after release and the rename, `arc materialize <new-slug>`
    brings back a checkout of the subject's, and `arc materialize <slug>` one of the other holder's.
14. **Before the flip,** every command above behaves as today, but for § 10's refusal order, or refuses `unsupported`
    naming what serves.

## Open Questions

None.

## Amendments

None.

---
