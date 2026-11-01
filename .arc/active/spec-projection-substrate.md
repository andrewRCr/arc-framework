# Spec (`detailed` · `RFC`): projection-substrate

- **Origin:** [internal] — the `storage-projection` cut (2026-10-30); stage 2 of the storage program.

- **Purpose:** Build the part of the working copy that needs no store: the ignore strategy that keeps every projected
  path ignored and searchable, each worktree's record of what it wrote and how an edit there is detected, reading and
  replacing a file without losing a save timed into it, and the worktree lock that keeps ARC from removing a checkout
  before its edits persist — the first of the three members that build the behavior the storage contract settled in D13
  and D17.

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
- **Notice line** — an HTML comment opening `<!-- arc-notice:` in the block directly after the base stamp, which the
  store never holds: a protected file's (`spec-projection-write-back.md` § 8.2) or a conflict's
  (`spec-projection-write-back.md` § 6.3). Only lines of that form in that block are stripped, so a person's own HTML
  comment stays content.
- **Index** — the projection's per-worktree record of what it wrote there (§ 3.1).
- **Projection lock** — the projection's per-worktree advisory lock over its own reads and writes there (§ 3.2).
  **Worktree lock** — D17's `git worktree lock`, which only blocks a checkout's removal (§ 12.1).
- **Aside folder** — the per-worktree folder holding copies of replaced files and staged replacements (§ 5.4).
- **Racy rule** — change detection after Git's: a file whose stat matches its index entry is clean only when its
  modification time is older than the index's reference stamp in the aside folder; otherwise its content is hashed and
  compared with what the projection last wrote there (§ 3.3).
- **Settle rule** — a file modified within the last 50 ms is read only once two stats 15 ms apart agree, up to three
  tries, else it waits for the next command; an empty projected Markdown file is never an edit (§ 4).
- **Replace guard, swap, aside copy** — before replacing a file, a refresh re-checks it by the racy rule and takes any
  edit in first: the replace guard (§ 5.1). The replacement, the swap, renames the file into the aside folder as an
  aside copy, hard-links the staged file onto the path, and checks the copy at once and again at the command's end, its
  second check (§ 5.2). A save that landed in a copy is taken in only while the copy's path has not moved on — still
  holds what the swap linked, or is absent, with no write-back of it sent since the swap; a copy whose path has moved on
  is kept and reported with its path until the person deletes it. Removing a file is the swap without the link, the
  removal swap (§ 5.6); rebuilding an absent file is the link alone (§ 5.5); and every command sweeps the copies a
  stopped writer left before write-back reads any file (§ 5.4).
- **Take-in port** — the one interface through which reading and replacing hand an edit to write-back, which answers
  `no-edit`, `taken-in`, `deferred`, `refused`, `unparseable`, `clashed`, or `pending` (§ 5.1).
- **Pending, refused, withheld, and changed marks** — the index's per-file marks (§ 3.1): a refresh or write-back still
  owed; the last write-back's refusal, with its typed reason and remedy; a file or aside copy a rebuild with no usable
  index left as it was, which nothing writes over or sends until the person deletes it (`spec-projection-worktrees.md`
  § 2.5); and an edit made in this checkout since its last `arc save` (`spec-projection-write-back.md` § 11.7).
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
- **This member** — `projection-substrate`, the work unit this specification builds; a passage that means a sibling
  member names it.
- **Section numbers** — the design's own, kept with their gaps. Each member's specification holds its own § 1,
  § 16–§ 18, and Success Criteria; outside them a number names one section in every member's specification. The Goals
  and the Proposed Design map cover the whole design, so their citations name the design's sections wherever they are
  built. Elsewhere, a citation of a section this specification does not hold names the sibling specification that holds
  it: `spec-projection-write-back.md` builds § 2.1's process-state module, § 2.2's start, end, and report, § 2.3,
  § 2.4's `arc save`, § 6–§ 9, § 10.1–§ 10.4 but for reprojection, § 11.4, § 11.7 but for the changed mark a verb's
  fan-out, a refresh, and a rebuild set or move, and § 15.1, and `spec-projection-worktrees.md` builds § 2.2's fan-out,
  § 2.4's `arc sync`, § 2.5, § 10.3's and § 10.4's reprojection, § 10.5, § 11.6, § 11.7's changed mark at a verb's
  fan-out, a refresh, and a rebuild, § 12.2, § 12.3, § 12.8, § 12.9's `.internal/` entries and scratch, § 14, and
  § 15.2–§ 15.5 but for the configuration read. § 18 states what this member consumes from each sibling, and this
  specification copies the sibling passages it builds against: here § 2.1's process-state module and § 2.5's identity
  paragraph.

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

- **build what its sibling members build:** write-back, conflicts, edit rights, the `active/` layout, adoption, the
  settings, and the selection (`projection-write-back`), and refresh, fan-out, materialization, the tripwires, the
  removal slots, and the release step (`projection-worktrees`); this member's parts run under them (§ 1.4);
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

1. **What needs no store** (`projection-substrate`, this specification) — the ignore strategy, the engine's state, and
   reading and replacing, with the worktree lock and the removals printed or documented, the lock last.
2. **The edit path** (`projection-write-back`) — write-back and conflicts with `arc save`, edit rights, the `active/`
   layout and the checkout-rooted path function, adoption, the settings, and the selection.
3. **Across worktrees** (`projection-worktrees`) — refresh, fan-out, materialization and the tripwires, the removal
   slots and the release step, the user surfaces in every worktree, and scratch.

**Why three.** This project's boundary-fit override returns the call to the Owner above about 1,500 specification lines,
1,000 task-list lines, or six phases, where coupling alone does not keep a work unit whole. At the decision the design
ran 2,374 lines and its task list 2,525 lines across eight phases, past every mark. The design's own seams cut it. The
first member's store reads, over the reference backend, are the current version the replace guard restages (§ 5.1) and a
record's `history` in base-stamp recovery and, for a file other than Markdown, at the version a stopped replacement
replaced, whose `state-unresolvable` arms pull nothing (§ 3.5, § 3.7); it reaches write-back only through the take-in
port it defines and the second member binds (§ 5.1), so it needs nothing `storage-ref-hardening` changes, and builds and
lands while that work does, shortening the cutover's critical path by its length. The second is the first to observe
hardening's surfaces, and the third builds the cross-worktree machinery over the second's write path.

**Size.** After the cut, `projection-write-back`'s specification ran 1,635 lines and its task list 1,158, and
`projection-substrate`'s task list 1,037, at or just past their marks, with no member above five phases. None has a
change-set forecast against the third mark, about 10,000 changed lines. The Owner kept the three members (2026-10-31):
each sits at its marks rather than well past them, its task list holds only the origin's tasks for its sections, and its
specification's growth past them is the terms and sibling contracts a member needs to stand alone, not added scope, so
one review of each member's change set can hold it. At this member's task generation the boundary read returned "stays
one WU" with no delivery plan, its review chunks landing together on one branch, and the Owner confirmed the decision
covers its task list at 1,037 lines, beside a rough change-set estimate of 8,000–11,000 lines, at the third mark
(2026-10-31).

**Order.** The first depends on nothing outstanding: `seam-lifecycle`, `seam-locus`, and `storage-ref-backend`, which
the whole design consumes, have shipped. The second depends on the first and on `storage-ref-hardening`, whose listing
scope, fault classes and remedies for missing or misplaced objects, and sweep of the pull results' consumers its
write-back and the refusals it reports observe (`spec-projection-write-back.md` § 18). The third depends on the second,
and takes the hardening through it. Every part of a member that consumes another change therefore finds it on base
(§ 12.5, § 1.5, § 18).

`cohort-storage-projection.md` records every member's review chunks.

#### 1.2 What this change takes

- **`lib/store/projection/`, new** — the engine's state and the files it writes: the index, the projection lock, change
  detection, blob ids, the base stamp and its recovery, the entry-ID matcher write-back's ID restore also calls, the
  settle rule, the replace guard and its take-in port, the aside folder and its sweep, and the exclude writer's path
  list and guard.
- **`lib/git/exclude.ts`** — `ensureGitExcludePattern` generalized to a path list (§ 11.1).
- **`lib/layout/projected-roots.ts`** — each projected root's path for one identity and its ignore pattern for every
  identity, beside the roots it already names (§ 11.1).
- **`lib/fs.ts`** — an `atomicWriteFile` option that skips its recursive `mkdir`, so no index write recreates a removed
  worktree's Git directory, and `listArcFiles` skipping `.arc/system/.local/` (§ 3.1, § 5.4).
- **`lib/advisory-lock.ts`** — the liveness rule its reclaim applies to a holder, exported for the sweep (§ 3.2, § 5.4).
- **`lib/local-vitest-runner.ts` and `lib/change-facts.ts`** — the projection's tests in the portability tier and its
  paths in the portability surface (§ 13).
- **ARC's ignore-block writer** — `arc init` (with `--reconfigure`), `join`, and `update` write ARC's managed block into
  the root `.ignore` through `writeArcGitignoreBlock` (`lib/template/files.ts`) (§ 11.3).
- **The spawns of a work item's checkout** — the worktree lock as each spawn's last step: a work unit's spawn through
  `reconcileWorkUnitWorktree` (`lib/work-unit/mutators/reconcile-work-unit-worktree.ts`), a resume's among them;
  graduation's, in both forms; and an Errand's through `provisionTransientLocus` (`lib/locus/provisioning.ts`) (§ 12.1).
- **`lib/git/worktree-removal.ts`** — the relock after a failed retirement (§ 12.1); and the missing-folder remedies'
  composers in `lib/session-init/`, which take each registration's lock reason (§ 12.6).
- **`lib/git/identity.ts`** — a pure resolver over already-read `arc.identity` and `user.name` values, which the start's
  one configuration read applies (§ 15.3, `spec-projection-worktrees.md` § 2.5).
- **`lib/store/registry.ts`** — `MACHINE_LOCAL_PATHS` entries for the index and the aside folder, and a
  checkout-relative root (§ 12.9).
- **Tracked files** — the root `.ignore` with ARC's managed block, and this repository's `.gitignore` without its
  `.ignore` line (§ 11.3, § 11.5).
- **Text rewritten when the lock lands** — `session-init.md` (`session-init.template.md` in the package, with the
  installed copy) and `strategy-concurrent-work.md` (package and project copies) (§ 12.6).
- **Tests** — unit and integration tests over the reference backend, with a seeded projection and the test store that
  wraps the reference backend under `__tests__/helpers/store/projection/` (§ 1.5).

#### 1.3 Review chunks and their order

This member lands as review chunks on its own branch, each chunk with its tests, in this order;
`cohort-storage-projection.md` records every member's:

1. **The ignore strategy** — the exclude writer and its guard (§ 11.1, § 11.2) — with ARC's managed `.ignore` block
   and this repository's `.gitignore` change, which go live before the flip (§ 11.3, § 11.5).
2. **The engine's state** — the index, the projection lock, change detection, blob ids and the configuration read, and
   base-stamp recovery (§ 3, § 15.3), with the test store that wraps the reference backend to refuse `history` (§ 1.5).
3. **Reading and replacing** — the settle rule, the replace guard, the aside folder and its sweep, rebuilds, and
   removals (§ 4, § 5), each taking an edit in through the take-in port, a test double until the second member
   binds it to write-back.
4. **The worktree lock** (§ 12.1), last, with the relock after a failed retirement and the rewritten printed and
   documented removals (§ 12.6) — live before the flip.

#### 1.4 Before the flip

The projection keys on the contract's one capability (D1, D15). Over the in-repo implementation, which answers false,
the tracked files are the store and the projection does nothing, and the three removal slots `projection-worktrees`
fills pass — `check` answers `passes`, and `persist` and `release` write nothing and return `persisted` and `released` —
so the removal function runs its Git part alone, as `seam-lifecycle` builds it before any slot is filled
(`spec-seam-lifecycle.md` § 11.2). The engine parts this member builds run only under the root hooks and `arc save`,
which `projection-write-back` builds, and the removal slots, which `projection-worktrees` builds (§ 1.1), so they stay
dark with them.

