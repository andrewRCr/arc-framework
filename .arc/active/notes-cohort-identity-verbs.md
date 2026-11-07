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

---
