# Spec (`detailed` · `RFC`): storage-projection

- **Origin:** [internal] — the `state-storage` re-cut (2026-09-28); stage 2 of the storage program.

- **Purpose:** Build the working copy of the store: every stored artifact written out as an ordinary, whole file at its
  familiar `.arc/` path in every worktree that holds a projection, each hand edit sent at the next `arc` command for the
  store to merge without losing a save, the conflicts the store files shown in every checkout, and the worktree lock
  that keeps ARC from removing a checkout before its edits persist — the caller-visible behavior the storage contract
  settled in D13 and D17, built.

---

## Introduction / Context

At the flip, ARC's operational and planning state leaves tracked branch files and Git notes for a store under
`refs/arc/*` (ADR-035). People and agents still need every artifact as a plain file they open by name and search in
place: the storage contract makes direct file access the requirement, with `arc view` and the status surfaces
supplementing files and never replacing them (D13). Something must write the store out as files in every worktree,
notice hand edits, persist them without losing a concurrent edit, keep every worktree's copy current, and refuse cleanly
where an edit is not allowed. That is the projection. Without it the flip cannot happen: the store would hold state
nobody can browse or edit.

The contract settled what callers see, so this work, the ref backend, and the seam's rerouting could proceed in
parallel: D13 fixes the projection's caller-visible behavior, D10 the serialization rules a persist meets, and D17 the
worktree lock. It left the mechanism inside to this work unit: how a command detects edits cheaply, how an edit reaches
the store's merge, how a refresh avoids overwriting a save, what each worktree keeps about its copy, how a conflict the
store filed is shown again in a file, how files the store does not know are adopted, and how all of it holds on Windows.
A defect here is silent data loss, so rigor concentrates on the write paths; a refresh is retryable and takes lighter
handling.

Today nothing projects: the in-repo implementation treats the tracked files as the store itself (`lib/store/in-repo/`),
and no ARC code locks a worktree. Two facts about today shape the pieces that land before the flip:

- a plain `git worktree remove` deletes ignored files without asking (checked on Git 2.55), so the gitignored
  per-work-unit `SESSION-NOTES.md` is exposed now, before any projection exists;
- every decision to remove a checkout reads only `git status` (`isWorktreeClean`, `lib/git/worktree-cleanup.ts`), so an
  edit in a gitignored file is invisible to it.

**Terms used throughout:**

- **Store, backend, record, kind, parser, write check** — as `lib/store/` defines them. The kinds' parsers and write
  checks live under `lib/store/kinds/` and register in the production registration set
  (`lib/store/kinds/registrations.ts`).
- **In-repo implementation** — the backend over today's tracked files, personal files, and transient-identity ref
  (`lib/store/in-repo/`). **Reference backend** — the in-memory, test-only backend the store's conformance suite runs
  (`__tests__/helpers/store/reference-backend.ts`). **Ref backend** — the planned backend storing state under
  `refs/arc/*`, specified in `spec-storage-ref-backend.md`; its **import** is the one-time move of a repository's state
  into it.
- **The flip** — the per-repository switch after which the store reports `capabilities.stateOffBranch` as true
  (`StoreCapabilitiesSchema`, `lib/store/read.ts`); the in-repo implementation reports false and the reference backend
  true. Everything here that differs across the flip branches on that capability, never on a configuration value. Before
  the flip the projection is **dark**: it reads nothing and writes nothing.
- **Projection** — the gitignored working copy: each stored record written out as a file at its familiar path. A
  **projected root** is one of `.arc/active/`, `.arc/backlog/`, `.arc/completed/`, and `.arc/user/<identity>/`; a
  **projected file** is a file the projection wrote for a record.
- **Write-back** — sending a projected file's hand edit to the store at the start of a command (§ 2.2). **`arc save`** —
  the same on demand (§ 2.4). **Refresh** — rewriting projected files from the store. **Fan-out** — the refresh a writer
  pushes into every worktree on its machine once a write or a pull's merge lands. **Hand edit** — content a person or
  agent edited in a file, as against content a verb composed.
- **State version, record version** — the store's token for a point in its history, from which `changes` reads (D4), and
  a record's compare-and-swap basis, which covers its metadata as well as its content (D2; `spec-storage-ref-backend.md`
  § 3.4).
- **Base stamp** — the `<!-- arc-base: <blob id> -->` line naming the stored content a projected file was written from
  (D13); that content is the file's **base**, a **stored base** where the store still holds it as a version.
- **Conflict record** — the stored record a merge files for a clash, holding the base and each side with a label naming
  the machine that wrote it and when, removed by the write that names it in `resolves` (D3, D6). A **hunk** conflict
  locates its clash by a base line range, an **entry** conflict by the entry's `_Id:_`, and a **whole-record** conflict
  replaces a single-writer record changed on both sides (D4).
- **Notice line** — an HTML comment beside the base stamp, which the store never holds: a protected file's (§ 8.2) or a
  conflict's (§ 6.3).
- **Index** — the projection's per-worktree record of what it wrote there (§ 3.1).
- **Projection lock** — the projection's per-worktree advisory lock over its own reads and writes there (§ 3.2).
  **Worktree lock** — D17's `git worktree lock`, which only blocks a checkout's removal (§ 12.1).
- **Aside folder** — the per-worktree folder holding copies of replaced files and staged replacements (§ 5.4).
- **Work-unit marker, spawned checkout, anchored checkout** — as `spec-seam-lifecycle.md` defines them: the
  machine-local file naming the work item a checkout holds (`.arc/system/.internal/worktree-marker.json`,
  `lib/git/worktree-marker.ts`); a linked worktree ARC created for its work item, its marker carrying
  `spawnedByArc: true`; and a checkout ARC claimed in place without creating it, its marker carrying
  `spawnedByArc: false` from the flip.
- **Removal check, removal function** — `seam-lifecycle`'s one read-only check deciding whether ARC may remove a work
  item's checkout, and its one function removing it. This work unit fills their three projection slots (§ 12.2).
- **Work item** — a work unit, whose primary record is its meta, or an Errand, whose primary record is its Errand
  record.
- **§ Spike N, § Tripwire timings** — sections of `notes-storage-projection.md`, which records each planning spike's
  harness, platforms, and results, spikes 1 through 6; Linux runs are WSL2 on ext4, and Windows runs use `node.exe` on
  NTFS.
- **`D` and `A` numbers** — the shipped storage contract's decisions and amendments (`spec-storage-contract.md`), cited
  for the behavior they define; where this design changes one, § 16 states the change. **Record kinds** — the shipped
  kinds under `lib/store/kinds/`, specified in `spec-seam-record-kinds.md`.

## Goals

1. **Every stored artifact is a plain file at its familiar path** in every worktree that holds a projection, opened and
   searched by any editor, search tool, or agent with nothing in between (§ 2, § 10, § 11).
2. **No save is lost.** A hand edit saved in place, by renaming a new file over it, or by an agent's write reaches the
   store at the next `arc` command and every other worktree's copy at the writer's fan-out — saves timed into a refresh
   or a removal included — but for the residuals § 17 names (§ 3–§ 7).
3. **Nothing an edit could lose is dropped silently:** a refused, conflicted, unparseable, or unadopted edit stays in
   its file, is reported, and refuses the checkout's removal; a clash whose base the store holds reaches the store as a
   conflict record, which every checkout shows (§ 6–§ 9, § 12).
4. **ARC removes a projected checkout only after its edits persist,** through the seam's removal function and this work
   unit's slots, behind D17's worktree lock (§ 12).
5. **A command's cost grows with what changed, never with how much state exists:** the projection's no-change overhead
   stays within 10 ms on Linux and 60 ms on Windows (§ 15).
6. **Windows holds** — held files, same-size saves, file identity, and line endings — and the store and projection tests
   run in the portability lane, which runs Windows and macOS (§ 13).
7. **Dark until the flip** but for three pieces that need no store: the worktree lock, ARC's managed block in the root
   `.ignore`, and this repository's `.gitignore` no longer ignoring `.ignore` (§ 1.4).

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This change does not:

- **change any caller-visible behavior D13 or D17 settles,** except by the forward amendments § 16 states;
- **build the checkout removal function or its removal check, or move any caller onto them** (`seam-lifecycle`,
  `seam-locus`); **build any kind's parser or write check** (the record kinds and the seam's members); **build the
  layout classifier that maps a path to its record** (`seam-locus`), into which this work unit registers its addresses
  (§ 10.1); or **reconcile scratch folders at session start** (`seam-locus`);
- **build the ref backend, its stale-base merge, its import, or a store several processes share**
  (`storage-ref-backend`), including the hunk conflict record's `baseVersion`, `currentLines`, and `incomingLines` and
  the merge library's base-version input, which this design reads (§ 6.3, § 16.2); or **run the flip, its workflow
  rewrite, or the deletion pass** (`storage-cutover`);
- **show a conflict's sides in status** (`seam-status-roadmap`), which a conflict shown without markers points to
  (§ 6.3);
- **build a file watcher, a daemon, or the one-copy-per-machine fallback** (Alternatives & Rationale);
- **resolve ARC core from the installed package** (`framework-core-from-package`); the projection keeps only the seam a
  second source plugs into (§ 14);
- **move the checkout marker, the pristine store, or the generated schemas out of `.arc/system/.internal/`**
  (`config-storage-architecture`; § 12.9);
- **change what `.worktreeinclude` copies** beyond skipping the projection's paths (§ 11.6).

## Proposed Design

§ 1 bounds the change and orders it. § 2–§ 7 build the engine: one command's sequence, what each worktree records, how
an edit is read, how a file is replaced, how conflicts show and resolve, and how write-back sends an edit for the store
to merge and check. § 8–§ 11 settle edit rights, adoption, the `active/` layout, and ignoring. § 12 covers worktrees:
the lock, the removal slots, and every worktree's own copy. § 13–§ 15 cover Windows, a second source, and cost. § 16
states the amendments to the shipped contract, § 17 the residuals the design accepts, and § 18 the expected contracts it
consumes.

### 1. Boundary, scope, and order

#### 1.1 One work unit

The engine, the ignore strategy, the worktree lock and the removal slots, the `active/` layout, and retiring the user
surfaces' rooting in the primary all hang off one engine and are designed as a whole: one work unit, with no separately
delivered pieces. It lands single-branch with chunked review, as every storage-program work unit does
(`cohort-state-storage.md` § Soft coordination), and after `seam-lifecycle` and `seam-locus`, on which it depends
(§ 12.5).

#### 1.2 What this change takes

- **`lib/store/projection/`, new** — the engine: the index, change detection, write-back, refresh and fan-out, the
  replace guard and the aside folder, conflicts and their placement, adoption, the `after` view, materialization, the
  exclude writer's path list and guard, and the three removal slots.
- **`lib/store/create.ts`** — the store `createStore` builds, the one place every caller's store is composed, wraps
  `write`, `batch`, and the ref backend's `pull` and `push`, so each landed write and each pull's merges fan out
  (§ 2.2).
- **`cli.ts`** — the root `preAction` and `postAction` hooks call the engine's start and end (§ 2.2), and every command
  accepts the skip switch (§ 2.3).
- **New verbs and options** — `arc save`, with `--resolve <conflict>` (§ 2.4, § 6.5), and `arc editor <vscode|zed>`
  (§ 11.4); `arc init` prints the one user-level Zed setting (§ 11.4), and `arc sync` rebuilds deleted projected files
  (§ 2.4).
- **`lib/git/exclude.ts`** — `ensureGitExcludePattern` generalized to a path list (§ 11.1).
- **ARC's ignore-block writer** — `arc init`, `join`, `reconfigure`, and `update` write ARC's managed block into the
  root `.ignore` through `writeArcGitignoreBlock` (`lib/template/files.ts`) (§ 11.3).
- **`lib/git/worktree-include.ts`** — `copyWorktreeIncludes` skips the projection's paths (§ 11.6).
- **The spawns of a work item's checkout** — the worktree lock as each spawn's last step: a work unit's spawn through
  `reconcileWorkUnitWorktree` (`lib/work-unit/mutators/reconcile-work-unit-worktree.ts`) and graduation's
  (`lib/work-unit/atomic-graduation.ts`), and an Errand's through `provisionTransientLocus`
  (`lib/locus/provisioning.ts`) (§ 12.1).
- **`lib/store/registry.ts`** — `MACHINE_LOCAL_PATHS` entries and a checkout-relative root (§ 12.9).
- **The layout schema** (`lib/layout/schema.ts`, which `resolveArcPath` in `lib/layout/projection.ts` reads) —
  `active/current/` and `active/in-flight/<slug>/`, and the addresses of the kinds the projection names files for
  (§ 10.1).
- **Configuration** — the `active/` revert key in `arc-config.yml` (§ 10.3) and the in-flight view setting's `arc.*`
  keys (§ 10.4).
- **Tracked files** — the root `.ignore` with ARC's managed block, and this repository's `.gitignore` without its
  `.ignore` line (§ 11.3, § 11.5).
- **Text rewritten when the lock lands** — `session-init.md` (`session-init.template.md` in the package, with the
  installed copy) and `strategy-concurrent-work.md` (package and project copies) (§ 12.6).
- **Tests** — unit and integration tests over the reference backend; the isolation acceptance test (§ 10.5); the
  conformance case for the `after` view (§ 7.3); and the multi-process lane once the ref backend lands (§ 1.5).

#### 1.3 Review chunks and their order

The change lands as review chunks on one branch, each with its tests, in this order:

1. **The ignore strategy** — the exclude writer and its guard (§ 11.1, § 11.2) — with ARC's managed `.ignore` block and
   this repository's `.gitignore` change, which go live before the flip (§ 11.3, § 11.5).
2. **The engine's state** — the index, the projection lock, change detection, blob ids, and base-stamp recovery (§ 3).
3. **Reading and replacing** — the settle rule, the replace guard, the aside folder and its sweep, rebuilds, and
   removals (§ 4, § 5).
4. **Write-back and conflicts** — parse and send, the store's merge read back, a clash found in the checkout, the
   store's refusals, the check, the `after` view, provenance, conflicts placed and parsed back, adoption, and the
   report, with `arc save` and its `--resolve` (§ 2.4, § 6, § 7, § 9).
5. **Edit rights, the `active/` layout, and settings** (§ 8, § 10), with `arc editor` and the skip switch (§ 2.3,
   § 11.4).
6. **Refresh, fan-out, materialization, and the tripwires** (§ 2.2, § 2.5, § 15), with the `createStore` wrapper and the
   `.worktreeinclude` skip (§ 11.6).
7. **The removal slots and the release step** (§ 12.2, § 12.3), the user surfaces in every worktree (§ 12.8), and
   scratch (§ 12.9).
8. **The worktree lock** (§ 12.1), last, with the rewritten printed and documented removals (§ 12.6) and the one-off
   lock of existing worktrees (§ 12.7) — live before the flip.

#### 1.4 Before the flip

The projection keys on the contract's one capability (D1, D15). Over the in-repo implementation, which answers false,
the tracked files are the store and the projection does nothing: the root hooks return at once; `arc save` refuses
`unsupported` naming `arc user save`, which serves until the flip, `--resolve` included; `arc editor` refuses
`unsupported`; `arc init` prints no Zed setting; and the three removal slots pass — `check` answers `passes`, and
`persist` and `release` write nothing and return `persisted` and `released` — so the removal function runs its Git part
alone, as `seam-lifecycle` builds it before any slot is filled (`spec-seam-lifecycle.md` § 11.2).

Three pieces carry no store dependency and run live before the flip:

- **The worktree lock** (§ 12.1). D17 does not key the lock on the capability, and today's gitignored `SESSION-NOTES.md`
  already needs it. It lands last, after the seam has moved every removal and move of a work item's checkout onto the
  removal function, the removal check, and the doubled-force move form (§ 12.5).
- **ARC's managed `.ignore` block** (§ 11.3), in every repository whose `arc init`, `join`, `reconfigure`, or `update`
  writes it.
- **This repository's `.gitignore` no longer ignoring `.ignore`** (§ 11.5).

The `MACHINE_LOCAL_PATHS` entries (§ 12.9) are data no code acts on before the flip, so they land with their chunk.

#### 1.5 Verification

- **The gate here:** unit and integration tests over the reference backend — test-only, in-memory, capability true (D7)
  — with real temporary repositories and worktrees on disk, on Linux and in the portability lane. As
  `storage-ref-backend` builds it, the reference backend refuses `state-unresolvable` for a state version it holds no
  snapshot of, implements `pull`, and runs the kind's parser over a stale base's merged content
  (`spec-storage-ref-backend.md` § 14.2), so the gate exercises the rebuild (§ 15.2), the fan-out of a pull's merges
  (§ 2.2), and the refusals the reference backend returns — `record-malformed`, `version-conflict`, and `lock-held`
  (§ 7.8). It holds no history refs and serves every registered kind (`__tests__/helpers/store/history-transfer.ts`,
  `reference-fixture.ts`), so the refusals it cannot return — `state-unresolvable` naming a missing history ref, on a
  write or on `history`, and `unsupported` `unhomed-kind` — and the history pull that answers the first (§ 8.4) are
  exercised through a test store that wraps it and returns them.
- **The multi-process lane:** the burst cases — twenty worktrees, concurrent saves into refreshes and removals — need a
  store several processes share, which the in-memory reference backend is not. The lane joins once the ref backend lands
  (§ 18).
