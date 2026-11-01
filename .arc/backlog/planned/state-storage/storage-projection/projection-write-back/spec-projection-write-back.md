# Spec (`detailed` · `RFC`): projection-write-back

- **Origin:** [internal] — the `storage-projection` cut (2026-10-30); stage 2 of the storage program.

- **Purpose:** Build the working copy's edit path: each hand edit sent at the next `arc` command, or by `arc save`, for
  the store to merge and check without losing a save, the conflicts the store files shown in the file and resolved
  there, edit rights, the `active/` layout, adoption, the settings, and the selection — the second of the three members
  that build the behavior the storage contract settled in D13 and D17.

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
- **Write-back** — sending a projected file's hand edit to the store at the start of a command (§ 2.2). **`arc save`** —
  the same on demand (§ 2.4). **Refresh** — rewriting projected files from the store. **Fan-out** — the refresh a writer
  pushes into every worktree on its machine once a write or a pull's merge lands. **Hand edit** — content a person or
  agent edited in a file, as against content a verb composed.
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
- **Notice line** — an HTML comment beside the base stamp, which the store never holds: a protected file's (§ 8.2) or a
  conflict's (§ 6.3).
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
  (`spec-projection-worktrees.md` § 2.5); and an edit made in this checkout since its last `arc save` (§ 11.7).
- **Full materialization** — writing every projected record into a worktree under the replace guard and adoption rules:
  at spawn, into a worktree that has none, and at `arc sync`; into a worktree with no usable index it refreshes only
  files that cannot hold an edit and withholds the rest (`spec-projection-worktrees.md` § 2.5).
- **Persist step, release step** — the removal function's projection slots, which write back every edit in a checkout
  under its projection lock before ARC removes it, or before ARC releases an anchored checkout's claim, refusing while
  anything could be lost; the removal check's slot answers beforehand whether they would refuse
  (`spec-projection-worktrees.md` § 12.2, § 12.3).
- **Work-unit marker, spawned checkout, anchored checkout** — as `spec-seam-lifecycle.md` defines them: the
  machine-local file naming the work item a checkout holds (`.arc/system/.internal/worktree-marker.json`,
  `lib/git/worktree-marker.ts`); a linked worktree ARC created for its work item, its marker carrying
  `spawnedByArc: true`; and a checkout ARC claimed in place without creating it, its marker carrying
  `spawnedByArc: false` from the flip.
- **Removal check, removal function** — `seam-lifecycle`'s one read-only check deciding whether ARC may remove a work
  item's checkout, and its one function removing it. `projection-worktrees` fills their three projection slots
  (`spec-projection-worktrees.md` § 12.2).
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
- **This member** — `projection-write-back`, the work unit this specification builds; a passage that means a sibling
  member names it.
- **Section numbers** — the design's own, kept with their gaps. Each member's specification holds its own § 1,
  § 16–§ 18, and Success Criteria; outside them a number names one section in every member's specification. The Goals
  and the Proposed Design map cover the whole design, so their citations name the design's sections wherever they are
  built. Elsewhere, a citation of a section this specification does not hold names the sibling specification that holds
  it: `spec-projection-substrate.md` builds § 2.1 but for its process-state module, § 3–§ 5, § 11.1–§ 11.3, § 11.5,
  § 12.1, § 12.4–§ 12.7, § 12.9's `arc-projection/**` entry and `checkout` root, § 13, and § 15.3's configuration read,
  and `spec-projection-worktrees.md` builds § 2.2's fan-out, § 2.4's `arc sync`, § 2.5, § 10.3's and § 10.4's
  reprojection, § 10.5, § 11.6, § 11.7's changed mark at a verb's fan-out, a refresh, and a rebuild, § 12.2, § 12.3,
  § 12.8, § 12.9's `.internal/` entries and scratch, § 14, and § 15.2–§ 15.5 but for the configuration read. § 18 states
  what this member consumes from each sibling, and this specification copies the sibling passages it builds against:
  here § 2.1's first two paragraphs, § 2.4's `arc sync`, § 2.5's identity paragraph, and § 13's read-only files.

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

- **build what its sibling members build:** the ignore strategy, the engine's per-worktree state, reading and replacing,
  and the worktree lock (`projection-substrate`), on which this member builds, and refresh, fan-out, materialization,
  the tripwires, the removal slots, and the release step (`projection-worktrees`): until it lands the start's refresh,
  the fan-out, and materialization stay inert slots here, and the removal slots keep their passing defaults (§ 18);
- **change any caller-visible behavior D13 or D17 settles,** except by the forward amendments § 16 states;
- **build the checkout removal function or its removal check, or move any caller onto them** (`seam-lifecycle`,
  `seam-locus`); **build any kind's parser or write check** (the record kinds and the seam's members); **build the
  layout classifier that maps a path to its record** (`seam-locus`), into which this member registers its addresses
  (§ 10.1); or **reconcile scratch folders at session start** (`seam-locus`);
- **build the ref backend, its stale-base merge, its import, or a store several processes share**
  (`storage-ref-backend`), including the hunk conflict record's `baseVersion`, `currentLines`, and `incomingLines` and
  the merge library's base-version input, which this design reads (§ 6.3, § 16.2); or **run the flip, its workflow
  rewrite, or the deletion pass** (`storage-cutover`);
- **show a conflict's sides in status** (`seam-status-roadmap`), which a conflict shown without markers points to
  (§ 6.3);
- **build the Markdown checks over projected state, choose which checks run over the selection, or change the fixer**
  (`projected-markdown-checks`, no edge either way); this member supplies the selection and connects its reader
  (§ 11.7), and `lint:md:fix` already fixes Git's Markdown list plus the selection;
- **build a file watcher, a daemon, or the one-copy-per-machine fallback** (Alternatives & Rationale);
- **resolve ARC core from the installed package** (`framework-core-from-package`); the projection keeps only the seam a
  second source plugs into (`spec-projection-worktrees.md` § 14);
- **move the checkout marker, the pristine store, or the generated schemas out of `.arc/system/.internal/`**
  (`config-storage-architecture`; `spec-projection-worktrees.md` § 12.9);
- **change what `.worktreeinclude` copies**, which already leaves out the projection's paths
  (`spec-projection-worktrees.md` § 11.6).

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
2. **The edit path** (`projection-write-back`, this specification) — write-back and conflicts with `arc save`, edit
   rights, the `active/` layout and the checkout-rooted path function, adoption, the settings, and the selection.
3. **Across worktrees** (`projection-worktrees`) — refresh, fan-out, materialization and the tripwires, the removal
   slots and the release step, the user surfaces in every worktree, and scratch.

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

**Size.** After the cut, `projection-write-back`'s specification ran 1,635 lines and its task list 1,158, and
`projection-substrate`'s task list 1,037, at or just past their marks, with no member above five phases. None has a
change-set forecast against the third mark, about 10,000 changed lines. The Owner kept the three members (2026-10-31):
each sits at its marks rather than well past them, its task list holds only the origin's tasks for its sections, and its
specification's growth past them is the terms and sibling contracts a member needs to stand alone, not added scope, so
one review of each member's change set can hold it.

**Order.** The first depends on nothing outstanding: `seam-lifecycle`, `seam-locus`, and `storage-ref-backend`, which
the whole design consumes, have shipped. The second depends on the first and on `storage-ref-hardening`, whose listing
scope, fault classes and remedies for missing or misplaced objects, and sweep of the pull results' consumers its
write-back and the refusals it reports observe (§ 18). The third depends on the second, and takes the hardening through
it. Every part of a member that consumes another change therefore finds it on base (§ 1.5, § 18,
`spec-projection-substrate.md` § 12.5).

`cohort-storage-projection.md` records every member's review chunks.

#### 1.2 What this change takes

- **`lib/store/projection/`** — the engine's process-wide state (§ 2.1), write-back, conflicts and their placement,
  adoption, and the `after` view, over `projection-substrate`'s engine.
- **`lib/store/create.ts`** — the store `createStore` builds, the one place every caller's store is composed, gains a
  hook recording that store's capability for each checkout root (§ 10.2).
- **`cli.ts`** — the root `preAction` and `postAction` hooks call the engine's start and end (§ 2.2), and every command
  accepts the skip switch (§ 2.3).
- **New verbs and options** — `arc save`, with `--resolve <conflict>` (§ 2.4, § 6.5), `arc selection`, with `--changed`
  (§ 11.7), and `arc editor <vscode|zed>` (§ 11.4); `arc init` and `arc join` print the one user-level Zed setting
  (§ 11.4).
- **The path functions and their callers** — `workItemArtifactPath`, `lifecycleArtifactPath`, `workUnitMetaPath`, and
  `lifecycleRecordPath` taking the checkout root, every caller converted, and the marker writes that bypass
  `lib/git/worktree-marker.ts` moved onto it (§ 10.2).
- **Connections to shipped work** — the body of `readProjectedSelection` (`lib/checks/projected-selection.ts`) (§ 11.7),
  and decomposition's source-conflict remedy (`lib/decompose/source-conflicts.ts`) naming `arc save --resolve` (§ 6.5).
- **The layout schema** (`lib/layout/schema.ts`, which `resolveArcPath` in `lib/layout/projection.ts` reads) —
  `active/current/` and `active/in-flight/<slug>/`, and the addresses of the kinds the projection names files for
  (§ 10.1).
- **Configuration** — the `active/` revert key in `arc-config.yml` (§ 10.3) and the in-flight view setting's `arc.*`
  keys (§ 10.4).
- **Tests** — unit and integration tests over the reference backend, and the conformance case for the `after` view
  (§ 7.3).

#### 1.3 Review chunks and their order

This member lands as review chunks on its own branch, each chunk with its tests, in this order;
`cohort-storage-projection.md` records every member's:

1. **Write-back and conflicts** — the command's start, its end, and the report (§ 2.2), the start's refresh a slot
   the third member fills; parse and send, the store's merge read back, a clash found in the checkout, the store's
   refusals, the check, the `after` view, provenance, conflicts placed and parsed back, and the roots write-back
   scans (§ 15.1); with `arc save` and its `--resolve` and decomposition's remedy naming it (§ 2.4, § 6, § 7).
2. **Edit rights, the `active/` layout, adoption, and settings** (§ 8, § 9, § 10), with the checkout-rooted path
   function, its callers, and the capability recorded for each root (§ 10.2), `arc editor` and the skip switch
   (§ 2.3, § 11.4), and the selection and its reader (§ 11.7); the isolation test and reprojection are the third
   member's.

#### 1.4 Before the flip

The projection keys on the contract's one capability (D1, D15). Over the in-repo implementation, which answers false,
the tracked files are the store and the projection does nothing: the root hooks return at once; `arc save` refuses
`unsupported` naming `arc user save`, which serves until the flip, `--resolve` included; `arc editor` refuses
`unsupported`; `arc selection` prints an empty list (§ 11.7); and `arc init` and `arc join` print no Zed setting.

The three pieces that run live before the flip — the worktree lock, ARC's managed `.ignore` block, and this repository's
`.gitignore` no longer ignoring `.ignore` — are `projection-substrate`'s.

#### 1.5 Verification

- **The gate here:** unit and integration tests over the reference backend — test-only, in-memory, capability true (D7)
  — with real temporary repositories and worktrees on disk, on Linux and in the portability pair (§ 13). As
  `storage-ref-backend` builds it, the reference backend refuses `state-unresolvable` for a state version it holds no
  snapshot of, implements `pull`, and runs the kind's parser over a stale base's merged content
  (`spec-storage-ref-backend.md` § 14.2), so the gate exercises the refusals the reference backend returns —
  `record-malformed`, `version-conflict`, and `lock-held` (§ 7.8). It holds no history refs — its `state-unresolvable`
  refusal names none (`stateUnavailable`, `__tests__/helpers/store/read.ts`), and its `pull` ignores what it is asked to
  fetch (`ReferenceBackend`, `reference-backend.ts`) — and serves every registered kind (`reference-fixture.ts`), so the
  refusals it cannot return — `state-unresolvable` naming a missing history ref, on a write or on `history`, and
  `unsupported` `unhomed-kind` — and the history pull that answers the first (§ 8.4) are exercised through a test store
  that wraps it and returns them.
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
at each call site: whether the projection is off for the command (§ 2.3, `spec-projection-worktrees.md` § 2.5), whether
the process holds a projection lock (`spec-projection-substrate.md` § 3.2), the fan-out's rounds
(`spec-projection-worktrees.md` § 2.2), the `history` memo (`spec-projection-substrate.md` § 3.5), each checkout root's
claim and effective `layout.active` (§ 10.1), and the ports the root hook binds — the take-in bound to write-back, the
edit-rights function, adoption's mint, and materialization. A process whose root hook never ran, a script or a test that
binds nothing, fans out nothing, and each sibling refreshes at its next command.

#### 2.2 One command, in order

##### The start, the end, and the report

