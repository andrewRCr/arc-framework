# ADR-016: Adopt Configurable Autonomy Interlocks for Session Operations

## Status

Accepted

## Context

ARC's session-operational concerns — task review, commits, quality gates, worktree and notes sync, status-file updates,
session handoff, and integration — were each designed against their own immediate problem. They don't compose into a
shared model, and the resulting incoherences surface as design friction.

The visible symptom is the worktree/notes sync gap. The `user.sync_push: always` option pushes git notes but not the
underlying worktree, so notes can attach to commits that don't exist on origin. The fix requires pairing notes-sync
with worktree-sync as peer concepts — but ARC has no shared frame in which to do that. `prd-user-sync-ux.md`
scopes a focused fix; the gap itself is one instance of a broader pattern.

Other instances:

- Status-file updates happen per commit, but the consumer (next session's `session-init`) only reads tip state.
  Intermediate snapshots are churn — produced but never consumed.
- Commit control is stated in [DEV-RULES.ARC][dev-rules-arc] as a non-negotiable principle, but it functions as a
  sensible default. The real invariant is that the agent doesn't cross the merge-to-main boundary without the human.
- Multiple upstream plans (`prd-user-sync-ux.md`, `plan-quality-gate-hooks.md`,
  `plan-worktree-foundation.md`, `plan-concurrent-work-conventions.md`,
  `plan-agile-wu-lifecycle.md`) each tackle session-operational facets, but without a shared frame they
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
  deploys behind observability, canary analysis, and rollback — not human abdication. ARC's integration-interlock means
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
- *Expand `plan-user-sync-ux` to absorb the model.* Rejected — the constitutional reframing (commit control as
  default, not principle) shouldn't be buried inside an implementation plan.
- *Autonomy tiers that include skipping task review.* Rejected — inconsistent with ARC's identity. Deferred review is
  a bounded convenience; it is not an autonomy tier.
- *Full separation of approval from execution at the push-interlock (two human acts).* Rejected for the reason above —
  absent a state-change checkpoint between the acts, separation introduces friction without new information to
  inspect.
- *Global canonical-token approval grammar (e.g., `approved` parsed in arbitrary user prose).* Rejected during
  implementation planning — see § Decision, "Approval signal vocabulary," for the structured-prompt alternative
  adopted in its place.

## Decision

Adopt an interlock model for session-operational flow.

**Vocabulary.** The autonomy stack uses **interlock** vocabulary: `task-interlock`, `commit-interlock`,
`push-interlock`, `integration-interlock`. Each interlock is an active control mechanism that holds progress until
released by an approval signal — semantics drawn from safety-engineering and control-systems usage of "interlock"
(precise hold-until-released framing). The term was chosen over alternatives:

- **Gate** — collides with ARC's existing quality-gate vocabulary (the tiered T1/T2/T3 validation system, with
  industry precedent in SonarQube and CD literature). Both interlocks and gates attach to the same architectural
  junctions (commit, push, integration); sharing a junction prefix encodes the location, differing suffix encodes
  the concern. `commit-gate` (validation deadline) and `commit-interlock` (approval mechanism) are different facets
  of the same junction and coexist cleanly.
- **Checkpoint** — carries save-state connotation (resumable progress, snapshot semantics) that doesn't match the
  active-control-mechanism semantics of an interlock.
- **Stage / step / phase** — too generic; doesn't convey the hold-until-released invariant.

Verb pairing: interlocks `release` / `engage` / `hold`. Auto-commit and auto-push *release* the relevant interlocks
under configured conditions. Approval signals *release*; quality-gate failures *hold*; manual mode means the interlock
is *engaged* by default until the user explicitly releases it.

**Linear autonomy stack** (task → commit → push → integrate):

- **Task-interlock** — invariant. Every review increment receives explicit human approval. Not configurable. Deferred
  review remains a bounded, user-scoped convenience.
- **Commit-interlock** — configurable. Default: manual (explicit commit invocation). Optional: auto on approval
  (approval implicitly triggers atomic commit with ARC standards).
- **Push-interlock** — configurable. Default: manual. Optional: auto-at-handoff (push fires inside the handoff
  ceremony when configured). Mid-session push remains explicit-ask only; there is no per-commit auto-push.
- **Integration-interlock** — invariant. Explicit human approval required. Non-negotiable floor.
  For ARC, integration means merge to the integration branch or main. Downstream production deployment is outside
  ARC's scope.

**Orthogonal ceremony:**

- **Session handoff** is always human-invoked. *Inside* handoff, individual actions are configurable: status-file
  rotation, worktree push, notes push, quality-gate finalization. Handoff is not a rung in the autonomy ladder; it
  consolidates next-session-serving bookkeeping into a single explicit ritual.

**Constitutional reframing:**

- "AI never initiates commits without explicit user approval" ([DEV-RULES.ARC][dev-rules-arc] § Commit Discipline)
  downgrades from non-negotiable principle to configurable default.
