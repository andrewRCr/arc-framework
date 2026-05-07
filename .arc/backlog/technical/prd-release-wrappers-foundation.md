# PRD: Interlock-Release Wrappers — Foundation

**Purpose:** Deliver the mechanical foundation for `arc release commit` and `arc release push` —
wrapper commands that enforce ARC interlock state at the CLI boundary, with the validation library,
audit log, authorization footer, and opt-in state surface needed for end-to-end use by
hand-configured adopters.

---

## Introduction

ARC's interlock mechanisms (`commit_interlock`, `push_interlock`, `sync_interlock`) govern *when* the
agent should release a commit or push. The model works — agents follow it, users get the
predictability they signed up for. But the interlock governs only the agent's *decision* to attempt
the operation. The actual `git commit` / `git push` invocation runs as a generic shell command,
which means the harness's permission system gates it independently.

For users who configure their harness to prompt on git mutating operations, this produces redundant
friction: ARC's interlock authorizes the operation, then the harness re-prompts. The user has
already made the trust decision at the interlock layer; the harness prompt adds nothing and breaks
flow.

This work delivers the **mechanical foundation** of the interlock-release wrapper system: two new
CLI commands under a `release` namespace, the shared validation library they call, the audit log,
the authorization footer, and the opt-in state recording surface that lets hand-configured early
adopters validate the system end-to-end. Adopter ergonomics — setup helper, per-harness workflow,
status integration — land in a sibling work unit (WU2).

**Why now:** pre-1.0 polish window for git surface UX. The recent `user-sync-ux` integration
(Phase 2 paired-push, Phase 3.1 resolver consolidation) established the seams this work builds on.
Building on landed work is cheaper than retrofitting later.

## Goals

1. **Deliver `arc release commit` and `arc release push` end-to-end functional.** Hand-configured
   adopters can install harness allowlist entries manually and have the wrapper carry the
   authorization weight from there.
2. **Encode interlock state as mechanical CLI-boundary enforcement.** Workflow guidance becomes
   mechanical guarantee for the modeled failure modes (no active WU, interlock not authorized,
   destructive flag, branch protection).
3. **Make wrapper invocations forensically traceable.** Per-invocation audit log entries; opt-in
   commit-message footer for distributed traceability.
4. **Expose the per-developer opt-in state surface.** Bypass-mode recording, status reporting, and
   clearing — minimal ergonomics so footer behavior and posture-aware downstream features can
   validate end-to-end before WU2 lands.
5. **Preserve scope discipline.** Commit and push only; no slippery slope to higher-blast-radius
   git operations.

## System Scenarios

**S1 — Hand-configured early adopter (Claude Code).**
Adopter wants the friction-reduction benefit. Manually edits `.claude/settings.json` to add
`Bash(arc release commit:*)` and `Bash(arc release push:*)` to the allowlist. Runs
`git config arc.release.bypass-active true`. From the next session forward,
`arc release commit` invocations match the allowlist (no harness prompt), wrapper validates
interlock state, commit lands; audit log entry recorded; if `release.footer: full` is set, footer
trailer appears in commit message.

**S2 — Wrapper refuses on missing active WU.**
Agent invokes `arc release commit` with no resolved active WU. Wrapper exits with code 10
(`no-active-wu`) and a verbose message explaining that no status file resolved in `.arc/active/`.
Audit log records the refusal with `refusalCode: "no-active-wu"`. No commit attempted.

**S3 — Wrapper refuses destructive flag.**
Agent (confused) invokes `arc release push --force`. Wrapper detects `--force`, exits with code 12
(`destructive-flag`), prints message identifying the flag and recommending raw `git push` for
force-push intent. Audit log records refusal with refused-flag detail. No push attempted.

