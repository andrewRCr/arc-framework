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

**Phase 3 post-merge run:** `2c7d9d1cb` — the import graph scanned 1,973 TypeScript files and grouped local imports
under 982 target modules. Its 1,521 unresolved specifiers were all `node:` built-ins; no relative specifier was
unresolved. The regex scan found zero `z.custom<BaseDriftResult>` sites. The coupling scan covered 2,231 corpus files
and all 32 selected classes. The three JSON reports are in `/tmp/arc-cli-substrate-inventory/`.

**Phase 4 post-merge run:** `82e2a5312` — after merging the storage-register-only base update, the import graph
scanned 1,974 TypeScript files and grouped local imports under 982 modules. All 1,524 unresolved specifiers were
`node:` built-ins. The regex scan found zero `z.custom<BaseDriftResult>` sites, and the coupling scan covered 2,232
corpus files and all 32 selected classes. The current JSON reports are in `/tmp/arc-cli-substrate-inventory/`;
the matrix's affected whole-module importer counts were refreshed from this run.

**Phase 5 segment run:** `caa5dba84` — `npx arc base drift --json` fetched base and reported `clean`, `behind: 0`,
and base OID `9fd22f614`; no merge was needed. The import graph scanned 1,969 TypeScript files and grouped local
imports under 980 modules. All 1,521 unresolved specifiers were `node:` built-ins. The regex scan found zero
`z.custom<BaseDriftResult>` sites. The coupling scan covered 2,227 corpus files and all 32 selected classes.
Reports are in `/tmp/arc-cli-substrate-inventory/`.

## Residual matrix

One table per owning contract — kernel, validation surfaces, session envelope, layout, Git executor, command inputs,
and test support — with a row per retired module, re-export site, or migrated surface rather than per importer:

| Column      | Holds                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------- |
| Surface     | The old path, helper, symbol range, or surface                                           |
| Destination | Its owning module or helper after migration, or `—`                                      |
| Disposition | `migrated`, `retained by rule`, `owned outside the cohort`, or `carved`                  |
| Citation    | The rule, the named owner, or the register row (or the correction captured for the item) |
| Importers   | Importer count at the latest scan                                                        |
| Evidence    | The search or test that proves the disposition                                           |

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

### Matrix count and citation conventions

Paths in the tables are relative to `packages/arc-framework`. Completed-segment importer counts come from the latest
static TypeScript graph (Phase 3: `2c7d9d1cb`); `M:n` marks a whole-module count where a row names only some symbols in
a mixed module. `—` means
that the surface is a command, local declaration, literal, or planned helper rather than a statically imported module.
The regular-expression scan supplies candidates, not semantic counts. Later segment runs refresh these cells and
remove rows whose surface has retired. The two-way layout tables below begin empty by design and are filled in Phase 5.

Register citations below name the corresponding **Storage-coupling register** row in
`cohort-state-storage.md`. The correction citation names the existing `USER-INBOX` capture.

| Key      | Register row                                                                               |
| -------- | ------------------------------------------------------------------------------------------ |
| `R-NS`   | Notes-specific sync                                                                        |
| `R-BR`   | Branch-tree readers                                                                        |
| `R-LC`   | Lifecycle classification and exclusion                                                     |
| `R-HC`   | Lifecycle hook checks                                                                      |
| `R-PL`   | Lifecycle state encoded in directory placement                                             |
| `R-SP`   | Surviving code builds work-unit state paths itself                                         |
| `R-IF`   | In-flight derivation                                                                       |
| `R-LW`   | The lifecycle executor's write path and `arc start` placement                              |
| `R-NP`   | The notes-related session-init probes                                                      |
| `R-CW`   | The `currentWuReconcile` and `StaleWorktreeSweepResult` session-init slots                 |
| `R-LOC`  | Locus derivation (`DerivedLocusFrame`)                                                     |
| `R-AR`   | Archival by `git mv`, the archive index                                                    |
| `R-UW`   | The per-work-unit user workspace                                                           |
| `R-RM`   | `ROADMAP.md` carried on every branch                                                       |
| `R-CR`   | Candidate and transition records tracked under `.arc/system/.internal/`                    |
| `R-CI`   | The auto-merge lane's planning classification by tracked artifact prefix                   |
| `R-LOCK` | `USER-INBOX`: Name what the surviving inbox writer locks on in the notes-sync register row |
| `R-ADD`  | `USER-INBOX`: Cover identity-wide user workspace bootstrap in the storage register         |

### Kernel contract

| Surface                                                                    | Destination                                  | Disposition      | Citation                |   Importers | Evidence                         |
| -------------------------------------------------------------------------- | -------------------------------------------- | ---------------- | ----------------------- | ----------: | -------------------------------- |
| `src/lib/canonical/canonical-json.ts` shim                                 | `src/lib/kernel/canonical/canonical-json.ts` | migrated         | Spec § 3                |         127 | import graph; Task 6.1           |
| `src/lib/canonical/managed-path.ts` shim                                   | `src/lib/kernel/canonical/managed-path.ts`   | migrated         | Spec § 3                |          28 | import graph; Task 6.2           |
| `src/lib/work-unit/slug.ts` shim                                           | `src/lib/kernel/schema/slug.ts`              | migrated         | Spec § 3                |           9 | import graph; Task 6.2           |
| `ArcError` re-export in `src/lib/errors.ts`                                | kernel error module                          | migrated         | Spec § 3                |  4 (`M:38`) | named-import search; Task 6.2    |
| vocabulary re-exports in `src/commands/active/types.ts`                    | kernel vocabulary                            | migrated         | Spec § 3                | 15 (`M:29`) | named-import search; Task 6.2    |
| local `SlugSchema` in `src/scripts/integration/merge.ts`                   | kernel `SlugSchema`                          | migrated         | Spec § 3                |           — | Task 6.3                         |
| local `SlugSchema` in `src/scripts/integration/checkpoint.ts`              | kernel `SlugSchema`                          | migrated         | Spec § 3                |           — | Task 6.3                         |
| local `SlugSchema` in `src/scripts/review-gate/readiness.ts`               | kernel `SlugSchema`                          | migrated         | Spec § 3                |           — | Task 6.3                         |
| local state and placement enums in `src/scripts/integration/checkpoint.ts` | kernel and layout schemas                    | migrated         | Spec § 3                |           — | Task 6.3                         |
| kernel digest patterns and three `z.custom<CanonicalDigest>` copies        | `CanonicalDigestSchema`                      | migrated         | Spec § 2.1              |           — | regex candidates; Tasks 1.3, 6.4 |
| composite `checkpoint-v1:` digest handles                                  | domain schema                                | retained by rule | Spec § 2.1 fenced owner |           — | regex candidates; Task 6.4.c     |
| review-gate version-1 identities                                           | review-gate schema                           | retained by rule | Spec § 2.1 fenced owner |           — | regex candidates; Task 6.4.c     |
| `src/lib/canonical/content-digest.ts`                                      | same module                                  | retained by rule | Spec § 3 non-shim       |        M:14 | import graph; Task 6.5           |

### Validation-surfaces contract

| Surface                                                                       | Destination                          | Disposition      | Citation                  |   Importers | Evidence                 |
| ----------------------------------------------------------------------------- | ------------------------------------ | ---------------- | ------------------------- | ----------: | ------------------------ |
| re-exports in `src/lib/release/types.ts`                                      | release owning schemas               | migrated         | Spec § 4                  |         M:5 | import graph; Task 3.1.a |
| re-exports in `src/lib/active/meta-reader.ts`                                 | active owning schemas                | migrated         | Spec § 4                  |       M:114 | import graph; Task 3.1.a |
| re-exports in `src/lib/config/status-reader.ts`                               | config owning schemas                | migrated         | Spec § 4                  |        M:45 | import graph; Task 3.1.a |
| re-exports in `src/lib/commit-check/config.ts`                                | commit-check owning schemas          | migrated         | Spec § 4                  |         M:3 | import graph; Task 3.1.a |
| re-exports in `src/commands/config/types.ts`                                  | config owning schemas                | migrated         | Spec § 4                  |         M:7 | import graph; Task 3.1.a |
| relay in `src/commands/config.ts`                                             | config owning schemas                | migrated         | Spec § 4                  |         M:6 | import graph; Task 3.1.a |
| cross-WU entry re-exports in `src/lib/user-sync/index.ts`                     | `schema.ts` and `parser.ts`          | migrated         | Spec § 4; `R-NS` survivor |        M:30 | import graph; Task 3.1.b |
| sync-state re-exports in `src/lib/user-sync/index.ts`                         | —                                    | carved           | `R-NS`                    |        M:30 | Task 3.1.b               |
| unused `src/lib/user-sync/types.ts` re-export names                           | —                                    | carved           | `R-NS`                    |     0 named | Task 3.1.b               |
| `parseCrossWuEntries` and `matchInboxEntryTitle` through the user-sync barrel | direct `parser.ts` imports           | migrated         | Spec § 4; `R-NS` survivor |         M:9 | Task 3.1.c               |
| `inbox-writer.ts` and `execution-offer.ts`                                    | direct owning modules                | retained by rule | `R-NS` survivor           |  M:12 / M:2 | Task 3.1.c; direct       |
| `resolveCurrentWuName` in `current-wu.ts`                                     | barrel retained for carved importers | retained by rule | `R-NS` survivor           | 0 surviving | Task 1.1.c               |
| remaining notes-sync machinery in `src/lib/user-sync/`                        | —                                    | carved           | `R-NS`                    |           — | Task 1.1.c               |

### Session-envelope contract

| Surface                                                         | Destination                                   | Disposition      | Citation           | Importers | Evidence                 |
| --------------------------------------------------------------- | --------------------------------------------- | ---------------- | ------------------ | --------: | ------------------------ |
| `DirtyStateResult` in `src/lib/git/dirty-state.ts`              | full schema, `dirty-state` root               | migrated         | Spec § 5           |      M:15 | import graph; Task 3.2.a |
| `CurrentHuskAdvisory`                                           | full schema, `current-husk-advisory` root     | migrated         | Spec § 5           |       M:6 | import graph; Task 3.2.a |
| `ExtensionsSessionInitResult`                                   | full schema, `extensions-session-init` root   | migrated         | Spec § 5           |       M:7 | import graph; Task 3.2.b |
| `ActiveSessionInitResult`                                       | full schema, `active-session-init` root       | migrated         | Spec § 5           |      M:29 | import graph; Task 3.2.b |
| `DomainRulesSessionInitResult`                                  | full schema, `domain-rules-session-init` root | migrated         | Spec § 5           |       M:5 | import graph; Task 3.2.b |
| `ConfigSessionInitResult`                                       | full schema, `config-session-init` root       | migrated         | Spec § 5           |       M:7 | import graph; Task 3.2.c |
| `ReleaseRoutingValue`                                           | full schema, `release-routing` root           | migrated         | Spec § 5           |      M:11 | Task 3.2.d               |
| `WorktreeSyncStatusResult`                                      | full component schema                         | migrated         | Spec § 5           |      M:29 | import graph; Task 3.3.a |
| `WorktreeSnapshotAnalysisResult`                                | full schema, `worktree-sync` root             | migrated         | Spec § 5           |      M:29 | Task 3.3.a               |
| `WorktreeRosterResult`                                          | full schema, `worktree-roster` root           | migrated         | Spec § 5           |      M:66 | import graph; Task 3.3.b |
| `BaseDriftResult` and `BaseDistanceStatusResult` alias          | full component schema                         | migrated         | Spec § 5           |      M:15 | import graph; Task 3.4.a |
| base-distance snapshot union                                    | full schema, `base-distance` root             | migrated         | Spec § 5           |      M:18 | import graph; Task 3.4.b |
| four `z.custom<BaseDriftResult>` checkpoint wraps               | full `BaseDriftResult` schema                 | migrated         | Spec § 2.3         |         — | regex scan; Task 3.4.c   |
| thin `WorkUnitStateResult` slot                                 | store-backed result schema                    | carved           | `R-IF`             |         — | Task 3.5                 |
| thin `ErrandStateResult` slot                                   | store-backed result schema                    | carved           | `R-IF`             |         — | Task 3.5                 |
| thin `UserSessionInitStatusResult` slot                         | store-backed result schema                    | carved           | `R-NP`             |         — | Task 3.5                 |
| thin `StaleWorktreeSweepResult` slot                            | store-backed result schema                    | carved           | `R-CW`             |         — | Task 3.5                 |
| `DerivedLocusFrame` slot                                        | store-backed result schema                    | carved           | `R-LOC`            |         — | Task 3.5                 |
| `currentWuReconcile` slot                                       | store-backed result schema                    | carved           | `R-CW`             |         — | Task 3.5                 |
| `userReferenceReconcile` slot                                   | store-backed result schema                    | carved           | `R-NP`             |         — | Task 3.5                 |
| `src/lib/git/in-flight-derivation.ts`: branch-ref oracle        | store read                                    | carved           | `R-IF`; `R-BR`     |      M:21 | import graph; Task 3.5   |
| `src/lib/git/in-flight-derivation.ts`: emitted in-flight shapes | full surviving result schema                  | retained by rule | Spec § 1 type edge |      M:21 | Task 3.5                 |

### Layout contract

| Surface                                                                     | Destination            | Disposition              | Citation              | Importers | Evidence                |
| --------------------------------------------------------------------------- | ---------------------- | ------------------------ | --------------------- | --------: | ----------------------- |
| `layout-migration-ledger.json`                                              | —                      | migrated                 | Spec § 6 retirement   |         — | Task 5.1                |
| `src/lib/coupling-audit/layout-migration-ledger.ts`                         | —                      | migrated                 | Spec § 6 retirement   |       M:4 | import graph; Task 5.1  |
| `src/scripts/assert-layout-migration.ts`                                    | —                      | migrated                 | Spec § 6 retirement   |       M:2 | import graph; Task 5.1  |
| `audit:layout-migration` package script and test entry                      | —                      | migrated                 | Spec § 6 retirement   |         — | Task 5.1                |
| framework `arc-root` construction in surviving TypeScript                   | layout resolver        | migrated                 | Spec § 6              |         — | coupling scan; Task 5.3 |
| procedure roots and template output construction                            | layout resolver        | migrated                 | Spec § 6              |         — | coupling scan; Task 5.3 |
| `src/lib/work-unit/completed-index.ts`: `*FromRef` and archive reads        | store read             | carved                   | `R-BR`; `R-AR`        |      M:25 | import graph; Task 5.2  |
| `src/lib/work-unit/completed-index.ts`: `branchToWorkUnitSlug`              | same module            | retained by rule         | `R-BR` survivor       |      M:25 | Task 5.2                |
| `src/lib/git/remote-ref-reader.ts`: in-flight and meta ref reads            | store read             | carved                   | `R-BR`                |      M:23 | Task 5.2                |
| `src/lib/git/remote-ref-reader.ts`: live branch tip and timeout             | same module            | retained by rule         | `R-BR` survivor       |      M:23 | Task 5.2                |
| `src/lib/base-drift/current-adapters.ts`: completed-history read            | store read             | carved                   | `R-BR`                |      M:11 | Task 5.2                |
| `src/lib/base-drift/current-adapters.ts`: current base-drift adapters       | same module            | retained by rule         | Spec § 1 symbol split |      M:11 | Task 5.2                |
| `src/lib/status/project-view-ref.ts` and retirement/transition ref readers  | store read             | carved                   | `R-BR`                |         — | coupling scan; Task 5.2 |
| work-unit state-path construction in surviving code                         | store contract         | carved                   | `R-SP`                |         — | coupling scan; Task 5.4 |
| lifecycle placement readers and `provisional-placement` callers             | store contract         | carved                   | `R-PL`; `R-LW`        |         — | coupling scan; Task 5.4 |
| Candidate and transition record paths                                       | store contract         | carved                   | `R-CR`                |         — | coupling scan; Task 5.4 |
| ROADMAP construction and reading                                            | store projection       | carved                   | `R-RM`                |         — | coupling scan; Task 5.4 |
| draft retirement in `activate-work-unit.md` and `strategy-work-planning.md` | `composable-workflows` | owned outside the cohort | Spec § 6 route        |         — | Task 5.5                |

