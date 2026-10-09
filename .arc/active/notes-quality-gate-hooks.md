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

**Measured baseline tip:** `159fdcdeba90a21c9d1bb11cb631d5a46111a6be` (`main`). Read
`git log main --no-merges` in its default date order, excluding commits with deletions or renames and, by direction
at implementation entry, excluding any commit whose original path set is no longer present at that tip. Keep each
selected commit's complete path set. The first 20 eligible commits contain one Markdown-only increment and 19 mixed
or other increments. This is the eligible sample's distribution, not an estimate of all repository work: excluding
retired active artifacts removes many recent Markdown-only increments.

Replay each sample in a disposable local clone at that tip, on `measurement/quality-gate-baseline`; `main` remains at
the measured tip. Install with `npm ci`, build the CLI, then run `npm rebuild @arc-framework/cli` to expose its local
executable when installation preceded generation. Set the clone's identity to `andrew` and retain the ordinary husky
hooks. The clone is `/tmp/arc-quality-baseline`, outside ARC's registered checkout roster.

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
