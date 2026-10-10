# Notes: Quality Gates and Hook Integration

## Per-increment check time (SC17)

SC17's before-and-after measurements are recorded here, each with its method.

**Earlier measurement (2026-07-25).** The QUICK-REFERENCE measured-cost table, recorded in `046272788`, gives warm-cache
wall time per check over the full project and targeted:

| Check                   | Full project | Targeted                                    |
| ----------------------- | ------------ | ------------------------------------------- |
| `lint:md`               | 6.9s         | 0.25s — `lint:md:file`, per file            |
| `lint:ts`               | 21.4s        | 2.1s one file · 9.1s one directory          |
| `lint:sh`               | 1.0s         | not narrowable (fixed hook/script set)      |
| `lint:arc:triggers`     | 0.27s        | corpus-wide by design; already cheap        |
| `lint:arc:domain-rules` | 0.23s        | corpus-wide by design; already cheap        |
| `lint:arc:section-refs` | 0.22s        | corpus-wide by design; already cheap        |
| `typecheck`             | 4.2s         | not narrowable (whole-program)              |
| `typecheck:test`        | 7.3s         | not narrowable (whole-program)              |
| `test:unit`             | 24.2s        | 1.1s — filename filter                      |
| `test:arc-contracts`    | 0.9s         | subset of `test`; a Tier 1 targeting handle |
| `test` (7,524)          | 67.0s        | narrow via `test:unit` or a per-tier script |
| `build`                 | 5.7s         | not narrowable                              |

The Tier 1 block then documented was per-file Markdown lint, `lint:ts`, `lint:sh`, and `test:unit`. The last three are
full-project scans, about 47s per task. Of 200 sampled commits, 64 were Markdown-only. Targeting the same coverage
brought a Markdown-only task to about 1s: per-file Markdown lint plus the ARC contract checks (about 0.7s combined).

SC17 takes its own baseline when implementation starts, so this measurement is context, not that baseline.

### Fixed replay sample and method

**Sample selection tip:** `159fdcdeba90a21c9d1bb11cb631d5a46111a6be` (`main`). Read
`git log main --no-merges` in its default date order, excluding commits with deletions or renames and, by direction
at implementation entry, excluding any commit whose original path set is no longer present at that selection tip. Keep each
selected commit's complete path set. The first 20 eligible commits contain one Markdown-only increment and 19 mixed
or other increments. This is the eligible sample's distribution, not an estimate of all repository work: excluding
retired active artifacts removes many recent Markdown-only increments.

**Measured baseline tip:** `5cc732f64f40977e5ceafd5c6065c66ff50ac3fb` (`main`). The initial attempt stopped at
sample 4 when discovery-test cleanup replaced `process.env` and a later Git environment stub survived Vitest cleanup.
PR #843 repaired that leak in an isolated change. All 20 complete original path sets remain present at the repaired tip;
the measurement restarted from sample 1 there, preserving the sample and method. The first attempt's three completed
timings are excluded from the final baseline. Its diagnostic logs remain separate from the restarted run.

Replay each sample in a disposable local clone at the measured tip, on `measurement/quality-gate-baseline`; `main`
remains at the measured tip. Install with `npm ci`, build the CLI, then run `npm rebuild @arc-framework/cli` to expose
its local executable when installation preceded generation. Set the clone's identity to `andrew` and retain the ordinary
husky hooks. The clone is `/tmp/arc-quality-baseline`, outside ARC's registered checkout roster.

For each original path, retain the tip's bytes and append one neutral line: `<!-- Measurement replay. -->` in Markdown,
`// Measurement replay.` in TypeScript and JavaScript, `# Measurement replay.` in shell or YAML, and a blank line in
JSON or plain-text fixtures. Originally added files already exist at the measured tip; unlink and recreate them at the
same name with those bytes and the appended line. The resulting Git edit is a modification, preserving the complete
original path set used by selection. Record the sampled commit's original status separately below.

Stage the complete path set. Prepare `build:fast` outside timing after source edits so the self-hosting CLI is current;
record this preparation separately from per-increment cost. Perform one untimed warm-up of the selected commands and
ordinary commit hook chain. Reset only the disposable scratch branch to the measured tip, reapply the same edit, and
time every selected command and `git commit` with Python's monotonic `time.perf_counter`, sequentially. Retain tool
caches between these runs; reset the scratch branch between samples. A nonzero exit stops measurement and preserves
its full log; it is never counted as a successful increment.

The before commands come from QUICK-REFERENCE's Tier 1 block and DEV-RULES.PROJECT's selection rules: per-path Markdown
lint; the three corpus ARC audits for `.arc/**` edits; focused TypeScript lint, affected unit tests, and both type
checks for TypeScript; contract tests for framework surfaces; shell lint for scripts or hooks. An unrecognized non-
Markdown path takes the full code checks, including the routine test lane. Record each actual command alongside its
elapsed wall time. Task 7.9 keeps this exact sample and edit rule, replacing only the measured boundary requests and
clearing the reuse record before each timed request. Preparation and warm-up are excluded from both measured totals.

**Sample ids and original changed paths:**

- **1.** `96f62af1ed5d1545d24007fadac1d2352d456b8d`
    - `M` `packages/arc-framework/__tests__/unit/kernel/schema-fold.test.ts`
    - `M` `packages/arc-framework/src/lib/kernel/schema/generate.ts`

- **2.** `61b205292fee3aaa016312915b53bb97e9b25c9b`
    - `M` `.arc/system/methods/review-response.md`
    - `M` `packages/arc-framework/__tests__/unit/scripts/review-gate/runtime/respond-remedy.test.ts`
    - `M` `packages/arc-framework/arc/system/methods/review-response.md`
    - `M` `packages/arc-framework/src/scripts/review-gate/runtime/respond-remedy.ts`

- **3.** `9052197fb746c1d491e7d40226a00f0de7271790`
    - `M` `.arc/system/methods/adversarial-review.md`
    - `M` `.arc/system/methods/source-grounding.md`
    - `M` `packages/arc-framework/arc/system/methods/adversarial-review.md`
    - `M` `packages/arc-framework/arc/system/methods/source-grounding.md`

