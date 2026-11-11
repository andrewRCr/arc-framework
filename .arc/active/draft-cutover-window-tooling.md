# Draft: cutover-window-tooling

- **Origin:** split from `cutover-flip` at its create-spec entry (Owner, 2026-11-10), on the PM's read that the split
  is neutral on dates. That work unit crossed this project's size marks, with a spec forecast of about 1,700 to 2,200
  lines and a change set of about 10,000 to 20,000, and of its parts only the window's pre-flip machinery can sit inert
  on `main` before the window while the window keeps exactly one merge. The split also settles where the quiesce check
  lives: the window runs it on `main`'s pre-flip build (Owner, 2026-11-06), so it must be on `main` before the window.
  This reverses the 2026-11-05 placement of the check in the flip's own change. The design below began as
  `draft-cutover-flip.md`'s text as written, its section references re-pointed and the corrections § Carried in names
  applied; this unit's draft-design stage then folded in what § Planning state lists.
- **Purpose:** Build and rehearse the machinery the cutover window runs on `main`'s pre-flip build before the flip
  merges: the quiesce check with its record and hold, the abort's restore, the worktree lock step, and Stage 1's copy
  driver, accounting case, and chain comparison.

---

## Planning state

- **Readiness:** formalization-ready at draft-design's close (2026-11-10), with the folds below.
- **Entry read:** depth `medium`; `Class` stays `Heavy`. The design was authored and reviewed in `cutover-flip`'s draft,
  three adversarial passes before the split, so derivation's realized floor holds; what remained here was bounded:
  conformance to the flip's spec and what the split left out. Composed from landed machinery, not invented.
- **Boundary:** stays one work unit. The Owner cut it from `cutover-flip` at that unit's create-spec entry
  (2026-11-10), and it sits under every size mark: a spec forecast of about 500 to 800 lines and a change set of about
  2,000 to 5,000, by the PM's read about a fifth of the flip's. No delivery-plan candidate: its parts land together
  ahead of the window, Stage 1 verifies them together, and the window runs them once.
