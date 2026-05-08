# PRD: Interlock-Release Wrappers — Foundation

**Purpose:** Deliver the mechanical foundation for `arc release commit` and `arc release push` —
release-wrapper commands that enforce ARC interlock state at the CLI boundary, with the validation
library, audit log, and opt-in state surface needed for end-to-end use by hand-configured adopters.

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

This work delivers the **mechanical foundation** of the interlock-release-wrapper system: two new
CLI commands under a `release` namespace, the shared validation library they call, the audit log
(extended to cover `arc sync`), and the opt-in state recording surface that lets hand-configured
early adopters validate the system end-to-end. Adopter ergonomics — setup helper, per-harness
workflow, status integration — land in a sibling work unit (WU2).

**Note on the push-side primitive.** `arc release commit` is a per-task primitive — high-frequency,
direct invocation by every commit-time flow. `arc release push` is a **ceremony push primitive** —
its primary consumers are workflow ceremonies (work-unit activation, planning-branch activation,
recovery flows). The common-case **handoff push continues to flow through `arc sync`**, which is
folded under the same audit-log umbrella in this work (R7). The single-leg `arc release push`
exists for the ceremony cases that need a single push primitive without paired notes-leg
orchestration.

**Why now:** pre-1.0 polish window for git surface UX. The recent `user-sync-ux` integration
(Phase 2 paired-push, Phase 3.1 resolver consolidation) established the seams this work builds on.
Building on landed work is cheaper than retrofitting later.

## Goals

1. **Deliver `arc release commit` and `arc release push` end-to-end functional.** Hand-configured
   adopters can install harness allowlist entries manually and have the release wrapper carry the
   authorization weight from there. `arc release commit` is the per-task commit primitive;
   `arc release push` is the ceremony push primitive (activation, recovery), with handoff push
   continuing to flow through `arc sync`.
2. **Encode interlock state as mechanical CLI-boundary enforcement.** Workflow guidance becomes
   mechanical guarantee for the modeled failure modes (no active WU, interlock not authorized,
   destructive flag, branch protection).
3. **Make release-wrapper and `arc sync` invocations forensically traceable.** Per-invocation
   audit log entries across the three operations that cross the harness shell-pattern-gate
   boundary.
4. **Expose the per-developer opt-in state surface.** Enabled-state recording, status reporting,
   and clearing — minimal ergonomics so the opt-in flag (consumed by the probe for downstream
   workflow routing) can be set and verified end-to-end before WU2 lands.
5. **Preserve scope discipline.** Commit and push only; no slippery slope to higher-blast-radius
   git operations.

## System Scenarios

**S1 — Hand-configured early adopter (Claude Code).**
Adopter wants the friction-reduction benefit. Manually edits `.claude/settings.json` to add
`Bash(arc release commit:*)` and `Bash(arc release push:*)` to the allowlist. Runs
`git config arc.release.enabled true`. From the next session forward,
`arc release commit` invocations match the allowlist (no harness prompt), the release wrapper
validates interlock state, commit lands; audit log entry recorded.

**S2 — Release wrapper refuses on missing active WU.**
Agent invokes `arc release commit` with no resolved active WU. Release wrapper exits with code
10 (`no-active-wu`) and a verbose message explaining that no status file resolved in
`.arc/active/`. Audit log records the refusal with `refusalCode: "no-active-wu"`. No commit
attempted.

**S3 — Release wrapper refuses destructive flag.**
Agent (confused) invokes `arc release push --force`. Release wrapper detects `--force`, exits
with code 12 (`destructive-flag`), prints message identifying the flag and recommending raw
`git push` for force-push intent. Audit log records refusal with refused-flag detail. No push
attempted.

**S4 — Release wrapper authorizes; pre-commit hook rejects.**
Agent invokes `arc release commit -m "fix: foo"`. Release wrapper validates: WU resolved,
interlock state authorizes, no destructive flag. Release wrapper invokes `git commit`;
pre-commit hook fails (markdown lint violation). Release wrapper bubbles git's exit code;
audit log records `outcome: { kind: "hook-failed", hook: "pre-commit", exitCode: 1 }`. User
fixes lint and re-invokes.