**S4 — Wrapper authorizes; pre-commit hook rejects.**
Agent invokes `arc release commit -m "fix: foo"`. Wrapper validates: WU resolved, interlock state
authorizes, no destructive flag. Wrapper invokes `git commit`; pre-commit hook fails (markdown
lint violation). Wrapper bubbles git's exit code; audit log records `outcome: { kind: "hook-failed",
hook: "pre-commit", exitCode: 1 }`. User fixes lint and re-invokes.

**S5 — Push-side pushability pre-check fails.**
Agent invokes `arc release push` on a branch mid-rebase. Wrapper calls `runPushabilityStatus`;
matrix returns blocking condition. Wrapper exits with code 14 (`pushability-precheck-failed`);
message identifies the blocking condition and remediation. Audit log records refusal with
pushability detail.

**S6 — Footer in bypass mode.**
Adopter has `release.footer: full` in arc-config.yml and `arc.release.bypass-active: true` in
personal git config. `arc release commit -m "..."` succeeds; resulting commit carries an
`Arc-Release: bypass=true ...` trailer appended after any existing `Context:` trailer. Adopter
without bypass mode active sees no trailer regardless of config setting.

**S7 — Planning-branch session commits.**
On a planning branch (`**State:** Planning`, `**Task List:** [none]`), agent invokes
`arc release commit` for a plan revision. Wrapper resolves the active status file regardless of
State, validates interlock, commit lands. Planning ceremony commits and task-execution commits
flow through the same authorization path.

## Requirements

### P0 — must-have

**R1 — `arc release commit` command.**
Wraps `git commit`. Validates WU resolution, interlock state, branch protection, destructive
flags. Forwards remaining args to `git commit`. Bubbles git output verbatim. Refusals exit with
codes 10–15 per refusal taxonomy (R4).

**R2 — `arc release push` command.**
Wraps `git push` (worktree-leg only; cross-leg orchestration remains in `arc sync`). Validates as
R1, plus pushability pre-check via `runPushabilityStatus`. Builds on `pushWorktreeBranch` helper
in `lib/git/`; widens its signature to accept passthrough `args?: string[]` and an optional
result callback for audit logging. Refuses destructive flags per R5. Bubbles server output
verbatim.

**R3 — Interlock-validation library.**
Shared module both wrappers call. Resolves interlock-state via existing `resolveAllSettings` /
`resolveGitConfigOverride<T>` from `lib/config/`. Single source of truth for "is this commit/push
currently authorized." Available for downstream consumers (status reporter, audit-log writer).

**R4 — Refusal taxonomy.**
Stable error codes 10–15 with identifiers and verbose messages explaining remediation. JSON
`--json` mode emits structured envelope with `errorCode` field.

| Code | Identifier | Trigger |
| ---- | ---------- | ------- |
| 10 | `no-active-wu` | No resolvable status file in `.arc/active/`, or multiple-candidate ambiguity |
| 11 | `interlock-not-authorized` | Current interlock state doesn't permit this op |
| 12 | `destructive-flag` | Wrapper-forbidden flag (per R5) |
| 13 | `branch-protection-violation` | Op targets a protected base under `branch.protection` |
| 14 | `pushability-precheck-failed` | Push matrix returned blocking condition |
| 15 | `arg-grammar-fallthrough` | Invocation shape wouldn't allowlist-match (informational refuse) |

**R5 — Destructive-flag refusal lists.**

`arc release commit` refuses:

- `--amend` (always — wrapper's value is single-decision-point for *new* commits; amends use raw
  git)
- `--allow-empty` (smell signal; raw-git for empty-commit intent)
- `--no-verify` (already forbidden by DEV-RULES.ARC; mechanical enforcement here)

`arc release push` refuses:

- `--force` / `-f`
- `--force-with-lease` (even "safer" force; ARC-released force-pushes never auto-pass)
- `+refspec` syntax (e.g., `+main:main`)
- `--delete` / `-d`
- `--mirror`

**R6 — "Active WU" resolution semantics.**
Wrapper resolves any status file in `.arc/active/` regardless of `**State:**` (Planning,
In Progress, etc.). Refuses only when no status file resolves. Multiple-candidate state refuses
with `no-active-wu` and a disambiguation hint pointing to session-init disambiguation.

**R7 — Audit log.**
Append-only JSONL at `.arc/user/{identity}/.internal/.audit-log.jsonl`. One entry per
invocation. Schema (v1):

```json
{
  "schemaVersion": 1,
  "timestamp": "2026-05-07T21:34:52.242Z",
  "command": "release-commit",
  "args": ["-m", "<redacted>"],
  "wu": { "category": "technical", "name": "release-wrappers-foundation" },
  "interlockState": { "commitInterlock": "on-task-approval", "pushInterlock": "on-handoff" },
  "decision": "proceeded",
  "refusalCode": null,
  "outcome": { "kind": "commit", "hash": "abc1234" }
}
```

Local-only by default; gitignored. Per-identity, never replicated to remote without explicit
opt-in.

**R8 — Authorization footer (configurable, opt-in, bypass-only).**

- Per-developer setting via `git config arc.releaseFooter`: `off | abbreviated | full`. Falls
  back to project yaml default `release.footer:` if unset; falls back to hardcoded default `off`
  if neither set. Resolved via `resolveGitConfigOverride<T>`.
- Footer appears in commit message **only when bypass mode is active** (see R10) AND mode is
  non-`off`. Triple opt-in chain: wrapper used + bypass-mode active + footer mode non-off.
- `abbreviated` form: `Arc-Release: bypass`.
- `full` form: `Arc-Release: bypass=true commit-interlock=<value> push-interlock=<value>
  wu=<category>/<name>`.
- Trailer appended after existing trailers (e.g., after `Context:`).

**R9 — Wrapper × git-hook interaction.**
Wrapper invokes `git` normally; hooks fire as usual. On hook failure: bubble git's exit code
unchanged; audit log records `outcome: { kind: "hook-failed", hook: <name>, exitCode: <n> }`.
No retry. Hook output passes through unchanged.

**R10 — Bypass-mode opt-in state recording (minimal surface).**

Three sub-commands under the `release` namespace:

- `arc release record-enabled` — writes `arc.release.bypass-active: true` to per-developer git
  config.
- `arc release record-disabled` — clears the same config key.
- `arc release status` — prints current bypass state, resolved footer mode, resolved interlock
  states.

These are minimal primitives only — they record/report state, they do not detect or write
harness configs (deferred to WU2 setup helper). Their existence in WU1 is what lets footer alt-C
be end-to-end-validatable before WU2 lands.

**R11 — Documentation updates.**

- `DEV-RULES.ARC` § Commit Discipline: note wrapper as authorized invocation path.
- `QUICK-REFERENCE`: new commands.
- `AGENT-BRIEF.ARC`: wrapper commands as canonical commit/push invocation shape under workflow
  guidance (when active).

**R12 — ADR.**
ADR documenting the methodology decision: defense-in-depth at harness layer vs. ARC layer.
Trust-model trade-off table; gap rows; mitigations. Internal-only, in `reference/adr/`.

### P1 — should-have

**R13 — `arc release status --json` envelope.**
Structured output for downstream consumers (future status integration in WU2; potential CI use).

**R14 — Audit log args sanitization rules formalized.**
Document what gets redacted and how (commit message bodies replaced with `<redacted>`; `--file`
paths kept; remote URLs kept). Avoids ad-hoc redaction drift.

### P2 — nice-to-have

**R15 — Refusal-message template harmonization.**
Shared format for refusal messages: identifier line, what-happened sentence, remediation hint.
Increases scanability when adopter hits multiple refusals.

## Non-Goals

- **Other git operations** (`rebase`, `reset`, `revert`, `checkout`, `cherry-pick`, etc.).
  Constitutional scope-line.
- **Cross-leg orchestration** (paired worktree+notes push). Lives in `arc sync`; wrapper is
  single-leg.
- **Quality gate hook logic.** Hooks remain authoritative for what-passed-validation; wrapper
  handles who-authorized.
- **Setup helper / per-harness detection / config-write logic.** WU2 scope.
- **Workflow integration that prefers wrapper over raw git.** WU2 scope (deferred so WU2 can
  land `process-task-loop` / `session-handoff` updates as a coherent unit with the setup
  helper).
- **Status integration / session-init orientation surfacing.** WU2 scope.
- **Strategy doc.** WU2 scope (lands with adopter-facing setup guides).
- **Auto-enable in any harness by default.** Adopter must explicitly opt in (manually for
  WU1; via setup helper in WU2).
- **opencode auto-allowlist.** Deferred to upstream resolution.
- **Server-side enforcement.** Purely client-side wrapper.
- **Replacing the `arc-commit` skill.** Skill remains the orchestration layer; wrapper is the
  invocation primitive.

## Technical Considerations

### Dependency on `user-sync-ux` (resolved)

`user-sync-ux` is integrated and archived. Specific reuse points verified:

- **`resolveGitConfigOverride<T>`** in `src/lib/config/resolve-override.ts` — generic resolver.
  R8's footer setting and R3's interlock state both resolve via this. No adaptation needed.
- **`resolveAllSettings`** convenience aggregator — reads and resolves all session-relevant
  settings; wrapper calls this at invocation start.
- **`pushWorktreeBranch`** in `src/lib/git/push-worktree.ts` — current signature
  `{ exec, branch }`. R2 widens with optional `args?: string[]` and result callback; existing
  call sites pass nothing new (backwards compatible).
- **`runPushabilityStatus`** in `src/lib/git/pushability.ts` — pre-push validation matrix.
  R2 calls this before invoking the push helper.
- **`force-push-required` advisory** documented in `pushability.ts` preamble — wrapper inherits
  the contract: advisory disposition refuses with explicit message, never auto-passes.

### Architecture placement

Wrapper command handlers in `src/commands/release/`:

- `commit.ts` — handler for `arc release commit`.
- `push.ts` — handler for `arc release push`.
- `record.ts` — handlers for `record-enabled` / `record-disabled` / `status`.

Validation library in `src/lib/release/`:

- `interlock-validation.ts` — interlock-state resolution + authorization decision.
- `destructive-flags.ts` — flag-list constants and detection.
- `wu-resolution.ts` — active WU lookup with R6 semantics.
- `audit-log.ts` — JSONL append + sanitization.
- `footer.ts` — trailer composition + bypass-mode lookup.

Shared types in `src/lib/release/types.ts` — refusal codes, decision shapes, audit entry schema.

### Refusal-code → exit-code mapping

Block exit codes 10–15 reserved for wrapper refusals. Codes 10–11 are "ARC-state refusals"
(no WU, interlock). Codes 12–13 are "input refusals" (destructive flag, branch protection).
Codes 14–15 are "environment/grammar refusals" (pushability, arg-grammar-fallthrough). Avoid 0
(success), 1 (generic error), 64–78 (sysexits territory). Document the block reservation in the
strategy doc (deferred to WU2) and inline in the refusal-codes module.

### Audit log path resolution

`{identity}` resolves via existing `resolveUserIdentity()` in `lib/git/identity.ts`. `.internal/`
directory created on first audit-log write (existence-tolerant). Schema v1 lock in WU1; future
schema bumps require `schemaVersion` increment + reader compatibility.

### Footer composition with existing `Context:` trailer

`Context:` trailer convention is established in this repo. Wrapper appends `Arc-Release:` after
any existing trailers. Implementation: read commit message draft, parse trailer block (last
paragraph if `Key: value` lines), append new trailer key. If no trailer block, append a blank
line + new trailer. Avoids mangling pre-existing trailers including multi-line values.

### Bypass-mode signal source

`arc.release.bypass-active` per-developer git-config key. Read at wrapper invocation; controls
footer-stamping gate. Set/cleared by R10 sub-commands. WU2's setup helper will write this key
automatically as part of its enable flow; for WU1, hand-configured adopters set it manually.

### Quality-gate hooks remain orthogonal

Wrapper enforces *who authorized* (interlock state). Pre-commit/pre-push hooks enforce *what
passed validation* (gate state). The two compose cleanly: hooks fire on every commit/push
regardless of whether `arc release` or raw `git` produced the invocation. Gate-dispatch design
lives in the separate `plan-quality-gate-hooks` work.

### Args sanitization for audit log

- `-m` / `--message` payloads → replaced with `<redacted>` (preserves arg shape, hides
  content).
- `--file` paths → kept (path itself is not sensitive; content lives in file system).
- Remote URLs (push) → kept (operationally useful; no credentials embedded by convention).
- All other args → kept verbatim.

Formal rule list lives in code comments with cross-reference to this section.

### Testing posture

Treat as security-tier code per plan's risk analysis. Exhaustive matrix coverage:

- Refusal taxonomy × invocation context (each refusal scenario has a passing integration test).
- Bypass-mode state × footer mode × interlock state (footer composition correctness).
- Wrapper × hook-failure interaction (audit-log entry correctness, exit-code bubbling).

No convenience-helper coverage shortcuts. The wrapper is what stands between an authorized
adopter and a misauthorized commit landing without harness review — the test bar matches that
weight.

## Success Criteria

### Behavioral

- All P0 requirements pass behavioral verification: every refusal scenario produces the
  documented exit code + message + audit entry; every success scenario passes through to git
  unchanged.
- Audit log captures every wrapper invocation with correct decision and outcome; schema
  validates.
- Footer behavior under each `release.footer` setting × bypass-mode state × commit-interlock
  state matrix produces expected output.
- Wrapper invocations under each `commit_interlock` and `push_interlock` value produce the
  expected authorize/refuse decision.

### Empirical

- `arc release commit --version` runs from Claude Code and Codex CLI with manual allowlist
  entries installed; no harness prompt for matching invocations. Re-runs against the
  then-current Claude Code and Codex versions at WU1 verification.
- Sample fall-through case (env-prefixed invocation, e.g., `FOO=bar arc release commit`)
  verifies that the documented Codex matcher boundary holds — adopter sees the harness prompt,
  not silent allowlist match.

### Forensic

- Audit log entries are parseable by `jq`; refusal entries are queryable by `refusalCode`;
  success entries report commit hash or push ref status correctly.

### Code quality

- Test matrices above pass with no skipped scenarios.
- Type checking, lint, and build pass per project quality gates (DEV-RULES.PROJECT).
- No ad-hoc redaction or refusal-message drift between handlers (R14, R15 enforced).

## Open Questions

### Resolve before starting

- **Footer key name finalization.** `Arc-Release` proposed. Alternatives: `Authorized-By`,
  `Release`. Decide pre-implementation; locks the trailer convention.

### Resolve during work

- **Refusal-message template harmonization (R15).** Trial during P0 implementation; if drift
  starts to surface, adopt the harmonized template before P0 closeout.
- **Bypass-mode signal source consolidation.** Currently per-developer git-config. If WU2's
  setup helper finds a reason to record state elsewhere (e.g., a state file with timestamp /
  audit), revisit; for now, git-config is the cheapest correct surface.
- **Codex matcher empirical re-verification cadence.** Plan flagged that codex-cli upstream may
  broaden the accepted grammar. Re-run the empirical check against the then-current codex-cli
  at WU1 verification; if upstream has shifted, update the documented fall-through cases
  inline.
