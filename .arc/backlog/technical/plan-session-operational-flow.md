# Plan: Session-Operational Flow (Gate Model)

## Problem / Motivation

[ADR-016][adr-016] establishes the gate model for ARC's session-operational flow — a linear autonomy stack
(task → commit → push → integrate) with invariant endpoints and configurable middle rungs, plus handoff as an
orthogonal human-invoked ceremony. This plan executes that framing: lands the constitutional amendments, implements
the core gate-model mechanics (auto-commit, auto-push, handoff-interior configurability), and ships the reversibility
protocol.

Without this plan:

- Multiple upstream plans ([plan-user-sync-ux][plan-sync], [plan-quality-gate-hooks][plan-hooks],
  [plan-worktree-foundation][plan-wf], [plan-concurrent-work-conventions][plan-cwc],
  [plan-agile-wu-lifecycle][plan-awl]) each tackle session-operational facets without a shared frame. Symptom:
  local fixes that don't compose (the `user.sync_push: always` incoherence is the canonical example).
- The constitutional reframing (commit control from non-negotiable to configurable default) has no home — it belongs
  with the frame, not buried in a downstream implementation plan.
- Status-file churn and other per-commit bookkeeping costs persist because the architectural shift to
  handoff-consolidated state has no carrier.

This plan is **framing execution plus core behavior modes**. Domain-specific gate consumers (notes-sync mechanics,
quality-hook placement details, mobility autonomy ergonomics) are out of scope; upstream plans own their facets.

## Concurrency Model

ARC's concurrency model is **parallel sessions, one WU per session, with shift as the in-session escape hatch for
short detours.** Multi-WU within a single session is the shift-detour case — atomic-tier work or brief
metadata-only pivots — not the dominant pattern. Concurrent work means multiple sessions, each scoped to one
WU/worktree/branch with isolated SESSION-NOTES; sessions don't interact internally except at boundaries
(spawning new WUs, sweep ceremonies, planning).

This framing is foundational for downstream plans:

- [plan-worktree-foundation][plan-wf] — spawn vs continue separation operates within this model
- [plan-concurrent-work-conventions][plan-cwc] — focus-role, blessed pairings, swap discipline assume parallel-
  session as the dominant case
- [plan-user-sync-ux][plan-sync] — sync semantics designed around per-worktree per-session
- [plan-agile-wu-lifecycle][plan-awl] — tier-aware worktree usage flows from this model

External research (2026-04-28, agentic-coding tracking conventions) confirms this space is genuinely unsettled —
no dominant industry pattern dictates session/WU mapping. ARC's choice is principled rather than conformant.

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
(approval vs. iteration). Formalizes what counts as "approval" at each gate level. Specifies the "approved"
grammar with strict disambiguation per § Design Decisions.

**Auto-commit mode.** Skill/workflow implementation; interaction with `prepare-commits` (simple-path-only auto-
commit, complexity bumps to manual-with-prompt); atomicity-preservation under autonomy.

**Auto-push mode.** Distinct-signal handling, push-gate mechanics, prerequisites, interaction with auto-commit mode.
Push-timing default is handoff-only (with per-commit available as power-user opt-in) per § Design Decisions.

**Reversibility/rollback protocol.** Design and implementation. Mechanism shape (dev-rule vs. skill vs. workflow vs.
combination) resolves during PRD drafting. Rollback scope is session-local (not identity-global) — rollback in one
session doesn't reach into other sessions' commits/pushes. First-class support, not ad-hoc documentation.

**Deferred-review × auto-commit interaction.** Resolved per § Design Decisions: safe-accumulate (auto-commit does
not fire per task within a deferred range; tasks accumulate for user review on return). Per-task auto-commit
inside a deferred range available only via explicit instruction at deferral time.

**Session-init load-set adapts to autonomy config.** When auto-commit is configured, session-init eagerly loads
commit-format and commit-context-format methods to prevent per-cycle method-load overhead in a hot path. These
methods today load via the arc-commit skill; auto-commit fires between tasks without invoking the skill, so
session-init becomes the load-trigger. Strategy-session-operations updates accordingly.

**Metadata-state foundation for WU lifecycle.** Constitutional foundation that downstream lifecycle plans
(particularly [plan-agile-wu-lifecycle][plan-awl]) implement against:

- `**State:**` enum stays semantically narrow: `In Progress | Complete | Paused | Superseded` (existing values,
  execution-state only)
- New optional `**Integration:**` field carries transient workflow position during the integration window:
  `PR review | Review fixes | Ready to merge | Merged`. Cleared at sweep
- Sweep eligibility: `State: Complete + Integration: Merged`. After sweep, file is removed from `active/` —
  location reflects state without an `Archived` value
- Sweep cadence is configurable: default sweep-as-you-go (archive ops in integration PR as separate commit per
  multi-commit-PR norms), opt-in deferred (archive batched with next-WU planning or standalone). Config key TBD
  (likely `archive.cadence: with-integration | deferred | manual`)

This model resolves the inbox concern about stale tracking docs (ROADMAP/PROJECT-STATUS update at integration
time, not post-merge) and the CodeRabbit-flagged contradictoriness of `State: Complete` coexisting with
integration-step `Next Action` fields.

**arc-commit skill preservation policy.** Skill remains user-invocable in both manual and auto modes. Under auto
mode, the skill provides ad-hoc commit capability for non-task work mid-session and for recovery after auto-commit
fallback. Auto-commit's internal logic mirrors the skill's simple-path branch and delegates to `prepare-commits`
when atomicity-test triggers fire (multi-concern, interleaved files, accumulated multi-session work) — at which
point the agent stops and prompts rather than silently invoking complex logic.

**Strategy doc cascade updates.** [`strategy-team-coordination`][strategy-team] (per-commit status-advance language
becomes stale); [`strategy-session-operations`][strategy-session] (session-state timing, autonomy-config-aware
load-set); others as surfaced.

### Out of scope — deferred to upstream/sibling plans

- **Worktree push + notes push pairing at push-gate / handoff-gate** — [plan-user-sync-ux][plan-sync] consumes the
  handoff-interior toggle framework to solve the `user.sync_push: always` incoherence.
- **Quality-gate hook placement within the gate model** — [plan-quality-gate-hooks][plan-hooks] already uses
  commit-gate / push-gate / pr-gate vocabulary; this plan establishes the shared model, hooks plan implements
  hook placement against it.
- **Multi-worktree mechanics and spawn-vs-continue semantics** — [plan-worktree-foundation][plan-wf] consumes the
  parallel-session framing here and implements the spawn semantics for new-WU creation.
- **Concurrent-work conventions consuming configurable autonomy** — [plan-concurrent-work-conventions][plan-cwc].
- **Integration-workflow rewrites and tier-aware sweep ceremony** — [plan-agile-wu-lifecycle][plan-awl]
  implements the metadata-state foundation against tier-aware lifecycle workflows.
- **Branch-gone resolution under auto modes** — non-applicable. Branch/worktree removal is high-stakes and falls
  outside the gate-model's "approval triggers cascade" because no preceding review attaches to the proposed action.
  Coord-probe / branch-gone resolution stays manual under all autonomy levels.

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

**Push timing (resolved):** handoff-only as recommended default; per-commit available as power-user opt-in with
documented warning. See § Design Decisions for full rationale. Config likely `push.timing: manual | on-handoff |
on-commit`; PRD finalizes shape and warning copy.

## Design Decisions

### Push timing: handoff-only default, per-commit available

Auto-push admits both per-commit and handoff-only cadence. Handoff-only is the recommended default for three reasons:

- **Pairing.** Worktree-push and notes-push need to land at the same gate; handoff is the natural pairing point per
  the handoff-interior toggle framework.
- **Stakes asymmetry per [ADR-016][adr-016].** Push is external-visible and less reversible than commit;
  concentrating into deliberate ceremony reduces accidental cascade surface.
- **Concurrent-session safety.** Under parallel sessions (per § Concurrency Model), multiple sessions writing to
  shared `refs/notes/arc/user/{identity}` near-simultaneously creates ref-update races. Handoff-only concentrates
  writes into deliberate single events; per-commit push compounds race surface linearly with commit cadence.

Per-commit push remains available as a documented power-user opt-in. PRD finalizes config shape and the warning
copy that accompanies opt-in.

### Approval-signal grammar: "approved" with strict disambiguation

Auto-commit mode is triggered by a small canonical token vocabulary (primary: `approved` / `approve`; PRD finalizes
synonyms — keep small). The grammar admits an optional postfix redirect:

- `approved` → commit + proceed-to-next-scheduled (next task, or next-phase first task at phase boundaries)
- `approved; {redirect}` → commit + execute redirect instead of next-scheduled. Examples: `approved; handoff`,
  `approved; switch to {WU}`, `approved; pause`

**Strict disambiguation rule.** If the same message contains any iteration directive ("but", "also", "actually",
change requests, questions), fall back to manual — don't auto-commit. Auto-commit fires only when the message
reduces to approval + optional redirect. Strict-by-default; if false-positives bite in practice, relax later.

**Phase boundaries.** Implicit auto-advance to next phase first task. Tier 2 quality gates fire as part of the
post-coherent-unit completion sequence; auto-commit waits for T2 to pass before firing. T2 failure blocks
auto-commit (matches [ADR-016][adr-016]'s "quality gate failures always stop").

**Session boundaries.** User-initiated via the redirect grammar (`approved; handoff`). Framework can't infer
session-end intent.

### Deferred-review × auto-commit: safe-accumulate

When a user defers review for a range of tasks (e.g., "work through tasks 5.2-5.4 while I'm away"), auto-commit
does NOT fire per task within the range. Tasks accumulate; user reviews and approves the accumulated work as a
unit when they return. This preserves the spirit of deferred review — user is away, no per-task approval available,
autonomous commits without review violate the gate model.

Per-task auto-commit inside a deferred range is available only via explicit instruction at deferral time
(e.g., "work through 5.2-5.4 with auto-commit per task while I'm away"). Default is safe-accumulate.

### Metadata-state model for WU lifecycle

The constitutional foundation establishes a State + Integration field model that downstream lifecycle plans
implement against. See § Scope → "Metadata-state foundation for WU lifecycle" for the full specification. Phase 7
delivers this foundation; [plan-agile-wu-lifecycle][plan-awl] implements the tier-aware lifecycle workflows
against it.

### Rollback scope: session-local, not identity-global

Reversibility/rollback (the protocol established under Phase 4) is session-scoped. Rollback in one session undoes
the cascade in *that* session — it doesn't reach into other sessions' commits or pushes. Under parallel sessions,
each session manages its own reversibility independently. This keeps rollback semantics simple and avoids
cross-session arbitration complexity.

### arc-commit skill stays user-invocable

The arc-commit skill remains a first-class user-invocable surface in both manual and auto modes. Under auto-commit,
the skill is the ad-hoc commit path for non-task work mid-session and for recovery after auto-commit fallback to
manual. Auto-commit's internal logic mirrors the skill's simple-path branch; complexity bumps to manual-with-prompt
rather than silent invocation of `prepare-commits`.

## Unknowns and Assumptions

**Open design decisions (PRD-time resolution):**

- Final autonomy axis naming and value enum (see Alternatives).
- Reversibility mechanism shape (see Alternatives).
- Specific approval-signal mechanics per gate (see Alternatives) — the "approved" grammar shape is settled per
  § Design Decisions; remaining is final token catalog and the exact disambiguation regex/heuristic.
- Handoff-interior toggle enumeration — exact list of configurable handoff actions (status rotation, worktree push,
  notes push, quality-gate finalization, others TBD).
- Whether constitutional reframing warrants a new DEV-RULES.ARC section or fits within existing § Commit Discipline
  and § Session Management amendments.
- Final config keys for push timing (`push.timing` shape) and sweep cadence (`archive.cadence` shape) — § Design
  Decisions establishes the conceptual shape; PRD finalizes naming and value enums.
- Exact field/value names for the State + Integration field model — § Scope establishes the conceptual shape; PRD
  finalizes field labels and enum values.

**Assumptions to validate during PRD:**

- Default `manual-commit` mode preserves current behavior exactly — no behavioral drift acceptable for existing users.
- The gate model's four gates are the right decomposition — no fifth gate emerges during implementation (e.g.,
  "stage-gate" between task and commit).
- Handoff-as-orthogonal composes cleanly with all lifecycle workflows (activate, deactivate, rotate, integrate,
  archive). If any workflow reads poorly under the new timing rules, the split needs refinement.
- The downstream consumer plans (sync UX, hooks, worktree-foundation, concurrent-work-conventions, agile-WU-
  lifecycle) can consume this frame without requiring structural changes to their own scope beyond what's already
  captured in their reshape notes.

