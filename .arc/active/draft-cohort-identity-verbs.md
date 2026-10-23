# Draft: cohort-identity-verbs

- **Origin:** [internal] — inbox routing, 2026-10-19, from two captures during `seam-decomposition` create-spec
  (2026-10-16): its § 10 accepts a doubled cut whose names clash with no command to clean up, and its adversarial pass
  3's fix check found that any cohort can empty out through abandonment.
- **Purpose:** Give the store-only lifecycle the identity commands it lacks: `arc rename` naming its subject by UID so
  the ref backend's slug-clash remedy has a command, the same verb renaming a cohort with every record that names it,
  and `arc cohort close` and `arc cohort remove` for a cohort nothing will close; and Errand close and abandon taking
  the same UID operand, so a clashed Errand has an exit.

---

## Problem / Motivation

From the flip two live owners can hold one slug. The store refuses a local create or rename that clashes, across work
items and cohorts alike, since they share one namespace (`spec-storage-contract.md` D14), but two machines each creating
or renaming onto one slug, or two processes on one machine doing so at once, leave two holders
(`spec-storage-ref-backend.md` § 5.1 step 2). Every later lookup of that slug, and every read or write by name within
the clashing family, refuses `ambiguous-match` naming both owners (§ 5.1, § 8), and the spec's remedy is to rename one
by its UID (§ 5.1). The store side exists: a reference carrying its owner's UID needs no name resolution
(`resolveCapturedReference`, `lib/store/ref/reference-resolution.ts` on `feat/storage-ref-backend`), and a rename that
ends a clash lands. No command reaches it. `arc rename <slug> <new-slug>` (`cli.ts`) reads its subject by slug
(`readStoreRenameSubject` calls `readWorkUnit`, `lib/store/lifecycle-rename.ts`), re-reads it by slug to acquire its
records (`acquireLifecycleRecords`, `lib/work-unit/prepared-lifecycle-write.ts`), and names its retry by slug
(`renameSteps`, `lib/work-unit/verbs/rename-store.ts`), so it refuses on the clash it should repair; status's
`slug-clash` warning names "rename one holder" and no command (`clashWarning`, `lib/status/store-project-standing.ts`).

Cohorts have no identity commands at all. Today a cohort is renamed or removed by editing tracked files. From the flip
that stops working: write-back persists each edited file as its own write and never changes a reference
(`spec-storage-projection.md` § 7.3), while a cohort rename must change the document's name and every member's `Cohort`
path together, since `cohort.parent` refuses a changed `Parent` its open members' paths disagree with and `meta.cohort`
resolves a path's last segment to an open document (`checkCohortParent`, `lib/store/kinds/cohort/rules.ts`;
`checkMetaCohort`, `lib/store/kinds/meta/reference-rules.ts`).

Only archive closes a cohort, in the batch archiving its last open member (`prepareObservedCohorts`,
`lib/work-unit/verbs/archive-store.ts`, with the trigger `isArchivalTriggeredWithDescendants`,
`lib/work-unit/lifecycle-membership.ts`, which needs at least one member). Neither abandon arm touches a cohort
(`runStoreAbandon`, `lib/work-unit/verbs/abandon-store.ts`; `abandon.ts`), and write-back removes nothing. No lifecycle
verb removes a cohort document: decomposition's `--discard` and `--revise` remove a cut's own new documents, and only
while its stored map stands (`spec-seam-decomposition.md` § 9). So a cohort whose last open member is abandoned, one
never given a member, and the open documents a decomposition race leaves with no stored map to discard from (§ 10)
stay open for good, and an open subcohort among them keeps its parent from closing.

`storage-cutover` depends on this work unit: from the flip these are the only routes to the repairs, and a recoverable
refusal must keep its repair reachable (`DEV-RULES.PROJECT`, "Recovery-complete refusals").

## Decisions

Every `lib/store/ref/` path cited below is on `feat/storage-ref-backend`, which this work unit depends on.

### Boundary, Class, and depth

- **One work unit** (`assess-boundary-fit`: stays one WU). Rename by UID, the cohort rename, close and removal, and
  Errand close's and abandon's UID operand are one concern — identity commands for owners in the shared namespace — over
  shared files (`cli.ts`, the rename verb, the cohort kind's writers), and no piece is independently worth a work unit.
  It does not merge with `lifecycle-slug-selection`: that work unit fixes how every lifecycle verb selects its subject's
  standing holder, a repair across verbs, while this one adds the commands its clash refusal names. The two share only
  the subject handle, settled below.
- **`Class: Heavy`,** confirmed: the decisions below must be settled before work can start, and each composes existing
  patterns, so it does not reach `Novel`.

### The subject handle (co-designed with `lifecycle-slug-selection`, whose Owner confirmed it 2026-10-22)

- **A slug resolves through the store's slug lookup,** `lookup({ kind: "slug" })`, which ranks work items and cohorts
  together — live current name, live former, ended current, ended former (`rankNameTrees`,
  `lib/store/ref/lookup-primary.ts`) — and refuses `ambiguous-match` where the top tier holds two, except that a tie
  among completed work units resolves to the latest archived (`lifecycle-slug-selection` D10).
  `lifecycle-slug-selection` owns keeping lifecycle selection — the lifecycle index and every lifecycle verb's subject —
  in agreement with that lookup, and keeps each clashing holder as a typed `RecordReference` (owner type and UID)
  through the verb result, the CLI rendering, and `--json`. It also fixes `readWorkUnit`'s report of a cohort holder as
  "an Errand", and aligns the reference backend's ranking, which admits no cohort holder, with the ref backend's. Rename
  selects its subject through the lookup directly, not through that selection. It does read lifecycle's view
  (`readLifecycleView`) — the inventory check and Integrating advisories in `readStoreRenameSubject`, the stub listing
  in `acquireRenameGroups` — so it needs that view to list every holder under a clash rather than refuse.
- **Among lifecycle verbs, only rename and teardown take a UID.** No other lifecycle verb takes a UID subject: a rename
  resolves a clash (D14), and a UID-addressed archive or activation would only let work proceed on a slug that stays
  clashed. Teardown, whose subject has ended, takes `<slug|uid>` by rename's operand rule (`lifecycle-slug-selection`
  D11). Of the Errand verbs, close and abandon take one too (§ Rename by UID and the clash remedy).
- **The form:** `arc rename <slug|uid> <new-slug>`, and `<cohort>` the same for the cohort verbs — a cohort's slug or
  UID, never its `parent/child` path, since a slug is unique in the namespace. An operand `z.uuid()` accepts selects
  that exact owner; anything else is a slug, through the lookup. No lookup arm finds a primary by UID
  (`LookupInputSchema`), so a UUID operand scans listings for that UID, as `lifecycle-slug-selection`'s teardown does
  for its own (its D11): the work-item listings, as the inbox's UUID selector does (`primaryByUid`,
  `lib/inbox/lists.ts`), and the `cohort/document` listing. This follows the UUID-shaped selectors already shipped
  (`findPrimary`, `lib/inbox/lists.ts`) and the lineage lookup's exact-generation rule (`LookupInputSchema`,
  `lib/store/lookup.ts`).