- **The live rehearsal:** `storage-cutover`'s, before the flip.
- **Before the flip,** the worktree lock is verified live: a spawned checkout carries the lock with
  `PROJECTION_LOCK_REASON`, a plain `git worktree remove` refuses it, and the removal function removes it (§ 12.1).

### 2. The engine

#### 2.1 Where it lives

The engine lives in `lib/store/projection/`, inside the store. Write-back reads each kind's parser and write check from
the production registration set, `lib/store/kinds/registrations.ts`, which the `store-raw-state` ratchet lists: the
ratchet passes every file under `lib/store/` and counts any importer outside it (`rawStateViolations`,
`eslint/architecture-imports.ts`), so write-back outside the store would be a floor entry that never reroutes, and the
floor could never reach zero (`spec-seam-record-kinds.md` § 1.2, § 2.2). `cli.ts`'s root hooks call the engine's entry
points, which the ratchet does not list, so they stay uncounted too.

The engine is orchestration over parts the CLI already has: three-way and entry merge (`lib/store/concurrency/`, over
`node-diff3`), atomic replace for the index (`atomicWriteFile`, `lib/fs.ts`), bounded retry on `EPERM`, `EBUSY`, and
`EACCES` (`retryTransientFileSystemRefusal`, `lib/kernel/fs-retry.ts`), and advisory locks (`lib/advisory-lock.ts`). Its
model is jj's working copy: a snapshot at the start of every command, a stat fast path backed by a per-worktree state
file, and conflicts written into files as markers and parsed back at the next snapshot.

#### 2.2 One command, in order

- **The start.** A command takes its worktree's projection lock, sweeps the aside folder (§ 5.4), writes back pending
  edits — each settled, parsed, and sent for the store to merge and check (§ 4, § 7) — and refreshes its pending files
  and the records the store changed since the index's state version (§ 15.2); then it releases the lock and runs. It
  reads `version()` only once it holds its own lock, so no fan-out moves its index past that read. The start runs from
  the root `preAction` hook `cli.ts` registers on the program for every command; `arc save`'s start is its own
  write-back (§ 2.4).
- **A start that cannot take its lock.** Where the lock stays held until `AdvisoryLockTimeoutError`
  (`lib/advisory-lock.ts`), the command runs as under the skip switch (§ 2.3), its edits left pending for the next, and
  reports the holder the lock records. Nothing is lost: write-back runs at the next command, and fan-out carries no
  correctness. `arc save` refuses instead, naming the holder and a retry (§ 2.4), as the persist and release steps
  refuse when they cannot take a target's lock (§ 12.2, § 12.3).
- **The fan-out.** The store `createStore` builds (`lib/store/create.ts`), the one place every caller's store is
  composed, wraps `write`, `batch`, and the ref backend's `pull` and `push`, which replace today's `sync`
  (`spec-storage-ref-backend.md` § 2.1), so a pull's merges, which land with no `write` (its § 6.4), fan out too. Once a
  write lands, the writer refreshes every worktree on the machine that holds a projection, its own included, taking each
  one's projection lock in turn and bringing each up from that worktree's own state version, never only its own write.
- **A write made under a projection lock** — write-back at the command's start, the persist and release steps, a stub
  minted during adoption — fans out once that lock is released, since the lock never breaks for its own holder
  (`isMainLockBreakable`, `lib/advisory-lock.ts`); the command's start fans out once for all its write-backs.
- **What a fan-out reads.** It lists the machine's registered worktrees, detached ones included
  (`scanRegisteredWorktrees`, `lib/git/worktree-roster.ts`, one `git worktree list` call), reads the index of each one
  that holds a projection for the state version it last projected, then reads `version()`, and asks `changes` once per
  distinct state version among them, normally one. Under each worktree's lock it reads the index again and skips the
  worktree when that state version changed since — another refresh reached it first, so it may already be newer, and
  state versions carry no order to tell (`StateVersionSchema`, `lib/store/identity.ts`). It skips a worktree already
  current the same way, and one whose state version no longer resolves, which that worktree's own next command rebuilds
  (§ 15.2). A primary entry's re-lay lists its owner's records once per fan-out, shared by every worktree (§ 15.2).
- **Fan-out keeps copies fresh and carries no correctness:** whatever it misses — a write through another tool, a
  process that stopped — each worktree's next command start refreshes, and an edit made to a stale copy merges through
  the store (§ 7.1).
- **The end.** At the command's end the writer takes each worktree's lock again for the second check of its aside copies
  (§ 5.2). The end runs from the root `postAction` hook, which Commander skips when an action fails, so the second check
  is best-effort and the next command's sweep takes over the copies it leaves (§ 5.4).
- **The report.** Write-back's report — each file it refused, skipped, deferred, withheld at an index rebuild (§ 2.5),
  or kept as a conflict, with its typed reason and each rule's remedy, argv included, and each conflict it resolved —
  goes to stderr before the command's own output, where the root hooks in `cli.ts` already report, so a JSON result on
  stdout stays whole; `arc status` reports what stays refused and every withheld file. A hand tick the task-list kind
  refuses (`task-list.close`) therefore shows ahead of anything `arc check increment` reports, the request the task loop
  runs right after an edit.

#### 2.3 The skip switch

One global flag runs a command with no write-back and no refresh, after jj's `--ignore-working-copy`, so a projection
defect cannot lock a person out of `arc` and the recovery path stays reachable. Its edits stay pending for the next
command, and nothing keeps it on as a mode. It skips the command's start, its end, and the fan-out of the command's
writes. The removal check and the persist and release steps run under it exactly as without it, since each settles a
checkout's edits before ARC removes the checkout or releases its claim: a defect in one refuses the removal or release,
the checkout and its claim staying as they were with nothing lost, until the defect is repaired, and a removal may
instead be forced past it (§ 17). It is an escape hatch, not what keeps ARC's own machinery checkouts out: those hold no
projection (§ 2.5). The flag's name is `--skip-projection`.

#### 2.4 `arc save` and `arc sync`

- **`arc save`** writes back the checkout's pending edits across every projected root, `completed/` included, and
  returns the state version, a named point in history carrying each write's provenance (D13). Its start is its own
  write-back: the root hook runs it under `save` (§ 7.4), every projected root included, attaching each `--resolve`
  conflict to its subject file's write, where every other command's start writes back under `write-back`. At it, unlike
  any other command's start, a refusal naming a missing history ref is pulled and retried once (§ 8.4), and `arc save`
  refuses `--skip-projection`, since its start is its whole work. Each edited file persists as its own write, so one
  refused edit blocks no other: D13's "at once" means in one command, not one batch, which D3 makes all-or-none. A
  refusal another file's pending edit would cure clears at the next command, once that edit has landed. Where a write to
  a completed item, or the `history` read its merge in the checkout makes (§ 3.5), refuses `state-unresolvable` naming
  its history ref, `arc save` pulls the ref and retries once (§ 8.4). `--resolve <conflict>` resolves a conflict shown
  without markers (§ 6.5), and `arc save` reports every resolution it sends. `arc save` replaces `arc user save` from
  the flip; before it, `arc save` refuses `unsupported` naming `arc user save` (§ 1.4).
- **`arc sync`** rebuilds deleted projected files (D13), as a full materialization (§ 2.5).

#### 2.5 Which checkouts hold a projection

A worktree holds a projection when it holds an index (§ 3.1), and gets one — at spawn, or at its first `arc` command —
when it is the primary or its work-unit marker names a work unit or a transient claim, a checkout claimed with
`arc start --here` included, which D17 has write the marker from the flip. Any other checkout — one of ARC's own
machinery checkouts, or a hand-made worktree nothing has claimed — gets none, and `arc` runs there with the projection
off. ARC's machinery checkouts carry no such marker: the review gate's materializations, base sync's managed checkout
(`lib/git/base-sync.ts`), the delivery-refresh and review-fix worktrees, and the test-cost benchmark's checkout
(`lib/test-cost/ref.ts`) have none, and a decomposition worktree's marker names a branch, not a work item
(`git-decompose-v3-operation-io.ts`).

A **full materialization** writes every projected record, under the same replace guard and adoption rules as any refresh
(§ 5, § 9): at spawn, into a worktree that has none, and at `arc sync`, which rebuilds every deleted file. Into a
worktree with no usable index (§ 3.1), it acts only where a file cannot hold an edit, since without the index's marker
map and stale-buffer state no rule reads one safely: a file at a path the current projection lays a stored record at is
refreshed where its blob id, its stamp set aside, equals its stamp's, or, with no stamp, the stored content's. Every
other file under a projected root — one holding markers or an edit, an empty one, one mid-save, or one at a path the
current projection lays no stored record at — is left as it is, written over by nothing and sent nowhere, and the new
index it writes marks it withheld (§ 3.1); a file § 9 never adopts and a path `MACHINE_LOCAL_PATHS` lists (§ 12.9) are
left alone, as write-back leaves them. Status and each command's report name every withheld file, refresh and write-back
skip it, removal leaves it at its path (§ 5.6), and the removal check and the persist and release steps refuse over it
(§ 12.2); the sweep before it withholds aside copies the same way (§ 5.4). Deleting a withheld file, after copying out
what is wanted, releases it: where the current projection lays a stored record at its path its mark turns pending, so
the next command's refresh writes it from the store (§ 15.2), and otherwise its entry goes, nothing written there; the
person re-applies their edit as an ordinary one (residual, § 17). A linked checkout whose marker is released loses its
projection once the release step has persisted its edits (§ 12.3).

### 3. State and change detection

#### 3.1 The index

Each worktree that holds a projection keeps an index, after jj's `tree_state` and Git's index. Per projected file it
records:

- the record reference the file was read with, its owner's UID included where the store gives one, so a write-back
  targets that record and never a live item that has since taken its slug;
- the file's type, size, modification time, and file identity;
- the blob id of what the projection last wrote into the file, as chezmoi records a hash per write, which change
  detection compares against (§ 3.3);
- its base: the blob id of the stored content it was rendered from, and that version's record version (§ 3.4);
- whether the file holds conflict markers, and their length (§ 6.1); for each marker set, the conflict record it shows,
  or that the checkout found it (§ 7.7); for each notice line, the conflict record it names; and, for a file with no
  stamp, the open conflicts it cannot show (§ 6.3);
- whether it is protected (§ 8);
- a pending mark on a file a refresh skipped, a write-back left for the next command, or the person deleted while it was
  withheld (§ 2.5), and a withheld mark on a file or aside copy a rebuild with no usable index left as it was (§ 2.5,
  § 5.4);
- what its last persisted write-back read — the stamp and the content taken in (§ 3.6);
- for a file other than Markdown, the version a replacement in progress replaces (§ 3.7).

Beside the entries it records its format version; the state version last projected; the in-flight view setting,
identity, and checkout claim — the work item the work-unit marker names — it was projected under (§ 10.4); the recent
tripwire measurements (§ 15.4); and the stat of each ignore file when the guard last passed (§ 11.2).

The index is machine-local, in the worktree's own Git directory under `arc-projection/`, which also holds the projection
lock and the kept copies (§ 3.2, § 3.6). It is registered in `MACHINE_LOCAL_PATHS` under the per-worktree Git-directory
root, `git-worktree` (§ 12.9), and never stored or synced. It is written by temp-and-rename (`atomicWriteFile`,
`lib/fs.ts`) under the projection lock and re-read after the lock is taken, as jj does.

**An index a command cannot use.** A worktree whose index is missing, unreadable, or of a format version other than the
running build's, where § 2.5 gives it a projection, gets a full materialization that writes over no file it cannot read
without one (§ 2.5). Fan-out and the end skip a worktree whose index they cannot read or whose format version is not
theirs, leaving it to that worktree's own next command, so one checkout's build never rewrites another's index in a
format that checkout cannot read; checkouts on different branches can run different builds. The removal check answers
`unobservable` for a target whose index is missing, unreadable, or of another format version, its detail naming the
remedy — run the removal or release from that checkout, whose own build reads its index or rebuilds it at its start —
and the persist and release steps refuse with the same remedy.

#### 3.2 The projection lock

The projection lock is a per-worktree advisory lock (`acquireAdvisoryLock`, `lib/advisory-lock.ts`) in the worktree's
own Git directory, under `arc-projection/`, distinct from D17's worktree lock, which only blocks removal. A command
holds one projection lock at a time — its own across its write-back and refresh, then each sibling worktree's in turn
while replacing files there, and none across the rest of the command — so two writers fanning out cannot deadlock. A
writer takes a sibling's lock only while that worktree's Git directory exists, never creating it, and skips a worktree
removed while it waited. Fan-out and the end take a sibling's lock with a wait bounded at 200 ms (`maxWaitMs`,
`acquireAdvisoryLock`) and skip a sibling still held, since fan-out carries no correctness and the next sweep takes over
the second check; a command's start and the persist and release steps wait the lock's default bound, 10 s
(`DEFAULT_MAX_WAIT_MS`), before the timeouts § 2.2 and § 12.2 state. The lock is not reentrant: a process that asks
again for a lock it holds waits until `AdvisoryLockTimeoutError`, so a write made under a lock fans out only once it is
released (§ 2.2), and no step returns still holding one (§ 12.2).

#### 3.3 Change detection: Git's racy rule

A stat match means clean only when the file's modification time is older than the index's reference time; otherwise the
content is hashed and compared.

- **The reference** is a stamp file in the aside folder (§ 5.4), rewritten after each index write, so it shares the
  projected files' volume and clock even where a linked worktree's Git directory sits on another volume. A missing stamp
  makes every entry racy.
- **Smudging.** Every index write smudges each entry it carries over unchanged that is racy against the reference it
  replaces — its cached size zeroed, so the next check hashes it — after Git's index write
  (`ce_smudge_racily_clean_entry`), which hashes first and smudges only a changed entry; the entries a write records are
  racy against the new reference instead. Without the smudge a later write, a sibling's fan-out among them, would make
  the entry read clean and hide a same-tick save. A command that hashes a smudged entry clean re-records its stats,
  writing the index.
- **Why on every platform.** Modification times advanced every 0.33–0.55 ms on NTFS and every 10 ms on this Linux
  kernel, and a stat comparison alone missed 987 of 1,000 immediate same-size rewrites on Linux and 582 on Windows,
  where the racy rule missed none (`notes-storage-projection.md` § Spike 2).
- **File identity** — the inode, or Windows' file ID — is compared as a bigint (D13), as Git compares the inode on
  Linux. A changed identity sends the file to the hash, which catches a replacement that keeps its size and an older
  modification time (`cp -p`, `tar x`, a restored backup); an unchanged one never proves the file unchanged, since freed
  numbers recur on Linux (§ Spike 3). The swap's hard link keeps the staged file's identity, which the index records
  (§ 5.2). Every stat is read as a bigint.
- **Order.** The index and its reference are written before the staged file is put in place, so a save can only follow
  them, and one in the file's tick falls in the reference's tick too and reads racy. In the other order a save between
  the replacement and the index write read clean: 8 of 4,000 saves were lost on Linux and 40 on Windows that way, and
  none with the order reversed (§ Spike 1). A stop between the two leaves the old file, which equals its own stamped
  base, so write-back finds no edit and the next refresh replaces it.

#### 3.4 Blob ids and the record version

Blob ids are computed with `node:crypto` over the content as stored — LF-normalized, with the base stamp and any notice
line stripped, since the stored record carries neither — as `blob <length>\0` plus the bytes, in the repository's object
format, SHA-1 or SHA-256, never by spawning Git per file. The format is read as `extensions.objectformat` in the same
`git config --get-regexp` call that reads the `arc.*` keys (§ 15.3), so it costs no Git call; with the key absent it is
SHA-1, Git's default. Line endings are normalized to LF on read (D13). The contract returns no blob id, so the
projection computes both sides of every comparison itself; the format matters because the ref backend's stamp is the
stored content's Git blob id (`spec-storage-ref-backend.md` § 3.4), which holds only in the repository's own format.

- **Two identifiers.** The stamp's blob id names content alone; the compare-and-swap basis is the record version, which
  covers the record's metadata too, and the index records it beside each file's base. Write-back sends the record
  version the file's base names as its write's expected version (§ 7.1), so a version that moved only metadata merges as
  a fast-forward, its content equal to the base's.
- **The base after a write is read back.** What the store keeps can differ from what write-back sent — the backend
  stamps a missing `_Id:_` and merges a stale base (§ Spike 5) — so the index takes the blob id and record version of
  the record read back after the write as the file's base, never of what was sent.
- **What was written is kept apart.** Change detection compares a file against what the projection last wrote into it,
  which differs from the stored content wherever conflicts are drawn in, so the index keeps that blob id too (§ 3.1).

#### 3.5 Base-stamp recovery

D13's content heuristic recovers the base of a file whose stamp was deleted as noise or dropped by a whole-file rewrite:

1. Content that, stamp aside, equals a version exactly — the index's recorded version first, then the record's `history`
   newest first — takes that version as its base.
2. Otherwise the base is the closest by line diff among the index's version, the content the file's last persisted
   write-back took in (§ 3.6), and a bounded window of the newest versions; that content and then the newer version win
   a tie. A stale buffer that lost its stamp therefore still merges from its own last save, and the window reaches past
   the index's version because an editor's old buffer saved over a refresh would otherwise merge against the refresh and
   undo another writer's changes.
3. Content sharing nothing with any version merges against an empty base, as Git treats a file both sides added, so its
   clashes stay in the file and nothing is lost.

A stored version taken as the base goes to the store as the expected version (§ 7.1); the content a write-back took in
and the empty base, which the store never held, merge in the checkout (§ 7.7). Write-back restores the stamp.

