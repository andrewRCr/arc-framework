# Notes: schema-introspection-layer

Execution context for `tasks-schema-introspection-layer.md`. The design authority is
`spec-schema-introspection-layer.md`; these notes add the site inventories and mechanics an implementing session
needs and do not define obligations of their own.

## Build retirement test inventory

Every test site Phase 1 reaches, by the task that changes it. Paths are relative to `packages/arc-framework/__tests__/`.
A site lands in the earliest task whose change breaks it: Task 1.1 stops requiring the bundle and stops the staged
fixture writing it, Task 1.2 removes the producer and the second identity, and Task 1.3 removes the artifact writer.

The second identity's own behavior — a change seen only by the schema producer leaves the runtime fresh while
invalidating test reuse — is retired by design, so its tests go rather than move. The behaviors the producer hosted as a
compilation hook, and the nested-output publication the bundle hosted, keep their coverage.

| Test site                                                                                   | Change                                                                                                                                               | Task  |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `helpers/staged-build-fixture.ts`                                                           | Stops writing `schemas/kernel.json` and drops its projection imports                                                                                 | 1.1   |
| `unit/build-publication.test.ts`                                                            | The two bundle checks after publication go; the `missing schema` and `invalid schema` faults go                                                      | 1.1   |
| `unit/build-publication-paths.test.ts`                                                      | Stages its own nested file and checks that it publishes under Windows relative keys, in place of the bundle                                          | 1.1   |
| `unit/build-coordinator.test.ts`                                                            | The `ancillary` publication fault targets `metafile-esm.json`                                                                                        | 1.1   |
| `unit/build-preparation.test.ts`                                                            | The `missing schema` fault goes; middle-tier reads become `runtimeMetafile`                                                                          | 1.1   |
| `integration/build-publication.test.ts`                                                     | The `missing schema` case and the `invalid schema` branch go                                                                                         | 1.1   |
| `integration/ci-build-recovery.test.ts`                                                     | The `missing schema` case and branches go; middle-tier reads become `runtimeMetafile`                                                                | 1.1   |
| `integration/build-preparation.test.ts`                                                     | The unused `missing schema` branch goes; middle-tier reads become `runtimeMetafile`                                                                  | 1.1   |
| `unit/dev-build-qualification.test.ts`, `integration/dev-build-qualification.test.ts`       | Middle-tier reads become `runtimeMetafile`                                                                                                           | 1.1   |
| `integration/focused-test-runtime.test.ts`, `integration/vitest-direct-runtime.test.ts`     | Middle-tier reads become `runtimeMetafile`                                                                                                           | 1.1   |
| `integration/build-cancellation.test.ts`, `integration/test-cost-native.test.ts`            | Middle-tier reads become `runtimeMetafile`                                                                                                           | 1.1   |
| `integration/vitest-runtime-ownership.test.ts`, `integration/ci-build-transfer.test.ts`     | Middle-tier reads become `runtimeMetafile`                                                                                                           | 1.1   |
| `e2e/schema-artifact.e2e.test.ts`                                                           | Goes                                                                                                                                                 | 1.2.a |
| `unit/build-config.test.ts`                                                                 | The case asserting fast and full builds share one success hook goes                                                                                  | 1.2.a |
| `integration/build-config.test.ts`                                                          | The `onSuccess: undefined` override goes                                                                                                             | 1.2.a |
| `integration/build-inputs.test.ts`                                                          | The case keeping producer sources out of the configuration graph goes, with its `loadSchemaProducer` and `PRODUCTION_SCHEMA_IDS` imports             | 1.2.a |
| `integration/build-generation.test.ts`                                                      | The bundle check and its `PRODUCTION_SCHEMA_IDS` import go                                                                                           | 1.2.a |
| `integration/build-preparation.test.ts`, `integration/build-publication.test.ts`            | The bundle checks after preparation and publication go                                                                                               | 1.2.a |
| `integration/build-command.test.ts`                                                         | The bundle check goes                                                                                                                                | 1.2.a |
| `helpers/vitest-runtime-fixture.ts`, `integration/focused-test-runtime.test.ts`             | The bundle check inside each generated test file goes                                                                                                | 1.2.a |
| `unit/build-evidence.test.ts`                                                               | The `schema` graph and second identity go; the schema-only case goes; the `legacy` refusal uses `schemaVersion: 2`                                   | 1.2.b |
| `unit/build-baseline.test.ts`, `integration/build-baseline.test.ts`                         | The `graphs` fixture each certification takes loses `schema`                                                                                         | 1.2.b |
| `integration/build-inventory.test.ts`                                                       | The `schema` graphs and second-identity assertions go                                                                                                | 1.2.b |
| `integration/build-command.test.ts`                                                         | The expected `qualification` loses `runtimeSchema`                                                                                                   | 1.2.b |
| `integration/build-generation.test.ts`                                                      | The `graphs.schema` assertions go                                                                                                                    | 1.2.b |
| `unit/dev-build-qualification.test.ts`, `integration/dev-build-qualification.test.ts`       | The schema-only freshness case goes                                                                                                                  | 1.2.b |
| `integration/ci-build-recovery.test.ts`                                                     | The `schema input` fault goes                                                                                                                        | 1.2.b |
| `helpers/staged-build-fixture.ts`                                                           | The source map and `graphs` lose `schema`                                                                                                            | 1.2.b |
| `helpers/native-build-fixture.ts`                                                           | Drops the stand-in producer and `src/fixture-schema.json`; adds the success hook and its no-op module                                                | 1.2.c |
| `helpers/native-build-controller.ts`                                                        | The ready/release barrier and the Windows `release-observed` and `schema-finished` markers move onto the hook module                                 | 1.2.c |
| `integration/build-generation-lifetime.test.ts`                                             | Unchanged; it exercises the barrier through `startBlockedBuildController` and must pass against the moved barrier                                    | 1.2.c |
| `integration/build-coordinator.test.ts`                                                     | The mid-generation input change moves onto the hook module; the `ancillary` fault targets `metafile-esm.json`                                        | 1.2.c |
| `integration/dev-build-refresh.test.ts`, `integration/vitest-direct-runtime.test.ts`        | The prior-CLI survival check and the direct-preparation ownership check move onto the hook module                                                    | 1.2.c |
| `integration/review-gate-workflows.test.ts`                                                 | The producer read and the `writeBuildArtifacts` assertion go; the composition assertions stay                                                        | 1.2.c |
| `unit/kernel/schema-generation.test.ts`                                                     | The `writeKernelSchemaArtifact` cases go; the `describe` title says what the suite covers                                                            | 1.3   |
| `helpers/schema-artifact.ts`                                                                | Renamed `production-schema-ids.ts`, with its header                                                                                                  | 1.3   |

