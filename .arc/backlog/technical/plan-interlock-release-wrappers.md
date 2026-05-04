# Plan: Interlock-Release Wrappers

## Problem / Motivation

ARC's interlock mechanisms (`commit_interlock`, `push_interlock`) govern *when* the agent should
release a commit or push: per task approval, on handoff, or only when explicitly invoked. The model
works — agents follow it, users get the predictability they signed up for. But the interlock
governs only the agent's *decision* to attempt the operation. The actual `git commit` / `git push`
invocation still runs as a generic shell command, which means the harness's permission system
gates it independently.

For users who configure their harness to prompt on git mutating operations (a common defense-in-depth
posture: blacklist destructive commands to "always prompt" or "always deny," allowlist or auto-pass
the rest), this produces redundant friction: ARC's interlock authorizes the operation, then the
harness re-prompts. The user has already made the trust decision at the interlock layer; the harness
prompt adds nothing and breaks flow. Some users absorb this; others would prefer ARC's interlock to
be the single decision point — provided ARC's mechanism is trustworthy enough to carry that weight.

There is a possible mechanism: introduce wrapper commands (`arc release commit`, `arc release push`)
that shadow `git commit` and `git push`. Harness permission systems can pattern-match these
distinctly from the underlying git commands — the wrappers can be allowlisted while raw git
commands continue to prompt. The wrappers themselves enforce ARC interlock state at the CLI
boundary: refuse when no active WU is resolved, refuse when interlock state doesn't authorize the
operation, refuse on destructive flags (force, etc.), bubble server errors verbatim.

This carries two distinct benefits:

1. **Mechanical interlock enforcement at the CLI boundary** — workflow guidance becomes mechanical
   guarantee. The agent following ARC interlocks is convention; the wrapper enforcing them is
   protocol. Catches agent-confusion failure modes (forgotten workflow step, misread interlock
   state, fired commit at wrong cascade point) that workflow-as-code only catches by compliance.
2. **Permission-shape for harness allowlist bypass** — for users who opt into it, the wrapper
   becomes the sole authorization layer, removing the redundant harness prompt without losing
   the protective gate function.

Either benefit alone is contested justification; together they form the case. The wrapper is not
just permission laundering (it carries enforcement value standalone), and it's not just CLI hygiene
(the friction-reduction case is the visible motivation). Both legs together: defensible.

This matters now because:

- Pre-1.0 polish window — git surface UX is a high-visibility surface where friction compounds. Best
  to land before broader adoption surfaces this as a recurring complaint.
- The current `user-sync-ux` WU's Phase 2 work (paired-push semantics, pushability pre-check matrix)
  pins down the push-side coherence rules the push wrapper needs. Building on that landed work is
  cheaper than retrofitting later.
- The current WU's Phase 3.1 (resolver consolidation, `resolveGitConfigOverride<T>`) creates the
  validation library shape the wrapper enforcement layer wants to build on. Same ordering argument.

## Scope

### In scope

**Wrapper commands.** Two new CLI commands under a `release` namespace, both **single-leg**:

- `arc release commit` — wraps `git commit`. Validates active WU is resolved; validates
  `commit_interlock` state authorizes (interlock-specific rules per current ARC config); refuses
  destructive flags; passes through standard git args; bubbles git output verbatim on success.
- `arc release push` — wraps `git push` (worktree-leg only). Validates active WU is resolved;
  validates `push_interlock` state authorizes; validates pushability pre-check (per `user-sync-ux`
  R14 work) — branch upstream, no rebase in progress, etc.; refuses force-push variants; bubbles
  server errors verbatim.

Both wrappers honor the same interlock semantics the agent already follows — they enforce, not
augment. Cross-leg orchestration (paired worktree+notes push at handoff per `user-sync-ux` R5)
is **not** the wrappers' concern — that lives in the `arc sync` orchestrator (`user-sync-ux`
R10), which calls `arc release push` for the worktree leg and `arc user push` for the notes leg
based on the configured matrix. Wrappers stay scope-narrow: shape enforcement and authorization
validation for a single git operation.

