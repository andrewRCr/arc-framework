# Notes: cohort-identity-verbs

## Contents

- [Catch-up publication recovery](#catch-up-publication-recovery)
    - [Superseded subject rule](#superseded-subject-rule)
    - [Superseded continuation and catch-up rules](#superseded-continuation-and-catch-up-rules)
- [Branch-link remedy limits](#branch-link-remedy-limits)
    - [Superseded branch-link rule](#superseded-branch-link-rule)
- [Same-name refusal order](#same-name-refusal-order)
    - [Superseded input-refusal rule](#superseded-input-refusal-rule)
- [Captured branch-link facts](#captured-branch-link-facts)
    - [Superseded shape-only remedy rule](#superseded-shape-only-remedy-rule)
- [Coupled cohort holdings — A5](#coupled-cohort-holdings--a5)
- [Prepared-write admission — A7](#prepared-write-admission--a7)

## Catch-up publication recovery

The public `HistoryEntrySchema` retains a record reference, version, content, and provenance, but no branch links.
`ReadInputSchema` takes a whole-store `StateVersion`, not the historical `RecordVersion`. `renameOrigin` therefore
recovers the latest logical source name, without establishing which older alias a catch-up branch carried.

The diagnostic `439e35a1342947b4b7f43dac21578903` used actual Git branches, a rejecting bare-repository hook, and
public Store writes to arrange a landed older-alias catch-up. The ordinary rename retry reported unpublished and left
the new branch absent. The exact pending push then published it while preserving the old remote, record, history,
marker, and checkout. The temporary diagnostic was removed after the run.

The amendment keeps local preparation before the version-checked batch and publication afterward. Failed catch-up
publication uses its captured repository and actual new branch in the Git remedy. Moving publication before the batch
would change the transaction boundary; guessing from alias refs would not prove publication intent. Durable recovery
evidence would be a broader design change.

The following settled text is superseded only for failed catch-up publication; ordinary rename recovery is unchanged.

### Superseded subject rule

> The retry and the typed continuation repeat the operand the person gave, a UID or a slug: `renameSteps`'
> `retryCommand`
> and `finishRename`'s remedy argv (`lib/work-unit/verbs/rename-store.ts`) take it in place of the subject's original
> name and the requested source slug. A rerun by slug resolves the subject's current name, which on a resume is the
> target and is free for the subject itself (§ 2.2).

### Superseded continuation and catch-up rules

> - **A continuation never deletes the old remote branch.** A rerun after a failed push or a refused delete pushes what
>   remains and reports the old branch kept. A rerun cannot re-decide on the first run's evidence, since the batch has
>   moved the subject's link and the other holder may have moved its own since, so the continuation takes the outcome
>   that is safe either way. Today's rerun deletes it; the report now leaves that to the person.
>
> - **A catch-up run moves a branch the first run left.** Rerunning the rename with the subject's current slug,
>   `arc rename <uid> <slug>`, from anywhere on the machine holding the subject's own checkout, found by UID as on a
>   first
>   run, where that checkout has checked out a branch its link names after a former slug of the subject, renames that
>   local branch to `<prefix>/<slug>`, moves the link in a link-only batch, and pushes the new name, keeping the old
>   remote branch as any continuation does. Elsewhere a continuation still runs no local step (`persistRename`), and the
>   branch step matches only a branch named after the current slug (`branchRename`), so without the catch-up nothing
>   would
>   move the link.

## Branch-link remedy limits

Amendment A2 keeps `catchUpCoordinates`' existing authority: the holder's checkout must be on a linked two-segment
branch whose last segment is a retained alias. `branchLinkRepair` has only references, not those aliases. Its remedy
therefore qualifies catch-up by that condition, and states the absence of a rename-based repair for other branch
shapes. Adding branch movement for arbitrary linked names would broaden rename's authority without serving its
established work-branch naming rule.

### Superseded branch-link rule

> The branch-link lookup's `ambiguous-match`, whose `tie` carries `liveness` alone, takes a remedy from
> `branchLinkRepair(candidates, tie, branch)` in `lib/store/clash-repair.ts`, not `clashRepair`, whose moves would not move
> a link; `branch` is the branch the lookup names, since neither the tie nor a holder's reference carries the link. A
> completed tie — only Errands link the branch, and every one is closed (`refCandidates`) — takes the completed text
> `clashRepair` gives: no lifecycle repair, naming each holder's UID. A live tie's remedy names, per holder, the move that
> takes its link off the branch, run on the machine holding that holder's checkout:
> `arc rename <uid> <new-slug>` for a work unit, or the catch-up `arc rename <uid> <slug>` for one whose current slug no
> longer names the branch (§ 2.5), and `arc errand close <uid>` for an Errand, which links its `chore/<slug>` branch as
> created and which no rename moves. Its argv is `arc status --json`. Only the branch lookup's readers meet the tie:
> teardown's gate, which leaves the branch and reports it, and two session-start checks, each warning with the refusal's
> remedy — the orphan-branch sweep (`readOrphanStoreCandidates`, `lib/session-init/orphan-store-candidates.ts`, through
> `resolveStoreBranch`) and the missing-worktree check (`readStoreMissingFolderActions`,
> `lib/session-init/missing-worktree-store.ts`). Session start resolves a live checkout's work unit by its claim, never
> through its branch, so the first rename run's report of the branch kept is what names the catch-up. The tie lasts until
> one holder completes, the lookup then ranking the live one first, or one holder's link moves: the other holder renamed
> on the machine holding its own checkout, or the subject's catch-up run.

## Same-name refusal order

Amendment A3 keeps `handleRename`'s distinct-name check after `buildExecutor` selects the backend. The store arm's
`readStoreRenameSubject` and `catchUpCoordinates` use equal names for continuation and catch-up; rejecting them in
`RenameCommandInputSchema` would block those paths. The in-repo arm still applies
`InRepoRenameCommandInputSchema`, so the observable difference is which refusal wins when admission also fails.
The new native CLI case pins a missing project's precedence without changing repository content.

### Superseded input-refusal rule

> - `arc rename`, `arc errand close`, and `arc errand abandon` keep their in-repo arms unchanged and take every operand
>   as a slug, since the in-repo implementation holds no UIDs. Unlike teardown, which passes its operand on unparsed
>   before the flip (`runTeardownForOperand`), the in-repo arm parses each operand with `SlugSchema` once the store is
>   open, since only the store says whether state is off-branch (`usesOffBranchState`), and refuses one it rejects
>   through today's input refusal: `parseLifecycleCommand`'s for rename, and `locus.errand-close.input` and
>   `locus.errand-abandon.input` for the Errand verbs. Today that parse runs first, so where an operand that is a UUID but
>   not a slug also meets a refusal the verb reaches before its store opens — identity, the project root, configuration
>   such as `branch.protection` and `branch.base`, the stdin Git boundary, or the store's own open — that refusal now
>   shows first.

## Captured branch-link facts

Amendment A4 gives `branchLinkRepair` the placement, ordered links, and former slugs already available to
`refCandidates` and the reference backend's `lookupReference`. `selectWorkBranchLink` distinguishes the selected work
branch from a retained promotion link. Shape alone could not: `replace` retains the Errand branch before appending the
new work branch, and `renameMutation` replaces only the selected link.

`renameOrigin` also requires a previous meta name, which an alias inherited from an Errand does not prove. The remedy
therefore states the prior-work-unit-rename and UID-bound-checkout conditions for catch-up. No new history read,
stored field, public refusal field, or branch-mutation authority is introduced. Criterion 20 remains immutable for
supersession by the appended replacement at verification.

### Superseded shape-only remedy rule

> The branch-link lookup's `ambiguous-match`, whose `tie` carries `liveness` alone, takes a remedy from
> `branchLinkRepair(candidates, tie, branch)` in `lib/store/clash-repair.ts`, not `clashRepair`, whose moves would not move
> a link; `branch` is the branch the lookup names, since neither the tie nor a holder's reference carries the link. A
> completed tie — only Errands link the branch, and every one is closed (`refCandidates`) — takes the completed text
> `clashRepair` gives: no lifecycle repair, naming each holder's UID. A live tie's remedy names each holder's move or limitation,
> with moves run on the machine holding its checkout (A2). For a work unit linking `<prefix>/<current-slug>`, it names
> `arc rename <uid> <new-slug>`. For any other two-segment branch, it names the catch-up `arc rename <uid> <slug>`
> only if the branch's last segment is a former slug of that holder (§ 2.5), and explicitly says that rename cannot move
> the link otherwise. `branchLinkRepair` receives references without aliases, so it states that condition rather than
> claiming to establish it. For other branch shapes it names the holder and branch and states that no rename-based
> repair is available; it does not advertise a catch-up. For an Errand it names `arc errand close <uid>`, which ends the
> holder of its created `chore/<slug>` branch. Its argv remains `arc status --json`.

## Coupled cohort holdings — A5

The sole-holding prescription in § 5.1 and Task 5.2's original goal assumed each holding could move independently:

> Every record holding the cohort by a sole holding (§ 7.1): every member's `Cohort`, open or completed, started
> members included — a direct member's and, for a parent, its subcohorts' members' — and every subcohort's `Parent`,
> open or closed, when the renamed cohort is a parent.

An open child's unique former Parent can coexist with an open member's ambiguous current path after a pull. Updating
only Parent makes `checkCohortParent` refuse; updating the member would choose its owner without evidence.
`coupledRetainedParents` retains that group, and `prepareSoleHoldings` also retains sole members behind an ambiguous
Parent. `cohortHoldingRepairs` supplies the existing clear → Parent → restore order, with completed-member edits afterward.
This qualifies the original automatic-update promise rather than weakening admission. Closed-child restrictions stay
with `closedParentDisposition` and `closedLeafDisposition`; a completed member alone does not require group retention.
The appended criteria preserve the original batch and missing-history cases while making the mixed-resolution exception
checkable. The review-fix verification closes this bounded amendment.

## Deferred companion repairs — A6

The nested-clash probe on 2026-11-06 showed both possible UID rename orders refusing. `parentEdits` requires a known
child before proposing restoration, while `prepareDocument` requires a known parent before renaming a child. Two
independently valid nested groups arriving together can therefore create a repair cycle. The Owner approved A6 and
its full review-fix verification on 2026-11-07, with one independent fix check after the repairs.

The superseded exact-edit requirement was:

> Report every retained holding, including sole ones, through § 4's ordered clear → `Parent` → restore edits.

A6 preserves those edits when the full destination is proved. Unproved companion groups instead retain every field,
name every exact holding owner and report the identity prerequisite through existing reference rows and advisories.
No guessed member assignment, new command, weaker admission rule or closed-child restoration is introduced.
A6 also requires the shared planner to include a known child Parent prerequisite when retirement selects the child
rather than its parent; otherwise a former-name member path could be canonicalized before Parent was repaired.

The original Goal 3 reporting clause, now qualified for unresolved companions, was:

> reports every reference to the subject that rule leaves with the edit that re-points it.

The scoped revision covers shared field planning, rename report consumption, retirement and archive report consumers,
and behavior tests that execute every advertised edit or resolve the named prerequisite first. Existing all-sole,
completion/history and closed-child behavior remains part of the regression boundary.

`cohortHoldingRepairs` separates proved edits from deferred groups. `observeCandidateParent` captures the leaf’s own
Parent binding through the shared segment cache, so the report can include prerequisites outside the selected
cohort’s direct holdings. `parentTargetEligibility` keeps changed Parent edits subject to the existing open,
top-level and conflict rules. The original closed-child case caught and removed an overly broad retention condition:
only an unresolved companion, rather than the renamed parent’s own segment, adds that retention.

The native regression exercises simultaneous parent/child clashes for open and completed members, retaining all
unresolved fields before owner-chosen continuation. The memory reference fixture cannot execute half of a two-clash
repair: its unchanged `indexIdentities` validation rejects any remaining duplicate live name on every batch. It is
not modified here. Both backends execute the former-Parent prerequisite sequence, and the shared planner matrix covers
separate aliases and unavailable evidence. The full local merge gate passed all 20 selected checks and all six store
shards over 431 eligible suites. Hosted CI and the independent fix check follow the committed repair.

## Repair enforcement invariants — 2026-11-07

The approved repairs preserve three existing contracts at their phase boundaries. These guide implementation and
verification of the current corrections:

- **Selection:** After successful selection, a rename invocation retains the selected owner and operation kind through
  automatic history retries. Each retry refreshes that owner's evidence; the original operand remains reporting
  context. A two-store regression introduces a higher-ranked namesake during the history pull and checks which UID
  changes, while retaining the existing multi-round recovery cases.
- **Admission:** The primary version and conflict set that justified retirement preparation must still hold at atomic
  admission. Conflict-only arrival must refuse without retiring the subject; resolution and a fresh confirmed command
  must then succeed. The regression exercises close and removal on both operational backends through registered CLI
  dispatch and the existing record-observation boundary.
- **Planning:** Equivalent complete holdings inventories have equivalent feasibility, deferred groups and effective
  field edits regardless of enumeration order. Genuine clear → Parent → restore dependencies still govern execution.
  Unit cases reverse the same inventory, and the native archive regression pins both UID orders and applies every
  advertised edit. Semantic plans are compared without requiring incidental serialization order.

### Rename participant completeness — 2026-11-07

At atomic admission, the shared rename check compares fresh holdings and supported references with preparation's
record observations. A newly visible required participant refuses the whole batch and names fresh preparation as the
retry. Cohort holdings include completed members, Parent owners and all members needed by a retained coupled group;
reference participants include supported filename citations in shared and owned artifacts, plus work-item dependency
or waits-on report rows. Existing family resolution, coupled retention, unproved-companion advisories and closed-child
restrictions still decide each participant's rewrite or report. Unrelated started or closed prose and plain filename
mentions do not fence the rename.

Work-item preparation observes every acquired record and every additional report-only dependent. The latter stay
outside the writable sweep, retaining authored bytes while binding the evidence used to produce their repair rows.
Dual-backend CLI tests insert participants at the preparation/admission boundary, assert refusal preserves the
post-arrival state, and retry from fresh preparation to include the new rewrite or report.

Owned-artifact completeness uses the selected owner's identity before shared-name resolution. An archived work item's
old slug can resolve to a live namesake while its own group still requires supported filename rewrites. Arriving owned
drafts, specs, task lists, notes and keyed companions therefore refuse until fresh preparation includes them; the live
holder's shared references remain unchanged and unreported. The shared resolution exemption applies only to shared
participants. Cut-map exclusion and unrelated arrivals retain their existing behavior.

The ownership/resolution matrix exercises subject and other-holder resolution on both backends and concurrent
ambiguous name reads on the native backend. The memory fixture's name read uses its identity index and does not model
that tie. Every case preserves the complete post-arrival state on refusal, then retries and checks the owned rewrite
beside the shared reference's rewrite, report or preservation.

Admission also reuses preparation's conventional self-reference transformer and its group-relative filename projection.
Title-only and backticked `--plan` references require the same owned participant capture as filename citations. Eligible
shared research/analysis companions require capture only when the source names the subject alone; an ambiguous or
other-holder self-reference remains untouched and unreported. A shared self-reference edit prepared before name
resolution changes refuses at admission and succeeds on fresh retry with that reference preserved. Unsupported titles,
plain operands, nonconventional companion filenames and started/completed shared groups retain their existing behavior.

## Prepared-write admission — A7

Eleven review findings across nine rounds shared one shape: a rename or cohort retirement prepared its batch from store
reads, and a record arriving, changing or gaining a conflict before submission went unchecked because admission did not
re-derive that part of the plan. Each correction added a predicate that re-implemented one participant class of the
planner. Two independent read-only audits on 2026-11-07, one per arm, enumerated every store read preparation makes
against what admission covers. They found further unmirrored reads in the work-unit rename: a quiet owned companion
cited by an observed record, a second retired lineage for the target, a Candidate appearing after its check, the
branch link's holders, and name resolution changing from ambiguous to subject, plus stale report rows. For cohorts,
archive's in-batch closeout observed nothing, so a conflict arriving on a cohort it completes went through, because
`observeCohorts` skips completed cohorts before testing conflicts. Close and remove were covered.

The audits also established what the backend already guarantees. `commitRefStep` serializes every publication,
including sync merges, under one store-wide lock, and `refAdmissionBasisChanged` retries a batch whose state refs moved
after submission. The open span is therefore each verb's own, from preparation to submission. Re-running preparation in
the write check closes it with the code that made the decisions, instead of a parallel copy of them.

Evidence excludes refusals because the lifecycle inventory refuses on any conflicted meta. Counting every meta as
evidence would make any unrelated edit refuse a rename, while re-deriving refusals keeps preparation's behavior.
Admission checks completeness only: a write check sees `before`, `after` and the observations, not the batch's write
list. The finding class is omission, and any extra write remains under its own kind's checks.

A store-version precondition on the batch was considered: preparation's `store.version()` would bind the whole state.
It changes the store contract on every backend and refuses on any unrelated write, so A7 keeps the change inside this
unit's write checks.

The superseded admission rule, recorded with the review corrections, was:

> At atomic admission, the shared rename check compares fresh holdings and supported references with preparation's
> record observations. A newly visible required participant refuses the whole batch and names fresh preparation as the
> retry.

§ 2.3's settler previously said it "binds the records it read as the batch's observations"; it now returns them as
evidence that admission re-derives.

Verification injects a store change between preparation and submission on both backends where the state can form. It
seeds one case per read family from the audits' scenarios and adds an unrelated write that must admit. Each seeded case
must fail against the predicate admission before the change.

---