### Git-executor contract

| Surface                                                                 | Destination               | Disposition      | Citation                  |       Importers | Evidence                   |
| ----------------------------------------------------------------------- | ------------------------- | ---------------- | ------------------------- | --------------: | -------------------------- |
| `RawGitExec` and `RawGitResult` in `src/lib/change-facts.ts`            | `src/lib/git/exec.ts`     | migrated         | Spec § 2.2                | 0 old; 44 moved | AST import sweep; Task 1.4 |
| `createRawGitExec` spawn factory in `change-facts.ts`                   | `createSpawnRawGitExec`   | migrated         | Spec § 7                  |  4 direct tests | Task 4.6.b                 |
| `change-facts.ts`: CI weight, tree hash, portability, raw executor      | same module               | retained by rule | Spec § 1; `R-CI` survivor |             M:8 | Task 4.6.b                 |
| `change-facts.ts`: planning-lane classifier                             | —                         | carved           | `R-CI`                    |             M:8 | Task 4.6.b                 |
| Git failure-text predicates in `src/lib/user-sync/notes-merge.ts`       | `src/lib/git/ref-tree.ts` | migrated         | Spec § 7; `R-NS` survivor |             M:1 | Task 4.5.a                 |
| `notes-merge.ts`: remaining notes merge functions                       | —                         | carved           | `R-NS`                    |             M:1 | Task 4.5.a                 |
| `resolveGitCommonDir` in `src/lib/user-sync/repo-shared-paths.ts`       | `src/lib/git/exec.ts`     | migrated         | Spec § 7; `R-NS` survivor |     9 surviving | Task 4.5.b                 |
| `getRepoSharedUserInternalDir` in `repo-shared-paths.ts`                | correction pending        | retained by rule | `R-LOCK`                  |             M:3 | existing inbox capture     |
| `getNotesLockPath` in `src/lib/user-sync/notes-lock.ts`                 | correction pending        | retained by rule | `R-LOCK`                  |             M:5 | existing inbox capture     |
| `src/lib/io-context.ts`: `createRawGitExec`, `createGitExec`            | bound executor factory    | migrated         | Spec § 8                  |           M:100 | Task 4.4                   |
| `src/lib/io-context.ts`: notes `UserIOContext` and writer               | store-backed IO           | carved           | `R-NS`                    |           M:100 | Task 4.4                   |
| errand identity `.message` Git classification                           | `gitFailureText()`        | migrated         | Spec § 7                  |               — | Task 4.6.a                 |
| raw Git in lifecycle hook scripts                                       | —                         | carved           | `R-HC`                    |               — | coupling scan; Task 4.7    |
| raw `git()` arrangement runners                                         | same modules              | retained by rule | Spec § 9                  |               — | Task 4.7                   |
| `src/scripts/assert-layout-migration.ts`: `gitExec`                     | —                         | migrated         | Spec § 6 retirement       |               — | Task 5.1 deleted script    |
| `src/scripts/audit-coupling-blast-radius.ts`: `gitExec`                 | same singleton            | retained by rule | Spec § 8                  |               — | standalone; Task 4.4.d     |
| `src/scripts/audit-emphasis.ts`: `gitExec`                              | same singleton            | retained by rule | Spec § 8                  |               — | standalone; Task 4.4.d     |
| `src/scripts/audit-tables.ts`: `gitExec`                                | same singleton            | retained by rule | Spec § 8                  |               — | standalone; Task 4.4.d     |
| `src/scripts/check-foreign-writes.ts`: `gitExec`                        | same singleton            | retained by rule | Spec § 8                  |               — | standalone; Task 4.4.d     |
| `src/scripts/lint-markdown-staged.ts`: `gitExec`                        | same singleton            | retained by rule | Spec § 8                  |               — | standalone; Task 4.4.d     |
| `src/scripts/lint-markdown-worktree.ts`: `gitExec`                      | same singleton            | retained by rule | Spec § 8                  |               — | standalone; Task 4.4.d     |
| `src/scripts/lint-markdown.ts`: `gitExec`                               | same singleton            | retained by rule | Spec § 8                  |               — | standalone; Task 4.4.d     |
| `src/scripts/lint-task-descriptors.ts`: `gitExec`                       | same singleton            | retained by rule | Spec § 8                  |               — | standalone; Task 4.4.d     |
| `src/scripts/markdown-write-command.ts`: `gitExec`                      | same singleton            | retained by rule | Spec § 8                  |               — | standalone; Task 4.4.d     |
| `src/commands/active/status.ts`: `gitExec`                              | bound caller overrides    | retained by rule | Spec § 8                  |               — | fallback; Task 4.4.a       |
| `src/commands/config/status.ts`: `gitExec`                              | bound caller overrides    | retained by rule | Spec § 8                  |               — | fallback; Task 4.4.b       |
| `src/handlers/release/record.ts`: `gitExec`                             | bound caller overrides    | retained by rule | Spec § 8                  |               — | fallback; Task 4.4.a       |
| `src/handlers/release/setup/verify.ts`: `gitExec`                       | bound caller overrides    | retained by rule | Spec § 8                  |               — | fallback; Task 4.4.a       |
| `src/lib/recover/committed-progress.ts`: `gitExec`                      | bound caller overrides    | retained by rule | Spec § 8                  |               — | fallback; Task 4.4.a       |
| `src/lib/local-test-admission.ts`: policy-less `createGitExec()`        | same default executor     | retained by rule | Spec § 8                  |               — | standalone runners; 4.4.d  |
| `src/lib/io-context.ts`: module-level `candidateGitExec`                | base of bound factory     | retained by rule | Spec § 8                  |               — | Task 4.4.d                 |
| `src/lib/io-context.ts`: module-level `gitExec`                         | unbound singleton         | retained by rule | Spec § 8                  |               — | Task 4.4.d                 |
| `src/lib/io-context.ts`: module-level `gitExecInput`                    | unbound factory fallback  | retained by rule | Spec § 8                  |               — | Task 4.4.c                 |
| `src/lib/io-context.ts`: `prepareGitRefVerification` direct `execa`     | lifecycle landing rewrite | carved           | `R-LW`                    |               — | park --land; Task 4.4.d    |
| `src/handlers/locus.ts`: `gitExec`                                      | storage locus rewrite     | carved           | `R-LOC`                   |               — | Task 4.1.e                 |

### Command-inputs contract

| Surface                                                 | Destination                         | Disposition      | Citation               |  Importers | Evidence   |
| ------------------------------------------------------- | ----------------------------------- | ---------------- | ---------------------- | ---------: | ---------- |
| merge lock `resolve` adapter                            | machine-mode wrap and bound handler | migrated         | Spec § 8               |          — | Task 4.1.a |
| merge lock `hold` adapter                               | machine-mode wrap and bound handler | migrated         | Spec § 8               |          — | Task 4.1.a |
| merge lock `release` adapter                            | machine-mode wrap and bound handler | migrated         | Spec § 8               |          — | Task 4.1.a |
| review `resolve` adapter                                | machine-mode wrap and bound handler | migrated         | Spec § 8               |          — | Task 4.1.b |
| review `merge-method resolve` adapter                   | machine-mode wrap and bound handler | migrated         | Spec § 8               |          — | Task 4.1.b |
| review `checks await` adapter                           | machine-mode wrap and bound handler | migrated         | Spec § 8               |          — | Task 4.1.b |
| review `readiness` adapter                              | machine-mode wrap and bound handler | migrated         | Spec § 8               |          — | Task 4.1.b |
| review `frontline resolve` adapter                      | machine-mode wrap and bound handler | migrated         | Spec § 8               |          — | Task 4.1.b |
| review `changeset resolve` adapter                      | machine-mode wrap and bound handler | migrated         | Spec § 8               |          — | Task 4.1.b |
| review `hosted request` adapter                         | machine-mode wrap and bound handler | migrated         | Spec § 8               |          — | Task 4.1.c |
| review `hosted await` adapter                           | machine-mode wrap and bound handler | migrated         | Spec § 8               |          — | Task 4.1.c |
| review `hosted settle` adapter                          | machine-mode wrap and bound handler | migrated         | Spec § 8               |          — | Task 4.1.c |
| review `local prepare` adapter                          | machine-mode wrap and bound handler | migrated         | Spec § 8               |          — | Task 4.1.d |
| review `local attest` adapter                           | machine-mode wrap and bound handler | migrated         | Spec § 8               |          — | Task 4.1.d |
| review `local resume` adapter                           | machine-mode wrap and bound handler | migrated         | Spec § 8               |          — | Task 4.1.d |
| review `respond` adapter                                | machine-mode wrap and bound handler | migrated         | Spec § 8               |          — | Task 4.1.d |
| review `reduce` adapter                                 | machine-mode wrap and bound handler | migrated         | Spec § 8               |          — | Task 4.1.d |
| `attest`, `publish`, and `locus` declarations           | machine-mode policies               | migrated         | Spec § 8               |          — | Task 4.1.e |
| `user close` command surface                            | adapter wrap                        | migrated         | Spec § 8; `R-UW` body  |          — | Task 4.2   |
| `config validate` command surface                       | adapter wrap                        | migrated         | Spec § 8               |          — | Task 4.2   |
| `release setup print-patterns` command surface          | adapter wrap                        | migrated         | Spec § 8               |          — | Task 4.2   |
| `log standalone` command surface                        | adapter wrap and bound executor     | migrated         | Spec § 8               |          — | Task 4.2   |
| `handlers/shared.ts`: three default-`gitExec` helpers   | required executor                   | migrated         | Spec § 8               |       M:35 | Task 4.3   |
| CLI-reachable `gitExec` singleton importers             | bound invocation executor           | migrated         | Spec § 8               | 13 modules | Task 4.4.a |
| `active in-flight` adapter's `gitExecInput`             | bound input executor                | migrated         | Spec § 8; `R-IF` body  |          — | Task 4.4.c |
| `handlers/user.ts`: inbox remove/mark execute-bound     | same mutation handlers              | retained by rule | `R-NS` survivor        |        M:2 | Task 1.1.c |
| `handlers/user.ts`: reconcile-references/status         | store-backed handlers               | carved           | `R-NP`                 |        M:2 | Task 1.1.c |
| `handlers/user.ts`: open/close                          | store-backed workspace handlers     | carved           | `R-UW`                 |        M:2 | Task 1.1.c |
| `handlers/user.ts`: save/load/push/fetch/pull/compact   | store-backed sync                   | carved           | `R-NS`                 |        M:2 | Task 1.1.c |
| `handlers/user.ts`: add identity workspace              | store-backed user workspace         | carved           | `R-ADD`                |        M:2 | Task 1.1.c |
| `commands/user/add.ts`: identity-wide bootstrap         | store-backed user workspace         | carved           | `R-ADD`                |        M:1 | Task 1.1.c |
| `handlers/user-sync.ts` and `handlers/push-recovery.ts` | —                                   | carved           | `R-NS`                 |        M:4 | Task 1.1.c |
| `handlers/sync.ts`: notes pull/push                     | store-backed sync                   | carved           | `R-NS`                 |        M:3 | Task 1.1.c |
| `handlers/sync.ts`: worktree sync and adapter           | same handler                        | retained by rule | Spec § 1 symbol split  |        M:3 | Task 1.1.c |
| `review planning-lane` command                          | —                                   | carved           | `R-CI`                 |          — | Task 4.1   |
| `locus` command adapter                                 | machine-mode wrap                   | migrated         | Spec § 8; `R-LOC` body |          — | Task 4.1.e |

### Test-support contract

| Surface                                                                     | Destination                             | Disposition      | Citation                      | Importers | Evidence                         |
| --------------------------------------------------------------------------- | --------------------------------------- | ---------------- | ----------------------------- | --------: | -------------------------------- |
| repeated scripted `GitExec` doubles                                         | `__tests__/helpers/git-exec-fake.ts`    | migrated         | Spec § 9                      |         — | test scan; Tasks 2.1, 7.1, 7.4   |
| hand-built Git failure rejections                                           | shared `GitProcessError` fixture        | migrated         | Spec § 9                      |         — | regex candidates; Tasks 2.1, 7.1 |
| scripted `GitExecInput` and `RawGitExec` doubles                            | shared fake variants                    | migrated         | Spec § 9                      |         — | test scan; Task 2.1.c            |
| handwritten meta fixture blocks                                             | `__tests__/helpers/meta-fixture.ts`     | migrated         | Spec § 9                      |         — | regex candidates; Tasks 2.2, 7.2 |
| inline `.safeParse(...).success` assertions                                 | `__tests__/helpers/schema-assertion.ts` | migrated         | Spec § 9                      |         — | regex candidates; Tasks 2.3, 7.3 |
| registered output casts in tests                                            | schema parse                            | migrated         | Spec § 9                      |         — | Task 7.3                         |
| `makeGitExecInput` in `__tests__/helpers/integration.ts`                    | execa input adapter                     | migrated         | Spec § 9                      |      M:74 | Task 2.4.a; 22 suites            |
| `stubGitExec` in `__tests__/helpers/integration.ts`                         | `__tests__/integration/active.test.ts`  | migrated         | Spec § 9                      |         1 | Task 2.4.b; active suite         |
| `makeGitNoteWriter` and `makeGitNoteReader`                                 | same helpers                            | carved           | `R-NS`                        |      M:74 | Task 2.4.c; notes seam           |
| `base-advance.ts` raw `git()` runner                                        | same helper                             | retained by rule | Spec § 9 arrangement runner   |         — | Task 2.4.c; no src import        |
| `e2e/race-worker.ts` private spawn executors                                | same worker                             | retained by rule | Spec § 9 real-Git plumbing    |         — | Task 2.4.c; spawned worker       |
| constant one-response stubs                                                 | local test doubles                      | retained by rule | Spec § 9                      |         — | Task 7.5                         |
| real-Git doubles, fault-injecting hybrids, scenario simulators              | local test doubles                      | retained by rule | Spec § 9                      |         — | Task 7.5                         |
| parser/layout literal meta fixtures                                         | local Markdown                          | retained by rule | Spec § 9 independent evidence |         — | Task 7.5                         |
| E2E canonicalizers and Result assertions                                    | same tests                              | retained by rule | Spec § 9                      |         — | Task 7.5                         |
| notes-sync tests (`user-sync-notes-*`, `notes-*`, integration notes cases)  | same tests                              | carved           | `R-NS`                        |         — | test paths; Task 7.5             |
| branch-tree tests (`project-view-ref`, `completed-index`, ref-reader cases) | same cases                              | carved           | `R-BR`; `R-AR`                |         — | test paths; Task 7.5             |
| in-flight and session-init store-source tests                               | same cases                              | carved           | `R-IF`; `R-CW`; `R-NP`        |         — | test paths; Task 7.5             |
| lifecycle-contribution and path-treatment tests                             | same tests                              | carved           | `R-LC`                        |         — | test paths; Task 7.5             |
| planning-lane cases in `change-facts` tests                                 | same cases                              | carved           | `R-CI`                        |         — | test paths; Task 7.5             |
| inbox-writer and execution-offer tests                                      | same tests                              | retained by rule | `R-NS` survivor               |         — | test paths; Task 7.5             |
| `testing-standards` project override                                        | shared support guidance                 | migrated         | Spec § 9                      |         — | Task 2.5; project-only           |

#### Shipped-content register

- `testing-standards` shared-support guidance lives in the project override at
  `.arc/system/methods/testing-standards.md`; the package source has no override, so Task 2.5 has no package sync.

### Layout per-file rows