`history` takes a reference and no bound (`lib/store/contract.ts`), and the ref backend answers it with one path-limited
`git rev-list` over the paths the record has had (`spec-storage-ref-backend.md` § 3.6), so its cost grows with that
record's history. The projection reads it only where it needs a stored version's content or record version, which the
index does not keep: stamp recovery here; a stale stored base for § 7.2's merge in the checkout; a conflicted file's
base (§ 6.6); placement of a stored hunk conflict (§ 6.3); a single-writer clash's base (§ 7.7); and, for a file other
than Markdown, the version a stopped replacement replaced (§ 3.7). Each arises only for a file with a stale base, an
open conflict, a lost stamp, or a stopped replacement, never on a command with none; a command makes at most one
`history` call per record, shared across the worktrees a fan-out visits; and the backend's own stale-base merge reads
the same history for that write. Where `history` refuses `state-unresolvable` — an ended item whose history this clone
has not fetched (`spec-storage-ref-backend.md` § 2.3) — recovery, placement, and a conflicted file's base pull nothing
at any command: recovery chooses between the index's version and the content taken in alone; placement shows the
conflict as a notice line; and a conflicted file keeps its version, pending and reported. Only a merge in the checkout
for a write is pulled, as § 8.4 pulls for a write the store refuses this way — at `arc save` and the persist and release
steps, never at another command's start, so no other start waits on the network.

#### 3.6 A stale buffer's save

Zed reloads no file changed on disk and saves over it without asking (§ Spike 1b), so after a write-back its buffer
keeps the stamp the write-back read, and its next save would merge against a base older than the person's own persisted
edit, putting back text they had since removed.

A save that carries the stamp the file's last persisted write-back read therefore merges from the content that
write-back took in, not from the stamp's version. A persisted write-back is one whose content reached the store, by
fast-forward or a clean merge; a refused, skipped, or conflicted write-back leaves the record as it was and is not one.

- **When it fast-forwarded,** the content taken in is the version it wrote, which goes to the store as the expected
  version.
- **After a clean merge,** it is a copy kept beside the index, under `arc-projection/` (§ 3.1), until a write-back reads
  a newer stamp: the content that write-back took in, each entry carrying the `_Id:_` the landed record gave it (§ 7.1).
  The store never held it, so it merges in the checkout onto the store's current version (§ 7.7): sent against the
  stamp's version, the store's merge would put the removed text back, and sent against the merged version it would drop
  the other writer's change (§ Spike 5).

A sibling's refresh in between changes nothing — the base stays the person's own last save, so the sibling's changes
merge in — and an editor that reloads, as VS Code does, saves the newer stamp and never meets the rule.

A file other than Markdown has no stamp to tell such a save from an edit of the refreshed file, so after a write-back
that merged cleanly, its next save takes the closer of the kept content and the merged version as its base.

#### 3.7 Files other than Markdown

A text file of any kind may sit in a projected root — `scratch/` above all, where D5 lets a person keep anything — and
D10 refuses binary content at persist but never skips a file. A stamp would corrupt such a file, so it carries none, and
its index entry stands in for it:

- **Its entry's version is its base,** so a file restored to an older version is an edit like any other.
- **A replacement in progress.** The index is written before a replacement puts the new file in place (§ 3.3), so while
  one is in progress the entry also records the version it replaces. The command's end clears that record once the file
  is in place, a refused move restores the entry at once, and otherwise the record waits for the next command. A file
  that does not match an entry still holding the record takes as its base whichever of the two versions it equals
  exactly, else the closer of them, so old content a stop left reads as unedited and is refreshed, never written back
  over the newer version (residual, § 17).
- **Otherwise** it is adopted, merged, and refreshed by the same rules as Markdown, conflict markers included, as Git
  writes them into any file. A protected one carries the read-only mode and the persist refusal but no notice line, and
  a conflict whose markers cannot be placed shows nowhere in it (§ 6.3).
- **An empty one** is read only once its modification time is 50 ms old, past the longest empty window seen mid-save (19
  ms, § Spike 3), since no stamp marks it as projected; a younger one waits for the next command.

### 4. Reading an edit

VS Code and Zed truncate a file before writing it, leaving it empty for up to 19 ms (§ Spike 3), so write-back never
reads a file mid-save:

- **An empty projected Markdown file is never an edit** — every one carries its base stamp — so write-back defers it
  rather than falling through to stamp recovery (§ 3.5). One that stays empty is a deleted file, which D13 rebuilds.
- **The settle rule.** A file modified within the last 50 ms settles first: two stats 15 ms apart, past Linux's 10 ms
  tick, must agree on size and modification time, up to three tries, else it waits for the next command. Only a command
  that follows a save that closely pays the wait.
- **A refresh** hands a file its re-check finds changed to write-back, which settles it or leaves it to the next command
  (§ 5.1).

### 5. Replacing and removing a file

#### 5.1 The replace guard

Before replacing a file, a refresh re-checks it against its index entry by the racy rule — the stat, and the content
hashed when the entry is racy — after Syncthing. On a mismatch it stops, takes the edit in through write-back, then
retries, capped at three passes.

- **Edit rights follow the worktree whose file holds the edit,** not the process taking it in, so a sibling's fan-out
  writes back the owning checkout's meta edit under that checkout's rights.
- **A clash is kept as a conflict,** never overwritten (§ 6).
- **A refused refresh** marks the file pending in the index, and the next command retries it: it is retryable, not an
  error.

The hash re-check was chosen over a stat-only re-check, which lost nearly every same-tick save, and over deferring a
racy entry, which deferred nearly every refresh on Linux (§ Spike 1). An exclusive open, reachable on Windows through
the raw `0x10000000` flag, is rejected: it fails an editor's save with `EBUSY` and closes nothing the hash leaves open.

#### 5.2 Moving the old copy aside

Every replacement of a projected file — a refresh, write-back restoring a stamp, a conflict written into the file — runs
the sequence Windows' `ReplaceFileW` runs with a backup name:

1. rename the file into the worktree's aside folder (§ 5.4);
2. hard-link the staged file onto the path;
3. check the aside copy as write-back checks any file, against its own base stamp or, for a stampless file, the base its
   name carries.

A save that lands between the re-check and the move, in place or by renaming a new file over the path, lands in the
aside copy: write-back settles it and takes it in as a stale save (§ 3.6), and the guard's retry replaces the file
again. A save that recreated the path first makes the link fail, and the replacement yields to it.

**The second check.** A command keeps its aside copies until it ends, then takes each worktree's projection lock again
and checks each copy again before deleting it, since a save that opened the file microseconds before the move can write
after the first check. Only the writer checks and deletes its copies while it runs, except that a removal or release of
the checkout takes over a copy once it has settled (§ 12.2). The sweep takes a copy over only once its writer has
exited, so no sweep cuts short the delay the second check relies on.

**A copy whose edit is refused.** An aside copy whose edit write-back refuses or cannot parse is never deleted while its
edit stays refused — at the first or second check, at the sweep (§ 5.4), or at a removal's or release's takeover
(§ 12.2, § 12.3). Where its path still holds what the replacement linked, by the racy rule against the index entry, the
copy is swapped back onto the path — the replacement's file moved aside, then checked and deleted as any aside copy is —
and the file is marked pending and stays a refused edit, reported, as a refused removal's edit goes back to its path
(§ 5.6). Where the path is absent, the copy is linked back to it (§ 5.4) and stays there as a refused edit. Otherwise
the copy stays in the aside folder, reported with its path as a refused edit: each command's sweep sends it again,
keeping it while it stays refused, so a refusal that clears on its own clears there, and a removal's or release's
takeover sends it as its own write (§ 12.2, § 8.4); it goes once its edit lands or the person deletes it.

Evidence (§ Spike 1b): on Linux, saves timed into the interval lost none of 40,000 with the second check and 7 without
it; on Windows the swap, run without the second check, lost only two saves its harness mistimed. A rename over the file
lost up to 1,255 of 2,000 replace-style saves on Linux and 363 of 1,000 on Windows, and holding a descriptor across the
rename saved in-place saves only. A replacement costs 62–85 µs on Linux and 1.5 ms on Windows at the median, against
20–61 µs and 0.48 ms for a rename over the file.

#### 5.3 The path is briefly absent

Between the move and the link the path is absent: a median 10 µs on Linux and 0.85 ms on Windows, longer while the host
stalls (0.64 s once on Windows). The projection never meets the gap, since it reads under the projection lock. Any other
reader can, while a refresh replaces that very file:

- Tight-loop readers got `ENOENT` on 0.33% of reads on Linux and most reads on Windows. A save that opens the existing
  file without creating it fails visibly there rather than being lost; no tested editor saves that way.
- VS Code reloaded the file as it does after a rename, never marking it deleted even at twenty swaps a second, and Zed
  showed nothing. A watcher on Linux sees the file moved away and created where a rename over it reports one rename; on
  Windows both report it removed and re-added.
- A holder that shares delete access, as Node does, lets the move proceed, and its later writes land in the aside copy,
  which the second check reads. One that does not refuses with `EBUSY`, which the bounded retry
  (`retryTransientFileSystemRefusal`) covers. The same readers starved a rename over the file on Windows — 23 of 24
  refreshes gave up after 200 retries — and never held up the move.

#### 5.4 The aside folder and its sweep

Each worktree has one aside folder, `.arc/system/.local/projection/`, holding the aside copies, the staged files, and
the racy reference stamp (§ 3.3), which the sweep leaves alone.

- **Placement.** It sits inside the worktree, since a rename or link cannot cross volumes and a linked worktree's Git
  directory may sit on another. Its parent, `.arc/system/.local/`, is a folder for machine-local files alone, beside
  `.internal/`, where tracked machinery sits with ARC's other per-worktree machine-local files. Write-back and adoption
  never scan `.arc/system/`, `arc update` deletes only files its manifest listed (`lib/manifest/apply.ts`), the exclude
  writer ignores the folder (§ 11.1), and `MACHINE_LOCAL_PATHS` registers it (§ 12.9).
- **Names.** Each aside copy and staged file is named for its role, its file's path, the base blob id of the version it
  replaced, its writer as `lib/advisory-lock.ts` identifies a lock's holder — the process ID with its per-process
  instance, and its process scope where the lock records one — and a per-move nonce, so no two moves share a name. A
  staged file is created exclusively.
- **The sweep.** A command that stops mid-swap leaves its copy behind — the state `ReplaceFileW` leaves when it fails
  after the first rename — so every command sweeps the folder under the projection lock before write-back's scan,
  touching only copies and staged files whose writer has exited. A copy whose path is absent is linked back, yielding if
  the path has reappeared; every other copy is checked against its base, a stampless one against the base its name
  carries, and an edit it holds is taken in, a refused one kept as § 5.2 states; leftover staged files are deleted. With
  no usable index (§ 3.1) it takes nothing in: a copy whose path is absent is linked back, where § 2.5's rule reads it
  as a file; one whose blob id, its stamp set aside, equals its base's is deleted; and every other stays in the folder,
  withheld by the new index and reported with its path, left by later sweeps and the persist step until the person
  deletes it (§ 2.5).
- **Liveness.** The sweep judges a writer's liveness as the lock does: a process ID still in use keeps its copies, so a
  reused ID delays the sweep's takeover until that process exits and never loses a copy.

#### 5.5 Rebuilding an absent file

Rebuilding an absent file is the swap's link alone, which fails if the path has reappeared, and then yields: Vim,
Neovim, and Emacs leave the path absent or empty mid-save (§ Spike 3). The link lost no save, against up to 407 of 1,000
for a rename and up to 401 failed editor saves for `copyFile`'s exclusive flag (§ Spike 1). A save from a buffer older
than a refresh carries the old base stamp, so write-back merges rather than reverting the refresh: VS Code prompts
before such a save, and Zed neither reloads nor prompts (§ 3.6).

#### 5.6 Removing a file

Removing a file whose record moved, was archived or renamed, or left the in-flight view is the swap without the link:
the same re-check, an edit taken in through write-back against the record the file was projected from, then the file
moved aside and its copy checked and deleted like any other. An edit write-back refuses — to a record now archived, say
— goes back to its path by link and stays there as a refused edit, reported, with the removal check refusing over it
(§ 12.2); each later command retries the removal until the person resolves it. A withheld file (§ 2.5) is never removed,
by a refresh or by the rebuild (§ 15.2): it stays at its path, withheld and reported, until the person deletes it.

### 6. Conflicts in the file

A conflict reaches a projected file one of two ways. **A conflict the store files** — at a write's stale-base merge
(§ 7.1) or a pull's merge (`spec-storage-ref-backend.md` § 6.4) — is a conflict record every checkout reads, and
write-back and refresh draw it into the file from the record (§ 6.3). **A clash found in the checkout** — a merge with
no stored base (§ 7.7) — is written into its file as markers and never stored.

Either way the shape is D13's: markers around the clash for a merge surface, the store's side first, as Git draws the
current side first, labelled with each side's machine or session and time — for a clash found in the checkout, the
store's side by its record version (§ 7.7) — parsed back at persist; and, for a whole-record conflict, the store's
version with a notice line beside its base stamp, naming the conflict record, the other side, and the remedy (D4, D6).
Only a pull's merge files a whole-record conflict, since its record names a version a hand edit lacks
(`ConflictRecordValueSchema`, `lib/store/conflict.ts`), and the store refuses a stale write to a single-writer record
rather than merging it (§ 7.7). This section fixes what D13 leaves to the engine.

#### 6.1 Marker length

Markers are standard Git markers at length seven, after jj. When a side already holds a marker-like line — a Markdown
setext underline of `=======` is one — the length grows to the longest such line plus four, and the index records it.
Git's own merges vary the length the same way through the `conflict-marker-size` attribute, which is the idiom here, not
a rule that reaches gitignored files.

