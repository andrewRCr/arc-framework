# Notes: cohort-identity-verbs

## Contents

- [Catch-up publication recovery](#catch-up-publication-recovery)
    - [Superseded subject rule](#superseded-subject-rule)
    - [Superseded continuation and catch-up rules](#superseded-continuation-and-catch-up-rules)
- [Branch-link remedy limits](#branch-link-remedy-limits)
    - [Superseded branch-link rule](#superseded-branch-link-rule)

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

---
