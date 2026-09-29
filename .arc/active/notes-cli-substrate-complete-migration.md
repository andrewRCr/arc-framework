# Notes: cli-substrate-complete-migration

Reference material for task generation and execution: how the inventory is taken and recorded in the residual matrix,
how each segment closes, the session-envelope roots and the schema bundle check, the layout reconciliation, the
state-path recount behind the storage register's row, the `gitExec` singleton importers and other unbound executors,
the sweep recipes and test-cost baselines execution records, and the review-projection tooling.

## Inventory method

The spec's counts were taken at `7ddab4979` with three scans:

- **Import specifiers.** The import and export declarations of every source file, parsed with the TypeScript compiler
  API and resolved to their target modules, so a shim's importers, a re-export site's importers, and a module's
  surviving importers after the carve come from one graph rather than from text search.
- **Regular-expression searches** for the symbol-level surfaces an import edge cannot see — digest patterns,
  `z.custom<…>()` wraps, `.safeParse` sites, and hand-written `GitExec` doubles in tests among them.
- **The coupling-audit class scan**, over the corpus and classes `packages/arc-framework/audits/coupling-blast-radius/`
  declares. `npm run audit:coupling` runs it whole; the recount below called its library directly
  (`parseCouplingManifest`, `selectCorpusPaths`, `collectCorpusFromPaths`, and `scanClassInventory` in
  `src/lib/coupling-audit/`) and kept the hits of the selected classes.

Counts drift with every base merge. Re-run all three before implementation starts, after each base merge, and at
verification; a figure in the spec is the planning-time count, not a target.

**One-off scripts.** Each scan, the layout reconciliation, and the schema bundle projection is a one-off script kept
here rather than in the product tree: its source in a fenced block under its own heading, followed by the one-line
command that writes it to a scratch path and runs it with `node --import tsx` from `packages/arc-framework`. The
scratch file takes the `.mts` extension (or sits beside a `package.json` declaring `"type": "module"`), and the scratch
directory links the repository's `node_modules`, as § Schema bundle diff does, so its ESM imports resolve. Each script
declares its own class selection and imports nothing this unit retires, such as the layout migration ledger module or
the kernel shims, so it still runs after the segment that removes them. This file is tracked, so the scans reproduce
across sessions and machines and retire with the work unit; a tracked script or gate would rebuild the layout ledger
this unit retires.

### Import-specifier scan

Groups static TypeScript import and export declarations by resolved local module. `importerCount` counts distinct
files, while `siteCount` counts declarations. Node built-ins, third-party packages, and unresolved specifiers remain
distinct from local targets. Dynamic imports and mock specifiers are candidates in the regular-expression scan.

```ts inventory-import-graph
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";

const files = execFileSync("git", ["ls-files", "-z", "--", "src", "__tests__"])
  .toString("utf8").split("\0").filter((path) => /\.(?:[cm]?ts|tsx)$/u.test(path)).sort();
const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.json");
if (!configPath) throw new Error("tsconfig.json not found");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const options = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd()).options;
const groups = new Map<string, { importer: string; line: number; specifier: string }[]>();
let external = 0;
let unresolved = 0;
const unresolvedSpecifiers = new Map<string, number>();
for (const file of files) {
  const absolute = resolve(file);
  const source = ts.createSourceFile(absolute, readFileSync(absolute, "utf8"), ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    const literal = statement.moduleSpecifier;
    if (!literal || !ts.isStringLiteral(literal)) continue;
    const found = ts.resolveModuleName(literal.text, absolute, options, ts.sys).resolvedModule;
    if (!found) { unresolved++; unresolvedSpecifiers.set(literal.text, (unresolvedSpecifiers.get(literal.text) ?? 0) + 1); continue; }
    const target = relative(process.cwd(), found.resolvedFileName).replaceAll("\\", "/");
    if (target.startsWith("..") || target.includes("/node_modules/")) { external++; continue; }
    const line = source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1;
    groups.set(target, [...(groups.get(target) ?? []), { importer: file, line, specifier: literal.text }]);
  }
}
const modules = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([target, sites]) => ({
  target,
  importerCount: new Set(sites.map(({ importer }) => importer)).size,
  siteCount: sites.length,
  sites: sites.sort((a, b) => a.importer.localeCompare(b.importer) || a.line - b.line),
}));
process.stdout.write(`${JSON.stringify({ head: execFileSync("git", ["rev-parse", "HEAD"]).toString().trim(),
  scannedFiles: files.length, external, unresolved,
  unresolvedSpecifiers: [...unresolvedSpecifiers].sort(([a], [b]) => a.localeCompare(b)), modules }, null, 2)}\n`);
```