- **No UID prefix.** `spec-storage-contract.md` D2 displays the shortest unique prefix, but an eight-hex prefix is
  itself a valid slug (`SLUG_PATTERN`, `lib/kernel/schema/slug.ts`), so a prefix operand would be ambiguous with a name;
  the full UID is what the remedies print and a person copies.

### Rename by UID and the clash remedy

- **`arc rename` renames any holder in the shared namespace** (Owner, 2026-10-22): a work unit through today's store arm
  (`runStoreRename`, `lib/work-unit/verbs/rename-store.ts`), a cohort through the cohort arm below. One command form
  repairs any clash, whatever the two holders' types.
- **The work-unit arm addresses its subject's records by reference throughout.** Once the operand resolves, every
  store read, the record group's acquisition (`acquireLifecycleRecords`, which takes a slug today), the version
  revalidation, the retry, and the typed continuation (`renameSteps`' `retryCommand`, `finishRename`'s remedy) use the
  subject's UID-bearing reference, and the retry and continuation repeat the operand the person gave. A slug-bound
  step would refuse `ambiguous-match` before the batch, and after it would resolve the old name to the other holder.
  Every other stub the arm acquires for its sweep (`acquireRenameGroups`) is re-read by the reference its listing
  returned, never its name, so an unrelated clash between two stubs blocks no rename: `lifecycle-slug-selection`'s rule
  for every re-read of a listed entry, `acquireLifecycleRecords` among them, which this work unit consumes (Owner,
  2026-10-22).
- **The arm finds its subject's checkout by UID** (Owner, 2026-10-22). Its checkout step finds the holding checkout by
  marker (`findWorkUnitHoldingCheckout`, `lib/work-unit/verbs/unshared-work.ts`), whose work-unit subject is a name
  alone today (`decodeWorktreeMarkerOwnership`, `lib/git/worktree-marker.ts`), so under a clash it could take the other
  holder's checkout. From the flip, `lifecycle-slug-selection`'s D8 puts the owner's UID in the work-unit marker and
  checkout claim, matches holder lookup by it, and keeps it through rename's marker rewrite (`renamedMarker`). This arm
  consumes that: it finds the subject's own checkout from anywhere on the machine, and a checkout on another machine
  stays bound to the subject by its UID through the rename. Where that lookup meets an unbound marker, one carrying no
  UID, naming the subject's current or a former slug, the rename, a caller acting on the holder, refuses before the
  batch, naming every holder of the slug by UID and the marker's exits (`lifecycle-slug-selection`'s spec § 7.3, § 7.4).
  Under a current-name clash, materializing by slug refuses (its D3), so the exit is `arc locus release`, and a checkout
  of the subject's own comes back after the rename by `arc materialize <new-slug>`, with `--here` where release kept it:
  release removes a spawned checkout but only the marker of an anchored one (`releaseCheckout`, `lib/locus/release.ts`),
  and a checkout with no marker passes materialize's occupancy guard (`readStoreOccupancy`,
  `lib/work-unit/lifecycle-guards.ts`). Rejected: taking the checkout the rename runs from as the subject's, since both
  holders' markers name the slug and nothing tells a person which holder their checkout holds; and renaming the records
  alone, after which a name-only marker resolves to the other holder.
- **The branch step reads the branch-link lookup of the subject's old branch** (Owner, 2026-10-23). Today the step
  finds the local branch by name alone, as `<prefix>/<slug>` (`branchRename`), and renames whatever branch holds that
  name (`reconcileRenameLocalBranch`), while two holders' links can name one branch: two live holders under a clash and
  after one, a live and a completed holder under reuse. From the flip, the first run decides each branch step from
  `lookup({ kind: "ref" })` (`lifecycle-slug-selection` D9) of the branch the subject's link names before its batch, as
  that work unit's teardown gate reads it (its D11):

    - **The local branch** is renamed and the link moved where the subject's own checkout on this machine has the old
      branch checked out, or where the lookup returns the subject. Where the lookup returns the subject but this machine
      has no copy of the branch, the rename refuses before its batch, as today (`reconcileRenameLocalBranch`). Otherwise
      the arm takes today's shape for a work branch not named after the slug: no branch step, the record's branch link
      unchanged (`renameMutation`, `lib/store/lifecycle-rename.ts`), and the branch reported kept (`keptBranches`), with
      the catch-up rename below to run on the machine holding the subject's checkout. With no clash and nothing else
      linking the branch, the lookup returns the subject, so today's rename is unchanged.
    - **The new name is pushed** where the link moved and the old branch was published (`reconcileRenameRemoteBranch`,
      `lib/work-unit/rename-identity.ts`), on the first run or a continuation.
    - **The old remote branch** is deleted only on the first run, after the preservation check
      (`requirePublishedPreservation`), where the link was created rather than adopted and the lookup returns the
      subject, a completed holder, or nothing. Where it returns another live holder or refuses, the branch is kept, as
      an adopted branch's is today (`keepOld`), and the result reports it; this replaces a rule keeping it under any
      clash, since the lookup keeps it wherever the other holder links the branch.
    - **A continuation never deletes the old remote branch:** a rerun after a failed push or a refused delete pushes
      what remains and reports the old branch kept. A rerun cannot re-decide on the first run's evidence, since the
      batch has moved the subject's link and the other holder may have moved its own since, so the continuation takes
      the outcome that is safe either way, as `git branch -m` leaves the old remote branch to its owner and as Git's
      sequencer replays its plan on `--continue` rather than re-deciding. Today's rerun deletes it; the report now
      leaves that to the person.
    - **The preservation check's remedy names both readings:** the lookup says who links a remote branch, not whose
      commits it holds, so where the old branch holds commits the new one lacks, its refusal says to merge them into the
      new branch and delete the old one if they are this work unit's, and to leave it if the branch is another's; a
      continuation then completes the rename with the branch kept.
    - **A continuation on the machine holding the subject's checkout catches up a branch the first run left** (Owner,
      2026-10-23). Rerunning the rename with the subject's current slug, `arc rename <uid> <slug>`, from anywhere on the
      machine holding the subject's own checkout, which it finds by UID as a first run does, where that checkout has
      checked out a branch its link names after a former slug of the subject, renames that local branch to
      `<prefix>/<slug>`, moves the link in a link-only batch, and pushes the new name, keeping the old remote branch as
      any continuation does. The checkout proves the branch is the subject's, as on a first run. Elsewhere a
      continuation still runs no local step (`persistRename`), and today's branch step matches only a branch named after
      the current slug (`branchRename`), so without it nothing would ever move the link.

  So where both holders link one branch, the rename lands from any machine, a released or remote-only subject's among
  them (`spec-storage-projection.md` § 8.3), and a checkout elsewhere keeps the branch its link still names; the other
  holder's later rename, run where its own checkout does not hold that branch, leaves it alone. Refusing there would
  leave no route: materializing the subject's checkout selects it by slug, which refuses under the clash
  (`lifecycle-slug-selection` D3). Under a clash whose other holder links no branch, a cohort or a Planning work unit,
  the lookup returns the subject, so the rename needs the branch where it runs, and renaming that other holder lands
  instead. Rejected: touching the local branch only from the subject's checkout, which leaves a rename without a clash,
  run elsewhere, on the old branch name until its continuation runs there; refusing under a clash except from the
  subject's checkout, which needs a UID operand on `arc materialize` against that work unit's D3; keeping the old remote
  under any clash beside the lookup, which a continuation could not honor; re-deciding the old remote on a continuation
  from the lookup again, whose answer moves between runs; and carrying the first run's decision into the continuation,
  which adds state to rename for a deletion keeping always makes safe.
