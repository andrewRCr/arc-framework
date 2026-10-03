# Spec (`detailed` · `RFC`): Workspace-Aware Focused Tools and Test Builds

- **Origin:** [internal]
- **Purpose:** Make repository-root focused commands select the intended tests and run them against current,
  available runtime artifacts. Give focused lint the same repository-relative target convention.

---

## Introduction / Context

Root `package.json:scripts["test:unit"]` delegates through workspace npm without normalizing target paths. A
repository-relative test operand therefore reaches a package-cwd process unchanged. Nested npm parsing also makes
native test flags depend on extra separators. `vitest.config.ts:packageRoot` already pins the configured projects
to the package; `runLocalVitestTier` already composes Vitest parsing with an in-process controller, while
`withLocalHeavyTestAdmission` supplies the repository-common CPU slot.

Build preparation is a second part of that invocation contract. Integration `setup` builds fast; E2E `setup`
uses `selectE2EBuildCommand` and the outer npm lifecycle name to choose full versus fast builds. Their skip-build
branches check file existence. `baseOptions` cleans output and generates the schema before `writeDevBuildStamp`;
`fastOptions` disables declarations. `runFastDevBuild` and `promoteStagedDevBuild` provide staging and per-file
replacement, but not a shared lifetime boundary for all supported builders and subprocess-test consumers.

The chosen design composes dedicated root adapters, the configured Vitest projects, existing advisory locks,
staged publication, and native compiler metadata. Runtime builds and generated schemas serve tests. The separate
full-build gate continues to generate declarations. Selection, admission, preparation, and execution remain one
work unit: each is necessary to make the focused command's result reliable, and the build coordinator also serves
the existing builders.

## Goals

1. Select exact repository-relative test targets with native execution flags through one ordinary npm separator.
2. Preserve configured unit/unit-mocks placement and isolation defaults, plus package-local path conventions.
3. Prepare current runtime-plus-schema artifacts only when the selected projects need them, reusing qualified
   output when inputs are unchanged.
4. Hold those artifacts through supported integration/E2E controller completion, including cleanup.
5. Prevent a supported failed or unstable build from certifying a new successful generation; preserve an
   actionable retry route.
6. Keep focused lint paths predictable and retain declaration generation in the full-build quality gate.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- Generic argument rewriting for every root script or changing adopter CLI invocation.
- In-process CLI-harness performance work or changes to which tests assert process boundaries.
- Same-checkout build concurrency while supported subprocess tests run, per-run artifact snapshots, remote
  caching/services, or cross-machine cache portability beyond qualifying existing CI artifacts.
- Watch/browser/UI orchestration, source snapshots, editor locking, or change-and-revert isolation.
- ARC lifecycle placement, review/delivery records, storage contracts, shared user state, or new ARC config axes.
- Guarantees for unmanaged native tool invocations; direct Vitest setup remains a generation-only convenience.

## Proposed Design

### D1 — Focused root interfaces

Add root `test:file`, invoking a Node adapter directly without another npm parse. It accepts one or more existing
repository-relative files or directories beneath the package's unit, integration, or E2E test trees. Native
execution flags follow through the ordinary npm separator. Resolve target operands from the checkout root to
absolute paths before entering package cwd; never guess between repository-relative and package-relative spellings.

Use Vitest's public `parseCLI` for flag arity and values. Fix the package configuration and run mode. Reject
config/root overrides, alternate commands, source-related operands, and watch/browser/UI modes with an actionable
diagnostic. Native project filters may restrict the configured project set. Do not interpret arbitrary option
values as target paths.

Project configuration supplies isolation and worker defaults. Explicit supported native execution settings use
Vitest's native precedence, including `--isolate`/`--no-isolate`, pool, file parallelism, and worker-count options.
For example, `--no-isolate` deliberately overrides the `unit-mocks` isolation default. Execution overrides do not
relax project membership, exact-target validation, admission/artifact ownership, preparation, or D8's completion
rules. Preserve those adapter constraints even when a native option would otherwise permit a successful empty run
or ignored unhandled errors.

Adapt root `lint:ts:file` with explicit repository-relative targets before an optional adapter `--` delimiter.
Forward the following ESLint tokens unchanged to the installed ESLint CLI, executing in package cwd with normalized
targets. Option values retain native package-cwd semantics. Preserve package-local `lint:ts:file` and its suppression
behavior; preserve root `lint:md:file` and the existing Markdown fix helpers.

