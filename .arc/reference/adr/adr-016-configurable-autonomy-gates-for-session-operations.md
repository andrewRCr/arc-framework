# ADR-016: Adopt Configurable Autonomy Gates for Session Operations

## Status

Accepted

## Context

ARC's session-operational concerns — task review, commits, quality gates, worktree and notes sync, status-file updates,
session handoff, and integration — were each designed against their own immediate problem. They don't compose into a
shared model, and the resulting incoherences surface as design friction.

The visible symptom is the worktree/notes sync gap. The `user.sync_push: always` option pushes git notes but not the
underlying worktree, so notes can attach to commits that don't exist on origin. The fix requires pairing notes-sync
with worktree-sync as peer concepts — but ARC has no shared frame in which to do that. [plan-user-sync-ux][plan-sync]
scopes a focused fix; the gap itself is one instance of a broader pattern.

Other instances:

- Status-file updates happen per commit, but the consumer (next session's `session-init`) only reads tip state.
  Intermediate snapshots are churn — produced but never consumed.
- Commit control is stated in [DEV-RULES.ARC][dev-rules-arc] as a non-negotiable principle, but it functions as a
  sensible default. The real invariant is that the agent doesn't cross the merge-to-main boundary without the human.
- Multiple upstream plans ([plan-user-sync-ux][plan-sync], [plan-quality-gate-hooks][plan-hooks],
  [plan-worktree-foundation][plan-wf], [plan-concurrent-work-conventions][plan-cwc],
  [plan-agile-wu-lifecycle][plan-awl]) each tackle session-operational facets, but without a shared frame they
  risk local fixes that don't compose — and worktree mobility amplifies the pressure past what per-commit approval
  ceremony can absorb without smoothing.

**Core insight:** Review is always human. The design axis is how many follow-on operations a single human approval
triggers, not whether approval happens. Integration — merge to the integration branch or main — is the invariant
human floor. Everything upstream is a candidate for configurable machinery.

**Industrial precedent reviewed.** External research across CI/CD, monorepo tooling, VCS workflows, and IaC autonomy
confirmed the core pattern. Graduated autonomy with fixed human endpoints is idiomatic (Spinnaker manual judgment,
GitHub Environments protection rules, GitLab protected environments, Atlantis, Terraform, Pulumi). Default-strict with
opt-in automation is the dominant safety posture (Husky, Terraform apply, GitHub deployment approvals). Signal strength
scaling with stakes has precedent from `terraform apply -auto-approve`'s invocation-visible flag to Kubernetes GPG-signed
release tags. Boundary-consolidated state updates (Conventional Changelog, semantic-release) are industry consensus over
per-commit metadata churn.

Three points require honest framing rather than validation:

- *Merge to main is universally human-gated; production deploy varies.* High-maturity organizations automate production
  deploys behind observability, canary analysis, and rollback — not human abdication. ARC's integration-gate means
  merge, not deploy.
- *Approval-bundled machinery has precedent but industry trends toward separation where execution has external
  visibility and low reversibility.* Bundling is idiomatic for local/reversible operations (pre-commit hooks,
  `git commit -am`); stakes asymmetry warrants a distinct signal. ARC adopts distinct-signal-per-intent rather than
  two-act separation because no equivalent state change occurs between ARC's commit and push events (unlike GitHub
  Merge Queue, where CI re-runs against rebased state during separation).
- *Orthogonal ceremony (session handoff as off-stack ritual) has no direct VCS-tooling precedent.* Closest analogues
  are developer shutdown rituals and Graphite's submit-stack gate, but neither is a structural match. This is a design
  judgment, adopted because it reduces accidental cascade surface and consolidates next-session-serving bookkeeping
  into a single explicit act.

**Alternatives considered:**

- *Maintain the current model; fix sync, quality, and mobility concerns independently.* Rejected — symptoms recur
  under individual fixes because they share a missing frame.
- *Expand `plan-user-sync-ux` to absorb the gate model.* Rejected — the constitutional reframing (commit control as
  default, not principle) shouldn't be buried inside an implementation plan.
- *Autonomy tiers that include skipping task review.* Rejected — inconsistent with ARC's identity. Deferred review is
  a bounded convenience; it is not an autonomy tier.
- *Full separation of approval from execution at the push-gate (two human acts).* Rejected for the reason above —
  absent a state-change checkpoint between the acts, separation introduces friction without new information to
  inspect.

## Decision

Adopt a gate model for session-operational flow.

**Linear autonomy stack** (task → commit → push → integrate):

- **Task-gate** — invariant. Every review increment receives explicit human approval. Not configurable. Deferred
  review remains a bounded, user-scoped convenience.
- **Commit-gate** — configurable. Default: manual (explicit commit invocation). Optional: auto on approval (approval
  implicitly triggers atomic commit with ARC standards).
- **Push-gate** — configurable. Default: manual. Optional: auto on approval, requiring a distinct signal from
  commit-gate approval. The distinct signal reflects stakes asymmetry — push is external-visible and less reversible
  than local commit.
- **Integration-gate** — invariant. Human-only. Non-negotiable floor. For ARC, integration means merge to the
  integration branch or main. Downstream production deployment is outside ARC's scope.

**Orthogonal ceremony:**

