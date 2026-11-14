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
  copy a rebuild with no usable index left as it was, which nothing writes over or sends until the person deletes it,
  but for a held file, which a later rebuild settles (§ 2.5, A7); and an edit made in this checkout since its last `arc
  save` (§ 11.7).
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

   _Amended by A4:_ the numerical budgets are superseded by § 15.3 and criterion 11; archive independence remains.

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
  second source plugs into, and what a read-only source adds — its own state version in the index and its files'
  protection — comes with that source (§ 14);
- **move the checkout marker, the pristine store, or the generated schemas out of `.arc/system/.internal/`**
  (`config-storage-architecture`; § 12.9);
- **change what `.worktreeinclude` copies**, which already leaves out the projection's paths (§ 11.6);
- **narrow which of `backlog/`'s or `completed/`'s records a worktree projects, or lay archived files read-only**; both
  build over the index's partitions without reshaping them (§ 3.1).

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

**Why this member stays whole.** At task generation this specification ran about 1,750 lines and its task list about
1,470, its change set forecast from the first two members' at about 15,000 lines with its tests, past all three marks.
The one cut its design suggests, the removal slots and the release step (§ 12.2, § 12.3) with the user surfaces in every
worktree and the machine-local paths (§ 12.8, § 12.9), consumes the binder for any worktree, the index reader, the lock
wrapper, and the fan-out, whose contracts were shaped around it: the binder's read-only form serves the removal check,
and the fan-out skips a checkout the persist and release steps mark retiring. A cut would let that part be built only on
a branch stacked on this one once those pieces land, never beside it, and it would land after this one either way. The
Owner kept the member whole (2026-11-07): its change set is reviewed in the four chunks § 1.3 orders, each in one pass
with a review of the seams between them, as the first member's change set, about 12,000 lines, was reviewed in its
chunks.

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
  `write`, `batch`, and the ref backend's `pull` and `push`, so each landed write and each pull's merges fan out, but
  for an edit the command's end takes in (§ 2.2).
- **`arc sync`** — rebuilds deleted projected files (§ 2.4).
- **The spawns of a work item's checkout** — a full materialization once the marker is written, before the worktree
  lock, through the materialize port the root hook binds (§ 2.5).
- **`lib/store/registry.ts`** — the three machine-local `MACHINE_LOCAL_PATHS` entries in `.arc/system/.internal/`
  (§ 12.9).
- **Tests** — unit and integration tests over the reference backend; the isolation acceptance test (§ 10.5); a
  regression test holding the `.worktreeinclude` copy off `.arc/` (§ 11.6); and the multi-process lane over the ref
  backend (§ 1.5).

#### 1.3 Review chunks and their order

This member lands as review chunks on its own branch, in this order, each chunk with tests of its own code that need no
later chunk's, and a test that also needs a later chunk's code landing with that chunk; `cohort-storage-projection.md`
records every member's:

1. **The engine's state in any worktree** — which checkouts hold a projection (§ 2.5), the index's header and partitions
   (§ 3.1) with § 16.2's amendment of the index and § 16.3's of edit rights and of the start's index read, and the
   binder for any worktree (§ 2.1, § 14).
2. **Refresh, materialization, and fan-out** (§ 2.2, § 2.5, § 15.2) — the start's refresh of what the store changed,
   over the index the start holds from its sweep (§ 15.3), protection read once per round (§ 15.5) with § 16.3's
   amendment of a refresh's protection, a full materialization and the rebuild with the checkout's scratch folder
   (§ 12.9), the `createStore` wrapper and the fan-out, the changed mark a verb's fan-out sets (§ 11.7), reprojection on
   a changed view setting, identity, claim, or `layout.active` (§ 10.3, § 10.4), `arc sync`'s rebuild (§ 2.4), the
   isolation test (§ 10.5), and the `.worktreeinclude` copy's regression test (§ 11.6).
3. **The budget and the tripwires** (§ 15.3, § 15.4, § 15.5), with the start's order, § 16.2's amendment of the lease
   steps' confirmation and § 16.3's of the end's lock, the tripwire suite, and the multi-process lane's bursts (§ 1.5).
4. **The removal slots and the release step** (§ 12.2, § 12.3), with the fan-out's skip of a checkout they mark retiring
   (§ 2.2), the multi-process lane's saves into a persist step (§ 1.5), the user surfaces in every worktree (§ 12.8),
   and the machine-local paths (§ 12.9).

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
  each hook fails. A save that meets another process's landing between its preparation and its admission is refused
  as a `version-conflict` carrying `cause: "projection-admission"` and left pending (`spec-projection-write-back.md`
  § 7.8), which the lane counts as pending, its edit kept for the next command, never as lost.
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
lock (`spec-projection-substrate.md` § 3.2), the fan-out's rounds (§ 2.2), the command's `history` memo
(`spec-projection-substrate.md` § 3.5), beside which the persist and release steps each read through one of their own
(§ 18), each checkout root's claim and effective `layout.active` (`spec-projection-write-back.md` § 10.1), and the ports
the root hook binds — the take-in bound to write-back, the edit-rights function, adoption's mint, and materialization. A
process whose root hook never ran, a script or a test that binds nothing, fans out nothing, and each sibling refreshes
at its next command.

#### 2.2 One command, in order

##### The fan-out

- **The fan-out.** The store `createStore` builds (`lib/store/create.ts`), the one place every caller's store is
  composed, wraps `write`, `batch`, and the ref backend's `pull` and `push`, which replace today's `sync`
  (`spec-storage-ref-backend.md` § 2.1), so a pull's merges, which land with no `write` (its § 6.4), fan out too, as a
  push's do, since its loop pulls first (its § 2.1); a pull or push fans out after every call whatever its outcome,
  since a refused or timed-out call may still have merged. Once a write lands, the writer refreshes every worktree on
  the machine that holds a projection, its own included, which it finds from its own root rather than from Git's list,
  taking each one's projection lock in turn and bringing each up from that worktree's own state version, never only its
  own write. The order it visits them in changes nothing it lays: each is brought up from its own state version, a
  round's reads are shared by every worktree in it, and a write landing during a round reaches every worktree in the
  next (§ 15.5).
- **A write, pull, or push made under a projection lock** — write-back at the command's start, the persist and release
  steps, a stub minted during adoption, and a history pull a retried read makes for an ended item there
  (`retryEndedItemHistory`, `lib/store/history-retry.ts`) — fans out once that lock is released, since the lock never
  breaks for its own holder (`isMainLockBreakable`, `lib/advisory-lock.ts`); the command's start fans out once for all
  its write-backs and pulls, whether or not it took an edit in. The command's end is the exception: an edit its second
  check takes in (`spec-projection-substrate.md` § 5.2) gets no fan-out of its own, and the other worktrees take it at
  their next command start or the next fan-out, whichever comes first (§ 17). A write landing during a fan-out — a
  take-in in a sibling's refresh, a stub minted by adoption — joins that fan-out's next round rather than starting
  another.
- **The creation batch of `arc start --new`** — the scaffold batch both creation paths commit before they stamp the
  checkout marker's UID (`completeCreatedWorktree`, `commands/start.ts`; `commands/start-cold-store.ts`;
  `stampCreatedWorkUnitMarker`, `lib/work-unit/created-work-unit-marker.ts`) — fans out once that stamp has run, through
  a hold of its own that, unlike a lock's, leaves the batch the verb's own write (§ 11.7), so this process lays no
  worktree's copy of the new work unit's meta while the marker naming it is unbound, and a render another process makes
  in that window is reprojected in the claimed worktree once the UID is bound (§ 10.4) and lags elsewhere as § 17 item 7
  says; where the stamp refuses, the fan-out still runs, and the marker it leaves is the repair state § 16.3 names.
- **What a fan-out reads.** It lists the machine's registered worktrees, detached ones included
  (`scanRegisteredWorktrees`, `lib/git/worktree-roster.ts`, one `git worktree list` call), skips one whose listed path
  holds no `.git`, or whose aside folder holds no reference stamp (`spec-projection-substrate.md` § 3.3, § 5.4) — Git
  lists a primary whose `.git` is a `gitdir:` file at its Git directory, or at that directory's parent where it is named
  `.git`, a folder no projection was laid in — leaving it to that checkout's own next command, reads the index header of
  each one that holds a projection for the state version it last projected (§ 3.1), then, in each round, reads
  `version()`, asks `changes` once per distinct state version among them, normally one, and makes each read and listing
  its refreshes need once, every worktree's refresh in the round reading through one memo of those answers. Each file it
  lays takes its protection from the same memo and from the round's one listing of the worktrees, which the holder and
  markerless searches take as an input, so a file's protection reads nothing per worktree but the claim of a worktree
  whose marker names the file's own work unit (§ 15.5, § 16.3). Under each worktree's lock it reads the index again and
  skips the worktree when that state version changed since — another refresh reached it first, so it may already be
  newer, and state versions carry no order to tell (`StateVersionSchema`, `lib/store/identity.ts`). Before skipping an
  already-current writer's worktree or one a spawn materialized earlier in this command, a set `reprojectionPending`
  flag runs its reprojection comparison instead (A2). Other already-current worktrees are skipped, as is one whose state
  version no longer resolves or, other than the writer's, is unset, which that worktree's own next command rebuilds
  (§ 15.2, A7). Under the same lock it reads the worktree's claim and effective `layout.active` fresh; a worktree the
  command already holds a root for — its own, a sibling an earlier round or fan-out visited, or a worktree a spawn
  materialized earlier in the command — is not bound again, its claim and layout re-read into that root, whose aside
  copies the command's end still checks, and the comparisons below use the command's values whatever read bound it. The
  persist and release steps hold no root of their own, so the end never checks a checkout they retire and neither
  replaces a root the command holds; a copy either leaves, on a refusal or from its last check, is settled by the
  target's next sweep or the retry's takeover (§ 12.2, § 12.3). A checkout the command moves while it holds a root there
  — `arc rename` moving a work unit's folder from another checkout, since it defers a move of the checkout it runs in
  and prints the move to run from outside it — has that root dropped and reported, since its bound reads and ports name
  the old path: the end checks nothing there, the copies the command left in it are settled by its next command's sweep
  like any copy a command leaves, and a later round binds it afresh at its new path. It skips a sibling where they, or
  the command's view setting and identity, differ from what its index records it was projected under
  (`ProjectionIndexSchema.projectedUnder`), or whose header carries `reprojectionPending` (A2), leaving either to its
  own next command, or where its index records no guard pass, or one under another ignore configuration than the
  command's (`ProjectionIndexSchema.ignoreGuard`), deciding this before any guard runs there, so no file is laid from a
  recorded claim and no guard runs on another worktree's basis; that worktree's own next command reprojects it (§ 10.4).
  The writer's own worktree is never skipped for a difference: a verb run there may have changed its claim, so it is
  reprojected in place before its refresh (§ 10.4), and the verb's changed marks land (§ 11.7). Nor is a worktree a
  spawn materialized earlier in the command skipped for a difference in its claim or `layout.active` alone, as the
  creation's stamp makes one by binding the UID (the creation batch above): it is reprojected in place before its
  refresh as the writer's own is, under the claim re-read into its root, and marks nothing changed (§ 11.7); a
  difference in its view setting, identity, or ignore configuration still skips it. A checkout this command's persist
  step is removing, or whose projection its release step removes, is skipped; the primary, whose release keeps its
  projection, is not (§ 12.3). A primary entry's re-lay lists its owner's records once per round of a fan-out, shared by
  every worktree (§ 15.2).

- **Fan-out keeps copies fresh and carries no correctness:** whatever it misses — a write through another tool, a
  process that stopped — each worktree's next command start refreshes, and an edit made to a stale copy merges through
  the store (`spec-projection-write-back.md` § 7.1). So a fault fanning out into one worktree — a marker or
  configuration it cannot read, a refresh that throws — is reported for that worktree and skips it, the fan-out going
  on, and the write it follows, which has landed, returns the store's result unchanged.
- **What a fan-out fences.** This member prepares no store write of its own: a fan-out, a full materialization, and a
  rebuild read the store and write only a worktree's files and index, and the store writes they cause are an edit's
  take-in, which write-back sends through its own prepared admission (`spec-projection-write-back.md` § 7.2), so a
  record landing between write-back's preparation and its admission is fenced there. The persist and release steps'
  store writes (§ 12.2, § 12.3) are likewise write-back's sends and adoption's, each content put admitted the same way;
  a stub adoption mints there is `arc stub`'s own transaction, which that admission does not fence and this member does
  not prepare (`spec-projection-write-back.md` § 7.2, § 9). Each local write is fenced by the
  worktree's projection lock and its state version: a round reads `version()` before its `changes` and listings, each
  worktree's index records that version, and under each worktree's lock the fan-out reads the index again and skips the
  worktree whose state version changed since, so a record landing after the round's reads is laid by its own writer's
  fan-out or by that worktree's next refresh, at worst laid twice, never lost. The index's own commit is its header,
  written last (§ 3.1). A take-in a refresh makes is handed the entry the refresh's swap built for that file
  (`TakeInRequest.entry`, `lib/store/projection/take-in-port.ts`), so a record landing for that file between the round's
  `version()` read and the take-in must be neither overwritten nor taken as the edit's base: the edit merges with it, or
  is held pending or in conflict, and the file then holds what the take-in left, never the round's version of the
  record.

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
it, where that checkout's own configuration yields none (§ 12.2, § 12.3); a spawned worktree whose own configuration
yields none, or another identity than the command's, is not materialized, its first command materializing it. The
identity comes from the one rule `lib/git/identity.ts` owns, applied to the values a configuration read returns: the
start's one read (§ 15.3); for a worktree a fan-out visits, the command's, or, for one the command already holds a root
for, the read that bound it, the fan-out comparing the command's values (§ 2.2, § 15.5); and for a removal slot's target
or a spawned worktree, that checkout's own, run there (§ 12.2), which finds a target whose identity differs from the
command's: the command's store reads and lists person-owned state under the command's identity alone
(`otherIdentityRefusal`, `otherIdentityRef`, `lib/store/ref/read.ts`), so such a target is refused (§ 12.2) or left to
its own first command. The command's read is the one `observeProjectionConfiguration`
(`lib/store/projection/command-configuration.ts`) holds for its checkout: the start's, whatever the start answered, or,
where the start made none — under the skip switch, with its lock held or lost, or its checkout gone — one made there on
first need; the fan-out binds with it, and the removal slots and a spawn compare their target's identity with its
(§ 12.2, § 15.5).