```bash
npm run -s test:file -- packages/arc-framework/__tests__/unit/template/recipe.test.ts -t "accepts a valid recipe"
npm run -s test:file -- packages/arc-framework/__tests__/integration
npm run -s lint:ts:file -- packages/arc-framework/src/lib/dev-check.ts
npm run -s lint:ts:file -- packages/arc-framework/src/lib/dev-check.ts -- --fix
npm run -s lint:md:file -- .arc/active/meta-workspace-tool-paths.md
```

### D2 — Discovery and controller lifetime

Create a public `createVitest` controller in package cwd and discover with `getRelevantTestSpecifications` before
requesting admission or a build. For `test:file`, constrain discovery to each exact named file or descendants of
each named directory. Every target must contribute an eligible selected specification; a valid target cannot mask
an invalid, excluded, or empty one. Empty discovery fails before admission or preparation.

Use discovered specification projects as the authority for unit/unit-mocks placement and heavy admission. Retain
configured project membership and isolation/worker defaults; apply explicit execution overrides under D1. Unit-only
selection takes neither the heavy CPU slot nor the artifact lease and requests no build. Any integration/E2E
selection takes the heavy slot, then the checkout artifact lease, and prepares runtime/schema output under that
ownership.

Supply qualified build evidence with the public controller `provide` API before global setup. Initialize reporting
through `standalone`, then execute the discovered specifications with `runTestSpecifications`. Close the same
controller in `finally` through D8 before releasing ownership. The controller process owns the leases throughout;
a parent wrapper around a separate controller process does not establish the required lifetime.

Existing run-mode tier scripts compose the same lifetime and preparation boundary while retaining their native
package-relative filters, project sets, excludes, and sharding. The exact-target/per-operand rule is specific to
`test:file`; broad tier commands retain their existing coverage. Explicit native watch invocation remains outside
this run-mode contract.

### D3 — Runtime preparation and setup evidence

Integration/E2E execution requires the runtime bundle and generated kernel schema, with qualified input evidence
from D6/D7. Unit execution requires neither. A qualifying full build may supply these runtime artifacts; fast
build evidence never proves declaration generation. Preparation expresses the required artifacts directly and
does not depend on the outer npm lifecycle name.

Both global setups read controller evidence through `getProvidedContext`, validate it against the checkout's
current runtime/schema evidence and required files, and use it without reacquiring ownership or invoking a nested
build. Invalid evidence prevents execution. Multiple heavy projects in one controller share the prepared generation.

Without controller evidence, direct Vitest setup may ensure runtime/schema output through the coordinator's build
ownership. That lease covers generation only and does not pin an unmanaged test run. Keep this limitation explicit
in developer command guidance.

`ARC_E2E_SKIP_BUILD=1` forbids generation in every preparation path. Require matching prebuilt evidence and required
files; file existence or the flag alone is insufficient. Missing or mismatched evidence fails with the concrete
build/download/installation remedy. Do not silently generate output in the skip-build route.

### D4 — One coordinator and two lock purposes

Route root/package `build` and `build:fast`, self-hosting refresh, and supported subprocess-test preparation through
one build coordinator. Explicit build commands always perform the requested build; reuse belongs to preparation.
An owning test controller requests builds under its existing artifact lease, without calling a public build
wrapper that reacquires the same lock.

Reuse `acquireAdvisoryLock` and the process-scope, renewal, exit-cleanup, and ownership-loss handling composed by
`withLocalHeavyTestAdmission`. Factor shared lifetime handling rather than introducing another lock protocol.
The repository-common slot remains CPU admission. The artifact lease is checkout-specific and sits beside the
package output, outside directories a compiler can clean. Lock order is CPU admission, then artifact ownership.

Supported integration/E2E controllers retain artifact ownership through execution and closing. Manual builds in
that checkout wait, report the owning operation, and remain cancellable. Builds in another worktree use separate
artifact ownership. CI and `ARC_TEST_ALLOW_CONCURRENCY=1` bypass CPU admission only; artifact ownership remains.

Compile asynchronously so the actual owner can renew while the compiler child runs. A compiler child writes only
unique staging output. Only a coordinator retaining confirmed ownership may publish; a dead or ownership-losing
controller cannot leave a child that promotes into live `dist`.