Three pieces carry no store dependency and run live before the flip:

- **The worktree lock** (§ 12.1). D17 does not key the lock on the capability, and today's gitignored `SESSION-NOTES.md`
  already needs it. It lands last in the first member, after the seam has moved every removal and move of a work item's
  checkout onto the removal function, the removal check, and the doubled-force move form (§ 12.5).
- **ARC's managed `.ignore` block** (§ 11.3), in every repository whose `arc init` (with `--reconfigure`), `join`, or
  `update` writes it.
- **This repository's `.gitignore` no longer ignoring `.ignore`** (§ 11.5).

The `MACHINE_LOCAL_PATHS` entries (§ 12.9) are data no code acts on before the flip, so they land with their chunk.

#### 1.5 Verification

- **The gate here:** unit and integration tests over the reference backend — test-only, in-memory, capability true (D7)
  — with real temporary repositories and worktrees on disk, on Linux and in the portability pair (§ 13). This member's
  store calls are reads: the current version the replace guard restages (§ 5.1), and a record's `history` in base-stamp
  recovery (§ 3.5) and, for a file other than Markdown, at the version a stopped replacement replaced (§ 3.7). The
  reference backend holds no history refs — its `state-unresolvable` refusal names none (`stateUnavailable`,
  `__tests__/helpers/store/read.ts`), and its `pull` ignores what it is asked to fetch (`ReferenceBackend`,
  `reference-backend.ts`) — so the refusal it cannot return to these reads, `state-unresolvable` naming a missing
  history ref on `history`, is exercised through a test store that wraps it and returns that refusal.
  `projection-write-back` extends that store with the refusals a write meets and the history pull that answers a missing
  history ref (`spec-projection-write-back.md` § 1.5).
- **No CLI process runs over either backend before the flip,** since `createStore` builds the in-repo implementation
  alone until then: the engine's entry points, `arc save`'s handler, and the removal slots take the store they run over,
  and the integration tier drives them over the reference backend, while end-to-end tests cover the dark path and the
  root hooks' wiring.
- **The live rehearsal:** `storage-cutover`'s, before the flip.
- **The review's stop rule** (Owner, 2026-10-31). At any pass of the change set's review, every finding in the pieces
  live before the flip — the worktree lock and its relock, the printed and documented removals, ARC's managed `.ignore`
  block, and this repository's `.gitignore` change — is fixed, and so is every finding in the engine that loses a save,
  writes old content over a newer version, or changes an interface § 18 says a sibling member binds, the take-in port,
  the index schema, and the entry-ID matcher among them. From the third complete pass, any other finding in the engine,
  which runs dark until `projection-write-back` calls it, is recorded for that member as a capture rather than fixed
  here. The review stops at the first complete pass that returns none of the findings fixed at every pass.
- **Before the flip,** the worktree lock is verified live: a spawned checkout carries the lock with
  `PROJECTION_LOCK_REASON`, or keeps a lock another tool set first, and under `PROJECTION_LOCK_REASON` a plain
  `git worktree remove` refuses it and the removal function removes it (§ 12.1).

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
at each call site: whether the projection is off for the command (`spec-projection-write-back.md` § 2.3,
`spec-projection-worktrees.md` § 2.5), whether the process holds a projection lock (§ 3.2), the fan-out's rounds
(`spec-projection-worktrees.md` § 2.2), the `history` memo (§ 3.5), each checkout root's claim and effective
`layout.active` (`spec-projection-write-back.md` § 10.1), and the ports the root hook binds — the take-in bound to
write-back, the edit-rights function, adoption's mint, and materialization. A process whose root hook never ran, a
script or a test that binds nothing, fans out nothing, and each sibling refreshes at its next command.

#### 2.5 Which checkouts hold a projection

A command whose configuration yields no identity — no `arc.identity` and no `user.name` that slugifies to one, or an
invalid `arc.identity` — runs as under the skip switch (`spec-projection-write-back.md` § 2.3), reporting the remedy
that sets `arc.identity`, since the personal root and edit rights key on the identity. `arc save` and `arc selection`,
which refuse the switch, refuse naming that remedy (`spec-projection-write-back.md` § 2.4, § 11.7), and so do the
persist and release steps on a checkout `projection-worktrees` gives a projection or that still holds an index, whose
removal check answers `would-refuse` with it (`spec-projection-worktrees.md` § 12.2, § 12.3). The identity comes from
the one rule `lib/git/identity.ts` owns, applied to the values the start's one configuration read returns (§ 15.3).

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
- whether the file holds conflict markers, and their length (`spec-projection-write-back.md` § 6.1); for each marker
  set, the conflict record it shows, or that the checkout found it (`spec-projection-write-back.md` § 7.7); for each
  notice line, the conflict record it names; and, for a file with no stamp or one the replace guard holds whole for a
  resolution in progress or a malformed set, the open conflicts it does not show (`spec-projection-write-back.md` § 6.3,
  § 6.4);
- whether it is protected (`spec-projection-write-back.md` § 8);
- a changed mark, set where this checkout's file held an edit or a verb from this checkout wrote its record, and cleared
  at `arc save` (`spec-projection-write-back.md` § 11.7);
- a pending mark on a file a refresh skipped or a swap batch is replacing (§ 3.3), a write-back left for the next
  command, or the person deleted while it was withheld (`spec-projection-worktrees.md` § 2.5); a withheld mark on a file
  or aside copy a rebuild with no usable index left as it was (§ 5.4, `spec-projection-worktrees.md` § 2.5); and a
  refused mark carrying the refusal's typed reason and remedy (`spec-projection-write-back.md` § 7.6);
- what its last persisted write-back read — the stamp and the content taken in (§ 3.6);
- for a file other than Markdown, the version a replacement in progress replaces and the aside copy its batch makes of
  the file, none for a rebuild by the link alone (§ 3.7);
- for each aside copy a swap makes of the file, listed in the order the swaps were made, while the copy stays in the
  aside folder: the blob the swap was moving — what the projection last wrote there or, for write-back's own copies, the
  blob write-back read — the blob it linked in its place, none for a removal (§ 5.6), whether a write-back of the file
  has been sent since the swap (§ 5.2), and, once the copy's take-in lands, the blob the copy held when it landed
  (§ 5.2).

The refused and pending marks record what the last write-back or refresh met, never what the file holds now. A re-read
that finds no edit, or an edit that lands whole, clears the refused mark; one whose malformed entry was refused while
the rest landed keeps it (`spec-projection-write-back.md` § 6.4). The pending mark clears only once the file holds what
a swap batch linked there — a refresh's, or the read-back of a landed edit, under § 3.3's rule — or, for a file whose
record has left its path, once it is gone and no aside copy of its path remains, unless the projection now lays another
record there; a deleted file a record still projects at, that one included, keeps its mark, so the next refresh writes
it fresh (§ 5.6). A file whose record the projection already no longer lays at its path stays pending until a refresh
removes it (§ 5.6), and a move the store makes later reaches the file through `changes` (`spec-projection-worktrees.md`
§ 15.2), so a refresh or removal a file was owed is never dropped. The removal check and the persist step run the read
path again rather than trust a mark (`spec-projection-worktrees.md` § 12.2). A file adoption refuses
(`spec-projection-write-back.md` § 9) takes an ownerless entry: its path, its stat, and the refusal, with no record
reference.

Beside the entries it records its format version; the state version last projected; the in-flight view setting,
identity, checkout claim — the work item the work-unit marker names — and `layout.active` it was projected under
(`spec-projection-write-back.md` § 10.3, § 10.4); the recent tripwire measurements (`spec-projection-worktrees.md`
§ 15.4); the effective excludes source and every raw setting value, and each ignore file's existence, stat, and blob id
when the guard last passed (§ 11.2) (A3, A5).

The index is machine-local, in the worktree's own Git directory under `arc-projection/`, which also holds the projection
lock and the kept copies (§ 3.2, § 3.6). It is registered in `MACHINE_LOCAL_PATHS` under the per-worktree Git-directory
root, `git-worktree` (§ 12.9), and never stored or synced. It is written by temp-and-rename (`atomicWriteFile`,
`lib/fs.ts`) under the projection lock and re-read after the lock is taken, as jj does. A command finds the Git
directory by reading the worktree's `.git` — a folder, or a `gitdir:` file naming it, as a linked worktree's is — with
no Git call (`readGitDirectories`, `lib/git/directories.ts`), and the checkout is the primary when that directory holds
no `commondir`, being the common one, so the start's two Git calls stay two (§ 15.3); only where neither form reads,
which that reader reports by throwing, does `resolveCheckoutGitDir` (`lib/git/exec.ts`) run Git. It creates
`arc-projection/` only inside a Git directory that exists, so no write recreates a removed worktree's.

**An index a command cannot use.** A worktree whose index is missing, unreadable, or of a format version other than the
running build's, where `spec-projection-worktrees.md` § 2.5 gives it a projection, gets a full materialization that
writes over no file it cannot read without one (`spec-projection-worktrees.md` § 2.5). Fan-out and the end skip a
worktree whose index they cannot read or whose format version is not theirs, leaving it to that worktree's own next
command, so one checkout's build never rewrites another's index in a format that checkout cannot read; checkouts on
different branches can run different builds. The removal check answers `unobservable` for a target whose index is
unreadable or of another format version, or missing where `spec-projection-worktrees.md` § 2.5 gives it a projection,
its detail naming the remedy — run the removal or release from that checkout, whose own build reads its index or
rebuilds it at its start — and the persist and release steps refuse with the same remedy.

#### 3.2 The projection lock

The projection lock is a per-worktree advisory lock (`acquireAdvisoryLock`, `lib/advisory-lock.ts`) in the worktree's
own Git directory, under `arc-projection/`, distinct from D17's worktree lock, which only blocks removal. Its holder
records the process ID, the per-process instance, and the process scope (`resolveProcessVisibilityScope`,
`lib/lease-process.ts`), and it is held under a renewable lease (`withRenewableLease`, `lib/renewable-lease.ts`), as the
build-ownership lock is (`withBuildArtifactOwnership`, `lib/build-ownership.ts`): a holder in the same process scope is
broken once its process is gone, and one in another — WSL and Windows on one checkout, or a container's bind mount —
only once its lease lapses (`isMainLockBreakable`), so a live holder there is never broken. Where Linux cannot read a
process's PID namespace, its scope is its own (`linux:unknown:<instance>`), so it and every other process read each
other as another scope (§ 17). The lease renews and releases through the lock's own create seam, so neither recreates a
removed worktree's Git directory, and a release that finds the directory gone, before or during it, reads the worktree
as gone, with nothing left to release. A lease is lost when its lockfile no longer names the holder or renewal keeps
failing until its last confirmed deadline, and that ends the worktree's operation at its next step, reported: fan-out,
the end, and an ordinary start skip that worktree and the command goes on, while the persist and release steps and
`arc save`'s start refuse with a retry (`spec-projection-write-back.md` § 2.4, `spec-projection-worktrees.md` § 12.2),
so no removal proceeds past an edit not yet persisted. A command holds one projection lock at a time — its own across
its write-back and refresh, then each sibling worktree's in turn while replacing files there, and none across the rest
of the command — so two writers fanning out cannot deadlock. A writer takes a sibling's lock only while that worktree's
Git directory exists, never creating it, and skips a worktree removed while it waited. Fan-out and the end take a
sibling's lock with a wait bounded at 200 ms (`maxWaitMs`, `acquireAdvisoryLock`) and skip a sibling still held, since
fan-out carries no correctness and the next sweep takes over the second check; a command's start and the persist and
release steps wait the lock's default bound, 10 s (`DEFAULT_MAX_WAIT_MS`), before the timeouts
`spec-projection-write-back.md` § 2.2 and `spec-projection-worktrees.md` § 12.2 state. The lock is not reentrant: a
process that asks again for a lock it holds waits until `AdvisoryLockTimeoutError`, so a write made under a lock fans
out only once it is released (`spec-projection-worktrees.md` § 2.2), and no step returns still holding one
(`spec-projection-worktrees.md` § 12.2).