- **Relayed by the PM** (Owner, 2026-11-10, in the PM's session):
    - **The spec's review limit:** two complete passes, each with its fix checks, extended only by the Owner, aimed at
      the abort's restore and at anything the quiesce check could miss that would let a record cross the window.
    - **Dates:** ready to build about 11-15 to 11-17, on the first free Codex session, which may be before
      `projection-worktrees` lands (about 11-17 to 11-19); Stage 1 in the last week of November; landed by about
      12-03, ahead of the flip's Stage 2, with the latest safe build start about 11-25.
    - **Order with the flip:** this spec conforms to `cutover-flip`'s; any interface change returns to the flip as an
      amendment through its create-spec, and the flip's approval does not wait on this unit's.
- **Resolved at this stage** (2026-11-10):
    - the diverging-copy refusal, read from the import's own composition through a provenance field this unit adds to
      it, compared with the copy the import reads, with its remedy's direction (Owner, for the field; § The check);
    - the check refuses while a ref store is designated or built, tested by the store's namespaces and `refs/arc/tmp/`,
      or an earlier run's hold remains, with a remedy for each kind of hold (Owner; § The check);
    - the record, recompute, and last read to `spec-cutover-flip.md` § 1.3 as it now stands: each live branch's tips,
      the last read in full with the flip's branch and checkout at their recorded head plus one deletion commit, and
      the after-merge comparisons its § 10.6 takes (§ What the check records);
    - the hold written with a completion marker, and the restore refusing an incomplete hold, a merged flip, and an
      unreadable host `main` (Owner; § What the check records, § The abort's restore);
    - the personal digest's file set, so the save before the import changes no digest (§ What the check records);
    - the restore list traced against what the designation, the save, the import, and its publication write, what
      stays named with its reason, and one question left for the spec's review (§ The abort's restore);
    - the accounting case and the chain comparison run in the window too, the window stopping on any unplaced file or
      differing chain, and the deliberately-left list as the definition (§ The accounting case);
    - Stage 1 also plants an unlocked marked checkout and a diverging copy, runs case 1 before the first run's real
      import, reaches its abort through the recompute's stop, passes the check a stand-in for the flip's branch, and in
      its second run refuses the last read before a rehearsal-only repair and exercises the after-merge comparisons
      over a stand-in merge (Owner; § Stage 1);
    - where the tools live (§ Where the tools live), the success signal, and the ADR dispositions;
    - both `USER-INBOX` captures naming this unit folded (§ Dispositions).
- **Advisory review** (2026-11-10, at the Owner's request, outside the planning-review passes): one independent pass
  over this stage's folds; its ten findings are folded above, one corrected: the restore refuses after the flip's merge,
  not on any move of `main`, which would block the abort before the merge.
- **Open:** none.
- **Next:** create-spec.

## Scope

- **In:**
    - the quiesce check, a script that refuses on the conditions in § The check, records what § What the check
      records names and holds it under `refs/arc-window/`, recomputes it after the import and again, in full, as the
      last act before the flip's merge, and after the merge compares each live branch and checkout with it for the
      window's per-branch and per-checkout steps;
    - the abort's restore of what the check recorded (§ The abort's restore);
    - the worktree lock step (#19; § The worktree lock);
    - Stage 1, the window's mechanics on full copies, with its copy driver and copy safety, the accounting case, the
      chain comparison, and the store-backed paths' case 1 (§ Stage 1). Stage 1 is this unit's verification. The
      window runs the accounting case and the chain comparison over its own import too, and stops on any file the
      accounting case cannot place or any chain the comparison finds different (`spec-cutover-flip.md` § 10.4, § 11,
      § 15); Stage 2 copies through the copy driver.
- **Lands on `main` ahead of the window, inert:** nothing runs it until a rehearsal stage or the window does. It
  touches no unlanded member (§ Named assumptions).
- **Not here; `cutover-flip` keeps it:** the window's order and every step around these tools; its abort rules, the
  revert of the flip's deletion commit, and fixing forward after the merge; the state remote's designation, the save,
  and the import, which run landed commands; each checkout's steps after the import; notes retirement; Stage 2, which
  runs Stage 1's steps on the copy's pre-flip build at the flip's head; the destructive CLI matrix, the
  partial-protection start, the parser check, and the end-to-end work unit.
- **Deleted after the window** by `cutover-tracked-state-removal`, which keeps the window's leftovers.

## Carried in

Requirements set during `cutover-flip`'s planning that bind this unit's spec:

- **The check's exact refusals** (the PM's quiesce plan, 2026-11-06). The PM builds the window's cross-session quiesce
  plan from this unit's spec: the live branches with shared tracked-state changes to land or drop, an intake cutoff
  for Errands and pull requests, and draining the Codex queue. So the spec names exactly what the check refuses on,
  matching § The check, and defines a branch's own records against shared tracked state: that work item's records,
  which the import picks from that branch, against every other file under a projected root and the `.internal/`
  records, `ROADMAP.md` aside.
- **Transition invariants** (Owner-agreed, 2026-11-07). For each transition the window makes that these tools observe
  (the import to the flip's merge, the host boundary at the last read of `origin/main`'s tip, and Errand records
  crossing), the spec states what each record and checkout must preserve, where the code enforces it, and the
  regression check that proves it. Use Stage 1, and in `cutover-flip` Stage 2, as controlled perturbations, each
  asserting a refusal followed by a legitimate repair and continuation, not only the normal path: a record changed
  between the import and the merge; an Errand record arriving mid-window; reversed input order where the plan should
  not depend on it.
    - _Amended 2026-11-10_ (Owner-decided at `cutover-flip`'s create-spec): reversed input order is now `cutover-flip`'s
      import test over permuted listings (its § 7.6), since every import mints fresh UIDs and two imports never share
      tree IDs; this unit's share of order independence is the diverging-copy refusal (§ The check). A record changed
      after the merge joins the list, which this unit's after-merge comparisons observe (§ What the check records).
- **The import's fence** (A7, Owner-approved 2026-11-07). The import lands only on an empty store (`landImportRefs`
  refuses `occupied` under the store's `layout` lock), the state it prepared against, but its inputs live outside the
  store (tracked files, notes, the Errand identity refs), fenced by the quiesce, the leased Errand refs, and the
  check's recompute after the import. The recompute runs after publication, so the spec states that its stop exits
  through the abort restoring the recorded `refs/arc/*` tips (PM, 2026-11-07).
- **No path on this machine** (the Owner's host conventions, 2026-11-10). Stage 1 keeps its raw evidence uncited; the
  unit's records state each conclusion in their own text and cite a commit or a CI run ID.

## Success signal

- **Stage 1 is clean, both runs, at the head that lands** (§ Stage 1), re-run after any later change to these tools:
    - in the first run, every planted condition refused, naming its checkout, branch, work unit, or pull request, then
      passing after its remedy, the lock step's included; store-backed case 1 refusing before the real import with
      nothing landed; and the recompute's stop and the abort from it, every recorded ref back on the copy and its
      mirror, every other `refs/arc/*` and unrecorded tracking ref gone, the guard lifted, and the hold deleted;
    - in both, the import published to the copy's mirror, the sealing guard refusing in every copied checkout, the
      Errand identity refs gone from the copy and its mirror with the kept tips dropped, and the chain comparison
      giving the same chain or the same refusal for every Candidate record through both readers;
    - the accounting case reporting the twenty folders in the first run and no file unplaced in the second;
    - in the second, the aborted copy passing the check and importing again; the last read, in full, refusing on a
      moved `main` and then passing; and after the stand-in merge, the moved range of a late commit recorded under the
      hold and a late personal edit's digest reported changed, neither stopping; then notes retirement;
    - the import's time and peak memory recorded under the cap.
- **Each refusal and tool has a test** that shows the refusal, its remedy, and the run continuing: every condition
  § The check names, the record and hold with its completion marker, the recompute and the last read, the after-merge
  comparisons, the restore and each of its refusals, the lock step, and copy safety's assertions.
- **It lands inert:** on `main` ahead of the window, nothing outside a rehearsal stage or the window runs it, none of
  the scripts ships, and the one addition to shipped code changes no existing caller (§ Where the tools live).

---

## Design

### The check

Decided 2026-11-05 (Owner): check, then import at once, with the import's own comparisons as the witness, plus a guard
that seals the pre-flip builds (§ Context: the sealing guard). Before the check the window fetches every branch from
`origin`, so the check compares each checkout's branch with its upstream as `origin` holds it and the import picks
each live work unit's latest pushed copy (`spec-storage-ref-backend.md` § 10.8).

**The check,** run from the importing checkout immediately before the import, refuses with each failing checkout
named:

- the primary and every checkout whose marker names a work unit or an Errand is clean and its branch matches its
  upstream, so each in-flight implementation unit sits at a task boundary, landed or paused; ARC's machinery
  checkouts, which carry no such marker (`spec-projection-worktrees.md` § 2.5), are torn down or named;
- every linked checkout whose marker names a work unit or an Errand holds the projection's lock;
- no ended holder or work-unit husk remains to tear down;
- no decomposition cut today's machine has staged remains unlanded and uncleaned, since the store version reads no
  candidate branch or staged checkout (`spec-seam-decomposition.md` § 18, "Migration and rollout");
- every checkout's `HEAD` descends from `a61e24716a`, the sealing guard's merge on `main` (PR #1287), and its build
  carries the guard;
- no live branch, one a checkout holds or a live work unit's or Errand's, changes tracked state outside its own work
  item's records since its merge base with `main`: any file under a projected root, or any of the `.internal/`
  records, other than that work item's records, which the import picks from that branch, and `ROADMAP.md`, which is no
  record (§ The accounting case). The import reads the project's own records, the cohort records, the project inbox,
  and lineage's transition records, at `main`'s `HEAD` (`readImportSource`, `lib/store/ref/import/source.ts`), and
  another work item's records at the copy it picks for that work item (`spec-storage-ref-backend.md` § 10.8), so such
  a change would be lost at that branch's deletion commit or its merge. The remedy is to land the change on `main` and
  merge `main` into the branch, or to drop it from the branch;
- no live work unit has a copy, other than a stale one, whose commit is not an ancestor of the copy the import selects,
  a branch's local and fetched copies included (`spec-cutover-flip.md` § 13.4). The import reads each live work unit's
  selected copy through the in-repo lifecycle composition (`composedMetas`, `lib/store/in-repo/meta.ts`, through
  `resolveCallerComposedLifecycleIndex`, `lib/work-unit/composed-lifecycle-index.ts`), whose selection
  (`chooseWorkUnitCandidate`, `lib/git/in-flight-derivation.ts`) drops stale copies and orders the rest by source,
  relation, ancestry, lifecycle state, commit time, and finally branch name, so a passed-over copy that diverges loses
  its changes, and a branch's local and fetched copies that both moved, with equal state and commit time, are decided
  by listing position. The check reads every copy from the composition's provenance (`provenanceForGroup`: each copy's
  ref, source, relation, and whether it was selected), not from its warnings, since `candidate-shadowed` is withheld
  for a stale copy and for a branch's local and fetched copies (`isLocalRemoteMirror`). It takes that provenance from
  the same composition call the import makes (`composedMetas`), local acquisition and the configured base included,
  which reads every fetched branch as a copy (`resolveInFlightBranchSetFromLocalRefs`, `lib/git/remote-ref-reader.ts`),
  so the fetch before the check puts `origin`'s copies in it. The composition's result does not carry the provenance
  today (`ComposedLifecycleIndexResult`), so this unit adds each work unit's provenance to it as one read-only field
  that no existing caller reads (Owner, 2026-11-10; § Where the tools live). The check compares each copy with the one
  the composed record selects (`recordsBySlug`'s `selected`), the copy `composedMetaSource` reads, which differs from
  provenance's selected branch copy only where the importing checkout's tree holds an active or terminal meta for the
  unit (`selectRecordCandidate`, `lib/status/project-view.ts`), as `main`'s does not. The refusal names the work unit
  and both refs. The remedy is to merge the passed-over copy into the selected one and push, so the local and fetched
  copies agree, or to drop a local-only copy's commits; merging the other way leaves the refusal standing, since source
  rank decides before ancestry (`candidateSourceRank`);
- no ref store is designated or built on this machine, and no earlier run's hold remains under `refs/arc-window/`: no
  `remote.*.arc-state` is set, no `<commonDir>/arc/store` exists, no store ref exists, tested by the store's
  namespaces rather than the `refs/arc/` prefix (`isStateRef`, as `codeHoldsState` in `lib/store/ref/repository.ts`
  applies it), no ref sits under `refs/arc/tmp/`, where store operations keep their working refs and a move record,
  `storage.backing_repository` is empty, and `origin` is the code remote as `readRefDesignation`
  (`lib/store/ref/designation.ts`) resolves it. The refs today's machinery keeps under `refs/arc/` pass: delivery's
  candidate, recovery, and bootstrap refs, and each identity's Errand and sync-state refs. From that state the
  designation writes only `remote.origin.arc-state` (`setLayoutRole`, `lib/store/ref/migrate-layout.ts`): its project
  check fetches only over an existing registry ref (`checkRefDesignationProject`,
  `lib/store/ref/designation-project.ts`), and no follow can be due, since one is due only when a designated remote
  holds a moved-project tracking ref (`readRefFollowDue`, `lib/store/ref/follow-due.ts`). Outside it,
  `arc store remote` moves a layout or installs a backing remote (`applyRefRemoteSetting`,
  `lib/store/ref/remote-setting.ts`), writing configuration and a store repository the abort's restore does not cover
  (§ The abort's restore). A remaining hold means an earlier run stopped before its abort finished, or the window is
  past its merge, and recording over it would lose that run's restore point or the record the window's after-merge
  steps compare with. The remedy, for a complete hold whose flip has not merged, is the abort's restore from it; for an
  incomplete one, deleting it, since nothing ran past a record that never finished. Otherwise the Owner decides: a
  store or designation from before the window, which the restore cannot return, or a hold past the merge, where the
  window fixes forward. This state holds today;
- `main`'s `HEAD` is an ancestor of the flip's branch, so the commit deleting the tracked state the import took
  deletes exactly the files the import read, and no shared-root file `main` changed after the flip last merged it
  conflicts with that deletion or survives it in a projected root;
- no pull request into `main` is open but the flip's own, so the host merges nothing on its own while the window runs:
  the repository allows auto-merge, the grooming and planning lanes arm it (`gh pr merge --auto`, `drain-inbox.md`),
  an Errand left awaiting its merge keeps its pull request open (`arc errand leave --state awaiting-merge`,
  `run-errand.md`), and `main`'s ruleset requires only the `ci-ok` check. The remedy is to merge each ahead of the
  window or close it. The check reads the open pull requests from the host and refuses when it cannot; it takes a
  supplied listing only where `gh` finds no repository, as in the rehearsal's copies (§ Copy safety), and refuses one
  anywhere else, so the window's run cannot take one;
- no Errand's record (`kind: "errand"`, `purpose: "errand"`) remains in any `refs/arc/user/<id>/errands`, locally or
  on `origin`, whether the Errand is open, paused, or awaiting its merge; a close, an abandon, or a promotion retires
  the record (the `retire` transition, `lib/errand/identity-transitions.ts`). The import carries such a record across
  with its branch as recorded, `<type>/<slug>` (`appendTransientRecord`, `lib/store/ref/import/transient.ts`), and from
  the flip the record's branch check takes only the suffixed form (`cutover-flip`'s flip change), so every reader would
  refuse the record as malformed or drop it (`decodeBasis`, `lib/errand/store-runtime.ts`; `decodeErrand`,
  `lib/inbox/lists.ts`). The remedy is to close each Errand, landing its branch, or abandon it. The grooming claims and
  housekeep routing records the same ref holds cross the window, re-homed as claims (`transientKind`,
  `lib/store/in-repo/transient-common.ts`), and keep their own branch checks.

**The import is the witness for personal state:** it refuses a notes file whose disk copy differs from its saved copy,
an attempt in flight in the review gate, and an unmapped review source, so a write that slipped past the stop refuses
the import rather than vanishing. The hardening's trials ran this sequence in trial form, a save from every registered
checkout and then the import, clean four times.

### What the check records

Each worktree's `HEAD`, a digest of its personal files, each live branch's local and fetched tips, and `origin/main`'s
tip (`spec-cutover-flip.md` § 1.3). A live branch is one the check scans (§ The check): one a checkout holds, or a live
work unit's or Errand's, the flip's own among them. The digest covers the files under the worktree's `.arc/user/`
that the import reads as personal state (`readImportPersonalDisk`, through `importPersonalExcluded`,
`lib/store/ref/import/personal-disk.ts`), which leaves out every `.internal/` path and the generated status file, so
the save between the check and the import, which rewrites `.internal/.sync-state.json` (`writeLocalSyncState`),
changes no digest. The window computes all of these again after the import, any change
stopping it before the flip change, and again in full as the last act before the flip's merge, a change there stopping
the merge. By then the flip's own checkout has made its deletion commit, so that read compares the flip's branch and
checkout as their recorded head plus exactly one commit, which may only delete files under the tracked-state paths
(`spec-cutover-flip.md` § 3.2). It comes after the checks at the flip's merged head have finished, since `main`'s
ruleset does not require a branch to be current and a merge landing while they run would otherwise go unseen. Each
read of `origin/main`'s tip asks the host (`git ls-remote origin refs/heads/main`) rather than the fetched ref, which
moves only on a fetch, and the check refuses unless the tip it records equals the importing checkout's `HEAD`, which
the import reads (`importTrackedState`'s `codeHead`, `lib/store/ref/import/entry.ts`), so a merge landing between the
fetch and the check stops the window too. An Errand write needs no comparison of its own: the import's landing leases
each transient-identity ref on the tip it read, so one that advanced refuses the landing (`landImportRefs`,
`lib/store/ref/import/land.ts`), and from then on the sealing guard refuses the Errand writers
(`transactTransientIdentities`, `lib/errand/identity-transaction.ts`, which writes them through `writeTreeCommit`,
`lib/errand/ref-tree.ts`).

After the merge no abort remains (`spec-cutover-flip.md` § 11), so the comparisons the window's per-branch and
per-checkout steps take (its § 10.6) report rather than stop. A live branch's tips are compared with the record, and a
moved range, from the recorded tip to the current one, is recorded under the hold for the flip's re-application. A
checkout's personal digest is compared with the record, and its answer decides whether that checkout's pre-flip
personal files are removed or left for its first materialization to withhold. The hold therefore stays until the
window closes (its § 10.7).

The check also records every `refs/arc/*` tip, local and on `origin`, and holds each under `refs/arc-window/`,
fetching `origin`'s there: the abort's restore point (§ The abort's restore). It records and holds only when every
condition passes, writing a completion marker last, so a refusing run leaves no hold, a run that dies while recording
leaves one the restore refuses, and a re-run, after the remedies, records afresh. Today those refs hold the Errand
identity refs, delivery's candidate, recovery, and bootstrap refs, and the notes sync state, none a store ref
(`isStateRef`, `lib/store/ref/manifest.ts`). The hold matters after publication, when the import has deleted the
Errand identity refs on both sides and dropped the tips it kept, and a deleted ref's commits are otherwise prunable;
neither the import, which reads `refs/arc/`, nor a push reads `refs/arc-window/`. The check records the
push's tracking refs, `refs/arc-remotes/origin/*`, beside them, empty today: an accepted push writes one per published
ref outside `refs/arc/` (`acknowledgePushRefs`, `lib/store/ref/push-tracking.ts`), and the next push leases on them
(`readPushListing`, `lib/store/ref/push-listing.ts`).

### The worktree lock

Before the check, the window runs `git worktree lock --reason` with the value `PROJECTION_LOCK_REASON` holds
(`lib/git/worktree-removal.ts`), imported rather than restated, on each linked checkout whose marker names a work unit
or an Errand and that carries no lock, leaving anchored and unmarked worktrees unlocked. The projection locks each
work-item checkout ARC spawns but runs no backfill (`spec-projection-substrate.md` § 12.7), and a worktree left
unlocked at the flip is exposed to a plain `git worktree remove`, which deletes its gitignored projection without
persisting its edits (#19).

### The abort's restore

Decided 2026-11-05 (Owner); the restore point added at planning review (2026-11-06). Two of the window's steps cannot
simply be undone: the import's push publishes `refs/arc/*` to a public origin, and the flip merges to `main`. The
sealing guard adds a hazard: once `refs/arc/project/registry` exists, a pre-flip build refuses its store, notes, and
Errand writes, so a failed import with no usable store behind it would leave every checkout on the machine unable to
make them.

**An abort restores what the check recorded** (§ What the check records), locally and, once the import has published,
on `origin`: each `refs/arc/*` ref the record holds goes back to its recorded tip, and every other `refs/arc/*` ref is
deleted, as is every `refs/arc-remotes/origin/*` tracking ref the record does not hold. It also removes any separate
store directory (`<commonDir>/arc/store`) and unsets `remote.origin.arc-state`. The registry ref is gone with the
rest, which lifts the guard, while refs the import never touched, such as delivery's candidate refs and the notes sync
state, come back unchanged rather than being deleted. Stage 1 exercises it once, after publication, reached through the
recompute's stop, and imports again on the aborted copy (§ Stage 1). Once restored, the abort deletes the hold under
`refs/arc-window/`, so a re-run's check records afresh. When to abort, the revert of the flip's deletion commit, and
fixing forward after the merge are `cutover-flip`'s window rules.

**The restore refuses two holds.** One without the check's completion marker, a record that never finished, whose
remedy is deleting it, since nothing ran past it. And one whose flip has merged: once the flip's recorded head is
reachable from the host's `main`, the window fixes forward and nothing restores (`spec-cutover-flip.md` § 11). A move
of `main` before the merge, which the recompute stops on, leaves the restore free to run (its § 9.3, perturbation 2),
and so does the flip's unmerged deletion commit, which the abort reverts. Merges land only on the host, so the restore
reads the host's `main` (`git ls-remote`) and, when it cannot, refuses with a retry rather than assume no merge.

The list covers what the window's steps were traced to write after the check, from the state the check admits. The
import keeps the Errand identity tips and its publication journal under `refs/arc/tmp/` (`keepImportTransients`,
`keepImportPublication`, through `landImport`, `lib/store/ref/import/entry.ts`), lands state refs and gathering refs,
and deletes the local Errand identity refs (`landImportRefs`); its publication fetches and acknowledges tracking refs
under `refs/arc-remotes/origin/` and keeper refs under `refs/arc/tmp/seen/` (`pushRefStore`, `lib/store/ref/push.ts`;
`acknowledgePushRefs`), pushes state refs to `origin`, and deletes `origin`'s Errand identity refs (`retireOriginRefs`,
`lib/store/ref/import/transient-cleanup.ts`); the designation sets one configuration key. Each of those is a ref the
restore resets or deletes, a deleted ref it recreates from the hold, or the key it unsets. The rest of what those
steps write stays, deliberately:

- the save's write: each person's notes ref, the local sync-state record, and the baseline stamp (`writeGitNote`,
  `lib/io-context.ts`; `writeLocalSyncState`, `lib/user-sync/sync-state.ts`; `writeMaterializedBaselineStamp`,
  `lib/user-sync/materialized-baseline.ts`). They agree with each other and with disk, which is what a re-run's save
  and import need; putting back an older notes tip would leave the sync-state record naming a tip its ref no longer
  holds;
- the review gate's repository ID and the machine ID, minted if absent (`resolveRepositoryIdentity`,
  `scripts/review-gate/hosts/local/git-common-state.ts`; `getOrCreateMachineId`, `lib/store/machine-id.ts`), which the
  pre-flip build mints the same way;
- lock files and temporary directories under `<commonDir>/arc/`, left only by a killed process: an abandoned lock is
  reclaimed once its holder is provably dead (`lib/advisory-lock.ts`), and nothing reads the randomly named build and
  staging directories;
- objects the import and the push wrote, unreachable once their refs are gone.

The bodies the first trace only searched write objects alone (`commitRefTree`, `lib/store/ref/write-commits.ts`;
`replayImportVersions`), read under a lock (`captureComparisonWitness`), or write nothing (the review mapping,
`lib/store/kinds/review/mapping*.ts`). One question stays open for the spec's review: whether a store fetch starts Git's
automatic maintenance (`refFetchArgs`, `lib/store/ref/fetch-target.ts`, passes no `--no-auto-maintenance`), which could
pack refs or prune unreachable objects, though never a tip the hold keeps.

### Stage 1

Decided 2026-11-05 (Owner): two stages, each on a full copy of this machine's repository, stopping at the host
boundary. One dress rehearsal could not start until `projection-worktrees` lands and the flip change builds, which
would put every step's first run in December, with the 2027-01-08 fallback close behind. The window's mechanics need
neither, so they run first. Stage 2, the dress rehearsal at the flip's head, is `cutover-flip`'s.

- **Stage 1, the window's mechanics,** from this unit's branch before the flip change exists, once the sealing guard
  is on `main` (landed at `a61e24716a`) and the quiesce check builds. Its build is today's machinery plus the check. It
  fetches every branch from the copy's mirror and applies the check's remedy on the copy to each copied branch that
  still changes tracked state outside its own work item's records, as live branches do before the window, so the
  remedy is rehearsed too, and abandons on the copy each Errand it copied, the copy being taken while no Errand awaits
  its merge, since abandoning one that does reads its pull request from the host (`createGhChangeRequestLifecyclePort`,
  `lib/errand/abandon-runtime.ts`). No flip change exists yet, so it gives the check a stand-in for the flip's branch:
  a branch on the copy at its `main` plus one commit, whose pull request is the one the supplied listing holds as the
  flip's own. It then runs the quiesce check (§ The check). In the first run the check first refuses each condition
  planted on the copy, then passes once each takes its remedy (Owner, 2026-11-10, for the last two):
    - a tracked-state change planted on a copied branch, removed;
    - an open pull request planted in the listing the rehearsal supplies, removed;
    - an Errand opened on the copy, abandoned;
    - a marked linked checkout unlocked on the copy, locked by the worktree lock step (§ The worktree lock);
    - a diverging copy planted for a live work unit whose branch no checkout holds, since a held branch's divergence
      would also refuse as a checkout off its upstream, the branch moved both locally and on the mirror so neither is
      an ancestor of the other; the passed-over copy merged into the selected one and pushed to the mirror.

  Then a save from every copied checkout (#34) and the copy's mirror designated as its state remote. Before the first
  run's real import comes store-backed case 1 (below): a review boundary filed under another work unit's owner is
  planted, the import refuses it with nothing landed, and the plant is removed. It runs there because an import over a
  landed store only publishes, reading no source again (`inspectImportDestination`, `lib/store/ref/import/occupied.ts`;
  `importTrackedState`). Then a real import, publication to the mirror included, then:
    - the sealing guard (`refuseWriteIfStoreImported`) refusing an in-repo write in every copied checkout once the
      import has run;
    - the Errand identity refs gone from the copy and its mirror with the kept tips dropped;
    - the accounting case (§ The accounting case);
    - the chain comparison (#8; § The chain comparison);
    - the import's time and peak memory, under `memcap_gated -m 6G` with its in-process ceiling below that cap.

  The import covers the review gate's machine-local records as well as the tracked ones, since every review record
  reshapes at the flip (#23). Stage 1 runs twice. The first runs on a copy without the pre-meta backfill, reverted there
  since it has landed (`68bddbb526`), so its accounting case reports the twenty folders and shows the case catches the
  omission it exists for. It ends with an abort reached through the recompute's stop, after publication and the checks
  above and before notes retirement: a commit planted in a copied checkout moves its `HEAD`, the recompute refuses
  naming it (§ What the check records), and the abort runs from that stop, as the window's does. The abort must put
  back every recorded ref on the copy and its mirror and lift the guard (§ The abort's restore). The restore resets no
  branch, so the planted commit is then dropped from that checkout, as the window drops a change the recompute found
  (`spec-cutover-flip.md` § 9.3). The second runs on that aborted copy with the backfill restored, its check passing
  with nothing planted, so it confirms both the backfill and that an aborted repository imports again. After its
  import and recompute, the stand-in branch takes a stand-in deletion commit, which only deletes files under the
  tracked-state paths, and the last read runs in full: a commit planted on the mirror's `main` makes it refuse, and it
  passes once the mirror's `main` is put back. That repair is the rehearsal's alone; the window's, an abort, the merge
  taken into the flip's branch, and a re-run, is `cutover-flip`'s Stage 2 perturbation 2 (Owner, 2026-11-10). The
  stand-in branch is then merged into the mirror's `main`, standing in for the flip's merge, and a commit planted on a
  live branch and a personal file edited in a copied checkout make the after-merge comparisons record the branch's
  moved range under the hold and report the digest changed, neither stopping (§ What the check records); re-applying
  them is Stage 2's perturbation 6. Then it runs notes retirement (#7). An abort never follows notes retirement in the
  window, which retires notes after the merge, so the abort's record holds no notes ref.

A failure is fixed in this unit's change and Stage 1 re-run. Stage 1 keeps its raw evidence on the machine that runs
it, uncited (§ Carried in).

**The store-backed path in Stage 1.** `seam-delivery-review`'s review stopped after five complete passes without
converging, with most of pass 5's majors in code that runs only from the flip or in the import. The Owner accepted that
residual, so the rehearsal exercises those paths. Of its seven cases, Stage 1 runs case 1: the import refuses a review
boundary filed under another work unit's owner. Stage 2 runs cases 2 to 7 in `cutover-flip`.

### Where the tools live

The check, its record, recompute, and last read, the abort's restore, the worktree lock step, and Stage 1's driver are
one repository-only script family under `packages/arc-framework/src/scripts/`, run from source with `node --import tsx`
as the repository's other scripts are (the root `package.json`), and tested under `packages/arc-framework/__tests__/`.
The package publishes only its `files` list (`packages/arc-framework/package.json`), which excludes `src/`, and the
install recipe names none of it, so none of the scripts ships to a project. One addition lands in shipped code: each
work unit's provenance on the composition's result (`ComposedLifecycleIndexResult`), which only the check reads
(§ The check) and which goes with that composition when the in-repo implementation leaves (Owner, 2026-11-10; the
alternative, the script composing the lower layer itself through a shared helper, changes more shipped code and can
drift from the import's call). At the window they run from the importing checkout's
source at `main`'s pre-flip head, which is the pre-flip build the window runs on. `cutover-tracked-state-removal`
deletes them with the window's other leftovers.

### Copy safety

The hardening's trial driver copied the primary with `cp -a`, which left `origin` on the host and the copy's worktree
registrations on the live checkouts; a trial publishes nothing, so neither mattered. A real import would publish to
the host and could reach the live worktrees. Before any `arc` command in a copy, the driver rewrites every remote to a
local bare mirror and repairs each worktree registration to its copied checkout (`git worktree repair`). It then
asserts both, with `storage.backing_repository` naming no other repository and `gh` finding none in the copy. A copy
that fails any of these stops the stage.

### The chain comparison

(#8, #23.) The import replays each Candidate record's versions from the plain path log today's chain reader walks
(`readImportCandidateVersions`, `lib/store/ref/import/candidate.ts`; the reader,
`readRepositoryCandidateSupersessionChain`, `lib/store/kinds/review/candidate/history.ts`), since the in-repo `history`
follows renames and drops a version a merge commit introduced. Today's reader refuses six records:
`evidence-applicability` at a broken chain link (`resolveCandidateSupersessionAncestors`), and five that fail today's
Candidate schema before any chain walk (`readCandidateRecordVersioned`). The import carries all six unchanged
(`inspectCandidateChain`, `lib/store/ref/import/review.ts`). `storage-ref-backend`'s tests compare the two readers over
a fixture (`spec-storage-ref-backend.md` § 14.7); only the rehearsal can compare every record in this repository. It
reads every Candidate record's chain through the store's `history` and through today's reader, and requires the same
chain or the same refusal for each. It also tests a fact new at the flip: a Candidate's supersession is then its
singleton record's `history`, a live work unit's replayed versions arriving mapped, their transitions whole, and those
of a work unit no longer live, archived, abandoned, or cut, arriving as found; a work unit merged but not yet archived
is live (`spec-storage-ref-backend.md` § 10.8).

### The accounting case

The import reads the in-repo store's records (`lib/store/ref/import/`). That store discovers work items by their meta
files (`collectHeldMetaSources`, `lib/store/in-repo/meta.ts`) and companions beside a meta by the `<word>-<slug>.md`
pattern (`companionNames`, `lib/store/in-repo/paths.ts`, through `artifactMatcher`). A tracked file under a projected
root that no record claims is never imported, and no trial reports it, since an omission refuses nothing. By that code
path, three groups went unclaimed: twenty pre-meta work-unit folders under `completed/` (2025-q4 to 2026-q2),
`completed/2026-q1/completed-atomic-2026-q1.md` at a quarter folder's top level, and `completed/README.md`, an
installed file the flip deletes. Closed cohorts' folders (`<n>a_cohort-<slug>/`) are claimed: the import recovers
their archive coordinate (`cohort-source.ts`). The first two groups got metas before the rehearsal, in an Errand landed
at `68bddbb526` (PR #1286), so the rehearsal's import claims them.

The accounting case tallies every tracked file under a projected root as imported, deliberately left, or reported,
which catches this class of omission rather than these instances. Deliberately left are the installed files the flip
deletes that no record claims (`spec-cutover-flip.md` § 5.2), `backlog/ROADMAP.md` and `completed/README.md`, held as
one list in the tool, each with its reason. The list is the definition: every other unclaimed file is reported, though
the flip's deletion commit removes it too. Stage 1's first run, on a copy with the backfill reverted, shows it
reporting the twenty folders. The window runs it over its own import and stops on any file it reports
(`spec-cutover-flip.md` § 10.4, § 15).

### Context: the sealing guard

The guard closes the one silent loss. Each checkout runs its own build, so a checkout that has not merged the flip
would keep writing tracked state and Git notes after the import. Its personal writes would vanish, since the import
retires notes. The guard landed on `main` as an Errand, at `a61e24716a` (PR #1287): once `refs/arc/project/registry`
exists, the in-repo implementation, every notes writer, and the Errand identity transaction and its push reconcile
refuse their writes with a recoverable store-imported refusal naming the remedy, merge base and rebuild, while reads
stay open (`refuseWriteIfStoreImported`, `lib/store/store-imported.ts`). No such ref exists before the import, and every
worktree on a machine shares one ref namespace, so the guard fires in every checkout the moment the primary imports.
Writers that bypass the store do not consult it, lifecycle's transition records (`writeTransitionRecord`, through
`terminalTransitionWriter` in `handlers/lifecycle.ts`) and the decomposition operation's writes among them, so the
quiesce, which stops every session first, is what covers those. A clone on another machine sees the ref only through
ARC's state fetch, so other machines stay a residual the window's own steps cover (#7). The guard goes with the in-repo
implementation after the flip.

---

## ADR dispositions

- **Covered by ADR-035** (Accepted): the window these tools serve, "a quiesce → import → flip window, rehearsed first",
  at "a single cutover per repository".
- **`none`, temporary:** one-time window machinery, deleted after the window by `cutover-tracked-state-removal`, or
  with the in-repo composition for the provenance field. The check and each refusal it makes, its record and the hold
  under `refs/arc-window/` with its completion marker, the recompute and the last read, the after-merge comparisons,
  the abort's restore and its refusals, the worktree lock step, where the tools live and the provenance field, Stage 1
  with its planted conditions and stand-ins, the copy driver and copy safety, the accounting case, and the chain
  comparison.
- **`none`, not this unit's decision:** the check's refusal of an unlanded staged cut follows
  `spec-seam-decomposition.md` § 18, and its refusal of a diverging copy follows `spec-cutover-flip.md` § 13.4.

---

## Named assumptions

- `projection-worktrees` § 2.5 (unlanded; its amended specification is on its branch): ARC's machinery checkouts carry
  no work-unit or Errand marker, so the check names them or requires them torn down rather than reading them as live
  work. Re-check when that member lands.
- Everything else these tools read has landed: the checkout markers, the substrate's `PROJECTION_LOCK_REASON`
  (`spec-projection-substrate.md` § 12.7), the ref backend's import and its hardening, the sealing guard (#1287), and
  the pre-meta backfill (#1286).
- `cutover-flip`'s Stage 2 re-runs Stage 1's steps at the flip's head after every landing, `projection-worktrees` and
  `projection-team-scale` among them, so a change in what the check reads surfaces there before the window.
- `spec-cutover-flip.md` (in create-spec and changing, read 2026-11-10 as staged in its checkout at 1,816 lines, not
  yet approved): these tools conform to its § 1.3 contract, its § 10.6 and § 10.7 after-merge steps, and the § 13
  transition invariants that name them, its session confirming no conflict with this draft's folds (2026-11-10). Any
  interface change this unit needs returns to the flip as an amendment through its create-spec, and its session
  messages this unit when § 1.3, § 9.1, § 10.6, or § 10.7 change. Re-check against the approved spec at this unit's
  create-spec entry.

---

## Dispositions

The Owner's planning pass (2026-11-10) over the `USER-INBOX` captures naming this unit, both captured at
`cutover-flip`'s create-spec (Owner-decided).

| Entry                                                                                                           | Outcome | Fold location                                                                                                     | Reason |
| --------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| Refuse at the quiesce a live work unit with a copy that diverges from the one the import reads                  | fold    | § The check, the diverging-copy refusal; § Stage 1, its plant; § Carried in, the transition invariants' amendment | —      |
| Record live branch tips at the check, and recompute everything recorded as the last act before the flip's merge | fold    | § What the check records; § The abort's restore; § Stage 1, the second run; § Success signal                      | —      |

---
