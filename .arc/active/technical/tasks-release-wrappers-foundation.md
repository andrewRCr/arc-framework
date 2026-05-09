# Task List: Release Wrappers — Foundation

- **PRD:** `prd-release-wrappers-foundation.md`
- **Branch(es):** `technical/release-wrappers-foundation`
- **Base Branch:** `main`

- **Purpose:** Deliver the mechanical foundation for `arc release commit` / `arc release push` — validation library,
  audit log, and opt-in state surface — usable end-to-end by hand-configured early adopters before WU2's ergonomics
  layer lands.

- **Notes:** Implementation rationale, design alternatives, and audit-derived design decisions live in
  `notes-release-wrappers-foundation.md`. Tasks below cross-reference sections of that file where load-bearing context
  exceeds inline-note scope.

---

## **Phase 1:** Validation Library Foundation

_Purpose:_ Land the pure-logic `src/lib/release/` core that all release-wrapper handlers consume — types,
config-resolver extensions, refusal taxonomy, destructive-flag lists, WU resolution, interlock authorization, audit log.

_Design decisions:_ Test-first across all modules except `types.ts` per testing-methodology (type declarations have no
test surface). 1.2 extends `lib/config/resolved-settings.ts` with the `release.*` key surface — foundational dependency
consumed by 4.2 (status) and 5.2 (probe migration). See `notes-release-wrappers-foundation.md` § Phase 1 for resolver
shape and edge-case enumerations.

### `[x]` **1.1 `types.ts` — refusal codes, decision shapes, audit entry schema**

- _Goal:_ Public type surface that pins R4's refusal taxonomy, R3's authorization decision shape, R7's audit entry
  schema, and the shared `formatRefusal()` helper signature as a single source of truth callers import without reaching
  into module internals.

- _Outcome:_ Created `src/lib/release/types.ts`. Shared formatter exported as a `FormatRefusal` type alias rather than a
  function declaration — the implementation lives in 1.5 (`interlock-validation.ts`) and binds via
  `export const formatRefusal: FormatRefusal = ...` so the signature stays pinned in this module.

### `[x]` **1.2 Extend `lib/config/resolved-settings.ts` with `release.*` key surface**

- _Goal:_ `resolveAllSettings` resolves `release.enabled` via three-tier precedence
  (`git config arc.* → arc-config.yml → default`) alongside the existing release-mode keys, producing typed
  `{value, source}` provenance — single resolver consumed by 4.2 (status reporting) and 5.2 (session-init envelope
  migration).

- _Outcome:_ Extended `resolved-settings.ts` with the `ReleaseEnabled` type, `RELEASE_ENABLED_*` constants,
  `resolveReleaseEnabled`, and a `releaseEnabled` field on `ResolvedReleaseModeSettings` (wired into the `Promise.all`
  fan-out). Cross-cutting: `release.enabled` joined `ConfigSettings`, `DEFAULTS`, and `AGENT_CONSUMABLE_KEYS` in
  `status-reader.ts`, keeping the raw reader and agent-consumable surface symmetric with the existing four release-mode
  keys; the layering-boundary docblock now names five keys. The new key participates in the same yaml-absence
  `defaultsApplied` semantic.

### `[x]` **1.3 `destructive-flags.ts` — flag-list constants + detection**

- _Goal:_ Detection function that, given an argv array, returns the matched destructive-flag identifier (or null) for
  refusal-message construction — single source of truth for R5's commit-side and push-side forbidden-flag lists.

- _Outcome:_ Created `src/lib/release/destructive-flags.ts`. Two detectors (`detectCommitDestructive` /
  `detectPushDestructive`) rather than one with a list parameter — keeps the `+refspec` pattern push-only. Refspec
  matches return the canonical `PUSH_REFSPEC_FORCE_IDENTIFIER` (`"+refspec"`) for stable refusal-message lookup; the
  literal argv element varies per invocation and isn't a useful lookup key.

### `[x]` **1.4 `wu-resolution.ts` — active WU lookup with R6 semantics**

- _Goal:_ Resolver that returns either `{ status: "resolved", path, category, name }` for the unambiguous active WU, or
  `{ status: "refused", reason }` carrying disambiguation hint — accepts any `**State:**` value (Planning, In Progress,
  etc.); refuses only on no-candidate or multi-candidate ambiguity.

