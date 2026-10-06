# Notes: test-suite-reliability

## Hosted CI before this work

An informal profile from the five most recent full-lane pull-request runs on the current layout (`37491029911`,
`37487788677`, `37473165224`, `37465313819`, `37417731917`, all 2026-10-06). It orients the work; the spec's recorded
baseline is what the criteria score against.

| Job group                        | Runner time per run | Notes                                                      |
| -------------------------------- | ------------------- | ---------------------------------------------------------- |
| Unit (one job)                   | ~330 s (255–406)    | Native-tooling files are 93% of its summed file time       |
| Integration (two shards)         | ~475 s              | Shards run ~180–330 s each                                 |
| E2E (four anchored shards)       | ~1,250 s            | Shard 2 runs ~480 s (anchor ~270 s, remainder ~200 s)      |
| Lint, setup, portability, others | ~330 s              | Lint & Typecheck ~130–170 s; Linux portability ~90–150 s   |
| **Total**                        | **~2,400 s**        | Test jobs alone ~2,060 s                                   |

- **Full lane:** about 560–575 s from first job to last on the cleaner runs. E2E shard 2 is the long pole, which
  includes the anchored heavy file. Per-job fixed overhead (checkout, Node setup, cache) is about 10–15 s.
- **Light lane** (pushes to `main` and light pull requests: classify, setup, unit, lint): about 384 s, with the unit
  job as the long pole. Of the five pushes to `main` on 2026-10-06 from #825 to #829, four failed their unit job
  (`37419184257`, `37467686598`, `37478013154`, `37489414096`); `37492536892` passed.
- **Rough projection by job group, made while finalizing the spec:** unit to ~100–140 s; integration up ~90–125 s
  from the relocated real runs; E2E down ~300–450 s; total runner time down ~16–25% (test jobs ~20–29%); full-lane
  duration down ~35–45%, with integration likely the new long pole; light-lane duration down ~45%, with lint and
  typecheck the new long pole. The E2E figure rests on the staleness-check probes below and is the least certain.

## Measurement and probe record

- **Staleness-check cost:** two local best-of-six probes of a real `check commit-msg` spawn on 2026-10-06 measured
  0.80 s with the check against 0.42 s without, and 0.53 s against 0.28 s. The 1,815-spawn E2E count dates from
  2026-09-11 (`analysis-test-suite-cost-baseline.md`). Re-measure both on hosted runners before leaning on them.
- **Hosted unit maxima recorded while drafting, before the explicit timeouts landed:** `in-repo-boundary.test.ts`
  5.04 s, `ci-build-transfer.test.ts:65` 5.01 s, `ship-guard` 4.88 s, `meta-reader-inventory` 4.59 s.
- **Native-tooling projection:** the 55–60% cut comes from a per-file read of the 29 slowest native-tooling files
  during the hosted-test-reliability Errand's audit, not from a prototype.
- **Vitest 4.1.8 probes during spec review:**
    - Per-test metadata written from a shared setup file reaches `TestCase.meta()` in the `runTestSpecifications`
      result, with each test's skip state, while a command-line reporter list is in force, under `isolate: false`
      and across files in one worker. A name filter leaves non-matching tests `skipped` with empty metadata.
      Module metadata set from a setup file's `afterAll` did not reach a reporter.
    - `task.meta` set in a setup file's `beforeEach` reaches the `json` report in both isolation modes, for default,
      positional, and options-object timeouts.
    - A command-line `reporter` list replaces configured reporters (`resolveConfig`); Vitest adds `default` and, on
      GitHub Actions, `github-actions` only when the list is empty.
    - A per-project `configureVitest` plugin hook runs after config resolution and before reporters are created, so
      it can append a reporter without displacing the others. The hook must sit in each inline project's `plugins`;
      one on the root config did not fire for inline projects. The controller-held floor check was chosen instead.
    - The spawn guard blocked direct, named-import, and `execa` launches, including in a later file in the same
      worker, while an allowlisted file still spawned.

## Already landed

- **#828 (`de2536e01`):** explicit timeouts on four unit tests in three files (`ci-build-transfer.test.ts` 30 s;
  `lib/store/in-repo-boundary.test.ts`, two tests; `active/meta-reader-inventory.test.ts`,
  `REPOSITORY_SCAN_TIMEOUT`).
- **#829 (`2e6c5ad61`):** `arc-lane-attestation.yml` checks the inert pull-request data out at
  `.cache/arc-lane-change-data`, outside the build inventory. It was drafted into this work as a scope expansion and
  landed as its own Errand instead.
- Both merged to `main` after this planning branch was cut; the spec's counts and loci were taken on `main`.

## Boundaries owned elsewhere

- `lib/store/in-repo-boundary.test.ts` enforces `storage-contract`'s `lib/store/` boundary, so only its mechanism
  may change.
- The decomposition machinery (`decompose-v3-*`) is rewritten by `storage-seam`'s decomposition member and the
  storage cutover, which is why its tests and typed refusal reasons stay out of this work.
- The storage cutover removes `arc-lane-attestation.yml` (`cohort-state-storage.md`'s storage-coupling register).
- The selection rule for Markdown-pinning tests and the prose-pin rewrap sweep remain separate `USER-INBOX`
  captures.

## Decisions taken while drafting

- **Scope expansions accepted by the Owner:** the Vitest results cache as a second duration source, budget-overage
  visibility, and the unit-tier spawn guard. The `USER-INBOX` captures behind the first two were retired into the
  draft; the spec now carries all three.
- **Prompter:** the case for it is that declared and executed `--no-input` behavior are two hand-maintained copies.
  The 33 handler fallbacks that hard-code `noInput: false` turned out to be unreachable from the CLI, so making the
  context required narrows to the handlers that prompt. The prompter phase stays in this work by Owner direction.
- **Class `Heavy`, on both triggers.** Scale: about 60 test files across three tiers, the CI workflow, and 12
  prompt-bearing modules. Derivation: the prompter's design. Both compose existing declarations, seams, and helpers
  with established practice, so derivation does not reach `Novel`.