Parsing matches markers of exactly the recorded length, which is stricter than jj's ignore-shorter rule
(`parse_conflict`, jj's `lib/src/conflicts.rs`) once a person adds a longer run while resolving (§ Spike 4); untouched
markers keep the conflict open. D13's rule for malformed markers stands over jj's: that entry's persist refuses with a
typed remedy, where jj degrades the hunk to text. Malformed means an incomplete set at the recorded length — a start,
separator, or end marker with the rest of its set missing.

#### 6.2 Escalated conflicts carry a resolve-by-hand line

VS Code's conflict actions read markers by a seven-character prefix, so a side holding `=======` is mis-split at any
length; escalation makes ARC's parse right, not VS Code's. An escalated conflict therefore writes, right after its start
marker, an HTML comment telling the person to resolve the conflict by hand and delete that line with the markers, and
the parser reads the line as part of the marker set. Every VS Code action on a mis-split conflict then leaves the line
or the real separator behind and is refused as malformed, where Accept Current alone would have dropped part of its side
unseen; a hand resolution that removes the markers and the line persists. Length-seven conflicts carry no such line,
since VS Code's actions handle them correctly (§ Spike 4).

#### 6.3 Where the markers come from

A conflict the store filed is drawn into the file when write-back or a refresh replaces it with the record:

- **An entry conflict** goes around the entry its `_Id:_` names.
- **A hunk conflict,** which its record locates by a base line range (`TextConflictRecordSchema`,
  `lib/store/conflict.ts`), is placed at its start line moved through a diff from the base content into the content
  being written (`relocateTextOffsets`, `lib/store/concurrency/line-merge.ts`), spanning as many lines as the record's
  current side holds (`currentLines`), and accepted only where those lines equal the current side and the line beside
  each end of them equals the line beside the base range in the base content, or the file's edge where the range meets
  one. The base content is read through `history` (§ 3.5) at the record's `baseVersion` — a write's expected version, or
  a pull's merge base — and a null `baseVersion`, where the base held no such record, places from empty content. The
  incoming side's count (`incomingLines`) draws its lines between the markers exactly, since a side of no lines and a
  side of one blank line both store as empty content (`spec-storage-ref-backend.md` § 3.7).
- **A placement that fails the check** shows that conflict as a notice line beside the base stamp, in the idiom of D13's
  whole-record notice and stripped at persist as every notice line is (§ 3.4), naming the conflict record, the incoming
  side's machine or session and time, where that side reads — where its markers show, and in status (§ 18) — and the
  remedy, `arc save --resolve <conflict>` (§ 6.5); never markers placed by guess. The line only shows the conflict:
  refresh writes it while the conflict is open, and deleting it changes nothing. An entry merge's prose hunk with lines
  on both sides of an entry carries a base range spanning that entry, and no single span of the merged content holds its
  sides (`mapConflicts`, `lib/store/concurrency/entry-merge.ts`), so the check rejects it and it shows as a notice line.
- **A file with no stamp,** which a notice line would corrupt, shows such a conflict nowhere in the file; status and the
  refusing verbs report it (D13), and the index records it (§ 3.1).

The index maps each marker set and each notice line to its conflict record, or marks a marker set found in the checkout
(§ 7.7). The content as sent is never stored, so no worktree but the writer's could run the merge again; placement is
what lets every checkout show the clash.

**Evidence** (§ Spike 6): over 3,893 hunk conflicts from random three-way merges of repetitive Markdown, each then
edited at random, the check gave these rates for the conflicts later edits left untouched:

| Later edits      | Placed right | Shown as a notice line | Placed wrong, unseen |
| ---------------- | ------------ | ---------------------- | -------------------- |
| None, write time | 99.9%        | 0.1%                   | 0                    |
| 1                | 96.8%        | 3.2%                   | 0.03%                |
| 5                | 83.9%        | 16.1%                  | 0                    |
| 20               | 56.8%        | 42.9%                  | 0.35%                |

Later content is what a checkout meets when it renders the record after further writes — a materialization, a catch-up
past the version that filed the clash, or, on another machine, routinely, the pull that brings the clash with the writes
made after it; only on the machine that filed it does a fan-out normally render the filing version itself. Checking the
current side alone, which an empty side reduces to no check, let up to 3.5% through. Of the clashes a later edit
touched, the check still accepted a wrong place for 1 of 65, 5 of 297, and 10 of 1,049 (§ 17).

#### 6.4 Parse-back

- **Markers left as they were** keep a stored conflict open, and write-back sends the store's side in their place, so
  the record keeps it.
- **Markers replaced by text** send that text, naming the conflict in `resolves`, which the backend accepts under
  `write-back` (§ Spike 5): the resolution rides the file's own write in the command's write-back, never after a plain
  write of it.
- **A conflict already resolved elsewhere** is dropped from `resolves`, and its replacement text is sent as an ordinary
  edit for the store to merge.
- **Malformed markers** refuse the persist of the entry holding them, or of the whole file for prose, with a typed
  remedy (§ 6.1).
- **Held at removal.** A file with a stored conflict open — shown by markers or a notice line, or recorded in its index
  entry alone — or holding a clash found in the checkout (§ 7.7) is held by a conflict at teardown (D13), and resolving
  it is the remedy (§ 12.2).
- **A clash found in the checkout** keeps its file pending while its markers stand (§ 7.7).

Write-back reports every resolution it sends (§ 2.2).

#### 6.5 `arc save --resolve <conflict>`

A conflict shown without markers — a whole-record conflict's notice line (D13), a hunk conflict's notice line (§ 6.3),
or one a file with no stamp cannot show — resolves by `arc save --resolve <conflict>`.

- **What it sends.** It attaches the conflict to its subject file's write in the command's own write-back, under `save`,
  sent even when the file is unedited: edited by hand first, the text is the resolution; unedited, it keeps the store's
  side. A withheld subject file (§ 2.5) is never sent: the option refuses, naming § 2.5's remedy.
- **What it resolves toward.** The store's side, or a content-only edit the kind's write check admits. Another side — a
  removal, a field only a verb sets, a changed placement — takes D4's route of redoing the change through its verb.
- **Keeping the store's side** sends content identical to the stored record, by markers (§ 6.4) or by the option. The
  backend never treats a put naming an open conflict in `resolves` as a no-op: its commit removes the conflict record,
  and the subject's record version and `history` stay as they were (`spec-storage-ref-backend.md` § 5.2), held by a
  merge item in its shared suite (its § 14.2).

`arc save` reports every resolution it sends (§ 2.4).

#### 6.6 A conflicted file keeps refreshing

D13 keeps a conflicted file refreshing. The refresh is a three-way line merge (`mergeLineText`,
`lib/store/concurrency/line-merge.ts`) whatever the kind's mechanism, since an entry conflict's markers hold two
versions of one entry under one `_Id:_`, which entry merge refuses (`entryFrame`,
`lib/store/concurrency/entry-frame.ts`): the stored version the file was rendered from, read through `history` (§ 3.5),
as the base, the store's newer version as the current side, and the file, markers included, as the incoming side.

- **A marker set whose conflicts have all closed** — resolved from another checkout — leaves the incoming side first
  when the file is unchanged since the projection wrote it, so the file takes the resolution rather than waiting on it.
- **A notice line whose conflict has closed** leaves at the same refresh, since refresh writes notice lines only for the
  conflicts still open.
- **Where the store's change overlaps a marker set still open,** the file keeps its version, pending and reported, until
  the person resolves it, and each later command tries again (amendment, § 16).

Over random edits the merge placed every marker block it did not report as an overlap, but for a line merge's own
residual of under 1% (§ Spike 6).

### 7. Write-back: parse, send, check, persist

#### 7.1 Parse, send, and the store's merge

- **Parse.** Write-back reads a hand-edited file through its kind's parser, from the production registration set
  (`lib/store/kinds/registrations.ts`), and skips and reports a file that fails to parse (D13).
- **Send against the base.** It sends each edited file's content with the record version its base names as the expected
  version (§ 3.4), under `write-back` provenance (§ 7.4). A primary record's write carries its current placement
  unchanged, as `MutationSchema` requires (`lib/store/write.ts`) — the read form less its `sequence`, which
  `WritePlacementSchema` rejects — and never a reference, a changed placement, a former slug, or a link (§ 7.3).
- **The store merges a stored base.** Where the store has moved past that version, the backend merges the base, its
  current version, and the edit by the kind's mechanism — line merge for prose, entry merge for entry lists — keeps its
  current side at each clash, and files each clash as a conflict record in the record's family, each side labelled with
  the machine that wrote it (D3, D6), which the ref backend reads from each commit's `Arc-Actor` trailer
  (`spec-storage-ref-backend.md` § 3.7). Write-back merges and labels nothing there, and the merge runs under the
  backend's write serialization, so no writer lands between the merge and its write. The merge's conflict records are
  its own, committed under the verb `merge` whatever verb the write carried (its § 5.5), and the backend parses the
  merged content, refusing `record-malformed` where a line merge of two valid versions fails its kind's parser (its
  § 5.1).
- **Read back.** The landed write returns its version and conflict references, and write-back reads the landed record
  and replaces the file with it, its conflicts drawn in (§ 6.3); the index takes the record read back as the file's base
  (§ 3.4).
- **Entries typed by hand.** Before sending, and before any merge in the checkout, write-back gives an entry with no
  `_Id:_` the ID its base carries for the same entry, matched by a heading, or in a field-header list a field header,
  that the base holds once. An entry its base lacks is left for the backend to stamp. The ref backend's seed — the put's
  reference, expected version, and content (`spec-storage-ref-backend.md` § 5.1) — gives a retry of the same content
  after a stop the IDs its first landing took, so over it the entry lands once, which its suite holds
  (`spec-storage-ref-backend.md` § 14.3); a retry after a further edit does not (residual, § 17), and the reference
  backend draws at random (§ 7.3), so over it any retry lands the entry twice. A merge in the checkout needs every
  side's IDs first, since `entryFrame` throws on a missing one, so it stamps its own copy (`stampEntryIds`,
  `lib/store/concurrency/stamp.ts`), drawing from a SHA-256 stream seeded by the record's reference, the base content,
  and the file's content, so § 7.7's result, sent again after a stop, carries the same IDs: § 7.2's merge, which only
  computes the check's `next`, sends the edit as it is, and § 7.7's, whose result is what goes to the store, sends that
  result carrying the checkout's IDs, which the backend keeps. An entry the stamp cannot give an ID — a field-header
  entry with no `_Remove when:_` line, without which `stampEntryIds` throws — is a refused edit, `record-malformed`
  naming the entry, as the ref backend refuses it (its § 5.1). The copy a write-back keeps after a clean merge takes the
  IDs the landed record gave its entries (§ 3.6). Without it, an editor that never reloaded re-saves the entry the
  backend stamped, the stamp gives it a second ID, and a merge over another writer's edit to that entry keeps both
  copies and reports no conflict (§ Spike 5). A duplicated `_Id:_` left by an editor's "accept both" gives the second
  entry a fresh ID (D13's parse-back), and the backend refuses any duplicate that remains as `record-malformed` naming
  it (its § 5.1, § 5.2).

Three cases have no stored base for the store to merge from, and § 7.7 merges them in the checkout. § 7.8 states what
write-back does with each refusal the store returns.

#### 7.2 The write check

Write-back persists the merged result only if the kind's write check, registered beside its parser, admits it
(`spec-seam-record-kinds.md` § 3.1). Write-back and `arc save` call the check with:

- **writer** — a hand edit, `{ kind: "hand-edit" }`;
- **the record's reference**;
- **`prior`** — the store's current version, carrying its content and parsed fields, or its content alone when it fails
  to parse, so the shape rules check the edit whole and a hand edit can repair a record a merge or an import stored
  broken; absent for an adopted file, which the store does not yet hold;
- **`next`** — the merged content with its parsed fields — the store's merge, run in the checkout with the same library
  over the base's content, read through `history` where the store has moved past it (§ 3.5) — never the file alone: a
  verb that changed `State` since the file's base merges in, so an edit that left `State` alone never reads as changing
  it. Write-back sends no removal, since a deleted file is rebuilt (D13), so `next` is always present;
- **two views,** `before` and `after` (§ 7.3).

Write-back reports every rule the check returns. A change to a field only a verb may set is refused by the check, not by
the parser, which stays content-only (`cohort-storage-seam.md` § Shared contracts, item 11; `spec-seam-record-kinds.md`
§ 3.3).

#### 7.3 The `after` view

This work unit builds the `after` view, in `lib/store/projection/`; the record kinds ship none
(`spec-seam-record-kinds.md` § 3.1). `before` is the backend as write-back finds it. `after` answers `read` and `list`
for the written record from the pending write, its `conflicts` as `before` holds them, and everything else from
`before`, and its `lookup` is `before`'s for every kind.

- **Why that suffices.** Write-back writes content, carrying a primary record's current placement unchanged (§ 7.1), and
  never a reference, a changed placement, a former slug, or a link; it removes nothing, creates no primary record (a new
  stub mints through `arc stub`, § 9), and writes no machine kind, among them the Errand records, claims, and transition
  records whose fields lookup reads (`lookupReference`, `__tests__/helpers/store/lookup.ts`; `lookupTracked`,
  `lib/store/in-repo/lookup.ts`).
- **Commit lookups answer from `before` too.** The backends the projection runs over match a commit through the
  primary's task captures in its links (D3; `commitMatch`, `__tests__/helpers/store/lookup.ts`), which write-back never
  writes. Only the in-repo implementation's `lookupCommit` expands a task range against the task list, and there the
  projection is dark (§ 1.4).
- **The conformance case.** A view resolving differently would admit a write the backend then refuses, so a conformance
  case holds it: for each hand-editable kind, over each backend that runs checks, the `after` view built before a write
  answers `read`, `list`, and the slug, lineage, claim, and ref lookups as the backend does once the write lands,
  compared apart from each result's `version` and `asOf`, which only the landed write sets, and the written record's
  `conflicts`, which the landing's merge or `resolves` sets, with the conflict records the landing files or removes left
  out of `list` and `read`, and the `_Id:_` values the landing stamps on entries the write sent without one, which each
  backend draws itself — the ref backend from its seed, the reference backend at random (`spec-storage-ref-backend.md`
  § 5.1); the parse-back cases test what a write files or resolves (§ 6.4). The commit lookup stays outside it, since
  over those backends `before` answers it as they do by construction.

Each edited file persists as its own `write`, so `after` is the store plus that one write, and one refused edit blocks
no other (§ 2.4).

#### 7.4 Provenance

Write-back persists under the provenance verb `write-back` and `arc save` under `save`, each with the lifecycle action
`edit`. A backend reads those two verbs as a hand edit and any other as itself, so it enforces the authority rules where
the write lands, not only through this call (`spec-seam-record-kinds.md` § 3.2). The two names are one constant,
`HAND_EDIT_VERBS`, which the record kinds export beside `CallerProvenanceSchema` in `lib/store/links.ts`, and write-back
imports it.

Every other persist of a hand edit here runs under `write-back` too — the persist step, the release step, and their
takeover of aside copies (§ 12.2, § 12.3), even inside `arc teardown` — so no hand edit lands under a verb that reads as
itself; the removal check's projection part writes nothing and carries none. Write-back sets the provenance itself,
never from the file, so a hand edit cannot name another verb.

#### 7.5 Serialization refusals

D10's serialization rules, as the ref backend applies them — text only, a 1 MiB cap on projected kinds, `.env` and
private-key files refused, among others — are each a typed `record-malformed` refusal at persist, never a skip. The ref
backend enforces them in its `write` and `batch` through one pure function, `checkSerializationRules` (§ 18); write-back
and `arc save` report its refusal as any other, and the removal check's projection part calls the same function without
writing (§ 12.2), keeping no copy of the rules.

#### 7.6 Refused edits and empty slots

A refused edit — whether the write check or the backend's own check at the write refuses it — stays in the file and is
reported, never blocking the command (D13). The seam's members fill the parser and write-check slots; this work unit
consumes them. An empty slot needs no rule here: write-back is a contract `write`, which D5 lets land unvalidated, a
kind with no rules registers no check, and merge takes a kind's entry shape from its mechanism, not its parser.
Write-back is dark until the flip, so a missing parser or entry shape is the flip's to catch: `storage-cutover`'s
rehearsal confirms every hand-editable projected kind has its parser and every entry kind its entry shape (§ 18).
Write-back adds no rule for an entry kind whose grammar is not yet declared (Owner, 2026-10-13): where a backend refuses
one as a terminal `unhomed-kind` (`spec-storage-ref-backend.md` § 5.1), write-back reports it as a refused edit carrying
the backend's remedy.

#### 7.7 A clash found in the checkout stays in its file

Three cases have no stored base for the store to merge from:

- a stale buffer's save after a clean merge, whose base is the copy kept beside the index (§ 3.6);
- content sharing nothing with any version, whose base is empty (§ 3.5);
- the meta and task list, single-writer kinds the store refuses as `version-conflict` rather than merging (D3;
  `spec-storage-ref-backend.md` § 5.2), whose base write-back reads through `history` at the version the file's stamp
  names (§ 3.5).

Write-back merges each in the checkout with the same library (`mergeLineText`, `mergeEntryText`), onto the store's
current version, passing the base's record version in the library's input (`MergeTextInput`,
`lib/store/concurrency/line-merge.ts`) — null for an empty base and for the kept copy, which the store never held —
though no record these merges produce is stored. The library's side labels (`currentLabel` and `incomingLabel`, each a
`SideLabelSchema`, `lib/store/conflict.ts`) name this checkout's machine and the save's modification time for the edit,
and, for the store's side, whose writer only the store's commits carry (§ 7.1) — a history entry's provenance holds no
actor or time (`StoredProvenanceSchema`, `lib/store/links.ts`) — the record version it merged onto and the time
write-back read it.

- **A clean result** is sent against that current version like any edit (§ 7.1).
- **A clash** is written into the file with markers and the file stamped with the current version it merged onto, and
  nothing is stored: the file holds a conflict, is reported, and keeps the person's edit (D13). Once its markers are
  resolved it writes back as an ordinary edit against that stamp, which the store merges if it has moved again.
- **A meta or task list holding such markers** is never sent while they stand, so it is pending rather than skipped
  (amendment, § 16).

Such a clash is visible only in its checkout until it is resolved, as a Git working-tree conflict is: it holds an edit
that never reached the store, which only the person holding it can resolve, while a clash whose base is stored reaches
the store and every checkout (Owner, 2026-10-13; residual, § 17).

#### 7.8 What the store refuses

A refusal lands nothing, so the edit stays in its file and the next command sends it again.

- **`record-malformed`** — from the kind's parser, which a write's stale-base merge also runs over the merged content,
  from the write check the backend runs where the write lands, or from a serialization rule (§ 7.5) — leaves a refused
  edit, reported with its rule and remedy (D13).
- **`version-conflict` on a merge kind** sends write-back to read the record. A record no longer there takes the removal
  path's refused edit (§ 5.6), as the reference backend refuses a put to an absent record this way (`stale`,
  `__tests__/helpers/store/write.ts`). One still there means the expected version is not in its history
  (`spec-storage-ref-backend.md` § 5.2), so the stamp is treated as lost and the file goes to base-stamp recovery
  (§ 3.5), at most once per command.
- **`lock-held`** marks the file pending for the next command.
- **`state-unresolvable`** on a write to a completed item is § 8.4's, and **`unsupported` `unhomed-kind`** is § 7.6's.
- **A command stopped after a write lands** and before the index records it sends the edit again at its next run; where
  the first landing clashed, the store merges it a second time and files the same clash again (§ Spike 5), which the ref
  backend treats as correct (its § 5.2): a duplicate, visible conflict, never lost content (§ 17).

### 8. Edit rights and protected files

#### 8.1 Edit rights

D13's edit-rights rule stands, by lifecycle state and kind of file, not by projected folder: stubs are groomed by
anyone; the owner of a work unit in flight edits its prose from any checkout, while its meta and task list stay with the
owning checkout; an Errand's owner edits its description from any checkout; and another person's work items are
read-only except for routing inserts. Two cases D13 leaves open are settled here: a paused work unit (§ 8.3) and
archived work (§ 8.4).

#### 8.2 Three layers

D13's three layers stand: the notice line, the read-only mode, and the persist refusal.

- **The notice line** is ARC's own convention, modeled on Go's `Code generated … DO NOT EDIT.`, in an HTML comment
  beside the base stamp; no Markdown convention exists.
- **What the notice names** is where an edit can be made: for a work item a checkout on this machine holds, that
  checkout's path; for one no checkout here holds, `arc materialize <slug>` when the reader owns it — with `--here` and
  the checkout where a checkout with no marker still has the work branch out, as the paused-work slot's action does
  (`spec-seam-locus.md` § 4.4) — and its owner otherwise; for archived work another person owns, its owner (§ 8.4); and
  for a read-only source's file, the source (§ 14). It never names another machine, which nothing here records:
  work-unit markers are machine-local, and a pause records who paused, not where (amendment, § 16). The checkout it
  names comes from that checkout's marker, so it can lag a change there (§ 10.4).