- **The start.** A command takes its worktree's projection lock, sweeps the aside folder (`spec-projection-substrate.md`
  § 5.4), writes back pending edits — each settled, parsed, and sent for the store to merge and check (§ 7,
  `spec-projection-substrate.md` § 4) — and refreshes its pending files and the records the store changed since the
  index's state version (`spec-projection-worktrees.md` § 15.2); then it releases the lock and runs. It reads
  `version()` only once it holds its own lock, so no fan-out moves its index past that read; taking the lock makes no
  Git call, so the configuration read, `version()`, and the stat walk all start once it holds the lock, together, the
  personal root's walk waiting for the identity the read returns (`spec-projection-worktrees.md` § 2.5,
  `spec-projection-substrate.md` § 15.3); the sweep runs once the identity is known, and write-back re-reads the stats
  of each path the sweep linked back or replaced (`spec-projection-substrate.md` § 5.4). The start runs from the root
  `preAction` hook `cli.ts` registers on the program for every command; `arc save`'s start is its own write-back
  (§ 2.4).
- **A start that cannot take its lock.** Where the lock stays held until `AdvisoryLockTimeoutError`
  (`lib/advisory-lock.ts`), the command runs as under the skip switch (§ 2.3), its edits left pending for the next, and
  reports the holder the lock records; a start whose lease is lost (`spec-projection-substrate.md` § 3.2) does the same
  from its next step, reporting the loss. Nothing is lost: write-back runs at the next command, and fan-out carries no
  correctness. `arc save` and `arc selection` refuse instead, naming the holder or the lost lease and a retry (§ 2.4,
  § 11.7), as the persist and release steps refuse when they cannot take or keep a target's lock
  (`spec-projection-worktrees.md` § 12.2, § 12.3).
- **The end.** At the command's end the writer takes each worktree's lock again for the second check of its aside copies
  (`spec-projection-substrate.md` § 5.2), and clears the in-progress record naming each aside copy it deletes, once the
  file holds what the batch linked (`spec-projection-substrate.md` § 3.7), and each aside copy's record
  (`spec-projection-substrate.md` § 5.2); each swap batch's second index write has already cleared the pending marks it
  settled (`spec-projection-substrate.md` § 3.3). The end runs from the root `postAction` hook, which Commander skips
  when an action fails, so the second check is best-effort: the next command's sweep takes over the copies it leaves
  (`spec-projection-substrate.md` § 5.4).
- **The report.** Write-back's report — each file it refused, skipped, deferred, withheld at an index rebuild
  (`spec-projection-worktrees.md` § 2.5), or kept as a conflict, and each aside copy it kept because the copy's path
  moved on (`spec-projection-substrate.md` § 5.2), with its typed reason and each rule's remedy, argv included, each
  conflict it resolved, and each open conflict a file held for a resolution in progress or a malformed set does not show
  (§ 6.4) — goes to stderr before the command's own output, where the root hooks in `cli.ts` already report, so a JSON
  result on stdout stays whole; `arc status` reports what stays refused or pending, every withheld file, and every aside
  copy kept for the person. A hand tick the task-list kind refuses (`task-list.close`) therefore shows ahead of anything
  `arc check increment` reports, the request the task loop runs right after an edit.

#### 2.3 The skip switch

One global flag runs a command with no write-back and no refresh, after jj's `--ignore-working-copy`, so a projection
defect cannot lock a person out of `arc` and the recovery path stays reachable. Its edits stay pending for the next
command, and nothing keeps it on as a mode. It skips the command's start, its end, `arc sync`'s rebuild
(`spec-projection-worktrees.md` § 2.4), and the fan-out of the command's writes, the persist and release steps' writes
among them, since fan-out carries no correctness and each worktree's next command refreshes (§ 2.2). The removal check
and the persist and release steps otherwise run under it exactly as without it, since each settles a checkout's edits
before ARC removes the checkout or releases its claim: a defect in one refuses the removal or release, the checkout and
its claim staying as they were with nothing lost, until the defect is repaired, and a removal may instead be forced past
it (§ 17). It is an escape hatch, not what keeps ARC's own machinery checkouts out: those hold no projection
(`spec-projection-worktrees.md` § 2.5). The flag's name is `--skip-projection`.

#### 2.4 `arc save` and `arc sync`

- **`arc save`** writes back the checkout's pending edits across every projected root, `completed/` included, and
  returns the state version, a named point in history carrying each write's provenance (D13). Its start is its own
  write-back: the root hook runs it under `save` (§ 7.4), every projected root included, attaching each `--resolve`
  conflict to its subject file's write, where every other command's start writes back under `write-back`. At it, unlike
  any other command's start, a refusal naming a missing history ref is pulled and retried once (§ 8.4), a lock held past
  its bound or a lease lost refuses with a retry (§ 2.2, `spec-projection-substrate.md` § 3.2), and `arc save` refuses
  `--skip-projection`, since its start is its whole work. Each edited file persists as its own write, so one refused
  edit blocks no other: D13's "at once" means in one command, not one batch, which D3 makes all-or-none. A refusal
  another file's pending edit would cure clears at the next command, once that edit has landed. Where a write to a
  completed item, or the `history` read its merge in the checkout makes (`spec-projection-substrate.md` § 3.5), refuses
  `state-unresolvable` naming its history ref, `arc save` pulls the ref and retries once (§ 8.4). `--resolve <conflict>`
  resolves a conflict shown without markers, and refuses while its subject file is held for a resolution in progress or
  a malformed set (§ 6.5), and `arc save` reports every resolution it sends. Under its projection lock it then clears
  the changed mark of every file that holds no edit the store lacks (§ 11.7). `arc save` replaces `arc user save` from
  the flip; before it, `arc save` refuses `unsupported` naming `arc user save` (§ 1.4).
- **`arc sync`**, which `projection-worktrees` builds (`spec-projection-worktrees.md` § 2.4), rebuilds deleted projected
  files (D13), as a full materialization (`spec-projection-worktrees.md` § 2.5) run before its network steps, so an
  offline sync still rebuilds; `--dry-run` skips it, and with no identity its existing refusal (`resolveUserIdentity`,
  `handlers/shared.ts`), which names `arc.identity`, comes first. With a usable index it writes each absent file by the
  link alone (`spec-projection-substrate.md` § 5.5), replaces by the swap each deleted one — an emptied Markdown file
  (`spec-projection-substrate.md` § 4) or a symbolic link at a projected path (§ 9) — and leaves every other present
  file to the refresh. A rebuild that fails is reported and the sync goes on to its network steps, its files left to the
  next sync, and `--skip-projection` skips it (§ 2.3).

#### 2.5 Which checkouts hold a projection

A command whose configuration yields no identity — no `arc.identity` and no `user.name` that slugifies to one, or an
invalid `arc.identity` — runs as under the skip switch (§ 2.3), reporting the remedy that sets `arc.identity`, since the
personal root and edit rights key on the identity. `arc save` and `arc selection`, which refuse the switch, refuse
naming that remedy (§ 2.4, § 11.7), and so do the persist and release steps on a checkout `projection-worktrees` gives a
projection or that still holds an index, whose removal check answers `would-refuse` with it
(`spec-projection-worktrees.md` § 12.2, § 12.3). The identity comes from the one rule `lib/git/identity.ts` owns,
applied to the values the start's one configuration read returns (`spec-projection-substrate.md` § 15.3).

### 6. Conflicts in the file

A conflict reaches a projected file one of two ways. **A conflict the store files** — at a write's stale-base merge
(§ 7.1) or a pull's merge (`spec-storage-ref-backend.md` § 6.4) — is a conflict record every checkout reads, and
write-back and refresh draw it into the file from the record (§ 6.3), except into a file the replace guard holds whole
for a resolution in progress or a malformed set, whose index entry records it until the file is next replaced with the
record (§ 6.4). **A clash found in the checkout** — a merge with no stored base (§ 7.7) — is written into its file as
markers and never stored.

Either way the shape is D13's: markers around the clash for a merge surface, the store's side first, as Git draws the
current side first, labelled with each side's machine or session and time — for a clash found in the checkout, the
store's side by its record version (§ 7.7) — and parsed back at persist; and, for a whole-record conflict, the store's
version with a notice line beside its base stamp, naming the conflict record, the other side, and the remedy (D4, D6).
Each marker set's start label also names its conflict record, or `checkout` for a clash found in the checkout, so each
set names its own conflict however many share a merge's labels (§ 6.1). Only a pull's merge files a whole-record
conflict, since its record names a version a hand edit lacks (`ConflictRecordValueSchema`, `lib/store/conflict.ts`), and
the store refuses a stale write to a single-writer record rather than merging it (§ 7.7). This section fixes what D13
leaves to the engine.

#### 6.1 Marker length

Markers are standard Git markers at length seven, after jj. When any line in the file, inside a side or outside the
sets, is marker-like — it starts with seven or more of one marker character, as a Markdown setext underline of `=======`
does — the length grows to the longest such run plus four, one length for every set in the file, and the index records
it: no content line then holds a run of the recorded length, so a marker left outside its set reads as one. Git's own
merges vary the length the same way through the `conflict-marker-size` attribute, which is the idiom here, not a rule
that reaches gitignored files.

