# Implementation Notes: Retire extension points

- **Design:** `spec-retire-extension-points.md`
- **Task List:** `tasks-retire-extension-points.md`

---

## Removal ordering and synchronization

The plan keeps one work unit and one delivery member, as D1 already decides. The runtime inputs, workflow consumers,
and validation obligations form one retirement concern. The three segments separate validation prerequisites, an
exercisable runtime removal, and the remaining corpus transformation; they introduce no delivery topology.

Keep each parent task as one review increment. A parent with several source/test/copy edits groups the changes
needed to leave that increment coherent; its description bullets are not independently committed subtasks. In
particular, remove a validator and both hook invocations together, and update each changed public contract with its
consumers and fixtures. Every increment still runs its applicable declared gates.

- Task 1.1 removes parser/scanner importers in the two generic validators and deletes the extension-point validator.
  Keep the extension parser/scanners themselves until Task 2.3 removes their remaining command consumers.
- Task 1.2 removes extension enumeration, coverage, and push-site auditing from `audit-method-triggers.ts` before
  session or lifecycle markers disappear. Retain the existing extension declaration parsing only until the declaration
  sweep finishes; Task 4.1 removes it and closes the grammar. Do not introduce an alias or a new transitional parser.
- Task 2.1 removes active-name arguments while probes still exist. Task 2.2 removes probes, envelope slots, and agent
  session dispatch together. Task 2.4 removes the checkpoint field with the workflows that render its report.
- Task 3.3 completes the remaining workflow declaration sweep before Task 4.1 rejects `arc.extensions`.
- Task 4.2 removes structural requirements and check inputs before Task 4.3 deletes the files and installation entries.

Package source under `packages/arc-framework/arc/` owns Framework changes. Edit it first and synchronize the installed
instance. Render `.template.md` counterparts using the repository's resolved configuration; use
`src/lib/template/render.ts` and `src/scripts/render-framework.ts` for the existing rendering path. Configurable
framework sections need targeted edits in both copies, preserving project overrides. Do not run `arc update` in
this checkout. Canonical skill changes also need their gitignored harness copies refreshed for subsequent sessions.

## Retrieval revision

Before the first implementation removal in Task 1.1, capture `git rev-parse HEAD` and record its full object ID here.
That is the retrieval revision for Task 5.3; do not substitute a planning-session HEAD or a later partially retired
revision. Verify the recorded commit contains the extension files, workflow consumers, and scanner/audit sources.

**Implementation retrieval revision:** `966ecb587628cf2643e281f7c9a4823fc494ff74`

Task 5.3 uses that revision with explicit recoverable source paths. The next unused ADR number must be resolved at
authoring time; `038` was next at task-generation grounding and is not reserved by this note.

## Runtime and test map

Paths below are relative to `packages/arc-framework/`. Lists are grounding pointers, not a closed implementation
inventory; follow importers, fixtures, and registries when the contract changes.

### Active-name inputs

`runSessionInitStatus`, `runRecoverStatus`, and `runSessionHandoffStatus` pass active names into derived-locus
callbacks in `src/commands/status/run.ts`. `getDerivedLocusState` in `src/handlers/status.ts` includes them in its memo
key. Remove the input chain through:

- `src/handlers/derived-locus-state-probe.ts`;
- `src/lib/locus/derived-reader.ts` (`readDerivedLocusRoster`);
- `src/lib/locus/subject-meta.ts` (`projectCheckoutSubjectMeta`);
- `src/lib/load-set/projection.ts` (`LoadSetProjectionInput`, `resolveLoadSetManifest`);
- `src/lib/recover/locus-context.ts` (`deriveRecoveryLocusContext`);
- `src/lib/compaction-seed/emitter.ts` (`emitCompactionSeed`).

`resolveLoadSetManifest` does not use `activeExtensions` to select entries. Preserve exact subject/context selection,
planning and execution workflow projections, task closeout and correction continuations, cohort context, and method
load behavior.

Update `__tests__/unit/locus/derived-reader.test.ts`, `__tests__/unit/handlers/derived-locus-state-probe.test.ts`,
`__tests__/unit/load-set/{projection,audit}.test.ts`, `__tests__/unit/recover/{locus-context,audit}.test.ts`,
`__tests__/unit/compaction-seed/emitter.test.ts`, `__tests__/integration/recovery-locus.test.ts`, and affected status
probe helpers.
Rename `__tests__/unit/locus/subject-meta-active-extensions.test.ts` for subject projection and update
`__tests__/helpers/isolated-unit-mock-files.ts`; keep its Candidate, publication, correction, closeout, and schema-skew
cases. Replace only the extension-input assertion in `__tests__/integration/locus-retirement-contract.test.ts`.

### Envelopes and public command

`runStatus`, `runSessionInitStatus`, `runRecoverStatus`, and `runSessionHandoffStatus` schedule extension probes in
`src/commands/status/run.ts`. Remove their callbacks/slots through `src/commands/status/{types,schema,format}.ts`,
`src/handlers/status.ts`, `src/handlers/status/session.ts`, and `src/handlers/recover-probes.ts`. Remove the seed slot
from `CompactionSeedEnvelope`. `SESSION_ENVELOPE_SCHEMA_IDS` and its registry live in
`src/lib/session-envelope/registry.ts`; schema discovery and production type inventories must lose the identifier.

