# Spec (`detailed` · `RFC`): projection-worktrees

- **Origin:** [internal] — the `storage-projection` cut (2026-10-30); stage 2 of the storage program.

- **Purpose:** Build the working copy across worktrees: every worktree that holds a projection refreshed from the store
  and reached by each writer's fan-out, full materialization and the tripwires, the removal slots and the release step
  that keep ARC from removing or releasing a checkout before its edits persist, and the user surfaces and scratch in
  every worktree — the third of the three members that build the behavior the storage contract settled in D13 and D17.

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
worktree lock. It left the mechanism inside to this design: how a command detects edits cheaply, how an edit reaches
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
- **Write-back** — sending a projected file's hand edit to the store at the start of a command
  (`spec-projection-write-back.md` § 2.2). **`arc save`** — the same on demand (`spec-projection-write-back.md` § 2.4).
  **Refresh** — rewriting projected files from the store. **Fan-out** — the refresh a writer pushes into every worktree
  on its machine once a write or a pull's merge lands. **Hand edit** — content a person or agent edited in a file, as
  against content a verb composed.
- **State version, record version** — the store's token for a point in its history, from which `changes` reads (D4), and
  a record's compare-and-swap basis, which covers its metadata as well as its content (D2; `spec-storage-ref-backend.md`
  § 3.4).
- **Base stamp** — the `<!-- arc-base: <blob id> -->` line naming the stored content a projected Markdown file was
  written from, on its first line or on the line after its YAML frontmatter (D13); that content is the file's **base**,
  a **stored base** where the store still holds it as a version.
- **Conflict record** — the stored record a merge files for a clash, holding the base and each side with a label naming
  the machine that wrote it and when, removed by the write that names it in `resolves` (D3, D6). A **hunk** conflict
  locates its clash by a base line range, an **entry** conflict by the entry's `_Id:_`, and a **whole-record** conflict
  replaces a single-writer record changed on both sides (D4).
- **Notice line** — an HTML comment beside the base stamp, which the store never holds: a protected file's
  (`spec-projection-write-back.md` § 8.2) or a conflict's (`spec-projection-write-back.md` § 6.3).
- **Index** — the projection's per-worktree record of what it wrote there (`spec-projection-substrate.md` § 3.1).
- **Projection lock** — the projection's per-worktree advisory lock over its own reads and writes there
  (`spec-projection-substrate.md` § 3.2). **Worktree lock** — D17's `git worktree lock`, which only blocks a checkout's
  removal (`spec-projection-substrate.md` § 12.1).
- **Aside folder** — the per-worktree folder holding copies of replaced files and staged replacements
  (`spec-projection-substrate.md` § 5.4).
- **Racy rule** — change detection after Git's: a file whose stat matches its index entry is clean only when its
  modification time is older than the index's reference stamp in the aside folder; otherwise its content is hashed and
  compared with what the projection last wrote there (`spec-projection-substrate.md` § 3.3).
- **Settle rule** — a file modified within the last 50 ms is read only once two stats 15 ms apart agree, up to three
  tries, else it waits for the next command; an empty projected Markdown file is never an edit
  (`spec-projection-substrate.md` § 4).
- **Replace guard, swap, aside copy** — before replacing a file, a refresh re-checks it by the racy rule and takes any
  edit in first: the replace guard (`spec-projection-substrate.md` § 5.1). The replacement, the swap, renames the file
  into the aside folder as an aside copy, hard-links the staged file onto the path, and checks the copy at once and
  again at the command's end, its second check (`spec-projection-substrate.md` § 5.2). A save that landed in a copy is
  taken in only while the copy's path has not moved on — still holds what the swap linked, or is absent, with no
  write-back of it sent since the swap; a copy whose path has moved on is kept and reported with its path until the
  person deletes it. Removing a file is the swap without the link, the removal swap (`spec-projection-substrate.md`
  § 5.6); rebuilding an absent file is the link alone (`spec-projection-substrate.md` § 5.5); and every command sweeps
  the copies a stopped writer left before write-back reads any file (`spec-projection-substrate.md` § 5.4).
- **Take-in port** — the one interface through which reading and replacing hand an edit to write-back, which answers
  `no-edit`, `taken-in`, `deferred`, `refused`, `unparseable`, `clashed`, or `pending` (`spec-projection-substrate.md`
  § 5.1).
- **Pending, refused, withheld, and changed marks** — the index's per-file marks (`spec-projection-substrate.md` § 3.1):
  a refresh or write-back still owed; the last write-back's refusal, with its typed reason and remedy; a file or aside
  copy a rebuild with no usable index left as it was, which nothing writes over or sends until the person deletes it
  (§ 2.5); and an edit made in this checkout since its last `arc save` (§ 11.7).
- **Full materialization** — writing every projected record into a worktree under the replace guard and adoption rules:
  at spawn, into a worktree that has none, and at `arc sync`; into a worktree with no usable index it refreshes only
  files that cannot hold an edit and withholds the rest (§ 2.5).
- **Persist step, release step** — the removal function's projection slots, which write back every edit in a checkout
  under its projection lock before ARC removes it, or before ARC releases an anchored checkout's claim, refusing while
  anything could be lost; the removal check's slot answers beforehand whether they would refuse (§ 12.2, § 12.3).
- **Work-unit marker, spawned checkout, anchored checkout** — as `spec-seam-lifecycle.md` defines them: the
  machine-local file naming the work item a checkout holds (`.arc/system/.internal/worktree-marker.json`,
  `lib/git/worktree-marker.ts`); a linked worktree ARC created for its work item, its marker carrying
  `spawnedByArc: true`; and a checkout ARC claimed in place without creating it, its marker carrying
  `spawnedByArc: false` from the flip.
- **Removal check, removal function** — `seam-lifecycle`'s one read-only check deciding whether ARC may remove a work
  item's checkout, and its one function removing it. This member fills their three projection slots (§ 12.2).
- **Work item** — a work unit, whose primary record is its meta, or an Errand, whose primary record is its Errand
  record.
- **§ Spike N, § Tripwire timings** — sections of the members' notes, which record each planning spike's harness,
  platforms, and results: Spikes 1, 1b, 3, and 7 in `notes-projection-substrate.md`, Spikes 4 through 6 in
  `notes-projection-write-back.md`, and Spike 2 and § Tripwire timings in `notes-projection-worktrees.md`; Linux runs
  are WSL2 on ext4, and Windows runs use `node.exe` on NTFS.
- **`D` and `A` numbers** — the shipped storage contract's decisions and amendments (`spec-storage-contract.md`), cited
  for the behavior they define; where this design changes one, § 16 states the change. An `A` number inside a citation
  of another specification, or in § 18's entry for one, is that specification's own amendment: the ref backend's A10 is
  `spec-storage-ref-backend.md`'s, not the contract's. **Record kinds** — the shipped kinds under `lib/store/kinds/`,
  specified in `spec-seam-record-kinds.md`.
- **This member** — `projection-worktrees`, the work unit this specification builds; a passage that means a sibling
  member names it.
- **Section numbers** — the design's own, kept with their gaps. Each member's specification holds its own § 1,
  § 16–§ 18, and Success Criteria; outside them a number names one section in every member's specification. The Goals
  and the Proposed Design map cover the whole design, so their citations name the design's sections wherever they are
  built. Elsewhere, a citation of a section this specification does not hold names the sibling specification that holds
  it: `spec-projection-substrate.md` builds § 2.1 but for its process-state module, § 3–§ 5, § 11.1–§ 11.3, § 11.5,
  § 12.1, § 12.4–§ 12.7, § 12.9's `arc-projection/**` entry and `checkout` root, § 13, and § 15.3's configuration read,
  and `spec-projection-write-back.md` builds § 2.1's process-state module, § 2.2's start, end, and report, § 2.3,
  § 2.4's `arc save`, § 6–§ 9, § 10.1–§ 10.4 but for reprojection, § 11.4, § 11.7 but for the changed mark a verb's
  fan-out, a refresh, and a rebuild set or move, and § 15.1. § 18 states what this member consumes from each sibling,
  and this specification copies the sibling passages it builds against: here § 2.1 whole, § 2.3, the rest of § 10.3 and
  § 10.4, § 3.1's index a command cannot use, the rest of § 11.7's changed mark, § 13's Git calls, and § 15.3's
  configuration read.

## Goals

_These are the goals of the design the three members build together; § 1.1 names this member's part, and its Success
Criteria test that part._

1. **Every stored artifact is a plain file at its familiar path** in every worktree that holds a projection, opened and
   searched by any editor, search tool, or agent with nothing in between (§ 2, § 10, § 11).
2. **No save is lost.** A hand edit saved in place, by renaming a new file over it, or by an agent's write reaches the
   store at the next `arc` command and every other worktree's copy at the writer's fan-out — saves timed into a refresh
   or a removal included — but for the residuals § 17 names (§ 3–§ 7).
3. **Nothing an edit could lose is dropped silently:** a refused, conflicted, unparseable, or unadopted edit stays in
   its file, is reported, and refuses the checkout's removal; a clash whose base the store holds reaches the store as a
   conflict record, which every checkout shows (§ 6–§ 9, § 12).
4. **ARC removes a projected checkout only after its edits persist,** through the seam's removal function and the
   projection's removal slots, behind D17's worktree lock (§ 12).
5. **A command's cost grows with what changed, never with how much state exists:** the projection's no-change overhead
   stays within 10 ms on Linux and 60 ms on Windows (§ 15).
6. **Windows holds** — held files, same-size saves, file identity, and line endings — and the projection's tests run in
   the portability lane, which runs Windows and macOS, as the store's own run there from `storage-ref-backend` (§ 13).
7. **Dark until the flip** but for three pieces that need no store: the worktree lock, ARC's managed block in the root
   `.ignore`, and this repository's `.gitignore` no longer ignoring `.ignore` (§ 1.4).

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

This change does not:

- **build what its sibling members build:** the ignore strategy, the engine's state, reading and replacing, and the
  worktree lock (`projection-substrate`), and write-back and conflicts, edit rights, the `active/` layout, adoption, the
  settings, and the selection (`projection-write-back`), on both of which this member builds (§ 18);
