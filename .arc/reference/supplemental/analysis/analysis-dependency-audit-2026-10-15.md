# Development Dependency Exposure — 2026-10-15

Assessment of the dependency graph at `e78a193203a69d7d6057324ae80c0b2a50565f59`, using Node.js 26.3.0 and npm 11.16.0.
Package manifests, the lockfile, and install-script policy remain unchanged. This is a dated assessment of the
repository's use of the reported dependencies, not a claim that development dependencies are harmless.

## Audit reconciliation

The saved 2026-10-14 report lists 15 vulnerable-package entries: 6 high and 9 low. These entries derive from three
advisories, rather than 15 independent vulnerabilities. Fresh installed-tree and lockfile-only audits both list
9 entries: 5 high and 4 low. The production-only audit lists zero. Exit 1 from the two full audits means findings
remain; it is not a command failure or a clean result.

All nine currently flagged packages also appear in the saved report: `braces`, `esbuild`, `fast-glob`, `globby`,
`katex`, `markdownlint`, `markdownlint-cli2`, `micromark-extension-math`, and `micromatch`. Six propagated entries are
no longer flagged: `@vitest/mocker`, `bundle-require`, `markdownlint-cli2-formatter-default`, `tsup`, `vite`, and
`vitest`. Those dependencies remain installed. No dependency changes here account for the count difference, and its
precise cause has not been established; the three underlying advisory conditions remain in the graph.

The unchanged lockfile's SHA-256 is `86d0cd0040bf29ed2b9bc33b7944826fb9a665f8c0734c8a27032e3932c9281e`.
Every affected package is development-only in that lockfile. The CLI's declared production graph audits clean, and
the built CLI metafile contains neither inputs nor external imports from braces, esbuild, or KaTeX. This bounds the
assessment to the current graph and bundle, without treating development or CI execution as a trusted exemption.

## Braces: development and CI availability

[GHSA-vfj7-8cjw-p6xm][braces-advisory] affects braces through 3.0.3, with no published patched version at this
snapshot. The locked version is 3.0.3. It is reached through `markdownlint-cli2` → `micromatch` → `braces`, and
through the CLI's `globby` → `fast-glob` → `micromatch` chain. These account for the five current high entries.

The vulnerable operation recursively processes brace patterns. A bounded child-process probe on the locked package
completed at depth 4,000 but raised `RangeError: Maximum call stack size exceeded` at depth 4,999, within the package's
input-length limit. The defect is reproducible; no hostile pattern was run in the parent process.

Repository linting uses selected file operands and configured patterns. The current `.markdownlint-cli2.jsonc`
contains ordinary fixed globs and ignores; the worktree wrapper supplies `--no-globs`, but ignore patterns and
explicit pattern operands can still reach glob processing. The flag does not disable every use of micromatch.
A pathological supplied or repository-configured pattern can therefore fail a developer or CI lint process.
There is no network-facing ARC service accepting these patterns, but the availability risk is retained, not dismissed.

Disposition: retain the locked tooling pending a compatible upstream fix. Registry metadata still identifies 3.0.3
as the latest braces release. npm's suggested `markdownlint-cli2` 0.0.4 is a downgrade outside the pinned 0.23.3
contract; it is not an accepted repair for the current lint interface. Reassess when a patched compatible pattern
engine or CLI release is available, or the source of accepted patterns changes.

## Esbuild: Windows development-server file reads

[GHSA-g7r4-m6w7-qqqr][esbuild-advisory] concerns Windows development-server path traversal and is patched in 0.28.1.
The affected locked copy is 0.27.7. The separate copy used by `tsx` is already 0.28.1.

The package declares esbuild `^0.27.7`; locked `tsup` 8.5.1 requires `^0.27.0`. Neither range admits 0.28.1.
`bundle-require` accepts `>=0.18`, and Vite accepts either 0.27 or 0.28, but those permissive peers do not relax the
two narrower requirements. Updating only the direct dependency would leave tsup able to retain an affected copy.
The latest published 0.27 release is 0.27.7; tsup 9.0.0 uses esbuild `^0.28.2`, requiring a build-tool major upgrade.

`src/lib/build-producers.ts` loads configuration through `bundleRequire` and compiles through tsup's `build` API.
`tsup.config.ts` configures a bundle and declarations. No first-party build configuration or script invokes esbuild's
`serve()` API or configures `servedir`. The vulnerable server operation is not used by these build paths.

Disposition: retain the current build-tool versions. The reported server exposure is not reached by the inspected
paths; the affected package remains installed. A future Windows esbuild server must use a patched release, and a
build-tool upgrade must check the complete resolved graph rather than replacing only the direct copy. Do not force
an out-of-range transitive override merely to clear the audit count.

## KaTeX: renderer trust after prototype pollution

[GHSA-238p-pmpm-9mq7][katex-advisory] is patched in 0.18.2. It requires existing prototype pollution or attacker
control of an options prototype; exploitation of generated links also requires publishing the renderer's output
without a separate sanitizer. The advisory does not say KaTeX itself creates the initial prototype pollution.

The locked 0.16.47 copy comes through `markdownlint` → `micromark-extension-math` 3.1.0, which requires `katex ^0.16.0`.
Both installed markdownlint versions, 0.40.0 and 0.41.1, use that extension. The latest extension still requires the
same KaTeX range, whose latest published version is 0.16.47; the patched 0.18.2 is outside it.

Both markdownlint parsers import the extension's `math()` tokenizer. They do not invoke `mathHtml()`, whose
implementation calls `katex.renderToString`. A probe replaced `renderToString` with a throwing counter before
importing each markdownlint API, then linted a math document through both versions: neither made a rendering call.
The current lint path therefore lacks the HTML-rendering operation involved in this advisory.

Disposition: retain the locked lint dependencies pending a compatible upstream release. A forced KaTeX override
crosses the extension's declared compatibility range; npm's suggested markdownlint 0.36.1 instead removes later lint
behavior through a downgrade. Neither is a compatible security update. Reassess if this dependency is used to render
HTML, or upstream publishes a compatible patched dependency chain.

## Verification and disposition boundary

Commands used for the snapshot:

```bash
npm audit --json
npm audit --package-lock-only --json
npm audit --omit=dev --json
npm audit fix --dry-run --ignore-scripts --json
```

The compatible-fix dry run added or removed no packages and left all nine entries. Its only reported change was a
same-version lefthook 2.2.1 reinstall; no package manifest or lockfile bytes changed. No force fix, downgrade,
out-of-range override, or install-script-policy change was applied.

The retained exposure is development/CI availability from hostile brace patterns, with the esbuild server and KaTeX
renderer conditions absent from the inspected execution paths. Accepting these dispositions does not make the audit
green. Re-evaluation is warranted by compatible fixes, changed usage, new advisory conditions, or a changed dependency
graph; production-only audit success alone does not settle those questions.

---

[braces-advisory]: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
[esbuild-advisory]: https://github.com/advisories/GHSA-g7r4-m6w7-qqqr
[katex-advisory]: https://github.com/advisories/GHSA-238p-pmpm-9mq7