- _Outcome:_ Created `src/lib/release/wu-resolution.ts`. Lite layout returns `category=""` and `name=""` (the concepts
  don't apply when the active root holds a single `status.md`); under the schema-v1 `AuditWorkUnit` shape pinned in
  Task 1.1, 1.6's audit-log writer maps such empties to `wu: null` and omits an empty `category` under future flat
  layouts (post-work-organization-reform, contributor flat scope). Refusal is a single shape
  (`{status: "refused", hint?: string}`) — both no-candidate and multi-candidate cases map to refusal code 10 at the
  wrapper boundary; the multi-candidate path carries a disambiguation hint, the no-candidate path leaves `hint`
  undefined for the wrapper's default message.

### `[x]` **1.5 Interlock value extension + validation library**

- _Goal:_ Establish the `on-workflow` permissiveness tier across all three interlocks, amend the code 11 payload to
  carry the offending setting + value for specific remediation messages, then deliver `interlock-validation.ts` as the
  single source of truth for the wrapper-scope-vs-permission authorization rule. Also hosts `formatRefusal()` composer
  per F2-E (consistent refusal-message format across 2.1 / 3.2 / 5.1 from day one).

- _Design decisions:_ Trigger-set values capture ascending permissiveness (`manual` < `on-{primary}` <
  `on-workflow`). Wrapper authorization rule: **permission ∩ wrapper-scope ≠ ∅ → authorize, else refuse(11)**.
  Code 11 is defensive backstop against agent invoking wrapper outside configured scope, not primary UX —
  prompt-vs-bypass is the user-facing model. Branch-protection check (`branch.protection: full`) uses `branch.base`
  config as ground truth; both commit and push refuse on direct base-branch ops; `branch.protection: partial` does not
  trigger refusal.

- _Notes:_ See `notes-release-wrappers-foundation.md` § 1.5 for trigger-set ladder, wrapper-scope-vs-permission rule,
  and prompt-vs-bypass framing.

    - `[x]` **1.5.a Extend interlock value unions + consumer audit**

        Added `on-workflow` to `CommitInterlock`, `PushInterlock`, `SyncInterlock` in
        `src/lib/config/resolved-settings.ts`; `*_VALUES` arrays updated in lockstep. `HandoffSyncInterlock` in
        `src/commands/status/types.ts` widened to match (forced by `handlers/status.ts:111` assignability).
        `recommended-summary-line.ts` docstring and session-handoff workflow (package source + `.arc/` mirror)
        updated to recognize `on-workflow` as a sync-ran arm. Existing negative checks (`pushInterlock === "manual"`
        in `handlers/sync.ts`) remain correct under the wider union — both non-manual values fall through to "fire
        push leg." TS exhaustiveness scan found no `switch` cases on these unions across `src/`. Three resolution
        tests added covering commit / push / sync × `on-workflow` via git-config tier.

    - `[x]` **1.5.b Amend `types.ts` for code 11 payload extension**

        Code 11 in `AuthorizationDecision` now carries `setting:` as a discriminated pair (yaml key + typed value)
        for either `session.commit_interlock` (CommitInterlock) or `session.push_interlock` (PushInterlock). Type-only
        change; no behavioral test. Tsc clean.

    - `[x]` **1.5.c Implement `interlock-validation.ts` per wrapper-scope-vs-permission rule**

        Created `src/lib/release/interlock-validation.ts` exporting `authorizeRelease(opts)` (branch-protection
        short-circuits before interlock check) and the `formatRefusal` const. Code 11 messages surface the
        offending setting key+value and point adopters at raw `git` first (harness-prompt path) before
        suggesting `on-workflow` escalation, per the prompt-vs-bypass framing. 19 tests cover commit/push × 3
        values, branch-protection (including short-circuit invariant), and the three-line shape for all six
        refusal codes.

### `[x]` **1.6 `audit-log.ts` — JSONL append + sanitization**

- _Goal:_ Append-only audit-log writer that emits one schema-validated JSONL entry per release-wrapper or sync
  invocation to `.arc/user/{identity}/.internal/.audit-log.jsonl`, with R14 arg-sanitization rules applied at write
  time.

- _Note:_ Schema v1 locked; future bumps require `schemaVersion` increment and reader compatibility per PRD R7.

- _Notes:_ See `notes-release-wrappers-foundation.md` § 1.6 for sanitization edge-case enumeration (attached-value
  forms, multiple `-m`, `--file=path`), error-handling split (schema-throws / I/O-returns), and the schema-validation
  hand-rolled-vs-library decision with revisit triggers.

    - `[x]` **1.6.a Path resolution + `.internal/` bootstrap**

        Created `src/lib/release/audit-log.ts` exporting `resolveAuditLogPath({cwd, identity})`
        (pure path math) and `ensureAuditLogParent({cwd, identity})` (idempotent `mkdir -p` on
        `.arc/user/{identity}/.internal/`). Three tests cover the resolved path string, first-write
        directory creation, and idempotence of repeat calls.

    - `[x]` **1.6.b Args sanitization (R14 rules)**

        `sanitizeArgs(args)` exported from `audit-log.ts`. Three redaction branches: separated
        `-m` / `--message` (consumes next argv as payload), attached-short `-m{value}`, attached-long
        `--message={value}` — all replaced by `<redacted>` with flag shape preserved. Attached-short
        arm guards against `--`-prefixed long flags so `--message-suffix` can't match. `--file` /
        `--file=path`, push remotes/refspecs, and unrelated args fall through verbatim. Ten tests
        cover each redaction branch, the multi-`-m` chain, and the verbatim cases.

    - `[x]` **1.6.c Append + schema-validate entry write**

        `appendAuditEntry({cwd, identity, entry})` exported from `audit-log.ts`. Validates entry first
        (throws on violation — precondition failure surfaced at test time), then composes
        `ensureAuditLogParent` + `appendFile` inside a try/catch that returns `{ok: false, error}` on I/O
        failure. Hand-rolled validator (rationale + revisit triggers in notes § 1.6) is shaped as a
        TS assertion function (`validateEntry(entry: unknown): asserts entry is AuditEntry`) so
        comparisons inside read as honest runtime narrowing rather than casts that fight the type
        system; the same shape sets up cleanly for `arc audit` reading the JSONL back later.
        Enforces: object-shape and required-field types (timestamp, args, interlockState, outcome,
        decision), `schemaVersion === 1`, `command` ∈ {release-commit, release-push, sync},
        `interlockState.command` matches top-level `command`, `outcome.kind` per PRD R7 table
        (release-commit: commit/hook-failed/refused; release-push: push/hook-failed/refused;
        sync: sync/refused), `wu.category` not empty-string, and `decision`↔`refusalCode`
        bidirectional invariant. `validateOutcomeForCommand` uses an exhaustive `switch` with a
        `: never` default so a new `AuditCommand` variant produces a TS error in the validator
        until handled. Helper `toAuditWorkUnit(resolverResult)` co-located in this module maps the
        resolver's `{category, name}` shape to `AuditWorkUnit | null` per Task 1.4's contract
        (lite layout / future-flat-layout / full layout). 21 tests cover round-trip JSON for each
        command, all schema violation paths, the hook-failed allowlist (commit/push allow it, sync
        rejects), the `wu` mapper, and an I/O-failure case (`.internal` pre-existing as a file).
        Tests for this subtask batched rather than strictly one-at-a-time — all hit one writer
        with shared fixture, no independent discovery value per the test-first batching judgment.

---

## **Phase 2:** `arc release commit` handler

_Purpose:_ Wire `arc release commit` end-to-end across two scenario verticals — refusal path (validation chain → exit
code → audit refused entry, never invoke wrapped git) and success path (git invocation → output passthrough → audit
entry).

_Design decisions:_ Handlers live in `src/handlers/release/` per existing convention; public surface re-exports in
`src/commands/release.ts`. Wrapped `git commit` invocation uses `child_process.spawn` with
`stdio: ['inherit', 'pipe', 'pipe']` (verbatim bubbling + captured stdout for hash extraction); validation reads use
existing `GitExec` pattern. Refusal short-circuit order documented in `notes-release-wrappers-foundation.md` § 2.1.

### `[x]` **2.1 Refusal path — validation chain → exit codes 10–13 → audit refused entry**

- _Goal:_ `arc release commit` exits with the correct R4 code for each refusal scenario, prints remediation message via
  `formatRefusal()`, records the refusal as an audit entry, and the wrapped `git commit` invocation never fires.

- _Outcome:_ `runReleaseCommit` orchestrator (`src/handlers/release/commit.ts`) composes the Phase 1 library into the
  cascade with audit-write on every refusal; Commander adapter (`commit-cli.ts`) resolves I/O and delegates. Public
  surface lives in `src/commands/release.ts`; CLI registers `arc release commit` with `allowUnknownOption` +
  variadic `[args...]` for git-arg passthrough. Authorize branch rejects with a Task 2.2 sentinel — refusal-path tests
  never reach it. 16 unit tests cover the four refusal codes, short-circuit ordering (12→10→13→11), audit-entry shape
  with R14-redacted args, and the `spawnGit-never-fires` invariant.

### `[x]` **2.2 Success path — git invocation, audit entry**

- _Goal:_ `arc release commit` invokes `git commit` with forwarded args when authorized, bubbles git output and exit
  code verbatim, and records success or hook-failed audit entry.

- _Outcome:_ Orchestrator authorize branch calls `deps.spawnGit({ args, cwd })`, then attributes the outcome
  (exit 0 → `kind: "commit"` with `resolveHead`-resolved hash; non-zero → `kind: "hook-failed"` with hook
  pattern-matched from captured stdout+stderr — `prepare-commit-msg` checked before `commit-msg` to avoid substring
  shadowing, `pre-commit` next, `unknown` fallback) and writes one `decision: "proceeded"` audit entry. Real impl in
  `commit-cli.ts` runs `spawn('git', ['commit', ...args], { stdio: ['inherit', 'pipe', 'pipe'] })` with both pipes teed
  to the user terminal as captured, and resolves HEAD via `execFileAsync('git', ['rev-parse', 'HEAD'])` for the full
  hash. 6 new tests batched (tightly-coupled behaviors on a single orchestrator branch) cover argv/cwd forwarding,
  audit-entry shape with R14-redacted `-m` payload, hook-attribution priority, `unknown` fallback, and non-zero
  exit-code passthrough — refusal-path `spawnGit-never-fires` invariant from 2.1 preserved.

---

## **Phase 3:** `arc release push` handler

_Purpose:_ Wire `arc release push` end-to-end after widening the shared `pushWorktreeBranch` helper — refusal path (with
pushability matrix → code 14 specifically) and success path.

_Design decisions:_ Signature widen lands first as a prereq parent (3.1) so the test cycle for 3.3 has a stable
substrate. `pushWorktreeBranch` grows `args?: string[]` and `inheritStdio?: boolean` — release-push passes
`inheritStdio: true`; existing call sites (`commands/user/paired-push.ts:114`, `handlers/sync.ts:695`) pass nothing new
and retain capturing behavior. Result callback dropped from R2's signature widen unless a concrete need surfaces (see
`notes-release-wrappers-foundation.md` § 3.1).