A **full materialization** writes every projected record, under the same replace guard and adoption rules as any refresh
(`spec-projection-substrate.md` § 5, `spec-projection-write-back.md` § 9): at spawn, into a worktree that has none, and
at `arc sync`, which rebuilds every deleted file. A spawn materializes through the materialize port the root hook binds
(§ 2.1): where the materialization fails, the failure is reported and the spawn completes, and where the spawning
process bound no port — a script, or a test that binds nothing — it materializes and reports nothing; either way the
worktree's first command materializes it, since this section gives it a projection and it holds no index. It first
writes the clone's exclude entries, once per clone (`spec-projection-substrate.md` § 11.1), and runs the guard before
writing into any root (`spec-projection-substrate.md` § 11.2), since on a fresh clone nothing ignores the shared roots
until those entries exist. It runs the guard through the ignore check a command's start runs (`checkIgnores`,
`lib/store/projection/ignore-check.ts`), and the index it writes records that check's result as the start records it —
the guard's basis (`ProjectionIndexSchema.ignoreGuard`) and the ignore files' records (`ignoreFiles`) — so a fan-out
later in the command does not skip the worktree as one with no guard pass (§ 2.2). The guard also requires the npm
policy at `.arc/user/.npmignore` (`spec-projection-substrate.md` § 11.2), which the installer writes into the checkout
it runs in, so a linked worktree holds it only where the repository tracks it, as this repository does from this change;
where it is absent the guard refuses every root, a spawn reporting that as a failed materialization and each command
naming the policy's remedy, which names committing the file the installer writes so every worktree of the repository
holds it. Into a worktree with no usable index (`spec-projection-substrate.md` § 3.1), it acts only where a file cannot
hold an edit, since without the index's marker map and stale-buffer state no rule reads one safely: a file at a path the
current projection lays a stored record at is refreshed where its blob id, its stamp set aside, equals its stamp's, or,
with no stamp, the stored content's. Every other file under a projected root — one holding markers or an edit, an empty
one, one mid-save, or one at a path the current projection lays no stored record at — is left as it is, written over by
nothing and sent nowhere, and the new index it writes marks it withheld (`spec-projection-substrate.md` § 3.1). A path
is one the current projection lays no stored record at only on § 15.2's positive evidence. Where a listing is not whole,
a read refuses, or a placement cannot be established, the rebuild holds every file at a path it lays no stored record
at: it withholds the file as above, under a held mark whose remedy is to resolve the condition reported with it and then
run any command from the checkout holding the file, or to copy out what is wanted and delete it, and the index takes no
state version (§ 15.2). A held file is a withheld file in every rule below, differing in its mark, its remedy, and the
settlement below; the removal check answers `persist-would-refuse` for it (§ 12.2), since the read that failed was the
rebuild's, not the check's. A later rebuild in that checkout, over an index whose state version is unset or no longer
resolves, settles each held file at a path it lays a stored record at by the rule above — refreshing it where it holds
no edit, otherwise withholding it under the ordinary mark — with no store write. Once a later rebuild's evidence is
whole, or a full materialization's, a held file at a path it lays no stored record at takes the ordinary withheld mark
and its remedy to delete it; `arc sync`'s, which lays only deleted files and takes no state version, leaves that to the
next start's rebuild. A link at or above a laid path, a path the checkout cannot write, or an arrival still handing off
leaves only that path to a later rebuild, each reported (A7). A file `spec-projection-write-back.md` § 9 never adopts
and a path `MACHINE_LOCAL_PATHS` lists (§ 12.9) are left alone, as write-back leaves them. Status and each command's
report name every withheld file, refresh and write-back skip it, but for a held file's settlement above, removal leaves
it at its path (`spec-projection-substrate.md` § 5.6), and the removal check and the persist and release steps refuse
over it (§ 12.2); the sweep before it withholds aside copies the same way (`spec-projection-substrate.md` § 5.4).
Deleting a withheld file, after copying out what is wanted, releases it: where the current projection lays a stored
record at its path its mark turns pending, so the next command's refresh writes it from the store (§ 15.2), and
otherwise its entry goes, nothing written there; the person re-applies their edit as an ordinary one (residual, § 17). A
linked checkout whose marker is released loses its projection once the release step has persisted its edits (§ 12.3). A
checkout this section gives no projection that still holds an index — its marker changed under it — is checked and
persisted as one it gives a projection (§ 12.2, § 12.3), so no index outlives edits not yet persisted, and its start
rebuilds an index it cannot use as in a checkout this section gives one (§ 3.1).

### 3. State and change detection

#### 3.1 The index

**The index's parts.** The index is a header and partitions. The header, `index` in `arc-projection/`
(`PROJECTION_INDEX_FILE`, `lib/store/projection/index-file.ts`), holds the format version, the state version,
`projectedUnder`, the optional `reprojectionPending` flag (A2, § 10.4), the withheld aside copies, the ignore records,
the tripwires, and a map from each root group to its partition's name — the SHA-1 blob id of the partition's bytes,
whatever the repository's object format — and to whether that partition holds an unsettled entry; it holds no entry. An
entry is unsettled when it is ownerless, or a record that names an aside copy or a kept taken-in copy, carries an
adoption, a pending or withheld mark, or a refusal, or holds a conflict notice it has not shown: the states a pass over
every entry looks for. A changed mark, which a rebuild sets on every file it finds (§ 11.7), and an in-progress mark
leave a partition unmarked, since only readers that load the partitions they need anyway, or read by path, read them. A
partition, a file `index-<blob id>` beside the header, holds the entries of one root group: `active/`, `backlog/`, an
identity's personal root, or one folder under `completed/`, a quarter's, a file directly in `completed/` taking a group
of its own. A write writes each partition it changed under its new blob id, then the header by temp-and-rename
(`atomicWriteFile`, `lib/fs.ts`), then deletes every partition file the header does not name, so the header is the
commit point, as Git's split index makes its shared index: a write that stops before its header leaves the last header
naming the partitions it was written with, and one that stops after it, or whose delete the platform refuses while
another process holds the file, leaves files the next write deletes. A reader reads the header, then only the partitions
holding the entries it reads or writes. A pass over every entry — the sweep's for the aside copies entries record, the
end's for the kept copies they name, the start's for adoptions to retry, and the status report — reads the partitions of
the roots its command walks and every partition marked as holding an unsettled entry, so a settled archive costs it
nothing; `arc save` and the rebuild a state version that is unset or no longer resolves takes (§ 15.2, A7) read every
partition, and the selection every one outside `completed/`, which it never lists. A write sets each written partition's
mark from its entries, and a partition is written only where an entry in it differs in value from what was read. To a
reader holding the worktree's projection lock, a partition that is missing, or whose bytes do not hash to its name,
makes the index unusable, as an unreadable index is (below), so a start that finds either rebuilds; a mismatch found
only when a command reaches the partition in its own worktree after its start's read — in the start's refresh, at its
end, or in `arc sync`'s materialization (§ 2.4) — ends that command's use of that index, as a lost lease does, and
deletes that partition, never the header, so the header goes on naming a missing partition: the next start rebuilds, the
removal check answers `unobservable`, and the header's withheld aside copies stay recorded, while a fan-out's visit that
finds one, to the writer's own worktree too, and the end in another worktree the fan-out visited skip that worktree and
delete nothing, leaving it to that worktree's own next command; one holding no lock, as the fan-out's first read, the
removal check, the status report, the selection, and the overlap advisory do (§ 2.2, § 12.2), first reads the header
again and starts over once when it changed, since a write it raced may have deleted what the old header named; a second
miss takes the reader's own answer to an unusable index and deletes nothing, the fan-out skipping the worktree, the
removal check answering `unobservable`, and the others answering as they answer an unreadable index. Every partition a
write writes takes that write's reference for racy stats (`smudgeRacyEntries`,
`lib/store/projection/change-detection.ts`); one it leaves keeps what its own write smudged, which stays correct against
a later reference. Every racy stat in a written partition is smudged, including a staged file awaiting installation
(A1): its next command hashes once rather than allowing a later reference advance to conceal a same-tick save. A
copy-mark-only publication smudges its changed partition against the existing reference without advancing that
reference. The codec is plain JSON: the schema (`ProjectionIndexSchema`, `lib/store/projection/index-schema.ts`), split
into the header's and a partition's, stays the writer's contract and the tests' check, which hold every header and
partition a write writes against it, and neither a read nor a write runs an entry through it, since the blob ids and the
format version already refuse what a stopped write or another build left; the schema's decode and encode are about three
quarters of the codec's cost on Linux (`notes-projection-worktrees.md` § Spike 4).

An entry whose path changes record identity retains the leaving entry and a non-nested arriving entry in its optional
`handoff` (A2, § 15.2). It stays pending and withheld until reconciliation confirms installation, so its partition is
unsettled and readers never need to load unrelated partitions to find the transition.

**The partitions' seams.** The root groups — one per root, `completed/` one per quarter — and the header as the commit
point are the index's fixed seams. A change to which of `backlog/`'s or `completed/`'s records a worktree projects, or
to how archived files are laid and edited, changes the entries a partition holds and the behavior laid over them, never
how entries are grouped, named, or committed.

**An index a command cannot use.** A worktree whose index is missing, unreadable, or of a format version other than the
running build's, where § 2.5 gives it a projection, gets a full materialization that writes over no file it cannot read
without one (§ 2.5), and so does one § 2.5 gives none that holds an index it cannot use, which § 2.5 checks and persists
as one it gives a projection. Fan-out and the end skip a worktree whose index they cannot read or whose format version
is not theirs, leaving it to that worktree's own next command, so one checkout's build never rewrites another's index in
a format that checkout cannot read; checkouts on different branches can run different builds. The removal check answers
`unobservable` for a target whose index is unreadable or of another format version, or missing where § 2.5 gives it a
projection, its detail naming the remedy — run the removal or release from that checkout, whose own build reads its
index or rebuilds it at its start — and the persist and release steps refuse with the same remedy. Where what they
cannot use is a partition that does not hash to its name, which they find by reading every partition, the remedy is
instead `arc save` run from that checkout, whose start reads every partition and so rebuilds the index, since a
command's ordinary start reads only the partitions it walks and those the header marks.

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
under, the claim's slug with the marker's UID, absent while the marker is unbound, which the binder's read of the claim
returns beside the layout context from the marker it already decodes (`readFreshCheckoutLayoutContext`,
`lib/store/checkout-layout.ts`), leaving that context's shape, which other readers take whole, as it is. A command that
reads a different one reprojects what it governs: views added, a file leaving a view through the removal path
(`spec-projection-substrate.md` § 5.6), the new identity's personal root laid on a changed identity, and `current/` with
the notices naming an owning checkout following a changed claim, since a release, a promotion, or a materialize changes
the marker without a store write, a bind that keeps the slug among them. The previous identity's personal root is left
as it is, its files neither removed nor refreshed by a reprojection or a refresh while the identity differs, since edit
rights and the writable roots answer for the current identity alone and the personal-root ignore pattern covers every
identity; the start walks it again once the identity returns. Until then the selection lists none of its files (§ 11.7),
and the removal check and the persist and release steps read it with the projected roots, an edit there one the edit
rights refuse, and the release of a linked checkout removes its unchanged files with the rest (§ 12.2, § 12.3).

During reprojection, `projectedUnder` acknowledges installed desired arrivals, rather than merely requested settings (A2).
Before a reprojection first changes the projected layout, publish `reprojectionPending: true` in the index header.
The optional flag is clear when absent. A command reprojects when that flag is set or when its current settings differ
from `projectedUnder`, using its fresh current settings even if they changed again after partial progress. Thus an
A → B → A claim or settings cycle with no store write still retries the mixed layout instead of treating equality
with the retained tuple as completion. The current root's fresh settings govern layout, edit rights, capture,
selection, and authorized roots; neither the pending flag nor the retained tuple grants authority under the previous
identity or claim. While any desired arrival is blocked or has an unconfirmed ownership handoff, keep the flag and
previous whole tuple: view, identity, claim, and layout. The reprojection publishes the new tuple and clears the flag
in the same header commit only once every desired arrival for the fresh target is installed and confirmed. Per-path
handoff reconciliation alone never clears the flag: it proves that path, not the completed target layout. Pending
removals still retain their leaving entries and ordinary retries.

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
path, and sets it at a rebuild with no usable index on every file the rebuild found on disk, since it cannot tell which
of those the checkout changed; a file the rebuild writes where none stood is unmarked, so a fresh worktree's
materialization marks nothing. The mark's rules, whole:

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
  (§ 15.2), and an index rebuilt with no usable index (§ 2.5) marks every file it found on disk until the next save. How
  often the save anchor moves is `storage-cutover`'s workflow rewrite to decide, so until a workflow saves per
  increment, the set spans the work since the last save.

The selection lists no file under another identity's personal root than the command's, which a changed identity leaves
(§ 10.4), since no edit there is sent while the identity differs.

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
until filled; this member fills them in `lib/store/projection/`. Each slot reads the target checkout's own configuration
— § 15.3's one read, run there — since its identity decides its personal root and edit rights, and the command's store
reads person-owned state under the command's identity alone (§ 2.5): for a target whose identity differs from the
command's, the check answers `unobservable` and the persist and release steps refuse, each naming the removal or release
run from that checkout, whose own store carries its identity. Only the fan-out binds a worktree with the command's
(§ 15.5). Every production composition of the removal check, the removal function, and the release takes them once the
capability is on, the retiring verbs' `checkRetiringCheckout` among them, so none falls back to the passing defaults
(`passingProjectionRemovalSlots`, `lib/git/worktree-removal.ts`). `lib/locus/primary-safety.ts`, which also reads only
`git status`, decides only whether the primary may host a transient claim — a branch switch that leaves the gitignored
projection in place and removes no checkout — and stays as today.

Verification distinguishes executable retirement from compositions whose current operations cannot invoke the slots
(A5). Verify teardown, Store abandonment and decomposition, and executor removal through behavioral refusal-and-repair
tests of their production contexts. Enforce slot presence statically at the direct start spawn, both rename move
directions, and legacy park/abandon compositions; inspect their resolved Store and command identity forwarding
separately. Test the factory's capability gating, identity authority, and mint-port lifetime through slot behavior.
Every production composition still binds the slots.

**Unindexed personal files (A6).** With state off the branch, a destructive removal also protects residual personal
files in an ARC-managed checkout that has neither a projection nor an index. A present marker whose ownership decodes as
`current` establishes this local ARC-managed scope, including husk-stamped, branch, and pending transient subjects; this
adds no ownership authority to the caller. An absent or manual-only marker adds no residual-data policy, while a
malformed or unreadable marker makes the observation unobservable. The rule creates no projection and resolves no
identity.

The new `observeUnprojectedPersonalFiles` in `lib/store/projection/removal-residual.ts` examines actual directories
immediately under `.arc/user/` and their descendants, irrespective of their names. It reports any regular file not
covered by the applicable `MACHINE_LOCAL_PATHS` rules (`lib/store/registry.ts`), naming its checkout-local path and the
remedy: recover the wanted bytes outside this checkout, remove the local residual, then retry. It never compares with,
reads, or writes a primary copy, adopts a file, or sends it to the Store. Editor backups and derived status files remain
covered unless the machine-local registry excludes them; the broader discovery exclusions are not this predicate.
Extract `isMachineLocalProjectionPath` from `isExcludedProjectionPath` (`lib/store/projection/discovery-exclusions.ts`)
without changing discovery's existing additional exclusions. Missing `.arc/user/` and empty or machine-local-only
personal directories pass. Enumerate without following observed symbolic links, including links at either root; their
external targets remain outside removal. A failed directory or file observation is unobservable, never evidence of
absence. The observer takes an injectable filesystem boundary for directory enumeration and `lstat`, defaulting to
native filesystem operations, so read failures are testable without changing caller authority.