The unit metafile faults stand as the refusal coverage once the bundle is unrequired: `build-preparation.test.ts`'s
missing, empty, and directory metadata cases for the middle tier, and `build-publication.test.ts`'s `missing metafile`
and `empty metafile` cases for staged publication.

## Fixture-owned build hook

What the success hook in the native fixture's copied `tsup.config.ts` can rely on, checked against tsup 8.5.1 and
bundle-require 5.1.0:

- tsup awaits a function `onSuccess` inside `build()`, after esbuild writes the output and before the build resolves
  (`buildAll`), and calls it with no arguments.
- `runCompilerChild` (`build-entry.ts`) runs the compiler child with `ARC_DEV_BUILD_OUT_DIR` set to the staging
  directory, which the copied configuration reads into `outputDirectory`. The hook resolves its output directory the
  way the production hook it replaces did.
- The compiler child loads `build-compiler.config.ts` through `bundleRequire`, so a module the configuration imports
  is bundled into it and joins the control graph. Rewriting the module before a build changes the baseline, which is
  how every re-seated test uses it.
- bundle-require rewrites `import.meta.url` and `__dirname` per source file but not `import.meta.dirname`, which in the
  bundled module resolves to the package root. The hook passes the output directory and the package root to the
  module as arguments, and each re-seated rewrite anchors its paths on those rather than on the module's location.
- The barrier's ready record keeps `{pid, directory}`: `build-generation-lifetime.test.ts` reads `directory` to find
  the compiler report in staging.

## Projection change test inventory

Every existing test site Phase 2 reaches, by the task that changes it. Paths are relative to
`packages/arc-framework/__tests__/`. Task 2.2's change reaches every registry built on the kernel's, not only
production, because the side, the shared-subschema mode, and the URN identities all live in
`KernelRegistry.toJSONSchema`: `createValidationSurfacesRegistry` projects through it, and the command-input registry
passes its options through. Under `reused: "ref"` a test that reads nested structure can meet a `__shared` reference
where it found an inline object, and after Task 2.3's fold a local `#/$defs/__<name>` one; it resolves the reference
rather than pinning the inline shape. New tests the tasks add are not listed.