### `[x]` **3.1 Widen `pushWorktreeBranch` signature**

- _Goal:_ `pushWorktreeBranch` accepts optional `args?: string[]` passthrough and `inheritStdio?: boolean` for verbatim
  bubbling; existing call sites in `handlers/sync.ts` and `commands/user/paired-push.ts` continue to compile and behave
  unchanged (capture-stdout default).

- _Outcome:_ Two new options on `PushWorktreeBranchOptions`: `args?: readonly string[]` (appended after
  `origin <branch>`) and `inheritStdio?: boolean` (switches to `spawn('git', ['push', ...], { stdio: ['inherit',
  'inherit', 'pipe'] })` with stderr captured + teed to `process.stderr` for refStatus parsing). Result widened
  with `stdout: string, stderr: string` always populated — capture mode pulls both from the executor (surfacing
  `.stdout`/`.stderr` off rejected exec errors when present); inherit-stdio mode populates stderr only.
  Existing call sites (`sync.ts:695`, `paired-push.ts:114`) compile and behave unchanged; `paired-push.test.ts`
  swapped three `.toEqual` → `.toMatchObject` on `result.worktree` since the helper's wider runtime shape now
  flows through the typed-narrower `PairedPushLegOutcome` view. 9 new tests cover args passthrough,
  captured-stream surfacing on exec success and on rejected exec errors, and the inherit-stdio
  delegate/exit-0/non-zero-exit paths.

