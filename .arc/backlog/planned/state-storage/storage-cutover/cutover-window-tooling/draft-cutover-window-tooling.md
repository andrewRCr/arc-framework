# Draft: cutover-window-tooling

- **Origin:** split from `cutover-flip` at its create-spec entry (Owner, 2026-11-10), on the PM's read that the split
  is neutral on dates. That work unit crossed this project's size marks, with a spec forecast of about 1,700 to 2,200
  lines and a change set of about 10,000 to 20,000, and of its parts only the window's pre-flip machinery can sit inert
  on `main` before the window while the window keeps exactly one merge. The split also settles where the quiesce check
  lives: the window runs it on `main`'s pre-flip build (Owner, 2026-11-06), so it must be on `main` before the window.
  This reverses the 2026-11-05 placement of the check in the flip's own change. The design below is
  `draft-cutover-flip.md`'s text as written, its section references re-pointed and the corrections § Carried in names
  applied.
- **Purpose:** Build and rehearse the machinery the cutover window runs on `main`'s pre-flip build before the flip
  merges: the quiesce check with its record and hold, the abort's restore, the worktree lock step, and Stage 1's copy
  driver, accounting case, and chain comparison.

---

## Scope

- **In:**
    - the quiesce check, a script that refuses on the conditions in § The check, records what § What the check
      records names and holds it under `refs/arc-window/`, recomputes it after the import, and reads `origin/main`'s
      tip once more as the last act before the flip's merge;
    - the abort's restore of what the check recorded (§ The abort's restore);
    - the worktree lock step (#19; § The worktree lock);
    - Stage 1, the window's mechanics on full copies, with its copy driver and copy safety, the accounting case, the
      chain comparison, and the store-backed paths' case 1 (§ Stage 1). Stage 1 is this unit's verification.
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
- **The import's fence** (A7, Owner-approved 2026-11-07). The import lands only on an empty store (`landImportRefs`
  refuses `occupied` under the store's `layout` lock), the state it prepared against, but its inputs live outside the
  store (tracked files, notes, the Errand identity refs), fenced by the quiesce, the leased Errand refs, and the
  check's recompute after the import. The recompute runs after publication, so the spec states that its stop exits
  through the abort restoring the recorded `refs/arc/*` tips (PM, 2026-11-07).
- **No path on this machine** (the Owner's host conventions, 2026-11-10). Stage 1 keeps its raw evidence uncited; the
  unit's records state each conclusion in their own text and cite a commit or a CI run ID.

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

Each worktree's `HEAD`, a digest of its personal files, and `origin/main`'s tip, which the window computes again after
the import, any change stopping it before the flip change, and `origin/main`'s tip alone once more before the flip's
merge, a change there stopping the merge, since by then the flip's own checkout has made its deletion commit; that read
comes after the checks at the flip's merged head have finished, as the last act before the merge, since `main`'s
ruleset does not require a branch to be current and a merge landing while they run would otherwise go unseen. Each
read of that tip asks the host (`git ls-remote origin refs/heads/main`) rather than the fetched ref, which moves only
on a fetch, and the check refuses unless the tip it records equals the importing checkout's `HEAD`, which the import
reads (`importTrackedState`'s `codeHead`, `lib/store/ref/import/entry.ts`), so a merge landing between the fetch and
the check stops the window too. An Errand write needs no comparison of its own: the import's landing leases each
transient-identity ref on the tip it read, so one that advanced refuses the landing (`landImportRefs`,
`lib/store/ref/import/land.ts`), and from then on the sealing guard refuses the Errand writers
(`transactTransientIdentities`, `lib/errand/identity-transaction.ts`, which writes them through `writeTreeCommit`,
`lib/errand/ref-tree.ts`).

The check also records every `refs/arc/*` tip, local and on `origin`, and holds each under `refs/arc-window/`,
fetching `origin`'s there: the abort's restore point (§ The abort's restore). Today those refs hold the Errand identity
refs, delivery's candidate, recovery, and bootstrap refs, and the notes sync state, none a store ref (`isStateRef`,
`lib/store/ref/manifest.ts`). The hold matters after publication, when the import has deleted the Errand identity refs
on both sides and dropped the tips it kept, and a deleted ref's commits are otherwise prunable; neither the import,
which reads `refs/arc/`, nor a push reads `refs/arc-window/`. The check records the push's tracking refs,
`refs/arc-remotes/origin/*`, beside them, empty today: an accepted push writes one per published ref outside
`refs/arc/` (`acknowledgePushRefs`, `lib/store/ref/push-tracking.ts`), and the next push leases on them
(`readPushListing`, `lib/store/ref/push-listing.ts`).

### The worktree lock

Before the check, the window runs `git worktree lock --reason` with the value `PROJECTION_LOCK_REASON` holds
(`lib/git/worktree-removal.ts`), read from the built constant, on each linked checkout whose marker names a work unit
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
state, come back unchanged rather than being deleted. Stage 1 exercises it once, after publication, and imports again
on the aborted copy (§ Stage 1). Once restored, the abort deletes the hold under `refs/arc-window/`, so a re-run's
check records afresh. When to abort, the revert of the flip's deletion commit, and fixing forward after the merge are
`cutover-flip`'s window rules.

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
  `lib/errand/abandon-runtime.ts`). It then runs the quiesce check (§ The check), first refusing such a change planted
  on a copied branch, an open pull request planted in the listing the rehearsal supplies, and an Errand opened on the
  copy, then passing once the planted change and pull request are removed and that Errand is abandoned, a save from
  every copied checkout (#34), the copy's mirror designated as its state remote, and a real import, publication to that
  mirror included, then:
    - the sealing guard (`refuseWriteIfStoreImported`) refusing an in-repo write in every copied checkout once the
      import has run;
    - the Errand identity refs gone from the copy and its mirror with the kept tips dropped;
    - the accounting case (§ The accounting case);
    - the chain comparison (#8; § The chain comparison);
    - case 1 of the store-backed paths below;
    - the import's time and peak memory, under `memcap_gated -m 6G` with its in-process ceiling below that cap.

  The import covers the review gate's machine-local records as well as the tracked ones, since every review record
  reshapes at the flip (#23). Stage 1 runs twice. The first runs on a copy without the pre-meta backfill, reverted there
  since it has landed (`68bddbb526`), so its accounting case reports the twenty folders and shows the case catches the
  omission it exists for, and it ends with an abort, after publication and the checks above and before notes
  retirement; the abort must put back every recorded ref on the copy and its mirror and lift the guard (§ The abort's
  restore). The second runs on that aborted copy with the backfill restored, so it confirms both the backfill and that
  an aborted repository imports again, and after its import it runs notes retirement (#7). An abort never follows notes
  retirement in the window, which retires notes after the merge, so the abort's record holds no notes ref.

A failure is fixed in this unit's change and Stage 1 re-run. Stage 1 keeps its raw evidence on the machine that runs
it, uncited (§ Carried in).

**The store-backed path in Stage 1.** `seam-delivery-review`'s review stopped after five complete passes without
converging, with most of pass 5's majors in code that runs only from the flip or in the import. The Owner accepted that
residual, so the rehearsal exercises those paths. Of its seven cases, Stage 1 runs case 1: the import refuses a review
boundary filed under another work unit's owner. Stage 2 runs cases 2 to 7 in `cutover-flip`.

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
which catches this class of omission rather than these instances. Stage 1's first run, on a copy with the backfill
reverted, shows it reporting the twenty folders.

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

## Named assumptions

- `projection-worktrees` § 2.5 (unlanded; its amended specification is on its branch): ARC's machinery checkouts carry
  no work-unit or Errand marker, so the check names them or requires them torn down rather than reading them as live
  work. Re-check when that member lands.
- Everything else these tools read has landed: the checkout markers, the substrate's `PROJECTION_LOCK_REASON`
  (`spec-projection-substrate.md` § 12.7), the ref backend's import and its hardening, the sealing guard (#1287), and
  the pre-meta backfill (#1286).
- `cutover-flip`'s Stage 2 re-runs Stage 1's steps at the flip's head after every landing, `projection-worktrees` and
  `projection-team-scale` among them, so a change in what the check reads surfaces there before the window.

---
