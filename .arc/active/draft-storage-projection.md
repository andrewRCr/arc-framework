# Draft: Storage Projection

- **Origin:** [internal] — the `state-storage` re-cut (2026-09-28); stage 2 of the storage program.
- **Purpose:** Build the working copy: the store projected as ordinary, whole, human-readable files at the familiar
  `.arc/` paths, opened by name and searchable in whatever editor a person uses, with the caller-visible behavior
  `storage-contract` defines (its D13, with D10's serialization rules and D17's worktree lock).

---

## Continuity

- **Readiness:** adversarial review done. The entry read, boundary, and engine are settled, prior art is aligned, every
  spike is folded in, every inbound entry is dispositioned, and § Open is empty; the design proportionality, draft
  readiness, and source-grounding checks ran at loop exit. Adversarial pass 1 found thirteen gaps, its fix check eleven,
  pass 2 fourteen, and pass 2's four fix-check rounds twelve, eight, eight, and five, all folded in below; the review
  stopped after the fourth round, its repairs covered by a coherence re-read (`ADVERSARIAL-PASSES.md`). After capture it
  stays in draft-design: the spec consumes interfaces `seam-lifecycle` and `seam-locus` design — the checkout removal
  function with its removal check and persist step, and the parser and write-check slots — and their drafts have not
  settled.
- **Pass 1 (2026-10-09).** `storage-contract` has shipped (archived under `completed/2026-q4/`), so this draft inherits
  its D13 rather than designing alongside it. Read: the contract's spec (D1, D5, D7, D10, D13–D17) and notes (§ Who
  builds Part B, § Seam ordering, § Evidence behind Part B); `analysis-storage-substrate-direction.md` § 6.4–6.10 and §
  11.2, 11.5; the September spike records; `storage-seam`'s draft at `37e25bdf7`, and its § Shared decisions item 11 at
  `fa535c6da`. A three-facet external research pass (jj's working copy; Git's index and sync tools; Node building blocks
  and file-protection idioms) set the prior-art alignment below. It was unverified research: the claims it carries were
  re-checked at source grounding or in the spikes. The spikes and the tripwire timings ran the same day (§ Spikes).
- **Next:** the capture, which leaves this work unit in draft-design. On return, once `seam-lifecycle`'s and
  `seam-locus`'s drafts settle, refresh this draft against them and against whatever has landed, then `create-spec`.

## Problem / Motivation

At the flip, state leaves tracked branch files and Git notes for the store (ADR-035). People and agents still need
every artifact as a plain Markdown file they open by name and search in place — the contract makes direct file access
the requirement (D13), with `arc view` and status surfaces supplementing it, never replacing it. Something has to
write the store out as files in every worktree, notice hand edits, persist them without losing a concurrent edit, keep
every worktree's copy current, and refuse cleanly where an edit is not allowed. That is the projection. Without it the
flip cannot happen: the store would hold state nobody can browse or edit.

The contract settled the projection's caller-visible behavior so this work, the ref backend, and the rerouting could
run in parallel. What it left to this work unit is the mechanism inside: how edits are detected cheaply on every
command, how a refresh avoids clobbering a save, how state is tracked per worktree, how files the store does not know
are adopted, and how it all holds on Windows. A defect here is silent data loss, so rigor concentrates on the write
paths; refresh is retryable and takes lighter handling.

## Scope

What this work unit builds, each to the contract's text:

- **Materialization and persistence** (D13): projection into every worktree; base stamps; write-back at the start of
  every `arc` command and `arc save`, merged against each file's base — line merge for prose, entry merge for the inbox
  and working memory; writer-pushed refresh of every worktree's copy on the machine, `in-flight/` views included; and
  `arc sync` rebuilding deleted files.
- **Serialization rules at persist** (D10): text only, a size cap of about 1 MB, `.env` and private-key files refused —
  each a typed refusal, never a skip.
- **Edit rights, protected files, and conflicts** (D13): the edit-rights rule by lifecycle state and kind, the
  three-layer protected-file notice, conflicts shown in the file with parse-back at persist, and a whole-record
  conflict's notice line.
- **Files the store does not know** (D13; analysis § 6.10): adoption into the owning folder, an ownerless file flagged
  in `arc status`, and the identity-root rule naming `scratch/`; plus creating the checkout's
  `scratch/work-unit/<slug>/` (D5).
- **The `active/` layout** (D13): `active/current/` and `active/in-flight/<slug>/`, the cohort companion in
  `current/`, the revert setting, and the rewritten isolation invariant with its acceptance test.
- **The ignore strategy** (D13): `.git/info/exclude` for the shared surfaces, written once per clone at first
  projection from a path list `.arc/system/` paths can join; `.arc/user/*/` kept in `.gitignore`, with a guard that
  every projected path stays ignored; a tracked root `.ignore` re-including all four roots for the ripgrep family; this
  repository's `.gitignore` no longer ignoring `.ignore`; the Zed setting printed by `arc init`; and the opt-in
  per-editor settings command.
- **Worktrees** (D13, D17): the worktree lock on every checkout ARC spawns for a work unit or an Errand, with the
  removals printed or documented rather than run rewritten before it lands; teardown persisting first and refusing while
  a file is unadopted, held by a conflict, failing to parse, or holding a refused edit — the persist step the seam's
  removal function runs before ARC removes a work unit's or Errand's checkout, spawn rollbacks aside, and the removal
  check's projection part, which reports such a refusal beforehand; and every worktree's own copy of the user surfaces,
  which retires their primary-worktree rooting and its migration at the flip.
- **Windows** (D13; analysis § 6.10): close before replacing, bounded retry while a holder refuses, a re-check that
  sees a same-size save, bigint stats, CRLF normalized to LF, batched Git calls, and the Windows portability lane.
- **More than one source** (D13): the store now, the package later, and read-only copies.

## Success signal

Over the reference backend, with real repositories and worktrees on disk, on Linux and in the portability lane (Windows
and macOS):

- A hand edit in any worktree, saved in place, by renaming a new file over it, or by an agent's write, reaches the store
  at the next `arc` command and every other worktree's copy at the writer's fan-out. No save made in those ways is lost
  or overwritten, saves timed into a refresh or a removal included; the accepted residuals — a write through a handle
  held open across a replacement, a save to a file other than Markdown that exactly restores the version an unfinished
  replacement replaces, a save landing between a checkout's persist step and its removal, a removal forced past the lock
  with `git worktree remove -f -f`, and another tool's removal of an unlocked `--here` checkout — are named under §
  Unknowns.
- A clash shows as a conflict in the file and persists once resolved; an edit to a protected or archived file is
  refused and kept, never dropped, and teardown refuses while one remains.
- The no-change overhead stays within 10 ms on Linux and 60 ms on Windows, and no tripwire fires at this repository's
  size.

## Decisions

### Class, depth, and boundary

- **`Class`: `Heavy`** (estimate was `Light`). Both triggers fire. Derivation: D13 fixes the caller-visible behavior
  but not the engine — change detection, per-worktree state, the replace guard, adoption, and the Windows mechanics
  must be designed before a competent engineer starts. Scale: write-back and refresh run at the start of every `arc`
  command and fan out to every worktree on the machine, and the worktree lock meets every site that removes or moves a
  projected checkout (§ The worktree lock). Not `Novel`: the design composes from D13, the September spikes, the
  shipped concurrency library, and established prior art (§ Engine).