### `[x]` **3.2 Refusal path — validation + pushability → exit codes 10–14 → audit refused entry**

- _Goal:_ `arc release push` exits with the correct R4 code for each refusal scenario, prints remediation message via
  `formatRefusal()`, records the refusal as an audit entry, and the wrapped push invocation never fires.

- _Outcome:_ Cascade `12 → 10 → 13 → 14 → 11` wired in `runReleasePush`. Pushability gating filters refusal-causing
  conditions (`block` ∪ advisory `force-push-required`; `auto-fixed` passes through). Interlock-validation library
  exposes `checkBranchProtection` (narrowed return: code-13-refuse-or-null) and `checkInterlock` alongside the existing
  `authorizeRelease` so the push cascade can sequence pushability between branch-protection and interlock without
  re-deriving the gates inline; commit cascade keeps `authorizeRelease` unchanged. 26 unit tests cover each refusal
  code, all four short-circuit pairs, and pushability disposition handling.

### `[x]` **3.3 Success path — push invocation, audit entry**

- _Goal:_ `arc release push` invokes `pushWorktreeBranch` with `inheritStdio: true` and passthrough args when
  authorized, bubbles server output verbatim, records success or hook-failed audit entry.

- _Outcome:_ Authorize branch invokes `spawnPush` (branch + argv + cwd) and writes a single `proceeded` audit entry
  — `kind: "push"` with `refStatus` parsed from captured stderr (first whitespace-led `->` line; falls back to
  `"ok"`) on exit 0; `kind: "hook-failed"` with hook attribution (`pre-push` / `server` / `unknown` via stderr
  pattern match) on non-zero. Orchestrator owns `SpawnPushOutcome` (exit code as a first-class field); CLI adapter
  reshapes `pushWorktreeBranch`'s `Error.message`-encoded exit code at the dep boundary so audit attribution doesn't
  depend on parsing the message back. 9 new unit tests cover both refStatus arms, all three hook attributions, and
  the release-push interlockState audit shape.

---

## **Phase 4:** Opt-in state surface

_Purpose:_ Land R10's three sub-commands (`opt-in`, `opt-out`, `status`) plus R13's `--json` envelope.
Minimal primitives only — no harness detection (WU2 scope).

_Design decisions:_ 4.1.a extends `lib/git/exec.ts` with a missing primitive (`gitConfigUnset`) and widens
`gitConfigSet` with explicit scope; 4.1.b/c consume those helpers. `--json` envelope carries `schemaVersion: 1` for
forward-compat per `notes-release-wrappers-foundation.md` § 4.2.

### `[x]` **4.1 `opt-in` / `opt-out` sub-commands**