- **The work-unit arm's target takes the shared admission check** (Owner, 2026-10-22), `lifecycle-slug-selection`'s one
  check for every way a work item takes a slug: it admits a slug the lookup finds no holder of, or returns as a
  completed work unit's current name, the latest of several by its D10, so a completed work unit's slug is reusable
  (`spec-storage-contract.md` D2), as at creation; a completed Errand or cohort, a live holder under its current or a
  former name, a tie among live holders, and a slug the lookup returns as a holder's former name refuse
  (`checkFormerSlug`). It replaces the arm's refusal of any slug the lookup resolves (`readStoreRenameSubject`). A slug
  the lookup returns as the subject itself is free, as today's check admits (`sameReference`), so the rename's own
  resume and a rename back to the subject's former slug still land. A rename onto a reused slug settles in its batch the
  edges naming it that it may write, as `spec-seam-record-kinds.md` § 5.3 commits every renaming verb to: stubs' edges
  and its own, an edge on shipped work discharging and one on a retired origin taking its lineage disposition, through
  the shared settler `lifecycle-slug-selection` proposes for creation (Owner, 2026-10-22). An in-flight or parked
  dependent's edge refuses through `work-item.slug-edges` (`checkSlugEdges`, `lib/store/kinds/work-item/slug-edges.ts`),
  with its remedy. Rename mirrors creation here: should that work unit's design settle creation's reuse otherwise,
  rename follows it.
- **The remedy names the command wherever the clash is refused** (Owner, 2026-10-22). The ref backend refuses a name by
  resolving its owner in the slug lookup (`lookupCapturedRefTrees`, `lib/store/ref/lookup.ts`) and in a typed read by
  name (`resolveCapturedReference`), which a write by name reaches too, binding its names through it before it resolves
  its owners (`resolveNamedRefWrites`, `lib/store/ref/write-names.ts`), with `resolveOwner`
  (`lib/store/ref/write-resolution.ts`) refusing any reference that binding leaves without a UID. A tie among completed
  work units refuses none of them once `lifecycle-slug-selection`'s D10 resolves it to the latest archived. Where the
  tied candidates are live holders of the name as their current slug — the D14 clash — each remedy names per candidate
  the repair that ends it, for one of them to take: `arc rename <uid> <new-slug>` for a work-unit or cohort holder and
  `arc errand close <uid>` for an Errand holder, since an ended Errand holds no live slug; the reference backend's slug
  lookup mirrors it (`__tests__/helpers/store/lookup.ts`). A tie among live holders' links to one branch, which the
  lookup's `ref` arm refuses (`lifecycle-slug-selection` D9), names per holder the rename that moves its link, run on
  the machine holding that holder's checkout: `arc rename <uid> <new-slug>`, or the catch-up `arc rename <uid> <slug>`
  for a holder whose current slug no longer names the branch, and `arc errand close <uid>` for an Errand holder, which
  links its `chore/<slug>` branch as created (`lib/errand/store-runtime.ts`) and which no rename moves. The remedy it
  shares today, renaming one to a free slug (`lib/store/ref/lookup.ts`), moves no link when run elsewhere. Only the
  branch lookup's readers meet the tie: teardown's gate, which leaves the branch and reports it
  (`lifecycle-slug-selection` D11), and two session-init checks, each warning with the refusal's remedy: the
  orphan-branch sweep, whose candidates are gone-upstream branches no claim or checkout holds
  (`readOrphanStoreCandidates`, `lib/session-init/orphan-store-candidates.ts`, through `resolveStoreBranch`), and the
  missing-worktree check (`readStoreMissingFolderActions`, `lib/session-init/missing-worktree-store.ts`). Session-init
  resolves a live checkout's work unit by its claim (`lifecycle-slug-selection` D8), never through its branch, so the
  first run's report of the branch kept is what names the catch-up. A store remedy may name a command, as `arc sync`'s
  refusals do (`lib/store/in-repo/sync-outcomes.ts`). The lookup and the typed read by name
  (`resolveCapturedReference`), which ranks through the same tiers (`preferredNameTrees`), give a tie in the live-former
  tier, live holders' former slugs, a remedy of its own, as `lifecycle-slug-selection`'s spec states the repair (its §
  4.1): name the intended holder by its current name. No rename ends that tie, since a renamed holder keeps every former
  slug (`rankNameTrees`; `formerSlugs`, `write-rename.ts`), and it resolves once all but one holder completes (§
  Unknowns and Assumptions). Every other `ambiguous-match` keeps its remedy to name the owner by UID: a completed tie
  that includes an Errand or cohort, which D10 leaves unordered; a lineage origin's (`resolveCapturedLineage`,
  `lineageOwnerCandidates`); and namespace admission's refusal of a create or rename onto a held slug
  (`checkLiveNamespace`), which answers the person's own write, whose repair is another slug rather than a holder's
  rename. The reference backend's admission, `indexIdentities` (`__tests__/helpers/store/identities.ts`), checks each
  owner type's live names across the whole resulting namespace after every write and at pull and push (`ownerNameKey`),
  so it refuses an arriving same-type clash as well as the person's own write; it keeps its remedy to give the colliding
  owners distinct names by UID, since one candidate may be a UID only the refused batch or the remote holds. The in-repo
  implementation, which holds no UIDs, keeps its own. Most readers print a refusal's condition and remedy as given, so
  this reaches each that meets the clash through the lookup or a read by name: session entry, `arc status <slug>`,
  `arc view cohort`, archive's cohort read, and decomposition's refusals among them. Three sites render the typed
  candidates one per line: `arc rename`'s own refusal, status's `slug-clash` warning, and `lifecycle-slug-selection`'s
  lifecycle clash refusal, whose text this work unit updates when it lands. The remedy is text: `<new-slug>` is the
  person's choice, so no argv runs as given.
