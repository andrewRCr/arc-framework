# Spec (`detailed` · `RFC`): cutover-window-tooling

- **Origin:** [internal] — the cutover window's pre-flip machinery, separated from `cutover-flip` so it can land on
  `main` ahead of the window.

- **Purpose:** Build and rehearse the tools the cutover window runs on `main`'s pre-flip build: the quiesce check with
  its record and hold, the recompute, last read, after-merge comparisons, and close, the abort's restore, the worktree
  lock step, the seal on `arc user load`, and Stage 1 with its copy driver, accounting case, and chain comparison. They
  land on `main` inert, so the window can stop before the merge on anything that would let state cross it unseen, and
  can restore what it recorded.

---

## Introduction / Context

### The window these tools serve

This repository keeps its operational and planning state in tracked files under `.arc/active/`, `.arc/backlog/`, and
`.arc/completed/`, in Candidate, integration-boundary, and transition records under `.arc/system/.internal/`, in each
person's Git notes, and in the Errand identity refs under `refs/arc/user/<id>/errands`. ADR-035 moves all of it into the
ref store under `refs/arc/*` once per repository, in a quiesce, import, and flip window rehearsed first.

The window stops every session on the importing machine, designates `origin` as the state remote
(`arc store remote origin push`), saves every checkout's personal files to notes (`arc user save`), imports with
`arc store migrate --import` from `main`'s pre-flip build and publishes the store to `origin`, merges the flip — the
change that makes the ref store every command's default and deletes the tracked state — and then takes each live branch
and checkout onto the projection. Two of those steps cannot simply be undone: the publication to `origin`, a public
repository, and the merge to `main`. Everything before the merge must be able to abort to a recorded state; everything
after it fixes forward.

The import's inputs live outside the store: the shared records at `main`'s `HEAD`; each live work unit's records, read
from the importing checkout's working tree or from a live branch's local or fetched copy; each checkout's personal files
and the notes saved from them; the review gate's records under `<commonDir>/arc/review-gate/`; and the Errand identity
refs. The import lands only on an empty store (`landImportRefs`, `lib/store/ref/import/land.ts`, refuses `occupied` under
the store's `layout` lock), but nothing in it fences those inputs. The window fences them with the quiesce, the
import's lease on each transient-identity ref, and two witnesses: the import's own refusals, which compare the saved
notes with their disk copies (§ 2.3), and the recompute this unit builds, which compares every other input with the
check's record (§ 5.1).

### The sealing guard

Once `refs/arc/project/registry` exists, the sealing guard (`refuseWriteIfStoreImported`, `lib/store/store-imported.ts`,
on `main` since `a61e24716a`) refuses every pre-flip in-repo, notes, and Errand-identity write with a recoverable
store-imported refusal, while reads stay open. Every worktree on a machine shares one ref namespace, so the guard fires
in every checkout the moment the import lands. Writers that bypass the store do not consult it — lifecycle's transition
records (`writeTransitionRecord`, through `terminalTransitionWriter` in `handlers/lifecycle.ts`) and the old
decomposition operation's writes — so the quiesce, which stops every session first, covers those. One notes command
that writes the disk is not sealed today: `arc user load` (`runUserLoad`, `commands/user/save-load.ts`), which § 7 seals.

### What this unit delivers

A repository-only script family and its tests, one optional field on an in-repo composition result, and one guard call
in `runUserLoad`. Nothing runs the scripts outside a rehearsal stage or the window. They run on `main`'s pre-flip build,
so they land before the window. The window's order, the steps around these tools, and the second rehearsal stage are
the flip's.

## Goals

1. **Exact refusals before the import.** The quiesce check refuses on each condition in § 2.2 and on no other, naming
   the checkout, branch, work unit, Errand, or pull request concerned with its remedy, so a quiesce plan can be built
   from the list.
2. **A restore point the abort can trust.** Every ref the window writes before the merge under `refs/arc/` and
   `refs/arc-remotes/`, locally and on `origin`, is recorded and held so the abort returns it, and nothing the restore
   needs can be pruned while the hold stands. What else the window writes the restore removes or keeps deliberately
   (§ 6.4), and it changes no ref another writer moved, on `origin` or locally, without the Owner accepting that ref's
   value, apart from the local store refs, the store's working refs under `refs/arc/tmp/`, and the
   `refs/arc-remotes/origin/*` tracking refs, which the window itself writes (§ 6.1). Once the import has landed, an
   Errand identity ref, which the import consumes, counts as moved when what the import consumed of it differs from its
   held tip, judged by record once the import's kept tips are dropped; before a landing, its own value counts (§ 3).
3. **No silent change between the record and the merge.** A change to any import input the check recorded, or to a
   recorded branch tip locally or on the host, stops the window before the merge. After the merge, every live branch is
   compared before its step, and each difference is reported and held until its re-application is confirmed.
4. **A rehearsal that cannot reach the live repository.** Stage 1 runs the window's mechanics on full copies, each
   refusal shown with its repair and continuation, writing nothing to the host or a live checkout.
5. **Inert until run.** Nothing outside a rehearsal stage or the window runs the scripts, none of them ships to a
   project, and the two changes to shipped code alter no behavior before the registry ref exists.

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **The window's other steps.** Stopping sessions, the fetch before the check, the save, the designation, the import
  and its publication, the flip's deletion commit and merge, each branch's and checkout's steps after the merge, the
  revert of the deletion commit on an abort, fixing forward after the merge, and notes retirement run landed commands
  or the flip's change. These tools record what those steps need, stop or report on what they find, and restore.
- **When to abort, and the window's order.** These tools stop, refuse, and restore; the window decides which step runs
  next.
- **The second rehearsal stage.** The dress rehearsal at the flip's head, its perturbations, the destructive CLI matrix,
  the partial-protection start, the parser check, and the end-to-end work unit. It runs this unit's Stage 1 steps
  through this unit's driver (§ 9.2).
- **Notes retirement in Stage 1.** The window retires notes on the flip build after the merge, so its rehearsal belongs
  to the stage that runs that build.
- **Sealing what the guard does not seal.** A writer that bypasses the store, run in a session the quiesce failed to
  stop, is caught only when it changes something the recompute compares (§ 5.1).
- **Other machines.** The tools see only the importing machine; another clone's removal before the window rests on the
  Owner's confirmation.
- **Withheld projection files.** Whether a checkout reports a withheld file after its first materialization is read by
  the flip build, not by the close (§ 5.4).
- **Shipping or reuse.** None of the scripts reaches a project, and none is written for another repository.

## Proposed Design

### 1. Shape and placement

#### 1.1 Terms

- **Importing checkout:** the primary checkout, on `main`, from which the window runs the check, the designation, the
  save, and the import.
- **Tracked-state paths:** `.arc/active/`, `.arc/backlog/`, `.arc/completed/`, `.arc/system/.internal/candidates/`, and
  `.arc/system/.internal/transitions/`. The first three are the projected roots; the two folders hold every Candidate,
  integration-boundary, and transition record (`internalReferences`, `lib/store/in-repo/paths.ts`). They are the paths
  the flip build refuses to open a ref store over.
- **Marked checkout:** a linked checkout whose marker's ownership decodes as `current`
  (`decodeWorktreeMarkerOwnership`, `lib/git/worktree-marker.ts`), names a work unit, whose marker carries no
  provisioning, or a transient claim — an Errand, a grooming set, or a housekeep sweep — whose provisioning is `ready`,
  and carries no husk stamp. These are the
  checkouts the projection gives a projection after the flip (§ 1.5). An Errand-marked checkout always refuses at the
  window: C12 while its Errand's record remains, and C4 once it has retired.
- **Live work unit:** a work unit in the in-repo lifecycle composition whose selected record is not archived,
  abandoned, or cut. A unit merged but not yet archived is live.
- **Live branch:** a branch a registered checkout holds, a branch carrying a copy of a live work unit's meta in the
  composition's provenance (§ 1.3), or an open, paused, or awaiting-merge Errand's branch. The flip's branch is one.
- **The read map:** the revision at which the import reads each record under the tracked-state paths
  (`readImportSource`, `lib/store/ref/import/source.ts`):
    - a live work unit's records — its meta; its draft, spec, task list, and notes, each its own kind at the path the
      in-repo store gives it (`recordPath`, `lib/store/in-repo/paths.ts`); the other companions the store finds beside
      the meta (`companionNames`); and its Candidate and integration-boundary records
      (`.arc/system/.internal/candidates/<slug>.json` and `<slug>.boundary.json`) — at the unit's read copy. That is the
      copy the composition selects for it (`composedMetaSource`, `lib/store/in-repo/meta.ts`), a branch's or the
      importing checkout's working tree, which C1 and C13 hold equal to `main`'s `HEAD`; or, for a parked unit, the
      branch tip its pointer names (`readImportParkedSources`, `lib/store/ref/import/parked-source.ts`). A stale copy,
      whose meta names another branch (`readMetaCandidate`, `lib/git/in-flight-derivation.ts`), is never a read copy
      (`chooseWorkUnitCandidate`);
    - a parked unit's pointer, the planned meta that `arc park` writes on `main` for an active unit (`parkActive`,
      `lib/work-unit/verbs/park-resume.ts`), at `main`'s `HEAD`, for the pause's Reason and first parking time
      (`pausedMeta`, `firstPointerTime`);
    - every other record — cohort records, the project inbox, transition records, and every record of a unit no longer
      live — at `main`'s `HEAD`.

  A file's read revision is the one the map gives the record its path names, and `main`'s `HEAD` for a file whose path
  names no record. So a live unit's file at `main`'s `HEAD` whose read copy is a branch's, a parked unit's other files
  there included, has that copy as its read revision, and a branch's file of a record the import reads elsewhere has
  that other revision.
- **The read rule:** at `main`'s `HEAD` and at each live branch's local and fetched tips, every path under the
  tracked-state paths that is present there, or at a merge base the rule compares it with, passes when its content
  there, absence included, equals its content at one of:
    - its read revision, since the import reads the same content;
    - the merge base of that revision and its read revision, since the revision holds what it inherited from the read
      copy;
    - at a branch tip, the tip's merge base with `main`'s `HEAD`, since the branch holds what it inherited from `main`,
      and the rule at `main`'s `HEAD` answers for `main`'s own change.

  `.arc/backlog/ROADMAP.md`, a rendered view and no record, is exempt. A parked unit's pointer path passes at a branch
  tip where it is absent both there and at the tip's merge base with the branch the pointer names, so that the absence
  came from that branch: the branch moved the unit's planned meta into `.arc/active/` when the unit graduated, and the
  import reads the pointer only at `main`'s `HEAD`. A path that fails, a deletion included, holds a change the import
  would lose. C7 applies the rule before the import, and `account` after it (§ 10.2).
- **The flip's branch and pull request:** named to the check, last read, close, and restore by the window. Stage 1
  supplies a stand-in (§ 9.2).
