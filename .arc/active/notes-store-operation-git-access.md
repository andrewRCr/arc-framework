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

## Reading the after-measurement

- The largest `cat-file` callers before this work were `namespace-health.ts` (4,957), `sync-merge.ts` (3,468),
  `lineage-resolution.ts` (3,211), and `push-families.ts` (2,414). The attribution stops at the first store frame, so
  it does not split them by entry call.
- Stack attribution counted 4.5–5.4k identical configuration reads within one call, but it loses callers across
  unawaited promises. The first prototype removed about 13,000 `config` and `remote` starts within calls in four files.
- `diff-tree --stdin` output is not length-framed, so tree enumeration cannot join the shared reader as it is. That
  bears on whether walking trees through the reader earns its own work after the measurement.