Parsing matches markers of exactly the recorded length, which is stricter than jj's ignore-shorter rule
(`parse_conflict`, jj's `lib/src/conflicts.rs`) once a person adds a longer run while resolving (§ Spike 4), and it
reads each set's conflict from its start label, checked against the conflicts the index holds open for the file;
untouched markers keep the conflict open. D13's rule for malformed markers stands over jj's: that entry's persist
refuses with a typed remedy, where jj degrades the hunk to text. Malformed means an incomplete set at the recorded
length — a start, separator, or end marker with the rest of its set missing — a resolve-by-hand line left behind
(§ 6.2), or a start label naming no conflict the index holds open.

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
  one. The base content is read through `history` (`spec-projection-substrate.md` § 3.5) at the record's `baseVersion` —
  a write's expected version, or a pull's merge base — and a null `baseVersion`, where the base held no such record,
  places from empty content. Where that read refuses `state-unresolvable`, placement pulls nothing and shows the
  conflict as a notice line. The incoming side's count (`incomingLines`) draws its lines between the markers exactly,
  since a side of no lines and a side of one blank line both store as empty content (`spec-storage-ref-backend.md`
  § 3.7).
- **A placement that fails the check** shows that conflict as a notice line beside the base stamp, in the idiom of D13's
  whole-record notice and stripped at persist as every notice line is (`spec-projection-substrate.md` § 3.4), naming the
  conflict record by its token, `<family>/<owner type>/<owner name>/<key>`, which status prints and parses too
  (`formatConflictToken` and `parseConflictToken`, `lib/status/conflict-token.ts`); the incoming side's machine or
  session and time; where that side reads — where its markers show, and `arc status --conflicts <conflict>`, which shows
  both sides (§ 18); and the remedy, `arc save --resolve <conflict>` (§ 6.5), `<conflict>` being that token; never
  markers placed by guess. The line only shows the conflict: refresh writes it while the conflict is open, and deleting
  it changes nothing. An entry merge's prose hunk with lines on both sides of an entry carries a base range spanning
  that entry, and no single span of the merged content holds its sides (`mapConflicts`,
  `lib/store/concurrency/entry-merge.ts`), so the check rejects it and it shows as a notice line.
- **A file with no stamp,** which a notice line would corrupt, shows such a conflict nowhere in the file; status and the
  refusing verbs report it (D13), and the index records it (`spec-projection-substrate.md` § 3.1).

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
- **Sides edited, markers standing.** A marker set whose sides differ from those its conflict record holds is a
  resolution in progress, which write-back refuses, naming the set to finish or restore: its whole file, for every kind,
  stays pending and unsent, and is reported, until the markers are removed or the sides restored (amendment, § 16). It
  takes a refused edit's routes (`spec-projection-substrate.md` § 5.2): the replace guard leaves it unreplaced, so the
  store's other changes reach it once the resolution is sent, and an aside copy holding one goes back to its path where
  `spec-projection-substrate.md` § 5.2 sends a refused copy back, with its bytes as they are, never redrawn, and is
  otherwise kept as `spec-projection-substrate.md` § 5.2 keeps it.
- **Malformed markers** refuse the persist of the entry holding them, or of the whole file for prose, with a typed
  remedy (§ 6.1). The write carries each refused entry as its base holds it — none, where its base has no such entry —
  so the landing leaves the store's version of that entry as it was. A take-in of the file that refuses one is a refused
  edit, whether the rest of the file lands or nothing else is left to send, and the replace guard holds the file whole
  while the set stands. An aside copy holding one is refused whole, sending nothing, and takes a refused copy's routes
  (`spec-projection-substrate.md` § 5.2) as one holding a resolution in progress does: back to its path where that path
  has not moved on, the file's own take-in then landing the rest, and otherwise kept in the aside folder, reported with
  its path. Where the rest of the file lands, the file keeps the person's content, pending and refused, neither read
  back nor drawn into until the set is repaired (`spec-projection-substrate.md` § 5.2), since replacing it would drop
  the refused entry's text, its only copy (amendment, § 16). It keeps its stamp and the base it was rendered from, so
  its next write-back merges from the content that landing took in and only the refused entry reads as an edit
  (`spec-projection-substrate.md` § 3.6).
- **Conflicts a held file does not show.** A file the replace guard holds whole, for a resolution in progress or a
  malformed set, is not drawn into, so its index entry records its record's open conflicts that it does not show — those
  of the record read back after a landing, and those of the version each refresh that leaves it unreplaced reads
  (`spec-projection-substrate.md` § 3.1) — until the file is next replaced with the record, which draws them. Write-back
  reports them beside the file's refusal, with the repair that releases the file as their remedy, and status shows them.
- **Held at removal.** A file with a stored conflict open — shown by markers or a notice line, or recorded in its index
  entry alone — or holding a clash found in the checkout (§ 7.7) is held by a conflict at teardown (D13), and resolving
  it is the remedy (`spec-projection-worktrees.md` § 12.2).
- **A clash found in the checkout** keeps its file pending while its markers stand (§ 7.7).

Write-back reports every resolution it sends (§ 2.2).

#### 6.5 `arc save --resolve <conflict>`

A conflict shown without markers — a whole-record conflict's notice line (D13), a hunk conflict's notice line (§ 6.3),
or one a file with no stamp cannot show — resolves by `arc save --resolve <conflict>`.

- **What it sends.** It attaches the conflict to its subject file's write in the command's own write-back, under `save`,
  sent even when the file is unedited: edited by hand first, the text is the resolution; unedited, it keeps the store's
  side. A withheld subject file (`spec-projection-worktrees.md` § 2.5) is never sent: the option refuses, naming the
  withheld file's remedy — copy out what is wanted, then delete the file, which releases it. Nor is a subject file the
  replace guard holds whole for a resolution in progress or a malformed set (§ 6.4): the option refuses, naming the
  repair that releases it — finishing the resolution or repairing the set — after which the conflict shows as § 6.3
  states.
- **What it resolves toward.** The store's side, or a content-only edit the kind's write check admits. Another side — a
  removal, a field only a verb sets, a changed placement — takes D4's route of redoing the change through its verb.
- **Keeping the store's side** sends content identical to the stored record, by markers (§ 6.4) or by the option. The
  backend never treats a put naming an open conflict in `resolves` as a no-op: its commit removes the conflict record,
  and the subject's record version and `history` stay as they were (`spec-storage-ref-backend.md` § 5.2), held by a
  merge item in its shared suite (its § 14.2).
- **Decomposition's remedy names it.** From the flip `arc decompose` refuses an origin whose meta or a source record
  holds an open conflict, naming each by its token and subject, with one remedy for every source and decision site that
  refuses (`DECOMPOSE_SOURCE_CONFLICT_REMEDY`, `lib/decompose/source-conflicts.ts`), which until this member names
  only the markers' resolution; an open conflict on the terminal lineage keeps its own remedy
  (`readDecomposeLandedRetirement`, `lib/decompose/landed.ts`). This member registers `save` with `--resolve`, so it
  extends that remedy as `spec-seam-decomposition.md` § 18 settles it: resolve the markers in the file that shows them,
  which write-back persists, or otherwise run `arc save --resolve <token>` from a checkout projecting the subject, then
  the mode again. Its integration test requires the remedy to name `arc save --resolve <token>` exactly when the command
  inventory registers a top-level `save` with `--resolve` (`decompose-conflict-remedy.test.ts`), so the remedy changes
  with the command's registration.

`arc save` reports every resolution it sends (§ 2.4).

#### 6.6 A conflicted file keeps refreshing

D13 keeps a conflicted file refreshing. The refresh is a three-way line merge (`mergeLineText`,
`lib/store/concurrency/line-merge.ts`) whatever the kind's mechanism, since an entry conflict's markers hold two
versions of one entry under one `_Id:_`, which entry merge refuses (`entryFrame`,
`lib/store/concurrency/entry-frame.ts`): the stored version the file was rendered from, read through `history`
(`spec-projection-substrate.md` § 3.5), as the base, the store's newer version as the current side, and the file,
markers included, as the incoming side. Where that read refuses `state-unresolvable`, the refresh pulls nothing, and the
file keeps its version, pending and reported.

- **A marker set whose conflicts have all closed** — resolved from another checkout — leaves the incoming side first
  when the file is unchanged since the projection wrote it, so the file takes the resolution rather than waiting on it.
- **A notice line whose conflict has closed** leaves at the same refresh, since refresh writes notice lines only for the
  conflicts still open.
- **Where the store's change overlaps a marker set still open,** the file keeps its version, pending and reported, until
  the person resolves it, and each later command tries again (amendment, § 16).
- **A file holding a resolution in progress or a malformed set** never reaches the merge: the replace guard holds it
  whole, a refused edit, until the resolution is sent or the set repaired (§ 6.4).

Over random edits the merge placed every marker block it did not report as an overlap, but for a line merge's own
residual of under 1% (§ Spike 6).

### 7. Write-back: parse, send, check, persist

#### 7.1 Parse, send, and the store's merge

- **Parse.** Write-back reads a hand-edited file through its kind's parser, from the production registration set
  (`lib/store/kinds/registrations.ts`), and skips and reports a file that fails to parse (D13).
- **Send against the base.** It sends each edited file's content with the record version its base names as the expected
  version (`spec-projection-substrate.md` § 3.4), under `write-back` provenance (§ 7.4). A primary record's write
  carries its current placement unchanged, as `MutationSchema` requires (`lib/store/write.ts`) — the read form less its
  `sequence`, which `WritePlacementSchema` rejects — and never a reference, a changed placement, a former slug, or a
  link (§ 7.3).
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
  and, where it refused nothing the file held, replaces the file with it by the swap (`spec-projection-substrate.md`
  § 5.2), its conflicts drawn in (§ 6.3), the batch writing the index before and after as a refresh's does
  (`spec-projection-substrate.md` § 3.3) and recording its aside copy as write-back's own
  (`spec-projection-substrate.md` § 5.2), and the index taking the record read back as the file's base
  (`spec-projection-substrate.md` § 3.4). Where it refused a malformed entry while the rest landed, the file keeps its
  content, its stamp, and its base, and its index entry records the record's open conflicts, reported beside the refusal
  (§ 6.4). Either way the write is a persisted write-back, and the index records what it read, the stamp and the content
  taken in (`spec-projection-substrate.md` § 3.6).
- **Entries typed by hand.** Before sending, and before any merge in the checkout, once parse-back's rule for a
  duplicated `_Id:_` (below) has run, write-back gives an entry with no `_Id:_` the ID its base carries for the same
  entry, through the one entry-ID matcher `projection-substrate` builds (`spec-projection-substrate.md` § 3.6), from the
  base entries whose `_Id:_` no entry in the file carries: the one whose text, apart from its `_Id:_` line, equals the
  entry's, or else the one whose heading — in a field-header list, field header — the entry shares, each only where
  exactly one base entry matches. A base entry's ID goes to one entry at most — the one matching it by text, else the
  one matching it by heading — and where two entries match it the same way, neither takes it. An entry its base lacks is
  left for the backend to stamp. The ref backend's seed — the put's reference, expected version, and content
  (`spec-storage-ref-backend.md` § 5.1) — gives a retry of the same content after a stop the IDs its first landing took,
  so over it the entry lands once, which its suite holds (`spec-storage-ref-backend.md` § 14.3); a retry after a further
  edit does not (residual, § 17), and the reference backend draws at random (§ 7.3), so over it any retry lands the
  entry twice. A merge in the checkout needs every side's IDs first, since `entryFrame` throws on a missing one, so it
  stamps its own copy (`stampEntryIds`, `lib/store/concurrency/stamp.ts`), drawing from a SHA-256 stream seeded by the
  record's reference, the base content, and the file's content, so § 7.7's result, sent again after a stop, carries the
  same IDs: § 7.2's merge, which only computes the check's `next`, sends the edit as it is, and § 7.7's, whose result is
  what goes to the store, sends that result carrying the checkout's IDs, which the backend keeps. An entry the stamp
  cannot give an ID — a field-header entry with no `_Remove when:_` line, without which `stampEntryIds` throws — is a
  refused edit, `record-malformed` naming the entry, as the ref backend refuses it (its § 5.1). The content a persisted
  write-back took in, which a stale buffer's next save merges from, carries the IDs the landed record gave its entries
  (`spec-projection-substrate.md` § 3.6). Without them, an editor that never reloaded re-saves the entry the backend
  stamped, the stamp gives it a second ID, and a merge over another writer's edit to that entry keeps both copies and
  reports no conflict (§ Spike 5). A duplicated `_Id:_` left by an editor's "accept both" gives the second entry a fresh
  ID (D13's parse-back), and the backend refuses any duplicate that remains as `record-malformed` naming it (its § 5.1,
  § 5.2).

Three cases have no stored base for the store to merge from, and § 7.7 merges them in the checkout. § 7.8 states what
write-back does with each refusal the store returns.

#### 7.2 The write check

Write-back persists the merged result only if the kind's write check, registered beside its parser, admits it
(`spec-seam-record-kinds.md` § 3.1). Write-back and `arc save` call the check with:

- **writer** — a hand edit, `{ kind: "hand-edit" }`, which carries no lifecycle action, since only a verb's writer does
  (`WriteCheckInput`, `lib/store/write-check.ts`);
- **the record's reference**;
- **`prior`** — the store's current version, carrying its content and parsed fields, or its content alone when it fails
  to parse, so the shape rules check the edit whole and a hand edit can repair a record a merge or an import stored
  broken; absent for an adopted file, which the store does not yet hold;
- **`next`** — the merged content with its parsed fields — the store's merge, run in the checkout with the same library
  over the base's content, read through `history` where the store has moved past it (`spec-projection-substrate.md`
  § 3.5) — never the file alone: a verb that changed `State` since the file's base merges in, so an edit that left
  `State` alone never reads as changing it. Write-back sends no removal, since a deleted file is rebuilt (D13), so
  `next` is always present;
- **two views,** `before` and `after` (§ 7.3), `before` also answering `history`, as the input requires;
- **`observations`** — none, `observations: []`: a hand edit is one record's write and reads no other record a verb
  would observe, and it proposes no created owner, so `proposedCreatedOwners` stays absent.

Write-back reports every rule the check returns. A change to a field only a verb may set is refused by the check, not by
the parser, which stays content-only (`cohort-storage-seam.md` § Shared contracts, item 11; `spec-seam-record-kinds.md`
§ 3.3).

#### 7.3 The `after` view

This member builds the `after` view, in `lib/store/projection/`; the record kinds ship none
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
takeover of aside copies (`spec-projection-worktrees.md` § 12.2, § 12.3), even inside `arc teardown` — so no hand edit
lands under a verb that reads as itself; the removal check's projection part writes nothing and carries none. Write-back
sets the provenance itself, never from the file, so a hand edit cannot name another verb.

#### 7.5 Serialization refusals

D10's serialization rules, as the ref backend applies them — text only, a 1 MiB cap on projected kinds, `.env` and
private-key files refused, among others — are each a typed `record-malformed` refusal at persist, never a skip. The ref
backend enforces them in its `write` and `batch` through one pure function, `checkSerializationRules` (§ 18); write-back
and `arc save` report its refusal as any other, and the removal check's projection part calls the same function without
writing (`spec-projection-worktrees.md` § 12.2), keeping no copy of the rules.

#### 7.6 Refused edits and empty slots

A refused edit — whether the write check or the backend's own check at the write refuses it — stays in the file and is
reported, never blocking the command (D13). The seam's members fill the parser and write-check slots; this member
consumes them. Every projected kind with a ref family but the Errand queue carries ARC's link rules in its check
whatever else it registers (`RECORD_LINK_KINDS` and `composeLinkChecks`, `lib/store/kinds/registrations.ts`, over
`checkRecordLinks`), so a hand edit that breaks a record link comes back as a refused edit like any other rule. An empty
parser slot needs no rule here: write-back is a contract `write`, which D5 lets land unvalidated, and merge takes a
kind's entry shape from its mechanism, not its parser. Write-back is dark until the flip, so a missing parser or entry
shape is the flip's to catch: `storage-cutover`'s rehearsal confirms every hand-editable projected kind has its parser
and every entry kind its entry shape (§ 18). Write-back adds no rule for an entry kind whose grammar is not yet declared
(Owner, 2026-10-13): where a backend refuses one as a terminal `unhomed-kind` (`spec-storage-ref-backend.md` § 5.1),
write-back reports it as a refused edit carrying the backend's remedy.

#### 7.7 A clash found in the checkout stays in its file

Three cases have no stored base for the store to merge from:

- an edit whose base is content a persisted write-back took in that the store never held, the copy kept beside the index
  (`spec-projection-substrate.md` § 3.6), whether a stale buffer saved it or the file kept its content after a malformed
  entry was refused (§ 6.4);
- content sharing no non-blank line with any candidate, whose base is empty (`spec-projection-substrate.md` § 3.5);
- the meta and task list, single-writer kinds the store refuses as `version-conflict` rather than merging (D3;
  `spec-storage-ref-backend.md` § 5.2), whose base write-back reads through `history` at the version the file's stamp
  names (`spec-projection-substrate.md` § 3.5).

Write-back merges each in the checkout with the same library (`mergeLineText`, `mergeEntryText`), onto the store's
current version, passing the base's record version in the library's input (`MergeTextInput`,
`lib/store/concurrency/line-merge.ts`) — null for an empty base and for the kept copy, which the store never held —
though no record these merges produce is stored. The library's side labels (`currentLabel` and `incomingLabel`, each a
`SideLabelSchema`, `lib/store/conflict.ts`) name this checkout's machine and the save's modification time for the edit,
and, for the store's side, whose writer only the store's commits carry (§ 7.1) — a history entry's provenance holds no
actor or time (`StoredProvenanceSchema`, `lib/store/links.ts`) — the record version it merged onto and the time
write-back read it.

- **A clean result** is sent against that current version like any edit (§ 7.1). For an entry kind, a clash
  `mergeEntryText` finds that `mergeLineText` merges cleanly over the same base and sides is a clean result too, both
  sides' lines kept.
- **A clash** is written into the file with markers and the file stamped with the current version it merged onto, and
  nothing is stored: the file holds a conflict, is reported, and keeps the person's edit (D13). The markers render as
  `mergeLineText` builds its result; an entry kind merges through `mergeEntryText` first, and where that clashes the
  file's markers come from `mergeLineText` over the same base and sides, whose every clash has one span to draw, since
  an entry clash keeps one side and a prose clash spanning an entry has none (§ 6.3). Writing them replaces the file by
  the swap, its aside copy write-back's own (`spec-projection-substrate.md` § 5.2), and only where write-back refused
  nothing else the file held: a file one of whose entries it refused is not drawn into, the clash reported beside that
  refusal, until the entry is repaired (§ 6.4). Once a drawn file's markers are resolved it writes back as an ordinary
  edit against that stamp, which the store merges if it has moved again.
- **A meta or task list holding such markers** is never sent while they stand, so it is pending rather than skipped
  (amendment, § 16).
- **A clash found while taking in an aside copy** is drawn in the file the copy goes back to, or kept with the copy,
  reported (`spec-projection-substrate.md` § 5.2).

Such a clash is visible only in its checkout until it is resolved, as a Git working-tree conflict is: it holds an edit
that never reached the store, which only the person holding it can resolve, while a clash whose base is stored reaches
the store and every checkout (Owner, 2026-10-13; residual, § 17).

#### 7.8 What the store refuses

A refusal lands nothing, so the edit stays in its file and the next command sends it again.

- **`record-malformed`** — from the kind's parser, which a write's stale-base merge also runs over the merged content,
  from the write check the backend runs where the write lands, or from a serialization rule (§ 7.5) — leaves a refused
  edit, reported with its rule and remedy (D13).
- **`version-conflict` on a merge kind** sends write-back to read the record. A record no longer there takes the removal
  path's refused edit (`spec-projection-substrate.md` § 5.6), as the reference backend refuses a put to an absent record
  this way (`stale`, `__tests__/helpers/store/write.ts`). One still there means the expected version is not in its
  history (`spec-storage-ref-backend.md` § 5.2), so the stamp is treated as lost and the file goes to base-stamp
  recovery (`spec-projection-substrate.md` § 3.5), at most once per command.
- **`lock-held`** marks the file pending for the next command.
- **`state-unresolvable` naming a history ref** on a write to a completed item is § 8.4's, and **`unsupported`
  `unhomed-kind`** is § 7.6's.
- **`state-unresolvable` naming no history ref** (`historyRefs: []`) has nothing a pull by name could fetch — for
  example a record object the write captured that this clone cannot read (`checkRecord`,
  `lib/store/ref/write-checks.ts`), or an anchor field the edit set to a state version this clone cannot resolve, the
  refusal naming the field (`prepareAnchor`, `lib/store/ref/write-anchors.ts`). It leaves a refused edit carrying the
  backend's remedy, and nothing is pulled; the next command sends the edit again once the remedy is applied.
- **A command stopped after a write lands** and before the index records it sends the edit again at its next run; where
  the first landing clashed, the store merges it a second time and files the same clash again (§ Spike 5), which the ref
  backend treats as correct (its § 5.2): a duplicate, visible conflict. Where another writer returned part of the landed
  edit to the base in between, the second send can apply it again (§ 17 item 6).

### 8. Edit rights and protected files

#### 8.1 Edit rights

D13's edit-rights rule stands, by lifecycle state and kind of file, not by projected folder: stubs are groomed by
anyone; the owner of a work unit in flight edits its prose from any checkout, while its meta and task list stay with the
owning checkout; an Errand's owner edits its description from any checkout; and another person's work items are
read-only except for routing inserts. Two cases D13 leaves open are settled here: a paused work unit (§ 8.3) and
archived work (§ 8.4).

The kinds D13 does not name are settled too (Owner, 2026-10-14). Cohort documents, live or archived, and the project
inbox are edited by anyone, since everyone with access is a team member and the project inbox is the team's shared
inbox; personal records by their own identity alone; and a work item's inbound list by its owner from any checkout,
while another person's stays read-only, a routing insert arriving through the routing verb's write rather than a hand
edit. Gating the project inbox, by per-record authorization or host-enforced protection, is out of scope here, and
nothing here precludes it.

#### 8.2 Three layers

D13's three layers stand: the notice line, the read-only mode, and the persist refusal.

- **The notice line** is ARC's own convention, modeled on Go's `Code generated … DO NOT EDIT.`, in an HTML comment
  beside the base stamp; no Markdown convention exists.
- **What the notice names** is where an edit can be made: for a work item a checkout on this machine holds, that
  checkout's path; for one no checkout here holds, `arc materialize <slug>` when the reader owns it — with `--here` and
  the checkout where a checkout with no marker still has the work branch out, as the paused-work slot's action does
  (`spec-seam-locus.md` § 4.4) — and its owner otherwise; for archived work another person owns, its owner (§ 8.4); and
  for a read-only source's file, the source (`spec-projection-worktrees.md` § 14). It never names another machine, which
  nothing here records: work-unit markers are machine-local, and a pause records who paused, not where (amendment,
  § 16). The checkout it names comes from that checkout's marker, so it can lag a change there (§ 10.4).
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
  naming it (`spec-storage-ref-backend.md` § 7.3), as does a `history` read a merge in the checkout makes
  (`spec-projection-substrate.md` § 3.5). `arc save` and the persist and release steps pull that ref by name and retry
  once (its § 4.5), only where the refusal names at least one history ref, through the store's shared history-retry
  helper as `storage-ref-hardening` leaves it (today `pullHistoryForRetry`, `lib/store/pull-consumption.ts`), the way
  `arc rename`'s store write retries (`runStoreRename`, `lib/work-unit/verbs/rename-store.ts`); where the pull is
  refused or the state remote lacks the ref too, the edit stays as a refused edit carrying the backend's remedy. A
  refusal naming none is § 7.8's. At any other command's start, where a refresh touched the file, the refusal stays a
  refused edit whose remedy names `arc save`, and nothing is pulled, so no other command's start waits on the network
  (`spec-projection-worktrees.md` § 15.2).
- **A new file** there adopts into its archived work unit the same way (§ 9), and the errata convention moves onto the
  store's history of the archived meta (§ 18).

### 9. Files the store does not know

Adoption follows the folder a new file appears in, since a work unit owns files by folder, not by name (D13), for a text
file of any kind (`spec-projection-substrate.md` § 3.7). A file's record comes from the layout classifier `seam-locus`
builds beside `resolveArcPath`, which inverts every registered file address — a location plus a kind's file pattern — to
a kind and key, a directory inverting to none (`spec-seam-locus.md` § 3.3); this member registers its locations and the
file names of the kinds it projects (§ 10.1), so one classifier serves write-back, adoption, and `seam-locus`'s overlap
check.

- **`active/current/` and a stub's folder under `backlog/`** — adopted into that work item.
- **A new folder under `backlog/`** — adopted as a new stub through `arc stub`'s minting path when it holds a meta that
  parses and names no `Owner` but the adopting identity. Its commitment tier and any cohort come from the path, and its
  priority, origin, design, and class from the meta as `arc stub`'s own parameters, while the verb renders every other
  field, `State` among them (`runStub`, `lib/work-unit/verbs/stub.ts`, through `renderMetaFile`,
  `lib/store/kinds/meta/projection.ts`), and owns the stub to the adopting identity, as `arc stub` owns every stub to
  its caller (`handleStub`, `handlers/lifecycle.ts`). The one verb-owned value the meta supplies, `Class`, enters as
  `arc stub --class` passes it, validated the same way, so no other hand-set verb-owned value lands under `stub`. What
  else the file holds is then a hand edit of the minted record, written back and checked like any other, once write-back
  has set the file's verb-owned fields to the minted record's values, so the edit changes none of them: those
  `checkMetaVerbOwnedField` (`lib/store/kinds/meta/authority-rules.ts`) refuses a hand edit changing — `State`, `Class`,
  and `Current Workflow`, and `Owner` and the pause section, which `seam-lifecycle` adds to them
  (`spec-seam-lifecycle.md` § 8.1, § 8.5, § 18.1).
- **A meta naming another identity as `Owner`** is not adopted, since `Owner` is verb-owned (`spec-seam-lifecycle.md`
  § 8.5): its folder stays ownerless, and the remedy has the person name themselves, adopt it, then run
  `arc handover <slug> --to <identity>`.
- **A new folder under `backlog/` without a meta that parses** — its files are ownerless: flagged in `arc status`, with
  the removal check refusing while they stay unadopted (`spec-projection-worktrees.md` § 12.2), and the remedy naming
  `arc stub <name> --commitment <tier>` with the tier filled in, after which the folder's files adopt.
- **A path the classifier maps to no record** — `active/`'s top level under the default `nested` layout, which under
  `flat` is the checkout's own work item's folder (§ 10.3), the identity root outside `scratch/`, `backlog/`'s top
  level, a commitment folder, or a quarter folder — refuses at persist, naming where such a file goes: `current/`,
  `scratch/`, or a work item's folder.
- **`active/in-flight/<slug>/`** — the owner's prose only, under the edit-rights rule (§ 8.1).
- **`completed/`** — adopted into its archived work unit under § 8.4's rules.

**Never adopted.** No derived view renders as a file from the flip (Owner, 2026-10-16), so the two a projected root can
still hold are files left from before it, and neither is adopted, by its path: `STATUS.USER.md` in an identity's
personal root, which nothing deletes, and the tracked `ROADMAP.md` on a branch that has not merged the cutover, which
still resolves through the layout's `project-document` address (`lib/layout/schema.ts`), an address that stays past the
cutover with its implementation. Nor are editor side files — `*~`, `.#*`, `#*#`, `.*.sw?`, `4913`, and
`*.tmp.<pid>.<hex>` from the terminal editors and Claude Code (§ Spike 3); VS Code and Zed add none — or the folder
files operating systems write — `.DS_Store` and `._*` on macOS, `Thumbs.db` and `desktop.ini` on Windows, and KDE's
`.directory`. The match runs on the file name before any other test, since Emacs's `.#name.md` lock is a dangling
symlink ending in `.md`. Nor is a file at a path `MACHINE_LOCAL_PATHS` lists (`spec-projection-worktrees.md` § 12.9) —
the identity's `.internal/` and each workspace's among them — which the projection neither persists nor refreshes (D5):
write-back's walk skips those folders (§ 15.1). A file skipped by its name or path — a side file above, either leftover,
or a path `MACHINE_LOCAL_PATHS` lists — is not an unadopted file, and the removal check and the persist and release
steps never refuse over one (`spec-projection-worktrees.md` § 12.2).