- **4.** `2e633348ecab60bb95cb276fc4a26560870cc893`
    - `M` `.arc/system/.internal/harness-hooks/common/codex-recovery-marker.mjs`
    - `M` `.arc/system/.internal/harness-hooks/common/post-tool-use-recover.mjs`
    - `M` `.arc/system/.internal/harness-hooks/common/pre-compact-seed.mjs`
    - `M` `.arc/system/.internal/harness-hooks/common/session-start-compact.mjs`
    - `M` `.arc/system/.internal/harness-hooks/common/user-prompt-recover.mjs`
    - `M` `.arc/system/workflows/arc/session-lifecycle/session-recover.md`
    - `M` `packages/arc-framework/__tests__/integration/harness-hooks/claude-code.test.ts`
    - `M` `packages/arc-framework/__tests__/integration/harness-hooks/codex-cli.test.ts`
    - `M` `packages/arc-framework/arc/system/.internal/harness-hooks/common/codex-recovery-marker.mjs`
    - `M` `packages/arc-framework/arc/system/.internal/harness-hooks/common/post-tool-use-recover.mjs`
    - `M` `packages/arc-framework/arc/system/.internal/harness-hooks/common/pre-compact-seed.mjs`
    - `M` `packages/arc-framework/arc/system/.internal/harness-hooks/common/session-start-compact.mjs`
    - `M` `packages/arc-framework/arc/system/.internal/harness-hooks/common/user-prompt-recover.mjs`
    - `M` `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-recover.md`

- **5.** `306efcb3d4742ed43e1ecec3d927e977f4d7af8b`
    - `M` `.arc/system/workflows/arc/supplemental/run-errand.md`
    - `A` `packages/arc-framework/__tests__/integration/review-status-errand-correction.test.ts`
    - `M` `packages/arc-framework/__tests__/unit/scripts/review-gate/runtime/review-policy-remedy.test.ts`
    - `M` `packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md`
    - `M` `packages/arc-framework/src/handlers/review.ts`
    - `M` `packages/arc-framework/src/scripts/review-gate/hosted/correction-review-capability.ts`
    - `M` `packages/arc-framework/src/scripts/review-gate/runtime/review-policy-remedy.ts`
    - `M` `packages/arc-framework/src/scripts/review-gate/status-errand.ts`
    - `M` `packages/arc-framework/src/scripts/review-gate/status.ts`

- **6.** `5d234308f42dd1fd9de231478626acb9a2b20f43`
    - `M` `packages/arc-framework/__tests__/unit/scripts/review-gate/lane-progress-hosted-terminal-failure.test.ts`
    - `M` `packages/arc-framework/src/scripts/review-gate/lane-progress-hosted-request.ts`

- **7.** `d3f537377a3647a21e01638473cca5f557a28e45`
    - `A` `packages/arc-framework/__tests__/unit/scripts/review-gate/lane-progress-hosted-terminal-failure.test.ts`
    - `M` `packages/arc-framework/src/scripts/review-gate/lane-progress-hosted-request.ts`

- **8.** `467e174555e74ab65824a8ead9128bf168f1861c`
    - `M` `packages/arc-framework/__tests__/unit/scripts/review-gate/hosted/coderabbit-body.test.ts`
    - `M` `packages/arc-framework/src/scripts/review-gate/hosted/coderabbit-body.ts`

- **9.** `60420f21b71df22752d6d338b8638453e37dd75a`
    - `M` `packages/arc-framework/__tests__/unit/scripts/review-gate/hosted/coderabbit-body.test.ts`
    - `M` `packages/arc-framework/src/scripts/review-gate/hosted/coderabbit-body.ts`

- **10.** `4c26585f26f6328b39605f64e46db85f54fdd1b6`
    - `A` `packages/arc-framework/__tests__/fixtures/coderabbit-hosted/bold-badge-review-body.txt`
    - `M` `packages/arc-framework/__tests__/unit/scripts/review-gate/hosted/coderabbit-body.test.ts`
    - `M` `packages/arc-framework/src/scripts/review-gate/hosted/coderabbit-body.ts`

- **11.** `5041ef56249addbaf6896112598b204aa0f9e039`
    - `M` `.arc/system/methods/review-chunking.md`
    - `M` `.arc/system/methods/standard-review.md`
    - `M` `packages/arc-framework/__tests__/unit/scripts/review-gate/core/local-prepare.test.ts`
    - `M` `packages/arc-framework/arc/system/methods/review-chunking.md`
    - `M` `packages/arc-framework/arc/system/methods/standard-review.md`
    - `M` `packages/arc-framework/src/scripts/review-gate/core/local-prepare.ts`

- **12.** `9b5994e3f851bd5e3ca10accba5793f9381d7408`
    - `M` `.arc/system/.internal/candidates/test-suite-reliability.json`

- **13.** `c82d581c45e8a5c01591676e428569076bf9adb7`
    - `M` `packages/arc-framework/__tests__/integration/eslint-architecture-rows.test.ts`
    - `M` `packages/arc-framework/eslint/architecture-imports.ts`

- **14.** `60c848053d69addf7d368f192a53c10b6df0d70c`
    - `M` `.arc/system/.internal/candidates/test-suite-reliability.json`

- **15.** `e7d61ccf8bfc8bb8c099dd4b430bae7dc33aa88a`
    - `M` `packages/arc-framework/__tests__/integration/eslint-architecture-rows.test.ts`
    - `M` `packages/arc-framework/eslint/architecture-imports.ts`

- **16.** `63d82b326b99a387b9222fb5d7d07803f93301ed`
    - `M` `packages/arc-framework/__tests__/unit/command-input/prompt-scanner.test.ts`
    - `M` `packages/arc-framework/src/lib/syntax-bindings.ts`

- **17.** `77ce8fb35c680c2627f6c77e271ae7f8c08ef613`
    - `M` `.arc/system/.internal/candidates/test-suite-reliability.json`

- **18.** `5257b49805e08d02a3677e0767799afccab1e39b`
    - `M` `packages/arc-framework/__tests__/integration/eslint-architecture-rows.test.ts`
    - `M` `packages/arc-framework/eslint/architecture-imports.ts`

- **19.** `db112d2e3e2ca364bccd839efb21ec2f0755eecb`
    - `M` `packages/arc-framework/__tests__/unit/command-input/prompt-scanner.test.ts`
    - `M` `packages/arc-framework/src/lib/syntax-bindings.ts`

- **20.** `5e90e48146c822a1484ec4e5301bdbef984270f7`
    - `M` `packages/arc-framework/__tests__/integration/eslint-architecture-rows.test.ts`
    - `M` `packages/arc-framework/__tests__/unit/command-input/prompt-scanner.test.ts`
    - `M` `packages/arc-framework/src/lib/syntax-bindings.ts`

### Measured before result

All 20 timed samples passed at `5cc732f64f40977e5ceafd5c6065c66ff50ac3fb`. Total measured boundary time: **2650.467s**
(**44m 10.467s**); mean **132.523s**, median **54.518s** per increment.
Times below are seconds rounded to three decimals; the total is summed from the unrounded observations.

