# ADR-017: Define the Release-Wrapper Trust Model

## Status

Accepted

## Context

ARC's interlock vocabulary (`commit_interlock`, `push_interlock`, `sync_interlock`) governs *when* the agent
decides to release a commit or push. [ADR-016][adr-016] formalized that model. The interlock is workflow-level
guidance, not enforcement: once the agent decides to invoke `git commit`, the actual invocation runs as a
generic shell command and crosses the harness's shell-pattern-gate boundary on its way to the OS.

That boundary is what harnesses like Claude Code and Codex CLI use to gate mutating operations. The harness
matches an invocation's argv prefix against an allowlist; when no rule matches, the harness prompts the user
before letting the command run. The pattern works well for raw git (the user sees `git commit` and decides) but
produces redundant friction once ARC's interlock is also in play — the user has already made the trust decision
at the interlock layer, and the harness prompt re-asks.

The release-wrapper foundation work introduces `arc release commit` and `arc release push` — wrapper commands
that resolve the interlock state, walk a refusal cascade, and either invoke the wrapped git operation via
Node's `child_process.spawn` or refuse with an exit code 10–14 and an audit-log entry. Hand-configured adopters
add allowlist entries for the wrapper commands (e.g., `Bash(arc release commit:*)`) and set
`arc.release.enabled: true` to record the opt-in. Once configured, the harness's allowlist matches the wrapper's
argv prefix and the per-invocation harness prompt does not fire — the wrapper itself becomes the per-invocation
trust boundary.

The wrapper's own validation is unconditional. The agent invokes the wrapper; the wrapper resolves all
release-mode settings once via `resolveAllSettings` and walks a short-circuit cascade (12 destructive-flag → 10
no-active-WU → 13 branch-protection → 14 pushability → 11 interlock-not-authorized — push inserts 14 between 13
and 11; commit skips 14). Each refusal exits with the matched code, prints a `formatRefusal()` message, and
writes a `decision: "refused"` audit entry. Refusals never invoke git. A successful invocation writes a
`decision: "proceeded"` audit entry capturing the resolved interlock state, sanitized argv, active-WU pointer,
and outcome (commit hash / push refStatus / hook-failed). The validation library, audit log, and refusal-code
surface are documented in `prd-release-wrappers-foundation.md` (R3 / R4 / R7).

### Pre-existing precedent: `arc sync`

The shell-pattern-gate boundary is not novel to release wrappers. `arc sync` already crosses it: the User Sync
UX work that landed earlier in this release-wrapper-foundation cycle established `arc sync` as the handoff-time
push primitive, and `arc sync` invokes `git push` (worktree leg) and `git push refs/notes/arc/user/{identity}`
(notes leg) via Node `child_process` against the same harness-pattern-gate seam. The release wrappers formalize
what has been true (and uncontroversial) for sync.

Sync joins the audit-log umbrella in the same work unit. The retrofit (`writeSyncAuditEntry` in
`handlers/sync.ts`) emits one `command: "sync"` entry per executed sync run, mapping all matrix-cell outcomes
onto the release-wrapper audit shape. Refused-cell paths (`blocked-diverged`, `blocked-remote-ahead`,
`blocked-detached-head`, `blocked-no-remote`, `blocked-remote-unavailable`) record `decision: "refused"` with
`refusalCode: 14` (`pushability-precheck-failed`); proceed-cell paths record `decision: "proceeded"`. Per-leg
state compresses into a grep-friendly `action:result[:detail]` token. Sync becomes the first retrofitted
citizen of the wrapper-authorization umbrella, not a pre-existing gap left un-addressed.

Three sync exit paths intentionally skip the audit-entry write: identity-absent (audit path is identity-keyed,
so no surface to write to), no-arc-project (pre-init or out-of-repo invocation), and dry-run (explicit
no-execute semantics). Release-commit and release-push share the identity-absent and no-arc-project blind spots
for the same structural reason; this is documented as a known forensic gap rather than treated as a defect.

### Trust-model trade-off

Per-invocation trust before vs. after the opt-in:

| Surface                                       | Before opt-in (harness gates raw git)                | After opt-in (wrapper allowlisted)                                                            |
|-----------------------------------------------|------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| Per-invocation prompt at the OS boundary      | Yes — harness prompt on `git commit` / `git push`    | No — allowlist match skips the prompt                                                         |
| ARC interlock validation                      | Workflow guidance only                               | Mechanical refusal at the CLI boundary (codes 10–14)                                          |
| Destructive-flag rejection                    | Harness or per-tool policy                           | Wrapper refuses unconditionally (`--amend`, `--no-verify`, `--force`, `--mirror`, `+refspec`) |
| Branch-protection enforcement                 | Workflow guidance and per-tool policy                | Wrapper refuses on protected base under `branch.protection: full`                             |
| Pushability pre-check                         | Server-side rejection only                           | Wrapper refuses on blocking conditions before invocation (code 14)                            |
| Forensic record                               | Per-tool harness logs (varies; not ARC-managed)      | Per-invocation JSONL audit at `.arc/user/{identity}/.internal/.audit-log.jsonl`               |
| Active-WU resolution                          | Workflow check only                                  | Wrapper refuses on no-WU or multi-candidate ambiguity (code 10)                               |

The columns are not "weaker vs. stronger." Each surface has gaps and mitigations that compose differently. The
columns describe where the per-invocation trust check lives, not whether one exists.

### Gaps and mitigations

What's lost when the harness gate is bypassed for wrapper invocations, paired with what compensates:

- **User no longer sees a per-invocation prompt at the OS boundary.** Wrapper validates interlock scope
  mechanically; refusal cascade short-circuits before any git invocation; one audit entry written per refused
  or proceeded invocation.
- **Harness can't observe argv shape mismatches** (e.g., adopter expected `--amend` to prompt). Destructive-
  flag refusal lists refuse the obvious dangerous shapes regardless of harness state; `+refspec` syntax
  detected even without a recognized flag.
- **Adopter loses the harness-side OS-boundary log.** Audit log captures every wrapper invocation with
  sanitized argv (`-m` / `--message` payloads redacted), `command` discriminator, resolved interlock
  provenance, active-WU pointer, and outcome shape per command.
- **Agent could attempt the wrapper outside its configured scope.** Defensive code 11 catches the mismatch;
  refusal message routes the agent toward raw `git` (the harness-prompt path) as primary remediation, config
  escalation as secondary.
- **Layer-2 violations escape mechanically** (agent uses wrapper for a commit class outside its scope under a
  permissive enough configuration). Layer-2 surfaces via behavior drift, audit-log forensics (per-invocation
  `wu` and `interlockState`), and user feedback; not a wrapper concern by design.
- **Wrapper logic could regress** (drift between refusal taxonomy and validator). Exhaustive matrix-style
  integration tests; `: never` exhaustiveness defaults in the validator catch taxonomy drift; round-trip
  schema test for the audit writer.
- **Identity-absent / no-arc-project / dry-run paths skip the audit write.** Documented blind spot,
  structural to the identity-keyed audit-log path; the same gap holds for release-commit and release-push,
  so the boundary is consistent across all three commands.

The gaps are real but bounded. The PRD's testing posture (security-tier code, no convenience-helper coverage
shortcuts) treats the wrapper as the single point of trust under opt-in and tests it accordingly.

## Decision

Adopt the following trust model for the release wrappers and `arc sync`.

**The release wrapper is the per-invocation trust boundary under opt-in.** Adopter opt-in (allowlist entries
plus `arc.release.enabled: true`) controls *whether the harness prompts*; the wrapper's authorization
scaffolding (interlock validation, refusal cascade, audit log) is *unconditional* once the wrapper is invoked.
There is no off switch on validation or audit logging — only on harness prompting. Documentation must hold this
line to avoid the "I turned it off but it still does things" confusion at the seam between
[DEV-RULES.ARC][dev-rules-arc], AGENT-BRIEF.ARC, and QUICK-REFERENCE.

**`arc.release.enabled` is observability and routing substrate, not a wrapper kill-switch.** The flag records
the adopter's explicit opt-in to the trust-model trade-off so downstream consumers — the session-init probe
surface, future workflow integration in the ergonomics WU — can route on it. The wrapper itself runs
unconditionally regardless of the flag's value: invoking `arc release commit` always validates and audits,
whether or not the adopter has recorded the opt-in. The flag's domain is harness-side configuration, not
wrapper-side behavior.