- **Depth: `high`.** Multi-session, with spikes feeding the design.
- **Boundary: stays one WU.** The engine, the ignore strategy, the worktree lock and removal guards, the `active/`
  layout, and retiring the user-surface rooting all hang off one engine and are designed as a whole. No delivery-plan
  candidate: the cohort lands every program work unit single-branch with chunked review (`cohort-state-storage.md` §
  Soft coordination), and only three pieces here run before the flip — the worktree lock, the tracked root `.ignore`,
  and this repository's `.gitignore` entry (§ Dark until the flip). The work unit lands after `seam-lifecycle` and
  `seam-locus`, on which it depends (§ The worktree lock).

### Inherit D13, never re-author it

The cohort's shared contract makes the projection's caller-visible behavior `storage-contract`'s, built here. Where this
design finds D13 wrong, the fix is a forward amendment to the contract's spec, named as such — never a quiet redesign in
this draft. Owned register rows: checkout-removal guards, user-surface rooting and its migration (handed to
`storage-cutover`'s deletion pass at this draft's capture, § Coordination item 3), the per-worktree `active/` isolation
invariant and its acceptance test, and this repository's `.gitignore` entry for `.ignore`; plus
`parallel-surface-access`, which retires into this work unit.

### Dark until the flip, and how it is verified

The projection keys on the contract's one capability — whether state lives off the checkout's branch (D1, D15).
Over the in-repo implementation, which answers no, the tracked files are the store and the projection does nothing,
so nothing in this repository exercises it before the flip.

- **Gate here:** unit and integration tests over the reference backend — test-only, in-memory, capability yes (D7) —
  with real temporary repositories and worktrees on disk.
- **Multi-process lane:** the burst cases the September spikes ran (twenty worktrees, concurrent saves and drains)
  need a store several processes share, which the in-memory reference backend is not. That lane joins once
  `storage-ref-backend` lands (§ Coordination).
- **Live rehearsal:** `storage-cutover`'s rehearsal before the flip.
- Store and projection tests run in the portability lane, which runs Windows and macOS (D13).

Not everything waits on the capability. Three pieces carry no store dependency and can run live before the flip: the
worktree lock, the tracked root `.ignore`, and dropping this repository's `.gitignore` entry for `.ignore`. D17 does
not key the lock on the capability, and today's gitignored `SESSION-NOTES` already need it: no ARC code locks a
worktree yet, and a plain `git worktree remove` deletes ignored files without asking (checked on Git 2.55). Everything
else branches on the capability.

### The worktree lock

D17's lock goes on every linked checkout ARC spawns for a work unit or an Errand, as the spawn's last step, once its
ownership marker (`worktree-marker.json`, `lib/git/worktree-marker.ts`) names that work unit or Errand; no shipped code
spawns a checkout for a grooming or housekeeping claim (`provisionTransientLocus` is reached only from `arc errand open`
and `arc errand materialize`, both for an Errand). The rule keys on the spawn, never on the capability, so it holds
before the flip as after. A checkout claimed in place with `arc start --here` is not ARC's spawn and is not locked,
since another tool may own and remove it: today it gets no marker (`writeWorktreeOwnershipMarker` writes none when
`createdByArc` is false), D17 has it write one from the flip, which gives it a projection (§ State and change
detection), and teardown removes it through the removal function as it does a spawned one
(`lib/work-unit/verbs/teardown.ts`). Every such lock carries one reason naming the exits of both kinds — `arc teardown`
for a work unit's checkout, and `arc errand close`, `abandon`, or `leave` for an Errand's — since Git prints the reason
in its refusal ("cannot remove a locked working tree, lock reason: …", checked on Git 2.55). One reason for both lets
promotion, which rewrites a spawned Errand's marker to its work unit's (`convertSpawnedMarker`,
`lib/errand/promote-runtime.ts`), leave the lock alone, as it must: `git worktree lock` refuses a worktree already
locked (checked on Git 2.55). The reason names no slug, so a rename leaves it true. Spawn rollbacks —
`rollbackSpawnedWorktree` in `commands/start.ts`, `atomic-graduation.ts`, `reconcile-work-unit-worktree.ts`'s
fresh-spawn rollback, and the transient claim's `rollbackSpawned` in `lib/locus/provisioning-runtime.ts` — remove with
one `--force` or none, either of which a lock refuses, so the lock waits until the spawn has succeeded. A checkout ARC
creates for its own machinery carries no such marker — review-gate materializations, base sync's managed checkout, and
the delivery-refresh and review-fix worktrees have none, and a decomposition worktree's names a branch — so it gets
neither a lock nor an index (§ State and change detection) and is removed as today (a narrowing of D13 and D17, §
Proposed D13 amendments).

Every removal ARC runs of a checkout it locks runs the seam's removal function — the removal check, this work unit's
persist step, unlock, remove (§ Coordination, item 2) — so ARC removes a locked checkout only that way; a person removes
one through the exits, after `git worktree unlock` (below), or by forcing past the lock with
`git worktree remove -f -f`, which D17 allows and Git's refusal suggests, and which skips the persist step (§ Unknowns);
and every move keeps the lock. Git refuses to move a locked worktree with no `-f` or one, and `git worktree move -f -f`
moves it and keeps the lock and its reason in one step (checked on Git 2.55). Every move of a projected checkout that
ARC runs or prints takes that form: `arc rename`'s move (`reconcileWorkUnitWorktree`), the follow-up it prints for a
rename run from inside the worktree (`handlers/lifecycle.ts`), the follow-up its occupied-move fallback prints, and the
residue sweep's remedy (`projectRenameMoveRemedy`), whose argv session-init's workflow has the agent run as given. The
two `-f`s also let a move land on a path registered to a missing or locked worktree, an accepted edge. A checkout whose
folder was deleted by hand keeps its locked registration, which `git worktree prune` skips and which refuses a new
checkout at that path ("is a missing but locked worktree", checked on Git 2.55): the removal function, finding the
folder missing, skips the removal check and the persist step, unlocks, and prunes it, and session-init's stale-worktree
sweep reports such a registration with that remedy (§ Coordination, item 2).

The lock lands live, before the flip, and lands last. The seam builds the removal function and its removal check, moves
every removal of such a checkout onto the function and every decision to remove one onto the check, and makes every move
keep the lock; this work unit depends on `seam-lifecycle` and `seam-locus`, fills the removal check's projection part
and the function's persist step, and lands the lock after them (§ Coordination, item 2). With the lock it rewrites the
removals that are printed or documented rather than run, since the seam changes no workflow text before the flip:
session-init's stale-worktree offer of a plain `git worktree remove` for a removable worktree (`session-init.md`)
becomes `arc teardown <name>`, run from a command line `seam-locus` adds to the sweep's report, which carries only the
path and branch (`stale-worktree-sweep.ts`), as the offer already names `arc teardown` for a husk; branch-gone
recovery's prompt to remove a shipped worktree (`recommended-action.ts`), which names no command and which
`session-init.md` has the agent act on, runs the `arc teardown <name>` command line `seam-locus` adds to its candidate;
a husk no verb covers, left there to manual cleanup, is removed by hand after `arc user save` and `git worktree unlock`,
the flip's workflow rewrite naming `arc save` in its place; and `strategy-concurrent-work.md`'s instructions to remove a
worktree with `git worktree remove` and to recover a deleted folder with `git worktree prune` name the exit verbs, the
lock, unlocking before a prune, and that forcing past the lock skips the persist step. Landed any earlier, teardown's
plain `git worktree remove` (`reconcile-work-unit-worktree.ts`), the Errand close's
(`lib/errand/terminal-occupancy.ts`), and the moves would each refuse on every locked worktree. No code backfills it:
under the pre-public-release posture (`DEV-RULES.PROJECT` § Engineering Standards) this repository's existing worktrees
take a one-off `git worktree lock` at landing, or the lock as they are respawned.

