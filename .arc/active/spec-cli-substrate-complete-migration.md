# Spec (`detailed` · `RFC`): cli-substrate-complete-migration

- **Origin:** [internal]

- **Purpose:** Close the typed-substrate adoption cohort. Move every first-party consumer that survives the storage
  cutover onto the six landed contracts, retire the transitional shims and compatibility paths those members left,
  and converge test support on shared doubles and fixtures, landing in the storage program's pre-seam window.

---

## Introduction / Context

The six contract-owning members of `cli-substrate-adoption` shipped between 2026-07-19 and 2026-07-25, each bounded so
it could land independently. They left the repository-wide conversion to this tail: old-path re-export shims,
handwritten types behind thin routing schemas, hand-built layout paths, commands outside the command-input regime,
and test code that re-implements the substrate locally.

The residue grows. About 1,800 commits have touched `src/` since the cohort closed, and the transitional paths keep
attracting new code: 92 of the 127 files importing the canonical-JSON shim were created after the cohort shipped.
While the old paths stay, every new module picks one of two ownership vocabularies.

Two program constraints shape the unit. The storage program (ADR-035) moves operational and planning state into
repository refs. It first routes every reader and writer of that state through a storage contract, and after cutover
deletes the code that exists only because state lives in tracked files or Git notes. Migrating code the program
rewrites or deletes would be wasted. The program also sequences this unit before `storage-seam` starts; the unit
touches too much of the tree to run beside it.

"Complete" means complete adoption of the contracts this cohort introduced, over the code that survives the storage
cutover. It is not a mandate to convert every type, validator, or fallible API to Zod or Result without a boundary
need.

## Goals

- Re-derive the residual inventory against the current tree, by owning contract, excluding code the storage program
  deletes or rewrites.
- Move every surviving first-party consumer onto the landed kernel, validation-surface, session-envelope, layout,
  Git-executor, and command-input contracts.
- Retire the transitional shims, old-path re-exports, compatibility paths, and migration bookkeeping the members
  left, together with the tests that exist only to pin them.
- Converge test support on one scripted `GitExec` fake with typed failures, a meta fixture builder, and a
  schema-assertion helper, replacing the local re-implementations in surviving tests.
- Close with a reconciled residual matrix that also carries the per-class layout residuals. Every finding is migrated,
  retained by a named rule, owned by a named owner outside the cohort, or carved to the storage program through a row
  of its storage-coupling register. None survives as an unnamed follow-up.

## Non-Goals

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- New substrate contracts, or redesign of semantics the members settled. A completion that a landed contract's own
  rule authorizes is in scope (§ 2); an extension is not.
- Converting a type, validator, Promise API, or discriminant to Zod or Result only to maximize their use.
- Code the storage program deletes or rewrites (§ 1), except where an edge forces a touch.
- Git-executor capabilities for the ref backend: typed compare-and-swap outcomes, atomic pushes, batch or long-lived
  processes, and signals on the stdin variants. `storage-ref-backend`'s draft holds them.
- Changes to the layout resolver's work-unit tokens. The storage contract's in-repo backend and the projection build
  on them.
- The CLI output contract — machine-readable failures and a declared output mode — captured for its own work unit.
- Pre-public-release compatibility readers outside the six contracts: worktree-marker stamps, installed hook lines,
  the notes config key, the user-surface migration reader (`lib/user-surface-migration.ts`), and the
  integration-boundary legacy readers, captured for one Errand.
- Managed operational-state documents; `operational-state-docs` owns that conversion.
- Real-Git test plumbing: repositories arranged through local `git()` runners, and `GitExec` doubles that run real
  Git through `execFile`. They drive real Git and double no contract.
- Changes to storage layout, lifecycle policy, command behavior, wire formats, or canonical bytes beyond what the
  mechanical adoption requires.

## Proposed Design

The current tree is the inventory's source of truth. The members' own residual lists seed the search but do not
define completion. Sizes below come from import-specifier, regex, and coupling-audit class scans at `7ddab4979`
(2026-09-28); they size the work and are not completion evidence. The inventory re-runs before implementation, after
each base merge, and at verification.

**Boundary.** `assess-boundary-fit` holds at **stays one WU**. Every surviving residual maps to one of the six landed
contracts; the completions compose existing patterns; and test-double convergence is test support for the executor
and validation contracts, extracting a fake already written about 110 times with drifting details. The contract
domains could land separately in principle, but the storage program lands everything single-branch until it
completes, so they become segments and review chunks rather than a delivery plan (§ Cross-cutting Considerations).

### 1. Storage carve-out

The `state-storage` cohort charters `storage-seam` with "every ARC reader and writer of operational and planning state
routed through the contract", with the in-repo layout as the contract's first implementation (`storage-contract`; the
storage analysis's phase 3, § 10.1). The analysis's § 10.4 names the code the program deletes after cutover and the
code the seam rewrites. Both classes are carved here. The cohort's storage-coupling register is the authority for each
carved item's owner and fate.

**Removed at cutover** — owner `storage-cutover`:

- **Notes-specific sync:** the notes machinery in `lib/user-sync/`; the `commands/user/` push, fetch, compaction,
  drift, and sync-status family; `handlers/user-sync.ts` and `handlers/push-recovery.ts`; and the notes portions of
  `commands/user/save-load.ts`, `handlers/user.ts`, `handlers/sync.ts`, and `lib/io-context.ts`. `lib/user-sync/` is
  mixed; these symbols in it survive, because surviving code imports them:
    - the three Git failure-text predicates (`isCasRejectionError`, `isRemoteUnavailableError`,
      `isNonFastForwardError`), used by errand refs, which move to the state-ref plumbing (§ 7);
    - `resolveGitCommonDir` in `repo-shared-paths.ts`, with 9 surviving importers in delivery, the review gate, local
      test admission, and the worktree operation lock. It is plain Git plumbing and moves to `lib/git/exec.ts` beside
      `isGitRepo` (§ 7); `getRepoSharedUserInternalDir` beside it stays where it is, since notes machinery and the
      inbox mutations' lock path below both use it;
    - the cross-WU entry parser (`parseCrossWuEntries`, `matchInboxEntryTitle`), used by inbox state, reminders, and
      inbox-entry operands;
    - the inbox writer (`inbox-writer.ts`) and execution offers (`execution-offer.ts`), used by the errand commands,
      inbox state, and the `user inbox` mutation commands. They stay where they are, and the seam moves them with the
      inbox itself. The lock path those mutations take — `getNotesLockPath`, resolving through
      `getRepoSharedUserInternalDir` — survives by that dependence, but no register row names it, so it goes to the
      register's owner as a correction under the mirror-case rule below;
    - `resolveCurrentWuName`, which survives by the register row although every module importing it today is carved,
      so this unit routes none of its importers.

  Surviving importers reach each survivor through its owning module rather than `lib/user-sync/index.ts`, so the
  deletion pass can remove the barrel's notes exports without stranding them.
- **Branch-tree readers:** `lib/status/project-view-ref.ts`, `git-retirement-authorization-context.ts`,
  `git-transition-record-enumeration.ts`, the history read of `.arc/completed/` in `lib/base-drift/current-adapters.ts`,
  and the ref-reading portions of `in-flight-derivation.ts`, `remote-ref-reader.ts`, `completed-index.ts`
  (`*FromRef`), and the session-init sweeps' base-archive reads. `completed-index.ts` keeps `branchToWorkUnitSlug`;
  `remote-ref-reader.ts` keeps `DEFAULT_NETWORK_TIMEOUT_MS` and `readLiveRemoteBranchTip`.
