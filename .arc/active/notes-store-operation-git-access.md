# Notes: store-operation-git-access

## Making maintenance due in a case

The test helpers set `gc.auto 0` in the code repositories and clones they create (`temp-repo.ts`, `multi-clone.ts`,
`commit-message-fixture.ts`). A separate store, created by `git init --bare` under an empty system and global
configuration, keeps Git's default thresholds, which no store suite is shown to reach. A case that needs a fetch to
trigger maintenance makes it due in the repository the fetch writes, the store in the separate layout, as
`verify-integrity.test.ts` does.

## Reading the after-measurement

- The largest `cat-file` callers before this work were `namespace-health.ts` (4,957), `sync-merge.ts` (3,468),
  `lineage-resolution.ts` (3,211), and `push-families.ts` (2,414). The attribution stops at the first store frame, so
  it does not split them by entry call.
- Stack attribution counted 4.5–5.4k identical configuration reads within one call, but it loses callers across
  unawaited promises. The first prototype removed about 13,000 `config` and `remote` starts within calls in four files.
- `diff-tree --stdin` output is not length-framed, so tree enumeration cannot join the shared reader as it is. That
  bears on whether walking trees through the reader earns its own work after the measurement.
