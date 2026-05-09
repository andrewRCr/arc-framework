# Analysis: CLI Architecture SOLID / DRY Audit

**Purpose:** Capture a read-only architecture audit of `packages/arc-framework/` for SOLID,
DRY, layering, and maintainability concerns. Evidence record; remediation tracked in the
plan documents listed under § Plan Mapping.

**State:** Reviewed 2026-05-08 during Interlock Release Wrappers WU1 Phase 1; findings
graduated into three remediation plans (see § Plan Mapping).

**Created:** 2026-05-08

**Origin:** Parallel-session audit requested during active Interlock Release Wrappers WU1
work. Phase 1 implementation was ongoing in another session, so this artifact
intentionally avoided task execution, code edits, or active status changes.

---

## Scope

Initial scope:

- Production TypeScript under `packages/arc-framework/src/`
- Test architecture under `packages/arc-framework/__tests__/`

Out of scope for this audit:

- Behavioral correctness review of the active release-wrapper implementation
- Remediation design beyond rough candidate directions
- Code or test changes

## Production-Code Findings

### P1 — Lower-level `lib/` modules depend on command-layer type contracts

Several `lib/` modules import type contracts from `commands/`, which inverts the intended
direction of dependency (`lib -> commands -> handlers -> cli`). Current imports are type-only,
so runtime risk is low, but it still couples reusable lower-level modules to command surfaces.

Evidence:

- `src/lib/io-context.ts` imports `IOContext` from `src/commands/init.ts` and
  `UserIOContext` from `src/commands/user.ts`.
- `src/lib/session-init/recommended-action.ts` imports `UserSessionInitStatusResult` from
  `src/commands/user/types.ts`.
- `src/lib/active/status-reader.ts` imports `ActiveLayout` and `StatusFileCandidate` from
  `src/commands/active/types.ts`.
- `src/lib/config/status-reader.ts` and `src/lib/config/resolved-settings.ts` import
  `ConfigSettings` from `src/commands/config/types.ts`.

Why it matters:

- Makes the command layer the accidental owner of domain contracts.
- Raises the cost of reusing `lib/` modules from future CLI wrappers or background tooling.
- Encourages new lower-level helpers to import command result shapes instead of neutral
  domain types.

Candidate remediation:

- Move shared contracts into neutral `lib/*/types.ts` modules, then have command result
  contracts compose those types.
- Keep command-layer result envelopes in `commands/*/types.ts` where they are presentation
  or CLI-surface-specific.

### P1 — User-sync status module has accumulated multiple responsibilities

`src/commands/user/sync-status.ts` is the clearest SRP pressure point. It is roughly 1.6k
lines and currently owns:

- Full `arc user status` orchestration
- Session-init user-notes status
- Shared user-sync spine policy
- User-facing status/result construction
- Notes-ref topology inspection
- Disk-vs-note manifest comparison
- Remote identity listing
- Manifest comparison helpers

Evidence:

- `runUserStatus(...)` orchestrates disk, note, backup, remote identity, ref, worktree, and
  sync-state probes before building the result.
- `runUserSessionInitStatus(...)` performs a narrower but overlapping session-init probe.
- `computeUserSyncSpine(...)` owns shared policy mapping from raw ref topology to session-init
  compatible verdicts.
- `buildUserStatusResult(...)` owns status rendering/detail-line composition.
- `inspectUserSyncRefsDetailed(...)` owns git ref comparison and temp-ref fetch behavior.
- `inspectDiskVsLocalSnapshot(...)` owns disk/note/materialized-state direction inference.

Why it matters:

- Policy, IO, and presentation changes share one file-level change surface.
- Tests can target exported helpers, but the module boundary does not communicate the system
  boundaries a reader needs to understand.
- Future release wrappers and sync-related work are likely to touch user-sync state, increasing
  conflict and regression risk.

Candidate remediation:

- Split into focused modules, likely:
    - `lib/user-sync/ref-inspection.ts`
    - `lib/user-sync/disk-snapshot.ts`
    - `lib/user-sync/spine.ts`
    - `commands/user/status-builder.ts`
    - command-level orchestrators that compose those modules
- Preserve current public command exports during migration to keep call sites stable.

### P1 — `arc sync` handler is a CLI adapter, policy engine, executor, and renderer

`src/handlers/sync.ts` contains the pure matrix decision, config/prompt-policy normalization,
runtime execution, JSON envelope assembly, output rendering, and exit-code handling. The file
is well-commented, but the module boundary still mixes responsibilities.

Evidence:

- `decideMatrix(...)`, `decideWorktree(...)`, `decideNotes(...)`, and `cellNameFor(...)` are
  pure policy functions embedded as private handler helpers.
- `handleSync(...)` resolves identity, project root, settings, prompt degradation, worktree
  probe state, dry-run/runtime branching, JSON output, and exit code.
- `execute(...)`, `executeBlockedWorktree(...)`, `executePaired(...)`, and
  `executeSingleLeg(...)` own runtime side effects.
- Rendering helpers such as `renderPairedResult(...)`, `renderPairedNotesOutcome(...)`,
  `worktreeBlockGuidance(...)`, and `reconcileGuidance(...)` live in the same module.

Why it matters:

- Extending release wrappers or handoff sync behavior will likely add pressure to an already
  broad handler.
- Pure policy is harder to reuse from other commands because it is private to a handler.
- Tests of policy details tend to route through handler-level orchestration unless private
  logic is duplicated or exposed indirectly.

Candidate remediation:

- Extract the pure sync matrix and outcome type surface to a neutral module.
- Extract runtime execution into a command/service layer that consumes a matrix decision and
  injected IO/output adapters.
- Keep `handlers/sync.ts` as a thin CLI adapter.

### P2 — User-notes git/ref and manifest helpers are duplicated

There is concrete DRY cleanup available around user-note refs and manifest hashing /
normalization.

Evidence:

- `readLocalRefHash(...)` / `readRemoteRefHash(...)` style logic appears in both
  `src/commands/user/push-fetch.ts` and `src/commands/user/sync-status.ts`.
- `normalizeManifest(...)` exists in both `src/commands/user/save-load.ts` and
  `src/commands/user/sync-status.ts`.
- `hashSyncManifest(...)` is exported from `save-load.ts`, but the normalizer it depends on is
  private, forcing sibling modules to replicate the normalization shape when they need equality
  checks.

Why it matters:

- Ref-probe behavior can drift across push/status paths, especially around remote-unavailable
  distinctions.
- Manifest comparison invariants are domain logic and should have one owner.

Candidate remediation:

- Add a small `lib/user-sync/notes-ref.ts` for local/remote ref reads and ls-remote parsing.
- Add a small `lib/user-sync/manifest.ts` for normalization, equality, and hashing.

### P2 — Skill and gitignore setup sequence is repeated across lifecycle commands

The same detect/generate/write/update-gitignore pattern appears in init, join, join
reconfigure, update, and reconfigure code paths.

Evidence:

- `src/commands/init.ts`
- `src/commands/join.ts`
- `src/commands/update.ts`
- `src/commands/reconfigure.ts`

Why it matters:

- This is not causing visible complexity today, but adding a new skill target behavior or
  gitignore entry requires coordinated edits across several lifecycle paths.

Candidate remediation:

- Extract a shared lifecycle helper that accepts `{ cwd, templateDir, tools, io }`, writes skill
  outputs, and updates the managed gitignore block.
- Keep role-specific setup and migration-specific concerns in the existing commands.

## Test Architecture Findings

### P1 — Largest tests mirror the oversized production module boundaries

The highest-risk tests are not low-quality; they are doing the work required by broad production
modules. The concern is that test files now group several distinct concerns under one module-level
surface, making refactors harder and making future feature work more likely to add to already-large
test files.

Evidence:

- `__tests__/unit/user-status.test.ts` is roughly 2.2k lines and covers result building, user sync
  cause routing, offline degradation, first-use hints, default/verbose rendering, unsaved direction
  inference, disk-vs-note inspection, spine policy, partial-push coherence, session-init status,
  load-needed probing, load summaries, worktree qualifiers, run orchestration, bounded notes-ref
  fetch, and user-sync-cause orchestration.
- `__tests__/unit/sync-orchestrator.test.ts` is roughly 1.1k lines and covers matrix dispatch,
  stdout purity, `--yes` wiring, and error envelopes through the top-level handler.
- `__tests__/integration/user.test.ts` is roughly 1.5k lines and groups save/load, backup and stale
  detection, subdirectory support, add, push/pull, and status scenarios.
- `__tests__/unit/status/run.test.ts` is roughly 1.4k lines and carries large fixture builders for
  composite status, session-init status, recommended actions, JSON wire shape, and handoff status.

Why it matters:

- Production refactors require navigating large mixed-concern test surfaces.
- New behavior can be added by appending to a broad test file instead of creating a sharper module
  contract.
- The tests reinforce the current architecture: if user-sync or sync policy is split later, test
  ownership will need to split too.

Candidate remediation:

- Split tests along the same module boundaries selected for production remediation.
- For user sync, likely targets are spine policy, ref inspection, disk snapshot comparison, status
  result building, session-init status, and command orchestration.
