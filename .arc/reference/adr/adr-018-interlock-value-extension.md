# ADR-018: Adopt Trigger-Set Interlock Values and Scope-Coverage Wrapper Authorization

## Status

Accepted

## Context

[ADR-016][adr-016] established the interlock vocabulary (`commit_interlock`, `push_interlock`, `sync_interlock`)
governing *when* the agent decides to release a commit, push, or sync. Each configurable interlock had two values:
`manual` (no agent autofire; user invocation only) and `on-{primary}` (`on-task-approval` for commit, `on-sync` for
push, `on-handoff` for sync — autofire on the named primary trigger).

[ADR-017][adr-017] then defined the release-wrapper trust model: under opt-in, the wrapper becomes the
per-invocation trust boundary; the wrapper validates interlock state and either invokes git or refuses with one of
codes 10–14 plus an audit-log entry. ADR-017 covers *whether* the defense-in-depth trade-off applies and what trust
contract holds. It does not say *how* the wrapper translates a configured interlock value into an authorize/refuse
decision, and it leaves two design questions open from the foundation work.

**Value extension.** The two-value enum covers the primary release event for each interlock, but workflow evolution
surfaces additional release events. Concrete examples surfaced during foundation and ergonomics planning:
`commit_interlock` needs to authorize ceremony commits when release wrappers fire from workflows like activate /
integrate / sweep / handoff; `push_interlock` needs to authorize ceremony pushes (e.g., the PR-creation step in
`integrate-work-unit`); `sync_interlock` will need to authorize workflow-driven sync from upcoming worktree work
units. Each axis could grow ad-hoc per-axis values (`commit_interlock: on-ceremony`, `push_interlock: on-integrate`,
`sync_interlock: on-worktree-create`), but that route fragments the interlock vocabulary along axis-specific lines,
makes documentation grow with each new trigger, and forces forward-compat to land via CLI/yaml/git-config schema
migrations rather than a stable reserved value.

**Authorization model.** Once a configured interlock value is resolved, the wrapper has to decide whether the
particular invocation matches the configured permission. Two routes exist. *Runtime-context detection* would have
the wrapper distinguish "this commit is for task-work" from "this commit is for a ceremony" at invocation time —
by reading caller hints, inspecting workflow state, or inferring intent from active-WU context. *Scope-coverage*
would have the wrapper carry a fixed scope per command and check whether the configured permission's trigger set
overlaps that scope. Runtime-context detection requires the wrapper to encode workflow knowledge it doesn't
otherwise need; scope-coverage operates on values alone.

**UX framing.** A separate framing question surfaced in parallel: how should adopters mentally model the wrapper's
authorize/refuse behavior? Two framings competed.

- *Permission-grant framing.* "Configuring `on-task-approval` grants the agent permission to commit." The
  wrapper's authorize/refuse outcome reads as "wrapper allows/denies the commit." Code 11 reads as "permission
  denied."
- *Prompt-vs-bypass framing.* "Configuring `on-task-approval` permits the agent to bypass the harness's
  per-invocation prompt for task-work commits." Raw `git commit` remains the harness-prompt path for any
  invocation outside configured scope. Code 11 reads as "wrong tool — use raw `git` for this invocation, or
  escalate the permission only if intentional."

Permission-grant framing reads cleanly in isolation but conflicts with the [ADR-017][adr-017] trust contract. ADR-017
establishes that the wrapper's validation is *unconditional* — validation and audit logging fire regardless of
`arc.release.enabled` — and that the flag is *observability and routing substrate, not a wrapper kill-switch*.
Permission-grant framing implies the wrapper's authorize outcome controls whether the commit happens, but the
harness-prompt path runs independently of the wrapper: the user can always raw-`git`-commit, with or without opt-in.
Permission-grant framing also implies the flag is a kill-switch ("turn off permission to commit"), which contradicts
the ADR-017 line. Prompt-vs-bypass framing aligns: configuration controls *which paths the user permits the agent to
bypass-prompt on*, and raw `git` remains the harness-prompt fallback for any invocation outside the configured
bypass scope.

