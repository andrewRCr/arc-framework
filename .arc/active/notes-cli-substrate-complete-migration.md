# Notes: cli-substrate-complete-migration

Reference material for task generation and execution: how the inventory was taken, the state-path recount behind
the storage register's row, the `gitExec` singleton importers, and the review-projection tooling.

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

## Work-unit state-path recount

The coupling-audit class scan over the state classes — active, planned, provisional, and completed placement; the
meta, draft, spec, tasks, and notes prefixes; ROADMAP, SESSION-NOTES, and WORKING-MEMORY — found 610 code-surface
hits. 127 are import specifiers, 247 are comments, and 236 are code on 198 lines in 74 files. Each of the 198 lines
was sorted by owner; the storage register's state-path row carries the surviving share.

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

**CLI-reachable** — 13, each threading the invocation's executor:

- `src/commands/active/status.ts` — fallback only (`options.exec ?? gitExec`)
- `src/commands/config/status.ts` — fallback only (`options.exec ?? gitExec`)
- `src/handlers/init.ts`
- `src/handlers/join.ts`
- `src/handlers/locus.ts`
- `src/handlers/log.ts`
- `src/handlers/release/commit-cli.ts`
- `src/handlers/release/record.ts`
- `src/handlers/release/setup/verify.ts` — fallback only, when no invocation context is bound
- `src/handlers/review.ts`
- `src/handlers/shared.ts`
- `src/handlers/view.ts`
- `src/lib/recover/committed-progress.ts`

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

## Review projection

`scripts/review-projection.sh` projects a single-branch work unit's review chunks as stacked draft pull requests
(`build`, `publish`, and `close` over a chunk file), and
`.arc/reference/strategies/project/strategy-review-projection.md` is its runbook. The chunk file assigns every changed
path to exactly one chunk, and chunks stack in file order, so chunk boundaries follow files in dependency order. The
top projection commit's tree equals the work-unit head outside `.arc/active/`, which is never projected.