`ProjectionRemovalSlots.check` gains an optional second argument, `"remove" | "release"`, defaulting to `"remove"`.
`checkWorktreeRemoval` forwards its existing `disposition`; `createProjectionRemovalSlots` forwards it to
`checkProjectionRemoval`. The residual observer runs only at the latter's unindexed/no-projection boundary on remove,
and runs there again during `persistProjectionRemoval`, before its no-projection success. Both observations precede
identity resolution and retain the current missing-folder and capability-off ordering. Thread a required internal
disposition through `withPersistedProjection` and its internal read-only recheck in `persistUnderLease`: persist selects
remove, release selects release. Release never runs this residual observer, since it retains the checkout; indexed
projection persistence and removal remain as specified below.

Spawn compensation observes the same rule before it can erase its ownership marker (A6). `rollbackSpawn` in
`lib/locus/provisioning.ts` receives the existing check through a required `checkRollback` dependency of
`ProvisionTransientLocusDependencies`. `createNodeProvisioningDependencies` takes the command-bound
`ProjectionRemovalSlots` and supplies its check; `openOrdinaryErrandAtRuntimeWithDisposition` binds those slots from
its resolved Store and identity, using the passing defaults when no off-branch Store is selected. Before compensation
removes an owned pending marker on a path that would roll back a created checkout, it runs that check in remove
disposition. It also checks before a physical rollback that has no owned marker to remove. A refusal, failed read, or
thrown check retains the marker, checkout and branch; existing pending-marker or marker-residue evidence keeps the
identity claim, and the reported setup failure includes the local recovery/read remedy. Repair requires recovering
wanted personal bytes outside the checkout and removing the residual, repairing the failed setup, then retrying the
same Errand open; the retained pending generation can resume through the existing recovery path. The primary copy is
never inspected or modified. A passing check leaves exact marker-generation deletion and receipt/roster rollback
checks in force. Borrowed pending markers remain retained as today; empty/machine-local targets and capability-off
compensation preserve their cleanup behavior. This adds a check dependency, not a fourth projection slot.

There is no fourth slot, new setting, persisted state, automatic recovery, or additional lock. A save after the last
observation remains the physical-removal residual in § 17; repeating the observation does not make deletion atomic
with arbitrary editor saves.

**`check(checkout, disposition = "remove")`** — the removal check's projection part and unindexed personal-data
observation. It reads only, writes nothing, and takes no lock, and answers:

- `passes` on a checkout § 2.5 gives no projection and that holds no index, before identity is consulted, once
  the residual observer passes for remove; release returns directly on that boundary (A6);
- `would-refuse` with a remedy, when the persist step would refuse, save for a new file under a prospective owner,
  whose kind's content checks wait for the persist step's mint (below) — a file adoption would refuse
  (`spec-projection-write-back.md` § 9), held by a conflict (`spec-projection-write-back.md` § 6), failing to parse,
  holding an edit its edit rights refuse (`spec-projection-write-back.md` § 8) or another refused edit
  (`spec-projection-write-back.md` § 7.6), an aside copy whose edit is refused or clashes in the checkout, or that holds
  an edit once its path has moved on (`spec-projection-substrate.md` § 5.2), a file or aside copy withheld at an index
  rebuild (§ 2.5, `spec-projection-substrate.md` § 5.4), or not yet settled (`spec-projection-substrate.md` § 4), or
  held pending by write-back's read path for any other cause but a store read's refusal, which is `unobservable` below —
  a retained base it cannot read, for any format, among them — or refused by the send's preparation (below) for any
  cause but a store read's refusal, likewise `unobservable` — a local capture it refuses, the target's selection, the
  edit rights, a content check, or a `version-conflict` carrying `cause: "projection-admission"`
  (`spec-projection-write-back.md` § 7.2, § 7.8) — or, for a checkout § 2.5 gives a projection or that holds an index, a
  configuration that yields no identity (§ 2.5); and, by a deliberate hold, a file holding an accepted-input recording
  write-back has not finished (`spec-projection-write-back.md` § 7.1), or an accepted adoption whose read-back has not
  installed, which can outlast its recording, each of which the persist step would finish: finishing either writes,
  which the check never does, so the check holds the removal on the entry's marks, read for every entry whether or not
  its file changed, its refusal made locally rather than by a store read, with the remedy naming `arc save` run there,
  whose walk finishes it, or, where the root's ignore guard refused it, the guard's own remedy; such an entry in
  another identity's personal root, which that walk cannot finish under the configured identity, since the store
  answers another person's record as absent, answers as an edit there does, naming that identity's remedy — each of
  which the check reports as `persist-would-refuse`. A write-back's recording whose file is gone holds nothing,
  wherever it is, since its write has landed and no walk re-sends it;
- `unobservable` with its detail, when a read it needs fails — the store, the index, a projected file, or the target's
  configuration or marker — which the check reports as it reports its Git part's failed read, so a failed read never
  reads as `persist-would-refuse`. Branch-gone recovery keeps a `persist-would-refuse` checkout as a switch target, a
  live checkout, but reads `unobservable` as `external` (`spec-seam-locus.md` § 12.1), and nothing observed the
  checkout. A store read refusing `namespace-corrupt`, `identity-mismatch`, or `state-unresolvable`, and any store read
  the send's preparation makes that refuses with another code than `not-found`, which the planner answers itself, is
  such a failed read: the slot cannot tell what the persist step would meet.

The index's refused and pending marks record what the last write-back or refresh met, never what a file holds now
(`spec-projection-substrate.md` § 3.1), so the slot runs write-back's read path over each changed file in every
projected root, `completed/` included, and in every other identity's personal root present (`.arc/user/*/`), which a
changed identity leaves (§ 10.4), and over each settled aside copy in the target's aside folder, which the persist step
would take over: the settle rule, the edit rights (`spec-projection-write-back.md` § 8), the kind's parser where it has
one, the store's merge run in the checkout, the kind's write check over the merged content with
`spec-projection-write-back.md` § 7.3's views, and `checkSerializationRules` (`spec-projection-write-back.md` § 7.5),
and, where that path is ready, the send's own preparation without its submission: the capture of the target's local
state and retained bases and the shared planner, the read-only feasibility check `spec-projection-write-back.md` § 7.2
permits, whose answer is provisional, since the persist step captures and prepares again under the target's lock. An
edit made since the last command and a refusal since reverted both read true, and the aside copies read as
`spec-projection-substrate.md` § 5.2 states, as the persist step's takeover reads them: in the order their swaps were
made (`spec-projection-substrate.md` § 3.1), each read with the record that a write-back has been sent since its swap
set wherever an earlier copy of its path would be taken in. For a file the index does not hold it reads adoption's whole
verdict without minting (`spec-projection-write-back.md` § 9), in two parts: the checks adoption still makes inline as
it writes — the target's resolution through established folder ownership and cohort-generation authority, with
`arc stub`'s own checks of the parameters the meta supplies where the owner is prospective, the record's protection, a
path through a symbolic link, an existing record, and metadata that must come through `arc stub` — which this member
extracts from adoption (`adoptProjectionFile`, `lib/store/projection/adoption.ts`) and adoption itself calls before it
writes, so the check and adoption cannot disagree; and, only where adoption itself plans — its owner established and its
record absent — the shared planner adoption's send runs, which re-selects the target from the captured local evidence,
re-runs the edit rights, and runs the kind's content checks, run without its submission. Where the record exists,
adoption attaches it and sends the file as an indexed edit, so the check reads the entry attaching would build through
the read path alone, since the send's capture finds a path's binding only in the published index, which holds no such
entry until the persist step attaches it and prepares; where the owner is prospective, adoption mints before it plans,
so the check stops at the inline checks, the kind's content checks the persist step's after the mint. A refusal only the
verb's executor returns reaches the persist step, which refuses with the verb's remedy. In another identity's personal
root an edit is one the edit rights refuse, and a file the index does not hold one adoption refuses, each for the
identity and naming that identity's remedy (`spec-projection-write-back.md` § 8), since rights answer for the target's
identity alone; an unchanged file there holding neither mark of the hold above passes. Its cost is the stat walk, about
3 ms on Linux and 27 ms on Windows at 1,000 files (§ Spike 2), plus the read of each changed file, one configuration
read in the target, one Git call (§ 15.3), and, for each changed file whose read path is ready and each new file the
planner reads, its preparation's captures, two Git calls in the usual case (§ 13). The third answer is
`seam-lifecycle`'s, as shipped (§ 18).

**`persist(checkout)`** — the persist step, run by the function after the check and before it unlocks and removes the
checkout:

1. On a checkout § 2.5 gives no projection and that holds no index, it repeats the residual observer above before
   identity is consulted, refusing with its local-path recovery remedy or unreadable-path detail; once that observation
   passes it returns without taking a projection lock (A6). Otherwise it takes the target worktree's projection lock.
   Where the lock stays held until `AdvisoryLockTimeoutError`, the step refuses, naming the holder and a retry; where
   the lock's lease is lost while the step runs (`spec-projection-substrate.md` § 3.2), it refuses with a retry; and
   with no identity (§ 2.5) it refuses naming the remedy that sets `arc.identity`.
2. It writes back every edit there under `write-back` (`spec-projection-write-back.md` § 7.4), every projected root
   included and every other identity's personal root present, read as the check reads it, each file as its own
   one-mutation admission batch (`spec-projection-write-back.md` § 7.2), waiting through the settle rule's tries for a
   file not yet settled (`spec-projection-substrate.md` § 4). An unfinished recording or an uninstalled read-back
   meets the step only where it arrived after the check, which holds one left before it in the target identity's
   roots, or where it is a write-back's recording whose file is gone, which the walk never visits and the step leaves
   as it is; the step finishes one it meets as the command's walk does: an accepted adoption awaiting its read-back by
   resuming that read-back, any other by the send, which finishes a recording before it prepares
   (`spec-projection-write-back.md` § 7.1). If any file then stays unadopted, held by a conflict, failing to parse,
   holding a refused edit, withheld at an index rebuild (§ 2.5), not yet settled, or pending for any other cause — a
   `lock-held` refusal, a `version-conflict` its recovery did not clear, or one carrying
   `cause: "projection-admission"`, which takes no recovery (`spec-projection-write-back.md` § 7.8), a retained base
   write-back cannot read, for any format, or a recording the step could not finish among them — the step refuses with
   that file's remedy, and the file keeps its content; a file write-back leaves pending refuses with the remedy
   write-back reports for it, or a retry where it reports none. A symbolic link is never adopted and refuses nothing
   (`spec-projection-write-back.md` § 9).
3. It takes over every aside copy there, in the order their swaps were made (`spec-projection-substrate.md` § 3.1), its
   writer live or not, as `spec-projection-substrate.md` § 5.2 states: once a copy has settled
   (`spec-projection-substrate.md` § 4), it takes in an edit the copy holds while its path has not moved on, and deletes
   the copy, so the writer's own second check finds nothing left. A copy whose edit is refused or fails to parse is kept
   as `spec-projection-substrate.md` § 5.2 states, and the step refuses with its remedy; one whose edit clashes in the
   checkout is kept, and the step refuses as held by a conflict; and one holding an edit once its path has moved on is
   kept, and the step refuses, naming the copy's path and the remedy of copying out what it holds and deleting it. A
   copy withheld at an index rebuild (`spec-projection-substrate.md` § 5.4) is left as it is, and the step refuses with
   § 2.5's remedy. A copy that does not settle, or whose edit write-back defers or leaves pending, is kept and the step
   refuses with the remedy write-back reports for it, or a retry where it reports none, since no later sweep runs once
   the checkout is gone (`spec-projection-substrate.md` § 5.2).
4. It checks every projected file and the aside folder once more against the index by the racy rule, walks the projected
   roots' folders, and every other identity's personal root present, again for files the index does not hold
   (`spec-projection-write-back.md` § 15.1), and writes back, adopts, or takes over, as steps 2 and 3 do, whatever
   changed or appeared since those steps read it, at most three passes; a file or copy still changing refuses the step
   with a retry.
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
marker is cleared, and the path refuses if it refuses — the end of an Errand on the primary among them, whose claim
`removePrimaryTransientOccupancy` (`lib/git/worktree-marker.ts`) clears. `releaseWorktreeCheckout` runs the
check and this slot and returns; its caller clears the marker, `arc locus release` after calling its `beforeRetire`
once the slot has returned (`lib/locus/release.ts`), so the slot, which clears no marker, never stands in for the
caller's checks:

1. On a checkout § 2.5 gives no projection and that holds no index it returns at once, before identity is consulted,
   with its check and `withPersistedProjection` explicitly in release disposition. The residual-file refusal applies
   only to destructive removal (A6). Otherwise, under the target worktree's projection lock, taken and refused as the
   persist step takes it, it runs the persist step's steps 2–4 — the write-back of every edit there under `write-back`,
   the takeover of every aside copy, and the last check — refusing on the same conditions.
2. On a linked checkout, it then removes the projection — each file by the removal swap (`spec-projection-substrate.md`
   § 5.6), every other identity's personal root's files among them, refusing where an edit goes back to its path as a
   refused edit, as held by a conflict where an edit the swap takes in clashes in the checkout
   (`spec-projection-write-back.md` § 7.7), and, where write-back defers or leaves pending an edit the swap takes in,
   with the remedy write-back reports for it, or a retry where it reports none, then, once the end's second check
   (`spec-projection-substrate.md` § 5.2) has run over the removal swaps' copies with the same refusals, the aside
   folder and the index — since a checkout no marker claims holds none (§ 2.5). The primary — decided by reading its
   `.git` (`spec-projection-substrate.md` § 3.1), as § 2.5 decides it, not by the `isPrimary` it is passed, which
   `releaseWorktreeCheckout` (`lib/git/worktree-removal.ts`) computes by comparing the checkout with the primary path
   its caller supplies — keeps its projection, which its next refresh lays out as for a checkout with no current work
   item.
3. It releases the lock and returns.

A caller that fails after the step leaves the marker, and the next command projects again.

#### 12.8 The user surfaces in every worktree

Under the capability the projection gives every worktree its own copy of the user surfaces — the identity's personal
records, `USER-INBOX` and `WORKING-MEMORY` among them — and reads none through `lib/user-surfaces.ts`'s resolver (D13).
The in-repo implementation keeps the resolver (`lib/store/in-repo/personal-paths.ts` imports it), and its removal paths
keep merging a linked worktree's copy up through `lib/user-surface-migration.ts`, so both stay as the in-repo
implementation's arms. Where the store keeps state off the branch, from the flip, no removal merges a linked worktree's
copy into the primary's or reads whether it could: the persist step carries its edits to the store (§ 12.2), and a merge
would write into the primary's projected file outside its lock and index. The seam's members move their own callers off
the resolver (`spec-seam-locus.md` § 10.3), and `storage-cutover`'s deletion pass removes the rooting and the migration
with the in-repo arms (D15; § 18).

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