| File                                                                               | Class                 | Kind                                                               | Owner                                             | Hits | Lines                                                                                                                                                               |
| ---------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------ | ------------------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `../../.husky/commit-msg`                                                          | `arc-root`            | `root-only-owner`                                                  | repository Git hook invocation                    |    1 |                                                                                                                                                                     |
| `../../.husky/pre-commit`                                                          | `arc-root`            | `root-only-owner`                                                  | repository Git hook invocation                    |    1 |                                                                                                                                                                     |
| `../../.husky/pre-push`                                                            | `arc-root`            | `root-only-owner`                                                  | repository Git hook invocation                    |    1 |                                                                                                                                                                     |
| `../../scripts/check-package-sync.sh`                                              | `arc-root`            | `independent-evidence`; `root-only-owner`; `semantic-policy-owner` | repository shell check                            |   20 | independent-evidence: 6,9,13,16,54,62,73,74,76,100,103,106,111,114; root-only-owner: 17,22; semantic-policy-owner: 31,32,55                                         |
| `../../scripts/check-package-sync.sh`                                              | `template-suffix`     | `independent-evidence`; `semantic-policy-owner`                    | repository shell check                            |    3 | independent-evidence: 62,63; semantic-policy-owner: 65                                                                                                              |
| `../../scripts/check-ts-quality.sh`                                                | `arc-root`            | `independent-evidence`; `root-only-owner`                          | repository shell check                            |    2 | independent-evidence: 40; root-only-owner: 41                                                                                                                       |
| `arc/system/.internal/githooks/commit-msg`                                         | `arc-root`            | `independent-evidence`                                             | Git hook guidance                                 |    2 |                                                                                                                                                                     |
| `arc/system/.internal/githooks/pre-commit`                                         | `active-placement`    | `external-owner`; `independent-evidence`; `semantic-policy-owner`  | lifecycle hook checks (`R-HC`; `R-SP`)            |    7 | external-owner: 216,217; independent-evidence: 202,492; semantic-policy-owner: 194                                                                                  |
| `arc/system/.internal/githooks/pre-commit`                                         | `arc-root`            | `external-owner`; `independent-evidence`; `semantic-policy-owner`  | lifecycle hook checks (`R-HC`; `R-SP`)            |   27 | external-owner: 216,217,238,476,501,505,536,561,587; independent-evidence: 3,5,61,202,274,423,438,447,448,518,529; semantic-policy-owner: 169,196,290,298           |
| `arc/system/.internal/githooks/pre-commit`                                         | `meta-prefix`         | `external-owner`                                                   | lifecycle hook checks (`R-HC`; `R-SP`)            |    2 |                                                                                                                                                                     |
| `arc/system/.internal/githooks/pre-commit`                                         | `method-root`         | `independent-evidence`                                             | lifecycle hook checks (`R-HC`; `R-SP`)            |    1 |                                                                                                                                                                     |
| `arc/system/.internal/githooks/pre-commit`                                         | `planned-placement`   | `external-owner`; `independent-evidence`                           | lifecycle hook checks (`R-HC`; `R-SP`)            |    3 | external-owner: 536; independent-evidence: 492,529                                                                                                                  |
| `arc/system/.internal/githooks/pre-commit`                                         | `roadmap-name`        | `independent-evidence`                                             | lifecycle hook checks (`R-HC`; `R-SP`)            |    6 |                                                                                                                                                                     |
| `arc/system/.internal/githooks/pre-commit`                                         | `tasks-prefix`        | `independent-evidence`                                             | lifecycle hook checks (`R-HC`; `R-SP`)            |    1 |                                                                                                                                                                     |
| `arc/system/.internal/githooks/pre-commit`                                         | `workflow-root`       | `external-owner`                                                   | lifecycle hook checks (`R-HC`; `R-SP`)            |    1 |                                                                                                                                                                     |
| `arc/system/.internal/githooks/pre-push`                                           | `arc-root`            | `independent-evidence`                                             | Git hook guidance                                 |    2 |                                                                                                                                                                     |
| `arc/system/.internal/harness-hooks/claude-code/compaction-recovery.settings.json` | `arc-root`            | `root-only-owner`                                                  | harness hook owner                                |    2 |                                                                                                                                                                     |
| `arc/system/.internal/harness-hooks/codex-cli/hooks.json`                          | `arc-root`            | `root-only-owner`                                                  | harness hook owner                                |    8 |                                                                                                                                                                     |
| `arc/system/.internal/harness-hooks/common/codex-recovery-marker.mjs`              | `arc-root`            | `independent-evidence`; `root-only-owner`; `semantic-policy-owner` | harness hook owner                                |    9 | independent-evidence: 546; root-only-owner: 25,145,199,220,301; semantic-policy-owner: 259,594                                                                      |
| `arc/system/.internal/harness-hooks/common/codex-recovery-marker.mjs`              | `workflow-root`       | `independent-evidence`                                             | harness hook owner                                |    1 |                                                                                                                                                                     |
| `arc/system/.internal/harness-hooks/common/pre-compact-seed.mjs`                   | `arc-root`            | `independent-evidence`; `root-only-owner`                          | harness hook owner                                |    3 | independent-evidence: 140,144; root-only-owner: 149                                                                                                                 |
| `arc/system/.internal/harness-hooks/common/session-start-compact.mjs`              | `arc-root`            | `independent-evidence`                                             | harness hook owner                                |    1 |                                                                                                                                                                     |
| `arc/system/.internal/harness-hooks/common/session-start-compact.mjs`              | `workflow-root`       | `independent-evidence`                                             | harness hook owner                                |    1 |                                                                                                                                                                     |
| `arc/system/.internal/scripts/arc-lib.sh`                                          | `arc-root`            | `independent-evidence`; `root-only-owner`                          | shell configuration owner                         |    2 | independent-evidence: 3; root-only-owner: 40                                                                                                                        |
| `arc/system/.internal/scripts/validate-links.sh`                                   | `arc-root`            | `independent-evidence`                                             | link checker (`R-SP` for archive paths)           |    2 |                                                                                                                                                                     |
| `arc/system/.internal/scripts/validate-links.sh`                                   | `completed-placement` | `external-owner`                                                   | link checker (`R-SP` for archive paths)           |    2 |                                                                                                                                                                     |
| `arc/system/.internal/scripts/validate-links.sh`                                   | `template-suffix`     | `independent-evidence`; `semantic-policy-owner`                    | link checker (`R-SP` for archive paths)           |    3 | independent-evidence: 96; semantic-policy-owner: 101,124                                                                                                            |
| `arc/system/.internal/scripts/verify-integrity.sh`                                 | `active-placement`    | `independent-evidence`                                             | integrity checker (`R-HC`; `R-RM`)                |    1 |                                                                                                                                                                     |
| `arc/system/.internal/scripts/verify-integrity.sh`                                 | `arc-root`            | `independent-evidence`                                             | integrity checker (`R-HC`; `R-RM`)                |    2 |                                                                                                                                                                     |
| `arc/system/.internal/scripts/verify-integrity.sh`                                 | `meta-prefix`         | `external-owner`                                                   | integrity checker (`R-HC`; `R-RM`)                |    1 |                                                                                                                                                                     |
| `arc/system/.internal/scripts/verify-integrity.sh`                                 | `method-root`         | `independent-evidence`                                             | integrity checker (`R-HC`; `R-RM`)                |    1 |                                                                                                                                                                     |
| `arc/system/.internal/scripts/verify-integrity.sh`                                 | `roadmap-name`        | `external-owner`                                                   | integrity checker (`R-HC`; `R-RM`)                |    2 |                                                                                                                                                                     |
| `arc/system/.internal/scripts/verify-integrity.sh`                                 | `workflow-root`       | `root-only-owner`                                                  | integrity checker (`R-HC`; `R-RM`)                |    2 |                                                                                                                                                                     |
| `src/cli.ts`                                                                       | `active-placement`    | `independent-evidence`                                             | CLI descriptions                                  |    1 |                                                                                                                                                                     |
| `src/cli.ts`                                                                       | `completed-placement` | `independent-evidence`                                             | CLI descriptions                                  |    1 |                                                                                                                                                                     |
| `src/cli.ts`                                                                       | `session-notes-name`  | `independent-evidence`                                             | CLI descriptions                                  |    1 |                                                                                                                                                                     |
| `src/commands/active.ts`                                                           | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                     |    5 |                                                                                                                                                                     |
| `src/commands/active/status.ts`                                                    | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                     |    3 |                                                                                                                                                                     |
| `src/commands/active/status.ts`                                                    | `notes-prefix`        | `external-owner`; `independent-evidence`                           | R-SP; comments/imports                            |    2 | external-owner (R-SP): 587; independent-evidence (source documentation): 565                                                                                        |
| `src/commands/active/status.ts`                                                    | `tasks-prefix`        | `independent-evidence`                                             | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/commands/active/types.ts`                                                     | `active-placement`    | `independent-evidence`                                             | active view documentation                         |    6 |                                                                                                                                                                     |
| `src/commands/active/types.ts`                                                     | `arc-root`            | `independent-evidence`                                             | active view documentation                         |    6 |                                                                                                                                                                     |
| `src/commands/active/types.ts`                                                     | `meta-prefix`         | `independent-evidence`                                             | active view documentation                         |    4 |                                                                                                                                                                     |
| `src/commands/constitution/status.ts`                                              | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                |    1 |                                                                                                                                                                     |
| `src/commands/diff.ts`                                                             | `arc-root`            | `independent-evidence`                                             | installer diagnostics                             |    5 |                                                                                                                                                                     |
| `src/commands/health.ts`                                                           | `arc-root`            | `independent-evidence`                                             | installer diagnostics                             |    4 |                                                                                                                                                                     |
| `src/commands/init.ts`                                                             | `arc-root`            | `independent-evidence`; `semantic-policy-owner`                    | installer output / ignore policy                  |   11 | independent-evidence: 4,77,177,225,237,318,334,337; semantic-policy-owner: 277,278,279                                                                              |
| `src/commands/init.ts`                                                             | `template-suffix`     | `independent-evidence`                                             | installer diagnostics                             |    1 |                                                                                                                                                                     |
| `src/commands/init.ts`                                                             | `workflow-root`       | `independent-evidence`                                             | installer diagnostics                             |    1 |                                                                                                                                                                     |
| `src/commands/join.ts`                                                             | `arc-root`            | `independent-evidence`; `semantic-policy-owner`                    | installer output / ignore policy                  |   13 | independent-evidence: 4,6,70,82,172,186,276; semantic-policy-owner: 116,117,118,221,222,223                                                                         |
| `src/commands/reconfigure.ts`                                                      | `arc-root`            | `semantic-policy-owner`                                            | file and ignore policy                            |    3 |                                                                                                                                                                     |
| `src/commands/rename.ts`                                                           | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/commands/rename.ts`                                                           | `arc-root`            | `external-owner`                                                   | R-SP                                              |    2 | external-owner (R-SP): 500,503                                                                                                                                      |
| `src/commands/rename.ts`                                                           | `meta-prefix`         | `external-owner`; `independent-evidence`                           | R-SP; mixed lines                                 |    2 | external-owner (R-SP): 217; independent-evidence (commit Context text): 275                                                                                         |
| `src/commands/rename.ts`                                                           | `planned-placement`   | `external-owner`                                                   | R-SP                                              |    1 | external-owner (R-SP): 500                                                                                                                                          |
| `src/commands/start.ts`                                                            | `active-placement`    | `independent-evidence`; `scanner-false-positive`                   | import syntax / documentation                     |    5 | independent-evidence: 297,344; scanner-false-positive: 31,32,35                                                                                                     |
| `src/commands/start.ts`                                                            | `arc-root`            | `independent-evidence`                                             | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/commands/start.ts`                                                            | `meta-prefix`         | `external-owner`; `independent-evidence`                           | R-SP; mixed lines                                 |    3 | external-owner (R-SP): 191; independent-evidence (commit Context text): 306,316                                                                                     |
| `src/commands/status/format.ts`                                                    | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/commands/status/run.ts`                                                       | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/commands/status/run.ts`                                                       | `session-notes-name`  | `independent-evidence`                                             | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/commands/status/schema.ts`                                                    | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/commands/status/types.ts`                                                     | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/commands/status/types.ts`                                                     | `arc-root`            | `independent-evidence`                                             | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/commands/status/types.ts`                                                     | `completed-placement` | `independent-evidence`                                             | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/commands/status/types.ts`                                                     | `planned-placement`   | `independent-evidence`                                             | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/commands/update.ts`                                                           | `arc-root`            | `independent-evidence`; `semantic-policy-owner`                    | installer output / ignore policy                  |    6 | independent-evidence: 519,545,586; semantic-policy-owner: 433,434,435                                                                                               |
| `src/commands/user/add.ts`                                                         | `working-memory-name` | `independent-evidence`                                             | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/commands/user/compact.ts`                                                     | `arc-root`            | `external-owner`                                                   | R-UW                                              |    1 | external-owner (R-UW): 280                                                                                                                                          |
| `src/commands/user/compact.ts`                                                     | `session-notes-name`  | `external-owner`                                                   | R-NS                                              |    1 | external-owner (R-NS): 76                                                                                                                                           |
| `src/commands/user/drift.ts`                                                       | `completed-placement` | `independent-evidence`                                             | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/commands/user/drift.ts`                                                       | `session-notes-name`  | `external-owner`; `independent-evidence`                           | R-NS; mixed lines                                 |    4 | external-owner (R-NS): 116; independent-evidence (source documentation): 177,268,274                                                                                |
| `src/commands/user/drift.ts`                                                       | `working-memory-name` | `external-owner`; `independent-evidence`                           | R-UW; mixed lines                                 |    3 | external-owner (R-UW): 122; independent-evidence (source documentation): 178,275                                                                                    |
| `src/commands/user/open.ts`                                                        | `arc-root`            | `external-owner`                                                   | R-UW                                              |    3 | external-owner (R-UW): 70,95,108                                                                                                                                    |
| `src/commands/user/open.ts`                                                        | `session-notes-name`  | `independent-evidence`; `semantic-policy-owner`                    | source evidence; mixed lines                      |    4 | independent-evidence (source documentation): 3,20; semantic-policy-owner (template input): 40                                                                       |
| `src/commands/user/save-load.ts`                                                   | `arc-root`            | `external-owner`                                                   | R-NS                                              |    3 | external-owner (R-NS): 317,1186,1273                                                                                                                                |
| `src/commands/user/save-load.ts`                                                   | `completed-placement` | `independent-evidence`                                             | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/commands/user/save-load.ts`                                                   | `meta-prefix`         | `external-owner`                                                   | R-NS                                              |    2 | external-owner (R-NS): 1150,1151                                                                                                                                    |
| `src/commands/user/save-load.ts`                                                   | `session-notes-name`  | `external-owner`; `independent-evidence`                           | R-NS; mixed lines                                 |    3 | external-owner (R-NS): 82; independent-evidence (source documentation): 79,1238                                                                                     |
| `src/commands/user/sync-status.ts`                                                 | `completed-placement` | `independent-evidence`                                             | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/commands/user/sync-status.ts`                                                 | `session-notes-name`  | `independent-evidence`                                             | import syntax / documentation                     |    2 |                                                                                                                                                                     |
| `src/commands/user/types.ts`                                                       | `session-notes-name`  | `independent-evidence`                                             | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/handlers/base.ts`                                                             | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                |    1 |                                                                                                                                                                     |
| `src/handlers/delivery-entry.ts`                                                   | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/handlers/delivery-execution.ts`                                               | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                     |    2 |                                                                                                                                                                     |
| `src/handlers/delivery-execution.ts`                                               | `meta-prefix`         | `independent-evidence`                                             | source evidence                                   |    2 |                                                                                                                                                                     |
| `src/handlers/delivery.ts`                                                         | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/handlers/delivery.ts`                                                         | `tasks-prefix`        | `external-owner`                                                   | R-SP                                              |    1 | external-owner (R-SP): 789                                                                                                                                          |
| `src/handlers/derived-locus-state-probe.ts`                                        | `arc-root`            | `external-owner`                                                   | R-LOC                                             |    1 | external-owner (R-LOC): 82                                                                                                                                          |
| `src/handlers/init.ts`                                                             | `arc-root`            | `independent-evidence`                                             | installer diagnostics                             |    7 |                                                                                                                                                                     |
| `src/handlers/lifecycle.ts`                                                        | `active-placement`    | `independent-evidence`; `scanner-false-positive`                   | source evidence; mixed lines                      |    9 | independent-evidence (diagnostic text): 1557; independent-evidence (source documentation): 1496,1518,1629,2468; scanner-false-positive (import syntax): 40,41,42,43 |
| `src/handlers/lifecycle.ts`                                                        | `arc-root`            | `independent-evidence`                                             | source evidence; mixed lines                      |    3 | independent-evidence (diagnostic text): 333,1064; independent-evidence (source documentation): 281                                                                  |
| `src/handlers/lifecycle.ts`                                                        | `completed-placement` | `independent-evidence`                                             | import syntax / documentation                     |    4 |                                                                                                                                                                     |
| `src/handlers/lifecycle.ts`                                                        | `meta-prefix`         | `external-owner`                                                   | R-SP                                              |    1 | external-owner (R-SP): 1536                                                                                                                                         |
| `src/handlers/lifecycle.ts`                                                        | `tasks-prefix`        | `semantic-policy-owner`                                            | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/handlers/plan.ts`                                                             | `active-placement`    | `independent-evidence`; `scanner-false-positive`                   | import syntax / documentation                     |    2 | independent-evidence: 146; scanner-false-positive: 26                                                                                                               |
| `src/handlers/reconcile.ts`                                                        | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/handlers/recover-probes.ts`                                                   | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                |    1 |                                                                                                                                                                     |
| `src/handlers/shared.ts`                                                           | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                |    2 |                                                                                                                                                                     |
| `src/handlers/start.ts`                                                            | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                     |    2 |                                                                                                                                                                     |
| `src/handlers/status.ts`                                                           | `meta-prefix`         | `external-owner`                                                   | R-SP                                              |    1 | external-owner (R-SP): 1635                                                                                                                                         |
| `src/handlers/view.ts`                                                             | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                     |    3 |                                                                                                                                                                     |
| `src/lib/active/current-workflow-consistency.ts`                                   | `draft-prefix`        | `independent-evidence`; `semantic-policy-owner`                    | source evidence; mixed lines                      |    2 | independent-evidence (workflow diagnostic): 144; semantic-policy-owner (workflow design rule): 127                                                                  |
| `src/lib/active/current-workflow-consistency.ts`                                   | `spec-prefix`         | `independent-evidence`; `semantic-policy-owner`                    | source evidence; mixed lines                      |    3 | independent-evidence (source documentation): 16; independent-evidence (workflow diagnostic): 135; semantic-policy-owner (workflow design rule): 128                 |
| `src/lib/active/meta-reader.ts`                                                    | `active-placement`    | `independent-evidence`; `scanner-false-positive`                   | source evidence                                   |    2 | independent-evidence (source documentation): 2; scanner-false-positive (import syntax): 24                                                                          |
| `src/lib/active/meta-reader.ts`                                                    | `arc-root`            | `independent-evidence`                                             | source evidence                                   |    1 | independent-evidence (source documentation): 2                                                                                                                      |
| `src/lib/active/meta-reader.ts`                                                    | `meta-prefix`         | `external-owner`; `independent-evidence`                           | R-SP; comments/imports                            |    2 | external-owner (R-SP): 40; independent-evidence (source documentation): 63                                                                                          |
| `src/lib/active/meta-reader.ts`                                                    | `spec-prefix`         | `independent-evidence`                                             | source evidence                                   |    3 | independent-evidence (source documentation): 704                                                                                                                    |
| `src/lib/active/spec-input-parser.ts`                                              | `draft-prefix`        | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/active/spec-input-parser.ts`                                              | `spec-prefix`         | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/active/spec-input-parser.ts`                                              | `tasks-prefix`        | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/base-drift/current-adapters.ts`                                           | `active-placement`    | `scanner-false-positive`                                           | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/base-drift/current-adapters.ts`                                           | `arc-root`            | `external-owner`                                                   | R-BR                                              |    1 | external-owner (R-BR): 131                                                                                                                                          |
| `src/lib/base-drift/current-adapters.ts`                                           | `completed-placement` | `external-owner`                                                   | R-BR                                              |    1 | external-owner (R-BR): 131                                                                                                                                          |
| `src/lib/change-facts.ts`                                                          | `active-placement`    | `external-owner`                                                   | R-CI                                              |    1 | external-owner (R-CI): 394                                                                                                                                          |
| `src/lib/change-facts.ts`                                                          | `arc-root`            | `semantic-policy-owner`; `external-owner`                          | change classifier; `R-CI`                         |    6 | semantic-policy-owner: 306,309; external-owner (`R-CI`): 392,393,394,396                                                                                            |
| `src/lib/change-facts.ts`                                                          | `roadmap-name`        | `external-owner`                                                   | R-CI                                              |    2 | external-owner (R-CI): 392                                                                                                                                          |
| `src/lib/change-facts.ts`                                                          | `template-suffix`     | `semantic-policy-owner`                                            | file and ignore policy                            |    1 |                                                                                                                                                                     |
| `src/lib/classification.ts`                                                        | `completed-placement` | `semantic-policy-owner`                                            | file classifier                                   |    1 |                                                                                                                                                                     |
| `src/lib/classification.ts`                                                        | `draft-prefix`        | `semantic-policy-owner`                                            | file classifier                                   |    2 |                                                                                                                                                                     |
| `src/lib/classification.ts`                                                        | `method-root`         | `semantic-policy-owner`                                            | file and ignore policy                            |   26 |                                                                                                                                                                     |
| `src/lib/classification.ts`                                                        | `spec-prefix`         | `semantic-policy-owner`                                            | file classifier                                   |    4 |                                                                                                                                                                     |
| `src/lib/classification.ts`                                                        | `template-suffix`     | `semantic-policy-owner`                                            | file and ignore policy                            |   11 |                                                                                                                                                                     |
| `src/lib/commit-check/artifact-resolver.ts`                                        | `active-placement`    | `independent-evidence`                                             | source evidence                                   |    2 |                                                                                                                                                                     |
| `src/lib/commit-check/artifact-resolver.ts`                                        | `arc-root`            | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/commit-check/artifact-resolver.ts`                                        | `completed-placement` | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/commit-check/policy.ts`                                                   | `meta-prefix`         | `semantic-policy-owner`                                            | commit footer policy                              |    1 |                                                                                                                                                                     |
| `src/lib/commit-check/policy.ts`                                                   | `tasks-prefix`        | `semantic-policy-owner`                                            | commit footer policy                              |    1 |                                                                                                                                                                     |
| `src/lib/compaction-seed/emitter.ts`                                               | `arc-root`            | `external-owner`                                                   | R-UW                                              |    1 | external-owner (R-UW): 92                                                                                                                                           |
| `src/lib/compaction-seed/emitter.ts`                                               | `meta-prefix`         | `external-owner`                                                   | R-SP                                              |    1 | external-owner (R-SP): 220                                                                                                                                          |
| `src/lib/compaction-seed/emitter.ts`                                               | `working-memory-name` | `external-owner`                                                   | R-SP                                              |    1 | external-owner (R-SP): 188                                                                                                                                          |
| `src/lib/config/schema.ts`                                                         | `active-placement`    | `semantic-policy-owner`                                            | configuration schema                              |    1 |                                                                                                                                                                     |
| `src/lib/config/schema.ts`                                                         | `arc-root`            | `semantic-policy-owner`                                            | configuration schema                              |    1 |                                                                                                                                                                     |
| `src/lib/constants.ts`                                                             | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                |    3 |                                                                                                                                                                     |
| `src/lib/coupling-audit/surface-classifier.ts`                                     | `arc-root`            | `scanner-false-positive`                                           | coupling-audit classifier                         |   10 |                                                                                                                                                                     |
| `src/lib/coupling-audit/surface-classifier.ts`                                     | `workflow-root`       | `scanner-false-positive`                                           | coupling-audit classifier                         |    2 |                                                                                                                                                                     |
| `src/lib/delivery/from-branch.ts`                                                  | `draft-prefix`        | `external-owner`                                                   | R-LC                                              |    1 | external-owner (R-LC): 556                                                                                                                                          |
| `src/lib/delivery/from-branch.ts`                                                  | `meta-prefix`         | `external-owner`                                                   | R-LC                                              |    1 | external-owner (R-LC): 555                                                                                                                                          |
| `src/lib/delivery/from-branch.ts`                                                  | `notes-prefix`        | `external-owner`                                                   | R-LC                                              |    1 | external-owner (R-LC): 558                                                                                                                                          |
| `src/lib/delivery/from-branch.ts`                                                  | `spec-prefix`         | `external-owner`                                                   | R-LC                                              |    1 | external-owner (R-LC): 557                                                                                                                                          |
| `src/lib/delivery/from-branch.ts`                                                  | `tasks-prefix`        | `external-owner`; `semantic-policy-owner`                          | R-LC; mixed lines                                 |    2 | external-owner (R-LC): 559; semantic-policy-owner (commit footer parser): 569                                                                                       |
| `src/lib/delivery/git-lifecycle-contribution.ts`                                   | `arc-root`            | `external-owner`                                                   | R-LC                                              |    4 | external-owner (R-LC): 41                                                                                                                                           |
| `src/lib/errand/promote-runtime.ts`                                                | `active-placement`    | `external-owner`; `scanner-false-positive`                         | R-LW; mixed lines                                 |    3 | external-owner (R-LW): 251; scanner-false-positive (import syntax): 6,11                                                                                            |
| `src/lib/git/base-distance.ts`                                                     | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                |    1 |                                                                                                                                                                     |
| `src/lib/git/in-flight-derivation.ts`                                              | `active-placement`    | `independent-evidence`; `scanner-false-positive`                   | source evidence; mixed lines                      |    4 | independent-evidence (source documentation): 1136; scanner-false-positive (import syntax): 26,27,28                                                                 |
| `src/lib/git/in-flight-derivation.ts`                                              | `arc-root`            | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/git/remote-ref-reader.ts`                                                 | `active-placement`    | `external-owner`; `independent-evidence`                           | R-BR; mixed lines                                 |    5 | external-owner (R-BR): 660; independent-evidence (source documentation): 598,636,657                                                                                |
| `src/lib/git/remote-ref-reader.ts`                                                 | `arc-root`            | `external-owner`; `independent-evidence`                           | R-BR; mixed lines                                 |    4 | external-owner (R-BR): 660; independent-evidence (source documentation): 598,636,657                                                                                |
| `src/lib/git/remote-ref-reader.ts`                                                 | `meta-prefix`         | `external-owner`; `independent-evidence`                           | R-BR; mixed lines                                 |    4 | external-owner (R-BR): 640; independent-evidence (source documentation): 598,636                                                                                    |
| `src/lib/git/worktree-location.ts`                                                 | `template-suffix`     | `scanner-false-positive`                                           | template type identifier                          |    1 |                                                                                                                                                                     |
| `src/lib/git/worktree-marker.ts`                                                   | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                |    3 |                                                                                                                                                                     |
| `src/lib/git/worktree-roster.ts`                                                   | `active-placement`    | `external-owner`; `independent-evidence`; `scanner-false-positive` | R-SP; comments/imports                            |    7 | external-owner (R-SP): 364; independent-evidence (source documentation): 107,292,311; scanner-false-positive (import syntax): 13,16,17                              |
| `src/lib/git/worktree-roster.ts`                                                   | `arc-root`            | `external-owner`                                                   | R-SP                                              |    3 | external-owner (R-SP): 320,364,424                                                                                                                                  |
| `src/lib/git/worktree-roster.ts`                                                   | `meta-prefix`         | `external-owner`                                                   | R-PL                                              |    1 | external-owner (R-PL): 428                                                                                                                                          |
| `src/lib/git/worktree-scaffold.ts`                                                 | `active-placement`    | `scanner-false-positive`                                           | source evidence                                   |    3 |                                                                                                                                                                     |
| `src/lib/git/write-context.ts`                                                     | `arc-root`            | `independent-evidence`                                             | source evidence                                   |    3 |                                                                                                                                                                     |
| `src/lib/git/write-context.ts`                                                     | `draft-prefix`        | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/git/write-context.ts`                                                     | `notes-prefix`        | `independent-evidence`                                             | source evidence                                   |    2 |                                                                                                                                                                     |
| `src/lib/handoff/restate-candidates.ts`                                            | `notes-prefix`        | `external-owner`; `independent-evidence`                           | R-SP; comments/imports                            |    2 | external-owner (R-SP): 64; independent-evidence (source documentation): 45                                                                                          |
| `src/lib/handoff/restate-candidates.ts`                                            | `session-notes-name`  | `independent-evidence`                                             | source evidence                                   |    1 | independent-evidence (source documentation): 53                                                                                                                     |
| `src/lib/handoff/session-notes-path.ts`                                            | `arc-root`            | `external-owner`; `independent-evidence`                           | R-NS; mixed lines                                 |    2 | external-owner (R-NS): 91; independent-evidence (source documentation): 4                                                                                           |
| `src/lib/handoff/session-notes-path.ts`                                            | `session-notes-name`  | `external-owner`; `independent-evidence`                           | R-NS; mixed lines                                 |    3 | external-owner (R-NS): 101; independent-evidence (source documentation): 4,81                                                                                       |
| `src/lib/kernel/schema/vocabulary.ts`                                              | `template-suffix`     | `scanner-false-positive`                                           | identifier syntax                                 |    1 |                                                                                                                                                                     |
| `src/lib/layout/projection.ts`                                                     | `arc-root`            | `layout-definition`                                                | layout resolver                                   |   14 |                                                                                                                                                                     |
| `src/lib/layout/projection.ts`                                                     | `completed-placement` | `layout-definition`                                                | layout resolver                                   |    2 |                                                                                                                                                                     |
| `src/lib/layout/projection.ts`                                                     | `planned-placement`   | `layout-definition`                                                | layout resolver                                   |    1 |                                                                                                                                                                     |
| `src/lib/layout/projection.ts`                                                     | `roadmap-name`        | `layout-definition`                                                | layout resolver                                   |    2 |                                                                                                                                                                     |
| `src/lib/layout/projection.ts`                                                     | `session-notes-name`  | `layout-definition`                                                | layout resolver                                   |    2 |                                                                                                                                                                     |
| `src/lib/layout/projection.ts`                                                     | `working-memory-name` | `layout-definition`                                                | layout resolver                                   |    2 |                                                                                                                                                                     |
| `src/lib/layout/registry.ts`                                                       | `template-suffix`     | `layout-definition`                                                | layout resolver                                   |    2 |                                                                                                                                                                     |
| `src/lib/layout/template-output.ts`                                                | `template-suffix`     | `layout-definition`                                                | layout resolver                                   |    2 |                                                                                                                                                                     |
| `src/lib/manifest/apply.ts`                                                        | `arc-root`            | `independent-evidence`                                             | source documentation                              |    1 |                                                                                                                                                                     |
| `src/lib/manifest/apply.ts`                                                        | `template-suffix`     | `scanner-false-positive`                                           | identifier syntax                                 |   10 |                                                                                                                                                                     |
| `src/lib/markdown/authority.ts`                                                    | `active-placement`    | `external-owner`                                                   | R-SP                                              |    1 | external-owner (R-SP): 99                                                                                                                                           |
| `src/lib/markdown/authority.ts`                                                    | `arc-root`            | `external-owner`; `semantic-policy-owner`                          | R-RM; R-SP; comments/imports                      |    8 | external-owner (R-RM): 167; external-owner (R-SP): 91,99; semantic-policy-owner (Markdown authority): 15                                                            |
| `src/lib/markdown/authority.ts`                                                    | `completed-placement` | `external-owner`                                                   | R-SP                                              |    1 | external-owner (R-SP): 91                                                                                                                                           |
| `src/lib/markdown/authority.ts`                                                    | `roadmap-name`        | `external-owner`                                                   | R-RM                                              |    2 | external-owner (R-RM): 167                                                                                                                                          |
| `src/lib/markdown/descriptor-worktree.ts`                                          | `tasks-prefix`        | `external-owner`                                                   | R-SP                                              |    1 | external-owner (R-SP): 39                                                                                                                                           |
| `src/lib/markdown/format-plan.ts`                                                  | `active-placement`    | `scanner-false-positive`                                           | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/markdown/format-plan.ts`                                                  | `template-suffix`     | `scanner-false-positive`                                           | identifier syntax                                 |    1 |                                                                                                                                                                     |
| `src/lib/markdown/selection.ts`                                                    | `arc-root`            | `external-owner`                                                   | R-LC                                              |    4 | external-owner (R-LC): 17,18,19,20                                                                                                                                  |
| `src/lib/markdown/selection.ts`                                                    | `completed-placement` | `external-owner`                                                   | R-LC                                              |    1 | external-owner (R-LC): 17                                                                                                                                           |
| `src/lib/markdown/selection.ts`                                                    | `working-memory-name` | `external-owner`                                                   | R-LC                                              |    1 | external-owner (R-LC): 18                                                                                                                                           |
| `src/lib/paths.ts`                                                                 | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                |    1 |                                                                                                                                                                     |
| `src/lib/recover/audit.ts`                                                         | `active-placement`    | `external-owner`                                                   | R-SP                                              |    1 | external-owner (R-SP): 554                                                                                                                                          |
| `src/lib/recover/audit.ts`                                                         | `arc-root`            | `external-owner`                                                   | R-SP                                              |    2 | external-owner (R-SP): 554,557                                                                                                                                      |
| `src/lib/recover/audit.ts`                                                         | `completed-placement` | `external-owner`                                                   | R-SP                                              |    1 | external-owner (R-SP): 557                                                                                                                                          |
| `src/lib/recover/audit.ts`                                                         | `meta-prefix`         | `external-owner`                                                   | R-SP                                              |    2 | external-owner (R-SP): 554,557                                                                                                                                      |
| `src/lib/recover/locus-context.ts`                                                 | `draft-prefix`        | `scanner-false-positive`                                           | workflow filename token                           |    2 |                                                                                                                                                                     |
| `src/lib/release/audit-log.ts`                                                     | `arc-root`            | `independent-evidence`                                             | source evidence                                   |    2 |                                                                                                                                                                     |
| `src/lib/release/interlock-validation.ts`                                          | `active-placement`    | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/release/interlock-validation.ts`                                          | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                |    1 |                                                                                                                                                                     |
| `src/lib/release/setup-marker.ts`                                                  | `arc-root`            | `independent-evidence`                                             | source evidence                                   |    3 |                                                                                                                                                                     |
| `src/lib/release/wu-resolution.ts`                                                 | `active-placement`    | `independent-evidence`; `scanner-false-positive`                   | source evidence; mixed lines                      |    2 | independent-evidence (source documentation): 28; scanner-false-positive (import syntax): 15                                                                         |
| `src/lib/release/wu-resolution.ts`                                                 | `meta-prefix`         | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/session-envelope/registry.ts`                                             | `active-placement`    | `scanner-false-positive`                                           | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/session-init/cohort-doc.ts`                                               | `active-placement`    | `scanner-false-positive`                                           | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/session-init/cohort-doc.ts`                                               | `planned-placement`   | `independent-evidence`                                             | source evidence                                   |    2 |                                                                                                                                                                     |
| `src/lib/session-init/in-flight-composition.ts`                                    | `active-placement`    | `scanner-false-positive`                                           | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/session-init/in-flight-work-unit-sweep.ts`                                | `active-placement`    | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/session-init/in-flight-work-unit-sweep.ts`                                | `completed-placement` | `independent-evidence`                                             | source evidence                                   |    3 |                                                                                                                                                                     |
| `src/lib/session-init/orphan-branch-sweep.ts`                                      | `completed-placement` | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/session-init/retired-subdir-detection.ts`                                 | `arc-root`            | `external-owner`; `independent-evidence`                           | R-UW; mixed lines                                 |    2 | external-owner (R-UW): 109; independent-evidence (source documentation): 35                                                                                         |
| `src/lib/session-init/retired-subdir-detection.ts`                                 | `completed-placement` | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/session-init/stale-worktree-sweep.ts`                                     | `completed-placement` | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/setup.ts`                                                                 | `arc-root`            | `external-owner`                                                   | R-RM                                              |    1 | external-owner (R-RM): 31                                                                                                                                           |
| `src/lib/setup.ts`                                                                 | `roadmap-name`        | `external-owner`                                                   | R-RM                                              |    2 | external-owner (R-RM): 31                                                                                                                                           |
| `src/lib/setup.ts`                                                                 | `working-memory-name` | `external-owner`                                                   | R-UW                                              |    1 | external-owner (R-UW): 147                                                                                                                                          |
| `src/lib/status/assemble-user-view.ts`                                             | `arc-root`            | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/status/in-flight-mine.ts`                                                 | `active-placement`    | `scanner-false-positive`                                           | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/status/project-roadmap-render.ts`                                         | `arc-root`            | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/status/project-view.ts`                                                   | `active-placement`    | `external-owner`; `scanner-false-positive`                         | R-PL; mixed lines                                 |    3 | external-owner (R-PL): 431; scanner-false-positive (import syntax): 16,17                                                                                           |
| `src/lib/status/project-view.ts`                                                   | `arc-root`            | `external-owner`; `independent-evidence`                           | R-PL; mixed lines                                 |    6 | external-owner (R-PL): 431,432,433,434; independent-evidence (source documentation): 2,206                                                                          |
| `src/lib/status/project-view.ts`                                                   | `completed-placement` | `external-owner`                                                   | R-PL                                              |    1 | external-owner (R-PL): 434                                                                                                                                          |
| `src/lib/status/project-view.ts`                                                   | `meta-prefix`         | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/status/project-view.ts`                                                   | `planned-placement`   | `external-owner`                                                   | R-PL                                              |    1 | external-owner (R-PL): 432                                                                                                                                          |
| `src/lib/status/project-view.ts`                                                   | `roadmap-name`        | `independent-evidence`                                             | source evidence                                   |    2 |                                                                                                                                                                     |
| `src/lib/status/ready-mine-source.ts`                                              | `active-placement`    | `scanner-false-positive`                                           | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/status/ready-mine-source.ts`                                              | `arc-root`            | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/status/ready-mine-source.ts`                                              | `completed-placement` | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/status/ready-mine-source.ts`                                              | `meta-prefix`         | `independent-evidence`                                             | source evidence                                   |    2 |                                                                                                                                                                     |
| `src/lib/status/ready-mine-source.ts`                                              | `planned-placement`   | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/status/ready-mine.ts`                                                     | `active-placement`    | `scanner-false-positive`                                           | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/status/ready-mine.ts`                                                     | `planned-placement`   | `independent-evidence`                                             | source evidence                                   |    2 |                                                                                                                                                                     |
| `src/lib/status/render.ts`                                                         | `active-placement`    | `scanner-false-positive`                                           | source evidence                                   |    2 |                                                                                                                                                                     |
| `src/lib/types.ts`                                                                 | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                |    1 |                                                                                                                                                                     |
| `src/lib/user-surface-migration.ts`                                                | `arc-root`            | `external-owner`; `independent-evidence`                           | pre-publication compatibility reader; mixed lines |    3 | external-owner (pre-publication compatibility reader): 164,165; independent-evidence (source documentation): 5                                                      |
| `src/lib/user-surface-migration.ts`                                                | `session-notes-name`  | `external-owner`                                                   | pre-publication compatibility reader              |    1 | external-owner (pre-publication compatibility reader): 70                                                                                                           |
| `src/lib/user-surfaces.ts`                                                         | `arc-root`            | `external-owner`                                                   | R-UW                                              |    1 | external-owner (R-UW): 117                                                                                                                                          |
| `src/lib/user-sync/parser.ts`                                                      | `working-memory-name` | `external-owner`; `independent-evidence`                           | R-SP; comments/imports                            |    2 | external-owner (R-SP): 53; independent-evidence (source documentation): 4                                                                                           |
| `src/lib/user-sync/repo-shared-paths.ts`                                           | `arc-root`            | `independent-evidence`                                             | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/lib/validation-surfaces/registry.ts`                                          | `active-placement`    | `scanner-false-positive`                                           | source evidence                                   |    1 |                                                                                                                                                                     |
| `src/prompts/removal-prompts.ts`                                                   | `arc-root`            | `independent-evidence`                                             | installer diagnostics                             |    3 |                                                                                                                                                                     |
| `src/scripts/audit-method-triggers.ts`                                             | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                |    1 |                                                                                                                                                                     |
| `src/scripts/audit-method-triggers.ts`                                             | `method-root`         | `pre-resolved-path`                                                | method trigger auditor (`systemDir`)              |    2 |                                                                                                                                                                     |
| `src/scripts/audit-method-triggers.ts`                                             | `workflow-root`       | `pre-resolved-path`                                                | method trigger auditor (`systemDir`)              |    1 |                                                                                                                                                                     |
| `src/scripts/base/merge-composition.ts`                                            | `arc-root`            | `external-owner`                                                   | R-RM                                              |    2 | external-owner (R-RM): 176                                                                                                                                          |
| `src/scripts/base/merge-composition.ts`                                            | `roadmap-name`        | `external-owner`                                                   | R-RM                                              |    3 | external-owner (R-RM): 176                                                                                                                                          |
| `src/scripts/integration/checkpoint-composition.ts`                                | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                     |    2 |                                                                                                                                                                     |
| `src/scripts/measure-e2e-shards.ts`                                                | `workflow-root`       | `scanner-false-positive`                                           | CI workflow fixture                               |    1 |                                                                                                                                                                     |
| `src/scripts/render-framework.ts`                                                  | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                |    1 |                                                                                                                                                                     |
| `src/scripts/review-gate/hosts/local/live-context.ts`                              | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/scripts/review-gate/policy/assurance.ts`                                      | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/scripts/review-gate/policy/pre-publication-composition.ts`                    | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                     |    1 |                                                                                                                                                                     |
| `src/scripts/review-gate/readiness.ts`                                             | `active-placement`    | `external-owner`; `scanner-false-positive`                         | R-SP; comments/imports                            |    2 | external-owner (R-SP): 668; scanner-false-positive (import syntax): 43                                                                                              |
| `src/scripts/review-gate/readiness.ts`                                             | `arc-root`            | `external-owner`; `independent-evidence`                           | R-SP; comments/imports                            |   16 | external-owner (R-SP): 668,703,707,715,810,811,812,813,844,845,846,903,928,975; independent-evidence (review diagnostic): 683,999                                   |
| `src/scripts/review-gate/readiness.ts`                                             | `completed-placement` | `external-owner`                                                   | R-SP                                              |    3 | external-owner (R-SP): 715,928,975                                                                                                                                  |
| `src/scripts/review-gate/readiness.ts`                                             | `meta-prefix`         | `external-owner`                                                   | R-SP                                              |    4 | external-owner (R-SP): 668,732,784,975                                                                                                                              |
| `src/scripts/review-gate/readiness.ts`                                             | `planned-placement`   | `external-owner`                                                   | R-SP                                              |    1 | external-owner (R-SP): 903                                                                                                                                          |
| `src/scripts/validate-extension-points.ts`                                         | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                |    3 |                                                                                                                                                                     |
| `src/scripts/validate-extension-points.ts`                                         | `workflow-root`       | `independent-evidence`                                             | owner documentation or diagnostics                |    2 |                                                                                                                                                                     |
| `src/scripts/validate-package-neutrality.ts`                                       | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                |    5 |                                                                                                                                                                     |
| `src/lib/work-unit/backlog-stub.ts`                                                | `arc-root`            | `independent-evidence`; `external-owner`                           | source documentation; R-PL                        |    4 | independent-evidence (source documentation): 91,122; external-owner (R-PL): 103,128                                                                                 |
| `src/lib/work-unit/backlog-stub.ts`                                                | `draft-prefix`        | `external-owner`                                                   | R-PL                                              |    1 | external-owner (R-PL): 75                                                                                                                                           |
| `src/lib/work-unit/backlog-stub.ts`                                                | `meta-prefix`         | `independent-evidence`                                             | source documentation                              |    1 | independent-evidence (source documentation): 47                                                                                                                     |
| `src/lib/work-unit/backlog-stub.ts`                                                | `planned-placement`   | `independent-evidence`                                             | source documentation                              |    1 | independent-evidence (source documentation): 3                                                                                                                      |
| `src/lib/work-unit/completed-index.ts`                                             | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    1 | scanner-false-positive (import syntax): 28                                                                                                                          |
| `src/lib/work-unit/completed-index.ts`                                             | `arc-root`            | `independent-evidence`; `external-owner`                           | source documentation; R-BR; R-AR                  |   12 | independent-evidence (source documentation): 5,44,89,122,164,170,257,400,413; external-owner (R-BR): 90; external-owner (R-AR): 138,449                             |
| `src/lib/work-unit/completed-index.ts`                                             | `completed-placement` | `independent-evidence`; `external-owner`                           | source documentation; R-BR; R-AR                  |   17 | independent-evidence (source documentation): 2,5,49,89,122,127,129,164,170,176,257,413,430; external-owner (R-BR): 90; external-owner (R-AR): 138,449               |
| `src/lib/work-unit/completed-index.ts`                                             | `meta-prefix`         | `external-owner`                                                   | R-BR                                              |    2 | external-owner (R-BR): 232,285                                                                                                                                      |
| `src/lib/work-unit/decompose-sweep.ts`                                             | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    1 | scanner-false-positive (import syntax): 19                                                                                                                          |
| `src/lib/work-unit/decompose-v3-conservation.ts`                                   | `draft-prefix`        | `external-owner`                                                   | R-LW                                              |    1 | external-owner (R-LW): 111                                                                                                                                          |
| `src/lib/work-unit/decompose-v3-conservation.ts`                                   | `notes-prefix`        | `external-owner`                                                   | R-LW                                              |    1 | external-owner (R-LW): 117                                                                                                                                          |
| `src/lib/work-unit/decompose-v3-conservation.ts`                                   | `spec-prefix`         | `external-owner`                                                   | R-LW                                              |    5 | external-owner (R-LW): 101,102,113,114                                                                                                                              |
| `src/lib/work-unit/decompose-v3-conservation.ts`                                   | `tasks-prefix`        | `external-owner`                                                   | R-LW                                              |    1 | external-owner (R-LW): 116                                                                                                                                          |
| `src/lib/work-unit/decompose-v3-plan-composer.ts`                                  | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    1 | scanner-false-positive (import syntax): 14                                                                                                                          |
| `src/lib/work-unit/decompose-v3-preflight.ts`                                      | `draft-prefix`        | `external-owner`                                                   | R-LW                                              |    1 | external-owner (R-LW): 240                                                                                                                                          |
| `src/lib/work-unit/decompose-v3-preflight.ts`                                      | `spec-prefix`         | `external-owner`                                                   | R-LW                                              |    3 | external-owner (R-LW): 241,242                                                                                                                                      |
| `src/lib/work-unit/decompose-v3-preflight.ts`                                      | `tasks-prefix`        | `external-owner`                                                   | R-LW                                              |    1 | external-owner (R-LW): 277                                                                                                                                          |
| `src/lib/work-unit/decompose-v3-repository-plan.ts`                                | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    3 | scanner-false-positive (import syntax): 6,7,8                                                                                                                       |
| `src/lib/work-unit/decompose-v3-repository-plan.ts`                                | `draft-prefix`        | `external-owner`                                                   | R-LW                                              |    2 | external-owner (R-LW): 193,572                                                                                                                                      |
| `src/lib/work-unit/decompose-v3-repository-plan.ts`                                | `meta-prefix`         | `external-owner`                                                   | R-LW                                              |    2 | external-owner (R-LW): 481,571                                                                                                                                      |
| `src/lib/work-unit/decompose-v3-repository-plan.ts`                                | `notes-prefix`        | `external-owner`                                                   | R-LW                                              |    1 | external-owner (R-LW): 574                                                                                                                                          |
| `src/lib/work-unit/decompose-v3-repository-plan.ts`                                | `spec-prefix`         | `external-owner`                                                   | R-LW                                              |    2 | external-owner (R-LW): 207,212                                                                                                                                      |
| `src/lib/work-unit/decompose-v3-repository-plan.ts`                                | `tasks-prefix`        | `external-owner`                                                   | R-LW                                              |    1 | external-owner (R-LW): 573                                                                                                                                          |
| `src/lib/work-unit/decompose-v3-repository-tree.ts`                                | `active-placement`    | `scanner-false-positive`; `external-owner`                         | import syntax; R-PL                               |    3 | scanner-false-positive (import syntax): 6,7; external-owner (R-PL): 114                                                                                             |
| `src/lib/work-unit/decompose-v3-repository-tree.ts`                                | `arc-root`            | `external-owner`                                                   | R-PL                                              |    6 | external-owner (R-PL): 114,115,116                                                                                                                                  |
| `src/lib/work-unit/decompose-v3-repository-tree.ts`                                | `planned-placement`   | `external-owner`                                                   | R-PL                                              |    1 | external-owner (R-PL): 115                                                                                                                                          |
| `src/lib/work-unit/decompose-v3-repository-tree.ts`                                | `spec-prefix`         | `external-owner`                                                   | R-PL                                              |    2 | external-owner (R-PL): 147                                                                                                                                          |
| `src/lib/work-unit/decompose-v3-schema.ts`                                         | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    1 | scanner-false-positive (import syntax): 13                                                                                                                          |
| `src/lib/work-unit/executor-context.ts`                                            | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    3 | scanner-false-positive (import syntax): 56,57,58                                                                                                                    |
| `src/lib/work-unit/executor-context.ts`                                            | `arc-root`            | `independent-evidence`                                             | source documentation                              |    1 | independent-evidence (source documentation): 101                                                                                                                    |
| `src/lib/work-unit/git-candidate-subject.ts`                                       | `active-placement`    | `external-owner`                                                   | R-CR                                              |    1 | external-owner (R-CR): 123                                                                                                                                          |
| `src/lib/work-unit/git-candidate-subject.ts`                                       | `arc-root`            | `external-owner`                                                   | R-CR                                              |    1 | external-owner (R-CR): 123                                                                                                                                          |
| `src/lib/work-unit/git-candidate-subject.ts`                                       | `notes-prefix`        | `external-owner`                                                   | R-CR                                              |    1 | external-owner (R-CR): 115                                                                                                                                          |
| `src/lib/work-unit/git-decompose-transition-base-advancement.ts`                   | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    1 | scanner-false-positive (import syntax): 6                                                                                                                           |
| `src/lib/work-unit/git-decompose-transition-base-advancement.ts`                   | `arc-root`            | `external-owner`                                                   | R-BR                                              |    3 | external-owner (R-BR): 606,607,608                                                                                                                                  |
| `src/lib/work-unit/git-decompose-v3-destination-validation.ts`                     | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    1 | scanner-false-positive (import syntax): 11                                                                                                                          |
| `src/lib/work-unit/git-decompose-v3-destination-validation.ts`                     | `meta-prefix`         | `external-owner`                                                   | R-LW                                              |    1 | external-owner (R-LW): 270                                                                                                                                          |
| `src/lib/work-unit/git-decompose-v3-preflight.ts`                                  | `active-placement`    | `scanner-false-positive`; `external-owner`                         | import syntax; R-PL                               |    2 | scanner-false-positive (import syntax): 3; external-owner (R-PL): 72                                                                                                |
| `src/lib/work-unit/git-decompose-v3-preflight.ts`                                  | `arc-root`            | `external-owner`                                                   | R-PL                                              |    9 | external-owner (R-PL): 72,73,142,143,144                                                                                                                            |
| `src/lib/work-unit/git-decompose-v3-preflight.ts`                                  | `planned-placement`   | `external-owner`                                                   | R-PL                                              |    1 | external-owner (R-PL): 73                                                                                                                                           |
| `src/lib/work-unit/git-graduation-transaction.ts`                                  | `meta-prefix`         | `external-owner`                                                   | R-LW                                              |    1 | external-owner (R-LW): 265                                                                                                                                          |
| `src/lib/work-unit/git-retirement-authorization-context.ts`                        | `active-placement`    | `scanner-false-positive`; `external-owner`                         | import syntax; R-BR                               |    3 | scanner-false-positive (import syntax): 5,6; external-owner (R-BR): 153                                                                                             |
| `src/lib/work-unit/git-retirement-authorization-context.ts`                        | `arc-root`            | `external-owner`                                                   | R-BR; R-RM                                        |   12 | external-owner (R-BR): 153,154,155,451,497,498,499,500; external-owner (R-RM): 234                                                                                  |
| `src/lib/work-unit/git-retirement-authorization-context.ts`                        | `meta-prefix`         | `external-owner`                                                   | R-BR                                              |    3 | external-owner (R-BR): 144,177,495                                                                                                                                  |
| `src/lib/work-unit/git-retirement-authorization-context.ts`                        | `planned-placement`   | `external-owner`                                                   | R-BR                                              |    1 | external-owner (R-BR): 154                                                                                                                                          |
| `src/lib/work-unit/git-retirement-authorization-context.ts`                        | `roadmap-name`        | `external-owner`                                                   | R-RM                                              |    2 | external-owner (R-RM): 234                                                                                                                                          |
| `src/lib/work-unit/lifecycle-deps.ts`                                              | `completed-placement` | `independent-evidence`                                             | source documentation                              |    1 | independent-evidence (source documentation): 7                                                                                                                      |
| `src/lib/work-unit/mutators/rewrite-renamed-meta.ts`                               | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    1 | scanner-false-positive (import syntax): 10                                                                                                                          |
| `src/lib/work-unit/mutators/set-phase.ts`                                          | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    2 | scanner-false-positive (import syntax): 18,19                                                                                                                       |
| `src/lib/work-unit/park-planning-landing.ts`                                       | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    2 | scanner-false-positive (import syntax): 11,12                                                                                                                       |
| `src/lib/work-unit/park-planning-landing.ts`                                       | `meta-prefix`         | `external-owner`                                                   | R-LW                                              |    2 | external-owner (R-LW): 268,305                                                                                                                                      |
| `src/lib/work-unit/park-retirement-proof.ts`                                       | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    1 | scanner-false-positive (import syntax): 11                                                                                                                          |
| `src/lib/work-unit/park-retirement-proof.ts`                                       | `meta-prefix`         | `external-owner`                                                   | R-LW                                              |    1 | external-owner (R-LW): 129                                                                                                                                          |
| `src/lib/work-unit/planning-artifact-tuple.ts`                                     | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    2 | scanner-false-positive (import syntax): 5,10                                                                                                                        |
| `src/lib/work-unit/planning-artifact-tuple.ts`                                     | `draft-prefix`        | `external-owner`                                                   | R-PL                                              |    1 | external-owner (R-PL): 61                                                                                                                                           |
| `src/lib/work-unit/planning-artifact-tuple.ts`                                     | `meta-prefix`         | `external-owner`                                                   | R-PL                                              |    1 | external-owner (R-PL): 93                                                                                                                                           |
| `src/lib/work-unit/planning-artifact-tuple.ts`                                     | `spec-prefix`         | `external-owner`                                                   | R-PL                                              |    3 | external-owner (R-PL): 62,65                                                                                                                                        |
| `src/lib/work-unit/planning-artifact-tuple.ts`                                     | `tasks-prefix`        | `external-owner`                                                   | R-PL                                              |    3 | external-owner (R-PL): 123,124,171                                                                                                                                  |
| `src/lib/work-unit/pointer-record.ts`                                              | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    1 | scanner-false-positive (import syntax): 22                                                                                                                          |
| `src/lib/work-unit/pointer-record.ts`                                              | `planned-placement`   | `independent-evidence`                                             | source documentation                              |    1 | independent-evidence (source documentation): 8                                                                                                                      |
| `src/lib/work-unit/rename-reference-sweep.ts`                                      | `active-placement`    | `scanner-false-positive`; `external-owner`                         | import syntax; R-PL                               |    2 | scanner-false-positive (import syntax): 10; external-owner (R-PL): 155                                                                                              |
| `src/lib/work-unit/rename-reference-sweep.ts`                                      | `meta-prefix`         | `external-owner`                                                   | R-PL                                              |    1 | external-owner (R-PL): 133                                                                                                                                          |
| `src/lib/work-unit/rename-reference-sweep.ts`                                      | `planned-placement`   | `external-owner`                                                   | R-PL                                              |    1 | external-owner (R-PL): 156                                                                                                                                          |
| `src/lib/work-unit/side-effects/discharge-dep-edges.ts`                            | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    1 | scanner-false-positive (import syntax): 18                                                                                                                          |
| `src/lib/work-unit/side-effects/readiness-regen.ts`                                | `arc-root`            | `independent-evidence`; `external-owner`                           | source documentation; R-UW                        |    4 | independent-evidence (source documentation): 46,128,166; external-owner (R-UW): 79                                                                                  |
| `src/lib/work-unit/side-effects/readiness-regen.ts`                                | `roadmap-name`        | `independent-evidence`                                             | source documentation                              |    2 | independent-evidence (source documentation): 151,153                                                                                                                |
| `src/lib/work-unit/validated-graduation-transaction.ts`                            | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    2 | scanner-false-positive (import syntax): 14,23                                                                                                                       |
| `src/lib/work-unit/validated-graduation-transaction.ts`                            | `meta-prefix`         | `external-owner`                                                   | R-LW                                              |    1 | external-owner (R-LW): 202                                                                                                                                          |
| `src/lib/work-unit/verbs/abandon.ts`                                               | `active-placement`    | `scanner-false-positive`; `independent-evidence`                   | import syntax; source documentation               |    3 | scanner-false-positive (import syntax): 35,36; independent-evidence (source documentation): 395                                                                     |
| `src/lib/work-unit/verbs/finalize-stage.ts`                                        | `active-placement`    | `scanner-false-positive`; `independent-evidence`                   | import syntax; source documentation               |    4 | scanner-false-positive (import syntax): 32,33; independent-evidence (source documentation): 85,98                                                                   |
| `src/lib/work-unit/verbs/finalize-stage.ts`                                        | `arc-root`            | `independent-evidence`                                             | source documentation                              |    2 | independent-evidence (source documentation): 85,98                                                                                                                  |
| `src/lib/work-unit/verbs/finalize-stage.ts`                                        | `tasks-prefix`        | `external-owner`                                                   | R-LW                                              |    1 | external-owner (R-LW): 155                                                                                                                                          |
| `src/lib/work-unit/verbs/promote-demote.ts`                                        | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    1 | scanner-false-positive (import syntax): 31                                                                                                                          |
| `src/lib/work-unit/verbs/promote-demote.ts`                                        | `arc-root`            | `independent-evidence`                                             | source documentation                              |    1 | independent-evidence (source documentation): 99                                                                                                                     |
| `src/lib/work-unit/verbs/publish.ts`                                               | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    2 | scanner-false-positive (import syntax): 27,28                                                                                                                       |
| `src/lib/work-unit/verbs/reopen.ts`                                                | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    2 | scanner-false-positive (import syntax): 34,35                                                                                                                       |
| `src/lib/work-unit/verbs/repoint-design.ts`                                        | `active-placement`    | `independent-evidence`                                             | source documentation                              |    2 | independent-evidence (source documentation): 51,64                                                                                                                  |
| `src/lib/work-unit/verbs/repoint-design.ts`                                        | `arc-root`            | `independent-evidence`                                             | source documentation                              |    2 | independent-evidence (source documentation): 51,64                                                                                                                  |
| `src/lib/work-unit/verbs/repoint-design.ts`                                        | `draft-prefix`        | `independent-evidence`                                             | source documentation                              |    1 | independent-evidence (source documentation): 51                                                                                                                     |
| `src/lib/work-unit/verbs/repoint-design.ts`                                        | `spec-prefix`         | `independent-evidence`                                             | source documentation                              |    1 | independent-evidence (source documentation): 51                                                                                                                     |
| `src/lib/work-unit/verbs/set-stage.ts`                                             | `active-placement`    | `scanner-false-positive`; `independent-evidence`                   | import syntax; source documentation               |    3 | scanner-false-positive (import syntax): 32; independent-evidence (source documentation): 64,76                                                                      |
| `src/lib/work-unit/verbs/set-stage.ts`                                             | `arc-root`            | `independent-evidence`                                             | source documentation                              |    2 | independent-evidence (source documentation): 64,76                                                                                                                  |
| `src/lib/work-unit/verbs/teardown.ts`                                              | `active-placement`    | `scanner-false-positive`                                           | import syntax                                     |    1 | scanner-false-positive (import syntax): 92                                                                                                                          |
| `src/lib/work-unit/verbs/teardown.ts`                                              | `arc-root`            | `independent-evidence`                                             | source documentation                              |    1 | independent-evidence (source documentation): 112                                                                                                                    |
| `src/lib/work-unit/verbs/teardown.ts`                                              | `completed-placement` | `independent-evidence`                                             | source documentation; diagnostic text             |   11 | independent-evidence (source documentation): 19,21,34,149,150,157,1261,1281,1283; independent-evidence (diagnostic text): 1330,1337                                 |