### D5 — Stable generation and staged publication

Use the existing staging-directory override and entry-file replacement substrate. Keep live `dist` outside the
compiler child's clean/output target. A full build must finish declaration generation before publication; a fast
build generates runtime/schema output without declaration proof.

Before starting the compiler child, capture the rich path inventory from D7 and a content map of all first-party
source plus configuration/install inputs. After generation, obtain actual CLI/schema/build dependency sets,
require their inputs to have been present in the baseline, and compare pre/post inventories and content maps.
Use baseline digests and inventory in the generated evidence. Observed changes discard staging and ask for a rerun
once inputs settle; do not publish the mixed-input result or retry indefinitely.

Validate required staged output, promote ancillary files and the complete CLI entry using the per-file machinery,
finish required output cleanup, and publish freshness evidence last. This is not an atomic transaction over the
whole output set. Excluding supported artifact consumers during publication supplies the required consistency.
Do not admit tests after failed compilation, output validation, or promotion. A failed compile leaves the prior
live entry available; incomplete publication provides an actionable retry route. A later invocation rechecks live
evidence and required files before reuse or rebuilding.

The interval check assumes inputs remain stable during generation and tests. It observes changes between the
baseline and final check; it does not freeze an editor or detect every change-and-revert sequence.

### D6 — Two input identities and actual producer graphs

Regenerate one local build-stamp record with distinct runtime CLI and runtime-plus-schema input identities. The
runtime identity covers actual first-party CLI inputs and shared compilation/configuration context. The test
identity adds schema-only producer source dependencies. An ordinary schema-only source-content edit does not make
an otherwise current CLI stale. Shared resolver controls in D7 conservatively contribute to both identities.

Capture producer graphs from actual native bundler/loader metadata. CLI inputs come from its native compiler
metadata. Schema/build-control roots cover `createProductionSchemaRegistry`, `writeKernelSchemaArtifact`, both
tsup configs, and the new build adapter/coordinator. `bundleRequire`, used by tsup's `loadTsupConfig`, returns
resolved input paths through `dependencies`; the config loader itself discards that field, so collection must
retain it at the producer seam. Scope shared compilation controls to both identities and schema-only producer
source inputs to the test identity.

Retain actual first-party JS, TS, and JSON inputs and exclude installed-library inputs from that source set.
Use TypeScript's `readConfigFile` and `parseJsonConfigFileContent` for configuration and extends chains; its
type-oriented module graph does not replace the runtime graph. Metadata supplies consumed source paths; D7 supplies
resolver controls that metadata omits. Normal reuse hashes recorded selected contents and D7 evidence without
resolving or bundling a compiler program on every invocation.

The record must distinguish its format, dependency sets, both input identities, and the published artifact
qualification. Treat old, malformed, or unusable graph evidence as unqualified and regenerate; add no compatibility
reader for this unpublished disposable cache. Runtime qualification does not discharge the full-build quality gate.

### D7 — Configuration, membership, and loader-control identity

Include in both identities the relevant TypeScript configuration/extends chain, both root/package manifests, root
`package-lock.json`, npm installed resolution metadata, and the actual Node/platform/architecture and installed
build-tool identities. Use repository-relative source keys and contents; do not derive identity from mtimes or
the checkout's absolute location. Output-directory location and unrelated ambient environment are not semantic
inputs under `baseOptions`.

Maintain a sorted inventory of first-party source/config paths: the package `src` tree, source/config filenames
in repository/package roots, and first-party configuration-source locations used by producer roots, including
JS/TS/JSON candidates. Record filesystem entry kind and each link's raw target text with `lstat`/`readlink` before
following it. Include traversed directories so directory links are covered along with file links. Native metadata's
resolved target paths do not substitute for link identity. Exclude live/staged output, leases, and installed
dependency contents.

Hash every first-party `package.json` in those inventoried locations as shared resolver configuration, including
manifests absent from native input metadata. Membership additions/removals, entry-kind changes, internal link
retargeting, or those manifest edits invalidate reuse and require refreshed actual graphs. Unrelated path/link
changes and unused manifest edits may conservatively invalidate both identities. Unrelated ordinary source-content
edits retain reuse because ordinary source contents remain scoped to each producer identity.

Include these controls in D5's baseline, pre/post comparison, and published evidence. Neither path membership alone
nor native input metadata alone supplies complete loader-control identity.