#### 3.3 Change detection: Git's racy rule

A stat match means clean only when the file's modification time is older than the index's reference time; otherwise the
content is hashed and compared.

- **The reference** is a stamp file in the aside folder (§ 5.4), rewritten after each index write, so it shares the
  projected files' volume and clock even where a linked worktree's Git directory sits on another volume. A missing stamp
  makes every entry racy.
- **Smudging (A2).** `commitProjectionIndex` runs `smudgeRacyEntries` on each observed stat racy against the reference
  it replaces — its cached size zeroed, so the next check hashes it. This includes freshly hashed clean stats, stats
  read after a swap linked its replacement, and fresh ignore-file snapshots. Only a staged file's stat awaiting
  installation after that index write is exempt: a save to that file necessarily follows the new reference. Without the
  smudge publication would make a same-tick save after the observation read clean. A command that hashes a smudged entry
  clean re-records its stats, and publication applies the same rule again.
- **Why on every platform.** Modification times advanced every 0.33–0.55 ms on NTFS and every 10 ms on this Linux
  kernel, and a stat comparison alone missed 987 of 1,000 immediate same-size rewrites on Linux and 582 on Windows,
  where the racy rule missed none (`notes-projection-worktrees.md` § Spike 2).
- **File identity** — the inode, or Windows' file ID — is compared as a bigint (D13), as Git compares the inode on
  Linux. A changed identity sends the file to the hash, which catches a replacement that keeps its size and an older
  modification time (`cp -p`, `tar x`, a restored backup); an unchanged one never proves the file unchanged, since freed
  numbers recur on Linux (§ Spike 3). The swap's hard link keeps the staged file's identity, which the index records
  (§ 5.2). Every stat is read as a bigint.
- **Order.** The index and its reference are written before the staged file is put in place, once for all the files a
  swap batch replaces — a refresh's, or write-back's read-back of the edits that landed (`spec-projection-write-back.md`
  § 7.1) — and the files it removes (§ 5.6), so a save can only follow them, and one in the file's tick falls in the
  reference's tick too and reads racy. In the other order a save between the replacement and the index write read clean:
  8 of 4,000 saves were lost on Linux and 40 on Windows that way, and none with the order reversed (§ Spike 1). That
  index write also marks each file the batch replaces or removes pending, and once its swaps are done the batch writes
  the index again, under the same lock, clearing the mark of each file whose path still holds the staged file it linked,
  read by the file identity its entry records. A file swapped back or linked back at its first check (§ 5.2), saved
  over, or left unreplaced keeps its mark, and so does a file a read-back replaced that was already pending, which the
  next refresh settles, removing it where its record has left the path (§ 3.1, § 5.6). A stop between the two writes
  leaves the file pending in any root, `completed/` included, which an ordinary start does not write back. The old file
  reads as unedited: after a refresh's first write a Markdown file equals its own stamp's version, and any other matches
  the version its in-progress record names (§ 3.7); after a read-back's, the file holds what its write-back took in,
  which § 3.6 reads as no new edit. So write-back finds no edit in it, and the next refresh writes it again.

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
  version the file's base names as its write's expected version (`spec-projection-write-back.md` § 7.1), so a version
  that moved only metadata merges as a fast-forward, its content equal to the base's.
- **The base after a write is read back.** What the store keeps can differ from what write-back sent — the backend
  stamps a missing `_Id:_` and merges a stale base (§ Spike 5) — so where write-back replaces the file with the record
  read back after the write (`spec-projection-write-back.md` § 7.1), the index takes that record's blob id and record
  version as the file's base, never those of what was sent. A file it does not replace, one whose malformed entry it
  refused while the rest landed, keeps the base it was rendered from (`spec-projection-write-back.md` § 6.4).
- **What was written is kept apart.** Change detection compares a file against what the projection last wrote into it,
  which differs from the stored content wherever conflicts are drawn in, so the index keeps that blob id too (§ 3.1).

#### 3.5 Base-stamp recovery

D13's content heuristic recovers the base of a file whose stamp was deleted as noise or dropped by a whole-file rewrite:

1. Content that, stamp aside, equals a version exactly — the index's recorded version first, then the record's `history`
   newest first — takes that version as its base.
2. Otherwise the base is the closest by line diff — the fewest lines changed — among the candidates the diff matches at
   least one non-blank line with: the index's version, the content the file's last persisted write-back took in (§ 3.6),
   and a window of the five newest versions; that content and then the newer version win a tie. A stale buffer that
   lost its stamp therefore still merges from its own last save, and the window reaches past the index's version because
   an editor's old buffer saved over a refresh would otherwise merge against the refresh and undo another writer's
   changes.
3. Content sharing no non-blank line with any candidate merges against an empty base, as Git treats a file both sides
   added, so its clashes stay in the file and nothing is lost.

A stored version taken as the base, the content a write-back took in among them where § 3.6 finds it one, goes to the
store as the expected version (`spec-projection-write-back.md` § 7.1); the copy § 3.6 keeps otherwise and the empty
base, which the store never held, merge in the checkout (`spec-projection-write-back.md` § 7.7). Write-back restores the
stamp.

`history` takes a reference and no bound (`lib/store/contract.ts`), and the ref backend answers it with one path-limited
`git rev-list` over the paths the record has had (`spec-storage-ref-backend.md` § 3.6), so its cost grows with that
record's history. The projection reads it only where it needs a stored version's content or record version, which the
index does not keep: stamp recovery here; a stale stored base for `spec-projection-write-back.md` § 7.2's merge in the
checkout; a conflicted file's base (`spec-projection-write-back.md` § 6.6); placement of a stored hunk conflict
(`spec-projection-write-back.md` § 6.3); a single-writer clash's base (`spec-projection-write-back.md` § 7.7); and, for
a file other than Markdown, the version a stopped replacement replaced (§ 3.7). Each arises only for a file with a stale
base, an open conflict, a lost stamp, or a stopped replacement, never on a command with none; a command makes at most
one `history` call per record between the write-backs it lands to that record, shared across the worktrees a fan-out
visits, since a write-back's read-back puts the version just written in a file, which no earlier answer holds, and so
drops the record's memoized answer; and the backend's own stale-base merge reads the same history for that write. Where
`history` refuses `state-unresolvable` — an ended item whose history this clone has not fetched
(`spec-storage-ref-backend.md` § 2.3) — recovery, placement, and a conflicted file's base pull nothing at any command:
recovery chooses between the index's version and the content taken in alone; placement shows the conflict as a notice
line; and a conflicted file keeps its version, pending and reported. A file other than Markdown a stopped replacement
left takes neither version, pending and reported (§ 3.7). Only that file's read and a merge in the checkout for a write
are pulled, as `spec-projection-write-back.md` § 8.4 pulls for a write the store refuses this way — at `arc save` and
the persist and release steps, never at another command's start, so no other start waits on the network.

#### 3.6 A stale buffer's save

Zed reloads no file changed on disk and saves over it without asking (§ Spike 1b), so after a write-back its buffer
keeps the stamp the write-back read, and its next save would merge against a base older than the person's own persisted
edit, putting back text they had since removed or removing again text they had since restored.

A save that carries the stamp the file's last persisted write-back read therefore merges from the content that
write-back took in, not from the stamp's version. A persisted write-back is one whose write landed, whether or not the
store's merge filed conflicts or an entry was refused beside it; one that lands nothing — refused whole, by write-back
or the store, deferred, skipped, or clashing in the checkout (`spec-projection-write-back.md` § 7.7) — is not one. The
content taken in is what write-back read from the file after parse-back (`spec-projection-write-back.md` § 6.4), an
entry it refused standing as the version its base holds, each entry carrying the `_Id:_` the landed record gave it,
matched by the one entry-ID matcher this member builds, which write-back's ID restore also calls
(`spec-projection-write-back.md` § 7.1): from the landed record's entries whose `_Id:_` no entry carries, the one whose
text, apart from its `_Id:_` line, equals the entry's, or else the one whose heading — in a field-header list, its field
header — the entry shares, each only where exactly one landed entry matches. A landed entry's ID goes to one entry at
most — the one matching it by text, else the one matching it by heading — and where two entries match it the same way,
neither takes it. It is not always what landed: the store merges what it is sent onto its current version
(`spec-projection-write-back.md` § 7.1), and a merge in the checkout sends its own result
(`spec-projection-write-back.md` § 7.7). Write-back compares the two in the record it reads back (§ 3.4):

- **Where it is the version the write landed** — the record read back is at the version the write returned, and its
  content equals the content taken in apart from the `_Id:_` lines the backend stamped — that version goes to the store
  as the expected version.
- **Otherwise** the content taken in is a copy kept beside the index, under `arc-projection/` (§ 3.1), until a
  write-back reads a newer stamp. The store never held it, so it merges in the checkout onto the store's current version
  (`spec-projection-write-back.md` § 7.7): sent against the stamp's version, the store's merge would put the removed
  text back, and sent against the version the write landed it would drop the other writer's change (§ Spike 5).

A sibling's refresh in between changes nothing — the base stays the person's own last save, so the sibling's changes
merge in — and an editor that reloads, as VS Code does, saves the newer stamp once the read-back replaces the file and
never meets the rule. A file whose malformed entry write-back refused while the rest landed is the same case on disk: it
keeps its stamp and the base it was rendered from (`spec-projection-write-back.md` § 6.4), so its next write-back merges
from the content that landing took in, and only the refused entry reads as an edit. A command stopped after a write
lands and before the index records it leaves the file under its old stamp with that landing unrecorded (§ 17 item 6).

A file other than Markdown has no stamp to tell such a save from an edit of the refreshed file, so after a persisted
write-back whose content taken in is kept as a copy, its next save takes the closer of that copy and the version the
write landed as its base.

#### 3.7 Files other than Markdown

A text file of any kind may sit in a projected root — `scratch/` above all, where D5 lets a person keep anything — and
D10 refuses binary content at persist but never skips a file. A stamp would corrupt such a file, so it carries none, and
its index entry stands in for it:

- **Its entry's version is its base,** so a file restored to an older version is an edit like any other.
- **A replacement in progress.** The index is written before a replacement puts the new file in place (§ 3.3), so while
  one is in progress the entry also records the version it replaces and the aside copy its batch makes of the file.
  Whoever deletes that copy — the command's end, a later sweep, or a removal's or release's takeover — clears the record
  once the file holds what the batch linked there, as it clears any aside copy's record (§ 5.2), a refused move restores
  the entry at once, and otherwise the record waits for the next command. A rebuild by the link alone makes no copy, and
  its record names only the version it replaces, and only where that version is the record's the entry names (§ 5.6);
  the batch's second index write clears it where the path holds the file the batch linked, and where the link yielded to
  a save (§ 5.5) it stays until the file's next replacement. A file that does not match an entry still holding the
  record takes as its base whichever of the two versions it equals exactly, else the closer of them, so old content a
  stop left reads as unedited and is refreshed, never written back over the newer version (residual, § 17). The closer
  is chosen over both versions' content, read through `history` (§ 3.5); where that read refuses `state-unresolvable`,
  the file takes neither version and stays pending and reported, written back nowhere, until a read succeeds, since
  either taken unread could write old content over the newer version.
- **Otherwise** it is adopted, merged, and refreshed by the same rules as Markdown, conflict markers included, as Git
  writes them into any file. A protected one carries the read-only mode and the persist refusal but no notice line, and
  a conflict whose markers cannot be placed shows nowhere in it (`spec-projection-write-back.md` § 6.3).
- **An empty one** is read only once its modification time is 50 ms old, past the longest empty window seen mid-save (19
  ms, § Spike 3), since no stamp marks it as projected; a younger one waits for the next command.

### 4. Reading an edit

VS Code and Zed truncate a file before writing it, leaving it empty for up to 19 ms (§ Spike 3), so write-back never
reads a file mid-save:

- **An empty projected Markdown file is never an edit** — every one carries its base stamp — so write-back defers it
  rather than falling through to stamp recovery (§ 3.5). One whose modification time is 50 ms old, past the longest
  empty window seen mid-save, is a deleted file: never pending, and replaced when a refresh next writes it or `arc sync`
  rebuilds deleted files, as D13 has it (`spec-projection-worktrees.md` § 2.4). A symbolic link at a projected path is a
  deleted file too (`spec-projection-write-back.md` § 9).
- **The settle rule.** A file modified within the last 50 ms settles first: two stats 15 ms apart, past Linux's 10 ms
  tick, must agree on size and modification time, up to three tries, else it waits for the next command. Only a command
  that follows a save that closely pays the wait.
- **A refresh** hands a file its re-check finds changed to write-back, which settles it or leaves it to the next command
  (§ 5.1).

### 5. Replacing and removing a file

#### 5.1 The replace guard

Before replacing a file, a refresh re-checks it against its index entry by the racy rule — the stat, and the content
hashed when the entry is racy — after Syncthing. On a mismatch it stops, takes the edit in through write-back, then
retries, capped at three passes; where write-back defers the edit, leaves it pending, or refuses it, the file stays
unreplaced and pending, its edit in place.

- **Edit rights follow the worktree whose file holds the edit,** not the process taking it in, so a sibling's fan-out
  writes back the owning checkout's meta edit under that checkout's rights.
- **A clash is kept as a conflict,** never overwritten (`spec-projection-write-back.md` § 6).
- **A refused refresh** marks the file pending in the index, and the next command retries it: it is retryable, not an
  error.

**The take-in port.** Reading and replacing hand every edit they meet to write-back through one port, which
`projection-write-back` binds to write-back (`spec-projection-write-back.md` § 2.1, § 7) and a test double answers until
then. The guard, the second check (§ 5.2), the sweep (§ 5.4), and removal (§ 5.6) call it with the worktree whose file
holds the edit, whose rights apply rather than the writer's; the path or the aside copy; its index entry; and its base —
the stamp, or, for a stampless file, the base blob id the copy's name carries. It answers `no-edit`, `taken-in`,
`deferred`, `refused`, `unparseable`, `clashed` — an edit that merged in the checkout and clashed
(`spec-projection-write-back.md` § 7.7) — or `pending`; once a copy's take-in lands, its entry records the blob the copy
held (§ 3.1). A copy holding the blob its swap was moving, or the one it held when its own take-in landed, answers
`no-edit` without reaching the port. Before each send, write-back records beside every other aside copy of the path that
a write-back has been sent since that copy's swap (§ 5.2). After a take-in the guard re-reads the record's current
version and restages it before its retry.

The hash re-check was chosen over a stat-only re-check, which lost nearly every same-tick save, and over deferring a
racy entry, which deferred nearly every refresh on Linux (§ Spike 1). An exclusive open, reachable on Windows through
the raw `0x10000000` flag, is rejected: it fails an editor's save with `EBUSY` and closes nothing the hash leaves open.

#### 5.2 Moving the old copy aside

Every replacement of a projected file — a refresh, write-back restoring a stamp, a conflict written into the file — runs
the sequence Windows' `ReplaceFileW` runs with a backup name:

1. rename the file into the worktree's aside folder (§ 5.4);
2. hard-link the staged file onto the path;
3. check the aside copy as the rest of this section states.

A save that lands between the re-check and the move, in place or by renaming a new file over the path, lands in the
aside copy: write-back settles it and takes it in as a stale save (§ 3.6), and the guard's retry replaces the file
again. A save that recreated the path first makes the link fail, and the replacement yields to it.

**What a copy holds.** The swap's first index write records beside each aside copy the blob it was moving — what the
projection last wrote there or, for write-back's own copies, the blob write-back read — and the blob it linked in its
place, none for a removal (§ 3.1, § 5.6). While the copy holds the first, or the blob it held when its own take-in
landed, it is no edit wherever it is read — at the swap's own first and second checks, a later sweep (§ 5.4), a
removal's or release's takeover (`spec-projection-worktrees.md` § 12.2, § 12.3), and the removal check
(`spec-projection-worktrees.md` § 12.2). A copy holding anything else holds a save that landed in it: it is checked
against its own base stamp or, for a stampless file, the base its name carries, and its edit is taken in only while its
path has not moved on, so that the save is the only edit of the path sent since the swap. Before each write-back of the
path sends an edit (§ 3.6), it records beside every aside copy of the path but one it takes in that a write-back has
been sent since that copy's swap, so a stop after the write lands leaves the record in place; a send that lands nothing
leaves it too, which only keeps a copy. Deleting the copy clears its record, and the sweep drops a record whose copy is
no longer in the aside folder, moved back to its path or never made after a stop.

**A copy whose path has moved on.** A copy's path has moved on while it holds anything but the blob its swap linked — a
later save there, a write-back's read-back, another replacement — and, whether the path is there or not, once a
write-back of it has been sent since the swap. A copy holding an edit is then never taken in: an older save from the
same buffer and another editor's concurrent edit cannot be told apart, and taking in the first reverts the newer save
(§ Spike 7). While its path has moved on, it stays in the aside folder, reported with its path, until the person copies
out what they want and deletes it; no sweep sends it, and the removal check and the persist and release steps refuse
over it (`spec-projection-worktrees.md` § 12.2, § 12.3). A path that is absent with no write-back sent since the swap
has not moved on, whatever it held before: the sweep links the copy back to it (§ 5.4).

**Write-back's own copies.** Write-back replaces a file itself in two ways: reading back a landed edit
(`spec-projection-write-back.md` § 7.1) — at adoption, with the minted record's verb-owned fields in place of the
person's (`spec-projection-write-back.md` § 9) — and drawing a clash found in the checkout into it
(`spec-projection-write-back.md` § 7.7). It does either only where it refused nothing the file held; a file one of whose
entries it refused keeps the person's content, pending and refused (`spec-projection-write-back.md` § 6.4). The aside
copy such a swap makes therefore holds nothing write-back has not taken in or, at adoption, deliberately set to the
minted record's values, so the blob it was moving is the blob write-back read (§ 3.1).

**The second check.** A command keeps its aside copies until it ends, then takes each worktree's projection lock again
and checks each copy again before deleting it, since a save that opened the file microseconds before the move can write
after the first check. A copy is deleted only once its check finds no edit or the edit it took in has landed whole, and
never while it is an empty file (A1): a save that truncates the file before writing it can leave the copy empty past
§ 4's 50 ms, so the check would read it as a deleted file and delete it before the save's write lands. An empty copy
stays in the aside folder, neither sent nor deleted, and the next command's sweep settles it as any copy it takes over
(§ 5.4), by which time the save has written or the copy reads as § 4 reads an empty file. One whose edit write-back
defers or leaves pending stays in the aside folder, and the next command's sweep sends it again while its path has not
moved on. A removal's or release's takeover has no next sweep, so there such a copy, or one that never settles, refuses
the step with a retry (`spec-projection-worktrees.md` § 12.2, § 12.3). Only the writer checks and deletes its copies
while it runs, except that a removal or release of the checkout takes over a copy once it has settled
(`spec-projection-worktrees.md` § 12.2). The sweep takes a copy over only once its writer has exited, so no sweep cuts
short the delay the second check relies on.

**A copy whose edit is refused.** An aside copy whose edit write-back refuses or cannot parse is never deleted while its
edit stays refused — at the first or second check, at the sweep (§ 5.4), or at a removal's or release's takeover
(`spec-projection-worktrees.md` § 12.2, § 12.3). Where its path has not moved on and holds the blob its swap linked, the
copy is swapped back onto the path — the replacement's file moved aside, then checked and deleted as any aside copy is —
and the file is marked pending and stays a refused edit, reported, as a refused removal's edit goes back to its path
(§ 5.6). Where it has not moved on and is absent, the copy is linked back to it (§ 5.4) and stays there as a refused
edit, the file marked pending. Otherwise its path has moved on, and the copy is kept as such a copy is, reported with
its path as a refused edit, until the person deletes it.

**A copy whose edit clashes in the checkout.** A take-in of an aside copy that merges in the checkout and clashes
(`spec-projection-write-back.md` § 7.7) has no file of its own to hold the markers, so the copy is never deleted while
its clash stands. Where its path has not moved on, the copy goes back to it as a refused copy does, and the clash is
drawn there as markers found in the checkout, the file pending and held by them (`spec-projection-write-back.md` § 6.4).
Otherwise its path has moved on, and the copy is kept as such a copy is, reported with its path as a clash to resolve by
hand, and a removal's or release's takeover refuses as held by a conflict.

Evidence (§ Spike 1b): on Linux, saves timed into the interval lost none of 40,000 with the second check and 7 without
it; on Windows the swap, run without the second check, lost only two saves its harness mistimed. A rename over the file
lost up to 1,255 of 2,000 replace-style saves on Linux and 363 of 1,000 on Windows, and holding a descriptor across the
rename saved in-place saves only. A replacement costs 62–85 µs on Linux and 1.5 ms on Windows at the median, against
20–61 µs and 0.48 ms for a rename over the file. § Spike 7 explores every interleaving within its bounds, the person
deleting the file among them: taking a copy in once its path has moved on, linking one back to a path deleted after a
persisted write-back, or reading an unedited copy as an edit, reverts a newer save, and the rules above lose nothing.

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
  writer ignores the folder (§ 11.1), `listArcFiles` (`lib/fs.ts`) skips it as it skips `.internal/`, so `arc health`
  reports no aside file as new, and `MACHINE_LOCAL_PATHS` registers it (§ 12.9).
- **Names.** Each aside copy and staged file is named for its role, its file's path, the base blob id of the version it
  replaced, its writer as `lib/advisory-lock.ts` identifies a lock's holder — the process ID with its per-process
  instance, and its process scope as a short digest, since a scope can hold characters a file name cannot — and a
  per-move nonce, so no two moves share a name. A staged file is created exclusively.
- **The sweep.** A command that stops mid-swap leaves its copy behind — the state `ReplaceFileW` leaves when it fails
  after the first rename — so every command sweeps the folder under the projection lock before write-back reads any file
  — the stat walk may start first, and write-back re-reads the stats of each path the sweep linked back or replaced
  (`spec-projection-write-back.md` § 2.2) — touching only copies and staged files whose writer has exited. A copy whose
  path is absent and has not moved on (§ 5.2) is linked back, yielding if the path has reappeared, but for a copy that
  is a symbolic link, as a swap moves one aside from a projected path (§ 4), which is never followed, read, or linked
  back: it is deleted as no edit, its path left absent and pending for the next refresh to rebuild; every other copy,
  and every record whose copy is gone, is handled as § 5.2 states — no edit while the copy holds the blob its swap was
  moving or the blob it held when its own take-in landed, its edit taken in only while its path has not moved on, and
  otherwise kept — and leftover staged files are deleted. With no usable index (§ 3.1) it takes nothing in: a copy whose
  path is absent, a symbolic link excepted, is linked back, where `spec-projection-worktrees.md` § 2.5's rule reads it
  as a file; one whose blob id, its stamp set aside, equals its base's, or that is a symbolic link, is deleted; and
  every other stays in the folder, withheld by the new index and reported with its path, left by later sweeps and the
  persist step until the person deletes it (`spec-projection-worktrees.md` § 2.5).
- **Liveness.** The sweep judges a writer's liveness as the lock does: a process ID still in use keeps its copies, so a
  reused ID delays the sweep's takeover until that process exits and never loses a copy. A copy carries no lease, so one
  written from another process scope is taken over only by a sweep from that scope, or by a removal's or release's
  takeover, which takes a copy over live or not once it settles (§ 5.2); a sweep that leaves one reports it with its
  path (§ 17).

#### 5.5 Rebuilding an absent file