### Carved-module predicates

| Module path                                        | Register row |
| -------------------------------------------------- | ------------ |
| `src/lib/active/cohort-consistency.ts`             | `R-PL`       |
| `src/lib/active/cohort-live-context.ts`            | `R-PL`       |
| `src/lib/evidence-applicability/path-treatment.ts` | `R-LC`       |
| `src/lib/locus/derived-evidence.ts`                | `R-LOC`      |
| `src/lib/locus/derived-lifecycle-evidence.ts`      | `R-LOC`      |
| `src/lib/locus/subject-meta.ts`                    | `R-LOC`      |
| `src/lib/status/project-view-ref.ts`               | `R-BR`       |
| `src/lib/status/roadmap-conflict-auto-remedy.ts`   | `R-HC`       |
| `src/lib/status/roadmap-regeneration-assert.ts`    | `R-HC`       |
| `src/lib/user-sync/compaction-retention.ts`        | `R-NS`       |
| `src/lib/user-sync/retired-subdir.ts`              | `R-NS`       |
| `src/lib/user-sync/sync-state.ts`                  | `R-NS`       |
| `src/lib/user-sync/types.ts`                       | `R-NS`       |
| `src/lib/work-unit/candidate-record-store.ts`      | `R-CR`       |
| `src/lib/work-unit/lifecycle-executor.ts`          | `R-LW`       |
| `src/lib/work-unit/lifecycle-guards.ts`            | `R-LC`       |
| `src/lib/work-unit/lifecycle-index.ts`             | `R-PL`       |
| `src/lib/work-unit/lifecycle-membership.ts`        | `R-PL`       |
| `src/lib/work-unit/lifecycle-resolver.ts`          | `R-PL`       |
| `src/lib/work-unit/lifecycle-state.ts`             | `R-PL`       |
| `src/lib/work-unit/lifecycle-transitions.ts`       | `R-LW`       |
| `src/lib/work-unit/mutators/relocate-artifacts.ts` | `R-LW`       |
| `src/lib/work-unit/submission-boundary-store.ts`   | `R-CR`       |
| `src/lib/work-unit/transition-record-store.ts`     | `R-CR`       |
| `src/lib/work-unit/verbs/activate-deactivate.ts`   | `R-LW`       |
| `src/lib/work-unit/verbs/archive.ts`               | `R-AR`       |
| `src/lib/work-unit/verbs/park-resume.ts`           | `R-LW`       |
| `src/lib/work-unit/verbs/stub.ts`                  | `R-LW`       |
| `src/scripts/check-foreign-writes.ts`              | `R-HC`       |
| `src/scripts/validate-cohort-consistency.ts`       | `R-HC`       |
| `src/scripts/validate-meta-spec.ts`                | `R-HC`       |