The machine also ran developer checks in another checkout during this measurement. CPU load and test admission were
not held constant, so these are observed wall times under that load, rather than an idle-machine estimate. The after
comparison retains the fixed replay protocol; interpret elapsed-time differences with this load caveat.

Each command reference expands to its actual timed argv below. Every step exited 0. Preparation and warm-up remain
outside these totals, and the disposable branch was reset to the measured tip when the runner finished.

| Sample | Commit         | Timed commands (seconds)                                                                                   | Total seconds |
| ------ | -------------- | ---------------------------------------------------------------------------------------------------------- | ------------- |
| 1      | `96f62af1ed5d` | C1 2.547; C2 18.549; C3 5.209; C4 22.215                                                                   | 48.520        |
| 2      | `61b205292fee` | C5 0.264; C6 0.155; C7 0.141; C8 0.183; C9 2.620; C2 17.633; C3 5.284; C10 2.844; C11 1.163; C4 23.493     | 53.780        |
| 3      | `9052197fb746` | C12 0.314; C6 0.147; C7 0.134; C8 0.189; C10 2.929; C4 14.441                                              | 18.154        |
| 4      | `2e633348ecab` | C13 0.262; C6 0.144; C7 0.131; C8 0.210; C14 0.862; C15 203.295; C3 5.272; C10 3.417; C11 1.378; C4 33.950 | 248.920       |
| 5      | `306efcb3d474` | C16 0.514; C6 0.224; C7 0.175; C8 0.233; C17 8.264; C2 25.832; C3 6.762; C10 3.195; C11 1.154; C4 27.530   | 73.883        |
| 6      | `5d234308f42d` | C18 4.523; C2 29.562; C3 7.438; C11 1.405; C4 35.064                                                       | 77.993        |
| 7      | `d3f537377a36` | C18 3.183; C2 19.341; C3 4.988; C11 1.063; C4 23.076                                                       | 51.651        |
| 8      | `467e174555e7` | C19 2.930; C2 19.296; C3 5.285; C11 1.122; C4 23.392                                                       | 52.025        |
| 9      | `60420f21b71d` | C19 3.025; C2 18.402; C3 5.240; C11 1.122; C4 22.719                                                       | 50.508        |
| 10     | `4c26585f26f6` | C19 2.947; C2 19.378; C3 5.230; C11 1.111; C4 23.210                                                       | 51.876        |
| 11     | `5041ef56249a` | C20 0.261; C6 0.157; C7 0.141; C8 0.198; C21 3.009; C2 18.917; C3 5.229; C10 2.744; C11 1.123; C4 23.476   | 55.255        |
| 12     | `9b5994e3f851` | C6 0.152; C7 0.134; C8 0.195; C22 50.441; C15 208.187; C3 5.280; C10 2.834; C4 3.875                       | 271.097       |
| 13     | `c82d581c45e8` | C22 50.538; C15 271.624; C3 7.566; C4 14.630                                                               | 344.357       |
| 14     | `60c848053d69` | C6 0.187; C7 0.159; C8 0.212; C22 47.759; C15 194.093; C3 4.967; C10 2.682; C4 3.389                       | 253.448       |
| 15     | `e7d61ccf8bfc` | C22 48.770; C15 197.072; C3 5.107; C4 9.600                                                                | 260.549       |
| 16     | `63d82b326b99` | C23 2.705; C2 17.124; C3 5.201; C4 11.521                                                                  | 36.550        |
| 17     | `77ce8fb35c68` | C6 0.171; C7 0.145; C8 0.201; C22 48.216; C15 283.922; C3 6.606; C10 3.319; C4 4.271                       | 346.850       |
| 18     | `5257b49805e0` | C22 48.813; C15 217.474; C3 5.471; C4 9.981                                                                | 281.739       |
| 19     | `db112d2e3e2c` | C23 2.808; C2 17.615; C3 5.185; C4 11.438                                                                  | 37.046        |
| 20     | `5e90e48146c8` | C24 2.697; C2 17.046; C3 5.093; C4 11.429                                                                  | 36.265        |

**Timed command definitions:**

**C1.**

```sh
npm run -s lint:ts:file -- packages/arc-framework/__tests__/unit/kernel/schema-fold.test.ts \
  packages/arc-framework/src/lib/kernel/schema/generate.ts
```

**C2.**

```sh
npm run -s test:changed
```

**C3.**

```sh
npm run -s typecheck:all
```

**C4.**

```sh
git commit -m 'chore(measurement): replay fixed check inputs' -m 'Context: standalone (maintenance)'
```

**C5.**

```sh
npm run -s lint:md:file -- .arc/system/methods/review-response.md \
  packages/arc-framework/arc/system/methods/review-response.md
```

**C6.**

```sh
npm run -s lint:arc:triggers
```

**C7.**

```sh
npm run -s lint:arc:domain-rules
```

**C8.**

```sh
npm run -s lint:arc:section-refs
```

**C9.**

```sh
npm run -s lint:ts:file -- \
  packages/arc-framework/__tests__/unit/scripts/review-gate/runtime/respond-remedy.test.ts \
  packages/arc-framework/src/scripts/review-gate/runtime/respond-remedy.ts
```

**C10.**

```sh
npm run -s test:arc-contracts
```

**C11.**

```sh
npm run -s lint:sh
```

**C12.**

```sh
npm run -s lint:md:file -- .arc/system/methods/adversarial-review.md .arc/system/methods/source-grounding.md \
  packages/arc-framework/arc/system/methods/adversarial-review.md \
  packages/arc-framework/arc/system/methods/source-grounding.md
```

**C13.**

```sh
npm run -s lint:md:file -- .arc/system/workflows/arc/session-lifecycle/session-recover.md \
  packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-recover.md
```

**C14.**

```sh
npm run -s lint:ts:file -- packages/arc-framework/__tests__/integration/harness-hooks/claude-code.test.ts \
  packages/arc-framework/__tests__/integration/harness-hooks/codex-cli.test.ts
```

**C15.**

```sh
npm test
```

**C16.**

```sh
npm run -s lint:md:file -- .arc/system/workflows/arc/supplemental/run-errand.md \
  packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md
```

**C17.**

```sh
npm run -s lint:ts:file -- packages/arc-framework/__tests__/integration/review-status-errand-correction.test.ts \
  packages/arc-framework/__tests__/unit/scripts/review-gate/runtime/review-policy-remedy.test.ts \
  packages/arc-framework/src/handlers/review.ts \
  packages/arc-framework/src/scripts/review-gate/hosted/correction-review-capability.ts \
  packages/arc-framework/src/scripts/review-gate/runtime/review-policy-remedy.ts \
  packages/arc-framework/src/scripts/review-gate/status-errand.ts \
  packages/arc-framework/src/scripts/review-gate/status.ts
```