```sh
ARC_SCAN_DIR=/tmp/arc-cli-substrate-inventory && mkdir -p "$ARC_SCAN_DIR" && ln -sfn "$PWD/../../node_modules" "$ARC_SCAN_DIR/node_modules" && awk '/^```ts inventory-import-graph$/{copy=1;next} copy && /^```$/{exit} copy' ../../.arc/active/notes-cli-substrate-complete-migration.md > "$ARC_SCAN_DIR/import-graph.mts" && node --import tsx "$ARC_SCAN_DIR/import-graph.mts" > "$ARC_SCAN_DIR/import-graph.json"
```

### Regular-expression scan

Lists symbol-level candidates by path and line. Comments, fixtures, and domain-owned patterns remain visible for
matrix classification; counts alone do not establish a disposition.

```ts inventory-regex
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const classes = [
  ["digest-prefix", /sha256:/gu],
  ["digest-hex-pattern", /\[0-9a-f\]\{64\}|\[a-f0-9\]\{64\}/gu],
  ["digest-custom-schema", /z\.custom\s*<\s*CanonicalDigest\s*>/gu],
  ["base-drift-custom-schema", /z\.custom\s*<\s*BaseDriftResult\s*>/gu],
  ["safe-parse", /\.safeParse\s*\(/gu],
  ["git-executor-types", /\b(?:RawGitExec|RawGitResult|GitExecInput|GitExec)\b/gu],
  ["git-executor-constructors", /\b(?:createRawGitExec|createGitExec|gitExecInput|makeGitExecInput|stubGitExec)\b/gu],
  ["hand-built-git-failure", /Object\.assign\s*\(\s*new Error|\b(?:exitCode|stderr|timedOut|isCanceled)\s*:/gu],
  ["meta-fixture", /\*\*(?:State|Owner|Branch|Class|Priority)\*\*/gu],
  ["dynamic-import-or-mock", /\bimport\s*\(|\b(?:vi|jest)\.mock\s*\(/gu],
] as const;
const files = execFileSync("git", ["ls-files", "-z", "--", "src", "__tests__"])
  .toString("utf8").split("\0").filter((path) => /\.(?:[cm]?ts|tsx)$/u.test(path)).sort();
const hits: { classId: string; path: string; line: number; column: number; match: string }[] = [];
for (const path of files) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    for (const [classId, expression] of classes) {
      for (const match of line.matchAll(expression)) hits.push({
        classId, path, line: index + 1, column: (match.index ?? 0) + 1, match: match[0],
      });
    }
  }
}
const counts = Object.fromEntries(classes.map(([classId]) =>
  [classId, hits.filter((hit) => hit.classId === classId).length]));
process.stdout.write(`${JSON.stringify({ head: execFileSync("git", ["rev-parse", "HEAD"]).toString().trim(),
  scannedFiles: files.length, counts, hits }, null, 2)}\n`);
```

```sh
ARC_SCAN_DIR=/tmp/arc-cli-substrate-inventory && mkdir -p "$ARC_SCAN_DIR" && ln -sfn "$PWD/../../node_modules" "$ARC_SCAN_DIR/node_modules" && awk '/^```ts inventory-regex$/{copy=1;next} copy && /^```$/{exit} copy' ../../.arc/active/notes-cli-substrate-complete-migration.md > "$ARC_SCAN_DIR/regex.mts" && node --import tsx "$ARC_SCAN_DIR/regex.mts" > "$ARC_SCAN_DIR/regex.json"
```

### Coupling-audit class scan