### Engine: hand-rolled, aligned with prior art

No library projects a versioned store into editable files with three-way write-back; the general sync tools (Unison,
Mutagen, Syncthing) are whole programs, not embeddable components. The library-shaped parts already exist in the CLI:
three-way and entry merge (`lib/store/concurrency/`, over `node-diff3`), atomic replace for the index (`atomicWriteFile`
in `lib/fs.ts`), bounded retry on `EPERM`, `EBUSY`, and `EACCES` (`retryTransientFileSystemRefusal` in
`lib/kernel/fs-retry.ts`), and locks (`lib/advisory-lock.ts`). The engine is the orchestration over them.

The model is jj's working copy: snapshot at the start of every command, a stat fast path backed by a per-worktree state
file, and conflicts written into files as markers and parsed back at the next snapshot. The specifics below are grouped
by concern.

**One command, in order.** A command takes its worktree's projection lock, sweeps the aside folder, writes back pending
edits — each settled, parsed, checked, and merged — and refreshes its pending files and what the store changed since the
index's state version; then it releases the lock and runs. Each write fans out as soon as it lands, inside the write
path: the writer refreshes every worktree on the machine that holds a projection, its own included, taking each one's
lock in turn and bringing each up from that worktree's own state version, never only its own write. At the command's end
it takes each lock again for the second check of its aside copies. The start runs from the root `preAction` hook
`cli.ts` already registers on the program for every command, and the end from its root `postAction`, which Commander
skips when an action fails: the end's second check is best-effort, and the sweep takes over the copies it leaves (§
Replacing a file, the aside folder). The skip switch bypasses all of it.

#### State and change detection

- **Per-worktree index**, after jj's `tree_state` and Git's index: per projected file its type, size, modification time,
  the blob id written (as chezmoi records a hash per write), whether it holds conflict markers and their length, whether
  it is protected, its file identity, a pending mark on a file a refresh skipped, what its last persisted write-back
  read — the stamp and the content taken in — and, for a file other than Markdown, the version a replacement in progress
  replaces; plus the state version last projected, the in-flight view setting and identity it was projected under, and
  the recent tripwire measurements. A worktree holds a projection when it holds an index, and gets one when it is the
  primary or its ownership marker names a work unit or a transient claim (§ The worktree lock) — a checkout claimed with
  `arc start --here` included, which D17 has write the marker from the flip — at spawn, or at its first `arc` command.
  Any other checkout — ARC's machinery, a hand-made worktree nothing has claimed — gets none, and `arc` runs there with
  the projection off; the skip switch is the escape hatch, not what keeps machinery out. Machine-local, under the
  worktree's own Git directory, registered in `MACHINE_LOCAL_PATHS` under the per-worktree Git-directory root the seam
  adds, never stored or synced. Written by temp-and-rename under the projection lock and re-read after the lock is
  taken, as jj does.
- **The projection lock** is a per-worktree advisory lock (`lib/advisory-lock.ts`) in the worktree's own Git directory,
  distinct from D17's worktree lock, which only blocks removal. A command holds one at a time, so two writers fanning
  out cannot deadlock: its own across its write-back and refresh, then each sibling worktree's in turn while replacing
  files there, and none across the rest of the command. A writer takes a sibling's lock only while that worktree's Git
  directory exists, never creating it, and skips a worktree removed while it waited.
- **Change detection: Git's racy rule.** A stat match means clean only when the file's modification time is older than
  the index's reference time; otherwise the content is hashed and compared. The reference is a stamp file in the aside
  folder, rewritten after each index write, so it shares the projected files' volume and clock even where a linked
  worktree's Git directory sits on another; a missing stamp makes every entry racy. Every index write smudges each entry
  it carries over unchanged that is racy against the reference it replaces — its cached size zeroed, so the next check
  hashes it — after Git's index write (`ce_smudge_racily_clean_entry`), which hashes first and smudges only a changed
  entry; the entries a write records are racy against the new reference instead. Without the smudge a later write, a
  sibling's fan-out among them, would make the entry read clean and hide a same-tick save. A command that hashes a
  smudged entry clean re-records its stats, writing the index. A same-size save inside one tick needs the rule on every
  platform: modification times advanced every 0.33–0.55 ms on NTFS and every 10 ms on this Linux kernel, and in spike 2
  a stat comparison alone missed 987 of 1,000 immediate rewrites on Linux and 582 on Windows, where the racy rule missed
  none. File identity — the inode, or Windows' file ID — is compared as a bigint (D13), as Git compares the inode on
  Linux: a changed identity sends the file to the hash, which catches a replacement that keeps its size and an older
  modification time (`cp -p`, `tar x`, a restored backup), while an unchanged one never proves the file unchanged, since
  freed numbers recur on Linux (spike 3). The swap's hard link keeps the staged file's identity, which the index
  records. Every stat is read as a bigint. The index and its reference are written before the staged file is put in
  place, so a save can only follow them, and one in the file's tick falls in the reference's tick too and reads racy. In
  the other order a save between the replacement and the index write read clean: spike 1 lost 8 of 4,000 on Linux and 40
  on Windows that way, and none with the order reversed. A stop between the two leaves the old file, which equals its
  own stamped base, so write-back finds no edit and the next refresh replaces it.
- **Blob ids** computed with `node:crypto` over the content as stored — LF-normalized, with the base stamp and any
  notice line stripped, since the stored record carries neither — as `blob <length>\0` plus the bytes, never by spawning
  Git per file. Line endings are normalized on read (D13).
- **Base-stamp recovery** (D13's content heuristic), for a stamp deleted as noise or dropped by a whole-file rewrite.
  Content that, stamp aside, equals a version exactly — the index's recorded version first, then `history` newest first
  — takes that version as its base. Otherwise the base is the closest by line diff among the index's version, the
  content the file's last persisted write-back took in (below, a stale buffer's save), and a bounded window of the
  newest versions, that content and then the newer version winning a tie, so a stale buffer that lost its stamp still
  merges from its own last save; the window reaches past the index's version because an editor's old buffer saved over a
  refresh would otherwise merge against the refresh and undo another writer's changes. Content sharing nothing with any
  version merges against an empty base, as Git treats a file both sides added, so clashes become conflicts and nothing
  is lost. Write-back restores the stamp.
- **A stale buffer's save.** Zed reloads no file changed on disk and saves over it without asking (spike 1b; analysis §
  6.5), so after a write-back its buffer keeps the stamp the write-back read, and its next save would merge against a
  base older than the person's own persisted edit, putting back text they had since removed. A save that carries the
  stamp the file's last persisted write-back read — one whose content reached the store, by fast-forward or a clean
  merge, while a refused, skipped, or conflicted write-back leaves the record as it was — therefore merges from the
  content that write-back took in, not from the stamp's version: the version it wrote when it fast-forwarded, and
  otherwise a copy kept beside the index until a write-back reads a newer stamp. A sibling's refresh in between changes
  nothing — the base stays the person's own last save, so the sibling's changes merge in — and an editor that reloads,
  as VS Code does, saves the newer stamp and never meets the rule. A file other than Markdown has no stamp to tell such
  a save from an edit of the refreshed file, so after a write-back that merged cleanly, its next save takes the closer
  of the kept content and the merged version as its base.