- **The read-only mode is a speed bump.** VS Code honors it only under `files.readonlyFromPermissions`; Vim's and
  Neovim's `:w!`, Emacs's forced save, and Claude Code's Edit and Write all write through it and leave the mode at 0444
  (§ Spike 3). VS Code's Overwrite button sets the mode to 0644 before saving, and the file stays writable until a
  refresh next replaces it; Zed honors the mode. On Windows the read-only attribute blocks a rename over the file with
  `EPERM`, but not the swap: a read-only file moves aside and its copy deletes, and a read-only staged file links in, so
  nothing clears the mode (§ Spike 1b). Node's unlink, `git worktree remove`, and `git clean` delete read-only files on
  both platforms (§ Spike 1), so teardown and deletes need nothing.
- **The persist refusal is the real protection,** so it keys on the stat and content change, never on the mode, and
  names where to apply the edit from the machine's markers as they stand when it fires.

#### 8.3 A paused work unit

From the flip a pause is a section of the work unit's meta that changes neither `State` nor placement, replacing park,
and a paused work unit keeps its checkout until its owner releases it (`spec-seam-lifecycle.md` § 8.1). It projects
where any in-flight work unit does, under the same edit rights, and its protected files' notice follows § 8.2: its
owning checkout here, or, once no checkout here owns it, `arc materialize <slug>`, with `--here` where a checkout with
no marker still has the work branch out, since `arc resume` only clears the pause. From the flip `arc materialize` gives
a checkout to any in-flight work unit its owner holds no checkout of on this machine, remote-only or released here,
paused or not, and leaves the pause in place (`spec-seam-lifecycle.md` § 8.4), where today it admits only remote-only
work and skips parked work (`findMaterializableWorkUnits`, `lib/session-init/materializable-work-units.ts`). Until the
flip park stays as today, and the projection is dark (amendment, § 16).

#### 8.4 Archived work

The archived work unit's owner edits its files in `completed/` from any checkout, the meta and task list included, since
no checkout owns it, under each kind's write check; anyone else's archived work is read-only. A correction is a write to
the completed item in place, which keeps its archive number (`spec-storage-ref-backend.md` § 7.3), since no verb reopens
an archived work unit (`spec-seam-lifecycle.md` § 8.7).

- **When it persists.** Write-back does not scan `completed/` (§ 15.1), so a correction persists at `arc save`, at the
  persist or release step, or when a refresh touches the file.
- **A missing history ref.** Where this clone lacks the item's history ref, the write refuses `state-unresolvable`
  naming it (`spec-storage-ref-backend.md` § 7.3), as does a `history` read a merge in the checkout makes (§ 3.5).
  `arc save` and the persist and release steps pull that ref by name and retry once (its § 4.5); where the state remote
  lacks it too, the edit stays as a refused edit carrying the backend's remedy. At any other command's start, where a
  refresh touched the file, the refusal stays a refused edit whose remedy names `arc save`, and nothing is pulled, so no
  other command's start waits on the network (§ 15.2).
- **A new file** there adopts into its archived work unit the same way (§ 9), and the errata convention moves onto the
  store's history of the archived meta (§ 18).

### 9. Files the store does not know

Adoption follows the folder a new file appears in, since a work unit owns files by folder, not by name (D13), for a text
file of any kind (§ 3.7). A file's record comes from the layout classifier `seam-locus` builds beside `resolveArcPath`,
which inverts every registered address — a location plus a kind's file pattern — to a kind and key (`spec-seam-locus.md`
§ 3.3); this work unit registers its locations and the file names of the kinds it projects (§ 10.1), so one classifier
serves write-back, adoption, and `seam-locus`'s overlap check.

- **`active/current/` and a stub's folder under `backlog/`** — adopted into that work item.
- **A new folder under `backlog/`** — adopted as a new stub through `arc stub`'s minting path when it holds a meta that
  parses and names no `Owner` but the adopting identity. Its commitment tier and any cohort come from the path, and its
  priority, origin, design, and class from the meta as `arc stub`'s own parameters, while the verb renders every other
  field, `State` among them (`renderMetaFile`, `lib/work-unit/verbs/stub.ts`), and owns the stub to the adopting
  identity, as `arc stub` owns every stub to its caller (`handleStub`, `handlers/lifecycle.ts`). The one verb-owned
  value the meta supplies, `Class`, enters as `arc stub --class` passes it, validated the same way, so no other hand-set
  verb-owned value lands under `stub`; what else the file holds is then a hand edit of the minted record, written back
  and checked like any other.
- **A meta naming another identity as `Owner`** is not adopted, since `Owner` is verb-owned (`spec-seam-lifecycle.md`
  § 8.5): its folder stays ownerless, and the remedy has the person name themselves, adopt it, then run
  `arc handover <slug> --to <identity>`.
- **A new folder under `backlog/` without a meta that parses** — its files are ownerless: flagged in `arc status`, with
  the removal check refusing while they stay unadopted (§ 12.2), and the remedy naming
  `arc stub <name> --commitment <tier>` with the tier filled in, after which the folder's files adopt.
- **A path the classifier maps to no record** — `active/`'s top level, the identity root outside `scratch/`,
  `backlog/`'s top level, a commitment folder, or a quarter folder — refuses at persist, naming where such a file goes:
  `current/`, `scratch/`, or a work item's folder.
- **`active/in-flight/<slug>/`** — the owner's prose only, under the edit-rights rule (§ 8.1).
- **`completed/`** — adopted into its archived work unit under § 8.4's rules.

**Never adopted.** A derived view rendered into a projected root (`DERIVED_VIEWS`, `lib/store/registry.ts`) is never
adopted. Nor are editor side files — `*~`, `.#*`, `#*#`, `.*.sw?`, `4913`, and `*.tmp.<pid>.<hex>` from the terminal
editors and Claude Code (§ Spike 3); VS Code and Zed add none — or the folder files operating systems write —
`.DS_Store` and `._*` on macOS, `Thumbs.db` and `desktop.ini` on Windows, and KDE's `.directory`. The match runs on the
file name before any other test, since Emacs's `.#name.md` lock is a dangling symlink ending in `.md`. Nor is a file at
a path `MACHINE_LOCAL_PATHS` lists (§ 12.9) — the identity's `.internal/` and each workspace's among them — which the
projection neither persists nor refreshes (D5): write-back's walk skips those folders (§ 15.1).

### 10. The `active/` layout

#### 10.1 `active/current/` and `active/in-flight/<slug>/`

The projection lays out `active/` as D13 settles: `active/current/` holds the work item this checkout's marker names — a
work unit's files flat, with a copy of each cohort document its `Cohort` field names, or an Errand's description — and
`active/in-flight/<slug>/` holds the other in-flight work items the view setting selects (§ 10.4), the checkout's own
never among them. Folders exist only when they have members, and both inboxes always project. The cohort companion is a
second projected path of one record beside its home under `backlog/`; both stay writable, and the refresh after a
persist updates the other path.

The paths come from the layout resolver (`resolveArcPath`, `lib/layout/projection.ts`), whose schema
(`lib/layout/schema.ts`) gains the two locations and the addresses of the kinds whose file names the projection defines:
`<name>-<slug>.md` for a work unit's companions, `spec-<slug>-prd.md` and `spec-<slug>-rfc.md` for a paired spec's
halves, `inbound-<slug>.md`, `errand-<slug>.md` for an Errand's description, and `scratch/` documents, each keyed by its
path. `resolveArcPath` then resolves every projected path, and `seam-locus`'s classifier inverts it (Owner, 2026-10-13;
§ 9). A record projects only where the schema holds an address for its kind: a projection-defined kind with none
projects nothing, the Errand queue among them, which D13 keeps a machine record `arc` reads (`personal/errand-queue`,
`lib/store/registry.ts`).

#### 10.2 Ordering

`active/current/` lands only after `seam-locus` resolves the current work unit from the checkout marker plus the store,
since today's resolver reads `active/` without recursing, and takes session-init's slot paths and the compaction seed's
from the layout resolver (D13, Ordering; `spec-seam-locus.md` § 2.1, § 4.9). This work unit depends on `seam-locus`
(§ 1.1), so the order holds by landing.

#### 10.3 The revert key

D13's one layout-resolver setting is a project key in `arc-config.yml`, `layout.active`, taking `nested` (the default)
or `flat`, where `flat` lays the checkout's work item flat in `active/` and leaves everything else unchanged. It is a
project key, not a personal one: docs, workflows, and agents reach paths through the layout resolver, and a personal key
would let two people's instructions point at different paths. It follows the file's flat, dotted key form, and it stays
until the layout has seen use (D13).

#### 10.4 The in-flight view setting

The setting — `mine` (the default), `cohort`, or `all`, plus named pins — is personal. It lives where personal settings
live today, `arc.*` keys in `git config --local`: `arc.inflightView`, one value, and `arc.inflightPin`, one entry per
pinned slug. It moves with the other personal keys when `config-storage-architecture` builds its per-developer tier
(§ 18).

The index records the effective setting, pins included, the identity, and the checkout claim the worktree was projected
under. A command that reads a different one reprojects what it governs: views added, a file leaving a view through the
removal path (§ 5.6), the personal roots following a changed identity, and `current/` with the notices naming an owning
checkout following a changed claim, since a release, a promotion, or a materialize changes the marker without a store
write.

A notice here that names another checkout as the owner reads it from that checkout's marker, which this index does not
record, so it can lag a release, promotion, or materialize there until that file's record next changes, a primary re-lay
rewrites it (§ 15.2), or a reprojection here; the persist refusal behind it names where to apply an edit from the
machine's markers as they stand when it fires (§ 8.2; residual, § 17).

#### 10.5 The isolation invariant and its test

Per-worktree isolation becomes "`active/current/` holds only this checkout's work item" (D13). An integration test over
the reference backend holds it: spawn a worktree for a work unit from base, and assert that `active/current/` holds
exactly that work unit's files plus a copy of each cohort document it names, that `active/in-flight/` holds exactly the
views the setting selects, and that `active/`'s top level holds nothing else. The test checks the layout the
documentation states, and adds no guard on today's flat layout, which the flip replaces. `storage-cutover`'s
documentation pass rewrites `strategy-work-organization.md` § Per-Worktree Isolation and its acceptance test to match
(§ 18).

### 11. Ignoring, finding, and editor settings

#### 11.1 The exclude writer

`ensureGitExcludePattern` (`lib/git/exclude.ts`) generalizes to a path list — one Git call and one write, which matters
at Windows' 32–42 ms a Git call. ARC writes the entries once per clone, when it first projects (D13). The list derives
only from the layout registry's projected roots and the `.arc/system/` paths a source projects (§ 14), never from a list
kept by hand, and adds `.arc/system/.local/`, which holds the aside folder (§ 5.4). `.arc/user/*/` stays in
`.gitignore`, never in the exclude file.

#### 11.2 The guard

The guard runs where those entries are written and before the projection writes into a root: one
`git check-ignore -v --stdin` over the roots and the aside folder refuses a path no rule ignores, and `.arc/user/*/`
must match a rule whose source is `.gitignore` itself, since `npm pack` reads only `.gitignore`. A match on a `!`
pattern, which `git check-ignore -v` prints and counts as a match, reads as not ignored. The refusal is typed and
recoverable, naming the missing line, and the projection writes nothing into that root until it is repaired.

Before a write into a root the guard runs only when an ignore file may have changed. When it passes, the index records,
for `.git/info/exclude` and each `.gitignore` on the path from the repository root to every projected root and the aside
folder, whether it exists and its stat, and a command skips the call only when each still matches and none is racy
against the index's reference (§ 3.3), so a refresh or fan-out pays nothing for it. These records take the smudge rule
as entries do: an index write that carries one over unchanged while it is racy against the reference it replaces smudges
it, so the next write into a root runs the call.

#### 11.3 ARC's managed `.ignore` block

The ripgrep family of search tools reads `.ignore` above `.gitignore` and `.git/info/exclude`, so a root `.ignore`
re-including all four projected roots makes them searchable there (D13). `arc init`, `join`, `reconfigure`, and `update`
write it as ARC's managed block through `writeArcGitignoreBlock` (`lib/template/files.ts`), which already takes the
file's path and rewrites only its own block, so a repository's own lines stay; the file is tracked. It lands live before
the flip in every repository the verbs run in (§ 1.4), where it changes only what search finds: the three shared roots
are tracked and no rule ignores them, and `.arc/user/*/`, the one root ignored before the flip, becomes searchable as it
will be from the flip.

#### 11.4 Editor settings

Editor settings are opt-in, never written by default (D13).

- **`arc editor <vscode|zed>`** merges only ARC's keys into the checkout's settings file, keeping its comments and other
  keys, and `--remove` takes them back out, after Yarn's `yarn dlx @yarnpkg/sdks vscode`. It edits the file through
  `jsonc-parser`'s `modify` and `applyEdits`, which the CLI already bundles for Markdown lint configuration
  (`lib/markdown/configuration.ts`).
    - **VS Code** takes one key in `.vscode/settings.json`, `files.readonlyFromPermissions: true`, so it honors a
      protected file's mode (§ 8.2); the tracked `.ignore` already re-includes the projection for its search and
      quick-open.
    - **Zed** takes a project-level `file_scan_inclusions` in `.zed/settings.json` listing the four projected roots
      after Zed's `"..."` entry, which keeps its default `.env*` inclusion that an explicit list would otherwise
      replace.
- **`arc init`** prints, once per machine, the one user-level Zed setting, the same `file_scan_inclusions` list for
  Zed's user settings (D13).
- **Nothing else.** Editors in the ripgrep family need nothing. JetBrains IDEs list gitignored files in the project
  tree, highlighted as ignored, and ask to clear a file's read-only status before editing it.

Before the flip `arc editor` refuses `unsupported` and `arc init` prints no Zed setting (§ 1.4).

#### 11.5 This repository's ignore files

This repository's `.gitignore` drops its `.ignore` line, which ignored the file for Marksman, against ADR-035's tracked
`.ignore`; the line sits outside ARC's managed `.gitignore` block, so dropping it is a hand edit, landing with the first
chunk (§ 1.3). The primary's untracked `.ignore` holds one personal Marksman line hiding `packages/arc-framework/arc/`;
it is deleted before the managed `.ignore` block lands, and the line is not carried over. The package copy is the
authoritative source for framework edits, and in `.git/info/exclude` the line would hide it from ripgrep-based search,
agents' included, in every worktree of the clone (checked with ripgrep 14.1.1, where Git ignores the line for tracked
files).

#### 11.6 The `.worktreeinclude` copy

The `.worktreeinclude` copy (`copyWorktreeIncludes`, `lib/git/worktree-include.ts`), which every spawn runs through
`lib/git/linked-worktree-setup.ts`, copies each untracked file in the primary that a `.worktreeinclude` pattern matches
into the new linked worktree when that worktree ignores it — editor settings and `.env` files above all. From the flip
the projection's files are such files, and the copy runs before the projection lays out the new worktree, so a broad
pattern would seed it with the primary's: its own work item's files in `active/current/`, which adoption would then take
into the new checkout's work item (§ 9), and copies whose stamps and unsaved edits the new index does not know. From the
flip the copy therefore skips every match under the projected roots and `.arc/system/.local/` — the list the exclude
writer takes (§ 11.1) — and the projection fills them itself (§ 2.5). Before the flip the copy runs as today.

### 12. Worktrees

#### 12.1 The worktree lock

D17's lock goes on every linked checkout ARC spawns for a work unit or an Errand, as the spawn's last step, once its
work-unit marker names that work unit or Errand:

- **The spawns** are a work unit's through `reconcileWorkUnitWorktree`
  (`lib/work-unit/mutators/reconcile-work-unit-worktree.ts`) and graduation's (`lib/work-unit/atomic-graduation.ts`),
  and an Errand's through `provisionTransientLocus` (`lib/locus/provisioning.ts`). No shipped code spawns a checkout for
  a grooming or housekeeping claim: `provisionTransientLocus` is reached only from `arc errand open` and
  `arc errand materialize`, both for an Errand.
- **It keys on the spawn,** never on the capability, so it holds before the flip as after.
- **An anchored checkout is not locked.** A checkout claimed in place with `arc start --here` is not ARC's spawn, and
  another tool may own and remove it. Today it gets no marker (`writeWorktreeOwnershipMarker` writes none when
  `createdByArc` is false); from the flip it gets one with `spawnedByArc: false` (D17), which gives it a projection
  (§ 2.5) and grants no removal (§ 12.3).
- **One reason.** Every such lock carries one reason, `PROJECTION_LOCK_REASON`, the constant `seam-lifecycle` exports
  with the removal function (`spec-seam-lifecycle.md` § 11.1), naming the exits of both kinds — `arc teardown` for a
  work unit's checkout, and `arc errand close`, `abandon`, or `leave` for an Errand's — since Git prints the reason in
  its refusal ("cannot remove a locked working tree, lock reason: …", checked on Git 2.55). The reason is how the
  removal function tells the projection's lock from anyone else's: it unlocks only a lock whose reason matches exactly,
  and refuses any other as `locked`, naming `git worktree unlock`. One reason for both kinds lets promotion, which
  rewrites a spawned Errand's marker to its work unit's (`convertSpawnedMarker`, `lib/errand/promote-runtime.ts`), leave
  the lock alone, as it must: `git worktree lock` refuses a worktree already locked (checked on Git 2.55). The reason
  names no slug, so a rename leaves it true.