Reads the tracked corpus from the working tree through the four coupling-audit library entry points. Its explicit
selection includes the layout and state-path classes plus every other manifest class. Later layout reconciliation
filters this result to its own 15 classes.

```ts inventory-coupling-classes
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseCouplingManifest } from "./src/lib/coupling-audit/contracts.js";
import { selectCorpusPaths, collectCorpusFromPaths } from "./src/lib/coupling-audit/corpus.js";
import { scanClassInventory } from "./src/lib/coupling-audit/scan.js";

const classIds = [
  "arc-root", "active-placement", "planned-placement", "provisional-placement", "completed-placement",
  "meta-prefix", "tasks-prefix", "draft-prefix", "spec-prefix", "notes-prefix", "roadmap-name",
  "atomic-inbox-name", "user-inbox-name", "session-notes-name", "working-memory-name",
  "typed-branch-prefixes", "pm-mode-key", "team-mode-key", "strategy-family", "strategy-index-name",
  "agent-briefs-root", "workflow-root", "method-root", "extension-root", "internal-skill-root",
  "arc-methods-key", "arc-extensions-key", "load-set-name", "recommended-text-family",
  "template-suffix", "domain-rules-name", "tracked-planning-git-operations",
];
const root = execFileSync("git", ["rev-parse", "--show-toplevel"]).toString().trim();
const manifest = parseCouplingManifest(JSON.parse(await readFile("audits/coupling-blast-radius/manifest.json", "utf8")));
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root })
  .toString("utf8").split("\0").filter(Boolean);
const paths = selectCorpusPaths(manifest.corpus, tracked);
const corpus = await collectCorpusFromPaths(manifest.corpus, paths, (path) => readFile(resolve(root, path)));
const inventory = scanClassInventory(manifest, corpus);
const classes = inventory.classes.filter((entry) => classIds.includes(entry.classId));
if (classes.length !== classIds.length) throw new Error("declared coupling class selection differs from manifest");
process.stdout.write(`${JSON.stringify({ head: execFileSync("git", ["rev-parse", "HEAD"]).toString().trim(),
  scannedFiles: corpus.length, classes }, null, 2)}\n`);
```

```sh
ARC_SCAN_DIR=/tmp/arc-cli-substrate-inventory && mkdir -p "$ARC_SCAN_DIR" && ln -sfn "$PWD/../../node_modules" "$ARC_SCAN_DIR/node_modules" && ln -sfn "$PWD/src" "$ARC_SCAN_DIR/src" && awk '/^```ts inventory-coupling-classes$/{copy=1;next} copy && /^```$/{exit} copy' ../../.arc/active/notes-cli-substrate-complete-migration.md > "$ARC_SCAN_DIR/coupling-classes.mts" && node --import tsx "$ARC_SCAN_DIR/coupling-classes.mts" > "$ARC_SCAN_DIR/coupling-classes.json"
```

**Merged-base run:** `6f1d01261` — the import graph scanned 1,965 TypeScript files and grouped local imports
under 978 target modules. Its 1,520 unresolved specifiers were all `node:` built-ins; no relative specifier was
unresolved. The regular-expression scan covered the same 1,965 files and ten candidate classes. The coupling scan
covered 2,223 corpus files and all 32 selected manifest classes. Full JSON output is in the scratch directory named
by the commands above; later segment runs regenerate it.

## Residual matrix

One table per owning contract — kernel, validation surfaces, session envelope, layout, Git executor, command inputs,
and test support — with a row per retired module, re-export site, or migrated surface rather than per importer:

| Column      | Holds                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------- |
| Surface     | The old path, helper, symbol range, or surface                                            |
| Destination | Its owning module or helper after migration, or `—`                                       |
| Disposition | `migrated`, `retained by rule`, `owned outside the cohort`, or `carved`                   |
| Citation    | The rule, the named owner, or the register row (or the correction captured for the item)  |
| Importers   | Importer count at the latest scan                                                         |
| Evidence    | The search or test that proves the disposition                                            |

A mixed module takes one row per side of its symbol-range split, each naming its symbols.

Layout adds three fixed-column tables, which the reconciliation reads and nothing else does:

- **Layout per-file rows** — `File`, `Class`, `Kind`, `Owner`, `Hits`, and `Lines`. `Hits` is the number of hits the
  reconciliation assigns the row. A row whose hits take different kinds lists the hit lines under each kind, and a
  work-unit state-path row lists its lines as the evidence behind the storage register row's count; otherwise `Lines`
  stays empty.
- **Carved-module predicates** — `Module path` and `Register row`, each disposing every hit in that module as
  `external-owner`.
- **Non-code predicates** — `Surface kind`, `Path prefix` (or `—` for every path of that kind), `Kind`, and `Owner`,
  each disposing every non-code hit it matches.

## Segment boundaries

Every replication segment closes the same way. Merge base into the branch; re-run the three inventory scans and, from
the layout segment on, the layout reconciliation with its negative control; re-run each recorded sweep recipe over any
new hits the merge brought; refresh the matrix counts, removing any layout row the segment's own edits emptied and
classifying any added hit before a row's `Hits` count moves; then run the segment's verifier against the post-merge
head. Errands the `state-storage` cohort pulls forward, landing between segments, are absorbed the same way.

Each mechanical sweep records its search-and-rewrite recipe in § Sweep recipes before its first batch, so a merge
that brings new importers of a retired path is absorbed by re-running the recipe rather than re-deriving it.

## Session-envelope roots

The ten registered roots, each at version 1 `strict-current`, with the slot each fills. IDs follow the family's
convention: the type's name without `Result`, and a snapshot root named for its slot, as `base-branch-sync` is.

| Root                                       | Slot             | ID                          | Envelopes    |
| ------------------------------------------ | ---------------- | --------------------------- | ------------ |
| `DirtyStateResult`                         | `dirty`          | `dirty-state`               | both         |
| `CurrentHuskAdvisory`                      | `currentHusk`    | `current-husk-advisory`     | session-init |
| `ExtensionsSessionInitResult`              | `extensions`     | `extensions-session-init`   | both         |
| `ActiveSessionInitResult`                  | `active`         | `active-session-init`       | session-init |
| `DomainRulesSessionInitResult`             | `domainRules`    | `domain-rules-session-init` | session-init |
| `ConfigSessionInitResult`                  | `config`         | `config-session-init`       | both         |
| `ReleaseRoutingValue`                      | `releaseRouting` | `release-routing`           | both         |
| `WorktreeRosterResult`                     | `roster`         | `worktree-roster`           | session-init |
| `WorktreeSnapshotAnalysisResult`           | `worktree`       | `worktree-sync`             | both         |
| `BaseDistanceSnapshotAnalysisResult` union | `baseDistance`   | `base-distance`             | session-init |

**Composition.** A leaf root composes into its slot as itself, so the published envelope references it by ID. The
worktree and base-distance slots carry fields their roots do not — `identity` in both envelopes, and in session-init
`supersession` and the recommendation fields for the worktree slot and the recommendation fields for base distance — so
each root module exports its fields and each slot builds its strict arms from those fields plus its own. The slot keeps
its existing cross-field refinements over state, evidence, counts, and recommendations, and a refusal names the
offending key. Refining over the root's `safeParse`, as the `baseBranchSync` and `retiredSubdirs` slots do, reports
only "invalid … value" and publishes an opaque slot, so neither of these slots composes that way.

The worktree slot's own fields take strict schemas as unregistered components: `identity` the `WorktreeIdentity`
schema, and `supersession` the union its probe emits — `SupersessionResult` when no remote read is needed, otherwise
`SupersessionSnapshotAnalysisResult`'s remote-evidence arms, only the unreachable one with a failure reason. That is
wider than the slot's declared `SupersessionResult | null`, which widens to match.

`ActiveSessionInitResult`'s schema sits in a module beside its type in `commands/active/`. The resolver in
`status.ts` imports it type-only, because `cli-loading-boundary.test.ts` pins that module's integration-boundary import
as lazy and a runtime schema import would load it eagerly.