- **Files other than Markdown.** A text file of any kind may sit in a projected root — `scratch/` above all, where D5
  lets a person keep anything — and D10 refuses binary content at persist but never skips a file. A stamp would corrupt
  such a file, so it carries none, and its index entry stands in for it. Its entry's version is its base, so a file
  restored to an older version is an edit like any other. The index is written before a replacement puts the new file in
  place, so while a replacement is in progress the entry also records the version it replaces: the command's end clears
  the record once the file is in place, a refused move restores the entry at once, and otherwise the record waits for
  the next command. A file that does not match an entry still holding the record takes as its base whichever of the two
  versions it equals exactly, else the closer of them, so old content a stop left reads as unedited and is refreshed,
  never written back over the newer version. The residual is an exact revert to the replaced version made while the
  record stands, which reads as old content and is refreshed. Otherwise it is adopted, merged, and refreshed by the same
  rules, conflict markers included, as Git writes them into any file; a protected one carries the read-only mode and the
  persist refusal but no notice line. With no stamp to mark it as projected, an empty one is read only once its
  modification time is 50 ms old, past the longest empty window spike 3 saw (19 ms); a younger one waits for the next
  command.

#### Reading an edit

- **A file is not read mid-save.** VS Code and Zed truncate before writing, leaving the file empty for up to 19 ms
  (spike 3). An empty projected Markdown file is never an edit — every one carries its base stamp — so write-back
  defers it rather than falling through to D13's stamp recovery, and one that stays empty is a deleted file, which D13
  rebuilds. A file modified within the last 50 ms settles first: two stats 15 ms apart, past Linux's 10 ms tick, must
  agree on size and modification time, up to three tries, else it waits for the next command. A refresh hands a file its
  re-check finds changed to write-back, which settles it or leaves it to the next command. Only a command that follows a
  save that closely pays the wait.

#### Replacing a file

- **The replace guard, after Syncthing:** before replacing a file, re-check it against its index entry by the same racy
  rule — the stat, and the content hashed when the entry is racy. On a mismatch, stop, take the edit in through
  write-back, then retry, capped at a few passes. Edit rights follow the worktree whose file holds the edit, not the
  process taking it in, so a sibling's fan-out writes back the owning checkout's meta edit under that checkout's
  rights. A clash is kept as a conflict, never overwritten. A refused refresh marks the file pending in the index, and
  the next command retries it — it is retryable, not an error. Spike 1 chose the hash over a stat-only re-check,
  which lost nearly every same-tick save, and over deferring a racy entry, which deferred nearly every refresh on Linux.
  An exclusive open is reachable on Windows through the raw `0x10000000` flag and rejected: it fails an editor's save
  with `EBUSY` and closes nothing the hash leaves open.
- **Replacing a file moves the old copy aside,** the sequence Windows' `ReplaceFileW` runs with a backup name: rename
  the original to a temporary name, put the new file in its place, delete the original. Every replacement of a projected
  file — a refresh, write-back restoring a stamp, a conflict written into the file — renames the file into the
  worktree's aside folder, hard-links the staged file onto the path, and checks the aside copy as write-back checks any
  file, against its own base stamp or, for a stampless file, the base its name carries. A save that lands between the
  re-check and the move, in place or by renaming a new file over the path, lands in the aside copy: write-back settles
  it and takes it in as a stale save, and the guard's retry replaces the file again. A save that recreated the path
  first makes the link fail, and the replacement yields to it. A command keeps its aside copies until it ends, then
  takes each worktree's projection lock again and checks each copy again before deleting it, since a save that opened
  the file microseconds before the move can write after the first check. Only the writer checks and deletes its copies
  while it runs, except that a removal of the checkout takes over a copy once it has settled (§ Coordination, item 2);
  the sweep (below) takes a copy over once its writer has exited, so no sweep cuts short the delay the second check
  relies on. In spike 1b on Linux, saves timed into the interval lost none of 40,000 with the second check and 7 without
  it; on Windows the swap, run without the second check, lost only two saves its harness mistimed. A rename over the
  file lost up to 1,255 of 2,000 replace-style saves on Linux and 363 of 1,000 on Windows, and holding a descriptor
  across the rename, September's Linux rescue, saved in-place saves only. A replacement costs 62–85 µs on Linux and 1.5
  ms on Windows at the median, against 20–61 µs and 0.48 ms for a rename over the file.
- **The path is briefly absent** between the move and the link: a median 10 µs on Linux and 0.85 ms on Windows, longer
  while the host stalls (0.64 s once on Windows). The projection never meets the gap, reading under the projection lock.
  Any other reader — an editor, an agent, a lint run — can, while a refresh replaces that very file: spike 1b's
  tight-loop readers got `ENOENT` on 0.33% of reads on Linux and most on Windows, and a save that opens the existing
  file without creating it fails visibly there rather than being lost — no tested editor saves that way. VS Code
  reloaded the file as it does after a rename, never marking it deleted even at twenty swaps a second, and Zed showed
  nothing. A watcher on Linux sees the file moved away and created where a rename over it reports one rename; on Windows
  both report it removed and re-added. A holder that shares delete access, as Node does, lets the move proceed, and its
  later writes land in the aside copy, which the second check reads; one that does not refuses with `EBUSY`, which the
  bounded retry covers. The same readers starved a rename over the file on Windows — 23 of 24 refreshes gave up after
  200 retries — and never held up the move.
- **The aside folder** is one folder per worktree, `.arc/system/.internal/projection/`, holding the aside copies, the
  staged files, and the racy reference stamp (§ State and change detection), which the sweep leaves alone. It sits
  inside the worktree, since a rename or link cannot cross volumes and a linked worktree's Git directory may sit on
  another, beside ARC's other per-worktree machine-local files — the checkout marker (`worktree-marker.json`) and the
  pristine store (`pristine.json`). Write-back and adoption never scan `.arc/system/`, `arc update` deletes only files
  its manifest listed (`lib/manifest/apply.ts`), and the exclude writer ignores the folder (§ Ignoring, finding, and
  editor settings). Like the index, it is registered in `MACHINE_LOCAL_PATHS`, under a checkout-relative root this work
  unit adds with the pattern `.arc/system/.internal/projection/**` — never all of `.internal/`, which holds stored
  records — so a source that projects `.arc/system/` finds it there and leaves it alone. Each aside copy and staged file
  is named for its role, its file's path, the base blob id of the version it replaced, its writer as
  `lib/advisory-lock.ts` identifies a lock's holder — the process ID with its per-process instance, and its process
  scope where the lock records one — and a per-move nonce, so no two moves share a name, and a staged file is created
  exclusively. The sweep checks a stampless copy against its base and judges a writer's liveness as the lock does: a
  process ID still in use keeps its copies, so a reused ID delays the sweep's takeover until that process exits and
  never loses the copy. A command that stops mid-swap leaves its copy behind — the state `ReplaceFileW` leaves when it
  fails after the first rename — so every command sweeps the folder under the projection lock before write-back's scan,
  touching only copies and staged files whose writer has exited: a copy whose path is absent is linked back, yielding if
  the path has reappeared, and every other copy is checked against its base, an edit it holds taken in; leftover staged
  files are deleted.