- _Goal:_ `arc release opt-in` writes `arc.release.enabled: true` to per-developer git config (idempotent on
  repeat); `arc release opt-out` clears the same key (idempotent on absent key); both surface git-config write
  failures with clear remediation messages.

    - `[x]` **4.1.a Extend `lib/git/exec.ts` — `gitConfigUnset` + scoped `gitConfigSet`**

        `gitConfigUnset(exec, key)` added with check-then-unset semantics — `gitConfigGet` pre-check returns
        no-op success on absent keys without invoking `--unset`, so real `--unset` failures propagate for
        4.1.c's handler-level error surfacing. `gitConfigSet` widened with `scope?: GitConfigScope`
        (`"local" | "global" | "system"`); the parameter has no TypeScript default, leaving existing call
        sites flag-free under git's local default while explicit values add `--<scope>`. Both functions plus
        the `GitConfigScope` type re-exported from `src/lib/git/index.ts`. Five tests added in
        `__tests__/unit/git/git.test.ts` — two `gitConfigUnset` paths plus three scope values via `it.each`;
        the no-arg `gitConfigSet` test stays as the behavior-unchanged guard.

    - `[x]` **4.1.b `opt-in` sub-command**

        Orchestrator `runReleaseOptIn` in `src/handlers/release/record.ts` uses check-then-set via
        `gitConfigGet` for idempotence — returns no-op when `arc.release.enabled` is already `"true"`, otherwise
        writes via `gitConfigSet(..., "true", "local")`. Set failures are caught and surfaced through the injectable
        `writeStderr` sink as `Failed to set arc.release.enabled: <git-error>` with non-zero exit. Commander adapter
        `handleReleaseOptIn` wires the real `gitExec`; sub-command registered on `arc release` in
        `src/cli.ts` and re-exported from `src/commands/release.ts`. Three tests in
        `__tests__/unit/handlers/release/record.test.ts` cover the three behaviors.

    - `[x]` **4.1.c `opt-out` sub-command**

        Orchestrator `runReleaseOptOut` in `src/handlers/release/record.ts` mirrors `runReleaseOptIn`'s
        check-then-set shape — returns no-op when `arc.release.enabled` is already `"false"`, otherwise
        writes via `gitConfigSet(..., "false", "local")`. Writing `"false"` (rather than unsetting) keeps
        the per-developer override symmetric: a developer in a project with yaml `release.enabled: true`
        can override out locally without yaml's value re-asserting. Set failures are caught and surfaced
        through the injectable `writeStderr` sink as `Failed to set arc.release.enabled: <git-error>` with
        non-zero exit. Commander adapter `handleReleaseOptOut` wires the real `gitExec`; sub-command
        registered on `arc release` in `src/cli.ts` and re-exported from `src/commands/release.ts`. Tests
        in `__tests__/unit/handlers/release/record.test.ts` cover the symmetric behaviors.

### `[x]` **4.2 `arc release status` sub-command + `--json` envelope**

- _Goal:_ `arc release status` prints the resolved opt-in state and three interlock states with provenance
  (`git-config` / `yaml` / `default`); `--json` mode emits the same surface as a `schemaVersion: 1` envelope for
  downstream consumers (WU2 status integration, future CI use).

- _Outcome:_ Orchestrator `runReleaseStatus` in `src/handlers/release/record.ts` takes a pre-resolved
  `ResolvedSettingsResult` and renders four `<key>: <value> (<source>)` lines or a `schemaVersion: 1` envelope
  under `--json`. `releaseEnabled` is converted from the resolver's `"true"` / `"false"` string to a JSON
  boolean at the envelope boundary so downstream consumers get native types. Adapter `handleReleaseStatus`
  streams `resolveAllSettings` warnings to stderr to keep `--json` stdout pure; sub-command registered with
  `--json` flag in `src/cli.ts` and re-exported from `src/commands/release.ts`. Four tests in
  `__tests__/unit/handlers/release/record.test.ts` cover human rendering, JSON envelope shape, provenance
  threading across all three sources, and the boolean-conversion contract.

---

## **Phase 5:** Sync audit-log retrofit + probe surface

_Purpose:_ Fold `arc sync` invocations under the audit-log umbrella (R7) and migrate the session-init config envelope to
three-tier resolution so downstream WU2 routing reads resolved values without re-probing.

_Design decisions:_ 5.2 is the broader retrofit per F5-A — `runConfigSessionInitStatus` switches from yaml-only
`readConfigSettings` to three-tier `resolveAllSettings` for the full release-mode key surface (commit/push/sync
interlock + notes_push + release.enabled). Latent inconsistency (handlers see resolved values; envelope shows yaml
only) gets fixed; PRD's "config-once at session-init" model now matches code.

### `[x]` **5.1 `arc sync` audit-log integration**

- _Goal:_ Every executed `arc sync` invocation emits one audit-log entry — success cells carry `outcome.kind: "sync"`
  with matrix-cell name and per-leg results; refused cells map onto R4's refusal taxonomy via `refusalCode`; entries
  validate against `schemaVersion: 1`.