**Snapshot roots.** The worktree root is `withRemoteEvidence` over `WorktreeSyncStatusResult`'s fields without
`failureReason`. The base-distance root, `BaseDistanceSnapshotAnalysisResult | BaseDistanceNotApplicableResult`, is
explicit strict arms per `BaseDriftResult` verdict, as `base-branch-sync`'s root is: snapshot arms on `exact`,
`pending-fetch`, and `unreachable`, only the last with a failure reason, and a not-applicable arm bounded to `skipped`,
`no-remote`, and `detached-head`. `withRemoteEvidence` adds a not-applicable arm to every state, which would widen the
inferred type past today's bound — the looseness `BaseDistanceNotApplicableResult`'s own comment records as a defect.

**Producer output.** Every root's parse test runs on output its producer returns, across each state the producer can
reach, with the shared fake standing in for Git where the producer runs it. A hand-typed object proves only itself, and
a strict root that meets a producer shape no test ran fails session-init for every session in that state.

Two producers need a seam for their tests. Session-init fills `active` through `projectDerivedActiveSession` in
`commands/status/run.ts`, exported for the test, which yields `none` and `single`; the standalone resolver in
`commands/active/status.ts` yields `multiple` and the warnings. The base-distance not-applicable results are object
literals inside the `baseDistance` probe in `handlers/status.ts`, extracted into a named builder beside
`analyzeBaseDistanceSnapshot` that the probe calls and the root's test drives.

**Tests that change with the roots.**

- `__tests__/unit/status/schema.test.ts` pins the thin views' pass-through of unknown fields. Those cases retire with
  the views; its cases for the four storage-seam slots and for slot refinements stay.
- `__tests__/unit/session-envelope/type-authority.test.ts` moves each completed type from its handwritten list to its
  schema-owned list, and adds the snapshot types. `BaseDriftResult` in `lib/git/base-drift-types.ts` takes the entry
  of its `BaseDistanceStatusResult` alias, since an alias never shows `z.infer`.
- `__tests__/unit/session-envelope/registry.test.ts` gains each ID.
- `__tests__/helpers/schema-artifact.ts` gains each ID in `PRODUCTION_SCHEMA_IDS`, whose order
  `unit/kernel/schema-generation.test.ts` and `e2e/schema-artifact.e2e.test.ts` both assert against the bundle.

## Schema bundle diff

`dist/` is untracked, so the base's bundle is projected rather than read. A one-off script prints
`createProductionSchemaRegistry().toJSONSchema()` as sorted JSON. Run it against the merge base's
`packages/arc-framework` source, extracted with `git archive` into a scratch directory that links the repository's
`node_modules`, and against the head, then diff the two outputs. The first bundle check writes the script here; later
checks rerun it.

## Layout reconciliation

The reconciliation filters the coupling-audit class scan to the 15 layout classes and compares their hits with the
three layout tables in § Residual matrix, in both directions. It declares the class IDs itself, because the ledger
module that held them retires:

- **Framework classes** — `arc-root`, `method-root`, `workflow-root`, and `template-suffix`.
- **State classes** — `active-placement`, `planned-placement`, `completed-placement`, the `meta-`, `draft-`, `spec-`,
  `tasks-`, and `notes-` prefixes (`meta-prefix` through `notes-prefix`), `roadmap-name`, `session-notes-name`, and
  `working-memory-name`.

`provisional-placement` is not among them; its callers are carved. The state-path recount below counts it, so its
figures and the reconciliation's cover different class sets.

The `arc-root` class matches a `.arc/` literal or a `".arc"` component inside a `join` or `resolve` call, so a suffix
composed onto the resolved `arc-root` leaves the class.

Each hit is assigned to exactly one rule. A per-file row matches a hit on file and class, a carved-module predicate
on module path, and a non-code predicate on surface kind and path prefix, where the longest matching prefix wins and
`—` is the shortest; no other precedence exists. A rule's hits are the hits assigned to it, so a predicate that more
specific rules fully shadow has none.

It reports four sets: code hits with no per-file row or carved-module predicate, non-code hits with no non-code
predicate, hits that more than one rule matches without the precedence settling them, and rows or predicates with no
hit assigned. It also flags every per-file row whose assigned hit count differs from its recorded `Hits`. The lines a
row lists are evidence, re-derived whenever a base merge refreshes the counts, so a commit that moves a line does not
stale the row; its `Hits` count is refreshed only after any added hit is classified, so a new hit cannot hide in a
row that already has others.