Update `__tests__/unit/status/run.test.ts`, `__tests__/unit/status-format.test.ts`, `__tests__/integration/status.test.ts`,
`__tests__/unit/status/{session-envelope-schema,recovery-envelope-schema}.test.ts`,
`__tests__/unit/session-envelope/{registry,type-authority}.test.ts`, and `__tests__/helpers/production-schema-ids.ts`.
Regenerate the seven JSON inputs under `__tests__/fixtures/session-envelope/`, retaining every surviving scenario.
Strict session-init/recovery schemas should reject an obsolete top-level slot; do not invent a full-status strict
schema just to remove its typed slot.

`src/cli.ts` registers the command; `src/command-input-registrations.ts` imports its input declarations. Delete the
command/handler/frontmatter/scanner modules named in D2 and their re-exports. Delete the five exclusive runtime test
files named in D8, preserving every mixed suite. Update `__tests__/unit/cli-loading-boundary.test.ts`, command-input
inventories, and comments in `src/lib/frontmatter/{index,generic}.ts`, `src/lib/fs/walk-markdown.ts`, and
`src/lib/manifest/apply.ts` without changing their independent behavior.

### Checkpoint

`composeCheckpointInterlockSurface` in `src/scripts/integration/interlock-surface.ts` emits `machineEvidence` and the
empty report. `src/scripts/integration/checkpoint.ts` consumes the entire strict surface, not a separate report
reader. Remove only `extensionReport` from the schema, composition, fixtures, and workflow report rendering.

`__tests__/unit/scripts/integration/{interlock-surface,checkpoint}.test.ts` must keep all nine machine signal kinds,
clean and exception output, exact approved-head coordinates, base-currency disclosures, and merge-admission behavior.

## Workflow and validator map

`parseWorkflowFrontmatter`, `buildCoverageMap`, `readMethodDependencyGraph`, and `resolveTransitiveMethodCoverage`
in `src/scripts/audit-method-triggers.ts` own surviving declaration parsing, graph validation, and coverage.
`METHOD_ARC_FRONTMATTER_FIELDS` stays unchanged. Its mixed suite is
`__tests__/unit/scripts/audit-method-triggers.test.ts`; remove extension coverage tests with the corresponding code,
then replace extension parsing acceptance with unknown-key rejection in Task 4.1.

`classifyPath` / `validateFiles` in `validate-frontmatter.ts` retain method and domain-rule branches.
`classifyPackagePath` / `validateFiles` in `validate-package-neutrality.ts` retain package-method neutrality.
Keep their mixed unit suites and both hooks' `CHECK[domain-rules-frontmatter]` dispatch.
`__tests__/e2e/check-pre-commit-hook.e2e.test.ts` supplies existing hook execution coverage.

For `integrate-work-unit.md`, preserve resolver dispatch, open-PR binding, merge-lock routing, immediate
`--require-remote` replay, typed review/Candidate authority, and the prohibition on commits/pushes after `ready`.
Its `openedChangeRequest` composition has only hook consumers and is removed.

For `run-errand.md`, preserve `openedChangeRequest`, head-change refresh, and equality with the planning-grooming
adapter target. Preserve final-checkpoint mutation prohibition and the integration interlock. Remove hook
qualifications from these independent rules. Update report assertions during Task 2.4, then preserve the remaining
PR resolution, publication/lane ordering, reuse, remote-head, planning-grooming, and review assertions when renaming
`__tests__/integration/pr-open-extensions.test.ts` in Task 3.1. Update `src/lib/local-vitest-runner.ts` routing and
the mixed `__tests__/integration/review-gate-packaging.test.ts` coverage when its hook fixtures disappear.

Session renumbering includes `session-init.contributor.md`, `session-init/probe-envelope.md`, and status type
comments. Lifecycle renumbering includes `deactivate-work-unit.md`, session-operations and work-organization
strategies, and the stale archival-commit citation. Check actual target meanings and heading slugs at each change,
then run the independent whole-corpus citation sweep in Task 5.4.

## Installation and structural map

`resolveFileList` in `src/lib/classification.ts` derives membership from `init-recipe.json` and conditional arms.
`CONFIGURABLE_FILES` / `classifyFile` in `src/lib/classification.ts` classify eleven extension documents;
the extension README defaults to Framework. All twelve recipe entries are unconditional.

`buildChangePlan` in `src/lib/manifest/plan.ts` obtains removal classification from the old manifest entry.
`applyChangePlan` in `src/lib/manifest/apply.ts` deletes removed Framework files, retains Configurable files in
`keptForReview`, and excludes both from new managed membership. Keep that implementation unchanged. Test the real
old extension manifest, edited Configurable content, README deletion, pristine removal, and a second update against
the resulting manifest; never classify the legacy inputs through the new classifier.