**C18.**

```sh
npm run -s lint:ts:file -- \
  packages/arc-framework/__tests__/unit/scripts/review-gate/lane-progress-hosted-terminal-failure.test.ts \
  packages/arc-framework/src/scripts/review-gate/lane-progress-hosted-request.ts
```

**C19.**

```sh
npm run -s lint:ts:file -- \
  packages/arc-framework/__tests__/unit/scripts/review-gate/hosted/coderabbit-body.test.ts \
  packages/arc-framework/src/scripts/review-gate/hosted/coderabbit-body.ts
```

**C20.**

```sh
npm run -s lint:md:file -- .arc/system/methods/review-chunking.md .arc/system/methods/standard-review.md \
  packages/arc-framework/arc/system/methods/review-chunking.md \
  packages/arc-framework/arc/system/methods/standard-review.md
```

**C21.**

```sh
npm run -s lint:ts:file -- packages/arc-framework/__tests__/unit/scripts/review-gate/core/local-prepare.test.ts \
  packages/arc-framework/src/scripts/review-gate/core/local-prepare.ts
```

**C22.**

```sh
npm run -s lint:ts
```

**C23.**

```sh
npm run -s lint:ts:file -- packages/arc-framework/__tests__/unit/command-input/prompt-scanner.test.ts \
  packages/arc-framework/src/lib/syntax-bindings.ts
```

**C24.**

```sh
npm run -s lint:ts:file -- packages/arc-framework/__tests__/integration/eslint-architecture-rows.test.ts \
  packages/arc-framework/__tests__/unit/command-input/prompt-scanner.test.ts \
  packages/arc-framework/src/lib/syntax-bindings.ts
```

### Measured after result

**Measured tip:** `96e5992290c47dfe9af5106316915da6e91ff77d`, in disposable clone `/tmp/arc-quality-after`, on
`measurement/quality-gate-after`. All 20 complete original path sets exist at this tip. The baseline's identity,
installation, build preparation, neutral edit rule, untimed warm-up, monotonic timer, and ordinary Husky hooks are
retained. The boundary commands change to:

```bash
npx arc check increment --json
npx arc check run test:changed test:e2e:local --changed --json
git commit -m "chore(measurement): replay fixed check inputs" -m "Context: standalone (maintenance)"
```

Before each timed sample, the scratch branch is reset, its edits reapplied and staged, and `.git/arc-checks/` removed.
Every timed check request is fresh: none reports reuse. All 60 timed steps exit zero; all ordinary commit hooks reuse
selected checks without executing or skipping one. Preparation and warm-up are excluded, and the scratch branch
returns clean to the measured tip after the last sample. No failed attempt or retry contributes to the measurement.

The after total is **701.697s (11m 41.697s)**; mean **35.085s**, median
**35.885s** per increment. Against the before total **2650.467s**, the observed reduction is
**73.526%**. This includes the declaration's selection and reuse changes. The fixed sample's
one Markdown-only and 19 mixed/other increments, and the baseline's ambient-load caveat, still bound interpretation.
The runner's requests are sequential; no additional check run was started by this session during the replay.

| Sample | Before seconds | Increment seconds | Feedback seconds | Hook seconds | After seconds |
| ------ | -------------- | ----------------- | ---------------- | ------------ | ------------- |
| 1      | 48.520         | 15.815            | 18.517           | 1.325        | 35.658        |
| 2      | 53.780         | 16.167            | 18.930           | 1.685        | 36.782        |
| 3      | 18.154         | 15.260            | 0.555            | 1.696        | 17.511        |
| 4      | 248.920        | 15.954            | 0.561            | 1.620        | 18.135        |
| 5      | 73.883         | 16.641            | 18.574           | 1.798        | 37.013        |
| 6      | 77.993         | 15.812            | 19.131           | 1.264        | 36.207        |
| 7      | 51.651         | 15.692            | 19.381           | 1.259        | 36.332        |
| 8      | 52.025         | 15.910            | 18.741           | 1.273        | 35.924        |
| 9      | 50.508         | 15.750            | 18.921           | 1.258        | 35.929        |
| 10     | 51.876         | 15.852            | 18.676           | 1.297        | 35.825        |
| 11     | 55.255         | 16.221            | 18.686           | 1.645        | 36.552        |
| 12     | 271.097        | 3.951             | 0.563            | 1.160        | 5.674         |
| 13     | 344.357        | 70.338            | 0.556            | 1.441        | 72.335        |
| 14     | 253.448        | 3.861             | 0.557            | 1.151        | 5.569         |
| 15     | 260.549        | 70.328            | 0.538            | 1.431        | 72.297        |
| 16     | 36.550         | 15.690            | 17.434           | 1.265        | 34.388        |
| 17     | 346.850        | 3.863             | 0.562            | 1.164        | 5.590         |
| 18     | 281.739        | 70.886            | 0.550            | 1.439        | 72.875        |
| 19     | 37.046         | 15.876            | 18.611           | 1.358        | 35.846        |
| 20     | 36.265         | 15.675            | 18.295           | 1.283        | 35.254        |

The baseline's seven broad `npm test` requests total 1575.668s. The 20 ordinary commit hooks total 352.699s
before and 27.814s after. For the same 12 samples running related unit tests, the median changes from 18.733s to
18.681s. These observations support selection and hook reuse as the main sources of savings; they do not assign
a causal percentage to ambient load, which was not controlled.

The machine-readable observations and all warm/timed logs are retained in `/tmp/arc-quality-after-results/`; the
baseline remains in `/tmp/arc-quality-baseline-repaired-results/`. Each JSON sample names its original commit, full
path set, actual argv, elapsed time, exit status, and log. Tables round seconds to three decimals; totals use the
unrounded observations.

## Buffer triage

The 30 entries routed in before design were triaged on 2026-10-07 against `c009ab198`, each verdict spot-checked
against the tree. Route-outs went to `USER-INBOX` captures, each with `WU_Target` and `_Shapes:_`.

- **Folded into the design (6):** a CLI-resolved gate invocation (D3); local and CI gate parity (D9); the two-copy sync
  blind spot in selection (D4, D11); message-only content-gate caching (D5); the add → format → re-stage loop, with the
  auto-fix residual of Markdown-formatting enforcement (D7); ownership after repository Markdown enforcement shipped
  (D7).
