# Notes: projection-team-scale

## Contents

- [Grounding basis](#grounding-basis)
- [Lifecycle rows](#lifecycle-rows)
- [Test migrations](#test-migrations)
- [The scale benchmark's fixtures](#the-scale-benchmarks-fixtures)
- [The scale benchmark's results](#the-scale-benchmarks-results)
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
a quarter. `store-ref-projection-timing.test.ts` measures interleaved standard and expanded starts and saves, and
closed versus opened starts, under `ARC_STORE_BURSTS=1`. It reports raw medians and paired differences without
asserting the bounds, which `projectionPerformanceBounds` (`lib/store/projection/timings.ts`) holds.

A4's standard and expanded start medians (`notes-projection-worktrees.md` § A4) were 14.57 and 14.64 ms on the Linux
reference `m5-air-ac`, 107.40 and 106.91 ms on Windows, and 31.79 and 32.04 ms on macOS, leaving start margins of about
5.4, 37.6, and 13.0 ms under the 20, 145, and 45 ms budgets. The paired expanded-minus-standard start medians were
−0.27, +1.49, and −1.09 ms. A same-head Linux repeat measured 17.94 and 19.77 ms starts, so a raw reading against the
budget can fail on variance across runs that a paired reading cancels.

## The scale benchmark's results

The measurements use `24d91d6636`'s benchmark and bounds, with eleven alternating samples per pair. The save comparison
times the complete start, save result, and end over 800 and 60,320 files, with nothing opened. The opened-start
comparison uses two 800-file fixtures with zero and one archived file opened. Each row reports the median of the
eleven paired differences, independently of the two raw medians. No process-count or Git-baseline credit is applied.

| Reference | Save: 800 files (ms) | Save: 60,320 files (ms) | Save paired difference (ms) | Growth limit (ms) |
| --------- | -------------------- | ----------------------- | --------------------------- | ----------------- |
| Linux     | 20.886               | 20.686                  | −1.117                      | 5                 |
| Windows   | 230.571              | 224.322                 | −5.826                      | 10                |
| macOS     | 74.870               | 75.209                  | −1.214                      | 10                |

| Reference | Start: none opened (ms) | Start: one opened (ms) | Start paired increment (ms) | Start margin (ms) |
| --------- | ----------------------- | ---------------------- | --------------------------- | ----------------- |
| Linux     | 18.023                  | 20.384                 | +1.450                      | 5.36              |
| Windows   | 127.387                 | 127.161                | −0.536                      | 37.60             |
| macOS     | 49.667                  | 55.816                 | +6.525                      | 12.96             |

The margins remain the calibration margins in § The scale benchmark's fixtures; the paired increment is the criterion,
so a raw opened median above the old absolute start budget does not by itself fail it.

Linux ran on reference `m5-air-ac`, worker `m5-air-runner`, Linux with Node `v26.3.0`, in arc-offload run
`54790e0d0f3446158da7d3a0f1f2b041`. Its controller head was `55711b6737`; its immutable source snapshot was
`05f4c2fa98834ce9e5e71481090a6dade308cf44`. Git tree and blob comparisons establish that the measured source, tests,
helpers, scripts, manifests, lockfile, and Vitest configuration match `24d91d6636`. The run's raw output retains every
sample and paired difference; the measurement and input-object records are retained with that run's evidence.

Hosted run `44131651831` measures the published `24d91d6636` with `portability_timing_only=true`. It is diagnostic
evidence, not full work-unit qualification. macOS job `134210569726` ran macOS 26.7.2 on image `macos-26-arm64`,
version `20261112.0504.1`, with Node `v26.13.1` and Git `2.56.1`. Its `projection-timing.json` artifact and job log
retain every sample and paired difference, also retained with this unit's measurement evidence.

That macOS job meets both growth criteria above, but its retained absolute-operation bounds also report misses:
standard and expanded starts measured 87.469 and 96.088 ms against 45 ms, and one-file fan-out measured 625.632 ms
against 600 ms. Ten-file fan-out measured 1882.176 ms against 2800 ms, and materialization 3989.635 ms against 4000 ms.
The standard beneath-Git, concurrent-pair, and single-Git baselines were 38.453, 45.848, and 52.887 ms; these are raw
observations, not a timing credit or an established explanation of the misses.

Windows job `134210569493` used Windows Server 2025, image `windows-2025-vs2026`, version `20261103.298.1`,
Node `v26.13.1`, and Git `2.56.0.windows.4`. It meets both growth criteria, but its one-file fan-out measured
2817.224 ms against the retained 2800 ms bound. Standard and expanded starts were 127.307 and 125.637 ms against
145 ms; ten-file fan-out was 5272.602 ms against 6000 ms, and materialization 6313.667 ms against 8000 ms. Both
hosted jobs completed successfully because the timing suite reports numerical bounds rather than asserting them;
their success status does not turn a measured miss into a pass. All raw records are retained.

The unchanged-head repeat is hosted run `44134547643`, attempt 2. Attempt 1 never reached either timing job: shared
setup's fetch stayed running for eleven minutes and was cancelled; its log is retained. The successful setup retry
then launched Windows job `134228887339` and macOS job `134228886908` at the same `24d91d6636`.

| Reference | Save: 800 files (ms) | Save: 60,320 files (ms) | Save paired difference (ms) | Closed start (ms) | Opened start (ms) | Start paired increment (ms) |
| --------- | -------------------- | ----------------------- | --------------------------- | ----------------- | ----------------- | --------------------------- |
| Windows   | 141.710              | 141.281                 | +0.674                      | 76.588            | 78.207            | +1.414                      |
| macOS     | 121.242              | 129.250                 | +8.079                      | 56.733            | 61.063            | +4.330                      |

Both references again meet both growth criteria. Windows used the same image and tool versions; macOS used image
`macos-26-arm64` version `20261102.0473.1`, macOS 26.7.2, Node `v26.13.1`, and Git `2.56.0`. Both artifacts and logs
retain every sample and paired difference alongside the initial measurements.

The repeat's absolute medians were 78.601/79.858 ms standard/expanded starts, 826.895/3016.889 ms one/ten-file fan-out,
and 3529.463 ms materialization on Windows, all within their retained bounds. On macOS, starts were still over 45 ms
at 81.116/113.963 ms; one/ten-file fan-out and materialization fit at 579.162/2003.094 and 3437.733 ms. The macOS
standard beneath-Git, concurrent-pair, and single-Git baselines were 33.394, 53.613, and 46.538 ms. The unchanged-head
repeat therefore preserves an unresolved absolute-start miss; it does not establish a passing absolute-bound verdict.

### Source comparison on one runner

The diagnostic at `c4a6bb42f8` compares pre-feature source `53a349d7cb` with current source in four separate Vitest
processes, ordered old–current–current–old on one runner. Each block warms twice, then retains eleven starts and the
beneath-Git, concurrent-Git-pair, and single-Git controls. The start's timed boundary and two-Git-call check match the
ordinary benchmark; end work, imports, materialization, and process startup remain outside the timed interval.

Every block copies one shared native 800-file template and verifies identical stored refs and local configuration.
Each revision builds and reads its own index. Separate processes keep the revisions' shared global projection-state
key from joining their states; the unchanged observer and template builder are checked by Git object identity. The
baseline's complete package source is extracted from its pinned commit, with the current installed dependencies and
an identical lockfile. This compares source revisions under today's environment, rather than recreating a past host.

The diagnostic artifact has its own `projection-start-source-control/v1` identity and keeps process order, raw samples,
source-tree objects, revision commits, and host controls. No numerical bound is asserted or replaced, and no Git-time
credit is applied. The ordinary full projection benchmark runs separately afterward on that runner, with its own raw
record, to expose any difference between the isolated standard fixture and the larger benchmark context.

Linux mechanics run `f053138e23114c95bd540d6cc2f4d5c1` completed all four blocks, with matching refs and configuration,
ready starts, no diagnostics, and two Git calls per start.

Hosted run `44150655723` used both diagnostic inputs: the named source-control file, then the existing timing-only
suites. macOS job `134278343343` completed both. Its image was `macos-26-arm64` version `20261112.0504.1`, with
Node `v26.13.1` and Git `2.56.1`, the same recorded image and tool versions as the first slow run. The source-tree
objects were `f07f98b6dd6bc957abb7efa9040b555450426f62` for the baseline and
`6f7c702dccae208e4a358fb48e0355353c157637` for current source, which matches `24d91d6636`'s production source.

| Block | Source   | Start (ms) | Beneath Git (ms) | Git pair (ms) | Single Git (ms) |
| ----- | -------- | ---------- | ---------------- | ------------- | --------------- |
| 0     | Baseline | 36.056     | 16.129           | 20.803        | 19.774          |
| 1     | Current  | 38.686     | 18.041           | 24.079        | 18.827          |
| 2     | Current  | 31.328     | 15.049           | 18.742        | 16.700          |
| 3     | Baseline | 28.766     | 13.609           | 16.227        | 14.541          |

All four block medians fit 45 ms. The comparison does not reproduce the earlier 80–114 ms starts; it does not establish
an exact source-only penalty or rule out a smaller one. The block order also shows variation over time in both source
versions and their independent controls.

The full benchmark afterward measured 30.761/30.278 ms standard/expanded starts, 400.013/1254.834 ms one/ten-file
fan-out, and 2152.699 ms materialization, all within the retained absolute bounds. Save growth was +1.858 ms and the
opened-start increment +1.470 ms, again within their unchanged bounds. Beneath-Git, Git-pair, and single-Git controls
were 14.867, 17.226, and 16.336 ms, substantially below those in both slow runs. The logs also establish that the
projection benchmark ran before the store timing file in both earlier jobs, so preceding test-file work does not
explain those attempts.

The evidence supports intermittent host or runtime variation rather than a reproduced large source regression. The
precise cause remains unproven, and the earlier misses remain part of the record. The passing current measurement
does not by itself replace the failed measurements or authorize their acceptance. Every raw control and benchmark
sample is retained in the job log and artifact `14359301819`, and with this unit's measurement evidence.

The same run's Windows job `134278343409` failed during archive extraction with `write EOF`, before measurements;
the diagnostic workflow therefore failed overall. A file-backed extraction completed all four blocks on the Windows
feedback runner in `244d9e0e07a0406f9312916f71b33e83`, whose raw record is retained. That is feedback, not a passing
hosted Windows result.

The accepted timing evidence is Linux run `54790e0d0f3446158da7d3a0f1f2b041`, Windows job `134228887339` of run
`44134547643`, and macOS job `134278343343` of run `44150655723`. The earlier absolute-bound misses are retained as
intermittent, with their precise cause unproven. This disposition accepts those valid measurements and leaves the
failed Windows extraction diagnostic recorded as failed.

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
