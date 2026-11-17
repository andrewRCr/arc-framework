# Notes: projection-team-scale

## Contents

- [Grounding basis](#grounding-basis)
- [Lifecycle rows](#lifecycle-rows)
- [Test migrations](#test-migrations)
- [The scale benchmark's fixtures](#the-scale-benchmarks-fixtures)
- [Workflows that write under `completed/`](#workflows-that-write-under-completed)
- [The flip's errata convention](#the-flips-errata-convention)
- [Model evidence](#model-evidence)

## Grounding basis

The task list is grounded against `main` at `e19c713be1` (2026-11-16), which carries `projection-worktrees`' merge,
`57a4ea7df5`: its shipped specification, amendments A5 to A11 among it, and its removal check, persist step, and release
step. Every symbol the tasks name exists there, and spec § 12 states what this design takes at that merge, each contract
checked against the shipped specification and the code. Phases 1 to 3 were audited against that code in full before
the task list was committed, so no task waits on a later audit.

Two decisions came with that grounding (Owner, 2026-11-16). `arc sync`'s remedy for a mismatched archive partition lands
in Phase 2 (Task 2.2), ahead of `arc save`'s narrowed read, so no chunk prints a remedy that does not work and the tests
that pin the old one move once. And the primary's release refuses over a forced edit as every release does, though the
primary keeps its files (spec § 11 item 8; Alternatives & Rationale).

## Lifecycle rows

Each state the opened mark passes through, and each path that meets an archived edit, with the parent that wires its
production callsite and the scenario that proves it.

| Row                                                              | Wired in     | Proven by                              |
| ---------------------------------------------------------------- | ------------ | -------------------------------------- |
| `arc edit` sets the mark, then the write bit                     | 1.2.b        | 1.2's tests; § 9.2 test 1 in 2.4       |
| Every start reads the mark through the header's marked partition | 1.1.a, 2.1   | 1.1's and 2.1's tests                  |
| An ordinary command takes an opened edit in, the file writable   | 2.1          | 2.1's tests; 2.7                       |
| Adoption keeps the mark                                          | 1.1.c, 2.1   | § 9.2 test 8 in 2.4                    |
| A moved path keeps the mark, its file laid writable              | 1.1.c, 1.3.b | 1.1's and 1.3's tests                  |
| `arc sync` remedies a mismatched archive partition               | 2.2          | 2.2's tests (Success Criterion 7); 2.7 |
| `arc save` lands, swaps read-only, then clears                   | 2.4.a        | § 9.2 tests 2 and 3                    |
| `arc save` lays an unchanged file read-only, re-checks, clears   | 2.4.b        | § 9.2 tests 1 and 4                    |
| `arc save` leaves a gone, emptied, or unlanded file opened       | 2.4.c        | § 9.2 tests 5 and 9                    |
| A lost index withholds an opened file holding an edit            | 2.5          | § 9.2 test 10 in 2.5 and 3.2           |
| A build without the mark rebuilds the index                      | 1.1.b        | 1.1's tests (Success Criterion 9)      |
| A refresh takes a forced edit in and lays it read-only           | 1.3, 2.5     | 2.5's tests                            |
| `arc sync` names a forced edit and a new archived file           | 3.1          | 3.1's tests; 3.5                       |
| Removal persists an opened edit, refuses a forced one            | 3.2.a, 3.2.b | 3.2's tests; 3.5                       |

## Test migrations

Each existing test the tasks break, as the suites stand on `main` at `e19c713be1` (`packages/arc-framework/__tests__/`),
with the task where it first breaks and its migration there. Tests over the in-repo implementation are out of reach: `createStore`
composes it with `stateOffBranch: false`, and the projection's start, end, status, sync restoration, and selection each
return early there, so only tests that inject the reference or ref store run the projection, and no end-to-end test does.
The sweep covered every test reaching projection staging or its entry points (`startProjection`,
`registerProjectionHooks`, `withFanOut`, `materializeProjectionRoot`, `restoreSyncProjection`, `stageRecordFile`,
`seedProjection`, the removal check, the persist and release steps, and the fixtures built on them), closed over helper
imports, and the integration suites' index schema guard (`index-schema-guard.ts`).

- **Open first:** open the file (1.2) before the write, and again after each `arc save`, whose landing lays it
  read-only.
- **Write through the mode:** make the file writable as a forced edit does (`chmod`), where the test pins an unopened
  edit.
- **Moves:** the leg is rewritten as stated.

### Archived edits, modes, and `arc save`'s reads

`seedProjection` stages through `stageRecordFile`, so every archived file it lays lies read-only from 1.3, and the engine
fixture's `edit` writes in place. Tests not named at 2.3 hold there; a test at 2.1, 2.2, and 2.4 holds unless its row
says otherwise, and a landing leg that expects `arc save`'s standard error empty holds at 2.4, since a re-lock reports in
the save result (2.4.d).

- **`save.test.ts`'s archived corrections** — "saves a completed-file edit…", "pulls an archived owner's named
  history…", "routes history-pull notices…", "memoizes the retried historical base…", "keeps an archived edit and its
  original remedy when its pull is %s…", "does not pull an archived %s refusal…", and "keeps the retried history
  refusal's remedy…": open first at 1.3; each holds at 2.3, the file opened.
- **`save.test.ts`'s "keeps a late archived aside edit offline…" and "keeps a stopped archived swap outside a linked
  parent…"**: open first at 1.3, before the first test's editor handle opens the file read-write; both hold at 2.3, and
  their later legs, which rest on where 2.4's re-lock runs, are re-checked there. At 2.1 the first test's ordinary
  command sends the opened edit, refused for the history it lacks and naming `arc save`, so its claim that the edit
  stays unsent there holds through that refusal; that leg is re-checked at 2.1.
- **`save.test.ts`'s "keeps an interrupted archived stampless edit offline…"**: write through the mode at 1.3; it holds
  at 2.3, since its explicit send leaves the entry pending, its partition marked, and `arc save` takes it in.
- **`save.test.ts`'s "protects another person's archived %s and lands the same correction for its owner"**: at 1.3 its
  last assertion flips, since the owner's `arc save` lays the file read-only. At 2.3 it moves: the refusal naming the
  owner comes from `arc edit` (1.2.c), the bytes kept, and the owner opens the changed file, which `arc save` lands
  read-only. At 2.4 the landed file is also unmarked.
- **`save.test.ts`'s "leaves failed archived admission for explicit save…"**: holds at 1.3, a new file. At 2.3 it
  moves: the owner opens the new path; `arc save`'s admission refuses, the entry ownerless, opened, and refused; the
  repaired next command adopts it, the mark kept and the file writable (2.1, 1.1.c), its provenance that command's verb.
  At 2.4 `arc save` then re-locks it.
- **`fan-out-history.test.ts`'s "fans out a history pull after releasing the save-start lease…"**: open first at 1.3;
  it holds at 2.3.
- **`engine-walk.test.ts`'s "finds edited files … while leaving completed files unsent"**: write through the mode at
  1.3, the archived file alone; it holds after.
- **`command-hooks.test.ts`'s "writes completed roots under save only for the root save command…"**: write through the
  mode at 1.3. At 2.3 it moves: root `arc save` leaves the forced edit unsent too, as `arc user save` does.
- **`store-ref-adoption-archives.test.ts`'s "adopts an older archive despite a newer %s namesake…", and "adopts an
  unindexed Errand description at %j…" in its `completed` case**: new files, holding at 1.3; open first at 2.3, by the
  work unit's or the Errand's owner.
- **`store-ref-adoption-archives.test.ts`'s "keeps a misplaced completed Errand repair local…"**: at 2.3 it moves:
  `arc edit` on the misplaced path refuses with adoption's remedy, the file kept, and once moved the correct path opens
  first.
- **`store-ref-adoption-archives.test.ts`'s "refuses ambiguous completed Errand generations…"**: at 2.3 it moves:
  `arc edit` refuses with adoption's remedy for the ambiguity, read through its verdict (spec § 12), and `arc save`
  adopts nothing.
- **`store-ref-adoption-locations.test.ts`'s "adopts an archived owner's new companion at save…"**: open first at 2.3.
- **`store-ref-adoption-existing.test.ts`'s "binds an unindexed archived cohort file to its archive coordinates…"**: at
  2.3 it moves: `arc edit` on the misplaced path refuses with adoption's remedy, and at the cohort's own path the file
  opens first, adoption attaching it to the stored record (1.1.c).
- **`removal-check.test.ts`'s "holds a new edit to another person's archived record and passes once it is
  reverted"**: write through the mode at 1.3; it holds after, the owner's remedy unchanged at 3.2.
- **`retirement-store.test.ts`'s "pulls missing ended-item history for a %s and persists the archived edit before
  teardown" and "keeps unparseable archived metadata and removes after its parser accepts the repaired edit", and
  `retirement-store-release.test.ts`'s "returns an unparseable removal edit to its path and releases after the metadata
  is repaired"**: open first at 1.3, the last also writing its removal's aside copy through the mode, since the copy
  keeps the file's read-only mode. Each pins an owner's archived edit persisting at removal or release, which holds for
  an opened file at 3.2.
- **`store-ref-adoption-existing.test.ts`'s "answers an archived cohort file unobservable while the cohort archive
  listing is %s, then passes"**: at 3.2 its last leg moves: the unindexed archived cohort file answers `would-refuse`
  naming `arc edit` then `arc save`, and passes once they run.

### Format, registration, rendering, status, and sync

- **1.1.b:** the helpers `seeded-projection.ts` and `write-back-fixture.ts`, which every seeded suite reads through;
  `location.test.ts` and `fan-out-refusals.test.ts`; the unit `index-file`, `index-schema`, `index-partitions`,
  `index-recovery`, `smudging`, `write-back`, `ignore-snapshot`, and `removal-asides` tests; `errand/store-overlap`;
  `errand-projection-retirement.test.ts`, which asserts the header the engine writes; and
  `store/projection/index-schema-guard.test.ts`. Each takes
  `PROJECTION_INDEX_FORMAT` in place of the literal `2`; `index-file.test.ts`'s missing-fields case keeps the constant,
  and `index-schema.test.ts`'s other-format cases become 0, 1, 2, and the constant plus one.
- **1.2.a:** `unit/cli-loading-boundary.test.ts`'s lazy-module list gains the handler. The registry, help-coverage, and
  help tests derive from the registries, and the no-input matrix and its pinned counts move only if the command
  declares an interaction site.
- **1.3:** the direct test callers of `stageRecordFile` and `stageRenderedRecordFile` pass the lay mode where it is a
  required input; the type names them.
- **1.4:** the unit `record-render`, `render-overlap`, `stale-entry-conflict`, and `marker-parse` tests,
  `protection-round.test.ts`, and `store-ref-projection-admission-conflict-token.test.ts` pass the path; the helper
  `timing-archive.ts` passes the archived path it computes, so `ref-timing-fixture.test.ts`'s comparison with a
  materialized archive holds once the notice lands.
- **1.5:** `unit/status-format.test.ts`'s whole `ProjectionFileStatus` literal gains the opened field where it is
  required.
- **2.2:** both cases of `sync-materialization.test.ts`'s "keeps an untouched archive partition cold and invalidates a
  selected one" move: the sync rebuilds the damaged partition and lays the file. `removal-check.test.ts`'s "reads every
  cold completed partition and repairs its corruption with claim=%s" and `retirement-store.test.ts`'s "holds an altered
  cold archive partition until arc save rebuilds it" move too: the remedy names `arc sync`, which, run from that
  checkout in place of a save-mode start, repairs the partition. `removal-check-observations.test.ts`'s "keeps a file
  awaiting adoption unobservable while a publication leaves its index unusable at capture, naming it" moves: the
  partition it holds aside leaves the capture's read unusable with its header, so the detail names `arc sync` after its
  first clause. `removal-verdict.test.ts`'s native-refusal case passes its remedy text in and holds.

No test pins the notice's absence where 1.4 adds it: fixtures that bind no protection render none, and the rest compare
bytes the engine itself laid or match with `toContain`. The ownerless entry's union (1.1.a) breaks none, since every
construction carries its refusal.

## The scale benchmark's fixtures

Success Criterion 1 holds this unit's part of the scale criterion: `arc save`, and a start's increment while an archived
file is open. A command's independence from a settled archive's size is `projection-worktrees`' claim, shown by its
paired start comparison and its invalid-partition test; scale at team size is `projection-narrowed-views`'.

The criterion runs over `projection-worktrees`' timing fixtures as shipped. `createProjectionTimingTemplates`
(`packages/arc-framework/__tests__/helpers/store/ref-projection-timing.ts`) lays 140 backlog and 20 active owners of two
files each, the 320 hot files, and 480 archived owners of one file each across four quarters, about 120 archived entries
a quarter. Its expanded template gives each archived owner 124 more files, 60,320 files in all and about 15,000 entries
a quarter. `store-ref-projection-timing.test.ts` measures interleaved standard and expanded starts only under
`ARC_STORE_BURSTS=1`, and reports raw medians and paired differences without asserting the bounds, which
`projectionPerformanceBounds` (`lib/store/projection/timings.ts`) holds.

A4's standard and expanded start medians (`notes-projection-worktrees.md` § A4) were 14.57 and 14.64 ms on the Linux
reference `m5-air-ac`, 107.40 and 106.91 ms on Windows, and 31.79 and 32.04 ms on macOS, leaving start margins of about
5.4, 37.6, and 13.0 ms under the 20, 145, and 45 ms budgets. The paired expanded-minus-standard start medians were
−0.27, +1.49, and −1.09 ms. A same-head Linux repeat measured 17.94 and 19.77 ms starts, so a raw reading against the
budget can fail on variance across runs that a paired reading cancels.

## Workflows that write under `completed/`

No workflow amends an archived design: `amend-design.md` amends a work unit's design in flight and never touches
`completed/`. The one hand edit workflows make there is `archive-work-unit.md`'s errata convention on a Release Notes
Entry after `Shipped`; every other write under `completed/` is a verb's, which reaches the store without `arc edit`.
This unit changes no workflow, save that convention where the flip lands first (spec § 10.4, Task 3.4).

## The flip's errata convention

`cutover-flip`'s specification writes the errata convention around `arc edit` (its § 8.12), from the command's name,
rights, and sequence sent to its session on 2026-11-10, with a correction the same day: the read-only lay is a lay mode,
not an edit right, and a new path opens only once its file exists. A change to the command's name, rights, or sequence
during the build goes to that session too.

Its § 1.3 orders three landings (Owner, 2026-11-13). Where this unit has landed when the flip's workflow rewrite writes
the convention, it is written around `arc edit`. Where this unit lands after that and before the flip's head is fixed
for the window, the flip rewrites it onto `arc edit` and re-runs its Stage 2 where it changed. Where this unit has not
landed by then, the window runs on the convention written for write-back's in-place archived edit, and this unit
rewrites it at its landing (spec § 1.4, § 10.4; Task 3.4), an amendment routed here and accepted on 2026-11-13.

## Model evidence

The per-unit constants and model v2's growth table are in `notes-projection-worktrees.md` § Spike 3 and § Spike 4; the
model's re-run at the scale anchor (23 work units a month a person, 20 worktrees, three years of archive, and teams of
1, 10, 50, and 150) is in `draft-projection-narrowed-views.md` § Evidence. The model is linear, takes the index codec's
constant at the measured size nearest each scenario, models no contention, and took its Windows constants from a runner
at below-normal priority. Where its figures meet A4's measured bounds, the measurements govern.

---