- **change any caller-visible behavior D13 or D17 settles,** except by the forward amendments § 16 states;
- **build the checkout removal function or its removal check, or move any caller onto them** (`seam-lifecycle`,
  `seam-locus`); **build any kind's parser or write check** (the record kinds and the seam's members); **build the
  layout classifier that maps a path to its record** (`seam-locus`), into which `projection-write-back` registers its
  addresses (`spec-projection-write-back.md` § 10.1); or **reconcile scratch folders at session start** (`seam-locus`);
- **build the ref backend, its stale-base merge, its import, or a store several processes share**
  (`storage-ref-backend`), including the hunk conflict record's `baseVersion`, `currentLines`, and `incomingLines` and
  the merge library's base-version input, which this design reads (`spec-projection-write-back.md` § 6.3, § 16.2); or
  **run the flip, its workflow rewrite, or the deletion pass** (`storage-cutover`);
- **show a conflict's sides in status** (`seam-status-roadmap`), which a conflict shown without markers points to
  (`spec-projection-write-back.md` § 6.3);
- **build the Markdown checks over projected state, choose which checks run over the selection, or change the fixer**
  (`projected-markdown-checks`, no edge either way); `projection-write-back` supplies the selection and connects its
  reader (`spec-projection-write-back.md` § 11.7), and `lint:md:fix` already fixes Git's Markdown list plus the
  selection;
- **build a file watcher, a daemon, or the one-copy-per-machine fallback** (Alternatives & Rationale);
- **resolve ARC core from the installed package** (`framework-core-from-package`); the projection keeps only the seam a
  second source plugs into (§ 14);
- **move the checkout marker, the pristine store, or the generated schemas out of `.arc/system/.internal/`**
  (`config-storage-architecture`; § 12.9);
- **change what `.worktreeinclude` copies**, which already leaves out the projection's paths (§ 11.6).

## Proposed Design

This map covers the whole design, whose sections the Section numbers term places among the members. § 1 bounds the
change and orders it. § 2–§ 7 build the engine: one command's sequence, what each worktree records, how an edit is read,
how a file is replaced, how conflicts show and resolve, and how write-back sends an edit for the store to merge and
check. § 8–§ 11 settle edit rights, adoption, the `active/` layout, and ignoring. § 12 covers worktrees: the lock, the
removal slots, and every worktree's own copy. § 13–§ 15 cover Windows, a second source, and cost. § 16 states the
amendments to the shipped contract, § 17 the residuals the design accepts, and § 18 the expected contracts it consumes.

### 1. Boundary, scope, and order

#### 1.1 Three members

The engine, the ignore strategy, the worktree lock and the removal slots, the `active/` layout, and retiring the user
surfaces' rooting in the primary all hang off one engine and were designed as a whole, in one specification, which the
three members' specifications divide. They are delivered as three work units in order, each landing single-branch with
chunked review, as every storage-program work unit does (`cohort-state-storage.md` § Soft coordination), and each
covering its own review chunks (§ 1.3) (Owner, 2026-10-30):

1. **What needs no store** (`projection-substrate`) — the ignore strategy, the engine's state, and reading and
   replacing, with the worktree lock and the removals printed or documented, the lock last.
2. **The edit path** (`projection-write-back`) — write-back and conflicts with `arc save`, edit rights, the `active/`
   layout and the checkout-rooted path function, adoption, the settings, and the selection.
3. **Across worktrees** (`projection-worktrees`, this specification) — refresh, fan-out, materialization and the
   tripwires, the removal slots and the release step, the user surfaces in every worktree, and scratch.

**Why three.** This project's boundary-fit override returns the call to the Owner above about 1,500 specification lines,
1,000 task-list lines, or six phases, where coupling alone does not keep a work unit whole. At the decision the design
ran 2,374 lines and its task list 2,525 lines across eight phases, past every mark. The design's own seams cut it. The
first member's store reads, over the reference backend, are the current version the replace guard restages
(`spec-projection-substrate.md` § 5.1) and a record's `history` in base-stamp recovery and, for a file other than
Markdown, at the version a stopped replacement replaced, whose `state-unresolvable` arms pull nothing
(`spec-projection-substrate.md` § 3.5, § 3.7); it reaches write-back only through the take-in port it defines and the
second member binds (`spec-projection-substrate.md` § 5.1), so it needs nothing `storage-ref-hardening` changes, and
builds and lands while that work does, shortening the cutover's critical path by its length. The second is the first to
observe hardening's surfaces, and the third builds the cross-worktree machinery over the second's write path.

**Order.** The first depends on nothing outstanding: `seam-lifecycle`, `seam-locus`, and `storage-ref-backend`, which
the whole design consumes, have shipped. The second depends on the first and on `storage-ref-hardening`, whose listing
scope, fault classes and remedies for missing or misplaced objects, and sweep of the pull results' consumers its
write-back and the refusals it reports observe (§ 18). The third depends on the second, and takes the hardening through
it. Every part of a member that consumes another change therefore finds it on base (§ 1.5, § 18,
`spec-projection-substrate.md` § 12.5).

`cohort-storage-projection.md` records every member's review chunks.

#### 1.2 What this change takes

- **`lib/store/projection/`** — refresh and fan-out, materialization, and the three removal slots, over
  `projection-substrate`'s engine and `projection-write-back`'s write path.
- **`lib/store/create.ts`** — the store `createStore` builds, the one place every caller's store is composed, wraps
  `write`, `batch`, and the ref backend's `pull` and `push`, so each landed write and each pull's merges fan out
  (§ 2.2).
- **`arc sync`** — rebuilds deleted projected files (§ 2.4).
- **The spawns of a work item's checkout** — a full materialization once the marker is written, before the worktree
  lock, through the materialize port the root hook binds (§ 2.5).
- **`lib/store/registry.ts`** — the three machine-local `MACHINE_LOCAL_PATHS` entries in `.arc/system/.internal/`
  (§ 12.9).
- **Tests** — unit and integration tests over the reference backend; the isolation acceptance test (§ 10.5); a
  regression test holding the `.worktreeinclude` copy off `.arc/` (§ 11.6); and the multi-process lane over the ref
  backend (§ 1.5).

#### 1.3 Review chunks and their order

This member lands as review chunks on its own branch, each chunk with its tests, in this order;
`cohort-storage-projection.md` records every member's:

1. **Refresh, fan-out, materialization, and the tripwires** (§ 2.5, § 15), the start's refresh of what the store
   changed and the fan-out among them (§ 2.2, § 15.2), with the `createStore` wrapper, the changed mark a verb's
   fan-out sets (§ 11.7), reprojection on a changed view setting, identity, claim, or `layout.active` (§ 10.3,
   § 10.4), the isolation test (§ 10.5), the multi-process lane (§ 1.5), and the `.worktreeinclude` copy's
   regression test (§ 11.6).
2. **The removal slots and the release step** (§ 12.2, § 12.3), with the multi-process lane's saves into a persist
   step (§ 1.5), the user surfaces in every worktree (§ 12.8), and scratch (§ 12.9).

#### 1.4 Before the flip

The projection keys on the contract's one capability (D1, D15). Over the in-repo implementation, which answers false,
the tracked files are the store and the projection does nothing: the three removal slots pass — `check` answers
`passes`, and `persist` and `release` write nothing and return `persisted` and `released` — so the removal function runs
its Git part alone, as `seam-lifecycle` builds it before any slot is filled (`spec-seam-lifecycle.md` § 11.2).

The three pieces that run live before the flip — the worktree lock, ARC's managed `.ignore` block, and this repository's
`.gitignore` no longer ignoring `.ignore` — are `projection-substrate`'s.

The `MACHINE_LOCAL_PATHS` entries (§ 12.9) are data no code acts on before the flip, so they land with their chunk.

#### 1.5 Verification

- **The gate here:** unit and integration tests over the reference backend — test-only, in-memory, capability true (D7)
  — with real temporary repositories and worktrees on disk, on Linux and in the portability pair (§ 13). As
  `storage-ref-backend` builds it, the reference backend refuses `state-unresolvable` for a state version it holds no
  snapshot of, implements `pull`, and runs the kind's parser over a stale base's merged content
  (`spec-storage-ref-backend.md` § 14.2), so the gate exercises the rebuild (§ 15.2), the fan-out of a pull's merges
  (§ 2.2), and the refusals the reference backend returns — `record-malformed`, `version-conflict`, and `lock-held`
  (`spec-projection-write-back.md` § 7.8). It holds no history refs — its `state-unresolvable` refusal names none
  (`stateUnavailable`, `__tests__/helpers/store/read.ts`), and its `pull` ignores what it is asked to fetch
  (`ReferenceBackend`, `reference-backend.ts`) — and serves every registered kind (`reference-fixture.ts`), so the
  refusals it cannot return — `state-unresolvable` naming a missing history ref, on a write or on `history`, and
  `unsupported` `unhomed-kind` — and the history pull that answers the first (`spec-projection-write-back.md` § 8.4) are
  exercised through a test store that wraps it and returns them.
- **The multi-process lane:** the burst cases — twenty worktrees, concurrent saves into refreshes, fan-outs, file
  removals, and a checkout's persist step — need a store several processes share, which the in-memory reference backend
  is not. This member builds the lane over the ref backend, gated and run as that backend's own bursts are (§ 18),
  its processes lined up at the engine's step hooks across process boundaries, and a run whose processes never reached
  each hook fails.
- **No CLI process runs over either backend before the flip,** since `createStore` builds the in-repo implementation
  alone until then: the engine's entry points, `arc save`'s handler, and the removal slots take the store they run over,
  and the integration tier drives them over the reference backend, while end-to-end tests cover the dark path and the
  root hooks' wiring.
- **The live rehearsal:** `storage-cutover`'s, before the flip.

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