## Decision

Adopt the following authorization model for the release wrappers, layered on the [ADR-017][adr-017] trust contract.

**The three configurable interlocks share a uniform three-value permissiveness ladder.** `commit_interlock`,
`push_interlock`, and `sync_interlock` each take values from `manual < on-{primary}` < `on-workflow`. Values
capture *trigger sets*, not single triggers — `manual` is the ∅ trigger set, `on-{primary}` is the established
singleton trigger set, and `on-workflow` is the superset capturing any agent-mediated workflow event.

| Interlock          | `manual` | `on-{primary}`     | `on-workflow`                           |
|--------------------|----------|--------------------|-----------------------------------------|
| `commit_interlock` | ∅        | task-work commits  | task-work + ceremony commits            |
| `push_interlock`   | ∅        | sync-internal push | sync + ceremony pushes                  |
| `sync_interlock`   | ∅        | handoff workflow   | handoff + future workflow-driven sync   |

`commit_interlock: on-task-approval` already worked this way: `manual` was ∅ and `on-task-approval` was
{task-approval}. `on-workflow` extends each axis to a superset that includes any agent-mediated workflow event,
expressed as one uniform value rather than enumerated per-axis triggers. Task-interlock and integration-interlock
are invariant per [ADR-016][adr-016] — they are not configurable and do not participate in the ladder.

`sync_interlock: on-workflow` is behaviorally equivalent to `on-handoff` today (no other workflow fires sync), but
the value is reserved for forward-compatibility — upcoming worktree work units and future workflow-driven sync
events authorize on the same value without requiring a config-axis evolution.

Defaults are unchanged. `commit_interlock` and `push_interlock` default to `manual` (conservative); `sync_interlock`
defaults to `on-handoff` (auto-sync at handoff is the out-of-box expectation). `on-workflow` is opt-in across all
three.

**The wrapper authorizes by scope-coverage, not runtime-context detection.** Each release-wrapper command has a
fixed scope describing the commit / push class the agent uses it for:

| Wrapper command      | Scope                                                       |
|----------------------|-------------------------------------------------------------|
| `arc release commit` | any commit the agent fires (task-work ∪ ceremony)           |
| `arc release push`   | ceremony push only (sync uses its own internal push helper) |

The authorization rule is set-overlap on the trigger-set ladder:

> **permission ∩ scope ≠ ∅ → authorize, else refuse code 11**

Plays out as:

- Commit × `on-task-approval`: {task-work} ∩ {any commit} = {task-work} → **authorize**
- Commit × `on-workflow`: {task-work, ceremony} ∩ {any commit} → **authorize**
- Push × `on-sync`: {sync push} ∩ {ceremony push} = ∅ → **refuse(11)**
- Push × `on-workflow`: {sync, ceremony} ∩ {ceremony push} → **authorize**

The wrapper does not distinguish "this commit is for task-work" from "this commit is for a ceremony" at invocation
time, and does not need to — the rule operates on values alone. Runtime-context detection would require the wrapper
to encode workflow knowledge that workflows themselves carry; scope-coverage decouples the wrapper from workflow
shape entirely.

**The user-facing framing is prompt-vs-bypass, not permission-grant.** Configuration expresses which paths the user
permits the agent to bypass-prompt on. Raw `git commit` and `git push` remain the harness-prompt fallback for any
invocation outside the configured bypass scope. The wrapper does not "grant permission to commit"; it lets the
agent skip the harness prompt for invocations within configured scope, with mechanical authorization and audit on
the path. Outside scope, raw `git` is the canonical alternative — the harness gates and the user sees the prompt.