- **The host:** `origin`'s hosting service. Its refs are read with `git ls-remote origin`, never from a fetched ref, and
  its pull requests with `gh`. A repository whose every remote URL and push URL is a local path has no host, as a
  rehearsal copy does (§ 9.1). Only there do the tools take supplied host facts: the check takes a supplied anchor
  (C6), and every tool that reads pull requests — the check (C11), `last-read`, and `restore` — takes a supplied
  pull-request listing, which carries the flip's pull request and whether its auto-merge is armed. A tool given a
  supplied host fact where the repository has a host refuses before any host read, and anywhere else a failed read of
  the host refuses.
- **The merged-flip test:** the flip's recorded head is reachable from `main`'s tip on the host. The tip is read with
  `git ls-remote` and fetched when its commit is not local, since a merge lands on the host and is absent from a clone
  until fetched; the test refuses when the tip still cannot be resolved. Only exit status 1 from
  `git merge-base --is-ancestor` answers "not merged", and any other failure refuses, as the composition's `isAncestor`
  (`lib/git/in-flight-derivation.ts`) does only with its strict flag; without it, every failure reads as "not an
  ancestor". Reachability shows the merge only where the host merges by merge commit alone, since a squash or rebase
  merge never makes the recorded head reachable. So where the repository has a host, the test first reads the host's
  merge settings (`gh api repos/<owner>/<repo>`) and refuses unless squash and rebase merging are both disabled. With no
  host it reads none, and the rehearsal's stand-in merge is a merge commit (§ 9.4). `close` and `restore` both decide
  the merge by this test.

#### 1.2 Operations

| Operation   | When the window runs it                                                                       | Writes                                                          | On a failed condition                     |
| ----------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------- |
| `lock`      | Before the fetch and the check                                                                | A Git worktree lock on each unlocked marked checkout            | Reports; refuses nothing                  |
| `check`     | After the fetch, immediately before the save and designation                                  | The record and hold (§ 4), only when every condition passes     | Refuses and leaves no hold                |
| `recompute` | After the import, its accounting case, and its chain comparison                               | Nothing                                                         | Stops; the window aborts                  |
| `last-read` | After the flip's deletion commit and the checks at its merged head, as the last pre-merge act | Nothing                                                         | Stops; the window aborts                  |
| `compare`   | After the merge, for each live branch and then each checkout, before that one's own steps     | A mark per branch side under the hold                           | Reports; continues                        |
| `confirm`   | After a range's changes are re-applied                                                        | A confirmation under the hold                                   | Refuses an unknown or changed range       |
| `close`     | When the window closes                                                                        | Deletes the hold                                                | Refuses                                   |
| `restore`   | On an abort before the merge                                                                  | Refs locally and on `origin`, store directories, one config key | Refuses (§ 6.3)                           |
| `account`   | After the import                                                                              | Nothing                                                         | Reports; the window stops on any finding  |
| `chain`     | After the import                                                                              | Nothing                                                         | Reports; the window stops on any finding  |
| `copy`      | Before each rehearsal stage                                                                   | A copy and its mirror outside every live checkout               | Stops on any failed copy-safety assertion |
| `rehearse`  | Stage 1, and Stage 1's steps in Stage 2                                                       | The copy and its mirror only                                    | Stops at the first unexpected outcome     |

Each operation prints a report and, with `--json`, one typed result that lists every failing subject, not only the
first. A refusal or stop exits non-zero, and so does `account` or `chain` with a finding. Flag spelling and the result
schemas' exact field names are implementation detail.

#### 1.3 The composition's provenance

The check reads every copy of every live work unit from the in-repo lifecycle composition's provenance. The composition
already computes it: `provenanceForGroup` (`lib/git/in-flight-derivation.ts`) records each copy's branch, ref, source,
relation, and whether it was selected, on each in-flight entry. `ComposedLifecycleIndexResult`
(`lib/work-unit/composed-lifecycle-index.ts`) does not carry it today. This unit adds one optional, read-only field to
that result, keyed by slug, holding each unit's provenance as the in-flight entry carries it. No existing caller reads
the field, and because it is optional no existing constructor or test fixture changes. The field holds `Map`-keyed data
like its siblings, so no output that serializes the result changes. The check takes the field from the same call the
import makes (`composedMetas`, `lib/store/in-repo/meta.ts`), built over the same ports the import's source binding
builds (`runStoreMigrate`, `lib/store/create.ts`), so local acquisition and the configured base match the import's.

#### 1.4 Where the tools live

The scripts are one repository-only family in their own folder, `packages/arc-framework/src/scripts/cutover-window/`,
run from source with `node --import tsx` as the repository's other scripts are (the root `package.json`), and tested
under `packages/arc-framework/__tests__/`. The folder is the family's own because `src/scripts/` already holds code the
CLI bundles: the import reaches `src/scripts/review-gate/` (`lib/store/ref/import/entry.ts`). None of them ships:

- The package publishes only its `files` list (`packages/arc-framework/package.json`), which excludes `src/`.
- The built CLI bundles only what `src/cli.ts` reaches (`tsup.config.ts`'s single entry). Nothing it reaches imports the
  family, and the bundle's metafile names no input from `src/scripts/cutover-window/`.
- The install recipe (`init-recipe.json`) names none of them.

At the window they run from the importing checkout's source at `main`'s pre-flip head. After the merge, `compare`,
`confirm`, and `close` read only Git and disk, so they run from either build.

#### 1.5 Prerequisites and their contracts

Everything these tools read has landed, with one exception: the checkout markers, the projection's lock reason
(`PROJECTION_LOCK_REASON`), the ref backend's import and its hardening, the sealing guard (`a61e24716a`), and the
pre-meta backfill (`68bddbb526`).

- **`projection-worktrees`**, not yet landed, is relied on for one contract: the checkouts the projection gives a
  projection after the flip are exactly the primary and the marked checkouts (§ 1.1). Every other checkout runs with
  the projection off, ARC's machinery checkouts among them, since none carries a work-unit or transient-claim marker.
  C2's machinery list rests on that contract. It is re-checked when that unit lands, and any difference amends this
  specification forward.
- **The flip's specification** (`spec-cutover-flip.md`) consumes these tools as the operations of § 1.2. Any interface
  change this unit needs returns to the flip as an amendment through its own specification.
- **The second rehearsal stage** re-runs Stage 1's steps at the flip's head after each later landing, so a change in
  what the check reads surfaces there before the window.

### 2. The quiesce check

#### 2.1 When and how it runs

The window runs `lock`, then fetches every branch from `origin`, then runs `check` from the importing checkout. Its
input is the flip's branch and pull request; in a rehearsal copy, it also takes a supplied pull-request listing
(§ 2.2, C11). The check evaluates C9 first and, if C9 fails, refuses without writing anything. Otherwise it fetches
`origin`'s `refs/arc/*` under `refs/arc-window/` (§ 4.3), evaluates every other condition, and reports all of them. On
any failure it deletes everything it wrote under `refs/arc-window/` and exits refusing. When every condition passes it
writes the record and the completion marker last. A run that dies part-way leaves an incomplete hold, which C9 and
the restore both refuse.

#### 2.2 Refusals

Each refusal names its subject and gives a remedy. The window applies the remedy and runs the check again.

- **C1 — A checkout dirty, off its upstream, or holding a personal link, or tracked state stashed.** The primary and
  every marked checkout must have an empty `git status --porcelain`, untracked files included, and a branch whose local
  tip equals its upstream's fetched tip. `git status --porcelain --ignored` must also list nothing under the
  tracked-state paths, since the in-repo store's discovery reads ignored files there too: a gitignored `temp-<slug>.md`
  beside a meta (`.arc/**/temp-*`) is that unit's companion (`companionNames`, `lib/store/in-repo/paths.ts`). And its
  personal files must include no link: the import follows a link's target, nested links included, wherever the notes the
  save writes after the check hold a path through it (§ 4.2), which no digest taken at the check can cover. No stash
  entry (`refs/stash`, which every checkout of the repository shares) may change a file under the tracked-state paths,
  in its index, working-tree, or untracked part: the import reads no stash, so such an edit never crosses, and applied
  after the flip it writes pre-flip content at projected paths. The refusal names the checkout, its branch, and whether
  it is dirty, ahead, behind, detached, without an upstream, or holding a link, and each such stash entry by position
  and message. Remedy: commit and push, or drop the changes, move an ignored file out of those paths, replace a personal
  link with the files it points to or remove it, set an upstream where none exists, and apply a stash entry, commit its
  changes on its branch, and drop it, or only drop it. This puts every in-flight implementation unit at a task boundary,
  landed or paused.
- **C2 — An unmarked linked checkout.** Every registered linked checkout must be a marked checkout. That excludes ARC's
  machinery checkouts, which carry no work-unit or Errand marker: the review gate's materializations, base sync's
  temporary checkout, the delivery-refresh and review-fix worktrees, the test-cost benchmark's checkout, and a
  decomposition worktree, whose marker names a branch. It also excludes a hand-made worktree, a checkout with no
  marker, a marker whose ownership is `manual-only` or whose provisioning is `pending` (a partial Errand among them), and
  a registration whose folder is missing. The refusal names the checkout and its kind. Remedies:
    - copy out anything wanted, then remove the worktree (`git worktree remove`);
    - where the checkout holds a branch, make it clean, apply any C7 remedy the same run names for that branch, push it,
      and then remove the worktree. The branch survives. If it carries a live work unit's meta in provenance, it stays
      live, and the window's branch step treats it as a branch no checkout holds. Otherwise it is no longer live and C7
      no longer reads it, which is why C7's remedy comes first;
    - for a missing folder, unlock the registration if it is locked (`git worktree unlock`), since `git worktree prune`
      skips locked entries, then prune it.

  A husk-stamped marker refuses under C4 instead.
- **C3 — An unlocked marked checkout.** Every marked linked checkout must carry a Git worktree lock
  (`git worktree list --porcelain`). Remedy: run `lock` (§ 8).
- **C4 — An ended holder, husk, or unresolved checkout.** Each registered checkout must be one the locus roster derives
  as neither `retired` nor `unresolved-checkout` (`DerivedCheckoutRow`, `lib/locus/derived-roster.ts`), with a marker
  that carries no husk stamp (`decodeWorktreeHuskStamp`, `lib/git/worktree-marker.ts`). An Errand marker must name an
  identity that some record holds. The refusal names the checkout and its holder. Remedy: `arc teardown` for an ended or
  husked work unit's checkout, `arc errand close`, `abandon`, or `leave` for an Errand's, or `arc locus release`; for an
  unresolved row, the remedy its diagnostic names.
- **C5 — A staged decomposition cut.** No local or fetched branch may sit in the decomposition-candidate namespace
  (`isDecomposeCandidateBranch`, `lib/work-unit/decompose-candidate.ts`) with a tip `main` does not contain, and no
  entry may remain under `<commonDir>/arc/decompose-worktrees/`. The store version reads no candidate branch or staged
  checkout, so an unlanded cut would be lost. Remedy: land the cut, or delete its branch and worktree.
- **C6 — A checkout without the seals.** Every registered checkout's `HEAD` must descend from the anchor: the commit
  that merged this unit into `main`, which carries both the sealing guard and its seal on `arc user load` (§ 7). A
  checkout that merged `main` after the sealing guard's own merge (`a61e24716a`) but before this unit landed would
  otherwise pass while its build's `load` stays unguarded. The check derives the anchor from `main`'s first-parent
  history, as the commit that added the check's own source file. It accepts a supplied anchor only where the repository
  has no host (§ 1.1), as in a rehearsal copy that predates this unit's landing (§ 9.2), and refuses one anywhere else,
  so the window's run cannot take one. Each checkout's built CLI must also be fresh against its source as the
  self-hosting freshness check reads it (`checkDevBuildStaleness`, `lib/dev-check.ts`), or absent. A checkout with no
  built CLI runs no ARC command through its launcher, which only imports the built bundle
  (`packages/arc-framework/bin/arc.js`), but its Git hooks fall back to `arc` on `PATH` when the checkout has no
  `node_modules/.bin/arc` (`.arc/system/.internal/githooks/pre-commit`). The check therefore also refuses while an `arc`
  outside every registered checkout resolves on `PATH`. Remedies: merge `main` into the branch, then
  `npm run build:fast` in that checkout; for an `arc` on `PATH`, uninstall it or take it off `PATH` for the window.
- **C7 — Tracked state the import would not read.** At `main`'s `HEAD` and at each live branch's local and fetched tips,
  the flip's included, every path the read rule (§ 1.1) covers must pass it. A path that fails holds a change the
  import would lose:
    - a branch's change to a shared record, a deletion included, which the import reads at `main`'s `HEAD`;
    - a branch's change to a unit's records the import reads from another copy, a stale copy's among them;
    - a change `main` made after the fork to a live unit's file whose read copy is a branch's, such as an edit to a
      backlog draft the unit's planning branch has retired. A parked unit's pointer is read at `main`'s `HEAD`, so
      `arc park` writing it there after the fork passes, as does the path's absence on the branch the pointer names and
      on a branch that inherited that absence from it, and `arc resume` deleting it there passes too, since the read
      copy lacks that path.

  A branch that only inherited a change from `main` passes; the rule at `main`'s `HEAD` answers for that change.

  The refusal names the revision, the work unit where one applies, and each path. Remedies: land a shared change on
  `main` and merge `main` into the branch; re-apply a change to a unit's records on its read copy; drop it from the
  branch; or, for a change on `main`'s side, merge `main` into the read copy's branch, so it carries the change, and
  push it. A merge of `main` into a parked unit's branch keeps the branch's side at the pointer path and at the unit's
  meta, the meta as the branch held it before the merge: the merge carries the park's rewrite of the planned meta the
  branch moved, as a modify/delete at the pointer path or a content conflict on the moved meta, and the import reads the
  meta at the branch's tip and the pointer only on `main`.
- **C8 — A diverging copy.** No live work unit may have a copy, other than a stale one, whose commit is not an ancestor
  of the copy the import selects, a branch's local and fetched copies included. The import reads each live unit's
  selected copy through the in-repo lifecycle composition (`composedMetas`, through
  `resolveCallerComposedLifecycleIndex`). Its selection (`chooseWorkUnitCandidate`, `lib/git/in-flight-derivation.ts`)
  drops stale copies and orders the rest by source, relation, ancestry, lifecycle state, commit time, and finally branch
  name. So a passed-over copy that diverges loses its changes, and two copies of one branch that both moved, with equal
  state and commit time, are decided by listing position. The check reads every copy from the provenance field (§ 1.3),
  not from the composition's warnings, since `candidate-shadowed` is withheld for a stale copy and for a branch's local
  and fetched copies (`isLocalRemoteMirror`). It compares each copy with the one the composed record selects
  (`recordsBySlug`'s `selected`), the copy `composedMetaSource` reads. That differs from provenance's selected copy only
  where the importing checkout's tree holds an active or terminal meta for the unit (`selectRecordCandidate`,
  `lib/status/project-view.ts`), as `main`'s does not. The check finds parked units as the import does
  (`readImportParkedSources`, `lib/store/ref/import/parked-source.ts`) and leaves them to the import. The import reads a
  parked unit from its branch tip rather than the composition, and refuses a diverged pair itself
  (`resolveImportBranchTip`, `lib/store/ref/import/branch-tip.ts`). The refusal names the work unit and both refs.
  Remedy: merge the passed-over copy into the selected one and push, so the local and fetched copies agree, or drop a
  local-only copy's commits. Merging the other way leaves the refusal standing wherever source rank decides before
  ancestry (`candidateSourceRank`).
- **C9 — A store, designation, or earlier hold.** No ref store may be designated or built on this machine, and no
  earlier run's hold may remain:
    - no `remote.*.arc-state` is set, `storage.backing_repository` is empty, and `origin` is the code remote as
      `readRefDesignation` (`lib/store/ref/designation.ts`) resolves it;
    - none of the store directories `store`, `store-migrate-build`, or `store-migrate-old` exists under
      `<commonDir>/arc/` (the set `lib/store/ref/operation-scope.ts` recognizes);
    - no store ref exists, tested by the store's namespaces (`isStateRef`, `lib/store/ref/manifest.ts`) rather than the
      `refs/arc/` prefix, and no ref sits under the store's working namespaces in `refs/arc/tmp/` — `designate/`,
      `follow/`, `migrate/`, `read/`, `seen/`, and `version` — where store operations keep working refs and move
      records;
    - nothing exists under `refs/arc-window/`.

  Every other ref under `refs/arc/` passes, among them those today's machinery keeps there: delivery's candidate,
  refresh-candidate (`refs/arc/delivery-refresh-candidates/`, `lib/delivery/provider-refresh-execution.ts`), recovery,
  and bootstrap refs, the review gate's reachability refs (`refs/arc/review/local/` and `refs/arc/review/local-scope/`,
  `scripts/review-gate/hosts/local/review-materialization.ts`), each identity's Errand and sync-state refs, the legacy
  `refs/arc/user/<id>/errands-remote`, which nothing writes today, and the temporary refs a killed Errand or retirement
  command can leave under `refs/arc/tmp/` (`errand-close`, `errand-pause/`, `base-head/`, `transient-discovery/`, and
  `transient-materialize/`, `lib/errand/`; `retirement-source/`,
  `lib/work-unit/git-retirement-authorization-context.ts`).

  From this state the designation writes only `remote.origin.arc-state` (`setLayoutRole`,
  `lib/store/ref/migrate-layout.ts`): its project check fetches only over an existing registry ref
  (`checkRefDesignationProject`, `lib/store/ref/designation-project.ts`), and no follow can be due, since one is due only
  when a designated remote holds a moved-project tracking ref (`readRefFollowDue`, `lib/store/ref/follow-due.ts`). A
  store or designation from before the window, which `arc store remote` can create by moving a layout or installing a
  backing remote (`applyRefRemoteSetting`, `lib/store/ref/remote-setting.ts`), writes configuration and a store
  repository the restore does not cover. Recording over an earlier hold would lose that run's restore point, or the
  record the window's after-merge steps compare with. Remedies: for a complete hold whose flip has not merged, `restore`
  from it; for an incomplete hold, delete it, since nothing ran past a record that never finished. A store or
  designation from before the window, or a hold past the merge, is the Owner's to decide.
- **C10 — `main` not a proper ancestor of the flip's branch.** `main`'s `HEAD` must be an ancestor of the flip's branch
  and differ from its tip, so the flip's deletion commit deletes exactly the files the import read, no shared file
  `main` changed after the flip last merged it conflicts with that deletion or survives it, and the merged-flip test
  (§ 1.1) cannot answer merged before the merge. Remedy: merge `main` into the flip's branch, then fix its head again as
  the window's rules require.
- **C11 — An open pull request into `main` or a live branch other than the flip's, auto-merge on the flip's, or a host
  that squashes or rebases.** The repository allows auto-merge, the grooming and planning lanes arm it, an Errand left
  awaiting its merge keeps its pull request open, and `main`'s ruleset requires only the `ci-ok` check, so any open pull
  request could merge with no session running. One whose base is a live branch, such as a stacked delivery member's
  (`DeliveryNativeStackMember`'s `baseRef`, `lib/delivery/native-stack.ts`), would move that branch on the host. The
  flip's own pull request must not have auto-merge armed (`gh pr view --json autoMergeRequest`): it would merge as soon
  as `ci-ok` passed on the deletion commit, before the last read and without the Owner's head match (§ 5.2). The check
  reads open pull requests from the host and refuses when it cannot read them. It accepts a supplied listing only where
  the repository has no host (§ 1.1), as in a rehearsal copy, and refuses a supplied listing anywhere else. It also
  reads the host's merge settings as the merged-flip test does (§ 1.1) and refuses unless squash and rebase merging are
  both disabled, so the window learns before the import what would make `close` and `restore` refuse. The refusal names
  each pull request, or the setting. Remedies: merge it ahead of the window or close it; disarm the flip's auto-merge
  (`gh pr merge --disable-auto`); disable squash and rebase merging for the window.
- **C12 — An Errand record, or an identity ref that differs from `origin`'s.** No Errand record (`kind: "errand"`,
  `purpose: "errand"`) may remain in any `refs/arc/user/<id>/errands`, locally or on `origin`, whether the Errand is
  open, paused, or awaiting its merge. A close, an abandon, or a promotion retires the record (the `retire` transition,
  `lib/errand/identity-transitions.ts`). The import carries a remaining record across with its branch as recorded
  (`appendTransientRecord`, `lib/store/ref/import/transient.ts`), and after the flip every reader would refuse it as
  malformed or drop it (`decodeBasis`, `lib/errand/store-runtime.ts`; `decodeErrand`, `lib/inbox/lists.ts`). The check
  reads `origin`'s records from the refs it fetched under `refs/arc-window/`. Grooming claims and housekeep routing
  records in the same ref pass: they cross re-homed as claims (`transientKind`, `lib/store/in-repo/transient-common.ts`).

  Where `origin` holds an identity ref, the local ref must hold the same tip. The import reads and leases only the local
  refs (`heldIdentities`, `lib/store/ref/import/transient.ts`). After publishing, it deletes `origin`'s only where that
  equals the tip it kept, refusing otherwise, and skips one `origin` lacks (`retireOriginRefs`,
  `lib/store/ref/import/transient-cleanup.ts`). So a ref that differs would stop the window after publication, one only
  on `origin` would leave its claims behind unread, and one held only locally passes. The two differ whenever an
  identity write was not pushed: a transaction without a remote writes the local ref alone, and a failed push leaves it
  ahead (`transactTransientIdentities`, `lib/errand/identity-transaction.ts`). And no identity other than the configured
  one may hold a claim, on either side. Publication pushes only the configured identity's claims, so the retirement
  refuses for an identity whose landed claims `origin` lacks (`unpublishedImportClaims`,
  `lib/store/ref/import/transient-publication.ts`), and claims landed from a ref held only locally would reach no other
  clone.

  The refusal names each Errand and where its record is, each identity ref and both tips, or each identity holding a
  claim. Remedies: close the Errand, landing its branch, or abandon it; fetch `origin`'s tip into the local ref where
  the local one is absent or its ancestor, or push the local tip where `origin`'s is its ancestor, leaving a diverged
  pair to the Owner; and, for another identity's claims, have their owner close them before the window.