The engine's process-wide state lives in one module in `lib/store/projection/`, since `createStore` builds a new store
at each call site: whether the projection is off for the command (§ 2.3, § 2.5), whether the process holds a projection
lock (`spec-projection-substrate.md` § 3.2), the fan-out's rounds (§ 2.2), the `history` memo
(`spec-projection-substrate.md` § 3.5), each checkout root's claim and effective `layout.active`
(`spec-projection-write-back.md` § 10.1), and the ports the root hook binds — the take-in bound to write-back, the
edit-rights function, adoption's mint, and materialization. A process whose root hook never ran, a script or a test that
binds nothing, fans out nothing, and each sibling refreshes at its next command.

#### 2.2 One command, in order

##### The fan-out

- **The fan-out.** The store `createStore` builds (`lib/store/create.ts`), the one place every caller's store is
  composed, wraps `write`, `batch`, and the ref backend's `pull` and `push`, which replace today's `sync`
  (`spec-storage-ref-backend.md` § 2.1), so a pull's merges, which land with no `write` (its § 6.4), fan out too. Once a
  write lands, the writer refreshes every worktree on the machine that holds a projection, its own included, which it
  finds from its own root rather than from Git's list, taking each one's projection lock in turn and bringing each up
  from that worktree's own state version, never only its own write.
- **A write made under a projection lock** — write-back at the command's start, the persist and release steps, a stub
  minted during adoption — fans out once that lock is released, since the lock never breaks for its own holder
  (`isMainLockBreakable`, `lib/advisory-lock.ts`); the command's start fans out once for all its write-backs. A write
  landing during a fan-out — a take-in in a sibling's refresh, a stub minted by adoption — joins that fan-out's next
  round rather than starting another.
- **What a fan-out reads.** It lists the machine's registered worktrees, detached ones included
  (`scanRegisteredWorktrees`, `lib/git/worktree-roster.ts`, one `git worktree list` call), skips one whose listed path
  holds no `.git`, or whose aside folder holds no reference stamp (`spec-projection-substrate.md` § 3.3, § 5.4) — Git
  lists a primary whose `.git` is a `gitdir:` file at its Git directory, or at that directory's parent where it is named
  `.git`, a folder no projection was laid in — leaving it to that checkout's own next command, reads the index of each
  one that holds a projection for the state version it last projected, then reads `version()`, and asks `changes` once
  per distinct state version among them, normally one. Under each worktree's lock it reads the index again and skips the
  worktree when that state version changed since — another refresh reached it first, so it may already be newer, and
  state versions carry no order to tell (`StateVersionSchema`, `lib/store/identity.ts`). It skips a worktree already
  current the same way, and one whose state version no longer resolves, which that worktree's own next command rebuilds
  (§ 15.2). A primary entry's re-lay lists its owner's records once per fan-out, shared by every worktree (§ 15.2).
- **Fan-out keeps copies fresh and carries no correctness:** whatever it misses — a write through another tool, a
  process that stopped — each worktree's next command start refreshes, and an edit made to a stale copy merges through
  the store (`spec-projection-write-back.md` § 7.1).

#### 2.3 The skip switch

One global flag runs a command with no write-back and no refresh, after jj's `--ignore-working-copy`, so a projection
defect cannot lock a person out of `arc` and the recovery path stays reachable. Its edits stay pending for the next
command, and nothing keeps it on as a mode. It skips the command's start, its end, `arc sync`'s rebuild (§ 2.4), and the
fan-out of the command's writes, the persist and release steps' writes among them, since fan-out carries no correctness
and each worktree's next command refreshes (§ 2.2). The removal check and the persist and release steps otherwise run
under it exactly as without it, since each settles a checkout's edits before ARC removes the checkout or releases its
claim: a defect in one refuses the removal or release, the checkout and its claim staying as they were with nothing
lost, until the defect is repaired, and a removal may instead be forced past it (§ 17). It is an escape hatch, not what
keeps ARC's own machinery checkouts out: those hold no projection (§ 2.5). The flag's name is `--skip-projection`.

#### 2.4 `arc save` and `arc sync`

- **`arc sync`** rebuilds deleted projected files (D13), as a full materialization (§ 2.5) run before its network steps,
  so an offline sync still rebuilds; `--dry-run` skips it, and with no identity its existing refusal
  (`resolveUserIdentity`, `handlers/shared.ts`), which names `arc.identity`, comes first. With a usable index it writes
  each absent file by the link alone (`spec-projection-substrate.md` § 5.5), replaces by the swap each deleted one — an
  emptied Markdown file (`spec-projection-substrate.md` § 4) or a symbolic link at a projected path
  (`spec-projection-write-back.md` § 9) — and leaves every other present file to the refresh. A rebuild that fails is
  reported and the sync goes on to its network steps, its files left to the next sync, and `--skip-projection` skips it
  (§ 2.3).

#### 2.5 Which checkouts hold a projection

A worktree holds a projection when it holds an index (`spec-projection-substrate.md` § 3.1), and gets one — at spawn, or
at its first `arc` command — when it is the primary or its work-unit marker names a work unit or a transient claim, a
checkout claimed with `arc start --here` included, which D17 has write the marker from the flip. A marker names one when
its ownership decodes as `current` (`decodeWorktreeMarkerOwnership`, `lib/git/worktree-marker.ts`) and it carries no
husk stamp, a transient claim's provisioning being `ready`; a `pending` provisioning, a `manual-only` ownership, a
husk-stamped marker, and a subject naming a branch give none. Any other checkout — one of ARC's own machinery checkouts,
or a hand-made worktree nothing has claimed — gets none, and `arc` runs there with the projection off. ARC's machinery
checkouts carry no such marker: the review gate's materializations, base sync's managed checkout
(`lib/git/base-sync.ts`), the delivery-refresh and review-fix worktrees, and the test-cost benchmark's checkout
(`lib/test-cost/ref.ts`) have none, and a decomposition worktree's marker names a branch, not a work item
(`git-decompose-v3-operation-io.ts`).

A command whose configuration yields no identity — no `arc.identity` and no `user.name` that slugifies to one, or an
invalid `arc.identity` — runs as under the skip switch (§ 2.3), reporting the remedy that sets `arc.identity`, since the
personal root and edit rights key on the identity. `arc save` and `arc selection`, which refuse the switch, refuse
naming that remedy (`spec-projection-write-back.md` § 2.4, § 11.7), and so do the persist and release steps on a
checkout this section gives a projection or that still holds an index, whose removal check answers `would-refuse` with
it (§ 12.2, § 12.3). The identity comes from the one rule `lib/git/identity.ts` owns, applied to the values the start's
one configuration read returns (§ 15.3).

A **full materialization** writes every projected record, under the same replace guard and adoption rules as any refresh
(`spec-projection-substrate.md` § 5, `spec-projection-write-back.md` § 9): at spawn, into a worktree that has none, and
at `arc sync`, which rebuilds every deleted file. It first writes the clone's exclude entries, once per clone
(`spec-projection-substrate.md` § 11.1), and runs the guard before writing into any root (`spec-projection-substrate.md`
§ 11.2), since on a fresh clone nothing ignores the shared roots until those entries exist. Into a worktree with no
usable index (`spec-projection-substrate.md` § 3.1), it acts only where a file cannot hold an edit, since without the
index's marker map and stale-buffer state no rule reads one safely: a file at a path the current projection lays a
stored record at is refreshed where its blob id, its stamp set aside, equals its stamp's, or, with no stamp, the stored
content's. Every other file under a projected root — one holding markers or an edit, an empty one, one mid-save, or one
at a path the current projection lays no stored record at — is left as it is, written over by nothing and sent nowhere,
and the new index it writes marks it withheld (`spec-projection-substrate.md` § 3.1); a file
`spec-projection-write-back.md` § 9 never adopts and a path `MACHINE_LOCAL_PATHS` lists (§ 12.9) are left alone, as
write-back leaves them. Status and each command's report name every withheld file, refresh and write-back skip it,
removal leaves it at its path (`spec-projection-substrate.md` § 5.6), and the removal check and the persist and release
steps refuse over it (§ 12.2); the sweep before it withholds aside copies the same way (`spec-projection-substrate.md`
§ 5.4). Deleting a withheld file, after copying out what is wanted, releases it: where the current projection lays a
stored record at its path its mark turns pending, so the next command's refresh writes it from the store (§ 15.2), and
otherwise its entry goes, nothing written there; the person re-applies their edit as an ordinary one (residual, § 17). A
linked checkout whose marker is released loses its projection once the release step has persisted its edits (§ 12.3). A
checkout this section gives no projection that still holds an index — its marker changed under it — is checked and
persisted as one it gives a projection (§ 12.2, § 12.3), so no index outlives edits not yet persisted.

### 3. State and change detection

#### 3.1 The index

**An index a command cannot use.** A worktree whose index is missing, unreadable, or of a format version other than the
running build's, where § 2.5 gives it a projection, gets a full materialization that writes over no file it cannot read
without one (§ 2.5). Fan-out and the end skip a worktree whose index they cannot read or whose format version is not
theirs, leaving it to that worktree's own next command, so one checkout's build never rewrites another's index in a
format that checkout cannot read; checkouts on different branches can run different builds. The removal check answers
`unobservable` for a target whose index is unreadable or of another format version, or missing where § 2.5 gives it a
projection, its detail naming the remedy — run the removal or release from that checkout, whose own build reads its
index or rebuilds it at its start — and the persist and release steps refuse with the same remedy.

### 10. The `active/` layout

#### 10.3 The revert key

D13's one layout-resolver setting is a project key in `arc-config.yml`, `layout.active`, taking `nested` (the default)
or `flat`, where `flat` lays the checkout's work item flat in `active/` and leaves everything else unchanged. It is a
project key, not a personal one: docs, workflows, and agents reach paths through the layout resolver, and a personal key
would let two people's instructions point at different paths. It follows the file's flat, dotted key form, and it stays
until the layout has seen use (D13). The index records the value each worktree was projected under, and a command that
reads a different one reprojects `current/`, as a changed claim does (§ 10.4).

#### 10.4 The in-flight view setting

