# Plan: Session-Operational Flow (Gate Model)

## Problem / Motivation

[ADR-016][adr-016] establishes the gate model for ARC's session-operational flow — a linear autonomy stack
(task → commit → push → integrate) with invariant endpoints and configurable middle rungs, plus handoff as an
orthogonal human-invoked ceremony. This plan executes that framing: lands the constitutional amendments, implements
the core gate-model mechanics (auto-commit, auto-push, handoff-interior configurability), and ships the reversibility
protocol.

Without this plan:

- Three upstream plans ([plan-user-sync-ux][plan-sync], [plan-quality-gate-hooks][plan-hooks],
  [plan-work-unit-mobility][plan-mobility]) each tackle session-operational facets without a shared frame. Symptom:
  local fixes that don't compose (the `user.sync_push: always` incoherence is the canonical example).
- The constitutional reframing (commit control from non-negotiable to configurable default) has no home — it belongs
  with the frame, not buried in a downstream implementation plan.
- Status-file churn and other per-commit bookkeeping costs persist because the architectural shift to
  handoff-consolidated state has no carrier.

This plan is **framing execution plus core behavior modes**. Domain-specific gate consumers (notes-sync mechanics,
quality-hook placement details, mobility autonomy ergonomics) are out of scope; upstream plans own their facets.

## Scope

### In scope

**Constitutional amendments.** [DEV-RULES.ARC][dev-rules-arc] § Commit Discipline (downgrade AI-never-commits from
principle to configurable default) and § Session Management (status-file timing split, handoff responsibilities
expansion). New section if needed for autonomy-mode axis description.

**Status-file timing split.** Rule definition; workflow updates (`3_process-task-loop.md`, `session-handoff.md`,
lifecycle workflows that retain commit-time status updates for shape-changing commits); cascade to strategy docs.

**Configuration surface.** Autonomy axis naming, value enum, schema validation, default values (matching current
behavior), per-developer override mechanism. Handoff-interior toggle framework for configurable actions inside handoff.

**Approval-signal vocabulary.** Signal classes per gate, concrete phrase/command catalog, disambiguation rules
(approval vs. iteration). Formalizes what counts as "approval" at each gate level.

**Auto-commit mode.** Skill/workflow implementation; interaction with `prepare-commits` (fallback-to-dialogue
criteria when commit shape is ambiguous); atomicity-preservation under autonomy.

**Auto-push mode.** Distinct-signal handling, push-gate mechanics, prerequisites, interaction with auto-commit mode.

**Reversibility/rollback protocol.** Design and implementation. Mechanism shape (dev-rule vs. skill vs. workflow vs.
combination) resolves during PRD drafting. First-class support, not ad-hoc documentation.

**Deferred-review × auto-commit interaction.** Resolve the two-readings ambiguity surfaced in
[ADR-016][adr-016] — safe-accumulate vs. ergonomic-commit-as-you-go.

**Strategy doc cascade updates.** [`strategy-team-coordination`][strategy-team] (per-commit status-advance language
becomes stale); [`strategy-session-operations`][strategy-session] (session-state timing); others as surfaced.

### Out of scope — deferred to upstream plans

- **Worktree push + notes push pairing at push-gate / handoff-gate** — [plan-user-sync-ux][plan-sync] consumes the
  handoff-interior toggle framework to solve the `user.sync_push: always` incoherence.
- **Quality-gate hook placement within the gate model** — [plan-quality-gate-hooks][plan-hooks] already uses
  commit-gate / push-gate / pr-gate vocabulary; this plan establishes the shared model, hooks plan implements
  hook placement against it.
- **Multi-worktree / parallel-session ergonomics consuming configurable autonomy** — [plan-work-unit-mobility][plan-mobility].
- **Integration-surface async-merge accommodation** — scoped for mobility (per capture during pre-PRD iteration).

## Alternatives

Most alternatives were resolved at the [ADR-016][adr-016] level (see that ADR's Alternatives Considered). Plan-level
open design choices:

**Autonomy axis shape:**

- **A — Single `session.autonomy` axis.** Values: `manual-commit | auto-commit | auto-push`. Cumulative — each
  higher value implies the lower's behaviors. Simple to reason about; default = `manual-commit` (current behavior).
- **B — Orthogonal toggles.** `commit.auto: bool`, `push.auto: bool`. More flexible (e.g., auto-push without
  auto-commit would be invalid, so flexibility is partly illusory). Matches `user.sync_push` pattern.
- **C — Hybrid.** Primary axis with override toggles. Overcomplicated for the current decision surface.

Current lean: Option A. PRD decision.

**Reversibility mechanism shape:**

- **A — Dev-rule only.** DEV-RULES.ARC establishes the rollback protocol; no new skill or workflow. Lightest. May
  leave adopter too much DIY surface if the protocol is intricate.
- **B — Dev-rule + dedicated `/arc-rollback` skill.** Rule establishes protocol; skill provides the operational
  mechanism. Moderate weight; matches existing ARC pattern (rule + skill) for user-facing operations.
- **C — Integrated into existing skills (`arc-commit`, `arc-handoff`).** Rollback surfaces where cascade originates.
  More intrusive; risks skill-scope creep.

Current lean: Option B. PRD decision, informed by how complex the rollback protocol turns out to be.

**Approval signal granularity for push-gate:**

- **A — Typed confirmation command.** `/arc-push` or similar explicit skill invocation. Maximum clarity.
- **B — Distinct approval phrase.** "ship it" / "push it" parsed by the agent as push-scope approval. Lower friction,
  relies on phrase discipline.
- **C — Both.** Skill preferred; phrase accepted. Most permissive.

Current lean: Option C, with skill as the primary surface and phrase as ergonomic fallback. PRD decision.

## Unknowns and Assumptions

**Open design decisions (PRD-time resolution):**

- Final autonomy axis naming and value enum (see Alternatives).
- Reversibility mechanism shape (see Alternatives).
- Specific approval-signal mechanics per gate (see Alternatives).
- `prepare-commits` fallback trigger criteria — what signals mark a commit as "complex enough to need dialogue"
  under auto-commit mode? Current `prepare-commits` complexity triggers (multi-session accumulated work, interleaved
  concerns) are a starting point; may need refinement for automation context.
- Handoff-interior toggle enumeration — exact list of configurable handoff actions (status rotation, worktree push,
  notes push, quality-gate finalization, others TBD).
- Whether constitutional reframing warrants a new DEV-RULES.ARC section or fits within existing § Commit Discipline
  and § Session Management amendments.

**Assumptions to validate during PRD:**

- Default `manual-commit` mode preserves current behavior exactly — no behavioral drift acceptable for existing users.
- The gate model's four gates are the right decomposition — no fifth gate emerges during implementation (e.g.,
  "stage-gate" between task and commit).