- **C13 — Off the host.** The importing checkout must be the primary, on `main`, and `main`'s tip on the host must
  equal its `HEAD`. The import reads the shared records at `HEAD` (`importTrackedState`'s `codeHead`,
  `lib/store/ref/import/entry.ts`) and live work units' records from the importing checkout's working tree
  (`composedMetaSource`, `lib/store/in-repo/meta.ts`), which C1 holds equal to `HEAD`. Each live branch's fetched tip
  must also equal its tip on the host, read for every branch with one `git ls-remote origin 'refs/heads/*'`, since the
  import reads fetched copies. A merge or push that landed on the host between the fetch and the check therefore
  refuses. The check refuses when the host cannot be read. Remedy: pull `main`, or fetch again, and run the check
  again.

#### 2.3 The import as the witness for personal state

The check does not inspect personal files beyond recording their digest. The import refuses when a notes file's disk
copy differs from its saved copy, when an attempt is in flight in the review gate, and when a review source is unmapped
(`lib/store/ref/import/personal.ts`, `lib/store/ref/import/review-mapping.ts`). Each refusal is a notice recorded
before the landing is decided, which blocks the landing (`importTrackedState`). So a write that slipped past the stop
refuses the import rather than vanishing.

### 3. The seal's reach after the check

Between the check and the import, the window saves notes, then designates. From the import's landing on, the sealing
guard refuses every sealed writer in every checkout of the machine, and the import's landing leases each
transient-identity ref on the tip it read, so an Errand identity ref that advanced refuses the landing
(`landImportRefs`). After that, the guard refuses the Errand writers (`transactTransientIdentities`,
`lib/errand/identity-transaction.ts`, which writes through `writeTreeCommit`, `lib/errand/ref-tree.ts`). Neither covers
the interval between the check and the import's read of the identity refs: an Errand record written then is read and
leased as found, so the import carries it. `recompute` covers that interval (§ 5.1), and on an abort the restore does
(§ 6.1).

The Errand identity refs are the one import input the import consumes. It reads each local ref at its own read, not at
the check (`heldIdentities`, `lib/store/ref/import/transient.ts`), keeps that tip under
`refs/arc/tmp/migrate/import/kept/`, deletes the local ref with its landing or just after it, deletes `origin`'s once
published where it equals the kept tip, and drops the kept tips at the end of a clean run (`importTransientDeletes`,
`retireImportLocals`, `retireOriginRefs`, and `dropKeptTips`, `lib/store/ref/import/transient-cleanup.ts`). Every other
ref it deletes is its own or the store's: its gathering refs, kept tips, and publication journal, the tracking refs, and
the store refs its publication moves. Its report carries no tips (`MigrateReportSchema`, `lib/store/commands.ts`). The
import keeps its tips before it lands and leaves them when a landing fails, so only a landing consumes a ref
(`landImportRefs`, `retireImportLocals`). Once it has landed, an identity ref is absent whichever tip it read, and the
window judges these refs by one comparison, of what the import consumed with what the check held: each kept tip with its
ref's held tip while the kept tips remain, and once they are dropped, the landed store's transient records with those
the held tips give, compared as `recompute` compares them (§ 5.1). From then on the comparison is by record, not by tip.
Before a landing nothing is consumed, and each ref's own value is compared with its held tip. `recompute` applies the
comparison after the import, where a clean run has dropped the kept tips, and the restore before its first write
(§ 6.1).

### 4. The record and the hold

#### 4.1 What the check records

- the flip's branch, its pull request, and its head at the check;
- each registered worktree's path, `HEAD` commit, branch, and personal digest (§ 4.2);
- the review gate's digest (§ 4.2);
- every local branch's tip and every fetched `origin` branch's tip, so a branch created or moved after the check is a
  difference, with the live branches (§ 1.1) marked among them;
- each live branch's tip on the host, equal to its fetched tip, and `main`'s, equal to the importing checkout's `HEAD`
  (C13);
- every `refs/arc/*` ref and its tip, locally and on `origin`;
- every `refs/arc-remotes/origin/*` ref and its tip. An accepted push writes one per published ref outside `refs/arc/`
  (`acknowledgePushRefs`, `lib/store/ref/push-tracking.ts`), and the next push leases on them (`readPushListing`,
  `lib/store/ref/push-listing.ts`). None exists before the import.

The refs under `refs/arc/` before the import are those C9 lets pass (§ 2.2), none a store ref (`isStateRef`).

#### 4.2 The digests

A worktree's personal digest covers what the import reads as that worktree's personal state: the files
`readImportPersonalDisk` (`lib/store/ref/import/personal-disk.ts`) acquires under the worktree's `.arc/user/`, with each
path `importPersonalExcluded` excludes left out. That leaves out every `.internal/` path and the generated status file.
Each file contributes its path and bytes, in sorted path order. The tool computes the digest from that function's own
acquisition, so the two cannot drift. The function also records each link without reading it, and the import follows a
link's target wherever the saved notes hold a path through it (`followImportPersonalLinks`,
`lib/store/ref/import/personal-links.ts`), so C1 refuses a personal link outright, and each link the function records
contributes its path to the digest, so one made after the check is a difference.

The review gate's digest covers every file `readImportReviewGate` (`lib/store/ref/import/review-gate.ts`) reads under
`<commonDir>/arc/review-gate/`, each contributing its path and bytes in sorted path order, computed from that function's
own read. It leaves out the repository identity file, `identity/repository-identity.json`, which the import mints when
absent (`resolveRepositoryIdentity`, through `importTrackedState`). No review-gate writer consults the sealing guard, so
a review that records after the check changes this digest.

The save between the check and the import rewrites `.internal/.sync-state.json` (`writeLocalSyncState`,
`lib/user-sync/sync-state.ts`), writes the notes refs (`writeGitNote`, `lib/io-context.ts`), and writes the baseline
stamp under `<commonDir>/arc/user/` (`writeMaterializedBaselineStamp`, `lib/user-sync/materialized-baseline.ts`). It
therefore changes neither digest.

#### 4.3 The hold

The hold lives under `refs/arc-window/`, outside `refs/arc/`, so neither the import, which reads `refs/arc/`, nor a
store push reads it. The repository's only fetch refspec is `refs/heads/*`, and it has no push refspec:

- `refs/arc-window/local/<ref>`: each local `refs/arc/*` ref, at its recorded tip;
- `refs/arc-window/origin/<ref>`: each of `origin`'s `refs/arc/*` refs, fetched at its recorded tip;
- `refs/arc-window/tracking/<ref>`: each `refs/arc-remotes/origin/*` ref, at its recorded tip;
- `refs/arc-window/record`: a commit whose tree holds the record document (§ 4.1);
- `refs/arc-window/complete`: the completion marker, pointing at the record commit and written last;
- `refs/arc-window/compared/local/<branch>` and `refs/arc-window/compared/origin/<branch>`: the tip `compare` found on
  that side of a branch after the merge, the host's tip for `origin` (§ 5.3);
- `refs/arc-window/gone/local/<branch>` and `refs/arc-window/gone/origin/<branch>`: a recorded side `compare` found
  deleted, at its recorded tip;
- `refs/arc-window/confirmed/local/<branch>` and `refs/arc-window/confirmed/origin/<branch>`: the tip of a range whose
  re-application was confirmed (§ 5.4);
- `refs/arc-window/restore`: a commit whose tree holds the restore's comparison of what the import consumed, with each
  identity ref the Owner accepted, written before the restore's first write (§ 6.1).

Holding tips as refs keeps every commit the restore needs reachable. After publication the import deletes the Errand
identity refs on both sides and drops the tips it kept, and a deleted ref's commits are otherwise prunable.

### 5. The recompute, last read, after-merge comparisons, and close

#### 5.1 The recompute

`recompute` runs after the import, its accounting case, and its chain comparison. It compares each import input
(§ Introduction) and each place a recorded branch could move with the record:

- the set of registered worktrees, and each one's `HEAD` and personal digest;
- the primary's and every marked checkout's working tree, which must still pass C1's tests: an empty
  `git status --porcelain`, untracked files included, no ignored file under the tracked-state paths, and no stash entry
  changing a file there. With each `HEAD` unchanged, that holds those paths equal to `HEAD`. The import reads live work
  units' records from the importing checkout's working tree, and an uncommitted change elsewhere would be deleted at
  that checkout's steps;
- the review gate's digest;
- every local and fetched branch tip, and each live branch's and `main`'s tip on the host, read with one
  `git ls-remote origin 'refs/heads/*' 'refs/arc/user/*/errands'`, which also lists the identity refs;
- the landed store's transient records — `claims/groom`, `claims/housekeep`, and `work-item/record` — which must be
  exactly those the identity refs held locally give (`refs/arc-window/local/`), the refs the import reads, which C12
  held equal to `origin`'s where `origin` holds one. `recompute` reads each identity ref at its held tip with the
  import's own reader (`readTransientIdentitySnapshotAtRef`, `lib/errand/identity-snapshot.ts`) and maps each record as
  the import does (`transientKind` and `transientReference`, `lib/store/in-repo/transient-common.ts`;
  `appendTransientRecord`, `lib/store/ref/import/transient.ts`), comparing references and content
  (`serializeTransientIdentityRecord`, `lib/errand/identity-record.ts`) as parsed JSON in canonical form. C12 left no
  Errand record, so the expected `work-item/record` set is empty: a landed one, or any claim that differs, was written
  between the check and the import's read of the identity refs (§ 3);
- no identity ref (`refs/arc/user/<id>/errands`), locally or on `origin`, read in the same `git ls-remote`. The import
  retires every one it read on both sides, so one that remains was written after its read, or never read.

Any difference stops the window before the flip change, naming the worktree, branch, file, record, or ref and both
values. The recompute runs after publication, so its stop exits through the abort's restore (§ 6), which returns the
recorded `refs/arc/*` tips on both sides. The restore refuses on a transient-record difference the recompute named until
the Owner accepts it (§ 6.1).

#### 5.2 The last read

`last-read` runs `recompute`'s comparisons in full as the last act before the flip's merge, and refuses while the flip's
pull request has auto-merge armed (C11). The flip's checkout has made its deletion commit by then, so the flip's branch
and checkout must equal their recorded head plus exactly one commit. That commit's parent is the recorded head, and it
only deletes files under the tracked-state paths. A different count, a modification, an addition, or a deletion
elsewhere stops the merge. The window runs `last-read` after the checks at the flip's merged head have finished:
`main`'s ruleset does not require a branch to be current, so a merge landing while those checks run would otherwise go
unseen. The Owner then merges through the host's head match, which refuses a pull-request head that moved after
authorization.

#### 5.3 The after-merge comparisons

After the merge no abort remains, so `compare` reports rather than stops. The window runs it for each live branch before
that branch's step, and for each checkout before that checkout's own steps:

- **Each recorded live branch** other than `main` and the flip's: its local tip, and its tip on the host read with
  `git ls-remote`, are compared with the record. `compare` marks each side the record holds under
  `refs/arc-window/compared/local/<branch>` or `compared/origin/<branch>` at the tip it found, fetching a host tip whose
  commit is not local so the mark holds it. A side whose mark differs from its recorded tip is a moved range, reported
  from the recorded tip to the mark. A recorded side that no longer exists is marked under
  `refs/arc-window/gone/<side>/<branch>` at its recorded tip and reported as a gone range. The branch's step continues.