- **Lifecycle classification and exclusion:** `evidence-applicability/path-treatment.ts`,
  `delivery/lifecycle-contribution.ts` with its Git variant, and the evidence-neutral and regenerable arms that
  consume them.
- **Lifecycle hook checks:** the pre-commit lifecycle checks and their scripts — `validate-meta-spec`,
  `validate-cohort-consistency`, `assert-roadmap-regenerated`, `check-foreign-writes`, `remedy-roadmap-conflict` — and
  the pre-commit hook's own state-path checks, with the `hooks.contributor_protected_paths` default.
- **CI planning classifier:** `isPlanningArtifactPath` and `classifyPlanningLane` in `change-facts.ts`, the
  `lane-paths` logic in `classify-change.sh`, the lane-attestation workflow, the planning-grooming command, and
  `arc review planning-lane`.

The analysis also lists "later, delivery's projection layer" as deleted. The register's row for delivery's
construction machinery gives that to the `delivery-observe-attest` follow-on, which deletes it after the program or
shrinks it to observation, so delivery code stays in scope.

**Rewritten** — owner `storage-seam`, which decomposes against `storage-contract`'s consumer map:

- **In-flight derivation,** which becomes a store read — including the in-flight oracle behind the
  `WorkUnitStateResult` and `ErrandStateResult` session-init slots.
- **The lifecycle executor's write path and `arc start` placement,** including the lifecycle verbs, errand promotion,
  and the `provisional-placement` callers.