Affected coverage includes `__tests__/unit/init.test.ts`, `__tests__/unit/template/recipe.test.ts`,
`__tests__/unit/manifest/{plan,apply}.test.ts`, and `__tests__/integration/{init,update,framework-sync}.test.ts`.
The current self-hosted membership is 154: 104 Framework, 46 Configurable, and 4 Scaffolded files. Removal alone
produces 142: 103 Framework, 35 Configurable, and 4 Scaffolded. Re-derive counts from the live recipe and classifier
before writing inventory prose, rather than treating these observations as immutable totals.

| `pm.mode`    | `team.mode` | Current total | Retirement-only total |
| ------------ | ----------- | ------------- | --------------------- |
| `none`       | `false`     | 150           | 138                   |
| `none`       | `true`      | 151           | 139                   |
| `external`   | `false`     | 151           | 139                   |
| `external`   | `true`      | 152           | 140                   |
| `arc-in-git` | `false`     | 154           | 142                   |
| `arc-in-git` | `true`      | 155           | 143                   |

Preserve `.arc/system/.internal/manifest.json` metadata and unrelated entries; remove only deleted file keys.
There was no on-disk `.arc/system/.internal/pristine.json` at grounding; regenerate derived state only if the manual
render/sync flow needs it.

Narrow both `system/.internal/scripts/verify-integrity.sh` copies and their workflow instructions to surviving
structure. Preserve `__tests__/integration/scripts/verify-integrity.test.ts` coverage with method fixtures.
`isCodeSurfacePath` and `isPackagedContentSensitivePath` in `src/lib/change-facts.ts` consume the two glob sets;
remove only extension-root patterns and preserve method/sensitive-content selection tests.
Remove extension table inputs from `.arc/system/arc-checks.yml` without changing check IDs or deadlines.
Remove `extension-root` and `arc-extensions-key` from `audits/coupling-blast-radius/manifest.json`. In the mixed
`composable-workflows` packet in `audits/coupling-blast-radius/routing-ledger.json`, trim only their `classIds`,
`classEvidence`, `evidenceAnchors`, and `reportAnchors`. Retain `arc-methods-key`, `load-set-name`, `method-root`,
`recommended-text-family`, `template-suffix`, and `workflow-root`, their routing, and all unrelated packets.
Regenerate the affected packet's `id` and `contentDigest` under the existing canonical rules; preserve the historical
`resultDigest` binding and validate with `parseRoutingLedger` in `src/lib/coupling-audit/contracts.ts`.

## Guidance, history, and final sweeps

Current guidance batches include the configurability, session-operations, workflow-authoring, team-coordination,
planning-module, and file-classification strategies; rules/briefs/indices; method/self-review and directory READMEs;
workflow templates and canonical skills. Preserve the two convention rows and set their customization path to
**None**. Retain harness-native hook guidance and project workflows/methods beside ARC workflows, with no supported
step-insertion or tracker-notification claim. Preserve `Origin` linkage and unrelated setup instructions.

Internal inventory updates cover `strategy-pm-composition-evolution.md`'s four named loci,
`strategy-storage-evolution.md`, `strategy-procedure-evolution.md`'s point-scanner implication,
`PROJECT-PRD.md`, `TECHNICAL-OVERVIEW.md`, package-project sync inventory, and root `README.md`.
Do not route coordination into implementation or change sibling planning artifacts or the storage-coupling register.

The new ADR follows `template-adr.md` and `strategy-adr-methodology.md`. Record the already-settled retirement
decision and its accepted notification/insertion gap; retain all eleven events, frequency/naming, authored order,
halt-on-failure and explicit continuation, opaque payloads and adapter authority, retry/idempotence constraints,
and the difference between a wrapper-wide promise and actual workflow-audit enforcement. Update only the four
specified status metadata loci, preserving prior annotations and every historical body.

Task 5.4 runs both independent sweeps from the spec: mechanism references by sense and workflow step/section/heading
references by target. The spec's corpus exclusions and closed allowlist apply verbatim; no whole fixture directory
or generic historical category is allowed. Preserve `hooks.skip_extensions`, parser augmentation, registry extension
schemas, ordinary typed-interface/injected-capability augmentation, mechanically unchanged Candidate selection/endpoint
extension, generic probe terminology, harness hooks, and legacy quality-hook extraction. Negative absence tests and
bounded old-manifest/inert-residue inputs are the only mechanism-specific test allowances.

The same closed list preserves hosted-review wait duration, external CLI add-ons, optional data-schema fields,
domain-rule augmentation of standards, ordinary feature/API growth described in test examples, and PM-mode module
composition. In work-planning guidance, “arc-in-git extensions” means Core plus optional planning-module content;
`resolveFileList` selects its recipe membership. The source actors and limits are defined in the spec; these senses
exempt neither whole fixture directories nor current retired-hook activation, dispatch, or positive execution fixtures.
Apply them by meaning to each occurrence, not by its directory or a generic historical label.

Implementation verifiers use `npx arc check segment`; increment/completion checks retain their declared selection
and deadlines. No new suppression, skipped gate, migration, scanner reuse, or replacement hook is part of this plan.

---