- **A branch missing from the record** that tracks a file under the tracked-state paths, locally or on the host: `compare`
  marks it the same way and reports it as an unrecorded range, running from its merge base with `main`'s recorded tip
  to its mark.
- **Each checkout:** its personal digest is compared with the record. The answer decides whether the window removes
  that checkout's pre-flip personal files or leaves them for its first materialization to withhold.

Running `compare` again for a branch replaces its marks with the tips it finds then, which leaves any confirmation at an
earlier tip unmatched (§ 5.4).

#### 5.4 Confirmation and the close

The after-merge rule: no live branch's late change made before its `compare` is lost unconfirmed. The close passes only
when every side the record holds of every recorded live branch, other than `main`'s and the flip's, carries a mark from
`compare`, every branch missing from the record that tracks state carries one too, and every moved, gone, or unrecorded
range carries a confirmation at exactly its mark's tip. The window runs `compare` before each branch's step (§ 5.3), so
a range holds only the late change. A change that lands on a branch after its `compare` and before its step, or a
personal edit made after a checkout's `compare` and before its steps, falls in no range: the step merges and deletes it
unseen, and `close` reads no current tip. That residual, which the flip's specification accepts (its § 13.1), rests on
the quiesce leaving no writer but the window while the steps run. A mark taken after the step still records a moved
range, with the step's commits inside it, and the late change stays in that range's history for its re-application and
confirmation.

`confirm <branch>` records that a branch's ranges have been re-applied through the store. It takes, for each side, the
tip `close` lists for that range, and writes `refs/arc-window/confirmed/<side>/<branch>` at it. It refuses a branch with
no range, and a tip that differs from the side's current mark, so a range that moved again after it was re-applied
stays unconfirmed. The tool cannot judge re-application itself; the confirmation is the Owner's, recorded where the
close can read it.

`close` deletes the hold when the window ends. It first lists every recorded live branch's marks and every range with
its recorded tip, mark, and confirmation, then refuses:

- until the merged-flip test (§ 1.1) answers merged, since before the merge the hold is the abort's restore point;
- while any registered checkout's `HEAD` tree tracks a file under the tracked-state paths;
- while any side the record holds of a recorded live branch lacks a mark, or any branch missing from the record tracks a
  file under the tracked-state paths, locally or on the host, without one;
- while any range lacks a confirmation at its mark's current tip.

A branch missing from the record whose step was taken without `compare` tracks nothing afterwards, so the close cannot
see it. Such a branch exists only if a writer the quiesce did not stop created it from pre-flip state: on this machine
after the last read, since `recompute` and `last-read` stop on a new local branch, or on the host from another clone,
whose absence rests on the Owner's confirmation (§ Non-Goals).

When nothing refuses, it deletes the completion marker first, then every other ref under `refs/arc-window/`. A close
stopped part-way is run again. Whether any checkout still reports a withheld projection file is read by the flip build,
so the window runs the close only once none does.

### 6. The abort's restore

#### 6.1 What it restores

The sealing guard makes an abort necessary as well as possible: once the registry ref exists, every pre-flip build
refuses its store, notes, and Errand writes. A failed import with no usable store behind it would leave every checkout
on the machine unable to make them.

Before its first write, `restore` compares what the import consumed of each Errand identity ref with its held tip (§ 3),
where the import has landed: the registry ref exists, as `storeImported` reads it. While the import's kept tips remain,
each held ref's kept tip must equal its held tip, and no other ref may have one; once they are dropped, the landed
store's transient records must be exactly those the held tips give. Kept tips without a landing show nothing consumed:
there, and where no import ran, each identity ref's own value is tested in step 2. Any difference is another writer's,
made between the check and the import's read, and may be one `recompute` named. The restore refuses, naming each ref and
its held tip, with its kept tip where one remains, and printing each differing record's reference and content in full,
since the landed store the restore deletes holds the only reachable copy. Once the Owner has settled that change,
`restore --accept` names what the import consumed: `<ref>=<kept tip>` while kept tips remain, which also covers
`origin`'s copy where the import had not yet retired it, or `<ref>=absent` once they are dropped. The restore's own
steps remove this evidence, so before its first write it records the outcome, with each accepted ref, at
`refs/arc-window/restore` (§ 4), and a restarted restore reads that in place of comparing again.

`restore` then returns what the check recorded:

1. **On `origin`:** each ref under `refs/arc/*` is set back to its held tip, pushed from `refs/arc-window/origin/`, and
   every `refs/arc/*` ref the record does not hold is deleted, `origin`'s registry ref last. Each push is leased on the
   value the window left on that ref: its held tip; for a ref the store's publication pushes, its tracking ref's tip or
   the same-named local ref's tip, which is what the import published (`acknowledgePushRefs`,
   `lib/store/ref/push-tracking.ts`); or absence, for an Errand identity ref the import retired (`retireOriginRefs`,
   `lib/store/ref/import/transient-cleanup.ts`) where the comparison above passed or accepted it, or a ref the record
   did not hold. A ref holding any other value was moved by another writer. The restore refuses before its first push,
   naming each such ref, the value found, and the values the window left. Once the Owner has settled that writer's
   change, `restore --accept <ref>=<tip>`, or `<ref>=absent` for a ref found deleted, names the value found and leases
   that ref's push on it, so a further change refuses again. An accepted value covers the ref on whichever side holds
   it. Before publication this step changes nothing. The refs the store's publication pushes are the store's refs
   (`isStateRef`), and under `refs/arc/user/` only the configured identity's `personal` and `claims`. That is the rule
   the push listing applies (`publishableRef`, `lib/store/ref/push-listing.ts`); it is not exported, so the restore
   states it.
2. **Locally:** the store's refs (`isStateRef`) and the refs in the store's working namespaces under `refs/arc/tmp/`
   that C9 lists, where the import keeps its gathering refs, kept tips, journal, and keepers, are set back to their held
   tips, or deleted when the record does not hold them. Each `refs/arc-remotes/origin/*` ref is likewise set back to its
   held tip, or deleted when the record does not hold it. Each Errand identity ref is set back to its held tip, and must
   hold that tip, or be absent where the comparison above passed or accepted it. Every other `refs/arc/*` ref is one the
   window never writes, such as delivery's candidate refs, the notes sync-state refs, and the temporary refs an Errand
   or retirement command left (C9), and must still hold its held tip, or be absent where the record does not hold it. An
   identity ref or another ref holding any other value was moved by another writer: the restore refuses before its first
   push, as step 1 does, and once its value is accepted sets it back, leased on that value.
3. **Configuration and directories:** the store directories `store`, `store-migrate-build`, and `store-migrate-old`
   under `<commonDir>/arc/` are removed, and `remote.origin.arc-state` is unset.
4. **Verification:** local and `origin` `refs/arc/*` equal the record, and the registry ref exists on neither side. The
   guard is then lifted (`storeImported`, `lib/store/store-imported.ts`, answers false).
5. **The hold:** the completion marker is deleted first, then every other ref under `refs/arc-window/`, so a re-run's
   check records afresh.

Refs the window never writes therefore come back as the check recorded them, and no other writer's change to one is
undone unseen. The restore resets no branch and no worktree. When to abort, the revert of the flip's deletion commit,
and dropping a change the recompute found are the window's own steps, though for an identity ref's records the restore
holds that drop until the Owner accepts it.

#### 6.2 Re-running

Every step before the hold's deletion sets a target state, so a restore stopped part-way — by a network failure on
`origin`, for example — is run again from the same hold. The comparison before the first write is the exception: its
evidence goes with the store and the kept tips, so a re-run reads its recorded outcome (§ 6.1). Deleting the completion
marker first means a restore stopped while deleting the hold leaves an incomplete hold. Since the verification preceded
it, deleting that hold is right. Deleting the marker last would risk a complete marker over held refs already deleted.

#### 6.3 Refusals

- **An incomplete hold,** with no completion marker: a record that never finished. Remedy: delete it, since nothing ran
  past it.
- **A merged flip:** the merged-flip test (§ 1.1) answers merged. The window fixes forward and nothing restores. A move
  of `main` before the merge, which the recompute stops on, leaves the restore free to run, and so does the flip's
  unmerged deletion commit, which the window reverts. The restore runs the test first, again immediately before its
  first push to `origin`, and again before it deletes `origin`'s registry ref. A merge found at that last test refuses
  with the registry ref kept. `origin` then lacks the published refs step 1 has deleted and again holds the Errand
  identity refs step 1 re-created, while the local store, which step 2 has not touched, still holds every tip the
  import published. The window fixes forward from there: it re-runs `arc store migrate --import`, which over a landed
  store only publishes (`inspectImportDestination`, `lib/store/ref/import/occupied.ts`), sending the store back, and
  deletes the re-created identity refs from `origin`, each leased on its held tip, since the import's own retirement
  (`retireImportRemote`) does nothing once its kept tips are dropped.
- **Auto-merge on the flip's pull request** (C11): a merge could land while the restore runs. Remedy: disarm it.
- **A host that squashes or rebases** (§ 1.1): reachability cannot show the merge. Remedy: disable squash and rebase
  merging for the window.
- **A ref another writer moved:** an `origin` ref (§ 6.1, step 1); locally an Errand identity ref or a ref the window
  never writes (step 2); or an Errand identity ref the import consumed at a tip other than its held one (§ 6.1).
  Remedy: settle that writer's change, then accept the value found, or for a consumed ref what the import consumed.
- **An unreadable host:** the restore cannot tell whether the flip merged, so it refuses with a retry rather than
  assume no merge.

#### 6.4 What the window writes, and what stays

From the state the check admits, the window's steps after the check write the following, each covered by the restore:

- **The import:** it keeps the Errand identity tips and its publication journal under `refs/arc/tmp/`
  (`keepImportTransients`, `lib/store/ref/import/transient-cleanup.ts`; `keepImportPublication`,
  `lib/store/ref/import/transient-publication.ts`; through `landImport`, `lib/store/ref/import/entry.ts`). It lands
  state refs and gathering refs and deletes the local Errand identity refs (`landImportRefs`).
- **Its publication:** this fetches and acknowledges tracking refs under `refs/arc-remotes/origin/` and keeper refs under
  `refs/arc/tmp/seen/` (`pushRefStore`, `lib/store/ref/push.ts`; `acknowledgePushRefs`). It pushes state refs to
  `origin` and deletes `origin`'s Errand identity refs (`retireOriginRefs`,
  `lib/store/ref/import/transient-cleanup.ts`).
- **The designation:** it sets `remote.origin.arc-state`. With no store directory, the current layout and the one
  `origin` requires are both the code repository's own (`readRefRepository`, `lib/store/ref/repository.ts`;
  `publisherLayout`, `lib/store/ref/layout-designation.ts`). So the layout move takes its no-move path, which sets the
  key and finds no build directory, aside directory, or gathering ref to clear (`moveHeldLayout`,
  `cleanUnrecordedLayout`, `lib/store/ref/migrate-layout.ts`). The restore still removes all three store directories
  and every ref in the store's working namespaces under `refs/arc/tmp/`, so a designation or import interrupted on
  another path leaves nothing it does not cover.

