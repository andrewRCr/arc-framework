# Notes: store-operation-git-access

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

Primary sources: Git 2.56's `builtin/gc.c` selects the default strategy; its maintenance configuration documents the
geometric task's due setting and split factor, and `repack-geometry.c` weights packs by object count.

- <https://raw.githubusercontent.com/git/git/v2.56.0/builtin/gc.c>
- <https://raw.githubusercontent.com/git/git/v2.56.0/Documentation/config/maintenance.adoc>
- <https://raw.githubusercontent.com/git/git/v2.56.0/repack-geometry.c>

## Reading the after-measurement

- The largest `cat-file` callers before this work were `namespace-health.ts` (4,957), `sync-merge.ts` (3,468),
  `lineage-resolution.ts` (3,211), and `push-families.ts` (2,414). The attribution stops at the first store frame, so
  it does not split them by entry call.
- Stack attribution counted 4.5–5.4k identical configuration reads within one call, but it loses callers across
  unawaited promises. The first prototype removed about 13,000 `config` and `remote` starts within calls in four files.
- `diff-tree --stdin` output is not length-framed, so tree enumeration cannot join the shared reader as it is. That
  bears on whether walking trees through the reader earns its own work after the measurement.

## Baseline measurement

Measured merge base `023a0636eddfc6f1862dcd0e801c4e8ab44ba246` in an independent checkout, before any base merge.
Each file ran alone with the spawn-timing preload and again with the attribution preload, under
`nicecap -n 19 -r 8`. All twenty runs completed successfully. Case time sums completed test-case durations;
process counts select the attribution worker PID by the original analysis method.

| File                          | Processes | Case seconds |
| ----------------------------- | --------: | -----------: |
| `cleanup-report`              |    18,320 |         89.3 |
| `conformance-reads`           |    18,690 |        118.3 |
| `conformance-sync`            |    29,037 |        115.7 |
| `follow-copy-handoff`         |    24,605 |        108.8 |
| `follow-restart`              |    24,642 |        111.8 |
| `import-errands`              |    21,525 |        112.0 |
| `import-observation-failures` |    42,416 |        198.1 |
| `remote-delete`               |    21,046 |        101.9 |
| `separate-conformance-reads`  |    19,282 |        116.6 |
| `withdraw-entry-inverse`      |    47,849 |        196.6 |

Machine-local reports, spawn logs, and the measurement script are retained under
`arc-framework/.arc/user/andrew/store-operation-git-access-benchmark/` in the primary checkout.

## A1: Imported-claims publisher authority

Superseded inventory claim (§ 7.4): "Every other re-read of designation that looks for another process's change already
runs under the layout lock."

`retireImportRemote` reads designation before its source-retirement callback. `retireOriginRefs` then calls
`unpublishedImportClaims`, whose own publisher read has no new lock or other scope refresh between it and the earlier
answer. The independent configuration write in `store-ref-import-read-only.test.ts` therefore changed the observed
refusal while retaining the source safely. Its unchanged publisher-disappearance case reproduces the gap.

`RefOperationScope.refreshConfiguration` will expose the existing generation increment and answer-map clear, without
closing readers. `unpublishedImportClaims` will call it only after finding required claims, immediately before reading
publisher designation. This retains the execution and lock behavior and refreshes subsequent command lookups too.
The amendment is determinate and bounded to that authority check; the remaining operation lifetime rules stand.