- **Git calls.** The projection makes two Git calls per command, both issued before its folder walk, which runs while
  they do — the store read, and one `git config --get-regexp` reading the `arc.*` keys and the object format (§ 15.3) —
  and the exclude writer and the guard make one each, the guard only when an ignore file may have changed
  (`spec-projection-substrate.md` § 11.1, § 11.2). A command that sends an edit adds, for each file it sends, two reads
  of the sending checkout's configuration in the usual case, one Git call each, as write-back's preparation captures the
  checkout's local state before and after it plans, a third where that state changed between them, and the same again
  for a base recovery's retry (`spec-projection-write-back.md` § 7.2, § 7.8). A full materialization reads through the
  store's `list`, which the ref backend batches through `git cat-file --batch` (`spec-storage-ref-backend.md` § 11.6),
  so the projection reads no blob from Git itself (§ 15.5).

### 14. More than one source

D13 has the projection take more than one source and support read-only copies. This member builds the seam a second
source plugs into, with the store as the only source, so no read-only copy exists until a second source brings one. The
engine reads records through one source interface — `read`, `list`, `version`, and `changes` (`Pick<Store, "read" |
"list" | "version" | "changes">`, `lib/store/contract.ts`) over the roots the source projects, with `history` and
`lookup` read from the writable store alone. The store satisfies it, and so does a read-only store (`ReadOnlyStore`,
which `createReadSourceStore` in `lib/store/create.ts` returns); refresh and full materialization take the source they
read as a parameter rather than the store the command's projection was started over, so a second source plugs in
without changing either.

The installed package implements the interface when ARC core resolves from it (`framework-core-from-package`, § 18), and
that change builds what a read-only source adds, shaped against the source it brings: each source's own state version
in the index, which holds one today (`ProjectionIndexSchema`, `lib/store/projection/index-schema.ts`); its files
protected (`spec-projection-write-back.md` § 8.2), their notice naming the source, with write-back refusing an edit to
one as a refused edit; the `.arc/system/` paths it projects added to the exclude writer's list
(`spec-projection-substrate.md` § 11.1); and what `MACHINE_LOCAL_PATHS` lists there left alone (§ 12.9).

### 15. Refresh and performance

A command's cost grows with what changed, never with how much state exists. Reads take only a ref's tip (D10), and
`history` is read only where `spec-projection-substrate.md` § 3.5 names, and where accepted-input recording needs
missing entry IDs restored but read-back no longer names the accepted landed version (`spec-projection-write-back.md`
§ 7.1). Prepared admission repeats only the history queries its fresh preparation requires
(`spec-projection-write-back.md` § 7.2, § 15).

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
  `current/` copy of each cohort document its `Cohort` field names, which `list` by the work unit never returns. The
  copy is named by the field's text, a former slug a renamed cohort keeps included. A read of that cohort by name that
  refuses `not-found`, as for a member naming a removed cohort, lays no copy and removes any the meta's earlier text
  left; one that refuses `ambiguous-match`, two cohorts clashing on the name, leaves the copy as it stands. Either is
  reported and neither refuses the command, since a clash's repair, `arc rename` with the cohort's UID, runs from a
  member's checkout. An archive, an abandon, or an owner leaving the in-flight view is a re-lay with nothing left to
  project here, which removes the files.
- **Reusing a path across record identities (A2).** A leaving record keeps the path's entry until its file and every
  aside copy are gone. An arrival waits while either remains; the index's state version stays at its previous anchor
  while any arrival is unfinished, so the next refresh rediscovers it even when no entry yet names the arriving record.
  A reprojection also journals `reprojectionPending` before changing files and retains the previous `projectedUnder`
  tuple until every desired arrival is confirmed (§ 10.4), so claim-only retries survive even a return to the previous
  settings, with no store delta and before an arriving journal can be created.
  Once the path is absent with no leaving copy, the entry keeps the leaving record's identity and basis and adds a
  durable `handoff` containing the arriving record's complete entry, without a nested handoff: its exact reference,
  base, rendered blob, protection and rendering state, changed mark, and staged file's identity. The entry is pending
  and withheld while the handoff exists, so neither identity receives a write-back guessed from the path's bytes.
  Every take-in entry point refuses an entry carrying a handoff before it prepares or submits a write; selection
  excludes the withheld path. This journal is published before the exclusive link installs the arrival. The staged
  name is not recovery authority: its recorded inode and rendered blob identify the installation, even if a later
  sweep deletes the staged file. A link that observes a recreated path yields to it, clears the handoff through a
  publication, and keeps the leaving entry for its next write-back. Until that publication succeeds, recovery takes the
  conservative handoff rule below. The arrival remains journaled through the command's end. After the end's second
  check, or at the next command's start after its sweep and before write-back, reconciliation reads the destination
  through the settle gate and hashes its bytes between matching stats. Only a regular file with the staged inode and
  exact rendered blob confirms the arrival; reconciliation then publishes its entry, clearing the handoff, withholding,
  and pending marks. An absent path clears the handoff while keeping the leaving entry pending, so refresh can retry
  the exclusive installation. Any other bytes or file identity remain withheld under both recorded identities, are
  reported, and are sent to neither record. An unsettled read waits for the next reconciliation; it is never a
  confirmation. To release ambiguous bytes, copy out anything wanted, delete the withheld file, and reapply the edit
  after the arrival is projected. Reconciliation mutates only roots whose ignore check passed, never follows an opaque
  link, and publishes the new authority before removing any staged residue. The same rules govern refresh, full
  materialization, and reprojection. A persist or release step reconciles first and refuses while an ownership handoff
  or ambiguous withheld file remains.
- **A conflict-record entry** refreshes the file of the record it names, or, for a removed conflict, whose entry carries
  no content, the file the index maps it to — by its marker set, its notice line, or, for a conflict the file does not
  show, the file's entry (`spec-projection-substrate.md` § 3.1). Neither reduction needs a contract change.
- **A state version that no longer resolves.** When `changes` refuses `state-unresolvable`
  (`spec-storage-ref-backend.md` § 2.3, § 4.6) — for example because Git collected its manifest, which only an anchor
  written into a record keeps reachable, because it names an ended item whose history this clone has not fetched, or,
  naming no history ref, because more than one end of an item lies past the window's lower bound and the window stops
  short of the current state version (its § 4.6, A38, A40) — the command rebuilds the worktree's projection from the
  current state rather than pulling any history ref the refusal names, so no refresh waits on the network. Every
  projected record is refreshed by the same rules as a changed one, every index entry the current state no longer holds,
  every partition read for it, is handled as a removal (`spec-projection-substrate.md` § 5.6), the replace guard and
  pending marks apply, and the index takes the current state version only once the rebuild's evidence is whole (A7).
  Write-back has already run, and a file holding an edit is handed to it as any refresh hands one, so the rebuild loses
  none. It costs one full materialization, paid by a worktree idle past Git's expiry or one whose state version names
  history this clone lacks, and one more at each start there until a rebuild takes the current state version (§ 17 item
  12).
- **A listing that is not whole.** A full materialization and the rebuild write files only for the records a listing
  returns. A record it lists only as a diagnostic (`ListingDiagnosticSchema`, `lib/store/read.ts`) — malformed,
  oversized, unreadable, of a newer format, under a mismatched key, or of any other kind — projects no file and is
  reported, and a listing that reports `missed` or returns `unreadable` removes nothing. A rebuild whose evidence is not
  whole takes no new state version — one with no usable index publishes none, neither in its batch's intent nor at its
  end — so the next start rebuilds and settles what it held (§ 2.5, A7). A file is removed only on positive evidence: a
  complete listing, with nothing missed and no diagnostic, that no longer holds its record, or a listing that returns
  `absent`, which the ref backend answers for a complete live listing that finds nothing (`liveListingOutcome`,
  `lib/store/ref/read.ts`) — as a primary entry's re-lay meets once an owner's last record ends.

#### 15.3 The no-change budget

The no-change budget is calibrated from the complete native command start, including its final index and reference
publication (A4). The Linux reference is `m5-air-ac`, calibrated by run `2ba0b6ef905c408ea51b8e67686e7bbe`, whose
package and timing inputs match commit `1999ade81e42214e3755600cce27d8219ce87bae` exactly; Windows and macOS use GitHub
diagnostic run `43055778612` at that same source head, with their image versions recorded in § A4 of
`notes-projection-worktrees.md` and named below. Every calibration uses eleven samples over 800 projected files,
including 320 hot files, and a paired comparison with 60,320 files at the same hot-file and owner counts. Both fixtures
are warmed before collection, each standard/expanded pair alternates its first fixture, and the raw samples and paired
differences remain available.

| Platform | Named reference              | Start budget | Start tripwire |
| -------- | ---------------------------- | ------------ | -------------- |
| Linux    | `m5-air-ac`                  | 20 ms        | 25 ms          |
| Windows  | GitHub `windows-2025-vs2026` | 145 ms       | 200 ms         |
| macOS    | GitHub `macos-26-arm64`      | 45 ms        | 60 ms          |

Linux's start budget rounds the one-third allowance over 14.64 ms upward to 20 ms; its tripwire is 25 ms. Each
platform's budget adds roughly one third to its reference's slower standard/expanded start median; the tripwire gives a
further reporting margin. These are complete-operation budgets, not extrapolations from the prototype walk. The margins
are engineering allowances, not percentile guarantees. The reference metadata, complete raw medians, Git single and
concurrent-pair baselines, and beneath-Git filesystem measurements are recorded in `notes-projection-worktrees.md` § A4.
macOS has its own calibration rather than inheriting Linux's.

The reference run qualifies on raw time. On another host, the reading can credit only demonstrated excess Git delay on
the operation's critical path relative to that platform's named reference, never projection work or time already hidden
beneath overlapping work. Counts of physical process starts, persistent-reader requests, or aggregate Git durations
alone establish no credit. Report raw time, reference and host Git baselines, any established exposed excess, and the
resulting qualified time separately; where the exposed excess is not established, use zero credit and raw time. Raw
tripwire notices remain unadjusted. This replaces the former startup-count discount on Windows and applies the same rule
to Linux and macOS.

- **Historical prototype measurements.** At this repository's size then — about 800 projected files and 17 MB in
  `completed/` — a warm stat walk of all of them took 3.4 ms. At 1,000 files the stat walk, the index read, and the Git
  call took 5 ms on Linux and 49 ms on Windows, of which the Git call is 2 ms and 41 ms; at 100 files, 2.3 ms and 42 ms.
  The rest of the no-change path — the folder walk, the projection lock, the sweep of an empty aside folder, and the
  index and reference write each command makes to keep its tripwire measurements — adds 1.8 ms on Linux and 7.7 ms on
  Windows at 1,000 files in 125 folders, the walk the largest share at 1.0 ms and 5.1 ms (§ Spike 2). The checked set
  sits well under 1,000 files.

- **The index read and archive independence.** The prototype whole-index codec cost about 14 ms on Linux and 47 ms on
  Windows at this repository's size (`notes-projection-worktrees.md` § Spike 4). `readProjectionIndex` instead reads the
  header and the partitions of the roots the command walks, as plain JSON, and an archive quarter's only where the
  operation lays, removes, or sweeps a file there or the quarter holds an unsettled entry (§ 3.1). The settled archive's
  entry count therefore adds no quarter decode or file walk to an ordinary start; the backlog still costs its own walk
  and partition. `launchProjectionStart` runs the index read, hot-root walk, and stats beside its Git work. The paired
  800/60,320-file native comparison and the unreadable-cold-partition check test this behavior; the earlier prototype
  timings do not define the full-operation budget (A4).
- **Two Git calls, issued together.** The projection makes two Git calls — the store's `version()` read, and one
  `git config --get-regexp` reading the `arc.*` keys, `user.name`, and `extensions.objectformat`: identity, the
  in-flight view setting, and the object format — both issued before the folder walk, which runs while they do. Run at
  once they cost what the store read costs alone, 41.7 ms against 41.6 ms on Windows, where one after the other took
  64.8 ms (§ Spike 2). The actor that labels a checkout merge's markers adds no call: it reads the machine id at the
  common Git directory the start's location already holds (`ProjectionLocation.commonDir`,
  `lib/store/projection/location.ts`), once per command for the command's identity, which every worktree a fan-out
  visits shares, a removal slot's or spawn's target of another identity being refused or left to its own command
  (§ 2.5). A4 measures the complete native start on each reference; neither overlap nor a single-call baseline alone
  establishes its complete cost. The guard adds no call while no ignore file may have changed
  (`spec-projection-substrate.md` § 11.2).
- **One lock, one write, cheap steps, and the fastest reads.** Calibration retains the following start path (A4). A step
  of the projection lock confirms ownership on disk only once the lease's last confirmed deadline lies within one
  renewal interval, or once the heartbeat has found the lease lost, and otherwise returns at once (§ 16.2), at the
  start, in a fan-out, and in a materialization alike. No other process breaks a live holder's lock meanwhile, since a
  holder in the same process scope is broken only once its process is gone and one in another only once its lease lapses
  (`isMainLockBreakable`, `lib/advisory-lock.ts`; `spec-projection-substrate.md` § 3.2), and a process suspended past
  its deadline confirms on disk at its next step. A confirmation on disk renews the lease, about 1 ms on Linux, so one
  before each checked file costs about 300 ms at this repository's size (§ Spike 2). The start issues both Git calls,
  then, while their processes run, reads the index's header and the partitions of the roots it walks, walks its shared
  roots, and its personal roots once the configuration read returns the identity, and stats each file it walked, so
  these cost nothing past the Git calls wherever they take less time (§ Spike 5). The walk reads each folder with its
  entries' types synchronously, as the walk in § Spike 2 did on both platforms, and yields between folders, since the
  store's read reaches its Git process through asynchronous steps that a walk run in one piece holds back until it ends.
  The stats are synchronous on Linux, which § Spike 2 found fastest there, and on macOS, which follows Linux untested,
  and a pool of 32 concurrent stats on Windows, never one awaited call after another. The change checks compare them
  where the start's sweep found the aside folder empty, and stat again after the sweep otherwise, since a copy it takes
  over changes its file. A stat taken while the Git calls run is published by the first index write after it, smudged
  against the reference that write replaces, which predates the start's lock, since a sweep of an empty aside folder
  writes nothing (`spec-projection-substrate.md` § 3.3). The start keeps one index in memory from the sweep through
  write-back, any reprojection (§ 10.4), and the refresh, each of which takes it and returns the one it wrote, to its
  last write, as a fan-out's visit does with the index it reads, so each write publishes every stat and ignore record
  observed before it, against the reference that predates them (`spec-projection-substrate.md` § 3.3); the sweep writes
  on its own only where it took over a copy, and the start's last write carries its measurement. The command's end takes
  no lock in a root where the command made no aside copy, removed no file, sent nothing to the store, and records no
  fan-out time, and whose start's sweep found the aside folder empty. A command with nothing changed so takes one
  projection lock and writes its index and reference once, at its start's end.
- **No folder-time cache** is built; the command-start tripwire would show the need.

#### 15.4 Tripwires

Each tripwire is shown when the median of its recent measurements, kept in the worktree's index — a fan-out's in the
writer's own, recorded at its end under the lock the end takes again, and none where the writer holds no projection —
crosses its bound, never on one measurement, since host stalls reached 1.4–1.6 s on Windows (§ Tripwire timings):