Rebuilding an absent file is the swap's link alone, which fails if the path has reappeared, and then yields: Vim,
Neovim, and Emacs leave the path absent or empty mid-save (§ Spike 3). A file other than Markdown keeps the version the
rebuild replaced recorded (§ 3.7), so a save that won the race merges against it. The link lost no save, against up to
407 of 1,000 for a rename and up to 401 failed editor saves for `copyFile`'s exclusive flag (§ Spike 1). A save from a
buffer older than a refresh carries the old base stamp, so write-back merges rather than reverting the refresh: VS Code
prompts before such a save, and Zed neither reloads nor prompts (§ 3.6).

#### 5.6 Removing a file

Removing a file whose record moved, was archived or renamed, or left the in-flight view is the swap without the link:
the same re-check, an edit taken in through write-back against the record the file was projected from, then the file
moved aside and its copy checked and deleted like any other. The batch's first index write keeps the removed file's
entry, marked pending, until the file is gone and the last aside copy of its path is deleted, which drops it, so a copy
that goes back to its path (§ 5.2) is still taken in against that record; a copy a sweep links back after a stop is then
a pending file whose record has left this projection, which the next refresh removes, and with no usable index it is
withheld (`spec-projection-worktrees.md` § 2.5). An edit write-back refuses — to a record now archived, say — goes back
to its path by link and stays there as a refused edit, reported, with the removal check refusing over it
(`spec-projection-worktrees.md` § 12.2); each later command retries the removal until the person resolves it. An edit
that clashes in the checkout (`spec-projection-write-back.md` § 7.7) stays at its path, or goes back to it, the same
way, holding its clash's markers; in a release step it refuses the step as held by a conflict
(`spec-projection-worktrees.md` § 12.3). An edit write-back defers or leaves pending keeps the file at its path,
pending, and each later command's refresh retries the removal; in a release step, which leaves the checkout no
projection to retry from, it refuses the step with a retry instead (`spec-projection-worktrees.md` § 12.3). A withheld
file (`spec-projection-worktrees.md` § 2.5) is never removed, by a refresh or by the rebuild
(`spec-projection-worktrees.md` § 15.2): it stays at its path, withheld and reported, until the person deletes it.

Where the projection now lays another record's file at the path of a file a batch removes — a path-keyed companion
re-laid by a changed claim (`spec-projection-write-back.md` § 10.4) — the batch removes that file only, as above, its
entry staying the leaving record's while the file or any aside copy of the path remains, so every take-in of the file or
a copy of it goes to the record it was projected from. Deleting the last such copy, the file gone, leaves the entry
pending as a deleted file rather than dropping it (§ 3.1), so the next refresh lays the arrival there by the link alone,
recording no replaced version (§ 3.7); until then the path is empty. An edit refused or clashing there keeps the path
for the leaving record, as any removal's does.

### 11. Ignoring, finding, and editor settings

#### 11.1 The exclude writer

`ensureGitExcludePattern` (`lib/git/exclude.ts`) generalizes to a path list — one Git call and one write, which matters
at Windows' 32–42 ms a Git call. ARC writes the entries once per clone, when it first projects (D13). The list derives
only from the projected roots the layout names once (`PROJECTED_LIFECYCLE_ROOTS` and `PROJECTED_PERSONAL_ROOT`,
`lib/layout/projected-roots.ts`) and the `.arc/system/` paths a source projects (`spec-projection-worktrees.md` § 14),
never from a list kept by hand, and adds `.arc/system/.local/`, which holds the aside folder (§ 5.4). That module gains
each root's two forms — its path for one identity, which the guard checks, and the pattern ignoring it for every
identity, which ARC's managed `.ignore` block writes (§ 11.3). `.arc/user/*/` stays in `.gitignore`, never in the
exclude file.

#### 11.2 The guard

The guard runs where those entries are written and before the projection writes into a root: one
`git check-ignore -z -v --non-matching --no-index --stdin` over the roots and the aside folder refuses a path no rule
ignores, and `.arc/user/*/` must match a rule whose source is `.gitignore` itself, since `npm pack` reads only
`.gitignore`. `--no-index` judges the rules alone: without it Git skips a path its index holds entries under, so a root
holding tracked files would read as not ignored; `-z` keeps a source path holding a colon, a Windows `core.excludesFile`
among them, intact. A path a `!` pattern re-includes reads as not ignored: Git prints a directory path so re-included
with an empty source, the case the guard's directory paths meet, and a file path with the `!` pattern itself, which it
counts as a match (checked on Git 2.55). The refusal is typed and recoverable, naming the missing line, and the
projection writes nothing into that root until it is repaired. A call that fails otherwise — any exit status but 1, a
timeout, or a spawn failure — fails closed: a refusal of every root for the command, typed apart from a missing line,
naming the failure and the remedy of running the command again.

Before a write into a root `checkIgnores` compares the effective excludes source and the complete ordered raw
`core.excludesFile` values with the last passing guard's basis before considering file snapshots (A5).
`readProjectionConfiguration` resolves an unset `core.excludesFile` to Git's default excludes path from the invocation
environment; an explicit string, including an empty string, stays explicit. Any valueless excludes occurrence is
invalid, including one before a later valid value, and refuses every root with a configuration-repair remedy, never
reusing a passing cache. Path expansion and source snapshots preserve traversal components so the filesystem follows a
symlink before a following `..`. A newly run guard receives the captured source as a command-local Git setting, so its
verdict and snapshots describe the same selection. Before accepting that pass, `checkIgnores` confirms the source and
all raw values through another configuration read; any change or invalid selection refuses every root recoverably, for a
retry with fresh settings. The passed result carries its source and raw values, and `sweepAsideFolder` records both with
its snapshots. This confirmation runs only with a fresh guard; an unchanged cached pass adds no call to the two-call
start budget. As with an ignore-file edit after the guard's final snapshot, a configuration edit after its last
observation is seen on the next command.

The index records each source file's existence, stat, and blob id: `.git/info/exclude`, each ancestor `.gitignore`, and
each match source, including the effective excludes file where it supplies a match. File snapshots before and after
Git's guard must agree. Every snapshot takes § 3.3's smudge rule, including one just recorded, so publication cannot
hide a same-tick change after the snapshot (A2).

A command's first writes come before any refresh: the sweep links aside copies back before write-back reads a file
(§ 5.4), and write-back's read-back swaps in the edits that landed (`spec-projection-write-back.md` § 7.1). So the sweep
runs the skip check first and, where an ignore file may have changed, the guard, and returns its verdict; a refusal
leaves each root it names unwritten for the command, the read-back's writes there included.

#### 11.3 ARC's managed `.ignore` block

The ripgrep family of search tools reads `.ignore` above `.gitignore` and `.git/info/exclude`, so a root `.ignore`
re-including all four projected roots makes them searchable there (D13). It negates the pattern that ignores each root,
`.arc/user/*/` for every identity's personal root, since a negation re-includes only the path its pattern names.
`arc init` (with `--reconfigure`), `join`, and `update` write it as ARC's managed block through `writeArcGitignoreBlock`
(`lib/template/files.ts`), which already takes the file's path and rewrites only its own block, so a repository's own
lines stay; the file is tracked. It lands live before the flip in every repository the verbs run in (§ 1.4), where it
changes only what search finds: the three shared roots are tracked and no rule ignores them, and `.arc/user/*/`, the one
root ignored before the flip, becomes searchable as it will be from the flip.

#### 11.5 This repository's ignore files

This repository's `.gitignore` drops its `.ignore` line, which ignored the file for Marksman, against ADR-035's tracked
`.ignore`; the line sits outside ARC's managed `.gitignore` block, so dropping it is a hand edit, landing with the first
chunk (§ 1.3). The primary's untracked `.ignore` holds one personal Marksman line hiding `packages/arc-framework/arc/`;
it is deleted before the managed `.ignore` block lands, and the line is not carried over. Git would not stop the tracked
file's arrival — it overwrites an ignored file without a word — so deleting it first drops the line on purpose. The
package copy is the authoritative source for framework edits, and in `.git/info/exclude` the line would hide it from
ripgrep-based search, agents' included, in every worktree of the clone (checked with ripgrep 14.1.1, where Git ignores
the line for tracked files).

### 12. Worktrees

#### 12.1 The worktree lock

D17's lock goes on every linked checkout ARC spawns for a work unit or an Errand, as the spawn's last step, once its
work-unit marker names that work unit or Errand, but for one another tool has already locked, which keeps that lock:

- **The spawns** are a work unit's through `reconcileWorkUnitWorktree`
  (`lib/work-unit/mutators/reconcile-work-unit-worktree.ts`), for `arc start`, `arc materialize`, and `arc resume` or
  `arc start` on a parked work unit, which re-attach its branch in a fresh worktree (`runResume`,
  `lib/work-unit/verbs/park-resume.ts`); graduation's in both forms, the in-repo one
  (`lib/work-unit/atomic-graduation.ts`), whose occupation step runs its own `git worktree add`, and its arm from the
  flip, which `seam-lifecycle` builds (`spec-seam-lifecycle.md` § 2.1); and an Errand's through
  `provisionTransientLocus` (`lib/locus/provisioning.ts`). No shipped code spawns a checkout for a grooming or
  housekeeping claim: `provisionTransientLocus` is reached only from `arc errand open` and `arc errand materialize`,
  both for an Errand.