- Real invariants elevated: task-interlock review and integration-interlock human authority.

**Cascading rules:**

- *Status-file timing.* Status-file updates fire only at session-handoff commits and workflow-ceremony commits
  (activate / integrate / sweep / deactivate / PRD generation / planning lifecycle operations). Task-completion
  code commits never touch the status file. This aligns state-change with the consumer boundary, eliminates
  per-commit metadata churn, and removes the per-commit shape/rotation judgment call.

  *Tradeoff.* Handoff produces a dedicated `chore(status): handoff …` commit not bundled with code. This isn't
  "dangling" — it's a clear session-boundary marker, naturally atomic, conventional-commit-friendly, and visible
  in PR history as the explicit handoff point. Reviewers benefit (code commits stay focused on code; status
  commits stay focused on pointer state). Auto-commit benefits (auto-fire scope is code-only, never has to
  maintain status consistency mid-stream). The rule is simpler than prior shape-vs-rotation field splits because
  workflow-ceremony commits become the only shape-change vector under the interlock model.

- *Quality-gate failures always stop* regardless of autonomy level. The user approves the work, not bypassing gates.

- *Approval signal vocabulary.* Each interlock specifies a signal class required to release it.

  **Task-interlock and commit-interlock** admit affirmative responses to agent-emitted structured prompts. The
  agent ends each task-completion message with a boundary-aware prompt — `Proceed to Task X.Y?` (manual mode) or
  `Commit and proceed to Task X.Y?` (auto-commit configured). The user's first-word affirmative (`y` / `yes` /
  `yeah`) in response IS the release signal. Anything else falls to manual handling. Redirect grammar — `y; handoff`,
  `y, also <X>` — composes naturally into the response space.

  **Push-interlock** requires an explicit signal unambiguously scoping the push intent. Mid-session: natural-language
  push request ("push this", "push to origin"). At handoff: the handoff invocation itself, when push timing is
  configured to auto-at-handoff. There is no per-commit auto-push and no canonical push phrase or skill.

  *Approach rationale.* The approval signal is **anchored** by the agent's prompt rather than parsed from
  arbitrary user prose. A global token-grammar (e.g., `approved` parsed wherever it appears) must defend against
  colloquial uses ("approved, but also..." is iteration, not approval) via regex or denylist heuristics — parser
  surface that ages poorly. The structured prompt anchors what affirmation means at each boundary; no global parser
  surface is needed. Side benefit: UX consistency with the session-init orientation summary, which already ends
  with a structured "Awaiting direction — proceed to Next Action?" prompt. Adopting the same shape at task-completion
  makes the cognitive model uniform across ARC's session lifecycle.

  *Push-timing reasoning.* Auto-push-at-handoff is the only "automatic" path because three properties argue against
  per-commit auto-push:

    - **Pairing.** Worktree-push and notes-push need to land at the same release event; handoff is the natural
      pairing point per the handoff-interior toggle pattern. Push ordering is fixed: worktree first, then notes —
      notes attach to commits that must already exist on origin.
    - **Stakes asymmetry.** Push is external-visible and less reversible than local commit; concentrating into
      deliberate ceremony reduces accidental cascade surface.
    - **Concurrent-session safety.** Under parallel sessions, multiple sessions writing to shared
      `refs/notes/arc/user/{identity}` near-simultaneously creates ref-update races. Handoff-only concentrates
      writes into deliberate single events; per-commit auto-push would compound race surface linearly with commit
      cadence.

- *Bundled-cascade safety requirements.* When approval triggers a cascade (auto-commit or auto-commit+push):
  cascaded actions must be idempotent and reversible where possible; the cascade must be visibly logged (the agent
  narrates what fires) so the user sees what one approval triggered; a step-through mode must remain available as an
  escape hatch for high-stakes work.

- *Reversibility and rollback is a first-class concern.* ARC provides protocol-level support for undoing bundled
  cascades. In the implementing WUs, this lands as a DEV-RULES paragraph (session-local scope, manual-confirmation,
  no dedicated skill or log-file infrastructure in v1). The reduced surface reflects the actual problem size: agent
  conversation context plus conventional commit footers cover cascade-identification needs without dedicated tracking
  infrastructure. Promotion to a skill is a candidate future WU if dogfooding shows demand.

## Consequences

### Positive

- Multiple upstream plans (`prd-user-sync-ux.md`, `plan-quality-gate-hooks.md`,
  `plan-worktree-foundation.md`, `plan-concurrent-work-conventions.md`,
  `plan-agile-wu-lifecycle.md`) gain a shared frame. Each becomes smaller and internally coherent.
- Worktree/notes sync consistency becomes expressible — both operations pair at the same interlock with fixed
  ordering.
- Status-file churn is eliminated for task-completion commits; commit atomicity story clarifies.
- Concurrent-session and multi-worktree ergonomics become configurable to the user's tolerance, without eroding
  per-task review discipline.