**Interlock-validation library.** Shared logic both wrappers call. Builds on the resolver
consolidation work in `user-sync-ux` Phase 3.1 (`resolveGitConfigOverride<T>`) for interlock-state
reads. Single source of truth for "is this commit/push currently authorized" used by both wrappers
and potentially by downstream consumers (status reporter, audit-log writer).

**Audit log.** Append-only JSONL at `.arc/user/{identity}/.internal/.audit-log.jsonl`. Fully
CLI-internal; no agent interaction. Per-invocation entry: timestamp, command, sanitized args,
active WU, interlock state at decision time, decision (proceeded / refused + reason), outcome
(commit hash / push ref status, on success). Forensic value: identifies which mutating ops flowed
through the wrapper vs. raw git; supports incident triage when a bad commit lands without harness
prompt. Local-only by default; portability via git notes is opt-in for users who want
cross-machine continuity.

**Authorization footer (opt-in).** Configurable git trailer on commits that flowed through the
wrapper. Default `off` — most users get clean commit messages. Users who want distributed
traceability (team contexts especially) opt in. Spec-time decision on shape: `off | abbreviated |
full`, plus the refinement question of whether to stamp every wrapper-mediated commit or only
those where the harness gate was bypassed (lower volume, sharper meaning). Trailer form, not body
line — composes with existing `Context:` trailer; queryable via `git log --pretty="%(trailers)"`.

**Adopter setup helper.** A single porcelain (naming TBD — `arc release setup` or
`arc setup-permissions` or similar) that:

- Detects the harness in use via standard markers (`.claude/`, `~/.codex/`, etc.).
- Prints the trust-model trade-off in plain language; requires explicit acknowledgment.
- Generates harness-appropriate allowlist entries; writes them with consent and prints what was
  written; offers `--dry-run` for preview.
- Records opt-in state so future `arc status` and session-init orientation can surface "wrapper
  allowlist active — ARC is sole authorization layer."
- One-command rollback (`--disable`) that removes only the entries it added (idempotent; doesn't
  touch user-curated rules).
- For personal-script gate setups (e.g., bespoke pre-tool-use hooks): prints the suggested
  allowlist patterns rather than auto-writing; user pastes into their own script.

**Workflow integration.** Updates to `process-task-loop.md` and `session-handoff.md` so the agent
prefers `arc release commit` / `arc release push` over raw git when wrapper is active. The
`arc sync` orchestrator (post-`user-sync-ux` integration) invokes `arc release push` for the
worktree leg internally when wrapper is active — the orchestrator owns the
push_interlock × notes_push × sync_interlock matrix decisions; wrappers execute the leg.
Behavior adapts to `commit_interlock` / `push_interlock` / `sync_interlock` state per existing
rules — wrapper invocation is the *how*, interlock state remains the *whether*, orchestrator
decides *what fires together*.

**Status integration.** `arc status` surfaces wrapper-active state when allowlist is detected.
Session-init orientation includes a one-line note when wrapper is the sole authorization layer
(loud, not silent — addresses the silent-trust-shift concern under Adopter Friction).

**Documentation.** New strategy doc (`strategy-interlock-release-wrappers.md` or similar) covering
the trust model, when to use, when not to use, per-harness setup. Updates to DEV-RULES.ARC §
Commit Discipline (note the wrapper as authorized invocation path); QUICK-REFERENCE (new commands);
AGENT-BRIEF.ARC if needed (probably yes — wrapper changes the canonical commit/push invocation
shape under workflow guidance).

**ADR.** This involves a methodology decision (defense-in-depth at harness layer vs. at ARC layer);
warrants ADR documentation per ADR criteria.

### Out of scope

- **Other git operations** (`rebase`, `reset`, `revert`, `checkout`, `cherry-pick`, etc.).
  Commit and push are regular ARC-session operations; the rest are exceptional and high-blast-radius
  — exactly where the harness gate's defense-in-depth is most valuable. Holding the scope line
  here is constitutional, not pragmatic.
