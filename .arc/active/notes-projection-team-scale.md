# Notes: projection-team-scale

## Contents

- [Grounding basis](#grounding-basis)
- [Lifecycle rows](#lifecycle-rows)
- [Test migrations](#test-migrations)
- [The scale benchmark's fixtures](#the-scale-benchmarks-fixtures)
- [The scale benchmark's results](#the-scale-benchmarks-results)
- [The ownership-handoff corrective](#the-ownership-handoff-corrective)
- [The archive correction scenario](#the-archive-correction-scenario)
- [Sync's archive report](#syncs-archive-report)
- [Archived removal checks](#archived-removal-checks)
- [Archived persistence](#archived-persistence)
- [The archive retirement scenario](#the-archive-retirement-scenario)
- [Recovery when an opened path is empty or disappears](#recovery-when-an-opened-path-is-empty-or-disappears)
- [Archived cohort inventory recovery](#archived-cohort-inventory-recovery)
- [Archive boundary corrections](#archive-boundary-corrections)
- [Amendment A2](#amendment-a2)
- [Amendment A3](#amendment-a3)
- [Amendment A4](#amendment-a4)
- [Amendments A5 to A7](#amendments-a5-to-a7)
- [Amendments A8 and A9](#amendments-a8-and-a9)
- [Amendments A10 and A11](#amendments-a10-and-a11)
- [Amendments A12 and A13](#amendments-a12-and-a13)
- [Amendment A14](#amendment-a14)
- [Amendment A15](#amendment-a15)
- [Save after a retirement refusal](#save-after-a-retirement-refusal)
- [Independent verification repairs](#independent-verification-repairs)
- [Interrupted adoption and retirement recovery](#interrupted-adoption-and-retirement-recovery)
- [Workflows that write under `completed/`](#workflows-that-write-under-completed)
- [The flip's errata convention](#the-flips-errata-convention)
- [Amendment A16](#amendment-a16)
- [Amendment A17](#amendment-a17)
- [Amendment A18](#amendment-a18)
- [Amendment A19](#amendment-a19)
- [Amendment A20](#amendment-a20)
- [Delegated work from 11-24](#delegated-work-from-11-24)
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

## The ownership-handoff corrective

Task 1.1.c's `12aa224ad1` regressed the existing `projection-worktrees` contract that a held ownership handoff reports
its ownership-specific mark without a generic withheld-basis warning. Earlier green checks omitted the integration
tier, so the failure surfaced in run `44164130996` at `ff3646eddd6e09562297eb8baba71047ffd3f8bc`, in both Linux
integration job `134326631311` and portability job `134326630979`. That run's targeted Windows and macOS archive jobs
each pass their seven files and 47 cases; those results do not make the complete workflow pass.

With all uncommitted Phase 3 work stashed, routed run `6d02d804c5874fc0a824919ebc974921` reproduces the one failure
in the unchanged 21-case `refresh-path-reuse.test.ts` suite on committed head `ff3646eddd`. An initial candidate in
materialization, run `b27a943fc03448e9897e6aea76bf4eec`, retains that same failure. The extra warning originates in
`checkFileAtPath`'s withheld branch during command write-back, which now reports the entry's existing refusal before
falling back to the generic withheld mark. The test and its expectation remain unchanged; the correction preserves
the existing hold and recovery route.

The isolated corrected tree passes all 21 original cases in routed run `7e3ec821436c4cfe8dfa5cb5bc7afd54`, with the
Phase 3 stash still unapplied. Hosted confirmation for this correction remains separate from that focused pass.

## The archive correction scenario

`archive-correction-worktrees.test.ts` runs the native reference backend with two real linked worktrees, separate
Andrew and Bob identities, active holder work units, and archived work whose history remains readable. Commander
inputs drive the real edit and save handlers with projection hooks; status and sync use their public projection
operations, excluding unrelated status composition and network synchronization. The freshly merged base is
`a065b748e5908c2482329d101e52db0f6d052fb5`, merged at `d1da8aae0b9a9c53fee1186f491d4f6265523c2a`.

The scenario checks both ordinary-command meta corrections in the backend and the still-open working copy, save's
re-lock report and modes, adoption of a truly absent companion and Errand description, another person's correction
to a shared archived cohort, and the owner's existing archived Errand description. Other worktrees receive read-only
copies. A deliberately invalid, settled cold-quarter partition remains untouched by a no-change save, with archive
directory discovery refused at the filesystem boundary. The removal check names sync; sync repairs that checkout's
partition and the removal check then succeeds with the corrected metadata retained.

Disabling only `relockOpenedProjectionFiles`' iteration produced the expected behavioral failure at the first save's
missing re-lock report in run `fdb1e8f776984b16a2c59780fc1411e4`. The implementation was restored without a product
change. Run `8832105d79a545a2a798fc5589528e87` stopped at the helper's blanket stderr assertion on an advisory command
start notice, 27.8 ms against its 25 ms notice threshold. Run `ebeee4981f2b425daaddeab49dd4b5b5` passed unchanged on
the Linux pool runner. The helper now permits only recognized timing notices while rejecting other diagnostics;
this functional scenario sets no timing acceptance bound. Its corrected form passes in local routed run
`49fa6de37e7f4edb92ae516960d804ee`. The timing acceptance remains the separately recorded reference measurements.

## Sync's archive report

`inspectArchivedProjectionFile` supplies one read-only inspection and remedy for sync and retirement. It detects an
unopened, settled record's forced edit by the racy rule, excluding deleted files, and resolves an unindexed file through
the existing adoption readers without submitting it. `observeProjectionProtection` retains unavailable ownership
evidence separately from denied rights; `readProjectionProtection` keeps its existing mark-returning interface.
`reportArchivedProjectionFile` uses sync's stats, and `reportUnknownArchivedFiles` uses its root walk. Rebuilds
keep their withholding rules. Usable-index restoration retains the link report and excludes side files.

The native `sync-archive-report.test.ts` cases drive Commander inputs through projection hooks and the sync restoration
seam, checking report text, preserved file bytes, and unchanged backend records. The initial forced-edit and new-file
report failures are retained as runs `279436ddb6cf48ea9810249f04172886` and `fc51fefeb310446d9d7ddf102b56bdbe`.
Reconstruction checks retain the boundary distinctions:

- Demoting returned, rejected, and missing required ownership evidence into ordinary protection fails three cases in
  `dd1a704385de45f6a35cf981d7880852`.
- Removing side-file exclusion makes sync name editor and folder files, failing
  `d89b7c05e6504c34ab4da6ce08e9a127`.
- Disabling settled empty-Markdown restoration leaves the file empty, failing
  `5f6cffd9d83a4ee38f9090371e76d4fd`.
- Demoting failed new-file ownership and record observations fails both first-failure cases in
  `337f0d65cc96491e93f9fba6de33fec1`; an actually absent companion still receives the opening remedy after repair.

The restored new-file code still fails the owner-read case in `bd8989b456a64273a4d89440350b1625`: `readIndexedOwners`
did not retain its failed-read marker. Preserving it makes all 29 focused sync cases pass in
`ea2e8a78ff0c4e87b5a63a26180714bb`. The equivalent inventory case fails in `3e45a24839a2484ab94210c11e96fb3f`;
`readArchivedOwners` now retains that marker for a refused list, as it already does for unreadable or partial lists.

All reconstructions are reverted. The broader projection integration directory passes its 93 files and 936 cases in
`3cd78608cb42446598a2c55c036cfb8c`. Subsequent changes extract the common report and restoration-selection helpers,
with focused sync coverage retaining the same file, link, and backend outcomes.

The final projection integration run `bccd89f1c3bd4045a31d0a7a7f94af8a` passes all 93 files and 939 cases, including
the twelve new sync cases and the unchanged ownership-handoff contract.

## Archived removal checks

`removal-archive.test.ts` composes `checkWorktreeRemoval` with native reference stores in a real linked checkout.
Commander-generated edit and save inputs exercise the normal projection hooks and handlers. A notice conflict comes
from divergent native repositories and their merged archive metadata, with its named history acquired before the peer
writes. Marker conflicts come from ordinary concurrent text writes. Neither conflict is a hand-built index fixture.

The forced, malformed forced, and unopened new-file cases fail before inspection is added in
`26c7b44597e341ebb613d26ab4b25dfd`, then pass in `e14f603acf9642a2b903741e78595a06`. Both old conflict remedies fail
in `f29979de26744b39ae27191228921a6d`; notice resolution and marker editing then make removal feasible in
`512d86da2f1a4d2692b346bfb135d0a9`. Parser refusal marks independently fail to name opening in
`dc602123e5814ee9add5bbd514c5ec5c`, then pass with the parser wrapper in `f3709fb598f44c59aea0c4d47e37dca4`.

Regression reconstructions retain their distinct behavior:

- Removing the owner decision fails the foreign-edit remedy in `9532a6436298438a939f10a042413a96`; restored ownership
  passes in `77d501d596944336a4affb9e94ab02e0`, including restoration of the original projected bytes.
- Requiring opened files to remain present and nonempty fails both no-edit cases in
  `dd2d26c1a4f047069f704bce3622f04e`; normal missing-file discovery and settled-empty handling pass in
  `30e1a76573bd4c6981d580adda97d0e9`, with the stored version unchanged.
- Skipping unfinished recording's hold fails in `6f2f125486ec4e4fb1e964fe07f68ce8`. The fixture interrupts read-back
  after a real accepted batch. Restoring the hold lets save finish it without another stored version in
  `75e434de25a94721a3208a31b5dc7ad5`.
- Skipping withholding's hold fails after real index loss in `6d282190383e4eb6ba3d78671562717e`. Restored withholding
  retains the bytes and clears after deletion, reprojection, reopening, reapplication and save in
  `f1ffc9c8bbb74c11b2b312e0045cb77e`, which passes all 69 focused removal and marker cases.

All temporary reconstructions are restored. Forced edits still take precedence over marker parsing, and failed
archive observations retain their unobservable result rather than becoming local refusal evidence.

## Archived persistence

`persistFiles` filters its existing root walk through `inspectArchivedProjectionFile` before calling write-back,
sharing the ignore check's reference. Every blocked archive input stays out of the send set, while the first mark
supplies `retirementRefusal`. Opened and unfinished entries keep their existing persistence paths. Release uses the
same step, including on the primary; only linked release removes the projection afterward.

The native `removal-archive-persist.test.ts` cases cover persist and release invoked with either checkout's store,
primary release, backend content and versions, preserved local bytes, and successful continuation after edit and save.
All nine initial refusal cases fail in `a6d91579d1144b3f983db07dfb7018a2`, then pass with the filter in
`e04fc6deb95241608b0523897726bff2`. Additional reconstructions exercise the existing contracts:

- Refusing opened files fails all four existing-edit and new-adoption cases in
  `aebdc0f45b87448a901a22f1e7c3b2b5`; restoration passes in `521facab2c924b29a6bd98241618486d`.
- Requiring opened files to remain present and nonempty fails the absent, empty, and deleted-new-entry cases in
  `7ed61d2d8f3e4c208442cb19625176d0`. The deleted new entry is observed dropped before linked release's last check.
- Excluding only the first blocked file lets a second unopened file adopt, failing
  `d0ebe0fddf13474a92f226b39113454d`; filtering every input passes in `4c244d9b832c45fbb268bb1ca456e361`.
- Treating a withheld index as no projection incorrectly returns persistence/release success after real index loss,
  failing both cases in `cada1dd8a0e3482cbbd18254fffcc5bc`. The actual path keeps the edit and its deletion/reopening
  remedy, then succeeds after reprojection, reopening, reapplication and save.

A settled-empty original holds no edit at persistence. Linked release subsequently creates a new empty swap copy,
which the existing second-check contract retains until the next sweep (`spec-projection-worktrees.md` § 12.3 and its
A10 residual annotation). The exploratory immediate-release assertion in `b359d29f0a0c4040844bd36027447349` demanded a
stronger guarantee than that contract. The final test instead checks the initial refusal, retained empty copy and
index, successful save, successful release, and unchanged stored version. Disabling only second check's `keepEmpty`
fails it in `ee40ad89675c46b8b5378a62b1bfced2`; restoration passes all eighteen then-current cases in
`1ac008e08ec94e728013a630847e7b3e`. The production empty-copy guard is unchanged.

All reconstructions are restored. The complete projection integration directory passes 95 files and 970 cases in
`672a4f1527df464b8eae7b56b9439b3f`, including all 21 new persistence cases and the unchanged ownership-handoff test.
The real CLI retirement E2E file passes its four cases in `0aea71bf95a24da786a9457ae60f2a95`; that installed CLI still
selects the in-repo backend, while the archive proofs use the native reference backend through the retirement slots.

## The archive retirement scenario

The fresh base is `2a3cbc2cffa755bada5e9b16ba38c48261e96f79`, merged append-only at
`e39955e7763eb9999feb6e2114e148f4b88cd1a7`. Its CLI hook update merged cleanly with the archive commands. The new-head
request from `cb601c8f2047492f45be3dc317b9e857e9847697` passes, and the base's errata convention still names git
history as the lock. The conditional rewrite remains inapplicable on that freshly merged source.

`archive-retirement-worktrees.test.ts` uses native reference stores, real linked checkouts, Commander-driven sync,
edit and save, and `createProjectionRemovalSlots` composed into `removeWorktreeCheckout`. Sync names the forced edit
and unopened new file without admitting either. Physical removal refuses until edit and save, then removes the
checkout with the corrected record readable through the primary's store. A separate opened edit remains absent from
the store until removal's persistence lands it, and its checkout is then physically gone.

Disabling only archive report emission and skipping opened archive persistence fails all three scenario cases in
`ccda3f68791c4f02b4156aa6dba91fbe`. Both reconstructions are restored without a production change. The actual scenario
and the real CLI retirement E2E file pass all seven cases in `18e2c642770b42a491b793ba3b18585b`. The complete native
projection integration directory then passes 96 files and 973 cases in `d5531db7ef4a479fb0ef5a44155290f5`.

## Recovery when an opened path is empty or disappears

`arc save` re-locks an empty text companion once the final check proves that its bytes match the store. A settled
empty Markdown file still needs `arc sync` to restore its stamp. If the path disappears while `arc edit` opens it or
`arc save` re-locks it, the command retains the opening and reports how to retry.

Run `6ece99626ba540c19ad072efac5a6b96` reproduced four failures through the registered edit and save commands.
Run `16d6506bb9754307bb3a07edb6af4068` passed 97 cases across five suites. The empty-file cases cover a settled
stored companion and a late edit to empty after the read-only lay. The disappearance cases check the held opening
and a successful retry once the file returns.

## Archived cohort inventory recovery

The forced merge gate on `bb97c31187` failed three archive-adoption cases. Run `3a850efbe6aa495fb5bce5dbc4bc410a`
reproduced all three in isolation. The test expected removal to pass as soon as the archive inventory became readable.
A readable inventory identifies the unindexed correction, which must still be opened and saved before removal.

The corrected test checks both holds, proves the store retains its original bytes until repair, and verifies the saved
correction and a passing removal check. All ten suite cases pass in run `586d27e69cd74b7fa54ad8433adee275`.

## Archive boundary corrections

A1 kept the opening requirement independent of the latest refusal so a temporary refresh failure could report its own
remedy while a later save still held the correction. The swap journaled the requirement before displacing a file or
installing a replacement, and settlement needed evidence for both the installed rendering and retained copies. A2
replaced that requirement with one admission rule decided at the take-in, so no route records it (§ Amendment A2).

`5397c3c40b` checks which checkout owns the requested path, validates links before archive pickup, and changes a mode
through a handle that identifies the observed file. Save keeps a same-byte replacement opened if it is still writable.
Retirement refuses a late forced edit at capture and preserves the correction for explicit opening and save. Sync
names a walked, indexed edit even when its record is missing from the restoration inventory.

The save tests now check stored bytes, the retained recording and file mode at the three interruption points. The
conflict scenario drives the competing correction from a second linked checkout. Linux run
`a73c114469c14d2f852f63bd2afb4b5c` passes 1,143 cases over 100 files. Windows run `0a09b98c01d3418dbc78234e3138ae9b`
fails on a write-mode assertion that expected POSIX bits. The corrected five-case rerun
`9b57424123de40e4892b510f70fa3924` passes on native Windows.

Linux reference timing run `c53d15a89f94479b92e6cae64e7a1e78` measures +0.085 ms for archive save growth against
5 ms and +2.492 ms for an opened start against 5.36 ms. The run retains all eleven raw sample pairs for both cases.

## Amendment A2

Fix checks 1 to 7 of standard pass 1 kept finding the next archive route that lost the requirement to open an edit or
checked a path's authority before a late link: eight findings of the first cause and eleven of the second across the
eight looks. Each repair added a site: references to the opening flag went from 4 to 40, and the path check ran from
36 call sites through three definitions of another checkout. A2 states both rules once. Admission is decided at the
take-in from the entry and the route, so no route writes, carries, or clears a flag; a path's folders are checked once
at selection and again just before each change, so no read needs its own check. Its planning review took two
adversarial passes and a fix check, recorded with the reviews' looks in the personal pass record.

A2 supersedes this text, quoted as it stood.

§ 4 ¶5:

> - **The opening requirement is durable (A1).** A record basis can carry a requirement to open its archived edit.
>   Its partition stays unsettled, and refresh, read-back and retry diagnostics can change independently. An index
>   that recorded the requirement as a refusal keeps it on read. Plain save holds the edit until an explicit opening
>   or settlement proves the recorded rendering at the path and finishes any displaced copies.

§ 7.2 ¶4:

> - **Restoration records the opening requirement before changing the path (A1).** It does so whether the swap
>   displaces a file or links into an empty path. A refused or yielded swap keeps the requirement. Settlement can
>   clear it when the installed file matches the staged identity and bytes and its copies have settled (§ 4).

§ 8 ¶2:

> Archive adoption, retirement selection and confirmation, and aside recovery use the archive's live checkout
> boundary for destination stats and reads (A1). When that authority is unavailable, the check answers
> `unobservable` for the file and persistence or recovery holds it. A retry observes the current checkout, keeping
> any opening, accepted receipt, and displaced copy until the corresponding step can finish.

Success Criterion 14, which stays in the specification and is marked superseded at verification:

> 14. **Archive retries retain their authority (A1).** Late checkout changes leave archive adoption and retirement held
>     until authority is restored. An unsettled archive restoration or failed refresh retains the requirement to open
>     the edit, so plain save holds it until explicitly opened or settled by an authorized route.

An advisory review of the rework before its commit found routes the two rules had not yet reached. Each is fixed with a
test that fails without the fix:

- The removal check answers a sendable waiting edit, such as one in an aside copy, as the persist and release steps do.
- `arc sync`'s report of walked archive files asks the path check first. A file no entry names, under a folder another
  checkout holds, is neither read, reported, nor recorded by a start, a sync, or a full materialization.
- A recording keeps the blob of the file bytes its input was read from, so an unopened accepted landing sends those
  bytes and nothing an editor writes while the recording finishes.
- The swap reports a refusal it meets at a change, in a refresh, a removal, a lay, and a read-back alike.
- A waiting edit whose read its folder's permissions refuse is held with that refusal instead of escaping as an error.
- Each refused path is reported once per command, through the sweep and `arc save`'s re-lock too, and a withheld file
  keeps its own remedy rather than the waiting one.

Two of its findings needed a design decision (Owner, 2026-11-20), both recorded in § 8. A receipt the store already
accepted is recorded while its path is refused, rather than leaving the store ahead of the index until the repair. A
rebuild over an unusable index records a refused path's entry without reading its file, and the first command whose
check passes rebuilds it; leaving the path out of the rebuild instead lost its entry until the next rebuild.

## Amendment A3

Complete pass 2 found that the archive save's receipt, built during standard pass 1's fix checks so an interrupted save
could tell an accepted write from an unsent one, had no design record: the specification said this design adds no
prepared store write, and the shipped storage contract's D3 says no evidence needs provenance as its home. The mechanism
stands as built and reviewed. A3 states it in § 1.1, § 4, § 9.1, § 9.2, and § 13, adds § 10.5's forward amendment of
D3, and adds Success Criterion 18, which existing tests cover.

A3 supersedes this text, quoted as it stood.

§ 9.1 ¶1:

> This design adds no prepared store write. `arc edit` writes only the worktree's index and the file's write bit; an
> opened file lands through write-back's own prepared admission (`spec-projection-write-back.md` § 7.2), which fences
> its own reads; a new file adopts through `spec-projection-write-back.md` § 9's existing route; and the re-lock at `arc
> save` is local. Its own step pairs each run under the worktree's projection lock, ordered so a stop between them
> leaves a state the next command repairs:

§ 13 ¶9:

> - **No prepared store write, and the local steps' order** (§ 9): `none` — tactical.

The shipped storage contract is not edited; its D3 sentence "No evidence needs provenance as its home" now reads with
§ 10.5's one exception.

## Amendment A4

The same pass found that a refresh's planned removal or move at a refused path, which an earlier fix keeps incomplete
until the repair, was stated nowhere, and that § 8 had the next command both settle a refused path and leave it
untouched. A4 conditions § 8's next-command clauses on the repair, states the held refresh in § 8 and its cost in § 11
item 11, and appends Success Criterion 17 rather than editing Success Criterion 15, since a criterion is never edited.

## Amendments A5 to A7

Complete pass 3, review pass 12, found three places where the design record no longer read as the code was built.

- **A5.** § 4 and § 9.1 attributed the archive save's journal to `arc save` alone. Any command journals an opened
  path's attachment to an existing record or an opened new path's adoption, and an ordinary command's or a fan-out
  visit's landing of an opened record's edit sends without one. A5 states the routes as built and records the
  unjournaled landing as § 11 item 12 rather than extending the journal to every command: `arc save` is the command
  the notice names, and a landing elsewhere finishes as write-back finishes any landing. Success Criterion 19 covers
  the attachment's recovery.
- **A6.** `arc edit` withdraws the opening it set when its write-bit change finds a changed folder or file, a decision
  recorded under § Independent verification repairs that the spec never stated: § 8 ¶2 and § 9.1 read as leaving the
  opening in place. A6 states it in § 3.3, as the one exception in § 8 ¶2, and in § 9.1. Success Criterion 20 covers
  it.
- **A7.** A2's admission rule had not reached § 2.1 ¶6 or the fourth rejected alternative, which still said the take-in
  never holds an archived edit, nor § 9.1, which listed no step pair for its two path checks. A7 confines § 2.1 ¶6 to
  the edit rights, restates the alternative against § 4's rule, and adds the step pair with § 9.2 test 12.

The amendments supersede this text, quoted as it stood.

§ 2.1 ¶6 (A7):

> Edit rights and their protection mark stay as shipped: `workUnitRights` (`rights.ts`) answers `editable` for an
> archived work unit's owner, so take-in never refuses an archived edit for being archived, whether it arrives from an
> opened file, a refresh that meets a forced edit, or a persist step.

§ 4 ¶6, its opening (A5):

> - **An archive save's journal (A3).** Before `arc save` submits an opened file's write, an opened record's landing or
> an opened new file's adoption, it records the submission on the file's entry and commits the index
> (`stageArchiveSave`, `archive-save-recording.ts`; `submitAdoption`, `adoption.ts`): a receipt ID, the file's stamp and
> read observation, and the name and blob of the input copy it retains (`ArchiveSaveSubmissionSchema`,
> `index-schema.ts`), with the record's reference for an adoption.

§ 8 ¶2, the sentences A6 qualifies:

> Each change a command makes at an archive path, whether a move into place or aside, a folder created, a mode changed,
> or a copy deleted, asks again just before it changes the path. A refusal there stops the work on that path: the path
> is left as a command stopped at that step leaves it, and is reported with its remedy and left untouched for the rest
> of the command, which goes on with its other paths …

§ 9.1 ¶1 (A5):

> This design adds one prepared step to a store write, an archive save's receipt (A3). `arc edit` writes only the
> worktree's index and the file's write bit; an opened file lands through write-back's own prepared admission
> (`spec-projection-write-back.md` § 7.2), which fences its own reads, and a new file adopts through
> `spec-projection-write-back.md` § 9's existing route, each journaled as the step pair below has it; and the re-lock at
> `arc save` is local. Its own step pairs each run under the worktree's projection lock, ordered so a stop between them
> leaves a state the next command repairs:

§ 9.1 ¶2, its opening (A5):

> - **An archive save: the journal, the submission, then the receipt read (A3).** `arc save` commits the journal (§ 4),
> then submits the write carrying the journal's receipt ID in its provenance (`submitProjectionBatch`, `submission.ts`),
> which the store admits only for a prepared archive file write (`BatchInputSchema`, `write.ts`); the backend over Git
> renders it as an `Arc-Archive-Save` trailer naming the ID and a digest of the record's identity, by its owner's UID
> where the owner has one (`archiveSaveTrailer`, `commit-provenance.ts`).

§ 9.1 ¶3 (A6):

> - **`arc edit`: the opened mark, then the write bit.** A stop between leaves an opened file still read-only, which
> `arc save` finds unchanged, lays read-only, and unmarks. The reverse order would leave a writable, unmarked file, a
> forced edit once changed.

Alternatives & Rationale ¶4 (A7):

> - **An `archive` reason among the edit rights — rejected** for a lay mode. It would refuse every archived take-in — an
> opened file's, a refresh's pickup of a forced edit, a persist step's — and need an exception for each.

## Amendments A8 and A9

The fix check of pass 12's fixes found one remedy that named no route a person could run and one place where A6 did
not read as the code was built.

- **A8.** Pass 12 gave an unfinished recording whose retained input copy no longer matches its recorded blob the
  remedy of an unreadable copy: restore the retained copy or recover a projection from readable stored content.
  Neither runs for a mismatch. The copy's recorded bytes are gone, and no command recovers one file's projection from
  the store; the test reached removal only by deleting the index. The store already holds the accepted input, so A8
  ends the recording and withholds the file with the withheld remedy, and once the person deletes the file, the next
  command lays the stored record. An unreadable copy keeps its own remedy. Success Criterion 21 covers it.
- **A9.** A6 said `arc edit` withdraws its opening when its write bit finds a file that is no longer the regular file
  it inspected. The code withdraws it for a changed folder, a file replaced by anything but a symbolic link, or a file
  it can no longer observe. A deleted file, or a link at the file, which reads as deleted, keeps the opening, as a stop
  between the two steps does, and names restoring the file and retrying. Keeping it is the design: restoring the file
  reaches the opening the person asked for, while a replaced file is one the opening never inspected. A9 narrows
  § 3.3, § 8 ¶2 and § 9.1 to that. Success Criterion 22 restates Criterion 20 with that scope, and Criterion 20 is
  dispositioned superseded at verification.

A9 supersedes this text, quoted as it stood.

§ 3.3 ¶11:

> - **A folder or file that changed after the inspection,** found at the write bit: a folder above the path that became
> a symbolic link or holds `.git`, or a file that is no longer the regular file it inspected or that it can no longer
> observe (`changeArchiveFileMode`, `archive-file.ts`), naming its repair. `arc edit` then withdraws the opening it set,
> committing the index as it was (`openPath`, `edit.ts`), so no opening is left over a path the write bit never
> reached; once repaired, `arc edit` opens it (A6).

§ 8 ¶2, the clause A9 qualifies:

> … save `arc edit`'s write bit, whose refusal withdraws the opening it set (§ 3.3) (A6), …

§ 9.1 ¶3, its last sentence:

> A refusal at the write bit because the path's folder or file changed after its inspection, unlike a stop, withdraws
> the mark this invocation set (§ 3.3) (A6).

Success Criterion 20:

> 20. **A refused write bit withdraws the opening (A6).** `arc edit` whose write-bit change meets a folder that became
> a symbolic link or a nested checkout, or a file replaced since its inspection, refuses with its remedy and leaves the
> path unopened and read-only; after the repair, `arc edit` opens it.

## Amendments A10 and A11

- **A10.** A save can accept a second correction from the file it displaced during read-back. `stageArchiveSave`
  keeps the aside name beside the exact read observation and retained input. `acceptArchiveSave` marks only that
  source's fully accepted blob as landed. The sweep's `recoverArchiveSubmission` resolves an interrupted receipt
  before `sweepCopy` can send the same edit. Later bytes still go through ordinary copy settlement. An indexed aside
  write in a prepared `save` batch is eligible for a receipt at `BatchInputSchema`; the command limits receipt creation
  to its own checkout through `needsOpenedSaveJournal`. Criterion 23 covers the interrupted second write.
- **A11.** `openPath` rolls back only the mark that the current edit command added on a parent refusal or a replaced
  file. `changeCheckedMode` declines the replacement before changing its permissions. A missing or linked leaf or a
  failure to set the authorized file's mode leaves the opening. Criterion 24 checks these outcomes and supersedes
  Criterion 22 at convergence verification.

A10 supersedes the journal scope in § 4, whose third route was stated as:

> Three routes journal: `arc save` in its own checkout, landing an opened record or attaching an opened path
> to an existing record; any other command attaching an opened path (`needsOpenedSaveJournal`, `write-back.ts`); and
> any command adopting an opened new path.

The previous § 10.5 limited the receipt to a "prepared archive file write." A11 supersedes Criterion 22, which
required the refused path to be "unopened and read-only" for a changed parent or replacement.

## Amendments A12 and A13

- **A12.** The fix check found that `swapBatch` could commit its pre-link entry, then stop before the link.
  `restoreCopyRendering` restored the original bytes and marker mapping without the acceptance proof.
  `resumeAdoptionReadBack` also selected the staged rendering after a timestamp-only change to a text adoption.
  Criterion 25 checks both paths of first-lay recovery and keeps the regression check for a later revert.
- **A13.** `finalizeAsideCopy` observed the destination outside the archive access classification, and
  `retriedMoves` could return a raw permission error after a denied link. An authority check may pass in both
  cases. Criterion 26 covers the shared per-destination hold where the filesystem refuses these operations.

## Amendment A14

A14 follows the incomplete directory walk through the rebuilt index, the next ordinary command, and the operations
that settle copies. A stored record plan cannot rediscover a local file that entered neither the store nor the index.
Criterion 27 checks the retry with an unindexed edit and a recorded copy, and distinguishes an unreadable directory
from a single child whose stat fails. The same selection holds cover both refresh preparation paths. A12 continues
to govern predecessor adoption in both formats, including an intentional revert after installation.

## Amendment A15

An editor's rename can remove the staged inode after installation but before the journal marks it installed.
An exact match with the accepted input then supports two histories that can yield different edits. A15 keeps
the live bytes and opens the existing explicit resolution route. Criterion 28 covers the held bytes,
the unchanged store version before resolution, and the completed read-back for both journal formats.

## Save after a retirement refusal

`df1406656e` preserves a retirement hold across plain `arc save`. The local correction stays available, and the store
keeps its original bytes and version until the user runs `arc edit` and `arc save`. Both the persist and release cases
reproduced the premature write in `44feb84fe73d4c0da0921690a9ffddf5`. The corrected Linux run
`55e95af7922440e4968a2c9fdc0df6ad` passes 75 cases across five suites.

Native Windows run `4de738f04e0749f8b7b91460947ea3c5` passes both regression cases and the randomized save-loss case
that timed out in hosted run `44311348841` at `e3737c13db`. The focused case accounted for all 100 writes.

## Independent verification repairs

The criteria review found that a nested checkout could replace a file after `arc edit` recorded the opening. The
permission change now rechecks the Git checkout and matches the file's device and inode against the file inspected
before recording intent. A refusal for a changed boundary clears the intent this invocation created. Absent files
retain their restore-and-retry remedy. The refusal tests exercise real sync restoration and relocation into an
established archive folder. The archive notice names the writable step and the user's editor.

An opened archive save now records the accepted version and retains the submitted bytes before reading it back.
After interruption, both an ordinary command and a directly retried `arc save` recover the accepted recording.
The tests count real store submissions across each retry and check the file's mode and index before and after
recovery. A rebuilt index compares settled empty archive text with its store base and closes matching files.

The retirement repro also found a changed entry in a partition already open for settlement. Spec § 8 permits
finishing those entries, and the terms exclude them from forced edits. Both persist and release follow that rule.

Linux run `f4607f08c0144e5297b83d3593adc300` passed 993 tests across 96 projection suites. Linux run
`61d9c2a71e0e4fe0beac6f60468ed198` passed all 34 opening cases, including clearing the new intent after a refused
replacement. Native Windows runs `4f470fcb70b24bc68b273ba21b195b69` and `2435c2ccd13a4c02ae64489adb3c58a2` passed
11 focused correction cases and eight save-recovery cases, respectively.

### Verification evidence on `db32bc500f`

The local merge gate passed all 21 selected checks, including six shards covering 460 affected store suites. Hosted
run `44426111760` passed with 40 successful jobs, including the Windows and macOS portability pair. Its exact head
was `db32bc500f7b62d9dc6cc04db673662530c975d6`. Run `44429659065` repeats the timing jobs on that same head.

| Reference and run                        | Save paired difference (ms) | Opened-start paired difference (ms) |
| ---------------------------------------- | --------------------------- | ----------------------------------- |
| Linux `6967a303e1db487d9f5740a5f5e4f2e6` | −0.256                      | +2.486                              |
| Windows job `135231637805`               | +1.457                      | +7.832                              |
| macOS job `135231637719`                 | −26.992                     | +4.194                              |
| macOS job `135243866909` (repeat)        | −36.635                     | −18.061                             |
| Windows job `135243866755` (repeat)      | +0.594                      | +8.954                              |

The Linux run's immutable snapshot `af7e74865f9fd21201dcf4ffeea13257c9c8a9e8` has the same tree as the verified head.
The hosted runs retain `projection-timing.json` in their platform timing artifacts. Each measurement retains 11
alternating pairs and both sets of raw samples. Linux and Windows meet their paired bounds. Both macOS save results
fall outside the 10 ms band. The macOS absolute standard and expanded start medians also exceeded their separate
45 ms bound on both runs, at 120.402/86.627 ms and 99.664/89.296 ms. The hosts logged one-minute load averages of
22.28 and 17.25 on three CPUs before the tests. The cause remains unresolved.

Probes after the independent fix check reproduced a second store submission after two interruptions. Run
`4300dd79da96479cb669a2c9089bc9e0` stops at the first checkpoint after native store acceptance. Run
`61ff7a1fb4d74032844d041410a3f734` stops after the accepted recording is on disk for an existing text companion.
Both the direct save retry and the ordinary command followed by save resubmit the text companion. These results
leave Success Criterion 6 open.

### Store-backed save recovery on `5173717612`

The checkout retains the indexed archive save's input and identity before submission. The reference store commits
that identity along with the exact record. A retry that lost the response reads that receipt and recovers the
accepted version without a second submission. The text retry checks the accepted input's content. Linux runs
`d75af2cc610b44ccbbfe5d1d66d1cb9d` and `99b714b1aefc4d5f8636a6cfa8c6d8d1` cover the restart, unaccepted, already
stored, and unavailable history cases. Native Windows run `719988a71033471285b542ded91f7deb` passed seven recovery
and re-lock cases. The local merge gate passed 21 checks, including 460 affected store suites.

Hosted run `44435229834` reached 39 successful jobs. Windows shard 7 timed out in the archive-conflict notice
repair test in both jobs `135262649757` and `135275282619`, leaving the full run failed. Native Windows run
`42048998607d4287a5ef46fdb6b9a814` passed the isolated test in 24.06 seconds against its 30-second limit. The two
hosted attempts retain the timeout evidence.

Linux timing run `7eb0563582e549cba1e1b30e0c9c49df` used immutable snapshot `4e3fecb91a21e0218b4519a15abe6db1a1ae4b4c`,
whose tree matches `517371761211fe76f6efeae168a0badb733fca6f`. Hosted run `44435229834` used the same head. All three
references meet both paired bounds. The Linux run and hosted platform timing artifacts retain all 11 pairs and
both sets of raw samples for each comparison.

| Reference and job      | Save paired difference (ms) | Opened-start paired difference (ms) |
| ---------------------- | --------------------------- | ----------------------------------- |
| Linux                  | −0.030                      | +2.698                              |
| Windows `135262649297` | +2.214                      | +2.697                              |
| macOS `135262649511`   | −0.312                      | +1.457                              |

Probes after the next independent check reproduced two remaining issues. In run `e3e7382e6bcb4255bace5e77091d680e`,
a retry overwrites a text edit made after read-back installed a newer version. In run `9e4208c0304d4d268f6fd767df8b770c`,
a retry after interrupted adoption sends the newly accepted file a second time and can overwrite a newer intervening
store write. These findings held verification on `5173717612`.

### Late edits, archive adoption, and the Windows notice test

`d794ddd6fa` binds the accepted text to the local file observation made before read-back. Recovery uses that input
while the original file still holds it. A text edit after the newer rendering is installed remains writable with an
ambiguity report if the known bases disagree. Opened archive adoptions retain their input before submission and
recover the exact store receipt before attaching to the newly created record. The tests cover direct save and
ordinary command recovery with an intervening store write. Linux run `82f2579257414fef84ee165ec1efafa5` passed 112
save, re-lock, and archive retirement tests. The full projection run `9e28cba381fa4d1092d3b5ecaffa2acc` passed all
1,006 tests across 96 suites.

The Windows archive-conflict notice case now gets 60 seconds. It still creates and synchronizes a whole-record
conflict with real repositories and verifies the notice, explicit resolution, and retirement. A native Windows
profile in run `b33ef3d8f50a4072909bd6968e30f4e3` took 24.95 seconds. Setup and the initial check took 5.4 seconds,
creating the conflict took 13.1, and status, resolution and retirement checks took 6.4. The notice case took
29.34 seconds alongside the other focused native Windows cases in `6f2a6642d6104e72936b191fd22b5672`.

### Verification evidence on `e8b422a177`

The local merge gate passed all 21 selected checks, including six shards covering 460 affected store suites. Hosted
run `44444958603` passed with 40 successful jobs on `e8b422a1771800153806520d896ffae991db0288`. Its Windows shard 7, job
`135295165509`, passed all 85 files, including both archive-conflict cases. The Linux runner tested the same tree in
`af8adbfb3d884061ba9ed4e3d415b7b6` (`a54f35d6247c48990e6ac01b26308c78d5c7e3d4`). The Linux output and the hosted
platform timing artifacts retain all 11 raw pairs for both comparisons.

| Reference and job      | Save paired difference (ms) | Opened-start paired difference (ms) |
| ---------------------- | --------------------------- | ----------------------------------- |
| Linux                  | −0.897                      | +1.992                              |
| Windows `135295165457` | +3.052                      | +5.670                              |
| macOS `135295165589`   | −0.311                      | +1.272                              |

All three references meet both paired limits. The macOS one- and ten-file fan-out medians were 802.816 and
2971.207 ms, respectively, above the separate inherited bounds of 600 and 2800 ms.

The focused independent check verified the text recovery repair and the narrower Windows test budget. Probes
reproduced three remaining cases on this head. Run `f74c955e80454bb2b2212d82777eb78b` resubmits an accepted
attachment on an ordinary command retry. Run `f43ca4e0adee41bca31e76a12b805f70` resubmits a late edit taken in by
an adoption's read-back guard. Run `a9e0efdd68534925b806ec51e24ed501` shows retirement reporting a refusal it
observed before it recovered an accepted adoption. These findings held verification on `e8b422a177`.

## Interrupted adoption and retirement recovery

An ordinary command that attaches an opened archive path to an existing record now records the input before
sending it. On retry, the accepted receipt restores the observation for adoption, including a late edit taken in
by the read-back guard. The recovery can install a newer peer version without resending the accepted edit.
The read-only retirement check holds while the submission is pending. Persist and release recover it under
the checkout lease and use the result of that recovery.

Commit `4b723680ae` adds the three corrections. Linux run `78edf7fe5596482f8ba50e36284d2b33` passed all 1,010
projection tests in 96 files. Windows run `bed810f382f3498eba7cb5f1a09c06d9` passed the two adoption retry cases
and the recovery regression through both retirement entry points. The independent check of
`e8b422a177..4b723680ae` found no actionable defects in the three repairs.

The merge gate on `4b723680ae` passed all 21 selected checks. Its six store shards covered the 460 suites
reached by the changes (`dc476cd1a8dd48db8944680a38aaadbb`). Full hosted run `44450640142` passed with 40 successful
jobs, including the Windows and macOS portability pair. Windows job `135313765214` passed all 85 files, including
the archive-conflict notice case in 23.116 seconds.

### Paired timings on `4b723680ae`

Linux run `ca461f04a7154e839bcf13604dce34a8` used `m5-air-ac`. Its snapshot
`35af5c0dbfeb0e1b9724b92824bb023dbab413ea` has the same tree as `4b723680ae`. The Windows and macOS jobs in hosted
run `44450640142` used that commit. All three raw records retain 11 alternating pairs and their individual samples
for each comparison.

| Reference and job      | Save paired difference (ms) | Opened-start paired increment (ms) |
| ---------------------- | --------------------------- | ---------------------------------- |
| Linux                  | +0.575                      | +2.182                             |
| Windows `135313765057` | −1.660                      | +3.633                             |
| macOS `135313765033`   | +2.626                      | +8.194                             |

All three references meet the criterion's paired limits. The macOS absolute start medians were 98.486 and 71.340 ms
for the standard and expanded fixtures, respectively, above the separate inherited budget of 45 ms.

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

## Amendment A16

An archive retry records work still owed. `observeArchiveScopes` filters structurally refused scopes out of its
walk, while `recordRebuildDiscovery` derives the next pending set from native holds. This can lose the only
locator for an unindexed edit. A returned alias can also go away before inventory reaches its destination.
`readProjectionIndex` returns a validated header on partition failure, even when its entries cannot be trusted.
A16 preserves those obligations and requires observed coverage before dropping them. A legacy path with no
file-type evidence can name an opaque directory, so a link at that path leaves the retry pending through repair.

## Amendment A17

Review added three mechanisms to the archive by amendment, each promising a property on every route a command can take.
The archive save's receipt and journal are A3, A5, A8, A10, A12, and A15, with § 10.5's storage-contract trailer. The
path check, with its access, destination, and inventory holds, is A2's second rule, A4, A6, A7, A9, A11, A13, A14, and
A16. The waiting-edit admission rule is A1 and A2's first rule. The design as activated has none of them. From complete
pass 4 to fix check 32 the lane's critical and major findings ran 4, 5, 5, 4, 4, 5, 6, 6, 5, 5, 5, 5, 4, 10, 6, 20, and
19, and all 19 at the last look sit in the first two mechanisms. Source insertions over the base grew from 845 at the
build as designed (`396b4e929b`) to 5,399 at `37f4531c1b`.

A17 withdraws all three, approved 2026-11-24:

- **The receipt** closes for the archive alone a window the shipped design accepts for every root: a command stopped
  after a write lands and before the index records it sends the edit again (`spec-projection-write-back.md` § 7.8, § 17
  item 6). An archived correction is rare, so the archive is the root where that resend costs least.
- **The path check and its holds** answer a question that belongs to every projected root: whether a command re-checks a
  link ancestor just before a write, and whether a fault holds one path while its siblings continue. The copy handling
  they were laid over is shared code this unit had not changed, so each hold patched one site of it for one root.
- **The waiting rule** kept a flagged, unopened edit out of every later command. Without it such an edit lands at the
  next plain `arc save` (§ 11 item 10), as § 6.1 has read since activation. The narrower rules stay: sync's restoration
  takes nothing in, and the persist step lands no forced edit.

The body returns to its activated text in every section A1 to A16 revised; the text they wrote is the specification at
`37f4531c1b`. Three places differ from the activated text, each marked: § 9.1's landing bullet and § 11 items 9 to 11.
§ 9.1 as activated read:

> A stop after the store accepts the write, before the swap, leaves the edited file and the write's recording, which the
> next command finishes (`spec-projection-write-back.md` § 7.1), laying the file read-only inside `arc save` and
> writable elsewhere; the next `arc save` then finds it unchanged and re-locks it.

That holds only once the index has recorded the write. `sendAttempt` (`write-back.ts`) calls `submitProjectionBatch`,
reads the store's result, and only then `recordWriteBack`, so a stop before that call leaves no recording. A17 states
both windows and builds nothing for the first.

Success Criteria 14 to 29 stand as written and are dispositioned superseded at verification. Two source references,
in § 6.2 and § 8, now name the files that hold them in the build (`file-write-observation.ts`, `adoption-verdict.ts`).

A stamped Markdown file restored to a rendering ARC laid equals its stamp's version, reads as unedited, and is refreshed
(`spec-projection-substrate.md` § 3.3, § 3.6). The three critical findings of fix check 32 each restore such a file, and
A12's promise to treat that revert as an edit goes with the first-lay proof.

The code returns to the build as designed and keeps the earlier fixes that serve the activated text: `arc edit`'s
refusals and remedies, the archive notice, the re-lock at `arc save`, sync's report and restoration, and the removal
check's classification.

Each notes section written between activation and A17 records the build at the commits it names. Read against the build
after A17:

- **Historical,** recording the receipt, the path check with its holds, or the waiting rule as built: every amendment
  section from § Amendment A2 to § Amendment A16, § Save after a retirement refusal, and § Interrupted adoption and
  retirement recovery. One rule in § Amendment A2 is still the build's in part: `arc save`'s re-lock does not report
  again a path the command already reported. Two distinct conditions at one path are each still reported.
- **§ Archive boundary corrections, in part.** A1's opening requirement, the link validation before archive pickup, and
  the mode change through a handle that identifies the observed file are withdrawn. The check of which checkout owns the
  requested path, the same-byte replacement kept opened while writable, the retirement's refusal of a late forced edit,
  and sync's naming of a walked, indexed edit stay.
- **§ Independent verification repairs, in part.** The re-check of the Git checkout at the permission change with its
  device and inode match, the cleared intent on a changed boundary, the accepted version recorded with its submitted
  bytes before read-back, and both recovery subsections (store-backed save recovery; late edits and archive adoption)
  are withdrawn. Its verification evidence and paired timings were measured on commits that carried those mechanisms and
  are not readings of the build after A17. Within the late-edits subsection, the paragraph on the Windows
  archive-conflict notice case and its 60 seconds describes a test that still runs. Its paragraph on a changed entry in
  a partition open for settlement is corrected by § Amendment A19: an entry's own state decides what the persist step
  finishes, never its partition's mark.
- **Current:** every other section.

## Amendment A18

Pass 33 read § 11 item 10, which A17 added, against the Terms. Its heading called the correction "an unsettled forced
edit" and its last sentence said the persist step lands no forced edit, while the Terms define a forced edit as one
whose entry is neither opened nor unsettled and § 8 has the persist step finish an unsettled entry. One reviewer took
the build's behavior for a defect on that wording. A18 corrects the wording and changes no behavior, approved
2026-11-24. Item 10 as A17 wrote it:

> **An unsettled forced edit landed by a plain save (A17).** A forced edit that a refresh could not take in, or that
> the persist step refused over, stays in its file (§ 7.1, § 8). Where that leaves its entry unsettled, the next plain
> `arc save` reads it among § 6.1's unsettled entries and lands it where its rights allow, without `arc edit`.
> `arc sync`'s restoration still takes nothing in (§ 7.2), and the persist step still lands no forced edit (§ 8).

The build's rule is one test: `unopenedArchiveEditMark` (`archive-inspection.ts`) answers no remedy for an entry that
`isProjectionEntryUnsettled` (`index-file.ts`) unless its refusal is the inspection's own, so sync's report, the removal
check and the persist step all leave such an entry to the step that finishes it. `restoreWithoutArchiveTakeIn`
(`sync-materialization.ts`) refuses a correction it meets through `refuseProjectionEdit` (`rights-binding.ts`), which
marks the entry pending; the next refresh over the file, the next plain `arc save`, or the persist step then lands it
under the rights check every take-in makes. Nothing is lost on any of the three routes. Holding such a correction for
`arc edit` at removal would restore part of the waiting rule A17 withdrew.

## Amendment A19

The fix check over pass 33's repairs read item 10 as A18 wrote it and found two answers for one retry. A18 listed the
persist step's own refusal among the origins of an unsettled correction and said each named step, the persist step
among them, lands it; its last sentence said the persist step keeps refusing over an entry its own refusal marked. A19
separates the two and changes no behavior, approved 2026-11-24. Item 10 as A18 wrote it:

> **An unopened correction left unsettled lands without `arc edit` (A17, A18).** A forced edit that a refresh could
> not take in, that `arc sync`'s restoration refused, or that the persist step refused over, stays in its file (§ 7.1,
> § 7.2, § 8). Where the refusal leaves its entry unsettled, the correction is no longer a forced edit as the Terms
> define one, and each step that finishes unsettled entries lands it where its rights allow, without `arc edit`: a
> refresh that touches its file (§ 7.1), the next plain `arc save` among § 6.1's unsettled entries, and the persist
> step under § 8's rule for an unsettled entry. `arc sync`'s restoration still takes nothing in (§ 7.2), and the
> persist step still lands no forced edit and keeps refusing over an entry its own refusal marked (§ 8).

The same check corrected a paragraph of § Independent verification repairs that A17's list had kept: it said § 8
permits finishing a changed entry in a partition already open for settlement. The header marks a quarter when any
entry in it is unsettled (`index-file.ts`), which decides only what a plain `arc save` reads; the persist step reads
every quarter. `unopenedArchiveEditMark` (`archive-inspection.ts`) tests the entry itself, so a settled file edited
beside an opened one in the same quarter is a forced edit and the persist step refuses over it.

## Amendment A20

The build as activated closed an opening only when `checkChange` found the file's bytes unchanged. A review round then
let the re-lock close a text file other than Markdown whose save changed only its line endings, since write-back reads
such bytes as holding no edit where the store holds LF (`readStamplessFile`, `stampless.ts`). That left a closed file
whose bytes differed from its entry's, while sync's report, the removal check, the persist step's capture guard and a
release's replace guard all compare bytes: pass 33 found the file read as a forced edit whose remedy repeated the same
save. Two repairs tried to make the other steps agree, first by normalizing line endings in the archive inspection,
then by recording the accepted bytes on the entry, and each left a route that disagreed: a file the store holds with
CRLF reported as edited, a release that still refused, a `status` between the edit and the save that skipped the
record, and bytes accepted through a text decoding that could not tell them apart.

A20 withdraws the exception, approved 2026-11-24. The re-lock closes a text file only when its bytes are the projected
ones (`restsAsProjected`, `save-relock.ts`). It reads them itself, because write-back's `no-edit` answer records the
file's stat (`stamplessVerdict`, `write-back.ts`) and a later check would trust that stat. A line-ending-only save
keeps its opening, writable, with a remedy that names restoring the line endings; a save that also changes the text
lands and its read-back lays the stored text. A line-ending change to a file nobody opened is a forced edit like any
other. No entry is rewritten, so every later comparison is the one the designed build made.

## Delegated work from 11-24

Approved on 2026-11-24 at 7:21 am CT, with the right-sizing decision that became A17, and in force for this work unit's
rescue only. It relaxes the rule that work landing in an increment is done by the session that holds it; it approves no
commit, disposition, review pass, or merge.

- **Read-only triage: Astra.** One run classed every finding of the 32 review looks against the design as activated. It
  was advisory: the list of fixes to re-apply was drawn from it and approved with fix check 32's disposition set, and
  the rows it traced to code inherited from `main` were checked against source before they were routed out.
- **The restore and the re-applied fixes: Sol.** Four headless runs at high effort re-applied the fixes that serve the
  design as activated, onto `packages/` restored to `396b4e929b`, each from a written brief naming its fixes, and each
  reported its regression tests failing on the restored build first. The runs edited this checkout uncommitted, one at a
  time, and committed nothing.
- **Fix checks: Astra at the highest effort**, on a disposable clone. None has run under this approval: at look 33's
  coverage offer (10:54 am CT) a complete pass was chosen in place of the planned fix check, since the fix range, 12,095
  changed lines, exceeded the whole change set, 7,953. A later fix check, over a small range, still goes to Astra.
- **The complete pass: a fresh-context Fable reviewer**, in the specification's three chunks with a seam and an
  aggregate, its brief carrying no author conclusions.

Kept by the session that holds the work unit: the design and A17's text, the brief for every run, reading each returned
source change against its brief and the specification, verifying every review finding against source, the proposed
dispositions, every gate and its evidence, and every commit and push. A builder's or reviewer's report is advisory until
checked that way.

It ends when this work unit publishes, or earlier when withdrawn. Work after that, and any kind of work not named above,
takes a fresh approval.

## Model evidence

The per-unit constants and model v2's growth table are in `notes-projection-worktrees.md` § Spike 3 and § Spike 4; the
model's re-run at the scale anchor (23 work units a month a person, 20 worktrees, three years of archive, and teams of
1, 10, 50, and 150) is in `draft-projection-narrowed-views.md` § Evidence. The model is linear, takes the index codec's
constant at the measured size nearest each scenario, models no contention, and took its Windows constants from a runner
at below-normal priority. Where its figures meet A4's measured bounds, the measurements govern.

---