| Raw recent-median tripwire | Linux   | Windows | macOS   |
| -------------------------- | ------- | ------- | ------- |
| Command-start overhead     | 25 ms   | 200 ms  | 60 ms   |
| One complete fan-out       | 750 ms  | 6000 ms | 2800 ms |
| Full materialization       | 1500 ms | 8000 ms | 4000 ms |

The fan-out criterion separates a one-file backlog notes write from ten changed backlog notes files; the runtime
fan-out tripwire remains one figure, the ten-file bound. Both reference measurements include the writer and twenty
linked siblings, processed sequentially, and time every propagation round after the authoritative Store mutation:
`runProjectionFanOut`'s version capture and source reads, protection, layout and ignore checks, recovery intent, file
replacement, and final index publication. The Store mutation itself is outside this propagation timer. Primary-entry
changes and cohort renames may require additional listings; their notices remain diagnostic rather than a promise that
every kind of write fits the companion-write reference.

Materialization times the complete `materializeSpawnedProjection` call over the 800-file reference dataset, including
source inventory, protection, rendering, staging, replacement, and its publication. It runs at spawn and full rebuild,
rather than on every command. All reference bounds are calibrated from the full native implementation with roughly
one-third headroom, not from the smaller file-only prototype (`notes-projection-worktrees.md` § Tripwire timings). A
same-build measurement on one platform does not qualify another.

| Complete external-operation acceptance     | Linux   | Windows | macOS   |
| ------------------------------------------ | ------- | ------- | ------- |
| One-file non-primary backlog notes fan-out | 300 ms  | 2800 ms | 600 ms  |
| Ten-file non-primary backlog notes fan-out | 750 ms  | 6000 ms | 2800 ms |
| Full materialization                       | 1500 ms | 8000 ms | 4000 ms |

A reference's complete raw medians must fit these bounds. An ordinary start must also leave settled archive partitions
cold and show no systematic cost from archive entry growth in the paired comparison. Host-Git attribution follows §
15.3; an unavailable credit never turns a failing raw result into a pass. The external acceptance timer includes the
last publication, while `recordProjectionTiming`'s persisted samples necessarily end before the publication that stores
them. Keep both visible and do not compare the persisted sample as though it were the external full-round measurement.

A tripwire notice reports the raw recent median and its platform's runtime bound. Crossing it calls for attribution
rather than an automatic change to locking, recovery, or file scheduling. A3's concurrent-sibling proposal
(`notes-projection-worktrees.md` § Per-root cost reductions) remains held; none of these budgets depends on adopting it
(A4).

#### 15.5 Fan-out and full materialization