**Symbolic links.** Every read — the walk, change detection, the read gate, the take-in, and write-back — takes each
entry without following links (§ 15.1), so a symbolic link is never followed, read, or adopted. One at a path the index
lists reads as a deleted file (`spec-projection-substrate.md` § 4): no edit, and replaced when a refresh next writes the
path or `arc sync` rebuilds deleted files (`spec-projection-worktrees.md` § 2.4). Any other in a projected root, past
the name match, is never adopted, as the files above are, but is reported. Each is reported with the remedy of replacing
it with a regular file, and the removal check and the persist and release steps never refuse over one, since the record
lives in the store and the link's target outside the projection (`spec-projection-worktrees.md` § 12.2).

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
`<name>-<slug>.md` for a work unit's companions, keyed `<name>`; `spec-<slug>-prd.md` and `spec-<slug>-rfc.md` for a
paired spec's halves, keyed `spec-prd` and `spec-rfc`; `inbound-<slug>.md`; `errand-<slug>.md` for an Errand's
description; `cohort-<cohort>.md` for a cohort document's copy; and `scratch/` documents, each keyed by its path. Any
other text file in a work item's folder, or in a folder beneath it, is a companion keyed by its path below the work
item's folder, forward slashes between its folders, and projected back at that path. The classifier tries, in order, a
work unit's artifact names; the fixed forms — a paired spec's halves, `inbound-`, `errand-`, and a cohort copy;
`<name>-<slug>.md`; then the path key. The schema refuses a companion key equal to `meta`, `tasks`, `draft`, `spec`,
`notes`, `errand`, `inbound`, or `cohort`, as the ref backend does; one beginning `cohort-`, which D13 reserves inside
`current/`; and a path key an earlier form would claim, judged against the slug the folder names, or the checkout
claim's for its own location, as the ref backend judges a verbatim key against the resolved owner's current slug
(`spec-storage-ref-backend.md` § 3.2, § 5.1, its A10), so after `alpha` is renamed to `beta` a literal
`extra-alpha.md` under `beta` is a path key. The `<name>-<slug>.md` form claims neither `spec-prd` nor `spec-rfc`, whose
files are a paired spec's halves, so no key resolves to a path that inverts to another (Owner, 2026-10-14).
`resolveArcPath` then resolves every projected path, and `seam-locus`'s classifier inverts it (Owner, 2026-10-13; § 9).
The checkout's own location carries the effective `layout.active` value and the slug of the work item the checkout
claims in its address, since `lib/layout/` reads no configuration and no marker (§ 10.3); a path at the checkout's own
location — under `active/current/`, or at the top of `active/` under `flat` — inverts by that slug and the effective
`layout.active`, since the path alone holds no slug a hyphenated name could not also claim, and the top of `active/`
names a record only under `flat`. A record projects only where the schema holds an address for its kind: a
projection-defined kind with none projects nothing, the Errand queue among them, which D13 keeps a machine record `arc`
reads (`personal/errand-queue`, `lib/store/registry.ts`).

A companion (`work-item/companion`) is keyed by a managed path, as a personal document is, where D2 keys it by name
(`KIND_SHAPES`, `lib/store/catalog.ts`): `<name>-<slug>.md` keeps the key `<name>`, and any other companion's key is its
path. `storage-ref-backend` stores a key `SlugSchema` (`lib/kernel/schema/slug.ts`) admits as `<key>-<slug>.md`, a
paired spec's halves as `spec-<slug>-prd.md` and `spec-<slug>-rfc.md`, and any other key verbatim, with its codec for
it, and refuses a key that would collide with its own folders and files in a work item's ref — at the root, any name
matching `^metadata-[0-9a-f-]{36}\.json$` or a path under one (`isOwnerMetadataName`,
`lib/store/ref/metadata-filename.ts`), while a nested `scratch/metadata-<uid>.json` stays an ordinary companion — or
that Git refuses, which write-back reports as a refused edit (§ 7.6, § 16.3, § 18). A true alias, which only a folder
not yet re-laid after a rename can reach, since a known file writes back under its index reference
(`spec-projection-substrate.md` § 3.1), comes back the same way, carrying the backend's remedy. The in-repo
implementation refuses `unsupported` `unhomed-kind` every key but a name of lowercase letters alone or a paired spec's
half, since any other file name fails the matcher `companionPath` applies (`artifactMatcher`,
`lib/work-unit/mutators/relocate-artifacts.ts`; `lib/store/in-repo/paths.ts`).

#### 10.2 Ordering

`active/current/` lands only after `seam-locus` resolves the current work unit from the checkout marker plus the store,
since today's resolver reads `active/` without recursing, and takes session-init's slot paths and the compaction seed's
from the layout resolver (D13, Ordering; `spec-seam-locus.md` § 2.1, § 4.9). `seam-locus` has shipped (§ 18), so the
order holds.

**The work-item path.** From the flip, every path a caller reports or keys for a work item resolves from its checkout
root. `seam-locus` adds the function flat — `workItemArtifactPath(slug, artifact, readPlacement, cohort)`
(`lib/store/lifecycle-storage.ts`), resolving through `resolveArcPath`, which `lifecycleArtifactPath` calls — and this
member adds its checkout root, keeping the name (`seam-locus`, 2026-10-16, re-confirmed 2026-10-18):

```ts
workItemArtifactPath(checkoutRoot, slug, artifact, readPlacement, cohort): Promise<string>
```

- **What it returns.** A path relative to `checkoutRoot`. Backlog and completed placements resolve as today, reading
  nothing. The active arm returns today's flat path where the checkout's store answers the capability false, and
  otherwise `active/current/` for the work item the checkout claims — flat in `active/` under `layout.active: flat`
  (§ 10.3) — or `active/in-flight/<slug>/` for any other (§ 10.1). Today's flat body stays as the synchronous resolver
  that arm returns.
- **Why it is async.** Its first resolution for a root reads that checkout's marker (`readWorktreeMarker`,
  `lib/git/worktree-marker.ts`) and effective `layout.active`, and caches both per root in the engine's process state
  beside the capability. The capability comes from the store: the engine's start records that of the store it is given
  for its root, `createStore` (`lib/store/create.ts`) that of the store it composes, which answers false until the flip,
  and the engine that of each worktree it refreshes. A root nothing has recorded resolves as
  the in-repo implementation lays it, the only layout a process holding no off-branch store for that root can be
  reading, so a script, which runs no root hook, resolves as a command does once it composes its store.
- **The other path functions.** `seam-lifecycle`'s take the root first too and resolve their active arm through it: its
  meta path (`workUnitMetaPath`, `lib/store/lifecycle-write.ts`), which calls `resolveArcPath` directly today; the
  records it places beside the meta (`lifecycleRecordPath`, `lib/store/lifecycle-record-path.ts`), derived from that
  path; and the artifact path activation, graduation, and the lifecycle view take (`lifecycleArtifactPath`). The meta
  path and the artifact path must agree, since reconciliation keys the records it acquires by the first, and with both
  resolved there a verb's report, and every path it keys a record by, names the file the projection lays. The snapshot
  reader beside them (`snapshotFs`, `lib/store/lifecycle-storage.ts`) keeps the flat active path through the
  synchronous flat resolver: it builds an in-memory tree for the integration compositions' lifecycle summary, which
  walks `active/` without recursing (`collectLifecycleMetaFiles`, `lib/work-unit/lifecycle-index.ts`). The cohort
  document's path (`cohortDocumentPath`, beside `completedCohortPath` in `lib/store/lifecycle-record-path.ts`) takes no
  checkout root: a cohort document's home is under `backlog/` or `completed/` in every checkout, and the copy
  `active/current/` holds is a second projected path the projection lays and no caller reports (§ 10.1).
- **Every caller converts.** `seam-status-roadmap`'s `arc view` resolves each work-item artifact path through the
  function, or a design selector's through `lifecycleRecordPath`, synchronously today (`handlers/view-store.ts`), and
  from the flip reads a target as projected here when a file exists at the returned path; its design read matches a
  name through `workUnitArtifactName` (`lib/store/lifecycle-write.ts`) and `companionStoredName`
  (`lib/store/companion-name.ts`) in `readLifecycleDesign` (`lib/store/lifecycle-design.ts`), so § 10.1's file names
  keep today's slug forms under both `active/` folders. This member lands after it, so it converts those callers with
  the rest.

**The per-root cache's lifetime** (`seam-locus`, 2026-10-18). Every write of a checkout marker goes through
`lib/git/worktree-marker.ts` — `writeWorktreeMarker`, `writeWorktreeOwnershipMarker`, `stampWorktreeHusk`, the
`create`, `replace`, `restore`, and `removeWorktreeMarkerGeneration` family, and `removePrimaryTransientOccupancy` —
and each notifies a listener the engine's process state registers, which drops that root's entry. Three writes bypass
the module today and move onto writers it exports: the marker clear after a release in teardown
(`lib/work-unit/verbs/teardown.ts`) and in the store's teardown (`lib/work-unit/verbs/teardown-store.ts`), each a raw
file removal, which take an unconditional removal, since the module's removal compares a generation; and a spawn
rollback's restore of its claim (`restoreSpawnClaim`, `lib/work-unit/spawned-worktree-claim.ts`), a raw exclusive
`writeFile`, which takes an exclusive create from bytes beside `createWorktreeMarkerGeneration`, which serializes a
parsed marker. The root hook clears every entry at each command's start, so a process running several commands
carries none across them, nor a `layout.active` value an in-process configuration write changed. Projection work in a
worktree — the start, refresh and fan-out, the persist and release steps, materialization — reads that worktree's claim
fresh under its projection lock, compares it with the index's (§ 10.4), and reseeds the entry, so no file is laid from
a cached claim. A claim another process changes mid-command reaches this process's path answers only at that read or
its next command: the lag § 10.4 records for owner notices (§ 17), never a misplaced file.

#### 10.3 The revert key

D13's one layout-resolver setting is a project key in `arc-config.yml`, `layout.active`, taking `nested` (the default)
or `flat`, where `flat` lays the checkout's work item flat in `active/` and leaves everything else unchanged. It is a
project key, not a personal one: docs, workflows, and agents reach paths through the layout resolver, and a personal key
would let two people's instructions point at different paths. It follows the file's flat, dotted key form, and it stays
until the layout has seen use (D13). The index records the value each worktree was projected under, and a command that
reads a different one reprojects `current/`, as a changed claim does (§ 10.4), by the reprojection
`projection-worktrees` builds (`spec-projection-worktrees.md` § 10.3).

#### 10.4 The in-flight view setting

The setting — `mine` (the default), `cohort`, or `all`, plus named pins — is personal. It lives where personal settings
live today, `arc.*` keys in `git config --local`: `arc.inflightView`, one value, and `arc.inflightPin`, one entry per
pinned slug. It moves with the other personal keys when `config-storage-architecture` builds its per-developer tier
(§ 18).

The index records the effective setting, pins included, the identity, and the checkout claim the worktree was projected
under. A command that reads a different one reprojects what it governs, by the reprojection `projection-worktrees`
builds (`spec-projection-worktrees.md` § 10.4): views added, a file leaving a view through the removal path
(`spec-projection-substrate.md` § 5.6), the personal roots following a changed identity, and `current/` with the notices
naming an owning checkout following a changed claim, since a release, a promotion, or a materialize changes the marker
without a store write.

A notice here that names another checkout as the owner reads it from that checkout's marker, which this index does not
record, so it can lag a release, promotion, or materialize there until that file's record next changes, a primary re-lay
rewrites it (`spec-projection-worktrees.md` § 15.2), or a reprojection here; the persist refusal behind it names where
to apply an edit from the machine's markers as they stand when it fires (§ 8.2; residual, § 17).

### 11. Ignoring, finding, and editor settings

#### 11.4 Editor settings

Editor settings are opt-in, never written by default (D13).

- **`arc editor <vscode|zed>`** merges only ARC's keys into the checkout's settings file, keeping its comments and other
  keys, and `--remove` takes them back out, after Yarn's `yarn dlx @yarnpkg/sdks vscode`. It edits the file through
  `jsonc-parser`'s `modify` and `applyEdits`, which the CLI already bundles for Markdown lint configuration
  (`lib/markdown/configuration.ts`); only the root `package.json` declares it today, so the package's own
  `devDependencies` gain it.
    - **VS Code** takes one key in `.vscode/settings.json`, `files.readonlyFromPermissions: true`, so it honors a
      protected file's mode (§ 8.2); the tracked `.ignore` already re-includes the projection for its search and
      quick-open.
    - **Zed** takes a project-level `file_scan_inclusions` in `.zed/settings.json` listing, after Zed's `"..."` entry,
      which keeps its default `.env*` inclusion that an explicit list would otherwise replace, a glob for each projected
      root built from the pattern that ignores it, so no identity is named: `.arc/active/**`, `.arc/backlog/**`,
      `.arc/completed/**`, and `.arc/user/*/**`.
- **`arc init` and `arc join`** print the one user-level Zed setting, the same `file_scan_inclusions` list for Zed's
  user settings, keeping no record: ARC writes nothing per machine, and each verb runs about once per person per clone,
  so D13's once per machine becomes once per such run (Owner, 2026-10-14).
- **Nothing else.** Editors in the ripgrep family need nothing. JetBrains IDEs list gitignored files in the project
  tree, highlighted as ignored, and ask to clear a file's read-only status before editing it.

Before the flip `arc editor` refuses `unsupported`, and neither `arc init` nor `arc join` prints the Zed
setting (§ 1.4).

#### 11.7 The selection of editable Markdown files