The setting — `mine` (the default), `cohort`, or `all`, plus named pins — is personal. It lives where personal settings
live today, `arc.*` keys in `git config --local`: `arc.inflightView`, one value, and `arc.inflightPin`, one entry per
pinned slug. It moves with the other personal keys when `config-storage-architecture` builds its per-developer tier
(§ 18).

The index records the effective setting, pins included, the identity, and the checkout claim the worktree was projected
under. A command that reads a different one reprojects what it governs: views added, a file leaving a view through the
removal path (`spec-projection-substrate.md` § 5.6), the personal roots following a changed identity, and `current/`
with the notices naming an owning checkout following a changed claim, since a release, a promotion, or a materialize
changes the marker without a store write.

A notice here that names another checkout as the owner reads it from that checkout's marker, which this index does not
record, so it can lag a release, promotion, or materialize there until that file's record next changes, a primary re-lay
rewrites it (§ 15.2), or a reprojection here; the persist refusal behind it names where to apply an edit from the
machine's markers as they stand when it fires (`spec-projection-write-back.md` § 8.2; residual, § 17).

#### 10.5 The isolation invariant and its test

Per-worktree isolation becomes "`active/current/` holds only this checkout's work item" (D13). An integration test over
the reference backend holds it: spawn a worktree for a work unit from base, and assert that `active/current/` holds
exactly that work unit's files plus a copy of each cohort document it names, that `active/in-flight/` holds exactly the
views the setting selects, and that `active/`'s top level holds nothing else. The test checks the layout the
documentation states, and adds no guard on today's flat layout, which the flip replaces. `storage-cutover`'s
documentation pass rewrites `strategy-work-organization.md` § Per-Worktree Isolation and its acceptance test to match
(§ 18).

### 11. Ignoring, finding, and editor settings

#### 11.6 The `.worktreeinclude` copy

The `.worktreeinclude` copy (`copyWorktreeIncludes`, `lib/git/worktree-include.ts`), which every spawn runs through
`lib/git/linked-worktree-setup.ts`, copies each untracked file in the primary that a `.worktreeinclude` pattern matches
into the new linked worktree when that worktree ignores it — editor settings and `.env` files above all. From the flip
the projection's files are such files, and the copy runs before the projection lays out the new worktree, so a copy of
the primary's would seed it with the primary's own work item's files in `active/current/`, which adoption would then
take into the new checkout's work item (`spec-projection-write-back.md` § 9), and with copies whose stamps and unsaved
edits the new index does not know. The copy already copies nothing under `.arc/` (`isArcPath`), which keeps out every
projected root and `.arc/system/.local/`, so the projection fills them itself (§ 2.5); a regression test holds it.

#### 11.7 The selection of editable Markdown files

`spec-projection-write-back.md` § 11.7 builds the selection and its `--changed` part, the files this checkout changed
since its last `arc save`, read from a changed mark per file in the index, which write-back sets and `arc save` clears.
This member sets the mark for a verb's write through its fan-out, carries it with its record when a refresh moves the
path, and sets it on every file at a rebuild with no usable index. The mark's rules, whole:

- **Setting the mark.** Write-back sets it whenever it finds an edit in the file, whatever comes of the edit — landed,
  refused, skipped for failing to parse (`spec-projection-write-back.md` § 7.1), or left pending — on the checkout whose
  file holds the edit, whichever process takes it in, so a sibling's refresh that takes the edit in
  (`spec-projection-substrate.md` § 5.1) or a persist step marks the holding checkout. A verb run from this checkout
  sets it too, marked by the writing process when its fan-out refreshes its own checkout (§ 2.2); a verb writing for
  another checkout, as graduation does into a spawned worktree, marks nothing there, and a refresh that only rewrites a
  file, from a sibling's write or a pull, never sets it. Until this member's fan-out lands, no refresh follows a verb's
  write, so `--changed` holds hand edits alone.
- **Clearing the mark.** Every command's start already lands edits (`spec-projection-write-back.md` § 2.2), so
  `arc save` clears the mark under the projection lock on every file except one still holding an edit the store lacks —
  left refused, failing to parse, pending, withheld (§ 2.5), or held for a resolution (`spec-projection-write-back.md`
  § 6.4) — and a verb write racing it can only over-include. The mark follows its record when a refresh moves the path
  (§ 15.2), and an index rebuilt with no usable index (§ 2.5) marks every file until the next save. How often the save
  anchor moves is `storage-cutover`'s workflow rewrite to decide, so until a workflow saves per increment, the set spans
  the work since the last save.

### 12. Worktrees

#### 12.2 The removal check and the persist step

`seam-lifecycle` builds the removal check and the removal function and moves lifecycle's callers onto them; `seam-locus`
moves the Errand's exits and the session-init sweeps (`spec-seam-lifecycle.md` § 11; `spec-seam-locus.md` § 12.1). The
removal check reads only and takes no lock, and returns `removable`, `missing` when only Git's registration remains, or
`refused` as `dirty` with the changed paths, `unobservable` with its detail, `locked` with the lock's reason when a lock
the projection did not set holds the checkout, or `persist-would-refuse` with a remedy. Its Git part reads what today's
`isWorktreeClean` reads (`lib/git/worktree-cleanup.ts`). With the checkout's folder present, the removal function runs
the check, the persist step, `git worktree unlock` when Git lists the checkout locked with the projection's reason, and
a plain `git worktree remove`, and returns `removed`, `pruned`, `refused` with the check's result, or `failed` naming
the step.

- **Caller authority between the steps.** A caller re-observes its own authority through `beforeRetire`
  (`RemoveWorktreeCheckoutOptions`, `lib/git/worktree-removal.ts`) — fresh marker, branch, and HEAD checks for a
  spawned Errand's retirement (`lib/errand/terminal-occupancy.ts`), fresh detached-HEAD preservation checks for
  `arc locus release` (`lib/locus/release.ts`). `removeWorktreeCheckout` calls it after the persist step and its
  re-read of the registration, before the unlock, and again before the remove. The slots never unlock, remove, or clear
  a marker, and the projection lock, released at the persist step's end, never stands in for those checks.

The function takes this member's three slots (`ProjectionRemovalSlots`, `spec-seam-lifecycle.md` § 11.2), each passing
until filled; this member fills them in `lib/store/projection/`. Every production composition of the removal check, the
removal function, and the release takes them once the capability is on, the retiring verbs' `checkRetiringCheckout`
among them, so none falls back to the passing defaults (`passingProjectionRemovalSlots`, `lib/git/worktree-removal.ts`).
`lib/locus/primary-safety.ts`, which also reads only `git status`, decides only whether the primary may host a transient
claim — a branch switch that leaves the gitignored projection in place and removes no checkout — and stays as today.

**`check(checkout)`** — the removal check's projection part. It reads only, writes nothing, and takes no lock, and
answers:

- `passes`, as a checkout § 2.5 gives no projection and that holds no index does before the identity is consulted;
- `would-refuse` with a remedy, when the persist step would refuse — a file adoption would refuse
  (`spec-projection-write-back.md` § 9), held by a conflict (`spec-projection-write-back.md` § 6), failing to parse,
  holding an edit its edit rights or a read-only source refuse (§ 14, `spec-projection-write-back.md` § 8) or another
  refused edit (`spec-projection-write-back.md` § 7.6), an aside copy whose edit is refused or clashes in the checkout,
  or that holds an edit once its path has moved on (`spec-projection-substrate.md` § 5.2), a file or aside copy withheld
  at an index rebuild (§ 2.5, `spec-projection-substrate.md` § 5.4), or not yet settled (`spec-projection-substrate.md`
  § 4), or, for a checkout § 2.5 gives a projection or that holds an index, a configuration that yields no identity
  (§ 2.5) — which the check reports as `persist-would-refuse`;
- `unobservable` with its detail, when a read it needs fails — the store, the index, or a projected file — which the
  check reports as it reports its Git part's failed read, so a failed read never reads as `persist-would-refuse`.
  Branch-gone recovery keeps a `persist-would-refuse` checkout as a switch target, a live checkout, but reads
  `unobservable` as `external` (`spec-seam-locus.md` § 12.1), and nothing observed the checkout. A store read refusing
  `namespace-corrupt`, `identity-mismatch`, or `state-unresolvable` is such a failed read: the slot cannot tell what the
  persist step would meet.

The index's refused and pending marks record what the last write-back or refresh met, never what a file holds now
(`spec-projection-substrate.md` § 3.1), so the slot runs write-back's read path over each changed file in every
projected root, `completed/` included, and over each settled aside copy in the target's aside folder, which the persist
step would take over: the settle rule, the edit rights (`spec-projection-write-back.md` § 8) with a read-only source's
protection (§ 14), the parser, the store's merge run in the checkout, the kind's write check over the merged content
with `spec-projection-write-back.md` § 7.3's views, and `checkSerializationRules` (`spec-projection-write-back.md`
§ 7.5). An edit made since the last command and a refusal since reverted both read true, and the aside copies read as
`spec-projection-substrate.md` § 5.2 states, as the persist step's takeover reads them: in the order their swaps were
made (`spec-projection-substrate.md` § 3.1), each read with the record that a write-back has been sent since its swap
set wherever an earlier copy of its path would be taken in. For a new folder under `backlog/` it reads adoption's
verdict without minting — the meta's parse, the `Owner` rule, and `arc stub`'s own checks of the parameters the meta
supplies (`spec-projection-write-back.md` § 9) — and a refusal only the verb's executor returns reaches the persist
step, which refuses with the verb's remedy. Its cost is the stat walk, about 3 ms on Linux and 27 ms on Windows at 1,000
files (§ Spike 2), plus the read of each changed file. The third answer is `seam-lifecycle`'s, as shipped (§ 18).

**`persist(checkout)`** — the persist step, run by the function after the check and before it unlocks and removes the
checkout:

1. On a checkout § 2.5 gives no projection and that holds no index it returns at once, before the identity is consulted.
   Otherwise it takes the target worktree's projection lock. Where the lock stays held until `AdvisoryLockTimeoutError`,
   the step refuses, naming the holder and a retry; where the lock's lease is lost while the step runs
   (`spec-projection-substrate.md` § 3.2), it refuses with a retry; and with no identity (§ 2.5) it refuses naming the
   remedy that sets `arc.identity`.