- **It keys on the spawn,** never on the capability, so it holds before the flip as after.
- **Only a checkout the spawn placed.** The step locks only a linked worktree the verb placed with `git worktree add` —
  never a placement in place, which `arc start`, `arc materialize`, and `arc resume` under `--here` return as a spawn
  naming the current checkout, and never the primary, which Git refuses to lock. It reads the checkout's roster row
  first (`scanRegisteredWorktrees`, `lib/git/worktree-roster.ts`), since `git worktree lock` refuses a worktree already
  locked: unlocked, it locks; locked with `PROJECTION_LOCK_REASON`, as a replayed `arc errand open` finds the checkout
  it reuses (`createLinkedWorktree`'s `path-collision` result, which `provisionSpawned` reuses), it does nothing; locked
  with any other reason, it leaves that lock and reports it, and the spawn completes.
- **An anchored checkout is not locked.** A checkout claimed in place with `arc start --here` is not ARC's spawn, and
  another tool may own and remove it. Today it gets no marker (`writeWorktreeOwnershipMarker` writes none when
  `createdByArc` is false); from the flip it gets one with `spawnedByArc: false` (D17), which gives it a projection
  (`spec-projection-worktrees.md` § 2.5) and grants no removal (`spec-projection-worktrees.md` § 12.3).
- **One reason.** Every such lock carries one reason, `PROJECTION_LOCK_REASON`, the constant `seam-lifecycle` exports
  with the removal function (`spec-seam-lifecycle.md` § 11.1). Nothing locks with it before this member's lock, which
  sets its value to text naming the exits of both kinds — `arc teardown` for a work unit's checkout, and
  `arc errand close`, `abandon`, or `leave` for an Errand's — since Git prints the reason in its refusal ("cannot remove
  a locked working tree, lock reason: …", checked on Git 2.55). The value is, exactly, this line:
  `arc: remove with 'arc teardown' (work unit) or 'arc errand close|abandon|leave' (Errand)`. The reason is how the
  removal function tells the projection's lock from anyone else's: it unlocks only a lock whose reason matches exactly,
  and refuses any other as `locked`, naming `git worktree unlock`. One reason for both kinds lets promotion, which
  rewrites a spawned Errand's marker to its work unit's (`convertSpawnedMarker`, `lib/errand/promote-runtime.ts`), leave
  the lock alone, as it must: `git worktree lock` refuses a worktree already locked (checked on Git 2.55). The reason
  names no slug, so a rename leaves it true.
- **After the spawn succeeds.** Spawn rollbacks — `rollbackSpawnedWorktree` (`commands/start.ts`), graduation's in both
  forms, `reconcile-work-unit-worktree.ts`'s fresh-spawn rollback, which a resume's spawn runs too, and the transient
  claim's `rollbackSpawned` (`lib/locus/provisioning-runtime.ts`) — remove with one `--force` or none, either of which a
  lock refuses, so the lock waits until the spawn has succeeded — for graduation's arm from the flip, whose spawn rolls
  back on its batch's failure, until its transition returns.
- **Machinery checkouts** carry no such marker (`spec-projection-worktrees.md` § 2.5), so they get neither a lock nor an
  index and are removed as today (amendment, § 16).

**How a locked checkout leaves.** Every removal ARC runs of a checkout it locks runs the seam's removal function
(`spec-projection-worktrees.md` § 12.2), so ARC removes a locked checkout only that way. A person removes one through
the exits, after `git worktree unlock` (§ 12.6), or by forcing past the lock with `git worktree remove -f -f`, which D17
allows and Git's refusal suggests, and which skips the persist step (residual, § 17).

**A failed retirement keeps the lock.** Today a failure after the removal function's unlock — a `beforeRetire` that
throws the second time (`spec-projection-worktrees.md` § 12.2), a folder `onlyMissing` finds returned, or a
`git worktree remove` that fails — returns `failed` with the checkout left unlocked, so the next plain removal would not
meet the lock. This member adds the relock in `removeWorktreeCheckout` (`lib/git/worktree-removal.ts`): where the call
unlocked the projection's lock and did not remove the checkout, it runs `git worktree lock --reason <reason> <path>`
with `PROJECTION_LOCK_REASON` before returning `failed`, and a relock that itself fails is named in the result's detail
with the remedy of locking it again (residual, § 17). A failure before the unlock leaves the lock as it was.

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

The lock lands live, before the flip, last in the first member (§ 1.1, § 1.3). Landed before the seam moved them,
teardown's plain `git worktree remove` (`reconcile-work-unit-worktree.ts`), the Errand close's
(`lib/errand/terminal-occupancy.ts`), and the moves would each refuse on every locked worktree. It lands only after
`seam-lifecycle` and `seam-locus` have moved every removal of a work item's checkout onto the removal function, every
decision to remove one onto the removal check, and every move onto the doubled-force form (`spec-seam-lifecycle.md` §
19; `spec-seam-locus.md` § 16). Both have shipped, and their code bears the order out: every removal of a work item's
checkout runs `removeWorktreeCheckout`, the retiring verbs deciding through `checkRetiringCheckout`
(`lib/git/worktree-removal.ts`) — abandonment, pause, and `seam-decomposition`'s retirement
(`lib/decompose/retirement-checkout.ts`) among them; every move takes `-f -f`; and teardown's remaining
`isWorktreeClean` reads guard husking a checkout in place, returning the primary to base, and a detached husk's cleanup
decision (`decideHuskCleanup`, `lib/git/worktree-cleanup.ts`), whose removal runs the removal function through
`reconcileWorkUnitWorktree`; the first two remove or move no checkout. The spawn rollbacks' raw removals run before the
lock is set (§ 12.1).

#### 12.6 Removals printed or documented

The seam changes no workflow text before the flip, so with the lock this member rewrites the removals that are
printed or documented rather than run:

- **The stale-worktree offer.** Session-init's offer of a plain `git worktree remove` for a removable worktree
  (`session-init.md`) becomes `arc teardown <name>`, run from the command line `seam-locus` adds to the sweep's report
  (`spec-seam-locus.md` § 12.2), as the offer already names `arc teardown` for a husk.
- **Branch-gone recovery.** Its prompt to remove a shipped worktree (`inferBranchGoneRecovery`,
  `recommended-action.ts`), which names no command and which `session-init.md` has the agent act on, runs the
  `arc teardown <name>` command line `seam-locus` adds to its candidate (`spec-seam-locus.md` § 12.2).
- **A registration whose folder is missing.** `seam-locus` reports each in a `missingFolders` field — branch-gone
  recovery's beside its candidates, the stale sweep's beside its `worktrees` — with its remedy: an `arc teardown <name>`
  argv where the stale sweep reports a branched one it may tear down — before the flip, one whose branch names a shipped
  work unit (`readMissingWorktreeFolders`, `lib/session-init/missing-worktree-folders.ts`), and from the flip one whose
  ended work unit created its branch (`linkedAs: created`, `readStoreMissingFolderActions`,
  `lib/session-init/missing-worktree-store.ts`), since teardown keeps an adopted branch with its registration
  (`reportAdopted`, `lib/work-unit/verbs/teardown-store.ts`) — and otherwise `git worktree remove <path>` as text naming
  its precondition, that the folder is still missing; where the registration is locked, `git worktree unlock <path>`
  comes first, and the whole remedy is text (`missingRegistrationActions`,
  `lib/session-init/missing-worktree-folders.ts`; `spec-seam-locus.md` § 12.1, § 12.2). Both readers take a registration
  as locked only where the removal check answers `locked`, and the check reports a missing folder under the projection's
  own lock as `missing`, since the removal function unlocks that lock itself, so under the lock an adopted branch's
  remedy and branch-gone recovery's would omit the unlock Git needs. This member passes each registration's lock
  reason from its row in the derived roster (`row.checkout.locked`, `lib/locus/derived-roster.ts`, carrying
  `RegisteredWorktree.locked`, `lib/git/worktree-roster.ts`) into those composers — `missingRegistrationActions`,
  `readStoreMissingFolderActions`, and branch-gone recovery's `buildWorktreeCandidate`
  (`lib/session-init/branch-gone-recovery.ts`), which already reads that roster and refuses without it. A registration
  answering `missing` whose reason is `PROJECTION_LOCK_REASON` then keeps the typed `arc teardown <name>` where the
  sweep offers it — a shipped work unit's before the flip, and from the flip one whose ended work unit created its
  branch — since that runs the removal function, and every other takes the locked remedy, the unlock first. The lock is
  what makes such a registration locked, so with it `session-init.md` shows those reports with their remedies, which
  `seam-locus` otherwise leaves to the flip's rewrite.
- **A husk no verb covers,** left today to manual cleanup, is removed by hand after `arc user save` and
  `git worktree unlock`; the flip's workflow rewrite names `arc save` in its place (§ 18).
- **`strategy-concurrent-work.md`'s instructions** to remove a worktree with `git worktree remove` and to recover a
  deleted folder with `git worktree prune` name the exit verbs, the lock, unlocking and then removing a missing folder's
  registration by its path, and that forcing past the lock skips the persist step.

The text rewritten is `session-init.md` (`session-init.template.md` in the package, with the installed copy) and
`strategy-concurrent-work.md` (package and project copies), edited in the package source and synced, per the
repository's package-project sync rule.

#### 12.7 Existing worktrees

No code backfills the lock, and no one-off pass locks the existing worktrees. Under the pre-public-release posture
(`DEV-RULES.PROJECT` § Engineering Standards), this repository's existing work-item worktrees take the lock as each is
next spawned, and `storage-cutover`'s quiesce locks any left before the flip (§ 18); until then an unlocked one is
exposed as it is today, and the removal function removes it as it removes any unlocked checkout. A checkout whose build
predates the lock's value reads that value as another tool's reason and refuses a locked checkout `locked`, naming
`git worktree unlock`; running the removal from a checkout whose build carries the value removes it.

#### 12.9 Machine-local paths and scratch

`MACHINE_LOCAL_PATHS` (`lib/store/registry.ts`) lists what is never stored, synced, or projected, each entry a root and
a pattern. This member registers:

- **`arc-projection/**` under the existing per-worktree Git-directory root, `git-worktree`** — the index, the projection
  lock, and the kept copies (§ 3.1, § 3.2, § 3.6), beside that root's `arc-checks/**`;
- **under `checkout`, a checkout-relative root it adds to the registry's roots,** `.arc/system/.local/**`, the whole
  folder holding the aside folder (§ 5.4); `projection-worktrees` registers the three machine-local entries in
  `.arc/system/.internal/` under the same root.

### 13. Windows

Each Windows mechanism D13 names is built, and each is covered by tests in the portability tier, which the
cross-platform pair runs on Windows and macOS on CI's weekly schedule and on a dispatch, and which this change's
verification dispatches (D13):

- **Held files.** The projection closes its own handles before replacing a file, and the swap retries `EPERM`, `EBUSY`,
  and `EACCES` within `retryTransientFileSystemRefusal`'s bound while a holder refuses (§ 5.2, § 5.3).
- **Same-size saves.** The racy rule's content hash sees a save inside one modification-time tick (§ 3.3).
- **File identity** is compared as a bigint, and every stat is read as one (§ 3.3).
- **Line endings.** CRLF is normalized to LF on read, before the blob id (§ 3.4).
- **Git calls.** The projection makes two Git calls per command, started together with its stat walk — the store read,
  and one `git config --get-regexp` reading the `arc.*` keys and the object format (§ 15.3) — and the exclude writer and
  the guard make one each, the guard only when an ignore file may have changed (§ 11.1, § 11.2). A full materialization
  reads through the store's `list`, which the ref backend batches through `git cat-file --batch`
  (`spec-storage-ref-backend.md` § 11.6), so the projection reads no blob from Git itself
  (`spec-projection-worktrees.md` § 15.5).
- **Read-only files** move aside and link in with the mode intact (`spec-projection-write-back.md` § 8.2).

Hard links are assumed on every volume a worktree sits on: ext4, APFS, and NTFS have them, exFAT and FAT32 do not, and
no fallback is built (§ 17).

### 15. Refresh and performance

A command's cost grows with what changed, never with how much state exists. Reads take only a ref's tip (D10), and
`history` is read only where § 3.5 names.

#### 15.3 The no-change budget

- **Two Git calls, started together.** The projection makes two Git calls — the store's `version()` read, and one
  `git config --get-regexp` reading the `arc.*` keys, `user.name`, `extensions.objectformat`, and `core.excludesFile`:
  identity, the in-flight view setting, the object format, and the effective excludes source (A3) — started together
  with the stat walk. Run at once they cost what the store read costs alone, 41.7 ms against 41.6 ms on Windows, where
  one after the other took 64.8 ms (§ Spike 2). The projection's cost on Windows is one Git call's time, and on Linux it
  is noise beside the CLI's own start (about 280 ms for `--version`). The guard adds no call while no ignore file may
  have changed (§ 11.2).
- **The one configuration read (A5).** `readProjectionConfiguration` runs `git config --null --get-regexp` with the
  expression `^(arc\.|user\.name$|extensions\.objectformat$|core\.excludesfile$)`. It prints each match as its
  lowercased key, a newline, and its value, NUL-terminated, in Git's scope order, and exits 1 where no key is set, read
  as none set. A single-valued key takes its last occurrence, as `git config --get` returns it, and `arc.inflightPin`
  takes every occurrence. It retains every excludes value in order for cache comparison, and returns the settings, the
  effective excludes path or an invalid-setting verdict, and the identity or no-identity verdict § 2.5 states, naming
  the remedy that sets `arc.identity`. An unchanged start makes this call once. A fresh ignore guard makes a confirming
  read before its pass is accepted, with the same invocation environment; this does not add a call to an unchanged
  cached check.

### 16. Forward amendments to shipped specifications

The storage contract has shipped. Where this design changes what its specification defines, the change is stated here
and built by this change, except where a subsection names its builder; the specification is not edited.

#### 16.1 The storage contract (`spec-storage-contract.md`)

Five change D13's or D17's own wording:

- **A just-modified file waits** (§ 4). D13 writes back pending edits at the start of every command. Here write-back
  settles a file modified in the last 50 ms before reading it, leaving one that does not settle to the next command, and
  never reads an empty projected Markdown file as an edit; a refresh hands a changed file to write-back under the same
  rules. A caller can observe the short, reported staleness.
- **A replacement re-checks by content and moves the file aside** (§ 3.3, § 5). D13 makes the refresh's re-check "a
  stat, not a re-read", has refresh lift a protected file's read-only mode to rewrite it, and retries renames over held
  files on Windows. Here the re-check also hashes a racy entry; every replacement moves the file aside and links the new
  one in, read-only mode and all, retried while a holder refuses; and a removal moves the file aside the same way. A
  caller can observe the path absent for about 10 µs on Linux and 0.85 ms on Windows, and copies in the worktree's aside
  folder while a command runs. A save that lands in such a copy is taken in only while the copy's path has not moved on
  — still holds what the swap linked, or is absent, and no write-back of it has been sent since; while the path has
  moved on, the copy is kept and reported until the person deletes it, its edits held back from the store, where D13
  holds nothing back (§ 5.2).
- **Files other than Markdown carry no stamp** (§ 3.7). D13 puts the base stamp on each projected file's first line, or
  after its YAML frontmatter; a text file of another kind keeps its base in the worktree's index alone, since a stamp
  would corrupt it, with the version a replacement in progress replaces recorded beside it.
- **A stale buffer's save merges from what the last persisted write-back took in** (§ 3.6). D13 merges an edit against
  the version its base stamp names; an editor that never reloads keeps the stamp a write-back read, and merging against
  that version would undo the person's own persisted edits. This member defines the record of what a persisted
  write-back took in, keeps its copy, selects that content as the base of a save carrying the stamp the write-back read
  (§ 3.6), and reads it in base-stamp recovery (§ 3.5); `projection-write-back` fills the record and sends that base or
  merges from the copy in the checkout (`spec-projection-write-back.md` § 7.1, § 7.7).
- **The worktree lock goes on ARC's work-unit and Errand spawns** (§ 12.1). D17 locks each worktree ARC spawns. Here the
  lock goes only on a linked checkout ARC spawns for a work unit or an Errand; any other checkout — one of ARC's
  machinery checkouts, or a hand-made worktree nothing has claimed — gets none and is removed as today.

### 17. Residuals the design accepts

1. **A write through a held handle.** A write through a handle opened before a replacement goes to a deleted aside copy
   and is lost (§ 5.2) where it lands after the command's second check deleted a copy that was not empty, after a later
   sweep deleted one left empty, or after a persist or release step took the copy over. An empty copy waits for the
   next command's sweep (A1), so a save that truncates the file first is lost only where its write lands after that
   sweep. Reasoned, not measured: no tested editor or agent holds a file open across saves.
2. **An exact revert during a replacement.** A save to a file other than Markdown that exactly restores the version a
   replacement replaces, made while the index still records that version — during the replacement, after a stop or a
   rebuild's yield until the next command, while an aside copy left empty waits for that command's sweep (A1), or while
   the batch's aside copy waits for another process scope (item 7) — reads as old content and is refreshed (§ 3.7):
   content alone cannot tell it from what the stop left.
3. **A forced removal.** A removal forced past the lock with `git worktree remove -f -f`, which D17 allows and Git's
   refusal suggests, skips the persist step and loses what item 4 names.
4. **An anchored checkout removed by another tool.** A checkout claimed with `arc start --here` is not locked, so
   another tool's `git worktree remove` takes with it every edit made there since the last `arc` command and every state
   a removal refuses over — a refused edit, a file that failed to parse, an unadopted file, a conflict, a withheld file
   — and, before the flip, the gitignored `SESSION-NOTES.md` and any copy of the identity-global user files teardown
   would merge up (`reconcileUserSurfacesForRemoval`), as it would in any checkout ARC did not spawn.
5. **No hard links.** A worktree on a volume without hard links — exFAT or FAT32 — is unsupported, and no fallback is
   built (§ 13).
6. **A stop after a write lands.** A command stopped after a write lands and before the index records it leaves the file
   as the person saved it, under its old stamp, and sends the edit again at its next run. Where the first landing
   clashed, the store files the same clash again (`spec-projection-write-back.md` § 7.8), a duplicate, visible conflict.
   Where another writer, in between, returned part of the landed edit to the base, or removed an entry it changed, the
   second send applies that part again without a conflict: the merge (`spec-projection-write-back.md` § 7.1, § 7.7)
   takes the sent side's change wherever the current side holds the base, and keeps an entry's change wherever the other
   side removed it (`mergeLineText`, `mergeEntryText`). Where that writer changed the part otherwise, the merge keeps
   its version, with a visible conflict where both sides changed the same entry or lines. And since the stop leaves
   unrecorded what the landing took in (§ 3.6), a save made in the file before that run, by any editor, merges against a
   base older than the landed edit and can undo any change it makes back toward that base: putting back text the landed
   edit added and the save removed, or removing again text the landed edit removed and the save restored.
7. **Another process scope.** Where two process scopes share a checkout — WSL and Windows, a container's bind mount, or
   a Linux process that cannot read its PID namespace, whose scope is its own (`resolveProcessVisibilityScope`) — an
   aside copy one writes waits, reported, for a sweep from that scope or a removal's or release's takeover (§ 5.4), and
   a holder in the other scope that crashes keeps the projection lock until its lease lapses, up to 120 s
   (`ADVISORY_LEASE_DURATION_MS`), commands in the checkout running as under the skip switch meanwhile and the persist
   and release steps refusing with a retry (§ 3.2). Under the per-process fallback no other process shares the scope,
   so a copy waits for a removal's or release's takeover alone, which in the primary may never come, and a staged file,
   holding no edit, goes only with a linked checkout's removal or release, staying in the primary until it is deleted
   by hand. Nothing is lost but item 2's exposure, which lasts while the copy waits.
8. **A copy whose path has moved on.** A save that lands in an aside copy is taken in only while the copy's path has not
   moved on — still holds what its swap linked, or is absent, and no write-back of it has been sent since the swap
   (§ 5.2). The swap's own first check takes in a save timed into the window at once, so a copy is kept only where its
   path moves on before the copy's edit is taken in: a save opened before the move writes into the copy after that
   check, or that check's take-in is deferred or left pending (`spec-projection-write-back.md` § 7.8), and the path
   changes before the copy is read again, at its writer's second check or, where that writer stopped, the next command's
   sweep — by a later save there, a write-back's read-back, or another replacement; or a save lands at the path, or
   recreates it, before the first check; or another copy of the path is taken in or linked back first. While its path
   has moved on, it is kept, reported with its path, and never merged, since an older save from the same buffer and
   another editor's concurrent edit cannot be told apart (§ Spike 7); the person copies out what they want and deletes
   it, and removal and release refuse until then, unless the path becomes absent with no write-back sent since the swap,
   where the sweep links the copy back. It needs a save timed into the swap's window (§ Spike 1b) and a change to its
   path before the copy's edit is taken in.
9. **A relock that fails.** A retirement that fails after the removal function unlocked the projection's lock relocks
   the checkout (§ 12.1); where that relock fails too, the checkout stays unlocked until it is locked again, and the
   result names that remedy. Until then a plain `git worktree remove` meets no lock, as an existing worktree from
   before the lock does (§ 12.7).

### 18. Expected contracts

This design consumes behavior other changes build. The three it depended on — `seam-lifecycle`, `seam-locus`, and
`storage-ref-backend` — have shipped, as have `seam-decomposition`, `seam-status-roadmap`, and
`projected-markdown-checks`; the members whose work observes `storage-ref-hardening`'s fixes wait for it (§ 1.1). Each
other is an expected contract, available when its change lands, and what holds until then is stated with it. This
member's siblings depend on it and land after it; their entries, first, state what this design leaves to them.

- **`projection-write-back`** (`spec-projection-write-back.md`, planned; it depends on this member):
    - binds the take-in port (§ 5.1 here) to write-back, which parses, checks, and sends each edit for the store to
      merge (its § 7), a test double answering it until then;
    - runs this member's sweep, replace guard, and swaps from the command's start and end, which the root hooks call
      (its § 2.2), and holds the engine's process-wide state, the `history` memo of base-stamp recovery among it, which
      its read-back of a landed write drops for that record (§ 2.1, § 3.5 here);
    - calls from its ID restore the one entry-ID matcher this member builds (§ 3.6 here; its § 7.1);
    - pulls, at `arc save` and the persist and release steps, the history ref a stopped replacement's `history` read
      names, as it pulls for a merge in the checkout (its § 8.4; § 3.5, § 3.7 here);
    - honors the guard's verdict the sweep returns at the command's start, its read-back writing nothing into a root
      the guard refused (its § 2.2, § 7.1; § 11.2 here);
    - sets the index fields only write-back fills — the markers, notice lines, and open conflicts a file shows or does
      not (its § 6), the protected mark (its § 8), the changed mark (its § 11.7), what a persisted write-back took in
      (§ 3.6 here), and, in each other aside copy's record, that a write-back of its path has been sent since the copy's
      swap (§ 5.2 here) — in the schema this member defines (§ 3.1 here).
- **`projection-worktrees`** (`spec-projection-worktrees.md`, planned; it depends on `projection-write-back`):
    - decides which checkouts hold a projection — the primary, and a checkout whose work-unit marker names a work unit
      or a transient claim — and until it lands a checkout holds one exactly when it holds an index (its § 2.5);
    - writes full materialization and the rebuild with no usable index, which sets the withheld marks this member's
      index records and its sweep and removal leave alone (its § 2.5; § 5.4, § 5.6 here);
    - calls the exclude writer once per clone, when materialization first projects, and the guard before
      materialization, refresh, and fan-out write into a root (§ 11.1, § 11.2 here; its § 2.5, § 15.2);
    - fills the removal slots, whose persist and release steps take over aside copies once they settle (§ 5.2 here; its
      § 12.2, § 12.3), the slots passing until then (§ 1.4 here);
    - passes the command's `history` memo to the worktrees a fan-out visits, one call per record between the write-backs
      the command lands to it, so a take-in landing mid-fan-out costs the next worktree one more call (§ 3.5 here; its
      § 2.2);
    - registers the three `.arc/system/.internal/` entries under the `checkout` root this member adds (§ 12.9 here), and
      adds the source interface through which a second source's `.arc/system/` paths join the exclude list, the store,
      the only source built, projecting none (its § 14; § 11.1 here).
- **`seam-lifecycle`** (`spec-seam-lifecycle.md`, shipped):
    - the removal check and function, with `RemovalCheck`, `ProjectionRemovalSlots`, and `PROJECTION_LOCK_REASON`
      exported with the function (§ 11.1, § 11.2) — the check slot's third answer, `unobservable`, and a missing
      folder's registration removed by its path among them — and the caller's `beforeRetire`, called after the persist
      step and before both the unlock and the remove (`RemoveWorktreeCheckoutOptions`; `spec-projection-worktrees.md`
      § 12.2);
    - lifecycle's callers moved onto them, and the `worktree-clean` guard deleted (§ 11.3);
    - every move of a work unit's checkout it runs or prints in the doubled-force form (§ 11.6);
    - the porcelain parsers reading each registration's lock and its reason, which the worktree roster carries
      (`RegisteredWorktree.locked`, `lib/git/worktree-roster.ts`; § 11.1), read by the spawn's lock step and the
      missing-folder remedies (§ 12.1, § 12.6 here);
    - graduation's arm from the flip, whose spawn precedes its batch and rolls back on the batch's failure (§ 2.1,
      § 15), so the lock follows its transition (§ 12.1 here).
- **`seam-locus`** (`spec-seam-locus.md`, shipped):
    - the current work unit resolved from the checkout marker plus the store, the layout resolver's address for an
      identity's personal root, and session-init's slot paths and the compaction seed's taken from the layout resolver
      (§ 2.1, § 4.9) — before `active/current/` lands (§ 10.2);
    - an `arc teardown <name>` argv on the sweep's report and branch-gone recovery's candidate, and the reports of a
      registration whose folder is missing with their remedies (§ 12.1, § 12.2), with the residue sweep's move remedy in
      the doubled-force form (§ 12.3);
    - the derived roster (`lib/locus/derived-roster.ts`), whose rows carry each registration's lock reason (§ 12.6
      here).