From the flip no gate's Markdown check reads projected state, since `lint:md` lists files with `--exclude-standard`
(`lib/markdown/selection.ts`). `projected-markdown-checks` owns the checks that do — which run, over which content, and
the fixer — and reads the files they cover from this member's selection (Owner, 2026-10-16), with no edge either way
(`cohort-state-storage.md` § Coordination).

- **What it holds.** Read from the index (`spec-projection-substrate.md` § 3.1): the projected Markdown files this
  checkout may edit (§ 8), leaving out `completed/`, which write-back does not scan (§ 15.1) and this repository's lint
  configuration excludes; protected files (§ 8); files holding conflict markers, since every conflicted sample fails
  lint (§ Spike 4); and the personal root's `.internal/` and `scratch/` (Owner, 2026-10-17).
- **The command.** `arc selection` prints one repository-relative path per line, or `{ paths }` under `--json`, after
  its command's start has taken pending edits in, so new files are adopted and the conflict and protected marks are
  current. Its answer is only as current as that take-in, so, as `arc save` does (§ 2.4), it refuses where its start
  cannot take its lock or loses its lease, naming the holder or the loss and a retry, refuses where the configuration
  yields no identity, naming the remedy that sets `arc.identity`, and refuses `--skip-projection`. Over the in-repo
  implementation, which projects nothing and whose start takes no lock and reads no identity, it prints an empty list,
  refusing only `--skip-projection`, so a check wired before the flip runs clean. Its name is the check mode's,
  `selection`, which `spec-projected-markdown-checks.md` § 4.1 ties to the command's.
- **`--changed`** prints the part of the selection this checkout changed since its last `arc save`, in the same form,
  empty before the flip. It reads a changed mark per file in the index (`spec-projection-substrate.md` § 3.1), since
  store provenance names no checkout (`CallerProvenanceSchema`, `lib/store/links.ts`) and state versions carry no order,
  so `changes` cannot derive it.
- **Setting the mark.** Write-back sets it whenever it finds an edit in the file, whatever comes of the edit — landed,
  refused, skipped for failing to parse (§ 7.1), or left pending — on the checkout whose file holds the edit, whichever
  process takes it in, so a sibling's refresh that takes the edit in (`spec-projection-substrate.md` § 5.1) or a persist
  step marks the holding checkout. A verb run from this checkout sets it too, marked by the writing process when its
  fan-out refreshes its own checkout (`spec-projection-worktrees.md` § 2.2); a verb writing for another checkout, as
  graduation does into a spawned worktree, marks nothing there, and a refresh that only rewrites a file, from a
  sibling's write or a pull, never sets it. Until `projection-worktrees`'s fan-out lands (§ 18), no refresh follows a
  verb's write, so `--changed` holds hand edits alone.
- **Clearing the mark.** Every command's start already lands edits (§ 2.2), so `arc save` clears the mark under the
  projection lock on every file except one still holding an edit the store lacks — left refused, failing to parse,
  pending, withheld (`spec-projection-worktrees.md` § 2.5), or held for a resolution (§ 6.4) — and a verb write racing
  it can only over-include. The mark follows its record when the path moves, and an index rebuilt with no usable index
  marks every file until the next save, both set by `projection-worktrees` (`spec-projection-worktrees.md` § 11.7). How
  often the save anchor moves is `storage-cutover`'s workflow rewrite to decide, so until a workflow saves per
  increment, the set spans the work since the last save.
- **The connection.** `projected-markdown-checks` reads the selection only through
  `readProjectedSelection(root, { changed })` (`lib/checks/projected-selection.ts`), which returns an empty list until
  connected, so this member replaces its body (`spec-projected-markdown-checks.md` § 4.6): inside an `arc` command whose
  own start has taken edits in, it reads the index directly; inside one whose start found the store answering the
  capability false, it returns an empty list and runs no subprocess; inside one whose start did not complete — under the
  skip switch, with no identity, or after a start that could not take its lock or lost its lease (§ 2.2,
  `spec-projection-worktrees.md` § 2.5) — it returns `unavailable` with the reason `arc selection` would refuse with;
  and from a script, which runs no `arc` start, it runs `arc selection` through the checkout's own `arc` (`npx arc` in
  this repository). Its failures map to `unavailable` with the command's or reader's reason, for which the `selection`
  checks report `couldn't run` (its § 4.4). The unit test pinning the empty body
  (`__tests__/unit/handlers/check/run.test.ts`) changes with it, while the subprocess CLI tests that run over the
  in-repo implementation keep their empty selection.

### 13. Windows

Each Windows mechanism D13 names is built, and each is covered by tests in the portability tier, which the
cross-platform pair runs on Windows and macOS on CI's weekly schedule and on a dispatch, and which this change's
verification dispatches (D13):

- **Read-only files** move aside and link in with the mode intact (§ 8.2).

### 15. Refresh and performance

A command's cost grows with what changed, never with how much state exists. Reads take only a ref's tip (D10), and
`history` is read only where `spec-projection-substrate.md` § 3.5 names.

#### 15.1 What write-back checks

Write-back checks every projected root but `completed/`: the checkout's own work item, the personal surfaces, its
in-flight views with their protected files, so a refused edit is reported at once, and `backlog/`, where anyone grooms a
stub and new files are adopted. New files are found by walking those roots' folders each command, as Git's
untracked-file scan does without its cache, without following links and skipping the folders `MACHINE_LOCAL_PATHS` lists
(§ 9); `backlog/` holds about 300 files in 156 folders here, which adds about 2 ms on Linux and 8 ms on Windows, most of
it the folder walk (§ Spike 2). `completed/`, which grows with the archive, is checked by `arc save`, by the removal
check's projection part and the persist and release steps, and whenever a refresh touches a file.

### 16. Forward amendments to shipped specifications

The storage contract has shipped. Where this design changes what its specification defines, the change is stated here
and built by this change, except where a subsection names its builder; the specification is not edited.

#### 16.1 The storage contract (`spec-storage-contract.md`)

Nine change D13's own wording:

- **The skip switch** (§ 2.3). D13 says there is no setting to turn write-back off. `--skip-projection` is a flag every
  `arc` command accepts that runs that one command without write-back or refresh, its edits left pending for the next,
  so a projection defect cannot lock a person out of `arc`; nothing keeps it on as a mode. The removal check and the
  persist and release steps run under it as without it (§ 2.3).
- **A stale buffer's save merges from what the last persisted write-back took in** (`spec-projection-substrate.md`
  § 3.6). D13 merges an edit against the version its base stamp names; an editor that never reloads keeps the stamp a
  write-back read, and merging against that version would undo the person's own persisted edits. `projection-substrate`
  defines the record of what a persisted write-back took in, keeps its copy, selects that content as the base of a save
  carrying the stamp the write-back read (`spec-projection-substrate.md` § 3.6), and reads it in base-stamp recovery
  (`spec-projection-substrate.md` § 3.5); this member fills the record and sends that base or merges from the copy in
  the checkout (§ 7.1, § 7.7).
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
  would skip it for good. A clash write-back finds in the checkout — an edit whose base is content a persisted
  write-back took in that the store never held, content sharing no non-blank line with any candidate, a hand edit to the
  meta or task list over a verb's write — shows as markers but is never stored, so only its checkout sees it until it is
  resolved. A meta or task list holding such markers is never sent while they stand, so it is pending rather than
  skipped, and resolving it persists as an ordinary edit. Its markers label the store's side by the record version it
  merged onto and the time write-back read it, where D13 labels each side with its machine or session and time, since
  only the store's commits carry that side's writer.
- **A conflicted file the store's change overlaps waits** (§ 6.6). D13 holds nothing back, keeping the rest of a
  conflicted file refreshing; where the store's change overlaps an open conflict's lines, the file keeps its version,
  reported, until the person resolves it.
- **A resolution in progress holds its whole file, and a malformed entry its file's content** (§ 6.4). D13's parse-back
  keeps a conflict open where its markers are left as they were, refuses only a malformed entry's persist while the rest
  of the file persists, and holds nothing back. A marker set whose sides differ from its conflict record's is neither:
  write-back refuses the whole file, for every kind, its other edits included, until the markers are removed or the
  sides restored, since the replace guard cannot refresh the file without overwriting the person's partial resolution. A
  malformed entry's persist refuses while the rest of the file lands, as D13 says, but the file then keeps the person's
  content, neither read back nor drawn into, until the set is repaired, since replacing it would drop the refused
  entry's text, its only copy; for that file this keeps the whole-file hold D13 retires for merge surfaces. An aside
  copy holding a malformed set is refused whole, its other edits held back with it until it goes back to its path, where
  the file's take-in lands them, or the person deletes it. While either hold stands, the file's record's open conflicts,
  those a landing filed among them, are recorded in its index entry and reported beside the refusal rather than shown in
  the file, where D13 shows a conflict in the file.
- **A hunk conflict whose markers cannot be placed shows as a notice line** (§ 6.3). D13 shows a hunk conflict as
  markers around the conflicting lines, and only a whole-record conflict as a notice. Here a hunk conflict whose
  placement fails its check shows as a notice line in the idiom of D13's whole-record one, naming the conflict record,
  the incoming side's machine or session and time, where that side reads, and the remedy, `arc save --resolve`; it
  arises mostly where a checkout renders the record after further writes, routinely on a machine other than the one that
  filed the clash. A file with no stamp shows such a conflict nowhere in the file, only in status and the refusing
  verbs: D13's in-file rule keeps the surfaces every session loads from reading one side as settled, and those are
  stamped Markdown, while a file with no stamp loads into no session.
- **The user-level Zed setting prints at each `arc init` and `arc join`** (§ 11.4). D13 prints it once per machine. ARC
  writes nothing per machine, so it keeps no record that the setting was shown, and each verb runs about once per person
  per clone.

Three add to D13 without contradicting it:

- **`completed/` keeps its owner's rules** (§ 8.4). D13's edit-rights rule names none for archived work. The archived
  work unit's owner edits its files from any checkout, the meta and task list included, since no checkout owns it, and a
  correction is a write in place that keeps its archive number.
- **Escalated conflict markers** (§ 6.1, § 6.2): longer than seven characters where the file holds a marker-like line,
  with a resolve-by-hand line after the start marker; D13 names the standard markers.
- **`arc save --resolve <conflict>`** (§ 6.5). D13 resolves a whole-record conflict's notice by "a verb or a write
  naming the conflict" and names neither. This option sends the conflict's subject file naming it in `resolves`, its
  text the resolution, or the store's side where the file is unedited, for any conflict shown without markers whose
  subject file is not held for a resolution in progress or a malformed set (§ 6.4), toward the store's side or a
  content-only edit the kind's write check admits.

#### 16.2 Conflict records (D6), recorded by `storage-ref-backend`

This design reads three fields of a hunk conflict record — `baseVersion`, `currentLines`, and `incomingLines` — and
the merge library's base-version input (`MergeTextInput`), which `storage-ref-backend` recorded as its forward
amendment to D6 and built (`spec-storage-ref-backend.md` § 2.6, § 3.7); this change builds neither (§ 18).

#### 16.3 Companion keys (D2), recorded by `storage-ref-backend`

D2 keys a companion by its name. Here any text file in a work item's folder, or in a folder beneath it, is a companion
keyed by its path below that folder, so a person's own files there persist and project back where they were made;
`<name>-<slug>.md` keeps the key `<name>` (§ 10.1). `storage-ref-backend` records the change as its forward amendment to
D2 and builds the key shape, the stored path, and the codec (§ 18); this change builds the addresses and the
classifier's inverse (§ 10.1).

### 17. Residuals the design accepts

1. **A write through a held handle.** A write through a handle opened before a replacement and landing after the
   command's second check, or after a persist or release step took the aside copy over, goes to a deleted aside copy and
   is lost (`spec-projection-substrate.md` § 5.2). Reasoned, not measured: no tested editor or agent holds a file open
   across saves.
2. **An exact revert during a replacement.** A save to a file other than Markdown that exactly restores the version a
   replacement replaces, made while the index still records that version — during the replacement, after a stop or a
   rebuild's yield until the next command, or while the batch's aside copy waits for another process scope (item 10) —
   reads as old content and is refreshed (`spec-projection-substrate.md` § 3.7): content alone cannot tell it from what
   the stop left.
3. **A forced removal.** A removal forced past the lock with `git worktree remove -f -f`, which D17 allows and Git's
   refusal suggests, skips the persist step and loses what item 4 names.
4. **An anchored checkout removed by another tool.** A checkout claimed with `arc start --here` is not locked, so
   another tool's `git worktree remove` takes with it every edit made there since the last `arc` command and every state
   a removal refuses over — a refused edit, a file that failed to parse, an unadopted file, a conflict, a withheld file
   — and, before the flip, the gitignored `SESSION-NOTES.md` and any copy of the identity-global user files teardown
   would merge up (`reconcileUserSurfacesForRemoval`), as it would in any checkout ARC did not spawn.