- **Rebuilding an absent file** is the swap's link alone, which fails if the path has reappeared, and then yields: Vim,
  Neovim, and Emacs leave the path absent or empty mid-save (spike 3). Spike 1 lost no save that way, against up to 407
  of 1,000 for a rename and up to 401 failed editor saves for `copyFile`'s exclusive flag. A save from a buffer older
  than a refresh carries the old base stamp, so write-back merges rather than reverting the refresh: VS Code prompts
  before such a save, and Zed neither reloads nor prompts (analysis § 6.5; § State and change detection, a stale
  buffer's save).
- **Removing a file** whose record moved, was archived or renamed, or left the in-flight view is the swap without the
  link: the same re-check, an edit taken in through write-back against the record the file was projected from, then
  the file moved aside and its copy checked and deleted like any other. An edit write-back refuses — to a record now
  archived, say — goes back to its path by link and stays there as a refused edit, reported, with teardown refusing
  over it, and each later command retries the removal until the person resolves it.

#### Conflicts in the file

- **Conflict markers, after jj:** standard Git markers at length seven; when a side already holds a marker-like line — a
  Markdown setext underline of `=======` is one — the length grows to the longest such line plus four, and the index
  records it. Git's own merges vary the length the same way through the `conflict-marker-size` attribute, which is the
  idiom here, not a rule that reaches gitignored files. Parsing matches markers of exactly the recorded length, which
  spike 4 found stricter than jj's ignore-shorter rule (`parse_conflict` in jj's `lib/src/conflicts.rs`) once a person
  adds a longer run while resolving; untouched markers keep the conflict open. D13's rule for malformed markers stands
  over jj's: refuse that entry's persist with a typed remedy, where jj degrades the hunk to text. Malformed means an
  incomplete set at the recorded length — a start, separator, or end marker with the rest of its set missing.
- **Escalated conflicts carry a resolve-by-hand line.** VS Code's conflict actions read markers by a seven-character
  prefix, so a side holding `=======` is mis-split at any length; escalation makes ARC's parse right, not VS Code's. An
  escalated conflict therefore writes, right after its start marker, an HTML comment telling the person to resolve it by
  hand and delete that line with the markers, and the parser reads the line as part of the marker set. Every VS Code
  action on a mis-split conflict then leaves the line or the real separator behind and is refused as malformed, where
  Accept Current alone would have dropped part of its side unseen; a hand resolution that removes the markers and the
  line persists. Checked against all three actions and the output spike 3 recorded. Length-seven conflicts carry no such
  line, since VS Code's actions handle them correctly.

#### Escape hatch and what is not built

- **A skip switch,** after jj's `--ignore-working-copy`: one flag that runs a command without write-back or refresh, so
  a projection defect cannot lock a person out of `arc`, and the recovery path stays reachable.
- **No watcher and no daemon.** Watching pays only in a long-lived process; Git's `fsmonitor` is built for monorepos of
  hundreds of thousands of files (Chromium's 393,000: `git status` from 17.6 s to 0.83 s). The command-start tripwire
  would show the need first (§ Performance and scale).

Rejected dependencies: `write-file-atomic` (no Windows rename retry; 8.0.0's engines range excludes Node 24.0–24.14,
against the package's `>=24`), `graceful-fs` (patches `fs` globally, and the CLI's own bounded retry already covers the
move aside), `proper-lockfile` (no release since 2021, heartbeat staleness a CLI blocked in Git can miss), `chokidar`
and `@parcel/watcher` (watching), and `isomorphic-git` (blob hashing is a few lines).

### Protected files

D13's three layers stand: the notice line, the read-only mode, and the persist refusal. The notice is ARC's own
convention, modeled on Go's `Code generated … DO NOT EDIT.` in an HTML comment beside the base stamp — no Markdown
convention exists. The read-only mode is a speed bump: VS Code honors it only under `files.readonlyFromPermissions`;
Vim's and Neovim's `:w!`, Emacs's forced save, and Claude Code's Edit and Write all write through it and leave the mode
at 0444 (spike 3), so the persist refusal keys on the stat and content change, never on the mode. VS Code's Overwrite
button sets the mode to 0644 before saving, and the file stays writable until a refresh next replaces it; Zed honors the
mode. On Windows the read-only attribute blocks a rename over the file with `EPERM`, the code the bounded retry reads as
a held file, but not the swap: a read-only file moves aside and its copy deletes, and a read-only staged file links in,
so nothing clears the mode (spike 1b). Node's unlink, `git worktree remove`, and `git clean` delete read-only files on
both platforms (spike 1), so teardown and deletes need nothing. The persist refusal is the real protection. The
per-editor settings command (D13) may set VS Code's option.

### Ignoring, finding, and editor settings

- **The exclude writer** generalizes `ensureGitExcludePattern` (`lib/git/exclude.ts`) to a path list — one Git call
  and one write, which matters at Windows' 32–42 ms a call. The list derives from the layout registry's projected
  roots plus the `.arc/system/` paths the package projects, never a seventh hand-kept list (the register's row on the
  six that exist), and adds the engine's aside folder.
- **The guard** runs where those entries are written and before the projection writes into a root: one
  `git check-ignore -v --stdin` over the roots and the aside folder refuses one no rule ignores, and `.arc/user/*/`
  must match a rule whose source is `.gitignore` itself, since `npm pack` reads only `.gitignore` (analysis § 5.3). The
  refusal is typed and recoverable, naming the missing line.
- **The per-editor command** is `arc editor <vscode|zed>`, with `--remove` to take ARC's keys back out, after Yarn's
  `yarn dlx @yarnpkg/sdks vscode`. VS Code takes one key, `files.readonlyFromPermissions: true` — the tracked `.ignore`
  already re-includes the projection for its search and quick-open. Zed takes a project-level `file_scan_inclusions`
  listing the four projected roots after Zed's `"..."` entry, which keeps its default `.env*` inclusion that an explicit
  list would otherwise replace. Editors in the ripgrep family need nothing. JetBrains IDEs list gitignored files in the
  project tree, highlighted as ignored (since IntelliJ IDEA 2019.2), and ask to clear a file's read-only status before
  editing it.
- **This repository's untracked `.ignore`** in the primary holds one personal Marksman line hiding
  `packages/arc-framework/arc/`. It is deleted before the tracked `.ignore` lands, and the line is not carried over: the
  package copy is the authoritative source for framework edits, and in `.git/info/exclude` the line would hide it from
  ripgrep-based search, agents' included, in every worktree of the clone (checked with ripgrep 14.1.1, where Git
  ignores the line for tracked files).

### The `active/` revert setting

D13's one layout-resolver setting is a project key in `arc-config.yml`, not a personal one: docs, workflows, and agents
reach paths through the layout resolver, and a personal key would let two people's instructions point at different
paths. The key goes once the layout has seen use.

### The in-flight view setting

`mine`, `cohort`, or `all`, plus pins, is a personal setting. It lives where personal settings live today, `arc.*` keys
in `git config --local`, and moves with them when `config-storage-architecture` builds its per-developer tier
(`config.user.yml`). The index records the effective setting, pins included, and the identity the worktree was projected
under; a command that reads a different one reprojects what it governs — views added, a file leaving a view through the
removal path, and the personal roots following a changed identity.

### Files the store does not know

Adoption follows the folder a new file appears in (D13: a work unit owns files by folder, not by name), for a text file
of any kind (§ State and change detection, files other than Markdown):

- `active/current/` and a stub's folder under `backlog/` — adopted into that work item.
- A new folder under `backlog/` — adopted as a new stub through `arc stub`'s minting path when it holds a meta that
  parses, its commitment tier and any cohort taken from the path and the rest from the meta. Without one, its files
  are ownerless — flagged in `arc status`, with teardown refusing while they stay unadopted (analysis § 6.10) — and the
  remedy names `arc stub <name> --commitment <tier>` with the tier filled in, after which the folder's files adopt.