Each item is a ref the restore resets or deletes, a deleted ref it recreates from the hold, a store directory it
removes, or the key it unsets. The rest of what those steps write stays, deliberately:

- **The save's writes:** each person's notes ref, the local sync-state record, and the baseline stamp. They agree with
  each other and with disk, which is what a re-run's save and import need. Putting back an older notes tip would leave
  the sync-state record naming a tip its ref no longer holds.
- **Two identifiers, minted if absent:** the review gate's repository ID (`resolveRepositoryIdentity`,
  `scripts/review-gate/hosts/local/git-common-state.ts`) and the machine ID (`getOrCreateMachineId`,
  `lib/store/machine-id.ts`), which the pre-flip build mints the same way.
- **Lock files and temporary directories under `<commonDir>/arc/`, left only by a killed process:** an abandoned lock
  is reclaimed once its holder is provably dead (`lib/advisory-lock.ts`), and nothing reads an abandoned object-staging
  directory, `object-stage-<uuid>/` (`flushRefBlobStage`, `lib/store/ref/tree-write.ts`), or store-initialization
  directory, `store-init-<uuid>` (`createStoreDirectory`, `lib/store/ref/repository.ts`).
- **Objects the import and the push wrote,** unreachable once their refs are gone.

The import's other bodies write objects alone (`commitRefTree`, `lib/store/ref/write-commits.ts`;
`replayImportVersions`, `lib/store/ref/import/candidate.ts`). Some only read under a lock (`captureComparisonWitness`,
`lib/store/ref/comparison-witness.ts`), and the review mapping writes nothing (`lib/store/kinds/review/mapping*.ts`).

#### 6.5 Repository maintenance

The store's fetch passes no `--no-auto-maintenance` (`refFetchArgs`, `lib/store/ref/fetch-target.ts`). Whether a fetch
runs maintenance depends on `maintenance.auto`, and a repository registered for background maintenance also runs
scheduled tasks at any time, the window included. Neither changes what the restore can do:

- `gc` packs refs and prunes only objects unreachable from every ref, and every object the restore needs is reachable
  from the hold.
- Prefetch writes only under `refs/prefetch/`.

The tools therefore neither disable nor depend on maintenance.

### 7. The seal on `arc user load`

`runUserLoad` (`commands/user/save-load.ts`) writes the disk from notes: identity-global files into the identity root
the user-surface resolver names (`resolveUserSurfaceResolver`), and the current work unit's workspace files. It does not
consult the sealing guard, where `runUserSave` and `runUserRenameWorkspace` in the same module do. After the merge, a
linked checkout runs its pre-flip build until its own merge of `main`, and that build's load would write the notes copy
of the identity-global files into the primary's identity root. After the primary's first materialization, write-back
takes such writes as edits. A notes copy older than the store's record could then delete newer entries from the store.

This unit adds `refuseWriteIfStoreImported(cwd, io.exec)` as the first act of `runUserLoad`, before any read or write.
Two of its callers already refuse first, because they fetch through `runUserFetch`, which is sealed: `arc user pull`
(`runUserPull`, `commands/user/push-fetch.ts`) and the in-repo store's pull (`lib/store/in-repo/pull.ts`). The seal
newly reaches two callers:

- `arc user load` (`handlers/user.ts`);
- the load direction of the user-sync handler (`handleLoadDirection`, `handlers/user-sync.ts`).

Each must end with the store-imported refusal's condition and remedy and a non-zero exit, writing no file. The refusal
is an `ArcError` (`StoreImportedError`), not a `UserFacingError`, and the load handler rethrows anything else, so the
implementation confirms that the error reaches the person as that refusal rather than as an unhandled failure. Before
the registry ref exists the call returns at once, so no behavior changes ahead of the window. The sealing guard's suite
(`__tests__/integration/store-imported-seal.test.ts`) gains a case: a load refuses once the registry ref exists,
writing no file, and loads once it is gone.

### 8. The worktree lock step

Before the fetch and the check, `lock` runs `git worktree lock --reason` on each marked linked checkout that carries no
lock. The reason is the value `PROJECTION_LOCK_REASON` holds (`lib/git/worktree-removal.ts`), imported rather than
restated. The step leaves an existing lock and its reason alone and leaves every other checkout unlocked. It reports
each checkout it locked. The projection locks each work-item checkout ARC spawns but runs no backfill, and a worktree
left unlocked at the flip is exposed to a plain `git worktree remove`, which deletes its gitignored projection without
persisting its edits.

### 9. Stage 1

Stage 1 rehearses the window's mechanics on full copies of this machine's repository, stopping at the host boundary.
It needs only today's machinery plus these tools, so it runs from this unit's branch once the check builds, before the
flip change exists. Stage 2, at the flip's head, runs these steps again on the pre-flip build of its own copy.

#### 9.1 The copy driver and copy safety

`copy` takes a destination outside every live checkout. It copies the primary checkout with its Git directory and every
registered linked checkout. It creates the copy's mirror as a bare mirror clone of `origin`, a read of the host. It
then rewrites every remote's URL and push URL in the copy to the mirror, and repairs each worktree registration to its
copied checkout (`git worktree repair`). Before any `arc` command runs in the copy, it asserts:

- every remote URL and push URL is the mirror;
- every worktree registration, and every copied checkout's `.git` file, names a path inside the copy;
- `storage.backing_repository` names no repository;
- the copy has no host (§ 1.1), and `gh` finds no repository from it;
- no copied Errand awaits its merge, since abandoning one reads its pull request from the host
  (`createGhChangeRequestLifecyclePort`, `lib/errand/change-request-lifecycle.ts`, through
  `lib/errand/abandon-runtime.ts`).

A copy that fails any assertion stops the stage. The copy's machine-local review records still name the live
repository's materializations by absolute path (`materializationRef`). Only the review gate reads that field
(`scripts/review-gate/`), and Stage 1 runs no review; the store and the import never read it.

#### 9.2 The steps

`rehearse` runs the sequence below on a copy, reporting each step's outcome and stopping at the first unexpected one.
Every run of `check`, `last-read`, or `restore` on the copy takes its supplied pull-request listing (§ 1.1).

1. Fetch every branch from the mirror.
2. Apply C7's remedies on the copy, as live branches do before the window, each pushed to the mirror. First, to each
   read copy's branch whose unit has a path on the copy's `main` that fails the read rule (§ 1.1), a merge of the copy's
   `main`. Then, to each copied branch with a path that still fails it, a commit returning that path to its content at
   the branch's merge base with the copy's `main`. This rehearses the remedies too. Likewise apply C6's remedy to each
   copied checkout whose `HEAD` does not descend from the anchor: merge the copy's `main` into its branch, push it to
   the mirror, and rebuild there. A merge whose only conflicted path is `.arc/backlog/ROADMAP.md` is concluded with the
   repository's ROADMAP remedy, which regenerates the view (`applyRoadmapConflictAutoRemedy`,
   `lib/status/roadmap-conflict-auto-remedy.ts`), as the pre-commit hook concludes a live merge. A merge into a parked
   unit's branch resolves the pointer path and the unit's meta as C7's remedy does. Any other conflict stops the stage,
   naming the branch; it is resolved on the live branch and the copy taken again. Stage 1 runs before this unit lands,
   so it supplies the sealing guard's merge (`a61e24716a`) as the anchor. Stage 2, after the landing, uses the derived
   one.
3. Abandon each copied Errand (`arc errand abandon`), and drop each copied stash entry C1 refuses, as the Owner's
   cleanup does on the live repository before the window.
4. Create the stand-in flip branch afresh from the copy's current `main`, replacing any earlier one: `main` plus one
   commit that changes no file under the tracked-state paths, pushed to the mirror. A run whose `main` moved, such as
   the second run's restored backfill, therefore passes C10. The supplied pull-request listing holds its pull request
   as the flip's own.
5. Run `lock`, then `check` with the supplied listing and anchor.
6. Save from every copied checkout (`arc user save`), then designate the mirror as the copy's state remote
   (`arc store remote origin push`).
7. Import with publication to the mirror (`arc store migrate --import --json`), keeping its report for `chain`
   (§ 10.3). The import runs under a 6 GB address-space cap, with Node's heap ceiling set below it so the import's own
   failure arrives first, and its wall time and peak resident memory are recorded.
8. In every copied checkout, a write through the in-repo implementation refuses with the store-imported refusal and
   changes nothing (`refuseWriteIfStoreImported`).
9. The Errand identity refs are gone from the copy and the mirror, and the tips the import kept under
   `refs/arc/tmp/migrate/import/kept/` are dropped.
10. Run `account` (§ 10.2), then `chain` (§ 10.3), then `recompute`.

#### 9.3 The first run

The first run uses a copy whose `main` has the pre-meta backfill (`68bddbb526`) reverted, pushed to the mirror. The
accounting case then has the omission it exists to catch.

- **At step 5, five planted conditions.** The check refuses each one, naming it, and passes once each takes its remedy:
    - a shared tracked-state change on a copied branch, removed;
    - an open pull request in the supplied listing, removed;
    - an Errand opened on the copy, abandoned;
    - a marked linked checkout unlocked on the copy, locked by `lock`;
    - a diverging copy for a live work unit whose branch no checkout holds, the branch moved both locally and on the
      mirror so neither is an ancestor of the other. A held branch's divergence would also refuse as a checkout off its
      upstream. The remedy merges the passed-over copy into the selected one and pushes it to the mirror.
- **Between steps 6 and 7, store-backed case 1.** A review boundary filed under another work unit's owner is planted on
  a live work unit's branch. The import refuses it, and no ref under `refs/arc/` differs from the hold. The plant is then
  removed by resetting that branch, locally and on the mirror and in any checkout holding it, to its recorded tip, so
  the record still holds. Case 1 runs before the real import because an import over a landed store only publishes,
  reading no source again (`inspectImportDestination`, `lib/store/ref/import/occupied.ts`).
- **At step 10, the accounting case** reports exactly the files in the twenty pre-meta work-unit folders the backfill
  claims, and `.arc/completed/2026-q1/completed-atomic-2026-q1.md`, which the backfill split into two of those folders'
  records. It lists as superseded `main`'s copies of each live unit the import reads from a branch, unchanged since
  that branch forked once step 2 has merged `main` where C7 required, which stops nothing.
- **After step 10, the abort.** `close` refuses, since the stand-in flip has not merged. A commit planted in a copied
  checkout moves its `HEAD`, and `recompute` refuses naming it. `restore` then runs from that stop, as the window's
  abort does. Afterwards every recorded ref is back on the copy and the mirror, every other `refs/arc/*` ref and every
  unrecorded tracking ref is gone, `storeImported` answers false in every copied checkout, and the hold is deleted. The
  restore resets no branch, so the planted commit is dropped from that checkout afterwards, as the window drops a
  change the recompute found.

#### 9.4 The second run

