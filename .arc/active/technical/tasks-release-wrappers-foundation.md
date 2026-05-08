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

### `[ ]` **2.2 Success path — git invocation, audit entry**

- _Goal:_ `arc release commit` invokes `git commit` with forwarded args when authorized, bubbles git output and exit
  code verbatim, and records success or hook-failed audit entry.

- _Note:_ Resolve settings once at handler entry; thread the resolved `{value, source}` map through validation and
  audit-entry write. Avoids two round-trips and prevents drift between read sites.

    - File: `src/handlers/release/commit.ts`
    - Wrapped invocation: `child_process.spawn('git', ['commit', ...args], { stdio: ['inherit', 'pipe', 'pipe'] })` —
      captures stdout for hash extraction, inherits stdin and stderr for verbatim user output. Stderr also captured if
      hook-failure attribution needs parsing.
    - Audit entry written post-git regardless of outcome (success → `kind: "commit"`; hook failure →
      `kind: "hook-failed"`)

    Build `test-first` (one behavior at a time):
    - Validation passes → forwards args to `git commit`, bubbles output and exit code verbatim
    - Success → audit entry `{ kind: "commit", hash }` (hash extracted from spawned stdout or via `git rev-parse HEAD`
      post-success)
    - Hook failure → bubble git's non-zero exit code, audit entry `{ kind: "hook-failed", hook, exitCode }`

---

## **Phase 3:** `arc release push` handler

_Purpose:_ Wire `arc release push` end-to-end after widening the shared `pushWorktreeBranch` helper — refusal path (with
pushability matrix → code 14 specifically) and success path.

_Design decisions:_ Signature widen lands first as a prereq parent (3.1) so the test cycle for 3.3 has a stable
substrate. `pushWorktreeBranch` grows `args?: string[]` and `inheritStdio?: boolean` — release-push passes
`inheritStdio: true`; existing call sites (`commands/user/paired-push.ts:114`, `handlers/sync.ts:695`) pass nothing new
and retain capturing behavior. Result callback dropped from R2's signature widen unless a concrete need surfaces (see
`notes-release-wrappers-foundation.md` § 3.1).

### `[ ]` **3.1 Widen `pushWorktreeBranch` signature**

- _Goal:_ `pushWorktreeBranch` accepts optional `args?: string[]` passthrough and `inheritStdio?: boolean` for verbatim
  bubbling; existing call sites in `handlers/sync.ts` and `commands/user/paired-push.ts` continue to compile and behave
  unchanged (capture-stdout default).

- _Note:_ Result callback (mentioned in PRD R2) dropped from signature widen — caller can
  `await result; auditLog(result)` inline. Revisit if a concrete need surfaces during impl.

    - File: `src/lib/git/push-worktree.ts`

    Build `test-first` (one behavior at a time):
    - `args` passthrough — provided args are appended to `git push origin <branch>`
    - `inheritStdio: true` — wrapped invocation switches to `child_process.spawn` with stdio inheritance; stderr
      captured for refStatus parsing
    - `inheritStdio: false` (default) / unset — existing capturing behavior preserved
    - Existing call sites (no new args) — behavior unchanged; existing tests pass

### `[ ]` **3.2 Refusal path — validation + pushability → exit codes 10–14 → audit refused entry**

- _Goal:_ `arc release push` exits with the correct R4 code for each refusal scenario, prints remediation message via
  `formatRefusal()`, records the refusal as an audit entry, and the wrapped push invocation never fires.

- _Note:_ Pushability advisory `force-push-required` always refuses (never auto-passes), inheriting the contract from
  `pushability.ts`'s preamble.