- **No Errand rename; Errand close and abandon take a UID** (Owner, 2026-10-23). A clash between two Errands ends when
  one closes, but Errand close, abandon, and promote find their Errand through the slug lookup
  (`readReconciledCloseIdentity`, `lib/errand/close-runtime.ts`; `readBasis`, `lib/errand/store-runtime.ts`;
  `readPrimary`, `lib/errand/promote-store.ts`), which refuses `ambiguous-match` under the clash. So `arc errand close`
  and `arc errand abandon` take `<slug|uid>` by rename's operand rule, a UID scanning the work-item listings, as
  rename's does, and the remedy names `arc errand close <uid>`. The record the UID selects replaces the operand wherever
  a verb uses it as the Errand's slug: close's identity read, its check of the record's slug, its already-finalized
  fallback, and its head-lock recovery (`close-locus.ts`, `close-runtime.ts`), and abandon's matching steps
  (`abandon-runtime.ts`, `abandon-locus.ts`); their later steps already read by the record's claim. Close's head-lock
  recovery, which today clears a lock whose receipt matches the slug alone, also matches the selected record's claim
  (`recoverFinalizedErrandCloseHeadLock`, `lib/errand/close-head-lock.ts`, whose receipts carry both), so closing one
  clashed Errand never clears the locks guarding the other's branch deletion. Their confirmation retry (`renderRetry`,
  `lib/errand/terminal-authority.ts`) and close's off-branch retry (`renderOffBranchRefusal`) repeat the operand given,
  as rename's continuation does, rather than the record's slug, which refuses under the clash. Close and abandon end
  their Errand, as teardown ends its subject, so the reason lifecycle verbs take no UID does not apply. Promote keeps
  its slug operand: its refusal under a clash passes the store's remedy through rather than the condition alone
  (`readPrimary`, `promote-store.ts`), so it names each holder's repair, `arc errand close <uid>` for an Errand holder;
  once the clash ends, promote runs on the Errand left holding the slug (Owner, 2026-10-23, revisiting a UID operand for
  promote). Its recovery matches the Errand's history by the promoted meta's receipt (`promotionReceipt`) rather than by
  the operand (`recover`, `sourceFromHistory`), so a promotion under `--name` that leaves a former-slug tie and stops
  after its role write resumes when rerun by the new name, the tie's own repair, where today it refuses by either name
  (Owner, 2026-10-23). A verb renaming an Errand would repair nothing the close does not. A scope expansion into the
  Errand verbs.
- **A rename leaving a former-slug tie reports it.** Renaming the other holder of a repaired clash away too, by the
  remedy taken twice or later in the ordinary way, leaves both holding the slug as a former name, which the lookup then
  refuses (`rankNameTrees`). The rename looks the old slug up after its batch and, where that refuses `ambiguous-match`
  in its view, reports the tie and its repair, naming the intended holder by its current name (§ Unknowns and
  Assumptions). Rename pulls only the history refs a refusal names (`runStoreRename`), so a tie two machines' renames
  make shows in neither run's view; it surfaces after a pull, at the next lookup of the slug, whose remedy names the
  same repair. A promotion under `--name` can leave the same tie, since `replace` records the Errand's slug as a former
  name; it reports none, and the tie surfaces the same way. Such a promotion that stops after its role write resumes
  when rerun by the new name.
- **Where a clash surfaces.** A typed reference binds within its own family: a cohort read resolves a name among
  cohorts alone, a work-item read among work items (`resolveCapturedReference`, `lib/store/ref/reference-resolution.ts`
  on `feat/storage-ref-backend`). So a clash between a work unit and a cohort refuses only where a name resolves across
  both families, through the slug lookup. A clash between two cohorts also refuses in every cohort read by name:
  lifecycle's frame reads the active work unit's cohort document by name (`readStoreCohortDoc`,
  `lib/locus/subject-meta.ts`), so session entry and status refuse for each of that cohort's members, and archive's
  cohort read (`prepareObservedCohorts`) refuses too, each with the store's remedy naming the command. A work unit's
  rename reads its cohort document by name to rewrite its member heading (`acquireRenameGroups`), so a member of either
  cohort cannot be renamed, by UID or slug, until one cohort is renamed, the refusal naming each cohort holder's rename:
  text alone cannot say which document holds the member's heading. `meta.cohort` and `cohort.parent` observe the cohort
  a field names through `observeRecord` (`lib/store/kinds/rule-support.ts`), and `meta.depends-on` each new edge through
  the slug lookup; each keeps only the refusal's condition and replaces the store's remedy with its own fixed text
  (`checkMetaCohort`, `checkMetaDependsOn`). So `observeRecord` reports an `ambiguous-match` as its own observation,
  carrying the refusal's typed candidates and remedy, rather than as unavailable evidence, and on `ambiguous-match` each
  of the three rules passes the store's remedy through, naming the command per holder where the store's does (above).
  The reconcile's word check looks up every slug-shaped word the index lacks (`artifactAliasTransitions`), so today a
  clash a cohort or Errand holds, which `lifecycle-slug-selection`'s selection does not list (its spec § 2.1), refuses
  that check for every work unit whose records contain the slug, a clashed cohort's members by their `Cohort` paths
  among them, blocking its activation, reconcile, and publish. That work unit's spec takes any `ambiguous-match` as an
  answer there and in its paired-spec owner check (`knownArtifactOwner`), whatever the holder types (§ 4.2, adopted
  2026-10-23 at this work unit's request), so no such clash blocks that work; two clashed Errands are then repaired by
  closing one by UID. Status's `slug-clash` warning lists work-unit holders only (`selectStandingLifecycleEntries` reads
  lifecycle entries), and stays so: a cohort clash reaches status through the frame's refusal. Rejected: a listing of
  cohort clashes in status, new reads across every cohort for a clash only a cross-machine create or a decomposition
  race produces.

### A rename rewrites only the references that resolve to its subject

A rename always writes its subject's own records: a work unit's record group, or a cohort's document with its heading.
It rewrites another record's reference to the old slug only where that slug, resolved within the family the reference
can name, names the subject alone (`resolveCapturedReference`). A member's `Cohort`, a subcohort's `Parent`, and a ``
`cohort-<slug>.md` `` filename name cohorts; a stub's `Depends On` edge or `waits-on`, a backticked work-item filename,
and a cohort document's member heading name work items (`spec-seam-record-kinds.md` § 5.3 for `Depends On` and `Cohort`,
§ 8.2 for `Parent`, and § 8.3 and § 8.6 for the heading; `spec-seam-lifecycle.md` § 8.1 for `waits-on`). Every reference
of one family to one name resolves alike, so the verb resolves once per family before its batch:

- **The slug names the subject:** the rename rewrites those references as today's work-unit rename does
  (`spec-seam-lifecycle.md` § 7.1). A clash between a work unit and a cohort is this case, since each family holds one
  of them. There a started dependent's edge, which today's rename leaves for its owner's reconcile, will not find the
  renamed work unit: no work unit then stands for the slug, since the renamed one holds it as a former name
  (`lifecycle-slug-selection` D1), so today's reconcile would take the retired-edge path, where no lineage settles the
  edge, and file a `missing-evidence` conflict blocking the dependent's activation (`planDependencyReconcile`,
  `lib/work-unit/side-effects/discharge-dep-edges.ts`; `queryDisposition`, `lib/work-unit/store-reconcile-context.ts`).
  `lifecycle-slug-selection`'s D4 has that path's disposition query never retarget onto a holder that is not a work
  unit, under the slug as its current or a former name: it applies a retired origin's lineage disposition where one
  names the slug, and otherwise keeps the edge unsatisfied with a diagnostic naming the holder, here the cohort, so the
  dependent activates. The rename reports each such edge with the edit that re-points it.