**The shell-pattern-gate bypass property is structural, not release-wrapper-specific.** Any ARC CLI command
that invokes git via Node `child_process` inherits the same property: the harness's argv-prefix matcher sees
the ARC command, not the underlying git invocation, and gates accordingly. `arc sync` already exhibits this
property and has since the User Sync UX work landed. Future ARC commands that invoke git internally inherit it
as well. The release wrappers do not introduce the bypass; they add authorization scaffolding (interlock
validation, refusal codes, audit log) around it. Future ARC commands invoking git internally must adopt the
wrapper-authorization pattern or document explicitly why their context exempts it.

**Wrapper authorization is two-layered.** Layer 1 is the mechanical wrapper check: does configured permission
overlap wrapper scope? If no, refuse code 11. Layer 2 is agent judgment within authorized scope, codified in
[DEV-RULES.ARC][dev-rules-arc] and workflow docs and not wrapper-enforced. Layer 1 is defensive — the agent's
contract should prevent code 11 from firing in normal use; when it does, the audit log captures it for forensic
review. The wrapper performs scope-coverage checks, not runtime-context detection: it cannot distinguish
"this commit is for task-work" from "this commit is for a ceremony" at invocation time, and it does not need
to.

**`arc sync` joins the wrapper-authorization umbrella forensically.** The audit-log retrofit covers every
executed sync run on the identity-resolved, in-project, non-dry-run paths; refusal cells map onto the
release-wrapper refusal taxonomy where applicable (`blocked-*` cells → code 14). Sync's matrix-decision logic
stays in `handlers/sync.ts`; only the audit-log surface joins the umbrella. Sync's process exit code remains
unchanged for backwards compatibility — only the audit-entry emits the release-wrapper taxonomy.

**Wrapper opt-in is an explicit trade-off, not a default.** `arc.release.enabled` defaults to `false`. Adopters
opt in deliberately by adding allowlist entries (manually today; via a setup helper in the ergonomics WU) and
recording the flag. The default keeps adopters on the harness-prompt path until they read the trade-off and
choose the wrapper-trust path.

## Consequences

### Positive

- Adopters who opt in get a single coherent per-invocation trust surface. ARC interlock and harness allowlist
  no longer compose as redundant prompts; the wrapper carries the authorization weight.
- The audit log produces a forensic record that no harness gate alone can — sanitized argv with redacted commit
  message bodies, resolved interlock provenance per invocation, active-WU pointer, and outcome shape per
  command discriminator. Sync's retrofit lights up the same surface for handoff-time pushes that previously
  left no per-invocation record.
- `arc sync`'s pre-existing same-property bypass becomes a documented and audited surface, not implicit. Future
  ARC commands that invoke git internally have a precedent and a scaffolding pattern to inherit.
- The trust-model framing — opt-in controls harness behavior, not wrapper behavior — eliminates the "off
  switch" confusion at the documentation seam. Adopters reading [DEV-RULES.ARC][dev-rules-arc],
  AGENT-BRIEF.ARC, or QUICK-REFERENCE see the same line.
- Defensive code 11 at the wrapper boundary preserves the harness-prompt path as the canonical fallback for any
  invocation outside configured scope. The agent's contract handles tool selection in normal use; the
  mechanical check catches confusion without taking the user out of the loop. The remediation hint composes
  raw-`git`-first / config-escalation-second to reflect this framing.
- Branch-protection enforcement becomes mechanical under `branch.protection: full`. The wrapper refuses commits
  and pushes against the configured base regardless of interlock state, closing a class of accidental direct-to-
  main operations that workflow guidance alone could not prevent.

### Negative