- **The ref backend** (`spec-storage-ref-backend.md`, shipped):
    - the record version as the compare-and-swap basis beside the content's blob id (§ 3.4), and `history`, which the
      reads § 3.5 here lists make;
    - history entries that may carry a `creationReceipt` (`HistoryEntrySchema`; A23) and history refs naming their owner
      by the lowercase UID stored names carry (`HistoryRefSchema`; A41, A43), which the test store wrapping the
      reference backend returns in those shapes (§ 1.5 here);
    - the reference backend (§ 14.2), over which the gate here runs this member's reads, holding no history refs, so the
      test store wrapping it returns the `history` refusal it cannot (§ 1.5 here);
    - a reader of a worktree's `.git` without a Git call, returning the worktree's Git directory and the common one
      (`readGitDirectories`, `lib/git/directories.ts`; § 4.2), which the index's location reads (§ 3.1 here) and which
      throws where `.git` is missing or its `gitdir:` marker is invalid.
- **`seam-decomposition`** (`spec-seam-decomposition.md`, shipped): the retiring verbs' removal decisions through
  `checkRetiringCheckout`, its own retirement among them (`lib/decompose/retirement-checkout.ts`; § 12.5 here), and the
  source-conflict refusal's one remedy, `DECOMPOSE_SOURCE_CONFLICT_REMEDY` (`lib/decompose/source-conflicts.ts`), which
  names `arc save --resolve <token>` once `save` registers `--resolve`, held by its integration test (its § 18;
  `spec-projection-write-back.md` § 6.5).