- **The slug is ambiguous** — another holder of the same family shares it: text alone cannot say which holder each
  reference means, so the rename rewrites none of them and reports each with the edit that re-points it — a stub's by
  anyone, a started work unit's by its owner. Once one holder keeps the slug, each such reference resolves to it, and
  `meta.cohort` admits each edit (Owner, 2026-10-22, for a cohort's members; the same rule for every arm). A subcohort
  takes three edits, each its own write, since `cohort.parent` and `meta.cohort` check its `Parent` and its open
  members' paths against each other (`checkCohortParent`, `checkMetaCohort`): its open members' `Cohort` cleared, its
  `Parent` set to the renamed cohort's new slug, then their `Cohort` set to `<new-slug>/<child>` (Owner, 2026-10-22).
  Its completed members' `Cohort` is set to the same path after the second edit, each by its owner, who edits archived
  work in place (`spec-storage-projection.md` § 8.4), with no clearing, since `cohort.parent` checks open members alone
  (`observeOpenMembers`, `lib/store/kinds/cohort/check-support.ts`). The report names them in that order. A closed
  subcohort is reported and stays with the holder that keeps the slug (§ Unknowns and Assumptions).
- **The slug names another holder** — an ended subject whose slug a live item has reused, which the lookup ranks above
  it (`rankNameTrees`): those references are the live holder's, and the rename leaves them unreported.

Rejected for a cohort under an ambiguous slug: moving the members the renamed document lists under `## Members`, since
those sections are convention only and nothing enforces them (`reportOrphanCohortMemberSections`), so they cannot
authorize writes to started members' metas; and a `--member` or `--subcohort` flag naming the records to move, new
surface for a cross-machine edge case that the report and ordinary edits repair. A doubled cut, this work unit's
origin, needs neither: once the duplicate cohorts are renamed by UID, every path names the originals, and the
duplicate stubs leave by rename and abandon.

### The cohort rename

From the flip, renaming a cohort writes one version-checked batch:

- **The document** under its new name, the backend recording the former slug (`spec-storage-ref-backend.md` § 3.6), and
  its `# Cohort:` heading rewritten. No writer in the kind's folder does the heading today (`lib/store/kinds/cohort/`);
  one joins `rewriteCohortMemberHeading` there.
- **Every record naming the cohort by path** — every member's `Cohort`, open or completed, started members included
  (Owner, 2026-10-22), as direct members' slug and, for a parent, its subcohorts' members' `parent/child`; and every
  subcohort's `Parent`, open or closed, when the renamed cohort is a parent. No writer in the kind's folder rewrites
  `Parent` today, creation writing it only as it renders a document (`writeCohortDocument`), so one joins the heading
  writer there. The verb finds them by resolving each path segment among cohorts, not by its text (§ A path names a
  cohort by its current slug), so a record left on a former slug is rewritten too. A rename changes no membership —
  every member stays in the same cohort under its new name — so it is the verb's identity write, not the owner's
  membership move that decomposition leaves to the owner (`spec-seam-decomposition.md` § 9.3). The batch is also the
  only shape the checks admit: `cohort.parent` requires open members' paths to agree in it, and every membership reader
  off the retiring path matches the path's text, never a former slug (`cohortMembersWithDescendants`,
  `lib/work-unit/lifecycle-membership.ts`; § A path names a cohort by its current slug), while the projection lays out
  each member's folder from the field. Completed members and closed subcohorts take the same write, since the ref
  backend's close letter reads closed subcohorts' `Parent` text (`cohortClosePlacement`,
  `lib/store/ref/cohort-coordinates.ts` on `feat/storage-ref-backend`), and a text-matching reader would otherwise miss
  them. Each is a write to a completed item in place (`spec-storage-ref-backend.md` § 7.3). Where the clone lacks
  history refs, the backend refuses naming the first it meets (`resolveArchivedReferences`,
  `lib/store/ref/archive-resolution.ts` on `feat/storage-ref-backend`), so the verb pulls the refs each refusal names
  and retries, round after round, until the batch lands or a round names only refs already pulled; the rounds are
  bounded by the completed records the batch writes. The work-unit arm takes the same rounds in place of its one retry
  (`runStoreRename` on `feat/storage-ref-backend`): renaming an archived work unit also rewrites its cohort document's
  member heading (`acquireRenameGroups`), and archive commonly closed that cohort with it, so the batch can write two
  completed records. A completed member's new path takes `meta.cohort`'s rule for a completed meta (below), since a
  closed subcohort's members name a completed cohort.
- **References to the document's filename,** `` `cohort-<old>.md` ``, in stubs and open cohort documents — a parent
  cites its subcohorts' documents by filename — rewritten by the cohort arm itself; anyone may write either
  (`spec-seam-record-kinds.md` § 8.6). The work-item sweep cannot serve: it leaves every `cohort-` reference unchanged
  (`rewriteBacktickedArtifactReferences`, `lib/work-unit/rename-reference-sweep.ts`), and run with a cohort's slug it
  would rewrite work-item edges sharing the text. A started member's prose keeps the former name, as a started
  dependent's `Depends On` does (`spec-seam-lifecycle.md` § 7.1), and a closed cohort's document keeps it as written. An
  edge naming the cohort's old slug, one the cohort took from a retired origin, as creation's admission allows
  (`checkLiveNamespace`), stays too, and its reconcile never retargets it to the new name (`lifecycle-slug-selection`
  D4): the origin's lineage disposition applies where one names the slug, and otherwise the edge stays unsatisfied with
  a diagnostic naming the cohort.
- **The target slug must be free of every holder:** the target's lookup finds nothing, or returns the subject — the
  check `readStoreRenameSubject` makes today (`sameReference`), kept as the cohort arm's own while membership names
  cohorts by path; the work-unit arm takes the shared admission check instead (§ Rename by UID). The lookup spans
  current and former slugs, live and ended, wherever a holder's primary remains (`rankNameTrees`, `lookupPrimary`), so a
  cohort never takes a slug a holder's name resolves through; the store's admission compares live holders' current names
  alone (`checkLiveNamespace`, `lib/store/ref/namespace-admission.ts`), and no cohort rule checks the name
  (`checkCohortDocument`). An abandonment or a decomposition's retirement removes the work unit's primary
  (`spec-seam-lifecycle.md` § 8.6, `spec-seam-decomposition.md` § 8.5), so the lookup no longer finds its slug and the
  rename may take it, as creation may (Owner, 2026-10-23); an edge still naming it takes that unit's lineage disposition
  first (`lifecycle-slug-selection` D4).

### A path names a cohort by its current slug

`meta.cohort` and `cohort.parent` admit a path segment only where it is the named cohort's current slug. Both read the
document by name (`observeRecord`), and the store's name resolution also admits a former slug (`rankNameTrees`), so
today a `Cohort` edited back to a renamed cohort's old name passes while every membership reader, matching text, misses
the member — and `cohort.open-members` would let the cohort close or be removed under it. A segment resolving through a
former slug refuses, naming the current one.

**The open-cohort requirement applies to an open meta** (Owner, 2026-10-22). A completed meta's changed `Cohort` —
the cohort rename's write to a completed member — names an existing cohort by its current slug, open or completed,
with the path agreeing with that cohort's `Parent`. Today `meta.cohort` refuses a path whose cohort is completed
whatever the meta's own placement (`checkMetaCohort`), and the ref backend runs each registered check on every write in
a batch (`checkRefWrites`, `lib/store/ref/write-checks.ts` on `feat/storage-ref-backend`), so renaming a parent could
never rewrite a closed subcohort's completed members. `cohort.parent` already admits the closed subcohort's own
`Parent` rewrite: the renamed parent is open and top-level, and a closed subcohort has no open member to disagree
(`checkCohortParent`).