- Constitutional rule count reduces; the principle/default boundary clarifies.
- ARC's natural concurrency ceiling (per-task approval bounds practical parallelism) aligns with ARC's positioning as
  attention-economy over throughput-optimization. The ceiling is a designed feature, not a limitation.
- Default-strict, opt-in-loose posture matches industrial safety conventions. Safety gates cannot be default-off.
- Approval-signal anchoring eliminates global-parser surface. No regex or denylist machinery for affirmation in
  arbitrary user prose; affirmation is anchored at agent-emitted prompts. Reduces parser-bug surface and aligns with
  ARC's existing session-init prompt pattern.

### Negative

- [DEV-RULES.ARC][dev-rules-arc] amendment is broader than typical (§ Commit Discipline + § Session Management plus
  a new § Autonomy Stack section consolidating the interlock model, autonomy axis, structured-prompt format, and
  rollback protocol).
- Team-coordination strategy prose needs cascade updates — current per-commit status-advance language becomes stale.
- Configuration surface area expands (autonomy-mode axis, structured-prompt format formalization, handoff-interior
  toggle pattern, composite handoff probe).
- `prepare-commits` workflow needs fallback semantics for auto-commit when commit shape is ambiguous (discovery-heavy
  tasks, interleaved concerns).
- Deferred-review × auto-commit interaction requires explicit resolution. Resolved as safe-accumulate (auto-commit
  does not fire per task within a deferred range; tasks accumulate for user review on return); per-task auto-commit
  inside a deferred range available only via explicit instruction at deferral time.

### Risks

- *Approval-signal ambiguity in practice.* The structured-prompt approach mitigates this by anchoring affirmations
  to agent-emitted prompts — any non-affirmative-first-word falls to manual handling, correctness-over-completeness
  by design. If false-negatives bite ("yeah, looks good" interpreted as iteration), relax the affirmative-word list
  later.
- *Auto-commit producing bad atomic commits on complex tasks.* Mitigation: graceful fallback to dialogue when
  `prepare-commits` complexity triggers fire.
- *Handoff-only status rotation widens the crash-recovery gap.* Mid-session crash leaves rotation fields stale
  relative to task-list state. Mitigation: the existing trust hierarchy (task list > status file) in session-init
  already handles this — a rare fallback becomes a regular code path, arguably healthier for the trust hierarchy's
  robustness overall.
- *Orthogonal-handoff ceremony lacks industrial precedent.* Mitigation: treat as a design judgment and monitor during
  implementation. Revisit if the orthogonal framing produces friction.

## Amending This Document

**2026-05-01 — Configuration shape refinement.** SOF planning kept this ADR's interlock model but refined the
config surface from a single ladder-shaped `session.autonomy` enum to two independent interlock-release settings:
`session.commit_interlock: manual | on-task-approval` and `session.push_interlock: manual | on-handoff`.

Rationale: the task-interlock remains invariant and is not configurable; the configurable mechanisms are the
commit-interlock and push-interlock. The single ladder incorrectly implied `auto-push` required `auto-commit`
and made it hard to express the valid adopter preference "push at handoff, but keep commits manually invoked."
The independent settings preserve ARC interlock vocabulary, avoid "auto" terminology that suggests agent-chosen
timing, and keep session handoff as an orthogonal ceremony rather than introducing a fifth handoff interlock.

This is a configuration-shape amendment, not a reversal of the decision. The interlock stack, structured
approval prompts, handoff-only push release, and invariant integration-interlock remain unchanged.

**2026-05-06 — Sync-interlock split and `on-X` vocabulary alignment.** User Sync UX work split
the push-release event into two layers and aligned the value enum with the framework-wide
`manual | on-X` shape (where `X` names the trigger event):

- **`session.sync_interlock: manual | on-handoff`** (default `on-handoff`). New configurable
  interlock. Gates whether session handoff invokes `arc sync` as part of the handoff ceremony,
  or surfaces unpushed state without firing.
- **`session.push_interlock: manual | on-sync`** (default `manual`). Value rename: `on-handoff` →
  `on-sync`. Push now releases on an `arc sync` event — handoff-driven sync (via
  `session.sync_interlock: on-handoff`), or explicit mid-session `arc sync` invocation.
- **`user.notes_push: manual | on-sync`** (with `prompt` opt-in for team mode). Renamed from
  `user.sync_push` and reshaped from `always | prompt | manual`. Releases under the same `on-sync`
  trigger as the push interlock.

Cascade: handoff event → sync, sync event → push and notes-push. Each interlock's `on-X` value
names its own trigger; `manual` at any layer halts the cascade at that point. `arc sync` running
mid-session is an explicit sync event — authorize-by-invocation. The interlock model and the
handoff-as-orthogonal-ceremony posture are unchanged; this amendment refines the configuration
surface so the cascade graph reads off config alone.

This is a configuration-shape amendment, not a reversal of the decision.

---

[dev-rules-arc]: ../constitution/DEV-RULES.ARC.md