**Authorization is two-layered.** Layer 1 is the mechanical wrapper check (scope-coverage; refuse code 11 on
mismatch). Layer 2 is agent judgment within authorized scope: even when the wrapper would authorize, agent contract
codified in [DEV-RULES.ARC][dev-rules-arc] and workflow docs decides whether the wrapper or raw `git` is appropriate
for *this* specific invocation. Layer 1 is defensive backstop; in normal use the agent's tool selection prevents
code 11 from firing. Layer 2 is judgment-grained and not wrapper-enforced — its violations surface via behavior
drift, audit-log forensics, and user feedback, not via runtime refusal.

Example. Under `commit_interlock: on-task-approval`, the wrapper authorizes any agent commit invocation
(scope-coverage holds — {task-approval} ∩ {any commit} ≠ ∅). The agent's contract still requires raw `git commit`
for ceremony commits (handoff, activate, integrate, sweep), letting the harness prompt the user. A layer-2
violation — agent uses `arc release commit` for a ceremony under `on-task-approval` — passes the wrapper's
mechanical check and lands as a successful commit with an audit-log entry; the violation surfaces forensically, not
at the wrapper boundary.

**Code 11 remediation hints encode the framing.** When the wrapper refuses with code 11, the message routes the
agent toward raw `git` first ("use raw `git commit` instead") and configuration escalation second ("or set
`<key>: on-workflow` to authorize"). Primary remediation reflects the prompt-vs-bypass model: most code 11 firings
are scope-mismatches where raw `git` (the harness-prompt path) is the right tool. Configuration escalation is
secondary because it requires the user to deliberately widen permission, which is the rarer correct response.

## Consequences

### Positive

- The interlock vocabulary stays uniform across axes. Adding a new agent-mediated workflow event does not require
  a new per-axis interlock value — `on-workflow` already authorizes it. CLI / yaml / git-config schema evolution
  decouples from workflow evolution.
- Forward-compatibility is structural, not migration-driven. `sync_interlock: on-workflow` reserves the
  authorization slot for workflow-driven sync (worktree-create, future workflow events) without requiring a schema
  bump or adopter-visible config change when the events land.
- The wrapper logic stays mechanically simple. Scope-coverage is a one-line set-overlap check; the wrapper carries
  no workflow knowledge and inherits no churn from workflow evolution.
- `commit_interlock: on-task-approval` semantics are preserved unchanged — the same value already worked as a
  trigger set; the trigger-set framing names what was always true.
- Defaults remain conservative. `manual` and `on-{primary}` are the out-of-box values; `on-workflow` is an explicit
  opt-in. No adopter sees a behavior change without changing config.
- The prompt-vs-bypass framing aligns with the [ADR-017][adr-017] trust contract. Documentation
  ([DEV-RULES.ARC][dev-rules-arc] § Commit Discipline, AGENT-BRIEF.ARC, QUICK-REFERENCE) holds the same line:
  configuration controls bypass paths, not commit permission.
- Code 11 messages route adopters toward the correct fallback (raw `git` first), which preserves the harness-prompt
  path as the canonical alternative and makes config escalation a deliberate, secondary action.

### Negative

- Layer 2 has no mechanical enforcement. Agents using `arc release commit` for ceremony commits under
  `on-task-approval` succeed at the wrapper boundary; the misuse surfaces only via behavior drift, audit-log
  forensics, or user feedback. The [ADR-017][adr-017] trade-off table already accepts this; the trigger-set model
  does not add new layer-2 surface but also does not close the gap.
- Adopters configuring `on-workflow` widen the wrapper's authorize set without seeing the specific events that
  newly land in scope. A future workflow firing the wrapper under `on-workflow` is authorized retroactively for any
  adopter who set the value. The surface is structural to forward-compatibility, but adopters need to read the
  trigger-set framing to recognize this property.
- The ladder vocabulary requires education. `manual < on-{primary}` < `on-workflow` is straightforward, but the
  trigger-set framing — values as sets, not single triggers — is the load-bearing concept. Documentation has to
  carry it; intuition alone reads `on-task-approval` as a single trigger, not as the set {task-approval}.
- `sync_interlock: on-workflow` is currently a no-op aliasing of `on-handoff`. Adopters who set it today observe
  no behavioral difference until the first workflow-driven sync lands. The reserved-value posture is load-bearing
  for forward-compat, but adopters reading the config without context may treat it as redundant.

### Risks

- *Layer-2 drift under `on-workflow`.* Once `on-workflow` is set, both task-work and ceremony commits authorize at
  the wrapper boundary. If agents adopt the wrapper for invocations the codified workflow does not call for (e.g.,
  `arc release commit` for ad-hoc commits the user invoked manually), the audit log captures the misuse but no
  real-time signal fires. Mitigation: keep the audit log queryable, surface forensic patterns in ergonomics-WU
  adopter docs, re-evaluate if dogfooding shows recurring drift.
- *Trigger-set framing misread as single-trigger names.* If documentation drifts toward "configure
  `on-task-approval` to autofire on task-approval" without naming the trigger-set framing, the adopter mental model
  loses the values-as-sets property — and `on-workflow` becomes opaque (which workflow? which trigger?).
  Mitigation: this ADR is the canonical framing; downstream documentation references it rather than inventing
  parallel framing.
- *Future workflows expanding the workflow trigger set silently.* `on-workflow` authorizes any agent-mediated
  workflow event; new workflows landing in subsequent WUs join the trigger set without an adopter-visible config
  change. Mitigation: each WU adding workflow-mediated wrapper invocations must call out the addition explicitly in
  its release notes / docs surface so adopters who set `on-workflow` see the new event surface.
- *Code 11 fatigue.* If agent contracts permit too many wrapper-eligible invocations under tight scopes, code 11
  fires often and adopters may set `on-workflow` reflexively to silence it rather than as a deliberate permission
  widening. Mitigation: the agent's contract is the load-bearing layer-2 surface; codify raw-`git`-vs-wrapper
  selection in [DEV-RULES.ARC][dev-rules-arc] § Commit Discipline so layer-2 carries the judgment correctly and
  code 11 fires only on genuine scope-mismatches.

### Alternatives Considered

- *Per-axis specific values.* Add `commit_interlock: on-ceremony`, `push_interlock: on-integrate`,
  `sync_interlock: on-worktree-create` etc. as workflow events surface. Rejected — fragments the interlock
  vocabulary along axis-specific lines, requires schema-axis evolution per workflow event, and forces forward-compat
  through CLI/yaml/git-config migrations rather than a stable reserved value. The trigger-set superset captures the
  same authorization with one uniform value.
- *Runtime-context detection in the wrapper.* Have the wrapper read caller hints, inspect workflow state, or infer
  intent from active-WU context to distinguish task-work from ceremony at invocation time. Rejected — encodes
  workflow knowledge in the wrapper that workflows already carry; couples the wrapper to workflow shape; produces
  a larger surface to test (per-context branches across the refusal cascade); and the decoupling buys nothing the
  layer-2 contract does not already provide.
- *Single-trigger values only (no `on-workflow`).* Keep the existing two-value enum and require workflows to invoke
  wrappers with explicit per-event opt-in flags. Rejected — pushes the trigger-set decision into every workflow
  rather than centralizing it in config, breaks the symmetric-ladder framing across axes, and duplicates per-event
  opt-in surface in workflow code.
- *Permission-grant UX framing.* Document the wrapper as granting commit permission; code 11 as "permission
  denied." Rejected — conflicts with the [ADR-017][adr-017] trust contract (validation is unconditional; the flag
  is observability, not a kill-switch) and obscures the harness-prompt fallback path. Adopters who internalize
  "permission denied" framing reach for config escalation as the primary remediation; the prompt-vs-bypass framing
  routes them to raw `git` first, which preserves the user's prompt-driven review.

---

[adr-016]: adr-016-configurable-autonomy-interlocks-for-session-operations.md
[adr-017]: adr-017-release-wrapper-trust-model.md
[dev-rules-arc]: ../constitution/DEV-RULES.ARC.md