- **Auto-enable in any harness by default.** The wrapper exists as an opt-in capability. No `arc
  init` or `arc join` flow auto-allowlists anything without explicit user invocation.
- **Replacing the `arc-commit` skill.** The skill is the user/agent-facing orchestration layer; the
  wrapper is the underlying CLI invocation. Skill may call into the wrapper internally (TBD at
  PRD), but the skill's existence and shape don't change.
- **Permission-system standardization across harnesses.** ARC adapts to each harness's shape; we
  don't push for upstream changes (though tracking opencode's resolution of #6676 / #15507 is
  worthwhile background — see § Per-Harness Viability).
- **Server-side enforcement.** This is purely client-side. Server-side hooks (pre-receive, etc.)
  remain the deployment's concern; wrapper does not duplicate or replace them.

## Trust Model Trade-Off

Today's protective layering for git mutating operations:

1. ARC workflow (agent follows interlock-respecting protocol).
2. Harness gate (catches operations regardless of whether ARC authorized them).
3. User approval at the harness prompt.

After wrapper + allowlist (when adopter opts in):

1. ARC workflow (unchanged).
2. Wrapper enforcement (refuses on invalid interlock state, missing WU, destructive flags).
3. *(Harness gate bypassed for wrapper invocations only.)*
4. User approval at ARC interlock layer (where the trust decision is meaningful).

What's gained: friction reduction; single decision point at the interlock layer; mechanical
enforcement of interlock state at CLI boundary (catches agent-confusion failure modes).

What's lost: the harness gate's *generic catch-all* function for git operations the agent shouldn't
be invoking. The wrapper enforces the specific failure modes ARC knows about; it cannot enforce the
modes ARC doesn't yet model.

| Failure mode                                    | Harness gate catches       | Wrapper catches                                                         | Coverage delta |
|-------------------------------------------------|----------------------------|-------------------------------------------------------------------------|----------------|
| Premature commit (before user approval)         | yes (prompt)               | yes (interlock state)                                                   | clean          |
| Wrong-branch commit                             | yes (prompt)               | yes (`branch.protection`)                                               | clean          |
| Push before ready                               | yes (prompt)               | yes (`push_interlock` + pushability matrix)                             | clean          |
| Force push / destructive flags                  | yes (prompt)               | yes (wrapper refuses these flags)                                       | clean          |
| Wrong files / wrong message content             | yes (generic prompt)       | partial (footer/format validation; no judgment of "wrong-ness")         | gap            |
| Agent went off-rails entirely                   | yes (generic catch-all)    | partial (depends on whether off-rails state happens to fail validation) | gap            |
| Wrapper bug / interlock bug lets bad op through | yes (last line of defense) | no (the bug *is* the wrapper)                                           | gap            |

The gap rows are the trade. Acceptable for users who trust ARC's interlock model and workflow
discipline; not acceptable for users who want defense-in-depth specifically against ARC bugs or
unmodeled agent behavior. **This is fundamentally a per-user policy decision; ARC must not make
it silently.**

## Adopter Friction Analysis

Wrong-setup scenarios stratified by severity:

**Low — self-correcting:**

- Adopter installs wrapper but doesn't allowlist → wrapper works, harness still prompts, no
  benefit. They notice immediately and either configure or back out.
- Adopter allowlists `arc release commit` but forgets `arc release push` → asymmetric UX, easy to
  debug.

**Medium — mitigable:**

- Adopter changes `commit_interlock` setting later without realizing wrapper behavior shifts. *Mitigation:*
  surface wrapper's posture in next session-init orientation when interlock setting changes.
- Multi-developer repo, asymmetric allowlist between developers. Not really wrong — different
  setup; document as expected.

**High — requires deliberate design:**

- *Silent trust-model shift:* adopter allowlists without internalizing that this removes the
  harness gate. *Mitigation:* setup helper requires explicit acknowledgment; opt-in state is
  recorded; session-init orientation surfaces "wrapper allowlist active — ARC sole authorization
  layer" when detected; status command surfaces same.