- **The archive index** (`completed-index.ts`) and **lifecycle placement readers** (`lifecycle-index.ts`, the project
  view's placement scan).
- **ROADMAP rendering.**
- **The notes-related session-init probes,** including the `UserSessionInitStatusResult` slot and user-reference
  reconciliation (`user-reference-reconcile.ts`), which rewrites `WU_Target` fields in the identity-global inbox — a
  surface that moves into the store — from carved transition-record and remote-ref readers.
- **Locus derivation** (`DerivedLocusFrame`): the storage contract settles locus from marker plus store.
- **The current-WU reconcile slot** (`currentWuReconcile`), which reads the lifecycle index over tracked placement and
  enumerates transition records through a carved branch-tree reader.
- **The stale-worktree sweep** (`StaleWorktreeSweepResult`), whose shipped set, retirements, husk evidence, and
  branched selection all come from carved producers.
- **Work-unit state-path access in surviving code.** Caller-side construction and recognition of metas, specs, tasks,
  drafts, notes files, placement directories, `completed/`, ROADMAP, and the user notes files — by hand or through the
  resolver's work-unit tokens — are carved, since callers stop building state paths once they read and write through
  the contract. So are the state-record families under `.arc/system/.internal/`: Candidate records, their submission
  boundaries, and transition records. The resolver itself is not carved; it stays the contract's first backend path
  resolution, and the projection lays files out at the same `.arc/` paths. Carved callers keep their hand-built state
  paths until the seam moves them onto the contract, so the cohort's one-layout-authority contract carries through
  that register row.
- **Any hook-check content rule** the program moves into a record-family parser rather than deleting.

The full-schema obligation `cli-session-envelope` routed to this tail passes to `storage-seam` for the seven rebuilt
slots: `WorkUnitStateResult`, `ErrandStateResult`, `UserSessionInitStatusResult`, `userReferenceReconcile`,
`DerivedLocusFrame`, `currentWuReconcile`, and `StaleWorktreeSweepResult`. This unit leaves their thin views as they
are.

**Carve rules:**

- **Symbol range, not file.** Wherever a module mixes carved and surviving code, the carve follows symbols. Every
  mixed module is named in the residual matrix with its split. `change-facts.ts` is the sharpest case: its
  planning-lane classifier is carved, while its CI weight classifier, tree hash, portability paths, and raw executor
  survive. A command's surface survives even where its handler body is carved: the adapter wrap in `cli.ts`, the
  command-input declaration, and executor threading at the adapter stay in scope for `locus`, `attest`, `publish`,
  `start`, `user close`, and the errand commands.
- **Type edges.** A surviving result that carries data produced by carved code gets its full schema, with that data at
  its plain shape (for example, `OverlapEvidence.regenerablePaths: string[]`). Carved code a surviving module takes
  only as an input — `PathTreatmentClassifier` as a dependency, `RemoteHeadSnapshotResult` on an options interface —
  never enters a schema. Every schema form stays representable in JSON Schema: no `z.custom` inside a registered
  closure. Registry rows for carved items stay as they are.
- **Forced edges, minimally.** A carved file changes only where a surviving change stops it compiling, and each such
  edit preserves behavior. Retiring a shim or a `src/` compatibility path rewrites the import line it breaks; a shared
  helper that now requires an executor gets `createGitExec()` at the carved call site, which builds exactly the
  executor the `gitExec` singleton holds.
- **Tests follow their subject.** Tests of carved code are not converted beyond forced edges.
- **Register.** Every carved item traces to a register row. Rows relied on remain bound to `main` as of
  `840d348c`, except the accepted decomposition and continuity-anchored-to-code-commits rows added at
  `891c911c6474e85ed042a9ec38a0effe0f87ae76`; only those two exact rows apply under A4. The residual matrix and
  closeout exclusion cite rows rather than restating them. A carved item found without a row, at a sweep or at
  verification, goes to the register's owner as a correction; its matrix row cites that correction, and this unit
  does not migrate it. The mirror case goes the same way: a surviving symbol that a carved row's fate would delete
  is named in its module's split and sent to the register's owner as a correction, which its matrix row cites.
  Mixed-module symbol ranges and independently surviving type/command contracts retain their original rules.
  This branch does not edit the `state-storage` cohort document or its register. (A4)

### 2. Contract completions

A completion is in scope when a landed contract's own rule authorizes it; anything else is an extension and routes
out.

**2.1 `CanonicalDigestSchema`.** The kernel's proven-sharing gate admits a shared value once it has two or more real
consumers. The `sha256:` digest pattern is re-created at about 55 sites in 39 files — three of them local
`z.custom<CanonicalDigest>(isCanonicalDigest)` copies — while the kernel keeps its own pattern private.

- **One definition.** The canonical core exports its digest prefix (`sha256:`) and hex pattern
  (`/^[0-9a-f]{64}$/u`) as plain constants and derives `isCanonicalDigest` from them; the schema composes the same
  two parts, so the kernel keeps one digest definition. The core stays free of Zod.
- **Form:** `z.templateLiteral([prefix, z.string().regex(hexPattern)])` over those constants. It infers exactly the
  kernel's `CanonicalDigest` type and projects to `{ type: "string", pattern: "^sha256:[0-9a-f]{64}$" }`, the same
  JSON Schema the inline regexes emit today. It carries an explicit error message naming the expected form, because a
  template literal's default issue message is a bare "Invalid input" and command-input refusals print it.
- **Home:** `kernel/schema/vocabulary.ts`, beside the other shared schemas.
- **Unregistered,** so the published bundle keeps inline patterns rather than gaining a `$ref` target.
- **Adoption:** a site in surviving code adopts it when its value is a kernel canonical digest, the three local copies
  included where they survive; carved sites keep their patterns under their carve rows. The composite
  `checkpoint-v1:` handle patterns (5 sites) and review-gate's frozen version-1 identities keep their domain owners,
  each with a matrix row: the kernel's rule that shared use does not override a fenced-off semantic owner applies. The
  kernel segment settles the site-by-site split under this rule; a schema this unit writes before then for a kernel
  digest uses it from the start.
- **Narrowing, not checking.** Adoption narrows types and adds no runtime check. A producer that derives its value
  through the canonical core, whose `canonicalDigest` and `digestBytes` return `CanonicalDigest`, narrows any
  handwritten type that widens it to `string`; a value not derived there is not a kernel canonical digest and takes a
  fenced row. No `as` cast or new `assertCanonicalDigest` call enters production code, a test value that is not a
  digest-form literal parses through the schema, and a boolean guard over a kernel digest calls `isCanonicalDigest`.

**2.2 A contract home for `RawGitExec`.** About 25 files use the type, and the executor contract never declares it.
It moves to `lib/git/exec.ts` beside `GitExec` and `GitExecInput`, with the `RawGitResult` shape it returns.
`change-facts.ts` imports both type-only, because `classify-change.sh` runs that module directly under `node` and it
may import only Node built-ins and types.

**2.3 Checkpoint validation against the full `BaseDriftResult` schema.** The integration checkpoint's emitted result
wraps the drift as `z.custom<BaseDriftResult>()` at four sites in `scripts/integration/checkpoint.ts`, and
`handlers/integration.ts` parses that result before writing it. Once the full schema exists (§ 5) the wraps use it and
the drift validates there, with no shape change. A mismatch is a producer defect and fails through that command's
existing operation refusal.

**2.4 Old-path re-exports are transitional.** That covers those validation surfaces kept at their established import
paths, and the `ArcError` re-export in `lib/errors.ts` kept for minimal churn. The pre-public-release posture forbids
compatibility aliases.

**Not completions:** a layout basename projection and an identity-user-root layout token, which would serve only
carved work-unit state paths; new artifact kinds; and the ref-backend executor capabilities.

**The executor's non-execa fallbacks stay.** `normalizeGitRejection` reads a numeric `code` as the exit code and an
`AbortError` name as cancellation, and `gitFailureText` falls back to `message`. They normalize Node child-process
rejections, which the kept real-Git test doubles produce, and surviving code depends on them:
`git-candidate-applicability.ts` answers `not-ancestor` only for a normalized exit code 1.

### 3. Kernel residual

- Retire the kernel shims and re-exports: `lib/canonical/canonical-json.ts` (127 importing files),
  `lib/canonical/managed-path.ts` (28), `lib/work-unit/slug.ts` (9), the `ArcError` re-export in `lib/errors.ts` (4),
  and the vocabulary re-exports in `commands/active/types.ts` (15) — about 183 import edits — with the 5 test cases
  that only pin the shims. `lib/errors.ts` itself stays; only its re-export goes. `lib/canonical/content-digest.ts` is
  not a shim and stays. The canonical-JSON and managed-path test files hold the kernel canonical core's only behavior
  tests besides their pins, so they move to `__tests__/unit/kernel/` beside the kernel's other tests and import the
  kernel modules.
- Replace the local `SlugSchema` copies in `scripts/integration/merge.ts`, `scripts/integration/checkpoint.ts`, and
  `scripts/review-gate/readiness.ts`, and the re-minted state and placement-tier enums in
  `scripts/integration/checkpoint.ts`, with the kernel's `SlugSchema` and `WorkUnitStateSchema` and the layout's
  `ArcPlacementTierSchema`. The kernel's `SlugSchema` is branded and registered as `slug`. The review-readiness
  request and envelope schemas therefore publish `$ref: slug` in place of their inline pattern, with unchanged
  validation. The brand reaches every position typed from those schemas, `MergeLockTransitionRequestSchema` among
  them through `ReviewVehicleSchema`, where about 190 test sites in 12 files and 3 production call sites pass plain
  strings today. `evaluateReviewReadiness`, `checkpointIntegration`, and `mergeIntegration` already parse their input,
  so their parameters take the request schema's input type (`z.input`); any other plain value reaching a branded
  position parses through `SlugSchema`, and no `as` cast brands a slug. The command-path pattern in
  `lib/command-input/registry.ts` matches the slug pattern but names a command, not a work unit, so it stays local.
- Move each local digest pattern in surviving code whose value is a kernel canonical digest onto
  `CanonicalDigestSchema` (§ 2.1). Carved files keep theirs under their carve rows.

### 4. Validation surfaces

Retire the old-path re-exports at 5 sites outside `lib/user-sync/` with 31 importers: `lib/release/types.ts`,
`lib/active/meta-reader.ts`, `lib/config/status-reader.ts`, `lib/commit-check/config.ts`, and
`commands/config/types.ts` with its relay in `commands/config.ts`. Retire the cross-WU entry re-exports in
`lib/user-sync/index.ts` too; their surviving importers (inbox state and reminders) take the entry types from
`lib/user-sync/schema.ts` and the parser from `lib/user-sync/parser.ts` (§ 1). The sync-state re-exports are notes
sync and carved, and the names `user-sync/types.ts` re-exports have no importers.

### 5. Session envelope

The routing table's 14 rows name 13 distinct types; the `BaseDistanceStatusResult` alias is the fourteenth. Nine of
the 13 survive the carve and move from thin routing views to full schemas:

- `DirtyStateResult`;
- `BaseDriftResult`, with its `BaseDistanceStatusResult` alias. It reaches about 13 nested types, and its weight is
  its reach through the four checkpoint wraps (§ 2.3);
- `WorktreeSyncStatusResult`, which compares local `HEAD` with `origin/<branch>` — branch plumbing, not notes sync;
- `WorktreeRosterResult`, built from metas read out of each worktree's tracked placement. That read moves behind the
  contract but the emitted shape does not, so it takes its full schema under the type-edge rule;
- `ExtensionsSessionInitResult`, `ConfigSessionInitResult`, `ActiveSessionInitResult`, `DomainRulesSessionInitResult`,
  and `CurrentHuskAdvisory`.

The four other routed types — `WorkUnitStateResult`, `ErrandStateResult`, `UserSessionInitStatusResult`, and
`StaleWorktreeSweepResult` — are rewritten by `storage-seam`, as are the post-cohort thin slots `DerivedLocusFrame`,
`currentWuReconcile`, and `userReferenceReconcile` (§ 1). This split is recorded here rather than by editing the
archived `notes-cli-session-envelope.md`.

`ReleaseRoutingValue` completes too; its thin view leaves `rationale` unvalidated. `ConfigSessionInitResult`'s schema
composes from the config catalog's leaf schemas for its ten catalog keys, without the catalog's empty-string arm, and
from the release module's interlock enums for `commit.interlock` and `push.interlock`, which are Git-config keys
outside the catalog. Its producer passes some settings through verbatim and keeps its cast over them, so a
misconfigured value still fails envelope validation at the config slot, naming its key, as it does today.

`ActiveSessionInitResult` reaches session-init through the session-init runner's projection of the derived locus
frame, not through the standalone `active` resolver, and the resolver's module keeps the integration-boundary schema
out of its eager imports. The schema therefore sits beside the type in `commands/active/`, and the resolver imports
it type-only.

**Emitted slot types.** Two of the nine reach the envelopes through derived snapshot types rather than as themselves.
The worktree slot, in both envelopes, carries `WorktreeSnapshotAnalysisResult`; the base-distance slot carries
`BaseDistanceSnapshotAnalysisResult | BaseDistanceNotApplicableResult`. Each replaces its root's `failureReason` with
remote-evidence arms, where only the unreachable arm carries a failure reason. `WorktreeSyncStatusResult` and
`BaseDriftResult` get full schemas as their types' authority — `BaseDriftResult`'s also serves the checkpoint wraps —
and stay unregistered components. The worktree snapshot schema composes its root without `failureReason` through the
kernel's `withRemoteEvidence`. The base-distance snapshot schema composes explicit strict arms per verdict, as
`base-branch-sync`'s root does: snapshot arms on `exact`, `pending-fetch`, and `unreachable`, and a not-applicable arm
bounded to `skipped`, `no-remote`, and `detached-head`. `withRemoteEvidence` adds a not-applicable arm to every state,
which would widen that type past the bound it carries today. Those snapshot schemas are their derived types' authority
and the registered roots for the two slots.

**Type authority and registration.** Each completed schema becomes its type's authority: the type is the schema's
`z.infer`, and the handwritten declaration retires; every one is handwritten today. Ten roots are registered: seven
of the nine types, the worktree and base-distance snapshot types in place of the other two, and
`ReleaseRoutingValue`. Each is strict (strict objects, or unions of them) and registered in the session-envelope
registry under a stable ID at version 1, `strict-current`, as `inbox-state` is. The envelope composes each leaf root
directly. The worktree and base-distance slots carry fields their roots do not — `identity`, and in session-init
`supersession` and the recommendation fields — so each builds its strict arms from its root's exported fields plus its
own, keeping its cross-field refinements, and a refusal names the offending key. Those own fields take full schemas
too: `WorktreeIdentity`, and `supersession` as its probe emits it — a `SupersessionResult` when no remote read is
needed, otherwise `SupersessionSnapshotAnalysisResult`'s remote-evidence arms — which is wider than the
`SupersessionResult | null` the slot declares today. Nested types stay unregistered components of their root. The
envelope's own wrapper types (`SessionInit*Value`, `SessionRecover*Value`) stay handwritten, as the session-envelope
member left them, under its compile-time compatibility proof. Session-init validates its envelope at runtime and fails
on a mismatch, so a key a producer emits that its strict root does not declare now fails session-init. Each new root is
therefore tested against output its producer returns (§ Cross-cutting Considerations).

### 6. Layout

**Framework paths.** Framework-path construction in surviving TypeScript moves onto the resolver where a token covers
it, except where it builds a work-unit state path, which is carved (§ 1): the `.arc` root through `arc-root`, the
method and workflow roots through `procedure-root`, and template outputs through `resolveTemplateOutputPath`. The
resolver selects no other `.arc/system` descendant, and the layout contract exports no generic join, so an owner of one
resolves `arc-root` and composes its own suffix, as the config reader already does.
Under `.arc/system/.internal/` those owners hold the framework bookkeeping — manifest, pristine store, hook and script
paths, and the worktree marker; its state-record families are carved (§ 1). A composed suffix no longer matches the
`arc-root` class, and a hit that remains takes a disposition kind. Framework-class hits in surviving `src/` modules
come to about 140 lines in about 40 files, most of them install and file-classification code that may take a
disposition kind instead.

**Ledger retirement.** `layout-migration-ledger.json` is the layout member's digest-bound migration receipt, checked
by `npm run audit:layout-migration`. It no longer holds against the tree and is retired with its schema module
(`lib/coupling-audit/layout-migration-ledger.ts`), `assert-layout-migration.ts`, the `audit:layout-migration` script,
their tests, the script's entry in `one-shot-script-entrypoints.test.ts`, and the manifest exclusion.

**Residual rule.** What the ledger proved still needs proving: no hand-built layout the resolver covers survives
unexplained. The layout contract's seven disposition kinds stay as the residual rule, applied without evidence
digests — `layout-definition`, `root-only-owner`, `pre-resolved-path`, `semantic-policy-owner`,
`scanner-false-positive`, `independent-evidence`, and `external-owner`. Once the ledger module goes they live in the
layout spec and the residual matrix's vocabulary. The coupling-audit class scan enumerates the hits by surface kind:

- **Non-code surfaces** (test, prose, workflow, config, template) are disposed by class-level predicates over surface
  kind and path, as the ledger's bulk entries were. Test literals, for example, are `independent-evidence`.
- **Code-surface hits** (about 1,100 in about 200 files) are disposed three ways:
    - In a wholly carved module, by a predicate over module path: `external-owner`, citing the module's register row.
    - In a mixed module, per file along its symbol-range split (§ 1).
    - In a surviving module, per file and class, each with a kind and an owner. A hit of any layout class that
      constructs or recognizes a work-unit state path is `external-owner`, citing the `storage-seam` row for
      work-unit state-path access — a state-class hit, or an `arc-root` hit where a placement directory or the user
      workspace is built without the trailing slash a placement class needs. That residual stays complete and
      file-exact: the closeout exclusion rests on it, and it is the evidence behind that row. The row's count was
      taken over the state classes alone, so a count the residual no longer matches goes to the register's owner as
      a correction. Other state-class hits cite their own register row (placement, ROADMAP, Candidate and transition
      records) or take their fitting kind: `layout-definition` for the resolver's own definitions, and
      `scanner-false-positive` or `independent-evidence` for message text and conventions.
- **A framework-class code hit that fits no kind** is missed construction, and it migrates. Code outside TypeScript —
  Git hooks, harness hooks, and shell and `.mjs` scripts — cannot import the resolver, so its hits take a kind, most
  often `root-only-owner` for its own root discovery, unless a carved-module predicate covers them. The retired
  ledger's exact entries, read from the merge base, are the precedent for those kinds.

**Routed items.** The layout contract routed two items here. The `provisional-placement` callers all sit in carved
code: the lifecycle write path, the placement readers, a hook check, and a branch-tree reader (§ 1). The
draft-retirement residual in `activate-work-unit.md` and `strategy-work-planning.md` belongs to
`composable-workflows`, whose draft already carries it. It is a Git-operation residual rather than path construction,
so it takes a matrix row owned outside the cohort, not a reconciliation predicate, and the layout-class hits in both
documents reconcile like any other shipped document's.

### 7. Git executor

- Move the `.message` classification in errand identity code to `gitFailureText()`.
- Give `RawGitExec` its contract home (§ 2.2).
- Resolve the duplicate `createRawGitExec` name by renaming the `spawn` factory in `change-facts.ts` to
  `createSpawnRawGitExec`, the alias `object-availability.test.ts` already gives it. It stays exported: four
  integration tests import it, one of them to test the adapter itself. The execa-backed adapter in
  `lib/io-context.ts` keeps the name.
- Move the three Git failure-text predicates from `lib/user-sync/notes-merge.ts` to `lib/git/ref-tree.ts`, the
  state-ref plumbing the errand refs already use, so the notes deletion pass cannot strand them. There the ref
  backend's typed rejection taxonomy can later replace them.
- Move `resolveGitCommonDir` from `lib/user-sync/repo-shared-paths.ts` to `lib/git/exec.ts`, beside `isGitRepo` and
  the other repository probes, for the same reason (§ 1); its 9 surviving importers follow.

Raw Git in production is otherwise done: about 700 invocations across about 170 files run through `GitExec`, and the
review-gate runtime has no raw Git left. The two raw sites remaining are the carved lifecycle hook scripts and the
standalone CI entry point in `change-facts.ts`, whose `spawn` executor stays raw by the import constraint in § 2.2,
with a matrix row.

The `RawGitExec` home, failure reading through `gitFailureText()`, the predicates' move to the state-ref plumbing,
and the fake that emits typed failures (§ 9) are this unit's share of the ref-backend groundwork, so new ref-backend
code and tests start from them. The capabilities themselves belong to `storage-ref-backend` (§ Non-Goals).

### 8. Command inputs

- Wrap the 17 always-JSON adapters — merge lock resolve, hold, and release, and 14 review subcommands — with
  `machineReadable: () => true`, and bind each handler to the context the wrap hands it: the handler builds every
  executor it reaches from the context's subprocess policy, including the policy-less `createGitExec()` in the
  frontline and changeset resolve dependencies, since a wrap alone leaves Git's terminal prompts enabled. A
  repository-inventory case pins the 17 to the adapter under a constant machine-mode policy, because the inventory's
  machine-mode rule sees only `--json` options; the inventory's source scanner records whether a wrap declares that
  policy. `review planning-lane` prints text and is carved.
- Add the 3 missing machine-mode declarations: the `attest` and `publish` policy declarations, and both the wrap and
  the declaration for `locus`, whose handler body is carved locus derivation.
- Wrap 4 value-bearing human-output commands: `user close`, `config validate`, `release setup print-patterns`, and
  `log standalone`. `log standalone` builds its executor from the context; `config validate` and `print-patterns`
  reach neither Git nor a prompt.
- Thread subprocess policy wherever a context-bearing command reaches Git through an unbound executor — the `gitExec`
  singleton or one built without a subprocess policy:
    - The shared helpers in `handlers/shared.ts` (`resolveUserIdentity`, `resolveIdentityWithPrompt`,
      `requireGitRepo`) default to the unbound `gitExec` singleton. They take a required executor, and their
      surviving callers thread one: errand, lifecycle, start, init, join, release push and commit, active, and the
      surviving user commands. Carved callers in the user, user-sync, and sync handlers pass `createGitExec()` under
      the forced-edge rule (§ 1), which keeps their behavior exactly as it is.
    - The 13 CLI-reachable importers of the singleton thread theirs, and five hold it only as a fallback that bound
      callers override. `release opt-in` and `opt-out` have no context to thread, so their adapters wrap with an
      empty policy, as `release push`'s does. `config status`, whose adapter discards its context, threads its own.
    - Exported helpers reach the singleton for callers the import graph does not show. `review.ts`'s
      `defaultMergeLockPort` builds its readiness gate over it, and delivery's merge-lock releases call it; the
      module-level executor in `release commit` serves helpers the delivery review-fix effects import. Both take the
      invocation's executor, and delivery passes the one its command binds.
    - The second unbound singleton, `gitExecInput`, has one context-bearing use: the `active in-flight` adapter,
      which already binds its `GitExec`, binds its `GitExecInput` the same way; the in-flight body it calls stays
      carved. A `createGitExecInput(interaction?)` factory beside `createGitExec` returns the singleton when unbound,
      and `createUserIOContext` builds through it, so in surviving code the singleton survives only as the fallback
      bound callers override. The carved notes writer, `writeGitNote`, keeps calling it under the notes-specific
      sync row.
    - The `gitExec` singleton stays for the standalone scripts, which have no invocation context: 10 today, 9 once
      the ledger assertion retires. `local-test-admission.ts` builds a policy-less executor for the standalone test
      runners, with a matrix row.

### 9. Test-support convergence

**Inventory.** 172 test files type a `GitExec` value: about 110 script responses by argument or in sequence, about 33
run real Git, and about 27 are constant or pass-through stubs. About 90 hand-write meta-shaped blocks, and about 75
carry inline schema assertions. All counts are before the carve removes tests of carved code.

**Placement.** One module per contract under `__tests__/helpers/`, matching the existing per-concern modules; nothing
is appended to `integration.ts`.

**Scripted `GitExec` fake,** extracted from the local copies:

- a response table keyed on Git arguments, with explicit per-entry matching: exact by default, and by opt-in a
  prefix or a predicate over the arguments, which covers the wildcard tokens local doubles use;
- per-entry response sequences, consumed in call order, for doubles that fail a set number of times and then
  succeed;
- computed responses, where an entry's response is a function of the call's arguments and options;
- a call recorder;
- failures as typed `GitProcessError` values built by a shared fixture, which the production classifier types from
  an exit code or signal with stderr and stdout (bytes for the raw variant), or a cancellation or timeout;
- a throw on any unmatched call;
- variants for `GitExecInput` and `RawGitExec`.

**Which doubles convert.** A local double converts when it scripts responses by argument or in sequence. These stay
local:

- constant one-response stubs, since a one-line function reads more clearly than a response table and has nothing to
  drift. `stubGitExec`, a constant stub with one consumer, moves out of `integration.ts` into `active.test.ts`;
- doubles that run real Git, with the `git()` arrangement runners (§ Non-Goals);
- hybrids that wrap a real executor and inject faults by argument;
- scenario simulators: one function that branches on its arguments to model a repository's state, where a response
  table would restate the model entry by entry.

Handler tests that `vi.mock` the IO context keep the mock, and the Git doubles inside it follow the same rule.

**Rejection shapes.** Git doubles — functions typed `GitExec`, `RawGitExec`, or `GitExecInput`, and `vi.fn` doubles
standing in for one — that reject with a hand-built `Object.assign(new Error(...), {...})` Git-failure shape, carrying
stderr, stdout, an exit code or signal, or a cancel or timeout flag (about 31 files), or with a plain `Error` whose
message is Git's failure text (about 62 sites in 21 files), convert to the `GitProcessError` fixture, so those tests
exercise the typed failure the production executor emits rather than the fallback normalization. A plain `Error`'s
message becomes the fixture's stderr, with exit code 128, Git's status for a fatal error, unless the consumer branches
on another status Git uses for that condition. A double that stays local builds any Git failure it throws through the
same fixture. Converted tests keep what they assert, and their call assertions read the fake's recorder.

A failure that is not a process exit, such as Git being unavailable, keeps its plain `Error`, which the normalization
types as `unexpected` as production does, and its double stays local. So do `base-advance.ts`'s fault-injecting
hybrids: the module takes no runtime import from `src/`, and one of them models a non-exit failure deliberately.
Filesystem errno errors, application errors built with the same idiom, and a guard thrown for an unscripted call are
not Git failures and stay, and so do the raw shapes in tests whose subject is that normalization — the executor
adapter's and `normalizeGitRejection`'s own tests. Doubles that already throw a constructed `GitProcessError` throw
the typed failure and stay, except where they assign `expectedOutcome` by hand, which the fixture derives instead.

**Raw test executors.** The shared `makeGitExecInput` helper (raw `spawn`, untyped rejections) moves onto
`createExecaGitExecInput`, beside `makeGitExec`, which already uses the execa adapter. `base-advance.ts` keeps its raw
`git()` runner: it is an arrangement runner, and the module avoids runtime imports from `src/` so the spawned test
lane can reach it. `integration.ts`'s raw notes helpers, `makeGitNoteWriter` and `makeGitNoteReader`, stand in for
the carved note writer and reader inside `makeUserIO`, whose consumers test carved notes machinery, so they follow
their subject and stay, carved under the notes-specific sync row.

**Meta fixtures.** A meta fixture builder over `renderMetaFile` serves fixture setup. Tests about meta parsing or
layout keep literal Markdown as independent evidence, and so do fixtures with values outside the meta vocabulary,
which the builder refuses by design. Consumer fixtures in the legacy flat-bullet form convert to the builder's form,
and a text edit keyed on a flat-bullet field becomes a builder override or a meta setter call.

**Schema assertions.** A helper that reports issues on failure replaces inline `safeParse(...).success` assertions in
surviving tests. A test value typed as a registered schema's output by a cast — configuration objects, audit
entries — parses through that schema instead; a deliberately invalid value built for a refusal test, and a partial
value cast for a function that reads only some fields, keep their casts.

**Order and cut line.** Conversions with a fidelity or forward-compatibility payoff come first: the reusable helpers,
the rejection shapes, and the meta blocks. The inline assertion conversion (about 430 sites, four in ten spanning
several lines) is near-mechanical and always in scope. The remaining in-file scripted doubles — those whose only change
is moving onto the fake, about 65 files — convert last. They are the first cut if task-generation sizing or a later
segment boundary shows the window at risk: they then go to a named Errand, the matrix lists each one against it, and
nothing else in this design depends on them.

**Discoverability.** The project override of the `testing-standards` method, which fires whenever a task writes or
modifies tests, gains one bullet: script `GitExec` through the shared fake with `GitProcessError` failures, build meta
fixtures with the builder, and assert schemas through the helper, while constant stubs, real-Git doubles, hybrids, and
scenario simulators stay local. That is the surface a future test author loads; the archived planning artifacts are
not.

**Unchanged:** `.arc` path literals in tests (independent evidence under the layout contract); local `git()` runners,
real-Git doubles, and fault-injecting hybrids over them; constant one-response stubs; scenario simulators; the E2E
canonicalizers, which are deliberately independent of CLI internals; and Result assertions, which have nothing to
converge.

### 10. Residual matrix and reconciliation

The residual matrix lives as tables in `notes-cli-substrate-complete-migration.md`. A row covers one retired module,
re-export site, or migrated surface, with its importer count, rather than one importer. It records the owning
contract, the old path or helper, the destination, the disposition, and the verification evidence. A disposition is
one of four: migrated; retained by rule, citing the rule; owned by a named owner outside the cohort; or carved, citing
its register row. Every mixed module is named with its symbol-range split. The `makeGitExecInput` row (migrated), the
`base-advance.ts` runner row (retained under § 9's arrangement-runner rule), and the notes helpers' row (carved)
together close the executor member's routed item for reusable raw-Git test executors.

Layout rows follow § 6. A carved-module predicate names its module path and register row. A per-file row is keyed by
file and class and carries a disposition kind, an owner, and its hit count; one whose hits take different kinds lists
the hit lines under each kind. Reconciliation matches on file and class, and the listed lines record the split: they
are re-derived whenever the matrix counts refresh, since every commit that moves a line would otherwise stale them.

Code-surface reconciliation is mechanical and runs both ways over the coupling-audit class scan, filtered to the 15
layout classes: every hit has a per-file row or falls under a carved-module predicate, and every row and predicate
still has a hit. Non-code surfaces reconcile the same way against their class-level predicates. Each hit is assigned
to exactly one rule: a non-code predicate matches by surface kind and path prefix, and the longest matching prefix
wins. A rule's hits are the hits assigned to it, so a fully shadowed predicate reports as hitless; a hit that two rules
match without that precedence settling it is reported, and so is a per-file row whose assigned hit count differs from
its recorded count. The comparison is a one-off script that calls the coupling-audit library and declares the 15
class IDs itself, since the ledger module that held them retires; the notes record its source and command. It runs at
the layout segment, after each base merge, and at verification, each time with a negative control: with a row and a
predicate removed, each with no less specific rule to fall back to, it reports exactly their hits beyond the unremoved
run's report. A tracked gate would rebuild the ledger this unit retires.

### 11. Cohort closeout amendment

The cohort's closeout criterion ("no cohort-scoped first-party importer, transitional shim, or parallel reusable test
helper remains") gains an explicit exclusion for code carved to the storage program, citing the storage-coupling
register as the authority for each item's owner and fate. The amendment is appended to
`cohort-cli-substrate-adoption.md` with this spec.

## Alternatives & Rationale

- **Leave migration to opportunistic cleanup:** rejected. Transitional paths would have no owner or deadline, and new
  code keeps reaching for them.
- **Expand each contract member until the tree is clean:** rejected; it couples independent branches.
- **Keep old-path re-exports indefinitely:** rejected. It preserves two ownership vocabularies and conceals incomplete
  adoption.
- **Treat every pre-existing validator as cohort scope:** rejected; contract invention needs its own owner.
- **Decompose into one work unit per contract domain:** rejected. The domains share one design space. Separate
  landings would each pay the two-PR landing bridge inside a fixed window, and review chunks already carry the review
  burden.
- **Leave local test doubles in place, converging only reusable helpers:** rejected. The closeout criterion itself
  requires only reusable helpers, and the fixture and fake would serve the rejection shapes and new ref-backend tests
  without converting anything else. But the rest of the conversion is mechanical, with no design of its own: about
  430 inline assertions and about 65 files of scripted doubles, which otherwise stay as drifting copies of one pattern.
  Its real cost is window pressure, which § 9's cut line bounds.
- **Convert every local double, constant stubs included:** rejected. A one-line stub has nothing to drift, and a
  response table would couple it to exact argument lists.
- **Build the ref-backend executor capabilities here:** rejected. Their shapes depend on storage-contract decisions
  still provisional, that work is next in line, and only one surviving consumer (errand identity refs) would use a
  typed compare-and-swap outcome now.
- **Migrate storage-deleted code too:** rejected; the work would be discarded at cutover.
- **Carve only the code the program deletes, migrating what it rewrites:** rejected. `storage-seam` rewrites in-flight
  derivation, the lifecycle write path, locus, and the notes probes right after this unit lands, so the migration
  would be discarded just the same.
- **Move caller-side work-unit state paths onto the resolver:** rejected. The seam moves those callers onto the
  contract, so each site would be touched twice. The resolver's work-unit tokens stay for the contract's in-repo
  backend and the projection, and a basename projection would serve only carved callers.
- **Give the stale-worktree sweep and the current-WU reconcile slot full schemas here:** rejected. Their results are
  built from carved producers, and `storage-seam` rebuilds both with their full schemas.
- **Compose `CanonicalDigestSchema` as `z.custom<CanonicalDigest>`:** rejected. Most adopting sites sit inside
  registered schemas, and `z.toJSONSchema` throws on a custom type, which would break the `dist/schemas/kernel.json`
  build and the review handler's runtime projection.
- **Re-issue the layout ledger at closeout:** rejected. Its assertion fails on a stale manifest digest before it
  counts a hit; no generator is tracked; its evidence digests are bound to line positions, so it goes stale at the
  next commit that moves a line (18,373 hits now against 10,278 certified); and it was never wired into CI. Re-issuing
  it means rebuilding a generator and re-judging thousands of rows for a receipt that goes stale at once.
- **Make the `change-facts.ts` spawn factory module-private:** rejected. Four integration tests import it, one of them
  to test the adapter's object-access handling directly; moving them onto the execa adapter would change the subject
  under test.
- **Retire the executor's non-execa fallbacks:** rejected. The kept real-Git test doubles produce those shapes, so
  retiring them would mean moving about 33 of those doubles onto the production adapter for a three-line saving.
- **Keep the integration-boundary legacy readers here:** rejected. They were added after the cohort shipped and fit
  none of the six contracts; they go with their sibling pre-release readers to one Errand (§ Non-Goals).

## Cross-cutting Considerations

**Compatibility.**

- First-party source and tests move fully to the new owner; internal old-path imports are not preserved.
- A transitional re-export is deleted once searches of static and dynamic imports, `vi.mock` specifiers, fixtures, and
  generated outputs show no consumer.
- There is no public import surface to protect. The package ships only the `arc` binary: `package.json` has no
  `exports` or `main`, and the only published contract beyond the binary is the schema IDs in
  `dist/schemas/kernel.json`.
- Completing the session-init types changes the published session-init and session-recover envelope schemas under
  their unchanged IDs, and the bundle gains an ID for each of the ten registered roots (§ 5). The review-readiness
  request and envelope schemas take `$ref: slug` (§ 3). The emitted data does not change, and the session envelope
  carries no version to bump. Verification regenerates the bundle and diffs it.
- Wire shapes, canonical bytes, error kinds, and the observable behavior the members established are preserved.
  Refusal messages change where a local schema gives way to a shared one: a malformed digest argument is refused with
  the digest schema's message rather than Zod's regex message, a surviving `z.custom` digest copy's message and issue
  code become the schema's, and a slug refusal's printed pattern loses the `u` flag the kernel pattern does not carry.
  No test or consumer depends on the old text.

**Security and subprocess policy.** Threading bound executors (§ 8) extends the command-input contract's policy
against terminal prompts to every Git spawn a surviving context-bearing command path makes. No new trust boundary is
introduced.

**Testing.** The shared fake, `GitProcessError` fixture, meta builder, and schema-assertion helper land with their own
unit tests before any conversion uses them. Converted tests keep their assertions; only the double, fixture, or
assertion mechanics change. Session-envelope goldens guard the emitted envelope across the schema moves. Their five
E2E arms cannot reach every producer state, so each newly registered root also gets a unit test that parses
representative producer output, since a strict root now fails session-init on an undeclared key. That output is what
the producer itself returns across the states it can reach, never a hand-typed object, which proves only itself. For
the worktree and base-distance roots it is the snapshot analyzers' output, which is what the envelopes carry.

**Performance and test cost.** New shared helpers and converted tests move `test-cost-budgets.json` rows. Every
affected baseline, the `lane` row included, is taken before the first new test file lands, because a missed baseline
cannot be recovered once the change lands. Final local quality gates and every affected tier-isolated comparison
bind the corrected inputs before Candidate attestation. Required public CI, including E2E and Linux portability,
and all six `ci-job` cost reports remain mandatory for this work unit before integration authorization/merge.
Owner: andrew; forcing event: the exact authorized publication's PR head and its required CI run. Comparisons match
the recorded axes; absent, incompatible, failed, or incomplete reports remain unavailable. Base merges land other
work's tests in between, so a row that moved is attributed by measuring the final merge base in a scratch checkout.
This timing creates no publication, push, dispatch, or CI bypass authorization. (A3)

**Delivery.**

- **Landing.** Single branch, no stacked delivery, through the `archive.cadence: manual` bridge: merge base first;
  integrate with the meta `Integrating` under `.arc/active/` and its Completion Notes composed; archive in a separate
  Errand PR after the merge; tear down only after that PR merges.
- **Window.** Land before `storage-seam` starts; never run alongside it. Errands the `state-storage` cohort pulls
  forward may land meanwhile; the re-runnable sweeps absorb any that land after a sweep ran. If task-generation sizing
  shows the unit cannot land in the window, that is raised then, with the numbers; § 9's cut line is the first lever.
- **Segments.** An opening `layer` segment settles the contract completions and the shared test support: the digest
  schema, the `RawGitExec` home, the `GitExec` fake and `GitProcessError` fixture, the meta builder, and the
  schema-assertion helper. `replication` segments follow per contract domain — kernel shims; validation surfaces and
  session-envelope types; layout framework paths and the state-class dispositions, with the ledger retirement; command
  inputs with the Git residual; test-support conversion — each closing when its enumerated surface is exhausted and
  batch-verified. `generate-tasks` owns the order; the widest and least re-runnable work (the kernel shim sweep and
  test conversion) runs late, and within test conversion the cuttable in-file doubles run last (§ 9).
- **Review.** Chunked local review: each segment seeds one contract-cohesive chunk, split further when a chunk is
  attention-heavy, plus a seam scope across them. Chunk boundaries follow files and dependency order. One pull
  request.
- **Review projections.** This unit is the first consumer of the optional projection the `state-storage` cohort's
  landing rule allows. The chunks form an ordered, cumulative sequence in segment order, and each projects as a stacked
  draft PR: branch _k_ carries the base plus the diff for chunks 1 to _k_, opens against branch _k_−1, and is rebuilt
  after fixes, so the top branch's tree equals the work-unit head outside `.arc/active/`, which is never projected.
  Landing stays single-branch through the one real PR, and the projection PRs close when it merges. Their reviews are
  attention rather than ARC evidence, so the real PR's standard review closes by the Owner-directed stop. The script
  and runbook come from the Errand `review-projection-bridge`; this unit does not hand-roll one, and without them
  chunked local review stands alone.
- **Base merges.** Wide edits on a long-lived branch conflict with every base merge. Each mechanical sweep stays
  re-runnable from a recorded search-and-rewrite recipe; base merges at segment boundaries; and the sweeps and the
  residual reconciliation re-run after each merge.

**Risks.**

- **Grab-bag drift:** every finding maps to one of the six contracts or leaves through the matrix.
- **Carve misclassification** in mixed modules either wastes work or strands a surviving residual, and a rewritten
  item filed as deleted lands with the wrong owner. The symbol-range rule, the named mixed modules, and the register
  citations are the mitigation.
- **Missed consumers:** string paths, dynamic imports, and mocks escape ordinary import searches, so retirement
  searches cover all of them.
- **Reintroduction:** new code landing on base can re-add old imports. Shim deletion turns those into compile errors.
  New local fakes remain possible; the `testing-standards` override points test authors at the shared helpers, and a
  fake that slips past it is accepted.

## Success Criteria

Validated at work-unit completion:

- **Carve.** Every carved item in the residual matrix cites a storage-coupling register row, or the correction sent to
  the register's owner for an item found without one. Every mixed module is named with its symbol-range split, and
  every surviving symbol a carved row omits cites the correction sent for it. Carved code and tests of carved code
  change only by compile-forced, behavior-preserving edits, and surviving code imports no survivor through
  `lib/user-sync/index.ts`.
- **Kernel.** `lib/canonical/canonical-json.ts`, `lib/canonical/managed-path.ts`, `lib/work-unit/slug.ts`, the
  `ArcError` re-export in `lib/errors.ts`, and the vocabulary re-exports in `commands/active/types.ts` are gone, with
  their shim-pinning test cases, and the canonical core's behavior tests run against the kernel beside its other
  tests. The local `SlugSchema` copies and re-minted state and placement-tier enums are replaced by the kernel and
  layout schemas.
- **Digest schema.** `CanonicalDigestSchema` is exported unregistered from `kernel/schema/vocabulary.ts` in the
  `z.templateLiteral` form with an explicit error message, composed from the digest prefix and hex pattern the
  canonical core exports and derives `isCanonicalDigest` from. No `z.custom<CanonicalDigest>` copy remains in
  surviving code, and every remaining local `sha256:` digest pattern there holds a fenced-owner matrix row.
- **Validation surfaces.** The five old-path re-export sites, the `commands/config.ts` relay, and the cross-WU entry
  re-exports in `lib/user-sync/index.ts` are gone, and their importers use the owning modules.
- **Session envelope.** The nine surviving routed types, the worktree and base-distance snapshot types, and
  `ReleaseRoutingValue` have full schemas that are their types' `z.infer` authority, with the handwritten declarations
  gone. The ten roots of § 5, with the snapshot types standing in for the worktree and base-drift types, are registered
  at version 1, `strict-current`, each with a unit test over representative producer output. The four
  `z.custom<BaseDriftResult>()` checkpoint wraps use the full schema. The regenerated schema bundle's diff is confined
  to the ten new roots, the session-init and session-recover envelopes, and the review-readiness request and envelope
  schemas' `$ref: slug`; and the session-envelope goldens pass without expectation changes.
- **Layout.** No framework-class code hit in a surviving module lacks a disposition kind, and none that fits no kind
  remains. The ledger, its schema module, `assert-layout-migration.ts`, the `audit:layout-migration` script, their
  tests, the entrypoint-test entry, and the manifest exclusion are gone.
- **Reconciliation.** Every matrix row carries one of § 10's four dispositions with its citation. The final
  code-surface reconciliation over the 15 layout classes reports no hit without a per-file row or carved-module
  predicate, no overlap the precedence does not settle, no row or predicate without a hit, and no row whose hit count
  moved; every non-code surface falls under a recorded predicate; and its negative control reports exactly the removed
  hits beyond the unremoved run's report.
- **Git executor.** `RawGitExec` and `RawGitResult` are declared in `lib/git/exec.ts` and imported type-only by
  `change-facts.ts`, and `classify-change.sh` still runs. The spawn factory is `createSpawnRawGitExec`, and
  `createRawGitExec` names only the execa adapter. The three failure-text predicates live in `lib/git/ref-tree.ts` and
  `resolveGitCommonDir` in `lib/git/exec.ts`, with no importer reaching either through `lib/user-sync/`. Errand
  identity code classifies failures through `gitFailureText()`.
- **Command inputs.** The 17 always-JSON adapters, the 4 value-bearing commands, and `release opt-in` and `opt-out` are
  wrapped, carved handlers' command surfaces included; the always-JSON handlers and `log standalone` build their
  executors from the context they receive, and the 3 missing declarations exist. The shared helpers in
  `handlers/shared.ts` require an executor, and their carved callers pass `createGitExec()`. No surviving
  context-bearing command path spawns Git through an unbound executor, exported helpers' callers included: `gitExec`'s
  remaining surviving importers are the standalone scripts and the fallback holders their callers override,
  `gitExecInput`'s remaining surviving use is the unbound fallback `createGitExecInput` returns, and the only surviving
  executors built without a subprocess policy are the module-level ones in `lib/io-context.ts` and
  `local-test-admission.ts`'s.
- **Test support.** The scripted fake with every capability in § 9, the `GitProcessError` fixture, the meta builder,
  and the schema-assertion helper exist under `__tests__/helpers/` with their own tests. Apart from hits a
  retained-by-rule matrix row covers, no surviving test keeps a hand-built Git-failure rejection, a local double that
  § 9 converts (other than any § 9's cut line hands to its named Errand, each listed in the matrix), a hand-written
  meta block outside a test of meta parsing or layout, an inline `safeParse(...).success` assertion, or a value typed
  by a cast to a registered schema's output. `makeGitExecInput` builds on `createExecaGitExecInput`, and `stubGitExec`
  is local to `active.test.ts`. The `testing-standards` project override names the shared fake, fixture, builder, and
  helper, and the doubles that stay local.
- **Test cost.** Every affected test-cost baseline, `lane` included, was taken before the first new test file landed,
  and the final comparison is recorded.
- **Cohort.** `cohort-cli-substrate-adoption.md`'s closeout criterion carries the storage-carve exclusion, and the
  residual matrix reconciles against all six member scopes and the amended criterion.
- **Gates.** Repository-wide searches for every retired symbol and path — static and dynamic imports, `vi.mock`
  specifiers, fixtures, and generated outputs — come back empty, and the full Tier 3 gates pass: Markdown lint, the ARC
  contract checks, `typecheck:all`, TypeScript lint, the full test suite with E2E and portability in required CI, and
  the build.
    - _A3:_ Final local evidence precedes Candidate attestation; required public CI and all six `ci-job` cost
      reports remain mandatory against the exact published head before integration authorization/merge.

- `[ ]` Every project-designated local quality gate passes against the final verified inputs
    - _A3:_ Required public CI, including E2E and Linux portability, remains mandatory before integration
      authorization; local E2E still runs wherever changed-path rules require it.

- `[ ]` Implementation verification is complete and ready for Candidate preparation, with required public CI
  and all six `ci-job` cost reports retained against the exact published head before integration authorization

- `[ ]` The two storage-register corrections adopted by A4 are bound to their exact `891c911c` rows, with
  decomposition and continuity subjects named and all mixed-module survivor ranges preserved

## Open Questions

No settle-able design question remains. Implementation latitude covers the site-by-site digest split under § 2.1's
rule, the per-file disposition kind of each framework-class hit under § 6's rule, and batching within the task list's
review increments.

The register rows this carve cites are bound to `main` as of `840d348c`, including work-unit state-path access,
`currentWuReconcile`, and `StaleWorktreeSweepResult`. A4 additionally applies only the exact decomposition and
continuity rows added at `891c911c6474e85ed042a9ec38a0effe0f87ae76`; no other later row is adopted. The branch
contains that accepted correction. The matrix names R-DCP and R-CONT with this provenance and preserves the
symbol-range/type-edge carve rules. Whether surviving callers later ask the contract for a document or its fields
is `storage-seam`'s decision and does not change the carve. (A4)

## Amendments

- **A1** — 2026-09-29 — task: Populate Candidate metadata after rendering the delivery-position fixture.
  _Supersedes:_ none. _Trigger:_ 7.5 segment. _Work:_ 7.R. _Revalidated:_ 7.5.
- **A2** — 2026-09-29 — task: Preserve storage-owned tests at their pre-conversion boundary.
  _Supersedes:_ none. _Trigger:_ 7.5 segment. _Work:_ 7.R2. _Revalidated:_ 7.5.
<!-- markdownlint-disable MD013 -->
- **A3** — 2026-09-29 — design: Bind local verification and public CI evidence to their producing boundaries.
  _Supersedes:_ § Cross-cutting Considerations, Performance and test cost ¶1; § Success Criteria, Gates ¶1; task criteria 31–32. _Trigger:_ 8.1 terminal. _Work:_ 7.R3. _Revalidated:_ pending → verify-work-unit.
- **A4** — 2026-09-29 — design: Apply the accepted decomposition and continuity register corrections explicitly.
  _Supersedes:_ §1 Register ¶1 and final register-relationship ¶1, only these two rows. _Trigger:_ 8.1 terminal. _Work:_ 7.R4. _Revalidated:_ pending → verify-work-unit.
<!-- markdownlint-enable MD013 -->