Its **negative control** removes rows or predicates from a copy of the tables and requires the run to report exactly
their hits beyond the unremoved run's report. The comparison is differential, so hits already outstanding neither mask
nor mimic the removal; a reconciliation that cannot report a removed row proves nothing. Each removed rule is chosen
with no less specific rule to fall back to, since a hit that falls back to a broader predicate is correctly not
reported.

## Work-unit state-path recount

The coupling-audit class scan over the state classes — active, planned, provisional, and completed placement; the
meta, draft, spec, tasks, and notes prefixes; ROADMAP, SESSION-NOTES, and WORKING-MEMORY — found 610 code-surface
hits. 127 are import specifiers, 247 are comments, and 236 are code on 198 lines in 74 files. Each of the 198 lines
was sorted by owner; the storage register's state-path row carries the surviving share.

The recount covered state classes only. A work-unit state path built from an `arc-root` hit — a placement directory or
the user workspace joined without the trailing slash — is outside these figures, so the layout segment's file-exact
count can exceed the row's; a mismatch goes to the register's owner as a correction.

**Hand-built state paths in surviving code** — 36 lines in 19 files, the register's state-path row:

- `arc/system/.internal/scripts/validate-links.sh:130`
- `arc/system/.internal/scripts/verify-integrity.sh:118`, `:394`
- `src/commands/active/status.ts:587`
- `src/handlers/delivery.ts:789`
- `src/handlers/status.ts:1690`
- `src/lib/active/cohort-consistency.ts:263`
- `src/lib/active/cohort-live-context.ts:19`
- `src/lib/active/meta-reader.ts:42`
- `src/lib/compaction-seed/emitter.ts:188`, `:220`
- `src/lib/delivery/from-branch.ts:555`–`559`
- `src/lib/git/worktree-roster.ts:360`, `:424`
- `src/lib/handoff/restate-candidates.ts:64`
- `src/lib/markdown/authority.ts:90`, `:98`, `:166`
- `src/lib/markdown/descriptor-worktree.ts:39`
- `src/lib/markdown/selection.ts:17`, `:18`
- `src/lib/recover/audit.ts:551`, `:554`
- `src/lib/setup.ts:147`
- `src/lib/user-sync/parser.ts:53` — the surviving cross-WU entry parser
- `src/scripts/review-gate/readiness.ts:668`, `:715`, `:732`, `:784`, `:903`, `:928`, `:975`

The scan also hits `src/lib/user-surface-migration.ts:70`. That module is a pre-public-release compatibility reader,
so it belongs to the Errand that retires those readers, not to the register row.

**Layout-resolver calls with a work-unit kind in surviving code** — 12 calls in 8 files, the same row:

- `src/handlers/plan.ts:155`
- `src/lib/git/foreign-artifact-detection.ts:407`
- `src/lib/load-set/projection.ts:113`, `:121`
- `src/lib/session-init/cohort-doc.ts:78`
- `src/lib/status/project-view.ts:562`, `:711`
- `src/lib/user-surfaces.ts:72`, `:79`
- `src/lib/view-artifact.ts:163`, `:209`
- `src/scripts/review-gate/policy/pre-publication-composition.ts:611`

The class scan matches literal path tokens only, so it cannot see these; they came from a search for `resolveArcPath`
calls whose address carries a work-unit kind, outside `src/lib/layout/`.

**The other 161 lines** sit under existing register rows or are not state-path access:

| Owner                                                 | Lines |
| ----------------------------------------------------- | ----- |
| Lifecycle write path and `arc start` placement (seam) | 48    |
| Text, conventions, and framework names (not access)   | 33    |
| Lifecycle hook checks (cutover)                       | 17    |
| Branch-tree readers (cutover)                         | 12    |
| Lifecycle placement readers (seam)                    | 12    |
| Locus derivation (seam)                               | 11    |
| Notes-specific sync (cutover)                         | 7     |
| Layout definition (`src/lib/layout/projection.ts`)    | 6     |
| Archive index (seam)                                  | 5     |
| Candidate and transition records (seam)               | 2     |
| CI planning classifier (cutover)                      | 2     |
| Per-WU user workspace (seam)                          | 2     |
| ROADMAP carried on every branch (seam)                | 2     |
| Lifecycle classification (cutover)                    | 1     |
| Retirement writes (seam)                              | 1     |