### Non-code predicates

| Surface kind | Path prefix | Kind                    | Owner              |
| ------------ | ----------- | ----------------------- | ------------------ |
| `test`       | —           | `independent-evidence`  | test suite         |
| `template`   | —           | `independent-evidence`  | template contracts |
| `prose`      | —           | `independent-evidence`  | documentation      |
| `workflow`   | —           | `semantic-policy-owner` | workflow guidance  |
| `config`     | —           | `semantic-policy-owner` | configuration      |

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

```ts schema-bundle-projection
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const packageRoot = resolve(process.argv[2] ?? ".");
const sourceUrl = pathToFileURL(resolve(packageRoot, "src/production-schema-registry.ts")).href;
const { createProductionSchemaRegistry } = await import(sourceUrl);
const bundle = createProductionSchemaRegistry().toJSONSchema();
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sorted(entry)]));
  }
  return value;
}
process.stdout.write(`${JSON.stringify(sorted(bundle), null, 2)}\n`);
```

```sh
ARC_SCAN_DIR=/tmp/arc-cli-substrate-inventory && awk '/^```ts schema-bundle-projection$/{copy=1;next} copy && /^```$/{exit} copy' ../../.arc/active/notes-cli-substrate-complete-migration.md > "$ARC_SCAN_DIR/schema-bundle-projection.mts" && node --import tsx "$ARC_SCAN_DIR/schema-bundle-projection.mts" . > "$ARC_SCAN_DIR/schema-bundle-head.json"
```

