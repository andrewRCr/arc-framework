# Notes: storage-ref-hardening

## Coordination with `store-operation-git-access`

That work unit gives every public ref-store call one operation scope: a shared `cat-file --batch` reader and
remembered configuration lookups, refreshed at the events that can make them stale. Its spec,
`spec-store-operation-git-access.md`, is the authority on that scope, and the two sessions coordinate directly.

- **Order, not an edge.** The two land in an agreed operating order with no `Depends On` either way (Owner,
  2026-10-30), per `RELEASE-GATES.md`'s Stance. Which lands first is settled when this unit's task list finalizes: that
  unit if it is in verification by then, otherwise this one. The unit landing second merges base first.
- **Port obligations, confirmed by that unit's session** (2026-10-30): its wrapped `execInput` keeps executor options
  unchanged, its wrapped `fs` keeps the full `lstat` result, and its planned wrapped `lock` forwards `waitMs` unchanged,
  zero included, each with a regression case. The spec's § 12 states these as contracts any wrapper keeps.
- **Shared files.** Whichever unit lands second merges the other's change in each:
    - `batch-read.ts`: its `readBatchObjects` missing-answer check; this unit's `readRefTrees` change.
    - `pull.ts` and `push.ts`: its restart hooks; this unit's typed transport failures and lock mapping.
    - `write.ts`: its restart of `executeRefBatch`'s loop; this unit's `refBatchFailure` and `commitLockedRefBatch`.
    - `backend.ts`: its routing of `refReadOperations` through the coordinator; this unit's `version` lock mapping.
    - `fetch-seen.ts`.
    - `sync-deadline.ts` and `ref-transaction.ts`, which this unit changes and whose deadline behavior that unit relies
      on: an expired deadline still refuses the next Git process and the next lock.

## Later work that reads § 1–§ 4

`storage-projection`'s and `cohort-identity-verbs`' ref-backend phases build on the listing scope, the fault classes and
remedies, and the pull-result consumer sweep. They are the work § 13's re-raise watches: if either becomes ready to start
while this unit's remaining work is more than about a week out, re-raise the cut of § 1–§ 4 into its own member.

## Review during execution

`storage-ref-backend` took eight standard passes before its review stopped under a rule fixed in advance. For this
unit: review code reachable from shipped commands first, in its own chunks; group findings by shared cause after the
first pass; and agree a stop rule with the Owner before the second pass.

## Evidence for § 5

The stranded ref lock that § 5 removes is recorded in `notes-storage-ref-backend.md` § A58, from hosted dispatch
`40794816270`: the Windows separate layout's publishing burst refused on a lock the sync deadline stranded. That burst
is the case § 5 unskips.