5. **A clash found in the checkout is seen only there** until it is resolved (§ 7.7): a second machine, or another
   checkout, sees the store's side alone, as uncommitted Git changes elsewhere go unseen. The clash holds an edit only
   its holder can resolve.
6. **A stop after a write lands.** A command stopped after a write lands and before the index records it leaves the file
   as the person saved it, under its old stamp, and sends the edit again at its next run. Where the first landing
   clashed, the store files the same clash again (§ 7.8), a duplicate, visible conflict. Where another writer, in
   between, returned part of the landed edit to the base, or removed an entry it changed, the second send applies that
   part again without a conflict: the merge (§ 7.1, § 7.7) takes the sent side's change wherever the current side holds
   the base, and keeps an entry's change wherever the other side removed it (`mergeLineText`, `mergeEntryText`). Where
   that writer changed the part otherwise, the merge keeps its version, with a visible conflict where both sides changed
   the same entry or lines. And since the stop leaves unrecorded what the landing took in
   (`spec-projection-substrate.md` § 3.6), a save made in the file before that run, by any editor, merges against a base
   older than the landed edit and can undo any change it makes back toward that base: putting back text the landed edit
   added and the save removed, or removing again text the landed edit removed and the save restored.
7. **A notice that lags.** A protected file's notice can name an owning checkout, or `arc materialize`, that a release,
   promotion, or materialize in another worktree has since made wrong, until that file's record next changes, a primary
   re-lay rewrites it, or a reprojection (§ 10.4). The notice is advisory, and the persist refusal behind it names the
   current place.
8. **A stored hunk placed on the wrong lines.** Placement's check let none through at write time; of the clashes later
   edits left untouched, at most 0.35% after twenty edits; and of those a later edit touched, 1 of 65, 5 of 297, and 10
   of 1,049 — a line merge's own order of residual (§ 6.3).
9. **A hand-typed entry landed twice.** A command stopped after a write lands and before the index records it, whose
   file is then edited again before the next command, sends the entry with new content, so it takes fresh IDs, from the
   backend's stamp or the checkout's, and lands a second time (§ 7.1): both copies show in the file, and nothing is
   lost. An entry in a file not rewritten since it landed — a buffer that never reloads, or a file the replace guard
   holds (§ 6.4) — likewise takes a fresh ID at its next write-back once the person edits its heading, or edits its
   body while another entry shares its heading; where another writer edited it under its landed ID in between, both
   copies stay and no conflict is filed (§ Spike 5).
10. **Another process scope.** Where two process scopes share a checkout — WSL and Windows, a container's bind mount, or
    a Linux process that cannot read its PID namespace, whose scope is its own (`resolveProcessVisibilityScope`) — an
    aside copy one writes waits, reported, for a sweep from that scope or a removal's or release's takeover
    (`spec-projection-substrate.md` § 5.4), and a holder in the other scope that crashes keeps the projection lock until
    its lease lapses, up to 120 s (`ADVISORY_LEASE_DURATION_MS`), commands in the checkout running as under the skip
    switch meanwhile and the persist and release steps refusing with a retry (`spec-projection-substrate.md` § 3.2).
    Under the per-process fallback no other process shares the scope, so a copy waits for a removal's or release's
    takeover alone, which in the primary may never come, and a staged file, holding no edit, goes only with a linked
    checkout's removal or release, staying in the primary until it is deleted by hand. Nothing is lost but item 2's
    exposure, which lasts while the copy waits.
11. **A copy whose path has moved on.** A save that lands in an aside copy is taken in only while the copy's path has
    not moved on — still holds what its swap linked, or is absent, and no write-back of it has been sent since the swap
    (`spec-projection-substrate.md` § 5.2). The swap's own first check takes in a save timed into the window at once, so
    a copy is kept only where its path moves on before the copy's edit is taken in: a save opened before the move writes
    into the copy after that check, or that check's take-in is deferred or left pending (§ 7.8), and the path changes
    before the copy is read again, at its writer's second check or, where that writer stopped, the next command's sweep
    — by a later save there, a write-back's read-back, or another replacement; or a save lands at the path, or recreates
    it, before the first check; or another copy of the path is taken in or linked back first. While its path has moved
    on, it is kept, reported with its path, and never merged, since an older save from the same buffer and another
    editor's concurrent edit cannot be told apart (§ Spike 7); the person copies out what they want and deletes it, and
    removal and release refuse until then, unless the path becomes absent with no write-back sent since the swap, where
    the sweep links the copy back. It needs a save timed into the swap's window (§ Spike 1b) and a change to its path
    before the copy's edit is taken in.

### 18. Expected contracts

This design consumes behavior other changes build. The three it depended on — `seam-lifecycle`, `seam-locus`, and
`storage-ref-backend` — have shipped, as have `seam-decomposition`, `seam-status-roadmap`, and
`projected-markdown-checks`; the members whose work observes `storage-ref-hardening`'s fixes wait for it (§ 1.1). Each
other is an expected contract, available when its change lands, and what holds until then is stated with it.
`projection-substrate` is on base when this member starts, by its `Depends On`, and `projection-worktrees` lands after
it; their entries come first.

- **`projection-substrate`** (`spec-projection-substrate.md`, planned; this member depends on it, so it is on base when
  this member starts): the engine's state and the files it writes, which write-back reads and records into —
    - the index (its § 3.1): per file, the record reference, the stat and file identity, the blob id the projection last
      wrote, the base's blob id and record version, the marker, notice-line, and unshown-conflict fields, the protected,
      changed, pending, withheld, and refused marks, what the last persisted write-back read, a stampless file's
      in-progress record, and each aside copy's record; written by temp-and-rename under the projection lock, in the
      worktree's Git directory;
    - the projection lock (its § 3.2): per worktree, leased, and not reentrant, a command holding one at a time; a start
      waits its 10 s bound, and a lost lease ends the worktree's operation at its next step;
    - the racy rule, blob ids in the repository's object format, the record version a write sends as its expected
      version, and base-stamp recovery with its `history` reads (its § 3.3–§ 3.5); and the content a persisted
      write-back took in, kept as a copy where the store never held it, from which a stale buffer's save merges (its
      § 3.6);
    - the one entry-ID matcher, which write-back's ID restore calls (its § 3.6; § 7.1 here);
    - the settle rule (its § 4); and the replace guard, the swap and its second check, the aside folder and its sweep,
      rebuilds, and the removal swap (its § 5), each handing an edit to the take-in port, which this member binds to
      write-back (§ 2.1 here): given the worktree whose file holds the edit, whose rights apply; the path or the aside
      copy; its index entry; and its base — the stamp, or, for a stampless file, the base blob id the copy's name
      carries — write-back answers `no-edit`, `taken-in`, `deferred`, `refused`, `unparseable`, `clashed` for an edit
      that merged in the checkout and clashed (§ 7.7 here), or `pending`, and before each send records beside the path's
      other aside copies that a write-back has been sent since their swap (its § 5.1, § 5.2);
    - the one configuration read, which returns the identity, the in-flight view setting, and the object format, and the
      no-identity verdict (its § 15.3);
    - the exclude writer's path list, which the editor settings take (its § 11.1; § 11.4 here), and the test store
      wrapping the reference backend (§ 1.5 here).
- **`projection-worktrees`** (`spec-projection-worktrees.md`, planned; it depends on this member):
    - fills the start's refresh, the fan-out, and materialization, which stay slots here, inert until it lands: the
      refresh brings a worktree up from its index's state version through `changes`, the fan-out refreshes every
      worktree on the machine that holds a projection once a write lands, and materialization writes every projected
      record (its § 2.2, § 2.5, § 15.2);
    - decides which checkouts hold a projection, until when a checkout holds one exactly when it holds an index; and
      rebuilds a worktree with no usable index, withholding every file it cannot read safely — a withheld file is never
      sent, and its remedy is to copy out what is wanted and delete it, which releases it (its § 2.5);
    - builds the removal slots, which keep their passing defaults until it lands (`passingProjectionRemovalSlots`,
      `lib/git/worktree-removal.ts`), so the removal function runs its Git part alone: the removal check reads
      adoption's verdict without minting (§ 9 here), and the persist and release steps run write-back's read path over
      every projected root, `completed/` included, pulling and retrying once a refusal naming a missing history ref
      (§ 7, § 8.4 here; its § 12.2, § 12.3);
    - reprojects what a changed `layout.active` value, view setting, identity, or checkout claim governs, against the
      values the index records (§ 10.3, § 10.4 here; its § 10.3, § 10.4), so until it lands nothing reprojects;
    - sets the changed mark a verb's write leaves through its fan-out, carries it with its record when a refresh moves
      the path, and sets it on every file at a rebuild with no usable index, so until it lands `--changed` holds hand
      edits alone (§ 11.7 here).
- **`seam-lifecycle`** (`spec-seam-lifecycle.md`, shipped):
    - pause replacing park (§ 8.1), `arc materialize` widened (§ 8.4), `Owner` verb-owned and changed by `arc handover`
      (§ 8.5), and no verb reopening an archived work unit (§ 8.7);
    - `task-list.close`'s remedy naming the close verb as text (§ 9.4), which write-back reports (§ 2.2 here).
- **`seam-locus`** (`spec-seam-locus.md`, shipped):
    - the current work unit resolved from the checkout marker plus the store, the layout resolver's address for an
      identity's personal root, and session-init's slot paths and the compaction seed's taken from the layout resolver
      (§ 2.1, § 4.9) — before `active/current/` lands (§ 10.2);
    - the layout classifier inverting `resolveArcPath` over every registered file address, which write-back and
      adoption read (§ 3.3);
    - the paused-work slot's action and the materialize offer (§ 4.4, § 4.5);
    - the flat work-item path, `workItemArtifactPath` (`lib/store/lifecycle-storage.ts`), which `lifecycleArtifactPath`
      calls and to which this member adds the checkout root (§ 10.2 here);
    - the entry grammar the inboxes, a work unit's inbound list, an Errand's description, and the Errand queue share,
      each kind's parser admitting its fields (§ 6.1, § 6.3), which write-back's entry merge and ID restore read (§ 7.1
      here);
    - the store `preparePersonalIdentitySetup` opens for `runPostInitSetup`, bound to the identity being set up (§
      10.2), which it returns only where state is off-branch and returns null otherwise, so `arc init` and `arc join`
      read the capability from a prepared setup before printing the Zed setting (§ 11.4 here).
- **The record kinds** (`spec-seam-record-kinds.md`, shipped): `WriteCheck` and its input (§ 3.1), which later members
  widened — `observations`, `before` answering `history`, a verb writer's optional `lifecycleAction`, and optional
  `proposedCreatedOwners` (`WriteCheckInput`, `lib/store/write-check.ts`; § 7.2 here) — the writer derivation and
  `HAND_EDIT_VERBS` (§ 3.2), and the production registration set (§ 2.2), which composes ARC's link rules into every
  projected kind with a ref family but the Errand queue (`composeLinkChecks`, `lib/store/kinds/registrations.ts`;
  § 7.6 here). The seam's members fill each kind's parser and write check as they reroute its family; until a kind has
  its own rules, its files persist checked for links alone, as D5 lets a contract `write` land.