The dependency contract is normal npm-managed installed contents. Lockfile plus installed resolution/tool identity
does not identify arbitrary hand-edited installed bytes. Missing install evidence prevents reuse and names the
installation/build repair. In-place dependency edits or external source links without an identity change require
an explicit build and remain outside automatic reuse; do not hash all of `node_modules` to support them.

### D8 — Completion and failure policy

Preserve native setup, collection, and execution failures and their diagnostics. After successful collection,
zero completed cases is non-passing, including an unmatched name filter or an all-skipped selection. Do not replace
an existing failure with an empty-filter explanation. Name filtering occurs after artifact preparation, so an
empty case result does not establish that no build was required.

All supported controllers close through a scoped adapter. Observe public `logger.error` during `close`, forward
every call unchanged, and restore the method in `finally`. A rejected close or an error logged during closing makes
the run non-passing. After closing, read public `state.getUnhandledErrors`; a nonempty final list also makes it
non-passing with diagnostics retained. Preserve every existing nonzero status before releasing ownership.

Installed `Vitest.close` can swallow and log cleanup failures. `PoolRunner.stop` can record worker teardown errors
through `StateManager.catchError` after `Vitest.runFiles` has already checked unhandled state. Awaiting close alone
therefore does not establish cleanup success. Keep closing/status handling common to the supported controller paths.

### D9 — Script, CI, and guidance composition

Update both manifests and the run-mode adapters together so existing broad tier coverage and native package-relative
filters remain intact. Supported root/package run-mode scripts use the controller boundary above; the new exact
root helper supplies D1/D2's stricter target contract. Preserve the native watch convenience outside this boundary.
Keep direct compiler entry internal to the coordinator to avoid recursive public-wrapper acquisition.

CI artifact upload/download must retain the regenerated evidence with runtime/schema output. A prebuilt consumer
must have matching input and installation/tool/runtime context; prepare artifacts in a matching context when the
existing route cannot supply them. Keep the existing full-build/declaration gate. `ARC_E2E_SKIP_BUILD=1` remains
a prohibition on generation and never relaxes qualification or artifact ownership.

Update focused examples and operand guidance in `QUICK-REFERENCE.md` and `DEV-RULES.PROJECT.md`. Distinguish root
target operands, package cwd, forwarded option values, supported controller lifetime, and direct native convenience.
Declare development-tool imports at the owning dependency boundary without adding production CLI dependencies
solely for repository build tooling. No adopter invocation or ARC operational-state change is part of this work.

## Alternatives & Rationale

- **Generic normalization:** would require identifying path operands for unrelated tools and expands the
  compatibility surface. Dedicated helpers give the focused commands an explicit contract.
- **Direct Vitest shell composition alone:** supplies root paths and flags but misses the established admission
  and controller-owned artifact lifetime.
- **Always rebuild:** repeats generation and still needs coordinated publication to protect consumers. Qualified
  reuse plus ownership addresses both costs and availability.
- **One all-source content fingerprint:** invalidates on unrelated source edits. Actual producer source graphs,
  rich inventory, and shared resolver controls preserve ordinary content selectivity while covering native
  resolution changes; conservative manifest invalidation avoids custom resolver tracing.
- **Per-run snapshots:** permit concurrent same-checkout publication but introduce per-run paths, source-guard
  semantics, and cleanup. Queue builds while the supported controller owns its artifacts.

## Cross-cutting Considerations

- **Compatibility and user impact:** Root focused targets use repository-relative spelling and one ordinary npm
  separator. Package-local targets and broad command coverage remain native. Default isolation/worker settings
  come from project config; explicit supported execution overrides retain native precedence. Ordinary E2E preparation
  changes to runtime/schema requirements; declaration verification stays separate. Unsupported fixed-interface modes
  fail clearly, and direct native invocation retains its stated convenience boundary.
- **Performance:** Unit-only runs avoid build and heavy admission. Reuse checks selected contents and inventory;
  broad content comparison and producer graph capture occur during generation. Manual builds may wait behind a
  controller in their checkout; other worktrees retain independent artifact ownership.
- **Isolation and safety:** Retain configured unit/unit-mocks placement and fixture defaults under D1's native
  override policy. Validate target containment and required artifact evidence. Keep lock metadata diagnostic,
  cache/staging/lease state disposable, and compiler output confined to staging until its owner publishes.