- _Outcome:_ `handleSync` writes one audit entry per executed invocation via the new `writeSyncAuditEntry` helper
  in `src/handlers/sync.ts`; refused cells split `decision: "refused"` + `refusalCode: 14` from `outcome.exitCode`
  (process exit stays at 1 for back-compat). Tests in `__tests__/unit/sync-orchestrator.test.ts` cover all reachable
  matrix cells, skip paths (identity-absent / no-arc-project / dry-run), the I/O-failure sidecar invariant
  (audit failure leaves `process.exitCode` untouched), and schema round-trip through the real `appendAuditEntry`.
  Cleanup folded: dead `(worktree=push, notes=save+notes-blocked) → "worktree-push+notes-blocked"` branch removed
  from `cellNameFor` (unreachable since `50e880ca`; constraint comment documents the
  `WORKTREE_PUSH_BLOCK_STATES` / `NOTES_BLOCK_WORKTREE_STATES` asymmetry). Pre-existing planning-artifact `§`
  citations across four other test files captured to `ATOMIC-INBOX.md` for sweep + future-prevention design.

### `[x]` **5.2 Migrate session-init config envelope to three-tier resolution**

- _Goal:_ Session-init envelope's `config.value.settings` carries resolved values (git-config → yaml → default) for the
  full release-mode key surface — `commit_interlock`, `push_interlock`, `sync_interlock`, `notes_push`,
  `release.enabled` — eliminating the latent yaml-only / handler-resolved inconsistency. WU2's downstream workflow
  routing reads resolved values without re-probing.

    - `[x]` **5.2.a Confirm 1.2 resolver-additions landed**
        - `resolveAllSettings` parallel-resolves `releaseEnabled` and includes it in `resolved`
          (`resolved-settings.ts:297,303,329`)
        - `ResolvedReleaseModeSettings` exported with all five release-mode fields; already
          consumed by `handlers/release/record.ts` and covered in `resolved-settings.test.ts`

    - `[x]` **5.2.b Migrate `runConfigSessionInitStatus` to `resolveAllSettings`**
        - `commands/config/status.ts` switched from `readConfigSettings` to `resolveAllSettings`;
          `SESSION_INIT_KEYS` and `ConfigSessionInitSettings` extended by `user.notes_push` and
          `release.enabled` (10 → 12 keys). Live `arc status --session-init --json` confirms shape.
        - `ConfigSessionInitOptions` gained optional `exec` / `readFile` for test DI; default
          callers (`handlers/config.ts`, session-init probe wiring) unchanged via `{ cwd }`.
        - Integration tests in `config.test.ts` updated for the 12-key shape; new test pins
          git-config override winning over yaml across all five release-mode keys. Invalid-yaml
          test flipped from "yaml-only verbatim" to "warn-and-fall-back" since validation now
          rides through the resolver.

    - `[x]` **5.2.c Regression coverage for existing envelope consumers**
        - New orchestration-level test in `status.test.ts` pins the agent-readable envelope path:
          `runSessionInitStatus` carries git-config overrides through to
          `result.config.value.settings.<release-mode-key>` for all five keys without any
          consumer-side re-probe. Closes the gap that 5.2.b's probe-direct test left at the
          orchestrator boundary.
        - Existing 13 status orchestration tests pass unchanged; full suite (1405 unit + 56
          integration/e2e) green after the migration.

---

## **Phase 6:** Documentation + ADR

_Purpose:_ Deliver R11 doc updates, R12 ADR, and apply R15 if drift surfaced during P0 work.

_Design decisions:_ ADR lands first so the trust framing stabilizes before the adopter-facing docs cite it. ADR is
internal-only (no package-source counterpart per § Architecture Documentation); other docs follow package-project sync
direction (package source primary, `.arc/` mirror).

### `[x]` **6.1 ADR-017: defense-in-depth at harness vs ARC layer**

- _Goal:_ ADR in `.arc/reference/adr/` formalizes the trust-model trade-off with all six R12 content sections — adopters
  and future contributors can reason about the bypass property and its mitigations without reverse-engineering it from
  code.

- _Outcome:_ ADR-017 written at `.arc/reference/adr/adr-017-release-wrapper-trust-model.md`. R12's six content sections
  map onto the standard ADR template per `notes-release-wrappers-foundation.md` § 6.1 — trade-off table, gap/mitigation
  pairs, and sync precedent in Context; trust-model framing and bypass universality in Decision; mitigations and risks
  in Consequences; alternatives close it out. Tier 1 markdown lint clean.

### `[x]` **6.2 DEV-RULES.ARC, QUICK-REFERENCE, AGENT-BRIEF.ARC updates**

- _Goal:_ Adopter-facing documentation accurately reflects release-wrapper invocation paths — DEV-RULES.ARC § Commit
  Discipline names the wrapper as authorized invocation; QUICK-REFERENCE lists all five new commands; AGENT-BRIEF.ARC
  names the wrapper as canonical commit/push shape under workflow guidance when active.