2. It writes back every edit there under `write-back` (`spec-projection-write-back.md` § 7.4), every projected root
   included, each file as its own write, waiting through the settle rule's tries for a file not yet settled
   (`spec-projection-substrate.md` § 4). If any file then stays unadopted, held by a conflict, failing to parse, holding
   a refused edit, withheld at an index rebuild (§ 2.5), not yet settled, or pending after a `lock-held` refusal
   (`spec-projection-write-back.md` § 7.8), the step refuses with that file's remedy — for the last two, a retry — and
   the file keeps its content. A symbolic link is never adopted and refuses nothing (`spec-projection-write-back.md`
   § 9).
3. It takes over every aside copy there, in the order their swaps were made (`spec-projection-substrate.md` § 3.1), its
   writer live or not, as `spec-projection-substrate.md` § 5.2 states: once a copy has settled
   (`spec-projection-substrate.md` § 4), it takes in an edit the copy holds while its path has not moved on, and deletes
   the copy, so the writer's own second check finds nothing left. A copy whose edit is refused or fails to parse is kept
   as `spec-projection-substrate.md` § 5.2 states, and the step refuses with its remedy; one whose edit clashes in the
   checkout is kept, and the step refuses as held by a conflict; and one holding an edit once its path has moved on is
   kept, and the step refuses, naming the copy's path and the remedy of copying out what it holds and deleting it. A
   copy withheld at an index rebuild (`spec-projection-substrate.md` § 5.4) is left as it is, and the step refuses with
   § 2.5's remedy. A copy that does not settle, or whose edit write-back defers or leaves pending, is kept and the step
   refuses with a retry, since no later sweep runs once the checkout is gone (`spec-projection-substrate.md` § 5.2).
4. It checks every projected file and the aside folder once more against the index by the racy rule, walks the projected
   roots' folders again for files the index does not hold (`spec-projection-write-back.md` § 15.1), and writes back,
   adopts, or takes over, as steps 2 and 3 do, whatever changed or appeared since those steps read it, at most three
   passes; a file or copy still changing refuses the step with a retry.
5. It releases the lock and returns, and its writes fan out then (§ 2.2), unless the skip switch is set (§ 2.3).

It releases the lock before returning because the lock is not reentrant (`spec-projection-substrate.md` § 3.2): a step
that returned holding it would stall the same command's fan-out into that worktree — a teardown's own store write among
them — and its end's second check, each waiting until `AdvisoryLockTimeoutError` while the removal failed or had not yet
run. With the lock released, a refresh that writes there between the step and the removal writes files the removal then
deletes, losing nothing, since the store holds what it wrote; where that write holds a file open as the removal runs,
the remove step can fail, the function returns `failed` naming the step, and a rerun completes it. A hand save landing
in that window goes with the checkout (residual, § 17).

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
marker is cleared, and the path refuses if it refuses. `releaseWorktreeCheckout` runs the check and this slot and
returns; its caller clears the marker, `arc locus release` after calling its `beforeRetire` once the slot has returned
(`lib/locus/release.ts`), so the slot, which clears no marker, never stands in for the caller's checks:

1. On a checkout § 2.5 gives no projection and that holds no index it returns at once, as the persist step does.
   Otherwise, under the target worktree's projection lock, taken and refused as the persist step takes it, it runs the
   persist step's steps 2–4 — the write-back of every edit there under `write-back`, the takeover of every aside copy,
   and the last check — refusing on the same conditions.
2. On a linked checkout, it then removes the projection — each file by the removal swap (`spec-projection-substrate.md`
   § 5.6), refusing where an edit goes back to its path as a refused edit, as held by a conflict where an edit the swap
   takes in clashes in the checkout (`spec-projection-write-back.md` § 7.7), and with a retry where write-back defers or
   leaves pending an edit the swap takes in, then the aside folder and the index — since a checkout no marker claims
   holds none (§ 2.5). The primary — decided by reading its `.git` (`spec-projection-substrate.md` § 3.1), as § 2.5
   decides it, not by the `isPrimary` it is passed, which `releaseWorktreeCheckout` (`lib/git/worktree-removal.ts`)
   computes by comparing the checkout with the primary path its caller supplies — keeps its projection, which its next
   refresh lays out as for a checkout with no current work item.
3. It releases the lock and returns.

A caller that fails after the step leaves the marker, and the next command projects again.

#### 12.8 The user surfaces in every worktree

Under the capability the projection gives every worktree its own copy of the user surfaces — the identity's personal
records, `USER-INBOX` and `WORKING-MEMORY` among them — and reads none through `lib/user-surfaces.ts`'s resolver (D13).
The in-repo implementation keeps the resolver (`lib/store/in-repo/personal-paths.ts` imports it), and teardown keeps
merging a linked worktree's copy up through `lib/user-surface-migration.ts` until the flip, so both stay as the in-repo
implementation's arms. The seam's members move their own callers off the resolver (`spec-seam-locus.md` § 10.3), and
`storage-cutover`'s deletion pass removes the rooting and the migration with the in-repo arms (D15; § 18).

#### 12.9 Machine-local paths and scratch

`MACHINE_LOCAL_PATHS` (`lib/store/registry.ts`) lists what is never stored, synced, or projected, each entry a root and
a pattern. Under the `checkout` root `projection-substrate` adds to the registry's roots, with `.arc/system/.local/**`
beside it (`spec-projection-substrate.md` § 12.9), this member registers the three machine-local entries in
`.arc/system/.internal/` where they stand, each by name — the checkout marker (`worktree-marker.json`), the pristine
store (`pristine.json`), and the generated schemas (`schemas/**`) — never all of `.internal/`, which holds tracked and
stored files. `projection-substrate` also registers `arc-projection/**` under the per-worktree Git-directory root,
`git-worktree`.

So the registry lists every machine-local file under `.arc/system/`, and a source that projects `.arc/system/` leaves
them alone (§ 14). Moving the three entries from `.internal/` into `.local/` touches the marker every live worktree
holds, the ignore blocks `arc init` (with `--reconfigure`), `join`, and `update` write, and the Codex recovery hook
(`codex-recovery-marker.mjs`), and reopens the decision that the system folder keeps `.internal/`; it is
`config-storage-architecture`'s (§ 18).

**Scratch.** The projection creates `scratch/work-unit/<slug>/`, empty, under the identity root for the checkout's work
unit; `seam-locus` reconciles the folders at session start through `lookup` (D5; `spec-seam-locus.md` § 2.8). The folder
naming is the interface between them.

### 13. Windows

Each Windows mechanism D13 names is built, and each is covered by tests in the portability tier, which the
cross-platform pair runs on Windows and macOS on CI's weekly schedule and on a dispatch, and which this change's
verification dispatches (D13):

- **Git calls.** The projection makes two Git calls per command, started together with its stat walk — the store read,
  and one `git config --get-regexp` reading the `arc.*` keys and the object format (§ 15.3) — and the exclude writer and
  the guard make one each, the guard only when an ignore file may have changed (`spec-projection-substrate.md` § 11.1,
  § 11.2). A full materialization reads through the store's `list`, which the ref backend batches through
  `git cat-file --batch` (`spec-storage-ref-backend.md` § 11.6), so the projection reads no blob from Git itself
  (§ 15.5).

### 14. More than one source

The projection takes more than one source and supports read-only copies (D13). The engine reads records through one
source interface — `list`, `read`, `changes`, and `version` over the roots the source projects, with `history` and
`lookup` read from the writable store alone — which the store implements here; the installed package implements it when
ARC core resolves from it (`framework-core-from-package`, § 18). A source may be read-only: its files are then protected
(`spec-projection-write-back.md` § 8.2), their notice naming the source, and write-back refuses an edit to one as a
refused edit. The exclude writer's path list takes the `.arc/system/` paths a source projects
(`spec-projection-substrate.md` § 11.1), and a source that projects `.arc/system/` leaves alone what
`MACHINE_LOCAL_PATHS` lists there (§ 12.9). Only the store is built as a source here.

### 15. Refresh and performance

A command's cost grows with what changed, never with how much state exists. Reads take only a ref's tip (D10), and
`history` is read only where `spec-projection-substrate.md` § 3.5 names.

#### 15.2 Store-driven refresh

Each worktree's index carries the state version it last projected, and the next command asks the store's `changes` for
the records since, rewriting only those and any file still marked pending. Before a refresh or a fan-out writes into a
root, the guard runs, skipped while every ignore file its last pass recorded still matches and none is racy against the
index's reference (`spec-projection-substrate.md` § 3.3, § 11.2).

- **Reducing `changes`.** Refresh keeps each record's newest entry. An entry for a primary record — a work unit's meta
  or an Errand's record — re-lays every record its owner holds, since placement, slug, `Owner`, `Cohort`, and lifecycle
  state decide where each of them projects and whether it projects here: refresh lists the owner's records (`list` by
  `owner`, `ListInputSchema`, `lib/store/read.ts`) and moves each file whose path changed, by the removal swap and a
  write at the new path, an edit at the old path taken in first (`spec-projection-substrate.md` § 5.6). `changes`
  reports a rename or an archive only as the meta's entry, so this is what moves the rest. A cohort document is an owner
  primary too, its slug and placement covered by its record version (`spec-storage-ref-backend.md` § 3.4): its entry
  re-lays every path it projects to, its folder's copy and each `current/` copy, and a meta's entry adds or removes its
  `current/` copy of each cohort document its `Cohort` field names, which `list` by the work unit never returns. An
  archive, an abandon, or an owner leaving the in-flight view is a re-lay with nothing left to project here, which
  removes the files.
- **A conflict-record entry** refreshes the file of the record it names, or, for a removed conflict, whose entry carries
  no content, the file the index maps it to — by its marker set, its notice line, or, for a conflict the file does not
  show, the file's entry (`spec-projection-substrate.md` § 3.1). Neither reduction needs a contract change.