- For sync, move matrix/policy coverage to pure unit tests after policy extraction, then leave the
  handler test focused on CLI adapter behavior, output mode, prompts, and exit codes.

### P1 — Handler tests need heavy module mocks and process-global assertions

Several handler-level tests have to simulate a large amount of environment because the production
handler owns policy, runtime dispatch, rendering, and process exit behavior.

Evidence:

- `__tests__/unit/sync-orchestrator.test.ts` mocks filesystem access, Clack prompts, user command
  helpers, resolved settings, worktree status, push recovery, shared handler helpers, path
  resolution, and user IO context before importing `handleSync`.
- The same file captures `process.stdout.write`, `process.stderr.write`, and `process.exitCode` to
  assert JSON purity, error envelopes, and exit behavior.
- `__tests__/unit/sync.test.ts` and `__tests__/unit/user-handlers.test.ts` show the same pattern:
  handler behavior is tested through mocked command modules, mocked project-root resolution, and
  process exit-code assertions.

Why it matters:

- Test setup volume is a symptom of hidden responsibilities in the handler layer.
- Assertions often target call internals or process globals rather than a smaller explicit contract.
- Refactoring the handler can break many tests even when the user-facing behavior is unchanged.

Candidate remediation:

- Extract pure policy and JSON-envelope construction into directly testable modules.
- Keep a small handler test harness for process stdout/stderr and `process.exitCode` assertions,
  rather than repeating capture logic per handler test file.
- Avoid trying to remove all `mock.calls` usage. Some call-level assertions are appropriate for CLI
  dispatch tests; the target is reducing where broad handler tests are the only available seam.

### P2 — Unit-test fixture and IO mock helpers are duplicated

There are many local `mockIO` / `makeIO` implementations and ad hoc git-command script stubs across
unit tests. Some local fixtures are worthwhile because they keep a test readable, but the repetition
is now broad enough that common typed builders would reduce noise.

Evidence:

- Bespoke IO mocks appear in `__tests__/unit/init.test.ts`, `join.test.ts`, `reconfigure.test.ts`,
  `save-load.test.ts`, `user-status.test.ts`, `manifest/apply.test.ts`, `hook-integration.test.ts`,
  and `git/user-sync.test.ts`.
- Many tests inspect `(io.exec as ReturnType<typeof vi.fn>).mock.calls` or write-file call arrays
  directly.
- `__tests__/helpers/integration.ts` is a broad 410-line helper that combines temp git repo setup,
  IO context construction, init execution, manifest/pristine helpers, filesystem setup, git-note
  helpers, and user IO helpers.

Why it matters:

- A new contributor has to learn several similar mock shapes rather than one or two explicit test
  harnesses.
- Git command behavior is re-scripted in many places, which makes subtle behavior drift possible.
- The broad integration helper is convenient, but it has become a small utility module with multiple
  reasons to change.

Candidate remediation:

- Add focused, typed test builders for memory IO, scripted git exec, user IO context, and temp ARC
  project setup.
- Split `__tests__/helpers/integration.ts` by concern only when it is already being touched; the
  helper works today and should not be churned just for neatness.
- Prefer domain-specific builders over a single all-purpose test fixture abstraction.

### P2 — Subprocess CLI helper duplication is already captured

There are two subprocess helpers: `__tests__/e2e/helpers.ts:runArc` for PTY-like E2E behavior and
`__tests__/helpers/run-cli.ts:runCli` for pipe-based stdout purity tests. They overlap, but the
difference in invocation mode is real.

Evidence:

- `runArc` uses the built CLI, injects `NO_COLOR=1`, uses a 30s timeout, and wraps Linux execution
  with `script` to emulate a TTY.
- `runCli` uses pipe stdio, a 10s timeout, and returns stdout/stderr without PTY behavior.
- This is already recorded in `.arc/backlog/technical/BACKLOG-TECHNICAL.md` under "Unify subprocess
  CLI test helpers (`runArc` + `runCli`)".

Why it matters:

- This is a known ergonomic issue, not a new audit finding that needs separate planning.
- Any consolidation should preserve the explicit TTY-vs-pipe distinction.

Candidate remediation:

- Treat the existing backlog item as the source of truth.
- If picked up later, prefer a single helper with an explicit `mode: "tty" | "pipe"` option rather
  than silently merging the two behaviors.

## Test Quality / Methodology Findings

Reference standard: `.arc/reference/strategies/project/strategy-testing-methodology.md` emphasizes
behavior through public interfaces, meaningful assertions over coverage targets, one logical
behavior per test, and mocking only at system boundaries.