- **After the spawn succeeds.** Spawn rollbacks — `rollbackSpawnedWorktree` (`commands/start.ts`), graduation's,
  `reconcile-work-unit-worktree.ts`'s fresh-spawn rollback, and the transient claim's `rollbackSpawned`
  (`lib/locus/provisioning-runtime.ts`) — remove with one `--force` or none, either of which a lock refuses, so the lock
  waits until the spawn has succeeded.
- **Machinery checkouts** carry no such marker (§ 2.5), so they get neither a lock nor an index and are removed as today
  (amendment, § 16).

**How a locked checkout leaves.** Every removal ARC runs of a checkout it locks runs the seam's removal function
(§ 12.2), so ARC removes a locked checkout only that way. A person removes one through the exits, after
`git worktree unlock` (§ 12.6), or by forcing past the lock with `git worktree remove -f -f`, which D17 allows and Git's
refusal suggests, and which skips the persist step (residual, § 17).

#### 12.2 The removal check and the persist step

`seam-lifecycle` builds the removal check and the removal function and moves lifecycle's callers onto them; `seam-locus`
moves the Errand's exits and the session-init sweeps (`spec-seam-lifecycle.md` § 11; `spec-seam-locus.md` § 12.1). The
removal check reads only and takes no lock, and returns `removable`, `missing` when only Git's registration remains, or
`refused` as `dirty` with the changed paths, `unobservable` with its detail, `locked` with the lock's reason when a lock
the projection did not set holds the checkout, or `persist-would-refuse` with a remedy. Its Git part reads what today's
`isWorktreeClean` reads (`lib/git/worktree-cleanup.ts`). With the checkout's folder present, the removal function runs
the check, the persist step, `git worktree unlock` when Git lists the checkout locked with the projection's reason, and
a plain `git worktree remove`, and returns `removed`, `pruned`, `refused` with the check's result, or `failed` naming
the step. The function takes this work unit's three slots (`ProjectionRemovalSlots`, `spec-seam-lifecycle.md` § 11.2),
each passing until filled; this work unit fills them in `lib/store/projection/`. `lib/locus/primary-safety.ts`, which
also reads only `git status`, decides only whether the primary may host a transient claim — a branch switch that leaves
the gitignored projection in place and removes no checkout — and stays as today.

**`check(checkout)`** — the removal check's projection part. It reads only, writes nothing, and takes no lock, and
answers:

- `passes`;
- `would-refuse` with a remedy, when the persist step would refuse — a file unadopted (§ 9), held by a conflict (§ 6),
  failing to parse, holding a refused edit (§ 7.6), an aside copy whose edit is refused (§ 5.2), a file or aside copy
  withheld at an index rebuild (§ 2.5, § 5.4), or not yet settled (§ 4) — which the check reports as
  `persist-would-refuse`;
- `unobservable` with its detail, when a read it needs fails — the store, the index, or a projected file — which the
  check reports as it reports its Git part's failed read, so a failed read never reads as `persist-would-refuse`.
  Branch-gone recovery keeps a `persist-would-refuse` checkout as a switch target, a live checkout, but reads
  `unobservable` as `external` (`spec-seam-locus.md` § 12.1), and nothing observed the checkout. A store read refusing
  `namespace-corrupt`, `identity-mismatch`, or `state-unresolvable` is such a failed read: the slot cannot tell what the
  persist step would meet.

The index records neither a parse failure nor a refused edit, so the slot runs write-back's read path over each changed
file in every projected root, `completed/` included, and over each settled aside copy in the target's aside folder,
which the persist step would take over: the settle rule, the parser, the store's merge run in the checkout, the kind's
write check over the merged content with § 7.3's views, and `checkSerializationRules` (§ 7.5). Its cost is the stat
walk, about 3 ms on Linux and 27 ms on Windows at 1,000 files (§ Spike 2), plus the read of each changed file. The third
answer is `seam-lifecycle`'s at `26fd1d566` (§ 18).

**`persist(checkout)`** — the persist step, run by the function after the check and before it unlocks and removes the
checkout:

1. It takes the target worktree's projection lock. Where the lock stays held until `AdvisoryLockTimeoutError`, the step
   refuses, naming the holder and a retry.
2. It writes back every edit there under `write-back` (§ 7.4), every projected root included, each file as its own
   write, waiting through the settle rule's tries for a file not yet settled (§ 4). If any file then stays unadopted,
   held by a conflict, failing to parse, holding a refused edit, withheld at an index rebuild (§ 2.5), not yet settled,
   or pending after a `lock-held` refusal (§ 7.8), the step refuses with that file's remedy — for the last two, a retry
   — and the file keeps its content.
3. It takes over every aside copy there, its writer live or not: once a copy has settled (§ 4), it takes in an edit the
   copy holds and deletes the copy, so the writer's own second check finds nothing left. A copy whose edit is refused or
   fails to parse is kept as § 5.2 states, and the step refuses with its remedy. A copy withheld at an index rebuild
   (§ 5.4) is left as it is, and the step refuses with § 2.5's remedy.
4. It releases the lock and returns, and its writes fan out then (§ 2.2).

It releases the lock before returning because the lock is not reentrant (§ 3.2): a step that returned holding it would
stall the same command's fan-out into that worktree — a teardown's own store write among them — and its end's second
check, each waiting until `AdvisoryLockTimeoutError` while the removal failed or had not yet run. With the lock
released, a refresh that writes there between the step and the removal writes files the removal then deletes, losing
nothing, since the store holds what it wrote; where that write holds a file open as the removal runs, the remove step
can fail, the function returns `failed` naming the step, and a rerun completes it. A hand save landing in that window
goes with the checkout (residual, § 17).

**A missing folder.** A checkout whose folder was deleted by hand keeps its locked registration, which
`git worktree prune` skips and which refuses a new checkout at that path ("is a missing but locked worktree", checked on
Git 2.55). With the folder missing, which the check reports as `missing`, the function skips the persist step, unlocks
the registration when the projection's reason holds it, and removes that one registration by its path with
`git worktree remove <path>`, where `git worktree prune` would prune every stale registration in the repository
(`spec-seam-lifecycle.md` § 11.2). A missing folder under any other lock refuses `locked`.

#### 12.3 The release step

A checkout ARC did not create — an anchored one, its marker `spawnedByArc: false` — is never removed: teardown, abandon,
and `arc locus release` release its marker and keep the checkout (`spec-seam-lifecycle.md` § 11.4, § 8.6;
`spec-seam-locus.md` § 5). The removal check takes the disposition, and on a release runs its projection part alone,
since the checkout and its uncommitted changes stay, so `dirty` never refuses an anchored release or abandon.

**`release(checkout, isPrimary)`** runs on every path that releases a checkout rather than removing it, before the
marker is cleared, and the path refuses if it refuses:

1. Under the target worktree's projection lock, taken and refused as the persist step takes it, it writes back every
   edit there under `write-back` and refuses on the persist step's conditions, and takes over every aside copy, as the
   persist step does.
2. On a linked checkout, it then removes the projection — each file by the removal swap (§ 5.6), refusing where an edit
   goes back to its path as a refused edit, then the aside folder and the index — since a checkout no marker claims
   holds none (§ 2.5). The primary keeps its projection, which its next refresh lays out as for a checkout with no
   current work item.
3. It releases the lock and returns.

A caller that fails after the step leaves the marker, and the next command projects again.

#### 12.4 Moves

Git refuses to move a locked worktree with no `-f` or one, and `git worktree move -f -f` moves it and keeps the lock and
its reason in one step (checked on Git 2.55). The seam's members make every move of a work unit's checkout that ARC runs
or prints take that form before the lock lands: `arc rename`'s move (`reconcileWorkUnitWorktree`), the follow-up
`handlers/lifecycle.ts` prints for a rename run from inside the worktree, the occupied-move fallback beside that move,
and the residue sweep's remedy (`projectRenameMoveRemedy`), whose argv session-init's workflow has the agent run as
given (`spec-seam-lifecycle.md` § 11.6; `spec-seam-locus.md` § 12.3). The two `-f`s also let a move land on a path
registered to a missing or locked worktree, an accepted edge. A moved checkout keeps its index, which stays in its Git
directory, and its aside folder, which moves with its folder.

#### 12.5 Landing order

The lock lands live, before the flip, and lands last (§ 1.3). Landed any earlier, teardown's plain `git worktree remove`
(`reconcile-work-unit-worktree.ts`), the Errand close's (`lib/errand/terminal-occupancy.ts`), and the moves would each
refuse on every locked worktree. It lands only after `seam-lifecycle` and `seam-locus` have moved every removal of a
work item's checkout onto the removal function, every decision to remove one onto the removal check, and every move onto
the doubled-force form (`spec-seam-lifecycle.md` § 19; `spec-seam-locus.md` § 16). This work unit depends on both
(§ 1.1), so the order holds by landing.

#### 12.6 Removals printed or documented

The seam changes no workflow text before the flip, so with the lock this work unit rewrites the removals that are
printed or documented rather than run:

- **The stale-worktree offer.** Session-init's offer of a plain `git worktree remove` for a removable worktree
  (`session-init.md`) becomes `arc teardown <name>`, run from the command line `seam-locus` adds to the sweep's report
  (`spec-seam-locus.md` § 12.2), as the offer already names `arc teardown` for a husk.
- **Branch-gone recovery.** Its prompt to remove a shipped worktree (`inferBranchGoneRecovery`,
  `recommended-action.ts`), which names no command and which `session-init.md` has the agent act on, runs the
  `arc teardown <name>` command line `seam-locus` adds to its candidate (`spec-seam-locus.md` § 12.2).
- **A registration whose folder is missing.** `seam-locus` reports each in a `missingFolders` field — branch-gone
  recovery's beside its candidates, the stale sweep's beside its `worktrees` — with its remedy: `arc teardown <name>` as
  an argv where the stale sweep reports a branched one whose work unit has ended, and otherwise
  `git worktree remove <path>` as text naming its precondition, that the folder is still missing; where the registration
  is locked, `git worktree unlock <path>` comes first, and the whole remedy is text (`spec-seam-locus.md` § 12.1,
  § 12.2). The lock is what makes such a registration locked, so with it `session-init.md` shows those reports with
  their remedies, which `seam-locus` otherwise leaves to the flip's rewrite.
- **A husk no verb covers,** left today to manual cleanup, is removed by hand after `arc user save` and
  `git worktree unlock`; the flip's workflow rewrite names `arc save` in its place (§ 18).
- **`strategy-concurrent-work.md`'s instructions** to remove a worktree with `git worktree remove` and to recover a
  deleted folder with `git worktree prune` name the exit verbs, the lock, unlocking and then removing a missing folder's
  registration by its path, and that forcing past the lock skips the persist step.

The text rewritten is `session-init.md` (`session-init.template.md` in the package, with the installed copy) and
`strategy-concurrent-work.md` (package and project copies), edited in the package source and synced, per the
repository's package-project sync rule.

#### 12.7 Existing worktrees

No code backfills the lock. Under the pre-public-release posture (`DEV-RULES.PROJECT` § Engineering Standards), this
repository's existing worktrees take a one-off `git worktree lock --reason "<PROJECTION_LOCK_REASON>"` at landing, since
the removal function refuses a lock with any other reason, or take the lock as they are respawned.

#### 12.8 The user surfaces in every worktree

Under the capability the projection gives every worktree its own copy of the user surfaces — the identity's personal
records, `USER-INBOX` and `WORKING-MEMORY` among them — and reads none through `lib/user-surfaces.ts`'s resolver (D13).
The in-repo implementation keeps the resolver (`lib/store/in-repo/personal-paths.ts` imports it), and teardown keeps
merging a linked worktree's copy up through `lib/user-surface-migration.ts` until the flip, so both stay as the in-repo
implementation's arms. The seam's members move their own callers off the resolver (`spec-seam-locus.md` § 10.3), and
`storage-cutover`'s deletion pass removes the rooting and the migration with the in-repo arms (D15; § 18).

#### 12.9 Machine-local paths and scratch

`MACHINE_LOCAL_PATHS` (`lib/store/registry.ts`) lists what is never stored, synced, or projected, each entry a root and
a pattern. This work unit registers:

- **`arc-projection/**` under the existing per-worktree Git-directory root, `git-worktree`** — the index, the projection
  lock, and the kept copies (§ 3.1, § 3.2, § 3.6), beside that root's `arc-checks/**`;
- **under `checkout`, a checkout-relative root it adds to the registry's roots,** `.arc/system/.local/**`, the whole
  folder holding the aside folder (§ 5.4), and the three machine-local entries in `.arc/system/.internal/` where they
  stand, each by name — the checkout marker (`worktree-marker.json`), the pristine store (`pristine.json`), and the
  generated schemas (`schemas/**`) — never all of `.internal/`, which holds tracked and stored files.

So the registry lists every machine-local file under `.arc/system/`, and a source that projects `.arc/system/` leaves
them alone (§ 14). Moving the three entries from `.internal/` into `.local/` touches the marker every live worktree
holds, the ignore blocks `arc init`, `join`, `reconfigure`, and `update` write, and the Codex recovery hook
(`codex-recovery-marker.mjs`), and reopens the decision that the system folder keeps `.internal/`; it is
`config-storage-architecture`'s (§ 18).

**Scratch.** The projection creates `scratch/work-unit/<slug>/`, empty, under the identity root for the checkout's work
unit; `seam-locus` reconciles the folders at session start through `lookup` (D5; `spec-seam-locus.md` § 2.8). The folder
naming is the interface between them.

### 13. Windows

Each Windows mechanism D13 names is built, and each is covered in the portability lane, which runs Windows and macOS
(D13):

- **Held files.** The projection closes its own handles before replacing a file, and the swap retries `EPERM`, `EBUSY`,
  and `EACCES` within `retryTransientFileSystemRefusal`'s bound while a holder refuses (§ 5.2, § 5.3).
- **Same-size saves.** The racy rule's content hash sees a save inside one modification-time tick (§ 3.3).
- **File identity** is compared as a bigint, and every stat is read as one (§ 3.3).
- **Line endings.** CRLF is normalized to LF on read, before the blob id (§ 3.4).
- **Git calls.** The projection makes two Git calls per command, started together with its stat walk — the store read,
  and one `git config --get-regexp` reading the `arc.*` keys and the object format (§ 15.3) — and the exclude writer and
  the guard make one each, the guard only when an ignore file may have changed (§ 11.1, § 11.2). A full materialization
  reads through the store's `list`, which the ref backend batches through `git cat-file --batch`
  (`spec-storage-ref-backend.md` § 11.6), so the projection reads no blob from Git itself (§ 15.5).
- **Read-only files** move aside and link in with the mode intact (§ 8.2).

Hard links are assumed on every volume a worktree sits on: ext4, APFS, and NTFS have them, exFAT and FAT32 do not, and
no fallback is built (§ 17).

### 14. More than one source

The projection takes more than one source and supports read-only copies (D13). The engine reads records through one
source interface — `list`, `read`, and `changes` over the roots the source projects — which the store implements here;
the installed package implements it when ARC core resolves from it (`framework-core-from-package`, § 18). A source may
be read-only: its files are then protected (§ 8.2), their notice naming the source, and write-back refuses an edit to
one as a refused edit. The exclude writer's path list takes the `.arc/system/` paths a source projects (§ 11.1), and a
source that projects `.arc/system/` leaves alone what `MACHINE_LOCAL_PATHS` lists there (§ 12.9). Only the store is
built as a source here.

### 15. Refresh and performance

A command's cost grows with what changed, never with how much state exists. Reads take only a ref's tip (D10), and
`history` is read only where § 3.5 names.

#### 15.1 What write-back checks

Write-back checks every projected root but `completed/`: the checkout's own work item, the personal surfaces, its
in-flight views with their protected files, so a refused edit is reported at once, and `backlog/`, where anyone grooms a
stub and new files are adopted. New files are found by walking those roots' folders each command, as Git's
untracked-file scan does without its cache, skipping the folders `MACHINE_LOCAL_PATHS` lists (§ 9); `backlog/` holds
about 300 files in 156 folders here, which adds about 2 ms on Linux and 8 ms on Windows, most of it the folder walk
(§ Spike 2). `completed/`, which grows with the archive, is checked by `arc save`, by the removal check's projection
part and the persist and release steps, and whenever a refresh touches a file.

#### 15.2 Store-driven refresh

Each worktree's index carries the state version it last projected, and the next command asks the store's `changes` for
the records since, rewriting only those and any file still marked pending.

- **Reducing `changes`.** Refresh keeps each record's newest entry. An entry for a primary record — a work unit's meta
  or an Errand's record — re-lays every record its owner holds, since placement, slug, `Owner`, `Cohort`, and lifecycle
  state decide where each of them projects and whether it projects here: refresh lists the owner's records (`list` by
  `owner`, `ListInputSchema`, `lib/store/read.ts`) and moves each file whose path changed, by the removal swap and a
  write at the new path, an edit at the old path taken in first (§ 5.6). `changes` reports a rename or an archive only
  as the meta's entry, so this is what moves the rest. A cohort document is an owner primary too, its slug and placement
  covered by its record version (`spec-storage-ref-backend.md` § 3.4): its entry re-lays every path it projects to, its
  folder's copy and each `current/` copy, and a meta's entry adds or removes its `current/` copy of each cohort document
  its `Cohort` field names, which `list` by the work unit never returns. An archive, an abandon, or an owner leaving the
  in-flight view is a re-lay with nothing left to project here, which removes the files.