- _Notes:_ See `notes-release-wrappers-foundation.md` § 3.2 for `runPushabilityStatus` invocation parameters and
  disposition handling (block / advisory / auto-fixed).

    - Files: `src/handlers/release/push.ts`, `src/cli.ts` (`push` sub-command on `arc release`)
    - Code 15 omitted (reserved-for-empirical per F2-B)
    - Refusal short-circuit order: 12 → 10 → 13 → 14 → 11 (cheapest → most-expensive I/O)

    Build `test-first` (one behavior at a time):
    - Code 12 (destructive-flag) — each push-forbidden flag (`--force`, `-f`, `--force-with-lease`, `+refspec`,
      `--delete`, `-d`, `--mirror`) refuses + audit
    - Code 10 (no-active-wu)
    - Code 13 (branch-protection-violation)
    - Code 14 (pushability-precheck-failed) — each `runPushabilityStatus` blocking condition (`rebase-in-progress`,
      `detached-head`, `no-upstream-branch`, `worktree-not-aligned-with-origin`, advisory `force-push-required`) refuses
    - Code 14 — `auto-fixed` disposition (e.g., `missing-notes-refspec`) does NOT refuse (passes through; defensive —
      won't surface for `target: "worktree"` anyway)
    - Code 11 (interlock-not-authorized)
    - All refusal paths: wrapped push never fires

### `[ ]` **3.3 Success path — push invocation, audit entry**

- _Goal:_ `arc release push` invokes `pushWorktreeBranch` with `inheritStdio: true` and passthrough args when
  authorized, bubbles server output verbatim, records success or hook-failed audit entry.

- _Notes:_ See `notes-release-wrappers-foundation.md` § 3.3 for hook-fail vs server-reject distinction (stderr pattern
  matching) and `refStatus` capture strategy.

    - File: `src/handlers/release/push.ts`

    Build `test-first` (one behavior at a time):
    - Validation + pushability pass → push fires via 3.1's widened helper with passthrough args
    - Success → audit entry `{ kind: "push", refStatus }` (refStatus parsed from captured stderr)
    - Hook failure (pre-push) → bubble git's non-zero exit code, audit entry
      `{ kind: "hook-failed", hook: "pre-push", exitCode }`
    - Server reject (e.g., non-fast-forward) → audit entry
      `{ kind: "hook-failed", hook: "server" | "unknown", exitCode }` (best-effort attribution)

---

## **Phase 4:** Opt-in state surface

_Purpose:_ Land R10's three sub-commands (`record-enabled`, `record-disabled`, `status`) plus R13's `--json` envelope.
Minimal primitives only — no harness detection (WU2 scope).

_Design decisions:_ 4.1.a extends `lib/git/exec.ts` with a missing primitive (`gitConfigUnset`) and widens
`gitConfigSet` with explicit scope; 4.1.b/c consume those helpers. `--json` envelope carries `schemaVersion: 1` for
forward-compat per `notes-release-wrappers-foundation.md` § 4.2.

### `[ ]` **4.1 `record-enabled` / `record-disabled` sub-commands**

- _Goal:_ `arc release record-enabled` writes `arc.release.enabled: true` to per-developer git config (idempotent on
  repeat); `arc release record-disabled` clears the same key (idempotent on absent key); both surface git-config write
  failures with clear remediation messages.

    - Files: `src/handlers/release/record.ts`, `src/cli.ts` (sub-command registration on `arc release`)
    - Adds `gitConfigUnset` and widened `gitConfigSet` to `src/lib/git/exec.ts` per 4.1.a

    - `[ ]` **4.1.a Extend `lib/git/exec.ts` — `gitConfigUnset` + scoped `gitConfigSet`**

        Build `test-first` (one behavior at a time):
        - `gitConfigUnset(exec, key)` — key present → unsets via `git config --unset <key>`
        - `gitConfigUnset(exec, key)` — key absent → returns no-op success (no error thrown)
        - `gitConfigSet` widened: optional `scope?: "local" | "global" | "system"` parameter, default `"local"`
        - Existing `gitConfigSet` call sites (no scope arg) — behavior unchanged

    - `[ ]` **4.1.b `record-enabled` sub-command**

        Build `test-first` (one behavior at a time):
        - First invocation writes `arc.release.enabled = true` to local git config
        - Second invocation is no-op success (key already set to `true`; re-write is idempotent)
        - git-config write failure surfaces with message naming the key and underlying git error

    - `[ ]` **4.1.c `record-disabled` sub-command**
        - _Note:_ Idempotent on never-enabled state — check-then-unset (`gitConfigGet` returns undefined → no-op
          success).

        Build `test-first` (one behavior at a time):
        - First invocation (key present) unsets `arc.release.enabled`
        - Second invocation (key absent) is no-op success
        - First-time invocation when never enabled — succeeds silently
        - git-config unset failure surfaces with message naming the key and underlying git error

### `[ ]` **4.2 `arc release status` sub-command + `--json` envelope**

- _Goal:_ `arc release status` prints the resolved opt-in state and three interlock states with provenance
  (`git-config` / `yaml` / `default`); `--json` mode emits the same surface as a `schemaVersion: 1` envelope for
  downstream consumers (WU2 status integration, future CI use).

- _Note:_ Consumes `ResolvedConfigOverride<...>` shape from 1.2's resolver (`releaseEnabled`, plus existing
  release-mode keys via `resolveAllSettings`).

    - File: `src/handlers/release/record.ts` (shared with 4.1)

    Build `test-first` (one behavior at a time):
    - Human output renders all four resolved values with provenance label (e.g.,
      `commit_interlock: on-task-approval (yaml)`)
    - `--json` envelope shape:

        ```json
        {
          "schemaVersion": 1,
          "releaseEnabled": { "value": "...", "source": "..." },
          "commitInterlock": { "value": "...", "source": "..." },
          "pushInterlock":   { "value": "...", "source": "..." },
          "syncInterlock":   { "value": "...", "source": "..." }
        }
        ```

    - Provenance threading distinguishes git-config override from yaml default from hardcoded default
    - `arc.release.enabled` resolved as boolean-shaped value (`"true"` / `"false"` string from resolver, surfaced as
      boolean `true` / `false` in envelope)

