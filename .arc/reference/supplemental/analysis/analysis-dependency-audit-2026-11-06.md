# Dependency Exposure — 2026-11-06

Assessment at `fda47a1fbfc77ca0a1fe231a31542e57f1e5be75`, using Node.js 26.3.0 and npm 11.16.0. The lockfile
SHA-256 is `e020e6e749630b388998b040564a6fc49b9b3bc4041fd2248c88bb2ccdd2a4a4`. Package manifests, the lockfile,
and install-script policy are unchanged. **Disposition owner:** andrew. **Assessment date:** 2026-11-06.

This snapshot supplements the [October assessment][previous-assessment], which remains the record of its accepted
braces, esbuild, and KaTeX dispositions. It replaces that snapshot's graph-wide conclusions for the current graph:
Zod is an affected production dependency, and repository Markdown reaches affected development-tool parsing paths.
Recording an update candidate does not apply it or make the installed version safe.

## Audit reconciliation

Fresh default and lockfile-only audits both report 28 vulnerable-package entries: 3 high, 17 moderate, and 8 low.
Those entries propagate **19 distinct advisories**, rather than 28 independent vulnerabilities. The production-only
audit reports one high entry, Zod. Each audit exits 1 because findings remain; none is a clean result or a command
failure. Default and lockfile-only agreement is not independent verification of the physical installation.

The saved November 6 capture reports 22 package entries: 3 high, 14 moderate, and 5 low. Its 19 advisory URLs and
vulnerable ranges exactly match the fresh report. The changed propagation counts do not establish six new
vulnerabilities, and their cause has not been established. Braces remains locked at 3.0.3 but is absent from this
snapshot's audit output; that absence does not establish a repair or revoke its earlier retained-risk disposition.

The current CLI bundle's metafile lists Zod as an external import. It contains no inputs or external imports from
markdown-it, fast-uri, minimatch, Vitest, Vite, braces, esbuild, or KaTeX. This distinguishes the shipped CLI from
repository tooling; development and CI execution still require their own exposure assessment.

## Zod: production and local-process availability

[GHSA-mrhx-c7xc-m3w5][zod-advisory] affects locked Zod 4.4.3 and is patched in 4.6.6. The CLI declares `zod ^4.4.3`
as a production dependency. Large invalid collections can accumulate validation issues and exhaust memory; a schema
maximum is not necessarily an input-size guard before that work.

There is a concrete first-party boundary. `src/handlers/delivery-execution.ts` reads JSON from a supplied file or
stdin without a byte cap, decodes it, then calls the selected request schema's `safeParse`. Its review-fix continuation
schema has `recordEffects: z.array(...).max(2)`. A small probe against an equivalent schema supplied 100 invalid
records and produced 201 issues, including the size error. This confirms that the maximum does not prevent per-item
issue accumulation in the locked version; it is not an out-of-memory test or an estimate of the failure threshold.

Local persisted data is another boundary: `src/lib/store/projection/index-file.ts` reads and decodes the projection
index before validation, and `index-schema.ts` constrains each `tripwires` array to nine values. Byte limits on some
identity records do not protect these different readers. These are CLI/file/local-state inputs; the inspected code
establishes no unauthenticated network service, and this is not a claim that every runtime schema is exploitable.

Disposition: prioritize a separate compatible Zod update to at least 4.6.6. Until it lands, retain the availability
risk from oversized invalid JSON and local-state input explicitly; do not use `.max(...)` as proof of bounded
validation cost. The declared range admits the patch. This assessment adds no input-limit mechanism or schema change.

## markdown-it: repository-input parsing availability

Locked markdown-it 15.0.1 is a direct pinned development dependency and the exact dependency of markdownlint-cli2
0.23.3. The three advisories have different conditions:

- [GHSA-r7fv-28h4-cvq7][markdown-smartquotes] needs `typographer: true`; 15.0.2 fixes it. Both inspected first-party
  constructors leave the default `typographer: false`, so that smartquotes condition is absent.
- [GHSA-vfgh-jcmw-g37q][markdown-html] concerns quadratic inline HTML parsing with `html: true`; 15.0.3 fixes it.
  Both first-party constructors enable HTML, so repository text reaches the affected parsing rule.
- [GHSA-gfr2-rv44-r23c][markdown-reference] concerns multiline unclosed link-reference parsing under default options;
  15.0.3 fixes it. The reference rule remains enabled. Calling `parse` rather than `render` does not avoid this
  parsing-time work.

`src/scripts/lint-markdown-underwrap.ts` constructs `new MarkdownIt({ html: true })` for the custom underwrap rule.
`src/lib/markdown/prose-transform.ts` uses the same options for explicit repository prose formatting, reached through
`format-plan.ts` and the `format:prose` script. Both parse repository Markdown, including proposed contributions.
The current CLI bundle does not include these helpers. No large timing or hostile-document probe was run; these
are source-based reachability conclusions, not a measured denial-of-service threshold.

Ordinary built-in markdownlint rules use micromark. CLI2's HTML-enabled MarkdownIt factory is lazy, and this
repository's CLI2 configuration has no custom rules. That fact does not exempt the separate underwrap invocation,
which explicitly supplies its custom rule and parser factory.