From the repository root, project the base with:

```sh
ARC_SCAN_DIR=/tmp/arc-cli-substrate-inventory && mkdir -p "$ARC_SCAN_DIR/bundle-base" && git archive main packages/arc-framework | tar -x -C "$ARC_SCAN_DIR/bundle-base" && ln -sfn "$PWD/node_modules" "$ARC_SCAN_DIR/bundle-base/node_modules" && ln -sfn "$PWD/packages/arc-framework/node_modules" "$ARC_SCAN_DIR/bundle-base/packages/arc-framework/node_modules" && (cd packages/arc-framework && node --import tsx "$ARC_SCAN_DIR/schema-bundle-projection.mts" "$ARC_SCAN_DIR/bundle-base/packages/arc-framework" > "$ARC_SCAN_DIR/schema-bundle-base.json")
```

**Phase 3 post-merge comparison:** `git archive main packages/arc-framework` supplied the base package under
`/tmp/arc-cli-substrate-inventory/bundle-base/`; its package-local and repository `node_modules` were linked to the
current checkout. The sorted base bundle has 129 entries; the head bundle has 139. Added IDs are
`active-session-init`, `base-distance`, `config-session-init`, `current-husk-advisory`, `dirty-state`,
`domain-rules-session-init`, `extensions-session-init`, `release-routing`, `worktree-roster`, and `worktree-sync`.
Only `session-init-envelope` and `session-recover-envelope` differ among existing IDs. No ID was removed.