- `active/` top level and the identity root outside `scratch/` — persist refuses, naming `current/` or `scratch/`.
- `active/in-flight/<slug>/` — the owner's prose only, under D13's edit rights.
- `completed/` — read-only; `arc reopen` is the route, and the errata convention moves onto the store's history
  (register row on `archive-work-unit`'s errata convention).

Editor side files are never adopted: `*~`, `.#*`, `#*#`, `.*.sw?`, `4913`, and `*.tmp.<pid>.<hex>` from the terminal
editors and Claude Code (spike 3); VS Code and Zed add none. Nor are the folder files operating systems write:
`.DS_Store` and `._*` on macOS, `Thumbs.db` and `desktop.ini` on Windows, and KDE's `.directory`. The match runs on the
file name before any other test, since Emacs's `.#name.md` lock is a dangling symlink ending in `.md`.

### Proposed D13 amendments

These change what a caller sees, which the cohort assigns to `storage-contract`. Four revise the contract's own wording
— the replacement's re-check, the stamp on files other than Markdown, the base a stale buffer's save merges from, and
which worktrees D13 projects into and D17 locks — and the rest add to D13 without contradicting it. With the contract
archived, this draft and then this work unit's spec record them as forward amendments for the Owner to decide as
contract extensions:

- **`completed/` is read-only,** reopened through `arc reopen` — D13's edit-rights rule names no rule for archived
  work.
- **The skip switch** — a flag every `arc` command accepts.
- **Escalated conflict markers** — longer than seven characters where a side holds a marker-like line, with a
  resolve-by-hand line after the start marker; D13 names the standard markers.
- **Teardown also refuses over a refused edit or a file that fails to parse** — D13's teardown refuses while a file is
  unadopted or held by a conflict; a refused edit stays in its file (D13), and a file that fails to parse is skipped and
  reported (D13), its edit never written back, so removing the checkout would drop either. Teardown's persist-first pass
  checks every root, `completed/` included.
- **A just-modified file waits** — write-back settles a file modified in the last 50 ms before reading it, and an empty
  projected Markdown file is never read as an edit; a refresh hands a changed file to write-back under the same rules.
  A caller can observe the short, reported staleness.
- **A replacement re-checks by content and moves the file aside** — D13 makes the refresh's re-check "a stat, not a
  re-read", has refresh lift a protected file's read-only mode to rewrite it, and retries renames over held files on
  Windows. Here the re-check also hashes a racy entry, every replacement moves the file aside and links the new one in,
  read-only mode and all, retried while a holder refuses, and a removal moves the file aside the same way. A caller can
  observe the path absent for about 10 µs on Linux and 0.85 ms on Windows, and copies in the worktree's aside folder
  while a command runs.
- **Files other than Markdown carry no stamp** — D13 puts the base stamp on each projected file's first line; a text
  file of another kind keeps its base in the worktree's index alone, since a stamp would corrupt it, with the version a
  replacement in progress replaces recorded beside it.
- **A stale buffer's save merges from what the last persisted write-back took in** — D13 merges an edit against the
  version its base stamp names; an editor that never reloads keeps the stamp a write-back read, and merging against that
  version would undo the person's own persisted edits.
- **The projection follows the ownership marker, and the worktree lock ARC's work-unit and Errand spawns** — D13
  projects into every worktree, and D17 locks each worktree ARC spawns; here a checkout gets the projection when it is
  the primary or its marker names a work unit or a transient claim, `arc start --here`'s included, and the lock goes
  only on a linked checkout ARC spawns for a work unit or an Errand. Any other checkout — ARC's machinery, a hand-made
  worktree nothing has claimed — gets neither and is removed as today; after the flip an editor or agent there finds no
  state at the familiar paths and reads it through `arc view` and the status surfaces, or claims the checkout with
  `arc start --here`.

### Retired here, not built

- **One copy per machine** stays a reserve, never built: D13 makes it a fallback no caller sees, and nothing yet
  triggers it. Its tripwire is a write's fan-out time, after parallel writes (below).

### Performance and scale

Cost per command grows with what changed, never with how much state exists:

- **Write-back checks every projected root but `completed/`:** the checkout's own work item, the personal surfaces, its
  in-flight views with their protected files, so a refused edit is reported at once, and `backlog/`, where anyone grooms
  a stub and new files are adopted. New files are found by walking those roots' folders each command, as Git's
  untracked-file scan does without its cache. `backlog/` holds about 300 files in 156 folders here, which by the
  follow-up probe's costs adds about 2 ms on Linux and 8 ms on Windows, most of it the folder walk. `completed/`, which
  grows with the archive, is checked by `arc save`, by teardown's persist-first pass and the removal check, and whenever
  a refresh touches a file.
- **Refresh is store-driven:** each worktree's index carries the state version it last projected, and the next
  command asks the store's `changes` for the records since, rewriting only those and any file still marked pending.
- **History depth never enters the read path** (D10).

| Axis                         | Cost grows with                     | Watch                                    | Response                                          |
| ---------------------------- | ----------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Archive size                 | nothing per command                 | full materialization (spawn, `arc sync`) | batched blob reads (`cat-file --batch`); tripwire |
| Worktrees per machine        | worktrees × files changed per write | fan-out time; Windows moves while held   | tripwire; the one-copy reserve                    |
| Team size                    | others' writes, at fetch points     | the `all` view                           | `mine` default; `cohort` and `all` opt in         |
| File size (1 MB cap, D10)    | merge time per edited file          | nothing at the cap                       | —                                                 |
| Windows Git calls (32–42 ms) | Git calls per command               | calls before the command's own work      | one batched read; state-version shortcut          |

At this repository's size today — about 800 projected files and 17 MB in `completed/` — a warm stat walk of all of them
took 3.4 ms. Spike 2 measured the stat walk, the index read, and the Git call: at 1,000 files, 5 ms on Linux and 49 ms
on Windows, of which the Git call is 2 ms and 41 ms; at 100 files, 2.3 ms and 42 ms. A follow-up probe added the rest of
the no-change path — the folder walk that finds new files, the projection lock, the sweep's check of an empty aside
folder, and the index and reference write each command makes to keep its tripwire measurements: at 1,000 files in 125
folders they add 1.8 ms on Linux and 7.7 ms on Windows, the walk the largest share at 1.0 ms and 5.1 ms, and with
synchronous calls the whole file-system side took 3.8 ms and 29 ms, under the Git call it runs beside on Windows (notes
§ Spike 2). No folder-time cache is built; the command-start tripwire would show the need. The checked set is the size
that counts, and it sits well under 1,000. The projection makes two Git calls — the store read, which shares the
command's first store read, and one `git config --get-regexp` of the `arc.*` keys, identity and the in-flight view
setting — started together with the stat walk: run at once they cost what the store read costs alone, 41.7 ms against
41.6 ms on Windows, where one after the other took 64.8 ms (notes § Spike 2). So the projection's cost on Windows is one
Git call's time, and on Linux it is noise beside the CLI's own start (about 280 ms for `--version`). Budget: the
projection's no-change overhead stays within 10 ms on Linux and 60 ms on Windows.

A write's fan-out and a full materialization cost more on Windows, where each file write costs about 1.5 ms. One write
pushed into 20 worktrees took 3 ms for one file and 13 ms for ten on Linux, and 113 ms and 571 ms on Windows, the swap's
end check included; Windows pays about 5 ms per worktree before its files, mostly the lock and index writes. A full
materialization of this repository's 780 files took 115–130 ms on Linux and 1.1–1.3 s on Windows. Writing several files
at once halved the Windows materialization to 0.62–0.79 s and slowed Linux; it is a tripwire's first response, not built
now, and would run on Windows only.

Tripwires, after the contract's contention tripwire, each shown when the median of its recent measurements, kept in the
worktree's index, crosses its bound, never on one measurement, since host stalls reached 1.4–1.6 s on Windows (notes §
Tripwire timings):