Disposition: retain the identified development/CI availability risk pending a separate coordinated parser/tooling
update. A direct change to 15.0.3 would require changing the root's exact pin and would leave CLI2's exact 15.0.1 copy
eligible to remain installed. Registry metadata lists CLI2 0.24.0 with markdown-it 15.0.3 and markdownlint 0.42.0; no
0.23 release removes the exact affected parser pin. That tooling change crosses the current pinned contract and
needs its own compatibility validation, including the parser-version integrity check. Do not suppress findings or
infer that a single direct parser update repairs the complete graph.

## Vitest and Vite: optional server and browser boundaries

The CLI workspace's development dependency `vitest ^4.1.8` resolves to Vitest 4.1.11, which requires mocker 4.1.11
exactly and admits Vite through `^6.0.0 || ^7.0.0 || ^8.0.0`. Locked Vite is 8.3.1.

The two mocker advisories are [manual mock registration injection][vitest-manual] (`GHSA-qxg6-89mg-rqv8`) and
[Windows redirect traversal][vitest-redirect] (`GHSA-xp26-3454-mjgp`), both patched in mocker 4.1.12. They concern the
public mocker/interceptor plugin's WebSocket registration and generated browser modules or redirected file reads.
No first-party use of those public plugins was found. Normal Node Vitest installs hoisting and automocking plugins,
which are distinct from that interceptor; ordinary Node mocking alone does not establish these conditions.

The Vite advisories affecting 8.3.1 are all patched in 8.3.3:

- [GHSA-698v-4r3x-3vcv][vite-editor-percent]: Windows editor arguments fail to escape percent expansion.
- [GHSA-r825-w8mm-5pxw][vite-editor-flags]: special filenames become editor command-line options, including a WSL
  condition in Vite's editor flow.
- [GHSA-587h-7wmj-h5pm][vite-editor-exists]: a Windows path interpretation bypass removes the editor existence-check
  prerequisite and can combine with the percent-expansion defect.
- [GHSA-9jrq-w75r-8gcw][vite-html]: custom HTML middleware can execute cross-origin scripts when an unchanged browser
  URL reaches `transformIndexHtml`, the page has an inline module, and browser-side capabilities are sensitive.
- [GHSA-rq7h-c2jc-7f22][vite-paths]: exposed non-Windows serving can disclose host files when imported project paths
  collide with absolute host paths and the files escape the deny rules.
- [GHSA-vfpm-58rq-9qcg][vite-wasm]: Wasm requests can expose a file's first four bytes through the development server.

`src/lib/local-vitest-runner.ts` and `vitest-discovery.ts` use the Node controller with run/related mode and disable
watch for run mode. The project configuration enables no API, UI, browser project, host exposure, or custom HTML
transformation. In the installed Vitest code, absent API/UI becomes Vite middleware mode, WebSockets are disabled,
and listening requires an API port. Vite creates no HTTP server in that middleware mode. It still assembles
middleware, including editor handling; absence of a listener is the relevant boundary, not absence of middleware.

Disposition: no reachable first-party path for these server/browser conditions was established in the normal test
configuration. Retain that bounded assessment while identifying separate compatible updates: Vitest 4.1.12 carries
mocker 4.1.12, and Vite 8.3.3 fits Vitest's declared range. A Vite 8.3.2 update would remain affected. Review the actual
resolved graph after either change. Forwarded `--api`/`--ui` options, a new public mocker plugin, or changed server
configuration reopen this assessment; development-only status does not itself provide the exemption.

## fast-uri: test-schema identifiers

Locked fast-uri 3.1.8 comes through development-only Ajv 8.20.0, whose range is `^3.0.1`. Version 3.1.9 fixes all four
reported conditions:

- [GHSA-w74x-v6f9-j3xg][uri-scheme]: percent-decoded schemes can disagree with a prior raw-string policy check.
- [GHSA-xhq7-xmqj-769h][uri-relative]: relative-path normalization can change later resolution or equality.
- [GHSA-wjr9-j795-jxcr][uri-host]: unchecked WHATWG canonicalization can change the host a consumer checked.
- [GHSA-333x-w4r6-6crp][uri-suffix]: non-default suffix-reference serialization can emit a live scheme.

Ajv invokes fast-uri while compiling and resolving schema identifiers. The inspected first-party Ajv use is in
schema tests, including `__tests__/unit/validation-surfaces/projection-fidelity.test.ts`, which compiles the registered
schema bundle and looks up generated `urn:arc:schema:*` identifiers. No production Ajv/fast-uri import, URL rendering,
network destination policy, or suffix-reference option was found. These statements concern the observed consumers,
not every possible Ajv configuration or attacker-authored schema.

Disposition: the reported scheme/host/policy conditions are not established for the fixed first-party schema-test
inputs. Record a separate compatible transitive refresh to at least fast-uri 3.1.9; its parent range admits it.
Reassess if arbitrary schemas, references, network destinations, or rendered URLs enter this path.