- **Session handoff** is always human-invoked. *Inside* handoff, individual actions are configurable: status-file
  rotation, worktree push, notes push, quality-gate finalization. Handoff is not a rung in the autonomy ladder; it
  consolidates next-session-serving bookkeeping into a single explicit ritual.

**Constitutional reframing:**

- "AI never initiates commits without explicit user approval" ([DEV-RULES.ARC][dev-rules-arc] § Commit Discipline)
  downgrades from non-negotiable principle to configurable default.
- Real invariants elevated: task-gate review and integration-gate human authority.

**Cascading rules:**

- *Status-file timing.* Status-file updates fire only at session-handoff commits and workflow-ceremony commits
  (activate / integrate / sweep / deactivate / PRD generation / planning lifecycle operations). Task-completion
  code commits never touch the status file. This aligns state-change with the consumer boundary, eliminates
  per-commit metadata churn, and removes the per-commit shape/rotation judgment call.
- *Quality-gate failures always stop* regardless of autonomy level. The user approves the work, not bypassing gates.
- *Approval signal vocabulary.* Each gate specifies a signal class required to cross it. Specific mechanics (phrases,
  typed confirmations, invocation commands) are scoped to the accompanying [plan-session-operational-flow][plan-ops].
  At this ADR's level: task-gate and commit-gate admit natural-language approval; push-gate requires a distinct signal
  unambiguously scoping the push intent.
- *Bundled-cascade safety requirements.* When approval triggers a cascade (auto-commit or auto-commit+push):
  cascaded actions must be idempotent and reversible where possible; the cascade must be visibly logged so the user
  sees what one approval triggered; a step-through mode must remain available as an escape hatch for high-stakes
  work.
- *Reversibility and rollback is a first-class concern.* ARC provides protocol-level support for undoing bundled
  cascades. Mechanism (dev-rule, skill, workflow, or combination) is scoped to the accompanying plan; this ADR
  establishes the requirement.

## Consequences

### Positive

- Multiple upstream plans ([plan-user-sync-ux][plan-sync], [plan-quality-gate-hooks][plan-hooks],
  [plan-worktree-foundation][plan-wf], [plan-concurrent-work-conventions][plan-cwc],
  [plan-agile-wu-lifecycle][plan-awl]) gain a shared frame. Each becomes smaller and internally coherent.
- Worktree/notes sync consistency becomes expressible — both operations pair at the same gate.
- Status-file churn is eliminated for task-completion commits; commit atomicity story clarifies.
- Concurrent-session and multi-worktree ergonomics become configurable to the user's tolerance, without eroding
  per-task review discipline.
- Constitutional rule count reduces; the principle/default boundary clarifies.
- ARC's natural concurrency ceiling (per-task approval bounds practical parallelism) aligns with ARC's positioning as
  attention-economy over throughput-optimization. The ceiling is a designed feature, not a limitation.
- Default-strict, opt-in-loose posture matches industrial safety conventions. Safety gates cannot be default-off.

### Negative

- [DEV-RULES.ARC][dev-rules-arc] amendment is broader than typical (§ Commit Discipline + § Session Management).
- Team-coordination strategy prose needs cascade updates — current per-commit status-advance language becomes stale.
- Configuration surface area expands (autonomy-mode axis, approval-signal formalization, handoff-interior toggles).
- `prepare-commits` workflow needs fallback semantics for auto-commit when commit shape is ambiguous (discovery-heavy
  tasks, interleaved concerns).
- Deferred-review × auto-commit interaction requires explicit resolution. Two readings are defensible; the
  accompanying plan will resolve.

### Risks

- *Approval-signal ambiguity in practice.* "Looks good, but also tweak X" is iteration, not approval. Mitigation:
  explicit signals required at higher autonomy levels; natural-language tolerance preserved only in default (manual)
  mode.
- *Auto-commit producing bad atomic commits on complex tasks.* Mitigation: graceful fallback to dialogue when
  `prepare-commits` complexity triggers fire.
- *Handoff-only status rotation widens the crash-recovery gap.* Mid-session crash leaves rotation fields stale
  relative to task-list state. Mitigation: the existing trust hierarchy (task list > status file) in session-init
  already handles this — a rare fallback becomes a regular code path, arguably healthier for the trust hierarchy's
  robustness overall.
- *Orthogonal-handoff ceremony lacks industrial precedent.* Mitigation: treat as a design judgment and monitor during
  implementation. Revisit if the orthogonal framing produces friction.

## Amending This Document

<!-- This ADR follows the three-tier amendment model from strategy-adr-methodology.md. See the template for the full
guidance. This section is a placeholder for dated amendment annotations if post-implementation learnings surface. -->

---

[dev-rules-arc]: ../constitution/DEV-RULES.ARC.md
[plan-ops]: ../../backlog/technical/plan-session-operational-flow.md
[plan-sync]: ../../backlog/technical/plan-user-sync-ux.md
[plan-hooks]: ../../backlog/technical/plan-quality-gate-hooks.md
[plan-wf]: ../../backlog/technical/plan-worktree-foundation.md
[plan-cwc]: ../../backlog/feature/plan-concurrent-work-conventions.md
[plan-awl]: ../../backlog/technical/plan-agile-wu-lifecycle.md