**The cohort verbs find members by resolution** (Owner, 2026-10-22). A record can still be left on a former slug: a stub
created on a clone that had not pulled the rename, or a conflict resolved to the side holding the old path
(§ Unknowns and Assumptions). So the cohort rename, `arc cohort close`, and `arc cohort remove` find a cohort's members
and subcohorts by resolving each path segment among cohorts, not by its text. A segment holds a cohort where it
resolves to that cohort, or is ambiguous among holders that include it, read from the refusal's typed candidates; one
resolving to another cohort or to nothing holds none (Owner, 2026-10-22). The rename rewrites a record left on a
former slug, and close and remove count it, refusing while it holds the cohort and naming the edit that re-points it;
under a clash of the cohort's own slug they count every record naming it, and refuse until one holder is renamed.
Abandon's report of an emptied cohort counts the same way, so the command it names never refuses on a member the report
missed (Owner, 2026-10-22).

The store's retirement backstop counts the same way (Owner, 2026-10-22): `cohort.open-members` applies that rule rather
than matching text (`checkCohortOpenMembers`). It lists the open members and open subcohorts in the view after the
batch, as shipped, so a member the same batch archives no longer counts (`spec-seam-record-kinds.md` § 8.2), and
resolves each distinct segment of their paths in the view before it, where the retiring document still stands: the view
after a removal holds no document, and its open-cohort listing skips a closed one (`observeOpenCohorts`,
`lib/store/kinds/cohort/check-support.ts`). It takes `observeRecord`'s ambiguous observation (§ Rename by UID and the
clash remedy) and counts an ambiguous segment only where its candidates include the retiring cohort, so a clash between
two other cohorts blocks no retirement. Its condition names each record holding the cohort and, for one on a former
slug, the edit that re-points it. So every close — archive's in-batch close as well as `arc cohort close` and `remove` —
refuses while a record left on a former slug holds the cohort. Archive's trigger counts the same way (Owner, 2026-10-23,
revisiting 2026-10-22): in place of matching text (`isArchivalTriggeredWithDescendants`,
`lib/work-unit/lifecycle-membership.ts`), it counts each cohort's open members and subcohorts by that resolution over
the store its cohort preparation already holds (`prepareObservedCohorts`, `lib/work-unit/verbs/archive-store.ts`), over
the per-holder entries `lifecycle-slug-selection` counts at those call sites (its D1). So where a record left on a
former slug holds the cohort, archive lands the member and leaves the cohort open, reporting that record with the edit
that re-points it, rather than refusing or closing the cohort under the member for good. Archive's closeout rule counts
by the same resolution (`checkCohortArchiveCloseout`, `lib/store/kinds/cohort/rules.ts`), in the views before and after
the batch: archive writes a cohort it leaves open into its batch unchanged (`prepareObservedCohorts`, `protectOpen`),
and the rule's text count (`observeOpenCohortHoldings`) misses the record on a former slug, so it would see the last
current-path member leave and refuse. Rejected: leaving that cohort out of the batch, which drops the rule's refusal of
an archive prepared against stale membership.

Every other membership reader keeps matching text. Rejected: teaching every membership reader to resolve former slugs,
which changes each reader and the projection's layout; resolution sits on the retiring path, the irreversible one.

### Closing and removing a cohort

- **`arc cohort close <cohort>`** places the document completed in the current quarter (`spec-storage-ref-backend.md`
  § 2.4), the backend assigning the quarter's next sequence when no member archives in the batch (§ 7.6). It refuses
  while an open member or open subcohort names it, found by resolution (above), and `cohort.open-members` backstops it
  at the store, counting the same way. No write reopens a cohort (§ 2.4), so the verb confirms first, as abandon does.
- **`arc cohort remove <cohort>`** removes the document, for a cohort that never had a member and a race's leftovers.
  It refuses, naming `arc cohort close`, while any member, open or completed, or any subcohort, open or closed, holds
  it, found by resolution (above), since removal would leave those records naming a document that no longer exists;
  `cohort.open-members` backstops the open half at the store. It confirms first.
- **Explicit only** (Owner, 2026-10-22). Abandon does not close a cohort: abandoning a last member may be a re-plan,
  and a close cannot be undone. From the flip, abandon's result reports a cohort its batch leaves with no open member or
  subcohort, counted by resolution (above), naming `arc cohort close <cohort>`, or `arc cohort remove <cohort>` where no
  record holds it. A close or remove that empties a parent reports the parent the same way. Archive's in-batch close,
  under the retirement backstop, and its closeout rule (`checkCohortArchiveCloseout`) count by resolution too (above).
- **Both under a new `arc cohort` group** (Owner, 2026-10-22), beside the rename that `arc rename` serves.

### Before the flip

Nothing changes what a verb does today. `arc cohort close` and `arc cohort remove` register and refuse `unsupported`,
naming today's route — edits to the tracked cohort files, and archive's sidecar sweep — as the dormant store commands do
(`runDormantStoreCommand`, `commands/store-command-support.ts`). `arc rename` and the Errand verbs keep their in-repo
arms unchanged; a UID operand refuses `unsupported` on each, naming the slug form, since the in-repo implementation
holds no UIDs.

### Success signal

Over the ref backend, from the flip: with two live holders of one slug — two work units, a work unit and a cohort, and
two cohorts — the store's refusals of the slug through the lookup, a read, or a write by name, `arc rename`'s and the
lifecycle verbs' among them and for two cohorts session entry's, archive's, and a member's rename, the write checks'
refusals of an edit naming it in `Cohort`, `Parent`, or `Depends On`, and status's `slug-clash` warning for two work
units name `arc rename <uid> <new-slug>` for each holder, while a tie among live holders' former slugs names the
intended holder by its current name instead. With two live Errands sharing a slug, the remedy names
`arc errand close <uid>` for each, and that close lands, after which the slug resolves to the other;
`arc errand abandon <uid>` lands the same way, `arc errand promote <slug>` under the clash refuses naming
`arc errand close <uid>` and lands on the remaining Errand once one closes, and a retry close or abandon prints repeats
the UID given. A promotion under `--name` that leaves a former-slug tie and stops after its role write resumes when
rerun by its new name. Renaming the second holder of a repaired clash away from the slug lands and reports the
former-slug tie it leaves. Renaming one of two holders in one family lands, rewrites no other record naming the slug,
reports each, and leaves the slug resolving to the other holder. With both work units linking one branch, renaming an
active one, run from anywhere on the machine holding its checkout, moves that checkout and never the other holder's and
keeps the old remote branch, and so does its continuation after a failed push; run on a machine where no checkout of the
subject holds the branch, it lands with the branch and its link unchanged and reports the branch kept with the catch-up
command, which, run on the machine holding the subject's checkout, then moves them; and before that catch-up runs, the
other holder's rename run where its own checkout is not leaves the branch both links name and keeps the old remote
branch. Renaming one of two cohorts reports a subcohort naming the slug, with an open and a completed member, with the
edits that re-point them, and those edits land. Renaming the cohort of a work-unit and cohort pair rewrites its members
as with no clash. Renaming a work unit onto an archived holder's slug lands and discharges a stub's edge naming it, and
refuses while an in-flight dependent's edge names it. Renaming a parent cohort with a started member, a completed
member, an open subcohort, and a closed subcohort with a completed member lands in one batch, on a clone lacking those
completed records' history refs too, after which every one of those records names the new slug, and an edit putting a
member's `Cohort` back on the old name refuses; renaming an archived work unit whose cohort archive closed lands on a
clone lacking both their history refs. `arc cohort close` closes a cohort left with no open member after an abandon,
which the abandon's result named, and refuses one an open stub names by a former slug, which archive of the cohort's
last current-path member then leaves open and reports, while a clash between two other cohorts blocks neither;
`arc cohort remove` removes a cohort nothing ever named and refuses one an archived member names. Before the flip, every
command above behaves as today or refuses `unsupported` naming what serves.

