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
- [Deferred companion repairs — A6](#deferred-companion-repairs--a6)
- [Repair enforcement invariants — 2026-11-07](#repair-enforcement-invariants--2026-11-07)
    - [Rename participant completeness — 2026-11-07](#rename-participant-completeness--2026-11-07)
- [Prepared-write admission — A7](#prepared-write-admission--a7)
- [Disagreeing member paths — A8](#disagreeing-member-paths--a8)
- [A closed subcohort's unsettled open member — A9](#a-closed-subcohorts-unsettled-open-member--a9)
- [Refusing where the Parent check would — A10](#refusing-where-the-parent-check-would--a10)
- [The named parent's conditions — A11](#the-named-parents-conditions--a11)

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
A write check sees `before`, `after` and the observations, not the batch's write list, but `after` is the whole
batch's state. So each record fresh preparation acquires must land as it writes it, or unchanged where it writes
nothing: a write the fresh plan now withholds also refuses. Exact-reference evidence cannot catch that narrowing, for
instance a second retired lineage turning a settlement into none. A write outside the acquired records stays under its
own kind's checks. Absences need no batch observation at admission, since the same preparation refuses when the record
is present; the verb still observes them and the records it writes, whose conflict sets a write's version omits.

Every rename-provenance batch is accountable to fresh preparation, so a test fixture that builds a state the verb
cannot reach, such as a former name still cited elsewhere, renames under a fixture provenance instead.

A store-version precondition on the batch was considered: preparation's `store.version()` would bind the whole state.
It changes the store contract on every backend and refuses on any unrelated write, so A7 keeps the change inside this
unit's write checks.

The superseded admission rule, recorded with the review corrections, was:

> At atomic admission, the shared rename check compares fresh holdings and supported references with preparation's
> record observations. A newly visible required participant refuses the whole batch and names fresh preparation as the
> retry.

§ 2.3's settler previously said it "binds the records it read as the batch's observations"; it now returns them as
evidence that admission re-derives.

Verification injected a store change between preparation and submission on both backends where the state can form,
one case per read family from the audits' scenarios plus an unrelated write that admits. Each seeded case failed
against the predicate admission before the change. A second retired lineage cannot form locally:
`work-item.slug-edges` refuses the second generation while a stub's edge still names the first.

---

## Disagreeing member paths — A8

The A7 audits found that a cohort rename refuses through `meta.cohort` when a member's `Cohort` path no longer agrees
with its leaf's `Parent`. Confirmed on 2026-11-07: a completed member holds `p/l`, then `l` moves under `q`.
`cohort.parent` checks only open members' paths, so the move lands. Renaming `l` to `t` then refuses on `p/t`, and
renaming `p` to `t` refuses on `t/l`; nothing is written. Sync can bring the same disagreement to an open member.

Such a path has no consistent rewrite: every candidate either keeps a first segment that is not the leaf's `Parent`
or changes which parent the member names. Retaining it and reporting the edit to the leaf's current path follows A5
and A6, which retain what the batch cannot change consistently and report the exact repair. Rewriting it to the
leaf's actual path was rejected: the rename would change an archived record's membership from inferred intent.
Refusing with a clearer message was rejected because it leaves the rename blocked until someone edits archived
history.

The superseded rule in § 5.1 ¶3 was:

> Each `Cohort` is rewritten to the current path of the cohorts its segments resolve to, with the new slug in the
> renamed cohort's segment, so a record left on a former slug in either segment is rewritten whole.

It still holds for every path that agrees with its leaf's `Parent`.

## A closed subcohort's unsettled open member — A9

Pass 18 of the pre-publication review found a parent cohort's UID rename refusing through `cohort.parent` when its
closed subcohort held an open member the batch could not settle, with a remedy the renaming person cannot carry out.
Probes on 2026-11-08 confirmed two causes: the member's first segment tied with another live cohort, and its leaf tied
with a live namesake. A path disagreeing with the subcohort's `Parent` takes the same route; ordinary writes cannot form
it, since `meta.cohort` refuses it, but sync can. Coupled retention (A5) covered open subcohorts only, and the repair
planner's closed-subcohort refusal had replaced the retention advisory for the leaf tie.

Retaining the closed subcohort's `Parent` was rejected: `meta.cohort` compares a path's first segment with the leaf's
`Parent` by text, so a `Parent` left on what becomes a former slug strands the member, and no later edit of either
record alone admits. The Owner chose on 2026-11-08 to refuse before the batch, naming the exits.

Which exits exist was settled during the fix. The store ranks a name's holders live and current, live and former,
completed and current, then completed and former. Renaming the other holder of a first segment both hold as their
current name leaves that name the renamed cohort's alone, so it is an exit. A leaf tie has none: any live holder of the
name outranks the closed subcohort under either name, and a probe showed the retry refusing again after renaming the
namesake. A former-name tie has none either, since former names persist. The member owner's `Cohort` clear always
settles it, though the member cannot then rejoin the closed subcohort. The Owner approved naming only exits that land on
2026-11-08. Making the first-segment exit land also required the other holder's rename to leave the member alone: its
closed leaf's `Parent` names the parent, so it is the parent's member. The repair planner had refused that rename
through its closed-leaf check; such paths and retained closed groups now stay out of the planner.

The superseded rules were § 4's

> The parent’s UID rename still lands.

for a closed subcohort, and § 5.1's

> closed-child retention and restoration restrictions remain in force.

as the only treatment of a closed subcohort's open members. An open subcohort's coupled group is unchanged: one whose
member's path disagrees with its `Parent` is retained with it, which a native case now covers.

## Refusing where the Parent check would — A10

The fix check after pass 18 found A9's repair incomplete at two sibling paths and imprecise in its exits; probes
reproduced each on 2026-11-08. `cohort.parent` compares a moved `Parent` by text with every open cohort's `Parent` as
well as with its open members' paths, and A9's pre-check copied only the member clause. A live namesake of a closed
subcohort with an open subcohort of its own therefore still refused the parent's rename at admission, with a remedy
nobody could carry out, although renaming the namesake landed. Separately, a path whose first segment two live cohorts
hold, running to a closed subcohort whose `Parent` is null or names no one cohort, still failed the whole preparation in
the repair planner's closed-leaf check, so both holders' renames, the clash's own repair, refused. And A9's refusal
counted a live namesake's agreeing member as the closed subcohort's, naming only the clear, which loses membership,
though the namesake's rename lands; it omitted the edit to the subcohort's current path, which keeps membership, too.

The shared cause is text comparison where the store resolves names by tier, copied clause by clause into the rename.
Every complete pass since pass 4 had found one or two majors in this region, each needing a design fold, so the round
stopped for the Owner, who chose on 2026-11-08 to compute the comparisons once and classify exits by resolution, over
changing the check to compare by identity, which would alter what every cohort write admits, or deferring the majors.
`cohortParentConflicts` now serves both the check and the rename's pre-check, so the two cannot drift. The pre-check
covers every `Parent` the batch moves, open subcohorts included: an open subcohort whose name a live cohort also holds
refused at the same clause, and its own rename is the exit. A closed subcohort whose group the batch retains still
counts as moved, since leaving its `Parent` on a former slug strands its open members.

Each exit was confirmed to land before it was named. Renaming a namesake moves its own agreeing member and its
subcohort's `Parent`, but not a path that disagrees with the namesake's `Parent`, which A8 keeps. Renaming an open
subcohort removes every text collision with its name; a closed cohort cannot be renamed. A member's edit to the
subcohort's current path is admitted only where that path's first segment is its parent's current slug and the leaf is
the subcohort itself, so it is named only then. The clear always lands.

Amended 2026-11-08 (A11): the next fix check found two exits named before the clear refusing in states only a sync
forms. Under two-level open nesting, an open subcohort's own rename carries its colliding references with it and refuses
at the named parent's conditions besides; under a live tie on a namesake's `Parent`, the namesake's rename refuses on
that tie. The clear lands in both. The Owner chose to record these states as source-inferred rather than gate those
exits on resolution. The clear's closed-subcohort note now follows the member's resolved leaf, so a live namesake's
member no longer reads as the closed subcohort's.

The Owner also directed, through the project manager, an enumeration matrix over the states the rename can meet before
the next look — name ties, open and closed subcohorts, agreeing and disagreeing paths, namesakes with and without
subcohorts — asserting that each refusal writes nothing and every exit it names lands. If a later look still finds a
major about which exits a refusal names, it returns to the Owner as a scope call rather than another amendment.

The superseded rules were § 5.1 A9's

> naming each such member and its exits: its owner's `Cohort` clear, after which it cannot rejoin the closed subcohort,
> and, where its first segment is tied between live cohorts holding it as their current name, the other holder's UID
> rename, which leaves that name the renamed cohort's alone. No rename settles a tied leaf, since any live holder of a
> name outranks the closed subcohort under either name, nor a former-name tie, since former names persist.

and criterion 23's list of exits, which criterion 24 replaces.

## The named parent's conditions — A11

The second fix check after pass 18 found the A10 pre-check still short of the Parent check. Before its nesting and
member-path comparisons, `cohort.parent` holds the cohort a new `Parent` names to its own conditions on a parent: open,
and not nested below another cohort. The pre-check mirrored only the comparisons. A cohort nested below another, once a
subcohort of its own had closed, therefore refused its own rename at admission with the check's generic remedy, writing
nothing, and un-nesting it let the same rename land. The nesting rule counts open subcohorts only, so ordinary checked
writes form this state. Both reviewers' probes and the author's re-run reproduced it on 2026-11-08.

Under the project manager's standing direction, a major about which exits a refusal names, found after the matrix,
returned to the Owner as a scope call. Of three directions — mirror the remaining conditions, record a residual, or
change the shipped check to count closed subcohorts — the Owner chose on 2026-11-08 to mirror them, since they are the
last conditions of `cohort.parent` a moved `Parent` can meet. `namedParentProblem` now serves both the check and the
rename's pre-check. For a subcohort's `Parent` moved to the new slug the named cohort is the renamed cohort as planned,
whose nesting alone can fail, since the new slug's sole holder is the open renamed cohort. For the renamed cohort's own
`Parent`, re-pointed from a former slug, the read that resolves it already refuses an absent or ambiguous parent,
leaving a completed or nested one, which only a sync forms. Either way the exit is the renamed cohort's un-nesting,
whose open members are every open record whose path names it, as the check reads them. A malformed named document is
left to the check's own refusal, which names its repair.

The superseded premise was § 6.2's

> the renamed parent is open and top-level

which holds only for a parent with no `Parent` of its own. Criterion 25 adds the nested case, and criterion 24's landing
after any one named exit is qualified for states only a sync forms.

---
