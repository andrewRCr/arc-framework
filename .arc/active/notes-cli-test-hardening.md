# Notes: CLI Test Hardening

Reference material for task generation and execution — flake forensics, measurement detail, sweep starting
points, and recorded rejections backing `spec-cli-test-hardening.md`.

## Flake forensics

- **(b) teardown `ENOTEMPTY` race** — incident anchors: PR #202 run `28808727826` (`plan.e2e.test.ts`,
  `rmdir '.git/info'`); PR #206 run `28838080399` (`session-init.e2e.test.ts` — different file, confirming
  shared-teardown behavior); integration recurrence 2026-07-13 as `ENOTEMPTY: .git/objects/pack` (post-dates the
  `9fac314ff` gc-disable fix).
- **(c) shallow-clone timeout** — observed ~5478ms against the 5000ms default budget (PR #70). The test has been
  renamed since; the current anchor is `load restores recent note content in a shallow clone when the annotated
  commit is beyond boundary` in `user.test.ts` (integration tier — no `testTimeout` override, so the 5s default
  applies; e2e already runs at 30s).
- **(d) save/sync races** — the 12-failure reproduction spanned `integration/{user,multi-clone,status}.test.ts`
  and `e2e/{user,session-init,sync-purity}.e2e.test.ts`, with `Save failed` / `Worktree push skipped` /
  `Notes push skipped` stderr signatures. Evidence caveat and re-reproduction requirement are recorded in the
  spec (Decision 5); `npm test` has been one combined `vitest run` since `8b82d0d9d` (2026-06-17).

## Compaction fixture de-cost (Decision 2) — pre-implementation finding (2026-07-15)

The cost in `user-notes-compaction.test.ts` is concentrated in **one** test — "retains old shipped-WU notes until
the archive age and local-subdir gates clear" — at ~6.4s of the file's ~13s isolated. It builds 302 empty dated
commits + 302 notes in a loop (~900 git subprocess spawns) as filler above the retention window. The file's other
17 tests are <0.7s each.

- **Synthetic notes-tree construction (`makeNotesTreeCommit`) does not fit here.** Retention ranks notes by their
  annotated commit's real committer date: `runUserCompact` → `buildRetentionEntry` → `readCommitTimestamp`
  (`src/commands/user/compact.ts`), where the newest `CROSS_WU_NOTE_WINDOW` (10) by date are retained. Fabricated
  target SHAs fail the timestamp read and collapse the newest-window selection, breaking the
  `retainedCount 12 / prunedCount 292` partition. The real dated commits are load-bearing — Decision 2's
  "where that preserves the retention assertion" clause fails for this case.
- **Chosen path: reduce the filler count, not the fixture shape.** Shrink 302 → ~35, kept above both boundaries the
  test exercises — the retention window `CROSS_WU_NOTE_WINDOW` (10) and the read-concurrency batch
  `RETENTION_ENTRY_READ_CONCURRENCY` (16), so more than one batch still runs. `retainedCount` stays 12 (10-window +
  2 gated specials); `prunedCount` becomes filler − 10 (25 at 35 filler). Add a partition-dump diagnostic on a
  count mismatch. Preserves the retention _behavior_ (the substrate-independent part per the git-notes-as-interim-
  bridge posture, `strategy-storage-evolution`) at ~88% less loop cost. No known high-count regression justifies
  keeping 302.
- **fast-import batching rejected.** It would preserve the exact 302/292 assertion in one pass, but building
  intricate notes-shaped test scaffolding for a substrate ~1 month from phase-out is bridge over-investment — the
  same ROI logic as the notes production stop-loss (Decision 10), applied to test scaffolding.

## Teardown-sweep starting points (Decision 3)

- Grep seed: `rm\(.*recursive` across `packages/arc-framework/__tests__/` hits ~68 files (2026-07-15 count) —
  the enumeration surface for the implementation-time sweep beyond the five helper-level sites.
- Known out-of-factory git-backed teardowns: `session-init.e2e.test.ts` creates bare origin repos inline
  (`git init --bare` into `mkdtemp` dirs) and removes them with bare `rm`; `integration/status.test.ts` carries
  ~10 inline fixture removals including a remote dir; `integration/user.test.ts` carries several inline removals.
  Inline-created bare/origin repos never received the gc-disable config — candidate mechanism for the 2026-07-13
  recurrence.
- The five helper-level sites: factory cleanups in `__tests__/helpers/integration.ts` and `__tests__/e2e/helpers.ts`
  (both carry `gc.auto 0`), plus inline teardowns in `__tests__/helpers/multi-clone.ts`,
  `__tests__/helpers/in-flight-reshuffle.ts`, `__tests__/helpers/commit-message-fixture.ts`.

## Measurement detail (2026-07-15 baseline)

- Unit tier: ~80s aggregate module-import cost observed across 343 files under the default `isolate: true` forks
  pool — the overhead behind the ~45s-test-time / ~87s-CI-wall gap. Re-measure via `vitest run --reporter=json`
  before tuning if the suite has shifted.
- Synthetic notes-tree fixture helper for the flake (a) rework: `makeNotesTreeCommit` in
  `__tests__/helpers/integration.ts`.

## Coverage — candidates verified already-covered (dropped, 2026-07-15)

- Deeply nested conditionals (3+ levels): covered in `render.test.ts`.
- Simultaneous multi-developer sync: covered across `multi-clone.test.ts`, `sync-state-producer.e2e.test.ts`,
  `state-ref-race.e2e.test.ts`.

## Cluster-level alternatives (rejected)

- **Split performance into its own WU** — rejected: the highest-leverage performance intervention is the same
  fixture work as the de-flake items (one design surface); the remainder (pool tuning, sharding position) is
  below WU-warrant on its own.
- **Handle each flake as an errand** — rejected at cluster formation: ~12 atomics with shared fixture/teardown
  design; bundling preserves the shared-fixture design and one review context.