| Test site                                                           | Change                                                                                                                                 | Task |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `unit/delivery/design-inventory.test.ts`                            | The exact `meta` pin for `delivery-design-inventory-input` gains `authored: "request"`                                                 | 2.1  |
| `unit/kernel/registry.test.ts`                                      | Default identities become `urn:arc:schema:<id>` and the `child` reference `urn:arc:schema:child`; each projection names a side         | 2.2  |
| `unit/kernel/schema-generation.test.ts`                             | `$id` and `$ref` pins become URNs, the key list admits `__shared`, and each projection names a side                                    | 2.2  |
| `unit/validation-surfaces/registry.test.ts`                         | `$id` and `$ref` pins become URNs; the check that every reference names a registered document admits `__shared` fragments              | 2.2  |
| `unit/validation-surfaces/projection-fidelity.test.ts`              | Validators are looked up by URN; the projection names a side                                                                           | 2.2  |
| `unit/command-input/registry.test.ts`                               | The stub validator is looked up by URN; the projection names a side                                                                    | 2.2  |
| `unit/scripts/review-gate/policy/pre-publication-procedure.test.ts` | The envelope validator is looked up by URN; the projection names a side                                                                | 2.2  |
| `unit/delivery/schema.test.ts`                                      | Each projection names a side; the `design.artifacts` and `members` reads resolve through `__shared` where reuse moves them there       | 2.2  |
| `unit/handlers/delivery.test.ts`                                    | The expected document comes from the output-side projection                                                                            | 2.2  |
| `e2e/run-cli.e2e.test.ts`                                           | The `rootId` pin becomes `urn:arc:schema:review-resolve-request`                                                                       | 2.2  |
| `e2e/review-cli-surfaces.e2e.test.ts`                               | The `rootId` pins in the result and refusal cases become URNs; `expectedSchemaIds` admits `__shared` where a root reaches it           | 2.2  |
| `e2e/review-cli-surfaces.e2e.test.ts`                               | The frontline `target` assertions resolve the `__shared` reference `target` becomes                                                    | 2.2  |
| `e2e/delivery-plan.e2e.test.ts`                                     | The `$id` pin becomes `urn:arc:schema:delivery-design-inventory-input`                                                                 | 2.2  |
| `e2e/review-cli-surfaces.e2e.test.ts`                               | `schemas` holds one document keyed by its schema id; the frontline `target` assertions resolve the local `$defs` reference it folds to | 2.3  |
| `unit/handlers/delivery.test.ts`                                    | The expected `schema` and `version` come from `lookupKernelSchema` over the production registry                                        | 2.4  |
| `e2e/delivery-plan.e2e.test.ts`                                     | The inventory document carries no external `$ref`                                                                                      | 2.4  |
| `unit/scripts/review-gate/policy/pre-publication-procedure.test.ts` | Drops `validateSchema: false`                                                                                                          | 2.5  |
| `e2e/review-cli-surfaces.e2e.test.ts`                               | Drops `strict: false` and `validateSchema: false` for the projection test's options                                                    | 2.5  |
| `integration/review-gate-workflows.test.ts`                         | The composition pin takes `registerDecomposeSchemas`                                                                                   | 2.6  |

## Folding a projected side

What `foldKernelSchemaClosure` meets in Zod 4.4.3's output under `reused: "ref"`, checked against the production
registry on both sides:

- Every reference is absolute and takes one of two forms: `urn:arc:schema:<id>` for a registered document, and
  `urn:arc:schema:__shared#/$defs/<name>` for a shared definition. No root carries its own `$defs`. The fold throws on
  any other form rather than guess at it.
- Zod's output reuses one JavaScript object at several positions. A fold that rewrites `$ref` in place over a
  structured clone, which preserves that sharing, rewrites an already-rewritten reference a second time; copy through
  a form that does not preserve object identity (a JSON round trip) before rewriting.
- Projecting a whole side of the production registry takes about 0.3 s, which the on-demand lookup pays once per
  call.
- With the tuple bounds, all 138 roots pass the 2020-12 metaschema and strict Ajv on both sides. Without them, nine
  roots fail on each side: empty tuples' `prefixItems` fail the metaschema, and fixed-length tuples without both
  bounds fail strict compilation.

