# Task List: user-save-status-divergence

- **Design:** `spec-user-save-status-divergence.md`

---

## **Phase 1:** Git-graph resolution primitives

_Purpose:_ Build the reusable git plumbing the `enumerate → filter-reachable → reduce-to-maximal` resolution
needs (D5), each verified in isolation against a constructed notes ref before the selection algorithm composes
them. Separating the primitives from the algorithm gives a clean "the git calls are correct and cheap" milestone
ahead of "the selection is correct."

_Design decisions:_ The reduce is one `git merge-base --independent` call, never a pairwise `--is-ancestor` sweep
(O(k²) — a worse cliff than the cap being removed); content for the per-WU predicate is read by **annotated
commit** (`git notes show <commit>`), not by notes-ref history commit. The notes-specific primitives (enumerate,
content-by-annotated-commit) live in `lib/user-sync/notes-ref.ts`; the general git-graph primitives (batch
HEAD-reachability, reduce-to-maximal) live in a new `lib/git/ancestry.ts`, siblings of `base-distance.ts` /
`supersession.ts`. Pure-parsing primitives are unit-tested with an injected `exec`; the graph-semantic primitives
are integration-tested against a real temporary git repo, the tier that can exercise real ancestry. See
`spec-user-save-status-divergence.md` § Proposed Design (D5).

### `[x]` **1.1 Enumerate the annotated-note set**

- _Goal:_ The commits carrying a user note are read in one `git notes --ref=<ref> list` call, independent of
  notes-ref history order — the candidate set, bounded by the note count on the ref.

- _Outcome:_ Added `listAnnotatedNoteCommits` in `lib/user-sync/notes-ref.ts`, exported it through the user-sync
  barrel, and covered constructed `git notes list` parsing plus empty/missing-ref behavior in
  `user-sync-notes-ref.test.ts`.

### `[x]` **1.2 Filter candidates to HEAD-reachable**

- _Goal:_ Resolution keeps exactly the candidates reachable from HEAD, using whichever of per-commit
  `merge-base --is-ancestor` or a single `git rev-list HEAD` intersection is cheaper for the repo shape (D5 step 2).

- _Outcome:_ Added `filterCommitsReachableFromHead` in `lib/git/ancestry.ts` as the batch `rev-list HEAD`
  intersection helper, exported it through the git barrel, and verified real ancestry plus unborn-HEAD behavior in
  `ancestry.test.ts`.

### `[x]` **1.3 Reduce a reachable set to its causally-maximal members**

- _Goal:_ A reachable candidate set collapses to exactly its causally-maximal members — those no other member
  descends — in one `git merge-base --independent <commit>...` call (D5 step 3).

- _Outcome:_ Added `reduceCommitsToCausallyMaximal` in `lib/git/ancestry.ts` as the one-call
  `merge-base --independent` reducer, preserving input order over git's independent set and short-circuiting
  0- or 1-element inputs without spawning git. Real-git integration coverage verifies linear-chain and concurrent
  commit graphs.

### `[x]` **1.4 Read note content by annotated commit**