- The bypass property is permanent for the duration of an adopter's allowlist entry. Once `Bash(arc release
  commit:*)` is allowlisted, the harness gate no longer fires for matching invocations. The wrapper carries the
  trust load until the adopter clears the allowlist entries (and, by convention, `arc.release.enabled`).
- The audit log is local-only by default. Per-identity, gitignored, never replicated to remote without explicit
  opt-in. Forensic review requires direct file access; there is no centralized aggregation, and the
  identity-absent / no-arc-project / dry-run paths legitimately skip writes.
- The two-layer authorization model has no mechanical enforcement of layer 2. Agents that misuse the wrapper
  for invocations outside their codified scope (under a permissive enough configuration) will succeed at the
  wrapper boundary; the misuse surfaces only via behavior drift, audit-log forensics, or user feedback.
- The wrapper is security-tier code. Its test matrix (refusal code × invocation context × auth result × audit-
  shape correctness × sync matrix-cell coverage) is exhaustive by design and adds cost to every refactor that
  touches the validation library, audit log, or handler cascade.
- Adopters whose harness configuration relies on per-invocation prompts as the user's primary review surface
  will see fewer prompts after opt-in. The trade-off is real and documented; adoption decisions need the
  trade-off table to make an informed choice.

### Risks

- *Layer-2 drift at the agent boundary.* If agents adopt the wrapper for invocations outside their configured
  scope without surfacing the misuse, the audit log captures it but no real-time signal fires. Mitigation: keep
  the audit log queryable (jq-friendly JSONL), surface forensic patterns in the ergonomics WU's adopter-facing
  docs, and re-evaluate if dogfooding shows recurring drift.
- *Schema lock at v1.* The audit-log schema is locked at `schemaVersion: 1`. Future additions (new commands,
  new outcome shapes, richer interlock-state captures) require a v2 with reader-compatibility coordination.
  Mitigation: the writer hand-rolls schema validation against an exhaustive type-level discriminator; v2 lands
  when a forcing function (multi-version dispatch, external tooling consuming the JSONL) appears.
- *Harness allowlist grammar drift.* Argv-prefix matcher boundaries vary by harness and version; an empirical
  re-verification against the then-current Claude Code and Codex CLI runs at WU verification. Mitigation:
  documented fall-through cases (env-prefixed invocation, unusual quoting) carry forward as the
  documentation shape evolves.
- *Future ARC commands inheriting the bypass without inheriting the scaffolding.* The bypass property is
  structural to any `child_process` git invocation; the authorization scaffolding (interlock validation, audit
  log, refusal codes) is not. Mitigation: the bypass-universality clause in the Decision section is the
  reference for future commands.
- *Forensic gap on identity-absent / no-arc-project / dry-run paths.* Documented and structural — these paths
  cannot reach the identity-keyed audit-log destination, or have explicit no-execute semantics. Mitigation:
  the same gap holds for the release wrappers, so the boundary is consistent across all three commands;
  upstream context (early-return envelopes, error logs) carries the diagnostic for those paths.

### Alternatives Considered

- *Defense-in-depth at both layers (harness prompt plus ARC validation per invocation).* Rejected — once ARC's
  interlock authorizes, the harness prompt adds nothing the user did not already decide. Redundant friction was
  the friction problem this work is solving.
- *Kernel-side or OS-level git intercept (seccomp filter, FUSE shim, ptrace hook).* Rejected — too heavy,
  OS-specific, adds dependencies on host security primitives, and crosses the user's environment in ways ARC's
  installer cannot reasonably manage.
- *Harness-side custom matchers per tool (Claude Code plugin, Codex hook, etc.).* Rejected — per-harness work,
  doesn't compose across the harness ecosystem, and doesn't address the structural bypass property. Future ARC
  commands invoking git internally would each need a parallel matcher in each harness.
- *No wrapper; agents continue using raw git under the harness prompt.* Rejected — the friction the wrapper
  resolves is real and recurring, and ARC's interlock model already carries the authorization decision the
  harness prompt is re-asking. The status quo is the documented "before opt-in" column of the trade-off table,
  preserved as the default for adopters who prefer it.

## Amending This Document

**2026-05-10 — Per-developer scope clarification.** Ergonomics WU work surfaced that the "adopter opt-in"
framing in the original Context and Decision was conceptually right but implementation-incomplete: at
write-time there was no per-developer setup path, so opt-in lived as a project-level yaml flag
(`release.enabled`) plus a parallel per-developer git-config flag (`arc.releaseEnabled`). Subsequent setup
work in this WU added the per-harness, per-machine path the trust model actually requires — allowlist install
is a per-machine action against the resident harness, and the trust-shift acknowledgment is a personal
acceptance.

The trust model itself stands unchanged. Scope clarification: opt-in lives where the trust model lives.
Collapse the yaml `release.enabled` flag (mechanically inert without per-dev setup; pushing it onto
unconfigured contributors violates the trust-shift acknowledgment principle from this ADR's Context). Rename
the remaining per-developer git-config key to `arc.releaseOptedIn` — declarative `is`-framing matching the
existing `arc release opt-in` / `opt-out` command vocabulary, avoiding the "feature switch" misread carried
by `enabled`.

The same per-dev-only collapse applies to the three session interlocks (`arc.commitInterlock`,
`arc.pushInterlock`, `arc.syncInterlock`) — autonomy and interaction-cadence preferences are inherently
personal across the dev-tool ecosystem and have no team-coordination value (interlocks gate when the agent
prompts the local developer; they have zero effect on what lands in the repo). `user.notes_push` remains
dual-scope as the lone exception: `team.mode` flips its default (solo → `on-sync`, team → `prompt`), and
the slim coordination story warrants a deferral pass to revisit if the coupling proves uncompelling on
closer examination.

For the full design history — external research findings on dual-scope idiomaticity across eight
representative dev tools, the `release.enabled` semantic walkthrough, naming convergence on
`releaseOptedIn`, and the `user.notes_push` deferral rationale — see
`notes-release-wrappers-ergonomics.md` § Phase 6.R: Configuration Scope Refactor — Design History.

This is a scope-clarification amendment, not a reversal of the decision. The trust-model framing, two-layer
authorization model, wrapper authorization scaffolding, sync forensic umbrella, and bypass-universality
clause are unchanged.

**2026-05-16 — `no-upstream-branch` becomes caller-resolvable.** Work Organization Reform surfaced that
the original wrapper behavior on a no-upstream branch (refuse with code 14) violated the "everything
non-destructive automatic" principle: activating a fresh WU naturally produces a no-upstream branch on
first push, and refusing under the wrapper forced the agent or user to drop to raw `git push -u`. A new
`caller-resolvable` disposition tier on the pushability matrix lets orchestrators auto-inject `-u` when
EITHER the argv already declares the intent (`-u` / `--set-upstream`), OR `pushInterlock !== "manual"`.
Under `manual` + no explicit `-u`, the original refusal path remains — preserves the user's "no
auto-cascade under manual" intent.

Refusal taxonomy: `blocked-no-upstream` removed from the sync-cell refused set (sync auto-resolves via
the new `paired-push-with-upstream-init` / `worktree-only-with-upstream-init` /
`worktree-with-upstream-init+notes-prompt` cells when `pushInterlock !== "manual"`; under `manual`,
worktree skip-not-configured fires before the block-state check, so `blocked-no-upstream` is
structurally unreachable). Release-push refuses on `no-upstream-branch` only when both trust signals
fail — argv lacks `-u` AND `pushInterlock === "manual"`.

The `isRefusalCondition` helper (`block` ∪ `caller-resolvable`) centralizes the "what causes refusal"
predicate across pushability, sync, user, user-sync, user/types, and release/push so future condition
additions don't risk drift between the matrix and its consumers.

Trust-model framing, two-layer authorization, wrapper authorization scaffolding, sync forensic
umbrella, and bypass-universality clause are unchanged. This is a behavior refinement at the
caller-side of the matrix surface, not a reversal of the decision.

**2026-07-14 — Commit-message preflight and audit schema v2.** Subsequent wrapper hardening clarified active-WU
resolution: zero candidates is accepted and audited with `wu: null`; only multiple-candidate ambiguity refuses
with code `10` (`ambiguous-active-wu`). The refusal family now spans codes `10–16`:
`ambiguous-active-wu`, `interlock-not-authorized`, `destructive-flag`, `branch-protection-violation`,
`pushability-precheck-failed`, `arg-grammar-fallthrough`, and `commit-message-preflight-failed`.

Release-commit now captures and assembles author-supplied message input, then runs the canonical commit-message
validation before invoking Git. Validation failures and input failures refuse with code `16`; the audit outcome is
`{ kind: "preflight-failed", reason: "validation" | "input" }`. This extends the wrapper's trust check to the
message bytes crossing the boundary, while the installed Git hook remains defense in depth for post-mutation and
raw-Git paths.

The new outcome was the forcing function anticipated by the original schema-lock risk. Because no public v1
consumer contract existed, all release-audit writers and the runtime validator moved together in a clean cutover to
`schemaVersion: 2`; no v1 reader, mixed-version compatibility layer, or audit-file migration was introduced. The
decision itself is unchanged: whenever a release wrapper is invoked, its authorization, message preflight where
applicable, and audit behavior remain unconditional, and the wrapper remains the per-invocation trust boundary.

---

[adr-016]: adr-016-configurable-autonomy-interlocks-for-session-operations.md
[dev-rules-arc]: ../../system/rules/DEV-RULES.ARC.md