- *Wrapper or interlock bug lets bad op through:* no harness safety net under the wrapper.
  *Mitigations:* (a) treat wrapper enforcement as security-tier code — exhaustive matrix testing
  of interlock state × invocation context × refusal expectations; (b) audit log and authorization
  footer give forensic recovery — bad commit landed, but identifiable and revertable.
- *Personal scripts (bespoke gates, e.g., user safety-gate.sh patterns):* setup helper cannot
  autoconfigure these. *Mitigation:* helper detects standard harness markers; for non-standard
  setups, prints the canonical allowlist patterns and instructs manual installation.
- *opencode silent-config-validation bug:* typos in opencode permission keys are silently ignored
  ([sst/opencode#15507]) — adopter writes allowlist, typo, no warning, no protection. *Mitigation:*
  setup helper validates by re-reading and echoing what was written; for opencode specifically,
  defer auto-setup until upstream resolves (see § Per-Harness Viability).

**Reputational risk** (raised during planning): a commit/push-related feature that occasionally
bypasses safeguards in unexpected ways is exactly the kind of feature that erodes framework trust.
Mitigations that hold the line:

- Strictly opt-in. Never auto-enabled.
- Loud, not silent. Orientation surfaces wrapper-active state; refusals are verbose and explain
  remediation.
- Easy off switch. Single command rollback, idempotent.
- Hold the scope line. Commit and push only — no slippery slope to higher-blast-radius ops.
- First-class testing discipline. This surface gets security-grade test coverage, not
  convenience-helper coverage.
- Documented "when not to use this." Tells users when to walk away.

## Per-Harness Viability

External research completed (2026-05-03):

| Harness     | Status              |
|-------------|---------------------|
| Claude Code | viable              |
| Codex CLI   | viable (caveat)     |
| opencode    | blocked upstream    |

**Claude Code.** Pattern-based allowlist; `Bash(arc release commit:*)` matches distinctly from
`Bash(git commit:*)`.

**Codex CLI.** Starlark `prefix_rule()` with explicit list patterns: `["arc", "release", "commit"]`
vs `["git", "commit"]` is unambiguous. **Caveat:** prefix matching reportedly fails when commands
are invoked via `/bin/bash -lc ...` shell wrapper or with env prefixes ([openai/codex#13175]).
Whether Codex itself wraps tool invocations this way needs empirical verification — see
Verification Matrix in WU1.

**opencode.** Glob syntax exists but flag-parsing bug ([sst/opencode#6676]) means
`arc release commit -m "..."` may not match patterns reliably. Compounded by silent
config-validation failure ([sst/opencode#15507]) — typos leave permissions non-functional with no
warning. Other reliability concerns: implicit-wildcard insertion ([sst/opencode#5330]);
headless-mode hang on `ask` ([sst/opencode#14473]). Wrapper itself works; auto-allowlist support
deferred until upstream resolves.

Adopter impact: opencode users get no improvement (no regression either) — wrapper invocations
still flow through the existing harness prompt path. They can manually configure if they want to
experiment, but ARC's setup helper will refuse to auto-configure with a printed explanation
linking the upstream issues.

## Sibling Work Units

This plan covers the parent concern. Implementation splits into two siblings; both produced as
separate WUs at PRD-drafting time.

### WU1 — Foundation (mechanical)

**Scope.** Wrapper commands, interlock-validation library, audit log, authorization footer,
documentation of new commands, ADR.

**Outcome.** Wrappers work end-to-end. Advanced users can hand-configure their harness allowlist
and get the friction-reduction benefit. No setup helper yet.

**Verification matrix:**

- Empirical: invoke `arc release commit --version` from each priority harness with a corresponding
  allowlist rule installed; confirm rule matches and command runs without prompt. Codex specifically
  needs verification of the shell-wrapper caveat.
- Refusal taxonomy: every documented refusal scenario covered by integration test (no active WU,
  interlock not satisfied, destructive flag, branch protection violation, etc.).
- Audit log integrity: every wrapper invocation produces exactly one log entry with correct
  decision and outcome.
- Footer behavior under each config setting: `off | abbreviated | full`; bypass-only stamping
  variant if that refinement lands.
- Workflow composition: wrapper invocations under `commit_interlock: manual | on-task-approval`
  produce the expected behavior for each.

**Dependencies.**

- Current `user-sync-ux` WU integrated first. Phase 2 (R5 paired-push, R10 orchestrator surface,
  R14 pushability pre-check) is needed for the push wrapper's validation logic and orchestration
  boundary; Phase 3.1 (resolver consolidation) is the base layer the validation library builds
  on.
- ADR-016 / interlock-model framing is canonicalized.

**Approximate size.** Medium-large. ~12-15 sessions ballpark.

### WU2 — Adopter Ergonomics

**Scope.** Setup helper (`arc release setup` or similar — naming finalized at PRD), per-harness
detection and config-write logic, status integration, session-init orientation surfacing,
workflow updates (process-task-loop and session-handoff direct agent to wrapper when active),
comprehensive adopter documentation including per-harness setup guides and "when not to use this"
section, strategy doc.

**Outcome.** Lower the floor — setup is one command, posture is visible, rollback is easy.
Production-ready for adopter rollout.

**Dependencies.** Strict dependency on WU1 landing.

**Approximate size.** Medium. ~10-13 sessions ballpark. (opencode handler is a stub printing a
deferral notice; reduces scope vs. all-three-harness implementation.)

## Alternatives

**Naming for the wrapper namespace:**

- **A — `arc release commit / push` (current lean).** Semantically loaded with the right concept
  (interlock release); creates room for `arc release status`, `arc release log` etc.; no collision
  with `arc-commit` skill or framework-release vocabulary. Reads naturally.
- **B — `arc git commit / push`.** Clearest about what's being wrapped, lowest surprise. Downside:
  reads like a generic git proxy, doesn't carry the interlock semantic.
- **C — `arc fire commit / push`.** Tight vocabulary fit ("fire" already used in interlock
  contexts). Downside: "fire" reads unsafe in commit/push framing — conjures wrong intuitions for
  cautious adopters.

**Authorization footer behavior:**

- **A — Off by default; opt-in via `release.footer: off | abbreviated | full` (current lean).**
  Default behavior produces clean commit messages. Users who want distributed traceability opt in.
- **B — Always-on, abbreviated.** Single short trailer always present. Lower opt-in threshold; some
  noise in every commit.
- **C — Bypass-only stamping refinement.** Footer present only when wrapper bypassed the harness
  gate (allowlist active); absent when wrapper used without bypass. Lower volume, sharper forensic
  meaning. Compatible with A or B as a sub-mode. Likely strongest framing; PRD-time decision.

**Setup helper invocation point:**

- **A — Standalone porcelain (`arc release setup`, current lean).** User runs explicitly when they
  decide to opt in. Matches opt-in posture; no surprise behavior at `arc init` / `arc join`.
- **B — Optional step in `arc init` / `arc join`.** Lower friction for users who want it from day
  one. Risk: gets accepted reflexively without internalizing the trust trade-off.
- **C — Hybrid: standalone porcelain, but prompted-once at first session-init after `arc join`
  with a `--setup-release` opt-in flag.** Captures option B's discoverability without sacrificing
  option A's deliberate posture.

**Audit log retention / rotation:**

- **A — No rotation, append-only forever (current lean).** Trivial size at expected volumes.
  Deferrable problem.
- **B — Size-based rotation at e.g. 10MB.** Conservative.
- **C — Time-based rotation (monthly file).** Easier human inspection.

PRD-time decision; not a blocker.

## Unknowns and Assumptions

**Empirical verification needed:**

- **Codex shell-wrapper caveat applicability.** Does Codex itself invoke tool commands via
  `/bin/bash -lc` or env-prefix patterns that would trip [openai/codex#13175]? If yes, the
  prefix-rule allowlist won't match in practice and we need either upstream engagement, a
  documented workaround, or treating Codex as deferred (parallel to opencode). Cheap to test:
  install a rule, invoke wrapper from Codex, observe.

**Resolution-tracking:**

- opencode's resolution timeline for [sst/opencode#6676] (flag parsing) and [sst/opencode#15507]
  (silent validation failure). When upstream lands, opencode handler in WU2 setup helper graduates
  from stub to full implementation. Worth periodic check-in but not a blocker for shipping WU1/WU2
  with the other two harnesses supported.

**Assumptions to validate at PRD:**

- The "two-leg justification" (mechanical enforcement + permission-shape) holds up under adopter
  scrutiny. If beta adopters consistently report "this only matters for the allowlist case," the
  mechanical-enforcement framing may be over-claimed and the strategy-doc rationale needs
  trimming.
- The "loud, not silent" mitigation pattern (orientation surfacing, status reporting, verbose
  refusals) actually prevents the silent-trust-shift failure mode in practice. If adopters still
  miss the trust-model shift despite explicit acknowledgment + ongoing visibility, the opt-in flow
  needs further redesign.
- The interlock-validation library shape from `user-sync-ux` Phase 3.1 is reusable here without
  significant adaptation. If it isn't, WU1 picks up additional refactoring scope.
- The footer's bypass-only stamping refinement (Alternative C above) is implementable cleanly —
  wrapper needs a reliable signal that harness gate was bypassed in this invocation context. If
  no robust signal exists, fall back to simple opt-in toggle without the refinement.
- Per-harness setup-helper logic stays maintainable across two harnesses today plus opencode when
  upstream resolves. If detection/config-write logic balloons, consider extracting a per-harness
  plugin shape rather than adding harness-specific branches inline.

## Scope Estimate

**Large** (week-plus, split across two WUs).

**WU1 ballpark:** ~12-15 sessions.

- Strategy doc + ADR + naming finalization at PRD: 1-2 sessions.
- Interlock-validation library (builds on `user-sync-ux` Phase 3.1) + tests: 2-3 sessions.
- `arc release commit` + tests: 2-3 sessions.
- `arc release push` + tests (depends on `user-sync-ux` Phase 2 landed): 2 sessions.
- Authorization footer (config + trailer composition + tests): 2 sessions.
- Audit log (write path + tests): 1 session.
- Documentation pass (DEV-RULES.ARC, QUICK-REFERENCE, AGENT-BRIEF.ARC): 1 session.
- Verification + integration: 1-2 sessions.

**WU2 ballpark:** ~10-13 sessions.

- Setup helper porcelain + per-harness detection/config-write (Claude Code + Codex): 4-6 sessions.
- opencode handler (stub with deferral notice + linked issues): 0.5 session.
- Status integration: 1-2 sessions.
- Session-init orientation surfacing: 1 session.
- Workflow integration (process-task-loop, session-handoff): 2-3 sessions.
- Per-harness adopter setup guides + strategy doc revision: 2-3 sessions.
- Verification + integration: 1 session.

**Dependencies on other work:**

- **Hard dependency:** Current `user-sync-ux` WU integrated before WU1 starts. Phase 2 work
  (paired-push semantics, pushability pre-check matrix) is the foundation the push wrapper's
  validation builds on. Phase 3.1 (resolver consolidation) is the base for the validation library.
- **Strict dependency:** WU2 depends on WU1.
- **Soft preference:** Land before any future work that adds new mutating git operations to ARC's
  surface — keeps the wrapper's scope-line decision (commit/push only) clean rather than
  retroactive.

**Scheduling.** After current `user-sync-ux` WU integrates. Pre-1.0 polish window. WU1 and WU2
sequenced; no parallel option.

---

[openai/codex#13175]: https://github.com/openai/codex/issues/13175
[sst/opencode#6676]: https://github.com/sst/opencode/issues/6676
[sst/opencode#15507]: https://github.com/sst/opencode/issues/15507
[sst/opencode#5330]: https://github.com/sst/opencode/issues/5330
[sst/opencode#14473]: https://github.com/sst/opencode/issues/14473