The unchanged `session-envelope-compat.e2e.test.ts` goldens pass (11/11). The first verifier run exposed key
reordering in the fallback builder's parsing copy; amend-design's entry gate returned its minor-deviation arm
because the settled contract already required wire stability. Task 3.4.b's correction commit `675a399a6` preserves
the literal result order; the repeated golden run passed unchanged. `benchmark:session-envelope` reported validation
p50 0.2208 ms and p95 0.4239 ms, with p50 at 0.0381% of cold-command p50; all three benchmark limits passed.

**Phase 3 sweep:** The post-merge import graph and an AST named-import check found zero imports of the retired
validation-surface, raw-Git-type, and `lib/user-sync/` barrel symbols listed in § Sweep recipes. A dynamic import,
import-type, and mock scan found 20 old-path references; they target owned config/meta-reader functions or carved
notes-sync APIs, not the retired names. The remaining 33 static `user-sync/index.ts` imports use carved notes-sync
APIs or retained inference and current-WU helpers. The regex scan found no checkpoint drift custom wrap, and source
search found no retired roster or base-distance thin view. `npm run typecheck:all` and the full 13,139-test lane passed
after the base merge; compile-forced test mocks retained the new runtime worktree-schema export.

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

### One-off reconciliation command

Run from `packages/arc-framework`. The script stays in `/tmp`; its complete source is recorded here so it can be
re-extracted after a base merge. It reads the three matrix tables above and emits every hit identity and assignment.

```ts layout-reconcile
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { parseCouplingManifest } from "./src/lib/coupling-audit/contracts.js";
import { selectCorpusPaths, collectCorpusFromPaths } from "./src/lib/coupling-audit/corpus.js";
import { scanClassInventory } from "./src/lib/coupling-audit/scan.js";

const classIds = new Set([
  "arc-root", "method-root", "workflow-root", "template-suffix", "active-placement",
  "planned-placement", "completed-placement", "meta-prefix", "draft-prefix", "spec-prefix",
  "tasks-prefix", "notes-prefix", "roadmap-name", "session-notes-name", "working-memory-name",
]);
const root = execFileSync("git", ["rev-parse", "--show-toplevel"]).toString().trim();
const packageRoot = resolve(root, "packages/arc-framework");
const notes = await readFile(resolve(root, ".arc/active/notes-cli-substrate-complete-migration.md"), "utf8");
const manifest = parseCouplingManifest(JSON.parse(await readFile(resolve(packageRoot, "audits/coupling-blast-radius/manifest.json"), "utf8")));
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString().split("\0").filter(Boolean);
const paths = selectCorpusPaths(manifest.corpus, tracked);
const corpus = await collectCorpusFromPaths(manifest.corpus, paths, (path) => readFile(resolve(root, path)));
const inventory = scanClassInventory(manifest, corpus);
const classes = inventory.classes.filter((entry) => classIds.has(entry.classId));
if (classes.length !== classIds.size) throw new Error("layout class selection differs from manifest");
const hits = classes.flatMap((entry) => entry.hits);
const asRepoPath = (cell) => relative(root, resolve(packageRoot, cell)).replaceAll("\\", "/");
function table(heading, columns) {
  const start = notes.indexOf(`### ${heading}\n`);
  if (start < 0) throw new Error(`missing table ${heading}`);
  const body = notes.slice(start).split("\n").slice(2);
  const lines = body.slice(0, body.findIndex((line) => !line.startsWith("|")));
  if (lines.length < 2) throw new Error(`empty or malformed table ${heading}`);
  const cells = (line) => line.split("|").slice(1, -1).map((cell) => cell.trim().replace(/^`|`$/gu, ""));
  if (JSON.stringify(cells(lines[0])) !== JSON.stringify(columns)) throw new Error(`changed columns in ${heading}`);
  return lines.slice(2).map((line) => cells(line));
}
const perFile = table("Layout per-file rows", ["File", "Class", "Kind", "Owner", "Hits", "Lines"])
  .map(([file, classId, kind, owner, count, lines]) => ({ type: "file", id: `${file}|${classId}`, path: asRepoPath(file), classId, kind, owner, count: Number(count), lines }));
const carved = table("Carved-module predicates", ["Module path", "Register row"])
  .map(([path, register]) => ({ type: "carved", id: path, path: asRepoPath(path), register }));
const nonCode = table("Non-code predicates", ["Surface kind", "Path prefix", "Kind", "Owner"])
  .map(([surfaceKind, prefix, kind, owner]) => ({ type: "noncode", id: `${surfaceKind}|${prefix}`, surfaceKind,
    prefix: prefix === "—" ? "" : asRepoPath(prefix), kind, owner }));
const rules = [...perFile, ...carved, ...nonCode];
if (new Set(rules.map((rule) => `${rule.type}|${rule.id}`)).size !== rules.length) throw new Error("duplicate rule");
const hitKey = (hit) => `${hit.classId}|${hit.path}:${hit.line}:${hit.column}|${hit.evidenceDigest}`;
function reconcile(removed = new Set()) {
  const assigned = new Map(rules.map((rule) => [`${rule.type}|${rule.id}`, []]));
  const report = { unmatchedCode: [], unmatchedNonCode: [], overlaps: [], unusedRules: [], countMismatches: [], assigned: {} };
  for (const hit of hits) {
    const candidates = rules.filter((rule) => !removed.has(`${rule.type}|${rule.id}`) &&
      (hit.surfaceKind === "code"
        ? (rule.type === "file" && rule.path === hit.path && rule.classId === hit.classId) ||
          (rule.type === "carved" && rule.path === hit.path)
        : rule.type === "noncode" && rule.surfaceKind === hit.surfaceKind &&
          (rule.prefix === "" || hit.path === rule.prefix || hit.path.startsWith(`${rule.prefix}/`))));
    const longest = hit.surfaceKind === "code" ? candidates :
      candidates.filter((rule) => rule.prefix.length === Math.max(...candidates.map((candidate) => candidate.prefix.length)));
    const key = hitKey(hit);
    if (longest.length === 0) report[hit.surfaceKind === "code" ? "unmatchedCode" : "unmatchedNonCode"].push(key);
    else if (longest.length > 1) report.overlaps.push({ hit: key, rules: longest.map((rule) => `${rule.type}|${rule.id}`) });
    else assigned.get(`${longest[0].type}|${longest[0].id}`).push(key);
  }
  for (const rule of rules) {
    const id = `${rule.type}|${rule.id}`;
    if (removed.has(id)) continue;
    const matches = assigned.get(id);
    report.assigned[id] = matches;
    if (matches.length === 0) report.unusedRules.push(id);
    if (rule.type === "file" && matches.length !== rule.count) report.countMismatches.push({ rule: id, recorded: rule.count, actual: matches.length });
  }
  return report;
}
const removed = new Set(process.argv.slice(2));
for (const id of removed) if (!rules.some((rule) => `${rule.type}|${rule.id}` === id)) throw new Error(`unknown removal ${id}`);
const report = reconcile(removed);
process.stdout.write(`${JSON.stringify({ head: execFileSync("git", ["rev-parse", "HEAD"]).toString().trim(),
  corpusFiles: corpus.length, classCount: classes.length, hitCount: hits.length, removed: [...removed], report }, null, 2)}\n`);
