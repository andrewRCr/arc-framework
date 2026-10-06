# Workspace Tooling Reference Notes

## Baseline Observations — 2026-10-03

- Root `package.json:scripts["test:unit"]` delegates to npm in the workspace. Passing the repository-relative
  `packages/arc-framework/__tests__/unit/template/recipe.test.ts` finds no files; passing
  `__tests__/unit/template/recipe.test.ts` runs 32 tests. With the package-relative path, one npm separator followed
  by `-t` runs all 32, while an additional separator preserves the filter and runs one.
- `createDevCheckDeps`, `selectBundleInputs`, and `hashSourceInputs` establish freshness from the previous CLI
  bundle's first-party TypeScript graph. `writeDevBuildStamp` hashes files after generation. The current stamp
  omits build configuration and dependency identity, and can certify changed source that a compiler read earlier.
- Installed `esbuild.build` can resolve an unchanged `./dep.js` import to `dep.ts`, then to newly added `dep.js`.
  A disposable probe changed the bundle while the old input digests stayed unchanged. TypeScript's `createProgram`
  still selected `dep.ts` with both files present; tsup's `loadTsupConfig` uses `bundleRequire`, whose esbuild
  metadata exposes the runtime-resolved input paths through `dependencies`.
- `esbuild.build` records a symlink's resolved source in its input metadata, and `bundleRequire.dependencies`
  inherits those paths. Retargeting an internal link can change output while the old input digests and path
  membership stay unchanged. `esbuild.build` also consumes nested `package.json` resolver controls such as
  `sideEffects` without listing those manifests as inputs; changing that field can change emitted runtime effects.
- `createProductionSchemaRegistry` composes schema families outside the CLI entry graph. The current CLI metafile
  does not include `src/production-schema-registry.ts`; a CLI-input stamp alone cannot establish schema freshness.
- Vitest's public `createVitest`, `getRelevantTestSpecifications`, `standalone`, and `runTestSpecifications` support
  discovery followed by execution in the same controller. A source-grounding probe ran exactly one recipe case and
  exposed root `provide` evidence through the selected project's `getProvidedContext`, with package cwd retained.
  A second probe with an unmatched name filter reported 32 skipped cases and native exit zero; empty filename
  selection and zero completed cases need distinct handling.

---