## Alternatives

- **Started members on a cohort rename.** Rewrite stubs only, as a work-unit rename rewrites only stubs' `Depends On`
  (`spec-seam-record-kinds.md` § 5.3): rejected, since every membership reader off the retiring path matches text, and
  renaming a parent cohort is refused by `cohort.parent` wherever an open subcohort holds a started member. Refuse while
  a member is started, as decomposition refuses moving one (§ 9.3): rejected as a dead end, since an owner cannot point
  a member at a name that does not exist yet.
- **Completed members and closed subcohorts on a cohort rename.** Keep the path they shipped under: rejected, since the
  ref backend's close letter reads closed subcohorts' `Parent` text, so it would change the backend's close code, and
  every text-matching reader would miss them.
- **Cohort lifecycle on abandon.** Abandon closing a cohort it leaves empty, mirroring archive: rejected (above).
- **Close only.** Every retired cohort into the archive, a never-membered one taking a sequence number: rejected for
  documents that never held anything.
- **Verb surface.** Everything under `arc cohort`, `arc rename` for work units only: rejected, since a clash's remedy
  would name a different command per holder's type. Cohorts through `arc archive` and `arc abandon`: rejected, since
  those carry work-unit ceremony — branches, checkouts, Candidate state — that has no cohort meaning.
- **UID subjects on every lifecycle verb:** rejected with `lifecycle-slug-selection` (above).

## Unknowns and Assumptions

- **A started member's checkout during a cohort rename.** The meta is single-writer
  (`KIND_MECHANISMS["work-item/meta"]`, `lib/store/registry.ts`). An owner's edit on the renaming machine that lands
  after the rename meets `version-conflict` and merges in the checkout (`spec-storage-projection.md` § 7.7), where the
  current-slug rule refuses a merge putting the old path back. One made on another machine meanwhile becomes a
  whole-record conflict at the pull, whose current side is the one published first (`reconcileSyncRecords`,
  `lib/store/ref/sync-records.ts` on `feat/storage-ref-backend`): where the owner's edit published first, the old path
  stays current and the rename's version becomes the conflict, and discarding it writes nothing, so no check runs. The
  member is left on the former slug.
- **A stub created on a clone that has not pulled the rename** names the cohort's old slug, which that clone still
  holds. Its ref is new, and a pull fast-forwards a new ref without running checks (`prepareSyncHistoryFastForward`;
  only a merged record is checked, `mergeSyncTree`, `spec-storage-ref-backend.md` § 6.4; both on
  `feat/storage-ref-backend`), so nothing reports it, and it too is left on the former slug. Both cases are why the
  cohort verbs find members by resolution: the rename repairs such a record, and close and remove refuse while one holds
  the cohort. Other membership readers, status's among them, miss it until its `Cohort` is re-pointed.
- **Writes to a completed item whose slug a live item reuses.** The cohort rename writes completed members and closed
  subcohorts in place, relying on the ref backend admitting a write that leaves its primary ended
  (`spec-storage-ref-backend.md` § 5.1 step 2 and A35), which its namespace admission does from `637211ee8` on
  `feat/storage-ref-backend` (`checkLiveNamespace`).
- **A cohort renamed while a cut's stored map names it.** The cut's `--finish` reads the cohort by the map's path and
  refuses `cohort-parent` on the renamed document (`acquireTerminalCohort`, `lib/decompose/acquire-terminal-targets.ts`);
  `--revise` re-places the cut's placement, as that refusal's remedy names (`spec-seam-decomposition.md` § 9).
- **A closed subcohort under a clashed parent slug** is reported and stays with the holder that keeps the slug when
  the other is renamed, since the rename rewrites no ambiguous reference. A clash reaches one only where a cross-machine
  create races onto a parent old enough to have closed a subcohort.
- **Both holders' branch links after a rename under a clash.** Where the rename leaves the subject's branch, both
  records still link `<prefix>/<old>`, as before the rename. The branch-link lookup refuses that live tie
  (`lifecycle-slug-selection` D9), so the other holder's rename leaves the branch and keeps the old remote branch, and
  teardown leaves the shared branch too (its D11), until either holder completes, the lookup then ranking the live one
  first, the other holder is renamed on the machine holding its own checkout, moving its link, or the subject's owner
  runs the catch-up rename on the machine holding the subject's checkout. Meanwhile session-init never meets the tie in
  either checkout, whose work unit it resolves by claim; teardown and session-init's orphan-branch and missing-worktree
  checks do, and the first run's report is what names the catch-up (§ Rename by UID and the clash remedy).
- **A live former-slug tie.** Where both holders of a clash are renamed away from it, by the remedy taken twice, by the
  surviving holder's later rename, or by a promotion under `--name`, each keeps the slug as a former name, and the
  lookup refuses it (`rankNameTrees`) until all but one holder completes. Today the reconcile's word check would refuse
  to prepare any work unit whose records mention the slug, under activation, reconcile, and publish alike
  (`artifactAliasTransitions`, `lib/work-unit/store-reconcile-context.ts`; `buildStoreCurrentWuReconcile`;
  `runStorePublish`), and a started dependent's edge on it would read `namespace-corrupt` (`queryDisposition`).
  `lifecycle-slug-selection`'s spec takes the tie as a clash kind of its own (its § 2.1), and its reconcile routes an
  edge on it before the retired-edge query, the edge staying unsatisfied with a diagnostic while the dependent activates
  (§ 4.3); its word check and paired-spec owner check take any `ambiguous-match` as an answer, whatever the holder
  types, a cohort among them (§ 4.2), so no such tie blocks an unrelated work unit's activation, reconcile, publish, or
  rename. Its repair, naming the intended holder by its current name (§ 4.1), is what the rename's report and the
  store's remedy name, and it resumes a promotion that stopped after leaving the tie.
- **Decomposition's retirement or extraction of an origin can leave its cohort with nothing open**
  (`spec-seam-decomposition.md` § 8.5, § 8.6): retirement ends the origin, and extraction can move it into its members'
  cohort (`writeMetaCohort`). Its result is decomposition's, not abandon's, so nothing reports the cohort, and
  `arc cohort close` still serves.
- **A completed holder's leftover local branch.** Teardown leaves a completed holder's local branch wherever the lookup
  resolves the branch to a live holder (`lifecycle-slug-selection` D11, which records the same residual). So on any
  machine still holding it — after a clash whose subject completed first, or under ordinary reuse of a completed work
  unit's slug — the live holder's later rename finds that branch under its own link and renames it as its own. That
  rename can be reversed, and the old remote branch's deletion still meets the preservation check and its two-sided
  remedy.