The second run uses the aborted copy with the backfill restored on its `main`, pushed to the mirror. Nothing is
planted. It shows that the backfill claims the folders and that an aborted repository imports again.

- Steps 1 to 10 pass, the accounting case reporting no file unplaced and `recompute` passing.
- **The last read.** The stand-in branch takes a stand-in deletion commit, which only deletes files under the
  tracked-state paths. A commit planted on the mirror's `main` makes `last-read` refuse. `last-read` passes once the
  mirror's `main` is put back. That repair is the rehearsal's alone: the window's repair for a moved `main` is an abort,
  a merge into the flip's branch, and a re-run.
- **The stand-in merge.** The stand-in branch is merged into the mirror's `main` with a merge commit
  (`git merge --no-ff`), as the host merges, from a separate clone of the mirror,
  standing in for the flip's merge on the host, so the copy lacks the merge commit as a clone does after a host merge.
  `restore` then refuses, naming the merge.
- **The after-merge comparisons.** `compare` runs for every live branch and every copied checkout. A commit planted on
  a live branch makes it record that branch's moved range under the hold. A personal file edited in a copied checkout
  makes it report that checkout's digest changed. Neither stops.
- **The close.** `close` refuses, naming each copied checkout that still tracks files under the tracked-state paths,
  and lists the recorded range as unconfirmed. Its refusal over an unconfirmed range alone, `confirm`, and its passing
  path run in its tests and in Stage 2.

#### 9.5 Failures and evidence

A failure is fixed in this unit's change and the stage is run again. Stage 1 runs at the head that lands, and again
after any later change to these tools. Its raw evidence stays on the machine that runs it, uncited. The work unit's
records state each conclusion in their own text and cite a commit or a CI run ID.

### 10. The store-backed case, the accounting case, and the chain comparison

#### 10.1 Store-backed case 1

The delivery and review paths that run only from the flip or in the import carry an accepted residual risk, on
condition that the rehearsals exercise them as seven cases. Cases 2 to 7 need the flip build and run in Stage 2. Case 1
runs on today's build, so Stage 1 runs it before its first real import (§ 9.3): the import refuses a review boundary
filed under another work unit's owner, with nothing landed, and imports once the boundary is removed.

#### 10.2 The accounting case

The import reads the in-repo store's records. That store discovers work items by their meta files
(`heldMetaSources`, `lib/store/in-repo/meta.ts`), and the files beside a meta by the `<word>-<slug>.md` pattern
(`artifactMatcher`): the draft, spec, task list, and notes as their own kinds (`recordPath`, `lib/store/in-repo/paths.ts`),
and any other as a companion (`companionNames`). A tracked file under a projected root that
no record claims is never imported, and no import refusal reports it, since an omission refuses nothing. Closed
cohorts' folders are claimed: the import recovers their archive coordinate (`lib/store/ref/import/cohort-source.ts`).

`account` tallies every tracked file under the tracked-state paths at `main`'s `HEAD`, and every live unit's records at
its read copy where that is not `main`'s (§ 1.1). Each file counts as one of four:

- **Imported:** the tallied revision is its read revision, the file is the source path the in-repo store's own
  discovery gives there for a record, and the landed store holds that record. The tool finds source paths through that
  discovery (`heldMetaSources`, `recordPath`, `companionNames`, `internalReferences`, and the cohort and project-inbox
  listings), never by a pattern of its own. A parked unit's pointer counts with its meta.
- **Superseded:** the tallied revision is not its read revision, and the file passes the read rule (§ 1.1): it is
  unchanged since the fork, so its read copy carries all it holds, such as a backlog draft a unit's planning branch has
  retired. The flip's deletion commit removes it, and the report lists each with its read copy.
- **Deliberately left:** an entry of one list in the tool, each with its reason. The list is the installed files the
  flip deletes that no record claims: `.arc/backlog/ROADMAP.md`, a rendered view, and `.arc/completed/README.md`, an
  installed guide.
- **Reported:** everything else, even though the flip's deletion commit removes it too, a file that fails the read rule
  among them, which C7 refuses before the import.

The list is the definition, so this catches a class of omission rather than known instances. The window runs `account`
over its own import and stops on any reported file; a superseded one stops nothing.

#### 10.3 The chain comparison

The import replays each Candidate record's versions from the plain path log today's chain reader walks
(`readImportCandidateVersions`, `lib/store/ref/import/candidate.ts`; the reader,
`readRepositoryCandidateSupersessionChain`, `lib/store/kinds/review/candidate/history.ts`). It does so because the
in-repo `history` follows renames and drops a version a merge commit introduced.

Today's reader refuses some records outright: at a broken chain link (`resolveCandidateSupersessionAncestors`,
`lib/work-unit/candidate-attestation.ts`), or for failing today's Candidate schema before any chain walk
(`readCandidateRecordVersioned`, `lib/store/kinds/review/candidate/access.ts`). The import stops on neither:

- For a work unit no longer live — archived, abandoned, or cut — it carries the record's versions as found, parsed and
  re-serialized in canonical form (`prepareImportContent`, `lib/store/ref/import/build.ts`), and lists a chain today's
  reader refuses in its report's `brokenChains` (`inspectCandidateChain`, `lib/store/ref/import/review.ts`).
- For a live work unit, the review mapping replays each version today's reader accepts and leaves each refused version
  behind, listing it in the report's `reviewMapping` with its reason (`candidateRevisionReason`,
  `lib/store/kinds/review/mapping-candidates.ts`).

`chain` reads every Candidate record's supersession chain twice through today's reader
(`readRepositoryCandidateSupersessionChain`): over the repository, at the revision the import read, and with the
imported store (`createRefStore`, `lib/store/create.ts`), whose `capabilities.stateOffBranch` hands the walk to
`readStoredCandidateSupersessionChain` (`lib/store/kinds/review/candidate/stored-history.ts`). Each walk returns the
chain's links, newest first, without the current record (`CandidateSupersessionAncestor`,
`lib/work-unit/candidate-attestation.ts`). The two must agree link for link, in every field but `recordRevision`, which
names a commit on one side and a store version on the other, and in the record each link's revision holds, as parsed
JSON in canonical form, so the import's re-serialization is no difference. The current records must agree the same way.
A record may differ only by what the import's report lists for it: a version left behind, or a chain listed as broken.
`chain` lists those differences and stops on no other. It also checks that a Candidate's supersession is its singleton
record's `history`:

- a live work unit's replayed versions arrive mapped, with their transitions whole;
- those of a work unit no longer live arrive as found.

The window runs `chain` over its own import, with the import's `--json` report, and stops on any difference the report
does not list.

### 11. Transition invariants

For each transition the window makes that these tools observe:

- **From the import to the flip's merge.**
    - _Preserved:_ every record the import took equals what tracked state, the review gate, and the Errand identity refs
      held when the check recorded; each personal record equals what its checkout's files held at their recorded
      digest; the merged head differs from the recorded flip head only by its deletion commit.
    - _Enforced:_ by the check (§ 2.2), the import's own refusals and leases (§ 2.3, § 3), and `recompute` and
      `last-read` (§ 5.1, § 5.2), each stopping through `restore`.
    - _Proved:_ by the tests in Success Criterion 2, and by Stage 1's first-run abort (§ 9.3) and second-run last read
      (§ 9.4).
- **The host boundary.**
    - _Preserved:_ between the check and the merge, `main` changes on the host only by the flip's merge, and no live
      branch changes there.
    - _Enforced:_ by C10, C11, and C13, by `recompute`'s and `last-read`'s host reads, by refusing auto-merge on the
      flip's pull request, and by the merged-flip test in `restore` and `close`, which refuses where the host could
      squash or rebase.
    - _Proved:_ by Stage 1's second-run last read and stand-in merge.
- **Errand records crossing.**
    - _Preserved:_ no Errand record crosses the window, every claim the identity refs hold crosses it or stops it, and
      an abort rewinds no record another writer added unseen.
    - _Enforced:_ by C12, which also holds each identity ref `origin` holds at the local tip, `recompute`'s read of the
      landed store for the interval before the import reads the identity refs and its check that no identity ref
      remains, the restore's comparison of what the import consumed (§ 3, § 6.1), the import's landing lease, and the
      sealing guard on the Errand writers.
    - _Proved:_ by Stage 1's planted Errand and its retirement check (§ 9.2, step 9), and by the restore's tests in
      Success Criterion 3.
- **Order independence, this unit's share.**
    - _Preserved:_ no live work unit's copy is dropped in favor of one it diverges from.
    - _Enforced:_ by C8.
    - _Proved:_ by Stage 1's planted diverging copy.
- **Late changes after the merge.**
    - _Preserved:_ a change to a live branch or a personal file after the check, made before that branch's or
      checkout's `compare`, is never deleted unseen; one made after it and before that branch's or checkout's steps is
      a residual (§ 5.4).
    - _Enforced:_ by `compare`'s marks and digest answers, and by `close`'s refusal until every recorded live branch
      is marked and each range is confirmed at its mark.
    - _Proved:_ by Stage 1's second run (§ 9.4).

### 12. ADR dispositions

- **Covered by ADR-035** (Accepted): the window these tools serve, "a quiesce → import → flip window, rehearsed first",
  at "a single cutover per repository".
- **`none`, temporary.** These are one-time window machinery, deleted after the window with the window's other
  leftovers, or with the in-repo composition for the provenance field:
    - the check and each of its refusals;
    - the record and the hold with its completion marker;
    - the recompute, the last read, the after-merge comparisons, confirmation, and the close;
    - the restore and its refusals;
    - the lock step;
    - the provenance field;
    - Stage 1 with its plants and stand-ins, the copy driver and copy safety, the accounting case, and the chain
      comparison.
- **`none`, tactical:** the seal on `arc user load` extends the sealing guard's existing decision to the one notes
  writer it missed.
- **`none`, not this unit's decision:** the check's refusal of an unlanded staged cut follows
  `spec-seam-decomposition.md` § 18. Its refusal of a diverging copy follows the flip's order-independence invariant.

### 13. What this unit adds, and what removes it

| Addition                                               | Shipped | Removed by                                                             |
| ------------------------------------------------------ | ------- | ---------------------------------------------------------------------- |
| The script family and its tests                        | No      | `cutover-tracked-state-removal`, with the window's other leftovers     |
| The hold under `refs/arc-window/`                      | No      | `close` at the window's end; any remainder with the window's leftovers |
| The provenance field on `ComposedLifecycleIndexResult` | Yes     | `cutover-in-repo-removal`, with the in-repo composition                |
| The guard call in `runUserLoad` and its suite case     | Yes     | `cutover-notes-removal`, with the notes commands                       |

## Alternatives & Rationale

- **Check, then import at once, with the import's comparisons as the witness, plus the sealing guard.** The rejected
  alternative was fencing every writer for the window's length. The import already refuses a notes file whose disk
  copy differs from its saved copy, an in-flight review attempt, and an unmapped review source, and it leases the Errand
  identity refs. So a check run immediately before it, with a recompute after it, closes the interval at the cost of one
  script. A writer fence would need every pre-flip writer to consult a new lock, a change to shipped code across many
  paths for a one-time event.