- Handoff-as-orthogonal composes cleanly with all lifecycle workflows (activate, deactivate, rotate, integrate,
  archive). If any workflow reads poorly under the new timing rules, the split needs refinement.
- The three upstream plans can consume this frame without requiring structural changes to their own scope beyond
  what's already captured in their reshape notes.

## Scope Estimate

**Large.** Constitutional-level amendments with broader reach than typical. Touches DEV-RULES.ARC, multiple
workflows, multiple strategy docs, configuration schema, skills, and tests.

### Phases (provisional)

1. **Constitutional foundation** (doc-level, low-risk) — [ADR-016][adr-016] landing, DEV-RULES.ARC amendments,
   constitutional reframing language, minimal-but-necessary cascade to strategy docs to prevent contradiction.
2. **Status-file timing split** — Rotation-vs-shape field split rules, workflow updates (process-task-loop,
   lifecycle workflows, session-handoff), strategy doc prose updates.
3. **Configuration surface + approval-signal vocabulary** — Axis naming and schema, signal classes per gate,
   default values matching current behavior.
4. **Reversibility / rollback protocol** — Mechanism design and implementation (prerequisite for Phase 5).
5. **Auto-commit mode** — Skill/workflow implementation, `prepare-commits` fallback integration, deferred-review
   interaction resolution, tests.
6. **Auto-push mode + handoff-interior toggles** — Push-gate signal handling, handoff ceremony configurability,
   workflow integration points, defaults.
7. **Strategy cascade + integration specs** — Comprehensive cascade update, integration specs for upstream plans
   to consume, verification.

Phase 4 gates Phases 5-6 (reversibility must land before auto-cascade modes ship). Phases 1-3 are relatively
independent and could overlap if scoped carefully.

### Dependencies

- **[ADR-016][adr-016] in Accepted state** — framing must be settled before execution.
- **Session-Init Optimization WU completion** — in-progress; ideally completes and merges before this plan's
  implementation phases begin, since it touches overlapping surface area (session-init, session-handoff,
  DEV-RULES.ARC edits). Phase 1 can start once session-init-optimization closes.
- **No dependency on the three upstream plans** — they consume this frame, not the reverse.

### Downstream consumption

- **[plan-user-sync-ux][plan-sync]** — smallest consumer; reshapes to consume the handoff-interior toggle framework
  (Phase 6). Could ship immediately after that phase lands.
- **[plan-quality-gate-hooks][plan-hooks]** — already uses gate vocabulary; consumes the configuration surface
  (Phase 3) for per-gate hook configuration.
- **[plan-work-unit-mobility][plan-mobility]** — consumes configurable autonomy (Phases 3, 5, 6) as the mechanism
  for reducing approval ceremony under multi-session load. Can ship in parallel once Phase 3 lands.

### Scheduling

**After Session-Init Optimization, before the three upstream plans.** Sequencing rationale:

- Phase 1 (constitutional foundation) must land before upstream plans commit to specific designs, so their scope
  doesn't shift under them.
- Phases 2-3 (timing split + config surface) establish the infrastructure upstream plans consume.
- Phases 4-7 can run alongside upstream plans' early phases — reversibility and auto modes don't block upstream
  consumers of the frame itself.

### Pre-approved split at PRD-drafting time

If the plan's scope proves larger than "large" after PRD drafting, split into:

- **WU-A: Frame + constitutional foundation** — Phases 1-3. Constitutional amendments, status-file timing split,
  configuration surface. Low-risk, doc-heavy, enables upstream plans to proceed.
- **WU-B: Autonomy modes + reversibility** — Phases 4-7. Auto-commit, auto-push, handoff-interior toggles,
  reversibility protocol, strategy cascade. Implementation-heavy, benefits from WU-A landing first.

Both halves are independently valuable; WU-A unblocks upstream plans even if WU-B takes longer to ship.

---

[adr-016]: ../../reference/adr/adr-016-configurable-autonomy-gates-for-session-operations.md
[dev-rules-arc]: ../../reference/constitution/DEV-RULES.ARC.md
[strategy-team]: ../../reference/strategies/arc/strategy-team-coordination.md
[strategy-session]: ../../reference/strategies/arc/strategy-session-operations.md
[plan-sync]: plan-user-sync-ux.md
[plan-hooks]: plan-quality-gate-hooks.md
[plan-mobility]: ../feature/plan-work-unit-mobility.md