- **A state version that no longer resolves.** When `changes` refuses `state-unresolvable`
  (`spec-storage-ref-backend.md` § 2.3, § 4.6) — for example because Git collected its manifest, which only an anchor
  written into a record keeps reachable, because it names an ended item whose history this clone has not fetched, or,
  naming no history ref, because more than one end of an item lies past the window's lower bound and the window stops
  short of the current state version (its § 4.6, A38, A40) — the command rebuilds the worktree's projection from the
  current state rather than pulling any history ref the refusal names, so no refresh waits on the network. Every
  projected record is refreshed by the same rules as a changed one, every index entry the current state no longer holds
  is handled as a removal (`spec-projection-substrate.md` § 5.6), the replace guard and pending marks apply, and the
  index takes the current state version. Write-back has already run, and a file holding an edit is handed to it as any
  refresh hands one, so the rebuild loses none. It costs one full materialization, paid by a worktree idle past Git's
  expiry or one whose state version names history this clone lacks.
- **A listing that is not whole.** A full materialization and the rebuild write files only for the records a listing
  returns. A record it lists only as a diagnostic (`ListingDiagnosticSchema`, `lib/store/read.ts`) — malformed,
  oversized, unreadable, of a newer format, under a mismatched key, or of any other kind — projects no file and is
  reported, and a listing that reports `missed` or returns `unreadable` removes nothing. A file is removed only on
  positive evidence: a complete listing, with nothing missed and no diagnostic, that no longer holds its record.

#### 15.3 The no-change budget

The projection's no-change overhead stays within 10 ms on Linux and 60 ms on Windows.

- **Measured.** At this repository's size today — about 800 projected files and 17 MB in `completed/` — a warm stat walk
  of all of them took 3.4 ms. At 1,000 files the stat walk, the index read, and the Git call took 5 ms on Linux and 49
  ms on Windows, of which the Git call is 2 ms and 41 ms; at 100 files, 2.3 ms and 42 ms. The rest of the no-change path
  — the folder walk, the projection lock, the sweep of an empty aside folder, and the index and reference write each
  command makes to keep its tripwire measurements — adds 1.8 ms on Linux and 7.7 ms on Windows at 1,000 files in 125
  folders, the walk the largest share at 1.0 ms and 5.1 ms (§ Spike 2). The checked set sits well under 1,000 files.
- **Two Git calls, started together.** The projection makes two Git calls — the store's `version()` read, and one
  `git config --get-regexp` reading the `arc.*` keys, `user.name`, and `extensions.objectformat`: identity, the
  in-flight view setting, and the object format — started together with the stat walk. Run at once they cost what the
  store read costs alone, 41.7 ms against 41.6 ms on Windows, where one after the other took 64.8 ms (§ Spike 2). The
  projection's cost on Windows is one Git call's time, and on Linux it is noise beside the CLI's own start (about 280 ms
  for `--version`). The guard adds no call while no ignore file may have changed (`spec-projection-substrate.md`
  § 11.2).
- **No folder-time cache** is built; the command-start tripwire would show the need.

#### 15.4 Tripwires

Each tripwire is shown when the median of its recent measurements, kept in the worktree's index — a fan-out's in the
writer's own, recorded at its end under the lock the end takes again, and none where the writer holds no projection —
crosses its bound, never on one measurement, since host stalls reached 1.4–1.6 s on Windows (§ Tripwire timings):

| Tripwire               | Linux  | Windows | Set at                                      |
| ---------------------- | ------ | ------- | ------------------------------------------- |
| Command-start overhead | 20 ms  | 120 ms  | twice the budget                            |
| One fan-out            | 100 ms | 600 ms  | ten times the budget                        |
| Full materialization   | 1 s    | 5 s     | about four times today's archive on Windows |

The fan-out tripwire times the whole fan-out, a write's or a pull's, store reads included: today's heaviest, ten files
into 20 worktrees, reaches its bound on Windows once those reads count, while a one-file write sits far below it. A
primary entry's re-lay adds a `list` whose Windows budget alone equals the bound (§ 15.5), so a meta write's fan-out
there can cross it with few files; the median, not one write, decides, and the responses stay the same. Past
it, the first response is writing files in parallel on Windows, then the one-copy reserve (Alternatives & Rationale);
past the materialization bound, parallel writes on Windows. Materialization runs at spawn and at `arc sync`, not per
command, so its bound is the looser one.

#### 15.5 Fan-out and full materialization

A write's fan-out and a full materialization cost more on Windows, where each file write costs about 1.5 ms. One write
pushed into 20 worktrees took 3 ms for one file and 13 ms for ten on Linux, and 113 ms and 571 ms on Windows, the swap's
end check included; Windows pays about 5 ms per worktree before its files, mostly the lock and index writes. The spike
wrote each index once, so the refresh's second index write (`spec-projection-substrate.md` § 3.3), a temp-and-rename
like the first, adds part of that per-worktree cost again. The spike read the store once and did not time it. A fan-out
adds one `version()` call, three Git calls on the ref backend where the manifest is new, which after a write or a pull
it is (`spec-storage-ref-backend.md` § 4.2), and one `changes` call per distinct state version among the worktrees,
normally one, at least one Git call there, each Git call about 2 ms on Linux and 41 ms on Windows (§ Spike 2). It also
lists the worktrees, one Git call (`scanRegisteredWorktrees`), and reads each one's index, and, for each primary entry
among the changes, re-lays through one `list` by owner shared by every worktree — four Git calls on the ref backend, six
where it writes a new manifest, budgeted at 600 ms on Windows, where a `read` is budgeted at 300 ms
(`spec-storage-ref-backend.md` § 11.6, § 11.7) — so a meta write's fan-out costs more than a companion's. A command
whose writes land outside a projection lock fans out once per write, each timed by the tripwire (§ 15.4), and a sibling
whose lock stays held past 200 ms is skipped (`spec-projection-substrate.md` § 3.2).

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
and built by this change, except where a subsection names its builder; the specification is not edited.

#### 16.1 The storage contract (`spec-storage-contract.md`)

Two change D13's own wording:

- **The projection follows the work-unit marker** (§ 2.5, § 12.3). D13 projects into every worktree. Here a checkout
  gets the projection when it is the primary or its marker names a work unit or a transient claim, `arc start --here`'s
  included. Any other checkout — one of ARC's machinery checkouts, or a hand-made worktree nothing has claimed — gets
  none; after the flip an editor or agent there finds no state at the familiar paths and reads it through `arc view` and
  the status surfaces, or claims the checkout with `arc start --here`. A linked checkout whose marker is released, as an
  anchored one's is at teardown or abandon, loses its projection once the release step has persisted its edits.
- **A file a rebuild cannot read waits for the person** (§ 2.5). D13 writes back pending edits at the start of every
  command. A worktree whose index is missing, unreadable, or of another format version has no marker map or stale-buffer
  state to read an edit by, so its rebuild refreshes only a file that cannot hold one, at a path the current projection
  lays its record at, and withholds every other file write-back would read, written over by nothing, sent nowhere, and
  reported, the removal check and the persist and release steps refusing over it, until the person deletes it after
  copying out what they want and re-applies the edit as an ordinary one.

One adds to D13 without contradicting it:

- **Every removal and release refuses over a refused edit, a file that fails to parse, or a file not yet persisted**
  (§ 12.2, § 12.3). D13's teardown persists first and refuses while a file is unadopted or held by a conflict; a refused
  edit stays in its file (D13), and a file that fails to parse is skipped and reported (D13), its edit never written
  back, so removing the checkout would drop either, as it would a file still settling or left pending. The persist and
  release steps check every projected root, `completed/` included, and the removal check reports a refusal beforehand.

### 17. Residuals the design accepts

1. **A write through a held handle.** A write through a handle opened before a replacement and landing after the
   command's second check, or after a persist or release step took the aside copy over, goes to a deleted aside copy and
   is lost (`spec-projection-substrate.md` § 5.2). Reasoned, not measured: no tested editor or agent holds a file open
   across saves.
2. **An exact revert during a replacement.** A save to a file other than Markdown that exactly restores the version a
   replacement replaces, made while the index still records that version — during the replacement, after a stop or a
   rebuild's yield until the next command, or while the batch's aside copy waits for another process scope (item 9) —
   reads as old content and is refreshed (`spec-projection-substrate.md` § 3.7): content alone cannot tell it from what
   the stop left.
3. **A save after the persist step.** A save that lands after the persist step's last check and before the checkout's
   removal goes with the checkout, as with any deletion (§ 12.2).
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
7. **A notice that lags.** A protected file's notice can name an owning checkout, or `arc materialize`, that a release,
   promotion, or materialize in another worktree has since made wrong, until that file's record next changes, a primary
   re-lay rewrites it, or a reprojection (§ 10.4). The notice is advisory, and the persist refusal behind it names the
   current place.
8. **An index rebuild.** A file or aside copy the projection cannot read without its index stays as it was after a
   rebuild, withheld and reported, until the person deletes it, after copying out what they want, and re-applies their
   edit as an ordinary one; ARC writes nothing over it and sends nothing from it (§ 2.5). A buffer an editor kept open
   across the rebuild and saved afterwards over a refreshed file merges against its stamp's version without the content
   its last write-back took in (`spec-projection-substrate.md` § 3.6), so it can undo any change it makes back toward
   that version: putting back text a persisted edit added and the save removed, or removing again text a persisted edit
   removed and the save restored.
9. **Another process scope.** Where two process scopes share a checkout — WSL and Windows, a container's bind mount, or
   a Linux process that cannot read its PID namespace, whose scope is its own (`resolveProcessVisibilityScope`) — an
   aside copy one writes waits, reported, for a sweep from that scope or a removal's or release's takeover
   (`spec-projection-substrate.md` § 5.4), and a holder in the other scope that crashes keeps the projection lock until
   its lease lapses, up to 120 s (`ADVISORY_LEASE_DURATION_MS`), commands in the checkout running as under the skip
   switch meanwhile and the persist and release steps refusing with a retry (`spec-projection-substrate.md` § 3.2).
   Under the per-process fallback no other process shares the scope, so a copy waits for a removal's or release's
   takeover alone, which in the primary may never come, and a staged file, holding no edit, goes only with a linked
   checkout's removal or release, staying in the primary until it is deleted by hand. Nothing is lost but item 2's
   exposure, which lasts while the copy waits.