## minimatch: optimization-level boundary

[GHSA-g3hv-75wg-m249][minimatch-advisory] affects locked minimatch 10.2.6 and is patched in 11.0.1. The amplification
branch requires `optimizationLevel >= 2`; minimatch defaults to level 1. ESLint and config-array pass `dot: true`,
typescript-estree passes `dot: true`, and the inspected SonarJS callers use default, negation, case, or basename
options. None selects optimization level 2 or changes the minimatch defaults.

Repository-configured glob patterns and explicit ESLint pattern operands can reach these consumers. A filename that
is merely matched is not itself an amplifying pattern. The known lint paths retain level 1 and do not enter this
advisory's level-2 preprocessing branch; this does not establish safety for arbitrary additional consumers.

Disposition: retain the current lint graph with this condition absent in inspected callers; reassess on option or
consumer changes. ESLint, config-array, typescript-estree, and SonarJS constrain minimatch to major 10, so 11.0.1 is
outside those contracts. The currently published ESLint and SonarJS metadata still require major 10. Do not force a
major override to clear the count; wait for compatible upstream adoption or validate a separate tooling upgrade.

## Previously assessed advisories

[Esbuild GHSA-g7r4-m6w7-qqqr][esbuild-advisory] still matches build-tool esbuild 0.27.7. The separate tsx copy is
0.28.1. Build producers use `bundleRequire` and tsup's build API, not esbuild's Windows development server. The direct
`^0.27.7` and tsup 8.5.1's `^0.27.0` still exclude the patched 0.28.1. Carry the October disposition; tsup 9.0.0's
new esbuild range remains a separate build-tool upgrade rather than an in-range repair.

[KaTeX GHSA-238p-pmpm-9mq7][katex-advisory] still matches 0.16.47 through markdownlint's math extension 3.1.0. The
inspected markdownlint path uses the tokenizer, not `mathHtml`/`renderToString`; the affected rendering condition
remains absent. The current extension still requires `^0.16.0`, excluding patched 0.18.2. Carry the October
disposition rather than opening an unchanged finding. Neither this nor the unflagged braces entry means a package
was removed or patched.

## Update and verification boundary

The separate compatible candidates are Zod 4.6.6 first, Vitest 4.1.12, Vite 8.3.3, and fast-uri 3.1.9. Markdown-it
15.0.3 needs coordinated pinned-tooling changes; minimatch 11.0.1 needs upstream adoption or a validated tooling
change. Version/range compatibility is not evidence of passing project checks. npm's `fixAvailable` values alone
are not the compatibility decision: registry metadata and parent requirements were inspected directly.

Evidence commands for this snapshot:

```bash
npm audit --json
npm audit --package-lock-only --json
npm audit --omit=dev --json
npm ls vitest @vitest/mocker vite fast-uri ajv markdown-it minimatch zod braces esbuild katex --all --json
npm view <package>@<patched-version> version engines dependencies --json
```

The installed-source and first-party checks above were read-only. The Zod probe used only 100 records; no
out-of-memory, hostile server, or large Markdown benchmark was run. This assessment neither suppresses audit output
nor satisfies required checks. Retained risk stays visible until an independently validated dependency change or
changed input boundary removes it; compatible updates, changed usage, and new advisory conditions reopen triage.

---

[previous-assessment]: analysis-dependency-audit-2026-10-15.md
[zod-advisory]: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
[markdown-smartquotes]: https://github.com/advisories/GHSA-r7fv-28h4-cvq7
[markdown-html]: https://github.com/advisories/GHSA-vfgh-jcmw-g37q
[markdown-reference]: https://github.com/advisories/GHSA-gfr2-rv44-r23c
[vitest-manual]: https://github.com/advisories/GHSA-qxg6-89mg-rqv8
[vitest-redirect]: https://github.com/advisories/GHSA-xp26-3454-mjgp
[vite-editor-percent]: https://github.com/advisories/GHSA-698v-4r3x-3vcv
[vite-editor-flags]: https://github.com/advisories/GHSA-r825-w8mm-5pxw
[vite-editor-exists]: https://github.com/advisories/GHSA-587h-7wmj-h5pm
[vite-html]: https://github.com/advisories/GHSA-9jrq-w75r-8gcw
[vite-paths]: https://github.com/advisories/GHSA-rq7h-c2jc-7f22
[vite-wasm]: https://github.com/advisories/GHSA-vfpm-58rq-9qcg
[uri-scheme]: https://github.com/advisories/GHSA-w74x-v6f9-j3xg
[uri-relative]: https://github.com/advisories/GHSA-xhq7-xmqj-769h
[uri-host]: https://github.com/advisories/GHSA-wjr9-j795-jxcr
[uri-suffix]: https://github.com/advisories/GHSA-333x-w4r6-6crp
[minimatch-advisory]: https://github.com/advisories/GHSA-g3hv-75wg-m249
[esbuild-advisory]: https://github.com/advisories/GHSA-g7r4-m6w7-qqqr
[katex-advisory]: https://github.com/advisories/GHSA-238p-pmpm-9mq7
