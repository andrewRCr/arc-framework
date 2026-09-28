# Draft: cli-substrate-complete-migration

- **Origin:** [internal]
- **Cohort:** `cli-substrate-adoption`
- **Purpose:** Close the typed-substrate adoption cohort. Move every first-party consumer that survives the storage
  cutover onto the six landed contracts, retire the transitional shims and compatibility paths those members left,
  and converge test support on shared doubles and fixtures. The unit lands in the storage program's pre-seam window.

---

## Problem / Motivation

The six contract-owning members shipped between 2026-07-19 and 2026-07-25, each deliberately bounded so it could land
independently. They left the repository-wide conversion to this tail: old-path re-export shims, handwritten types
behind thin routing schemas, hand-built layout paths, commands outside the command-input regime, and test code that
re-implements the substrate locally.

The residue is not static. About 1,800 commits have touched `src/` since the cohort closed on 2026-07-25, and the
transitional paths keep attracting new code: 92 of the 127 files importing the canonical-JSON shim were created after
the cohort shipped. Leaving the old paths in place means every new module picks one of two ownership vocabularies.

Two program constraints now shape the unit. The storage program (ADR-035) moves operational and planning state
into repository refs. It first routes every reader and writer of that state through a storage contract, and after
cutover deletes the code that exists only because state lives in tracked files or Git notes. Migrating code the
program rewrites or deletes would be wasted. The program also sequences this unit before `storage-seam` starts; the
unit touches too much of the tree to run beside it.

"Complete" means complete adoption of the contracts this cohort introduced, over the code that survives the storage
cutover. It is not a mandate to convert every type, validator, or fallible API to Zod or Result without a boundary
need.

## Goals

- Re-derive the residual inventory against the current tree, by owning contract, excluding code the storage
  program deletes or rewrites.
- Move every surviving first-party consumer onto the landed kernel, validation-surface, session-envelope, layout,
  Git-executor, and command-input contracts.
- Retire the transitional shims, old-path re-exports, compatibility paths, and migration bookkeeping the members
  left, together with the tests that exist only to pin them.
- Converge test support on one scripted `GitExec` fake with typed failures, a meta fixture builder, and a
  schema-assertion helper, replacing the local re-implementations in surviving tests.
- Close with a reconciled residual matrix that also carries the per-class layout residuals. Every finding is
  migrated, owned by a named owner outside the cohort, or carved to the storage program through a row of its
  storage-coupling register. None survives as an unnamed follow-up.

## Non-Goals

- New substrate contracts, or redesign of semantics the members settled. A completion that a landed contract's own
  rule authorizes is in scope (§ Contract completions); an extension is not.
- Converting a type, validator, Promise API, or discriminant to Zod or Result only to maximize their use.
- Code the storage program deletes or rewrites (§ Storage carve-out), except where an edge forces a touch.
- Git-executor capabilities for the ref backend: typed compare-and-swap outcomes, atomic pushes, batch or long-lived
  processes, and signals on the stdin variants. `storage-ref-backend`'s draft holds them.
- Changes to the layout resolver's work-unit tokens. They stay as they are: the storage contract's in-repo backend
  and the projection build on them.
- The CLI output contract — machine-readable failures and a declared output mode. Captured in
  `USER-INBOX § Work Unit`.
- Pre-public-release compatibility readers outside the six contracts: worktree-marker stamps, installed hook lines,
  the notes config key, and the integration-boundary legacy readers. Captured in `USER-INBOX § Errand`.
- Managed operational-state documents; `operational-state-docs` owns that conversion.
- Real-Git test plumbing: repositories arranged through local `git()` runners, and `GitExec` doubles that run real
  Git through `execFile`. They drive real Git and double no contract.
- Changes to storage layout, lifecycle policy, command behavior, wire formats, or canonical bytes beyond what the
  mechanical adoption requires.

## Design Decisions

### Source of truth and sequencing

- All six members have landed, so the audit runs against their shipped contracts. The current tree is the inventory
  source of truth; the members' own residual lists seed the search but do not define completion.
- Sizes below come from a regex-based inventory at `7ddab4979` (2026-09-28). They size the work; they are not
  completion evidence. Re-run the inventory before implementation and again at verification.
- The residual matrix records, per finding: owning contract, old path or helper, destination, disposition
  (migrated, external owner, or carved with its register row), and verification evidence. It lives as tables in the
  unit's `notes-cli-substrate-complete-migration.md`.

### Boundary: one work unit

`assess-boundary-fit` outcome: **stays one WU**. Every surviving residual maps to one of the six landed contracts. The
open decisions were a bounded set of completions composed from existing patterns. Test-double convergence is test
support for the executor and validation contracts, and its design is the extraction of a fake already written about
110 times with drifting details.

The contract domains could land separately in principle. The storage program lands everything single-branch until
it completes, so they become segments and review chunks rather than a delivery plan (§ Delivery and Verification).

### Storage carve-out

The `state-storage` cohort charters `storage-seam` with "every ARC reader and writer of operational and planning state
routed through the contract", with the in-repo layout as the contract's first implementation (`storage-contract`; the
storage analysis's phase 3, § 10.1). The analysis's § 10.4 names the code the program deletes after cutover and the
code the seam rewrites. Both classes are carved here, because migrating either would be discarded. The cohort's
storage-coupling register, on `main` since `1ec6f918f`, is the authority for each carved item's owner and fate.

**Removed at cutover** — owner: `storage-cutover`. The five categories, with their anchor modules:

- **Notes-specific sync:** the notes machinery in `lib/user-sync/`, the `commands/user/` push, fetch, compaction,
  drift, and sync-status family, `handlers/user-sync.ts`, `handlers/push-recovery.ts`, and the notes portions of
  `commands/user/save-load.ts`, `handlers/user.ts`, `handlers/sync.ts`, and `lib/io-context.ts`. `lib/user-sync/` is a
  mixed module: surviving code imports its Git failure-text predicates (`isCasRejectionError`,
  `isRemoteUnavailableError`, `isNonFastForwardError`, used by errand refs), its cross-WU entry parser (inbox state
  and reminders), and `resolveCurrentWuName`. Those symbols survive. The three predicates move to
  `lib/git/ref-tree.ts`, the state-ref plumbing the errand refs already use, so the deletion pass cannot strand them.
- **Branch-tree readers:** `lib/status/project-view-ref.ts`, `git-retirement-authorization-context.ts`,
  `git-transition-record-enumeration.ts`, the history read of `.arc/completed/` in `lib/base-drift/current-adapters.ts`,
  and the ref-reading portions of `in-flight-derivation.ts`, `remote-ref-reader.ts`, `completed-index.ts` (`*FromRef`),
  and the base-archive reads in the session-init sweeps. `completed-index.ts` keeps `branchToWorkUnitSlug`, and
  `remote-ref-reader.ts` keeps `DEFAULT_NETWORK_TIMEOUT_MS` and `readLiveRemoteBranchTip`.
- **Lifecycle classification and exclusion:** `evidence-applicability/path-treatment.ts`,
  `delivery/lifecycle-contribution.ts` with its Git variant, and the evidence-neutral and regenerable arms that
  consume them.
- **Lifecycle hook checks:** the pre-commit lifecycle checks and their scripts — `validate-meta-spec`,
  `validate-cohort-consistency`, `assert-roadmap-regenerated`, `check-foreign-writes`, `remedy-roadmap-conflict` — and
  the pre-commit hook's own state-path checks, with the `hooks.contributor_protected_paths` default.
- **CI planning classifier:** `isPlanningArtifactPath` and `classifyPlanningLane` in `change-facts.ts`, the
  `lane-paths` logic in `classify-change.sh`, the lane-attestation workflow, the planning-grooming command, and
  `arc review planning-lane`. The rest of `change-facts.ts` survives (§ Executor groundwork for the ref backend).

The analysis also lists "later, delivery's projection layer" as deleted. That deletion belongs to the
`delivery-observe-attest` follow-on, not the cutover, so delivery code stays in scope here.

**Rewritten** — owner: `storage-seam`, which decomposes against `storage-contract`'s consumer map. The items this
unit's surface reaches:

- **In-flight derivation,** which becomes a store read — including the in-flight oracle behind the
  `WorkUnitStateResult` and `ErrandStateResult` session-init slots.
- **The lifecycle executor's write path and `arc start` placement,** including the lifecycle verbs, errand promotion,
  and the `provisional-placement` callers.