10. **A copy whose path has moved on.** A save that lands in an aside copy is taken in only while the copy's path has
    not moved on — still holds what its swap linked, or is absent, and no write-back of it has been sent since the swap
    (`spec-projection-substrate.md` § 5.2). The swap's own first check takes in a save timed into the window at once, so
    a copy is kept only where its path moves on before the copy's edit is taken in: a save opened before the move writes
    into the copy after that check, or that check's take-in is deferred or left pending (`spec-projection-write-back.md`
    § 7.8), and the path changes before the copy is read again, at its writer's second check or, where that writer
    stopped, the next command's sweep — by a later save there, a write-back's read-back, or another replacement; or a
    save lands at the path, or recreates it, before the first check; or another copy of the path is taken in or linked
    back first. While its path has moved on, it is kept, reported with its path, and never merged, since an older save
    from the same buffer and another editor's concurrent edit cannot be told apart (§ Spike 7); the person copies out
    what they want and deletes it, and removal and release refuse until then, unless the path becomes absent with no
    write-back sent since the swap, where the sweep links the copy back. It needs a save timed into the swap's window
    (§ Spike 1b) and a change to its path before the copy's edit is taken in.

### 18. Expected contracts

This design consumes behavior other changes build. The three it depended on — `seam-lifecycle`, `seam-locus`, and
`storage-ref-backend` — have shipped, as have `seam-decomposition`, `seam-status-roadmap`, and
`projected-markdown-checks`; the members whose work observes `storage-ref-hardening`'s fixes wait for it (§ 1.1). Each
other is an expected contract, available when its change lands, and what holds until then is stated with it.
`projection-substrate` and `projection-write-back` are on base when this member starts, by its `Depends On` chain; their
entries come first.

- **`projection-substrate`** (`spec-projection-substrate.md`, planned; this member depends on it through
  `projection-write-back`, so it is on base when this member starts): the engine's state and the files it writes, which
  refresh, fan-out, materialization, and the removal slots read and write —
    - the index, with its format version and the state version last projected beside the entries; and the primary, the
      checkout whose Git directory, read from its `.git` with no Git call (`readGitDirectories`), holds no `commondir`
      (its § 3.1);
    - the projection lock (its § 3.2): leased and not reentrant; a command holds one at a time, its own and then each
      sibling's in turn, taking a sibling's only while that worktree's Git directory exists and with a wait bounded at
      200 ms at the fan-out and the end, so two writers fanning out cannot deadlock; the persist and release steps wait
      its 10 s bound, and a lost lease refuses them with a retry;
    - the racy rule and its reference stamp, which a fan-out reads to skip a folder no projection was laid in, blob ids,
      and base-stamp recovery's `history` reads, one per record across a fan-out (its § 3.3–§ 3.5);
    - the settle rule (its § 4); the replace guard, whose take-in follows the rights of the worktree whose file holds
      the edit, so a sibling's fan-out writes back the owning checkout's edit under that checkout's rights; the swap and
      its batch, which writes the index before and after; the aside folder and its sweep; the takeover of an aside copy
      once it settles and while its path has not moved on; the rebuild of an absent file by the link alone; and the
      removal swap with its take-in answers (its § 3.3, § 5);
    - the exclude writer, which materialization calls once per clone, and the guard with its record of the ignore files
      it last passed, which materialization, refresh, and fan-out run before writing into a root (its § 11.1, § 11.2;
      § 2.5, § 15.2 here); and the `checkout` root it adds to `MACHINE_LOCAL_PATHS`, under which this member registers
      the `.arc/system/.internal/` entries (its § 12.9; § 12.9 here);
    - the one configuration read and the identity it resolves (its § 15.3; § 2.5 here).
- **`projection-write-back`** (`spec-projection-write-back.md`, planned; this member depends on it, so it is on base
  when this member starts):
    - the command's start, end, and report from the root hooks, with the start's refresh, the fan-out, and
      materialization as slots this member fills, and the materialize port the root hook binds into the engine's
      process-wide state (its § 2.2; § 2.1 here);
    - write-back's read path — parse-back, the kind's parser, the write check with a hand edit as its writer, the send
      against the base's record version, the store's merge, the read-back, and a clash found in the checkout — which the
      removal check and the persist and release steps run, and its handling of each store refusal, a refusal naming a
      missing history ref pulled and retried once at the persist and release steps (its § 6, § 7, § 8.4);
    - edit rights and protected files, a read-only source's files among them (its § 8; § 14 here), and adoption, its
      verdict read without minting (its § 9);
    - the checkout-rooted work-item path and each root's claim and effective `layout.active`, which this member's
      refresh, fan-out, persist and release steps, and materialization read fresh under the worktree's projection lock
      and reseed, so no file is laid from a cached claim (its § 10.1, § 10.2);
    - the changed mark write-back sets and `arc save` clears (§ 11.7 here), and the skip switch (§ 2.3 here).
- **`seam-lifecycle`** (`spec-seam-lifecycle.md`, shipped):
    - the removal check and function, with `RemovalCheck`, `ProjectionRemovalSlots`, and `PROJECTION_LOCK_REASON`
      exported with the function (§ 11.1, § 11.2) — the check slot's third answer, `unobservable`, and a missing
      folder's registration removed by its path among them — and the caller's `beforeRetire`, called after the persist
      step and before both the unlock and the remove (`RemoveWorktreeCheckoutOptions`; § 12.2 here);
    - lifecycle's callers moved onto them, and the `worktree-clean` guard deleted (§ 11.3);
    - anchored checkouts released through the `release` slot, never removed (§ 11.4).
- **`seam-locus`** (`spec-seam-locus.md`, shipped):
    - the Errand's exits on the removal function, and the stale-worktree sweep, branch-gone recovery, the residue sweep,
      and `arc errand leave`'s authorization on the removal check, each outcome reported, each taking the slots through
      a `projectionRemovalSlots` field on its options, as `arc locus release`'s handler context does (§ 12.1, § 5);
    - `arc locus release`, running the release step on an anchored checkout (§ 5);
    - the session-start reconcile of each work unit's scratch folder (§ 2.8), which moves a renamed work unit's folder
      only into an empty folder at its new slug, so the projection creates that folder empty and lays nothing in it
      (§ 12.9 here);
    - its callers moved off the user-surfaces resolver (§ 10.3).
- **The record kinds** (`spec-seam-record-kinds.md`, shipped): `WriteCheck` and its input (§ 3.1), which later members
  widened — `observations`, `before` answering `history`, a verb writer's optional `lifecycleAction`, and optional
  `proposedCreatedOwners` (`WriteCheckInput`, `lib/store/write-check.ts`; `spec-projection-write-back.md` § 7.2) — the
  writer derivation and `HAND_EDIT_VERBS` (§ 3.2), and the production registration set (§ 2.2), which composes ARC's
  link rules into every projected kind with a ref family but the Errand queue (`composeLinkChecks`,
  `lib/store/kinds/registrations.ts`; `spec-projection-write-back.md` § 7.6). The seam's members fill each kind's parser
  and write check as they reroute its family; until a kind has its own rules, its files persist checked for links alone,
  as D5 lets a contract `write` land.
- **The ref backend** (`spec-storage-ref-backend.md`, shipped):
    - `checkSerializationRules`, exported from `lib/store/` (§ 5.6), which the removal check's projection part calls;
    - `changes` refusing `state-unresolvable` for a state version that no longer resolves, and, naming no history ref,
      for a window short of the current state version past more than one end of an item (§ 2.3, § 4.6; A38, A40), on
      either of which a refresh rebuilds the worktree (§ 15.2 here);
    - a write to a completed item refusing `state-unresolvable` where this clone lacks the item's history ref, and
      `pull({ history })` fetching that ref by name (§ 7.3, § 4.5), which `arc save` and the persist and release steps
      run and retry once through the shared history-retry helper (`pullHistoryForRetry`,
      `lib/store/pull-consumption.ts`) where the refusal names a history ref, as `runStoreRename` does
      (`lib/work-unit/verbs/rename-store.ts`; `spec-projection-write-back.md` § 8.4); a write refusing
      `state-unresolvable` with no history ref — an unreadable captured object, or an anchor naming a state version this
      clone cannot resolve — takes no pull (`spec-projection-write-back.md` § 7.8);
    - `pull` and `push` replacing `sync` (§ 2.1), a pull's merges landing with no `write` (§ 6.4), which the fan-out
      wraps (§ 2.2 here), and `version()` costing one Git call, three where the manifest is new (§ 4.2);
    - `list` batching its blob reads, at four Git calls, six where it writes a new manifest, within a 600 ms budget on
      Windows (§ 11.6, § 11.7), which full materialization and a primary entry's re-lay read through (§ 15.4, § 15.5
      here);
    - the reference backend refusing `state-unresolvable`, implementing `pull`, refusing a primary's put without
      placement, and parsing a stale base's merged content (§ 14.2), which the gate here exercises (§ 1.5 here);
    - `createRefStore`, the store tests build over it, its process writer (`startRefWriter`,
      `__tests__/helpers/store/ref-process.ts`), and its burst suite, `store-ref-bursts.test.ts`, which runs only where
      `ARC_STORE_BURSTS` is `"1"` and is registered three times — in Vitest's `integration-bursts` project
      (`vitest.config.ts`), in the portability tier's `PORTABILITY_SUITES` (`lib/local-vitest-runner.ts`), and in
      `__tests__/reach/store-suites.json`'s environment entry — as this member's multi-process lane is gated and run
      (§ 1.5 here); the Windows separate-layout publishing burst stays skipped until `storage-ref-hardening` (A58);
    - a reader of a worktree's `.git` without a Git call, returning the worktree's Git directory and the common one
      (`readGitDirectories`, `lib/git/directories.ts`; § 4.2), which the index's location reads
      (`spec-projection-substrate.md` § 3.1) and which throws where `.git` is missing or its `gitdir:` marker is
      invalid.