- _Note:_ Per § Package-Project Sync, methodology edits go through package source first; `.arc/` counterparts mirror.
  Pre-commit hook warns on `.arc/`-only edits without staged package counterpart.

    - Files (package-source primary):
        - `packages/arc-framework/arc/reference/constitution/DEV-RULES.ARC.md`
        - `packages/arc-framework/arc/reference/QUICK-REFERENCE.template.md` (note `.template.md` suffix)
        - `packages/arc-framework/arc/system/briefs/AGENT-BRIEF.ARC.md`
    - Files (mirror to `.arc/`):
        - `.arc/reference/constitution/DEV-RULES.ARC.md`
        - `.arc/reference/QUICK-REFERENCE.md`
        - `.arc/system/briefs/AGENT-BRIEF.ARC.md`

    - `[x]` **6.2.0 Rename release-mode opt-in CLI verbs + make opt-out symmetric**

        Surfaced during 6.2 doc-writing — the original `record-enabled` / `record-disabled` verbs
        underdelivered on the per-developer-override scope, and `record-disabled` actually unset the local
        key (so a developer in a project with yaml `release.enabled: true` couldn't override out — yaml
        re-asserted). Renamed CLI commands to `arc release opt-in` / `arc release opt-out`, functions to
        `runReleaseOptIn` / `runReleaseOptOut` plus their `handleReleaseOptIn` / `handleReleaseOptOut`
        Commander adapters, shared type alias to `RunReleaseOptDeps` / `RunReleaseOptResult`. Changed
        opt-out to write `"false"` explicitly via the same check-then-set shape as opt-in — the
        per-developer override is now symmetric. Code: `record.ts`, `commands/release.ts`, `cli.ts`,
        `record.test.ts`. Docs: QUICK-REFERENCE x2, PRD R10 + § Architecture placement,
        `plan-release-wrappers-ergonomics.md`, this task list (4.1 metadata + 6.2.b outcome reference).
        Git-config key (`arc.release.enabled`) and yaml key (`release.enabled`) unchanged. `gitConfigUnset`
        lib helper retained as a general-purpose primitive (no current consumer). Tier 2 gates clean
        (lint:ts, typecheck, 1462 tests).

    - `[x]` **6.2.a DEV-RULES.ARC § Commit Discipline addition**

        New `Release-wrapper invocation` bullet inserted between `Push triggering` and `Merge to integration / main`,
        with two sub-points: (a) `arc release commit` / `arc release push` are an authorized invocation path
        and validate + audit unconditionally; (b) `arc.release.enabled: true` plus harness allowlist entries adds
        the per-invocation harness-prompt bypass, with the canonical invocation shape forward-referenced to
        AGENT-BRIEF.ARC (6.2.c). Edit went through package source first; `.arc/` mirror is byte-identical.

    - `[x]` **6.2.b QUICK-REFERENCE new commands section**

        New `### Release Wrappers` subsection added to `## ARC CLI Commands`, between Session State Portability
        and Atomic Work History. Lists all five commands (`arc release commit` / `push` / `opt-in` /
        `opt-out` / `status [--json]`) with comment-prefixed bash examples matching the section's
        existing convention; one closing paragraph names refusal codes 10–14 and the audit-log path, and
        cross-references DEV-RULES.ARC § Commit Discipline for the trust model. Edit through package source
        first (`QUICK-REFERENCE.template.md`); `.arc/` mirror diverges only in link style (template inline,
        instance reference-style, with new `[dev-rules-arc]` ref appended).

    - `[x]` **6.2.c AGENT-BRIEF.ARC release-wrapper invocation shape**

        Single bullet added under `## How ARC Works` (peer to Session lifecycle / Work pipeline / Methods
        and extensions / Quality gates) naming `arc release commit` / `arc release push` as the canonical
        commit/push invocation shape when active and pointing at DEV-RULES.ARC § Commit Discipline for the
        rule. Concurrent trim to that DEV-RULES.ARC bullet (6.2.a's contribution) drops the audit-log path
        detail, refusal-code mention, and forward-ref to AGENT-BRIEF.ARC — applies the session-init lens
        (every-session load context = rule + orientation only; reference detail routes to QUICK-REFERENCE
        and on-demand strategy docs). Edits through package source first; both `.arc/` mirrors byte-identical.

### `[ ]` **6.3 Refusal-message template harmonization** (conditional)

- _Goal:_ Verify refusal-message format consistency at end of P0 work; if drift surfaced (call sites bypassed the
  `formatRefusal()` helper from 1.5), reconcile to shared format.

- _Note:_ Per F2-E, `formatRefusal()` was stubbed in 1.5 from the start; Phases 2 / 3 / 5.1 use it. By end of Phase 5,
  drift = whether any refusal-message call site bypassed the helper. If uniform → mark `[~]` superseded by 1.5's helper;
  if drift → reconcile via single edit pass through call sites.

### `[ ]` **6.4 ADR-018: interlock value extension — trigger-set model + wrapper-scope-vs-permission rule**

- _Goal:_ ADR formalizes the design rationale captured during 1.5 — the trigger-set permissiveness ladder
  (`manual` < `on-{primary}` < `on-workflow`), the wrapper-scope-vs-permission authorization rule, and the
  prompt-vs-bypass UX framing with two-layered (mechanical wrapper / agent judgment) trust model.

- _Note:_ Distinct from ADR-017 (trust-model trade-off / harness-bypass property). ADR-017 covers _whether_
  defense-in-depth applies; ADR-018 covers _how_ the wrapper-side authorization works once the user opts in.
  Both internal-only per § Architecture Documentation.

- _Notes:_ Source content in `notes-release-wrappers-foundation.md` § 1.5 — three sections (trigger-set ladder,
  authorization rule, prompt-vs-bypass framing) graduate to ADR.

- **Strategies:** strategy-adr-methodology.md

    - File: `.arc/reference/adr/adr-018-interlock-value-extension.md`

### `[x]` **6.5 Sweep meta-project references + strengthen pre-commit CHECK 9**

- _Goal:_ Remove DEV-RULES.ARC § Documentation Boundaries violations from the WU's existing code/tests and close the
  regex gap in CHECK 9 that let them ship. Both halves are needed: a clean surface eliminates the priming that drives
  recurring session drift; the strengthened hook prevents recurrence.

- _Note:_ Existing violations predate the meta-ref rule's broadening at commits `b5f55c51` and `f3fda6e8`. CHECK 9's
  current regex misses `PRD R\d+`, bare `[RB]\d+`, and section-symbol citations (`§`), and exempts test files
  entirely. The test exemption is protective of legitimate fixture data (parsers consuming
  `Context: tasks-foo.md (Task 4.2)` literal strings) and is preserved via tiered patterns.

    - Files:
        - `.arc/system/githooks/pre-commit` (and `packages/arc-framework/arc/system/githooks/pre-commit` mirror)
        - `.arc/system/arc-config.yml` (and package-source mirror)
        - `packages/arc-framework/src/lib/release/wu-resolution.ts`
        - `packages/arc-framework/src/lib/release/audit-log.ts`
        - `packages/arc-framework/src/lib/release/destructive-flags.ts`
        - `packages/arc-framework/__tests__/unit/release/wu-resolution.test.ts`
        - `packages/arc-framework/__tests__/unit/release/audit-log.test.ts`
        - `packages/arc-framework/__tests__/unit/release/destructive-flags.test.ts`
        - `packages/arc-framework/__tests__/unit/handlers/release/commit.test.ts`
        - `packages/arc-framework/__tests__/unit/sync.test.ts`

    - `[x]` **6.5.a Strengthen pre-commit CHECK 9 with tiered patterns**

        Tiered regex implemented in `.arc/system/githooks/pre-commit` (and package-source mirror): strict patterns
        (`PRD R[0-9]+`, `\b[RB][0-9]+\b`, and `§` followed by space) apply to all staged code including tests, with
        `META-PRD` lines filtered as a known false positive; broad patterns (existing `[Tt]ask [0-9]+\.[0-9]+`,
        `[Pp]hase [0-9]+`, `\.arc/` plus new movable-artifact `(tasks|plan|prd|status|notes|atomic)-[a-z][a-z0-9-]+\.md`)
        skip test files via existing `hooks.test_patterns`, preserving parser-test fixture data. New
        `hooks.strict_meta_ref_patterns` config key added to both arc-config.yml copies; this project's override of
        broad continues to drop `\.arc/`. Live-probed against synthetic src and test files: strict caught in both,
        broad caught only in src, `META-PRD` and Context-footer fixture lines correctly bypassed.

    - `[x]` **6.5.b Sweep meta-project references**

        24 sites cleaned across the 8 files (3 src, 5 test): PRD R-codes, bare requirement-ID R/B numerals,
        section-symbol citations, movable-artifact cross-references (`notes-{...}.md`), and a `Task 2.2` mention now
        describe what the code does or what each test verifies. Three lines of legitimate test fixture data
        (`tasks-sample.md` inside status-file body strings, `.arc/active/.../status-foo.md` inside path fixtures)
        preserved by the broad-tier test exemption from 6.5.a — exactly the case the tiered design protects. All
        quality gates pass; strengthened CHECK 9 stages cleanly on the swept content.

---

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` Every refusal scenario in R4 produces documented exit code + message + audit entry (codes 10–14 across
  `arc release commit` and `arc release push`)
- `[ ]` Every success scenario passes through to git unchanged with correct audit entry shape
- `[ ]` Audit log captures every release-wrapper invocation and every executed `arc sync` invocation with correct
  `decision` and `outcome`
- `[ ]` Audit log entries are parseable by `jq` and queryable by `refusalCode`
- `[ ]` `arc release commit --version` runs from Claude Code and Codex CLI with manual allowlist entries installed (no
  harness prompt for matching invocations)
- `[ ]` Sample fall-through case (env-prefixed invocation, e.g., `FOO=bar arc release commit`) verifies the documented
  Codex matcher boundary holds — adopter sees the harness prompt
- `[ ]` Session-init envelope's `config.value.settings` carries resolved values for the full release-mode key surface
  (eliminates latent yaml-only / handler-resolved inconsistency)
- `[ ]` ADR-017 documents the trust model with all six R12-required content sections
- `[ ]` Documentation updates land in package source first, mirrored to `.arc/`
- `[ ]` All quality gates pass (tests, linting, type checking, markdown linting, build)
- `[ ]` Ready for integration

[verify-work-unit]: ../../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md