### P1 — Internal-module mocks are the clearest methodology drift

The strategy says not to mock internal modules; if doing so is hard to avoid, the interface likely
needs redesign. Several current tests do mock internal command, handler, config, path, git, or IO
modules. The highest-pressure cases are handler tests, where this is mostly compensating for broad
handler responsibilities.

Evidence:

- `__tests__/unit/sync-orchestrator.test.ts` mocks internal user commands, resolved settings,
  worktree status, push recovery, shared handler helpers, path resolution, and IO-context creation.
- `__tests__/unit/user-handlers.test.ts` mocks internal user commands, shared handler helpers,
  config status reading, IO-context creation, path resolution, and git identity slugification.
- `__tests__/unit/sync.test.ts` mocks user commands, config readers, worktree status, push recovery,
  shared handler helpers, and IO-context creation.
- `__tests__/unit/push-recovery.test.ts`, `push-fetch.test.ts`, and `paired-push.test.ts` also mock
  sibling internal user-command modules.

Why it matters:

- These tests can pass while the real composed modules drift apart.
- Refactors that preserve behavior can still require broad test rewrites because tests are coupled
  to call topology.
- The pattern conflicts with the local testing strategy enough that new tests are likely to copy it.

Candidate remediation:

- Prefer extracting pure policy / result-shaping modules and testing those directly with real
  imports.
- For handlers, keep only a small set of adapter tests that mock true boundaries and assert
  user-visible output, prompt behavior, and exit code.
- Where orchestration behavior genuinely needs fakes, inject typed collaborators instead of using
  module-level `vi.mock("../../src/...")`.

### P1 — Some tests assert delegation topology more than observable behavior

Many assertions are still meaningful, but their signal comes from proving which mocked collaborator
was called rather than proving the result a caller or user observes. This is expected around
orchestrators, but it should not become the default test style.

Evidence:

- `__tests__/unit/sync-orchestrator.test.ts` has many matrix cases asserting
  `runPairedPush` / `runUserSave` / `pushWithRecovery` call counts and non-calls.
- `__tests__/unit/user-handlers.test.ts` heavily asserts calls to mocked user commands plus Clack
  logging calls and `process.exitCode`.
- `__tests__/unit/status/run.test.ts` has repeated "invokes every probe helper exactly once" tests
  for composite status modes.
- `__tests__/unit/paired-push.test.ts` asserts internal marker calls alongside returned paired-push
  outcomes.

Why it matters:

- These tests resist refactors that keep the public contract intact but change composition.
- Exact non-call assertions are useful for safety-critical branches, but noisy when repeated across
  every matrix cell.
- They can create a false sense of coverage if the real behavior lives behind mocked internals.

Candidate remediation:

- Keep call-count assertions for safety invariants: no destructive write, no force push, no prompt in
  JSON/non-interactive mode, no push after failed save.
- Replace routine delegation assertions with result-envelope, disk/ref state, stdout/stderr, or
  domain-result assertions.
- Use table tests for true decision matrices, but keep each row focused on one meaningful behavioral
  outcome.

### P2 — Some tests are over-specific to implementation wording or batching

The suite is not obviously padded with empty tests. Most tests cover real ARC behavior. The excess
risk is more subtle: some tests pin too many exact strings, too much call ordering, or too many cases
inside one test.

Evidence:

- `__tests__/unit/user-status.test.ts` has many exact status-line assertions. This is partly valid
  because CLI text is user-facing, but full exact arrays across many near-neighbor states can make
  harmless copy edits expensive.
- `__tests__/unit/sync.test.ts` has a single `decideSyncAction` test that asserts many matrix rows
  in one `it(...)`, reducing failure locality.
- `__tests__/unit/status/run.test.ts` names and comments the concurrency check around `Promise.all`,
  which reads like implementation verification unless parallel probing is treated as a public
  performance contract.
- `__tests__/e2e/run-cli.e2e.test.ts` smoke-tests the helper itself with `--help`; useful as a guard
  while subprocess-helper behavior is unsettled, but lower signal than the actual stdout-purity tests
  that consume the helper.

Why it matters:

- Over-specific assertions increase maintenance cost without always increasing confidence.
- Multi-behavior tests make failures harder to diagnose.
- Helper smoke tests can become stale once their helper is covered by real consumer tests.

Candidate remediation:

- Keep exact text assertions for one canonical example per output mode and for high-risk guidance
  lines; use `toContain` / semantic assertions elsewhere.