- **`storage-cutover`:** the flip and its first full materialization; a quiesce that locks every work-item worktree
  still unlocked (§ 12.7); projected roots that hold, from the flip, no tracked file and no file ARC installs — the
  shared roots' files untracked once their records are imported, and the installer writing nothing into a projected root
  (`lib/classification.ts`): not `completed/README.md`, which no record claims, so it stays unadopted and refuses every
  removal (`spec-projection-write-back.md` § 9, `spec-projection-worktrees.md` § 12.2), nor the `backlog/` inbox
  template, which installs at the path the projection writes the project inbox to (`lib/layout/projection.ts`), so an
  install there writes over a projected file, while the ROADMAP template's install entries leave in the flip change; the
  live rehearsal, which confirms every hand-editable projected kind has its parser and every entry kind its entry shape;
  the flip's workflow rewrite, which names `arc save` where workflows name `arc user save` (§ 12.6); the deletion pass,
  which removes the user-surface rooting and its migration (`spec-projection-worktrees.md` § 12.8); and the
  documentation pass, which rewrites `strategy-work-organization.md` § Per-Worktree Isolation and its acceptance test
  (`spec-projection-worktrees.md` § 10.5) and moves `archive-work-unit`'s errata convention onto the store's history
  (`spec-projection-write-back.md` § 8.4).
- **`framework-core-from-package`:** the installed package as a second, read-only source (`spec-projection-worktrees.md`
  § 14), adding its `.arc/system/` paths to the exclude writer's list.

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
  at the start of every command, jj's model, meets the budget at this repository's size (`spec-projection-worktrees.md`
  § 15.3), and the command-start tripwire would show the need first (`spec-projection-worktrees.md` § 15.4).
- **One copy per machine — kept in reserve, not built.** D13 makes it a fallback no caller sees, and nothing yet
  triggers it. Its tripwire is a fan-out's time, after parallel writes on Windows (`spec-projection-worktrees.md`
  § 15.4).
- **A rename over the file to replace it — rejected.** It lost up to 1,255 of 2,000 replace-style saves on Linux and 363
  of 1,000 on Windows, and starved under readers on Windows; holding a descriptor across the rename saved in-place saves
  only. The swap with its second check lost none of 40,000 (§ 5.2).
- **A stat-only re-check, or deferring a racy entry — rejected.** The first lost nearly every same-tick save; the second
  deferred nearly every refresh on Linux (§ 5.1). **An exclusive open on Windows — rejected:** it fails an editor's save
  with `EBUSY` and closes nothing the hash leaves open.
- **`copyFile`'s exclusive flag or a rename to rebuild an absent file — rejected** for the bare link, which lost no save
  against up to 401 failed editor saves and up to 407 lost saves respectively (§ 5.5).
- **The aside folder under the worktree's Git directory, or in `.arc/system/.internal/` — rejected.** A rename or link
  cannot cross volumes, and a linked worktree's Git directory may sit on another; `.internal/` holds tracked and stored
  machinery, so a folder for machine-local files alone, registered whole, keeps the registry's entries exact (§ 5.4,
  § 12.9).
- **Backfilling the lock in code, or a one-off lock of the existing worktrees — rejected.** Under the pre-public-release
  posture this repository's existing worktrees take the lock when next spawned, and `storage-cutover`'s quiesce locks
  any left (§ 12.7). A one-off lock before the lock's value reached every build would leave each build without it
  refusing to remove those worktrees.
- **Carrying the personal Marksman line into `.git/info/exclude` — rejected.** It would hide the package copy, the
  authoritative source for framework edits, from ripgrep-based search in every worktree of the clone (§ 11.5).

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
  packaging tool ships personal state (§ 11.2), and a routed check's worktree capture (`createWorktreeSnapshot`,
  `lib/checks/tree.ts`), which stages through Git's ignore rules and never reads `.ignore`, copies no projected state
  and nothing in the aside folder, ARC's managed `.ignore` block written or not (§ 11.3).
- **Performance.** The no-change budget is 10 ms on Linux and 60 ms on Windows, with three tripwires measured in place
  (`spec-projection-worktrees.md` § 15.3, § 15.4).
- **Testing.** Unit and integration tests over the reference backend with real repositories and worktrees, on Linux and
  in the portability lane, the rebuild and a pull's fan-out among them (`spec-projection-worktrees.md` § 1.5), and the
  refusals the reference backend cannot return, the history pull among them, through a test store wrapping it (§ 1.5,
  `spec-projection-write-back.md` § 1.5); the isolation test (`spec-projection-worktrees.md` § 10.5); the `after` view's
  conformance case (`spec-projection-write-back.md` § 7.3); the multi-process lane over the ref backend
  (`spec-projection-worktrees.md` § 1.5); and the live verification of the lock before the flip (§ 1.5). Every typed
  refusal here — the guard's, a refused edit, the removal check's `persist-would-refuse` and `unobservable`, the persist
  and release steps', a start that cannot take its lock — is tested both refusing and succeeding once its condition is
  repaired.
- **Rollout.** Dark until the flip but for the worktree lock, ARC's managed `.ignore` block, and this repository's
  `.gitignore` line (§ 1.4). The lock lands last in the first member, after both seam members (§ 12.5), and this
  repository's existing worktrees take it as they are respawned, `storage-cutover` locking any left (§ 12.7).
  `storage-cutover` runs the first full materialization at the flip.
- **User-facing impact.** From the flip, files under `.arc/` are a working copy of the store, saved at the next `arc`
  command or by `arc save`. Protected files say so where they are read (`spec-projection-write-back.md` § 8.2);
  conflicts show in the file, or as a notice line resolved by `arc save --resolve` (`spec-projection-write-back.md`
  § 6); and write-back's report reaches stderr ahead of a command's own output (`spec-projection-write-back.md` § 2.2).
  Before the flip, a spawned checkout the projection locked refuses a plain `git worktree remove` with a reason naming
  the exits (§ 12.1), session-init and `strategy-concurrent-work.md` name those exits (§ 12.6), and search tools in the
  ripgrep family find `.arc/user/*/` (§ 11.3).

## Success Criteria

1. **The lock holds.** Before the flip, every checkout ARC spawns for a work unit or an Errand carries
   `PROJECTION_LOCK_REASON`, or keeps a lock another tool set first, reported; under `PROJECTION_LOCK_REASON` a plain
   `git worktree remove` refuses it, the removal function removes it, a retirement that fails after the function
   unlocked it leaves it locked again, and a move keeps the lock; and an `arc start --here` checkout carries none.
2. **No save is lost to a replacement.** With real repositories on disk, on Linux and in the portability lane, a save
   timed into the replacement, rebuild, or removal of a file — saved in place or by renaming a new file over it —
   reaches the take-in port or stays in an aside copy kept because its path moved on, reported with its path; an
   absent file is rebuilt by the link alone and yields to a save that recreated it; and the next command's sweep takes
   over the copies a stopped command left, but for the residuals § 17 names.
3. **The ignore strategy holds.** The guard refuses a projected root no rule ignores and an `.arc/user/*/` rule outside
   `.gitignore`, and succeeds once the line is restored; and `arc init` (with `--reconfigure`), `join`, and `update`
   write ARC's managed `.ignore` block, which re-includes all four roots for ripgrep and keeps a repository's own lines.
4. **Change detection sees every save.** A same-size save inside one modification-time tick reads as changed, and still
   does after a later index write smudges its entry, a file truncated to empty included; and a changed file identity
   sends a file to the hash (§ 3.3).
5. **A lost stamp and a stale buffer merge from the right base.** Base-stamp recovery takes the exact version a file's
   content equals, else the closest candidate, else an empty base, reading `history` at most once per record between
   the write-backs the command lands to it (§ 3.5); and a save carrying the stamp the file's last persisted write-back
   read takes the content that write-back took in as its base (§ 3.6).
6. **The projection lock is bounded.** Taken with the 200 ms bound fan-out and the end use, a sibling's lock held past
   it is skipped and one released within it is taken; and no acquire, renewal, or release recreates a removed
   worktree's Git directory (§ 3.2).
7. **Printed and documented removals name the exits.** Session-init's stale-worktree offer and branch-gone recovery
   name `arc teardown <name>`; a registration whose folder is missing under the projection's lock takes its typed
   `arc teardown <name>` where the sweep offers it, and otherwise the remedy that runs `git worktree unlock` before the
   removal; and `strategy-concurrent-work.md` names the exit verbs and the lock (§ 12.6).
8. **Live before the flip.** The worktree lock, ARC's managed `.ignore` block, and this repository's `.gitignore`
   without its `.ignore` line are live before the flip (§ 1.4, § 11.5).
9. **The quality gates pass** at every gate the project declares.
10. **An emptied copy waits for the sweep.** An aside copy empty at its writer's second check is neither sent nor
    deleted there, and the next command's sweep settles it as any copy it takes over; on Linux and in the portability
    lane, the save-loss harness loses no save, one that left the file empty past the settle window included (§ 5.2,
    § 17) (A1).

11. A same-size save after a clean hash, after a swap link, or after an ignore snapshot remains detectable when later
    index/reference writes land.
12. After a passing ignore guard, changing or unsetting core.excludesFile forces a new effective-rules verdict before
    any write into affected projected roots.

13. A cached ignore pass records the effective excludes source used by its Git guard; an unset and a valueless
    core.excludesFile cannot share a passing cache entry.

14. Changing any core.excludesFile occurrence invalidates a cached ignore pass; Git-invalid earlier values
    refuse writes and a repaired configuration permits retry.

## Open Questions

None blocks starting. The expected contracts in § 18 each state what holds until their change lands, and none leaves
this design open.

## Amendments

- **A1** — 2026-11-01 — design: an aside copy empty at its writer's second check waits for the next command's sweep.
  _Supersedes:_ § 5.2 ¶6, § 17 item 1. _Trigger:_ 3.5 must-stop. _Work:_ 3.R. _Revalidated:_ pending → 5.1.

- **A2** — 2026-11-01 — design: protect observed stats when publishing a new index reference.
  _Supersedes:_ § 3.3 “Smudging”. _Trigger:_ F2 review. _Work:_ review-fix. _Revalidated:_ review-fix.
- **A3** — 2026-11-01 — design: invalidate ignore caches when their effective excludes source changes.
  _Supersedes:_ § 11.2 ¶2; § 15.3 ¶2. _Trigger:_ F4 review. _Work:_ review-fix. _Revalidated:_ review-fix.

- **A4** — 2026-11-01 — design: bind an ignore guard pass to its effective excludes source. _Supersedes:_ § 11.2 ¶2;
  § 15.3 configuration read. _Trigger:_ R2 review. _Work:_ review-fix. _Revalidated:_ review-fix.

- **A5** — 2026-11-01 — design: bind ignore passes to all excludes values. _Supersedes:_ § 11.2 ¶2; § 15.3 read.
  _Trigger:_ U1 review. _Work:_ review-fix. _Revalidated:_ review-fix.

---