- **A refusing check rather than a report.** The quiesce plan is built from the refusals, and each condition is a way
  state can cross the window unseen. A report would leave each one to the operator's reading. Unmarked checkouts (C2)
  refuse rather than being listed for the same reason: the import reads every registered checkout's personal files
  (`readImportPersonalDisk`), so an unmarked checkout's files are window inputs no work unit or Errand claims.
- **Provenance on the composition's result, not a parallel composition in the script.** The script could compose the
  lower layer itself through a shared helper. That changes more shipped code and can drift from the import's call. One
  optional field read from the import's own call cannot drift.
- **The hold as refs under `refs/arc-window/`.** A bundle file or a copy of the repository would need its own
  restore path and would not keep objects reachable for `gc`. Refs outside `refs/arc/` keep every tip reachable, are
  invisible to the import and to store pushes, and are deleted with one namespace.
- **The completion marker last on write and first on deletion.** The restore and the close then never act on a
  complete marker over missing refs, and every partial state has one safe remedy.
- **Confirmation bound to the compared tip.** A confirmation that named only the branch would survive a further move of
  that branch. Taking the exact tip, and refusing a mark that has moved since, makes any later move unconfirmed again.
- **The restore leased on what the window left.** A lease on the tip just listed guards only the moment before the
  push. The values the window left on `origin` are all known from the hold, the tracking refs, and the local refs, so
  a lease on them refuses any other writer's change, and the Owner's accepted value keeps the restore finishable.
- **Consumed identity refs judged by the import's own evidence.** The window leaves an identity ref the import consumed
  absent whichever tip it read, so a lease on absence cannot tell another writer's tip from the held one. Holding the
  consumed tip itself would need the import to hand it over before it drops its kept tips, a change to shipped code. The
  kept tips, and the landed records once they are dropped, already carry what the comparison needs, and recording its
  outcome under the hold keeps a restarted restore from reading evidence its own steps removed.
- **Two rehearsal stages.** One dress rehearsal could not start until the flip change builds, which would put every
  step's first run close to the window. The window's mechanics need neither the flip change nor the projection
  changes, so they rehearse first.
- **Repository scripts, not CLI verbs.** The tools run once, on one repository, and are deleted after. A verb would
  ship them to every project and carry help text, schemas, and tests the shipped surface keeps.
- **Accounting through the in-repo store's own discovery.** A path pattern in the tool would restate the store's claim
  rules and could disagree with them. That is the class of error the case exists to catch.
- **Boundary: one work unit.** The parts land together, Stage 1 verifies them together, and the window runs them once.
  The forecast change set is about 2,000 to 5,000 lines, under every size mark. No part is independently landable to
  any purpose, so there is no delivery-plan candidate.

## Cross-cutting Considerations

### Security and privacy

The import publishes this repository's personal state to a public `origin` for good. The restore removes the published
refs, but an abort does not unpublish, since anything pushed may already have been copied. The tools add no
publication of their own. The hold is never pushed. The rehearsal reads the host to build the mirror, and copy safety
(§ 9.1) keeps every later rehearsal write inside the copy and its mirror. The restore leases each push to `origin` on
the value the window left there, and checks each local ref the window never writes against its held tip, so it refuses
rather than overwrite or delete a ref another writer moved, until the Owner names that value to accept (§ 6.1).

### Performance

The check's cost is dominated by the lifecycle composition, one freshness check per checkout, and its reads of the host:
the fetch of `origin`'s `refs/arc/*`, the pull-request reads, the flip's auto-merge state among them, the host's merge
settings, and one `git ls-remote`. The digests read each worktree's personal files and the review gate's
files once. The import's time and peak memory are measured in Stage 1, under a
6 GB address-space cap with Node's heap ceiling below it.

### Testing

Each refusal, operation, and assertion has a test that shows the refusal, its remedy, and the run continuing. The tests
run over temporary repositories with linked worktrees, a local bare repository standing in for `origin`, and a supplied
pull-request listing; none touches the host. The seal on `arc user load` is tested in the sealing guard's suite.
Stage 1 is the end-to-end verification over this repository's real state.

### Compatibility and migration

Nothing ships except the optional field, which no caller reads, and the load guard, which is inert until the registry
ref exists. No configuration, schema, or persisted format changes.

### Rollout

The change lands on `main` ahead of the window with Stage 1 clean at the landing head. Nothing runs it until a rehearsal
stage or the window does.

## Success Criteria

1. **Each refusal is tested.** For each of C1 to C13, a test shows the check refusing and naming its subject, the remedy
   applied, and the check passing. Further tests show a refusing run leaving nothing under `refs/arc-window/`, a run
   killed while recording leaving a hold without a completion marker, and C9 refusing both an incomplete hold and a
   complete one. C6's tests also show the anchor derived from `main`'s history, a supplied anchor accepted where the
   repository has no host and refused anywhere else, and an `arc` on `PATH` outside every checkout refused. C1's include
   an ignored file under the tracked-state paths, a personal link, and a stash entry changing a file there. C7's include
   a branch that changes a work unit's records without being its read copy, a branch that only deletes another unit's
   record, a branch carrying a stale copy that changes that unit's records, a live unit's record `main` changed after
   its read copy forked, a live unit's file `main` deleted while its read copy still holds it, and a branch cut from
   `main` after a park that deletes the pointer, each refused. They also include a stale-copy branch that only inherits
   its unit's changes, a branch that merged `main` after that change on `main`, and a resumed unit's pointer deleted on
   `main`, each passing. A unit parked after its branch forked passes at `main`, at its branch's local and fetched tips,
   and at a branch forked from that branch after graduation, while a `main` edit to its backlog draft after the fork
   refuses, then passes once C7's remedy merges `main` into the parked branch, keeping the branch's side at the pointer
   path and the meta. The parked unit is built as the repository builds one: a stub on `main`, graduated on its branch,
   then parked. C10's show a flip branch equal to `main` refused. C11's show a pull request into a live branch,
   auto-merge on the flip's own, and a host that allows squash or rebase merging refused. C12's show an identity ref
   whose local and `origin` tips differ, one only on `origin`, and a claim held by an identity other than the configured
   one refused, and one held only locally passing. C13's show a live branch whose fetched tip differs from its tip on
   the host. The check, `last-read`, and `restore` each refuse a supplied pull-request listing where a remote URL names
   a host, before any host read.
2. **The comparisons are tested.**
    - `recompute` stops on a changed worktree head, personal digest, or review-gate digest, a dirty working tree, an
      ignored file under the tracked-state paths, a stash entry changing one, a changed local, fetched, or host branch
      tip, a new branch, a moved host `main`, a landed `work-item/record`, a landed claim the held identity refs do not
      give, or an identity ref remaining locally or on `origin`, and passes on none.
    - `last-read` passes with the flip's head plus one deletion-only commit, and stops on a second commit, a
      modification, an addition, a deletion outside the tracked-state paths, a moved host `main`, or auto-merge armed
      on the flip's pull request.
    - `compare` marks every recorded side, records a moved range from a host tip whose commit it fetches, a gone side,
      and an unrecorded branch, and reports a changed digest, without stopping.
    - `confirm` refuses an unknown branch and a tip that differs from the side's current mark.
    - `close` refuses before the merge and recognizes a host merge whose commit is not local. It refuses over a tracked
      file, an unmarked live branch, an unmarked unrecorded branch that tracks state, an unconfirmed range, and a range
      moved after its confirmation, then deletes the whole hold once all clear.
3. **The restore is tested.** Run before and after publication, against a local bare `origin`, it returns every recorded
   ref on both sides and deletes every other `refs/arc/*` ref and every unrecorded tracking ref. It removes all three
   store directories, unsets the designation, and deletes the hold. Restarted after stopping at each step, it finishes.
   It refuses an incomplete hold, a merged flip, including one whose merge commit is not local, auto-merge armed on the
   flip's pull request, a host that allows squash or rebase merging, and an unreadable host. A merge landed on `origin`
   after its first test refuses before the registry ref is deleted, leaving the local store whole. It refuses an
   `origin` ref another writer moved or deleted, a non-store ref on `origin` among them whose tip equals the local one,
   and a local Errand identity ref, or a local ref the window never writes, an Errand's temporary ref among them, that
   another writer moved, naming each, and finishes once that value, a tip or absence, is accepted. It refuses an
   identity ref advanced and pushed between the check and the import's read: where the window stops at `account` after
   the import dropped its kept tips, printing each differing record, until `<ref>=absent` is accepted; and where the
   import stopped after landing, before retiring `origin`'s copy, until `<ref>=<kept tip>` is accepted. With kept tips
   and no landing it compares nothing consumed: an identity ref at its held tip passes, and one another writer advanced
   or deleted refuses until its value is accepted. With no kept tips and no landing, after no import or one refused
   before keeping a tip, an identity ref holding a claim at its held tip passes, with no comparison. Restarted after its
   first write, it finishes on its recorded comparison without comparing again.
4. **The lock step and copy safety are tested.** `lock` locks each unlocked marked checkout with the projection's
   reason and touches no other. Each copy-safety assertion fails on a copy that violates it and stops the stage.
5. **The load seal is tested.** In the sealing guard's suite, `runUserLoad` refuses once the registry ref exists,
   writing no file, and loads once it is gone. Both `arc user load` and the user-sync load direction end with the
   store-imported refusal's condition and remedy and a non-zero exit, writing no file.
6. **Stage 1's first run is clean** at the head that lands. Each planted condition refuses, naming its checkout,
   branch, work unit, Errand, or pull request, then passes after its remedy, the lock step's included. Case 1 refuses
   with nothing landed. Then:
    - the import publishes to the mirror;
    - the sealing guard refuses in every copied checkout;
    - the Errand identity refs are gone from the copy and the mirror, the kept tips dropped;
    - the accounting case reports exactly the files of the twenty pre-meta folders and the quarter's atomic record the
      backfill split, listing `main`'s superseded copies apart;
    - the chain comparison gives the same chain for every Candidate record, or a difference the import's report lists;
    - `close` refuses, since the stand-in flip has not merged;
    - `recompute` refuses the planted commit, and `restore` returns every recorded ref on the copy and the mirror,
      removes every other, lifts the guard, and deletes the hold.
7. **Stage 1's second run is clean** at the same head. The aborted copy passes the check and imports again; the
   accounting case reports no file unplaced, listing `main`'s superseded copies apart; the chain comparison holds.
   Then:
    - `last-read` refuses a moved mirror `main` and passes once it is put back;
    - after the stand-in merge, made outside the copy, `restore` refuses;
    - `compare` marks every live branch, records the planted branch commit's range, and reports the edited digest,
      neither stopping;
    - `close` refuses, naming each copied checkout that still tracks state.
8. **The import's cost is recorded.** Its wall time and peak resident memory under the cap are recorded from both
   runs.
9. **It lands inert.** The package's `files` list and the install recipe name none of the scripts. The built bundle's
   metafile names no input from `src/scripts/cutover-window/`. No existing caller reads the provenance field, and no existing
   constructor of the composition's result changed. The full unit, integration, and end-to-end tiers pass with the
   load guard present.

## Open Questions

None.

## Amendments

None.

---