- Convert bundled matrix assertions into parameterized rows with one behavior per row.
- Treat concurrency as an explicit contract if it matters; otherwise test stable slot envelopes and
  failure isolation, not `Promise.all` mechanics.
- Revisit helper smoke tests when consolidating `runArc` / `runCli`; they may become unnecessary.

### P2 — Mock mechanics mostly follow strategy, with a few hygiene exceptions

The suite generally follows the Vitest mechanics guidance: mocks are usually hoisted, and
`vi.resetAllMocks()` is used rather than `vi.clearAllMocks()`. I found no `vi.clearAllMocks()` usage.
There are still a few inline `vi.fn()` values inside `vi.mock(...)` factory returns.

Evidence:

- `__tests__/integration/user.test.ts` and `__tests__/integration/multi-clone.test.ts` inline
  unreferenced Clack `intro` / `outro` / `confirm` mocks.
- `__tests__/unit/push-fetch.test.ts` inlines `runUserLoad: vi.fn()` in an internal-module mock.
- `__tests__/unit/sync.test.ts` and `__tests__/unit/sync-orchestrator.test.ts` inline `vi.fn()`
  values in mocked IO-context returns.

Why it matters:

- The practical risk is low for unreferenced no-op mocks.
- It still weakens the consistency of a rule that exists to prevent mock state leaks.

Candidate remediation:

- Hoist even unasserted mocks when inside `vi.mock(...)`, or return simple non-mock no-op functions
  when call tracking is irrelevant.
- Prefer small test harness objects over anonymous mocked IO-context fragments.

## Positive Signals

The codebase already has several healthy architecture seams:

- `src/cli.ts` is mostly Commander wiring.
- `src/lib/manifest/plan.ts` and `src/lib/manifest/apply.ts` are a strong pure-plan / IO-apply
  split.
- `src/commands/status/run.ts` uses per-probe failure envelopes so composite status calls can
  degrade without throwing.
- Several newer modules expose typed pure helpers that are straightforward to test.
- Tests are clearly tiered into unit, integration, and E2E suites.
- E2E helpers intentionally exercise the built artifact instead of importing source modules.
- `__tests__/helpers/cli-spawn.ts` already extracts the shared built-CLI path and prebuild guard.
- `__tests__/helpers/multi-clone.ts` is a good example of a focused domain harness.
- The suite has substantial behavior coverage; the quality issue is not "too many empty tests".
- User-facing output contracts are tested deliberately, including JSON stdout-purity behavior.
- Mock state hygiene is mostly consistent: `vi.resetAllMocks()` is common, and `vi.clearAllMocks()`
  does not appear in the current suite.

## Sequencing Considerations

Early read:

- Do not interrupt the active release-wrapper foundation work just for low-risk DRY cleanup.
- Revisit sequencing if release-wrapper implementation starts copying sync/interlock policy from
  the broad modules above; that would make the architectural debt an active blocker rather than
  deferred cleanup.
- Test remediation should generally follow production extraction. Splitting large tests before the
  production boundaries are chosen would mostly reshuffle today’s coupling.
- If release-wrapper work needs more sync/interlock matrix tests, prefer adding coverage around pure
  policy seams if they already exist; otherwise keep the new tests tightly scoped and avoid expanding
  the broad handler tests unless necessary.
- If remediation proceeds, start with type/layer extraction and pure policy extraction. Those
  are smaller, safer enabling moves than a full user-sync module split.

## Plan Mapping

Findings graduated into three remediation plans, all sequenced after the parallelism trio
and Coord Probe so they can run in parallel via worktree infrastructure:

- `plan-lib-layer-type-extraction.md` — § P1 (lib-layer dependency inversion).
- `plan-sync-handler-decomposition.md` — § P1 (sync handler responsibilities), plus
  matching test-architecture and test-methodology findings on the sync surface (largest
  tests mirror oversized modules; handler tests need heavy module mocks; internal-module
  mocks; delegation-topology assertions). P2 manifest / ref-helper duplication folded in
  as relevant modules are touched.
- `plan-user-sync-module-split.md` — § P1 (user-sync status module SRP). P2 user-notes
  ref + manifest helper duplication folded in.

P2 skill / gitignore duplication, P2 unit-test fixture / IO mock duplication, P2
over-specific test assertions, and P2 mock-mechanics hygiene fold opportunistically into
the relevant plans or remain as backlog cleanup; none warrant a standalone plan.

Interlock Release Wrappers WU1 is not paused. The two inversions Phase 1 propagated
(`wu-resolution.ts` importing `ActiveLayout`; `resolved-settings.ts` extension under
`ConfigSettings`) follow existing convention and remediate inside Plan A.