- **The ref backend** (`spec-storage-ref-backend.md`, shipped):
    - a companion keyed by a managed path — `work-item/companion` keyed `path` in `KIND_SHAPES` (`lib/store/catalog.ts`)
      — a key `SlugSchema` admits stored as `<key>-<slug>.md`, a paired spec's halves as `spec-<slug>-prd.md` and
      `spec-<slug>-rfc.md`, and any other key verbatim among the work item's records, keeping its path through a rename,
      its codec reading an entry no other kind's form claims as a companion keyed by its path (§ 2.5, § 3.2); a verbatim
      key refused `unsupported` `unhomed-kind` where the decode would read its path back as another reference or as
      `key-mismatch` — at the root, a name `<key>-<slug>.md` whose key `SlugSchema` admits, a paired spec's half's name,
      or a kind's fixed form under another owner, judged after the owner resolves against its current slug, so a
      literal name under a former slug is a path key (A10) — at any root name matching `^metadata-[0-9a-f-]{36}\.json$`
      or under one (`isOwnerMetadataName`, `lib/store/ref/metadata-filename.ts`; A57), at or under `review`,
      `state-<uid>`, `conflicts`, or `receipts`, or at a folder another record's path runs through or the reverse, and
      refused under `store.git-path` where a segment is one Git refuses or runs past 4,096 bytes, as for a personal
      document (§ 2.5, § 5.6; A5), which § 10.1 here lays out and write-back reports as a refused edit (§ 7.6 here), its
      change to D2 recorded there (§ 2.6; § 16.3 here);
    - the record version as the compare-and-swap basis beside the content's blob id (§ 3.4), and `history`, which the
      reads `spec-projection-substrate.md` § 3.5 lists make;
    - a stale expected version on a merge kind merged from that version, its conflict records committed under `merge`,
      its merged content parsed, a repeated `_Id:_` refused, and a put naming an open conflict in `resolves` never a
      no-op (§ 5.1, § 5.2, § 5.5), each held by its suite item (§ 14.2);
    - each side's label from the `Arc-Actor` trailer, and a hunk conflict record's `baseVersion`, `currentLines`, and
      `incomingLines`, with `MergeTextInput`'s base version (§ 3.7, § 2.6);
    - entry stamping seeded by the put's reference, expected version, and content, and an entry kind with no declared
      grammar refused `unsupported` `unhomed-kind` (§ 5.1), a retried put stamping the same IDs held by its suite item
      (§ 14.3);
    - `checkSerializationRules`, exported from `lib/store/` (§ 5.6), which the removal check's projection part calls;
    - a write to a completed item refusing `state-unresolvable` where this clone lacks the item's history ref, and
      `pull({ history })` fetching that ref by name (§ 7.3, § 4.5), which `arc save` and the persist and release steps
      run and retry once through the shared history-retry helper (`pullHistoryForRetry`,
      `lib/store/pull-consumption.ts`) where the refusal names a history ref, as `runStoreRename` does
      (`lib/work-unit/verbs/rename-store.ts`; § 8.4 here); a write refusing `state-unresolvable` with no history ref —
      an unreadable captured object, or an anchor naming a state version this clone cannot resolve — takes no pull (§
      7.8 here);
    - history entries that may carry a `creationReceipt` (`HistoryEntrySchema`; A23) and history refs naming their owner
      by the lowercase UID stored names carry (`HistoryRefSchema`; A41, A43), which the test store wrapping the
      reference backend returns in those shapes (§ 1.5 here);
    - the reference backend refusing `state-unresolvable`, implementing `pull`, refusing a primary's put without
      placement, and parsing a stale base's merged content (§ 14.2), which the gate here exercises (§ 1.5 here).
- **`seam-status-roadmap`** (`spec-seam-status-roadmap.md`, shipped): the conflict view,
  `arc status --conflicts [<conflict>]` (`handlers/status/conflicts.ts`), showing each open hunk, entry, or whole-record
  conflict's subject, both sides' labels, and both sides' content, which a conflict shown without markers points to
  (§ 6.3 here), and refusing `unsupported` before the flip; the conflict token it prints and parses
  (`formatConflictToken`, `parseConflictToken`, `lib/status/conflict-token.ts`), which the notice line and
  `arc save --resolve` share (§ 6.3, § 6.5 here); `arc view`'s callers of the work-item path, which this member
  converts to the checkout-rooted signature (§ 10.2 here); and from the flip no derived view rendering as a file
  (Owner, 2026-10-16), so `STATUS.USER.md` and a pre-cutover `ROADMAP.md` are leftovers adoption skips (§ 9 here).
  Conflict records never project as files (`projection: "never"`, `lib/store/registry.ts`).
- **`seam-decomposition`** (`spec-seam-decomposition.md`, shipped): the retiring verbs' removal decisions through
  `checkRetiringCheckout`, its own retirement among them (`lib/decompose/retirement-checkout.ts`;
  `spec-projection-substrate.md` § 12.5), and the source-conflict refusal's one remedy,
  `DECOMPOSE_SOURCE_CONFLICT_REMEDY` (`lib/decompose/source-conflicts.ts`), which names `arc save --resolve <token>`
  once `save` registers `--resolve`, held by its integration test (its § 18; § 6.5 here).
- **`projected-markdown-checks`** (`spec-projected-markdown-checks.md`, shipped; no edge either way): the `selection`
  check mode and its one reader, `readProjectedSelection` (`lib/checks/projected-selection.ts`), which returns an empty
  list until this member connects it (its § 4.6; § 11.7 here), and `lint:md:fix` over Git's Markdown list plus the
  selection (`src/scripts/fix-markdown.ts`), which this member leaves as it is.
- **`storage-ref-hardening`** (planned; the second member depends on it, § 1.1): the listing scope, the fault classes
  and remedies for missing or misplaced objects, and the sweep of the pull results' consumers, which write-back, the
  refresh, the fan-out, and the persist and release steps observe (§ 7.8, § 8.4 here, `spec-projection-worktrees.md`
  § 15.2, § 15.5). It is expected to keep two fault classes, recoverable `state-unresolvable` and terminal
  `namespace-corrupt`, and to add no refusal code or result field, while it may move a site from one class to the other
  and change which refusals name a history ref. Since § 7.8, § 8.4, `spec-projection-worktrees.md` § 12.2, and § 15.2
  key their handling on the code and on whether a refusal names a history ref, each member re-grounds those of them it
  carries against it as shipped, at its activation once `storage-ref-hardening` has shipped. A listing-diagnostic kind
  it adds is one more diagnostic `spec-projection-worktrees.md` § 15.2's listing rule reports, projecting no file. The
  history-retry helper § 8.4 names is the one it leaves.
- **`storage-cutover`:** the flip and its first full materialization; a quiesce that locks every work-item worktree
  still unlocked (`spec-projection-substrate.md` § 12.7); projected roots that hold, from the flip, no tracked file and
  no file ARC installs — the shared roots' files untracked once their records are imported, and the installer writing
  nothing into a projected root (`lib/classification.ts`): not `completed/README.md`, which no record claims, so it
  stays unadopted and refuses every removal (§ 9, `spec-projection-worktrees.md` § 12.2), nor the `backlog/` inbox
  template, which installs at the path the projection writes the project inbox to (`lib/layout/projection.ts`), so an
  install there writes over a projected file, while the ROADMAP template's install entries leave in the flip change; the
  live rehearsal, which confirms every hand-editable projected kind has its parser and every entry kind its entry shape;
  the flip's workflow rewrite, which names `arc save` where workflows name `arc user save`
  (`spec-projection-substrate.md` § 12.6); the deletion pass, which removes the user-surface rooting and its migration
  (`spec-projection-worktrees.md` § 12.8); and the documentation pass, which rewrites `strategy-work-organization.md`
  § Per-Worktree Isolation and its acceptance test (`spec-projection-worktrees.md` § 10.5) and moves
  `archive-work-unit`'s errata convention onto the store's history (§ 8.4).
- **`config-storage-architecture`:** the per-developer tier, to which the in-flight view setting moves (§ 10.4), and the
  move of the checkout marker, the pristine store, and the generated schemas from `.arc/system/.internal/` into
  `.arc/system/.local/` (`spec-projection-worktrees.md` § 12.9), after `seam-locus`'s marker work lands.

## Alternatives & Rationale

- **A file watcher or a daemon — rejected.** Watching pays only in a long-lived process, and Git's `fsmonitor` is built
  for monorepos of hundreds of thousands of files (Chromium's 393,000: `git status` from 17.6 s to 0.83 s). A snapshot
  at the start of every command, jj's model, meets the budget at this repository's size (`spec-projection-worktrees.md`
  § 15.3), and the command-start tripwire would show the need first (`spec-projection-worktrees.md` § 15.4).
- **One copy per machine — kept in reserve, not built.** D13 makes it a fallback no caller sees, and nothing yet
  triggers it. Its tripwire is a fan-out's time, after parallel writes on Windows (`spec-projection-worktrees.md`
  § 15.4).
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
- **jj's ignore-shorter marker parse — rejected** for exact-length parsing, which a longer run added while resolving
  cannot confuse, with D13's refusal of malformed markers over jj's degrade-to-text (§ 6.1).
- **A personal revert key — rejected.** Docs, workflows, and agents reach paths through the layout resolver, and a
  personal key would let two people's instructions point at different paths (§ 10.3).

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
  content and enforce the authority rules however the edit arrives (§ 7). Write-back sets its provenance itself, never
  from the file (§ 7.4), and the serialization rules refuse binary content, oversized records, `.env` files, and private
  keys (§ 7.5).
- **Ignore integrity.** The guard keeps every projected path ignored, `.arc/user/*/` in `.gitignore` itself, so no
  packaging tool ships personal state (`spec-projection-substrate.md` § 11.2).
- **Performance.** The no-change budget is 10 ms on Linux and 60 ms on Windows, with three tripwires measured in place
  (`spec-projection-worktrees.md` § 15.3, § 15.4).
- **Testing.** Unit and integration tests over the reference backend with real repositories and worktrees, on Linux and
  in the portability lane, the rebuild and a pull's fan-out among them (`spec-projection-worktrees.md` § 1.5), and the
  refusals the reference backend cannot return, the history pull among them, through a test store wrapping it (§ 1.5);
  the isolation test (`spec-projection-worktrees.md` § 10.5); the `after` view's conformance case (§ 7.3); the
  multi-process lane over the ref backend (`spec-projection-worktrees.md` § 1.5); and the live verification of the lock
  before the flip (`spec-projection-substrate.md` § 1.5). Every typed refusal here — the guard's, a refused edit, the
  removal check's `persist-would-refuse` and `unobservable`, the persist and release steps', a start that cannot take
  its lock — is tested both refusing and succeeding once its condition is repaired.
- **Rollout.** Dark until the flip but for the worktree lock, ARC's managed `.ignore` block, and this repository's
  `.gitignore` line (§ 1.4). The lock lands last in the first member, after both seam members
  (`spec-projection-substrate.md` § 12.5), and this repository's existing worktrees take it as they are respawned,
  `storage-cutover` locking any left (`spec-projection-substrate.md` § 12.7). `storage-cutover` runs the first full
  materialization at the flip.
- **User-facing impact.** From the flip, files under `.arc/` are a working copy of the store, saved at the next `arc`
  command or by `arc save`. Protected files say so where they are read (§ 8.2); conflicts show in the file, or as a
  notice line resolved by `arc save --resolve` (§ 6); and write-back's report reaches stderr ahead of a command's own
  output (§ 2.2). Before the flip, a spawned checkout the projection locked refuses a plain `git worktree remove` with a
  reason naming the exits (`spec-projection-substrate.md` § 12.1), session-init and `strategy-concurrent-work.md` name
  those exits (`spec-projection-substrate.md` § 12.6), and search tools in the ripgrep family find `.arc/user/*/`
  (`spec-projection-substrate.md` § 11.3).

## Success Criteria

1. **A hand edit reaches the store.** Over the reference backend, with real repositories and worktrees on disk, on
   Linux and in the portability lane, a hand edit — saved in place, by renaming a new file over it, or by an agent's
   write — reaches the store at the next `arc` command, but for the residuals § 17 names.
2. **Conflicts show in the file and persist once resolved.** A clash with a stored base lands as a conflict record,
   and the writing checkout's read-back draws it in: markers where placement's check passes — at the escalated
   length with the resolve-by-hand line where the file holds a marker-like line — a notice line where it fails or the
   conflict is whole-record, and, in a file with no stamp, status and the refusing verbs alone; a file the replace guard
   holds whole, for a malformed set or a resolution in progress, shows them in write-back's report and status until it
   is released, then draws them. A hand resolution of markers persists naming the conflict, `arc save --resolve`
   resolves a conflict shown without markers, keeping the store's side included, and refuses while its file is held,
   untouched markers keep a conflict open, and malformed markers refuse that entry, or the file for prose. A clash with
   no stored base stays in its file as markers and persists as an ordinary edit once resolved.
3. **Write-back checks every edit.** Write-back and `arc save` send each edit through its kind's parser against its
   base's record version, under `write-back` or `save`, and the store's merge and write check decide it; a change to a
   verb-owned field is refused and stays in its file; one refused edit blocks no other; each store refusal is handled as
   § 7.8 states; and the `after` view's conformance case passes over each backend that runs checks.
4. **Nothing an edit could lose is dropped silently.** An edit to a protected or archived file another person owns, an
   unadopted file, a file that fails to parse, a refused edit, a file held by a conflict, a clash found in the checkout
   included, and a file not yet settled each stay in their file and are reported, as an aside copy kept because its path
   moved on stays in the aside folder, reported with its path.
5. **The paths hold.** Every projected path resolves through `resolveArcPath` and back through the classifier, under
   `layout.active: flat` as under `nested`; and every work-item path a caller reports, resolved from its checkout root,
   names the path § 10.1 lays its file at.
6. **Dark before the flip.** Over the in-repo implementation the root hooks do nothing, `arc save` and `arc editor`
   refuse `unsupported`, `arc selection` prints an empty list, and `arc init` and `arc join` print no Zed setting.
7. **The selection holds.** `arc selection` prints the projected Markdown files the checkout may edit, leaving out
   `completed/`, protected files, files holding conflict markers, and the personal `.internal/` and `scratch/`;
   `--changed` prints those the checkout changed by hand since its last `arc save` under § 11.7's rules; and the
   Markdown checks' reader returns what the command prints.
8. **The quality gates pass** at every gate the project declares.

## Open Questions

None blocks starting. The expected contracts in § 18 each state what holds until their change lands, and none leaves
this design open.

## Amendments

None.

---