---

## **Phase 5:** Sync audit-log retrofit + probe surface

_Purpose:_ Fold `arc sync` invocations under the audit-log umbrella (R7) and migrate the session-init config envelope to
three-tier resolution so downstream WU2 routing reads resolved values without re-probing.

_Design decisions:_ 5.2 is the broader retrofit per F5-A — `runConfigSessionInitStatus` switches from yaml-only
`readConfigSettings` to three-tier `resolveAllSettings` for the full release-mode key surface (commit/push/sync
interlock + notes_push + release.enabled). Latent inconsistency (handlers see resolved values; envelope shows yaml
only) gets fixed; PRD's "config-once at session-init" model now matches code.

### `[ ]` **5.1 `arc sync` audit-log integration**

- _Goal:_ Every executed `arc sync` invocation emits one audit-log entry — success cells carry `outcome.kind: "sync"`
  with matrix-cell name and per-leg results; refused cells map onto R4's refusal taxonomy via `refusalCode`; entries
  validate against `schemaVersion: 1`.

- _Note:_ Sync's process exit code stays at 1 for backwards compatibility; only the audit-log entry adopts the
  release-wrapper taxonomy. Existing `outcome.exitCode` flows into audit entry verbatim; `refusalCode` added separately
  for refused cells.

- _Notes:_ See `notes-release-wrappers-foundation.md` § 5.1 for full sync-cell → refusal-code mapping table and per-path
  audit-entry timing decisions (identity-absent, no-arc-project, dry-run, execute).

    - File: `src/handlers/sync.ts` (augmented to call `lib/release/audit-log.ts` from 1.6)

    Build `test-first` (one behavior at a time):
    - Each non-refused matrix cell (`paired-push`, `worktree-only`, `notes-only`, `save-only`, `notes-prompt`,
      `worktree+notes-prompt`, `worktree-push+notes-blocked`, `notes-blocked`) → audit entry with
      `outcome.kind: "sync"`, correct `cell` name, per-leg results, `exitCode`
    - Refused cells (all six `blocked-*` varieties) → entry with `decision: "refused"` and
      `refusalCode: "pushability-precheck-failed"` (code 14)
    - `interlockState` field carries `{pushInterlock, notesPush, syncInterlock}` snapshot per sync's command
      discriminator
    - Schema validation — every entry parses against `schemaVersion: 1`
    - Identity-absent / no-arc-project / dry-run paths skip audit-entry write (documented gaps)