- **Dismissed, resolved elsewhere (5):**
    - raw Git rename and copy statuses (`fcd311a85`; an Errand covers the missing test);
    - the worktree Markdown gate's untracked-file blindness (`df272224c`);
    - no markdownlint in the pre-commit hook (`lint:md:staged` in `.husky/pre-commit`);
    - Markdown-formatting enforcement (MD060 in `lint:md`);
    - large blobs crashing pre-commit validators (`872b1e8e0`; an Errand covers three scripts' local 32 MiB limit).
- **Storage-tied, held for the storage owners (5):** locking a completed task's identifier; dev-repo-only `npx tsx`
  hook delegations; commit-message range validation in CI; a TTY-confirm escalation for the force-push advisory; the
  unguarded flat `active/` layout.
- **Another work unit's charter (7):** the Markdown `§` citation and cross-file anchor checkers (`knowledge-lint`);
  destructive-lifecycle E2E and seam-assertion guards (a Work Unit capture); the four test-cost benchmark entries
  (Errands or a `test-suite-reliability` follow-up).
- **Errand-shaped (7):** fail closed on an unprovisioned hooks path; a false green on an excluded lint path; runtime
  examples versus meta-project references in code; integrity verification for mode-scoped installs; an exported-surface
  TSDoc lint rule; an actionlint gate; cognitive versus cyclomatic complexity. A changed-file Markdown under-wrap
  detector joined them as a new check.
- **Removed from scope (1):** the gate-coverage audit (`arc check-gates`) went to a provisional follow-on stub. Parity
  by construction (D9) removes the drift it targeted.

## Coordination

- **Editor-document publication** (D2's prerequisite) landed through `schema-introspection-layer`, on the base branch
  at `38597e53a`; `check-declaration` is the first production type to take its marker (Task 1.3.d).
- **CI layout** (§ Prerequisites) landed through `test-suite-reliability`, on the base branch at `e9ce523a3`.
- **Configuration home** under other install profiles (D2, D12 invariant 4) follows `config-storage-architecture`,
  whose CLI side can move `arc-config.yml`'s reader onto D2's typed read.
- **State storage.** D12's invariants meet `spec-storage-contract.md`'s ref layout (D10), sync and push (D12), task
  close (D16), branchless planning (D17), and ghost mode with the surface boundary (D19). Three holds went to
  `storage-seam`:
    - a failed push gate reads to the push loop as a code-leg failure;
    - the per-worktree reuse record joins the machine-local set;
    - the stored `verificationKind: "tier-3"` value is renamed when its record is next reshaped.
- **`markdown-formatting`** (shipped) handed commit-time auto-fix and restage to this work (D7).

## Sizing and landing

The mechanics slice (declaration through hooks) is roughly 8–12 of the 13–20 days. Activation decides whether it takes
an implementation slot beside the storage program's Stage 2. The work lands single-branch with chunked review, by Owner
direction (2026-10-07), following the landing rule the storage program sets for its own members
(`cohort-state-storage.md` § Soft coordination).

## Native CI forecast replay

The first local replay used the source CLI's merge-gate CI forecast and the mapped `lint-typecheck` steps, with
`CI=1`, from the implementation checkout. Both checks covered their complete forecast path sets. Wall times include
runner startup; the hosted measurements below come from Actions step timestamps.

| Check          | Native step wall time | Batches |
| -------------- | --------------------- | ------- |
| `lint:ts`      | 47.110s               | 1       |
| `lint:ts:file` | 60.047s               | 7       |

### Hosted verification

The first dispatched run, at `5fbbf1c50c1e8baf7e5e62738c539159bfe25db5`, published the source-generated
19-check forecast and passed its plumbing validation. Its `Lint & Typecheck` job passed in 310s. Actions step
start/end timestamps have one-second resolution and include invocation startup:

| Check          | Mapped step        | Hosted step time | Shared job time | Batches |
| -------------- | ------------------ | ---------------- | --------------- | ------- |
| `lint:ts`      | `typescript`       | 75s              | 310s            | 1       |
| `lint:ts:file` | `typescript-files` | 97s              | 310s            | 7       |

Both checks run in the same job; its duration is shared, not two independent job measurements. The first run's
integration shard 1 failed because `local-e2e-check.test.ts` inherited the parent's `ARC_E2E_SKIP_BUILD=1` in a fresh
fixture without qualified output. Clearing that setting for the fixture child preserves the production build
contract. The focused native test failed before and passed after this correction with the parent setting retained.
The correction is committed at `33948f1c68915c85250e7356f147f4c2076893c2`.

[First hosted run](https://github.com/andrewRCr/arc-framework/actions/runs/38051560096).

The second run, at `33948f1c6`, passed the repaired fixture and every other job except integration shard 3. Its
indexed-Markdown repair test timed out at the default 30s; that same two-certification test had passed in 27.979s
in the first run. The sibling native certifications also rose from 11.629/12.594s to 15.028/16.822s. The test has
no 30s performance assertion, so `581a2d159e17b48e84dfe6b36cb0b1520a86c70b` gives that case a named 60s timeout
and preserves every certification, diagnostic, and repair assertion. All 13 focused indexed-Markdown tests pass.
[Second hosted run](https://github.com/andrewRCr/arc-framework/actions/runs/38052517661).

The completed run at `581a2d159e17b48e84dfe6b36cb0b1520a86c70b` succeeds: setup, build, lint/typecheck,
both unit shards, all four integration and E2E shards, Linux portability, and duration merging pass. The repaired
indexed-Markdown case completes in 28.737s. The optional portability pair is disabled; the PR-only `ci-ok` and
`merge-ok` mirrors do not execute on a dispatch. All failed attempts remain visible in their original runs.
[Successful hosted run](https://github.com/andrewRCr/arc-framework/actions/runs/38053408096).

## First-consumer scenarios

The disposable consumer clone starts at `96e5992290c47dfe9af5106316915da6e91ff77d`. It runs the actual source
CLI's CI merge forecast and the production setup validation command. A valid map exits zero; adding
`unlisted-probe` mapped to `lint-typecheck/default-checks` exits one with
`CI map names an unlisted check: unlisted-probe`; byte-for-byte restoration of the map exits zero again.

After a neutral README edit and a native increment request, ordinary `git commit` succeeds through ARC's commit
hook at `b3d77e8e1dc508d6d0c539a03b6aa703edccdd55`. Ordinary `git push` to the disposable bare remote succeeds
through ARC's push hook, with all 15 declared push checks passing or reusing their results. The local and remote
branch heads match and the consumer clone is clean. The primary feature branch also pushes successfully to GitHub
at `5fbbf1c50`, `33948f1c6`, and `581a2d159`, through its native pre-push hook.

The scenario report and command logs remain in `/tmp/arc-quality-consumer-scenarios.json` and the
`/tmp/arc-quality-consumer-*.log` files. The real hosted forecast artifact is retained in
`/tmp/arc-quality-hosted-final-forecast/.arc-check-forecast.json` and names all 19 merge-gate checks, including the
OS-conditional macOS check; the optional portability pair remains disabled for the dispatched runs.

The hosted end-to-end scenario succeeds at `581a2d159e17b48e84dfe6b36cb0b1520a86c70b` in
[the successful dispatched run](https://github.com/andrewRCr/arc-framework/actions/runs/38053408096). Its source
forecast and validated map feed every scheduled check-running job. The optional Windows/macOS pair is off,
so the macOS-only entry remains conditional rather than being claimed as executed.

## Terminal verification

The complete work-unit walk covers base `2ab7ca75fda772c729dc8e94435b602f8e77ebb4`,
HEAD anchor `2d852890aaffdce01fb51cec9f19f3afd919b2c8`, and staged tree
`dfcfb1590b103af1a584a2dfbfd5e0c44df869a7`. The closing task-list and evidence edits follow this verified source subject.

All 20 immutable criteria are met; none is superseded or unresolved. These are implementer validation results for
Candidate preparation. They do not satisfy Candidate code review, current hosted admission, or merge authorization.

The forced local merge quality gate ran all 16 selected checks without reuse. Both type checks, all declared local
linters, formatting, package sync, and the full build passed. Unit tests passed 14,170 cases with 549 skipped;
integration tests passed 3,234 with 639 skipped; contract tests passed 104. Separate feedback passed 50 related unit
tests and all 1,003 local E2E tests. The increment passed nine checks and reused two. CI-only E2E, portability and
macOS portability are explicitly excluded locally; the hosted runs above remain evidence for their historical heads.

The native HEAD correction has fail-first unit and four-manager push coverage. Failed pushes leave the remote tip
unchanged; repaired retries publish the checked tip, with one execution per event. Detached, tag and other-branch
exclusions and original source-ref attribution remain covered. Focused verification passed 197 tests in 24 files.

### Criteria evidence

Each ordinal resolves under `tasks-quality-gate-hooks.md` > Success Criteria. Digests identify the immutable
criterion text independently of checkbox state and Markdown layout. All entries below resolve to met.

#### Criterion 1

- Digest: `sha256:30ee1d12f93b8f665fa427febcb743864899968371953f50e8f235efc98f18da`
- Evidence: check runner content keys and force bypass; check-increment and check-fixers E2E

#### Criterion 2

- Digest: `sha256:b71ee64ca3aa70476e046b86228ddb7adb4c9382e2af3bb5f556b12417173966`
- Evidence: selection.ts four widening triggers and deletion filtering; check-selection E2E; actual planning/framework
  dry-run forecasts; archived-planning selection uses current repository declaration in native increment/segment
  forecasts; check-project-selection.e2e.test.ts passes both forms without code checks; existing four-trigger widening
  suite passes.

#### Criterion 3

- Digest: `sha256:2fe64517d7241014abb956efb3096539e0a071511a4955376a9f51be43bec5e4`
- Evidence: declaration-driven hooks and CI forecast/plumbing; actual CI plumbing integration tests and retired hook
  chain

#### Criterion 4

- Digest: `sha256:54ed6e61ff58017911114e8cd82b356467b3096ab4f97b8fb16d77a93e8e2f63`
- Evidence: complete numbered-tier corpus search, delivery identifier rename and shipped arc check fire sites

#### Criterion 5

- Digest: `sha256:5b5ce3aeaf2798e00dd63fdba19a72480c482d14f5b7f980f814d328c29c50cc`
- Evidence: gates.ts cumulative membership and deadline-only kinds; check-gates E2E interlock matrix

#### Criterion 6

- Digest: `sha256:8bb25339d30e47cfa83e2f21124f0f0e57ea4fbe6835d1252a7aee167f3c74ac`
- Evidence: runner outcomes/exit precedence and hook-only ARC_SKIP; check-outcomes and check-hook-policy E2E

#### Criterion 7

- Digest: `sha256:88918e37424b9aa0c7b4c524312e9c8df3b9adcb5925a88bee8af017019123a9`
- Evidence: paired refusal/repair tests in check-outcomes, check-hook-policy, check-pre-commit-hook and check-request
  E2E

#### Criterion 8

- Digest: `sha256:7cf964af58592541556d75490cb6d292e46843c0d050ac46c074fac816b0ffa3`
- Evidence: push.ts classifyPushRef maps native HEAD through the captured symbolic checkout branch, preserves original
  ref attribution and existing state/deletion/detached/tag/other-branch exclusions. Native hook-manager-push
  failure/repair matrix passes for HEAD and qualified branch spelling under all four managers, once per event.
  Existing commit dispatch, deletion, commit-message, ref disposition and upgrade suites remain green.

#### Criterion 9

- Digest: `sha256:066146fb3d18beb1dcc4221ea142c4b350909f5237fe93495d37beb5482dec92`
- Evidence: fixers and commit-fixes source; check-fixers/hook-manager-fixers E2E; native untracked formatter consumer
  from Task 7.4.e

#### Criterion 10

- Digest: `sha256:1752cd2b3fd3de07c9f3188fa66f0ab3dea34e0e6cb2a9f6a78dec80769f3bc9`
- Evidence: merge.ts decodes complete native comment records against NUL-delimited tree/parent paths and retains
  authored combined-diff paths; ambiguous records propagate conservative selection. resolve-request.ts preserves
  active merge coordinates for named staged retries. selection.ts retains deleted historical conflicts across captured
  parents while omitting absent files from arguments. Native check-merge, check-base, base-merge-hooks and
  package-sync tests cover hooks, refusal/repair, all range forms, custom prefixes, multiline ambiguity and deleted
  conflicts.

#### Criterion 11

- Digest: `sha256:7d2462e976d57ab884b3838f7e63f2ef083625d2838a2291e91fbcb377ae5c52`
- Evidence: forced verify and convergence workflow calls; runner force bypasses pass lookup; cache access confined to
  runner

#### Criterion 12

- Digest: `sha256:febd0f61ae2f58370b4ddec6f15a745dace3c8e0e003644c0e97ec9f5baefba8`
- Evidence: bootstrap snapshots original sources and keeps gates unset; update-checks-bootstrap unit and
  update-hook-upgrade E2E

#### Criterion 13

- Digest: `sha256:729a6e0fe4ff57da8e367e8db28042d5a053f0a79aeadf839111d32b95496568`
- Evidence: CI merge --ci forecast and validated placement map; ci-check-plumbing/ci-check-runner integration;
  recorded hosted run at 581a2d159

#### Criterion 14

- Digest: `sha256:e1c81c769048ef7b66a1bcd79a0e9a68ac29722cd51584840ec45eec960cae23`
- Evidence: registered strict input schema and generated editor document; schema-declaration E2E accepts actual
  repository declaration and rejects unknown fields; current generated editor document accepts corrected declaration

#### Criterion 15

- Digest: `sha256:eea14cbf83435a0be0a93ac5a15409d3556bc996e4aa7775d2e5594c38e6c73f`
- Evidence: worktree-private arc-checks directory and best-effort stores; record unit/integration fault tests;
  check-report E2E vocabulary/log faults createCheckIndexDirectory falls back to private system temporary storage for
  indexes when record storage is unavailable; native worktree/staged/hook checks execute twice without reuse, see the
  exact checked tree, preserve the real index/worktree, and clean temporary indexes.
- Deviation: On record-directory faults, disposable indexes use private system temporary storage. The reuse record
  remains worktree-private in arc-checks, outside arc/. This is the approved fallback implementing the storage-fault
  contract.

#### Criterion 16

- Digest: `sha256:3d7b053e904e2f5b1f0a8af69bcc1d4d3cef2261c54aa25fe40a94bafac1cf93`
- Evidence: full shipped corpus and recipe inspection: no installed declaration and no stack-tool gate defaults

#### Criterion 17

- Digest: `sha256:8f2c1c2fa58db162a49849ca9c0672c4cf9c166a34075d5ca32eb112238fc8ed`
- Evidence: notes-quality-gate-hooks fixed 20-commit sample, before and after argv/timings/load limits; 2650.467s
  before and 701.697s after

#### Criterion 18

- Digest: `sha256:fb149c38162edd7441183d53d032670333480dce4a9e10dc0195baed2a9676f1`
- Evidence: process.ts sanitizes Git environment; index-view.ts declared index isolation;
  check-git-environment/check-index/markdown-commit-index E2E

#### Criterion 19

- Digest: `sha256:5593b9f1ac7e795d091c38cf2074ed0f1542f562232da3a19ee68e48905a962c`
- Evidence: Fresh forced merge request on dfcfb1590b103af1a584a2dfbfd5e0c44df869a7 passed all 16 local checks with
  zero reuse: both type checks, complete lint/build checks, 14170 unit, 3234 integration and 104 contract tests.
  Separate local E2E feedback passed 1003 tests. CI-only E2E and portability declarations remain explicit local
  exclusions.

#### Criterion 20

- Digest: `sha256:6e3400fca90dcb0c0f525a97a0a95374806d40ee0e68fea7e2323786a1b6f82f`
- Evidence: All implementation criteria and fresh local checks are resolved for Candidate preparation. The advisory
  loop ended non-converged at Pass 4 of 4, cap-exhausted; its last approved HEAD correction is locally verified but
  unattacked by a successor. Candidate code review, current hosted admission and exact-head integration authorization
  remain later obligations.

### Adversarial criteria validation

Four fresh whole-target passes returned seven findings. Every finding was independently confirmed against source
and native execution, approved for correction, and fixed. The complete set below preserves the reported and verified
grades, evidence and response. None was deferred or rejected. These passes are advisory criteria validation, not a
Candidate code-review lane result.

#### Pass 1 of 2

Reviewed tree: `229f0662ac2d6c07a23606d3cc918e15b816140f`.

- Finding: Native Git comment characters can silently exclude resolved merge conflicts
  Reported critical; verified critical; confirmed; approved fix completed.
  Locus: packages/arc-framework/src/lib/checks/merge.ts:36
  Evidence: core.commentChar=; produces ;\tfile.txt; built CLI pre-commit exits 0/not selected. Changing only metadata
  prefixes to # makes the identical failing check execute and exit 1.
  Response: Implemented and verified by fail-first regressions and passing increment/feedback checks.
  Approved action: Preserve historical conflict paths under native Git comment settings; add regression coverage of
  unchanged one-sided conflict resolution.

- Finding: An unavailable disposable record directory prevents index-reading checks from running
  Reported major; verified major; confirmed; approved fix completed.
  Locus: packages/arc-framework/src/handlers/check/run.ts:132; packages/arc-framework/src/lib/checks/index-view.ts:21
  Evidence: reads_index=true and a regular file at .git/arc-checks cause built CLI increment exit 2/EEXIST without
  execution; removing only that file makes the retry pass.
  Response: Implemented and verified by fail-first regressions and passing increment/feedback checks.
  Approved action: Keep indexed execution available when disposable record storage is unusable, with private
  snapshot/index fallback and cleanup; preserve exact checked-tree index semantics and add regression coverage.

- Finding: A merge-conflict failure remedy does not rerun the failed check
  Reported major; verified major; confirmed; approved fix completed.
  Locus: packages/arc-framework/src/lib/checks/remedies.ts:42;
  packages/arc-framework/src/lib/checks/resolve-request.ts:98
  Evidence: With normal # metadata, hook exits 1 for a historical conflict restored to HEAD; its exact named staged
  retry exits 0/not selected and omits merged parents without content changes.
  Response: Implemented and verified by fail-first regressions and passing increment/feedback checks.

  Approved action: Preserve merge-conclusion selection, base/tree and incoming-parent context when rerunning the
  failed check; verify unchanged-content retries execute and retain failure until repaired.

#### Pass 2 of 2

Reviewed tree: `84b0d3fc9e340817724d343af8748736232585ac`.

- Finding: A modify/delete conflict kept deleted escapes the commit gate
  Reported critical; verified critical; confirmed; approved fix completed.
  Locus: packages/arc-framework/src/lib/checks/selection.ts:58-66
  Evidence: Native Git HEAD deletion/incoming modification, resolved to deletion: mergePaths retains src/a.ts; a
  failing project-mode src/** check with cache false is not selected and the hook exits 0.
  Response: Implemented and verified by fail-first native regressions, 235 focused tests, increment, 27 related unit
  tests, 997 local E2E tests and all 16 forced local merge checks.
  Approved action: Project historical conflict reach through all captured merge parents, retaining deleted-path
  filtering for files-mode arguments. Add fail-first native modify/delete and selection regressions.

- Finding: Archived planning Markdown widens selection to code checks
  Reported major; verified major; confirmed; approved fix completed.
  Locus: .arc/system/arc-checks.yml:116,140; packages/arc-framework/src/lib/checks/selection.ts:35-42
  Evidence: Only .arc/completed/archive/notes.md changes. Every own selection is not selected, widened=true, and
  increment selects typecheck, typecheck:test, lint:ts:file, lint:sh and test:arc-contracts. Reviewer segment also
  selects unit/integration checks.
  Response: Implemented and verified by fail-first native regressions, 235 focused tests, increment, 27 related unit
  tests, 997 local E2E tests and all 16 forced local merge checks.

  Approved action: Cover archived planning Markdown declaratively with existing Markdown checks, keeping archival
  formatter/linter policy and code/test exclusions. Add native planning-only selection regressions; preserve all four
  widening triggers.

#### Pass 3 of 3

Reviewed tree: `47bb8468fe8c8b93b573b3793f36360514d9b707`.

- Finding: Newlines in conflicted pathnames silently bypass merge-conclusion enforcement
  Reported major; verified critical; confirmed; approved fix completed.
  Locus: packages/arc-framework/src/lib/checks/merge.ts:35-47, readMergeCheckPaths
  Evidence: Path src/two\nlines.ts is recorded as #\tsrc/two\n# lines.ts. The resolved request has mergePaths
  [src/two] and staged tree equals HEAD. An uncached failing src/** project guard is not selected and the commit-gate
  request exits 0. Reviewer also proved an ordinary merge commit succeeds through the enabled shipped hook.

  Approved action: Recover complete native multiline conflict pathnames, retaining the recorded comment prefix;
  validate path accounting against Git tree paths and conservatively widen when it is ambiguous rather than silently
  excluding conflicts. Add a native hook refusal/repair regression.
  Response: Complete native records are decoded against captured tree and parent paths; non-unique records propagate
  uncertainty to conservative gates and full named staged retries.

#### Pass 4 of 4

Reviewed tree: `4e20c1f9e095c324727fb125a40ff94af5c6cc93`.

- Finding: Pushing the checked-out branch as HEAD bypasses its push gate
  Reported major; verified critical; confirmed; approved fix completed.
  Locus: packages/arc-framework/src/lib/checks/push.ts:16-24, classifyPushRef; handlers/check/run-cli.ts:120-122,
  runPushEvent
  Evidence: Independent native fixture: HEAD symbolically names refs/heads/feature and the same unchanged tip is
  pushed both ways. git push origin feature executes the uncached failing src/** guard, exits 1 and creates no remote
  feature ref. git push origin HEAD reports no worktree, executes no check, exits 0, and creates the remote feature
  ref at that exact tip.
  Response: Implemented the approved native HEAD classification correction; fail-first tests and all required local
  checks pass. No successor adversarial pass ran.
  Approved action: Resolve symbolic push sources such as HEAD to their canonical branch before checkout ownership
  classification, retaining original ref attribution and state/deletion/detached/tag/other-branch exclusions. Add
  native failed-push and repaired-retry coverage using HEAD, plus classification regressions.

The latest result is **Pass 4 of 4**, **non-converged**, stop reason **cap-exhausted**. Its confirmed critical
HEAD push bypass is fixed and locally verified. That final correction remains unattacked by a successor adversarial
review. Approval covered the bounded fix; no Pass 5 was authorized or launched. The prior recommendation for one
additional whole-target pass remains advisory, and the cap establishes no clean or Owner-accepted terminus.

## Review amendments A1 and A2

Standard Candidate pass 1 found that the bootstrap's per-line extraction and the historical cache identity could not
meet their stated behavior. Both amendments were approved with disposition set
`sha256:9bbbb49bf1b275b6e1df41a272daa4aad8195da75f36c7c27ab28b97a43df6a0` on 2026-10-10.
The amendment entry gate selects the design arm at low depth: complete shell strings and independent tree-input matching
already supply the corrections. No new shell parser, declaration field, or commit-identity cache dependency is needed.

### A1 — Complete shell-block extraction

Superseded D2 Bootstrap Proposal paragraph:

> - **Proposal.** Each command line in those fenced blocks, other than comments and bracketed template placeholders,
>   becomes one proposed check. Its `command` is the line as a `shell: true` string, which preserves its shell meaning
>   until a person converts it to an argument list. Its `gate` is left unset, with a comment naming the gate its source
>   maps to: Tier 1 or `post-task-quality` maps to `commit`, Tier 2 or `post-unit-quality` to `push`, and Tier 3 to
>   `merge`. A comment also names the source. A command found at several tiers is proposed once, mapped to the earliest
>   gate.

`consumeFencedLine` and `finishBlock` retain a complete shell fence as one inactive command. Incomplete fences and
executable blocks mixed with placeholders are carried for manual authoring. SC19 checks this amended obligation;
SC12's original text and its historical verification remain preserved.

### A2 — Declared historical input identity

Superseded D5 Key paragraph:

> **Key.** Per check: its id; a digest of its resolved declaration entry; a digest of the global inputs' content and the
> global runtime inputs' output; a digest of its own inputs' content in the checked tree, or for a fix-capable check in
> the tree at its turn (D7); and its runtime inputs' output. A `files` check's key also takes each path it receives (D2):
> the changed paths among its inputs or, under a request with no change or when widening selects it, every path among
> them, each with what it held at the base and, where the change carries merges, at each merged-in parent. Environment
> variables are not in the key; a check that depends on one names it as a runtime input.

`historicalContent` matches own and global input sets independently at the base and each exported merged parent,
then hashes their complete content alongside received argument paths. `checkContentKey` changes its development key
version to invalidate passes admitted by the old divergence guard. SC20 checks historical dependency identity;
SC1 and SC10 retain their original text. The native package-sync regression joins actual script outcomes to reuse,
including equal checked trees and received paths with differing unreceived historical counterpart bytes.

### Amendment verification

The primary source replay confirmed the initial terminal-continuation failure: stripping boundary newlines changed
`printf "<%s>" value` followed by a continuation and blank line from `<value>` to `<value><\>`. The approved complete-text
correction now retains those newlines. The initial independent report is preserved at
`/tmp/arc-quality-standard-fix-amendment-grounding.json`; its independent recheck at
`/tmp/arc-quality-standard-fix-amendment-grounding-recheck.json` is clean within the A1/A2 footprint. Reader independence,
binding completeness, and bounded propagation withstood; this is amendment grounding, not a standard or adversarial pass.

The CLI boundary suite passed 52 tests; the check library and bootstrap suite passed 169 tests. Native manager exclusions,
actual historical package-sync reuse including unrelated parent content, and update/reconfigure shell-block retirement
passed in the 24-test supplementary run. Original-behavior and narrow reconstruction runs retain behavioral red evidence
in `/tmp/arc-quality-standard-fix-red-unit.log`, `/tmp/arc-quality-standard-fix-red-e2e.log`,
`/tmp/arc-quality-standard-fix-red-remaining.log`, `/tmp/arc-quality-standard-fix-terminal-newline-red.log`, and
`/tmp/arc-quality-standard-fix-final-red.log`. The first native merge reconstruction exposed a missing fixture link
validator; the corrected fixture then failed on the expected indexed-content mismatch and passed after restoration.
