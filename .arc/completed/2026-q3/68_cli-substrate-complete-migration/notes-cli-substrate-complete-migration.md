# Notes: cli-substrate-complete-migration

Reference material for task generation and execution: how the inventory is taken and recorded in the residual matrix,
how each segment closes, the session-envelope roots and the schema bundle check, the layout reconciliation, the
state-path recount behind the storage register's row, the `gitExec` singleton importers and other unbound executors,
the sweep recipes and test-cost baselines execution records, and the review-projection tooling.

## Contents

- [Final implementation verification](#final-implementation-verification)
- [Inventory method](#inventory-method)
- [Residual matrix](#residual-matrix)
- [Segment boundaries](#segment-boundaries)
- [Session-envelope roots](#session-envelope-roots)
- [Schema bundle diff](#schema-bundle-diff)
- [Layout reconciliation](#layout-reconciliation)
- [Work-unit state-path recount](#work-unit-state-path-recount)
- [Git executor importers](#gitexec-singleton-importers)
- [Sweep recipes](#sweep-recipes)
- [Test-cost baselines](#test-cost-baselines)
- [Review projection](#review-projection)
- [Verification corrections](#verification-corrections)
- [Terminal verification evidence](#terminal-verification-evidence)
- [Verification coverage plan](#verification-coverage-plan)

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
`cohort-state-storage.md`. All rows retain the `840d348c` cutoff except the two exact `891c911c` rows
Owner-approved in A4 (`R-DCP` and `R-CONT`). Correction citations name the existing `USER-INBOX` captures,
except `R-ID`, relayed directly to `storage-contract`'s active planning session under Q6 and recorded at
`7c52f65fd8953ce122702755e4a96460ed713a17`. Its register reader coverage lands at that draft's batch 4;
this migration's register cutoff remains unchanged.

| Key       | Register row                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------- |
| `R-NS`    | Notes-specific sync                                                                                   |
| `R-BR`    | Branch-tree readers                                                                                   |
| `R-LC`    | Lifecycle classification and exclusion                                                                |
| `R-HC`    | Lifecycle hook checks                                                                                 |
| `R-PL`    | Lifecycle state encoded in directory placement                                                        |
| `R-SP`    | Surviving code builds work-unit state paths itself                                                    |
| `R-IF`    | In-flight derivation                                                                                  |
| `R-LW`    | The lifecycle executor's write path and `arc start` placement                                         |
| `R-NP`    | The notes-related session-init probes                                                                 |
| `R-CW`    | The `currentWuReconcile` and `StaleWorktreeSweepResult` session-init slots                            |
| `R-LOC`   | Locus derivation (`DerivedLocusFrame`)                                                                |
| `R-AR`    | Archival by `git mv`, the archive index                                                               |
| `R-UW`    | The per-work-unit user workspace                                                                      |
| `R-RM`    | `ROADMAP.md` carried on every branch                                                                  |
| `R-CR`    | Candidate and transition records tracked under `.arc/system/.internal/`                               |
| `R-CI`    | The auto-merge lane's planning classification by tracked artifact prefix                              |
| `R-DCP`   | A4: exact `891c911c` decomposition plan/staging/advancement row                                       |
| `R-CONT`  | A4: exact `891c911c` continuity anchored to code commits row                                          |
| `R-LOCK`  | `USER-INBOX`: Name what the surviving inbox writer locks on in the notes-sync register row            |
| `R-ADD`   | `USER-INBOX`: Cover identity-wide user workspace bootstrap in the storage register                    |
| `R-PARSE` | `USER-INBOX`: Name the entry parser’s supporting type and schema survivors in the notes-sync register |
| `R-ID`    | Q6 planning correction: explicitly cover physical Errand identity acquisition and its consumers       |

### Kernel contract

| Surface                                                                     | Destination                                  | Disposition      | Citation                |   Importers | Evidence                                                          |
| --------------------------------------------------------------------------- | -------------------------------------------- | ---------------- | ----------------------- | ----------: | ----------------------------------------------------------------- |
| `src/lib/canonical/canonical-json.ts` shim                                  | `src/lib/kernel/canonical/canonical-json.ts` | migrated         | Spec § 3                |         127 | import graph; Task 6.1                                            |
| `src/lib/canonical/managed-path.ts` shim                                    | `src/lib/kernel/canonical/managed-path.ts`   | migrated         | Spec § 3                |          28 | import graph; Task 6.2                                            |
| `src/lib/work-unit/slug.ts` shim                                            | `src/lib/kernel/schema/slug.ts`              | migrated         | Spec § 3                |           9 | import graph; Task 6.2                                            |
| `ArcError` re-export in `src/lib/errors.ts`                                 | kernel error module                          | migrated         | Spec § 3                |  4 (`M:38`) | named-import search; Task 6.2                                     |
| vocabulary re-exports in `src/commands/active/types.ts`                     | kernel vocabulary                            | migrated         | Spec § 3                | 15 (`M:29`) | named-import search; Task 6.2                                     |
| local `SlugSchema` in `src/scripts/integration/merge.ts`                    | kernel `SlugSchema`                          | migrated         | Spec § 3                |           — | Task 6.3                                                          |
| local `SlugSchema` in `src/scripts/integration/checkpoint.ts`               | kernel `SlugSchema`                          | migrated         | Spec § 3                |           — | Task 6.3                                                          |
| local `SlugSchema` in `src/scripts/review-gate/readiness.ts`                | kernel `SlugSchema`                          | migrated         | Spec § 3                |           — | Task 6.3                                                          |
| local state and placement enums in `src/scripts/integration/checkpoint.ts`  | kernel and layout schemas                    | migrated         | Spec § 3                |           — | Task 6.3                                                          |
| kernel digest patterns and two surviving `z.custom<CanonicalDigest>` copies | `CanonicalDigestSchema`                      | migrated         | Spec § 2.1              |           — | regex candidates; Tasks 1.3, 6.4                                  |
| `decompose-v3-plan.ts`'s `z.custom<CanonicalDigest>` copy                   | store transition plan                        | carved           | `R-DCP`                 |           — | source split; Task 6.4.a                                          |
| composite `checkpoint-v1:` digest handles                                   | integration checkpoint handle                | retained by rule | Spec § 2.1 fenced owner |           — | `checkpoint-store.ts` and command guards; Task 6.4.c              |
| review-gate version-1 identities                                            | frozen review-gate request-key serializer    | retained by rule | Spec § 2.1 fenced owner |           — | `core/request-key.ts` uses unprefixed `hashContent`; Task 6.4.c   |
| delivery review-fix record-byte digest                                      | delivery record-effect contract              | retained by rule | Spec § 2.1 fenced owner |           — | `review-fix-record-effects.ts` direct UTF-8 hash; Task 6.4.c      |
| CodeRabbit executable-byte digest                                           | CodeRabbit provider executable evidence      | retained by rule | Spec § 2.1 fenced owner |           — | `providers/coderabbit/executable.ts` direct byte hash; Task 6.4.c |
| locus source digest pattern                                                 | locus storage projection                     | carved           | `R-LOC`                 |           — | `locus/schema/limits.ts`; Task 6.4.c                              |
| `src/lib/canonical/content-digest.ts`                                       | same module                                  | retained by rule | Spec § 3 non-shim       |        M:14 | import graph; Task 6.5                                            |

### Validation-surfaces contract

| Surface                                                                                                                                      | Destination                          | Disposition      | Citation                     |   Importers | Evidence                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------- | ---------------------------- | ----------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| re-exports in `src/lib/release/types.ts`                                                                                                     | release owning schemas               | migrated         | Spec § 4                     |         M:5 | import graph; Task 3.1.a                                                                                                                                        |
| re-exports in `src/lib/active/meta-reader.ts`                                                                                                | active owning schemas                | migrated         | Spec § 4                     |       M:114 | import graph; Task 3.1.a                                                                                                                                        |
| re-exports in `src/lib/config/status-reader.ts`                                                                                              | config owning schemas                | migrated         | Spec § 4                     |        M:45 | import graph; Task 3.1.a                                                                                                                                        |
| re-exports in `src/lib/commit-check/config.ts`                                                                                               | commit-check owning schemas          | migrated         | Spec § 4                     |         M:3 | import graph; Task 3.1.a                                                                                                                                        |
| re-exports in `src/commands/config/types.ts`                                                                                                 | config owning schemas                | migrated         | Spec § 4                     |         M:7 | import graph; Task 3.1.a                                                                                                                                        |
| relay in `src/commands/config.ts`                                                                                                            | config owning schemas                | migrated         | Spec § 4                     |         M:6 | import graph; Task 3.1.a                                                                                                                                        |
| cross-WU entry re-exports in `src/lib/user-sync/index.ts`                                                                                    | `schema.ts` and `parser.ts`          | migrated         | Spec § 4; `R-NS` survivor    |        M:30 | import graph; Task 3.1.b                                                                                                                                        |
| sync-state re-exports in `src/lib/user-sync/index.ts`                                                                                        | —                                    | carved           | `R-NS`                       |        M:30 | Task 3.1.b                                                                                                                                                      |
| unused `src/lib/user-sync/types.ts` re-export names                                                                                          | —                                    | carved           | `R-NS`                       |     0 named | `CrossWuEntry`, `EntryParse` reexports only; no named importer                                                                                                  |
| `src/lib/user-sync/types.ts`: `CrossWuShape`                                                                                                 | same parser-support type             | retained by rule | `R-PARSE`; Spec § 1 survivor |         M:4 | parser `shapeForFile`/`parseCrossWuEntries`; merge; index; schema test                                                                                          |
| `src/lib/user-sync/schema.ts`: `CrossWuEntrySchema`, `CrossWuEntryParseSchema`, `CrossWuEntry`, `EntryParse`                                 | same parser-support contracts        | retained by rule | `R-PARSE`; Spec § 1 survivor |           — | parser, inbox-state, and entry reconstruction consumers                                                                                                         |
| `src/lib/user-sync/schema.ts`: persisted/normalized sync-state and extension schemas/types; `normalizedExtension`, `normalizeLocalSyncState` | —                                    | carved           | `R-NS`                       |           — | `PersistedLocalSyncStateSchema`, `LocalSyncStateSchema`, `PartialPushMarkerSchema`, `PriorFileListSchema`, `RemoteMarkerProvenanceSchema`; notes-sync consumers |
| `parseCrossWuEntries` and `matchInboxEntryTitle` through the user-sync barrel                                                                | direct `parser.ts` imports           | migrated         | Spec § 4; `R-NS` survivor    |         M:9 | Task 3.1.c                                                                                                                                                      |
| `inbox-writer.ts` and `execution-offer.ts`                                                                                                   | direct owning modules                | retained by rule | `R-NS` survivor              |  M:12 / M:2 | Task 3.1.c; direct                                                                                                                                              |
| `resolveCurrentWuName` in `current-wu.ts`                                                                                                    | barrel retained for carved importers | retained by rule | `R-NS` survivor              | 0 surviving | Task 1.1.c                                                                                                                                                      |
| remaining notes-sync machinery in `src/lib/user-sync/`                                                                                       | —                                    | carved           | `R-NS`                       |           — | Task 1.1.c                                                                                                                                                      |

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

| Surface                                                             | Destination               | Disposition      | Citation                  |       Importers | Evidence                   |
| ------------------------------------------------------------------- | ------------------------- | ---------------- | ------------------------- | --------------: | -------------------------- |
| `RawGitExec` and `RawGitResult` in `src/lib/change-facts.ts`        | `src/lib/git/exec.ts`     | migrated         | Spec § 2.2                | 0 old; 44 moved | AST import sweep; Task 1.4 |
| `createRawGitExec` spawn factory in `change-facts.ts`               | `createSpawnRawGitExec`   | migrated         | Spec § 7                  |  4 direct tests | Task 4.6.b                 |
| `change-facts.ts`: CI weight, tree hash, portability, raw executor  | same module               | retained by rule | Spec § 1; `R-CI` survivor |             M:8 | Task 4.6.b                 |
| `change-facts.ts`: planning-lane classifier                         | —                         | carved           | `R-CI`                    |             M:8 | Task 4.6.b                 |
| Git failure-text predicates in `src/lib/user-sync/notes-merge.ts`   | `src/lib/git/ref-tree.ts` | migrated         | Spec § 7; `R-NS` survivor |             M:1 | Task 4.5.a                 |
| `notes-merge.ts`: remaining notes merge functions                   | —                         | carved           | `R-NS`                    |             M:1 | Task 4.5.a                 |
| `resolveGitCommonDir` in `src/lib/user-sync/repo-shared-paths.ts`   | `src/lib/git/exec.ts`     | migrated         | Spec § 7; `R-NS` survivor |     9 surviving | Task 4.5.b                 |
| `getRepoSharedUserInternalDir` in `repo-shared-paths.ts`            | correction pending        | retained by rule | `R-LOCK`                  |             M:3 | existing inbox capture     |
| `getNotesLockPath` in `src/lib/user-sync/notes-lock.ts`             | correction pending        | retained by rule | `R-LOCK`                  |             M:5 | existing inbox capture     |
| `src/lib/io-context.ts`: `createRawGitExec`, `createGitExec`        | bound executor factory    | migrated         | Spec § 8                  |           M:100 | Task 4.4                   |
| `src/lib/io-context.ts`: notes `UserIOContext` and writer           | store-backed IO           | carved           | `R-NS`                    |           M:100 | Task 4.4                   |
| errand identity `.message` Git classification                       | `gitFailureText()`        | migrated         | Spec § 7                  |               — | Task 4.6.a                 |
| raw Git in lifecycle hook scripts                                   | —                         | carved           | `R-HC`                    |               — | coupling scan; Task 4.7    |
| raw `git()` arrangement runners                                     | same modules              | retained by rule | Spec § 9                  |               — | Task 4.7                   |
| `src/scripts/assert-layout-migration.ts`: `gitExec`                 | —                         | migrated         | Spec § 6 retirement       |               — | Task 5.1 deleted script    |
| `src/scripts/audit-coupling-blast-radius.ts`: `gitExec`             | same singleton            | retained by rule | Spec § 8                  |               — | standalone; Task 4.4.d     |
| `src/scripts/audit-emphasis.ts`: `gitExec`                          | same singleton            | retained by rule | Spec § 8                  |               — | standalone; Task 4.4.d     |
| `src/scripts/audit-tables.ts`: `gitExec`                            | same singleton            | retained by rule | Spec § 8                  |               — | standalone; Task 4.4.d     |
| `src/scripts/check-foreign-writes.ts`: `gitExec`                    | same singleton            | retained by rule | Spec § 8                  |               — | standalone; Task 4.4.d     |
| `src/scripts/lint-markdown-staged.ts`: `gitExec`                    | same singleton            | retained by rule | Spec § 8                  |               — | standalone; Task 4.4.d     |
| `src/scripts/lint-markdown-worktree.ts`: `gitExec`                  | same singleton            | retained by rule | Spec § 8                  |               — | standalone; Task 4.4.d     |
| `src/scripts/lint-markdown.ts`: `gitExec`                           | same singleton            | retained by rule | Spec § 8                  |               — | standalone; Task 4.4.d     |
| `src/scripts/lint-task-descriptors.ts`: `gitExec`                   | same singleton            | retained by rule | Spec § 8                  |               — | standalone; Task 4.4.d     |
| `src/scripts/markdown-write-command.ts`: `gitExec`                  | same singleton            | retained by rule | Spec § 8                  |               — | standalone; Task 4.4.d     |
| `src/commands/active/status.ts`: `gitExec`                          | bound caller overrides    | retained by rule | Spec § 8                  |               — | fallback; Task 4.4.a       |
| `src/commands/config/status.ts`: `gitExec`                          | bound caller overrides    | retained by rule | Spec § 8                  |               — | fallback; Task 4.4.b       |
| `src/handlers/release/record.ts`: `gitExec`                         | bound caller overrides    | retained by rule | Spec § 8                  |               — | fallback; Task 4.4.a       |
| `src/handlers/release/setup/verify.ts`: `gitExec`                   | bound caller overrides    | retained by rule | Spec § 8                  |               — | fallback; Task 4.4.a       |
| `src/lib/recover/committed-progress.ts`: `gitExec`                  | bound caller overrides    | retained by rule | Spec § 8                  |               — | fallback; Task 4.4.a       |
| `src/lib/local-test-admission.ts`: policy-less `createGitExec()`    | same default executor     | retained by rule | Spec § 8                  |               — | standalone runners; 4.4.d  |
| `src/lib/io-context.ts`: module-level `candidateGitExec`            | base of bound factory     | retained by rule | Spec § 8                  |               — | Task 4.4.d                 |
| `src/lib/io-context.ts`: module-level `gitExec`                     | unbound singleton         | retained by rule | Spec § 8                  |               — | Task 4.4.d                 |
| `src/lib/io-context.ts`: module-level `gitExecInput`                | unbound factory fallback  | retained by rule | Spec § 8                  |               — | Task 4.4.c                 |
| `src/lib/io-context.ts`: `prepareGitRefVerification` direct `execa` | lifecycle landing rewrite | carved           | `R-LW`                    |               — | park --land; Task 4.4.d    |
| `src/handlers/locus.ts`: `gitExec`                                  | storage locus rewrite     | carved           | `R-LOC`                   |               — | Task 4.1.e                 |

The stdin property `createUserIOContext.execInput` composes the generic `createGitExecInput` invocation factory.
The notes-specific `writeNote`/`readNote` properties and their physical notes implementation retain the `R-NS` carve;
this property-level split preserves the command binding contract beside the storage-owned behavior.

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
| `handlers/sync.ts`: common identity prelude             | invocation-bound Git executor       | migrated         | Spec § 1; § 8          |          — | Pass 2 P4  |
| `handlers/sync.ts`: worktree sync and adapter           | same handler                        | retained by rule | Spec § 1 symbol split  |        M:3 | Task 1.1.c |
| `review planning-lane` command                          | —                                   | carved           | `R-CI`                 |          — | Task 4.1   |
| `locus` command adapter                                 | machine-mode wrap                   | migrated         | Spec § 8; `R-LOC` body |          — | Task 4.1.e |

### Test-support contract

| Surface                                                                                                              | Destination                             | Disposition      | Citation                              | Importers | Evidence                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------- | ------------------------------------- | --------: | -------------------------------------------------------------------------------------------------------------------------------------------- |
| repeated scripted `GitExec` doubles                                                                                  | `__tests__/helpers/git-exec-fake.ts`    | migrated         | Spec § 9                              |         — | test scan; Tasks 2.1, 7.1, 7.4                                                                                                               |
| hand-built Git failure rejections                                                                                    | shared `GitProcessError` fixture        | migrated         | Spec § 9                              |         — | regex candidates; Tasks 2.1, 7.1                                                                                                             |
| scripted `GitExecInput` and `RawGitExec` doubles                                                                     | shared fake variants                    | migrated         | Spec § 9                              |         — | test scan; Task 2.1.c                                                                                                                        |
| handwritten meta fixture blocks                                                                                      | `__tests__/helpers/meta-fixture.ts`     | migrated         | Spec § 9                              |         — | regex candidates; Tasks 2.2, 7.2                                                                                                             |
| inline `.safeParse(...).success` assertions                                                                          | `__tests__/helpers/schema-assertion.ts` | migrated         | Spec § 9                              |         — | regex candidates; Tasks 2.3, 7.3                                                                                                             |
| registered output casts in tests                                                                                     | schema parse                            | migrated         | Spec § 9                              |         — | Task 7.3                                                                                                                                     |
| primary-safety, worktree sync, and Candidate collection scripts                                                      | shared fake for surviving uses          | migrated         | Spec § 9; Spec § 1 split              |         — | verification subject splits                                                                                                                  |
| Candidate artifact-treatment fixtures: `collectTarget`, `collect`, `collectUnstaged`                                 | unchanged local doubles                 | carved           | `R-LC`; `R-SP`; `R-CR`                |         — | verification subject splits                                                                                                                  |
| sync notes orchestration and notes-outcome round trips: local default and overrides                                  | unchanged local doubles                 | carved           | `R-NS`                                |         — | verification subject splits                                                                                                                  |
| view presentation and history ambiguity meta setup                                                                   | semantic meta fixture builder           | migrated         | Spec § 9                              |         — | verification subject splits                                                                                                                  |
| view lookup/selection meta literals                                                                                  | independent literal evidence            | retained by rule | Spec § 9 meta parsing/layout          |         — | verification subject splits                                                                                                                  |
| `makeGitExecInput` in `__tests__/helpers/integration.ts`                                                             | execa input adapter                     | migrated         | Spec § 9                              |      M:74 | Task 2.4.a; 22 suites                                                                                                                        |
| `stubGitExec` in `__tests__/helpers/integration.ts`                                                                  | `__tests__/integration/active.test.ts`  | migrated         | Spec § 9                              |         1 | Task 2.4.b; active suite                                                                                                                     |
| `makeGitNoteWriter` and `makeGitNoteReader`                                                                          | same helpers                            | carved           | `R-NS`                                |      M:74 | Task 2.4.c; notes seam                                                                                                                       |
| `base-advance.ts` raw `git()` runner                                                                                 | same helper                             | retained by rule | Spec § 9 arrangement runner           |         — | Task 2.4.c; no src import                                                                                                                    |
| `e2e/race-worker.ts` private spawn executors                                                                         | same worker                             | retained by rule | Spec § 9 real-Git plumbing            |         — | Task 2.4.c; spawned worker                                                                                                                   |
| constant one-response stubs                                                                                          | local test doubles                      | retained by rule | Spec § 9                              |         — | scripted-double scan; Task 7.5                                                                                                               |
| real-Git doubles, fault-injecting hybrids, scenario simulators                                                       | local test doubles                      | retained by rule | Spec § 9                              |         — | scripted-double scan; Task 7.5                                                                                                               |
| non-exit Git unavailability and unscripted-call guards                                                               | local test doubles                      | retained by rule | Spec § 9                              |         — | Git-failure scan; Task 7.5                                                                                                                   |
| `unit/errand-identity-snapshot.test.ts`: identity acquisition and in-flight producers                                | original test representation            | carved           | Spec § 1; `R-IF`, `R-LOC`, `R-ID`     |         — | Q6 exact-base restoration; correction relayed to `storage-contract` planning                                                                 |
| parser/layout literal meta fixtures                                                                                  | local Markdown                          | retained by rule | Spec § 9 independent evidence         |         — | meta block scan; Task 7.5                                                                                                                    |
| status table golden strings                                                                                          | local Markdown                          | retained by rule | Spec § 9 independent evidence         |         — | meta scan false positive; render                                                                                                             |
| invalid and legacy-scan meta fixture blocks                                                                          | local Markdown                          | retained by rule | Spec § 9                              |         — | meta block scan; 5 invalid files                                                                                                             |
| legacy session-envelope meta projection                                                                              | builder-derived flat bullets            | retained by rule | Spec § 9 golden byte identity         |         — | meta scan; 11 unchanged goldens                                                                                                              |
| logic-driving `safeParse` calls                                                                                      | same tests                              | retained by rule | Spec § 9                              |         — | AST verdict scan; Task 7.5                                                                                                                   |
| invalid/partial registered output values                                                                             | local test casts                        | retained by rule | Spec § 9                              |         — | cast scan; 9 partial hits                                                                                                                    |
| `lane-progress-frontline.test.ts`: complete unavailable/timed-out outputs                                            | `FrontlineExecutionOutcomeSchema.parse` | migrated         | Spec § 9                              |         — | `frontlineOutcome`; unchanged recording observations                                                                                         |
| `lane-progress-frontline.test.ts`: `partialFindingsOutcome`                                                          | local partial-consumer fixture          | retained by rule | Spec § 9 partial values               |         — | empty findings intentionally invalid; `recordFrontlineAttempt` reads only verdict/admission metadata                                         |
| `delivery/entry-inspection.test.ts`: pending review-fix verification state                                           | `DeliveryStateV1Schema.parse`           | migrated         | Spec § 9                              |         — | complete state from four-member producer fixture                                                                                             |
| config multi-key scripts, Markdown audits, local test admission, delivery remote reply sequences                     | shared scripted Git fake                | migrated         | Spec § 9                              |         — | argument/result sequences preserved; admission 11 consumers; drift recorder retains count                                                    |
| Git executor carriers in active, errand check, lifecycle, recover, start and release-push tests; sync stdin carriers | same local recorders                    | retained by rule | Spec § 9: no argument/result sequence |         — | 25 binding traces: shared-script consumers classified separately; forwarded recorders, release guards and constants retain their local forms |
| delivery remote failure: unavailable reobserve                                                                       | local `unavailableAfterFailure`         | retained by rule | Spec § 9 non-exit unavailability      |         — | original `Error("offline")` retained separately from three process-result cases                                                              |
| missing config key and CAS/unsupported-option fault injections                                                       | shared typed failure fixture            | migrated         | Spec § 9                              |         — | missing key exit 1; CAS fatal exit 128; unsupported option usage exit 129; real-Git hybrids retained                                         |
| inbox-state, staleness sweep, branch-gone cascade, decomposition input schema verdicts                               | shared schema assertion helpers         | migrated         | Spec § 9                              |         — | 21 unchanged schema/input/verdict triples                                                                                                    |
| parsed subtype and result-narrowing casts                                                                            | same casts                              | retained by rule | Spec § 9                              |         — | cast scan; 4 narrowing hits                                                                                                                  |
| E2E canonicalizers and Result assertions                                                                             | same tests                              | retained by rule | Spec § 9                              |         — | Task 7.5                                                                                                                                     |
| notes-sync tests (`user-sync-notes-*`, `notes-*`, integration notes cases)                                           | same tests                              | carved           | `R-NS`                                |         — | test paths; Task 7.5                                                                                                                         |
| branch-tree tests (`project-view-ref`, `completed-index`, ref-reader cases)                                          | same cases                              | carved           | `R-BR`; `R-AR`                        |         — | test paths; Task 7.5                                                                                                                         |
| in-flight and session-init store-source tests                                                                        | same cases                              | carved           | `R-IF`; `R-CW`; `R-NP`                |         — | test paths; Task 7.5                                                                                                                         |
| schema verdicts in carved in-flight cases                                                                            | same assertions                         | carved           | `R-IF`; `R-BR`                        |         — | AST scan; 22 assertions                                                                                                                      |
| schema verdicts in carved session-init cases                                                                         | same assertions                         | carved           | `R-CW`; `R-NS`; `R-BR`                |         — | actual store-source assertions only; materializable/public cleanup schema verdicts migrated                                                  |
| schema verdicts in carved decomposition cases                                                                        | same assertions                         | carved           | `R-DCP`                               |         — | 8 physical plan/operation/report assertions; public refusal/finish assertions migrated                                                       |
| schema verdicts in carved notes-sync cases                                                                           | same assertions                         | carved           | `R-NS`                                |         — | AST scan; 3 assertions                                                                                                                       |
| lifecycle-contribution and path-treatment tests                                                                      | same tests                              | carved           | `R-LC`                                |         — | test paths; Task 7.5                                                                                                                         |
| lifecycle and placement test fixtures                                                                                | same fixtures                           | carved           | `R-LW`; `R-PL`                        |         — | Git/meta scans; Task 7.5                                                                                                                     |
| hook and locus test fixtures                                                                                         | same fixtures                           | carved           | `R-HC`; `R-LOC`                       |         — | Git/meta scans; Task 7.5                                                                                                                     |
| roadmap, teardown, retirement, and branch-history tests                                                              | same fixtures                           | carved           | `R-RM`; `R-LW`; `R-AR`                |         — | Git/meta scans; Task 7.R2                                                                                                                    |
| decomposition and delivery-scoping test cases                                                                        | same fixtures                           | carved           | `R-DCP`; `R-CI`                       |         — | test paths; Task 7.R2                                                                                                                        |
| planning-lane cases in `change-facts` tests                                                                          | same cases                              | carved           | `R-CI`                                |         — | test paths; Task 7.5                                                                                                                         |
| inbox-writer and execution-offer tests                                                                               | same tests                              | retained by rule | `R-NS` survivor                       |         — | test paths; Task 7.5                                                                                                                         |
| `testing-standards` project override                                                                                 | shared support guidance                 | migrated         | Spec § 9                              |         — | Task 2.5; project-only                                                                                                                       |

### Decomposition and continuity owning-module splits (A4, S6)

The ranges below bind unchanged production source at the verification subject. A producer's physical acquisition
or mutation is separately carved; it does not carve pure authored content or a public carried-result contract.
R-DCP and R-CONT cite only the two accepted register corrections under A4. No whole-directory carve applies.

| Surface                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Destination                    | Disposition      | Citation                                                   | Importers | Evidence                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------- | ---------------------------------------------------------- | --------: | --------------------------------------------------------------------------------- |
| `src/lib/work-unit/decompose-content.ts`: SourceReferenceSchema/type303-310; ContentLocator/Unit/ScanResult/Resolution280-301; scanV3DecomposeContent322-390; resolveV3DecomposeContentLocator393-435; resolveV3DecomposeSourceUnit438-end and their byte/Markdown parser helpers                                                                                                                                                                                                                                                                                                                               | owning contract                | retained by rule | Spec §1 pure contract/type edge; §2.1 for migrated digests |         — | source symbols; S6                                                                |
| `src/lib/work-unit/decompose-v3-schema.ts`: LocatorSchema56-82; Source/Machine/sourceUnits/edge/authoring schemas85-227; source/edge/preflight/cutMap/inventory identity helpers280-341; map parse/decode/create/validation443-end                                                                                                                                                                                                                                                                                                                                                                              | owning contract                | retained by rule | Spec §1 pure contract/type edge; §2.1 for migrated digests |         — | source symbols; S6                                                                |
| `src/lib/work-unit/decompose-v3-finish.ts`: V3ExtractionFinishEvidenceSchema/type23-58; PreviewSchema/type53-61; ResultSchema/type64-75; DigestSchema16                                                                                                                                                                                                                                                                                                                                                                                                                                                         | owning contract                | retained by rule | Spec §1 pure contract/type edge; §2.1 for migrated digests |         — | source symbols; S6                                                                |
| `src/lib/work-unit/decompose-v3-result-report.ts`: V3ExtractionReportFactsSchema and V3ExtractionReportFacts17-37                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | owning contract                | retained by rule | Spec §1 pure contract/type edge; §2.1 for migrated digests |         — | source symbols; S6                                                                |
| `src/lib/work-unit/decompose-v3-result-report.ts`: V3ReportedPathDisposition schema/type40-45; TopologyOutcome schema/type48-67; DestinationOutcome schema/type70-82; PathOutcome schema/type85-90; DecomposeResultReport schema/type93-100; materializedPathMap102-104; pathDisposition106-118; reportV3DecomposeResult126-end                                                                                                                                                                                                                                                                                 | store operation                | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where named                    |         — | physical plan/acquisition/mutation; S6                                            |
| `src/lib/work-unit/decompose-v3-plan.ts`: All physical-path state/contributor/mutation/ValidatedDecomposePlan schemas/types/registry/builders, including local DigestSchema18                                                                                                                                                                                                                                                                                                                                                                                                                                   | store operation                | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where named                    |         — | physical plan/acquisition/mutation; S6                                            |
| `src/lib/work-unit/git-decompose-v3-operation.ts`: GitV3DecomposeCommandInput67-72; V3StageRefusalFields90-98 / UnexpectedRefusal100-107; GitV3DecomposeCommandRefusalSchema/type109-127; GitV3DecomposeCommandResult129-131; GitV3ExtractionCommandRefusalSchema/type150-167; GitV3ExtractionCommandResult169-171; composeDecomposeCommandRefusal574-607 / composeExtractionCommandRefusal609-642 as pure output composition                                                                                                                                                                                   | owning contract                | retained by rule | Spec §1 pure contract/type edge; §2.1 for migrated digests |         — | source symbols; S6                                                                |
| `src/lib/work-unit/git-decompose-v3-operation.ts`: Git repository-plan/occupation/materializer/provenance/input APIs57-65,74-88,133-148; repositoryRefusal173-201; exactPlan/exactInventory/exactExtractionFacts/repositoryPlanIdentity203-233; materializerProxy235-262; revalidateOperationPlan264-324; decodeRetirementOperationMap326-346; executeGitV3DecomposeOperation348-449; executeGitV3ExtractionOperation451-545; revalidateCommandMap547-572; sourcePublicationRefusal644-680; executeGitV3DecomposeCommand682-725 / executeGitV3ExtractionCommand727-end physical revalidate/publish/stage bodies | store operation                | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where named                    |         — | physical plan/acquisition/mutation; S6                                            |
| `src/lib/work-unit/decompose-v3-finish-operation.ts`: `executeV3ExtractionSourceFinish`173–end; `git-decompose-v3-finish.ts` physical finish acquisition                                                                                                                                                                                                                                                                                                                                                                                                                                                        | store operation                | carved           | `R-DCP` (A4)                                               |         — | actual source thinning/restoration; public finish schemas above survive           |
| `src/lib/work-unit/decompose-v3-refusal.ts`: evidence/core/public refusal schemas33–102                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | public carried-result contract | retained by rule | Spec §1 type edge/command surface                          |         — | JSON evidence and refusal declarations; physical producers separately carved      |
| `src/lib/work-unit/decompose-v3-refusal.ts`: remedy dictionaries and dispatch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | per-key owning subject         | retained by rule | Spec §1 symbol-range rule                                  |         — | exact 229-key and 11-dispatch split below; no blanket dictionary disposition      |
| `src/lib/work-unit/decompose-v3-remedy-definitions.ts`: preflight/Git-preflight/operation remedy declarations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | per-key owning subject         | retained by rule | Spec §1 symbol-range rule                                  |         — | preflight, Git-preflight and operation dictionaries below                         |
| `src/lib/work-unit/decompose-v3-finish-remedies.ts`: finish dictionary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | per-key owning subject         | retained by rule | Spec §1 symbol-range rule                                  |         — | authored operand keys survive; physical finish keys below carved                  |
| `src/lib/handoff/restate-candidates.ts`: entire `deriveRestateCandidates` and commit/notes-history helper subject                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | store version/contract history | carved           | `R-CONT` (A4)                                              |         — | exact base test restored; production signature unchanged                          |
| `src/handlers/recover.ts`: `resolveRecoveryTaskListEvidence`241–267; `recoveryTaskListPath`269–282                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | store task history             | carved           | `R-CONT` (A4); `R-SP`                                      |         — | seed/fresh task-list acquisition; canonical imports only where forced             |
| `src/handlers/recover.ts`: `bindGitExec`288–293, `bindGitExecInput`295–300; command executor threading                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | bound command surface          | retained by rule | Spec §1 command surface; §8                                |         — | generic adapter binding survives history acquisition                              |
| `src/lib/recover/committed-progress.ts`: `resolveCommittedProgress`, `revParseCommit`, history-backed default; `CommittedProgress`/resolver/options declarations                                                                                                                                                                                                                                                                                                                                                                                                                                                | store state-version history    | carved           | `R-CONT` (A4)                                              |         — | Git ancestry/range evidence subject; exact-base recover-envelope fixture retained |

#### Refusal dictionary keys and ranges

This source-bound inventory contains all 229 keys: 42 pure authored-input/provenance keys survive, and 187 physical
plan, staging, advancement or recovery keys are carved. The owning module and dictionary are named in each group.
Shared declaration/lookup syntax does not change the individual subject's fate.

##### `decompose-v3-refusal.ts` — `V3_REPOSITORY_PLAN_REMEDIES`

| Key                                  | Range   | Disposition      | Citation                                              |
| ------------------------------------ | ------- | ---------------- | ----------------------------------------------------- |
| `unknown-destination`                | 186–190 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `incompatible-content-role`          | 191–195 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `incomplete-profile-artifacts`       | 196–200 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `allocation-projection-mismatch`     | 201–205 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `dependency-projection-mismatch`     | 206–210 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `profile-meta-mismatch`              | 211–215 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `managed-path-set-mismatch`          | 216–220 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `invalid-structure`                  | 221–225 | retained by rule | Spec §1 authored input/content/provenance             |
| `incomplete-authoring`               | 226–230 | retained by rule | Spec §1 authored input/content/provenance             |
| `machine-order`                      | 231–235 | retained by rule | Spec §1 authored input/content/provenance             |
| `machine-identity`                   | 236–240 | retained by rule | Spec §1 authored input/content/provenance             |
| `authoring-identity`                 | 241–245 | retained by rule | Spec §1 authored input/content/provenance             |
| `authoring-order`                    | 246–250 | retained by rule | Spec §1 authored input/content/provenance             |
| `source-shape`                       | 251–255 | retained by rule | Spec §1 authored input/content/provenance             |
| `companion-disposition`              | 256–261 | retained by rule | Spec §1 authored input/content/provenance             |
| `destination-coverage`               | 262–266 | retained by rule | Spec §1 authored input/content/provenance             |
| `placement-cardinality`              | 267–271 | retained by rule | Spec §1 authored input/content/provenance             |
| `shape-cardinality`                  | 272–276 | retained by rule | Spec §1 authored input/content/provenance             |
| `invalid-meta`                       | 277–281 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-meta-mismatch`               | 282–286 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-artifact-mismatch`           | 287–291 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `duplicate-live-work-unit`           | 292–296 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `incoming-edge-set-changed`          | 297–301 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `outgoing-edge-set-changed`          | 302–306 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `duplicate-destination-identity`     | 307–311 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `retiring-origin-destination`        | 312–316 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `unknown-allocation-destination`     | 317–321 | retained by rule | Spec §1 authored input/content/provenance             |
| `incompatible-allocation-locator`    | 322–326 | retained by rule | Spec §1 authored input/content/provenance             |
| `incompatible-source-ownership`      | 327–331 | retained by rule | Spec §1 authored input/content/provenance             |
| `occupied-new-member`                | 332–336 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `missing-dependent`                  | 337–341 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `unwritable-dependent`               | 342–346 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `stale-dependent`                    | 347–351 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `missing-origin-slot`                | 352–356 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `missing-incoming-disposition`       | 357–361 | retained by rule | Spec §1 authored input/content/provenance             |
| `missing-outgoing-disposition`       | 362–366 | retained by rule | Spec §1 authored input/content/provenance             |
| `origin-reference-remains`           | 367–371 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `unknown-dependency-recipient`       | 372–376 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `unknown-internal-dependent`         | 377–381 | retained by rule | Spec §1 authored input/content/provenance             |
| `unknown-internal-prerequisite`      | 382–386 | retained by rule | Spec §1 authored input/content/provenance             |
| `self-dependency`                    | 387–391 | retained by rule | Spec §1 authored input/content/provenance             |
| `unknown-external-target`            | 392–396 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `redundant-external-edge`            | 397–401 | retained by rule | Spec §1 authored input/content/provenance             |
| `retiring-origin-target`             | 402–406 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `unchanged-dependency-slot`          | 407–411 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-kind`                        | 412–416 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `missing-merge-base`                 | 417–421 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `ambiguous-merge-base`               | 422–426 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `invalid-tree-path`                  | 427–431 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `ambiguous-predecessor`              | 432–436 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `predecessor-missing`                | 437–441 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `predecessor-changed`                | 442–446 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `predecessor-absent-from-source`     | 447–451 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `backlog-predecessor-changed`        | 452–456 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `origin-artifact-missing`            | 457–461 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `unexpected-object-kind`             | 462–466 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `unexpected-mode`                    | 467–471 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `git-read-failed`                    | 472–476 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-private-added`               | 477–481 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-private-modified`            | 482–486 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-private-deleted`             | 487–491 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-rider`                       | 492–496 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `no-new-member`                      | 497–501 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `multi-member-cohortless`            | 502–506 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `placement-member-count`             | 507–511 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `unexpected-coordination-location`   | 512–516 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `missing-parent`                     | 517–521 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `nonregular-topology-path`           | 522–526 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `invalid-topology-utf8`              | 527–531 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `wrong-structural-identity`          | 532–536 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `invalid-cohort-template`            | 537–541 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `conflicting-at-cap-provenance`      | 542–546 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `dependency-projection-failed`       | 547–551 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `roadmap-missing`                    | 552–556 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `roadmap-render-failed`              | 557–561 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `roadmap-plan-identity-mismatch`     | 562–566 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `invalid-plan-operand`               | 567–571 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `invalid-managed-path`               | 572–576 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `unsupported-path-state`             | 577–581 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `incompatible-base-prestate`         | 582–586 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `exclusive-role-collision`           | 587–591 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `duplicate-role-owner`               | 592–596 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `duplicate-whole-file-owner`         | 597–601 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `incompatible-mode-transition`       | 602–606 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `contributor-prestate-discontinuity` | 607–611 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `tree-read-failed`                   | 612–616 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `repository-plan-failed`             | 617–621 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |

##### `decompose-v3-refusal.ts` — `V3_ADVANCEMENT_REMEDIES`

| Key                                    | Range   | Disposition | Citation                                              |
| -------------------------------------- | ------- | ----------- | ----------------------------------------------------- |
| `full-protection-required`             | 625–629 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `invalid`                              | 630–634 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `base-not-descendant`                  | 635–639 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `base-ancestry-unavailable`            | 640–644 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `candidate-topology-unavailable`       | 645–649 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `binding-unavailable`                  | 650–654 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `candidate-dirty`                      | 655–659 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `base-dependency-snapshot-unavailable` | 660–664 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `base-acquired-incoming-dependency`    | 665–669 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `dependency-recipient-drift`           | 670–674 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `binding-raced`                        | 675–679 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `merge-refused`                        | 680–684 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `changed-paths-unavailable`            | 685–689 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `changed-paths`                        | 690–694 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `path-state`                           | 695–699 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `transition-record`                    | 700–704 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `blob-unavailable`                     | 705–709 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `write-failed`                         | 710–714 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |

##### `decompose-v3-remedy-definitions.ts` — `V3_PREFLIGHT_REMEDIES`

| Key                          | Range   | Disposition      | Citation                                              |
| ---------------------------- | ------- | ---------------- | ----------------------------------------------------- |
| `source-base-ref`            | 10–13   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `result-base-ref`            | 14–17   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-candidate-ref`       | 18–21   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-candidate-duplicate` | 22–25   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-origin-duplicate`    | 26–29   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-self-identity`       | 30–33   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-ambiguous`           | 34–37   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-predecessor`         | 38–41   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-artifact-duplicate`  | 42–45   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-artifact-mode`       | 46–49   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `planning-profile`           | 50–53   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-unit-duplicate`      | 54–57   | retained by rule | Spec §1 authored input/content/provenance             |
| `incoming-edge`              | 58–61   | retained by rule | Spec §1 authored input/content/provenance             |
| `incoming-edge-duplicate`    | 62–65   | retained by rule | Spec §1 authored input/content/provenance             |
| `outgoing-edge-duplicate`    | 66–69   | retained by rule | Spec §1 authored input/content/provenance             |
| `machine-envelope`           | 70–73   | retained by rule | Spec §1 authored input/content/provenance             |
| `starter-map`                | 74–77   | retained by rule | Spec §1 authored input/content/provenance             |
| `source-logical-branch`      | 78–81   | retained by rule | Spec §1 authored input/content/provenance             |
| `source-ref`                 | 82–85   | retained by rule | Spec §1 authored input/content/provenance             |
| `source-head`                | 86–89   | retained by rule | Spec §1 authored input/content/provenance             |
| `result-ref`                 | 90–93   | retained by rule | Spec §1 authored input/content/provenance             |
| `result-head`                | 94–97   | retained by rule | Spec §1 authored input/content/provenance             |
| `source-artifact-inventory`  | 98–101  | retained by rule | Spec §1 authored input/content/provenance             |
| `source-units`               | 102–105 | retained by rule | Spec §1 authored input/content/provenance             |
| `incoming-edges`             | 106–109 | retained by rule | Spec §1 authored input/content/provenance             |
| `outgoing-edges`             | 110–113 | retained by rule | Spec §1 authored input/content/provenance             |
| `preflight-id`               | 114–117 | retained by rule | Spec §1 authored input/content/provenance             |
| `completed-map`              | 118–121 | retained by rule | Spec §1 authored input/content/provenance             |
| `source-identity`            | 122–125 | retained by rule | Spec §1 authored input/content/provenance             |
| `result-base`                | 126–129 | retained by rule | Spec §1 authored input/content/provenance             |
| `source-unit-ambiguous`      | 130–133 | retained by rule | Spec §1 authored input/content/provenance             |

##### `decompose-v3-remedy-definitions.ts` — `V3_GIT_PREFLIGHT_REMEDIES`

| Key                     | Range   | Disposition | Citation                                              |
| ----------------------- | ------- | ----------- | ----------------------------------------------------- |
| `missing-base`          | 137–140 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `malformed-ref-list`    | 141–144 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `malformed-tree-entry`  | 145–148 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `missing-blob`          | 149–152 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `invalid-meta-encoding` | 153–156 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `invalid-origin-meta`   | 157–160 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `unsupported-artifact`  | 161–164 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |

##### `decompose-v3-remedy-definitions.ts` — `V3_OPERATION_RETRY_REMEDIES`

| Key                                    | Range   | Disposition | Citation                                              |
| -------------------------------------- | ------- | ----------- | ----------------------------------------------------- |
| `base-moved`                           | 168–171 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `partial-projection-dirty`             | 172–175 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `branch-exists-unregistered`           | 176–179 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `registered-at-wrong-path`             | 180–183 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `occupied-path`                        | 184–187 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `duplicate-registration`               | 188–191 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `candidate-head-mismatch`              | 192–195 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `marker-mismatch`                      | 196–199 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `concurrent-creation`                  | 200–203 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `recovery-required`                    | 204–207 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `occupation-failed`                    | 208–211 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `repository-plan-drift`                | 212–215 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `partial-projection-drift`             | 216–219 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `result-locus-unavailable`             | 220–223 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `post-occupation-revalidation-failed`  | 224–227 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `partial-recovery-unavailable`         | 228–231 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `partial-preimage-capture-failed`      | 232–235 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `partial-preimage-set-mismatch`        | 236–239 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `post-stage-revalidation-failed`       | 240–243 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `partial-restoration-failed`           | 244–247 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `transition-record-projection-invalid` | 248–251 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `transition-record-origin-occupied`    | 252–255 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `transition-record-write-failed`       | 256–259 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `transition-record-rollback-failed`    | 260–263 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `path-conflict`                        | 264–267 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `missing-final-blob`                   | 268–271 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `final-blob-mismatch`                  | 272–275 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `invalid-member-projection`            | 276–279 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `observe-failed`                       | 280–283 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `blob-read-failed`                     | 284–287 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `apply-failed`                         | 288–291 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `extraction-facts-missing`             | 292–295 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-ref-moved`                     | 296–299 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `result-ref-moved`                     | 300–303 | carved      | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |

##### `decompose-v3-finish-remedies.ts` — `V3_FINISH_REMEDIES`

| Key                              | Range   | Disposition      | Citation                                              |
| -------------------------------- | ------- | ---------------- | ----------------------------------------------------- |
| `invalid`                        | 6–9     | retained by rule | Spec §1 authored input/content/provenance             |
| `destination-plan-state`         | 10–13   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `destination-missing`            | 14–17   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `destination-object-kind`        | 18–21   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `destination-mode`               | 22–25   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `destination-bytes`              | 26–29   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `destination-scan`               | 30–33   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `destination-locator`            | 34–37   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `destination-meta`               | 38–41   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `dependency-claim`               | 42–45   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `topology-claim`                 | 46–49   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `roadmap-current-render`         | 50–53   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `destination-plan-empty`         | 54–57   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `origin`                         | 58–61   | retained by rule | Spec §1 authored input/content/provenance             |
| `base-ref-mismatch`              | 62–65   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-detached`                | 66–69   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-branch`                  | 70–73   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `base-missing`                   | 74–77   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `base-not-descendant`            | 78–81   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `base-ancestry-unavailable`      | 82–85   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-tree-unreadable`         | 86–89   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `result-base-tree-unreadable`    | 90–93   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `base-tree-unreadable`           | 94–97   | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `result-base-roadmap-unreadable` | 98–101  | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `destination-proof-failed`       | 102–105 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-dirt-read`               | 106–109 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-index-dirty`             | 110–113 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-worktree-dirty`          | 114–117 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-untracked`               | 118–121 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `apply-authority`                | 122–125 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-plan-empty`              | 126–129 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-plan-paths`              | 130–133 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-preimage-capture`        | 134–137 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-preimage-set`            | 138–141 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-index-preimage`          | 142–145 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-worktree-preimage`       | 146–149 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-preimage-raced`          | 150–153 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-before-apply`            | 154–157 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-raced`                   | 158–161 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `base-raced`                     | 162–165 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-apply-failed`            | 166–169 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-restoration-failed`      | 170–173 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-final-capture`           | 174–177 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-final-state`             | 178–181 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-inventory`               | 182–185 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-missing`                 | 186–189 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-object`                  | 190–193 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-mode`                    | 194–197 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-bytes`                   | 198–201 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-range`                   | 202–205 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-allocation`              | 206–209 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |
| `source-unit`                    | 210–213 | carved           | `R-DCP` (A4); `R-PL`/`R-CR` where topology/occupation |

#### Refusal dispatch symbol ranges

| Symbol                                                           | Range   | Disposition      | Citation and split                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------- | ------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invocationArgv`                                                 | 104-123 | retained by rule | Spec §1 symbol-range rule; dictionary keys above; renders public selected command argv                                                                                                                                                                                                                                                                                                                                                                                                              |
| `innermostReason / gitPreflightCode / preflightRemedyDefinition` | 125-138 | retained by rule | Spec §1 symbol-range rule; dictionary keys above; reason parsing/table lookup is common public refusal adapter; table entries retain individual fate                                                                                                                                                                                                                                                                                                                                                |
| `advancementNeedsCandidateCleanup`                               | 140-152 | carved           | `R-DCP`/`R-CR` (A4);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `V3_DIRECT_MAPPED_REASONS / isV3DecomposeMappedReason`           | 154-180 | retained by rule | Spec §1 symbol-range rule; dictionary keys above; Surviving authoring-shape, unexpected-error, source-scan, scaffold-source-invalid-encoding, scaffold-title-missing, target-locator-unresolved; carved scaffold-source-meta-incomplete, scaffold-source-missing, existing-home-unresolvable, target-artifact-absent, uncovered-retirement-content, source-unpublished. Dictionary lookups follow per-key entries; advancementNeedsCandidateCleanup and advancement/operation registry arms carved. |
| `recoveryRemedy`                                                 | 717-740 | carved           | `R-DCP`/`R-CR` (A4); full-candidate teardown branch and partial-restoration affected/restored-path cleanup both physical recovery                                                                                                                                                                                                                                                                                                                                                                   |
| `advancementCleanupRemedy`                                       | 742-764 | carved           | `R-DCP`/`R-CR` (A4); advance-base cleanup predicate, candidate-restore-failed invariant, dependency-recipient-drift preflight/recreate, deterministic branch teardown                                                                                                                                                                                                                                                                                                                               |
| `sourceRouteRemedy`                                              | 766-792 | retained by rule | Spec §1 symbol-range rule; dictionary keys above; 770-779 source-unpublished Git push refs/heads carved; 780-791 authoring-shape command-mode correction surviving                                                                                                                                                                                                                                                                                                                                  |
| `scaffoldRemedy`                                                 | 794-843 | retained by rule | Spec §1 symbol-range rule; dictionary keys above; scaffold-source-meta-incomplete 800-807, scaffold-source-missing 808-815, existing-home-unresolvable 832-839 carved; scaffold-source-invalid-encoding 816-823 and scaffold-title-missing 824-831 surviving content grammar. Default null 840-842 pure composition.                                                                                                                                                                                |
| `targetAndContentRemedy`                                         | 845-885 | retained by rule | Spec §1 symbol-range rule; dictionary keys above; target-artifact-absent 851-856 carved projected-tree existence; target-locator-unresolved 857-861 surviving locator resolution; unexpected-error 863-869 surviving public failure; source-scan 870-877 surviving content decoding; uncovered-retirement-content 878-885 carved physical retirement conservation/deletion.                                                                                                                         |
| `registeredRemedy`                                               | 887-932 | retained by rule | Spec §1 symbol-range rule; dictionary keys above; advancement dispatch 888-900 carved; operation dispatch 901-913 carved; repository dispatch 914-925 follows exact key records; finish dispatch 926-933 follows exact key records; unregistered-code throw surviving registry-totality contract.                                                                                                                                                                                                   |
| `v3DecomposeRemedy`                                              | 935-958 | retained by rule | Spec §1 symbol-range rule; dictionary keys above; reason parsing and public composition surviving; recovery call 937-938 and cleanup call 939-940 carved; preflight lookup/render 941-949 follows exact key records; source/scaffold/target routing 950-955 follows direct splits above; final registered dispatch 956 follows exact key records.                                                                                                                                                   |

Mixed dispatch rows retain common public composition; every carved arm and surviving arm is named above.
This reconciles actual owners and introduces no production changes or additional supporting-schema mirror capture.

#### Supplemental test-support dispositions

| Surface                                                                                                                  | Destination                          | Disposition | Citation                                | Importers | Evidence                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ----------- | --------------------------------------- | --------: | -------------------------------------------------------------------------------------------------- |
| Additional modeled config/object/member/worktree Git failures                                                            | shared typed fixture; config scripts | migrated    | Spec §9; S2                             |         — | exit1 missing config; fatal128 process failures; result/error identity preserved                   |
| Bounded coordinate/diff/fetch/remote/orphan/audit scripts and three setup sequences                                      | shared scripted fake                 | migrated    | Spec §9; S3/S7                          |         — | byte payloads, guards, AbortSignal, order, observation counters and carved archive arms preserved  |
| 26 public materializable/refusal/finish/cleanup verdicts                                                                 | shared schema assertions             | migrated    | Spec §1 pure output; §9; S4             |         — | unchanged schema/input/verdict triples                                                             |
| 20 nested delivery states, base merge input, two complete audit entries                                                  | owning schema parse                  | migrated    | Spec §9; S4                             |         — | outer wrapper metadata/absence preserved; full owning values parsed                                |
| Four semantic meta helpers: remote boundary, concurrent seed, status envelope and rename topology                        | meta fixture builder                 | migrated    | Spec §9; S5                             |         — | supplied semantic fields preserved; carved Candidate/acquisition cases keep original status helper |
| `unit/errand/promote.test.ts`, handoff restate suite, lifecycle index interruptions, session-init user-reference fixture | exact base representations           | carved      | `R-LW`/`R-CR`/`R-NP`; `R-CONT` (A4); S1 |         — | no forcing producer/signature change; surviving fixture consumers separate                         |

#### Shipped-content register

- `testing-standards` shared-support guidance lives in the project override at
  `.arc/system/methods/testing-standards.md`; the package source has no override, so Task 2.5 has no package sync.

### Layout per-file rows

| File                                                                               | Class                 | Kind                                                               | Owner                                                 | Hits | Lines                                                                                                                                                               |
| ---------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `../../.husky/commit-msg`                                                          | `arc-root`            | `root-only-owner`                                                  | repository Git hook invocation                        |    1 |                                                                                                                                                                     |
| `../../.husky/pre-commit`                                                          | `arc-root`            | `root-only-owner`                                                  | repository Git hook invocation                        |    1 |                                                                                                                                                                     |
| `../../.husky/pre-push`                                                            | `arc-root`            | `root-only-owner`                                                  | repository Git hook invocation                        |    1 |                                                                                                                                                                     |
| `../../scripts/check-package-sync.sh`                                              | `arc-root`            | `independent-evidence`; `root-only-owner`; `semantic-policy-owner` | repository shell check                                |   20 | independent-evidence: 6,9,13,16,54,62,73,74,76,100,103,106,111,114; root-only-owner: 17,22; semantic-policy-owner: 31,32,55                                         |
| `../../scripts/check-package-sync.sh`                                              | `template-suffix`     | `independent-evidence`; `semantic-policy-owner`                    | repository shell check                                |    3 | independent-evidence: 62,63; semantic-policy-owner: 65                                                                                                              |
| `../../scripts/check-ts-quality.sh`                                                | `arc-root`            | `independent-evidence`; `root-only-owner`                          | repository shell check                                |    2 | independent-evidence: 40; root-only-owner: 41                                                                                                                       |
| `arc/system/.internal/githooks/commit-msg`                                         | `arc-root`            | `independent-evidence`                                             | Git hook guidance                                     |    2 |                                                                                                                                                                     |
| `arc/system/.internal/githooks/pre-commit`                                         | `active-placement`    | `external-owner`; `independent-evidence`; `semantic-policy-owner`  | lifecycle hook checks (`R-HC`; `R-SP`)                |    7 | external-owner: 216,217; independent-evidence: 202,492; semantic-policy-owner: 194                                                                                  |
| `arc/system/.internal/githooks/pre-commit`                                         | `arc-root`            | `external-owner`; `independent-evidence`; `semantic-policy-owner`  | lifecycle hook checks (`R-HC`; `R-SP`)                |   27 | external-owner: 216,217,238,476,501,505,536,561,587; independent-evidence: 3,5,61,202,274,423,438,447,448,518,529; semantic-policy-owner: 169,196,290,298           |
| `arc/system/.internal/githooks/pre-commit`                                         | `meta-prefix`         | `external-owner`                                                   | lifecycle hook checks (`R-HC`; `R-SP`)                |    2 |                                                                                                                                                                     |
| `arc/system/.internal/githooks/pre-commit`                                         | `method-root`         | `independent-evidence`                                             | lifecycle hook checks (`R-HC`; `R-SP`)                |    1 |                                                                                                                                                                     |
| `arc/system/.internal/githooks/pre-commit`                                         | `planned-placement`   | `external-owner`; `independent-evidence`                           | lifecycle hook checks (`R-HC`; `R-SP`)                |    3 | external-owner: 536; independent-evidence: 492,529                                                                                                                  |
| `arc/system/.internal/githooks/pre-commit`                                         | `roadmap-name`        | `independent-evidence`                                             | lifecycle hook checks (`R-HC`; `R-SP`)                |    6 |                                                                                                                                                                     |
| `arc/system/.internal/githooks/pre-commit`                                         | `tasks-prefix`        | `independent-evidence`                                             | lifecycle hook checks (`R-HC`; `R-SP`)                |    1 |                                                                                                                                                                     |
| `arc/system/.internal/githooks/pre-commit`                                         | `workflow-root`       | `semantic-policy-owner`                                            | CHECK15 staged workflow extension-reference selection |    1 |                                                                                                                                                                     |
| `arc/system/.internal/githooks/pre-push`                                           | `arc-root`            | `independent-evidence`                                             | Git hook guidance                                     |    2 |                                                                                                                                                                     |
| `arc/system/.internal/harness-hooks/claude-code/compaction-recovery.settings.json` | `arc-root`            | `root-only-owner`                                                  | harness hook owner                                    |    2 |                                                                                                                                                                     |
| `arc/system/.internal/harness-hooks/codex-cli/hooks.json`                          | `arc-root`            | `root-only-owner`                                                  | harness hook owner                                    |    8 |                                                                                                                                                                     |
| `arc/system/.internal/harness-hooks/common/codex-recovery-marker.mjs`              | `arc-root`            | `independent-evidence`; `root-only-owner`; `semantic-policy-owner` | harness hook owner                                    |    9 | independent-evidence: 546; root-only-owner: 25,145,199,220,301; semantic-policy-owner: 259,594                                                                      |
| `arc/system/.internal/harness-hooks/common/codex-recovery-marker.mjs`              | `workflow-root`       | `independent-evidence`                                             | harness hook owner                                    |    1 |                                                                                                                                                                     |
| `arc/system/.internal/harness-hooks/common/pre-compact-seed.mjs`                   | `arc-root`            | `independent-evidence`; `root-only-owner`                          | harness hook owner                                    |    3 | independent-evidence: 140,144; root-only-owner: 149                                                                                                                 |
| `arc/system/.internal/harness-hooks/common/session-start-compact.mjs`              | `arc-root`            | `independent-evidence`                                             | harness hook owner                                    |    1 |                                                                                                                                                                     |
| `arc/system/.internal/harness-hooks/common/session-start-compact.mjs`              | `workflow-root`       | `independent-evidence`                                             | harness hook owner                                    |    1 |                                                                                                                                                                     |
| `arc/system/.internal/scripts/arc-lib.sh`                                          | `arc-root`            | `independent-evidence`; `root-only-owner`                          | shell configuration owner                             |    2 | independent-evidence: 3; root-only-owner: 40                                                                                                                        |
| `arc/system/.internal/scripts/validate-links.sh`                                   | `arc-root`            | `independent-evidence`                                             | link checker (`R-SP` for archive paths)               |    2 |                                                                                                                                                                     |
| `arc/system/.internal/scripts/validate-links.sh`                                   | `completed-placement` | `external-owner`                                                   | link checker (`R-SP` for archive paths)               |    2 |                                                                                                                                                                     |
| `arc/system/.internal/scripts/validate-links.sh`                                   | `template-suffix`     | `independent-evidence`; `semantic-policy-owner`                    | link checker (`R-SP` for archive paths)               |    3 | independent-evidence: 96; semantic-policy-owner: 101,124                                                                                                            |
| `arc/system/.internal/scripts/verify-integrity.sh`                                 | `active-placement`    | `independent-evidence`                                             | integrity checker (`R-HC`; `R-RM`)                    |    1 |                                                                                                                                                                     |
| `arc/system/.internal/scripts/verify-integrity.sh`                                 | `arc-root`            | `independent-evidence`                                             | integrity checker (`R-HC`; `R-RM`)                    |    2 |                                                                                                                                                                     |
| `arc/system/.internal/scripts/verify-integrity.sh`                                 | `meta-prefix`         | `external-owner`                                                   | integrity checker (`R-HC`; `R-RM`)                    |    1 |                                                                                                                                                                     |
| `arc/system/.internal/scripts/verify-integrity.sh`                                 | `method-root`         | `independent-evidence`                                             | integrity checker (`R-HC`; `R-RM`)                    |    1 |                                                                                                                                                                     |
| `arc/system/.internal/scripts/verify-integrity.sh`                                 | `roadmap-name`        | `external-owner`                                                   | integrity checker (`R-HC`; `R-RM`)                    |    2 |                                                                                                                                                                     |
| `arc/system/.internal/scripts/verify-integrity.sh`                                 | `workflow-root`       | `root-only-owner`                                                  | integrity checker (`R-HC`; `R-RM`)                    |    2 |                                                                                                                                                                     |
| `src/cli.ts`                                                                       | `active-placement`    | `independent-evidence`                                             | CLI descriptions                                      |    1 |                                                                                                                                                                     |
| `src/cli.ts`                                                                       | `completed-placement` | `independent-evidence`                                             | CLI descriptions                                      |    1 |                                                                                                                                                                     |
| `src/cli.ts`                                                                       | `session-notes-name`  | `independent-evidence`                                             | CLI descriptions                                      |    1 |                                                                                                                                                                     |
| `src/commands/active.ts`                                                           | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                         |    5 |                                                                                                                                                                     |
| `src/commands/active/status.ts`                                                    | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                         |    3 |                                                                                                                                                                     |
| `src/commands/active/status.ts`                                                    | `notes-prefix`        | `external-owner`; `independent-evidence`                           | R-SP; comments/imports                                |    2 | external-owner (R-SP): 587; independent-evidence (source documentation): 565                                                                                        |
| `src/commands/active/status.ts`                                                    | `tasks-prefix`        | `independent-evidence`                                             | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/commands/active/types.ts`                                                     | `active-placement`    | `independent-evidence`                                             | active view documentation                             |    6 |                                                                                                                                                                     |
| `src/commands/active/types.ts`                                                     | `arc-root`            | `independent-evidence`                                             | active view documentation                             |    6 |                                                                                                                                                                     |
| `src/commands/active/types.ts`                                                     | `meta-prefix`         | `independent-evidence`                                             | active view documentation                             |    4 |                                                                                                                                                                     |
| `src/commands/constitution/status.ts`                                              | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                    |    1 |                                                                                                                                                                     |
| `src/commands/diff.ts`                                                             | `arc-root`            | `independent-evidence`                                             | installer diagnostics                                 |    5 |                                                                                                                                                                     |
| `src/commands/health.ts`                                                           | `arc-root`            | `independent-evidence`                                             | installer diagnostics                                 |    4 |                                                                                                                                                                     |
| `src/commands/init.ts`                                                             | `arc-root`            | `independent-evidence`; `semantic-policy-owner`                    | installer output / ignore policy                      |   11 | independent-evidence: 4,77,177,225,237,318,334,337; semantic-policy-owner: 277,278,279                                                                              |
| `src/commands/init.ts`                                                             | `template-suffix`     | `independent-evidence`                                             | installer diagnostics                                 |    1 |                                                                                                                                                                     |
| `src/commands/init.ts`                                                             | `workflow-root`       | `independent-evidence`                                             | installer diagnostics                                 |    1 |                                                                                                                                                                     |
| `src/commands/join.ts`                                                             | `arc-root`            | `independent-evidence`; `semantic-policy-owner`                    | installer output / ignore policy                      |   13 | independent-evidence: 4,6,70,82,172,186,276; semantic-policy-owner: 116,117,118,221,222,223                                                                         |
| `src/commands/reconfigure.ts`                                                      | `arc-root`            | `semantic-policy-owner`                                            | file and ignore policy                                |    3 |                                                                                                                                                                     |
| `src/commands/rename.ts`                                                           | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/commands/rename.ts`                                                           | `arc-root`            | `external-owner`                                                   | R-SP                                                  |    2 | external-owner (R-SP): 500,503                                                                                                                                      |
| `src/commands/rename.ts`                                                           | `meta-prefix`         | `external-owner`; `independent-evidence`                           | R-SP; mixed lines                                     |    2 | external-owner (R-SP): 217; independent-evidence (commit Context text): 275                                                                                         |
| `src/commands/rename.ts`                                                           | `planned-placement`   | `external-owner`                                                   | R-SP                                                  |    1 | external-owner (R-SP): 500                                                                                                                                          |
| `src/commands/start.ts`                                                            | `active-placement`    | `independent-evidence`; `scanner-false-positive`                   | import syntax / documentation                         |    5 | independent-evidence: 297,344; scanner-false-positive: 31,32,35                                                                                                     |
| `src/commands/start.ts`                                                            | `arc-root`            | `independent-evidence`                                             | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/commands/start.ts`                                                            | `meta-prefix`         | `external-owner`; `independent-evidence`                           | R-SP; mixed lines                                     |    3 | external-owner (R-SP): 191; independent-evidence (commit Context text): 306,316                                                                                     |
| `src/commands/status/format.ts`                                                    | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/commands/status/run.ts`                                                       | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/commands/status/run.ts`                                                       | `session-notes-name`  | `independent-evidence`                                             | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/commands/status/schema.ts`                                                    | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/commands/status/types.ts`                                                     | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/commands/status/types.ts`                                                     | `arc-root`            | `independent-evidence`                                             | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/commands/status/types.ts`                                                     | `completed-placement` | `independent-evidence`                                             | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/commands/status/types.ts`                                                     | `planned-placement`   | `independent-evidence`                                             | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/commands/update.ts`                                                           | `arc-root`            | `independent-evidence`; `semantic-policy-owner`                    | installer output / ignore policy                      |    6 | independent-evidence: 519,545,586; semantic-policy-owner: 433,434,435                                                                                               |
| `src/commands/user/add.ts`                                                         | `working-memory-name` | `independent-evidence`                                             | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/commands/user/compact.ts`                                                     | `arc-root`            | `external-owner`                                                   | R-UW                                                  |    1 | external-owner (R-UW): 280                                                                                                                                          |
| `src/commands/user/compact.ts`                                                     | `session-notes-name`  | `external-owner`                                                   | R-NS                                                  |    1 | external-owner (R-NS): 76                                                                                                                                           |
| `src/commands/user/drift.ts`                                                       | `completed-placement` | `independent-evidence`                                             | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/commands/user/drift.ts`                                                       | `session-notes-name`  | `external-owner`; `independent-evidence`                           | R-NS; mixed lines                                     |    4 | external-owner (R-NS): 116; independent-evidence (source documentation): 177,268,274                                                                                |
| `src/commands/user/drift.ts`                                                       | `working-memory-name` | `external-owner`; `independent-evidence`                           | R-UW; mixed lines                                     |    3 | external-owner (R-UW): 122; independent-evidence (source documentation): 178,275                                                                                    |
| `src/commands/user/open.ts`                                                        | `arc-root`            | `external-owner`                                                   | R-UW                                                  |    3 | external-owner (R-UW): 70,95,108                                                                                                                                    |
| `src/commands/user/open.ts`                                                        | `session-notes-name`  | `independent-evidence`; `semantic-policy-owner`                    | source evidence; mixed lines                          |    4 | independent-evidence (source documentation): 3,20; semantic-policy-owner (template input): 40                                                                       |
| `src/commands/user/save-load.ts`                                                   | `arc-root`            | `external-owner`                                                   | R-NS                                                  |    3 | external-owner (R-NS): 317,1186,1273                                                                                                                                |
| `src/commands/user/save-load.ts`                                                   | `completed-placement` | `independent-evidence`                                             | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/commands/user/save-load.ts`                                                   | `meta-prefix`         | `external-owner`                                                   | R-NS                                                  |    2 | external-owner (R-NS): 1150,1151                                                                                                                                    |
| `src/commands/user/save-load.ts`                                                   | `session-notes-name`  | `external-owner`; `independent-evidence`                           | R-NS; mixed lines                                     |    3 | external-owner (R-NS): 82; independent-evidence (source documentation): 79,1238                                                                                     |
| `src/commands/user/sync-status.ts`                                                 | `completed-placement` | `independent-evidence`                                             | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/commands/user/sync-status.ts`                                                 | `session-notes-name`  | `independent-evidence`                                             | import syntax / documentation                         |    2 |                                                                                                                                                                     |
| `src/commands/user/types.ts`                                                       | `session-notes-name`  | `independent-evidence`                                             | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/handlers/base.ts`                                                             | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                    |    1 |                                                                                                                                                                     |
| `src/handlers/delivery-entry.ts`                                                   | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/handlers/delivery-execution.ts`                                               | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                         |    2 |                                                                                                                                                                     |
| `src/handlers/delivery-execution.ts`                                               | `meta-prefix`         | `independent-evidence`                                             | source evidence                                       |    2 |                                                                                                                                                                     |
| `src/handlers/delivery.ts`                                                         | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/handlers/delivery.ts`                                                         | `tasks-prefix`        | `external-owner`                                                   | R-SP                                                  |    1 | external-owner (R-SP): 789                                                                                                                                          |
| `src/handlers/derived-locus-state-probe.ts`                                        | `arc-root`            | `external-owner`                                                   | R-LOC                                                 |    1 | external-owner (R-LOC): 82                                                                                                                                          |
| `src/handlers/init.ts`                                                             | `arc-root`            | `independent-evidence`                                             | installer diagnostics                                 |    7 |                                                                                                                                                                     |
| `src/handlers/lifecycle.ts`                                                        | `active-placement`    | `independent-evidence`; `scanner-false-positive`                   | source evidence; mixed lines                          |    9 | independent-evidence (diagnostic text): 1557; independent-evidence (source documentation): 1496,1518,1629,2468; scanner-false-positive (import syntax): 40,41,42,43 |
| `src/handlers/lifecycle.ts`                                                        | `arc-root`            | `independent-evidence`                                             | source evidence; mixed lines                          |    3 | independent-evidence (diagnostic text): 333,1064; independent-evidence (source documentation): 281                                                                  |
| `src/handlers/lifecycle.ts`                                                        | `completed-placement` | `independent-evidence`                                             | import syntax / documentation                         |    4 |                                                                                                                                                                     |
| `src/handlers/lifecycle.ts`                                                        | `meta-prefix`         | `external-owner`                                                   | R-SP                                                  |    1 | external-owner (R-SP): 1536                                                                                                                                         |
| `src/handlers/lifecycle.ts`                                                        | `tasks-prefix`        | `semantic-policy-owner`                                            | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/handlers/plan.ts`                                                             | `active-placement`    | `independent-evidence`; `scanner-false-positive`                   | import syntax / documentation                         |    2 | independent-evidence: 146; scanner-false-positive: 26                                                                                                               |
| `src/handlers/reconcile.ts`                                                        | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/handlers/recover-probes.ts`                                                   | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                    |    1 |                                                                                                                                                                     |
| `src/handlers/shared.ts`                                                           | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                    |    2 |                                                                                                                                                                     |
| `src/handlers/start.ts`                                                            | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/handlers/status.ts`                                                           | `meta-prefix`         | `external-owner`                                                   | R-SP                                                  |    1 | external-owner (R-SP): 1635                                                                                                                                         |
| `src/handlers/view.ts`                                                             | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                         |    3 |                                                                                                                                                                     |
| `src/lib/active/current-workflow-consistency.ts`                                   | `draft-prefix`        | `independent-evidence`; `semantic-policy-owner`                    | source evidence; mixed lines                          |    2 | independent-evidence (workflow diagnostic): 144; semantic-policy-owner (workflow design rule): 127                                                                  |
| `src/lib/active/current-workflow-consistency.ts`                                   | `spec-prefix`         | `independent-evidence`; `semantic-policy-owner`                    | source evidence; mixed lines                          |    3 | independent-evidence (source documentation): 16; independent-evidence (workflow diagnostic): 135; semantic-policy-owner (workflow design rule): 128                 |
| `src/lib/active/meta-reader.ts`                                                    | `active-placement`    | `independent-evidence`; `scanner-false-positive`                   | source evidence                                       |    2 | independent-evidence (source documentation): 2; scanner-false-positive (import syntax): 24                                                                          |
| `src/lib/active/meta-reader.ts`                                                    | `arc-root`            | `independent-evidence`                                             | source evidence                                       |    1 | independent-evidence (source documentation): 2                                                                                                                      |
| `src/lib/active/meta-reader.ts`                                                    | `meta-prefix`         | `external-owner`; `independent-evidence`                           | R-SP; comments/imports                                |    2 | external-owner (R-SP): 40; independent-evidence (source documentation): 63                                                                                          |
| `src/lib/active/meta-reader.ts`                                                    | `spec-prefix`         | `independent-evidence`                                             | source evidence                                       |    3 | independent-evidence (source documentation): 704                                                                                                                    |
| `src/lib/active/spec-input-parser.ts`                                              | `draft-prefix`        | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/active/spec-input-parser.ts`                                              | `spec-prefix`         | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/active/spec-input-parser.ts`                                              | `tasks-prefix`        | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/base-drift/current-adapters.ts`                                           | `active-placement`    | `scanner-false-positive`                                           | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/base-drift/current-adapters.ts`                                           | `arc-root`            | `external-owner`                                                   | R-BR                                                  |    1 | external-owner (R-BR): 131                                                                                                                                          |
| `src/lib/base-drift/current-adapters.ts`                                           | `completed-placement` | `external-owner`                                                   | R-BR                                                  |    1 | external-owner (R-BR): 131                                                                                                                                          |
| `src/lib/change-facts.ts`                                                          | `active-placement`    | `external-owner`                                                   | R-CI                                                  |    1 | external-owner (R-CI): 394                                                                                                                                          |
| `src/lib/change-facts.ts`                                                          | `arc-root`            | `semantic-policy-owner`; `external-owner`                          | change classifier; `R-CI`                             |    6 | semantic-policy-owner: 306,309; external-owner (`R-CI`): 392,393,394,396                                                                                            |
| `src/lib/change-facts.ts`                                                          | `roadmap-name`        | `external-owner`                                                   | R-CI                                                  |    2 | external-owner (R-CI): 392                                                                                                                                          |
| `src/lib/change-facts.ts`                                                          | `template-suffix`     | `semantic-policy-owner`                                            | file and ignore policy                                |    1 |                                                                                                                                                                     |
| `src/lib/classification.ts`                                                        | `completed-placement` | `semantic-policy-owner`                                            | file classifier                                       |    1 |                                                                                                                                                                     |
| `src/lib/classification.ts`                                                        | `draft-prefix`        | `semantic-policy-owner`                                            | file classifier                                       |    2 |                                                                                                                                                                     |
| `src/lib/classification.ts`                                                        | `method-root`         | `semantic-policy-owner`                                            | file and ignore policy                                |   26 |                                                                                                                                                                     |
| `src/lib/classification.ts`                                                        | `spec-prefix`         | `semantic-policy-owner`                                            | file classifier                                       |    4 |                                                                                                                                                                     |
| `src/lib/classification.ts`                                                        | `template-suffix`     | `semantic-policy-owner`                                            | file and ignore policy                                |   11 |                                                                                                                                                                     |
| `src/lib/commit-check/artifact-resolver.ts`                                        | `active-placement`    | `independent-evidence`                                             | source evidence                                       |    2 |                                                                                                                                                                     |
| `src/lib/commit-check/artifact-resolver.ts`                                        | `arc-root`            | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/commit-check/artifact-resolver.ts`                                        | `completed-placement` | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/commit-check/policy.ts`                                                   | `meta-prefix`         | `semantic-policy-owner`                                            | commit footer policy                                  |    1 |                                                                                                                                                                     |
| `src/lib/commit-check/policy.ts`                                                   | `tasks-prefix`        | `semantic-policy-owner`                                            | commit footer policy                                  |    1 |                                                                                                                                                                     |
| `src/lib/compaction-seed/emitter.ts`                                               | `arc-root`            | `external-owner`                                                   | R-UW                                                  |    1 | external-owner (R-UW): 92                                                                                                                                           |
| `src/lib/compaction-seed/emitter.ts`                                               | `meta-prefix`         | `external-owner`                                                   | R-SP                                                  |    1 | external-owner (R-SP): 220                                                                                                                                          |
| `src/lib/compaction-seed/emitter.ts`                                               | `working-memory-name` | `external-owner`                                                   | R-SP                                                  |    1 | external-owner (R-SP): 188                                                                                                                                          |
| `src/lib/config/schema.ts`                                                         | `active-placement`    | `semantic-policy-owner`                                            | configuration schema                                  |    1 |                                                                                                                                                                     |
| `src/lib/config/schema.ts`                                                         | `arc-root`            | `semantic-policy-owner`                                            | configuration schema                                  |    1 |                                                                                                                                                                     |
| `src/lib/constants.ts`                                                             | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                    |    3 |                                                                                                                                                                     |
| `src/lib/coupling-audit/surface-classifier.ts`                                     | `arc-root`            | `scanner-false-positive`                                           | coupling-audit classifier                             |   10 |                                                                                                                                                                     |
| `src/lib/coupling-audit/surface-classifier.ts`                                     | `workflow-root`       | `scanner-false-positive`                                           | coupling-audit classifier                             |    2 |                                                                                                                                                                     |
| `src/lib/delivery/from-branch.ts`                                                  | `draft-prefix`        | `external-owner`                                                   | R-LC                                                  |    1 | external-owner (R-LC): 556                                                                                                                                          |
| `src/lib/delivery/from-branch.ts`                                                  | `meta-prefix`         | `external-owner`                                                   | R-LC                                                  |    1 | external-owner (R-LC): 555                                                                                                                                          |
| `src/lib/delivery/from-branch.ts`                                                  | `notes-prefix`        | `external-owner`                                                   | R-LC                                                  |    1 | external-owner (R-LC): 558                                                                                                                                          |
| `src/lib/delivery/from-branch.ts`                                                  | `spec-prefix`         | `external-owner`                                                   | R-LC                                                  |    1 | external-owner (R-LC): 557                                                                                                                                          |
| `src/lib/delivery/from-branch.ts`                                                  | `tasks-prefix`        | `external-owner`; `semantic-policy-owner`                          | R-LC; mixed lines                                     |    2 | external-owner (R-LC): 559; semantic-policy-owner (commit footer parser): 569                                                                                       |
| `src/lib/delivery/git-lifecycle-contribution.ts`                                   | `arc-root`            | `external-owner`                                                   | R-LC                                                  |    4 | external-owner (R-LC): 41                                                                                                                                           |
| `src/lib/errand/promote-runtime.ts`                                                | `active-placement`    | `external-owner`; `scanner-false-positive`                         | R-LW; mixed lines                                     |    3 | external-owner (R-LW): 251; scanner-false-positive (import syntax): 6,11                                                                                            |
| `src/lib/git/base-distance.ts`                                                     | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                    |    1 |                                                                                                                                                                     |
| `src/lib/git/in-flight-derivation.ts`                                              | `active-placement`    | `independent-evidence`; `scanner-false-positive`                   | source evidence; mixed lines                          |    3 | independent-evidence (source documentation): 1136; scanner-false-positive (import syntax): 27,28                                                                    |
| `src/lib/git/in-flight-derivation.ts`                                              | `arc-root`            | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/git/remote-ref-reader.ts`                                                 | `active-placement`    | `external-owner`; `independent-evidence`                           | R-BR; mixed lines                                     |    5 | external-owner (R-BR): 660; independent-evidence (source documentation): 598,636,657                                                                                |
| `src/lib/git/remote-ref-reader.ts`                                                 | `arc-root`            | `external-owner`; `independent-evidence`                           | R-BR; mixed lines                                     |    4 | external-owner (R-BR): 660; independent-evidence (source documentation): 598,636,657                                                                                |
| `src/lib/git/remote-ref-reader.ts`                                                 | `meta-prefix`         | `external-owner`; `independent-evidence`                           | R-BR; mixed lines                                     |    4 | external-owner (R-BR): 640; independent-evidence (source documentation): 598,636                                                                                    |
| `src/lib/git/worktree-location.ts`                                                 | `template-suffix`     | `scanner-false-positive`                                           | template type identifier                              |    1 |                                                                                                                                                                     |
| `src/lib/git/worktree-marker.ts`                                                   | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                    |    3 |                                                                                                                                                                     |
| `src/lib/git/worktree-roster.ts`                                                   | `active-placement`    | `external-owner`; `independent-evidence`; `scanner-false-positive` | R-SP; comments/imports                                |    6 | external-owner (R-SP): 364; independent-evidence (source documentation): 107,292,311; scanner-false-positive (import syntax): 16,17                                 |
| `src/lib/git/worktree-roster.ts`                                                   | `arc-root`            | `external-owner`                                                   | R-SP                                                  |    3 | external-owner (R-SP): 320,364,424                                                                                                                                  |
| `src/lib/git/worktree-roster.ts`                                                   | `meta-prefix`         | `external-owner`                                                   | R-PL                                                  |    1 | external-owner (R-PL): 428                                                                                                                                          |
| `src/lib/git/worktree-scaffold.ts`                                                 | `active-placement`    | `scanner-false-positive`                                           | source evidence                                       |    3 |                                                                                                                                                                     |
| `src/lib/git/write-context.ts`                                                     | `arc-root`            | `independent-evidence`                                             | source evidence                                       |    3 |                                                                                                                                                                     |
| `src/lib/git/write-context.ts`                                                     | `draft-prefix`        | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/git/write-context.ts`                                                     | `notes-prefix`        | `independent-evidence`                                             | source evidence                                       |    2 |                                                                                                                                                                     |
| `src/lib/handoff/restate-candidates.ts`                                            | `notes-prefix`        | `external-owner`; `independent-evidence`                           | R-SP; comments/imports                                |    2 | external-owner (R-SP): 64; independent-evidence (source documentation): 45                                                                                          |
| `src/lib/handoff/restate-candidates.ts`                                            | `session-notes-name`  | `independent-evidence`                                             | source evidence                                       |    1 | independent-evidence (source documentation): 53                                                                                                                     |
| `src/lib/handoff/session-notes-path.ts`                                            | `arc-root`            | `external-owner`; `independent-evidence`                           | R-NS; mixed lines                                     |    2 | external-owner (R-NS): 91; independent-evidence (source documentation): 4                                                                                           |
| `src/lib/handoff/session-notes-path.ts`                                            | `session-notes-name`  | `external-owner`; `independent-evidence`                           | R-NS; mixed lines                                     |    3 | external-owner (R-NS): 101; independent-evidence (source documentation): 4,81                                                                                       |
| `src/lib/kernel/schema/vocabulary.ts`                                              | `template-suffix`     | `scanner-false-positive`                                           | identifier syntax                                     |    1 |                                                                                                                                                                     |
| `src/lib/layout/projection.ts`                                                     | `arc-root`            | `layout-definition`                                                | layout resolver                                       |   14 |                                                                                                                                                                     |
| `src/lib/layout/projection.ts`                                                     | `completed-placement` | `layout-definition`                                                | layout resolver                                       |    2 |                                                                                                                                                                     |
| `src/lib/layout/projection.ts`                                                     | `planned-placement`   | `layout-definition`                                                | layout resolver                                       |    1 |                                                                                                                                                                     |
| `src/lib/layout/projection.ts`                                                     | `roadmap-name`        | `layout-definition`                                                | layout resolver                                       |    2 |                                                                                                                                                                     |
| `src/lib/layout/projection.ts`                                                     | `session-notes-name`  | `layout-definition`                                                | layout resolver                                       |    2 |                                                                                                                                                                     |
| `src/lib/layout/projection.ts`                                                     | `working-memory-name` | `layout-definition`                                                | layout resolver                                       |    2 |                                                                                                                                                                     |
| `src/lib/layout/registry.ts`                                                       | `template-suffix`     | `layout-definition`                                                | layout resolver                                       |    2 |                                                                                                                                                                     |
| `src/lib/layout/template-output.ts`                                                | `template-suffix`     | `layout-definition`                                                | layout resolver                                       |    2 |                                                                                                                                                                     |
| `src/lib/manifest/apply.ts`                                                        | `arc-root`            | `independent-evidence`                                             | source documentation                                  |    1 |                                                                                                                                                                     |
| `src/lib/manifest/apply.ts`                                                        | `template-suffix`     | `scanner-false-positive`                                           | identifier syntax                                     |   10 |                                                                                                                                                                     |
| `src/lib/markdown/authority.ts`                                                    | `active-placement`    | `external-owner`                                                   | R-SP                                                  |    1 | external-owner (R-SP): 99                                                                                                                                           |
| `src/lib/markdown/authority.ts`                                                    | `arc-root`            | `external-owner`; `semantic-policy-owner`                          | R-RM; R-SP; comments/imports                          |    8 | external-owner (R-RM): 167; external-owner (R-SP): 91,99; semantic-policy-owner (Markdown authority): 15                                                            |
| `src/lib/markdown/authority.ts`                                                    | `completed-placement` | `external-owner`                                                   | R-SP                                                  |    1 | external-owner (R-SP): 91                                                                                                                                           |
| `src/lib/markdown/authority.ts`                                                    | `roadmap-name`        | `external-owner`                                                   | R-RM                                                  |    2 | external-owner (R-RM): 167                                                                                                                                          |
| `src/lib/markdown/descriptor-worktree.ts`                                          | `tasks-prefix`        | `external-owner`                                                   | R-SP                                                  |    1 | external-owner (R-SP): 39                                                                                                                                           |
| `src/lib/markdown/format-plan.ts`                                                  | `active-placement`    | `scanner-false-positive`                                           | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/markdown/format-plan.ts`                                                  | `template-suffix`     | `scanner-false-positive`                                           | identifier syntax                                     |    1 |                                                                                                                                                                     |
| `src/lib/markdown/selection.ts`                                                    | `arc-root`            | `external-owner`                                                   | R-LC                                                  |    4 | external-owner (R-LC): 17,18,19,20                                                                                                                                  |
| `src/lib/markdown/selection.ts`                                                    | `completed-placement` | `external-owner`                                                   | R-LC                                                  |    1 | external-owner (R-LC): 17                                                                                                                                           |
| `src/lib/markdown/selection.ts`                                                    | `working-memory-name` | `external-owner`                                                   | R-LC                                                  |    1 | external-owner (R-LC): 18                                                                                                                                           |
| `src/lib/paths.ts`                                                                 | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                    |    1 |                                                                                                                                                                     |
| `src/lib/recover/audit.ts`                                                         | `active-placement`    | `external-owner`                                                   | R-SP                                                  |    1 | external-owner (R-SP): 554                                                                                                                                          |
| `src/lib/recover/audit.ts`                                                         | `arc-root`            | `external-owner`                                                   | R-SP                                                  |    2 | external-owner (R-SP): 554,557                                                                                                                                      |
| `src/lib/recover/audit.ts`                                                         | `completed-placement` | `external-owner`                                                   | R-SP                                                  |    1 | external-owner (R-SP): 557                                                                                                                                          |
| `src/lib/recover/audit.ts`                                                         | `meta-prefix`         | `external-owner`                                                   | R-SP                                                  |    2 | external-owner (R-SP): 554,557                                                                                                                                      |
| `src/lib/recover/locus-context.ts`                                                 | `draft-prefix`        | `scanner-false-positive`                                           | workflow filename token                               |    2 |                                                                                                                                                                     |
| `src/lib/release/audit-log.ts`                                                     | `arc-root`            | `independent-evidence`                                             | source evidence                                       |    2 |                                                                                                                                                                     |
| `src/lib/release/interlock-validation.ts`                                          | `active-placement`    | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/release/interlock-validation.ts`                                          | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                    |    1 |                                                                                                                                                                     |
| `src/lib/release/setup-marker.ts`                                                  | `arc-root`            | `independent-evidence`                                             | source evidence                                       |    3 |                                                                                                                                                                     |
| `src/lib/release/wu-resolution.ts`                                                 | `active-placement`    | `independent-evidence`; `scanner-false-positive`                   | source evidence; mixed lines                          |    2 | independent-evidence (source documentation): 28; scanner-false-positive (import syntax): 15                                                                         |
| `src/lib/release/wu-resolution.ts`                                                 | `meta-prefix`         | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/session-envelope/registry.ts`                                             | `active-placement`    | `scanner-false-positive`                                           | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/session-init/cohort-doc.ts`                                               | `active-placement`    | `scanner-false-positive`                                           | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/session-init/cohort-doc.ts`                                               | `planned-placement`   | `independent-evidence`                                             | source evidence                                       |    2 |                                                                                                                                                                     |
| `src/lib/session-init/in-flight-work-unit-sweep.ts`                                | `active-placement`    | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/session-init/in-flight-work-unit-sweep.ts`                                | `completed-placement` | `independent-evidence`                                             | source evidence                                       |    3 |                                                                                                                                                                     |
| `src/lib/session-init/orphan-branch-sweep.ts`                                      | `completed-placement` | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/session-init/retired-subdir-detection.ts`                                 | `arc-root`            | `external-owner`; `independent-evidence`                           | R-UW; mixed lines                                     |    2 | external-owner (R-UW): 109; independent-evidence (source documentation): 35                                                                                         |
| `src/lib/session-init/retired-subdir-detection.ts`                                 | `completed-placement` | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/session-init/stale-worktree-sweep.ts`                                     | `completed-placement` | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/setup.ts`                                                                 | `arc-root`            | `external-owner`                                                   | R-RM                                                  |    1 | external-owner (R-RM): 31                                                                                                                                           |
| `src/lib/setup.ts`                                                                 | `roadmap-name`        | `external-owner`                                                   | R-RM                                                  |    2 | external-owner (R-RM): 31                                                                                                                                           |
| `src/lib/setup.ts`                                                                 | `working-memory-name` | `external-owner`                                                   | R-UW                                                  |    1 | external-owner (R-UW): 147                                                                                                                                          |
| `src/lib/status/assemble-user-view.ts`                                             | `arc-root`            | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/status/project-roadmap-render.ts`                                         | `arc-root`            | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/status/project-view.ts`                                                   | `active-placement`    | `external-owner`; `scanner-false-positive`                         | R-PL; mixed lines                                     |    2 | external-owner (R-PL): 431; scanner-false-positive (import syntax): 17                                                                                              |
| `src/lib/status/project-view.ts`                                                   | `arc-root`            | `external-owner`; `independent-evidence`                           | R-PL; mixed lines                                     |    6 | external-owner (R-PL): 431,432,433,434; independent-evidence (source documentation): 2,206                                                                          |
| `src/lib/status/project-view.ts`                                                   | `completed-placement` | `external-owner`                                                   | R-PL                                                  |    1 | external-owner (R-PL): 434                                                                                                                                          |
| `src/lib/status/project-view.ts`                                                   | `meta-prefix`         | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/status/project-view.ts`                                                   | `planned-placement`   | `external-owner`                                                   | R-PL                                                  |    1 | external-owner (R-PL): 432                                                                                                                                          |
| `src/lib/status/project-view.ts`                                                   | `roadmap-name`        | `independent-evidence`                                             | source evidence                                       |    2 |                                                                                                                                                                     |
| `src/lib/status/ready-mine-source.ts`                                              | `active-placement`    | `scanner-false-positive`                                           | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/status/ready-mine-source.ts`                                              | `arc-root`            | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/status/ready-mine-source.ts`                                              | `completed-placement` | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/status/ready-mine-source.ts`                                              | `meta-prefix`         | `independent-evidence`                                             | source evidence                                       |    2 |                                                                                                                                                                     |
| `src/lib/status/ready-mine-source.ts`                                              | `planned-placement`   | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/status/ready-mine.ts`                                                     | `planned-placement`   | `independent-evidence`                                             | source evidence                                       |    2 |                                                                                                                                                                     |
| `src/lib/status/render.ts`                                                         | `active-placement`    | `scanner-false-positive`                                           | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/types.ts`                                                                 | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                    |    1 |                                                                                                                                                                     |
| `src/lib/user-surface-migration.ts`                                                | `arc-root`            | `external-owner`; `independent-evidence`                           | pre-publication compatibility reader; mixed lines     |    3 | external-owner (pre-publication compatibility reader): 164,165; independent-evidence (source documentation): 5                                                      |
| `src/lib/user-surface-migration.ts`                                                | `session-notes-name`  | `external-owner`                                                   | pre-publication compatibility reader                  |    1 | external-owner (pre-publication compatibility reader): 70                                                                                                           |
| `src/lib/user-surfaces.ts`                                                         | `arc-root`            | `external-owner`                                                   | R-UW                                                  |    1 | external-owner (R-UW): 117                                                                                                                                          |
| `src/lib/user-sync/parser.ts`                                                      | `working-memory-name` | `external-owner`; `independent-evidence`                           | R-SP; comments/imports                                |    2 | external-owner (R-SP): 53; independent-evidence (source documentation): 4                                                                                           |
| `src/lib/user-sync/repo-shared-paths.ts`                                           | `arc-root`            | `independent-evidence`                                             | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/lib/validation-surfaces/registry.ts`                                          | `active-placement`    | `scanner-false-positive`                                           | source evidence                                       |    1 |                                                                                                                                                                     |
| `src/prompts/removal-prompts.ts`                                                   | `arc-root`            | `independent-evidence`                                             | installer diagnostics                                 |    3 |                                                                                                                                                                     |
| `src/scripts/audit-method-triggers.ts`                                             | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                    |    1 |                                                                                                                                                                     |
| `src/scripts/audit-method-triggers.ts`                                             | `method-root`         | `pre-resolved-path`                                                | method trigger auditor (`systemDir`)                  |    2 |                                                                                                                                                                     |
| `src/scripts/audit-method-triggers.ts`                                             | `workflow-root`       | `pre-resolved-path`                                                | method trigger auditor (`systemDir`)                  |    1 |                                                                                                                                                                     |
| `src/scripts/base/merge-composition.ts`                                            | `arc-root`            | `external-owner`                                                   | R-RM                                                  |    2 | external-owner (R-RM): 176                                                                                                                                          |
| `src/scripts/base/merge-composition.ts`                                            | `roadmap-name`        | `external-owner`                                                   | R-RM                                                  |    3 | external-owner (R-RM): 176                                                                                                                                          |
| `src/scripts/integration/checkpoint-composition.ts`                                | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                         |    2 |                                                                                                                                                                     |
| `src/scripts/measure-e2e-shards.ts`                                                | `workflow-root`       | `scanner-false-positive`                                           | CI workflow fixture                                   |    1 |                                                                                                                                                                     |
| `src/scripts/render-framework.ts`                                                  | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                    |    1 |                                                                                                                                                                     |
| `src/scripts/review-gate/hosts/local/live-context.ts`                              | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/scripts/review-gate/policy/assurance.ts`                                      | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/scripts/review-gate/hosts/local/method-files.ts`                              | `method-root`         | `scanner-false-positive`                                           | resolver address inside native join                   |    2 | scanner-false-positive (resolver address): 19,33                                                                                                                    |
| `src/scripts/review-gate/policy/pre-publication-composition.ts`                    | `active-placement`    | `scanner-false-positive`                                           | import syntax / documentation                         |    1 |                                                                                                                                                                     |
| `src/scripts/review-gate/readiness.ts`                                             | `active-placement`    | `external-owner`; `scanner-false-positive`                         | R-SP; comments/imports                                |    2 | external-owner (R-SP): 668; scanner-false-positive (import syntax): 43                                                                                              |
| `src/scripts/review-gate/readiness.ts`                                             | `arc-root`            | `external-owner`; `independent-evidence`                           | R-SP; comments/imports                                |   16 | external-owner (R-SP): 668,703,707,715,810,811,812,813,844,845,846,903,928,975; independent-evidence (review diagnostic): 683,999                                   |
| `src/scripts/review-gate/readiness.ts`                                             | `completed-placement` | `external-owner`                                                   | R-SP                                                  |    3 | external-owner (R-SP): 715,928,975                                                                                                                                  |
| `src/scripts/review-gate/readiness.ts`                                             | `meta-prefix`         | `external-owner`                                                   | R-SP                                                  |    4 | external-owner (R-SP): 668,732,784,975                                                                                                                              |
| `src/scripts/review-gate/readiness.ts`                                             | `planned-placement`   | `external-owner`                                                   | R-SP                                                  |    1 | external-owner (R-SP): 903                                                                                                                                          |
| `src/scripts/validate-extension-points.ts`                                         | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                    |    3 |                                                                                                                                                                     |
| `src/scripts/validate-extension-points.ts`                                         | `workflow-root`       | `independent-evidence`                                             | owner documentation or diagnostics                    |    2 |                                                                                                                                                                     |
| `src/scripts/validate-package-neutrality.ts`                                       | `arc-root`            | `independent-evidence`                                             | owner documentation or diagnostics                    |    5 |                                                                                                                                                                     |
| `src/lib/work-unit/backlog-stub.ts`                                                | `arc-root`            | `independent-evidence`; `external-owner`                           | source documentation; R-PL                            |    4 | independent-evidence (source documentation): 91,122; external-owner (R-PL): 103,128                                                                                 |
| `src/lib/work-unit/backlog-stub.ts`                                                | `draft-prefix`        | `external-owner`                                                   | R-PL                                                  |    1 | external-owner (R-PL): 75                                                                                                                                           |
| `src/lib/work-unit/backlog-stub.ts`                                                | `meta-prefix`         | `independent-evidence`                                             | source documentation                                  |    1 | independent-evidence (source documentation): 47                                                                                                                     |
| `src/lib/work-unit/backlog-stub.ts`                                                | `planned-placement`   | `independent-evidence`                                             | source documentation                                  |    1 | independent-evidence (source documentation): 3                                                                                                                      |
| `src/lib/work-unit/completed-index.ts`                                             | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    1 | scanner-false-positive (import syntax): 28                                                                                                                          |
| `src/lib/work-unit/completed-index.ts`                                             | `arc-root`            | `independent-evidence`; `external-owner`                           | source documentation; R-BR; R-AR                      |   12 | independent-evidence (source documentation): 5,44,89,122,164,170,257,400,413; external-owner (R-BR): 90; external-owner (R-AR): 138,449                             |
| `src/lib/work-unit/completed-index.ts`                                             | `completed-placement` | `independent-evidence`; `external-owner`                           | source documentation; R-BR; R-AR                      |   17 | independent-evidence (source documentation): 2,5,49,89,122,127,129,164,170,176,257,413,430; external-owner (R-BR): 90; external-owner (R-AR): 138,449               |
| `src/lib/work-unit/completed-index.ts`                                             | `meta-prefix`         | `external-owner`                                                   | R-BR                                                  |    2 | external-owner (R-BR): 232,285                                                                                                                                      |
| `src/lib/work-unit/decompose-sweep.ts`                                             | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    1 | scanner-false-positive (import syntax): 19                                                                                                                          |
| `src/lib/work-unit/decompose-v3-conservation.ts`                                   | `draft-prefix`        | `external-owner`                                                   | R-LW                                                  |    1 | external-owner (R-LW): 111                                                                                                                                          |
| `src/lib/work-unit/decompose-v3-conservation.ts`                                   | `notes-prefix`        | `external-owner`                                                   | R-LW                                                  |    1 | external-owner (R-LW): 117                                                                                                                                          |
| `src/lib/work-unit/decompose-v3-conservation.ts`                                   | `spec-prefix`         | `external-owner`                                                   | R-LW                                                  |    5 | external-owner (R-LW): 101,102,113,114                                                                                                                              |
| `src/lib/work-unit/decompose-v3-conservation.ts`                                   | `tasks-prefix`        | `external-owner`                                                   | R-LW                                                  |    1 | external-owner (R-LW): 116                                                                                                                                          |
| `src/lib/work-unit/decompose-v3-plan-composer.ts`                                  | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    1 | scanner-false-positive (import syntax): 14                                                                                                                          |
| `src/lib/work-unit/decompose-v3-preflight.ts`                                      | `draft-prefix`        | `external-owner`                                                   | R-LW                                                  |    1 | external-owner (R-LW): 240                                                                                                                                          |
| `src/lib/work-unit/decompose-v3-preflight.ts`                                      | `spec-prefix`         | `external-owner`                                                   | R-LW                                                  |    3 | external-owner (R-LW): 241,242                                                                                                                                      |
| `src/lib/work-unit/decompose-v3-preflight.ts`                                      | `tasks-prefix`        | `external-owner`                                                   | R-LW                                                  |    1 | external-owner (R-LW): 277                                                                                                                                          |
| `src/lib/work-unit/decompose-v3-repository-plan.ts`                                | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    3 | scanner-false-positive (import syntax): 6,7,8                                                                                                                       |
| `src/lib/work-unit/decompose-v3-repository-plan.ts`                                | `draft-prefix`        | `external-owner`                                                   | R-LW                                                  |    2 | external-owner (R-LW): 193,572                                                                                                                                      |
| `src/lib/work-unit/decompose-v3-repository-plan.ts`                                | `meta-prefix`         | `external-owner`                                                   | R-LW                                                  |    2 | external-owner (R-LW): 481,571                                                                                                                                      |
| `src/lib/work-unit/decompose-v3-repository-plan.ts`                                | `notes-prefix`        | `external-owner`                                                   | R-LW                                                  |    1 | external-owner (R-LW): 574                                                                                                                                          |
| `src/lib/work-unit/decompose-v3-repository-plan.ts`                                | `spec-prefix`         | `external-owner`                                                   | R-LW                                                  |    2 | external-owner (R-LW): 207,212                                                                                                                                      |
| `src/lib/work-unit/decompose-v3-repository-plan.ts`                                | `tasks-prefix`        | `external-owner`                                                   | R-LW                                                  |    1 | external-owner (R-LW): 573                                                                                                                                          |
| `src/lib/work-unit/decompose-v3-repository-tree.ts`                                | `active-placement`    | `scanner-false-positive`; `external-owner`                         | import syntax; R-PL                                   |    3 | scanner-false-positive (import syntax): 6,7; external-owner (R-PL): 114                                                                                             |
| `src/lib/work-unit/decompose-v3-repository-tree.ts`                                | `arc-root`            | `external-owner`                                                   | R-PL                                                  |    6 | external-owner (R-PL): 114,115,116                                                                                                                                  |
| `src/lib/work-unit/decompose-v3-repository-tree.ts`                                | `planned-placement`   | `external-owner`                                                   | R-PL                                                  |    1 | external-owner (R-PL): 115                                                                                                                                          |
| `src/lib/work-unit/decompose-v3-repository-tree.ts`                                | `spec-prefix`         | `external-owner`                                                   | R-PL                                                  |    2 | external-owner (R-PL): 147                                                                                                                                          |
| `src/lib/work-unit/decompose-v3-schema.ts`                                         | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    1 | scanner-false-positive (import syntax): 13                                                                                                                          |
| `src/lib/work-unit/executor-context.ts`                                            | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    3 | scanner-false-positive (import syntax): 56,57,58                                                                                                                    |
| `src/lib/work-unit/executor-context.ts`                                            | `arc-root`            | `independent-evidence`                                             | source documentation                                  |    1 | independent-evidence (source documentation): 101                                                                                                                    |
| `src/lib/work-unit/git-candidate-subject.ts`                                       | `active-placement`    | `external-owner`                                                   | R-CR                                                  |    1 | external-owner (R-CR): 123                                                                                                                                          |
| `src/lib/work-unit/git-candidate-subject.ts`                                       | `arc-root`            | `external-owner`                                                   | R-CR                                                  |    1 | external-owner (R-CR): 123                                                                                                                                          |
| `src/lib/work-unit/git-candidate-subject.ts`                                       | `notes-prefix`        | `external-owner`                                                   | R-CR                                                  |    1 | external-owner (R-CR): 115                                                                                                                                          |
| `src/lib/work-unit/git-decompose-transition-base-advancement.ts`                   | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    1 | scanner-false-positive (import syntax): 6                                                                                                                           |
| `src/lib/work-unit/git-decompose-transition-base-advancement.ts`                   | `arc-root`            | `external-owner`                                                   | R-BR                                                  |    3 | external-owner (R-BR): 606,607,608                                                                                                                                  |
| `src/lib/work-unit/git-decompose-v3-destination-validation.ts`                     | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    1 | scanner-false-positive (import syntax): 11                                                                                                                          |
| `src/lib/work-unit/git-decompose-v3-destination-validation.ts`                     | `meta-prefix`         | `external-owner`                                                   | R-LW                                                  |    1 | external-owner (R-LW): 270                                                                                                                                          |
| `src/lib/work-unit/git-decompose-v3-preflight.ts`                                  | `active-placement`    | `scanner-false-positive`; `external-owner`                         | import syntax; R-PL                                   |    2 | scanner-false-positive (import syntax): 3; external-owner (R-PL): 72                                                                                                |
| `src/lib/work-unit/git-decompose-v3-preflight.ts`                                  | `arc-root`            | `external-owner`                                                   | R-PL                                                  |    9 | external-owner (R-PL): 72,73,142,143,144                                                                                                                            |
| `src/lib/work-unit/git-decompose-v3-preflight.ts`                                  | `planned-placement`   | `external-owner`                                                   | R-PL                                                  |    1 | external-owner (R-PL): 73                                                                                                                                           |
| `src/lib/work-unit/git-graduation-transaction.ts`                                  | `meta-prefix`         | `external-owner`                                                   | R-LW                                                  |    1 | external-owner (R-LW): 265                                                                                                                                          |
| `src/lib/work-unit/git-retirement-authorization-context.ts`                        | `active-placement`    | `scanner-false-positive`; `external-owner`                         | import syntax; R-BR                                   |    3 | scanner-false-positive (import syntax): 5,6; external-owner (R-BR): 153                                                                                             |
| `src/lib/work-unit/git-retirement-authorization-context.ts`                        | `arc-root`            | `external-owner`                                                   | R-BR; R-RM                                            |   12 | external-owner (R-BR): 153,154,155,451,497,498,499,500; external-owner (R-RM): 234                                                                                  |
| `src/lib/work-unit/git-retirement-authorization-context.ts`                        | `meta-prefix`         | `external-owner`                                                   | R-BR                                                  |    3 | external-owner (R-BR): 144,177,495                                                                                                                                  |
| `src/lib/work-unit/git-retirement-authorization-context.ts`                        | `planned-placement`   | `external-owner`                                                   | R-BR                                                  |    1 | external-owner (R-BR): 154                                                                                                                                          |
| `src/lib/work-unit/git-retirement-authorization-context.ts`                        | `roadmap-name`        | `external-owner`                                                   | R-RM                                                  |    2 | external-owner (R-RM): 234                                                                                                                                          |
| `src/lib/work-unit/lifecycle-deps.ts`                                              | `completed-placement` | `independent-evidence`                                             | source documentation                                  |    1 | independent-evidence (source documentation): 7                                                                                                                      |
| `src/lib/work-unit/mutators/rewrite-renamed-meta.ts`                               | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    1 | scanner-false-positive (import syntax): 10                                                                                                                          |
| `src/lib/work-unit/mutators/set-phase.ts`                                          | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    1 | scanner-false-positive (import syntax): 18                                                                                                                          |
| `src/lib/work-unit/park-planning-landing.ts`                                       | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    2 | scanner-false-positive (import syntax): 11,12                                                                                                                       |
| `src/lib/work-unit/park-planning-landing.ts`                                       | `meta-prefix`         | `external-owner`                                                   | R-LW                                                  |    2 | external-owner (R-LW): 268,305                                                                                                                                      |
| `src/lib/work-unit/park-retirement-proof.ts`                                       | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    1 | scanner-false-positive (import syntax): 11                                                                                                                          |
| `src/lib/work-unit/park-retirement-proof.ts`                                       | `meta-prefix`         | `external-owner`                                                   | R-LW                                                  |    1 | external-owner (R-LW): 129                                                                                                                                          |
| `src/lib/work-unit/planning-artifact-tuple.ts`                                     | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    2 | scanner-false-positive (import syntax): 5,10                                                                                                                        |
| `src/lib/work-unit/planning-artifact-tuple.ts`                                     | `draft-prefix`        | `external-owner`                                                   | R-PL                                                  |    1 | external-owner (R-PL): 61                                                                                                                                           |
| `src/lib/work-unit/planning-artifact-tuple.ts`                                     | `meta-prefix`         | `external-owner`                                                   | R-PL                                                  |    1 | external-owner (R-PL): 93                                                                                                                                           |
| `src/lib/work-unit/planning-artifact-tuple.ts`                                     | `spec-prefix`         | `external-owner`                                                   | R-PL                                                  |    3 | external-owner (R-PL): 62,65                                                                                                                                        |
| `src/lib/work-unit/planning-artifact-tuple.ts`                                     | `tasks-prefix`        | `external-owner`                                                   | R-PL                                                  |    3 | external-owner (R-PL): 123,124,171                                                                                                                                  |
| `src/lib/work-unit/pointer-record.ts`                                              | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    1 | scanner-false-positive (import syntax): 22                                                                                                                          |
| `src/lib/work-unit/pointer-record.ts`                                              | `planned-placement`   | `independent-evidence`                                             | source documentation                                  |    1 | independent-evidence (source documentation): 8                                                                                                                      |
| `src/lib/work-unit/rename-reference-sweep.ts`                                      | `active-placement`    | `scanner-false-positive`; `external-owner`                         | import syntax; R-PL                                   |    2 | scanner-false-positive (import syntax): 10; external-owner (R-PL): 155                                                                                              |
| `src/lib/work-unit/rename-reference-sweep.ts`                                      | `meta-prefix`         | `external-owner`                                                   | R-PL                                                  |    1 | external-owner (R-PL): 133                                                                                                                                          |
| `src/lib/work-unit/rename-reference-sweep.ts`                                      | `planned-placement`   | `external-owner`                                                   | R-PL                                                  |    1 | external-owner (R-PL): 156                                                                                                                                          |
| `src/lib/work-unit/side-effects/discharge-dep-edges.ts`                            | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    1 | scanner-false-positive (import syntax): 18                                                                                                                          |
| `src/lib/work-unit/side-effects/readiness-regen.ts`                                | `arc-root`            | `independent-evidence`; `external-owner`                           | source documentation; R-UW                            |    4 | independent-evidence (source documentation): 46,128,166; external-owner (R-UW): 79                                                                                  |
| `src/lib/work-unit/side-effects/readiness-regen.ts`                                | `roadmap-name`        | `independent-evidence`                                             | source documentation                                  |    2 | independent-evidence (source documentation): 151,153                                                                                                                |
| `src/lib/work-unit/validated-graduation-transaction.ts`                            | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    2 | scanner-false-positive (import syntax): 14,23                                                                                                                       |
| `src/lib/work-unit/validated-graduation-transaction.ts`                            | `meta-prefix`         | `external-owner`                                                   | R-LW                                                  |    1 | external-owner (R-LW): 202                                                                                                                                          |
| `src/lib/work-unit/verbs/abandon.ts`                                               | `active-placement`    | `scanner-false-positive`; `independent-evidence`                   | import syntax; source documentation                   |    3 | scanner-false-positive (import syntax): 35,36; independent-evidence (source documentation): 395                                                                     |
| `src/lib/work-unit/verbs/finalize-stage.ts`                                        | `active-placement`    | `scanner-false-positive`; `independent-evidence`                   | import syntax; source documentation                   |    3 | scanner-false-positive (import syntax): 33; independent-evidence (source documentation): 85,98                                                                      |
| `src/lib/work-unit/verbs/finalize-stage.ts`                                        | `arc-root`            | `independent-evidence`                                             | source documentation                                  |    2 | independent-evidence (source documentation): 85,98                                                                                                                  |
| `src/lib/work-unit/verbs/finalize-stage.ts`                                        | `tasks-prefix`        | `external-owner`                                                   | R-LW                                                  |    1 | external-owner (R-LW): 155                                                                                                                                          |
| `src/lib/work-unit/verbs/promote-demote.ts`                                        | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    1 | scanner-false-positive (import syntax): 31                                                                                                                          |
| `src/lib/work-unit/verbs/promote-demote.ts`                                        | `arc-root`            | `independent-evidence`                                             | source documentation                                  |    1 | independent-evidence (source documentation): 99                                                                                                                     |
| `src/lib/work-unit/verbs/publish.ts`                                               | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    2 | scanner-false-positive (import syntax): 27,28                                                                                                                       |
| `src/lib/work-unit/verbs/reopen.ts`                                                | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    2 | scanner-false-positive (import syntax): 34,35                                                                                                                       |
| `src/lib/work-unit/verbs/repoint-design.ts`                                        | `active-placement`    | `independent-evidence`                                             | source documentation                                  |    2 | independent-evidence (source documentation): 51,64                                                                                                                  |
| `src/lib/work-unit/verbs/repoint-design.ts`                                        | `arc-root`            | `independent-evidence`                                             | source documentation                                  |    2 | independent-evidence (source documentation): 51,64                                                                                                                  |
| `src/lib/work-unit/verbs/repoint-design.ts`                                        | `draft-prefix`        | `independent-evidence`                                             | source documentation                                  |    1 | independent-evidence (source documentation): 51                                                                                                                     |
| `src/lib/work-unit/verbs/repoint-design.ts`                                        | `spec-prefix`         | `independent-evidence`                                             | source documentation                                  |    1 | independent-evidence (source documentation): 51                                                                                                                     |
| `src/lib/work-unit/verbs/set-stage.ts`                                             | `active-placement`    | `scanner-false-positive`; `independent-evidence`                   | import syntax; source documentation                   |    3 | scanner-false-positive (import syntax): 32; independent-evidence (source documentation): 64,76                                                                      |
| `src/lib/work-unit/verbs/set-stage.ts`                                             | `arc-root`            | `independent-evidence`                                             | source documentation                                  |    2 | independent-evidence (source documentation): 64,76                                                                                                                  |
| `src/lib/work-unit/verbs/teardown.ts`                                              | `active-placement`    | `scanner-false-positive`                                           | import syntax                                         |    1 | scanner-false-positive (import syntax): 92                                                                                                                          |
| `src/lib/work-unit/verbs/teardown.ts`                                              | `arc-root`            | `independent-evidence`                                             | source documentation                                  |    1 | independent-evidence (source documentation): 112                                                                                                                    |
| `src/lib/work-unit/verbs/teardown.ts`                                              | `completed-placement` | `independent-evidence`                                             | source documentation; diagnostic text                 |   11 | independent-evidence (source documentation): 19,21,34,149,150,157,1261,1281,1283; independent-evidence (diagnostic text): 1330,1337                                 |
| `src/lib/user-sync/types.ts`                                                       | `working-memory-name` | `independent-evidence`                                             | cross-WU parser-support documentation (`R-PARSE`)     |    1 | 4                                                                                                                                                                   |

### Carved-module predicates

| Module path                                        | Register row            |
| -------------------------------------------------- | ----------------------- |
| `src/lib/active/cohort-consistency.ts`             | `R-PL`                  |
| `src/lib/active/cohort-live-context.ts`            | `R-PL`                  |
| `src/lib/evidence-applicability/path-treatment.ts` | `R-LC`                  |
| `src/lib/locus/derived-evidence.ts`                | `R-LOC`                 |
| `src/lib/locus/derived-lifecycle-evidence.ts`      | `R-LOC`                 |
| `src/lib/locus/subject-meta.ts`                    | `R-LOC`; `R-SP`; `R-CR` |
| `src/lib/status/project-view-ref.ts`               | `R-BR`                  |
| `src/lib/status/roadmap-conflict-auto-remedy.ts`   | `R-HC`                  |
| `src/lib/status/roadmap-regeneration-assert.ts`    | `R-HC`                  |
| `src/lib/user-sync/compaction-retention.ts`        | `R-NS`                  |
| `src/lib/user-sync/retired-subdir.ts`              | `R-NS`                  |
| `src/lib/user-sync/sync-state.ts`                  | `R-NS`                  |
| `src/lib/work-unit/candidate-record-store.ts`      | `R-CR`                  |
| `src/lib/work-unit/lifecycle-executor.ts`          | `R-LW`                  |
| `src/lib/work-unit/lifecycle-guards.ts`            | `R-LC`                  |
| `src/lib/work-unit/lifecycle-index.ts`             | `R-PL`                  |
| `src/lib/work-unit/lifecycle-membership.ts`        | `R-PL`                  |
| `src/lib/work-unit/lifecycle-resolver.ts`          | `R-PL`                  |
| `src/lib/work-unit/lifecycle-state.ts`             | `R-PL`                  |
| `src/lib/work-unit/lifecycle-transitions.ts`       | `R-LW`                  |
| `src/lib/work-unit/mutators/relocate-artifacts.ts` | `R-LW`                  |
| `src/lib/work-unit/submission-boundary-store.ts`   | `R-CR`                  |
| `src/lib/work-unit/transition-record-store.ts`     | `R-CR`                  |
| `src/lib/work-unit/verbs/activate-deactivate.ts`   | `R-LW`                  |
| `src/lib/work-unit/verbs/archive.ts`               | `R-AR`                  |
| `src/lib/work-unit/verbs/park-resume.ts`           | `R-LW`                  |
| `src/lib/work-unit/verbs/stub.ts`                  | `R-LW`                  |
| `src/scripts/check-foreign-writes.ts`              | `R-HC`                  |
| `src/scripts/validate-cohort-consistency.ts`       | `R-HC`                  |
| `src/scripts/validate-meta-spec.ts`                | `R-HC`                  |

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

**Phase 6 post-merge comparison:** Reprojecting `main` and `fc6e43dd8` yields the same 129-to-139 ID change.
Only `session-init-envelope`, `session-recover-envelope`, `review-readiness-request`, and
`review-readiness-envelope` differ among shared IDs. The readiness changes are exactly nine
`$ref: slug.schema.json` sites (three in the request and six in the envelope), replacing the local string and
pattern leaves; the session-envelope differences are the Phase 3 root references. No other leaf changed.

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

**Phase 6 post-merge reconciliation:** Removing the shim and re-export import hits empties three
`active-placement` rows and lowers seven exact row counts. At `fc6e43dd8`, the refreshed table assigns all
18,376 hits: 842 per-file code, 234 carved code, and 17,300 non-code. Unmatched hits, overlaps, unused rules,
and count mismatches are zero. The same three-rule negative control exposes exactly its 139 assigned hit
identities (6 code and 133 non-code), and restoring the rules resolves them all. Outputs:
`/tmp/arc-cli-substrate-inventory/layout-reconcile-phase6-final.json` and
`/tmp/arc-cli-substrate-inventory/layout-reconcile-phase6-negative.json`.

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

| Shim path                           | Owner path                                 |
| ----------------------------------- | ------------------------------------------ |
| `src/lib/canonical/managed-path.ts` | `src/lib/kernel/canonical/managed-path.ts` |
| `src/lib/work-unit/slug.ts`         | `src/lib/kernel/schema/slug.ts`            |

For each run, change only its `shim` and `owner` constants, retaining the `.js` extension and named imports. The
resolved-target comparison protects existing direct owner imports; the missing-file filter makes a rerun valid after
deletion. Search the old paths in static, dynamic, and mock specifiers after every base merge. Move the managed-path
behavior tests to `unit/kernel/managed-path.test.ts` and remove only the old-path identity cases there and in
`unit/kernel/slug.test.ts`.
The first runs redirected 28 managed-path and 9 slug specifiers; both reruns redirected zero. The managed-path
behavior suite moved intact, while the two compatibility-identity cases and both shim modules were removed.

### Kernel presentation re-exports

Search named imports, type imports, re-exports, dynamic imports, and `vi.mock` strings targeting `lib/errors.ts`
or `commands/active/types.ts`. Split only `ArcError` and `ArcErrorCode` from the first to
`lib/kernel/errors.ts`; `UserFacingError` and the formatter functions remain. Split the ten work-unit vocabulary
names from the second to `lib/kernel/schema/vocabulary.ts`; active status and session-result types remain. A mixed
import retains its local names and gains one direct owner import. Re-run this named-symbol search after a base
merge and remove the old exports only after no importer still requests them.

```js kernel-export-rewrite
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const routes = new Map([
  ["src/lib/errors.ts", { owner: "src/lib/kernel/errors.ts", names: new Set(["ArcError", "ArcErrorCode"]) }],
  ["src/commands/active/types.ts", { owner: "src/lib/kernel/schema/vocabulary.ts", names: new Set([
    "PrioritySchema", "WORK_UNIT_STATE_ORDER", "WorkClassSchema", "WorkUnitStateSchema", "validateClass",
    "validatePriority", "validateState", "Priority", "WorkClass", "WorkUnitState",
  ]) }],
]);
const absoluteRoutes = new Map([...routes].map(([old, value]) => [path.resolve(old), value]));
const files = execFileSync("git", ["ls-files", "-z", "--", "src", "__tests__"])
  .toString().split("\0").filter((file) => existsSync(file) && /\.(?:[cm]?ts|tsx)$/u.test(file));
let changed = 0;
for (const file of files) {
  const input = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, input, ts.ScriptTarget.Latest, true);
  const edits = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const old = path.resolve(path.dirname(file), statement.moduleSpecifier.text.replace(/\.js$/u, ".ts"));
    const route = absoluteRoutes.get(old);
    if (!route) continue;
    const clause = statement.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings) || clause.name) {
      throw new Error(`unsupported import shape: ${file}:${statement.getStart(source)}`);
    }
    const elements = clause.namedBindings.elements;
    const moved = elements.filter((element) => route.names.has((element.propertyName ?? element.name).text));
    if (!moved.length) continue;
    const kept = elements.filter((element) => !moved.includes(element));
    const member = (element) => {
      const name = element.propertyName ? `${element.propertyName.text} as ${element.name.text}` : element.name.text;
      return `${element.isTypeOnly && !clause.isTypeOnly ? "type " : ""}${name}`;
    };
    const render = (members, target) => {
      let specifier = path.relative(path.dirname(file), path.resolve(target)).replaceAll("\\", "/")
        .replace(/\.ts$/u, ".js");
      if (!specifier.startsWith(".")) specifier = `./${specifier}`;
      return `import ${clause.isTypeOnly ? "type " : ""}{ ${members.map(member).join(", ")} } from "${specifier}";`;
    };
    const replacement = [kept.length ? render(kept, old) : "", render(moved, route.owner)]
      .filter(Boolean).join("\n");
    edits.push({ start: statement.getStart(source), end: statement.getEnd(), replacement });
  }
  if (!edits.length) continue;
  let output = input;
  for (const edit of edits.reverse()) output = output.slice(0, edit.start) + edit.replacement + output.slice(edit.end);
  writeFileSync(file, output);
  changed += edits.length;
  process.stdout.write(`${file}: ${edits.length}\n`);
}
process.stdout.write(`rewritten imports: ${changed}\n`);
```

Extract the fence into `/tmp/arc-cli-substrate-inventory/kernel-export-rewrite.cjs` and run it from
`packages/arc-framework`, where the scratch directory's `node_modules` link resolves TypeScript.
The first run split or redirected 19 named imports, including the mixed `handlers/user.ts` error import and mixed
active result/vocabulary imports. The second run changed zero. `lib/errors.ts` kept its user-facing formatting,
`commands/active/types.ts` kept its result types, and the compatibility re-exports and their identity tests went.
The active validator cases absent from the kernel suite moved into `unit/kernel/vocabulary.test.ts`.

### Local slug schemas

Search `scripts/integration/{checkpoint,merge}.ts` and `scripts/review-gate/readiness.ts` for the three local
`SlugSchema = z.string().regex(...)` declarations. Replace each with `lib/kernel/schema/slug.ts`'s schema. Keep
schema-output aliases as `z.infer`; make `checkpointIntegration`, `mergeIntegration`, and `evaluateReviewReadiness`
take `z.input<typeof RequestSchema>`, since all three parse at entry. Merge-lock hold/release and their internal
transition take `z.input<typeof MergeLockTransitionRequestSchema>` for the same reason. Other producers of
branded request, vehicle, lifecycle, and result values parse through their registered schema, including test
fixtures. Re-run the local-declaration search and `typecheck:all` after base merges; no cast brands a slug.
The command-path pattern in `lib/command-input/registry.ts` names a command, not a work-unit identity, and stays
local.

The readiness public-schema closure test first failed because `slug` was missing and passed after the kernel schema
was adopted. The invalid work-unit slug test passed under the existing local regex; a narrow reconstruction with
`z.string()` made it fail, and it passed after restoration and adoption. The three local copies were removed. The
brand initially surfaced 51 test type errors; parsing the affected fixture values and accepting schema input at
the three entry functions and merge-lock entry functions resolved them. Eight focused review and integration test
files passed 248 tests. One parsed fixture exposed a non-hex `oid("g")`; using another valid hex character kept its
distinct-head scenario while satisfying the Git object-ID schema.
The checkpoint lifecycle summary now composes `WorkUnitStateSchema` for `position.phase` and
`ArcPlacementTierSchema` for `position.location`; its top-level lifecycle `state` remains checkpoint-owned.

### Canonical digest sites

Search surviving `src/` with
`rg -n 'z\.custom<CanonicalDigest>|sha256:|refine\(isCanonicalDigest\)|isCanonicalDigest' src` and inspect each
matching field's producer. A value computed through `canonicalDigest` or `digestBytes` belongs to the unregistered
`lib/kernel/schema/vocabulary.ts` `CanonicalDigestSchema`; direct SHA-256 byte hashing, composite
`checkpoint-v1:` handles, and frozen review-gate version-1 identity schemas retain their domain owner and take
fenced matrix rows. Carved storage code keeps its local pattern under its storage register row. Re-run this search
after base merges and reconcile each surviving match with the owner table below.

The three `z.custom<CanonicalDigest>` copies split by owner: `decompose-v3-schema.ts` and
`decompose-v3-result-report.ts` now compose the kernel schema, retaining their canonical producer types;
`decompose-v3-plan.ts`'s base-tree mutation plan remains carved under `R-DCP`. The two surviving modules pass
their behavior suites and both typechecks.

The first surviving digest batch follows these producer edges (matrix row “kernel digest patterns”):

| Consumer                                                                                                                    | Kernel producer                                                                                                                                                                                                     | Disposition                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `handlers/lifecycle.ts` apply and expected Candidate options                                                                | `git-decompose-v3-finish.ts` `canonicalDigest`; `candidate-attestation.ts` Candidate and subject `canonicalDigest`                                                                                                  | shared schema; malformed `--apply` test failed on the inline-regex message, then passed on the kernel message |
| `handlers/user.ts` inbox post-image digest                                                                                  | `user-sync/inbox-writer.ts` `contentDigest` → `canonical/content-digest.ts` `digestBytes`                                                                                                                           | shared schema                                                                                                 |
| `lib/active/meta-schema.ts`, `lib/work-unit/candidate-evidence.ts`, `lib/work-unit/verbs/attest.ts`                         | `candidate-attestation.ts` Candidate and subject `canonicalDigest`; `git-candidate-subject.ts` `digestBytes`                                                                                                        | shared schema; Candidate projection and re-root types narrowed to the canonical digest                        |
| `lib/work-unit/candidate-applicability.ts`, `candidate-applicability-resolution.ts`, `lib/evidence-applicability/schema.ts` | `candidate-applicability.ts` `canonicalDigest`; `candidate-record-store.ts` `digestBytes`; `candidate-attestation.ts` Candidate `canonicalDigest`; `review-gate/core/dispositions.ts` disposition `canonicalDigest` | shared schema; record version pass-through types narrowed                                                     |
| `lib/work-unit/decompose-content.ts`, `decompose-v3-finish.ts`                                                              | `decompose-v3-schema.ts` source ID and `digestBytes` for content; `git-decompose-v3-finish.ts` apply authority `canonicalDigest`                                                                                    | shared schema                                                                                                 |
| `lib/delivery/review-fix-record-effects.ts` commit expectation guard                                                        | same module's `canonicalDigest` expectation at line 201                                                                                                                                                             | `isCanonicalDigest` boolean guard; its separate direct UTF-8 byte hash at line 107 retains the delivery owner |
| `scripts/review-gate/policy/review-contribution-applicability.ts` projection and residual digests                           | same module's `canonicalDigest` calls                                                                                                                                                                               | shared schema; producer return type narrowed                                                                  |

The integration digest batch follows these producer edges:

| Consumer                                                                             | Kernel producer                                                                                                                                                       | Disposition                                                                          |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `scripts/integration/checkpoint-store.ts` composition digest                         | same module's `canonicalDigest` at the create-only record writer                                                                                                      | shared schema; the `checkpoint-v1:` handle remains integration-owned                 |
| `scripts/integration/checkpoint.ts` policy fingerprint and Candidate record versions | `review-gate/merge-method.ts` `canonicalDigest`; `work-unit/candidate-record-store.ts` `digestBytes`, carried through `checkpoint-composition.ts`                     | shared schema                                                                        |
| `scripts/integration/settlement-plan.ts` settlement identities                       | `review-gate/core/dispositions.ts` `canonicalDigest`; `candidate-attestation.ts` Candidate/response `canonicalDigest`; `gate-contract-v2.ts` target `canonicalDigest` | shared schema; existing composer parse accepts the raw input fields before narrowing |
| `scripts/integration/errand-merge.ts` policy fingerprint                             | `review-gate/merge-method.ts` `canonicalDigest`                                                                                                                       | shared schema                                                                        |

The review-gate digest batch follows these producer edges:

| Consumer                                                                                                                                                          | Kernel producer                                                                                                                                            | Disposition                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `readiness.ts` deliverable ID; `merge-method.ts` policy fingerprint                                                                                               | `lib/delivery/identity.ts` `deriveDeliverableId` calls `canonicalDigest`; `merge-method.ts` computes the fingerprint with `canonicalDigest`                | shared schema                                                                                             |
| `core/gate-contract-v2-schema.ts`, `response-plan-schema.ts`, `review-command-envelope.ts`                                                                        | `core/gate-contract-v2.ts` target, request, requirement, and receipt IDs; `core/identity.ts` policy version; all call `canonicalDigest`                    | shared schema                                                                                             |
| `core/operation-state-schema.ts`, `frontline-run-command-schema.ts`, `fix-authorization-records.ts`                                                               | `operation-state-schema.ts` conditional authorization and hosted result `canonicalDigest`; `core/frontline-admission.ts` operation `canonicalDigest`       | shared schema; producer returns narrowed                                                                  |
| `core/local-review-source.ts`, `hosts/local/hosted-request-owner-index.ts`                                                                                        | `local-review-source.ts` and `hosted-request-owner-index.ts` call `canonicalDigest`                                                                        | shared schema                                                                                             |
| `core/disposition-records.ts`, `hosted/settle.ts`, `runtime/respond-command.ts`                                                                                   | `core/dispositions.ts` disposition set `canonicalDigest`; `operation-state-schema.ts` conditional authorization `canonicalDigest`                          | shared schema; source context and lane pass-through types narrowed                                        |
| `hosted/await.ts`, `policy/standard-review-schema.ts`, `standard-review-guidance.ts`                                                                              | `operation-state-schema.ts` hosted result `canonicalDigest`; `policy/standard-review.ts` rubric `canonicalDigest`                                          | shared schema                                                                                             |
| `policy/pre-publication-procedure.ts`, `integration-boundary-locus.ts`, `review-applicability-resolution.ts`, `delivery-review-terminus.ts`, `handlers/review.ts` | `work-unit/candidate-attestation.ts` Candidate and subject `canonicalDigest`; `candidate-record-store.ts` and `submission-boundary-store.ts` `digestBytes` | shared schema for those fields; the review applicability record effect keeps the delivery byte-hash owner |

The remaining prefixed patterns are the composite integration checkpoint handle, the direct UTF-8
delivery record-effect hash and its result field, the CodeRabbit executable-byte hash, and the
storage-carved locus digest under `R-LOC`. `core/request-key.ts` retains frozen review-gate v1 IDs
from `hashContent` over the legacy serializer as unprefixed hex; the v2 review-gate digests above
come from the kernel. Prefix slicing in local record filenames and `sha256-` branch tokens derives
domain locators from validated kernel digests rather than validating a second digest format.

The delivery plan batch composes `DeliveryCanonicalDigestSchema` from the kernel schema. Its
deliverable IDs are minted by `lib/delivery/identity.ts` `deriveDeliverableId`; semantic
fingerprints by `lib/delivery/fingerprint.ts`; task inventory digests by
`lib/delivery/task-inventory.ts`; and plan digests by `lib/delivery/plan.ts`. Those producers
call `canonicalDigest`. `entry-inspection.ts` carries a disposition ID from
`review-gate/core/dispositions.ts` `canonicalDigest` and a verification continuation from
`lib/delivery/review-fix-verification.ts` `canonicalDigest`. Delivery residue, native suffix,
and session-init projections carry IDs from the validated plan without re-hashing them. Raw
reviewer presentation selectors remain strings at lookup boundaries and compare against the
plan's canonical IDs. The review-fix record-effect digest stays on its direct byte-hash owner.
The delivery batch passed both typechecks, TypeScript lint, and 1,758 focused tests across 103 files;
its parsed fixtures retain their existing assertions.

The Phase 6 post-merge sweep inspected 1,965 tracked source and test TypeScript files with a resolved-specifier
AST scan. No static import, dynamic import, import type, `vi.mock`, fixture, or helper refers to the three
retired kernel shim paths; no named import or re-export requests the retired `ArcError` or active vocabulary
presentation exports. Generated `dist` input and source maps contain no retired path. The remaining local
digest validators are the carved `decompose-v3-plan.ts` (`R-DCP`) and locus storage (`R-LOC`) copies and the
fenced delivery record-byte hash in review applicability resolution. Phase 6 touched carved
`decompose-v3-plan.ts` only to redirect its two removed shim imports, which typecheck; the locus copy was
untouched. The matrix rows above record these dispositions.
The Phase 6 Tier 3 gate passed Markdown lint, ARC contract checks, shell lint, both typechecks, TypeScript lint,
and the routine lane (907 passing test files, 13,137 passing tests, one skipped file and two skipped tests).
The first lane found a checkpoint import from `layout/schema.js`; its public-barrel correction passed the
layout boundary and checkpoint suites (50 tests), then the entire lane passed on rerun. The full build passed.

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

### Test-support Git failure doubles

Search surviving tests with

```sh
rg -n 'throw (Object\.assign|\{)|mockRejectedValue(Once)?\(|new GitProcessError|throw new Error|expectedOutcome\s*:' __tests__ -g '*.ts'
```

Cross-reference each hit with `GitExec`, `RawGitExec`, `GitExecInput`, or an injected `vi.fn` executor. Classify
the thrown value by the consumer and command: modeled process exits use `makeGitProcessError` or a shared fake
`failure` response, preserving the exit status a branch tests; non-exit unavailability, unscripted-call guards,
filesystem errno, and application errors remain plain. Normalizer and executor-adapter tests keep raw shapes as
their inputs. Carved-code tests and `helpers/base-advance.ts`'s deliberately non-exit hybrids retain their local
double. Re-run the search after each base merge and reconcile every surviving process-failure-shaped hit.

### Test-support meta fixtures

Search surviving test Markdown literals with
`rg -n '\|\s*(\*\*)?State(\*\*)?\s*\||\*\*State:\*\*' __tests__ -g '*.ts'`, then
inspect each containing template/string block and the flat-bullet edits found by
`rg -n '\.replace\(["\x27]- \*\*(State|Branch|Current Workflow|Next Action):' __tests__ -g '*.ts'`.
Classify each block as a fixture, a meta parsing/layout test, or pre-activation spec metadata. The builder
`makeMetaFixture` converts vocabulary-valid fixtures; parser/layout and legacy-scan evidence, out-of-vocabulary
invalid fixtures, and carved tests retain their literals. For post-construction changes, use the table setters
`setMetaState` and `setMetaBranch` and bullet setters `setMetaCurrentWorkflow` and `setMetaBulletFields`.
The six known flat-bullet edits are in `helpers/session-envelope-compat.ts` (one),
`helpers/delivery-position-suite.ts` (two), and `e2e/session-init.e2e.test.ts` (three); the envelope goldens
must remain byte-identical. The compatibility helper validates its semantic fields through `makeMetaFixture`,
then projects the pre-table bullet layout that the unchanged goldens capture.

### Test-support schema assertions

Find multiline `safeParse(...).success` assertions by parsing tracked `__tests__` TypeScript with the TypeScript
AST and selecting an `expect` call whose argument is a `.success` property access over a `safeParse` call.
The initial scan found 508 assertions in 89 files. Re-run it after each batch; a `safeParse` result used to drive
logic is not an assertion. Search registered-schema output casts with

```sh
rg -n 'as (OrdinaryErrandRecord|CandidateManagedRecordV1|IntegrationCheckpointCompositionRecord|[A-Za-z]+V1)' __tests__ -g '*.ts'
```

This name-based search seeds the inventory. Also enumerate every TypeScript `AsExpression` and
`TypeAssertionExpression`, resolve imported output aliases through their owning modules to the registry, and
inspect structural casts for a complete registered output shape. In particular, include session-init result
aliases and `AuditEntry`; a type's name need not end in `V1`. Classify each candidate against its registered
schema; valid fixtures and producer JSON parse through that schema, while deliberately invalid and partial
values keep their casts. The converting test keeps its existing acceptance or refusal verdict and any
issue-path assertion. A helper used for both valid and invalid inputs separates parsed construction from an
explicit invalid-value constructor, so the tested refusal still occurs at the production boundary.

The scan source lives at `/tmp/arc-cli-substrate-inventory/schema-assertion-scan.cjs` for this execution;
recreate it from this algorithm after a session boundary: enumerate tracked test TypeScript files with
`git ls-files -z -- __tests__`, parse each with `typescript.createSourceFile`, recursively visit its nodes,
and report a `CallExpression` named `expect` when its first argument is a `PropertyAccessExpression` named
`success` whose receiver is a `CallExpression` with a `PropertyAccessExpression` named `safeParse`.
Run `node /tmp/arc-cli-substrate-inventory/schema-assertion-scan.cjs` from `packages/arc-framework`;
its initial output is `/tmp/arc-cli-substrate-inventory/schema-assertion-initial.txt`.

### Test-support scripted Git doubles

Enumerate typed test executor surfaces and injected adapters with

```sh
rg -l 'GitExec|RawGitExec|GitExecInput' __tests__ -g '*.ts'
rg -n 'exec:|execInput:|rawExec:|mockImplementation|mockResolvedValue' __tests__ -g '*.ts'
```

Inspect each function typed as, assigned to, or passed where a Git executor is expected. A branch-bearing
in-file script of bounded command responses moves to `scriptGitExec`, `scriptRawGitExec`, or
`scriptGitExecInput`; use exact arguments where known, a prefix or predicate for variable refs, ordered responses
for repeat calls, and the fake's `calls` recorder for invocation assertions. Constant one-response stubs,
real-Git runners, fault-injecting hybrids, stateful scenario simulators, and tests of carved code remain local.
Re-run both searches at the segment close and cross-reference the test-support matrix's retained rows.

**Phase 7 final test-support sweep:** At corrected head `905eff1ba`, the import scan covered 1,965 TypeScript files
and 977 local target modules. Its 1,522 unresolved specifiers are external or Node built-ins; none is relative.
The regex scan covered the same files, and the coupling scan covered 2,223 corpus files and all 32 classes. The
15-class layout reconciliation assigned all 18,399 hits with no unmatched code or non-code hit, overlap, unused
rule, or count mismatch. Removing the same per-file, carved, and template rules exposed exactly their 5, 1, and
133 assigned hits; the 139-hit identity comparison found no missing or unexpected hit. Reports:
`/tmp/arc-cli-substrate-inventory/{import-graph,regex,coupling-classes,layout-reconcile}-phase7-corrected.json`
and `/tmp/arc-cli-substrate-inventory/layout-reconcile-phase7-corrected-negative.json`.

Task 7.R2 restored Phase 7-only edits in 42 wholly carved test files and carved ranges of two mixed suites; only
surviving ranges retain conversions. The Git-failure search returned 2,549 broad text hits in 447 files; the added
hits are in restored carved fixtures, and typed-double inspection found no convertible modeled process exit. The
META-block search returned 173 hits in 71 files; the added 17 files are restored carved fixtures. The surviving
hits classify as parser/layout, invalid vocabulary, legacy golden, carved, or the non-META status-table golden.
The AST verdict scan found 73 assertions, all carved: 22 in-flight, 25 session-init, 23 decomposition, and 3
notes-sync. The registered-output cast scan leaves nine invalid/partial fixtures and four parsed-subtype or
result-narrowing casts. The typed-executor search returned 248 files; no convertible local script remains. No
Task 7.4 Errand cut was needed. Search outputs are
`/tmp/arc-cli-substrate-inventory/{git-failure,meta-block,scripted-double}-post-a2.txt` and
`schema-assertion-post-a2.txt` in the same directory. The six member scopes and the storage-carve amendment
reconcile with the matrix; no Phase 7 edit to carved code remains beyond the compile-forced boundary. The 11
session-envelope goldens ran in the passing E2E series, and their fixture files have no diff against final `main`.

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

### Phase 7 test-cost comparison

The CLI build and all three retained runs of each project set passed at corrected head `905eff1ba`. Each run used
the baseline's `tier-isolated` condition and 12 workers. Retained after-run JSON and comparison reports are under
`packages/arc-framework/.test-cost-runs/` as `cli-substrate-phase7-{set}-{1,2,3}.json` and
`cli-substrate-comparison-{set}.json` for each set below. The comparison uses a 10% noise band.

| Project set   | Baseline median (ms) | Phase 7 median (ms) |   Delta | Wall-time verdict |
| ------------- | -------------------: | ------------------: | ------: | ----------------- |
| `unit`        |               12,837 |              14,051 |  +9.46% | unestablished     |
| `integration` |               87,879 |              99,910 | +13.69% | established       |
| `lane`        |               95,021 |             101,299 |  +6.61% | unestablished     |
| `e2e`         |              234,140 |             245,076 |  +4.67% | unestablished     |

The integration row is the only established movement. Its 20 added tests raise the count from 1,786 to 1,806;
the comparison's summed-file-time increase of 8.96% remains within noise. To attribute its wall-time change, a
scratch checkout measured final merge base `2603c21084a693da942dc2949a6806fdc7c4aa2d` on the same axes:
three passing runs gave an 88,243 ms median and the original 1,786 tests. Baseline to final `main` was +0.41%
(unestablished); final `main` to this branch was +13.22% (established). The movement is branch-side. Reports:
`cli-substrate-main-final-integration-{1,2,3}.json`, `cli-substrate-attribution-baseline-to-main.json`, and
`cli-substrate-attribution-main-to-branch.json` in the same retained-run directory. The six `ci-job` budget rows
await the required CI report on the unpublished branch head.

## Review projection

`scripts/review-projection.sh` projects a single-branch work unit's review chunks as stacked draft pull requests
(`build`, `publish`, and `close` over a chunk file), and
`.arc/reference/strategies/project/strategy-review-projection.md` is its runbook. The chunk file assigns every changed
path to exactly one chunk, and chunks stack in file order, so chunk boundaries follow files in dependency order. The
top projection commit's tree equals the work-unit head outside `.arc/active/`, which is never projected.

## Verification corrections

Task 8.1 checks the aggregate diff from `2603c21084a693da942dc2949a6806fdc7c4aa2d` to
`68f0285e6d4d144a2c3f7a8fe9ac44199f0790af`, plus the approved verification edits. Read-only scouts supply
source evidence; the primary author owns the judgments. This is implementer verification, not independent
review evidence. The earlier segment sweep is a historical result, not terminal closure.

The owner approved these six dispositions:

- **F1 — scripted doubles:** `unit/git/base-distance.test.ts`, `integration/inbound-pull.test.ts`,
  `unit/errand-identity-snapshot.test.ts`, and `unit/errand-identity-transaction.test.ts` use the shared
  scripted fake for thirteen bounded response/sequence functions. Recorder assertions, local-only object
  access, pinned-tip reads, oversize guards, and transaction retry behavior remain observable. The snapshot's
  blob-map repository model stays local, as do constant stubs and deliberate non-exit failures.
- **F2 — registered-output casts:** Active, config, and extensions session-init JSON round trips parse through
  their owning schemas. Release commit/push audit readers parse persisted lines through `AuditEntrySchema`.
  The audit-log helpers parse valid entries; `invalidAuditEntry` explicitly bypasses construction validation
  for the existing writer-refusal tests. Unregistered components, partial/narrowed values, and carved
  notes-sync cases retain their exemptions. The schema sweep recipe now includes imported output aliases.
- **F3 — producer-test placement:** Seven of the ten new roots have unit producer coverage. Config,
  extensions, and domain-rules have integration producer coverage at `integration/config.test.ts`,
  `integration/extensions.test.ts`, and `integration/constitution.test.ts`. Those tests exercise filesystem
  and parser composition plus strict refusals. The owner accepted the placement deviation; the criterion's
  original text is preserved with its annotation.
- **F4 — mixed-subject scripts:** Primary-checkout safety and surviving Candidate collection use the shared
  fake. Worktree/output/audit-I/O sync consumers install a shared script explicitly; the local default still
  serves carved notes cases. The matrix names the split, and the subject-meta predicate also cites its
  operational meta acquisition and Candidate record ownership under `R-SP` and `R-CR`.
- **F5 — consumer meta setup:** History ambiguity setup uses the builder with its original semantic fields.
  View presentation consumers install builder output before reading the artifact; the lookup/selection
  cases keep their literal Markdown, and task-body expectations remain unchanged.
- **F6 — carved notes factory:** `createUserIOContext` keeps its original inline bindings. The exported
  `createGitExecInput` factory remains for surviving invocation-bound callers.

The affected ten test files pass all 236 tests. `typecheck:all`, TypeScript lint, and whitespace checks pass
after the recorder assertion correction. These focused witnesses cover F1/F2; the full terminal gates and
criteria walk must close against the final corrected subject before Candidate attestation. Verification
remains open until the final gates, criteria walk, and optional companion disposition close.

### Test fixture subject splits

The Candidate subject suite keeps `collectTarget`, `collect`, and `collectUnstaged` for lifecycle-artifact
treatment and relocated-artifact cases (`R-LC`, `R-SP`, `R-CR`). The surviving bulk entry, exact revision,
merge-base ambiguity, ordinary sibling content, and worktree/untracked content cases use `stagedSubjectGit`,
`collectReviewable`, `collectReviewableUnstaged`, or a direct shared script. Their old assertions remain;
recorded argument assertions read the shared recorder.

The sync suite's local `resetMockDefaults` Git function serves the notes orchestration and notes-outcome
round trips, including its detached-head and rebase overrides. The ten baseline consumers that exercise
worktree push, Errand reconcile output, configured interlock projection, stdout/Clack routing, audit-I/O
failure tolerance, or automatic inbound pull explicitly install `installWorktreeGitScript`. The manual-notes
inbound path-report case has its own shared script. Fifteen early-return or dry-run callbacks consume no
Git responses. Notes-outcome schema round trips retain their earlier carve disposition; their imported
schema and persisted JSON assertions do not convert the orchestrated notes subject into a surviving one.

View's raw shared setup supplies the two lookup/selection cases. Its ten presentation consumers overwrite
that setup with `writePresentationMeta` before the command reads an artifact. Argument-refusal cases do
not consume meta content. The raw selection literals and task-body goldens remain independent evidence.
History's `metaDocument` helper has only surviving attestation/checkpoint ambiguity consumers and uses the
builder throughout.

Retained non-exit Git unavailability includes `integration/git/git.test.ts`'s missing-Git `ENOENT` case.
`unit/commands/rename.test.ts`'s roster has one constant response and an unmatched-call guard. Repository
graph/blob models, stateful provisioning/rename/teardown scenarios, real-Git fault hybrids, malformed
fixtures, and checkpoint meta parsing/placement evidence retain their named rules. The source audit
covered 213 executor carve candidates, 117 meta and six cast carve candidates, and 311 broader casts;
the primary reconciled the mixed-subject candidates against these exact consumer boundaries.

### Criteria companion corrective response

The criteria companion against `681e58f26c77b1c32e89d8f7a1d8e2ca99992854` returned seven confirmed findings. Its
aggregate has a qualified context-freshness record; it supplies no standard-review lane evidence. The approved
response preserves original criterion text and leaves Task 8.1 open:

- `user-sync/types.ts` preserves `CrossWuShape` separately from unused entry-type reexports; `schema.ts` preserves
  entry-parser schemas/types separately from notes-sync schemas/types and normalizers. `R-PARSE` cites the supporting
  contracts correction captured to the identity-global inbox. The `types.ts` layout hit is independent parser
  documentation; CHECK15's workflow-root hit is extension-selection policy.
- `unit/git/remote-ref-reader.test.ts` is byte-identical to the aggregate base, restoring all four original failure
  callbacks. Carved reader cases have no compile-forced reason to change.
- Four config helpers use typed missing-key failures; the three multi-key scripts use the shared fake. CAS and
  unsupported-option injections retain their real-Git hybrids, with modeled exit statuses 128 and 129.
- Markdown audit, local admission, and remote lease scripts use the shared fake with their original replies and
  sequence observations. The deliberate unavailable reobserve retains `Error("offline")` separately.
- Twenty-one schema-verdict assertions use the shared helper with unchanged schemas, values, and verdicts. Complete
  frontline/delivery fixtures parse through owning schemas; the empty-findings partial lane-recording fixture keeps
  its explicit partial-consumer classification.

The response's 18 affected test files pass 365 tests. The full routine lane passes 907 files and 13,140 tests (one
file/two tests skipped); both type checks, Markdown/TypeScript/shell lint, ARC contract checks, and the full build
pass. Layout reconciliation still covers all 18,405 hits with five empty mismatch sets; removal exposes exactly 139
hits. Source hashes and preservation witnesses are under `/tmp/arc-wu-verification/approved-fixes/`.

The remaining helper/adapter, meta/schema, and mixed-subject classifications are not universally closed. Further
findings await separate dispositions. The final cost comparison must bind the ultimately corrected inputs, and
required CI remains unwitnessed. Verification Pass 2 is authorized once these fixes and evidence gaps are resolved;
that condition has not been met, so the pass has not launched.

## Terminal verification evidence

Historical witness series at the subject below. Later corrective responses and A3/A4 govern the current inputs
and evidence timing; these older measurements and open-gap descriptions are not current clearance.

The complete flat-criteria walk uses diff base `2603c21084a693da942dc2949a6806fdc7c4aa2d`, HEAD
`68f0285e6d4d144a2c3f7a8fe9ac44199f0790af`, and the eighteen pending verification files. The package inputs
for the final measurement series are bound by
`sha256:2f2e1735f3d0cff65eebc2388400fcf5f677bb6bb4978d787578ffaa5bc73641` in
`/tmp/arc-wu-verification/test-cost-final-subject.json`. These are author verification witnesses; no independent
review receipt or Candidate authority is asserted.

### Local gates and source witnesses

The F4–F6 focused run passes 109 tests in the four affected suites; its witness is
`/tmp/task81-f456-focused.log`.

The corrected package passes the complete local gate selection: Markdown lint, all three ARC contract checks,
shell and TypeScript lint, both source and test type checks, the routine test lane, and the full ESM/declaration
build. The routine lane passes 907 files and 13,140 tests, with one file and two tests skipped. Gate logs are
`/tmp/task81-final-{markdown,triggers,domain-rules,section-refs,shell,typescript,types,tests,build}.log`.
Subsequent notes-only edits use targeted Markdown lint and the contract checks; package checks remain valid
over unchanged inputs.

The final import graph covers 1,965 TypeScript files and 977 local target modules; no relative import is
unresolved. Regex and coupling scans cover the same source inventory and 2,223 corpus files respectively.
The 15-class layout reconciliation assigns 18,405 hits through 370 rules with all five mismatch sets empty.
Its negative control exposes exactly 139 hit identities: six code and 133 non-code, with none missing or
unexpected. Reports are `/tmp/arc-wu-verification/final-{import-graph,regex,coupling-classes,layout}.json`
and `final-layout-negative{,-summary}.json` in the same directory.

The schema projection has 139 entries against the base's 129, counting the shared-definition container.
Exactly ten roots are added, none removed, and existing changes are confined to the two session envelopes and
the two review-readiness schemas. The readiness projection has nine slug references. The schema witness is
`final-schema-diff-summary.json`; session-envelope fixture expectations have no diff against the base.
Resolved source imports, dynamic/mock/fixture searches, and built metafile input paths contain no retired
target. Relative `canonical/` imports inside the live kernel resolve to that kernel's own modules.

The retained-source comparison checks 56 functions and callbacks: Candidate's three local helpers and eight
carved cases; sync's local setup and forty notes cases; view's raw setup and two selection cases; and the
original `createUserIOContext` function against the base. Every comparison is unchanged. Witness:
`/tmp/arc-wu-verification/retained-source-witness.json`. The refreshed contextual scans classify 343 cast,
876 executor, 174 meta, and 73 schema-verdict candidates; broad counts are discovery inventories, not
unresolved residuals. All 73 direct verdict assertions retain carved subjects.

### Remaining closure boundary

Required public CI has not run for this corrected subject. Its E2E, portability, and six `ci-job` cost rows
remain required before merge under `.github/workflows/ci.yml`. The local witnesses do not report those
checks as green. Criterion 31's CI witness timing and criterion 32's final readiness remain unresolved;
Task 8.1 and all success-criterion markers remain open until their dispositions and the authorized
fresh-context companion close. No content is staged or attested.

### Final test-cost comparison

All twelve final retained runs pass on the package digest above, which the end-of-series check confirms
unchanged. The runs use the baseline's `tier-isolated` condition and 12 workers. Paths under
`packages/arc-framework/.test-cost-runs/` are `cli-substrate-verification-{set}-{1,2,3}.json` and
`cli-substrate-verification-comparison-{set}.json`. The baseline series finished before the first shared
test file was committed at `1575444d89a787a9223c8fe32ec1dafd26061991`; its twelve capture times and the
package identity at `882f50431` retain the temporal evidence.

| Project set   | Baseline median (ms) | Final median (ms) |  Delta | Files / tests | Wall-time verdict |
| ------------- | -------------------: | ----------------: | -----: | ------------- | ----------------- |
| `unit`        |               12,837 |            12,927 | +0.70% | 735 / 11,334  | unestablished     |
| `integration` |               87,879 |            86,010 | −2.13% | 173 / 1,806   | unestablished     |
| `lane`        |               95,021 |            92,971 | −2.16% | 908 / 13,140  | unestablished     |
| `e2e`         |              234,140 |           240,343 | +2.65% | 62 / 619      | unestablished     |

The lane file count includes its skipped module; 907 files execute successfully. Summed-file-time movement
is also within the comparison's 10% noise band for all four rows. The earlier Phase 7 integration movement
did not reproduce in this final series; its historical comparison and attribution remain above. Each E2E
run covers the complete project, including the eleven session-envelope golden cases, with no fixture
expectation changes. Local measurement summaries also report the separate repository budget comparison;
that older budget is not this work unit's retained baseline. The six `ci-job` rows still await CI's report.

## Verification coverage plan

The fresh-context companion uses the task list's 32 immutable success criteria as its rubric. Each scope
answers whether its criteria are established by source and executable witnesses, identifies missing proof,
and reports explicit limits. Generic maintainability findings and standard-review lane conclusions are
outside this verification activity. The primary report and criterion markings are withheld from the
companion; a scoped report alone closes no whole-work-unit claim.

The existing contract segments seed these criterion groups:

| Scope | Criteria                                  | Verification responsibility                              |
| ----- | ----------------------------------------- | -------------------------------------------------------- |
| V1    | 4–12, 17–19                               | Kernel, validation, envelope, and Git contract ownership |
| V2    | 1–3, 13–16, 29–30                         | Layout, storage carve, and residual reconciliation       |
| V3    | 20–28                                     | Invocation binding and test-support convergence          |
| VA    | 31–32 plus cross-scope contract coherence | Aggregate verification and terminal witnesses            |

V3 divides into three criterion contexts: invocation/helper contracts (20–23, 25, 27), executor-conversion
exhaustiveness (24), and meta/schema conversion with cost evidence (26, 28). A fresh local aggregate
consumes those three reports; the top aggregate consumes V1, V2, and that V3 report. These calls constitute
one logical companion pass. Every criterion has exactly one primary scope, while cross-scope dependencies
have explicit consumers. A report lacking coverage or sufficient proof leaves that criterion unresolved.

The complete file/hunk map is `/tmp/arc-wu-verification/coverage-plan.json`, built by
`node /tmp/task81-coverage-plan.cjs`. It records the exact base and HEAD, the pending patch digest,
per-file and per-hunk digests, owner groups, and changed imports crossing scope boundaries. The working
aggregate has 616 paths with rename detection; the explicit removal/addition map has 618 file entries and
1,935 hunks. No file, hunk, or criterion lacks an assignment. Assignment is a coverage plan, not a
verification verdict. The 178 import-only entries are lexical classifications; equivalence of their
imported authority still needs source inspection. Dynamic imports, mocks, injection, and semantic
dependencies remain explicit inspection obligations beyond the static graph.

For later standard review, reuse the contract boundaries and change map, bind them to that review's actual
committed target, and apply the complete selected standard-review rubric to every bounded scope and seam.
Verification reports supply implementation evidence only; they do not satisfy either code-review lane.
The large groups remain seeds for further contract-respecting splits in that later review.

## A3 — Evidence timing at its producing boundary

Owner approval: `Approve A3 and A4` at the Task 8.1 terminal stop. The amendment takes the design arm at low depth.
The integration strategy's private Candidate/review stage precedes authorized public publication; public required
CI cannot be witnessed at that private boundary. The Owner selected final local evidence before Candidate and
retained public obligations at integration. No publication or CI dispatch was authorized.

Superseded original performance statement:

> **Performance and test cost.** New shared helpers and converted tests move `test-cost-budgets.json` rows. Every
> affected baseline, the `lane` row included, is taken before the first new test file lands, because a missed baseline
> cannot be recovered once the change lands. A comparison against those baselines after the last test conversion
> records every tier-isolated row the change moves, and CI's budget report covers the `ci-job` rows. Base merges land
> other work's tests in between, so a row that moved is attributed by measuring the final merge base in a scratch
> checkout.

Frozen Gates criterion (retained verbatim with a forward A3 annotation):

> - **Gates.** Repository-wide searches for every retired symbol and path — static and dynamic imports, `vi.mock`
>   specifiers, fixtures, and generated outputs — come back empty, and the full Tier 3 gates pass: Markdown lint, the ARC
>   contract checks, `typecheck:all`, TypeScript lint, the full test suite with E2E and portability in required CI, and
>   the build.

Original task criteria 31 and 32 (unchanged; disposition `[~]` at the final walk with A3):

> - `[ ]` All quality gates pass (Markdown lint, ARC contract checks, `typecheck:all`, TypeScript lint, the full test
>   suite with E2E and portability in required CI, and the build)
>
> - `[ ]` Ready for integration

The final local gates and affected tier-isolated cost comparisons must bind the ultimately corrected inputs.
Required public E2E, Linux portability, all required CI checks, and six `ci-job` cost reports remain obligations of
this same work unit before integration authorization/merge. Owner: andrew. Forcing event: authorized publication's
exact PR head and its required CI run. Match the comparison axes; unavailable or incompatible evidence stays pending.

Grounding-only task audit: 7.R3 follows 7.R2 and precedes 7.5; the budget artifacts, tier isolation commands, gate
commands, and required CI workflow exist. Previous package hashes predate pending supplemental edits and therefore
need fresh final measurements. The two new criteria join the terminal's existing group. The capture precedes
corrective execution. Propagation: performance body and frozen Gates annotation fold into this capture; 7.5's
original Goal/Outcome remain and point to 7.R3; 8.1 will consider original criteria plus appended criteria. Earlier
A1/A2 corrections and production contracts are unaffected. No delivery plan or lifecycle pointer changes.

## A4 — Exact applicability of two accepted storage rows

Owner approval: `Approve A3 and A4` at the Task 8.1 terminal stop. Design arm, low depth: the settled register
cutoff is changed only for two accepted, source-identified rows; no current-main blanket adoption is inferred.

Superseded original Register statement:

> - **Register.** Every carved item traces to a register row, and every row this carve relies on is on `main` as of
>   `840d348c`. The residual matrix and the closeout exclusion cite rows rather than restating them. A carved item found
>   without a row, at a sweep or at verification, goes to the register's owner as a correction; its matrix row cites that
>   correction, and this unit does not migrate it. The mirror case goes the same way: a surviving symbol that a carved
>   row's fate would delete is named in its module's split and sent to the register's owner as a correction, which its
>   matrix row cites. This branch does not edit the `state-storage` cohort document or its register.

Superseded original final relationship statement:

> The register rows this carve cites are on `main` as of `840d348c`, among them `storage-seam`'s rows for work-unit
> state-path access (36 hand-built lines in 19 files, and 12 resolver calls in 8 files) and for the
> `currentWuReconcile` and `StaleWorktreeSweepResult` slots. Until this branch merges base it reads the `state-storage`
> cohort from `main`. Whether surviving callers later ask the contract for a document or for its fields is
> `storage-seam`'s decision and does not change the carve.

The decomposition and continuity rows are absent at `840d348cbe424bdc9da7c2b32bf15de2fc95aba6` and added at
`891c911c6474e85ed042a9ec38a0effe0f87ae76`. The branch contains the latter commit. All other carve rows stay bound
to the original cutoff. The foreign cohort document is unchanged. R-DCP applies the exact decomposition row;
R-CONT applies handoff commit/notes history and recover task-list/history acquisition. Pure public schemas,
authored content/map contracts, command surfaces and generic executor binders survive their mixed modules.

Grounding-only task audit: 7.R4 follows 7.R3 before 7.5. The exact historical rows, `deriveRestateCandidates`, its
unchanged production signature and base test, and recovery/decomposition mixed source modules exist. S1/S6 provide
the concrete corrective boundaries; recover's history fixture already equals base and stays. The capture commits
before corrective execution. Propagation: §1 and final relationship fold into this capture; 7.5 points forward with
its original Goal/Outcome preserved; 8.1 gains the appended A4 criterion. A1/A2 and unrelated register rows are
unaffected. Final criterion1 will carry the explicit provenance deviation; criterion2 must pass the adopted carve.

## Supplemental criteria response — S1–S7

The Owner approved S1–S6 plus A3/A4, then separately approved the three setup-seam conversions in S7. F1–F7
committed at `fcfbb976b`; A3 and A4 captured before corrections at `3c6eb59a2` and `d75236bfe`. These are continued
source classifications and approved responses to Pass 1, not another adversarial pass or standard code review.

The corrective delta changes 29 test/helper files. Four carved boundaries are restored: Errand promotion and
handoff restatement equal base; lifecycle index interruptions keep their original plain errors; the session-init
user-reference authority case uses the original literal constructor while four surviving consumers use the builder.
The remote-ref reader and recover-envelope history fixtures remain exact base. Notes name both adopted register
rows, the mixed owning-module ranges, 229 remedy keys and 11 dispatch splits. No production behavior changes.

Surviving tests use seven typed Git process-failure conversions, thirteen callable-script conversions and three
finite setup-sequence conversions, 26 unchanged schema-verdict triples, 23 complete owning-schema parses, and four
semantic meta helpers. Archive acquisition, notes-specific save/push gating, deliberate offline unavailability,
invalid/partial/schema-parser specimens and pre-existing typed setup errors retain their named local boundaries.
The observation witness checks 1,909 expressions: only the authorized schema-verdict and base-merge-input parser
mechanics differ; existing result, failure, guard, sequencing and transport observations are preserved.

The complete local gate commands pass: 617 focused tests in 24 files; routine lane 907 passing files/13,140 tests
with one file/two tests skipped; both type checks; targeted/full TypeScript, Markdown and shell lint; ARC contract
checks; and the ESM/declaration build. Five affected E2E suites pass 63 tests in a serial run. The earlier overlapping
E2E attempt failed nine times because routine unit-mocks removed `dist/cli.js`; it remains recorded as failed,
not passing evidence. The serial rerun followed routine completion with no source correction.

Layout reconciliation covers 18,396 hits in 15 classes over 2,223 corpus files, with five empty mismatch sets.
Removing the three controls exposes exactly 139 hits, with no unexpected or missing hit. Raw source hashes, normalized
observation expressions, actual gate logs and the collision/serial-run record are under
`/tmp/arc-wu-verification/supplemental-fixes/`.

The source-classification response is complete. Frozen discoveries remain intact: 1,042 callable rows,
2,813 original binding edges, 1,388 setup edges, 423 helper imports and 126 shared-fake calls. Current source closure
records 2,808 bindings, 1,376 setups, 447 resolved helper edges and 155 shared-fake calls, with no unresolved origin or
consumer classification. Each old residual maps to an approved replacement origin or an explicit mixed-subject
installation; all 29 current source hashes match the tested inputs. Counts control discovery coverage, while the
named producer/consumer source proofs establish semantic fate. The root verified the exact 20 original corrective
origins and three S7 sites; no additional material finding remains. Original duplicate-body pointers remain historical;
the final exact replacement origins disambiguate current loci. The final manifest and root acceptance are at
`classification-git/final-source-proof-manifest.json` and
`supplemental-fixes/root-source-classification-acceptance.json` beneath the scratch evidence root.

The current primary walk covers all 35 immutable criteria (the original 32 plus A3/A4's three appended criteria):
33 met and two superseded under A3. Original 31/32 remain verbatim; public obligations have moved to their producing
boundary. Task 8.1 and the task-list criterion markings await the combined fresh-context result. This primary walk
does not establish adversarial convergence or standard-review coverage. Pass 1 of 2 remains non-converged, with its
approved source response applied and verified. Pass 2 is separately authorized and remains unlaunched/unconsumed
until this corrective commit's concrete gate is released.

Required public E2E, Linux portability, every required CI check and all six `ci-job` cost reports are unavailable
here and mandatory against the exact authorized published head before integration authorization/merge, owned by
andrew under A3. Publication of that authorized head is the forcing event. Local `tier-isolated` results do not
establish `ci-job` elapsed cost; reports with missing, failed, incompatible or incomplete evidence cannot pass.

### Corrected-input test-cost comparison (A3)

Twelve passing serial samples bind all 2,188 tracked package files at
`sha256:ed709c7bf74203e8fbbf8a9eef146c3c928530965cd191d33649c1af0397b216`.
The source package remained unchanged throughout measurement. Each comparison uses the original three-sample
baseline and three final samples with matching project set, `tier-isolated` condition and 12-worker sizing. Original
baseline files and all earlier measurements are preserved; baseline chronology and raw historical limits remain
as recorded above. The final runs are `cli-substrate-supplemental-{set}-{1,2,3}.json`, with
`cli-substrate-supplemental-comparison-{set}.json`, under the package's ignored `.test-cost-runs/` directory.

| Project set   | Baseline median (ms) | Final median (ms) |  Delta | Files / tests | Wall-time verdict     |
| ------------- | -------------------: | ----------------: | -----: | ------------- | --------------------- |
| `unit`        |               12,837 |            12,770 | -0.52% | 735 / 11334   | within 10% noise band |
| `integration` |               87,879 |            84,629 | -3.70% | 173 / 1806    | within 10% noise band |
| `lane`        |               95,021 |            89,086 | -6.25% | 908 / 13140   | within 10% noise band |
| `e2e`         |              234,140 |           235,764 | +0.69% | 62 / 619      | within 10% noise band |

Summed-file-time comparisons are retained separately from wall time. Values inside the configured noise band have
unestablished improvement/regression; a lower median is not a causal performance claim. The six CI-job rows keep
their own mode and worker-sizing axes and remain due at public CI. This closes Task 7.R3.a's local measurement
obligation and records 7.R3.b's public continuation; it does not authorize publication or integration.

A server restart interrupted the last E2E sample before it wrote a result. Its log is retained without an inferred
test verdict; only that sample was rerun. The other eleven completed samples and all package hashes remained intact.
`supplemental-fixes/cost-restart-record.json` records the interruption and replacement log separately.

## Pass 2 corrective response — P1–P5 and Q1–Q6

The whole-target criteria companion at `f87e414755c884fae86d2ce82ad425770777388b` reported 29 established,
four contradicted and two superseded criteria. The primary confirmed four major findings and one minor finding,
including the narrowed rejection in P2. Pass 2 of 2 ended non-converged at cap exhaustion; applying its responses
does not change that historical signal or supply standard-review coverage. Earlier source-account closure claims
and measurements above remain historical at their named subjects.

The approved responses restore committed-progress exactly to base and the four carved status-view assertion
representations. `createUserIOContext` composes its stdin executor through the explicit factory, and sync's common
identity prelude receives the supplied subprocess policy. Both policy cases have behavioral reconstruction failures
and passing restored checks. Three finite D4 scripts use the shared raw fake with their original observations.

The remaining source account adds shared scripts for immutable delivery-containment replies, the canary retry
sequence, generic ancestry, the non-CAS failure scenario, and the orphan sweep's surviving branch replies.
The orphan archive arm remains byte-identical. Errand identity acquisition tests are restored exactly to base;
their optional conversions had no compile-forcing edge. Constant stubs, real-Git drivers, mutable repository models,
lower execa-adapter mocks and deliberate non-exit failures retain their respective boundaries.

The refreshed compiler inventory contains 2,807 bindings, 1,377 mock setups, 157 shared-script calls and 450 helper
edges. Of the 1,042 prior callable records, 978 retain exact current bodies; all 64 changed bodies have explicit
current response, restoration or replacement fates in `p-responses/current-source-account-bridge.json`.
These counts establish source conservation within the stated discovery forms, not universal runtime dataflow
coverage. Earlier scout snapshots remain historical; current source identities and actual consumer contracts
govern the primary account.

Q6's correction is recorded in `storage-contract` planning at `7c52f65fd8953ce122702755e4a96460ed713a17`.
The plan assigns physical identity tip/tree/blob acquisition and fetched reads to `storage-ref-backend`; index
projections and consumer protocols stay with `storage-seam`'s members. The consumer map includes
`lib/errand/record.ts` and the Errand family for active in-flight, user-view and response composition. Its C1 requires
distinct absent, unreadable and complete listings, per-entry diagnostics, one version as the mutation basis, and
refusal to authorize review from incomplete evidence. The register reader coverage is scheduled for draft-close
batch 4; `R-ID` cites the routed correction, without adopting another later register row.

The current focused responses pass 170 tests across twelve suites. The full routine lane passes 907 files and
13,142 tests, with one file/two tests skipped; both type checks, TypeScript and shell lint, and the full build pass.
All twelve final cost samples pass over the same corrected package inputs. Final documentation checks are
reported against these final note bytes. Raw source accounts, preservation witnesses and producing gate
records are under `/tmp/arc-wu-verification/pass2/`.

### Final corrective-input test-cost comparison (A3)

Twelve passing serial samples bind all 2,188 tracked package files at
`sha256:55c8130b89c1e0c9b15d783385b8150fc15a8d8da460b1e97afebb7faa0550a8`.
The package identity is checked before every sample and after the series. Each comparison retains the original
three-sample baseline, matching `tier-isolated` condition, project set and 12-worker sizing. All original baselines
and historical samples are preserved. Final samples are `cli-substrate-pass2-{set}-{1,2,3}.json`, and comparisons
are `cli-substrate-pass2-comparison-{set}.json`, in the package's ignored `.test-cost-runs/` directory.

| Project set   | Baseline median (ms) | Final median (ms) |  Delta | Files / tests | Wall-time verdict     |
| ------------- | -------------------: | ----------------: | -----: | ------------- | --------------------- |
| `unit`        |               12,837 |            12,869 | +0.25% | 735 / 11336   | within 10% noise band |
| `integration` |               87,879 |            84,356 | -4.01% | 173 / 1806    | within 10% noise band |
| `lane`        |               95,021 |            87,814 | -7.58% | 908 / 13142   | within 10% noise band |
| `e2e`         |              234,140 |           230,701 | -1.47% | 62 / 619      | within 10% noise band |

Summed-file-time comparisons remain separate from wall time. A movement inside the configured noise band has
unestablished improvement/regression; a lower median does not establish a causal performance change. A3's required
public CI and all six `ci-job` reports remain due at the exact authorized published head before integration,
owned by andrew. These local rows neither supply that public evidence nor authorize publication or integration.

The selected scoped fresh follow-up completed at `0fdc05843b64293b2b38f08507fd3640ca7f874e`, after the four
approved corrective commits and final local evidence. It reported no findings in the complete fourteen-path
corrective code delta and examined affected seams. The primary checked all 76 supplied input/source hashes and
the two whole-suite base restorations. Its source-bound in-memory checks exercise mocked execa, with the expected
identity refusal preserved as an exit1; they supply no full-suite, live-terminal, public-CI or test-cost credit.
The bounded result supplies no fresh whole-WU absence verdict, all-35 fresh coverage or standard-review credit.

## Final implementation verification

The effective primary walk at `0fdc05843b64293b2b38f08507fd3640ca7f874e` resolves all 35 immutable criteria:
33 met and two intentionally superseded by A3. The earlier complete walk's unchanged witnesses, approved
corrections, complete stated executor source account, final local evidence and the bounded fresh follow-up compose
this result. Pass 2 of 2 remains historically non-converged at cap exhaustion; its completed responses and this
scoped result do not rewrite that signal. Implementation verification supplies no code-review lane credit.

The ref retry test's subject is an arbitrary-ref, key-agnostic injected Git mechanism. Its only current production
importer is the physical notes sync-state writer; no surviving Errand caller is inferred from stale module prose.
Physical notes operations retain their carve. Generic ancestry is independently consumed by surviving delivery and
review composition. The status and orphan splits, two exact-base restorations and R-ID reader correction preserve
their separate public-contract and physical-acquisition boundaries.

The current final package identity and twelve local cost samples remain as recorded above. Final closeout changes
are documentation and Candidate projections, whose Markdown/ARC checks are recorded against their exact bytes.
Required public E2E, Linux portability, all required CI and six `ci-job` reports remain owned by andrew under A3;
the exact authorized publication is their forcing event before integration authorization. A3 and A4 are revalidated
by Task 8.1. The contract coverage plan remains reusable for later standard review after rebinding its exact target
and applying that review's complete rubric to every scope and seam.

Primary effective report: `/tmp/arc-wu-verification/criteria-report-primary-effective-final.json`.
Scoped findings and evidence: `/tmp/arc-wu-verification/scoped-followup/reports/`.

## Standard-review correction increment

The complete local standard-review pass at `ce3fc9c473075425b9c670f2f3962e95c55c655b` reported three canonical
findings: one major and two minor. Its whole-target result remains findings, with no convergence claim. The complete
source-verified disposition set was approved for correction with full verification; exactly one incremental
standard-review Pass 2 was separately authorized after correction, verification and its concrete commit gate.

- **AGGREGATE-F1 (major):** Seven new path constructors in six files preserve native root spelling with `node:path`
  joins over resolver-owned suffixes. The shared materializer contract remains the landed contract. Ten new
  behavior cases cover decomposed native roots, absent/present marker and inbox behavior,
  actual extension discovery, Markdown authority classification and both local method-directory consumers.
- **AGGREGATE-F2 (minor):** Canonical digest result annotations retain `CanonicalDigest`: Candidate applicability,
  effective-target recognition/projection and the hosted request fingerprint. Runtime preimages and serialization
  remain unchanged; both complete TypeScript programs validate the branded flow.
- **AGGREGATE-F3 (minor):** The shared raw failure fixture accepts `string | Uint8Array` stderr. Its regression test
  checks missing-ref classification and lossless Latin-1 diagnostics, including NUL and high bytes. Test types first
  rejected the byte input; a narrowly reconstructed fixture boundary discarded bytes and failed the behavior
  assertion, then the exact original runtime implementation was restored before widening the input type.

All native-root regression cases failed against the preceding implementation before passing with the correction.
The whole source/test type gate, TypeScript lint, shell lint, declaration build and routine lane passed against the
corrected package. The routine run reports 907 passed files, one skipped file, 13,153 passed tests and two skipped tests.

The current matrix adds two `method-root` scanner false positives at `method-files.ts:19,33`: each joins an already
resolved procedure address rather than spelling its suffix. The current 15-class reconciliation covers 18,407 hits
in 2,223 corpus files with no unmatched hits, overlaps, unused rules or count mismatches. New literal expectations
remain independent test evidence. The historical state-path recount above is superseded for current offsets by
`markdown/authority.ts:91,99,167` and the work-unit resolver calls at `view-artifact.ts:168,214`; their owners and
counts are unchanged.

The fresh executor inventory contains 2,808 bindings, 1,377 mock setups, 158 shared script calls and 450 helper edges.
The single new binding/script is the byte-stderr regression's shared raw fixture. All preceding inventory text
identities remain present; 978 of the original 1,042 callable bodies are conserved, and all 64 previously accounted
changed bodies retain identical file bytes and their explicit completed fates. This source account supplies no fresh
independent review conclusion.

Producing records and fresh source projections are under `/tmp/arc-wu-preparation/ce3fc9c47/fix-evidence/`.
The original test-cost baselines and historical final-input samples remain preserved. Corrected-input cost
comparisons are recorded below; final Markdown/ARC gates cover these appended evidence bytes. A3's
required exact-head public CI, portability and six `ci-job` reports remain due before integration.

The layout negative control removes the same three recorded rules and exposes exactly their 5, 1 and 133 assigned
identities: six unmatched code hits and 133 unmatched non-code hits, with zero missing or unexpected identities.
The first invocation supplied an unrecognized removal ID and ran no control; the corrected invocation and explicit
differential comparison produce this result. The fresh neutral inventory resolves every current node and preserves
all preceding text/digest identities; its sole added binding/script is the approved byte-stderr test.

The exact approved disposition set is
`sha256:32b989005a928a08aa53ea7dd1f3933a0dea0cfe1209c2073742135c856e22fa`, bound to local operation
`local-1f72f8f5c34748f380da82dcda826dfd180248b20d856303d771b531a381e97f` and its actual aggregate evidence.
Its runtime response authorizes only AGGREGATE-F1–F3 with full verification. The corrections are applied; durable
changed-target response completion follows their approved commit rather than being inferred from this record.

### Corrected standard-review input cost comparison

All twelve serial final samples passed over the same 2,188 tracked package inputs:
`sha256:315689f78ab7f3d148125f7ce3f29981b0a9b950f73e4f20bff839b264346020`.
The identity matched before every sample and after the complete series. Each three-sample median retains the original
baseline and matching `tier-isolated` condition, project set and 12-worker sizing. The new reports are
`cli-substrate-standard-fixes-{set}-{1,2,3}.json` and `cli-substrate-standard-fixes-comparison-{set}.json` in the
package's ignored `.test-cost-runs/` directory; the original baselines and all historical final reports remain intact.

| Project set   | Baseline median (ms) | Corrected median (ms) |  Delta | Files / tests | Wall-time verdict     |
| ------------- | -------------------: | --------------------: | -----: | ------------- | --------------------- |
| `unit`        |               12,837 |                12,929 | +0.72% | 735 / 11346   | within 10% noise band |
| `integration` |               87,879 |                86,299 | -1.80% | 173 / 1807    | within 10% noise band |
| `lane`        |               95,021 |                90,515 | -4.74% | 908 / 13153   | within 10% noise band |
| `e2e`         |              234,140 |               233,749 | -0.17% | 62 / 619      | within 10% noise band |

The comparisons establish no causal speedup or regression inside this noise band. Summed-file time and Git process
counts remain separate metrics in the producing reports. A3's public CI, E2E/portability enforcement and six `ci-job`
reports remain mandatory at the exact authorized published head before integration; these local samples do not
supply that public evidence. The source/test type, TypeScript lint, shell lint, build and routine results remain
valid over the unchanged package digest; the final document gates cover the appended correction record separately.