## Provisioning-site failure and test seam

How every Phase 5 site runs the writer, checked against each site's rollback path:

- Every rollback D4 relies on is reached by a throw: `rollbackFreshSpawn` from `reconcileWorkUnitWorktree`'s catch,
  `rollbackSpawnFailure` from `establishReadyMarker`'s `try` around `createMarker`, `occupation-failed` from
  `prepareV3Operation`'s bare `catch`, and `rollbackColdStart` from `runColdStart`'s scaffold `try`. The writer returns
  a typed failure for `arc schema install`, so the sites call `writeEditorDocumentsOrThrow`, which throws an
  `EditorDocumentsWriteError` carrying `{target, path, detail}`. A refusal that keeps the underlying message (cold
  start's `could not scaffold the work unit: <message>`) then names what failed; `occupation-failed` drops it, as it
  does for any occupation failure.
- The sites share no dependency shape: `ReconcileWorkUnitWorktreeContext`, `NodeProvisioningRuntimeOptions`, the
  decomposition operation's dependencies, `SpawnWorktreeContext`, and each command's `io`. Each gains one optional
  `writeEditorDocuments` of the result-returning writer's type, which the site passes unresolved to
  `writeEditorDocumentsOrThrow` with its own `GitExec` and the node `EditorDocumentsFs`. Absent, the production
  writer runs; injected, a returned failure throws as a production one does. The writer's own behavior is tested
  once, with the writer.
- A transient checkout re-entered with its marker present skips `createMarker`, so re-entry does not refresh its
  documents; `arc schema install` is the refresh.

## Provisioning-site test inventory

Every existing test that reaches a Phase 5 insertion point, by the task that adds it, and the e2e test that hosts
each path's assertion. Paths are relative to `packages/arc-framework/__tests__/`.

A test, or a shared builder, that constructs the context carrying a site's seam injects a writer that does nothing,
so its pinned Git calls, scripted answers, and run time stay as they are. Only the new behavior tests run the
production writer, against a temporary repository, or inject a failing one. A test that reaches a site through a
composition root that builds the context itself, such as a handler or `buildExecutorContext`, runs the production
writer against its real repository; that changes only its run time. The built CLI runs the production writer in
every e2e test, and none asserts on ignored files, on the exclude file's contents, or on a listing of
`.arc/system/.internal/`.

| Test site                                                                                                                                 | Reaches the site through                                                                                                                                            | What the production writer would do there                                                                                                                                                                                                              | Task |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `helpers/integration.ts`'s `makeIOContext`                                                                                                | `runInit`, `runUpdate`, and `runJoin` in `integration/init.test.ts`, `update.test.ts`, `skills.test.ts`, `multi-clone.test.ts`, and every `initInTempRepo` consumer | Once a schema is marked, adds documents that `listFiles` reports, since it skips only `manifest.json` and `pristine.json` under `system/.internal/`: `init.test.ts`'s manifest inventory (:242) and `health-diff.test.ts`'s fresh-init case (:81) fail | 5.1  |
| `unit/init.test.ts` and `unit/join.test.ts`, each `mockIO`                                                                                | `runInit`, `runUpdate`, `runJoin`                                                                                                                                   | The scripted exec answers `""` to `rev-parse`, so the exclude path resolves to the fictional root and the node-backed write fails                                                                                                                      | 5.1  |
| `helpers/candidate-lineage-suite.ts`, `helpers/delivery-position-suite.ts`                                                                | `handleInit`, a composition root that builds the context itself                                                                                                     | Run time only                                                                                                                                                                                                                                          | 5.1  |
| `unit/work-unit/mutators/reconcile-work-unit-worktree.test.ts`'s `buildCtx`                                                               | `provisionSpawnedWorktree`                                                                                                                                          | A second `rev-parse --git-path info/exclude` breaks the pinned Git calls at :172, :274, :347, :384, and :416                                                                                                                                           | 5.2  |
| `integration/atomic-graduation.test.ts`                                                                                                   | the `provisionSpawnedWorktree` context it builds for `atomicGraduate` (:272)                                                                                        | Run time only                                                                                                                                                                                                                                          | 5.2  |
| `unit/commands/start.test.ts`'s `ctx(io)`, create-new cases                                                                               | `runCreateNew`, which passes `SpawnWorktreeContext`'s seam into the context it builds                                                                               | Run time only; the assertions tolerate an added call                                                                                                                                                                                                   | 5.2  |
| `integration/start-dispatch.test.ts`'s inline `runCreateNew` contexts (:197, :375, :474)                                                  | `runCreateNew`                                                                                                                                                      | Run time only                                                                                                                                                                                                                                          | 5.2  |
| `integration/start-dispatch.test.ts`'s `handleStart` and `buildExecutorContext` cases, `integration/park-resume-roundtrip.test.ts` (:116) | composition roots that build the context themselves                                                                                                                 | Run time only                                                                                                                                                                                                                                          | 5.2  |
| `integration/decompose-v3-repository-plan.test.ts`'s `repositoryDependencies`                                                             | both modes' `occupy` hooks                                                                                                                                          | Run time only, given the writer passes the checkout root as `cwd`: this test's `gitExec` falls back to the process's working directory, the developer's own checkout, when a call names none (:52)                                                     | 5.4  |
| `unit/commands/start.test.ts`'s `ctx(io)`, cold-start cases                                                                               | `runColdStart`                                                                                                                                                      | `recordingExec` answers `""` to every call, so the exclude path resolves to the worktree directory, the read fails, and the ten cases expecting `ok: true` (:148 onward) roll back                                                                     | 5.5  |
| `integration/start-dispatch.test.ts`'s inline `runColdStart` context (:442)                                                               | `runColdStart`                                                                                                                                                      | Run time only                                                                                                                                                                                                                                          | 5.5  |
| `integration/start-dispatch.test.ts`'s `handleStart --here` cases (:412, :428)                                                            | `handleStart`, a composition root that builds the context itself                                                                                                    | Run time only                                                                                                                                                                                                                                          | 5.5  |

No existing unit or integration test reaches Task 5.3's `createMarker`: `unit/locus/provisioning-runtime.test.ts`
covers rollback and primary checkout only, and `unit/locus/provisioning.test.ts` fakes `createMarker`.

Linked worktrees share the clone's `info/exclude`, so in an initialized repository `arc init` has already written the
pattern, and in the primary checkout the directory. The exclude helper appends only a missing line, so a test there
removes the schemas line from the exclude file, and the directory where it already exists, before the command; the
assertion then observes the command's own write. A new linked worktree starts without the directory.

| Path                         | e2e host                                                                                                                                       | What the assertion can show                                                                                                          | Task |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `arc init`                   | `e2e/init.e2e.test.ts`, fresh init (:69)                                                                                                       | The directory and the exclude entry                                                                                                  | 5.1  |
| `arc update`                 | `e2e/update.e2e.test.ts`, clean update (:25)                                                                                                   | Both, once the test removes the directory and the exclude line after init                                                            | 5.1  |
| `arc join`                   | A new `e2e/init.e2e.test.ts` case that clones an initialized repository and joins in the clone; no existing case joins a checkout lacking both | The directory and the exclude entry                                                                                                  | 5.1  |
| Work-unit spawn              | `e2e/rename.e2e.test.ts`, create-new (:381)                                                                                                    | The directory in the spawned worktree and the exclude entry, once the test removes the exclude line before `start`                   | 5.2  |
| Atomic graduation            | `e2e/lifecycle-exit.e2e.test.ts`, the started decomposition fixture (:439), whose `start origin --yes` graduates                               | The directory in the graduated worktree and the exclude entry, once the test removes the exclude line before `start origin`          | 5.2  |
| Transient spawn              | `e2e/locus-errand-roundtrip.e2e.test.ts`, `errand materialize` (:103)                                                                          | The directory in the materialized checkout and the exclude entry, once the test removes the exclude line before `errand materialize` | 5.3  |
| Transient primary allocation | `e2e/errand.e2e.test.ts`, the primary open before promotion (:1862)                                                                            | Both, once the test removes the directory and the exclude line before `errand open`                                                  | 5.3  |
| Decomposition                | `e2e/decompose-command-modes.e2e.test.ts`, execute (:496) and extract (:667)                                                                   | The directory in the candidate and the exclude entry: the fixture is not initialized                                                 | 5.4  |
| Cold start                   | `e2e/rename.e2e.test.ts`, `startInPlace` (:188)                                                                                                | Both, once the test removes the directory and the exclude line before `start --here`                                                 | 5.5  |