- **The archive index** (`completed-index.ts`) and **lifecycle placement readers** (`lifecycle-index.ts`, the
  project view's placement scan).
- **ROADMAP rendering.**
- **The notes-related session-init probes,** including the `UserSessionInitStatusResult` slot and user-reference
  reconciliation (`user-reference-reconcile.ts`), which rewrites `WU_Target` fields in the identity-global inbox —
  a surface that moves into the store — from carved transition-record and remote-ref readers.
- **Locus derivation** (`DerivedLocusFrame`): the storage contract settles locus from marker plus store.
- **The current-WU reconcile slot** (`currentWuReconcile`), which reads the lifecycle index over tracked placement
  and enumerates transition records from the checked-out tree through a carved branch-tree reader.
- **The stale-worktree sweep** (`StaleWorktreeSweepResult`). Its shipped set comes from the archive index's ref
  readers, its retirements and husk evidence from the retirement-authorization context, and its branched selection
  from locus classification. Its cleanup decisions survive, but the result is built from carved producers.
- **Work-unit state-path access in surviving code.** Callers stop building state paths once they read and write
  through the contract. Caller-side construction and recognition of metas, specs, tasks, drafts, notes files,
  placement directories, `completed/`, ROADMAP, and the user notes files — by hand or through the resolver's
  work-unit tokens — are carved. So are the state-record families under `.arc/system/.internal/` — Candidate
  records, their submission boundaries, and transition records — which the register's Candidate and transition row
  moves to the store. The resolver itself is not: "in-repo layout as first implementation" makes it the
  contract's first backend path resolution, and the projection lays files out at the same `.arc/` paths. The
  cohort's one-layout-authority claim carries through that register row.
- **Any hook-check content rule** the program moves into a record-family parser rather than deleting.

The full-schema obligation `cli-session-envelope` routed to this tail passes to `storage-seam` for every rebuilt
slot: `WorkUnitStateResult`, `ErrandStateResult`, `UserSessionInitStatusResult`, `userReferenceReconcile`,
`DerivedLocusFrame`, `currentWuReconcile`, and `StaleWorktreeSweepResult`. This unit does not author them.

Rules:

- **Carve by symbol range, not by file,** wherever a module mixes carved and surviving code. `change-facts.ts` is the
  sharpest case: its planning-lane classifier is carved, while its CI weight classifier, tree hash, portability
  paths, and raw executor survive. Every mixed module is named in the residual matrix.
- **Type edges:** a surviving result that carries data produced by carved code gets its full schema, with that data
  at its plain shape (for example, `OverlapEvidence.regenerablePaths: string[]`). Carved code a surviving module
  takes only as an input — `PathTreatmentClassifier` as a dependency, `RemoteHeadSnapshotResult` on an options
  interface — never enters a schema. Every schema form stays representable in JSON Schema: no `z.custom` inside a
  registered closure. Registry rows for carved items stay as they are.
- **Forced edges are done, minimally:** retiring a shim or a `src/` compatibility path rewrites the import line it
  breaks in a carved file, and nothing more.
- **Tests follow their subject:** tests of carved code are not converted beyond forced edges.
- **Register:** every carved item traces to a register row. The residual matrix and the closeout exclusion cite rows
  rather than restating them. Corrections to a row go to the register's owner; this branch does not edit the
  cohort document or the register.
- **Branch base:** this branch was cut before the cohort landed, so until it merges base it reads the cohort and the
  register from `main`. The `storage-seam` row for work-unit state-path access is pending on `main`; the layout
  dispositions cite it once it lands.
- **Closeout amendment:** the cohort's closeout criterion ("no cohort-scoped first-party importer, transitional shim,
  or parallel reusable test helper remains") gains an explicit exclusion for code carved to the storage program,
  citing the register rows as the authority for each item's owner and fate. The `cohort-cli-substrate-adoption.md`
  edit lands with the spec.

### Contract completions

A completion is in scope when a landed contract's own rule authorizes it; anything else is an extension and routes
out.

- **`CanonicalDigestSchema` in the kernel's schema vocabulary.** The kernel's proven-sharing gate admits a shared
  value once it has two or more real consumers. The `sha256:` digest pattern is re-created at about 55 sites in 39
  files, three of them as local `z.custom<CanonicalDigest>(isCanonicalDigest)` copies, and the kernel keeps its own
  pattern private.
    - **Form:** `z.templateLiteral(["sha256:", z.string().regex(/^[0-9a-f]{64}$/u)])`. It infers exactly the kernel's
      `CanonicalDigest` type and projects to the same `{ type: "string", pattern: "^sha256:[0-9a-f]{64}$" }` the inline
      regexes emit today. `z.custom` is ruled out: most adopting sites sit inside registered schemas, and
      `z.toJSONSchema` throws on a custom type, which would break the `dist/schemas/kernel.json` build and the
      review handler's runtime projection. The three local copies move to it too.
    - **Home:** `kernel/schema/vocabulary.ts`, beside the other shared schemas. The canonical core stays
      dependency-minimal.
    - **Unregistered,** so the published bundle keeps its inline patterns rather than gaining a new `$ref` target.
    - **Adoption:** a site adopts it when its value is a kernel canonical digest. The composite `checkpoint-v1:`
      handle patterns (5 sites) and review-gate's frozen version-1 identities keep their domain owners, each with a
      matrix row: the kernel's rule that shared use does not override a fenced-off semantic owner applies.
- **A contract home for `RawGitExec` in the executor module.** About 25 files use it, and the executor contract never
  declares it. It lives in `change-facts.ts`, which then imports it type-only (§ Executor groundwork for the ref
  backend).
- **Checkpoint validation against the full `BaseDriftResult` schema.** The integration checkpoint's emitted result
  wraps the drift as `z.custom<BaseDriftResult>()` (`scripts/integration/checkpoint.ts`), and
  `handlers/integration.ts` parses that result before writing it. Once the full schema exists the drift validates
  there, with no shape change. A mismatch is a producer defect and fails through that command's existing operation
  refusal.
- **Old-path re-exports are transitional.** That covers those kept by validation surfaces at their established import
  paths, and the `ArcError` re-export in `lib/errors.ts` kept for minimal churn. The pre-public-release posture
  forbids compatibility aliases.

Not completions, so they stay out: a layout basename projection and an identity-user-root layout token, which would
serve only carved work-unit state paths; new artifact kinds; and the ref-backend executor capabilities.

The executor's non-execa fallbacks also stay: `normalizeGitRejection` reads a numeric `code` as the exit code and an
`AbortError` name as cancellation, and `gitFailureText` falls back to `message`. They are not transitional readers.
They normalize Node child-process rejections, which the real-Git test doubles this unit keeps produce — Node's
`execFile` rejects with a numeric `code`, and with `AbortError` on a signal. Surviving code depends on that
normalization: `git-candidate-applicability.ts` answers `not-ancestor` only for a normalized exit code 1.

### Residual scope by contract

Sizes are approximate:

- **Kernel.**
    - Retire the shims for canonical JSON, managed path, and the work-unit slug, the `ArcError` re-export, and the
      vocabulary re-exports in `commands/active/types.ts`: about 183 import edits (127, 28, 9, 4, and 15 files) and 5
      shim-pinning tests. `lib/errors.ts` itself stays; only its re-export goes.
    - Replace the local `SlugSchema` copies (`scripts/integration/merge.ts`, `scripts/integration/checkpoint.ts`,
      `review-gate/readiness.ts`), and the re-minted state and placement-tier enums in
      `scripts/integration/checkpoint.ts` with the kernel's `WorkUnitStateSchema` and the layout's
      `ArcPlacementTierSchema`. The command-path pattern in `lib/command-input/registry.ts` matches the slug pattern
      but names a command, not a work unit, so it stays local.
    - Move each local digest pattern whose value is a kernel canonical digest onto `CanonicalDigestSchema`. The kernel
      segment settles the split of the 55 sites between adopters and fenced owners.
- **Validation surfaces.** Retire the old-path re-exports: 5 sites outside `lib/user-sync/` with 31 importers
  (`lib/release/types.ts`, `lib/active/meta-reader.ts`, `lib/config/status-reader.ts`, `lib/commit-check/config.ts`,
  and `commands/config/types.ts` with its relay in `commands/config.ts`), plus the cross-WU entry re-exports in
  `lib/user-sync/index.ts`, whose surviving importers (inbox state and reminders) move to `lib/user-sync/schema.ts`.
  The sync-state re-exports are notes sync and carved, and the names `user-sync/types.ts` re-exports have no
  importers.
- **Session envelope.**
    - Move 9 of the 13 routed types to full schemas; the routing table's 14 rows count the `BaseDistanceStatusResult`
      alias separately. `BaseDriftResult` reaches about 13 nested types. Its weight is its reach, through the four
      `z.custom<BaseDriftResult>()` wraps in `scripts/integration/checkpoint.ts` (§ Contract completions).
    - Give `ReleaseRoutingValue` a full schema; its thin view leaves `rationale` unvalidated.
    - Compose the session-init config view from the config catalog's leaf schemas for its ten catalog keys, without
      the catalog's empty-string arm, and from the release module's interlock enums for `commit.interlock` and
      `push.interlock`, which are Git-config keys outside the catalog.
- **Layout.**
    - Move framework-path construction onto the resolver where a token covers it: the `.arc` root, procedure roots,
      `.arc/system` descendants, and template outputs. Under `.arc/system/.internal/` that means the framework
      bookkeeping — manifest, pristine store, hook and script paths, and the worktree marker; its state-record
      families are carved. Framework-class hits in surviving `src/` modules come to about 140 lines in about 40
      files, most of them install and file-classification code that may take a disposition kind instead.
    - Dispose every code-surface hit of the carved state classes to its register row (§ Layout migration ledger).
    - Retire the layout migration ledger.
- **Git executor.**
    - Move the `.message` classification in errand identity code to `gitFailureText()`.
    - Give `RawGitExec` its contract home.
    - Resolve the duplicate `createRawGitExec` name by renaming the `spawn` factory in `change-facts.ts` to
      `createSpawnRawGitExec`, the alias `object-availability.test.ts` already gives it. It stays exported: four
      integration tests import it, one of them to test the adapter itself. The execa-backed adapter in
      `lib/io-context.ts` keeps the name.
    - Move the three Git failure-text predicates out of `lib/user-sync/` into `lib/git/ref-tree.ts` (§ Storage
      carve-out).
- **Command inputs.**
    - Wrap 17 always-JSON adapters (merge lock ×3, review ×14) with `machineReadable: () => true`. `review
      planning-lane` prints text and is carved.
    - Add the 3 missing machine-mode declarations: the `attest` and `publish` policy declarations, and both the wrap
      and the declaration for `locus`, whose handler body is carved locus derivation.
    - Wrap 4 value-bearing human-output commands: `user close`, `config validate`, `release setup print-patterns`, and
      `log`.
    - Thread subprocess policy wherever a context-bearing command reaches Git through an unbound executor. The shared
      helpers in `handlers/shared.ts` (`resolveUserIdentity`, `resolveIdentityWithPrompt`, `requireGitRepo`) default
      to the unbound `gitExec` singleton, so they take a required executor and their surviving callers thread one:
      errand, lifecycle, start, release push and commit, active, and the surviving user commands. The 13
      CLI-reachable importers of the singleton thread theirs (three hold it only as a fallback that bound callers
      override), as do `config status`, whose adapter discards its context, and the module-level executor in
      `release commit`. The second unbound singleton, `gitExecInput`, has one context-bearing use: the `active
      in-flight` adapter, which already binds its `GitExec`, binds its `GitExecInput` the same way, and the in-flight
      body it calls stays carved. `createUserIOContext` keeps it as a fallback that bound callers override. The
      `gitExec` singleton stays for the standalone scripts, which have no invocation context: 10 today, 9 once the
      ledger assertion retires.
- **Test support.** 172 test files type a `GitExec` value: about 110 script responses by argument or in sequence,
  about 33 run real Git, and about 27 are constant or pass-through stubs. About 100 hand-write meta blocks, and 61
  carry inline schema assertions. All counts are before the carve removes tests of carved code. See § Test-support
  convergence.

Session envelope detail. The surviving types are `DirtyStateResult`, `BaseDriftResult` (with its
`BaseDistanceStatusResult` alias), `WorktreeSyncStatusResult`, `WorktreeRosterResult`, `ExtensionsSessionInitResult`,
`ConfigSessionInitResult`, `ActiveSessionInitResult`, `DomainRulesSessionInitResult`, and `CurrentHuskAdvisory`.

- `WorktreeSyncStatusResult` compares local `HEAD` with `origin/<branch>`. It is branch plumbing, not notes sync.
- `WorktreeRosterResult` is built from metas read out of each worktree's tracked placement. That read moves behind
  the contract; the emitted shape does not, so the type gets its full schema under the type-edge rule.
- The four rewritten types are `WorkUnitStateResult` and `ErrandStateResult` (in-flight derivation),
  `UserSessionInitStatusResult` (the notes-related probes), and `StaleWorktreeSweepResult`. The post-cohort thin
  slots — `DerivedLocusFrame`, `currentWuReconcile`, and `userReferenceReconcile` — are rewritten as well, so all
  three keep their thin views (§ Storage carve-out).

That split is recorded here rather than by editing the archived `notes-cli-session-envelope.md`.

The layout contract also routed two items here:

- the `provisional-placement` callers, all of which sit in carved code: the lifecycle write path, the placement
  readers, a hook check, and a branch-tree reader (§ Storage carve-out);
- the draft-retirement residual in `activate-work-unit.md` and `strategy-work-planning.md`, which belongs to
  `composable-workflows`. Its draft already carries the item, drained there on 2026-07-21.

### Test-support convergence

- **Placement.** One module per contract under `__tests__/helpers/`, matching the existing per-concern modules;
  nothing is appended to `integration.ts`.
- **Scripted `GitExec` fake.** Extracted from the local copies, it holds:
    - a response table keyed on Git arguments, with explicit per-entry matching (exact by default, prefix by opt-in);
    - per-entry response sequences, consumed in call order, for doubles that fail a set number of times and then
      succeed;
    - a call recorder;
    - failures as typed `GitProcessError` values built by a shared fixture;
    - a throw on any unmatched call;
    - variants for `GitExecInput` and `RawGitExec`.

  `stubGitExec`, a constant stub with one consumer, moves into `active.test.ts` as a local stub.
- **Which doubles convert.** A local double converts when it scripts responses by argument or in sequence: about
  110 files, before the carve. Constant one-response stubs stay local; a one-line function reads more clearly than a
  response table and has nothing to drift. Doubles that run real Git stay local with the `git()` runners
  (§ Non-Goals), and so do hybrids that wrap a real executor and inject faults by argument. Handler tests that
  `vi.mock` the IO context keep the mock, and the Git doubles inside it follow the same rule.
- **Rejection shapes.** Scripted doubles that reject with hand-built `Object.assign(new Error(...), {...})` shapes
  (about 51 files) convert to the `GitProcessError` fixture, so those tests exercise the typed failure the production
  executor emits rather than the fallback normalization.
- **Raw test executors.** The shared `makeGitExecInput` helper (raw `spawn`, untyped rejections) moves onto
  `createExecaGitExecInput`, beside `makeGitExec`, which already uses the execa adapter. `base-advance.ts` keeps its
  raw `git()` runner: it is an arrangement runner, and the module avoids runtime imports from `src/` so the spawned
  test lane can reach it.
- **Meta fixtures.** A meta fixture builder over `renderMetaFile` serves fixture setup. Tests about meta parsing or
  layout keep literal Markdown as independent evidence.
- **Schema assertions.** A helper that reports issues on failure replaces inline `safeParse(...).success` assertions
  in surviving tests. Registered-schema fixtures (configuration, audit entries) validate through their schemas.
- **Unchanged:**
    - `.arc` path literals in tests, which the layout contract classifies as independent evidence;
    - local `git()` arrangement runners, real-Git `GitExec` doubles, and fault-injecting hybrids over them;
    - constant one-response `GitExec` stubs;
    - the e2e canonicalizers, which are deliberately independent of CLI internals;
    - Result assertions, which have nothing to converge.

### Compatibility posture

- First-party source and tests move fully to the new owner; internal old-path imports are not preserved.
- Delete a transitional re-export once searches of static and dynamic imports, `vi.mock` specifiers, fixtures, and
  generated outputs show no consumer.
- There is no public import surface to protect. The package ships only the `arc` binary: `package.json` has no
  `exports` or `main`, and the only published contract beyond the binary is the schema IDs in
  `dist/schemas/kernel.json`.
- Replacing a thin routing view with a full schema changes that schema's published JSON Schema under an unchanged
  ID. The emitted data does not change, and the session envelope carries no version to bump. Verification
  regenerates the bundle and diffs it.
- Preserve wire shapes, canonical bytes, error kinds, and observable behavior the members established.

### Layout migration ledger

`layout-migration-ledger.json` is the layout member's migration receipt: a digest-bound disposition for every hit of
the 15 layout classes, checked from the index by `npm run audit:layout-migration`. It is transitional bookkeeping,
and it no longer holds:

- the assertion fails on a stale manifest digest before it counts a single hit;
- no generator is tracked, and the two refresh commits changed only the JSON;
- its evidence digests are bound to line positions, so it goes stale at the next commit that moves a line — 18,373
  hits now against 10,278 certified;
- it was never wired into CI, and nothing else gates it.

Re-issuing it would mean rebuilding a generator and re-judging thousands of rows for a receipt that goes stale at
once. This unit retires it instead: the ledger, its schema module (`lib/coupling-audit/layout-migration-ledger.ts`),
`assert-layout-migration.ts`, the `audit:layout-migration` script, their tests, the script's entry in
`one-shot-script-entrypoints.test.ts`, and the manifest exclusion.

What the ledger proved still needs proving: that no hand-built layout the resolver covers survives unexplained. The
layout contract's seven disposition kinds stay as the residual rule, applied without evidence digests —
`layout-definition`, `root-only-owner`, `pre-resolved-path`, `semantic-policy-owner`, `scanner-false-positive`,
`independent-evidence`, and `external-owner`. The ledger module is their only code home, so afterward they live in
the layout spec and the residual matrix's vocabulary. The coupling-audit class scan enumerates the hits by surface
kind at the layout segment and again at verification:

- **Non-code surfaces** (test, prose, workflow, config, template) are disposed by class-level predicates over surface
  kind and path, as the ledger's bulk entries were. Test literals, for example, are `independent-evidence`.
- **Code-surface hits** (about 1,100 in about 200 files) are disposed per file and class, each with a kind and an
  owner. Hits in carved modules, and every hit of a carved work-unit state class in a surviving module, are
  `external-owner` hits pointing at their register row. That residual stays complete and file-exact: the closeout
  exclusion rests on it, and it is the evidence behind the `storage-seam` row for work-unit state-path access.
- **A framework-class code hit that fits no kind** is missed construction, and it migrates.

The residual matrix holds these dispositions, keyed by file and class: each row carries a kind and an owner, and a
carved row cites its register row. Code-surface reconciliation is mechanical and runs both ways over the scan result
`npm run audit:coupling` emits, filtered to the 15 layout classes: every hit has a row, and every row still has a
hit. The comparison is a one-off script whose command the notes record; it runs at the layout segment, after each
base merge, and at verification. A tracked gate would rebuild the ledger this unit retires. Non-code surfaces
reconcile by predicate.

### Executor groundwork for the ref backend

The raw-Git migration is essentially done. About 700 invocations across about 170 files run through `GitExec`, and
the review-gate runtime has no raw Git left. Two raw production sites remain:

- the lifecycle hook scripts, which are carved;
- the standalone CI entry point in `change-facts.ts` (light/heavy classification, tree hash, portability paths).
  `classify-change.sh` runs that `.ts` file directly with `node`, so the module can import only Node built-ins and
  types. Its `spawn` executor stays raw by that constraint, with a matrix row.

This unit's share of the ref-backend groundwork is:

- the `RawGitExec` contract home;
- reading failures through `gitFailureText()` as the executor contract prescribes;
- the Git failure-text predicates moved out of the notes modules to the state-ref plumbing, where the ref backend's
  typed rejection taxonomy can replace them;
- test support that emits typed failures, so new ref-backend tests start from one fake.

The capabilities themselves belong to `storage-ref-backend` (§ Non-Goals).

## Delivery and Verification

- **Landing.** Single branch, no stacked delivery, through the `archive.cadence: manual` bridge:
    1. merge base first;
    2. integrate with the meta `Integrating` under `.arc/active/` and its Completion Notes composed;
    3. archive in a separate Errand PR after the merge;
    4. tear down only after that PR merges.
- **Window.** Land before `storage-seam` starts; never run alongside it. Errands the `state-storage` cohort pulls
  forward may land meanwhile; the re-runnable sweeps absorb any that land after a sweep ran.
- **Segments.**
    - An opening `layer` segment settles the contract completions and the shared test support: the digest schema,
      the `RawGitExec` home, the `GitExec` fake and `GitProcessError` fixture, the meta builder, and the
      schema-assertion helper.
    - `replication` segments follow per contract domain: kernel shims; validation surfaces and session-envelope types;
      layout framework paths and the state-class dispositions, with the ledger retirement; command inputs with the
      Git residual; test-support conversion.
    - Each replication segment closes when its enumerated surface is exhausted and batch-verified.
    - `generate-tasks` owns the order. The widest and least re-runnable work (the kernel shim sweep and test
      conversion) runs late.
- **Review.** Chunked local review: each segment seeds one contract-cohesive chunk, split further when a chunk is
  attention-heavy, plus a seam scope across them. Chunk boundaries follow files and dependency order. One pull
  request.
- **Review projections.** This unit is the first consumer of the optional projection the `state-storage` cohort's
  landing rule allows. The chunks form an ordered, cumulative sequence in segment order, and each projects as a
  stacked draft PR: branch _k_ carries the base plus the diff for chunks 1 to _k_, opens against branch _k_−1, and is
  rebuilt after fixes, so the top branch's tree equals the work-unit head. Landing stays single-branch through the
  one real PR, and the projection PRs close when it merges. Their reviews are attention rather than ARC evidence, so
  the real PR's standard review closes by the Owner-directed stop. The script and runbook come from the Errand
  `review-projection-bridge`; this unit does not hand-roll one, and without them chunked local review stands alone.
- **Base merges.** Wide edits on a long-lived branch conflict with every base merge. Keep each mechanical sweep
  re-runnable from a recorded search-and-rewrite recipe, merge base at segment boundaries, and re-run the sweeps
  after each merge.
- **Verification.**
    - Take every affected test-cost baseline, the `lane` row included, before the first new test file lands.
    - Run repository-wide searches for every retired symbol and path, covering static and dynamic imports, `vi.mock`
      specifiers, fixtures, and generated outputs.
    - Re-run the layout-class scan, reconcile the residual matrix against all six member scopes and the amended
      closeout criterion, and run the full Tier 3 gates.

**Success signal:** the shim modules and the layout migration ledger are deleted with the build and full gates green;
every code-surface hit the layout-class scan reports in a surviving module carries a disposition kind and owner in
the residual matrix; and the matrix has no row without a disposition and owner.

## Alternatives

- **Leave migration to opportunistic cleanup:** rejected. Transitional paths would have no owner or deadline, and
  new code keeps reaching for them.
- **Expand each contract member until the tree is clean:** rejected; it couples independent branches.
- **Keep old-path re-exports indefinitely:** rejected. It preserves two ownership vocabularies and conceals
  incomplete adoption.
- **Treat every pre-existing validator as cohort scope:** rejected; contract invention needs its own owner.
- **Decompose into one work unit per contract domain:** rejected. The domains share one design space. Separate
  landings would each pay the two-PR landing bridge inside a fixed window, and review chunks already carry the
  review burden.
- **Leave local test doubles in place, converging only reusable helpers:** rejected. The scripted doubles are about
  110 drifting copies of one pattern, the rejection-shape conversion needs a shared fixture either way, and new
  ref-backend tests start from a fake that already emits typed failures.
- **Convert every local double, constant stubs included:** rejected. A one-line stub has nothing to drift, and a
  response table would couple it to exact argument lists.
- **Build the ref-backend executor capabilities here:** rejected. Their shapes depend on storage-contract decisions
  still provisional, that work is next in line, and only one surviving consumer (errand identity refs) would use a
  typed compare-and-swap outcome now.
- **Migrate storage-deleted code too:** rejected; the work would be discarded at cutover.
- **Carve only the code the program deletes, migrating what it rewrites:** rejected. `storage-seam` rewrites
  in-flight derivation, the lifecycle write path, locus, and the notes probes right after this unit lands, so the
  migration would be discarded just the same.
- **Move caller-side work-unit state paths onto the resolver:** rejected. The seam moves those callers onto the
  contract, so each site would be touched twice. The resolver's work-unit tokens stay for the contract's in-repo
  backend and the projection, and a basename projection would serve only carved callers.
- **Give the stale-worktree sweep and the current-WU reconcile slot full schemas here:** rejected. Their results are
  built from carved producers, and `storage-seam` rebuilds both with their full schemas.
- **Re-issue the layout ledger at closeout:** rejected. It needs a rebuilt generator and thousands of rows
  re-judged, and the result goes stale at the next commit with nothing gating it.
- **Retire the executor's non-execa fallbacks:** rejected. The real-Git test doubles this unit keeps produce those
  shapes, so retiring them would mean moving about 33 of those doubles onto the production adapter for a three-line
  saving.
- **Keep the integration-boundary legacy readers here:** rejected. They were added after the cohort shipped and fit
  none of the six contracts; they go with their sibling pre-release readers to one Errand (§ Non-Goals).

## Risks

- **Grab-bag drift:** every finding must map to one of the six contracts or leave through the matrix.
- **Base-merge churn** on a long-lived branch; mitigated as above.
- **Window slip:** landing beside `storage-seam` is not an option. If task-generation sizing shows the unit
  cannot land in the window, raise it then, with the numbers.
- **Carve misclassification** in mixed modules either wastes work or strands a surviving residual, and a rewritten
  item filed as deleted lands with the wrong owner. The symbol-range rule applies, every mixed module is named in the
  matrix, and every carved item traces to a register row.
- **Missed consumers:** string paths, dynamic imports, and mocks escape ordinary import searches.
- **Reintroduction:** new post-baseline code can re-add old imports. Shim deletion turns those into compile errors;
  new local fakes remain possible and are accepted.
- **Test-cost budgets:** new shared helpers and converted tests move budget rows.

## Unknowns and Assumptions

- Counts come from static import specifiers, regex scans, and the coupling-audit class scan at `7ddab4979`.
- The `storage-seam` register row for work-unit state-path access is pending on `main`, as are the corrections sent to
  the register's owner: the two added rebuilt slots, surviving symbols and consumers of deleted modules, the
  planning-lane command, and the pre-commit hook's state-path checks. Dispositions cite the rows once they land.
- Callers stop building work-unit state paths at the seam; the `storage-seam` charter settles that. Whether they ask
  the contract for a document or for its fields is still open, and does not change the carve.
- Managed operational-document conversion stays with `operational-state-docs`.

## Scope Estimate

Large. Class `Heavy`: the scale trigger fires, with a substantial grounding surface across six contracts and several
hundred files. Derivation is bounded: composed completions plus one extracted test double. Not `Novel`.

## Review Evidence

**Adversarial review, pass 1 of 2 (2026-09-28).** Rubric: draft readiness (divergence), design proportionality, and
design audit, from a fresh context. Result: not converged — five `major` and six `minor` findings, all confirmed
against source; every disposition below was approved and applied.

- `major` — the session-envelope split carved two surviving types. Fixed: `WorktreeSyncStatusResult` and
  `StaleWorktreeSweepResult` moved to the surviving list.
- `major` — the carve named the deletion passes as owner of code the seam partitions rewrite. Fixed: the carve is
  split into deleted and rewritten classes with separate owners, recorded through the storage-coupling register, and
  the rewritten class takes the storage analysis's full list.
- `major` — `change-facts.ts` carried contradictory dispositions, and the duplicate `createRawGitExec` had no
  resolution. Fixed: only the planning-lane symbols are carved, the standalone executor stays raw by constraint, and
  its factory becomes module-private.
- `major` — no criterion said which local `GitExec` doubles convert. Fixed: scripted doubles convert, while constant
  stubs and real-Git doubles stay local.
- `major` — re-issuing the layout ledger was disproportionate. Fixed: the ledger and its assertion retire, and the
  class scan plus the residual matrix take their place.
- `minor` — the IO-context mock bullet had no mechanism. Fixed: bullet dropped; the mocks stay.
- `minor` — the `DerivedLocusFrame` rationale inverted the routing rule. Fixed: carved as rewritten locus derivation.
- `minor` — `CanonicalDigestSchema` left its type and fenced domains open. Fixed: `z.custom<CanonicalDigest>`, with
  composite handles and frozen review-gate identities left to their owners.
- `minor` — the `gitExec` singleton count mixed CLI handlers with standalone scripts. Fixed: 12 threaded, and the
  singleton stays for scripts.
- `minor` — the legacy-rejection arm was undefined. Fixed: the two compatibility fields are named and filed as a
  contract completion.
- `minor` — source-fact and path slips (enum locus, file paths, checkpoint wrap locus, `user-sync/types.ts`
  importers). Fixed in place; also settled the two layout routings and confirmed the `composable-workflows` capture.

**Adversarial review, pass 2 of 2 (2026-09-28).** Same rubric, fresh context, with the pass-1 findings as prior
findings. Result: not converged — three `major` and six `minor` findings, all confirmed against source; two of the
majors came from pass-1 fixes. Every disposition below was approved and applied.

- `major` — the `z.custom` digest form breaks JSON Schema projection of registered schemas, both the published bundle
  and the review handler's runtime projection. Fixed: the `z.templateLiteral` form in `kernel/schema/vocabulary.ts`,
  unregistered.
- `major` — retiring the executor's compatibility fields contradicted the real-Git doubles the draft keeps, which
  reject with a numeric `code`, and surviving code reads exit code 1 through that fallback. Fixed: the fallbacks stay
  as normalization of Node child-process rejections, and the rejection-shape conversion stands on its own terms.
- `major` — retiring the ledger removed the rule that proves layout adoption is complete. Fixed: the seven disposition
  kinds stay as the residual rule without evidence digests, by predicate for non-code surfaces and per file and class
  for code.
- `minor` — the type-edge rule named examples that never appear in emitted data. Fixed: restated.
- `minor` — the fake could not host every double the conversion rule selects. Fixed: per-entry response sequences,
  with fault-injecting hybrids left local.
- `minor` — `user-reference-reconcile` could be settled now. Fixed: carved as a rewritten notes-related probe.
- `minor` — `lib/user-sync/` is a mixed module. Fixed: carved by symbol range, with the three failure-text predicates
  moving to `lib/git/ref-tree.ts`.
- `minor` — the integration-locus legacy readers fit none of the six contracts. Fixed: moved to the pre-release
  readers' Errand capture.
- `minor` — the analysis's "delivery's projection layer" deletion went unaddressed. Fixed: named as a later
  follow-on, so delivery code stays in scope.

The same round adopted the storage program's review projections (Owner, 2026-09-28).

**Source trace after pass 2 (2026-09-28).** Every factual claim was re-derived at `7ddab4979`, and the
`state-storage` cohort's input was read from `main` at `1ec6f918f`. Approved changes:

- The carve extends, by Owner direction, to caller-side work-unit state-path access, the current-WU reconcile slot,
  and the stale-worktree sweep, all rewritten by `storage-seam`. The basename projection and the recognition routing
  drop, and the resolver's work-unit tokens stay as they are.
- Carve owners are named from the register (`storage-cutover`, `storage-seam`, `delivery-observe-attest`), and
  register corrections went to its owner.
- Subprocess-policy threading is restated around the shared helpers that default to the unbound singleton, which has
  13 CLI-reachable importers rather than 12.
- Corrected in place:
    - the commit and shim-age counts;
    - the envelope arithmetic (9 of 13 distinct types survive, and `BaseDriftResult` reaches about 13 nested types);
    - `ReleaseRoutingValue` added, and the duplicated worktree-roster item removed;
    - the config view's composition and the seventh re-export site;
    - `base-advance.ts` keeps its runner, and the stale `promote-runtime.ts` bypass is gone;
    - survivors of mixed modules, and `arc review planning-lane`;
    - the ledger's test edit and the disposition kinds' home;
    - landing step 2, and the published-schema note.

Passes 1–2 exhausted the `Heavy` cap without converging. A third pass ran over the cap by explicit Owner
authorization.

**Adversarial review, pass 3 of 2 (2026-09-28).** Same rubric, fresh context, with passes 1–2 and the source trace as
prior findings. Result: converged — seven `minor` findings and no `major`, all confirmed against source; every
disposition below was approved and applied.

- `minor` — the residual matrix had no home or reconciliation step. Fixed: tables in the notes companion keyed by file
  and class, reconciled both ways against the `audit:coupling` scan by a one-off comparison the notes record.
- `minor` — Candidate, submission-boundary, and transition records under `.arc/system/.internal/` fell under both the
  carve and the layout migration. Fixed: carved through the register's Candidate and transition row; the framework
  bookkeeping there migrates.
- `minor` — the config view composed ten catalog keys in one place and kept the notes keys thin in another. Fixed:
  all ten compose from the catalog.
- `minor` — the threading rule missed the `gitExecInput` singleton, and the script count ignored the ledger
  assertion's retirement. Fixed: the `active in-flight` adapter binds it, and the count reads 9 after retirement.
- `minor` — folding `stubGitExec` into the fake contradicted the constant-stub rule. Fixed: it moves into its one
  consumer.
- `minor` — the `change-facts.ts` factory has four test importers, one testing the adapter itself, so it could not
  become module-private. Fixed: renamed to `createSpawnRawGitExec` and kept exported; the forced-edge rule drops its
  rejection-shape clause.
- `minor` — the carve cited phases ADR-035 does not have, and justified the file-exact residual by a consumer map that
  does not consume it. Fixed: the citations point at the `storage-seam` charter and the analysis's § 10.1 and § 10.4,
  and the residual rests on the closeout exclusion and the `storage-seam` row.

Stop reason: converged at pass 3, run over the `Heavy` cap of 2 by explicit Owner authorization.