- **`seam-decomposition`** (`spec-seam-decomposition.md`, shipped): the retiring verbs' removal decisions through
  `checkRetiringCheckout`, its own retirement among them (`lib/decompose/retirement-checkout.ts`;
  `spec-projection-substrate.md` § 12.5), and the source-conflict refusal's one remedy,
  `DECOMPOSE_SOURCE_CONFLICT_REMEDY` (`lib/decompose/source-conflicts.ts`), which names `arc save --resolve <token>`
  once `save` registers `--resolve`, held by its integration test (its § 18; `spec-projection-write-back.md` § 6.5).
- **`storage-ref-hardening`** (planned; the second member depends on it, § 1.1): the listing scope, the fault classes
  and remedies for missing or misplaced objects, and the sweep of the pull results' consumers, which write-back, the
  refresh, the fan-out, and the persist and release steps observe (§ 15.2, § 15.5 here, `spec-projection-write-back.md`
  § 7.8, § 8.4). It is expected to keep two fault classes, recoverable `state-unresolvable` and terminal
  `namespace-corrupt`, and to add no refusal code or result field, while it may move a site from one class to the other
  and change which refusals name a history ref. Since § 12.2, § 15.2, `spec-projection-write-back.md` § 7.8, and § 8.4
  key their handling on the code and on whether a refusal names a history ref, each member re-grounds those of them it
  carries against it as shipped, at its activation once `storage-ref-hardening` has shipped. A listing-diagnostic kind
  it adds is one more diagnostic § 15.2's listing rule reports, projecting no file. The history-retry helper
  `spec-projection-write-back.md` § 8.4 names is the one it leaves.
- **`storage-cutover`:** the flip and its first full materialization; a quiesce that locks every work-item worktree
  still unlocked (`spec-projection-substrate.md` § 12.7); projected roots that hold, from the flip, no tracked file and
  no file ARC installs — the shared roots' files untracked once their records are imported, and the installer writing
  nothing into a projected root (`lib/classification.ts`): not `completed/README.md`, which no record claims, so it
  stays unadopted and refuses every removal (§ 12.2, `spec-projection-write-back.md` § 9), nor the `backlog/` inbox
  template, which installs at the path the projection writes the project inbox to (`lib/layout/projection.ts`), so an
  install there writes over a projected file, while the ROADMAP template's install entries leave in the flip change; the
  live rehearsal, which confirms every hand-editable projected kind has its parser and every entry kind its entry shape;
  the flip's workflow rewrite, which names `arc save` where workflows name `arc user save`
  (`spec-projection-substrate.md` § 12.6); the deletion pass, which removes the user-surface rooting and its migration
  (§ 12.8); and the documentation pass, which rewrites `strategy-work-organization.md` § Per-Worktree Isolation and its
  acceptance test (§ 10.5) and moves `archive-work-unit`'s errata convention onto the store's history
  (`spec-projection-write-back.md` § 8.4).
- **`config-storage-architecture`:** the per-developer tier, to which the in-flight view setting moves (§ 10.4), and the
  move of the checkout marker, the pristine store, and the generated schemas from `.arc/system/.internal/` into
  `.arc/system/.local/` (§ 12.9), after `seam-locus`'s marker work lands.
- **`framework-core-from-package`:** the installed package as a second, read-only source (§ 14), adding its
  `.arc/system/` paths to the exclude writer's list.

## Alternatives & Rationale

- **A file watcher or a daemon — rejected.** Watching pays only in a long-lived process, and Git's `fsmonitor` is built
  for monorepos of hundreds of thousands of files (Chromium's 393,000: `git status` from 17.6 s to 0.83 s). A snapshot
  at the start of every command, jj's model, meets the budget at this repository's size (§ 15.3), and the command-start
  tripwire would show the need first (§ 15.4).
- **One copy per machine — kept in reserve, not built.** D13 makes it a fallback no caller sees, and nothing yet
  triggers it. Its tripwire is a fan-out's time, after parallel writes on Windows (§ 15.4).
- **Advancing a sibling at fan-out from the writer's own write, with no store read — rejected** for one `changes` call
  per distinct state version. State versions carry no order, so a sibling's version cannot be compared with the
  writer's, and one call serves every sibling at the same version (§ 2.2).
- **The persist step returning while holding the projection lock — rejected.** The lock is not reentrant, so the same
  command's fan-out and end would wait on it until timeout whenever the removal failed or had not yet run; releasing it
  costs only the window a save already had (§ 12.2, § 17).

## Cross-cutting Considerations

_These considerations cover the design the three members build together; § 1.1 names this member's part._

- **Data loss is the failure that matters.** Rigor concentrates on the write paths — the racy rule, the
  index-before-file order, the swap and its second check, the settle rule, the stale-buffer base, the base read back
  after each write, and the persist and release steps — each traced to a measured loss in the spikes
  (`notes-projection-substrate.md`, `notes-projection-write-back.md`, `notes-projection-worktrees.md`). A refresh is
  retryable, so a refused one marks its file pending rather than failing the command. The residuals the design accepts
  are named (§ 17).
- **Trust boundary.** A hand edit is untrusted input. It reaches the store only through its kind's parser, the write
  check with a hand edit as the writer, and the backend's own checks at the write, which parse a stale base's merged
  content and enforce the authority rules however the edit arrives (`spec-projection-write-back.md` § 7). Write-back
  sets its provenance itself, never from the file (`spec-projection-write-back.md` § 7.4), and the serialization rules
  refuse binary content, oversized records, `.env` files, and private keys (`spec-projection-write-back.md` § 7.5).
- **Ignore integrity.** The guard keeps every projected path ignored, `.arc/user/*/` in `.gitignore` itself, so no
  packaging tool ships personal state (`spec-projection-substrate.md` § 11.2).
- **Performance.** The no-change budget is 10 ms on Linux and 60 ms on Windows, with three tripwires measured in place
  (§ 15).
- **Testing.** Unit and integration tests over the reference backend with real repositories and worktrees, on Linux and
  in the portability lane, the rebuild and a pull's fan-out among them, and the refusals the reference backend cannot
  return, the history pull among them, through a test store wrapping it (§ 1.5); the isolation test (§ 10.5); the
  `after` view's conformance case (`spec-projection-write-back.md` § 7.3); the multi-process lane over the ref backend;
  and the live verification of the lock before the flip (`spec-projection-substrate.md` § 1.5). Every typed refusal here
  — the guard's, a refused edit, the removal check's `persist-would-refuse` and `unobservable`, the persist and release
  steps', a start that cannot take its lock — is tested both refusing and succeeding once its condition is repaired.
- **Rollout.** Dark until the flip but for the worktree lock, ARC's managed `.ignore` block, and this repository's
  `.gitignore` line (§ 1.4). The lock lands last in the first member, after both seam members
  (`spec-projection-substrate.md` § 12.5), and this repository's existing worktrees take it as they are respawned,
  `storage-cutover` locking any left (`spec-projection-substrate.md` § 12.7). `storage-cutover` runs the first full
  materialization at the flip.
- **User-facing impact.** From the flip, files under `.arc/` are a working copy of the store, saved at the next `arc`
  command or by `arc save`. Protected files say so where they are read (`spec-projection-write-back.md` § 8.2);
  conflicts show in the file, or as a notice line resolved by `arc save --resolve` (`spec-projection-write-back.md`
  § 6); and write-back's report reaches stderr ahead of a command's own output (`spec-projection-write-back.md` § 2.2).
  Before the flip, a spawned checkout the projection locked refuses a plain `git worktree remove` with a reason naming
  the exits (`spec-projection-substrate.md` § 12.1), session-init and `strategy-concurrent-work.md` name those exits
  (`spec-projection-substrate.md` § 12.6), and search tools in the ripgrep family find `.arc/user/*/`
  (`spec-projection-substrate.md` § 11.3).

## Success Criteria

1. **No save is lost across worktrees.** Over the reference backend, with real repositories and worktrees on disk, on
   Linux and in the portability lane, a hand edit in any worktree, and a conflict record its write files, reach every
   other worktree's copy at the writer's fan-out, a pull's merges included, saves timed into a refresh or a removal
   included, and over the ref backend twenty worktrees' concurrent saves lose none, but for the residuals § 17 names.
2. **Nothing an edit could lose leaves with its checkout.** A file withheld at an index rebuild stays in its file and
   is reported. For it, and for an edit to a protected or archived file another person owns, an unadopted file, a file
   that fails to parse, a refused edit, a file held by a conflict, a clash found in the checkout included, a file not
   yet settled, and an aside copy kept because its path moved on, the removal check answers `persist-would-refuse`, and
   the persist and release steps refuse, then succeed once it is resolved or, for the copy, deleted; a failed read
   answers `unobservable`.
3. **The layout holds across worktrees.** The isolation test passes (§ 10.5); `layout.active: flat` lays the
   checkout's work item flat; and a changed view setting, identity, checkout claim, or `layout.active` reprojects what
   it governs.
4. **The budget holds.** The no-change overhead stays within 10 ms on Linux and 60 ms on Windows, and at this
   repository's size the tripwires hold: the command start, a full materialization, and a one-file fan-out into 20
   worktrees each measure within their bounds on every platform, and a ten-file fan-out into 20 worktrees within its
   bound on Linux and macOS, its Windows median recorded against the bound § 15.4 expects it to reach.
5. **Dark before the flip.** Over the in-repo implementation the removal slots pass.
6. **A verb's write joins the selection's changes.** A verb run from the checkout marks the files its write changes
   there, so `arc selection --changed` lists them (§ 11.7).
7. **The projection stays out of the `.worktreeinclude` copy.** From the flip the copy skips the projected roots and
   `.arc/system/.local/`.
8. **The quality gates pass** at every gate the project declares.

## Open Questions

None blocks starting. The expected contracts in § 18 each state what holds until their change lands, and none leaves
this design open.

## Amendments

None.

---