- **A conflict-record entry** refreshes the file of the record it names, or, for a removed conflict, whose entry carries
  no content, the file the index maps it to — by its marker set, its notice line, or, for a file with no stamp, the
  file's entry (§ 3.1). Neither reduction needs a contract change.
- **A state version that no longer resolves.** When `changes` refuses `state-unresolvable`
  (`spec-storage-ref-backend.md` § 2.3, § 4.6) — Git collected its manifest, which only an anchor written into a record
  keeps reachable, or it names an ended item whose history this clone has not fetched — the command rebuilds the
  worktree's projection from the current state rather than pulling any history ref the refusal names, so no refresh
  waits on the network. Every projected record is refreshed by the same rules as a changed one, every index entry the
  current state no longer holds is handled as a removal (§ 5.6), the replace guard and pending marks apply, and the
  index takes the current state version. Write-back has already run, and a file holding an edit is handed to it as any
  refresh hands one, so the rebuild loses none. It costs one full materialization, paid by a worktree idle past Git's
  expiry or one whose state version names history this clone lacks.
- **A listing that is not whole.** A full materialization and the rebuild write files only for the records a listing
  returns. A record it lists only as a diagnostic (`ListingDiagnosticSchema`, `lib/store/read.ts`) — malformed,
  oversized, unreadable, of a newer format, or under a mismatched key — projects no file and is reported, and a listing
  that reports `missed` or returns `unreadable` removes nothing. A file is removed only on positive evidence: a complete
  listing, with nothing missed and no diagnostic, that no longer holds its record.

#### 15.3 The no-change budget

The projection's no-change overhead stays within 10 ms on Linux and 60 ms on Windows.

- **Measured.** At this repository's size today — about 800 projected files and 17 MB in `completed/` — a warm stat walk
  of all of them took 3.4 ms. At 1,000 files the stat walk, the index read, and the Git call took 5 ms on Linux and 49
  ms on Windows, of which the Git call is 2 ms and 41 ms; at 100 files, 2.3 ms and 42 ms. The rest of the no-change path
  — the folder walk, the projection lock, the sweep of an empty aside folder, and the index and reference write each
  command makes to keep its tripwire measurements — adds 1.8 ms on Linux and 7.7 ms on Windows at 1,000 files in 125
  folders, the walk the largest share at 1.0 ms and 5.1 ms (§ Spike 2). The checked set sits well under 1,000 files.
- **Two Git calls, started together.** The projection makes two Git calls — the store read, which shares the command's
  first store read, and one `git config --get-regexp` reading the `arc.*` keys and `extensions.objectformat`: identity,
  the in-flight view setting, and the object format — started together with the stat walk. Run at once they cost what
  the store read costs alone, 41.7 ms against 41.6 ms on Windows, where one after the other took 64.8 ms (§ Spike 2).
  The projection's cost on Windows is one Git call's time, and on Linux it is noise beside the CLI's own start (about
  280 ms for `--version`). The guard adds no call while no ignore file has changed (§ 11.2).
- **No folder-time cache** is built; the command-start tripwire would show the need.

#### 15.4 Tripwires

Each tripwire is shown when the median of its recent measurements, kept in the worktree's index, crosses its bound,
never on one measurement, since host stalls reached 1.4–1.6 s on Windows (§ Tripwire timings):

| Tripwire               | Linux  | Windows | Set at                                      |
| ---------------------- | ------ | ------- | ------------------------------------------- |
| Command-start overhead | 20 ms  | 120 ms  | twice the budget                            |
| One fan-out            | 100 ms | 600 ms  | ten times the budget                        |
| Full materialization   | 1 s    | 5 s     | about four times today's archive on Windows |

The fan-out tripwire times the whole fan-out, a write's or a pull's, store reads included: today's heaviest, ten files
into 20 worktrees, reaches its bound on Windows once those reads count, while a one-file write sits far below it. Past
it, the first response is writing files in parallel on Windows, then the one-copy reserve (Alternatives & Rationale);
past the materialization bound, parallel writes on Windows. Materialization runs at spawn and at `arc sync`, not per
command, so its bound is the looser one.

#### 15.5 Fan-out and full materialization

A write's fan-out and a full materialization cost more on Windows, where each file write costs about 1.5 ms. One write
pushed into 20 worktrees took 3 ms for one file and 13 ms for ten on Linux, and 113 ms and 571 ms on Windows, the swap's
end check included; Windows pays about 5 ms per worktree before its files, mostly the lock and index writes. The spike
read the store once and did not time it. A fan-out adds one `version()` call, three Git calls on the ref backend where
the manifest is new, which after a write or a pull it is (`spec-storage-ref-backend.md` § 4.2), and one `changes` call
per distinct state version among the worktrees, normally one, at least one Git call there, each Git call about 2 ms on
Linux and 41 ms on Windows (§ Spike 2). It also lists the worktrees, one Git call (`scanRegisteredWorktrees`), and reads
each one's index, and, for each primary entry among the changes, re-lays through one `list` by owner shared by every
worktree — four Git calls on the ref backend, within 300 ms on Windows (`spec-storage-ref-backend.md` § 11.6, § 11.7) —
so a meta write's fan-out costs more than a companion's. A command whose writes land outside a projection lock fans out
once per write, each timed by the tripwire (§ 15.4), and a sibling whose lock stays held past 200 ms is skipped (§ 3.2).

A full materialization of this repository's 780 files took 115–130 ms on Linux and 1.1–1.3 s on Windows; on the ref
backend it reads through `list`, which batches its blob reads (`spec-storage-ref-backend.md` § 11.6). Writing several
files at once halved the Windows materialization to 0.62–0.79 s and slowed Linux; it is a tripwire's first response, not
built now (§ Tripwire timings). `completed/` lands in every worktree, as the tracked copy does today.

| Axis                         | Cost grows with                     | Watch                                    | Response                                             |
| ---------------------------- | ----------------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| Archive size                 | nothing per command                 | full materialization (spawn, `arc sync`) | batched blob reads in `list`; tripwire               |
| Worktrees per machine        | worktrees × files changed per write | fan-out time; Windows moves while held   | tripwire; the one-copy reserve                       |
| Team size                    | others' writes, at fetch points     | the `all` view                           | `mine` default; `cohort` and `all` opt in            |
| File size (1 MiB cap)        | merge time per edited file          | nothing at the cap                       | —                                                    |
| Windows Git calls (32–42 ms) | Git calls per command               | calls before the command's own work      | two calls started together; the guard only on change |

### 16. Forward amendments to shipped specifications

The storage contract has shipped. Where this design changes what its specification defines, the change is stated here
and built by this change; the specification is not edited.

#### 16.1 The storage contract (`spec-storage-contract.md`)

Twelve change D13's or D17's own wording:

- **The skip switch** (§ 2.3). D13 says there is no setting to turn write-back off. `--skip-projection` is a flag every
  `arc` command accepts that runs that one command without write-back or refresh, its edits left pending for the next,
  so a projection defect cannot lock a person out of `arc`; nothing keeps it on as a mode. The removal check and the
  persist and release steps run under it as without it (§ 2.3).
- **A just-modified file waits** (§ 4). D13 writes back pending edits at the start of every command. Here write-back
  settles a file modified in the last 50 ms before reading it, leaving one that does not settle to the next command, and
  never reads an empty projected Markdown file as an edit; a refresh hands a changed file to write-back under the same
  rules. A caller can observe the short, reported staleness.
- **A replacement re-checks by content and moves the file aside** (§ 3.3, § 5). D13 makes the refresh's re-check "a
  stat, not a re-read", has refresh lift a protected file's read-only mode to rewrite it, and retries renames over held
  files on Windows. Here the re-check also hashes a racy entry; every replacement moves the file aside and links the new
  one in, read-only mode and all, retried while a holder refuses; and a removal moves the file aside the same way. A
  caller can observe the path absent for about 10 µs on Linux and 0.85 ms on Windows, and copies in the worktree's aside
  folder while a command runs.
- **Files other than Markdown carry no stamp** (§ 3.7). D13 puts the base stamp on each projected file's first line; a
  text file of another kind keeps its base in the worktree's index alone, since a stamp would corrupt it, with the
  version a replacement in progress replaces recorded beside it.
- **A stale buffer's save merges from what the last persisted write-back took in** (§ 3.6). D13 merges an edit against
  the version its base stamp names; an editor that never reloads keeps the stamp a write-back read, and merging against
  that version would undo the person's own persisted edits.
- **The projection follows the work-unit marker, and the worktree lock ARC's work-unit and Errand spawns** (§ 2.5,
  § 12.1, § 12.3). D13 projects into every worktree, and D17 locks each worktree ARC spawns. Here a checkout gets the
  projection when it is the primary or its marker names a work unit or a transient claim, `arc start --here`'s included,
  and the lock goes only on a linked checkout ARC spawns for a work unit or an Errand. Any other checkout — one of ARC's
  machinery checkouts, or a hand-made worktree nothing has claimed — gets neither and is removed as today; after the
  flip an editor or agent there finds no state at the familiar paths and reads it through `arc view` and the status
  surfaces, or claims the checkout with `arc start --here`. A linked checkout whose marker is released, as an anchored
  one's is at teardown or abandon, loses its projection once the release step has persisted its edits.
- **A paused work unit replaces the parked one** (§ 8.3). D13 keeps a parked work unit's backlog placement and has its
  protected notice name `arc resume`, since no checkout owns it. From the flip a pause is a section of the work unit's
  meta and changes neither `State` nor placement, so a paused work unit projects as any in-flight one does, its notice
  following the next amendment.
- **A protected file's notice names where an edit can be made on this machine** (§ 8.2). D13's notice names the owning
  checkout's path on this machine, that the work unit is in flight on another, or `arc resume`. Work-unit markers are
  machine-local and a pause records who paused, not where, so nothing tells this machine whether another holds a
  checkout, and "in flight on another" can be false: the notice names a checkout on this machine that holds the work
  item, or, where none does, `arc materialize <slug>` for its owner — with `--here` from a checkout with no marker that
  still has the work branch out — and the owner for anyone else.
- **A clash found in the checkout stays in its file** (§ 7.7). D13 keeps a clash as the incoming side of a conflict
  record, and gives a single-writer record no markers, since they would leave its parsed file unreadable and write-back
  would skip it for good. A clash write-back finds in the checkout — a stale buffer's save after a clean merge, content
  sharing nothing with any version, a hand edit to the meta or task list over a verb's write — shows as markers but is
  never stored, so only its checkout sees it until it is resolved. A meta or task list holding such markers is never
  sent while they stand, so it is pending rather than skipped, and resolving it persists as an ordinary edit. Its
  markers label the store's side by the record version it merged onto and the time write-back read it, where D13 labels
  each side with its machine or session and time, since only the store's commits carry that side's writer.
- **A conflicted file the store's change overlaps waits** (§ 6.6). D13 holds nothing back, keeping the rest of a
  conflicted file refreshing; where the store's change overlaps an open conflict's lines, the file keeps its version,
  reported, until the person resolves it.
- **A file a rebuild cannot read waits for the person** (§ 2.5). D13 writes back pending edits at the start of every
  command. A worktree whose index is missing, unreadable, or of another format version has no marker map or stale-buffer
  state to read an edit by, so its rebuild refreshes only a file that cannot hold one, at a path the current projection
  lays its record at, and withholds every other file write-back would read, written over by nothing, sent nowhere, and
  reported, the removal check and the persist and release steps refusing over it, until the person deletes it after
  copying out what they want and re-applies the edit as an ordinary one.
- **A hunk conflict whose markers cannot be placed shows as a notice line** (§ 6.3). D13 shows a hunk conflict as
  markers around the conflicting lines, and only a whole-record conflict as a notice. Here a hunk conflict whose
  placement fails its check shows as a notice line in the idiom of D13's whole-record one, naming the conflict record,
  the incoming side's machine or session and time, where that side reads, and the remedy, `arc save --resolve`; it
  arises mostly where a checkout renders the record after further writes, routinely on a machine other than the one that
  filed the clash. A file with no stamp shows such a conflict nowhere in the file, only in status and the refusing
  verbs: D13's in-file rule keeps the surfaces every session loads from reading one side as settled, and those are
  stamped Markdown, while a file with no stamp loads into no session.

Four add to D13 without contradicting it:

- **`completed/` keeps its owner's rules** (§ 8.4). D13's edit-rights rule names none for archived work. The archived
  work unit's owner edits its files from any checkout, the meta and task list included, since no checkout owns it, and a
  correction is a write in place that keeps its archive number.
- **Escalated conflict markers** (§ 6.1, § 6.2): longer than seven characters where a side holds a marker-like line,
  with a resolve-by-hand line after the start marker; D13 names the standard markers.
- **Every removal and release refuses over a refused edit, a file that fails to parse, or a file not yet persisted**
  (§ 12.2, § 12.3). D13's teardown persists first and refuses while a file is unadopted or held by a conflict; a refused
  edit stays in its file (D13), and a file that fails to parse is skipped and reported (D13), its edit never written
  back, so removing the checkout would drop either, as it would a file still settling or left pending. The persist and
  release steps check every projected root, `completed/` included, and the removal check reports a refusal beforehand.
- **`arc save --resolve <conflict>`** (§ 6.5). D13 resolves a whole-record conflict's notice by "a verb or a write
  naming the conflict" and names neither. This option sends the conflict's subject file naming it in `resolves`, its
  text the resolution, or the store's side where the file is unedited, for any conflict shown without markers, toward
  the store's side or a content-only edit the kind's write check admits.

#### 16.2 Conflict records (D6), recorded by `storage-ref-backend`

This design reads three fields a hunk conflict record does not carry today — `baseVersion`, `currentLines`, and
`incomingLines` — and the merge library's base-version input (`MergeTextInput`). `storage-ref-backend` records them as
its forward amendment to D6 and builds them (`spec-storage-ref-backend.md` § 2.5, § 3.7); this change builds neither
(§ 18).

### 17. Residuals the design accepts

1. **A write through a held handle.** A write through a handle opened before a replacement and landing after the
   command's second check, or after a persist or release step took the aside copy over, goes to a deleted aside copy and
   is lost (§ 5.2). Reasoned, not measured: no tested editor or agent holds a file open across saves.
2. **An exact revert during a replacement.** A save to a file other than Markdown that exactly restores the version a
   replacement replaces, made while the index still records that version — during the replacement, or after a stop until
   the next command — reads as old content and is refreshed (§ 3.7): content alone cannot tell it from what the stop
   left.
3. **A save after the persist step.** A save that lands between the persist step and the checkout's removal goes with
   the checkout, as with any deletion (§ 12.2).
4. **A change after the removal check.** An edit or a store change landing between the removal check and the removal can
   still make the persist step refuse after an abandon or an Errand leave has changed state, as an uncommitted change
   can today between `git status` and `git worktree remove`.
5. **A forced removal.** A removal forced past the lock with `git worktree remove -f -f`, which D17 allows and Git's
   refusal suggests, skips the persist step and loses what item 6 names.
6. **An anchored checkout removed by another tool.** A checkout claimed with `arc start --here` is not locked, so
   another tool's `git worktree remove` takes with it every edit made there since the last `arc` command and every state
   a removal refuses over — a refused edit, a file that failed to parse, an unadopted file, a conflict, a withheld file
   — and, before the flip, the gitignored `SESSION-NOTES.md` and any copy of the identity-global user files teardown
   would merge up (`reconcileUserSurfacesForRemoval`), as it would in any checkout ARC did not spawn.
7. **No hard links.** A worktree on a volume without hard links — exFAT or FAT32 — is unsupported, and no fallback is
   built (§ 13).
8. **A clash found in the checkout is seen only there** until it is resolved (§ 7.7): a second machine, or another
   checkout, sees the store's side alone, as uncommitted Git changes elsewhere go unseen. The clash holds an edit only
   its holder can resolve.
9. **A conflict filed twice.** A command stopped after a write lands and before the index records it sends the edit
   again at its next run, and where the first landing clashed the store files the same clash again (§ 7.8): a duplicate,
   visible conflict, never lost content.
10. **A notice that lags.** A protected file's notice can name an owning checkout, or `arc materialize`, that a release,
    promotion, or materialize in another worktree has since made wrong, until that file's record next changes, a primary
    re-lay rewrites it, or a reprojection (§ 10.4). The notice is advisory, and the persist refusal behind it names the
    current place.
11. **A stored hunk placed on the wrong lines.** Placement's check let none through at write time; of the clashes later
    edits left untouched, at most 0.35% after twenty edits; and of those a later edit touched, 1 of 65, 5 of 297, and 10
    of 1,049 — a line merge's own order of residual (§ 6.3).
12. **An index rebuild.** A file or aside copy the projection cannot read without its index stays as it was after a
    rebuild, withheld and reported, until the person deletes it, after copying out what they want, and re-applies their
    edit as an ordinary one; ARC writes nothing over it and sends nothing from it (§ 2.5). A buffer an editor kept open
    across the rebuild and saved afterwards over a refreshed file merges against its stamp's version without the content
    its last write-back took in (§ 3.6), so it can put back text the person added in a persisted edit and then removed.
    Nothing is lost.
13. **A hand-typed entry landed twice.** A command stopped after a write lands and before the index records it, whose
    file is then edited again before the next command, sends the entry with new content, so it takes fresh IDs, from the
    backend's stamp or the checkout's, and lands a second time (§ 7.1): both copies show in the file, and nothing is
    lost.

### 18. Expected contracts

This design consumes behavior other changes build. Each is an expected contract, available when its change lands; what
holds until then is stated with it.

