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