- _Goal:_ A candidate's manifest content is read keyed on its **annotated commit** (`git notes --ref=<ref> show
  <commit>`) — the basis the per-WU predicate (D4) tests — never `readNoteContentAtHistoryCommit`, which keys on
  a notes-ref _history_ commit.

- _Outcome:_ Added `readNoteContentAtAnnotatedCommit` in `lib/user-sync/notes-ref.ts`, exported it through the
  user-sync barrel, and covered `git notes show` content plus unreadable-note `null` behavior in
  `user-sync-notes-ref.test.ts`.

---

## **Phase 2:** Causally-maximal-reachable resolution (`findNearestUserNote`)

_Purpose:_ Replace write-recency selection with the causally-latest-reachable rule, pointer-refined — the single
primitive every read surface inherits (D3). The nine-row edge-case matrix is this phase's primary test surface;
existing write-recency unit tests are expected to invert (e.g. assertions that the walk does not call
`rev-list HEAD`).

_Design decisions:_ The discriminator is the ancestry relation, not a distance metric (D2). The pointer refines
only among genuine concurrents — keyed on `sourceCommit` **membership**, op-agnostic (D6) — and corroborates the
off-ancestry surface keyed on `sourceOperation === "save"` (D6/D8); it never selects on its own. Monotonic reads
falls out of the rule at a fixed HEAD rather than a separate floor (D6). `findNearestUserNote` splits into a
git-plumbing composition (gather candidates, reachability, the maximal set, and the pointer) and a **pure reducer**
that decides the winner — the seam that lets the nine-row matrix run as unit tests over the reducer, with git as
the injected boundary. See `spec-user-save-status-divergence.md` § Proposed Design (D1, D2, D6, D7) and
§ Alternatives & Rationale.

### `[x]` **2.1 Wire the local sync-state pointer into resolution inputs**

- _Goal:_ `findNearestUserNote` reads the local sync-state pointer (`sourceCommit` + `sourceOperation` via
  `readLocalSyncState`) so the concurrent tie-break (D2 step 2) and off-ancestry corroboration (D8) can apply;
  an absent pointer (fresh clone / sibling machine) resolves cleanly with the pointer roles simply not applying.

- _Outcome:_ `findNearestUserNote` now reads `readLocalSyncState` at entry and passes a narrowed `sourceCommit` /
  `sourceOperation` pointer through its internal resolution input, leaving caller options and current selection
  behavior unchanged for the later reducer work.

### `[x]` **2.2 Reachable-maximal base resolution (singleton wins)**

- _Goal:_ Resolution returns the sole causally-maximal reachable note when the maximal set is a singleton — the
  unique causally-latest save — composing enumerate (1.1) → filter-reachable (1.2) → reduce (1.3) with no distance
  arithmetic, replacing the ref-history first-hit walk (D1, D2 steps 1 & 4).

- _Outcome:_ `findNearestUserNote` now enumerates annotated note commits, filters them to HEAD-reachable commits,
  reduces through `merge-base --independent`, and resolves the singleton maximal note by annotated commit. Unit
  coverage pins singleton, linear-chain tip, older re-anchor, and far-behind/no-cap behavior.

### `[x]` **2.3 Concurrent tie-break: pointer membership, then smallest-SHA**

- _Goal:_ When the maximal set has more than one member (genuine concurrents), resolution prefers the note whose
  commit is the pointer's `sourceCommit` when it is a member, else the lexicographically smallest annotated-commit
  SHA — never a timestamp (D2 steps 2 & 3, D7).

- _Outcome:_ Concurrent maximal notes now resolve by local sync-state `sourceCommit` membership regardless of
  `sourceOperation`, falling back to the lexicographically smallest annotated commit. Unit coverage pins save
  pointer, no-pointer/smallest-SHA, and `op=load` monotonic-read cases.

### `[x]` **2.4 Per-WU filter as a candidacy predicate**

- _Goal:_ With `currentWuName` set, only notes carrying the WU's subdir enter the candidate set the D2 rule ranges
  over — via `noteManifestContainsWu` over content read by annotated commit (1.4) — so the winner is the
  causally-latest reachable note _carrying the WU's subdir_, on every return path including the off-ancestry
  fallback (D4).

- _Outcome:_ Unit coverage now pins the current-WU candidacy boundary in `findNearestUserNote`: content reads are
  limited to HEAD-reachable candidates, sibling-WU notes are excluded before reduction, and whole-tree vs per-WU
  reads may resolve different commits from the same notes state.

### `[x]` **2.5 Off-ancestry fallback and the one-result return contract**

- _Goal:_ When no reachable maximal note exists, the primitive returns one rich result — the pointer's own `save`
  note (per-WU filter preserved) with `reachableFromHead: false` when that commit still carries a note, else an
  empty result — never fabricating a `current` verdict; callers project this single result (D8, D2 step 5, D6).

- _Outcome:_ `findNearestUserNote` now falls back to this machine's saved pointer note when no candidate is
  reachable from HEAD, marks that note `reachableFromHead: false`, preserves the current-WU filter, and returns
  empty for no-pointer / load-pointer cases. Unit coverage pins the primitive contract and the session-init
  freshness projection as `outside-head-ancestry`, not current.

---

## **Phase 3:** Read-surface coherence (status, freshness, disk, push-recovery)

_Purpose:_ The read surfaces inherit the corrected resolution as pure projection — no per-surface selection logic
added (D3) — so a freshly-saved note reads `current` on every surface and the reproduction stops reporting
`mixed` / stale / behind (D9). Validates "surfaces agree by construction."

_Design decisions:_ Callers project one resolved result; the divergence is projection, not re-selection (D8).
`noteHistoryDistance` loses its selection meaning in Phase 2 and is dropped here (3.1) — the enumerate design
computes no history index, so it has no basis; settling it first unblocks the projections that read it.

### `[x]` **3.1 Drop `noteHistoryDistance` and its off-ancestry display clause**

- _Goal:_ `noteHistoryDistance` — the walk index that ordered the old selection and has no basis under the
  enumerate design — is removed from `NearestUserNoteRef` and its readers, and the `outside-head-ancestry` summary
  drops its now-meaningless `"(N note update(s) back)"` clause; the remaining line (commit + off-branch clause)
  stands (D3, Open Question).

- _Outcome:_ Removed `noteHistoryDistance` from the user-note resolution, load, status, and session-init freshness
  result surfaces. Off-ancestry status/load text now reports the commit and off-branch/history clause without the
  obsolete note-ref-history distance; tests keep resolution assertions while dropping the provenance field.

### `[x]` **3.2 `runUserStatus` / `savedCommit` projection**

- _Goal:_ `arc user status` populates `savedCommit` / `savedFromAncestor` / `ancestorDistance` /
  `savedReachableFromHead` straight from the resolved result — the most user-visible consumer — reading `current`
  for a note reachable and at HEAD.

- _Outcome:_ Added command-level `runUserStatus` coverage for HEAD-current, reachable-ancestor, and off-ancestry
  saved-pointer resolutions. The tests pin the projected saved-note fields plus the current and off-branch detail
  lines from the resolved note.

### `[x]` **3.3 `inspectSessionLocalNoteFreshness` projection**

- _Goal:_ Session-init freshness projects the resolved result — `outside-head-ancestry` with the note's commit for
  a `reachableFromHead: false` result, `missing` for an empty result — never reporting a behind or off-ancestry
  note as `current-head` (D8).

- _Outcome:_ Added session-init freshness coverage for empty note resolution (`missing`) and a reachable note at
  HEAD (`current-head`), complementing the existing ancestor and off-ancestry assertions so the freshness surface
  is pinned to the resolved note states.

### `[x]` **3.4 `inspectDiskVsLocalSnapshot` coherence (spurious `mixed` no longer wrong-note-tripped)**

- _Goal:_ The `note.commit !== localSyncState.sourceCommit` divergence branch stops tripping spuriously — after a
  save the resolved note sits on the pointer's commit (or a legitimate descendant), so a fresh save no longer falls
  through to `diskStatus: "mixed"` / `direction: "mixed"` (D9).

- _Outcome:_ Added disk-vs-note regression coverage where a fresh saved note is selected over an older reachable
  note and reports `same` / `current` rather than `mixed`. The existing descendant-ahead case now also asserts the
  preserved `stale` / `behind` classification.

### `[x]` **3.5 `push-recovery.ts` inherits the resolution**

- _Goal:_ The behind-HEAD recovery hint fires off the causally-resolved note — `handlers/push-recovery.ts` reads
  `note.reachableFromHead` / `note.ancestorDistance` from the same primitive with no per-surface logic (D3).

- _Outcome:_ Added no-op push coverage showing an off-ancestry resolved note does not emit the stale-local-note
  hint, complementing the existing reachable-behind warning assertion.

### `[x]` **3.6 Reproduction integration tests (save → land-older-note → status)**

- _Goal:_ The end-to-end reproduction — save a note on `C`, land a later note on older `A`, run status — reports
  `current` (not `mixed` / stale / behind), and `savedCommit` / `diskStatus` / `localNoteFreshness` agree on the
  same commit against a real temporary git repo (SC2).

- _Outcome:_ Added real-git integration reproductions for a later older-note update with different content and for
  re-anchoring the saved manifest onto an older commit. Both assert `runUserStatus` reports the descendant save as
  current and `inspectUserSyncState` freshness agrees on the same HEAD note.

---

## **Phase 4:** Load path and legacy retirement

_Purpose:_ `arc user load` inherits the resolution (off-ancestry fallback materialized, per-WU filter preserved,
D8), records a valid `sourceCommit` basis instead of a notes-ref history commit (D10), and the now-unused
note-count walk cap and its exhausted outcome are retired across the primitive and its four handler consumers (D5).

_Design decisions:_ Load's second source — the cross-WU flat-file merge — stays a Non-Goal; only the
`sourceCommit` basis it records is corrected (D10). For a cross-WU-only load the basis is a **sentinel** ("no
comparable saved commit"), not HEAD: HEAD reintroduces spurious `mixed` when the inspector's whole-tree resolution
finds a note behind HEAD, so the sentinel is guarded at every `sourceCommit → git` site. The walk-cap retirement
lands green-per-phase — 4.3 stops producing `walk-exhausted` and retires the cap / flag / plumbing while leaving
the union member; 4.4 removes the member and its four consumers atomically. See
`spec-user-save-status-divergence.md` § Proposed Design (D8, D10, D5).

### `[x]` **4.1 `runUserLoad` materializes the off-ancestry pointer fallback**

- _Goal:_ `arc user load` materializes whatever the primitive resolves — including a `reachableFromHead: false`
  pointer fallback (per-WU filter preserved) — so single-machine cross-branch resume is not lost, labeled
  off-ancestry, never presented as current (D8).

- _Outcome:_ Added `runUserLoad` regression coverage proving an off-ancestry saved-pointer fallback materializes the
  current WU plus cross-WU files, filters out other WU subdirs, and returns the off-ancestry branch label. The
  existing implementation already satisfied the behavior.

### `[x]` **4.2 `sourceCommit` basis is never a history commit**

- _Goal:_ When `runUserLoad` resolves no per-WU note but the cross-WU merge still materializes shared context,
  `LocalSyncState.sourceCommit` records the off-ancestry fallback's commit when present, else a defined **sentinel**
  ("no comparable saved commit") — never `recentNotes[0].historyCommit` — so a subsequent `arc user status` reads no
  spurious `mixed` (D10).

- _Outcome:_ Added the non-empty `no-comparable-saved-commit` sentinel for cross-WU-only loads and guarded both
  `sourceCommit → git` ancestry sites against it. Unit coverage now proves cross-WU-only loads never record a
  notes-ref history commit, status reads the sentinel basis as stale rather than mixed, and off-ancestry fallback
  loads still record the saved note's real commit.

### `[x]` **4.3 Retire the walk cap and stop producing `walk-exhausted`**

- _Goal:_ The note-count walk cap and its whole `--max-walk` surface — dead once selection enumerates the annotated
  set (D5) — are retired: `DEFAULT_MAX_ANCESTOR_WALK`, the `maxAncestorWalk` option and `maxWalk` plumbing, the
  `--max-walk` flag registration and its guidance messages, and the `capped` / `walked` / `maxWalk` fields on
  `NearestNoteSearch`; `runUserLoad` stops producing the `walk-exhausted` outcome.

- _Outcome:_ Removed the `--max-walk` CLI flags, handler option plumbing, `maxAncestorWalk` load/pull options,
  `NearestNoteSearch` cap fields, and the `runUserLoad` walk-exhausted branch. Coverage now asserts far-behind
  reachable notes resolve without a cap; the legacy `UserLoadWalkExhausted` union member remains only for the 4.4
  consumer-removal step.

### `[x]` **4.4 Remove the `walk-exhausted` outcome and its four consumers**

- _Goal:_ `UserLoadWalkExhausted` is removed from the `UserLoadOutcome` union and its four now-dead consumer
  branches (`handlers/user.ts:346,614`; `handlers/user-sync.ts:281,319`) plus `walkExhaustedMessage` are deleted in
  one atomic change — a `UserLoadOutcome` consumer change the D3 call-site enumeration does not cover.

- _Outcome:_ Removed `UserLoadWalkExhausted`, the `walk-exhausted` consumer branches in `arc user load`, `arc user
  pull`, and `arc user sync`, plus the now-dead diagnostic helpers and mock-only tests. The plain no-note load path
  remains covered and unchanged.

### `[x]` **4.5 Load-parity and `sourceCommit`-basis integration coverage**

- _Goal:_ End-to-end coverage confirms load parity (causally-latest reachable matching note, or the deterministic
  pointer-backed off-ancestry fallback, no cross-branch-resume regression, SC5), the no-distance-cap find (SC4), and
  the D10 basis fix (cross-WU-only load → follow-up status reads no spurious `mixed`, SC6) against a real temporary
  git repo.

- _Outcome:_ Added real-git integration coverage for per-WU load parity selecting the causally-latest reachable
  matching note, capless loading of a far-behind reachable note, and the D10 cross-WU-only load → status
  round-trip. The D10 case asserts the sentinel basis and verifies status reports stale/missing rather than mixed.

---

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Edge-case matrix passes — each of the nine rows resolves as specified (SC1)

- `[ ]` Surfaces agree by construction — `savedCommit`, `diskStatus`, `localNoteFreshness` read the same commit
  and `current` for a fresh save; the reproduction no longer reports `mixed` / stale / behind (SC2)

- `[ ]` Single primitive — resolution lives in one changed primitive; every consumer inherits it with no
  per-surface selection logic (SC3)

- `[ ]` No distance-cap regression — any HEAD-reachable note is found regardless of distance behind HEAD (SC4)

- `[ ]` Load parity — `arc user load` materializes the causally-latest reachable matching note or the
  deterministic pointer-backed off-ancestry fallback, with no cross-branch-resume regression (SC5)

- `[ ]` `sourceCommit` basis is never a history commit — a subsequent `arc user status` reads no spurious
  `mixed` divergence (SC6)

- `[ ]` All quality gates pass (tests, linting, type checking, build)

- `[ ]` Ready for integration