| Tripwire               | Linux  | Windows | Set at                                      |
| ---------------------- | ------ | ------- | ------------------------------------------- |
| Command-start overhead | 20 ms  | 120 ms  | twice the budget                            |
| One write's fan-out    | 100 ms | 600 ms  | ten times the budget                        |
| Full materialization   | 1 s    | 5 s     | about four times today's archive on Windows |

Today's heaviest fan-out, ten files into 20 worktrees, sits just under its bound on Windows. Past it, the first
response is writing files in parallel on Windows, then the one-copy reserve; past the materialization bound, parallel
writes on Windows. Materialization runs at spawn and at `arc sync`, not per command, so its bound is the looser one.
Disk: `completed/` lands in every worktree, as the tracked copy does today.

## Coordination

### `storage-seam`

Scopes are disjoint by design: the seam's draft leaves the projection, `arc save`, write-back, and the worktree lock
here. Five interfaces cross:

1. **Parsers and write checks.** Write-back reads a hand-edited file through its kind's parser, from the kind registry's
   parser slot (`createKindRegistry` in `lib/store/registry.ts`), skipping and reporting a file that fails to parse
   (D13). It persists the edit only if the kind's write check, registered beside the parser, admits it: write-back and
   `arc save` call the check with a hand edit as the writer, the record's reference, the prior and next parsed records,
   and a read-only view of the store. A change to a field only a verb may set is refused there, not by the parser, which
   stays content-only — the seam's amendment to D13's mechanism (`draft-storage-seam.md` § Shared decisions, item 11). A
   refused edit stays in the file and is reported, never blocking the command (D13). The seam's members fill both slots;
   this work unit consumes them. An empty slot needs no rule here: write-back is a contract `write`, which D5 lets land
   unvalidated, a kind with no rules registers no check, and merge takes a kind's entry shape from its mechanism, not
   its parser. Write-back is dark until the flip, so the gap is the flip's: `storage-cutover`'s rehearsal confirms every
   hand-editable projected kind has its parser and every entry kind its entry shape, which `work-item/description`,
   `work-item/inbound`, and `personal/errand-queue` still lack (`lib/store/registry.ts`) (captured; widened at draft
   close).
2. **Checkout removal and the lock's sites.** One seam member builds one removal function for every removal ARC runs of
   a work unit's or Errand's checkout, spawn rollbacks aside (§ The worktree lock) — the removal check, then a persist
   step, then unlock when Git lists the checkout as locked, then remove — and the asks name `seam-lifecycle`, which
   holds teardown. The removal check also runs on its own: today's `isWorktreeClean`, which
   `lib/git/worktree-cleanup.ts` defines, plus a projection part, a slot this work unit fills that reports whether the
   persist step would refuse — a file unadopted, held by a conflict, failing to parse, or holding a refused edit. The
   index records neither of the last two, so the projection part runs write-back's read path over each file that changed
   — the settle rule, the parser, the kind's write check, and the merge against the store — and writes nothing; it takes
   no lock, and the removal checks again under it. Its cost is the stat walk, about 3 ms on Linux and 27 ms on Windows
   at 1,000 files (notes § Spike 2), plus the read of each changed file. Each member moves its callers that remove a
   checkout onto the function and those that decide or report whether one can be removed onto the removal check.
   `seam-lifecycle` moves `teardown.ts` and `reconcile-work-unit-worktree.ts` onto the function, and onto the removal
   check `lifecycle-guards.ts`, whose guard refuses a park or abandon before any mutation fires, so a refusal present
   when the verb starts stops it before it changes anything. `seam-locus` moves onto the function the Errand's exits
   through `lib/errand/terminal-occupancy.ts`, one of the register row's two direct `git status` readers, and onto the
   removal check `stale-worktree-sweep.ts`, `branch-gone-recovery.ts`, `lifecycle-residue-sweep.ts`, and
   `arc errand leave`'s authorization (`authorizePreservation`, `lib/errand/leave-runtime.ts`), which inspects the
   Errand's checkout through `terminal-occupancy.ts` before recording its paused or awaiting-merge state and removes the
   checkout only afterward; the primary, which no exit removes, keeps `git status` wherever `terminal-occupancy.ts`
   inspects it (`settleTerminalOccupancy`). The sweep and branch-gone recovery already read
   `linkedIdentityGlobalUserSurfacesAreSafe` beside `isWorktreeClean` the same way. The register row's other direct
   reader, `lib/locus/primary-safety.ts`, decides only whether the primary may host a transient claim, a branch switch
   that leaves the gitignored projection in place and removes no checkout, so it stays as today. Like the removal
   check's projection part, the persist step is a slot, as item 1's are, empty until this work unit fills it: it holds
   the target worktree's projection lock until the checkout is gone, persists every edit there or refuses, and takes
   over every aside copy there, its writer live or not: once a copy has settled (§ Reading an edit), it takes in an edit
   the copy holds and deletes the copy, so the writer's own second check finds nothing left. The function checks the
   folder first: a missing one skips the removal check and the persist step, and its registration is unlocked if locked
   and pruned; `seam-locus`'s stale-worktree sweep reports a missing locked registration with that remedy. For the
   removals this work unit rewrites (§ The worktree lock), `seam-locus` also has the sweep's report of a removable
   worktree and branch-gone recovery's removable candidate each carry an `arc teardown <name>` command line, as the
   residue sweep's report does (`teardown.argv`, `lifecycle-residue-sweep.ts`). The seam's members also make every move
   of a projected checkout, run or printed, take the `git worktree move -f -f` form that keeps the lock. This work unit
   depends on both members, rewrites the printed and documented removals, and lands the lock after them (§ The worktree
   lock).
3. **The user-surfaces shim.** Under the capability the projection gives every worktree its own copy of the user
   surfaces and reads none through `lib/user-surfaces.ts`'s resolver. The in-repo implementation keeps the resolver
   (`lib/store/in-repo/personal-paths.ts` imports it), and teardown keeps merging a linked worktree's copy up through
   `lib/user-surface-migration.ts` until the flip, so both stay as today's arms. The seam's members move their own
   callers off the resolver, and `storage-cutover`'s deletion pass removes the rooting and the migration with the
   in-repo arms (D15), so this draft's capture hands that register row to `storage-cutover`.
4. **Scratch.** The projection creates `scratch/work-unit/<slug>/`, empty, for the checkout's work unit; the seam's
   locus member reconciles the folders at session start through `lookup` (D5). The folder naming is the interface.
5. **Machine-local paths and the layout resolver.** The seam maintains `MACHINE_LOCAL_PATHS` and `resolveArcPath`;
   this work unit enforces the first, registering there its index and its aside folder, the second under a
   checkout-relative root it adds, and lays `active/current/` and `active/in-flight/<slug>/` over the second.