The file-only tripwire prototype (`notes-projection-worktrees.md` § Tripwire timings) took 3.3 ms for one file and
13.4 ms for ten into twenty Linux siblings, including its end check, with Store reads outside the timer,
a simple exclusive-create lock, and one index publication. Those figures do
not calibrate a full native round (A4). The native `runProjectionFanOut` shares source reads but also processes the
writer's root, validates each destination, and commits recovery intent before replacement and final settlement
afterward. `commitProjectionIndex` publishes only affected partitions under the header commit point; a normal reference
round makes two publications per root, 42 in total, rather than the former four per root. Returned aliases retain any
additional publication needed before unlink. The named reference measurements in § 15.4 include this complete work and
the production plain-JSON partition codec. The round captures one `version()`, and one `changes` result per distinct
prior state, normally one. In the native companion-write reference, physical process counts are 9/27 for one/ten changed
owners: six control starts covering the ref captures, new manifest retention, worktree roster, and identity
configuration, one changes reader, and two separately owned UID readers per owner for the primary and changed companion.
`createProjectionReadMemo` shares those source operations across destinations, while `createRefReadCoordinator` closes
each public operation's reader before returning; destination count adds no reader process in this workload. Longer
ancestry windows, primary re-lays, take-ins, and additional distinct states may require more. Each record its refreshes
lay is read once in the round, shared by every worktree, a `read` on the ref backend costing at least one Git call. It
also lists the worktrees, one Git call (`scanRegisteredWorktrees`), and reads each one's index header, and, for each
primary entry among the changes, re-lays through one `list` by owner shared by every worktree — four Git calls on the
ref backend, six where it writes a new manifest, budgeted at 600 ms on Windows, where a `read` is budgeted at 300 ms
(`spec-storage-ref-backend.md` § 11.6, § 11.7) — so a meta write's fan-out costs more than a companion's. A primary
entry's re-lay also selects the in-flight view (`selectProjectionView`, `lib/store/projection/view-selection.ts`: a
`version()` and two listings) once per round through the memo, and a refresh selects it nowhere else; a laid record's
conflicts are read once each in the round (`readConflicts`, `lib/store/projection/record-render.ts`). Each file a
refresh lays takes its protection from the round's evidence (§ 16.3): its owner's meta through the memo, read once per
owner in the round where the changes did not already return it; its owner's claim, a `lookup` whose `read` is that same
meta, only in a worktree whose marker names that owner, the owner's own checkout among them where it is the writer's;
and the holder and markerless searches from the round's own listing of the worktrees, the markerless search's project
identity through the memo. A one-file write of a record that is not a primary so adds at most its owner's meta `read`
and the claim's `lookup` to its round however many worktrees it visits, where protection observed in each worktree's
render cost about 108 Git calls into 22 worktrees (`notes-projection-worktrees.md` § Spike 3). Each worktree it visits
is bound with the command's own configuration read and actor — the read § 2.5 names as the command's — or re-read into
the root the command already holds for it (§ 2.2), adding no Git call per worktree where its refresh sends nothing; a
take-in there captures that worktree's own state, two configuration reads per file sent in the usual case (§ 13). `git
config` reads the same values in every worktree of a clone unless a worktree's own `config.worktree` or a conditional
include (`includeIf`) differs, and a sibling whose recorded view setting, identity, or ignore configuration then
differs, or whose index records no guard pass, is skipped before any guard runs there (§ 2.2), its next command reading
its own and reprojecting (§ 10.4). A pull's merges fan out as a write does (§ 2.2): with the index in partitions, a
day's merges cost about 0.4 s on Windows across this repository's five worktrees and, for a 50-person team, about 2.8 s
across 20 worktrees, 0.4 s on Linux, past the old prototype-derived fan-out tripwire on both
(`notes-projection-worktrees.md` § Spike 4); those model estimates do not qualify a full native round against A4's
calibrated bounds. Leaving the other worktrees to catch up at their next command would not remove that cost: a later
write's fan-out brings each worktree up from its own state version, so the first write after a pull would lay the merges
into every worktree not yet caught up. A command whose writes land outside a projection lock fans out once per write,
each timed by the tripwire (§ 15.4), and a sibling whose lock stays held past 200 ms is skipped
(`spec-projection-substrate.md` § 3.2).

The file-work materialization spike over this repository's 780 files took 115–130 ms on Linux and 1.1–1.3 s on Windows;
on the ref backend it reads through `list`, which batches its blob reads (`spec-storage-ref-backend.md` § 11.6). Its
renders take their protection the same way, the owner's meta from the records that listing returned and the holder
search from one listing of the worktrees, so protection adds no `read` to it, where observed in each render it would add
about 960 Git calls at this repository's size (`notes-projection-worktrees.md` § Spike 3, § Spike 4). Writing several
files at once halved the Windows materialization to 0.62–0.79 s and slowed Linux; it is a tripwire's first response, not
built now (§ Tripwire timings). `completed/` lands in every worktree, as the tracked copy does today.

| Axis                         | Cost grows with                     | Watch                                    | Response                                            |
| ---------------------------- | ----------------------------------- | ---------------------------------------- | --------------------------------------------------- |
| Archive size                 | nothing per command                 | full materialization (spawn, `arc sync`) | batched blob reads in `list`; tripwire              |
| Worktrees per machine        | worktrees × files changed per write | fan-out time; Windows moves while held   | tripwire; the one-copy reserve                      |
| Team size                    | others' writes, at fetch points     | the `all` view                           | `mine` default; `cohort` and `all` opt in           |
| File size (1 MiB cap)        | merge time per edited file          | nothing at the cap                       | —                                                   |
| Windows Git calls (32–42 ms) | Git calls per command               | calls before the command's own work      | two calls issued together; the guard only on change |

### 16. Forward amendments to shipped specifications

The storage contract and the projection substrate have shipped, and `projection-write-back` ships before this member
starts (§ 18). Where this design changes what their specifications define, the change is stated here and built by this
change, except where a subsection names its builder; none of the three is edited.

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
  copying out what they want and re-applies the edit as an ordinary one. A file it holds only because its evidence was
  not whole is the exception: a later rebuild settles it by § 2.5's rule (A7).

One adds to D13 without contradicting it:

- **Every removal and release refuses over a refused edit, a file that fails to parse, or a file not yet persisted**
  (§ 12.2, § 12.3). D13's teardown persists first and refuses while a file is unadopted or held by a conflict; a refused
  edit stays in its file (D13), and a file that fails to parse is skipped and reported (D13), its edit never written
  back, so removing the checkout would drop either, as it would a file still settling or left pending. The persist and
  release steps check every projected root, `completed/` included, and every other identity's personal root present, and
  the removal check reports a refusal beforehand.

#### 16.2 The projection substrate (`spec-projection-substrate.md`)

One changes how § 3.2 finds a lost lease, and one the index's form (§ 3.1, § 3.3):

- **A step confirms on disk only near its lease's deadline** (§ 15.3). § 3.2 has a lost lease end the worktree's
  operation at its next step, and the projection lock's step confirms ownership on disk each time (`withProjectionLock`,
  `lib/store/projection/lock.ts`). Here a step confirms on disk only once the lease's last confirmed deadline lies
  within one renewal interval (`ADVISORY_LEASE_RENEW_INTERVAL_MS`, 10 s), or once the heartbeat has found the lease
  lost, and otherwise returns at once. A lease that renewal cannot keep is found as before, the heartbeat ending it once
  its deadline lies within one interval; a lockfile that no longer names its live holder, which § 3.2's breaking rules
  never produce, is found at the next heartbeat, within 10 s, and the operation ends at its step after. The
  build-ownership lock still confirms at every call (`withBuildArtifactOwnership`, `lib/build-ownership.ts`).
- **The index is a header and partitions** (§ 3.1 here, § 15.3, § 15.5). § 3.1 and § 3.3 keep one index file, written
  whole by temp-and-rename and decoded through its schema at every read (`commitProjectionIndex`, `readProjectionIndex`,
  `lib/store/projection/index-file.ts`). Here the index is a header naming its partitions by their blob ids: a write
  writes its changed partitions, then the header, then deletes the partition files the header does not name; a read
  decodes the header and the partitions it needs as plain JSON, a pass over every entry reading those the header marks
  as holding an unsettled entry; and a missing or mismatched partition makes the index unusable, as an unreadable one
  is, once a reader holding no lock has read the header again and found it unchanged, a mismatch found after the start's
  read in a command's own worktree deleting that partition, where a fan-out's visit and the end in another worktree
  delete nothing. § 3.1's rule for an index a command cannot use changes too: a worktree § 2.5 here gives no projection
  that holds one gets the full materialization one it gives a projection gets, and where the removal check or the
  persist or release step cannot use a partition that does not hash to its name, the remedy is `arc save` run from that
  checkout rather than the removal or release. Each partition a write writes takes that write's reference for racy stats
  (§ 3.3). The staged-file exemption in that section is superseded (A1): partition publication smudges every racy
  stat, including a file awaiting installation, since an unwritten partition must remain safe after another
  partition advances the shared reference. Copy-mark-only writes apply that rule without advancing the reference.
  The format version moves, so an index an earlier build wrote reads as another format version, and its
  worktree gets § 2.5's full materialization here, as any such index does; no reader of the old form is kept.

The reused-path rule in § 5.6's final paragraph is superseded (A2). `swapBatch` keeps a leaving entry pending when
`SwapFile.relaid` is true, and `rebuild` yields when the exclusive link loses (`lib/store/projection/swap.ts`), but
neither records both record identities. Rather than switch to the arrival with no leaving basis, § 15.2's durable
handoff preserves both until installation is confirmed. The arriving entry's stat is evidence for that handoff's
inode-and-blob check, never a shortcut around the check; the ordinary partition smudging rule stays unchanged.

The withheld mark's lifetime in the glossary and § 5.6 is narrowed (A7). Both keep a withheld file at its path, written
over by nothing and sent nowhere, until the person deletes it. A held file (§ 2.5 here), one a rebuild with no usable
index withholds because its evidence was not whole, is the exception. At a path the current projection lays a stored
record at, a later rebuild in its checkout refreshes it where it holds no edit and otherwise gives it the ordinary
withheld mark; at a path laid no stored record, the first later rebuild or full materialization other than `arc sync`'s
whose evidence is whole gives it that mark. Under the ordinary mark it waits for the person as before.

#### 16.3 Write-back (`spec-projection-write-back.md`)

One changes § 2.2's end, two edit rights and protected files (its § 8), and one its start's index read:

- **The end takes no lock where it has nothing to settle** (§ 15.3). § 2.2 has the command's end take each worktree's
  lock again for the second check, then hand each kept copy no entry names to `removeTakenInCopies`. Here the end takes
  no lock in a worktree where the command made no aside copy, removed no file, sent nothing to the store, and records no
  fan-out time, and whose start's sweep found the aside folder empty; a kept copy an earlier command's stop left there
  is removed at the next end that runs.
- **Rights read only the file's own work unit's claim** (§ 2.2, § 15.5). § 8.1 keeps a work unit's meta and task list
  with its owning checkout, which `checkoutRights` (`lib/store/projection/rights.ts`) checks by reading the
  destination's marker and then that checkout's own claim, a `lookup` and a `read` keyed by whatever work unit the
  marker names. Here a marker naming another work unit — by its UID where the marker carries one, and otherwise by
  neither the owner's current nor a former name, as the holder search matches (`matchingHolders`,
  `lib/locus/lifecycle-ports.ts`) — answers protected with no claim read, and only a marker naming the file's own work
  unit reads that unit's claim. A checkout whose own claim cannot be read, or whose unbound marker names another work
  unit, so protects another work unit's meta or task list rather than refusing `checkout-not-writable`; its own still
  refuse as before. The same rule holds in the second branch, which write-back's shared admission planner takes with a
  send's captured local evidence (`frozenCheckoutRights`, `lib/store/projection/rights.ts`, over
  `readFrozenProjectionClaim`, `lib/store/projection/claim-evidence.ts`; `spec-projection-write-back.md` § 7.2): a
  captured marker naming another work unit answers protected with no claim lookup, so admission reads, and observes,
  only the file's own unit's claim.
- **A refresh's renders observe protection through its own evidence** (§ 2.2, § 15.5). § 8.2 lays a protected file
  read-only with its notice, and the root's protection (`createProjectionProtection`,
  `lib/store/projection/protection.ts`, bound once per root) re-observes rights, the owner's meta, and the holding
  checkout at every render, caching nothing. Here a refresh builds its renderer (`createRecordRenderer`, which takes its
  protection per use) with a protection of its own: its store reads go through the source the refresh reads through — a
  fan-out round's memo, at the start the refresh's own memo over the store it is handed, and in a full materialization a
  memo answered from the records its listing returned — and its roster from one listing of the worktrees per round or
  materialization, which the holder search (`createLocusPorts`, `lib/locus/lifecycle-ports.ts`, which lists them itself
  today) and the markerless search (`findNativeMarkerlessWorkUnitCheckouts`, `lib/locus/markerless-native.ts`) take as
  an input. The root's protection, which the take-in's rights, adoption, and the stub mint read (`rights-binding.ts`,
  `adoption.ts`, `stub-mint.ts`, `lib/store/projection/`), and write-back's read-back and drawing renders keep
  (`read-back.ts`, `checkout-drawing.ts`), stays uncached, so the persist refusal behind a notice names the current
  place (§ 17 item 7 here). An unbound marker — one without a UID over an off-branch store — is a repair state, since
  `arc start --new` holds its creation batch's fan-out until it has stamped the UID (§ 2.2): classifying it lists the
  work units through the same memo (`UnboundMarkerInput.listing`, `lib/locus/unbound-marker.ts`), and § 15.5's counts
  leave it out.
- **The start reads the index's header and its walked partitions** (§ 3.1 here, § 15.3). `startUnderLease` reads the
  whole index (`readProjectionIndex`, `engine-start.ts`). Here it reads the header, the partitions of the roots it walks
  and those the header marks as holding an unsettled entry, and any other partition holding a path its sweep or refresh
  touches; `arc save`'s walk of `completed/` (the `mode === "save"` filter, `engine-start.ts:40`) reads that root's
  partitions. A send's capture of its checkout's local state, which reads the published index itself
  (`captureProjectionLocal`, `lib/store/projection/local-capture.ts`; `spec-projection-write-back.md` § 7.2), reads the
  partition of the path's own root group, which holds every candidate container primary it scans.

### 17. Residuals the design accepts

1. **A write through a held handle.** A write through a handle opened before a replacement and landing after the
   command's second check, or after a persist or release step took the aside copy over, goes to a deleted aside copy and
   is lost (`spec-projection-substrate.md` § 5.2). Reasoned, not measured: no tested editor or agent holds a file open
   across saves.

   _Superseded by A10 in `spec-projection-substrate.md`:_ `settleAsideCopy` can lose a write through an open handle
   after its final content read, before or after `deleteAsideCopy` unlinks the copy; an ordinary single save delayed
   after open can reach this window. Production-source filesystem probes reproduce both sides of unlink. An empty
   copy observed at its writer's second check waits for the next sweep, whose final read has the same loss boundary.
   No finite settle interval proves the writer has finished.
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
   promotion, materialize, or creation's stamp in another worktree has since made wrong, until that file's record next
   changes, a primary re-lay rewrites it, or a reprojection (§ 10.4). The notice is advisory, and the persist refusal
   behind it names the current place. A refresh reads the owner's meta and the machine's markers once for every file it
   lays (§ 16.3), so a marker that moves during it shows at the next.
8. **An index rebuild.** A file or aside copy the projection cannot read without its index stays as it was after a
   rebuild, withheld and reported, until the person deletes it, after copying out what they want, and re-applies their
   edit as an ordinary one; ARC writes nothing over it and sends nothing from it (§ 2.5), but for a file held only
   because the rebuild's evidence was not whole, which a later rebuild settles (A7). A buffer an editor kept open across
   the rebuild and saved afterwards over a refreshed file merges against its stamp's version without the content its
   last write-back took in (`spec-projection-substrate.md` § 3.6), so it can undo any change it makes back toward that
   version: putting back text a persisted edit added and the save removed, or removing again text a persisted edit
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
11. **An edit the command's end takes in.** A save timed into a swap's window after the swap's first check is taken in
    at the command's end, by its second check (`spec-projection-substrate.md` § 5.2), and the end fans out nothing
    (§ 2.2): the save reaches the store then, and every other worktree's copy at that worktree's next command start or
    the next fan-out, whichever comes first, rather than at the writer's fan-out. It needs a save timed into the swap's
    window (§ Spike 1b).
12. **A worktree whose state version is unset or no longer resolves.** While a worktree's state version is unset, or no
    longer resolves and no rebuild has yet taken the current one, each start of its own commands rebuilds it in full,
    one full materialization each, as does each fan-out round of those commands' own writes while it is unset; another
    worktree's fan-out leaves it to that next start (§ 2.2), so a write reaches its copies there rather than at the
    writer's fan-out. It lasts while a rebuild's evidence is not whole — a listing that reports `missed`, returns
    `unreadable`, or lists a diagnostic, such as a record of a newer format another build wrote (§ 3.1); an ambiguous
    cohort match; two live claimed primaries; a placement that cannot be established — or while a path it lays holds no
    installed record: a link at or above it, a path the checkout cannot write, an arrival still handing off, or a file
    withheld with no record basis at a path a record has since arrived at, until that file is deleted. Each is reported
    with its remedy (§ 2.5, § 15.2, A7).

### 18. Expected contracts

This design consumes behavior other changes build. The three it depended on — `seam-lifecycle`, `seam-locus`, and
`storage-ref-backend` — have shipped, as have `seam-decomposition`, `seam-status-roadmap`, `projected-markdown-checks`,
and `cohort-identity-verbs`; the members whose work observes `storage-ref-hardening`'s fixes wait for it (§ 1.1). Each
other is an expected contract, available when its change lands, and what holds until then is stated with it.
`projection-substrate` and `projection-write-back` have shipped, and this member depends on both; their entries come
first.

- **`projection-substrate`** (`spec-projection-substrate.md`, shipped, PR #1247; this member depends on it through
  `projection-write-back`): the engine's state and the files it writes, which refresh, fan-out, materialization, and the
  removal slots read and write —
    - the index, with its format version and the state version last projected beside the entries; and the primary, the
      checkout whose Git directory, read from its `.git` with no Git call (`readGitDirectories`), holds no `commondir`
      (its § 3.1); this member makes the index a header and partitions (§ 16.2 here);
    - the projection lock (its § 3.2): leased and not reentrant; a command holds one at a time, its own and then each
      sibling's in turn, taking a sibling's only while that worktree's Git directory exists and with a wait bounded at
      200 ms at the fan-out and the end, so two writers fanning out cannot deadlock; the persist and release steps wait
      its 10 s bound, and a lost lease refuses them with a retry;
    - the racy rule and its reference stamp, which a fan-out reads to skip a folder no projection was laid in, blob ids,
      and base-stamp recovery's `history` reads, at most one per record in each memo between write-backs to it — the
      command's, and the one each persist or release step reads through — since a write-back's read-back drops the
      record's memoized answer, from the command's memo too where a step lands it (its § 3.3–§ 3.5);
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
- **`projection-write-back`** (`spec-projection-write-back.md`, shipped, PR #1305; this member depends on it):
    - the command's start, end, and report from the root hooks, with the start's refresh, the fan-out of the start's
      write-backs, and materialization as optional slots on the command's own root that this member fills
      (`ProjectionRootState`, `lib/store/projection/process-state.ts`); the root binding, which binds the command's own
      checkout alone and which this member generalizes to bind any worktree's root; and the root hook, into which this
      member binds the materialize port (its § 2.2; § 2.1 here);
    - write-back's read path — parse-back, the kind's parser where it has one, the write check with a hand edit as its
      writer, the send against the base's record version, the store's merge, the read-back, and a clash found in the
      checkout — which the removal check and the persist and release steps run (`prepareWriteBack`,
      `lib/store/projection/write-back.ts`, which reads without writing), and its handling of each store refusal, a
      refusal naming a missing history ref pulled and retried once, which `arc save`'s start applies
      (`retryEndedItemHistory`) and the persist and release steps apply by wrapping their own store and reading
      `history` through a memo of their own over it (its § 6, § 7, § 8.4);
    - each content send's one-mutation admission batch, its preparation — the capture of the sending checkout's local
      state and retained bases and the shared planner (`prepareIndexedProjectionSubmission`,
      `lib/store/projection/submission.ts`; `planProjectionWrite`, `lib/store/projection/admission-planner.ts`) — which
      the removal check runs without its submission as a provisional feasibility check, and the accepted-input recording
      a send finishes before it prepares, with an accepted adoption's read-back, which only the walk's resumed read-back
      finishes (`resumeAdoptionReadBack`, `lib/store/projection/adoption-read-back.ts`), both of which the removal check
      holds and, in the target identity's roots, the persist and release steps finish under the target's lock where
      one arrives after it (its § 7.1, § 7.2, § 7.8, § 9);
    - edit rights and protected files (its § 8), whose claim reads and renders this member amends (§ 16.3 here), and
      adoption, which decides part of its verdict inline as it writes and mints and the rest in the shared planner, so
      this member extracts the inline part and, where adoption itself plans, runs the planner without its submission for
      the removal check to read without minting (its § 9; § 12.2 here);
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
  `lib/store/kinds/in-repo-registrations.ts`; `spec-projection-write-back.md` § 7.6). The seam's members fill each
  kind's parser and write check as they reroute its family. Three kinds whose content carries no parser-derived fields —
  `work-item/notes`, `personal/document`, and `personal/session-context` — keep an empty parser slot by design
  (`createKindRegistry`, `lib/store/registry.ts`; `spec-projection-write-back.md` § 7.6). Until a kind has its own
  rules, its files persist checked for links alone, as D5 lets a contract `write` land.
- **The ref backend** (`spec-storage-ref-backend.md`, shipped):
    - `checkSerializationRules`, exported from `lib/store/` (§ 5.6), which the removal check's projection part calls;
    - `changes` refusing `state-unresolvable` for a state version that no longer resolves, and, naming no history ref,
      for a window short of the current state version past more than one end of an item (§ 2.3, § 4.6; A38, A40), on
      either of which a refresh rebuilds the worktree (§ 15.2 here);
    - a write to a completed item refusing `state-unresolvable` where this clone lacks the item's history ref, and
      `pull({ history })` fetching that ref by name (§ 7.3, § 4.5), which `arc save` and the persist and release steps
      run and retry once through the shared history-retry helper (`pullHistoryForRetry`,
      `lib/store/pull-consumption.ts`) where the refusal names a history ref (`spec-projection-write-back.md` § 8.4); a
      write refusing `state-unresolvable` with no history ref — an unreadable captured object, or an anchor naming a
      state version this clone cannot resolve — takes no pull (`spec-projection-write-back.md` § 7.8);
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
      (§ 1.5 here);
    - a reader of a worktree's `.git` without a Git call, returning the worktree's Git directory and the common one
      (`readGitDirectories`, `lib/git/directories.ts`; § 4.2), which the index's location reads
      (`spec-projection-substrate.md` § 3.1) and which throws where `.git` is missing or its `gitdir:` marker is
      invalid.
- **`seam-decomposition`** (`spec-seam-decomposition.md`, shipped): the retiring verbs' removal decisions through
  `checkRetiringCheckout`, its own retirement among them (`lib/decompose/retirement-checkout.ts`;
  `spec-projection-substrate.md` § 12.5), and the source-conflict refusal's one remedy,
  `DECOMPOSE_SOURCE_CONFLICT_REMEDY` (`lib/decompose/source-conflicts.ts`), which names `arc save --resolve <token>`
  once `save` registers `--resolve`, held by its integration test (its § 18; `spec-projection-write-back.md` § 6.5).
- **`storage-ref-hardening`** (shipped, PR #1271; the second member depended on it, § 1.1): the listing scope, the fault
  classes and remedies for missing or misplaced objects, and the sweep of the pull results' consumers, which
  write-back, the refresh, the fan-out, and the persist and release steps observe (§ 15.2, § 15.5 here,
  `spec-projection-write-back.md` § 7.8, § 8.4). As shipped, a missing or damaged object still takes one of two fault
  classes, recoverable `state-unresolvable` or terminal `namespace-corrupt` (`refObjectFault`,
  `lib/store/ref/object-fault.ts`), and no refusal code or result field was added; a refusal names a history ref only
  in `state-unresolvable`'s `historyRefs`, where the item's owner has no live ref (`missingHistoryRefs`,
  `lib/store/ref/missing-history.ts`). § 12.2, § 15.2, `spec-projection-write-back.md` § 7.8, and § 8.4 key their
  handling on that code and that field. The listing scope narrows `list` by its existing `owner` input, and a complete
  live listing that finds nothing answers `absent` (§ 15.2). The history retry `spec-projection-write-back.md` § 8.4
  names is `pullHistoryForRetry` (`lib/store/pull-consumption.ts`), with which `retryEndedItemHistory`
  (`lib/store/history-retry.ts`) wraps a store.
- **`cohort-identity-verbs`** (`spec-cohort-identity-verbs.md`, shipped, PR #1309): a read of a cohort by name that
  refuses `ambiguous-match` where two cohorts hold the name, its remedy naming each by UID
  (`lib/store/ref/reference-resolution.ts`), and readers outside its resolution rule keeping the `Cohort` field's text
  (its § 3.2, § 7.3), which the cohort copies follow (§ 15.2 here); the cohort arm of `arc rename`, and
  `arc cohort close` and `arc cohort remove` (`commands/cohort.ts`), whose writes re-lay the copies § 15.2 and § 15.4
  count (its § 5, § 8); and the work-unit arm of `arc rename`, which finds its subject's checkout by UID from any
  checkout and may move a folder the command holds (its § 2.4; § 2.2 here).
- **`storage-cutover`:** the flip and its first full materialization; a quiesce that locks every work-item worktree
  still unlocked (`spec-projection-substrate.md` § 12.7); projected roots that hold, from the flip, no tracked file and
  no file ARC installs — the shared roots' files untracked once their records are imported, and the installer writing
  nothing into a projected root (`lib/classification.ts`): not `completed/README.md`, which no record claims, so it
  stays unadopted and refuses every removal (§ 12.2, `spec-projection-write-back.md` § 9), nor the `backlog/` inbox
  template, which installs at the path the projection writes the project inbox to (`lib/layout/projection.ts`), so an
  install there writes over a projected file, while the ROADMAP template's install entries leave in the flip change; the
  live rehearsal, which inventories every hand-editable projected kind's parser or its named intentional exception and
  every entry kind's declared entry shape (`spec-projection-write-back.md` § 7.6); the flip's workflow rewrite, which
  names `arc save` where workflows name `arc user save` (`spec-projection-substrate.md` § 12.6); the deletion pass,
  which removes the user-surface rooting and its migration (§ 12.8); and the documentation pass, which rewrites
  `strategy-work-organization.md` § Per-Worktree Isolation and its acceptance test (§ 10.5) and moves
  `archive-work-unit`'s errata convention onto the store's history (`spec-projection-write-back.md` § 8.4).
- **`config-storage-architecture`:** the per-developer tier, to which the in-flight view setting moves (§ 10.4), and the
  move of the checkout marker, the pristine store, and the generated schemas from `.arc/system/.internal/` into
  `.arc/system/.local/` (§ 12.9), after `seam-locus`'s marker work lands.
- **`framework-core-from-package`:** the installed package as a second, read-only source (§ 14), with what a read-only
  source adds — its own state version in the index and its files' protection — and adding its `.arc/system/` paths to
  the exclude writer's list.

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
- **Trust boundary.** A hand edit is untrusted input. It reaches the store only through its kind's parser where one is
  registered (`spec-projection-write-back.md` § 7.6 names the three kinds without one), the write check with a hand edit
  as the writer, and the backend's own checks at the write, which parse a stale base's merged content where a parser is
  registered and enforce the authority rules however the edit arrives (`spec-projection-write-back.md` § 7). Write-back
  sets its provenance itself, never from the file (`spec-projection-write-back.md` § 7.4), and the serialization rules
  refuse binary content, oversized records, `.env` files, and private keys (`spec-projection-write-back.md` § 7.5).
- **Ignore integrity.** The guard keeps every projected path ignored, `.arc/user/*/` in `.gitignore` itself, so no
  packaging tool ships personal state (`spec-projection-substrate.md` § 11.2).
- **Performance.** Full-round budgets and named references apply separately to Linux, Windows, and macOS (A4, § 15.3,
  § 15.4); raw tripwires remain visible and host-Git credit requires demonstrated exposed delay. The archive stays cold.
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
4. **The budget holds.** The no-change overhead stays within 10 ms on Linux and macOS and 60 ms on Windows, and at this
   repository's size the tripwires hold: the command start, a full materialization, and a one-file fan-out of a record
   that is not a primary into 20 worktrees each measure within their bounds on every platform, and a ten-file fan-out
   into 20 worktrees within its bound on Linux and macOS, its Windows median recorded against the bound § 15.4 expects
   it to reach. On Windows each of these is read past the host's Git cost: a median counts against its bound less the
   amount by which its Git calls' time on that host exceeds the longer of 42 ms a call, what § Spike 2 measured, and the
   projection's own work run beneath them, and never above its measurement. The calls' time is taken from the tripwire
   suite's medians on that host — two calls run at once for calls that ran at once, which count as one call, and one
   call's for each other — and the work beneath them from the suite's time for that work run alone, so the projection is
   held to its own share (§ 15.3, § 15.4).
5. **Dark before the flip.** Over the in-repo implementation the removal slots pass.
6. **A verb's write joins the selection's changes.** A verb run from the checkout marks the files its write changes
   there, so `arc selection --changed` lists them (§ 11.7).
7. **The projection stays out of the `.worktreeinclude` copy.** From the flip the copy skips the projected roots and
   `.arc/system/.local/`.
8. **The quality gates pass** at every gate the project declares.

9. **An installing file stays detectable across reference advances (A1).** A same-size save in the staged file's
   timestamp tick is detected after another partition advances the shared reference, while the saved file's own
   partition is neither loaded nor rewritten by that unrelated write. A later clean, value-equal publication writes
   no partition.

10. **Path reuse preserves record ownership (A2).** A new record arriving at a vacated path remains retryable until
    installed. Saves during removal, exclusive linking, and interrupted installation, in every save mode and for
    unstamped files too, are never sent to the other record. Proven installations resume automatically; ambiguous bytes
    remain recoverable and reported, and deleting the withheld file permits successful continuation. A blocked arrival
    after a claim-only change retries successfully without an intervening store write, including a return to the
    original claim after partial progress or interruption.

11. **Full-round performance holds on all three references (A4; supersedes criterion 4).** Over the ref backend with
    real repositories and worktrees, the external median of eleven complete no-change starts, the one-file
    non-primary backlog notes fan-out into twenty linked worktrees, the ten-file fan-out, and full materialization fit their
    separate platform bounds in § 15.3 and § 15.4. Each platform names its own measured reference and exact source head,
    retains all raw samples and same-run Git and filesystem baselines, and reports any host adjustment separately under
    § 15.3's exposed-delay rule. The interleaved standard/expanded comparison shows no systematic start cost from
    settled archive entry growth, and a deliberately unreadable settled archive partition remains unconsulted at start
    and end. Runtime tripwires use the declared platform bounds and raw nine-sample medians. Sequential sibling visits
    and the durable intent/final publication boundaries remain.

12. **Removal compositions carry projection authority (A5).** Executable retirement contexts refuse a held projected
    edit, retain the checkout and claim, and succeed after repair. Static lint rejects missing slots at the direct
    start spawn, rename apply/rollback, and legacy park/abandon compositions. Their Store and identity forwarding is
    inspected, and factory tests distinguish enabled/disabled capability, unavailable command identity, and mint-port
    precedence and command lifetime.

13. **Unindexed personal bytes survive destructive retirement (A6).** With state off branch, an ARC-managed checkout
    holding no projection/index refuses destructive removal over non-machine-local regular files under `.arc/user/*/`,
    naming their local paths and explicit recovery. Refusal retains bytes and topology; recovery permits retry without
    ARC touching the primary. Empty/machine-local-only targets need no identity, release retains its current success,
    missing folders and disabled capability perform no residual scan, unreadability refuses, and links are not followed.
    Failed transient setup observes the same protection before compensation clears its pending marker: residual or read
    failure retains checkout, branch, marker and claim with recovery detail; repaired setup resumes that same claim,
    while empty/machine-local-only and capability-off compensation retain their cleanup behavior.

14. **A rebuild converges once its evidence returns (A7).** While its evidence is not whole, a rebuild with no usable
    index withholds every file at a path it lays no stored record at under the held mark, which the removal check and
    the persist and release steps refuse over as over any withheld file, and publishes no state version; once the
    reported condition is resolved, the next rebuild settles each held file at a path it lays a stored record at by
    § 2.5's rule, with no store write, where no link at or above it blocks that path and the checkout can write it, and
    the next rebuild or full materialization other than `arc sync`'s gives one still at a path it lays no stored record
    at the ordinary withheld mark.

## Open Questions

None blocks starting. The expected contracts in § 18 each state what holds until their change lands, and none leaves
this design open.

## Amendments

- **A1** — 2026-11-10 — design: smudge installing entries. _Supersedes:_ § 16.2 ¶3.
  _Trigger:_ 1.2 must-stop. _Work:_ 1.2.R. _Revalidated:_ 1.14.

- **A2** — 2026-11-10 — design: retain ownership during path reuse. _Supersedes:_ § 15.2 ¶2.
  _Trigger:_ 1.6.a must-stop. _Work:_ 1.6.R. _Revalidated:_ 1.14.

- **A4** — 2026-11-11 — design: rebase full-round bounds. _Supersedes:_ Goal 5; § 15.3–15.4; § 15.5 ¶1;
  Cross-cutting Considerations, "Performance"; criterion 4. _Trigger:_ 1.12.a door. _Work:_ 1.12.R. _Revalidated:_ 1.14.

- **A5** — 2026-11-12 — design: verify inert removal bindings statically. _Supersedes:_ Task 2.4.b tests.
  _Trigger:_ 2.4.b must-stop. _Work:_ 2.4.R. _Revalidated:_ 2.8.

- **A6** — 2026-11-12 — design: protect unindexed personal files. _Supersedes:_ § 12.2 no-index fast paths.
  _Trigger:_ 2.5 must-stop. _Work:_ 2.5.R. _Revalidated:_ 2.8.

- **A7** — 2026-11-13 — spec-depth: hold files a no-index rebuild cannot place. _Supersedes:_ § 15.2 ¶5; § 16.1 ¶3;
  § 17 item 8; the withheld term. _Trigger:_ F2, F8 review. _Work:_ review-fix. _Revalidated:_ pending → 3.1.

- **Amended 2026-11-06, at task generation (Owner-approved).** Grounding the task list against `projection-substrate`
  and `storage-ref-hardening` as shipped (#1247, #1271) and `projection-write-back` at its branch head corrected this
  specification in place:
    - § 14, Non-Goals, and § 12.2: this member builds the source seam, with the store as the only source; a read-only
      source's protection and each source's own state version move to `framework-core-from-package`, to be shaped
      against the source that needs them.
    - § 15.2: a listing answering `absent`, which the ref backend answers since `storage-ref-hardening` for a complete
      live listing that finds nothing, counts as evidence for removal.
    - § 15.3, § 15.4, and Success Criterion 4: macOS takes Linux's bounds, and the one-file fan-out held to its tripwire
      writes a record that is not a primary.
    - § 2.5: a spawn's materialization that fails, or finds no port bound, is left to the worktree's first command.
    - § 12.2 and § 12.3: the removal check reads adoption's whole verdict through one read-only verdict this member
      extracts from adoption, and the end of an Errand on the primary runs the release step before its claim clears.
    - § 18: `storage-ref-hardening`'s entry restated as shipped; `projection-write-back`'s as it built the slots, the
      root binding, and the root hook; the ref backend's without the Windows burst skip `storage-ref-hardening`
      removed; and base-stamp recovery's `history` bound as one call per record between the command's write-backs.
    - § 12.2, § 18, and Cross-cutting Considerations: `projection-write-back`'s amendment A3 names three kinds that
      keep no parser by design (`work-item/notes`, `personal/document`, `personal/session-context`), so a hand edit
      runs its kind's parser where one is registered, and the live rehearsal inventories each hand-editable kind's
      parser or its named exception; the record kinds' entry cites `composeLinkChecks` in
      `lib/store/kinds/in-repo-registrations.ts`, where it is defined.
- **Amended 2026-11-06, at the task list's independent review (Owner-approved).** Its first pass found the binder
  `projection-write-back` built reading each checkout's configuration and machine id with a Git call apiece, and the
  fan-out's fault and layout rules unstated:
    - § 15.3 and § 15.5: the actor reads the machine id at the location's common Git directory once per command, so the
      start makes its two Git calls only, and a fan-out binds every worktree with the command's own configuration read
      and actor, adding no Git call per worktree.
    - § 2.2: a fan-out skips a worktree whose fresh claim or `layout.active`, or the command's view setting or
      identity, differs from what its index records it was projected under; and a fault fanning out into one worktree
      is reported and skips it, never failing the write it follows.
    - § 2.5: a linked worktree holds the npm policy the guard requires as the repository tracks it, and where it is
      absent the guard refuses every root, a spawn reporting a failed materialization.
    - § 11.7: a rebuild with no usable index marks only the files it found on disk, so a fresh worktree's
      materialization marks nothing.
- **Amended 2026-11-06, at the task list's first fix check (Owner-approved).** The check found the previous amendment's
  shared configuration read and fan-out rules incomplete:
    - § 12.2: each removal slot reads the target's own configuration, so its identity's personal root and edit rights
      govern; only the fan-out binds with the command's. A failed read of the target's configuration or marker answers
      the check's `unobservable`.
    - § 2.2: a fan-out also skips a sibling whose index's guard last passed under another ignore configuration, and a
      checkout this command's persist or release step is retiring; it reprojects the writer's own worktree in place
      rather than skipping it, so a verb's changed marks land; and an edit the command's end takes in gets no fan-out of
      its own.
    - § 2.5: a linked worktree holds the npm policy only where the repository tracks it, as this repository does from
      this change.
- **Amended 2026-11-06, at the task list's second fix check (Owner-approved).** The check found the first fix check's
  rules unstated at sites they govern:
    - § 17 item 11 and § 1.2: an edit the command's end takes in reaches the other worktrees at their next command start
      or the next fan-out, a residual Goal 2 and Success Criterion 1 already defer to.
    - § 2.5, § 12.2, § 15.3: the identity, and the actor that follows it, come from the read a binding uses — the
      command's for a fan-out, the target's own for a removal slot or a spawned worktree; a spawned worktree with no
      identity is not materialized; the check's cost names its configuration read.
    - § 15.5: a sibling, never the writer's own worktree, is skipped for a difference, its ignore configuration among
      the values compared.
    - § 2.2: a fan-out re-reads a worktree it already holds a root for into that root; it skips a sibling whose
      index records no guard pass, before any guard runs; and its retiring skip covers the persist step's target and a
      linked checkout whose projection the release step removes, never the primary.
    - § 2.5: the npm policy's remedy names committing the file the installer writes.
- **Amended 2026-11-06, at the task list's third fix check (Owner-approved).** The check found the second fix check's
  rule for a held root stated for the fan-out alone:
    - § 2.2: a fan-out visit compares the command's values whatever read bound the root the command holds, and the
      persist and release steps hold no root of their own.
    - § 15.5: a sibling whose index records no guard pass is skipped before any guard runs there.
- **Amended 2026-11-06, at the task list's fourth fix check (Owner-approved).** The check found the third fix check's
  held-root rule and its reason incomplete:
    - § 12.3: a linked release runs the second check over its removal swaps' copies before it removes the aside folder.
    - § 2.2, § 2.5, § 15.5: a worktree a spawn materialized earlier in the command is a held root like any other; the
      persist and release steps hold none because the end must never check a checkout they retire, a copy either leaves
      settling at the target's next sweep or the retry's takeover.
- **Amended 2026-11-06, at the task list's second adversarial pass (Owner-approved).** The pass found the no-change
  budget resting on an engine that renews its lease on disk before every file, and the store-backed teardown merging
  user surfaces:
    - § 15.3, § 16: a projection-lock step confirms ownership on disk only near its lease's deadline, a forward
      amendment to `spec-projection-substrate.md` § 3.2 stated in the new § 16.2; the start's walk and change checks
      stat as Spike 2 found fastest on each platform; and the end takes no lock where it has nothing to settle.
    - § 12.8: from the flip no removal merges a linked worktree's user surfaces into the primary's or reads whether
      it could; the in-repo paths keep merging.
    - § 18: `projection-substrate`'s entry reads shipped, as § 16 states.
- **Amended 2026-11-06, at the first fix check after the task list's second adversarial pass (Owner-approved).** The
  check found the no-change rules incomplete:
    - § 15.3: the start writes its index once, last, carrying its measurement and the stats its change checks
      re-recorded, the sweep writing on its own only where it took over a copy; the walk reads its folders
      synchronously; macOS follows Linux's stat untested.
    - § 16: the introduction covers `projection-write-back`, and the new § 16.3 states the end's no-lock rule against
      its § 2.2.
- **Amended 2026-11-06, at the second fix check after the task list's second adversarial pass (Owner-approved).** The
  check found the start's index and walk order misstated:
    - § 15.3: the start keeps one index in memory through the refresh to its last write, so each write publishes what
      was observed before it; the start issues both Git calls before its walk, which counts serially; § 13 says the
      same.
- **Amended 2026-11-06, at the third fix check after the task list's second adversarial pass (Owner-approved).** The
  check found the index's route missing the reprojection, and the walk's order loosely named:
    - § 15.3: a reprojection takes and returns the held index like the refresh, and a fan-out's visit holds its index
      the same way; the Git calls are issued before the folder walk, the personal roots' walk waiting for the identity.
    - § 13: the folder walk is named.
- **Amended 2026-11-06, at the fourth fix check after the task list's second adversarial pass (Owner-approved).** The
  check found one site of the retired wording:
    - § 15.5: the Windows Git calls' response reads "issued together", as § 15.3 does.
- **Amended 2026-11-06, at the task list's third adversarial pass (Owner-approved).** The pass found the persist step's
  refusals narrower than write-back's pending answers, and the fan-out's shared listing loosely bounded:
    - § 12.2: the check answers `would-refuse` for a file write-back's read path holds pending for any cause but a store
      read's refusal; the persist step refuses on every pending answer, with the remedy write-back reports or a retry
      where it reports none, its aside-copy takeover alike.
    - § 12.3: the release's removal swap refuses on a deferred or pending take-in the same way.
    - § 2.2: a primary entry's re-lay lists its owner's records once per round of a fan-out.
- **Amended 2026-11-06, at the first fix check after the task list's third adversarial pass (Owner-approved).** The
  check found the fan-out's shared reads and the steps' own memo incompletely stated:
    - § 2.2, § 15.5: each round of a fan-out makes `version()`, `changes`, and each read and listing its refreshes need
      once, shared by every worktree, § 15.5 counting the shared `read`.
    - § 2.1, § 18: the persist and release steps read `history` through a memo of their own, a landing there dropping
      the record from the command's memo too.
    - § 12.2: an unreadable retained base holds pending a file other than Markdown.
- **Amended 2026-11-07 — a pull's merges reach other worktrees at their next command (Owner-approved).** The scale
  assessment found a pull's fan-out costing the team's merges once per worktree (`notes-projection-worktrees.md`
  § Spike 4):
    - § 2.2, the glossary, § 1.2, § 1.5, § 15.4, § 15.5, § 18, and Testing: a pull's or push's merges refresh only the
      worktree that ran it, every other catching up at its next command's start; ADR-035 item 7 takes a dated amendment
      saying so.
    - § 17 item 12: a copy behind a pull until its worktree's next command.
    - Success Criterion 1 read "reach every other worktree's copy at the writer's fan-out, a pull's merges included" and
      now reads "reach every other worktree's copy at the writer's fan-out, and a pull's or push's merges at each
      worktree's next command".
    - Non-Goals: narrowing what a worktree projects of `backlog/` or `completed/`, and a read-only archive, are left
      out, over the partitions' seams (§ 3.1).
- **Amended 2026-11-07, at the re-entry after the task list's third adversarial pass (Owner-approved).** A count of
  protection's reads and a scale assessment found the index's codec and protection observed in each render missing
  § 15.3's and § 15.5's bounds at this repository's size:
    - § 3.1: the index is a header and partitions, read as plain JSON, a partition by its blob id; the root groups and
      the header's commit point are fixed seams.
    - § 15.3: the codec's cost, a command reading only its walked roots' partitions, and the Windows budget resting on
      the walk's measured cost.
    - § 15.5: a visited worktree reads only its header and the partitions it lays into; protection from the round's
      evidence; the view selection and conflict reads counted.
    - § 2.2: protection's reads shared by the round. § 16.2: the index's form. § 16.3: rights reading only the file's
      own work unit's claim, a refresh's renders observing protection through its own evidence, and the start's index
      read. § 17 item 7: a marker moved during a refresh. § 18: the index's form and the rights amendments named. § 1.3:
      both in the first review chunk.
- **Amended 2026-11-07 — the start's walk, index read, and stats run while its Git calls do (Owner-approved).** A
  measurement on the Windows runner found the walk run in one piece holding back the store's Git process, so the walk,
  the index read, and the stats added to the Git calls rather than running beside them (`notes-projection-worktrees.md`
  § Spike 5):
    - § 15.3: the start reads the header and its walked partitions, walks, and stats while its Git calls run, the walk
      yielding between folders; the change checks compare those stats where the sweep found the aside folder empty. This
      reverses the wording the second fix check after the task list's second adversarial pass set, that the walk counts
      serially, which described the order then designed; the order itself changes here.
    - § 15.3: what is left on Windows is the Git calls' own cost on the host, which the tripwire suite reports beside
      its median.
    - § 13: the walk runs while the Git calls do.
- **Amended 2026-11-07, at the fresh review loop's first pass (Owner-approved).** The pass found a pull's catch-up laid
  by the next write's fan-out, Success Criterion 4 unreadable where a host's Git costs more than § Spike 2's, and the
  partitioned index's passes over every entry and its mismatch handling unstated (`notes-projection-worktrees.md`
  § Spike 4, § Spike 5):
    - § 2.2, the glossary, § 1.2, § 1.5, § 15.4, § 18, and Testing: a pull's or push's merges fan out to every worktree
      again, reversing the amendment "a pull's merges reach other worktrees at their next command", whose cost
      comparison set the unpartitioned design's pull against the partitioned one's; a later write's fan-out would have
      laid the same merges. § 15.5 states the partitioned pull's cost; § 17 item 12 is removed, and ADR-035 takes no
      amendment.
    - Success Criterion 1 read "reach every other worktree's copy at the writer's fan-out, and a pull's or push's merges
      at each worktree's next command" and reads again "reach every other worktree's copy at the writer's fan-out, a
      pull's merges included".
    - Success Criterion 4 adds its last sentence, reading each Windows median past the host's Git cost; § 15.3, § 15.4,
      and the performance line state the reading.
    - § 3.1, § 15.3, § 15.5, § 16.2, and § 16.3: the header marks each partition holding an unsettled entry, and a pass
      over every entry reads the partitions its command walks and the marked ones; a partition is written only where an
      entry in it changed in value, and neither reads nor writes run the schema.
    - § 3.1 and § 16.2: a mismatched partition found after the start's read is deleted, never the header, the command
      ending its use of its index as a lost lease does; a fan-out's visit deletes nothing; and § 3.1 names the status
      report, the selection, and the overlap advisory among the readers holding no lock.
    - § 15.5: the owner's own checkout reads its claim where it is the writer's.
- **Amended 2026-11-07, at the fresh review loop's first fix check (Owner-approved).** The check found the partition
  marked for marks no pass over every entry reads, a mismatch's recovery naming a start that never rebuilds, two passes
  over every entry unstated, a pull's deferred fan-out unstated, and Success Criterion 4's reading underdetermined; the
  Owner kept this member whole above the boundary marks:
    - § 3.1: a changed or in-progress mark leaves a partition unmarked; the rebuild a state version that no longer
      resolves takes reads every partition, as § 15.2 states; a fan-out's visit to the writer's own worktree deletes
      nothing either.
    - § 3.1 and § 2.5: a checkout § 2.5 gives no projection that holds an index it cannot use is rebuilt at its start;
      the removal check and the persist and release steps name `arc save` for a partition that does not hash to its
      name.
    - § 2.2: a write, pull, or push made under a projection lock fans out once it is released, a history pull among
      them, and the order a fan-out visits worktrees in changes nothing it lays.
    - Success Criterion 4's last sentence read "a median counts against its bound with the time its Git calls took on
      that host replaced by 42 ms a call, what § Spike 2 measured, calls that ran at once counting as one" and reads "a
      median counts against its bound less the amount by which its Git calls' time on that host exceeds 42 ms a call,
      what § Spike 2 measured, and never above its measurement", the host's time taken from the tripwire suite's
      medians; § 15.3 and § 15.4 follow.
    - § 1.1 records why this member stays whole, and § 1.3 orders its change set in four review chunks.
- **Amended 2026-11-07, at the fresh review loop's second fix check (Owner-approved).** The check found the four chunks
  unplaceable as written, the mismatch's delete reaching the end in other worktrees and missing `arc sync`, § 16.2 not
  stating the changes to the index a command cannot use, and Success Criterion 4's reading crediting the projection's
  own work beneath slow Git calls:
    - § 3.1 and § 16.2: a mismatch is deleted only in the command's own worktree, in the start's refresh, at its end, or
      in `arc sync`'s materialization; a fan-out's visit and the end in another worktree the fan-out visited delete
      nothing. § 16.2 states § 3.1's changes to the index a command cannot use.
    - § 1.3: each chunk names its § 16.2 and § 16.3 amendments, and a test that exercises a later chunk's code lands
      with that chunk.
    - Success Criterion 4's last sentence read "exceeds 42 ms a call, what § Spike 2 measured, and never above its
      measurement, the host's time taken from the tripwire suite's medians there" and reads "exceeds the longer of 42 ms
      a call, what § Spike 2 measured, and the projection's own work run beneath them, and never above its measurement",
      that work taken from the suite's time for it run alone; § 15.3 and § 15.4 follow.
- **Amended 2026-11-07, at the fresh review loop's third fix check (Owner-approved).** The check found chunks whose code
  had no tests of its own, the second chunk taking the index the third had the start hold, and scratch built outside the
  chunk § 1.3 named it in: § 1.3 has each chunk land with tests of its own code that need no later chunk's; protection
  read once per round, the index the start holds from its sweep, and the checkout's scratch folder move to the second
  chunk, the fourth keeping § 12.9's machine-local paths; § 1.1's description of the cut follows.
- **Amended 2026-11-07, at the fresh review loop's fourth fix check (Owner-approved).** The check found the fan-out's
  skip of a checkout marked retiring placed in the second chunk while the persist and release steps that mark it land in
  the fourth: § 1.3's fourth chunk names that skip (§ 2.2), which lands with the mark.
- **Amended 2026-11-07, at the fresh review loop's second pass (Owner-approved).** The pass found the creation batch's
  fan-out laying a new work unit's meta while the marker naming it is unbound, a target whose own identity differs from
  the command's read through the command's store, which reads person-owned state under the command's identity alone, and
  the fan-out's configuration read unstated where the start kept none:
    - § 2.2 and § 16.3: `arc start --new` holds its creation batch's fan-out until it has stamped the marker's UID, so
      an unbound marker stays a repair state.
    - § 2.5, § 12.2, and § 15.3: a spawned worktree whose own identity differs from the command's is left to its first
      command, and a removal slot's target of another identity is refused naming the removal run from that checkout,
      where § 2.5 had a spawned worktree materialized and a slot's target checked under its own identity.
    - § 2.5 and § 15.5: the start keeps its configuration read whatever it answers, and the fan-out reads one in the
      writer's checkout where a held lock left the start none.
    - § 3.1: each identity's personal root is a root group of its own.
- **Amended 2026-11-07, at the first fix check after the fresh review loop's second pass (Owner-approved).** The check
  found the previous identity's personal root removed where edit rights and the writable roots forbid it, the repair of
  a creation's refused stamp leaving the meta protected, the creation hold's provenance and reach unstated, the removal
  remedy naming a removal where the check cannot tell, and the command's read unsourced where its start made none:
    - § 10.4: the previous identity's personal root is left as it is, where it read "the personal roots following a
      changed identity"; the index records the claim's slug with the marker's UID, so a bind that keeps the slug
      reprojects.
    - § 2.2 and § 17 item 7: the creation hold keeps the batch the verb's own and covers this process's fan-out; a
      render another process makes in the window is reprojected once the UID is bound or lags as item 7 says.
    - § 2.5, § 12.2, and § 15.5: the command's read is `observeProjectionConfiguration`'s for its checkout, made on
      first need where the start made none, and the removal remedy names the removal or release run from that checkout.
- **Amended 2026-11-07, at the second fix check after the fresh review loop's second pass (Owner-approved).** The check
  found the new worktree of `arc start --new` skipped by the creation's own fan-out once the stamp binds its UID, and
  the previous identity's personal root unread by the removal check and the persist and release steps and listed by the
  selection:
    - § 2.2: a worktree a spawn materialized earlier in the command, like the writer's own, is reprojected in place for
      a difference in its claim or `layout.active` alone, where it was skipped as any sibling whose claim differs.
    - § 2.5: the index a materialization writes records the guard's pass and the ignore files.
    - § 10.4, § 11.7, § 12.2, § 12.3, and § 16.1: the removal check and the persist and release steps read every other
      identity's personal root present, where they read every projected root alone, and the selection lists none of its
      files; the claim's read returns the marker's UID.
- **Amended 2026-11-07, at the third fix check after the fresh review loop's second pass (Owner-approved).** The check
  found the marker's UID placed on the layout context other readers take whole, and the materialization's guard record
  attributed to the guard alone:
    - § 10.4: the binder's read of the claim returns the UID beside the layout context, leaving that context's shape as
      it is, where it read "which the claim's read returns from the marker it already decodes".
    - § 2.5: the materialization runs the guard through the ignore check a command's start runs and records that check's
      result, where it read "The index it writes records the guard's pass and the ignore files as a command's start
      records them".
- **Amended 2026-11-10, regrounded on the shipped `projection-write-back` and `cohort-identity-verbs`
  (Owner-approved).** Write-back shipped with each content send prepared and admitted as one batch, an unreadable
  retained base held for any format, and accepted-input recording beside an accepted adoption's read-back; a work
  unit's rename, run from any checkout, may move a worktree the command holds; and cohorts gained identity verbs. The
  spec's text changes to match:
    - § 1.5: the multi-process lane counts a `projection-admission` version conflict as pending, where it named none.
    - § 2.2: a new bullet states what a fan-out and the persist and release steps fence, and a checkout the command
      moves has its held root dropped, its copies left to its next command's sweep, where neither was stated.
    - § 12.2: the check's `would-refuse` states add a preparation's refusal other than a store read's and a retained
      base unreadable for any format, and hold an unfinished recording or an adoption's uninstalled read-back
      deliberately, since finishing either writes, such an entry in another identity's personal root naming that
      identity's remedy; it runs the send's preparation without its submission; adoption's verdict is read in two parts,
      the planner only where adoption plans and an existing record through the read path alone; the check's frame
      excepts a new file under a prospective owner, whose content checks wait for the mint, as Task 2.1's Goal now
      does, where it read "the check never passes a file the persist step would refuse"; and the persist step sends
      each file as its own admission batch, finishing a recording that arrives after the check as the command's walk
      does. It read "held pending by write-back's read path for any other cause but a store read's refusal", "through
      one read-only verdict this member extracts from adoption", "each file as its own write", and "a retained base
      write-back cannot read for a file other than Markdown, or an adoption's read-back still owed".
    - § 13 and § 15.5: a send adds two configuration reads in its checkout in the usual case, where the Git calls were
      stated for a command that sends nothing.
    - § 15: `history` is read also for an accepted-input recording, and prepared admission repeats only the queries its
      preparation requires, where it read "only where `spec-projection-substrate.md` § 3.5 names".
    - § 15.2: a `current/` cohort copy is named by the `Cohort` field's text, and a refused cohort read never refuses
      the command, where neither was stated. § 15.4 adds a cohort rename's listings to the fan-out tripwire's note.
    - § 16.3: the rights rule covers the admission planner's branch, and a send's capture reads its own root group,
      where neither was stated; the start's filter is cited at `engine-start.ts:40`, where it read `:39`.
    - § 18: `projection-write-back` reads shipped, its admission and recording are listed, and adoption's verdict is
      split, where it read "planned" and "decides its verdict inline as it writes and mints"; the comparison with
      `runStoreRename`, which now pulls in rounds, is dropped; and `cohort-identity-verbs` gains an entry.
- **Amended 2026-11-06 — `storage-cutover` was cut into the subcohort `state-storage/storage-cutover` (2026-11-03).**
  Each mention of `storage-cutover` reads as the member that now owns the work: the flip, its first full
  materialization, the quiesce, the live rehearsal, the workflow rewrite, and the installer's projected-root and
  template changes are `cutover-flip`'s; the deletion pass that removes the user-surface rooting and its migration with
  the in-repo arms is `cutover-tracked-state-removal`'s; and the documentation pass — § Per-Worktree Isolation and its
  acceptance test, and the errata convention — is `cutover-documentation`'s.

---