### `[ ]` **5.2 Migrate session-init config envelope to three-tier resolution**

- _Goal:_ Session-init envelope's `config.value.settings` carries resolved values (git-config → yaml → default) for the
  full release-mode key surface — `commit_interlock`, `push_interlock`, `sync_interlock`, `notes_push`,
  `release.enabled` — eliminating the latent yaml-only / handler-resolved inconsistency. WU2's downstream workflow
  routing reads resolved values without re-probing.

- _Note:_ `defaultsApplied` semantics preserved (means "yaml-absent"); consumers needing true source-provenance check
  `resolved.<key>.source === "default"`. See `notes-release-wrappers-foundation.md` § 5.2.

    - Files: `src/commands/config/status.ts` (`runConfigSessionInitStatus`), potentially `src/commands/config/types.ts`
      (envelope shape if `source` field is exposed)

    - `[ ]` **5.2.a Confirm 1.2 resolver-additions landed**
        - Verify `resolveAllSettings` returns `releaseEnabled` in `resolved`
        - Verify `ResolvedReleaseModeSettings` extension is consumable

    - `[ ]` **5.2.b Migrate `runConfigSessionInitStatus` to `resolveAllSettings`**

        Build `test-first` (one behavior at a time):
        - Probe envelope's `session.commit_interlock` / `push_interlock` / `sync_interlock` / `user.notes_push` reflect
          git-config override when set, yaml otherwise, default otherwise
        - Probe envelope includes `release.enabled` resolved value
        - Probe envelope shape preserves backwards-compat for non-release-mode keys (`session.remote_sync` etc. still
          yaml-only)
        - `defaultsApplied` reflects yaml-absence (existing semantic)

    - `[ ]` **5.2.c Regression coverage for existing envelope consumers**

        Build `test-first` (one behavior at a time):
        - Workflow-method consumers (session-init.md `config.value.settings.session.*`) see resolved values without
          re-probing
        - Existing session-init integration tests pass with resolved values substituted for yaml-only

---

## **Phase 6:** Documentation + ADR

_Purpose:_ Deliver R11 doc updates, R12 ADR, and apply R15 if drift surfaced during P0 work.

_Design decisions:_ ADR lands first so the trust framing stabilizes before the adopter-facing docs cite it. ADR is
internal-only (no package-source counterpart per § Architecture Documentation); other docs follow package-project sync
direction (package source primary, `.arc/` mirror).

### `[ ]` **6.1 ADR-017: defense-in-depth at harness vs ARC layer**

- _Goal:_ ADR in `.arc/reference/adr/` formalizes the trust-model trade-off with all six R12 content sections — adopters
  and future contributors can reason about the bypass property and its mitigations without reverse-engineering it from
  code.

- _Note:_ ADR is internal-only — ships only to `.arc/reference/adr/`; no package-source counterpart per § Architecture
  Documentation in DEV-RULES.PROJECT.

- _Notes:_ See `notes-release-wrappers-foundation.md` § 6.1 for R12 six-section → standard ADR template integration
  mapping.

- **Strategies:** strategy-adr-methodology.md

    - File: `.arc/reference/adr/adr-017-release-wrapper-trust-model.md`
    - Required content per R12: trust-model trade-off table, gap rows + mitigations, pre-existing precedent (sync's same
      shell-pattern-gate boundary), trust-model framing (opt-in controls harness behavior, not wrapper behavior), bypass
      universality

### `[ ]` **6.2 DEV-RULES.ARC, QUICK-REFERENCE, AGENT-BRIEF.ARC updates**

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

    - `[ ]` **6.2.a DEV-RULES.ARC § Commit Discipline addition**

    - `[ ]` **6.2.b QUICK-REFERENCE new commands section**

    - `[ ]` **6.2.c AGENT-BRIEF.ARC release-wrapper invocation shape**

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