**Ordering:** `active/current/` lands only after the seam's locus member resolves the current work unit from the
checkout marker plus the store, and takes session-init's slot paths and the compaction seed's from the layout resolver
(D13 § The `active/` layout, Ordering). The asks on the seam's side sit in `cohort-storage-seam.md` § Cross-cohort
(merged at `b7f866165`), which the seam amends through an Errand. This draft's second review and its fix checks change
them: the removal function moves to the seam, built by one member (`seam-lifecycle` asked), with the removal check's
projection part and the persist step as slots this work unit fills, unlocking only a locked checkout, and a missing
folder unlocked and pruned; each member moves its callers that remove a checkout onto the function and those that decide
or report a removal onto the removal check — `seam-lifecycle`'s `lifecycle-guards.ts`, and `seam-locus`'s two sweeps,
branch-gone recovery, and `arc errand leave`'s authorization; `lib/locus/primary-safety.ts` leaves the ask, since it
decides only whether the primary may host a transient claim; the stale-worktree sweep reports a missing locked
registration, and it and branch-gone recovery carry an `arc teardown <name>` command line for the prompts this work unit
rewrites; and the removals printed or documented rather than run stay with this work unit. An Errand of the same kind
carries them at draft close.

### Others

- **`storage-ref-backend`** — the multi-process test lane runs over it; the projection otherwise consumes only the
  contract.
- **`storage-cutover`** — runs the first full materialization at the flip and the live rehearsal; the flip's workflow
  rewrite names `arc save`.
- **`config-storage-architecture`** — re-homes the in-flight view setting with the per-developer tier.
- **`framework-core-from-package`** — a later source with read-only copies (D13 § More than one source); the ignore path
  list accepts `.arc/system/` paths. Its inbox entry adding the generated schema directory to that list, and deriving
  the five hand-copied `.gitignore` entry lists from one, shapes this list's API. A source that projects `.arc/system/`
  leaves the aside folder alone, which `MACHINE_LOCAL_PATHS` lists, and the checkout marker and pristine store beside
  it, which it does not yet list (`cohort-storage-seam.md` § Soft coordination).
- **The `.worktreeinclude` Errand** (`USER-INBOX § Errand`) carries gitignored editor settings into spawned worktrees —
  adjacent, outside this design, as the contract's notes record.

## Spikes

Planning spikes that de-risked inputs before the spec, each recorded in `notes-storage-projection.md` with its harness
under `~/dev/scratch/arc-storage-spike/projection/`. Linux runs are WSL2 on ext4; Windows runs use `node.exe` on NTFS.
Each is folded in above.

- **Spike 1 — the refresh's replace guard** (both platforms), same-size checkbox toggles under the twenty-worktree
  burst: the hash re-check over a stat-only re-check and over deferring a racy entry, the index written before the file,
  the exclusive open rejected, the hard-link rebuild, and how `git worktree remove`, `git clean`, and Node's unlink
  treat read-only files.
- **Spike 1b — moving the file aside** (both platforms), against the residual spike 1 left — a save between the re-check
  and the rename was replaced: the swap and its second check, held and read-only files moved aside, and what readers,
  watchers, VS Code, and Zed see while the path is absent.
- **Spike 2 — command-start cost in Node** (both platforms), the no-change path at 100, 1,000, and 10,000 files: the
  budget, and the racy rule needed on every platform; a follow-up probe timed the rest of the path.
- **Spike 3 — editor and agent write patterns** (Linux; VS Code and Zed by checklist), for Vim, Neovim, Emacs, Claude
  Code's Edit and Write, and Codex: save styles, side files, the settle rule, line endings, how each treats a read-only
  file and an external rewrite, and one Claude Code run that resolved a conflicted inbox into well-formed text with no
  markers.
- **Spike 4 — conflict markers in practice** (Linux, over VS Code's actions from spike 3's checklist): exact-length
  parsing, escalation, and the resolve-by-hand line.
- **Tripwire timings** (both platforms): a write's fan-out and a full materialization, which set the bounds.

## Open

None.

## Inbound dispositions

- **Cover the documented `active/` layout in the isolation acceptance test** (`USER-INBOX § Work Unit`, held for this
  work unit, captured 2026-10-07) — integrated: the rewritten invariant's acceptance test checks the layout the
  documentation states; the guard on today's flat layout is dropped, since the flip replaces that layout.
- **Run each kind's write check from write-back and `arc save`, with a hand edit as the writer** (`USER-INBOX § Work
  Unit`, routed from `storage-seam`, captured 2026-10-09) — integrated: § Coordination, item 1.
- **Upgrade the linked-worktree user-surface signpost to a content view** (routed from `operational-state-docs`) —
  rejected as dissolved: the signpost stub is written by `buildSignpostStub` in `lib/user-surface-migration.ts`, which
  retires with the user-surface rooting at the flip (§ Coordination, item 3), and every worktree then holds the real
  files.
- **A spawned worktree's `SESSION-NOTES` can read stale while status reports clean** (routed from
  `operational-state-docs`, captured 2026-07-24) — rejected as dissolved at the flip: the per-work-unit workspace and
  its spawn seed retire, session context moves into the meta (`storage-seam`'s locus member), and the projection keeps
  every worktree's copy current. Before the flip, `sync-status.ts` already reports a seeded, unsaved `SESSION-NOTES`.

## Unknowns and Assumptions

- The register's counts and caller lists were re-derived here at `1ee4709a3`; they move as the seam reroutes.
- Assumes `storage-seam`'s parsers arrive kind by kind; an empty slot needs no rule here (§ Coordination, item 1).
- Assumes hard links on every volume a worktree sits on: ext4, APFS, and NTFS have them, exFAT and FAT32 do not, and no
  fallback is built.
- A save to a file other than Markdown that exactly restores the version a replacement replaces, made while the index
  still records that version — during the replacement, or after a stop until the next command — reads as old content and
  is refreshed (§ State and change detection, files other than Markdown): content alone cannot tell it from what the
  stop left.
- An edit or a store change landing between the removal check and the removal can still make the persist step refuse
  after a park, abandon, or Errand leave has changed state, as an uncommitted change can today between `git status` and
  `git worktree remove`.
- A save that lands between the persist step and a checkout's removal goes with the checkout, as with any deletion: the
  persist step holds the projection lock, which no editor takes.
- A removal forced past the lock with `git worktree remove -f -f`, which D17 allows and Git's refusal suggests, skips
  the persist step and loses what another tool's removal of a `--here` checkout loses (below).
- A checkout claimed with `arc start --here` is not locked, so another tool's `git worktree remove` takes with it every
  edit made there since the last `arc` command and every state teardown refuses over — a refused edit, a file that
  failed to parse, an unadopted file, a conflict — and, before the flip, the gitignored `SESSION-NOTES` and any copy of
  the identity-global user files teardown would merge up (`reconcileUserSurfacesForRemoval`), as it would in any
  checkout ARC did not spawn.
- A write through a handle opened before a replacement and landing after the command's second check, or after a
  removal's persist step took the copy over, goes to a deleted aside copy and is lost. Reasoned, not measured: no tested
  editor or agent holds a file open across saves.

## Scope boundary (Won't Do)

- Change any caller-visible behavior D13 settles, except by forward amendment to the contract's spec.
- Build the checkout removal function and its removal check or move their callers onto them, build the parsers, or
  reconcile scratch at session start (`storage-seam`).
- Build the ref backend, the import, or the multi-process store (`storage-ref-backend`); run the flip, its workflow
  rewrite, or the deletion passes (`storage-cutover`).
- Carry gitignored editor settings into spawned worktrees (the `.worktreeinclude` Errand).
- Build a file watcher, a daemon, or the one-copy-per-machine fallback.
- Resolve framework core from the package (`framework-core-from-package`); the projection only keeps its source seam.

---