```

```sh
ARC_SCAN_DIR=/tmp/arc-cli-substrate-inventory && mkdir -p "$ARC_SCAN_DIR" && ln -sfn "$PWD/../../node_modules" "$ARC_SCAN_DIR/node_modules" && ln -sfn "$PWD/src" "$ARC_SCAN_DIR/src" && awk '/^```ts layout-reconcile$/{copy=1;next} copy && /^```$/{exit} copy' ../../.arc/active/notes-cli-substrate-complete-migration.md > "$ARC_SCAN_DIR/layout-reconcile.mts" && node --import tsx "$ARC_SCAN_DIR/layout-reconcile.mts" > "$ARC_SCAN_DIR/layout-reconcile.json"
```

**Initial run at `cf3347ad0`:** 2,227 corpus files, 15 classes, 18,427 hits. The five non-code predicates assign
all 17,301 non-code hits; the Candidate-record carved predicate assigns one code hit. The remaining 1,125 code
hits are the Task 5.3/5.4 migration and disposition queue. The report has zero overlaps, unused rules, and count
mismatches. Output: `/tmp/arc-cli-substrate-inventory/layout-reconcile.json`.

**Initial negative control:** running the same script with
`'carved|src/lib/work-unit/candidate-record-store.ts' 'noncode|template|—'` as arguments adds exactly the one
Candidate-record hit and 133 template hits to unmatched reports. Set comparison against those two rules' baseline
assignments found zero missing or unexpected hits. Restoring both rules returns them to zero unmatched; the other
1,125 outstanding code hits do not change. Output: `/tmp/arc-cli-substrate-inventory/layout-reconcile-negative.json`.

**Install and file-classification pass:** Eighteen per-file rows now assign 111 code hits. The counted rows separate
installer diagnostics, Git ignore and classification policy, and the planning-lane classifier's `R-CI` symbols;
source template names remain classification policy, while `templateFile` and `z.templateLiteral` matches are scanner
false positives. The post-pass scan has 18,391 hits with 978 unmatched code hits, zero unmatched non-code hits, and
zero overlaps, unused rules, or count mismatches. Its per-file negative control removes
`file|src/commands/diff.ts|arc-root` together with the Candidate-record and template predicates above. They own
5, 1, and 133 hits respectively; exactly those 139 identities became newly unmatched, with zero missing or
unexpected identities. The restored table assigns them all again.

**First residual pass:** Twenty-five further framework per-file rows assign 63 code hits in resolver definitions,
scanner patterns, pre-resolved method auditor paths, explanatory text, and diagnostics. Thirteen further wholly
carved modules now have exact-path predicates citing their storage-register rows. At this pass the 15 classes still
contain 18,391 hits: 174 code hits assigned by per-file rows, 64 by carved predicates, and 17,301 by non-code
predicates. The remaining 852 code hits are unmatched; overlaps, unused rules, and count mismatches remain zero.

**Non-TypeScript pass:** Thirty-three per-file rows assign the 123 selected code hits in Git hooks, harness hook
commands, `.mjs` helpers, and shell checks. Actual root discovery and invocation stay with their non-TypeScript
owner; hook path filters and template-source patterns are policy; comments and diagnostics are independent evidence;
work-unit path recognition cites the hook or storage register in each mixed row. The remaining code queue is 729
hits, with zero unmatched non-code hits, overlaps, unused rules, or count mismatches.

**Lifecycle and state-path pass:** Seventeen more exact-path predicates assign 173 hits to single-row locus, placement,
write-path, and archive owners. Forty layout-definition, policy, and CLI-description hits; 52 import/comment hits in
surviving commands and handlers; and 86 file-exact state-path and mixed-module hits take per-file rows. Every
work-unit state-path row lists its hit lines and the applicable register citation, while import syntax and diagnostic
text in the same file retain their own kinds. The reconciliation now assigns 475 code hits by per-file rows, 237 by
carved predicates, and 17,301 by non-code predicates; 378 code hits remain, with no overlaps, unused rules, or count
mismatches.

**Surviving command and library pass:** Twenty-one command, handler, and script rows assign 54 hits. Sixty-nine
non-work-unit library rows assign 122 more, separating import/comment matches from branch reads, lifecycle
classification, user-surface compatibility, and path policy. The project inbox viewer's hand-built `.arc` path moved
onto resolved `arc-root`, removing its final code hit. The current reconciliation leaves 201 unmatched code hits,
all in `src/lib/work-unit/`; no non-code hit, overlap, unused rule, or count mismatch remains.

**Work-unit library pass:** Eighty-five per-file rows assign the final 201 code hits in `src/lib/work-unit/`. Mixed
archive, retirement-authorization, decomposition, and placement modules list the exact lines for each kind and
register owner. Imports and comments remain scanner false positives or independent evidence; substantive path
classification, artifact naming, and placement access cite their storage owners. At `24e829e2e`, the 15-class scan
selects 18,390 hits in 2,227 corpus files: 852 code hits assigned by per-file rows, 237 by carved predicates, and
17,301 by non-code predicates. Unmatched code and non-code hits, unresolved overlaps, unused rules, and count
mismatches are all zero. Output: `/tmp/arc-cli-substrate-inventory/layout-reconcile.json`.

**Complete negative control:** Removing `file|src/commands/diff.ts|arc-root`,
`carved|src/lib/work-unit/candidate-record-store.ts`, and `noncode|template|—` exposes their exact 5, 1, and 133
assigned hits. The negative report has 6 unmatched code hits and 133 unmatched non-code hits, with zero missing or
unexpected identities against the three baseline assignments. Restoring the rules returns both unmatched sets to
zero. Output: `/tmp/arc-cli-substrate-inventory/layout-reconcile-negative.json`.

**State-path register correction routed:** The historical 36-line recount below included
`src/lib/delivery/from-branch.ts:555–559`, although the storage register explicitly excludes those five basename
classification lines and assigns them to lifecycle classification. The current per-file rows classify them under
`R-LC`; the register owner has a `USER-INBOX` correction to re-derive its count and file set from the current rows.
The historical recount remains below as the original observation, while these file-exact rows govern Phase 5.

**Phase 5 segment verifier:** After the fresh base checkpoint, all three inventory scripts and both reconciliation
commands reran at `caa5dba84`. The layout report remained at 18,390 assigned hits and zero unmatched code or
non-code hits, overlaps, unused rules, or count mismatches. Removing the same three rules exposed exactly 139
baseline hit identities and no other hit. The framework edits in mixed storage modules derive only procedure or
framework paths; no carved state-access or lifecycle behavior changed. The complete local gate passed Markdown lint,
all three ARC contract checks, TypeScript and shell lint, both typechecks, 908 passing test files with 13,142
passing tests, and the CLI build. `git status` remained clean after the build.

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

**CLI-reachable at the Phase 4 baseline** — 13, each subsequently threading the invocation's executor or holding the
singleton only as a fallback that bound callers override:

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

**Standalone scripts** — 9, which keep the singleton because they have no invocation context:

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

### Phase 4 executor reach audit

At post-merge head `82e2a5312`, a TypeScript named-import scan found 16 `gitExec` importers from `io-context.ts`:
the ten standalone scripts, the five fallback holders in the matrix, and storage-carved `handlers/locus.ts` (`R-LOC`).
It found zero `gitExecInput` importers; the singleton remains inside `io-context.ts` as the unbound factory fallback
and carved notes writer's executor. The only surviving policy-less `createGitExec()` call outside that module is the
standalone default in `local-test-admission.ts`; calls in `handlers/user.ts`, `user-sync.ts`, and `sync.ts` are
compile-forced carved edges. `prepareGitRefVerification` is the remaining direct unbound `execa` spawn, carved under
`R-LW`. The release commit module no longer constructs a module-level executor, and delivery's calls of its exported
message helpers pass the delivery executor. Delivery's merge-lock releases pass their executor into
`defaultMergeLockPort`.

The command-input inventory names all 17 always-JSON paths under constant machine mode, four value-bearing wraps,
and release opt-in/out. It finds the attest, publish, and locus machine-mode declarations. Named-import searches found
no predicate importer through `user-sync`, no `resolveGitCommonDir` importer through `repo-shared-paths.ts`, and no
`createRawGitExec` import from `change-facts.ts`. The standalone `classify-change.sh tree-hash HEAD` returned
`27d95795eec657c21839ecf0e1d27ab07da43b57` after the base merge.

## Sweep recipes

Each mechanical sweep's search-and-rewrite recipe, recorded before its first batch and re-run after each base merge.

### Framework bookkeeping paths

Search `src/` for `.arc/system/.internal`, `INTERNAL_DIR_SEGMENTS`, `MANIFEST_FILENAME`,
`PRISTINE_FILENAME`, `worktree-marker.json`, and `core.hooksPath`. Where a surviving owner builds a filesystem path,
materialize `resolveArcPath({ kind: "arc-root" })` and append `INTERNAL_DIR_SEGMENTS` and the owner's filename or
directory suffix. For Git configuration and ignore patterns, compose the same suffix with `posix.join` so the value
stays repository-relative. The first pass converted the marker path and ignore pattern, hook-manager and native Git
hook paths, and Markdown authority's manifest read. The init, join, update, reconfigure, diff, and health paths already
used the resolved root. Candidate, submission-boundary, and transition records stay with `R-CR`; declarative ignore
rules and explanatory strings take Task 5.4 dispositions. Re-run the search after every base merge and convert any
new framework bookkeeping path builder before reconciling the class hits.

### Framework procedure and extension paths

Search `src/` for hand-built `.arc` roots, `system/methods`, `system/workflows`, `system/extensions`,
`system/rules`, and `.template` output transformations. For installed method and workflow roots, use
`resolveArcPath({ kind: "procedure-root", family: "methods" | "workflows" })`; materialize only where the caller
needs an absolute filesystem path. For another descendant, resolve `arc-root` and append the owner suffix with
`posix.join` for managed paths or `join` for a materialized filesystem path. The first pass converted extension
status and validation, local review method reads, recover's workflow paths, load-set reference and rules paths, and
the ARC-root discovery probe. The residual pass also converted the project inbox path in `lib/view-artifact.ts`.
Template output conversion already belongs to `resolveTemplateOutputPath`; the remaining `.template` hits in
classification, rendering, and source checks name source filenames or policy patterns.
Re-run this search and the four framework-class slices of the coupling scan after every base merge. Work-unit state
paths stay with Task 5.4.b; Git hook, shell, `.mjs`, classifier, explanatory, and policy hits take Task 5.4.c kinds.

### Canonical JSON shim

Search tracked `src/` and `__tests__/` TypeScript string literals, including static imports, dynamic imports, and
`vi.mock`, for specifiers resolving to `src/lib/canonical/canonical-json.ts`. Re-point only those exact resolved
specifiers to `src/lib/kernel/canonical/canonical-json.ts`, retaining the `.js` import extension and existing named
imports. The rule deliberately leaves literals already resolving to the kernel file alone. Re-run it after a base
merge, then search `rg -n 'canonical/canonical-json|canonical-json\.js|canonical-json\.ts' src __tests__` and
inspect any remaining old-path hit before deleting the shim.

```js canonical-json-rewrite
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const shim = path.resolve("src/lib/canonical/canonical-json.ts");
const owner = path.resolve("src/lib/kernel/canonical/canonical-json.ts");
const files = execFileSync("git", ["ls-files", "-z", "--", "src", "__tests__"])
  .toString().split("\0").filter((file) => existsSync(file) && /\.(?:[cm]?ts|tsx)$/u.test(file));
let changed = 0;
for (const file of files) {
  const input = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, input, ts.ScriptTarget.Latest, true);
  const edits = [];
  function visit(node) {
    if (ts.isStringLiteral(node) && node.text.startsWith(".")) {
      const resolved = path.resolve(path.dirname(file), node.text.replace(/\.js$/u, ".ts"));
      if (resolved === shim) {
        let specifier = path.relative(path.dirname(file), owner).replaceAll("\\", "/").replace(/\.ts$/u, ".js");
        if (!specifier.startsWith(".")) specifier = `./${specifier}`;
        edits.push({ start: node.getStart(source) + 1, end: node.getEnd() - 1, specifier });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!edits.length) continue;
  let output = input;
  for (const edit of edits.reverse()) output = output.slice(0, edit.start) + edit.specifier + output.slice(edit.end);
  writeFileSync(file, output);
  changed += edits.length;
  process.stdout.write(`${file}: ${edits.length}\n`);
}
process.stdout.write(`rewritten specifiers: ${changed}\n`);
```

Run from `packages/arc-framework` after extracting the fence to a scratch `.cjs` file under the directory linked to
the workspace `node_modules`; the command is `node /tmp/arc-cli-substrate-inventory/canonical-json-rewrite.cjs`.
The first run rewrote 125 specifiers in source, tests, fixtures, and helpers. The corrected recipe's second run
rewrote zero, including while the deleted test path remained in Git's unstaged index. The canonical behavior tests
moved to `__tests__/unit/kernel/canonical-json.test.ts`; only the compatibility-export identity case was removed.

### Managed-path and slug shims

Run the exact resolved-specifier AST rewrite in § Canonical JSON shim twice over tracked `src/` and `__tests__/`:

| Shim path                           | Owner path                                   |
| ----------------------------------- | -------------------------------------------- |
| `src/lib/canonical/managed-path.ts` | `src/lib/kernel/canonical/managed-path.ts`   |
| `src/lib/work-unit/slug.ts`         | `src/lib/kernel/schema/slug.ts`              |

For each run, change only its `shim` and `owner` constants, retaining the `.js` extension and named imports. The
resolved-target comparison protects existing direct owner imports; the missing-file filter makes a rerun valid after
deletion. Search the old paths in static, dynamic, and mock specifiers after every base merge. Move the managed-path
behavior tests to `unit/kernel/managed-path.test.ts` and remove only the old-path identity cases there and in
`unit/kernel/slug.test.ts`.
The first runs redirected 28 managed-path and 9 slug specifiers; both reruns redirected zero. The managed-path
behavior suite moved intact, while the two compatibility-identity cases and both shim modules were removed.

### Raw Git type home

At the merged base, the TypeScript import graph and an AST pass found 44 named imports of `RawGitExec` from
`src/lib/change-facts.ts`: 43 standalone `import type` declarations and one mixed value/type declaration in
`src/lib/delivery/from-branch.ts`. `RawGitResult` had no importer. Move both declarations unchanged to
`src/lib/git/exec.ts`, import them type-only in `change-facts.ts`, and redirect each standalone type import to the
relative `lib/git/exec.js` specifier. Split the mixed declaration so its values and `ChangeSet` still come from
`change-facts.js` while `RawGitExec` comes from the executor contract. Re-run the import graph and
`rg -n 'RawGit(Exec|Result)' src __tests__` after a base merge; any new type importer of `change-facts.js` takes the
same rewrite. Leave `createRawGitExec` value imports for Task 4.6's distinct factory rename.
The first pass re-pointed 44 type imports; the post-pass AST search found none still importing either type from
`change-facts.js`.

### Git failure-text predicate home

Search named imports and re-exports of `isCasRejectionError`, `isRemoteUnavailableError`, and
`isNonFastForwardError` from `lib/user-sync/notes-merge.ts` or its `index.ts` barrel in `src/` and `__tests__/`.
Move their definitions unchanged to `lib/git/ref-tree.ts`, re-point each named importer directly to that module,
split mixed user-sync imports, and remove the barrel re-exports. Re-run the named-symbol search after the rewrite;
only the definitions, direct `ref-tree.ts` imports, and behavioral tests should remain.

### Git common-directory helper home

Search named imports of `resolveGitCommonDir` from `lib/user-sync/repo-shared-paths.ts` in `src/` and
`__tests__/`. Move the unchanged function into `lib/git/exec.ts`, then redirect the nine surviving named imports
in delivery, review, local test admission, and the worktree lock to the executor contract. Split any mixed import;
`getRepoSharedUserInternalDir` remains in the user-sync module and imports the helper from its new home as a
compile-forced carved edge. Re-run the named-import search and typecheck; no surviving importer should reference the
user-sync path for `resolveGitCommonDir`.

### Validation-surface old paths

Search static imports, re-exports, dynamic `import()` types, and `vi.mock` specifiers in `src/` and `__tests__/` for
`release/types.js`, `active/meta-reader.js`, `config/status-reader.js`, `commit-check/config.js`,
`commands/config/types.js`, `commands/config.js`, and `commit-check/index.js`. Match named symbols, not whole files:
move the six audit types from `release/types.ts` to `release/schema.ts`; `MetaProjectionRecord` and
`ParsedMetaRecord` from `meta-reader.ts` to `active/meta-schema.ts`; `AGENT_CONSUMABLE_CONFIG_FIELDS` and
`COMMIT_CHECK_CONFIG_FIELDS` to `config/schema.ts`; and `ConfigSettings` to `config/schema.ts`. Split mixed imports
without moving locally owned names, then remove the matching re-exports and the two relay exports. Re-run the same
named-symbol search and `typecheck:all` after a base merge; any added importer takes the same owner path.
The first pass moved 31 import declarations, including the sibling `release/audit-log.ts` import of `./types.js`;
the dynamic imports and `vi.mock` sites inspected referenced owned functions and needed no rewrite.

### User-sync surviving symbols

Search static imports, dynamic `import()` types, and `vi.mock` specifiers of `user-sync/index.js` and group each
named import by its owner. Move cross-WU entry types to `user-sync/schema.ts`, parsing to `user-sync/parser.ts`,
execute-bound inbox writes to `user-sync/inbox-writer.ts`, and execution offers to
`user-sync/execution-offer.ts`; move the advisory lock to `lib/advisory-lock.ts` and `getNotesLockPath` to
`user-sync/notes-lock.ts` only for surviving callers. Keep barrel imports for carved notes-sync consumers and
`resolveCurrentWuName`'s carved callers. Re-run the named-symbol search after each base merge; remove only exports
whose surviving callers have moved, retaining carved exports until the notes deletion pass.
The first cross-WU pass re-pointed three imports (including the carved merge test's forced edge) and removed the
parser/schema re-export blocks; no remaining barrel importer names a cross-WU entry symbol.
The second pass routed six surviving source/test imports of inbox writing and execution offers directly, plus the
inbox mutation lock and notes-lock imports. It removed the writer/offer barrel export blocks. The remaining lock
and notes-lock barrel exports still serve carved notes-sync callers; `resolveCurrentWuName` likewise stays for carved
callers.

## Test-cost baselines

Measured at `882f50431` after the merged-base inventory commits; the package source and tests are identical to
merged-base commit `6f1d01261`. The CLI was built with `npm run build:fast` before the first run. Every retained
measurement used `--condition tier-isolated --workers 12` and the named `--project-set`; all runs in each row have
the same file and test counts. Paths below are relative to `packages/arc-framework` and form the `before` group of a
`benchmark:test-cost:compare` lever request for that row. They remain in this checkout's gitignored
`.test-cost-runs/` until Task 7.5.

| Project set   | `before` retained-run paths                                                                                                                                               | Wall-clock runs (ms)      | Median (ms) | Measured head |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------: | ------------- |
| `unit`        | `.test-cost-runs/cli-substrate-base-unit-1.json`, `.test-cost-runs/cli-substrate-base-unit-2.json`, `.test-cost-runs/cli-substrate-base-unit-3.json`                      | 13,904; 12,629; 12,837    |      12,837 | `882f50431`   |
| `integration` | `.test-cost-runs/cli-substrate-base-integration-1.json`, `.test-cost-runs/cli-substrate-base-integration-2.json`, `.test-cost-runs/cli-substrate-base-integration-3.json` | 90,013; 87,578; 87,879    |      87,879 | `882f50431`   |
| `lane`        | `.test-cost-runs/cli-substrate-base-lane-1.json`, `.test-cost-runs/cli-substrate-base-lane-2.json`, `.test-cost-runs/cli-substrate-base-lane-3.json`                      | 95,117; 95,021; 91,142    |      95,021 | `882f50431`   |
| `e2e`         | `.test-cost-runs/cli-substrate-base-e2e-1.json`, `.test-cost-runs/cli-substrate-base-e2e-2.json`, `.test-cost-runs/cli-substrate-base-e2e-3.json`                         | 275,113; 233,851; 234,140 |     234,140 | `882f50431`   |

The six `ci-job` rows are measured by CI's budget report, not this local tier-isolated series.

## Review projection

`scripts/review-projection.sh` projects a single-branch work unit's review chunks as stacked draft pull requests
(`build`, `publish`, and `close` over a chunk file), and
`.arc/reference/strategies/project/strategy-review-projection.md` is its runbook. The chunk file assigns every changed
path to exactly one chunk, and chunks stack in file order, so chunk boundaries follow files in dependency order. The
top projection commit's tree equals the work-unit head outside `.arc/active/`, which is never projected.