**S5 — Push-side pushability pre-check fails.**
Agent invokes `arc release push` on a branch mid-rebase. Release wrapper calls
`runPushabilityStatus`; matrix returns blocking condition. Release wrapper exits with code 14
(`pushability-precheck-failed`); message identifies the blocking condition and remediation.
Audit log records refusal with pushability detail.

**S6 — Planning-branch session commits.**
On a planning branch (`**State:** Planning`, `**Task List:** [none]`), agent invokes
`arc release commit` for a plan revision. Release wrapper resolves the active status file
regardless of State, validates interlock, commit lands. Planning ceremony commits and
task-execution commits flow through the same authorization path.

**S7 — `arc sync` audit-log entry.**
At handoff, `arc sync` runs paired worktree+notes push. Audit log records the invocation:
`command: "sync"`, `decision: "proceeded"`, `outcome.kind: "sync"` carrying matrix-cell name
and per-leg results. Forensic record parallels release-commit / release-push entries; sync's
authorization decision (resolve `pushInterlock`, dispatch matrix) is traceable on the same
surface.

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
Shared module both release wrappers call. Resolves interlock-state via existing
`resolveAllSettings` / `resolveGitConfigOverride<T>` from `lib/config/`. Single source of truth
for "is this commit/push currently authorized." Available for downstream consumers (status
reporter, audit-log writer).

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

- `--amend` (always — release wrapper's value is single-decision-point for *new* commits;
  amends use raw git)
- `--allow-empty` (smell signal; raw-git for empty-commit intent)
- `--no-verify` (already forbidden by DEV-RULES.ARC; mechanical enforcement here)

`arc release push` refuses:

- `--force` / `-f`
- `--force-with-lease` (even "safer" force; ARC-released force-pushes never auto-pass)
- `+refspec` syntax (e.g., `+main:main`)
- `--delete` / `-d`
- `--mirror`

**R6 — "Active WU" resolution semantics.**
Release wrapper resolves any status file in `.arc/active/` regardless of `**State:**` (Planning,
In Progress, etc.). Refuses only when no status file resolves. Multiple-candidate state refuses
with `no-active-wu` and a disambiguation hint pointing to session-init disambiguation.

**R7 — Audit log.**
Append-only JSONL at `.arc/user/{identity}/.internal/.audit-log.jsonl`. One entry per
invocation. Covers `arc release commit`, `arc release push`, **and `arc sync`** — all
operations that cross the harness shell-pattern-gate boundary by invoking git via Node
`child_process` (the underlying git command never surfaces to a shell-pattern-based gate).
Schema (v1):

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

`command` discriminator: `release-commit` | `release-push` | `sync`.

`outcome.kind` shapes by command:

- `commit` — `{ kind: "commit", hash: "<sha>" }` (release-commit success)
- `push` — `{ kind: "push", refStatus: "<status>" }` (release-push success)
- `sync` — `{ kind: "sync", cell: "<matrix-cell-name>", worktree: "<leg-result>",
  notes: "<leg-result>", exitCode: <n> }` (sync; mirrors `SyncOutcome` shape from
  `handlers/sync.ts`)
- `hook-failed` — `{ kind: "hook-failed", hook: "<name>", exitCode: <n> }`
  (release-commit / release-push hook rejection)
- `refused` — entry's `decision: "refused"` with `refusalCode` populated; `outcome` may be
  omitted or carry refusal-specific detail (e.g., refused-flag name)