- **Portability:** Compose the current Node/npm/workspace and filesystem primitives. Verify package cwd and literal
  option forwarding, file replacement, cancellation, and ownership behavior on the project's supported platforms.
  Test symlink-dependent identity where the platform permits creating the relevant links.
- **Verification:** Use focused boundary tests for parsing/selection and identity, public controller probes for
  completion failures, and disposable subprocess overlap tests for ownership, publication, and recovery. Prove
  successful continuation after each material recoverable refusal. Preserve the full-build declaration gate.
- **Rollout:** Change supported writer/consumer routes together; regenerate old local evidence. Do not introduce
  cache migration readers or a new ARC configuration/state family.

## Success Criteria

- **SC1 — Exact focused selection:** A repository-relative test file plus `-t` through one npm separator runs
  exactly the selected case. Multiple targets contribute specifications; invalid, excluded, or empty operands
  fail before admission/build. Native flag values retain their spelling.
- **SC2 — Project composition:** Unit/unit-mocks placement and isolation/worker defaults follow config. Verify
  default `unit-mocks` isolation and deliberate `--no-isolate`, pool, file-parallelism, and worker-count overrides
  with native precedence; project membership and adapter constraints still hold. Unit-only selection takes no heavy
  slot or artifact lease and requests no build. Integration/E2E and mixed selections use actual discovered projects,
  acquire in the required order, and retain ownership through closing. Existing broad/native tier coverage remains.
- **SC3 — Focused lint:** Root TypeScript targets work with the documented optional delimiter and preserve package
  suppression/option-value semantics. Markdown's retained literal helper lints exactly the named file.
- **SC4 — Runtime policy:** Integration and ordinary/focused E2E prepare runtime plus schema regardless of outer
  lifecycle name. A qualifying full build is reusable; fast preparation provides no declaration evidence. The
  separate full-build gate still generates declarations and fails when declaration generation fails.
- **SC5 — Reuse:** A second supported subprocess run over qualified unchanged inputs reuses output. Selected runtime
  or schema edits, relevant configuration, install/tool/runtime context, or membership changes invalidate it.
  Ordinary schema-only source-content edits retain CLI freshness; unrelated ordinary source-content edits retain
  selective reuse.
- **SC6 — Resolver controls:** Adding a JS sibling refreshes a resolution-changing graph; later edits to the consumed
  sibling invalidate reuse. Internal file/directory link retargeting, same-content entry-kind replacement, and
  nested first-party manifest edits invalidate even when old consumed digests and membership stay equal. An unused
  manifest edit may conservatively invalidate both identities.
- **SC7 — Generation interval:** Observed source/config/install or rich-inventory changes during generation discard
  staging and prevent certification. Stable inputs on a subsequent invocation build successfully. Evidence uses
  baseline digests and control identity, including inputs absent from native metadata.
- **SC8 — Same-checkout overlap:** A manual supported build queues while an integration/E2E controller owns artifacts;
  tests retain their generation through closing. Another worktree's build remains independent. CI and concurrency
  bypasses leave artifact ownership enforced.
- **SC9 — Owner loss and publication:** A dead or ownership-losing controller's compiler child cannot publish live
  output. Failed compilation retains the previous entry. Invalid staged output or incomplete promotion prevents
  the requested test execution; a repaired subsequent build/preparation succeeds with qualified live evidence.
- **SC10 — Skip-build and setup:** Matching prebuilt evidence permits execution without generation or nested lock
  acquisition. Missing/mismatched evidence fails with a concrete remedy; repairing the artifact/install context
  restores execution while skip-build still forbids generation. CI consumers retain the same contract.
- **SC11 — Completion:** Swallowed/logged close errors and worker errors recorded only in final state make a passing
  case run non-passing. Clean closing permits success and preserves an existing failure status. Zero completed cases
  fail; native setup/collection failures retain their diagnostics instead of being replaced by an empty-filter error.
- **SC12 — Command documentation:** Examples use the root operand contract, native option-value base, and supported
  runtime/artifact lifetime. Broad and package-local command behavior remains documented accurately.

## Open Questions

No settle-able design decision remains. Module/file organization, exact record field names, and deterministic
fixture placement are implementation details bounded by the contracts above.

## Amendments

None.

---
