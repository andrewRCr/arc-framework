# Notes: store-operation-git-access

## Contents

- [Making maintenance due in a case](#making-maintenance-due-in-a-case)
- [Imported-claims publisher authority](#imported-claims-publisher-authority)
- [Measured process cost](#measured-process-cost)
    - [Attribution caveats](#attribution-caveats)
    - [Expectations and retained cost](#expectations-and-retained-cost)
- [Per-file subcommand counts](#per-file-subcommand-counts)

## Making maintenance due in a case

The test helpers set `gc.auto 0` in the code repositories and clones they create (`temp-repo.ts`, `multi-clone.ts`,
`commit-message-fixture.ts`). A separate store, created by `git init --bare` under an empty system and global
configuration, keeps Git's default thresholds, which no store suite is shown to reach. A case that needs a fetch to
trigger maintenance makes it due in the repository the fetch writes, the store in the separate layout.

The first due run consumes it. On Git 2.55, under empty global and system configuration and with every fetched pack
kept (`fetch.unpackLimit 1`, `transfer.unpackLimit 1`), the first fetch whose maintenance was due repacked two packs
into one. The next fetch's `maintenance run --auto` ran nothing, although the store again held two packs. A case aimed
at a later fetch of a call therefore keeps Git's default thresholds until that fetch starts, then sets `gc.auto 1` and
`gc.autoPackLimit 1` in the store from the port it supplies. `fetchRefPatterns` passes its refspecs on stdin, so the
port recognizes a history fetch by the `refs/arc/history/` refspecs in its input. `verify-integrity.test.ts` runs
maintenance explicitly (`maintenance run --auto --task=gc`), so only its detach settings carry over.

The main fetch must receive fresh objects before the history fetch makes maintenance due. Archiving alone does not
establish that the earlier main fetch adds a pack. The case also publishes a fresh personal record and asserts its
contents after maintenance.

Git 2.56 defaults unscheduled automatic maintenance to geometric repacking. On that version the earlier main fetch
consolidated the two similarly sized packs before the history-fetch observer lowered the GC thresholds; the history
fetch then added a pack without repacking it. The native-Windows trace reproduced both steps. The fixture seeds a larger
initial object count with a batch of 64 distinct personal documents, leaving the default geometric progression intact
through the earlier fetch. At the history fetch it also sets `maintenance.geometric-repack.auto -1` and
`maintenance.geometric-repack.splitFactor 1000000`, so that strategy performs an all-into-one repack at the same event.
Older Git retains the existing GC thresholds. Windows detach defaults remain unchanged. Reader-release ordering,
multiple packs before maintenance, removal of every superseded pack, and all retained contents remain asserted. The
maintenance case's stated outcome holds; this changes only the fixture that establishes its precondition.

The pack geometry was independently reproduced on native Windows: the fresh-record fixture failed
(`5b8ed58741d94d2a88e64551a27c9aae`), and the corrected fixture passed with the original reader-release, pack-removal,
and content assertions (`39de6be5098445e8bc1f58d464260926`). The full reader-lifetime file also passed all 30 cases on
the native store runner (`48913cabaf1141129a58639baf9e0afb`). This focused evidence supplements the full store check;
hosted diagnostic CI remains feedback rather than work-unit verification evidence.

Primary sources: Git 2.56's `builtin/gc.c` selects the default strategy; its maintenance configuration documents the
geometric task's due setting and split factor, and `repack-geometry.c` weights packs by object count.

- <https://raw.githubusercontent.com/git/git/v2.56.0/builtin/gc.c>
- <https://raw.githubusercontent.com/git/git/v2.56.0/Documentation/config/maintenance.adoc>
- <https://raw.githubusercontent.com/git/git/v2.56.0/repack-geometry.c>

## Imported-claims publisher authority

Amendment A1 supersedes this inventory claim (§ 7.4): "Every other re-read of designation that looks for another
process's change already runs under the layout lock."

`retireImportRemote` reads designation before its source-retirement callback. `retireOriginRefs` then calls
`unpublishedImportClaims`, whose own publisher read has no new lock or other scope refresh between it and the earlier
answer. The independent configuration write in `store-ref-import-read-only.test.ts` therefore changed the observed
refusal while retaining the source safely. Its unchanged publisher-disappearance case reproduces the gap.

`RefOperationScope.refreshConfiguration` exposes the existing generation increment and answer-map clear, without
closing readers. `unpublishedImportClaims` calls it only after finding required claims, immediately before reading
publisher designation. This retains the execution and lock behavior and refreshes subsequent command lookups too.
The amendment is determinate and bounded to that authority check; the remaining operation lifetime rules stand.

The unchanged publisher-disappearance case failed before the correction (`142a62789cfd457bb9169c9c00e54a27`) and passed
after it (`f91ac77569bc4eeb8a9d2bd42818ddff`). The focused import, transient-observation, pending-import,
reader-lifetime, and operation-configuration run passed all 67 cases (`08be177af1014efeb33604f775af5a71`). The full
store check passed its 322 selected suites (`6788f164e2b84fc187c9f9a5d7696cd0`), including the full separate-layout
conformance suites. The two environment-gated burst/timing suites remain outside that selection. Every original
publisher-refusal assertion and independent configuration write remains unchanged. No lock or reader boundary changed.

## Measured process cost

The baseline is `023a0636eddfc6f1862dcd0e801c4e8ab44ba246`, measured in an independent checkout before any base merge;
the measured head is `84f6f08dc351492417d8383b54f4f0c20cfe328f`. Each file ran alone twice at each end, once with the
timing preload and once with the attribution preload, under `nicecap -n 19 -r 8`. The baseline and head use the same
ten files and preloads. The process counts below use the attribution worker PID, following the original analysis; case
time sums completed case durations from the timing run. These are single paired runs, so process counts carry stronger
evidence than wall time.

| File                          | Processes before |  After | Reduction | Case seconds before | After |
| ----------------------------- | ---------------: | -----: | --------: | ------------------: | ----: |
| `cleanup-report`              |           18,320 | 13,502 |     26.3% |                89.3 |  62.4 |
| `conformance-reads`           |           18,690 | 17,125 |      8.4% |               118.3 | 110.4 |
| `conformance-sync`            |           29,037 | 25,132 |     13.4% |               115.7 | 104.6 |
| `follow-copy-handoff`         |           24,605 | 18,001 |     26.8% |               108.8 |  77.8 |
| `follow-restart`              |           24,642 | 18,536 |     24.8% |               111.8 |  85.7 |
| `import-errands`              |           21,525 | 19,461 |      9.6% |               112.0 |  99.7 |
| `import-observation-failures` |           42,416 | 41,708 |      1.7% |               198.1 | 209.4 |
| `remote-delete`               |           21,046 | 15,346 |     27.1% |               101.9 |  78.4 |
| `separate-conformance-reads`  |           19,282 | 17,691 |      8.3% |               116.6 | 115.3 |
| `withdraw-entry-inverse`      |           47,849 | 38,361 |     19.8% |               196.6 | 154.1 |

The complete before/after JSON reports, spawn and raw logs, the measurement and comparison scripts, and
`comparison.json` are retained under `~/dev/arc-evidence/store-operation-git-access/` on the measuring machine, with
the baseline and head checkouts registered as worktrees there.

### Attribution caveats

The attribution preload retains only the first five arguments. `?` is an invocation whose leading options fill that
window, so its subcommand cannot be recovered. Multiword configuration values also lose their argument boundaries:
labels `A`, `B`, `User`, and `Writer` are folded into `?`, rather than presented as Git subcommands. These limitations
are the same in both runs, and the unclassified counts match before and after.

- The largest `cat-file` callers before this work were `namespace-health.ts` (4,957), `sync-merge.ts` (3,468),
  `lineage-resolution.ts` (3,211), and `push-families.ts` (2,414). The attribution stops at the first store frame, so
  it does not split them by entry call.
- Stack attribution counted 4.5–5.4k identical configuration reads within one call, but it loses callers across
  unawaited promises. The first prototype removed about 13,000 `config` and `remote` starts within calls in four files.
- `diff-tree --stdin` output is not length-framed, so tree enumeration cannot join the shared reader as it is. That
  bears on whether walking trees through the reader earns its own work after the measurement.

### Expectations and retained cost

Across all ten files, process starts fell from 267,412 to 224,863 (15.9%); summed case time fell from 1,268.9 to
1,097.8 seconds (13.5%) in this single paired measurement. Each baseline/head timing and attribution set completed
1,514 cases with the same 64 pending cases and no failures. All 40 reports are successful. The reduction consists of
21,089 `cat-file`, 17,585 `config`, 2,591 `remote`, and 1,284 `ls-remote` starts; every other decoded count is unchanged.

The five expectations are accounted for individually:

- `cleanup-report`: 26.3% fewer processes, exceeding the 14–25% expectation. Readers remove 1,737 starts; configuration
  removes 2,262, remote lookups 543, and URL resolution 276.
- `conformance-sync`: 13.4% fewer, slightly below the 14% lower expectation. All 3,905 removed starts are 1,462 readers
  and 2,443 configuration lookups. The 1,683 remote starts remain: 841 push-URL lookups, 560 fetch-URL lookups, 281
  remote-name listings, and one fixture remote creation. Every one of the file's 281 pushes reads its push URLs once
  more than the second prototype did. Under one comparison hold, `readComparisonSource` (through
  `readRemoteTransports`) and `publicationTargetMatches` (through `readNamedTransport`) each run
  `remote get-url --push --all`. The spec's § 7.2 keys a remembered answer by its function, so the second read starts
  a process; the second prototype shared that answer. Against that prototype's 24,959 starts, this implementation's
  25,132 adds those 281 push-URL starts and removes 56 readers and 52 configuration lookups. Without the repeated read
  the file would drop 14.4%, inside the expectation, so the shortfall is that lookup-key choice rather than the
  freshness rule or an unscoped call. Ref enumeration remains 12,761 starts, over half the remaining total.
- `follow-restart`: 24.8% fewer, within expectation; 2,033 reader starts, 3,045 configuration starts, 680 remote
  lookups, and 348 URL resolutions disappear while retries retain their fresh-reader boundary.
- `withdraw-entry-inverse`: 19.8% fewer, within expectation; 6,976 reader starts and 2,512 configuration starts
  disappear. Remote starts stay at 1,828; ref enumeration and tree-diff processes also remain.
- `conformance-reads`: 8.4% fewer, within the under-one-tenth expectation; 1,466 reader starts and 99 configuration
  starts disappear. The remaining 1,712 `diff-tree` starts still enumerate trees outside the shared object reader.

`import-observation-failures` removes only 708 starts (1.7%), and case time rises from 198.1 to 209.4 seconds in this
pair. Its unchanged legacy-import scans still account for 11,940 `ls-tree`, 9,156 `show`, and 3,756 `worktree` starts;
sharing the ref backend's readers and configuration does not remove those scans. The timing pair does not establish
the cause of that increase. Both read-conformance layouts show the same 1,466-reader reduction; the separate layout
also removes 125 configuration starts, for an 8.3% overall drop.

This unit's production code and the ten measured test files are unchanged since the measured head. Later changes are
test cases and fixtures outside the ten-file set, verification records, and the base merge, whose own store changes
this measurement does not cover.

## Per-file subcommand counts

### `cleanup-report`

| Subcommand     | Before | After |
| -------------- | -----: | ----: |
| `?`            |    667 |   667 |
| `cat-file`     |  2,274 |   537 |
| `clone`        |      4 |     4 |
| `commit`       |      2 |     2 |
| `commit-tree`  |    288 |   288 |
| `config`       |  3,512 | 1,250 |
| `diff-tree`    |    400 |   400 |
| `fetch`        |    123 |   123 |
| `for-each-ref` |  5,745 | 5,745 |
| `hash-object`  |    602 |   602 |
| `init`         |     53 |    53 |
| `ls-remote`    |    505 |   229 |
| `ls-tree`      |     24 |    24 |
| `merge-base`   |    508 |   508 |
| `mktree`       |    314 |   314 |
| `push`         |    215 |   215 |
| `remote`       |  1,222 |   679 |
| `rev-list`     |      8 |     8 |
| `rev-parse`    |     97 |    97 |
| `update-ref`   |  1,757 | 1,757 |

### `conformance-reads`

| Subcommand     | Before | After |
| -------------- | -----: | ----: |
| `?`            |     31 |    31 |
| `cat-file`     |  3,501 | 2,035 |
| `clone`        |      1 |     1 |
| `commit`       |      1 |     1 |
| `commit-tree`  |  1,162 | 1,162 |
| `config`       |    774 |   675 |
| `diff-tree`    |  1,712 | 1,712 |
| `for-each-ref` |  5,683 | 5,683 |
| `hash-object`  |  1,089 | 1,089 |
| `init`         |      2 |     2 |
| `log`          |      4 |     4 |
| `ls-tree`      |    243 |   243 |
| `merge-base`   |      4 |     4 |
| `mktree`       |  2,006 | 2,006 |
| `push`         |     10 |    10 |
| `remote`       |     61 |    61 |
| `rev-list`     |    207 |   207 |
| `rev-parse`    |    283 |   283 |
| `show`         |     77 |    77 |
| `update-ref`   |  1,839 | 1,839 |

### `conformance-sync`

| Subcommand     | Before |  After |
| -------------- | -----: | -----: |
| `?`            |    565 |    565 |
| `cat-file`     |  2,676 |  1,214 |
| `clone`        |      1 |      1 |
| `commit`       |      1 |      1 |
| `commit-tree`  |    423 |    423 |
| `config`       |  6,466 |  4,023 |
| `diff-tree`    |  1,256 |  1,256 |
| `fetch`        |      4 |      4 |
| `for-each-ref` | 12,761 | 12,761 |
| `hash-object`  |    428 |    428 |
| `init`         |      6 |      6 |
| `maintenance`  |      1 |      1 |
| `merge-base`   |    332 |    332 |
| `mktree`       |    476 |    476 |
| `push`         |    281 |    281 |
| `remote`       |  1,683 |  1,683 |
| `rev-list`     |    107 |    107 |
| `update-ref`   |  1,570 |  1,570 |

### `follow-copy-handoff`

| Subcommand     | Before | After |
| -------------- | -----: | ----: |
| `?`            |    897 |   897 |
| `cat-file`     |  2,946 |   761 |
| `clone`        |      2 |     2 |
| `commit`       |      1 |     1 |
| `commit-tree`  |    365 |   365 |
| `config`       |  5,061 | 1,817 |
| `diff-tree`    |    481 |   481 |
| `fetch`        |    183 |   183 |
| `for-each-ref` |  7,669 | 7,669 |
| `hash-object`  |    794 |   794 |
| `init`         |     75 |    75 |
| `ls-remote`    |    727 |   316 |
| `ls-tree`      |     24 |    24 |
| `merge-base`   |    611 |   611 |
| `mktree`       |    365 |   365 |
| `push`         |    297 |   297 |
| `remote`       |  1,751 |   987 |
| `rev-list`     |      4 |     4 |
| `rev-parse`    |    122 |   122 |
| `update-ref`   |  2,230 | 2,230 |

### `follow-restart`

| Subcommand     | Before | After |
| -------------- | -----: | ----: |
| `?`            |  1,098 | 1,098 |
| `cat-file`     |  2,907 |   874 |
| `clone`        |      4 |     4 |
| `commit`       |      2 |     2 |
| `commit-tree`  |    243 |   243 |
| `config`       |  5,272 | 2,227 |
| `diff-tree`    |    484 |   484 |
| `fetch`        |    208 |   208 |
| `for-each-ref` |  7,978 | 7,978 |
| `grep`         |      7 |     7 |
| `hash-object`  |    651 |   651 |
| `init`         |     71 |    71 |
| `ls-remote`    |    683 |   335 |
| `merge-base`   |    629 |   629 |
| `mktree`       |    254 |   254 |
| `push`         |    206 |   206 |
| `remote`       |  1,681 | 1,001 |
| `rev-list`     |     10 |    10 |
| `rev-parse`    |     80 |    80 |
| `show`         |      6 |     6 |
| `update-ref`   |  2,112 | 2,112 |
| `var`          |     56 |    56 |

### `import-errands`

| Subcommand     | Before | After |
| -------------- | -----: | ----: |
| `?`            |    451 |   451 |
| `add`          |      1 |     1 |
| `branch`       |     67 |    67 |
| `cat-file`     |  2,172 | 1,106 |
| `commit`       |      1 |     1 |
| `commit-tree`  |    278 |   278 |
| `config`       |  3,160 | 2,209 |
| `diff-tree`    |    514 |   514 |
| `fetch`        |      8 |     8 |
| `for-each-ref` |  4,444 | 4,444 |
| `hash-object`  |  1,373 | 1,373 |
| `init`         |     34 |    34 |
| `log`          |     93 |    93 |
| `ls-remote`    |    173 |   173 |
| `ls-tree`      |  2,010 | 2,010 |
| `merge-base`   |      2 |     2 |
| `mktree`       |    464 |   464 |
| `notes`        |     32 |    32 |
| `push`         |    137 |   137 |
| `remote`       |    696 |   649 |
| `rev-list`     |     75 |    75 |
| `rev-parse`    |  1,842 | 1,842 |
| `show`         |    885 |   885 |
| `show-ref`     |    629 |   629 |
| `update-ref`   |    587 |   587 |
| `var`          |     60 |    60 |
| `worktree`     |  1,337 | 1,337 |

### `import-observation-failures`

| Subcommand     | Before |  After |
| -------------- | -----: | -----: |
| `?`            |    366 |    366 |
| `add`          |     71 |     71 |
| `branch`       |      2 |      2 |
| `cat-file`     |    744 |    204 |
| `checkout`     |      4 |      4 |
| `cherry`       |     36 |     36 |
| `commit`       |     71 |     71 |
| `commit-tree`  |    210 |    210 |
| `config`       |  2,636 |  2,468 |
| `diff-tree`    |    342 |    342 |
| `for-each-ref` |  4,944 |  4,944 |
| `hash-object`  |  1,224 |  1,224 |
| `init`         |     28 |     28 |
| `log`          |    726 |    726 |
| `ls-tree`      | 11,940 | 11,940 |
| `merge`        |     13 |     13 |
| `merge-base`   |    696 |    696 |
| `mktree`       |    420 |    420 |
| `notes`        |     12 |     12 |
| `patch-id`     |     84 |     84 |
| `push`         |     24 |     24 |
| `remote`       |    146 |    146 |
| `rev-list`     |    204 |    204 |
| `rev-parse`    |  2,419 |  2,419 |
| `rm`           |     12 |     12 |
| `show`         |  9,156 |  9,156 |
| `show-ref`     |  1,800 |  1,800 |
| `switch`       |     72 |     72 |
| `update-ref`   |    210 |    210 |
| `var`          |     48 |     48 |
| `worktree`     |  3,756 |  3,756 |

### `remote-delete`

| Subcommand     | Before | After |
| -------------- | -----: | ----: |
| `?`            |    941 |   941 |
| `cat-file`     |  2,827 |   669 |
| `clone`        |     15 |    15 |
| `commit`       |      7 |     7 |
| `commit-tree`  |    247 |   247 |
| `config`       |  4,566 | 1,830 |
| `daemon`       |      1 |     1 |
| `diff-tree`    |    633 |   633 |
| `fetch`        |    160 |   160 |
| `for-each-ref` |  6,404 | 6,404 |
| `grep`         |      7 |     7 |
| `hash-object`  |    492 |   492 |
| `init`         |     67 |    67 |
| `log`          |     20 |    20 |
| `ls-remote`    |    468 |   219 |
| `ls-tree`      |      1 |     1 |
| `merge-base`   |    586 |   586 |
| `mktree`       |    213 |   213 |
| `push`         |    224 |   224 |
| `remote`       |  1,422 |   865 |
| `rev-list`     |     38 |    38 |
| `rev-parse`    |    111 |   111 |
| `show`         |      1 |     1 |
| `update-ref`   |  1,551 | 1,551 |
| `var`          |     44 |    44 |

### `separate-conformance-reads`

| Subcommand     | Before | After |
| -------------- | -----: | ----: |
| `?`            |  3,677 | 3,677 |
| `cat-file`     |  3,501 | 2,035 |
| `clone`        |      1 |     1 |
| `commit`       |      1 |     1 |
| `config`       |    319 |   194 |
| `diff-tree`    |  1,712 | 1,712 |
| `for-each-ref` |  4,997 | 4,997 |
| `hash-object`  |    886 |   886 |
| `init`         |      4 |     4 |
| `log`          |      4 |     4 |
| `ls-tree`      |    243 |   243 |
| `merge-base`   |      4 |     4 |
| `mktree`       |  1,564 | 1,564 |
| `push`         |     10 |    10 |
| `remote`       |     63 |    63 |
| `rev-list`     |    207 |   207 |
| `rev-parse`    |    244 |   244 |
| `show`         |     77 |    77 |
| `var`          |  1,768 | 1,768 |

### `withdraw-entry-inverse`

| Subcommand      | Before |  After |
| --------------- | -----: | -----: |
| `?`             |  2,859 |  2,859 |
| `cat-file`      |  9,364 |  2,388 |
| `clone`         |    184 |    184 |
| `commit`        |     92 |     92 |
| `commit-tree`   |    814 |    814 |
| `config`        |  8,626 |  6,114 |
| `count-objects` |     68 |     68 |
| `diff-tree`     |  4,590 |  4,590 |
| `for-each-ref`  | 10,865 | 10,865 |
| `hash-object`   |    950 |    950 |
| `init`          |    276 |    276 |
| `log`           |  1,352 |  1,352 |
| `merge-base`    |  1,788 |  1,788 |
| `mktree`        |  1,628 |  1,628 |
| `push`          |    366 |    366 |
| `remote`        |  1,828 |  1,828 |
| `rev-list`      |     80 |     80 |
| `rev-parse`     |    138 |    138 |
| `update-ref`    |  1,427 |  1,427 |
| `var`           |    554 |    554 |