## Scope Estimate

**Large.** Constitutional-level amendments with broader reach than typical. Touches DEV-RULES.ARC, multiple
workflows, multiple strategy docs, configuration schema, skills, and tests.

### Phases (provisional)

1. **Constitutional foundation** (doc-level, low-risk) — [ADR-016][adr-016] landing, DEV-RULES.ARC amendments,
   constitutional reframing language, parallel-session concurrency model framing, minimal-but-necessary cascade to
   strategy docs to prevent contradiction.
2. **Status-file timing split** — Rotation-vs-shape field split rules, workflow updates (process-task-loop,
   lifecycle workflows, session-handoff), strategy doc prose updates.
3. **Configuration surface + approval-signal vocabulary** — Axis naming and schema, signal classes per gate,
   "approved" grammar with strict disambiguation, session-init load-set autonomy-config-aware adaptation, default
   values matching current behavior.
4. **Reversibility / rollback protocol** — Mechanism design and implementation, session-local scope (prerequisite
   for Phase 5).
5. **Auto-commit mode** — Skill/workflow implementation, `prepare-commits` simple-path-only integration with
   complexity-bumps-to-manual fallback, deferred-review × auto-commit safe-accumulate resolution, arc-commit skill
   preservation as user-invocable surface, tests.
6. **Auto-push mode + handoff-interior toggles** — Push-gate signal handling, handoff-only push as recommended
   default with per-commit power-user opt-in, handoff ceremony configurability, workflow integration points,
   defaults.
7. **Strategy cascade + metadata-state foundation + integration specs** — Comprehensive cascade update;
   metadata-state foundation (State + Integration field model + sweep cadence config) for downstream lifecycle
   plans to consume; integration specs for upstream plans; verification.

Phase 4 gates Phases 5-6 (reversibility must land before auto-cascade modes ship). Phases 1-3 are relatively
independent and could overlap if scoped carefully.

### Dependencies

- **[ADR-016][adr-016] in Accepted state** — framing must be settled before execution.
- **Session-Init Optimization WU completion** — in-progress; ideally completes and merges before this plan's
  implementation phases begin, since it touches overlapping surface area (session-init, session-handoff,
  DEV-RULES.ARC edits). Phase 1 can start once session-init-optimization closes.
- **No dependency on downstream consumer plans** — they consume this frame, not the reverse.

### Downstream consumption

- **[plan-user-sync-ux][plan-sync]** — smallest consumer; reshapes to consume the handoff-interior toggle framework
  (Phase 6). Could ship immediately after that phase lands.
- **[plan-quality-gate-hooks][plan-hooks]** — already uses gate vocabulary; consumes the configuration surface
  (Phase 3) for per-gate hook configuration.
- **[plan-worktree-foundation][plan-wf]** — consumes the parallel-session concurrency model framing (Phase 1) and
  the metadata-state foundation (Phase 7). Spawn-vs-continue semantics build on the framing.
- **[plan-concurrent-work-conventions][plan-cwc]** — consumes configurable autonomy (Phases 3, 5, 6) as the
  mechanism for reducing approval ceremony under multi-session load. Can ship in parallel once Phase 3 lands.
- **[plan-agile-wu-lifecycle][plan-awl]** — consumes the metadata-state foundation (Phase 7) and the
  status-file timing split (Phase 2) for tier-aware integration/sweep workflow rewrites.

### Scheduling

**After Session-Init Optimization, before the downstream consumer plans.** Sequencing rationale:

- Phase 1 (constitutional foundation, including parallel-session concurrency model) must land before downstream
  plans commit to specific designs, so their scope doesn't shift under them.
- Phases 2-3 (timing split + config surface) establish the infrastructure downstream plans consume.
- Phase 7 (metadata-state foundation) must land before [plan-agile-wu-lifecycle][plan-awl]'s integration-workflow
  restructure begins.
- Phases 4-7 can run alongside downstream plans' early phases — reversibility and auto modes don't block
  consumers of the frame itself, except for the metadata-state foundation dependency above.

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
[plan-wf]: plan-worktree-foundation.md
[plan-awl]: plan-agile-wu-lifecycle.md
[plan-cwc]: ../feature/plan-concurrent-work-conventions.md