- **The reference backend ranks cohort holders** once `lifecycle-slug-selection` aligns it with the ref backend; until
  then a cross-type clash test runs over the ref backend's fixture alone. That backend also refuses a same-type clash at
  pull and push rather than landing it (`indexIdentities`), so the clash-repair tests run over the ref backend, and the
  reference lookup's remedy meets only a clash a fixture plants (`produceAmbiguity`,
  `__tests__/helpers/store/reference-recovery.ts`).

## Scope boundary (Won't Do)

- Lifecycle verbs' subject selection, their clash refusal, and teardown's UID operand (`lifecycle-slug-selection`); a
  UID subject on any other lifecycle verb.
- Renaming an Errand, or any Errand verb change beyond close's and abandon's UID operand, promote's clash refusal
  passing the store's remedy through, and promote's recovery matching by its receipt; renaming, reopening, or
  re-parenting a closed cohort, or re-parenting an open one (no verb re-parents a cohort, `spec-seam-record-kinds.md` §
  8.2).
- Closing a cohort automatically on abandon, or changing archive's close trigger or closeout rule beyond counting
  members by resolution (§ A path names a cohort by its current slug).
- A cohort's record and approval forms (`cohort-design-records`): these commands use today's cohort identity and
  membership.
- Any behavior change before the flip beyond the registrations and refusals above, and any workflow text: the flip's
  rewrite is `storage-cutover`'s.

**Dependencies.** `Depends On: storage-ref-backend`, whose UID-addressed rename and clash fixture this builds on. It
lands after `lifecycle-slug-selection`, building the rename's sweep on that work unit's by-reference re-read and
lifecycle view, an ordering rather than an edge; as the seam's safety net has it (`cohort-storage-seam.md` §
Coordination), this spec is approved only after that work unit's, with a re-read of what it consumes — the typed clash
candidates, the re-read of listed entries by reference, the lifecycle view listing every holder under a clash, the
shared namespace admission check and its shared edge settler, the disposition query's handling of a holder that is not a
work unit (D4), the former-name tie as a clash kind, held by the word check and routed by the reconcile, with its repair
(its spec § 2.1, § 4.1–4.3), the word check and paired-spec owner check taking any `ambiguous-match` as an answer (§
4.2), archive's membership counting over every holder (D1), on which this work unit's resolution counting at the same
call sites builds, the lookup's tie-break among completed work units (D10), the UID-bearing marker and claim with holder
lookup matched by UID (D8) and its unbound holder's exits (its spec § 7.3, § 7.4), the branch-link lookup's ranking and
live-tie refusal (D9), teardown's branch gate and UID operand (D11), and the reference backend's cohort ranking.
`cli.ts` and `lib/store/lifecycle-rename.ts` change on `feat/storage-ref-backend` and `feat/seam-delivery-review` too:
merge base after each lands, before implementing. `storage-cutover` depends on this work unit.

## Shaping state

Re-entered at `high` on 2026-10-22, after the first review loop's fix check found new design needed again where the
cohort rename writes completed records, where the cohort verbs count members, and where a rename under a clash meets a
checkout. Re-entered again on 2026-10-23 for the branch step alone, after the fresh loop's fix checks found sustained
non-convergence there.

- **Resolved:** all three, with the shaping follow-ons they raised — abandon's report counting by resolution, and the
  old remote branch kept under a clash (Owner, 2026-10-22), which the branch step's lookup rule has since replaced. The
  fresh loop's first pass replaced the in-checkout rule and its two-active-holders residual with the subject's checkout
  found by UID (`lifecycle-slug-selection`'s D8).
- **Resolved:** the work-unit arm's target takes `lifecycle-slug-selection`'s shared admission check, and a rename onto
  a reused slug settles edges through its shared settler, mirroring creation (Owner, 2026-10-22, on that work unit's
  proposal).
- **Resolved:** the work-unit target follows `lifecycle-slug-selection`'s narrowed admission check and D10, and
  teardown takes a UID by D11 (Owner, 2026-10-23).
- **Resolved:** the branch step (Owner, 2026-10-23), after rounds 2 to 4 of the fresh loop's fix checks each found a
  new defect where a work-unit rename touches a branch whose name another holder's link shares. The first run decides
  each step from the branch-link lookup of the old branch, as the sibling's teardown gate does, that lookup replacing
  the clash rule for the old remote; a branch the lookup gives the subject but this machine lacks refuses as today; a
  continuation never deletes the old remote branch; and the preservation check's remedy names both readings. The options
  weighed drew on Git's and Jujutsu's handling of shared branch names, leases on remote updates, and the sequencer's
  recorded plan on `--continue`.
- **Resolved:** a continuation run from the subject's checkout catches up a branch the first run left, and the branch
  tie's remedy names it (Owner, 2026-10-23, after the fresh loop's first pass).
- **Resolved:** after the fresh loop's second pass (Owner, 2026-10-23): Errand close and abandon take `<slug|uid>`, a
  scope expansion into the Errand verbs; archive's trigger counts members by resolution, leaving a cohort open where a
  record on a former slug holds it; the catch-up runs from anywhere on the machine holding the subject's checkout; and
  the cohort rename may take an abandoned or retired work unit's slug.
- **Resolved:** after the second pass's fix check (Owner, 2026-10-23): promote takes `<slug|uid>` too, and a
  former-slug tie's repair follows `lifecycle-slug-selection`'s spec.
- **Resolved:** after the second pass's third fix-check round (Owner, 2026-10-23): promote returns to its slug operand,
  its clash refusal passing the store's remedy through, and the promotion tie report is dropped, since three rounds'
  findings came from promote's UID, which served no goal close and abandon do not; `lifecycle-slug-selection` adopted
  taking any `ambiguous-match` as an answer in its word checks (its § 4.2).
- **Resolved:** after the second pass's fourth fix-check round (Owner, 2026-10-23): promote's recovery matches by its
  receipt, so a promotion stopped after leaving a former-slug tie resumes by that tie's repair.
- **Resolved:** after the third pass (Owner, 2026-10-23): archive's closeout rule counts by resolution, Errand close's
  lock recovery matches the selected record's claim, and under a clash a rename meeting an unbound marker exits by
  release, the subject's checkout returning by materialize under the new slug.
- **Resolved:** the spec amends no shipped spec, since a spec binds only its own work unit (Owner, 2026-10-23). Changes
  to `storage-seam`'s shared decisions are recorded in the cohort documents instead, each beside its item, dated, and
  stated as the decision now stands. In `cohort-storage-seam.md` § Shared contracts: the writers of `Cohort`, the
  rename's rewrites only where a slug resolves to its subject, the cohort document's writers, and the write check's
  current-slug and open-members rules. In `cohort-state-storage.md`: the D14 change, where each kind of clash refuses
  and what its remedy names. The `slug-clash` warning's text, decomposition's remedies, and the rename's branch handling
  stay in the spec body alone. Recorded at capture (2026-10-23); create-spec updates any record whose decision its spec
  changes.
- **Open:** none.
- **Next:** create-spec, once `storage-ref-backend` lands or nears landing (Owner, 2026-10-23).