Sync's refusal codes map onto the release-wrapper refusal taxonomy (R4) where applicable —
diverged-
or remote-ahead-block ≈ `pushability-precheck-failed` (14); detached-HEAD or no-remote
similarly. Sync's `interlockState` field carries the existing `{pushInterlock, notesPush,
syncInterlock}` snapshot (the shape `handleSync` already constructs).

Local-only by default; gitignored. Per-identity, never replicated to remote without explicit
opt-in.

**R9 — Release-wrapper × git-hook interaction.**
Release wrapper invokes `git` normally; hooks fire as usual. On hook failure: bubble git's exit
code unchanged; audit log records `outcome: { kind: "hook-failed", hook: <name>, exitCode: <n> }`.
No retry. Hook output passes through unchanged.

**R10 — Release-wrapper opt-in state recording (minimal surface).**

Three sub-commands under the `release` namespace:

- `arc release record-enabled` — writes `arc.release.enabled: true` to per-developer git
  config.
- `arc release record-disabled` — clears the same config key.
- `arc release status` — prints current opt-in state, resolved interlock states.

These are minimal primitives only — they record/report state, they do not detect or write
harness configs (deferred to WU2 setup helper). Their existence in WU1 is what lets
hand-configured adopters set the opt-in flag (consumed by the probe surface) end-to-end
before WU2 lands.

**R11 — Documentation updates.**

- `DEV-RULES.ARC` § Commit Discipline: note release wrapper as authorized invocation path.
- `QUICK-REFERENCE`: new commands.
- `AGENT-BRIEF.ARC`: release-wrapper commands as canonical commit/push invocation shape under
  workflow guidance (when active).

**R12 — ADR.**
ADR documenting the methodology decision: defense-in-depth at harness layer vs. ARC layer.
Internal-only, in `reference/adr/`. Required content:

- **Trust-model trade-off table.** Layered protection before vs. after release-wrapper opt-in.
- **Gap rows.** What's lost when the harness gate is bypassed for release-wrapper invocations.
- **Mitigations.** Per gap, the corresponding mitigation (interlock validation, audit log
  coverage, release-wrapper test-coverage tier).
- **Pre-existing precedent.** `arc sync` already crosses the same shell-pattern-gate boundary
  today — by invoking `git push` via Node `child_process`, the underlying invocation never
  surfaces to shell-pattern-based harness gates. The release wrappers formalize what has been
  true (and uncontroversial) for sync. Sync's audit-log coverage in this work (R7) closes the
  corresponding forensic gap symmetrically — sync becomes the first retrofitted citizen of
  the release-wrapper authorization umbrella, not a pre-existing gap left un-addressed.
- **Trust-model framing.** Adopter opt-in (allowlist entries + `arc.release.enabled: true`)
  controls **whether the harness prompts**. The release wrapper's authorization-carrying
  property — validation and audit log — is **unconditional** once the release wrapper is
  invoked. Opt-in state controls harness behavior, not release-wrapper
  behavior.
  Documentation must hold this line to avoid the "I turned it off but it still does things"
  confusion: there is no off switch on validation or audit logging, only on harness
  prompting.
- **Bypass universality.** The shell-pattern-gate bypass property is structural to any CLI
  that invokes git as a library — not a release-wrapper-specific quirk. Future arc commands
  that invoke git internally inherit the same property; the release wrapper's contribution
  is the authorization scaffolding around it, not the bypass itself.

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
- **Cross-leg orchestration** (paired worktree+notes push). Lives in `arc sync`; release
  wrapper is single-leg. (Sync joins the release-wrapper authorization umbrella forensically
  via R7 audit-log coverage, but its matrix-decision logic stays in `handlers/sync.ts`.)
- **Quality gate hook logic.** Hooks remain authoritative for what-passed-validation; the
  release wrapper handles who-authorized.
- **Setup helper / per-harness detection / config-write logic.** WU2 scope.
- **Workflow integration that prefers release wrapper over raw git.** WU2 scope (deferred so
  WU2 can land `process-task-loop` / `session-handoff` updates as a coherent unit with the
  setup helper).
- **Status integration / session-init orientation surfacing.** WU2 scope. (Session-init probe
  surfacing of `arc.release.enabled` for routing decisions is in WU1 — see Technical
  Considerations § Probe surface — but the orientation-summary line that announces
  release-wrapper-active state is WU2.)
- **Strategy doc.** WU2 scope (lands with adopter-facing setup guides).
- **Auto-enable in any harness by default.** Adopter must explicitly opt in (manually for
  WU1; via setup helper in WU2).
- **opencode auto-allowlist.** Deferred to upstream resolution.
- **Server-side enforcement.** Purely client-side release wrapper.
- **Replacing the `arc-commit` skill.** Skill remains the orchestration layer; release wrapper
  is the invocation primitive.

## Technical Considerations

### Dependency on `user-sync-ux` (resolved)

`user-sync-ux` is integrated and archived. Specific reuse points verified:

- **`resolveGitConfigOverride<T>`** in `src/lib/config/resolve-override.ts` — generic resolver.
  R3's interlock state resolves via this. No adaptation needed.
- **`resolveAllSettings`** convenience aggregator — reads and resolves all session-relevant
  settings; release wrapper calls this at invocation start.
- **`pushWorktreeBranch`** in `src/lib/git/push-worktree.ts` — current signature
  `{ exec, branch }`. R2 widens with optional `args?: string[]` and result callback; existing
  call sites pass nothing new (backwards compatible).
- **`runPushabilityStatus`** in `src/lib/git/pushability.ts` — pre-push validation matrix.
  R2 calls this before invoking the push helper.
- **`force-push-required` advisory** documented in `pushability.ts` preamble — release wrapper
  inherits the contract: advisory disposition refuses with explicit message, never auto-passes.

### Architecture placement

Release-wrapper command handlers in `src/commands/release/`:

- `commit.ts` — handler for `arc release commit`.
- `push.ts` — handler for `arc release push`.
- `record.ts` — handlers for `record-enabled` / `record-disabled` / `status`.

Validation library in `src/lib/release/`:

- `interlock-validation.ts` — interlock-state resolution + authorization decision.
- `destructive-flags.ts` — flag-list constants and detection.
- `wu-resolution.ts` — active WU lookup with R6 semantics.
- `audit-log.ts` — JSONL append + sanitization. **Consumed by both release-wrapper handlers
  and `handlers/sync.ts`** (for sync-leg audit entries per R7).

Shared types in `src/lib/release/types.ts` — refusal codes, decision shapes, audit entry schema.

### Refusal-code → exit-code mapping

Block exit codes 10–15 reserved for release-wrapper refusals. Codes 10–11 are "ARC-state
refusals" (no WU, interlock). Codes 12–13 are "input refusals" (destructive flag, branch
protection). Codes 14–15 are "environment/grammar refusals" (pushability, arg-grammar-
fallthrough). Avoid 0 (success), 1 (generic error), 64–78 (sysexits territory). Document the
block reservation in the strategy doc (deferred to WU2) and inline in the refusal-codes module.

`arc sync`'s existing refusal exits (currently `process.exitCode = 1` for blocked-cell paths)
map onto the same code block where applicable when audit-logged: diverged- or remote-ahead-
block records `refusalCode: "pushability-precheck-failed"` (14). Sync's actual process exit
code remains 1 for backwards compatibility — only the audit-log entry adopts the
release-wrapper taxonomy.

### Audit log path resolution

`{identity}` resolves via existing `resolveUserIdentity()` in `lib/git/identity.ts`. `.internal/`
directory created on first audit-log write (existence-tolerant). Schema v1 lock in WU1; future
schema bumps require `schemaVersion` increment + reader compatibility.

### Release-wrapper opt-in signal source

`arc.release.enabled` per-developer git-config key. Records the adopter's explicit opt-in to
the trust-model trade-off; read by the session-init probe (see § Probe surface) for downstream
WU2 workflow routing. Has no direct effect on WU1 wrapper invocations — they run
unconditionally; opt-in state is observability and downstream-routing substrate. Set/cleared
by R10 sub-commands. WU2's setup helper writes it as part of its enable flow; for WU1,
hand-configured adopters set it manually.

### Probe surface for routing decisions

Session-init probe surfaces `arc.release.enabled` alongside the other resolved settings
(`commit_interlock`, `push_interlock`, etc.) so workflows can branch on it without re-probing
at each push site. Probe-time resolution is the same model as `commit_interlock` today:
config-once at session-init, branch-many at workflow-author time.

WU2 owns the workflow integration (`activate-work-unit`, `activate-planning-branch`, etc.
branch on `arc.release.enabled` to choose `arc release push` vs raw `git push`). WU1's
contribution is the probe-side surfacing — the field is available in the session-init
envelope; consumer workflows are WU2.

### Two-axis configuration mental model

Two **independent** config dimensions govern push-side behavior. Adopters reason about each
separately:

| Axis                  | Question                                           | Values                          |
| --------------------- | -------------------------------------------------- | ------------------------------- |
| `push_interlock`      | **WHEN** does the agent fire a push?               | `manual / on-handoff / on-sync` |
| `arc.release.enabled` | **HOW** is a push invocation shaped when it fires? | `true / false`                  |

The 2×3 matrix is fully populated — every cell is coherent. Documentation in WU2 must hold
this distinction: interlock controls the trigger; opt-in controls the transport. Don't
describe `arc.release.enabled` as a "push handling option" — describe it as the
release-wrapper opt-in flag.

### Quality-gate hooks remain orthogonal

Release wrapper enforces *who authorized* (interlock state). Pre-commit/pre-push hooks
enforce *what passed validation* (gate state). The two compose cleanly: hooks fire on every
commit/push regardless of whether `arc release` or raw `git` produced the invocation.
Gate-dispatch design lives in the separate `plan-quality-gate-hooks` work.

### Args sanitization for audit log

- `-m` / `--message` payloads → replaced with `<redacted>` (preserves arg shape, hides
  content).
- `--file` paths → kept (path itself is not sensitive; content lives in file system).
- Remote URLs (push) → kept (operationally useful; no credentials embedded by convention).
- All other args → kept verbatim.

Formal rule list lives in code comments with cross-reference to this section.

### Testing posture

Treat as security-tier code per plan's risk analysis. Exhaustive matrix coverage:

- Refusal taxonomy × invocation context (each refusal scenario has a passing integration
  test).
- Release-wrapper × hook-failure interaction (audit-log entry correctness, exit-code
  bubbling).
- Sync × audit-log integration (every matrix cell records the expected audit entry shape;
  refused-cell entries carry the right `refusalCode`; success-cell entries carry the right
  `outcome.kind: "sync"` shape).

No convenience-helper coverage shortcuts. The release wrapper is what stands between an
authorized adopter and a misauthorized commit landing without harness review — the test bar
matches that weight.

## Success Criteria

### Behavioral

- All P0 requirements pass behavioral verification: every refusal scenario produces the
  documented exit code + message + audit entry; every success scenario passes through to git
  unchanged.
- Audit log captures every release-wrapper invocation **and every `arc sync` invocation**
  with correct decision and outcome; schema validates across all three command discriminators.
- Release-wrapper invocations under each `commit_interlock` and `push_interlock` value produce
  the expected authorize/refuse decision.
- Sync's matrix-cell decisions surface in audit-log entries with correct `outcome.kind: "sync"`
  shape per cell.

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

### Resolve during work

- **Refusal-message template harmonization (R15).** Trial during P0 implementation; if drift
  starts to surface, adopt the harmonized template before P0 closeout.
- **Release-wrapper opt-in signal source consolidation.** Currently per-developer git-config
  (`arc.release.enabled`). If WU2's setup helper finds a reason to record state elsewhere
  (e.g., a state file with timestamp / audit metadata), revisit; for now, git-config is the
  cheapest correct surface.
- **Codex matcher empirical re-verification cadence.** Plan flagged that codex-cli upstream may
  broaden the accepted grammar. Re-run the empirical check against the then-current codex-cli
  at WU1 verification; if upstream has shifted, update the documented fall-through cases
  inline.

### Documentation discipline (locked at WU1; carried into WU2)

- **Terminology.** Use **`release`** as the short form (command names, config keys, code
  paths) and **`release-wrapper`** / **`release wrappers`** as the full nominal form when
  introducing or distinguishing the concept. Avoid bare "wrapper" — too generic, conflates
  with other wrapping concepts in the codebase. Apply across PRDs, plans, ADR, strategy
  doc, AGENT-BRIEF, DEV-RULES, QUICK-REFERENCE, and workflow docs.