## `gitExec` singleton importers

**CLI-reachable** — 13, each threading the invocation's executor or holding the singleton only as a fallback that
bound callers override:

- `src/commands/active/status.ts` — fallback only (`options.exec ?? gitExec`)
- `src/commands/config/status.ts` — fallback only (`options.exec ?? gitExec`); its adapter threads its own executor
- `src/handlers/init.ts`
- `src/handlers/join.ts`
- `src/handlers/locus.ts`
- `src/handlers/log.ts` — bound with its adapter wrap
- `src/handlers/release/commit-cli.ts` — the adapter and the snapshot, message-file read
  (`readRealCommitMessageFileWithIdentity`), retry-store, and head-resolution helpers, which become factories over the
  invocation's executor; delivery's review-fix release effects call the exported ones with delivery's bound executor
- `src/handlers/release/record.ts` — `release opt-in` and `opt-out` wrap with an empty policy and thread their
  executors; `release status` holds the singleton as a fallback only, when no invocation context is bound
- `src/handlers/release/setup/verify.ts` — fallback only, when no invocation context is bound
- `src/handlers/review.ts` — the always-JSON handlers bind with their wraps; the rest sit in handlers already wrapped.
  `readinessBoundTo` and the exported `defaultMergeLockPort`, which delivery execution's merge-lock releases call,
  take the executor
- `src/handlers/shared.ts`
- `src/handlers/view.ts`
- `src/lib/recover/committed-progress.ts` — fallback only, overridden by every bound caller

**Standalone scripts** — 10, which keep the singleton because they have no invocation context:

- `src/scripts/assert-layout-migration.ts` — retires with the layout migration ledger
- `src/scripts/audit-coupling-blast-radius.ts`
- `src/scripts/audit-emphasis.ts`
- `src/scripts/audit-tables.ts`
- `src/scripts/check-foreign-writes.ts`
- `src/scripts/lint-markdown-staged.ts`
- `src/scripts/lint-markdown-worktree.ts`
- `src/scripts/lint-markdown.ts`
- `src/scripts/lint-task-descriptors.ts`
- `src/scripts/markdown-write-command.ts`

**Built without a subprocess policy** — an executor constructed with no interaction context is as unbound as the
singleton:

- `src/handlers/review.ts` — `createGitExec()` in the frontline and changeset resolve default dependencies, bound with
  those commands' wraps
- `src/handlers/release/commit-cli.ts` — the module-level `createExecaGitExec()`, `capturedGitExec`, which retires as
  its helpers become factories over the invocation's executor
- `src/lib/local-test-admission.ts` — `createGitExec()` in the default dependencies of the standalone test runners
  (`run-local-test-tier`, the test-cost benchmark, the local Vitest runner), which keep it with a matrix row
- `src/lib/io-context.ts` — the module-level `candidateGitExec`, `gitExec`, and `gitExecInput` constructions, which
  stay as the singletons and their base; and `prepareGitRefVerification`, a direct `execa` spawn with no interaction
  environment, carved because only `park --land`'s planning landing, the lifecycle write path, calls it

## Sweep recipes

Each mechanical sweep's search-and-rewrite recipe, recorded before its first batch and re-run after each base merge.

## Test-cost baselines

Each affected tier-isolated row's retained-run paths in `.test-cost-runs/`, its median, and the base SHA measured.

## Review projection

`scripts/review-projection.sh` projects a single-branch work unit's review chunks as stacked draft pull requests
(`build`, `publish`, and `close` over a chunk file), and
`.arc/reference/strategies/project/strategy-review-projection.md` is its runbook. The chunk file assigns every changed
path to exactly one chunk, and chunks stack in file order, so chunk boundaries follow files in dependency order. The
top projection commit's tree equals the work-unit head outside `.arc/active/`, which is never projected.