- **`seam-lifecycle`** (`spec-seam-lifecycle.md`, at `26fd1d566`; this work unit depends on it):
    - the removal check and function, with `RemovalCheck`, `ProjectionRemovalSlots`, and `PROJECTION_LOCK_REASON`
      exported with the function (§ 11.1, § 11.2) — the check slot's third answer, `unobservable`, and a missing
      folder's registration removed by its path among them;
    - lifecycle's callers moved onto them, and the `worktree-clean` guard deleted (§ 11.3);
    - anchored checkouts released through the `release` slot, never removed (§ 11.4);
    - every move of a work unit's checkout it runs or prints in the doubled-force form (§ 11.6);
    - pause replacing park (§ 8.1), `arc materialize` widened (§ 8.4), `Owner` verb-owned and changed by `arc handover`
      (§ 8.5), and no verb reopening an archived work unit (§ 8.7);
    - `task-list.close`'s remedy naming the close verb as text (§ 9.4), which write-back reports (§ 2.2).
- **`seam-locus`** (`spec-seam-locus.md`, at `bc0d831ee`; this work unit depends on it):
    - the current work unit resolved from the checkout marker plus the store, the layout resolver's address for an
      identity's personal root, and session-init's slot paths and the compaction seed's taken from the layout resolver
      (§ 2.1, § 4.9) — before `active/current/` lands (§ 10.2);
    - the layout classifier inverting `resolveArcPath` over every registered address, which write-back and adoption read
      (§ 3.3);
    - the Errand's exits on the removal function, and the stale-worktree sweep, branch-gone recovery, the residue sweep,
      and `arc errand leave`'s authorization on the removal check, each outcome reported (§ 12.1);
    - an `arc teardown <name>` argv on the sweep's report and branch-gone recovery's candidate, and the reports of a
      registration whose folder is missing with their remedies (§ 12.1, § 12.2), with the residue sweep's move remedy in
      the doubled-force form (§ 12.3);
    - `arc locus release`, running the release step on an anchored checkout (§ 5);
    - the paused-work slot's action and the materialize offer (§ 4.4, § 4.5);
    - the session-start reconcile of each work unit's scratch folder (§ 2.8);
    - its callers moved off the user-surfaces resolver (§ 10.3).
- **The record kinds** (`spec-seam-record-kinds.md`, shipped): `WriteCheck` and its input (§ 3.1), the writer derivation
  and `HAND_EDIT_VERBS` (§ 3.2), and the production registration set (§ 2.2). The seam's members fill each kind's parser
  and write check as they reroute its family; until a kind has one, its files persist unvalidated, as D5 lets a contract
  `write` land (§ 7.6).
- **The ref backend** (`spec-storage-ref-backend.md`, at `e43facf0d`):
    - the record version as the compare-and-swap basis beside the content's blob id (§ 3.4), and `history`, which the
      reads § 3.5 here lists make;
    - a stale expected version on a merge kind merged from that version, its conflict records committed under `merge`,
      its merged content parsed, a repeated `_Id:_` refused, and a put naming an open conflict in `resolves` never a
      no-op (§ 5.1, § 5.2, § 5.5), each held by its suite item (§ 14.2);
    - each side's label from the `Arc-Actor` trailer, and a hunk conflict record's `baseVersion`, `currentLines`, and
      `incomingLines`, with `MergeTextInput`'s base version (§ 3.7, § 2.5);
    - entry stamping seeded by the put's reference, expected version, and content, and an entry kind with no declared
      grammar refused `unsupported` `unhomed-kind` (§ 5.1), a retried put stamping the same IDs held by its suite item
      (§ 14.3);
    - `checkSerializationRules`, exported from `lib/store/` (§ 5.6), which the removal check's projection part calls —
      until it lands, that part runs no serialization rule, and the persist and release steps report whatever refusal
      the backend's write returns;
    - `changes` refusing `state-unresolvable` for a state version that no longer resolves (§ 2.3, § 4.6), on which a
      refresh rebuilds the worktree (§ 15.2 here);
    - a write to a completed item refusing `state-unresolvable` where this clone lacks the item's history ref, and
      `pull({ history })` fetching that ref by name (§ 7.3, § 4.5), which `arc save` and the persist and release steps
      run and retry once (§ 8.4 here);
    - `pull` and `push` replacing `sync` (§ 2.1), a pull's merges landing with no `write` (§ 6.4), which the fan-out
      wraps (§ 2.2 here), and `version()` costing one Git call, three where the manifest is new (§ 4.2);
    - `list` batching its blob reads (§ 11.6), which full materialization reads through (§ 15.5 here);
    - the reference backend refusing `state-unresolvable`, implementing `pull`, refusing a primary's put without
      placement, and parsing a stale base's merged content (§ 14.2), which the gate here exercises (§ 1.5 here);
    - the multi-process test lane, which runs over it once it lands (§ 1.5 here).
- **`seam-status-roadmap`:** status showing each open conflict's subject, both sides' labels, and both sides' content,
  which a conflict shown without markers points to (§ 6.3), asked through a capture for its planning; conflict records
  never project as files (`projection: "never"`, `lib/store/registry.ts`). It lands before the flip, since
  `storage-cutover` depends on every seam member, and the projection is dark until then.
- **`storage-cutover`:** the flip and its first full materialization; the live rehearsal, which confirms every
  hand-editable projected kind has its parser and every entry kind its entry shape — `work-item/description`,
  `work-item/inbound`, and `personal/errand-queue` still lack theirs (`lib/store/registry.ts`); the flip's workflow
  rewrite, which names `arc save` where workflows name `arc user save` (§ 12.6); the deletion pass, which removes the
  user-surface rooting and its migration (§ 12.8); and the documentation pass, which rewrites
  `strategy-work-organization.md` § Per-Worktree Isolation and its acceptance test (§ 10.5) and moves
  `archive-work-unit`'s errata convention onto the store's history (§ 8.4).
- **`config-storage-architecture`:** the per-developer tier, to which the in-flight view setting moves (§ 10.4), and the
  move of the checkout marker, the pristine store, and the generated schemas from `.arc/system/.internal/` into
  `.arc/system/.local/` (§ 12.9), after `seam-locus`'s marker work lands.
- **`framework-core-from-package`:** the installed package as a second, read-only source (§ 14), adding its
  `.arc/system/` paths to the exclude writer's list.

## Alternatives & Rationale

- **A library over a hand-rolled engine — rejected.** No library projects a versioned store into editable files with
  three-way write-back; the general sync tools (Unison, Mutagen, Syncthing) are whole programs, not embeddable
  components. The library-shaped parts already exist in the CLI (§ 2.1). Rejected dependencies: `write-file-atomic` (no
  Windows rename retry; 8.0.0's engines range excludes Node 24.0–24.14, against the package's `>=24`), `graceful-fs`
  (patches `fs` globally, and the CLI's own bounded retry already covers the move aside), `proper-lockfile` (no release
  since 2021, and heartbeat staleness a CLI blocked in Git can miss), `chokidar` and `@parcel/watcher` (watching,
  below), and `isomorphic-git` (blob hashing is a few lines).
- **A file watcher or a daemon — rejected.** Watching pays only in a long-lived process, and Git's `fsmonitor` is built
  for monorepos of hundreds of thousands of files (Chromium's 393,000: `git status` from 17.6 s to 0.83 s). A snapshot
  at the start of every command, jj's model, meets the budget at this repository's size (§ 15.3), and the command-start
  tripwire would show the need first (§ 15.4).
- **One copy per machine — kept in reserve, not built.** D13 makes it a fallback no caller sees, and nothing yet
  triggers it. Its tripwire is a fan-out's time, after parallel writes on Windows (§ 15.4).
- **Write-back outside `lib/store/` — rejected.** The `store-raw-state` ratchet lists the production registration set
  and counts any importer outside the store, so write-back elsewhere would be a floor entry that never reroutes (§ 2.1).
- **Write-back merging every edit itself — rejected** for sending a stored base for the store to merge. A merge in the
  checkout cannot label the store's side, which only the store's commits carry, and its clashes would reach no other
  checkout; the backend's stale-base merge files them as conflict records every checkout reads, under its own write
  serialization (§ 7.1; § Spike 5). The checkout merges only where the store holds no base (§ 7.7).
- **Finding a stored hunk by its current side's text, by context lines taken at write time, or by moving its base range
  unchecked — rejected** for the checked placement. The text search failed on an empty side and on repeated lines and
  placed 47% even at write time; two lines of context placed 34% after twenty edits; the base range moved unchecked put
  up to 21% on wrong lines unseen. The check on the span's lines and the lines beside it keeps the unseen residual
  within a line merge's at every age (§ 6.3; § Spike 6).
- **Reading an empty side's line count from its content — rejected** for the record's counts. An empty side taken as no
  lines placed 92% at write time with 0.44% wrong, taken as one blank line 82% with 1.7% wrong, and tried both ways and
  placed only where exactly one passed, 97.7% with none wrong at write time but up to 1.09% wrong later (§ Spike 6).
- **Resolving a notice-line conflict by deleting the line — rejected** for `arc save --resolve`. A whole-file rewrite
  that drops the stamp drops the line with it, so the deletion would resolve a conflict nobody read; the line shows the
  conflict only, and the option sends the resolution explicitly (§ 6.5).
- **Advancing a sibling at fan-out from the writer's own write, with no store read — rejected** for one `changes` call
  per distinct state version. State versions carry no order, so a sibling's version cannot be compared with the
  writer's, and one call serves every sibling at the same version (§ 2.2).
- **A rename over the file to replace it — rejected.** It lost up to 1,255 of 2,000 replace-style saves on Linux and 363
  of 1,000 on Windows, and starved under readers on Windows; holding a descriptor across the rename saved in-place saves
  only. The swap with its second check lost none of 40,000 (§ 5.2).
- **A stat-only re-check, or deferring a racy entry — rejected.** The first lost nearly every same-tick save; the second
  deferred nearly every refresh on Linux (§ 5.1). **An exclusive open on Windows — rejected:** it fails an editor's save
  with `EBUSY` and closes nothing the hash leaves open.
- **`copyFile`'s exclusive flag or a rename to rebuild an absent file — rejected** for the bare link, which lost no save
  against up to 401 failed editor saves and up to 407 lost saves respectively (§ 5.5).
- **jj's ignore-shorter marker parse — rejected** for exact-length parsing, which a longer run added while resolving
  cannot confuse, with D13's refusal of malformed markers over jj's degrade-to-text (§ 6.1).
- **A personal revert key — rejected.** Docs, workflows, and agents reach paths through the layout resolver, and a
  personal key would let two people's instructions point at different paths (§ 10.3).
- **The aside folder under the worktree's Git directory, or in `.arc/system/.internal/` — rejected.** A rename or link
  cannot cross volumes, and a linked worktree's Git directory may sit on another; `.internal/` holds tracked and stored
  machinery, so a folder for machine-local files alone, registered whole, keeps the registry's entries exact (§ 5.4,
  § 12.9).
- **The persist step returning while holding the projection lock — rejected.** The lock is not reentrant, so the same
  command's fan-out and end would wait on it until timeout whenever the removal failed or had not yet run; releasing it
  costs only the window a save already had (§ 12.2, § 17).
- **Backfilling the lock in code — rejected.** Under the pre-public-release posture this repository's existing worktrees
  take a one-off lock at landing (§ 12.7).
- **Carrying the personal Marksman line into `.git/info/exclude` — rejected.** It would hide the package copy, the
  authoritative source for framework edits, from ripgrep-based search in every worktree of the clone (§ 11.5).

## Cross-cutting Considerations

- **Data loss is the failure that matters.** Rigor concentrates on the write paths — the racy rule, the
  index-before-file order, the swap and its second check, the settle rule, the stale-buffer base, the base read back
  after each write, and the persist and release steps — each traced to a measured loss in the spikes
  (`notes-storage-projection.md`). A refresh is retryable, so a refused one marks its file pending rather than failing
  the command. The residuals the design accepts are named (§ 17).
- **Trust boundary.** A hand edit is untrusted input. It reaches the store only through its kind's parser, the write
  check with a hand edit as the writer, and the backend's own checks at the write, which parse a stale base's merged
  content and enforce the authority rules however the edit arrives (§ 7). Write-back sets its provenance itself, never
  from the file (§ 7.4), and the serialization rules refuse binary content, oversized records, `.env` files, and private
  keys (§ 7.5).
- **Ignore integrity.** The guard keeps every projected path ignored, `.arc/user/*/` in `.gitignore` itself, so no
  packaging tool ships personal state (§ 11.2).
- **Performance.** The no-change budget is 10 ms on Linux and 60 ms on Windows, with three tripwires measured in place
  (§ 15).
- **Testing.** Unit and integration tests over the reference backend with real repositories and worktrees, on Linux and
  in the portability lane, the rebuild and a pull's fan-out among them, and the refusals the reference backend cannot
  return, the history pull among them, through a test store wrapping it (§ 1.5); the isolation test (§ 10.5); the
  `after` view's conformance case (§ 7.3); the multi-process lane once the ref backend lands; and the live verification
  of the lock before the flip (§ 1.5). Every typed refusal here — the guard's, a refused edit, the removal check's
  `persist-would-refuse` and `unobservable`, the persist and release steps', a start that cannot take its lock — is
  tested both refusing and succeeding once its condition is repaired.
- **Rollout.** Dark until the flip but for the worktree lock, ARC's managed `.ignore` block, and this repository's
  `.gitignore` line (§ 1.4). The lock lands last, after both seam members (§ 12.5), and this repository's existing
  worktrees take a one-off lock (§ 12.7). `storage-cutover` runs the first full materialization at the flip.
- **User-facing impact.** From the flip, files under `.arc/` are a working copy of the store, saved at the next `arc`
  command or by `arc save`. Protected files say so where they are read (§ 8.2); conflicts show in the file, or as a
  notice line resolved by `arc save --resolve` (§ 6); and write-back's report reaches stderr ahead of a command's own
  output (§ 2.2). Before the flip, a spawned checkout refuses a plain `git worktree remove` with a reason naming the
  exits (§ 12.1), session-init and `strategy-concurrent-work.md` name those exits (§ 12.6), and search tools in the
  ripgrep family find `.arc/user/*/` (§ 11.3).

## Success Criteria

1. **No save is lost.** Over the reference backend, with real repositories and worktrees on disk, on Linux and in the
   portability lane, a hand edit in any worktree — saved in place, by renaming a new file over it, or by an agent's
   write — reaches the store at the next `arc` command and every other worktree's copy at the writer's fan-out, a pull's
   merges included, saves timed into a refresh or a removal included, but for the residuals § 17 names.
2. **Conflicts reach every checkout and persist once resolved.** A clash with a stored base lands as a conflict record,
   and every checkout that renders the record draws it in: markers where placement's check passes — at the escalated
   length with the resolve-by-hand line where a side holds a marker-like line — a notice line where it fails or the
   conflict is whole-record, and, in a file with no stamp, status and the refusing verbs alone. A hand resolution of
   markers persists naming the conflict, `arc save --resolve` resolves a conflict shown without markers, keeping the
   store's side included, untouched markers keep a conflict open, and malformed markers refuse that entry, or the file
   for prose. A clash with no stored base stays in its file as markers and persists as an ordinary edit once resolved.
3. **Write-back checks every edit.** Write-back and `arc save` send each edit through its kind's parser against its
   base's record version, under `write-back` or `save`, and the store's merge and write check decide it; a change to a
   verb-owned field is refused and stays in its file; one refused edit blocks no other; each store refusal is handled as
   § 7.8 states; and the `after` view's conformance case passes over each backend that runs checks.
4. **Nothing an edit could lose is dropped.** An edit to a protected or archived file another person owns, an unadopted
   file, a file that fails to parse, a refused edit, a file held by a conflict, a clash found in the checkout included,
   a file withheld at an index rebuild, and a file not yet settled each stay in their file and are reported; the removal
   check answers `persist-would-refuse` for each, and the persist and release steps refuse over each, then succeed once
   it is resolved; a failed read answers `unobservable`.
5. **The lock holds.** Before the flip, every checkout ARC spawns for a work unit or an Errand carries
   `PROJECTION_LOCK_REASON`; a plain `git worktree remove` refuses it; the removal function removes it; a move keeps the
   lock; and an `arc start --here` checkout carries none.
6. **The layout holds.** The isolation test passes (§ 10.5); `layout.active: flat` lays the checkout's work item flat; a
   changed view setting, identity, or checkout claim reprojects what it governs; and every projected path resolves
   through `resolveArcPath` and back through the classifier.
7. **The budget holds.** The no-change overhead stays within 10 ms on Linux and 60 ms on Windows, and no tripwire fires
   at this repository's size.
8. **Dark before the flip.** Over the in-repo implementation the root hooks do nothing, `arc save` and `arc editor`
   refuse `unsupported`, `arc init` prints no Zed setting, and the removal slots pass.
9. **The ignore strategy holds.** The guard refuses a projected root no rule ignores and an `.arc/user/*/` rule outside
   `.gitignore`, and succeeds once the line is restored; `arc init`, `join`, `reconfigure`, and `update` write ARC's
   managed `.ignore` block, which re-includes all four roots for ripgrep and keeps a repository's own lines; and from
   the flip the `.worktreeinclude` copy skips the projected roots and `.arc/system/.local/`.
10. **The quality gates pass** at every gate the project declares.

## Open Questions

None blocks starting. The expected contracts in § 18 each state what holds until their change lands, and none leaves
this design open.

## Amendments

None.

---
